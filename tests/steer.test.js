'use strict';
const assert = require('assert');
const { steerCommand, STEER } = require('../js/core.js');

/* ===== 'rate' scheme: returns intent verbatim (today's mapping) ===== */
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
// 'rate' ignores currentBank entirely (pure passthrough of intent)
assert.strictEqual(steerCommand('rate', { pitch: 0.2, roll: 0.5 }, 1.3, STEER).rollCmd, 0.5,
  'rate: rollCmd independent of currentBank');
// unknown/legacy scheme strings fall through to the 'rate' (classic) branch
assert.strictEqual(steerCommand('classic', { pitch: 0.2, roll: 0.5 }, 1.3, STEER).rollCmd, 0.5,
  'non-pointer scheme behaves as rate');

console.log('ok - steerCommand rate: pitch/roll passthrough, ignores bank');

/* ===== 'pointer' scheme: bank-hold + auto-level ===== */
// pitch authority is identical to rate (pitchCmd === pitch intent in both schemes)
for (const p of [-1, -0.4, 0, 0.4, 1]) {
  assert.strictEqual(steerCommand('pointer', { pitch: p, roll: 0.5 }, 0.2, STEER).pitchCmd, p,
    'pointer: pitchCmd === intent.pitch (same authority as rate)');
}

// (a) currentBank BELOW target -> rollCmd positive (commands roll toward target bank)
const rollIntent = 0.6;
const targetBank = rollIntent * STEER.maxBank;          // 0.84 rad
const below = steerCommand('pointer', { pitch: 0, roll: rollIntent }, targetBank - 0.5, STEER);
assert.ok(below.rollCmd > 0, 'pointer: bank below target -> positive rollCmd (toward target)');
// symmetric: a negative target with currentBank above it commands negative roll
const aboveNeg = steerCommand('pointer', { pitch: 0, roll: -rollIntent }, -targetBank + 0.5, STEER);
assert.ok(aboveNeg.rollCmd < 0, 'pointer: bank above negative target -> negative rollCmd');

// (b) currentBank ~= target -> rollCmd ~= 0 (the loop settles, stops rolling)
const settled = steerCommand('pointer', { pitch: 0, roll: rollIntent }, targetBank, STEER);
assert.ok(Math.abs(settled.rollCmd) < 1e-12, 'pointer: at target bank rollCmd settles to ~0');

// proportional sign: overshooting the target (bank > target) reverses the command
const over = steerCommand('pointer', { pitch: 0, roll: rollIntent }, targetBank + 0.3, STEER);
assert.ok(over.rollCmd < 0, 'pointer: past target -> command reverses (negative feedback)');

// (c) |rollIntent| < deadzone -> auto-level: rollCmd OPPOSES currentBank (drives toward wings-level 0)
const tiny = STEER.deadzone / 2;                         // inside deadzone
const levelFromRight = steerCommand('pointer', { pitch: 0, roll: tiny }, 0.7, STEER);
assert.ok(levelFromRight.rollCmd < 0, 'pointer: deadzone + positive bank -> negative rollCmd (auto-level)');
const levelFromLeft = steerCommand('pointer', { pitch: 0, roll: -tiny }, -0.7, STEER);
assert.ok(levelFromLeft.rollCmd > 0, 'pointer: deadzone + negative bank -> positive rollCmd (auto-level)');
// already wings-level inside the deadzone -> no roll command (-0 is fine, compare by magnitude)
assert.ok(Math.abs(steerCommand('pointer', { pitch: 0, roll: 0 }, 0, STEER).rollCmd) === 0,
  'pointer: deadzone + already level -> zero rollCmd');

// rollCmd is always clamped into [-1, 1] even for a huge bank error
const saturated = steerCommand('pointer', { pitch: 0, roll: 1 }, -5, STEER);
assert.ok(saturated.rollCmd <= 1 && saturated.rollCmd >= -1, 'pointer: rollCmd clamped to [-1,1]');
assert.strictEqual(saturated.rollCmd, 1, 'pointer: large positive error saturates at +1');

// currentBank defaults to 0 when omitted/falsey (cb = currentBank || 0)
assert.ok(Math.abs(steerCommand('pointer', { pitch: 0, roll: 0 }, undefined, STEER).rollCmd) === 0,
  'pointer: undefined currentBank treated as 0');

console.log('ok - steerCommand pointer: bank-hold settles, auto-levels in deadzone, clamps, shared pitch authority');

/* ===== 'auto' scheme: pitch identical to pointer; bank capped at autoMaxBank; turn is a world-yaw in combat.js ===== */
// pitch authority is fully manual — pitchCmd === intent.pitch for ALL pitch/bank (no auto pitch pull, so you can dive
// while turning). The heading turn lives in combat.js (world-axis yaw ∝ bank) and is NOT exercised by this pure test.
for (const p of [-1, -0.4, 0, 0.4, 1]) {
  for (const cb of [0, 0.4, -0.8, Math.PI / 2]) {
    assert.strictEqual(steerCommand('auto', { pitch: p, roll: 0.6 }, cb, STEER).pitchCmd, p,
      'auto: pitchCmd === intent.pitch at every bank (pitch decoupled from turn)');
  }
}

// rollCmd in 'auto' uses the SAME bank-hold shape as pointer but against autoMaxBank (gentler cap)
const autoTarget = rollIntent * STEER.autoMaxBank;
const autoRollBelow = steerCommand('auto', { pitch: 0, roll: rollIntent }, autoTarget - 0.2, STEER);
assert.ok(autoRollBelow.rollCmd > 0, 'auto: bank below target -> positive rollCmd');
const autoSettled = steerCommand('auto', { pitch: 0, roll: rollIntent }, autoTarget, STEER);
assert.ok(Math.abs(autoSettled.rollCmd) < 1e-12, 'auto: at (autoMaxBank-scaled) target bank rollCmd settles to ~0');
// the gentler cap means 'auto' settles at a SMALLER bank than 'pointer' for the same stick (autoMaxBank < maxBank)
assert.ok(STEER.autoMaxBank < STEER.maxBank, 'auto: autoMaxBank is a gentler bank cap than pointer maxBank');

console.log('ok - steerCommand auto: pitch decoupled (=== intent), bank-hold capped at autoMaxBank');
