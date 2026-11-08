// Small helpers shared by the core modules.

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function newId(prefix) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export function cleanId(v) {
  return typeof v === "string" && ID_RE.test(v) ? v : "";
}

export function text(v, max) {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function clampNum(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Bytes → URL-safe base64 without padding. */
export function toBase64Url(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe base64 → bytes. Throws on bad input. */
export function fromBase64Url(code) {
  const s = String(code);
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("bad base64");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** 83.456 → "1:23.4" */
export function fmtClock(seconds, digits = 1) {
  // round once, in whole units of the last digit, so 2.996 becomes 0:03.00 (not 0:02.00)
  const unit = 10 ** digits;
  const n = Math.round(Math.max(0, Number(seconds) || 0) * unit);
  const m = Math.floor(n / (60 * unit));
  const whole = Math.floor(n / unit) % 60;
  const frac = digits ? `.${String(n % unit).padStart(digits, "0")}` : "";
  return `${m}:${String(whole).padStart(2, "0")}${frac}`;
}

/** "1:23.4", "83.4" or "83" → seconds, or NaN. */
export function parseClock(value) {
  const s = String(value).trim();
  const m = s.match(/^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/);
  if (!m) return NaN;
  return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2].replace(",", "."));
}
