'use strict';
const assert = require('assert');
const { instrumentState } = require('../js/core.js');

{
  const z = instrumentState(0, 0, 0);
  assert.strictEqual(z.spdFrac, 0, 'speed frac 0 at rest');
  assert.strictEqual(z.altFrac, 0, 'alt frac 0 on the deck');
  assert.strictEqual(z.thrFrac, 0, 'thrust frac 0 idle');
  const hot = instrumentState(5000, 99999, 3);
  assert.strictEqual(hot.spdFrac, 1, 'speed frac clamps at 1');
  assert.strictEqual(hot.altFrac, 1, 'alt frac clamps at 1');
  assert.strictEqual(hot.thrFrac, 1, 'thrust frac clamps at 1');
  assert.ok(Math.abs(instrumentState(500, 0, 0).spdFrac - 0.5) < 1e-9, '500kt = half the speed dial');
  assert.ok(Math.abs(instrumentState(0, 10000, 0).altFrac - 0.5) < 1e-9, '10000ft = half the alt arc');
}

{
  const n = instrumentState(-50, -200, -1);
  assert.strictEqual(n.spdFrac, 0, 'negative speed floored to 0');
  assert.strictEqual(n.altFrac, 0, 'negative alt floored to 0');
  assert.strictEqual(n.thrFrac, 0, 'negative throttle floored to 0');
  const bad = instrumentState(NaN, undefined, NaN);
  assert.ok(!Number.isNaN(bad.spdDeg) && !Number.isNaN(bad.altDeg) && !Number.isNaN(bad.thrDeg), 'no NaN angles from bad input');
}

{
  assert.ok(Math.abs(instrumentState(0, 0, 0).spdDeg - (-120)) < 1e-9, 'airspeed needle parks at -120°');
  assert.ok(Math.abs(instrumentState(1000, 0, 0).spdDeg - 120) < 1e-9, 'airspeed needle tops at +120°');
  assert.ok(Math.abs(instrumentState(500, 0, 0).spdDeg - 0) < 1e-9, 'airspeed needle straight up at mid-scale');
  assert.ok(Math.abs(instrumentState(0, 0, 0).thrDeg - (-135)) < 1e-9, 'throttle needle parks at -135°');
  assert.ok(Math.abs(instrumentState(0, 0, 1).thrDeg - 135) < 1e-9, 'throttle needle tops at +135°');
}

{
  const a = instrumentState(0, 1000, 0);
  assert.ok(Math.abs(a.altDeg - 0) < 1e-6, 'hundreds hand wraps every 1000 ft');
  assert.ok(Math.abs(a.altDegK - 36) < 1e-6, 'thousands hand advances 36° per 1000 ft');
  const b = instrumentState(0, 2500, 0);
  assert.ok(Math.abs(b.altDeg - 180) < 1e-6, 'hundreds hand at 180° for 2500 ft');
  assert.ok(Math.abs(b.altDegK - 90) < 1e-6, 'thousands hand at 90° for 2500 ft');
  assert.strictEqual(b.spdKt, 0, 'spdKt integer passthrough');
  assert.strictEqual(b.altFt, 2500, 'altFt integer passthrough');
}

console.log('instruments.test.js OK');
