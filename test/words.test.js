import { test } from "node:test";
import assert from "node:assert/strict";
import { WORDS, parseWords, formatWords, beatsOf, fmtBeats, lookup, PALETTE, HAND_GRID } from "../src/core/words.js";

test("parses romaji, kana and aliases", () => {
  const { ids, unknown } = parseWords("Don Kat ドコ doro Tere! iya | Su");
  assert.deepEqual(ids, ["don", "ka", "doko", "doko", "teke", "iya", "su"]);
  assert.deepEqual(unknown, []);
});

test("splits on hyphens, commas and bar lines, ignores case and !", () => {
  assert.deepEqual(parseWords("DON-doko,ka|KARA  sore!").ids, ["don", "doko", "ka", "kara", "sore"]);
});

test("reports each unknown word once", () => {
  const { ids, unknown } = parseWords("Don blub Ka blub zap");
  assert.deepEqual(ids, ["don", "ka"]);
  assert.deepEqual(unknown, ["blub", "zap"]);
});

test("empty input gives no words", () => {
  assert.deepEqual(parseWords("  | "), { ids: [], unknown: [] });
  assert.deepEqual(parseWords(undefined), { ids: [], unknown: [] });
});

test("formats with a bar line after every 4 beats", () => {
  const { ids } = parseWords("Don Doko Don Su Ka Kara Don Sore");
  assert.equal(formatWords(ids), "Don Doko Don Su | Ka Kara Don Sore!");
  assert.equal(formatWords(parseWords("Do Ko Do Ko Don Don Don").ids), "Do Ko Do Ko Don Don | Don");
  assert.equal(formatWords(parseWords("Don Don Don Don").ids), "Don Don Don Don", "no bar line at the very end");
});

test("formatted text parses back to the same words", () => {
  const ids = parseWords("Tsuku Tsuku Don Su Do Ko Do Ko Don Ka Ra Kara").ids;
  assert.deepEqual(parseWords(formatWords(ids)).ids, ids);
});

test("counts beats, including half beats", () => {
  assert.equal(beatsOf(parseWords("Do Ko Don").ids), 2);
  assert.equal(beatsOf(parseWords("Don Do").ids), 1.5);
  assert.equal(fmtBeats(6.5), "6½");
  assert.equal(fmtBeats(0.5), "½");
  assert.equal(fmtBeats(8), "8");
  assert.equal(fmtBeats(0), "0");
});

test("every word is well formed", () => {
  for (const [id, w] of Object.entries(WORDS)) {
    assert.equal(lookup(id), id);
    assert.ok(w.beats === 0.5 || w.beats === 1, `${id} beats`);
    for (const h of w.hits) {
      assert.ok(h.t >= 0 && h.t < w.beats, `${id} hit inside the word`);
      assert.ok(["R", "L"].includes(h.hand));
      assert.ok(["center", "rim"].includes(h.where));
    }
    assert.ok(w.mean && w.size && w.len && w.say && w.tip, `${id} has all texts`);
  }
});

test("palette and hand grid only use real words", () => {
  for (const id of PALETTE) if (id !== "|") assert.ok(WORDS[id], id);
  for (const row of HAND_GRID) for (const id of [row.R, row.L, row.pair]) if (id) assert.ok(WORDS[id], id);
});
