# SKYSTRIKE — `aesthetic-overhaul` Branch: Complete Change Summary

A multi-agent pass to improve the game's look, feel, and pacing. All work lives on
branch **`aesthetic-overhaul`** (branched from `master` @ `c13f16b`). `master` is
untouched — check out either branch and open `index.html` to compare.

| Commit | Pass |
|---|---|
| `314d70e` | Visual-system overhaul + game-feel juice |
| `109fb77` | Pacing + economy balance tuning |

**Verification (whole branch):** `npm test` → **56 ok / 0 fail**. Headless boot clean,
no console errors. Every JS-read element `id` preserved. Gameplay logic only changed
where intentionally tuned (second commit).

---

## How it was built — the 5-agent pipeline

The user's workflow, run exactly:

```
Phase 1 (parallel):  Game Designer  +  UX Researcher     → diagnose feel + friction
Phase 2:             UI Designer                          → visual system from UX findings
Phase 3 (sequential): Frontend Developer → Whimsy Injector → implement look, then juice
Follow-up:           Game Designer                        → implement the balance tuning
```

Frontend and Whimsy were run **sequentially, not in parallel** — both heavily edit the
same files (`styles.css`, `hud.js`, `ui.js`, `index.html`), so juice was layered onto the
finished static look to avoid clobbering. This matches the brief ("Whimsy layers
personality onto the polished UI").

**Detailed source docs** (in this folder):
- `game-design-findings.md` — gameplay/economy/pacing diagnosis + the 18-row tuning table
- `ux-findings.md` — friction/flow/onboarding audit (UX-01…UX-10)
- `ui-design-spec.md` — tokenized visual system + component + HUD spec
- `frontend-build-report.md` — what the visual implementation shipped
- `whimsy-juice-report.md` — every motion/feedback effect added
- `balance-implementation-report.md` — every balance change + "values to watch in playtest"

---

## Commit 1 — Visual system + juice (`314d70e`)

### Design system (new tokens in `styles.css :root`)
- **Color:** semantic roles replace ad-hoc literals — base/surface/ink, primary cyan,
  `--danger` / `--warn` / `--ok` / `--info` / reward / locked / rival. A matching `HUD{}`
  hex map for the canvas renderer.
- **The three legacy HUD reds unified into one `--danger`** (lock reticle, enemy markers,
  hurt ring) — they used to be three different reds.
- **Type:** scale built on the vendored fonts — Orbitron (display/heading/numerals/buttons,
  caps tracking capped at 0.18em so Chinese stays legible) + Share Tech Mono (body + HUD
  readout). ~9 ad-hoc sizes collapsed into one scale.
- **Spacing:** 4px scale (4→64) replaces scattered pixel values.
- **Radius / border / glow / scanline-CRT-vignette** tokenized; **motion tokens**
  (`--dur-*`, easings) defined for the juice pass.

### Screen-level visual fixes (each resolves a UX finding)
- **Hangar (UX-02):** reordered into a clear hierarchy — jet as hero → one dominant
  `▶ LAUNCH` with a live loadout subtitle → demoted config strip → small secondary ghost
  row. Was a "decision wall" of ~7 config clusters + 5 competing CTAs.
- **langSelect (UX-01):** now frames the game — tagline + "press to begin" + scene-through
  scrim; language demoted to a small flag row. Was a bare toggle on black.
- **Debrief (UX-10):** leads with **GRADE / stars / SP** (the reward) via flexbox `order`;
  the big red "MISSION FAILED" shrank to a tiny eyebrow label, REDEPLOY is a primary button.
  (No DOM restructure → all ids intact.)
- **BOSS RUSH locked state (UX-07):** designed steel/hazard-stripe `.is-locked` treatment
  instead of `opacity:.45` that read as "broken."
- **Onboard (UX-03):** consolidated into one card + a primary START.
- **Tech tree / opmap / modal frames:** node states, lit-path connectors, sector states,
  and the manual/meta/wingpick frames all migrated to the token system; fixed a latent
  undefined CSS-var bug.

### In-game HUD
- All canvas-HUD styling values (reticle / velocity vector / horizon / objective / gun
  pipper / stars / enemy markers / radar) retokenized in `js/hud.js`.
- Lock moment elevated: `LOCKED` = danger, `LOCKING` = warn, the ring shifts reward→warn
  as it closes.

### Juice (motion / feedback — `js/hud.js`, `js/combat.js`, `js/globals.js`, `js/ui.js`)
- **Combat:** missile-**LOCK snap** (overshoot + radiating shockring — the "earned it"
  beat), gun-hit markers that stab inward + a confirm ring, damage numbers that punch in
  (bigger on crits), kill-confirm green edge flash (larger for boss/bomber), low-HP
  breathing red vignette. Existing visual `shakeCam` bumped 0.25→0.42 for boss/bomber kills.
- **HUD life:** combo chip scale-pop on increment, AB chip glow-flare while engaged.
- **Reward reveal:** debrief grade letter snaps in → stars/SP rise staggered → SP count-up
  0→total (~560ms).
- **Micro-interactions:** LAUNCH idle breathing pulse, `:active` press-down on
  ghost/difficulty/segmented/tech-node buttons, toggle "settle" pop.
- **Accessibility:** every non-essential animation gated by `prefers-reduced-motion` (CSS
  block + a JS twin `prefersReducedMotion()` so canvas juice gates too). Survival signals
  (low-HP blink, threat warnings) intentionally stay on.

### Tooling
- `scripts/shot.mjs` patched to drive past the language gate so headless screenshots reach
  the hangar / flight / debrief screens (previously stalled at langSelect).

---

## Commit 2 — Balance / pacing tuning (`109fb77`)

Implements the deferred recommendations from `game-design-findings.md`. **Gameplay logic
only** — does not touch the visual/juice system above.

### Pacing (`js/core.js`, `js/main.js`)
- **Tech shop is no longer a checkout line after every wave.** New pure
  `shouldOpenTechScreen(wave, wasBoss)`: in Endless it skips wave 1, then opens every 2nd
  wave **+** after any boss. RP banks in `player.tp` between visits, so each shop is a
  bigger, more deliberate decision. Operation mode still always opens the shop (it's the
  only path to the next sector) — both modes verified to progress.
- **Boss metronome killed.** `wave % 4 === 0` replaced with a **windowed schedule**
  (`nextBossOffset` / `isBossWave`, next boss 3–5 waves out, re-rolled after each boss) so
  the player can't autopilot.
- **Density escalates.** Enemy-count cap raised **10 → 16** (existing distance-culling
  handles the extra load). Rare non-boss **wildcard spike** wave for surprise.

### Economy / support (`js/core.js`, `js/combat.js`, `js/globals.js`, `js/ui.js`, `js/i18n.js`)
- **AWACS decoupled from RP.** It used to cost RP — the *same* currency as permanent tech
  upgrades, so spending it was almost never correct and the feature was dead. Now
  **cooldown-gated and free** (strike / resupply / jam = 30 / 26 / 18s; per-sector use cap
  kept). `AWACS_COSTS` → `AWACS_COOLDOWNS`; `awacsCall` / `awacsResolve` now take
  `{uses,last}` + `now`; the existing chip just shows cooldown seconds (no new HUD chrome).
- **Tightened the early/runaway economy:** WEAPONS BUS 110 → 160, RAPID FEED `fireRateMul`
  0.78 → 0.85, FIELD ANALYTICS `rpMul` 1.25 → 1.15.

### Mortality / threat (`js/combat.js`, `js/entities.js`, `js/main.js`, `js/missions.js`)
- **Cheat-death (APEX PREDATOR) is once per RUN, not per wave** — restores stakes.
- **Supply-crate respawn ramps** from ~`rand(11,17)`s early to ~`rand(18,28)`s late, so
  late-game resource pressure returns.
- **Drone HP scaling** `16 + wave*1.4` → `16 + wave*2.2` — swarms stay threatening late.
- **Fighter temperament:** ~40% roll **aggressive** (wider turn rate, tighter fire cadence)
  vs **standoff** — cheap behavioral variety so encounters aren't all "circle then strafe."
- **Escort mission** now fails on losing **>1 of 4** trucks (was lose-up-to-half) — makes it
  actually tense.

### Left untouched (flagged already-good in the diagnosis)
`LOCK_TIME` (1.3s), barrel-roll cooldown (6.0s), boss pulse damage (26/38/46 by phase),
`STAR_KILL_FRAC` (0.6).

### Tests
- Rewrote `tests/awacs.test.js` + `tests/awacs-adapter.test.js` for cooldown gating
  (were RP-cost assertions), and `tests/missions.test.js` for the tighter escort threshold.
  These are honest behavior changes reflected in the tests, not weakened assertions.
- Added `tests/cadence.test.js` covering the new pure cadence/density cores.
- `CLAUDE.md` updated so the `core.js` / `combat.js` / `main.js` rows describe the new
  AWACS cooldown economy, boss cadence, tech cadence, and per-run cheat-death.

---

## Round 2 — the deferred items, now built (5 commits)

The items below were originally deferred from the balance pass. They were built in a
second multi-agent pass (one focused agent per feature, sequential to avoid clobbering the
shared hot files). One commit each, on `aesthetic-overhaul`, for per-feature before/after
compare. Whole-branch gate held: `npm test` → **57 ok / ALL TESTS PASS**, all `js/*.js`
`node --check` clean, headless boot zero errors. Build log: `round2-plan.md`.

| Commit | Feature |
|---|---|
| `3ff4c1f` | Being-locked-by-enemy threat reticle |
| `ef51801` | Fighter archetypes (baiter / decoy / pincer / duelist) |
| `96e4672` | 2nd equippable special slot |
| `eceac9a` | Frontier Draft tech shop |
| `bd958fe` | Recon + no-kill stealth missions |

- **Threat reticle (`3ff4c1f`).** Enemies now carry an `aimingPlayer` state (set in
  `updateEnemy` when lined up on you); a pulsing amber `--warn` reticle + chevron warns you
  pre-hit. Pure `enemyIsAimingPlayer` gate (tested). Motion gated by reduced-motion; the
  warning still shows steady. Wired at the exact spot a prior pass had marked "deferred."
- **Fighter archetypes (`ef51801`).** One state machine → four readable, counterable
  profiles: **baiter** jinks to break your lock, **decoy** pops flares proactively when
  locked + keeps distance, **pincer** pairs flank with opposite orbit sign, **duelist** =
  the old behavior (kept byte-for-byte; dominant early). Pure `pickArchetype`/`shouldJink`/
  `pincerSign` (wave-weighted, tested). Boss/drone/bomber/ground AI untouched.
- **2nd special slot (`96e4672`).** Surfaces the jet-locked roster: slot 1 = native jet
  special (R, unchanged); slot 2 = one special equipped from another **unlocked** jet (new
  KeyB + touch btn + `#special2` HUD chip + hangar picker). `useSpecial()` refactored to fire
  effects by special-id (all 12 audited portable). Equip persists via `storage.js`
  (storage-seam test stays green). OVERCLOCK/GHOST affect slot 1 only.
- **Frontier Draft shop (`eceac9a`).** Fuses draft freshness with the structured tree (your
  call — not pure randomization). Full tree stays visible; each visit only 3 of your
  unlockable frontier nodes are buyable, **pick one** → deploy. **Pin** a goal (offers bias
  toward its prereq path), **reroll** once, **pity** force-includes a long-skipped node. The
  route varies run-to-run; planning stays. Reuses `renderTechTree`/`commitNode`; armory tab +
  Operation campaign flow unchanged. Pure offer/pin/pity cores tested.
- **Recon + stealth missions (`bd958fe`).** First non-combat verbs. **Recon**: fly through N
  waypoints (HUD points to the next), no kills required. **Stealth**: reach extraction
  without detection — a detect meter rises while you fire or while any enemy `aimingPlayer`
  is set (reuses the reticle signal), fail at 100%. Shared pure waypoint primitive + detection
  model (tested). Sprinkled into the Operation campaign; the 5 combat verbs + escort (n-1)
  untouched.

### Still deferred (genuinely out of scope, noted not built)
- **Escort *corridors*** as a distinct verb — escort stays the tightened (n-1) version; no
  waypoint-path convoy variant was added.
- Per-archetype **named HUD callouts**, audio/haptic threat cue, a pity **badge**, and 3D
  waypoint **meshes** (HUD markers used instead) — all small polish, left for a later pass.
- These remain **un-playtested for feel** — see the caveat below. The numbers (archetype mix,
  detection rise/decay, draft pity threshold, waypoint radii) are isolated, documented knobs.

---

## ⚠️ One caveat — playtest the feel

Gameplay values **cannot be verified headlessly** (no touch/flight/fps simulation). The
balance numbers were set conservatively and verified for *correctness* (windowed boss
waves, tech cadence, AWACS cooldowns, density curve) via a 14-wave headless drive — but the
*feel* needs a human at the stick. If anything is off (bosses too rare, AWACS cooldowns too
long/short, drones too tanky), the constants are isolated and easy to nudge —
`balance-implementation-report.md` lists the exact ones to watch.

## Compare before / after

```bash
git checkout master              # before
git checkout aesthetic-overhaul  # after
# open index.html in a browser for each
```
