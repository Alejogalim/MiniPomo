import { DURATIONS, newSession, finishPhase, petState, cyclesFilled } from "./timer.js";
import { CHARACTER_KEYS, bodyColor, spriteSVG } from "./characters.js";

const $ = (id) => document.getElementById(id);
const tauri = window.__TAURI_INTERNALS__;
const MODE_LABELS = { focus: "focus", short: "short break", long: "long break" };
const SCALE_MIN = 0.75;
const SCALE_MAX = 1.5;
const SCALE_STEP = 0.25;

const stored = (key, fallback) => {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) ? value : fallback;
};

let session = { ...newSession(), rounds: stored("rounds", 0) };
let characterIndex = Math.abs(stored("character", 0)) % CHARACTER_KEYS.length;
let scale = stored("scale", 1);
let celebrating = false;
let deadline = null; // wall clock end of the running phase, so sleeping the
let timerId = null; //  machine does not stretch the timer
let celebrateId = null;

function render() {
  const key = CHARACTER_KEYS[characterIndex];
  const pet = $("pet");
  if (pet.dataset.character !== key) {
    pet.innerHTML = spriteSVG(key);
    pet.dataset.character = key;
    document.documentElement.style.setProperty("--body", bodyColor(key));
  }
  pet.dataset.state = petState(session, celebrating);
  $("mode").textContent = celebrating ? "nice!" : MODE_LABELS[session.mode];
  const m = String(Math.floor(session.remaining / 60)).padStart(2, "0");
  const s = String(session.remaining % 60).padStart(2, "0");
  $("time").textContent = `${m}:${s}`;
  $("toggle").textContent = session.running ? "❚❚" : "▶";
  $("total").textContent = session.rounds;

  const filled = cyclesFilled(session);
  [...$("cycles").children].forEach((pip, i) => pip.classList.toggle("on", i < filled));
}

let audio = null;
function chime() {
  audio ??= new AudioContext();
  if (audio.state === "suspended") audio.resume();
  [660, 880].forEach((freq, i) => {
    const start = audio.currentTime + i * 0.25;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(0.2, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

function remainingNow() {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
  deadline = null;
}

function finishPhaseNow() {
  stopTimer();
  session = finishPhase(session);
  localStorage.setItem("rounds", session.rounds);
  celebrating = true;
  chime();
  clearTimeout(celebrateId);
  celebrateId = setTimeout(() => {
    celebrating = false;
    render();
  }, 5000);
  render();
}

function onTick() {
  const remaining = remainingNow();
  if (remaining === session.remaining) return;
  session = { ...session, remaining };
  if (remaining === 0) finishPhaseNow();
  else render();
}

function toggle() {
  if (session.running) {
    const remaining = remainingNow();
    stopTimer();
    session = { ...session, running: false, remaining };
  } else {
    stopTimer();
    session = { ...session, running: true };
    deadline = Date.now() + session.remaining * 1000;
    timerId = setInterval(onTick, 250);
  }
  render();
}

function reset() {
  stopTimer();
  clearTimeout(celebrateId);
  celebrating = false;
  session = { ...session, running: false, remaining: DURATIONS[session.mode] };
  render();
}

function nextCharacter() {
  characterIndex = (characterIndex + 1) % CHARACTER_KEYS.length;
  localStorage.setItem("character", characterIndex);
  render();
}

function toggleSettings() {
  $("sign").classList.toggle("open");
}

// Size the window to the drawn widget and place it 24px from the corner. Linux
// additionally clips the window's input shape so the transparent corners pass
// clicks through; Windows and macOS have no such API, so the window itself has
// to stay tight.
let lastLayout = null;
function layout(snap) {
  const r = $("stage").getBoundingClientRect();
  const key = [r.left, r.top, r.width, r.height].map(Math.round).join();
  // Resize events also fire when nothing moved; snapping then would drag the
  // widget back to the corner mid-use.
  if (!snap && key === lastLayout) return;
  lastLayout = key;
  tauri?.invoke("apply_layout", {
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
    snap,
  });
}

// Only a size change should move the widget back to the corner.
let snapPending = false;
window.addEventListener("resize", () => {
  layout(snapPending);
  snapPending = false;
});

function contentBox() {
  const stage = $("stage").getBoundingClientRect();
  const badge = $("total").getBoundingClientRect();
  const pad = 6; // room for the sign shadow and the character's drop shadow
  return {
    w: Math.round(Math.max(stage.right, badge.right) - Math.min(stage.left, badge.left) + pad * 2),
    h: Math.round(Math.max(stage.bottom, badge.bottom) - Math.min(stage.top, badge.top) + pad * 2),
  };
}
const baseSize = contentBox();

async function applyScale(next) {
  scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(next / SCALE_STEP) * SCALE_STEP));
  localStorage.setItem("scale", scale);
  document.documentElement.style.setProperty("--scale", scale);
  snapPending = true;
  await tauri?.invoke("set_widget_size", {
    width: Math.round(baseSize.w * scale),
    height: Math.round(baseSize.h * scale),
  });
  setTimeout(() => {
    snapPending = false;
  }, 800);
}

// A drag also ends in a click, so remember where the press started and ignore
// the click if the pointer moved.
let pointerDown = null;
window.addEventListener("mousedown", (e) => {
  pointerDown = { x: e.screenX, y: e.screenY };
});

const isLinux = navigator.userAgent.includes("Linux");
if (isLinux) {
  // Dragging is done natively so the widget can show its own grab cursor; the
  // window manager's drag paints its own cursor instead.
  $("stage").addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    document.body.classList.add("dragging");
    tauri?.invoke("drag_begin");
  });

  let dragFrame = null;
  window.addEventListener("mousemove", () => {
    if (!document.body.classList.contains("dragging")) return;
    dragFrame ??= requestAnimationFrame(() => {
      dragFrame = null;
      tauri?.invoke("drag_update");
    });
  });

  const endDrag = () => {
    if (!document.body.classList.contains("dragging")) return;
    document.body.classList.remove("dragging");
    tauri?.invoke("drag_end");
  };
  window.addEventListener("mouseup", endDrag);
  window.addEventListener("blur", endDrag);
} else {
  $("stage").setAttribute("data-tauri-drag-region", "deep");
}

$("pet").addEventListener("click", (e) => {
  const moved =
    pointerDown && Math.hypot(e.screenX - pointerDown.x, e.screenY - pointerDown.y) > 4;
  if (!moved) toggle();
});

$("toggle").onclick = toggle;
$("reset").onclick = reset;
$("character").onclick = nextCharacter;
$("settings").onclick = toggleSettings;
$("smaller").onclick = () => applyScale(scale - SCALE_STEP);
$("bigger").onclick = () => applyScale(scale + SCALE_STEP);

render();
applyScale(scale).then(() => layout(true));
