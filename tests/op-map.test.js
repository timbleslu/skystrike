'use strict';
const assert = require('assert');
const { OPERATIONS, levelPlan, levelBlurbKey, sectorMission, sectorPlan, setpieceFor, setpiecePlan, setpieceOutcome } = require('../js/opmap.js');
const { LEVEL_WAVE_CAP } = require('../js/core.js');
const fs = require('fs');
const path = require('path');

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
assert.strictEqual(OPERATIONS.length, 4, 'four operations (op4 POLAR VORTEX added)');
assert.deepStrictEqual(OPERATIONS.map(function (o) { return o.id; }), ['ironVeil', 'midnightMeridian', 'sunfireHorizon', 'polarVortex'], 'op ids in order');
assert.deepStrictEqual(OPERATIONS.map(function (o) { return o.levels.length; }), [8, 8, 9, 8], 'level counts 8/8/9/8');

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

// ---- table-shape invariants covering ALL ops incl. op4 (F6 add) ----
// valid starCondMet descriptor types (js/meta.js starCondMet switch) — starUnique/stars must use only these
const VALID_STAR_TYPES = ['kills', 'clean', 'objective', 'noDamage', 'accuracy', 'flawless', 'gunOnly', 'noFlares', 'fastClear', 'killsN'];
const KNOWN_BOSS_PATTERNS = ['standoff', 'headOn', 'dive', 'mirror'];   // authored boss-phase pattern vocabulary (undefined = default)
const KNOWN_BOSS_FLAGS = ['chaff', 'mirror'];

// (a) every level id is unique across ALL operations (meta keys on ${opId}.${id}; ids must not collide)
const allLevelIds = [];
OPERATIONS.forEach(function (op) { op.levels.forEach(function (lvl) { allLevelIds.push(lvl.id); }); });
assert.strictEqual(new Set(allLevelIds).size, allLevelIds.length, 'every level id is unique across all operations');

OPERATIONS.forEach(function (op) {
  op.levels.forEach(function (lvl, i) {
    const where = op.id + '.' + lvl.id;
    // (b) waves is an integer within 1..LEVEL_WAVE_CAP
    assert.ok(Number.isInteger(lvl.waves) && lvl.waves >= 1 && lvl.waves <= LEVEL_WAVE_CAP,
      where + ' waves is an int in 1..' + LEVEL_WAVE_CAP + ' (got ' + lvl.waves + ')');
    // (c) starUnique present on every row + its type is a valid starCondMet type (repo v1.3 pattern)
    assert.ok(lvl.starUnique && typeof lvl.starUnique === 'object', where + ' has a starUnique descriptor');
    assert.ok(VALID_STAR_TYPES.indexOf(lvl.starUnique.type) !== -1,
      where + ' starUnique.type is a valid starCondMet type (' + lvl.starUnique.type + ')');
    // any optional stars[] override entries must ALSO be valid starCondMet types
    if (Array.isArray(lvl.stars)) lvl.stars.forEach(function (c) {
      assert.ok(c && VALID_STAR_TYPES.indexOf(c.type) !== -1, where + ' stars[] type is a valid starCondMet type (' + (c && c.type) + ')');
    });
    // (d) the boss node is the LAST level with a 3-phase signature; each phase carries the _phaseCfg shape
    const isLast = (i === op.levels.length - 1);
    if (isLast) {
      assert.strictEqual(lvl.type, 'FINAL', where + ' (last) is FINAL');
      assert.ok(lvl.boss && Array.isArray(lvl.boss.phases) && lvl.boss.phases.length === 3, where + ' boss has 3 phases');
      assert.strictEqual(typeof lvl.boss.callsignKey, 'string', where + ' boss has a callsignKey');
      assert.strictEqual(typeof lvl.boss.introKey, 'string', where + ' boss has an introKey');
      lvl.boss.phases.forEach(function (ph, pi) {
        const pw = where + ' phase ' + (pi + 1);
        assert.strictEqual(typeof ph.descKey, 'string', pw + ' has a descKey');
        assert.strictEqual(typeof ph.turnMul, 'number', pw + ' turnMul numeric');
        assert.strictEqual(typeof ph.fireMul, 'number', pw + ' fireMul numeric');
        assert.strictEqual(typeof ph.extraMissiles, 'number', pw + ' extraMissiles numeric');
        if (ph.pattern != null) assert.ok(KNOWN_BOSS_PATTERNS.indexOf(ph.pattern) !== -1, pw + ' pattern is known (' + ph.pattern + ')');
        if (ph.flags != null) { assert.ok(Array.isArray(ph.flags), pw + ' flags is an array'); ph.flags.forEach(function (f) { assert.ok(KNOWN_BOSS_FLAGS.indexOf(f) !== -1, pw + ' flag is known (' + f + ')'); }); }
      });
    }
  });
});

// ---- op4 (polarVortex) i18n parity: every *Key referenced by op4 rows resolves in EN+ZH+KO ----
// i18n.js is NOT require-safe (no module.exports; references LANG at load). Scrape it (readFileSync +
// key regex — the tests/storage.test.js precedent): a section state-machine walks the main dict
// (`EN:{`/`ZH:{`/`KO:{`) + every tail `Object.assign(I18N.<lang>,{...})` block, collecting each
// language's property keys, then asserts every op4 key is present in all three languages.
const i18nSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8');
const langKeys = { EN: new Set(), ZH: new Set(), KO: new Set() };
let curLang = null;
i18nSrc.split('\n').forEach(function (line) {
  const sec = line.match(/^\s*(EN|ZH|KO)\s*:\s*\{/) || line.match(/Object\.assign\(\s*I18N\.(EN|ZH|KO)/);
  if (sec) { curLang = sec[1]; return; }
  if (!curLang) return;
  const kv = line.match(/^\s*(['"])([A-Za-z0-9_.\-]+)\1\s*:/);
  if (kv) langKeys[curLang].add(kv[2]);
});
assert.ok(langKeys.EN.size > 100 && langKeys.ZH.size > 100 && langKeys.KO.size > 100, 'i18n scrape found all three language dicts');

const op4 = OPERATIONS.find(function (o) { return o.id === 'polarVortex'; });
assert.ok(op4, 'op4 polarVortex exists');
const op4Keys = new Set();
[op4.nameKey, op4.theaterKey, op4.loreKey].forEach(function (k) { if (k) op4Keys.add(k); });
op4.levels.forEach(function (lvl) {
  [lvl.nameKey, lvl.loreKey, lvl.objectivesKey, lvl.enemyIntelKey].forEach(function (k) { if (k) op4Keys.add(k); });
  const bk = levelBlurbKey(lvl); if (bk) op4Keys.add(bk);   // in-flight/briefing blurb key (derived)
  if (lvl.boss) {
    if (lvl.boss.callsignKey) op4Keys.add(lvl.boss.callsignKey);
    if (lvl.boss.introKey) op4Keys.add(lvl.boss.introKey);
    (lvl.boss.phases || []).forEach(function (ph) { if (ph.descKey) op4Keys.add(ph.descKey); });
  }
});
assert.ok(op4Keys.size >= 48, 'op4 references the full key quad + blurb + boss keys (got ' + op4Keys.size + ')');
op4Keys.forEach(function (k) {
  ['EN', 'ZH', 'KO'].forEach(function (L) {
    assert.ok(langKeys[L].has(k), 'op4 key resolves in ' + L + ': ' + k);
  });
});

console.log('ok - operation map: OPERATIONS table, levelPlan, sector plans, set-pieces');
console.log('ok - op4 POLAR VORTEX: table-shape invariants + EN/ZH/KO i18n parity (' + op4Keys.size + ' keys)');
