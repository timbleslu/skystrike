# Weather + Time-of-Day Gameplay — Design Spec

**Date:** 2026-06-14
**Feature:** #4 of 4 (controls → meta-progression → missions+bosses → **weather**)
**Target branch:** `feat/weather-tod` (off `master`)
**Status:** Approved design forks, pre-plan

## 1. Overview

Time-of-day is currently **cosmetic only** (`applyTimeOfDay` tints sky/sea/clouds/fog). This feature makes **weather + TOD affect gameplay**, chosen **tactically per mission/sector** (chosen fork). Three condition effects:

- **Night** (TOD) — reduced radar/detection range.
- **Storm** — missile lock penalty + cockpit turbulence + darkened, denser sky.
- **Fog** — cut view/visual + lock distance via heavy fog.

Reuses the existing `applyTimeOfDay` / `scene.fog` (`FogExp2`) / `retintClouds` / `updateClouds` pipeline — no new heavy render systems.

## 2. Goals / Non-Goals

**Goals**
- A `weather` state with per-type gameplay modifiers (radar range, lock range/speed, turbulence, view/fog).
- `applyWeather(type)` sets modifiers and drives the visual changes through the existing TOD/fog/cloud path.
- Modifiers read where they matter: radar in `drawHUD`, lock in `combat.js`, fog/visibility in `engine.js`.
- Weather/TOD chosen per sector/mission (set by op-map / `missions.js`).
- A HUD weather chip + objective line shows the active condition.
- All strings EN + ZH.

**Non-Goals (YAGNI)**
- No full particle weather simulation; rain/lightning (if included) are modest, optional FX.
- No dynamic mid-mission weather transitions in v1 (set at sector start).
- No player-selectable weather (that was the rejected fork) — selection is mission-tied.

## 3. Architecture

**State (`globals.js`)**
```js
let weather = {
  type: 'clear',     // clear | fog | storm   (night is TOD, combines with any)
  radarMul: 1.0,     // detection / radar range multiplier (<1 = shorter)
  lockRangeMul: 1.0, // missile lock acquisition range
  lockSpeedMul: 1.0, // lock-on speed (>1 = slower)
  turbulence: 0.0,   // 0..1 random attitude perturbation amplitude
  fogMul: 1.0,       // FogExp2 density multiplier
};
const WEATHER = {
  clear: { radarMul:1.0, lockRangeMul:1.0, lockSpeedMul:1.0, turbulence:0.0, fogMul:1.0 },
  fog:   { radarMul:0.8, lockRangeMul:0.65, lockSpeedMul:1.15, turbulence:0.05, fogMul:3.0 },
  storm: { radarMul:0.7, lockRangeMul:0.6, lockSpeedMul:1.35, turbulence:0.35, fogMul:1.6 },
};
// night is a TOD index (timeOfDay===2) that additionally applies radarMul *= ~0.75
```
(Constants illustrative; tuned in implementation. Ordering invariants asserted in tests: storm turbulence > fog > clear; clear penalties are all 1.0.)

**`applyWeather(type)` (engine.js, sibling of `applyTimeOfDay`)**
- Copies `WEATHER[type]` into `weather`, folds in the night TOD radar factor.
- Drives visuals: scale `scene.fog.density` by `fogMul`; darken sky/cloud tint for storm via the existing `retintClouds`/sky-uniform path; (optional) enable a modest rain billboard / occasional lightning flash for storm.
- `updateWeather(dt)` ticks animated bits (turbulence phase, lightning timer).

**Modifier consumption**
- **Radar:** `drawHUD` radar/detection range × `weather.radarMul` (and night factor). Off-radar enemies stay hidden longer.
- **Lock:** `combat.js` lock acquisition uses `lockRangeMul` (range gate) and `lockSpeedMul` (folds into `lockSpeedMul`-style timing already present for AESA).
- **Turbulence:** `combat.js` player (and AI) update adds a small, smoothly-varying pitch/roll perturbation scaled by `weather.turbulence` — additive to `flightInput` (feature #1) / control input, clamped.
- **Fog/visibility:** `scene.fog.density` change cuts draw distance; enemy markers/visuals fade sooner.

**Selection (mission-tied)**
- `opmap.js` `sectorPlan` (extended in feature #3) returns a `weather` type (+ TOD) per sector; `missions.js` / `main.js` calls `applyWeather(type)` + `applyTimeOfDay(tod)` at sector start.
- Standalone (non-op-map) play: weather rolled per run from a seeded rng, weighted toward `clear`.

## 4. UI (ui.js)

- **Weather chip** on the HUD (icon + localized label: Clear / Fog / Storm, plus a Night indicator).
- Sector/objective intro line names the condition (e.g. "STORM — lock degraded").
- Optional: subtle full-screen vignette/darkening in storm.

## 5. Persistence & i18n

- **Persistence:** none new — weather is per-sector/run state. (If standalone weather should be reproducible, it derives from the existing run seed.)
- **i18n:** condition names + the HUD chip + intro lines — EN + ZH in `js/i18n.js`.

## 6. Testing (`tests/weather.test.js`, mirrored byte-identical)

- `WEATHER` table invariants: `clear` all-neutral; `storm.turbulence > fog.turbulence > clear.turbulence`; `fog.fogMul > storm.fogMul > clear.fogMul`; all penalty muls in (0,1] except `lockSpeedMul ≥ 1`.
- `applyWeather('storm')` populates `weather` with the storm row (+ night factor when `timeOfDay===2`).
- Turbulence sampler stays within `±weather.turbulence` bounds and is zero-mean over a cycle.
- Night radar factor multiplies `radarMul` only at the night TOD index.

## 7. Files Touched

| File | Change |
|---|---|
| `js/globals.js` | `weather` state + `WEATHER` table |
| `js/engine.js` | `applyWeather(type)` + `updateWeather(dt)` (fog density, storm tint, optional rain/lightning); sibling of `applyTimeOfDay` |
| `js/combat.js` | apply `lockRangeMul`/`lockSpeedMul` to lock; add turbulence perturbation to control input |
| `js/ui.js` | radar range × `radarMul`; weather HUD chip + intro line |
| `js/opmap.js` | `sectorPlan` returns weather type per sector (coordinated with feature #3) |
| `js/main.js` | call `applyWeather`/`applyTimeOfDay` at sector start; tick `updateWeather` |
| `js/i18n.js` | EN + ZH strings |
| `tests/weather.test.js` | **new** |
| `CLAUDE.md` | Architecture (engine.js weather row), Current state |

## 8. Phased Roadmap (bite-sized TDD steps generated at implementation start)

1. **Weather state + table + `applyWeather` (modifiers only)** — no visuals yet. Tests.
2. **Visual layer** — fog density + storm sky/cloud tint via existing TOD path. Visual verify (`scripts/shot.mjs`).
3. **Lock + radar modifiers** — wire `lockRangeMul`/`lockSpeedMul` (combat) + `radarMul` (HUD), incl. night factor. Tests.
4. **Turbulence** — smooth attitude perturbation on player (+ AI), clamped. Tests.
5. **Mission-tied selection** — `sectorPlan` weather + apply at sector start + HUD chip. Tests.
6. **Optional storm FX** — modest rain billboard / lightning flashes. Visual verify.
7. **i18n EN+ZH + CLAUDE.md + visual verify across 3 TODs × weather.**

## 9. Interfaces to Other Features

- **#1 Controls:** turbulence is additive to the unified `flightInput` (clamped after add).
- **#3 Missions:** `sectorPlan` carries the `weather` slot; missions/sectors set it.

## 10. Acceptance Criteria

1. `npm test` green incl. `weather.test.js`.
2. `applyWeather` changes fog/sky visibly per condition (verified via `scripts/shot.mjs`).
3. Storm degrades missile lock (range + speed) and adds visible turbulence; fog cuts view + lock range; night cuts radar range.
4. Weather/TOD is set per sector/mission and shown on the HUD chip + intro line (EN + ZH).
5. Modifiers are bounded (no soft-lock: lock still achievable, turbulence non-disorienting) and clear weather is neutral.
6. Standalone play rolls weather deterministically from the run seed.
