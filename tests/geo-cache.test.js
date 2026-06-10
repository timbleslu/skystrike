'use strict';
const assert = require('assert');

// --- Production helper under test (mirror of js/entities.js cacheGeo/GEO_CACHE) ---
const GEO_CACHE = new Map();
function cacheGeo(key, factory) {
  if (!key) return factory();
  let g = GEO_CACHE.get(key);
  if (!g) { g = factory(); g.userData.shared = true; GEO_CACHE.set(key, g); }
  return g;
}

// fake geometry factory — each call returns a distinct object with a userData bag
let builds = 0;
const make = () => ({ id: ++builds, userData: {} });

// same key -> same object, factory runs once
const a1 = cacheGeo('su57:wing:0', make);
const a2 = cacheGeo('su57:wing:0', make);
assert.strictEqual(a1, a2, 'same key must return the same cached geometry');
assert.strictEqual(a1.userData.shared, true, 'cached geometry must be tagged shared');

// distinct keys -> distinct objects
const b = cacheGeo('su57:wing:1', make);
assert.notStrictEqual(a1, b, 'hero variant must be a distinct geometry');

// falsy key bypasses the cache entirely (no sharing, no shared tag)
const c1 = cacheGeo('', make);
const c2 = cacheGeo('', make);
assert.notStrictEqual(c1, c2, 'falsy key must bypass cache');
assert.strictEqual(c1.userData.shared, undefined, 'bypassed geometry must not be tagged shared');

console.log('ok - cacheGeo shares by key, varies by key, bypasses on falsy key');
