// Lean on the server: the ProofReps server (server/src/main.ts) keeps a pool of
// long-lived Lean processes with Mathlib already imported, so a check is one
// HTTP round trip plus a few milliseconds of elaboration.
import { asset } from "../env";
import type { Message } from "./grade";

export type Status = "idle" | "starting" | "ready" | "failed";

// A check that takes longer than this has lost the server. (The server gives
// up on a check itself after 20 s and says so as a Lean error.)
const TIMEOUT_MS = 45_000;

let status: Status = "idle";
let detail = "";
const listeners = new Set<() => void>();
let starting: Promise<boolean> | null = null;

export const getStatus = () => ({ status, detail });
export const onStatus = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
function set(s: Status, d = "") {
  if (s === status && d === detail) return;
  status = s;
  detail = d;
  for (const f of listeners) f();
}

interface ServerStatus {
  ready: boolean;
  workers: { idle: number; busy: number; booting: number; size: number };
}

// Wait for the server's Lean to be up (it imports Mathlib when it boots).
export function start(): Promise<boolean> {
  if (status === "ready") return Promise.resolve(true);
  starting ??= (async () => {
    set("starting", "connecting");
    const end = Date.now() + 5 * 60_000;
    let misses = 0;
    while (Date.now() < end) {
      try {
        const r = await fetch(asset("api/status"), { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const s = (await r.json()) as ServerStatus;
        if (s.ready) {
          set("ready");
          return true;
        }
        set("starting", `importing Mathlib`);
        misses = 0;
      } catch (e) {
        if (++misses >= 5) {
          set("failed", `can't reach the ProofReps server (${(e as Error).message})`);
          return false;
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    set("failed", "the server's Lean didn't come up");
    return false;
  })().finally(() => {
    starting = null;
  });
  return starting;
}

// Try again after a failure.
export function retry() {
  starting = null;
  set("idle");
}

// Check one Lean file: every message Lean has about it.
export async function check(code: string): Promise<Message[]> {
  if (status !== "ready" && !(await start())) throw new Error(detail || "Lean isn't available.");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(asset("api/check"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
      signal: ctl.signal,
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error ?? `the server said HTTP ${r.status}`);
    return body.messages as Message[];
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("The server didn't answer in time.");
    if (e instanceof TypeError) {
      // the network, not Lean: find out whether the server is still there
      set("idle");
      start();
      throw new Error("Couldn't reach the ProofReps server.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Probes fire as the learner types; on each channel ("goal", "file") only the
// newest one matters. At most one per channel is in flight: a probe that's
// overtaken by a newer one before it's sent is dropped (resolves to null).
const channels = new Map<string, { busy: boolean; next: null | { code: string; resolve: (m: Message[] | null) => void; reject: (e: Error) => void } }>();
export function probe(channel: string, code: string): Promise<Message[] | null> {
  let ch = channels.get(channel);
  if (!ch) channels.set(channel, (ch = { busy: false, next: null }));
  const c = ch;
  return new Promise((resolve, reject) => {
    c.next?.resolve(null);
    c.next = { code, resolve, reject };
    pump(c);
  });
}
function pump(c: NonNullable<ReturnType<typeof channels.get>>) {
  if (c.busy || !c.next) return;
  const job = c.next;
  c.next = null;
  c.busy = true;
  check(job.code)
    .then(job.resolve, job.reject)
    .finally(() => {
      c.busy = false;
      pump(c);
    });
}
