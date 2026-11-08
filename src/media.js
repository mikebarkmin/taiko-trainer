// One interface over two kinds of video player: the browser's own <video>
// (for files on the device and direct video links) and YouTube's embedded
// player. Both expose: time, duration, paused, waiting (buffering), ended,
// rate, play(), pause(),
// seek(t), setRate(r), setMuted(m), destroy(); `onState()` fires on changes.

import { t } from "./i18n.js";

/** A player for a file Blob or a direct URL. */
export function html5Media(host, src, { onState = () => {} } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "video-box";
  const v = document.createElement("video");
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("webkit-playsinline", "");
  v.controls = true;
  v.preload = "auto";
  const url = src instanceof Blob ? URL.createObjectURL(src) : src;
  v.src = url;
  wrap.append(v);
  host.replaceChildren(wrap);

  for (const ev of ["play", "pause", "seeked", "ended", "ratechange", "loadedmetadata", "volumechange", "waiting", "playing"]) {
    v.addEventListener(ev, () => onState(ev));
  }

  const ready = new Promise((resolve, reject) => {
    if (v.readyState >= 1) resolve();
    v.addEventListener("loadedmetadata", () => resolve(), { once: true });
    v.addEventListener("error", () => reject(new Error(t("video.cantPlay"))), { once: true });
  });

  return {
    kind: "html5",
    element: v,
    ready,
    get time() { return v.currentTime; },
    get duration() { return Number.isFinite(v.duration) ? v.duration : 0; },
    get paused() { return v.paused; },
    get waiting() { return !v.paused && v.readyState < 3; },
    get ended() { return v.ended; },
    get rate() { return v.playbackRate || 1; },
    get muted() { return v.muted; },
    play() { return v.play(); },
    pause() { v.pause(); },
    seek(t) { v.currentTime = Math.max(0, Math.min(t, this.duration || t)); },
    setRate(r) { v.playbackRate = r; },
    setMuted(m) { v.muted = m; },
    destroy() {
      v.pause();
      v.removeAttribute("src");
      v.load();
      if (src instanceof Blob) URL.revokeObjectURL(url);
      wrap.remove();
    },
  };
}

let ytPromise = null;

function loadYouTube() {
  if (globalThis.YT?.Player) return Promise.resolve(globalThis.YT);
  if (!ytPromise) {
    ytPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(t("video.ytNoLoad"))), 15000);
      const prev = globalThis.onYouTubeIframeAPIReady;
      globalThis.onYouTubeIframeAPIReady = () => {
        clearTimeout(timer);
        prev?.();
        resolve(globalThis.YT);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => { clearTimeout(timer); reject(new Error(t("video.ytUnreachable"))); };
      document.head.append(s);
    });
    ytPromise.catch(() => { ytPromise = null; });
  }
  return ytPromise;
}

/** A player for a YouTube video id. */
export function youtubeMedia(host, videoId, { onState = () => {} } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "video-box yt";
  const slot = document.createElement("div");
  wrap.append(slot);
  host.replaceChildren(wrap);

  let player = null;
  let state = -1;
  let muted = false;
  const PLAYING = 1;
  const BUFFERING = 3;
  const ENDED = 0;

  const ready = loadYouTube().then((YT) => new Promise((resolve, reject) => {
    player = new YT.Player(slot, {
      videoId,
      width: "100%",
      height: "100%",
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: () => resolve(),
        onStateChange: (e) => { state = e.data; onState("state"); },
        onPlaybackRateChange: () => onState("ratechange"),
        onError: () => reject(new Error(t("video.ytCantEmbed"))),
      },
    });
  }));

  const call = (fn, fallback) => { try { return player ? fn(player) : fallback; } catch { return fallback; } };

  return {
    kind: "youtube",
    element: wrap,
    ready,
    get time() { return call((p) => p.getCurrentTime(), 0) || 0; },
    get duration() { return call((p) => p.getDuration(), 0) || 0; },
    get paused() { return state !== PLAYING && state !== BUFFERING; },
    get waiting() { return state === BUFFERING; },
    get ended() { return state === ENDED; },
    get rate() { return call((p) => p.getPlaybackRate(), 1) || 1; },
    get muted() { return muted; },
    play() { call((p) => p.playVideo()); return Promise.resolve(); },
    pause() { call((p) => p.pauseVideo()); },
    seek(t) { call((p) => p.seekTo(Math.max(0, t), true)); },
    setRate(r) { call((p) => p.setPlaybackRate(r)); },
    setMuted(m) { muted = m; call((p) => (m ? p.mute() : p.unMute())); },
    destroy() { call((p) => p.destroy()); wrap.remove(); },
  };
}
