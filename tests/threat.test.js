'use strict';
// "being-locked-by-enemy" threat reticle core (feature §4b). enemyIsAimingPlayer is the pure rule
const assert = require('assert');
const { enemyIsAimingPlayer } = require('../js/core.js');

const base = { ang: 0.1, dist: 1200, gunCone: 0.24, gunRange: 1750, engaged: true, canSee: true };
assert.strictEqual(enemyIsAimingPlayer(base), true, 'aligned + in-range + engaged + canSee -> aiming');

assert.strictEqual(
  enemyIsAimingPlayer(Object.assign({}, base, { ang: 0.5 })),
  false, 'angle outside the gun cone -> not aiming'
);
assert.strictEqual(
  enemyIsAimingPlayer(Object.assign({}, base, { ang: 0.24 })),
  false, 'angle exactly at the cone edge is not aiming (strict <)'
);

assert.strictEqual(
  enemyIsAimingPlayer(Object.assign({}, base, { dist: 2000 })),
  false, 'distance beyond gun range -> not aiming'
);
assert.strictEqual(
  enemyIsAimingPlayer(Object.assign({}, base, { dist: 1750 })),
  false, 'distance exactly at the range edge is not aiming (strict <)'
);

assert.strictEqual(
  enemyIsAimingPlayer(Object.assign({}, base, { engaged: false })),
  false, 'not engaging -> not aiming'
);

assert.strictEqual(
  enemyIsAimingPlayer(Object.assign({}, base, { canSee: false })),
  false, 'player stealthed (canSee=false) -> not aiming'
);

const fighter = { ang: 0.3, dist: 2000, gunCone: 0.24, gunRange: 1750, engaged: true, canSee: true };
assert.strictEqual(enemyIsAimingPlayer(fighter), false, 'fighter cone/range: this geometry is not a threat');
const boss = Object.assign({}, fighter, { gunCone: 0.34, gunRange: 2200 });
assert.strictEqual(enemyIsAimingPlayer(boss), true, 'same geometry IS a threat under the wider boss cone/range');

assert.strictEqual(enemyIsAimingPlayer(null), false, 'null arg -> not aiming (no throw)');
assert.strictEqual(enemyIsAimingPlayer(undefined), false, 'undefined arg -> not aiming (no throw)');

console.log('ok - being-locked-by-enemy threat reticle core (feature 1)');
