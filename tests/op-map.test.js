'use strict';
const assert = require('assert');
const { genOpMap, sectorMission, sectorPlan } = require('../js/opmap.js');

// flatten helper (avoid Array.prototype.flat for older Node)
function flatten(stages) { return stages.reduce(function (a, st) { return a.concat(st); }, []); }

// ---- the campaign is hand-authored, fixed, and identical on every call ----
const m = genOpMap(true);
assert.strictEqual(m.length, 7, '6 sector stages + FINAL');
assert.strictEqual(m[0].length, 2, 'stage 1 offers a choice of 2');
assert.deepStrictEqual(m[6], ['FINAL'], 'last stage is FINAL only');
assert.deepStrictEqual(genOpMap(true), genOpMap(true), 'campaign is fixed (deterministic, not random)');

// every sector type that surfaces a mission type appears somewhere on the map
const flat = flatten(m);
['FURBALL', 'INTERCEPT', 'ESCORT', 'DEFEND', 'STRIKE', 'ELITE', 'DEPOT', 'FINAL'].forEach(function (ty) {
  assert.ok(flat.indexOf(ty) !== -1, 'campaign includes a ' + ty + ' sector');
});
let depots = 0; flat.forEach(function (s) { if (s === 'DEPOT') depots++; });
assert.strictEqual(depots, 1, 'exactly one DEPOT');

// ground war off: STRIKE sectors fall back to air, but escort/defend objectives still appear
const flat2 = flatten(genOpMap(false));
assert.strictEqual(flat2.indexOf('STRIKE'), -1, 'no STRIKE sectors when ground war off');
assert.ok(flat2.indexOf('ESCORT') !== -1 && flat2.indexOf('DEFEND') !== -1, 'escort/defend present even with ground war off');

assert.strictEqual(sectorPlan('ELITE', 7).rival, true);
assert.strictEqual(sectorPlan('FURBALL', 12).fighters, 10, 'fighter count caps at 10');
assert.strictEqual(sectorPlan('DEPOT', 5).depot, true);
assert.strictEqual(sectorPlan('FINAL', 13).boss, true);

// ---- mission descriptor on every plan (feature #3 seam) ----
assert.strictEqual(sectorPlan('FURBALL', 3).mission, 'sweep');
assert.strictEqual(sectorPlan('INTERCEPT', 3).mission, 'intercept');
assert.strictEqual(sectorPlan('STRIKE', 3).mission, 'strike');
assert.strictEqual(sectorPlan('ESCORT', 3).mission, 'escort');
assert.strictEqual(sectorPlan('DEFEND', 3).mission, 'defend');
assert.strictEqual(sectorPlan('ELITE', 3).mission, 'none');
assert.strictEqual(sectorPlan('DEPOT', 3).mission, 'none');
assert.strictEqual(sectorPlan('FINAL', 3).mission, 'boss');
// ---- feature #4 weather + TOD slots: every plan carries a known condition + a valid TOD index ----
const WEATHER_KEYS = ['clear', 'fog', 'storm'];
['FURBALL', 'INTERCEPT', 'STRIKE', 'ESCORT', 'DEFEND', 'ELITE', 'DEPOT', 'FINAL'].forEach(function (ty) {
  const p = sectorPlan(ty, 5);
  assert.ok('weather' in p, 'every plan carries a weather slot (' + ty + ')');
  assert.ok(WEATHER_KEYS.indexOf(p.weather) !== -1, 'weather is a known condition (' + ty + ')');
  assert.ok(p.tod >= 0 && p.tod <= 2, 'tod is a valid TOD index 0..2 (' + ty + ')');
  assert.strictEqual(sectorMission(ty), p.mission, 'sectorMission matches plan.mission (' + ty + ')');
});
// the climactic FINAL sector flies a night storm; plain dogfights stay clear daylight
assert.strictEqual(sectorPlan('FINAL', 13).weather, 'storm', 'FINAL is a storm');
assert.strictEqual(sectorPlan('FINAL', 13).tod, 2, 'FINAL is at night');
assert.strictEqual(sectorPlan('FURBALL', 3).weather, 'clear', 'FURBALL stays clear');

// ---- F8: hostileAce flag — combat sectors spawn a named ace; DEPOT + FINAL do not ----
['FURBALL', 'INTERCEPT', 'STRIKE', 'ESCORT', 'DEFEND', 'ELITE'].forEach(function (ty) {
  assert.strictEqual(sectorPlan(ty, 5).hostileAce, true, 'combat sector spawns a hostile ace (' + ty + ')');
});
assert.strictEqual(sectorPlan('DEPOT', 5).hostileAce, false, 'DEPOT has no hostile ace');
assert.strictEqual(sectorPlan('FINAL', 5).hostileAce, false, 'FINAL has no named sector ace (boss is the cap)');

console.log('ok - operation map generation and sector plans');
