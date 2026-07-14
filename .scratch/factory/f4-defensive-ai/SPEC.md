# F4 — Enemy defensive AI

Branch `factory/f4-defensive-ai` · shot prefix `evade-check` · tests `tests/evade.test.js` · verify `scripts/verify-evade.mjs` (REQUIRED)

## Mechanic
Enemies react to being locked / inbound player missiles: cooldown-gated **break-turn** (temporary turn-rate multiplier for ~1.5 s) and **finite flares** that can spoof player missiles (mirror of the player's flare logic). Mooks carry 1 flare, aces 2–3, **bosses use break-turns only (never flare)**.

## Pure core (js/core.js, YOUR append block)
- `EVADE` tunables (break duration ~1.5 s, break turn multiplier, evade cooldown, lock-progress trigger threshold, missile-distance trigger, flare spoof chance…).
- `evadeDecision(state{lastEvade, flares}, threat{lockProgress, missileDist}, now)` → `{action: 'none'|'break'|'flare', state}` — cooldown-gated; flare only if `flares > 0` (decrement in returned state); below both trigger thresholds → 'none'. Deterministic given inputs (any randomness parameterized or in the impure caller).

## Owned code (touch NOTHING else)
- `js/entities.js`: ONE labeled hook line in `updateEnemy` → `applyEvade(e, dt)` (your new tail function under your label): gathers threat (player lock progress on this enemy, nearest inbound player-missile distance), calls `evadeDecision`, applies break-turn (temporary turnRate multiplier with timer) or pops a flare (mirror the player flare visual/entity so the fx is visible). ONE labeled line in `createEnemy` assigning `e.flares` by type (mook 1, ace 2–3, boss 0).
- `js/combat.js` `updateMissiles` only: enemy-flare spoof chance for PLAYER missiles (mirror how enemy flares… i.e. how the player's flares spoof enemy missiles today) — labeled block or single call into your tail helper.
- `js/core.js` append block. i18n only if you add user-facing text (EN+ZH+KO).

## Tests (tests/evade.test.js, new file, `require('../js/core.js')`)
Cooldown gating (second evade inside cooldown → 'none') · flare depletion (returned state decrements; at 0 flares threat prefers 'break') · trigger thresholds (below → 'none', above → action) · boss config (flares 0) can never produce 'flare' · break/flare choice logic deterministic.

## verify-evade.mjs (REQUIRED)
Boot headless (shot.mjs pattern). Via `page.evaluate`: start a run, pick a live enemy, synthesize threat (set player lock progress on it / spawn a player missile homing at it), step frames, assert a break-turn (turn multiplier active) or flare entity spawned; deplete flares and assert no further 'flare'. Save `evade-check-flare.png` capturing an enemy flare pop. Exit non-zero on failure.

## Visual verify
`node scripts/shot.mjs evade-check` + READ PNGs (boot sanity); your `evade-check-flare.png` must visibly show the flare fx.

---
## Ground rules (binding)
- Work ONLY in this worktree. Never push, never touch master, never edit outside it. Read files before editing. Start with the worktree's root `CLAUDE.md`, then the exact functions you'll touch.
- Browser globals only, no ES modules. core.js append block AT FILE TAIL (after existing export footer): `// === F4 defensive-ai ===` … `if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { EVADE, evadeDecision });` … `// === end F4 ===`. Keep core.js pure — no THREE/store/DOM.
- Shared-file discipline: entities.js `updateEnemy` is ALSO hooked by F2 with its own single labeled line (formation steering) — expect it, never touch it; combat.js is shared with F1/F5 in other functions. Your diff = owned functions + single labeled hook lines; helpers at file tails under your label.
- Enemy death/despawn contracts hold: `clearLocks(e)` + marker removal — don't break them; flare entities you spawn must be cleaned up (mirror player-flare lifecycle) and never break `disposeGroup`/`userData.shared` rules.
- No localStorage outside storage.js. Never commit *.png or .scratch/. Never touch package.json/lock. node_modules symlinked — no npm install. Commit hook fails/hangs → `git commit --no-verify`.

## Verification contract (ALL must pass before reporting green)
1. `npm test` green. 2. `node scripts/shot.mjs evade-check` + inspect PNGs with Read. 3. `node scripts/verify-evade.mjs` green. 4. i18n parity EN+ZH+KO for any new key. 5. `node tests/storage.test.js` green.

## Iteration & report
Fix-and-retry autonomously; one failed FULL verification pass = one attempt; after 3 failed attempts stop, commit WIP, report BLOCKED + blocker. Commit 1–3 logical commits, subject `F4: …`, ending with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Final report: STATUS green|blocked · ATTEMPTS n · TESTS files passed · SHOTS + one line per PNG of what you SAW · VERIFY result · FILES touched · I18N keys added · COMMITS hashes · RISKS.
