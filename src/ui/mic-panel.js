// The "Real drum" panel: switch the microphone on, see it hear you, set
// the sensitivity, teach it skin vs. rim, and measure its delay. The same
// panel sits on the Play screen and in the strike editor; both drive the
// one MicDrum (app.mic).

import { tapDelay, median } from "../core/edit.js";
import { esc } from "./render.js";
import { t } from "../i18n.js";

const TEACH = 4; // hits of each kind when teaching skin vs. rim

export function mountMicPanel(host, app) {
  const mic = app.mic;
  const S = app.settings;
  host.innerHTML = `
    <details class="le-more mic-panel">
      <summary>${esc(t("mic.h"))} <span class="mic-dot" aria-hidden="true"></span></summary>
      <p class="hint">${esc(t("mic.hint"))}</p>
      <div class="row">
        <button type="button" class="btn small primary" data-mic="toggle"></button>
        <span class="mic-meter" aria-hidden="true"><span></span></span>
      </div>
      <label class="mini mic-sens">${esc(t("mic.sens"))} <input type="range" min="0" max="100" step="5" data-mic="sens"></label>
      <div class="row">
        <button type="button" class="btn small" data-mic="teach">${esc(t("mic.teach"))}</button>
        <button type="button" class="btn small ghost" data-mic="forget">${esc(t("mic.forget"))}</button>
      </div>
      <div class="row">
        <div class="field small"><label>${esc(t("mic.delay"))}<input type="number" min="0" max="400" step="5" inputmode="numeric" data-mic="delay"></label></div>
        <button type="button" class="btn small" data-mic="measure">${esc(t("mic.measure"))}</button>
      </div>
      <p class="msg" data-mic="msg" role="status"></p>
    </details>`;
  const q = (k) => host.querySelector(`[data-mic="${k}"]`);
  const toggle = q("toggle");
  const sens = q("sens");
  const delay = q("delay");
  const msg = q("msg");
  const meter = host.querySelector(".mic-meter span");
  const box = host.querySelector(".mic-panel");
  let busy = false; // teaching or measuring

  const say = (text, err = false) => { msg.textContent = text; msg.classList.toggle("err", err); };

  function render() {
    toggle.textContent = t(mic.on ? "mic.stop" : "mic.start");
    toggle.classList.toggle("primary", !mic.on);
    box.classList.toggle("listening", mic.on);
    for (const k of ["teach", "measure"]) q(k).disabled = !mic.on || busy;
    q("forget").hidden = !mic.knowsRim;
    sens.value = S.micSens;
    delay.value = S.micDelay;
    if (!busy && mic.on) say(t(mic.knowsRim ? "mic.ready" : "mic.readySkin"));
    if (!mic.on) meter.style.transform = "scaleX(0)";
  }

  mic.listen("state", render);
  mic.listen("level", (v) => {
    if (box.open) meter.style.transform = `scaleX(${Math.min(1, Math.sqrt(v) * 1.6).toFixed(3)})`;
  });
  mic.listen("hit", () => {
    meter.parentElement.animate?.([{ boxShadow: "0 0 0 3px var(--shout)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 200 });
  });

  toggle.addEventListener("click", async () => {
    if (mic.on) { mic.stop(); return; }
    const ok = await mic.start();
    if (!ok) say(t(`mic.${mic.error}`), true);
  });
  sens.addEventListener("input", () => { mic.setSensitivity(Number(sens.value)); app.saveSettings(); });
  delay.addEventListener("change", () => {
    const v = Math.round(Number(delay.value));
    if (v >= 0 && v <= 400) { S.micDelay = v; app.saveSettings(); }
    delay.value = S.micDelay;
  });
  q("forget").addEventListener("click", () => { mic.forgetRim(); render(); });

  // Teach: TEACH skin hits, then TEACH rim hits.
  q("teach").addEventListener("click", () => {
    if (busy) return;
    busy = true;
    render();
    const skin = [];
    const rim = [];
    say(t("mic.hitSkin", { n: TEACH }));
    mic.capture((h) => {
      if (skin.length < TEACH) {
        skin.push(h.bright);
        say(skin.length < TEACH ? t("mic.hitSkin", { n: TEACH - skin.length }) : t("mic.hitRim", { n: TEACH }));
        return;
      }
      rim.push(h.bright);
      if (rim.length < TEACH) { say(t("mic.hitRim", { n: TEACH - rim.length })); return; }
      mic.capture(null);
      busy = false;
      const ok = mic.learn(skin, rim);
      render();
      say(t(ok ? "mic.learned" : "mic.alike", { skin: median(skin).toFixed(3), rim: median(rim).toFixed(3) }), !ok);
    });
  });

  // Measure: 16 clicks; hit the drum with each, from the 5th on.
  q("measure").addEventListener("click", () => {
    if (busy) return;
    busy = true;
    render();
    const synth = app.synth;
    const gap = 0.5;
    const t0 = synth.now() + 0.8;
    const clicks = Array.from({ length: 16 }, (_, i) => t0 + i * gap);
    clicks.forEach((c, i) => synth.click(c, i % 4 === 0));
    const hits = [];
    mic.capture((h) => hits.push(h.t));
    say(t("mic.measuring"));
    setTimeout(() => {
      mic.capture(null);
      busy = false;
      const d = tapDelay(clicks, hits);
      render();
      if (d === null) { say(t("mic.measureFailed"), true); return; }
      const out = synth.ctx?.outputLatency || synth.ctx?.baseLatency || 0;
      S.micDelay = Math.round(Math.min(400, Math.max(0, (d - out) * 1000)));
      app.saveSettings();
      delay.value = S.micDelay;
      say(t("mic.measured", { ms: S.micDelay }));
    }, (0.8 + 16 * gap + 0.4) * 1000);
  });

  render();
}
