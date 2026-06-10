# Jet Geometry Cache — Design

**Date:** 2026-06-10
**Branch:** `perf/jet-geometry-cache`
**Status:** Approved (design), pending implementation plan

## Problem

The game still freezes when a wave notification appears and "when there's a lot going on,"
despite the prior `fix/wave-spawn-freeze` work (frame-amortized spawning + enemy disposal).

### Root cause

`createEnemy` (`js/entities.js:540`) → `buildJet` (`js/entities.js:157`) rebuilds **all geometry
from scratch on every spawn**. Per enemy jet this triangulates:

- 1 `LatheGeometry` (fuselage surface of revolution)
- 4–5 **beveled `ExtrudeGeometry`** (wing, canard, htail, LERX, vertical fins) — earcut
  triangulation, the dominant CPU cost
- plus cheap primitives (Box/Cylinder/Cone/Sphere/Torus)

No geometry cache exists. Projectiles are pooled (`getBullet`/`BPOOL`, `ASSET.flareGeo`), but
enemy jets are not.

### Why the prior fix did not resolve it

Frame amortization (`SPAWN_PER_FRAME = 2`) only spread the triangulation spikes across frames
instead of eliminating them. Each spawned jet still triangulates 4–5 ExtrudeGeometries →
per-frame stall while the spawn queue drains → stutter exactly when the WAVE banner appears.
Amortization was a band-aid; the real cost was never removed.

Geometry for a given `SHAPES[key]` is **deterministic** — identical across every enemy of that
shape. Only materials vary at runtime (`userData.body` color/emissive, ace gold tint, engine glow
colors). Therefore: build geometry once per shape, share it across instances, keep materials
per-instance.

## Approach (selected)

**Geometry cache.** Surgical, directly removes the triangulation spike, no visual or gameplay
change. Render draw-call count is unchanged (out of scope).

Rejected alternatives:
- *Merge + cache* (mergeGeometries → 1 draw call/jet): bigger perf win but more invasive; engine
  glow/flame and boss core/ring animate per-frame and cannot be merged. Deferred.
- *Cache then measure*: incremental, but adds a second browser-test cycle; the cache is the
  agreed first step regardless.

## Design

### Cache mechanism

Module-level cache plus accessor:

```
const GEO_CACHE = new Map();
function cacheGeo(key, factory) {
  let g = GEO_CACHE.get(key);
  if (!g) { g = factory(); g.userData.shared = true; GEO_CACHE.set(key, g); }
  return g;
}
```

`factory()` runs once per key and performs **all geometry-space transforms inside the closure**
(see invariant below). Subsequent spawns reuse the same geometry object.

### What is cached (triangulation cost only)

| Geometry | Where | Cache key |
|----------|-------|-----------|
| Fuselage `LatheGeometry` | `buildJet` | `${cfg.id}:fuse:${hero}` |
| Wing/canard/htail/LERX `ExtrudeGeometry` | `extrudeWing` | `${cfg.id}:<part>:${hero}` |
| Vertical / ventral fin `ExtrudeGeometry` | `buildFin` | `${cfg.id}:<fin>:${hero}` |

Cheap primitives are **not** cached (Box/Cylinder/Cone/Sphere/Torus; drone Octahedron; boss
Icosahedron/Torus; ground). Their construction cost is negligible and skipping them keeps the
change small and the key surface minimal.

### Threading the cache key

- Tag every shape once: `Object.keys(SHAPES).forEach(k => SHAPES[k].id = k);`
- `buildJet` passes `cfg.id`, a part name, and the `hero` flag to `extrudeWing` / `buildFin`.
- Player and wingmen are built with `hero = true`; enemies with `hero = false`. The two are keyed
  separately because hero geometry is higher-poly (more profile/ring segments, extra detail).
- Aces reuse a regular fighter shape's geometry (geometry identical; only material tint differs).

### Critical invariant: transforms inside the factory

Several geometries are mutated in geometry space today (`fgeo.rotateX(Math.PI/2)`,
`geo.translate(...)`, `geo.rotateX/rotateY` in `extrudeWing`/`buildFin`). With a shared geometry,
applying these on reuse would **double-transform**. All geometry-space transforms must move
**inside the cached factory** so they run exactly once. Mesh-space transforms (`mesh.scale`,
`mesh.position`, `mesh.rotation`, `l.scale.x = -1`) remain per-instance and are unaffected.

### disposeGroup interaction (the key fix)

`disposeGroup` (`js/engine.js`) currently disposes geometry + materials and skips textures. With
shared geometry, disposing it on one enemy's death would corrupt every living enemy of that shape.
New rule:

```
for each mesh/sprite:
  if geometry && !geometry.userData.shared -> geometry.dispose()   // per-instance geo still freed
  dispose each material (skip material.map textures)               // unchanged
```

- Shared jet geometry (`userData.shared === true`) is **never** disposed.
- Per-instance geometry (drone Octahedron/Icosahedron/Box, boss core/ring, ground) is **still**
  disposed → the GPU/heap leak fix from `fix/wave-spawn-freeze` stays intact.
- Materials are per-instance and still disposed on death → no material leak.

### Cache lifetime

`GEO_CACHE` is module-level and **persists across games** — that is the point (no rebuild on
restart). It is never cleared on reset/`clearArena`. Bounded by shape count (~13 shapes × hero
flag × parts), so it cannot grow unbounded — a fixed cache, not a leak.

## Testing

- **Unit (node):** extend the existing test pattern. Verify `cacheGeo` returns the *same* geometry
  object for repeated calls with one key, distinct objects for distinct keys, and that the returned
  geometry carries `userData.shared === true`. Verify the disposeGroup rule: shared geometry is not
  disposed, non-shared geometry is, materials always disposed, textures never.
- **Manual (authoritative, user-run):** open `index.html`, DevTools Performance, play 3+ wave
  transitions including boss wave 4. Confirm no multi-frame stall when the WAVE banner appears,
  waves appear within ~1s, heap/GPU flat across kills. First spawn of a new shape may show a single
  small build cost (cache miss); subsequent spawns of that shape must not.

## Out of scope

- Render draw-call reduction (geometry merging) — separate future work if render, not spawn, is
  still the bottleneck after this change.
- Tech-tree DOM rebuild hitch at WAVE CLEAR (`openTechScreen` → `renderTechTree`) — a separate,
  smaller, paused-frame cost.
