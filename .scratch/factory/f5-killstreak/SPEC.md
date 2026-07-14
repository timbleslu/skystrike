# F5 — Kill-streak momentum

Branch `factory/f5-killstreak` · shot prefix `streak-check` · tests `tests/streak.test.js` · verify `scripts/verify-streak.mjs` (REQUIRED)

## Mechanic
Kills within a chain window (**~6 s**) build a streak. Multiplier tiers **×1 / ×1.5 / ×2 / ×3** at counts **0/3/6/10**, applied to score in `killEnemy`. Window lapse resets the count; player death resets. Banner at tier crossings + HUD streak chip near the score readout.

## Pure core (js/core.js, YOUR append block)
- `STREAK` tunables (`window: 6`, tier counts [3,6,10], mults [1,1.5,2,3]).
- `streakStep(streak{count, mult, t}, event 'kill'|'death', now)` → new streak object; window checked against `streak.t` (last kill time — a kill after lapse restarts count at 1); include a tier-crossing signal (e.g. `tierUp: bool`) so the caller can banner exactly once per crossing. Pure — `now` is a parameter.

## Owned code (touch NOTHING else)
- `js/combat.js` `killEnemy` only: step the streak (state on `player.streak ?? fresh` — read-with-fallback, no createPlayer/globals edit, auto-resets per run), multiply the kill's score contribution by `streak.mult`, banner on tierUp (`showBanner` + haptic like siblings). Player-death reset: labeled one-liner where combat.js detects player death (the path into gameOver), stepping 'death'.
- `js/hud.js`: streak chip near the score readout — new `drawStreakChip` at file tail under your label (show count + current mult when count ≥ 2; use `hudK()` + HUD colour idioms); ONE labeled call line at the tail of `drawHUD`'s body.
- `js/core.js` + `js/i18n.js` append blocks.

## Tests (tests/streak.test.js, new file, `require('../js/core.js')`)
Chain within window increments count · lapse (now beyond t+window) → next kill restarts at 1 · death resets count+mult · tier thresholds exactly at 3/6/10 · multiplier values 1/1.5/2/3 · tierUp fires only on crossings · t updates monotonically on kills.

## verify-streak.mjs (REQUIRED)
Boot headless (shot.mjs pattern). Via `page.evaluate`: start a run, record score, kill 3 enemies rapidly through the real `killEnemy` path → assert streak count 3, mult 1.5, and the 3rd kill's score delta reflects the multiplier. Force a tier-2+ streak state, render a frame, save `streak-check-chip.png` showing the chip. Exit non-zero on failure.

## Visual verify
`node scripts/shot.mjs streak-check` + READ PNGs (boot sanity, HUD present); `streak-check-chip.png` must visibly show the streak chip.

## i18n
Tier-crossing banner key(s) (e.g. `banner.streak2/3/4` or one parameterized key) + chip label if any — EN+ZH+KO.

---
## Ground rules (binding)
- Work ONLY in this worktree. Never push, never touch master, never edit outside it. Read files before editing. Start with the worktree's root `CLAUDE.md`, then the exact functions you'll touch.
- Browser globals only, no ES modules. core.js append block AT FILE TAIL (after existing export footer): `// === F5 killstreak ===` … `if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { STREAK, streakStep });` … `// === end F5 ===`. Keep core.js pure — no THREE/store/DOM.
- i18n append block AT FILE TAIL of js/i18n.js under your label, matching the dict's real key structure (read first). EN+ZH+KO.
- Shared-file discipline: combat.js is shared with F1 (gun-fire block) and F4 (updateMissiles); hud.js drawHUD tail also gets F1's one-line call — expect sibling labeled lines, never touch them. Your diff = owned functions + single labeled hook lines; helpers at file tails under your label.
- No localStorage outside storage.js. Never commit *.png or .scratch/. Never touch package.json/lock. node_modules symlinked — no npm install. Commit hook fails/hangs → `git commit --no-verify`.

## Verification contract (ALL must pass before reporting green)
1. `npm test` green. 2. `node scripts/shot.mjs streak-check` + inspect PNGs with Read. 3. `node scripts/verify-streak.mjs` green. 4. i18n parity EN+ZH+KO. 5. `node tests/storage.test.js` green.

## Iteration & report
Fix-and-retry autonomously; one failed FULL verification pass = one attempt; after 3 failed attempts stop, commit WIP, report BLOCKED + blocker. Commit 1–3 logical commits, subject `F5: …`, ending with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Final report: STATUS green|blocked · ATTEMPTS n · TESTS files passed · SHOTS + one line per PNG of what you SAW · VERIFY result · FILES touched · I18N keys added · COMMITS hashes · RISKS.
