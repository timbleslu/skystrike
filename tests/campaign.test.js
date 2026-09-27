'use strict';
// Campaign progression + bounded-level wave scaling + checkpoint snapshot/rollback cores
const assert = require('assert');
const {
  LEVEL_WAVE_MIN, LEVEL_WAVE_CAP, campaignWaveCount, levelCleared,
  isOpUnlocked, isLevelUnlocked, levelState, markLevelCleared,
  captureSnapshot, rollbackSnapshot, grantLevelRewards, CAMPAIGN_REPLAY_REWARDS,
} = require('../js/core.js');

const OPS = [
  { id: 'a', levels: [ { id: 'a1' }, { id: 'a2' }, { id: 'aBoss', isBoss: true } ] },
  { id: 'b', levels: [ { id: 'b1' }, { id: 'bBoss', isBoss: true } ] },
];

assert.strictEqual(LEVEL_WAVE_MIN, 2);
assert.strictEqual(LEVEL_WAVE_CAP, 4);
assert.deepStrictEqual(
  [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return campaignWaveCount(i); }),
  [2, 2, 3, 3, 4, 4, 4, 4, 4],
  'waves per level ramp then cap at 4');
assert.strictEqual(campaignWaveCount(0, 8), 2, 'custom cap keeps the floor of 2');
assert.strictEqual(campaignWaveCount(20, 8), 8, 'custom cap clamps the high end');

assert.strictEqual(levelCleared(3, 3, true), true, 'all waves + objective done');
assert.strictEqual(levelCleared(2, 3, true), false, 'waves remain');
assert.strictEqual(levelCleared(3, 3, false), false, 'unresolved objective blocks clear');
assert.strictEqual(levelCleared(4, 3, true), true, 'overshoot still clears');

const fresh = {};
assert.strictEqual(isOpUnlocked(fresh, OPS, 'a'), true, 'first op always unlocked');
assert.strictEqual(isOpUnlocked(fresh, OPS, 'b'), false, 'op B locked until A boss cleared');
assert.strictEqual(isOpUnlocked(fresh, OPS, 'zzz'), false, 'unknown op id is locked');
assert.strictEqual(isLevelUnlocked(fresh, OPS, 'a', 0), true, 'first level of an unlocked op is open');
assert.strictEqual(isLevelUnlocked(fresh, OPS, 'a', 1), false, 'level 2 needs level 1 cleared');
assert.strictEqual(isLevelUnlocked(fresh, OPS, 'b', 0), false, 'op B level 1 locked (op locked)');
assert.strictEqual(levelState(fresh, OPS, 'a', 0), 'unlocked');
assert.strictEqual(levelState(fresh, OPS, 'a', 1), 'locked');
assert.strictEqual(levelState(fresh, OPS, 'a', 99), 'locked', 'out-of-range index is locked');

const afterA1 = markLevelCleared(fresh, OPS, 'a', 0, 1500, 2);
assert.deepStrictEqual(fresh, {}, 'input campaign is NOT mutated (pure)');
assert.strictEqual(levelState(afterA1, OPS, 'a', 0), 'cleared');
assert.strictEqual(levelState(afterA1, OPS, 'a', 1), 'unlocked', 'clearing L1 unlocks L2');
assert.strictEqual(afterA1.a.furthest, 1, 'furthest advanced to index 1');
assert.strictEqual(afterA1.a.levels.a1.bestScore, 1500);
assert.strictEqual(afterA1.a.levels.a1.bestStars, 2);

const replay = markLevelCleared(afterA1, OPS, 'a', 0, 900, 1);
assert.strictEqual(replay.a.levels.a1.bestScore, 1500, 'bestScore monotonic');
assert.strictEqual(replay.a.levels.a1.bestStars, 2, 'bestStars monotonic');
assert.strictEqual(replay.a.furthest, 1, 'furthest unchanged on replay');

let c = markLevelCleared(afterA1, OPS, 'a', 1, 2000, 3);
c = markLevelCleared(c, OPS, 'a', 2, 9000, 3);
assert.strictEqual(levelState(c, OPS, 'a', 2), 'cleared', 'boss level cleared');
assert.strictEqual(isOpUnlocked(c, OPS, 'b'), true, 'clearing op A boss unlocks op B');
assert.strictEqual(isLevelUnlocked(c, OPS, 'b', 0), true, 'op B level 1 now open');
assert.strictEqual(c.a.furthest, 2, 'furthest caps at the last index');

const player = { tp: 120, score: 3400, tech: ['gun1', 'msl1'], techRepeat: { gun1: 2 }, upgrades: ['u1'], loadout: { jetId: 'F-22' } };
const snap = captureSnapshot(player);
assert.strictEqual(snap.rp, 120);
assert.strictEqual(snap.score, 3400);
assert.deepStrictEqual(snap.tech, ['gun1', 'msl1']);
assert.deepStrictEqual(snap.techRepeat, { gun1: 2 });
player.tp = 0; player.tech.push('msl2'); player.techRepeat.gun1 = 9;
assert.strictEqual(snap.rp, 120, 'snapshot rp frozen');
assert.deepStrictEqual(snap.tech, ['gun1', 'msl1'], 'snapshot tech array is a copy');
assert.strictEqual(snap.techRepeat.gun1, 2, 'snapshot techRepeat is a copy');
const restored = rollbackSnapshot(snap);
assert.strictEqual(restored.rp, 120);
assert.deepStrictEqual(restored.tech, ['gun1', 'msl1']);
restored.tech.push('x');
assert.deepStrictEqual(snap.tech, ['gun1', 'msl1'], 'rollback returns an independent copy');
assert.strictEqual(captureSnapshot(null), null, 'null player -> null snapshot');

assert.deepStrictEqual(grantLevelRewards(0, false, false, true), { rp: 40, score: 1000 }, 'level 1 first clear');
assert.deepStrictEqual(grantLevelRewards(3, false, false, true), { rp: 100, score: 2500 }, 'index scales');
assert.deepStrictEqual(grantLevelRewards(7, true, false, true), { rp: 330, score: 9500 }, 'boss bonus added');
assert.deepStrictEqual(grantLevelRewards(2, false, true, false), { rp: 0, score: 0 }, 'replay no-reward when not farmable');
assert.deepStrictEqual(grantLevelRewards(2, false, true, true), { rp: 80, score: 2000 }, 'replay re-grants when farmable');
assert.strictEqual(CAMPAIGN_REPLAY_REWARDS, true, 'replays farmable by default (brief)');
assert.deepStrictEqual(grantLevelRewards(0, false, true), { rp: 40, score: 1000 }, 'default farmable falls back to true');

global.store = (function () { var d = {}; return { get: function (k) { return d[k] || null; }, set: function (k, v) { d[k] = v; }, remove: function (k) { delete d[k]; } }; })();
global.devUnlockAll = false;
const core = require('../js/core.js'); for (const k in core) global[k] = core[k];
global.OPERATIONS = OPS;
const M = require('../js/meta.js');
assert.deepStrictEqual(M.freshMeta().campaign, {}, 'freshMeta seeds an empty campaign');
global.store.set('skystrike_meta', JSON.stringify({ v: 1, sp: 7, jets: { 'FT-1': true }, skins: {}, perks: {}, ach: {} }));
M.loadMeta();
assert.strictEqual(M.campaignOpUnlocked('a'), true, 'campaign healed -> first op unlocked, no throw');
assert.strictEqual(M.campaignOpUnlocked('b'), false, 'op B still locked after heal');
M.campaignClearLevel('a', 0, 'a1', 1500, 2);
M.campaignClearLevel('a', 1, 'a2', 2000, 3);
M.campaignClearLevel('a', 2, 'aBoss', 9000, 3);
assert.strictEqual(M.campaignLevelState('a', 2), 'cleared', 'wrapper persists the clear');
assert.strictEqual(M.campaignOpUnlocked('b'), true, 'wrapper-driven progression unlocks op B');
const saved = JSON.parse(global.store.get('skystrike_meta'));
assert.strictEqual(saved.sp, 7, 'legacy SP preserved through heal + save (no wipe)');
assert.strictEqual(saved.campaign.a.levels.a1.cleared, true, 'campaign progress persisted via the storage seam');

console.log('ok - campaign progression + bounded scaling + snapshot/rollback cores (Operations revamp)');
