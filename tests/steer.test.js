'use strict';
const assert = require('assert');
const { steerCommand, STEER } = require('../js/core.js');

for (const intent of [
  { pitch: 0, roll: 0 },
  { pitch: 0.3, roll: -0.7 },
  { pitch: -1, roll: 1 },
  { pitch: 0.55, roll: 0.42 },
]) {
  const out = steerCommand('rate', intent, 0.9, STEER);
  assert.strictEqual(out.pitchCmd, intent.pitch, 'rate: pitchCmd === intent.pitch');
  assert.strictEqual(out.rollCmd, intent.roll, 'rate: rollCmd === intent.roll');
}
assert.strictEqual(steerCommand('rate', { pitch: 0.2, roll: 0.5 }, 1.3, STEER).rollCmd, 0.5,
  'rate: rollCmd independent of currentBank');
assert.strictEqual(steerCommand('classic', { pitch: 0.2, roll: 0.5 }, 1.3, STEER).rollCmd, 0.5,
  'non-pointer scheme behaves as rate');

console.log('ok - steerCommand rate: pitch/roll passthrough, ignores bank');

for (const p of [-1, -0.4, 0, 0.4, 1]) {
  assert.strictEqual(steerCommand('pointer', { pitch: p, roll: 0.5 }, 0.2, STEER).pitchCmd, p,
    'pointer: pitchCmd === intent.pitch (same authority as rate)');
}

const rollIntent = 0.6;
const targetBank = rollIntent * STEER.maxBank;
const below = steerCommand('pointer', { pitch: 0, roll: rollIntent }, targetBank - 0.5, STEER);
assert.ok(below.rollCmd > 0, 'pointer: bank below target -> positive rollCmd (toward target)');
const aboveNeg = steerCommand('pointer', { pitch: 0, roll: -rollIntent }, -targetBank + 0.5, STEER);
assert.ok(aboveNeg.rollCmd < 0, 'pointer: bank above negative target -> negative rollCmd');

const settled = steerCommand('pointer', { pitch: 0, roll: rollIntent }, targetBank, STEER);
assert.ok(Math.abs(settled.rollCmd) < 1e-12, 'pointer: at target bank rollCmd settles to ~0');

const over = steerCommand('pointer', { pitch: 0, roll: rollIntent }, targetBank + 0.3, STEER);
assert.ok(over.rollCmd < 0, 'pointer: past target -> command reverses (negative feedback)');

const tiny = STEER.deadzone / 2;
const levelFromRight = steerCommand('pointer', { pitch: 0, roll: tiny }, 0.7, STEER);
assert.ok(levelFromRight.rollCmd < 0, 'pointer: deadzone + positive bank -> negative rollCmd (auto-level)');
const levelFromLeft = steerCommand('pointer', { pitch: 0, roll: -tiny }, -0.7, STEER);
assert.ok(levelFromLeft.rollCmd > 0, 'pointer: deadzone + negative bank -> positive rollCmd (auto-level)');
assert.ok(Math.abs(steerCommand('pointer', { pitch: 0, roll: 0 }, 0, STEER).rollCmd) === 0,
  'pointer: deadzone + already level -> zero rollCmd');

const saturated = steerCommand('pointer', { pitch: 0, roll: 1 }, -5, STEER);
assert.ok(saturated.rollCmd <= 1 && saturated.rollCmd >= -1, 'pointer: rollCmd clamped to [-1,1]');
assert.strictEqual(saturated.rollCmd, 1, 'pointer: large positive error saturates at +1');

assert.ok(Math.abs(steerCommand('pointer', { pitch: 0, roll: 0 }, undefined, STEER).rollCmd) === 0,
  'pointer: undefined currentBank treated as 0');

console.log('ok - steerCommand pointer: bank-hold settles, auto-levels in deadzone, clamps, shared pitch authority');

for (const p of [-1, -0.4, 0, 0.4, 1]) {
  for (const cb of [0, 0.4, -0.8, Math.PI / 2]) {
    assert.strictEqual(steerCommand('auto', { pitch: p, roll: 0.6 }, cb, STEER).pitchCmd, p,
      'auto: pitchCmd === intent.pitch at every bank (pitch decoupled from turn)');
  }
}

const autoTarget = rollIntent * STEER.autoMaxBank;
const autoRollBelow = steerCommand('auto', { pitch: 0, roll: rollIntent }, autoTarget - 0.2, STEER);
assert.ok(autoRollBelow.rollCmd > 0, 'auto: bank below target -> positive rollCmd');
const autoSettled = steerCommand('auto', { pitch: 0, roll: rollIntent }, autoTarget, STEER);
assert.ok(Math.abs(autoSettled.rollCmd) < 1e-12, 'auto: at (autoMaxBank-scaled) target bank rollCmd settles to ~0');
assert.ok(STEER.autoMaxBank < STEER.maxBank, 'auto: autoMaxBank is a gentler bank cap than pointer maxBank');

console.log('ok - steerCommand auto: pitch decoupled (=== intent), bank-hold capped at autoMaxBank');
