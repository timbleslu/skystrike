'use strict';
const assert = require('assert');
const { MISSIONS, MISSION_TYPES, missionForSector, startMission, missionKill, tickMission } = require('../js/missions.js');

// ===== sector -> mission mapping (deterministic) =====
assert.strictEqual(missionForSector('FURBALL'), 'sweep');
assert.strictEqual(missionForSector('SWEEP'), 'sweep');   // multi-phase dogfight phase type maps explicitly
assert.strictEqual(missionForSector('RECON'), 'recon');
assert.strictEqual(missionForSector('STEALTH'), 'stealth');
assert.strictEqual(missionForSector('INTERCEPT'), 'intercept');
assert.strictEqual(missionForSector('STRIKE'), 'strike');
assert.strictEqual(missionForSector('ESCORT'), 'escort');
assert.strictEqual(missionForSector('DEFEND'), 'defend');
assert.strictEqual(missionForSector('ELITE'), 'none');
assert.strictEqual(missionForSector('FINAL'), 'boss');
assert.strictEqual(missionForSector('DEPOT'), 'none');

// ===== startMission builds correct target/timer/params per type =====
const sw = startMission('sweep', 12);
assert.strictEqual(sw.target, 10, 'sweep target caps at 10');
assert.strictEqual(sw.status, 'active');

const itc = startMission('intercept', 9);
assert.strictEqual(itc.target, 4, 'intercept wants 4 bombers at wave>=8');
assert.ok(itc.timer > 0, 'intercept has a countdown');

const esc = startMission('escort', 5);
assert.strictEqual(esc.params.convoy, 4, 'escort spawns a 4-unit convoy');
assert.strictEqual(esc.target, 3, 'escort needs all-but-one of the convoy alive (lose <=1 of 4; balance 2026-06)');

const def = startMission('defend', 5);
assert.ok(def.timer > 0, 'defend holds for a duration');
assert.strictEqual(def.params.assetHp, 100);

const stk = startMission('strike', 5);
assert.strictEqual(stk.params.siteUp, true);

// ===== intercept.winFail: won when progress>=target before timer; failed on timeout =====
let m = startMission('intercept', 9);   // target 4
m.params; // intercept tracks via _missionTarget on enemies
for (let k = 0; k < 4; k++) missionKill(m, { _missionTarget: true });
tickMission(m, 0.016);
assert.strictEqual(m.status, 'won', 'intercept won when all targets down before timer');

let m2 = startMission('intercept', 1);  // target 3, timer 46
missionKill(m2, { _missionTarget: true });  // only 1 of 3
tickMission(m2, 100);                        // blow past the timer
assert.strictEqual(m2.status, 'failed', 'intercept failed when timer hits 0');

// non-target kills do not credit intercept
let m3 = startMission('intercept', 1);
missionKill(m3, { _missionTarget: false });
tickMission(m3, 0.016);
assert.strictEqual(m3.progress, 0, 'intercept ignores non-target kills');

// ===== sweep.winFail: won when progress>=target =====
let sm = startMission('sweep', 2);   // target 5
for (let k = 0; k < 5; k++) missionKill(sm, {});
tickMission(sm, 0.016);
assert.strictEqual(sm.status, 'won', 'sweep won when wave cleared');

// ===== escort.winFail: failed when survivors<threshold; won at exit (balance 2026-06: target 3, lose <=1 of 4) =====
let em = startMission('escort', 5);   // convoy 4, target 3 survivors
em.params.survivors = 2;              // two trucks lost -> below the tightened threshold
tickMission(em, 0.016);
assert.strictEqual(em.status, 'failed', 'escort failed when more than one convoy unit dies');

let emOk = startMission('escort', 5); // losing exactly one (survivors 3) is still within tolerance
emOk.params.survivors = 3;
tickMission(emOk, 0.016);
assert.strictEqual(emOk.status, 'active', 'escort still active after losing only one unit (not yet exited)');

let em2 = startMission('escort', 5);
em2.params.exited = true;             // convoy reached its exit, survivors still >= target (4 >= 3)
tickMission(em2, 0.016);
assert.strictEqual(em2.status, 'won', 'escort won at convoy exit');

// ===== defend.winFail: won when timer elapses with asset alive; failed when asset dead =====
let dm = startMission('defend', 1);   // timer 52
tickMission(dm, 100);                 // survive the hold
assert.strictEqual(dm.status, 'won', 'defend won when hold timer elapses');

let dm2 = startMission('defend', 1);
dm2.params.assetHp = 0;               // asset destroyed
tickMission(dm2, 0.016);
assert.strictEqual(dm2.status, 'failed', 'defend failed when asset hp <= 0');

// ===== strike.winFail: won when site destroyed =====
let km = startMission('strike', 5);
tickMission(km, 0.016);
assert.strictEqual(km.status, 'active', 'strike active while site stands');
km.params.siteUp = false;
tickMission(km, 0.016);
assert.strictEqual(km.status, 'won', 'strike won when site flattened');

// a resolved mission ignores further ticks/kills (status latches)
let lm = startMission('sweep', 2);
for (let k = 0; k < 5; k++) missionKill(lm, {});
tickMission(lm, 0.016);              // -> won
const before = lm.progress;
missionKill(lm, {});                 // ignored once resolved
assert.strictEqual(lm.progress, before, 'resolved mission ignores further kills');

console.log('ok - missions: sector mapping, startMission params, win/fail per type, kill crediting');
