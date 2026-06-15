'use strict';
// ---- Node seams: stateful storage + dev toggle the browser supplies via globals.js ----
let _kv = {};
global.store = { get(k) { return k in _kv ? _kv[k] : null; }, set(k, v) { _kv[k] = String(v); } };
global.devUnlockAll = false;   // js/globals.js dev toggle (default off — preserves existing assertions)

const assert = require('assert');
const {
  spAward, perkCost, applyMetaPerks, sanitizeCallsign, emblemUnlocked,
  freshMeta, validMeta, loadMeta, saveMeta,
  perkLevel, perkMaxed, perkUnlocked, buyPerk,
  jetUnlocked, jetCost, buyJet, skinOwned, skinCost, buySkin,
  achEarned, grantAch, checkAchievements,
  META_KEY, META_VERSION,
} = require('../js/meta.js');
// boss-rush trio moved to core.js
const { bossRushNext, bossRushDone, betterTime } = require('../js/core.js');

const BOSS_RUSH_TOTAL = 5;   // gauntlet length (BOSS_RUSH_POOL in core.js)

// loadMeta()/saveMeta()/buy*/grant* mutate meta.js's internal `meta`, which is not exported.
// Drive it via the store seam: setMeta() seeds + loads, getMeta() snapshots the live state.
function setMeta(obj) { _kv[META_KEY] = JSON.stringify(obj); loadMeta(); }
function getMeta() { saveMeta(); return JSON.parse(_kv[META_KEY]); }

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
setMeta(freshMeta());
let p0 = mockPlayer();
applyMetaPerks(p0);
assert.deepStrictEqual(p0, mockPlayer(), 'no owned perks -> player unchanged');
// hull perk raises maxHp by 6% per level
setMeta(Object.assign(freshMeta(), { perks: { hull: 2 } }));
let pHull = mockPlayer(); applyMetaPerks(pHull);
assert.strictEqual(pHull.maxHp, Math.round(100 * (1 + 0.12)), 'hull lvl2 -> +12% maxHp');
assert.strictEqual(pHull.hp, pHull.maxHp, 'hull also tops up current hp');
// guns perk raises gunDmgMul by 4% per level
setMeta(Object.assign(freshMeta(), { perks: { guns: 3 } }));
let pGun = mockPlayer(); applyMetaPerks(pGun);
assert.ok(Math.abs(pGun.gunDmgMul - (1 * (1 + 0.12))) < 1e-9, 'guns lvl3 -> +12% gunDmgMul');
// magazine adds missiles+flares
setMeta(Object.assign(freshMeta(), { perks: { magazine: 2 } }));
let pMag = mockPlayer(); applyMetaPerks(pMag);
assert.strictEqual(pMag.missiles, 16 + 8, 'magazine lvl2 -> +8 missiles');
assert.strictEqual(pMag.maxMissiles, 40 + 8, 'magazine lvl2 -> +8 max missiles');
assert.strictEqual(pMag.flares, 10 + 2, 'magazine lvl2 -> +2 flares');
// perks STACK
setMeta(Object.assign(freshMeta(), { perks: { hull: 1, guns: 1, bounty: 1 } }));
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
setMeta(Object.assign(freshMeta(), { sp: 10 }));
assert.strictEqual(buyPerk('hull'), false, 'cannot buy when sp < cost');
assert.strictEqual(perkLevel('hull'), 0, 'rejected buy leaves level 0');
assert.strictEqual(getMeta().sp, 10, 'rejected buy does not deduct');
// buyPerk succeeds + deducts
setMeta(Object.assign(freshMeta(), { sp: 100 }));
assert.strictEqual(buyPerk('hull'), true, 'buy succeeds with enough sp');
assert.strictEqual(perkLevel('hull'), 1, 'level incremented');
assert.strictEqual(getMeta().sp, 100 - 40, 'cost deducted');
// req gate: plating needs hull first
setMeta(Object.assign(freshMeta(), { sp: 1000 }));
assert.strictEqual(perkUnlocked('plating'), false, 'plating locked without hull');
assert.strictEqual(buyPerk('plating'), false, 'cannot buy a req-locked perk');
buyPerk('hull');
assert.strictEqual(perkUnlocked('plating'), true, 'plating unlocks after hull');
assert.strictEqual(buyPerk('plating'), true, 'now buyable');
// maxLevel cap
setMeta(Object.assign(freshMeta(), { sp: 100000 }));
for (var b = 0; b < 10; b++) buyPerk('bounty');
assert.strictEqual(perkLevel('bounty'), 1, 'bounty caps at maxLevel 1');
assert.strictEqual(perkMaxed('bounty'), true, 'bounty is maxed');
console.log('ok - perkCost rises with level; buyPerk respects funds, req gate, max level');

// ============================================================================
//  jet unlock gating
// ============================================================================
setMeta(freshMeta());
assert.strictEqual(jetUnlocked('FT-1'), true, 'starter jet unlocked');
assert.strictEqual(jetUnlocked('F-22'), true, 'starter jet unlocked');
assert.strictEqual(jetUnlocked('J-20'), false, 'non-starter jet locked');
setMeta(Object.assign(freshMeta(), { sp: 100 }));
assert.strictEqual(buyJet('J-20'), false, 'cannot buy locked jet when broke');
assert.strictEqual(jetUnlocked('J-20'), false, 'still locked');
setMeta(Object.assign(freshMeta(), { sp: 300 }));
assert.strictEqual(buyJet('J-20'), true, 'buy jet with enough sp');
assert.strictEqual(jetUnlocked('J-20'), true, 'now unlocked');
assert.strictEqual(getMeta().sp, 300 - 250, 'jet cost deducted');
assert.strictEqual(buyJet('J-20'), false, 'cannot re-buy an owned jet');
console.log('ok - jetUnlocked/buyJet: starter free, locked gated by SP, no double-buy');

// ============================================================================
//  skins
// ============================================================================
setMeta(freshMeta());
assert.strictEqual(skinOwned('F-22', 'default'), true, 'default skin always owned');
assert.strictEqual(skinOwned('F-22', 'raptor'), false, 'paid skin not owned yet');
setMeta(Object.assign(freshMeta(), { sp: 50 }));
assert.strictEqual(buySkin('F-22', 'raptor'), false, 'cannot buy skin when broke');
setMeta(Object.assign(freshMeta(), { sp: 200 }));
assert.strictEqual(buySkin('F-22', 'raptor'), true, 'buy skin with enough sp');
assert.strictEqual(skinOwned('F-22', 'raptor'), true, 'skin now owned');
assert.strictEqual(getMeta().sp, 200 - 120, 'skin cost deducted');
assert.strictEqual(buySkin('F-22', 'raptor'), false, 'cannot re-buy owned skin');
assert.strictEqual(buySkin('F-22', 'default'), false, 'default is not purchasable');
console.log('ok - skinOwned/buySkin: default free, paid skins gated by SP, no double-buy');

// ============================================================================
//  achievements: predicates fire on right stats, SP paid once
// ============================================================================
setMeta(freshMeta());
assert.strictEqual(grantAch('bossSlayer'), 30, 'grant pays the reward once');
assert.strictEqual(achEarned('bossSlayer'), true, 'achievement now earned');
assert.strictEqual(grantAch('bossSlayer'), 0, 're-grant pays nothing');
assert.strictEqual(getMeta().sp, 30, 'SP only banked once');
// checkAchievements evaluates predicates over run stats
setMeta(freshMeta());
let res = checkAchievements({ kills: 30, ground: 0, boss: 1, waveReached: 12 }, { score: 0 });
assert.ok(res.unlocked.indexOf('firstBlood') !== -1, 'firstBlood fires (>=1 kill)');
assert.ok(res.unlocked.indexOf('acePilot') !== -1, 'acePilot fires (>=25 kills)');
assert.ok(res.unlocked.indexOf('bossSlayer') !== -1, 'bossSlayer fires (boss>=1)');
assert.ok(res.unlocked.indexOf('survivor') !== -1, 'survivor fires (wave>=10)');
assert.ok(res.unlocked.indexOf('highScore') === -1, 'highScore does not fire under threshold');
assert.ok(res.unlocked.indexOf('tactician') === -1, 'tactician does not fire with no missions cleared');
assert.strictEqual(res.sp, 5 + 25 + 30 + 40, 'paid sum of newly-unlocked rewards');
// tactician fires once 5 mission objectives are completed in a run
let resT = checkAchievements({ missions: 5 }, { score: 0 });
assert.ok(resT.unlocked.indexOf('tactician') !== -1, 'tactician fires at 5 missions');
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
let mGarbage = getMeta();
assert.ok(validMeta(mGarbage), 'garbage save -> fresh meta');
assert.strictEqual(mGarbage.sp, 0, 'fresh meta starts at 0 SP');
// save then load round-trips state
setMeta(Object.assign(freshMeta(), { sp: 777, perks: { hull: 3 }, jets: { 'J-20': true } }));
let mRt = getMeta();
assert.strictEqual(mRt.sp, 777, 'SP persisted across load');
assert.strictEqual(mRt.perks.hull, 3, 'perk level persisted');
assert.strictEqual(mRt.jets['J-20'], true, 'unlocked jet persisted');
// starter jets always re-added even if a save omits one
_kv = {}; _kv[META_KEY] = JSON.stringify({ v: 1, sp: 0, jets: {}, skins: {}, perks: {}, ach: {}, stars: {} });
loadMeta();
assert.strictEqual(getMeta().jets['FT-1'], true, 'starter jets re-seeded on load');
console.log('ok - validMeta rejects malformed blobs; persistence round-trips; starters re-seeded');

// ============================================================================
//  sanitizeCallsign — uppercase, charset filter, length clamp, empty ok
// ============================================================================
assert.strictEqual(sanitizeCallsign(''), '', 'empty input -> empty');
assert.strictEqual(sanitizeCallsign(null), '', 'null -> empty');
assert.strictEqual(sanitizeCallsign(undefined), '', 'undefined -> empty');
assert.strictEqual(sanitizeCallsign('ace'), 'ACE', 'lowercases to upper');
assert.strictEqual(sanitizeCallsign('Maverick1'), 'MAVERICK', 'clamps to 8 chars');
assert.strictEqual(sanitizeCallsign('VIPER'), 'VIPER', 'already-clean passthrough');
assert.strictEqual(sanitizeCallsign('gh0st-1'), 'GH0ST1', 'strips non-alphanumeric');
assert.strictEqual(sanitizeCallsign('a!b@c#d$e%f^'), 'ABCDEF', 'strips special chars, no overflow');
assert.strictEqual(sanitizeCallsign('12345678extra'), '12345678', '8-digit numeric clamp');
assert.strictEqual(sanitizeCallsign('   HELLO   '), 'HELLO', 'spaces stripped');
console.log('ok - sanitizeCallsign: uppercase, A-Z0-9 filter, 8-char clamp, empty valid');

// ============================================================================
//  emblemUnlocked — free always true, SP-gated needs patch, ach-gated needs achievement
//  (emblemUnlocked is PURE — it reads the meta object passed as its 2nd argument)
// ============================================================================
let em = freshMeta();
assert.strictEqual(emblemUnlocked('wings', em), true, 'free emblem always unlocked');
assert.strictEqual(emblemUnlocked('skull', em), false, 'sp-gated emblem locked without patch');
assert.strictEqual(emblemUnlocked('star', em), false, 'sp-gated star locked without patch');
assert.strictEqual(emblemUnlocked('dragon', em), false, 'ach-gated dragon locked without achievement');
assert.strictEqual(emblemUnlocked('ace', em), false, 'ach-gated ace locked without achievement');
assert.strictEqual(emblemUnlocked('nonexistent', em), false, 'unknown emblem is false');
assert.strictEqual(emblemUnlocked('wings', null), false, 'null meta is false');
// SP-gated unlocks with patch ownership
em = freshMeta(); em.patches.skull = true;
assert.strictEqual(emblemUnlocked('skull', em), true, 'skull unlocked after patch owned');
assert.strictEqual(emblemUnlocked('star', em), false, 'star still locked (diff patch)');
// ach-gated unlocks with achievement
em = freshMeta(); em.ach.bossSlayer = true;
assert.strictEqual(emblemUnlocked('dragon', em), true, 'dragon unlocked after bossSlayer');
assert.strictEqual(emblemUnlocked('ace', em), false, 'ace still locked (diff ach)');
em.ach.acePilot = true;
assert.strictEqual(emblemUnlocked('ace', em), true, 'ace unlocked after acePilot');
console.log('ok - emblemUnlocked: free=always, sp-gated=patch, ach-gated=achievement');

// ============================================================================
//  validMeta + freshMeta include callsign/emblem/patches fields
// ============================================================================
const fm = freshMeta();
assert.strictEqual(fm.callsign, '', 'fresh meta callsign is empty string');
assert.strictEqual(fm.emblem, 'wings', 'fresh meta emblem is wings');
assert.ok(fm.patches && typeof fm.patches === 'object', 'fresh meta patches is object');
assert.ok(validMeta(fm), 'fresh meta with new fields validates');
// validMeta accepts legacy saves (missing callsign/emblem/patches) — backwards-compat
const legacy = { v: 1, sp: 0, jets: {}, skins: {}, perks: {}, ach: {} };
assert.ok(validMeta(legacy), 'legacy save without callsign/emblem/patches still validates');
// round-trip through JSON preserves new fields
setMeta(Object.assign(freshMeta(), { callsign: 'VIPER', emblem: 'skull', patches: { skull: true } }));
let mFields = getMeta();
assert.strictEqual(mFields.callsign, 'VIPER', 'callsign persists across save/load');
assert.strictEqual(mFields.emblem, 'skull', 'emblem persists across save/load');
assert.strictEqual(mFields.patches.skull, true, 'patch ownership persists across save/load');
// loadMeta heals legacy saves missing the new fields
_kv = {}; _kv[META_KEY] = JSON.stringify({ v: 1, sp: 0, jets: {}, skins: {}, perks: {}, ach: {} });
loadMeta();
let mHeal = getMeta();
assert.strictEqual(mHeal.callsign, '', 'legacy save healed: callsign defaults to empty');
assert.strictEqual(mHeal.emblem, 'wings', 'legacy save healed: emblem defaults to wings');
assert.ok(typeof mHeal.patches === 'object', 'legacy save healed: patches defaults to object');
console.log('ok - validMeta accepts + defaults new fields; legacy saves heal on load');

// ============================================================================
//  boss-rush (F15): unlock flag + best-time persistence + back-compat (NO progression wipe)
// ============================================================================
// fresh meta starts locked with no recorded time
let fresh = freshMeta();
assert.strictEqual(fresh.bossRushUnlocked, false, 'boss-rush starts locked on a fresh meta');
assert.strictEqual(fresh.bossRushBest, 0, 'no boss-rush record on a fresh meta');
// unlock flag + best time persist across save/load
setMeta(Object.assign(freshMeta(), { sp: 90, bossRushUnlocked: true, bossRushBest: 142 }));
let mBr = getMeta();
assert.strictEqual(mBr.bossRushUnlocked, true, 'boss-rush unlock persists across load');
assert.strictEqual(mBr.bossRushBest, 142, 'boss-rush best time persists across load');
assert.strictEqual(mBr.sp, 90, 'SP intact alongside the new boss-rush fields');
// CRITICAL back-compat: a legacy save WITHOUT any boss-rush fields still validates, keeps
// its progression (sp/perks/jets), and heals the new fields to defaults — never wipes.
_kv = {}; _kv[META_KEY] = JSON.stringify({ v: 1, sp: 555, jets: { 'J-20': true }, skins: {}, perks: { hull: 4 }, ach: {} });
assert.ok(validMeta(JSON.parse(_kv[META_KEY])), 'legacy save (no boss-rush fields) still validates — validMeta stayed lenient');
loadMeta();
let mLegacy = getMeta();
assert.strictEqual(mLegacy.sp, 555, 'legacy save keeps its SP (no progression wipe)');
assert.strictEqual(mLegacy.perks.hull, 4, 'legacy save keeps its perk levels');
assert.strictEqual(mLegacy.jets['J-20'], true, 'legacy save keeps its unlocked jets');
assert.strictEqual(mLegacy.bossRushUnlocked, false, 'legacy save healed: boss-rush locked by default');
assert.strictEqual(mLegacy.bossRushBest, 0, 'legacy save healed: boss-rush best defaults to 0');
console.log('ok - boss-rush: unlock+best persist; legacy save without fields keeps progression + heals');

// ---- pure boss-rush sequence/timing helpers (globals.js) ----
// sequence: legs 0..TOTAL-1 spawn a boss; out-of-range yields null (no spawn)
assert.strictEqual(bossRushNext(0), 'boss', 'first leg spawns a boss');
assert.strictEqual(bossRushNext(BOSS_RUSH_TOTAL - 1), 'boss', 'last leg spawns a boss');
assert.strictEqual(bossRushNext(BOSS_RUSH_TOTAL), null, 'past the end: no boss to spawn');
assert.strictEqual(bossRushNext(-1), null, 'negative index: no spawn');
assert.ok(BOSS_RUSH_TOTAL >= 1, 'the gauntlet has at least one boss');
// completion: done only once killed reaches total (saturating)
assert.strictEqual(bossRushDone(0, BOSS_RUSH_TOTAL), false, 'not done with zero kills');
assert.strictEqual(bossRushDone(BOSS_RUSH_TOTAL - 1, BOSS_RUSH_TOTAL), false, 'not done one boss short');
assert.strictEqual(bossRushDone(BOSS_RUSH_TOTAL, BOSS_RUSH_TOTAL), true, 'done at exactly total');
assert.strictEqual(bossRushDone(BOSS_RUSH_TOTAL + 2, BOSS_RUSH_TOTAL), true, 'done stays true past total');
// best time: lower wins; 0 means "no record" so the first finish always sets it
assert.strictEqual(betterTime(0, 120), 120, 'first finish sets the record');
assert.strictEqual(betterTime(120, 95), 95, 'a faster run replaces the record');
assert.strictEqual(betterTime(95, 120), 95, 'a slower run does not replace the record');
assert.strictEqual(betterTime(100, 0), 100, 'an invalid (0) new time keeps the old record');
assert.strictEqual(betterTime(0, 0), 0, 'no record and no valid time stays 0');
assert.strictEqual(betterTime(100, -5), 100, 'a negative new time keeps the old record');
console.log('ok - boss-rush pure helpers: sequence bounds, saturating completion, lower-wins best time');
