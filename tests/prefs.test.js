'use strict';
const assert = require('assert');

global.clamp = require('../js/core.js').clamp;
global.JETS = require('../js/roster.js').JETS;
let _kv = {};
global.store = { get(k) { return k in _kv ? _kv[k] : null; }, set(k, v) { _kv[k] = String(v); } };

const { SETTINGS, settingById, loadHealed } = require('../js/prefs.js');

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
  assert.notStrictEqual(typeof r.parse(r.def), 'undefined', 'row ' + r.id + ' parse(def) is defined');
  assert.doesNotThrow(() => r.parse(undefined), 'row ' + r.id + ' parse(undefined) does not throw');
  assert.doesNotThrow(() => r.parse(null), 'row ' + r.id + ' parse(null) does not throw');
  assert.strictEqual(r.accept({}), false, 'row ' + r.id + ' accept rejects a wrong-typed value');
});
console.log('ok - SETTINGS: ids/keys unique, defaults present, accept/parse/set total; parse never throws');

const gfx = settingById('gfx');
assert.ok(gfx, 'gfx row exists');
assert.strictEqual(gfx.key, 'gfxQuality', 'gfx row persists under the gfxQuality blob key');
assert.deepStrictEqual(gfx.apply, ['refreshGfxTier', 'applyGfxQuality'], 'gfx apply chain encodes tier-before-quality order');
assert.strictEqual(settingById('nope'), null, 'unknown id resolves to null');
console.log('ok - gfx row: apply chain encodes refreshGfxTier BEFORE applyGfxQuality');

const fresh = () => ({ a: 0, b: 'x', c: false, d: {} });
_kv = {};
assert.deepStrictEqual(loadHealed('k', fresh), { a: 0, b: 'x', c: false, d: {} }, 'missing key heals to fresh');
_kv = { k: JSON.stringify({ a: 7, b: 'hi' }) };
assert.deepStrictEqual(loadHealed('k', fresh), { a: 7, b: 'hi', c: false, d: {} }, 'partial save: existing kept, missing filled');
_kv = { k: JSON.stringify({ a: 'oops', b: null, c: true, d: {} }) };
assert.deepStrictEqual(loadHealed('k', fresh), { a: 0, b: 'x', c: true, d: {} }, 'wrong-typed/null heal; matching typeof preserved');
_kv = { k: '{ not json' };
assert.deepStrictEqual(loadHealed('k', fresh), { a: 0, b: 'x', c: false, d: {} }, 'corrupt JSON heals to fresh');
_kv = { k: 'null' };
assert.deepStrictEqual(loadHealed('k', fresh), { a: 0, b: 'x', c: false, d: {} }, 'stored null heals to fresh');
console.log('ok - loadHealed: missing/corrupt/null -> fresh; partial -> filled; typeof/null heal, matching preserved');

const freshV = () => ({ v: 1, ok: true });
_kv = { k: JSON.stringify({ v: 1, ok: false, extra: 99 }) };
assert.deepStrictEqual(loadHealed('k', freshV), { v: 1, ok: false, extra: 99 }, 'default gate: valid object healed in place, extra keys survive');
assert.deepStrictEqual(loadHealed('k', freshV, { valid: o => !!o && o.ok === true }), { v: 1, ok: true }, 'failing valid gate -> fresh wholesale (extra dropped)');
console.log('ok - loadHealed: opts.valid rejects a bad blob -> fresh wholesale; a passing gate keeps un-modeled keys');
