'use strict';
const assert = require('assert');
const { WEATHER, NIGHT_RADAR_MUL, resolveWeather, rollWeather } = require('../js/core.js');

// ---- WEATHER table invariants (spec §6) ----
assert.deepStrictEqual(WEATHER.clear, { radarMul: 1.0, lockRangeMul: 1.0, lockSpeedMul: 1.0, fogMul: 1.0 }, 'clear is fully neutral');
assert.ok(WEATHER.fog.fogMul > WEATHER.storm.fogMul, 'fog density > storm density');
assert.ok(WEATHER.storm.fogMul > WEATHER.clear.fogMul, 'storm density > clear density');
['clear', 'fog', 'storm'].forEach(function (k) {
  const w = WEATHER[k];
  assert.ok(w.radarMul > 0 && w.radarMul <= 1, k + ' radarMul in (0,1]');
  assert.ok(w.lockRangeMul > 0 && w.lockRangeMul <= 1, k + ' lockRangeMul in (0,1]');
  assert.ok(w.lockSpeedMul >= 1, k + ' lockSpeedMul >= 1 (>=1 = slower lock)');
  assert.ok(w.fogMul >= 1, k + ' fogMul >= 1 (denser than neutral)');
});

// ---- resolveWeather populates the live set + folds the night factor ----
assert.deepStrictEqual(resolveWeather('storm', 0), { type: 'storm', radarMul: 0.7, lockRangeMul: 0.6, lockSpeedMul: 1.35, fogMul: 5.7 }, 'storm row (day) copied verbatim (fogMul raised 1.6→5.7 for Track B dramatic fog)');
// weather-FX detection targets: storm cuts enemy detection ~20% (radar 0.7), fog ~40% (radar 0.6 — raised from 0.8)
assert.strictEqual(resolveWeather('storm', 0).radarMul, 0.7, 'storm cuts enemy detection ~20%');
assert.strictEqual(resolveWeather('fog', 0).radarMul, 0.6, 'fog cuts enemy detection ~40% (weather-FX pass)');
assert.strictEqual(resolveWeather('nope', 0).type, 'clear', 'unknown type falls back to clear');

// night radar factor multiplies radarMul ONLY, and only at the night TOD index (2)
assert.ok(Math.abs(resolveWeather('storm', 2).radarMul - 0.7 * NIGHT_RADAR_MUL) < 1e-9, 'night multiplies storm radarMul');
assert.strictEqual(resolveWeather('clear', 2).radarMul, NIGHT_RADAR_MUL, 'night cuts radar even in clear');
assert.strictEqual(resolveWeather('storm', 0).radarMul, 0.7, 'day leaves radarMul un-nighted');
assert.strictEqual(resolveWeather('storm', 1).radarMul, 0.7, 'dusk is not night');
assert.strictEqual(resolveWeather('fog', 2).lockRangeMul, 0.65, 'night does NOT touch lockRangeMul');

// ---- rollWeather: deterministic + weighted toward clear ----
assert.strictEqual(rollWeather(42), rollWeather(42), 'same seed -> same condition');
assert.ok(['clear', 'fog', 'storm'].includes(rollWeather(7)), 'rolls a known condition');
const tally = { clear: 0, fog: 0, storm: 0 };
for (let s = 0; s < 6000; s++) tally[rollWeather(s * 2654435761)]++;
assert.ok(tally.clear > tally.fog && tally.clear > tally.storm, 'clear is the most common roll');
assert.ok(tally.clear / 6000 > 0.45, 'clear is well-represented (>45%)');
assert.ok(tally.fog > 0 && tally.storm > 0, 'fog and storm both occur');

console.log('ok - weather + TOD gameplay (modifiers, night factor, rolls)');
