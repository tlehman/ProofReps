import { useMemo } from "react";
import { ScrollView, Text, View, type TextStyle } from "react-native";
import { tokenize, type TokenKind } from "../lean/highlight";
import { mono, useTheme, type Theme } from "./theme";

export function tokenStyle(t: Theme, kind: TokenKind): TextStyle | undefined {
  switch (kind) {
    case "keyword":
      return { color: t.synKeyword, fontWeight: "600" };
    case "tactic":
      return { color: t.synTactic };
    case "type":
      return { color: t.synType };
    case "comment":
      return { color: t.synComment, fontStyle: "italic" };
    case "string":
      return { color: t.synString };
    case "number":
      return { color: t.synNumber };
    case "op":
      return { color: t.synOp };
    case "command":
    case "attribute":
      return { color: t.synCommand, fontWeight: "600" };
    case "sorry":
      return { color: t.synSorry, fontWeight: "700" };
    default:
      return undefined;
  }
}

// Lean source as colored spans, to put inside a monospace <Text>. `flat`:
// color only, no bold or italic, so every glyph keeps the regular width (the
// editor's caret is placed by the regular-weight text it hides).
export function LeanSpans({ code, flat = false }: { code: string; flat?: boolean }) {
  const t = useTheme();
  const tokens = useMemo(() => tokenize(code), [code]);
  return (
    <>
      {tokens.map((tok, i) => (
        <Text key={i} style={flat ? { color: tokenStyle(t, tok.kind)?.color } : tokenStyle(t, tok.kind)}>
          {tok.text}
        </Text>
      ))}
    </>
  );
}

export function CodeBlock({ code, dim = false }: { code: string; dim?: boolean }) {
  const t = useTheme();
  return (
    <ScrollView horizontal style={{ backgroundColor: t.code, borderRadius: 10 }} contentContainerStyle={{ padding: 12 }}>
      <Text selectable style={{ fontFamily: mono, fontSize: 14, lineHeight: 20, color: t.codeInk, opacity: dim ? 0.75 : 1 }}>
        <LeanSpans code={code} />
      </Text>
    </ScrollView>
  );
}

// A Lean goal state, as an editor's infoview shows it.
// `stale`: the last goal Lean reported, while the code at the cursor doesn't check yet.
export function GoalBox({ goals, label = "Goal", stale = false }: { goals: string; label?: string; stale?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: stale ? t.muted : t.brand, backgroundColor: t.brandSoft, borderRadius: 8, padding: 10, gap: 4, opacity: stale ? 0.7 : 1 }}>
      <Text style={{ color: stale ? t.muted : t.brand, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
        {stale ? <Text style={{ fontWeight: "500", textTransform: "none" }}>{"  · last known, still typing"}</Text> : null}
      </Text>
      <Text selectable style={{ fontFamily: mono, fontSize: 13, lineHeight: 19, color: t.ink }}>
        {goals || "No goals. Done!"}
      </Text>
    </View>
  );
}
