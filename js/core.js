/* SKYSTRIKE — core.js: the pure, dependency-free game cores. Load FIRST (after storage.js,
   before globals.js). Browser: every symbol below is a plain global (script-scope const/let are
   shared across <script> tags), so globals.js and the rest see them unchanged. Node: the footer
   exports them so tests `require('../js/core.js')` and exercise the REAL implementation — no
   byte-identical mirror copies, one source of truth.

   Everything here is pure (functions over plain data + their own constant tables) and touches
   NO browser/THREE/store/DOM globals, which is exactly what makes the file require-safe. Keep it
   that way: anything that reads live state or THREE belongs in globals.js, not here. */

/* ---------------- math helpers ---------------- */
const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/* ---------------- weather core (feature #4) ---------------- */
const NIGHT_RADAR_MUL = 0.75;   // night (TOD index 2) additionally shortens radar detection
// fogMul values DRAMATICALLY raised (Track B §5): storm 1.6→5.7, fog 3.0→11.4 so active weather
// guts the draw distance (storm ~6km, fog ~3km visible, vs the old ~21/~11km that read as barely-there).
// The actual scene.fog.density is computed by fogDensityFor(tier, type) below (clear scales by tier,
// storm/fog hit a fixed effective density); fogMul stays the descriptive gameplay-facing field and is
// what visuals/tests key off. radar/lock fields unchanged — only fog distance changes.
const WEATHER = {
  clear: { radarMul: 1.0, lockRangeMul: 1.0,  lockSpeedMul: 1.0,  turbulence: 0.0,  fogMul: 1.0 },
  fog:   { radarMul: 0.6, lockRangeMul: 0.65, lockSpeedMul: 1.15, turbulence: 0.0,  fogMul: 11.4 },   // radar 0.8→0.6: fog cuts enemy detection ~40% (weather-FX pass)
  storm: { radarMul: 0.7, lockRangeMul: 0.6,  lockSpeedMul: 1.35, turbulence: 0.0, fogMul: 5.7 },     // radar 0.7: storm cuts enemy detection ~20%
};
// PURE — resolve the live modifier set for a condition + time-of-day (folds the night radar
// factor). Unknown types fall back to clear. This is the pure core of engine.js applyWeather.
function resolveWeather(type, tod) {
  const w = WEATHER[type] || WEATHER.clear;
  const night = (tod === 2) ? NIGHT_RADAR_MUL : 1;
  return {
    type: WEATHER[type] ? type : 'clear',
    radarMul: w.radarMul * night,
    lockRangeMul: w.lockRangeMul,
    lockSpeedMul: w.lockSpeedMul,
    turbulence: w.turbulence,
    fogMul: w.fogMul,
  };
}
// PURE — bounded (|x| <= amp), smooth, exactly zero-mean-over-2π attitude wobble. Two
// commensurate sines (1 + 2 cycles over [0,2π]) so the integral over a full cycle is exactly 0.
function turbSample(t, amp) {
  return amp * (0.6 * Math.sin(t) + 0.4 * Math.sin(2 * t + 1.3));
}
// PURE — deterministic standalone-play weather roll, weighted toward clear (hash -> [0,1)).
function rollWeather(seed) {
  let x = (seed | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  const r = x / 4294967296;
  return r < 0.6 ? 'clear' : r < 0.8 ? 'fog' : 'storm';
}
// PURE — FogExp2 density per (tier, weather) (Track B §5). CLEAR scales by tier so richer tiers draw
// farther (Low ~28km tighter to save mobile fill, Medium ~34km = current FOG_BASE, High ~38km open to
// show the new relief/objects). STORM/FOG hit a FIXED effective density regardless of tier so active
// weather visibly slams the sightline at every tier (storm ~6km, fog ~3km — visible distance for
// FogExp2 at 2% transmittance is d = 1.978/density). Camera far (40km) never needs touching: fog is
// near-opaque well before it. Used by engine.js applyWeather as scene.fog.density.
const FOG_CLEAR_DENSITY = { low: 0.0000706, medium: 0.000058, high: 0.0000520 };  // ~28 / ~34 / ~38 km
const FOG_ACTIVE_DENSITY = { storm: 0.000330, fog: 0.000659 };                     // ~6 km / ~3 km, all tiers
function fogDensityFor(tier, weatherType) {
  if (weatherType === 'storm' || weatherType === 'fog') return FOG_ACTIVE_DENSITY[weatherType];
  return FOG_CLEAR_DENSITY[tier] || FOG_CLEAR_DENSITY.medium;   // clear / unknown weather → tier baseline
}

/* ---------------- boss phase core (F4) ---------------- */
const BOSS_PHASE2_HP = 0.6;   // boss steps 1 -> 2 when hp/maxHp drops below this
const BOSS_PHASE3_HP = 0.3;   // boss steps 2 -> 3 when hp/maxHp drops below this
// PURE — boss phase (1/2/3) implied by a HP fraction. Monotone non-increasing in hpFrac.
function bossPhaseFor(hpFrac) {
  if (hpFrac < BOSS_PHASE3_HP) return 3;
  if (hpFrac < BOSS_PHASE2_HP) return 2;
  return 1;
}
// PURE — once-per-phase guard. Given the highest phase already reached and the phase
// implied by current HP, return the new highest reached: never regresses (HP regen can't
// drop a phase) and only ever advances toward the HP-implied phase. `reached` starts at 1.
function nextBossPhase(reached, hpFrac) {
  const want = bossPhaseFor(hpFrac);
  return want > reached ? want : reached;
}
// PURE — resolve a boss's per-phase combat state. `phaseCfg` is the authored e._phaseCfg array
// (one {turnMul,fireMul,extraMissiles,pattern,flags,…} entry per phase) or null for the legacy
// endless/boss-rush/rivals ramp; `phase` is 1/2/3; `baseTurnRate` is the boss's ORIGINAL (phase-1)
// turn rate. Returns ONE plain phase-state consumed by all the readers that used to poke scattered
// underscore fields: entities.js (pattern/flags movement + turnRate), main.js (fireMul cadence /
// extraMissiles salvo). `baseTurnRate` is echoed back so the impure caller can carry it forward
// across phases WITHOUT a separate _baseTurnRate field. NO mutation, NO THREE/DOM.
// null/absent cfg reproduces the legacy behaviour EXACTLY: one ×1.18 turn bump per crossed phase
// (byte-identical to the old compounding `e.turnRate *= 1.18`), fireMul 1 / extraMissiles 0 / no
// pattern/flags — so main.js/entities.js fall back to their hardcoded phase≥2/≥3 branches unchanged.
function resolveBossPhase(phaseCfg, phase, baseTurnRate) {
  const cfg = phaseCfg && phaseCfg[phase - 1];
  if (cfg) {
    return {
      turnRate: baseTurnRate * (cfg.turnMul != null ? cfg.turnMul : 1),
      fireMul: cfg.fireMul != null ? cfg.fireMul : 1,
      extraMissiles: cfg.extraMissiles || 0,
      pattern: cfg.pattern || null,
      flags: cfg.flags || [],
      baseTurnRate: baseTurnRate,
    };
  }
  let turnRate = baseTurnRate;
  for (let p = 2; p <= phase; p++) turnRate *= 1.18;   // one twitchier bump per crossed phase (legacy)
  return { turnRate: turnRate, fireMul: 1, extraMissiles: 0, pattern: null, flags: [], baseTurnRate: baseTurnRate };
}

/* ---------------- damage resolution core ---------------- */
// PURE — resolve a single hit into a plain DamageResult. NO mutation of inputs, NO THREE/DOM.
// combat.js gathers `state` off the enemy + `hit` off the player, calls this, then APPLIES the
// result back (hp/playerDmg), awards `player.tp += rp`, and fires the existing side-effects
// (damage numbers, audio, haptic, boss-phase machine, killEnemy, EXECUTE blast FX).
//
//   state = { hp, maxHp, type, playerDmg }   (the enemy's relevant numeric fields)
//   hit   = { amt, byPlayer, rand,           (rand in [0,1) — the crit roll, injected so this stays pure)
//             alphaMul, comboDmg, combo,     (player damage modifiers; combo is player.combo)
//             critChance, critMul,
//             execThresh, rpMul,
//             tpDmg }                         (TP.dmg — the per-damage RP rate, injected to keep core data-free)
// returns { amt, crit, hp, hpDelta, died, executed, playerDmg, rp }
//   amt       — final damage actually applied (post-multipliers; same value combat.js shows/scores)
//   crit      — whether this hit critted (combat.js plays the crit SFX + crit blast)
//   hp        — enemy hp AFTER the hit (and after any EXECUTE clamp to 0)
//   hpDelta   — how much hp dropped (>=0; == amt unless EXECUTE forced the rest)
//   died      — hp <= 0 after resolution
//   executed  — EXECUTIONER finished a wounded non-boss outright (combat.js fires execBlast)
//   playerDmg — enemy's accumulated player-dealt damage AFTER this hit (unchanged if !byPlayer)
//   rp        — RP (player.tp) to award for the damage dealt (0 if !byPlayer)
function resolveDamage(state, hit) {
  const byPlayer = hit.byPlayer === undefined ? true : !!hit.byPlayer;
  let amt = hit.amt;
  let crit = false;
  if (byPlayer) {
    if (hit.alphaMul > 1 && state.hp >= state.maxHp - 0.5) amt *= hit.alphaMul;            // MARKSMAN — alpha strike on a healthy target
    if (hit.comboDmg) amt *= 1 + Math.min(0.3, (hit.combo || 0) * hit.comboDmg);           // RHYTHM OF WAR — combo feeds damage, capped at +30%
    if (hit.critChance && (hit.rand || 0) < hit.critChance) { amt *= hit.critMul; crit = true; }   // CRITICAL OPTICS
  }
  let hp = state.hp - amt;
  let playerDmg = state.playerDmg || 0;
  let rp = 0;
  if (byPlayer) { playerDmg += amt; rp = amt * (hit.tpDmg || 0) * (hit.rpMul || 1); }      // RP from damage YOU deal
  // EXECUTIONER — finish a wounded non-boss outright
  let executed = false;
  if (byPlayer && hit.execThresh && state.type !== 'boss' && hp > 0 && hp <= state.maxHp * hit.execThresh) {
    hp = 0; executed = true;
  }
  const hpDelta = state.hp - hp;
  return { amt, crit, hp, hpDelta, died: hp <= 0, executed, playerDmg, rp };
}

/* ---------------- boss-rush core (F15) ---------------- */
// The fixed boss gauntlet, flown in order. Each entry is the boss type spawned for that leg
// (all reuse the F4 multi-phase 'boss' enemy). Length defines the sequence; index 0 spawns first.
const BOSS_RUSH_POOL = ['boss', 'boss', 'boss', 'boss', 'boss'];
const BOSS_RUSH_TOTAL = BOSS_RUSH_POOL.length;   // bosses to clear for a full run
// PURE — the boss type to spawn for leg `index` (0-based), or null once the gauntlet is done.
// Out-of-range / negative indices return null (no spawn). Monotone: index past the end yields null.
function bossRushNext(index) {
  if (index < 0 || index >= BOSS_RUSH_POOL.length) return null;
  return BOSS_RUSH_POOL[index];
}
// PURE — the run is complete once `killed` bosses reaches the total. Saturating (>= guards overshoot).
function bossRushDone(killed, total) {
  return killed >= total;
}
// PURE — keep the better (lower) of two run times in seconds. 0/undefined means "no record yet",
// so the first finish always wins; thereafter only a strictly faster time replaces the record.
function betterTime(prev, next) {
  if (!(next > 0)) return prev > 0 ? prev : 0;     // invalid new time: keep the old record (or 0)
  if (!(prev > 0)) return next;                    // no prior record: the new time is the record
  return next < prev ? next : prev;                // otherwise keep the smaller
}

/* ---------------- first-run tutorial step machine (F5) ---------------- */
// Steps gate on player actions, in order:
//   0 = pitch, 1 = throttle (>0.6), 2 = guns fired, 3 = missile (lock + fire), 4 = DONE.
// Each step's REQUIRED event advances it by one; the 'skip' event jumps straight to DONE
// from any step. Pure + monotonic: an event that does not match the current step is ignored,
// the step index never decreases, and DONE (5) is a terminal absorbing state.
const TUTORIAL_STEPS = ['pitch', 'throttle', 'guns', 'missile', 'roll'];
const TUTORIAL_DONE = TUTORIAL_STEPS.length;   // 5
// the event that satisfies each step, by step index
const TUTORIAL_EVENT_FOR_STEP = ['pitched', 'throttled', 'fired', 'missile', 'rolled'];
// PURE — given the current step and an input event, return the next step (0..TUTORIAL_DONE).
// Never regresses; only the current step's matching event (or 'skip') advances it.
function tutorialNext(step, event) {
  if (step >= TUTORIAL_DONE) return TUTORIAL_DONE;        // terminal: stay done
  if (event === 'skip') return TUTORIAL_DONE;             // skip finishes from anywhere
  if (event === TUTORIAL_EVENT_FOR_STEP[step]) return step + 1;   // matching action advances one
  return step;                                           // anything else: no change
}

/* ---------------- daily-challenge core (F7) ---------------- */
// PURE — seeded PRNG (mulberry32). makeRng(seed) returns a function that yields a deterministic
// stream of floats in [0,1); the same seed always produces the same sequence. Same hash style as
// rollWeather (32-bit Math.imul mixing), but stateful so the layout/weather/restriction can each
// pull successive draws from one daily seed.
function makeRng(seed) {
  let a = (seed | 0) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// PURE — stable integer seed for a calendar date. Distinct (y,m,d) triples map to distinct seeds.
// NEVER reads the clock — the caller reads the date once at the browser runtime and passes y/m/d in.
// Mixes the packed date through the same splitmix-style avalanche rollWeather uses.
function dailySeedFor(y, m, d) {
  let x = (((y | 0) * 12 + ((m | 0) - 1)) * 31 + ((d | 0) - 1)) | 0;
  x = (x ^ 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

/* ---------------- camera-shake core (F1) ---------------- */
const CAMSHAKE_RATE = 6;   // shake units lost per second
const CAMSHAKE_K    = 1.2; // world-unit scale at camShake == 1
// PURE — returns max(0, v - dt * CAMSHAKE_RATE). (Live camShake / shakeCam live in globals.js.)
function decayShake(v, dt) { return Math.max(0, v - dt * CAMSHAKE_RATE); }

/* ---------------- AWACS support-call core (F10) ---------------- */
// AWACS calls are COOLDOWN-GATED, not RP-costed (balance pass 2026-06: they used to draw from
// player.tp, the same pool as the permanent TECH_TREE, so spending on a one-shot call was never
// rational vs. a compounding upgrade — the whole feature was economically dead. Decoupling from RP
// revives it without new HUD chrome.) AWACS_COOLDOWNS = seconds between successive calls of a key;
// AWACS_USES_MAX = the unchanged hard cap on how many times each may be called per sector.
const AWACS_COOLDOWNS = { strike: 30, resupply: 26, jam: 18 };
const AWACS_USES_MAX  = { strike: 1,   resupply: 1,  jam: 2 };
const AWACS_JAM_TIME  = 8;   // seconds enemy missiles stay blinded by a jamming call
// PURE resolver: given a snapshot {uses:{strike,resupply,jam}, last:{...}}, the cooldown+cap tables,
// a call key, and the current time `now` (seconds), returns a NEW snapshot. ok=false (state
// unchanged) when the call is unknown, capped out, or still on cooldown. reason:
//   'unknown' | 'empty' (no uses left this sector) | 'cooldown' (called too recently) | 'ok'.
// `last` is the per-key timestamp of the last SUCCESSFUL call (or a missing/<=0 sentinel = never).
function awacsCall(state, cd, max, key, now) {
  const cool = cd[key], cap = max[key];
  const last = state.last || {};
  if (cool === undefined || cap === undefined) return { ok: false, reason: 'unknown', uses: state.uses, last };
  const used = state.uses[key] || 0;
  if (used >= cap) return { ok: false, reason: 'empty', uses: state.uses, last };
  const prev = last[key];
  if (prev !== undefined && prev > 0 && (now - prev) < cool) return { ok: false, reason: 'cooldown', uses: state.uses, last };
  const uses = { strike: state.uses.strike || 0, resupply: state.uses.resupply || 0, jam: state.uses.jam || 0 };
  const nextLast = { strike: last.strike || 0, resupply: last.resupply || 0, jam: last.jam || 0 };
  uses[key] = used + 1;
  nextLast[key] = now;
  return { ok: true, reason: 'ok', uses: uses, last: nextLast };
}
// AWACS effect/banner table — which outcome a SUCCESSFUL call applies, and its banner i18n key.
const AWACS_EFFECTS = { strike: 'awacs.strike', resupply: 'awacs.resupply', jam: 'awacs.jam' };
// PURE adapter decision: wrap awacsCall, then attach what combat.js must imperatively do. On success
// `effect` is the call key (strike/resupply/jam) and `banner` its success message; combat.js commits
// {uses, last} and applies `effect`. On failure `effect` is null and `banner` is the failure message
// key (cooldown / empty; null for an unknown key → caller plays a neutral ui sound). The ENTIRE
// "which message, which effect, allowed?" decision lives here (tested); combat.js only mutates game
// state + plays SFX.
function awacsResolve(state, cd, max, key, now) {
  const r = awacsCall(state, cd, max, key, now);
  if (!r.ok) {
    const banner = r.reason === 'cooldown' ? 'awacs.cooldown' : r.reason === 'empty' ? 'awacs.empty' : null;
    return { ok: false, reason: r.reason, uses: r.uses, last: r.last, effect: null, banner };
  }
  return { ok: true, reason: 'ok', uses: r.uses, last: r.last, effect: key, banner: AWACS_EFFECTS[key] };
}

/* ---------------- tech-screen cadence core (balance pass 2026-06) ---------------- */
// The R&D shop used to open after EVERY wave (flow-killing full-screen modal every ~60-90s, and each
// buy was low-stakes because RP arrived in a trickle every wave). It now opens on a CADENCE: skip
// wave 1 entirely (pure-flight opener), then every 2nd wave AND always after any wave that contained
// a boss. RP banks naturally between visits (player.tp persists), so each shop visit funds a bigger,
// more deliberate purchase. PURE — `wasBoss` = the just-cleared wave contained a boss.
function shouldOpenTechScreen(wave, wasBoss) {
  if (wave < 2) return false;            // first wave is pure flight — no shop interruption
  if (wasBoss) return true;              // always restock after a boss fight
  return wave % 2 === 0;                 // otherwise every second wave
}

/* ---------------- wave/boss cadence + density core (balance pass 2026-06) ---------------- */
// Boss cadence used to be a hard metronome (`wave % 4 === 0`) — fully predictable, so the player
// could autopilot the calm waves and brace for the known boss wave. These helpers replace it with a
// windowed schedule: after each boss, the NEXT boss is rolled 3-5 waves out, so the player can never
// be certain which wave spikes. Enemy density used to cap at 10 (hit by ~wave 7, flat forever after);
// the cap is lifted to 16 (distant-enemy culling already exists, GFX_CULL_*/cullDistantEnemies).
const BOSS_WINDOW_MIN = 3;   // soonest the next boss can arrive after the previous one
const BOSS_WINDOW_MAX = 5;   // latest the next boss can arrive
const WAVE_COUNT_CAP  = 16;  // hard ceiling on simultaneous queued fighters (was 10)
// PURE — gap (in waves) until the next boss. Rolled once per boss kill/spawn so cadence stays varied.
// rng() ∈ [0,1). Inclusive integer in [BOSS_WINDOW_MIN, BOSS_WINDOW_MAX].
function nextBossOffset(rng) {
  const span = BOSS_WINDOW_MAX - BOSS_WINDOW_MIN + 1;
  return BOSS_WINDOW_MIN + Math.floor(rng() * span);
}
// PURE — is THIS wave a boss wave, given the wave number the next boss is scheduled for? The schedule
// is seeded the first time the player reaches the window (caller initializes bossWaveNext).
function isBossWave(wave, bossWaveNext) { return wave >= bossWaveNext; }
// PURE — fighters to queue this wave. Same growth as before (3 + wave + difficulty delta) but clamped
// to WAVE_COUNT_CAP instead of 10, so density keeps escalating past the old wave-7 plateau.
function waveCount(wave, diffDelta, cap) {
  return clamp(3 + wave + diffDelta, 2, (cap === undefined ? WAVE_COUNT_CAP : cap));
}
// PURE — occasional non-boss "wildcard spike" wave: a denser-than-usual swarm to break the rhythm
// WITHOUT a boss. Only on non-boss combat waves from wave 5 on; roll ∈ [0,1). Kept rare (≈18%) so the
// pacing stays readable, not chaotic.
function isWildcardWave(wave, isBoss, roll) {
  return !isBoss && wave >= 5 && roll < 0.18;
}
// PURE — decide the WHOLE "what is this wave" question up front, returning ONE plain manifest so main.js
// nextWave shrinks to: build inputs → composeWave → commit schedule state → enact (queue spawns/weather/banner).
// Two input shapes:
//   CAMPAIGN: { campaignPlan: <levelPlan(lvl), post-setpiece>, bossPhases, bossWaveNext } — authored + deterministic
//             (no rng); the endless boss schedule is passed straight through, untouched.
//   ENDLESS:  { wave, strike, difficulty, weatherSeed, lockWeather, weeklyAces, weeklyWavePlan, countDelta,
//             groundAllowed, bossWaveNext, rivalDue, rng } — rng() ∈ [0,1) is drawn in the SAME order (with the
//             same randInt expansions: randInt(a,b) = a + floor(rng()·(b+1−a))) as the old inline nextWave, so
//             passing rng === Math.random consumes the global stream byte-identically.
// Mutable boss-schedule state (bossWaveNext/bossWaveActive) is IN via ctx and OUT on the manifest — never a
// side effect. The manifest carries DECISIONS only (counts + booleans + a banner enum + weather string); the
// impure caller owns all queueing, i18n banners and weather/TOD application.
function composeWave(ctx) {
  // ---- CAMPAIGN: a bounded, authored level. The plan already IS the wave; normalize it into a manifest. ----
  if (ctx.campaignPlan) {
    const p = ctx.campaignPlan;
    return {
      mode: 'campaign',
      objectives: (Array.isArray(p.objectives) && p.objectives.length) ? p.objectives : null,
      fighters: p.fighters, aces: p.aces, bombers: p.bombers, mission: p.mission,
      ground: !!p.ground, boss: !!p.boss,
      bossPhases: p.boss ? (ctx.bossPhases || null) : null,
      hostileAce: !!p.hostileAce,
      weather: p.weather || 'clear', tod: p.tod || 0,
      bossWaveNext: ctx.bossWaveNext, bossWaveActive: !!p.boss,   // schedule untouched in campaign
    };
  }
  // ---- ENDLESS ----
  const rng = ctx.rng, wave = ctx.wave;
  let weather = rollWeather(ctx.weatherSeed + wave);
  if (ctx.lockWeather) weather = ctx.lockWeather;   // F8 weekly: a lockWeather modifier pins the sky every wave
  // STRIKE wave: escort + strike site, never a boss, consumes NO rng and leaves the boss schedule alone.
  if (ctx.strike) {
    return {
      mode: 'endless', strike: true, weather,
      fighters: 3, formation: null, boss: false, wildcard: false,
      aces: 0, bomber: false, droneSwarm: 0, ground: 0, rival: false,
      banner: 'strike', strikeSite: true,
      bossWaveNext: ctx.bossWaveNext, bossWaveActive: false,
    };
  }
  // Windowed boss schedule: seed if uninitialized, fire once wave reaches the mark, reschedule off a boss wave.
  let bossWaveNext = ctx.bossWaveNext;
  if (bossWaveNext < BOSS_WINDOW_MIN) bossWaveNext = BOSS_WINDOW_MIN + Math.floor(rng() * (BOSS_WINDOW_MAX - BOSS_WINDOW_MIN + 1));
  const boss = isBossWave(wave, bossWaveNext);
  if (boss) bossWaveNext = wave + nextBossOffset(rng);
  // occasional non-boss "wildcard spike" (always rolls one rng)
  const wildcard = isWildcardWave(wave, boss, rng());
  // fighter count: base density, + wildcard bump (randInt(2,4)); a weekly wave-plan row then overrides both.
  let count = waveCount(wave, ctx.countDelta, WAVE_COUNT_CAP);
  if (wildcard) count = Math.min(WAVE_COUNT_CAP, count + (2 + Math.floor(rng() * 3)));
  const wrow = (ctx.weeklyWavePlan && wave <= ctx.weeklyWavePlan.pattern.length) ? ctx.weeklyWavePlan.pattern[wave - 1] : null;
  if (wrow) count = wrow.n;
  // aces: base roll (wave≥3, non-boss) + wildcard bonus + weekly extra-ace COUNT — all push the same spawnAce,
  // so collapsing three consecutive pushes into one count is order-preserving.
  let aces = 0;
  if (wave >= 3 && !boss && rng() < (0.45 + ctx.difficulty * 0.12)) aces++;
  if (wildcard) aces++;
  if (ctx.weeklyAces && !boss) aces += ctx.weeklyAces;
  // bomber / drone-swarm / ground rolls (same order + randInt(3,4)/randInt(1,2) expansions as inline nextWave)
  const bomber = wave >= 4 && !boss && rng() < 0.32;
  let droneSwarm = 0;
  if (wave >= 3 && !boss && rng() < 0.5) droneSwarm = (3 + Math.floor(rng() * 2)) + Math.floor(wave / 4);
  const ground = ctx.groundAllowed ? (1 + Math.floor(rng() * 2)) : 0;
  return {
    mode: 'endless', strike: false, weather,
    fighters: count, formation: wrow ? (wrow.formation || null) : null,
    boss, wildcard, aces, bomber, droneSwarm, ground, rival: !!ctx.rivalDue,
    banner: boss ? 'boss' : (wildcard ? 'wildcard' : 'wave'), strikeSite: false,
    bossWaveNext, bossWaveActive: boss,
  };
}
// PURE — how many queued spawns to BUILD this frame: clamp the per-frame budget to what's actually queued.
// The FIFO drain + closure invocation stay impure in main.js processSpawnQueue; this is the decision slice.
function spawnDrainCount(queueLength, perFrame) {
  return Math.max(0, Math.min(perFrame, queueLength));
}

/* ---------------- barrel-roll pure helpers (F-barrel) ---------------- */
// Returns true if the gap between now and lastTapTime is within threshold (double-tap detected).
// gap must be > 0 (can't double-tap at identical timestamps) and <= threshold.
function rollDetect(now, lastTapTime, threshold) {
  const gap = now - lastTapTime;
  return gap > 0 && gap <= threshold;
}
// Returns true if cooldown has elapsed (or was never started), meaning a new barrel roll is allowed.
function rollCooldownGate(cooldown) {
  return cooldown <= 0;
}

/* ---------------- steering core ---------------- */
// steering tunables (combat.js reads these). pointer maxBank ≈ 80°; 'auto' banks gently
// (autoMaxBank ≈ 29°) and turns via a world-yaw ∝ sin(bank)*autoYawGain applied in combat.js.
const STEER = { maxBank: 1.4, bankGain: 2.4, autoLevelGain: 1.6, deadzone: 0.06, autoMaxBank: 0.5, autoYawGain: 1.6 };
// PURE — map normalized flight intent to the engine's pitch/roll command axes, honouring the control
// scheme. `intent` = { pitch, roll } in -1..1 (+pitch=climb, +roll=bank right). `currentBank` is the
// airframe's present bank angle in radians, SAME sign frame as roll intent. Returns { pitchCmd, rollCmd }.
//   'rate'    : rollCmd = roll intent (roll rate). pitchCmd = pitch intent.
//   'pointer' : rollCmd holds bank to rollIntent*maxBank; |rollIntent|<deadzone auto-levels to wings-level.
//   'auto'    : same pitch/roll mapping as pointer but a SMALLER bank cap (autoMaxBank); the turn is a
//               world-axis yaw applied in combat.js, kept OUT of pitch so you can dive while turning.
function steerCommand(scheme, intent, currentBank, t) {
  const pitchCmd = intent.pitch;
  if (scheme !== 'pointer' && scheme !== 'auto') return { pitchCmd, rollCmd: intent.roll };   // 'rate' (classic) — byte-identical mapping
  const cb = currentBank || 0;
  const mb = (scheme === 'auto') ? t.autoMaxBank : t.maxBank;   // 'auto' banks gently; heading turns via world-yaw in combat.js
  let rollCmd;
  if (Math.abs(intent.roll) < t.deadzone) {
    rollCmd = clamp(-cb * t.autoLevelGain / mb, -1, 1);           // wings-level seek when stick released
  } else {
    const targetBank = intent.roll * mb;
    rollCmd = clamp(t.bankGain * (targetBank - cb) / mb, -1, 1);  // proportional bank-hold
  }
  return { pitchCmd, rollCmd };
}

/* ---------------- aim-assist core ---------------- */
// AIM ASSIST tunables (combat.js reads these; the THREE geometry/quaternion glue lives there).
//   range   : world units — beyond this the assist is inert.
//   cone    : radians — the DETECTION RADIUS: the angular field where pulling begins. Outside it the
//             player flies free (a wider error is the player deliberately pointing elsewhere). The
//             aimStrength slider scales this field up; range scales with it.
//   gain    : legacy proportional coefficient — kept for back-compat (monotonic w/ strength). NOT used
//             by the magnet curve below; the pull shape is now driven by maxRate (the max force).
//   maxRate : radians/second — the MAX pull force, reached at angErr≈0. Scales PROPORTIONALLY with the
//             field/radius (bigger field = stronger snap), and is still the hard per-frame rate cap.
// 5 strength presets, weakest -> strongest. cone (field) + maxRate (max force) scale together;
// level 5 is the "forcing" tier.
const AIM_ASSIST_LEVELS = [
  { range: 2400, cone: 0.45, gain: 1.2, maxRate: 0.6 },  // 1 — barely a nudge
  { range: 2500, cone: 0.52, gain: 2.0, maxRate: 1.0 },  // 2
  { range: 2600, cone: 0.60, gain: 3.0, maxRate: 1.8 },  // 3 — original default
  { range: 2800, cone: 0.75, gain: 4.5, maxRate: 3.0 },  // 4
  { range: 3000, cone: 1.20, gain: 9.0, maxRate: 7.0 },  // 5 — strongest / forcing
];
const AIM_ASSIST = AIM_ASSIST_LEVELS[2];   // back-compat alias (the original default)
// Magnet curve constant (rad^-2): pullForce = maxForce / (1 + AIM_MAGNET_K * angErr^2).
// Tuned so the pull collapses fast off the lead pip. Force vs. angular distance to the lead:
//   0°  -> 100%   15° -> 44.8%   30° -> 16.8%   45° -> 8.3%   (of maxForce)
// i.e. ~half force at ~15°, well below half by 30°, negligible past that.
const AIM_MAGNET_K = 18;
// PURE — clamp a 1..5 level to its config. manualOverride (player actively steering) makes the strongest
// tier yield to the player: it drops to the weakest preset so the assist only "forces" when hands-off.
function aimAssistCfg(level, manualOverride) {
  const i = Math.min(AIM_ASSIST_LEVELS.length, Math.max(1, level | 0)) - 1;
  if (manualOverride && i >= 4) return AIM_ASSIST_LEVELS[0];   // top tier releases to barely-a-nudge
  return AIM_ASSIST_LEVELS[i];
}
// PURE — radians to rotate the nose toward the gun lead point THIS frame (MAGNET curve).
// angErr = angle between boresight and the lead direction (rad); dist = range to the lead point.
// Returns 0 outside the cone (detection radius) or beyond range (player flies free). Inside the field
// the pull is an inverse-square MAGNET: max force at angErr≈0, dropping rapidly as the reticle drifts
// off the lead pip — pullForce = maxForce / (1 + AIM_MAGNET_K*angErr^2), where maxForce (cfg.maxRate)
// scales with the field/radius. Still eased out with distance, capped at maxRate*dt, and clamped to
// angErr so even at max force it can never spin past the lead.
function aimAssistStep(angErr, dist, dt, cfg) {
  cfg = cfg || AIM_ASSIST;
  if (!(dt > 0) || !(dist > 0) || dist > cfg.range) return 0;
  if (!(angErr > 1e-4) || angErr > cfg.cone) return 0;
  const falloff = 1 - dist / cfg.range;                      // stronger up close, fades to 0 at max range
  const pullForce = cfg.maxRate / (1 + AIM_MAGNET_K * angErr * angErr);  // inverse-square magnet toward the lead
  const step = pullForce * falloff * dt;
  return Math.min(step, cfg.maxRate * dt, angErr);           // rate-capped; never past the lead
}

/* ---------------- graphics-quality core (F11) ---------------- */
const GFX_TIERS = ['auto', 'low', 'medium', 'high'];
// PURE — resolve the effective render tier ('low'|'medium'|'high') from the gfxQuality setting plus a
// cheap device heuristic. Explicit 'low'/'medium'/'high' pass through; 'auto' (and any unknown value)
// picks 'medium' for ANY touch device (Track B target: mobile → MEDIUM, a behaviour change from the old
// touch→low), else 'high' for desktop/non-touch. A user who wants the cheapest path selects 'low'
// manually. The fps sample (which headless cannot measure) may layer an auto→low downgrade on at the
// impure call site (refreshGfxTier in globals.js).
function resolveQuality(setting, dpr, isTouch) {
  if (setting === 'low' || setting === 'medium' || setting === 'high') return setting;
  return isTouch ? 'medium' : 'high';   // auto/unknown: touch → medium, desktop → high
}

/* ---------------- environment tier config (Track B terrain/sea/fog/ground tiers) ---------------- */
// PURE per-tier knobs. SIZE stays constant; SEG drives (SEG+1)^2 verts / 2*SEG^2 tris. LOW is the
// current shipping geometry (byte-for-byte: terrain SEG 220 no detail, sea SEG 200). These tables are
// the single source of truth read by engine.js buildTerrain / buildScenery, and unit-tested here.
const TERRAIN_TIER = {
  low:    { seg: 220, detailAmp: 0,  detailOct: 0 },   // current look — no visual detail layer
  medium: { seg: 300, detailAmp: 28, detailOct: 2 },
  high:   { seg: 400, detailAmp: 60, detailOct: 3 },
};
const SEA_TIER = {
  low:    { seg: 200, waveOct: 3, normOct: 0, foam: 0, reflect: 0 },   // current shader
  medium: { seg: 220, waveOct: 4, normOct: 1, foam: 0, reflect: 0 },
  high:   { seg: 256, waveOct: 5, normOct: 2, foam: 1, reflect: 1 },
};
// PURE — tier-only VISUAL terrain displacement, layered on top of terrainH (which is NEVER scaled per
// tier — gameplay/shadow/ground-object-Y read terrainH unchanged). Higher-frequency fbm-ish rock/ridge
// break-up. Amplitude is the tier knob (cfg.detailAmp); cfg.detailOct octaves. Returns 0 on LOW (or any
// tier with detailAmp<=0). Deterministic (no RNG) so the build is reproducible. Bounded by detailAmp so
// objects placed from the unmodified terrainH never visibly float more than ~detailAmp units.
function terrainDetailH(x, z, cfg) {
  if (!cfg || !(cfg.detailAmp > 0) || !(cfg.detailOct > 0)) return 0;
  let h = 0, amp = 1, ampSum = 0, fx = 0.0034, fz = 0.0029;
  for (let o = 0; o < cfg.detailOct; o++) {
    h += amp * Math.sin(x * fx + o * 1.7) * Math.cos(z * fz + o * 0.9);
    ampSum += amp;
    amp *= 0.5; fx *= 2.13; fz *= 2.07;
  }
  return (h / ampSum) * cfg.detailAmp;   // normalized to [-detailAmp, +detailAmp]
}

/* ---------------- ground objects (Track B §4, NET-NEW) ---------------- */
// Per-tier SPAWN CAPS (hard ceilings the planner never exceeds, even with placement retries). LOW
// spawns nothing. MEDIUM: sparse rocks + occasional trees. HIGH: forests/buildings/roads/rocks.
const GROUNDOBJ_TIER = {
  low:    { rocks: 0,    trees: 0,    buildings: 0,   roads: 0 },
  medium: { rocks: 600,  trees: 250,  buildings: 0,   roads: 0 },
  high:   { rocks: 1400, trees: 1200, buildings: 350, roads: 8 },
};
const GROUNDOBJ_RADIUS = 12000;     // placement horizon (objects beyond the fog/cull horizon are wasted)
const GROUNDOBJ_WATER_MARGIN = 4;   // trees/buildings reject terrainH < this (sea ≈ 0); rocks reject < 0
const GROUNDOBJ_PLATFORM_CLEAR = 600;   // reject within this of the spawn platform (origin)
const GROUNDOBJ_BUILD_MAX_SLOPE = 0.35; // reject buildings on faces steeper than this (central-diff slope)
// PURE — deterministic ground-object placement plan from a seed + tier. `terrainHFn(x,z)` is INJECTED
// (core.js stays THREE/engine-free) so Y comes from the gameplay surface (assumption A1), NOT the visual
// detail layer. Returns an array of { type:'rock'|'tree'|'building'|'road', x, z, rot, scale } with EXACT
// per-type counts capped at GROUNDOBJ_TIER[tier]. Rules (§4.3): water rejection, building slope rejection,
// radial density falloff (denser near origin), platform exclusion. Same seed+tier+terrainHFn → same plan
// (test-reproducible). Bounded retry budget per object so a hostile heightfield can't loop forever (the
// per-type result may fall short of the cap if placement keeps failing — caps are ceilings, not quotas).
function planGroundObjects(seed, tier, terrainHFn) {
  const caps = GROUNDOBJ_TIER[tier] || GROUNDOBJ_TIER.low;
  const out = [];
  if (typeof terrainHFn !== 'function') return out;
  const rng = makeRng(seed);
  const R = GROUNDOBJ_RADIUS, platSq = GROUNDOBJ_PLATFORM_CLEAR * GROUNDOBJ_PLATFORM_CLEAR, E = 14;
  // radial-falloff sampler: bias toward origin, accept by p = 1 - clamp(r/R)*0.6 (§4.3).
  function place(type, count, minH, slopeCap) {
    let made = 0, tries = 0, budget = count * 12 + 64;
    while (made < count && tries < budget) {
      tries++;
      // sqrt() radius would be uniform-in-area; bias toward center by NOT sqrt-ing (denser near origin)
      const ang = rng() * TWO_PI, rad = rng() * R;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (x * x + z * z < platSq) continue;                 // platform / runway exclusion
      const h = terrainHFn(x, z);
      if (h < minH) continue;                               // water margin
      if (1 - clamp(rad / R, 0, 1) * 0.6 < rng()) continue; // radial density falloff
      if (slopeCap != null) {                               // building slope rejection (central diff)
        const dhx = (terrainHFn(x + E, z) - terrainHFn(x - E, z)) / (2 * E);
        const dhz = (terrainHFn(x, z + E) - terrainHFn(x, z - E)) / (2 * E);
        if (Math.hypot(dhx, dhz) > slopeCap) continue;
      }
      out.push({ type: type, x: x, z: z, rot: rng() * TWO_PI, scale: 0.7 + rng() * 0.9 });
      made++;
    }
  }
  place('rock', caps.rocks, 0, null);                                  // beach rocks allowed down to h>=0
  place('tree', caps.trees, GROUNDOBJ_WATER_MARGIN, null);
  place('building', caps.buildings, GROUNDOBJ_WATER_MARGIN, GROUNDOBJ_BUILD_MAX_SLOPE);
  // roads: short straight ribbons; one record per road, the builder lays its strip. Reuse same gates.
  place('road', caps.roads, GROUNDOBJ_WATER_MARGIN, GROUNDOBJ_BUILD_MAX_SLOPE);
  return out;
}

/* ---------------- pure input shaping (controls.js seam) ---------------- */
// dead-zone -> renormalize -> expo blend (linear<->cubic) -> clamp; sign-preserving.
function shapeAxis(v, opts) {
  const dz = (opts && opts.deadzone) || 0;
  const ex = (opts && opts.expo) || 0;
  const a = Math.abs(v);
  if (a <= dz) return 0;
  const n = (a - dz) / (1 - dz);
  const curved = (1 - ex) * n + ex * n * n * n;
  return clamp(Math.sign(v) * curved, -1, 1);
}
// per-aggression motion tuning. Invariants (asserted in tests):
//   deadzone: casual > balanced > direct ; sens: direct > balanced > casual.
const AGGRESSION = {
  casual:   { deadzone: 0.18, expo: 0.55, sens: 0.75, maxAngle: 45, autoLevel: 2.2, pitchClamp: 0.70 },
  balanced: { deadzone: 0.10, expo: 0.35, sens: 1.00, maxAngle: 35, autoLevel: 1.2, pitchClamp: 0.85 },
  direct:   { deadzone: 0.05, expo: 0.15, sens: 1.35, maxAngle: 28, autoLevel: 0.4, pitchClamp: 1.00 },
};
// shape a raw analog axis (touch or tilt) into a flight axis: curve -> sens -> clamp -> invert.
function mapFlightInput(raw, preset, invert) {
  let v = shapeAxis(raw, preset) * (preset && preset.sens != null ? preset.sens : 1);
  v = clamp(v, -1, 1);
  return invert ? -v : v;
}
// motion recenter: tilt relative to the captured neutral offset, normalized by maxAngle.
function motionAxis(angle, offset, maxAngle) {
  return clamp((angle - offset) / maxAngle, -1, 1);
}
// EMA low-pass: pull prev toward next by alpha (0..1). Higher alpha = snappier, less smooth.
function emaSmooth(prev, next, alpha) { return prev + alpha * (next - prev); }

// "being locked by enemy" threat test: is this enemy a real gun threat to the player THIS frame?
// Mirrors the gun-fire gate's geometry (within the gun cone AND inside gun range) plus the same
// gating the AI already respects: it must be engaging and able to see the player. Pure so the rule
// is testable; updateEnemy calls it with the live ang/dist/cone/range it already computes.
function enemyIsAimingPlayer(o) {
  return !!(o && o.engaged && o.canSee && o.ang < o.gunCone && o.dist < o.gunRange);
}

/* ---------------- fighter archetypes (feature 2026-06: AI threat variety) ----------------
   Replaces the single ~40% `aggressive` temperament with distinct, READABLE behavioral roles
   so dogfights stop feeling same-y and the player must recognize + counter different threats.
   PURE selection here; the imperative steering (lateral jukes, proactive flares, flank offsets)
   stays in entities.js updateEnemy, gated on `e.archetype`. 'duelist' is byte-for-byte the old
   behavior (existing `aggressive` sub-roll still applies), so early waves are unchanged in feel. */
const ARCHETYPES = ['duelist', 'baiter', 'decoy', 'pincer'];
// Weighted picker. duelist dominates early; baiter/decoy/pincer ramp in with wave so the opener
// stays a clean dogfight and exotic threats appear as the run heats up. Elites/aces bias exotic
// (their extra menace IS the gimmick) but never to zero duelists. `rng` is a 0..1 source (testable).
function pickArchetype(rng, wave, opts) {
  opts = opts || {};
  const w = Math.max(0, wave || 0);
  // exotic share climbs from ~0 at wave 1 toward a cap; elites get a flat bump on top.
  let exotic = Math.min(0.5, 0.04 * Math.max(0, w - 1));   // wave 1 → 0, ramps ~+4%/wave, capped 50%
  if (opts.elite) exotic = Math.min(0.7, exotic + 0.25);   // aces/elites lean exotic, still ≤70%
  const r = rng();
  if (r >= exotic) return 'duelist';                       // the dominant baseline
  // split the exotic slice across the three gimmick roles (even thirds within the slice)
  const k = exotic > 0 ? (r / exotic) : 0;
  if (k < 1 / 3) return 'baiter';
  if (k < 2 / 3) return 'decoy';
  return 'pincer';
}
// baiter jink gate: juke hard ONLY while the player is actively locking THIS enemy AND the jink
// cooldown has elapsed. Pure so the trigger rule is testable; updateEnemy supplies live lock state.
function shouldJink(o) {
  return !!(o && o.lockedByPlayer && (o.jinkCd == null || o.jinkCd <= 0));
}
// pincer partner sign: the flanking partner orbits the OPPOSITE way so the pair brackets the player
// from two sides. Defaults a missing/zero self-sign to +1 → partner -1.
function pincerSign(selfSign) {
  return (selfSign < 0) ? 1 : -1;
}

/* ---------------- 2nd SPECIAL slot (feature #3) ----------------
   Pure helpers for the equippable secondary special. The EFFECT (THREE/spawn/DOM) stays in
   combat.js `applySpecialEffect`; only the data logic — which abilities can be equipped, and the
   cooldown-ready gate — lives here so it is require-safe + testable. */

// equippableSpecials(unlockedJetIds, jetsRoster, currentJetId) → [{id, name}]
// The pool of abilities the player may equip into SLOT 2: every jet they have UNLOCKED that
// carries a real ability (FT-1's null ability is excluded), MINUS the currently-flown jet (its own
// ability is already slot 1, so re-equipping it would be a redundant duplicate). Order follows the
// roster. `unlockedJetIds` may be an array OR a {id:true} map; both are accepted.
function equippableSpecials(unlockedJetIds, jetsRoster, currentJetId) {
  const has = Array.isArray(unlockedJetIds)
    ? (id => unlockedJetIds.indexOf(id) !== -1)
    : (id => !!(unlockedJetIds && unlockedJetIds[id]));
  const out = [];
  const roster = jetsRoster || [];
  for (let i = 0; i < roster.length; i++) {
    const j = roster[i];
    if (!j || !j.ability) continue;          // skip the FT-1 null ability (and any future ability-less jet)
    if (j.id === currentJetId) continue;      // skip the native jet — that ability is slot 1
    if (!has(j.id)) continue;                 // skip jets the player has not unlocked
    out.push({ id: j.id, name: j.ability });
  }
  return out;
}

// isEquippableSpecial(id, unlockedJetIds, jetsRoster, currentJetId) → bool
// True iff `id` is a currently-valid slot-2 choice (in the equippable pool). Used to reject a stale
// saved equip (e.g. a jet that is no longer unlocked, or the now-current jet) and clear the slot.
function isEquippableSpecial(id, unlockedJetIds, jetsRoster, currentJetId) {
  if (!id) return false;
  const pool = equippableSpecials(unlockedJetIds, jetsRoster, currentJetId);
  for (let i = 0; i < pool.length; i++) if (pool[i].id === id) return true;
  return false;
}

// specialCooldownMax(id, cdTable, fallback) → seconds. Raw per-id recharge time for a slot, read
// from the SPECIAL_CD table. No tech mods here (OVERCLOCK/GHOST apply to slot 1 only, in globals).
function specialCooldownMax(id, cdTable, fallback) {
  const fb = (typeof fallback === 'number') ? fallback : 15;
  if (!id || !cdTable) return fb;
  const v = cdTable[id];
  return (typeof v === 'number' && v > 0) ? v : fb;
}

// specialSlotReady(slot) → bool. A slot can fire iff it holds an ability (id truthy) and its
// cooldown has fully recharged (cd <= 0). An empty/unequipped slot is never ready (inert).
function specialSlotReady(slot) {
  return !!(slot && slot.id && slot.cd <= 0);
}

/* ---------------- FRONTIER DRAFT (feature 4) ----------------
   Pure draft-pick logic for the R&D tech tree. The full tree stays visible/planned; each shop visit
   only a few of the player's currently-unlockable FRONTIER nodes are OFFERED as buyable. Eligibility
   is INJECTED (owns/reqSatisfied/applicable fns + data) so this stays DOM/THREE-free + require-safe.
   `tests/draft.test.js` exercises these directly. */

const DRAFT_OFFER_N = 3;        // how many frontier nodes are offered per visit
const DRAFT_PITY_THRESHOLD = 3; // a frontier node skipped this many visits is force-included next offer

// reqSatisfied(node, ownsFn, byId, groundOn) — pure tech-tree prerequisite predicate (moved from ui-tech.js).
// OR-gate over node.req (string|array), AND-gate over node.reqAll, with hidden ground-node bypass when groundOn=false.
// All inputs are injected (ownsFn callback + byId lookup) so this stays require-safe; tests/ground-war.test.js imports it.
function reqSatisfied(node, ownsFn, byId, groundOn) {
  // a single prerequisite is met if it's owned — or if it's a hidden ground node,
  // in which case we look through it to its own prerequisites instead
  const met = (id) => {
    const rn = byId[id];
    if (!groundOn && rn && rn.ground) return reqSatisfied(rn, ownsFn, byId, groundOn);   // bypass hidden ground nodes
    return ownsFn(id);
  };
  if (node.reqAll && !node.reqAll.every(met)) return false;        // AND-gate: every listed node required
  const req = node.req;
  if (!req) return true;
  return Array.isArray(req) ? req.some(met) : met(req);            // OR-gate: any one parent unlocks
}

// frontierEligible(nodes, {owns, reqSatisfied, applicable}) → [ids]
// The FRONTIER = nodes whose prerequisites are satisfied, that the player does not yet own
// (repeatables are still offerable even when already taken), and that apply to this map
// (applicable() rejects na/hidden/ground-off nodes). All three predicates are injected fns.
function frontierEligible(nodes, fns) {
  const owns = (fns && fns.owns) || (() => false);
  const reqSatisfied = (fns && fns.reqSatisfied) || (() => true);
  const applicable = (fns && fns.applicable) || (() => true);
  const out = [];
  for (let i = 0; i < (nodes ? nodes.length : 0); i++) {
    const n = nodes[i];
    if (!n) continue;
    if (!applicable(n)) continue;                 // excludes na / hidden / not-this-map
    if (!n.repeat && owns(n.id)) continue;        // already owned (repeatables stay offerable)
    if (!reqSatisfied(n)) continue;               // prereqs not met yet — not on the frontier
    out.push(n.id);
  }
  return out;
}

// prereqPath(targetId, byId, owns) → [ids]  (ordered: deepest unowned prereq first → target last)
// The chain of UNOWNED prerequisite node ids leading to `target`, used to BIAS offers toward a pinned
// goal. Walks the req/reqAll graph (OR-gate: follow the first unowned parent; AND-gate: include all
// unowned parents). Returns [] if the target is already owned or unknown; includes the target itself
// (when unowned) as the final element so the path is directly offer-biasable.
function prereqPath(targetId, byId, owns) {
  if (!targetId || !byId) return [];
  const ownsFn = owns || (() => false);
  const seen = {};
  const acc = [];
  const visit = (id) => {
    if (!id || seen[id]) return;
    seen[id] = true;
    const node = byId[id];
    if (!node) return;
    if (ownsFn(id)) return;                        // owned prereqs are already satisfied — skip
    const reqAll = node.reqAll || [];
    for (let i = 0; i < reqAll.length; i++) visit(reqAll[i]);   // AND-gate: every listed parent
    const req = node.req;
    if (req) {                                     // OR-gate: take the first unowned parent's path
      const list = Array.isArray(req) ? req : [req];
      let parent = null;
      for (let i = 0; i < list.length; i++) { if (!ownsFn(list[i])) { parent = list[i]; break; } }
      if (parent) visit(parent);
    }
    acc.push(id);                                  // post-order: prereqs land before the node itself
  };
  visit(targetId);
  return acc;
}

// draftOffer({ frontier, pinPath, pity, rng, n }) → { offer:[ids], pity:{id:count} }
// Picks up to `n` ids from `frontier`: (1) force-include any frontier node whose pity counter is at or
// over DRAFT_PITY_THRESHOLD; (2) bias toward pinPath nodes that are on the frontier; (3) fill the
// remainder via seeded `rng` (deterministic for a fixed rng). Returns the chosen offer AND the updated
// pity map — offered/picked nodes reset to 0, every other frontier node increments (skipped one more
// visit). If frontier < n, the whole frontier is offered. Pure: no clock, no DOM.
function draftOffer(opts) {
  const o = opts || {};
  const frontier = (o.frontier || []).slice();
  const pinPath = o.pinPath || [];
  const pityIn = o.pity || {};
  const rng = o.rng || (() => 0);
  const n = (typeof o.n === 'number' && o.n > 0) ? o.n : DRAFT_OFFER_N;
  const inFrontier = {};
  for (let i = 0; i < frontier.length; i++) inFrontier[frontier[i]] = true;

  const offer = [];
  const taken = {};
  const take = (id) => { if (id && inFrontier[id] && !taken[id] && offer.length < n) { taken[id] = true; offer.push(id); } };

  // (1) pity-due frontier nodes are force-included first (oldest debt wins the slot)
  const due = frontier.filter(id => (pityIn[id] || 0) >= DRAFT_PITY_THRESHOLD)
                      .sort((a, b) => (pityIn[b] || 0) - (pityIn[a] || 0));
  for (let i = 0; i < due.length; i++) take(due[i]);

  // (2) bias toward the pinned goal's prereq path (path order = prereqs first)
  for (let i = 0; i < pinPath.length; i++) take(pinPath[i]);

  // (3) fill the rest by seeded shuffle of the remaining frontier (deterministic for a fixed rng)
  const rest = frontier.filter(id => !taken[id]);
  for (let i = rest.length - 1; i > 0; i--) {     // Fisher–Yates using injected rng
    const j = Math.floor(rng() * (i + 1));
    const tmp = rest[i]; rest[i] = rest[j]; rest[j] = tmp;
  }
  for (let i = 0; i < rest.length; i++) take(rest[i]);

  // pity update: offered frontier nodes reset; every other frontier node ages one more visit.
  const pityOut = {};
  for (let i = 0; i < frontier.length; i++) {
    const id = frontier[i];
    pityOut[id] = taken[id] ? 0 : (pityIn[id] || 0) + 1;
  }
  return { offer, pity: pityOut };
}

/* ---------------- non-combat mission cores (feature 2026-06: RECON + STEALTH) ----------------
   A shared waypoint primitive backs two NON-kill objectives so missions stop being all "kill things":
   RECON = fly through N waypoints; STEALTH = reach an extraction waypoint without being detected.
   PURE here (hit-test + detection math over plain {x,y,z} data); the POSITIONING of waypoints and the
   per-frame "am I firing / being aimed at" reads stay impure in missions.js. Mirrored test:
   tests/recon-stealth.test.js (imports the REAL impl below — no byte copy). */

// squared planar+vertical distance between two plain {x,y,z} points (no THREE — keep require-safe)
function _wpDist2(a, b) {
  const dx = a.x - b.x, dy = (a.y || 0) - (b.y || 0), dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

// Flip a waypoint's hit flag once the player passes within hitRadius; idempotent (a hit waypoint
// STAYS hit). Returns the same array (mutated in place) plus the running hitCount and the index of
// the next unhit waypoint (-1 when all are hit). playerPos/waypoints are plain {x,y,z[,hit]}.
function reconProgress(waypoints, playerPos, hitRadius) {
  const r2 = hitRadius * hitRadius;
  let hitCount = 0, nextIndex = -1;
  for (let i = 0; i < waypoints.length; i++) {
    const w = waypoints[i];
    if (!w.hit && _wpDist2(w, playerPos) <= r2) w.hit = true;
    if (w.hit) hitCount++;
    else if (nextIndex === -1) nextIndex = i;
  }
  return { waypoints: waypoints, hitCount: hitCount, nextIndex: nextIndex };
}

// First still-unhit waypoint (for the HUD pointer), or null when the path is complete.
function nextWaypoint(waypoints) {
  for (let i = 0; i < waypoints.length; i++) if (!waypoints[i].hit) return waypoints[i];
  return null;
}

// Detection-meter delta for the stealth mission. CONTRACT: returns the RAW signed delta for this
// frame — the CALLER clamps the running meter to 0..1. The meter is PRE-DETECTION PRESSURE only,
// never a fail bar (ADR-0006): reaching 1 TRIGGERS go-loud (blowStealthCover), it does not fail.
// The meter RISES while a patrol holds the player in its scan cone with line-of-sight (cone-LOS,
// the fastest term), while inside a SAM/radar/patrol proximity ring, or while firing/being aimed at;
// otherwise it DECAYS. Once cover is BLOWN the meter is FROZEN (delta 0) — it no longer drives
// anything (the go-loud escape is governed by reaching the waypoint alive, not the meter).
function detectionDelta(o) {
  const dt = o.dt || 0;
  const rise = (o.riseRate == null ? 1 : o.riseRate);
  const decay = (o.decayRate == null ? 1 : o.decayRate);
  // ADR-0006: post-blown the meter is inert — it stops rising AND stops decaying (frozen/capped).
  if (o.blown) return 0;
  // cone-LOS is the fast spot: a patrol looking right at you fills the meter quickest (mul scales rise)
  const coneLOS = o.coneLOS || 0;
  if (coneLOS > 0) return rise * coneLOS * (o.coneMul == null ? 1.8 : o.coneMul) * dt;
  // hard spotted — full rise: firing weapons or an enemy actively aiming at you
  if (o.firing || o.beingAimed) return rise * dt;
  // proximity to a SAM/radar/patrol detection ring scales the rise (0..1 = ring edge..centre)
  const prox = o.proximity || 0;
  if (prox > 0) return rise * prox * dt;
  return -decay * dt;
}

// Pure win/fail predicates so the resolve logic is testable without THREE/DOM.
// RECON wins when every waypoint is hit. STEALTH (ADR-0006) wins ONLY by reaching the extraction
// waypoint ALIVE — the detection meter is never a loss condition (it triggers go-loud at 1, it does
// not fail). The single stealth failure is death (HP→0), enforced by the impure caller (gameOver).
function reconWon(m) {
  const w = (m.params && m.params.waypoints) || [];
  if (!w.length) return false;
  for (let i = 0; i < w.length; i++) if (!w[i].hit) return false;
  return true;
}
// ADR-0006: the meter NEVER fails the mission. Kept as a stable predicate (always false) so existing
// callers/tests have one place that encodes "the meter is not a loss condition." Death is the only fail.
function stealthFailed(m) {
  return false;
}
function stealthWon(m) {
  return reconWon(m);   // reach the extraction waypoint (alive) — the (1-waypoint) recon path
}

/* ===================================================================
   INSTRUMENT SEAM (pure) — map raw flight values to the CSS custom-prop set the per-skin HUD
   gauges read (analog needles, blueprint dials, flat arcs, futuristic tapes, manual hatch bars).
   Mirrored by ui-hud.js updateDom; tested in tests/instruments.test.js. Angles pre-clamped here
   so the CSS only rotates. Speed full-scale = 1000 kt; altitude arc full-scale = 20000 ft.
   =================================================================== */
function instrumentState(kt, altFt, throttle) {
  kt = Math.max(0, kt | 0);
  altFt = Math.max(0, altFt | 0);
  const thr = Math.min(1, Math.max(0, +throttle || 0));
  const spdFrac = Math.min(1, kt / 1000);
  const altFrac = Math.min(1, altFt / 20000);
  return {
    spdKt: kt, altFt: altFt,
    spdFrac: spdFrac, altFrac: altFrac, thrFrac: thr,
    spdDeg: spdFrac * 240 - 120,             // airspeed dial sweep, ±120°
    thrDeg: thr * 270 - 135,                 // throttle arc, ±135°
    altDeg: (altFt % 1000) / 1000 * 360,     // altimeter hundreds hand (1 rev / 1000 ft)
    altDegK: (altFt % 10000) / 10000 * 360,  // altimeter thousands hand (1 rev / 10000 ft)
  };
}

/* Display-unit conversion for the HUD speedometer + altimeter (pure). The sim carries speed in KNOTS
   and altitude in FEET; the player picks a unit system in Settings. 'metric' => kph + metres; anything
   else (default 'imperial') => mph + ft (knots are retired from the readout per spec). Returns
   {value:rounded int, unit:'mph'|'kph'|'ft'|'m'} so the HUD writes the number + picks the label. */
const KT_TO_MPH = 1.15078, KT_TO_KPH = 1.852, FT_TO_M = 0.3048;
function speedDisplay(kt, system) {
  kt = Math.max(0, +kt || 0);
  return system === 'metric'
    ? { value: Math.round(kt * KT_TO_KPH), unit: 'kph' }
    : { value: Math.round(kt * KT_TO_MPH), unit: 'mph' };
}
function altDisplay(ft, system) {
  ft = Math.max(0, +ft || 0);
  return system === 'metric'
    ? { value: Math.round(ft * FT_TO_M), unit: 'm' }
    : { value: Math.round(ft), unit: 'ft' };
}

/* ---------------- campaign / operations cores (Operations Map revamp) ----------------
   PURE progression + bounded-level wave scaling + checkpoint snapshot/rollback for the linear
   multi-operation campaign. `campaign` is the meta.campaign progress map
   ({ [opId]: { unlocked, furthest, levels: { [levelId]:{cleared,bestScore,bestStars} } } });
   `ops` is the OPERATIONS data table, INJECTED so this file stays load-order-free + require-safe.
   The store-touching wrappers (campaignClearLevel/…) live in meta.js. */
const LEVEL_WAVE_MIN = 2;
const LEVEL_WAVE_CAP = 4;
// bounded wave bank for a level: 2 + floor(index/2), clamped [MIN, cap]. A level row's literal
// `waves` (recon/stealth=1; boss handled separately) overrides this at the call site.
function campaignWaveCount(index, cap) {
  return clamp(2 + (index >> 1), LEVEL_WAVE_MIN, cap === undefined ? LEVEL_WAVE_CAP : cap);
}
// a bounded level is done once its whole wave bank is cleared AND the typed objective (if any)
// resolved 'won'. missionDone is true for objectiveless levels.
function levelCleared(wavesCleared, totalWaves, missionDone) {
  return wavesCleared >= totalWaves && !!missionDone;
}
// internal — has a specific level been cleared in the campaign map?
function _levelIsCleared(campaign, opId, levelId) {
  const op = campaign && campaign[opId];
  return !!(op && op.levels && op.levels[levelId] && op.levels[levelId].cleared);
}
// operation unlocked iff it's the first, or the previous operation's last (boss) level is cleared.
function isOpUnlocked(campaign, ops, opId) {
  const idx = ops.findIndex(function (o) { return o.id === opId; });
  if (idx < 0) return false;            // unknown op id
  if (idx === 0) return true;           // first op always open
  const prev = ops[idx - 1];
  const last = prev.levels[prev.levels.length - 1];
  return _levelIsCleared(campaign, prev.id, last.id);
}
// level unlocked iff its op is unlocked AND (first level OR the prior level is cleared).
function isLevelUnlocked(campaign, ops, opId, levelIndex) {
  if (!isOpUnlocked(campaign, ops, opId)) return false;
  const op = ops.find(function (o) { return o.id === opId; });
  if (!op || levelIndex < 0 || levelIndex >= op.levels.length) return false;
  if (levelIndex === 0) return true;
  return _levelIsCleared(campaign, opId, op.levels[levelIndex - 1].id);
}
// 'locked' | 'unlocked' | 'cleared' for the level-map node renderer.
function levelState(campaign, ops, opId, levelIndex) {
  const op = ops.find(function (o) { return o.id === opId; });
  if (!op || levelIndex < 0 || levelIndex >= op.levels.length) return 'locked';
  if (_levelIsCleared(campaign, opId, op.levels[levelIndex].id)) return 'cleared';
  return isLevelUnlocked(campaign, ops, opId, levelIndex) ? 'unlocked' : 'locked';
}
// internal — clone one operation's progress record (plain JSON-able data).
function _cloneOpRec(rec) {
  const c = { unlocked: !!rec.unlocked, furthest: rec.furthest || 0, levels: {} };
  if (rec.levels) for (const id in rec.levels) {
    const r = rec.levels[id];
    c.levels[id] = { cleared: !!r.cleared, bestScore: r.bestScore || 0, bestStars: r.bestStars || 0 };
  }
  return c;
}
// returns a NEW campaign map with (opId, levelIndex) marked cleared, the op's `furthest` advanced,
// and bestScore/bestStars folded MONOTONICALLY. Never mutates the input; unknown op/level returns
// the input unchanged.
function markLevelCleared(campaign, ops, opId, levelIndex, score, stars, levelId) {
  const op = ops.find(function (o) { return o.id === opId; });
  if (!op) return campaign;
  const lvl = op.levels[levelIndex];
  if (!lvl) return campaign;
  const id = levelId || lvl.id;
  const next = {};
  for (const k in campaign) next[k] = _cloneOpRec(campaign[k]);
  const cur = next[opId] || { unlocked: true, furthest: 0, levels: {} };
  cur.unlocked = true;
  if (!cur.levels) cur.levels = {};
  const prev = cur.levels[id] || { cleared: false, bestScore: 0, bestStars: 0 };
  cur.levels[id] = {
    cleared: true,
    bestScore: Math.max(prev.bestScore || 0, score || 0),
    bestStars: Math.max(prev.bestStars || 0, stars || 0),
  };
  cur.furthest = Math.max(cur.furthest || 0, Math.min(levelIndex + 1, op.levels.length - 1));
  next[opId] = cur;
  return next;
}
// highest unlocked level index reached in an operation (map cursor / resume).
function furthestLevel(campaign, opId) {
  return (campaign && campaign[opId] && campaign[opId].furthest) || 0;
}
/* checkpoint snapshot/rollback (checkpoint-hybrid economy). PURE value copies — the glue
   (ui-flow.js) reads the live player, stashes the snapshot at level launch, and on death assigns
   the rollback values back + RE-DERIVES stats (commitNode mutates derived player stats in place,
   so the glue must rebuild, not just restore). Loadout rides along as an opaque copy. */
function captureSnapshot(p) {
  if (!p) return null;
  return {
    rp: p.tp || 0, score: p.score || 0,
    tech: (p.tech || []).slice(),
    techRepeat: Object.assign({}, p.techRepeat || {}),
    upgrades: (p.upgrades || []).slice(),
    loadout: Object.assign({}, p.loadout || {}),
  };
}
function rollbackSnapshot(snap) {
  if (!snap) return null;
  return {
    rp: snap.rp || 0, score: snap.score || 0,
    tech: (snap.tech || []).slice(),
    techRepeat: Object.assign({}, snap.techRepeat || {}),
    upgrades: (snap.upgrades || []).slice(),
    loadout: Object.assign({}, snap.loadout || {}),
  };
}
/* level-clear rewards. PURE. Replays re-grant by default (farmable BY DESIGN per the brief); flip
   CAMPAIGN_REPLAY_REWARDS (or pass farmable=false) to make a cleared level's replay grant nothing. */
const CAMPAIGN_REPLAY_REWARDS = true;
function grantLevelRewards(index, isBoss, alreadyCleared, farmable) {
  const farm = (farmable === undefined) ? CAMPAIGN_REPLAY_REWARDS : farmable;
  if (alreadyCleared && !farm) return { rp: 0, score: 0 };
  return { rp: 40 + 20 * index + (isBoss ? 150 : 0), score: 1000 + 500 * index + (isBoss ? 5000 : 0) };
}

/* Operations objective SEQUENCE (multi-phase levels, 2026-06). A previously-repetitive navigation
   level carries an ordered `objectives` array of phase descriptors — each a string sector type
   ('RECON'/'STRIKE'/…) OR an object { type, wp?, spawn? }. The runtime glue (missions.js) walks the
   queue: it starts phase 0 at sector launch and, when the current objective resolves 'won', advances
   to the next phase, completing the level only after the LAST phase wins. These PURE helpers own the
   queue arithmetic + descriptor normalization; the glue owns spawning/banners/callouts. */
// type list for a sequence (normalizes string OR {type,…} descriptors). [] for null/empty.
function objectiveTypes(objectives) {
  if (!Array.isArray(objectives)) return [];
  return objectives.map(function (o) { return (o && typeof o === 'object') ? o.type : o; });
}
// next phase index after a 'won' resolve, or -1 when the sequence is exhausted (level complete).
// Monotonic + bounds-safe (any index at/over the last phase -> done).
function nextObjectivePhase(idx, total) {
  return (idx + 1 < total) ? idx + 1 : -1;
}

// A ground "destroy-site" objective resolves when EITHER an endless strike-wave is active OR the
// active typed-mission is a strike. Multi-phase Operations levels run a STRIKE objective phase while
// their top-level spawn.ground is false, so the level-wide strikeWaveActive flag (set from
// plan.ground in main.js) is never set during that phase — gating site-completion on the flag alone
// hangs the level. Drive it off the live mission instead. missionType = active mission.type (or null).
function strikeSiteResolves(strikeWaveActive, missionType) {
  return !!strikeWaveActive || missionType === 'strike';
}

/* Bounded-campaign clear target (2026-06). In a BOUNDED Operations level every wave spawns the
   SAME authored air budget (main.js nextWave: plan.fighters/aces/bombers), but the single-phase
   mission's PROCEDURAL setup target grows with the wave (sweep min(4+(wave>>1),10); intercept
   wave>=8?4:3). On later waves the procedural target could EXCEED the kill-targets actually spawned
   that wave -> the wave never clears (e.g. openSkies sweep wave 2 wanted 5 kills but only 4 fighters
   spawn). The spawn budget is the source of truth: this PURE helper clamps the kill-type clear target
   to the spawned kill-count so a bounded wave is always winnable with exactly its authored budget.
   Endless mode is untouched (it never calls this — it keeps the procedural target). Non-kill verbs
   (escort/defend/recon/stealth/none/boss) carry no kill target; they pass through unchanged (null).
   Kill-count per verb mirrors what missionKill credits in the single-phase path: sweep counts EVERY
   air kill (onKill++ unconditional) so fighters+aces; intercept counts only _missionTarget bombers;
   strike is the one ground site (target 1). */
function campaignSpawnedKillCount(verb, spawn) {
  const s = spawn || {};
  if (verb === 'sweep') return (s.fighters || 0) + (s.aces || 0);
  if (verb === 'intercept') return (s.bombers || 0);
  if (verb === 'strike') return 1;   // a single strike site
  return null;                       // not a kill objective
}
// the raw per-wave procedural target the endless MISSIONS[verb].setup would assign (kept in sync
// with missions.js so core stays the single source of truth without depending on missions.js).
function campaignProceduralTarget(verb, wave) {
  if (verb === 'sweep') return Math.min(4 + (wave >> 1), 10);
  if (verb === 'intercept') return wave >= 8 ? 4 : 3;
  if (verb === 'strike') return 1;
  return null;
}
// bounded clear target for (verb, wave, authored spawn budget). For kill verbs returns
// min(procedural, spawned) — GUARANTEED <= the kill-targets that wave spawns. For non-kill verbs
// returns null (caller leaves mission.target as startMission set it).
function campaignClearTarget(verb, wave, spawn) {
  const killable = campaignSpawnedKillCount(verb, spawn);
  if (killable === null) return null;
  return Math.min(campaignProceduralTarget(verb, wave), killable);
}

/* ---------------- kill-reward / combo / killstreak cores (Candidate C) ---------------- */
// PURE owners of the RP / combo / killstreak / score math that used to be smeared across four
// call sites in combat.js (damageEnemy hit-score + killEnemy kill-score/RP + killstreak). The
// impure callers gather plain numbers, call these, and APPLY the returned values; all FX/audio/
// ammo refills stay in the caller. NO mutation of inputs, NO THREE/store/DOM.

// COMBO_TIMER: seconds the combo stays alive after a hit (combat.js used the literal 2.2).
const COMBO_TIMER = 2.2;
// KILLSTREAK_INTERVAL: a streak reward fires every Nth kill (combat.js used % 5).
const KILLSTREAK_INTERVAL = 5;

// Per-HIT reward (combat.js damageEnemy): a landed hit bumps the combo, refreshes its timer, and
// scores points scaled by the (post-increment) combo and the score multiplier. `state` carries the
// pre-hit combo; `event` carries the rounded damage dealt and the score multiplier.
//   state: { combo }
//   event: { amt, scoreMul? }
// returns: { combo, comboTimer, score } — new combo, the refreshed timer, and the score DELTA to add.
function awardHit(state, event) {
  const combo = (state.combo || 0) + 1;
  const scoreMul = event.scoreMul == null ? 1 : event.scoreMul;
  const score = Math.round(event.amt * (1 + combo * 0.05) * scoreMul);
  return { combo: combo, comboTimer: COMBO_TIMER, score: score };
}

// Per-KILL reward (combat.js killEnemy): the kill's score (base points × combo multiplier × score
// multiplier), the RP award (by source: the player, an escort CCA, or an assist), and the killstreak
// bookkeeping (increment + whether THIS kill lands on a reward interval).
//   state: { combo, killStreak }
//   event: { pts, scoreMul?, byPlayer, byCCA, tpBase, rpPerKill?, rpMul?, assistFrac?, playerDmg? }
// returns: { score, rp, killStreak, streakReward }
//   - score        : score DELTA to add
//   - rp           : RP (player.tp) DELTA to add for this kill
//   - killStreak   : new killstreak count
//   - streakReward : true if this kill hits a KILLSTREAK_INTERVAL boundary (caller fires the bonus)
function awardKill(state, event) {
  const combo = state.combo || 0;
  const scoreMul = event.scoreMul == null ? 1 : event.scoreMul;
  const score = Math.round(event.pts * (1 + combo * 0.1) * scoreMul);

  const rpm = event.rpMul == null ? 1 : event.rpMul;
  const tpBase = event.tpBase || 0;
  let rp = 0;
  if (event.byPlayer) rp = (tpBase + (event.rpPerKill || 0)) * rpm;
  else if (event.byCCA) rp = tpBase * 0.5 * rpm;
  else if ((event.playerDmg || 0) > 0.5) rp = tpBase * (event.assistFrac || 0) * rpm;

  const killStreak = (state.killStreak || 0) + 1;
  const streakReward = killStreak > 0 && killStreak % KILLSTREAK_INTERVAL === 0;
  return { score: score, rp: rp, killStreak: killStreak, streakReward: streakReward };
}

/* ---- Lock-on / targeting cores (Candidate B) -----------------------
   The two-stage lock state machine (acquire candidate -> advance progress -> promote to locked)
   has its PURE progress arithmetic + clear-on-death rule here; the impure caller (combat.js /
   entities.js) does the THREE geometry (cone/range) and feeds plain scalars/booleans in.

   advanceLock(lock, sample):
     lock   = {progress, target}             (current scalar progress + the locked target ref)
     sample = {acquiring, dt, rate, decayRate}
              acquiring  = aligned && in range && visible  (pre-computed by the caller)
              rate       = seconds to a full lock while acquiring (LOCK_TIME * mults)
              decayRate  = seconds to bleed a full lock while NOT acquiring (LOCK_TIME * 0.5)
     -> {progress, locked, justLocked}
        justLocked is true ONLY on the frame progress crosses from <1 to >=1 — the impure
        caller hangs the lock-tone/haptic/flash side effects off it (no re-fire while held). */
function advanceLock(lock, sample) {
  const prev = (lock && lock.progress) || 0;
  let progress;
  if (sample.acquiring) {
    progress = Math.min(1, prev + sample.dt / sample.rate);
  } else {
    progress = Math.max(0, prev - sample.dt / sample.decayRate);
  }
  const locked = progress >= 1;
  return { progress: progress, locked: locked, justLocked: locked && prev < 1 };
}

/* clearLockIf(lock, deadTarget): when an enemy dies, decide what the player's lock should become —
   replaces the enemy module reaching into player.lock* directly. Returns a PLAIN lock; the OWNER
   applies it. A matching locked `target` is dropped; a matching mid-acquire `candidate` is dropped
   and its progress reset. Unrelated deaths return the lock unchanged. Never mutates the input. */
function clearLockIf(lock, deadTarget) {
  const candidateDead = lock.candidate === deadTarget;
  return {
    target: lock.target === deadTarget ? null : lock.target,
    candidate: candidateDead ? null : lock.candidate,
    progress: candidateDead ? 0 : lock.progress,
  };
}

/* ===================================================================
   CommonJS export — Node tests only. In the browser `module` is undefined, so this whole block
   is skipped and every symbol above remains a plain browser global (no behavioural change).
   =================================================================== */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    reqSatisfied,
    TWO_PI, DEG, clamp, lerp, rand, randInt, damp,
    NIGHT_RADAR_MUL, WEATHER, resolveWeather, turbSample, rollWeather,
    BOSS_PHASE2_HP, BOSS_PHASE3_HP, bossPhaseFor, nextBossPhase, resolveBossPhase,
    resolveDamage,
    BOSS_RUSH_POOL, BOSS_RUSH_TOTAL, bossRushNext, bossRushDone, betterTime,
    TUTORIAL_STEPS, TUTORIAL_DONE, TUTORIAL_EVENT_FOR_STEP, tutorialNext,
    makeRng, dailySeedFor,
    CAMSHAKE_RATE, CAMSHAKE_K, decayShake,
    AWACS_COOLDOWNS, AWACS_USES_MAX, AWACS_JAM_TIME, AWACS_EFFECTS, awacsCall, awacsResolve,
    shouldOpenTechScreen,
    BOSS_WINDOW_MIN, BOSS_WINDOW_MAX, WAVE_COUNT_CAP, nextBossOffset, isBossWave, waveCount, isWildcardWave,
    composeWave, spawnDrainCount,
    rollDetect, rollCooldownGate,
    STEER, steerCommand,
    AIM_ASSIST, AIM_ASSIST_LEVELS, AIM_MAGNET_K, aimAssistCfg, aimAssistStep,
    GFX_TIERS, resolveQuality,
    TERRAIN_TIER, SEA_TIER, terrainDetailH,
    FOG_CLEAR_DENSITY, FOG_ACTIVE_DENSITY, fogDensityFor,
    GROUNDOBJ_TIER, GROUNDOBJ_RADIUS, GROUNDOBJ_WATER_MARGIN, GROUNDOBJ_PLATFORM_CLEAR, GROUNDOBJ_BUILD_MAX_SLOPE, planGroundObjects,
    shapeAxis, AGGRESSION, mapFlightInput, motionAxis, emaSmooth,
    enemyIsAimingPlayer,
    reconProgress, nextWaypoint, detectionDelta, reconWon, stealthWon, stealthFailed,
    ARCHETYPES, pickArchetype, shouldJink, pincerSign,
    equippableSpecials, isEquippableSpecial, specialCooldownMax, specialSlotReady,
    DRAFT_OFFER_N, DRAFT_PITY_THRESHOLD, frontierEligible, prereqPath, draftOffer,
    instrumentState, speedDisplay, altDisplay, KT_TO_MPH, KT_TO_KPH, FT_TO_M,
    LEVEL_WAVE_MIN, LEVEL_WAVE_CAP, campaignWaveCount, levelCleared,
    isOpUnlocked, isLevelUnlocked, levelState, markLevelCleared, furthestLevel,
    captureSnapshot, rollbackSnapshot, grantLevelRewards, CAMPAIGN_REPLAY_REWARDS,
    objectiveTypes, nextObjectivePhase, strikeSiteResolves,
    campaignSpawnedKillCount, campaignProceduralTarget, campaignClearTarget,
    COMBO_TIMER, KILLSTREAK_INTERVAL, awardHit, awardKill,
    advanceLock, clearLockIf,
  };
}

// === F5 killstreak === pure kill-streak momentum core (require-safe; no THREE/store/DOM).
// A chain of kills within STREAK.window seconds builds a count; the multiplier steps up at the tier
// counts (3/6/10 -> x1.5/x2/x3) and scales the kill's score contribution in combat.js killEnemy.
const STREAK = { window: 6, counts: [3, 6, 10], mults: [1, 1.5, 2, 3] };
// streakStep(streak{count,mult,t}, event 'kill'|'death', now) -> new streak{count,mult,t,tierUp}. PURE: now (seconds) is a param.
//   'kill'  : if now is past the last kill's t + window the chain lapsed -> count restarts at 1, else count+1;
//             the multiplier follows the new count; tierUp flags a multiplier INCREASE (caller banners once per crossing).
//   'death' : hard reset to a fresh streak (count 0, base multiplier), tierUp false.
function streakStep(streak, event, now) {
  const base = STREAK.mults[0];
  const s = (streak && typeof streak.count === 'number') ? streak : { count: 0, mult: base, t: 0 };
  if (event === 'death') return { count: 0, mult: base, t: 0, tierUp: false };
  const lapsed = now > (s.t || 0) + STREAK.window;   // window measured from the LAST kill time (s.t)
  const count = lapsed ? 1 : s.count + 1;
  let mult = base;
  for (let i = 0; i < STREAK.counts.length; i++) if (count >= STREAK.counts[i]) mult = STREAK.mults[i + 1];
  return { count: count, mult: mult, t: now, tierUp: mult > (s.mult || base) };
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { STREAK, streakStep });
// === end F5 ===
// === F3 wingman-wheel ===
// Pure wingman command-wheel state machine (no clock, no DOM). The active order is one of WINGMAN_ORDERS.
// `wingmanOrder(state, cmd)` folds an order command (FREE/ENGAGE/COVER/REGROUP) OR a fallback event
// ('targetLost' / 'lockLost') onto the current order and returns { order, banner }. Real transitions carry a
// banner i18n key; no-ops (re-issuing the active order, an unknown cmd, or an event that does not apply)
// return the same order with banner:null. Only ENGAGE reverts to FREE on a fallback event — REGROUP/COVER
// (and FREE) are unaffected by a lost lock or a lost target.
const WINGMAN_ORDERS = ['FREE', 'ENGAGE', 'COVER', 'REGROUP'];
const WINGMAN_ORDER_BANNER = {
  FREE: 'banner.wingmanFree', ENGAGE: 'banner.wingmanEngage',
  COVER: 'banner.wingmanCover', REGROUP: 'banner.wingmanRegroup',
};
function wingmanOrder(state, cmd) {
  const cur = WINGMAN_ORDERS.indexOf(state) >= 0 ? state : 'FREE';
  if (cmd === 'targetLost' || cmd === 'lockLost') {          // fallback events — only ENGAGE breaks off
    return cur === 'ENGAGE' ? { order: 'FREE', banner: 'banner.wingmanBreak' } : { order: cur, banner: null };
  }
  if (WINGMAN_ORDERS.indexOf(cmd) >= 0) {                    // order command: change → banner, re-issue → no-op
    return cmd === cur ? { order: cur, banner: null } : { order: cmd, banner: WINGMAN_ORDER_BANNER[cmd] };
  }
  return { order: cur, banner: null };                      // unknown command — no-op
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { WINGMAN_ORDERS, wingmanOrder });
// === end F3 ===
// === F4 defensive-ai ===
// Enemy evasion core (pure, deterministic). The impure caller (entities.js applyEvade) gathers the
// per-frame threat and threads {lastEvade, flares} in and out; every source of randomness stays in the
// caller so this stays require-safe and testable. breakTurnMul documents the effective turn-rate boost
// applyEvade triggers by reusing the engine's _jinkT lateral-break — enemies get NO bespoke turnRate
// write that could fight the boss-phase turnRate ramp.
const EVADE = {
  breakDur: 1.5,          // seconds a break-turn stays active (~1.5s per spec)
  breakTurnMul: 1.6,      // effective turn-rate boost during a break (matches updateEnemy's _jinkT block)
  cooldown: 2.2,          // minimum seconds between evades — gates spammy repeat reactions
  lockTrigger: 0.5,       // player lock-progress on THIS enemy that provokes an evade
  missileDist: 900,       // nearest inbound player-missile distance (world units) that provokes an evade
  flareSpoofChance: 0.45, // chance one enemy flare spoofs a player missile (combat.js updateMissiles)
};
// evadeDecision(state{lastEvade, flares}, threat{lockProgress, missileDist}, now) -> {action, state}.
//   action: 'none' | 'break' | 'flare'. Below BOTH triggers, or still inside the cooldown -> 'none'
//   (cooldown/flare state carried through unchanged). An inbound missile WITH flares left -> 'flare'
//   (flare count decremented in the returned state); otherwise (incl. the 0-flare fallback) -> 'break'.
//   Deterministic: identical inputs always yield identical output.
function evadeDecision(state, threat, now) {
  state = state || {}; threat = threat || {};
  const flares = state.flares || 0;
  const lastEvade = (state.lastEvade == null) ? -Infinity : state.lastEvade;
  const lockProgress = threat.lockProgress || 0;
  const missileDist = (threat.missileDist == null) ? Infinity : threat.missileDist;
  const lockThreat = lockProgress >= EVADE.lockTrigger;
  const missileThreat = missileDist <= EVADE.missileDist;
  if ((!lockThreat && !missileThreat) || (now - lastEvade) < EVADE.cooldown) {
    return { action: 'none', state: { lastEvade: state.lastEvade, flares } };
  }
  const action = (missileThreat && flares > 0) ? 'flare' : 'break';
  return { action, state: { lastEvade: now, flares: action === 'flare' ? flares - 1 : flares } };
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { EVADE, evadeDecision });
// === end F4 ===
/* === F1 gun-overheat ===================================================================
   Gun thermal model. Sustained fire builds heat 0->1; at 1.0 the cannon LOCKS OUT and stays
   locked (hysteresis) until heat cools back below HEAT.rearm, then re-arms. Heat decays whenever
   the gun is NOT discharging — which includes the entire lockout, so a held trigger can never pin
   it hot. State-in/state-out like awacsCall/advanceLock; the impure caller (combat.js) hangs the
   overheat banner+haptic off `justLocked` and gates fireGun() on `locked`.
   Default tuning: rise 0.20/s => 5.0s cold->lock, so the >=4s continuous-fire balance guard holds
   (4s => heat 0.80, no lock); decay 0.40/s => ~1.6s lockout (1.0 -> rearm 0.35). */
const HEAT = { rise: 0.20, decay: 0.40, rearm: 0.35 };

// heatStep(state{heat, locked}, firing, dt) -> {heat, locked, justLocked, justArmed}
//   firing = the gun is commanded to fire this frame (trigger held + has a cannon).
//   A LOCKED gun is gated OFF and cannot discharge, so heat ALWAYS bleeds off during lockout
//   (regardless of `firing`) — this is what makes the hysteresis robust to a held trigger.
//   justLocked / justArmed fire ONLY on the frame the lock state flips (the crossing frame),
//   mirroring advanceLock's justLocked, so the caller's side effects run exactly once.
function heatStep(state, firing, dt) {
  const wasLocked = !!(state && state.locked);
  const prevHeat = (state && state.heat) || 0;
  const building = firing && !wasLocked;                       // a locked gun never builds heat
  const heat = clamp(prevHeat + (building ? HEAT.rise : -HEAT.decay) * dt, 0, 1);
  let locked = wasLocked, justLocked = false, justArmed = false;
  if (!wasLocked && heat >= 1)             { locked = true;  justLocked = true; }
  else if (wasLocked && heat < HEAT.rearm) { locked = false; justArmed = true; }
  return { heat: heat, locked: locked, justLocked: justLocked, justArmed: justArmed };
}

if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { HEAT, heatStep });
/* === end F1 gun-overheat === */
// === F2 enemy-formations ===
// Pure geometry + break logic for non-boss fighter formations. A wave of >=3 fighters spawns with a
// leader (slot 0, normal AI) and followers that hold a leader-relative slot until the player closes to
// engage range OR the leader dies (formationBreak), then revert to normal AI permanently. Slots are
// LOCAL offsets in a leader frame where +x = leader's right and +z = BEHIND the leader; entities.js
// rotates them into world space by the leader's heading. No THREE/store/DOM here — require-safe.
const FORMATION_ENGAGE_RANGE = 1200;   // followers break (revert to normal AI) once the player is this close
const FORMATIONS = {
  // spacing = base unit between slots (world units); engageRange = break distance to the player.
  vee:     { spacing: 190, engageRange: FORMATION_ENGAGE_RANGE },   // symmetric arms trailing the leader
  wall:    { spacing: 210, engageRange: FORMATION_ENGAGE_RANGE },   // abreast line, wingtip-to-wingtip
  echelon: { spacing: 200, engageRange: FORMATION_ENGAGE_RANGE },   // monotonic stepped diagonal
  pincer:  { spacing: 220, engageRange: FORMATION_ENGAGE_RANGE },   // two flanking groups bracketing the axis
};
// formationSlots(type, n, spacing) -> array of n LOCAL {x, z} offsets; slot 0 = leader at the origin.
function formationSlots(type, n, spacing) {
  const s = spacing || (FORMATIONS[type] && FORMATIONS[type].spacing) || 200;
  const slots = [{ x: 0, z: 0 }];               // slot 0 = leader
  const fc = Math.max(0, (n | 0) - 1);          // follower count
  const tmpl = FORMATIONS[type] && FORMATIONS[type].slots;   // CF content-factory: data-driven pack formation
  if (tmpl && tmpl.length) {
    // Template slots are follower offsets in SPACING UNITS (leader implicit at the origin). When n
    // exceeds the template, extra followers repeat it one full template-depth further back.
    let depth = 0;
    for (let k = 0; k < tmpl.length; k++) depth = Math.max(depth, tmpl[k].z);
    depth += 1;
    for (let i = 1; i <= fc; i++) {
      const u = tmpl[(i - 1) % tmpl.length], rep = Math.floor((i - 1) / tmpl.length);
      slots.push({ x: u.x * s, z: (u.z + rep * depth) * s });
    }
    return slots;
  }
  if (type === 'wall') {
    // abreast line: every follower shares the leader's forward position (z = 0), spread alternately L/R.
    for (let i = 1; i <= fc; i++) {
      const rank = Math.ceil(i / 2), side = (i % 2 === 1) ? 1 : -1;
      slots.push({ x: side * rank * s, z: 0 });
    }
  } else if (type === 'echelon') {
    // stepped diagonal: each follower is one rank further back AND further to one side (strictly monotonic).
    for (let i = 1; i <= fc; i++) slots.push({ x: i * s, z: i * s });
  } else if (type === 'pincer') {
    // two flanking groups on opposite flanks with a clear central gap (min |x| = 2s, no follower near the axis).
    for (let i = 1; i <= fc; i++) {
      const rank = Math.ceil(i / 2), side = (i % 2 === 1) ? 1 : -1;
      slots.push({ x: side * s * (rank + 1), z: rank * s * 0.5 });
    }
  } else {
    // vee (default): symmetric ± pairs trailing behind the leader; an odd leftover trails on the centreline.
    const pairs = Math.floor(fc / 2);
    for (let r = 1; r <= pairs; r++) {
      slots.push({ x:  r * s, z: r * s });
      slots.push({ x: -r * s, z: r * s });
    }
    if (fc % 2 === 1) slots.push({ x: 0, z: (pairs + 1) * s });
  }
  return slots;
}
// formationBreak(distToPlayer, leaderAlive, cfg) -> true once the follower should quit the formation.
function formationBreak(distToPlayer, leaderAlive, cfg) {
  if (!leaderAlive) return true;                                     // leader dead -> scatter
  const range = (cfg && cfg.engageRange) || FORMATION_ENGAGE_RANGE;
  return distToPlayer <= range;                                      // player in engage range -> break to fight
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { FORMATIONS, formationSlots, formationBreak });
// === end F2 ===
// === F9 veterancy ===
// Per-airframe veterancy rank derived from lifetime kills. vetRank(kills) → integer 0..5 over 5
// escalating thresholds: rank 0 below the first threshold, rank N once kills ≥ VET_THRESHOLDS[N-1],
// capped at 5 (kills ≥ the last threshold). PURE — no THREE/store/DOM.
const VET_THRESHOLDS = [25, 75, 150, 300, 600];
function vetRank(kills) {
  var k = kills > 0 ? kills : 0;
  var r = 0;
  for (var i = 0; i < VET_THRESHOLDS.length; i++) if (k >= VET_THRESHOLDS[i]) r = i + 1;
  return r;
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { VET_THRESHOLDS, vetRank });
// === end F9 ===
// === run-mode policy table (Candidate 8) ===
// PURE lookup: classify the current run mode into ONE key, then read a small policy row instead of
// re-deriving the same boolean from the raw flags at each lifecycle branch point. The mode flags are
// mutually exclusive at runtime (startDaily/startWeekly/startBossRush each zero opMode; enterOperationRun
// zeros daily/weekly/bossRush; campaignMode is only ever true while opMode is too), so one key names it.
//   bounded        — finite authored-wave campaign run (vs unbounded endless/daily/weekly/bossRush)
//   opensTechShop  — a wave clear always opens the R&D/nav hub (Operation); endless/daily/weekly open it
//                    on a cadence (shouldOpenTechScreen); bossRush has no tech shop
// Keys: 'endless' | 'campaign' | 'daily' | 'weekly' | 'bossRush'. 'campaign' == Operations selected
// (opMode) and/or the in-flight bounded level (campaignMode).
const MODE_POLICY = {
  endless:  { bounded: false, opensTechShop: false },
  campaign: { bounded: true,  opensTechShop: true  },
  daily:    { bounded: false, opensTechShop: false },
  weekly:   { bounded: false, opensTechShop: false },
  bossRush: { bounded: false, opensTechShop: false },
};
// Classify {campaignMode, opMode, dailyMode, weeklyActive, bossRush} → one MODE_POLICY key. Precedence
// matches the runtime exclusivity: bossRush, then campaign (Operations/bounded), then weekly, then daily,
// else endless. `weeklyActive` is the caller's weeklyMode flag (named input-agnostic so the classifier is pure).
function modeKeyFor(f) {
  f = f || {};
  if (f.bossRush) return 'bossRush';
  if (f.campaignMode || f.opMode) return 'campaign';
  if (f.weeklyActive) return 'weekly';
  if (f.dailyMode) return 'daily';
  return 'endless';
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { MODE_POLICY, modeKeyFor });
// === end run-mode policy table ===
// === F8 weekly-challenge ===
// PURE — ISO-8601 week → deterministic seed + week id + 2-modifier pick, mirroring the daily core.
// Every helper takes a date STRING ('YYYY-MM-DD') and NEVER reads the clock (pure integer arithmetic,
// no Date object at all) so the SAME ISO week yields the SAME seed on ANY weekday and in ANY timezone.
// ISO week: weeks start Monday; week 1 is the week holding the year's first Thursday (the Jan-4 rule).
function wkIsLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
// day-of-year 1..366
function wkDayOfYear(y, m, d) {
  var cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  var ord = cum[(m - 1) | 0] + (d | 0);
  if (m > 2 && wkIsLeap(y)) ord += 1;
  return ord;
}
// ISO weekday Mon=1..Sun=7 via Sakamoto's congruence (integer-only, clock-free)
function wkIsoDow(y, m, d) {
  var t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  var yy = m < 3 ? y - 1 : y;
  var dow = (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[(m - 1) | 0] + d) % 7; // 0=Sun
  return ((dow + 6) % 7) + 1; // Mon=1..Sun=7
}
// ISO weeks in a year: 53 iff its first day (or its predecessor's) lands on a long-year weekday.
function wkWeeksInYear(y) {
  var p = function (yr) { return ((yr + Math.floor(yr / 4) - Math.floor(yr / 100) + Math.floor(yr / 400)) % 7 + 7) % 7; };
  return (p(y) === 4 || p(y - 1) === 3) ? 53 : 52;
}
// Parse 'YYYY-MM-DD' → { weekYear, week } ISO-8601 week parts. PURE.
function isoWeekParts(dateStr) {
  var s = String(dateStr).split('-');
  var y = s[0] | 0, m = s[1] | 0, d = s[2] | 0;
  var ord = wkDayOfYear(y, m, d), dow = wkIsoDow(y, m, d);
  var week = Math.floor((ord - dow + 10) / 7);
  var weekYear = y;
  if (week < 1) { weekYear = y - 1; week = wkWeeksInYear(weekYear); }
  else if (week > wkWeeksInYear(y)) { weekYear = y + 1; week = 1; }
  return { weekYear: weekYear, week: week };
}
// weekIdFor('2026-07-13') → '2026-W29' (the meta key). PURE.
function weekIdFor(dateStr) {
  var p = isoWeekParts(dateStr);
  return p.weekYear + '-W' + ('0' + p.week).slice(-2);
}
// weeklySeedFor('2026-07-13') → deterministic uint32 seed for that ISO week. PURE, clock-free.
// Same avalanche as dailySeedFor; packs (weekYear, week) so all 7 days of one ISO week map to ONE seed.
function weeklySeedFor(dateStr) {
  var p = isoWeekParts(dateStr);
  var x = ((p.weekYear | 0) * 54 + (p.week | 0)) | 0;
  x = (x ^ 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}
// Weekly modifier table — >=5 distinct run-start handicaps. IDs only (pure data); the impure
// application (player/weather mutation) lives in ui-flow.js + main.js spawn guards.
// Each entry's `effects` is DATA interpreted by ui-flow.js applyWeeklyMods / the main.js wave
// guards (CF content-factory: pack modifiers use the same schema — see PACK_LIMITS.effectKeys).
var WEEKLY_MODIFIERS = [
  { id: 'stormFront', effects: { lockWeather: 'storm' } },   // the sky is locked to storm all week
  { id: 'noFlares',   effects: { flares: 0 } },              // countermeasures offline — no flares
  { id: 'noMissiles', effects: { missiles: 0 } },            // hardpoints sealed — guns only
  { id: 'doubleAces', effects: { extraAces: 1 } },           // an extra ace joins every wave
  { id: 'heavyWing',  effects: { turnMul: 0.6 } },           // reinforced airframe — agility cut
];
// weeklyModifiers(seed, pool) → 2 DISTINCT modifiers for the week, deterministic from the seed via
// makeRng. `pool` defaults to the base table; the weekly runtime passes the pack-extended pool.
function weeklyModifiers(seed, pool) {
  var rng = makeRng(seed);
  pool = (pool || WEEKLY_MODIFIERS).slice();
  var out = [];
  for (var k = 0; k < 2 && pool.length; k++) {
    var i = Math.floor(rng() * pool.length) % pool.length;
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { weeklySeedFor, weekIdFor, WEEKLY_MODIFIERS, weeklyModifiers });
// === end F8 ===
// === wing-node routing ===
// Which tech/draft node ids open the jet WING PICKER (choose a wingman airframe) instead of buying
// immediately. Pure membership predicate; the impure buyNode/deployFromTech (ui-tech.js) delegate here.
const WING_NODES = new Set(['w1', 'w2', 'reserve']);
function routesToWingPicker(nodeId) { return WING_NODES.has(nodeId); }
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { WING_NODES, routesToWingPicker });
// === end wing-node routing ===
// === CF content-factory ===
// Versioned CONTENT PACKS (js/content-packs.js) carry new formations / weekly modifiers / weekly
// wave patterns as pure DATA. This section is the pure half: bounds, validation, merge, and the
// deterministic weekly picks. Impure application lives at the existing F2/F8 call sites
// (globals.js merge → packRuntime; ui-flow.js applyWeeklyMods; main.js nextWave guards).
var PACK_LIMITS = {
  spacingMin: 120, spacingMax: 400,
  engageMin: 600, engageMax: 2400,
  slotsMax: 15, slotOffMax: 8, slotSepMin: 0.5,
  ordnanceMax: 6, extraAcesMax: 3, turnMulMin: 0.4,
  waveRowsMax: 10,
  effectKeys: ['lockWeather', 'flares', 'missiles', 'extraAces', 'turnMul'],
  lockWeathers: ['fog', 'storm'],
};
function packNum(v) { return typeof v === 'number' && isFinite(v); }
function packInt(v) { return packNum(v) && v === (v | 0); }
// validatePack(pack, formations, modIds) → { ok, errors[] }. `formations` = the CURRENT merged
// formation table (base + already-accepted packs — id collisions checked against it); `modIds` =
// ids already in the weekly modifier pool. Packs must be self-contained: a wave row may only
// reference base formations or formations defined in THIS pack.
function validatePack(pack, formations, modIds) {
  var errs = [], L = PACK_LIMITS;
  if (!pack || typeof pack !== 'object') return { ok: false, errors: ['pack: not an object'] };
  if (typeof pack.id !== 'string' || !/^[a-z0-9-]{3,40}$/.test(pack.id)) errs.push('id: must be a 3-40 char kebab slug');
  if (pack.version !== 1) errs.push('version: must be 1');
  var fkeys = Object.keys(pack.formations || {});
  var mods = pack.modifiers || [], waves = pack.waves || [];
  if (!fkeys.length && !mods.length && !waves.length) errs.push('pack: empty (no formations/modifiers/waves)');
  for (var fi = 0; fi < fkeys.length; fi++) {
    var fid = fkeys[fi], f = pack.formations[fid], tag = 'formation ' + fid;
    if (formations && formations[fid]) { errs.push(tag + ': id collides with an existing formation'); continue; }
    if (!f || typeof f !== 'object') { errs.push(tag + ': not an object'); continue; }
    if (!packNum(f.spacing) || f.spacing < L.spacingMin || f.spacing > L.spacingMax) errs.push(tag + ': spacing out of ' + L.spacingMin + '-' + L.spacingMax);
    if (!packNum(f.engageRange) || f.engageRange < L.engageMin || f.engageRange > L.engageMax) errs.push(tag + ': engageRange out of ' + L.engageMin + '-' + L.engageMax);
    var sl = f.slots;
    if (!Array.isArray(sl) || !sl.length || sl.length > L.slotsMax) { errs.push(tag + ': slots must be 1-' + L.slotsMax + ' entries'); continue; }
    var pts = [{ x: 0, z: 0 }];   // leader — no follower slot may sit on/near the origin
    for (var si = 0; si < sl.length; si++) {
      var p = sl[si];
      if (!p || !packNum(p.x) || !packNum(p.z) || Math.abs(p.x) > L.slotOffMax || Math.abs(p.z) > L.slotOffMax) { errs.push(tag + ' slot ' + si + ': x/z must be finite within ±' + L.slotOffMax); continue; }
      for (var pi = 0; pi < pts.length; pi++) {
        var dx = p.x - pts[pi].x, dz = p.z - pts[pi].z;
        if (Math.sqrt(dx * dx + dz * dz) < L.slotSepMin) { errs.push(tag + ' slot ' + si + ': closer than ' + L.slotSepMin + ' spacing units to another jet'); break; }
      }
      pts.push(p);
    }
  }
  var seenMods = {};
  for (var mi = 0; mi < mods.length; mi++) {
    var m = mods[mi], mtag = 'modifier ' + (m && m.id);
    if (!m || typeof m.id !== 'string' || !m.id) { errs.push('modifier ' + mi + ': missing id'); continue; }
    if (seenMods[m.id] || (modIds && modIds.indexOf(m.id) >= 0)) { errs.push(mtag + ': id collides with an existing modifier'); continue; }
    seenMods[m.id] = true;
    var fx = m.effects, keys = (fx && typeof fx === 'object') ? Object.keys(fx) : [];
    if (!keys.length) { errs.push(mtag + ': effects must be a non-empty object'); continue; }
    for (var ki = 0; ki < keys.length; ki++) {
      var k = keys[ki], v = fx[k];
      if (L.effectKeys.indexOf(k) < 0) { errs.push(mtag + ': unknown effect "' + k + '"'); continue; }
      if (k === 'lockWeather' && L.lockWeathers.indexOf(v) < 0) errs.push(mtag + ': lockWeather must be one of ' + L.lockWeathers.join('/'));
      if ((k === 'flares' || k === 'missiles') && (!packInt(v) || v < 0 || v > L.ordnanceMax)) errs.push(mtag + ': ' + k + ' must be an int 0-' + L.ordnanceMax);
      if (k === 'extraAces' && (!packInt(v) || v < 1 || v > L.extraAcesMax)) errs.push(mtag + ': extraAces must be an int 1-' + L.extraAcesMax);
      if (k === 'turnMul' && (!packNum(v) || v < L.turnMulMin || v >= 1)) errs.push(mtag + ': turnMul must be ' + L.turnMulMin + '-1 (handicap)');
    }
  }
  var seenWaves = {};
  for (var wi = 0; wi < waves.length; wi++) {
    var w = waves[wi], wtag = 'wave-pattern ' + (w && w.id);
    if (!w || typeof w.id !== 'string' || !w.id || seenWaves[w.id]) { errs.push('wave-pattern ' + wi + ': missing/duplicate id'); continue; }
    seenWaves[w.id] = true;
    var rows = w.pattern;
    if (!Array.isArray(rows) || !rows.length || rows.length > L.waveRowsMax) { errs.push(wtag + ': pattern must be 1-' + L.waveRowsMax + ' rows'); continue; }
    for (var ri = 0; ri < rows.length; ri++) {
      var r = rows[ri];
      if (!r || !packInt(r.n) || r.n < 1 || r.n > WAVE_COUNT_CAP) errs.push(wtag + ' row ' + ri + ': n must be an int 1-' + WAVE_COUNT_CAP);
      if (r && r.formation != null && !((formations && formations[r.formation]) || (pack.formations && pack.formations[r.formation]))) errs.push(wtag + ' row ' + ri + ': unknown formation "' + r.formation + '"');
    }
  }
  return { ok: !errs.length, errors: errs };
}
// applyContentPacks(packs, formations, baseMods) → { applied[], rejected[], modPool[], wavePatterns[] }.
// Validates each pack IN ORDER against the progressively-merged tables; a valid pack merges its
// formations INTO `formations` (mutated — the browser passes the live FORMATIONS) and contributes
// modifiers/wave-patterns to the returned pools. A rejected pack contributes NOTHING (all-or-nothing
// per pack) and is reported with its errors.
function applyContentPacks(packs, formations, baseMods) {
  var modPool = (baseMods || []).slice();
  var out = { applied: [], rejected: [], modPool: modPool, wavePatterns: [] };
  var modIds = modPool.map(function (m) { return m.id; });
  var seenPacks = {};
  for (var i = 0; i < (packs || []).length; i++) {
    var pk = packs[i];
    var res = (pk && seenPacks[pk.id]) ? { ok: false, errors: ['id: duplicate pack id'] } : validatePack(pk, formations, modIds);
    if (!res.ok) { out.rejected.push({ id: (pk && pk.id) || ('(pack ' + i + ')'), errors: res.errors }); continue; }
    seenPacks[pk.id] = true;
    var fkeys = Object.keys(pk.formations || {});
    for (var fi = 0; fi < fkeys.length; fi++) formations[fkeys[fi]] = pk.formations[fkeys[fi]];
    var mods = pk.modifiers || [];
    for (var mi = 0; mi < mods.length; mi++) { modPool.push(mods[mi]); modIds.push(mods[mi].id); }
    var wv = pk.waves || [];
    for (var wi = 0; wi < wv.length; wi++) out.wavePatterns.push(wv[wi]);
    out.applied.push(pk.id);
  }
  return out;
}
// weeklyEffectsFor(ids, pool) → ONE merged effects object for the run. Merge rules when the two
// picked modifiers touch the same knob: flares/missiles take the MIN (harsher wins), extraAces
// SUM, turnMul MULTIPLIES, lockWeather last-in-pool-order wins (pool order is deterministic).
function weeklyEffectsFor(ids, pool) {
  var out = {};
  pool = pool || WEEKLY_MODIFIERS;
  for (var i = 0; i < pool.length; i++) {
    var m = pool[i];
    if (!m.effects || !ids || ids.indexOf(m.id) < 0) continue;
    var fx = m.effects;
    if (fx.lockWeather != null) out.lockWeather = fx.lockWeather;
    if (fx.flares != null) out.flares = out.flares == null ? fx.flares : Math.min(out.flares, fx.flares);
    if (fx.missiles != null) out.missiles = out.missiles == null ? fx.missiles : Math.min(out.missiles, fx.missiles);
    if (fx.extraAces != null) out.extraAces = (out.extraAces || 0) + fx.extraAces;
    if (fx.turnMul != null) out.turnMul = (out.turnMul == null ? 1 : out.turnMul) * fx.turnMul;
  }
  return out;
}
// weeklyWavePattern(seed, patterns) → this week's wave pattern (or null when none shipped).
// Decoupled from the modifier draw by a fixed xor so adding patterns never reshuffles the mods.
function weeklyWavePattern(seed, patterns) {
  if (!patterns || !patterns.length) return null;
  var rng = makeRng((seed ^ 0x5f356495) >>> 0);
  return patterns[Math.floor(rng() * patterns.length) % patterns.length];
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { PACK_LIMITS, validatePack, applyContentPacks, weeklyEffectsFor, weeklyWavePattern });
// === end CF ===
