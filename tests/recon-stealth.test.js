'use strict';
// Non-combat mission cores (feature 2026-06: RECON + STEALTH). The shared waypoint primitive +
// detection model are PURE in js/core.js; this test imports the REAL implementation (no mirror copy).
// RECON = fly through N waypoints. STEALTH = reach an extraction waypoint without being detected.
const assert = require('assert');
const {
  reconProgress, nextWaypoint, detectionDelta,
  reconWon, stealthWon, stealthFailed,
} = require('../js/core.js');

// helper: build a fresh waypoint list (plain {x,y,z,hit} — the primitive is THREE-free)
const wps = (...pts) => pts.map(p => ({ x: p[0], y: p[1], z: p[2], hit: !!p[3] }));

/* ===== reconProgress: flips hit within radius, counts, reports nextIndex ===== */
{
  const list = wps([0, 0, 0], [1000, 0, 0], [2000, 0, 0]);
  // player sitting ON the first waypoint, hitRadius 320 → only #0 flips
  let r = reconProgress(list, { x: 50, y: 10, z: 0 }, 320);
  assert.strictEqual(r.hitCount, 1, 'one waypoint within radius is hit');
  assert.strictEqual(list[0].hit, true, 'waypoint 0 flagged hit');
  assert.strictEqual(list[1].hit, false, 'waypoint 1 still unhit (out of radius)');
  assert.strictEqual(r.nextIndex, 1, 'nextIndex points at the first unhit waypoint');

  // move onto #1 → now two hit, next is #2
  r = reconProgress(list, { x: 1010, y: 0, z: 0 }, 320);
  assert.strictEqual(r.hitCount, 2, 'second waypoint now hit');
  assert.strictEqual(r.nextIndex, 2, 'nextIndex advances to waypoint 2');

  // exactly on the radius boundary counts as a hit (<= contract)
  const edge = wps([0, 0, 0]);
  const re = reconProgress(edge, { x: 320, y: 0, z: 0 }, 320);
  assert.strictEqual(re.hitCount, 1, 'distance == hitRadius counts as a hit (inclusive)');
}

/* ===== reconProgress: idempotent — a hit waypoint STAYS hit even when you fly away ===== */
{
  const list = wps([0, 0, 0]);
  reconProgress(list, { x: 0, y: 0, z: 0 }, 320);
  assert.strictEqual(list[0].hit, true, 'flagged on the pass');
  const r = reconProgress(list, { x: 99999, y: 0, z: 0 }, 320);   // far away now
  assert.strictEqual(list[0].hit, true, 'stays hit (idempotent — does not un-flag)');
  assert.strictEqual(r.hitCount, 1, 'still counted as hit');
  assert.strictEqual(r.nextIndex, -1, 'nextIndex is -1 when all waypoints are hit');
}

/* ===== reconProgress: full pass → all hit, nextIndex -1 ===== */
{
  const list = wps([0, 0, 0, true], [10, 0, 0, true]);
  const r = reconProgress(list, { x: 5, y: 0, z: 0 }, 1);
  assert.strictEqual(r.hitCount, 2, 'all pre-hit waypoints counted');
  assert.strictEqual(r.nextIndex, -1, 'no next waypoint when path complete');
}

/* ===== nextWaypoint: first unhit, or null when complete ===== */
{
  const list = wps([0, 0, 0, true], [100, 0, 0, false], [200, 0, 0, false]);
  const n = nextWaypoint(list);
  assert.strictEqual(n.x, 100, 'returns the first still-unhit waypoint');
  assert.strictEqual(nextWaypoint(wps([0, 0, 0, true])), null, 'null when every waypoint is hit');
  assert.strictEqual(nextWaypoint([]), null, 'null for an empty path');
}

/* ===== detectionDelta: RAW signed delta (caller clamps) — rises on firing / beingAimed, decays otherwise =====
   Contract: positive delta when firing OR being aimed at; negative (decay) when neither. The function
   returns the raw per-frame delta and does NOT clamp — clamping to 0..1 is the caller's job. */
{
  const dt = 1;
  // firing only
  assert.strictEqual(detectionDelta({ firing: true, beingAimed: false, dt, riseRate: 0.5, decayRate: 0.2 }), 0.5, 'firing raises by riseRate*dt');
  // being aimed only
  assert.strictEqual(detectionDelta({ firing: false, beingAimed: true, dt, riseRate: 0.5, decayRate: 0.2 }), 0.5, 'being aimed raises by riseRate*dt');
  // both → still a single rise (not doubled)
  assert.strictEqual(detectionDelta({ firing: true, beingAimed: true, dt, riseRate: 0.5, decayRate: 0.2 }), 0.5, 'firing AND aimed is one rise, not stacked');
  // neither → decay (negative)
  assert.strictEqual(detectionDelta({ firing: false, beingAimed: false, dt, riseRate: 0.5, decayRate: 0.2 }), -0.2, 'idle decays by -decayRate*dt');
  // scales with dt
  assert.strictEqual(detectionDelta({ firing: true, beingAimed: false, dt: 0.5, riseRate: 0.4, decayRate: 0.2 }), 0.2, 'rise scales with dt');
  // raw delta is NOT clamped — a big dt can exceed 1 (the caller clamps the running meter)
  assert.strictEqual(detectionDelta({ firing: true, beingAimed: false, dt: 10, riseRate: 1, decayRate: 0.2 }), 10, 'returns RAW delta unclamped (caller clamps)');

  // integrate the way updateMission does (clamp at the call site) — a sustained alarm reaches 1 then holds
  let det = 0;
  for (let i = 0; i < 20; i++) det = Math.max(0, Math.min(1, det + detectionDelta({ firing: true, beingAimed: false, dt: 0.1, riseRate: 0.45, decayRate: 0.18 })));
  assert.ok(det >= 0.9, 'sustained firing drives the clamped meter toward the alarm');
  // then go quiet — it decays back down, clamped at 0
  for (let i = 0; i < 200; i++) det = Math.max(0, Math.min(1, det + detectionDelta({ firing: false, beingAimed: false, dt: 0.1, riseRate: 0.45, decayRate: 0.18 })));
  assert.strictEqual(det, 0, 'going quiet long enough decays the meter to a clamped 0');
}

/* ===== recon win predicate ===== */
{
  assert.strictEqual(reconWon({ params: { waypoints: wps([0, 0, 0, true], [1, 0, 0, true]) } }), true, 'recon won when all waypoints hit');
  assert.strictEqual(reconWon({ params: { waypoints: wps([0, 0, 0, true], [1, 0, 0, false]) } }), false, 'not won while any waypoint unhit');
  assert.strictEqual(reconWon({ params: { waypoints: [] } }), false, 'an empty path is never a win (guards setup race)');
}

/* ===== stealth win/fail predicates ===== */
{
  // reached extraction, low detection → win
  assert.strictEqual(stealthWon({ params: { waypoints: wps([0, 0, 0, true]), detect: 0.4 } }), true, 'reached + undetected = win');
  // reached extraction but alarm raised → NOT a win, and a fail
  const alarmed = { params: { waypoints: wps([0, 0, 0, true]), detect: 1 } };
  assert.strictEqual(stealthWon(alarmed), false, 'alarm cancels the win even at the extraction point');
  assert.strictEqual(stealthFailed(alarmed), true, 'detect >= 1 is a fail (alarm raised)');
  // not yet reached, low detection → neither win nor fail (still active)
  const enroute = { params: { waypoints: wps([0, 0, 0, false]), detect: 0.3 } };
  assert.strictEqual(stealthWon(enroute), false, 'not won before reaching extraction');
  assert.strictEqual(stealthFailed(enroute), false, 'not failed while detect < 1');
  // fail threshold is exactly 1 (inclusive)
  assert.strictEqual(stealthFailed({ params: { detect: 0.999 } }), false, 'just under threshold is not a fail');
  assert.strictEqual(stealthFailed({ params: { detect: 1 } }), true, 'detect == 1 trips the alarm');
}

console.log('ok - recon/stealth non-combat mission cores (waypoint primitive + detection model)');
