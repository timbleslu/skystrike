'use strict';
const assert = require('assert');
const { GFX_TIERS, resolveQuality } = require('../js/core.js');

// ---- tier list invariants ----
assert.deepStrictEqual(GFX_TIERS, ['auto', 'low', 'medium', 'high'], 'four tiers: auto/low/medium/high');

// ---- explicit settings pass through, ignoring the heuristic inputs ----
assert.strictEqual(resolveQuality('low', 1, false), 'low', "explicit 'low' wins on desktop");
assert.strictEqual(resolveQuality('low', 3, true), 'low', "explicit 'low' wins on a flagship phone");
assert.strictEqual(resolveQuality('medium', 1, false), 'medium', "explicit 'medium' wins on desktop");
assert.strictEqual(resolveQuality('medium', 4, true), 'medium', "explicit 'medium' wins on a touch device");
assert.strictEqual(resolveQuality('high', 1, true), 'high', "explicit 'high' wins on a touch device");
assert.strictEqual(resolveQuality('high', 4, false), 'high', "explicit 'high' wins regardless of dpr");

// ---- auto heuristic: touch → MEDIUM (Track B behaviour change, was 'low'); desktop → high ----
assert.strictEqual(resolveQuality('auto', 1, true), 'medium', 'auto: dpr 1 touch -> medium (mobile floor, was low)');
assert.strictEqual(resolveQuality('auto', 2, true), 'medium', 'auto: dpr 2 touch -> medium (boundary)');
assert.strictEqual(resolveQuality('auto', 3, true), 'medium', 'auto: dpr 3 hi-dpr tablet/phone -> medium');
assert.strictEqual(resolveQuality('auto', 1, false), 'high', 'auto: desktop non-touch -> high');
assert.strictEqual(resolveQuality('auto', 2, false), 'high', 'auto: desktop dpr 2 non-touch -> high');

// ---- unknown / undefined setting falls back through the auto heuristic (never throws) ----
assert.strictEqual(resolveQuality(undefined, 1, true), 'medium', 'undefined behaves like auto on touch -> medium');
assert.strictEqual(resolveQuality('garbage', 4, false), 'high', 'unknown behaves like auto on desktop -> high');

// ---- resolver only ever yields the three render tiers, never the meta value 'auto' ----
for (const s of ['auto', 'low', 'medium', 'high', undefined, 'x']) {
  for (const dpr of [0.5, 1, 1.5, 2, 2.5, 3, 4]) {
    for (const touch of [true, false]) {
      const r = resolveQuality(s, dpr, touch);
      assert.ok(r === 'low' || r === 'medium' || r === 'high', 'resolveQuality returns a concrete tier for (' + s + ',' + dpr + ',' + touch + ')');
    }
  }
}

console.log('ok - gfx quality tier resolver (4 tiers, auto→medium on touch, explicit pass-through)');
