# Feature ideas: Comparable-game analysis + existing improvements

Status: idea list, not yet designed or scoped.
Source: brainstorm session 2026-06-14.

Current state for context (as of this session):
- Meta-progression (SP, jet unlocks, skins, achievements) — complete
- 5 mission types (sweep/intercept/escort/defend/strike) — complete
- Weather + TOD gameplay — complete
- Tech tree v2 — complete
- Combat content (burn DoT, EMP, frenzy, escort PD, wingman commands) — complete
- Controls redesign (auto-steer joystick, motion redo, HTTPS dev server) — complete
- Rival/nemesis system — complete

---

## A) From Ace Combat / Blazing Angels

**Multi-phase bosses**
Boss HP crosses a threshold → enters phase 2 with new attack patterns (faster, new specials, visual cue like afterburner ignition or armor shed). Phase 3 optional. Architecture already exists in combat.js; mostly a state machine addition.
Priority: HIGH. Effort: medium.

**Mission grading (S/A/B/C)**
At mission/run end, grade the player on: kill %, time, damage taken, objectives completed. Feeds a SP bonus multiplier. Surfaces on the end-screen. Ties cleanly into the existing `run` stats object.
Priority: HIGH. Effort: low-medium.

**Named ace squadrons per op-map sector**
Beyond the single nemesis, each sector type spawns a named hostile ace on the final wave (distinct callsign, slightly tuned stats, appears in a "hostile ace inbound" banner). Builds a gallery of recurring antagonists separate from the nemesis escalation.
Priority: MEDIUM. Effort: medium.

**AWACS support calls**
Spend RP mid-flight to call in one of: orbital strike (kills nearest enemy), emergency resupply (restores guns/flares/missiles), or jamming (blinds enemy missiles for 8s). Limited uses per sector. Adds a tactical resource layer without disrupting core combat.
Priority: MEDIUM. Effort: medium.

---

## B) From Sky Force / Raiden

**Star objectives per run**
1–3 stars per run based on secondary objectives: "kill X% of enemies", "survive without taking damage for one wave", "rescue all pilots". Stars tracked persistently per-jet, feed a separate unlock track or cosmetic reward.
Priority: HIGH. Effort: medium.

**Boss rush mode**
Unlockable mode (clear the campaign once) — all bosses in sequence with a fixed loadout and one life. No tech tree. Leaderboard by total time. Tests mastery.
Priority: LOW. Effort: medium (needs boss pool to be interesting; better after multi-phase bosses land).

---

## C) From After Burner / Star Fox

**Scripted set-piece events**
Specific op-map nodes trigger authored encounters instead of procedural waves: fly through a carrier group, outrun a surface-to-air barrage corridor, escort a bomber through SAM lanes. One or two per campaign keeps them special.
Priority: MEDIUM. Effort: high (significant authored content per event).

**Barrel-roll / evasive maneuver**
Double-tap roll input → brief (~0.4s) invincibility window + dramatic roll animation. Cooldown ~6s. Fits the spectacle feel; gives mobile players a panic button.
Priority: LOW-MEDIUM. Effort: low.

---

## D) From mobile roguelites / daily-challenge games

**Daily seeded challenge**
Fixed seed derived from the calendar date. One attempt per day. Scores saved locally (or optionally to a simple leaderboard). No server required — seed determines enemy layout, weather, jet restrictions. High replay value, costs nothing architecturally.
Priority: MEDIUM. Effort: medium.

**Pilot callsign + emblem**
User enters a short callsign (≤8 chars) displayed in the HUD debrief and hangar. Emblem is chosen from a set of unlockable patches. Pure cosmetic, zero gameplay impact. Social / personalization hook.
Priority: LOW. Effort: low.

---

## E) Improvements to existing systems

**Screen shake + camera kick** ★ QUICK WIN
On missile hit, player damage, kill, and boss phase transition: brief camera offset/shake. Currently missing entirely. Massive feel improvement. ~20 lines in combat.js / engine.js.
Priority: HIGH. Effort: very low.

**Afterburner HUD indicator** ★ QUICK WIN
Throttle bar exists but no "AB ACTIVE" state. When throttle > 0.85, show a flame icon or amber "AB" label next to the throttle readout. Communicates the speed/damage bonus visually.
Priority: MEDIUM. Effort: very low.

**Tutorial / first-run polish**
Existing onboarding is text-only. A guided first wave — "press W to pitch", arrow pointing at throttle bar — would cut new-player confusion significantly. Especially important for mobile where controls are non-obvious.
Priority: HIGH (for new-player retention). Effort: medium.

**Mobile performance pass**
Shadow map resolution reduction, draw-distance culling for distant enemies, LOD on inactive jets. Targets mid-range phones running at <30fps currently.
Priority: HIGH (if targeting mobile). Effort: medium.

**Sound variety**
Gun audio is a single looping sound. Additions: missile lock acquisition tone (rising beep → solid tone), distinct kill sound (crunch + fading engine), per-jet engine roar differentiation (F-22 twin whine vs SU-57 throatier). Requires audio assets.
Priority: MEDIUM. Effort: medium (depends on asset availability).

**Multi-phase bosses** (also listed under A above)
Architecturally most impactful of the lot. Even just two phases (transition at 50% HP) with a visual cue and a second attack pattern makes the boss fight feel like a real encounter.

---

## Suggested sequencing

| Priority | Feature | Effort | Dependency |
|---|---|---|---|
| 1 | Screen shake + camera kick | Very low | None |
| 2 | Mission grading (S/A/B/C) | Low-med | None |
| 3 | Afterburner HUD indicator | Very low | None |
| 4 | Multi-phase bosses | Medium | None |
| 5 | Tutorial / first-run polish | Medium | None |
| 6 | Star objectives per run | Medium | None |
| 7 | Daily seeded challenge | Medium | None |
| 8 | Named ace squadrons | Medium | None |
| 9 | Barrel-roll evasive maneuver | Low | None |
| 10 | AWACS support calls | Medium | None |
| 11 | Mobile performance pass | Medium | None |
| 12 | Sound variety | Medium | Audio assets |
| 13 | Pilot callsign + emblem | Low | None |
| 14 | Scripted set-piece events | High | Boss variety helps |
| 15 | Boss rush mode | Medium | Multi-phase bosses |
