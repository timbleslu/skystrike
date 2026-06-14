'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ---- shared helper (mirror of js/globals.js clamp) ----
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- mirrors of js/controls.js pure input-shaping helpers ----
// dead-zone -> renormalize -> expo blend (linear<->cubic) -> clamp; sign-preserving.
function shapeAxis(v, opts) {
  const dz = (opts && opts.deadzone) || 0;
  const ex = (opts && opts.expo) || 0;
  const a = Math.abs(v);
  if (a <= dz) return 0;
  const n = (a - dz) / (1 - dz);
  const curved = (1 - ex) * n + ex * n * n * n;
  return clamp(Math.sign(v) * curved, -1, 1);
}

// per-aggression motion tuning. Invariants asserted below:
//   deadzone: casual > balanced > direct ; sens: direct > balanced > casual.
const AGGRESSION = {
  casual:   { deadzone: 0.18, expo: 0.55, sens: 0.75, maxAngle: 45, autoLevel: 2.2, pitchClamp: 0.70 },
  balanced: { deadzone: 0.10, expo: 0.35, sens: 1.00, maxAngle: 35, autoLevel: 1.2, pitchClamp: 0.85 },
  direct:   { deadzone: 0.05, expo: 0.15, sens: 1.35, maxAngle: 28, autoLevel: 0.4, pitchClamp: 1.00 },
};

// shape a raw analog axis (touch or tilt) into a flight axis: curve -> sens -> clamp -> invert.
function mapFlightInput(raw, preset, invert) {
  let v = shapeAxis(raw, preset) * (preset && preset.sens != null ? preset.sens : 1);
  v = clamp(v, -1, 1);
  return invert ? -v : v;
}

// motion recenter: tilt relative to the captured neutral offset, normalized by maxAngle.
function motionAxis(angle, offset, maxAngle) {
  return clamp((angle - offset) / maxAngle, -1, 1);
}

// EMA low-pass: pull prev toward next by alpha (0..1). Higher alpha = snappier, less smooth.
// PURE (mirrored in tests/controls.test.js — keep byte-identical).
function emaSmooth(prev, next, alpha) { return prev + alpha * (next - prev); }

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

/* ===== byte-identity guard: mirrored helpers must match js/controls.js verbatim =====
   (project convention: test-mirrored functions stay byte-identical with source) */
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'controls.js'), 'utf8');
function bodyOf(fnName, text) {
  // extract from 'function NAME(' to the matching closing brace (brace-counting)
  const start = text.indexOf('function ' + fnName + '(');
  assert.ok(start !== -1, 'js/controls.js defines function ' + fnName);
  let i = text.indexOf('{', start), depth = 0, end = -1;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return text.slice(start, end);
}
function norm(s) { return s.replace(/\r\n/g, '\n').trim(); }
for (const fn of ['shapeAxis', 'mapFlightInput', 'motionAxis', 'emaSmooth']) {
  const mine = norm(eval('(' + fn + ').toString()')
    .replace(/^[^(]*\(/, 'function ' + fn + '(')); // normalize fn name form
  // compare the source slice to our mirror by stripping whitespace differences only
  const theirs = norm(bodyOf(fn, src));
  const strip = (x) => x.replace(/\s+/g, ' ');
  assert.strictEqual(strip(theirs), strip(mine), fn + ' in controls.js must match the mirror byte-for-byte (ignoring whitespace)');
}
// AGGRESSION table must be present with all three presets in source
assert.ok(/const AGGRESSION\s*=/.test(src), 'controls.js defines AGGRESSION');
for (const k of ['casual', 'balanced', 'direct']) assert.ok(new RegExp(k + '\\s*:').test(src), 'AGGRESSION.' + k + ' present');

console.log('ok - controls.js mirrors (shapeAxis/mapFlightInput/motionAxis/emaSmooth) match source');
