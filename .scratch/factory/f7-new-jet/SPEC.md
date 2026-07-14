# F7 — New flyable jet + hostile ace variant

Branch `factory/f7-new-jet` · shot prefix `newjet-check` · tests: existing suites must pass · verify: `scripts/beauty.mjs` + `scripts/verify-jets.mjs`

## Scope
One new airframe (creative latitude on fantasy name/design — distinct stat/ability niche vs the existing 12, e.g. heavy standoff interceptor or agile gun-duelist):
- `JETS` roster entry in `js/roster.js` (id/shape/name/stats/ability/skin colours + SP unlock cost — mirror how existing entries carry cost/unlock).
- `SHAPES` entry in `js/airframes.js` using EXISTING feature flags only (procedural `buildJet` path). The new shape id must NOT be added to `JET_MODELS` (no glTF this batch — `buildJetOrGLTF` falls back to `buildJet` for shapes absent from `jetGLTF`; confirm that fallback holds on High tier).
- 3 `SKINS` entries in `js/meta.js` (default + 2 colour-block liveries). Study how SKINS/paint reach the PROCEDURAL `buildJet` path (`resolveSkinPaint`/`jetPaint` — zones are a glTF material-name mechanism; for procedural jets liveries likely = color/accent variants). Liveries must be distinct at a glance.
- Include the new shape in the ace shape pool (`roster.js` `aceShapePool`) so hostile aces can fly it.
- i18n: jet name/desc via `jetText` fields + skin names via `metaText` `meta` group — EN+ZH+KO.

## Owned code (touch NOTHING else)
`js/roster.js`, `js/airframes.js`, `js/meta.js` (SKINS table only), `js/i18n.js` append block. In-table edits fine — you are sole owner of roster/airframes this wave; in meta.js touch ONLY the SKINS table (F8/F9 edit other meta.js regions — freshMeta/loadMeta are THEIRS, don't touch).

## Tests
`tests/plain-shapes.test.js` / `tests/npc-airframes.test.js` / `tests/ace-pool.test.js` / `tests/has-special.test.js` (+ `tests/skins.test.js` if present) must pass with the new entry — they validate the REAL tables. If a suite hardcodes a roster count, updating that count constant is allowed; loosening an invariant is NOT.

## Verify scripts (REQUIRED, existing tools)
- `node scripts/beauty.mjs newjet-check <newJetIndex>` — close-ups (front/side/rear + ordnance board). READ them: clean silhouette, no holes/z-fighting/inverted normals, canopy/intakes sane, liveries visibly distinct (run per skin if the tool allows, else force-select skin via a small `page.evaluate` variant or judge from hangar preview).
- `node scripts/shot.mjs newjet-check` — hangar shot; jet card renders (name resolved, stats visible).
- `node scripts/verify-jets.mjs` — still green (don't regress the roster-wide checks).

## Visual verify
READ every PNG produced; report what the airframe actually looks like and how the liveries differ.

---
## Ground rules (binding)
- Work ONLY in this worktree. Never push, never touch master, never edit outside it. Read files before editing. Start with the worktree's root `CLAUDE.md`, then study 2–3 existing roster/SHAPES/SKINS entries end-to-end before writing yours.
- Browser globals only, no ES modules. roster.js/airframes.js must stay pure & require-safe (no THREE/store/DOM). i18n append block AT FILE TAIL under `// === F7 new-jet ===`, matching the dict's real key structure. EN+ZH+KO.
- Shared-file discipline: meta.js and i18n.js tails are shared with F6/F8/F9 sibling blocks — never touch theirs.
- No localStorage outside storage.js. Never commit *.png or .scratch/. Never touch package.json/lock. node_modules symlinked — no npm install. Commit hook fails/hangs → `git commit --no-verify`.

## Verification contract (ALL must pass before reporting green)
1. `npm test` green. 2. `node scripts/shot.mjs newjet-check` + `node scripts/beauty.mjs newjet-check <idx>` + inspect PNGs with Read. 3. `node scripts/verify-jets.mjs` green. 4. i18n parity EN+ZH+KO. 5. `node tests/storage.test.js` green.

## Iteration & report
Fix-and-retry autonomously; one failed FULL verification pass = one attempt; after 3 failed attempts stop, commit WIP, report BLOCKED + blocker. Commit 1–3 logical commits, subject `F7: …`, ending with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Final report: STATUS green|blocked · ATTEMPTS n · TESTS files passed · SHOTS + one line per PNG of what you SAW · VERIFY result · FILES touched · I18N keys added · COMMITS hashes · RISKS.
