// Drum sounds made with the Web Audio API (no sound files needed), and the
// spoken words: recorded clips from sounds/voice/ when there are any,
// otherwise the device's own speech voice.

import { WORDS, SYLLABLES } from "./core/words.js";

const VOICE_DIR = "sounds/voice/";
const VOICE_GAIN = 0.9;

/** Ids of the recorded word clips, from sounds/voice/index.json (empty if none). */
export const voiceClips = typeof document === "undefined"
  ? Promise.resolve(new Set())
  : fetch(`${VOICE_DIR}index.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => new Set(Object.keys(j?.clips || {}).filter((id) => WORDS[id] || SYLLABLES.has(id))))
    .catch(() => new Set());
let clipIds = new Set();
voiceClips.then((ids) => { clipIds = ids; });

// The clip files are fetched while the page loads, so between the first tap
// and the first playback only decoding is left to do. Otherwise a shout
// early in a song beats its own clip, and the device voice cuts in.
const fetched = new Map(); // word id → Promise of the clip's bytes (or null)
const fetchClip = (id) => {
  if (!fetched.has(id)) {
    fetched.set(id, fetch(`${VOICE_DIR}${id}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .catch(() => null));
  }
  return fetched.get(id);
};
voiceClips.then((ids) => ids.forEach(fetchClip));

/** Where the sound starts: generated speech often begins with a little silence. */
function soundStart(buf) {
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.02) return Math.max(0, i / buf.sampleRate - 0.005);
  return 0;
}

const VOL = { big: 1, medium: 0.62, small: 0.26 };

export class Synth {
  #loading = new Map(); // word id → Promise of a decoded clip (or null)
  #clips = new Map(); // word id → { buf, start }, ready to play
  #saying = null; // the clip say() is playing, so the next one cuts it off

  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
  }

  /** Create or wake the audio context. Call from a click or key press. */
  ensure() {
    try {
      if (!this.ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return null;
        const ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.ratio.value = 4;
        const master = ctx.createGain();
        master.gain.value = 0.85;
        master.connect(comp);
        comp.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate * 0.5);
        const noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        Object.assign(this, { ctx, master, noise });
        voiceClips.then(() => clipIds.forEach((id) => this.#load(id))); // already fetched; just decode
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  #load(id) {
    if (this.#clips.has(id)) return Promise.resolve(this.#clips.get(id));
    if (!this.ctx || !clipIds.has(id)) return Promise.resolve(null);
    if (!this.#loading.has(id)) {
      this.#loading.set(id, fetchClip(id)
        .then((bytes) => (bytes ? this.ctx.decodeAudioData(bytes) : null))
        .then((buf) => {
          const clip = buf ? { buf, start: soundStart(buf) } : null;
          if (clip) this.#clips.set(id, clip);
          return clip;
        }));
    }
    return this.#loading.get(id);
  }

  #play(clip, at, out) {
    const src = this.ctx.createBufferSource();
    src.buffer = clip.buf;
    const g = this.ctx.createGain();
    g.gain.value = VOICE_GAIN;
    src.connect(g);
    g.connect(out || this.master);
    src.start(Math.max(at, this.ctx.currentTime), clip.start);
    return src;
  }

  /**
   * Play the recorded clip of word `id` at `at` on the audio clock.
   * Returns false when there is no clip ready (then use speak()).
   */
  voice(id, at, out) {
    const clip = this.ctx && this.#clips.get(id);
    if (!clip) { this.#load(id); return false; }
    this.#play(clip, at, out);
    return true;
  }

  /** Say a word right now: the recorded clip if there is one, else the device voice. */
  async say(id) {
    this.ensure();
    const clip = clipIds.has(id) ? await this.#load(id) : null;
    if (!clip) { speak(id); return; }
    try { this.#saying?.stop(); } catch { /* already ended */ }
    this.#saying = this.#play(clip, this.ctx.currentTime, null);
  }

  /** Seconds on the audio clock (or the page clock without audio). */
  now() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  /** A gain stage that can be silenced at once when playback stops. */
  bus() {
    if (!this.ctx) return null;
    const g = this.ctx.createGain();
    g.connect(this.master);
    return g;
  }

  silence(bus) {
    if (!bus || !this.ctx) return;
    try {
      bus.gain.cancelScheduledValues(this.ctx.currentTime);
      bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.015);
      setTimeout(() => bus.disconnect(), 300);
    } catch { /* already gone */ }
  }

  #env(g, at, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  #tone(out, at, type, f0, f1, sweep, peak, decay) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + sweep);
    const g = this.ctx.createGain();
    this.#env(g, at, peak, 0.004, decay);
    o.connect(g);
    g.connect(out);
    o.start(at);
    o.stop(at + decay + 0.1);
  }

  #burst(out, at, type, freq, q, peak, decay) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.#env(g, at, peak, 0.002, decay);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(at);
    s.stop(at + decay + 0.05);
  }

  /** One drum hit: {where: "center"|"rim", vol, ring, drum}. */
  hit(h, at, out) {
    if (!this.ctx) return;
    const dest = out || this.master;
    const v = VOL[h.vol] ?? 0.8;
    if (h.where === "rim") {
      this.#burst(dest, at, "bandpass", 3000, 1.4, 0.9 * v, 0.045);
      this.#tone(dest, at, "triangle", 1400, 950, 0.03, 0.45 * v, 0.05);
      this.#tone(dest, at, "sine", 2600, 2200, 0.02, 0.15 * v, 0.03);
    } else if (h.drum === "shime") {
      this.#tone(dest, at, "sine", 480, 430, 0.05, 0.8 * v, h.ring === "long" ? 0.32 : 0.14);
      this.#tone(dest, at, "triangle", 960, 900, 0.03, 0.2 * v, 0.08);
      this.#burst(dest, at, "bandpass", 2200, 1.2, 0.5 * v, 0.03);
    } else {
      const decay = h.ring === "long" ? 1.2 : 0.4;
      this.#tone(dest, at, "sine", 125, 58, 0.22, v, decay);
      this.#tone(dest, at, "sine", 210, 105, 0.12, 0.35 * v, decay * 0.45);
      this.#burst(dest, at, "lowpass", 900, 0.7, 0.6 * v, 0.05);
    }
  }

  /** Metronome tick; `accent` marks the first beat of a bar. */
  click(at, accent, out) {
    if (!this.ctx) return;
    const f = accent ? 1760 : 1320;
    this.#tone(out || this.master, at, "sine", f, f, 0.01, accent ? 0.4 : 0.28, 0.035);
  }
}

export const canSpeak = typeof globalThis.speechSynthesis !== "undefined";

// How each shout is written for the speech engine: hiragana with a small っ
// at the end, which good Japanese voices say as a short, clipped call.
const SPOKEN = { sore: "それっ", yoisho: "よいしょっ", ha: "はっ", yo: "よっ", ho: "ほっ", iya: "いやーっ" };

// Ranks Japanese voices: natural-sounding ones first, robotic ones last.
function score(v) {
  const name = v.name || "";
  let s = 0;
  if (/natural|neural|premium|enhanced|siri/i.test(name)) s += 4;
  if (/kyoko|o-ren|otoya|hattori|nanami|keita|aoi|daichi|mayu|naoki|shiori|haruka|ayumi|ichiro|sayaka|google/i.test(name)) s += 2;
  if (v.localService) s += 1; // starts speaking sooner, so shouts land on time
  if (/espeak|festival|mbrola/i.test(name)) s -= 5;
  return s;
}

let voices = [];
let voice = null;
const listeners = new Set();

function loadVoices() {
  try {
    voices = speechSynthesis.getVoices() || [];
    voice = voices.filter((v) => /^ja([-_]|$)/i.test(v.lang)).sort((a, b) => score(b) - score(a))[0] || null;
  } catch {
    voices = [];
    voice = null;
  }
  for (const fn of listeners) fn();
}

// Browsers list their voices a moment after the page loads.
if (canSpeak) {
  loadVoices();
  speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}

/**
 * What the device can say: "japanese" (a Japanese voice is installed),
 * "other" (voices, but no Japanese one), or "unknown" (no list yet).
 * `onChange` is called again when the browser's list arrives or changes.
 */
export function voiceStatus(onChange) {
  if (onChange) listeners.add(onChange);
  if (!canSpeak) return "none";
  if (voice) return "japanese";
  return voices.length ? "other" : "unknown";
}

/** Say a word out loud: with the best Japanese voice on the device, if any. */
export function speak(id) {
  try {
    if (!canSpeak) return;
    const w = WORDS[id];
    if (!voices.length) loadVoices();
    const u = new SpeechSynthesisUtterance();
    if (voice || !voices.length) {
      // With no voice list yet, asking for Japanese still works on many devices.
      u.text = SPOKEN[id] || w.kana;
      u.lang = voice?.lang || "ja-JP";
      if (voice) u.voice = voice;
    } else {
      u.text = w.ro.replace(/!/g, ""); // no Japanese voice: the romaji read aloud is closer than kana
    }
    const shout = w.group === "shout";
    u.rate = shout ? 1.1 : 1;
    u.pitch = shout ? 1.15 : 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* speech is optional */ }
}
