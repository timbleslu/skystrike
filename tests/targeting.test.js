'use strict';
// Lock-on / targeting subsystem — pure progress + clear cores (Candidate B consolidation).
// The two-stage lock state machine (acquire candidate -> advance progress -> promote to locked)
// had its PROGRESS math and its CLEAR-on-death rule smeared across combat.js + entities.js.
// The plain-scalar parts now live in js/core.js so they can be tested against the real impl.
// THREE math (cone/range geometry) stays in the impure caller, which feeds pre-computed booleans
// (acquiring) + scalars (dt, rate) into advanceLock, and the dead-target identity into clearLockIf.
const assert = require('assert');
const { advanceLock, clearLockIf } = require('../js/core.js');

const T = {}; // target sentinels — identity is all that matters
const A = { id: 'A' }, B = { id: 'B' };

let n = 0;
function ok(cond, msg) { assert.ok(cond, msg); n++; }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); n++; }
function close(a, b, msg) { assert.ok(Math.abs(a - b) < 1e-9, msg + ` (got ${a}, want ${b})`); n++; }

// --- advanceLock: progress advances ONLY when acquiring (aligned + in range) ---
{
  const r = advanceLock({ progress: 0, target: A }, { acquiring: true, dt: 0.5, rate: 1.3, decayRate: 0.65 });
  close(r.progress, 0.5 / 1.3, 'acquiring advances progress by dt/rate');
  eq(r.locked, false, 'still acquiring, below threshold -> not locked');
  eq(r.justLocked, false, 'no promotion yet');
}
{
  // not acquiring (misaligned or out of range) -> progress DECAYS by dt/decayRate, floored at 0
  const r = advanceLock({ progress: 0.3, target: A }, { acquiring: false, dt: 0.5, rate: 1.3, decayRate: 0.65 });
  close(r.progress, Math.max(0, 0.3 - 0.5 / 0.65), 'not acquiring decays progress by dt/decayRate');
  eq(r.progress >= 0, true, 'progress never goes negative');
  eq(r.locked, false, 'decayed below 1 -> not locked');
}
{
  // decay floor: never below 0
  const r = advanceLock({ progress: 0.1, target: A }, { acquiring: false, dt: 10, rate: 1.3, decayRate: 0.65 });
  eq(r.progress, 0, 'decay clamps at 0');
}

// --- promotes to locked at the threshold (progress reaches 1) ---
{
  const r = advanceLock({ progress: 0.9, target: A }, { acquiring: true, dt: 5, rate: 1.3, decayRate: 0.65 });
  eq(r.progress, 1, 'acquiring caps progress at 1');
  eq(r.locked, true, 'reaching 1 -> locked');
  eq(r.justLocked, true, 'crossing from <1 to >=1 fires justLocked (audio/haptic seam)');
}
{
  // already at 1 and still acquiring -> stays locked, but justLocked is FALSE (no re-fire)
  const r = advanceLock({ progress: 1, target: A }, { acquiring: true, dt: 1, rate: 1.3, decayRate: 0.65 });
  eq(r.progress, 1, 'stays capped at 1');
  eq(r.locked, true, 'stays locked');
  eq(r.justLocked, false, 'no re-promotion when already locked');
}
{
  // locked target that drops out of acquisition: progress dips below 1 -> locked clears
  const r = advanceLock({ progress: 1, target: A }, { acquiring: false, dt: 0.1, rate: 1.3, decayRate: 0.65 });
  ok(r.progress < 1, 'non-acquiring decays a full lock below 1');
  eq(r.locked, false, 'progress below 1 -> not locked anymore');
}

// --- input immutability: advanceLock never mutates its args ---
{
  const lock = { progress: 0.4, target: A };
  const sample = { acquiring: true, dt: 0.2, rate: 1.3, decayRate: 0.65 };
  advanceLock(lock, sample);
  eq(lock.progress, 0.4, 'advanceLock does not mutate lock.progress');
  eq(lock.target, A, 'advanceLock does not mutate lock.target');
  eq(sample.dt, 0.2, 'advanceLock does not mutate sample');
}

// --- clearLockIf: clears when the locked/candidate target dies ---
{
  const r = clearLockIf({ target: A, candidate: A, progress: 1 }, A);
  eq(r.target, null, 'dead locked target -> locked cleared');
  eq(r.candidate, null, 'dead candidate -> candidate cleared');
  eq(r.progress, 0, 'candidate cleared resets progress');
}
{
  // only the CANDIDATE matches the dead one (mid-acquire) -> candidate + progress cleared, no prior lock
  const r = clearLockIf({ target: null, candidate: A, progress: 0.5 }, A);
  eq(r.candidate, null, 'dead candidate cleared');
  eq(r.progress, 0, 'progress reset when candidate dies');
  eq(r.target, null, 'target stays null');
}
{
  // only the locked TARGET matches (different candidate) -> only target cleared, candidate untouched
  const r = clearLockIf({ target: A, candidate: B, progress: 0.7 }, A);
  eq(r.target, null, 'dead locked target cleared');
  eq(r.candidate, B, 'live candidate preserved');
  eq(r.progress, 0.7, 'progress preserved when candidate is alive');
}

// --- clearLockIf: NO-OP when an unrelated target dies ---
{
  const lock = { target: A, candidate: A, progress: 1 };
  const r = clearLockIf(lock, B);
  eq(r.target, A, 'unrelated death leaves locked target');
  eq(r.candidate, A, 'unrelated death leaves candidate');
  eq(r.progress, 1, 'unrelated death leaves progress');
}

// --- clearLockIf: input immutability (returns a new/plain lock, never pokes the arg) ---
{
  const lock = { target: A, candidate: A, progress: 1 };
  clearLockIf(lock, A);
  eq(lock.target, A, 'clearLockIf does not mutate input lock.target');
  eq(lock.candidate, A, 'clearLockIf does not mutate input lock.candidate');
  eq(lock.progress, 1, 'clearLockIf does not mutate input lock.progress');
}

console.log(`ok - lock-on / targeting cores (advanceLock + clearLockIf), ${n} assertions`);
