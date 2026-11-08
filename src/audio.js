// Drum sounds made with the Web Audio API (no sound files needed).

import { WORDS } from "./core/words.js";

const VOL = { big: 1, medium: 0.62, small: 0.26 };

export class Synth {
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
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
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

/** Say a word out loud with the device's voice (Japanese if installed). */
export function speak(id) {
  try {
    if (!canSpeak) return;
    const w = WORDS[id];
    const voices = speechSynthesis.getVoices() || [];
    const ja = voices.find((v) => /^ja/i.test(v.lang));
    const u = new SpeechSynthesisUtterance(ja ? w.kana : w.ro.replace(/!/g, ""));
    if (ja) { u.voice = ja; u.lang = ja.lang; }
    u.rate = 1.15;
    u.pitch = 1.1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* speech is optional */ }
}
