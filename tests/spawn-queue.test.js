'use strict';
const assert = require('assert');
const { spawnDrainCount } = require('../js/core.js');

let pendingSpawns = [];
function processSpawnQueue(n) {
  for (let i = spawnDrainCount(pendingSpawns.length, n); i > 0; i--) pendingSpawns.shift()();
}

(function testDrainCount() {
  assert.strictEqual(spawnDrainCount(10, 2), 2, 'plenty queued -> build the full per-frame budget');
  assert.strictEqual(spawnDrainCount(1, 2), 1, 'fewer queued than the budget -> build only what is left');
  assert.strictEqual(spawnDrainCount(0, 2), 0, 'empty queue -> build nothing');
  assert.strictEqual(spawnDrainCount(5, 0), 0, 'zero budget -> build nothing');
  assert.strictEqual(spawnDrainCount(0, 0), 0, 'empty + zero -> nothing');
  console.log('ok - drain count decision');
})();

(function testDrainRate() {
  pendingSpawns = [];
  let built = 0;
  const spawn = () => { built++; };
  for (let i = 0; i < 10; i++) pendingSpawns.push(spawn);

  processSpawnQueue(2);
  assert.strictEqual(built, 2, 'first tick builds exactly 2');
  assert.strictEqual(pendingSpawns.length, 8, '8 still queued');

  for (let t = 0; t < 4; t++) processSpawnQueue(2);
  assert.strictEqual(built, 10, 'all 10 built after 5 ticks total');
  assert.strictEqual(pendingSpawns.length, 0, 'queue drained');
  console.log('ok - drain rate');
})();

(function testFirstTickHasCombatEnemy() {
  pendingSpawns = [];
  let combatAlive = 0;
  const spawnFighter = () => { combatAlive++; };
  const spawnGround  = () => { };
  pendingSpawns.push(spawnFighter, spawnFighter, spawnGround);

  processSpawnQueue(2);
  assert.ok(combatAlive >= 1, 'at least one combat enemy exists after first tick');
  console.log('ok - first tick has combat enemy');
})();

console.log('ALL PASS');
