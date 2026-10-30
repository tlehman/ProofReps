import { ScrollView, Text, View } from "react-native";
import { mono, useTheme } from "./theme";

export function CodeBlock({ code, dim = false }: { code: string; dim?: boolean }) {
  const t = useTheme();
  return (
    <ScrollView horizontal style={{ backgroundColor: t.code, borderRadius: 10 }} contentContainerStyle={{ padding: 12 }}>
      <Text selectable style={{ fontFamily: mono, fontSize: 14, lineHeight: 20, color: t.codeInk, opacity: dim ? 0.75 : 1 }}>
        {code}
      </Text>
    </ScrollView>
  );
}

// A Lean goal state, as an editor's infoview shows it.
export function GoalBox({ goals, label = "Goal" }: { goals: string; label?: string }) {
  const t = useTheme();
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: t.brand, backgroundColor: t.brandSoft, borderRadius: 8, padding: 10, gap: 4 }}>
      <Text style={{ color: t.brand, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</Text>
      <Text selectable style={{ fontFamily: mono, fontSize: 13, lineHeight: 19, color: t.ink }}>
        {goals || "No goals. Done!"}
      </Text>
    </View>
  );
}
