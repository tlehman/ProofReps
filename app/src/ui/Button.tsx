import { ActivityIndicator, Pressable, Text } from "react-native";
import { useTheme } from "./theme";

export function Button({
  label,
  onPress,
  kind = "primary",
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "good" | "bad" | "ghost";
  disabled?: boolean;
  busy?: boolean;
}) {
  const t = useTheme();
  const bg = { primary: t.brand, secondary: t.card, good: t.good, bad: t.bad, ghost: "transparent" }[kind];
  const fg = kind === "secondary" || kind === "ghost" ? t.brand : t.brandInk;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: bg,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 18,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        borderWidth: kind === "secondary" ? 2 : 0,
        borderColor: t.line,
        borderBottomWidth: kind === "ghost" ? 0 : kind === "secondary" ? 4 : 4,
        borderBottomColor: kind === "secondary" ? t.line : "rgba(0,0,0,0.22)",
      })}
    >
      {busy ? <ActivityIndicator color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: "800", letterSpacing: 0.4 }}>{label}</Text>
    </Pressable>
  );
}
