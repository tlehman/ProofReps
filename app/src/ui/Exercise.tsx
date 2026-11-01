// One exercise. Choice exercises are graded on the spot (their options were
// checked by Lean when the course was built). Everything else is graded by
// the server's Lean: any answer Lean accepts is right.
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Core } from "../core";
import type { Exercise as Ex, Fill } from "../content/types";
import { goalProbe, goalView, judge, source, where, type Message } from "../lean/grade";
import * as lean from "../lean/lean";
import { useLean } from "./useLean";
import { Button } from "./Button";
import { CodeBlock, GoalBox } from "./Code";
import { Diagnostics } from "./Diagnostics";
import { Editor } from "./Editor";
import { Markdown } from "./Markdown";
import { mono, useTheme } from "./theme";

export type Outcome = { correct: boolean; missed: boolean; answer?: string };

export interface ExerciseProps {
  core: Core;
  ex: Ex;
  draft?: string;
  onDraft?: (answer: string) => void;
  onMiss: () => void; // the first wrong answer (graded once, for scheduling)
  onDone: (o: Outcome) => void; // the learner pressed Continue
}

export function Exercise(props: ExerciseProps) {
  return props.ex.kind === "choice" ? <ChoiceExercise {...props} /> : <LeanExercise {...props} ex={props.ex as Ex & Fill} />;
}

function Header({ ex }: { ex: Ex }) {
  const t = useTheme();
  const tag = { choice: "Pick one", fill: "Fill the hole", proof: "Prove it", fix: "Fix it" }[ex.kind];
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: t.brand, fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 }}>{tag}</Text>
      <Text style={{ color: t.ink, fontSize: 24, fontWeight: "800" }}>{ex.title}</Text>
      <Markdown text={ex.body} />
      {ex.code ? <CodeBlock code={ex.code} /> : null}
      <Markdown text={ex.prompt} size={17} bold />
    </View>
  );
}

function Sheet({ good, title, children }: { good: boolean; title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: good ? t.goodSoft : t.badSoft, borderRadius: 16, padding: 16, gap: 12 }}>
      <Text style={{ color: good ? t.good : t.bad, fontSize: 20, fontWeight: "800" }}>{title}</Text>
      {children}
    </View>
  );
}

function ChoiceExercise({ ex, onMiss, onDone }: ExerciseProps) {
  const t = useTheme();
  const c = ex as Ex & { kind: "choice"; options: string[]; answer: number };
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const right = picked === c.answer;
  return (
    <View style={{ gap: 18 }}>
      <Header ex={ex} />
      <View style={{ gap: 10 }}>
        {c.options.map((o, i) => {
          const sel = picked === i;
          const showGood = checked && i === c.answer;
          const showBad = checked && sel && !right;
          return (
            <Pressable
              key={i}
              disabled={checked}
              onPress={() => setPicked(i)}
              style={{
                borderWidth: 2,
                borderBottomWidth: 4,
                borderRadius: 14,
                padding: 14,
                borderColor: showGood ? t.good : showBad ? t.bad : sel ? t.brand : t.line,
                backgroundColor: showGood ? t.goodSoft : showBad ? t.badSoft : sel ? t.brandSoft : t.card,
              }}
            >
              <Text style={{ fontFamily: mono, fontSize: 15, lineHeight: 21, color: t.ink }}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
      {!checked ? (
        <Button
          label="Check"
          disabled={picked == null}
          onPress={() => {
            setChecked(true);
            if (!right) onMiss();
          }}
        />
      ) : (
        <Sheet good={right} title={right ? "Correct!" : "Not quite"}>
          {!right ? (
            <Text style={{ color: t.ink, fontSize: 15 }}>
              The answer is <Text style={{ fontFamily: mono, fontWeight: "700" }}>{c.options[c.answer]}</Text>
            </Text>
          ) : null}
          <Markdown text={ex.explain} size={15} />
          <Button label="Continue" kind={right ? "good" : "bad"} onPress={() => onDone({ correct: right, missed: !right })} />
        </Sheet>
      )}
    </View>
  );
}

type Result = { kind: "ok" | "error" | "incomplete" | "failed"; messages: Message[]; note?: string };

function LeanExercise({ core, ex, draft, onDraft, onMiss, onDone }: ExerciseProps & { ex: Ex & Fill }) {
  const t = useTheme();
  const status = useLean();
  const [answer, setAnswer] = useState(draft ?? ex.start ?? "");
  const [row, setRow] = useState(0);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [misses, setMisses] = useState(0);
  const [hint, setHint] = useState(false);
  const [goal, setGoal] = useState<{ goals: string | null; label: string } | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const missed = useRef(false);

  const [before, after] = ex.template.split("___");
  const holeOnOwnLine = /\n\s*$/.test(before) || before.trim() === "";
  const tactic = /(\bby|·)\s*$/.test(before);

  // The goal where the cursor is, refreshed when typing pauses.
  useEffect(() => {
    if (status.status !== "ready" || result?.kind === "ok") return;
    let live = true;
    const timer = setTimeout(async () => {
      const probe = goalProbe(ex.template, answer, row);
      const cs = source(core, ex.template, probe.answer);
      if (!cs) return;
      try {
        const msgs = await lean.probe("goal", cs.src);
        if (!live || !msgs) return;
        const v = goalView(probe, msgs, cs.guardLine);
        setGoal({ goals: v.goals, label: probe.traceLine == null ? "Expected" : "Goal at cursor" });
      } catch {}
    }, 500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [answer, row, status.status, result?.kind, core, ex.template]);

  const check = async () => {
    setChecking(true);
    setResult(null);
    try {
      const cs = source(core, ex.template, answer);
      if (!cs) return setResult({ kind: "failed", messages: [], note: "That answer is too long to check." });
      const issue = core.brackets(answer);
      const note = issue
        ? issue.kind === "unclosed"
          ? `The \`${issue.open}\` is never closed.`
          : issue.kind === "stray"
            ? `There's a \`${issue.close}\` with nothing to close.`
            : `\`${issue.open}\` is closed by \`${issue.close}\`.`
        : undefined;
      const v = judge(cs, await lean.check(cs.src));
      const res: Result = { kind: v.kind, messages: v.kind === "ok" ? [] : v.messages, note };
      if (v.kind !== "ok" && !missed.current) {
        missed.current = true;
        onMiss();
      }
      if (v.kind !== "ok") setMisses((n) => n + 1);
      setResult(res);
    } catch (e) {
      setResult({ kind: "failed", messages: [], note: (e as Error).message });
    } finally {
      setChecking(false);
    }
  };

  const edit = (v: string) => {
    setAnswer(v);
    onDraft?.(v);
    if (result && result.kind !== "ok") setResult(null);
  };

  const ok = result?.kind === "ok";
  const leanBusy = status.status === "starting" || status.status === "idle";
  return (
    <View style={{ gap: 18 }}>
      <Header ex={ex} />
      <View style={{ gap: 8 }}>
        {before.trim() ? <CodeBlock code={before.replace(/\s+$/, "")} dim /> : null}
        <Editor
          value={answer}
          onChange={edit}
          onCursor={setRow}
          minLines={holeOnOwnLine || tactic ? 3 : 1}
          placeholder={tactic ? "tactics, one per line" : "your answer"}
          status={ok ? "good" : result && result.kind !== "failed" ? "bad" : null}
        />
        {after.trim() ? <CodeBlock code={after.replace(/^\s*\n/, "").replace(/\s+$/, "")} dim /> : null}
      </View>

      {goal && goal.goals != null && !ok ? <GoalBox goals={goal.goals} label={goal.label} /> : null}

      {ex.hint && !ok ? (
        hint ? (
          <Text style={{ color: t.muted, fontSize: 15 }}>💡 {ex.hint}</Text>
        ) : (
          <Pressable onPress={() => setHint(true)}>
            <Text style={{ color: t.brand, fontSize: 15, fontWeight: "700" }}>Show a hint</Text>
          </Pressable>
        )
      ) : null}

      {!result || (result.kind !== "ok" && !gaveUp) ? (
        <View style={{ gap: 10 }}>
          {result ? (
            <Sheet good={false} title={result.kind === "failed" ? "Couldn't check" : result.kind === "incomplete" ? "Not proved yet" : "Lean says no"}>
              {result.note ? <Markdown text={result.note} size={15} /> : null}
              {result.kind === "incomplete" ? (
                <Text style={{ color: t.ink, fontSize: 15 }}>
                  No error, but part of it didn't make it: a declaration is missing or still uses `sorry`. Check that the whole answer parses.
                </Text>
              ) : null}
              <Diagnostics messages={result.messages} where={(m) => where(ex, answer, m.line)} />
            </Sheet>
          ) : null}
          <Button
            label={leanBusy ? `Starting Lean${status.detail ? `: ${status.detail}` : ""}` : "Check"}
            busy={checking || leanBusy}
            disabled={!answer.trim() || status.status === "failed"}
            onPress={check}
          />
          {misses >= 2 ? <Button label="Show a solution" kind="ghost" onPress={() => setGaveUp(true)} /> : null}
          {status.status === "failed" ? <LeanTrouble /> : null}
        </View>
      ) : (
        <Sheet good={ok} title={ok ? (missed.current ? "Got it" : "Correct!") : "Here's one solution"}>
          {!ok ? <CodeBlock code={ex.solutions[0]} /> : null}
          <Markdown text={ex.explain} size={15} />
          <Button
            label="Continue"
            kind={ok ? "good" : "bad"}
            onPress={() => onDone({ correct: ok, missed: missed.current || !ok, answer: ok ? answer : undefined })}
          />
        </Sheet>
      )}
    </View>
  );
}

export function LeanTrouble() {
  const t = useTheme();
  const { status, detail } = useLean();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: t.muted, fontSize: 14 }}>{`Lean isn't reachable: ${detail || status}. Is the ProofReps server running (scripts/start.sh)?`}</Text>
      <Button label="Try again" kind="secondary" onPress={() => (lean.retry(), lean.start())} />
    </View>
  );
}

