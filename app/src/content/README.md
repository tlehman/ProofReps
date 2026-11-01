# Writing exercises

Each unit is one file, `uNN.ts`, exporting a `Unit` (schema in `types.ts`), listed in `index.ts`.
`u01.ts` is the reference: copy its shape and tone.

Every exercise is checked by real Lean before it ships:

    bun scripts/verify.ts app/src/content/u05.ts      # one unit file (listed in index.ts or not)
    bun scripts/verify.ts u05-l2                       # by id prefix, among the listed units
    bun scripts/verify.ts                              # everything

It runs the same Lean the app's server runs: Lean 4 with **all of Mathlib already imported** (no
`import` lines needed; Mathlib's names and notation are in scope, so pick names that don't clash).
A unit isn't done until it reports `0 problems`.

To try Lean by hand, put code in a file and run `bun scripts/lean.ts file.lean`.
It prints every message with its line, including parse errors.

## Ids and shape

- Unit `u05`, lessons `u05-l1`, `u05-l2`, exercises `u05-l1-e1` ... Ids never change once shipped
  (progress is keyed on them).
- A unit has 2 lessons of 6 exercises. Each lesson mixes kinds: at least 2 `choice` and at least 3
  that Lean grades (`fill`, `proof`, `fix`). Each unit has at least one `fix`.
- Order within a lesson goes from seeing an idea to using it.

## Kinds

- `choice`: 4 options, `answer` is the index of the right one. `verify.src` must compile with no errors,
  and every string in `verify.expect` must appear in Lean's output (whitespace-insensitive). Use it to
  prove the right option is right: if the question is "what does this print", `expect` holds that output.
  Wrong options should be plausible mistakes, not jokes.
- `fill`: `template` has exactly one `___`; the learner types what goes there. Graded by Lean: any answer
  that makes every declaration in the template check, without `sorry`, is correct. Not just the stock ones.
- `proof`: a `fill` whose hole is a whole proof, usually after `:= by` on its own line:

  ```ts
  template: "theorem and_swap (p q : Prop) (h : p ∧ q) : q ∧ p := by\n  ___",
  ```

  Multi-line answers are indented to the hole's column automatically.
- `fix`: `start` is broken code that fills the hole (the learner starts from it and edits). `start` must fail
  in Lean (the verifier checks), and the body should tell the learner to read Lean's error.

For every Lean-graded exercise:

- `solutions`: one or more answers that pass. Give the natural alternatives (`omega` *and* the manual proof).
- `wrong`: one or more answers that fail and that a learner might plausibly type. The verifier proves they fail,
  which proves the exercise isn't vacuous. If a "wrong" answer passes, the exercise is too loose: tighten the
  template (add an `example` test) rather than deleting the wrong answer.
- `hint` (optional): one nudge, shown on request.
- Use `example : f 3 = 9 := rfl` (or `by decide`) lines in templates as tests that pin a definition down.
- Templates must not contain `sorry`. Every `theorem`/`def`/`example` in a template is checked with
  `#print axioms`, so a `sorry` anywhere fails the exercise.

## Lean available

Core Lean 4 (about v4.33): `Nat`, `Int`, `List`, `Array`, `String`, `Option`, `Fin`, subtypes, `structure`,
`inductive`, `class`/`instance`, `deriving Repr, DecidableEq`, `termination_by`, `decreasing_by`.
Tactics: `intro`, `exact`, `apply`, `refine`, `constructor`, `cases`, `rcases`, `obtain`, `induction ... with`,
`rw`, `simp`, `simp only`, `simp at`, `omega`, `decide`, `rfl`, `exists`, `left`, `right`, `exfalso`,
`contradiction`, `trivial`, `calc`, `show`, `have`, `unfold`, `split`, `funext`, `ext` (where instances
exist), `exact?` is **not** available. No Mathlib: no `use` (core has `exists`), `ring`, `linarith`, `norm_num`,
`positivity`, `tauto`. Check anything you're unsure of with the headless runner.

Write `Nat`, not `ℕ`, in Lean code (core has no `ℕ` notation). In prose, ℕ, ℤ are fine.

## Voice

- Motivation before definition: say why the idea matters, then what it is. Short paragraphs, one idea each.
- Address the learner as "you". Bold a key term at first introduction.
- `body` teaches (2 to 4 sentences); `prompt` is one sentence saying what to do; `explain` says *why* the answer
  is right and what the common mistake is.
- Never use the em dash character. Use a period and start a new sentence, or a colon.
- In lists, the delimiter after a label is a colon.
- Text is tiny markdown: paragraphs, `code`, **bold**, *em*. In TypeScript strings, a backslash for Lean's input
  method (`\to`) is written `\\to`.
