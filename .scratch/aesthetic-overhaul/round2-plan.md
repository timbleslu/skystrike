# Round 2 — Deferred Feature Build Plan

Implements the 5 **Deferred** items from `balance-implementation-report.md`. Branch
`aesthetic-overhaul`. One commit per feature so before/after compares per-feature.
Sequential build (heavy shared-file overlap: ui.js, hud.js, entities.js, combat.js,
core.js, globals.js, i18n.js — concurrent edits would clobber).

Architecture rules every feature obeys:
- Pure logic → `js/core.js`, appended above the `module.exports` footer, no THREE/DOM/store.
- User-facing strings → `t(key)` with EN+ZH in `js/i18n.js`.
- localStorage ONLY in `js/storage.js`.
- Preserve every element `id` JS reads.
- Success gate per feature: `npm test` green + `node --check` clean on edited files +
  `node scripts/shot.mjs <prefix>` boots with zero PAGE/CONSOLE errors.

## Build order & status

| # | Feature | Hot files | Status |
|---|---------|-----------|--------|
| 1 | Being-locked-by-enemy reticle | entities.js, hud.js, core.js | ✅ commit 3ff4c1f |
| 2 | Full fighter-archetype AI | entities.js, core.js, globals.js | ✅ commit ef51801 |
| 3 | 2nd equippable special slot | combat.js, ui.js, globals.js, index.html, i18n.js, controls.js, main.js | ✅ commit 96e4672 |
| 4 | Frontier Draft tech shop | core.js, ui.js, index.html, styles.css, i18n.js | ✅ commit eceac9a |
| 5 | Mission-verb redesign (recon/stealth) | missions.js, core.js, combat.js, hud.js, opmap.js, i18n.js | ✅ commit bd958fe |

**ALL 5 COMPLETE.** Whole branch: `npm test` → 57 ok / ALL TESTS PASS; all `js/*.js`
`node --check` clean; headless boot zero errors. One commit per feature (3ff4c1f, ef51801,
96e4672, eceac9a, bd958fe) for per-feature before/after compare.

## Per-feature design intent

**1. Reticle.** Add per-enemy `aimingPlayer` state in `updateEnemy` (gate: state==='engage'
+ aligned to player within gun cone + in gun range). Pure aim-cone helper in core.js.
Render a shrinking `--warn` threat reticle in hud.js at the marked NOTE (hud.js:402-405),
gated by `prefersReducedMotion` for the pulse but warning stays visible. Survival signal.

**2. Archetype AI.** Add `archetype` field at fighter spawn (weighted pick, pure selector in
core.js). Branch `updateEnemy`: baiter (jink hard when locked by player), decoy (pop decoy on
lock), pincer (paired flank offset), standoff/aggressive kept. Keep boss/drone/bomber/ground
AI untouched. Conservative — extends, not rewrites, the existing state machine.

**3. 2nd special slot.** Refactor `useSpecial()` (combat.js) so a special effect fires by
special-id, not `player.jet`. Slot 1 = native jet special (unchanged binding R). Slot 2 =
equip one special from an UNLOCKED jet (hangar UI), triggered by new key + touch btn. 2nd HUD
chip. Per-slot cooldown state. Surfaces the jet-locked roster.

**4. Draft-pick shop — FRONTIER DRAFT (user-chosen 2026-06-15).** Full TECH_TREE stays visible
and planned. Each shop visit, only 3 of the player's currently-unlockable FRONTIER nodes
(prereq-satisfied + unowned) are OFFERED as buyable; the rest of the tree shows but is
"locked this visit." Player picks one → commitNode (unchanged). Agency knobs: (a) PIN a goal
node — offers bias toward nodes on its prerequisite path; (b) REROLL once per visit; (c) PITY
— a frontier node skipped N visits is force-included. Pure offer-gen + pin-bias + pity in
core.js (seeded RNG, fully testable). Route to goal varies run-to-run; structure + planning
intact. NOT pure randomization. Reuse commitNode/nodeState; add draft-state vars + reroll/pin
UI in ui.js; i18n for offer/reroll/pin/pity labels.

**5. Mission-verb.** Add new MISSIONS entries: `recon` (fly through N waypoints, no-kill
optional), `stealth` (reach objective without being detected/firing). New gameplay hooks:
waypoint proximity + detection state. Pure win/fail in core.js. objectiveText + i18n + opmap
assignment. Escort-corridor = tighten existing escort (already n-1) — minor.

## Deferred-from-deferred (if any feature proves too invasive, document here)
(none yet)
