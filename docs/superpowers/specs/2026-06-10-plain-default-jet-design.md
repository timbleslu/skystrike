# Plain Default Jet + Ace / Wingman / CCA Rework — Design Spec

**Date:** 2026-06-10
**Status:** Approved design, pending implementation plan

## Goal

Introduce a plain, ability-free "default" airframe and re-cast who flies what:

1. Add a plain default jet (`FT-1 STANDARD`) — selectable by the player and used by NPCs.
2. Regular (cannon-fodder) enemies and the initial sortie wingman fly the default jet.
3. Aces fly a **randomized real playable jet**, labeled with that jet's name.
4. CCA drones get their own unique plain airframe, distinct from the default jet and from real jets.
5. When the player buys a wingman through the tech tree, they choose that wingman's jet via a picker popup.

## Background (current behavior)

- `JETS` (globals.js) — 13 playable real airframes, each with `shape`, stats, `ability`, `passive`. Drives hangar carousel (`selectJet`/`renderJetCard`) and `createPlayer`.
- `SHAPES` (entities.js) — parametric geometry table; `buildJet(color, accent, cfg, hero)` builds a mesh from a SHAPES entry. Geometry is cached per `(shape.id, hero)`.
- Regular enemies — `createEnemy('fighter')` picks a random shape from `FIGHTER_SHAPES = ['SU57','EFT','TEJAS','RAFALE','FA18','J50']`, red.
- Aces — `spawnAce` (main.js) calls `createEnemy('fighter', …, {shapePool: ACE_SHAPES})`, sets `e.elite = true`, `e.callsign = 'ACE-xx'`. `ACE_SHAPES = ['J20','F22','SU57','EFT']`.
- Wingmen — `spawnWingman(temp)` (main.js). Non-temp pulls shape from `WINGMAN_POOL = ['F22','EFT','RAFALE','FA18']`; temp (CCA) pulls from `CCA_POOL = ['F47','NGAD','J50']`. `buildWingman(cca, shape)` colors them (teal escort / blue CCA).
- F-47 SWARM — `spawnCCA(pos)` (combat.js → main.js) builds a CCA from `CCA_POOL`, electric-blue.
- Tech-tree wingman nodes — `w1` WING COMMANDER, `w2` SQUADRON, `reserve` RESERVE SQUADRON (globals.js `TECH_TREE`). Each calls `spawnWingman()` + `buffFlight()`.
- `buildDrone()` (entities.js) — red octahedron kamikaze **enemy** drone (`type === 'drone'`). **Out of scope, untouched.**

## Decisions (locked)

- Default jet is **also playable**, added to `JETS`.
- Default jet sits **first in the roster (index 0)** — the literal default pick. Accepts that a returning player's saved `selectedJet` index now points one slot over (one-time cosmetic shift).
- Ace label format: **`ACE · <JET NAME>`**, e.g. `ACE · F-22 RAPTOR`. Callsign stays `ACE-xx`.
- Ace jet pool: **full playable roster, excluding `STD`** (aces are elite — no trainer aces).
- Wingman selection mechanism: **picker popup at purchase time**.
- Wingman picker roster: **full roster including `STD`**.

## Design

### Component 1 — `SHAPES.STD` (plain default airframe)

New entry in `SHAPES` (entities.js). Deliberately plain: a single swept delta wing, single vertical tail, no canard, no LERX, no twin-tail, no thrust-vectoring nozzle, no DSI/IRST/EOTS sensor flags. Reuse existing `buildJet` machinery — `STD` is just another shape config, so geometry caching, disposal, and per-instance materials all work unchanged.

`SHAPES.STD.id` is auto-assigned by the existing `Object.keys(SHAPES).forEach(...)` id pass — no special handling.

### Component 2 — `JETS` entry for the default jet (playable)

New `JETS` entry, **index 0**:

- `id:'FT-1'`, `shape:'STD'`, `name:'FT-1 STANDARD'`, role e.g. `'Multirole Trainer'`, `gen:''` (or `'BASELINE'`).
- Mid-low, unremarkable stats (e.g. speed 6 / agility 6 / accel 6 / armor 6 / stealth 4 / firepower 6) — concrete values finalized in the plan.
- Plain colors (e.g. body `0x8a96a4` gunmetal, accent `0x5fb0d0`).
- **`ability: null`, `passive: null`** — no special, no passive identity.
- `desc` / `context` short and plain.

**Null-ability handling** (the cross-cutting risk). Audit and guard every consumer of `jet.ability` / `jet.passive`:

- `renderJetCard` (ui.js) — skip the ability/passive chips when null; show a plain "no special ability" line.
- `createPlayer` / `player.special` — `SPECIAL_CD[j.id]` is already `|| 15`; ensure the special **input/trigger and HUD readout are suppressed** when `player.jet.ability` is null (HUD `el.special` currently always renders `player.jet.ability`).
- `applyJetPassives(player, j)` — must no-op for `FT-1` (default branch / explicit case).
- Anywhere else that reads `j.ability`/`j.passive` (search before implementing).

### Component 3 — Regular enemies & initial wingman → `STD`

- Regular fighter pool: `FIGHTER_SHAPES = ['STD']` (red, plain fodder). All non-ace fighters now look identical and plain — intentional contrast against recognizable aces.
- Initial sortie wingman (the `startWingman` launch): force `STD` shape rather than random `WINGMAN_POOL`. Cleanest approach: `spawnWingman` gains an explicit shape argument (see Component 5); the initial-launch call passes `'STD'`.

### Component 4 — Aces → random real jet, labeled

- `spawnAce` selects a random entry from the **full `JETS` roster except `FT-1`/`STD`**. Define an ace pool derived from `JETS` (e.g. all `JETS[i].shape` where `id !== 'FT-1'`), replacing the static `ACE_SHAPES`.
- Carry the chosen jet's **name** onto the enemy object (e.g. `e.aceName = '<JET NAME>'`).
- Label: marker/HUD shows `ACE · <name>`. Find where ace/enemy markers and callsigns render (`makeMarker`, `updateMarker`, any enemy nameplate) and append the jet name for `e.elite` enemies. Callsign `ACE-xx` is retained alongside.

### Component 5 — CCA drones → `SHAPES.CCAJET`

- New `SHAPES.CCAJET`: small **tailless** arrowhead / lambda-wing, no vertical tails, visually distinct from both `STD` and the real jets. Plain.
- Both CCA spawn paths use it, forced (no pool randomization):
  - `spawnCCA(pos)` (F-47 SWARM) — build with `SHAPES.CCAJET`, keep electric-blue body/cyan accent.
  - `spawnWingman(temp=true)` (tech-tree temp CCAs, if reachable) — same shape.
- `CCA_POOL` is removed from shape selection (delete or leave unused; remove to avoid dead code).
- Keep the existing CCA coloring, scale, glow, and behavior — only the airframe geometry changes.

### Component 6 — Tech-tree wingman jet picker (popup)

- `spawnWingman` signature becomes explicit about shape, e.g. `spawnWingman(temp, shape)`:
  - `temp` CCA path → `'CCAJET'`.
  - Initial launch → `'STD'`.
  - Tech-tree purchase → player-chosen shape.
  - Backward-compatible default preserved where a shape isn't passed (or all call sites updated).
- New modal in `index.html` — a jet picker (reuse hangar card styling / a compact grid of the 13 real jets + `FT-1`).
- New ui.js flow:
  - Buying `w1` / `w2` / `reserve` opens the picker **instead of** immediately calling `spawnWingman` + spending RP.
  - On pick: spend RP, run the node's `apply` (which spawns the wingman with the chosen shape) + `buffFlight`, close modal.
  - On cancel: no RP spent, no wingman, node remains available.
- Because the node `apply` closures currently hardcode `spawnWingman()`, the purchase flow for these three nodes is special-cased: the picker supplies the shape, then the spawn happens. Keep the node-cost / `permWingmen()` gating intact (still respect `MAX_WINGMEN`).
- The wingman sidebar already shows `w.jetName`; passing the real jet name makes it display correctly.

## Data flow summary

```
Player default pick      → JETS[0] FT-1 STANDARD (SHAPES.STD)   [no ability/passive]
Regular enemy fighter    → SHAPES.STD (red)
Initial wingman          → spawnWingman(false, 'STD')  (teal)
Ace                      → random JETS[i!=FT-1].shape (red) + label "ACE · <name>"
F-47 SWARM CCA           → spawnCCA → SHAPES.CCAJET (blue)
Tech temp CCA            → spawnWingman(true, 'CCAJET') (blue)
Tech-tree wingman buy    → picker → spawnWingman(false, <picked shape>) (teal) + buffFlight
```

## Testing

Existing harness: small unit test suites under `tests/` (`geo-cache`, `spawn-queue`, `dispose-group`). New geometry shapes flow through the same cache/dispose paths, so:

- Add/extend a test asserting `SHAPES.STD` and `SHAPES.CCAJET` get cached geometry tagged `userData.shared` and are disposed correctly (no regression in geometry cache / disposeGroup).
- Add a logic test for the ace pool: it never selects `FT-1`/`STD`, and an ace carries an `aceName` drawn from the roster.
- Add a logic test for `spawnWingman` shape routing: `temp` → `CCAJET`, explicit shape honored, initial → `STD`.
- Manual/visual verification (no automated render tests): default jet plain in hangar with no special readout; regular fodder all plain; ace labeled with jet name; CCA distinct airframe; tech-tree purchase opens picker and spawns the chosen jet; cancel spends nothing.

## Out of scope

- `buildDrone()` red octahedron kamikaze enemy — unchanged.
- Boss (`SHAPES.BOSS`) and bomber (`SHAPES.BOMBER`) airframes — unchanged.
- Wingman/CCA AI behavior, weapons, HP — unchanged (only airframe geometry + spawn shape routing change).
- Rebalancing of existing real-jet stats/abilities.

## Risks

- **Null ability/passive** is the main correctness risk — every `jet.ability`/`jet.passive` reader must be guarded. Grep exhaustively before implementing.
- **Roster index shift** (STD at index 0) — saved `selectedJet` points one slot over for returning players. Accepted as a one-time cosmetic shift; not worth a migration.
- **Node `apply` special-casing** — the three wingman nodes need their purchase flow rerouted through the picker without breaking generic tech-tree purchase logic, repeat-cost handling (`reserve`), or `MAX_WINGMEN` gating.
