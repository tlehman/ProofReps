import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useReducer, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { loadCore, type Core } from "./src/core";
import { units } from "./src/content";
import type { Exercise, Lesson as L } from "./src/content/types";
import { asset } from "./src/env";
import * as lean from "./src/lean/lean";
import * as store from "./src/store";
import { Home } from "./src/ui/Home";
import { Lesson } from "./src/ui/Lesson";
import { Playground } from "./src/ui/Playground";
import { Settings } from "./src/ui/Settings";
import { useTheme } from "./src/ui/theme";

type Screen =
  | { name: "home" }
  | { name: "lesson"; lesson: L }
  | { name: "review"; exercises: Exercise[] }
  | { name: "playground" }
  | { name: "settings" };

const REVIEW_SIZE = 8;
const allExercises = units.flatMap((u) => u.lessons.flatMap((l) => l.exercises));

export default function App() {
  const t = useTheme();
  const [core, setCore] = useState<Core | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<store.State>(() => store.load());
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [update, setUpdate] = useState(false);

  useEffect(() => {
    fetch(asset("core.wasm"))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`core.wasm: HTTP ${r.status}`))))
      .then(loadCore)
      .then(setCore, (e) => setError(String(e?.message ?? e)));
    // Boot Lean right away so it's warm by the first answer.
    lean.start();
    const onUpdate = () => setUpdate(true);
    globalThis.addEventListener?.("proofreps-update", onUpdate);
    return () => globalThis.removeEventListener?.("proofreps-update", onUpdate);
  }, []);

  // Mutations happen in place on `state`; commit saves and redraws.
  const commit = () => {
    store.save(state);
    rerender();
  };
  const replace = (s: store.State) => {
    store.save(s);
    setState(s);
  };

  const dueIds = useMemo(() => (core ? store.due(core, state, allExercises.map((e) => e.id)) : []), [core, state, screen]);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: t.bg }}>
        <Text style={{ color: t.bad, fontSize: 16 }}>ProofReps couldn't start: {error}</Text>
      </View>
    );
  }
  if (!core) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.brand} size="large" />
      </View>
    );
  }

  const home = () => setScreen({ name: "home" });
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: t.bg }}>
      <StatusBar style="auto" />
      {update ? (
        <Pressable onPress={() => location.reload()} style={{ backgroundColor: t.brand, padding: 10, alignItems: "center" }}>
          <Text style={{ color: t.brandInk, fontWeight: "700" }}>A new version of ProofReps is ready. Tap to reload.</Text>
        </Pressable>
      ) : null}
      {screen.name === "home" ? (
        <Home
          core={core}
          state={state}
          units={units}
          dueCount={dueIds.length}
          onLesson={(_, lesson) => setScreen({ name: "lesson", lesson })}
          onReview={() => {
            const pick = new Set(dueIds.slice(0, REVIEW_SIZE));
            setScreen({ name: "review", exercises: allExercises.filter((e) => pick.has(e.id)) });
          }}
          onPlayground={() => setScreen({ name: "playground" })}
          onSettings={() => setScreen({ name: "settings" })}
        />
      ) : screen.name === "lesson" ? (
        <Lesson core={core} state={state} commit={commit} title={screen.lesson.title} exercises={screen.lesson.exercises} lessonId={screen.lesson.id} onExit={home} />
      ) : screen.name === "review" ? (
        <Lesson core={core} state={state} commit={commit} title="Review" exercises={screen.exercises} onExit={home} />
      ) : screen.name === "playground" ? (
        <Playground
          initial={state.playground}
          onSave={(s) => {
            state.playground = s;
            store.save(state);
          }}
          onExit={home}
        />
      ) : (
        <Settings state={state} commit={commit} replace={replace} onExit={home} />
      )}
    </View>
  );
}
