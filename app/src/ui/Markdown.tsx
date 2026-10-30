// The tiny markdown exercises are written in: paragraphs, `code`, **bold**,
// *em*, and ```fenced``` code blocks.
import { Fragment } from "react";
import { Text, View } from "react-native";
import { mono, useTheme } from "./theme";
import { CodeBlock } from "./Code";

function inline(text: string, codeStyle: object) {
  const out: React.ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = out.length;
    if (m[1] != null) out.push(<Text key={k} style={codeStyle}>{m[1]}</Text>);
    else if (m[2] != null) out.push(<Text key={k} style={{ fontWeight: "700" }}>{m[2]}</Text>);
    else out.push(<Text key={k} style={{ fontStyle: "italic" }}>{m[3]}</Text>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, size = 16, bold = false }: { text: string; size?: number; bold?: boolean }) {
  const t = useTheme();
  const codeStyle = { fontFamily: mono, fontSize: size - 1, backgroundColor: t.code, color: t.codeInk, borderRadius: 4, paddingHorizontal: 3 };
  const blocks = text.split(/(```(?:lean)?\n[\s\S]*?```)/g).filter((b) => b.trim());
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, i) => {
        const fence = b.match(/^```(?:lean)?\n([\s\S]*?)```$/);
        if (fence) return <CodeBlock key={i} code={fence[1].replace(/\n$/, "")} />;
        return (
          <Fragment key={i}>
            {b
              .trim()
              .split(/\n\s*\n/)
              .map((p, j) => (
                <Text key={j} style={{ color: t.ink, fontSize: size, lineHeight: size * 1.45, fontWeight: bold ? "700" : "400" }}>
                  {inline(p.replace(/\n/g, " "), codeStyle)}
                </Text>
              ))}
          </Fragment>
        );
      })}
    </View>
  );
}
