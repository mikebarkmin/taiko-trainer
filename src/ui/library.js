// The Patterns & songs screen: lists, editors, import/export, share links.

import { PALETTE, WORDS, parseWords, formatWords, beatsOf, fmtBeats } from "../core/words.js";
import { resolve, duration, totalBeats, fmtTime } from "../core/timeline.js";
import {
  newId, normalizePattern, normalizeSong, exportData, importData, shareData,
} from "../core/library.js";
import { normalizeLesson, describeVideo, packageHeader, readPackageHeader, PACKAGE_HEADER } from "../core/lessons.js";
import { encodeShare, shareLink, LONG_LINK } from "../core/share.js";
import { fmtClock } from "../core/util.js";
import { getVideo, putVideo, deleteVideo, hasVideo, storedVideoIds, storageSummary } from "../videostore.js";
import { $, $$, esc, tokens, palette, itemOptions } from "./render.js";

export function mountLibrary(app) {
  const els = {
    patterns: $("#patternList"), songs: $("#songList"), lessons: $("#lessonList"), editor: $("#editor"),
    newPattern: $("#newPattern"), newSong: $("#newSong"), newLesson: $("#newLesson"), storage: $("#storageInfo"),
    exportBtn: $("#exportBtn"), importFile: $("#importFile"), msg: $("#libMsg"),
  };
  let editing = null; // {kind, draft, isNew, dirty}
  let listening = false;

  // ---------- messages ----------
  function say(textValue, { error = false, link = "" } = {}) {
    els.msg.hidden = false;
    els.msg.classList.toggle("err", error);
    els.msg.replaceChildren();
    const p = document.createElement("p");
    p.textContent = textValue;
    els.msg.append(p);
    if (link) {
      const row = document.createElement("div");
      row.className = "share-row";
      const input = document.createElement("input");
      input.type = "text";
      input.readOnly = true;
      input.value = link;
      input.id = "shareLink";
      input.setAttribute("aria-label", "Share link");
      input.addEventListener("focus", () => input.select());
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn small";
      btn.textContent = "Copy";
      btn.addEventListener("click", () => copy(link, input, btn));
      row.append(input, btn);
      els.msg.append(row);
    }
  }

  async function copy(textValue, input, btn) {
    try {
      await navigator.clipboard.writeText(textValue);
      if (btn) btn.textContent = "Copied";
      return true;
    } catch {
      input?.focus();
      input?.select();
      return false;
    }
  }

  // ---------- lists ----------
  function patternMeta(p) {
    const { ids, unknown } = parseWords(p.words);
    const words = ids.length ? formatWords(ids) : "No words yet";
    return `${words} · ${p.bpm} bpm${p.swing ? " · swing" : ""}${p.drum === "shime" ? " · small drum" : ""}${unknown.length ? " · has unknown words" : ""}`;
  }

  function songMeta(s) {
    const r = resolve("song", s, app.lib());
    const n = s.sections.length;
    return `${n} section${n === 1 ? "" : "s"} · ${s.bpm} bpm · ${fmtTime(duration(r, 1))}${r.problems.length ? " · has missing patterns" : ""}`;
  }

  function lessonMeta(l) {
    const n = l.strikes.length;
    const parts = [describeVideo(l.video), `${n} strike${n === 1 ? "" : "s"}`];
    if (n) parts.push(fmtClock(l.strikes[n - 1].t, 0));
    if (l.video?.type === "file" && !hasVideo(l.id)) parts.push("video not on this device");
    return parts.join(" · ");
  }

  function lessonRow(l) {
    return `<li class="item" data-kind="lesson" data-id="${esc(l.id)}">
      <div class="item-main">
        <span class="item-name">${esc(l.name)}</span>
        <span class="item-meta">${esc(lessonMeta(l))}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="btn small primary" data-act="play">Play</button>
        <a class="btn small" href="#lesson=${esc(l.id)}">Edit strikes</a>
        <button type="button" class="btn small" data-act="share">Share</button>
        <button type="button" class="btn small" data-act="download">Download</button>
        <button type="button" class="btn small ghost" data-act="delete">Delete</button>
      </div>
    </li>`;
  }

  function row(kind, item) {
    if (kind === "lesson") return lessonRow(item);
    const editable = !item.builtin;
    const label = kind === "song" ? "Example" : "Common";
    return `<li class="item${editing && editing.draft.id === item.id ? " editing" : ""}" data-kind="${kind}" data-id="${esc(item.id)}">
      <div class="item-main">
        <span class="item-name">${esc(item.name)}${item.builtin ? ` <span class="badge">${label}</span>` : ""}</span>
        <span class="item-meta">${esc(kind === "song" ? songMeta(item) : patternMeta(item))}</span>
      </div>
      <div class="item-actions">
        <button type="button" class="btn small primary" data-act="play">Play</button>
        ${editable
          ? `<button type="button" class="btn small" data-act="edit">Edit</button>
             <button type="button" class="btn small" data-act="share">Share</button>
             <button type="button" class="btn small ghost" data-act="delete">Delete</button>`
          : `<button type="button" class="btn small" data-act="copy">Make a copy</button>`}
      </div>
    </li>`;
  }

  function renderLists() {
    const lib = app.lib();
    const mineFirst = (list) => list.filter((x) => !x.builtin).concat(list.filter((x) => x.builtin));
    els.patterns.innerHTML = mineFirst(lib.patterns).map((p) => row("pattern", p)).join("");
    els.songs.innerHTML = mineFirst(lib.songs).map((s) => row("song", s)).join("");
    els.lessons.innerHTML = lib.lessons.length
      ? lib.lessons.map(lessonRow).join("")
      : `<li class="item empty-item">No video lessons yet. Add a video (a file or a YouTube link) and mark when each strike happens.</li>`;
    storageSummary().then((t) => { els.storage.textContent = t; });
  }

  function onListClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const li = btn.closest(".item");
    const kind = li.dataset.kind;
    const item = app.lib().get(kind, li.dataset.id);
    if (!item) return;
    const act = btn.dataset.act;
    if (act === "play") app.playItem(kind, item.id);
    else if (act === "edit") open(kind, structuredClone(stripBuiltin(item)), false);
    else if (act === "copy") open(kind, { ...structuredClone(stripBuiltin(item)), id: newId(kind === "song" ? "s" : "p"), name: `${item.name} (copy)` }, true);
    else if (act === "share") share(kind, item);
    else if (act === "download") downloadLesson(item);
    else if (act === "delete") remove(kind, item);
  }

  const stripBuiltin = ({ builtin, ...rest }) => rest;

  function share(kind, item) {
    const link = shareLink(encodeShare(shareData(kind, item, app.lib())));
    let message = `Share link for “${item.name}”. Open it on another device (or send it) to add it there.`;
    if (kind === "lesson" && item.video?.type === "file") {
      message += " The video file itself isn’t in the link: the other device needs the same file, or use Download to send the lesson with its video.";
    }
    if (link.length > LONG_LINK) message += " This link is long; if a chat app cuts it off, send a file with Export or Download instead.";
    say(message, { link });
    copy(link, null, $("#libMsg .share-row button"));
  }

  function saveFile(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const slug = (name) => (String(name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lesson");

  async function downloadLesson(lesson) {
    const data = { ...exportData({ patterns: [], songs: [], lessons: [lesson] }) };
    const json = new TextEncoder().encode(JSON.stringify(data));
    const video = lesson.video?.type === "file" ? await getVideo(lesson.id) : null;
    if (video) {
      saveFile(new Blob([packageHeader(json.length), json, video], { type: "application/octet-stream" }), `${slug(lesson.name)}.taiko`);
      say(`Downloaded “${lesson.name}” with its video (${Math.round(video.size / 1e6) || 1} MB). Import this file on another device to get both.`);
    } else {
      saveFile(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${slug(lesson.name)}.json`);
      say(lesson.video?.type === "file"
        ? `Downloaded the strikes of “${lesson.name}”. Its video isn’t on this device, so it isn’t included.`
        : `Downloaded “${lesson.name}”.`);
    }
  }

  function remove(kind, item) {
    let question = `Delete “${item.name}”?`;
    if (kind === "pattern") {
      const using = app.lib().songsUsing(item.id);
      if (using.length) question += `\n\nIt is used in ${using.length} song${using.length === 1 ? "" : "s"} (${using.map((s) => s.name).join(", ")}). Those sections will be skipped.`;
    }
    if (!confirm(question)) return;
    const c = app.custom();
    const next = kind === "pattern"
      ? { ...c, patterns: c.patterns.filter((p) => p.id !== item.id) }
      : kind === "lesson"
        ? { ...c, lessons: c.lessons.filter((l) => l.id !== item.id) }
        : { ...c, songs: c.songs.filter((s) => s.id !== item.id) };
    if (kind === "lesson") deleteVideo(item.id).then(renderLists);
    if (editing && editing.draft.id === item.id) close(true);
    const ok = app.setCustom(next);
    say(ok ? `Deleted “${item.name}”.` : "Deleted for now, but this browser would not save the change.", { error: !ok });
  }

  // ---------- editors ----------
  function open(kind, draft, isNew) {
    if (editing && editing.dirty && !confirm("You have unsaved changes. Discard them?")) return;
    stopListening();
    editing = { kind, draft, isNew, dirty: false };
    if (kind === "pattern") renderPatternEditor();
    else renderSongEditor();
    renderLists();
    els.editor.scrollIntoView({ block: "nearest", behavior: "smooth" });
    $("#edName", els.editor)?.focus({ preventScroll: true });
  }

  function close(force = false) {
    if (!force && editing && editing.dirty && !confirm("You have unsaved changes. Discard them?")) return;
    stopListening();
    editing = null;
    els.editor.innerHTML = emptyEditor();
    renderLists();
  }

  function emptyEditor() {
    return `<div class="ed-empty">
      <h2>Make your own</h2>
      <p>A <b>pattern</b> is a short rhythm written in drum words, like <i>Don Doko Don Su</i>. A <b>song</b> is a list of patterns, each played a few times, one after the other.</p>
      <p>Start with “New pattern”, or “Make a copy” of a common one and change it.</p>
    </div>`;
  }

  const headerHTML = (what) => `<div class="ed-top">
      <p class="eyebrow">${editing.isNew ? `New ${what}` : `Edit ${what}`}</p>
      <h2 id="edTitle">${esc(editing.draft.name || `New ${what}`)}</h2>
    </div>`;

  const actionsHTML = (what) => `<div class="ed-actions">
      <button type="submit" class="btn primary">Save ${what}</button>
      <button type="button" class="btn" id="edListen">Listen</button>
      <button type="button" class="btn ghost" id="edClose">Close</button>
      <span class="msg" id="edMsg" role="status"></span>
    </div>`;

  function edMsg(textValue, error = false) {
    const m = $("#edMsg", els.editor);
    if (!m) return;
    m.textContent = textValue;
    m.classList.toggle("err", error);
  }

  // ----- pattern editor -----
  function renderPatternEditor() {
    const d = editing.draft;
    els.editor.innerHTML = `<form class="ed" id="edForm" novalidate>
      ${headerHTML("pattern")}
      <div class="field">
        <label for="edName">Name</label>
        <input id="edName" type="text" maxlength="80" autocomplete="off" value="${esc(d.name)}" placeholder="For example: Monday warm-up">
      </div>
      <div class="field">
        <label for="edWords">Words</label>
        <textarea id="edWords" rows="3" spellcheck="false" autocomplete="off" placeholder="Don Doko Don Su | Ka Kara Don Sore!">${esc(d.words)}</textarea>
        <p class="hint">Type the words, or tap them below. Bar lines ( | ) are optional.</p>
        <div class="palette">${palette(PALETTE)}<span class="pal-break"></span><button class="pal pal-undo" type="button" id="edUndo">Remove last word</button></div>
      </div>
      <div class="ed-preview" id="edPreview" aria-live="polite"></div>
      <div class="row">
        <div class="field small">
          <label for="edBpm">Tempo (bpm)</label>
          <input id="edBpm" type="number" min="30" max="240" step="1" inputmode="numeric" value="${d.bpm}">
        </div>
        <div class="field small">
          <label for="edDrum">Drum</label>
          <select id="edDrum">
            <option value="nagado"${d.drum === "nagado" ? " selected" : ""}>Big drum (nagadō)</option>
            <option value="shime"${d.drum === "shime" ? " selected" : ""}>Small drum (shime)</option>
          </select>
        </div>
        <label class="check" for="edSwing"><input id="edSwing" type="checkbox"${d.swing ? " checked" : ""}> Swing (long-short)</label>
      </div>
      <div class="field">
        <label for="edNotes">Notes for the player</label>
        <textarea id="edNotes" rows="2" maxlength="500" placeholder="What to listen for">${esc(d.notes)}</textarea>
      </div>
      ${actionsHTML("pattern")}
    </form>`;
    renderPatternPreview();
  }

  function readPattern() {
    const d = editing.draft;
    d.name = $("#edName", els.editor).value;
    d.words = $("#edWords", els.editor).value;
    d.bpm = Number($("#edBpm", els.editor).value);
    d.drum = $("#edDrum", els.editor).value;
    d.swing = $("#edSwing", els.editor).checked;
    d.notes = $("#edNotes", els.editor).value;
    return d;
  }

  function renderPatternPreview() {
    const { ids, unknown } = parseWords(editing.draft.words);
    const box = $("#edPreview", els.editor);
    if (!ids.length && !unknown.length) {
      box.innerHTML = `<p class="hint">Your rhythm will show up here.</p>`;
      return;
    }
    const beats = beatsOf(ids);
    const bars = beats / 4;
    box.innerHTML = `<div class="track">${tokens(ids, { drum: editing.draft.drum, attrs: (i) => `data-ti="${i}"` })}</div>
      <p class="meta">${fmtBeats(beats)} beats${Number.isInteger(bars) && bars ? ` · ${bars} bar${bars === 1 ? "" : "s"}` : " · not a whole number of 4-beat bars"}</p>
      ${unknown.length ? `<p class="msg err">Unknown word${unknown.length > 1 ? "s" : ""}: ${esc(unknown.join(", "))}. Check the spelling or use the buttons.</p>` : ""}`;
  }

  function addWord(id) {
    const ta = $("#edWords", els.editor);
    const { ids, unknown } = parseWords(ta.value);
    if (unknown.length) {
      ta.value = `${ta.value.trimEnd()} ${WORDS[id].ro}`.trim();
    } else {
      ids.push(id);
      ta.value = formatWords(ids);
    }
    readPattern();
    editing.dirty = true;
    renderPatternPreview();
  }

  function removeLastWord() {
    const ta = $("#edWords", els.editor);
    const { ids, unknown } = parseWords(ta.value);
    if (unknown.length) {
      ta.value = ta.value.trimEnd().replace(/\s*\S+$/, "");
    } else {
      ids.pop();
      ta.value = formatWords(ids);
    }
    readPattern();
    editing.dirty = true;
    renderPatternPreview();
  }

  function savePattern() {
    const d = normalizePattern(readPattern());
    const { ids, unknown } = parseWords(d.words);
    if (!ids.length) return edMsg("Add at least one word first.", true);
    if (unknown.length) return edMsg(`Fix the unknown words first: ${unknown.join(", ")}.`, true);
    const c = app.custom();
    const exists = c.patterns.some((p) => p.id === d.id);
    const next = { ...c, patterns: exists ? c.patterns.map((p) => (p.id === d.id ? d : p)) : c.patterns.concat(d) };
    const ok = app.setCustom(next);
    editing.draft = structuredClone(d);
    editing.isNew = false;
    editing.dirty = false;
    renderPatternEditor();
    renderLists();
    edMsg(ok ? "Saved." : "This browser would not save it. Export your library to keep a copy.", !ok);
  }

  // ----- song editor -----
  function renderSongEditor() {
    const d = editing.draft;
    els.editor.innerHTML = `<form class="ed" id="edForm" novalidate>
      ${headerHTML("song")}
      <div class="row">
        <div class="field grow">
          <label for="edName">Name</label>
          <input id="edName" type="text" maxlength="80" autocomplete="off" value="${esc(d.name)}" placeholder="For example: Summer festival">
        </div>
        <div class="field small">
          <label for="edBpm">Song tempo (bpm)</label>
          <input id="edBpm" type="number" min="30" max="240" step="1" inputmode="numeric" value="${d.bpm}">
        </div>
      </div>
      <h3 class="ed-sub">Sections</h3>
      <p class="hint">Each section plays one pattern a number of times. Leave a section’s tempo empty to use the song tempo.</p>
      <ol class="sections" id="edSections"></ol>
      <div class="row add-row">
        <div class="field grow">
          <label for="edAddPattern">Pattern to add</label>
          <select id="edAddPattern">${itemOptions(app.lib(), { songs: false })}</select>
        </div>
        <button type="button" class="btn" id="edAdd">Add section</button>
      </div>
      <p class="meta" id="edSummary"></p>
      <div class="field">
        <label for="edNotes">Notes for the player</label>
        <textarea id="edNotes" rows="2" maxlength="500" placeholder="What to listen for">${esc(d.notes)}</textarea>
      </div>
      ${actionsHTML("song")}
    </form>`;
    renderSections();
  }

  function patternSelect(value, i) {
    const lib = app.lib();
    const missing = !lib.pattern(value);
    return `<select data-k="patternId" aria-label="Pattern for section ${i + 1}">
      ${missing ? `<option value="${esc(value)}" selected>Missing pattern</option>` : ""}
      ${itemOptions(lib, { songs: false, selected: `pattern:${value}` }).replace(/value="pattern:/g, 'value="')}
    </select>`;
  }

  function renderSections() {
    const d = editing.draft;
    const list = $("#edSections", els.editor);
    if (!d.sections.length) {
      list.innerHTML = `<li class="sec-empty">No sections yet. Pick a pattern below and add it.</li>`;
    } else {
      list.innerHTML = d.sections.map((sec, i) => {
        const p = app.lib().pattern(sec.patternId);
        const words = p ? formatWords(parseWords(p.words).ids) : "This pattern was deleted.";
        return `<li class="sec-row" data-i="${i}">
          <span class="sec-num">${i + 1}</span>
          <div class="sec-fields">
            ${patternSelect(sec.patternId, i)}
            <label class="mini">Repeat <input type="number" data-k="repeats" min="1" max="99" value="${sec.repeats}" aria-label="Times to play section ${i + 1}"> ×</label>
            <label class="mini">Tempo <input type="number" data-k="bpm" min="30" max="240" value="${sec.bpm ?? ""}" placeholder="${d.bpm}" aria-label="Tempo for section ${i + 1}"></label>
            <span class="sec-words">${esc(words)}</span>
          </div>
          <div class="sec-btns">
            <button type="button" class="icon-btn" data-move="-1" aria-label="Move section ${i + 1} up"${i === 0 ? " disabled" : ""}>↑</button>
            <button type="button" class="icon-btn" data-move="1" aria-label="Move section ${i + 1} down"${i === d.sections.length - 1 ? " disabled" : ""}>↓</button>
            <button type="button" class="icon-btn" data-del aria-label="Remove section ${i + 1}">×</button>
          </div>
        </li>`;
      }).join("");
    }
    renderSongSummary();
  }

  function readSong() {
    const d = editing.draft;
    d.name = $("#edName", els.editor).value;
    d.bpm = Number($("#edBpm", els.editor).value);
    d.notes = $("#edNotes", els.editor).value;
    return d;
  }

  function renderSongSummary() {
    const d = normalizeSong(readSong());
    const r = resolve("song", d, app.lib());
    const box = $("#edSummary", els.editor);
    if (!r.sections.length) { box.textContent = ""; return; }
    box.textContent = `${r.sections.length} section${r.sections.length === 1 ? "" : "s"} · ${fmtBeats(totalBeats(r))} beats · about ${fmtTime(duration(r, 1))} at these tempos`;
  }

  function saveSong() {
    const d = normalizeSong(readSong());
    if (!d.sections.length) return edMsg("Add at least one section first.", true);
    const c = app.custom();
    const exists = c.songs.some((s) => s.id === d.id);
    const next = { ...c, songs: exists ? c.songs.map((s) => (s.id === d.id ? d : s)) : c.songs.concat(d) };
    const ok = app.setCustom(next);
    editing.draft = structuredClone(d);
    editing.isNew = false;
    editing.dirty = false;
    renderSongEditor();
    renderLists();
    edMsg(ok ? "Saved." : "This browser would not save it. Export your library to keep a copy.", !ok);
  }

  // ----- listen (preview) -----
  function stopListening() {
    if (listening) app.player.stop();
  }

  function listen() {
    if (listening) { app.player.stop(); return; }
    const draft = editing.kind === "pattern" ? normalizePattern(readPattern()) : normalizeSong(readSong());
    const r = resolve(editing.kind, draft, app.lib());
    const btn = $("#edListen", els.editor);
    const started = app.player.start(r, {
      factor: () => 1, loop: () => false, guide: () => true, click: () => false, countIn: false,
    }, {
      onToken(ev) {
        $$(".now", els.editor).forEach((el) => el.classList.remove("now"));
        if (editing?.kind === "pattern") $(`#edPreview .tok[data-ti="${ev.ti}"]`, els.editor)?.classList.add("now");
        else $(`.sec-row[data-i="${r.sections[ev.si].index}"]`, els.editor)?.classList.add("now");
      },
      onStop() {
        listening = false;
        $$(".now", els.editor).forEach((el) => el.classList.remove("now"));
        const b = $("#edListen", els.editor);
        if (b) b.textContent = "Listen";
      },
    });
    if (!started) return edMsg(r.problems[0] || "Nothing to play yet.", true);
    listening = true;
    btn.textContent = "Stop";
  }

  // ---------- editor events (delegated, survive re-renders) ----------
  els.editor.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!editing) return;
    stopListening();
    if (editing.kind === "pattern") savePattern();
    else saveSong();
  });

  els.editor.addEventListener("input", (e) => {
    if (!editing) return;
    editing.dirty = true;
    if (e.target.id === "edName") $("#edTitle", els.editor).textContent = e.target.value || `New ${editing.kind}`;
    if (editing.kind === "pattern") {
      readPattern();
      if (["edWords", "edDrum"].includes(e.target.id)) renderPatternPreview();
      return;
    }
    const rowEl = e.target.closest(".sec-row");
    const k = e.target.dataset.k;
    if (rowEl && (k === "repeats" || k === "bpm")) {
      const sec = editing.draft.sections[+rowEl.dataset.i];
      const v = e.target.value.trim();
      if (k === "bpm") sec.bpm = v === "" ? null : Number(v);
      else sec.repeats = Number(v) || 1;
    }
    renderSongSummary();
  });

  els.editor.addEventListener("change", (e) => {
    if (!editing || editing.kind !== "song") return;
    const rowEl = e.target.closest(".sec-row");
    if (rowEl && e.target.dataset.k === "patternId") {
      editing.draft.sections[+rowEl.dataset.i].patternId = e.target.value;
      editing.dirty = true;
      renderSections();
    }
    if (e.target.id === "edBpm") renderSections();
  });

  els.editor.addEventListener("click", (e) => {
    if (!editing) return;
    const t = e.target;
    if (t.closest("#edClose")) return close();
    if (t.closest("#edListen")) return listen();
    if (editing.kind === "pattern") {
      const add = t.closest("[data-add]");
      if (add) { addWord(add.dataset.add); app.playWord(null, add.dataset.add, editing.draft.drum); return; }
      if (t.closest("#edUndo")) return removeLastWord();
      const tok = t.closest("#edPreview .tok");
      if (tok) {
        const { ids } = parseWords(editing.draft.words);
        app.playWord(null, ids[+tok.dataset.ti], editing.draft.drum);
      }
      return;
    }
    const d = editing.draft;
    if (t.closest("#edAdd")) {
      const value = $("#edAddPattern", els.editor).value.replace(/^pattern:/, "");
      d.sections.push({ patternId: value, repeats: 2, bpm: null });
      editing.dirty = true;
      readSong();
      renderSections();
      return;
    }
    const rowEl = t.closest(".sec-row");
    if (!rowEl) return;
    const i = +rowEl.dataset.i;
    const move = t.closest("[data-move]");
    if (move) {
      const j = i + Number(move.dataset.move);
      if (j < 0 || j >= d.sections.length) return;
      [d.sections[i], d.sections[j]] = [d.sections[j], d.sections[i]];
    } else if (t.closest("[data-del]")) {
      d.sections.splice(i, 1);
    } else {
      return;
    }
    editing.dirty = true;
    readSong();
    renderSections();
  });

  // ---------- top buttons ----------
  els.patterns.addEventListener("click", onListClick);
  els.songs.addEventListener("click", onListClick);
  els.lessons.addEventListener("click", onListClick);
  els.newPattern.addEventListener("click", () =>
    open("pattern", { id: newId("p"), name: "", words: "", bpm: 90, swing: false, drum: "nagado", notes: "" }, true));
  els.newSong.addEventListener("click", () =>
    open("song", { id: newId("s"), name: "", bpm: 90, sections: [], notes: "" }, true));
  els.newLesson.addEventListener("click", () => {
    const lesson = normalizeLesson({ name: "New video lesson" });
    const c = app.custom();
    app.setCustom({ ...c, lessons: c.lessons.concat(lesson) });
    location.hash = `#lesson=${lesson.id}`;
  });

  els.exportBtn.addEventListener("click", () => {
    const c = app.custom();
    if (!c.patterns.length && !c.songs.length && !c.lessons.length) {
      say("There is nothing to export yet. Make a pattern, song or video lesson first.", { error: true });
      return;
    }
    saveFile(new Blob([JSON.stringify(exportData(c), null, 2)], { type: "application/json" }), `taiko-trainer-${new Date().toISOString().slice(0, 10)}.json`);
    const added = { patterns: c.patterns, songs: c.songs, lessons: c.lessons };
    say(`Exported ${summary(added).replace(/^Added /, "")}${c.lessons.some((l) => l.video?.type === "file") ? " Video files aren’t in this file; use Download on a lesson to send it with its video." : ""}`);
  });

  els.importFile.addEventListener("change", async () => {
    const file = els.importFile.files?.[0];
    els.importFile.value = "";
    if (!file) return;
    try {
      const head = new Uint8Array(await file.slice(0, PACKAGE_HEADER).arrayBuffer());
      const jsonLength = readPackageHeader(head);
      let data;
      let video = null;
      if (jsonLength >= 0) {
        // a lesson file: lesson JSON followed by the video
        data = JSON.parse(await file.slice(PACKAGE_HEADER, PACKAGE_HEADER + jsonLength).text());
        const mime = data.lessons?.[0]?.video?.mime || "video/mp4";
        video = file.slice(PACKAGE_HEADER + jsonLength, file.size, mime);
      } else {
        data = JSON.parse(await file.text());
      }
      const { custom, added, lessonIds } = importData(app.custom(), data);
      let stored = true;
      if (video && data.lessons?.[0]) {
        const id = lessonIds.get(data.lessons[0].id);
        if (id) stored = await putVideo(id, video);
      }
      const ok = app.setCustom(custom);
      let message = summary(added);
      if (video && !stored) message += " The video couldn’t be saved on this device (it may be full), so it plays only until you close the page.";
      if (!ok) message += " This browser would not save them, though.";
      say(message, { error: !ok || !stored });
    } catch (err) {
      say(err instanceof SyntaxError ? "That file isn’t a Taiko Trainer file." : err.message, { error: true });
    }
  });

  els.editor.innerHTML = emptyEditor();
  renderLists();
  storedVideoIds().then(renderLists);

  return {
    refresh() {
      renderLists();
      if (editing?.kind === "song") {
        // pattern names or words may have changed
        const sel = $("#edAddPattern", els.editor);
        if (sel) sel.innerHTML = itemOptions(app.lib(), { songs: false });
        renderSections();
      }
    },
    say,
  };
}

/** "Added 2 patterns, 1 song and 1 video lesson." */
export function summary(added) {
  const count = (list, one) => {
    const n = list?.length || 0;
    return n ? `${n} ${one}${n === 1 ? "" : "s"}` : "";
  };
  const parts = [count(added.patterns, "pattern"), count(added.songs, "song"), count(added.lessons, "video lesson")].filter(Boolean);
  if (!parts.length) return "Nothing new to add. You already have all of it.";
  return `Added ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0]}.`;
}
