# SKYSTRIKE — CONTEXT

Browser-based arcade jet-combat game. Three.js r159 (vendored), single HTML page, **no build step, no framework, no ES modules**. Open `index.html` to play.

> **The architecture reference lives in [`CLAUDE.md`](./CLAUDE.md)** — the per-file role table, the `<script>` load-order chain, and the hard rules. This CONTEXT.md is the newcomer / agent orientation + glossary + decision index; it deliberately does **not** duplicate the file table (one source of truth — see the "Keep this file current" rule in CLAUDE.md).

## Run / test
- **Play:** open `index.html` (or any static server).
- **Tests:** `npm test` — plain Node scripts in `tests/*.test.js`, no framework.
- **Visual check:** `node scripts/shot.mjs <prefix>` — headless boot → hangar/flight/fx/terrain screenshots. Run after any graphics change (it is the runtime gate the Node tests can't cover).

## How the code is organised (one line)
All code is browser globals; **availability is defined by `<script>` load order in `index.html`**. Pure, dependency-free logic is lifted into **require-safe files** (`core.js`, `roster.js`, `opmap.js`, `missions.js`, `meta.js`, `rival.js`) that carry a CommonJS export footer, so tests exercise the real implementation instead of a mirror copy. See [ADR-0002](./docs/adr/0002-require-safe-core-seam.md).

## Domain glossary
- **Sector / wave** — a combat encounter; waves are spawn rounds within a sector.
- **Ace** — a named enemy fighter flying a real airframe (vs. plain `STD` fodder). **Hostile ace** = one named antagonist per sector type (`rival.js` `HOSTILE_ACES`). **Rival** — the persistent nemesis that escalates across runs (`rival.js`).
- **Roster (`JETS`)** — the playable airframes (`roster.js`): stats, ability, per-airframe paint colours.
- **RP (`player.tp`)** — in-run currency for the tech tree. **SP** — persistent meta currency (`meta.js`) for jet/skin/perk unlocks. Separate pools.
- **Operation / level** — the linear campaign (`opmap.js` `OPERATIONS`): 3 operations × 8/8/9 authored levels, bounded waves, checkpoint economy.
- **Skin vs HUDFONT / palette** — *skin* = per-airframe paint (`meta.js` `SKINS`); *HUDFONT* / *palette* = orthogonal visual language for menu + HUD chrome (`globals.js`).
- **Special slot** — equipped jet ability (slot 1); the SP-gated 2nd slot fires with **B**.
- **Boss phase** — multi-phase boss state (`e.phase` 1→3, `core.js` `bossPhaseFor`).

## Decisions (ADR index)
- [ADR-0001 — No build: browser globals + ordered script tags](./docs/adr/0001-no-build-globals-script-tags.md)
- [ADR-0002 — Require-safe core seam (CommonJS export footer)](./docs/adr/0002-require-safe-core-seam.md)
- [ADR-0003 — Staged ESM + GameState migration (deferred)](./docs/adr/0003-staged-esm-gamestate-migration.md)
