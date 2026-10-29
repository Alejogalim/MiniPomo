export const DURATIONS = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
export const CYCLE = 4;

export function newSession() {
  return { mode: "focus", remaining: DURATIONS.focus, running: false, rounds: 0 };
}

export function tick(s) {
  if (!s.running || s.remaining <= 0) return s;
  return { ...s, remaining: s.remaining - 1 };
}

export function finishPhase(s) {
  if (s.mode === "focus") {
    const rounds = s.rounds + 1;
    const mode = rounds % CYCLE === 0 ? "long" : "short";
    return { ...s, rounds, mode, remaining: DURATIONS[mode], running: false };
  }
  return { ...s, mode: "focus", remaining: DURATIONS.focus, running: false };
}

export function petState(s, celebrating) {
  if (celebrating) return "done";
  if (!s.running) return "idle";
  return s.mode === "focus" ? "focus" : "break";
}

// Pips for the current set of four; the long break shows the full set.
export function cyclesFilled(s) {
  return s.mode === "long" ? CYCLE : s.rounds % CYCLE;
}
