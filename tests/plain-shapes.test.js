'use strict';
const assert = require('assert');
const fs = require('fs');

// Read the production SHAPES source and assert the two new plain airframes exist
// and are genuinely "plain" (no canard / no twin vertical tail / no sensor tricks).
const src = fs.readFileSync(__dirname + '/../js/entities.js', 'utf8');

function shapeBlock(name) {
  // grab from "NAME:" to the next top-level "}," that closes the entry
  const re = new RegExp('\\b' + name + ':\\s*\\{[\\s\\S]*?\\}\\s*,', 'm');
  const m = src.match(re);
  assert.ok(m, name + ' must be defined in SHAPES');
  return m[0];
}

const std = shapeBlock('STD');
assert.ok(/vtail:\s*\{\s*type:\s*'single'/.test(std), 'STD must use a single vertical tail');
assert.ok(!/canard:/.test(std), 'STD must have no canard');
assert.ok(/lerx:\s*false/.test(std), 'STD must have no LERX');

const cca = shapeBlock('CCAJET');
assert.ok(!/vtail:/.test(cca), 'CCAJET must be tailless (no vtail)');
assert.ok(!/canard:/.test(cca), 'CCAJET must have no canard');
assert.ok(!/htail:/.test(cca), 'CCAJET must have no horizontal tail');

console.log('ok - SHAPES.STD plain single-tail and SHAPES.CCAJET tailless are defined');
