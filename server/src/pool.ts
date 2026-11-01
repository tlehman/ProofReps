// A pool of warm Lean REPLs, each with Mathlib imported, that checks Lean
// sources. This is the whole Lean backend: the HTTP server (main.ts), the
// content checker (scripts/verify.ts) and the CLI (scripts/lean.ts) all call
// `pool.check(code)`.
//
//  - Booting a REPL (`import Mathlib`) takes a few seconds, so it happens once,
//    at server start, for every worker. A check then only elaborates its own
//    code on top of the imported environment: milliseconds for an exercise.
//  - The REPL keeps every environment it has made, so a worker's memory grows
//    with use. After MAX_USES checks, or past MAX_RSS, it's replaced: the
//    replacement boots first, so the pool never loses capacity.
//  - A check that runs past the timeout (an `#eval` that loops, a huge
//    `decide`) kills its worker; a fresh one takes its place.
//  - Results are deterministic, so they're cached (LRU): moving the cursor
//    back to a line you've seen, or pressing Check after a probe, is free.
import { leanEnv, Repl, ReplDied, ReplTimeout, sandboxed, type LeanEnv } from "./repl";

export interface Message {
  severity: string; // "error" | "warning" | "information"
  text: string;
  line?: number;
  col?: number;
  endLine?: number;
  endCol?: number;
  parse?: boolean; // a syntax error (from Lean's parser, not the elaborator)
}
export interface CheckResult {
  messages: Message[];
  ms: number; // time Lean spent on it (0 when cached)
  cached?: boolean;
}

export interface PoolOptions {
  size?: number;
  timeoutMs?: number;
  maxUses?: number;
  maxRss?: number;
  header?: string; // what every check sees as already imported
  log?: (s: string) => void;
}

type State = "booting" | "idle" | "busy" | "dead";
interface Worker {
  id: number;
  repl: Repl;
  state: State;
  uses: number;
  booted: Promise<void>;
}
interface Job {
  code: string;
  resolve: (r: CheckResult) => void;
  reject: (e: Error) => void;
  tries: number;
}

// Imports a check may name: all of them are already loaded by `import Mathlib`.
const PRELOADED = /^(Mathlib|Init|Std|Lean|Batteries|Aesop|Qq|ProofWidgets|Plausible|ImportGraph|LeanSearchClient)(\.|$)/;

// `import` lines can't be run on top of an environment, so they're blanked
// (keeping line numbers). Anything Mathlib doesn't cover is an error.
export function stripImports(code: string): { code: string; errors: Message[] } {
  const lines = code.split("\n");
  const errors: Message[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(--.*)?$/.test(l) || /^\s*\/-.*-\/\s*$/.test(l)) continue;
    const m = l.match(/^\s*import\s+(.*)$/);
    if (!m) break;
    for (const mod of m[1].replace(/--.*$/, "").trim().split(/\s+/).filter(Boolean)) {
      if (!PRELOADED.test(mod)) errors.push({ severity: "error", text: `unknown module '${mod}': this server has Mathlib (and everything it imports) loaded, nothing else`, line: i + 1, col: 0 });
    }
    lines[i] = "";
  }
  return { code: lines.join("\n"), errors };
}

// The REPL's messages, in the app's shape. Parse errors are the ones with no
// end position: the parser reports a point, the elaborator a range.
function normalize(raw: any): Message[] {
  return ((raw?.messages ?? []) as any[]).map((m) => {
    const msg: Message = {
      severity: m.severity === "info" ? "information" : m.severity,
      text: String(m.data ?? ""),
      line: m.pos?.line,
      col: m.pos?.column,
      endLine: m.endPos?.line,
      endCol: m.endPos?.column,
    };
    if (msg.severity === "error" && m.endPos == null && /^unexpected\b|\bexpected\b/.test(msg.text)) msg.parse = true;
    return msg;
  });
}

export class Pool {
  readonly size: number;
  readonly timeoutMs: number;
  readonly maxUses: number;
  readonly maxRss: number;
  readonly header: string;
  private log: (s: string) => void;
  private env: LeanEnv | null = null;
  private workers: Worker[] = [];
  private queue: Job[] = [];
  private nextId = 1;
  private cache = new Map<string, Message[]>();
  private cacheMax = 5000;
  stats = { checks: 0, cacheHits: 0, timeouts: 0, recycled: 0, bootMs: 0 };

  constructor(o: PoolOptions = {}) {
    this.size = Math.max(1, o.size ?? 3);
    this.timeoutMs = o.timeoutMs ?? 20_000;
    this.maxUses = o.maxUses ?? 400;
    this.maxRss = o.maxRss ?? 3e9;
    this.header = o.header ?? "import Mathlib";
    this.log = o.log ?? ((s) => console.log(s));
  }

  // Boots every worker; resolves when at least one is ready (`all`: when every one is).
  async start(all = false): Promise<void> {
    this.env = await leanEnv();
    this.log(`lean: ${this.size} workers, ${sandboxed() ? "sandboxed (bwrap)" : "NOT sandboxed"}, header ${JSON.stringify(this.header)}`);
    const boots = Array.from({ length: this.size }, () => this.spawn().booted);
    await (all ? Promise.all(boots) : Promise.any(boots));
  }

  private spawn(): Worker {
    const t = performance.now();
    const repl = new Repl(this.env!);
    const w: Worker = { id: this.nextId++, repl, state: "booting", uses: 0, booted: Promise.resolve() };
    this.workers.push(w);
    w.booted = repl.send({ cmd: this.header }, 180_000).then(
      (r) => {
        const errs = normalize(r).filter((m) => m.severity === "error");
        if (errs.length || r?.env !== 0) throw new Error(`header failed: ${errs.map((m) => m.text).join("; ") || JSON.stringify(r)}`);
        if (w.state !== "booting") return; // killed meanwhile
        w.state = "idle";
        const ms = performance.now() - t;
        this.stats.bootMs = Math.round(ms);
        this.log(`lean: worker ${w.id} ready in ${(ms / 1000).toFixed(1)} s`);
        this.dispatch();
      },
      (e) => {
        if (!this.closed) this.log(`lean: worker ${w.id} failed to boot: ${e.message}`);
        this.remove(w);
        throw e;
      },
    );
    w.booted.catch(() => {
      // keep the pool at size, but don't spin if booting itself is broken
      if (!this.closed && this.workers.length < this.size) setTimeout(() => !this.closed && this.workers.length < this.size && this.spawn(), 5000);
    });
    return w;
  }

  private remove(w: Worker) {
    w.state = "dead";
    w.repl.kill();
    this.workers = this.workers.filter((x) => x !== w);
  }

  // Replace a worker: the new one is spawned first, so capacity only dips while
  // the old one is already unusable.
  private replace(w: Worker, why: string) {
    this.log(`lean: replacing worker ${w.id} (${why})`);
    this.remove(w);
    if (!this.closed) this.spawn();
  }

  check(code: string): Promise<CheckResult> {
    const { code: body, errors } = stripImports(code);
    const hit = this.cache.get(body);
    this.stats.checks++;
    if (hit) {
      this.stats.cacheHits++;
      this.cache.delete(body);
      this.cache.set(body, hit);
      return Promise.resolve({ messages: [...errors, ...hit], ms: 0, cached: true });
    }
    return new Promise<CheckResult>((resolve, reject) => {
      this.queue.push({ code: body, resolve: (r) => resolve({ ...r, messages: [...errors, ...r.messages] }), reject, tries: 0 });
      this.dispatch();
    });
  }

  private dispatch() {
    while (this.queue.length) {
      const w = this.workers.find((x) => x.state === "idle");
      if (!w) return;
      this.run(w, this.queue.shift()!);
    }
  }

  private async run(w: Worker, job: Job) {
    w.state = "busy";
    w.uses++;
    const t = performance.now();
    try {
      const raw = await w.repl.send({ cmd: job.code, env: 0 }, this.timeoutMs);
      const ms = Math.round(performance.now() - t);
      if (raw?.message && !raw.messages) throw new Error(`REPL: ${raw.message}`);
      const messages = normalize(raw);
      this.remember(job.code, messages);
      job.resolve({ messages, ms });
      if (w.uses >= this.maxUses) {
        this.stats.recycled++;
        this.replace(w, `${w.uses} checks`);
      } else if (w.uses % 25 === 0 && w.repl.rss() > this.maxRss) {
        this.stats.recycled++;
        this.replace(w, `${(w.repl.rss() / 1e9).toFixed(1)} GB resident`);
      } else w.state = "idle";
    } catch (e) {
      if (e instanceof ReplTimeout) {
        this.stats.timeouts++;
        this.replace(w, "timeout");
        const text = `Lean gave up after ${this.timeoutMs / 1000} s. Does something loop forever, or is a \`decide\` too big?`;
        job.resolve({ messages: [{ severity: "error", text, line: 1, col: 0 }], ms: this.timeoutMs });
      } else if (e instanceof ReplDied && job.tries < 1) {
        this.replace(w, (e as Error).message);
        job.tries++;
        this.queue.unshift(job);
      } else {
        this.replace(w, (e as Error).message);
        job.reject(e as Error);
      }
    } finally {
      this.dispatch();
    }
  }

  private remember(code: string, messages: Message[]) {
    this.cache.set(code, messages);
    if (this.cache.size > this.cacheMax) this.cache.delete(this.cache.keys().next().value!);
  }

  status() {
    const count = (s: State) => this.workers.filter((w) => w.state === s).length;
    const idle = count("idle");
    const busy = count("busy");
    const booting = count("booting");
    return { ready: idle + busy > 0, workers: { idle, busy, booting, size: this.size }, queued: this.queue.length, sandboxed: sandboxed(), header: this.header, ...this.stats };
  }

  private closed = false;
  close() {
    this.closed = true;
    for (const w of [...this.workers]) this.remove(w);
    for (const j of this.queue.splice(0)) j.reject(new Error("Lean is shutting down"));
  }
}

// Check many sources at once (scripts/verify.ts, scripts/lean.ts).
export async function checkAll(sources: string[], o: PoolOptions & { onEach?: (i: number) => void } = {}): Promise<CheckResult[]> {
  const pool = new Pool({ log: () => {}, ...o });
  try {
    await pool.start(true);
    return await Promise.all(sources.map((s, i) => pool.check(s).then((r) => (o.onEach?.(i), r))));
  } finally {
    pool.close();
  }
}
