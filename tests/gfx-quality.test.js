'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ---- mirror of js/globals.js graphics-quality core (keep byte-identical between the MIRROR markers) ----
// === MIRROR START (globals.js gfx-quality core) ===
const GFX_TIERS = ['auto', 'low', 'high'];
// PURE — resolve the effective render tier ('low'|'high') from the gfxQuality setting plus a
// cheap device heuristic. Explicit 'low'/'high' pass through untouched; 'auto' (and any unknown
// value) picks 'low' for touch devices on a non-flagship pixel ratio (dpr <= 2 — the mid-range
// phone signature), else 'high'. Deterministic + side-effect free so it is unit-testable; the
// fps sample (which headless cannot measure) is layered on at the call site, never in here.
function resolveQuality(setting, dpr, isTouch) {
  if (setting === 'low' || setting === 'high') return setting;
  return (isTouch && dpr <= 2) ? 'low' : 'high';
}
// === MIRROR END ===

// ---- tier list invariants ----
assert.deepStrictEqual(GFX_TIERS, ['auto', 'low', 'high'], 'three tiers: auto/low/high');

// ---- explicit settings pass through, ignoring the heuristic inputs ----
assert.strictEqual(resolveQuality('low', 1, false), 'low', "explicit 'low' wins on desktop");
assert.strictEqual(resolveQuality('low', 3, true), 'low', "explicit 'low' wins on a flagship phone");
assert.strictEqual(resolveQuality('high', 1, true), 'high', "explicit 'high' wins on a touch device");
assert.strictEqual(resolveQuality('high', 4, false), 'high', "explicit 'high' wins regardless of dpr");

// ---- auto heuristic: only mid-range touch devices drop to low ----
assert.strictEqual(resolveQuality('auto', 1, true), 'low', 'auto: dpr 1 touch -> low (mid-range phone)');
assert.strictEqual(resolveQuality('auto', 2, true), 'low', 'auto: dpr 2 touch -> low (boundary stays low)');
assert.strictEqual(resolveQuality('auto', 3, true), 'high', 'auto: dpr 3 touch -> high (flagship phone)');
assert.strictEqual(resolveQuality('auto', 1, false), 'high', 'auto: desktop non-touch -> high');
assert.strictEqual(resolveQuality('auto', 2, false), 'high', 'auto: desktop dpr 2 non-touch -> high');

// ---- unknown / undefined setting falls back through the auto heuristic (never throws) ----
assert.strictEqual(resolveQuality(undefined, 1, true), 'low', 'undefined behaves like auto on touch');
assert.strictEqual(resolveQuality('garbage', 4, false), 'high', 'unknown behaves like auto on desktop');

// ---- resolver only ever yields the two render tiers, never the meta value 'auto' ----
for (const s of ['auto', 'low', 'high', undefined, 'x']) {
  for (const dpr of [0.5, 1, 1.5, 2, 2.5, 3, 4]) {
    for (const touch of [true, false]) {
      const r = resolveQuality(s, dpr, touch);
      assert.ok(r === 'low' || r === 'high', 'resolveQuality returns a concrete tier for (' + s + ',' + dpr + ',' + touch + ')');
    }
  }
}

// ---- byte-identity guard: the MIRROR block above must be character-for-character identical to js/globals.js ----
const gsrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'globals.js'), 'utf8');
const here = fs.readFileSync(__filename, 'utf8');
function mirrorBlock(src) {
  const a = src.indexOf('// === MIRROR START (globals.js gfx-quality core) ===');
  // search for END *after* START — globals.js holds several mirror blocks that all share the END marker
  const b = a === -1 ? -1 : src.indexOf('// === MIRROR END ===', a);
  assert.ok(a !== -1 && b !== -1 && b > a, 'MIRROR markers present');
  return src.slice(a, b);
}
assert.strictEqual(mirrorBlock(here), mirrorBlock(gsrc), 'gfx-quality MIRROR block is byte-identical with js/globals.js');

console.log('ok - gfx quality tier resolver (auto heuristic, explicit pass-through, byte-identical mirror)');
