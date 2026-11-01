// The ProofReps server: the built app (app/dist) and the Lean API, on one port.
//
//   POST /api/check   {"code": "..."}  →  {"messages": [...], "ms": 12, "cached": false}
//   GET  /api/status                   →  {"ready": true, "workers": {...}, ...}
//
// Lean runs in a pool of long-lived REPLs with Mathlib imported at boot
// (pool.ts), so a check never waits for an import.
//
//   bun server/src/main.ts       (scripts/start.sh builds everything first and puts it on the tailnet)
//
// Env: HOST (127.0.0.1), PORT (8790), LEAN_WORKERS (4), LEAN_TIMEOUT_MS (20000).
import { join, normalize } from "node:path";
import { Pool } from "./pool";

const DIST = join(import.meta.dir, "../../app/dist");
const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 8790);
const MAX_CODE = 64 * 1024;

const pool = new Pool({
  size: Number(process.env.LEAN_WORKERS ?? 4),
  timeoutMs: Number(process.env.LEAN_TIMEOUT_MS ?? 20_000),
});

const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "cache-control": "no-store" } });

async function api(req: Request, path: string): Promise<Response> {
  if (path === "/api/status") return json(pool.status());
  if (path === "/api/check" && req.method === "POST") {
    let code: unknown;
    try {
      code = ((await req.json()) as { code?: unknown }).code;
    } catch {
      return json({ error: "expected JSON {code}" }, 400);
    }
    if (typeof code !== "string") return json({ error: "expected JSON {code}" }, 400);
    if (code.length > MAX_CODE) return json({ error: `code is over ${MAX_CODE / 1024} KB` }, 413);
    try {
      return json(await pool.check(code));
    } catch (e) {
      return json({ error: (e as Error).message }, 503);
    }
  }
  return json({ error: "not found" }, 404);
}

async function file(path: string): Promise<Response> {
  let rel = normalize(decodeURIComponent(path)).replace(/^\/+/, "");
  if (rel.startsWith("..")) return new Response("no", { status: 400 });
  if (rel === "" || rel === "." || rel.endsWith("/")) rel = join(rel, "index.html");
  const f = Bun.file(join(DIST, rel));
  // Expo's bundles have content hashes in their names; everything else may change with a rebuild.
  const cache = rel.startsWith("_expo/static/") ? "public, max-age=31536000, immutable" : "no-cache";
  if (await f.exists()) return new Response(f, { headers: { "cache-control": cache } });
  // A path the app doesn't have as a file still opens the app.
  const index = Bun.file(join(DIST, "index.html"));
  if (!(await index.exists())) return new Response("app/dist is missing: run scripts/start.sh (or cd app && bun run build)", { status: 500 });
  return new Response(index, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  idleTimeout: 60,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/api/")) return api(req, path);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("method not allowed", { status: 405 });
    return file(path);
  },
});
console.log(`proofreps: http://${server.hostname}:${server.port}/ (Lean starting)`);

const t = performance.now();
pool.start(true).then(
  () => console.log(`proofreps: Lean + Mathlib ready (${pool.size} workers) in ${((performance.now() - t) / 1000).toFixed(1)} s`),
  (e) => console.error(`proofreps: Lean failed to start: ${e?.message ?? e}`),
);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    pool.close();
    server.stop(true);
    process.exit(0);
  });
}
