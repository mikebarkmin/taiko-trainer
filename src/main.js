import { WORDS } from "./core/words.js";
import { makeLibrary, decodeShare, importData } from "./core/library.js";
import { Synth, speak } from "./audio.js";
import { Player } from "./player.js";
import { loadCustom, saveCustom, loadSettings, saveSettings } from "./store.js";
import { mountPlay } from "./ui/play.js";
import { mountLibrary, summary } from "./ui/library.js";
import { mountWords } from "./ui/words.js";
import { $, $$ } from "./ui/render.js";

const synth = new Synth();
const player = new Player(synth);
const settings = loadSettings();
let custom = loadCustom();
let lib = makeLibrary(custom);
let views = {};
let active = "play";

const app = {
  synth,
  player,
  settings,
  lib: () => lib,
  custom: () => custom,
  saveSettings: () => saveSettings(settings),

  /** Replace the user's patterns and songs. Returns false if the browser refused to save. */
  setCustom(next) {
    custom = next;
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
const VIEWS = ["play", "library", "words"];

function show() {
  const name = location.hash.replace(/^#/, "").split("=")[0];
  active = VIEWS.includes(name) ? name : "play";
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== active;
  $$(".tabs a").forEach((a) => {
    if (a.dataset.tab === active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = `${{ play: "Play", library: "Patterns & songs", words: "Words" }[active]} · Taiko Trainer`;
}

// ---------- shared links ----------
function readShareLink() {
  const m = location.hash.match(/^#share=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  history.replaceState(null, "", `${location.pathname}${location.search}#library`);
  const banner = $("#banner");
  const textEl = $("#bannerText");
  let data;
  try {
    data = decodeShare(m[1]);
    importData({ patterns: [], songs: [] }, data); // validate only
  } catch {
    textEl.textContent = "This share link is damaged, so nothing was added. Ask for the link again.";
    $("#bannerAdd").hidden = true;
    banner.hidden = false;
    return;
  }
  const song = data.songs?.[0];
  const pattern = data.patterns?.[0];
  textEl.textContent = song
    ? `Someone shared the song “${String(song.name || "Untitled song").slice(0, 80)}” with you.`
    : `Someone shared the pattern “${String(pattern?.name || "Untitled pattern").slice(0, 80)}” with you.`;
  $("#bannerAdd").hidden = false;
  banner.hidden = false;
  $("#bannerAdd").onclick = () => {
    const { custom: next, added } = importData(custom, data);
    const ok = app.setCustom(next);
    textEl.textContent = `${summary(added)}${ok ? " You’ll find it below." : " This browser would not save it, though."}`;
    $("#bannerAdd").hidden = true;
  };
}
$("#bannerDismiss").addEventListener("click", () => { $("#banner").hidden = true; });

// ---------- keyboard ----------
document.addEventListener("keydown", (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
  const keys = { d: ["L", "rim"], f: ["L", "center"], j: ["R", "center"], k: ["R", "rim"] };
  const hit = keys[e.key.toLowerCase()];
  const drum = views[active]?.drum;
  if (hit && drum) {
    e.preventDefault();
    app.freeHit(drum, hit[0], hit[1]);
    return;
  }
  if (e.key === " " && active === "play" && !t?.closest?.("button, a, summary")) {
    e.preventDefault();
    views.play.toggle();
  }
});

// ---------- start ----------
views = { play: mountPlay(app), library: mountLibrary(app), words: mountWords(app) };
readShareLink();
show();
window.addEventListener("hashchange", () => { readShareLink(); show(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) player.stop(); });
