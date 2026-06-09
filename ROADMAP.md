# SKYSTRIKE — Feature Roadmap

> **For agentic workers:** Each Phase is its own implementation session. Do not write code ahead of the active Phase. Verify the file map at the start of each session.

---

## Naming Decision: Tech Tree Split

- Tab 1: **TECH TREE** — the branching prerequisite node graph (overhauled layout)
- Tab 2: **ARMORY** — a flat, scrollable list of repeatable purchases and points-sink upgrades

---

## Phase 1 — Entity & Combat Logic

**Theme:** Changes confined to `entities.js`, `combat.js`, and `main.js`. No structural UI work beyond `drawEnemy` labels. Features are independent and can be implemented in any order.

---

### 1. CCA/Drone Behavior for F-47

**What:** CCAs spawn via `spawnCCA` (`main.js:171`) and are tagged `w.cca = true`, `w.temp = true`, `w.expire = 16`. However, `updateWingmen` (`main.js:246`) routes them straight into `updateWingman` — the same code path as human-named escorts. CCAs need a distinct behavior branch: skip formation-holding entirely, fly direct intercept vectors toward the nearest target at full speed, and when their `expire` timer nears zero or HP drops critically low, perform a terminal kamikaze detonation (contact blast + `explode`).

**Key distinction:** Standard escorts hold a wing slot (`wingmanSlot`) and only engage at medium range. CCAs should peel off immediately and hunt aggressively. The existing `w.cca` flag is the branch point — add an `if (w.cca)` path inside `updateWingman` (or a dedicated `updateCCA` function called from `updateWingmen`).

**Files:**
- `main.js` — `updateWingmen` (add CCA dispatch branch), `updateWingman` or new `updateCCA` function, `spawnCCA` (verify terminal detonation setup)
- `entities.js` — `buildJet` only if a new CCA mesh variant is needed (optional; current blue F-47 mesh is distinctive enough)

---

### 2. CCA Kill Point Tally Integration

**What:** `killEnemy` (`combat.js:466`) only adds to `run.kills` when `byPlayer === true`. Kills from CCA gun fire (`b.ai = true` in `wingmanFireGun`) and CCA missiles (`m.ai = true` in `wingmanFireMissile`) call `damageEnemy` with `byPlayer = false`, so they fall into the assist path only if the player hit the target first.

Add a separate `byEscort` attribution path: when a CCA finishes a kill, increment a new `run.escortKills` counter, award the player a partial RP bounty (suggested: 50% of the kill base), and ensure the HUD/post-mission screen can display it. The `run` object lives in `globals.js`; the kill counters in `combat.js`.

**Files:**
- `globals.js` — `run` object: add `escortKills: 0`
- `combat.js` — `damageEnemy` and `killEnemy`: add optional `byEscort` param; increment `run.escortKills` and award partial TP when set
- `main.js` — `wingmanFireGun` and `wingmanFireMissile`: pass `byEscort = w.cca` when calling through to the bullet/missile that kills

---

### 3. Enemy Jet Randomization + Labeling

**What:** `createEnemy('fighter', ...)` (`entities.js:535`) always passes `SHAPES.ENEMY` to `buildJet`. Randomize fighter mesh from a curated pool. Reasonable pool (avoids player-exclusive designs and large frames): `['SU57', 'EFT', 'TEJAS', 'RAFALE', 'FA18', 'J50']`. Aces should pull from a more imposing sub-pool: `['J20', 'F22', 'EFT', 'SU57']`.

Each enemy (and ace) should get a `e.callsign` string (e.g. `'BANDIT-07'` or `'ACE-VIPER'`) stored on the entity object. `drawEnemy` in `ui.js` already renders a label row — add the callsign below the HP bar for fighters, and style it distinctively for aces.

**Files:**
- `entities.js` — `createEnemy`: pick random shape from pool, build with that shape, assign `e.callsign`
- `main.js` — `spawnAce`: optionally override callsign with a named ace prefix
- `ui.js` — `drawEnemy` (`ui.js:300`): render `e.callsign` label below the HP bar

---

### 4. Enemy Ace Ability Usage

**What:** Aces (`e.elite = true`) currently spawn with boosted stats (HP 170+, turnRate 1.5, `flareAmmo = 1`) in `spawnAce` (`main.js:16`). The one flare already fires through the existing `e.state === 'evade'` flare path. What's missing is a true reactive behavior distinct from the base fighter AI.

Add three ace-specific triggers inside `updateEnemy` (`entities.js:580`) gated on `e.elite`:
1. **Defensive break:** when a player missile is within 1200u and closing, snap a sharp lateral turn and burn afterburner for 1.5s (boost `e.speed` to 280 temporarily)
2. **Desperate sprint:** when HP < 30%, set a one-time `e.desprintUsed` flag, double speed for 2s and break toward the map edge
3. **Snap shot:** during a gun run, if aligned within 0.1 rad at < 800u, fire a 2-round burst at a tighter rate than normal

**Files:**
- `entities.js` — `updateEnemy`: add `if (e.elite)` behavior branches
- `main.js` — `spawnAce`: add `e.abilityUsed = false` and `e.aceSprint = 0` initialization fields

---

## Phase 2 — Tech Tree Restructure

**Theme:** Deep changes to the data model (`globals.js`) and rendering (`ui.js`), plus CSS/HTML markup. Implement in order: overflow fix → structure overhaul → split. The split subsumes the overhaul.

---

### 5. Tech Tree UI Overflow Fix

**What:** `renderTechTree` (`ui.js:516`) computes a pixel canvas from `TECH_PAD*2 + maxX * TECH_COLW + TECH_NODEW` (currently 11 columns → ~1980px wide). The `#techgrid` container clips this silently on viewports narrower than the canvas. Fix the container to scroll both axes: `overflow: auto`, clamped `max-height: 80vh`, and `max-width: 100%`. Also ensure `recenter` scrolls to the tree root (column 5) rather than the left edge.

**Constants to know:** `TECH_COLW = 176`, `TECH_ROWH = 142`, `TECH_NODEW = 152`, `TECH_NODEH = 104`, `TECH_PAD = 28` — all in `ui.js:498`.

**Files:**
- `styles.css` — `#techgrid` (or whatever the scroll container class is): add `overflow: auto`, `max-height`, `max-width`
- `ui.js` — `renderTechTree`: fix the `recenter` scroll target to centre on the root node (column 5), not the left edge
- `index.html` — verify `#techgrid` and `#upgrade` container IDs match the CSS selectors

*Prerequisite for Features 6 and 7.*

---

### 6. Tech Tree Structure Overhaul

**What:** The tree currently spans x=0..10 × y=0..7. Reorganize the `x`/`y` coordinates in `TECH_TREE` (`globals.js:162`) to reduce horizontal sprawl. Proposed target: 7 columns (x=0..6) with tighter vertical grouping. Adjust `TECH_COLW` and `TECH_ROWH` constants in `ui.js` to match. No behavior or `apply` function changes — grid position fields only.

Suggested column mapping:
- x=0: Gunnery line
- x=1: Munitions line
- x=2: Missiles line
- x=3: Armour line (was x=4)
- x=4: Propulsion line (was x=5)
- x=5: EW line (was x=6)
- x=6: Command/Economy + Tactics + Wing (compress the right three into one column-set with distinct y-groupings)

**Files:**
- `globals.js` — `TECH_TREE`: update `x`/`y` fields on every node
- `ui.js` — `TECH_COLW`, `TECH_ROWH`, `TECH_NODEW`, `TECH_NODEH` constants

---

### 7. Split Tech Tree into TECH TREE + ARMORY

**What:** Add a two-tab layout to the `#upgrade` panel. **TECH TREE** tab keeps the node graph (post-overhaul). **ARMORY** tab is a flat CSS-grid of purchasable cards: repeatable nodes (currently just `reserve`, id tagged `repeat:true`) plus any new consumable restocks (ammo, flares, HP repair) you want to add without prereqs.

Implementation path:
1. Add `tab: 'tree' | 'armory'` to each `TECH_TREE` entry in `globals.js`
2. Tag `reserve` and any new ammo/repair nodes as `tab: 'armory'`
3. In `ui.js`, split `renderTechTree` into `renderTechTree()` (tree tab) and `renderArmory()` (armory tab), each filtering `TECH_TREE` by `tab`
4. Add tab-switch buttons in `index.html` and wire them in `ui.js`
5. The ARMORY renders as simple card divs (no SVG connectors) — reuse `.tnode` class but in a flex-wrap grid

**Files:**
- `globals.js` — `TECH_TREE`: add `tab` field to every node
- `ui.js` — `openTechScreen`, `renderTechTree`, new `renderArmory`, tab-switch handler
- `styles.css` — tab button styles, armory card grid layout
- `index.html` — tab button markup inside the `#upgrade` panel

---

## Phase 3 — Wingman System Expansion

**Theme:** Extends the wingman system with visual identity, reactive behavior, and a persistent HUD sidebar. Implement in order: model selection → ability usage → HUD sidebar (each feature adds data that the next one reads).

---

### 8. Wingman Jet Model Selection

**What:** `buildWingman(cca)` (`main.js:163`) calls `buildJet(body, accent, SHAPES.ENEMY)` — every escort looks identical. Assign each spawned wingman a shape key from a curated pool: `['F22', 'EFT', 'RAFALE', 'FA18']`. Store `w.shape` and `w.jetName` on the wingman object for the HUD sidebar (Feature 10).

CCAs should keep their current distinct blue livery but can also pull from `['F47', 'NGAD', 'J50']` for visual variety.

Selection: random from pool at spawn time. No player-facing UI for loadout selection in this phase — that's a stretch goal.

**Files:**
- `main.js` — `buildWingman`: accept `shape` param, pass to `buildJet`; `spawnWingman`: pick random shape from pool, pass to `buildWingman`, store `w.shape` on the object; `spawnCCA`: similar for CCA pool

---

### 9. Wingmen Ability Usage

**What:** `updateWingman` (`main.js:263`) only fires guns and missiles. Add three contextual behaviors for non-CCA escorts (standard wingmen, not `w.cca`):

1. **Auto-flares:** Give each wingman `w.flares = 3` at spawn. When an enemy missile's target is this wingman and the missile is within 1000u, pop flares (spawn them from `w.group.position` the same way `deployFlares` does for the player). Reuse/adapt `enemyFlares` logic.
2. **Afterburner sprint:** When engaging a target at > 2200u, boost `w._spd` by 40% for 1.5s (add `w.sprintT` cooldown so it doesn't loop).
3. **Priority salvo:** When a boss or bomber is the target and within 2500u, fire an extra missile after a 3s cooldown (`w.priorityCd`). This is on top of the normal `w.missileCd`.

**Files:**
- `main.js` — `updateWingman`: add flare check, sprint logic, priority salvo; `spawnWingman` and `reviveWingman`: initialize `w.flares`, `w.sprintT`, `w.priorityCd`
- `combat.js` — `updateMissiles`: check `m.target` against live wingmen for the flare trigger (or do it purely in `updateWingman`)

---

### 10. Wingman HUD UI Sidebar

**What:** Replace the single-line `#wingStatus` text element (`ui.js:453`) with a persistent right-side sidebar panel. Each wingman gets a DOM row showing: call sign (`w.name`), jet abbreviation (`w.shape` from Feature 8), and a mini HP bar. Downed wingmen show a dim row with "RTB Xs" countdown. CCA rows show their `expire` countdown instead of HP.

The sidebar is hidden in `state === 'hangar'` and visible during `state === 'playing'`. Update every frame in `updateDom` via a new `updateWingmanSidebar()` helper. Rows are created/destroyed on wingman spawn/removal — hook into `spawnWingman`, `reviveWingman`, and `clearWingmen` in `main.js`.

**Files:**
- `index.html` — new `#wingSidebar` div (fixed right edge, inside the game HUD layer); remove or hide the old `#wingStatus` element
- `styles.css` — sidebar: fixed position, right edge, translucent background; row layout; HP bar; downed/CCA state variants
- `ui.js` — `cacheEl`: cache `#wingSidebar`; `updateDom`: call `updateWingmanSidebar()`; new `updateWingmanSidebar()` function
- `main.js` — `spawnWingman`, `reviveWingman`, `clearWingmen`: add/remove sidebar row DOM elements (or let `updateWingmanSidebar` regenerate them each frame — simpler but slightly heavier)

---

## Cross-Phase Dependencies

```
Phase 1:  Feature 2 depends on Feature 1 — CCA kill attribution requires CCAs to behave
          distinctly enough to be worth tracking separately.

Phase 2:  Feature 5 must come before 6 and 7 (fix before restructure/split).
          Features 6 and 7 should be done in the same session.

Phase 3:  Feature 8 → 9 → 10 in strict order.
          Feature 10 reads w.shape (from 8) and w.flares (from 9).
```

---

## File Change Surface Summary

| File          | Phase 1        | Phase 2        | Phase 3        |
|---------------|----------------|----------------|----------------|
| `globals.js`  | F2 (run obj)   | F5 F6 F7       |                |
| `entities.js` | F1 F3 F4       |                |                |
| `combat.js`   | F2 F4          |                | F9             |
| `main.js`     | F1 F2 F3 F4    |                | F8 F9 F10      |
| `ui.js`       | F3             | F5 F6 F7       | F10            |
| `styles.css`  |                | F5 F7          | F10            |
| `index.html`  |                | F5 F7          | F10            |
