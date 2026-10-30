import { useEffect, useState } from "react";
import * as lean from "../lean/lean";

export function useLean() {
  const [s, set] = useState(lean.getStatus());
  useEffect(() => lean.onStatus(() => set(lean.getStatus())), []);
  return s;
}
