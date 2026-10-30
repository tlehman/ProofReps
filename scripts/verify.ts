// Checks every exercise against the same in-browser Lean the app runs
// (scripts/headless-lean.ts):
//   fill / proof / fix: every solution passes, every `wrong` answer fails,
//                       and a fix exercise's `start` fails
//   choice:             `verify.src` compiles cleanly and prints each `expect`
// plus structural checks (unique ids, one `___` per template, ...).
//
//   bun scripts/verify.ts                 # everything
//   bun scripts/verify.ts u03 u04-l1-e2   # units, lessons or exercises by id prefix
//   bun scripts/verify.ts app/src/content/u05.ts   # a unit file, whether or not index.ts lists it
//
// Needs scripts/fetch-lean.sh and scripts/build-core.sh run first.
import { join } from "node:path";
import { loadCore } from "../app/src/core";
import { resolve } from "node:path";
import { units as listed } from "../app/src/content";
import type { Unit } from "../app/src/content/types";
import { isFill, type Exercise } from "../app/src/content/types";
import { judge, source, type Message, type Source } from "../app/src/lean/grade";
import { compileAll } from "./headless-lean";

const core = await loadCore(await Bun.file(join(import.meta.dir, "../app/public/core.wasm")).arrayBuffer());
const args = process.argv.slice(2);
const files = args.filter((a) => a.endsWith(".ts"));
const only = args.filter((a) => !a.endsWith(".ts"));
let units: Unit[] = listed;
if (files.length) {
  units = [];
  for (const f of files) for (const v of Object.values(await import(resolve(f)))) if ((v as Unit)?.lessons) units.push(v as Unit);
}
const problems: string[] = [];
const fail = (id: string, why: string) => problems.push(`✗ ${id}: ${why}`);

// ---------- structure ----------
const ids = new Set<string>();
const all: Exercise[] = [];
for (const u of units) {
  for (const l of u.lessons) {
    if (!l.id.startsWith(u.id + "-")) fail(l.id, `lesson id should start with ${u.id}-`);
    for (const e of l.exercises) {
      if (!e.id.startsWith(l.id + "-")) fail(e.id, `exercise id should start with ${l.id}-`);
      if (ids.has(e.id)) fail(e.id, "duplicate id");
      ids.add(e.id);
      all.push(e);
      if (e.kind === "choice") {
        if (!(e.answer >= 0 && e.answer < e.options.length)) fail(e.id, "answer index out of range");
        if (new Set(e.options).size !== e.options.length) fail(e.id, "duplicate options");
        if (!e.verify) fail(e.id, "choice exercise without verify");
      } else {
        if (e.template.split("___").length !== 2) fail(e.id, "template needs exactly one ___");
        if (!e.solutions.length) fail(e.id, "no solutions");
        if (e.kind === "fix" && !e.start) fail(e.id, "fix exercise without start");
      }
    }
  }
}

// ---------- Lean ----------
type Job = { id: string; what: string; expect: "pass" | "fail" | "print"; src: string; cs?: Source; strings?: string[] };
const jobs: Job[] = [];
const picked = all.filter((e) => !only.length || only.some((p) => e.id.startsWith(p)));
for (const e of picked) {
  if (e.kind === "choice") {
    if (e.verify) jobs.push({ id: e.id, what: "verify", expect: "print", src: e.verify.src, strings: e.verify.expect });
    continue;
  }
  if (!isFill(e)) continue;
  const add = (what: string, answer: string, expect: "pass" | "fail") => {
    const cs = source(core, e.template, answer);
    if (!cs) return fail(e.id, `${what}: couldn't fill the template`);
    jobs.push({ id: e.id, what, expect, src: cs.src, cs });
  };
  e.solutions.forEach((s, i) => add(`solution ${i + 1}`, s, "pass"));
  (e.wrong ?? []).forEach((s, i) => add(`wrong ${i + 1}`, s, "fail"));
  if (e.kind === "fix" && e.start) add("start", e.start, "fail");
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const show = (ms: Message[]) => ms.map((m) => `    ${m.line ?? "-"} ${m.severity}: ${m.text.replaceAll("\n", "\n      ")}`).join("\n");
const t = performance.now();
process.stdout.write(`${picked.length} exercises, ${jobs.length} Lean checks `);
const results = await compileAll(
  jobs.map((j) => j.src),
  () => process.stdout.write("."),
);
console.log(` ${((performance.now() - t) / 1000).toFixed(1)} s`);

let passed = 0;
for (const [i, j] of jobs.entries()) {
  const r = results[i];
  if (!r?.ok) {
    fail(j.id, `${j.what}: Lean failed: ${r?.error ?? "no result"}`);
    continue;
  }
  if (j.expect === "print") {
    const errors = r.messages.filter((m) => m.severity === "error");
    const out = norm(r.messages.filter((m) => m.severity === "information").map((m) => m.text).join("\n"));
    const missing = j.strings!.filter((s) => !out.includes(norm(s)));
    if (errors.length) fail(j.id, `verify has errors:\n${show(errors)}`);
    else if (missing.length) fail(j.id, `verify output lacks ${missing.map((s) => JSON.stringify(s)).join(", ")}; got:\n${show(r.messages)}`);
    else passed++;
    continue;
  }
  const v = judge(j.cs!, r.messages);
  if (j.expect === "pass" && v.kind !== "ok") fail(j.id, `${j.what} should pass but is ${v.kind}:\n${show(v.messages)}\n  source:\n${j.src.replace(/^/gm, "    ")}`);
  else if (j.expect === "fail" && v.kind === "ok") fail(j.id, `${j.what} should fail but Lean accepts it`);
  else passed++;
}

for (const p of problems) console.log(p);
console.log(`${passed}/${jobs.length} checks as expected; ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
