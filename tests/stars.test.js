'use strict';
// ---- stateful in-memory storage seam so meta.js persistence fns run under Node ----
let _kv = {};
global.store = { get(k) { return k in _kv ? _kv[k] : null; }, set(k, v) { _kv[k] = String(v); } };

const assert = require('assert');
const {
  evalStars, evalStarsFor, starCondMet, STAR_DEFAULT_CONDS,
  bestStars, freshMeta, validMeta, loadMeta, saveMeta, META_KEY, META_VERSION,
} = require('../js/meta.js');

// loadMeta()/saveMeta() mutate meta.js's internal `meta`, which is not exported.
// We inspect the round-tripped, healed blob via the stateful store seam instead.
const loadedMeta = () => { saveMeta(); return JSON.parse(_kv[META_KEY]); };

// ============================================================================
//  evalStars: boundary cases (0 / partial / all 3)
// ============================================================================
// nothing done -> 0 stars
assert.strictEqual(evalStars({ waveReached: 5 }, { score: 0 }), 0, 'a do-nothing run earns 0 stars');
assert.strictEqual(evalStars(null, null), 0, 'null run -> 0 stars');

// exactly the kill threshold (60% of waves*4) earns just the kills star
// waves=5 -> expected=20 -> 12 kills is 60%
assert.strictEqual(evalStars({ waveReached: 5, kills: 12 }, { score: 0 }), 1, 'hitting 60% kills earns the kills star only');
assert.strictEqual(evalStars({ waveReached: 5, kills: 11 }, { score: 0 }), 0, 'just under 60% kills earns nothing');
// ground + boss count toward the kill total
assert.strictEqual(evalStars({ waveReached: 5, kills: 6, ground: 4, boss: 2 }, { score: 0 }), 1, 'ground+boss fold into the kill total');

// no-damage clean wave earns its own star independently
assert.strictEqual(evalStars({ waveReached: 5, cleanWaves: 1 }, { score: 0 }), 1, 'one clean wave earns the no-damage star');
assert.strictEqual(evalStars({ waveReached: 5, cleanWaves: 0 }, { score: 0 }), 0, 'zero clean waves -> no no-damage star');

// objectives/missions earns its own star independently
assert.strictEqual(evalStars({ waveReached: 5, missions: 1 }, { score: 0 }), 1, 'one mission objective earns the rescue star');

// all three at once -> the full 3 stars, and never more than 3
const perfect = { waveReached: 5, kills: 20, cleanWaves: 2, missions: 3 };
assert.strictEqual(evalStars(perfect, { score: 0 }), 3, 'all three conditions -> 3 stars');
assert.ok(evalStars(perfect, { score: 0 }) <= 3, 'stars never exceed 3');
// result is always an integer in 0..3
for (const r of [{}, { kills: 100, cleanWaves: 9, missions: 9, waveReached: 1 }, { kills: 3, waveReached: 99 }]) {
  const s = evalStars(r, { score: 0 });
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 3, 'evalStars returns an int in [0,3]');
}
console.log('ok - evalStars: 0 / partial / all-3 boundaries; ground+boss counted; bounded 0..3 integer');

// ============================================================================
//  evalStarsFor + starCondMet: per-mission (Ops) star conditions
// ============================================================================
// no conds (or empty) falls back BYTE-FOR-BYTE to evalStars — non-annotated levels + Endless unchanged
for (const r of [perfect, { waveReached: 5, kills: 12 }, { waveReached: 5, missions: 1 }, {}]) {
  assert.strictEqual(evalStarsFor(r, { score: 0 }, undefined), evalStars(r, { score: 0 }), 'no conds == evalStars');
  assert.strictEqual(evalStarsFor(r, { score: 0 }, []), evalStars(r, { score: 0 }), 'empty conds == evalStars');
  assert.strictEqual(evalStarsFor(r, { score: 0 }, STAR_DEFAULT_CONDS), evalStars(r, { score: 0 }), 'default conds == evalStars');
}
assert.strictEqual(evalStarsFor(null, null, [{ type: 'noDamage' }]), 0, 'null run -> 0 stars even with conds');

// noDamage: untouched the whole level (run.damageTaken === 0)
assert.strictEqual(starCondMet({ type: 'noDamage' }, { damageTaken: 0 }), true, 'noDamage met when damageTaken 0');
assert.strictEqual(starCondMet({ type: 'noDamage' }, { damageTaken: 12 }), false, 'noDamage failed once hit');
assert.strictEqual(starCondMet({ type: 'noDamage' }, {}), true, 'noDamage met when no damage recorded');

// accuracy: hits/shots*100 >= n
assert.strictEqual(starCondMet({ type: 'accuracy', n: 50 }, { shots: 10, hits: 6 }), true, '60% clears the 50% bar');
assert.strictEqual(starCondMet({ type: 'accuracy', n: 70 }, { shots: 10, hits: 6 }), false, '60% misses the 70% bar');
assert.strictEqual(starCondMet({ type: 'accuracy', n: 50 }, { shots: 0, hits: 0 }), false, 'no shots fired -> accuracy unmet');

// flawless: objective done AND no damage taken
assert.strictEqual(starCondMet({ type: 'flawless' }, { missions: 1, damageTaken: 0 }), true, 'flawless = objective + untouched');
assert.strictEqual(starCondMet({ type: 'flawless' }, { missions: 1, damageTaken: 4 }), false, 'flawless fails if hit');
assert.strictEqual(starCondMet({ type: 'flawless' }, { missions: 0, damageTaken: 0 }), false, 'flawless fails without objective');

// kills/clean/objective descriptors agree with the default evalStars terms
assert.strictEqual(starCondMet({ type: 'kills' }, { waveReached: 5, kills: 12 }), true, 'kills cond mirrors 60% efficiency');
assert.strictEqual(starCondMet({ type: 'clean' }, { cleanWaves: 1 }), true, 'clean cond mirrors a no-damage wave');
assert.strictEqual(starCondMet({ type: 'objective' }, { missions: 1 }), true, 'objective cond mirrors a completed objective');
assert.strictEqual(starCondMet({ type: 'bogus' }, { kills: 999, waveReached: 1 }), false, 'an unknown cond type is never met');

// a custom 3-condition level: stealth-style (noDamage + objective + accuracy)
const stealthConds = [{ type: 'noDamage' }, { type: 'objective' }, { type: 'accuracy', n: 50 }];
assert.strictEqual(evalStarsFor({ waveReached: 1, damageTaken: 0, missions: 1, shots: 10, hits: 8 }, { score: 0 }, stealthConds), 3, 'flawless stealth run earns all 3 authored stars');
assert.strictEqual(evalStarsFor({ waveReached: 1, damageTaken: 9, missions: 1, shots: 10, hits: 3 }, { score: 0 }, stealthConds), 1, 'hit + low accuracy stealth run earns only the objective star');
// never exceeds 3 even if the authored array is over-long (capped at 3)
assert.ok(evalStarsFor({ damageTaken: 0, missions: 1, cleanWaves: 1, kills: 999, waveReached: 1 }, { score: 0 }, [{ type: 'noDamage' }, { type: 'objective' }, { type: 'clean' }, { type: 'kills' }]) <= 3, 'evalStarsFor caps at 3 conds');
console.log('ok - evalStarsFor/starCondMet: per-mission conds; default fallback == evalStars; bounded 0..3');

// ============================================================================
//  bestStars: keeps the BEST per jet, never regresses, persists across runs
// ============================================================================
let meta = freshMeta();
assert.strictEqual(bestStars(meta, 'F-22', 2), 2, 'first run records 2 stars for the jet');
assert.strictEqual(meta.stars['F-22'], 2, 'meta.stars holds the jet best');
// a worse later run does NOT lower the recorded best
assert.strictEqual(bestStars(meta, 'F-22', 1), 2, 'a worse run keeps the previous best');
assert.strictEqual(meta.stars['F-22'], 2, 'best unchanged after a worse run');
// a better run raises it
assert.strictEqual(bestStars(meta, 'F-22', 3), 3, 'a better run raises the best');
assert.strictEqual(meta.stars['F-22'], 3, 'best raised to 3');
// per-jet: a different jet tracks independently
assert.strictEqual(bestStars(meta, 'SU-57', 1), 1, 'a different jet starts from its own 0');
assert.strictEqual(meta.stars['F-22'], 3, 'other jet best untouched');
assert.strictEqual(meta.stars['SU-57'], 1, 'second jet recorded independently');
// tolerant of a meta that predates the stars map (lazy-inits it)
const legacy = { v: META_VERSION, sp: 0, jets: {}, skins: {}, perks: {}, ach: {} };
assert.strictEqual(bestStars(legacy, 'J-20', 2), 2, 'bestStars lazy-creates stars on a legacy meta');
assert.strictEqual(legacy.stars['J-20'], 2, 'stars map created on demand');

// persistence round-trip: the per-jet best survives save -> load.
// Seed the store with a meta carrying jet bests, load it, then read back the persisted blob.
_kv = {}; _kv[META_KEY] = JSON.stringify(Object.assign(freshMeta(), { stars: { 'F-22': 3, 'SU-57': 2 } }));
loadMeta();
const rt = loadedMeta();
assert.strictEqual(rt.stars['F-22'], 3, 'F-22 star best persisted across load');
assert.strictEqual(rt.stars['SU-57'], 2, 'SU-57 star best persisted across load');
console.log('ok - bestStars: per-jet best is monotonic and persists across save/load');

// ============================================================================
//  validMeta stays lenient for the new stars field; loadMeta heals it (no wipe)
// ============================================================================
assert.ok(validMeta(freshMeta()), 'fresh meta (with stars) validates');
assert.ok(validMeta(JSON.parse(JSON.stringify(freshMeta()))), 'round-trips through JSON');
assert.ok(validMeta({ v: 1, sp: 0, jets: {}, skins: {}, perks: {}, ach: {} }), 'a meta missing stars still validates (back-compat — no progression wipe)');
// a legacy save without stars loads AS-IS (progression preserved) and heals the stars map
_kv = {}; _kv[META_KEY] = JSON.stringify({ v: 1, sp: 5, jets: {}, skins: {}, perks: {}, ach: {} });
loadMeta();
const healed = loadedMeta();
assert.strictEqual(healed.sp, 5, 'legacy save loads as-is — SP/progression preserved, NOT reset to a fresh meta');
assert.ok(healed.stars && typeof healed.stars === 'object', 'loaded meta has a healed stars map');
console.log('ok - validMeta stays lenient; a stars-less legacy save loads with progression intact and heals stars');

console.log('ok - meta.js star mirrors (evalStars/bestStars/validMeta/freshMeta) match source');
