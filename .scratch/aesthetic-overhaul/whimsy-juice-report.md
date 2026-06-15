# Whimsy / Juice Pass — SKYSTRIKE // ACE PROTOCOL

**Author:** Whimsy Injector · **Date:** 2026-06-15 · **Branch:** `aesthetic-overhaul`
**Scope:** Motion, feedback, game-feel layered ON TOP of the Frontend dev's finished static visual system.
Additive only — no restyle, no gameplay/balance/timing change. Consumes the P3 `--dur-*` / `--ease-*`
motion tokens (`styles.css:58–64`) the Frontend dev defined for me.

**Verification:** `npm test` → **ALL TESTS PASS (53 ok / 0 not-ok)** — unchanged from the Frontend pass.
`node --check` clean on globals.js / combat.js / hud.js / ui.js. Screenshotter boots with **zero PAGE/CONSOLE
errors** (`scripts/shot.mjs` traps both). CSS braces balanced (548/548).

---

## Reduced-motion foundation (honors the existing gate)

The Frontend dev set up the CSS `@media (prefers-reduced-motion:reduce)` block (`styles.css:96`). I:
- Added a JS twin so the **canvas** juice can gate too: `prefersReducedMotion()` + cached live `matchMedia`
  listener — `js/globals.js:154–159` (loaded before hud.js/combat.js, available everywhere).
- Extended the CSS gate (`styles.css:99–110`) to neutralize every NON-essential animation/transform I added
  while keeping each effect's **end state** (opacity/position intact). Survival signals (low-HP `lowblink`,
  survival-warn `wflash`) are intentionally NOT disabled — they are essential threat feedback.

---

## Effects shipped (grouped)

### 1. Combat feedback (canvas — `js/hud.js`)
| Effect | Where | Motion token / timing | Reduced-motion |
|---|---|---|---|
| **Gun-hit marker snap-in** — chevrons start wide (20px) and stab inward to 11px on an ease-out curve (was a flat linear grow) | `hud.js:197–215` | ease-out, 0.25s life (existing marker life, unchanged) | falls back to original linear shrink |
| **Hit confirm ring** — single expanding white ring on the first ~100ms of each hit | `hud.js:209–213` | ease-out, 0.1s | fully suppressed (`!reduce`) |
| **Damage-number punch-in** — numbers pop oversize on spawn (+55% normal / +90% crit) then settle over ~120ms | `hud.js:222–227` | ease-out overshoot | `pop=1` (no overshoot) |
| **Kill-confirm flash** — quick green (`HUD.ok`) screen-edge bloom on a player kill; bigger/longer for boss+bomber | set: `combat.js:569` (`killFlash`), draw: `hud.js:268–278`; global `js/globals.js:160` | ease-out fade, 0.28s (0.5s big) | fully suppressed (reward punctuation, not survival) |
| **Low-HP screen pulse** — breathing red radial vignette below 30% HP, intensity scales with severity | `hud.js:256–264` | sine breathe @ ~0.006 rad/ms | renders as a STEADY band (essential signal kept, breathing removed) |
| **Missile-LOCK SNAP** — the moment LOCKED engages, the reticle box overshoots in from oversize with a damped wobble + an expanding red shockring radiates out. The "you earned it" beat. | set: `combat.js:724` (`player.lockFlash`, decayed `combat.js:866`), draw: `hud.js:360–380` | damped overshoot (`cos` wobble) over 0.42s | overshoot + shockring suppressed; static LOCKED box still drawn |

`killFlash` / `player.lockFlash` are **visual-only timers** — they do not touch damage, score, lock timing,
or spawn logic. The only feel-tune: boss/bomber kills bump the *already-existing* visual `shakeCam` 0.25→0.42
(`combat.js:569`); ordinary kills keep 0.25. Camera shake was explicitly sanctioned for tuning.

### 2. HUD life (CSS + `js/ui.js`)
| Effect | Where | Token | Reduced-motion |
|---|---|---|---|
| **Combo chip scale-pop** — `.stat.combo b` pops (scale 1.55→1) on each combo increment via reflow-retrigger | CSS `styles.css:131–133`; trigger `ui.js:259–265` (only when combo *increases*) | `--dur-base` `--ease-snap` | animation:none |
| **AB chip flare** — `#abIndicator` pulses its glow while afterburner/overdrive is engaged | `styles.css:128–130` | `--ease-in-out`, 0.9s | animation:none |

### 3. Micro-interactions (CSS)
| Effect | Where | Token | Reduced-motion |
|---|---|---|---|
| **LAUNCH idle pulse** — the primary CTA breathes a slow glow (draws the eye, UX-02); yields on hover/active | `styles.css:314–316` | `--ease-in-out`, 2.6s | animation:none |
| **Ghost-button press** — `:active` scale(.97) tactile push | `styles.css:314` | (transition already tokenized) | transform:none |
| **Difficulty / segmented toggle** — `:active` scale press + a `segSettle` pop when an option becomes `.on` | `styles.css:380–384`, `605–606` | `--dur-fast` `--ease-snap` | animation+transform none |
| **Tech-node purchase press** — `.tnode.avail:active` push-down | `styles.css:479` | (transition already tokenized) | transform:none |
| **Low-HP / banner re-time** — `lowblink` retimed onto `--ease-in-out` | `styles.css:123` | `--ease-in-out` | (survival — kept on) |

### 4. Reward reveal — debrief (CSS + `js/ui.js`)
| Effect | Where | Token | Reduced-motion |
|---|---|---|---|
| **Grade SNAP** — `.gograde` scales in from 2.1× with overshoot when the debrief opens | CSS `styles.css:407–411`; `.reveal` trigger `ui.js:993–995` | `--dur-slow` `--ease-snap` | animation:none, fully visible |
| **Stars + SP rise** — stagger up after the grade (0.32s / 0.46s delays) | `styles.css:408–409` | `--dur-base` `--ease-out` | animation:none |
| **SP count-up** — earned SP ticks 0→total over 560ms | `ui.js:963–968`; `countUp()` helper `ui.js:96–108` | ease-out, 560ms (~`--dur-slow`) | sets flat final value |

---

## Files + regions changed
- `js/globals.js:154–160` — `prefersReducedMotion()` + cached `matchMedia`; `killFlash` global.
- `js/combat.js:569` — `killFlash` set + boss/bomber shake tune; `:724` `player.lockFlash` set; `:866` decay.
- `js/hud.js:122` — `reduce` local in `drawHUD`; `:197–215` hit-marker; `:209–213` confirm ring;
  `:222–227` damage-number pop; `:256–278` low-HP pulse + kill flash; `:360–380` lock SNAP.
- `js/ui.js:96–108` `countUp`; `:259–265` combo pop; `:963–968` SP count-up; `:993–995` reveal trigger.
- `styles.css` — new keyframes `comboPop`/`abFlare`/`segSettle`/`gradeReveal`/`revealRise`/`launchIdle`;
  `:active`/`.on` micro-interactions; debrief reveal; extended reduced-motion gate `:99–111`.

No `index.html` or `i18n.js` change needed — juice is motion, not copy (no new strings).

## Performance notes
All effects use `transform` / `opacity` / `box-shadow` / canvas draw — no layout-thrash. Canvas overlays
(kill flash, HP pulse) are two `fillRect`s gated behind a condition; the lock shockring/hit ring are single
`arc` strokes only while their short timers run. 60fps-safe.

## Screenshots (after)
`juice-after-hangar.png`, `juice-after-flight.png`, `juice-after-fx.png`, `juice-after-debrief.png`,
`juice-after-terrain.png` — captured clean. Stills can't show motion; the debrief frame confirms the reveal
settles to the correct grade-first layout, flight/fx confirm the HUD is uncorrupted and the conditional
overlays (HP pulse / kill flash) correctly render nothing at full HP with no recent kill.

## Deferred (with reasons)
- **Flare-pop screen flash** — deliberately skipped. A defensive cyan full-screen flash on `deployFlares`
  would compete with the T1 survival MISSILE-warning tier the Frontend dev established; the canvas should
  stay calm there. `deployFlares` already has `audio.flare()` + an active missile-seduce, so the moment
  reads without a screen overlay.
- **Being-locked-by-enemy reticle** — still blocked by the same missing engine state the Frontend dev
  documented (`hud.js` note near `drawLockReticle`). No per-enemy "locking you" signal exists; adding one
  is a gameplay change, out of scope.
- **Tech-node `.bought` purchase burst** — used an `:active` press instead of a `.bought` entry animation,
  because the tech tree re-renders fully on every purchase and an entry keyframe would replay on every
  unrelated node each render.
