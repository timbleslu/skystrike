# Operations Map Revamp — Phase 0 Design Proposal (synthesized)

**Status:** awaiting user approval before implementation. Synthesis of a Software Architect
(schema/persistence/core API/integration) + Game Designer (scaling/difficulty/economy/bosses)
proposal pass, reconciled against real source. Companion to `prompt.md` (the brief).

**Top-level stance:** a *bounded campaign path layered beside the existing endless scheduler*,
not a rewrite. The old op-map (`genOpMap` choice-tree + `opMap/opStage/opSector` loop) is replaced.
ENDLESS / Daily / Boss-Rush are untouched. Highest risk = snapshot/rollback (tech mutates derived
player stats in place) + the `gameOver` interception.

---

## 1. Reconciled decisions (the calls baked into this proposal)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **REPLACE `genOpMap`** with a static `OPERATIONS` data table in opmap.js. | Linear, authored; the choice-tree is deleted. |
| D2 | **Author absolute spawn values per level** (`fighters/aces/bombers/ground/weather/tod/hostileAce`), NOT deltas overlaid on `sectorPlan(type,wave)`. | Resolves the dead-branch bug: `sectorPlan`'s `wave>=8` difficulty branches never fire at bounded waves (1–4). Difficulty becomes fully authored. `sectorMission(type)` still maps type→mission. |
| D3 | **Waves-per-level** = `clamp(2 + (index>>1), 2, 4)`; recon/stealth override to `waves:1`; boss level = 1 short approach wave + 1 boss wave. | Cap 4 keeps a level a 5–8 min session loop. (Architect proposed cap 8; Game Designer's gameplay cap 4 wins.) |
| D4 | **New `campaignMode` global** gates the bounded path; do NOT overload `opMode`. | Endless/Daily/Boss-Rush logic reading `opMode` is provably unaffected. |
| D5 | **All 3 new screens (ops-select, level-map, briefing) live in ui-flow.js.** ui-tech.js loses `openOpMap`/`launchSector`; reverts to pure shopping. | Separates campaign navigation from the tech screen (today's design smell). Biggest maintainability win. |
| D6 | **Snapshot = re-derive inputs, not restore derived stats.** Capture `{rp, tech[], techRepeat{}, upgrades[], loadout, score}`; on fail restore inputs + re-run the stat-build pipeline. | `commitNode` mutates maxHp/maxMissiles/etc. in place — deep-restore is brittle (breaks when a new node adds a field). Extract one shared `rebuildPlayerStats`. |
| D7 | **Persist in `meta.campaign{}`**; extend `freshMeta`, one lenient heal line in `loadMeta`, no `validMeta` change, no version bump. | Mirrors the stars/bossRush heal idiom exactly — legacy saves never wipe. |
| D8 | **Boss multi-phase = data descriptors wired to the EXISTING machine.** Only 3 new knobs: `bossAttackPattern` enum (`pursue`/`standoff`/`headOn`/`dive`), boss-side chaff (reuse player decoy spawn), CORSAIR `mirror` canned-counter table. Parameterize the existing hardcodes (`turnRate*=1.18`, fixed salvo) to read `turnMul`/`fireMul`/`extraMissiles`. | Distinct fight feel per boss without a new engine. Triggers stay at the existing `BOSS_PHASE2_HP=0.6`/`BOSS_PHASE3_HP=0.3`. |

---

## 2. Data shape

### 2.1 `OPERATIONS` table (opmap.js, added to the CommonJS export footer)

All `*Key` fields are i18n keys (EN+ZH in i18n.js) — the table holds **no literal strings**.

```js
const OPERATIONS = [
  { id:'ironVeil',         nameKey:'op.ironVeil.name',         theaterKey:'op.ironVeil.theater',         loreKey:'op.ironVeil.lore',         levels:[ /* 8 */ ] },
  { id:'midnightMeridian', nameKey:'op.midnightMeridian.name', theaterKey:'op.midnightMeridian.theater', loreKey:'op.midnightMeridian.lore', levels:[ /* 8 */ ] },
  { id:'sunfireHorizon',   nameKey:'op.sunfireHorizon.name',   theaterKey:'op.sunfireHorizon.theater',   loreKey:'op.sunfireHorizon.lore',   levels:[ /* 9 */ ] },
];
```

### 2.2 Level row schema

```js
// {
//   id            stable per-op key; meta keyed on `${opId}.${id}` — NEVER renumber
//   nameKey       mission name
//   type          'RECON'|'FURBALL'(sweep)|'STEALTH'|'INTERCEPT'|'DEFEND'|'ESCORT'|'STRIKE'|'FINAL'(boss)
//   loreKey       briefing narrative (situation / why we're here)
//   objectivesKey win condition as orders
//   enemyIntelKey unit types + threats
//   waves         bounded wave bank (literal). Omit → campaignWaveCount(index). recon/stealth: 1.
//   spawn { fighters, aces, bombers, ground, weather, tod, hostileAce }   // AUTHORED absolute (D2)
//   setpiece?     optional SETPIECES id folded onto the plan (replaces stage-coord keying)
//   isBoss        true on FINAL
//   boss? {       present iff isBoss:
//     callsignKey, introKey,
//     phases: [   // 3 entries; triggers are the existing 0.6/0.3 thresholds
//       { descKey, turnMul, fireMul, extraMissiles, weather?, tod?, pattern?, flags? }
//     ]
//   }
// }
```

### 2.3 Operation 1 "IRON VEIL" — fully authored (the reviewable example)

Difficulty values from the Game Designer's worked table; narrative keys map to the brief's spine.

| # | id | name | type | fighters | aces | bombers | ground | weather | tod | waves |
|---|----|------|------|----------|------|---------|--------|---------|-----|-------|
| 1 | firstLight | FIRST LIGHT | RECON | 2 | 0 | 0 | – | clear | day | 1 |
| 2 | openSkies | OPEN SKIES | FURBALL(sweep) | 4 | 0 | 0 | – | clear | day | 2 |
| 3 | blindspot | BLINDSPOT | STEALTH | 2 | 0 | 0 | – | fog | night | 1 |
| 4 | tripwire | TRIPWIRE | INTERCEPT | 3 | 0 | 2 | – | fog | dusk | 3 |
| 5 | ironShield | IRON SHIELD | DEFEND | 3 | 1 | 1 | – | storm | dusk | 3 |
| 6 | lifeline | LIFELINE | ESCORT | 3 | 1 | 0 | – | clear | day | 4 |
| 7 | hammerFall | HAMMER FALL | STRIKE | 3 | 0 | 0 | ✓ | storm | day | 4 |
| 8 | warlord | WARLORD | FINAL(boss) | 4 | 2 | 0 | – | storm | night | 1+approach |

Curve: early = +count; mid (4–5) = first bombers, then first ace + storm; late (6–7) = escort/strike under weather; boss = storm/night + phases.

### 2.4 Operations 2 & 3 — spine + boss (same schema; full difficulty authored in implementation)

**OP2 "MIDNIGHT MERIDIAN"** (8 levels, winter throughout — curve shifts up one notch, fog/storm + night from L1, SAM `ground:true` on more nodes):
DEAD CHANNEL(stealth) · GHOST SIGNAL(recon) · COLD IRON(sweep) · IRON CURTAIN(intercept) · LAST LINE(defend) · LONG REACH(strike) · EXTRACTION(escort) · **GLACIER**(boss).

**OP3 "SUNFIRE HORIZON"** (9 levels, hardest, strike-heavy climax — two strike levels, aces on most mid/late nodes, storm/night dominant):
OPEN WATER(sweep) · SUNSCREEN(intercept) · DEAD RECKONING(recon) · SHIELDWALL(defend) · LIFEGUARD(escort) · SILENT ENTRY(stealth) · FIRST VOLLEY(strike) · SECOND SUN(strike) · **CORSAIR**(boss).

### 2.5 Boss phase descriptors (D8)

```js
// WARLORD — aggressive last stand: dogfight → chaff+missile spam low over reef → head-on pass
phases:[
  { descKey:'boss.warlord.p1', turnMul:1.0, fireMul:1.0, extraMissiles:0 },
  { descKey:'boss.warlord.p2', turnMul:1.0, fireMul:1.3, extraMissiles:2, weather:'storm', flags:['chaff'] },
  { descKey:'boss.warlord.p3', turnMul:1.4, fireMul:1.0, extraMissiles:0, pattern:'headOn' },
]
// GLACIER — BVR ghost hunter, winter: standoff salvos → valley knife-fight in snow → climb + vertical dive
phases:[
  { descKey:'boss.glacier.p1', turnMul:0.8, fireMul:1.0, extraMissiles:2, pattern:'standoff', weather:'fog', tod:2 },
  { descKey:'boss.glacier.p2', turnMul:1.3, fireMul:1.2, extraMissiles:0, weather:'storm' },
  { descKey:'boss.glacier.p3', turnMul:1.4, fireMul:1.0, extraMissiles:0, pattern:'dive' },
]
// CORSAIR — the defector: scripted "mirror" counters → desperation energy-fight → smoke-trailing ram finisher
phases:[
  { descKey:'boss.corsair.p1', turnMul:1.2, fireMul:1.0, extraMissiles:0, flags:['mirror'] },
  { descKey:'boss.corsair.p2', turnMul:1.2, fireMul:1.3, extraMissiles:2 },
  { descKey:'boss.corsair.p3', turnMul:1.5, fireMul:1.3, extraMissiles:2, pattern:'headOn' },
]
```

---

## 3. core.js pure API (require-safe; `tests/campaign.test.js`)

```js
const LEVEL_WAVE_MIN=2, LEVEL_WAVE_CAP=4;
function campaignWaveCount(index, cap){ return clamp(2+(index>>1), LEVEL_WAVE_MIN, cap===undefined?LEVEL_WAVE_CAP:cap); }
function levelCleared(wavesCleared, total, missionDone){ return wavesCleared>=total && missionDone; }

// progression — pure over (campaign, OPERATIONS, …); OPERATIONS injected to stay load-order-free
function isOpUnlocked(campaign, ops, opId){}        // first op true; else prev op's boss cleared
function isLevelUnlocked(campaign, ops, opId, i){}  // op unlocked AND (i===0 OR level i-1 cleared)
function levelState(campaign, ops, opId, i){}       // 'locked'|'unlocked'|'cleared'
function markLevelCleared(campaign, ops, opId, i, score, stars, levelId){} // NEW campaign obj (monotonic best)
function furthestLevel(campaign, opId){}

// snapshot/rollback — pure values; glue assigns back + re-derives stats
function captureSnapshot(p){ return {rp:p.tp, score:p.score, tech:p.tech.slice(), techRepeat:{...}, upgrades:p.upgrades.slice(), loadout:{...}}; }
function rollbackSnapshot(snap){ /* NEW object, same shape */ }

// rewards
const CAMPAIGN_REPLAY_REWARDS=true;  // brief: farmable by design; one flag flips replays to no-reward
function grantLevelRewards(index, isBoss, alreadyCleared, farmable){
  if(alreadyCleared && !farmable) return {rp:0,score:0};
  return { rp:40+20*index+(isBoss?150:0), score:1000+500*index+(isBoss?5000:0) };
}
```

---

## 4. Persistence (meta.js)

- `freshMeta` += `campaign:{}`.
- `loadMeta` += one heal line: `if (!meta.campaign || typeof meta.campaign!=='object') meta.campaign={};` (mirrors the stars heal).
- `validMeta` **unchanged** (adding `campaign` to required keys would wipe every existing save). `META_VERSION` stays 1.
- Per-op sub-shape (lazily created by `markLevelCleared`): `campaign[opId] = { unlocked, furthest, levels:{ [levelId]:{cleared, bestScore, bestStars} } }`.
- Thin store-touching wrappers in meta.js over the pure cores: `campaignClearLevel` / `campaignLevelState` / `campaignOpUnlocked` → call `saveMeta()`. No new storage key (rides in `skystrike_meta`).

---

## 5. Runtime integration

**globals.js** += `campaignMode=false`, `campaignOpId=null`, `campaignLevelIdx=-1`, `campaignWavesLeft=0`, `campaignSnapshot=null`.

**main.js `nextWave`** — swap the campaign branch guard `opMode → campaignMode`; build the plan from the level descriptor (`spawn` fields + `sectorMission(type)`), fold `setpiece` if present. Endless path below = byte-identical (distinct early-return branch — satisfies "distinct path, not a rewrite").

**main.js `handleWaves`** — add a bounded-clear branch: decrement `campaignWavesLeft`; when boss dead OR `wavesCleared>=waves && missionDone` → `campaignLevelComplete()` (NOT `operationComplete()`). No mid-level tech screen (shopping is between levels on the map).

**ui-flow.js** — new: `openOperationsSelect` / `renderLevelMap(opId)` / `renderBriefing(opId,i)` / `launchLevel(opId,i)`; lifecycle `campaignLevelComplete` / `campaignLevelFailed`; `rebuildPlayerStats(player, restored)`; read-only loadout-summary formatter.
- `launchLevel`: set campaign globals + `opSector=lvl.type`, `campaignWavesLeft = lvl.waves ?? campaignWaveCount(i)`, `captureCampaignSnapshot()`, collapse to a "launching…" transition (reuse `betweenWaves=true; waveTimer≈1.4; showBanner`), `state='playing'`.
- **`gameOver` guard (critical):** `if (campaignMode){ campaignLevelFailed(); return; }` at the top — catches BOTH death sources (HP-zero and objective-fail funnel through `gameOver`). Endless never sets `campaignMode`, so its `gameOver` is unchanged.

**ui-tech.js** — delete `openOpMap`/`launchSector`; strip the campaign branch from `deployFromTech` (endless branch untouched); `applyDepot` stays dormant.

**ui-hangar.js** — `setOpMode` routes the "Operations" choice to `openOperationsSelect` instead of `genOpMap`.

**index.html / styles.css** — markup + CSS for the 3 screens (reuse `.op-sector` locked/done/pickable classes where possible). Verify with `node scripts/shot.mjs`.

---

## 6. Economy (checkpoint hybrid)

- **Snapshot** at level launch: `{rp=player.tp, score, tech[], techRepeat{}, upgrades[], loadout}`.
- **WIN** → keep everything earned in-level; `grantLevelRewards` (RP `40+20·idx`, +150 boss; score `1000+500·idx`, +5000 boss); persist stars via `evalStars`→`bestStars` (keyed per op+level); unlock N+1. No separate per-level SP faucet — SP flows through existing `spAward` at op end.
- **FAIL** → `rollbackSnapshot` + `rebuildPlayerStats`: keep upgrades brought INTO the level, lose in-level RP/tech/score. Level stays unlocked; retry free. **No `endRun`/`spAward` on a failed level.**
- **Economy (tp/score) rolls back; SP-feeding run-stats (kills/boss/waveReached) accumulate monotonically** — so repeated boss attempts aren't punished on SP.
- **Replay** cleared level → re-grant (farmable, default ON via `CAMPAIGN_REPLAY_REWARDS`).

---

## 7. File-touch list

| File | Change | Risk |
|------|--------|------|
| js/opmap.js | + `OPERATIONS` (3 ops/25 levels) + `levelPlan(lvl)`; **delete `genOpMap`**; level-row `setpiece` opt-in; footer | MED |
| js/core.js | + campaign cores (§3); footer | LOW |
| js/meta.js | + `campaign:{}`, 1 heal line, 3 wrappers; footer | MED (heal correctness) |
| js/main.js | `nextWave` guard swap + descriptor read; `handleWaves` bounded-clear branch | **HIGH** (core integration) |
| js/ui-flow.js | 3 screens + lifecycle + `gameOver` guard + `rebuildPlayerStats` | **HIGH** |
| js/ui-tech.js | remove op-map nav; strip campaign branch from `deployFromTech` | MED |
| js/ui-hangar.js | `setOpMode` routing | LOW-MED |
| js/globals.js | + campaign globals | LOW |
| js/combat.js + entities.js | parameterize boss hardcodes to read phase descriptor; + `bossAttackPattern`/`chaff`/`mirror` | MED |
| js/missions.js | likely ~0 (recon/stealth already work bounded; fail still routes to `gameOver`) | LOW |
| js/i18n.js | EN+ZH for ~3 op headers + 25 level quads + 3 bosses + phases + chrome | MED (volume) |
| index.html / styles.css | 3 screens markup + CSS | MED (shot.mjs verify) |
| tests/campaign.test.js (NEW) | progression lattice + wave scaling + snapshot/rollback | LOW |
| tests/op-map.test.js | update for `genOpMap` removal; keep sectorPlan/setpiece | LOW-MED |
| CLAUDE.md | fix stale missions row; opmap/ui-flow rows; Current state | LOW |

---

## 8. Open questions

**Resolved with a default (proceeding unless you object):**
- Wave cap = **4**. · Difficulty = **authored absolute per level** (D2). · SP on fail **voids**; economy rolls back, run-stats don't. · Tech shop **between levels only**. · DEPOT/ELITE = **dormant valid types**, none authored into the 3 ops. · Boss-Rush unlock = **beating any operation's boss** (preserves current behavior). · STRIKE w/o ground-war → **INTERCEPT fallback** (current idiom). · `META_VERSION` **stays 1**. · Replay rewards **farmable ON** (brief: "farmable by design").

**Genuinely open (non-blocking — tuning/impl detail):**
- TECH_TREE node-cost table needed to validate the `40+20·idx` RP grant + run a farming Monte-Carlo (balancing pass, post-build).
- `rebuildPlayerStats` = extract the shared "(base jet + meta perks + tech list) → derived stats" routine used by both `startGame` and rollback (impl detail).

---

## 9. Proposed implementation sequence (subagent waves; hard deps respected)

1. **Wave A (foundation, gated first):** core.js cores + `tests/campaign.test.js` (RED→GREEN) · meta.js persistence + heal. *Everything keys off these.*
2. **Wave B (parallel, after A):** opmap.js `OPERATIONS` table + Op1/2/3 authoring · i18n.js EN+ZH strings · boss descriptor knobs in combat.js/entities.js.
3. **Wave C (after A+B):** main.js `nextWave`/`handleWaves` bounded path · ui-flow.js screens + lifecycle + `gameOver` guard + `rebuildPlayerStats` · ui-tech.js/ui-hangar.js rewiring · index.html/styles.css.
4. **Wave D:** `node scripts/shot.mjs` visual verify · full `npm test` · CLAUDE.md update · code review.
