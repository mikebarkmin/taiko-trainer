import { WORDS } from "./core/words.js";
import { makeLibrary, importData } from "./core/library.js";
import { decodeShare } from "./core/share.js";
import { Synth, speak } from "./audio.js";
import { Player } from "./player.js";
import { loadCustom, saveCustom, loadSettings, saveSettings } from "./store.js";
import { mountPlay } from "./ui/play.js";
import { mountLibrary, summary } from "./ui/library.js";
import { mountWords } from "./ui/words.js";
import { mountLessonEditor } from "./ui/lesson-editor.js";
import { $, $$ } from "./ui/render.js";

const synth = new Synth();
const player = new Player(synth);
const settings = loadSettings();
let custom = loadCustom();
let lib = makeLibrary(custom);
let views = {};
let active = "";

const app = {
  synth,
  player,
  settings,
  lib: () => lib,
  custom: () => custom,
  saveSettings: () => saveSettings(settings),

  /** Replace the user's patterns, songs and lessons. Returns false if the browser refused to save. */
  setCustom(next) {
    custom = { patterns: next.patterns, songs: next.songs, lessons: next.lessons || [] };
    lib = makeLibrary(custom);
    const ok = saveCustom(custom);
    views.play?.refresh();
    views.library?.refresh();
    return ok;
  },

  /** Open the Play screen with this item selected. */
  playItem(kind, id) {
    views.play.choose(`${kind}:${id}`);
    location.hash = "#play";
  },

  /** Someone tapped the drum or pressed D/F/J/K. */
  freeHit(drum, hand, where) {
    synth.ensure();
    const id = where === "rim" ? (hand === "R" ? "ka" : "ra") : (hand === "R" ? "don" : "kon");
    const h = { hand, where, vol: "big", ring: where === "rim" ? "short" : "long", drum: "nagado" };
    synth.hit(h, synth.now() + 0.005);
    drum?.hit(h);
    drum?.setWord(WORDS[id].kana);
  },

  /** Play one word on its own (and show it on `drum` if given). */
  playWord(drum, id, patternDrum = "nagado") {
    if (!id) return;
    synth.ensure();
    const w = WORDS[id];
    drum?.setWord(w.kana);
    if (w.group === "shout") {
      drum?.shout(id);
      speak(id);
      return;
    }
    const spb = 60 / Math.max(60, Math.min(140, settings.bpm));
    const t0 = synth.now() + 0.03;
    for (const h of w.hits) {
      const hit = { ...h, drum: w.drum || patternDrum };
      synth.hit(hit, t0 + h.t * spb);
      if (drum) setTimeout(() => drum.hit(hit), h.t * spb * 1000);
    }
  },
};

// ---------- screens ----------
const VIEWS = ["play", "library", "words", "lesson"];
const TITLES = { play: "Play", library: "Patterns & songs", words: "Words", lesson: "Strike editor" };

function show() {
  const [name, param = ""] = location.hash.replace(/^#/, "").split("=");
  const next = VIEWS.includes(name) ? name : "play";
  if (active === "lesson" && next !== "lesson") views.lesson.close();
  if (active === "play" && next !== "play") views.play.setVisible(false);
  active = next;
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== active;
  const tab = active === "lesson" ? "library" : active;
  $$(".tabs a").forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = `${TITLES[active]} · Taiko Trainer`;
  if (active === "play") views.play.setVisible(true);
  if (active === "lesson") views.lesson.open(param);
}

// ---------- shared links ----------
function readShareLink() {
  const m = location.hash.match(/^#share=([A-Za-z0-9_-]+)$/);
  if (!m) return false;
  history.replaceState(null, "", `${location.pathname}${location.search}#library`);
  const banner = $("#banner");
  const textEl = $("#bannerText");
  const addBtn = $("#bannerAdd");
  let data;
  try {
    data = decodeShare(m[1]);
    importData({ patterns: [], songs: [], lessons: [] }, data); // validate only
  } catch {
    textEl.textContent = "This share link is damaged or cut off, so nothing was added. Ask for the link again, or for a file.";
    addBtn.hidden = true;
    banner.hidden = false;
    return true;
  }
  const name = (item, fallback) => `“${String(item?.name || fallback).slice(0, 80)}”`;
  const lesson = data.lessons?.[0];
  const song = data.songs?.[0];
  textEl.textContent = lesson
    ? `Someone shared the video lesson ${name(lesson, "Untitled")} with you.`
    : song
      ? `Someone shared the song ${name(song, "Untitled song")} with you.`
      : `Someone shared the pattern ${name(data.patterns?.[0], "Untitled pattern")} with you.`;
  addBtn.hidden = false;
  banner.hidden = false;
  addBtn.onclick = () => {
    const { custom: next, added } = importData(custom, data);
    const ok = app.setCustom(next);
    let message = `${summary(added)}${ok ? " You’ll find it below." : " This browser would not save it, though."}`;
    if (added.lessons.some((l) => l.video?.type === "file")) message += " Open the lesson and attach its video file to play along.";
    textEl.textContent = message;
    addBtn.hidden = true;
  };
  return true;
}
$("#bannerDismiss").addEventListener("click", () => { $("#banner").hidden = true; });

// ---------- keyboard ----------
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
  if (active === "lesson") { views.lesson.onKey(e); return; }
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const keys = { d: ["L", "rim"], f: ["L", "center"], j: ["R", "center"], k: ["R", "rim"] };
  const hit = keys[e.key.toLowerCase()];
  const drum = views[active]?.drum;
  if (hit && drum) {
    e.preventDefault();
    app.freeHit(drum, hit[0], hit[1]);
    return;
  }
  if (e.key === " " && active === "play" && !t?.closest?.("button, a, summary, video")) {
    e.preventDefault();
    views.play.toggle();
  }
});

// ---------- mobile: unlock audio on the first touch ----------
// iOS and Android only allow sound after a tap, and the audio clock must be
// started inside that tap.
function unlockAudio() {
  synth.ensure();
  if (synth.ctx?.state === "running") {
    for (const ev of ["pointerdown", "touchend", "keydown"]) document.removeEventListener(ev, unlockAudio, true);
  }
}
for (const ev of ["pointerdown", "touchend", "keydown"]) document.addEventListener(ev, unlockAudio, { capture: true, passive: true });

// ---------- start ----------
views = { play: mountPlay(app), library: mountLibrary(app), words: mountWords(app), lesson: mountLessonEditor(app) };
readShareLink();
show();
window.addEventListener("hashchange", () => { readShareLink(); show(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) player.stop(); });
window.addEventListener("pagehide", () => views.lesson.flush());

// Offline use and "Add to Home Screen": a service worker keeps a copy of the app.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* works without it */ });
}
