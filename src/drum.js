// The practice drum: a nagadō-daiko seen from the player's side, with two
// sticks that swing to where each hit lands.

import { WORDS } from "./core/words.js";

const NS = "http://www.w3.org/2000/svg";
const CX = 200;
const CY = 206;
const SKIN_R = 148;
const REST = { R: [290, 292], L: [110, 292] };
const TARGET = { R: { center: [217, 212], rim: [277, 72] }, L: { center: [183, 212], rim: [123, 72] } };
let count = 0;

const reduceMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const tf = (p) => `translate(${p[0]}px, ${p[1]}px)`;

function stick(side) {
  const dx = side === "R" ? 80 : -80;
  const tag = side === "R" ? 98 : -98;
  return `<g class="bachi" data-hand="${side}">
    <line class="b-edge" x1="0" y1="0" x2="${dx}" y2="122"></line>
    <line class="b-wood" x1="0" y1="0" x2="${dx}" y2="122"></line>
    <circle class="b-tag" cx="${tag}" cy="104" r="12"></circle>
    <text class="b-tag-t" x="${tag}" y="109" text-anchor="middle">${side}</text>
  </g>`;
}

/**
 * Draw a drum into `host`. `onTap(hand, where)` fires when someone taps
 * the drum: right half = right hand, edge = rim.
 */
export function createDrum(host, { onTap } = {}) {
  const gid = `skin-grad-${++count}`;
  let tacks = "";
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    tacks += `<circle class="d-tack" cx="${(CX + 170 * Math.cos(a)).toFixed(1)}" cy="${(CY + 170 * Math.sin(a)).toFixed(1)}" r="3.4"></circle>`;
  }
  host.innerHTML = `<div class="drum-wrap">
    <svg class="drum" viewBox="0 0 400 430" role="img" aria-label="Taiko drum. Tap the middle or the rim to play it.">
      <defs><radialGradient id="${gid}" cx="50%" cy="44%" r="62%">
        <stop offset="0%" style="stop-color:var(--skin)"></stop>
        <stop offset="70%" style="stop-color:var(--skin)"></stop>
        <stop offset="100%" style="stop-color:var(--skin-2)"></stop>
      </radialGradient></defs>
      <circle class="d-body" cx="${CX}" cy="${CY}" r="178"></circle>
      ${tacks}
      <circle class="d-rim" cx="${CX}" cy="${CY}" r="162"></circle>
      <circle class="d-rim-flash" cx="${CX}" cy="${CY}" r="155"></circle>
      <circle cx="${CX}" cy="${CY}" r="${SKIN_R}" fill="url(#${gid})"></circle>
      <circle class="d-skin-flash" cx="${CX}" cy="${CY}" r="${SKIN_R}"></circle>
      <circle class="d-zone" cx="${CX}" cy="${CY}" r="58"></circle>
      <text class="d-word" x="${CX}" y="236" text-anchor="middle" font-size="86"></text>
      <g class="d-fx"></g>
      ${stick("L")}${stick("R")}
    </svg>
    <div class="bubble" hidden></div>
  </div>`;

  const svg = host.querySelector("svg");
  const word = host.querySelector(".d-word");
  const fx = host.querySelector(".d-fx");
  const bubbleEl = host.querySelector(".bubble");
  const skinFlash = host.querySelector(".d-skin-flash");
  const rimFlash = host.querySelector(".d-rim-flash");
  const sticks = { R: host.querySelector('[data-hand="R"]'), L: host.querySelector('[data-hand="L"]') };
  sticks.R.style.transform = tf(REST.R);
  sticks.L.style.transform = tf(REST.L);
  let bubbleTimer = 0;

  svg.addEventListener("pointerdown", (e) => {
    if (!onTap) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    const dx = p.x - CX;
    const d = Math.hypot(dx, p.y - CY);
    if (d > 180) return;
    e.preventDefault();
    onTap(dx >= 0 ? "R" : "L", d > SKIN_R ? "rim" : "center");
  });

  function swing(hand, target, lead) {
    const el = sticks[hand];
    if (reduceMotion() || !el.animate) return;
    const rest = tf(REST[hand]);
    const hitAt = tf(target);
    const frames = lead
      ? [{ transform: rest }, { transform: hitAt, offset: 0.35 }, { transform: rest }]
      : [{ transform: hitAt }, { transform: rest }];
    el.animate(frames, { duration: lead ? 260 : 200, easing: "cubic-bezier(.3,.6,.4,1)" });
  }

  function ripple(p, where, vol) {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("transform", `translate(${p[0]} ${p[1]})`);
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("r", where === "rim" ? 20 : vol === "big" ? 46 : vol === "medium" ? 32 : 20);
    c.setAttribute("class", `ripple ${where}`);
    g.appendChild(c);
    fx.appendChild(g);
    if (!c.animate) { setTimeout(() => g.remove(), 400); return; }
    const frames = reduceMotion()
      ? [{ opacity: 0.9 }, { opacity: 0 }]
      : [{ transform: "scale(.2)", opacity: 0.9 }, { transform: "scale(1.25)", opacity: 0 }];
    c.animate(frames, { duration: reduceMotion() ? 250 : 520, easing: "ease-out" }).onfinish = () => g.remove();
  }

  function flash(where, vol) {
    const el = where === "rim" ? rimFlash : skinFlash;
    const peak = where === "rim" ? 0.75 : vol === "small" ? 0.1 : vol === "medium" ? 0.18 : 0.28;
    el.animate?.([{ opacity: peak }, { opacity: 0 }], { duration: 300, easing: "ease-out" });
  }

  return {
    /** Show a hit. `lead`: the stick is already on its way (scheduled play). */
    hit(h, { lead = false } = {}) {
      const p = TARGET[h.hand][h.where === "rim" ? "rim" : "center"];
      swing(h.hand, p, lead);
      const show = () => { ripple(p, h.where, h.vol); flash(h.where, h.vol); };
      if (lead) setTimeout(show, 90); else show();
    },
    /** Write a word (or a count) on the drum skin. */
    setWord(textValue) {
      const t = String(textValue ?? "");
      const n = [...t].length;
      word.textContent = t;
      word.setAttribute("font-size", n <= 2 ? 86 : n === 3 ? 66 : 52);
      word.setAttribute("y", n <= 2 ? 236 : n === 3 ? 229 : 224);
    },
    /** Pop up a shout above the drum. */
    shout(id) {
      const w = WORDS[id];
      bubbleEl.replaceChildren();
      const k = document.createElement("span");
      k.lang = "ja";
      k.textContent = w.kana;
      bubbleEl.append(k, ` ${w.ro}`);
      bubbleEl.hidden = false;
      if (!reduceMotion()) {
        bubbleEl.animate?.([
          { transform: "translateX(-50%) scale(.6)", opacity: 0 },
          { transform: "translateX(-50%) scale(1.08)", opacity: 1, offset: 0.6 },
          { transform: "translateX(-50%) scale(1)", opacity: 1 },
        ], { duration: 260, easing: "ease-out" });
      }
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => { bubbleEl.hidden = true; }, 900);
    },
  };
}
