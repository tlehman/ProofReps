// The Rust core (core/, built to public/core.wasm by scripts/build-core.sh):
// spaced repetition, streaks, XP, levels, bracket checking and template
// filling. Strings go through two fixed buffers in its memory; everything else
// is numbers. Loads in the browser and in Bun (the verifier uses it too).

export type BracketIssue =
  | { kind: "unclosed"; at: number; open: string }
  | { kind: "stray"; at: number; close: string }
  | { kind: "mismatch"; at: number; open: string; close: string };

export interface Core {
  brackets(src: string): BracketIssue | null;
  fill(template: string, answer: string): string | null;
  nextBox(prev: number, correct: boolean, afterMiss: boolean): number;
  dueMs(nowMs: number, box: number, afterMiss: boolean): number;
  streakAfterPractice(lastDay: number, streak: number, today: number): number;
  streakToday(lastDay: number, streak: number, today: number): number;
  xp(kind: "choice" | "fill" | "proof", correct: boolean, afterMiss: boolean): number;
  lessonBonus(mistakes: number): number;
  level(xp: number): number;
  levelStart(level: number): number;
  rank(status: Status, dueMs: number, nowMs: number, order: number): number;
}

export type Status = "new" | "seen" | "correct" | "wrong" | "skipped";
const STATUS: Record<Status, number> = { new: 0, seen: 1, correct: 2, wrong: 3, skipped: 4 };
const KIND = { choice: 0, fill: 1, proof: 2 } as const;

interface Exports {
  memory: WebAssembly.Memory;
  pr_in_ptr(): number;
  pr_in_cap(): number;
  pr_out_ptr(): number;
  pr_brackets(len: number): number;
  pr_fill(templateLen: number, answerLen: number): number;
  pr_next_box(prev: number, correct: number, afterMiss: number): number;
  pr_due_ms(now: number, box: number, afterMiss: number): number;
  pr_streak_after_practice(lastDay: number, streak: number, today: number): number;
  pr_streak_today(lastDay: number, streak: number, today: number): number;
  pr_xp(kind: number, correct: number, afterMiss: number): number;
  pr_lesson_bonus(mistakes: number): number;
  pr_level(xp: number): number;
  pr_level_start(level: number): number;
  pr_rank(status: number, due: number, now: number, order: number): number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function loadCore(bytes: BufferSource): Promise<Core> {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const x = instance.exports as unknown as Exports;
  const cap = x.pr_in_cap();
  // Writes the strings back to back into the input buffer; null if too long.
  const put = (...parts: string[]): number[] | null => {
    const bufs = parts.map((p) => enc.encode(p));
    const total = bufs.reduce((n, b) => n + b.length, 0);
    if (total > cap) return null;
    const mem = new Uint8Array(x.memory.buffer, x.pr_in_ptr(), cap);
    let at = 0;
    for (const b of bufs) {
      mem.set(b, at);
      at += b.length;
    }
    return bufs.map((b) => b.length);
  };
  const b = (v: boolean) => (v ? 1 : 0);
  return {
    brackets(src) {
      const lens = put(src);
      if (!lens) return null;
      const kind = x.pr_brackets(lens[0]);
      if (kind === 0 || kind === 255) return null;
      const [at, open, close] = new Uint32Array(x.memory.buffer.slice(x.pr_out_ptr(), x.pr_out_ptr() + 12));
      const ch = (c: number) => String.fromCodePoint(c);
      if (kind === 1) return { kind: "unclosed", at, open: ch(open) };
      if (kind === 2) return { kind: "stray", at, close: ch(close) };
      return { kind: "mismatch", at, open: ch(open), close: ch(close) };
    },
    fill(template, answer) {
      const lens = put(template, answer);
      if (!lens) return null;
      const n = x.pr_fill(lens[0], lens[1]);
      return n < 0 ? null : dec.decode(new Uint8Array(x.memory.buffer, x.pr_out_ptr(), n));
    },
    nextBox: (prev, correct, afterMiss) => x.pr_next_box(prev, b(correct), b(afterMiss)),
    dueMs: (now, box, afterMiss) => x.pr_due_ms(now, box, b(afterMiss)),
    streakAfterPractice: (lastDay, streak, today) => x.pr_streak_after_practice(lastDay, streak, today),
    streakToday: (lastDay, streak, today) => x.pr_streak_today(lastDay, streak, today),
    xp: (kind, correct, afterMiss) => x.pr_xp(KIND[kind], b(correct), b(afterMiss)),
    lessonBonus: (mistakes) => x.pr_lesson_bonus(mistakes),
    level: (xp) => x.pr_level(xp),
    levelStart: (level) => x.pr_level_start(level),
    rank: (status, due, now, order) => x.pr_rank(STATUS[status], due, now, order),
  };
}
