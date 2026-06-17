'use strict';
const assert = require('assert');

// mirror of js/combat.js hasSpecial
function hasSpecial(jet) { return !!(jet && jet.ability); }

assert.strictEqual(hasSpecial({ ability: 'OVERDRIVE' }), true, 'jet with ability has a special');
assert.strictEqual(hasSpecial({ ability: null }), false, 'ability:null jet has no special');
assert.strictEqual(hasSpecial({}), false, 'jet without ability key has no special');
assert.strictEqual(hasSpecial(null), false, 'null jet is safe');

// FT-1 STANDARD is the ability-less default jet — assert against the REAL roster
// (js/roster.js is require-safe) instead of regex-scraping the source file.
const { JETS } = require('../js/roster.js');
const ft1 = JETS.find(j => j.id === 'FT-1');
assert.ok(ft1, 'JETS must contain an FT-1 entry');
assert.strictEqual(ft1.ability, null, 'FT-1 must have ability:null');
assert.strictEqual(ft1.passive, null, 'FT-1 must have passive:null');
assert.strictEqual(ft1.shape, 'STD', 'FT-1 must use the STD airframe');
assert.strictEqual(JETS[0].id, 'FT-1', 'FT-1 must be JETS[0] (default selection)');

console.log('ok - hasSpecial reflects presence of jet.ability');
