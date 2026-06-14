# Meta-Progression — Design Spec

**Date:** 2026-06-14
**Feature:** #2 of 4 (controls → **meta-progression** → missions+bosses → weather)
**Target branch:** `feat/meta-progression` (off `master`)
**Status:** Approved design forks, pre-plan

## 1. Overview

Add a **persistent progression layer** above the existing per-run tech tree. Today a run earns **RP** (`player.tp`), spent on the in-run `TECH_TREE`, and everything resets at run end. This feature banks a second, **persistent** currency — **SP** — earned each run and spent between runs on:

1. **Meta-upgrade tree** — persistent perks applied at the *start* of every run (full tree, the big-scope pick).
2. **Jet unlocks** — gate some `JETS` behind SP.
3. **Skins** — cosmetic paint variants per jet.
4. **Achievements** — milestone badges (cosmetic + small one-time SP).

In-run RP / `TECH_TREE` behaviour is unchanged.

## 2. Goals / Non-Goals

**Goals**
- Persistent `meta` state (SP + owned jets/skins/perks/achievements), saved through the storage seam.
- SP awarded at run end, derived from the existing `run` stats object.
- A persistent meta-upgrade tree whose perks apply at run start (before the in-run tech tree).
- Hangar gates locked jets/skins behind SP; clear buy UI; SP balance always visible.
- Achievements tracked from run stats + events.
- All strings EN + ZH; all state persisted only via `store`.

**Non-Goals (YAGNI)**
- SP and RP do **not** merge — RP stays the in-run currency, SP is meta-only.
- Meta perks are **bounded persistent edges** (start bonuses, small multipliers), not a second copy of the in-run tech tree's mechanics.
- No prestige/reset loop, no daily challenges, no monetization.

## 3. Architecture

New global module **`js/meta.js`** (modeled on `js/rival.js`: owns state, loads/saves via `store`, exposes pure helpers). Load order inserts it after `rival.js`:

```
storage.js → globals.js → i18n.js → engine.js → entities.js → rival.js → meta.js → opmap.js → combat.js → ui.js → main.js
```

**State**
```js
let meta = {
  sp: 0,
  jets:   { /* jetKey: true */ },     // unlocked airframes (defaults: starter set true)
  skins:  { /* jetKey: [skinId] */ }, // owned skins per jet
  perks:  { /* perkId: level */ },    // meta-upgrade tree levels
  ach:    { /* achId: true */ },      // earned achievements
};
```

**Module API (`meta.js`, pure where possible)**
- `loadMeta()` / `saveMeta()` — `store.get/set('skystrike_meta', …)`, with `validMeta()` guard (mirror `validRival`).
- `spAward(run, player)` — pure: SP from `run` stats (kills, ground, boss, escortKills, wave reached, score, rival level). Unit-tested.
- `applyMetaPerks(player)` — called at run start; applies owned perk levels to the freshly-spawned player (before in-run tech tree CORE). Unit-tested via a mock player.
- `perkCost(perkId, level)` / `buyPerk(id)`, `jetUnlocked(key)` / `buyJet(key)`, `skinOwned(key,id)` / `buySkin(key,id)`, `grantAch(id)` — SP-spend + persistence.
- Tables: `META_PERKS` (tree: id, x/y or branch, baseCost, maxLevel, `apply(p, lvl)`, name/desc), `SKINS` (per jet: id, color, accent), `ACHIEVEMENTS` (id, test(run,player), name/desc, spReward).

**Data flow**
```
run ends → spAward(run, player) → meta.sp += award → saveMeta()
                                          ↓
hangar: spend SP → buyPerk / buyJet / buySkin → saveMeta()
                                          ↓
run starts → applyMetaPerks(player) → (then in-run TECH_TREE CORE applies)
```

## 4. UI (ui.js)

- **SP balance** shown in hangar header + run-end screen (with the run's SP award called out).
- **Meta-upgrade screen** — new panel (reuse tech-tree screen styling) showing `META_PERKS` as a buyable tree; locked/owned/affordable states like the existing tech grid (`reqSatisfied` analog). Buy spends SP.
- **Jet unlock** — `selectJet`/`launch` gate on `jetUnlocked(key)`; locked cards show cost + a Buy action.
- **Skin picker** — on the jet card, cycle owned skins; locked skins show cost. Applied in `buildJet`/`previewJet` via the skin's color/accent.
- **Achievements panel** — grid of earned/locked badges (Settings or a new tab).

## 5. Persistence & i18n

- **Persistence:** only `meta.js` touches storage, via `store.get/set('skystrike_meta', …)` — no direct `localStorage` (passes `tests/storage.test.js`). Versioned schema field for forward migration.
- **i18n:** all labels (SP, perk names/descs, jet-lock, skin names, achievement names/descs, buy/owned/locked) get EN + ZH in `js/i18n.js` (perks/achievements via a `metaText()`-style helper if data-driven, mirroring `techText`).

## 6. Testing (`tests/meta.test.js`, mirrored byte-identical)

- `spAward`: monotonic in kills/wave/boss; zero run → small/zero; rival-level bonus applies.
- `applyMetaPerks`: each perk level mutates the mock player by the documented amount; level 0 = no-op; stacks across perks.
- `perkCost`: increases with level; `buyPerk` rejects when `sp < cost`, deducts on success.
- `jetUnlocked`/`buyJet`, `skinOwned`/`buySkin`: ownership gating + SP deduction.
- `grantAch` + achievement `test()` predicates fire on the right run stats; SP reward paid once.
- `validMeta` rejects malformed saved blobs (falls back to fresh meta).
- `tests/storage.test.js` stays green.

## 7. Files Touched

| File | Change |
|---|---|
| `js/meta.js` | **new** — meta state, load/save, `spAward`, `applyMetaPerks`, perk/jet/skin/ach tables + buy fns |
| `index.html` | add `meta.js` to script load order (after `rival.js`); meta-screen + SP + skin/ach DOM |
| `js/globals.js` | `meta` global declaration (if not in meta.js) |
| `js/combat.js` | award SP at run end (in the run-over path near `killEnemy`/game-over); achievement event hooks |
| `js/main.js` | `applyMetaPerks(player)` at run start (player spawn) |
| `js/ui.js` | SP display, meta-upgrade screen, jet-lock gating, skin picker, achievements panel |
| `js/i18n.js` | EN + ZH strings + `metaText` helper |
| `tests/meta.test.js` | **new** |
| `CLAUDE.md` | Architecture table (+`meta.js` row), load-order chain, Current state |

## 8. Phased Roadmap (bite-sized TDD steps generated at implementation start)

1. **Meta state + persistence** — `meta.js` schema, `loadMeta`/`saveMeta`/`validMeta`, boot load. Tests.
2. **SP award** — `spAward(run, player)` + bank on run end + run-end-screen display. Tests.
3. **Meta-upgrade tree** — `META_PERKS` table + `applyMetaPerks` at run start + buy UI. Tests.
4. **Jet unlocks** — `JETS` lock metadata + hangar gating + buy. Tests.
5. **Skins** — `SKINS` table + picker + `buildJet` apply. Tests.
6. **Achievements** — `ACHIEVEMENTS` table + tracking hooks + panel. Tests.
7. **i18n EN+ZH + CLAUDE.md + visual verify** (`scripts/shot.mjs` hangar/meta screens).

## 9. Interfaces to Other Features

- **#3 Missions** call `spAward`-relevant `run` fields (mission clears, boss) — keep `run` the single source of run stats.
- Exposes `applyMetaPerks(player)` and `meta.sp` for HUD.

## 10. Acceptance Criteria

1. `npm test` green incl. `meta.test.js`; `storage.test.js` green.
2. Finishing a run banks SP (shown on the end screen); SP persists across reload.
3. Meta-upgrade perks bought with SP apply measurably at the next run's start.
4. Locked jets/skins gate in the hangar; buying with SP unlocks and persists.
5. Achievements unlock on their milestones and pay their one-time SP once.
6. All new strings render EN + ZH.
7. No direct `localStorage` outside `storage.js`.
8. In-run RP / tech-tree behaviour is unchanged.
