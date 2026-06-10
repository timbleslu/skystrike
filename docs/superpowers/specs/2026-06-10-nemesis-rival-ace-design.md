# Nemesis Rival Ace — Design Spec

**Date:** 2026-06-10
**Status:** Approved design, pending implementation plan

> Feature 1 of 3 in the "more fun" series (1. Rival Ace → 2. Ground War (toggle-able) → 3. Operation Map). Each feature gets its own spec → plan → implementation cycle. This spec covers the rival ace only.

## Goal

A single named enemy ace persists across waves **and across runs**. He escapes when badly hurt, returns stronger with counter-traits picked against the player's observed habits, and uses an enemy version of his jet's special ability. Killing him pays out big, records him on a kill board, and generates a fresh rival. Shadow-of-Mordor's nemesis loop, in jets.

## Background (current behavior)

- Aces — `spawnAce` (main.js) creates an elite fighter via `createEnemy('fighter', …, {shapePool: aceShapePool()})`, sets `e.elite = true`, `e.callsign = 'ACE-xx'`, `e.aceName = jetNameForShape(e.shapeKey)`. Spawn chance rides the wave-start logic (`wave >= 3 && wave % 4 !== 0 && Math.random() < …`) through `pendingSpawns`.
- Ace abilities (entities.js `updateEnemy`) — desperate sprint below 30% HP (once per ace), extended-range flare evade, double gun fire close-in.
- Nameplate (ui.js ~line 340) — `★ <callsign> · <aceName>` for `e.elite`.
- Persistence — `saveSettings()`/`loadSettings()` (ui.js) already round-trip JSON through `localStorage`. No other persistent state exists.
- Banners — `showBanner(text)` (ui.js) for wave/event announcements.
- Enemy lifecycle — `killEnemy` (combat.js) and `disposeGroup` (engine.js) handle removal/GPU cleanup; `clearArena` resets between runs.
- `JETS` roster + `aceShapePool()` / `jetNameForShape()` (entities.js) — added by the plain-default-jet rework; rivals reuse both.

## Decisions (locked)

- Exactly **one rival exists at a time**, persisted in `localStorage` key `skystrike_rival`.
- Rival cadence: first appearance at **wave ≥ 5**, then **every 3rd wave**, never on boss waves (`wave % 4 === 0`).
- Escape at **HP < 20%**: he turns away, burns afterburner, pops flares, and despawns beyond 5000u. Escape ⇒ **level +1** (cap 5) and habit-profile capture.
- Player death mid-encounter does **not** level the rival — level rises only on his successful escape.
- Counter-traits: max **3**, one gained per escape, chosen by the player's **dominant habit** that run.
- Mirrored special: **4 archetypes** mapped by shape, not one per roster jet.
- Kill board (defeated rivals) renders in the **hangar**.
- Rival is a **settings toggle, ON by default** (`rivalEnabled`, persisted via `saveSettings` like `startWingman`). Toggled off: `rivalDue` always returns false (no rival spawns); persisted rival state and kill board are kept untouched and the kill board still renders. Toggle reads at wave start, so flipping it mid-run simply stops/starts future appearances.

## Design

### Component 1 — Rival state + persistence (`js/rival.js`, new file)

New script loaded between `entities.js` and `combat.js` in `index.html`.

State shape (serialized to `localStorage.skystrike_rival`):

```js
{
  name: 'VULTURE',          // generated callsign-style name
  shape: 'SU57',            // from aceShapePool()
  jetName: 'SU-57 FELON',   // via jetNameForShape
  level: 1,                 // 1..5
  traits: [],               // up to 3 trait ids
  profile: {missiles:0, gunKills:0, flares:0, wingmen:0},  // last captured habits
  encounters: 0,
  board: [ {name, jetName, level, wave} ]   // defeated rivals (kill board)
}
```

Functions: `loadRival()` (parse, validate, regenerate on corruption), `saveRival()`, `genRival()` (fresh identity, level 1), `rivalDefeated(wave)` (push to board, payout, regenerate), `rivalEscaped(profile)` (level +1 cap 5, pick trait, save).

Name generation: small dedicated pool of menacing callsigns (distinct from `genCallsign('ACE')` output so rivals never collide with regular ace names).

### Component 2 — Spawn cadence + wave hook (main.js)

Pure helper `rivalDue(wave, lastRivalWave)` → bool, implementing: `wave >= 5`, `wave % 4 !== 0`, at least 3 waves since last appearance. `lastRivalWave` is run-scoped (lives on `run`, resets each run; 0 = not yet appeared). Wave-start logic queues `pendingSpawns.push(spawnRival)` when due and records the wave.

`spawnRival()` builds on `spawnAce`'s pattern: `createEnemy('fighter', …, {shapePool:[rival.shape]})`, then sets `e.rival = true`, `e.elite = true`, `e.callsign = rival.name`, `e.aceName = rival.jetName`, HP `= aceHP * 1.3^(level-1)`, applies trait modifiers, intro banner `☠ RIVAL ON STATION — <NAME> · Lv<N>`.

### Component 3 — Escape state machine (entities.js `updateEnemy`)

Rival branch on top of the existing elite path:

- **engage** (default): existing ace behaviors + mirrored special on cooldown.
- **flee** (HP < 20%, once): target point directly away from player, speed override (sprint-style), flares on lock, ignore attack logic. Beyond 5000u from player → remove via the normal removal path (disposeGroup), call `rivalEscaped(currentProfile)`, banner `<NAME> WITHDRAWS`.
- Killed in either state → `rivalDefeated(wave)`: RP payout `150 + 100×level` to `player.tp`, banner, normal kill path.

### Component 4 — Habit tracking + counter-traits

Per-run counters incremented at existing call sites: player missile fire (combat.js `fireMissile`), player gun kill (`killEnemy` where `byPlayer && weapon === gun`), flare use, wingman head-count at wave start. Stored on `run` (already reset per run).

Trait table (data-driven, in rival.js):

| id | Trigger habit | Effect on rival |
|----|---------------|-----------------|
| `FLARE_WALL` | missiles dominant | flares ×2, evade trigger range +50% |
| `SCISSORS` | gun kills dominant | turn rate +25%, jink impulse when player tracers pass close |
| `HEADHUNTER` | wingmen ≥ 2 | prefers wingman targets, +50% damage vs wingmen |
| `VETERAN` | no dominant habit | +20% HP, +10% turn rate |

`pickTrait(profile, owned)` = pure function: dominant habit → first un-owned matching trait, falls back to `VETERAN`. Max 3 traits.

### Component 5 — Mirrored special (4 archetypes)

`rivalSpecialFor(shape)` maps the rival's jet to one archetype; fired on a ~12s cooldown during engage, telegraphed by a 0.5s accent-color glow + sound:

- **OVERDRIVE** (F22/EFT/FA18/TEJAS/RAFALE…): 4s speed + gun damage burst.
- **VOLLEY** (J20/J35…): 3-missile salvo with staggered launch.
- **DECOY** (NGAD/F47…): spawns 2 short-lived non-damaging decoy meshes that draw missile locks (reuse flare-style distraction on player missiles).
- **GHOST** (J50/SU57/SU75…): drops radar marker + breaks player lock for 3s (HUD marker hidden).

Exact shape→archetype table finalized in the plan; every `aceShapePool()` shape must map to exactly one.

### Component 6 — UI (ui.js, index.html, styles.css)

- Nameplate: rivals render `☠ <NAME> · <JET> · Lv<N>` in a distinct color (red-orange) instead of the gold elite plate.
- Banners: intro / withdraw / kill via `showBanner`.
- Kill board: a compact hangar panel listing defeated rivals (`name — jet — Lv — wave`), capped at last 10. Empty state: "NO RIVALS DOWNED".
- Special telegraph: brief emissive glow on the rival mesh + `audio.power()`.

## Data flow summary

```
run start            → loadRival() (generate if none)
wave start           → rivalDue(...) ? pendingSpawns.push(spawnRival)
in flight            → habit counters accumulate on run.*
rival HP < 20%       → flee state → despawn >5000u → rivalEscaped(profile): level+1, +trait, save
rival killed         → rivalDefeated(wave): payout, kill board, genRival(), save
player dies          → rival state unchanged (no level change)
hangar               → kill board renders from rival.board
```

## Testing

Mirror-style node tests (`tests/rival.test.js`), production copies byte-identical where pure:

- `rivalDue` cadence: first ≥5, every 3rd, boss-wave skip.
- `pickTrait`: each dominant habit → expected trait; max-3 cap; VETERAN fallback; no duplicates.
- Escalation math: HP multiplier per level, level cap at 5.
- Persistence round-trip: `genRival` → serialize → parse → validate; corrupted JSON → fresh rival.
- Payout formula per level.

Manual: rival intro banner appears wave 5+; escapes at low HP with banner; returns 3 waves later at Lv2 with a trait matching prior playstyle; special telegraphs visibly; kill board lists a defeated rival in hangar.

## Out of scope

- Ground war and operation map (features 2 and 3, own specs).
- Multiple simultaneous rivals, rival factions, rival dialogue/voice.
- Cross-feature hooks (rival appearing in operation-map sectors) — designed in feature 3's spec.
- Regular ace behavior changes — aces spawn and fight exactly as today, independent of the rival.

## Risks

- **updateEnemy complexity** — the rival branch adds a state machine to an already busy function; keep flee logic in a small dedicated helper (`updateRivalFlee(e, dt)`) called from the rival branch.
- **Removal-path consistency** — flee-despawn must go through the same disposal path as kills (GPU cleanup, wave-clear accounting: a fled rival must not block wave completion; verify the wave-clear check counts him correctly either way).
- **localStorage schema drift** — version field not needed yet, but `loadRival()` must validate every field and regenerate on any mismatch rather than crash.
- **Lock-breaking GHOST special** — touches HUD marker + player missile guidance; scope it to lock display + new lock acquisition, never retroactively un-guiding missiles already in flight.
