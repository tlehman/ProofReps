import { Text, View } from "react-native";
import type { Message } from "../lean/grade";
import { mono, useTheme } from "./theme";

export function Diagnostics({ messages, where }: { messages: Message[]; where?: (m: Message) => string }) {
  const t = useTheme();
  if (!messages.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {messages.map((m, i) => {
        const color = m.severity === "error" ? t.bad : m.severity === "warning" ? t.warn : t.brand;
        const label = m.parse ? "syntax error" : m.severity === "information" ? "info" : m.severity;
        const loc = where ? where(m) : m.line != null ? `line ${m.line}${m.col != null ? `:${m.col + 1}` : ""}` : "";
        return (
          <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: color, paddingLeft: 10, gap: 2 }}>
            <Text style={{ color, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {label}
              {loc ? <Text style={{ color: t.muted, fontWeight: "500", textTransform: "none" }}>{`  ${loc}`}</Text> : null}
            </Text>
            <Text selectable style={{ fontFamily: mono, fontSize: 13, lineHeight: 19, color: t.ink }}>
              {m.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
