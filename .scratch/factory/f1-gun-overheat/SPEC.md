# F1 — Gun overheat

Branch `factory/f1-gun-overheat` · shot prefix `overheat-check` · tests `tests/heat.test.js` · verify `scripts/verify-overheat.mjs` (REQUIRED)

## Mechanic
Firing builds heat 0→1. At 1.0 guns lock out until heat cools below re-arm threshold **0.35** (hysteresis). Heat decays when not firing. HUD heat gauge rendered on the canvas HUD near the ammo readout. Lockout shows banner `banner.gunsOverheat`.
**Balance guard:** default tuning must allow **≥4 s continuous fire** before lockout.

## Pure core (js/core.js, YOUR append block)
- `HEAT` tunables (rise rate, decay rate, `rearm: 0.35`, …).
- `heatStep(state{heat, locked}, firing, dt)` → `{heat, locked, justLocked, justArmed}` — state-in/state-out like `awacsCall`; `justLocked`/`justArmed` fire only on the crossing frame (mirrors `advanceLock`'s `justLocked` style). Clamp heat 0..1. (Batch doc sketched `heatStep(heat, firing, dt)`; hysteresis needs prior `locked`, so the state-object signature is the approved deviation.)

## Owned code (touch NOTHING else)
- `js/combat.js` gun-fire block only: tick `heatStep` each frame (state on `player.gunHeat`/`player.gunLocked`, read with `?? 0`/`?? false` fallbacks — no `createPlayer` edit, auto-resets per run), gate gun fire on `!locked`, on `justLocked` → `showBanner(t('banner.gunsOverheat'))` (+ haptic like siblings).
- `js/hud.js`: new `drawHeatGauge` at file tail under your label (canvas bar near ammo readout; use `hudK()` scale + existing HUD colour vars); ONE labeled call line added at the tail of `drawHUD`'s body.
- `js/core.js` + `js/i18n.js` append blocks (see conventions below).

## Tests (tests/heat.test.js, new file, plain node, `require('../js/core.js')`)
Accumulation while firing · decay while idle · lockout crossing (justLocked exactly once) · re-arm hysteresis (locked stays until < 0.35; justArmed exactly once) · clamping 0..1 · balance guard: from cold, 4 s of continuous fire at default `HEAT` does NOT lock.

## verify-overheat.mjs (REQUIRED)
Copy the boot pattern from `scripts/shot.mjs` (ephemeral port). Drive the live game via `page.evaluate`: start a run, force continuous firing, assert `player.gunHeat` rises → locks at 1.0 → gun gated; release fire, assert decay + re-arm below 0.35. Force heat ≈0.8 and save `overheat-check-gauge.png` showing the gauge partly filled. Exit non-zero on any failed assert.

## Visual verify
`node scripts/shot.mjs overheat-check` → READ each PNG (Read tool renders images): game boots, HUD present, gauge visible on flight/fx shots. Report what you see.

## i18n
`banner.gunsOverheat` + any gauge label — EN+ZH+KO, all three.

---
## Ground rules (binding)
- Work ONLY in this worktree. Never push, never touch master, never edit outside it. Read files before editing. Start with the worktree's root `CLAUDE.md` (architecture + hard rules — replaces exploration), then read the exact functions you'll touch.
- Browser globals only, no ES modules. Pure logic is require-safe in core.js.
- core.js append block AT FILE TAIL (after the existing export footer):
  `// === F1 gun-overheat ===` … definitions … `if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { HEAT, heatStep });` … `// === end F1 ===`. Keep core.js pure — no THREE/store/DOM.
- i18n append block AT FILE TAIL of js/i18n.js under the same label: extend the live dict (e.g. `Object.assign` per language) matching its REAL key structure — read it first. Every key in EN+ZH+KO.
- Shared-file discipline: combat.js/hud.js are being edited by sibling agents in other functions. Your diff = your owned functions + single labeled hook lines. New helpers go at file tails under your label.
- No localStorage outside storage.js. Never commit *.png or .scratch/. Never touch package.json/lock. `node_modules` is symlinked — don't npm install. If a commit hook (graphify) fails/hangs, `git commit --no-verify`.

## Verification contract (ALL must pass before reporting green)
1. `npm test` green (full suite). 2. `node scripts/shot.mjs overheat-check` + inspect PNGs with Read. 3. `node scripts/verify-overheat.mjs` green. 4. i18n parity EN+ZH+KO for every new key. 5. `node tests/storage.test.js` green.

## Iteration & report
Fix-and-retry autonomously; one failed FULL verification pass = one attempt; after 3 failed attempts stop, commit WIP, report BLOCKED + blocker. Commit 1–3 logical commits, subject `F1: …`, ending with:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Final report: STATUS green|blocked · ATTEMPTS n · TESTS files passed · SHOTS prefix + one line per PNG of what you SAW · VERIFY result · FILES touched · I18N keys added · COMMITS hashes · RISKS.
