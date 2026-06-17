'use strict';
// Guards the per-jet skin set (plain default + 2 designed liveries) + the paint resolver.
// ---- Node seams: stateful storage + dev toggle the browser supplies via globals.js ----
let _kv = {};
global.store = { get(k) { return k in _kv ? _kv[k] : null; }, set(k, v) { _kv[k] = String(v); } };
global.devUnlockAll = false;

const assert = require('assert');
const {
  SKINS, resolveSkinPaint, jetPaint, selectedSkin, setSkin, skinOwned,
  freshMeta, loadMeta, saveMeta, META_KEY,
} = require('../js/meta.js');

function setMeta(obj) { _kv[META_KEY] = JSON.stringify(obj); loadMeta(); }

const TEXTURELESS = ['FT-1', 'F-47', 'J-20', 'J-36', 'J-50', 'EFT', 'FA18'];

// ---- structure: exactly the 7 textureless jets, 3 skins each ----
assert.deepStrictEqual(Object.keys(SKINS).sort(), TEXTURELESS.slice().sort(), 'SKINS keys are exactly the 7 textureless jets');
for (const id of TEXTURELESS) {
  const list = SKINS[id];
  assert.strictEqual(list.length, 3, id + ' has exactly 3 skins (default + 2 designed)');
  // skin 1 = plain default: real colour + accent, NO zones (fast path)
  const def = list[0];
  assert.strictEqual(def.id, 'default', id + ' first skin is `default`');
  assert.strictEqual(typeof def.color, 'number', id + ' default carries a solid colour');
  assert.strictEqual(typeof def.accent, 'number', id + ' default carries an accent');
  assert.ok(!def.zones, id + ' default has no pattern (plain)');
  // skins 2 & 3 = designed liveries: accent + a zones map (multi-zone paint)
  for (let s = 1; s < 3; s++) {
    const sk = list[s];
    assert.strictEqual(typeof sk.id, 'string', id + ' designed skin ' + s + ' has an id');
    assert.notStrictEqual(sk.id, 'default', id + ' designed skin ' + s + ' is not `default`');
    assert.strictEqual(typeof sk.accent, 'number', id + ' designed skin ' + s + ' has an accent (afterburner)');
    assert.ok(sk.zones && typeof sk.zones === 'object' && Object.keys(sk.zones).length >= 2, id + ' designed skin ' + s + ' carries a multi-zone livery');
  }
  // the two designed ids differ (distinct liveries, not a repeat)
  assert.notStrictEqual(list[1].id, list[2].id, id + ' skins 2 & 3 are distinct');
}
console.log('ok - SKINS: 7 textureless jets × (plain default + 2 designed zoned liveries)');

// ---- the 7 plain defaults read distinct ----
const defs = TEXTURELESS.map(id => SKINS[id][0].color);
assert.strictEqual(new Set(defs).size, TEXTURELESS.length, 'all 7 default colours are unique');
console.log('ok - default skins are unique per jet');

// ---- resolveSkinPaint: ownership-agnostic descriptor (color/accent/zones) ----
const ft1 = { id: 'FT-1', color: 0x111111, accent: 0x222222 };
const def = resolveSkinPaint(ft1, 'default');
assert.strictEqual(def.color, SKINS['FT-1'][0].color, 'default resolves the plain colour');
assert.strictEqual(def.zones, null, 'default has null zones (plain fast path)');
const designed = resolveSkinPaint(ft1, SKINS['FT-1'][1].id);
assert.ok(designed.zones && Object.keys(designed.zones).length, 'designed skin resolves its zones map');
assert.strictEqual(typeof designed.accent, 'number', 'designed skin resolves an accent');
const unknown = resolveSkinPaint(ft1, 'no-such-skin');
assert.strictEqual(unknown.color, ft1.color, 'unknown id falls back to the jet stock colour');
assert.strictEqual(unknown.zones, null, 'unknown id has null zones');
console.log('ok - resolveSkinPaint: plain default / zoned designed / stock fallback');

// ---- gameplay paint is OWNED-ONLY: an unowned skin can never persist into jetPaint ----
setMeta(freshMeta());
const jetObj = { id: 'FT-1', color: 0x999999, accent: 0x888888 };
const designedId = SKINS['FT-1'][1].id;
assert.strictEqual(skinOwned('FT-1', designedId), false, 'designed skin starts unowned');
assert.strictEqual(setSkin('FT-1', designedId), false, 'cannot equip an unowned skin');
assert.strictEqual(selectedSkin('FT-1'), 'default', 'selectedSkin stays default when the equip is rejected');
assert.strictEqual(jetPaint(jetObj).zones, null, 'jetPaint (gameplay) stays the plain default — no unowned leak');
console.log('ok - jetPaint is owned-only: unowned skin cannot persist into gameplay paint');

console.log('ALL SKIN TESTS PASS');
