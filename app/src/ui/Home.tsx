import { Pressable, ScrollView, Text, View } from "react-native";
import type { Core } from "../core";
import type { Lesson, Unit } from "../content/types";
import * as store from "../store";
import { Button } from "./Button";
import { useLean } from "./useLean";
import { useTheme } from "./theme";

export function Home({
  core,
  state,
  units,
  dueCount,
  onLesson,
  onReview,
  onPlayground,
  onSettings,
}: {
  core: Core;
  state: store.State;
  units: Unit[];
  dueCount: number;
  onLesson: (u: Unit, l: Lesson) => void;
  onReview: () => void;
  onPlayground: () => void;
  onSettings: () => void;
}) {
  const t = useTheme();
  const today = store.dayOf(Date.now());
  const streak = core.streakToday(state.lastDay, state.streak, today);
  const todayXp = state.daily[today] ?? 0;
  const level = core.level(state.xp);
  const lo = core.levelStart(level);
  const hi = core.levelStart(level + 1);
  const lessons = units.flatMap((u) => u.lessons);
  const nextLesson = lessons.find((l) => !state.lessons[l.id]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 60, maxWidth: 640, width: "100%", alignSelf: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: t.ink, fontSize: 26, fontWeight: "900" }}>
          <Text style={{ color: t.brand }}>⊢</Text>💪 ProofReps
        </Text>
        <Pressable onPress={onSettings} accessibilityLabel="Settings" hitSlop={10}>
          <Text style={{ fontSize: 22 }}>⚙️</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Chip icon="🔥" value={String(streak)} label="day streak" color={streak > 0 ? t.bad : t.muted} />
        <Chip icon="⚡" value={String(state.xp)} label="XP" color={t.gold} />
        <Chip icon="🎓" value={String(level)} label="level" color={t.brand} />
      </View>

      <View style={{ backgroundColor: t.card, borderRadius: 16, padding: 14, gap: 10, borderWidth: 2, borderColor: t.line }}>
        <Bar label={`Daily goal: ${Math.min(todayXp, state.goal)} / ${state.goal} XP`} frac={todayXp / state.goal} color={t.gold} />
        <Bar label={`Level ${level}: ${state.xp - lo} / ${hi - lo} XP`} frac={(state.xp - lo) / (hi - lo)} color={t.brand} />
        <LeanChip />
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label={dueCount ? `Review ${dueCount}` : "Nothing to review"} kind="secondary" disabled={!dueCount} onPress={onReview} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Playground" kind="secondary" onPress={onPlayground} />
        </View>
      </View>

      {units.map((u, ui) => (
        <View key={u.id} style={{ gap: 10 }}>
          <View style={{ backgroundColor: t.brand, borderRadius: 16, padding: 14, gap: 4 }}>
            <Text style={{ color: t.brandInk, opacity: 0.8, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 }}>Unit {ui + 1}</Text>
            <Text style={{ color: t.brandInk, fontSize: 20, fontWeight: "800" }}>{u.title}</Text>
            <Text style={{ color: t.brandInk, opacity: 0.9, fontSize: 14 }}>{u.blurb}</Text>
          </View>
          {u.lessons.map((l, li) => {
            const done = !!state.lessons[l.id];
            const idx = lessons.indexOf(l);
            const open = done || idx === 0 || !!state.lessons[lessons[idx - 1].id];
            const current = l === nextLesson;
            return (
              <Pressable
                key={l.id}
                disabled={!open}
                onPress={() => onLesson(u, l)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: current ? t.brandSoft : t.card,
                  borderWidth: 2,
                  borderBottomWidth: 4,
                  borderColor: current ? t.brand : t.line,
                  opacity: pressed ? 0.85 : 1,
                  marginLeft: [0, 28, 48, 28][(ui * 2 + li) % 4],
                })}
              >
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: done ? t.gold : open ? t.brand : t.locked,
                  }}
                >
                  <Text style={{ fontSize: 20, color: "#fff", fontWeight: "900" }}>{done ? "★" : open ? "⊢" : "🔒"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: open ? t.ink : t.muted, fontSize: 16, fontWeight: "700" }}>{l.title}</Text>
                  <Text style={{ color: t.muted, fontSize: 13 }}>
                    {l.exercises.length} exercises{done ? " · done, tap to practice" : current ? " · up next" : ""}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>
        Every answer is checked by Lean 4 with Mathlib, running on the ProofReps server. Progress stays in this browser.
      </Text>
    </ScrollView>
  );
}

function Chip({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.card, borderRadius: 14, padding: 10, alignItems: "center", borderWidth: 2, borderColor: t.line }}>
      <Text style={{ fontSize: 18, fontWeight: "900", color }}>
        {icon} {value}
      </Text>
      <Text style={{ fontSize: 12, color: t.muted, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function Bar({ label, frac, color }: { label: string; frac: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: t.ink, fontSize: 13, fontWeight: "700" }}>{label}</Text>
      <View style={{ height: 12, borderRadius: 6, backgroundColor: t.line, overflow: "hidden" }}>
        <View style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, height: "100%", backgroundColor: color }} />
      </View>
    </View>
  );
}

function LeanChip() {
  const t = useTheme();
  const { status, detail } = useLean();
  const text = {
    idle: "Lean: waiting",
    starting: `Lean: starting${detail ? ` (${detail})` : ""}`,
    ready: "Lean 4 + Mathlib is running on the server",
    failed: `Lean unreachable: ${detail}`,
  }[status];
  const color = status === "ready" ? t.good : status === "starting" || status === "idle" ? t.warn : t.bad;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ color: t.muted, fontSize: 13, flexShrink: 1 }}>{text}</Text>
    </View>
  );
}
