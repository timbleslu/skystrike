# Frontend Build Report — SKYSTRIKE Aesthetic Overhaul

**Branch:** `aesthetic-overhaul` · **Date:** 2026-06-15 · **Agent:** Frontend Developer
**Spec:** `.scratch/aesthetic-overhaul/ui-design-spec.md`

## Summary

Implemented the approved visual-design spec on top of substantial prior P0/partial-P1 work already
on the branch. This pass completed the canvas HUD tier/color system (P1), the grade-first debrief,
the hangar LAUNCH-dominant reorg, the langSelect "sell the game" screen, the onboard one-card,
and the tech-tree / opmap / modal token migrations (P2). All static look, layout, hierarchy, and
component styling — no animation/motion (motion tokens defined in `:root` for the Whimsy pass) and
no gameplay/balance/mechanics changes.

**Test result:** `ALL TESTS PASS` (53 `ok` assertions, 0 `not ok`).
**Boot:** clean — `node scripts/shot.mjs` and a targeted Playwright capture report `CONSOLE ERRORS: none`.

---

## What shipped, per spec section

### P0 — System tokens (was already in place; verified, not redone)
Prior agent had added the full §2 `:root` token set (color/type/spacing/radius/CRT/motion + legacy
aliases) and migrated `.btn-primary`/`#launch`, `.ghostbtn`, `.dbtn`/segmented, `.panel`, `.card`,
`.is-locked`, `.chip`, `.loadout`, navarrows, meters. Confirmed intact; built on it.

### P1 — HUD tier system (the bulk of new work this pass) — `js/hud.js`, `index.html`, `js/ui.js`
- **`HUD` const map (§2a)** added at top of `hud.js` — the canvas twin of the CSS semantic tokens.
- **Three reds → one (`HUD.danger` = 255,57,75)**: unified the lock reticle (was 255,55,55 / 255,70,70),
  enemy drone marker + default fighter marker (was 255,64,96 / 255,80,80), and the hurt-direction edge
  ring (was 255,55,55). Verified zero stray legacy reds remain.
- **§4c canvas values applied**: central reticle → `HUD.primary,.9`; velocity vector → `HUD.velvec,.9`;
  horizon ladder → `HUD.primary,.5` (storm → cold blue-grey); mission objective → `HUD.primary,.95`
  (timed → `HUD.warn`); gun pipper → `HUD.ok`/`HUD.reward`; star objectives → `HUD.reward`/`HUD.dim`;
  weather chip teal → `HUD.primary`; enemy markers (boss magenta kept, rival → `HUD.rival`,
  elite → `HUD.reward`, hp-bar → ok/reward/danger); radar contacts mirror the marker roles.
- **Lock-moment elevation (§4b)**: LOCKED switches to one red (`HUD.danger`), thick box + blinking
  diamond kept; LOCKING brackets retinted to caution-tier `HUD.warn`, progress ring shifts
  reward→warn as it matures.
- **`#warns` split (§4a)** — survival/status tiers (`#warns-survival` + `#warns-status`, `.warn--survival`
  / `.warn--status`): already done by prior agent (HTML + CSS); verified.
- **`#hint` keybind ribbon killed in flight** (`#hint{display:none}`): already done; verified.
- **In-flight lock color (ui.js)** tokenized to `#ff394b` (danger) / `#ffe14d` (reward): already done; verified.

### P2 — Per-screen (UX-priority order)
- **Hangar (UX-02, §5c)** — `index.html` reorg + `js/ui.js`:
  Reordered `.hwrap` into hero (carousel + jet card) → **dominant `▶ LAUNCH MISSION`** directly under
  the jet (carries a live loadout subtitle `#launchSub`, e.g. "VETERAN · DAY · ENDLESS") →
  collapsed `.loadout` strip (difficulty/env/mode/pilot as subordinate segmented toggles) →
  smallest `.hbtns-secondary` ghost row (COMMAND / CONTROLS / DAILY / BOSS RUSH). Every existing id
  preserved. Added `refreshLaunchSub()` hooked into `setDifficulty/setTimeOfDay/setOpMode` + applyLang
  (launch label moved to the button's leading text node so the subtitle span survives re-localization).
  **BOSS RUSH (UX-07)** gets `.is-locked` (§3l) — `refreshBossRushEntry()` toggles `is-locked` when locked.
- **langSelect (UX-01, §5a)** — `index.html` + `js/i18n.js` + `js/ui.js`:
  Dropped "SELECT LANGUAGE" title; wordmark `SKYSTRIKE / ACE PROTOCOL` + new tagline `lang.tagline`
  ("ARCADE JET COMBAT" / "街机空战"); demoted flags to a compact row; added a pulsing `▶`
  + `lang.begin` "press to begin" prompt; background is now a top/bottom scrim (not a black wall) so
  the scene shows through. New EN+ZH i18n keys added (`lang.tagline`, `lang.begin`).
- **Debrief / gameover (UX-10, §5g)** — `styles.css` + `js/ui.js`:
  Inverted the hierarchy via flexbox `order` (no DOM restructure → all ids preserved). The 86px red
  "MISSION FAILED" `<h1>` is demoted to a label-size eyebrow (`--danger`, or `--ok` on a win via
  `.gowrap.win`); the **GRADE letter is the hero** at the old headline's size budget (reward-gold for
  S/A, primary-cyan for B/C via `.gowrap.grade-low`); then stars, SP earned→banked (reward), then the
  quiet stat grid. REDEPLOY is now a primary cyan button (was the red gradient). `endRun(title, win)`
  + `operationComplete`/`bossRushComplete` pass `win=true`; grade render toggles `.grade-low`.
- **Onboard (UX-03/04, §5b)** — `index.html` + `styles.css`:
  Collapsed the three keybind cards into ONE `.ob-onecard` frame (inset top accent, `--sp-6/7` rhythm);
  START is now a `.btn-primary`. Content/ids preserved (copy rewrite deferred to UX/copy owner).
- **Tech tree (§3i/§3j)** — `styles.css` + `js/ui.js`:
  Node states retokenized — `.locked`/`.na` use the steel `--locked` border (not pure opacity-dim),
  `.bought` → `--ok`, `.cantafford` cost → `--danger`. Connectors light the path forward:
  `--ok` (both owned) → `--primary-bright` (affordable next) → `--primary` (reachable) → `--hairline`.
  Tabs converted to the §3j underline pattern (`--primary` active, `--ink-dim`/`--hairline` inactive);
  fixed a latent bug where `.tech-tab` referenced an undefined `--ac` (now defaults to `--primary`).
- **Opmap (§5f)** — `styles.css` + `js/ui.js`:
  Sector states retokenized — pickable = `--primary` ring + glow, future = `--locked`, cleared = `--ok`
  fill, chosen = `--reward`, FINAL/boss = boss-magenta (new `boss` class added when `s === 'FINAL'`).
  `#opLaunch` is now a `.btn-primary`. Box uses the §3k modal frame.
- **Modal frames (§3k)** — `styles.css`:
  `#manual`, `#meta`, `#wingpick` migrated to the unified backdrop
  (`radial-gradient(...) + blur(4px)`), `--surface-2` body, `--bd`, `--r-lg`, token headers;
  manual + meta tab buttons converted to the §3j underline pattern; manual sections use `--bd`/`--surface-2`;
  perk locked state uses `--locked` border.

### P3 — Motion + accessibility (defined, not built)
- Motion tokens (`--dur-*`, `--ease-*`) live in `:root` for the Whimsy/juice agent.
- `prefers-reduced-motion` gating of `#crt` (flicker + chromatic aberration) and the new `.ls-prompt`
  pulse is in place. CRT/scanline intensity is tokenized (`--scan-opacity` etc.).

---

## Files + regions changed
| File | Regions |
|---|---|
| `js/hud.js` | `HUD` const map (top); `drawGunPipper`, `drawStarObjectives`, `drawWeatherChip`, `drawHUD` (reticle/velvec/objective + hurt ring), `drawHorizon`, `drawLockReticle`, `drawEnemy`, `drawRadar` — all rgba literals → `HUD.*`; deferred-note for being-locked reticle |
| `styles.css` | gameover/debrief block (grade-first via flex `order`); tech-tab + tnode states + connectors; opmap sector states + box; manual/meta/wingpick modal frames + tabs; langSelect scrim/tagline/prompt; onboard one-card; loadout strip + secondary tier + rival demotion; perk locked |
| `index.html` | hangar reorg (hero → LAUNCH+subtitle → loadout → secondary, BOSS RUSH `is-locked`); langSelect (tagline + begin prompt, dropped title); onboard one-card; `#opLaunch` `.btn-primary` |
| `js/ui.js` | `endRun(title, win)` + `.gowrap.win`/`.grade-low`; `refreshLaunchSub()` + setter hooks; launch label as text-node + applyLang; `refreshBossRushEntry` `is-locked`; tech connector lit-path; opmap `boss` class; langSelect localization → tagline/begin |
| `js/i18n.js` | `lang.tagline`, `lang.begin` (EN + ZH) |
| `scripts/shot.mjs` | (prior-agent) langSelect gate + debrief capture — left as-is |

## Deferred / not done (with reasons)
- **§4b being-locked-by-enemy reticle** — deferred. The engine has **no per-enemy "locking the player"
  state** to drive it (enemies fire missiles directly; the only incoming signal is
  `missiles.some(m => m.enemy)`). Adding the state would be a gameplay change, out of this visual-only
  pass. A documented note + the warn-tier design intent are left in `drawLockReticle`'s vicinity in
  `hud.js` so it can be wired once that state exists. **For the Whimsy/juice pass:** also the LOCK
  snap-in scale-overshoot beat (§4b) and the audio-synced lock ring pulse are motion — left to you.
- **§5i manual keybinds as `.chip` list** — deferred. The manual keybind content is built in `ui.js`
  innerHTML; converting each key to a `.chip` is a content/markup change with bilingual copy implications
  beyond the static-look scope. The manual frame, tabs, and section styling ARE tokenized.
- **§5b onboard copy rewrite** ("you're a fighter pilot — let's fly", moving the full keybind grid into
  the manual) — the spec flags this as "mostly a structural/copy change the UX brief owns." Delivered the
  visual half (one card, one primary button, negative space); the copy consolidation is left to the
  UX/copy owner so no strings were invented.
- **Tech-tree node-state rendering** could not be visually verified headlessly (nodes render only during a
  live run, not at the hangar). The state CSS is pure token swaps + tests pass; recommend one manual
  in-run pass on the tech tree.

## For the Whimsy / juice pass (explicit handoff)
- Consume the `--dur-*` / `--ease-*` tokens (`:root`) for all choreography.
- Debrief reveal staging (§5g): grade `--ease-snap` pop → stars count-up → SP tick on `--dur-slow`.
- LOCK snap-in overshoot + lock ring pulse (§4b). Banner/warning re-timing off the shared durations.
- langSelect `▶` already has a placeholder pulse you can enrich.

## Verification evidence
- `npm test` → `ALL TESTS PASS` (53 ok / 0 not-ok).
- `node --check` clean on hud.js / ui.js / i18n.js.
- Screenshots captured + visually reviewed: `after-flight.png`, `after-debrief.png` (grade-first
  confirmed), `after-langselect.png` (tagline + demoted flags + begin prompt), `after-hangar2.png`
  (LAUNCH-dominant hierarchy + loadout strip confirmed), `after-onboard.png` (one card + primary START),
  `after-tech.png` (underline tabs + primary deploy), `final-fx.png` (HUD legible over bright dusk sky).
- ID cross-check: every `g('id')` referenced in JS exists in `index.html` (the only two "missing" —
  `techcanvas`, `jetMeta` — are runtime-built innerHTML, pre-existing, unrelated to this pass).
  Removed `langTitle`/`langSub` are no longer referenced anywhere in JS.
