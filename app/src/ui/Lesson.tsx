// A lesson, Duolingo style: exercises one at a time, a progress bar, and a
// missed exercise comes back at the end until it's done right.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Core } from "../core";
import type { Exercise as Ex } from "../content/types";
import * as store from "../store";
import { Button } from "./Button";
import { Exercise, type Outcome } from "./Exercise";
import { useTheme } from "./theme";

const kindOf = (e: Ex) => (e.kind === "choice" ? "choice" : e.kind === "fill" ? "fill" : "proof");

export function Lesson({
  core,
  state,
  commit,
  title,
  exercises,
  lessonId,
  onExit,
}: {
  core: Core;
  state: store.State;
  commit: () => void;
  title: string;
  exercises: Ex[];
  lessonId?: string; // set for a lesson (marks it complete); unset for a review
  onExit: () => void;
}) {
  const t = useTheme();
  const [queue, setQueue] = useState(() => exercises.map((e) => e.id));
  const [done, setDone] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [xp, setXp] = useState(0);
  const [finished, setFinished] = useState<{ bonus: number } | null>(null);
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const ex = byId.get(queue[0]);
  const total = exercises.length;

  const miss = (e: Ex) => {
    store.answer(core, state, e.id, kindOf(e), false);
    setMistakes((m) => m + 1);
    commit();
  };

  const next = (e: Ex, o: Outcome) => {
    let earned = 0;
    if (o.correct) {
      earned = store.answer(core, state, e.id, kindOf(e), true);
      if (o.answer) state.cards[e.id].answer = o.answer;
      delete state.drafts[e.id];
    }
    const rest = queue.slice(1);
    const q = o.correct ? rest : [...rest, e.id];
    if (o.correct) setDone((d) => d + 1);
    setXp((x) => x + earned);
    if (!q.length) {
      const bonus = store.addXp(core, state, core.lessonBonus(mistakes));
      if (lessonId && !state.lessons[lessonId]) state.lessons[lessonId] = Date.now();
      setFinished({ bonus });
    }
    commit();
    setQueue(q);
  };

  if (finished || !ex) {
    const today = state.daily[store.dayOf(Date.now())] ?? 0;
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20, maxWidth: 640, width: "100%", alignSelf: "center", paddingTop: 60 }}>
        <Text style={{ fontSize: 64, textAlign: "center" }}>{mistakes === 0 ? "🏆" : "💪"}</Text>
        <Text style={{ color: t.ink, fontSize: 28, fontWeight: "800", textAlign: "center" }}>{lessonId ? "Lesson complete!" : "Review done!"}</Text>
        <View style={{ flexDirection: "row", gap: 12, justifyContent: "center" }}>
          <Stat label="XP" value={`+${xp + (finished?.bonus ?? 0)}`} color={t.gold} />
          <Stat label="Accuracy" value={`${Math.round((100 * total) / (total + mistakes))}%`} color={t.good} />
          <Stat label="Streak" value={`🔥 ${state.streak}`} color={t.bad} />
        </View>
        <Text style={{ color: t.muted, textAlign: "center", fontSize: 15 }}>
          {today >= state.goal ? `Daily goal reached: ${today} XP today.` : `${today} of ${state.goal} XP toward today's goal.`}
        </Text>
        <Button label="Continue" onPress={onExit} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 720, width: "100%", alignSelf: "center" }}>
        <Pressable onPress={onExit} accessibilityLabel="Close lesson" hitSlop={12}>
          <Text style={{ color: t.muted, fontSize: 26, fontWeight: "600" }}>✕</Text>
        </Pressable>
        <View style={{ flex: 1, height: 16, borderRadius: 8, backgroundColor: t.line, overflow: "hidden" }}>
          <View style={{ width: `${(100 * done) / total}%`, height: "100%", backgroundColor: t.good, borderRadius: 8 }} />
        </View>
        <Text style={{ color: t.muted, fontSize: 13, fontWeight: "700" }}>{title}</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 80, maxWidth: 720, width: "100%", alignSelf: "center" }}>
        <Exercise
          key={`${ex.id}:${done}:${queue.length}`}
          core={core}
          ex={ex}
          draft={state.drafts[ex.id]}
          onDraft={(a) => {
            state.drafts[ex.id] = a;
            commit();
          }}
          onMiss={() => miss(ex)}
          onDone={(o) => next(ex, o)}
        />
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  const t = useTheme();
  return (
    <View style={{ borderWidth: 2, borderColor: color, borderRadius: 14, overflow: "hidden", minWidth: 96 }}>
      <Text style={{ backgroundColor: color, color: "#fff", textAlign: "center", fontWeight: "800", fontSize: 12, paddingVertical: 4, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ color: t.ink, textAlign: "center", fontWeight: "800", fontSize: 20, paddingVertical: 10 }}>{value}</Text>
    </View>
  );
}
