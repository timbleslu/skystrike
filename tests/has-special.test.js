'use strict';
const assert = require('assert');

// mirror of js/combat.js hasSpecial
function hasSpecial(jet) { return !!(jet && jet.ability); }

assert.strictEqual(hasSpecial({ ability: 'OVERDRIVE' }), true, 'jet with ability has a special');
assert.strictEqual(hasSpecial({ ability: null }), false, 'ability:null jet has no special');
assert.strictEqual(hasSpecial({}), false, 'jet without ability key has no special');
assert.strictEqual(hasSpecial(null), false, 'null jet is safe');

// FT-1 STANDARD is the ability-less default jet
const fs = require('fs');
const gsrc = fs.readFileSync(__dirname + '/../js/globals.js', 'utf8');
const ft1 = gsrc.match(/\{[^{}]*id:'FT-1'[\s\S]*?\}/);
assert.ok(ft1, 'JETS must contain an FT-1 entry');
assert.ok(/ability:\s*null/.test(ft1[0]), 'FT-1 must have ability:null');
assert.ok(/passive:\s*null/.test(ft1[0]), 'FT-1 must have passive:null');
assert.ok(/shape:'STD'/.test(ft1[0]), 'FT-1 must use the STD airframe');
// FT-1 must be the first roster entry (default selection)
assert.ok(/const JETS = \[\s*\{[^{}]*id:'FT-1'/.test(gsrc.replace(/\n/g, ' ')), 'FT-1 must be JETS[0]');

console.log('ok - hasSpecial reflects presence of jet.ability');
