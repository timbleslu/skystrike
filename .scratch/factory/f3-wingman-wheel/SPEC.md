# F3 — Wingman command wheel

Branch `factory/f3-wingman-wheel` · shot prefix `wingman-check` · tests `tests/wingman-orders.test.js` · verify `scripts/verify-wingman.mjs` (REQUIRED)

## Mechanic
Three wingman orders + default: **FREE** (default = current behavior), **ENGAGE** (attack the player's locked target), **COVER** (prioritize enemies targeting the player), **REGROUP** (form on player offset, weapons hold). Keys **4/5/6** (`Digit4`–`Digit6`) + three touch buttons (`tb-` prefix, beside the AWACS button cluster). The wingman sidebar shows the active order as a badge. Fallbacks: ordered target dies, or player lock lost while ENGAGE → revert to FREE.

## Pure core (js/core.js, YOUR append block)
- `WINGMAN_ORDERS` (['FREE','ENGAGE','COVER','REGROUP']) + `wingmanOrder(state, cmd)` state machine → `{order, banner}` — cmd may be an order command or a fallback event ('targetLost' / 'lockLost'); invalid cmd = no-op (same order, null banner). Pure, no clock.

## Owned code (touch NOTHING else)
- `js/main.js` wingman AI block only: read the active order (store on `player.wingOrder ?? 'FREE'` — read-with-fallback, write on command; no createPlayer edit, auto-resets per run) and adjust wingman target selection/behavior per order (REGROUP = position on player offset + hold fire). Wire `Digit4`–`Digit6` in the existing keydown block as labeled lines beside the AWACS keys → your order-command function (tail of main.js under your label), which also triggers the fallback checks each tick (labeled one-liner in the wingman AI block).
- `index.html`: three touch buttons (`tb-weng`/`tb-wcov`/`tb-wrgp`) markup ONLY, next to the AWACS buttons.
- `js/controls.js`: `bindBtn` additions for the three buttons (labeled lines beside the AWACS bindings).
- `js/ui-settings.js` `applyLang`: ONE labeled line localizing your three buttons (mirror `tb-aws`/`tb-ars`/`tb-ajm` handling).
- `js/ui-hud.js` `updateWingmanSidebar`: order badge (labeled addition rendering the active order via `t('wing.order.<x>')`).
- `js/core.js` + `js/i18n.js` append blocks.

## Tests (tests/wingman-orders.test.js, new file, `require('../js/core.js')`)
Every state × every cmd transition · invalid cmd no-op · targetLost while ENGAGE → FREE · lockLost while ENGAGE → FREE · REGROUP/COVER unaffected by lockLost · banner keys returned on real transitions, null on no-ops.

## verify-wingman.mjs (REQUIRED)
Boot headless (shot.mjs pattern). Start a run via `page.evaluate`, dispatch a `Digit4` keydown → assert the order state became ENGAGE and the sidebar badge text updated; cycle 5/6 similarly; save `wingman-check-sidebar.png` showing the badge. Exit non-zero on failure.

## Visual verify
`node scripts/shot.mjs wingman-check` + READ PNGs (boot sanity, HUD present); your sidebar badge screenshot must show the active order.

## i18n
`wing.order.free/engage/cover/regroup`, order banners (`banner.wingman*` or similar), `touch.weng/wcov/wrgp` — EN+ZH+KO.

---
## Ground rules (binding)
- Work ONLY in this worktree. Never push, never touch master, never edit outside it. Read files before editing. Start with the worktree's root `CLAUDE.md`, then the exact functions you'll touch.
- Browser globals only, no ES modules. core.js append block AT FILE TAIL (after existing export footer): `// === F3 wingman-wheel ===` … `if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { WINGMAN_ORDERS, wingmanOrder });` … `// === end F3 ===`. Keep core.js pure.
- i18n append block AT FILE TAIL of js/i18n.js under your label, matching the dict's real key structure (read first). EN+ZH+KO for every key.
- Shared-file discipline: main.js/controls.js/ui-hud.js/ui-settings.js are shared with siblings — your diff = owned functions + single labeled hook lines; helpers at file tails under your label.
- No localStorage outside storage.js. Never commit *.png or .scratch/. Never touch package.json/lock. node_modules symlinked — no npm install. Commit hook fails/hangs → `git commit --no-verify`.

## Verification contract (ALL must pass before reporting green)
1. `npm test` green. 2. `node scripts/shot.mjs wingman-check` + inspect PNGs with Read. 3. `node scripts/verify-wingman.mjs` green. 4. i18n parity EN+ZH+KO. 5. `node tests/storage.test.js` green.

## Iteration & report
Fix-and-retry autonomously; one failed FULL verification pass = one attempt; after 3 failed attempts stop, commit WIP, report BLOCKED + blocker. Commit 1–3 logical commits, subject `F3: …`, ending with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Final report: STATUS green|blocked · ATTEMPTS n · TESTS files passed · SHOTS + one line per PNG of what you SAW · VERIFY result · FILES touched · I18N keys added · COMMITS hashes · RISKS.
