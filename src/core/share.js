// Share links: the shared items as JSON, compressed with pako (zlib
// deflate) and written as URL-safe base64 after "#share=".

import { deflate, inflate } from "../../vendor/pako.esm.mjs";
import { encodeStrikes, decodeStrikes } from "./lessons.js";
import { toBase64Url, fromBase64Url } from "./util.js";
import { APP_ID, FORMAT_VERSION } from "./library.js";

/** Links longer than this may be cut off by some chat apps. */
export const LONG_LINK = 8000;

export function encodeShare(data) {
  const compact = {
    app: APP_ID,
    version: FORMAT_VERSION,
    patterns: data.patterns || [],
    songs: data.songs || [],
    lessons: (data.lessons || []).map((l) => ({ ...l, strikes: encodeStrikes(l.strikes || []) })),
  };
  const bytes = deflate(new TextEncoder().encode(JSON.stringify(compact)), { level: 9 });
  return toBase64Url(bytes);
}

/** Throws if the link is damaged. */
export function decodeShare(code) {
  const bytes = inflate(fromBase64Url(code));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || typeof data !== "object") throw new Error("empty");
  if (Array.isArray(data.lessons)) {
    data.lessons = data.lessons.map((l) => (l && typeof l === "object" ? { ...l, strikes: decodeStrikes(l.strikes) } : l));
  }
  return data;
}

export function shareLink(code, base = `${location.origin}${location.pathname}`) {
  return `${base}#share=${code}`;
}
