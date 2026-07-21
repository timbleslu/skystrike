'use strict';
const assert = require('assert');

// Exercises the REAL buyNode routing predicate (js/core.js `routesToWingPicker`, which ui-tech.js
// buyNode/deployFromTech delegate to) — no mirror. Wing-command nodes open the jet picker; every
// other node buys immediately.
const { routesToWingPicker, WING_NODES } = require('../js/core.js');

assert.strictEqual(routesToWingPicker('w1'), true, 'WING COMMANDER opens the picker');
assert.strictEqual(routesToWingPicker('w2'), true, 'SQUADRON opens the picker');
assert.strictEqual(routesToWingPicker('reserve'), true, 'RESERVE SQUADRON opens the picker');
assert.strictEqual(routesToWingPicker('e1'), false, 'non-wing nodes buy immediately');
assert.strictEqual(routesToWingPicker('core'), false, 'core never routes to picker');

// the wing-node set is exactly the three wingman nodes (guards against silent drift)
assert.deepStrictEqual([...WING_NODES].sort(), ['reserve', 'w1', 'w2'], 'WING_NODES is exactly the 3 wingman nodes');

console.log('ok - only wingman nodes route through the jet picker');
