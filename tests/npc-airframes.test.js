'use strict';
const assert = require('assert');
const { FIGHTER_SHAPES } = require('../js/airframes.js');   // real pool — no source scrape
assert.deepStrictEqual(FIGHTER_SHAPES, ['STD'], 'regular fighters must all fly the plain STD airframe');

// mirror of js/main.js wingShape
function wingShape(temp, explicit) { return explicit || (temp ? 'CCAJET' : 'STD'); }
assert.strictEqual(wingShape(false), 'STD', 'default escort flies STD');
assert.strictEqual(wingShape(true), 'CCAJET', 'CCA flies CCAJET');
assert.strictEqual(wingShape(false, 'F22'), 'F22', 'explicit shape is honored');
assert.strictEqual(wingShape(true, 'F47'), 'F47', 'explicit overrides even for temp');

console.log('ok - regular enemy fighters use STD');
