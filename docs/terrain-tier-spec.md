# Terrain & Environment Tier Spec — Skystrike Track B

**Status:** Gate spec. Implementation-ready. The Senior Developer builds against this; the
Performance Benchmarker verifies against the per-tier acceptance checklists.
**Author:** Technical Artist (Track B)
**Date:** 2026-06-17
**Engine:** Three.js r159 (vendored), single HTML page, NO build step, NO ES modules —
all code is browser globals ordered by `<script>` tags in `index.html`.

---

## 0. Scope & Framing (read this first — the original problem statement is partly wrong)

Terrain, water, and the fog/weather pipeline **ALREADY EXIST and ship today**. This is an
**ENRICHMENT** spec plus the addition of **one new MEDIUM tier** and **one net-new feature
(ground objects)**. It is NOT a from-scratch rebuild. Concretely, against the verified
current code:

| Subsystem | Current state (verified in code) | This spec does |
|-----------|----------------------------------|----------------|
| **Terrain geometry** | `buildTerrain()` engine.js:267 — 26000×26000 `PlaneGeometry` @ 220×220 seg (~48.8k verts / ~97.7k tris), per-vertex `terrainH()` displacement, height-band vertex colors, analytic normals, 3-scale fbm albedo in `mat.onBeforeCompile` (302). | Raise **visual relief amplitude** + **segment density** at Med/High. Keep `terrainH` (gameplay/shadow source) untouched. LOW = current. |
| **Water** | `buildScenery()` engine.js:417 — 70000×70000 sea @ 200×200 (~40.4k verts / ~80k tris), custom `ShaderMaterial` (421): GPU vertex swell (3 summed sin waves), fresnel deep/horizon mix, sharp+broad sun glint, distance fog fade. Already ends with `#include <tonemapping_fragment>` + `#include <colorspace_fragment>`. | Add normals/reflectance/foam/extra octaves at Med/High. LOW = current. |
| **Fog/weather** | `applyWeather()` engine.js:517 sets `scene.fog.density = FOG_BASE * weather.fogMul` (FogExp2). `FOG_BASE = 0.000058` (globals.js:43). WEATHER table (core.js:22): clear=1.0, fog=3.0, storm=1.6. | Make active-weather fog **dramatically** cut draw distance + raise density. The "fog too subtle" complaint is real and quantified below. |
| **Ground objects** | **Do NOT exist** (no trees/forests/buildings/roads/rocks). | **NET-NEW.** Med: sparse rocks + occasional trees. High: forests/buildings/roads/rocks at regular density. InstancedMesh. |
| **Tier system** | `GFX_TIERS = ['auto','low','high']` (core.js:322). `resolveQuality(setting,dpr,isTouch)` (core.js:327): explicit low/high pass through; auto → `(isTouch && dpr<=2) ? 'low' : 'high'`. `gfxTier` resolves to `'low'\|'high'` (globals.js:512). | Add **MEDIUM**. Meta selector → `auto\|low\|medium\|high`. Resolved `gfxTier` → `'low'\|'medium'\|'high'`. |

**DO NOT TOUCH** sky / clouds / atmosphere / sun rig / time-of-day. `buildSky` (engine.js:231),
`buildClouds`, `applyTimeOfDay` (485), env map (574), halos, stars — all good, leave alone.
Tiering must **not** alter their cost or appearance.

### Hard invariants (from CLAUDE.md "Hard rules" — non-negotiable)
1. **No ES modules.** New code is browser globals; respect `<script>` load order. Pure,
   testable logic goes in `core.js` (CommonJS export footer) and is `require()`d by tests —
   NOT mirrored.
2. **Every custom `ShaderMaterial` fragment shader MUST end with**
   `#include <tonemapping_fragment>` **then** `#include <colorspace_fragment>` or it won't
   match the scene's ACES/sRGB grading. Applies to every new/edited water shader variant.
3. **Three.js is vendored** — never re-add CDN tags. r128-era calls go through engine.js shims.
4. **Disposal:** `disposeGroup` skips geometry AND materials tagged `userData.shared`. Anything
   multiple live objects share (or that survives an arena teardown) MUST be tagged
   `userData.shared`. Never dispose marker geometry.
5. **No direct `localStorage`** outside `js/storage.js`. The tier setting persists through the
   existing settings seam (it already does for `gfxQuality`).

### Stated assumptions
- **A1 (load-bearing):** `terrainH(x,z)` is the single source of truth for gameplay altitude
  reads, ground-object Y placement, and the sun shadow. **It is NOT scaled per tier.** Visual
  relief is added as a tier-only **vertex displacement layered on top of the `terrainH` base**,
  so collision/altitude/shadow geometry is identical across tiers. (Rationale in §2.)
- **A2:** Target floor hardware for HIGH is an **M1 MacBook (8-core GPU) at native res,
  `devicePixelRatio` clamped to 2** (already done: engine.js `setPixelRatio(Math.min(dpr,2))`).
  HIGH must sustain **≥60 fps** there. LOW targets a 2021-class mobile GPU (A14/Adreno 640-class).
- **A3:** Camera is `PerspectiveCamera(72, W/H, 1, 40000)` (engine.js:168). **far = 40000.**
  Fog — not the far plane — does the visible-distance work; the far plane stays 40000 at all tiers.
- **A4:** "Draw call" counts below are *static scene draw calls* (terrain + sea + ground-object
  InstancedMeshes + sky/clouds/sun rig). Per-frame entity/missile/HUD draw calls are out of scope
  and unchanged by this spec.

---

## 1. Tier model & plumbing

### 1.1 Meta selector → resolved tier
- **Meta selector** (`gfxQuality`, persisted): `auto | low | medium | high` (was `auto|low|high`).
- **Resolved tier** (`gfxTier`, live): `low | medium | high` (was `low|high`).

`core.js` — extend `GFX_TIERS` and `resolveQuality` (this is the pure seam; unit-test it):

```
GFX_TIERS = ['auto', 'low', 'medium', 'high']

resolveQuality(setting, dpr, isTouch):
  if setting in ('low','medium','high'): return setting        // explicit pass-through
  // setting === 'auto' (or unknown):
  if isTouch and dpr <= 2:  return 'medium'                    // ← BEHAVIOR CHANGE: was 'low'
  if isTouch:               return 'medium'                    // hi-dpr tablets/phones also Medium
  return 'high'                                                // desktop / non-touch
```

**BEHAVIOR CHANGE the implementer must make:** today auto→`low` for touch dpr≤2. Per the Track B
target ("AUTO: mobile → MEDIUM"), auto now resolves to **`medium`** for touch devices. Desktop is
unchanged (`high`). A user who explicitly wants the cheapest path selects `low` manually.

`refreshGfxTier()` (globals.js:520) is the impure call site — unchanged in shape; it already
calls `resolveQuality(gfxQuality, dpr, !!isTouch)` and may still fold an fps sample later. The
AUTO heuristic stays a cheap **load-time** device read (touch + dpr); no GPU-string sniffing is
required, but the implementer MAY additionally downgrade auto→`low` if a one-shot startup fps
probe (already contemplated in the refreshGfxTier comment) reports < 45 fps over the first second.

### 1.2 Every `gfxTier` consumer under the 3-value tier (COMPLETE enumeration)

There are exactly **three** functional consumers today (plus the new ground-object builder this
spec adds). Each must be made 3-value-safe. **Rule of thumb: treat `medium` like `high` for
everything *gameplay/model* related; treat it as its own middle point only for *environment cost*.**

| # | Location | Today | Prescription under low/medium/high |
|---|----------|-------|-------------------------------------|
| 1 | `applyGfxQuality()` engine.js:223 — `const low = gfxTier === 'low'`; shadow `1024/2048`, far `3000/6000` | binary | shadow map: **low 1024 / medium 2048 / high 2048**; shadow far: **low 3000 / medium 4500 / high 6000**. Replace the boolean with a 3-branch lookup (see §6.1). |
| 2 | `cullDistantEnemies()` main.js:497 — `const high = gfxTier !== 'low'` (low hides far meshes via `.visible`) | binary | Keep semantics: culling is a **low-only** mobile saver. `medium` and `high` both keep `high===true` (no aggressive enemy-mesh hiding). So `gfxTier !== 'low'` is already correct — **leave as-is**, it does the right thing for 3 values. Audit only. |
| 3 | glTF hero models — `loadJetModels()` entities.js:926 early-returns on Low; `buildJetOrGLTF`/`cloneJetGLTF` use `gfxTier !== 'low'` (entities.js:949) | binary | Treat **medium like high**: load glTF hero models on medium AND high; only `low` skips them. Current `!== 'low'` checks already produce this — **leave as-is**, audit only. (Medium devices are tablets/hi-dpr phones that can afford the hero meshes; the cheap path is explicit `low`.) |
| + | **NEW** `buildGroundObjects()` (this spec) | — | reads `gfxTier`: `low` → no-op; `medium` → sparse preset; `high` → full preset. See §4. |

**Net effect:** only consumer #1 needs a real 3-way change. #2 and #3 are already correct for a
3-value tier and need verification, not edits. This keeps the diff small and the risk low.

### 1.3 Tier switch at runtime
`applyGfxQuality()` is called on boot and on every settings change (engine.js:191). Extend it (or
add a sibling `applyEnvTier()` it calls) to also: rebuild terrain visual displacement, swap the sea
shader variant, set fog tier baseline, and (re)build/teardown ground objects. **All of this must be
idempotent** — safe to call repeatedly. Tier changes mid-session are allowed but may show a one-
frame hitch during rebuild; that is acceptable (matches the existing shadow-map realloc hitch).

---

## 2. Terrain relief per tier

### 2.1 The `terrainH` consistency rule (assumption A1, expanded)
`terrainH(x,z)` (engine.js:150) = 4 octaves, amplitudes **430 + 150 + 46 + 11 = 637 max relief**
over the 26 km extent. It is read by gameplay (altitude), ground-object placement, and the shadow
camera. **We do NOT scale `terrainH` per tier** — doing so would change collision/altitude/where-
the-ground-is between tiers, which is a gameplay correctness bug (a jet that clears a ridge on Low
clips it on High). **FLAGGED as the risky path; rejected.**

**Chosen approach (preferred):** keep `terrainH` exactly as the gameplay/shadow base. Add a
**tier-only visual displacement** `terrainDetailH(x,z)` that is applied **only to the rendered
terrain mesh vertices** on Medium/High, on top of the `terrainH` base. Because it is visual-only:
- Gameplay altitude reads still call `terrainH` → unchanged.
- The shadow camera still frames `terrainH`-height geometry → unchanged.
- Ground objects place Y from `terrainH` → they sit on the *gameplay* surface, not the visual
  bump. Keep the visual detail amplitude **small enough** that objects don't visibly float/sink
  (≤ ~60 units, see below) — within the existing per-vertex color-band tolerance.

`terrainDetailH` is a 2–3 octave higher-frequency fbm (rock/ridge break-up) added to the
displaced Y in `buildTerrain`'s vertex loop. It is computed in `core.js` (pure, testable) and
imported. **Amplitude is the tier knob.** The base 637-unit landform shape is identical at all
tiers; Med/High add finer relief and (via more segments) resolve the *existing* `terrainH`
landform more sharply — this is what makes a 26 km map read as "rolling hills" instead of "near-
flat from altitude": the gentle 637-unit field is currently under-sampled by a 118 m grid quad, so
ridgelines smear. Denser segments + a detail octave fix the read **without** moving the collision
surface.

### 2.2 Per-tier terrain budgets

`PlaneGeometry(SIZE, SIZE, SEG, SEG)` → verts = `(SEG+1)²`, tris = `2·SEG²`. SIZE stays **26000**.

| Tier | SEG | Verts `(SEG+1)²` | Tris `2·SEG²` | Quad edge (m) | `terrainDetailH` amplitude | fbm albedo (onBeforeCompile) |
|------|-----|------------------|---------------|---------------|----------------------------|------------------------------|
| **LOW** | **220** (current) | 48,841 | 96,800 | 118 | **0** (none — current look) | current 3-scale fbm |
| **MEDIUM** | **300** | 90,601 | 180,000 | 87 | **≤ 28 units**, 2-octave | current 3-scale fbm |
| **HIGH** | **400** | 160,801 | 320,000 | 65 | **≤ 60 units**, 3-octave | current 3-scale fbm (no change) |

> LOW is byte-for-byte the current terrain (SEG 220, no detail layer) — zero regression risk on
> mobile. MEDIUM ~1.86× LOW tris. HIGH ~3.3× LOW tris but still a **single draw call** (one mesh,
> one material). 320k tris in one indexed draw call is trivial for an M1 (the M1 pushes tens of
> millions of tris/frame); the terrain is never the High-tier bottleneck — ground objects and
> overdraw are. Detail amplitudes are deliberately small (≤60u) so ground objects placed from the
> unmodified `terrainH` never visibly float more than a quad's worth.

### 2.3 Normals
Keep the analytic central-difference normal from `terrainH` (engine.js E=14). On Med/High,
recompute the normal to include `terrainDetailH`'s gradient so lighting matches the visible
relief (still analytic, still cheap — 4 extra `terrainDetailH` samples per vertex at build time,
one-time cost). Do **not** switch to `computeVertexNormals()` (smears the height bands).

---

## 3. Water enrichment per tier

The sea is one mesh + one `ShaderMaterial` (`seaMat`, engine.js:421), `transparent:true`,
`depthWrite:false`. Enrichment is delivered as **shader-define branches / uniform toggles on the
same material** (preferred — keeps it one draw call, one program-ish), OR as up-to-three compiled
variants selected at tier-switch. **Whichever path, every fragment variant ends with the
`tonemapping_fragment` + `colorspace_fragment` tail (invariant #2).**

### 3.1 Per-tier sea budgets & features

`PlaneGeometry(70000,70000,SEG,SEG)`.

| Tier | Sea SEG | Verts | Tris | Wave octaves (vertex) | Normal detail | Reflectance | Foam |
|------|---------|-------|------|-----------------------|---------------|-------------|------|
| **LOW** | **200** (current) | 40,401 | 80,000 | 3 (current) | vertex-derived (current) | fresnel mix (current) | none |
| **MEDIUM** | **220** | 48,841 | 96,800 | 4 (add 1 cross-wave) | + 1 fragment normal-perturb octave (cheap `sin` ripple, no texture) | fresnel + slightly sharpened glint | none |
| **HIGH** | **256** | 66,049 | 130,000 | 5 (add 2) | + 2 fragment normal-perturb octaves (animated micro-ripple) | fresnel + **reflectance term**: boosted horizon-grazing specular + sky-tint approximation from `horCol`/`top` (NO real reflection probe — too costly; approximate from existing uniforms) | **shoreline foam**: `smoothstep` band where the *gameplay* ground height `terrainH` is within ~[-8, +18] of sea level, fed via a coarse foam mask. Animate with `time`. |

### 3.2 Constraints
- **Overdraw:** the sea is a huge transparent plane → it is the #1 overdraw surface. Foam and
  extra fragment octaves are **High-only** and must stay arithmetic (no extra texture fetches, no
  extra transparent layers). Target sea fragment cost ≤ ~1.4× current at High.
- **No new render targets / no planar reflection pass** at any tier (a second scene render would
  blow the M1 budget). High "reflectance" is an analytic approximation from existing sky uniforms.
- The foam mask must be cheap: precompute a low-res (e.g. 128×128) foam/coastline mask **once** at
  build (sampling `terrainH` near sea level), upload as a small texture; the shader samples it. No
  per-frame CPU work. Tag that texture + the sea material/geo `userData.shared` if reused across
  arenas (the sea persists across arenas — it is built once in `buildScenery`; just ensure tier
  swaps dispose the *replaced* program/texture, not the shared base).
- All `seaMat` time-of-day uniform writes (`applyTimeOfDay` engine.js:489-495) must keep working
  for every variant — do not rename `sunDir/sunCol/deepCol/horCol/fogCol`.

---

## 4. Ground objects (NET-NEW)

A new builder `buildGroundObjects()` (and teardown `clearGroundObjects()`), called from the tier-
apply path. **InstancedMesh only** — this is mandatory for the tri/draw-call budget. Each object
*type* = exactly one `InstancedMesh` = **one draw call**, regardless of instance count.

### 4.1 Types, geometry, per-instance tri budget

| Type | Geometry (low-poly, authored in code) | Tris / instance | Material |
|------|----------------------------------------|-----------------|----------|
| **Rock** | icosa/displaced low-poly blob | ~120 | shared `MeshStandardMaterial` (grey, vertex-color tint) |
| **Tree** | trunk cylinder (6-side) + 1–2 cone canopies | ~140 | shared 2-material (bark + foliage) — 2 InstancedMeshes per tree set (trunk set, canopy set) |
| **Building** | extruded box + roof prism, flat-shaded | ~60 | shared `MeshStandardMaterial`, vertex-color facade |
| **Road** (High only) | ribbon strips following spline segments, baked flat near terrain | ~2 tris / segment, ~400 tris / road | shared dark material, slight emissive lane hint |

All geometries and materials are **created once, tagged `userData.shared`**, and reused for every
instance and across arenas. They are placed under a single parent group `groundObjGroup` for easy
teardown.

### 4.2 Per-tier instance counts & totals

| Tier | Rocks | Trees (sets) | Buildings | Roads | InstancedMesh draw calls | Ground-object tris (worst case) |
|------|-------|--------------|-----------|-------|--------------------------|----------------------------------|
| **LOW** | 0 | 0 | 0 | 0 | 0 | 0 |
| **MEDIUM** | 600 | 250 | 0 | 0 | 3 (rock, tree-trunk, tree-canopy) | 600·120 + 250·(40+100) = 72k + 35k = **107k** |
| **HIGH** | 1,400 | 1,200 | 350 | 8 | 6 (rock, trunk, canopy, building, road, +1 spare) | 1400·120 + 1200·140 + 350·60 + 8·400 = 168k + 168k + 21k + 3.2k = **360k** |

> All ground objects together add **at most 6 draw calls** on High (InstancedMesh wins). High
> ground-object tris ≈ 360k — combined with 320k terrain + 130k sea + sky/clouds, the **static
> scene total stays under the ceiling in §5.** Counts are *spawn caps*, enforced; the builder must
> never exceed them even if placement retries.

### 4.3 Placement rule
- Distribute over the playable area within a **radius of ~12,000 units of the arena origin**
  (objects beyond the fog/cull horizon are wasted). Use the existing per-run seed (`weatherSeed`
  / arena seed) so placement is deterministic and test-reproducible — put the placement RNG +
  count logic in `core.js` (pure, testable), returning an array of `{type, x, z, rot, scale}`;
  `buildGroundObjects` consumes it and writes instance matrices.
- **Y = `terrainH(x,z)`** (gameplay surface, NOT the visual detail layer — assumption A1).
- **Avoid water:** reject any candidate where `terrainH(x,z) < 4` (sea is at y≈0; keep a 4-unit
  margin so trees/buildings never spawn in the sea). Rocks MAY spawn down to `terrainH >= 0`
  (beach rocks) but not below.
- **Avoid steep faces for buildings:** reject building candidates where the local `terrainH`
  slope (central difference) exceeds ~0.35 (no buildings on cliffs). Rocks/trees allowed on slopes.
- **Density falloff with distance:** bias placement so density is highest within ~6,000 units of
  origin and tapers toward the 12,000 horizon (players spend most time near arena center). A simple
  radial probability `p = 1 - clamp(r/12000, 0, 1)·0.6` on accept is sufficient.
- **No overlap with runway/platform:** reject candidates within ~600 units of the spawn platform
  (`makePlatform`) so objects never clip the takeoff area.

### 4.4 LOD / cull strategy
- **No per-object far-LOD meshes** (keeps it simple and within budget). Instead:
  - **Distance cull via instance count, not geometry swaps.** Because objects are confined to a
    12,000-unit radius and fog hides everything beyond the tier's visible distance (§5), most are
    naturally fogged out. No additional frustum culling is required for correctness, but the
    builder SHOULD set `groundObjGroup`-level `frustumCulled = true` (default) so off-screen
    InstancedMeshes are skipped wholesale by Three.
  - On **Medium**, optionally hide the canopy InstancedMesh beyond ~7,000 units via a cheap
    per-frame `.visible` toggle keyed off camera distance to arena center (mirrors the existing
    `cullDistantEnemies` pattern). Optional; not required to hit budget.
- Buildings/roads are **High-only** and few (≤358 combined) — no LOD needed.

### 4.5 Teardown / disposal (CRITICAL — arena teardown contract)
- The game disposes per-object groups via `disposeGroup`, which **skips `userData.shared`**
  geometry and materials. Therefore:
  - **Shared geometry + materials** (rock geo, tree trunk/canopy geo+mats, building geo+mat, road
    geo+mat, foam mask texture) are tagged **`userData.shared = true`** and are created ONCE,
    cached (mirror the `GEO_CACHE` pattern at entities.js:14), and **never disposed on arena
    teardown.**
  - The **per-arena `groundObjGroup`** (the InstancedMeshes + their parent) is spawned on arena
    start and **removed + cleaned on arena teardown.** Because the InstancedMesh *geometry/material*
    are shared (tagged), `disposeGroup(groundObjGroup)` correctly frees only the per-arena
    InstancedMesh wrappers/instance buffers, not the shared templates. Provide an explicit
    `clearGroundObjects()` that `scene.remove`s the group and calls `disposeGroup` on it.
  - **On tier change** (e.g. High→Low at runtime): call `clearGroundObjects()`; if the new tier is
    Low, do not rebuild. Idempotent.
- Sanity: there must be **no growth in shared geometry/material count across repeated arena
  start/teardown cycles** — the benchmarker will assert this (renderer.info.memory.geometries stable).

---

## 5. Fog / weather per tier (make "fog active" unmistakable)

### 5.1 The problem, quantified
FogExp2 visible distance (2% transmittance) `d ≈ sqrt(-ln 0.02) / density = 1.978 / density`.
With `FOG_BASE = 0.000058`:

| Weather | fogMul (core.js:22) | Effective density | Visible distance |
|---------|---------------------|-------------------|------------------|
| clear | 1.0 | 0.000058 | **~34.1 km** |
| storm | 1.6 | 0.0000928 | ~21.3 km |
| fog | 3.0 | 0.000174 | ~11.4 km |

Camera far = 40 km, map extent = 26 km. So even "fog" weather still shows ~11 km — **more than
half the map** — which is why active weather reads as barely-there. **This is the real complaint.**

### 5.2 Per-tier fog design

Two knobs: **(a)** a per-tier *clear-weather* baseline density (richer tiers can afford to draw
farther, so clear stays open), and **(b)** much stronger *active-weather* multipliers so fog/storm
visibly slam the draw distance. Implementation: keep `scene.fog.density = baseDensity(tier) *
weatherFogMul(tier, type)`. Put the tables in `core.js` (pure) and have `applyWeather` read them.

**(a) Clear-weather baseline visible distance by tier** (so High doesn't fog out its new detail):

| Tier | Clear visible target | Clear density |
|------|----------------------|---------------|
| LOW | ~28 km (current ≈34 km, but Low has the least to draw far — slightly tighter is fine) | ~0.0000706 |
| MEDIUM | ~34 km (≈ current) | 0.000058 (= FOG_BASE) |
| HIGH | ~38 km (open — show the relief + objects) | ~0.0000520 |

> Keeping Low's clear baseline a touch denser also saves fill on mobile. Medium = current.

**(b) Active-weather visible distance — DRAMATIC (this is the headline fix):**

| Weather | Target visible distance (ALL tiers) | Required effective density | New fogMul vs the tier's clear density |
|---------|-------------------------------------|----------------------------|----------------------------------------|
| **storm** | **~6.0 km** (was ~21 km) | 0.000330 | High: ×6.3, Med: ×5.7, Low: ×4.7 — i.e. raise WEATHER.storm.fogMul so effective density ≈ 0.00033 |
| **fog** | **~3.0 km** (was ~11 km) | 0.000659 | High: ×12.7, Med: ×11.4, Low: ×9.3 — effective density ≈ 0.00066 |

**Recommended concrete WEATHER table change** (core.js:22 — applied on top of the tier baseline;
simplest is to make fogMul tier-independent and let the tier baseline supply the clear distance):

```
clear: fogMul 1.0     // visible ≈ tier baseline (28 / 34 / 38 km)
storm: fogMul  ~5.7   // → ~6 km visible at the Medium baseline; storm should FEEL claustrophobic
fog:   fogMul ~11.4   // → ~3 km visible; near-whiteout, draw distance gutted
```

> Net: when fog/storm rolls in, the player's usable sightline collapses from "most of the map" to
> **3–6 km** — unmistakable, gameplay-relevant (matches the existing radar/lock-range penalties in
> the WEATHER table), and it makes the new fog color shift (storm desaturate, engine.js:531) read.
> The fog **color** handling (storm → desaturated `0x23262c` lerp) stays as-is; only density/
> distance changes. Because fog is exponential, the far plane (40 km) never needs touching — the
> fog reaches near-opaque (~99%) well before 40 km at these densities. **Verify the storm/fog
> numbers don't break any gameplay test that asserts on `weather.fogMul`** (search shows fogMul is
> read by combat.js/lock logic only via the resolved `weather.fogMul`; the *values* feed visuals +
> the lock-range modifiers which are separate fields — confirm no test hard-codes fogMul=3.0/1.6).

### 5.3 Idempotency
`applyWeather` is already idempotent (recomputes from the TOD baseline each call; comment at
engine.js:517). The tier baseline must be folded in the same idempotent way — `applyWeather` reads
the current `gfxTier` for `baseDensity(tier)`. A tier change must re-invoke `applyWeather` so the
baseline updates (it's already re-invoked from `applyTimeOfDay` → wire the tier-apply path to call
`applyWeather(weather.type)` too).

---

## 6. Draw-call & total-triangle budget per tier

### 6.1 Static scene draw-call budget

| Source | LOW | MEDIUM | HIGH |
|--------|-----|--------|------|
| Terrain | 1 | 1 | 1 |
| Sea | 1 | 1 | 1 |
| Sky + clouds + sun rig + halos + stars (UNCHANGED) | ~6 | ~6 | ~6 |
| Ground objects (InstancedMesh) | 0 | 3 | 6 |
| **Static scene draw-call ceiling** | **≤ 10** | **≤ 12** | **≤ 16** |

Shadow pass adds one depth draw per shadow-casting mesh; ground objects cast shadows only on
**High** (set `castShadow` on High InstancedMeshes; off on Medium to save the shadow pass cost —
Medium objects receive but don't cast). Shadow-pass draw budget: Low/Med ≤ 12, High ≤ 24.

### 6.2 Static scene triangle ceiling (hard caps)

| Source | LOW | MEDIUM | HIGH |
|--------|-----|--------|------|
| Terrain | 96.8k | 180k | 320k |
| Sea | 80k | 96.8k | 130k |
| Ground objects (worst case) | 0 | 107k | 360k |
| Sky/clouds/sun rig (unchanged, ~) | ~20k | ~20k | ~20k |
| **Static scene total** | **~197k** | **~404k** | **~830k** |
| **HARD CEILING (do not exceed)** | **250k** | **550k** | **1.0M** |

**M1 ≥60 fps reasoning (assumption A2):** the M1 8-core GPU sustains tens of millions of
triangles/frame at 60 fps for opaque, well-batched geometry. The High static budget (~830k tris,
≤16 static draw calls + entities/missiles which are pre-existing) is **~1% of the M1's tri
throughput**; geometry is not the limiter. The real limiters are (1) **overdraw** on the huge
transparent sea — capped by keeping sea fragment cost ≤1.4× current and adding no transparent
layers; (2) **draw-call count** — capped at ≤16 static via InstancedMesh; (3) **shadow pass** —
capped at 2048 map + ≤24 shadow draws on High. With all three capped, High clears 60 fps on M1
with headroom. The 1.0M ceiling exists so future content additions have a tripwire before they
threaten the budget.

### 6.3 Per-frame GPU time budget (M1, High tier)
- Total frame budget @ 60 fps = 16.6 ms. Reserve: ~9 ms gameplay/entities/HUD (pre-existing),
  leaving **~7 ms for environment** at High. Sub-budget:
  - Terrain (opaque, 320k, 1 draw): ≤ 0.8 ms
  - Sea (transparent, overdraw-heavy): ≤ 3.0 ms ← the watch item
  - Ground objects (6 instanced draws, 360k): ≤ 1.2 ms
  - Shadow pass (2048, terrain + ground casters): ≤ 1.8 ms
  - Fog/atmosphere: negligible (in-shader)
- The Performance Benchmarker measures these with the GPU profiler at worst-case density (max
  instance counts, storm weather, sea filling the screen at a low camera angle).

---

## 7. Per-tier acceptance checklist (gate — implementer + benchmarker verify)

### LOW (must equal current — zero regression)
- [ ] Terrain SEG = 220, no `terrainDetailH` applied; mesh identical to pre-change (vert/tri count 48,841 / 96,800).
- [ ] Sea SEG = 200, current 3-octave shader, no foam, no extra normal octaves.
- [ ] No ground objects spawned (`groundObjGroup` empty / not built).
- [ ] Clear-weather visible distance ~28 km; fog ~3 km, storm ~6 km (new dramatic multipliers apply at Low too).
- [ ] Shadow map 1024, shadow far 3000.
- [ ] glTF hero models NOT loaded (`loadJetModels` early-returns); `cullDistantEnemies` active.
- [ ] Static draw calls ≤ 10; static tris ≤ 250k.
- [ ] Runs at target fps on 2021-class mobile GPU.

### MEDIUM (new)
- [ ] Terrain SEG = 300 (90,601 / 180,000); `terrainDetailH` amplitude ≤ 28 units, 2-octave; normals include detail gradient.
- [ ] Sea SEG = 220, 4 wave octaves, +1 fragment normal-perturb octave; no foam.
- [ ] Ground objects: 600 rocks + 250 tree sets via 3 InstancedMeshes; Y from `terrainH`; none below `terrainH < 4`; none within 600u of platform.
- [ ] Ground objects receive shadows, do NOT cast (shadow pass not inflated).
- [ ] glTF hero models LOADED (medium treated as high for models); `cullDistantEnemies` does NOT aggressively hide (`gfxTier !== 'low'`).
- [ ] Clear ~34 km; fog ~3 km, storm ~6 km — active weather visibly collapses sightline.
- [ ] Shadow map 2048, shadow far 4500.
- [ ] Static draw calls ≤ 12; static tris ≤ 550k.
- [ ] AUTO on a touch device with dpr≤2 resolves to MEDIUM (not low) — behavior-change verified.

### HIGH (must hold ≥60 fps on M1 MacBook)
- [ ] Terrain SEG = 400 (160,801 / 320,000); `terrainDetailH` amplitude ≤ 60 units, 3-octave; relief reads as rolling hills from altitude.
- [ ] Sea SEG = 256, 5 wave octaves, +2 fragment normal-perturb octaves, analytic reflectance term, shoreline foam from precomputed coastline mask (no per-frame CPU, no second render target).
- [ ] Every sea shader variant ends with `#include <tonemapping_fragment>` then `#include <colorspace_fragment>`.
- [ ] Ground objects: 1,400 rocks + 1,200 tree sets + 350 buildings + 8 roads via ≤6 InstancedMeshes; buildings rejected on slope > 0.35; placement deterministic from seed.
- [ ] Ground objects cast + receive shadows; shadow pass ≤ 24 draws.
- [ ] Clear ~38 km; fog ~3 km, storm ~6 km.
- [ ] Shadow map 2048, shadow far 6000; glTF hero models loaded.
- [ ] Static draw calls ≤ 16; static tris ≤ 1.0M (target ~830k).
- [ ] GPU profiler @ worst case (max instances + storm + low-angle sea-fill): environment ≤ 7 ms, total frame ≤ 16.6 ms → ≥60 fps on M1.

### Cross-tier / plumbing
- [ ] `GFX_TIERS = ['auto','low','medium','high']`; `resolveQuality` returns `'medium'` for touch/auto.
- [ ] All three existing `gfxTier` consumers verified 3-value-safe (consumer #1 edited to 3-branch shadow lookup; #2 and #3 audited, unchanged).
- [ ] `terrainH` is unchanged and remains the sole gameplay-altitude / shadow / ground-object-Y source at every tier (no per-tier scaling).
- [ ] Repeated arena start/teardown shows NO growth in shared geometry/material count; `disposeGroup` spares all `userData.shared` ground-object templates; per-arena `groundObjGroup` is freed.
- [ ] Tier change at runtime is idempotent (rebuild terrain detail, swap sea variant, rebuild/teardown ground objects, re-apply weather baseline) with at most a one-frame hitch.
- [ ] Pure logic (`terrainDetailH`, ground-object placement RNG+counts, fog tier tables, extended `resolveQuality`) lives in `core.js` with a CommonJS export footer and is unit-tested; nothing mirrored.
- [ ] Sky / clouds / atmosphere / sun rig / TOD unchanged in cost and appearance at all tiers.

---

## 8. Implementation surface (file-by-file pointers for the Senior Developer)

| File | Change |
|------|--------|
| `js/core.js` | Extend `GFX_TIERS` (+`medium`) and `resolveQuality` (auto→medium for touch). Add pure `terrainDetailH(x,z)`, ground-object placement (`planGroundObjects(seed, tier)` → array), fog tier tables (`baseDensity(tier)`), and amend `WEATHER` storm/fog `fogMul`. Export via the CJS footer; unit-test each. |
| `js/globals.js` | `gfxTier` may now be `'medium'`; comments updated. No logic change to `refreshGfxTier` shape (it already calls the extended `resolveQuality`). Add ground-object cap constants if not kept in core. |
| `js/engine.js` | `buildTerrain` (267): per-tier SEG + apply `terrainDetailH` on Med/High + detail-aware normals. `buildScenery`/`seaMat` (417/421): tier-selected wave octaves + fragment features + foam, preserving the tonemapping/colorspace tail. `applyGfxQuality` (221): 3-branch shadow map/far; have it (or a sibling `applyEnvTier`) also drive terrain rebuild, sea variant, ground-object build/teardown, and re-call `applyWeather`. `applyWeather` (517): density = `baseDensity(gfxTier) * weatherFogMul`. NEW `buildGroundObjects()` / `clearGroundObjects()` (InstancedMesh, `userData.shared` templates, `groundObjGroup`). |
| `js/main.js` | Audit `cullDistantEnemies` (497) — `gfxTier !== 'low'` already correct; no edit expected. Wire `clearGroundObjects()` into arena teardown alongside the existing `disposeGroup` calls. |
| `js/entities.js` | Audit only — `loadJetModels` early-return (926) and `buildJetOrGLTF`/`cloneJetGLTF` `!== 'low'` (949) already treat medium like high. No edit expected. |
| UI settings module | Meta selector gains the `medium` option (4 entries: auto/low/medium/high) with EN+ZH `t(key)` strings in `js/i18n.js`. |
| tests | New unit tests in the existing suite for `resolveQuality` (medium cases), `terrainDetailH` determinism, `planGroundObjects` (counts/caps/seed-determinism, no-water rejection), fog density math per tier. |
