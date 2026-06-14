'use strict';
const assert = require('assert');

/* ----------------------------------------------------------------------------
   Mirrors of js/missions.js PURE helpers (keep byte-identical with source).
   The mission layer is a pure state machine: MISSIONS table + startMission /
   updateMission / missionKill / winFail / objectiveText. No THREE / DOM here.
---------------------------------------------------------------------------- */

// ---- BEGIN MIRROR (js/missions.js) ----
const MISSION_TYPES = ['sweep', 'intercept', 'escort', 'defend', 'strike'];

// op-map sector type -> mission type. Pure + deterministic given (type, rng).
// ELITE rolls escort or defend so all five mission types are reachable in play.
function missionForSector(type, rng) {
  rng = rng || Math.random;
  if (type === 'FURBALL') return 'sweep';
  if (type === 'INTERCEPT') return 'intercept';
  if (type === 'STRIKE') return 'strike';
  if (type === 'ELITE') return rng() < 0.5 ? 'escort' : 'defend';
  if (type === 'DEPOT') return 'none';
  if (type === 'FINAL') return 'boss';
  return 'sweep';
}

const MISSIONS = {
  sweep: {
    setup: function (wave, rng) {
      const n = Math.min(4 + (wave >> 1), 10);
      return { target: n, timer: 0, params: { spawn: n } };
    },
    onKill: function (e, m) { m.progress++; },
    onTick: function (dt, m) {},
    winFail: function (m) {
      if (m.progress >= m.target) return 'won';
      return 'active';
    },
  },
  intercept: {
    setup: function (wave, rng) {
      const n = wave >= 8 ? 4 : 3;
      return { target: n, timer: 45 + wave, params: { bombers: n } };
    },
    onKill: function (e, m) { if (e && e._missionTarget) m.progress++; },
    onTick: function (dt, m) { m.timer -= dt; },
    winFail: function (m) {
      if (m.progress >= m.target) return 'won';
      if (m.timer <= 0) return 'failed';
      return 'active';
    },
  },
  escort: {
    setup: function (wave, rng) {
      const n = 4;
      return { target: Math.ceil(n / 2), timer: 0, params: { convoy: n, survivors: n, exited: false } };
    },
    onKill: function (e, m) {},
    onTick: function (dt, m) {},
    winFail: function (m) {
      if (m.params.survivors < m.target) return 'failed';
      if (m.params.exited) return 'won';
      return 'active';
    },
  },
  defend: {
    setup: function (wave, rng) {
      const hold = 50 + wave * 2;
      return { target: 0, timer: hold, params: { assetHp: 100, assetMaxHp: 100 } };
    },
    onKill: function (e, m) {},
    onTick: function (dt, m) { m.timer -= dt; },
    winFail: function (m) {
      if (m.params.assetHp <= 0) return 'failed';
      if (m.timer <= 0) return 'won';
      return 'active';
    },
  },
  strike: {
    setup: function (wave, rng) {
      return { target: 1, timer: 0, params: { siteUp: true } };
    },
    onKill: function (e, m) {},
    onTick: function (dt, m) {},
    winFail: function (m) {
      if (!m.params.siteUp) return 'won';
      return 'active';
    },
  },
};

function startMission(type, wave, rng) {
  const def = MISSIONS[type];
  if (!def) return { type: type, target: 0, progress: 0, timer: 0, status: 'active', params: {} };
  const s = def.setup(wave, rng || Math.random);
  return {
    type: type,
    target: s.target || 0,
    progress: 0,
    timer: s.timer || 0,
    status: 'active',
    params: s.params || {},
  };
}

function missionKill(m, e) {
  if (!m || m.status !== 'active') return;
  const def = MISSIONS[m.type];
  if (def && def.onKill) def.onKill(e, m);
}

function tickMission(m, dt) {
  if (!m || m.status !== 'active') return m;
  const def = MISSIONS[m.type];
  if (def && def.onTick) def.onTick(dt, m);
  if (def && def.winFail) m.status = def.winFail(m);
  return m;
}
// ---- END MIRROR ----

// ---- deterministic rng ----
function seqRng(vals) { let i = 0; return () => vals[i++ % vals.length]; }

// ===== sector -> mission mapping (deterministic) =====
assert.strictEqual(missionForSector('FURBALL'), 'sweep');
assert.strictEqual(missionForSector('INTERCEPT'), 'intercept');
assert.strictEqual(missionForSector('STRIKE'), 'strike');
assert.strictEqual(missionForSector('FINAL'), 'boss');
assert.strictEqual(missionForSector('DEPOT'), 'none');
assert.strictEqual(missionForSector('ELITE', seqRng([0.1])), 'escort');
assert.strictEqual(missionForSector('ELITE', seqRng([0.9])), 'defend');

// ===== startMission builds correct target/timer/params per type =====
const sw = startMission('sweep', 12);
assert.strictEqual(sw.target, 10, 'sweep target caps at 10');
assert.strictEqual(sw.status, 'active');

const itc = startMission('intercept', 9);
assert.strictEqual(itc.target, 4, 'intercept wants 4 bombers at wave>=8');
assert.ok(itc.timer > 0, 'intercept has a countdown');

const esc = startMission('escort', 5);
assert.strictEqual(esc.params.convoy, 4, 'escort spawns a 4-unit convoy');
assert.strictEqual(esc.target, 2, 'escort needs half the convoy alive');

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

// ===== escort.winFail: failed when survivors<threshold; won at exit =====
let em = startMission('escort', 5);   // convoy 4, target 2 survivors
em.params.survivors = 1;              // two trucks lost -> below threshold
tickMission(em, 0.016);
assert.strictEqual(em.status, 'failed', 'escort failed when too many convoy units die');

let em2 = startMission('escort', 5);
em2.params.exited = true;             // convoy reached its exit, survivors still >= target
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
