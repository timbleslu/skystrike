'use strict';
const assert = require('assert');

// ---- mirrors of js/opmap.js pure helpers ----
function genOpMap(groundOn, rng) {
  rng = rng || Math.random;
  const pool = ['FURBALL', 'INTERCEPT', 'ELITE'].concat(groundOn ? ['STRIKE'] : []);
  const pick = () => pool[(rng() * pool.length) | 0];
  const stages = [];
  stages.push([pick(), pick()]);
  for (let s = 0; s < 4; s++) {
    const n = 2 + ((rng() * 2) | 0);
    const arr = []; for (let i = 0; i < n; i++) arr.push(pick());
    stages.push(arr);
  }
  const depotStage = 1 + ((rng() * 3) | 0);          // stages[1..3]
  stages[depotStage][(rng() * stages[depotStage].length) | 0] = 'DEPOT';
  stages.push(['FINAL']);
  return stages;
}
// sector type -> mission type for the typed-mission layer (missions.js). Pure + deterministic.
// ELITE carries an 'elite' descriptor here; startMission rolls it to escort/defend at launch.
function sectorMission(type) {
  if (type === 'FURBALL') return 'sweep';
  if (type === 'INTERCEPT') return 'intercept';
  if (type === 'STRIKE') return 'strike';
  if (type === 'ELITE') return 'elite';
  if (type === 'DEPOT') return 'none';
  return 'boss';   // FINAL
}
// Each plan carries the legacy spawn fields PLUS a `mission` descriptor and a reserved
// `weather` slot (null here; feature #4 weather reads/sets it per sector).
function sectorPlan(type, wave) {
  if (type === 'FURBALL')   return { fighters: Math.min(4 + (wave >> 1), 10), aces: wave >= 6 ? 1 : 0, bombers: 0, ground: false, boss: false, rival: false, depot: false, mission: 'sweep', weather: null };
  if (type === 'INTERCEPT') return { fighters: 3, aces: 0, bombers: wave >= 8 ? 4 : 3, ground: false, boss: false, rival: false, depot: false, mission: 'intercept', weather: null };
  if (type === 'STRIKE')    return { fighters: 3, aces: 0, bombers: 0, ground: true, boss: false, rival: false, depot: false, mission: 'strike', weather: null };
  if (type === 'ELITE')     return { fighters: 2, aces: 2, bombers: 0, ground: false, boss: false, rival: true, depot: false, mission: 'elite', weather: null };
  if (type === 'DEPOT')     return { fighters: 0, aces: 0, bombers: 0, ground: false, boss: false, rival: false, depot: true, mission: 'none', weather: null };
  return { fighters: 4, aces: 2, bombers: 0, ground: false, boss: true, rival: false, depot: false, mission: 'boss', weather: null };   // FINAL
}

// deterministic rng
function seqRng(vals) { let i = 0; return () => vals[i++ % vals.length]; }

const m = genOpMap(true, seqRng([0.1, 0.4, 0.7, 0.2, 0.9, 0.3, 0.6, 0.5, 0.8, 0.05, 0.45, 0.95, 0.25, 0.65, 0.15]));
assert.strictEqual(m.length, 6, '5 stages + FINAL');
assert.strictEqual(m[0].length, 2, 'stage 1 offers 2');
assert.deepStrictEqual(m[5], ['FINAL'], 'last stage is FINAL only');
let depots = 0; m.forEach(st => st.forEach(s => { if (s === 'DEPOT') depots++; }));
assert.strictEqual(depots, 1, 'exactly one DEPOT');
assert.ok(!m[0].includes('DEPOT') && !m[4].includes('DEPOT'), 'DEPOT only in stages 2-4');

const m2 = genOpMap(false, seqRng([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
m2.forEach(st => st.forEach(s => assert.notStrictEqual(s, 'STRIKE', 'no STRIKE sectors when ground war off')));

assert.strictEqual(sectorPlan('ELITE', 7).rival, true);
assert.strictEqual(sectorPlan('FURBALL', 12).fighters, 10, 'fighter count caps at 10');
assert.strictEqual(sectorPlan('DEPOT', 5).depot, true);
assert.strictEqual(sectorPlan('FINAL', 13).boss, true);

// ---- mission descriptor + reserved weather slot on every plan (feature #3 / #4 seam) ----
assert.strictEqual(sectorPlan('FURBALL', 3).mission, 'sweep');
assert.strictEqual(sectorPlan('INTERCEPT', 3).mission, 'intercept');
assert.strictEqual(sectorPlan('STRIKE', 3).mission, 'strike');
assert.strictEqual(sectorPlan('ELITE', 3).mission, 'elite');
assert.strictEqual(sectorPlan('DEPOT', 3).mission, 'none');
assert.strictEqual(sectorPlan('FINAL', 3).mission, 'boss');
['FURBALL', 'INTERCEPT', 'STRIKE', 'ELITE', 'DEPOT', 'FINAL'].forEach(function (ty) {
  assert.ok('weather' in sectorPlan(ty, 5), 'every plan carries a weather slot (' + ty + ')');
  assert.strictEqual(sectorPlan(ty, 5).weather, null, 'weather slot defaults to null (' + ty + ')');
  assert.strictEqual(sectorMission(ty), sectorPlan(ty, 5).mission, 'sectorMission matches plan.mission (' + ty + ')');
});

console.log('ok - operation map generation and sector plans');
