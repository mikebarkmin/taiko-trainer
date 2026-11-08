import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tapTempo, tapDelay, judge, brightThreshold, snapChosen, snapToOnsets, nearest, makeClip, placeClip, duplicateAt, clearPassed,
} from "../src/core/edit.js";
import { envelope, onsets, ENV_RATE } from "../src/core/onsets.js";

const S = (t, extra = {}) => ({ t, hand: "R", where: "center", vol: "big", ...extra });

test("tap tempo fits a line through the taps", () => {
  const taps = [2, 2.5, 3.02, 3.49, 4.0, 4.51, 5.0];
  const r = tapTempo(taps);
  assert.equal(r.bpm, 120);
  assert.ok(Math.abs(r.start - 2) < 0.01);
  assert.equal(tapTempo([1, 2, 3]), null);
  assert.equal(tapTempo([1, 1, 1, 1]), null);
});

test("tap delay is the median offset after the warm-up", () => {
  const clicks = Array.from({ length: 16 }, (_, i) => 1 + i * 0.5);
  const taps = clicks.map((c, i) => c + 0.06 + (i % 2 ? 0.01 : -0.01));
  taps.push(9.2); // a stray tap between clicks, ignored
  assert.ok(Math.abs(tapDelay(clicks, taps) - 0.06) < 0.011);
  assert.equal(tapDelay(clicks, taps.slice(0, 7)), null); // only 3 after the warm-up
});

test("snapping moves only the chosen strikes", () => {
  const a = S(1.02), b = S(1.27), c = S(2.11);
  const { strikes, changed } = snapChosen([a, b, c], new Set([a, b]), { start: 0, bpm: 120 });
  assert.deepEqual(strikes.map((s) => s.t), [1, 1.25, 2.11]);
  assert.equal(changed.length, 2);
  assert.ok(strikes.includes(c));
});

test("snapping to the audio needs a hit within reach", () => {
  const a = S(1.03), b = S(2.5);
  const r = snapToOnsets([a, b], new Set([a, b]), [0.5, 1.0, 2.8]);
  assert.deepEqual(r.strikes.map((s) => s.t), [1, 2.5]);
  assert.equal(r.moved, 1);
  assert.equal(nearest([], 1), null);
  assert.equal(nearest([1, 2], 1.6), 2);
});

test("clips paste and duplicate in time", () => {
  const clip = makeClip([S(3.5), S(3), S(4, { hand: "L" })]);
  assert.equal(clip.span, 1);
  assert.deepEqual(placeClip(clip, 10).map((s) => s.t), [10, 10.5, 11]);
  assert.equal(duplicateAt(clip, 3, null), 4.5); // one typical spacing after the end
  assert.equal(duplicateAt(clip, 3, { start: 0, bpm: 120 }), 5); // next whole bar (2 s)
});

test("re-recording clears what the playhead passed, except new taps", () => {
  const old1 = S(1), old2 = S(1.5), fresh = S(1.4), later = S(3);
  const list = [old1, fresh, old2, later];
  assert.deepEqual(clearPassed(list, 0.9, 2, new Set([fresh])), [fresh, later]);
  assert.equal(clearPassed(list, 2, 2.5, new Set()), list);
});

test("onset times do not drift when 10 ms is not a whole number of samples", () => {
  const rate = 11025;
  const samples = new Float32Array(rate * 30);
  for (const at of [1, 25]) {
    const start = Math.round(at * rate);
    for (let j = 0; j < rate * 0.1; j++) samples[start + j] = Math.sin(j / 3) * Math.exp(-j / (rate * 0.03));
  }
  const found = onsets(envelope(samples, rate));
  assert.equal(found.length, 2);
  assert.ok(Math.abs(found[1] - 25) <= 0.011, `${found[1]} ≈ 25`);
});

test("onsets are found where a drum hit starts", () => {
  const rate = 8000;
  const samples = new Float32Array(rate * 3);
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() - 0.5) * 0.002; // quiet noise
  for (const at of [0.5, 1.0, 1.25, 2.2]) {
    const start = Math.round(at * rate);
    for (let j = 0; j < rate * 0.15; j++) samples[start + j] += Math.sin(j / 4) * Math.exp(-j / (rate * 0.03));
  }
  const env = envelope(samples, rate);
  assert.equal(env.length, 3 * ENV_RATE);
  const found = onsets(env);
  assert.equal(found.length, 4);
  for (const [i, at] of [0.5, 1.0, 1.25, 2.2].entries()) assert.ok(Math.abs(found[i] - at) <= 0.011, `${found[i]} ≈ ${at}`);
});

test("taps are judged by how far they are from the strike", () => {
  assert.deepEqual(judge(0.02), { kind: "perfect", ms: 20 });
  assert.deepEqual(judge(-0.07), { kind: "early", ms: -70 });
  assert.deepEqual(judge(0.09), { kind: "late", ms: 90 });
  assert.equal(judge(-0.2).kind, "earlyMiss");
  assert.equal(judge(0.25).kind, "lateMiss");
});

test("rim and skin are told apart by brightness, if they differ enough", () => {
  assert.ok(Math.abs(brightThreshold([0.01, 0.012, 0.011, 0.02], [0.2, 0.25, 0.18, 0.22]) - Math.sqrt(0.0115 * 0.21)) < 1e-9);
  assert.equal(brightThreshold([0.1, 0.11], [0.12, 0.1]), null); // too alike
  assert.equal(brightThreshold([0.1], [0.5]), null); // too few
});
