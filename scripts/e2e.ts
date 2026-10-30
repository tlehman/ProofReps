// End-to-end check of the built site, the way a phone first meets it: served
// like GitHub Pages (no COOP/COEP headers), in headless Chrome at phone size,
// over the DevTools protocol (no test framework).
//
//   1. the service worker installs and the page comes back cross-origin isolated
//   2. Lean boots in the tab
//   3. a fill exercise: a wrong answer gets Lean's type error, a right one passes
//   4. the playground shows a syntax error, a type error, a goal and #eval output
//   5. progress survives a reload (localStorage)
//
//   bun scripts/e2e.ts [--shots dir]     (needs app/dist: cd app && bun run build)
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromeFlags, findChrome } from "./headless-lean";

const shotsAt = process.argv.indexOf("--shots");
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const CHROME = findChrome();
const PORT = 8791;
const DEBUG = 9337;

const server = Bun.spawn(["bun", join(import.meta.dir, "serve.ts")], { env: { ...process.env, PORT: String(PORT) }, stdout: "ignore", stderr: "inherit" });
const profile = mkdtempSync(join(tmpdir(), "proofreps-e2e-"));
const chrome = Bun.spawn(
  [CHROME, ...chromeFlags(profile), `--remote-debugging-port=${DEBUG}`, "--window-size=390,844", "about:blank"],
  { stdout: "ignore", stderr: "ignore" },
);

let failures = 0;
const ok = (what: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${what}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

async function cdp() {
  for (let i = 0; i < 50; i++) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = pages.find((p) => p.type === "page");
      if (page) return new WebSocket(page.webSocketDebuggerUrl);
    } catch {}
    await Bun.sleep(200);
  }
  throw new Error("Chrome didn't start");
}

const ws = await cdp();
await new Promise((r) => (ws.onopen = r));
let nextId = 1;
const waiting = new Map<number, (v: any) => void>();
ws.onmessage = (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && waiting.has(m.id)) waiting.get(m.id)!(m);
};
const send = (method: string, params: object = {}) =>
  new Promise<any>((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async (expr: string) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
};
async function until(expr: string, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await js(expr);
      if (v) return v;
    } catch {}
    await Bun.sleep(250);
  }
  return null;
}
async function shot(name: string) {
  if (!SHOTS) return;
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.result.data, "base64"));
}
const text = () => js("document.body.innerText");
// Click the innermost element whose text is exactly `label`.
const click = (label: string) =>
  js(`(() => {
    const els = [...document.querySelectorAll("body *")].filter((e) => e.innerText?.trim() === ${JSON.stringify(label)});
    const el = els[els.length - 1];
    if (!el) return false;
    el.click();
    return true;
  })()`);
// Type into the n-th text box (React-controlled, so through the native setter).
const type = (value: string, n = 0) =>
  js(`(() => {
    const el = document.querySelectorAll("textarea, input[type=text], input:not([type])")[${n}];
    if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: `http://localhost:${PORT}/ProofReps/` });

  const isolated = await until("crossOriginIsolated && !!navigator.serviceWorker.controller", 30_000);
  ok("service worker took over and the page is cross-origin isolated", !!isolated);
  const t0 = Date.now();
  const ready = await until(`document.body.innerText.includes("Lean 4 is running in this tab")`, 90_000);
  ok("Lean booted in the tab", !!ready, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await shot("1-home");

  // Unit 1, lesson 1: answer the three choice exercises, then the first fill.
  ok("opened lesson 1", !!(await click("Asking Lean")));
  for (const right of ['"hello" : String', "[0, 1, 4, 9, 16]", "0"]) {
    await until(`document.body.innerText.includes("Check")`, 5000);
    await click(right);
    await click("Check");
    await until(`document.body.innerText.includes("Continue")`, 5000);
    await click("Continue");
  }
  await until(`document.body.innerText.includes("Your first definition")`, 5000);
  await type("n + 1");
  await Bun.sleep(300);
  await click("Check");
  const rejected = await until(`document.body.innerText.includes("Lean says no") && document.body.innerText`, 30_000);
  ok("a wrong answer gets Lean's error", !!rejected && /rfl|decide|Type mismatch|not definitionally equal|failed/i.test(rejected));
  await shot("2-wrong");
  await type("n + n");
  await Bun.sleep(300);
  await click("Check");
  const accepted = await until(`document.body.innerText.includes("Got it") || document.body.innerText.includes("Correct!")`, 30_000);
  ok("a right answer is accepted by Lean", !!accepted);
  await shot("3-right");
  await click("Continue");

  // The playground: syntax error, type error, goal, #eval.
  await click("✕");
  await until(`document.body.innerText.includes("Playground")`, 5000);
  await click("Playground");
  await until(`document.querySelectorAll("textarea").length > 0`, 5000);
  await type(
    [
      "#eval [1, 2, 3].map (· * 10)",
      "def bad : Nat := \"nope\"",
      "theorem t (p q : Prop) (hp : p) (hq : q) : p ∧ q := by",
      "  constructor",
      "  · exact (hp",
      "",
    ].join("\n"),
  );
  const play = await until(`(() => { const t = document.body.innerText; return t.includes("[10, 20, 30]") && /syntax error/i.test(t) && /mismatch/i.test(t) && t; })()`, 30_000);
  ok("playground: #eval output", !!play && play.includes("[10, 20, 30]"));
  ok("playground: syntax error", !!play && /syntax error/i.test(play));
  ok("playground: type error", !!play && /mismatch/i.test(play));
  await shot("4-playground");
  await type("theorem t (p q : Prop) (hp : p) (hq : q) : p ∧ q := by\n  constructor\n  ");
  await js(`(() => { const el = document.querySelector("textarea"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); el.dispatchEvent(new Event("select", { bubbles: true })); document.dispatchEvent(new Event("selectionchange")); })()`);
  // (not just "⊢": the symbol bar has one)
  const goal = await until(`(() => { const t = document.body.innerText; return /goal at line/i.test(t) && t.includes("⊢ p") && t; })()`, 30_000);
  ok("playground: goal at the cursor", !!goal && goal.includes("⊢ p"));
  await shot("5-goal");

  // Progress survives a reload.
  await send("Page.reload");
  await until(`document.body.innerText.includes("ProofReps")`, 20_000);
  const xp = await js(`JSON.parse(localStorage.getItem("proofreps:v1") || "{}").xp`);
  ok("progress is in localStorage after a reload", (xp ?? 0) > 0, `${xp} XP`);
} catch (e) {
  ok(`no exception (${(e as Error).message})`, false);
} finally {
  ws.close();
  chrome.kill();
  server.kill();
  await chrome.exited;
  rmSync(profile, { recursive: true, force: true });
}
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
