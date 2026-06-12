# SKYSTRIKE // ACE PROTOCOL

Arcade jet combat game. Three.js (r159, vendored), single HTML page, no build step, no framework, no modules.

## Run / Test
- Play: open `index.html` in a browser (or any static server).
- Tests: `npm test` — plain Node scripts in `tests/*.test.js`, no test framework. Each test extracts or mirrors functions from source files; keep mirrored helpers byte-identical with their source.
- Visual check: `node scripts/shot.mjs <outPrefix> [tod 0|1|2]` — boots the game headless (playwright devDep) and saves hangar/flight/fx/terrain screenshots. Use this to verify any graphics change.
- Close-up check: `node scripts/beauty.mjs <outPrefix> [jetIndex] [tod]` — UI-hidden hangar close-ups (jet front/side/rear + missile/tracer ordnance board). Use when judging model/material quality.

## Architecture (read this, skip exploration)
All code is browser globals — no imports/exports. Script load order in `index.html` defines availability:
`vendor/three.min.js → storage.js → globals.js → engine.js → entities.js → rival.js → opmap.js → combat.js → ui.js → main.js`

| File | Role |
|---|---|
| `js/globals.js` | Shared state (player, enemies, missiles, wave, run, tech), math helpers (`rand`, `clamp`, `damp`), `jetStats` per-airframe table |
| `js/engine.js` | Three.js scene/renderer/terrain (`terrainH`); filmic pipeline (sRGB + ACES, physical lights) + PCFSoft sun shadows (`updateSunRig` follows player, ticked in `animate`); sky/sea shaders (`skyMat`/`seaMat`, `applyTimeOfDay`), billboard cloud banks (`retintClouds`/`updateClouds`), shader-detailed smooth terrain (fbm via onBeforeCompile); canvas FX textures `glowTex`/`cloudPuffTex`/`fireTex`/`tracerTex`; shared ordnance assets (`buildAssets`: merged-geometry missile via `mergeGeos`, `buildMissileMesh(enemy)`, crossed-quad tracer streaks); `buildEnvMap` (PMREM sky → `scene.environment`), `updatePlayerShadow` blob shadow |
| `js/entities.js` | `createEnemy`, jet mesh building (`buildJet`, cached; `loftFuselage` superellipse hull w/ chines + engine decks, `intakeDuctGeo`), per-type update fns (`updateEnemy/Bomber/Drone/Ground`), `clearLocks`, `disposeGroup`; `markShadowCasters`, `patchJetSurface` (hull noise + panel lines + two-tone), `animEngines` (throttle-driven afterburner: flame/core/shock-diamonds + `userData.heatMat` nozzle glow) |
| `js/combat.js` | Player update, weapons, missiles, damage, `killEnemy`, specials |
| `js/main.js` | Game loop, wave scheduling, spawn fns (`airSpawnPos`/`groundSpawnPos`/`spawnGroundAt` helpers, `queueStrikeSite` builds fortified ground sites + fleeing convoys), wingman/CCA AI |
| `js/ui.js` | HUD canvas (`drawHUD`), menus, hangar, tech tree, settings, touch controls |
| `js/rival.js` | Nemesis persistence/escalation (helpers mirrored in `tests/rival.test.js`) |
| `js/opmap.js` | Operation map node logic |
| `js/storage.js` | ONLY place allowed to touch `localStorage` — enforced by `tests/storage.test.js`. Use `store.get/set/remove` |

## Hard rules
- No direct `localStorage` outside `js/storage.js` (test-enforced).
- No ES modules / `import` — globals only, respect load order.
- Three.js is vendored; never re-add CDN script tags. r128-era API calls go through shims in `engine.js`.
- Geometry/materials may be shared via cache — use `disposeGroup` for cleanup; never dispose marker geometry. `disposeGroup` skips geometry AND materials tagged `userData.shared` (cached jet geometry, ASSET missile hull/trim/sprite mats) — tag anything new that multiple live objects share.
- Enemy death/despawn must call `clearLocks(e)` and remove marker.
- Custom `ShaderMaterial` fragment shaders must end with `#include <tonemapping_fragment>` + `#include <colorspace_fragment>` or they won't match the scene's ACES/sRGB grading.

## Docs layout (docs/)
- `working/superpowers/plans/` — active in-progress implementation plans (writing-plans skill). Deleted once merged; empty = nothing in flight.
- `working/superpowers/ideas/` — unscoped feature brainstorms awaiting design, e.g. `2026-06-11-feature-ideas-progression-content.md` (meta-progression: SP currency, jet unlocks, skins, achievements, mission variety).
- `ios/` — iOS transition docs: `ios.md` (build/run via Capacitor), `ios-completion-checklist.md` (remaining steps to finish `feat/ios-readiness`).
- `reference/` — system/architecture reference docs (currently empty; this CLAUDE.md is the primary reference and stays at repo root).

## Current state (2026-06-11)
- Branch `feat/ios-readiness`: iOS-readiness plan COMPLETE (all 6 tasks, plan doc deleted post-merge): npm scaffold, Three.js vendoring, storage seam, safe-area CSS, vendored fonts (`vendor/fonts/`), Capacitor iOS scaffold (`ios/`, SPM-based, no CocoaPods; build via `npm run build:www && npx cap sync ios`, see `docs/ios/ios.md`). Pending: browser/device smoke test, swap storage.js internals to `@capacitor/preferences` before App Store release, merge to main (see `docs/ios/ios-completion-checklist.md`).
- Graphics overhaul COMPLETE (2026-06-12, merged as v1): filmic color pipeline, real-time sun shadows, billboard clouds, smooth shader-detailed terrain, textured fireball/smoke FX. High-poly ordnance/jet pass: lofted superellipse fuselages (stealth chines, blended engine decks), clearcoat hero paint + iridescent canopies, panel-line shader, slime lights, shock-diamond afterburners, merged-geometry missiles, gradient tracer streaks. All 3 TODs verified via `scripts/shot.mjs` + `scripts/beauty.mjs`. Pending: in-browser perf check on a real device (headless shots can't measure fps).
- Known open issue: reset-path material leak (see geometry cache notes).
- Next up: scope a plan from `docs/working/superpowers/ideas/2026-06-11-feature-ideas-progression-content.md` (meta-progression/customization backlog).

## Keep this file current
This file replaces codebase exploration — stale info costs more tokens than no info (wrong assumptions → wasted edits/re-reads). When you change code, update the relevant line in the same commit:
- New/renamed/moved file, or new script-load-order entry → update Architecture table + load-order chain.
- New cross-file convention/helper (like `clearLocks`, `airSpawnPos`, storage seam) → add to Hard rules or the table.
- Finish/start a roadmap item → update Current state. Remove stale entries rather than letting them accumulate.
