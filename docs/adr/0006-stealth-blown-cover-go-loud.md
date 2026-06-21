# ADR-0006 — Stealth "blown cover" is a go-loud escape, not a fail

**Status:** Accepted (2026-06-21)

## Context
The v1.3 stealth mission seeded a threat field (SAM/radar/patrol **detection rings**) and a **detection meter** that rises near rings or while spotted, failing the level at 100%. Firing or killing **blows cover** (`stealthBlown`). The design intent — recorded in the CONTEXT.md glossary — was explicitly *"blown cover is **not** an instant fail."*

The implementation contradicted that intent. `detectionDelta` (core.js) carries a `blown` rise term that keeps the meter climbing at the full rise rate (0.45/s) for the entire time cover is blown, and `beingAimed` adds more. Once blown, every threat aggros and fires, so the meter races to 100% with no realistic recovery (decay is 0.18/s and only applies when *no* rise term is active). Result: blowing cover is a **de facto guaranteed fail** → `stealthFailed` → `onMissionResolved(false)` → `campaignLevelFailed` → the player is ejected to the level map as a loss. A playtester hit exactly this ("my cover was blown and the game exited me, thinking I lost the level. this should not be the case").

So the stated "not an instant fail" rule and the actual mechanics were in direct conflict, and the conflict was the single root cause behind three separate complaints: the exit-on-blown bug, "detection meter too punishing," and "blown cover clarity."

## Decision
**Blowing cover flips the sortie from stealth to a hot escape ("go loud") instead of failing it.**

- The detection meter is **pre-detection pressure only**, never a fail bar. Reaching 100% *triggers* blown cover (go loud); it does not fail the level.
- Blown cover is triggered by firing, killing, **or** the meter reaching 100%. On blow: threats aggro and chase (existing behaviour), but the meter **stops driving failure** (the `blown` rise term no longer feeds a fail condition — freeze/cap the meter once blown).
- Post-blown win condition: reach the extraction / infiltration waypoint **alive** (multi-phase stealth levels then continue to their next phase as normal hot combat).
- The **only** stealth failure is **death** (normal HP). A glimpse, a stray shot, or a kill can never instantly end the level.
- Staying unblown remains *incentivised* but not *mandatory*: the stealth/recon type-default stars (`noDamage`/`clean`) and any `flawless` unique reward a silent run, so skilled players still play it as stealth.

Chosen over two alternatives:
- **Re-hide (break-contact decay):** keep the meter live but let it decay once you leave rings / break line-of-sight, so you can go quiet again. Rejected: harder to telegraph honestly, and it keeps the meter as a fail bar that re-creates the punishing spiral if a player can't disengage.
- **Two-strikes grace:** first blow is free, a second fails. Rejected: still a meter-driven fail, still surprising when the "free" warning silently arms a hidden second-strike loss; minimal tuning change that doesn't resolve the core "blown should be survivable" intent.

## Consequences
- ➕ Fixes the exit-on-blown bug and the "too punishing" complaint at the root: blown cover is dramatic (stealth → action) instead of a death sentence.
- ➕ Glossary and code agree again (CONTEXT.md "Detection meter / Blown cover" updated to match).
- ➕ Pre-blown stealth tension is preserved (the meter still governs whether you stay silent for the star), so the fantasy survives.
- ➖ Stealth levels become *stealth-optional* — a player who doesn't care about the silent-run stars can fight straight through. Accepted: the type stars carry the stealth incentive; forcing silence is what produced the unfair fails.
- ➖ The meter still needs a pre-blown decay retune (so a brief proximity slip is recoverable before it hits 100%); this ADR sets the model, the tuning numbers are a separate balance pass.
- The pure cores change shape: `detectionDelta` / `stealthFailed` (or their callers) must stop treating the meter as the loss condition once blown — update `tests/recon-stealth.test.js` to assert "100% ⇒ blown, not failed" and "blown ⇒ not failed (only death fails)."
