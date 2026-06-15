'use strict';
const assert = require('assert');
const { shapeAxis, mapFlightInput, motionAxis, emaSmooth, AGGRESSION } = require('../js/core.js');

/* ===== shapeAxis behavior ===== */
const bal = AGGRESSION.balanced;
// dead-zone zeros sub-threshold input (both signs)
assert.strictEqual(shapeAxis(0, bal), 0, 'zero in -> zero out');
assert.strictEqual(shapeAxis(0.05, bal), 0, 'below balanced deadzone -> 0');
assert.strictEqual(shapeAxis(-0.05, bal), 0, 'below deadzone negative -> 0');
assert.ok(shapeAxis(0.5, bal) > 0, 'above deadzone -> nonzero');
// invert flips sign (and only the sign, magnitude preserved)
assert.ok(Math.abs(shapeAxis(0.6, bal) + shapeAxis(-0.6, bal)) < 1e-12, 'odd symmetry: f(-x) = -f(x)');
// expo monotonic increasing on (deadzone, 1]
let prev = -1;
for (let x = bal.deadzone + 0.001; x <= 1.0001; x += 0.05) {
  const y = shapeAxis(x, bal);
  assert.ok(y > prev, 'shapeAxis monotonic increasing at x=' + x.toFixed(3));
  prev = y;
}
// full deflection maps to full output; output clamped to [-1,1]
assert.ok(Math.abs(shapeAxis(1, bal) - 1) < 1e-9, 'full stick -> 1');
assert.ok(Math.abs(shapeAxis(-1, bal) + 1) < 1e-9, 'full stick neg -> -1');
assert.ok(shapeAxis(5, bal) <= 1 && shapeAxis(-5, bal) >= -1, 'over-range clamped');
// expo bends the curve below linear in the mid-range (expo>0 softens center)
const expoMid = shapeAxis(0.5, { deadzone: 0, expo: 0.6 });
assert.ok(expoMid < 0.5, 'expo softens mid-stick below linear');
const linMid = shapeAxis(0.5, { deadzone: 0, expo: 0 });
assert.ok(Math.abs(linMid - 0.5) < 1e-9, 'expo 0 is linear');

console.log('ok - shapeAxis: deadzone, expo monotonicity, invert symmetry, clamp');

/* ===== aggression preset ordering invariants ===== */
assert.ok(AGGRESSION.casual.deadzone > AGGRESSION.balanced.deadzone, 'deadzone casual > balanced');
assert.ok(AGGRESSION.balanced.deadzone > AGGRESSION.direct.deadzone, 'deadzone balanced > direct');
assert.ok(AGGRESSION.direct.sens > AGGRESSION.balanced.sens, 'sens direct > balanced');
assert.ok(AGGRESSION.balanced.sens > AGGRESSION.casual.sens, 'sens balanced > casual');
// auto-level assist strongest for casual, weakest for direct
assert.ok(AGGRESSION.casual.autoLevel > AGGRESSION.balanced.autoLevel, 'autoLevel casual > balanced');
assert.ok(AGGRESSION.balanced.autoLevel > AGGRESSION.direct.autoLevel, 'autoLevel balanced > direct');

console.log('ok - aggression presets: deadzone/sens/autoLevel ordering invariants');

/* ===== mapFlightInput: invert + clamp ===== */
const dir = AGGRESSION.direct;
assert.ok(mapFlightInput(0.8, dir, false) > 0, 'forward stick -> positive');
assert.ok(mapFlightInput(0.8, dir, true) < 0, 'invert flips pitch sign');
assert.ok(Math.abs(mapFlightInput(0.8, dir, false) + mapFlightInput(0.8, dir, true)) < 1e-12, 'invert is exact negation');
assert.ok(mapFlightInput(1, dir, false) <= 1, 'sens>1 still clamps to 1');
assert.ok(mapFlightInput(-1, dir, false) >= -1, 'sens>1 still clamps to -1');
assert.strictEqual(mapFlightInput(0, bal, false), 0, 'neutral -> 0');

console.log('ok - mapFlightInput: invert negation + clamp at +/-1');

/* ===== motion recenter math ===== */
assert.strictEqual(motionAxis(20, 20, 35), 0, 'at captured offset -> neutral (0)');
assert.ok(motionAxis(40, 20, 35) > 0, 'tilt past offset -> positive');
assert.ok(motionAxis(0, 20, 35) < 0, 'tilt below offset -> negative');
// normalized: a tilt of exactly maxAngle past offset -> +/-1
assert.ok(Math.abs(motionAxis(20 + 35, 20, 35) - 1) < 1e-9, 'maxAngle past offset -> 1');
assert.ok(motionAxis(20 + 70, 20, 35) === 1, 'beyond maxAngle clamps to 1');
assert.ok(motionAxis(20 - 70, 20, 35) === -1, 'beyond -maxAngle clamps to -1');

console.log('ok - motionAxis: recenter neutralizes at captured offset, clamps to +/-1');

/* ===== emaSmooth: low-pass blend ===== */
// one step of alpha=0.2 from 0 toward 10 lands exactly 20% of the way: 2.
assert.ok(Math.abs(emaSmooth(0, 10, 0.2) - 2) < 1e-12, 'alpha 0.2 one-step 0->10 = 2');
// alpha=0 holds prev (full smoothing, ignores next)
assert.strictEqual(emaSmooth(7, 99, 0), 7, 'alpha 0 holds prev');
// alpha=1 jumps straight to next (no smoothing)
assert.strictEqual(emaSmooth(7, 99, 1), 99, 'alpha 1 jumps to next');
// idempotent at equality: prev==next -> unchanged for any alpha
assert.strictEqual(emaSmooth(5, 5, 0.2), 5, 'prev==next is a fixed point');
// repeated application converges monotonically toward next (and never overshoots)
let s = 0;
for (let i = 0; i < 200; i++) {
  const ns = emaSmooth(s, 10, 0.2);
  assert.ok(ns >= s && ns <= 10, 'emaSmooth converges monotonically without overshoot at step ' + i);
  s = ns;
}
assert.ok(Math.abs(s - 10) < 1e-6, 'emaSmooth converges to next');

console.log('ok - emaSmooth: alpha endpoints, fixed point, monotone convergence');
