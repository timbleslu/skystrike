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

// mirror of js/ui.js reqSatisfied — walks req chains, skipping ground nodes when ground war is off
function reqSatisfied(node, ownsFn, byId, groundOn) {
  let req = node.req;
  while (req) {
    const rn = byId[req];
    if (!groundOn && rn && rn.ground) { req = rn.req; continue; }   // bypass hidden ground nodes
    return ownsFn(req);
  }
  return true;
}
const byId = {
  core: { id: 'core' },
  agm1: { id: 'agm1', req: 'core', ground: true },
  rkt1: { id: 'rkt1', req: 'agm1', ground: true },
  xyz:  { id: 'xyz',  req: 'rkt1' },              // hypothetical non-ground node chained on ground
};
const owns = id => id === 'core';
assert.strictEqual(reqSatisfied(byId.agm1, owns, byId, true), true, 'ground on: agm1 needs only core');
assert.strictEqual(reqSatisfied(byId.rkt1, owns, byId, true), false, 'ground on: rkt1 needs agm1');
assert.strictEqual(reqSatisfied(byId.xyz, owns, byId, false), true, 'ground off: xyz bypasses rkt1+agm1 down to core');
assert.strictEqual(reqSatisfied(byId.xyz, () => false, byId, false), false, 'bypass still requires the surviving req');

console.log('ok - reqSatisfied bypasses hidden ground nodes');
