'use strict';
const assert = require('assert');

// ---- mirrors of js/main.js ground-war pure helpers ----
function groundSpawnsAllowed(wave, on) { return !!on && wave >= 2; }
function isStrikeWave(wave, on) { return !!on && wave >= 5 && wave % 5 === 0 && wave % 4 !== 0; }

assert.strictEqual(groundSpawnsAllowed(1, true), false, 'no ground before wave 2');
assert.strictEqual(groundSpawnsAllowed(2, true), true);
assert.strictEqual(groundSpawnsAllowed(9, false), false, 'toggle off = never');

assert.strictEqual(isStrikeWave(5, true), true, 'first strike at wave 5');
assert.strictEqual(isStrikeWave(10, true), true);
assert.strictEqual(isStrikeWave(20, true), false, 'boss wave wins over strike');
assert.strictEqual(isStrikeWave(15, true), true);
assert.strictEqual(isStrikeWave(7, true), false);
assert.strictEqual(isStrikeWave(10, false), false, 'toggle off = no strike waves');

console.log('ok - ground spawn gating and strike cadence');
