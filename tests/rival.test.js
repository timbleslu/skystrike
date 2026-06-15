'use strict';
const assert = require('assert');

// store stub so js/rival.js (which references store inside loadRival/saveRival/genRival)
// loads + runs cleanly under Node. Pure cores tested below don't touch it.
global.store = { get: () => null, set: () => {} };

const { rivalDue, rivalHpFor, rivalPayout, pickTrait, validRival, rivalSpecialFor } = require('../js/rival.js');

// cadence
assert.strictEqual(rivalDue(5, 0, true), true, 'first rival at wave 5');
assert.strictEqual(rivalDue(4, 0, true), false, 'not before wave 5');
assert.strictEqual(rivalDue(8, 5, true), false, 'wave 8 is a boss wave');
assert.strictEqual(rivalDue(9, 5, true), true, 'wave 9: 4 waves after last, not boss');
assert.strictEqual(rivalDue(7, 5, true), false, 'only 2 waves since last appearance');
assert.strictEqual(rivalDue(9, 5, false), false, 'toggle off kills the cadence');

// escalation + payout
assert.strictEqual(rivalHpFor(5, 1), 215, 'level 1 = ace baseline at wave 5');
assert.strictEqual(rivalHpFor(5, 3), Math.round(215 * 1.69), 'level 3 = x1.3^2');
assert.strictEqual(rivalPayout(1), 250); assert.strictEqual(rivalPayout(5), 650);

// traits
assert.strictEqual(pickTrait({missiles: 9, gunKills: 1, wingmen: 0}, []), 'FLARE_WALL');
assert.strictEqual(pickTrait({missiles: 1, gunKills: 9, wingmen: 0}, []), 'SCISSORS');
assert.strictEqual(pickTrait({missiles: 0, gunKills: 0, wingmen: 3}, []), 'HEADHUNTER');
assert.strictEqual(pickTrait({missiles: 0, gunKills: 0, wingmen: 0}, []), 'VETERAN');
assert.strictEqual(pickTrait({missiles: 9, gunKills: 1, wingmen: 0}, ['FLARE_WALL']), 'VETERAN', 'skips owned, falls back');
assert.strictEqual(pickTrait({missiles: 9, gunKills: 0, wingmen: 2}, ['FLARE_WALL']), 'HEADHUNTER', 'next candidate');

// persistence shape
const fresh = { name: 'VULTURE', shape: 'SU57', jetName: 'SU-57 FELON', level: 1, traits: [], profile: {missiles:0,gunKills:0,flares:0,wingmen:0}, encounters: 0, board: [] };
assert.ok(validRival(fresh), 'fresh rival validates');
assert.ok(validRival(JSON.parse(JSON.stringify(fresh))), 'round-trips');
assert.ok(!validRival(null) && !validRival({}) && !validRival({name:'X'}), 'garbage rejected');
const lvl9 = JSON.parse(JSON.stringify(fresh)); lvl9.level = 9;
assert.ok(!validRival(lvl9), 'level out of range rejected');

assert.strictEqual(rivalSpecialFor('J20'), 'VOLLEY');
assert.strictEqual(rivalSpecialFor('F47'), 'FLARESTORM');
assert.strictEqual(rivalSpecialFor('SU57'), 'GHOST');
assert.strictEqual(rivalSpecialFor('F22'), 'OVERDRIVE');
assert.strictEqual(rivalSpecialFor('WHATEVER'), 'OVERDRIVE', 'unknown shapes default safely');

console.log('ok - rival cadence, escalation, traits, persistence validate');
