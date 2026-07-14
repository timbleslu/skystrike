# F2 — Enemy formations

Branch `factory/f2-enemy-formations` · shot prefix `formation-check` · tests `tests/formation.test.js` · verify `scripts/verify-formation.mjs` (REQUIRED)

## Mechanic
Non-boss fighter waves of **≥3** spawn as a formation (**vee / wall / echelon / pincer**) with a leader. Followers steer toward leader-relative slot offsets until a break condition — player within engage range OR leader dead — then revert to normal AI permanently (drop `e.formation`).

## Pure core (js/core.js, YOUR append block)
- `FORMATIONS` table (the 4 types + per-type spacing/params, engage-range config).
- `formationSlots(type, n, spacing)` → array of `{x, z}` local offsets, slot 0 = leader at origin. Vee symmetric about the leader axis; wall = abreast line; echelon = monotonic diagonal; pincer = two flanking groups.
- `formationBreak(distToPlayer, leaderAlive, cfg)` → bool.

## Owned code (touch NOTHING else)
- `js/main.js` spawn functions only: when a non-boss fighter wave spawns ≥3 fighters, roll a formation type, tag leader + followers (`e.formation = {type, leaderRef/slot, offset}`) at spawn. Keep it inside the existing spawn fns as labeled additions.
- `js/entities.js` `updateEnemy`: ONE labeled hook line early in the movement logic → `applyFormationSteer(e, dt)` (your new tail function under your label). While in formation and not broken: steer the follower toward its leader-relative slot world position using the existing steering idioms in that file; leader flies normal AI. On `formationBreak(...)` → delete `e.formation`, fall through to normal AI. Housekeeping (locks/markers/culling) must still run — do not early-return past it.
- `js/core.js` append block. i18n only if you add user-facing text (then EN+ZH+KO).

## Tests (tests/formation.test.js, new file, `require('../js/core.js')`)
Slot counts = n for every type · vee mirror-symmetry (±x pairs) · spacing scales offsets · echelon strictly monotonic offsets · pincer splits into two groups on opposite flanks · `formationBreak` true on engage range crossed / leader dead, false otherwise.

## verify-formation.mjs (REQUIRED)
Boot headless (copy shot.mjs pattern). Via `page.evaluate`: start a run, force-spawn a 5-fighter non-boss wave through the real spawn path, step ~3–5 s of frames, then read enemy positions and assert each follower is within tolerance of its slot's world position (formation held). Save `formation-check-vee.png` screenshot showing the formation from the chase view. Exit non-zero on failure.

## Visual verify
`node scripts/shot.mjs formation-check` + READ the PNGs (boot sanity), plus your `formation-check-vee.png` must visibly show a grouped formation.

---
## Ground rules (binding)
- Work ONLY in this worktree. Never push, never touch master, never edit outside it. Read files before editing. Start with the worktree's root `CLAUDE.md` (architecture + hard rules), then the exact functions you'll touch.
- Browser globals only, no ES modules. core.js append block AT FILE TAIL (after existing export footer): `// === F2 enemy-formations ===` … `if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { FORMATIONS, formationSlots, formationBreak });` … `// === end F2 ===`. Keep core.js pure — no THREE/store/DOM.
- Shared-file discipline: main.js and entities.js are being edited by sibling agents in other functions (updateEnemy is also hooked by F4 with its own single line — expect it, don't touch it). Your diff = owned functions + single labeled hook lines; new helpers at file tails under your label.
- No localStorage outside storage.js. Never commit *.png or .scratch/. Never touch package.json/lock. node_modules is symlinked — no npm install. If a commit hook (graphify) fails/hangs, `git commit --no-verify`.

## Verification contract (ALL must pass before reporting green)
1. `npm test` green. 2. `node scripts/shot.mjs formation-check` + inspect PNGs with Read. 3. `node scripts/verify-formation.mjs` green. 4. i18n parity EN+ZH+KO for any new key. 5. `node tests/storage.test.js` green.

## Iteration & report
Fix-and-retry autonomously; one failed FULL verification pass = one attempt; after 3 failed attempts stop, commit WIP, report BLOCKED + blocker. Commit 1–3 logical commits, subject `F2: …`, ending with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Final report: STATUS green|blocked · ATTEMPTS n · TESTS files passed · SHOTS prefix + one line per PNG of what you SAW · VERIFY result · FILES touched · I18N keys added · COMMITS hashes · RISKS.
