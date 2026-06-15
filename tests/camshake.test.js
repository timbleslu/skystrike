'use strict';
const assert = require('assert');

// ---- MIRROR of js/globals.js camera shake helpers ----
// Keep byte-identical with the source between these markers.
// MIRROR START
const CAMSHAKE_RATE = 6;   // shake units lost per second
const CAMSHAKE_K    = 1.2; // world-unit scale at camShake == 1
function decayShake(v, dt) { return Math.max(0, v - dt * CAMSHAKE_RATE); }
// MIRROR END
function shakeCamLogic(current, amt) { return Math.max(current, amt); }

// ---- decayShake: decays monotonically toward 0 ----
{
  let v = 1.0;
  const dt = 1 / 60;   // one 60fps frame
  let prev = v;
  for (let i = 0; i < 600; i++) {
    const next = decayShake(v, dt);
    assert.ok(next <= prev, 'decayShake must be monotonically non-increasing');
    assert.ok(next >= 0,    'decayShake must never go negative');
    prev = next;
    v = next;
  }
  assert.strictEqual(v, 0, 'decayShake must reach exactly 0 after sufficient frames');
}

// ---- decayShake: clamps at 0, never negative ----
{
  assert.strictEqual(decayShake(0, 1),     0, 'decayShake(0, 1) === 0');
  assert.strictEqual(decayShake(0, 100),   0, 'decayShake(0, 100) === 0 (large dt)');
  assert.strictEqual(decayShake(-1, 0.1),  0, 'decayShake of negative input clamps to 0');
}

// ---- decayShake: correct value at known steps ----
{
  // After dt=0.1s from v=1.0: expect max(0, 1.0 - 6*0.1) = 0.4
  const result = decayShake(1.0, 0.1);
  assert.ok(Math.abs(result - 0.4) < 1e-10, `decayShake(1.0, 0.1) should be 0.4, got ${result}`);
}

// ---- shakeCamLogic: takes the max of current and new ----
{
  assert.strictEqual(shakeCamLogic(0,    0.5),  0.5,  'shakeCam raises from 0');
  assert.strictEqual(shakeCamLogic(0.8,  0.5),  0.8,  'shakeCam keeps larger existing value');
  assert.strictEqual(shakeCamLogic(0.5,  0.8),  0.8,  'shakeCam takes larger new value');
  assert.strictEqual(shakeCamLogic(0.5,  0.5),  0.5,  'shakeCam equal values is a no-op');
  assert.strictEqual(shakeCamLogic(1.0,  0.25), 1.0,  'shakeCam does not accumulate — max only');
}

// ---- shakeCamLogic: never goes negative or above the input max ----
{
  const vals = [0, 0.1, 0.25, 0.5, 0.8, 1.0, 2.0];
  for (const a of vals) {
    for (const b of vals) {
      const r = shakeCamLogic(a, b);
      assert.ok(r >= 0,              `shakeCamLogic(${a},${b}) must be >= 0`);
      assert.ok(r === Math.max(a,b), `shakeCamLogic(${a},${b}) must equal max(a,b)`);
    }
  }
}

console.log('ok - camshake: decayShake decays monotonically to 0, clamps at >=0, shakeCam takes max');
