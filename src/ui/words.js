// The Words screen: every kuchi shōga word, what it means and how it looks.

import { WORDS, GROUPS, HAND_GRID } from "../core/words.js";
import { createDrum } from "../drum.js";
import { speak, canSpeak } from "../audio.js";
import { $, $$, esc, strip } from "./render.js";

const KNOWN = [
  { id: "don", ro: "Don", kana: "ドン", verdict: "Same on a real drum", say: "A big hit in the middle." },
  { id: "ka", ro: "Ka", kana: "カ", verdict: "Same on a real drum", say: "A click on the rim." },
  { id: "ka", ro: "Kat", kana: "カッ", verdict: "It’s Ka", say: "The small ッ means: stop the sound short." },
  { id: "su", ro: "Su", kana: "ス", verdict: "Same on a real drum", say: "A rest: one beat of silence." },
];

const GLOSSARY = [
  ["Bachi", "撥", "The drumsticks."],
  ["Kamae", "構え", "The ready stance before you play."],
  ["Kawa", "皮", "The drum skin. Don, Do, Tsu and friends are played here."],
  ["Fuchi", "縁", "The rim. Ka and Ra are played here."],
  ["Dō", "胴", "The wooden body of the drum."],
  ["Byō", "鋲", "The rows of tacks that hold the skin on."],
  ["Nagadō-daiko", "長胴太鼓", "The barrel-shaped drum most beginners play."],
  ["Shime-daiko", "締太鼓", "The small, tightly tied, high-pitched drum."],
  ["Ōdaiko", "大太鼓", "The very big drum."],
  ["Jiuchi", "地打ち", "The steady base rhythm one player keeps under the song."],
  ["Kakegoe", "掛け声", "The shouts: Sore, Yoisho, Ha and the rest."],
  ["Ma", "間", "The space between sounds."],
];

function handText(w) {
  if (w.group === "silence") return "None. Stay ready";
  if (w.group === "shout") return "None. Use your voice";
  const t = w.hits.map((h) => (h.hand === "R" ? "right" : "left")).join(", then ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function whereText(w) {
  if (w.group === "silence") return "No hit";
  if (w.group === "shout") return "Out loud, usually in a rest";
  if (w.hits[0].where === "rim") return "Rim (the wooden edge)";
  return w.drum === "shime" ? "Middle of the small drum" : "Middle of the skin";
}

export function mountWords(app) {
  const drum = createDrum($("#wordsDrum"), { onTap: (hand, where) => app.freeHit(drum, hand, where) });
  let selected = "don";

  $("#known").innerHTML = KNOWN.map((k) => `
    <button type="button" class="known-card" data-id="${k.id}">
      <span class="k-verdict">${esc(k.verdict)}</span>
      <span class="k-top"><span class="k-ro">${k.ro}</span><span class="k-kana" lang="ja">${k.kana}</span></span>
      <span class="k-say">${esc(k.say)}</span>
    </button>`).join("");

  const chip = (id, pair) => `<button type="button" class="chip${pair ? " pair" : ""}" data-id="${id}" aria-label="${esc(WORDS[id].ro)}"><span class="ck" lang="ja">${WORDS[id].kana}</span><span class="cr">${esc(WORDS[id].ro)}</span>${strip(id)}</button>`;
  $("#handGrid").innerHTML = `<span></span><span class="hd">Right hand</span><span class="hd">Left hand</span><span class="hd">Pair, right first</span>`
    + HAND_GRID.map((r) => `<span class="rl"><b>${r.label}</b><small>${r.sub}</small></span>${chip(r.R)}${chip(r.L)}${
      r.pair ? chip(r.pair, true) : `<span class="chip none">No pair word. Just say Don Kon</span>`}`).join("");

  const known = new Set(["don", "ka", "su"]);
  $("#wordGroups").innerHTML = GROUPS.map((g) => {
    const ids = Object.keys(WORDS).filter((id) => WORDS[id].group === g.id);
    return `<div class="group">
      <div class="g-head">
        <div class="g-title"><i class="mk ${g.mark}"></i><h3>${g.title}</h3><span class="g-jp">${g.jp}</span></div>
        <p class="g-desc">${esc(g.desc)}</p>
      </div>
      <div class="cards">${ids.map((id) => {
        const w = WORDS[id];
        return `<button class="card" type="button" data-id="${id}" aria-pressed="false">
          <span class="c-top"><span class="c-kana" lang="ja">${w.kana}</span>${known.has(id) ? '<span class="badge">You know it</span>' : ""}</span>
          <span class="c-ro">${esc(w.ro)}</span>
          <span class="c-mean">${esc(w.mean)}</span>
          ${w.also ? `<span class="c-alias">Also written <b>${esc(w.also)}</b></span>` : ""}
          <span class="c-strip">${strip(id)}</span>
        </button>`;
      }).join("")}</div>
    </div>`;
  }).join("");

  $("#glossary").innerHTML = GLOSSARY.map(([t, jp, d]) => `<div><dt>${t}<span lang="ja">${jp}</span></dt><dd>${esc(d)}</dd></div>`).join("");

  function select(id, play) {
    selected = id;
    const w = WORDS[id];
    $("#dKana").textContent = w.kana;
    $("#dRo").textContent = w.ro;
    $("#dMean").textContent = w.mean + (w.also ? ` Also written ${w.also}.` : "");
    $("#dStrip").innerHTML = strip(id, { big: true });
    $("#dFacts").innerHTML = [
      ["Hand", handText(w)], ["Where", whereText(w)], ["Size", w.size], ["Length", w.len], ["Say it", w.say],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
    $("#dTip").textContent = w.tip;
    $$("#view-words .card").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.id === id)));
    if (play) app.playWord(drum, id);
    else drum.setWord(w.kana);
  }

  $("#dSay").hidden = !canSpeak;
  $("#dSay").addEventListener("click", () => speak(selected));
  $("#dPlay").addEventListener("click", () => app.playWord(drum, selected));
  $("#view-words").addEventListener("click", (e) => {
    const el = e.target.closest(".card, .chip[data-id], .known-card");
    if (el) select(el.dataset.id, true);
  });

  $("#all-h").textContent = `All ${Object.keys(WORDS).length} words`;
  select("don", false);
  return { drum };
}
