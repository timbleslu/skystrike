'use strict';
// "being-locked-by-enemy" threat reticle core (feature §4b). enemyIsAimingPlayer is the pure rule
// updateEnemy uses to flag e.aimingPlayer each frame — a fighter/boss is a real gun threat to the
// player ONLY when it is engaging, can see the player (not stealthed), and is both within the gun
// cone AND inside gun range. Imported from the real implementation in js/core.js (no mirror copy).
const assert = require('assert');
const { enemyIsAimingPlayer } = require('../js/core.js');

// a baseline "true" case — aligned (inside cone), in range, engaging, can see
const base = { ang: 0.1, dist: 1200, gunCone: 0.24, gunRange: 1750, engaged: true, canSee: true };
assert.strictEqual(enemyIsAimingPlayer(base), true, 'aligned + in-range + engaged + canSee -> aiming');

// out of cone (ang exceeds gunCone) -> not aiming
assert.strictEqual(
  enemyIsAimingPlayer(Object.assign({}, base, { ang: 0.5 })),
  false, 'angle outside the gun cone -> not aiming'
);
// exactly at the cone edge is NOT aiming (strict <, mirroring the gun-fire gate's `ang < gunCone`)
assert.strictEqual(
  enemyIsAimingPlayer(Object.assign({}, base, { ang: 0.24 })),
  false, 'angle exactly at the cone edge is not aiming (strict <)'
);

// out of range (dist beyond gunRange) -> not aiming
assert.strictEqual(
  enemyIsAimingPlayer(Object.assign({}, base, { dist: 2000 })),
  false, 'distance beyond gun range -> not aiming'
);
// exactly at the range edge is NOT aiming (strict <, mirroring `dist < gunRange`)
assert.strictEqual(
  enemyIsAimingPlayer(Object.assign({}, base, { dist: 1750 })),
  false, 'distance exactly at the range edge is not aiming (strict <)'
);

// not engaged (e.g. state !== 'engage' / scrambled) -> not aiming even when geometry lines up
assert.strictEqual(
  enemyIsAimingPlayer(Object.assign({}, base, { engaged: false })),
  false, 'not engaging -> not aiming'
);

// stealthed / cannot see the player -> not aiming even when geometry lines up
assert.strictEqual(
  enemyIsAimingPlayer(Object.assign({}, base, { canSee: false })),
  false, 'player stealthed (canSee=false) -> not aiming'
);

// the boss has a wider cone + longer range; a shot that would miss a fighter can still threaten via a boss
const fighter = { ang: 0.3, dist: 2000, gunCone: 0.24, gunRange: 1750, engaged: true, canSee: true };
assert.strictEqual(enemyIsAimingPlayer(fighter), false, 'fighter cone/range: this geometry is not a threat');
const boss = Object.assign({}, fighter, { gunCone: 0.34, gunRange: 2200 });
assert.strictEqual(enemyIsAimingPlayer(boss), true, 'same geometry IS a threat under the wider boss cone/range');

// defensive: a missing/empty arg never throws and reads as "no threat"
assert.strictEqual(enemyIsAimingPlayer(null), false, 'null arg -> not aiming (no throw)');
assert.strictEqual(enemyIsAimingPlayer(undefined), false, 'undefined arg -> not aiming (no throw)');

console.log('ok - being-locked-by-enemy threat reticle core (feature 1)');
