'use strict';
// Destroy-site ("STRIKE") completion. The pure predicate strikeSiteResolves decides when flattening
const assert = require('assert');
const { strikeSiteResolves } = require('../js/core.js');
const { OPERATIONS } = require('../js/opmap.js');

assert.strictEqual(strikeSiteResolves(true, null), true, 'endless strike-wave resolves the site');
assert.strictEqual(strikeSiteResolves(true, 'strike'), true, 'strike-wave + strike mission resolves');
assert.strictEqual(strikeSiteResolves(false, 'strike'), true, 'active strike mission resolves even with the flag off (the fix)');
assert.strictEqual(strikeSiteResolves(false, 'recon'), false, 'a non-strike mission never resolves a site');
assert.strictEqual(strikeSiteResolves(false, null), false, 'no strike-wave and no strike mission -> no resolve');
assert.strictEqual(strikeSiteResolves(undefined, undefined), false, 'undefined inputs -> no resolve');

const flagOffStrikePhases = [];
for (const op of OPERATIONS) for (const lvl of op.levels) {
  if (!Array.isArray(lvl.objectives)) continue;
  const hasStrikePhase = lvl.objectives.some(o => o && typeof o === 'object' && o.type === 'STRIKE');
  const flagOff = !(lvl.spawn && lvl.spawn.ground);
  if (hasStrikePhase && flagOff) flagOffStrikePhases.push(op.id + '.' + lvl.id);
}
assert.ok(flagOffStrikePhases.length > 0,
  'at least one multi-phase STRIKE level has spawn.ground:false (the bug surface)');
assert.ok(flagOffStrikePhases.includes('ironVeil.firstLight'),
  'the campaign opener firstLight is one of them (regression anchor), got: ' + flagOffStrikePhases.join(', '));
for (const id of flagOffStrikePhases) {
  assert.strictEqual(strikeSiteResolves(false, null), false, id + ': old flag-only gate would hang');
  assert.strictEqual(strikeSiteResolves(false, 'strike'), true, id + ': mission-driven gate resolves it');
}

console.log('strike-site.test.js PASS (' + flagOffStrikePhases.length + ' flag-off strike phases guarded)');
