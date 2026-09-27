'use strict';
// ---- stateful in-memory storage seam so meta.js persistence fns run under Node ----
let _kv = {};
global.store = { get(k) { return k in _kv ? _kv[k] : null; }, set(k, v) { _kv[k] = String(v); } };

const assert = require('assert');
const {
  evalStars, evalStarsFor, starCondMet, STAR_DEFAULT_CONDS,
  bestStars, freshMeta, validMeta, loadMeta, saveMeta, META_KEY, META_VERSION,
  starsForType, levelConds, snapshotRunCounters, levelRunDelta,
} = require('../js/meta.js');

const loadedMeta = () => { saveMeta(); return JSON.parse(_kv[META_KEY]); };

assert.strictEqual(evalStars({ waveReached: 5 }, { score: 0 }), 0, 'a do-nothing run earns 0 stars');
assert.strictEqual(evalStars(null, null), 0, 'null run -> 0 stars');

assert.strictEqual(evalStars({ waveReached: 5, kills: 12 }, { score: 0 }), 1, 'hitting 60% kills earns the kills star only');
assert.strictEqual(evalStars({ waveReached: 5, kills: 11 }, { score: 0 }), 0, 'just under 60% kills earns nothing');
assert.strictEqual(evalStars({ waveReached: 5, kills: 6, ground: 4, boss: 2 }, { score: 0 }), 1, 'ground+boss fold into the kill total');

assert.strictEqual(evalStars({ waveReached: 5, cleanWaves: 1 }, { score: 0 }), 1, 'one clean wave earns the no-damage star');
assert.strictEqual(evalStars({ waveReached: 5, cleanWaves: 0 }, { score: 0 }), 0, 'zero clean waves -> no no-damage star');

assert.strictEqual(evalStars({ waveReached: 5, missions: 1 }, { score: 0 }), 1, 'one mission objective earns the rescue star');

const perfect = { waveReached: 5, kills: 20, cleanWaves: 2, missions: 3 };
assert.strictEqual(evalStars(perfect, { score: 0 }), 3, 'all three conditions -> 3 stars');
assert.ok(evalStars(perfect, { score: 0 }) <= 3, 'stars never exceed 3');
for (const r of [{}, { kills: 100, cleanWaves: 9, missions: 9, waveReached: 1 }, { kills: 3, waveReached: 99 }]) {
  const s = evalStars(r, { score: 0 });
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 3, 'evalStars returns an int in [0,3]');
}
console.log('ok - evalStars: 0 / partial / all-3 boundaries; ground+boss counted; bounded 0..3 integer');

for (const r of [perfect, { waveReached: 5, kills: 12 }, { waveReached: 5, missions: 1 }, {}]) {
  assert.strictEqual(evalStarsFor(r, { score: 0 }, undefined), evalStars(r, { score: 0 }), 'no conds == evalStars');
  assert.strictEqual(evalStarsFor(r, { score: 0 }, []), evalStars(r, { score: 0 }), 'empty conds == evalStars');
  assert.strictEqual(evalStarsFor(r, { score: 0 }, STAR_DEFAULT_CONDS), evalStars(r, { score: 0 }), 'default conds == evalStars');
}
assert.strictEqual(evalStarsFor(null, null, [{ type: 'noDamage' }]), 0, 'null run -> 0 stars even with conds');

assert.strictEqual(starCondMet({ type: 'noDamage' }, { damageTaken: 0 }), true, 'noDamage met when damageTaken 0');
assert.strictEqual(starCondMet({ type: 'noDamage' }, { damageTaken: 12 }), false, 'noDamage failed once hit');
assert.strictEqual(starCondMet({ type: 'noDamage' }, {}), true, 'noDamage met when no damage recorded');

assert.strictEqual(starCondMet({ type: 'accuracy', n: 50 }, { shots: 10, hits: 6 }), true, '60% clears the 50% bar');
assert.strictEqual(starCondMet({ type: 'accuracy', n: 70 }, { shots: 10, hits: 6 }), false, '60% misses the 70% bar');
assert.strictEqual(starCondMet({ type: 'accuracy', n: 50 }, { shots: 0, hits: 0 }), false, 'no shots fired -> accuracy unmet');

assert.strictEqual(starCondMet({ type: 'flawless' }, { missions: 1, damageTaken: 0 }), true, 'flawless = objective + untouched');
assert.strictEqual(starCondMet({ type: 'flawless' }, { missions: 1, damageTaken: 4 }), false, 'flawless fails if hit');
assert.strictEqual(starCondMet({ type: 'flawless' }, { missions: 0, damageTaken: 0 }), false, 'flawless fails without objective');

assert.strictEqual(starCondMet({ type: 'kills' }, { waveReached: 5, kills: 12 }), true, 'kills cond mirrors 60% efficiency');
assert.strictEqual(starCondMet({ type: 'clean' }, { cleanWaves: 1 }), true, 'clean cond mirrors a no-damage wave');
assert.strictEqual(starCondMet({ type: 'objective' }, { missions: 1 }), true, 'objective cond mirrors a completed objective');
assert.strictEqual(starCondMet({ type: 'bogus' }, { kills: 999, waveReached: 1 }), false, 'an unknown cond type is never met');

const stealthConds = [{ type: 'noDamage' }, { type: 'objective' }, { type: 'accuracy', n: 50 }];
assert.strictEqual(evalStarsFor({ waveReached: 1, damageTaken: 0, missions: 1, shots: 10, hits: 8 }, { score: 0 }, stealthConds), 3, 'flawless stealth run earns all 3 authored stars');
assert.strictEqual(evalStarsFor({ waveReached: 1, damageTaken: 9, missions: 1, shots: 10, hits: 3 }, { score: 0 }, stealthConds), 1, 'hit + low accuracy stealth run earns only the objective star');
assert.ok(evalStarsFor({ damageTaken: 0, missions: 1, cleanWaves: 1, kills: 999, waveReached: 1 }, { score: 0 }, [{ type: 'noDamage' }, { type: 'objective' }, { type: 'clean' }, { type: 'kills' }]) <= 3, 'evalStarsFor caps at 3 conds');
console.log('ok - evalStarsFor/starCondMet: per-mission conds; default fallback == evalStars; bounded 0..3');

let meta = freshMeta();
assert.strictEqual(bestStars(meta, 'F-22', 2), 2, 'first run records 2 stars for the jet');
assert.strictEqual(meta.stars['F-22'], 2, 'meta.stars holds the jet best');
assert.strictEqual(bestStars(meta, 'F-22', 1), 2, 'a worse run keeps the previous best');
assert.strictEqual(meta.stars['F-22'], 2, 'best unchanged after a worse run');
assert.strictEqual(bestStars(meta, 'F-22', 3), 3, 'a better run raises the best');
assert.strictEqual(meta.stars['F-22'], 3, 'best raised to 3');
assert.strictEqual(bestStars(meta, 'SU-57', 1), 1, 'a different jet starts from its own 0');
assert.strictEqual(meta.stars['F-22'], 3, 'other jet best untouched');
assert.strictEqual(meta.stars['SU-57'], 1, 'second jet recorded independently');
const legacy = { v: META_VERSION, sp: 0, jets: {}, skins: {}, perks: {}, ach: {} };
assert.strictEqual(bestStars(legacy, 'J-20', 2), 2, 'bestStars lazy-creates stars on a legacy meta');
assert.strictEqual(legacy.stars['J-20'], 2, 'stars map created on demand');

_kv = {}; _kv[META_KEY] = JSON.stringify(Object.assign(freshMeta(), { stars: { 'F-22': 3, 'SU-57': 2 } }));
loadMeta();
const rt = loadedMeta();
assert.strictEqual(rt.stars['F-22'], 3, 'F-22 star best persisted across load');
assert.strictEqual(rt.stars['SU-57'], 2, 'SU-57 star best persisted across load');
console.log('ok - bestStars: per-jet best is monotonic and persists across save/load');

assert.ok(validMeta(freshMeta()), 'fresh meta (with stars) validates');
assert.ok(validMeta(JSON.parse(JSON.stringify(freshMeta()))), 'round-trips through JSON');
assert.ok(validMeta({ v: 1, sp: 0, jets: {}, skins: {}, perks: {}, ach: {} }), 'a meta missing stars still validates (back-compat — no progression wipe)');
_kv = {}; _kv[META_KEY] = JSON.stringify({ v: 1, sp: 5, jets: {}, skins: {}, perks: {}, ach: {} });
loadMeta();
const healed = loadedMeta();
assert.strictEqual(healed.sp, 5, 'legacy save loads as-is — SP/progression preserved, NOT reset to a fresh meta');
assert.ok(healed.stars && typeof healed.stars === 'object', 'loaded meta has a healed stars map');
console.log('ok - validMeta stays lenient; a stars-less legacy save loads with progression intact and heals stars');

assert.strictEqual(starCondMet({ type: 'gunOnly' }, { kills: 5, pMissiles: 0 }), true, 'gunOnly met: kills, no missiles fired');
assert.strictEqual(starCondMet({ type: 'gunOnly' }, { kills: 5, pMissiles: 2 }), false, 'gunOnly failed: a missile was fired');
assert.strictEqual(starCondMet({ type: 'gunOnly' }, { kills: 0, pMissiles: 0 }), false, 'gunOnly needs at least one kill');
assert.strictEqual(starCondMet({ type: 'noFlares' }, { kills: 3, pFlares: 0 }), true, 'noFlares met: kills, no flares');
assert.strictEqual(starCondMet({ type: 'noFlares' }, { missions: 1, pFlares: 0 }), true, 'noFlares met via objective');
assert.strictEqual(starCondMet({ type: 'noFlares' }, { kills: 3, pFlares: 1 }), false, 'noFlares failed: a flare was burned');
assert.strictEqual(starCondMet({ type: 'noFlares' }, { kills: 0, missions: 0, pFlares: 0 }), false, 'noFlares needs engagement');
assert.strictEqual(starCondMet({ type: 'fastClear', n: 120 }, { timeSecs: 90 }), true, 'fastClear met under the time bar');
assert.strictEqual(starCondMet({ type: 'fastClear', n: 120 }, { timeSecs: 150 }), false, 'fastClear missed over the time bar');
assert.strictEqual(starCondMet({ type: 'fastClear', n: 120 }, { timeSecs: 0 }), false, 'fastClear unmet with no time recorded');
assert.strictEqual(starCondMet({ type: 'killsN', n: 8 }, { kills: 5, ground: 2, boss: 1 }), true, 'killsN folds ground+boss into the count');
assert.strictEqual(starCondMet({ type: 'killsN', n: 8 }, { kills: 5, ground: 2 }), false, 'killsN unmet below n');
console.log('ok - v1.3 unique conds: gunOnly/noFlares/fastClear/killsN over existing run stats');

assert.deepStrictEqual(starsForType('FURBALL'), [{ type: 'kills' }, { type: 'noDamage' }], 'FURBALL → kills+noDamage');
assert.deepStrictEqual(starsForType('STEALTH'), [{ type: 'objective' }, { type: 'noDamage' }], 'STEALTH → objective+noDamage');
assert.strictEqual(starsForType('UNKNOWN').length, 2, 'unknown type → 2 fallback conds');
const lvlA = { type: 'FURBALL', starUnique: { type: 'gunOnly' } };
assert.deepStrictEqual(levelConds(lvlA), [{ type: 'kills' }, { type: 'noDamage' }, { type: 'gunOnly' }], 'levelConds = 2 type + 1 unique');
const lvlB = { type: 'FURBALL', stars: [{ type: 'clean' }], starUnique: { type: 'gunOnly' } };
assert.deepStrictEqual(levelConds(lvlB), [{ type: 'clean' }], 'explicit lvl.stars overrides the composed set');
assert.strictEqual(levelConds({ type: 'SWEEP' }).length, 2, 'no starUnique → 2 conds');
const lvlStealth = { type: 'STEALTH', starUnique: { type: 'fastClear', n: 200 } };
assert.strictEqual(
  evalStarsFor({ missions: 1, damageTaken: 0, timeSecs: 120 }, { score: 0 }, levelConds(lvlStealth)), 3,
  'flawless fast stealth run earns all 3 composed stars');
console.log('ok - starsForType/levelConds: 2 type-defaults + 1 unique, override honored');

const base = snapshotRunCounters({ kills: 10, damageTaken: 5, pMissiles: 2, shots: 100, hits: 40 });
const dlt = levelRunDelta({ kills: 14, damageTaken: 5, pMissiles: 2, shots: 130, hits: 55 }, base);
assert.strictEqual(dlt.kills, 4, 'delta kills = this level only');
assert.strictEqual(dlt.damageTaken, 0, 'no new damage this level → 0');
assert.strictEqual(dlt.pMissiles, 0, 'no new missiles fired this level → 0 (gunOnly stays earnable)');
assert.strictEqual(dlt.shots, 30, 'shots delta');
assert.strictEqual(dlt.hits, 15, 'hits delta');
assert.strictEqual(starCondMet({ type: 'gunOnly' }, dlt), true, 'gunOnly met on a clean-this-level delta despite cumulative missiles');
assert.strictEqual(levelRunDelta({ kills: 1 }, { kills: 5 }).kills, 0, 'delta floors at 0');
console.log('ok - levelRunDelta: per-level deltas floor at 0, keep stars per-mission');

console.log('ok - meta.js star mirrors (evalStars/bestStars/validMeta/freshMeta) match source');
