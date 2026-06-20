'use strict';
const assert = require('assert');
const { awardHit, awardKill, COMBO_TIMER, KILLSTREAK_INTERVAL } = require('../js/core.js');

// Mirrors of the live combat.js values these cores replaced.
const ASSIST_FRAC = 0.4;   // TP.assistFrac (globals.js)

// ============================ awardHit ============================

// ---- combo increment + timer reset ----
{
  const r = awardHit({ combo: 0 }, { amt: 30 });
  assert.strictEqual(r.combo, 1, 'first hit -> combo 1');
  assert.strictEqual(r.comboTimer, COMBO_TIMER, 'comboTimer reset to COMBO_TIMER');
  assert.strictEqual(COMBO_TIMER, 2.2, 'COMBO_TIMER matches the legacy 2.2 literal');
}
{
  const r = awardHit({ combo: 7 }, { amt: 10 });
  assert.strictEqual(r.combo, 8, 'combo increments from prior value');
}
{
  // missing combo treated as 0
  const r = awardHit({}, { amt: 10 });
  assert.strictEqual(r.combo, 1, 'absent combo defaults to 0 -> 1');
}

// ---- hit score = round(amt * (1 + combo*0.05) * scoreMul) using POST-increment combo ----
{
  const r = awardHit({ combo: 0 }, { amt: 30 });
  // combo becomes 1 -> 30 * (1 + 0.05) = 31.5 -> round 32
  assert.strictEqual(r.score, Math.round(30 * 1.05), 'hit score uses post-increment combo');
  assert.strictEqual(r.score, 32, 'concrete: 32');
}
{
  // score multiplier applies
  const r = awardHit({ combo: 0 }, { amt: 100, scoreMul: 2 });
  assert.strictEqual(r.score, Math.round(100 * 1.05 * 2), 'scoreMul multiplies hit score');
}
{
  // absent scoreMul -> 1
  const r = awardHit({ combo: 0 }, { amt: 40 });
  assert.strictEqual(r.score, Math.round(40 * 1.05 * 1), 'absent scoreMul defaults to 1');
}
{
  // float amt is NOT pre-rounded (matches legacy: round of full product)
  const r = awardHit({ combo: 0 }, { amt: 30.7 });
  assert.strictEqual(r.score, Math.round(30.7 * 1.05), 'float amt rounded only after multiply');
}

// ============================ awardKill ============================

function killEv(over) {
  return Object.assign(
    { pts: 1000, scoreMul: 1, byPlayer: true, byCCA: false,
      tpBase: 8, rpPerKill: 0, rpMul: 1, assistFrac: ASSIST_FRAC, playerDmg: 0 },
    over
  );
}

// ---- kill score = round(pts * (1 + combo*0.1) * scoreMul) using PRE-existing combo ----
{
  const r = awardKill({ combo: 0, killStreak: 0 }, killEv({ pts: 1000 }));
  assert.strictEqual(r.score, Math.round(1000 * 1 * 1), 'no combo -> base pts');
}
{
  const r = awardKill({ combo: 5, killStreak: 0 }, killEv({ pts: 1000 }));
  assert.strictEqual(r.score, Math.round(1000 * 1.5), 'combo 5 -> 1.5x kill score');
}
{
  // score multiplier applies to kill score
  const r = awardKill({ combo: 0, killStreak: 0 }, killEv({ pts: 6000, scoreMul: 3 }));
  assert.strictEqual(r.score, Math.round(6000 * 1 * 3), 'scoreMul multiplies kill score');
}

// ---- RP by source: player ----
{
  const r = awardKill({ combo: 0, killStreak: 0 }, killEv({ byPlayer: true, tpBase: 8, rpPerKill: 2, rpMul: 1 }));
  assert.strictEqual(r.rp, (8 + 2) * 1, 'player RP = (tpBase + rpPerKill) * rpMul');
}
{
  const r = awardKill({ combo: 0, killStreak: 0 }, killEv({ byPlayer: true, tpBase: 8, rpPerKill: 2, rpMul: 1.5 }));
  assert.strictEqual(r.rp, (8 + 2) * 1.5, 'rpMul multiplies player RP');
}
// ---- RP by source: CCA escort kill (half rate) ----
{
  const r = awardKill({ combo: 0, killStreak: 0 }, killEv({ byPlayer: false, byCCA: true, tpBase: 8, rpMul: 1 }));
  assert.strictEqual(r.rp, 8 * 0.5 * 1, 'CCA RP = tpBase * 0.5 * rpMul');
}
// ---- RP by source: assist (player damaged it but did not land the kill) ----
{
  const r = awardKill({ combo: 0, killStreak: 0 }, killEv({ byPlayer: false, byCCA: false, tpBase: 8, assistFrac: ASSIST_FRAC, playerDmg: 5 }));
  assert.strictEqual(r.rp, 8 * ASSIST_FRAC * 1, 'assist RP = tpBase * assistFrac * rpMul');
}
// ---- RP by source: no player damage, not CCA -> zero RP ----
{
  const r = awardKill({ combo: 0, killStreak: 0 }, killEv({ byPlayer: false, byCCA: false, playerDmg: 0 }));
  assert.strictEqual(r.rp, 0, 'no contribution -> no RP');
}
{
  // tiny playerDmg below the 0.5 threshold does not count as an assist
  const r = awardKill({ combo: 0, killStreak: 0 }, killEv({ byPlayer: false, byCCA: false, playerDmg: 0.3 }));
  assert.strictEqual(r.rp, 0, 'playerDmg <= 0.5 is not an assist');
}

// ---- killstreak increment ----
{
  const r = awardKill({ combo: 0, killStreak: 3 }, killEv());
  assert.strictEqual(r.killStreak, 4, 'killStreak increments');
  assert.strictEqual(r.streakReward, false, '4 is not an interval boundary');
}
// ---- killstreak interval boundary (every 5th kill) ----
{
  assert.strictEqual(KILLSTREAK_INTERVAL, 5, 'KILLSTREAK_INTERVAL matches the legacy %5');
  const r = awardKill({ combo: 0, killStreak: 4 }, killEv());
  assert.strictEqual(r.killStreak, 5, '5th kill');
  assert.strictEqual(r.streakReward, true, '5th kill fires the streak reward');
}
{
  const r = awardKill({ combo: 0, killStreak: 9 }, killEv());
  assert.strictEqual(r.streakReward, true, '10th kill also fires (multiple of interval)');
}
{
  const r = awardKill({ combo: 0, killStreak: 5 }, killEv());
  assert.strictEqual(r.killStreak, 6, '6th kill');
  assert.strictEqual(r.streakReward, false, '6 is not a boundary');
}

// ============================ input immutability ============================
{
  const state = { combo: 2, killStreak: 4 };
  const stateCopy = Object.assign({}, state);
  const ev = killEv({ pts: 1000 });
  const evCopy = Object.assign({}, ev);
  awardKill(state, ev);
  assert.deepStrictEqual(state, stateCopy, 'awardKill does not mutate state');
  assert.deepStrictEqual(ev, evCopy, 'awardKill does not mutate event');

  const hs = { combo: 3 };
  const hsCopy = Object.assign({}, hs);
  const he = { amt: 30, scoreMul: 2 };
  const heCopy = Object.assign({}, he);
  awardHit(hs, he);
  assert.deepStrictEqual(hs, hsCopy, 'awardHit does not mutate state');
  assert.deepStrictEqual(he, heCopy, 'awardHit does not mutate event');
}

console.log('ok - award-kill: all assertions passed');
