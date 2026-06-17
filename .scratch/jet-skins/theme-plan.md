# Skystrike — Jet Paint-Skin Theme Plan

> Build spec for the cosmetic skin system. Each of the 7 textureless jets gets exactly 3 skins.
> **Skin 1 `default`** = plain solid colour, already in `js/meta.js` — **leave as-is, not designed here.**
> **Skin 2** = colour-blocking livery (per-material `zones` palette, no patterns).
> **Skin 3** = ELEVATED signature livery: colour-blocking base **+** a canvas-texture decal (procedural pattern) **+** procedural geometry accents on the mesh. Must read cooler and busier than skin 2 at a glance.
>
> Every skin also drives `accent` (the afterburner flame hex). Zone section names below match the real material names read from each `.glb` (see `SKINS` in `js/meta.js`, lines 140–183).

---

## Design throughline (the set as a whole)

The roster tells a **generational story of air power through paint discipline**, and the three skins per jet are three *states of readiness*:

- **Skin 2 is the jet at war** — functional combat camouflage tuned to its faction and to one campaign operation. Cold, tactical, broken-up.
- **Skin 3 is the jet as a legend** — the squadron's signature heritage scheme: a single saturated hero colour, a bold procedural pattern, and sculpted geometry that says "this airframe has a name." Skin 3 always trades camouflage for **identity**.

Faction colour-language is consistent across the set so the seven read as one family:
- **USA (F-47)** — desaturated greys → electric tech-blue/crimson. Drone-swarm minimalism.
- **CHINA (J-20, J-36, J-50)** — a deliberate trio: J-20 = *fire/dragon* warm reds, J-36 = *earth/desert* sand-ochre, J-50 = *ice/void* white-to-black. One element each, never repeating.
- **EUROPE / NATO (EFT)** — flamboyant Tiger Meet heritage; the loudest jet in the set.
- **US NAVY (FA18)** — sea-and-sun: aggressor greys vs. Blue Angels gold-and-blue.
- **BASELINE (FT-1)** — the neutral control; muted, the yardstick the exotics are measured against.

Campaign anchors used: **IRON VEIL** (cold, armoured, defensive — greys/steel/teal), **MIDNIGHT MERIDIAN** (night ops, stealth, void-black + neon), **SUNFIRE HORIZON** (desert/dawn, heat, gold/amber/red).

Each skin-3 owns a **different decal pattern** and a **different geo accent** so no two hero skins feel alike:

| Jet  | Skin-3 pattern        | Skin-3 geo accent                         |
|------|-----------------------|-------------------------------------------|
| FT-1 | chevrons              | dorsal spine stripe + nose band ring      |
| F-47 | hex-camo              | dorsal spine fin + intake leading slivers |
| J-20 | dragon scale (panel-grid variant) | dual canard-root flashes + tail dragon-tail fin |
| J-36 | tiger-stripe          | swept wing chevrons (delta leading edge)  |
| J-50 | shark-mouth           | nose teeth geo + twin tail flashes        |
| EFT  | tiger-stripe (full Tiger Meet) | full-length dorsal tiger spine + tailfin flash + canard tips |
| FA18 | stripes (Blue Angels speedline) | speedline spine + wingtip flashes + tail number plate |

---

## FT-1 — Multirole Trainer (BASELINE, no faction)

*The plain dependable airframe every pilot learns on. Themes stay muted and "schoolhouse" — this is the control the exotics are measured against. 8 semantic materials.*

### Skin 2 — `splinter` (keep, retuned)
**Concept.** Standard training-command splinter camo. The first "real" livery a cadet sees — disciplined, low-drama, faintly institutional blue-grey. Reads as *practice, not war*.
**Palette (zones → hex):**
- body → `#394d74` (Grey, Material)
- mid panels → `#5b73a4` (LightGrey, Material.002)
- shadow → `#141b29` (Black)
- underpanel → `#222d44` (Green)
- accent flash → `#4fd1ff` (Yellow, Material.001)
**Afterburner accent:** `#4fd1ff`

### Skin 3 — `valedictor` (ELEVATED; replaces "desert")
**Concept.** The top-graduate "instructor" scheme — a sharp slate jet wearing competition-yellow chevrons, the airframe a star cadet earns. Looks *decorated*, not deployed; cooler and far busier than the plain splinter.
**Palette (zones → hex):**
- body → `#2b3340` (Grey, Material) — darker slate than skin 2
- mid panels → `#3c4658` (LightGrey, Material.002)
- shadow → `#11161f` (Black)
- underpanel → `#202632` (Green)
- accent → `#ffcf33` (Yellow, Material.001)
**Afterburner accent:** `#ffcf33`
**Decal concept:** **chevrons** — three stacked competition-yellow (`#ffcf33`) chevrons with a thin charcoal (`#11161f`) keyline, painted across the **upper fuselage / dorsal centreline**, pointing forward.
**Geo concept:** a single raised **dorsal spine stripe** running nose-to-tail in `#ffcf33`, plus a **nose band ring** (a thin painted collar just aft of the nose) in the same yellow — small, tidy, "academy honour" energy.

---

## J-20 — Chengdu Interceptor "Mighty Dragon" (CHINA, 5th-gen)

*Long-range PL-15 missile sniper, canard-delta, 12 rich material sections. China's FIRE jet. Anchored to SUNFIRE HORIZON for skin 3.*

### Skin 2 — `splinter` (keep, retuned)
**Concept.** PLAAF low-observable green splinter — the interceptor in operational camouflage, melting into terrain on the long patrol. Cold, broken, tactical.
**Palette (zones → hex):**
- body → `#2e8a2e` (grey, material_0)
- mid panels → `#51b951` (Material.007/.005/.009)
- dark panels → `#1c541c` (Material.003/.099/.002)
- deep shadow → `#123612` (Material.001/.026)
- canopy → `#051a05` (Facade_Glass, Basic_Glass.001)
**Afterburner accent:** `#7dff3c`

### Skin 3 — `mightydragon` (ELEVATED; evolves "dragon")
**Concept.** The full dragon-emperor heritage scheme: imperial crimson and gold scales sweeping down the spine, the *Mighty Dragon* made literal. The interceptor as a national icon under the SUNFIRE HORIZON banner.
**Palette (zones → hex):**
- body → `#b21f1f` (grey, material_0) — deep imperial crimson
- mid panels → `#d4452e` (Material.007/.005/.009) — ember orange-red
- dark panels → `#7a1414` (Material.003/.099/.002)
- deep shadow → `#4d0d0d` (Material.001/.026)
- canopy → `#2a0606` (Facade_Glass, Basic_Glass.001)
- accent (gold) → `#ffc233`
**Afterburner accent:** `#ff7a1e`
**Decal concept:** **dragon-scale panel-grid** — overlapping gold-edged (`#ffc233`) scale rows on a crimson field, fading from dense scales over the **nose and forward fuselage** to sparse over the wings; reads as armoured dragon-hide.
**Geo concept:** **dual canard-root flashes** (gold spear shapes where each canard meets the fuselage) **+** a raised **tail "dragon-tail" fin flash** in gold along the vertical stabilisers — the silhouette gains a serrated, reptilian crest.

---

## J-36 — Next-gen Tailless Stealth Demonstrator (CHINA)

*Bleeding-edge tailless demonstrator, 4 material sections. China's EARTH jet — sand/ochre, distinct from J-20's fire and J-50's ice. Skin 3 anchored to SUNFIRE HORIZON.*

### Skin 2 — `panel` (keep, retuned)
**Concept.** Flight-test instrumentation scheme — teal calibration panels and data-grid markings, the look of a prototype still wearing its telemetry paint. Clinical, experimental.
**Palette (zones → hex):**
- body → `#2a7584` (PartMaterialClone)
- data panels → `#47a5b8` (DSEG14 atlas)
- shadow → `#041316` (PartTransparentZWriteClone)
- accent → `#36e0ff` (DoNothingMaterialClone)
**Afterburner accent:** `#36e0ff`

### Skin 3 — `dunestalker` (ELEVATED; evolves "sand")
**Concept.** Desert-trials predator: warm sand body with black tiger-stripe disruption, the demonstrator hunting low over SUNFIRE HORIZON dunes. Warmer, fiercer, and far busier than the clinical teal.
**Palette (zones → hex):**
- body → `#c9a45e` (PartMaterialClone) — warm desert sand
- upper panels → `#e0c891` (DSEG14 atlas) — pale dune highlight
- shadow → `#4a3617` (PartTransparentZWriteClone)
- accent → `#ff7a00` (DoNothingMaterialClone) — burnt orange
**Afterburner accent:** `#ff9500`
**Decal concept:** **tiger-stripe** — broken dark-bronze (`#4a3617`) tiger striping raking diagonally across the **upper fuselage and wing roots**, dense at the nose and thinning aft.
**Geo concept:** **swept wing chevrons** — raised burnt-orange (`#ff7a00`) chevron strakes following the delta leading edges, giving the tailless planform a pair of sharp forward-pointing arrowheads.

---

## J-50 — Next-gen Stealth (CHINA)

*Next-gen stealth, 4 material sections. China's ICE/VOID jet. The two skins are a deliberate light/dark pair, and skin 3 owns MIDNIGHT MERIDIAN (night ops).*

### Skin 2 — `arctic` (keep, retuned)
**Concept.** High-altitude arctic interceptor camo — near-white with cold steel shadowing, the jet vanishing against polar overcast. Clean, bright, defensive (IRON VEIL adjacent).
**Palette (zones → hex):**
- body → `#d3d7d9` (PartMaterialClone)
- mid/canopy → `#949ea8` (PartTransparentClone, PartTransparentZWriteClone)
- accent → `#6bd6ff` (DoNothingMaterialClone)
**Afterburner accent:** `#6bd6ff`

### Skin 3 — `nightreaper` (ELEVATED; evolves "shadow")
**Concept.** The MIDNIGHT MERIDIAN black-ops scheme — matte void-black hull with a predatory neon shark-mouth, the stealth jet that only flies after dark. Maximum contrast against the white skin 2; unmistakably the "cool" one.
**Palette (zones → hex):**
- body → `#1a1b1f` (PartMaterialClone) — near-black
- mid/canopy → `#0e0f12` (PartTransparentClone, PartTransparentZWriteClone)
- accent → `#ff3060` (DoNothingMaterialClone) — neon crimson
**Afterburner accent:** `#ff2a5a`
**Decal concept:** **shark-mouth** — a neon-crimson (`#ff3060`) toothed maw with a white (`#e8eef2`) tooth row wrapping the **nose / lower forward fuselage**, plus a single slashing red gill stroke behind it.
**Geo concept:** **nose teeth geometry** (small raised triangular teeth ringing the intake lip to make the shark-mouth three-dimensional) **+** **twin tail flashes** — thin raised crimson blades along the rear edges.

---

## F-47 — NGAD Prototype, CCA Drone Swarm Commander (USA, 6th-gen)

*Only 2 paintable sections (whole body + one atlas decal patch) → keep BOLD and simple, no fine zoning possible. The most futuristic jet; themes lean clean and high-tech. Skin 3 anchored to MIDNIGHT MERIDIAN (the swarm hunts at night).*

### Skin 2 — `ghost` (keep, retuned bolder)
**Concept.** The "ghost" prototype scheme — a single cold gunmetal body with one electric violet command-patch, the radar ghost that quarterbacks the drone swarm. Two-tone, stark, next-gen.
**Palette (zones → hex):**
- body → `#3a3f4a` (DoNothingMaterialClone) — cold gunmetal
- command patch → `#a64dff` (Atlas decal) — electric violet
**Afterburner accent:** `#b070ff`

### Skin 3 — `swarmlord` (ELEVATED; evolves "viper")
**Concept.** The swarm-commander signature: a deep black-blue hull with a glowing cyan "hive" hex-camo and a sculpted dorsal data-fin — the F-47 as the brain of a 6th-gen drone formation under MIDNIGHT MERIDIAN. Cooler and more detailed than ghost's flat two-tone despite only two paint zones (the decal + geo do the heavy lifting).
**Palette (zones → hex):**
- body → `#10182b` (DoNothingMaterialClone) — midnight blue-black
- command patch → `#1fe0ff` (Atlas decal) — electric cyan
**Afterburner accent:** `#1fe0ff`
**Decal concept:** **hex-camo** — a tessellated cyan (`#1fe0ff`) hexagon mesh fading from solid over the **forward upper body** to sparse outlines toward the tail, evoking networked drone nodes; thin `#3a6cff` connector lines between cells.
**Geo concept:** a raised **dorsal data-fin** (a low blade-antenna spine down the back) **+** **intake leading slivers** — thin glowing-cyan edge strips on the intake lips. These give the minimalist airframe visible "antenna" silhouette detail that skin 2 lacks.

---

## EFT — Eurofighter Typhoon (EUROPE / NATO, 4.5-gen)

*Canard-delta energy fighter, 23 named materials — richest-but-one surface. Real Typhoons are famous for flamboyant NATO Tiger Meet liveries → the strongest skin-3 hook in the set. This is the LOUDEST jet. Skin 3 = full Tiger Meet.*

### Skin 2 — `aurora` (keep, retuned)
**Concept.** NATO multinational air-policing scheme — magenta-violet European display colours blocked across the many panels, the show-fighter in formal coalition dress. Vivid but orderly.
**Palette (zones → hex):**
- body → `#b8479c` (white)
- mid panels → `#c988b9` (Whitish_grey.001/.002)
- dark panels → `#843370` (Material.001/.002, Not_so_dark)
- darker cluster → `#672857` (Darker_paint*, darkness*, darkenss*)
- darkest → `#541243` (Nato_black)
- wing/tail markings → `#b8479c` (Eurofighter_RT/.001, Eurofighter_LT)
- accent strip → `#ff5ad6` (Glowing_green.001)
**Afterburner accent:** `#ff5ad6`

### Skin 3 — `tigermeet` (ELEVATED; replaces "blaze")
**Concept.** Full **NATO Tiger Meet** special — burnt-orange and black tiger livery head to tail, the squadron's once-a-year showpiece. The single most decorated airframe in the game; nothing else should out-loud it. Leans SUNFIRE HORIZON heat.
**Palette (zones → hex):**
- body → `#e07b1e` (white) — tiger orange
- mid panels → `#f0a04b` (Whitish_grey.001/.002)
- dark panels → `#a8500f` (Material.001/.002, Not_so_dark)
- darker cluster → `#6e3408` (Darker_paint*, darkness*, darkenss*)
- darkest stripe black → `#140d07` (Nato_black)
- wing/tail markings → `#e07b1e` (Eurofighter_RT/.001, Eurofighter_LT)
- accent → `#ffcf33` (Glowing_green.001)
**Afterburner accent:** `#ff8a1e`
**Decal concept:** **tiger-stripe (full)** — bold black (`#140d07`) tiger stripes wrapping the **entire upper fuselage, wings, and canards**, organic and dense — the defining Tiger Meet look, not a subtle disruptor.
**Geo concept:** a **full-length dorsal tiger spine** (raised black-and-orange ridged stripe nose-to-tail) **+** a **tailfin flash** (a sculpted tiger-eye blade on the vertical stabiliser) **+** **canard tips** painted/extended in orange — the busiest geometry kit in the set, matching its status.

---

## FA18 — F/A-18 Hornet (US NAVY, carrier multirole)

*31 named materials — the richest surface in the game. Real Hornets fly aggressor schemes AND Blue Angels display colours → two strong, opposite hooks. Skin 2 = aggressor (war), skin 3 = Blue Angels (legend). Carrier ops sit naturally with IRON VEIL fleet defence.*

### Skin 2 — `aggressor` (replaces "tiger")
**Concept.** NAVY adversary-squadron splinter — cold grey-on-grey "splinter" aggressor camo used to mimic enemy jets in fleet training. Low-vis, tactical, all business. (Distinct from FT-1's blue trainer splinter: this is steel-grey naval.)
**Palette (zones → hex):**
- body → `#5b6670` (Base_paint, Base_paint_2) — medium battleship grey
- sides → `#838f99` (side_color, Whitish_grey.001/.002) — light grey
- dark panels → `#3c454d` (Not_so_dark.001, Darker_paint, Fa18_L, Fa18_R)
- darkest → `#262c31` (Darkness.001, darkenss*, Nato_black)
- engines → `#1b1f23` (Fa18_engine, engine_color)
- accent → `#36e0ff` (Glowing_green.001)
**Afterburner accent:** `#36e0ff`

### Skin 3 — `blueangel` (ELEVATED; evolves "navy")
**Concept.** **Blue Angels** display livery — deep gloss navy-blue hull with brilliant gold trim and a sweeping speedline, the Hornet as the Navy's flagship showpiece. Saturated and ceremonial against the drab aggressor grey; clearly the hero skin.
**Palette (zones → hex):**
- body → `#11367a` (Base_paint, Base_paint_2) — deep gloss blue
- sides → `#2a57b0` (side_color, Whitish_grey.001/.002) — brighter blue
- dark panels → `#0b2456` (Not_so_dark.001, Darker_paint, Fa18_L, Fa18_R)
- darkest → `#061634` (Darkness.001, darkenss*, Nato_black)
- engines → `#040d1f` (Fa18_engine, engine_color)
- gold accent → `#ffcf33` (Glowing_green.001)
**Afterburner accent:** `#ffd23f`
**Decal concept:** **stripes** — a single bold gold (`#ffcf33`) **speedline** sweeping from the nose along the **mid-fuselage waterline** to the tail, hairline-edged in white (`#eef3f8`); a thin second gold pinstripe above it. Classic display-team racing stripe.
**Geo concept:** a raised **gold speedline spine** down the dorsal centreline **+** **wingtip flashes** (gold leading-edge tips) **+** a **tail number plate** (a small raised gold rectangle on each vertical stabiliser for the display number).

---

## At-a-glance distinctness checklist

- **FT-1** — default muted grey-yellow · skin2 `splinter` blue-grey camo · skin3 `valedictor` dark slate **+ yellow chevrons + dorsal spine & nose ring**. Three clearly different; skin3 busiest. ✔
- **J-20** — default charcoal-orange · skin2 `splinter` PLAAF green camo · skin3 `mightydragon` imperial crimson **+ gold dragon-scale grid + canard & tail flashes**. Green→red is unmistakable; skin3 busiest. ✔
- **J-36** — default steel-grey · skin2 `panel` teal telemetry · skin3 `dunestalker` desert sand **+ bronze tiger-stripe + wing chevrons**. Teal→sand is a clean swap; skin3 busiest. ✔
- **J-50** — default light silver · skin2 `arctic` near-white · skin3 `nightreaper` void-black **+ neon shark-mouth + nose teeth & tail flashes**. White→black max contrast; skin3 busiest. ✔
- **F-47** — default gunmetal · skin2 `ghost` gunmetal+violet 2-tone · skin3 `swarmlord` midnight-blue+cyan **+ hex-camo + dorsal data-fin & intake slivers**. Limited zones, but pattern+geo make skin3 clearly richest. ✔
- **EFT** — default slate · skin2 `aurora` magenta coalition · skin3 `tigermeet` orange-black tiger **+ full tiger-stripe + dorsal spine, tailfin flash & canard tips**. Magenta→tiger-orange; skin3 is the loudest jet in the game. ✔
- **FA18** — default grey · skin2 `aggressor` steel splinter camo · skin3 `blueangel` gloss navy+gold **+ gold speedline stripe + spine, wingtip & tail-plate geo**. Grey→blue/gold; skin3 busiest. ✔

**Set-level checks:**
- No two skin-3s share a pattern (chevron / hex / dragon-scale / tiger-stripe×2-but-different-jets / shark-mouth / stripe) or a geo kit. ✔
- China trio reads as fire (J-20) / earth (J-36) / ice→void (J-50) — no element repeats. ✔
- Every skin gives a distinct afterburner hex from its sibling skins. ✔
- Faction colour-language coherent (USA cool-tech, China elemental trio, NATO loud heritage, Navy sea/sun, baseline muted). ✔
