'use strict';
const assert = require('assert');

// === MIRROR START (globals.js barrel-roll pure helpers) ===
// Returns true if the gap between now and lastTapTime is within threshold (double-tap detected).
// gap must be > 0 (can't double-tap at identical timestamps) and <= threshold.
function rollDetect(now, lastTapTime, threshold) {
  const gap = now - lastTapTime;
  return gap > 0 && gap <= threshold;
}

// Returns true if cooldown has elapsed (or was never started), meaning a new barrel roll is allowed.
function rollCooldownGate(cooldown) {
  return cooldown <= 0;
}
// === MIRROR END ===

// Constants mirrored from globals.js for assertion
const BARREL_ROLL_INVULN   = 0.4;   // seconds of i-frames granted
const BARREL_ROLL_COOLDOWN = 6.0;   // seconds before another roll is allowed
const BARREL_ROLL_DURATION = 0.65;  // seconds the 360° spin animation plays
const BARREL_ROLL_THRESHOLD = 0.35; // seconds: max gap for double-tap recognition

// ---- rollDetect: double-tap within threshold ----
assert.strictEqual(rollDetect(0.30, 0.00, BARREL_ROLL_THRESHOLD), true,  'gap 0.30s <= 0.35s threshold => detect');
assert.strictEqual(rollDetect(0.35, 0.00, BARREL_ROLL_THRESHOLD), true,  'gap exactly at threshold => detect');
assert.strictEqual(rollDetect(0.36, 0.00, BARREL_ROLL_THRESHOLD), false, 'gap 0.36s > 0.35s => no detect');
assert.strictEqual(rollDetect(1.00, 0.00, BARREL_ROLL_THRESHOLD), false, 'gap 1.0s >> threshold => no detect');
assert.strictEqual(rollDetect(0.00, 0.00, BARREL_ROLL_THRESHOLD), false, 'same timestamp (gap=0) => no detect');
assert.strictEqual(rollDetect(0.10, 0.05, BARREL_ROLL_THRESHOLD), true,  'gap 0.05s <= 0.35s => detect');

// ---- rollCooldownGate ----
assert.strictEqual(rollCooldownGate(0),   true,  'cooldown exactly 0 => allowed');
assert.strictEqual(rollCooldownGate(-1),  true,  'cooldown negative (past) => allowed');
assert.strictEqual(rollCooldownGate(0.1), false, 'cooldown 0.1s remaining => blocked');
assert.strictEqual(rollCooldownGate(6),   false, 'cooldown at full 6s => blocked');

// ---- invuln window length ----
assert.strictEqual(BARREL_ROLL_INVULN, 0.4, 'invuln window must be exactly 0.4s');

// ---- cooldown length ----
assert.strictEqual(BARREL_ROLL_COOLDOWN, 6.0, 'cooldown must be exactly 6s');

// ---- combined: double-tap within threshold + cooldown ready => triggers ----
function shouldTrigger(now, lastTapTime, cooldown) {
  return rollDetect(now, lastTapTime, BARREL_ROLL_THRESHOLD) && rollCooldownGate(cooldown);
}
assert.strictEqual(shouldTrigger(0.20, 0.00, 0),   true,  'within threshold + cooldown ready => trigger');
assert.strictEqual(shouldTrigger(0.20, 0.00, 0.1), false, 'within threshold but cooldown active => no trigger');
assert.strictEqual(shouldTrigger(0.50, 0.00, 0),   false, 'outside threshold + cooldown ready => no trigger');

console.log('ok - barrel-roll rollDetect + rollCooldownGate + constants');
