// Saving in the browser: patterns, songs, video lessons (strikes, not the
// videos themselves) and settings go to localStorage. Videos go to
// IndexedDB (see videostore.js). Use share links or files to move things
// between devices.

import { normalizeCustom } from "./core/library.js";
import { MIN_BPM, MAX_BPM } from "./core/timeline.js";

const LIBRARY_KEY = "taiko-trainer:library:v1";
const SETTINGS_KEY = "taiko-trainer:settings:v1";

export const DEFAULT_SETTINGS = {
  item: "pattern:b-don-doko",
  bpm: 100,
  countIn: true,
  loop: true,
  guide: true,
  click: true,
  speak: true,
  sayWords: false,
  videoRate: 1,
  videoSound: true,
  videoGuide: false,
  videoMirror: false,
  timelineTop: false,
  tapDelay: 0, // ms taken off every tap in the strike editor (see "Tap timing")
  showWave: true,
  videoOverlay: true, // strikes slide over the video, rhythm-game style
  micDelay: 0, // ms between a real drum hit and the app hearing it (see "Real drum")
  micSens: 50, // 0…100
  micRim: 0, // brightness above which a hit is a rim hit; 0: not taught
};

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadCustom() {
  return normalizeCustom(read(LIBRARY_KEY));
}

/** Returns false when the browser refused to save (private mode, full storage). */
export function saveCustom(custom) {
  return write(LIBRARY_KEY, custom);
}

export function loadSettings() {
  const raw = read(SETTINGS_KEY);
  const s = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === "object") {
    if (typeof raw.item === "string" && /^(pattern|song|lesson):[A-Za-z0-9_-]{1,64}$/.test(raw.item)) s.item = raw.item;
    const bpm = Math.round(Number(raw.bpm));
    if (bpm >= MIN_BPM && bpm <= MAX_BPM) s.bpm = bpm;
    for (const k of ["countIn", "loop", "guide", "click", "speak", "sayWords", "videoSound", "videoGuide", "videoMirror", "timelineTop", "showWave", "videoOverlay"]) if (typeof raw[k] === "boolean") s[k] = raw[k];
    if ([0.25, 0.5, 0.75, 1, 1.25].includes(raw.videoRate)) s.videoRate = raw.videoRate;
    const delay = Math.round(Number(raw.tapDelay));
    if (delay >= 0 && delay <= 400) s.tapDelay = delay;
    const micDelay = Math.round(Number(raw.micDelay));
    if (micDelay >= 0 && micDelay <= 400) s.micDelay = micDelay;
    const sens = Math.round(Number(raw.micSens));
    if (sens >= 0 && sens <= 100) s.micSens = sens;
    if (Number(raw.micRim) > 0 && Number(raw.micRim) < 10) s.micRim = Number(raw.micRim);
  }
  return s;
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings);
}
