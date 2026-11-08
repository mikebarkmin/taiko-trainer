// Strikes on the video, like a rhythm game: a strip across the top of the
// video where upcoming strikes slide towards a target ring and burst there
// (with their kana) at the moment they are due. Your own taps flash on the
// ring, and in practice they get a timing verdict (early / late / perfect).
// The overlay is not mirrored with the video, so its text stays readable.

import { WORDS } from "../core/words.js";
import { strikeWord, lowerBound } from "../core/lessons.js";
import { esc } from "./render.js";
export { judge } from "../core/edit.js";
import { t } from "../i18n.js";

const AHEAD = 2.2; // seconds (real time) a strike is visible before it is due
const BEHIND = 0.25; // … and after, while it slides past the ring
const TARGET = 0.16; // where the ring sits, as a share of the strip's width
export function createOverlay() {
  const el = document.createElement("div");
  el.className = "ovl";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="ovl-strip"><div class="ovl-ring"></div><div class="ovl-notes"></div><div class="ovl-fx"></div></div>`;
  const strip = el.querySelector(".ovl-strip");
  const notesEl = el.querySelector(".ovl-notes");
  const fx = el.querySelector(".ovl-fx");

  let strikes = [];
  let shown = new Map(); // strike → element
  let last = null; // video time of the previous frame
  let visible = true;

  const noteHtml = (s) => {
    const w = WORDS[strikeWord(s)];
    return s.shout
      ? `<span class="ovl-note shout">${esc(w.ro)}</span>`
      : `<span class="ovl-note ${s.where} ${s.vol} ${s.hand}"><i lang="ja">${w.kana}</i><small>${esc(w.ro)}</small></span>`;
  };

  /** A short burst at the ring: the strike's kana pops up. */
  function burst(s) {
    const w = WORDS[strikeWord(s)];
    const b = document.createElement("span");
    b.className = `ovl-burst ${s.shout ? "shout" : `${s.hand} ${s.where}`}`;
    b.innerHTML = s.shout ? `<b>${esc(w.ro)}</b>` : `<b><span lang="ja">${w.kana}</span><small>${esc(w.ro)}</small></b>`;
    fx.append(b);
    setTimeout(() => b.remove(), 600);
  }

  return {
    el,
    /** Put the overlay over the video in `host` (call again after the video is rebuilt). */
    attach(host) {
      host.append(el);
    },
    setVisible(on) {
      visible = on;
      el.hidden = !on;
    },
    setStrikes(list) {
      strikes = list;
      for (const node of shown.values()) node.remove();
      shown = new Map();
    },
    /** Move everything to video time `vt`; `rate` is the playback speed. Bursts fire while playing. */
    setTime(vt, playing, rate = 1) {
      if (!visible) return;
      const width = strip.clientWidth || 1;
      const ring = width * TARGET;
      const pxPerSec = (width - ring) / (AHEAD * rate); // per second of video time
      const from = vt - BEHIND * rate;
      const to = vt + AHEAD * rate;
      const keep = new Set();
      for (let i = lowerBound(strikes, from), end = lowerBound(strikes, to); i < end; i++) {
        const s = strikes[i];
        keep.add(s);
        let node = shown.get(s);
        if (!node) {
          notesEl.insertAdjacentHTML("beforeend", noteHtml(s));
          node = notesEl.lastElementChild;
          shown.set(s, node);
        }
        const x = ring + (s.t - vt) * pxPerSec;
        node.style.transform = `translate(${x.toFixed(1)}px, -50%) translateX(-50%)`;
        node.classList.toggle("past", s.t < vt);
      }
      for (const [s, node] of shown) if (!keep.has(s)) { node.remove(); shown.delete(s); }
      // strikes that became due since the last frame burst on the ring
      if (playing && last !== null && vt > last && vt - last < 0.5) {
        for (let i = lowerBound(strikes, last), end = lowerBound(strikes, vt); i < end; i++) burst(strikes[i]);
      }
      last = vt;
    },
    /** Your own tap: a flash on the ring, and with `verdict` ({kind, ms}) a timing label. */
    tap(hand, where, verdict) {
      const f = document.createElement("span");
      f.className = `ovl-tap ${hand} ${where}`;
      fx.append(f);
      setTimeout(() => f.remove(), 350);
      if (!verdict) return;
      const v = document.createElement("span");
      v.className = `ovl-verdict ${verdict.kind}`;
      v.textContent = t(`ovl.${verdict.kind}`, { ms: Math.abs(verdict.ms) });
      fx.querySelector(".ovl-verdict")?.remove();
      fx.append(v);
      setTimeout(() => v.remove(), 900);
    },
  };
}
