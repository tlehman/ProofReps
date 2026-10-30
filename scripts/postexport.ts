// After `expo export --platform web`: make app/dist ready for GitHub Pages.
//  - stamps sw.js with a hash of the build and of the pinned Lean runtime, so
//    each deploy gets a fresh app cache and Lean is only re-downloaded when
//    scripts/lean.lock changes
//  - .nojekyll, or Pages hides `_expo/` (Jekyll skips paths starting with _)
//  - 404.html, so a mistyped path still opens the app
//  - checks the pieces are there: Lean runtime, core.wasm, the link preview tags
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "app/dist");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const fail = (why: string) => {
  console.error(`postexport: ${why}`);
  process.exit(1);
};
for (const f of ["lean/lean.js", "lean/lean.wasm.gz", "lean/core-layer.json", "lean-worker.js", "core.wasm", "sw.js", "og.png", "manifest.webmanifest"]) {
  if (!existsSync(join(DIST, f))) fail(`missing ${f} (run scripts/fetch-lean.sh and scripts/build-core.sh)`);
}
const index = readFileSync(join(DIST, "index.html"), "utf8");
if (!index.includes('property="og:image"')) fail("index.html lacks the og: tags: is app/public/index.html being used?");

const app = createHash("sha256");
for (const f of files(DIST).sort()) {
  const rel = relative(DIST, f);
  if (rel.startsWith("lean/") || rel === "sw.js") continue;
  app.update(rel).update(readFileSync(f));
}
const version = app.digest("hex").slice(0, 12);
const lean = createHash("sha256").update(readFileSync(join(ROOT, "scripts/lean.lock"))).digest("hex").slice(0, 12);
const sw = readFileSync(join(DIST, "sw.js"), "utf8").replace("__VERSION__", version).replace("__LEAN__", lean);
writeFileSync(join(DIST, "sw.js"), sw);
writeFileSync(join(DIST, ".nojekyll"), "");
copyFileSync(join(DIST, "index.html"), join(DIST, "404.html"));

const bytes = files(DIST).reduce((n, f) => n + statSync(f).size, 0);
console.log(`postexport: app ${version}, lean ${lean}, ${(bytes / 1e6).toFixed(1)} MB in app/dist`);
