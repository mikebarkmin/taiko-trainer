// Plays a resolved pattern or song in time. Sounds are scheduled a little
// ahead on the audio clock; visual callbacks fire when each sound plays.

import { chunk, nextPos, clampBpm } from "./core/timeline.js";

const LOOKAHEAD = 0.15; // seconds of audio scheduled ahead
const TICK_MS = 25;
const STICK_LEAD = 0.09; // start the stick animation this early so it lands on the sound

export class Player {
  /**
   * @param synth  a Synth (or anything with ensure/now/bus/silence/hit/click)
   */
  constructor(synth) {
    this.synth = synth;
    this.playing = false;
    this.timers = new Set();
    this.h = {};
  }

  #later(fn, at) {
    const ms = Math.max(0, (at - this.synth.now()) * 1000);
    const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
  }

  /**
   * Start playing. `opts` are read live, so changes apply while playing:
   *   factor(): tempo factor, picked up at the next repetition
   *   loop(), guide(), click(), speak(): booleans (speak: recorded shouts)
   *   countIn: boolean, read once at the start
   * `handlers`: onCount(n), onBeat(ev), onToken(ev), onHit(ev),
   *   onShout(ev), onStop()
   */
  start(resolved, opts, handlers = {}) {
    this.stop();
    if (!resolved.sections.length) return false;
    this.synth.ensure();
    this.h = handlers;
    this.resolved = resolved;
    this.opts = opts;
    this.out = this.synth.bus();

    let start = this.synth.now() + 0.12;
    if (opts.countIn) {
      const spb = 60 / clampBpm(resolved.sections[0].bpm * opts.factor());
      for (let k = 0; k < 4; k++) {
        const at = start + k * spb;
        this.synth.click(at, k === 0, this.out);
        this.#later(() => this.h.onCount?.(k + 1), at);
      }
      start += 4 * spb;
    }

    this.pos = { si: 0, rep: 0 };
    this.chunkStart = start;
    this.cur = chunk(resolved.sections[0], 0, 0, opts.factor());
    this.qi = 0;
    this.playing = true;
    this.timer = setInterval(() => this.#pump(), TICK_MS);
    this.#pump();
    return true;
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.synth.silence(this.out);
    const h = this.h;
    this.h = {};
    h.onStop?.();
  }

  #pump() {
    if (!this.playing) return;
    const now = this.synth.now();
    const horizon = now + LOOKAHEAD;
    for (let guard = 0; this.playing && guard < 5000; guard++) {
      if (this.qi >= this.cur.events.length) {
        const end = this.chunkStart + this.cur.duration;
        let next = nextPos(this.resolved, this.pos);
        if (!next && this.opts.loop()) next = { si: 0, rep: 0 };
        if (!next) {
          if (now >= end) this.stop();
          return;
        }
        this.pos = next;
        this.chunkStart = end;
        this.cur = chunk(this.resolved.sections[next.si], next.si, next.rep, this.opts.factor());
        this.qi = 0;
        continue;
      }
      const ev = this.cur.events[this.qi];
      const at = this.chunkStart + ev.t;
      if (at > horizon) break;
      this.#fire(ev, at);
      this.qi++;
    }
  }

  #fire(ev, at) {
    switch (ev.type) {
      case "hit":
        if (this.opts.guide()) this.synth.hit(ev, at, this.out);
        this.#later(() => this.h.onHit?.(ev), at - STICK_LEAD);
        break;
      case "beat":
        if (this.opts.click()) this.synth.click(at, ev.accent, this.out);
        this.#later(() => this.h.onBeat?.(ev), at);
        break;
      case "token":
        this.#later(() => this.h.onToken?.(ev), at);
        break;
      case "shout": {
        // A recorded shout is scheduled on the beat; `voiced` tells the
        // screen it doesn't need the device voice.
        const voiced = !!this.opts.speak?.() && this.synth.voice(ev.id, at, this.out);
        this.#later(() => this.h.onShout?.({ ...ev, voiced }), at);
        break;
      }
    }
  }
}
