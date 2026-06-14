'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ---- in-memory storage seam so the mirrored persistence fns run under Node ----
let _kv = {};
const store = { get(k) { return k in _kv ? _kv[k] : null; }, set(k, v) { _kv[k] = String(v); } };

// ============================================================================
//  Mirrors of js/meta.js star helpers (byte-identity guard at the bottom).
//  Pieces of the meta layer the star fns depend on are mirrored too (freshMeta
//  / validMeta with the new stars field; STARTER_JETS / META_VERSION / keys).
// ============================================================================
const META_KEY = 'skystrike_meta';
const META_VERSION = 1;
let meta = null;
const STARTER_JETS = ['FT-1', 'F-22', 'SU-57'];

// star objectives per run -------------------------------------------------------
const STAR_KILL_FRAC = 0.6;   // ≥60% of the wave-scaled expected kills earns the kills star
function evalStars(run, player) {
  if (!run) return 0;
  var stars = 0;
  var waves = Math.max(1, run.waveReached || 1);
  var expected = waves * 4;
  var kills = (run.kills || 0) + (run.ground || 0) + (run.boss || 0);
  if (kills / expected >= STAR_KILL_FRAC) stars++;          // kill efficiency
  if ((run.cleanWaves || 0) >= 1) stars++;                  // a full wave with no damage taken
  if ((run.missions || 0) >= 1) stars++;                    // objectives / pilots rescued
  return stars;
}
function bestStars(m, jetId, stars) {
  if (!m || !jetId) return stars > 0 ? stars : 0;
  if (!m.stars) m.stars = {};
  var prev = m.stars[jetId] || 0;
  var best = stars > prev ? stars : prev;
  m.stars[jetId] = best;
  return best;
}

function freshMeta() {
  const jets = {};
  for (var i = 0; i < STARTER_JETS.length; i++) jets[STARTER_JETS[i]] = true;
  return { v: META_VERSION, sp: 0, jets: jets, skins: {}, perks: {}, ach: {}, stars: {}, callsign: '', emblem: 'wings', patches: {} };
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
  // heal legacy saves missing stars (F6) — keep progression, never wipe
  if (!meta.stars || typeof meta.stars !== 'object') meta.stars = {};
}
function saveMeta() { try { store.set(META_KEY, JSON.stringify(meta)); } catch (e) {} }

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
//  bestStars: keeps the BEST per jet, never regresses, persists across runs
// ============================================================================
meta = freshMeta();
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

// persistence round-trip: the per-jet best survives save -> load
meta = freshMeta(); bestStars(meta, 'F-22', 3); bestStars(meta, 'SU-57', 2); saveMeta();
meta = null; loadMeta();
assert.strictEqual(meta.stars['F-22'], 3, 'F-22 star best persisted across load');
assert.strictEqual(meta.stars['SU-57'], 2, 'SU-57 star best persisted across load');
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
assert.strictEqual(meta.sp, 5, 'legacy save loads as-is — SP/progression preserved, NOT reset to a fresh meta');
assert.ok(meta.stars && typeof meta.stars === 'object', 'loaded meta has a healed stars map');
console.log('ok - validMeta stays lenient; a stars-less legacy save loads with progression intact and heals stars');

// ============================================================================
//  byte-identity guard: mirrored fns must match js/meta.js verbatim (ws-insensitive)
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
for (const fn of ['evalStars', 'bestStars', 'validMeta', 'freshMeta']) {
  const mine = norm(eval('(' + fn + ').toString()').replace(/^[^(]*\(/, 'function ' + fn + '('));
  const theirs = norm(bodyOf(fn, src));
  assert.strictEqual(strip(theirs), strip(mine), fn + ' in meta.js must match the mirror (ignoring whitespace)');
}
// the kill-fraction tunable + the stars field must be present in source
assert.ok(/const STAR_KILL_FRAC\s*=\s*0\.6/.test(src), 'meta.js defines STAR_KILL_FRAC = 0.6');
assert.ok(/stars:\s*\{\}/.test(src), 'meta.js freshMeta seeds an empty stars map');
console.log('ok - meta.js star mirrors (evalStars/bestStars/validMeta/freshMeta) match source');
