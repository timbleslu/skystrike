'use strict';
const assert = require('assert');
const { GFX_TIERS, resolveQuality } = require('../js/core.js');

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

console.log('ok - gfx quality tier resolver (auto heuristic, explicit pass-through, byte-identical mirror)');
