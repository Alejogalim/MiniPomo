import { DURATIONS, newSession, tick, finishPhase, petState, cyclesFilled } from "./timer.js";
import { CHARACTER_KEYS, bodyColor, spriteSVG } from "./characters.js";

const $ = (id) => document.getElementById(id);
const MODE_LABELS = { focus: "focus", short: "short break", long: "long break" };

let session = { ...newSession(), rounds: Number(localStorage.getItem("rounds") ?? 0) };
let celebrating = false;
let timerId = null;
let characterIndex = Number(localStorage.getItem("character") ?? 0);

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

function chime() {
  const ctx = new AudioContext();
  [660, 880].forEach((freq, i) => {
    const start = ctx.currentTime + i * 0.25;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

function onTick() {
  session = tick(session);
  if (session.remaining === 0) {
    clearInterval(timerId);
    timerId = null;
    session = finishPhase(session);
    localStorage.setItem("rounds", session.rounds);
    celebrating = true;
    chime();
    setTimeout(() => {
      celebrating = false;
      render();
    }, 5000);
  }
  render();
}

function toggle() {
  session = { ...session, running: !session.running };
  clearInterval(timerId);
  timerId = session.running ? setInterval(onTick, 1000) : null;
  render();
}

function reset() {
  clearInterval(timerId);
  timerId = null;
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

// Tell the native side where the visible widget is so the transparent margins
// let clicks through to the desktop.
function reportHitRect() {
  const r = $("stage").getBoundingClientRect();
  window.__TAURI_INTERNALS__?.invoke("set_hit_rect", {
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
  });
}
window.addEventListener("resize", () => {
  reportHitRect();
  snapCorner();
});

async function snapCorner() {
  const r = $("stage").getBoundingClientRect();
  await window.__TAURI_INTERNALS__?.invoke("snap_corner", {
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
  });
}

const SCALE_MIN = 0.75;
const SCALE_MAX = 1.5;
const SCALE_STEP = 0.25;
// Size the window to the drawn widget so no invisible margin is left to catch
// clicks. Linux also clips the input shape, but Windows and macOS have no such
// per-region API, so the window itself has to be tight.
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
let scale = Number(localStorage.getItem("scale") ?? 1);

async function applyScale(next) {
  scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(next / SCALE_STEP) * SCALE_STEP));
  localStorage.setItem("scale", scale);
  document.documentElement.style.setProperty("--scale", scale);
  await window.__TAURI_INTERNALS__.invoke("set_widget_size", {
    width: Math.round(baseSize.w * scale),
    height: Math.round(baseSize.h * scale),
  });
}

// Drag the widget manually on Linux so it can show its own grab cursor; the
// native drag is handled by the window manager and paints its own cursor.
// Windows and macOS use the built-in drag region instead.
const tauri = window.__TAURI_INTERNALS__;
const isLinux = navigator.userAgent.includes("Linux");

if (isLinux) {
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

$("toggle").onclick = toggle;
$("reset").onclick = reset;
$("character").onclick = nextCharacter;
$("settings").onclick = toggleSettings;
$("smaller").onclick = () => applyScale(scale - SCALE_STEP);
$("bigger").onclick = () => applyScale(scale + SCALE_STEP);
$("pet").onclick = toggle;
render();
applyScale(scale).then(() => {
  reportHitRect();
  snapCorner();
});
