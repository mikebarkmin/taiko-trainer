import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_PATTERNS, BUILTIN_SONGS, makeLibrary, normalizePattern, normalizeSong, normalizeCustom,
  importData, exportData, shareData,
} from "../src/core/library.js";
import { encodeShare, decodeShare } from "../src/core/share.js";
import { resolve } from "../src/core/timeline.js";

test("every built-in pattern parses cleanly", () => {
  const lib = makeLibrary({ patterns: [], songs: [] });
  for (const p of BUILTIN_PATTERNS) {
    const r = resolve("pattern", p, lib);
    assert.deepEqual(r.problems, [], p.name);
    assert.ok(r.sections[0].beats % 4 === 0, `${p.name} fills whole bars`);
  }
  for (const s of BUILTIN_SONGS) assert.deepEqual(resolve("song", s, lib).problems, [], s.name);
});

test("normalizing fills defaults and clamps values", () => {
  const p = normalizePattern({ name: "  ", words: "Don", bpm: 999, swing: "yes", drum: "taiko" });
  assert.equal(p.name, "Untitled pattern");
  assert.equal(p.bpm, 240);
  assert.equal(p.swing, false);
  assert.equal(p.drum, "nagado");
  assert.match(p.id, /^p-/);
  assert.equal(normalizePattern("nope"), null);

  const s = normalizeSong({ id: "bad id!", bpm: 5, sections: [{ patternId: "x", repeats: 500, bpm: "" }, { repeats: 2 }, null] });
  assert.match(s.id, /^s-/);
  assert.equal(s.bpm, 30);
  assert.deepEqual(s.sections, [{ patternId: "x", repeats: 99, bpm: null }]);
});

test("saved data with junk or clashing ids is cleaned", () => {
  const c = normalizeCustom({ patterns: [{ id: "b-steady-don", name: "Clash" }, { id: "a", words: "Don" }, { id: "a", words: "Ka" }, 7], songs: "x" });
  assert.deepEqual(c.patterns.map((p) => p.id), ["a"]);
  assert.deepEqual(c.songs, []);
  assert.deepEqual(normalizeCustom(null), { patterns: [], songs: [], lessons: [] });
});

test("import adds new items, skips duplicates and renames clashes", () => {
  const mine = { patterns: [
    normalizePattern({ id: "p-a", name: "A", words: "Don" }),
    normalizePattern({ id: "p-same", name: "Same", words: "Ka" }),
  ], songs: [] };
  const incoming = {
    app: "taiko-trainer", version: 1,
    patterns: [
      { id: "p-a", name: "Their A", words: "Doko" },  // same id, different pattern: renamed
      { id: "p-same", name: "Same", words: "Ka" },     // identical: skipped
      { id: "p-b", name: "B", words: "Tsuku" },        // new
    ],
    songs: [{ id: "s-1", name: "Song", bpm: 90, sections: [
      { patternId: "p-a", repeats: 2 }, { patternId: "p-same", repeats: 1 },
      { patternId: "p-b", repeats: 1 }, { patternId: "b-don-doko", repeats: 1 },
    ] }],
  };
  const { custom, added } = importData(mine, incoming);
  assert.deepEqual(added.patterns.map((p) => p.name), ["Their A", "B"]);
  assert.equal(added.songs.length, 1);
  assert.equal(custom.patterns.find((p) => p.id === "p-a").name, "A", "the user's own pattern is untouched");
  const theirA = custom.patterns.find((p) => p.name === "Their A");
  assert.notEqual(theirA.id, "p-a");
  assert.deepEqual(custom.songs[0].sections.map((s) => s.patternId), [theirA.id, "p-same", "p-b", "b-don-doko"]);

  // Importing the same song again adds nothing.
  const again = importData(custom, { patterns: [], songs: [custom.songs[0]] });
  assert.equal(again.added.songs.length, 0);
});

test("import rejects files that aren't ours", () => {
  assert.throws(() => importData({ patterns: [], songs: [] }, { hello: 1 }), /Taiko Trainer/);
  assert.throws(() => importData({ patterns: [], songs: [] }, { app: "other", patterns: [] }), /different app/);
});

test("share links round-trip, including Japanese text", () => {
  const p = normalizePattern({ id: "p-x", name: "お祭り Don", words: "ドン ドコ", bpm: 110 });
  const s = normalizeSong({ id: "s-x", name: "Song", bpm: 100, sections: [{ patternId: "p-x", repeats: 2 }, { patternId: "b-don-ka", repeats: 1 }] });
  const lib = makeLibrary({ patterns: [p], songs: [s], lessons: [] });
  const data = shareData("song", lib.song("s-x"), lib);
  assert.deepEqual(data.patterns.map((x) => x.id), ["p-x"], "only the user's own patterns travel along");
  const code = encodeShare(data);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShare(code), data);
  assert.throws(() => decodeShare("%%%"));
  assert.throws(() => decodeShare("AAAA"), "random bytes are not a valid zlib stream");
});

test("export leaves out built-in markers", () => {
  const p = { ...normalizePattern({ id: "p-1", words: "Don" }), builtin: true };
  const out = exportData({ patterns: [p], songs: [] });
  assert.equal(out.app, "taiko-trainer");
  assert.equal("builtin" in out.patterns[0], false);
});
