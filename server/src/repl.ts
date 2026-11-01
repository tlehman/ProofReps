// One long-lived Lean process: the Lean REPL (leanprover-community/repl),
// built in server/lean against Mathlib. It boots, runs `import Mathlib` once
// (environment 0), and from then on elaborates each check as a command on top
// of environment 0: no re-import, so a check costs only its own elaboration.
//
// Protocol: one JSON object per request on stdin, terminated by a blank line;
// one pretty-printed JSON object per response on stdout, also terminated by a
// blank line. Requests are answered in order, one at a time.
//
// The process runs in a bubblewrap sandbox when bwrap is installed: no network,
// a read-only view of the Lean toolchain and the Mathlib build, a throwaway
// /tmp, nothing else of the host's files. Checked code can run `#eval` with IO,
// so this is what keeps a check from touching anything that matters.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const LEAN_DIR = join(import.meta.dir, "../lean");
export const REPL_BIN = join(LEAN_DIR, ".lake/packages/REPL/.lake/build/bin/repl");

export interface LeanEnv {
  LEAN_PATH: string;
  LEAN_SYSROOT: string;
}

// LEAN_PATH (where Mathlib's .olean files are) and the toolchain, as Lake
// would set them for `lake env`.
export async function leanEnv(): Promise<LeanEnv> {
  const p = Bun.spawn(["lake", "env", "sh", "-c", 'printf "%s\\n%s" "$LEAN_PATH" "$LEAN_SYSROOT"'], { cwd: LEAN_DIR, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  if ((await p.exited) !== 0) throw new Error(`lake env failed in ${LEAN_DIR}: ${await new Response(p.stderr).text()}`);
  const [LEAN_PATH, LEAN_SYSROOT] = out.split("\n");
  return { LEAN_PATH, LEAN_SYSROOT };
}

const BWRAP = ["/usr/bin/bwrap", "/bin/bwrap"].find((p) => existsSync(p));
export const sandboxed = () => !!BWRAP && process.env.PROOFREPS_SANDBOX !== "0";

function command(env: LeanEnv): string[] {
  if (!sandboxed()) return [REPL_BIN];
  const ro = (p: string) => (existsSync(p) ? ["--ro-bind", p, p] : []);
  return [
    BWRAP!,
    "--unshare-all", // no network, own pid/ipc/uts namespaces
    "--die-with-parent",
    "--new-session",
    ...ro("/usr"),
    ...["/lib", "/lib64", "/bin"].flatMap((d) => (existsSync(d) ? ["--symlink", `usr${d}`, d] : [])),
    ...ro(env.LEAN_SYSROOT),
    ...ro(LEAN_DIR),
    "--proc", "/proc",
    "--dev", "/dev",
    "--tmpfs", "/tmp",
    "--chdir", "/tmp",
    "--clearenv",
    "--setenv", "LEAN_PATH", env.LEAN_PATH,
    "--setenv", "LEAN_SYSROOT", env.LEAN_SYSROOT,
    "--setenv", "HOME", "/tmp",
    "--setenv", "PATH", "/usr/bin",
    REPL_BIN,
  ];
}

export class ReplDied extends Error {}
export class ReplTimeout extends Error {}

export class Repl {
  readonly proc: ReturnType<typeof Bun.spawn>;
  private buf = "";
  private waiting: { resolve: (v: any) => void; reject: (e: Error) => void } | null = null;
  dead = false;
  stderr = "";

  constructor(env: LeanEnv) {
    this.proc = Bun.spawn(command(env), {
      cwd: LEAN_DIR,
      env: { ...process.env, LEAN_PATH: env.LEAN_PATH, LEAN_SYSROOT: env.LEAN_SYSROOT },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    this.read();
    this.readErr();
    this.proc.exited.then((code) => {
      this.dead = true;
      this.waiting?.reject(new ReplDied(`Lean exited (${code})${this.stderr ? `: ${this.stderr.trim().slice(-500)}` : ""}`));
      this.waiting = null;
    });
  }

  private async read() {
    const dec = new TextDecoder();
    for await (const chunk of this.proc.stdout as ReadableStream<Uint8Array>) {
      this.buf += dec.decode(chunk, { stream: true });
      let i: number;
      while ((i = this.buf.indexOf("\n\n")) >= 0) {
        const part = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 2);
        if (!part) continue;
        let v: unknown;
        try {
          v = JSON.parse(part);
        } catch {
          console.warn("[repl] not JSON:", part.slice(0, 200));
          continue;
        }
        const w = this.waiting;
        this.waiting = null;
        w?.resolve(v);
      }
    }
  }

  private async readErr() {
    const dec = new TextDecoder();
    for await (const chunk of this.proc.stderr as ReadableStream<Uint8Array>) this.stderr = (this.stderr + dec.decode(chunk)).slice(-4000);
  }

  // One request, one response. Only one may be outstanding.
  send(req: object, timeoutMs: number): Promise<any> {
    if (this.dead) return Promise.reject(new ReplDied("Lean isn't running"));
    if (this.waiting) return Promise.reject(new Error("Repl.send: a request is already in flight"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        reject(new ReplTimeout(`timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.waiting = {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      };
      const stdin = this.proc.stdin as import("bun").FileSink;
      stdin.write(JSON.stringify(req) + "\n\n");
      stdin.flush();
    });
  }

  // Private resident memory in bytes (anonymous pages, so not the shared,
  // memory-mapped Mathlib .olean files), sandbox child included; 0 if unknown.
  rss(): number {
    try {
      const pids = [this.proc.pid, ...childPids(this.proc.pid)];
      let kb = 0;
      for (const pid of pids) {
        const s = readFileSync(`/proc/${pid}/status`, "utf8");
        kb += Number(s.match(/^RssAnon:\s+(\d+)/m)?.[1] ?? 0);
      }
      return kb * 1024;
    } catch {
      return 0;
    }
  }

  kill() {
    this.dead = true;
    try {
      this.proc.kill("SIGKILL");
    } catch {}
  }
}

function childPids(pid: number): number[] {
  try {
    const kids = (readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8")).split(/\s+/).filter(Boolean).map(Number);
    return kids.flatMap((k) => [k, ...childPids(k)]);
  } catch {
    return [];
  }
}
