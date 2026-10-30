// Turning an answer into Lean source, and Lean's messages into a verdict.
// Shared by the app and `bun run verify`.
import type { Core } from "../core";
import type { Fill } from "../content/types";

export interface Message {
  severity: string; // "error" | "warning" | "information"
  text: string;
  line?: number;
  col?: number;
  endLine?: number;
  endCol?: number;
  parse?: boolean; // from the parse pass: a syntax error
  internal?: boolean; // Lean itself failed, not the code
}

// Every declaration in the template gets a name and is checked with
// `#print axioms` (the guard). That catches what an error message might not:
// a proof that leans on `sorry`, or a declaration that never got made.
export interface Source {
  src: string;
  names: string[];
  guardLine: number; // first line of the guard; messages from here on are about it
}

export function source(core: Core, template: string, answer: string): Source | null {
  const names: string[] = [];
  let n = 0;
  const named = template.replace(/^(example)(\s*[:({[])/gm, (_, _kw, rest) => `theorem proofreps_${n++}${rest}`);
  for (const m of named.matchAll(/^(?:private\s+)?(?:theorem|lemma|def|abbrev|instance)\s+([^\s:({[]+)/gm)) names.push(m[1]);
  const filled = core.fill(named, answer);
  if (filled == null) return null;
  const body = filled + "\n\n";
  return { src: body + names.map((x) => `#print axioms ${x}`).join("\n") + "\n", names, guardLine: body.split("\n").length };
}

export type Verdict =
  | { kind: "ok"; messages: Message[] }
  | { kind: "error"; messages: Message[] } // Lean rejected it: these are the errors
  | { kind: "incomplete"; messages: Message[] }; // no error, but a declaration is missing or uses sorry

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function judge({ names, guardLine }: Source, messages: Message[]): Verdict {
  const mine = messages.filter((m) => !(m.line != null && m.line >= guardLine));
  const errors = mine.filter((m) => m.severity === "error" || (m.severity === "warning" && /declaration uses [`']sorry/.test(m.text)));
  if (errors.length) return { kind: "error", messages: errors };
  const info = messages.filter((m) => m.severity === "information").map((m) => m.text).join("\n");
  // the browser build prints names as `'_private.0.name'`
  const proved = (x: string) =>
    new RegExp(`'(?:_private\\.(?:[^']*\\.)?\\d+\\.)?${esc(x)}' (does not depend on any axioms|depends on axioms: \\[(?![^\\]]*sorryAx))`).test(info);
  return names.every(proved) ? { kind: "ok", messages: mine } : { kind: "incomplete", messages: mine };
}

// Where the answer sits in the filled source: template lines before the hole.
export const holeLine = (template: string) => template.slice(0, template.indexOf("___")).split("\n").length;

// A message's line as the learner sees it: "your line 2" inside their answer,
// "line 5" in the surrounding template.
export function where(ex: Fill, answer: string, line: number | undefined): string {
  if (line == null) return "";
  const first = holeLine(ex.template);
  const answerLines = answer.trim() ? answer.replace(/\s+$/, "").split("\n").length : 1;
  if (line >= first && line < first + answerLines) return answerLines > 1 ? `your line ${line - first + 1}` : "your answer";
  return `line ${line}`;
}

// ---------- the goal view ----------
// What an editor's infoview shows at the cursor. In a tactic block, check the
// answer up to the cursor's line plus `trace_state`, which prints the goals
// there. In a term, an empty answer becomes `?_`, whose error shows the
// expected type.
export interface GoalProbe {
  answer: string; // what to check in place of the learner's answer
  traceLine: number | null; // filled-source line of the `trace_state`, if any
}

const tacticHole = (template: string) => /(\bby|·)\s*$/.test(template.slice(0, template.indexOf("___")));

// Column a tactic after this line goes in: inside `· tac` or `by tac`, after `=>`/`by`.
function nextIndent(line: string): number {
  const m = line.match(/^(\s*(?:by|·)\s+)\S/);
  if (m) return m[1].length;
  const ind = line.match(/^\s*/)![0].length;
  return /(=>|\bby)\s*$/.test(line) ? ind + 2 : ind;
}

export function goalProbe(template: string, answer: string, row: number): GoalProbe {
  const tactic = tacticHole(template) || /^\s*by\b/.test(answer);
  if (!tactic) return { answer: answer.trim() ? answer : "?_", traceLine: null };
  const lines = answer.replace(/\t/g, "  ").split("\n").slice(0, row + 1);
  const filled = lines.filter((l) => l.trim());
  if (!filled.length) return { answer: "trace_state", traceLine: holeLine(template) };
  const base = Math.min(...filled.map((l) => l.match(/^ */)![0].length));
  const cur = lines[lines.length - 1];
  // a blank line: as far in as the learner has typed spaces, at least to the base
  const ind = cur.trim() ? nextIndent(cur) : Math.max(base, cur.length);
  return { answer: lines.join("\n") + "\n" + " ".repeat(ind) + "trace_state", traceLine: holeLine(template) + lines.length };
}

export interface GoalView {
  goals: string | null; // null: Lean didn't get there
  errors: string[];
}

// `end` is the first line after the template (where the guard starts).
export function goalView(probe: GoalProbe, messages: Message[], end: number): GoalView {
  const mine = messages.filter((m) => m.line == null || m.line < end);
  const placeholder = /^don't know how to synthesize placeholder[^\n]*\n(?:context:\n)?/;
  const trace = probe.traceLine == null ? undefined : mine.find((m) => m.severity === "information" && m.line === probe.traceLine);
  const errors = mine.filter(
    (m) =>
      m.severity === "error" &&
      !placeholder.test(m.text) &&
      !(trace && /^unsolved goals/.test(m.text)) &&
      !(probe.traceLine != null && m.line != null && m.line > probe.traceLine),
  );
  const holes = mine.filter((m) => m.severity === "error" && placeholder.test(m.text)).map((m) => m.text.replace(placeholder, ""));
  const goals = trace ? trace.text : holes.length ? holes.join("\n\n") : probe.traceLine == null && !errors.length ? "" : null;
  return { goals, errors: errors.map((m) => m.text) };
}
