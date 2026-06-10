'use strict';
const assert = require('assert');

// --- Mirror of the production queue logic (js/globals.js + js/main.js) ---
let pendingSpawns = [];
function processSpawnQueue(n) {
  for (let i = 0; i < n && pendingSpawns.length; i++) pendingSpawns.shift()();
}

// --- Test 1: only n built per tick ---
(function testDrainRate() {
  pendingSpawns = [];
  let built = 0;
  const spawn = () => { built++; };
  for (let i = 0; i < 10; i++) pendingSpawns.push(spawn);  // 10-fighter wave

  processSpawnQueue(2);
  assert.strictEqual(built, 2, 'first tick builds exactly 2');
  assert.strictEqual(pendingSpawns.length, 8, '8 still queued');

  for (let t = 0; t < 4; t++) processSpawnQueue(2);
  assert.strictEqual(built, 10, 'all 10 built after 5 ticks total');
  assert.strictEqual(pendingSpawns.length, 0, 'queue drained');
  console.log('ok - drain rate');
})();

// --- Test 2: a combat enemy is built on the first tick (no wave-clear race) ---
(function testFirstTickHasCombatEnemy() {
  pendingSpawns = [];
  let combatAlive = 0;
  const spawnFighter = () => { combatAlive++; };
  const spawnGround  = () => { /* non-combat: excluded from aliveCombat */ };
  // nextWave enqueues fighters first, then turrets (mirrors js/main.js ordering)
  pendingSpawns.push(spawnFighter, spawnFighter, spawnGround);

  processSpawnQueue(2);
  assert.ok(combatAlive >= 1, 'at least one combat enemy exists after first tick');
  console.log('ok - first tick has combat enemy');
})();

console.log('ALL PASS');
