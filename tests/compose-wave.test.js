'use strict';
// composeWave (core.js) — the pure "what is this wave" decision. Campaign path is a deterministic
// pass-through of a levelPlan; endless path draws an INJECTED rng in a fixed order (byte-identical to the
// old inline nextWave). Boss-schedule state (bossWaveNext/bossWaveActive) is IN via ctx, OUT on the manifest.
const assert = require('assert');
const { composeWave } = require('../js/core.js');
const { levelPlan } = require('../js/opmap.js');

// rng stub: yields the provided values in order, THROWS if drawn more times than supplied — so a mis-sized
// array is a loud failure and the array length doubles as an assertion on the exact rng call COUNT.
function rngQueue(vals) {
  let i = 0;
  return function () {
    if (i >= vals.length) throw new Error('rng overdrawn: call #' + (i + 1) + ' but only ' + vals.length + ' supplied');
    return vals[i++];
  };
}

/* ===================== CAMPAIGN — authored, deterministic, boss pass-through ===================== */

// Boss level from a literal plan: phases pass through by reference, weather/tod carried, schedule untouched.
(function testCampaignBossPassThrough() {
  const bossPlan = { fighters: 2, aces: 1, bombers: 1, ground: false, weather: 'storm', tod: 2,
    hostileAce: false, mission: 'boss', boss: true };
  const phases = [{ turnMul: 1.2 }, { fireMul: 1.5 }, { extraMissiles: 2 }];
  const m = composeWave({ campaignPlan: bossPlan, bossPhases: phases, bossWaveNext: 7 });
  assert.strictEqual(m.mode, 'campaign');
  assert.strictEqual(m.boss, true);
  assert.strictEqual(m.bossPhases, phases, 'authored boss phases pass through by reference');
  assert.strictEqual(m.weather, 'storm');
  assert.strictEqual(m.tod, 2);
  assert.strictEqual(m.fighters, 2);
  assert.strictEqual(m.aces, 1);
  assert.strictEqual(m.bombers, 1);
  assert.strictEqual(m.mission, 'boss');
  assert.strictEqual(m.bossWaveNext, 7, 'endless boss schedule is untouched in campaign');
  assert.strictEqual(m.bossWaveActive, true);
  console.log('ok - campaign boss pass-through');
})();

// Non-boss objective level: no phases, weather/tod normalize, objectives carried, ground true.
(function testCampaignNonBoss() {
  const objPlan = { fighters: 4, aces: 0, bombers: 0, ground: true, weather: undefined, tod: undefined,
    hostileAce: true, mission: 'sweep', boss: false, objectives: [{ type: 'recon' }] };
  const m = composeWave({ campaignPlan: objPlan, bossPhases: null, bossWaveNext: 3 });
  assert.strictEqual(m.boss, false);
  assert.strictEqual(m.bossPhases, null, 'no phases on a non-boss level');
  assert.strictEqual(m.weather, 'clear', 'undefined weather -> clear');
  assert.strictEqual(m.tod, 0, 'undefined tod -> 0');
  assert.strictEqual(m.ground, true);
  assert.strictEqual(m.hostileAce, true);
  assert.deepStrictEqual(m.objectives, [{ type: 'recon' }]);
  console.log('ok - campaign non-boss');
})();

// Integration: a literal level ROW through the real opmap levelPlan, then composeWave (FINAL -> boss).
(function testCampaignViaLevelPlan() {
  const lvl = { id: 't.final', nameKey: 'op.t.l1.name', type: 'FINAL',
    spawn: { fighters: 3, aces: 2, bombers: 0, ground: false, weather: 'fog', tod: 1 },
    boss: { callsignKey: 'x', phases: [{ a: 1 }, { b: 2 }, { c: 3 }] } };
  const plan = levelPlan(lvl);
  const m = composeWave({ campaignPlan: plan, bossPhases: (lvl.boss && lvl.boss.phases) || null, bossWaveNext: 5 });
  assert.strictEqual(m.boss, true, 'FINAL level -> boss wave');
  assert.strictEqual(m.bossPhases, lvl.boss.phases, 'boss.phases threaded through levelPlan+composeWave');
  assert.strictEqual(m.weather, 'fog');
  assert.strictEqual(m.fighters, 3);
  assert.strictEqual(m.aces, 2);
  console.log('ok - campaign via levelPlan');
})();

/* ===================== ENDLESS — stubbed rng, exact draw order ===================== */

// Boss wave: schedule SEEDED (bossWaveNext 0 -> 3), fires, reschedules 3 waves out (-> 8). rng: seed, reschedule,
// wildcard (all 0). Boss suppresses ace/bomber/drone rolls -> only 3 draws.
(function testEndlessBossSeedAndReschedule() {
  const m = composeWave({
    wave: 5, strike: false, difficulty: 0, weatherSeed: 1,
    lockWeather: null, weeklyAces: 0, weeklyWavePlan: null,
    countDelta: 0, groundAllowed: false, bossWaveNext: 0, rivalDue: false,
    rng: rngQueue([0, 0, 0]),
  });
  assert.strictEqual(m.boss, true, 'wave 5 reaches the seeded mark (3)');
  assert.strictEqual(m.bossWaveActive, true);
  assert.strictEqual(m.bossWaveNext, 8, 'rescheduled to wave 5 + offset 3');
  assert.strictEqual(m.fighters, 8, 'waveCount(5, 0, 16) = 8');
  assert.strictEqual(m.aces, 0, 'no aces on a boss wave');
  assert.strictEqual(m.bomber, false);
  assert.strictEqual(m.droneSwarm, 0);
  assert.strictEqual(m.banner, 'boss');
  console.log('ok - endless boss seed + reschedule');
})();

// Seed threads OUT even when the seeded mark is NOT reached this wave (boss stays false).
(function testEndlessSeedThreadsOutNonBoss() {
  const m = composeWave({
    wave: 3, strike: false, difficulty: 0, weatherSeed: 1,
    lockWeather: null, weeklyAces: 0, weeklyWavePlan: null,
    countDelta: 0, groundAllowed: false, bossWaveNext: 0, rivalDue: false,
    rng: rngQueue([0.99, 0.99, 0.99, 0.99]),   // seed(->5), wildcard, ace roll, drone roll
  });
  assert.strictEqual(m.bossWaveNext, 5, 'seed (3 + floor(0.99*3)=5) threaded out on a non-boss wave');
  assert.strictEqual(m.boss, false, 'wave 3 has not reached the seeded mark (5)');
  assert.strictEqual(m.bossWaveActive, false);
  assert.strictEqual(m.fighters, 6, 'waveCount(3, 0, 16) = 6');
  assert.strictEqual(m.aces, 0);
  assert.strictEqual(m.banner, 'wave');
  console.log('ok - endless seed threads out (non-boss)');
})();

// Wildcard spike + density CAP + ground count. bossWaveNext=100 (no seed, no boss). rng order:
// wildcard(0.1<0.18 -> true), bump, ace roll(fail), bomber roll(fail), drone roll(fail), ground count.
(function testEndlessWildcardAndCap() {
  const m = composeWave({
    wave: 14, strike: false, difficulty: 0, weatherSeed: 1,
    lockWeather: null, weeklyAces: 0, weeklyWavePlan: null,
    countDelta: 0, groundAllowed: true, bossWaveNext: 100, rivalDue: false,
    rng: rngQueue([0.1, 0.5, 0.9, 0.9, 0.9, 0.9]),
  });
  assert.strictEqual(m.wildcard, true);
  assert.strictEqual(m.fighters, 16, 'density cap: waveCount hits 16 and the wildcard bump cannot exceed it');
  assert.strictEqual(m.aces, 1, 'wildcard always adds one ace (base roll failed)');
  assert.strictEqual(m.bomber, false);
  assert.strictEqual(m.droneSwarm, 0);
  assert.strictEqual(m.ground, 2, 'randInt(1,2) with rng 0.9 -> 2');
  assert.strictEqual(m.boss, false);
  assert.strictEqual(m.bossWaveNext, 100, 'no boss -> schedule unchanged');
  assert.strictEqual(m.banner, 'wildcard');
  console.log('ok - endless wildcard + density cap');
})();

// Weekly wave-pattern PIN (count + formation) and weekly extra-ace COUNT. wave 1 -> pattern[0] pins n=5, wall.
(function testEndlessWeeklyPatternAndAces() {
  const m = composeWave({
    wave: 1, strike: false, difficulty: 1, weatherSeed: 1,
    lockWeather: null, weeklyAces: 3,
    weeklyWavePlan: { pattern: [{ n: 5, formation: 'wall' }, { n: 7 }] },
    countDelta: 1, groundAllowed: false, bossWaveNext: 100, rivalDue: false,
    rng: rngQueue([0.1]),   // only the wildcard roll (wave<5 -> false; <3 skips ace/bomber/drone rolls)
  });
  assert.strictEqual(m.fighters, 5, 'weekly pattern row 0 pins fighter count to 5');
  assert.strictEqual(m.formation, 'wall', 'weekly pattern row 0 pins the formation');
  assert.strictEqual(m.aces, 3, 'weekly extraAces count applied on a non-boss wave');
  assert.strictEqual(m.boss, false);
  assert.strictEqual(m.banner, 'wave');
  console.log('ok - endless weekly pattern + ace override');
})();

// Weekly pattern row WITHOUT a formation -> formation null; a later pattern index resolves by wave.
(function testEndlessWeeklyPatternNoFormation() {
  const m = composeWave({
    wave: 2, strike: false, difficulty: 1, weatherSeed: 1,
    lockWeather: null, weeklyAces: 0,
    weeklyWavePlan: { pattern: [{ n: 5, formation: 'wall' }, { n: 7 }] },
    countDelta: 1, groundAllowed: false, bossWaveNext: 100, rivalDue: false,
    rng: rngQueue([0.1]),
  });
  assert.strictEqual(m.fighters, 7, 'weekly pattern row 1 pins fighter count to 7');
  assert.strictEqual(m.formation, null, 'row without a formation -> null (unpinned)');
  console.log('ok - endless weekly pattern (no formation)');
})();

// Strike wave: fixed escort, no boss, and NOT ONE rng draw (rng throws if touched).
(function testEndlessStrikeNoRng() {
  const m = composeWave({
    wave: 5, strike: true, difficulty: 2, weatherSeed: 1,
    lockWeather: null, weeklyAces: 0, weeklyWavePlan: null,
    countDelta: 0, groundAllowed: true, bossWaveNext: 42, rivalDue: true,
    rng: function () { throw new Error('strike wave must not draw rng'); },
  });
  assert.strictEqual(m.strike, true);
  assert.strictEqual(m.fighters, 3);
  assert.strictEqual(m.boss, false);
  assert.strictEqual(m.banner, 'strike');
  assert.strictEqual(m.strikeSite, true);
  assert.strictEqual(m.bossWaveNext, 42, 'strike leaves the boss schedule alone');
  assert.strictEqual(m.bossWaveActive, false);
  console.log('ok - endless strike (no rng)');
})();

// Weather: lockWeather override wins; without it, rollWeather is deterministic + a valid condition.
(function testEndlessWeather() {
  const locked = composeWave({
    wave: 5, strike: false, difficulty: 0, weatherSeed: 1,
    lockWeather: 'fog', weeklyAces: 0, weeklyWavePlan: null,
    countDelta: 0, groundAllowed: false, bossWaveNext: 100, rivalDue: false,
    rng: function () { return 0.5; },
  });
  assert.strictEqual(locked.weather, 'fog', 'lockWeather overrides the roll');
  const rolled = composeWave({
    wave: 5, strike: false, difficulty: 0, weatherSeed: 1,
    lockWeather: null, weeklyAces: 0, weeklyWavePlan: null,
    countDelta: 0, groundAllowed: false, bossWaveNext: 100, rivalDue: false,
    rng: function () { return 0.5; },
  });
  assert.ok(['clear', 'fog', 'storm'].indexOf(rolled.weather) >= 0, 'rollWeather yields a known condition');
  console.log('ok - endless weather');
})();

// Rival flag passes straight through (the pure rivalDue decision is computed by the caller).
(function testEndlessRivalPassThrough() {
  const m = composeWave({
    wave: 6, strike: false, difficulty: 0, weatherSeed: 1,
    lockWeather: null, weeklyAces: 0, weeklyWavePlan: null,
    countDelta: 0, groundAllowed: false, bossWaveNext: 100, rivalDue: true,
    rng: rngQueue([0.9, 0.9, 0.9, 0.9]),   // wildcard(fail), ace roll(fail), bomber roll(fail), drone roll(fail)
  });
  assert.strictEqual(m.rival, true, 'rivalDue input surfaces on the manifest');
  assert.strictEqual(m.boss, false);
  console.log('ok - endless rival pass-through');
})();

console.log('ALL PASS');
