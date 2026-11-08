import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Player } from "../src/player.js";
import { resolve } from "../src/core/timeline.js";

function fakeSynth() {
  const s = { clock: 10, hits: [], clicks: [], silenced: 0 };
  Object.assign(s, {
    ensure() {}, now: () => s.clock, bus: () => ({}), silence() { s.silenced++; },
    hit(h, at) { s.hits.push({ at: +(at - 10).toFixed(4), where: h.where }); },
    click(at, accent) { s.clicks.push({ at: +(at - 10).toFixed(4), accent }); },
  });
  return s;
}

function run(synth, seconds) {
  for (let i = 0; i < seconds * 40; i++) { synth.clock += 0.025; mock.timers.tick(25); }
}

const pattern = { id: "p", name: "T", words: "Don Doko Ka", bpm: 120, swing: false, drum: "nagado", notes: "" };
const on = () => true;
const off = () => false;

test("plays a pattern once on time, then stops", () => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  try {
    const synth = fakeSynth();
    const player = new Player(synth);
    const tokens = [];
    let stopped = 0;
    player.start(resolve("pattern", pattern, null),
      { factor: () => 1, loop: off, guide: on, click: on, countIn: false },
      { onToken: (e) => tokens.push(e.id), onStop: () => stopped++ });
    run(synth, 3);
    assert.deepEqual(synth.hits.map((h) => h.at), [0.12, 0.62, 0.87, 1.12]);
    assert.deepEqual(synth.clicks.map((c) => c.at), [0.12, 0.62, 1.12]);
    assert.deepEqual(tokens, ["don", "doko", "ka"]);
    assert.equal(stopped, 1);
    assert.equal(player.playing, false);
  } finally {
    mock.timers.reset();
  }
});

test("count-in, looping and live tempo changes", () => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  try {
    const synth = fakeSynth();
    const player = new Player(synth);
    let factor = 1;
    const counts = [];
    player.start(resolve("pattern", { ...pattern, words: "Don Don" }, null),
      { factor: () => factor, loop: on, guide: on, click: off, countIn: true },
      { onCount: (n) => counts.push(n) });
    run(synth, 2.1); // count-in 4 × 0.5 s, first round starts at 2.12
    assert.deepEqual(counts, [1, 2, 3, 4]);
    factor = 0.5; // 60 bpm from the next round on
    run(synth, 4);
    player.stop();
    const at = synth.hits.map((h) => h.at);
    assert.deepEqual(at.slice(0, 4), [2.12, 2.62, 3.12, 4.12]);
    assert.ok(synth.silenced >= 1);
  } finally {
    mock.timers.reset();
  }
});

test("guide off means no drum sounds, but visuals still fire", () => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  try {
    const synth = fakeSynth();
    const player = new Player(synth);
    let seen = 0;
    player.start(resolve("pattern", pattern, null),
      { factor: () => 1, loop: off, guide: off, click: off, countIn: false },
      { onHit: () => seen++ });
    run(synth, 3);
    assert.equal(synth.hits.length, 0);
    assert.equal(seen, 4);
  } finally {
    mock.timers.reset();
  }
});
