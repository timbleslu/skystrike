'use strict';
const assert = require('assert');
const { reqSatisfied } = require('../js/core.js');   // real tech-tree prereq predicate — no mirror

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

// reqSatisfied is imported from js/core.js (top of file) — the REAL impl, not a mirror.
const byId = {
  core: { id: 'core' },
  agm1: { id: 'agm1', req: 'core', ground: true },
  rkt1: { id: 'rkt1', req: 'agm1', ground: true },
  xyz:  { id: 'xyz',  req: 'rkt1' },              // hypothetical non-ground node chained on ground
  a:    { id: 'a',    req: 'core' },
  b:    { id: 'b',    req: 'core' },
  or:   { id: 'or',   req: ['a', 'b'] },          // OR-gate: either parent unlocks
  and:  { id: 'and',  reqAll: ['a', 'b'] },       // AND-gate: both parents required
  mix:  { id: 'mix',  req: ['a'], reqAll: ['b'] },
};
const owns = id => id === 'core';
assert.strictEqual(reqSatisfied(byId.agm1, owns, byId, true), true, 'ground on: agm1 needs only core');
assert.strictEqual(reqSatisfied(byId.rkt1, owns, byId, true), false, 'ground on: rkt1 needs agm1');
assert.strictEqual(reqSatisfied(byId.xyz, owns, byId, false), true, 'ground off: xyz bypasses rkt1+agm1 down to core');
assert.strictEqual(reqSatisfied(byId.xyz, () => false, byId, false), false, 'bypass still requires the surviving req');

console.log('ok - reqSatisfied bypasses hidden ground nodes');

// ---- OR / AND gate semantics ----
const ownsA = id => id === 'a';
const ownsAB = id => id === 'a' || id === 'b';
assert.strictEqual(reqSatisfied(byId.or, ownsA, byId, true), true, 'OR-gate: one parent is enough');
assert.strictEqual(reqSatisfied(byId.or, () => false, byId, true), false, 'OR-gate: no parents = locked');
assert.strictEqual(reqSatisfied(byId.and, ownsA, byId, true), false, 'AND-gate: one of two is not enough');
assert.strictEqual(reqSatisfied(byId.and, ownsAB, byId, true), true, 'AND-gate: both parents unlock');
assert.strictEqual(reqSatisfied(byId.mix, ownsA, byId, true), false, 'mixed: reqAll must still hold');
assert.strictEqual(reqSatisfied(byId.mix, ownsAB, byId, true), true, 'mixed: req + reqAll both satisfied');

console.log('ok - reqSatisfied OR/AND gates');
