// A scratch Lean file: every message Lean has about it, and the goal at the
// cursor, as you type.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { lastUnsolved, type Message } from "../lean/grade";
import * as lean from "../lean/lean";
import { GoalBox } from "./Code";
import { Diagnostics } from "./Diagnostics";
import { Editor } from "./Editor";
import { LeanTrouble } from "./Exercise";
import { useLean } from "./useLean";
import { useStickyGoal } from "./useStickyGoal";
import { useTheme } from "./theme";

export const SAMPLE = `-- A scratch file. Lean checks it as you type.

def fib : Nat → Nat
  | 0 => 0
  | 1 => 1
  | n + 2 => fib n + fib (n + 1)

#eval (List.range 10).map fib

theorem and_swap (p q : Prop) (h : p ∧ q) : q ∧ p := by
  obtain ⟨hp, hq⟩ := h
  exact ⟨hq, hp⟩

theorem add_zero' (n : Nat) : n + 0 = n := by
  induction n with
  | zero => rfl
  | succ n ih => omega
`;

// Lines up to the cursor plus `trace_state`, if the cursor is in a tactic block.
function goalSource(code: string, row: number): { src: string; line: number } | null {
  const lines = code.split("\n");
  const cur = lines[row] ?? "";
  const upto = lines.slice(0, row + 1);
  let inTactics = false;
  for (let i = row; i >= 0; i--) {
    const l = lines[i];
    if (/\bby\s*$/.test(l) || /\bby\s+\S/.test(l)) {
      inTactics = true;
      break;
    }
    if (i < row && /^\S/.test(l)) break;
  }
  if (!inTactics) return null;
  const ind = cur.trim() ? cur.match(/^\s*/)![0].length : Math.max(2, cur.length);
  return { src: [...upto, " ".repeat(ind) + "trace_state"].join("\n") + "\n", line: row + 2 };
}

export function Playground({ initial, onSave, onExit }: { initial: string; onSave: (s: string) => void; onExit: () => void }) {
  const t = useTheme();
  const { status } = useLean();
  const [code, setCode] = useState(initial || SAMPLE);
  const [row, setRow] = useState(0);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const { goal, update: showGoal } = useStickyGoal();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== "ready") return;
    let live = true;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        // the whole file and the goal at the cursor, side by side on the server
        const g = goalSource(code, row);
        const [ms, gm] = await Promise.all([lean.probe("file", code), g ? lean.probe("goal", g.src) : null]);
        if (!live) return;
        if (ms) setMessages(ms);
        if (g && gm) {
          const tr = gm.find((m) => m.severity === "information" && m.line === g.line);
          const before = tr ? null : lastUnsolved(gm, g.line);
          showGoal(tr ? tr.text : before, tr ? `Goal at line ${row + 1}` : `Goals before line ${row + 1}`);
        } else if (!g) showGoal(null, "");
      } catch (e) {
        if (live) setMessages([{ severity: "error", text: (e as Error).message }]);
      } finally {
        if (live) setBusy(false);
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [code, row, status, showGoal]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 900, width: "100%", alignSelf: "center" }}>
        <Pressable onPress={onExit} accessibilityLabel="Back" hitSlop={12}>
          <Text style={{ color: t.muted, fontSize: 26, fontWeight: "600" }}>‹</Text>
        </Pressable>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "800", flex: 1 }}>Playground</Text>
        <Text style={{ color: t.muted, fontSize: 13 }}>{status === "failed" ? "Lean unreachable" : status !== "ready" ? "starting Lean…" : busy ? "checking…" : "✓ checked"}</Text>
        <Pressable onPress={() => setCode(SAMPLE)} hitSlop={8}>
          <Text style={{ color: t.brand, fontWeight: "700" }}>Reset</Text>
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80, maxWidth: 900, width: "100%", alignSelf: "center" }}>
        <Editor
          value={code}
          onChange={(v) => {
            setCode(v);
            onSave(v);
          }}
          onCursor={setRow}
          minLines={12}
        />
        {goal ? <GoalBox goals={goal.goals} label={goal.label} stale={goal.stale} /> : null}
        {status === "failed" ? <LeanTrouble /> : null}
        {messages && !messages.length ? <Text style={{ color: t.good, fontWeight: "700" }}>No errors, no messages.</Text> : null}
        {messages ? <Diagnostics messages={messages} /> : null}
      </ScrollView>
    </View>
  );
}
