# Skystrike — Level Authoring Guide

The campaign is DATA: `const OPERATIONS` in `js/opmap.js` (4 operations × 8/8/9/8 levels). A level is a
scripted sequence of 2–3 **beats** (`objectives` phases). You can add or retune a level without touching
engine code: edit the row, add its strings, run the campaign gate.

## Workflow (add / change a level)
1. Edit the level row in `js/opmap.js` (schema below). **Never renumber or rename `id`s** — saves key on them.
2. Add strings with the CLI, all three languages in one call (no need to open `js/lang/*.js`):
   `node scripts/i18n.mjs set comms.xx.1 --en "…" --zh "…" --ko "…"`
3. `node scripts/verify-campaign.mjs <opId>:<levelIndex>` — the bot must COMPLETE it. ESCORT/DEFEND levels
   also: `… <opId>:<idx> passive` must FAIL (raiders have to be a real threat).
4. `npm test` (level-table invariants + every radio line resolves ×3 languages + i18n parity).
5. Visual check if you changed screens/HUD: `node scripts/shot-campaign.mjs <label>`.

## Level row
```js
{ id: 'lifeline', coords: { x: 80, y: 30 },           // map position in % of the operation chart
  nameKey: 'op.ironVeil.l6.name', type: 'ESCORT',      // headline type → map icon + 2 default stars
  loreKey, objectivesKey, enemyIntelKey,               // briefing text keys ('op.<op>.l<N>.lore|obj|intel')
  starUnique: { type: 'noDamage' },                    // 3rd star (see Stars)
  waves: 1,                                            // always 1 — the beats ARE the level
  spawn: { fighters, aces, bombers, ground, weather: 'clear'|'fog'|'storm', tod: 0|1|2, hostileAce },
                                                       // weather/tod apply to the level; budget is legacy (tests read it)
  objectives: [ beat, beat, … ],
  isBoss: true, boss: { … } }                          // FINAL levels only
```
Briefing SITUATION text is `op.<op>.l<N>.blurb` (derived from `nameKey`; 1–2 paragraphs, `\n\n` breaks).

## Beats (`objectives[]`)
| field | applies to | meaning |
|---|---|---|
| `type` | all | `RECON` `STEALTH` `STRIKE` `SWEEP` `INTERCEPT` `ESCORT` `DEFEND` `BOSS` |
| `spawn` | all | beat budget `{fighters, aces, hostileAce, bombers, drones}` — SWEEP must kill all of it |
| `say` | all | radio on beat start: `[['ovl','ll.1'], …]` → key `comms.ll.1` |
| `events` | all | timed beats `[{ at: 24, spawn?, say?, raid? }]` (seconds since the beat started) |
| `wp` | RECON | number of waypoints (default 4) |
| `timer` | RECON / INTERCEPT / STRIKE | clock in seconds (STRIKE becomes timed) |
| `site` | STRIKE | ground target size: `'outpost'` (small) · default · `'fortified'` |
| `hold` | DEFEND | seconds to survive |
| `asset` | DEFEND | `'outpost'` (land) or `'ship'` (sea) |
| `escort` | ESCORT | `'truck'` (ground convoy) or `'transport'` (escorted aircraft) |
| `convoy` / `required` | ESCORT | units in the convoy / deliveries needed (default convoy−1; a lone transport must survive) |
| `label` | ESCORT / DEFEND | ally callsign key `ally.name.<label>` |
| `raid` | any | escort/defend budgets attack the allies unless `raid: false`; other beats only with `raid: true` |

Speakers: `ovl` OVERLORD (AWACS) · `hq` command · `wing` your wingman · `ally` the unit you protect ·
`enemy` intercepted chatter · `boss` the operation's ace. `{cs}` in a line = the pilot's callsign.

## Boss (FINAL levels)
Open with an approach fight (a SWEEP beat), then `{ type: 'BOSS' }` spawns the named ace.
```js
boss: { callsignKey: 'boss.warlord', introKey: 'comms.wl.boss', phases: [   // exactly 3 (HP 100/60/30%)
  { descKey, turnMul: 1.0, fireMul: 1.0, extraMissiles: 0 },
  { descKey, fireMul: 1.3, extraMissiles: 2, weather: 'storm', flags: ['chaff'], say: 'wl.p2' },
  { descKey, turnMul: 1.4, pattern: 'headOn', say: 'wl.p3' } ] }
```
`pattern`: `standoff` · `headOn` · `dive`. `flags`: `chaff` · `mirror`. `say` = taunt key on entering the phase.

## Stars
Each level scores 3 stars: 2 defaults from its `type` + its `starUnique`.
Defaults — FURBALL kills+noDamage · SWEEP kills+clean · INTERCEPT kills+accuracy≥55 · STRIKE objective+accuracy≥50 ·
RECON objective+clean · STEALTH objective+noDamage · ESCORT/DEFEND objective+alliesIntact · FINAL noDamage+objective.
`starUnique` types: `noDamage` `flawless` `gunOnly` `noFlares` `alliesIntact` `accuracy{n}` `fastClear{n seconds}` `killsN{n}` `kills` `clean` `objective`.
Keep `fastClear` generous: the bot clears in 15–100 s of sim time; humans take roughly 3–4× that.

## Pacing guidelines
- 2–3 beats, each changing what the player does (e.g. RECON → STRIKE → SWEEP); add an `events` wave mid-beat.
- At most one navigation-only level (RECON/STEALTH headline) per operation (`node scripts/audit-flyto.mjs`).
- Every beat should have at least one radio line; boss phases 2 and 3 get a taunt.
