# ADR-0003 — Staged ESM + GameState migration (deferred)

**Status:** Proposed / Deferred → scheduled after deployment (see [ADR-0004](./0004-web-stack-confirmed.md))

> **Update (2026-06-20):** [ADR-0004](./0004-web-stack-confirmed.md) confirmed the web stack and identified this migration as the real lever behind "won't limit functionality" + the on-ramp to multiplayer. Deferral rationale #3 below ("live game shipping to iOS → a regression reaches production") is now **weaker**: iOS/App Store is no longer a goal, and the Vercel web deploy is trivially revertible. The incremental, screenshot-gated approach under "If revisited later" still stands.

## Context
Two larger refactors were considered to attack the downsides of [ADR-0001](./0001-no-build-globals-script-tags.md): (1) migrating to **ES modules** (explicit `import` / `export`, engine-enforced load order) and (2) collapsing the loose globals in `globals.js` into a single **`GameState`** object.

## Decision
**Defer both. Do not big-bang.**

Rationale:
1. ESM **conflicts with the standing hard rule** "No ES modules — globals only" in `CLAUDE.md`. That rule is a deliberate choice ([ADR-0001](./0001-no-build-globals-script-tags.md)), not an accident.
2. The require-safe seam ([ADR-0002](./0002-require-safe-core-seam.md)) **already delivers most of ESM's testability benefit** without the migration cost.
3. Skystrike is a **live game shipping to iOS**. A big-bang ESM migration means swapping the vendored UMD `three.min.js` for `three.module.js` and rewriting every file — and the Node test suite is deliberately THREE-decoupled, so **"tests green" cannot prove the render path survived**. A regression would reach production (cf. the 2026-06-16 blank-hangar outage).

## If revisited later
- Go **incremental**, one leaf file at a time, behind **import-maps** (keeps the no-bundler property).
- Gate every step on a **Playwright boot-screenshot** (`scripts/shot.mjs`), not just `npm test`.
- `GameState` can be done independently of ESM and is lower risk, but is also lower value now that `globals.js` is documented and the data tables are being lifted into require-safe files.

Until then, the only sanctioned cross-file module syntax remains the CommonJS export footer ([ADR-0002](./0002-require-safe-core-seam.md)).
