'use strict';
// Guards the per-jet skin set (plain default + 2 designed liveries) + the paint resolver.
// ---- Node seams: stateful storage + dev toggle the browser supplies via globals.js ----
let _kv = {};
global.store = { get(k) { return k in _kv ? _kv[k] : null; }, set(k, v) { _kv[k] = String(v); } };
global.devUnlockAll = false;

const assert = require('assert');
const {
  SKINS, resolveSkin, resolveSkinPaint, jetPaint, selectedSkin, setSkin, skinOwned,
  freshMeta, loadMeta, saveMeta, META_KEY,
} = require('../js/meta.js');

function setMeta(obj) { _kv[META_KEY] = JSON.stringify(obj); loadMeta(); }

// The skinnable jets: the 7 textureless glTF exports.
const TEXTURELESS = ['FT-1', 'F-47', 'J-20', 'J-36', 'J-50', 'EFT', 'FA18'];

// ---- structure: exactly the 7 skinnable jets, 3 skins each ----
assert.deepStrictEqual(Object.keys(SKINS).sort(), TEXTURELESS.slice().sort(), 'SKINS keys are exactly the 7 skinnable jets');
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
console.log('ok - SKINS: 8 skinnable jets × (plain default + 2 designed zoned liveries)');

// ---- the 8 plain defaults read distinct ----
const defs = TEXTURELESS.map(id => SKINS[id][0].color);
assert.strictEqual(new Set(defs).size, TEXTURELESS.length, 'all 8 default colours are unique');
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

// ---- skins 2 & 3 are independent colour-block liveries (zones only — no decal/geo subsystem) ----
for (const id of TEXTURELESS) {
  const s2 = SKINS[id][1], s3 = SKINS[id][2];
  assert.ok(!s2.decal && !s2.geo, id + ' skin 2 is pure colour-block (no decal/geo)');
  assert.ok(!s3.decal && !s3.geo, id + ' skin 3 is pure colour-block (no decal/geo)');
  // both designed skins must differ as colourways: base colour OR accent distinct
  assert.ok(s2.color !== s3.color || s2.accent !== s3.accent, id + ' skins 2 & 3 are distinct colourways');
}
console.log('ok - skins 2 & 3 are independent colour-block liveries');

// ---- resolveSkinPaint carries zones for a designed skin, null for default; no decal/geo fields ----
const s3paint = resolveSkinPaint({ id: 'EFT', color: 0x111111, accent: 0x222222 }, SKINS['EFT'][2].id);
assert.ok(s3paint.zones && Object.keys(s3paint.zones).length, 'resolveSkinPaint forwards the skin-3 zones');
assert.strictEqual(s3paint.decal, undefined, 'resolveSkinPaint no longer carries a decal field');
assert.strictEqual(s3paint.geo, undefined, 'resolveSkinPaint no longer carries a geo field');
console.log('ok - resolveSkinPaint carries zones for designed skins, no decal/geo');

// ---- resolveSkin: THE deep interface — jetPaint is a thin convenience over it, explicit ids resolve directly ----
assert.strictEqual(typeof resolveSkin, 'function', 'resolveSkin is exported as the single deep entry point');
assert.strictEqual(typeof selectedSkin, 'function', 'selectedSkin is exported so callers need not go through jetPaint');
setMeta(freshMeta());
const rsJet = { id: 'FT-1', color: 0x999999, accent: 0x888888 };
// jetPaint(jet) === resolveSkin(jet, selectedSkin(jet.id)) for the selected skin
assert.deepStrictEqual(jetPaint(rsJet), resolveSkin(rsJet, selectedSkin('FT-1')), 'jetPaint equals resolveSkin for the selected skin');
// resolveSkin resolves an EXPLICIT non-selected skin id directly (no equip needed)
const otherId = SKINS['FT-1'][1].id;
assert.notStrictEqual(selectedSkin('FT-1'), otherId, 'the designed skin is not the selected one');
const explicit = resolveSkin(rsJet, otherId);
assert.deepStrictEqual(explicit, resolveSkinPaint(rsJet, otherId), 'resolveSkin matches the resolveSkinPaint alias');
assert.ok(explicit.zones && Object.keys(explicit.zones).length, 'resolveSkin resolves the explicit non-selected designed livery');
console.log('ok - resolveSkin: deep entry point — jetPaint thin over it, explicit ids resolve directly');

console.log('ALL SKIN TESTS PASS');
