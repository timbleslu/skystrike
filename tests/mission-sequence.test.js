'use strict';
// Multi-phase objective SEQUENCE — drives the PURE walker in missions.js end to end, importing the
// REAL implementation (no mirror copy). Covers: the sequence VALUE + cursor, phase advance on win,
// the "not done between phases / done after the last phase" signal the glue uses to clear leftovers,
// fail-at-any-phase via the state machine, the pure spawn-request descriptors, and the ONE shared
// budget rule on BOTH the single-objective (planObjective) and multi-phase (planPhase) paths. The
// shared budget rule is core.js campaignClearTarget (missions.js's Node bridge pulls it in on require).
const assert = require('assert');
const core = require('../js/core.js');
const {
  missionForSector, missionKill, tickMission,
  missionSequence, sequenceDescriptor, advanceSequence, phaseClearTarget, planPhase, planObjective,
} = require('../js/missions.js');

// ===== the sequence VALUE: build from an authored objectives queue; null = single-objective sector =====
assert.strictEqual(missionSequence(null), null, 'no objectives -> single-objective sector (null sequence)');
assert.strictEqual(missionSequence([]), null, 'empty objectives -> null sequence');
assert.strictEqual(sequenceDescriptor(null), null, 'no descriptor for a null sequence');
{
  const seq = missionSequence(['RECON', { type: 'STRIKE', spawn: { ground: true } }]);
  assert.strictEqual(seq.idx, 0, 'cursor starts at phase 0');
  assert.strictEqual(seq.phases.length, 2, 'queue copied into the sequence value');
  assert.strictEqual(sequenceDescriptor(seq), 'RECON', 'descriptor is the phase the cursor points at');
}

// ===== advanceSequence: win-only cursor step, immutable input, done after the last phase =====
{
  const seq = missionSequence(['A', 'B', 'C']);
  const a0 = advanceSequence(seq);
  assert.strictEqual(a0.done, false, 'phase 0 -> not done (glue clears leftovers, starts phase 1)');
  assert.strictEqual(a0.seq.idx, 1, 'cursor advances to 1');
  assert.strictEqual(seq.idx, 0, 'advanceSequence returns a NEW value — input cursor is NOT mutated');
  const a1 = advanceSequence(a0.seq);
  assert.strictEqual(a1.done, false, 'phase 1 -> not done');
  assert.strictEqual(a1.seq.idx, 2, 'cursor advances to 2');
  const a2 = advanceSequence(a1.seq);
  assert.strictEqual(a2.done, true, 'last phase win completes the level');
  assert.strictEqual(a2.seq, null, 'done -> no next sequence');
}

// ===== full heterogeneous sequence driven through the pure walker: RECON -> INTERCEPT -> SWEEP =====
{
  let seq = missionSequence(['RECON', { type: 'INTERCEPT', spawn: { bombers: 2 } }, { type: 'SWEEP', spawn: { fighters: 3 } }]);

  // phase 0 (RECON nav leg) — plan, force all waypoints hit, tick to won
  const p0 = planPhase(sequenceDescriptor(seq), 1, seq.idx + 1, seq.phases.length, true);
  assert.strictEqual(p0.verb, 'recon', 'RECON descriptor maps to the recon verb');
  assert.strictEqual(p0.mission.type, 'recon');
  assert.deepStrictEqual(p0.spawnRequests, [{ kind: 'props', verb: 'recon' }], 'recon phase requests only props (waypoints)');
  assert.deepStrictEqual(p0.banners, { callout: { phase: 1, total: 3 }, missionStart: true, missionCard: 'recon', objective: true }, 'first phase leads with the objective header + intro card');
  p0.mission.params.waypoints = [{ x: 0, y: 0, z: 0, hit: true }, { x: 1, y: 0, z: 0, hit: true }, { x: 2, y: 0, z: 0, hit: true }, { x: 3, y: 0, z: 0, hit: true }];
  tickMission(p0.mission, 0.016);
  assert.strictEqual(p0.mission.status, 'won', 'recon phase wins when every waypoint is hit');
  const adv0 = advanceSequence(seq);
  assert.strictEqual(adv0.done, false, 'not the last phase -> glue clears leftovers between phases');
  seq = adv0.seq;

  // phase 1 (INTERCEPT) — budget rule clamps the target to the 2 authored bombers; kill them to win
  const p1 = planPhase(sequenceDescriptor(seq), 1, seq.idx + 1, seq.phases.length, false);
  assert.strictEqual(p1.verb, 'intercept');
  assert.strictEqual(p1.mission.target, 2, 'intercept phase target clamped to its 2-bomber budget');
  assert.deepStrictEqual(p1.spawnRequests, [{ kind: 'props', verb: 'intercept' }, { kind: 'bombers', n: 2, verb: 'intercept' }], 'intercept phase requests bombers');
  assert.deepStrictEqual(p1.banners, { callout: { phase: 2, total: 3 }, missionStart: false, missionCard: null, objective: true }, 'mid-sequence phase fires the callout but no intro card');
  for (let k = 0; k < 2; k++) missionKill(p1.mission, { _missionTarget: true });
  tickMission(p1.mission, 0.016);
  assert.strictEqual(p1.mission.status, 'won', 'intercept phase wins when its bomber budget is down');
  const adv1 = advanceSequence(seq);
  assert.strictEqual(adv1.done, false);
  seq = adv1.seq;

  // phase 2 (LAST, SWEEP) — target clamped to 3 fighters; win -> advance reports DONE (level complete)
  const p2 = planPhase(sequenceDescriptor(seq), 1, seq.idx + 1, seq.phases.length, false);
  assert.strictEqual(p2.verb, 'sweep');
  assert.strictEqual(p2.mission.target, 3, 'sweep phase target clamped to its 3-fighter budget');
  assert.deepStrictEqual(p2.spawnRequests, [{ kind: 'props', verb: 'sweep' }, { kind: 'fighters', n: 3 }], 'sweep phase requests fighters');
  for (let k = 0; k < 3; k++) missionKill(p2.mission, {});
  tickMission(p2.mission, 0.016);
  assert.strictEqual(p2.mission.status, 'won');
  const adv2 = advanceSequence(seq);
  assert.strictEqual(adv2.done, true, 'the final phase win completes the sector (no more phases)');
}

// ===== spawn-request descriptors: STRIKE phase (ground site), nav wp trim =====
{
  const strike = planPhase({ type: 'STRIKE', spawn: { ground: true } }, 1, 1, 2, false);
  assert.strictEqual(strike.verb, 'strike');
  assert.strictEqual(strike.mission.target, 1, 'a strike site is one target');
  assert.deepStrictEqual(strike.spawnRequests, [{ kind: 'props', verb: 'strike' }, { kind: 'strikeSite' }], 'strike phase queues the ground site, no air budget');

  const nav = planPhase({ type: 'RECON', wp: 2 }, 1, 1, 2, true);
  assert.strictEqual(nav.mission.target, 2, 'wp trims the nav leg target');
  assert.strictEqual(nav.mission.params.count, 2, 'wp trims the waypoint count');
}

// ===== the ONE shared budget rule on BOTH paths (single-objective + multi-phase) =====
{
  // shared helper delegates to core.js campaignClearTarget = min(procedural, spawnedKillCount)
  assert.strictEqual(phaseClearTarget('sweep', 2, { fighters: 3 }), core.campaignClearTarget('sweep', 2, { fighters: 3 }), 'phaseClearTarget IS campaignClearTarget');
  assert.strictEqual(phaseClearTarget('recon', 3, null), null, 'non-kill verb -> null (leave the target as startMission set it)');

  // single-objective path (planObjective) clamps through the SAME rule
  assert.strictEqual(planObjective('sweep', 2, { fighters: 3, aces: 0 }, null).mission.target, 3, 'single-objective sweep w2: min(procedural 4, spawned 3) = 3');
  assert.strictEqual(planObjective('sweep', 12, { fighters: 12, aces: 0 }, null).mission.target, 10, 'single-objective sweep w12: clamped to the procedural cap min(10, 12) = 10');
  assert.strictEqual(planObjective('sweep', 12, { fighters: 12 }, null).mission.target, core.campaignClearTarget('sweep', 12, { fighters: 12 }), 'single-objective delegates to campaignClearTarget');
  assert.strictEqual(planObjective('escort', 5, { fighters: 0 }, null).mission.target, 3, 'non-kill single-objective (escort) keeps its startMission survivor threshold — the budget rule returns null');

  // multi-phase path (planPhase) clamps through the SAME rule — identical to the single-objective result
  assert.strictEqual(planPhase({ type: 'SWEEP', spawn: { fighters: 3 } }, 2, 1, 1, false).mission.target, core.campaignClearTarget('sweep', 2, { fighters: 3 }), 'multi-phase sweep delegates to the same rule');
  assert.strictEqual(planPhase({ type: 'INTERCEPT', spawn: { bombers: 2 } }, 3, 1, 1, false).mission.target, core.campaignClearTarget('intercept', 3, { bombers: 2 }), 'multi-phase intercept delegates to the same rule');
}

// ===== fail-at-any-phase: a mid-sequence phase reaches 'failed' via the state machine =====
// (the glue's onMissionResolved(false) then abandons the sequence — advanceSequence is a WIN-only
//  operation and is never called on a fail, so a failed phase never advances the cursor.)
{
  const seq = missionSequence(['RECON', { type: 'INTERCEPT', spawn: { bombers: 2 } }, { type: 'SWEEP', spawn: { fighters: 3 } }]);
  const mid = advanceSequence(seq).seq;                 // point at phase 1 (intercept)
  const fp = planPhase(sequenceDescriptor(mid), 1, 2, 3, false);
  assert.strictEqual(fp.mission.type, 'intercept');
  tickMission(fp.mission, 999);                          // blow past the intercept countdown
  assert.strictEqual(fp.mission.status, 'failed', 'any phase can fail (intercept timer expiry mid-sequence)');
}

// sanity: the verb mapping the walker relies on is the real one
assert.strictEqual(missionForSector('RECON'), 'recon');
assert.strictEqual(missionForSector('STRIKE'), 'strike');

console.log('ok - mission-sequence: pure walker (sequence value + cursor), phase advance on win, done-after-last, shared budget rule on both paths, fail-at-any-phase');
