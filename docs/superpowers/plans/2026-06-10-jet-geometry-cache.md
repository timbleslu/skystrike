# Jet Geometry Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the wave-spawn freeze by triangulating each jet shape's geometry once and sharing it across all instances, instead of rebuilding LatheGeometry + ExtrudeGeometry on every enemy spawn.

**Architecture:** Add a module-level `GEO_CACHE` Map and a `cacheGeo(key, factory)` accessor in `js/entities.js`. Route the expensive geometries (fuselage Lathe, wing/canard/htail/LERX/fin Extrudes) through it, keyed by `shapeId:part:hero`. Geometry-space transforms move inside the factory so they run once. `disposeGroup` (`js/engine.js`) is updated to skip geometry tagged `userData.shared` so a death never frees geometry still used by living enemies — preserving the existing leak fix for per-instance geometry.

**Tech Stack:** Three.js (browser, global `THREE`), plain `<script>` load order globals→engine→entities→combat→ui→main, Node.js for unit tests (`node tests/*.test.js`, `assert` + `console.log('ok - ...')` pattern).

---

### Task 1: Geometry cache primitive (`cacheGeo` + `GEO_CACHE`)

**Files:**
- Test: `tests/geo-cache.test.js` (create)
- Modify: `js/entities.js` (add cache near top, after the file header comment on line 1)
- Modify: `js/entities.js` (tag `SHAPES` with ids, immediately after the `SHAPES` object literal closes — currently line 123)

- [ ] **Step 1: Write the failing test**

Create `tests/geo-cache.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/geo-cache.test.js`
Expected: PASS (this test mirrors the logic locally). It documents the contract. Confirm output `ok - cacheGeo shares by key, varies by key, bypasses on falsy key`. If it does not print ok, the mirrored logic is wrong — fix before continuing.

- [ ] **Step 3: Add the cache to `js/entities.js`**

Insert after line 1 (the `/* SKYSTRIKE — entities.js ... */` header), before `function extrudeWing`:

```javascript
/* ---------------- geometry cache ----------------
   Jet geometry is deterministic per (shape, hero). Triangulating LatheGeometry +
   ExtrudeGeometry on every spawn caused the wave-start freeze, so build each shape's
   geometry once and share it across all instances. Materials stay per-instance, so
   runtime colour/emissive mutations are unaffected. Cached geometry is tagged
   userData.shared so disposeGroup never frees geometry still used by living enemies.
   A falsy key bypasses the cache (defensive — every SHAPES entry has an id). */
const GEO_CACHE = new Map();
function cacheGeo(key, factory) {
  if (!key) return factory();
  let g = GEO_CACHE.get(key);
  if (!g) { g = factory(); g.userData.shared = true; GEO_CACHE.set(key, g); }
  return g;
}
```

- [ ] **Step 4: Tag every SHAPES entry with its id**

In `js/entities.js`, immediately after the `const SHAPES = { ... };` literal closes (currently line 123), add:

```javascript
/* stable id per shape — used as the geometry-cache key prefix */
Object.keys(SHAPES).forEach(k => { SHAPES[k].id = k; });
```

- [ ] **Step 5: Run the full test suite to confirm nothing broke**

Run: `node tests/geo-cache.test.js && node tests/spawn-queue.test.js && node tests/dispose-group.test.js`
Expected: all print their `ok - ...` lines, no assertion errors.

- [ ] **Step 6: Commit**

```bash
git add tests/geo-cache.test.js js/entities.js
git commit -m "perf: add geometry cache primitive + shape ids"
```

---

### Task 2: disposeGroup skips shared geometry

**Files:**
- Modify: `tests/dispose-group.test.js` (extend with a shared-geometry case)
- Modify: `js/engine.js:324-333` (the `disposeGroup` function)

- [ ] **Step 1: Write the failing test**

Replace the entire mirror + assertions in `tests/dispose-group.test.js` with this (keep the file's `'use strict'` / `require('assert')` header):

```javascript
'use strict';
const assert = require('assert');

// --- Production helper under test (mirror of js/engine.js disposeGroup) ---
function disposeGroup(group) {
  if (!group) return;
  group.traverse(o => {
    if (o.isMesh || o.isSprite) {
      if (o.geometry && o.geometry.dispose && !o.geometry.userData.shared) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) if (m && m.dispose) m.dispose();   // note: do NOT dispose m.map (shared textures)
    }
  });
}

// fakes
const mkGeo = (shared) => ({ disposed: false, userData: shared ? { shared: true } : {}, dispose() { this.disposed = true; } });
const mkMat = (withMap) => ({ disposed: false, map: withMap ? { disposed: false, dispose() { this.disposed = true; } } : null, dispose() { this.disposed = true; } });
function mkGroup(children) { return { traverse(fn) { for (const c of children) fn(c); } }; }

// per-instance geometry IS disposed; shared geometry is NOT; materials always disposed; textures never
const perInst = mkGeo(false), sharedG = mkGeo(true);
const mat1 = mkMat(false), mat2 = mkMat(true);
const group = mkGroup([
  { isMesh: true, geometry: perInst, material: mat1 },
  { isMesh: true, geometry: sharedG, material: mat2 },
]);
disposeGroup(group);

assert.strictEqual(perInst.disposed, true, 'per-instance geometry must be disposed');
assert.strictEqual(sharedG.disposed, false, 'shared geometry must NOT be disposed');
assert.strictEqual(mat1.disposed, true, 'material must be disposed');
assert.strictEqual(mat2.disposed, true, 'material with map must be disposed');
assert.strictEqual(mat2.map.disposed, false, 'texture (map) must NOT be disposed');
console.log('ok - disposeGroup skips shared geometry, frees per-instance geo + materials, spares textures');

// material array support
const arrMat = [mkMat(false), mkMat(false)];
const g2 = mkGroup([{ isSprite: true, geometry: mkGeo(false), material: arrMat }]);
disposeGroup(g2);
assert.ok(arrMat.every(m => m.disposed), 'all materials in an array must be disposed');
console.log('ok - multi-material array');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/dispose-group.test.js`
Expected: FAIL — the production `disposeGroup` in `js/engine.js` does not yet check `userData.shared`, but this test only mirrors the *new* logic, so it will actually PASS here. The real gate is Step 4 (the production edit). Confirm the mirror prints both `ok - ...` lines; if not, the mirror is wrong.

- [ ] **Step 3: Update production `disposeGroup` in `js/engine.js`**

Change line 328 from:

```javascript
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
```

to:

```javascript
      if (o.geometry && o.geometry.dispose && !o.geometry.userData.shared) o.geometry.dispose();
```

Also update the function's doc comment (lines 322-323) to:

```javascript
/* Free GPU geometry + materials of a removed object subtree. Skips geometry tagged
   userData.shared (cached jet geometry reused by living enemies) and textures (.map,
   shared/cached e.g. the drone glow sprite) — disposing either would corrupt others. */
```

- [ ] **Step 4: Run the full suite**

Run: `node tests/dispose-group.test.js && node tests/geo-cache.test.js && node tests/spawn-queue.test.js`
Expected: all `ok - ...` lines, no assertion errors.

- [ ] **Step 5: Commit**

```bash
git add tests/dispose-group.test.js js/engine.js
git commit -m "perf: disposeGroup skips shared (cached) geometry"
```

---

### Task 3: Route jet geometry through the cache

**Files:**
- Modify: `js/entities.js` — `extrudeWing` (lines 5-17), `buildFin` (lines 19-27), and the `buildJet` fuselage + call sites (lines 157-303)

No new Node unit test: this wiring needs Three.js + a WebGL context, so it is verified by the existing suite still passing plus the authoritative manual browser test in Task 4. The risky *logic* (cache + dispose) is already unit-tested in Tasks 1-2.

- [ ] **Step 1: Add a cache key param to `extrudeWing`**

Replace `extrudeWing` (lines 5-17) with:

```javascript
function extrudeWing(pts, thick, mat, y, bevelSeg, cacheKey) {
  const bs = bevelSeg || 1;
  const geo = cacheGeo(cacheKey, () => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    const g2 = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.42, bevelSize: 0.22, bevelSegments: bs, steps: 1, curveSegments: bs > 1 ? 8 : 4 });
    g2.translate(0, 0, -thick / 2); g2.rotateX(Math.PI / 2);   // geometry-space transforms run once
    return g2;
  });
  const grp = new THREE.Group();
  const r = new THREE.Mesh(geo, mat);
  const l = new THREE.Mesh(geo, mat); l.scale.x = -1;
  grp.add(r, l); grp.position.y = y || 0; return grp;
}
```

- [ ] **Step 2: Add a cache key param to `buildFin`**

Replace `buildFin` (lines 19-27) with:

```javascript
function buildFin(p, mat, bevelSeg, cacheKey) {
  const th = p.thick || 0.3;
  const bs = bevelSeg || 1;
  const geo = cacheGeo(cacheKey, () => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(p.base, 0); sh.lineTo(p.sweep + p.tip, p.h); sh.lineTo(p.sweep, p.h); sh.closePath();
    const g2 = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: bs, steps: 1, curveSegments: bs > 1 ? 6 : 3 });
    g2.translate(0, 0, -th / 2); g2.rotateY(-Math.PI / 2);   // geometry-space transforms run once
    return g2;
  });
  return new THREE.Mesh(geo, mat);
}
```

- [ ] **Step 3: Add cache-key locals at the top of `buildJet`**

In `buildJet`, immediately after `const bs = hero ? 3 : 1;` (line 160), add:

```javascript
  const SID = cfg.id || '';                 // '' => cacheGeo bypasses (no shared key)
  const H = hero ? 1 : 0;
  const gk = part => (SID ? SID + ':' + part + ':' + H : '');   // geometry cache key for this shape/part/hero
```

- [ ] **Step 4: Cache the fuselage LatheGeometry**

Replace lines 184-185:

```javascript
  const fgeo = new THREE.LatheGeometry(prof, RING); fgeo.rotateX(Math.PI / 2);
  const fuse = new THREE.Mesh(fgeo, body); fuse.scale.set(1, flat, 1); g.add(fuse);
```

with:

```javascript
  const fgeo = cacheGeo(gk('fuse'), () => { const lg = new THREE.LatheGeometry(prof, RING); lg.rotateX(Math.PI / 2); return lg; });
  const fuse = new THREE.Mesh(fgeo, body); fuse.scale.set(1, flat, 1); g.add(fuse);
```

- [ ] **Step 5: Pass keys at the LERX, wing, canard, htail call sites**

In `buildJet`, update these four lines (currently 251, 255, 256, 257):

LERX (line 251):
```javascript
    g.add(extrudeWing(lpts, 0.28, body, wy + 0.14, bs, gk('lerx')));
```
wing (line 255):
```javascript
  g.add(extrudeWing(cfg.wing, cfg.wingThick || 0.5, body, wy, bs, gk('wing')));
```
canard (line 256):
```javascript
  if (cfg.canard) g.add(extrudeWing(cfg.canard, 0.34, body, cfg.canardY != null ? cfg.canardY : 0.12, bs, gk('canard')));
```
htail (line 257):
```javascript
  if (cfg.htail) g.add(extrudeWing(cfg.htail, 0.36, body, cfg.htailY != null ? cfg.htailY : -0.1, bs, gk('htail')));
```

- [ ] **Step 6: Pass keys at the vertical-tail and ventral-fin call sites**

Vertical tails — update the `buildFin` call inside the `for (const s of finXs)` loop (currently line 280):
```javascript
      const f = buildFin(vt, body, bs, gk('vtail'));
```
Both fins (s = -1 and s = 1) intentionally share one geometry; they differ only by per-mesh position/rotation, so a single `gk('vtail')` key is correct.

Ventral fins (J-20) — update the `buildFin` call inside that loop (currently line 299):
```javascript
      const f = buildFin(vf, body, bs, gk('ventral'));
```

- [ ] **Step 7: Run the full suite (regression guard)**

Run: `node tests/geo-cache.test.js && node tests/spawn-queue.test.js && node tests/dispose-group.test.js`
Expected: all `ok - ...` lines. (These don't exercise buildJet but confirm no syntax/load breakage in the test mirrors.)

- [ ] **Step 8: Syntax-check the edited file**

Run: `node --check js/entities.js`
Expected: no output (exit 0). Any parse error must be fixed before committing.

- [ ] **Step 9: Commit**

```bash
git add js/entities.js
git commit -m "perf: route jet fuselage/wing/fin geometry through the cache"
```

---

### Task 4: Manual browser verification (authoritative)

**Files:** none.

This is the only test that exercises the real freeze. It is user-run.

- [ ] **Step 1: Open the game**

Run: `open index.html` (macOS) or load it in a browser.

- [ ] **Step 2: Record a Performance profile across wave transitions**

Open DevTools → Performance. Record while playing through at least 3 wave transitions, including boss wave 4. Spawn a drone swarm and an ACE if they appear.

- [ ] **Step 3: Confirm the pass criteria**

- No multi-frame stall when the WAVE / WAVE CLEAR banner appears.
- The very first spawn of a *new* shape may show one small build cost (cache miss); the second and later spawns of that shape must show no comparable cost.
- Frame time stays smooth "when lots going on" relative to before (note: render draw-call cost is unchanged and out of scope — if heavy-scene jank remains, that is the deferred merge work, not a regression).
- Heap/GPU memory stays flat across kills (the leak fix still holds: per-instance geometry + materials are freed; shared geometry is a bounded fixed cache).

- [ ] **Step 4: Report result**

If pass → proceed to finish the branch. If a stall remains at spawn, capture the Performance flame chart's longest frame and report which function dominates (re-enter systematic-debugging).

---

## Self-Review

**Spec coverage:**
- Cache mechanism (`GEO_CACHE` + `cacheGeo`) → Task 1. ✓
- Cached geometries (fuselage Lathe, wing/canard/htail/LERX Extrude, vtail/ventral fin Extrude) → Task 3 Steps 1-6. ✓
- Cheap primitives not cached → honored (only Lathe/Extrude touched). ✓
- Threading key via `cfg.id` + part + hero, tag `SHAPES[k].id` → Task 1 Step 4, Task 3 Step 3. ✓
- Transforms-inside-factory invariant → Task 3 Steps 1, 2, 4 (translate/rotate moved into closures). ✓
- disposeGroup skips shared geometry → Task 2. ✓
- Cache persists across games, never cleared → no reset code added; module-level Map left untouched by `startGame`/`clearArena`. ✓
- Testing (unit for cache + dispose, manual for freeze) → Tasks 1, 2, 4. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type/name consistency:** `cacheGeo(key, factory)`, `GEO_CACHE`, `geo.userData.shared`, `gk(part)`, `SID`, `H` used identically across Tasks 1-3. `extrudeWing(...cacheKey)` / `buildFin(...cacheKey)` signatures match their call sites. disposeGroup's `userData.shared` check matches the tag set in `cacheGeo`.
