'use strict';
// Enemy tactical state — the evade/extend/engage decision + gun-run cadence updateEnemy runs each
const assert = require('assert');
const { enemyTacticalState, gunRunCadence } = require('../js/core.js');

const PREF = 1250, NEAR = 760;
const BPREF = 1700, BNEAR = 1150;
const base = { prefRange: PREF, nearRange: NEAR };
const g = (over) => Object.assign({ dist: 1300, incoming: false, archetype: 'duelist', lockedByPlayer: false, prefRange: PREF, nearRange: NEAR }, over);

assert.strictEqual(enemyTacticalState('engage', g({ incoming: true })), 'evade', 'incoming missile -> evade');
assert.strictEqual(enemyTacticalState('extend', g({ incoming: true, dist: 500 })), 'evade', 'incoming beats a close/extend range (rule 1 > rule 2)');
assert.strictEqual(enemyTacticalState('engage', g({ incoming: true, archetype: 'decoy', lockedByPlayer: true, dist: 1800 })), 'evade', 'incoming beats the decoy standoff (rule 1 > rule 4)');

assert.strictEqual(enemyTacticalState('engage', g({ dist: 700 })), 'extend', 'inside NEAR -> extend');
assert.strictEqual(enemyTacticalState('engage', g({ dist: NEAR - 0.01 })), 'extend', 'just inside NEAR -> extend');
assert.strictEqual(enemyTacticalState('engage', g({ dist: NEAR })), 'engage', 'exactly at NEAR is NOT extend (dist < nearRange is exclusive)');

const stick = PREF * 1.25;
assert.strictEqual(enemyTacticalState('extend', g({ dist: 1000 })), 'extend', 'sticky: was extend + inside 1.25*PREF -> stays extend');
assert.strictEqual(enemyTacticalState('engage', g({ dist: 1000 })), 'engage', 'NOT sticky from engage at the same dist -> engage (proves hysteresis)');
assert.strictEqual(enemyTacticalState('extend', g({ dist: stick - 0.01 })), 'extend', 'sticky just inside 1.25*PREF');
assert.strictEqual(enemyTacticalState('extend', g({ dist: stick })), 'engage', 'sticky window is exclusive at 1.25*PREF -> engage');
assert.strictEqual(enemyTacticalState('evade', g({ dist: 1000 })), 'engage', 'stickiness keys on prev===extend ONLY (prev=evade does not stick)');

const standoff = PREF * 1.6;
assert.strictEqual(enemyTacticalState('engage', g({ archetype: 'decoy', lockedByPlayer: true, dist: 1800 })), 'extend', 'decoy + locked + inside 1.6*PREF -> extend standoff');
assert.strictEqual(enemyTacticalState('engage', g({ archetype: 'decoy', lockedByPlayer: false, dist: 1800 })), 'engage', 'decoy but NOT locked -> engage (lockedByPlayer gates the standoff)');
assert.strictEqual(enemyTacticalState('engage', g({ archetype: 'duelist', lockedByPlayer: true, dist: 1800 })), 'engage', 'locked but NOT a decoy -> engage (archetype gates the standoff)');
assert.strictEqual(enemyTacticalState('engage', g({ archetype: 'decoy', lockedByPlayer: true, dist: standoff - 0.01 })), 'extend', 'decoy standoff just inside 1.6*PREF');
assert.strictEqual(enemyTacticalState('engage', g({ archetype: 'decoy', lockedByPlayer: true, dist: standoff })), 'engage', 'decoy standoff is exclusive at 1.6*PREF -> engage');

assert.strictEqual(enemyTacticalState('engage', g({ dist: 1300 })), 'engage', 'mid-range duelist -> engage');
assert.strictEqual(enemyTacticalState('engage', g({ dist: 5000 })), 'engage', 'far duelist -> engage');

assert.strictEqual(enemyTacticalState('engage', { dist: 1100, incoming: false, archetype: 'duelist', lockedByPlayer: false, prefRange: BPREF, nearRange: BNEAR }), 'extend', 'boss inside its wider NEAR (1150) -> extend');
assert.strictEqual(enemyTacticalState('engage', { dist: 1200, incoming: false, archetype: 'duelist', lockedByPlayer: false, prefRange: BPREF, nearRange: BNEAR }), 'engage', 'boss beyond NEAR -> engage');

assert.strictEqual(enemyTacticalState('engage', {}), 'engage', 'all-zero geometry -> engage (dist 0 < nearRange 0 is false)');
assert.strictEqual(enemyTacticalState('engage', undefined), 'engage', 'undefined opts -> engage default');

const realRandom = Math.random;
function withRandom(seq, fn) {
  let i = 0;
  Math.random = () => (i < seq.length ? seq[i++] : 0);
  try { return fn(); } finally { Math.random = realRandom; }
}

{
  const st = { gunRun: 2, gunRunCd: 5 };
  const out = gunRunCadence(st, 0.5);
  assert.strictEqual(out.gunRun, 1.5, 'live run: gunRun decremented by dt');
  assert.strictEqual(out.gunRunCd, 4.5, 'live run: gunRunCd decremented by dt');
  assert.strictEqual(out.tracking, true, 'live run: tracking true while gunRun>0');
  assert.strictEqual(st.gunRun, 2, 'input state is NOT mutated (pure)');
  assert.strictEqual(st.gunRunCd, 5, 'input state is NOT mutated (pure)');
}

{
  const out = withRandom([0.5, 0.5], () => gunRunCadence({ gunRun: 0, gunRunCd: 5 }, 0.5));
  assert.strictEqual(out.gunRun, 0, 'cooling: gunRun stays 0 (no roll while cooldown still running)');
  assert.strictEqual(out.gunRunCd, 4.5, 'cooling: gunRunCd keeps ticking down');
  assert.strictEqual(out.tracking, false, 'cooling: not tracking');
}

{
  const out = gunRunCadence({ gunRun: 0.3, gunRunCd: 3 }, 0.5);
  assert.ok(Math.abs(out.gunRun - (-0.2)) < 1e-9, 'run-end frame: gunRun decremented below 0 (roll waits for NEXT frame)');
  assert.strictEqual(out.tracking, false, 'run-end frame: tracking flips false');
}

{
  const out = withRandom([0, 1], () => gunRunCadence({ gunRun: 0, gunRunCd: 0.3 }, 0.5));
  assert.ok(Math.abs(out.gunRun - 1.6) < 1e-9, 'roll order: gunRun drawn from rand(1.6,2.8) FIRST (rng 0 -> 1.6)');
  assert.ok(Math.abs(out.gunRunCd - 4.2) < 1e-9, 'roll order: gunRunCd drawn from rand(2.2,4.2) SECOND (rng 1 -> 4.2)');
  assert.strictEqual(out.tracking, true, 'fresh run -> tracking true');
}
{
  const out = withRandom([0.5, 0.5], () => gunRunCadence({ gunRun: 0, gunRunCd: 0 }, 0.1));
  assert.ok(Math.abs(out.gunRun - 2.2) < 1e-9, 'mid rng: gunRun = 1.6+0.5*1.2 = 2.2');
  assert.ok(Math.abs(out.gunRunCd - 3.2) < 1e-9, 'mid rng: gunRunCd = 2.2+0.5*2.0 = 3.2');
}

{
  const out = withRandom([0, 0], () => gunRunCadence({}, 0.5));
  assert.ok(Math.abs(out.gunRun - 1.6) < 1e-9, 'missing state: rolls a fresh window');
  assert.strictEqual(gunRunCadence(undefined, 0.5).tracking !== undefined, true, 'undefined state does not throw');
}

console.log('enemy-state.test.js OK');
