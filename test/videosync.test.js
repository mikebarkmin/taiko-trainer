import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { VideoSync } from "../src/videosync.js";

function fakes() {
  const synth = {
    clock: 100, hits: [], silenced: 0,
    now() { return this.clock; }, bus: () => ({}), silence() { synth.silenced++; },
    hit(h, at) { synth.hits.push(+(at - 100).toFixed(3)); },
  };
  const media = {
    time: 0, paused: true, ended: false, rate: 1, seeks: [],
    seek(t) { this.time = t; this.seeks.push(t); }, play() { this.paused = false; return Promise.resolve(); },
  };
  // advance real time by `s` seconds; video time moves at `rate` while playing
  const run = (s) => {
    for (let i = 0; i < Math.round(s / 0.025); i++) {
      synth.clock += 0.025;
      if (!media.paused) media.time += 0.025 * media.rate;
      mock.timers.tick(25);
    }
  };
  return { synth, media, run };
}

const strikes = [
  { t: 1, hand: "R", where: "center", vol: "big" },
  { t: 1.5, hand: "L", where: "rim", vol: "big" },
  { t: 2, shout: "sore" },
  { t: 3, hand: "R", where: "center", vol: "small" },
];
const yes = () => true;
const no = () => false;

test("fires strikes on time while the video plays", () => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  try {
    const { synth, media, run } = fakes();
    const seen = [];
    const sync = new VideoSync(synth);
    sync.attach(media, strikes, { guide: yes, loop: no, range: () => null }, { onStrike: (s) => seen.push(s.t), onShout: () => seen.push("shout") });
    run(0.5); // paused: nothing
    assert.equal(synth.hits.length, 0);
    media.paused = false; // starts playing at real time 100.5
    run(3.2);
    // sound times (real clock) ≈ 0.5 + strike time; within one tick of accuracy
    assert.deepEqual(synth.hits.map((t) => Math.round((t - 0.5) * 20) / 20), [1, 1.5, 3]);
    assert.deepEqual(seen, [1, 1.5, "shout", 2, 3]);
    sync.detach();
  } finally { mock.timers.reset(); }
});

test("half speed stretches the timing; guide off makes no sound", () => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  try {
    const { synth, media, run } = fakes();
    media.rate = 0.5;
    media.paused = false;
    let guide = false;
    const seen = [];
    const sync = new VideoSync(synth);
    sync.attach(media, strikes, { guide: () => guide, loop: no, range: () => null }, { onStrike: (s) => seen.push(+synth.clock.toFixed(2)) });
    run(2.6);
    assert.equal(synth.hits.length, 0);
    assert.ok(Math.abs(seen[0] - 102) < 0.06, `strike at video 1 s plays after 2 s (${seen[0]})`);
    guide = true;
    run(4);
    assert.equal(synth.hits.length, 2, "the strikes at 1.5 s and 3 s come after the guide was switched on");
    sync.detach();
  } finally { mock.timers.reset(); }
});

test("seeking back replays strikes; a practice range loops", () => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  try {
    const { synth, media, run } = fakes();
    media.paused = false;
    const seen = [];
    let loops = 0;
    let range = null;
    const sync = new VideoSync(synth);
    sync.attach(media, strikes, { guide: yes, loop: yes, range: () => range }, { onStrike: (s) => seen.push(s.t), onLoop: () => loops++ });
    run(1.7);
    media.seek(0.9); // jump back
    run(0.4);
    assert.deepEqual(seen.filter((t) => t === 1).length, 2, "the strike at 1 s played again after seeking back");
    range = { start: 1.4, end: 1.8 };
    run(1.5);
    assert.ok(loops >= 2, `looped the range (${loops})`);
    assert.ok(media.seeks.filter((t) => t === 1.4).length >= 2);
    sync.detach();
  } finally { mock.timers.reset(); }
});
