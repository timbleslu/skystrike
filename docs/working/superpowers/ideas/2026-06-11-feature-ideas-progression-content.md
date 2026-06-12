# Feature ideas: Meta-progression/customization & Mission variety

Status: idea list for future brainstorming/spec, not yet designed or scoped.
Source: brainstorm session 2026-06-11, comparing Skystrike vs Ace Combat / War Thunder / Sky Force.

Current state for context:
- "score" is the only currency, spent on the tech tree, resets every run (js/globals.js TECH_NODES).
- 11 jets (JETS array), all available from run start, no unlock gating.
- Boss enemies already exist (TP.boss = 380, run.boss counter).
- Rival ace (nemesis) and op map progress already persist across runs via js/rival.js / js/storage.js.

## A) Meta-progression + customization (foundational)

Persistent currency across runs, separate from per-run tech score.
- e.g. "SP" (Squadron Points) earned per run based on score/kills/mission grade
- Stored via js/storage.js seam

Unlocks / progression
- Jet unlock gating: start with a handful, unlock rest of JETS roster with SP
- Pilot rank/level from cumulative XP (cosmetic milestone, maybe small perks)
- Achievements/medals tied to specific feats (first boss kill, no-damage run, etc.), persisted

Customization
- Jet skins/liveries — unlockable via SP or achievements, applied in hangar/wing picker
- Pilot callsign + emblem/patch, shown in HUD/hangar
- Loadout presets — save/recall tech-tree build per jet (if tech state becomes per-jet rather than per-run only)

Stats / meta UI
- Persistent best-run stats / local high score table
- Hangar screen additions for skins, callsign, emblem, unlock progress

Dependencies: needs a persistent currency + save schema first; skins/unlocks/loadout presets build on top of that.

## B) Mission variety / content (independent of A)

New boss types
- Multiple boss variants with distinct attack patterns/phases beyond current single boss

New objective types (beyond current wave survival / ground war)
- Escort: protect a friendly bomber/convoy from spawn to exit
- Defend/hold: timed defense of a fixed zone against escalating waves
- Strike: destroy a set of ground targets within a time limit
- Recon/stealth: avoid detection for a duration (ties into existing stealth ability on F-35?)

Environmental variety
- Weather/time-of-day variants affecting visibility/lighting (engine.js terrain/scene)
- Could pair with op map sectors as modifiers

Special weapons
- Per-jet "SP weapon" — note: several jets already have unique abilities (e.g. F-35 STEALTH FIELD, others in JETS). Decide whether to extend this system or add a separate limited-use super weapon.

Replayability
- Daily/seeded challenge mission with fixed modifiers + local leaderboard entry
- Multi-phase boss fights (different attack pattern per HP threshold)

Dependencies: none on (A); can be built independently. Some objective types may want op map integration (js/opmap.js) for selection.

## Suggested sequencing
1. (A) persistent currency + save schema — foundation, lowest risk, unlocks everything else in A
2. (A) jet skins/callsign/emblem — visible payoff, moderate UI work
3. (B) new objective types (escort/defend/strike) — content, no economy dependency, can run in parallel with A once started
4. (A) jet unlock gating + achievements — depends on currency existing
5. (B) boss variants + multi-phase bosses
6. (B) daily challenge + leaderboard — likely last, depends on stable scoring across the variety added in B
