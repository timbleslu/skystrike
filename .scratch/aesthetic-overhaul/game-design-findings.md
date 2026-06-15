# SKYSTRIKE // ACE PROTOCOL — Game Design Findings (Diagnosis Only)

Scope: feel + systems (loops, combat feel, economy balance, pacing, player psychology). UI polish / juice owned by a separate agent. Every claim cites `file:line` from the actual implementation read for this pass.

---

## 1. Snapshot

The core loop is a **wave-survival arcade dogfighter with a between-wave roguelite shop**: clear a wave of fighters/drones/bombers/bosses → an R&D tech screen opens → spend in-run RP on a branching upgrade lattice → DEPLOY into the next wave (`main.js:629-645`, `globals.js:209-345`). On top of that sits an operation-map campaign with 5 typed mission types (`missions.js:26-83`) and a persistent meta layer (SP currency, jet/perk/skin unlocks, run grading, stars) earned across runs (`meta.js:21-75`). The minute-to-minute is genuinely solid: a fast cannon (14ms re-fire, `combat.js:22`), a 1.3s missile lock (`globals.js:351`), barrel-roll i-frames (`globals.js:384-386`), and per-jet specials (`combat.js:743-845`) give the dogfight real texture. The **biggest design problem is that the loop is front-loaded with friction and back-loaded with payoff**: the tech tree is enormous and opens after *every single wave* (`handleWaves` → `openTechScreen`, `main.js:639`), interrupting flow every ~60-90s, while the run's actual difficulty curve is flat and predictable (a boss on a metronome every 4th wave, `main.js:47`). It is fun in the 30-second window and flat in the 30-minute window — the macro-pacing and economy do not create escalating tension or meaningful crossroad decisions, they create a checkout line between fights.

---

## 2. What feels GOOD (keep these)

- **Cannon cadence + crit/burn build paths.** Base gun re-fire is 0.07s, dropping to 0.05s in OVERDRIVE and faster under FRENZY (`combat.js:22`); the Gunnery branch (HEAVY ROUNDS → RAPID FEED → CRIT OPTICS → GAUSS → INCENDIARY) is a clean, legible power fantasy with a satisfying ramp (`globals.js:219-226`). Tight, readable, rewarding.
- **1.3s directional missile lock with audio ramp.** Lock requires alignment > 0.92 and range < 5200, fills over `LOCK_TIME` and chirps faster as it completes, with a haptic on acquire (`combat.js:718-724`, `globals.js:351`). This is a real skill expression — you must point and hold — not a fire-and-forget. Excellent.
- **Telegraphed multi-phase boss attacks.** Bosses wind up a visible telegraph (core glow + ring scale, `main.js:215-220`), then fire one of pulse/barrage/drones, and escalate count/spread/cadence at phase 2 (HP < 0.6) and phase 3 (HP < 0.3) (`main.js:226,256-276`, `core.js:57-62`). Telegraph-then-punish is textbook good boss design — the player has agency to dodge.
- **Per-jet specials create roster identity.** Each airframe has a distinct special — F-22 OVERDRIVE spread cannon, J-20 EMP+instant-lock (no gun), SU-57 cobra brake-turn, J-36 10-missile ORDNANCE STORM (`combat.js:750-806`). This is the strongest expression of "which jet do I pick" and rewards mastery.
- **Comeback mechanics that reward aggression.** ADRENALINE/berserk scales damage as HP drops (`combat.js:13`), lifesteal/NANITE repair heals on kill (`combat.js:580`), kill-frenzy spins up the gun. These create a satisfying "press the advantage when wounded" feel rather than a death spiral.
- **RP credited only for personal kills/damage/assists.** Wingman/CCA kills pay nothing (`combat.js:573-575`, manual `index.html:327`). This correctly keeps the escort a *support* fantasy, not an autobattler — the player must earn their economy.

---

## 3. Design Issues (prioritized)

### P0 — The tech screen interrupts flow after EVERY wave
**Problem:** `handleWaves` calls `openTechScreen()` the instant a wave is declared clear (`main.js:639`), every wave, for the whole run. A wave is ~60-90s of combat; the shop is a full-screen modal context switch.
**Why it hurts:** This is a flow-state killer. Arcade flight combat lives on momentum and "one more pass"; a mandatory menu every minute repeatedly ejects the player from the dogfight headspace. Csikszentmihalyi flow requires uninterrupted challenge-response; this design guarantees interruption. It also trivializes the *decision* — with a purchase window every wave, each individual buy is low-stakes and reflexive, not a crossroads. Players will start mashing DEPLOY, which means the entire upgrade system (the game's depth) gets skipped.
**Fix direction:** Open the shop on a cadence (every 2-3 waves, or after bosses), OR make it a non-blocking HUD overlay you can buy from mid-flight (RP is already a live HUD value). Bank RP between shop visits so buys feel bigger and more deliberate. Consider gating the first shop to after wave 2 so the opening is pure flight.

### P0 — Boss-on-a-metronome destroys pacing surprise
**Problem:** A boss spawns on exactly `wave % 4 === 0` (`main.js:47`), aces roll in at wave ≥3, bombers at ≥4, drones at ≥3 — all on fixed modulo gates with fixed probabilities. Wave enemy count is a flat `clamp(3 + wave + DIFFS.count, 2, 10)` (`main.js:45`).
**Why it hurts:** Predictability kills arousal. After two cycles the player knows wave 4/8/12 is a boss and waves 1-3/5-7 are filler. There is no peak-and-valley intensity curve, no surprise spike, no "calm before the storm." The count caps at 10 by ~wave 7 and never grows again, so waves 8-30 feel identical in density. This is the flat-30-minutes problem: the *content* repeats without *escalation*. Variable-ratio surprise (the slot-machine principle) is exactly what sustains engagement, and it's absent.
**Fix direction:** Introduce an intensity curve — alternate "pressure" and "breather" waves, occasionally double-spike (mini-boss + swarm), let enemy count keep creeping past 10 with smarter culling. Randomize boss cadence within a window (every 3-5 waves) so the player can't autopilot. Add a rare "elite wave" wildcard.

### P1 — Tech tree is too large and too cheap relative to RP income
**Problem:** ~45 tech nodes (`globals.js:209-345`) with costs 110→2000 RP. RP income: 55/fighter, 140/ace, 380/boss, +0.5×damage dealt, plus rpMul/bounty perks (`globals.js:195`, `combat.js:528,573`). A single boss + its wave can fund 600-900 RP; FIELD ANALYTICS (+25% RP) and BOUNTY (+6/kill) compound it (`globals.js:296-297`).
**Why it hurts:** Two failure modes at once. (a) The lattice is so broad that a new player faces choice paralysis with no guidance on what matters — the "minimum viable complexity" principle is violated; many nodes are +12-15% stat nudges that don't change *how you play*, only *how big the numbers are*. (b) Because shop opens every wave and RP flows freely, the economy has no scarcity pressure — there's rarely a painful trade-off, you just buy the next node up your track. Scarcity is what makes economic choices feel meaningful; without it the tree is a formality. Note also many nodes are pure multipliers (`gunDmgMul *= 1.12`) — multiplicative stacking means late-run damage trivializes content, flattening the curve further.
**Fix direction:** Cut/merge the flat-percentage nodes; keep the ones that change verbs (pierce, chain, swarm, execute, EMP-on-kill). Raise costs OR throttle RP so the player can afford ~1-2 nodes per shop, forcing a branch commitment. Consider a "pick 1 of 3 offered" draft instead of a full open shop — that reintroduces the crossroads decision.

### P1 — Enemy AI threat is one-note; "circle then strafe" with ammo that runs dry
**Problem:** Fighters hold distance and circle, then strafe (manual `index.html:316`); they have a finite magazine and "a disarmed foe is just a target" (`index.html:322`). Drones are pure ram-kamikaze (`index.html:317`). Turn rates are a narrow `rand(0.95, 1.32)` (`entities.js:1126`), fire on `rand(0.6,2)` cooldown (`entities.js:1128`).
**Why it hurts:** Once the player learns "outturn, dodge the one strafe, wait for ammo to dry," every non-boss encounter is solved. There's no behavioral variety to force adaptation — no flankers, no defensive evaders that bait your missiles, no coordinated pincers. The systemic-design payoff (emergent strategies from interacting behaviors) never materializes because all fighters run the same routine. The "ammo runs dry → free kill" rule actively *removes* threat over a wave's duration, so waves get easier as they age — the opposite of tension.
**Fix direction:** Give 2-3 fighter archetypes (aggressive knife-fighter, standoff missile-boat, evasive decoy-user) and roll among them. Let some rearm or have deeper magazines so the threat doesn't evaporate. Bombers/aces should behave distinctly enough that the player re-prioritizes targets.

### P1 — Specials are jet-locked, so most of the roster's depth is invisible in any one run
**Problem:** `useSpecial` dispatches on `player.jet.id` (`combat.js:750-806`) and `SPECIAL_CD` is keyed per jet (`globals.js:187`). You only ever experience the special of the jet you flew this run.
**Why it hurts:** The specials are the best-designed identity hook in the game, but they're siloed. A player who mains one jet sees one special for dozens of runs; the variety exists but is locked behind owning + choosing other jets. This under-uses the strongest content and weakens the "try another jet" pull because the rest of the run loop (tech tree, waves) is identical regardless of jet.
**Fix direction:** This is more a *surfacing* problem than a rebalance — consider letting meta-progression grant a second equippable special slot, or rotate a "loaner jet" daily, so players taste the roster's variety without committing a whole run. Lower friction to experiencing the best content.

### P2 — Mission objectives don't reshape the dogfight enough
**Problem:** The 5 mission types (`missions.js:26-83`) are mostly kill-counters with a timer: sweep = kill N (`missions.js:28`), intercept = kill N bombers before timer (`missions.js:41`), escort = keep ≥half of 4 trucks alive (`missions.js:53-54`), defend = hold 100-HP asset for 50+2×wave sec (`missions.js:66-67`), strike = destroy 1 site (`missions.js:79`).
**Why it hurts:** Four of five resolve to "shoot things, possibly before a clock." Escort/defend nominally add a protect-target vector, but with a generous survivor threshold (lose up to half) and a passive asset, they rarely force a genuinely different flight pattern than "kill everything fast." Variety of *labels* without variety of *verbs*. Pacing variety is the stated purpose of the mission layer; it's only half-delivering.
**Fix direction:** Make escort/defend create real spatial tension (asset takes damage you must actively intercept; convoy you must shepherd through a corridor). Add a non-combat verb somewhere (recon/photo-pass, no-kill stealth) for genuine pacing contrast.

### P2 — AWACS support economy competes with the tech tree for the same RP and loses
**Problem:** AWACS strike/resupply/jam cost 140/90/70 RP from `player.tp` (`core.js:149`) — the same currency as tech nodes. Uses cap per sector at 1/1/2 (`core.js:150`).
**Why it hurts:** Spending 140 RP on a one-shot strike vs. 150 RP on a *permanent* tech node is almost never correct — the permanent upgrade compounds for the rest of the run, the strike is gone instantly. Rational players will never touch AWACS, so a whole feature is economically dead-on-arrival. This is a classic dual-sink design error: a consumable and an investment drawing from one pool, where the investment dominates.
**Fix direction:** Put AWACS on its own currency/cooldown (e.g., a "command points" meter that fills over time), or make calls free-but-cooldown-gated. Decouple it from the RP investment decision entirely.

### P2 — Cheat-death + heavy sustain makes Veteran difficulty low-stakes
**Problem:** APEX PREDATOR grants a once-per-wave survive-at-40%-HP (`combat.js:481`, `globals.js:312`); shield regens automatically (`combat.js:870`); supply crates drop every 11-17s refilling everything (`combat.js:312,325-327`); kills lifesteal and bank overshield (`combat.js:580-583`).
**Why it hurts:** Stacked sustain + a free death save removes the loss-aversion tension that makes combat matter. If dying is unlikely and fully recoverable, every engagement is consequence-free, which flattens the emotional curve. Risk/reward needs a credible downside.
**Fix direction:** Gate cheat-death harder (once per *run*, not per wave), or make crate cadence scale down as the run progresses so late-game scarcity returns. Keep the comeback feel but restore mortality.

---

## 4. Tuning List (specific numeric knobs)

| Constant | file:line | Current | Suggested | Expected effect |
|---|---|---|---|---|
| Tech screen cadence | `main.js:639` | every wave | every 2-3 waves / bosses only | Restores flow; makes each shop visit meaningful |
| Boss spawn gate | `main.js:47` | `wave % 4 === 0` | randomized 3-5 wave window | Removes metronome predictability |
| Wave enemy count cap | `main.js:45` | `clamp(3+wave+diff, 2, 10)` | raise cap to ~16 w/ culling | Sustains density escalation past wave 7 |
| AWACS strike cost | `core.js:149` | `strike:140` (from RP) | own currency / cooldown | Makes support viable vs. permanent tech |
| Cheat-death refresh | `main.js:9`,`combat.js:481` | per wave | per run | Restores mortality / stakes |
| Crate respawn timer | `combat.js:312` | `rand(11,17)` | scale up over run (e.g. 18-28 late) | Late-game scarcity / resource pressure |
| WEAPONS BUS cost | `globals.js:213` | `110` | ~160 | Tightens early economy |
| RAPID FEED rate | `globals.js:220` | `fireRateMul *= 0.78` | ~0.85 | Slows runaway DPS stacking |
| FIELD ANALYTICS RP mul | `globals.js:296` | `rpMul *= 1.25` | ~1.15 | Curbs RP inflation that defeats scarcity |
| TP boss reward | `globals.js:195` | `boss:380` | keep, but raise tech costs around it | Re-anchors the economy if costs rise |
| Drone HP scaling | `entities.js:1113` | `16 + wave*1.4` | `16 + wave*2.2` | Keeps swarms threatening late |
| Fighter turnRate | `entities.js:1126` | `rand(0.95,1.32)` | widen + per-archetype | Behavioral variety / forces adaptation |
| Fighter fire cooldown | `entities.js:1128` | `rand(0.6,2)` | tighten for aggressive archetype | More credible standoff threat |
| Escort survivor threshold | `missions.js:54` | lose up to half of 4 | lose ≤1 of 4 | Makes escort actually tense |
| Boss pulse damage | `main.js:274` | `26 / 38 / 46` by phase | keep (well-tuned) | — (reference: this is a good curve) |
| Barrel-roll cooldown | `globals.js:385` | `6.0s` | keep | — (good defensive rhythm) |
| LOCK_TIME | `globals.js:351` | `1.3s` | keep | — (good skill-expression value) |
| STAR_KILL_FRAC | `meta.js` (`0.6`) | `0.6` | keep | — (reasonable mastery bar) |

(Rows marked "keep" are noted so the implementation phase does NOT touch already-good values.)

---

## 5. Highest-Leverage 3 (most improvement per unit effort)

1. **Change the tech-screen cadence (P0).** Single call site (`main.js:639`). Gating it to every 2-3 waves (or behind bosses) + banking RP between visits is a ~10-line change that simultaneously fixes the flow-interruption problem AND restores decision weight to purchases. Biggest feel win for the least code.

2. **Randomize boss/encounter cadence and let density escalate (P0/P1).** Mostly edits in `nextWave` (`main.js:45-56`): replace the `wave % 4` metronome with a windowed boss timer, raise the enemy-count cap, and add an occasional wildcard spike. Directly attacks the "flat 30 minutes" core problem with localized logic, no new systems.

3. **Give AWACS its own currency (P2) and trim the flat-% tech nodes (P1).** Decoupling AWACS from RP (`core.js:149` + the spend site `combat.js:671`) revives a dead feature cheaply; pruning/merging the pure-multiplier nodes (`globals.js` gun/mun branches) reduces choice paralysis and slows the DPS runaway that flattens late waves. Together they make the economy a real set of trade-offs instead of a checkout line.
