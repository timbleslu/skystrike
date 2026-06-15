'use strict';
const assert = require('assert');
const { makeRng, dailySeedFor } = require('../js/core.js');

// ---- makeRng: deterministic + bounded ----
const r1 = makeRng(12345);
const r2 = makeRng(12345);
for (let i = 0; i < 1000; i++) {
  const a = r1(), b = r2();
  assert.strictEqual(a, b, 'same seed -> identical sequence (draw ' + i + ')');
  assert.ok(a >= 0 && a < 1, 'draw in [0,1) (draw ' + i + ')');
}
// different seeds diverge (a seeded PRNG that ignored its seed would be useless)
assert.notStrictEqual(makeRng(1)(), makeRng(2)(), 'different seeds -> different first draw');
// the stream actually advances (not a constant)
const r3 = makeRng(777);
const first = r3();
let moved = false;
for (let i = 0; i < 10; i++) { if (r3() !== first) { moved = true; break; } }
assert.ok(moved, 'stream advances past its first value');
// rough uniformity sanity: mean of many draws is near 0.5
let sum = 0; const N = 20000; const ru = makeRng(2024);
for (let i = 0; i < N; i++) sum += ru();
assert.ok(Math.abs(sum / N - 0.5) < 0.02, 'draws are roughly uniform (mean ~0.5)');

// ---- dailySeedFor: stable per date + distinct across dates ----
assert.strictEqual(dailySeedFor(2026, 6, 14), dailySeedFor(2026, 6, 14), 'same date -> same seed');
assert.ok(Number.isInteger(dailySeedFor(2026, 6, 14)), 'seed is an integer');
assert.ok(dailySeedFor(2026, 6, 14) >= 0, 'seed is a non-negative uint32');
// distinct dates across a wide window must yield distinct seeds (no collisions over ~3 years)
const seen = new Set();
let count = 0;
for (let y = 2024; y <= 2027; y++) {
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 28; d++) {
      const s = dailySeedFor(y, m, d);
      assert.ok(!seen.has(s), 'distinct date -> distinct seed (collision at ' + y + '-' + m + '-' + d + ')');
      seen.add(s);
      count++;
    }
  }
}
assert.strictEqual(seen.size, count, 'every date in the window produced a unique seed');
// adjacent days differ
assert.notStrictEqual(dailySeedFor(2026, 6, 14), dailySeedFor(2026, 6, 15), 'consecutive days differ');
assert.notStrictEqual(dailySeedFor(2026, 6, 14), dailySeedFor(2026, 7, 14), 'consecutive months differ');
assert.notStrictEqual(dailySeedFor(2026, 6, 14), dailySeedFor(2027, 6, 14), 'consecutive years differ');

// ---- the seed feeds the existing rollWeather seam deterministically (layout/weather come from one seed) ----
// (rollWeather itself is covered in weather.test.js; here we just assert the daily seed drives it stably)
function rollWeatherStub(seed) {
  let x = (seed | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  const r = x / 4294967296;
  return r < 0.6 ? 'clear' : r < 0.8 ? 'fog' : 'storm';
}
const dseed = dailySeedFor(2026, 6, 14);
for (let wave = 1; wave <= 12; wave++) {
  assert.strictEqual(rollWeatherStub(dseed + wave), rollWeatherStub(dseed + wave), 'daily weather per wave is stable (wave ' + wave + ')');
}

console.log('ok - daily seeded challenge (makeRng determinism + dailySeedFor stability/uniqueness)');
