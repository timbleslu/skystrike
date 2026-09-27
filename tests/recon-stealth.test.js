'use strict';
// Non-combat mission cores (feature 2026-06: RECON + STEALTH). The shared waypoint primitive +
const assert = require('assert');
const {
  reconProgress, nextWaypoint, detectionDelta,
  reconWon, stealthWon,
} = require('../js/core.js');

const wps = (...pts) => pts.map(p => ({ x: p[0], y: p[1], z: p[2], hit: !!p[3] }));

{
  const list = wps([0, 0, 0], [1000, 0, 0], [2000, 0, 0]);
  let r = reconProgress(list, { x: 50, y: 10, z: 0 }, 320);
  assert.strictEqual(r.hitCount, 1, 'one waypoint within radius is hit');
  assert.strictEqual(list[0].hit, true, 'waypoint 0 flagged hit');
  assert.strictEqual(list[1].hit, false, 'waypoint 1 still unhit (out of radius)');
  assert.strictEqual(r.nextIndex, 1, 'nextIndex points at the first unhit waypoint');

  r = reconProgress(list, { x: 1010, y: 0, z: 0 }, 320);
  assert.strictEqual(r.hitCount, 2, 'second waypoint now hit');
  assert.strictEqual(r.nextIndex, 2, 'nextIndex advances to waypoint 2');

  const edge = wps([0, 0, 0]);
  const re = reconProgress(edge, { x: 320, y: 0, z: 0 }, 320);
  assert.strictEqual(re.hitCount, 1, 'distance == hitRadius counts as a hit (inclusive)');
}

{
  const list = wps([0, 0, 0]);
  reconProgress(list, { x: 0, y: 0, z: 0 }, 320);
  assert.strictEqual(list[0].hit, true, 'flagged on the pass');
  const r = reconProgress(list, { x: 99999, y: 0, z: 0 }, 320);
  assert.strictEqual(list[0].hit, true, 'stays hit (idempotent — does not un-flag)');
  assert.strictEqual(r.hitCount, 1, 'still counted as hit');
  assert.strictEqual(r.nextIndex, -1, 'nextIndex is -1 when all waypoints are hit');
}

{
  const list = wps([0, 0, 0, true], [10, 0, 0, true]);
  const r = reconProgress(list, { x: 5, y: 0, z: 0 }, 1);
  assert.strictEqual(r.hitCount, 2, 'all pre-hit waypoints counted');
  assert.strictEqual(r.nextIndex, -1, 'no next waypoint when path complete');
}

{
  const list = wps([0, 0, 0, true], [100, 0, 0, false], [200, 0, 0, false]);
  const n = nextWaypoint(list);
  assert.strictEqual(n.x, 100, 'returns the first still-unhit waypoint');
  assert.strictEqual(nextWaypoint(wps([0, 0, 0, true])), null, 'null when every waypoint is hit');
  assert.strictEqual(nextWaypoint([]), null, 'null for an empty path');
}

{
  const dt = 1;
  assert.strictEqual(detectionDelta({ firing: true, beingAimed: false, dt, riseRate: 0.5, decayRate: 0.2 }), 0.5, 'firing raises by riseRate*dt');
  assert.strictEqual(detectionDelta({ firing: false, beingAimed: true, dt, riseRate: 0.5, decayRate: 0.2 }), 0.5, 'being aimed raises by riseRate*dt');
  assert.strictEqual(detectionDelta({ firing: true, beingAimed: true, dt, riseRate: 0.5, decayRate: 0.2 }), 0.5, 'firing AND aimed is one rise, not stacked');
  assert.strictEqual(detectionDelta({ firing: false, beingAimed: false, dt, riseRate: 0.5, decayRate: 0.2 }), -0.2, 'idle decays by -decayRate*dt');
  assert.strictEqual(detectionDelta({ firing: true, beingAimed: false, dt: 0.5, riseRate: 0.4, decayRate: 0.2 }), 0.2, 'rise scales with dt');
  assert.strictEqual(detectionDelta({ firing: true, beingAimed: false, dt: 10, riseRate: 1, decayRate: 0.2 }), 10, 'returns RAW delta unclamped (caller clamps)');

  let det = 0;
  for (let i = 0; i < 20; i++) det = Math.max(0, Math.min(1, det + detectionDelta({ firing: true, beingAimed: false, dt: 0.1, riseRate: 0.45, decayRate: 0.18 })));
  assert.ok(det >= 0.9, 'sustained firing drives the clamped meter toward the alarm');
  for (let i = 0; i < 200; i++) det = Math.max(0, Math.min(1, det + detectionDelta({ firing: false, beingAimed: false, dt: 0.1, riseRate: 0.45, decayRate: 0.18 })));
  assert.strictEqual(det, 0, 'going quiet long enough decays the meter to a clamped 0');

  assert.strictEqual(detectionDelta({ proximity: 1, dt, riseRate: 0.5, decayRate: 0.2 }), 0.5, 'ring centre (prox 1) = full rise');
  assert.strictEqual(detectionDelta({ proximity: 0.5, dt, riseRate: 0.5, decayRate: 0.2 }), 0.25, 'half-way into the ring rises at half rate');
  assert.strictEqual(detectionDelta({ proximity: 0, dt, riseRate: 0.5, decayRate: 0.2 }), -0.2, 'outside any ring still decays');
  assert.strictEqual(detectionDelta({ firing: true, proximity: 0.5, dt, riseRate: 0.5, decayRate: 0.2 }), 0.5, 'firing is full rise, proximity does not stack on top');

  assert.strictEqual(detectionDelta({ blown: true, proximity: 0, dt, riseRate: 0.5, decayRate: 0.2 }), 0, 'blown = frozen (no decay) even clear of rings');
  assert.strictEqual(detectionDelta({ blown: true, firing: true, coneLOS: 1, proximity: 1, dt, riseRate: 0.5, decayRate: 0.2 }), 0, 'blown = frozen (no rise) regardless of any rise term');
  assert.strictEqual(detectionDelta({ coneLOS: 1, coneMul: 2, dt, riseRate: 0.5, decayRate: 0.2 }), 1.0, 'full cone-LOS = riseRate * coneLOS * coneMul');
  assert.strictEqual(detectionDelta({ coneLOS: 0.5, coneMul: 2, dt, riseRate: 0.5, decayRate: 0.2 }), 0.5, 'half cone-LOS rises at half the cone rate');
  assert.ok(detectionDelta({ coneLOS: 1, coneMul: 1.8, dt, riseRate: 0.45, decayRate: 0.3 }) >
            detectionDelta({ proximity: 1, dt, riseRate: 0.45, decayRate: 0.3 }), 'cone-LOS fills faster than a proximity ring');
}

{
  assert.strictEqual(reconWon({ params: { waypoints: wps([0, 0, 0, true], [1, 0, 0, true]) } }), true, 'recon won when all waypoints hit');
  assert.strictEqual(reconWon({ params: { waypoints: wps([0, 0, 0, true], [1, 0, 0, false]) } }), false, 'not won while any waypoint unhit');
  assert.strictEqual(reconWon({ params: { waypoints: [] } }), false, 'an empty path is never a win (guards setup race)');
}

{
  assert.strictEqual(stealthWon({ params: { waypoints: wps([0, 0, 0, true]), detect: 0.4 } }), true, 'reached extraction = win (low detection)');
  assert.strictEqual(stealthWon({ params: { waypoints: wps([0, 0, 0, true]), detect: 1 } }), true, 'reached extraction = win EVEN at full meter (meter is not a loss bar)');
  assert.strictEqual(stealthWon({ params: { waypoints: wps([0, 0, 0, false]), detect: 0.3 } }), false, 'not won before reaching extraction');
  assert.strictEqual(stealthWon({ params: { waypoints: wps([0, 0, 0, false]), detect: 1 } }), false, 'a full meter alone is not a win (must reach the waypoint)');
}

console.log('ok - recon/stealth non-combat mission cores (waypoint primitive + detection model)');
