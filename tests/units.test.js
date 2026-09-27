'use strict';
// HUD display-unit conversion (pure). Sim speed = knots, altitude = feet. 'imperial' => mph + ft
const assert = require('assert');
const { speedDisplay, altDisplay } = require('../js/core.js');

assert.deepStrictEqual(speedDisplay(0, 'imperial'), { value: 0, unit: 'mph' }, '0 kt -> 0 mph');
assert.strictEqual(speedDisplay(100, 'imperial').value, 115, '100 kt -> 115 mph');
assert.strictEqual(speedDisplay(100, 'imperial').unit, 'mph');
assert.strictEqual(speedDisplay(100, 'metric').value, 185, '100 kt -> 185 kph');
assert.strictEqual(speedDisplay(100, 'metric').unit, 'kph');

assert.strictEqual(altDisplay(10000, 'imperial').value, 10000, 'ft identity in imperial');
assert.strictEqual(altDisplay(10000, 'imperial').unit, 'ft');
assert.strictEqual(altDisplay(10000, 'metric').value, 3048, '10000 ft -> 3048 m');
assert.strictEqual(altDisplay(10000, 'metric').unit, 'm');

assert.strictEqual(speedDisplay(100, undefined).unit, 'mph', 'undefined -> imperial speed');
assert.strictEqual(speedDisplay(100, 'bogus').unit, 'mph', 'unknown -> imperial speed');
assert.strictEqual(altDisplay(500, undefined).unit, 'ft', 'undefined -> imperial alt');

assert.strictEqual(speedDisplay(-50, 'metric').value, 0, 'negative speed clamps to 0');
assert.strictEqual(altDisplay(-50, 'metric').value, 0, 'negative alt clamps to 0');

console.log('units.test.js PASS');
