'use strict';
const assert = require('assert');
const { SETPIECES, setpieceFor, setpiecePlan, setpieceOutcome } = require('../js/opmap.js');

// --- deterministic node -> encounter mapping ---
assert.strictEqual(setpieceFor('STRIKE', 1), 'samCorridor', 'STRIKE @ stage 1 is the SAM corridor');
assert.strictEqual(setpieceFor('ESCORT', 4), 'bomberRun', 'ESCORT @ stage 4 is the bomber run');
// same coordinates always resolve the same way (pure + stable)
assert.strictEqual(setpieceFor('STRIKE', 1), setpieceFor('STRIKE', 1), 'selection is deterministic');
// non-authored nodes never trigger a set-piece (procedural sectors untouched)
assert.strictEqual(setpieceFor('STRIKE', 4), null, 'STRIKE at the wrong stage is procedural');
assert.strictEqual(setpieceFor('ESCORT', 1), null, 'ESCORT at the wrong stage is procedural');
assert.strictEqual(setpieceFor('FURBALL', 0), null, 'FURBALL is always procedural');
assert.strictEqual(setpieceFor('INTERCEPT', 1), null, 'INTERCEPT is always procedural');
assert.strictEqual(setpieceFor('DEFEND', 2), null, 'DEFEND is always procedural');
assert.strictEqual(setpieceFor('DEPOT', 3), null, 'DEPOT is always procedural');
assert.strictEqual(setpieceFor('FINAL', 6), null, 'FINAL stays the boss, not a set-piece');

// exactly two authored campaign nodes across the whole fixed map (1–2 per campaign)
const STAGES = [
  ['FURBALL', 'INTERCEPT'],
  ['STRIKE', 'ESCORT'],
  ['DEFEND', 'FURBALL'],
  ['DEPOT', 'INTERCEPT'],
  ['ESCORT', 'STRIKE'],
  ['ELITE', 'DEFEND'],
  ['FINAL'],
];
let authored = 0;
for (let s = 0; s < STAGES.length; s++) {
  for (let i = 0; i < STAGES[s].length; i++) {
    if (setpieceFor(STAGES[s][i], s)) authored++;
  }
}
assert.strictEqual(authored, 2, 'exactly two authored set-piece nodes in the campaign');

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
