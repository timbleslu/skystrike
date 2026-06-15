# SKYSTRIKE // ACE PROTOCOL — UX Findings (Behavior Audit)

**Author:** UX Researcher · **Date:** 2026-06-15 · **Branch:** `aesthetic-overhaul`
**Scope:** Behavioral friction — confusion, drop-off, cognitive overload, discoverability. NOT visual styling (handed to UI Designer as fix targets).
**Method:** Read of full DOM (`index.html`, 446 lines), `CLAUDE.md` architecture map, `js/i18n.js` strings, `js/core.js` `TUTORIAL_STEPS`, `js/ui.js` flow glue, `js/globals.js` defaults, and headless screenshots (`ux-look-*.png`).

**Headless-capture caveat that is itself a finding:** all four `ux-look-*.png` frames — including the one named `-hangar` — render the **langSelect** screen. The game hard-gates everything behind a language toggle that has zero "what is this game" framing. The screenshotter cannot reach the hangar or HUD because they only render after a player picks a language and clears onboarding. A brand-new player's literal first frame is a bilingual toggle on a near-black field. (See UX-01.)

---

## 1. Onboarding Flow Map (literal first-run sequence)

| # | Screen (DOM id) | What the player sees | Friction / confusion point |
|---|---|---|---|
| 0 | `#langSelect` (L391–401) | "SKYSTRIKE" + `SELECT LANGUAGE` + two buttons: `English 🇬🇧` / `简体中文 🇨🇳` | **No game framing at all.** No tagline, no "arcade jet combat," no screenshot. First decision a player makes is a chore (language), not an invitation. Nothing communicates what they're about to play. |
| 1 | `#onboard` (L403–416) | Header `CONTROLS` / `// PRE-FLIGHT BRIEF //`; three dense cards FLIGHT / COMBAT / VIEW, each a run-on keybind string; two note lines; `▶ START TUTORIAL` | **Wall of keybinds before any play.** `onboard.flightKeys` = "W/S pitch · Q/E roll · A/D yaw · SHIFT/CTRL throttle/brake · CTRL+S high-G turn" — 5 bindings on one line, ×3 cards = ~15 keys dumped cold. A new player cannot retain this; it's reference material masquerading as onboarding. On mobile it's worse — the keys don't apply, and the only mobile note is one passive line (`onboard.touch`: "Touchscreen controls auto-detect…"). |
| 2 | `#tutorial` (L419–426) | Non-blocking HUD overlay over a live first wave. `#tutStep` "1/4", `#tutText`, `#tutSkip`. 4 gated steps: **pitch → throttle → guns → missile** (`TUTORIAL_STEPS`, core.js). | **The good part of the funnel — but it disagrees with step 1.** Tutorial teaches by doing (gated on the player's own action), which is correct. But: (a) it's only 4 steps and never teaches **lock** as its own beat (missile step bundles "press F to lock, then G"), **flares/defense**, **camera**, or **throttle-as-survival**; (b) the pitch copy contradicts the onboard card — `tut.pitch` in master = "press **W** to pitch your nose up" while the onboard card lists "W/S pitch" with no nose-up/down disambiguation, and a sibling worktree string says "press **S**." A new player who just read "W/S pitch" now gets a single-key instruction with no indication which way is up. |
| 3 | `#hangar` (L89–155) | Title; STRATEGIC POINTS; pilot panel (callsign + emblem grid); DIFFICULTY (Rookie/Veteran/Ace); ENVIRONMENT (Day/Dusk/Night); MODE (Endless/Operation); jet carousel; RIVAL KILL BOARD; **5 buttons**: LAUNCH MISSION, DAILY CHALLENGE, BOSS RUSH (disabled), COMMAND & PROGRESSION, CONTROLS & MANUAL | **Choice overload on the home screen** (see UX-02). A player who just finished a 4-step tutorial lands on ~7 distinct decision clusters and 5 CTAs with no guided "now do this." Default difficulty is **VETERAN** ("the intended challenge"), not Rookie — a just-trained player is dropped into intended difficulty by default. |

**Net first-60-seconds verdict:** the *tutorial* (step 2) is well-designed (action-gated, contextual). It is sandwiched between a contentless gate (step 0) and a keybind data-dump (step 1), then dumps the player into an overloaded hangar (step 3). The flow front-loads reference and back-loads guidance.

---

## 2. Findings (prioritized)

### P0 — Fix first (block comprehension / cause drop-off)

**UX-01 · First screen sells nothing & teaches nothing**
- **Problem (behavioral):** Player's first frame is a language toggle on black. No idea what the game is, no hook, no momentum. The "decision" is a tax, not an invitation.
- **Where:** `#langSelect` `index.html:391–401`; strings `lang.title`/`lang.sub` (i18n.js).
- **Why it hurts:** Highest-drop-off moment in any product is the first screen. Zero framing = zero reason to commit the next 5 minutes. Bilingual buttons already imply language; the screen wastes its one chance to say "you fly a jet and shoot things."
- **Fix target (UI Designer):** Behind the language buttons, add a one-line value prop + a looping/hero visual of a jet in combat (reuse an existing flight render or the live 3D scene that's already booting underneath). Keep language as a small two-button row, not the headline. The headline should be the game, not "SELECT LANGUAGE."

**UX-02 · Hangar is a 7-cluster, 5-CTA decision wall with no primary path**
- **Problem (behavioral):** A new player who finished the tutorial faces, simultaneously: callsign entry, emblem picker, difficulty, environment, mode, jet carousel, rival board, and 5 bottom buttons. Nothing says "press this to play." Five buttons compete for the same visual weight (`LAUNCH` is a solid button; the other four are `ghostbtn`, but they sit in one row and read as equals).
- **Where:** `#hangar` `index.html:89–155`; build in `js/ui.js:527` (`buildHangar`); buttons L140–146.
- **Why it hurts:** Decision paralysis + diluted primary action. Callsign/emblem/difficulty/environment/mode are all *optional refinements* of a launch, but they're presented as prerequisites stacked *above* the launch button.
- **Fix target:** Establish one unmistakable primary CTA (`▶ LAUNCH MISSION`) and demote the rest. Collapse the optional config (callsign, emblem, difficulty, environment, mode) into a single "loadout" strip or a one-tap "QUICK LAUNCH (Veteran · Day · Endless)" default with an "Adjust" affordance. Move COMMAND & PROGRESSION, CONTROLS & MANUAL, DAILY, BOSS RUSH into a secondary tier (smaller, grouped, visually subordinate to LAUNCH).

**UX-03 · Onboarding step 1 is a keybind data-dump, not onboarding**
- **Problem (behavioral):** Player must read ~15 keybindings on three dense cards before any interaction. None is retained. On touch the cards are mostly irrelevant.
- **Where:** `#onboard` `index.html:403–415`; strings `onboard.flightKeys`/`combatKeys`/`viewKeys`/`touch`/`more` (i18n.js).
- **Why it hurts:** Cognitive overload at the worst time; violates "teach in context." The action-gated `#tutorial` already teaches the essential 4 verbs far better — the onboard screen duplicates and pre-empts it badly.
- **Fix target:** Cut the onboard screen to a 1-card "you're a fighter pilot; let's fly" intro + a single "▶ START TUTORIAL" button. Move the full keybind grid to the FLIGHT MANUAL (where it already lives, L235–269). On touch, show only touch-relevant guidance. Let the tutorial carry the actual teaching.

**UX-04 · Pitch direction is ambiguous and self-contradictory across surfaces**
- **Problem (behavioral):** The most fundamental control (which way is up) is taught inconsistently. Onboard card: "W/S pitch" (no up/down). Tutorial: a single key ("press W to pitch your nose up" in master; "press S" in a worktree copy). HUD hint (L61) also "W/S PITCH." A new player genuinely cannot tell whether W climbs or dives.
- **Where:** `onboard.flightKeys` (i18n.js); `tut.pitch`/`tut.pitchTouch` (i18n.js, sourced from `TUTORIAL_STEPS` flow); HUD hint `hud.hint` (i18n.js) + `index.html:61`.
- **Why it hurts:** First control taught = first chance to confuse. Inverted-feeling defaults that the copy has to apologize for ("Pull back — press S…") signal a deeper unresolved decision about pitch polarity.
- **Fix target:** Pick one canonical mapping, state it as "↑ climb / ↓ dive" iconography (not raw key letters) in tutorial and onboard, and make all three surfaces (onboard card, tutorial step, HUD hint) say the identical thing. This is a copy + iconography fix; the UI Designer should standardize a climb/dive glyph used everywhere pitch is mentioned.

### P1 — High value (legibility under load / discoverability)

**UX-05 · In-mission HUD is over-populated; threat feedback competes with chrome**
- **Problem (behavioral):** During combat the screen carries simultaneously: 4 corner panels (tl HP/SHD/THR, tr Score/R&D/Wave/Combo, bl Speed/Alt, br radar+ammo+AWACS), up to **6 stacked warning banners** (`#warns` L51–58: PULL UP / MISSILE / DRONE SWARM / HIGH-G / STEALTH / LOCK), a boss bar, a center `#banner`, AWACS 3-chip cluster, special-ready chip, wingman chip, pilot tag, and a 14-item keybind hint line (`hud.hint`). Mid-dogfight, the *critical* signals (incoming missile, low HP, lock state) have to win attention against permanent chrome and a dense keybind ribbon.
- **Where:** `#hud` `index.html:15–62`; warns L51–58; hint L61; canvas HUD render `js/hud.js` (`drawHUD` family).
- **Why it hurts:** When everything is emphasized, nothing is. A player taking missile damage may not register MISSILE ALERT because six warning slots and a keybind ribbon share the field. The persistent `hud.hint` keybind line is reference text that belongs nowhere near live combat.
- **Fix target:** (a) Remove the persistent `#hint` keybind ribbon from live flight (it's already duplicated in the manual + onboard) or show it only for the first ~10s of the first-ever sortie. (b) Establish a strict 2-tier warning hierarchy: *survival* warnings (PULL UP, MISSILE, low HP) get full-bleed, high-contrast, possibly screen-edge treatment and suppress everything else; *status* warnings (STEALTH, HIGH-G, LOCK) get a quiet single-line lane. (c) Visually de-weight the four corner panels so they read as ambient instruments, letting transient alerts dominate.

**UX-06 · Lock state is the core combat verb but its feedback is buried**
- **Problem (behavioral):** Missiles only home with a full lock; lock is manual by default (`setAutoLock` off, label "off = press F to lock"). The lock lifecycle (designate → ring closing → LOCKED) is communicated via a small `#w_lock` warn and canvas reticle states (`hud.locking`/`hud.locked`/`hud.acquiring`). A new player firing missiles with no lock will see them miss and not understand why.
- **Where:** `#w_lock` `index.html:57`; manual explanation `manH_Lock` L262–263; auto-lock setting L353; lock strings `hud.locking`/`hud.locked`/`hud.targetLocked`/`hud.acquiring` (i18n.js).
- **Why it hurts:** The single most important cause-and-effect in combat (no lock → missile wastes) is taught only in the manual and a small warn chip. The tutorial bundles lock into the missile step rather than making it its own beat.
- **Fix target:** Make lock progression unmistakable as a HUD moment — a prominent reticle ring that visibly closes, with a clear "NO LOCK — missile will not track" state when the player fires unlocked. Promote lock to its own tutorial step. Reconsider whether manual-lock should be the default for brand-new players (auto-lock on for first run, with a hint that it can be turned off).

**UX-07 · BOSS RUSH button is visibly present but dead, with no "why"**
- **Problem (behavioral):** `#bossRushBtn` ships `disabled` + `.disabled` class (L143) and stays dead until `meta.bossRushUnlocked` flips true after the first campaign clear (`js/ui.js:978`). A new player sees a greyed CTA labeled ☠ BOSS RUSH with no tooltip or unlock condition. `#bossRushNote` (L148) exists but isn't populated with an explanation by default.
- **Where:** `index.html:143` + `#bossRushNote` L148; gate at `js/ui.js:978`; unlock state `meta.bossRushUnlocked` (meta.js).
- **Why it hurts:** A locked-but-unexplained control reads as broken, not aspirational. Players don't learn there's a campaign to clear; they just see a button that doesn't work.
- **Fix target:** Replace the inert disabled button with an explicit locked state that states the unlock condition ("Clear an Operation to unlock"). Make locked content legible as a goal, not a bug.

**UX-08 · Mode / Endless-vs-Operation is a high-stakes choice with no explanation at the point of choice**
- **Problem (behavioral):** The hangar MODE toggle (Endless / Operation, L123–129) determines whether LAUNCH drops you into an endless wave grind or opens the multi-sector Operation map — a fundamentally different session structure. The hangar gives no description of either. The rich explanation (`op.info`, the 8-type legend) only appears *after* you've already committed to Operation and reached `#opmap` (L205–223).
- **Where:** `#modesel` `index.html:123–129`; `hangar.endless`/`hangar.operation` (i18n.js, no description strings); `#opmap` legend L210–219.
- **Why it hurts:** Player picks blind, then discovers what they chose. Endless is also the default (`opMode=false`), so most players never discover the Operation campaign exists — which is also what gates Boss Rush (UX-07).
- **Fix target:** Add a one-line description under each MODE option at the hangar ("ENDLESS — survive escalating waves" / "OPERATION — plot a campaign across sectors, beat the boss"). Consider surfacing Operation more prominently since it's the path to the campaign + boss-rush unlock.

**UX-09 · Settings is a flat 20-row list with no grouping and dev/edge toggles mixed into core ones**
- **Problem (behavioral):** The Settings tab is a single `.mset` section with **20** `.srow` entries (counted) in flat order: Language, HUD size, Sensitivity, Steering, Mobile control, Tilt aggression, Motion sensor, Haptics, Button opacity, Button layout, Graphics quality, Master volume, Invert controls, Auto-lock, Wingman, **Unlock all aircraft (dev)**, Nemesis rival, Ground war, Lead gunsight, Mute. The most-changed settings (volume, sensitivity, steering, graphics) are scattered; a **dev** toggle ("Unlock all aircraft") sits in the shipping list between gameplay toggles; deep gameplay-altering toggles (Ground war, Nemesis, Wingman) look identical to a volume slider.
- **Where:** `#manual` settings tab `index.html:335–360` (20 `.srow`); labels `set.*` (i18n.js).
- **Why it hurts:** Players can't find the 3–4 things they actually want; they may flip game-changing toggles by accident and never find audio/control basics. A dev toggle in production invites confusion (or exploit).
- **Fix target:** Collapse the 20-row list into 3 grouped, labeled sections with the most-changed at top: **AUDIO & DISPLAY** (Master volume, Mute, Graphics, HUD size) → **CONTROLS** (Steering, Sensitivity, Mobile control, Tilt aggression, Invert, Button layout/opacity, Motion, Haptics) → **GAMEPLAY** (Auto-lock, Lead gunsight, Wingman, Ground war, Nemesis). Remove "Unlock all aircraft (dev)" from the shipping build (or hide behind a code). Visually flag the GAMEPLAY toggles as "changes the game" vs cosmetic.

**UX-10 · Reward moment (debrief / gameover) is labeled "MISSION FAILED" even on a strong run**
- **Problem (behavioral):** The end-of-run screen header is the hard-coded h1 "MISSION FAILED" (`index.html:159`). It then shows score, kills, accuracy, grade (S/A/B/C), star objectives, and SP earned. Even a player who earned an S grade and 3 stars is greeted with "MISSION FAILED" as the headline. The positive payload (grade, stars, SP) sits below the failure verdict.
- **Where:** `#gameover` `index.html:157–172`; grade L168, stars L169, SP L170; `banner.missionFailed` (i18n.js).
- **Why it hurts:** The reward beat — the dopamine moment that drives retention — is buried under a defeat headline. Players who did well feel punished; the grade/stars/SP get less attention than they earn.
- **Fix target:** Lead the debrief with the *grade and reward* (big S/A/B/C letter + stars + "+SP"), and demote the failure framing to a subordinate line or reframe by outcome (e.g., grade-led headline). The grade/stars/SP block should be the visual hero of this screen, not a footnote under "MISSION FAILED."

### P2 — Polish (clarity / jargon)

**UX-11 · Player-facing jargon density is high; several terms are unexplained at point of use**
- **Problem (behavioral):** The copy leans hard on milsim/acronym jargon that a casual arcade player won't parse on sight: **R&D** vs **RP** vs **SP** (three different point systems — RP = in-run research, SP = persistent Strategic Points, "R&D" is the HUD label for RP), **RTB**, **AWACS / ORBITAL STRIKE / SPECTRA jam / EMERGENCY RESUPPLY**, **CCA SWARM**, **high-G**, **deflection pipper / lead-computing gunsight**, **furball**, airframe-gen tags ("4.5 GEN"). Several appear in the HUD with no first-use explanation.
- **Where:** HUD labels `lblRd`/`#tp` (R&D=RP) `index.html:23`; SP `index.html:94`; AWACS chips L38–42 + `awacs.*` (i18n.js); `set.gunLead` "Lead-computing gunsight (deflection pipper)" L358; tactics manual L325–328.
- **Why it hurts:** The two-currency split (RP in-run vs SP persistent) is genuinely confusing because the HUD calls RP "R&D" while the hangar shows "STRATEGIC POINTS" — a player can't tell why they have two scores or which one they're spending. Jargon without glossing raises the comprehension bar for a game that should be pick-up-and-play.
- **Fix target:** (a) Unify or clearly distinguish the currencies — same word for the same thing across HUD + hangar + tech screen; consider a tooltip/legend on first appearance of RP and SP. (b) On first use, gloss AWACS/CCA/high-G with a plain-language subtitle. (c) Audit `i18n.js` for acronyms that appear before they're explained and add inline glosses or hover/tap definitions.

**UX-12 · Tech tree screen is text-heavy and front-loads instructions over the actual tree**
- **Problem (behavioral):** The R&D screen (`#upgrade` L175–193) opens after every wave with a subtitle ("ONE TREE · PATH DOWN ANY BRANCH · UPGRADES PERSIST FOR THE RUN"), a long `#techhint` paragraph (L190), tabs (TECH TREE / ARMORY), and the grid. The interaction model (drag/scroll to explore, tap lit node, RESERVE SQUADRON repeatable) is explained in prose every time rather than shown.
- **Where:** `#upgrade` `index.html:175–193`; `techhint` L190; `manP_Tech` tactics L327.
- **Why it hurts:** It's a wall of instruction at a moment the player wants to make a quick spend-or-skip decision between waves. Repeated every wave, the prose becomes noise.
- **Fix target:** Make the tree self-evident (lit = affordable, locked = greyed with cost, bought = checked) so the explanatory paragraph can shrink to a one-liner or a dismissible first-time tip. Surface "DEPLOY and spend nothing" as a clearly-equal option so players don't feel forced to spend.

**UX-13 · Five hangar CTAs use inconsistent symbol glyphs as their primary identity**
- **Problem (behavioral):** The hangar buttons are identified largely by leading dingbats: ▶ LAUNCH, ◆ DAILY, ☠ BOSS RUSH, ▲ COMMAND & PROGRESSION, ▣ CONTROLS & MANUAL. The glyphs carry meaning (▶ = go, ☠ = danger) but aren't a consistent system, and "COMMAND & PROGRESSION" / "CONTROLS & MANUAL" are long, near-rhyming labels easy to confuse.
- **Where:** `index.html:141–145`; `hangar.*Btn` / `meta.btn` / `daily.title` (i18n.js).
- **Why it hurts:** Minor, but the two longest buttons read similarly and the glyph set isn't a learnable language — adds small per-visit friction.
- **Fix target:** Differentiate the two "&"-labels (e.g., "PROGRESSION" / "MANUAL & SETTINGS"), and standardize an icon system so primary vs secondary actions are visually tiered (ties into UX-02).

---

## 3. Top 5 Friction Killers (ordered by drop-off impact)

1. **UX-02 — Give the hangar one primary path.** Establish a single dominant `▶ LAUNCH` (or QUICK LAUNCH default) and demote the other 4 buttons + collapse the 5 config clusters into an optional loadout strip. This is the screen every session passes through; it currently has no focal point.
2. **UX-01 — Make the first screen sell the game.** Add a value prop + hero visual behind the language toggle. First frame currently teaches nothing and risks immediate bounce.
3. **UX-03 + UX-04 — Replace the keybind-dump onboard with a 1-card intro, and fix the pitch ambiguity.** Let the (good) action-gated tutorial do the teaching; standardize "↑ climb / ↓ dive" across onboard, tutorial, and HUD.
4. **UX-05 + UX-06 — Tier the in-combat HUD so survival signals win.** Kill the persistent keybind ribbon in flight, split warnings into survival vs status tiers, and make lock progression an unmistakable HUD moment.
5. **UX-10 — Lead the debrief with the reward, not "MISSION FAILED."** The grade/stars/SP block should be the hero of the end screen so the retention payload lands.

---

## 4. Open Questions (need a real play session — can't fly headless)

- **Does the action-gated tutorial reliably advance on touch?** `tickTutorial` detects pitch/throttle/gun/missile from live state; on a phone with the floating joystick + THR slider, do the thresholds (`|pitchRate|>0.25`, `throttle>0.6`) trigger as expected, or can a new player get stuck on a step they think they're performing?
- **Is VETERAN (default difficulty) actually beatable on a first run?** Default is difficulty=1 ("the intended challenge"), not Rookie. Does a brand-new player survive long enough to reach the reward loop, or do they die fast and bounce? A Rookie default for first-ever run may retain better.
- **Mid-combat, is MISSILE ALERT actually noticed?** The 6-slot warn stack + keybind ribbon hypothesis (UX-05) needs eyes-on: does a player under fire register the missile warning in time to pop flares, or does it get lost?
- **Do players ever discover Operation mode (and therefore the campaign + Boss Rush unlock)?** Endless is default and Operation is unexplained at the hangar (UX-08). A session would confirm whether players ever flip the mode toggle.
- **The two-currency model (RP/R&D vs SP):** do players understand they have two separate economies, or do they conflate them? Needs observation of someone spending in both the tech tree and Command & Progression.
- **Does the lock model frustrate?** With manual-lock as default (UX-06), how many missiles does a new player waste before understanding lock-then-fire? A session would quantify the "missiles fired with no lock" rate.
