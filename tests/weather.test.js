'use strict';
const assert = require('assert');

// ---- mirror of js/globals.js weather core (keep byte-identical between the MIRROR markers) ----
// === MIRROR START (globals.js weather core) ===
const NIGHT_RADAR_MUL = 0.75;   // night (TOD index 2) additionally shortens radar detection
const WEATHER = {
  clear: { radarMul: 1.0, lockRangeMul: 1.0,  lockSpeedMul: 1.0,  turbulence: 0.0,  fogMul: 1.0 },
  fog:   { radarMul: 0.8, lockRangeMul: 0.65, lockSpeedMul: 1.15, turbulence: 0.05, fogMul: 3.0 },
  storm: { radarMul: 0.7, lockRangeMul: 0.6,  lockSpeedMul: 1.35, turbulence: 0.35, fogMul: 1.6 },
};
// PURE — resolve the live modifier set for a condition + time-of-day (folds the night radar
// factor). Unknown types fall back to clear. This is the pure core of engine.js applyWeather.
function resolveWeather(type, tod) {
  const w = WEATHER[type] || WEATHER.clear;
  const night = (tod === 2) ? NIGHT_RADAR_MUL : 1;
  return {
    type: WEATHER[type] ? type : 'clear',
    radarMul: w.radarMul * night,
    lockRangeMul: w.lockRangeMul,
    lockSpeedMul: w.lockSpeedMul,
    turbulence: w.turbulence,
    fogMul: w.fogMul,
  };
}
// PURE — bounded (|x| <= amp), smooth, exactly zero-mean-over-2π attitude wobble. Two
// commensurate sines (1 + 2 cycles over [0,2π]) so the integral over a full cycle is exactly 0.
function turbSample(t, amp) {
  return amp * (0.6 * Math.sin(t) + 0.4 * Math.sin(2 * t + 1.3));
}
// PURE — deterministic standalone-play weather roll, weighted toward clear (hash -> [0,1)).
function rollWeather(seed) {
  let x = (seed | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  const r = x / 4294967296;
  return r < 0.6 ? 'clear' : r < 0.8 ? 'fog' : 'storm';
}
// === MIRROR END ===

// ---- WEATHER table invariants (spec §6) ----
assert.deepStrictEqual(WEATHER.clear, { radarMul: 1.0, lockRangeMul: 1.0, lockSpeedMul: 1.0, turbulence: 0.0, fogMul: 1.0 }, 'clear is fully neutral');
assert.ok(WEATHER.storm.turbulence > WEATHER.fog.turbulence, 'storm turbulence > fog');
assert.ok(WEATHER.fog.turbulence > WEATHER.clear.turbulence, 'fog turbulence > clear');
assert.ok(WEATHER.fog.fogMul > WEATHER.storm.fogMul, 'fog density > storm density');
assert.ok(WEATHER.storm.fogMul > WEATHER.clear.fogMul, 'storm density > clear density');
['clear', 'fog', 'storm'].forEach(function (k) {
  const w = WEATHER[k];
  assert.ok(w.radarMul > 0 && w.radarMul <= 1, k + ' radarMul in (0,1]');
  assert.ok(w.lockRangeMul > 0 && w.lockRangeMul <= 1, k + ' lockRangeMul in (0,1]');
  assert.ok(w.lockSpeedMul >= 1, k + ' lockSpeedMul >= 1 (>=1 = slower lock)');
  assert.ok(w.fogMul >= 1, k + ' fogMul >= 1 (denser than neutral)');
  assert.ok(w.turbulence >= 0 && w.turbulence <= 1, k + ' turbulence in [0,1]');
});

// ---- resolveWeather populates the live set + folds the night factor ----
assert.deepStrictEqual(resolveWeather('storm', 0), { type: 'storm', radarMul: 0.7, lockRangeMul: 0.6, lockSpeedMul: 1.35, turbulence: 0.35, fogMul: 1.6 }, 'storm row (day) copied verbatim');
assert.strictEqual(resolveWeather('clear', 0).turbulence, 0, 'clear has no turbulence');
assert.strictEqual(resolveWeather('nope', 0).type, 'clear', 'unknown type falls back to clear');

// night radar factor multiplies radarMul ONLY, and only at the night TOD index (2)
assert.ok(Math.abs(resolveWeather('storm', 2).radarMul - 0.7 * NIGHT_RADAR_MUL) < 1e-9, 'night multiplies storm radarMul');
assert.strictEqual(resolveWeather('clear', 2).radarMul, NIGHT_RADAR_MUL, 'night cuts radar even in clear');
assert.strictEqual(resolveWeather('storm', 0).radarMul, 0.7, 'day leaves radarMul un-nighted');
assert.strictEqual(resolveWeather('storm', 1).radarMul, 0.7, 'dusk is not night');
assert.strictEqual(resolveWeather('fog', 2).lockRangeMul, 0.65, 'night does NOT touch lockRangeMul');
assert.strictEqual(resolveWeather('fog', 2).turbulence, 0.05, 'night does NOT touch turbulence');

// ---- turbulence sampler: bounded + zero-mean over a cycle ----
const TWO_PI = Math.PI * 2;
for (const amp of [0.05, 0.35, 1.0]) {
  let sum = 0; const N = 2000;
  for (let i = 0; i < N; i++) {
    const v = turbSample((i / N) * TWO_PI, amp);
    assert.ok(Math.abs(v) <= amp + 1e-12, 'turbSample within +/-amp (' + amp + ')');
    sum += v;
  }
  assert.ok(Math.abs(sum / N) < 1e-3, 'turbSample is ~zero-mean over a cycle (' + amp + ')');
}
assert.strictEqual(turbSample(1.234, 0), 0, 'zero amplitude -> no wobble');

// ---- rollWeather: deterministic + weighted toward clear ----
assert.strictEqual(rollWeather(42), rollWeather(42), 'same seed -> same condition');
assert.ok(['clear', 'fog', 'storm'].includes(rollWeather(7)), 'rolls a known condition');
const tally = { clear: 0, fog: 0, storm: 0 };
for (let s = 0; s < 6000; s++) tally[rollWeather(s * 2654435761)]++;
assert.ok(tally.clear > tally.fog && tally.clear > tally.storm, 'clear is the most common roll');
assert.ok(tally.clear / 6000 > 0.45, 'clear is well-represented (>45%)');
assert.ok(tally.fog > 0 && tally.storm > 0, 'fog and storm both occur');

console.log('ok - weather + TOD gameplay (modifiers, night factor, turbulence, rolls)');
