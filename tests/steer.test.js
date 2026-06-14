'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ---- shared helper (mirror of js/globals.js clamp) ----
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- tunables mirror (js/globals.js STEER) ----
const STEER = { maxBank: 1.4, bankGain: 2.4, autoLevelGain: 1.6, deadzone: 0.06, autoPitchGain: 0.6 };

// ============================================================================
//  Mirror of js/globals.js steerCommand (byte-identity guard at the bottom
//  enforces it matches source; project convention for non-marker pure fns).
// ============================================================================
// PURE — map normalized flight intent to the engine's pitch/roll command axes, honouring the control scheme.
// `intent` = { pitch, roll } in -1..1 (point-to-fly signs: +pitch=climb, +roll=bank right). `currentBank` is the
// airframe's present bank angle in radians, SAME sign frame as roll intent (combat.js passes atan2(-right.y, up.y)).
// Returns { pitchCmd, rollCmd } to be consumed exactly where flightInput.pitch/roll were before (so 'rate' is identical).
//   'rate'    : rollCmd = roll intent (-> roll rate, today's mapping). pitchCmd = pitch intent.
//   'pointer' : rollCmd holds bank to rollIntent*maxBank; |rollIntent|<deadzone auto-levels to wings-level.
//               pitchCmd = pitch intent unchanged (same climb/dive authority in both schemes).
//   'auto'    : same bank-hold as pointer; also adds sin(currentBank)*autoPitchGain to pitchCmd so banking auto-turns.
function steerCommand(scheme, intent, currentBank, t) {
  const pitchCmd = intent.pitch;
  if (scheme !== 'pointer' && scheme !== 'auto') return { pitchCmd, rollCmd: intent.roll };   // 'rate' (classic) — byte-identical mapping
  const cb = currentBank || 0;
  let rollCmd;
  if (Math.abs(intent.roll) < t.deadzone) {
    rollCmd = clamp(-cb * t.autoLevelGain / t.maxBank, -1, 1);           // wings-level seek when stick released
  } else {
    const targetBank = intent.roll * t.maxBank;
    rollCmd = clamp(t.bankGain * (targetBank - cb) / t.maxBank, -1, 1);  // proportional bank-hold
  }
  if (scheme === 'auto') {
    return { pitchCmd: clamp(pitchCmd + Math.sin(cb) * t.autoPitchGain, -1, 1), rollCmd };
  }
  return { pitchCmd, rollCmd };
}

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

/* ===== 'auto' scheme: bank-hold + auto back-pressure ===== */
// wings-level (cb=0): sin(0)=0, so pitchCmd === intent.pitch (no spurious back-pressure)
assert.strictEqual(steerCommand('auto', { pitch: 0, roll: 0 }, 0, STEER).pitchCmd, 0,
  'auto: wings-level + no pitch intent -> pitchCmd=0');
assert.strictEqual(steerCommand('auto', { pitch: 0.3, roll: 0 }, 0, STEER).pitchCmd, 0.3,
  'auto: wings-level + pitch intent -> pitchCmd passes through');

// positive bank (banked right) -> sin(cb)>0 -> pitchCmd > intent.pitch (back-pressure to complete turn)
const autoBankRight = steerCommand('auto', { pitch: 0, roll: 0.6 }, 0.8, STEER);
assert.ok(autoBankRight.pitchCmd > 0, 'auto: positive bank -> pitchCmd > 0 (auto back-pressure)');

// negative bank (banked left) -> sin(cb)<0 -> pitchCmd < intent.pitch
const autoBankLeft = steerCommand('auto', { pitch: 0, roll: -0.6 }, -0.8, STEER);
assert.ok(autoBankLeft.pitchCmd < 0, 'auto: negative bank -> pitchCmd < 0 (auto back-pressure mirrored)');

// auto pitchCmd is clamped to [-1, 1]
const autoSat = steerCommand('auto', { pitch: 1, roll: 0 }, Math.PI / 2, STEER);
assert.ok(autoSat.pitchCmd <= 1, 'auto: pitchCmd clamped at +1');

// rollCmd in 'auto' uses identical bank-hold logic as 'pointer'
const autoRollBelow = steerCommand('auto', { pitch: 0, roll: rollIntent }, targetBank - 0.5, STEER);
assert.ok(autoRollBelow.rollCmd > 0, 'auto: bank below target -> positive rollCmd (same as pointer)');
const autoSettled = steerCommand('auto', { pitch: 0, roll: rollIntent }, targetBank, STEER);
assert.ok(Math.abs(autoSettled.rollCmd) < 1e-12, 'auto: at target bank rollCmd settles to ~0');

console.log('ok - steerCommand auto: back-pressure proportional to bank, roll identical to pointer');

/* ===== byte-identity guard: mirrored steerCommand must match js/globals.js verbatim =====
   (project convention: test-mirrored functions stay byte-identical with source) */
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'globals.js'), 'utf8');
function bodyOf(fnName, text) {
  // extract from 'function NAME(' to the matching closing brace (brace-counting)
  const start = text.indexOf('function ' + fnName + '(');
  assert.ok(start !== -1, 'js/globals.js defines function ' + fnName);
  let i = text.indexOf('{', start), depth = 0, end = -1;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return text.slice(start, end);
}
function norm(s) { return s.replace(/\r\n/g, '\n').trim(); }
{
  const mine = norm(steerCommand.toString());
  const theirs = norm(bodyOf('steerCommand', src));
  const strip = (x) => x.replace(/\s+/g, ' ');
  assert.strictEqual(strip(theirs), strip(mine), 'steerCommand in globals.js must match the mirror byte-for-byte (ignoring whitespace)');
}
// STEER tunables table must be present in source with the same keys
assert.ok(/const STEER\s*=/.test(src), 'globals.js defines STEER');
for (const k of ['maxBank', 'bankGain', 'autoLevelGain', 'deadzone', 'autoPitchGain']) {
  assert.ok(new RegExp(k + '\\s*:').test(src), 'STEER.' + k + ' present in source');
}

console.log('ok - steerCommand mirror matches js/globals.js source; STEER tunables present');
