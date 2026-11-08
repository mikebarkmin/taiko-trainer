// Small shared rendering helpers.

import { WORDS, crossesBar } from "../core/words.js";

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * One word as a timing strip: one cell per half beat. A dot is a hit
 * (letter = hand, size = how big, round = skin, square = rim); a tail
 * means "let it ring"; dashes are a rest; gold is a shout.
 */
export function strip(id, { big = false, drum = "" } = {}) {
  const w = WORDS[id];
  const n = Math.round(w.beats * 2);
  const cls = `strip${big ? " big" : ""}`;
  if (w.group === "silence") return `<span class="${cls}" aria-hidden="true"><span class="cell rest" style="grid-column:span ${n}"></span></span>`;
  if (w.group === "shout") return `<span class="${cls}" aria-hidden="true"><span class="cell shout" style="grid-column:span ${n}">!</span></span>`;
  const small = (w.drum || drum) === "shime" ? " shime" : "";
  let html = "";
  let ringing = false;
  for (let c = 0; c < n; c++) {
    const h = w.hits.find((x) => Math.round(x.t * 2) === c);
    let inner = "";
    if (h) {
      inner = `<span class="dot ${h.where} ${h.vol}${small}">${h.hand}</span>`;
      ringing = h.ring === "long";
    } else if (ringing) {
      inner = `<span class="tail"></span>`;
      ringing = false;
    }
    html += `<span class="cell">${inner}</span>`;
  }
  return `<span class="${cls}" aria-hidden="true">${html}</span>`;
}

/** The little colored marker used on word buttons. */
export function markClass(id) {
  const w = WORDS[id];
  if (w.group === "rim") return "rim";
  if (w.group === "silence") return "rest";
  if (w.group === "shout") return "shout";
  return w.hits[0]?.vol === "small" ? "soft" : "";
}

/**
 * A row of words as tokens with bar lines every 4 beats.
 * `attrs(i)` adds data attributes to each token.
 */
export function tokens(ids, { drum = "", attrs = () => "", removable = false } = {}) {
  let html = "";
  let b = 0;
  ids.forEach((id, i) => {
    const w = WORDS[id];
    const prev = b;
    b += w.beats;
    html += `<span class="tok" ${attrs(i)}><span class="tok-kana" lang="ja">${w.kana}</span><span class="tok-ro">${esc(w.ro)}</span>${strip(id, { drum })}${
      removable ? `<button class="tok-x" type="button" data-remove="${i}" aria-label="Remove ${esc(w.ro)}">×</button>` : ""
    }</span>`;
    if (crossesBar(prev, b) && i < ids.length - 1) html += `<span class="bar" aria-hidden="true"></span>`;
  });
  return html;
}

/** Buttons for adding words, with line breaks where `order` has "|". */
export function palette(order) {
  return order.map((id) => {
    if (id === "|") return `<span class="pal-break"></span>`;
    const w = WORDS[id];
    return `<button class="pal" type="button" data-add="${id}" aria-label="Add ${esc(w.ro)}"><i class="mk ${markClass(id)}"></i><span class="pk" lang="ja">${w.kana}</span>${esc(w.ro)}</button>`;
  }).join("");
}

/** Pattern and song choices for a <select>, grouped. */
export function itemOptions(lib, { songs = true, lessons = songs, selected = "" } = {}) {
  const opt = (kind, item) => {
    const v = `${kind}:${item.id}`;
    return `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(item.name)}</option>`;
  };
  const group = (label, kind, items) => (items.length ? `<optgroup label="${esc(label)}">${items.map((i) => opt(kind, i)).join("")}</optgroup>` : "");
  let html = group("My patterns", "pattern", lib.patterns.filter((p) => !p.builtin));
  html += group("Common patterns", "pattern", lib.patterns.filter((p) => p.builtin));
  if (songs) {
    html += group("My songs", "song", lib.songs.filter((s) => !s.builtin));
    html += group("Example songs", "song", lib.songs.filter((s) => s.builtin));
  }
  if (lessons) html += group("Video lessons", "lesson", lib.lessons || []);
  return html;
}
