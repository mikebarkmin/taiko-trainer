// Keeps a copy of the app so it opens without internet (and can be added
// to the home screen). Always tries the network first, so updates show up
// right away when online. Videos and YouTube are never cached here.

const CACHE = "taiko-trainer-v2";
const SHELL = [
    "./",
    "index.html",
    "styles.css",
    "manifest.webmanifest",
    "icons/apple-touch-icon.png",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
    "icons/icon.svg",
    "src/audio.js",
    "src/core/lessons.js",
    "src/core/library.js",
    "src/core/share.js",
    "src/core/timeline.js",
    "src/core/util.js",
    "src/core/words.js",
    "src/drum.js",
    "src/main.js",
    "src/media.js",
    "src/player.js",
    "src/store.js",
    "src/ui/lane.js",
    "src/ui/lesson-editor.js",
    "src/ui/lesson-player.js",
    "src/ui/library.js",
    "src/ui/play.js",
    "src/ui/render.js",
    "src/ui/words.js",
    "src/videostore.js",
    "src/videosync.js",
    "vendor/pako.esm.mjs",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))),
  );
});
