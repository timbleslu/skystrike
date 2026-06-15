'use strict';
const assert = require('assert');
const { bossPhaseFor, nextBossPhase, BOSS_PHASE2_HP, BOSS_PHASE3_HP } = require('../js/core.js');

// ---- bossPhaseFor: correct phase at and around the thresholds ----
assert.strictEqual(bossPhaseFor(1.0), 1, 'full HP is phase 1');
assert.strictEqual(bossPhaseFor(0.61), 1, 'just above the p2 threshold is still phase 1');
assert.strictEqual(bossPhaseFor(0.6), 1, 'exactly at the p2 threshold is still phase 1 (strict <)');
assert.strictEqual(bossPhaseFor(0.59), 2, 'just below the p2 threshold is phase 2');
assert.strictEqual(bossPhaseFor(0.45), 2, 'mid-band is phase 2');
assert.strictEqual(bossPhaseFor(0.3), 2, 'exactly at the p3 threshold is still phase 2 (strict <)');
assert.strictEqual(bossPhaseFor(0.29), 3, 'just below the p3 threshold is phase 3');
assert.strictEqual(bossPhaseFor(0.0), 3, 'zero HP is phase 3');

// ---- bossPhaseFor is monotone non-increasing as HP falls ----
let prev = 1;
for (let hp = 100; hp >= 0; hp--) {
  const p = bossPhaseFor(hp / 100);
  assert.ok(p >= prev, 'phase never decreases as HP falls (hp=' + hp + ')');
  prev = p;
}
assert.strictEqual(prev, 3, 'phase reaches 3 by 0 HP');

// ---- nextBossPhase advances monotonically and only forward ----
assert.strictEqual(nextBossPhase(1, 1.0), 1, 'start: full HP stays phase 1');
assert.strictEqual(nextBossPhase(1, 0.59), 2, 'crossing p2 advances to phase 2');
assert.strictEqual(nextBossPhase(2, 0.29), 3, 'crossing p3 advances to phase 3');
assert.strictEqual(nextBossPhase(2, 0.59), 2, 're-evaluating in the same band stays put (idempotent)');
assert.strictEqual(nextBossPhase(3, 0.59), 3, 'phase never regresses even if HP is restored above a threshold');
assert.strictEqual(nextBossPhase(3, 0.9), 3, 'big HP restore still cannot drop below the reached phase');
assert.strictEqual(nextBossPhase(2, 0.05), 3, 'a single big chunk of damage can skip straight to the implied phase');

// ---- once-per-phase: simulate a drain with oscillation near each boundary; each phase fires exactly once ----
function runFight(hpSequence) {
  let phase = 1;                 // boss starts at phase 1 (matches createEnemy)
  const fired = [];             // phases at which a transition fired
  for (const hpFrac of hpSequence) {
    const np = nextBossPhase(phase, hpFrac);
    if (np > phase) { phase = np; fired.push(np); }   // the guarded transition block
  }
  return { phase, fired };
}

// drain with HP wobbling back and forth across BOTH boundaries (e.g. lifesteal / healing ticks)
const wobble = [
  1.0, 0.8, 0.62, 0.6, 0.61,         // dance on the p2 boundary, never crossing
  0.59, 0.65, 0.58, 0.7, 0.5,        // cross p2 (once), then bob above & below it
  0.4, 0.31, 0.3, 0.305,             // dance on the p3 boundary, never crossing
  0.29, 0.5, 0.28, 0.32, 0.1, 0.0,   // cross p3 (once), then bob around, drain out
];
const res = runFight(wobble);
assert.deepStrictEqual(res.fired, [2, 3], 'each phase transition fires exactly once, in order, despite HP oscillation');
assert.strictEqual(res.phase, 3, 'fight ends in phase 3');

// monotonic non-decreasing phase across the whole fight (no double-trigger, no regression)
let last = 1;
let cur = 1;
for (const hpFrac of wobble) {
  const np = nextBossPhase(cur, hpFrac);
  assert.ok(np >= last, 'phase is monotonic non-decreasing across the fight');
  cur = np; last = np;
}

// a flat fight that only ever reaches phase 2 must never emit a phase-3 transition
const onlyP2 = runFight([1.0, 0.7, 0.59, 0.45, 0.4, 0.35, 0.31, 0.45, 0.4]);
assert.deepStrictEqual(onlyP2.fired, [2], 'a boss kept above the p3 threshold only ever fires phase 2');
assert.strictEqual(onlyP2.phase, 2, 'and stays in phase 2');

// thresholds are ordered and in (0,1) — sanity guard for future tuning
assert.ok(BOSS_PHASE3_HP > 0 && BOSS_PHASE3_HP < BOSS_PHASE2_HP && BOSS_PHASE2_HP < 1, 'phase thresholds ordered within (0,1)');

console.log('ok - bossPhaseFor thresholds + nextBossPhase once-per-phase guard (monotonic, no double-trigger)');
