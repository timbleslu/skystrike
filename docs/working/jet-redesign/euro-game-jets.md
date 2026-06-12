# Jet Redesign Spec — Euro Canard Deltas, 6th-Gen US, and Game Originals

Scope: EFT, RAFALE, TEJAS, F47, NGAD + game originals ENEMY, BOSS, STD, CCAJET.
Coordinate reminders (from `buildJet`/`loftFuselage` in `js/entities.js`):

- Forward = **-Z**. Fuselage runs `z0 = -len/2 - noseLen + 0.5` (nose tip) to `+len/2 + 2.3` (exhaust).
- Planform points are right-half `[spanX, chordZ]`, traced LE-root → tip LE → tip TE → TE back to root.
- `wingY` is the vertical mount; `flat` squashes the superellipse hull; `gap` is engine center spacing.
- All new flags below are read in `buildJet` after the existing flag blocks (`irst`/`eots`/`dsi` pattern); most are hero-only details, marked accordingly.

---

## EFT — Eurofighter Typhoon

### Current problems
- **Wing sweep too shallow.** LE runs `[1.3,-0.5]→[9.5,5.5]`: ~36° equivalent. The Typhoon is a 53° cropped delta; in game scale the LE should slope much harder and the trailing edge should be nearly straight and far aft (delta = wing root chord ≈ half the fuselage).
- **Root chord too short.** Real delta root chord blends almost from intake to nozzle; current root LE at -0.5 is too far aft — delta should start near the intake station.
- **Intake style wrong shape.** `intake:'belly'` gives a generic duct; the Typhoon has a distinctive **rectangular two-shock chin intake with a horizontal splitter** under the forward fuselage, plus a prominent lower "smile" lip.
- **Canards OK in position** (Typhoon foreplanes are long-arm, just aft of the radome) but slightly too large in chord and too low; they sit high on the nose chines.
- **Fin too small.** The Typhoon fin is tall with a long dorsal fillet running forward along the spine.

### New SHAPES entry (exact JS)
```js
EFT:  { len:17, noseLen:7, frontR:1.3, rearR:1.2, flat:0.62,
        // 53°-style cropped delta: long root chord, near-straight TE, cropped tip
        wing:[[1.3,-1.6],[10.4,6.6],[10.4,7.8],[1.5,8.3]], wingY:-0.15, wingThick:0.55,
        // long-arm foreplanes high on the nose chines, slim chord
        canard:[[1.3,-6.6],[3.5,-5.3],[3.5,-4.7],[1.4,-4.9]], canardY:0.35,
        vtail:{type:'single', base:4.6, tip:1.3, h:4.8, sweep:2.3, z:3.6},
        lerx:false, engines:2, gap:1.8, intake:'chin', wingspan:10.4,
        irst:true, chinSplit:true, finFillet:true, dorsalBrake:true },
```
(`intake:'chin'` already routes to the belly-duct branch; `chinSplit` adds the Typhoon detail.)

### New feature flags
1. **`chinSplit`** — rectangular chin intake splitter (hero). After the belly/chin intake block:
   - Plate: `BoxGeometry(frontR*1.8, 0.1, 2.6)`, material `panel`, at `(0, -frontR*flat - 0.2, -len/2 + 3.0)` — horizontal splitter bisecting the duct mouth.
   - Lower lip: `BoxGeometry(frontR*1.9, 0.16, 0.5)`, `steel`, at `(0, -frontR*flat - 0.95, -len/2 + 1.5)`, `rotation.x = 0.25` (drooped "smile" lip).
2. **`finFillet`** — long dorsal fin fillet. Right triangle extruded thin:
   - `Shape`: `(0,0) → (0, vtail.h*0.45) → (vtail.h*1.4, 0)` extruded depth 0.22 (X-thickness via `rotateY(Math.PI/2)`), material `body`.
   - Position `(0, frontR*flat*0.45, vtail.z - vtail.h*1.4 + 0.2)` so the hypotenuse ramps up into the fin LE. Generic: usable by any `vtail.type==='single'` jet.
3. **`dorsalBrake`** — spine airbrake panel seam (hero): `BoxGeometry(1.1, 0.06, 1.9)`, `panel`, at `(0, frontR*flat*0.62 + 0.05, canopyZ + 3.4)`. Reads as the Typhoon's behind-cockpit airbrake.

---

## RAFALE — Dassault Rafale

### Current problems
- **Delta too shallow and TE too tapered.** Rafale is a 48° mid-set cropped delta with a long, nearly straight trailing edge; current `[8.8,4.5]` tip LE gives ~30° and the TE pinches.
- **Canards in the wrong place.** Rafale foreplanes are **close-coupled**: mounted high on the intake shoulders directly aft of the cockpit, almost touching the wing root LE — not far forward like the Typhoon. Current z range -4.8..-2.4 is too far forward and `canardY:0.12` too low.
- **Intake shape missing.** Rafale's signature is the **semicircular un-splittered side intake** snuggled under the fuselage shoulder; current generic caret duct + splitter plate is exactly wrong (Rafale famously has no splitter).
- **No refueling probe** — the fixed probe ahead of the windscreen is a recognizable silhouette element.

### New SHAPES entry (exact JS)
```js
RAFALE:{ len:17, noseLen:6.5, frontR:1.35, rearR:1.2, flat:0.62,
        // 48°-style cropped delta, long straight TE
        wing:[[1.4,-1.0],[9.6,5.6],[9.6,7.0],[1.6,7.6]], wingY:-0.1, wingThick:0.55,
        // close-coupled foreplanes, high on the intake shoulders, just aft of canopy
        canard:[[1.5,-3.4],[3.8,-2.2],[3.8,-1.5],[1.6,-1.8]], canardY:0.55,
        vtail:{type:'single', base:3.8, tip:1.1, h:4.2, sweep:2.0, z:4.4},
        lerx:false, engines:2, gap:2.0, intake:'side', wingspan:9.6,
        irst:true, semiIntake:true, noseProbe:true, finTipPod:true },
```

### New feature flags
1. **`semiIntake`** — replaces the caret duct + splitter for this jet (in the `intake:'side'` branch: `if (cfg.semiIntake)` use this recipe, skip the splitter plate even on hero):
   - Half-cylinder duct: `CylinderGeometry(1.0, 1.05, 4.0, 16, 1, false, 0, Math.PI)` rotated `rotation.x = Math.PI/2`, then `rotation.z = sx * Math.PI/2` so the flat face mates with the hull; material `dark`.
   - Position `(sx*(frontR+0.35), -frontR*flat*0.30, -len/2 + 3.6)`.
   - Hero lip: half-torus `TorusGeometry(0.95, 0.1, 8, 18, Math.PI)` same orientation at `z = -len/2 + 1.6`, material `steel`.
2. **`noseProbe`** — fixed refueling probe (hero): `CylinderGeometry(0.05, 0.07, 1.8, 8)`, `steel`, `rotation.x = Math.PI/2 - 0.2`, position `(frontR*0.45, frontR*flat*0.55, -len/2 - noseLen + 2.6)` — offset starboard, angled up-forward ahead of the windscreen.
3. **`finTipPod`** — Spectra EW fin-tip pod: `CapsuleGeometry(0.16, 0.9, 4, 8)` rotated `rotation.x = Math.PI/2`, `sensor` material, position `(0, frontR*flat*0.4 + vtail.h - 0.1, vtail.z + vtail.sweep + 0.3)`. Generic for any single-fin jet.

---

## TEJAS — HAL Tejas

### Current problems
- **Compound delta sweeps too weak.** Tejas has a double-delta: inner panel ~50° LE, outer panel ~62.5° (sweep *increases* outboard past the kink). Current inner segment is ~17° and outer ~45° — reads as a trapezoid wing with a notch, not the Tejas planform.
- **Trailing edge too tapered**; Tejas TE is nearly unswept root-to-tip.
- **Intakes generic.** Tejas uses **Y-duct side intakes tucked under the wing-root shoulder** with short fixed fairings hugging the fuselage — smaller and higher than the current big caret ducts.
- **Fin lacks the swept dorsal fairing** that flows from the spine.
- Tejas is tiny — keep it the smallest real jet.

### New SHAPES entry (exact JS)
```js
TEJAS:{ len:14, noseLen:5.5, frontR:1.35, rearR:1.05, flat:0.66,
        // compound delta: ~50° inner panel, ~62° outer panel past the kink, flat TE
        wing:[[1.2,-1.6],[4.0,0.8],[7.4,5.0],[7.4,6.0],[1.4,6.4]], wingY:-0.15, wingThick:0.5,
        vtail:{type:'single', base:3.4, tip:1.0, h:3.6, sweep:1.9, z:3.2},
        lerx:false, engines:1, gap:0, intake:'side', wingspan:7.4,
        shoulderIntake:true, finFillet:true, tipRail:true },
```
(LE slopes: inner `(0.8-(-1.6))/(4.0-1.2)=0.86` ≈ 41°, outer `(5.0-0.8)/(7.4-4.0)=1.24` ≈ 51° — sweep increases outboard, matching the compound-delta read at game scale.)

### New feature flags
1. **`shoulderIntake`** — small high-set Y-duct trunks (in `intake:'side'` branch, `if (cfg.shoulderIntake)` replace the standard duct): `intakeDuctGeo(1.0, 1.1, 3.2)` (reuse existing helper), material `dark`, position `(sx*(frontR+0.25), -frontR*flat*0.05, -len/2 + 3.2)` — higher and tighter to the hull than the default, sitting under the wing shoulder. Skip the splitter; add a hero fairing: `SphereGeometry(0.5, 14, 10)` scaled `(0.6, 0.7, 1.4)` at `(sx*(frontR+0.05), -frontR*flat*0.05, -len/2 + 2.2)`, material `body`.
2. **`finFillet`** — same generic recipe as EFT (shared flag); Tejas uses a shorter run: scale the triangle length to `vtail.h*1.0`.
3. **`tipRail`** — wingtip missile launch rails (hero, non-clean jets): `BoxGeometry(0.14, 0.18, 2.2)`, `dark`, at `(±tipX, wingY + 0.05, tipZ - 0.4)` where `tipX/tipZ` = max-span planform point (same lookup as the nav-light code). The existing `buildTipMissile` then mounts onto the rail (drop its y by 0.18).

---

## F47 — Boeing F-47 (6th-gen canard NGAD)

### Current problems
- **Reads as a generic canard delta.** The F-47 concept shows a broad, flat, chined forebody, widely-set **canted canards/foreplanes**, a lambda-ish wing with a cranked trailing edge, and no vertical tails — current straight-TE wing and small flat canards lose all of that.
- **Canards too small and flat.** Concept foreplanes are large, sharply swept, and visibly canted upward (doing the vertical-tail's job).
- **Fuselage too tubular** — needs a wider, flatter hull (`flat` lower, `frontR` larger).

### New SHAPES entry (exact JS)
```js
F47:  { len:19.5, noseLen:8, frontR:1.65, rearR:1.35, flat:0.54,
        // lambda wing: swept LE, cranked TE with inboard notch
        wing:[[1.5,-1.0],[10.8,5.2],[10.8,7.0],[5.4,6.2],[1.8,8.2]], wingY:-0.18, wingThick:0.56,
        // large swept foreplanes, set wide and forward
        canard:[[1.5,-6.8],[4.6,-4.6],[4.6,-3.8],[1.7,-4.4]], canardY:0.2, canardCant:0.35,
        lerx:false, engines:2, gap:2.0, intake:'side', wingspan:10.8 },
// keep existing post-table flags: clean, nozzle:'2d', dsi, eots
```

### New feature flags
1. **`canardCant`** (number, radians) — generic: when set, build the canard as two mirrored panels instead of one `extrudeWing` slab. For `sx of [-1,1]`: build the right-half canard planform on a sub-`Group`, set `group.rotation.z = -sx*cfg.canardCant`, `group.position.y = canardY`. Dihedral foreplanes substitute visually for missing vertical tails.
2. **`chineLine`** — sharpened forebody chine strip (hero): two `BoxGeometry(0.08, 0.06, noseLen*0.85)` strips, `panel`, at `(±frontR*0.92, 0.05, -len/2 - noseLen*0.45 + 0.5)`, `rotation.y = ∓0.06` so they taper toward the nose tip. Generic for any `clean` jet.
3. **`dorsalHump`** — wide stealth dorsal fairing: `SphereGeometry(frontR*1.1, 18, 12)` scaled `(1.5, 0.45, 2.6)`, `body`, at `(0, frontR*flat*0.55, len*0.08)` — replaces the skinny default spine (skip the standard `spine` mesh when set) for the thick blended-body 6th-gen look.

---

## NGAD — Generic US 6th-gen tailless

### Current problems
- **Silhouette too close to F-47/J-50.** As the *tailless* archetype it should be the purest flying-wing-fighter: huge cranked-arrow wing blended into the hull, long pointed chined nose, no canard, no fins at all — wider and flatter than anything else US.
- **Hull too narrow** (`frontR:1.45`) for a blended design; `flat:0.57` not flat enough.
- TE crank exists but the inboard TE returns too far aft, making it look like a delta with a notch rather than a lambda/arrow.

### New SHAPES entry (exact JS)
```js
NGAD: { len:21, noseLen:9, frontR:1.7, rearR:1.45, flat:0.5,
        // cranked-arrow: very long root chord, double TE crank (W-shaped exhaust deck)
        wing:[[1.4,-3.0],[12.2,6.0],[12.2,8.0],[7.0,7.0],[3.6,9.8],[1.6,9.0]], wingY:-0.14, wingThick:0.6,
        lerx:true, engines:2, gap:2.4, intake:'side', wingspan:12.2 },
// keep existing flags: clean, nozzle:'2d', dsi, eots — and add:
// if (SHAPES.NGAD) { SHAPES.NGAD.dorsalHump = true; SHAPES.NGAD.chineLine = true; SHAPES.NGAD.sawtooth = true; }
```
(The TE sequence `[12.2,8.0]→[7.0,7.0]→[3.6,9.8]→[1.6,9.0]` gives the W-shaped sawtooth exhaust deck of B-21-style planforms.)

### New feature flags
1. **`sawtooth`** — exhaust-deck serration trim (hero): thin strips along the TE crank. For each `sx`: `BoxGeometry(0.6, wingThick*1.4, 0.1)`, `panel`, placed at the TE crank vertices `(sx*7.0, wingY, 7.0)` and `(sx*3.6, wingY, 9.8)`, rotated `rotation.y = sx*Math.atan2(Δx, Δz)` of each TE segment.
2. **`dorsalHump` / `chineLine`** — shared with F47 (see above); NGAD uses both.
3. **`buriedExhaust`** — recess the 2D nozzles: shift nozzle/glow/flame group `z -= 1.2` and add an over-nozzle shelf `BoxGeometry(gap + rearR*1.6, 0.18, 2.4)`, `body`, at `(0, rearR*flat*0.55, len/2 + 0.4)` — exhausts exhale under a stealth lip.

---

## ENEMY — hostile interceptor (game original)

### Current problems
- Currently a slightly-smaller F-22 clone (same wing, twin canted fins, lerx) — zero hostile identity.
- Needs: **dart-like, aggressive** — longer needle nose, sharply swept short-span wing, ventral fins, steeply canted tails. Should read instantly as "incoming threat" head-on.

### New SHAPES entry (exact JS)
```js
ENEMY:{ len:16.5, noseLen:7.5, frontR:1.25, rearR:1.05, flat:0.58,
        // dart wing: hard 55°-style sweep, short span, cropped tip
        wing:[[1.3,0.0],[7.6,5.2],[7.6,6.4],[1.5,7.2]], wingY:-0.2, wingThick:0.48,
        htail:[[0.9,6.0],[4.0,8.2],[4.0,9.2],[0.9,9.4]],
        vtail:{type:'twin', base:3.0, tip:0.8, h:3.4, sweep:1.8, x:1.8, z:4.8, cant:0.55},
        lerx:true, engines:2, gap:1.5, intake:'side', wingspan:7.6,
        ventral:true, noseSpike:true, hostileLights:true },
```
(Reuses existing `ventral` flag — currently J-20 only, already generic.)

### New feature flags
1. **`noseSpike`** — menacing extended boom (all LODs): `CylinderGeometry(0.04, 0.16, 2.6, 6)`, `dark`, `rotation.x = Math.PI/2`, position `(0, 0, z0 - 1.2)` where `z0 = -len/2 - noseLen + 0.5`. Six-sided so it glints; replaces hero pitot when set.
2. **`hostileLights`** — swap the slime-light material color to red (`0xff4444`) and add a third strip under the nose: `BoxGeometry(0.42, 0.05, 1.6)` at `(0, -frontR*flat*0.7, -len/2 + 1.6)`. Recipe: `const slimeColor = cfg.hostileLights ? 0xff4444 : 0xcaff7a;` in the existing slime block; enable strips for non-hero too when the flag is set (cheap basic material).

---

## BOSS — command fighter (game original)

### Current problems
- Just a scaled-up canard fighter; not menacing enough. Needs **bulk**: triple engines, oversized twin fins plus ventral fins, massive canards, hulking flat hull.

### New SHAPES entry (exact JS)
```js
BOSS: { len:22, noseLen:8.5, frontR:1.9, rearR:1.6, flat:0.6,
        // broad cranked delta with a long root
        wing:[[1.7,-2.0],[12.0,4.5],[12.0,7.5],[6.0,8.5],[2.0,10.0]], wingY:-0.2, wingThick:0.75,
        canard:[[1.7,-7.5],[4.8,-5.2],[4.8,-4.2],[1.9,-4.6]], canardY:0.15,
        vtail:{type:'twin', base:4.2, tip:1.3, h:5.4, sweep:2.2, x:3.0, z:6.5, cant:0.25},
        lerx:true, engines:3, gap:2.4, intake:'side', wingspan:12,
        ventral:true, noseSpike:true, dorsalHump:true, hostileLights:true },
```
(Engine count 3 already supported: `xs = [-gap, 0, gap]`. Flags reused from above — BOSS is the kitchen-sink threat.)

### New feature flag
1. **`spineGun`** — dorsal turret blister (hero): `SphereGeometry(0.9, 14, 10)` scaled `(1, 0.6, 1)`, `dark`, at `(0, frontR*flat*0.62 + 0.3, len*0.05)`, plus barrel `CylinderGeometry(0.07, 0.07, 2.2, 8)`, `steel`, `rotation.x = Math.PI/2 + 0.15`, at `(0, frontR*flat*0.62 + 0.55, len*0.05 - 1.4)`. Purely cosmetic intimidation.

---

## STD — baseline/trainer (game original)

### Current problems
- Fine bones, but the wing is a stubby trapezoid and the rear looks amputated (no htail). Goal: **clean, friendly, trainer-like** — moderate sweep, slight taper, tidy single-engine layout. The most "ordinary" silhouette in the hangar so every other jet pops against it.

### New SHAPES entry (exact JS)
```js
STD:  { len:15.5, noseLen:5.5, frontR:1.35, rearR:1.1, flat:0.64,
        // honest 40°-ish trapezoid with a proper htail (trainer layout)
        wing:[[1.3,-0.8],[8.0,3.0],[8.0,4.8],[1.5,5.8]], wingY:-0.18, wingThick:0.5,
        htail:[[0.9,5.4],[3.8,7.0],[3.8,8.0],[0.9,8.2]],
        vtail:{type:'single', base:3.2, tip:1.1, h:3.6, sweep:1.6, z:4.6},
        lerx:false, engines:1, gap:0, intake:'side', wingspan:8.0,
        finFillet:true, tipRail:true },
```
(Reuses `finFillet`/`tipRail` from above.)

---

## CCAJET — loyal-wingman drone (game original, XQ-58-inspired)

### Current problems
- **It has a canopy.** `buildJet` unconditionally adds canopy + sill + (hero) cockpit interior — fatal for a drone silhouette.
- Wing should be a cleaner lambda; needs the XQ-58 signature **outward-canted V-tails** and a **dorsal flush intake** (XQ-58 inhales from the top, not the belly).
- Nose should be a faceted sensor wedge, not an ogive with a pitot.

### New SHAPES entry (exact JS)
```js
CCAJET:{ len:11, noseLen:4.5, frontR:0.95, rearR:0.8, flat:0.55,
        // slim lambda wing, cranked TE
        wing:[[0.9,-1.2],[6.8,2.6],[6.8,3.8],[3.0,3.2],[1.1,4.6]], wingY:-0.08, wingThick:0.38,
        vtail:{type:'twin', base:1.8, tip:0.6, h:2.2, sweep:1.2, x:0.9, z:3.6, cant:0.7},
        lerx:false, engines:1, gap:0, intake:'dorsal', wingspan:6.8,
        clean:true, noCanopy:true, facetNose:true },
```

### New feature flags
1. **`noCanopy`** (generic, all LODs) — wrap the entire canopy section (sill, tub/seat/head/HUD, `can`, windscreen, rails, bow) in `if (!cfg.noCanopy) { ... }`. Replace with a smooth dorsal fairing: `CapsuleGeometry(frontR*0.55, 2.2, 4, 10)` rotated `rotateX(Math.PI/2)`, scaled `(1, 0.5, 1)`, `body`, at `(0, frontR*flat*0.6, canopyZ)`.
2. **`facetNose`** — faceted sensor nose (all LODs): `OctahedronGeometry(frontR*0.85, 0)` scaled `(0.9, 0.6, 2.2)`, material `sensor`, position `(0, -frontR*flat*0.1, z0 + 1.0)` where `z0 = -len/2 - noseLen + 0.5`. Low-poly octahedron over the lofted nose gives a hard EO-aperture facet; skip hero pitot/AoA vanes when set.
3. **`intake:'dorsal'`** (new intake style, generic) — new branch alongside `'side'`/`'belly'`: `intakeDuctGeo(frontR*1.6, 1.0, 3.0)`, material `dark`, mounted above the spine at `(0, frontR*flat*0.75, -len/2 + noseLen*0.2 + 2.2)` — a NACA-style hump behind where the canopy would be. Hero lip: half-torus `TorusGeometry(frontR*0.7, 0.08, 8, 16, Math.PI)`, `steel`, at the duct front face, `rotation.x = Math.PI/2`.

---

## Implementation order (when editing entities.js later)

1. `noCanopy` guard (one wrap, unblocks CCAJET).
2. `intake:'dorsal'` branch + `semiIntake`/`shoulderIntake`/`chinSplit` variants inside existing intake branches.
3. Generic reusable details: `finFillet`, `tipRail`, `canardCant`, `chineLine`, `dorsalHump`, `noseSpike`, `hostileLights`, `facetNose`, `sawtooth`, `buriedExhaust`, `finTipPod`, `noseProbe`, `dorsalBrake`, `spineGun`.
4. Swap the SHAPES rows above; lengths all within ±15% of current (EFT 17→17, RAFALE 17→17, TEJAS 14.5→14, F47 19.5→19.5, NGAD 20.5→21, ENEMY 16.5, BOSS 22 (+10%), STD 15.5, CCAJET 11).
5. Cache safety: all new geometry should use `cacheGeo(gk('partName'), ...)` where shapes are shared; per-flag parts get distinct part names so flagged and unflagged jets never collide in the cache.
