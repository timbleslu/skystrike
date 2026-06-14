# Missions + Boss Aces — Design Spec

**Date:** 2026-06-14
**Feature:** #3 of 4 (controls → meta-progression → **missions+bosses** → weather)
**Target branch:** `feat/missions-bosses` (off `master`)
**Status:** Approved design forks, pre-plan

## 1. Overview

Replace pure wave-survival with **typed missions** and **sector boss aces**. Delivery model (chosen): **op-map sets the mission type, the wave system delivers it.** Each op-map node carries a mission type; the wave scheduler spawns to satisfy that mission's objective; a sector's final node is a **boss ace** that graduates from the existing `rival.js` nemesis system.

## 2. Goals / Non-Goals

**Goals**
- Mission types: **sweep** (clear waves — current behaviour, now explicit), **intercept** (destroy N targets before a timer), **escort** (protect a convoy to its exit), **defend** (keep an asset alive for a duration), **strike/SEAD** (destroy a fortified ground site — reuses `queueStrikeSite`).
- Op-map nodes are typed; `sectorPlan` carries objective params; the wave loop spawns accordingly.
- Per-mission objective HUD (progress + win/fail).
- Sector-capping **boss ace** built on `rival.js` (`rivalDue`/`genRival`/`rivalEscaped`/`rivalDefeated`/`rivalSpecialFor`): defeat advances the op-map; escape escalates the rival (`rivalEscaped` → level+1).
- All strings EN + ZH.

**Non-Goals (YAGNI)**
- No branching dialog/story, no cutscenes.
- No new enemy *types* beyond reusing existing ones in mission roles (convoy/asset reuse ground + fleeing-convoy from `queueStrikeSite`).
- No mission editor.

## 3. Architecture

New global module **`js/missions.js`** (pure mission table + objective state machine), loaded after `opmap.js`:

```
… rival.js → meta.js → opmap.js → missions.js → combat.js → ui.js → main.js
```

**State**
```js
let mission = {
  type: 'sweep',        // sweep | intercept | escort | defend | strike
  target: 0,            // required count / asset ref
  progress: 0,          // kills made / convoy survivors / time elapsed
  timer: 0,             // seconds remaining (intercept/defend) or 0
  status: 'active',     // active | won | failed
  params: {},           // per-type extras (exit pos, asset hp, etc.)
};
```

**Module API (`missions.js`, pure logic + thin spawn hints)**
- `MISSIONS` table: per type → `{ setup(wave, rng) → params, onKill(e, mission), onTick(dt, mission), winFail(mission) → 'won'|'failed'|'active', objectiveText(mission) }`.
- `startMission(type, wave, rng)` — builds `mission`, returns spawn directives the scheduler consumes.
- `updateMission(dt)` — ticks timer/progress, calls `winFail`; on resolve, advances sector / triggers boss / fails run as appropriate.
- `missionKill(e)` — called from `killEnemy` to credit objective progress (intercept targets, escort attackers, defend wave).

**Op-map integration (`opmap.js`)**
- `genOpMap` assigns each node a `mission` type (last node in a sector = `boss`).
- `sectorPlan(type, wave)` extended to return `{ enemies…, mission, weather? }` so the scheduler knows what to run. (`weather` slot is consumed by feature #4.)

**Wave delivery (`main.js`)**
- The wave scheduler reads the active `mission` and spawns to satisfy it: sweep = current wave gen; intercept = a fixed target set + countdown; escort = `queueStrikeSite`'s fleeing convoy as the protectee; defend = a stationary asset + attacker waves; strike = `queueStrikeSite` fortified site.
- `updateMission(dt)` ticked each frame; win → `rivalDefeated`/sector advance + SP via feature #2; fail → mission-failed banner + sector outcome.

**Boss aces (`rival.js`)**
- Sector boss node spawns the rival ace via `genRival`/existing rival spawn path, flagged as the sector cap.
- Defeat → `rivalDefeated(wave)` (already pays `tp` + boards the kill) + advance op-map.
- Escape/timeout → `rivalEscaped` (level+1) and the sector is not cleared.

## 4. UI (ui.js)

- **Objective banner** at sector start (`showBanner` + a persistent objective chip): mission name + goal.
- **Progress readout** on the HUD: "Targets 2/5", "Convoy 3/4", "Hold 0:42", drawn in `drawHUD`.
- **Boss intro** banner reuses the rival-encounter banner.
- Win/fail banners localized.

## 5. Persistence & i18n

- **Persistence:** mission state is per-sector/run (not persisted). Rival escalation persists through `rival.js` (already). Op-map progress uses existing op-map persistence.
- **i18n:** mission names, objective texts, win/fail banners, boss intro — EN + ZH in `js/i18n.js` (mission strings via a `missionText()` helper mirroring `techText` if data-driven).

## 6. Testing (`tests/missions.test.js`, mirrored byte-identical)

- `MISSIONS.intercept.winFail`: returns `won` when progress ≥ target before timer, `failed` when timer hits 0 first.
- `escort.winFail`: `failed` when survivors < threshold; `won` at exit.
- `defend.winFail`: `won` when timer elapses with asset alive; `failed` when asset hp ≤ 0.
- `strike.winFail`: `won` when the site is destroyed.
- `startMission` builds correct `target`/`timer`/`params` per type and wave.
- `missionKill` credits the right objective (intercept target vs escort attacker).
- Op-map node→mission assignment is deterministic given a seeded rng; last node = boss.

## 7. Files Touched

| File | Change |
|---|---|
| `js/missions.js` | **new** — `MISSIONS` table, `mission` state, `startMission`/`updateMission`/`missionKill`/`winFail`/`objectiveText` |
| `index.html` | add `missions.js` to load order (after `opmap.js`) |
| `js/opmap.js` | node mission-type assignment; `sectorPlan` returns mission (+ weather slot) |
| `js/main.js` | scheduler spawns per mission type; tick `updateMission`; resolve sector |
| `js/combat.js` | `missionKill(e)` from `killEnemy`; asset/convoy damage routing |
| `js/rival.js` | sector-boss wiring (spawn as cap, advance/escalate on resolve) |
| `js/ui.js` | objective banner + HUD progress + boss intro |
| `js/i18n.js` | EN + ZH strings + `missionText` helper |
| `tests/missions.test.js` | **new** |
| `CLAUDE.md` | Architecture table (+`missions.js`), load-order, Current state |

## 8. Phased Roadmap (bite-sized TDD steps generated at implementation start)

1. **Mission state machine** — `missions.js` table + `startMission`/`updateMission`/`winFail` (pure). Tests.
2. **Op-map typing** — `genOpMap` assigns types, `sectorPlan` returns mission. Tests.
3. **Sweep + intercept** — scheduler runs them + objective HUD + timer. Tests.
4. **Escort + defend** — convoy/asset entities + protect logic + `missionKill` crediting. Tests.
5. **Strike/SEAD** — reuse `queueStrikeSite`; win on site destroyed. Tests.
6. **Sector boss ace** — `rival.js` cap wiring; advance on defeat, escalate on escape. Tests.
7. **i18n EN+ZH + CLAUDE.md + visual verify** (`scripts/shot.mjs` flight + objective HUD).

## 9. Interfaces to Other Features

- **#2 Meta-progression:** mission/boss clears feed `run` stats consumed by `spAward`.
- **#4 Weather:** `sectorPlan` returns a `weather` slot; missions set it per sector.

## 10. Acceptance Criteria

1. `npm test` green incl. `missions.test.js`.
2. Each mission type spawns correctly from its op-map node and resolves win/fail per its rules.
3. Objective banner + HUD progress display and update live; localized EN + ZH.
4. Intercept/defend timers count down and fail on expiry (intercept) / win on survival (defend).
5. Escort fails if too many convoy units die; strike wins on site destruction.
6. Sector boss spawns from `rival.js`; defeat advances the op-map and pays out; escape escalates the rival level and leaves the sector uncleared.
7. Existing endless/sweep play still works (sweep is the default mission).
