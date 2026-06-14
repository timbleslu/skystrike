# Plan: Comparable-game features + existing-system improvements

Source ideas: `docs/working/superpowers/ideas/2026-06-14-feature-ideas-comparable-games.md`
Branch: `feat/comparable-games-features` (off master). Execution: subagent-driven-development, per-feature worktree isolation, model tailored to difficulty (haiku=very-simple, sonnet=easy, opus=hard). Two-stage review (spec → quality) per feature. Sequential test-gated merge into the integration branch.

## ⏸ RESUME CHECKPOINT — 2026-06-14 (updated: Wave 1 MERGED)

**Where we are:** ✅ **Wave 1 COMPLETE & MERGED** into `feat/comparable-games-features` (F2→F1→F3→F9→F4, `npm test` green after each; F1 MIRROR-marker polish applied @ `31f0442`). Wave 2 dispatched in fresh worktrees off the merged tip (`w2-f5-tutorial`/`w2-f6-stars`/`w2-f7-daily`/`w2-f8-aces`/`w2-f12-sound`/`w2-f13-pilot`). Wave 3 pending (F10,F11,F14,F15 — F15 needs F4, now merged ✓).

**Wave 1 merge result:** integration branch `feat/comparable-games-features` @ `31f0442`; 5 feature commits + 5 merge commits + 1 polish commit on top of the 2 docs commits. CLAUDE.md Architecture rows (globals/combat/entities) + Current-state entries reconciled (all additive). Old `worktree-agent-*` worktrees now stale — prune after Wave 3.

**Git state:**
- Integration branch: `feat/comparable-games-features` @ `8653c45` (contains ONLY docs: the feature-ideas doc + this plan). Main working tree is on this branch, clean.
- Merge base for every feature worktree branch: `d55e3a5` (2 docs-only commits behind the integration branch → code merges are clean vs the integration tip).
- Recover feature work on resume with: `git worktree list` and `git branch | grep worktree-agent`. (Agent IDs below are session-scoped and become unreachable after a context clear — use the BRANCH names, which persist on disk.)

**Wave-1 feature branches + status:**
| F | Feature | Branch | SHA | Review | Action before merge |
|---|---|---|---|---|---|
| F1 | Screen shake | `worktree-agent-a11ee773456e06dc7` | `7555b79` | CHANGES-REQUESTED | Add `// MIRROR START`/`// MIRROR END` sentinel markers around the camshake block in globals.js (match codebase convention; the byte-identity test already passes). The reviewer's "missing boss-phase function" is a **FALSE POSITIVE** (F1 only needs `shakeCam` global+guarded — it is). Optional: dedupe the double `shakeCam(0.5)` on missile hit (combat.js missile-site + damagePlayer) — harmless (max-wins). |
| F2 | Mission grading S/A/B/C | `worktree-agent-a9251035df608c3f4` | `e55b251` | ✅ APPROVED | None — merge-ready. (Non-blocking notes: grading test #4 uses a hardcoded mult array; sub-1s runs round timeSecs to 0 but gradeRun clamps to 1.) |
| F3 | Afterburner HUD | `worktree-agent-a7155f77022ddffeb` | `dd54f81` | APPROVED + 1 spec miss | Add the one-line CLAUDE.md "Current state" entry (implementer skipped it). Optional: drop the unnecessary `if (el.abIndicator)` guard in ui.js applyLang. |
| F9 | Barrel-roll evade | `worktree-agent-a3e99ce270de5dfac` | `a01cd1e` | NOT REVIEWED | Run the two-stage review (spec→quality). Has MIRROR block + `rollDetect`/`rollCooldownGate`; 14 asserts; tests green. Files: globals.js, combat.js, controls.js, main.js, ui.js, i18n.js, tests/barrel-roll.test.js, CLAUDE.md. |
| F4 | Multi-phase bosses | `worktree-agent-a0e9640d567024562` | `cf7eeaf` | NOT REVIEWED | LANDED CLEAN (hardened prompt held — no escape). Run two-stage review, then **merge LAST**. `e.phase` state machine; pure `bossPhaseFor`/`nextBossPhase` MIRROR (byte-identical, once-per-phase, monotonic); guarded `if(typeof shakeCam==='function')`. Files: globals.js, combat.js (damageEnemy), entities.js (createEnemy e.phase, updateEnemy), main.js (fireBossAttack), i18n.js (banner.bossPhase2/3), tests/boss-phase.test.js, CLAUDE.md. ⚠ ALSO regenerated `graphify-out/*` — exclude those from the merge or just `graphify update .` once at the very end. Adds entities.js + main.js to the conflict surface. |

**Next steps (in order):**
1. Apply the small fixes: F1 MIRROR markers; F3 CLAUDE.md line. (Either edit the worktree branches and amend, OR apply during merge-conflict resolution on the integration branch.)
2. Review F9 (two-stage).
3. Confirm F4 landed (or re-dispatch).
4. **Merge order** into `feat/comparable-games-features`, running `npm test` after EACH: F2 → F1 → F3 → F9 → F4. Expect **additive conflicts** (each merge after the first will conflict) on: `js/globals.js` (the `run` initializer — F2 adds `damageTaken`; camshake consts F1; barrel-roll consts F9), `js/ui.js` (startGame run initializer must stay in sync with globals.js; HUD), `js/combat.js` (**`damagePlayer` is touched by F1 shakeCam + F2 run.damageTaken + F9 timers — same function, will conflict**), `js/i18n.js` (F2 `grade.*`, F3 `hud.ab`, F9 `banner.evade`), `index.html` + `styles.css` (F2 #go_grade, F3 #abIndicator), `CLAUDE.md`. All resolvable by keeping BOTH additions. A cavecrew-builder can resolve each.
5. After Wave 1 merges + green: `node scripts/shot.mjs wave1` smoke (optional), then launch **Wave 2** (F5,F6,F7,F8,F12,F13), then **Wave 3** (F10,F11,F14,F15 — F15 REQUIRES F4 merged). Specs for all below.

**CRITICAL lesson — harden every future implementer dispatch:** one Wave-1 agent (haiku, F3) escaped its worktree and ran `git checkout` in the MAIN tree, leaving it on a stray `feat/afterburner-hud` branch (recovered; branch deleted). The F4 re-run prompt already includes a **git-discipline block** — REUSE IT in every Wave-2/3 dispatch: forbid `git checkout/switch/branch/reset/stash`, forbid `cd` out of cwd, require verifying `pwd`/`git rev-parse --show-toplevel` is under `.claude/worktrees/agent-`, only `git add`+`commit`. Consider NOT using haiku for tasks that involve any git/worktree discipline (it struggled). F3's actual feature work was fine; only its git hygiene failed.

**Cleanup note:** stale `worktree-agent-*` worktrees remain registered under `.claude/worktrees/`; after all merges, `git worktree prune` + delete merged branches.

---

## Shared context preamble (feed to EVERY implementer)

Skystrike = arcade jet combat, Three.js r159 (vendored), **single HTML page, NO build step, NO modules, browser globals only**, strict script load order:
`vendor/three.min.js → storage.js → globals.js → i18n.js → engine.js → entities.js → rival.js → meta.js → opmap.js → missions.js → combat.js → ui.js → controls.js → main.js`

HARD RULES (test-enforced or convention):
- All user-facing strings go through `t(key)` (static UI) / `jetText`/`techText`/`metaText` (data tables). Add **EN + ZH** entries in `js/i18n.js`. ability/callsign NAMES may stay EN by convention.
- No `localStorage` outside `js/storage.js` — use `store.get/set/remove`.
- No ES modules/import. Globals only; respect load order (a symbol must be defined in a file that loads BEFORE its first use).
- Three.js vendored; never re-add CDN tags. Custom `ShaderMaterial` frag shaders must end with `#include <tonemapping_fragment>` + `#include <colorspace_fragment>`.
- Cleanup via `disposeGroup`; tag shared geo/mats `userData.shared`. Enemy death/despawn calls `clearLocks(e)` + removes marker.
- Tests: `npm test` (plain node, no framework). Pure logic that a test mirrors must be **byte-identical** between the source and the `// MIRROR` markers in `tests/*.test.js`. New pure functions → add a mirror + asserts.
- TDD: add/extend a test (RED) → implement (GREEN) → refactor. Run `npm test`; ALL must pass.
- Update `Skystrike/CLAUDE.md` "Current state" + Architecture table line in the SAME change when you add/rename a file, cross-file helper, or finish a roadmap item.
- Commit on your worktree branch when green (`feat: <feature>`). **Do NOT push.** You MAY use `cavecrew-builder` (surgical 1-2 file edits) and `cavecrew-investigator` (locate code) as nested subagents.

Known seams (verified this session):
- `run` stats global (globals.js:208, reset in ui.js `startGame`): `{ shots, hits, missiles, kills, ground, boss, missions, t0, escortKills, pMissiles, pGunKills, pFlares, lastRivalWave }`; `endRun(title)` (ui.js:1132) stamps `run.waveReached`/`run.rivalLevel`, then `spAward`+`bankSP`+`checkAchievements`, fills `#gameover`.
- Audio: `audio = new AudioEngine()` (engine.js:81); `audio.blip(freq, dur, type, vol, slideToFreq?)` oscillator synth. Reuse for new SFX — no asset files.
- Boss: `e.type === 'boss'`; existing single enrage `e.enraged` at hp/maxHp < 0.35 (combat.js:534 → turnRate*=1.3, `empFlash`, `banner.bossEnraged`). Spawned via `spawnRival` (rival.js). `run.boss++` on boss kill (combat.js:579).
- Feedback primitives: `empFlash` global (screen flash w/ decay) is the precedent for a `camShake` global. `player.invuln` (i-frames), `player.throttle` (0..1), `player.overdrive` (existing AB surge special).
- Seeded RNG precedent: `rollWeather(seed)` (globals.js:155, xorshift `x=(seed|0)^0x9e3779b9`). Daily challenge needs a small seeded PRNG in this style.
- HUD: `drawHUD` (ui.js) canvas; throttle bar `el.thr.style.width` (ui.js:558). Banners via `showBanner(t('...'))`.

---

## Waves (dependency-ordered; parallel within a wave via worktrees)

**Wave 1** (foundational + quick wins): F1 Screen shake, F3 AB HUD, F9 Barrel-roll, F2 Mission grading, F4 Multi-phase bosses.
**Wave 2** (independent, heavier): F5 Tutorial, F6 Star objectives, F7 Daily challenge, F8 Named aces, F12 Sound variety, F13 Pilot callsign+emblem.
**Wave 3** (heaviest / dependent): F10 AWACS calls, F11 Mobile perf, F14 Scripted set-pieces, F15 Boss rush (REQUIRES F4 merged).

---

## F1 — Screen shake + camera kick  ·  model: sonnet  ·  wave 1
**Goal:** Brief camera offset/shake on missile hit (player), player damage, kill, and boss phase transition. Massive feel win.
**Files:** globals.js (add `camShake` + tunables), engine.js or main.js (apply offset to camera each frame AFTER the player-follow), combat.js (trigger hooks).
**Approach:** Add global `camShake = 0` (decays like `empFlash`). Add `shakeCam(amt)` helper that does `camShake = Math.max(camShake, amt)`. Each frame, after the camera follows the player, add a small random positional offset scaled by `camShake` (e.g. ±`camShake` on x/y, using `rand`), then decay `camShake` by dt. Locate the camera-follow site with cavecrew-investigator (not in combat.js/main.js via `camera.position` — find where camera tracks the player). Trigger: `shakeCam(0.5)` on player missile hit & damage (`damagePlayer`), `shakeCam(0.25)` on kill (`killEnemy` byPlayer), `shakeCam(0.8)` on boss phase transition (coordinate magnitude only; F4 calls it).
**i18n:** none (pure feel).
**Tests:** add `tests/camshake.test.js` mirroring a pure `decayShake(v, dt)` (or fold into an existing pure helper) — assert monotonic decay to 0, clamp ≥0, and that `shakeCam` takes the max. Keep mirror byte-identical.
**Success:** Shake visibly fires on the four events, decays smoothly, never accumulates unboundedly, `npm test` green. No regression to camera follow.

## F2 — Mission grading (S/A/B/C)  ·  model: sonnet  ·  wave 1
**Goal:** At run end, grade the player (kill %, time, damage taken, objectives) → letter S/A/B/C → SP bonus multiplier shown on the end screen.
**Files:** globals.js or meta.js (pure `gradeRun(run, player)` → `{letter, mult, score}`), ui.js `endRun` (compute grade, apply SP multiplier, render), i18n.js (labels), index.html/styles.css (end-screen grade element).
**Approach:** Pure `gradeRun(run, player)` reading existing `run` fields (+ track `run.damageTaken` — increment in `damagePlayer`; add field to the `run` initializer in BOTH globals.js:208 and ui.js startGame). Weighted score → thresholds → letter + multiplier (S=1.5, A=1.3, B=1.15, C=1.0). In `endRun`, after `spAward`, multiply banked SP by `mult` (stamp the multiplier so it's visible). Add `#go_grade` element. Keep `gradeRun` pure + mirrored in a new `tests/grading.test.js`.
**i18n:** `grade.title` ("MISSION RATING"/"任务评级"), `grade.bonus` ("SP BONUS"/"SP 奖励"). Letters S/A/B/C stay literal.
**Tests:** `tests/grading.test.js` — boundary cases (perfect run → S, mediocre → C), multiplier monotonic with score, byte-identical mirror.
**Success:** Grade + SP bonus appear on `#gameover`; SP actually scaled; `npm test` green.

## F3 — Afterburner HUD indicator  ·  model: haiku  ·  wave 1
**Goal:** When `player.throttle > 0.85` (or `player.overdrive > 0`), show an amber "AB" label / flame next to the throttle readout.
**Files:** ui.js (`drawHUD` near the throttle bar / `el.thr`), i18n.js (`hud.ab`).
**Approach:** Tiny. In the HUD throttle render, if `player.throttle > 0.85 || player.overdrive > 0`, draw an amber `t('hud.ab')` chip beside the throttle bar (canvas text or toggle a DOM element’s visibility). No new state.
**i18n:** `hud.ab` = "AB" / "加力".
**Tests:** none required (pure render); do NOT break existing tests — run `npm test`.
**Success:** "AB" shows only above 0.85 throttle (or during overdrive), hidden otherwise. `npm test` green.

## F4 — Multi-phase bosses  ·  model: opus  ·  wave 1
**Goal:** Boss HP thresholds → phase 2 (and optional phase 3): new/faster attack patterns + a visual cue (afterburner ignition / armor shed) + banner + screen shake. Extends the existing single `enraged` flag into a real phase state machine.
**Files:** combat.js (phase transitions in `damageEnemy`/boss update + specials), entities.js (boss update fn / visual cue), globals.js (phase tunables, optional), i18n.js (phase banners). Coordinate with F1: call `shakeCam(0.8)` on transition (guard `typeof shakeCam`).
**Approach:** Replace the lone `e.enraged` check with `e.phase` (1→2 at hp<0.6, 2→3 at hp<0.3, configurable). On transition: bump `turnRate`/fire-rate, swap/add a special attack pattern, fire a visual cue (`empFlash`, nozzle/afterburner glow, optional armor-shed particles), `showBanner`, screen shake. Keep transitions idempotent (only fire once per threshold). Boss enrage behavior preserved as phase ≥2. Keep any pure threshold/phase helper mirrored.
**i18n:** `banner.bossPhase2`, `banner.bossPhase3` (EN+ZH). Keep `banner.bossEnraged` or repurpose.
**Tests:** new `tests/boss-phase.test.js` — pure `bossPhaseFor(hpFrac)` returns 1/2/3 at the right thresholds; transition fires once per phase (no thrash near boundary). Byte-identical mirror.
**Success:** A boss visibly shifts behavior + shows a cue at the thresholds, banner fires once each, no double-trigger; `npm test` green. This is the dependency for F15.

## F5 — Tutorial / first-run polish  ·  model: opus  ·  wave 2
**Goal:** Guided first wave: contextual prompts ("press W to pitch", arrow at throttle bar) replacing text-only onboarding. Especially for mobile.
**Files:** ui.js (tutorial overlay/steps + arrows; integrate with existing `initOnboarding`/`#onboard`), main.js (first-wave hook, gating), globals.js (`tutorial` state flag), i18n.js (step strings), styles.css/index.html (arrow/highlight elements). storage.js seam via existing `skystrike_onboarded`.
**Approach:** Add a lightweight stepped tutorial that runs ONCE for new players (reuse the `onboarding`/`skystrike_onboarded` persistence; do NOT re-show for returning players). Steps gate on player actions (pitched? throttled up? fired guns? locked+fired missile?) and point at the relevant HUD element. Skippable. Keep mobile (touch) and desktop (keyboard) variants — detect input mode. Pure step-advance logic (`tutorialNext(state, event)`) mirrored in a test.
**i18n:** `tut.pitch`, `tut.throttle`, `tut.guns`, `tut.missile`, `tut.skip`, `tut.done` (EN+ZH).
**Tests:** `tests/tutorial.test.js` — pure step machine advances on the right events, terminates, can't regress; mirror byte-identical.
**Success:** New player sees guided steps tied to actions; returning player skips; skippable; `npm test` green.

## F6 — Star objectives per run  ·  model: opus  ·  wave 2
**Goal:** 1–3 stars/run from secondary objectives ("kill X% enemies", "survive a wave undamaged", "rescue all pilots"). Stars persist per-jet → a cosmetic/unlock track.
**Files:** missions.js or a new objective module (pure objective eval), meta.js (persist `meta.stars[jetId]`), globals.js (per-run objective state), ui.js (end-screen star display + objective HUD hint), i18n.js. storage via meta seam (`store.get/set('skystrike_meta')`).
**Approach:** Define a pure `evalStars(run, player)` → 0..3 based on three checkable conditions using existing `run` fields (+ a `noDamageWave` tracker; reuse F2’s `run.damageTaken` if landed, else track independently — coordinate at merge). Persist best stars per jet in `meta` (extend `validMeta` + the meta object shape; keep meta pure fns mirrored). Show earned stars on `#gameover` and current objectives as a small HUD list. Feed a simple cosmetic/unlock track (e.g. a star-count milestone → a patch or SP).
**i18n:** `stars.title`, `stars.obj.kills`, `stars.obj.noDamage`, `stars.obj.rescue` (EN+ZH).
**Tests:** extend `tests/meta.test.js` (stars persistence + validMeta) and add `evalStars` asserts (byte-identical mirror).
**Success:** Stars compute correctly, persist per-jet across runs, show on end screen; `npm test` green.

## F7 — Daily seeded challenge  ·  model: opus  ·  wave 2
**Goal:** Calendar-date seed → fixed enemy layout/weather/jet restriction, ONE attempt/day, score saved locally. No server.
**Files:** globals.js (seeded PRNG in the `rollWeather` style + `dailySeedFor(dateStr)`), main.js (challenge mode spawn/scheduling using the seeded RNG), opmap.js/missions.js (seeded layout), ui.js (Daily Challenge entry + result/best display), storage.js seam (`skystrike_daily` = `{date, played, best}`), i18n.js.
**Approach:** Add a small seeded PRNG (`makeRng(seed)` returning a function; xorshift/mulberry-style, pure, mirrored). `dailySeedFor(y,m,d)` → int seed. A "Daily" mode: when active, ALL gameplay randomness that matters (enemy layout, weather via `rollWeather(seed+wave)`, jet restriction) derives from the seed; one life. Gate to one attempt/day via `store` (`{date, played:true, best}`). Show today’s seed + best on a hangar entry. Pass the date in (do NOT call `new Date()` inside pure fns; read it once at the call site — `Date` is fine in browser runtime, just keep pure fns seed-parameterized).
**i18n:** `daily.title`, `daily.play`, `daily.done`, `daily.best`, `daily.locked` (EN+ZH).
**Tests:** `tests/daily.test.js` — `makeRng` determinism (same seed → same sequence), `dailySeedFor` stable per date, distinct dates → distinct seeds. Byte-identical mirror.
**Success:** Same date → identical layout/weather; one attempt/day enforced; best persists; `npm test` green.

## F8 — Named ace squadrons per sector  ·  model: sonnet  ·  wave 2
**Goal:** Each sector type spawns a named hostile ace on its final wave (distinct callsign, tuned stats, "HOSTILE ACE INBOUND" banner) — separate from the nemesis.
**Files:** rival.js or a new ace module (ace name pool + spawn), main.js (final-wave spawn hook), entities.js (ace stat tuning/marker — reuse `e.elite`/ace pathway), i18n.js (banner + callsigns may stay EN). There is already `tests/ace-pool.test.js`.
**Approach:** Reuse the existing elite/ace enemy pathway. Add a named-ace pool (callsign + small stat deltas) keyed by sector type. On a sector’s final wave, spawn one tagged ace (`e.aceName`, `e.elite`), show a `HOSTILE ACE INBOUND` banner with the callsign, render the callsign on its HUD marker (drawEnemy already renders callsigns for some). Keep the pool/selection pure + extend `tests/ace-pool.test.js`.
**i18n:** `banner.aceInbound` (EN+ZH); callsigns literal.
**Tests:** extend `tests/ace-pool.test.js` — pool non-empty per sector type, deterministic selection given an index/seed, stat deltas in range.
**Success:** A named ace appears on final waves with banner + callsign, slightly tougher; `npm test` green.

## F9 — Barrel-roll / evasive maneuver  ·  model: sonnet  ·  wave 1
**Goal:** Double-tap roll → ~0.4s invincibility + dramatic roll animation, ~6s cooldown. Mobile panic button.
**Files:** controls.js (double-tap detection on roll input + a `barrelRoll` request flag), combat.js (consume request: set `player.invuln`, drive roll animation, cooldown), globals.js (tunables + cooldown state), i18n.js (optional banner).
**Approach:** Detect double-tap of the roll input (keyboard roll key and/or touch). On trigger, if cooldown ready: set `player.invuln = 0.4` (precedent: vector surge sets invuln 0.4), start a fast 360° roll over ~0.4s (animate bank), start ~6s cooldown. Optional faint banner/haptic. Pure `rollDetect(now, lastTapTime, threshold)` + cooldown gate mirrored in a test. Keyboard path stays intact.
**i18n:** `banner.evade` optional (EN+ZH) — or none.
**Tests:** `tests/barrel-roll.test.js` — double-tap detection within threshold, cooldown blocks re-trigger, invuln window length. Byte-identical mirror.
**Success:** Double-tap rolls with i-frames + cooldown; doesn’t fire on single taps; `npm test` green.

## F10 — AWACS support calls  ·  model: opus  ·  wave 3
**Goal:** Spend RP mid-flight on one of: orbital strike (kill nearest enemy), emergency resupply (restore guns/flares/missiles), jamming (blind enemy missiles 8s). Limited uses/sector.
**Files:** combat.js (effects), ui.js (call menu/buttons + RP cost + uses-left HUD), globals.js (uses-left state + costs), main.js (per-sector reset of uses), controls.js (key/touch binding), i18n.js.
**Approach:** Add an AWACS panel (3 actions, each an RP cost + a per-sector use cap). Bind keys + touch buttons. Effects reuse existing systems: orbital strike → `killEnemy` on nearest non-boss; resupply → refill guns/flares/missiles to max; jamming → set an 8s timer that makes enemy missiles miss/decoy (reuse the existing decoy/`m.decoyed` pathway). Deduct `player.tp` (RP), respect uses-left, reset per sector. Pure cost/uses helper mirrored.
**i18n:** `awacs.title`, `awacs.strike`, `awacs.resupply`, `awacs.jam`, `awacs.noRp`, `awacs.empty` (EN+ZH).
**Tests:** `tests/awacs.test.js` — cost deduction, uses-left decrement + cap, can’t call with insufficient RP. Byte-identical mirror.
**Success:** Each call works, costs RP, capped per sector, jamming expires after 8s; `npm test` green.

## F11 — Mobile performance pass  ·  model: opus  ·  wave 3
**Goal:** Shadow-map resolution reduction, draw-distance culling for distant enemies, LOD on inactive jets — target mid-range phones <30fps.
**Files:** engine.js (shadow map size, a quality tier, cull distance), entities.js (per-enemy LOD/visibility by distance), globals.js (quality setting), ui.js (Settings "Graphics Quality" toggle: auto/low/high), i18n.js.
**Approach:** Add a `gfxQuality` setting (auto/low/high; persisted via settings seam). Low: smaller `sun.shadow.mapSize`, shorter shadow far, cull/hide enemies beyond a distance (visibility toggle, NOT despawn — don’t break `clearLocks`/markers), reduce/skip LOD detail on far jets. Auto: pick by a cheap heuristic (devicePixelRatio / touch / a short fps sample). Keep gameplay identical — visual-only. Headless can’t measure fps; verify via `scripts/shot.mjs` that all 3 TODs still render and tests pass.
**i18n:** `set.gfx`, `set.gfxAuto`, `set.gfxLow`, `set.gfxHigh` (EN+ZH).
**Tests:** no pure-logic test required beyond a quality-tier resolver if added (mirror it). `npm test` green; `node scripts/shot.mjs perf` renders.
**Success:** Low tier measurably reduces shadow cost + far-enemy draw; no gameplay change; renders across TODs; `npm test` green.

## F12 — Sound variety  ·  model: sonnet  ·  wave 2
**Goal:** Missile-lock acquisition tone (rising beep → solid), distinct kill sound (crunch + fading engine), per-jet engine differentiation. Uses the existing WebAudio `AudioEngine` — NO asset files.
**Files:** engine.js (extend `AudioEngine` with new synth methods), combat.js (hook lock acquire, kill), main.js (engine roar per jet), i18n.js (none — audio).
**Approach:** Add methods to `AudioEngine` alongside `blip`: `lockTone()` (rising freq sweep → steady), `killSfx()` (noise/saw crunch + downward engine fade), `engineRoar(jetId)` (per-jet base freq/timbre). Hook: lock-acquire transition in combat.js → `lockTone`; `killEnemy` byPlayer → `killSfx`; player engine loop uses per-jet params. Guard all behind the existing audio-enabled state. Keep it cheap (short oscillator bursts).
**i18n:** none.
**Tests:** none required (audio); `npm test` must stay green (don’t break engine.js load).
**Success:** Distinct lock/kill tones fire; jets sound different; no console errors; `npm test` green.

## F13 — Pilot callsign + emblem  ·  model: sonnet  ·  wave 2
**Goal:** User enters a short callsign (≤8 chars) shown in HUD debrief + hangar; emblem chosen from unlockable patches. Pure cosmetic.
**Files:** ui.js (callsign input + emblem picker in hangar; show in `#gameover`/HUD), meta.js (persist `meta.callsign` + `meta.emblem` + owned patches; extend `validMeta`), storage via meta seam, i18n.js, index.html/styles.css (input + patch grid).
**Approach:** Add a callsign text input (sanitize to ≤8 chars, A–Z0–9) + an emblem grid (a few patches, some gated behind SP/achievements). Persist in `meta`. Display callsign on the end screen + hangar + optionally HUD. Keep meta pure fns mirrored + `validMeta` updated.
**i18n:** `pilot.callsign`, `pilot.emblem`, `pilot.placeholder` (EN+ZH).
**Tests:** extend `tests/meta.test.js` — callsign sanitize (length/charset), emblem ownership gating, validMeta accepts new fields. Byte-identical mirror.
**Success:** Callsign persists + displays; emblem selectable + persists; gating works; `npm test` green.

## F14 — Scripted set-piece events  ·  model: opus  ·  wave 3
**Goal:** Specific op-map nodes trigger authored encounters (fly through a carrier group, outrun a SAM-barrage corridor, escort a bomber through SAM lanes) instead of procedural waves. 1–2 per campaign.
**Files:** missions.js or a new set-piece module (authored encounter definitions + state), main.js (trigger on specific op-map nodes; spawn authored layout), opmap.js (mark set-piece nodes), entities.js (any new prop, e.g. carrier/SAM site — reuse ground/`queueStrikeSite` patterns), ui.js (intro banner/objective), i18n.js.
**Approach:** Define 1–2 authored encounters as data (spawn script: positions/timing/objective). Mark the triggering op-map node(s). When entered, run the authored encounter instead of procedural waves; resolve via the existing mission win/fail seam (`onMissionResolved`). Reuse existing entity types (ground SAM sites via `queueStrikeSite`, bomber escort via the existing escort mission). Keep authored content minimal but special. Pure trigger/selection logic mirrored.
**i18n:** `setpiece.carrier`, `setpiece.samCorridor`, `setpiece.bomberRun`, plus intro/outro strings (EN+ZH).
**Tests:** `tests/setpiece.test.js` — node→encounter mapping deterministic, encounter resolves win/fail correctly (pure parts). Byte-identical mirror.
**Success:** At least one authored set-piece plays end-to-end with intro + win/fail; doesn’t break procedural sectors; `npm test` green.

## F15 — Boss rush mode  ·  model: opus  ·  wave 3  ·  REQUIRES F4 merged
**Goal:** Unlockable mode (clear campaign once): all bosses in sequence, fixed loadout, one life, no tech tree. Leaderboard by total time (local).
**Files:** main.js (boss-rush scheduling/mode), ui.js (mode entry + leaderboard + result), combat.js (uses F4 multi-phase bosses), meta.js (unlock flag + best-time leaderboard persist; extend `validMeta`), globals.js (mode state), i18n.js. storage via meta seam.
**Approach:** Add a `bossRush` mode: unlocked after first campaign clear (persist flag). On start, fixed loadout + one life + no tech tree; spawn the boss pool sequentially (reuse F4 phased bosses + `spawnRival`). Time the run; on completion store best time (`meta.bossRushBest`); show a local leaderboard/best. Pure timing/unlock helpers mirrored.
**i18n:** `bossrush.title`, `bossrush.locked`, `bossrush.best`, `bossrush.start` (EN+ZH).
**Tests:** extend `tests/meta.test.js` — unlock flag + best-time persistence + validMeta; pure sequence/timing helper asserts. Byte-identical mirror.
**Success:** Mode unlocks after a clear, runs all bosses one-life fixed-loadout, records best time; `npm test` green.

---

## Integration protocol (controller)
1. Per wave: dispatch implementer subagents in worktrees (model per spec), parallel where file-disjoint.
2. Per feature on return: spec-compliance review → code-quality review → fix loop until both pass.
3. Merge each approved branch into `feat/comparable-games-features` sequentially; run `npm test` after EACH merge; resolve (mostly additive) i18n.js/globals.js/ui.js conflicts.
4. After all waves: final full-implementation review + `npm test` + `node scripts/shot.mjs` smoke. Then finishing-a-development-branch.
5. Keep this doc as the remaining-steps checklist; delete on final merge.

## Remaining-steps checklist
- Wave 1 (implemented in worktrees; see RESUME CHECKPOINT at top for SHAs/fixes):
  - [x] F2 mission grading — APPROVED, merge-ready
  - [~] F1 screen shake — needs MIRROR markers in globals.js, then merge
  - [~] F3 afterburner HUD — needs CLAUDE.md line, then merge
  - [~] F9 barrel-roll — needs two-stage review, then merge
  - [~] F4 multi-phase bosses — LANDED `worktree-agent-a0e9640d567024562` @ `cf7eeaf`; needs review, merge LAST
  - [ ] MERGE Wave 1 in order F2→F1→F3→F9→F4 with `npm test` gate (additive conflicts expected)
- [ ] Wave 2: F5, F6, F7, F8, F12, F13 (harden dispatches w/ git-discipline block)
- [ ] Wave 3: F10, F11, F14, F15 (F15 after F4 merged)
- [ ] Final full-implementation review + `node scripts/shot.mjs` smoke + finishing-a-development-branch
