# Feature Factory Batch 1 — 10-Feature Design

**Date:** 2026-07-13 · **Status:** approved (brainstorm session)
**Execution model:** two waves of 5 parallel worktree sub-agents, merge queue per wave.

## Batch structure

- **Wave 1** — gameplay depth ×5 (F1–F5). Branch from current master. Each feature owns distinct functions; shared files (`combat.js` for F1/F4/F5, `main.js` for F2/F3, plus append-only tails of `core.js`/`i18n.js`) are partitioned by the "Owned code" line in each spec — an agent touches only its owned functions.
- **Wave 2** — content ×2, meta ×2, debt ×1 (F6–F10). Branch from post-wave-1 master; may build on wave-1 systems.
- **Merge queue (per wave):** order by footprint size ascending. Per branch: `git rebase master` → full `npm test` → `node scripts/shot.mjs <feat>-check` → merge to master → prune branch → next.
- **Append-block convention:** all new `core.js` logic and `i18n.js` keys go in a feature-labeled block at the file tail (`// === F<N> <name> ===`) so cross-feature conflicts resolve trivially on rebase.
- **Repo hard rules apply** (see `CLAUDE.md`): all user-facing strings through `t(key)`/`jetText`/`techText`/`metaText` with EN+ZH+KO entries; no `localStorage` outside `storage.js`; no ES modules (CommonJS export footer only on require-safe files); new pure logic goes in `core.js` and is `require()`d by its test, never mirrored; Three.js vendored.

## Wave 1 — gameplay depth

### F1 — Gun overheat
- **Mechanic:** firing builds heat 0→1; at 1.0 guns lock out until heat cools below a re-arm threshold (hysteresis, ~0.35); heat decays when not firing. HUD heat gauge rendered per skin (canvas bar near ammo readout).
- **Pure core:** `HEAT` tunables + `heatStep(heat, firing, dt)` → `{heat, locked, justLocked, justArmed}` (transition flags for banner/sfx, mirroring `advanceLock` style).
- **Owned code:** `combat.js` gun-fire block (gate fire on `!locked`), `hud.js` new `drawHeatGauge`.
- **Balance guard:** default tuning allows ≥4 s continuous fire before lockout.
- **Tests:** `tests/heat.test.js` — accumulation, decay, lockout crossing, re-arm hysteresis, clamping.
- **Visual verify:** shot.mjs flight/fx shows gauge filling while firing; lockout banner keyed `banner.gunsOverheat`.

### F2 — Enemy formations
- **Mechanic:** non-boss fighter waves of ≥3 spawn as a formation (vee / wall / echelon / pincer) with a leader; followers steer toward slot offsets until a break condition (player within engage range, or leader dead), then revert to normal AI.
- **Pure core:** `FORMATIONS` table + `formationSlots(type, n, spacing)` → local offsets; `formationBreak(distToPlayer, leaderAlive, cfg)` → bool.
- **Owned code:** `main.js` spawn functions (formation assignment at wave spawn), `entities.js` follower slot-steering in `updateEnemy`.
- **Tests:** `tests/formation.test.js` — slot geometry (symmetry, counts, spacing), break-condition logic.
- **Visual verify:** flight/terrain shot with a 5-ship vee visible after spawn.

### F3 — Wingman command wheel
- **Mechanic:** three orders — ENGAGE (attack player's locked target), COVER (prioritize enemies targeting the player), REGROUP (form on player, weapons hold). Default state FREE = current behavior. Keys 4/5/6 (`Digit4–6`) + touch buttons (`tb-` prefix, beside AWACS buttons); wingman sidebar shows active order.
- **Pure core:** `WINGMAN_ORDERS` + `wingmanOrder(state, cmd)` state machine → `{order, banner}`; target-death / player-lock-lost fallback → FREE.
- **Owned code:** `main.js` wingman AI block (read order, adjust target selection), `controls.js` `bindBtn` additions, `ui-hud.js` `updateWingmanSidebar` order badge.
- **Tests:** `tests/wingman-orders.test.js` — transitions, invalid cmd no-op, fallback-to-FREE conditions.
- **Visual verify:** HUD shot with sidebar order badge visible.

### F4 — Enemy defensive AI
- **Mechanic:** enemies react to being locked / inbound missiles: cooldown-gated break-turn (temporary turn-rate multiplier, ~1.5 s) and finite flares that can spoof player missiles (mirror of player flare logic). Mooks carry 1 flare, aces 2–3, bosses use break-turns only.
- **Pure core:** `EVADE` tunables + `evadeDecision(state{lastEvade, flares}, threat{lockProgress, missileDist}, now)` → `{action: 'none'|'break'|'flare', state}`.
- **Owned code:** `entities.js` `updateEnemy` (apply break-turn), `combat.js` `updateMissiles` (enemy flare spoof chance).
- **Tests:** `tests/evade.test.js` — cooldown gating, flare depletion, trigger thresholds, boss never flares.
- **Visual verify:** fx shot showing enemy flare pop.

### F5 — Kill-streak momentum
- **Mechanic:** kills within a chain window (~6 s) build a streak; multiplier tiers ×1 / ×1.5 / ×2 / ×3 at counts 0/3/6/10 applied to score in `killEnemy`; window lapse resets count; player death resets. Banner at tier crossings + HUD streak chip near score.
- **Pure core:** `STREAK` tunables + `streakStep(streak{count, mult, t}, event 'kill'|'death', now)` → new streak (window checked against `streak.t`).
- **Owned code:** `combat.js` `killEnemy` (score multiply + step call), `hud.js` streak chip.
- **Tests:** `tests/streak.test.js` — chain within window, lapse reset, death reset, tier thresholds, multiplier values.
- **Visual verify:** HUD shot with streak chip at tier ≥2.

## Wave 2 — content, meta, debt

### F6 — Operation 4
- **Scope:** new `OPERATIONS` entry — 8 linear levels, new region theme (suggest arctic "POLAR VORTEX"; agent has creative latitude), 3-phase boss with callsign/intro, per-level blurb/objectives/enemyIntel i18n (EN+ZH+KO), ≥2 levels with multi-phase `objectives` sequences, ≥1 level with a `setpiece`, per-level `stars` conditions on ≥3 levels. Data-table + i18n work only — no new engine mechanics; may reference wave-1 systems through existing spawn fields.
- **Owned code:** `opmap.js` `OPERATIONS` table, `i18n.js` (large append block).
- **Tests:** extend `tests/op-map.test.js` — table-shape invariants over op4 (ids, waves bounds, boss phases length, star-cond validity).
- **Visual verify:** briefing screen + terrain shots for ≥3 distinct level types.

### F7 — New flyable jet + hostile ace variant
- **Scope:** one new airframe — `JETS` roster entry (distinct stat/ability niche vs existing 12), `SHAPES` entry using existing feature flags (procedural `buildJet` path; no glTF required), SP unlock cost, 3 `SKINS` entries (default + 2 colour-block liveries), inclusion in ace shape pool.
- **Owned code:** `roster.js`, `airframes.js`, `meta.js` `SKINS`, `i18n.js` jet/skin strings.
- **Tests:** existing `plain-shapes` / `npc-airframes` / `ace-pool` / `has-special` suites must pass with the new entry (they validate the real tables).
- **Visual verify:** `node scripts/beauty.mjs <feat>` close-ups + hangar shot.

### F8 — Weekly challenge
- **Scope:** deterministic weekly mode beside daily — `weeklySeedFor(dateStr)` (ISO-week, mirrors `dailySeedFor`, never reads the clock) + `WEEKLY_MODIFIERS` table + `weeklyModifiers(seed)` picking 2 stacked modifiers (e.g. stormFront = weather locked storm, noFlares, doubleAces, ironHull = no resupply, fogOfWar = radar range halved). Applied at `startGame` via existing globals. Weekly best stored in `meta` keyed by week id (save-healed).
- **Owned code:** `core.js` block, `ui-flow.js` entry (`refreshWeeklyEntry` beside daily), `meta.js` best field.
- **Tests:** `tests/weekly.test.js` — seed determinism (TZ-independent), modifier pick determinism, no-clock rule, meta heal.
- **Visual verify:** hangar shot with weekly entry card.

### F9 — Per-jet veterancy
- **Scope:** kills accumulate per airframe (`meta.veterancy[jetId]`, stamped in `endRun`); pure `vetRank(kills)` → 5 rank thresholds; rank insignia chip on the hangar jet card; one modest per-rank perk (e.g. +1% turn rate per rank, cap +5%) applied in the `applyMetaPerks` path. `loadMeta` heals missing field with no progression wipe.
- **Owned code:** `meta.js`, `ui-hangar.js` `renderJetCard` chip, `core.js` `vetRank`.
- **Tests:** extend `tests/meta.test.js` — thresholds, accumulation hook, legacy-save heal, perk cap.
- **Visual verify:** hangar shot with insignia chip.

### F10 — Reset-path material leak fix (known debt)
- **Scope:** write `scripts/verify-leak.mjs` FIRST — headless N cycles of `startGame` → `returnToHangar`, assert `renderer.info.memory.geometries`/`textures` and material counts plateau. Must be RED on current master (reproduces the known leak). Then fix the `disposeGroup`/geometry-cache reset path (`entities.js`/`engine.js` notes). No behavior change; all existing tests stay green.
- **Owned code:** `entities.js` `disposeGroup`/cache path, `engine.js` if needed, new script.
- **Tests:** the leak script red→green is the acceptance gate; full unit suite unchanged.
- **Visual verify:** shot.mjs unchanged before/after (no visual regression).

## Verification contract (every agent)

1. `npm test` — full unit suite green.
2. `node scripts/shot.mjs <feat>-check` — hangar/flight/fx/terrain screenshots captured and inspected.
3. Author `scripts/verify-<feat>.mjs` headless assert where the feature has runtime behavior a unit test can't reach (repo convention).
4. i18n parity: every new key present in EN+ZH+KO.
5. `tests/storage.test.js` still green (no stray localStorage).

## Escalation & reporting

- Max 3 self-correction attempts per feature; then park the branch unmerged and report the blocker. Never force a red merge.
- Final report table: feature | status (merged/parked) | tests (pass/fail counts) | screenshots (prefix) | commit hash | attempts.

## Model routing

Builders opus; adversarial verification + merge-queue decisions fable; screenshot sanity sweeps haiku. Orchestration stays on the session model.

## Out of scope

- iOS storage swap to `@capacitor/preferences` — requires device testing agents can't perform; deliberately excluded from the factory.
- glTF hero models for F7 — procedural path only this batch.
