'use strict';
const assert = require('assert');
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/entities.js', 'utf8');

const fp = src.match(/const FIGHTER_SHAPES\s*=\s*(\[[^\]]*\])/);
assert.ok(fp, 'FIGHTER_SHAPES must be defined');
const pool = JSON.parse(fp[1].replace(/'/g, '"'));
assert.deepStrictEqual(pool, ['STD'], 'regular fighters must all fly the plain STD airframe');

// mirror of js/main.js wingShape
function wingShape(temp, explicit) { return explicit || (temp ? 'CCAJET' : 'STD'); }
assert.strictEqual(wingShape(false), 'STD', 'default escort flies STD');
assert.strictEqual(wingShape(true), 'CCAJET', 'CCA flies CCAJET');
assert.strictEqual(wingShape(false, 'F22'), 'F22', 'explicit shape is honored');
assert.strictEqual(wingShape(true, 'F47'), 'F47', 'explicit overrides even for temp');

console.log('ok - regular enemy fighters use STD');
