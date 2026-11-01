import type { Unit } from "./types";

const WEEKDAY =
  "inductive Weekday where\n  | monday | tuesday | wednesday | thursday | friday | saturday | sunday\n  deriving Repr, DecidableEq\n\nopen Weekday\n";
const NEXT_PREV =
  "def next : Weekday → Weekday\n  | monday => tuesday | tuesday => wednesday | wednesday => thursday\n  | thursday => friday | friday => saturday | saturday => sunday | sunday => monday\n\ndef prev : Weekday → Weekday\n  | monday => sunday | tuesday => monday | wednesday => tuesday\n  | thursday => wednesday | friday => thursday | saturday => friday | sunday => saturday\n";
const TREE =
  "inductive BTree where\n  | leaf : BTree\n  | node : BTree → Nat → BTree → BTree\n\nopen BTree\n\ndef size : BTree → Nat\n  | leaf => 0\n  | node l _ r => size l + 1 + size r\n\ndef mirror : BTree → BTree\n  | leaf => leaf\n  | node l v r => node (mirror r) v (mirror l)\n";
const POINT = "structure Point where\n  x : Nat\n  y : Nat\n  deriving Repr\n";

export const u09: Unit = {
  id: "u09",
  title: "Inductive types and structures",
  blurb: "Make your own types: enums, trees and records. Then prove things about them with the tools you already have.",
  lessons: [
    {
      id: "u09-l1",
      title: "Inductive types",
      exercises: [
        {
          id: "u09-l1-e1",
          kind: "choice",
          title: "An enum is an inductive type",
          body: "`inductive` lists every way to build a value. When each constructor takes no arguments you get an **enum**. `deriving DecidableEq` asks Lean to write the equality test for you, so `decide` can answer whether two days are equal.",
          code: WEEKDAY + "\n#eval decide (monday = friday)",
          prompt: "What does the `#eval` print?",
          options: ["false", "true", "an error: no equality on Weekday", "monday = friday"],
          answer: 0,
          explain: "Different constructors are always different values, and `DecidableEq` lets Lean compute that. Without `deriving DecidableEq`, `decide` would fail to find a `Decidable` instance.",
          verify: { src: WEEKDAY + "\n#eval decide (monday = friday)", expect: ["false"] },
        },
        {
          id: "u09-l1-e2",
          kind: "fill",
          title: "Functions by match",
          body: "A function on an enum is a `match` with one arm per case. The wildcard `_` catches every constructor you didn't list, and arms separated by `|` share a right-hand side.",
          prompt: "Define `isWeekend`.",
          template:
            WEEKDAY +
            "\ndef isWeekend (d : Weekday) : Bool := ___\n\nexample : isWeekend saturday = true := rfl\nexample : isWeekend sunday = true := rfl\nexample : isWeekend monday = false := rfl\nexample : isWeekend friday = false := rfl",
          solutions: [
            "match d with\n  | saturday | sunday => true\n  | _ => false",
            "d == saturday || d == sunday",
            "decide (d = saturday ∨ d = sunday)",
          ],
          wrong: ["d == saturday", "match d with\n  | saturday => true\n  | _ => false", "true"],
          explain: "Two days are weekend days, so both need to return `true`. Matching only `saturday` passes three tests and fails on `sunday`: one reason to write more than one test.",
          hint: "`match d with`, one arm for the weekend days, `_` for the rest.",
        },
        {
          id: "u09-l1-e3",
          kind: "proof",
          title: "Proof by cases",
          body: "To prove something for every `Weekday`, split into one goal per constructor with `cases d`. Each goal is then about a concrete day, so `rfl` or `decide` closes it. `t <;> s` runs `s` on every goal `t` produces.",
          prompt: "Prove that `next` undoes `prev`.",
          template: WEEKDAY + "\n" + NEXT_PREV + "\ntheorem next_prev (d : Weekday) : next (prev d) = d := by\n  ___",
          solutions: ["cases d <;> rfl", "cases d <;> decide", "cases d <;> simp [next, prev]", "cases d\nall_goals rfl"],
          wrong: ["rfl", "decide", "cases d"],
          explain: "After `cases d` there are seven goals like `next (prev monday) = monday`, and each computes. Plain `rfl` fails because `d` is unknown, and `decide` refuses goals with free variables. `cases d` alone leaves all seven goals open.",
          hint: "Split on `d`, then close every goal the same way.",
        },
        {
          id: "u09-l1-e4",
          kind: "choice",
          title: "A recursive type",
          body: "Constructors can take arguments of the type being defined. A binary **tree** is either a `leaf` or a `node` with a left subtree, a value and a right subtree. `size` counts the nodes, recursing into both children.",
          code: TREE + "\n#eval size (node (node leaf 1 leaf) 2 (node leaf 3 leaf))",
          prompt: "What does it print?",
          options: ["3", "7", "6", "2"],
          answer: 0,
          explain: "There are three `node`s, holding 1, 2 and 3, and `size leaf = 0`. Counting the four leaves too would give `7`, and adding up the values would give `6`.",
          verify: { src: TREE + "\n#eval size (node (node leaf 1 leaf) 2 (node leaf 3 leaf))", expect: ["3"] },
        },
        {
          id: "u09-l1-e5",
          kind: "proof",
          title: "Mirror twice",
          body: "Induction works on any inductive type. A `node` has **two** subtrees, so the case gives you two induction hypotheses: `| node l v r ihl ihr`. Then `simp [mirror, ihl, ihr]` unfolds `mirror` and uses both.",
          prompt: "Prove that mirroring twice gives back the original tree.",
          template: TREE + "\ntheorem mirror_mirror (t : BTree) : mirror (mirror t) = t := by\n  ___",
          solutions: [
            "induction t with\n| leaf => rfl\n| node l v r ihl ihr => simp [mirror, ihl, ihr]",
            "induction t with\n| leaf => rfl\n| node l v r ihl ihr => rw [mirror, mirror, ihl, ihr]",
          ],
          wrong: ["rfl", "induction t with\n| leaf => rfl\n| node l v r ihl ihr => simp [mirror]", "cases t with\n| leaf => rfl\n| node l v r => simp [mirror]"],
          explain: "Unfolding `mirror` turns the goal into `node (mirror (mirror l)) v (mirror (mirror r)) = node l v r`, and the two hypotheses rewrite each subtree. With `cases` instead of `induction` you get no hypotheses, so the subtrees are stuck.",
          hint: "`induction t with`, two hypotheses in the `node` case.",
        },
        {
          id: "u09-l1-e6",
          kind: "fix",
          title: "Sizes in the mirror",
          body: "Mirroring swaps the subtrees, so the sum comes out in a different order: `size r + 1 + size l` against `size l + 1 + size r`. `simp` doesn't reorder this sum for you. Read the goal Lean says is unsolved.",
          prompt: "This proof stops one step short. Fix it.",
          template: TREE + "\ntheorem size_mirror (t : BTree) : size (mirror t) = size t := by\n  induction t with\n  | leaf => rfl\n  | node l v r ihl ihr => ___",
          start: "simp [size, mirror, ihl, ihr]",
          solutions: ["simp [size, mirror, ihl, ihr]; omega", "simp only [size, mirror]; omega", "rw [mirror, size, size, ihl, ihr]; omega"],
          wrong: ["rw [mirror, size, size, ihl, ihr]", "rfl"],
          explain: "After rewriting, the goal is `size r + 1 + size l = size l + 1 + size r`: true, but only up to commutativity. `omega` proves it, and it can use `ihl` and `ihr` straight from the context, so passing them to `simp` is optional.",
          hint: "Which tactic knows that `a + b = b + a`?",
        },
      ],
    },
    {
      id: "u09-l2",
      title: "Structures and classes",
      exercises: [
        {
          id: "u09-l2-e1",
          kind: "choice",
          title: "A structure is a record",
          body: "A **structure** is an inductive type with one constructor and named fields. Lean generates the constructor `Point.mk` and one accessor per field, so `p.x` reads a field. You can also build a value with field names: `{ x := 1, y := 2 }`.",
          code: POINT + "\n#check Point.mk",
          prompt: "What does `#check Point.mk` print?",
          options: ["Point.mk (x y : Nat) : Point", "Point.mk : Point", "Point.mk (p : Point) : Nat × Nat", "Point : Type"],
          answer: 0,
          explain: "The constructor takes one argument per field, in order, and returns a `Point`. So `Point.mk 1 2`, `⟨1, 2⟩` and `{ x := 1, y := 2 }` are the same value.",
          verify: { src: POINT + "\n#check Point.mk\n#eval ({ x := 1, y := 2 } : Point).y", expect: ["Point.mk (x y : Nat) : Point", "2"] },
        },
        {
          id: "u09-l2-e2",
          kind: "fill",
          title: "Update one field",
          body: "Values never change in Lean. To \"update\" a field you build a new value: `{ p with x := 3 }` copies `p` and replaces `x`. This is the same as `⟨3, p.y⟩`, but it keeps working when the structure grows more fields.",
          prompt: "Move the point one step to the right.",
          template: POINT + "\ndef moveRight (p : Point) : Point := ___\n\nexample : moveRight { x := 1, y := 5 } = { x := 2, y := 5 } := rfl\nexample : moveRight { x := 0, y := 0 } = { x := 1, y := 0 } := rfl",
          solutions: ["{ p with x := p.x + 1 }", "⟨p.x + 1, p.y⟩", "{ x := p.x + 1, y := p.y }"],
          wrong: ["{ p with x := 1 }", "{ p with y := p.y + 1 }", "⟨p.x + 1, 0⟩"],
          explain: "`{ p with x := p.x + 1 }` keeps `y` and bumps `x`. Writing `x := 1` sets it instead of adding to it: it happens to pass for the origin, which is why the first test starts at `x := 1`.",
        },
        {
          id: "u09-l2-e3",
          kind: "fill",
          title: "Teach + about points",
          body: "`+` is not built in for every type. It comes from the **type class** `Add`. Writing an `instance : Add Point` tells Lean what `p + q` means for points, and from then on `+` just works.",
          prompt: "Add points coordinate by coordinate.",
          template: POINT + "\ninstance : Add Point where\n  add p q := ___\n\nexample : (⟨1, 2⟩ + ⟨10, 20⟩ : Point) = ⟨11, 22⟩ := rfl\nexample : (⟨0, 5⟩ + ⟨3, 0⟩ : Point) = ⟨3, 5⟩ := rfl",
          solutions: ["⟨p.x + q.x, p.y + q.y⟩", "{ x := p.x + q.x, y := p.y + q.y }", "Point.mk (p.x + q.x) (p.y + q.y)"],
          wrong: ["⟨p.x + q.x, p.y⟩", "p", "⟨p.x + p.y, q.x + q.y⟩"],
          explain: "Each field of the result is the sum of the matching fields. Note the instance has no name: Lean finds it by its type, `Add Point`, whenever it sees `+` on points.",
        },
        {
          id: "u09-l2-e4",
          kind: "choice",
          title: "Show yourself",
          body: "`Repr` is how `#eval` displays a value for programmers; `deriving Repr` writes it for you. `ToString` is how a value turns into text for people, and you usually write that instance yourself.",
          code:
            POINT +
            "\ninstance : Add Point where\n  add p q := ⟨p.x + q.x, p.y + q.y⟩\n\ninstance : ToString Point where\n  toString p := s!\"({p.x}, {p.y})\"\n\ndef p : Point := { x := 1, y := 2 }\n#eval toString (p + p)",
          prompt: "What does the `#eval` print?",
          options: ['"(2, 4)"', "{ x := 2, y := 4 }", '"(1, 2)"', '"Point(2, 4)"'],
          answer: 0,
          explain: "`p + p` is `⟨2, 4⟩`, and your `ToString` instance formats it as `(2, 4)`. `#eval` shows a `String` with quotes. `{ x := 2, y := 4 }` is what `#eval (p + p)` would print, using the derived `Repr`.",
          verify: {
            src:
              POINT +
              "\ninstance : Add Point where\n  add p q := ⟨p.x + q.x, p.y + q.y⟩\n\ninstance : ToString Point where\n  toString p := s!\"({p.x}, {p.y})\"\n\ndef p : Point := { x := 1, y := 2 }\n#eval toString (p + p)\n#eval p + p",
            expect: ['"(2, 4)"', "{ x := 2, y := 4 }"],
          },
        },
        {
          id: "u09-l2-e5",
          kind: "fill",
          title: "Your own class",
          body: "You can define classes too. A `class` declares an operation that many types can share; each `instance` says how one type does it. Here `Area.area` works on any shape that has an instance.",
          prompt: "Give squares an area.",
          template:
            "class Area (α : Type) where\n  area : α → Nat\n\nstructure Rect where\n  w : Nat\n  h : Nat\n\nstructure Square where\n  side : Nat\n\ninstance : Area Rect where\n  area r := r.w * r.h\n\ninstance : Area Square where\n  area s := ___\n\nexample : Area.area (Rect.mk 3 4) = 12 := rfl\nexample : Area.area (Square.mk 5) = 25 := rfl\nexample : Area.area (Square.mk 1) = 1 := rfl",
          solutions: ["s.side * s.side", "s.side ^ 2", "Area.area (Rect.mk s.side s.side)"],
          wrong: ["4 * s.side", "s.side", "s.side + s.side"],
          explain: "A square's area is its side times itself. `4 * s.side` is the perimeter; `s.side + s.side` agrees with the right answer only at 0 and 2, so the tests at 1 and 5 catch it.",
        },
        {
          id: "u09-l2-e6",
          kind: "proof",
          title: "Equations about structures",
          body: "Lean knows a structure value is determined by its fields (**eta** for structures), so `rfl` often proves structure equations even when `p` is unknown. If it doesn't, `cases p` splits `p` into its fields and the goal computes.",
          prompt: "Prove that swapping twice changes nothing.",
          template: POINT + "\ndef swap (p : Point) : Point := ⟨p.y, p.x⟩\n\ntheorem swap_swap (p : Point) : swap (swap p) = p := by\n  ___",
          solutions: ["rfl", "cases p; rfl", "simp [swap]", "cases p with\n| mk a b => rfl"],
          wrong: ["decide", "cases p", "omega"],
          explain: "`swap (swap p)` computes to `⟨p.x, p.y⟩`, and by eta that's `p`, so `rfl` works directly. `decide` needs a closed statement, and `cases p` alone splits without closing anything.",
        },
      ],
    },
  ],
};
