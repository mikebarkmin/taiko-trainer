// The strike editor: pick a video, then tap along (or type in a pattern) to
// mark every strike at its time in the video. Changes save automatically.

import { WORDS } from "../core/words.js";
import {
  normalizeLesson, strikeWord, strikeHit, mergeStrikes, shiftStrikes, patternStrikes,
  sourceFromLink, describeVideo,
} from "../core/lessons.js";
import { fmtClock, parseClock } from "../core/util.js";
import { putVideo, getVideo, hasVideo } from "../videostore.js";
import { html5Media, youtubeMedia } from "../media.js";
import { VideoSync } from "../videosync.js";
import { createLane } from "./lane.js";
import { $, $$, esc, itemOptions } from "./render.js";

const SPEEDS = [0.25, 0.5, 0.75, 1];
const SHOUT_IDS = Object.keys(WORDS).filter((id) => WORDS[id].group === "shout");
const UNDO_LIMIT = 100;
const round3 = (t) => Math.round(t * 1000) / 1000;

const PADS = [
  { hand: "L", where: "rim", key: "D", side: "Left rim" },
  { hand: "L", where: "center", key: "F", side: "Left skin" },
  { hand: "R", where: "center", key: "J", side: "Right skin" },
  { hand: "R", where: "rim", key: "K", side: "Right rim" },
];

const TEMPLATE = `
  <div class="le-top">
    <a class="btn small ghost" href="#library">← Patterns &amp; songs</a>
    <div class="field grow"><label for="leName">Lesson name</label><input id="leName" type="text" maxlength="80" autocomplete="off"></div>
    <span class="msg" id="leSaved" role="status"></span>
  </div>
  <p class="notice err" id="leMissing" hidden></p>

  <div class="le-grid" id="leBody">
    <section class="le-video" aria-label="Video">
      <div class="media-host" id="leMedia"></div>
      <div class="le-source" id="leSource">
        <p class="le-source-title" id="leSourceTitle">Pick the video to mark strikes on</p>
        <div class="row">
          <label class="btn primary small" for="leFile">Choose a video file</label>
          <input id="leFile" type="file" accept="video/*" class="sr-only">
          <span class="hint">or</span>
          <div class="link-row">
            <input id="leLink" type="url" inputmode="url" autocomplete="off" placeholder="Paste a YouTube or video link" aria-label="Video link">
            <button type="button" class="btn small" id="leUseLink">Use link</button>
          </div>
        </div>
        <p class="hint">A video file stays on this device. A YouTube link also works for anyone you share the lesson with.</p>
      </div>
      <div class="le-transport">
        <button type="button" class="btn primary" id="lePlay">Play</button>
        <div class="seek-btns" role="group" aria-label="Move in the video">
          <button type="button" class="icon-btn wide" data-seek="-1">−1 s</button>
          <button type="button" class="icon-btn wide" data-seek="-0.1">−0.1</button>
          <button type="button" class="icon-btn wide" data-seek="0.1">+0.1</button>
          <button type="button" class="icon-btn wide" data-seek="1">+1 s</button>
        </div>
        <span class="clock" id="leClock">0:00.0</span>
        <label class="mini" for="leSpeed">Speed
          <select id="leSpeed">${SPEEDS.map((r) => `<option value="${r}"${r === 1 ? " selected" : ""}>${r}×</option>`).join("")}</select>
        </label>
        <label class="check" for="leHear"><input type="checkbox" id="leHear" checked> Hear strikes</label>
        <button type="button" class="btn small ghost" id="leChange">Change video</button>
      </div>
    </section>

    <section class="le-side" aria-labelledby="leAddH">
      <h2 id="leAddH">Add strikes</h2>
      <p class="hint">Play the video and tap along: each tap adds a strike at the video’s time. Slow the video down for fast parts, or pause and tap to place one exactly.</p>
      <div class="pads" id="lePads">
        ${PADS.map((p) => `<button type="button" class="pad ${p.where}" data-hand="${p.hand}" data-where="${p.where}">
          <b class="pad-word"></b><span>${p.side}</span><kbd>${p.key}</kbd></button>`).join("")}
      </div>
      <div class="seg-row">
        <span class="lbl" id="leSizeLbl">Size</span>
        <div class="seg" role="group" aria-labelledby="leSizeLbl" id="leSize">
          <button type="button" data-size="big" aria-pressed="true">Big</button>
          <button type="button" data-size="medium" aria-pressed="false">Medium</button>
          <button type="button" data-size="small" aria-pressed="false">Small</button>
        </div>
      </div>
      <div class="row shout-row">
        <label class="mini" for="leShout">Shout
          <select id="leShout">${SHOUT_IDS.map((id) => `<option value="${id}">${esc(WORDS[id].ro)}</option>`).join("")}</select>
        </label>
        <button type="button" class="btn small" id="leAddShout">Add shout here</button>
      </div>
      <div class="row tools">
        <button type="button" class="btn small" id="leUndo">Undo</button>
        <button type="button" class="btn small" id="leRedo">Redo</button>
      </div>

      <details class="le-more">
        <summary>Move all strikes</summary>
        <p class="hint">If your taps landed a little late or early everywhere, move them all at once.</p>
        <div class="row">
          <button type="button" class="btn small" data-shift="-0.05">−50 ms</button>
          <button type="button" class="btn small" data-shift="-0.01">−10 ms</button>
          <button type="button" class="btn small" data-shift="0.01">+10 ms</button>
          <button type="button" class="btn small" data-shift="0.05">+50 ms</button>
        </div>
      </details>

      <details class="le-more">
        <summary>Add a whole pattern</summary>
        <p class="hint">For a steady part of the video: pick the pattern, find where it starts, and set the tempo.</p>
        <div class="field"><label for="leInsPattern">Pattern</label><select id="leInsPattern"></select></div>
        <div class="row">
          <div class="field small"><label for="leInsStart">Starts at</label><input id="leInsStart" type="text" inputmode="decimal" value="0:00.0"></div>
          <button type="button" class="btn small" data-now="leInsStart">Video time</button>
        </div>
        <div class="row">
          <div class="field small"><label for="leInsBpm">Tempo (bpm)</label><input id="leInsBpm" type="number" min="30" max="240" inputmode="numeric"></div>
          <div class="field small"><label for="leInsRepeats">Times</label><input id="leInsRepeats" type="number" min="1" max="99" value="4" inputmode="numeric"></div>
        </div>
        <button type="button" class="btn small primary" id="leInsert">Add pattern</button>
      </details>

      <details class="le-more">
        <summary>Delete many strikes</summary>
        <div class="row">
          <div class="field small"><label for="leDelFrom">From</label><input id="leDelFrom" type="text" inputmode="decimal" value="0:00.0"></div>
          <button type="button" class="btn small" data-now="leDelFrom">Video time</button>
        </div>
        <div class="row">
          <div class="field small"><label for="leDelTo">To</label><input id="leDelTo" type="text" inputmode="decimal" value="0:00.0"></div>
          <button type="button" class="btn small" data-now="leDelTo">Video time</button>
        </div>
        <div class="row">
          <button type="button" class="btn small" id="leDelRange">Delete these</button>
          <button type="button" class="btn small ghost" id="leClear">Delete all strikes</button>
        </div>
      </details>
      <p class="msg" id="leMsg" role="status"></p>
    </section>
  </div>

  <section class="le-lane" id="leLaneBox" aria-labelledby="leLaneH">
    <div class="le-lane-head">
      <h2 id="leLaneH">Timeline</h2>
      <span class="meta" id="leCount"></span>
      <label class="mini zoom" for="leZoom">Zoom <input type="range" id="leZoom" min="40" max="400" step="10" value="150"></label>
    </div>
    <div id="leLane"></div>
    <p class="hint">Tap the timeline to jump there. Tap a strike to change it.</p>
  </section>

  <section class="le-selected" id="leSelected" aria-label="Selected strike"></section>

  <div class="field le-notes"><label for="leNotes">Notes for the player</label><textarea id="leNotes" rows="2" maxlength="500" placeholder="What to watch for"></textarea></div>
`;

export function mountLessonEditor(app) {
  const root = $("#view-lesson");
  root.innerHTML = TEMPLATE;
  const el = (id) => $(`#${id}`, root);
  const els = {
    name: el("leName"), saved: el("leSaved"), missing: el("leMissing"), body: el("leBody"),
    mediaHost: el("leMedia"), source: el("leSource"), sourceTitle: el("leSourceTitle"), file: el("leFile"),
    link: el("leLink"), useLink: el("leUseLink"), play: el("lePlay"), clock: el("leClock"), speed: el("leSpeed"),
    hear: el("leHear"), change: el("leChange"), pads: el("lePads"), size: el("leSize"), shout: el("leShout"),
    addShout: el("leAddShout"), undo: el("leUndo"), redo: el("leRedo"), msg: el("leMsg"), count: el("leCount"),
    zoom: el("leZoom"), selected: el("leSelected"), notes: el("leNotes"), insPattern: el("leInsPattern"),
    insStart: el("leInsStart"), insBpm: el("leInsBpm"), insRepeats: el("leInsRepeats"), laneBox: el("leLaneBox"),
  };

  const sync = new VideoSync(app.synth);
  const lane = createLane(el("leLane"), {
    editable: true,
    onSeek: (t) => { if (media) { media.seek(t); lane.setTime(t); } },
    onSelect: (i) => select(lesson.strikes[i]),
  });

  let lesson = null;
  let media = null;
  let token = 0;
  let selected = null; // the selected strike object
  let size = "big";
  let undo = [];
  let redo = [];
  let saveTimer = 0;
  let raf = 0;
  let showSource = false;

  // ---------- open / close ----------
  function open(id) {
    const found = app.lib().lesson(id);
    els.missing.hidden = !!found;
    els.body.hidden = !found;
    els.laneBox.hidden = !found;
    els.selected.hidden = !found;
    if (!found) {
      els.missing.textContent = "This video lesson doesn’t exist on this device. It may have been deleted.";
      return;
    }
    if (lesson && lesson.id === id) { startLoop(); return; }
    flush();
    lesson = structuredClone(found);
    undo = [];
    redo = [];
    selected = null;
    showSource = !lesson.video;
    els.name.value = lesson.name;
    els.notes.value = lesson.notes;
    els.msg.textContent = "";
    els.saved.textContent = "";
    els.insPattern.innerHTML = itemOptions(app.lib(), { songs: false, lessons: false });
    syncInsertBpm();
    lane.setStrikes(lesson.strikes);
    lane.select(-1);
    renderAll();
    mountMedia();
    startLoop();
  }

  function close() {
    flush();
    stopLoop();
    teardown();
    lesson = null;
  }

  function teardown() {
    token++;
    sync.detach();
    media?.destroy();
    media = null;
  }

  // ---------- video ----------
  async function mountMedia(blobOverride) {
    const my = ++token;
    sync.detach();
    media?.destroy();
    media = null;
    const v = lesson.video;
    renderSource();
    if (!v) { els.mediaHost.innerHTML = `<div class="video-empty">No video yet</div>`; return; }
    let src = blobOverride || null;
    if (v.type === "file" && !src) {
      src = await getVideo(lesson.id);
      if (my !== token) return;
      if (!src) {
        els.mediaHost.innerHTML = `<div class="video-empty">The video file isn’t on this device</div>`;
        showSource = true;
        renderSource();
        return;
      }
    }
    els.mediaHost.innerHTML = `<div class="video-empty">Loading video…</div>`;
    try {
      const onState = () => renderTransport();
      media = v.type === "youtube" ? youtubeMedia(els.mediaHost, v.videoId, { onState }) : html5Media(els.mediaHost, src || v.url, { onState });
      await media.ready;
      if (my !== token) return;
      media.setRate(Number(els.speed.value));
      const d = media.duration;
      lane.setDuration(d || v.duration || 0);
      if (v.type === "file" && d && Math.abs((v.duration || 0) - d) > 0.25) { lesson.video.duration = Math.round(d * 1000) / 1000; scheduleSave(); }
      sync.attach(media, lesson.strikes, { guide: () => els.hear.checked, loop: () => false, range: () => null }, {});
      renderTransport();
    } catch (err) {
      if (my !== token) return;
      els.mediaHost.innerHTML = `<div class="video-empty err">${esc(err.message || "The video couldn’t be loaded.")}</div>`;
      media = null;
      showSource = true;
      renderSource();
    }
  }

  function renderSource() {
    const v = lesson.video;
    els.source.hidden = !showSource;
    els.change.hidden = showSource || !v;
    if (v?.type === "file" && !hasVideo(lesson.id)) {
      els.sourceTitle.textContent = `Attach the video file “${v.name || "video"}” to see this lesson’s video on this device.`;
    } else {
      els.sourceTitle.textContent = v ? `Now: ${describeVideo(v)}. Pick a different video:` : "Pick the video to mark strikes on";
    }
  }

  async function useFile(file) {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|m4v|mov|webm|ogv|mkv|3gp)$/i.test(file.name)) {
      say("That doesn’t look like a video file.", true);
      return;
    }
    const old = lesson.video;
    let note = "";
    if (old?.type === "file" && old.size && old.size !== file.size) note = " This file isn’t the same size as the original, so check that the strikes still line up.";
    else if (old && lesson.strikes.length) note = " The strikes stayed where they were. Use “Move all strikes” if the new video starts at a different time.";
    const stored = await putVideo(lesson.id, file);
    lesson.video = { type: "file", name: file.name, size: file.size, mime: file.type, duration: old?.type === "file" ? old.duration : 0 };
    showSource = false;
    saveNow();
    say((stored ? "Video saved on this device." : "This browser wouldn’t save the video, so it plays only until you close the page.") + note, !stored);
    mountMedia(file);
  }

  function useLink() {
    const source = sourceFromLink(els.link.value);
    if (!source) { say("Paste a YouTube link or a link to a video file (starting with https://).", true); return; }
    lesson.video = source;
    showSource = false;
    els.link.value = "";
    saveNow();
    say(source.type === "youtube" ? "YouTube video added." : "Video link added.");
    mountMedia();
  }

  // ---------- strikes ----------
  function commit(next, message) {
    undo.push(lesson.strikes);
    if (undo.length > UNDO_LIMIT) undo.shift();
    redo = [];
    lesson.strikes = next;
    changed();
    if (message) say(message);
  }

  function changed() {
    if (selected && !lesson.strikes.includes(selected)) selected = null;
    lane.setStrikes(lesson.strikes);
    lane.select(selected ? lesson.strikes.indexOf(selected) : -1);
    sync.setStrikes(lesson.strikes);
    renderAll();
    scheduleSave();
  }

  function now() {
    return media ? round3(media.time) : null;
  }

  function addStrike(hand, where) {
    const t = now();
    if (t === null) { say("Add a video first.", true); return; }
    const s = { t, hand, where, vol: size };
    commit(mergeStrikes(lesson.strikes, [s]));
    app.synth.ensure();
    app.synth.hit(strikeHit(s), app.synth.now() + 0.005);
    flashPad(hand, where);
  }

  function addShout() {
    const t = now();
    if (t === null) { say("Add a video first.", true); return; }
    commit(mergeStrikes(lesson.strikes, [{ t, shout: els.shout.value }]));
  }

  function flashPad(hand, where) {
    const pad = $(`.pad[data-hand="${hand}"][data-where="${where}"]`, els.pads);
    pad?.animate?.([{ transform: "scale(.94)" }, { transform: "scale(1)" }], { duration: 140 });
  }

  function select(strike) {
    selected = strike || null;
    lane.select(selected ? lesson.strikes.indexOf(selected) : -1);
    renderSelected();
  }

  function replaceSelected(changes) {
    if (!selected) return;
    const updated = { ...selected, ...changes };
    if (updated.t !== undefined) updated.t = round3(Math.max(0, updated.t));
    const next = lesson.strikes.filter((s) => s !== selected).concat(updated).sort((a, b) => a.t - b.t);
    selected = updated;
    commit(next);
  }

  function deleteSelected() {
    if (!selected) return;
    const i = lesson.strikes.indexOf(selected);
    const next = lesson.strikes.filter((s) => s !== selected);
    selected = next[Math.min(i, next.length - 1)] || null;
    commit(next);
  }

  function doUndo() {
    if (!undo.length) return;
    redo.push(lesson.strikes);
    lesson.strikes = undo.pop();
    changed();
  }

  function doRedo() {
    if (!redo.length) return;
    undo.push(lesson.strikes);
    lesson.strikes = redo.pop();
    changed();
  }

  // ---------- rendering ----------
  function renderAll() {
    renderPads();
    renderSelected();
    const n = lesson.strikes.length;
    els.count.textContent = `${n} strike${n === 1 ? "" : "s"}`;
    els.undo.disabled = !undo.length;
    els.redo.disabled = !redo.length;
  }

  function renderPads() {
    for (const pad of $$(".pad", els.pads)) {
      const w = WORDS[strikeWord({ hand: pad.dataset.hand, where: pad.dataset.where, vol: size })];
      pad.querySelector(".pad-word").innerHTML = `<span lang="ja">${w.kana}</span> ${esc(w.ro)}`;
    }
    for (const b of $$("[data-size]", els.size)) b.setAttribute("aria-pressed", String(b.dataset.size === size));
  }

  function seg(name, options, value) {
    return `<div class="seg" role="group" aria-label="${name}">${options.map(([v, label]) =>
      `<button type="button" data-set="${name}" data-value="${v}" aria-pressed="${v === value}">${label}</button>`).join("")}</div>`;
  }

  function renderSelected() {
    if (!selected) {
      els.selected.innerHTML = `<p class="hint">Tap a strike on the timeline to change or delete it. With a strike selected, ← and → move it by 10 ms.</p>`;
      return;
    }
    const i = lesson.strikes.indexOf(selected);
    const w = WORDS[strikeWord(selected)];
    els.selected.innerHTML = `
      <div class="sel-head">
        <span class="sel-kana" lang="ja">${w.kana}</span><b>${esc(w.ro)}</b>
        <span class="meta">Strike ${i + 1} of ${lesson.strikes.length} · ${fmtClock(selected.t, 2)}</span>
      </div>
      <div class="row">
        <div class="field small"><label for="selTime">Time (seconds)</label>
          <input id="selTime" type="number" step="0.001" min="0" inputmode="decimal" value="${selected.t.toFixed(3)}"></div>
        <div class="row tight">
          <button type="button" class="btn small" data-nudge="-0.01">−10 ms</button>
          <button type="button" class="btn small" data-nudge="0.01">+10 ms</button>
          <button type="button" class="btn small" data-go>Play from just before</button>
        </div>
      </div>
      ${selected.shout
        ? `<label class="mini" for="selShout">Shout <select id="selShout">${SHOUT_IDS.map((id) => `<option value="${id}"${id === selected.shout ? " selected" : ""}>${esc(WORDS[id].ro)}</option>`).join("")}</select></label>`
        : `<div class="seg-row">${seg("Hand", [["R", "Right"], ["L", "Left"]], selected.hand)}${seg("Where", [["center", "Skin"], ["rim", "Rim"]], selected.where)}${seg("Size", [["big", "Big"], ["medium", "Medium"], ["small", "Small"]], selected.vol)}</div>`}
      <div class="row"><button type="button" class="btn small ghost" data-delete>Delete strike</button></div>`;
  }

  function renderTransport() {
    if (!lesson) return;
    const playing = media && !media.paused;
    els.play.textContent = playing ? "Pause" : "Play";
    els.play.classList.toggle("is-playing", !!playing);
    els.play.disabled = !media;
  }

  function startLoop() {
    cancelAnimationFrame(raf);
    const frame = () => {
      if (media) {
        const t = media.time;
        els.clock.textContent = `${fmtClock(t, 1)} / ${fmtClock(media.duration || lesson?.video?.duration || 0, 1)}`;
        lane.setTime(t, !media.paused);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
  }

  function say(textValue, error = false) {
    els.msg.textContent = textValue;
    els.msg.classList.toggle("err", error);
  }

  // ---------- saving ----------
  function scheduleSave() {
    clearTimeout(saveTimer);
    els.saved.textContent = "Saving…";
    saveTimer = setTimeout(saveNow, 400);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (!lesson) return;
    lesson.name = els.name.value;
    lesson.notes = els.notes.value;
    const clean = normalizeLesson(lesson);
    const c = app.custom();
    const lessons = c.lessons.some((l) => l.id === clean.id)
      ? c.lessons.map((l) => (l.id === clean.id ? clean : l))
      : c.lessons.concat(clean);
    const ok = app.setCustom({ ...c, lessons });
    els.saved.textContent = ok ? "Saved" : "Not saved: this browser’s storage is full or blocked";
    els.saved.classList.toggle("err", !ok);
  }

  function flush() {
    if (saveTimer) saveNow();
  }

  function syncInsertBpm() {
    const p = app.lib().pattern(els.insPattern.value.replace(/^pattern:/, ""));
    if (p) els.insBpm.value = p.bpm;
  }

  // ---------- events ----------
  els.name.addEventListener("input", scheduleSave);
  els.notes.addEventListener("input", scheduleSave);
  els.file.addEventListener("change", () => { const f = els.file.files?.[0]; els.file.value = ""; useFile(f); });
  els.useLink.addEventListener("click", useLink);
  els.link.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); useLink(); } });
  els.change.addEventListener("click", () => { showSource = true; renderSource(); });
  els.play.addEventListener("click", () => {
    if (!media) return;
    app.synth.ensure();
    if (media.paused) media.play()?.catch?.(() => say("Tap the video itself to start it.", true));
    else media.pause();
  });
  els.speed.addEventListener("change", () => media?.setRate(Number(els.speed.value)));
  els.zoom.addEventListener("input", () => lane.setZoom(Number(els.zoom.value)));

  root.addEventListener("click", (e) => {
    const t = e.target;
    const seek = t.closest("[data-seek]");
    if (seek && media) { media.seek(media.time + Number(seek.dataset.seek)); return; }
    const sizeBtn = t.closest("[data-size]");
    if (sizeBtn) { size = sizeBtn.dataset.size; renderPads(); return; }
    const pad = t.closest(".pad");
    if (pad && e.detail === 0) { addStrike(pad.dataset.hand, pad.dataset.where); return; } // keyboard activation
    const shift = t.closest("[data-shift]");
    if (shift) {
      if (!lesson.strikes.length) return;
      commit(shiftStrikes(lesson.strikes, Number(shift.dataset.shift)), `Moved all strikes by ${Math.round(Number(shift.dataset.shift) * 1000)} ms.`);
      return;
    }
    const nowBtn = t.closest("[data-now]");
    if (nowBtn) { if (media) el(nowBtn.dataset.now).value = fmtClock(media.time, 2); return; }
    const set = t.closest("[data-set]");
    if (set && selected) {
      const key = { Hand: "hand", Where: "where", Size: "vol" }[set.dataset.set];
      replaceSelected({ [key]: set.dataset.value });
      return;
    }
    const nudge = t.closest("[data-nudge]");
    if (nudge && selected) { replaceSelected({ t: selected.t + Number(nudge.dataset.nudge) }); return; }
    if (t.closest("[data-go]") && selected && media) {
      media.seek(Math.max(0, selected.t - 1.5));
      media.play()?.catch?.(() => {});
      return;
    }
    if (t.closest("[data-delete]")) deleteSelected();
  });

  els.pads.addEventListener("pointerdown", (e) => {
    const pad = e.target.closest(".pad");
    if (!pad) return;
    e.preventDefault();
    addStrike(pad.dataset.hand, pad.dataset.where);
  });

  els.addShout.addEventListener("click", addShout);
  els.undo.addEventListener("click", doUndo);
  els.redo.addEventListener("click", doRedo);
  els.insPattern.addEventListener("change", syncInsertBpm);

  el("leInsert").addEventListener("click", () => {
    const p = app.lib().pattern(els.insPattern.value.replace(/^pattern:/, ""));
    const start = parseClock(els.insStart.value);
    const bpm = Number(els.insBpm.value);
    const repeats = Math.max(1, Math.min(99, Math.round(Number(els.insRepeats.value) || 1)));
    if (!p) return say("Pick a pattern.", true);
    if (!Number.isFinite(start)) return say("Write the start time like 1:23.4.", true);
    if (!(bpm >= 30 && bpm <= 240)) return say("Use a tempo between 30 and 240 bpm.", true);
    const added = patternStrikes(p, { start, bpm, repeats });
    commit(mergeStrikes(lesson.strikes, added), `Added ${added.length} strikes from “${p.name}”.`);
    lane.reveal(start);
  });

  el("leDelRange").addEventListener("click", () => {
    const a = parseClock(el("leDelFrom").value);
    const b = parseClock(el("leDelTo").value);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return say("Set “To” later than “From”, like 0:10.0 to 0:20.0.", true);
    const keep = lesson.strikes.filter((s) => s.t < a || s.t > b);
    const n = lesson.strikes.length - keep.length;
    if (!n) return say("There are no strikes in that part.");
    commit(keep, `Deleted ${n} strike${n === 1 ? "" : "s"}. Undo brings them back.`);
  });

  el("leClear").addEventListener("click", () => {
    if (!lesson.strikes.length) return;
    if (!confirm(`Delete all ${lesson.strikes.length} strikes?`)) return;
    commit([], "Deleted all strikes. Undo brings them back.");
  });

  els.selected.addEventListener("change", (e) => {
    if (!selected) return;
    if (e.target.id === "selTime") {
      const t = Number(e.target.value);
      if (Number.isFinite(t) && t >= 0) replaceSelected({ t });
    } else if (e.target.id === "selShout") {
      replaceSelected({ shout: e.target.value });
    }
  });

  /** Keys while the editor is open. Returns true if handled. */
  function onKey(e) {
    if (!lesson) return false;
    const k = e.key;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && k.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return true; }
    if (mod && k.toLowerCase() === "y") { e.preventDefault(); doRedo(); return true; }
    if (mod || e.altKey) return false;
    const pad = { d: ["L", "rim"], f: ["L", "center"], j: ["R", "center"], k: ["R", "rim"] }[k.toLowerCase()];
    if (pad && !e.repeat) { e.preventDefault(); addStrike(pad[0], pad[1]); return true; }
    if (k === " " && media) { e.preventDefault(); els.play.click(); return true; }
    if ((k === "Delete" || k === "Backspace") && selected) { e.preventDefault(); deleteSelected(); return true; }
    if ((k === "ArrowLeft" || k === "ArrowRight") && (selected || media)) {
      e.preventDefault();
      const dir = k === "ArrowLeft" ? -1 : 1;
      if (selected) replaceSelected({ t: selected.t + dir * (e.shiftKey ? 0.1 : 0.01) });
      else media.seek(media.time + dir * (e.shiftKey ? 1 : 0.1));
      return true;
    }
    return false;
  }

  return { open, close, onKey, flush, get lessonId() { return lesson?.id; } };
}
