import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

test("the offline copy lists every app file, and only real ones", () => {
  const sw = read("sw.js");
  const listed = [...sw.matchAll(/^\s+"([^"]+)",$/gm)].map((m) => m[1]);
  for (const f of listed) if (f !== "./") assert.ok(existsSync(new URL(f, root)), `${f} exists`);
  const js = ["src", "src/core", "src/ui"].flatMap((d) => readdirSync(new URL(d, root)).filter((f) => f.endsWith(".js")).map((f) => `${d}/${f}`));
  for (const f of js) assert.ok(listed.includes(f), `${f} is cached for offline use`);
  assert.ok(listed.includes("vendor/pako.esm.mjs"));
});

test("the manifest's icons exist", () => {
  const m = JSON.parse(read("manifest.webmanifest"));
  for (const icon of m.icons) assert.ok(existsSync(new URL(icon.src, root)), icon.src);
});

test("every id the scripts look up exists in index.html", () => {
  const html = read("index.html");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const file of ["src/ui/lesson-editor.js", "src/ui/library.js"]) { // these build their own markup
    for (const m of read(file).matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  }
  for (const file of ["src/main.js", "src/ui/play.js", "src/ui/library.js", "src/ui/words.js", "src/ui/lesson-player.js"]) {
    for (const m of read(file).matchAll(/\$\("#([A-Za-z][\w-]*)"/g)) assert.ok(ids.has(m[1]), `#${m[1]} used in ${file}`);
  }
});
