'use strict';
// Campaign overhaul (2026-09) pure cores: convoy routing, raider attack-run state machine, escort /
// intercept resolution, and the live star readout. Exercises the REAL implementations (core.js / meta.js).
let _kv = {};
global.store = { get(k) { return k in _kv ? _kv[k] : null; }, set(k, v) { _kv[k] = String(v); } };
const assert = require('assert');
const { convoyStep, RAID, raidMode, escortOutcome, interceptDoomed } = require('../js/core.js');
const { starExpectedKills, starCondLive, starCondMet } = require('../js/meta.js');

let n = 0;
function ok(cond, msg) { assert.ok(cond, msg); n++; }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); n++; }

// ---- convoyStep: walks the polyline, carries overshoot across corners, parks at the end ----
{
  const route = [{ x: 0, z: -100 }, { x: 100, z: -100 }];
  let s = convoyStep({ x: 0, z: 0, leg: 0 }, route, 50, 1);
  eq(s.z, -50, 'moves speed*dt toward the first point'); eq(s.leg, 0, 'still on leg 0'); eq(s.done, false, 'not done');
  s = convoyStep(s, route, 100, 1);   // 50 to the corner + 50 along the next leg
  eq(s.leg, 1, 'overshoot carries into the next leg'); eq(s.x, 50, 'corner overshoot applied on the new leg'); eq(s.dirX, 1, 'heading follows the new leg');
  s = convoyStep(s, route, 1000, 1);
  ok(s.done && s.x === 100 && s.z === -100, 'parks exactly on the last point');
  const parked = convoyStep(s, route, 1000, 1);
  ok(parked.done && parked.x === 100, 'a finished unit stays parked');
  ok(convoyStep({ x: 3, z: 4 }, [], 10, 1).done, 'empty route is immediately done');
}

// ---- raidMode: inbound → strafe → extend → inbound; breaks to engage only when THREATENED ----
{
  const far = { dPlayer: 5000, hitAgo: 99, threatened: false, dt: 0.1 };
  eq(raidMode('inbound', Object.assign({ dTarget: 3000 }, far)).mode, 'inbound', 'far from target → inbound');
  eq(raidMode('inbound', Object.assign({ dTarget: RAID.strafeR - 1 }, far)).mode, 'strafe', 'inside strafe radius → strafe');
  const ext = raidMode('strafe', Object.assign({ dTarget: RAID.passR - 1 }, far));
  ok(ext.mode === 'extend' && ext.extendT === RAID.extendTime, 'passing over the target → extend with the full pull-off timer');
  eq(raidMode('extend', Object.assign({ dTarget: 500, extendT: 0.05 }, far)).mode, 'inbound', 'extend timer runs out → inbound again');
  eq(raidMode('inbound', Object.assign({ dTarget: 3000 }, far, { dPlayer: 1400 })).mode, 'inbound', 'player merely NEAR does not pull it off the run');
  eq(raidMode('inbound', Object.assign({ dTarget: 3000 }, far, { dPlayer: 1400, threatened: true })).mode, 'engage', 'nose-on inside threatR → engage');
  eq(raidMode('strafe', Object.assign({ dTarget: 500 }, far, { hitAgo: 1 })).mode, 'engage', 'a recent hit → engage');
  eq(raidMode('inbound', Object.assign({ dTarget: 3000 }, far, { dPlayer: RAID.closeR - 1 })).mode, 'engage', 'player right on top → engage');
  eq(raidMode('engage', Object.assign({ dTarget: 3000 }, far, { dPlayer: RAID.resumeR - 1 })).mode, 'engage', 'stays engaged until the player is well clear');
  eq(raidMode('engage', Object.assign({ dTarget: 3000 }, far)).mode, 'inbound', 'player clear + no recent hit → resumes the run');
}

// ---- escortOutcome / interceptDoomed ----
{
  eq(escortOutcome(3, 0, 2), 'active', 'convoy en route, still deliverable');
  eq(escortOutcome(1, 0, 2), 'failed', 'fails the moment the required count is out of reach');
  eq(escortOutcome(1, 1, 2), 'active', 'one delivered, one still rolling');
  eq(escortOutcome(0, 2, 2), 'won', 'wins once nothing is en route and enough arrived');
  eq(interceptDoomed(1, 3, 1, true), true, 'all spawned, too few left to reach the target → doomed');
  eq(interceptDoomed(1, 3, 2, true), false, 'still reachable');
  eq(interceptDoomed(0, 3, 0, false), false, 'never doomed before every target has spawned');
}

// ---- starExpectedKills / starCondLive / alliesIntact ----
{
  eq(starExpectedKills({ expectedKills: 7 }), 7, 'uses the stamped per-level spawn count');
  eq(starExpectedKills({ waveReached: 3 }), 12, 'falls back to 4 per wave');
  eq(starExpectedKills({}), 4, 'floor of one wave');
  eq(starCondLive({ type: 'noDamage' }, { damageTaken: 0 }).state, 'track', 'no damage yet → on track');
  eq(starCondLive({ type: 'noDamage' }, { damageTaken: 5 }).state, 'fail', 'any damage → lost');
  const k = starCondLive({ type: 'kills' }, { expectedKills: 10, kills: 3 });
  ok(k.state === 'pending' && k.need === 6 && k.cur === 3, 'kills star shows cur/need against the spawned count');
  eq(starCondLive({ type: 'kills' }, { expectedKills: 10, kills: 4, ground: 2 }).state, 'met', 'ground kills count toward it');
  const f = starCondLive({ type: 'fastClear', n: 120 }, {}, { elapsed: 100 });
  ok(f.state === 'track' && f.cur === 20, 'fastClear counts down the seconds left');
  eq(starCondLive({ type: 'fastClear', n: 120 }, {}, { elapsed: 121 }).state, 'fail', 'fastClear lost once the clock passes n');
  eq(starCondLive({ type: 'alliesIntact' }, { allyLosses: 1 }).state, 'fail', 'a lost friendly fails alliesIntact live');
  eq(starCondMet({ type: 'alliesIntact' }, { missions: 1, allyLosses: 0 }), true, 'alliesIntact met: objective done, no losses');
  eq(starCondMet({ type: 'alliesIntact' }, { missions: 1, allyLosses: 1 }), false, 'alliesIntact missed with a loss');
  eq(starCondMet({ type: 'alliesIntact' }, { missions: 0, allyLosses: 0 }), false, 'alliesIntact needs the objective');
}

console.log(`ok - campaign overhaul: ${n} assertions — convoyStep, raidMode, escortOutcome, interceptDoomed, live stars, alliesIntact`);
