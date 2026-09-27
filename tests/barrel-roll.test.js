'use strict';
const assert = require('assert');
const { rollDetect, rollCooldownGate } = require('../js/core.js');

const BARREL_ROLL_INVULN   = 0.4;
const BARREL_ROLL_COOLDOWN = 6.0;
const BARREL_ROLL_DURATION = 0.65;
const BARREL_ROLL_THRESHOLD = 0.35;

assert.strictEqual(rollDetect(0.30, 0.00, BARREL_ROLL_THRESHOLD), true,  'gap 0.30s <= 0.35s threshold => detect');
assert.strictEqual(rollDetect(0.35, 0.00, BARREL_ROLL_THRESHOLD), true,  'gap exactly at threshold => detect');
assert.strictEqual(rollDetect(0.36, 0.00, BARREL_ROLL_THRESHOLD), false, 'gap 0.36s > 0.35s => no detect');
assert.strictEqual(rollDetect(1.00, 0.00, BARREL_ROLL_THRESHOLD), false, 'gap 1.0s >> threshold => no detect');
assert.strictEqual(rollDetect(0.00, 0.00, BARREL_ROLL_THRESHOLD), false, 'same timestamp (gap=0) => no detect');
assert.strictEqual(rollDetect(0.10, 0.05, BARREL_ROLL_THRESHOLD), true,  'gap 0.05s <= 0.35s => detect');

assert.strictEqual(rollCooldownGate(0),   true,  'cooldown exactly 0 => allowed');
assert.strictEqual(rollCooldownGate(-1),  true,  'cooldown negative (past) => allowed');
assert.strictEqual(rollCooldownGate(0.1), false, 'cooldown 0.1s remaining => blocked');
assert.strictEqual(rollCooldownGate(6),   false, 'cooldown at full 6s => blocked');

assert.strictEqual(BARREL_ROLL_INVULN, 0.4, 'invuln window must be exactly 0.4s');

assert.strictEqual(BARREL_ROLL_COOLDOWN, 6.0, 'cooldown must be exactly 6s');

function shouldTrigger(now, lastTapTime, cooldown) {
  return rollDetect(now, lastTapTime, BARREL_ROLL_THRESHOLD) && rollCooldownGate(cooldown);
}
assert.strictEqual(shouldTrigger(0.20, 0.00, 0),   true,  'within threshold + cooldown ready => trigger');
assert.strictEqual(shouldTrigger(0.20, 0.00, 0.1), false, 'within threshold but cooldown active => no trigger');
assert.strictEqual(shouldTrigger(0.50, 0.00, 0),   false, 'outside threshold + cooldown ready => no trigger');

console.log('ok - barrel-roll rollDetect + rollCooldownGate + constants');
