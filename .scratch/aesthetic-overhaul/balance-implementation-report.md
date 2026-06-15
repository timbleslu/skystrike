# SKYSTRIKE // ACE PROTOCOL — Balance & Pacing Implementation Report

Branch: `aesthetic-overhaul` (built on top of the visual/juice overhaul commit `314d70e` — no visual regression; all changes are gameplay-logic + a few i18n strings + 3 HUD placeholder texts).
Implements §4 Tuning List + §5 Highest-Leverage 3 from `game-design-findings.md`. NOT committed — orchestrator owns git.

Test status (full suite): **`ALL TESTS PASS`** (green). `node --check` clean on every edited JS file. Headless boot via `scripts/shot.mjs` produced all 5 screenshots with **zero PAGE/CONSOLE errors**; a 14-wave headless drive ran clean (see "Runtime verification" below).

---

## 1. Tech-screen cadence (P0)

**What:** The R&D shop no longer opens after EVERY wave. New pure core `shouldOpenTechScreen(wave, wasBoss)` (`js/core.js`): returns false on wave 1 (pure-flight opener), then true every 2nd wave AND always after any wave containing a boss.

| Where | Old | New |
|---|---|---|
| `js/core.js` (new) | — | `shouldOpenTechScreen(wave, wasBoss)` |
| `js/main.js` `handleWaves` (~`main.js:653`) | `openTechScreen();` unconditional every wave | `if (opMode \|\| shouldOpenTechScreen(wave, lastWaveWasBoss)) openTechScreen();` |
| `js/globals.js` | — | added `lastWaveWasBoss` flag (set in `nextWave`) |
| `js/ui.js` `startGame` | — | resets `lastWaveWasBoss = false` |

**Critical correctness — campaign flow preserved:** In **Operation mode** the tech screen is also the campaign-navigation hub — `deployFromTech()` → `openOpMap()` is the ONLY path from a cleared sector to the next sector. So the gate is `opMode || shouldOpenTechScreen(...)`: Operation ALWAYS opens it (campaign keeps flowing), only **Endless** uses the cadence. When the Endless shop is skipped, the existing `waveTimer` countdown in `handleWaves` auto-advances to the next wave (no separate deploy needed). RP banks naturally in `player.tp` between visits.

**Intended effect:** Restores flow (no menu every ~60-90s); each shop visit funds a bigger, more deliberate purchase. Player still reliably reaches the shop to spend RP (verified: Endless tech-open waves over a 14-wave run were `[2,3,4,6,7,8,10,11,12,14]`).

---

## 2. Boss cadence + density (P0/P1)

**What:** Replaced the `wave % 4 === 0` metronome with a windowed schedule, raised the enemy-count cap, and added a rare non-boss wildcard spike. New pure cores in `js/core.js`: `nextBossOffset(rng)` (integer 3-5), `isBossWave(wave, bossWaveNext)`, `waveCount(wave, diff, cap)`, `isWildcardWave(wave, isBoss, roll)`, constants `BOSS_WINDOW_MIN`=3 / `BOSS_WINDOW_MAX`=5 / `WAVE_COUNT_CAP`=16.

| Where | Old | New |
|---|---|---|
| `js/main.js` `nextWave` boss gate (~`main.js:47`) | `if (wave % 4 === 0)` | windowed: `bossWaveActive = isBossWave(wave, bossWaveNext)`; reschedule `bossWaveNext = wave + nextBossOffset(Math.random)` after each boss |
| `js/main.js` `nextWave` count (~`main.js:46`) | `clamp(3 + wave + diff, 2, 10)` | `waveCount(wave, diff, 16)` (+`randInt(2,4)` on wildcard, clamped to 16) |
| `js/main.js` non-boss spawn guards (ace/bomber/drone) | `wave % 4 !== 0` | `!bossWaveActive` |
| `js/main.js` (new) | — | wildcard wave: `isWildcardWave(...)` → denser swarm + extra ace + `banner.wildcardWave` |
| `js/globals.js` | — | `bossWaveNext`, `bossWaveActive` state |
| `js/ui.js` `startGame` | — | resets boss-schedule state |
| `js/i18n.js` | — | `banner.wildcardWave` (EN+ZH) |

**Why the `% 4` → flag swap matters:** the inline `wave % 4 !== 0` checks were overloaded to mean "this is not a boss wave." Once boss cadence is windowed, those guards had to read the new `bossWaveActive` flag instead, or aces/bombers/drones would have spawned on boss waves. `isStrikeWave` and `rivalDue` keep their own `% 4`/`% 5` logic (separate concerns — strike waves, rival pacing — intentionally untouched to avoid scope creep; strike waves only exist in ground-war Endless and are now independent of boss cadence, which is acceptable).

**Intended effect:** Boss timing is unpredictable (3-5 wave window, re-rolled each time); density keeps climbing past the old wave-7 plateau (culling via `cullDistantEnemies`/`GFX_CULL_*` already handles draw cost); occasional wildcard spike breaks the rhythm without chaos (~18%, wave ≥5 only).

---

## 3. AWACS decoupled from RP (P2) — COOLDOWN-GATED

**What:** AWACS strike/resupply/jam no longer cost RP (they drew from `player.tp`, the same pool as permanent tech, so they were never rational and the feature was dead). They are now **free but cooldown-gated**, keeping the per-sector use cap. Chosen the low-risk approach per spec — no new HUD chrome; the existing chip `<i>` element now shows cooldown seconds instead of RP cost.

| Where | Old | New |
|---|---|---|
| `js/core.js` `awacsCall` | `awacsCall(state{rp,uses}, costs, max, key)` → `{ok,reason,rp,uses}` | `awacsCall(state{uses,last}, cd, max, key, now)` → `{ok,reason,uses,last}`; reasons `unknown\|empty\|cooldown\|ok` |
| `js/core.js` `awacsResolve` | RP failure → `awacs.noRp` | cooldown failure → `awacs.cooldown`; returns `{ok,reason,uses,last,effect,banner}` |
| `js/core.js` constants | `AWACS_COSTS {140,90,70}` | `AWACS_COOLDOWNS {strike:30, resupply:26, jam:18}` (seconds); `AWACS_USES_MAX {1,1,2}` unchanged |
| `js/combat.js` `awacsAction` | reads `{rp: player.tp,...}`, commits `player.tp = res.rp` | reads `now = performance.now()/1000` + `{uses,last}`, commits `awacsUses`/`awacsLast` (NO tp deduction) |
| `js/globals.js` | `awacsUses` only | added `awacsLast` (per-key last-call clock) |
| `js/main.js` `nextWave`, `js/ui.js` `startGame` | reset `awacsUses` | also reset `awacsLast` per sector/run |
| `js/ui.js` `updateAwacsHud` | chip shows `"140 RP"` | chip shows live cooldown remaining (`Ns`) or the call's cooldown length |
| `index.html` chip placeholders | `140 RP` / `90 RP` / `70 RP` | `30s` / `26s` / `18s` |
| `js/i18n.js` | — | `awacs.cooldown` (EN+ZH); updated `manBody.awacs` manual entry (EN+ZH) — costs → cooldowns |

**Intended effect:** AWACS is now worth using — it's free, on a tap-and-wait cooldown, capped per sector. It no longer competes with the permanent upgrade economy.

---

## 4. Numeric tuning rows (§4)

| Constant | file:line | Old → New | Effect |
|---|---|---|---|
| WEAPONS BUS cost | `js/globals.js` (`wpn`) | `110 → 160` | Tightens early economy |
| RAPID FEED `fireRateMul` | `js/globals.js` (`g2`) | `0.78 → 0.85` (desc +22%→+18%, ZH too) | Slows runaway DPS stacking |
| FIELD ANALYTICS `rpMul` | `js/globals.js` (`s2`) | `1.25 → 1.15` (desc +25%→+15%, ZH too) | Curbs RP inflation |
| Drone HP scaling | `js/entities.js:1113` | `16 + wave*1.4 → 16 + wave*2.2` | Late swarms stay threatening |
| Crate respawn timer | `js/combat.js` `maybeSpawnCrate` | `rand(11,17)` → linear ramp to `rand(18,28)` by ~wave 14 (`lateF = clamp((wave-4)/10,0,1)`) | Late-game resource scarcity returns |
| Cheat-death (APEX PREDATOR) | `js/main.js` (removed per-wave reset) + `js/ui.js` `startGame` (added per-run reset) + `js/combat.js:480` comment | per wave → **per run** | Restores mortality/stakes |
| Escort survivor threshold | `js/missions.js:54` | `target: Math.ceil(n/2)` (=2, lose 2 of 4) → `target: n-1` (=3, lose ≤1 of 4) | Escort actually tense |

**Did NOT touch (flagged already-good):** LOCK_TIME 1.3s, barrel-roll cooldown 6.0s, boss pulse damage 26/38/46, STAR_KILL_FRAC 0.6. Verified untouched.

---

## 5. Fighter threat variety (P1 — cheap version implemented)

**What:** Widened fighter `turnRate` range and added a simple aggressive/standoff temperament flag (cheap version per spec — full multi-archetype AI deferred).

| Where | Old | New |
|---|---|---|
| `js/entities.js:1126` turnRate | all non-boss/ground: `rand(0.95, 1.32)` | fighters split by temperament: aggressive `rand(1.18, 1.5)`, standoff `rand(0.85, 1.15)`; non-fighters keep `rand(0.95, 1.32)` |
| `js/entities.js:1128` initial fireCd | `rand(0.6, 2)` | aggressive `rand(0.45, 1.1)`, else `rand(0.6, 2)` |
| `js/entities.js` enemy obj | — | `aggressive` flag (~40% of fighters) |
| `js/entities.js:1341` fireCd reset | `(...) * df * enr` | `(...) * df * enr * (e.aggressive ? 0.78 : 1)` — aggressive keep a tighter ongoing cadence |

**Why the second edit (fireCd reset):** the initial `fireCd` is only the first-shot delay; the reset at the firing site governs the ongoing cadence, so the aggressive multiplier had to be applied there too for the flag to have a real, sustained effect.

**Intended effect:** Not every fighter flies the identical "circle-then-strafe"; ~40% are aggressive knife-fighters (sharper turn, faster re-engage) forcing the player to read the threat.

---

## Tests modified / added (and WHY)

- **`tests/awacs.test.js` — REWRITTEN.** The old test asserted RP cost/deduction (`r.rp === 500 - 140`, `noRp` on insufficient RP). Those assertions describe behavior that NO LONGER EXISTS (calls are free). Rewrote to test the real new contract: cooldown gate (reason `cooldown` while inside the window, allowed once elapsed, boundary `now-last===cd` succeeds), per-sector cap independent of cooldown, `last`-timestamp stamping, unknown-key rejection, purity. Same rigor, honest to the new design — NOT weakened to hide a break.
- **`tests/awacs-adapter.test.js` — REWRITTEN.** Old test asserted the `awacs.noRp` failure banner and the `{rp}` field. New test asserts the `awacs.cooldown` banner, the `{uses,last}` fields, effect/banner wiring, cap-vs-cooldown distinction, unknown-key (no banner), purity.
- **`tests/missions.test.js` — UPDATED (escort only).** Old asserted `esc.target === 2` and that `survivors = 1` fails. The escort threshold is now `target = 3` (lose ≤1 of 4) — a deliberate balance change. Updated the target assertion to `3`, changed the fail case to `survivors = 2` (two lost → fail), and ADDED a new assertion that `survivors = 3` (one lost) is still `active`, so the new boundary is meaningfully tested in both directions.
- **`tests/cadence.test.js` — NEW.** Covers the new pure cores: `shouldOpenTechScreen` (skip wave 1, even waves, boss override), `nextBossOffset` (integer in window across the rng range), `isBossWave`, a simulated 40-wave schedule (every gap within 3-5, gaps vary → not a metronome), `waveCount` (clamps to 16, grows past old 10), `isWildcardWave` (rare, non-boss, wave ≥5).

---

## Runtime verification (since gameplay can't be headless-playtested)

- `npm test` → `ALL TESTS PASS` (green).
- `node --check` clean on all 12 edited/new JS files.
- `node scripts/shot.mjs balance_check` → 5 screenshots, **no PAGE/CONSOLE errors** — game BOOTS and a wave starts.
- 14-wave headless drive (Endless, throwaway harness, run + discarded): `RESULT_OK true`, `PAGE ERRORS: NONE`. Observed: boss waves `[3,7,11]` (windowed, not `%4`), tech-open waves `[2,3,4,6,7,8,10,11,12,14]` (wave 1 skipped, every even + boss waves), AWACS strike returns `ok:true` for free off-cooldown, queued counts climbed 4 → 16-20 (density escalates past old cap).

---

## Deferred (too large for this pass — noted, not built)

- **2nd equippable special slot** (surfaces the jet-locked specials) — meta-progression feature, out of scope.
- **Draft-pick "1 of 3" shop** — would reduce choice paralysis but is a UI + shop-logic rebuild.
- **Full mission-verb redesign** (recon/photo-pass, no-kill stealth, real escort corridors) — large mission-system work; only the escort survivor-threshold tightening was done this pass.
- **Full fighter-archetype AI** (evaders that bait missiles, decoy-users, coordinated pincers, rearming) — the cheap aggressive/standoff temperament shipped; the full behavior-tree variety is deferred (would be invasive in `updateEnemy`).
- **Being-locked-by-enemy reticle** (threat-awareness HUD) — HUD feature, out of scope.

---

## Values to watch in playtest (be ready to fine-tune these)

1. **AWACS cooldowns** (`AWACS_COOLDOWNS` in `core.js`, currently 30/26/18s). Tuned conservatively. If strike feels too spammy, raise it; if AWACS feels useless again, lower. The per-sector cap (1/1/2) is the harder limiter.
2. **Boss window** (`BOSS_WINDOW_MIN/MAX` = 3/5). If bosses feel too frequent or too sparse, widen/narrow. Note: first boss can now land as early as wave 3.
3. **Wildcard rate** (`isWildcardWave` threshold 0.18, wave ≥5) and its bonus (`+randInt(2,4)` fighters + 1 ace). If wildcards feel chaotic or unreadable, drop the rate or the bonus.
4. **Density cap** (`WAVE_COUNT_CAP` = 16). Raised from 10; watch frame-rate on low-end devices even with culling. If perf dips, lower toward 13-14.
5. **Drone HP** (`16 + wave*2.2`). Aggressive bump from `*1.4`; if late drones become bullet-sponges, ease toward `*1.8`.
6. **Crate ramp** (`rand(11+7*lateF, 17+11*lateF)`, lateF over waves 4→14). If late game feels starved, shorten the late bound (e.g. 17+8 instead of 17+11).
7. **Cheat-death once per RUN** — biggest stakes change. If Veteran now feels punishing, this is the first knob to soften (e.g. refresh per N waves).
8. **Escort target = 3 of 4** — if escort failures spike frustration, revert to `Math.ceil(n/2)`.
9. **RAPID FEED 0.85 / FIELD ANALYTICS 1.15 / WEAPONS BUS 160** — economy/DPS nudges; safe to revert individually if the early game feels too slow.
10. **Aggressive fighter ratio** (0.4) and the `0.78` fire-cadence multiplier — if dogfights feel unfair, drop the ratio or raise the multiplier toward 0.85.

---

## Docs kept current

`CLAUDE.md` updated in the same pass: the `core.js` row (AWACS_COOLDOWNS + new cadence cores + `tests/cadence.test.js`), the `combat.js` row (AWACS cooldown-gated, cheat-death per-run), and the `main.js` row (windowed boss schedule, density cap, wildcard, tech-screen cadence + the Operation-mode-always-opens rationale). `graphify update .` re-ran (AST-only, no API cost).
