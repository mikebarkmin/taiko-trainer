import { WORDS } from "./core/words.js";
import { makeLibrary, importData } from "./core/library.js";
import { decodeShare } from "./core/share.js";
import { Synth } from "./audio.js";
import { Player } from "./player.js";
import { MicDrum } from "./mic.js";
import { loadCustom, saveCustom, loadSettings, saveSettings } from "./store.js";
import { mountPlay } from "./ui/play.js";
import { mountLibrary, summary } from "./ui/library.js";
import { mountWords } from "./ui/words.js";
import { mountLessonEditor } from "./ui/lesson-editor.js";
import { mountMicPanel } from "./ui/mic-panel.js";
import { $, $$ } from "./ui/render.js";
import { t, quote, lang, setLang, translatePage } from "./i18n.js";

// ---------- language ----------
// The page text is filled in before the screens are built. Switching
// language reloads the page, so every screen is rebuilt in the new one.
document.documentElement.lang = lang;
document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
translatePage();
for (const b of $$("#langSwitch [data-lang]")) {
  b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
  b.addEventListener("click", () => {
    if (b.dataset.lang === lang) return;
    setLang(b.dataset.lang, { save: true });
    views.lesson?.flush();
    location.reload();
  });
}

const synth = new Synth();
const player = new Player(synth);
const settings = loadSettings();
let custom = loadCustom();
let lib = makeLibrary(custom);
let views = {};
let active = "";

const app = {
  synth,
  mic: new MicDrum(synth, settings, () => saveSettings(settings)),
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
      synth.say(id);
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
const TITLES = { play: "title.play", library: "title.library", words: "title.words", lesson: "title.lesson" };

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
  document.title = `${t(TITLES[active])} · Taiko Trainer`;
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
    textEl.textContent = t("banner.damaged");
    addBtn.hidden = true;
    banner.hidden = false;
    return true;
  }
  const name = (item, fallback) => quote(String(item?.name || t(fallback)).slice(0, 80));
  const lesson = data.lessons?.[0];
  const song = data.songs?.[0];
  textEl.textContent = lesson
    ? t("banner.lesson", { name: name(lesson, "data.untitled") })
    : song
      ? t("banner.song", { name: name(song, "data.untitledSong") })
      : t("banner.pattern", { name: name(data.patterns?.[0], "data.untitledPattern") });
  addBtn.hidden = false;
  banner.hidden = false;
  addBtn.onclick = () => {
    const { custom: next, added } = importData(custom, data);
    const ok = app.setCustom(next);
    let message = summary(added) + t(ok ? "banner.found" : "banner.notSaved");
    if (added.lessons.some((l) => l.video?.type === "file")) message += t("banner.attach");
    textEl.textContent = message;
    addBtn.hidden = true;
  };
  return true;
}
$("#bannerDismiss").addEventListener("click", () => { $("#banner").hidden = true; });

// ---------- keyboard ----------
// Clicking an embedded YouTube player moves keyboard focus into its iframe,
// where this page no longer hears D F J K, Space or Backspace. Take focus
// straight back: the click itself still reaches YouTube's controls.
addEventListener("blur", () => setTimeout(() => {
  const f = document.activeElement;
  if (f?.tagName === "IFRAME" && f.closest(".video-box")) f.closest(".video-box").focus({ preventScroll: true });
}));
document.addEventListener("keydown", (e) => {
  const t = e.target;
  // Text-like fields keep their keys to themselves. Checkboxes and radios
  // do not: after toggling one, the strike keys must keep working (and
  // Space goes back to play/pause instead of re-toggling the checkbox).
  const box = t?.matches?.('input[type="checkbox"], input[type="radio"]');
  if (t?.closest?.("input, textarea, select, [contenteditable]") && !box) return;
  if (box) e.preventDefault(); // keep the browser from toggling with Space
  if (active === "lesson") { views.lesson.onKey(e); return; }
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const keys = { d: ["L", "rim"], f: ["L", "center"], j: ["R", "center"], k: ["R", "rim"] };
  const hit = keys[e.key.toLowerCase()];
  const drum = views[active]?.drum;
  if (hit && drum) {
    e.preventDefault();
    if (views[active].tap) views[active].tap(hit[0], hit[1]);
    else app.freeHit(drum, hit[0], hit[1]);
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

// ---------- a real drum (microphone) ----------
// Hits go to the screen in front: the editor records them, the Play
// screen shows them on its drum and judges them against a lesson video.
mountMicPanel($("#pvMic"), app);
app.mic.listen("hit", (h) => views[active]?.drumHit?.(h));
document.addEventListener("visibilitychange", () => { if (document.hidden) app.mic.stop(); });
readShareLink();
show();
window.addEventListener("hashchange", () => { readShareLink(); show(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) player.stop(); });
window.addEventListener("pagehide", () => views.lesson.flush());

// Offline use and "Add to Home Screen": a service worker keeps a copy of the app.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* works without it */ });
}
