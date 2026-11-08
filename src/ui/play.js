// The Play screen: pick a pattern or song, set the tempo, play along.

import { resolve, duration, totalBeats, fmtTime, clampBpm, MIN_BPM, MAX_BPM } from "../core/timeline.js";
import { WORDS, fmtBeats } from "../core/words.js";
import { createDrum } from "../drum.js";
import { speak } from "../audio.js";
import { $, $$, esc, tokens, itemOptions } from "./render.js";

const FALLBACK = "pattern:b-don-doko";

export function mountPlay(app) {
  const els = {
    select: $("#itemSelect"), notes: $("#itemNotes"), info: $("#itemInfo"),
    bpmInput: $("#bpmInput"), bpmRange: $("#bpmRange"), bpmDown: $("#bpmDown"), bpmUp: $("#bpmUp"),
    bpmReset: $("#bpmReset"), tempoHint: $("#tempoHint"),
    playBtn: $("#playBtn"), sheet: $("#sheet"), status: $("#playStatus"),
    nowKana: $("#nowKana"), nowRo: $("#nowRo"), pulse: $$("#beatPulse i"),
    countIn: $("#optCountIn"), loop: $("#optLoop"), guide: $("#optGuide"), click: $("#optClick"), speak: $("#optSpeak"),
  };
  const drum = createDrum($("#playDrum"), { onTap: (hand, where) => app.freeHit(drum, hand, where) });

  let current = null; // {kind, item}
  let resolved = null;
  let mine = false; // the player is playing for this screen
  let round = 0;
  let lastSi = -1;

  const S = app.settings;
  const factor = () => S.bpm / current.item.bpm;

  function pick() {
    let [kind, id] = S.item.split(":");
    let item = app.lib().get(kind, id);
    if (!item) {
      [kind, id] = FALLBACK.split(":");
      item = app.lib().get(kind, id);
      S.item = FALLBACK;
      S.bpm = item.bpm;
    }
    current = { kind, item };
    resolved = resolve(kind, item, app.lib());
  }

  /** Re-read the library (after edits) and redraw everything. */
  function refresh() {
    if (mine) app.player.stop();
    pick();
    els.select.innerHTML = itemOptions(app.lib(), { selected: S.item });
    renderAll();
  }

  /** Select an item; its own tempo becomes the play tempo. */
  function choose(value) {
    if (mine) app.player.stop();
    S.item = value;
    pick();
    S.bpm = current.item.bpm;
    app.saveSettings();
    els.select.value = S.item;
    renderAll();
  }

  function renderAll() {
    renderInfo();
    renderSheet();
    renderTempo();
    setNow("", "");
    drum.setWord(current.kind === "song" ? "曲" : "");
    els.status.textContent = "";
  }

  function renderInfo() {
    els.notes.textContent = current.item.notes || "";
    els.notes.hidden = !current.item.notes;
  }

  function sectionMeta(sec) {
    const parts = [];
    if (current.kind === "song") parts.push(`× ${sec.repeats}`);
    parts.push(`${Math.round(clampBpm(sec.bpm * factor()))} bpm`);
    if (sec.pattern.swing) parts.push("swing");
    if (sec.pattern.drum === "shime") parts.push("small drum");
    return parts.join(" · ");
  }

  function renderSheet() {
    let html = "";
    if (resolved.problems.length) {
      html += `<div class="problems">${resolved.problems.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
    }
    html += resolved.sections.map((sec, si) => `
      <div class="sec" data-si="${si}">
        <div class="sec-head">
          ${current.kind === "song" ? `<span class="sec-num">${si + 1}</span>` : ""}
          <span class="sec-name">${esc(sec.name)}</span>
          <span class="sec-meta" data-meta="${si}">${esc(sectionMeta(sec))}</span>
          <span class="sec-rep" data-rep="${si}"></span>
        </div>
        <div class="sec-body">${tokens(sec.ids, { drum: sec.pattern.drum, attrs: (i) => `data-si="${si}" data-ti="${i}"` })}</div>
      </div>`).join("");
    els.sheet.innerHTML = html;
    renderLength();
  }

  function renderLength() {
    if (current.kind === "song") {
      const n = resolved.sections.length;
      els.info.textContent = n ? `${n} section${n === 1 ? "" : "s"} · ${fmtBeats(totalBeats(resolved))} beats · ${fmtTime(duration(resolved, factor()))}` : "";
    } else {
      const b = resolved.sections[0]?.beats || 0;
      const secs = b ? (b * 60) / S.bpm : 0;
      els.info.textContent = b ? `${fmtBeats(b)} beats · one round takes ${secs.toFixed(1)} s` : "";
    }
  }

  function renderTempo() {
    els.bpmInput.value = S.bpm;
    els.bpmRange.value = S.bpm;
    const own = current.item.bpm;
    els.bpmReset.textContent = `Reset to ${own}`;
    els.bpmReset.disabled = S.bpm === own;
    const hasOwnTempo = current.kind === "song" && current.item.sections.some((s) => s.bpm);
    els.tempoHint.textContent = hasOwnTempo
      ? `Song tempo is ${own}. Sections with their own tempo speed up or slow down by the same amount.`
      : "";
    els.tempoHint.hidden = !hasOwnTempo;
    $$("[data-meta]", els.sheet).forEach((el) => {
      const sec = resolved.sections[+el.dataset.meta];
      if (sec) el.textContent = sectionMeta(sec);
    });
    renderLength();
  }

  function setBpm(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return;
    S.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, n));
    app.saveSettings();
    renderTempo();
  }

  function setNow(kana, ro) {
    els.nowKana.textContent = kana;
    els.nowRo.textContent = ro;
  }

  function pulse(i) {
    els.pulse.forEach((d, k) => d.classList.toggle("on", k === i));
  }

  function inView(el) {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= (window.innerHeight || 0);
  }

  const handlers = {
    onCount(n) {
      setNow(String(n), n === 4 ? "go!" : "");
      drum.setWord(String(n));
      pulse(n - 1);
    },
    onBeat(ev) { pulse(ev.n % 4); },
    onToken(ev) {
      $$(".tok.now", els.sheet).forEach((e) => e.classList.remove("now"));
      const tok = els.sheet.querySelector(`.tok[data-si="${ev.si}"][data-ti="${ev.ti}"]`);
      tok?.classList.add("now");
      const w = WORDS[ev.id];
      setNow(w.kana, w.ro);
      drum.setWord(w.kana);
      if (ev.ti !== 0) return;
      if (ev.si === 0 && ev.rep === 0) round++;
      const sec = resolved.sections[ev.si];
      $$("[data-rep]", els.sheet).forEach((el) => { el.textContent = ""; });
      $$(".sec.playing", els.sheet).forEach((el) => el.classList.remove("playing"));
      const secEl = els.sheet.querySelector(`.sec[data-si="${ev.si}"]`);
      secEl?.classList.add("playing");
      const bpm = Math.round(clampBpm(sec.bpm * factor()));
      if (current.kind === "song") {
        const repEl = els.sheet.querySelector(`[data-rep="${ev.si}"]`);
        if (repEl) repEl.textContent = `${ev.rep + 1} / ${sec.repeats}`;
        els.status.textContent = `Section ${ev.si + 1} of ${resolved.sections.length} · repeat ${ev.rep + 1} of ${sec.repeats} · ${bpm} bpm${round > 1 ? ` · round ${round}` : ""}`;
      } else {
        els.status.textContent = `Round ${round} · ${bpm} bpm`;
      }
      if (ev.si !== lastSi && secEl && !inView(secEl)) {
        secEl.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
      lastSi = ev.si;
    },
    onHit(ev) { drum.hit(ev, { lead: true }); },
    onShout(ev) {
      drum.shout(ev.id);
      if (S.speak) speak(ev.id);
    },
    onStop() {
      mine = false;
      syncButton();
      pulse(-1);
      $$(".tok.now", els.sheet).forEach((e) => e.classList.remove("now"));
      $$(".sec.playing", els.sheet).forEach((e) => e.classList.remove("playing"));
      setNow("", "");
    },
  };

  function syncButton() {
    els.playBtn.innerHTML = mine
      ? `<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1" y="1" width="8" height="8" rx="1"></rect></svg>Stop`
      : `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 .5 9.5 5 1 9.5z"></path></svg>Play`;
    els.playBtn.classList.toggle("is-playing", mine);
  }

  function play() {
    round = 0;
    lastSi = -1;
    const ok = app.player.start(resolved, {
      factor,
      loop: () => S.loop,
      guide: () => S.guide,
      click: () => S.click,
      countIn: S.countIn,
    }, handlers);
    if (!ok) {
      els.status.textContent = "Nothing to play yet. Add words to this pattern in Patterns & songs.";
      return;
    }
    mine = true;
    syncButton();
  }

  function toggle() {
    if (mine) app.player.stop();
    else play();
  }

  // --- wiring ---
  els.select.addEventListener("change", () => choose(els.select.value));
  els.bpmInput.addEventListener("change", () => setBpm(els.bpmInput.value));
  els.bpmInput.addEventListener("keydown", (e) => { if (e.key === "Enter") setBpm(els.bpmInput.value); });
  els.bpmRange.addEventListener("input", () => setBpm(els.bpmRange.value));
  els.bpmDown.addEventListener("click", () => setBpm(S.bpm - 5));
  els.bpmUp.addEventListener("click", () => setBpm(S.bpm + 5));
  els.bpmReset.addEventListener("click", () => setBpm(current.item.bpm));
  els.playBtn.addEventListener("click", toggle);
  for (const k of ["countIn", "loop", "guide", "click", "speak"]) {
    els[k].checked = S[k];
    els[k].addEventListener("change", () => { S[k] = els[k].checked; app.saveSettings(); });
  }
  els.sheet.addEventListener("click", (e) => {
    const tok = e.target.closest(".tok");
    if (!tok || mine) return;
    const sec = resolved.sections[+tok.dataset.si];
    app.playWord(drum, sec.ids[+tok.dataset.ti], sec.pattern.drum);
  });

  refresh();
  syncButton();

  return { drum, refresh, choose, toggle, get playing() { return mine; } };
}
