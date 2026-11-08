// A horizontal timeline of strikes over video time, in three rows (shouts,
// rim, skin). Only the visible part is drawn, so long videos stay fast.
// Used read-only on the Play screen and editable in the strike editor.

import { WORDS } from "../core/words.js";
import { strikeWord, lowerBound, snapToGrid } from "../core/lessons.js";
import { fmtClock } from "../core/util.js";
import { esc } from "./render.js";
import { t } from "../i18n.js";

/** First index in sorted times `list` at or after `t`. */
function lowerBoundT(list, t) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export const ZOOM_MIN = 20;
export const ZOOM_MAX = 600;
const RULER = 22; // px: the time ruler along the top (drag it to scrub)
// y (px from the top of the lane) where each row ends: shout, rim, skin
const ROW_ENDS = [RULER + 40, RULER + 80, Infinity];
const ROWS = ["shout", "rim", "center"];

export function createLane(host, {
  editable = false, onSeek, onSelect, onDropStrike, onSelectSpan, onAddAt, onZoom, zoom: startZoom = 150,
} = {}) {
  host.innerHTML = `<div class="lane${editable ? " editable" : ""}">
    <div class="lane-labels" aria-hidden="true"><span>${esc(t("lane.shout"))}</span><span>${esc(t("lane.rim"))}</span><span>${esc(t("lane.skin"))}</span></div>
    <div class="lane-scroll"${editable ? "" : ' aria-hidden="true"'}>
      <div class="lane-inner">
        <div class="lane-ruler"></div>
        <svg class="lane-wave" hidden preserveAspectRatio="none" aria-hidden="true"><path></path></svg>
        <div class="lane-hits"></div>
        <div class="lane-range" hidden></div>
        <div class="lane-band" hidden></div>
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
  const bandEl = host.querySelector(".lane-band");
  const waveEl = host.querySelector(".lane-wave");
  const wavePath = waveEl.querySelector("path");
  const hitsEl = host.querySelector(".lane-hits");

  let strikes = [];
  let duration = 0;
  let zoom = startZoom; // pixels per second
  let selected = new Set(); // selected strike indices
  let grid = null; // { start, bpm } bar structure, or null
  let current = -1;
  let range = null;
  let drawn = null; // [from, to] seconds currently drawn
  let pending = false;
  let wave = null; // { env: Float32Array, rate } loudness outline of the soundtrack
  let hits = []; // times of drum hits found in the soundtrack
  let fresh = null; // a just-added strike, drawn with a short "pop"
  let freshTimer = 0;

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

    let th = "";
    if (grid) {
      // the lesson's bar structure: bar lines with numbers, beat marks between
      const spb = 60 / grid.bpm;
      const bar = spb * 4;
      for (let k = Math.floor((a - grid.start) / bar); grid.start + k * bar <= b; k++) {
        const barT = grid.start + k * bar;
        th += `<span class="tick bar" style="left:${(barT * zoom).toFixed(1)}px">${k >= 0 ? `<span>${k + 1}</span>` : ""}</span>`;
        if (zoom >= 40) for (let j = 1; j < 4; j++) {
          const t = barT + j * spb;
          if (t >= a && t <= b) th += `<span class="tick minor" style="left:${(t * zoom).toFixed(1)}px"></span>`;
        }
      }
    } else {
      const step = zoom >= 70 ? 1 : zoom >= 25 ? 5 : 10;
      for (let s = Math.floor(a / step) * step; s <= b; s += step) {
        th += `<span class="tick" style="left:${(s * zoom).toFixed(1)}px"><span>${fmtClock(s, 0)}</span></span>`;
        if (zoom >= 140 && step === 1) th += `<span class="tick minor" style="left:${((s + 0.5) * zoom).toFixed(1)}px"></span>`;
      }
    }
    ticks.innerHTML = th;
    drawWave(a, b);

    const showKana = zoom >= 100;
    const tag = editable ? "button" : "span";
    let mh = "";
    for (let i = lowerBound(strikes, a), end = lowerBound(strikes, b); i < end; i++) {
      const s = strikes[i];
      const w = WORDS[strikeWord(s)];
      const row = s.shout ? "shout" : s.where;
      const cls = `stk ${row}${s.shout ? "" : ` ${s.vol} ${s.hand}`}${selected.has(i) ? " sel" : ""}${i === current ? " cur" : ""}${s === fresh ? " new" : ""}`;
      const label = editable ? ` type="button" aria-label="${esc(t("lane.at", { word: w.ro, time: fmtClock(s.t, 2) }))}"` : "";
      mh += `<${tag} class="${cls}" data-i="${i}" style="left:${(s.t * zoom).toFixed(1)}px"${label}>${s.shout ? "!" : s.hand}${
        showKana ? `<i lang="ja">${w.kana}</i>` : ""}</${tag}>`;
    }
    marks.innerHTML = mh;
  }

  /** The soundtrack's loudness from a to b seconds, mirrored around the middle of the strike rows. */
  function drawWave(a, b) {
    waveEl.toggleAttribute("hidden", !wave); // an SVG element: no .hidden property
    if (!wave) { hitsEl.innerHTML = ""; return; }
    const { env, rate } = wave;
    const x0 = Math.floor(a * zoom);
    const x1 = Math.ceil(Math.min(b, env.length / rate) * zoom);
    const w = Math.max(1, x1 - x0);
    waveEl.style.left = `${x0}px`;
    waveEl.style.width = `${w}px`;
    waveEl.setAttribute("viewBox", `0 -1 ${w} 2`);
    let top = "";
    let bottom = "";
    for (let x = 0; x <= w; x += 2) {
      const i0 = Math.floor(((x0 + x) / zoom) * rate);
      const i1 = Math.max(i0 + 1, Math.floor(((x0 + x + 2) / zoom) * rate));
      let peak = 0;
      for (let i = i0; i < i1 && i < env.length; i++) if (env[i] > peak) peak = env[i];
      const v = Math.sqrt(Math.min(1, peak)).toFixed(3); // sqrt: soft hits stay visible
      top += `${x},${-v} `;
      bottom = `${x},${v} ${bottom}`;
    }
    wavePath.setAttribute("d", `M${top}${bottom}Z`);
    let hh = "";
    for (let i = lowerBoundT(hits, a), end = lowerBoundT(hits, b); i < end; i++) {
      hh += `<span class="hit" style="left:${(hits[i] * zoom).toFixed(1)}px"></span>`;
    }
    hitsEl.innerHTML = hh;
  }

  scroll.addEventListener("scroll", () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; draw(); });
  }, { passive: true });

  inner.addEventListener("click", (e) => {
    if (swallowClick) { swallowClick = false; return; } // that click just ended a drag or scrub
    const m = e.target.closest(".stk");
    if (m && editable) {
      onSelect?.(+m.dataset.i, e);
      return;
    }
    const r = inner.getBoundingClientRect();
    onSeek?.(Math.max(0, (e.clientX - r.left) / zoom));
  });

  const timeAt = (clientX) => Math.max(0, (clientX - inner.getBoundingClientRect().left) / zoom);
  const yIn = (clientY) => clientY - inner.getBoundingClientRect().top;

  // The ruler along the top scrubs: press and drag to move through the video.
  let scrub = null; // { t } latest scrub time, sent once per frame
  inner.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || yIn(e.clientY) > RULER || !onSeek) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // no rubber band from the ruler
    scrub = { t: timeAt(e.clientX), sent: false };
    inner.setPointerCapture?.(e.pointerId);
    onSeek(scrub.t);
    inner.classList.add("scrubbing");
  });
  inner.addEventListener("pointermove", (e) => {
    if (!scrub) return;
    scrub.t = timeAt(e.clientX);
    if (scrub.queued) return;
    scrub.queued = true;
    requestAnimationFrame(() => { if (!scrub) return; scrub.queued = false; onSeek(scrub.t); });
  });
  const endScrub = () => {
    if (!scrub) return;
    onSeek(scrub.t);
    scrub = null;
    swallowClick = true;
    inner.classList.remove("scrubbing");
  };
  inner.addEventListener("pointerup", endScrub);
  inner.addEventListener("pointercancel", endScrub);
  inner.addEventListener("lostpointercapture", endScrub);

  if (editable) {
    // Mouse wheel scrolls the timeline sideways; Ctrl/⌘ + wheel (or a
    // trackpad pinch) zooms around the pointer.
    scroll.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const x = e.clientX - scroll.getBoundingClientRect().left;
        const at = (scroll.scrollLeft + x) / zoom;
        const z = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * Math.exp(-e.deltaY * 0.0025))));
        if (z === zoom) return;
        zoom = z;
        layout();
        scroll.scrollLeft = at * zoom - x;
        onZoom?.(zoom);
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        scroll.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    // Double-click an empty spot in a row: add a strike right there.
    inner.addEventListener("dblclick", (e) => {
      if (e.target.closest(".stk")) return;
      const y = yIn(e.clientY);
      if (y <= RULER) return;
      onAddAt?.(timeAt(e.clientX), ROWS[ROW_ENDS.findIndex((end) => y < end)], e);
    });
  }

  // Editable: dragging a strike moves it in time; dragging over empty space
  // selects every strike in the span. A still press stays a click (select
  // resp. seek); after a real drag the follow-up click is swallowed.
  let drag = null; // { mark, i, x0, t0, t, moved }
  let band = null; // { x0, t0, a, b, active } — a/b span in seconds
  let swallowClick = false;
  if (editable) {
    inner.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const mark = e.target.closest(".stk");
      if (mark) {
        const i = +mark.dataset.i;
        if (!strikes[i]) return;
        e.preventDefault();
        swallowClick = false;
        drag = { mark, i, x0: e.clientX, t0: strikes[i].t, t: strikes[i].t, moved: false };
      } else if (e.pointerType !== "touch") {
        // touch is left free to scroll the timeline, mouse and pen select
        band = { x0: e.clientX, t0: (e.clientX - inner.getBoundingClientRect().left) / zoom, a: 0, b: 0, active: false };
      }
    });
    addEventListener("pointermove", (e) => {
      if (band) {
        const t = Math.max(0, (e.clientX - inner.getBoundingClientRect().left) / zoom);
        if (!band.active && Math.abs(e.clientX - band.x0) < 5) return;
        band.active = true;
        band.a = Math.min(band.t0, t);
        band.b = Math.max(band.t0, t);
        bandEl.hidden = false;
        bandEl.style.left = `${(band.a * zoom).toFixed(1)}px`;
        bandEl.style.width = `${Math.max(2, (band.b - band.a) * zoom).toFixed(1)}px`;
        for (const m of marks.children) {
          const s = strikes[+m.dataset.i];
          m.classList.toggle("pre", s.t >= band.a && s.t <= band.b);
        }
      }
      if (!drag) return;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x0) < 5) return;
        drag.moved = true;
        drag.mark.classList.add("drag");
      }
      drag.t = snapToGrid(grid, Math.max(0, drag.t0 + (e.clientX - drag.x0) / zoom));
      drag.mark.style.left = `${(drag.t * zoom).toFixed(1)}px`; // live preview; the data changes on drop
      // A strike from a multi-selection drags the whole group along, live:
      if (selected.has(drag.i) && selected.size > 1) {
        const dx = (drag.t - drag.t0) * zoom;
        for (const m of marks.children) {
          const j = +m.dataset.i;
          if (j !== drag.i && selected.has(j)) m.style.left = `${Math.max(0, strikes[j].t * zoom + dx).toFixed(1)}px`;
        }
      }
    });
    const clearBand = () => {
      band = null;
      bandEl.hidden = true;
      for (const m of marks.querySelectorAll(".pre")) m.classList.remove("pre");
    };
    addEventListener("pointerup", () => {
      if (band) {
        const b = band;
        clearBand();
        if (b.active) {
          swallowClick = true;
          onSelectSpan?.(b.a, b.b);
        }
        return;
      }
      drop(true);
    });
    addEventListener("pointercancel", () => { clearBand(); drop(false); });
    const drop = (commit) => {
      if (!drag) return;
      const { mark, i, t, moved } = drag;
      drag = null;
      for (const m of marks.querySelectorAll(".drag")) m.classList.remove("drag");
      if (commit && moved) {
        swallowClick = true;
        onDropStrike?.(i, Math.round(t * 1000) / 1000);
        return;
      }
      if (moved) draw(true); // aborted: put the previewed strikes back where they were
    };
  }

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
    /** Show the lesson's bar structure (bars + beats, snapping on drag), or null to hide it. */
    setGrid(g) {
      grid = g;
      drawn = null;
      draw();
    },
    setZoom(z) {
      z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
      const mid = (scroll.scrollLeft + scroll.clientWidth / 2) / zoom;
      zoom = z;
      layout();
      scroll.scrollLeft = mid * zoom - scroll.clientWidth / 2;
    },
    get zoom() { return zoom; },
    select(i) {
      selected = new Set(i >= 0 ? [i] : []);
      draw(true);
      if (i >= 0 && strikes[i]) reveal(strikes[i].t);
    },
    selectMany(list) {
      selected = new Set(list);
      draw(true);
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
    /** Show the soundtrack's loudness ({ env, rate }) and the hits found in it, or null to hide. */
    setWave(w, found = []) {
      wave = w;
      hits = w ? found : [];
      draw(true);
    },
    /** Give a just-added strike a short "pop" so taps are easy to see. */
    flash(strike) {
      fresh = strike;
      clearTimeout(freshTimer);
      draw(true);
      freshTimer = setTimeout(() => { fresh = null; }, 400);
    },
  };
}
