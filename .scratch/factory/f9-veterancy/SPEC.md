# F9 — Per-jet veterancy

Branch `factory/f9-veterancy` · shot prefix `vet-check` · tests: extend `tests/meta.test.js` · verify `scripts/verify-vet.mjs` (REQUIRED)

## Scope
- Kills accumulate per airframe: `meta.veterancy[jetId]` stamped in `endRun` (add `run.kills` for the flown jet — once per run).
- Pure `vetRank(kills)` in core.js → rank 0–5 over **5 thresholds** (pick sensible escalating values, e.g. 25/75/150/300/600 — your latitude, must be exported + tested).
- Rank insignia chip on the hangar jet card (`renderJetCard`) — chevrons/stars glyph + rank name, hidden at rank 0.
- One modest per-rank perk: **+1% turn rate per rank, cap +5%**, applied in the `applyMetaPerks` path (so it composes with existing perks at run start).
- `loadMeta` heals a missing `veterancy` field on legacy saves — **no progression wipe** (mirror the existing lenient heal pattern).

## Owned code (touch NOTHING else)
- `js/core.js` append block: `VET_THRESHOLDS` + `vetRank(kills)`.
- `js/meta.js`: ONE line in `freshMeta` (`veterancy: {}`), ONE labeled heal line in `loadMeta`, a small stamp helper (e.g. `stampVeterancy(jetId, kills)`) near the other meta helpers, and the labeled perk block inside `applyMetaPerks` (+1%/rank turn rate, cap +5%). (F8 edits the SAME freshMeta/loadMeta for its weekly field — keep yours to single clearly-labeled lines.)
- `js/ui-flow.js` `endRun`: ONE labeled line calling your stamp helper. (F8 also edits ui-flow.js elsewhere — don't touch its lines.)
- `js/ui-hangar.js` `renderJetCard`: labeled chip render (use `metaText`/`t` for strings).
- `js/i18n.js` append block: rank names (`vet.rank1..5` or similar) + chip label — EN+ZH+KO.

## Tests (extend tests/meta.test.js — append your asserts under a labeled comment)
`vetRank` thresholds (each boundary exact, 0 below first, 5 at/above last) · stamp accumulation (two runs add up per jet, other jets untouched) · legacy-save heal (meta without `veterancy` → healed `{}`, nothing else changed, no wipe) · perk cap (rank 5 → exactly +5% turn rate; rank 2 → +2%) via `applyMetaPerks` against a stub player/store (follow the existing `global.store` stub pattern in that test file).

## verify-vet.mjs (REQUIRED)
Boot headless (shot.mjs pattern). Via `page.evaluate`: set `meta.veterancy[<jet>]` to a rank-3 value, re-render the jet card, assert the insignia chip exists in the DOM with resolved text; save `vet-check-chip.png`. Then `applyMetaPerks` on a fresh player and assert turnRate is +3% vs baseline. Exit non-zero on failure.

## Visual verify
`node scripts/shot.mjs vet-check` + READ PNGs (boot sanity); `vet-check-chip.png` must visibly show the insignia chip on the jet card.

---
## Ground rules (binding)
- Work ONLY in this worktree. Never push, never touch master, never edit outside it. Read files before editing. Start with the worktree's root `CLAUDE.md`, then study meta.js (freshMeta/loadMeta/applyMetaPerks/store-stub test pattern) before writing.
- Browser globals only, no ES modules. core.js append block AT FILE TAIL (after existing export footer): `// === F9 veterancy ===` … guarded `Object.assign(module.exports, { VET_THRESHOLDS, vetRank })` … `// === end F9 ===`. Keep core.js pure.
- i18n append block AT FILE TAIL under your label, real key structure, EN+ZH+KO.
- Shared-file discipline: meta.js freshMeta/loadMeta + ui-flow.js + i18n.js tail shared with F8; meta.js SKINS table is F7's — never touch sibling edits.
- No localStorage outside storage.js. Never commit *.png or .scratch/. Never touch package.json/lock. node_modules symlinked — no npm install. Commit hook fails/hangs → `git commit --no-verify`.

## Verification contract (ALL must pass before reporting green)
1. `npm test` green (incl. your extended meta tests). 2. `node scripts/shot.mjs vet-check` + inspect PNGs with Read. 3. `node scripts/verify-vet.mjs` green. 4. i18n parity EN+ZH+KO. 5. `node tests/storage.test.js` green.

## Iteration & report
Fix-and-retry autonomously; one failed FULL verification pass = one attempt; after 3 failed attempts stop, commit WIP, report BLOCKED + blocker. Commit 1–3 logical commits, subject `F9: …`, ending with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Final report: STATUS green|blocked · ATTEMPTS n · TESTS files passed · SHOTS + one line per PNG of what you SAW · VERIFY result · FILES touched · I18N keys added · COMMITS hashes · RISKS.
