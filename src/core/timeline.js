// Turns a pattern or song into timed events the player can schedule.
// Pure module: no DOM, no audio.

import { WORDS, PARTS, parseWords, beatsOf } from "./words.js";
import { t, quote } from "../i18n.js";

export const MIN_BPM = 30;
export const MAX_BPM = 240;

export function clampBpm(bpm) {
  return Math.min(300, Math.max(20, bpm));
}

/** Parse a pattern's words. */
export function compile(pattern) {
  const { ids, unknown } = parseWords(pattern ? pattern.words : "");
  return { ids, unknown, beats: beatsOf(ids) };
}

/**
 * Resolve a pattern or song into playable sections.
 * Each section is one pattern played `repeats` times at `bpm`.
 * Sections whose pattern is missing or empty are left out and reported
 * in `problems`.
 */
export function resolve(kind, item, library) {
  const out = { kind, name: item ? item.name : "", baseBpm: item ? item.bpm : 90, sections: [], problems: [] };
  if (!item) return out;

  if (kind === "pattern") {
    const c = compile(item);
    if (c.unknown.length) out.problems.push(t("data.unknownWords", { words: c.unknown.join(", ") }));
    if (c.ids.length) {
      out.sections.push({ index: 0, name: item.name, patternId: item.id, pattern: item, ...c, repeats: 1, bpm: item.bpm });
    } else {
      out.problems.push(t("data.patternEmpty"));
    }
    return out;
  }

  (item.sections || []).forEach((sec, i) => {
    const pattern = library.pattern(sec.patternId);
    if (!pattern) {
      out.problems.push(t("data.sectionDeleted", { i: i + 1 }));
      return;
    }
    const c = compile(pattern);
    if (!c.ids.length) {
      out.problems.push(t("data.sectionEmpty", { i: i + 1, name: quote(pattern.name) }));
      return;
    }
    out.sections.push({
      index: i, name: pattern.name, patternId: pattern.id, pattern, ...c,
      repeats: sec.repeats, bpm: sec.bpm || item.bpm,
    });
  });
  if (!out.sections.length && !out.problems.length) out.problems.push(t("data.songEmpty"));
  return out;
}

/**
 * Swing moves every off-beat (the second half of a beat) later, to 2/3
 * of the beat: "Do-ko" becomes long-short.
 */
export function swingPos(pos, swing) {
  if (!swing) return pos;
  const whole = Math.floor(pos + 1e-9);
  const frac = pos - whole;
  return Math.abs(frac - 0.5) < 1e-9 ? whole + 2 / 3 : pos;
}

const ORDER = { beat: 0, token: 1, hit: 2, shout: 3 };

/**
 * Events for one repetition of one section, with times in seconds from
 * the start of that repetition. `factor` scales the tempo (the play
 * view's tempo divided by the item's own tempo).
 */
export function chunk(section, si, rep, factor = 1) {
  const bpm = clampBpm(section.bpm * factor);
  const spb = 60 / bpm;
  const swing = !!section.pattern.swing;
  const drum = section.pattern.drum === "shime" ? "shime" : "nagado";
  const events = [];
  let b = 0;
  section.ids.forEach((id, ti) => {
    const w = WORDS[id];
    const t = swingPos(b, swing) * spb;
    events.push({ type: "token", t, si, rep, ti, id });
    const parts = PARTS[id];
    w.hits.forEach((h, k) => {
      events.push({
        type: "hit", t: swingPos(b + h.t, swing) * spb,
        hand: h.hand, where: h.where, vol: h.vol, ring: h.ring, drum: w.drum || drum,
        // what this hit says when the words are spoken: "do" for the right
        // hit of Doko, "ko" for the left — the syllables follow the hands
        say: parts ? parts[k] : id,
      });
    });
    if (w.group === "shout") events.push({ type: "shout", t, id });
    b += w.beats;
  });
  const beats = Math.ceil(b - 1e-9);
  for (let n = 0; n < beats; n++) events.push({ type: "beat", t: n * spb, n, accent: n % 4 === 0, si, rep });
  events.sort((a, c) => a.t - c.t || ORDER[a.type] - ORDER[c.type]);
  return { events, duration: b * spb, bpm };
}

/** The repetition after `pos`, or null at the end of the item. */
export function nextPos(resolved, pos) {
  const sec = resolved.sections[pos.si];
  if (sec && pos.rep + 1 < sec.repeats) return { si: pos.si, rep: pos.rep + 1 };
  if (pos.si + 1 < resolved.sections.length) return { si: pos.si + 1, rep: 0 };
  return null;
}

/** Length of the whole item in seconds. */
export function duration(resolved, factor = 1) {
  return resolved.sections.reduce((sum, s) => sum + (s.repeats * s.beats * 60) / clampBpm(s.bpm * factor), 0);
}

export function totalBeats(resolved) {
  return resolved.sections.reduce((sum, s) => sum + s.repeats * s.beats, 0);
}

/** 135.4 → "2:15" */
export function fmtTime(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
