// A horizontal timeline of strikes over video time, in three rows (shouts,
// rim, skin). Only the visible part is drawn, so long videos stay fast.
// Used read-only on the Play screen and editable in the strike editor.

import { WORDS } from "../core/words.js";
import { strikeWord, lowerBound } from "../core/lessons.js";
import { fmtClock } from "../core/util.js";
import { esc } from "./render.js";
import { t } from "../i18n.js";

export function createLane(host, { editable = false, onSeek, onSelect, zoom: startZoom = 150 } = {}) {
  host.innerHTML = `<div class="lane${editable ? " editable" : ""}">
    <div class="lane-labels" aria-hidden="true"><span>${esc(t("lane.shout"))}</span><span>${esc(t("lane.rim"))}</span><span>${esc(t("lane.skin"))}</span></div>
    <div class="lane-scroll"${editable ? "" : ' aria-hidden="true"'}>
      <div class="lane-inner">
        <div class="lane-range" hidden></div>
        <div class="lane-ticks"></div>
        <div class="lane-marks"></div>
        <div class="lane-head"></div>
      </div>
    </div>
  </div>`;
  const scroll = host.querySelector(".lane-scroll");
  const inner = host.querySelector(".lane-inner");
  const ticks = host.querySelector(".lane-ticks");
  const marks = host.querySelector(".lane-marks");
  const head = host.querySelector(".lane-head");
  const rangeEl = host.querySelector(".lane-range");

  let strikes = [];
  let duration = 0;
  let zoom = startZoom; // pixels per second
  let selected = -1;
  let current = -1;
  let range = null;
  let drawn = null; // [from, to] seconds currently drawn
  let pending = false;

  const total = () => Math.max(duration, (strikes.at(-1)?.t || 0) + 2, 5);

  function layout() {
    inner.style.width = `${Math.ceil(total() * zoom) + 40}px`;
    placeRange();
    drawn = null;
    draw();
  }

  function placeRange() {
    rangeEl.hidden = !range;
    if (range) {
      rangeEl.style.left = `${range.start * zoom}px`;
      rangeEl.style.width = `${Math.max(2, (range.end - range.start) * zoom)}px`;
    }
  }

  function draw(force = false) {
    const width = scroll.clientWidth || 600;
    const t0 = scroll.scrollLeft / zoom;
    const t1 = (scroll.scrollLeft + width) / zoom;
    if (!force && drawn && t0 >= drawn[0] && t1 <= drawn[1]) return;
    const pad = width / zoom;
    const a = Math.max(0, t0 - pad);
    const b = t1 + pad;
    drawn = [a, b];

    const step = zoom >= 70 ? 1 : zoom >= 25 ? 5 : 10;
    let th = "";
    for (let s = Math.floor(a / step) * step; s <= b; s += step) {
      th += `<span class="tick" style="left:${(s * zoom).toFixed(1)}px"><span>${fmtClock(s, 0)}</span></span>`;
      if (zoom >= 140 && step === 1) th += `<span class="tick minor" style="left:${((s + 0.5) * zoom).toFixed(1)}px"></span>`;
    }
    ticks.innerHTML = th;

    const showKana = zoom >= 100;
    const tag = editable ? "button" : "span";
    let mh = "";
    for (let i = lowerBound(strikes, a), end = lowerBound(strikes, b); i < end; i++) {
      const s = strikes[i];
      const w = WORDS[strikeWord(s)];
      const row = s.shout ? "shout" : s.where;
      const cls = `stk ${row}${s.shout ? "" : ` ${s.vol} ${s.hand}`}${i === selected ? " sel" : ""}${i === current ? " cur" : ""}`;
      const label = editable ? ` type="button" aria-label="${esc(t("lane.at", { word: w.ro, time: fmtClock(s.t, 2) }))}"` : "";
      mh += `<${tag} class="${cls}" data-i="${i}" style="left:${(s.t * zoom).toFixed(1)}px"${label}>${s.shout ? "!" : s.hand}${
        showKana ? `<i lang="ja">${w.kana}</i>` : ""}</${tag}>`;
    }
    marks.innerHTML = mh;
  }

  scroll.addEventListener("scroll", () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; draw(); });
  }, { passive: true });

  inner.addEventListener("click", (e) => {
    const m = e.target.closest(".stk");
    if (m && editable) { onSelect?.(+m.dataset.i); return; }
    const r = inner.getBoundingClientRect();
    onSeek?.(Math.max(0, (e.clientX - r.left) / zoom));
  });

  if (globalThis.ResizeObserver) new ResizeObserver(() => draw(true)).observe(scroll);

  function reveal(t) {
    const x = t * zoom;
    const w = scroll.clientWidth;
    if (x < scroll.scrollLeft + 30 || x > scroll.scrollLeft + w - 30) scroll.scrollLeft = x - w * 0.3;
  }

  return {
    setStrikes(list) {
      strikes = list;
      current = -1;
      layout();
    },
    setDuration(d) {
      duration = Number(d) || 0;
      layout();
    },
    setZoom(z) {
      const mid = (scroll.scrollLeft + scroll.clientWidth / 2) / zoom;
      zoom = z;
      layout();
      scroll.scrollLeft = mid * zoom - scroll.clientWidth / 2;
    },
    get zoom() { return zoom; },
    select(i) {
      selected = i;
      draw(true);
      if (i >= 0 && strikes[i]) reveal(strikes[i].t);
    },
    setRange(r) {
      range = r;
      placeRange();
    },
    /** Move the playhead; `follow` scrolls so the playhead stays in view. */
    setTime(t, follow = false) {
      head.style.transform = `translateX(${(t * zoom).toFixed(1)}px)`;
      const c = lowerBound(strikes, t + 0.001) - 1;
      if (c !== current) {
        marks.querySelector(".cur")?.classList.remove("cur");
        current = c;
        marks.querySelector(`[data-i="${c}"]`)?.classList.add("cur");
      }
      if (follow) {
        const target = t * zoom - scroll.clientWidth * 0.3;
        if (Math.abs(scroll.scrollLeft - target) > 1) scroll.scrollLeft = target;
      }
    },
    reveal,
  };
}
