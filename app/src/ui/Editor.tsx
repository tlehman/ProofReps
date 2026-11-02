// A Lean code editor that works with a phone keyboard: monospace, no
// autocorrect, Lean's backslash abbreviations (`\to` → `→`, typed the way
// VS Code's Lean extension does it), and a bar of symbols to tap.
//
// Syntax highlighting (web): the text box's own text is transparent (its caret
// and selection still show), and a highlighted copy of the same text sits
// exactly behind it: same font, size, line height, padding and border, no
// wrapping, scrolled sideways in step with the box.
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { LeanSpans } from "./Code";
import { mono, useTheme } from "./theme";

const WEB = Platform.OS === "web";

const ABBREV: Record<string, string> = {
  to: "→", r: "→", "->": "→", l: "←", "<-": "←", iff: "↔", "<->": "↔", lr: "↔",
  and: "∧", "and.": "∧", or: "∨", not: "¬", neg: "¬", n: "¬",
  forall: "∀", all: "∀", fa: "∀", exists: "∃", ex: "∃", e: "∃",
  la: "λ", lam: "λ", fun: "λ", "<": "⟨", ">": "⟩", "<>": "⟨⟩", langle: "⟨", rangle: "⟩",
  le: "≤", "<=": "≤", ge: "≥", ">=": "≥", ne: "≠", "!=": "≠", "=n": "≠",
  N: "ℕ", Z: "ℤ", Q: "ℚ", R: "ℝ", times: "×", x: "×", ".": "·", cdot: "·", circ: "∘", o: "∘",
  in: "∈", notin: "∉", sub: "⊆", ss: "⊆", union: "∪", cup: "∪", inter: "∩", cap: "∩",
  a: "α", b: "β", g: "γ", alpha: "α", beta: "β", gamma: "γ", "|-": "⊢", vdash: "⊢", top: "⊤", bot: "⊥",
  "1": "₁", "2": "₂", "3": "₃", "0": "₀", "^-1": "⁻¹", "'": "′",
};

const SYMBOLS = ["→", "←", "↔", "∀", "∃", "∧", "∨", "¬", "⟨", "⟩", "·", "≤", "≥", "≠", "λ", "∘", "×", "⊢", "ℕ", "₁", "₂"];

// When a key that ends an abbreviation is typed (space, bracket, comma, ...)
// right after `\name`, replace `\name` with its symbol.
function expand(prev: string, next: string, cursor: number): { text: string; cursor: number } | null {
  if (next.length !== prev.length + 1) return null;
  const typed = next[cursor - 1];
  if (typed == null || !/[\s()[\]{},:;]/.test(typed)) return null;
  const before = next.slice(0, cursor - 1);
  const m = before.match(/\\([^\s\\]+)$/);
  if (!m) return null;
  const name = m[1];
  const sym = ABBREV[name];
  if (!sym) return null;
  const start = before.length - name.length - 1;
  const keep = typed === " " ? "" : typed;
  const text = next.slice(0, start) + sym + keep + next.slice(cursor);
  return { text, cursor: start + sym.length + keep.length };
}

export interface EditorProps {
  value: string;
  onChange: (v: string) => void;
  onCursor?: (row: number) => void;
  multiline?: boolean;
  minLines?: number;
  placeholder?: string;
  autoFocus?: boolean;
  status?: "good" | "bad" | null;
}

export function Editor({ value, onChange, onCursor, multiline = true, minLines = 3, placeholder, autoFocus, status }: EditorProps) {
  const t = useTheme();
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [sel, setSel] = useState<{ start: number; end: number }>({ start: value.length, end: value.length });
  const [forced, setForced] = useState<{ start: number; end: number } | undefined>(undefined);
  const lines = Math.max(minLines, value.split("\n").length + (multiline ? 1 : 0));
  // the text box's scroll offset, mirrored by the highlighted copy (state, not
  // a DOM write: a re-render would overwrite a hand-set transform)
  const [scroll, setScroll] = useState({ x: 0, y: 0 });

  // Keep the highlighted copy scrolled with the text box. Bound through the
  // ref callback, so it follows the element even if it's ever replaced.
  const unbind = useRef<(() => void) | null>(null);
  const bindScroll = (r: React.ComponentRef<typeof TextInput> | null) => {
    input.current = r;
    const el = r as unknown as HTMLElement | null;
    if (!WEB || (el && el === (unbind.current as unknown as { el?: HTMLElement })?.el)) return;
    unbind.current?.();
    unbind.current = null;
    if (!el?.addEventListener) return;
    const sync = () => setScroll((p) => (p.x === el.scrollLeft && p.y === el.scrollTop ? p : { x: el.scrollLeft, y: el.scrollTop }));
    el.addEventListener("scroll", sync);
    sync();
    unbind.current = Object.assign(() => el.removeEventListener("scroll", sync), { el });
  };
  useEffect(() => () => unbind.current?.(), []);

  const report = (pos: number, text = value) => onCursor?.(text.slice(0, pos).split("\n").length - 1);

  const insert = (s: string) => {
    const next = value.slice(0, sel.start) + s + value.slice(sel.end);
    const pos = sel.start + s.length;
    onChange(next);
    setSel({ start: pos, end: pos });
    setForced({ start: pos, end: pos });
    report(pos, next);
    input.current?.focus();
  };

  const border = status === "good" ? t.good : status === "bad" ? t.bad : t.line;
  const box = { fontFamily: mono, fontSize: 16, lineHeight: 22, padding: 12, borderWidth: 2, borderRadius: 10 } as const;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ position: "relative", borderRadius: 10, backgroundColor: t.code, overflow: "hidden" }}>
      {WEB ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }} aria-hidden>
          <Text
            style={{
              ...box,
              transform: [{ translateX: -scroll.x }, { translateY: -scroll.y }],
              borderColor: "transparent",
              color: t.codeInk,
              ...({ whiteSpace: "pre", tabSize: 2, fontVariantLigatures: "none", display: "block", width: "max-content", minWidth: "100%" } as object),
            }}
          >
            <LeanSpans code={value + "\n"} flat />
          </Text>
        </View>
      ) : null}
      <TextInput
        ref={bindScroll}
        value={value}
        autoFocus={autoFocus}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        selection={forced}
        onChangeText={(next) => {
          const cursor = sel.start + (next.length - value.length);
          const ex = expand(value, next, Math.max(0, cursor));
          if (ex) {
            onChange(ex.text);
            setSel({ start: ex.cursor, end: ex.cursor });
            setForced({ start: ex.cursor, end: ex.cursor });
            report(ex.cursor, ex.text);
          } else {
            // Typing moves the caret: track it here too, since not every
            // browser reports a selection change for each keystroke.
            const pos = Math.max(0, Math.min(next.length, cursor));
            onChange(next);
            setSel({ start: pos, end: pos });
            setForced(undefined);
            report(pos, next);
          }
        }}
        onSelectionChange={(e) => {
          const s = e.nativeEvent.selection;
          setSel(s);
          setForced(undefined);
          report(s.end);
        }}
        onKeyPress={(e) => {
          // Tab inserts two spaces instead of leaving the editor (web).
          if (Platform.OS === "web" && (e.nativeEvent as unknown as { key: string }).key === "Tab") {
            (e as unknown as { preventDefault(): void }).preventDefault();
            insert("  ");
          }
        }}
        style={{
          ...box, // fontSize 16: under 16px, iOS zooms in on focus
          color: t.codeInk,
          backgroundColor: WEB ? "transparent" : t.code,
          borderColor: border,
          minHeight: multiline ? lines * 22 + 28 : undefined,
          textAlignVertical: "top",
          ...(WEB
            ? ({
                outlineStyle: "none",
                whiteSpace: "pre",
                overflowX: "auto",
                tabSize: 2,
                fontVariantLigatures: "none",
                // the text itself is drawn by the highlighted copy behind
                color: "transparent",
                caretColor: t.codeInk,
              } as object)
            : {}),
        }}
      />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 6 }}>
        {SYMBOLS.map((s) => (
          <Pressable
            key={s}
            onPress={() => insert(s)}
            accessibilityLabel={`insert ${s}`}
            style={({ pressed }) => ({
              minWidth: 36,
              height: 36,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? t.brandSoft : t.card,
              borderWidth: 1,
              borderColor: t.line,
            })}
          >
            <Text style={{ fontFamily: mono, fontSize: 16, color: t.ink }}>{s}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
