'use strict';
const assert = require('assert');

// ---- mirrors of js/opmap.js pure helpers ----
// Fixed campaign progression — the same hand-authored map every run (no longer random).
// Each stage offers a choice of sectors; the player picks one per column, left to right.
// All five mission types (sweep/intercept/escort/defend/strike) appear as labelled sectors,
// a mid-campaign DEPOT gives a resupply breather, and FINAL caps the operation with the boss.
// STRIKE needs the ground war; when it's off those sectors fall back to an air INTERCEPT.
function genOpMap(groundOn) {
  const strike = groundOn ? 'STRIKE' : 'INTERCEPT';
  return [
    ['FURBALL', 'INTERCEPT'],
    [strike, 'ESCORT'],
    ['DEFEND', 'FURBALL'],
    ['DEPOT', 'INTERCEPT'],
    ['ESCORT', strike],
    ['ELITE', 'DEFEND'],
    ['FINAL'],
  ];
}
// sector type -> mission type for the typed-mission layer (missions.js). Pure + deterministic.
// ESCORT/DEFEND are first-class objective sectors; ELITE is a no-objective elite-ace furball.
function sectorMission(type) {
  if (type === 'FURBALL') return 'sweep';
  if (type === 'INTERCEPT') return 'intercept';
  if (type === 'STRIKE') return 'strike';
  if (type === 'ESCORT') return 'escort';
  if (type === 'DEFEND') return 'defend';
  if (type === 'ELITE') return 'none';
  if (type === 'DEPOT') return 'none';
  return 'boss';   // FINAL
}
// Each plan carries the legacy spawn fields PLUS a `mission` descriptor and the feature #4
// `weather` + `tod` slots — the tactical condition for the sector (applied in main.js nextWave
// via applyWeather/applyTimeOfDay). tod: 0 day · 1 dusk · 2 night. Deterministic per sector type.
function sectorPlan(type, wave) {
  if (type === 'FURBALL')   return { fighters: Math.min(4 + (wave >> 1), 10), aces: wave >= 6 ? 1 : 0, bombers: 0, ground: false, boss: false, rival: false, depot: false, hostileAce: true,  mission: 'sweep', weather: 'clear', tod: 0 };
  if (type === 'INTERCEPT') return { fighters: 3, aces: 0, bombers: wave >= 8 ? 4 : 3, ground: false, boss: false, rival: false, depot: false, hostileAce: true,  mission: 'intercept', weather: 'fog', tod: 1 };
  if (type === 'STRIKE')    return { fighters: 3, aces: 0, bombers: 0, ground: true, boss: false, rival: false, depot: false, hostileAce: true,  mission: 'strike', weather: 'storm', tod: 0 };
  if (type === 'ESCORT')    return { fighters: 3, aces: wave >= 8 ? 1 : 0, bombers: 0, ground: false, boss: false, rival: false, depot: false, hostileAce: true,  mission: 'escort', weather: 'clear', tod: 0 };
  if (type === 'DEFEND')    return { fighters: 3, aces: 0, bombers: wave >= 8 ? 2 : 1, ground: false, boss: false, rival: false, depot: false, hostileAce: true,  mission: 'defend', weather: 'storm', tod: 1 };
  if (type === 'ELITE')     return { fighters: 2, aces: 2, bombers: 0, ground: false, boss: false, rival: true, depot: false, hostileAce: true,  mission: 'none', weather: 'fog', tod: 2 };
  if (type === 'DEPOT')     return { fighters: 0, aces: 0, bombers: 0, ground: false, boss: false, rival: false, depot: true, hostileAce: false, mission: 'none', weather: 'clear', tod: 1 };
  return { fighters: 4, aces: 2, bombers: 0, ground: false, boss: true, rival: false, depot: false, hostileAce: false, mission: 'boss', weather: 'storm', tod: 2 };   // FINAL
}

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
