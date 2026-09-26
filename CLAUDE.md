# SKYSTRIKE // ACE PROTOCOL

Arcade jet combat. Three.js r159 (vendored), one HTML page, plain browser-global scripts — no build, no framework, no ES modules.
**Source of truth: GitHub `timbleslu/skystrike` via this clone — `git fetch`/`pull` first. Ignore any Obsidian Vault or `~/Downloads` copy.**

This file is the always-loaded map. Deeper, on-demand references (read only when the task needs them):
- `docs/architecture-notes.md` — long per-file notes + history of every subsystem
- `docs/level-authoring.md` — campaign level/beat schema, radio lines, bosses, stars (read before touching `OPERATIONS`)
- `docs/CHANGELOG.md` — what shipped when · `docs/adr/` — architecture decisions
- `graphify query "<question>"` / `graphify path "<A>" "<B>"` — scoped call-graph answers (graph in `graphify-out/`, auto-rebuilt by git hooks)

## Commands
| | |
|---|---|
| `npm test` | Node unit tests (`tests/*.test.js`, plain `assert`, ~5 s) |
| `npm run verify` | ALL headless browser gates `scripts/verify-*.mjs` (~15 min, retries once) — **merge gate** |
| `node scripts/verify-<name>.mjs` | one gate |
| `node scripts/verify-campaign.mjs [op:idx] [passive]` | campaign bot — all levels, or one (`ironVeil:5`) |
| `npm run check` | test + verify |
| `node scripts/i18n.mjs get\|set\|rm\|apply\|check` | edit/inspect strings without opening `js/lang/*` (see Recipes) |
| `node scripts/shot.mjs <prefix> [tod]` | hangar/flight/fx screenshots (graphics changes) |
| `node scripts/shot-campaign.mjs <label> [menus\|flight]` | every campaign screen × desktop/phone/landscape → `.scratch/shots/` |
| `node scripts/beauty.mjs <prefix>` · `jets-sheet.mjs` | jet close-ups · roster contact sheet |
| `npm run serve:https` | LAN HTTPS for phone motion-control testing |

Headless flight renders ~2–5 fps (software GL): drive the sim with fixed `dt` steps in `page.evaluate` rather than waiting in real time (see `verify-campaign.mjs` `__step`). New browser scripts MUST boot via `scripts/lib/boot.mjs` (`launchGame`/`bootToHangar`), never copied glue. `node --check` + `npm test` do NOT load most browser files — a refactor isn't verified until the browser gates pass.

## Load order (index.html — defines what exists when)
`vendor/three → GLTFLoader → storage → core → prefs → roster → content-packs → globals → i18n → lang/en → lang/zh → lang/ko → engine → airframes → entities → rival → meta → opmap → missions → combat → hud → nav → ui-hud → ui-tech → ui-hangar → ui-flow → ui-settings → controls → main`

**Require-safe (Node-testable, CommonJS footer, NO THREE/DOM/store at load):** `core.js` (all pure game logic), `prefs.js`, `roster.js`, `content-packs.js`, `airframes.js`, `meta.js`, `rival.js`, `opmap.js`, `missions.js` (pure half), `nav.js`. Tests `require()` the real code — never mirror it. New pure logic → `core.js` + a test. Localization tables load in Node via `tests/lib/i18n.js`.

## File map
| File | Owns |
|---|---|
| `core.js` | Pure cores: math, weather, boss phases, wave composition (`composeWave` — rng draw order is a contract), AWACS, aim-assist, steering, targeting, enemy tactical state, campaign progression/rewards, raids/convoys/escort outcomes, terrain height, instruments, units |
| `globals.js` | Shared runtime state (`player`, `enemies`, `missiles`, `run` via `freshRun()`, campaign flags) + multi-file scratch (`t1…tA`, `q1/q2`) + palettes/skins |
| `i18n.js` + `lang/{en,zh,ko}.js` | `t(key)`/`tf(key,vars)`/`jetText`/`techText`/`metaText`; one table per language (EN canonical) |
| `engine.js` | Renderer, sky/sea/terrain shaders, biomes, ground scatter, bloom (`renderFrame()` — never `renderer.render`), particle pool, audio engine |
| `airframes.js` · `roster.js` | Jet geometry spec `SHAPES` · jet roster `JETS` |
| `entities.js` | Enemy creation + per-type AI (`updateEnemy/Bomber/Drone/Ground/Raider`), jet mesh building, glTF hero models (`JET_MODELS`) |
| `combat.js` | Player flight/weapons, missiles, damage, `killEnemy`, specials, boss phase FX, AWACS calls |
| `main.js` | Game loop `animate`, wave scheduling `nextWave`/`handleWaves`, spawners, wingmen/CCA, `spawnCampaignBoss` |
| `meta.js` | Persistent progression (SP, jets, skins, perks, achievements, stars, campaign saves) |
| `opmap.js` | `OPERATIONS` campaign data (4 ops, 33 levels) + `levelPlan` |
| `missions.js` | Typed missions + multi-beat sequence walker (pure `planPhase`) + glue: `allies` (friendly units), raids, radio `say`, timed events |
| `hud.js` | Canvas HUD (`drawHUD(hudView)` + `draw*` family) |
| `ui-hud.js` | DOM HUD (`updateDom`), camera, `hudViewState` (reused objects — same-frame only), radio comms, mission title card, banners, tutorial |
| `nav.js` | Full-screen router `SCREENS`/`showScreen`, Esc = BACK (`MENU_BACK`) |
| `ui-flow.js` | Run lifecycle (`startGame`/`gameOver`/`endRun`), campaign screens (theater → dossier → sortie map → briefing → debriefs), `launchLevel`, `beginCampaignEnd` |
| `ui-hangar.js` · `ui-tech.js` · `ui-settings.js` | Hangar, jet preview, settings UI · tech tree + armory · settings persistence, `applyLang`, `clearArenaEntities` (THE arena teardown) |
| `controls.js` | Input seam `flightInput` (touch stick / mouse / motion), touch buttons, haptics |
| `storage.js` | The ONLY `localStorage` access (`store.get/set`) |

## Conventions (the non-obvious ones)
- **Allies vs enemies:** friendly mission units live in `allies` (missions.js), never in `enemies` — enemies are anything lockable/shootable.
- **Scratch vectors:** `t1…tA`/`q1/q2` are shared; a hot function that needs scratch while callers may pass one of those as an argument gets its OWN file-local scratch (`explode` → `_xpV`). Reused output objects (`hudViewState`, `projectPoint(pos, out)`) are same-frame only.
- **Per-frame DOM writes** go through change-guarded `putText`/`putStyle`/`putVar` (ui-hud.js); anything else writing those nodes must too.
- **Disposal:** `disposeGroup` skips `userData.shared` geometry/materials (tag anything shared); particles come from and return to the pool (`particleSprite`/`releaseParticle`); enemy death/despawn calls `clearLocks(e)`.
- **Shaders:** custom fragment shaders end with `#include <tonemapping_fragment>` + `#include <colorspace_fragment>`.
- **Levels are data:** retune/add campaign content in `opmap.js` per `docs/level-authoring.md`; engine code shouldn't need changes.
- **Settings:** add a row to prefs.js `SETTINGS` (parse/clamp/apply) instead of hand-wiring handlers.

## Recipes
- **Add a string:** `node scripts/i18n.mjs set <key> --en "…" --zh "…" --ko "…"`, render with `t('<key>')` (dynamic keys keep a literal prefix, e.g. `'fail.tip.' + x`). `npm test` enforces EN/ZH/KO parity, `{placeholder}` parity, and that every literal `t('…')` key exists; `i18n.mjs check` also lists unused keys. Nested groups (`jet`/`tech`/`meta`) are edited by hand in `js/lang/*`.
- **Add/tune a level or radio line:** `docs/level-authoring.md` → `node scripts/verify-campaign.mjs <op:idx>`.
- **Add a mission verb:** pure machine in `missions.js` `MISSIONS` + `planPhase` fields + props in `spawnMissionProps`; test in `tests/missions.test.js`; star defaults in meta.js `STAR_TYPE_CONDS`.
- **Add a jet:** `roster.js` `JETS` + `airframes.js` `SHAPES` (+ `.glb` in entities.js `JET_MODELS`) + `jet.<id>.*` strings; check with `jets-sheet.mjs`.
- **Add a browser gate:** `scripts/verify-<name>.mjs` via `scripts/lib/boot.mjs`, exit 1 on failure — `npm run verify` picks it up.

## Hard rules
- User-facing text only via `t()`/`tf()` (or `jetText`/`techText`/`metaText`), all three languages.
- No `localStorage` outside `storage.js` (test-enforced). No ES modules / CDN scripts; the only module syntax is the CommonJS export footer on require-safe files.
- Before merging: `npm test` + `npm run verify` green. After UI/CSS changes, look at screenshots (`shot.mjs` / `shot-campaign.mjs`) at desktop + phone.

## Current state
v1.9 — feature-complete web game: Endless / Daily / Weekly / Boss Rush modes, 4-operation scripted campaign, meta-progression, EN/ZH/KO. iOS: Capacitor scaffold removed (`npm run build:www` → `www/`, then `npx cap add ios`); before App Store: swap `storage.js` to `@capacitor/preferences` + device smoke test.
**Open:** device smoke tests (touch/motion/fps can't be simulated headless); ZH/KO strings are model-reviewed but not yet native-reviewed.

## Keep this file current — and small
It is loaded every session: keep it a map, not a history. On a change, update the file-map row / convention / recipe it affects in the same commit; release notes go in `docs/CHANGELOG.md`, deep detail in `docs/architecture-notes.md`.
