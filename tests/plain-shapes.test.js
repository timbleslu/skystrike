'use strict';
const assert = require('assert');
const { SHAPES } = require('../js/airframes.js');   // real spec table — no source scrape

// the two plain airframes must exist and be genuinely "plain"
// (single vertical tail / no canard / no LERX; CCAJET fully tailless).
const std = SHAPES.STD;
assert.ok(std, 'STD must be defined in SHAPES');
assert.strictEqual(std.vtail && std.vtail.type, 'single', 'STD must use a single vertical tail');
assert.ok(!('canard' in std), 'STD must have no canard');
assert.strictEqual(std.lerx, false, 'STD must have no LERX');

const cca = SHAPES.CCAJET;
assert.ok(cca, 'CCAJET must be defined in SHAPES');
assert.ok(!('vtail' in cca), 'CCAJET must be tailless (no vtail)');
assert.ok(!('canard' in cca), 'CCAJET must have no canard');
assert.ok(!('htail' in cca), 'CCAJET must have no horizontal tail');

console.log('ok - SHAPES.STD plain single-tail and SHAPES.CCAJET tailless are defined');
