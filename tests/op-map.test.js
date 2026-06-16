'use strict';
const assert = require('assert');
const { OPERATIONS, levelPlan, sectorMission, sectorPlan, setpieceFor, setpiecePlan, setpieceOutcome } = require('../js/opmap.js');

// ---- sectorPlan: legacy procedural plans still resolve (Endless mode + fallbacks) ----
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

// ---- set-pieces: data table + pure fold + outcome still hold ----
// setpieceFor is RETIRED (stage-coord keying removed; set-pieces are opt-in per level row) → always null.
assert.strictEqual(setpieceFor('STRIKE', 1), null, 'setpieceFor retired → null');
assert.strictEqual(setpieceFor('ESCORT', 4), null, 'setpieceFor retired → null');
assert.strictEqual(setpieceFor('FURBALL', 0), null, 'setpieceFor retired → null');
// fold an authored encounter onto a base plan: NEW object, base untouched, tags `setpiece`.
const base = sectorPlan('STRIKE', 3);
const folded = setpiecePlan('samCorridor', base);
assert.notStrictEqual(folded, base, 'setpiecePlan returns a NEW object');
assert.strictEqual(folded.setpiece, 'samCorridor', 'folded plan tags the set-piece id');
assert.strictEqual(folded.mission, 'strike', 'samCorridor folds the strike mission');
assert.strictEqual(folded.ground, true, 'samCorridor folds the ground threat');
assert.strictEqual(base.setpiece, undefined, 'base plan is left untouched');
// outcome maps win → outro key, fail → shared objective-failed line.
assert.strictEqual(setpieceOutcome('samCorridor', true), 'setpiece.samCorridor.outro', 'win → outro key');
assert.strictEqual(setpieceOutcome('samCorridor', false), 'banner.missionFailedObj', 'fail → objective-failed line');

// ---- OPERATIONS table validation (Operations Map revamp) ----
assert.ok(Array.isArray(OPERATIONS), 'OPERATIONS is an array');
assert.strictEqual(OPERATIONS.length, 3, 'three operations');
assert.deepStrictEqual(OPERATIONS.map(function (o) { return o.id; }), ['ironVeil', 'midnightMeridian', 'sunfireHorizon'], 'op ids in order');
assert.deepStrictEqual(OPERATIONS.map(function (o) { return o.levels.length; }), [8, 8, 9], 'level counts 8/8/9');

// set of types that sectorMission accepts as a valid (non-boss) typed-mission input
const MISSION_TYPES = ['RECON', 'FURBALL', 'STEALTH', 'INTERCEPT', 'DEFEND', 'ESCORT', 'STRIKE'];

OPERATIONS.forEach(function (op) {
  // op header carries string i18n keys
  assert.strictEqual(typeof op.nameKey, 'string', op.id + ' has a nameKey');
  assert.strictEqual(typeof op.loreKey, 'string', op.id + ' has a loreKey');
  assert.ok(op.levels.length > 0, op.id + ' has levels');

  op.levels.forEach(function (lvl, i) {
    const where = op.id + '.' + lvl.id;
    // every level carries the i18n key quad as strings
    assert.strictEqual(typeof lvl.nameKey, 'string', where + ' nameKey is a string');
    assert.strictEqual(typeof lvl.loreKey, 'string', where + ' loreKey is a string');
    assert.strictEqual(typeof lvl.objectivesKey, 'string', where + ' objectivesKey is a string');
    assert.strictEqual(typeof lvl.enemyIntelKey, 'string', where + ' enemyIntelKey is a string');
    // spawn object with numeric core counts
    assert.ok(lvl.spawn && typeof lvl.spawn === 'object', where + ' has a spawn object');
    assert.strictEqual(typeof lvl.spawn.fighters, 'number', where + ' spawn.fighters is numeric');
    assert.strictEqual(typeof lvl.spawn.aces, 'number', where + ' spawn.aces is numeric');
    assert.strictEqual(typeof lvl.spawn.bombers, 'number', where + ' spawn.bombers is numeric');

    const isLast = (i === op.levels.length - 1);
    if (isLast) {
      // last level of every op is the boss
      assert.strictEqual(lvl.type, 'FINAL', where + ' (last) is a FINAL boss');
      assert.strictEqual(lvl.isBoss, true, where + ' (last) isBoss');
      assert.ok(lvl.boss && Array.isArray(lvl.boss.phases), where + ' has boss.phases');
      assert.strictEqual(lvl.boss.phases.length, 3, where + ' has exactly 3 boss phases');
    } else {
      // every non-boss level's type is a valid sectorMission input (resolves to a non-boss mission)
      assert.ok(MISSION_TYPES.indexOf(lvl.type) !== -1, where + ' type is a valid sectorMission input (' + lvl.type + ')');
      assert.notStrictEqual(sectorMission(lvl.type), 'boss', where + ' non-boss type does not resolve to boss');
      assert.ok(!lvl.isBoss, where + ' non-last level is not a boss');
    }

    // RECON & STEALTH levels are single-wave (bounded; recon/stealth: 1)
    if (lvl.type === 'RECON' || lvl.type === 'STEALTH') {
      assert.strictEqual(lvl.waves, 1, where + ' (' + lvl.type + ') has waves === 1');
    }
  });
});

// ---- levelPlan: authored-absolute plan built from the level row ----
const recon = OPERATIONS[0].levels[0]; // ironVeil firstLight
const rPlan = levelPlan(recon);
assert.notStrictEqual(rPlan, recon.spawn, 'levelPlan returns a NEW object (not the spawn row)');
assert.strictEqual(rPlan.fighters, 2, 'firstLight plan carries authored fighters');
assert.strictEqual(rPlan.mission, 'recon', 'firstLight plan mission = recon');
assert.strictEqual(rPlan.boss, false, 'firstLight plan is not a boss');
assert.strictEqual(rPlan.weather, 'clear', 'firstLight plan carries authored weather');
assert.strictEqual(rPlan.tod, 0, 'firstLight plan carries authored tod');
const bossLvl = OPERATIONS[0].levels[7]; // ironVeil warlord
const bPlan = levelPlan(bossLvl);
assert.strictEqual(bPlan.boss, true, 'warlord plan flags boss:true (type FINAL)');
assert.strictEqual(bPlan.mission, 'boss', 'warlord plan mission = boss');
// setpiece fold path on levelPlan
const spLvl = { id: 'tmp', type: 'STRIKE', setpiece: 'samCorridor', spawn: { fighters: 3, aces: 0, bombers: 0, ground: false, weather: 'storm', tod: 0, hostileAce: true } };
const spPlan = levelPlan(spLvl);
assert.strictEqual(spPlan.setpiece, 'samCorridor', 'levelPlan folds an opt-in set-piece');
assert.strictEqual(spPlan.ground, true, 'set-piece fold overrides ground threat');

console.log('ok - operation map: OPERATIONS table, levelPlan, sector plans, set-pieces');
