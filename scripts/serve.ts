// Serves app/dist at http://localhost:8790/ProofReps/ the way GitHub Pages
// does: plain static files, no COOP/COEP headers, so the service worker's
// isolation path is what gets exercised.
//   bun scripts/serve.ts [--isolated]   (--isolated: send the headers directly)
import { join, normalize } from "node:path";

const DIST = join(import.meta.dir, "../app/dist");
const PORT = Number(process.env.PORT ?? 8790);
const isolated = process.argv.includes("--isolated");
const headers: Record<string, string> = isolated ? { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" } : {};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/ProofReps") return Response.redirect("/ProofReps/", 301);
    if (!url.pathname.startsWith("/ProofReps/")) return new Response("not found", { status: 404 });
    let path = normalize(decodeURIComponent(url.pathname.slice("/ProofReps/".length)));
    if (path.startsWith("..")) return new Response("no", { status: 400 });
    if (path === "." || path.endsWith("/")) path = join(path, "index.html");
    const file = Bun.file(join(DIST, path));
    if (await file.exists()) return new Response(file, { headers });
    return new Response(Bun.file(join(DIST, "404.html")), { status: 404, headers: { ...headers, "content-type": "text/html" } });
  },
});
console.log(`http://localhost:${PORT}/ProofReps/${isolated ? "  (isolated)" : "  (like GitHub Pages)"}`);
