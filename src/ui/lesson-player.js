// Video lessons on the Play screen: the video plays, the drum and the
// timeline follow it, and an optional guide drum sounds every strike.

import { WORDS } from "../core/words.js";
import { strikeWord, strikeHit } from "../core/lessons.js";
import { fmtClock, parseClock } from "../core/util.js";
import { getVideo, putVideo } from "../videostore.js";
import { html5Media, youtubeMedia } from "../media.js";
import { VideoSync } from "../videosync.js";
import { speak } from "../audio.js";
import { createLane } from "./lane.js";
import { $, esc } from "./render.js";

const sourceKey = (l) => (l?.video ? `${l.id}|${JSON.stringify(l.video)}` : "");

export function createLessonPlayer(app, { drum, setNow }) {
  const els = {
    host: $("#pvMedia"), note: $("#pvNote"), file: $("#pvFile"), fileLabel: $("#pvFileLabel"),
    speed: $("#pvSpeed"), sound: $("#pvSound"), guide: $("#pvGuide"), loop: $("#pvLoop"), speak: $("#pvSpeak"),
    from: $("#pvFrom"), to: $("#pvTo"), clearPart: $("#pvClearPart"), play: $("#pvPlay"), status: $("#pvStatus"),
    edit: $("#pvEdit"),
  };
  const S = app.settings;
  const sync = new VideoSync(app.synth);
  const lane = createLane($("#pvLane"), { zoom: 180, onSeek: (t) => media?.seek(t) });

  let lesson = null;
  let media = null;
  let key = "";
  let token = 0;
  let raf = 0;
  let active = false;
  let range = null;

  const handlers = {
    onHit: (s) => drum.hit(strikeHit(s), { lead: true }),
    onStrike: (s) => {
      const w = WORDS[strikeWord(s)];
      setNow(w.kana, w.ro);
      drum.setWord(w.kana);
    },
    onShout: (s) => {
      drum.shout(s.shout);
      if (S.speak) speak(s.shout);
    },
  };

  function note(html, isError = false) {
    els.note.hidden = !html;
    els.note.classList.toggle("err", isError);
    els.note.innerHTML = html || "";
  }

  /** Show this lesson (keeps the video if only the strikes changed). */
  async function load(l) {
    lesson = l;
    els.edit.href = `#lesson=${l.id}`;
    lane.setStrikes(l.strikes);
    if (sourceKey(l) === key && media) {
      sync.setStrikes(l.strikes);
      return;
    }
    key = sourceKey(l);
    range = null;
    renderRange();
    await mount();
  }

  async function mount(blobOverride) {
    const my = ++token;
    teardown(false);
    els.fileLabel.hidden = true;
    note("");
    const v = lesson.video;
    if (!v) {
      els.host.innerHTML = `<div class="video-empty">This lesson has no video yet</div>`;
      note(`Open the editor to add a video and mark the strikes.`);
      return;
    }
    let src = blobOverride || null;
    if (v.type === "file" && !src) {
      src = await getVideo(lesson.id);
      if (my !== token) return;
      if (!src) {
        els.host.innerHTML = `<div class="video-empty">The video isn’t on this device</div>`;
        note(`This lesson uses the video file “${esc(v.name || "video")}”. Choose that file to play along.`);
        els.fileLabel.hidden = false;
        return;
      }
    }
    els.host.innerHTML = `<div class="video-empty">Loading video…</div>`;
    try {
      const onState = () => renderButton();
      media = v.type === "youtube" ? youtubeMedia(els.host, v.videoId, { onState }) : html5Media(els.host, src || v.url, { onState });
      await media.ready;
      if (my !== token) return;
      media.setRate(S.videoRate);
      media.setMuted(!S.videoSound);
      lane.setDuration(media.duration || v.duration || 0);
      sync.attach(media, lesson.strikes, {
        guide: () => S.videoGuide,
        loop: () => S.loop,
        range: () => range,
      }, handlers);
      if (v.type === "youtube") note("If Play doesn’t start the video, tap the video itself once.");
      if (!lesson.strikes.length) note("No strikes marked yet. Open the editor to add them.");
      renderButton();
      if (active) startLoop();
    } catch (err) {
      if (my !== token) return;
      media = null;
      els.host.innerHTML = `<div class="video-empty err">${esc(err.message || "The video couldn’t be loaded.")}</div>`;
    }
  }

  function teardown(forget = true) {
    token += forget ? 1 : 0;
    sync.detach();
    media?.destroy();
    media = null;
    if (forget) key = "";
  }

  function renderButton() {
    const playing = media && !media.paused;
    els.play.innerHTML = playing
      ? `<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1" width="2.5" height="8"></rect><rect x="6" y="1" width="2.5" height="8"></rect></svg>Pause`
      : `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 .5 9.5 5 1 9.5z"></path></svg>Play`;
    els.play.classList.toggle("is-playing", !!playing);
    els.play.disabled = !media;
  }

  function renderRange() {
    els.from.value = range ? fmtClock(range.start, 1) : "";
    els.to.value = range ? fmtClock(range.end, 1) : "";
    els.clearPart.disabled = !range;
    lane.setRange(range);
  }

  function setRangeFrom(which, value) {
    const t = value === "now" ? media?.time : parseClock(value);
    if (!Number.isFinite(t)) { renderRange(); return; }
    const dur = media?.duration || lesson?.video?.duration || t + 10;
    const start = which === "start" ? t : range?.start ?? 0;
    const end = which === "end" ? t : range?.end ?? dur;
    range = end - start >= 0.3 ? { start: Math.max(0, start), end } : null;
    renderRange();
    // jump into the part right away when the video is outside it
    if (range && media && !media.paused && (media.time < range.start || media.time >= range.end)) media.seek(range.start);
  }

  function startLoop() {
    cancelAnimationFrame(raf);
    const frame = () => {
      if (media) {
        const t = media.time;
        lane.setTime(t, !media.paused);
        els.status.textContent = `${fmtClock(t, 1)} / ${fmtClock(media.duration || lesson?.video?.duration || 0, 1)}${S.videoRate !== 1 ? ` · ${S.videoRate}× speed` : ""}`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  function toggle() {
    if (!media) return;
    app.synth.ensure();
    if (media.paused) {
      if (range && (media.time < range.start || media.time >= range.end - 0.05)) media.seek(range.start);
      const p = media.play();
      p?.catch?.(() => note("The browser blocked playing. Tap the video itself to start it.", true));
    } else {
      media.pause();
    }
  }

  // ---------- wiring ----------
  els.speed.value = String(S.videoRate);
  els.sound.checked = S.videoSound;
  els.guide.checked = S.videoGuide;
  els.loop.checked = S.loop;
  els.speak.checked = S.speak;
  els.speed.addEventListener("change", () => { S.videoRate = Number(els.speed.value); app.saveSettings(); media?.setRate(S.videoRate); });
  els.sound.addEventListener("change", () => { S.videoSound = els.sound.checked; app.saveSettings(); media?.setMuted(!S.videoSound); });
  els.guide.addEventListener("change", () => { S.videoGuide = els.guide.checked; app.saveSettings(); });
  els.loop.addEventListener("change", () => { S.loop = els.loop.checked; app.saveSettings(); });
  els.speak.addEventListener("change", () => { S.speak = els.speak.checked; app.saveSettings(); });
  els.play.addEventListener("click", toggle);
  els.from.addEventListener("change", () => setRangeFrom("start", els.from.value));
  els.to.addEventListener("change", () => setRangeFrom("end", els.to.value));
  $("#pvFromNow").addEventListener("click", () => setRangeFrom("start", "now"));
  $("#pvToNow").addEventListener("click", () => setRangeFrom("end", "now"));
  els.clearPart.addEventListener("click", () => { range = null; renderRange(); });
  els.file.addEventListener("change", async () => {
    const f = els.file.files?.[0];
    els.file.value = "";
    if (!f || !lesson) return;
    const v = lesson.video;
    const stored = await putVideo(lesson.id, f);
    mount(f);
    if (v?.size && v.size !== f.size) note("This file isn’t the same size as the original, so the strikes may not line up.", true);
    else if (!stored) note("This browser wouldn’t save the video, so it plays only until you close the page.", true);
  });

  return {
    load,
    toggle,
    /** The Play screen is shown or hidden. */
    setActive(on) {
      active = on;
      if (on) startLoop();
      else { cancelAnimationFrame(raf); media?.pause(); }
    },
    unload() {
      cancelAnimationFrame(raf);
      teardown(true);
      lesson = null;
      els.host.replaceChildren();
    },
  };
}
