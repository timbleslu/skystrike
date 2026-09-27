'use strict';
const assert = require('assert');
const { bossPhaseFor, nextBossPhase, resolveBossPhase, BOSS_PHASE2_HP, BOSS_PHASE3_HP } = require('../js/core.js');

assert.strictEqual(bossPhaseFor(1.0), 1, 'full HP is phase 1');
assert.strictEqual(bossPhaseFor(0.61), 1, 'just above the p2 threshold is still phase 1');
assert.strictEqual(bossPhaseFor(0.6), 1, 'exactly at the p2 threshold is still phase 1 (strict <)');
assert.strictEqual(bossPhaseFor(0.59), 2, 'just below the p2 threshold is phase 2');
assert.strictEqual(bossPhaseFor(0.45), 2, 'mid-band is phase 2');
assert.strictEqual(bossPhaseFor(0.3), 2, 'exactly at the p3 threshold is still phase 2 (strict <)');
assert.strictEqual(bossPhaseFor(0.29), 3, 'just below the p3 threshold is phase 3');
assert.strictEqual(bossPhaseFor(0.0), 3, 'zero HP is phase 3');

let prev = 1;
for (let hp = 100; hp >= 0; hp--) {
  const p = bossPhaseFor(hp / 100);
  assert.ok(p >= prev, 'phase never decreases as HP falls (hp=' + hp + ')');
  prev = p;
}
assert.strictEqual(prev, 3, 'phase reaches 3 by 0 HP');

assert.strictEqual(nextBossPhase(1, 1.0), 1, 'start: full HP stays phase 1');
assert.strictEqual(nextBossPhase(1, 0.59), 2, 'crossing p2 advances to phase 2');
assert.strictEqual(nextBossPhase(2, 0.29), 3, 'crossing p3 advances to phase 3');
assert.strictEqual(nextBossPhase(2, 0.59), 2, 're-evaluating in the same band stays put (idempotent)');
assert.strictEqual(nextBossPhase(3, 0.59), 3, 'phase never regresses even if HP is restored above a threshold');
assert.strictEqual(nextBossPhase(3, 0.9), 3, 'big HP restore still cannot drop below the reached phase');
assert.strictEqual(nextBossPhase(2, 0.05), 3, 'a single big chunk of damage can skip straight to the implied phase');

function runFight(hpSequence) {
  let phase = 1;
  const fired = [];
  for (const hpFrac of hpSequence) {
    const np = nextBossPhase(phase, hpFrac);
    if (np > phase) { phase = np; fired.push(np); }
  }
  return { phase, fired };
}

const wobble = [
  1.0, 0.8, 0.62, 0.6, 0.61,
  0.59, 0.65, 0.58, 0.7, 0.5,
  0.4, 0.31, 0.3, 0.305,
  0.29, 0.5, 0.28, 0.32, 0.1, 0.0,
];
const res = runFight(wobble);
assert.deepStrictEqual(res.fired, [2, 3], 'each phase transition fires exactly once, in order, despite HP oscillation');
assert.strictEqual(res.phase, 3, 'fight ends in phase 3');

let last = 1;
let cur = 1;
for (const hpFrac of wobble) {
  const np = nextBossPhase(cur, hpFrac);
  assert.ok(np >= last, 'phase is monotonic non-decreasing across the fight');
  cur = np; last = np;
}

const onlyP2 = runFight([1.0, 0.7, 0.59, 0.45, 0.4, 0.35, 0.31, 0.45, 0.4]);
assert.deepStrictEqual(onlyP2.fired, [2], 'a boss kept above the p3 threshold only ever fires phase 2');
assert.strictEqual(onlyP2.phase, 2, 'and stays in phase 2');

assert.ok(BOSS_PHASE3_HP > 0 && BOSS_PHASE3_HP < BOSS_PHASE2_HP && BOSS_PHASE2_HP < 1, 'phase thresholds ordered within (0,1)');

const BASE = 0.9;
const warlord = [
  { descKey: 'p1', turnMul: 1.0, fireMul: 1.0, extraMissiles: 0 },
  { descKey: 'p2', turnMul: 1.0, fireMul: 1.3, extraMissiles: 2, weather: 'storm', flags: ['chaff'] },
  { descKey: 'p3', turnMul: 1.4, fireMul: 1.0, extraMissiles: 0, pattern: 'headOn' },
];
const w1 = resolveBossPhase(warlord, 1, BASE);
assert.strictEqual(w1.turnRate, BASE * 1.0, 'p1 turnRate = base × turnMul(1.0)');
assert.strictEqual(w1.fireMul, 1.0, 'p1 fireMul lands');
assert.strictEqual(w1.extraMissiles, 0, 'p1 extraMissiles lands');
assert.strictEqual(w1.pattern, null, 'p1 has no pattern → null');
assert.deepStrictEqual(w1.flags, [], 'p1 has no flags → []');
assert.strictEqual(w1.baseTurnRate, BASE, 'p1 echoes base for carry-forward');
const w2 = resolveBossPhase(warlord, 2, BASE);
assert.strictEqual(w2.turnRate, BASE * 1.0, 'p2 turnRate = base × turnMul(1.0)');
assert.strictEqual(w2.fireMul, 1.3, 'p2 fireMul lands');
assert.strictEqual(w2.extraMissiles, 2, 'p2 extraMissiles lands');
assert.deepStrictEqual(w2.flags, ['chaff'], 'p2 flags land');
assert.strictEqual(w2.pattern, null, 'p2 has no pattern → null');
const w3 = resolveBossPhase(warlord, 3, BASE);
assert.strictEqual(w3.turnRate, BASE * 1.4, 'p3 turnRate = base × turnMul(1.4)');
assert.strictEqual(w3.pattern, 'headOn', 'p3 pattern lands');
assert.deepStrictEqual(w3.flags, [], 'p3 has no flags → []');

const bare = resolveBossPhase([{ descKey: 'x' }], 1, BASE);
assert.strictEqual(bare.turnRate, BASE, 'missing turnMul → base unchanged');
assert.strictEqual(bare.fireMul, 1, 'missing fireMul → 1');
assert.strictEqual(bare.extraMissiles, 0, 'missing extraMissiles → 0');
assert.strictEqual(bare.pattern, null, 'missing pattern → null');
assert.deepStrictEqual(bare.flags, [], 'missing flags → []');

assert.strictEqual(resolveBossPhase(null, 1, BASE).turnRate, BASE, 'legacy p1 = base (never bumped)');
assert.strictEqual(resolveBossPhase(null, 2, BASE).turnRate, BASE * 1.18, 'legacy p2 = base × 1.18');
let legacyCompound = BASE; legacyCompound *= 1.18; legacyCompound *= 1.18;
assert.strictEqual(resolveBossPhase(null, 3, BASE).turnRate, legacyCompound, 'legacy p3 = compounding ×1.18×1.18 (byte-identical)');
const ln = resolveBossPhase(null, 2, BASE);
assert.strictEqual(ln.fireMul, 1, 'legacy fireMul default 1');
assert.strictEqual(ln.extraMissiles, 0, 'legacy extraMissiles default 0');
assert.strictEqual(ln.pattern, null, 'legacy pattern null');
assert.deepStrictEqual(ln.flags, [], 'legacy flags []');
assert.strictEqual(ln.baseTurnRate, BASE, 'legacy echoes base for carry-forward');

let ps = null;
let oldTurn = BASE;
for (const ph of [2, 3]) {
  const carriedBase = (ps && ps.baseTurnRate != null) ? ps.baseTurnRate : BASE;
  ps = resolveBossPhase(null, ph, carriedBase);
  oldTurn *= 1.18;
  assert.strictEqual(ps.turnRate, oldTurn, 'resolver carry-forward == old compounding at phase ' + ph);
}

console.log('ok - bossPhaseFor thresholds + nextBossPhase once-per-phase guard (monotonic) + resolveBossPhase authored/legacy phase-state');
