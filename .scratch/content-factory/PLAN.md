# Content Factory (CF) — plan + checklist

Handoff: `~/Downloads/handoff-2-skystrike-content-factory.md`. Goal: game content (formations,
wave patterns, weekly modifiers) authored as versioned DATA packs, auto-validated, battery-gated.

## Design (locked)
- **`js/content-packs.js`** — new pure require-safe DATA file (roster.js pattern), loaded after
  roster.js. `CONTENT_PACKS = [{id, version, formations{}, modifiers[], waves[]}]` + CJS footer.
- **Formations as data**: pack formation `{spacing, engageRange, slots:[{x,z}…]}` — slots are
  follower offsets in SPACING UNITS (leader implicit at origin). `formationSlots` gains one
  template branch (wraps deeper by template depth when n exceeds template). Base 4 types untouched.
- **Modifiers as data**: every modifier gains `effects` object; allowed keys
  `lockWeather('fog'|'storm') | flares | missiles | extraAces | turnMul`. Base 5 mods get
  equivalent effects. `applyWeeklyMods` becomes a generic interpreter storing
  `player._weeklyEffects`; enforcement points (main.js weather/aces, ui-tech re-seal) read effects
  instead of hardcoded ids. `weeklyModifiers(seed, pool)` — optional pool arg, default = base
  table (existing tests stay green).
- **Wave patterns**: `{id, pattern:[{n, formation?}…]}` — weekly runs deterministically pick one
  (`weeklyWavePattern(seed, patterns)`); overrides endless fighter count + pins formation for
  waves 1..len, then normal cadence resumes.
- **Validation**: pure `validatePack(pack, formations, baseModIds)` → `{ok, errors[]}` +
  `applyContentPacks(packs, formations, baseMods)` merge (core.js CF section). Runtime merge in
  globals.js → `packRuntime`. CLI `scripts/validate-packs.mjs` (exit 1 on any invalid).
  Battery test `tests/content-packs.test.js` (shipped packs valid + rejection fixtures).
- **Bounds** (PACK_LIMITS): spacing 120–400, engageRange 600–2400, slots 1–15, |x|,|z| ≤ 8,
  min separation 0.5u incl. origin; flares/missiles 0–6 int, extraAces 1–3 int, turnMul 0.4–1.0;
  wave rows 1–10, n 1–16 (WAVE_COUNT_CAP), formation refs ∈ base ∪ same pack; id slug, version 1.

## Checklist
- [x] core.js CF section: PACK_LIMITS, validatePack, applyContentPacks, weeklyEffectsFor,
      weeklyWavePattern; formationSlots template branch; weeklyModifiers(seed, pool);
      base WEEKLY_MODIFIERS gain effects
- [x] js/content-packs.js: 3 candidate packs (vanguard-geometry, iron-skies, gauntlet-lines)
- [x] index.html script tag (after roster.js)
- [x] globals.js: packRuntime merge
- [x] ui-flow.js: interpreter applyWeeklyMods, weeklyThisWeek pool+wavePlan, startWeekly stash
- [x] main.js: effects-driven weather guard, numeric extra-ace loop, wave-plan override,
      queueFighterWave forceType
- [x] ui-tech.js: re-seal via _weeklyEffects
- [x] i18n.js: weekly.mod.{fogBank,lastFlare,oneShot,aceSeason}(+.d) EN+ZH+KO (machine-drafted,
      flagged for native review — joins the batch-1 pool)
- [x] tests/content-packs.test.js (shipped packs valid + 20 rejection fixtures + i18n scrape)
- [x] scripts/validate-packs.mjs — PACK VALIDATION PASS (3/3)
- [x] scripts/verify-packs.mjs — PACKS VERIFY PASS (merge + diamond hold maxErr 84-154 +
      weekly wave-plan end-to-end: vanguardLadder wave 1 = 4-ship pinned diamond)
- [x] npm test green (61 tests); verify-formation + verify-weekly regressions green
      (verify-weekly predicates updated: _weeklyAces count + 4 pack-mod predicates)
- [x] CLAUDE.md: architecture row + load order + current state
- [ ] Ship only on Tim's word (/ship)

## Deferred / open
- Native ZH/KO review of the 8 new weekly.mod strings (pooled with batch-1 review).
- Future packs: author in js/content-packs.js → validate-packs → npm test → i18n ×3 for any
  new modifier id. Effect vocabulary extensions (e.g. lockTod, hpMul) need a new PACK_LIMITS
  key + interpreter clause + validator rule + test.
