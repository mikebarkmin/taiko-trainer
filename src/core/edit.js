// Editing helpers for the strike editor: tap tempo, tap-delay calibration,
// snapping, copy & paste. Pure functions on strike lists (sorted by time).

import { snapToGrid } from "./lessons.js";

const round3 = (t) => Math.round(t * 1000) / 1000;
const byTime = (a, b) => a.t - b.t;
export const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Bar start and tempo from taps on the beat (video times, oldest first;
 * the first tap is beat 1 of a bar). A straight line through the taps,
 * so single early or late taps hardly matter. null for fewer than 4 taps
 * or a tempo outside 20–300 bpm.
 */
export function tapTempo(times) {
  const n = times.length;
  if (n < 4) return null;
  const mx = (n - 1) / 2;
  const my = times.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  times.forEach((t, i) => { sxy += (i - mx) * (t - my); sxx += (i - mx) ** 2; });
  const spb = sxy / sxx;
  if (!(spb > 0)) return null;
  const bpm = Math.round(60 / spb);
  if (bpm < 20 || bpm > 300) return null;
  return { start: round3(Math.max(0, my - mx * spb)), bpm };
}

/**
 * The typical delay between a click and the tap for it, in seconds: each
 * tap is matched to the nearest click (taps further than half the click
 * spacing away are ignored), the first `skip` clicks are a warm-up.
 * null with fewer than 6 matched taps.
 */
export function tapDelay(clicks, taps, skip = 4) {
  if (clicks.length < 2) return null;
  const gap = clicks[1] - clicks[0];
  const counted = clicks.slice(skip);
  const diffs = [];
  for (const tap of taps) {
    let best = null;
    for (const c of counted) if (best === null || Math.abs(tap - c) < Math.abs(tap - best)) best = c;
    if (best !== null && Math.abs(tap - best) < gap / 2) diffs.push(tap - best);
  }
  return diffs.length >= 6 ? median(diffs) : null;
}

/** Replace the strikes in `chosen` (a Set) by `fn(strike)`; returns { strikes, changed } (changed: the new objects). */
export function mapStrikes(strikes, chosen, fn) {
  const changed = [];
  const out = strikes.map((s) => {
    if (!chosen.has(s)) return s;
    const u = fn(s);
    changed.push(u);
    return u;
  });
  return { strikes: out.sort(byTime), changed };
}

/** Snap the chosen strikes onto the nearest half-beat of the grid. */
export function snapChosen(strikes, chosen, grid) {
  return mapStrikes(strikes, chosen, (s) => ({ ...s, t: round3(snapToGrid(grid, s.t)) }));
}

/**
 * Snap the chosen strikes onto the nearest drum hit heard in the audio
 * (`onsets`, sorted times), when one lies within `reach` seconds.
 */
export function snapToOnsets(strikes, chosen, onsets, reach = 0.1) {
  let moved = 0;
  const res = mapStrikes(strikes, chosen, (s) => {
    const o = nearest(onsets, s.t);
    if (o === null || Math.abs(o - s.t) > reach) return s;
    if (o !== s.t) moved++;
    return { ...s, t: round3(o) };
  });
  return { ...res, moved };
}

/** The value in sorted `list` nearest to `t`, or null. */
export function nearest(list, t) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const a = list[lo - 1];
  const b = list[lo];
  if (a === undefined) return b ?? null;
  if (b === undefined) return a;
  return t - a <= b - t ? a : b;
}

/** Copy strikes as a clip: times relative to the first one. */
export function makeClip(list) {
  const sorted = list.slice().sort(byTime);
  if (!sorted.length) return null;
  const t0 = sorted[0].t;
  return { strikes: sorted.map((s) => ({ ...s, t: round3(s.t - t0) })), span: round3(sorted.at(-1).t - t0) };
}

/** A clip's strikes placed so its first one is at `at`. */
export function placeClip(clip, at) {
  return clip.strikes.map((s) => ({ ...s, t: round3(at + s.t) }));
}

/**
 * Where a duplicate of `clip` (copied from a run starting at `start`) goes:
 * with a grid, the next whole bar after the clip ends; without one, one
 * typical strike spacing after its last strike.
 */
export function duplicateAt(clip, start, grid) {
  if (grid) {
    const bar = (60 / grid.bpm) * 4;
    const bars = Math.max(1, Math.ceil((clip.span + 1e-3) / bar));
    return round3(start + bars * bar);
  }
  const ts = clip.strikes.map((s) => s.t);
  const gaps = ts.slice(1).map((t, i) => t - ts[i]).filter((g) => g > 0.001);
  const step = gaps.length ? median(gaps) : 0.5;
  return round3(start + clip.span + step);
}

/**
 * Re-recording: drop strikes the playhead passes over (from `a` to `b`
 * seconds), except those in `keep` (the new taps). Returns the same list
 * when nothing goes.
 */
export function clearPassed(strikes, a, b, keep) {
  if (!(b > a)) return strikes;
  const out = strikes.filter((s) => s.t <= a || s.t > b || keep.has(s));
  return out.length === strikes.length ? strikes : out;
}

export const PERFECT = 0.045; // seconds: a tap this close to its strike is "perfect"
export const GOOD = 0.1; // … this close "early" / "late"; further away a miss

/** Timing verdict for a tap `dt` seconds (real time) after its strike: { kind, ms }. */
export function judge(dt) {
  const ms = Math.round(dt * 1000);
  const a = Math.abs(dt);
  if (a <= PERFECT) return { kind: "perfect", ms };
  if (a <= GOOD) return { kind: dt < 0 ? "early" : "late", ms };
  return { kind: dt < 0 ? "earlyMiss" : "lateMiss", ms };
}

/**
 * The brightness that separates skin hits from rim hits, from a few of
 * each (see mic.js): halfway between their medians on a log scale. null
 * when the rim does not sound clearly brighter than the skin.
 */
export function brightThreshold(skin, rim) {
  if (skin.length < 2 || rim.length < 2) return null;
  const a = median(skin);
  const b = median(rim);
  if (!(a > 0) || !(b > a * 1.5)) return null;
  return Math.sqrt(a * b);
}
