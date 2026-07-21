'use strict';
// F8 WEEKLY CHALLENGE — pure ISO-week seed + modifier pick (core.js) and the weekly-best meta seam.
// Mirrors tests/daily.test.js (seed determinism) + tests/meta.test.js (store-seam heal check).
const assert = require('assert');

// ---- Node seam: meta.js store stub, installed BEFORE requiring meta.js ----
let _kv = {};
global.store = { get(k) { return k in _kv ? _kv[k] : null; }, set(k, v) { _kv[k] = String(v); } };

const { weeklySeedFor, weekIdFor, WEEKLY_MODIFIERS, weeklyModifiers } = require('../js/core.js');
const { loadMeta, saveMeta, freshMeta, weeklyBest, recordWeeklyBest, META_KEY, META_VERSION } = require('../js/meta.js');

// drive the internal `meta` (not exported) via the store seam, like tests/meta.test.js
function setMeta(obj) { _kv[META_KEY] = JSON.stringify(obj); loadMeta(); }
function getMeta() { saveMeta(); return JSON.parse(_kv[META_KEY]); }

// ============================================================================
//  weeklySeedFor / weekIdFor — one seed per ISO week, every weekday, TZ-independent
// ============================================================================
// 2026-W29 = Mon 2026-07-13 .. Sun 2026-07-19
const week29 = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19'];
const seed29 = weeklySeedFor(week29[0]);
assert.ok(Number.isInteger(seed29) && seed29 >= 0, 'seed is a non-negative integer (uint32)');
for (const d of week29) {
  assert.strictEqual(weeklySeedFor(d), seed29, 'all 7 days of one ISO week share ONE seed (' + d + ')');
  assert.strictEqual(weekIdFor(d), '2026-W29', 'all 7 days map to the same week id (' + d + ')');
}

// adjacent weeks differ (seed + id)
assert.notStrictEqual(weeklySeedFor('2026-07-20'), seed29, 'the next ISO week has a different seed');
assert.strictEqual(weekIdFor('2026-07-20'), '2026-W30', 'the next Monday is week 30');
assert.notStrictEqual(weeklySeedFor('2026-07-06'), seed29, 'the previous ISO week has a different seed');

// distinct weeks across a wide window must yield distinct seeds (no collisions over ~4 years of weeks)
const seenSeeds = new Set(); const seenIds = new Set();
for (let n = 0; n < 210; n++) {
  const base = Date.UTC(2024, 0, 1) + n * 7 * 86400000;   // one Monday per iteration (test scaffold clock — NOT the core)
  const ds = new Date(base).toISOString().slice(0, 10);
  const id = weekIdFor(ds); const s = weeklySeedFor(ds);
  if (seenIds.has(id)) continue;   // multiple Mondays can't share an id, but guard anyway
  assert.ok(!seenSeeds.has(s), 'distinct ISO week -> distinct seed (collision at ' + id + ')');
  seenSeeds.add(s); seenIds.add(id);
}

// ============================================================================
//  ISO-week boundary — Monday start, year boundary correct
// ============================================================================
// Mon 2025-12-29 .. Sun 2026-01-04 is 2026-W01 (it holds the year's first Thursday, 2026-01-01).
const boundary = ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'];
const seedB = weeklySeedFor(boundary[0]);
for (const d of boundary) {
  assert.strictEqual(weekIdFor(d), '2026-W01', 'year-boundary week is 2026-W01 (' + d + ')');
  assert.strictEqual(weeklySeedFor(d), seedB, 'year-boundary week shares ONE seed (' + d + ')');
}
// Sun 2025-12-28 is the LAST day of the previous ISO week (2025-W52), a different week+seed
assert.strictEqual(weekIdFor('2025-12-28'), '2025-W52', 'the Sunday before the boundary Monday is 2025-W52');
assert.notStrictEqual(weeklySeedFor('2025-12-28'), seedB, 'that Sunday has a different seed from the boundary week');
// 53-week year: 2026 runs to week 53; the first days of 2027 still belong to 2026-W53
assert.strictEqual(weekIdFor('2026-12-28'), '2026-W53', '2026 runs to ISO week 53');
assert.strictEqual(weekIdFor('2027-01-01'), '2026-W53', 'early-Jan 2027 belongs to 2026-W53');

// ============================================================================
//  weeklyModifiers — deterministic, exactly 2, distinct, drawn from the table
// ============================================================================
const tableIds = WEEKLY_MODIFIERS.map(m => m.id);
assert.ok(WEEKLY_MODIFIERS.length >= 5, 'the modifier table has at least 5 entries');
assert.strictEqual(new Set(tableIds).size, tableIds.length, 'modifier ids are unique in the table');
const pickA = weeklyModifiers(seed29);
const pickB = weeklyModifiers(seed29);
assert.strictEqual(pickA.length, 2, 'exactly 2 modifiers are picked');
assert.notStrictEqual(pickA[0].id, pickA[1].id, 'the 2 picked modifiers are distinct');
assert.deepStrictEqual(pickA.map(m => m.id), pickB.map(m => m.id), 'same seed -> same 2 modifiers');
for (const m of pickA) assert.ok(tableIds.includes(m.id), 'each picked modifier is from the table (' + m.id + ')');
// the pick actually varies across seeds (not a constant pair), and every modifier is reachable
const pairs = new Set(); const reached = new Set();
for (let n = 0; n < 400; n++) { const p = weeklyModifiers(n >>> 0); pairs.add(p.map(m => m.id).sort().join(',')); p.forEach(m => reached.add(m.id)); }
assert.ok(pairs.size >= 3, 'the picked pair varies across seeds');
assert.strictEqual(reached.size, tableIds.length, 'every modifier in the table is reachable by some seed');

// ============================================================================
//  No-clock rule (behavioral) — the seed/id are a pure fn of the date-STRING and
//  must NEVER consult the wall clock. Prove it through the interface: freeze the
//  ambient clock at two absurd, far-apart instants and confirm the result for a
//  FIXED date string is identical. Any hidden Date.now()/new Date() read would move
//  with the frozen clock and trip this — catches a clock dependency however it is
//  spelled (unlike a source-text scrape for the literal `Date.now`/`new Date(`).
// ============================================================================
const RealDate = global.Date;
function withFrozenClock(ms, fn) {
  class FrozenDate extends RealDate {
    constructor() { return arguments.length === 0 ? super(ms) : super(...arguments); }
    static now() { return ms; }
  }
  global.Date = FrozenDate;
  try { return fn(); } finally { global.Date = RealDate; }
}
const probeDay = '2026-07-15';   // a Wednesday inside 2026-W29 (same week as seed29's Monday)
const seedFrozenA = withFrozenClock(0, () => weeklySeedFor(probeDay));
const seedFrozenB = withFrozenClock(RealDate.UTC(2099, 11, 31), () => weeklySeedFor(probeDay));
const idFrozenA = withFrozenClock(0, () => weekIdFor(probeDay));
const idFrozenB = withFrozenClock(RealDate.UTC(2099, 11, 31), () => weekIdFor(probeDay));
assert.strictEqual(seedFrozenA, seedFrozenB, 'weeklySeedFor ignores the wall clock (no hidden Date.now/new Date read)');
assert.strictEqual(idFrozenA, idFrozenB, 'weekIdFor ignores the wall clock');
// and the clock-frozen results equal the normal (unfrozen) values for that same ISO week
assert.strictEqual(seedFrozenA, seed29, 'clock-frozen seed equals the deterministic 2026-W29 seed');
assert.strictEqual(idFrozenA, '2026-W29', 'clock-frozen id equals the deterministic 2026-W29 id');
assert.strictEqual(global.Date, RealDate, 'the real Date is restored after the frozen-clock probes');

// ============================================================================
//  weeklyBest / recordWeeklyBest — pure over meta, monotonic
// ============================================================================
const m = freshMeta();
assert.deepStrictEqual(m.weekly, {}, 'freshMeta seeds weekly = {}');
assert.strictEqual(weeklyBest(m, '2026-W29'), 0, 'no best on a fresh meta');
assert.strictEqual(recordWeeklyBest(m, '2026-W29', 5000), 5000, 'records the first score');
assert.strictEqual(recordWeeklyBest(m, '2026-W29', 3000), 5000, 'a lower score never regresses the best');
assert.strictEqual(recordWeeklyBest(m, '2026-W29', 8200), 8200, 'a higher score updates the best');
assert.strictEqual(weeklyBest(m, '2026-W29'), 8200, 'best reads back');
assert.strictEqual(weeklyBest(m, '2026-W30'), 0, 'a different week is unaffected');
assert.strictEqual(weeklyBest(null, '2026-W29'), 0, 'null meta -> 0 (no throw)');

// ============================================================================
//  Meta heal — a legacy save missing `weekly` gains it on load; progression untouched
// ============================================================================
const legacy = { v: META_VERSION, sp: 137, jets: { 'FT-1': true, 'F-22': true }, skins: { x: 1 }, perks: { hull: 2 }, ach: { firstBlood: true }, stars: { 'FT-1': 3 }, campaign: { op1: { furthest: 2 } }, callsign: 'VIPER', emblem: 'skull', patches: { a: 1 }, slot2: true, bossRushUnlocked: true, bossRushBest: 91 };
assert.ok(!('weekly' in legacy), 'the legacy save has no weekly field');
setMeta(legacy);
const healed = getMeta();
assert.deepStrictEqual(healed.weekly, {}, 'loadMeta heals: weekly defaults to {}');
assert.strictEqual(healed.sp, 137, 'progression preserved: sp');
assert.strictEqual(healed.perks.hull, 2, 'progression preserved: perks');
assert.strictEqual(healed.callsign, 'VIPER', 'progression preserved: callsign');
assert.strictEqual(healed.bossRushBest, 91, 'progression preserved: bossRushBest');
assert.strictEqual(healed.jets['F-22'], true, 'progression preserved: owned jets');
// a legacy save WITH weekly bests keeps them across load (no wipe)
setMeta(Object.assign(freshMeta(), { weekly: { '2026-W10': 4200 } }));
assert.strictEqual(getMeta().weekly['2026-W10'], 4200, 'existing weekly bests survive load');

console.log('ok - F8 weekly: ISO-week seed determinism + boundary, 2-modifier pick, no-clock rule, meta heal');
