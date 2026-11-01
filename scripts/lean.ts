// Runs Lean files through the same Lean the server uses (Lean 4 with Mathlib
// imported, server/src/pool.ts) and prints every message:
//
//   bun scripts/lean.ts file.lean [more.lean...]
import { readFileSync } from "node:fs";
import { checkAll } from "../server/src/pool";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: bun scripts/lean.ts file.lean [more.lean...]");
  process.exit(2);
}
const t = performance.now();
const results = await checkAll(files.map((f) => readFileSync(f, "utf8")), { size: Math.min(files.length, 4) });
for (const [i, r] of results.entries()) {
  console.log(`== ${files[i]}  (${r.ms} ms)`);
  for (const m of r.messages) console.log(`  ${m.line ?? "-"}:${m.col ?? "-"} ${m.severity}: ${m.text.replaceAll("\n", "\n    ")}`);
}
console.error(`${files.length} files in ${((performance.now() - t) / 1000).toFixed(1)} s (including the Mathlib import)`);
