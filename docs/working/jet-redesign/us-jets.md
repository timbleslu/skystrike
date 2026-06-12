# US Jet Redesign Spec — F22, F35, FA18, BOMBER

Coordinate conventions (from `buildJet`/`SHAPES` in js/entities.js): forward = **-Z**; nose tip at `z = -len/2 - noseLen`; `wing/htail` = right-half planforms `[spanX, chordZ]` traced LE-root → LE-tip → tip TE → TE root. `half = len/2`, `fR = frontR`. All flags hero-gated like existing details.

## F22

**Current problems**
- LE sweep ≈26° (`[[1.4,-2],[10,2.2]]`) vs real 42° — reads as an F-16.
- No forward-swept TE: current TE tapers aft; the Raptor's diamond wing has TE swept forward ~17° (tip TE aft of root TE).
- Tip chord too wide (1.8 units vs clipped ~1.3).
- Vtails under-canted (`0.30`≈17° vs real 28°) and too small; htail floats aft instead of nesting against the wing TE.
- No tail booms/stingers flanking the 2D nozzles — the signature rear aspect.

**New SHAPES entry**
```js
F22:  { len:18, noseLen:6.5, frontR:1.5, rearR:1.15, flat:0.6,
        wing:[[1.6,-1.6],[9.3,6.2],[9.3,7.5],[1.6,5.0]], wingY:-0.2, wingThick:0.55,  // 42° LE, 17° fwd-swept TE diamond
        htail:[[1.0,5.4],[4.9,8.7],[4.9,9.9],[1.0,8.6]],   // clipped diamond, LE continues wing TE line
        vtail:{type:'twin', base:3.8, tip:1.5, h:4.3, sweep:1.5, x:2.1, z:4.4, cant:0.49},
        lerx:true, engines:2, gap:2.0, intake:'side', wingspan:9.3,
        tailBoom:true, boomRecept:true, gunPort:true },   // keep clean:true, nozzle:'2d' post-table flags
```

**New feature flags**
1. `tailBoom: true` — twin stinger booms outboard of the nozzles. Per side: `BoxGeometry(0.9, rR*flat*1.1, 4.2)` (`body` mat) at `x=±(gap/2 + rR*1.15), y=0, z=half-0.6`, plus a `ConeGeometry(0.45,1.4,4)` rotated `x=π/2`, `scale.y=flat`, tip at `z=half+2.2`.
2. `boomRecept: true` — dorsal refueling receptacle: flush `BoxGeometry(0.9, 0.04, 1.3)` (`panel`) at `(0, fR*flat*0.52 + fR*0.31, canopyZ + 4.2)` (just proud of the spine capsule).
3. `gunPort: true` — starboard wing-root gun fairing (no mirror): `SphereGeometry(0.28,10,8)` (`dark`), `scale.set(1,0.55,2.2)`, at `(fR*0.95, fR*flat*0.35, -half+3.2)`.

## F35

**Current problems**
- LE sweep ≈26° vs real 33–34°; tip chord 2.5 vs taper-ratio-correct ~1.6.
- Hull not deep enough for "fat Amy" — `flat` should rise to 0.72, `rearR` up for the single big F135 nozzle.
- Vtail cant overdone (0.50≈29° vs ~24°→0.42), fins a touch far forward.
- Missing A-model details: boom receptacle, port-shoulder GAU-22 fairing, sawtooth bay-door edges.

**New SHAPES entry**
```js
F35:  { len:16, noseLen:5.5, frontR:1.7, rearR:1.35, flat:0.72,
        wing:[[1.7,-0.8],[7.8,3.2],[7.8,4.8],[1.7,6.4]], wingY:-0.2, wingThick:0.6,  // 33° LE, taper ~0.23
        htail:[[1.0,5.2],[4.4,7.5],[4.4,8.9],[1.0,8.8]],
        vtail:{type:'twin', base:3.4, tip:1.2, h:3.9, sweep:1.6, x:1.8, z:4.8, cant:0.42},
        lerx:true, engines:1, gap:0, intake:'side', wingspan:7.8,
        boomRecept:true, gunPort:'shoulder', sawtoothDoors:true },  // keep clean/dsi/eots flags
```

**New feature flags**
1. `boomRecept: true` — same recipe as F22; position `(0, spineTopY+0.02, canopyZ+3.6)` with `spineTopY = fR*flat*0.52 + fR*0.31`.
2. `gunPort: 'shoulder'` — extend gunPort to accept `'shoulder'`: GAU-22 fairing on the **port** upper shoulder: `SphereGeometry(0.34,10,8)` (`body`), `scale.set(0.8,0.6,2.6)` at `(-fR*0.8, fR*flat*0.5, -half+3.0)`.
3. `sawtoothDoors: true` — replace the straight `clean` bay-door seams with zigzags: per side, 4 segments `BoxGeometry(0.05,0.05,L*0.06)` (`panel`), alternately `rotation.y = ±0.5`, segment k at `(sx*fR*0.55, -fR*flat-0.01, -half*0.05 + (k-1.5)*L*0.055)`; skip the straight door slabs when set.
4. `dorsalHump: true` (optional generic) — scale existing spine mesh `(1.05, 0.75, 1)` for the humped back.

## FA18

**Current problems**
- Wing too tapered/raked: real Super Hornet is a trapezoid — ~27° LE, **near-straight TE**, fat tip (taper ~0.35); current TE is strongly raked and root chord too long.
- Vtails too far aft (`z:4.0`): the Hornet's fins sit forward, between wing TE and stabs, over the LERX line; cant should be ~20° (0.35), not 0.42.
- Generic LERX too small — the long windscreen-to-wing-root LERX is the single most identifying feature.
- Missing wing-fold hinges, tip launch rails, refueling probe.

**New SHAPES entry**
```js
FA18:{ len:16.5, noseLen:6, frontR:1.5, rearR:1.2, flat:0.64,
        wing:[[1.8,-0.5],[8.4,2.9],[8.4,4.6],[1.8,5.0]], wingY:-0.15, wingThick:0.55,  // 27° LE, straight TE
        htail:[[1.0,5.2],[4.9,6.9],[4.9,8.3],[1.0,8.6]],
        vtail:{type:'twin', base:3.4, tip:1.1, h:3.9, sweep:1.7, x:1.9, z:3.0, cant:0.35},
        lerx:true, bigLerx:true, engines:2, gap:1.8, intake:'side', wingspan:8.4,
        wingFold:true, tipRails:true, refuelProbe:true },
```

**New feature flags**
1. `bigLerx: true` — override the generic LERX points: `lpts = [[0.8, lz+0.6],[3.0, lz-1.2],[2.4, lz-4.6],[0.8, lz-noseLen*0.78]]` (`lz = wing[0][1]`), thickness 0.26, `y = wy+0.16`.
2. `wingFold: true` — hinge fairings at 62% half-span: per side `BoxGeometry(0.22, wingThick*1.7, 2.4)` (`panel`) + `CylinderGeometry(0.09,0.09,2.4,6)` (`steel`, rotated `x=π/2`) on top, at `x=±5.2, y=wy+wingThick*0.5, z≈2.9` (local mid-chord).
3. `tipRails: true` — wingtip launch rails: per side `BoxGeometry(0.22,0.3,3.2)` (`dark`) at `(±tx, wy, tz+0.4)` (max-span point ≈ (8.4, 3.7)); `buildTipMissile` then hangs at `y = wy-0.3` under the rail.
4. `refuelProbe: true` — retracted probe door, starboard nose: `BoxGeometry(0.08,0.5,1.5)` (`panel`) at `(fR*0.7, fR*flat*0.3, -half+1.2)`, `rotation.y≈0.15`.

## BOMBER

**Current problems**
- It's a conventional tube-and-wing bomber (tall single vtail + htail + small straight wing) — nothing like a B-2/B-21 flying wing. Needs: no tails, wing-as-body with root chord ≈ vehicle length, ~35° LE sweep, W/sawtooth trailing edge, beak cockpit blister, dorsal (not belly) intakes.

**New SHAPES entry**
```js
BOMBER:{ len:21, noseLen:4, frontR:2.2, rearR:1.7, flat:0.5,   // len -12.5%, within ±15%
        // flying wing: 35° LE, W trailing edge (tip → notch → outboard point → root)
        wing:[[2.0,-8.0],[15,2.0],[15,3.8],[10.5,0.8],[6.0,5.2],[2.2,1.6]],
        wingY:0, wingThick:1.15,
        lerx:false, engines:2, gap:5.0, intake:'none', wingspan:15,   // no vtail/htail
        clean:true, nozzle:'2d', eots:true,
        flyingWing:true, dorsalIntake:true, bayDoors:true },
```
`intake:'none'` falls through both existing intake branches. The thick low-`flat` extruded wing blends into the short fat centerbody; 2D nozzles at `half+1.6` exhaust over the root-TE deck (correct over-wing B-2 exhaust).

**New feature flags**
1. `flyingWing: true` — suppress bubble canopy/windscreen/sill/spine/tip-missiles/side slime strips; add a flush cockpit beak: `SphereGeometry(fR*0.7,16,10)` (`body`), `scale.set(1.6,0.55,1.8)` at `(0, fR*flat*0.75, -half-noseLen*0.35)`, plus two `PlaneGeometry(0.9,0.45)` glass window quads canted `rotation.x=-0.6, rotation.y=±0.5` at `(±0.7, fR*flat*0.95, -half-noseLen*0.45)`.
2. `dorsalIntake: true` — twin buried over-wing inlets: per side reuse `intakeDuctGeo(2.2,0.9,3.0)` (`dark`) on TOP at `(±(gap/2+0.6), fR*flat*0.55, -half+2.5)`, plus a `body` hump `SphereGeometry(1.4,14,10)` scaled `(1.1,0.4,1.9)` at same x/z, `y=fR*flat*0.7`.
3. `bayDoors: true` — twin long belly bay outlines (replaces fighter-sized `clean` doors): per side rails `BoxGeometry(0.06,0.05,7.5)` (`panel`) at `x=sx*1.2` and `x=sx*3.0`, `y=-fR*flat-0.02`, `z=1.5`; cross seams `BoxGeometry(1.9,0.05,0.06)` at `z=1.5∓3.75, x=sx*2.1`.
4. `sawtoothTE: true` (generic, reusable) — zigzag TE seams using the `sawtoothDoors` segment recipe oriented along `buildHingeSeam`'s TE endpoint math; BOMBER's W comes from the planform itself, flag intended for other stealth airframes.
