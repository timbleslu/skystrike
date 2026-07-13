'use strict';
// F2 enemy formations — pure geometry + break logic (js/core.js). Non-boss fighter waves of >=3 spawn as
// a formation with a leader (slot 0, normal AI) + slot-holding followers that break to normal AI once the
// player closes to engage range or the leader dies. Imported from the REAL implementation (no mirror copy).
const assert = require('assert');
const { FORMATIONS, formationSlots, formationBreak } = require('../js/core.js');

const TYPES = ['vee', 'wall', 'echelon', 'pincer'];
const EPS = 1e-9;

// ===== FORMATIONS table: the 4 types, each with spacing + engage-range config =====
for (const t of TYPES) {
  assert.ok(FORMATIONS[t], t + ' present in FORMATIONS');
  assert.ok(FORMATIONS[t].spacing > 0, t + ' has a positive spacing');
  assert.ok(FORMATIONS[t].engageRange > 0, t + ' has an engage-range config');
}

// ===== slot count == n for EVERY type, across odd + even sizes; slot 0 is always the leader at the origin =====
for (const t of TYPES) {
  for (let n = 1; n <= 12; n++) {
    const s = formationSlots(t, n, 100);
    assert.strictEqual(s.length, n, t + ' n=' + n + ' -> exactly ' + n + ' slots');
    assert.strictEqual(s[0].x, 0, t + ' slot 0 leader on axis (x)');
    assert.strictEqual(s[0].z, 0, t + ' slot 0 leader at origin (z)');
  }
}

// ===== vee: mirror-symmetry about the leader axis — every +x slot has a matching -x slot at the same z =====
for (const n of [3, 4, 5, 6, 7, 8]) {
  const s = formationSlots('vee', n, 120);
  let sumX = 0; for (const p of s) sumX += p.x;
  assert.ok(Math.abs(sumX) < EPS, 'vee n=' + n + ' x-offsets sum to 0 (symmetric)');
  for (const p of s) {
    if (p.x > EPS) {
      assert.ok(s.some(q => Math.abs(q.x + p.x) < EPS && Math.abs(q.z - p.z) < EPS),
        'vee n=' + n + ': +x slot has a mirrored -x partner at the same z');
    }
  }
}

// ===== wall: abreast line — every slot shares the leader's forward position (same z), spread both sides =====
{
  const s = formationSlots('wall', 6, 150);
  for (const p of s) assert.ok(Math.abs(p.z - s[0].z) < EPS, 'wall: all slots on the same abreast line (equal z)');
  const xs = s.slice(1).map(p => p.x);
  assert.ok(xs.some(x => x > 0) && xs.some(x => x < 0), 'wall spreads to BOTH sides of the leader');
}

// ===== echelon: strictly monotonic diagonal — x and z both strictly increase down the line =====
{
  const s = formationSlots('echelon', 6, 130);
  for (let i = 1; i < s.length; i++) {
    assert.ok(s[i].x > s[i - 1].x, 'echelon x strictly increases at slot ' + i);
    assert.ok(s[i].z > s[i - 1].z, 'echelon z strictly increases at slot ' + i);
  }
}

// ===== pincer: two groups on OPPOSITE flanks, balanced, with a clear central gap (no follower on the axis) =====
{
  const spacing = 140;
  const s = formationSlots('pincer', 7, spacing);
  const foll = s.slice(1);
  const left = foll.filter(p => p.x < 0), rightG = foll.filter(p => p.x > 0);
  assert.ok(left.length > 0 && rightG.length > 0, 'pincer has followers on BOTH flanks');
  assert.ok(Math.abs(left.length - rightG.length) <= 1, 'pincer flanks are balanced');
  for (const p of foll) assert.ok(Math.abs(p.x) >= spacing, 'pincer keeps a clear central gap (no follower near the axis)');
}

// ===== spacing scales offsets linearly — 2x spacing yields exactly 2x every offset, for every type =====
for (const t of TYPES) {
  const a = formationSlots(t, 6, 100);
  const b = formationSlots(t, 6, 200);
  for (let i = 0; i < a.length; i++) {
    assert.ok(Math.abs(b[i].x - 2 * a[i].x) < EPS, t + ' x offset scales with spacing');
    assert.ok(Math.abs(b[i].z - 2 * a[i].z) < EPS, t + ' z offset scales with spacing');
  }
}

// ===== formationBreak: true when the player is in engage range OR the leader is dead; false otherwise =====
{
  const cfg = FORMATIONS.vee;   // engageRange = 1200
  assert.strictEqual(formationBreak(3000, true, cfg), false, 'far + leader alive -> hold');
  assert.strictEqual(formationBreak(cfg.engageRange + 1, true, cfg), false, 'just outside engage range -> hold');
  assert.strictEqual(formationBreak(cfg.engageRange, true, cfg), true, 'AT engage range -> break');
  assert.strictEqual(formationBreak(500, true, cfg), true, 'player inside engage range -> break');
  assert.strictEqual(formationBreak(3000, false, cfg), true, 'leader dead -> break even when far');
  assert.strictEqual(formationBreak(500, false, cfg), true, 'leader dead AND player close -> break');
  assert.strictEqual(formationBreak(99999, true, undefined), false, 'no cfg + far -> hold (default engage range)');
  assert.strictEqual(formationBreak(0, true, undefined), true, 'no cfg + point-blank -> break (default engage range)');
}

console.log('ALL FORMATION TESTS PASS');
