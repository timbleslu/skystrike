'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ---- in-memory storage seam so the mirrored persistence fns run under Node ----
let _kv = {};
const store = { get(k) { return k in _kv ? _kv[k] : null; }, set(k, v) { _kv[k] = String(v); } };

// ============================================================================
//  Mirrors of js/meta.js (byte-identity guard at the bottom enforces they match)
// ============================================================================
const META_KEY = 'skystrike_meta';
const META_VERSION = 1;
let meta = null;

const STARTER_JETS = ['FT-1', 'F-22', 'SU-57'];

function spAward(run, player) {
  if (!run) return 0;
  const score = (player && player.score) || 0;
  const sp =
    (run.kills || 0) * 2 +
    (run.ground || 0) * 1 +
    (run.boss || 0) * 25 +
    (run.escortKills || 0) * 1 +
    (run.waveReached || 0) * 3 +
    (run.rivalLevel || 0) * 10 +
    Math.floor(score / 500);
  return Math.max(0, Math.floor(sp));
}

const META_PERKS = [
  { id: 'hull',    x: 0, y: 0, base: 40, max: 5,
    apply: function (p, lvl) { if (lvl > 0) { p.maxHp = Math.round(p.maxHp * (1 + 0.06 * lvl)); p.hp = p.maxHp; } } },
  { id: 'plating', x: 0, y: 1, base: 50, max: 5, req: 'hull',
    apply: function (p, lvl) { if (lvl > 0) { p.maxShield = Math.round(p.maxShield * (1 + 0.08 * lvl)); p.shield = p.maxShield; } } },
  { id: 'guns',    x: 1, y: 0, base: 45, max: 5,
    apply: function (p, lvl) { if (lvl > 0) p.gunDmgMul *= (1 + 0.04 * lvl); } },
  { id: 'warheads',x: 1, y: 1, base: 55, max: 5, req: 'guns',
    apply: function (p, lvl) { if (lvl > 0) p.missileDmgMul *= (1 + 0.05 * lvl); } },
  { id: 'magazine',x: 2, y: 0, base: 40, max: 3,
    apply: function (p, lvl) { if (lvl > 0) { var add = 4 * lvl; p.missiles += add; p.maxMissiles += add; p.flares += lvl; p.maxFlares += lvl; } } },
  { id: 'research',x: 2, y: 1, base: 60, max: 3, req: 'magazine',
    apply: function (p, lvl) { if (lvl > 0) p.rpMul *= (1 + 0.10 * lvl); } },
  { id: 'bounty',  x: 3, y: 0, base: 70, max: 1,
    apply: function (p, lvl) { if (lvl > 0) p.scoreMul *= 1.15; } },
];
const META_BY_ID = {};
for (var _i = 0; _i < META_PERKS.length; _i++) META_BY_ID[META_PERKS[_i].id] = META_PERKS[_i];

function perkCost(perkId, level) {
  const def = META_BY_ID[perkId];
  if (!def) return Infinity;
  return Math.round(def.base * Math.pow(1.6, level));
}

function applyMetaPerks(player) {
  if (!player || !meta || !meta.perks) return;
  for (var k = 0; k < META_PERKS.length; k++) {
    var def = META_PERKS[k];
    var lvl = meta.perks[def.id] || 0;
    if (lvl > 0) def.apply(player, lvl);
  }
}

const SKINS = {
  'FT-1':  [{ id: 'default', color: null }, { id: 'sand', color: 0xc8b88a, accent: 0xe0c060 }, { id: 'arctic', color: 0xdfe8ef, accent: 0x8fd0ff }],
  'F-22':  [{ id: 'default', color: null }, { id: 'splinter', color: 0x4a5a6a, accent: 0x9fe0ff }, { id: 'raptor', color: 0x1a2a3a, accent: 0xff3a3a }],
  'SU-57': [{ id: 'default', color: null }, { id: 'felon', color: 0x3a3a44, accent: 0xff6a2a }, { id: 'aurora', color: 0x2a3a5a, accent: 0x60ffd0 }],
};

const ACHIEVEMENTS = [
  { id: 'firstBlood', test: function (run, player) { return (run.kills || 0) + (run.ground || 0) + (run.boss || 0) >= 1; }, sp: 5 },
  { id: 'acePilot',   test: function (run, player) { return (run.kills || 0) >= 25; }, sp: 25 },
  { id: 'bossSlayer', test: function (run, player) { return (run.boss || 0) >= 1; }, sp: 30 },
  { id: 'survivor',   test: function (run, player) { return (run.waveReached || 0) >= 10; }, sp: 40 },
  { id: 'highScore',  test: function (run, player) { return ((player && player.score) || 0) >= 50000; }, sp: 50 },
  { id: 'groundPounder', test: function (run, player) { return (run.ground || 0) >= 20; }, sp: 25 },
];

function freshMeta() {
  const jets = {};
  for (var i = 0; i < STARTER_JETS.length; i++) jets[STARTER_JETS[i]] = true;
  return { v: META_VERSION, sp: 0, jets: jets, skins: {}, perks: {}, ach: {} };
}
function validMeta(m) {
  return !!(m && typeof m === 'object' && typeof m.v === 'number' && typeof m.sp === 'number' && m.sp >= 0 &&
    m.jets && typeof m.jets === 'object' && m.skins && typeof m.skins === 'object' &&
    m.perks && typeof m.perks === 'object' && m.ach && typeof m.ach === 'object');
}
function loadMeta() {
  try {
    const m = JSON.parse(store.get(META_KEY) || 'null');
    meta = validMeta(m) ? m : freshMeta();
  } catch (e) { meta = freshMeta(); }
  for (var i = 0; i < STARTER_JETS.length; i++) if (!meta.jets[STARTER_JETS[i]]) meta.jets[STARTER_JETS[i]] = true;
}
function saveMeta() { try { store.set(META_KEY, JSON.stringify(meta)); } catch (e) {} }

function perkLevel(id) { return (meta && meta.perks[id]) || 0; }
function perkMaxed(id) { const d = META_BY_ID[id]; return !!d && perkLevel(id) >= d.max; }
function perkUnlocked(id) {
  const d = META_BY_ID[id];
  return !!d && (!d.req || perkLevel(d.req) > 0);
}
function buyPerk(id) {
  const d = META_BY_ID[id];
  if (!d || !meta) return false;
  if (perkMaxed(id) || !perkUnlocked(id)) return false;
  const cost = perkCost(id, perkLevel(id));
  if (meta.sp < cost) return false;
  meta.sp -= cost;
  meta.perks[id] = perkLevel(id) + 1;
  saveMeta();
  return true;
}

const JET_LOCK_COST = 250;
function jetUnlocked(key) { return !!(meta && meta.jets[key]); }
function jetCost(key) { return JET_LOCK_COST; }
function buyJet(key) {
  if (!meta || jetUnlocked(key)) return false;
  const cost = jetCost(key);
  if (meta.sp < cost) return false;
  meta.sp -= cost;
  meta.jets[key] = true;
  saveMeta();
  return true;
}

const SKIN_COST = 120;
function skinOwned(key, id) {
  if (id === 'default') return true;
  return !!(meta && meta.skins[key] && meta.skins[key].indexOf(id) !== -1);
}
function skinCost(key, id) { return SKIN_COST; }
function buySkin(key, id) {
  if (!meta || id === 'default' || skinOwned(key, id)) return false;
  const cost = skinCost(key, id);
  if (meta.sp < cost) return false;
  meta.sp -= cost;
  if (!meta.skins[key]) meta.skins[key] = [];
  meta.skins[key].push(id);
  saveMeta();
  return true;
}

function achEarned(id) { return !!(meta && meta.ach[id]); }
function grantAch(id) {
  const def = ACHIEVEMENTS.find(function (a) { return a.id === id; });
  if (!def || !meta || achEarned(id)) return 0;
  meta.ach[id] = true;
  if (def.sp > 0) meta.sp += def.sp;
  saveMeta();
  return def.sp || 0;
}
function checkAchievements(run, player) {
  var paid = 0; var unlocked = [];
  for (var i = 0; i < ACHIEVEMENTS.length; i++) {
    var a = ACHIEVEMENTS[i];
    if (!achEarned(a.id) && a.test(run, player)) { paid += grantAch(a.id); unlocked.push(a.id); }
  }
  return { sp: paid, unlocked: unlocked };
}

// ============================================================================
//  spAward — monotonic, zero-run, rival bonus
// ============================================================================
const zeroRun = { kills: 0, ground: 0, boss: 0, escortKills: 0, waveReached: 0, rivalLevel: 0 };
assert.strictEqual(spAward(zeroRun, { score: 0 }), 0, 'do-nothing run pays 0 SP');
assert.strictEqual(spAward(null, null), 0, 'null run -> 0');
// monotonic in kills
assert.ok(spAward({ kills: 10 }, { score: 0 }) > spAward({ kills: 5 }, { score: 0 }), 'more kills -> more SP');
// monotonic in wave reached
assert.ok(spAward({ waveReached: 10 }, { score: 0 }) > spAward({ waveReached: 4 }, { score: 0 }), 'more waves -> more SP');
// boss is worth a lot
assert.ok(spAward({ boss: 1 }, { score: 0 }) >= 25, 'a boss kill is worth >= 25 SP');
assert.ok(spAward({ boss: 2 }, { score: 0 }) > spAward({ boss: 1 }, { score: 0 }), 'more bosses -> more SP');
// rival level bonus applies and is monotonic
assert.ok(spAward({ rivalLevel: 3 }, { score: 0 }) > spAward({ rivalLevel: 1 }, { score: 0 }), 'higher rival level -> more SP');
assert.strictEqual(spAward({ rivalLevel: 2 }, { score: 0 }), 20, 'rival level 2 = 20 SP');
// score contributes (floored per 500)
assert.strictEqual(spAward({}, { score: 1200 }), 2, 'score 1200 -> floor(1200/500) = 2 SP');
// escortKills + ground contribute
assert.ok(spAward({ escortKills: 5, ground: 5 }, { score: 0 }) === 10, 'escort + ground contribute 1 each');
console.log('ok - spAward: monotonic in kills/wave/boss/rival, zero-run = 0, score+escort+ground counted');

// ============================================================================
//  applyMetaPerks — each level mutates the mock player; level 0 = no-op; stacks
// ============================================================================
function mockPlayer() {
  return { maxHp: 100, hp: 100, maxShield: 50, shield: 50, gunDmgMul: 1, missileDmgMul: 1,
    missiles: 16, maxMissiles: 40, flares: 10, maxFlares: 10, rpMul: 1, scoreMul: 1 };
}
// level 0 (no perks owned) is a no-op
meta = freshMeta();
let p0 = mockPlayer();
applyMetaPerks(p0);
assert.deepStrictEqual(p0, mockPlayer(), 'no owned perks -> player unchanged');
// hull perk raises maxHp by 6% per level
meta = freshMeta(); meta.perks.hull = 2;
let pHull = mockPlayer(); applyMetaPerks(pHull);
assert.strictEqual(pHull.maxHp, Math.round(100 * (1 + 0.12)), 'hull lvl2 -> +12% maxHp');
assert.strictEqual(pHull.hp, pHull.maxHp, 'hull also tops up current hp');
// guns perk raises gunDmgMul by 4% per level
meta = freshMeta(); meta.perks.guns = 3;
let pGun = mockPlayer(); applyMetaPerks(pGun);
assert.ok(Math.abs(pGun.gunDmgMul - (1 * (1 + 0.12))) < 1e-9, 'guns lvl3 -> +12% gunDmgMul');
// magazine adds missiles+flares
meta = freshMeta(); meta.perks.magazine = 2;
let pMag = mockPlayer(); applyMetaPerks(pMag);
assert.strictEqual(pMag.missiles, 16 + 8, 'magazine lvl2 -> +8 missiles');
assert.strictEqual(pMag.maxMissiles, 40 + 8, 'magazine lvl2 -> +8 max missiles');
assert.strictEqual(pMag.flares, 10 + 2, 'magazine lvl2 -> +2 flares');
// perks STACK
meta = freshMeta(); meta.perks.hull = 1; meta.perks.guns = 1; meta.perks.bounty = 1;
let pStack = mockPlayer(); applyMetaPerks(pStack);
assert.strictEqual(pStack.maxHp, Math.round(100 * 1.06), 'stacked hull applies');
assert.ok(Math.abs(pStack.gunDmgMul - 1.04) < 1e-9, 'stacked guns applies');
assert.ok(Math.abs(pStack.scoreMul - 1.15) < 1e-9, 'stacked bounty applies');
console.log('ok - applyMetaPerks: per-level mutation, level-0 no-op, perks stack');

// ============================================================================
//  perkCost + buyPerk gating
// ============================================================================
assert.ok(perkCost('hull', 1) > perkCost('hull', 0), 'perkCost increases with level');
assert.strictEqual(perkCost('hull', 0), 40, 'hull first level base cost');
assert.strictEqual(perkCost('nope', 0), Infinity, 'unknown perk -> Infinity cost');
// buyPerk rejects when broke
meta = freshMeta(); meta.sp = 10;
assert.strictEqual(buyPerk('hull'), false, 'cannot buy when sp < cost');
assert.strictEqual(perkLevel('hull'), 0, 'rejected buy leaves level 0');
assert.strictEqual(meta.sp, 10, 'rejected buy does not deduct');
// buyPerk succeeds + deducts
meta = freshMeta(); meta.sp = 100;
assert.strictEqual(buyPerk('hull'), true, 'buy succeeds with enough sp');
assert.strictEqual(perkLevel('hull'), 1, 'level incremented');
assert.strictEqual(meta.sp, 100 - 40, 'cost deducted');
// req gate: plating needs hull first
meta = freshMeta(); meta.sp = 1000;
assert.strictEqual(perkUnlocked('plating'), false, 'plating locked without hull');
assert.strictEqual(buyPerk('plating'), false, 'cannot buy a req-locked perk');
buyPerk('hull');
assert.strictEqual(perkUnlocked('plating'), true, 'plating unlocks after hull');
assert.strictEqual(buyPerk('plating'), true, 'now buyable');
// maxLevel cap
meta = freshMeta(); meta.sp = 100000;
for (var b = 0; b < 10; b++) buyPerk('bounty');
assert.strictEqual(perkLevel('bounty'), 1, 'bounty caps at maxLevel 1');
assert.strictEqual(perkMaxed('bounty'), true, 'bounty is maxed');
console.log('ok - perkCost rises with level; buyPerk respects funds, req gate, max level');

// ============================================================================
//  jet unlock gating
// ============================================================================
meta = freshMeta();
assert.strictEqual(jetUnlocked('FT-1'), true, 'starter jet unlocked');
assert.strictEqual(jetUnlocked('F-22'), true, 'starter jet unlocked');
assert.strictEqual(jetUnlocked('J-20'), false, 'non-starter jet locked');
meta.sp = 100;
assert.strictEqual(buyJet('J-20'), false, 'cannot buy locked jet when broke');
assert.strictEqual(jetUnlocked('J-20'), false, 'still locked');
meta.sp = 300;
assert.strictEqual(buyJet('J-20'), true, 'buy jet with enough sp');
assert.strictEqual(jetUnlocked('J-20'), true, 'now unlocked');
assert.strictEqual(meta.sp, 300 - 250, 'jet cost deducted');
assert.strictEqual(buyJet('J-20'), false, 'cannot re-buy an owned jet');
console.log('ok - jetUnlocked/buyJet: starter free, locked gated by SP, no double-buy');

// ============================================================================
//  skins
// ============================================================================
meta = freshMeta();
assert.strictEqual(skinOwned('F-22', 'default'), true, 'default skin always owned');
assert.strictEqual(skinOwned('F-22', 'raptor'), false, 'paid skin not owned yet');
meta.sp = 50;
assert.strictEqual(buySkin('F-22', 'raptor'), false, 'cannot buy skin when broke');
meta.sp = 200;
assert.strictEqual(buySkin('F-22', 'raptor'), true, 'buy skin with enough sp');
assert.strictEqual(skinOwned('F-22', 'raptor'), true, 'skin now owned');
assert.strictEqual(meta.sp, 200 - 120, 'skin cost deducted');
assert.strictEqual(buySkin('F-22', 'raptor'), false, 'cannot re-buy owned skin');
assert.strictEqual(buySkin('F-22', 'default'), false, 'default is not purchasable');
console.log('ok - skinOwned/buySkin: default free, paid skins gated by SP, no double-buy');

// ============================================================================
//  achievements: predicates fire on right stats, SP paid once
// ============================================================================
meta = freshMeta();
assert.strictEqual(grantAch('bossSlayer'), 30, 'grant pays the reward once');
assert.strictEqual(achEarned('bossSlayer'), true, 'achievement now earned');
assert.strictEqual(grantAch('bossSlayer'), 0, 're-grant pays nothing');
assert.strictEqual(meta.sp, 30, 'SP only banked once');
// checkAchievements evaluates predicates over run stats
meta = freshMeta();
let res = checkAchievements({ kills: 30, ground: 0, boss: 1, waveReached: 12 }, { score: 0 });
assert.ok(res.unlocked.indexOf('firstBlood') !== -1, 'firstBlood fires (>=1 kill)');
assert.ok(res.unlocked.indexOf('acePilot') !== -1, 'acePilot fires (>=25 kills)');
assert.ok(res.unlocked.indexOf('bossSlayer') !== -1, 'bossSlayer fires (boss>=1)');
assert.ok(res.unlocked.indexOf('survivor') !== -1, 'survivor fires (wave>=10)');
assert.ok(res.unlocked.indexOf('highScore') === -1, 'highScore does not fire under threshold');
assert.strictEqual(res.sp, 5 + 25 + 30 + 40, 'paid sum of newly-unlocked rewards');
// running again with the same stats pays nothing (already earned)
let res2 = checkAchievements({ kills: 30, ground: 0, boss: 1, waveReached: 12 }, { score: 0 });
assert.strictEqual(res2.sp, 0, 'no double-pay on a second run');
assert.strictEqual(res2.unlocked.length, 0, 'nothing newly unlocked');
console.log('ok - achievements: predicates fire on right stats; one-time SP reward');

// ============================================================================
//  validMeta + persistence round-trip
// ============================================================================
assert.ok(validMeta(freshMeta()), 'fresh meta validates');
assert.ok(validMeta(JSON.parse(JSON.stringify(freshMeta()))), 'round-trips through JSON');
assert.ok(!validMeta(null), 'null rejected');
assert.ok(!validMeta({}), 'empty object rejected');
assert.ok(!validMeta({ sp: -5, jets: {}, skins: {}, perks: {}, ach: {} }), 'negative sp rejected');
assert.ok(!validMeta({ sp: 0, jets: {}, skins: {}, perks: {} }), 'missing ach rejected');
// load falls back to fresh on garbage
_kv = {}; _kv[META_KEY] = '{ not json';
loadMeta();
assert.ok(validMeta(meta), 'garbage save -> fresh meta');
assert.strictEqual(meta.sp, 0, 'fresh meta starts at 0 SP');
// save then load round-trips state
meta = freshMeta(); meta.sp = 777; meta.perks.hull = 3; meta.jets['J-20'] = true; saveMeta();
meta = null; loadMeta();
assert.strictEqual(meta.sp, 777, 'SP persisted across load');
assert.strictEqual(meta.perks.hull, 3, 'perk level persisted');
assert.strictEqual(meta.jets['J-20'], true, 'unlocked jet persisted');
// starter jets always re-added even if a save omits one
_kv = {}; _kv[META_KEY] = JSON.stringify({ v: 1, sp: 0, jets: {}, skins: {}, perks: {}, ach: {} });
loadMeta();
assert.strictEqual(meta.jets['FT-1'], true, 'starter jets re-seeded on load');
console.log('ok - validMeta rejects malformed blobs; persistence round-trips; starters re-seeded');

// ============================================================================
//  byte-identity guard: mirrored fns must match js/meta.js verbatim (whitespace-insensitive)
// ============================================================================
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'meta.js'), 'utf8');
function bodyOf(fnName, text) {
  const start = text.indexOf('function ' + fnName + '(');
  assert.ok(start !== -1, 'js/meta.js defines function ' + fnName);
  let i = text.indexOf('{', start), depth = 0, end = -1;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return text.slice(start, end);
}
function norm(s) { return s.replace(/\r\n/g, '\n').trim(); }
const strip = (x) => x.replace(/\s+/g, ' ');
for (const fn of ['spAward', 'perkCost', 'applyMetaPerks', 'validMeta', 'freshMeta', 'buyPerk',
                  'buyJet', 'buySkin', 'grantAch', 'checkAchievements', 'jetUnlocked', 'skinOwned']) {
  const mine = norm(eval('(' + fn + ').toString()').replace(/^[^(]*\(/, 'function ' + fn + '('));
  const theirs = norm(bodyOf(fn, src));
  assert.strictEqual(strip(theirs), strip(mine), fn + ' in meta.js must match the mirror (ignoring whitespace)');
}
// data tables must be present in source
assert.ok(/const META_PERKS\s*=/.test(src), 'meta.js defines META_PERKS');
assert.ok(/const ACHIEVEMENTS\s*=/.test(src), 'meta.js defines ACHIEVEMENTS');
assert.ok(/const SKINS\s*=/.test(src), 'meta.js defines SKINS');
assert.ok(/const STARTER_JETS\s*=/.test(src), 'meta.js defines STARTER_JETS');
console.log('ok - meta.js mirrors (spAward/applyMetaPerks/perkCost/persistence/buy fns) match source');
