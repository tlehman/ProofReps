// Progress, kept in localStorage as one JSON document. The scheduling math
// (boxes, due dates, streaks, XP, levels) is the Rust core's.
import type { Core, Status } from "./core";

export interface Card {
  status: Status;
  box: number;
  due: number; // ms since epoch
  missed: boolean; // the last attempt in this lesson was a miss
  answer?: string; // the learner's last accepted answer
}

// Where an unfinished lesson stands, so it resumes instead of restarting.
export interface Spot {
  queue: string[]; // exercise ids still to do, next first
  done: number;
  mistakes: number;
  xp: number;
}

export interface State {
  v: 1;
  cards: Record<string, Card>;
  lessons: Record<string, number>; // lesson id -> ms it was first completed
  xp: number;
  streak: number;
  lastDay: number; // local day number of the last practice, -1 never
  daily: Record<string, number>; // day number -> XP that day
  goal: number; // daily XP goal
  drafts: Record<string, string>; // exercise id -> unfinished answer
  playground: string;
  spots: Record<string, Spot>; // lesson id -> unfinished lesson's position
}

const KEY = "proofreps:v1";

export const empty = (): State => ({ v: 1, cards: {}, lessons: {}, xp: 0, streak: 0, lastDay: -1, daily: {}, goal: 30, drafts: {}, playground: "", spots: {} });

export function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch {}
  return empty();
}

export function save(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

// Local day number: days since the epoch in this time zone.
export const dayOf = (ms: number) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / 86_400_000);

// Record one graded answer. Returns the XP it earned.
export function answer(core: Core, s: State, id: string, kind: "choice" | "fill" | "proof", correct: boolean, now = Date.now()): number {
  const prev = s.cards[id] ?? { status: "new", box: 0, due: 0, missed: false };
  const afterMiss = prev.missed && correct;
  const box = core.nextBox(prev.box, correct, afterMiss);
  s.cards[id] = {
    ...prev,
    status: correct ? "correct" : "wrong",
    box,
    due: correct ? core.dueMs(now, box, afterMiss) : now,
    missed: !correct,
  };
  return addXp(core, s, core.xp(kind, correct, afterMiss), now);
}

export function addXp(core: Core, s: State, xp: number, now = Date.now()): number {
  const today = dayOf(now);
  if (xp > 0) {
    s.streak = core.streakAfterPractice(s.lastDay, s.streak, today);
    s.lastDay = today;
  }
  s.xp += xp;
  s.daily[today] = (s.daily[today] ?? 0) + xp;
  return xp;
}

// Exercises due for review, best first: missed ones, then the most overdue.
export function due(core: Core, s: State, ids: string[], now = Date.now()): string[] {
  return ids
    .map((id, order) => {
      const c = s.cards[id];
      return { id, r: c && c.status !== "new" ? core.rank(c.status, c.due, now, order) : -1 };
    })
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.id);
}
