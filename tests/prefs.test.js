'use strict';
const assert = require('assert');

// ---- Node seams the browser supplies via load order (core.js clamp, roster.js JETS) + a store stub.
//      prefs.js references these INSIDE its fns (call-time), so they only need to exist before we call. ----
global.clamp = require('../js/core.js').clamp;
global.JETS = require('../js/roster.js').JETS;
let _kv = {};
global.store = { get(k) { return k in _kv ? _kv[k] : null; }, set(k, v) { _kv[k] = String(v); } };

const { SETTINGS, settingById, loadHealed } = require('../js/prefs.js');

// ============================================================================
//  SETTINGS table integrity — ids/keys unique, defaults present, accept/parse/set total fns
// ============================================================================
assert.ok(Array.isArray(SETTINGS) && SETTINGS.length > 0, 'SETTINGS is a non-empty table');
const ids = SETTINGS.map(r => r.id);
assert.strictEqual(new Set(ids).size, ids.length, 'setting ids are unique');
const keys = SETTINGS.map(r => r.key);
assert.strictEqual(new Set(keys).size, keys.length, 'settings-blob keys are unique');
SETTINGS.forEach(r => {
  assert.ok('def' in r, 'row ' + r.id + ' has a default');
  assert.strictEqual(typeof r.accept, 'function', 'row ' + r.id + ' accept is a fn');
  assert.strictEqual(typeof r.parse, 'function', 'row ' + r.id + ' parse is a fn');
  assert.strictEqual(typeof r.set, 'function', 'row ' + r.id + ' set is a fn');
  assert.ok(r.apply === null || Array.isArray(r.apply), 'row ' + r.id + ' apply is null or a name array');
  // parse is TOTAL: defined on its own default, and never throws on garbage input
  assert.notStrictEqual(typeof r.parse(r.def), 'undefined', 'row ' + r.id + ' parse(def) is defined');
  assert.doesNotThrow(() => r.parse(undefined), 'row ' + r.id + ' parse(undefined) does not throw');
  assert.doesNotThrow(() => r.parse(null), 'row ' + r.id + ' parse(null) does not throw');
  // accept rejects a wrong-shaped value (a plain object is never a valid setting value)
  assert.strictEqual(r.accept({}), false, 'row ' + r.id + ' accept rejects a wrong-typed value');
});
console.log('ok - SETTINGS: ids/keys unique, defaults present, accept/parse/set total; parse never throws');

// ============================================================================
//  applySetting order encoding — the 'gfx' row encodes refreshGfxTier BEFORE applyGfxQuality
// ============================================================================
const gfx = settingById('gfx');
assert.ok(gfx, 'gfx row exists');
assert.strictEqual(gfx.key, 'gfxQuality', 'gfx row persists under the gfxQuality blob key');
assert.deepStrictEqual(gfx.apply, ['refreshGfxTier', 'applyGfxQuality'], 'gfx apply chain encodes tier-before-quality order');
assert.strictEqual(settingById('nope'), null, 'unknown id resolves to null');
console.log('ok - gfx row: apply chain encodes refreshGfxTier BEFORE applyGfxQuality');

// ============================================================================
//  loadHealed — missing -> fresh; partial -> filled (existing untouched); corrupt/null -> fresh
// ============================================================================
const fresh = () => ({ a: 0, b: 'x', c: false, d: {} });
// missing key -> a full fresh object
_kv = {};
assert.deepStrictEqual(loadHealed('k', fresh), { a: 0, b: 'x', c: false, d: {} }, 'missing key heals to fresh');
// partial save -> present values untouched, absent keys filled from fresh
_kv = { k: JSON.stringify({ a: 7, b: 'hi' }) };
assert.deepStrictEqual(loadHealed('k', fresh), { a: 7, b: 'hi', c: false, d: {} }, 'partial save: existing kept, missing filled');
// wrong-typed + null fields heal to the fresh default; correctly-typed ones are preserved
_kv = { k: JSON.stringify({ a: 'oops', b: null, c: true, d: {} }) };
assert.deepStrictEqual(loadHealed('k', fresh), { a: 0, b: 'x', c: true, d: {} }, 'wrong-typed/null heal; matching typeof preserved');
// corrupt JSON -> fresh
_kv = { k: '{ not json' };
assert.deepStrictEqual(loadHealed('k', fresh), { a: 0, b: 'x', c: false, d: {} }, 'corrupt JSON heals to fresh');
// explicit stored null -> fresh
_kv = { k: 'null' };
assert.deepStrictEqual(loadHealed('k', fresh), { a: 0, b: 'x', c: false, d: {} }, 'stored null heals to fresh');
console.log('ok - loadHealed: missing/corrupt/null -> fresh; partial -> filled; typeof/null heal, matching preserved');

// ---- opts.valid outer gate: a blob that fails the gate falls back to fresh WHOLESALE (the loadMeta pattern);
//      a passing gate heals in place and leaves un-modeled keys alone (never wipes progression like meta.sel) ----
const freshV = () => ({ v: 1, ok: true });
_kv = { k: JSON.stringify({ v: 1, ok: false, extra: 99 }) };
assert.deepStrictEqual(loadHealed('k', freshV), { v: 1, ok: false, extra: 99 }, 'default gate: valid object healed in place, extra keys survive');
assert.deepStrictEqual(loadHealed('k', freshV, { valid: o => !!o && o.ok === true }), { v: 1, ok: true }, 'failing valid gate -> fresh wholesale (extra dropped)');
console.log('ok - loadHealed: opts.valid rejects a bad blob -> fresh wholesale; a passing gate keeps un-modeled keys');
