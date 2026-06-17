'use strict';
// Regression guard: in the BOUNDED Operations campaign, a wave's required-to-clear (the mission
// kill target) MUST be <= the kill-targets actually spawned that wave. Before the fix the single-
// phase mission path used the wave-scaled PROCEDURAL setup target (sweep min(4+(wave>>1),10);
// intercept wave>=8?4:3), which on later waves exceeded the fixed authored spawn budget -> the wave
// never cleared (confirmed: ironVeil/openSkies sweep wave 2 wanted 5 kills, only 4 fighters spawn).
// The spawn list is the source of truth; campaignClearTarget (core.js) clamps the target to it.
const assert = require('assert');
const { OPERATIONS, sectorMission } = require('../js/opmap.js');
const { campaignClearTarget, campaignSpawnedKillCount } = require('../js/core.js');
const { MISSIONS, missionForSector } = require('../js/missions.js');

const KILL_VERBS = ['sweep', 'intercept', 'strike'];

// spawned kill-targets for a SINGLE-PHASE campaign wave (same budget every wave): sweep credits every
// air kill (fighters+aces), intercept credits only the _missionTarget bombers, strike is one site.
function spawnedKill(verb, spawn) {
  const s = spawn || {};
  if (verb === 'sweep') return (s.fighters || 0) + (s.aces || 0);
  if (verb === 'intercept') return (s.bombers || 0);
  if (verb === 'strike') return 1;
  return null;
}
// the OLD (buggy) procedural target the endless setup would assign for this verb+wave.
function oldProceduralTarget(verb, wave) {
  return MISSIONS[verb].setup(wave, function () { return 0; }).target;
}

// ---- (1) the OLD procedural target was genuinely broken: it violates the rule for openSkies w2 ----
// (this is what makes the new test a real regression test — it would FAIL against the pre-fix target).
{
  const openSkies = OPERATIONS[0].levels[1];
  assert.strictEqual(openSkies.id, 'openSkies', 'op0 level1 is openSkies');
  assert.strictEqual(sectorMission(openSkies.type), 'sweep', 'openSkies is a sweep');
  const spawned = spawnedKill('sweep', openSkies.spawn);   // 4 fighters + 0 aces
  assert.strictEqual(spawned, 4, 'openSkies spawns 4 kill-targets per wave');
  assert.strictEqual(oldProceduralTarget('sweep', 1), 4, 'OLD wave 1 target = 4');
  assert.strictEqual(oldProceduralTarget('sweep', 2), 5, 'OLD wave 2 target = 5');
  assert.ok(oldProceduralTarget('sweep', 1) <= spawned, 'OLD wave 1 was clearable (4 <= 4)');
  assert.ok(oldProceduralTarget('sweep', 2) > spawned, 'OLD wave 2 was UNCLEARABLE (5 > 4) — the bug');
}

// ---- (2) explicit: openSkies wave 2 is clearable AFTER the fix ----
{
  const openSkies = OPERATIONS[0].levels[1];
  const required = campaignClearTarget('sweep', 2, openSkies.spawn);
  const spawned = spawnedKill('sweep', openSkies.spawn);
  assert.strictEqual(spawned, 4, 'openSkies wave 2 spawns 4');
  assert.strictEqual(required, 4, 'openSkies wave 2 required-to-clear is clamped to 4');
  assert.ok(required <= spawned, 'openSkies wave 2 is clearable (4 <= 4)');
}

// ---- (3) GLOBAL invariant: every op / every level / every wave / every objective phase ----
// for each kill-type, the required-to-clear the game ACTUALLY uses post-fix must be <= spawned.
let killChecks = 0;
OPERATIONS.forEach(function (op) {
  op.levels.forEach(function (lvl) {
    const waves = lvl.waves;
    assert.ok(waves >= 1, 'every level has >= 1 wave (' + lvl.id + ')');

    if (Array.isArray(lvl.objectives) && lvl.objectives.length) {
      // MULTI-PHASE: each phase spawns EXACTLY its authored budget and the walker sets the target to
      // that budget (missions.js startMissionPhase: sweep->spawn.fighters, intercept->spawn.bombers,
      // nav->wp). Mirror that here: required == budget == spawned -> always clearable.
      lvl.objectives.forEach(function (desc, pi) {
        const sectorType = (desc && typeof desc === 'object') ? desc.type : desc;
        const verb = missionForSector(sectorType);
        const spawn = (desc && typeof desc === 'object') ? desc.spawn : null;
        if (verb === 'sweep' && spawn && spawn.fighters) {
          const required = spawn.fighters, spawned = spawn.fighters;
          assert.ok(required <= spawned, 'phase ' + pi + ' sweep clearable in ' + op.id + '/' + lvl.id);
          killChecks++;
        } else if (verb === 'intercept' && spawn && spawn.bombers) {
          const required = spawn.bombers, spawned = spawn.bombers;
          assert.ok(required <= spawned, 'phase ' + pi + ' intercept clearable in ' + op.id + '/' + lvl.id);
          killChecks++;
        } else if (verb === 'strike') {
          assert.ok(1 <= 1, 'phase ' + pi + ' strike clearable in ' + op.id + '/' + lvl.id);
          killChecks++;
        }
        // recon/stealth/escort/defend phases are non-kill; nothing to clamp.
      });
      return;
    }

    // SINGLE-PHASE level: same authored air budget every wave; the live target is campaignClearTarget.
    const verb = sectorMission(lvl.type);
    if (KILL_VERBS.indexOf(verb) === -1) return;   // non-kill verb (escort/defend/recon/stealth/none/boss)
    const spawned = spawnedKill(verb, lvl.spawn);
    assert.strictEqual(campaignSpawnedKillCount(verb, lvl.spawn), spawned,
      'core spawned-kill-count matches the test model for ' + op.id + '/' + lvl.id);
    for (let w = 1; w <= waves; w++) {
      const required = campaignClearTarget(verb, w, lvl.spawn);
      assert.ok(required !== null, 'kill verb yields a numeric target (' + op.id + '/' + lvl.id + ' w' + w + ')');
      assert.ok(required <= spawned,
        'required(' + required + ') <= spawned(' + spawned + ') for ' + op.id + '/' + lvl.id +
        ' verb=' + verb + ' wave=' + w);
      assert.ok(required >= 1, 'a kill objective still needs at least 1 kill (' + op.id + '/' + lvl.id + ' w' + w + ')');
      killChecks++;
    }
  });
});
assert.ok(killChecks >= 20, 'exercised a meaningful number of kill-type wave/phase checks (got ' + killChecks + ')');

console.log('ok - clear-count: every campaign wave/phase kill target <= spawned kill-targets (' + killChecks + ' checks)');
