// Reading a video's soundtrack: a loudness outline for the timeline's
// waveform and the moments where a drum is hit ("onsets"). Pure functions
// on raw samples, so they run (and are tested) without a browser.

export const ENV_RATE = 100; // envelope values per second (10 ms each)

/** Peak loudness (0…1) of every 10 ms, from mono samples. */
export function envelope(samples, sampleRate) {
  // exact 10 ms steps (a rounded whole-sample hop would drift: 110 samples at 11025 Hz is 9.98 ms)
  const hop = sampleRate / ENV_RATE;
  const n = Math.ceil(samples.length / hop);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let peak = 0;
    const end = Math.min(samples.length, Math.round((i + 1) * hop));
    for (let j = Math.round(i * hop); j < end; j++) {
      const v = Math.abs(samples[j]);
      if (v > peak) peak = v;
    }
    env[i] = peak;
  }
  return env;
}

/**
 * The times (seconds) where the sound suddenly gets louder — drum hits.
 * Works on the envelope: the rise in log loudness from one 10 ms step to
 * the next, kept where it stands out from its surroundings, with at least
 * `minGap` seconds between hits. `sensitivity` 0…1: higher finds softer hits.
 */
export function onsets(env, { minGap = 0.06, sensitivity = 0.5 } = {}) {
  const n = env.length;
  if (n < 3) return [];
  const flux = new Float32Array(n);
  const db = (v) => 20 * Math.log10(v + 1e-4);
  for (let i = 1; i < n; i++) flux[i] = Math.max(0, db(env[i]) - db(env[i - 1]));
  // the loudest part of the track, to ignore near-silence
  const sorted = Float32Array.from(env).sort();
  const loud = sorted[Math.floor(n * 0.98)] || 0;
  const floor = loud * (0.02 + 0.1 * (1 - sensitivity));
  const W = 50; // ±0.5 s neighbourhood
  const k = 1.2 + 2.3 * (1 - sensitivity);
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < Math.min(n, W); i++) { sum += flux[i]; cnt++; }
  const out = [];
  let last = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    if (i + W < n) { sum += flux[i + W]; cnt++; }
    if (i - W - 1 >= 0) { sum -= flux[i - W - 1]; cnt--; }
    const mean = sum / cnt;
    const f = flux[i];
    if (f < 3 || f < mean * k || f < flux[i - 1] || f < flux[i + 1]) continue;
    // the hit itself: the loudest point of the next 30 ms must be loud enough
    const peak = Math.max(env[i], env[i + 1] || 0, env[i + 2] || 0);
    if (peak < floor) continue;
    const t = i / ENV_RATE; // the step the hit falls in
    if (t - last < minGap) continue;
    out.push(Math.round(t * 1000) / 1000);
    last = t;
  }
  return out;
}
