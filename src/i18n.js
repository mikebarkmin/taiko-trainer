// The app's languages. English is the source; other languages fill in what
// they have and fall back to English for anything missing.
//
// UI text:   t("key", { vars }) looks up a string (or a function for plurals).
// Content:   localize("words", id) gives a language's overrides for the drum
//            words, built-in patterns and so on (English lives in the data).
// The page:  translatePage() fills elements marked with data-i18n.

import EN from "./lang/en.js";
import DE, { CONTENT as DE_CONTENT } from "./lang/de.js";

export const LANGS = { en: "English", de: "Deutsch" };
const DICTS = { en: EN, de: DE };
const CONTENTS = { en: {}, de: DE_CONTENT };
const KEY = "taiko-trainer:lang";

function detect() {
  // Only in the browser: tests always run in English.
  if (typeof document === "undefined") return "en";
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && DICTS[saved]) return saved;
  } catch { /* storage blocked */ }
  for (const l of navigator.languages || [navigator.language || ""]) {
    const base = String(l).toLowerCase().split("-")[0];
    if (DICTS[base]) return base;
  }
  return "en";
}

export let lang = detect();

/** Change the language. Saves the choice in the browser when `save` is set. */
export function setLang(next, { save = false } = {}) {
  if (!DICTS[next]) return;
  lang = next;
  if (save) {
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
  }
}

/** The text for `key` in the current language. */
export function t(key, vars = {}) {
  const v = DICTS[lang][key] ?? EN[key];
  if (v === undefined) return key;
  if (typeof v === "function") return v(vars);
  return v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** This language's overrides for one content item, or {} (English). */
export function localize(section, id) {
  return CONTENTS[lang][section]?.[id] || {};
}

/** A number with a fixed number of decimals, written the local way. */
export function num(n, digits = 0) {
  return Number(n).toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** “Quoted” the local way. */
export function quote(s) {
  return t("quote", { s });
}

/**
 * Fill in marked elements:
 *   data-i18n="key"                 text
 *   data-i18n-html="key"            markup (only for our own dictionary strings)
 *   data-i18n-attr="attr:key; …"    attributes
 */
export function translatePage(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}
