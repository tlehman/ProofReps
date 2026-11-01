// After `expo export --platform web`: checks app/dist has what the server
// needs to serve it (core.wasm, the link preview tags, the manifest).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = join(import.meta.dir, "../app/dist");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const fail = (why: string) => {
  console.error(`postexport: ${why}`);
  process.exit(1);
};
for (const f of ["index.html", "core.wasm", "og.png", "manifest.webmanifest"]) {
  if (!existsSync(join(DIST, f))) fail(`missing ${f} (run scripts/build-core.sh)`);
}
if (!readFileSync(join(DIST, "index.html"), "utf8").includes('property="og:image"')) fail("index.html lacks the og: tags: is app/public/index.html being used?");
const bytes = files(DIST).reduce((n, f) => n + statSync(f).size, 0);
console.log(`postexport: ${(bytes / 1e6).toFixed(1)} MB in app/dist`);
