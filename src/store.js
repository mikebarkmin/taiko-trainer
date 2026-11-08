// Saving in the browser. Everything stays on this device; use Export,
// Import or share links to move patterns and songs between devices.

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
    if (typeof raw.item === "string" && /^(pattern|song):[A-Za-z0-9_-]{1,64}$/.test(raw.item)) s.item = raw.item;
    const bpm = Math.round(Number(raw.bpm));
    if (bpm >= MIN_BPM && bpm <= MAX_BPM) s.bpm = bpm;
    for (const k of ["countIn", "loop", "guide", "click", "speak"]) if (typeof raw[k] === "boolean") s[k] = raw[k];
  }
  return s;
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings);
}
