import { Pressable, ScrollView, Text, View } from "react-native";
import * as store from "../store";
import { Button } from "./Button";
import { useTheme } from "./theme";

const GOALS = [10, 30, 50, 100];

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function pickFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const f = input.files?.[0];
      f ? f.text().then(resolve, () => resolve(null)) : resolve(null);
    };
    input.click();
  });
}

export function Settings({ state, commit, replace, onExit }: { state: store.State; commit: () => void; replace: (s: store.State) => void; onExit: () => void }) {
  const t = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 18, maxWidth: 640, width: "100%", alignSelf: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Pressable onPress={onExit} accessibilityLabel="Back" hitSlop={12}>
          <Text style={{ color: t.muted, fontSize: 26, fontWeight: "600" }}>‹</Text>
        </Pressable>
        <Text style={{ color: t.ink, fontSize: 22, fontWeight: "800" }}>Settings</Text>
      </View>

      <Text style={{ color: t.ink, fontSize: 16, fontWeight: "700" }}>Daily goal</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {GOALS.map((g) => (
          <Pressable
            key={g}
            onPress={() => {
              state.goal = g;
              commit();
            }}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 12,
              alignItems: "center",
              borderWidth: 2,
              borderColor: state.goal === g ? t.brand : t.line,
              backgroundColor: state.goal === g ? t.brandSoft : t.card,
            }}
          >
            <Text style={{ color: t.ink, fontWeight: "800" }}>{g} XP</Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ color: t.ink, fontSize: 16, fontWeight: "700" }}>Your progress</Text>
      <Text style={{ color: t.muted, fontSize: 14 }}>
        Progress lives in this browser's localStorage. Export it to keep a backup or to move it to another device.
      </Text>
      <Button label="Export progress" kind="secondary" onPress={() => download(`proofreps-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 1))} />
      <Button
        label="Import progress"
        kind="secondary"
        onPress={async () => {
          const text = await pickFile();
          if (!text) return;
          try {
            const s = { ...store.empty(), ...JSON.parse(text) } as store.State;
            if (s.v !== 1 || typeof s.cards !== "object") throw new Error("not a ProofReps export");
            replace(s);
          } catch (e) {
            alert(`Couldn't import: ${(e as Error).message}`);
          }
        }}
      />
      <Button
        label="Reset all progress"
        kind="ghost"
        onPress={() => {
          if (confirm("Erase all progress in this browser?")) replace(store.empty());
        }}
      />
      <Text style={{ color: t.muted, fontSize: 12 }}>
        ProofReps runs Lean 4 (core library) compiled to WebAssembly. Source: github.com/tlehman/ProofReps
      </Text>
    </ScrollView>
  );
}
