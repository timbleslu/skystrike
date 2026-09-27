'use strict';
// F5 kill-streak momentum — pure core (js/core.js). Exercises the REAL streakStep (no mirror copy).
const assert = require('assert');
const { STREAK, streakStep } = require('../js/core.js');

const kill = (s, now) => streakStep(s, 'kill', now);
const die  = (s, now) => streakStep(s, 'death', now);

assert.strictEqual(STREAK.window, 6, 'chain window is 6s');
assert.deepStrictEqual(STREAK.counts, [3, 6, 10], 'tier counts at 3/6/10');
assert.deepStrictEqual(STREAK.mults, [1, 1.5, 2, 3], 'tier multipliers 1/1.5/2/3');

let s = kill(undefined, 100);
assert.strictEqual(s.count, 1, 'first kill -> count 1');
s = kill(s, 101);
assert.strictEqual(s.count, 2, 'second kill within window -> count 2');
s = kill(s, 102);
assert.strictEqual(s.count, 3, 'third kill within window -> count 3');
console.log('ok - chain within window increments count');

let a = kill(undefined, 50); a = kill(a, 51); a = kill(a, 52);
assert.strictEqual(a.count, 3, 'pre-lapse count 3');
const lapsed = kill(a, 52 + STREAK.window + 0.001);
assert.strictEqual(lapsed.count, 1, 'kill after window lapse restarts at 1');
const atEdge = kill(a, 52 + STREAK.window);
assert.strictEqual(atEdge.count, 4, 'kill exactly at t+window still chains');
console.log('ok - window lapse restarts the count at 1');

let d = kill(undefined, 10);
for (let i = 1; i <= 12; i++) d = kill(d, 10 + i * 0.1);
assert.ok(d.count >= 10 && d.mult === 3, 'built a top-tier streak before death');
const dead = die(d, 999);
assert.strictEqual(dead.count, 0, 'death resets count to 0');
assert.strictEqual(dead.mult, STREAK.mults[0], 'death resets mult to base (1)');
assert.strictEqual(dead.tierUp, false, 'death never signals tierUp');
const revived = kill(dead, 1000);
assert.strictEqual(revived.count, 1, 'first kill after death -> count 1');
console.log('ok - death resets count + mult');

let c = undefined; const seen = {};
for (let i = 1; i <= 12; i++) { c = kill(c, i * 0.5); seen[c.count] = c.mult; }
assert.strictEqual(seen[1], 1,   'count 1 -> x1');
assert.strictEqual(seen[2], 1,   'count 2 -> x1');
assert.strictEqual(seen[3], 1.5, 'count 3 -> x1.5 (exact threshold)');
assert.strictEqual(seen[5], 1.5, 'count 5 -> x1.5');
assert.strictEqual(seen[6], 2,   'count 6 -> x2 (exact threshold)');
assert.strictEqual(seen[9], 2,   'count 9 -> x2');
assert.strictEqual(seen[10], 3,  'count 10 -> x3 (exact threshold)');
assert.strictEqual(seen[12], 3,  'count 12 -> x3 (capped top tier)');
console.log('ok - tier thresholds exact at 3/6/10, multipliers 1/1.5/2/3');

let g = undefined; const ups = [];
for (let i = 1; i <= 11; i++) { g = kill(g, i * 0.5); if (g.tierUp) ups.push(g.count); }
assert.deepStrictEqual(ups, [3, 6, 10], 'tierUp fires exactly at counts 3, 6, 10 (once each)');
console.log('ok - tierUp fires only on tier crossings');

let m = undefined; let prev = -Infinity;
for (const now of [5, 5.5, 6.2, 100, 100.4, 100.9]) {
  m = kill(m, now);
  assert.strictEqual(m.t, now, 't records the kill time');
  assert.ok(m.t > prev, 't strictly increasing across kills');
  prev = m.t;
}
console.log('ok - t updates monotonically on kills');

console.log('ok - streak: ALL PASS');
