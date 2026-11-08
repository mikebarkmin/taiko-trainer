import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, chunk, nextPos, duration, swingPos, totalBeats, fmtTime } from "../src/core/timeline.js";
import { makeLibrary } from "../src/core/library.js";

const pattern = (words, extra = {}) => ({ id: "p1", name: "Test", words, bpm: 120, swing: false, drum: "nagado", notes: "", ...extra });
const near = (a, b) => Math.abs(a - b) < 1e-9;

test("a pattern resolves to one section", () => {
  const r = resolve("pattern", pattern("Don Doko"), null);
  assert.equal(r.sections.length, 1);
  assert.equal(r.sections[0].beats, 2);
  assert.deepEqual(r.problems, []);
});

test("hits land on the right times", () => {
  const r = resolve("pattern", pattern("Don Doko Ka"), null);
  const c = chunk(r.sections[0], 0, 0, 1); // 120 bpm = 0.5 s per beat
  const hits = c.events.filter((e) => e.type === "hit");
  assert.deepEqual(hits.map((h) => h.t), [0, 0.5, 0.75, 1]);
  assert.deepEqual(hits.map((h) => h.hand + h.where), ["Rcenter", "Rcenter", "Lcenter", "Rrim"]);
  assert.ok(near(c.duration, 1.5));
  assert.deepEqual(c.events.filter((e) => e.type === "beat").map((e) => e.t), [0, 0.5, 1]);
});

test("the tempo factor scales time", () => {
  const r = resolve("pattern", pattern("Don Don"), null);
  const c = chunk(r.sections[0], 0, 0, 0.5); // 60 bpm
  assert.ok(near(c.duration, 2));
  assert.equal(c.bpm, 60);
});

test("swing moves off-beats to two thirds of the beat", () => {
  assert.equal(swingPos(1, true), 1);
  assert.ok(near(swingPos(1.5, true), 1 + 2 / 3));
  assert.equal(swingPos(1.5, false), 1.5);
  const r = resolve("pattern", pattern("Do Ko Do Ko", { swing: true, bpm: 60 }), null);
  const hits = chunk(r.sections[0], 0, 0, 1).events.filter((e) => e.type === "hit").map((e) => e.t);
  assert.ok(near(hits[1], 2 / 3) && near(hits[3], 1 + 2 / 3));
});

test("small-drum patterns play every skin hit on the small drum", () => {
  const r = resolve("pattern", pattern("Don Tsuku Ka", { drum: "shime" }), null);
  const hits = chunk(r.sections[0], 0, 0, 1).events.filter((e) => e.type === "hit");
  assert.ok(hits.every((h) => h.drum === "shime"));
  const big = resolve("pattern", pattern("Don Ten"), null);
  assert.deepEqual(chunk(big.sections[0], 0, 0, 1).events.filter((e) => e.type === "hit").map((h) => h.drum), ["nagado", "shime"]);
});

test("shouts become shout events", () => {
  const r = resolve("pattern", pattern("Don Sore!"), null);
  const shouts = chunk(r.sections[0], 0, 0, 1).events.filter((e) => e.type === "shout");
  assert.equal(shouts.length, 1);
  assert.equal(shouts[0].id, "sore");
});

test("empty and misspelled patterns are reported", () => {
  assert.equal(resolve("pattern", pattern(""), null).sections.length, 0);
  const r = resolve("pattern", pattern("Don Dun"), null);
  assert.equal(r.sections.length, 1);
  assert.match(r.problems[0], /dun/);
});

test("a song walks through sections and repeats, then stops", () => {
  const lib = makeLibrary({ patterns: [pattern("Don Don Don Don")], songs: [] });
  const song = { id: "s1", name: "S", bpm: 100, sections: [
    { patternId: "p1", repeats: 2, bpm: null },
    { patternId: "missing", repeats: 3, bpm: null },
    { patternId: "b-don-doko", repeats: 1, bpm: 50 },
  ], notes: "" };
  const r = resolve("song", song, lib);
  assert.equal(r.sections.length, 2);
  assert.equal(r.problems.length, 1);
  assert.equal(r.sections[0].bpm, 100);
  assert.equal(r.sections[1].bpm, 50);

  const seen = [];
  let pos = { si: 0, rep: 0 };
  while (pos) { seen.push(`${pos.si}.${pos.rep}`); pos = nextPos(r, pos); }
  assert.deepEqual(seen, ["0.0", "0.1", "1.0"]);

  // 2 × 4 beats at 100 bpm + 4 beats at 50 bpm = 4.8 s + 4.8 s
  assert.ok(near(duration(r, 1), 9.6));
  assert.ok(near(duration(r, 0.5), 19.2));
  assert.equal(totalBeats(r), 12);
  assert.equal(fmtTime(135.4), "2:15");
});
