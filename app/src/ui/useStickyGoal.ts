// The goal box's memory. While you type, most probes catch the code half
// finished (`exa`, `| succ n ih =>` with nothing after it) and Lean has no goal
// to report there. Rather than blink the box away on every keystroke, it keeps
// showing the last goal state Lean did report, marked stale, until a probe
// brings a new one.
import { useCallback, useState } from "react";

export interface ShownGoal {
  goals: string;
  label: string;
  stale: boolean; // from an earlier probe: the code at the cursor doesn't check yet
}

export function useStickyGoal() {
  const [goal, setGoal] = useState<ShownGoal | null>(null);
  // goals: null when this probe found none (keep the last one, as stale).
  const update = useCallback((goals: string | null, label: string) => {
    setGoal((prev) => (goals != null ? { goals, label, stale: false } : prev && { ...prev, stale: true }));
  }, []);
  const clear = useCallback(() => setGoal(null), []);
  return { goal, update, clear };
}
