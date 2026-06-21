# ADR-0005 — Campaign player persists; arena + sortie reset per flight behind a loading curtain

**Status:** Accepted

## Context
In the Operations campaign ONE player object persists across an operation's levels so RP / tech / economy accumulate (the checkpoint economy in [the campaign revamp](../../CLAUDE.md)). `enterOperationRun` builds the player once; `clearCampaignArena` tears down enemies/projectiles between levels but deliberately KEEPS the player.

That persistence leaked into the *flight feel*. Because `createPlayer` only ran on the first level, every subsequent level started with the jet wherever the last mission ended, the previous level's weather/TOD still applied (the new level's `spawn.weather`/`spawn.tod` weren't applied until `nextWave`, ~1.4s after `state='playing'`), and ability cooldowns (special slots, AWACS, barrel-roll) carried over. Players saw "a few seconds of the previous mission" and started new sorties mid-cooldown.

## Decision
Keep the persistent player (it owns the economy), but make every flight a **clean sortie** with a full reset applied BEFORE the first rendered frame, hidden by a loading curtain:

- **`freshSortie(player)`** (ui-flow.js) — runway respawn (position/orientation/velocity/throttle mirror `createPlayer`), all ability timers → ready (`special.cd`/`special2.cd`/AWACS/barrel-roll), buff/debuff timers cleared, consumables refilled, `stealthBlown` cleared.
- **`resetArenaForLevel(lvl)`** (ui-flow.js) — `clearCampaignArena` + apply THIS level's `spawn.weather`/`spawn.tod` now (idempotent with `nextWave`'s later re-apply) + rebuild ground scatter + `freshSortie`.
- **Loading curtain** (`#loadingScreen`, `showLoading`/`hideLoading` in ui-hud.js) — an opaque overlay raised in `launchLevel` before the swap and faded out once the new arena is built + live, so no stale-mission frame is ever painted.

The player object itself, its tech tree, and `player.tp`/score are NOT rebuilt — only the sortie state.

## Consequences
- ➕ Each flight feels like a fresh start; specials are available at level start; no stale terrain/weather flash.
- ➕ The checkpoint economy (RP/tech across an operation) is untouched — only transient sortie state resets.
- ➖ A future contributor "fixing" the persisted player by rebuilding it per level (e.g. calling `createPlayer` in `launchLevel`) would silently wipe accumulated RP/tech and break the economy. This ADR is the warning: reset sortie state, never the player.
- Endless/Daily/Boss-Rush are unaffected — they already rebuild the player via `createPlayer` each run.
