// Video lessons: a video plus a list of strikes, each at a time in the
// video. Pure module: no DOM, no storage.

import { WORDS } from "./words.js";
import { resolve, chunk } from "./timeline.js";
import { newId, cleanId, text, clampNum } from "./util.js";

export const MAX_STRIKES = 20000;
const MAX_TIME = 6 * 3600;
const HANDS = new Set(["R", "L"]);
const WHERE = new Set(["center", "rim"]);
const VOLS = new Set(["big", "medium", "small"]);
const SHOUTS = new Set(Object.keys(WORDS).filter((id) => WORDS[id].group === "shout"));

/** The one-hit word a strike stands for (Don, Ko, Ka…), or a shout. */
export function strikeWord(s) {
  if (s.shout) return s.shout;
  if (s.where === "rim") return s.hand === "R" ? "ka" : "ra";
  if (s.vol === "small") return s.hand === "R" ? "tsu" : "ku";
  if (s.vol === "medium") return s.hand === "R" ? "do" : "ko";
  return s.hand === "R" ? "don" : "kon";
}

/** The sound to play for a strike. */
export function strikeHit(s) {
  return { hand: s.hand, where: s.where, vol: s.vol, ring: s.where === "center" && s.vol === "big" ? "long" : "short", drum: "nagado" };
}

const roundMs = (t) => Math.round(t * 1000) / 1000;

export function normalizeStrike(s) {
  if (!s || typeof s !== "object") return null;
  const t = clampNum(s.t, 0, MAX_TIME, NaN);
  if (!Number.isFinite(t)) return null;
  if (s.shout !== undefined) return SHOUTS.has(s.shout) ? { t: roundMs(t), shout: s.shout } : null;
  if (!HANDS.has(s.hand) || !WHERE.has(s.where)) return null;
  return { t: roundMs(t), hand: s.hand, where: s.where, vol: VOLS.has(s.vol) ? s.vol : "big" };
}

const byTime = (a, b) => a.t - b.t;

export function normalizeStrikes(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_STRIKES).map(normalizeStrike).filter(Boolean).sort(byTime);
}

/** First index whose strike is at or after time `t`. */
export function lowerBound(strikes, t) {
  let lo = 0;
  let hi = strikes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (strikes[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Add strikes, keeping time order and dropping exact duplicates. */
export function mergeStrikes(existing, added) {
  const key = (s) => `${Math.round(s.t * 1000)}|${s.shout || s.hand + s.where + s.vol}`;
  const seen = new Set(existing.map(key));
  const out = existing.slice();
  for (const s of added) {
    const k = key(s);
    if (!seen.has(k)) { seen.add(k); out.push(s); }
  }
  return out.sort(byTime).slice(0, MAX_STRIKES);
}

/** Move every strike by `delta` seconds (never before 0). */
export function shiftStrikes(strikes, delta) {
  return strikes.map((s) => ({ ...s, t: roundMs(Math.max(0, s.t + delta)) })).sort(byTime);
}

/**
 * The strikes of a pattern played `repeats` times from `start` seconds at
 * `bpm` — to lay a known rhythm over a video in one go.
 */
export function patternStrikes(pattern, { start = 0, bpm = pattern.bpm, repeats = 1 } = {}) {
  const r = resolve("pattern", pattern, null);
  const sec = r.sections[0];
  if (!sec) return [];
  const out = [];
  let offset = start;
  for (let rep = 0; rep < repeats; rep++) {
    const c = chunk(sec, 0, rep, bpm / pattern.bpm);
    for (const ev of c.events) {
      if (ev.type === "hit") out.push({ t: roundMs(offset + ev.t), hand: ev.hand, where: ev.where, vol: ev.vol });
      else if (ev.type === "shout") out.push({ t: roundMs(offset + ev.t), shout: ev.id });
    }
    offset += c.duration;
  }
  return out;
}

// ---------- video sources ----------

/** The 11-character video id from any common YouTube link, or "". */
export function youtubeId(input) {
  const s = String(input || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return ""; }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id = "";
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v") || "";
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
    if (!id && m) id = m[1];
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
}

/** A video source from a pasted link: YouTube, or a direct http(s) video URL. */
export function sourceFromLink(input) {
  const id = youtubeId(input);
  if (id) return { type: "youtube", videoId: id };
  try {
    const u = new URL(String(input).trim());
    if (u.protocol === "https:" || u.protocol === "http:") return { type: "url", url: u.href.slice(0, 2000) };
  } catch { /* not a link */ }
  return null;
}

export function normalizeVideo(v) {
  if (!v || typeof v !== "object") return null;
  if (v.type === "file") {
    return {
      type: "file",
      name: text(v.name, 200),
      size: Math.max(0, Math.round(Number(v.size) || 0)),
      mime: text(v.mime, 100),
      duration: clampNum(v.duration, 0, MAX_TIME, 0),
    };
  }
  if (v.type === "youtube") {
    const id = youtubeId(v.videoId);
    return id ? { type: "youtube", videoId: id } : null;
  }
  if (v.type === "url") return sourceFromLink(v.url)?.type === "url" ? { type: "url", url: sourceFromLink(v.url).url } : null;
  return null;
}

export function normalizeLesson(l) {
  if (!l || typeof l !== "object") return null;
  return {
    id: cleanId(l.id) || newId("v"),
    name: text(l.name, 80).trim() || "Untitled video lesson",
    notes: text(l.notes, 500).trim(),
    video: normalizeVideo(l.video),
    strikes: normalizeStrikes(l.strikes),
  };
}

export function describeVideo(v) {
  if (!v) return "No video yet";
  if (v.type === "youtube") return "YouTube video";
  if (v.type === "url") return "Video link";
  return v.name ? `Video file “${v.name}”` : "Video file";
}

// ---------- compact strikes for share links ----------
// "1234Rcb;250Lcm;500!sore": milliseconds since the previous strike, then
// hand (R/L), where (c = skin, r = rim) and size (b/m/s), or ! + a shout.

const VOL_CODE = { big: "b", medium: "m", small: "s" };
const CODE_VOL = { b: "big", m: "medium", s: "small" };

export function encodeStrikes(strikes) {
  let prev = 0;
  return strikes.map((s) => {
    const ms = Math.round(s.t * 1000);
    const d = ms - prev;
    prev = ms;
    return d + (s.shout ? `!${s.shout}` : s.hand + (s.where === "rim" ? "r" : "c") + VOL_CODE[s.vol]);
  }).join(";");
}

export function decodeStrikes(str) {
  if (Array.isArray(str)) return normalizeStrikes(str);
  if (typeof str !== "string" || !str) return [];
  const out = [];
  let ms = 0;
  for (const part of str.split(";").slice(0, MAX_STRIKES)) {
    const m = part.match(/^(\d{1,9})(?:([RL])([cr])([bms])|!([a-z]{1,12}))$/);
    if (!m) continue;
    ms += Number(m[1]);
    const t = ms / 1000;
    if (m[5]) { if (SHOUTS.has(m[5])) out.push({ t, shout: m[5] }); }
    else out.push({ t, hand: m[2], where: m[3] === "r" ? "rim" : "center", vol: CODE_VOL[m[4]] });
  }
  return normalizeStrikes(out);
}

// ---------- lesson file (lesson + video in one download) ----------
// 8 bytes "TAIKOTR1", 4 bytes JSON length (little-endian), the JSON, then
// the video bytes. Lets a lesson travel as one file without zip libraries.

export const PACKAGE_MAGIC = "TAIKOTR1";
export const PACKAGE_HEADER = 12;

export function packageHeader(jsonLength) {
  const out = new Uint8Array(PACKAGE_HEADER);
  for (let i = 0; i < 8; i++) out[i] = PACKAGE_MAGIC.charCodeAt(i);
  new DataView(out.buffer).setUint32(8, jsonLength, true);
  return out;
}

/** JSON length from the first 12 bytes of a file, or -1 if it isn't a lesson file. */
export function readPackageHeader(bytes) {
  if (!bytes || bytes.length < PACKAGE_HEADER) return -1;
  for (let i = 0; i < 8; i++) if (bytes[i] !== PACKAGE_MAGIC.charCodeAt(i)) return -1;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
}
