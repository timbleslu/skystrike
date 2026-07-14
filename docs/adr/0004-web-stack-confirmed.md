# ADR-0004 — Web stack confirmed (HTML + Three.js + CSS); the constraint is architecture, not the renderer

**Status:** Accepted

## Context
The question was raised whether HTML + Three.js + CSS is the right way to run Skystrike, or whether the project should move to a native/game-engine stack (Unity, Godot, etc.) to avoid a future "functionality ceiling."

The project's actual goals were clarified:
1. **Show it off easily to friends** ("look how cool this is") — the primary goal.
2. **A format that won't limit functionality** — the stated fear.
3. **Fun to build.**

Explicitly **not** goals: App Store publication, employer portfolio, monetization. This removes the "native performance / store compliance" pressure that would normally argue for a game engine.

Four specific ceiling-fears were named: fancier graphics, multiplayer/online, more complex systems, and a general "web is a toy" vibe.

## Decision
**Keep HTML + Three.js + CSS. Do not migrate to a native engine.**

Rationale, fear by fear:
- **Fancier graphics** — not a stack limit. Three.js (WebGL2, with a WebGPU renderer path available for later) is used at a fraction of its capability here. The first ceiling a solo + AI shop hits is **art-asset production**, which no engine removes. Staying on Three.js keeps the WebGPU upgrade as a renderer swap, not a rewrite.
- **Multiplayer/online** — orthogonal to the renderer, and the web is the *easiest* platform for it (WebSockets / WebRTC / Colyseus / PartyKit). What fights multiplayer is the global mutable state in `globals.js`, i.e. **architecture** (see ADR-0003), not the stack.
- **More complex systems** — the one real ceiling, and it is [ADR-0001](./0001-no-build-globals-script-tags.md) (no build, no ES modules, ~13k LOC of load-order globals), **not** Three.js/HTML/CSS. Fixable in-stack via a bundler + ES modules (ADR-0003). Switching engines to fix code organization would discard ~13k working lines to solve a problem a bundler solves.
- **"Web is a toy"** — false, and counter to goal #1: a URL is the best distribution channel there is for "let my friends try it." The web stack is the *optimal* choice for showing off, not a compromise.

The fears therefore collapse onto two separable levers, neither of which is "change the stack":
- **Lever A — Distribution.** Deploy to a public URL. **Already satisfied** (Vercel zero-config static deploy from the repo; HTTPS makes DeviceOrientation motion controls work on phones).
- **Lever B — Architecture.** The staged ESM + `GameState` migration of [ADR-0003](./0003-staged-esm-gamestate-migration.md). This is what "won't limit functionality" actually means for goals #2/#3, and it is the on-ramp to multiplayer.

## Consequences
- The standing hard rule "Three.js is vendored; web stack; no engine migration" is reaffirmed.
- The live question for the project is no longer *which stack* but *when to invest in Lever B*. With iOS shipping off the table, the production-regression risk that justified deferring ADR-0003 is weaker (a bad web deploy is trivially reverted) — see the ADR-0003 status update.
