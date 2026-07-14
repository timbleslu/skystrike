'use strict';
// Operations objective SEQUENCE (multi-phase levels). PURE phase-queue helpers imported from the
// REAL implementation in js/core.js (no mirror copy), plus invariant checks against the REAL
// converted OPERATIONS data in js/opmap.js (require-safe). Covers: the queue arithmetic, the
// per-phase distinct-type count, and that every previously-flagged level now runs >=2 distinct
// objective types with <=2 fly-to-waypoints (the Req A audit's cap).
const assert = require('assert');
const { nextObjectivePhase, objectiveTypes } = require('../js/core.js');
const { OPERATIONS } = require('../js/opmap.js');

// ===== nextObjectivePhase: walk the queue, -1 when exhausted =====
assert.strictEqual(nextObjectivePhase(0, 3), 1, 'phase 0 -> 1');
assert.strictEqual(nextObjectivePhase(1, 3), 2, 'phase 1 -> 2');
assert.strictEqual(nextObjectivePhase(2, 3), -1, 'last phase -> done (-1)');
assert.strictEqual(nextObjectivePhase(0, 1, ), -1, 'single-phase -> done immediately after it wins');
assert.strictEqual(nextObjectivePhase(5, 3), -1, 'out-of-range index -> done');

// ===== objectiveTypes: normalize string OR {type,...} descriptors to a type list =====
assert.deepStrictEqual(
  objectiveTypes(['RECON', { type: 'STRIKE', spawn: { ground: true } }, { type: 'SWEEP' }]),
  ['RECON', 'STRIKE', 'SWEEP'], 'mixes string + object descriptors');
assert.deepStrictEqual(objectiveTypes(null), [], 'null queue -> empty');
assert.deepStrictEqual(objectiveTypes([]), [], 'empty queue -> empty');

// ===== converted-level data invariants (the 6 previously-flagged levels) =====
const FLAGGED = [
  ['ironVeil', 'firstLight'], ['ironVeil', 'blindspot'],
  ['midnightMeridian', 'deadChannel'], ['midnightMeridian', 'ghostSignal'],
  ['sunfireHorizon', 'deadReckoning'], ['sunfireHorizon', 'silentEntry'],
  ['polarVortex', 'iceBreaker'], ['polarVortex', 'whiteout'],   // F6 op4: two authored objective sequences
];
const NAV = { RECON: 4, STEALTH: 1 };   // default fly-to-waypoints a nav objective lays
function flyToOf(o) { return (o && typeof o === 'object' && o.wp != null) ? o.wp : (NAV[typeof o === 'string' ? o : o.type] || 0); }

for (const [opId, levelId] of FLAGGED) {
  const op = OPERATIONS.find(o => o.id === opId);
  assert.ok(op, 'op exists: ' + opId);
  const lvl = op.levels.find(l => l.id === levelId);
  assert.ok(lvl, 'level exists: ' + opId + '.' + levelId);
  assert.ok(Array.isArray(lvl.objectives) && lvl.objectives.length >= 2,
    opId + '.' + levelId + ' has an objectives sequence of >=2 phases');
  const types = objectiveTypes(lvl.objectives);
  const distinct = new Set(types).size;
  assert.ok(distinct >= 2, opId + '.' + levelId + ' runs >=2 DISTINCT objective types (got ' + types.join('->') + ')');
  const flyTo = lvl.objectives.reduce((s, o) => s + flyToOf(o), 0);
  assert.ok(flyTo <= 2, opId + '.' + levelId + ' lays <=2 fly-to-waypoints (got ' + flyTo + ')');
  // every flagged level opens with its identity-preserving navigation leg
  assert.ok(['RECON', 'STEALTH'].includes(types[0]), opId + '.' + levelId + ' opens with a nav leg');
}

// ===== no NON-flagged level was given an objectives array (Req C scope discipline) =====
let converted = 0;
for (const op of OPERATIONS) for (const lvl of op.levels) {
  if (Array.isArray(lvl.objectives)) {
    converted++;
    assert.ok(FLAGGED.some(([o, l]) => o === op.id && l === lvl.id),
      'only previously-flagged levels carry an objectives sequence: ' + op.id + '.' + lvl.id);
  }
}
assert.strictEqual(converted, 8, 'exactly the 8 flagged levels were converted (6 base + 2 op4)');

console.log('objective-phases.test.js PASS');
