// Follows a playing video and fires each strike when the video reaches it:
// the guide drum sound is scheduled slightly ahead on the audio clock, and
// visual callbacks fire when the strike is due. Works at any video speed,
// and after seeking or pausing.

import { lowerBound, strikeHit } from "./core/lessons.js";

const LOOKAHEAD = 0.12; // seconds of video time scheduled ahead
const TICK_MS = 25;
const STICK_LEAD = 0.09;

export class VideoSync {
  constructor(synth) {
    this.synth = synth;
    this.timers = new Set();
    this.media = null;
    this.strikes = [];
    this.h = {};
    this.opts = {};
  }

  /**
   * opts (read live): guide(), loop(), range() → {start, end} | null
   * handlers: onHit(strike), onShout(strike), onStrike(strike, index), onLoop()
   */
  attach(media, strikes, opts, handlers) {
    this.detach();
    this.media = media;
    this.strikes = strikes;
    this.opts = opts;
    this.h = handlers;
    this.idx = -1;
    this.last = null;
    this.wasPlaying = false;
    this.out = this.synth.bus();
    this.iv = setInterval(() => this.tick(), TICK_MS);
  }

  /** New strike list (e.g. while editing). */
  setStrikes(strikes) {
    this.strikes = strikes;
    this.idx = -1;
  }

  detach() {
    clearInterval(this.iv);
    this.#cancel();
    this.media = null;
  }

  #cancel() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    if (this.out) {
      this.synth.silence(this.out);
      this.out = this.synth.bus();
    }
  }

  #later(fn, delay) {
    const id = setTimeout(() => { this.timers.delete(id); fn(); }, Math.max(0, delay * 1000));
    this.timers.add(id);
  }

  tick() {
    const m = this.media;
    if (!m) return;
    const vt = m.time;
    const loop = this.opts.loop?.();
    const range = this.opts.range?.();

    if (loop && !m.paused && range && vt >= range.end) {
      this.#cancel();
      m.seek(range.start);
      this.idx = -1;
      this.last = null;
      this.h.onLoop?.();
      return;
    }
    if (loop && !range && m.ended) {
      m.seek(0);
      m.play()?.catch?.(() => {});
      this.idx = -1;
      this.h.onLoop?.();
      return;
    }
    if (m.paused || m.waiting) {
      if (this.wasPlaying) this.#cancel();
      this.wasPlaying = false;
      this.last = vt;
      return;
    }

    const jumped = this.last === null || vt < this.last - 0.05 || vt > this.last + 0.75;
    if (!this.wasPlaying || this.idx < 0 || jumped) {
      if (jumped && this.wasPlaying) this.#cancel();
      this.idx = lowerBound(this.strikes, vt - 0.005);
    }
    this.wasPlaying = true;

    const rate = m.rate || 1;
    const horizon = vt + LOOKAHEAD * rate;
    const now = this.synth.now();
    while (this.idx < this.strikes.length && this.strikes[this.idx].t <= horizon) {
      const i = this.idx++;
      const s = this.strikes[i];
      const delay = Math.max(0, (s.t - vt) / rate);
      if (s.shout) {
        this.#later(() => { this.h.onShout?.(s); this.h.onStrike?.(s, i); }, delay);
      } else {
        if (this.opts.guide?.()) this.synth.hit(strikeHit(s), now + delay, this.out);
        this.#later(() => this.h.onHit?.(s), delay - STICK_LEAD);
        this.#later(() => this.h.onStrike?.(s, i), delay);
      }
    }
    this.last = vt;
  }
}
