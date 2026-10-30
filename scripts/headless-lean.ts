// Runs Lean sources through the same in-browser Lean the app uses
// (app/public/lean-worker.js + app/public/lean/), in headless Chrome, and
// returns each one's messages. Used by `bun run verify` and for poking at Lean
// from the command line:
//
//   bun scripts/headless-lean.ts file.lean [more.lean...]
//
// Needs scripts/fetch-lean.sh run first. $CHROME picks the browser binary.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PUBLIC = join(import.meta.dir, "../app/public");

export interface Message {
  severity: string;
  text: string;
  line?: number;
}
export type Result = { ok: true; messages: Message[] } | { ok: false; error: string };

const CHROMES = [
  process.env.CHROME,
  "/usr/bin/google-chrome-stable",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean) as string[];

const PAGE = `<script type="module">
const post = (path, body) => fetch(path, { method: "POST", body: JSON.stringify(body) });
const jobs = await (await fetch("/jobs")).json();
const w = new Worker("/lean-worker.js");
let next = 1;
const pending = new Map();
const call = (msg) => new Promise((r) => (pending.set(next, r), w.postMessage({ ...msg, id: next++ })));
w.onmessage = async ({ data }) => {
  if (data.type === "error") return post("/done", { error: data.text });
  if (data.type === "result") return pending.get(data.id)(data);
  if (data.type !== "ready") return;
  for (const [i, src] of jobs.entries()) await post("/result", { i, ...(await call({ type: "check", code: src })) });
  post("/done", {});
};
w.postMessage({ type: "start", base: location.origin + "/lean" });
</script>`;

// A Chrome or Chromium binary: $CHROME, or the usual places on macOS and Linux.
export function findChrome(): string {
  const chrome = CHROMES.find((c) => existsSync(c));
  if (!chrome) throw new Error("no Chrome found: set $CHROME");
  return chrome;
}

// Chrome flags for a throwaway headless instance. CI runners (Ubuntu 24.04)
// don't allow Chrome's sandbox; it's our own pages on localhost there.
export const chromeFlags = (profile: string) => ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`, ...(process.env.CI ? ["--no-sandbox"] : [])];

export async function compileAll(sources: string[], onEach?: (i: number) => void): Promise<Result[]> {
  if (!existsSync(join(PUBLIC, "lean/lean.js"))) throw new Error("no Lean runtime in app/public/lean: run scripts/fetch-lean.sh");
  const chrome = findChrome();
  const results: Result[] = [];
  let finish!: (e?: string) => void;
  const done = new Promise<string | undefined>((r) => (finish = r));
  const isolated = { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" };
  const server = Bun.serve({
    port: 0,
    idleTimeout: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/") return new Response(PAGE, { headers: { ...isolated, "content-type": "text/html" } });
      if (path === "/jobs") return Response.json(sources);
      if (path === "/result") {
        const r = await req.json();
        results[r.i] = r.ok ? { ok: true, messages: r.messages } : { ok: false, error: r.error };
        onEach?.(r.i);
        return new Response();
      }
      if (path === "/done") {
        finish((await req.json()).error);
        return new Response();
      }
      const file = Bun.file(join(PUBLIC, path));
      return !path.includes("..") && (await file.exists()) ? new Response(file, { headers: isolated }) : new Response("not found", { status: 404 });
    },
  });
  const profile = mkdtempSync(join(tmpdir(), "proofreps-chrome-"));
  const browser = Bun.spawn([chrome, ...chromeFlags(profile), `http://localhost:${server.port}/`], { stdout: "ignore", stderr: "ignore" });
  const timer = setTimeout(() => finish("timed out"), 15 * 60_000);
  const error = await done;
  clearTimeout(timer);
  browser.kill();
  server.stop(true);
  await browser.exited;
  rmSync(profile, { recursive: true, force: true });
  if (error) throw new Error(`in-browser Lean failed: ${error}`);
  return results;
}

if (import.meta.main) {
  const files = process.argv.slice(2);
  const t = performance.now();
  const results = await compileAll(files.map((f) => readFileSync(f, "utf8")));
  for (const [i, r] of results.entries()) {
    console.log(`== ${files[i]}`);
    if (!r.ok) console.log(`  (failed) ${r.error}`);
    else for (const m of r.messages) console.log(`  ${m.line ?? "-"} ${m.severity}: ${m.text.replaceAll("\n", "\n    ")}`);
  }
  console.error(`${files.length} files in ${((performance.now() - t) / 1000).toFixed(1)} s`);
}
