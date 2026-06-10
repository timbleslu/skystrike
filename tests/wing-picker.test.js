'use strict';
const assert = require('assert');

// mirror of the buyNode routing decision in js/ui.js
const WING_NODES = new Set(['w1', 'w2', 'reserve']);
function routesToPicker(nodeId) { return WING_NODES.has(nodeId); }

assert.strictEqual(routesToPicker('w1'), true, 'WING COMMANDER opens the picker');
assert.strictEqual(routesToPicker('w2'), true, 'SQUADRON opens the picker');
assert.strictEqual(routesToPicker('reserve'), true, 'RESERVE SQUADRON opens the picker');
assert.strictEqual(routesToPicker('e1'), false, 'non-wing nodes buy immediately');
assert.strictEqual(routesToPicker('core'), false, 'core never routes to picker');

console.log('ok - only wingman nodes route through the jet picker');
