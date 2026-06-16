'use strict';
const assert = require('assert');
const { SETPIECES, setpieceFor, setpiecePlan, setpieceOutcome } = require('../js/opmap.js');

// --- setpieceFor RETIRED ---
// The genOpMap stage-coordinate keying is gone: set-pieces are now opt-in per OPERATIONS
// level row (`lvl.setpiece`, folded by levelPlan). setpieceFor is kept exported for back-compat
// glue but always returns null — no node auto-triggers an encounter by (type, stage) anymore.
['STRIKE', 'ESCORT', 'FURBALL', 'INTERCEPT', 'DEFEND', 'DEPOT', 'FINAL'].forEach(function (ty) {
  for (let stage = 0; stage < 7; stage++) {
    assert.strictEqual(setpieceFor(ty, stage), null, 'setpieceFor retired → null (' + ty + ' @ ' + stage + ')');
  }
});

// every authored id resolves to a real SETPIECES entry
['samCorridor', 'bomberRun'].forEach(function (id) {
  assert.ok(SETPIECES[id], 'authored id ' + id + ' has a data entry');
  assert.ok(SETPIECES[id].name && SETPIECES[id].intro && SETPIECES[id].outro, 'set-piece ' + id + ' carries name/intro/outro i18n keys');
  assert.ok(['sweep', 'intercept', 'escort', 'defend', 'strike'].indexOf(SETPIECES[id].mission) !== -1, 'set-piece ' + id + ' uses a real mission type');
});

// --- setpiecePlan folds the encounter onto a base plan without mutating it ---
const base = { fighters: 3, aces: 0, bombers: 9, ground: false, boss: false, rival: false, depot: false, hostileAce: true, mission: 'sweep', weather: 'storm', tod: 1 };
const corridor = setpiecePlan('samCorridor', base);
assert.strictEqual(corridor.mission, 'strike', 'SAM corridor flies the strike objective');
assert.strictEqual(corridor.ground, true, 'SAM corridor brings the ground site');
assert.strictEqual(corridor.setpiece, 'samCorridor', 'plan is tagged with the encounter id');
assert.strictEqual(corridor.weather, 'storm', 'base weather is preserved');
assert.strictEqual(corridor.tod, 1, 'base tod is preserved');
assert.strictEqual(corridor.hostileAce, true, 'base hostileAce is preserved');
assert.strictEqual(base.mission, 'sweep', 'base plan is NOT mutated (pure fold)');
assert.strictEqual(base.bombers, 9, 'base plan bombers untouched');

const bomber = setpiecePlan('bomberRun', base);
assert.strictEqual(bomber.mission, 'escort', 'bomber run flies the escort objective');
assert.strictEqual(bomber.convoy, 4, 'bomber run shepherds a 4-unit convoy');
assert.strictEqual(bomber.ground, true, 'bomber run runs the SAM lanes');
assert.strictEqual(bomber.setpiece, 'bomberRun', 'plan tagged with bomberRun');

// unknown id is a no-op fold (returns base untouched)
assert.strictEqual(setpiecePlan('nope', base), base, 'unknown encounter id leaves the base plan alone');

// --- resolution rides the shared mission win/fail seam ---
assert.strictEqual(setpieceOutcome('samCorridor', true), 'setpiece.samCorridor.outro', 'SAM corridor win shows its outro');
assert.strictEqual(setpieceOutcome('bomberRun', true), 'setpiece.bomberRun.outro', 'bomber run win shows its outro');
assert.strictEqual(setpieceOutcome('samCorridor', false), 'banner.missionFailedObj', 'a lost set-piece uses the shared fail banner');
assert.strictEqual(setpieceOutcome('bomberRun', false), 'banner.missionFailedObj', 'a lost set-piece uses the shared fail banner');

console.log('ok - setpiece: deterministic node->encounter mapping, plan fold is pure, win/fail resolution');
