// Video files live in IndexedDB (localStorage is far too small for video).
// Keyed by lesson id. Everything stays on this device.

const DB_NAME = "taiko-trainer";
const STORE = "videos";
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error("This browser cannot store videos.")); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Could not open storage."));
      req.onblocked = () => reject(new Error("Close other Taiko Trainer tabs and try again."));
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function run(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error || req?.error || new Error("Storage failed."));
    tx.onabort = () => reject(tx.error || new Error(tx.error?.name === "QuotaExceededError" ? "The device is out of space for videos." : "Storage failed."));
  }));
}

// Videos that could not be stored stay usable until the page closes.
const memory = new Map();

/**
 * Store a video. Resolves true when saved on the device, or false when the
 * browser refused (out of space, private mode); then it is kept only until
 * the page closes.
 */
export async function putVideo(id, blob) {
  memory.set(id, blob);
  try {
    await run("readwrite", (s) => s.put(blob, id));
    memory.delete(id);
    (await storedVideoIds()).add(id);
    requestPersist();
    return true;
  } catch {
    return false;
  }
}

/** The stored video as a Blob, or null. */
export async function getVideo(id) {
  if (memory.has(id)) return memory.get(id);
  try {
    const v = await run("readonly", (s) => s.get(id));
    return v instanceof Blob ? v : null;
  } catch {
    return null;
  }
}

export async function deleteVideo(id) {
  memory.delete(id);
  try { await run("readwrite", (s) => s.delete(id)); } catch { /* nothing to delete */ }
  known?.delete(id);
}

let known = null;

/** Ids of lessons whose video is stored here. Cached after the first call. */
export async function storedVideoIds() {
  if (!known) {
    try {
      known = new Set(await run("readonly", (s) => s.getAllKeys()));
    } catch {
      known = new Set();
    }
  }
  return known;
}

export function hasVideo(id) {
  return memory.has(id) || !!known?.has(id);
}

let asked = false;
/** Ask the browser not to clear our storage when space runs low. */
export function requestPersist() {
  if (asked) return;
  asked = true;
  try { navigator.storage?.persist?.().catch(() => {}); } catch { /* optional */ }
}

/** "120 MB used of 2 GB" or "" if the browser won't say. */
export async function storageSummary() {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e || !e.quota) return "";
    const mb = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);
    return `${mb(e.usage || 0)} used of about ${mb(e.quota)} this browser allows.`;
  } catch {
    return "";
  }
}
