// Patterns and songs: the built-in ones, validation of saved or imported
// ones, and sharing. Pure module: no DOM, no storage.

import { MIN_BPM, MAX_BPM } from "./timeline.js";

export const APP_ID = "taiko-trainer";
export const FORMAT_VERSION = 1;

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function newId(prefix) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function text(v, max) {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function cleanId(v) {
  return typeof v === "string" && ID_RE.test(v) ? v : "";
}

/** A pattern with every field present and in range, or null. */
export function normalizePattern(p) {
  if (!p || typeof p !== "object") return null;
  return {
    id: cleanId(p.id) || newId("p"),
    name: text(p.name, 80).trim() || "Untitled pattern",
    words: text(p.words, 2000).trim(),
    bpm: clampInt(p.bpm, MIN_BPM, MAX_BPM, 90),
    swing: p.swing === true,
    drum: p.drum === "shime" ? "shime" : "nagado",
    notes: text(p.notes, 500).trim(),
  };
}

/** A song with every field present and in range, or null. */
export function normalizeSong(s) {
  if (!s || typeof s !== "object") return null;
  const sections = Array.isArray(s.sections) ? s.sections : [];
  return {
    id: cleanId(s.id) || newId("s"),
    name: text(s.name, 80).trim() || "Untitled song",
    bpm: clampInt(s.bpm, MIN_BPM, MAX_BPM, 90),
    sections: sections
      .filter((sec) => sec && typeof sec === "object" && cleanId(sec.patternId))
      .slice(0, 200)
      .map((sec) => ({
        patternId: sec.patternId,
        repeats: clampInt(sec.repeats, 1, 99, 1),
        bpm: sec.bpm === null || sec.bpm === undefined || sec.bpm === "" ? null : clampInt(sec.bpm, MIN_BPM, MAX_BPM, null),
      })),
    notes: text(s.notes, 500).trim(),
  };
}

/** Saved data from storage, cleaned up. Never throws. */
export function normalizeCustom(raw) {
  const out = { patterns: [], songs: [] };
  if (!raw || typeof raw !== "object") return out;
  const seen = new Set(BUILTIN_PATTERNS.map((p) => p.id).concat(BUILTIN_SONGS.map((s) => s.id)));
  for (const p of Array.isArray(raw.patterns) ? raw.patterns : []) {
    const n = normalizePattern(p);
    if (n && !seen.has(n.id)) { seen.add(n.id); out.patterns.push(n); }
  }
  for (const s of Array.isArray(raw.songs) ? raw.songs : []) {
    const n = normalizeSong(s);
    if (n && !seen.has(n.id)) { seen.add(n.id); out.songs.push(n); }
  }
  return out;
}

const P = (id, name, words, bpm, extra = {}) => normalizePattern({ id, name, words, bpm, ...extra });

/** Common practice patterns and base rhythms (ji). Read-only. */
export const BUILTIN_PATTERNS = [
  P("b-steady-don", "Steady Don", "Don Don Don Don", 80,
    { notes: "Even, big hits with the right hand. Make every Don the same size." }),
  P("b-don-kon", "Right, left", "Don Kon Don Kon", 80,
    { notes: "Change hands every beat. The left should sound as strong as the right." }),
  P("b-don-ka-kat-su", "Don Ka Kat Su", "Don Ka Kat Su | Don Don Kat Su", 90,
    { notes: "The four words you started with. Kat is the same as Ka." }),
  P("b-count-rest", "Count the rest", "Don Su Don Su | Don Don Don Su", 80,
    { notes: "Keep counting through the silence. The rests are part of the rhythm." }),
  P("b-don-doko", "Don Doko", "Don Doko Don Doko", 100,
    { notes: "A very common base rhythm (ji). The right hand starts every beat." }),
  P("b-doko", "Doko all the way", "Doko Doko Doko Doko", 90,
    { notes: "Even pairs, right then left. Both hits the same size." }),
  P("b-matsuri-ji", "Matsuri ji (swing)", "Do Ko Do Ko Do Ko Do Ko", 100,
    { swing: true, notes: "The swung festival base rhythm: long-short, long-short. Say it “Don-ko, Don-ko”." }),
  P("b-don-ka", "Don Ka", "Don Ka Don Ka", 90,
    { notes: "Skin, then rim. Move the stick from the middle to the edge and back." }),
  P("b-don-kara", "Don Kara", "Don Kara Don Kara", 90,
    { notes: "A big hit, then two quick rim clicks." }),
  P("b-doko-kara", "Doko Kara", "Doko Kara Doko Kara", 90,
    { notes: "Pairs on the skin, then pairs on the rim." }),
  P("b-quiet-loud", "Quiet, loud", "Tsuku Tsuku Don Su | Tsuku Tsuku Don Don", 90,
    { notes: "Small wrist taps, then big arm hits. Make the difference easy to hear." }),
  P("b-with-shout", "With a shout", "Don Doko Don Su | Doko Doko Don Sore!", 100,
    { notes: "Shout Sore! in the last beat." }),
  P("b-ten-tsuku", "Ten Tsuku (small drum)", "Ten Tsuku Ten Tsuku", 100,
    { drum: "shime", notes: "A common steady rhythm on the small drum." }),
  P("b-ten-teke", "Ten Teke (small drum)", "Ten Teke Ten Teke | Ten Teke Teke Ten", 100,
    { drum: "shime", notes: "Single and double hits on the small drum." }),
];

const S = (id, name, bpm, sections, notes) => normalizeSong({ id, name, bpm, sections, notes });

/** Example songs built from the common patterns. Read-only. */
export const BUILTIN_SONGS = [
  S("b-song-warmup", "Warm-up", 90, [
    { patternId: "b-steady-don", repeats: 4 },
    { patternId: "b-don-kon", repeats: 4 },
    { patternId: "b-don-doko", repeats: 4 },
    { patternId: "b-don-ka", repeats: 2 },
    { patternId: "b-with-shout", repeats: 2 },
  ], "An example song: each section is a common pattern played a few times."),
  S("b-song-faster", "Getting faster", 80, [
    { patternId: "b-don-doko", repeats: 2, bpm: 80 },
    { patternId: "b-don-doko", repeats: 2, bpm: 95 },
    { patternId: "b-don-doko", repeats: 2, bpm: 110 },
    { patternId: "b-don-doko", repeats: 2, bpm: 125 },
    { patternId: "b-count-rest", repeats: 1, bpm: 125 },
  ], "An example of sections with their own tempo: the same rhythm, faster each time."),
];

const BUILTIN_IDS = new Set(BUILTIN_PATTERNS.map((p) => p.id).concat(BUILTIN_SONGS.map((s) => s.id)));

export function isBuiltin(id) {
  return BUILTIN_IDS.has(id);
}

/** Built-in plus saved items, with lookups by id. */
export function makeLibrary(custom) {
  const patterns = BUILTIN_PATTERNS.map((p) => ({ ...p, builtin: true })).concat(custom.patterns);
  const songs = BUILTIN_SONGS.map((s) => ({ ...s, builtin: true })).concat(custom.songs);
  const pmap = new Map(patterns.map((p) => [p.id, p]));
  const smap = new Map(songs.map((s) => [s.id, s]));
  return {
    patterns,
    songs,
    pattern: (id) => pmap.get(id) || null,
    song: (id) => smap.get(id) || null,
    get: (kind, id) => (kind === "song" ? smap.get(id) : pmap.get(id)) || null,
    songsUsing: (patternId) => songs.filter((s) => s.sections.some((sec) => sec.patternId === patternId)),
  };
}

function plain(item) {
  const { builtin, ...rest } = item;
  return rest;
}

/** Everything the user made, as a file-ready object. */
export function exportData(custom) {
  return { app: APP_ID, version: FORMAT_VERSION, patterns: custom.patterns.map(plain), songs: custom.songs.map(plain) };
}

/** What to put in a share link for one pattern or song. */
export function shareData(kind, item, library) {
  if (kind === "pattern") return { app: APP_ID, version: FORMAT_VERSION, patterns: [plain(item)], songs: [] };
  const ids = [...new Set(item.sections.map((s) => s.patternId))];
  const patterns = ids.map((id) => library.pattern(id)).filter((p) => p && !p.builtin).map(plain);
  return { app: APP_ID, version: FORMAT_VERSION, patterns, songs: [plain(item)] };
}

const samePattern = (a, b) =>
  a.name === b.name && a.words === b.words && a.bpm === b.bpm && a.swing === b.swing && a.drum === b.drum && a.notes === b.notes;

const sameSong = (a, b) =>
  a.name === b.name && a.bpm === b.bpm && a.notes === b.notes && JSON.stringify(a.sections) === JSON.stringify(b.sections);

/**
 * Merge imported data into the user's items. Items that are already
 * there unchanged are skipped; clashing ids get new ids, and songs are
 * pointed at the renamed patterns. Throws for data that isn't ours.
 */
export function importData(custom, data) {
  if (!data || typeof data !== "object" || (!Array.isArray(data.patterns) && !Array.isArray(data.songs))) {
    throw new Error("This isn’t a Taiko Trainer file.");
  }
  if (data.app && data.app !== APP_ID) throw new Error("This file is from a different app.");

  const patterns = custom.patterns.slice();
  const songs = custom.songs.slice();
  const remap = new Map();
  const added = { patterns: [], songs: [] };
  const taken = (id) => BUILTIN_IDS.has(id) || patterns.some((p) => p.id === id) || songs.some((s) => s.id === id);

  for (const raw of Array.isArray(data.patterns) ? data.patterns : []) {
    const p = normalizePattern(raw);
    if (!p) continue;
    const originalId = p.id;
    if (BUILTIN_IDS.has(originalId)) { remap.set(originalId, originalId); continue; }
    const existing = patterns.find((x) => x.id === originalId);
    if (existing && samePattern(existing, p)) { remap.set(originalId, originalId); continue; }
    if (taken(p.id)) p.id = newId("p");
    remap.set(originalId, p.id);
    patterns.push(p);
    added.patterns.push(p);
  }

  for (const raw of Array.isArray(data.songs) ? data.songs : []) {
    const s = normalizeSong(raw);
    if (!s || BUILTIN_IDS.has(s.id)) continue;
    s.sections = s.sections.map((sec) => ({ ...sec, patternId: remap.get(sec.patternId) || sec.patternId }));
    const existing = songs.find((x) => x.id === s.id);
    if (existing && sameSong(existing, s)) continue;
    if (taken(s.id)) s.id = newId("s");
    songs.push(s);
    added.songs.push(s);
  }

  return { custom: { patterns, songs }, added };
}

/** Data → URL-safe text for a share link. */
export function encodeShare(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe text from a share link → data. Throws if it's damaged. */
export function decodeShare(code) {
  const b64 = String(code).replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
