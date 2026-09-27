'use strict';
// Wave/boss cadence + density + tech-screen cadence cores (balance pass 2026-06). These pure helpers
const assert = require('assert');
const {
  shouldOpenTechScreen,
  BOSS_WINDOW_MIN, BOSS_WINDOW_MAX, WAVE_COUNT_CAP,
  nextBossOffset, isBossWave, waveCount, isWildcardWave,
} = require('../js/core.js');

assert.strictEqual(shouldOpenTechScreen(1, false), false, 'wave 1 is pure flight — no shop');
assert.strictEqual(shouldOpenTechScreen(1, true), false, 'even a wave-1 boss does not open the shop (opener stays clean)');
assert.strictEqual(shouldOpenTechScreen(2, false), true, 'wave 2 (even) opens the shop');
assert.strictEqual(shouldOpenTechScreen(3, false), false, 'wave 3 (odd, no boss) skips the shop');
assert.strictEqual(shouldOpenTechScreen(4, false), true, 'wave 4 (even) opens the shop');
assert.strictEqual(shouldOpenTechScreen(3, true), true, 'an odd boss wave still opens the shop (restock after a boss)');
assert.strictEqual(shouldOpenTechScreen(5, true), true, 'boss override beats the even/odd cadence');

assert.ok(BOSS_WINDOW_MIN >= 1 && BOSS_WINDOW_MAX >= BOSS_WINDOW_MIN, 'sane window bounds');
for (const v of [0, 0.0001, 0.25, 0.5, 0.75, 0.999999]) {
  const off = nextBossOffset(() => v);
  assert.ok(Number.isInteger(off), 'offset is an integer for rng=' + v);
  assert.ok(off >= BOSS_WINDOW_MIN && off <= BOSS_WINDOW_MAX, 'offset within [' + BOSS_WINDOW_MIN + ',' + BOSS_WINDOW_MAX + '] for rng=' + v);
}
assert.strictEqual(nextBossOffset(() => 0), BOSS_WINDOW_MIN, 'rng=0 yields the minimum offset');
assert.strictEqual(nextBossOffset(() => 0.999999), BOSS_WINDOW_MAX, 'rng~1 yields the maximum offset');

assert.strictEqual(isBossWave(4, 5), false, 'before the scheduled boss wave');
assert.strictEqual(isBossWave(5, 5), true, 'exactly at the scheduled boss wave');
assert.strictEqual(isBossWave(6, 5), true, 'past the mark (safety: never miss a scheduled boss)');

{
  let bossWaveNext = nextBossOffset(() => 0.5);
  const gaps = [];
  let lastBoss = 0;
  let seed = 12345;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let w = 1; w <= 40; w++) {
    if (isBossWave(w, bossWaveNext)) {
      if (lastBoss > 0) gaps.push(w - lastBoss);
      lastBoss = w;
      bossWaveNext = w + nextBossOffset(rng);
    }
  }
  assert.ok(gaps.length >= 5, 'several bosses spawned over 40 waves');
  for (const g of gaps) assert.ok(g >= BOSS_WINDOW_MIN && g <= BOSS_WINDOW_MAX, 'every boss-to-boss gap is within the window: ' + g);
  assert.ok(new Set(gaps).size > 1, 'gaps vary — not a fixed metronome');
}

assert.strictEqual(WAVE_COUNT_CAP, 16, 'density cap raised to 16');
assert.strictEqual(waveCount(1, 0, WAVE_COUNT_CAP), 4, 'wave 1 -> 3 + 1 + 0 = 4');
assert.strictEqual(waveCount(0, -5, WAVE_COUNT_CAP), 2, 'clamps up to the floor of 2');
assert.strictEqual(waveCount(20, 0, WAVE_COUNT_CAP), 16, 'clamps down to the cap of 16');
assert.ok(waveCount(12, 0, WAVE_COUNT_CAP) > 10, 'density keeps growing past the OLD cap of 10');

assert.strictEqual(isWildcardWave(5, false, 0.1), true, 'low roll on a non-boss wave >=5 is a wildcard');
assert.strictEqual(isWildcardWave(5, false, 0.5), false, 'high roll is not a wildcard (kept rare)');
assert.strictEqual(isWildcardWave(4, false, 0.0), false, 'no wildcards before wave 5');
assert.strictEqual(isWildcardWave(9, true, 0.0), false, 'a boss wave is never also a wildcard');

console.log('ok - wave/boss cadence + density + tech-screen cadence cores (balance 2026-06)');
