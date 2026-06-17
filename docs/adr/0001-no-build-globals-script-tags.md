# ADR-0001 — No build: browser globals + ordered script tags

**Status:** Accepted

## Context
Skystrike is a single static HTML page targeting both desktop browsers and a Capacitor / iOS wrapper. The goal is a zero-friction deploy: open `index.html` and play — no toolchain, no runtime dependency download.

## Decision
- All game code is plain **browser globals** — no `import` / `export`.
- Cross-file availability is defined solely by **`<script>` load order in `index.html`** (the canonical chain is documented in `CLAUDE.md`).
- Three.js is **vendored** (`vendor/three.min.js`, r159); never re-added via CDN. r128-era API calls go through shims in `engine.js`.
- No bundler, no ES modules, no framework.

## Consequences
- ➕ Dead-simple deploy; works under `file://` and inside Capacitor; nothing to build or install at runtime.
- ➖ Load order is **implicit and load-bearing** — a misordered or syntactically broken file can blank the screen (e.g. the 2026-06-16 `globals.js` parse-error → blank-hangar outage). Mitigated by: the documented load-order chain in CLAUDE.md, syntax-checking edits (`node --check`), and a headless boot screenshot (`scripts/shot.mjs`) as the runtime gate.
- ➖ One global namespace; no tree-shaking. Accepted as the cost of zero-build simplicity.
- Testability is recovered separately by the require-safe seam — see [ADR-0002](./0002-require-safe-core-seam.md).
