import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import EN from "../src/lang/en.js";
import DE, { CONTENT as DE_CONTENT } from "../src/lang/de.js";
import { t, setLang, lang } from "../src/i18n.js";
import { WORDS, GROUPS, HAND_GRID } from "../src/core/words.js";
import { BUILTIN_PATTERNS, BUILTIN_SONGS } from "../src/core/library.js";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

test("tests run in English", () => {
  assert.equal(lang, "en");
  assert.equal(t("nav.play"), "Play");
});

test("German has every English key, and no extra ones", () => {
  assert.deepEqual(Object.keys(DE).filter((k) => !(k in EN)), [], "keys only in German");
  assert.deepEqual(Object.keys(EN).filter((k) => !(k in DE)), [], "keys missing in German");
  for (const k of Object.keys(EN)) assert.equal(typeof DE[k], typeof EN[k], `${k} has the same kind of value`);
});

test("German keeps every {placeholder}", () => {
  for (const [k, v] of Object.entries(EN)) {
    if (typeof v !== "string") continue;
    const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(names(DE[k]), names(v), k);
  }
});

test("every key the page and the scripts use exists", () => {
  const html = read("index.html");
  const keys = [
    ...[...html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(";").map((p) => p.split(":")[1].trim())),
  ];
  const files = ["src/main.js", "src/drum.js", "src/media.js", "src/videostore.js", "src/core/lessons.js", "src/core/timeline.js", "src/core/library.js"]
    .concat(readdirSync(new URL("src/ui", root)).map((f) => `src/ui/${f}`));
  for (const f of files) for (const m of read(f).matchAll(/\bt\("([\w.]+)"/g)) keys.push(m[1]);
  for (const k of keys) assert.ok(k in EN, `${k} is in en.js`);
});

test("plurals and lists read right in both languages", () => {
  assert.equal(t("strikes", { n: 1 }), "1 strike");
  assert.equal(t("lib.added", { parts: ["2 patterns", "1 song", "1 video lesson"] }), "Added 2 patterns, 1 song and 1 video lesson.");
  setLang("de");
  try {
    assert.equal(t("strikes", { n: 3 }), "3 Schläge");
    assert.equal(t("lib.added", { parts: ["2 Patterns", "1 Stück"] }), "2 Patterns und 1 Stück hinzugefügt.");
    assert.equal(t("lib.confirmDelete", { name: "„A“" }), "„A“ löschen?");
  } finally {
    setLang("en");
  }
});

test("German content only covers things that exist", () => {
  for (const id of Object.keys(DE_CONTENT.words)) assert.ok(WORDS[id], id);
  for (const id of Object.keys(WORDS)) assert.ok(DE_CONTENT.words[id], `German for word ${id}`);
  for (const id of Object.keys(DE_CONTENT.groups)) assert.ok(GROUPS.some((g) => g.id === id), id);
  for (const id of Object.keys(DE_CONTENT.handGrid)) assert.ok(HAND_GRID.some((r) => r.R === id), id);
  for (const id of Object.keys(DE_CONTENT.patterns)) assert.ok(BUILTIN_PATTERNS.some((p) => p.id === id), id);
  for (const id of Object.keys(DE_CONTENT.songs)) assert.ok(BUILTIN_SONGS.some((s) => s.id === id), id);
});
