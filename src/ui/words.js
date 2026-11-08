// The Words screen: every kuchi shōga word, what it means and how it looks.

import { WORDS, GROUPS, HAND_GRID } from "../core/words.js";
import { createDrum } from "../drum.js";
import { canSpeak, voiceClips } from "../audio.js";
import { $, $$, esc, strip } from "./render.js";
import { t } from "../i18n.js";

const KNOWN = [
  { id: "don", ro: "Don", kana: "ドン", verdict: "words.same", say: "known.don" },
  { id: "ka", ro: "Ka", kana: "カ", verdict: "words.same", say: "known.ka" },
  { id: "ka", ro: "Kat", kana: "カッ", verdict: "words.itsKa", say: "known.kat" },
  { id: "su", ro: "Su", kana: "ス", verdict: "words.same", say: "known.su" },
];

const GLOSSARY = [
  ["Bachi", "撥", "gloss.bachi"],
  ["Kamae", "構え", "gloss.kamae"],
  ["Kawa", "皮", "gloss.kawa"],
  ["Fuchi", "縁", "gloss.fuchi"],
  ["Dō", "胴", "gloss.do"],
  ["Byō", "鋲", "gloss.byo"],
  ["Nagadō-daiko", "長胴太鼓", "gloss.nagado"],
  ["Shime-daiko", "締太鼓", "gloss.shime"],
  ["Ōdaiko", "大太鼓", "gloss.odaiko"],
  ["Jiuchi", "地打ち", "gloss.jiuchi"],
  ["Kakegoe", "掛け声", "gloss.kakegoe"],
  ["Ma", "間", "gloss.ma"],
];

function handText(w) {
  if (w.group === "silence") return t("hand.restNone");
  if (w.group === "shout") return t("hand.shoutNone");
  const s = w.hits.map((h) => t(h.hand === "R" ? "hand.right" : "hand.left")).join(t("hand.then"));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function whereText(w) {
  if (w.group === "silence") return t("where.none");
  if (w.group === "shout") return t("where.shout");
  if (w.hits[0].where === "rim") return t("where.rim");
  return w.drum === "shime" ? t("where.smallDrum") : t("where.skin");
}

export function mountWords(app) {
  const drum = createDrum($("#wordsDrum"), { onTap: (hand, where) => app.freeHit(drum, hand, where) });
  let selected = "don";

  $("#known").innerHTML = KNOWN.map((k) => `
    <button type="button" class="known-card" data-id="${k.id}">
      <span class="k-verdict">${esc(t(k.verdict))}</span>
      <span class="k-top"><span class="k-ro">${k.ro}</span><span class="k-kana" lang="ja">${k.kana}</span></span>
      <span class="k-say">${esc(t(k.say))}</span>
    </button>`).join("");

  const chip = (id, pair) => `<button type="button" class="chip${pair ? " pair" : ""}" data-id="${id}" aria-label="${esc(WORDS[id].ro)}"><span class="ck" lang="ja">${WORDS[id].kana}</span><span class="cr">${esc(WORDS[id].ro)}</span>${strip(id)}</button>`;
  $("#handGrid").innerHTML = `<span></span><span class="hd R">${esc(t("words.rightHand"))}</span><span class="hd L">${esc(t("words.leftHand"))}</span><span class="hd">${esc(t("words.pair"))}</span>`
    + HAND_GRID.map((r) => `<span class="rl"><b>${r.label}</b><small>${r.sub}</small></span>${chip(r.R)}${chip(r.L)}${
      r.pair ? chip(r.pair, true) : `<span class="chip none">${esc(t("words.noPair"))}</span>`}`).join("");

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
          <span class="c-top"><span class="c-kana" lang="ja">${w.kana}</span>${known.has(id) ? `<span class="badge">${esc(t("words.youKnow"))}</span>` : ""}</span>
          <span class="c-ro">${esc(w.ro)}</span>
          <span class="c-mean">${esc(w.mean)}</span>
          ${w.also ? `<span class="c-alias">${esc(t("words.alsoWritten"))} <b>${esc(w.also)}</b></span>` : ""}
          <span class="c-strip">${strip(id)}</span>
        </button>`;
      }).join("")}</div>
    </div>`;
  }).join("");

  $("#glossary").innerHTML = GLOSSARY.map(([term, jp, d]) => `<div><dt>${term}<span lang="ja">${jp}</span></dt><dd>${esc(t(d))}</dd></div>`).join("");

  function select(id, play) {
    selected = id;
    const w = WORDS[id];
    $("#dKana").textContent = w.kana;
    $("#dRo").textContent = w.ro;
    $("#dMean").textContent = w.mean + (w.also ? t("words.alsoSentence", { also: w.also }) : "");
    $("#dStrip").innerHTML = strip(id, { big: true });
    $("#dFacts").innerHTML = [
      ["fact.hand", handText(w)], ["fact.where", whereText(w)], ["fact.size", w.size], ["fact.length", w.len], ["fact.say", w.say],
    ].map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join("");
    $("#dTip").textContent = w.tip;
    $$("#view-words .card").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.id === id)));
    if (play) app.playWord(drum, id);
    else drum.setWord(w.kana);
  }

  $("#dSay").hidden = !canSpeak;
  voiceClips.then((ids) => { if (ids.size) $("#dSay").hidden = false; });
  $("#dSay").addEventListener("click", () => app.synth.say(selected));
  $("#dPlay").addEventListener("click", () => app.playWord(drum, selected));
  $("#view-words").addEventListener("click", (e) => {
    const el = e.target.closest(".card, .chip[data-id], .known-card");
    if (el) select(el.dataset.id, true);
  });

  $("#all-h").textContent = t("words.allH", { n: Object.keys(WORDS).length });
  select("don", false);
  return { drum };
}
