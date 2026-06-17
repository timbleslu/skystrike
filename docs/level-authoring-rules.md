# Skystrike — Level Authoring Rules

Skystrike's campaign is authored as a **data table**, not code: `const OPERATIONS` in
[`js/opmap.js`](../js/opmap.js). It holds three fixed operations — **IRON VEIL**, **MIDNIGHT
MERIDIAN**, **SUNFIRE HORIZON** — and each operation is a linear list of hand-authored level
rows. Every level row carries a `type` field drawn from:

| `type` | Category | Player experience |
|--------|----------|-------------------|
| `RECON` | fly-to-box (navigation) | fly through N waypoints — **no kill requirement** |
| `STEALTH` | fly-to-box (navigation) | reach the extraction zone undetected — **no kill requirement** |
| `FURBALL` | combat objective | open dogfight |
| `INTERCEPT` | combat objective | hunt and down inbound targets |
| `DEFEND` | combat objective | hold a position / asset under attack |
| `ESCORT` | combat objective | keep a friendly alive through hostiles |
| `STRIKE` | combat objective | destroy ground/strategic targets |
| `FINAL` | combat objective (boss) | 3-phase boss (`isBoss: true`) |

`RECON` and `STEALTH` are the **"fly-to-box"** wave types: they have no kill requirement and
feel like flying to a marker rather than fighting. The rule below governs how many of them an
operation may contain. It is binding on anyone — human or agent — who edits the `OPERATIONS`
table or adds a new operation.

---

## RULE: At most one fly-to-box (navigation) wave per operation

Treat `RECON` and `STEALTH` **together** as the single **"fly-to-box"** category for the purpose
of this cap.

- **CAP — at most one.** A level/operation may contain **AT MOST ONE** fly-to-box wave — i.e. at
  most one `RECON` **or** one `STEALTH` level per operation, counted together against a single
  budget of one. Two `RECON`, two `STEALTH`, or one of each in the same operation all violate the
  cap.
- **DEFAULT — prefer zero.** The default preference is **ZERO** fly-to-box waves. Include one only
  when it earns its place narratively — a recon opener that establishes the theater, or a stealth
  infiltration that sets up the operation's climax. If it isn't pulling narrative weight, cut it
  and make the level a combat objective instead.
- **NEVER let it dominate.** **NEVER** author an operation where fly-to-box is the **only** or the
  **dominant** wave type. Combat-objective levels (`FURBALL` / `INTERCEPT` / `STRIKE` / `DEFEND` /
  `ESCORT` / `FINAL`) must **dominate every operation** — they are the overwhelming majority of the
  level list, and the operation must read as a combat campaign with at most a single navigation
  beat.

### Why (rationale)

Fly-to-box waves are **low-intensity pacing beats**. One, placed deliberately, gives the player a
breath and a moment of mood/story before the next fight — that is its entire job. But back-to-back
or majority navigation waves **drain the arcade combat fantasy**: Skystrike is a jet-*combat* game,
and a player who spends a chunk of an operation flying to markers without firing is no longer
playing the game they came for. Keeping fly-to-box to at most one beat per operation guarantees
the combat fantasy stays in the foreground and every operation earns its "arcade jet combat" label.

### Authoring checklist (apply to every operation before committing a level change)

- [ ] Count the `RECON` + `STEALTH` rows in this operation. The total is **0 or 1**. Never 2+.
- [ ] If the count is 1, the fly-to-box level has a clear narrative reason to exist (recon opener
      or stealth infiltration). If it doesn't, convert it to a combat objective.
- [ ] Combat-objective levels are the clear majority of the operation's level list.
- [ ] Two fly-to-box beats are never adjacent or near-adjacent in the level sequence (a single
      navigation beat should be isolated, not clustered with another low-intensity beat).

### Observed state (2026-06-17) — needs a balance pass

This rule is **not yet satisfied** by the current `OPERATIONS` table. Every operation currently
ships **two** fly-to-box waves (one `RECON` + one `STEALTH`), which exceeds the cap of one:

- **IRON VEIL** — `firstLight` (RECON) + `blindspot` (STEALTH) — sequence opens
  `RECON > FURBALL > STEALTH > …`, clustering two low-intensity beats in the first three levels.
- **MIDNIGHT MERIDIAN** — `deadChannel` (STEALTH) + `ghostSignal` (RECON) — sequence opens
  `STEALTH > RECON > …`, two navigation beats **back-to-back** at the very start.
- **SUNFIRE HORIZON** — `deadReckoning` (RECON) + `silentEntry` (STEALTH).

A future balance pass should bring each operation down to **at most one** fly-to-box wave
(preferring zero where the beat isn't earning its narrative place), per the rule above. This doc
records the target; no `.js` change is made here.
