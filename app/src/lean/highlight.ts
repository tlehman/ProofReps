// A small Lean 4 tokenizer for syntax highlighting: comments (nested `/- -/`),
// strings, numbers, keywords, tactics, commands (`#eval`), attributes, types
// (capitalized names), `sorry`, and Lean's operator symbols. It never fails:
// anything it doesn't recognize is plain text, and the tokens always join back
// into exactly the input (the editor overlay depends on that).

export type TokenKind = "plain" | "comment" | "string" | "number" | "keyword" | "tactic" | "command" | "attribute" | "type" | "sorry" | "op";
export interface Token {
  text: string;
  kind: TokenKind;
}

const KEYWORDS = new Set(
  (
    "theorem lemma def example abbrev instance structure class inductive coinductive where extends deriving namespace section end open " +
    "variable universe import export if then else let have show from fun match with do return at by calc mutual private protected " +
    "noncomputable partial unsafe termination_by decreasing_by in notation infix infixl infixr prefix postfix macro macro_rules syntax " +
    "set_option attribute local scoped suffices for unless mut opaque axiom omit include using λ"
  ).split(" "),
);

const TACTICS = new Set(
  (
    "rfl simp simp_all simp_arith dsimp intro intros exact apply refine constructor cases rcases induction omega decide native_decide rw " +
    "rewrite rwa erw unfold delta exists use left right contradiction assumption trivial linarith nlinarith ring ring_nf norm_num positivity " +
    "aesop tauto specialize generalize subst obtain rintro ext funext congr change trace_state next case all_goals any_goals repeat " +
    "first try exfalso by_contra by_cases split injection nofun nomatch gcongr field_simp push_neg contrapose symm trans exact? apply? " +
    "simp? rw? hint fin_cases interval_cases norm_cast push_cast exact_mod_cast refine' haveI letI conv arg lhs rhs skip done focus " +
    "absurd and_intros iterate fail sorry_if calc_tac infer_instance inferInstance clear rename_i revert set"
  ).split(" "),
);

const TYPES = new Set(["Prop", "Type", "Sort", "ℕ", "ℤ", "ℚ", "ℝ", "ℂ"]);

// Longest first, so `:=` wins over `:`.
const OPS = [":=", "=>", "<->", "->", "<-", "<;>", "≠", "≤", "≥", "→", "←", "↔", "∀", "∃", "∧", "∨", "¬", "⟨", "⟩", "▸", "·", "∘", "×", "⊢", "∈", "∉", "⊆", "∪", "∩", "|", "::", "++", "⁻¹"];

const IDENT_START = /[\p{L}_]/u;
const IDENT_REST = /[\p{L}\p{N}_'!?₀-₉ₐ-ₜ]/u;

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const push = (text: string, kind: TokenKind) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  const chars = Array.from(src); // by code point: ℕ, 𝔽 and friends are one character
  const n = chars.length;
  let i = 0;
  const at = (k: number) => chars[k] ?? "";
  const startsWith = (s: string, k = i) => chars.slice(k, k + Array.from(s).length).join("") === s;

  while (i < n) {
    const c = chars[i];
    // -- line comment
    if (startsWith("--")) {
      let j = i;
      while (j < n && chars[j] !== "\n") j++;
      push(chars.slice(i, j).join(""), "comment");
      i = j;
      continue;
    }
    // /- block comment -/, nested
    if (startsWith("/-")) {
      let j = i + 2;
      let depth = 1;
      while (j < n && depth > 0) {
        if (startsWith("/-", j)) (depth++, (j += 2));
        else if (startsWith("-/", j)) (depth--, (j += 2));
        else j++;
      }
      push(chars.slice(i, j).join(""), "comment");
      i = j;
      continue;
    }
    // "string"
    if (c === '"') {
      let j = i + 1;
      while (j < n && chars[j] !== '"' && chars[j] !== "\n") j += chars[j] === "\\" ? 2 : 1;
      j = Math.min(n, j + 1);
      push(chars.slice(i, j).join(""), "string");
      i = j;
      continue;
    }
    // 'c' character literal (not the prime in `x'`)
    if (c === "'" && !IDENT_REST.test(at(i - 1))) {
      const m = chars.slice(i, i + 4).join("").match(/^'(\\.|[^'\\\n])'/);
      if (m) {
        push(m[0], "string");
        i += Array.from(m[0]).length;
        continue;
      }
    }
    // numbers
    if (/[0-9]/.test(c) && !IDENT_REST.test(at(i - 1))) {
      const m = chars.slice(i, i + 40).join("").match(/^(0x[0-9a-fA-F_]+|0b[01_]+|[0-9][0-9_]*(\.[0-9]+)?)/)!;
      push(m[0], "number");
      i += m[0].length;
      continue;
    }
    // #eval, #check, ...
    if (c === "#" && /[a-z]/.test(at(i + 1))) {
      let j = i + 1;
      while (j < n && /[a-z_]/.test(chars[j])) j++;
      push(chars.slice(i, j).join(""), "command");
      i = j;
      continue;
    }
    // @[simp] attributes
    if (startsWith("@[")) {
      let j = i + 2;
      while (j < n && chars[j] !== "]" && chars[j] !== "\n") j++;
      j = Math.min(n, j + 1);
      push(chars.slice(i, j).join(""), "attribute");
      i = j;
      continue;
    }
    // identifiers, keywords, tactics (dotted names stay one token)
    if (IDENT_START.test(c) && c !== "λ") {
      let j = i + 1;
      while (j < n && (IDENT_REST.test(chars[j]) || (chars[j] === "." && IDENT_START.test(at(j + 1))))) j++;
      const word = chars.slice(i, j).join("");
      const kind: TokenKind =
        word === "sorry" || word === "admit"
          ? "sorry"
          : KEYWORDS.has(word)
            ? "keyword"
            : TACTICS.has(word)
              ? "tactic"
              : TYPES.has(word) || /^\p{Lu}/u.test(word.slice(word.lastIndexOf(".") + 1))
                ? "type"
                : "plain";
      push(word, kind);
      i = j;
      continue;
    }
    if (c === "λ") {
      push(c, "keyword");
      i++;
      continue;
    }
    if (TYPES.has(c)) {
      push(c, "type");
      i++;
      continue;
    }
    const op = OPS.find((o) => startsWith(o));
    if (op) {
      push(op, "op");
      i += Array.from(op).length;
      continue;
    }
    push(c, "plain");
    i++;
  }
  return out;
}
