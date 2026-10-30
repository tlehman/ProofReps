import type { Unit } from "./types";

const EXPR = `inductive Expr where
  | num : Nat → Expr
  | add : Expr → Expr → Expr
  | mul : Expr → Expr → Expr

open Expr

def eval : Expr → Nat
  | num n => n
  | add a b => eval a + eval b
  | mul a b => eval a * eval b
`;

const MKADD = `def mkAdd : Expr → Expr → Expr
  | num 0, e => e
  | e, num 0 => e
  | num a, num b => num (a + b)
  | a, b => add a b
`;

const SIMPLIFY = `def simplify : Expr → Expr
  | num n => num n
  | add a b => mkAdd (simplify a) (simplify b)
  | mul a b => mul (simplify a) (simplify b)
`;

const EVAL_MKADD = `theorem eval_mkAdd (a b : Expr) : eval (mkAdd a b) = eval a + eval b := by
  unfold mkAdd
  split
  all_goals simp [eval]
`;

const INSTR = `inductive Instr where
  | push : Nat → Instr
  | add
  | mul
`;

const RUN = `def run : List Instr → List Nat → List Nat
  | [], s => s
  | .push n :: is, s => run is (n :: s)
  | .add :: is, b :: a :: s => run is ((a + b) :: s)
  | .mul :: is, b :: a :: s => run is ((a * b) :: s)
  | _ :: _, s => s
`;

const COMPILE = `def compile : Expr → List Instr
  | num n => [.push n]
  | add a b => compile a ++ compile b ++ [.add]
  | mul a b => compile a ++ compile b ++ [.mul]
`;

const COMPILE_OK = `theorem compile_ok (e : Expr) (is : List Instr) (s : List Nat) :
    run (compile e ++ is) s = run is (eval e :: s) := by
  induction e generalizing is s with
  | num n => rfl
  | add a b iha ihb => simp [compile, run, eval, iha, ihb]
  | mul a b iha ihb => simp [compile, run, eval, iha, ihb]
`;

export const u12: Unit = {
  id: "u12",
  title: "Capstone: a verified compiler",
  blurb: "Write a tiny language, an optimizer and a compiler to a stack machine. Then prove they never change the answer.",
  lessons: [
    {
      id: "u12-l1",
      title: "An optimizer you can trust",
      exercises: [
        {
          id: "u12-l1-e1",
          kind: "choice",
          title: "A language in ten lines",
          body: "Compilers are where a single bug silently corrupts every program built with them. In 2009 the [CompCert](https://compcert.org) C compiler was proved correct, and testers who found hundreds of bugs in GCC and LLVM found none in its verified core. You'll build the same kind of result in miniature. Start with a language: an **abstract syntax tree** `Expr`, and an interpreter `eval` that gives each tree its meaning.",
          code: EXPR + "\n#eval eval (add (num 2) (mul (num 3) (num 4)))",
          prompt: "What does it print?",
          options: ["14", "20", "24", "9"],
          answer: 0,
          explain: "The tree is `2 + (3 * 4)`. Its shape fixes the grouping, so there's no precedence to get wrong: `mul` sits inside `add`, giving `2 + 12 = 14`. `20` is what `(2 + 3) * 4` would give.",
          verify: { src: EXPR + "\n#eval eval (add (num 2) (mul (num 3) (num 4)))", expect: ["14"] },
        },
        {
          id: "u12-l1-e2",
          kind: "fill",
          title: "The meaning of mul",
          body: "`eval` is the **semantics** of the language: the spec every later transformation must respect. It's structural recursion on the tree, one case per constructor.",
          prompt: "Complete the `mul` case of `eval`.",
          template:
            "inductive Expr where\n  | num : Nat → Expr\n  | add : Expr → Expr → Expr\n  | mul : Expr → Expr → Expr\n\nopen Expr\n\ndef eval : Expr → Nat\n  | num n => n\n  | add a b => eval a + eval b\n  | mul a b => ___\n\nexample : eval (mul (num 6) (num 7)) = 42 := rfl\nexample : eval (add (num 2) (mul (num 3) (num 4))) = 14 := rfl",
          solutions: ["eval a * eval b", "eval b * eval a"],
          wrong: ["a * b", "eval a + eval b", "eval a * b"],
          explain: "`eval a * eval b`: evaluate both subtrees, then multiply the numbers. Writing `a * b` fails because `a` and `b` are trees, not numbers: there's no `*` on `Expr`.",
        },
        {
          id: "u12-l1-e3",
          kind: "choice",
          title: "A smart constructor",
          body: "An optimizer rewrites a program into a cheaper one with the same meaning. Ours is built from a **smart constructor** `mkAdd`: it builds an addition, but folds constants and drops `+ 0` as it goes. `simplify` rebuilds the tree bottom up, using `mkAdd` for every `add`.",
          code: MKADD + "\n" + SIMPLIFY + "\n#reduce simplify (add (num 0) (mul (num 2) (num 3)))",
          prompt: "What is `simplify (add (num 0) (mul (num 2) (num 3)))`?",
          options: ["mul (num 2) (num 3)", "num 6", "add (num 0) (mul (num 2) (num 3))", "num 0"],
          answer: 0,
          explain: "`mkAdd (num 0) e` returns `e`, so the `+ 0` disappears. But `mul` is rebuilt as-is: this optimizer has no folding rule for multiplication, so it doesn't become `num 6`. Lean prints `mul (num 2) (num 3)` as `(num 2).mul (num 3)`.",
          verify: { src: EXPR + "\n" + MKADD + "\n" + SIMPLIFY + "\n#reduce simplify (add (num 0) (mul (num 2) (num 3)))", expect: ["(num 2).mul (num 3)"] },
        },
        {
          id: "u12-l1-e4",
          kind: "fill",
          title: "Constant folding",
          body: "**Constant folding** does arithmetic at compile time: `2 + 3` in the source becomes `5` in the output. Patterns in `mkAdd` are tried top to bottom, so this case only fires when neither side is `num 0`.",
          prompt: "Fold the sum of two constants into one constant.",
          template:
            EXPR +
            "\ndef mkAdd : Expr → Expr → Expr\n  | num 0, e => e\n  | e, num 0 => e\n  | num a, num b => ___\n  | a, b => add a b\n\nexample : mkAdd (num 2) (num 3) = num 5 := rfl\nexample : mkAdd (num 0) (num 7) = num 7 := rfl",
          solutions: ["num (a + b)", "num (b + a)"],
          wrong: ["add (num a) (num b)", "num a", "a + b"],
          explain: "`num (a + b)` adds the two numbers now, once, instead of every time the program runs. `add (num a) (num b)` has the right meaning but doesn't fold, so the test catches it. `a + b` is a `Nat`, not an `Expr`.",
        },
        {
          id: "u12-l1-e5",
          kind: "proof",
          title: "The smart constructor is honest",
          body: "Now the spec: `mkAdd a b` must mean the same as `add a b`. Its `match` has four overlapping cases, and `split` gives you one goal per case, each with the match already resolved. Then one tactic, run on `all_goals`, finishes them.",
          prompt: "Finish every case.",
          template: EXPR + "\n" + MKADD + "\ntheorem eval_mkAdd (a b : Expr) : eval (mkAdd a b) = eval a + eval b := by\n  unfold mkAdd\n  split\n  all_goals ___",
          solutions: ["simp [eval]", "simp [eval, Nat.add_comm]"],
          wrong: ["rfl", "omega"],
          explain: "`simp [eval]` evaluates `eval (num 0)` to `0` and `eval (num a)` to `a`, and then each goal is a simple identity like `eval b = 0 + eval b`. `rfl` fails on that one: `0 + n = n` is true but not by computation, since `+` recurses on its right argument.",
          hint: "Each goal mentions `eval` of a `num`. Let `simp` unfold `eval`.",
        },
        {
          id: "u12-l1-e6",
          kind: "proof",
          title: "The optimizer is correct",
          body: "The headline theorem: for **every** expression, simplifying preserves the value. Induction on `e` gives one case per constructor, with induction hypotheses for the subtrees. The lemma `eval_mkAdd` from the last exercise does the work in the `add` case.",
          prompt: "Prove the `add` case.",
          template:
            EXPR +
            "\n" +
            MKADD +
            "\n" +
            SIMPLIFY +
            "\n" +
            EVAL_MKADD +
            "\ntheorem simplify_ok (e : Expr) : eval (simplify e) = eval e := by\n  induction e with\n  | num n => rfl\n  | add a b iha ihb => ___\n  | mul a b iha ihb => simp [simplify, eval, iha, ihb]",
          solutions: ["simp [simplify, eval_mkAdd, eval, iha, ihb]", "rw [simplify, eval_mkAdd, iha, ihb]; rfl", "simp [simplify, eval_mkAdd, eval, *]"],
          wrong: ["simp [simplify, eval]", "simp [simplify, eval_mkAdd, eval]", "rfl"],
          explain: "Unfold `simplify` to get `eval (mkAdd (simplify a) (simplify b))`, rewrite with `eval_mkAdd`, then the induction hypotheses turn `eval (simplify a)` into `eval a`. Leave out `eval_mkAdd` and `simp` is stuck on the `match` inside `mkAdd`; leave out `iha, ihb` and it's stuck on `eval (simplify a)`.",
          hint: "You need `simplify`, `eval_mkAdd`, `eval`, and both hypotheses.",
        },
      ],
    },
    {
      id: "u12-l2",
      title: "Compiling to a stack machine",
      exercises: [
        {
          id: "u12-l2-e1",
          kind: "choice",
          title: "A stack machine",
          body: "Real hardware doesn't evaluate trees. It runs flat lists of instructions. Our target is a **stack machine**, like the JVM or WebAssembly: `push n` puts `n` on the stack, and `add` and `mul` pop two numbers and push the result. `run` executes a program, with the top of the stack at the head of the list.",
          code: INSTR + "\n" + RUN + "\n#eval run [.push 2, .push 3, .push 4, .mul, .add] []",
          prompt: "What does it print?",
          options: ["[14]", "[20]", "[2, 12]", "[24]"],
          answer: 0,
          explain: "After the pushes the stack is `[4, 3, 2]`. `mul` pops 4 and 3 and pushes 12: `[12, 2]`. `add` pops 12 and 2 and pushes 14. That's `2 + 3 * 4`, in **postfix** order.",
          verify: { src: INSTR + "\n" + RUN + "\n#eval run [.push 2, .push 3, .push 4, .mul, .add] []", expect: ["[14]"] },
        },
        {
          id: "u12-l2-e2",
          kind: "fill",
          title: "Executing add",
          body: "Each instruction is one case of `run`. The pattern `b :: a :: s` matches a stack with at least two numbers: `b` on top, `a` under it, and the rest `s`. After the instruction, `run` must **continue** with the remaining program.",
          prompt: "Complete the `add` case.",
          template:
            INSTR +
            "\ndef run : List Instr → List Nat → List Nat\n  | [], s => s\n  | .push n :: is, s => run is (n :: s)\n  | .add :: is, b :: a :: s => ___\n  | .mul :: is, b :: a :: s => run is ((a * b) :: s)\n  | _ :: _, s => s\n\nexample : run [.push 2, .push 3, .add] [] = [5] := rfl\nexample : run [.push 7, .push 4, .add, .push 2, .mul] [] = [22] := rfl",
          solutions: ["run is ((a + b) :: s)", "run is ((b + a) :: s)"],
          wrong: ["(a + b) :: s", "run is (a :: b :: s)", "run is ((a + b) :: a :: s)"],
          explain: "Pop `b` and `a`, push `a + b`, and keep running `is`. Returning `(a + b) :: s` passes the first test but halts the machine early: the second test's `push 2, mul` never runs.",
        },
        {
          id: "u12-l2-e3",
          kind: "fill",
          title: "The compiler",
          body: "The compiler flattens a tree into postfix: code for the left operand, code for the right, then the operator. When the operator runs, both values are waiting on the stack. The test pins the exact instruction order.",
          prompt: "Complete the `add` case of `compile`.",
          template:
            EXPR +
            "\n" +
            INSTR +
            "\n" +
            RUN +
            "\ndef compile : Expr → List Instr\n  | num n => [.push n]\n  | add a b => ___\n  | mul a b => compile a ++ compile b ++ [.mul]\n\nexample : compile (add (num 2) (num 3)) = [.push 2, .push 3, .add] := rfl\nexample : run (compile (add (num 2) (mul (num 3) (num 4)))) [] = [14] := rfl",
          solutions: ["compile a ++ compile b ++ [.add]", "compile a ++ compile b ++ [Instr.add]", "(compile a ++ compile b) ++ [.add]"],
          wrong: ["[.add] ++ compile a ++ compile b", "compile a ++ [.add] ++ compile b", "compile b ++ compile a ++ [.add]"],
          explain: "Operands first, operator last. Putting `.add` before `compile b` runs it with only one value on the stack. `compile b ++ compile a` would compute the same sum, since `+` commutes, but the test asks for the standard left-to-right order.",
        },
        {
          id: "u12-l2-e4",
          kind: "choice",
          title: "Generalize before you induct",
          body: "The goal is `run (compile e) [] = [eval e]`. Prove it directly by induction and you get stuck: in the `add` case, `compile a` is followed by more code, and `compile b` runs on a stack that isn't empty. The fix is to prove a **stronger** statement, for any code after it and any starting stack.",
          code: "theorem compile_ok (e : Expr) (is : List Instr) (s : List Nat) :\n    run (compile e ++ is) s = run is (eval e :: s)",
          prompt: "Why does `compile_ok` mention `is` and `s`?",
          options: [
            "So the induction hypotheses apply to `compile a` and `compile b` inside a bigger program",
            "Because `run` crashes on an empty stack",
            "To make the theorem easier to state",
            "Because `compile` needs an initial stack",
          ],
          answer: 0,
          explain: "In the `add` case the code is `compile a ++ (compile b ++ add :: is)`. The hypothesis for `a` must handle the trailing `compile b ++ ...`, and the one for `b` must handle the stack `eval a :: s`. That's why the proof says `induction e generalizing is s`. A weaker theorem has weaker hypotheses: generalizing is how you strengthen them.",
          verify: {
            src: EXPR + "\n" + INSTR + "\n" + RUN + "\n" + COMPILE + "\n" + COMPILE_OK + "\n#check @compile_ok",
            expect: ["compile_ok : ∀ (e : Expr) (is : List Instr) (s : List Nat), run (compile e ++ is) s = run is (eval e :: s)"],
          },
        },
        {
          id: "u12-l2-e5",
          kind: "proof",
          title: "The key lemma",
          body: "This is the heart of compiler correctness. In the `add` case, `simp` reassociates the `++`, the hypothesis `iha` runs `compile a`, then `ihb` runs `compile b`, and the definition of `run` executes the final `add`. Each hypothesis is a `∀`, so `simp` can use it at whatever program and stack it finds.",
          prompt: "Prove the `add` case.",
          template:
            EXPR +
            "\n" +
            INSTR +
            "\n" +
            RUN +
            "\n" +
            COMPILE +
            "\ntheorem compile_ok (e : Expr) (is : List Instr) (s : List Nat) :\n    run (compile e ++ is) s = run is (eval e :: s) := by\n  induction e generalizing is s with\n  | num n => rfl\n  | add a b iha ihb => ___\n  | mul a b iha ihb => simp [compile, run, eval, iha, ihb]",
          solutions: ["simp [compile, run, eval, iha, ihb]", "simp [compile, run, eval, *]", "simp [compile, iha, ihb, run, eval]"],
          wrong: ["simp [compile, run, eval]", "rfl", "simp [compile, iha]"],
          explain: "`simp [compile, run, eval, iha, ihb]` does all four steps. Without `iha` and `ihb`, `simp` can't see through `run (compile a ++ ...)`, because `compile a` is an unknown program. The induction hypotheses are what let you reason about it anyway.",
          hint: "Give `simp` the three definitions and both hypotheses.",
        },
        {
          id: "u12-l2-e6",
          kind: "fix",
          title: "The compiler is correct",
          body: "The theorem you wanted all along is a special case: no code after, empty stack to start. But `compile_ok e [] []` talks about `compile e ++ []` and `run [] [eval e]`, which only *equal* `compile e` and `[eval e]` after a little simplification. Read Lean's type mismatch, then close the gap.",
          prompt: "Make the final theorem check.",
          template:
            EXPR +
            "\n" +
            INSTR +
            "\n" +
            RUN +
            "\n" +
            COMPILE +
            "\n" +
            COMPILE_OK +
            "\ntheorem compile_correct (e : Expr) : run (compile e) [] = [eval e] := by\n  ___",
          start: "exact compile_ok e [] []",
          solutions: [
            "simpa [run] using compile_ok e [] []",
            "have h := compile_ok e [] []\nsimp at h\nexact h",
            "rw [← List.append_nil (compile e), compile_ok]\nrfl",
            "have h := compile_ok e [] []\nrw [List.append_nil] at h\nexact h",
          ],
          wrong: ["exact compile_ok e [] []", "simp [compile_ok]", "rfl"],
          explain: "`simpa [run] using compile_ok e [] []` simplifies both the goal and the lemma: `xs ++ []` becomes `xs`, and `run [] s` becomes `s`. Then they match. `exact` fails because `compile e ++ []` is not definitionally `compile e` for an unknown `e`. And with that, you've proved a compiler correct for every program it will ever compile.",
          hint: "`List.append_nil : as ++ [] = as`. Or let `simpa` do the cleanup.",
        },
      ],
    },
  ],
};
