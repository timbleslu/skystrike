Revamp Skystrike's operations map into a multi-operation campaign of replayable,
linear level maps. This replaces the current op-map model. Skystrike = the GitHub
repo (~/Claude/Skystrike clone); read js/CLAUDE.md before touching code.

## What exists today (replace this)
- js/opmap.js `genOpMap()` returns a fixed 7-stage campaign; each stage is a
  CHOICE of two sectors, ending in `['FINAL']` (boss). Player picks one sector
  per stage, left→right. (This is the "flat tree" — remove the choice.)
- A whole Operation is ONE roguelite run: RP/tech accumulate between sectors,
  death = `gameOver()` ends the run, clearing FINAL = `operationComplete()`.
- Sectors scale off the global endless `wave` counter; missions are already typed
  (js/missions.js: sweep/intercept/escort/defend/strike/recon/stealth + boss).
- No persistent per-level completion and no replay.

## Target design (build this)

STRUCTURE — three tiers:
1. Operations select screen: lists several Operations (Op 1, Op 2, …), each
   locked until the previous Operation's boss is beaten.
2. Per-operation level map: a LINEAR path of level nodes ending in a boss level.
   Beating level N unlocks N+1. Nodes show state: locked / unlocked / cleared.
   Player can click any unlocked or cleared node to open the Mission Briefing Screen.
3. Mission Briefing Screen: a full-screen (or near-full) panel that appears when
   a level node is clicked. It is NOT the in-game modal — it is a navigation layer
   the player visits BEFORE launching. It shows:
   - Mission name and operation context (e.g. "OPERATION IRON VEIL — Level 3: BLINDSPOT")
   - Lore/narrative text explaining the tactical situation and why we're here
   - Objectives (win conditions for this level, stated as orders)
   - Enemy intel (what unit types and threats to expect)
   - Current loadout summary (read-only reference)
   - A PLAY button (launches the level) and a BACK button (returns to the map)
   Localize all narrative strings via t() / i18n.js. The existing in-game briefing
   modal (on level START) can be removed or collapsed to a minimal "launching…"
   transition since the Briefing Screen now carries that role.

EACH LEVEL:
- Exactly ONE fixed mission type (no per-stage choice). Drawn from the existing
  typed missions; the last node of every operation is a boss level (reuse the
  existing multi-phase boss state machine).
- Runs a BOUNDED bank of waves (not endless). Clearing all its waves = level
  complete. Wave count scales with level index, e.g. `2 + floor(index/2)` capped.
- Difficulty = count + tiered threats: early levels add enemy count; mid levels
  add tougher types (bombers/aces); late levels add weather/night, then the boss.

RUN / ECONOMY MODEL (checkpoint hybrid):
- RP and tech upgrades persist ACROSS levels within an operation.
- At each level start, SNAPSHOT the player's RP/tech/loadout state.
  - WIN  → commit the snapshot + grant the level's RP/score/SP rewards.
  - FAIL (death) → roll back to the snapshot: keep upgrades earned BEFORE this
    level, but lose any RP earned or tech unlocked DURING the failed attempt.
    Return to the map; the level stays unlocked; retry freely.
- REPLAY a cleared level: play with current loadout, and re-grant its rewards
  each time. (NOTE: this is farmable by design — a single flag should let us
  switch replays to no-reward later if it unbalances RP.)
- Meta SP / unlocks (js/meta.js) persist globally as they do today.

PERSISTENCE:
- Persist per-level state (locked/unlocked/cleared, best score/stars) and
  per-operation state (unlocked, current furthest level) in the meta object via
  the js/storage.js seam ONLY. Follow meta.js conventions: extend `freshMeta`,
  heal legacy saves leniently in `loadMeta`/`validMeta` (no progression wipe).

## Content — three operations (author these exactly)

Operations are defined as DATA in a table in opmap.js. Each entry specifies the
operation metadata, its ordered level array, and boss data. The table drives
everything: map rendering, briefing text, boss spawning, wave counts.

---

### OPERATION 1 — "IRON VEIL"
**Theater:** South China Sea. Zhuliang Maritime Sovereignty Force (ZMSF), a
regional state actor, launches a surprise seizure of the Daolin Island Chain —
resource-rich, strategically positioned, disputed for decades. The player pilots
for a carrier strike group scrambled to contain the incursion before ZMSF
consolidates control. Op 1 is the tutorial operation: every mission type appears
exactly once, in order of increasing intensity.

**Level spine (8 levels, one of each type + boss):**

| # | Name | Type | Narrative briefing (seed) |
|---|------|------|--------------------------|
| 1 | FIRST LIGHT | recon | Carrier group needs eyes on Daolin before committing. Fly low, stay invisible, photograph ZMSF's beach fortifications and report back. Rules of engagement: no weapons free unless fired upon. |
| 2 | OPEN SKIES | sweep | ZMSF has established a combat air patrol over the channel. Clear it. Air superiority is a precondition for everything that follows. |
| 3 | BLINDSPOT | stealth | A ZMSF radar corvette is blinding the strike package. Slip past the CAP at wave-top altitude, neutralize the radar, egress before they know you were there. |
| 4 | TRIPWIRE | intercept | Intelligence indicates a ZMSF reinforcement flight — troop transports with fighter escort — en route to Daolin. They must not land. Intercept and turn them back. |
| 5 | IRON SHIELD | defend | Coalition engineers are prepping a forward landing strip on Pulau Kecil. ZMSF is throwing everything at it. Hold the perimeter until the strip is operational. |
| 6 | LIFELINE | escort | A medical evacuation transport is extracting wounded from a downed crew on the northern reef. Escort it out of the engagement zone alive. |
| 7 | HAMMER FALL | strike | The beach fortifications photographed in Level 1 are now the target. Precision strike on ZMSF command infrastructure. Blow it apart. |
| 8 | WARLORD | boss | ZMSF's air commander — callsign WARLORD, flying a twin-engine stealth interceptor — refuses to withdraw. He's ordering a last stand. Take him down and the ZMSF operation collapses. |

**Boss:** Callsign WARLORD. Veteran ZMSF combat ace and air commander of the
seizure. Aggressive, outnumbered but not outmatched. Multi-phase: opens with
standard dogfight, second phase deploys chaff clouds + missile spam at low
altitude over the reef, final phase is a single high-speed head-on pass.

---

### OPERATION 2 — "MIDNIGHT MERIDIAN"
**Theater:** Eastern Europe, Vostok highlands. The Vostok Combined Air Defense
(VCAD) — a rogue military junta that seized control of a former Soviet republic —
has illegally deployed a nuclear-capable SAM network across the mountain ridgeline.
NATO-aligned command runs a covert deniable op to blind, penetrate, and destroy
the network before it achieves full lock-in. Winter conditions throughout. Op 2
is stealth-and-precision flavored but balanced.

**Level spine (8 levels):**

| # | Name | Type | Narrative briefing (seed) |
|---|------|------|--------------------------|
| 1 | DEAD CHANNEL | stealth | The mountain radar array is VCAD's eyes. Enter its coverage gaps, destroy the forward emitters, exit clean. Zero radio emissions; this op is deniable. |
| 2 | GHOST SIGNAL | recon | Command needs a precise map of the SAM battery positions before the strike package goes in. Fly the grid. You will be painted. Do not engage unless survival requires it. |
| 3 | COLD IRON | sweep | VCAD has scrambled interceptors to search the mountains after the radar went dark. Eliminate the patrol before it finds the exfil corridor. |
| 4 | IRON CURTAIN | intercept | A VCAD resupply convoy of air-freighters is inbound to replenish the SAM batteries. Stop it. Nothing lands. |
| 5 | LAST LINE | defend | The coalition's forward SIGINT post — the source of our SAM coordinates — is under attack. If it falls, the strike is blind. Hold it. |
| 6 | LONG REACH | strike | First SAM battery is exposed. Precision strike with laser-guided munitions through the mountain pass. Weather is closing in. |
| 7 | EXTRACTION | escort | The SIGINT team is pulling out overland. Their helo is slow and cold. Fly cover through VCAD's last CAP zone until they clear the border. |
| 8 | GLACIER | boss | Callsign GLACIER — VCAD's ghost hunter — has been hunting the player since DEAD CHANNEL. He knows every move. He's waiting at the last battery. Finish it. |

**Boss:** Callsign GLACIER. VCAD's top ace, designed their intercept doctrine.
Flies a swept-wing twin-engine heavy optimized for BVR. Multi-phase: opens at
extreme range with radar-guided salvos; second phase closes to knife-fight in the
mountain valley at low altitude in snow/weather; final phase — damaged — climbs
for altitude and makes a vertical dive attack.

---

### OPERATION 3 — "SUNFIRE HORIZON"
**Theater:** Persian Gulf. The Khalidi Expeditionary Force (KEF), backed by VCAD
remnants and their black-market tech pipeline, has constructed a carrier-killer
missile complex on a fortified peninsula. Coalition defector ace "CORSAIR" — a
former allied pilot who sold his expertise and his nation — designed and oversees
the complex. At dawn it goes live. The entire coalition carrier group is within
range. Op 3 is the hardest and most strike-heavy; it is the campaign's climax.

**Level spine (9 levels):**

| # | Name | Type | Narrative briefing (seed) |
|---|------|------|--------------------------|
| 1 | OPEN WATER | sweep | KEF picket fighters are ranging the Gulf approaches. Clear them before the strike package assembles. |
| 2 | SUNSCREEN | intercept | KEF is scrambling its alert CAP from the peninsula airstrip to protect the complex during construction completion. Intercept before they establish a defensive umbrella. |
| 3 | DEAD RECKONING | recon | Intel needs a terminal targeting solution for the complex's magazine vaults. One pass, low and fast, over the peninsula under radar horizon. Do not get shot down — you have the only sensor pod. |
| 4 | SHIELDWALL | defend | A coalition frigate is the forward targeting relay for the strike. KEF fast-attack boats + air are hitting it. Keep it alive. |
| 5 | LIFEGUARD | escort | A downed pilot is being extracted by search-and-rescue helicopter from the Gulf shallows under fire. Fly cover until they're out of range. |
| 6 | SILENT ENTRY | stealth | The outer air defense ring can't be bombed without triggering the complex's auto-launch failsafe. Slip in, disable the radar nodes by hand, and get out before the shift rotates. |
| 7 | FIRST VOLLEY | strike | Magazine vault alpha is exposed. Strike it now while GLACIER's intel feeds us a targeting window. One chance. |
| 8 | SECOND SUN | strike | Vault beta is hardened and underground. The only approach is a dive-strike through the valley corridor CORSAIR thinks is impassable. Prove him wrong. |
| 9 | CORSAIR | boss | He's waiting on the runway. He always knew it would end this way. Callsign CORSAIR — the man who handed the coalition's playbook to the enemy. Multi-phase. He fights like one of us. Because he was. |

**Boss:** Callsign CORSAIR. Former coalition ace turned KEF air commander. Flies
a fifth-generation air superiority fighter built from stolen coalition schematics.
He knows the player's tactics. Multi-phase: phase 1 mirrors the player's approach
(he counters the first few moves deliberately — scripted responses to give the
impression of adaptive AI); phase 2 loses composure, shifts to desperation
energy-fighting at low altitude; final phase — smoke trailing — goes for a ramming
approach and must be dodged before a terminal missile shot.

---

## Constraints (Skystrike hard rules — non-negotiable)
- Browser globals only, no ES modules/imports; respect index.html load order.
  Pure logic → js/core.js (require-safe, CommonJS export footer) with a test.
- All user-facing strings (briefing screen narrative, mission names, boss
  callsigns, objectives) go through t() / i18n.js with EN + ZH entries.
- localStorage only via js/storage.js (test-enforced).
- Add Node tests in tests/*.test.js for new pure logic (map progression,
  unlock/clear state transitions, wave-count scaling, snapshot/rollback).
- Keep ENDLESS mode and Daily/Boss-Rush working — the bounded "operation level"
  wave flow must be a distinct path in main.js handleWaves, not a rewrite of the
  shared endless scheduler.
- After UI changes, verify with `node scripts/shot.mjs`. Update js/CLAUDE.md
  (Architecture table + Current state) in the same commit.

## Out of scope
- Branching/optional routes (linear only).
- Reworking Endless/Daily/Boss-Rush mechanics.
- Animated cutscenes or voice acting.

## Acceptance criteria
- Operations select → linear level map renders with correct locked/unlocked/
  cleared states; boss is the final node of each operation.
- Clicking a level node opens the Mission Briefing Screen (not the game) with
  correct narrative text, objectives, enemy intel, and loadout summary. BACK
  returns to the map; PLAY launches the level.
- Launching a level plays a bounded set of waves that ends on clear; difficulty
  scales with level index per the rule above.
- Win commits upgrades + rewards and unlocks the next level; death rolls back to
  the pre-level snapshot and returns to the map; cleared levels are replayable
  and (currently) re-grant rewards.
- All three operations are authored, playable, and stored as a data table in
  opmap.js. Each boss has a unique callsign, briefing, and distinct multi-phase
  fight signature.
- Progress survives reload (persisted via storage seam); legacy saves don't wipe.
- `npm test` green; new tests cover progression + scaling + snapshot/rollback.

Plan before coding: state assumptions, list the files you'll touch
(opmap.js, missions.js, main.js, ui-tech.js, ui-flow.js, meta.js, storage.js,
i18n.js, core.js, tests/), and propose the operations/levels data shape for
review BEFORE implementing.

---

## Open assumptions (override if wrong)
- Each operation's last node is the boss level.
- DEPOT (resupply) / ELITE (elite-ace furball) special nodes fold into the level
  table as optional non-combat / elite levels rather than being deleted.
- The Mission Briefing Screen is a new UI panel rendered in ui-flow.js or
  ui-hangar.js — not a modification to the in-game HUD or modal system.
- Boss multi-phase behavior is scripted in the operations data table (phase
  descriptors) and wired to the existing boss state machine — not a new engine.
