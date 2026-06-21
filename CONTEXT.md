# SKYSTRIKE — CONTEXT

Browser-based arcade jet-combat game. Three.js r159 (vendored), single HTML page, **no build step, no framework, no ES modules**. Open `index.html` to play.

> **The architecture reference lives in [`CLAUDE.md`](./CLAUDE.md)** — the per-file role table, the `<script>` load-order chain, and the hard rules. This CONTEXT.md is the newcomer / agent orientation + glossary + decision index; it deliberately does **not** duplicate the file table (one source of truth — see the "Keep this file current" rule in CLAUDE.md).

## Run / test
- **Play:** open `index.html` (or any static server).
- **Tests:** `npm test` — plain Node scripts in `tests/*.test.js`, no framework.
- **Visual check:** `node scripts/shot.mjs <prefix>` — headless boot → hangar/flight/fx/terrain screenshots. Run after any graphics change (it is the runtime gate the Node tests can't cover).

## How the code is organised (one line)
All code is browser globals; **availability is defined by `<script>` load order in `index.html`**. Pure, dependency-free logic and data are lifted into **require-safe files** (`core.js`, `roster.js`, `airframes.js`, `opmap.js`, `missions.js`, `meta.js`, `rival.js`) that carry a CommonJS export footer, so tests exercise the real implementation instead of a mirror copy. See [ADR-0002](./docs/adr/0002-require-safe-core-seam.md).

## Domain glossary
- **Sector / wave** — a combat encounter; waves are spawn rounds within a sector.
- **Ace** — a named enemy fighter flying a real airframe (vs. plain `STD` fodder). **Hostile ace** = one named antagonist per sector type (`rival.js` `HOSTILE_ACES`). **Rival** — the persistent nemesis that escalates across runs (`rival.js`).
- **Roster (`JETS`)** — the playable airframes (`roster.js`): stats, ability, per-airframe paint colours.
- **RP (`player.tp`)** — in-run currency for the tech tree. **SP** — persistent meta currency (`meta.js`) for jet/skin/perk unlocks. Separate pools.
- **Operation / level** — the linear campaign (`opmap.js` `OPERATIONS`): 3 operations × 8/8/9 authored levels, bounded waves, checkpoint economy.
- **Skin vs HUDFONT / palette** — *skin* = per-airframe paint (`meta.js` `SKINS`); *HUDFONT* / *palette* = orthogonal visual language for menu + HUD chrome (`globals.js`).
- **Special slot** — equipped jet ability (slot 1); the SP-gated 2nd slot fires with **B**.
- **Boss phase** — multi-phase boss state (`e.phase` 1→3, `core.js` `bossPhaseFor`).
- **Sortie** — one flight of one level. A **fresh sortie** (`freshSortie`) resets the persistent campaign player's flight position + ability timers + consumables so each level starts clean (the player object itself persists for the economy — see [ADR-0005](./docs/adr/0005-campaign-player-persist-arena-reset.md)).
- **Loading curtain** — the opaque `#loadingScreen` overlay shown during a flight-to-flight arena swap so no frame of the previous mission's terrain/weather is seen.
- **Detection meter / Blown cover** — STEALTH state. The meter rises near SAM/radar/patrol **detection rings** or while spotted; reaching 100% fails. Firing or killing **blows cover** (`stealthBlown`): all threats aggro and every kill spawns +2 attackers — but it is not an instant fail.
- **Per-level stars** — a level's 3 star objectives = 2 from its mission **type** (`starsForType`) + 1 hand-authored **unique** condition (`lvl.starUnique`); scored on the per-level run delta and recorded per level in `meta.campaign`.

## Decisions (ADR index)
- [ADR-0001 — No build: browser globals + ordered script tags](./docs/adr/0001-no-build-globals-script-tags.md)
- [ADR-0002 — Require-safe core seam (CommonJS export footer)](./docs/adr/0002-require-safe-core-seam.md)
- [ADR-0003 — Staged ESM + GameState migration (deferred → scheduled)](./docs/adr/0003-staged-esm-gamestate-migration.md)
- [ADR-0004 — Web stack confirmed; constraint is architecture, not the renderer](./docs/adr/0004-web-stack-confirmed.md)
- [ADR-0005 — Campaign player persists; arena + sortie reset per flight behind a loading curtain](./docs/adr/0005-campaign-player-persist-arena-reset.md)
