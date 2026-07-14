# F6 — Operation 4 (new campaign operation)

Branch `factory/f6-operation-4` · shot prefix `op4-check` · tests: extend `tests/op-map.test.js` · verify `scripts/verify-op4.mjs` (REQUIRED)

## Scope
New 4th `OPERATIONS` entry: **8 linear levels**, new region theme — suggest arctic **"POLAR VORTEX"** (creative latitude on name/theme/lore). **Data-table + i18n work ONLY — no new engine mechanics.** Spawn fields may reference wave-1 systems only through EXISTING spawn fields.
Requirements:
- 3-phase final boss with `callsignKey`/`introKey` + `phases[3]` `_phaseCfg` signatures (study op1–3 rows for the exact shape: turnMul/fireMul/extraMissiles/pattern/flags).
- Per-level `nameKey`, blurb (`op.<id>.l<N>.blurb` pattern — ~2 paragraphs, `\n\n`-separated), `objectivesKey`, `enemyIntelKey` — all EN+ZH+KO (ZH/KO machine-draft acceptable, repo precedent).
- ≥2 levels with multi-phase `objectives` sequences (ordered `{type, wp?, spawn?}` queues — study the 6 existing nav levels).
- ≥1 level with a `setpiece` (existing SETPIECES ids).
- `starUnique` on every row (repo v1.3 pattern; that satisfies "per-level stars on ≥3 levels"). Only existing `starCondMet` types.
- Weather/TOD per level should sell the arctic theme (storm/fog/night mix) via existing spawn fields.
- Unlock chain: op4 unlocks after op3's boss clear, exactly how op2/op3 gate off their predecessors (study `campaignOpUnlocked`/meta.campaign — if unlock is data-driven you may only mirror the existing mechanism; do NOT invent new unlock logic).

## Owned code (touch NOTHING else)
- `js/opmap.js`: the `OPERATIONS` table entry (in-table edit is fine — you are the sole opmap owner this wave).
- `js/i18n.js`: large append block AT FILE TAIL under your label — EN+ZH+KO for every new key.

## Tests (extend tests/op-map.test.js — you own it this wave)
Add table-shape invariants covering ALL ops incl. op4: unique level ids · `waves` within 1..`LEVEL_WAVE_CAP` · boss node is last with `phases.length === 3` · every `starUnique`/`stars` type is a valid `starCondMet` type · every `*Key` string used by op4 rows RESOLVES in EN+ZH+KO (i18n.js is not require-safe — scrape it with `readFileSync` + key regex, the `tests/storage.test.js` precedent).

## verify-op4.mjs (REQUIRED)
Boot headless (shot.mjs boot pattern). Via `page.evaluate`: set the dev bypass globals (`devUnlockLevels`, and `devUnlockAll` if needed), navigate `openOperationsSelect` → op4 → `openBriefing` on level 1 → assert briefing DOM shows RESOLVED strings (no literal `op.` key leaks anywhere on screen) → save `op4-check-briefing.png`. Then launch ≥3 distinct levels (e.g. l1/l4/l8) far enough to render terrain and save `op4-check-l1/l4/l8.png`. Exit non-zero on failure.

## Visual verify
READ every PNG: briefing text real (EN), levels render distinct arctic-feeling scenes (weather/TOD variety visible), no black frames, no raw i18n keys.

---
## Ground rules (binding)
- Work ONLY in this worktree. Never push, never touch master, never edit outside it. Read files before editing. Start with the worktree's root `CLAUDE.md` (architecture + hard rules), then study the op1–3 rows + existing i18n op blocks before writing yours.
- Browser globals only, no ES modules. i18n append block AT FILE TAIL of js/i18n.js under `// === F6 operation-4 ===`, extending the live dict to match its REAL key structure (read it first). Every key EN+ZH+KO.
- Shared-file discipline: i18n.js tail is shared with F7/F8/F9 sibling append blocks — never touch theirs.
- No localStorage outside storage.js. Never commit *.png or .scratch/. Never touch package.json/lock. node_modules symlinked — no npm install. Commit hook fails/hangs → `git commit --no-verify`.

## Verification contract (ALL must pass before reporting green)
1. `npm test` green (incl. your extended op-map tests). 2. `node scripts/shot.mjs op4-check` boot sanity + your briefing/level PNGs inspected with Read. 3. `node scripts/verify-op4.mjs` green. 4. i18n parity EN+ZH+KO for every new key. 5. `node tests/storage.test.js` green.

## Iteration & report
Fix-and-retry autonomously; one failed FULL verification pass = one attempt; after 3 failed attempts stop, commit WIP, report BLOCKED + blocker. Commit 1–3 logical commits, subject `F6: …`, ending with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Final report: STATUS green|blocked · ATTEMPTS n · TESTS files passed · SHOTS + one line per PNG of what you SAW · VERIFY result · FILES touched · I18N keys added (count) · COMMITS hashes · RISKS.
