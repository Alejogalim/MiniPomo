import { test } from "node:test";
import assert from "node:assert/strict";
import { DURATIONS, CYCLE, newSession, finishPhase, petState, cyclesFilled } from "./timer.js";

test("focus goes to short break, every 4th focus goes to long break", () => {
  let s = newSession();
  for (let i = 1; i <= 3; i++) {
    s = finishPhase(s);
    assert.equal(s.mode, "short");
    s = finishPhase(s);
    assert.equal(s.mode, "focus");
  }
  s = finishPhase(s);
  assert.equal(s.mode, "long");
  assert.equal(s.remaining, DURATIONS.long);
  assert.equal(s.rounds, 4);
});

test("pet state follows timer state", () => {
  const s = newSession();
  assert.equal(petState(s, false), "idle");
  assert.equal(petState({ ...s, running: true }, false), "focus");
  assert.equal(petState({ ...s, running: true, mode: "short" }, false), "break");
  assert.equal(petState({ ...s, running: true }, true), "done");
});

test("cycle pips fill per focus round and reset after the long break", () => {
  let s = newSession();
  assert.equal(cyclesFilled(s), 0);
  for (let i = 1; i <= 3; i++) {
    s = finishPhase(s); // focus -> short break
    assert.equal(cyclesFilled(s), i);
    s = finishPhase(s); // break -> focus
    assert.equal(cyclesFilled(s), i);
  }
  s = finishPhase(s); // 4th focus -> long break
  assert.equal(cyclesFilled(s), CYCLE);
  s = finishPhase(s); // long break -> focus, new set
  assert.equal(cyclesFilled(s), 0);
});
