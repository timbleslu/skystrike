# F8 — Weekly challenge

Branch `factory/f8-weekly-challenge` · shot prefix `weekly-check` · tests `tests/weekly.test.js` · verify `scripts/verify-weekly.mjs` (REQUIRED)

## Scope
Deterministic weekly mode beside the daily challenge:
- `weeklySeedFor(dateStr)` — ISO-week-derived seed, mirrors `dailySeedFor` (takes a date STRING, **never reads the clock**), + a week-id helper (e.g. `weekIdFor(dateStr)` → `'2026-W28'`) for the meta key. TZ-independent: same ISO week → same seed regardless of weekday.
- `WEEKLY_MODIFIERS` table (≥5 entries; suggested: stormFront = weather locked storm, noFlares, doubleAces, ironHull = no resupply, fogOfWar = radar range halved) + `weeklyModifiers(seed)` deterministically picking **2 distinct stacked modifiers** via `makeRng`.
- Modifiers APPLIED at run start via EXISTING globals/hooks. Prefer modifiers applicable from `startGame`/your startWeekly path (e.g. weather lock via weather globals, noFlares via player consumables). Minimal labeled lines in `js/main.js` spawn guards are allowed if a modifier needs them (main.js has no sibling owner this wave) — but prefer the table entries you can apply cleanly; you have latitude over which 5+ modifiers exist as long as the 2 picked each week demonstrably work.
- Hangar entry card beside the daily entry: `refreshWeeklyEntry` + start path mirroring `loadDaily`/`dailyToday`/`startDaily`/`refreshDailyEntry` (study that quartet first). `index.html` markup for the card allowed (mirror the daily card).
- Weekly best stored in `meta` keyed by week id, **save-healed** in `loadMeta` (legacy saves get the field, no wipe).

## Owned code (touch NOTHING else)
- `js/core.js` append block (seed/week-id/table/pick fns — pure, no clock).
- `js/ui-flow.js`: `refreshWeeklyEntry` + `startWeekly` (+ call sites where the daily entry refreshes, as labeled lines). `startGame` labeled lines to apply active weekly modifiers.
- `js/meta.js`: weekly-best field — ONE line in `freshMeta` + ONE labeled heal line in `loadMeta` + a small best-update helper near the other best/record helpers. (F9 edits the SAME two functions for its own field — keep your additions to single clearly-labeled lines.)
- `index.html` weekly card markup. `js/i18n.js` append block.

## Tests (tests/weekly.test.js, new file, `require('../js/core.js')` + meta via its export footer)
Seed determinism: all 7 days of one ISO week → same seed · adjacent weeks differ · ISO-week boundary correct (Mon start; test a year-boundary week) · modifier pick: same seed → same 2, distinct, from the table · no-clock rule: `readFileSync` scrape of the F8 core block contains no `Date.now`/`new Date()` (mirror `tests/daily.test.js`'s approach if it has one) · meta heal: legacy meta object without the field → `loadMeta` adds it, other fields untouched.

## verify-weekly.mjs (REQUIRED)
Boot headless (shot.mjs pattern). Assert the hangar weekly card renders with this week's 2 modifier names (resolved strings, not raw keys); save `weekly-check-card.png`. Start the weekly via the real entry path; assert both modifiers took effect in live globals (e.g. weather === 'storm' locked / `player.flares === 0` — match whichever 2 this week's seed picks, read them from `weeklyModifiers` first). Exit non-zero on failure.

## Visual verify
`node scripts/shot.mjs weekly-check` + READ PNGs — hangar shows the weekly card beside daily.

## i18n
`weekly.*` (card title/CTA, each modifier name+desc, any banner) — EN+ZH+KO.

---
## Ground rules (binding)
- Work ONLY in this worktree. Never push, never touch master, never edit outside it. Read files before editing. Start with the worktree's root `CLAUDE.md`, then study the daily-challenge quartet + meta heal pattern before writing.
- Browser globals only, no ES modules. core.js append block AT FILE TAIL (after existing export footer): `// === F8 weekly-challenge ===` … `Object.assign(module.exports, { weeklySeedFor, weekIdFor, WEEKLY_MODIFIERS, weeklyModifiers })` guarded … `// === end F8 ===`. Keep core.js pure — NO clock reads.
- i18n append block AT FILE TAIL under your label, real key structure, EN+ZH+KO.
- Shared-file discipline: meta.js freshMeta/loadMeta + ui-flow.js + i18n.js tail are shared with F9 (veterancy) and others — single labeled lines, never touch sibling blocks.
- No localStorage outside storage.js (weekly best goes through meta/store seam). Never commit *.png or .scratch/. Never touch package.json/lock. node_modules symlinked — no npm install. Commit hook fails/hangs → `git commit --no-verify`.

## Verification contract (ALL must pass before reporting green)
1. `npm test` green. 2. `node scripts/shot.mjs weekly-check` + inspect PNGs with Read. 3. `node scripts/verify-weekly.mjs` green. 4. i18n parity EN+ZH+KO. 5. `node tests/storage.test.js` green.

## Iteration & report
Fix-and-retry autonomously; one failed FULL verification pass = one attempt; after 3 failed attempts stop, commit WIP, report BLOCKED + blocker. Commit 1–3 logical commits, subject `F8: …`, ending with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Final report: STATUS green|blocked · ATTEMPTS n · TESTS files passed · SHOTS + one line per PNG of what you SAW · VERIFY result · FILES touched · I18N keys added · COMMITS hashes · RISKS.
