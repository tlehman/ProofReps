// Fails if a built core.wasm imports anything. The Rust core's panic handler
// calls a function nothing provides (core/src/lib.rs), so a panic path that
// survives optimization shows up as an import; a correct build imports nothing.
// Run: bun scripts/check-no-panic.ts app/public/core.wasm
const path = process.argv[2];
if (!path) throw new Error("usage: bun scripts/check-no-panic.ts file.wasm");
const mod = await WebAssembly.compile(await Bun.file(path).arrayBuffer());
const imports = WebAssembly.Module.imports(mod);
if (imports.length) {
  const panics = imports.some((i) => i.name === "proofreps_core_has_a_reachable_panic");
  console.error(`check-no-panic: ${path} imports ${imports.map((i) => `${i.module}.${i.name}`).join(", ")}`);
  if (panics) console.error("check-no-panic: some path in the Rust core can panic. Find it with: cd core && cargo clippy --release --target wasm32-unknown-unknown");
  process.exit(1);
}
const exports = WebAssembly.Module.exports(mod).filter((e) => e.kind === "function").length;
console.log(`check-no-panic: ${path}: ${exports} exports, no imports, no reachable panics`);
