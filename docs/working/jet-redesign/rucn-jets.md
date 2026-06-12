# RU/CN Jet Redesign Spec — SU57, J20, J36, J50

Coordinate conventions (from `buildJet` / `SHAPES` in `js/entities.js`):
- Forward = **-Z**. Fuselage spans `z0 = -len/2 - noseLen + 0.5` (nose tip) to `z1 = len/2 + 2.3` (exhaust). `half = len/2`.
- `wing/canard/htail` = right-half planform `[spanX, chordZ]` points, traced LE root → tip LE → tip TE → TE back to root.
- `gap` = engine spacing: twin nozzles at `x = ±gap/2`, tri at `-gap, 0, +gap`.
- New feature flags below are generic keys on cfg, consumed by new blocks inside `buildJet` (hero-gated where noted), mirroring `ventral`/`dsi`/`irst`.

---

## SU57

### Current problems
- **Has canards — the Su-57 has none.** Its signature feature is LEVCONs (movable leading-edge root extensions), not canards. Delete the `canard` entry.
- Wing planform is generically trapezoidal; real wing has ~48° LE sweep, long root chord blending into the LEVCON, slightly forward-swept TE. Current LE sweep ≈ 60° — reads as a delta.
- Engines widely spaced (`gap:3.4`, good) but nothing renders the defining flat inter-engine **"tunnel"** or the **tail stinger/beaver-tail** between the nozzles.
- Vertical tails should be *small*, all-moving, widely spaced over the nacelles. Current fins too tall (`h:3.8`) and too inboard (`x:2.7`).

### New SHAPES entry (exact JS)
```js
SU57: { len:19, noseLen:7, frontR:1.4, rearR:1.2, flat:0.55,
        // 48° LE sweep, long root chord, slight forward-swept TE
        wing:[[1.6,-2.8],[9.2,4.0],[9.2,5.3],[1.8,6.6]], wingY:-0.1, wingThick:0.5,
        // all-moving slab stabilators, widely spaced behind the wing
        htail:[[1.2,5.6],[5.2,8.2],[5.2,9.3],[1.2,9.0]], htailY:-0.1,
        // small, widely spaced, low fins over the nacelles
        vtail:{type:'twin', base:2.6, tip:1.1, h:2.9, sweep:1.9, x:3.2, z:5.8, cant:0.28},
        lerx:false, engines:2, gap:3.6, intake:'side', wingspan:9.2,
        levcon:true, tunnel:true, stinger:true, nacelleSplit:true },
```
(Keep existing post-table flags `clean`/`irst`; remove `canard`/`canardY`.)

### New feature flags
1. **`levcon: true`** — LEVCON strakes (replaces both `canard` and `lerx` here).
   - `extrudeWing(lpts, 0.26, body, wy + 0.12, bs, gk('levcon'))` with
     `lpts = [[0.9, wingRootLE - 0.4], [3.4, wingRootLE - 0.2], [0.9, wingRootLE - 4.2]]`
     where `wingRootLE = cfg.wing[0][1]` (= -2.8 → strake runs z ≈ -7.0 … -3.0). Broad triangular strake hugging the forebody ahead of the wing root. Hero: hinge-seam box `(0.4, 0.1, 2.2)` at `(±2.0, wy+0.18, wingRootLE - 1.2)` in panel material.
2. **`tunnel: true`** — flat inter-engine channel.
   - `BoxGeometry(gap - rR*0.6, rR*flat*0.9, len*0.45)`, body material, at `(0, -rR*flat*0.25, half*0.30)`; plus a thin top deck `BoxGeometry(gap + rR*1.2, 0.18, len*0.40)` at `(0, rR*flat*0.55, half*0.30)`. Cache via `cacheGeo(gk('tunnel'), …)`.
3. **`stinger: true`** — tail boom / beaver-tail between the nozzles.
   - `ConeGeometry(rR*0.55, 4.2, 10)`, `scale.set(1.5, 0.45, 1)`, `rotation.x = -Math.PI/2` (point aft), at `(0, 0, half + 2.6)`, body material. Extends ~2 past the nozzle plane.
4. **`nacelleSplit: true`** — render engines as two distinct underslung pods.
   - Per side `sx∈[-1,1]`: `CapsuleGeometry(rR*0.85, len*0.45, 4, 12)` rotated `x=π/2`, `scale.y = flat`, at `(sx*gap/2, -rR*flat*0.35, half*0.25)`. Gives the Flanker "two pods under a flat wing-body" silhouette.

---

## J20

### Current problems
- Layout (canard-delta, twin canted fins, ventral fins, DSI) is right; detail shape is off.
- Wing TE should sweep slightly forward and the tip should be near-pointed; current tip chord 1.5 is too wide.
- Canards are large, ~55° LE sweep, with **~+10° dihedral**, mounted high. Current canard is flat, low, shallow-swept.
- Fins should be stubbier all-moving trapezoids (`base:3.0` too long — they look like F-22 fins).
- The continuous chined forebody is only hinted by the loft chine; no distinct edge.

### New SHAPES entry (exact JS)
```js
J20:  { len:21, noseLen:8.5, frontR:1.25, rearR:1.1, flat:0.56,
        // 48-50° delta, near-pointed tip, mild forward-swept TE
        wing:[[1.3,-1.0],[9.6,5.4],[9.6,6.4],[1.5,7.6]], wingY:-0.2, wingThick:0.55,
        // big swept canards, mounted high
        canard:[[1.2,-7.2],[4.6,-4.6],[4.6,-3.9],[1.4,-4.6]], canardY:0.25, canardDihedral:0.17,
        // stubby all-moving fins
        vtail:{type:'twin', base:2.4, tip:0.8, h:3.2, sweep:1.9, x:2.1, z:7.6, cant:0.28},
        lerx:false, engines:2, gap:1.5, intake:'side', wingspan:9.6,
        chineRidge:true, finBoom:true, bayWide:true },
```
(Existing `clean/ventral/dsi/eots` flags stay.)

### New feature flags
1. **`canardDihedral: <radians>`** — generic canard dihedral.
   - Build the canard per half via `extrudeWing`, translate geo by `-rootX`, set `rotation.z = sx * cfg.canardDihedral`, translate back — pivot at the root.
2. **`chineRidge: true`** — explicit forebody chine edge strips.
   - Per side: `BoxGeometry(0.16, 0.10, noseLen*0.9)`, body material, at `(±fR*0.92, 0, z0 + noseLen*0.5)`, `rotation.z = ±0.5` so it reads as a knife edge at the waterline, radome → canard root.
3. **`finBoom: true`** — tail booms carrying the fins/ventrals.
   - Per side: `CapsuleGeometry(0.45, 4.5, 3, 8)` rotated `x=π/2`, `scale.y=0.7`, at `(±(gap/2 + rR*0.8), -0.1, half - 1.2)`. Move ventral-fin x to `±(gap/2 + rR*0.8)` to attach.
4. **`bayWide: true`** — longer/wider belly weapon-bay outline.
   - Reuse the `clean` bay-door block but doors at `±fR*0.62`, length `L*0.30`, centered `z = -half*0.02`.

---

## J36

### Current problems
- Rendered as a single-taper delta; the J-36 is a **double-delta flying wing**: ~65° inner LE kinking to ~50° outboard, TE spanning nearly the full length with a sawtooth/W shape. Current planform has one straight LE and a square wide tip.
- Tri-engine count is right, but the defining **dorsal intake** for the center engine is missing.
- Canopy is a normal bubble; J-36 has a wide flattened canopy on a very broad forebody.
- No TE sawtooth.

### New SHAPES entry (exact JS)
```js
J36:  { len:24, noseLen:9, frontR:1.8, rearR:1.55, flat:0.5,
        // double delta: 65° inner kinking to ~50° outer, clipped tip,
        // TE runs nearly to the tail with a forward jog at mid-span
        wing:[[1.8,-6.0],[6.0,1.5],[13.0,8.0],[13.0,9.8],[7.0,9.2],[6.2,11.2],[2.0,11.6]],
        wingY:-0.1, wingThick:0.7,
        lerx:false, engines:3, gap:2.8, intake:'side', wingspan:13.0,
        dorsalIntake:true, sawtoothTE:true, wideCanopy:1.45, splitRudderTips:true },
```
Trace: LE root (1.8,-6.0) → kink (6.0,1.5) [65°] → tip LE (13.0,8.0) [~50°] → tip TE (13.0,9.8) → TE forward jog (7.0,9.2) → aft jog (6.2,11.2) → TE root (2.0,11.6). The 9.2→11.2 jog is the first sawtooth notch baked into the planform. (Existing `clean/dsi/eots` flags stay.)

### New feature flags
1. **`dorsalIntake: true`** — top-mounted caret duct for the center engine.
   - Reuse `intakeDuctGeo(fR*1.5, 1.3, 4.5)` (dark material), `rotation.z = Math.PI` (caret opens upward), at `(0, fR*flat*0.85, -half + noseLen*0.35 + 3.0)` — on the spine behind the canopy. Hero: DSI bump `SphereGeometry(0.9)` scaled `(1.3, 0.7, 1.5)` at `(0, fR*flat*0.8, -half + noseLen*0.35 + 1.4)`.
2. **`sawtoothTE: true`** — extra TE sawtooth wedges.
   - Per side: 2 thin prisms from a `THREE.Shape` triangle `[(0,0),(1.6,0),(0.8,1.1)]` extruded depth `wingThick*0.8`, `rotation.x = -π/2`, body material, at `(±4.2, wingY, 11.0)` and `(±9.5, wingY, 9.5)`, apex pointing aft (+Z).
3. **`wideCanopy: <xScale>`** — broad flattened canopy.
   - Multiply `can.scale.x` by `cfg.wideCanopy` and set `can.scale.y = 0.6` when flag present.
4. **`splitRudderTips: true`** — split-flap drag rudders at the wingtips (tailless yaw control).
   - Per side: two plates `BoxGeometry(2.2, 0.06, 1.1)` (panel mat) at `(±(13.0 - 1.2), wingY ± 0.10, 9.8 - 0.7)`, `rotation.x = ∓0.08` so they look slightly cracked open.

---

## J50

### Current problems
- Current planform is a cranked delta; the J-50 is a **lambda wing**: single ~47° LE sweep, TE sweeping forward from tip, sharp mid-span kink (lambda notch), then aft to root. No notch today.
- Missing the signature **swiveling wingtip control surfaces** — nothing marks the tip as a separate articulated panel.
- `lerx:true` puts a fighter strake that doesn't exist; the forebody blends directly into the wing.
- Canopy should be lower-profile/flush.

### New SHAPES entry (exact JS)
```js
J50:  { len:18, noseLen:7.5, frontR:1.45, rearR:1.2, flat:0.55,
        // lambda wing: 47° LE; TE sweeps forward from tip to a mid-span
        // kink (the lambda notch), then aft to the root
        wing:[[1.4,-2.0],[9.4,4.3],[9.4,5.4],[5.2,5.0],[3.4,8.0],[1.6,8.4]],
        wingY:-0.12, wingThick:0.55,
        lerx:false, engines:2, gap:1.9, intake:'side', wingspan:9.4,
        tipPivot:true, lambdaFairing:true, noseChineBlend:true, canopyFlush:true },
```
Trace: LE root (1.4,-2.0) → tip LE (9.4,4.3) [47°] → tip TE (9.4,5.4) → forward-swept TE to kink (5.2,5.0) → notch diagonal aft to (3.4,8.0) → TE root (1.6,8.4). (Existing `clean/dsi/eots/nozzle:'2d'` flags stay.)

### New feature flags
1. **`tipPivot: true`** — swiveling wingtip panels as distinct articulated tips.
   - Per side: separate `extrudeWing` panel `tpts = [[0,0],[1.8,0.9],[1.8,1.6],[0,1.4]]` (local), thickness `wingThick*0.8`, body material, parented to a pivot `THREE.Group` at `(±(9.4 - 1.8), wingY, 4.3 + 1.1*0.8)` with `pivot.rotation.x = sx * 0.10` (toe a few degrees so the hinge reads). Hero: hinge seam `BoxGeometry(0.12, wingThick*1.4, 1.4)` (panel mat) along the panel's inboard edge.
2. **`lambdaFairing: true`** — aft centre-body fairing between the lambda notches.
   - `BoxGeometry(gap + rR*1.6, rR*flat*1.1, 4.5)`, body, `scale.set(1, 0.8, 1)`, at `(0, -0.05, half - 1.0)`; plus a beaver-tail wedge `ConeGeometry(rR*0.9, 2.4, 4)` scaled `(2.0, 0.35, 1)`, `rotation.x = -π/2`, at `(0, 0, half + 2.0)` behind the 2D nozzles.
3. **`noseChineBlend: true`** — chine strips over the front 60% of the nose: `BoxGeometry(0.14, 0.08, noseLen*0.6)` at `(±fR*0.9, -0.05, z0 + noseLen*0.35)`, `rotation.z = ±0.45`. (Reusable by SU57/J20.)
4. **`canopyFlush: true`** — low-profile flush canopy: scale bubble `(0.92, 0.5, 2.1)` instead of `(0.92, 0.74, 1.9)` and drop y by `0.15`.

---

## Implementation notes (shared)
- Route static per-shape geometry through `cacheGeo(gk('<part>'), …)`; `markShadowCasters` covers the whole group.
- All flags are generic and reusable (e.g. F47/NGAD → `tipPivot`; BOMBER → `sawtoothTE`).
- Verify visually with `node scripts/beauty.mjs <prefix> <jetIndex>` after implementation.
