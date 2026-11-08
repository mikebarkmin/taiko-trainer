// Play a real drum: the microphone listens, and every hit is found the
// moment it happens (in an audio worklet, timed on the audio clock).
// Each hit is classed as skin or rim by how bright it sounds, once the
// player has taught the app their drum (a few skin hits, a few rim hits).
// Hands cannot be heard, so they alternate R, L, R … within a run.

import { brightThreshold } from "./core/edit.js";

// The worklet: watches the loudness in 128-sample blocks; a sudden jump
// (4× the loudest of the last few blocks, ~10 ms, and over a floor set by
// the sensitivity) is a hit — also while the previous hit still rings. The next ~20 ms of sound tell how bright the hit is: the energy of
// the sample-to-sample differences against the energy of the signal
// (a deep skin hit is low, a sharp rim click high).
const WORKLET = `
class HitDetector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recent = [0, 0, 0, 0]; this.hold = 0; this.cap = null; this.peak = 0; this.blocks = 0;
    this.floor = 1e-4;
    this.port.onmessage = (e) => { if (e.data.floor) this.floor = e.data.floor; };
  }
  process(inputs) {
    const x = inputs[0] && inputs[0][0];
    if (!x) return true;
    let e = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i] * x[i]; e += v; if (v > this.peak) this.peak = v; }
    e /= x.length;
    if (this.cap) this.collect(x, 0);
    if (this.hold > 0) this.hold--;
    else if (e > this.floor && e > Math.max(...this.recent) * 4) {
      const thr = Math.max(this.floor, Math.max(...this.recent) * 4);
      let i = 0;
      while (i < x.length - 1 && x[i] * x[i] < thr) i++;
      this.hold = Math.ceil(0.07 * sampleRate / x.length); // ~70 ms: one hit, not its ring
      this.cap = { t: currentTime + i / sampleRate, buf: new Float32Array(Math.round(sampleRate * 0.02)), n: 0, level: 0 };
      this.collect(x, i);
    }
    this.recent.shift();
    this.recent.push(e);
    if (++this.blocks % 8 === 0) { this.port.postMessage({ level: Math.sqrt(this.peak) }); this.peak = 0; }
    return true;
  }
  collect(x, from) {
    const c = this.cap;
    for (let i = from; i < x.length && c.n < c.buf.length; i++) {
      c.buf[c.n++] = x[i];
      if (Math.abs(x[i]) > c.level) c.level = Math.abs(x[i]);
    }
    if (c.n < c.buf.length) return;
    let s = 0, d = 0;
    for (let i = 1; i < c.n; i++) { s += c.buf[i] * c.buf[i]; const v = c.buf[i] - c.buf[i - 1]; d += v * v; }
    this.port.postMessage({ hit: c.t, bright: s ? d / s : 0, level: c.level });
    this.cap = null;
  }
}
registerProcessor("hit-detector", HitDetector);
`;

const RUN_GAP = 1.0; // seconds of quiet after which the hands start again with R

export class MicDrum {
  #synth;
  #settings;
  #save;
  #stream = null;
  #node = null;
  #listeners = { hit: new Set(), level: new Set(), state: new Set() };
  #lastHit = -Infinity;
  #hand = "L";
  #capture = null; // a function that gets the raw hits instead (teaching, measuring)

  constructor(synth, settings, save) {
    this.#synth = synth;
    this.#settings = settings;
    this.#save = save;
    this.error = "";
  }

  get on() { return !!this.#node; }
  /** Rim detection is taught (otherwise every hit counts as skin). */
  get knowsRim() { return this.#settings.micRim > 0; }

  /** listen("hit" | "level" | "state", fn); returns an unsubscribe function. */
  listen(kind, fn) {
    this.#listeners[kind].add(fn);
    return () => this.#listeners[kind].delete(fn);
  }

  #emit(kind, value) {
    for (const fn of this.#listeners[kind]) fn(value);
  }

  /** Ask for the microphone and start listening. Call from a click. */
  async start() {
    if (this.#node) return true;
    this.error = "";
    try {
      this.#synth.ensure();
      const ctx = this.#synth.ctx;
      if (!ctx?.audioWorklet || !navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      this.#stream = await navigator.mediaDevices.getUserMedia({
        // raw sound: voice processing would swallow the attack of a hit
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const src = ctx.createMediaStreamSource(this.#stream);
      const node = new AudioWorkletNode(ctx, "hit-detector");
      const mute = ctx.createGain();
      mute.gain.value = 0; // keeps the worklet running without making it audible
      src.connect(node);
      node.connect(mute);
      mute.connect(ctx.destination);
      node.port.onmessage = (e) => this.#message(e.data);
      this.#node = node;
      this.setSensitivity(this.#settings.micSens);
    } catch (err) {
      this.stop();
      this.error = err?.name === "NotAllowedError" ? "denied" : err?.message === "unsupported" ? "unsupported" : "failed";
    }
    this.#emit("state", this.on);
    return this.on;
  }

  stop() {
    this.#stream?.getTracks().forEach((tr) => tr.stop());
    this.#stream = null;
    if (this.#node) {
      this.#node.port.onmessage = null;
      this.#node.disconnect();
      this.#node = null;
    }
    this.#capture = null;
    this.#emit("state", false);
  }

  /** 0…100: higher hears softer hits (and more noise). */
  setSensitivity(v) {
    this.#settings.micSens = v;
    this.#node?.port.postMessage({ floor: 10 ** (-1.5 - (v / 100) * 3.5) });
  }

  /** Route raw hits ({ t, bright, level }) to `fn` until it is cleared with null. */
  capture(fn) {
    this.#capture = fn;
  }

  #message(d) {
    if (d.level !== undefined && d.hit === undefined) { this.#emit("level", d.level); return; }
    if (d.hit === undefined) return;
    if (this.#capture) { this.#capture({ t: d.hit, bright: d.bright, level: d.level }); return; }
    const where = this.knowsRim && d.bright > this.#settings.micRim ? "rim" : "center";
    this.#hand = d.hit - this.#lastHit > RUN_GAP ? "R" : this.#hand === "R" ? "L" : "R";
    this.#lastHit = d.hit;
    this.#emit("hit", {
      hand: this.#hand,
      where,
      known: this.knowsRim, // false: skin and rim were not told apart
      level: d.level,
      // how long ago the drum was really hit (the mic and the browser add a delay)
      ago: Math.max(0, this.#synth.now() - d.hit + this.#settings.micDelay / 1000),
    });
  }

  /** Store what skin and rim sound like (bright values of a few hits each); false if they are too alike. */
  learn(skin, rim) {
    const thr = brightThreshold(skin, rim);
    if (!thr) return false;
    this.#settings.micRim = thr;
    this.#save();
    return true;
  }

  forgetRim() {
    this.#settings.micRim = 0;
    this.#save();
  }
}
