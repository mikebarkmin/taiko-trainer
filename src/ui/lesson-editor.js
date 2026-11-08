// The strike editor: pick a video, then tap along (or type in a pattern) to
// mark every strike at its time in the video. Changes save automatically.

import { WORDS } from "../core/words.js";
import {
  normalizeLesson, strikeWord, strikeHit, mergeStrikes, shiftStrikes, patternStrikes,
  sourceFromLink, describeVideo, snapToGrid, lowerBound,
} from "../core/lessons.js";
import { fmtClock, parseClock } from "../core/util.js";
import { putVideo, getVideo, hasVideo } from "../videostore.js";
import { html5Media, youtubeMedia } from "../media.js";
import { VideoSync } from "../videosync.js";
import {
  tapTempo, tapDelay, mapStrikes, snapChosen, snapToOnsets, makeClip, placeClip, duplicateAt, clearPassed,
} from "../core/edit.js";
import { envelope, onsets, ENV_RATE } from "../core/onsets.js";
import { createLane, ZOOM_MIN, ZOOM_MAX } from "./lane.js";
import { createOverlay } from "./overlay.js";
import { mountMicPanel } from "./mic-panel.js";
import { $, $$, esc, itemOptions } from "./render.js";
import { t, quote } from "../i18n.js";

const SPEEDS = [0.25, 0.5, 0.75, 1];
const SHOUT_IDS = Object.keys(WORDS).filter((id) => WORDS[id].group === "shout");
const UNDO_LIMIT = 100;
const round3 = (t) => Math.round(t * 1000) / 1000;
const PREROLL = 2; // seconds of real time to replay before a removed strike while playing
const TEMPO_GAP = 2500; // ms without a T tap that starts a new tap-tempo series
const WAVE_MAX_BYTES = 400e6; // larger files are not decoded (memory)
const WAVE_RATE = 11025; // the soundtrack is decoded at this sample rate: plenty for drum hits

// Copied strikes stay on the clipboard across lessons.
let clipboard = null;
// Soundtrack analysis per lesson: id → { size, env, hits }
const waveCache = new Map();

// Every key of the editor, for the help list (and a short version in studio view).
const KEY_HELP = [
  ["D F J K", "le.kStrike", true],
  ["⌫", "le.kBack", true],
  ["le.kSpace", "le.kPlay", true],
  ["1 2 3", "le.kSize", true],
  ["S", "le.kShout", true],
  ["[ ]", "le.kLoopEdges", true],
  ["L", "le.kLoop", true],
  ["R", "le.kReplace", true],
  ["T", "le.kTempo"],
  ["Q", "le.kSnapBeat"],
  ["A", "le.kSnapAudio"],
  ["Ctrl C X V", "le.kCopy"],
  ["Ctrl D", "le.kDup"],
  ["Ctrl A", "le.kAll"],
  ["Ctrl Z Y", "le.kUndo"],
  ["← →", "le.kNudge"],
  ["M", "le.kMirror", true],
  ["V", "le.kOverlay", true],
  ["Esc", "le.kExit", true],
];
const keyHelp = (studio) => KEY_HELP.filter((k) => !studio || k[2])
  .map(([keys, what]) => `<span><kbd>${esc(keys.startsWith("le.") ? t(keys) : keys)}</kbd> ${esc(t(what))}</span>`).join("");

const PADS = [
  { hand: "L", where: "rim", key: "D", side: "le.leftRim" },
  { hand: "L", where: "center", key: "F", side: "le.leftSkin" },
  { hand: "R", where: "center", key: "J", side: "le.rightSkin" },
  { hand: "R", where: "rim", key: "K", side: "le.rightRim" },
];

const TEMPLATE = `
  <div class="le-top">
    <a class="btn small ghost" href="#library">${esc(t("le.back"))}</a>
    <div class="field grow"><label for="leName">${esc(t("le.name"))}</label><input id="leName" type="text" maxlength="80" autocomplete="off"></div>
    <span class="msg" id="leSaved" role="status"></span>
  </div>
  <p class="notice err" id="leMissing" hidden></p>

  <div class="le-grid" id="leBody">
    <section class="le-video" aria-label="${esc(t("le.video"))}">
      <div class="media-host" id="leMedia"></div>
      <div class="le-source" id="leSource">
        <p class="le-source-title" id="leSourceTitle">${esc(t("le.pick"))}</p>
        <div class="row">
          <label class="btn primary small" for="leFile">${esc(t("le.chooseFile"))}</label>
          <input id="leFile" type="file" accept="video/*" class="sr-only">
          <span class="hint">${esc(t("le.or"))}</span>
          <div class="link-row">
            <input id="leLink" type="url" inputmode="url" autocomplete="off" placeholder="${esc(t("le.linkPlaceholder"))}" aria-label="${esc(t("le.link"))}">
            <button type="button" class="btn small" id="leUseLink">${esc(t("le.useLink"))}</button>
          </div>
        </div>
        <p class="hint">${esc(t("le.sourceHint"))}</p>
      </div>
      <div class="le-keys" id="leKeys">
        ${PADS.map((p) => `<span class="le-key ${p.where} ${p.hand}" data-hand="${p.hand}" data-where="${p.where}"><kbd>${p.key}</kbd><b class="pad-word"></b></span>`).join("")}
        <span class="badge rec" id="leRec" hidden>${esc(t("le.rec"))}</span>
        <span class="badge" id="leReplaceBadge" hidden>${esc(t("le.replaceOn"))}</span>
        <span class="le-keys-help">${keyHelp(true)}</span>
        <span class="msg" id="leHudMsg" role="status"></span>
      </div>
      <div class="le-transport">
        <button type="button" class="btn primary" id="lePlay">${esc(t("btn.play"))}</button>
        <div class="seek-btns" role="group" aria-label="${esc(t("le.seek"))}">
          <button type="button" class="icon-btn wide" data-seek="-1">−1 s</button>
          <button type="button" class="icon-btn wide" data-seek="-0.1">−0.1</button>
          <button type="button" class="icon-btn wide" data-seek="0.1">+0.1</button>
          <button type="button" class="icon-btn wide" data-seek="1">+1 s</button>
        </div>
        <span class="clock" id="leClock">0:00.0</span>
        <label class="mini" for="leSpeed">${esc(t("le.speed"))}
          <select id="leSpeed">${SPEEDS.map((r) => `<option value="${r}"${r === 1 ? " selected" : ""}>${r}×</option>`).join("")}</select>
        </label>
        <label class="check" for="leHear"><input type="checkbox" id="leHear" checked> ${esc(t("le.hear"))}</label>
        <label class="check" for="leReplace" title="${esc(t("le.replaceHint"))}"><input type="checkbox" id="leReplace"> ${esc(t("le.replace"))}</label>
        <label class="check" for="leMirror"><input type="checkbox" id="leMirror"> ${esc(t("pv.mirror"))}</label>
        <label class="check" for="leOverlay"><input type="checkbox" id="leOverlay"> ${esc(t("pv.overlay"))}</label>
        <button type="button" class="btn small ghost" id="leStudio" aria-pressed="false">${esc(t("pv.studio"))}</button>
        <button type="button" class="btn small ghost" id="leChange">${esc(t("le.change"))}</button>
      </div>
      <div class="le-loop" role="group" aria-label="${esc(t("le.loopH"))}">
        <b>${esc(t("le.loopH"))}</b>
        <button type="button" class="btn small" id="leLoopA" title="[">${esc(t("le.loopStart"))}</button>
        <button type="button" class="btn small" id="leLoopB" title="]">${esc(t("le.loopEnd"))}</button>
        <span class="meta" id="leLoopInfo"></span>
        <label class="check" for="leLoopOn"><input type="checkbox" id="leLoopOn"> ${esc(t("le.loopOn"))}</label>
        <button type="button" class="btn small ghost" id="leLoopClear">${esc(t("le.loopClear"))}</button>
      </div>
    </section>

    <section class="le-side" aria-labelledby="leAddH">
      <h2 id="leAddH">${esc(t("le.addH"))}</h2>
      <p class="hint">${esc(t("le.addHint"))}</p>
      <div class="pads" id="lePads">
        ${PADS.map((p) => `<button type="button" class="pad ${p.where} ${p.hand}" data-hand="${p.hand}" data-where="${p.where}">
          <b class="pad-word"></b><span>${esc(t(p.side))}</span><kbd>${p.key}</kbd></button>`).join("")}
      </div>
      <div class="seg-row">
        <span class="lbl" id="leSizeLbl">${esc(t("le.size"))}</span>
        <div class="seg" role="group" aria-labelledby="leSizeLbl" id="leSize">
          <button type="button" data-size="big" aria-pressed="true">${esc(t("le.big"))}</button>
          <button type="button" data-size="medium" aria-pressed="false">${esc(t("le.medium"))}</button>
          <button type="button" data-size="small" aria-pressed="false">${esc(t("le.small"))}</button>
        </div>
      </div>
      <div class="row shout-row">
        <label class="mini" for="leShout">${esc(t("le.shout"))}
          <select id="leShout">${SHOUT_IDS.map((id) => `<option value="${id}">${esc(WORDS[id].ro)}</option>`).join("")}</select>
        </label>
        <button type="button" class="btn small" id="leAddShout">${esc(t("le.addShout"))}</button>
      </div>
      <div class="row tools">
        <button type="button" class="btn small" id="leUndo">${esc(t("btn.undo"))}</button>
        <button type="button" class="btn small" id="leRedo">${esc(t("btn.redo"))}</button>
        <button type="button" class="btn small" id="lePaste" disabled>${esc(t("le.paste"))}</button>
      </div>

      <details class="le-more">
        <summary>${esc(t("le.delayH"))}</summary>
        <p class="hint">${esc(t("le.delayHint"))}</p>
        <div class="row">
          <div class="field small"><label for="leDelay">${esc(t("le.delay"))}</label><input id="leDelay" type="number" min="0" max="400" step="5" inputmode="numeric"></div>
          <button type="button" class="btn small" id="leMeasure">${esc(t("le.measure"))}</button>
        </div>
      </details>
      <div id="leMic"></div>

      <details class="le-more">
        <summary>${esc(t("le.moveAll"))}</summary>
        <p class="hint">${esc(t("le.moveAllHint"))}</p>
        <div class="row">
          <button type="button" class="btn small" data-shift="-0.05">−50 ms</button>
          <button type="button" class="btn small" data-shift="-0.01">−10 ms</button>
          <button type="button" class="btn small" data-shift="0.01">+10 ms</button>
          <button type="button" class="btn small" data-shift="0.05">+50 ms</button>
        </div>
      </details>

      <details class="le-more">
        <summary>${esc(t("le.grid"))}</summary>
        <p class="hint">${esc(t("le.gridHint"))}</p>
        <label class="check" for="leGridOn"><input type="checkbox" id="leGridOn"> <span>${esc(t("le.gridOn"))}</span></label>
        <div class="row">
          <div class="field small"><label for="leGridStart">${esc(t("le.startsAt"))}</label><input id="leGridStart" type="text" inputmode="decimal" value="0:00.0"></div>
          <button type="button" class="btn small" data-now="leGridStart">${esc(t("le.videoTime"))}</button>
        </div>
        <div class="field small"><label for="leGridBpm">${esc(t("le.tempo"))}</label><input id="leGridBpm" type="number" min="20" max="300" inputmode="numeric"></div>
        <p class="hint">${esc(t("le.tapTempoHint"))}</p>
        <div class="row">
          <button type="button" class="btn small" id="leTapTempo">${esc(t("le.tapTempo"))}</button>
          <button type="button" class="btn small" id="leSnapAll">${esc(t("le.snapAll"))}</button>
        </div>
      </details>

      <details class="le-more" id="leAudioBox">
        <summary>${esc(t("le.audioH"))}</summary>
        <p class="hint">${esc(t("le.audioHint"))}</p>
        <label class="check" for="leWave"><input type="checkbox" id="leWave"> <span>${esc(t("le.wave"))}</span></label>
        <p class="msg" id="leWaveMsg" role="status"></p>
        <div class="row">
          <button type="button" class="btn small" id="leSnapAudioAll">${esc(t("le.snapAudioAll"))}</button>
          <button type="button" class="btn small" id="leFill">${esc(t("le.fill"))}</button>
        </div>
      </details>

      <details class="le-more">
        <summary>${esc(t("le.addPattern"))}</summary>
        <p class="hint">${esc(t("le.addPatternHint"))}</p>
        <div class="field"><label for="leInsPattern">${esc(t("le.pattern"))}</label><select id="leInsPattern"></select></div>
        <div class="row">
          <div class="field small"><label for="leInsStart">${esc(t("le.startsAt"))}</label><input id="leInsStart" type="text" inputmode="decimal" value="0:00.0"></div>
          <button type="button" class="btn small" data-now="leInsStart">${esc(t("le.videoTime"))}</button>
        </div>
        <div class="row">
          <div class="field small"><label for="leInsBpm">${esc(t("le.tempo"))}</label><input id="leInsBpm" type="number" min="30" max="240" inputmode="numeric"></div>
          <div class="field small"><label for="leInsRepeats">${esc(t("le.times"))}</label><input id="leInsRepeats" type="number" min="1" max="99" value="4" inputmode="numeric"></div>
        </div>
        <button type="button" class="btn small primary" id="leInsert">${esc(t("le.insert"))}</button>
      </details>

      <details class="le-more">
        <summary>${esc(t("le.deleteMany"))}</summary>
        <div class="row">
          <div class="field small"><label for="leDelFrom">${esc(t("le.from"))}</label><input id="leDelFrom" type="text" inputmode="decimal" value="0:00.0"></div>
          <button type="button" class="btn small" data-now="leDelFrom">${esc(t("le.videoTime"))}</button>
        </div>
        <div class="row">
          <div class="field small"><label for="leDelTo">${esc(t("le.to"))}</label><input id="leDelTo" type="text" inputmode="decimal" value="0:00.0"></div>
          <button type="button" class="btn small" data-now="leDelTo">${esc(t("le.videoTime"))}</button>
        </div>
        <div class="row">
          <button type="button" class="btn small" id="leDelRange">${esc(t("le.deleteThese"))}</button>
          <button type="button" class="btn small ghost" id="leClear">${esc(t("le.deleteAll"))}</button>
        </div>
      </details>
      <details class="le-more">
        <summary>${esc(t("le.keysH"))}</summary>
        <div class="le-keys-list">${keyHelp(false)}</div>
      </details>
      <p class="msg" id="leMsg" role="status"></p>
    </section>
  </div>

  <section class="le-lane" id="leLaneBox" aria-labelledby="leLaneH">
    <div class="le-lane-head">
      <h2 id="leLaneH">${esc(t("le.timeline"))}</h2>
      <span class="meta" id="leCount"></span>
      <button type="button" class="btn small ghost lane-pos" id="leLanePos" aria-pressed="false"></button>
      <label class="mini zoom" for="leZoom">${esc(t("le.zoom"))} <input type="range" id="leZoom" min="${ZOOM_MIN}" max="${ZOOM_MAX}" step="10" value="150"></label>
    </div>
    <div id="leLane"></div>
    <p class="hint">${esc(t("le.laneHint"))}</p>
  </section>

  <section class="le-selected" id="leSelected" aria-label="${esc(t("le.selected"))}"></section>

  <div class="field le-notes"><label for="leNotes">${esc(t("le.notes"))}</label><textarea id="leNotes" rows="2" maxlength="500" placeholder="${esc(t("le.notesPlaceholder"))}"></textarea></div>
`;

export function mountLessonEditor(app) {
  const root = $("#view-lesson");
  root.innerHTML = TEMPLATE;
  const el = (id) => $(`#${id}`, root);
  const els = {
    name: el("leName"), saved: el("leSaved"), missing: el("leMissing"), body: el("leBody"),
    mediaHost: el("leMedia"), source: el("leSource"), sourceTitle: el("leSourceTitle"), file: el("leFile"),
    link: el("leLink"), useLink: el("leUseLink"), play: el("lePlay"), clock: el("leClock"), speed: el("leSpeed"),
    hear: el("leHear"), change: el("leChange"), mirror: el("leMirror"), studio: el("leStudio"), pads: el("lePads"), size: el("leSize"), shout: el("leShout"),
    addShout: el("leAddShout"), undo: el("leUndo"), redo: el("leRedo"), msg: el("leMsg"), count: el("leCount"),
    zoom: el("leZoom"), selected: el("leSelected"), notes: el("leNotes"), insPattern: el("leInsPattern"),
    gridOn: el("leGridOn"), gridStart: el("leGridStart"), gridBpm: el("leGridBpm"),
    insStart: el("leInsStart"), insBpm: el("leInsBpm"), insRepeats: el("leInsRepeats"), laneBox: el("leLaneBox"), lanePos: el("leLanePos"),
    keys: el("leKeys"), hudMsg: el("leHudMsg"), rec: el("leRec"), replaceBadge: el("leReplaceBadge"), replace: el("leReplace"),
    loopA: el("leLoopA"), loopB: el("leLoopB"), loopInfo: el("leLoopInfo"), loopOn: el("leLoopOn"), loopClear: el("leLoopClear"),
    paste: el("lePaste"), delay: el("leDelay"), measure: el("leMeasure"), tapTempo: el("leTapTempo"), snapAll: el("leSnapAll"),
    wave: el("leWave"), waveMsg: el("leWaveMsg"), snapAudioAll: el("leSnapAudioAll"), fill: el("leFill"),
  };
  const S = app.settings;
  const overlay = createOverlay();
  const overlayBox = el("leOverlay");
  const setOverlay = (on) => {
    S.videoOverlay = on;
    app.saveSettings();
    overlayBox.checked = on;
    overlay.setVisible(on);
  };
  overlayBox.checked = S.videoOverlay;
  overlay.setVisible(S.videoOverlay);
  overlayBox.addEventListener("change", () => setOverlay(overlayBox.checked));

  const sync = new VideoSync(app.synth);
  const lane = createLane(el("leLane"), {
    editable: true,
    onSeek: (t) => { if (media) { media.seek(t); lane.setTime(t); } select(null); },
    onSelect: (i, e) => select(lesson.strikes[i], e?.shiftKey || e?.ctrlKey || e?.metaKey),
    onDropStrike: (i, t) => moveStrike(i, t),
    onSelectSpan: (a, b) => selectSpan(a, b),
    onAddAt: (at, row, e) => addAt(at, row, e),
    onZoom: (z) => { els.zoom.value = z; },
  });

  let lesson = null;
  let media = null;
  let token = 0;
  let selection = new Set(); // selected strikes (strike objects)
  const one = () => (selection.size === 1 ? [...selection][0] : null);
  let size = "big";
  let undo = [];
  let redo = [];
  let saveTimer = 0;
  let raf = 0;
  let showSource = false;
  let taps = []; // strikes added by tapping, newest last: Backspace takes them back
  let range = null; // { start, end } the part to loop
  let loopOn = false;
  let replaceOn = false; // re-recording: taps replace what the playhead passes
  let punch = null; // while replacing: { keep: Set of this pass's taps, last: video time }
  let tempoTaps = []; // T presses (video times) of the current tap-tempo series
  let tempoLast = 0;
  let calib = null; // measuring the tap delay: { clicks, taps }
  let hits = []; // drum hits found in the soundtrack (local files only)

  // ---------- open / close ----------
  function open(id) {
    setStudio(false);
    const found = app.lib().lesson(id);
    els.missing.hidden = !!found;
    els.body.hidden = !found;
    els.laneBox.hidden = !found;
    els.selected.hidden = !found;
    if (!found) {
      els.missing.textContent = t("le.missing");
      return;
    }
    if (lesson && lesson.id === id) { startLoop(); return; }
    flush();
    lesson = structuredClone(found);
    undo = [];
    redo = [];
    taps = [];
    range = null;
    loopOn = false;
    punch = null;
    tempoTaps = [];
    hits = [];
    lane.setWave(null);
    els.waveMsg.textContent = "";
    selection = new Set();
    showSource = !lesson.video;
    els.name.value = lesson.name;
    els.notes.value = lesson.notes;
    els.mirror.checked = app.settings.videoMirror;
    els.mediaHost.classList.toggle("mirrored", app.settings.videoMirror);
    els.msg.textContent = "";
    els.saved.textContent = "";
    els.insPattern.innerHTML = itemOptions(app.lib(), { songs: false, lessons: false });
    syncInsertBpm();
    els.gridOn.checked = !!lesson.grid;
    els.gridStart.value = fmtClock(lesson.grid?.start || 0, 2);
    els.gridBpm.value = lesson.grid?.bpm || 100;
    lane.setGrid(lesson.grid);
    lane.setStrikes(lesson.strikes);
    overlay.setStrikes(lesson.strikes);
    lane.select(-1);
    renderAll();
    renderLoop();
    renderReplace();
    mountMedia();
    startLoop();
  }

  function close() {
    flush();
    stopLoop();
    setStudio(false);
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
    el("leAudioBox").hidden = v?.type !== "file";
    if (!v) { els.mediaHost.innerHTML = `<div class="video-empty">${esc(t("le.noVideo"))}</div>`; return; }
    let src = blobOverride || null;
    if (v.type === "file" && !src) {
      src = await getVideo(lesson.id);
      if (my !== token) return;
      if (!src) {
        els.mediaHost.innerHTML = `<div class="video-empty">${esc(t("le.fileNotHere"))}</div>`;
        showSource = true;
        renderSource();
        return;
      }
    }
    els.mediaHost.innerHTML = `<div class="video-empty">${esc(t("pv.loading"))}</div>`;
    try {
      const onState = () => renderTransport();
      media = v.type === "youtube" ? youtubeMedia(els.mediaHost, v.videoId, { onState }) : html5Media(els.mediaHost, src || v.url, { onState });
      overlay.attach(els.mediaHost); // the player replaced the host's content
      await media.ready;
      if (my !== token) return;
      media.setRate(Number(els.speed.value));
      const d = media.duration;
      lane.setDuration(d || v.duration || 0);
      if (v.type === "file" && d && Math.abs((v.duration || 0) - d) > 0.25) { lesson.video.duration = Math.round(d * 1000) / 1000; scheduleSave(); }
      sync.attach(media, lesson.strikes, {
        guide: () => els.hear.checked,
        loop: () => loopOn && !!range,
        range: () => (loopOn ? range : null),
      }, {
        onLoop: () => { if (punch) punch = { keep: new Set(), last: range.start }; }, // each pass replaces the one before
      });
      renderTransport();
      el("leAudioBox").hidden = v.type !== "file";
      if (v.type === "file" && S.showWave) analyze(src);
    } catch (err) {
      if (my !== token) return;
      els.mediaHost.innerHTML = `<div class="video-empty err">${esc(err.message || t("pv.cantLoad"))}</div>`;
      media = null;
      showSource = true;
      renderSource();
    }
  }

  // ---------- soundtrack: waveform and drum hits ----------
  /** Decode the video file's sound, draw its outline on the timeline and find the hits. */
  async function analyze(blob) {
    const id = lesson.id;
    const my = token;
    const done = (a) => {
      if (my !== token || lesson?.id !== id || !S.showWave) return;
      hits = a.hits;
      lane.setWave({ env: a.env, rate: ENV_RATE }, hits);
      els.waveMsg.textContent = t("le.waveFound", { n: hits.length });
      els.waveMsg.classList.remove("err");
    };
    const cached = waveCache.get(id);
    if (cached && cached.size === blob.size) { done(cached); return; }
    if (blob.size > WAVE_MAX_BYTES) { els.waveMsg.textContent = t("le.waveTooBig"); return; }
    els.waveMsg.textContent = t("le.waveReading");
    try {
      const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
      const audio = await new OAC(1, 1, WAVE_RATE).decodeAudioData(await blob.arrayBuffer());
      const mono = new Float32Array(audio.length);
      for (let c = 0; c < audio.numberOfChannels; c++) {
        const d = audio.getChannelData(c);
        for (let i = 0; i < d.length; i++) mono[i] += d[i] / audio.numberOfChannels;
      }
      const env = envelope(mono, audio.sampleRate);
      const a = { size: blob.size, env, hits: onsets(env) };
      waveCache.set(id, a);
      done(a);
    } catch {
      if (my !== token) return;
      els.waveMsg.textContent = t("le.waveNone");
      els.waveMsg.classList.add("err");
    }
  }

  async function setWave(on) {
    S.showWave = on;
    app.saveSettings();
    if (!on) { hits = []; lane.setWave(null); els.waveMsg.textContent = ""; return; }
    const blob = lesson?.video?.type === "file" && await getVideo(lesson.id);
    if (blob) analyze(blob);
  }

  function needHits() {
    if (hits.length) return true;
    say(t(lesson.video?.type === "file" ? "le.needWave" : "le.needFile"), true);
    return false;
  }

  /** Strikes at every found hit that has none near it yet (in the loop, or everywhere), alternating hands. */
  function fillFromAudio() {
    if (!needHits()) return;
    const a = range ? range.start : 0;
    const b = range ? range.end : Infinity;
    const free = (t) => !lesson.strikes.some((s) => Math.abs(s.t - t) < 0.06);
    const added = hits.filter((h) => h >= a && h <= b && free(h))
      .map((h, i) => ({ t: h, hand: i % 2 ? "L" : "R", where: "center", vol: size }));
    if (!added.length) { say(t("le.fillNone")); return; }
    insert(added, t("le.filled", { n: added.length }));
  }

  function renderSource() {
    const v = lesson.video;
    els.source.hidden = !showSource;
    els.change.hidden = showSource || !v;
    if (v?.type === "file" && !hasVideo(lesson.id)) {
      els.sourceTitle.textContent = t("le.attach", { name: quote(v.name || "video") });
    } else {
      els.sourceTitle.textContent = v ? t("le.current", { video: describeVideo(v) }) : t("le.pick");
    }
  }

  async function useFile(file) {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|m4v|mov|webm|ogv|mkv|3gp)$/i.test(file.name)) {
      say(t("le.notVideo"), true);
      return;
    }
    const old = lesson.video;
    let note = "";
    if (old?.type === "file" && old.size && old.size !== file.size) note = t("le.sizeDiffers");
    else if (old && lesson.strikes.length) note = t("le.strikesStayed");
    const stored = await putVideo(lesson.id, file);
    lesson.video = { type: "file", name: file.name, size: file.size, mime: file.type, duration: old?.type === "file" ? old.duration : 0 };
    showSource = false;
    saveNow();
    say(t(stored ? "le.videoSaved" : "le.videoNotSaved") + note, !stored);
    mountMedia(file);
  }

  function useLink() {
    const source = sourceFromLink(els.link.value);
    if (!source) { say(t("le.badLink"), true); return; }
    lesson.video = source;
    showSource = false;
    els.link.value = "";
    saveNow();
    say(t(source.type === "youtube" ? "le.ytAdded" : "le.linkAdded"));
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
    for (const s of [...selection]) if (!lesson.strikes.includes(s)) selection.delete(s);
    syncSelection();
    lane.setStrikes(lesson.strikes);
    overlay.setStrikes(lesson.strikes);
    sync.setStrikes(lesson.strikes);
    renderAll();
    scheduleSave();
  }

  /** Show the current selection on the timeline. */
  function syncSelection() {
    lane.selectMany([...selection].map((s) => lesson.strikes.indexOf(s)).filter((i) => i >= 0));
  }

  function now() {
    return media ? round3(media.time) : null;
  }

  /** Add one strike (or shout) at time `at`; tapped ones can be taken back with Backspace. `silent`: no drum sound (a real drum was hit). */
  function place(s, tapped, silent = false) {
    s.t = round3(snapToGrid(lesson.grid, s.t));
    const next = mergeStrikes(lesson.strikes, [s]);
    if (!next.includes(s)) return null; // that exact strike is already there
    selection = new Set(); // Backspace now means "the last strike", not a selection
    commit(next);
    if (tapped) taps.push(s);
    lane.flash(s);
    if (!s.shout && !silent) {
      app.synth.ensure();
      app.synth.hit(strikeHit(s), app.synth.now() + 0.005);
    }
    return s;
  }

  /** The video time of a tap `ago` seconds ago (default: your measured tap delay), scaled to the video speed. */
  function tapTime(ago = S.tapDelay / 1000) {
    if (!media) return null;
    return round3(Math.max(0, media.time - ago * (media.paused ? 0 : media.rate)));
  }

  function tapped(s) {
    if (!s) return;
    if (replaceOn && media && !media.paused) {
      if (!punch) punch = { keep: new Set(), last: s.t };
      punch.keep.add(s);
      renderReplace();
    }
  }

  function addStrike(hand, where, { ago, silent = false } = {}) {
    const at = tapTime(ago);
    if (at === null) { say(t("le.addVideoFirst"), true); return; }
    tapped(place({ t: at, hand, where, vol: size }, true, silent));
    flashPad(hand, where);
    overlay.tap(hand, where);
  }

  function addShout() {
    const at = tapTime();
    if (at === null) { say(t("le.addVideoFirst"), true); return; }
    tapped(place({ t: at, shout: els.shout.value }, true));
  }

  /** While replacing: drop the old strikes the playhead runs over (called every frame). */
  function punchFrame() {
    if (!punch) return;
    if (!media || media.paused) { punch = null; renderReplace(); return; }
    const t = media.time;
    if (t < punch.last - 0.05 || t > punch.last + 0.75) { punch.last = t; return; } // a jump
    const next = clearPassed(lesson.strikes, punch.last, t + 0.15, punch.keep);
    punch.last = t;
    if (next !== lesson.strikes) {
      lesson.strikes = next;
      changed();
    }
  }

  // ---------- loop ----------
  function setLoopEdge(which) {
    if (!media) return;
    const at = round3(media.time);
    const dur = media.duration || lesson.video?.duration || at + 10;
    let start = which === "start" ? at : range?.start ?? 0;
    let end = which === "end" ? at : range?.end ?? dur;
    if (end < start) [start, end] = which === "start" ? [start, dur] : [0, end];
    range = end - start >= 0.3 ? { start, end } : null;
    if (range) loopOn = true;
    renderLoop();
  }

  function loopSelection() {
    if (!selection.size) return;
    const ts = [...selection].map((s) => s.t);
    range = { start: round3(Math.max(0, Math.min(...ts) - 0.3)), end: round3(Math.max(...ts) + 0.5) };
    loopOn = true;
    renderLoop();
    if (media) { media.seek(range.start); lane.setTime(range.start); }
  }

  function renderLoop() {
    els.loopInfo.textContent = range ? `${fmtClock(range.start, 1)} – ${fmtClock(range.end, 1)}` : t("le.loopNone");
    els.loopOn.checked = loopOn && !!range;
    els.loopOn.disabled = !range;
    els.loopClear.disabled = !range;
    lane.setRange(range);
    els.keys.classList.toggle("looping", loopOn && !!range);
  }

  function renderReplace() {
    els.replace.checked = replaceOn;
    els.replaceBadge.hidden = !replaceOn || !!punch;
    els.rec.hidden = !punch;
  }

  // ---------- tap delay ----------
  /** Play 16 clicks; the taps on them tell how late taps land. */
  function measureDelay() {
    if (calib) return;
    app.synth.ensure();
    media?.pause();
    const gap = 0.5;
    const t0 = app.synth.now() + 0.8;
    const clicks = Array.from({ length: 16 }, (_, i) => t0 + i * gap);
    clicks.forEach((c, i) => app.synth.click(c, i % 4 === 0));
    calib = { clicks, taps: [] };
    els.measure.disabled = true;
    say(t("le.measuring"));
    setTimeout(() => {
      const d = tapDelay(calib.clicks, calib.taps);
      calib = null;
      els.measure.disabled = false;
      if (d === null) { say(t("le.measureFailed"), true); return; }
      // the clicks reach your ears a little after they are scheduled
      const out = app.synth.ctx?.outputLatency || app.synth.ctx?.baseLatency || 0;
      S.tapDelay = Math.round(Math.min(400, Math.max(0, (d - out) * 1000)));
      app.saveSettings();
      els.delay.value = S.tapDelay;
      say(t("le.measured", { ms: S.tapDelay }));
    }, (0.8 + 16 * gap + 0.4) * 1000);
  }

  // ---------- tap tempo ----------
  function tempoTap() {
    if (!media) { say(t("le.addVideoFirst"), true); return; }
    const nowMs = performance.now();
    if (nowMs - tempoLast > TEMPO_GAP) tempoTaps = [];
    tempoLast = nowMs;
    tempoTaps.push(tapTime());
    const r = tapTempo(tempoTaps);
    if (!r) { say(t("le.tempoMore", { n: Math.max(0, 4 - tempoTaps.length) || 1 })); return; }
    els.gridStart.value = fmtClock(r.start, 2);
    els.gridBpm.value = r.bpm;
    els.gridOn.checked = true;
    syncGrid();
    say(t("le.tempoSet", { bpm: r.bpm, n: tempoTaps.length }));
  }

  // ---------- snapping, copy & paste, group changes ----------
  /** Apply a change to the selection (or, with `all`, every strike) as one undo step. */
  function changeChosen(fn, all, message) {
    const chosen = all ? new Set(lesson.strikes) : selection;
    if (!chosen.size) { say(t("le.selectFirst"), true); return; }
    const res = fn(chosen);
    if (!all) selection = new Set(res.changed);
    commit(res.strikes, message?.(res));
  }

  function snapBeat(all = false) {
    if (!lesson.grid) { say(t("le.needGrid"), true); return; }
    changeChosen((c) => snapChosen(lesson.strikes, c, lesson.grid), all, (r) => t("le.snapped", { n: r.changed.length }));
  }

  function snapAudio(all = false) {
    if (!needHits()) return;
    changeChosen((c) => snapToOnsets(lesson.strikes, c, hits), all, (r) => t("le.snappedAudio", { n: r.moved }));
  }

  /** hand / where / vol for every selected strike (shouts stay as they are). */
  function setOnSelection(key, value) {
    changeChosen((c) => mapStrikes(lesson.strikes, c, (s) => (s.shout ? s : { ...s, [key]: value })));
  }

  function swapHands() {
    changeChosen((c) => mapStrikes(lesson.strikes, c, (s) => (s.shout ? s : { ...s, hand: s.hand === "L" ? "R" : "L" })));
  }

  function copy(cut = false) {
    if (!selection.size) return false;
    clipboard = makeClip([...selection]);
    els.paste.disabled = false;
    if (cut) deleteSelected();
    say(t(cut ? "le.cut" : "le.copied", { n: clipboard.strikes.length }));
    return true;
  }

  /** Put strikes in and select them (one undo step). */
  function insert(added, message) {
    const next = mergeStrikes(lesson.strikes, added);
    selection = new Set(added.filter((s) => next.includes(s)));
    commit(next, message);
    if (added[0]) lane.reveal(added[0].t);
  }

  function paste() {
    if (!clipboard) return;
    const at = media ? round3(snapToGrid(lesson.grid, media.time)) : 0;
    insert(placeClip(clipboard, at), t("le.pasted", { n: clipboard.strikes.length, time: fmtClock(at, 2) }));
  }

  /** Repeat the selection right after itself (whole bars with a grid). */
  function duplicate() {
    if (!selection.size) return;
    const c = makeClip([...selection]);
    const start = Math.min(...[...selection].map((s) => s.t));
    const at = duplicateAt(c, start, lesson.grid);
    insert(placeClip(c, at), t("le.duplicated", { n: c.strikes.length }));
  }

  function setSize(v) {
    size = v;
    renderPads();
    if (selection.size) setOnSelection("vol", v);
  }

  /** Double-click on the timeline: a strike in that row at that time (right hand; Shift: left). */
  function addAt(at, row, e) {
    const s = row === "shout"
      ? place({ t: at, shout: els.shout.value }, false)
      : place({ t: at, hand: e?.shiftKey ? "L" : "R", where: row, vol: size }, false);
    if (s) select(s);
  }

  /**
   * Backspace while tapping along: remove the most recently tapped strike
   * (or, with none left, the last one before the playhead) and jump the
   * video back to it, so you can drum on from there. While the video
   * plays, it restarts a moment earlier to give you a run-up.
   */
  function deleteLast() {
    let s = null;
    while (taps.length && !s) {
      const c = taps.pop();
      if (lesson.strikes.includes(c)) s = c;
    }
    if (!s) s = lesson.strikes[lowerBound(lesson.strikes, (media ? media.time : Infinity) + 0.001) - 1] || null;
    if (!s) { say(t("le.nothingToRemove")); return; }
    const w = WORDS[strikeWord(s)];
    commit(lesson.strikes.filter((x) => x !== s), t("le.removedLast", { word: w.ro, time: fmtClock(s.t, 2) }));
    if (media) {
      const to = media.paused ? s.t : Math.max(0, s.t - PREROLL * media.rate);
      media.seek(to);
      lane.setTime(to);
      lane.reveal(s.t);
    }
  }

  function flashPad(hand, where) {
    for (const pad of root.querySelectorAll(`.pad[data-hand="${hand}"][data-where="${where}"], .le-key[data-hand="${hand}"][data-where="${where}"]`)) {
      pad.animate?.([{ transform: "scale(.9)", filter: "brightness(1.4)" }, { transform: "scale(1)", filter: "none" }], { duration: 160 });
    }
  }

  /** Select one strike (or none); with `toggle`, add/remove it from the selection. */
  function select(strike, toggle = false) {
    if (toggle && strike) {
      if (selection.has(strike)) selection.delete(strike);
      else selection.add(strike);
    } else {
      selection = strike ? new Set([strike]) : new Set();
    }
    syncSelection();
    renderSelected();
  }

  /** Rubber-band result from the timeline: select every strike between a and b. */
  function selectSpan(a, b) {
    selection = new Set(lesson.strikes.filter((s) => s.t >= a && s.t <= b));
    syncSelection();
    renderSelected();
  }

  /** A strike dragged on the timeline to a new time (one undo step per drag). */
  function moveStrike(i, t) {
    const s = lesson.strikes[i];
    if (!s) return;
    if (selection.has(s) && selection.size > 1) moveBy(t - s.t); // move the whole group
    else {
      selection = new Set([s]);
      replaceSelected({ t });
    }
    lane.reveal(t);
  }

  function replaceSelected(changes) {
    const s = one();
    if (!s) return;
    const updated = { ...s, ...changes };
    if (updated.t !== undefined) updated.t = round3(Math.max(0, updated.t));
    const next = lesson.strikes.filter((x) => x !== s).concat(updated).sort((a, b) => a.t - b.t);
    selection = new Set([updated]);
    commit(next);
  }

  /** Shift the whole selection in time (one undo step). */
  function moveBy(dt) {
    if (!selection.size) return;
    const moved = [];
    const next = lesson.strikes
      .map((s) => {
        if (!selection.has(s)) return s;
        const u = { ...s, t: round3(Math.max(0, s.t + dt)) };
        moved.push(u);
        return u;
      })
      .sort((a, b) => a.t - b.t);
    selection = new Set(moved);
    commit(next, t("le.movedMs", { ms: Math.round(dt * 1000) }));
  }

  function deleteSelected() {
    if (!selection.size) return;
    const n = selection.size;
    const next = lesson.strikes.filter((s) => !selection.has(s));
    selection = new Set();
    commit(next, t("le.deletedN", { n }));
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
    els.count.textContent = t("strikes", { n });
    els.undo.disabled = !undo.length;
    els.redo.disabled = !redo.length;
  }

  function renderPads() {
    for (const pad of [...$$(".pad", els.pads), ...$$(".le-key", els.keys)]) {
      const w = WORDS[strikeWord({ hand: pad.dataset.hand, where: pad.dataset.where, vol: size })];
      pad.querySelector(".pad-word").innerHTML = `<span lang="ja">${w.kana}</span> ${esc(w.ro)}`;
    }
    for (const b of $$("[data-size]", els.size)) b.setAttribute("aria-pressed", String(b.dataset.size === size));
  }

  /** A row of toggle buttons that sets `key` (hand, where or vol) on the selected strike(s). */
  function seg(key, options, value, attr = "set") {
    const label = { hand: "le.hand", where: "le.where", vol: "le.size" }[key];
    return `<div class="seg" role="group" aria-label="${esc(t(label))}">${options.map(([v, text]) =>
      `<button type="button" data-${attr}="${key}" data-value="${v}" aria-pressed="${v === value}"${key === "hand" ? ` class="hand ${v}"` : ""}>${esc(t(text))}</button>`).join("")}</div>`;
  }

  /** The value of `key` all the (non-shout) strikes share, or null when mixed. */
  function common(list, key) {
    const vals = new Set(list.filter((s) => !s.shout).map((s) => s[key]));
    return vals.size === 1 ? [...vals][0] : null;
  }

  function snapButtons() {
    return `${lesson.grid ? `<button type="button" class="btn small" data-act="snapBeat" title="Q">${esc(t("le.snapBeat"))}</button>` : ""}${
      hits.length ? `<button type="button" class="btn small" data-act="snapAudio" title="A">${esc(t("le.snapAudio"))}</button>` : ""}`;
  }

  function renderSelected() {
    const s = one();
    if (!s && selection.size > 1) {
      const list = [...selection].sort((a, b) => a.t - b.t);
      els.selected.innerHTML = `
      <div class="sel-head">
        <b>${esc(t("le.selectedN", { n: selection.size }))}</b>
        <span class="meta">${fmtClock(list[0].t, 2)} – ${fmtClock(list[list.length - 1].t, 2)}</span>
      </div>
      <div class="seg-row">
        ${seg("hand", [["R", "le.right"], ["L", "le.left"]], common(list, "hand"), "gset")}
        ${seg("where", [["center", "le.skin"], ["rim", "le.rim"]], common(list, "where"), "gset")}
        ${seg("vol", [["big", "le.big"], ["medium", "le.medium"], ["small", "le.small"]], common(list, "vol"), "gset")}
      </div>
      <div class="row tight">
        <button type="button" class="btn small" data-gnudge="-0.01">−10 ms</button>
        <button type="button" class="btn small" data-gnudge="0.01">+10 ms</button>
        <button type="button" class="btn small" data-act="swap">${esc(t("le.swapHands"))}</button>
        ${snapButtons()}
      </div>
      <div class="row tight">
        <button type="button" class="btn small" data-act="copy">${esc(t("le.copy"))}</button>
        <button type="button" class="btn small" data-act="dup">${esc(t("le.duplicate"))}</button>
        <button type="button" class="btn small" data-act="loop">${esc(t("le.loopThese"))}</button>
        <button type="button" class="btn small ghost" data-delete>${esc(t("le.deleteStrikes", { n: selection.size }))}</button>
      </div>
      <p class="hint">${esc(t("le.groupHint"))}</p>`;
      return;
    }
    if (!s) {
      els.selected.innerHTML = `<p class="hint">${esc(t("le.selectHint"))}</p>`;
      return;
    }
    const i = lesson.strikes.indexOf(s);
    const w = WORDS[strikeWord(s)];
    els.selected.innerHTML = `
      <div class="sel-head">
        <span class="sel-kana" lang="ja">${w.kana}</span><b>${esc(w.ro)}</b>
        <span class="meta">${esc(t("le.strikeOf", { i: i + 1, n: lesson.strikes.length }))} · ${fmtClock(s.t, 2)}</span>
      </div>
      <div class="row">
        <div class="field small"><label for="selTime">${esc(t("le.time"))}</label>
          <input id="selTime" type="number" step="0.001" min="0" inputmode="decimal" value="${s.t.toFixed(3)}"></div>
        <div class="row tight">
          <button type="button" class="btn small" data-nudge="-0.01">−10 ms</button>
          <button type="button" class="btn small" data-nudge="0.01">+10 ms</button>
          <button type="button" class="btn small" data-go>${esc(t("le.playBefore"))}</button>
          ${snapButtons()}
        </div>
      </div>
      ${s.shout
        ? `<label class="mini" for="selShout">${esc(t("le.shout"))} <select id="selShout">${SHOUT_IDS.map((id) => `<option value="${id}"${id === s.shout ? " selected" : ""}>${esc(WORDS[id].ro)}</option>`).join("")}</select></label>`
        : `<div class="seg-row">${seg("hand", [["R", "le.right"], ["L", "le.left"]], s.hand)}${seg("where", [["center", "le.skin"], ["rim", "le.rim"]], s.where)}${seg("vol", [["big", "le.big"], ["medium", "le.medium"], ["small", "le.small"]], s.vol)}</div>`}
      <div class="row"><button type="button" class="btn small ghost" data-delete>${esc(t("le.deleteStrike"))}</button></div>`;
  }

  function renderTransport() {
    if (!lesson) return;
    const playing = media && !media.paused;
    els.play.textContent = t(playing ? "btn.pause" : "btn.play");
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
        overlay.setTime(t, !media.paused, media.rate);
        punchFrame();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
  }

  function say(textValue, error = false) {
    for (const m of [els.msg, els.hudMsg]) {
      m.textContent = textValue;
      m.classList.toggle("err", error);
    }
  }

  // ---------- saving ----------
  function scheduleSave() {
    clearTimeout(saveTimer);
    els.saved.textContent = t("le.saving");
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
    els.saved.textContent = t(ok ? "le.saved" : "le.notSaved");
    els.saved.classList.toggle("err", !ok);
  }

  function flush() {
    if (saveTimer) saveNow();
  }

  function syncInsertBpm() {
    const p = app.lib().pattern(els.insPattern.value.replace(/^pattern:/, ""));
    if (p) els.insBpm.value = p.bpm;
  }

  /** Rebuild the bar grid from the inputs; null when it is switched off. */
  function syncGrid() {
    if (!els.gridOn.checked) {
      lesson.grid = null;
      lane.setGrid(null);
      scheduleSave();
      return;
    }
    const start = parseClock(els.gridStart.value);
    const bpm = Number(els.gridBpm.value);
    if (!Number.isFinite(start) || start < 0 || !(bpm >= 20 && bpm <= 300)) {
      say(t("le.badGrid"), true);
      els.gridOn.checked = !!lesson.grid;
      return;
    }
    lesson.grid = { start: round3(start), bpm: Math.round(bpm) };
    lane.setGrid(lesson.grid);
    scheduleSave();
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
    if (media.paused) {
      if (loopOn && range && (media.time < range.start || media.time >= range.end - 0.05)) media.seek(range.start);
      media.play()?.catch?.(() => say(t("le.tapVideo"), true));
    } else media.pause();
  });
  els.speed.addEventListener("change", () => media?.setRate(Number(els.speed.value)));
  els.mirror.addEventListener("change", () => toggleMirror(els.mirror.checked));
  // Studio view: drum along with the keyboard. The (mirrored) video fills
  // the page, the timeline docks below it (or above, with the arrow button)
  // so it never covers the players, and a key strip shows what each key
  // adds. Pure CSS: nothing moves in the DOM, so the video can reload freely.
  const placeTimeline = () => {
    const top = app.settings.timelineTop;
    root.classList.toggle("lane-top", top);
    els.lanePos.textContent = top ? "↓" : "↑";
    els.lanePos.setAttribute("aria-label", t(top ? "lane.bottom" : "lane.top"));
  };
  const toggleMirror = (on) => {
    app.settings.videoMirror = on;
    app.saveSettings();
    els.mirror.checked = on;
    els.mediaHost.classList.toggle("mirrored", on);
  };
  let studioOn = false; // the body class is shared with the player: only clear what we set
  const setStudio = (on) => {
    if (on === studioOn) return;
    studioOn = on;
    document.body.classList.toggle("studio", on);
    els.studio.textContent = t(on ? "pv.studioExit" : "pv.studio");
    els.studio.setAttribute("aria-pressed", String(on));
    placeTimeline();
    if (on) {
      // keys must reach the editor, not a focused button or select
      if (root.contains(document.activeElement)) document.activeElement.blur();
      select(null);
      els.hudMsg.textContent = "";
      scrollTo(0, 0);
      if (media) lane.reveal(media.time);
    }
  };
  els.studio.addEventListener("click", () => setStudio(!studioOn));
  els.studio.addEventListener("pointerup", () => els.studio.blur()); // Space stays play/pause
  els.lanePos.addEventListener("click", () => {
    app.settings.timelineTop = !app.settings.timelineTop;
    app.saveSettings();
    placeTimeline();
  });
  els.zoom.addEventListener("input", () => lane.setZoom(Number(els.zoom.value)));

  root.addEventListener("click", (e) => {
    const target = e.target;
    const seek = target.closest("[data-seek]");
    if (seek && media) { media.seek(media.time + Number(seek.dataset.seek)); return; }
    const sizeBtn = target.closest("[data-size]");
    if (sizeBtn) { size = sizeBtn.dataset.size; renderPads(); return; }
    const gset = target.closest("[data-gset]");
    if (gset) { setOnSelection(gset.dataset.gset, gset.dataset.value); return; }
    const act = target.closest("[data-act]")?.dataset.act;
    if (act) {
      ({ swap: swapHands, copy: () => copy(), dup: duplicate, loop: loopSelection, snapBeat: () => snapBeat(), snapAudio: () => snapAudio() })[act]?.();
      return;
    }
    const pad = target.closest(".pad");
    if (pad && e.detail === 0) { addStrike(pad.dataset.hand, pad.dataset.where); return; } // keyboard activation
    const shift = target.closest("[data-shift]");
    if (shift) {
      if (!lesson.strikes.length) return;
      commit(shiftStrikes(lesson.strikes, Number(shift.dataset.shift)), t("le.moved", { ms: Math.round(Number(shift.dataset.shift) * 1000) }));
      return;
    }
    const nowBtn = target.closest("[data-now]");
    if (nowBtn) { if (media) el(nowBtn.dataset.now).value = fmtClock(media.time, 2); return; }
    const set = target.closest("[data-set]");
    if (set && one()) {
      replaceSelected({ [set.dataset.set]: set.dataset.value });
      return;
    }
    const gnudge = target.closest("[data-gnudge]");
    if (gnudge) { moveBy(Number(gnudge.dataset.gnudge)); return; }
    const nudge = target.closest("[data-nudge]");
    const sel = one();
    if (nudge && sel) { replaceSelected({ t: sel.t + Number(nudge.dataset.nudge) }); return; }
    if (target.closest("[data-go]") && sel && media) {
      media.seek(Math.max(0, sel.t - 1.5));
      media.play()?.catch?.(() => {});
      return;
    }
    if (target.closest("[data-delete]")) deleteSelected();
  });

  els.pads.addEventListener("pointerdown", (e) => {
    const pad = e.target.closest(".pad");
    if (!pad) return;
    e.preventDefault();
    addStrike(pad.dataset.hand, pad.dataset.where);
  });

  els.addShout.addEventListener("click", addShout);
  els.replace.addEventListener("change", () => { replaceOn = els.replace.checked; punch = null; renderReplace(); });
  els.loopA.addEventListener("click", () => setLoopEdge("start"));
  els.loopB.addEventListener("click", () => setLoopEdge("end"));
  els.loopOn.addEventListener("change", () => { loopOn = els.loopOn.checked; renderLoop(); });
  els.loopClear.addEventListener("click", () => { range = null; loopOn = false; renderLoop(); });
  els.paste.addEventListener("click", paste);
  els.delay.value = S.tapDelay;
  els.delay.addEventListener("change", () => {
    const v = Math.round(Number(els.delay.value));
    if (v >= 0 && v <= 400) { S.tapDelay = v; app.saveSettings(); }
    els.delay.value = S.tapDelay;
  });
  els.measure.addEventListener("click", measureDelay);
  els.tapTempo.addEventListener("pointerdown", (e) => { e.preventDefault(); tempoTap(); });
  els.snapAll.addEventListener("click", () => snapBeat(true));
  els.wave.checked = S.showWave;
  els.wave.addEventListener("change", () => setWave(els.wave.checked));
  els.snapAudioAll.addEventListener("click", () => snapAudio(true));
  els.fill.addEventListener("click", fillFromAudio);
  els.undo.addEventListener("click", doUndo);
  els.redo.addEventListener("click", doRedo);
  els.insPattern.addEventListener("change", syncInsertBpm);
  els.gridOn.addEventListener("change", syncGrid);
  els.gridStart.addEventListener("change", syncGrid);
  els.gridBpm.addEventListener("change", syncGrid);

  el("leInsert").addEventListener("click", () => {
    const p = app.lib().pattern(els.insPattern.value.replace(/^pattern:/, ""));
    const start = parseClock(els.insStart.value);
    const bpm = Number(els.insBpm.value);
    const repeats = Math.max(1, Math.min(99, Math.round(Number(els.insRepeats.value) || 1)));
    if (!p) return say(t("le.pickPattern"), true);
    if (!Number.isFinite(start)) return say(t("le.badStart"), true);
    if (!(bpm >= 30 && bpm <= 240)) return say(t("le.badTempo"), true);
    const added = patternStrikes(p, { start, bpm, repeats });
    commit(mergeStrikes(lesson.strikes, added), t("le.addedFrom", { n: added.length, name: quote(p.name) }));
    lane.reveal(start);
  });

  el("leDelRange").addEventListener("click", () => {
    const a = parseClock(el("leDelFrom").value);
    const b = parseClock(el("leDelTo").value);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return say(t("le.badRange"), true);
    const keep = lesson.strikes.filter((s) => s.t < a || s.t > b);
    const n = lesson.strikes.length - keep.length;
    if (!n) return say(t("le.noneThere"));
    commit(keep, t("le.deletedN", { n }));
  });

  el("leClear").addEventListener("click", () => {
    if (!lesson.strikes.length) return;
    if (!confirm(t("le.confirmClear", { n: lesson.strikes.length }))) return;
    commit([], t("le.cleared"));
  });

  els.selected.addEventListener("change", (e) => {
    if (!one()) return;
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
    const lk = k.toLowerCase();
    const pad = { d: ["L", "rim"], f: ["L", "center"], j: ["R", "center"], k: ["R", "rim"] }[lk];
    const mod = e.metaKey || e.ctrlKey;
    if (calib && !mod && (pad || k === " ")) { // measuring the tap delay: just note the time
      e.preventDefault();
      if (!e.repeat) calib.taps.push(app.synth.now());
      return true;
    }
    if (k === "Escape") {
      if (studioOn) setStudio(false);
      else if (selection.size) select(null);
      else return false;
      return true;
    }
    if (mod && lk === "z") { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return true; }
    if (mod && lk === "y") { e.preventDefault(); doRedo(); return true; }
    if (mod && !e.altKey) {
      if (lk === "c" && selection.size && !String(getSelection?.() || "")) { e.preventDefault(); copy(); return true; }
      if (lk === "x" && selection.size) { e.preventDefault(); copy(true); return true; }
      if (lk === "v" && clipboard) { e.preventDefault(); paste(); return true; }
      if (lk === "d") { e.preventDefault(); duplicate(); return true; }
      if (lk === "a") { e.preventDefault(); selection = new Set(lesson.strikes); syncSelection(); renderSelected(); return true; }
    }
    if (mod || e.altKey) return false;
    if (pad && !e.repeat) { e.preventDefault(); addStrike(pad[0], pad[1]); return true; }
    if (e.repeat && "123sltrqa[]".includes(lk)) return true;
    const plain = {
      1: () => setSize("big"), 2: () => setSize("medium"), 3: () => setSize("small"),
      s: addShout, t: tempoTap, q: () => snapBeat(), a: () => snapAudio(),
      "[": () => setLoopEdge("start"), "]": () => setLoopEdge("end"),
      l: () => { if (range) { loopOn = !loopOn; renderLoop(); } else say(t("le.loopNeedEdges"), true); },
      r: () => { replaceOn = !replaceOn; punch = null; renderReplace(); say(t(replaceOn ? "le.replaceNowOn" : "le.replaceNowOff")); },
    }[lk];
    if (plain) { e.preventDefault(); plain(); return true; }
    if (k === " " && media) { e.preventDefault(); els.play.click(); return true; }
    if ((k === "Delete" || k === "Backspace") && selection.size) { e.preventDefault(); deleteSelected(); return true; }
    if (k === "Backspace") { e.preventDefault(); deleteLast(); return true; }
    if (k.toLowerCase() === "m" && !e.repeat) { e.preventDefault(); toggleMirror(!app.settings.videoMirror); return true; }
    if (lk === "v" && !e.repeat) { e.preventDefault(); setOverlay(!S.videoOverlay); return true; }
    if ((k === "ArrowLeft" || k === "ArrowRight") && (selection.size || media)) {
      e.preventDefault();
      const dir = k === "ArrowLeft" ? -1 : 1;
      if (selection.size) moveBy(dir * (e.shiftKey ? 0.1 : 0.01));
      else media.seek(media.time + dir * (e.shiftKey ? 1 : 0.1));
      return true;
    }
    return false;
  }

  /** A hit on a real drum, heard by the microphone: recorded like a key tap. */
  function drumHit(h) {
    if (!lesson || calib) return;
    addStrike(h.hand, h.where, { ago: h.ago, silent: true });
  }

  mountMicPanel(el("leMic"), app);

  return { open, close, onKey, flush, drumHit, get lessonId() { return lesson?.id; } };
}
