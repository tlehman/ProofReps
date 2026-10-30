import type { Unit } from "./types";

const LEN = "def len : List α → Nat\n  | [] => 0\n  | _ :: xs => len xs + 1\n";
const APP = "def app : List α → List α → List α\n  | [], ys => ys\n  | x :: xs, ys => x :: app xs ys\n";
const MAP = "def mymap (f : α → β) : List α → List β\n  | [] => []\n  | x :: xs => f x :: mymap f xs\n";
const REV = "def rev : List α → List α\n  | [] => []\n  | x :: xs => rev xs ++ [x]\n";
const LEN_APPEND =
  "theorem len_append (xs ys : List α) : len (xs ++ ys) = len xs + len ys := by\n  induction xs with\n  | nil => simp [len]\n  | cons x xs ih => simp [len, ih]; omega\n";
const LEN_APP_TRACE =
  LEN +
  "\n" +
  APP +
  "\ntheorem len_app (xs ys : List α) : len (app xs ys) = len xs + len ys := by\n  induction xs with\n  | nil => simp [app, len]\n  | cons x xs ih => trace_state; simp [app, len, ih]; omega";

export const u08: Unit = {
  id: "u08",
  title: "Proofs about lists",
  blurb: "Lists are built like the naturals: empty, or one more in front. So you prove things about them the same way, by induction.",
  lessons: [
    {
      id: "u08-l1",
      title: "Induction on lists",
      exercises: [
        {
          id: "u08-l1-e1",
          kind: "choice",
          title: "Lists are inductive too",
          body: "A `List` is either `[]` (nil) or `x :: xs` (cons): an element in front of a shorter list. That is the same shape as `Nat`, so the same proof method works. `induction xs with | nil => .. | cons x xs ih => ..` gives you two goals, and in the cons case an **induction hypothesis** `ih` about the tail `xs`.",
          code: LEN_APP_TRACE,
          prompt: "In the `cons` case, what is `ih`?",
          options: [
            "ih : len (app xs ys) = len xs + len ys",
            "ih : len (app (x :: xs) ys) = len (x :: xs) + len ys",
            "ih : ∀ xs, len (app xs ys) = len xs + len ys",
            "there is no ih: induction only works on Nat",
          ],
          answer: 0,
          explain: "`ih` is the statement for the tail `xs`, and the goal is the statement for `x :: xs`. The second option is the goal itself: if you had that, there would be nothing left to prove.",
          verify: {
            src: LEN_APP_TRACE,
            expect: ["ih : len (app xs ys) = len xs + len ys", "⊢ len (app (x :: xs) ys) = len (x :: xs) + len ys"],
          },
        },
        {
          id: "u08-l1-e2",
          kind: "fill",
          title: "Your own length",
          body: "Before you can prove facts about a function, you need the function. Recursion on a list mirrors its two shapes: one equation for `[]`, one for `_ :: xs` that calls itself on the tail.",
          prompt: "Finish the cons case of `len`.",
          template: "def len : List α → Nat\n  | [] => 0\n  | _ :: xs => ___\n\nexample : len ([] : List Nat) = 0 := rfl\nexample : len [7, 8, 9] = 3 := rfl\nexample : len [\"a\", \"b\"] = 2 := rfl",
          solutions: ["len xs + 1", "1 + len xs", "Nat.succ (len xs)"],
          wrong: ["len xs", "len xs + 2", "1"],
          explain: "The length of `x :: xs` is one more than the length of `xs`. Writing `len xs` forgets to count the head, so every list gets length 0.",
          hint: "One more than the length of the tail.",
        },
        {
          id: "u08-l1-e3",
          kind: "proof",
          title: "Appending nothing",
          body: "`simp [app]` rewrites with the defining equations of `app`, the same way running the code would: it turns `app (x :: xs) []` into `x :: app xs []`. It does **not** use your hypotheses unless you list them: write `simp [app, ih]` to hand it the induction hypothesis too.",
          prompt: "Finish the cons case.",
          template: APP + "\ntheorem app_nil (xs : List Nat) : app xs [] = xs := by\n  induction xs with\n  | nil => rfl\n  | cons x xs ih => ___",
          solutions: ["simp [app, ih]", "rw [app, ih]", "unfold app; rw [ih]", "simp [app]; exact ih", "show x :: app xs [] = x :: xs; rw [ih]"],
          wrong: ["rfl", "simp [app]", "exact ih"],
          explain: "Unfolding `app` gives `x :: app xs [] = x :: xs`, and `ih` turns the left side into `x :: xs`. Plain `simp [app]` gets stuck at `app xs [] = xs`: exactly `ih`, which it wasn't given. `exact ih` alone fails because the goal still has `x ::` in front.",
          hint: "Unfold `app` once, then rewrite with `ih`.",
        },
        {
          id: "u08-l1-e4",
          kind: "choice",
          title: "What simp leaves behind",
          body: "When `simp` can't finish, it leaves the simplest goal it found, and that goal tells you what's missing. Here `simp` gets the definitions but not `ih`.",
          code: LEN + "\n" + APP + "\n-- inside the cons case of len_app:\n  simp [app, len]",
          prompt: "What goal is left after `simp [app, len]`?",
          options: [
            "len (app xs ys) + 1 = len xs + 1 + len ys",
            "len (app (x :: xs) ys) = len (x :: xs) + len ys",
            "len xs + len ys + 1 = len xs + 1 + len ys",
            "no goal: simp proves it",
          ],
          answer: 0,
          explain: "`simp` unfolds `app` and `len` one step on each side, but `len (app xs ys)` is stuck: that is the left side of `ih`, which `simp` wasn't given. With `ih` the rest is arithmetic, and `omega` can use `ih` from the context by itself.",
          verify: {
            src: LEN + "\n" + APP + "\ntheorem len_app (xs ys : List α) : len (app xs ys) = len xs + len ys := by\n  induction xs with\n  | nil => simp [app, len]\n  | cons x xs ih => simp [app, len]; trace_state; omega",
            expect: ["⊢ len (app xs ys) + 1 = len xs + 1 + len ys"],
          },
        },
        {
          id: "u08-l1-e5",
          kind: "proof",
          title: "Length of an append",
          body: "Now the whole proof. Induct on the list the function recurses on, simplify with the definitions and `ih`, and let `omega` finish the arithmetic: `len xs + len ys + 1` and `len xs + 1 + len ys` are equal, but not syntactically.",
          prompt: "Prove that the length of an append is the sum of the lengths.",
          template: LEN + "\n" + APP + "\ntheorem len_app (xs ys : List α) : len (app xs ys) = len xs + len ys := by\n  ___",
          solutions: [
            "induction xs with\n| nil => simp [app, len]\n| cons x xs ih => simp [app, len, ih]; omega",
            "induction xs with\n| nil => simp [app, len]\n| cons x xs ih => simp [app, len]; omega",
            "induction xs with\n| nil => simp [app, len]\n| cons x xs ih => rw [app, len, len, ih]; omega",
          ],
          wrong: [
            "simp [app, len]",
            "induction xs with\n| nil => simp [app, len]\n| cons x xs ih => simp [app, len, ih]",
            "induction xs with\n| nil => rfl\n| cons x xs ih => simp [app, len]; omega",
          ],
          explain: "The nil case needs `simp` because `len [] + len ys` is `0 + len ys`, which isn't `len ys` by computation alone. In the cons case, `simp` with `ih` gets to `len xs + len ys + 1 = len xs + 1 + len ys` and `omega` closes it. Without induction, `simp` has no way to see inside `app xs ys`.",
          hint: "`induction xs with`, then `simp [app, len, ih]` and `omega`.",
        },
        {
          id: "u08-l1-e6",
          kind: "fix",
          title: "Induct on the right list",
          body: "`app` recurses on its **first** argument. Induction on any other variable leaves `app xs ...` stuck, because nothing tells Lean what shape `xs` has. Read the goal in Lean's error: it still contains `app xs`.",
          prompt: "This proof inducts on the wrong list. Fix it.",
          template: APP + "\ntheorem app_assoc (xs ys zs : List Nat) : app (app xs ys) zs = app xs (app ys zs) := by\n  ___",
          start: "induction ys with\n| nil => simp [app]\n| cons y ys ih => simp [app, ih]",
          solutions: [
            "induction xs with\n| nil => rfl\n| cons x xs ih => simp [app, ih]",
            "induction xs with\n| nil => simp [app]\n| cons x xs ih => simp [app, ih]",
            "induction xs with\n| nil => rfl\n| cons x xs ih => rw [app, app, app, ih]",
          ],
          wrong: [
            "induction xs with\n| nil => rfl\n| cons x xs ih => simp [app]",
            "induction zs with\n| nil => simp [app]\n| cons z zs ih => simp [app, ih]",
          ],
          explain: "Induct on `xs`, the list `app` takes apart. Then `app (x :: xs) ys` unfolds to `x :: app xs ys`, both sides peel off `x`, and `ih` closes what's left. The rule of thumb: induct on the argument the function recurses on.",
          hint: "Which argument does `app` pattern match on?",
        },
      ],
    },
    {
      id: "u08-l2",
      title: "Map and reverse",
      exercises: [
        {
          id: "u08-l2-e1",
          kind: "choice",
          title: "Composition",
          body: "`f ∘ g` is the function that does `g` first, then `f`: `(f ∘ g) x = f (g x)`. You'll need it to state how two maps combine. Type `∘` as `\\comp` or `\\o`.",
          code: "#eval ((· + 1) ∘ (· * 2)) 5",
          prompt: "What does it print?",
          options: ["11", "12", "10", "7"],
          answer: 0,
          explain: "The right-hand function runs first: `5 * 2 = 10`, then `10 + 1 = 11`. Reading `∘` left to right gives `12`, the classic mistake.",
          verify: { src: "#eval ((· + 1) ∘ (· * 2)) 5", expect: ["11"] },
        },
        {
          id: "u08-l2-e2",
          kind: "proof",
          title: "Map distributes over append",
          body: "Mapping over a joined list is the same as mapping each part and joining. You rely on facts like this every time you refactor a loop. `simp` already knows that `(x :: xs) ++ ys` is `x :: (xs ++ ys)`.",
          prompt: "Prove that `mymap f` distributes over `++`.",
          template: MAP + "\ntheorem mymap_append (f : α → β) (xs ys : List α) :\n    mymap f (xs ++ ys) = mymap f xs ++ mymap f ys := by\n  ___",
          solutions: [
            "induction xs with\n| nil => rfl\n| cons x xs ih => simp [mymap, ih]",
            "induction xs with\n| nil => simp [mymap]\n| cons x xs ih => simp [mymap, ih]",
            "induction xs with\n| nil => rfl\n| cons x xs ih => rw [List.cons_append, mymap, mymap, ih, List.cons_append]",
          ],
          wrong: ["simp [mymap]", "induction xs with\n| nil => rfl\n| cons x xs ih => simp [mymap]"],
          explain: "Induct on `xs`. In the cons case both sides start with `f x`, and `ih` handles the tail. Forget `ih` and `simp` stops at exactly the statement for the tail.",
          hint: "Same pattern as `len_app`: induction on `xs`, `simp [mymap, ih]`.",
        },
        {
          id: "u08-l2-e3",
          kind: "proof",
          title: "Map fusion",
          body: "**Two passes can be one.** Mapping `g` then mapping `f` is the same as mapping `f ∘ g` once. Compilers use this to remove intermediate lists, and now you can prove it is safe.",
          prompt: "Prove map fusion for `mymap`.",
          template: MAP + "\ntheorem mymap_mymap (f : β → γ) (g : α → β) (xs : List α) :\n    mymap f (mymap g xs) = mymap (f ∘ g) xs := by\n  ___",
          solutions: [
            "induction xs with\n| nil => rfl\n| cons x xs ih => simp [mymap, ih]",
            "induction xs with\n| nil => rfl\n| cons x xs ih => rw [mymap, mymap, mymap, ih]; rfl",
          ],
          wrong: ["rfl", "induction xs with\n| nil => rfl\n| cons x xs ih => simp [mymap]"],
          explain: "In the cons case the heads are `f (g x)` and `(f ∘ g) x`, which are equal by definition of `∘`, and the tails are equal by `ih`. `rfl` alone fails because `xs` is unknown, so nothing can compute.",
        },
        {
          id: "u08-l2-e4",
          kind: "choice",
          title: "When the induction hypothesis isn't enough",
          body: "A hand-written `rev` puts the head at the back: `rev (x :: xs) = rev xs ++ [x]`. Proving `len (rev xs) = len xs` by induction gets stuck, and the stuck goal tells you why.",
          code: LEN + "\n" + REV + "\ntheorem len_rev (xs : List α) : len (rev xs) = len xs := by\n  induction xs with\n  | nil => rfl\n  | cons x xs ih => simp [rev, len]  -- stuck:\n  -- ⊢ len (rev xs ++ [x]) = len xs + 1",
          prompt: "What do you need to finish the cons case?",
          options: ["a lemma: len (xs ++ ys) = len xs + len ys", "induction on x", "omega, which can see inside len", "a different nil case"],
          answer: 0,
          explain: "`ih` talks about `len (rev xs)`, but the goal has `len (rev xs ++ [x])`. A lemma about the length of `++` splits it into `len (rev xs) + len [x]`, and then `ih` applies. Proofs often need a helper lemma first: that's normal, not a failure.",
          verify: {
            src: LEN + "\n" + REV + "\n" + LEN_APPEND + "\ntheorem len_rev (xs : List α) : len (rev xs) = len xs := by\n  induction xs with\n  | nil => rfl\n  | cons x xs ih => simp [rev, len]; trace_state; rw [len_append, ih]; rfl",
            expect: ["⊢ len (rev xs ++ [x]) = len xs + 1"],
          },
        },
        {
          id: "u08-l2-e5",
          kind: "proof",
          title: "Reverse keeps the length",
          body: "With `len_append` proved, the stuck step comes apart. Pass the lemma to `simp` like a definition: `simp [rev, len, len_append, ih]`.",
          prompt: "Prove that `rev` preserves length.",
          template: LEN + "\n" + REV + "\n" + LEN_APPEND + "\ntheorem len_rev (xs : List α) : len (rev xs) = len xs := by\n  ___",
          solutions: [
            "induction xs with\n| nil => rfl\n| cons x xs ih => simp [rev, len, len_append, ih]",
            "induction xs with\n| nil => rfl\n| cons x xs ih => rw [rev, len_append, ih]; rfl",
            "induction xs with\n| nil => rfl\n| cons x xs ih => simp [rev, len_append, len]; omega",
          ],
          wrong: ["induction xs with\n| nil => rfl\n| cons x xs ih => simp [rev, len, ih]", "simp [rev, len, len_append]"],
          explain: "`len_append` splits `len (rev xs ++ [x])` into `len (rev xs) + len [x]`, `ih` replaces `len (rev xs)` with `len xs`, and `len [x]` computes to `1`. Leaving out `len_append` gets you the stuck goal from the previous exercise.",
          hint: "Use `len_append` in the cons case.",
        },
        {
          id: "u08-l2-e6",
          kind: "proof",
          title: "Borrow the library",
          body: "Once you prove your function **equals** the library's, every library lemma becomes yours. Here `mymap_eq` is given; you prove `len_eq`, and then `simp` finishes the last theorem with `List.length_map` and `List.length_append`, lemmas you never wrote.",
          prompt: "Prove `len xs = xs.length`.",
          template:
            LEN +
            "\n" +
            MAP +
            "\ntheorem mymap_eq (f : α → β) (xs : List α) : mymap f xs = xs.map f := by\n  induction xs with\n  | nil => rfl\n  | cons x xs ih => simp [mymap, ih]\n\ntheorem len_eq (xs : List α) : len xs = xs.length := by\n  ___\n\ntheorem len_mymap_append (f : α → β) (xs ys : List α) :\n    len (mymap f (xs ++ ys)) = len xs + len ys := by\n  simp [len_eq, mymap_eq]",
          solutions: [
            "induction xs with\n| nil => rfl\n| cons x xs ih => simp [len, ih]",
            "induction xs with\n| nil => rfl\n| cons x xs ih => rw [len, ih]; rfl",
            "induction xs with\n| nil => rfl\n| cons x xs ih => simp [len]; omega",
          ],
          wrong: ["rfl", "simp [len]", "induction xs with\n| nil => rfl\n| cons x xs ih => simp [len]"],
          explain: "Both functions add one per cons cell, so induction with `ih` shows they agree. After that, `simp [len_eq, mymap_eq]` rewrites everything into library terms, where `simp` already knows the answer. This is how you avoid reproving the world.",
        },
      ],
    },
  ],
};
