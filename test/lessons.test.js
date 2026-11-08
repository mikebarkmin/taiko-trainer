import { test } from "node:test";
import assert from "node:assert/strict";
import {
  strikeWord, normalizeLesson, normalizeStrikes, lowerBound, mergeStrikes, shiftStrikes, patternStrikes,
  youtubeId, sourceFromLink, encodeStrikes, decodeStrikes, packageHeader, readPackageHeader, PACKAGE_HEADER,
  snapToGrid,
} from "../src/core/lessons.js";
import { makeLibrary, importData, shareData, exportData, normalizeCustom } from "../src/core/library.js";
import { encodeShare, decodeShare } from "../src/core/share.js";
import { fmtClock, parseClock } from "../src/core/util.js";

const S = (t, hand, where = "center", vol = "big") => ({ t, hand, where, vol });

test("each strike has a drum word", () => {
  assert.equal(strikeWord(S(0, "R")), "don");
  assert.equal(strikeWord(S(0, "L")), "kon");
  assert.equal(strikeWord(S(0, "R", "center", "medium")), "do");
  assert.equal(strikeWord(S(0, "L", "center", "small")), "ku");
  assert.equal(strikeWord(S(0, "R", "rim")), "ka");
  assert.equal(strikeWord(S(0, "L", "rim", "small")), "ra");
  assert.equal(strikeWord({ t: 0, shout: "sore" }), "sore");
});

test("strikes are cleaned, rounded to ms and sorted", () => {
  const out = normalizeStrikes([
    S(2.00049, "R"), { t: 1, hand: "X", where: "center" }, { t: -5, hand: "L", where: "rim" },
    { t: 1.5, shout: "sore" }, { t: 1.6, shout: "hello" }, { t: "x", hand: "R", where: "rim" }, null,
    { t: 0.5, hand: "L", where: "center", vol: "huge" },
  ]);
  assert.deepEqual(out, [
    { t: 0, hand: "L", where: "rim", vol: "big" },
    { t: 0.5, hand: "L", where: "center", vol: "big" },
    { t: 1.5, shout: "sore" },
    { t: 2, hand: "R", where: "center", vol: "big" },
  ]);
});

test("lowerBound, merge and shift", () => {
  const list = [S(1, "R"), S(2, "L"), S(3, "R")];
  assert.equal(lowerBound(list, 0), 0);
  assert.equal(lowerBound(list, 2), 1);
  assert.equal(lowerBound(list, 2.5), 2);
  assert.equal(lowerBound(list, 9), 3);
  const merged = mergeStrikes(list, [S(2, "L"), S(1.5, "L", "rim")]);
  assert.deepEqual(merged.map((s) => s.t), [1, 1.5, 2, 3]);
  assert.deepEqual(shiftStrikes(list, -1.5).map((s) => s.t), [0, 0.5, 1.5]);
});

test("a pattern can be laid over the video", () => {
  const pattern = { id: "p", name: "x", words: "Don Doko Sore!", bpm: 120, swing: false, drum: "nagado", notes: "" };
  const out = patternStrikes(pattern, { start: 10, bpm: 60, repeats: 2 });
  // 60 bpm: Don 10, Do 11, Ko 11.5, shout 12; second round starts at 13
  assert.deepEqual(out.map((s) => s.t), [10, 11, 11.5, 12, 13, 14, 14.5, 15]);
  assert.deepEqual(out.slice(0, 4).map(strikeWord), ["don", "do", "ko", "sore"]);
});

test("YouTube links of every shape are recognised", () => {
  for (const link of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "dQw4w9WgXcQ",
  ]) assert.equal(youtubeId(link), "dQw4w9WgXcQ", link);
  assert.equal(youtubeId("https://example.com/watch?v=dQw4w9WgXcQ"), "");
  assert.deepEqual(sourceFromLink("https://example.com/a.mp4"), { type: "url", url: "https://example.com/a.mp4" });
  assert.equal(sourceFromLink("javascript:alert(1)"), null);
  assert.equal(sourceFromLink("not a link"), null);
});

test("lessons are validated", () => {
  const l = normalizeLesson({ name: "", video: { type: "url", url: "javascript:alert(1)" }, strikes: "nope" });
  assert.equal(l.name, "Untitled video lesson");
  assert.equal(l.video, null);
  assert.deepEqual(l.strikes, []);
  const f = normalizeLesson({ id: "v-1", video: { type: "file", name: "a.mp4", size: "12", mime: "video/mp4", duration: 3.5 } });
  assert.deepEqual(f.video, { type: "file", name: "a.mp4", size: 12, mime: "video/mp4", duration: 3.5 });
  assert.equal(f.grid, null, "no grid by default");
});

test("the bar grid survives a save and snaps to half-beats", () => {
  const l = normalizeLesson({ name: "L", grid: { start: "1.2", bpm: "90" } });
  assert.deepEqual(l.grid, { start: 1.2, bpm: 90 });
  assert.equal(normalizeLesson({ grid: { start: -1, bpm: 90 } }).grid, null);
  assert.equal(normalizeLesson({ grid: { start: 0, bpm: 400 } }).grid, null);
  assert.equal(normalizeLesson({ grid: "junk" }).grid, null);
  // 90 bpm: half a beat is 1/3 s, the grid starts at 1.2 and extends backwards
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  assert.ok(near(snapToGrid(l.grid, 1.3), 1.2));
  assert.ok(near(snapToGrid(l.grid, 1.8), 1.2 + 2 / 3));
  assert.ok(near(snapToGrid(l.grid, 0.1), 0.2));
  assert.equal(snapToGrid(l.grid, -0.5), 0, "never snaps before zero");
  assert.equal(snapToGrid(null, 1.45), 1.45);
});

test("compact strike text round-trips", () => {
  const strikes = [S(0.25, "R"), S(0.5, "L", "center", "medium"), { t: 1, shout: "yoisho" }, S(1.001, "R", "rim", "small")];
  const code = encodeStrikes(strikes);
  assert.equal(code, "250Rcb;250Lcm;500!yoisho;1Rrs");
  assert.deepEqual(decodeStrikes(code), strikes);
  assert.deepEqual(decodeStrikes("12Rcb;junk;5!nope;3Lrb"), [S(0.012, "R"), S(0.02, "L", "rim")]);
});

test("a lesson survives a share link, compressed", () => {
  const strikes = [];
  for (let i = 0; i < 600; i++) strikes.push(S(i * 0.25, i % 2 ? "L" : "R", i % 8 === 7 ? "rim" : "center"));
  const lesson = normalizeLesson({ id: "v-1", name: "Festival 祭り", video: { type: "youtube", videoId: "dQw4w9WgXcQ" }, strikes });
  const lib = makeLibrary({ patterns: [], songs: [], lessons: [lesson] });
  const data = shareData("lesson", lesson, lib);
  const code = encodeShare(data);
  assert.ok(code.length < 1500, `600 strikes fit in a short link (${code.length} chars)`);
  const back = decodeShare(code);
  assert.deepEqual(back.lessons[0], lesson);
  const { custom, added, lessonIds } = importData(normalizeCustom({}), back);
  assert.equal(added.lessons.length, 1);
  assert.equal(lessonIds.get("v-1"), "v-1");
  assert.equal(custom.lessons[0].strikes.length, 600);
  assert.equal(importData(custom, back).added.lessons.length, 0, "importing twice adds nothing");
});

test("export includes lessons; lesson file header", () => {
  const lesson = normalizeLesson({ id: "v-2", name: "x", strikes: [S(1, "R")] });
  assert.equal(exportData({ patterns: [], songs: [], lessons: [lesson] }).lessons.length, 1);
  const h = packageHeader(1234567);
  assert.equal(h.length, PACKAGE_HEADER);
  assert.equal(readPackageHeader(h), 1234567);
  assert.equal(readPackageHeader(new TextEncoder().encode('{"app":"taiko-trainer"}')), -1);
});

test("clock format", () => {
  assert.equal(fmtClock(83.456), "1:23.5");
  assert.equal(fmtClock(5, 0), "0:05");
  assert.equal(fmtClock(2.996, 2), "0:03.00"); // the rounding carries into the seconds
  assert.equal(fmtClock(59.97, 1), "1:00.0");
  assert.equal(fmtClock(0.96, 1), "0:01.0");
  assert.equal(parseClock("1:23.5"), 83.5);
  assert.equal(parseClock("12,25"), 12.25);
  assert.ok(Number.isNaN(parseClock("abc")));
});
