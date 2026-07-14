# F10 — Reset-path material leak fix (known debt)

Branch `factory/f10-reset-leak` · shot prefix `leak-check` · acceptance gate `scripts/verify-leak.mjs` (RED → GREEN) · no new unit files required

## Scope
Known issue (root CLAUDE.md "Known open issues"): the reset path leaks materials/geometry through the geometry cache / `disposeGroup` path (`entities.js`, `engine.js` notes). **No behavior change; all existing tests stay green; no visual regression.**

## Mandatory order — script FIRST
1. Write `scripts/verify-leak.mjs` BEFORE touching any game code. Boot headless (copy shot.mjs's ephemeral-port boot). Via `page.evaluate`, loop **N=8 cycles** of `startGame(selectedJet)` → a few stepped frames → `returnToHangar()`. After each cycle sample: `renderer.info.memory.geometries`, `renderer.info.memory.textures`, and a material count (traverse `scene` counting unique materials, plus any cache sizes the code exposes). Print a per-cycle table. PASS = the last 3 cycles plateau (delta ≤ small epsilon); FAIL (non-zero exit) = monotonic growth.
2. Run it on your UNTOUCHED branch (== master): it MUST be RED, reproducing the leak. If it's green, your script isn't measuring the real leak — rewrite until it reproduces (this does NOT count as a self-correction attempt; it's the harness-authoring phase). Commit the red-proving script with a message noting it reproduces the leak.
3. Fix the leak: `entities.js` `disposeGroup`/geometry-cache reset path, `engine.js` only if needed. Respect the `userData.shared` contract — shared/cached templates (jet geometry cache, ASSET missile mats, glTF templates, ground-object templates) must be SPARED by disposal on purpose; the leak is what accumulates per run that ISN'T shared. Never dispose marker geometry.
4. Re-run: script GREEN. That red→green flip is the acceptance gate.

## Owned code (touch NOTHING else)
`js/entities.js` (disposeGroup/cache path), `js/engine.js` (only if needed), `scripts/verify-leak.mjs` (new). No i18n. No data-table edits.

## Tests
Full `npm test` unchanged and green — especially `tests/dispose-group.test.js` + `tests/geo-cache.test.js`. Add a unit test ONLY if your fix extracts a pure helper worth pinning (optional).

## Visual verify (no regression)
`node scripts/shot.mjs leak-check` AFTER the fix → READ all PNGs and compare against the pre-fix look (run once before fixing if you want a baseline, or against the existing `check-*.png` at repo root): hangar/flight/fx/terrain must look unchanged — jets textured, fx present, no missing materials (a wrong dispose = black/missing meshes).

## Report the numbers
Your final report MUST include the before/after per-cycle table (geometries/textures/materials at cycles 1..8) proving the plateau.

---
## Ground rules (binding)
- Work ONLY in this worktree. Never push, never touch master, never edit outside it. Read files before editing. Start with the worktree's root `CLAUDE.md` — the entities.js/engine.js rows + the disposeGroup/`userData.shared` hard rule are your map; then read `disposeGroup`, the geo cache, `clearArena`/`returnToHangar`/`startGame` teardown paths in full.
- Browser globals only, no ES modules. Surgical diff — this is a bug fix, not a refactor; no drive-by cleanups.
- Shared-file discipline: sole owner of entities.js/engine.js this wave, but keep the diff minimal anyway.
- Never commit *.png or .scratch/. Never touch package.json/lock. node_modules symlinked — no npm install. Commit hook fails/hangs → `git commit --no-verify`.

## Verification contract (ALL must pass before reporting green)
1. `npm test` green (unchanged suite). 2. `node scripts/verify-leak.mjs` green (and was demonstrably red pre-fix). 3. `node scripts/shot.mjs leak-check` + inspect PNGs with Read — no visual regression. 4. no i18n changes expected. 5. `node tests/storage.test.js` green.

## Iteration & report
Fix-and-retry autonomously; one failed FULL verification pass = one attempt; after 3 failed attempts stop, commit WIP, report BLOCKED + blocker. Commit 2–3 logical commits (script proving red, then the fix), subjects `F10: …`, ending with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Final report: STATUS green|blocked · ATTEMPTS n · TESTS files passed · LEAK TABLE before/after · SHOTS + one line per PNG · FILES touched · COMMITS hashes · RISKS.
