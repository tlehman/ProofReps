// Lean in this tab: public/lean-worker.js runs Lean 4 as WebAssembly. Booted
// once when the app starts, so it's warm by the time the first answer arrives.
// Needs a cross-origin isolated page: on GitHub Pages the service worker
// (public/sw.js) adds the headers, after one reload on the first visit.
import { asset } from "../env";
import type { Message } from "./grade";

export type Status = "idle" | "starting" | "ready" | "failed" | "unsupported";

export const supported = () => globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer === "function";

// A check that runs longer than this is stuck: the worker is thrown away,
// Lean boots again (about 2 s), and the check runs once more. A second
// timeout is reported: that code probably loops (`#eval` of a loop, a huge
// `decide`).
const TIMEOUT_MS = 15_000;

// A tab the OS kills while Lean boots (out of memory, on a phone) reloads into
// the same screen; this mark stops it from booting again in a loop.
const BOOTING = "proofreps:lean-booting";
const mark = (on: boolean) => {
  try {
    on ? localStorage.setItem(BOOTING, String(Date.now())) : localStorage.removeItem(BOOTING);
  } catch {}
};
const crashedBefore = (() => {
  try {
    const t = Number(localStorage.getItem(BOOTING));
    return t > 0 && Date.now() - t < 10 * 60_000;
  } catch {
    return false;
  }
})();

let status: Status = !supported() ? "unsupported" : crashedBefore ? "failed" : "idle";
let detail = crashedBefore ? "The tab closed while Lean was starting, probably out of memory." : "";
let worker: Worker | null = null;
// The worker asked to be replaced (see BUDGET in lean-worker.js): done
// between checks, so nothing in flight is lost.
let recycleSoon = false;
let booting: Promise<boolean> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (m: Message[]) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const listeners = new Set<() => void>();

export const getStatus = () => ({ status, detail });
export const onStatus = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
function set(s: Status, d = "") {
  status = s;
  detail = d;
  for (const f of listeners) f();
}

// A check cut off by a restart: not the code's fault, so check() runs it again.
class Restarted extends Error {}

function failAll(text: string) {
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(new Restarted(text));
  }
  pending.clear();
}

export function start(): Promise<boolean> {
  if (status === "unsupported") return Promise.resolve(false);
  if (status === "failed" && !booting) return Promise.resolve(false); // until retry()
  booting ??= new Promise((resolve) => {
    set("starting", "Downloading Lean");
    mark(true);
    const w = new Worker(asset("lean-worker.js"));
    worker = w;
    const fail = (text: string) => {
      mark(false);
      set("failed", text);
      failAll(text);
      resolve(false);
    };
    w.onerror = (e) => fail(e.message || "The Lean worker crashed.");
    w.onmessage = ({ data }) => {
      if (data.type === "progress") set("starting", data.text);
      else if (data.type === "recycle") recycleSoon = true;
      else if (data.type === "ready") {
        mark(false);
        set("ready");
        resolve(true);
      } else if (data.type === "error") fail(data.text);
      else if (data.type === "result") {
        const p = pending.get(data.id);
        if (!p) return;
        pending.delete(data.id);
        clearTimeout(p.timer);
        data.ok ? p.resolve(data.messages) : p.reject(new Error(data.error));
      }
    };
    w.postMessage({ type: "start", base: asset("lean") });
  });
  return booting;
}

// Forget a failed or stuck Lean and allow another boot.
export function retry() {
  recycleSoon = false;
  mark(false);
  worker?.terminate();
  worker = null;
  booting = null;
  failAll("Lean was restarted.");
  set(supported() ? "idle" : "unsupported");
}

// Checks run one at a time, probes and answers alike: two in the worker at once
// would share one check's timeout, and a restart for one would cut off the
// other ("Lean was restarted.").
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job);
  chain = run.catch(() => null);
  return run;
}

// Check one Lean file: parse errors, then everything elaboration says. If Lean
// itself fails (not the code), it's restarted and the check runs once more.
export const check = (code: string): Promise<Message[]> => enqueue(() => checkNow(code));

async function checkNow(code: string): Promise<Message[]> {
  let first: Message[];
  try {
    first = await checkOnce(code);
  } catch (e) {
    if (!(e instanceof Timeout || e instanceof Restarted)) throw e;
    console.warn("[lean] check was cut off, restarting Lean and trying once more:", (e as Error).message);
    return checkOnce(code);
  } finally {
    if (recycleSoon && pending.size === 0) {
      retry();
      start();
    }
  }
  if (!first.some((m) => m.internal)) return first;
  console.warn("[lean] internal failure, restarting:", first.find((m) => m.internal)?.text);
  retry();
  return checkOnce(code);
}

class Timeout extends Error {}

async function checkOnce(code: string): Promise<Message[]> {
  if (!(await start()) || !worker) throw new Error(detail || "Lean isn't available in this browser.");
  const w = worker;
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Timeout(`Lean gave up after ${TIMEOUT_MS / 1000} s. Does something loop forever?`));
      retry();
      start();
    }, TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    w.postMessage({ type: "check", id, code });
  });
}

// Probes fire as the learner types; on each channel ("goal", "file") only the
// newest one matters. They wait in the same queue as checks, so a probe that's
// been overtaken on its channel by a newer one is dropped (resolves to null)
// before it reaches Lean.
const probeSeq = new Map<string, number>();
export function probe(channel: string, code: string): Promise<Message[] | null> {
  const mine = (probeSeq.get(channel) ?? 0) + 1;
  probeSeq.set(channel, mine);
  return enqueue(() => (mine === probeSeq.get(channel) ? checkNow(code) : Promise.resolve(null)));
}
