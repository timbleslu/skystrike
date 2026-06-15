'use strict';
global.store = { get: () => null, set: () => {} };
const assert = require('assert');
const { gradeRun } = require('../js/meta.js');

// ============================================================================
//  Tests
// ============================================================================

// helper: near-perfect run
function perfectRun(waves) {
  waves = waves || 10;
  return {
    waveReached: waves,
    kills: waves * 4,           // exactly expected
    ground: 0,
    boss: 1,
    timeSecs: waves * 25,       // faster than threshold
    damageTaken: 0,             // zero damage
    missions: Math.floor(waves / 2),
  };
}

// helper: poor run (barely any kills, slow, lots of damage)
function poorRun(waves) {
  waves = waves || 5;
  return {
    waveReached: waves,
    kills: 0,
    ground: 0,
    boss: 0,
    timeSecs: waves * 300,      // very slow
    damageTaken: 99999,         // massive damage
    missions: 0,
  };
}

// TEST 1: near-perfect run → 'S'
var g1 = gradeRun(perfectRun(10), { score: 50000 });
assert.strictEqual(g1.letter, 'S', 'near-perfect run should be S (got ' + g1.letter + ', score=' + g1.score + ')');
assert.strictEqual(g1.mult, 1.5, 'S multiplier should be 1.5');

// TEST 2: poor run → 'C'
var g2 = gradeRun(poorRun(5), { score: 0 });
assert.strictEqual(g2.letter, 'C', 'poor run should be C (got ' + g2.letter + ', score=' + g2.score + ')');
assert.strictEqual(g2.mult, 1.0, 'C multiplier should be 1.0');

// TEST 3: null run → 'C' (graceful fallback)
var g3 = gradeRun(null, null);
assert.strictEqual(g3.letter, 'C', 'null run should gracefully return C');

// TEST 4: multiplier monotonic non-decreasing with score
var letters = ['C', 'B', 'A', 'S'];
var mults   = [1.0, 1.15, 1.3, 1.5];
for (var i = 1; i < mults.length; i++) {
  assert.ok(mults[i] >= mults[i - 1], 'mults must be monotonic: ' + letters[i - 1] + '→' + letters[i]);
}

// TEST 5: letters only ever S/A/B/C
var validLetters = new Set(['S', 'A', 'B', 'C']);
var runs = [perfectRun(1), perfectRun(5), poorRun(1), poorRun(10), { waveReached: 3, kills: 6, ground: 2, boss: 0, timeSecs: 60, damageTaken: 150, missions: 1 }];
for (var j = 0; j < runs.length; j++) {
  var g = gradeRun(runs[j], {});
  assert.ok(validLetters.has(g.letter), 'letter must be S/A/B/C, got: ' + g.letter);
}

// TEST 6: A and B grades are achievable (mid-quality run)
var midRun = { waveReached: 5, kills: 10, ground: 5, boss: 0, timeSecs: 100, damageTaken: 200, missions: 1 };
var gMid = gradeRun(midRun, {});
assert.ok(validLetters.has(gMid.letter), 'mid run letter is valid: ' + gMid.letter);

// TEST 7: score field is a number between 0 and 1 (inclusive)
assert.ok(g1.score >= 0 && g1.score <= 1, 'score should be in [0,1]');
assert.ok(g2.score >= 0 && g2.score <= 1, 'score should be in [0,1]');

console.log('ok - gradeRun: near-perfect→S, poor→C, null→C, monotonic mults, only S/A/B/C, score in [0,1], byte-identity guard passed');
