// Development server with live reload. No dependencies.
//
//   npm run dev                 http://localhost:8000
//   PORT=3000 npm run dev       another port
//   HOST=0.0.0.0 npm run dev    reachable from a phone on the same network
//
// Serves the project folder as it is, with caching off. When a file changes,
// open pages update: stylesheets are swapped in place, anything else reloads
// the page. Saved patterns, songs and settings live in the browser, so they
// survive a reload.

import { createServer } from "node:http";
import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || "127.0.0.1";
const EVENTS = "/__dev/events";
const IGNORE = /^(\.git|node_modules|test|scripts)(\/|$)|(^|\/)\.|~$|\.sw[px]$/;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

// Runs in the page. Reconnects by itself; after the server restarts it
// reloads, since files may have changed while it was down.
const CLIENT = `<script>
(() => {
  let seen = false;
  const es = new EventSource(${JSON.stringify(EVENTS)});
  es.addEventListener("hello", () => { if (seen) location.reload(); seen = true; });
  es.addEventListener("reload", () => location.reload());
  es.addEventListener("css", (e) => {
    const changed = JSON.parse(e.data);
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      const url = new URL(link.href);
      if (url.origin !== location.origin || !changed.includes(url.pathname)) continue;
      const next = link.cloneNode();
      url.searchParams.set("v", Date.now());
      next.href = url.href;
      next.onload = () => link.remove();
      link.after(next);
    }
    console.info("[dev] updated", changed.join(", "));
  });
})();
</script>`;

const clients = new Set();

function send(event, data = "") {
  for (const res of clients) res.write(`event: ${event}\ndata: ${data}\n\n`);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === EVENTS) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write("event: hello\ndata: \n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  let path;
  try {
    path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, "index.html");
    let body = await readFile(path);
    const type = TYPES[extname(path)] || "application/octet-stream";
    if (extname(path) === ".html") body = body.toString().replace("</head>", `${CLIENT}\n</head>`);
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
  log(res.statusCode, url.pathname);
});

function log(status, path) {
  if (status !== 200) console.log(`${status} ${path}`);
}

// ---------- watching ----------
let pending = new Set();
let timer = 0;

watch(ROOT, { recursive: true }, (_event, file) => {
  if (!file) return;
  const rel = relative(ROOT, join(ROOT, file)).split(sep).join("/");
  if (IGNORE.test(rel)) return;
  pending.add(rel);
  clearTimeout(timer);
  timer = setTimeout(flush, 60); // editors write files in several steps
});

function flush() {
  const files = [...pending];
  pending = new Set();
  if (files.every((f) => f.endsWith(".css"))) {
    send("css", JSON.stringify(files.map((f) => `/${f}`)));
    console.log(`css   ${files.join(", ")}`);
  } else {
    send("reload");
    console.log(`reload ${files.join(", ")}`);
  }
}

// Keep connections open through proxies and sleeping laptops.
setInterval(() => { for (const res of clients) res.write(": ping\n\n"); }, 25000).unref();

server.listen(PORT, HOST, () => {
  const shown = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`Taiko Trainer dev server: http://${shown}:${PORT}  (live reload on, Ctrl+C to stop)`);
});
