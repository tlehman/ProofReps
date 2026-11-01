// Course content. Every exercise's Lean is checked by `bun run verify` against
// the same server-side Lean (with Mathlib) the app uses: solutions must pass, wrong answers
// must fail, and a choice exercise's `verify` source must print what it claims.
//
// kinds:
//   choice  pick one; graded instantly (the options were checked by Lean at build)
//   fill    type what goes in the `___` of `template`; graded by real Lean
//   proof   a fill whose answer is a whole proof (usually a tactic block)
//   fix     `start` is broken code the learner edits until Lean accepts it
//
// Text fields are tiny markdown: paragraphs, `code`, **bold**, *em*, and
// ```lean fenced blocks```.

export interface Choice {
  kind: "choice";
  options: string[];
  answer: number; // index into options
  verify?: { src: string; expect: string[] }; // Lean that must compile and print each expect string
}

export interface Fill {
  kind: "fill" | "proof" | "fix";
  template: string; // exactly one `___`
  start?: string; // what the editor starts with (fix: the broken code)
  solutions: string[]; // each must check
  wrong?: string[]; // each must fail (and for fix, `start` must fail too)
  hint?: string;
}

export type Exercise = {
  id: string;
  title: string;
  body: string; // the teaching, shown above the task
  code?: string; // Lean shown above the prompt
  prompt: string;
  explain: string; // shown after an answer
} & (Choice | Fill);

export interface Lesson {
  id: string;
  title: string;
  exercises: Exercise[];
}

export interface Unit {
  id: string;
  title: string;
  blurb: string;
  lessons: Lesson[];
}

export const isFill = (e: Exercise): e is Exercise & Fill => e.kind !== "choice";
