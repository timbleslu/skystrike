# Graphics Overhaul — toward World of Warplanes fidelity

**Goal:** Maximize visual quality of jets, environment, and weaponry within hard constraints: no build step, vendored Three.js r159, globals-only, iOS-viable performance, all three time-of-day themes must hold up, `npm test` stays green, `node scripts/shot.mjs` verifies every stage.

**Approach chosen:** Stay 100% procedural (no external model/texture assets — keeps repo light, iOS bundle small, and the parametric jet system intact). Quality comes from: a modern color pipeline, real-time shadows, shader-level surface detail, billboard volumetrics, and a particle-FX rewrite. Rejected: importing glTF aircraft (breaks parametric airframe/cache system, large assets); full post-processing bloom chain (EffectComposer not in vendored min build; additive sprites already fake glow well).

## Stages (sequential — each recalibrates on the last)

1. **Color pipeline + real shadows** (`engine.js`, `globals.js`)
   - `ColorManagement.enabled = true`, `outputColorSpace = SRGBColorSpace`, ACES filmic tone mapping, physically-correct lights (`useLegacyLights = false`).
   - Sky/sea ShaderMaterials get `tonemapping_fragment` + `colorspace_fragment` includes so they grade identically to lit materials.
   - Directional-light shadow map (PCFSoft, 2048) with a tight ortho frustum that follows the player; jets/ground units cast, terrain receives. Blob shadow kept as contact reinforcement.
   - Recalibrate all three `TODS` themes (hex + intensities) against screenshots.
2. **Sky + volumetric-style clouds** (`engine.js`)
   - Richer sky shader: zenith→horizon curve, sun-altitude warm band, existing scatter kept.
   - Clouds rebuilt as billboard clusters using a canvas fbm-eroded puff texture, per-sprite sun/shade tint, slow drift. `clouds[]` + `userData.radius` contract (inCloud) preserved.
3. **Terrain** (`engine.js`)
   - Indexed grid, per-vertex color + analytic smooth normals from `terrainH` gradient (replaces flat shading).
   - `onBeforeCompile` detail: two-scale world-space fbm modulating albedo (macro patches + fine grain), slope-based rock blend moved per-vertex. `receiveShadow`.
4. **Jet + weapon materials** (`entities.js`, `engine.js`, `combat.js`)
   - Triplanar-ish object-space noise patch on jet body material (panel grime/roughness variation, UV-independent).
   - envMap intensity tuning, glassier canopy, throttle-driven afterburner flame flicker, missile exhaust glow sprite.
5. **Particle FX rewrite** (`engine.js` textures, `combat.js`)
   - Canvas `fireTex`/`smokeTex`; explosions become layered sprite stacks (white-hot flash → fireball ramp → churning smoke), debris with ember trails, ground-impact dust columns; smoke/trail spawners switch to textured sprites with random roll.
6. **Final calibration + perf sanity** — all 3 TOD screenshot sets, particle caps re-checked, DPR cap confirmed, tests, CLAUDE.md + memory update.

## Invariants
- `userData.engines/body/cfg` contracts, geometry cache + `disposeGroup` semantics, `clearLocks`, marker handling — untouched.
- Tests regex-extract `SHAPES.STD`, `SHAPES.CCAJET`, `FIGHTER_SHAPES`, `FT-1`, storage seam — those byte ranges stay intact.
- One commit per stage, screenshots before/after.
