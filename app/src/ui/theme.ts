import { useColorScheme } from "react-native";

const light = {
  bg: "#f7f6fb",
  card: "#ffffff",
  ink: "#1b1636",
  muted: "#6b6787",
  line: "#e3e0ef",
  brand: "#4b3bc4",
  brandInk: "#ffffff",
  brandSoft: "#ece9fb",
  gold: "#f5b400",
  good: "#1f9d55",
  goodSoft: "#e3f6ea",
  bad: "#d23c3c",
  badSoft: "#fbe7e7",
  warn: "#b7791f",
  code: "#f0eef8",
  codeInk: "#251f4a",
  locked: "#c9c5db",
};

const dark: typeof light = {
  bg: "#14102e",
  card: "#1f1a45",
  ink: "#f1effa",
  muted: "#a6a1c7",
  line: "#332c66",
  brand: "#8b7dff",
  brandInk: "#14102e",
  brandSoft: "#2a2360",
  gold: "#ffca28",
  good: "#4fd18b",
  goodSoft: "#173a2a",
  bad: "#ff7b7b",
  badSoft: "#4a1f2a",
  warn: "#f6c26b",
  code: "#110d29",
  codeInk: "#e6e2ff",
  locked: "#4a4478",
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === "dark" ? dark : light);
export const mono = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";
