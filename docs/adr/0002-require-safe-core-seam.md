# ADR-0002 — Require-safe core seam (CommonJS export footer)

**Status:** Accepted

## Context
Globals + no modules ([ADR-0001](./0001-no-build-globals-script-tags.md)) make unit testing hard: most files reference `THREE` / `store` / DOM at load, so a Node test can't `require()` them. Historically each test carried a **byte-identical mirror copy** of the production logic, guarded by a string-equality assert. Mirrors silently drift — a test can stay green while the real game changes underneath it.

## Decision
Lift pure, dependency-free logic into **require-safe files** that:
1. define plain globals in the browser (like every other file), AND
2. carry a CommonJS export footer — `if (typeof module !== 'undefined' && module.exports) module.exports = { … }` — **inert in the browser**, so `tests/*.test.js` `require()` the REAL implementation.

Require-safe files today: `core.js` (loaded first — math / weather / boss / tutorial / daily / aim / steer / campaign cores), `roster.js` (the `JETS` roster + `aceShapePool` / `jetNameForShape`), `opmap.js`, `missions.js`, `meta.js`, `rival.js`. **These files must stay free of `THREE` / `store` / DOM** or they stop being require-safe. New pure logic goes here and is imported by its test — never mirrored. Where a core needs a data table that lives in an impure file, the table is **injected** as a parameter (e.g. campaign progression takes `OPERATIONS`) so the core stays load-order-free.

## Consequences
- ➕ Tests exercise real code; no mirror drift.
- ➕ Extracting data / logic into require-safe files **shrinks the THREE-coupled god files** (`globals.js`, `entities.js`).
- ➖ Requires discipline to keep these files pure.
- **Remaining scrape debt:** the `entities.js` airframe-flag scrape (`tests/npc-airframes.test.js` et al.) — a candidate for the same treatment.

### History
- The `JETS` roster + `aceShapePool` / `jetNameForShape` were extracted into `roster.js` (2026-06-17), removing the last roster mirror (`ace-pool.test.js`) and a source scrape (`has-special.test.js`) — both now import the real roster.
- `reqSatisfied` (tech-tree prerequisite predicate) moved from `ui-tech.js` into `core.js` (2026-06-17), removing the `tests/ground-war.test.js` mirror — it now imports the real impl.
