/* core.js — pure, dependency-free game cores. Require-safe: touches NO THREE/DOM/store, so it loads in
   Node via the CommonJS footer and tests exercise the real code. Anything reading live state belongs in globals.js. */

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

// 32-bit avalanche shared by the weather / daily / weekly seeds.
function _mix32(x) {
  x = (x ^ 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}

/* ---------------- weather ---------------- */
const NIGHT_RADAR_MUL = 0.75;   // night (TOD index 2) additionally shortens radar detection
// fogMul is the gameplay-facing fog factor; the actual scene.fog.density comes from fogDensityFor.
const WEATHER = {
  clear: { radarMul: 1.0, lockRangeMul: 1.0,  lockSpeedMul: 1.0,  fogMul: 1.0 },
  fog:   { radarMul: 0.6, lockRangeMul: 0.65, lockSpeedMul: 1.15, fogMul: 11.4 },
  storm: { radarMul: 0.7, lockRangeMul: 0.6,  lockSpeedMul: 1.35, fogMul: 5.7 },
};
function resolveWeather(type, tod) {
  const w = WEATHER[type] || WEATHER.clear;
  const night = (tod === 2) ? NIGHT_RADAR_MUL : 1;
  return {
    type: WEATHER[type] ? type : 'clear',
    radarMul: w.radarMul * night,
    lockRangeMul: w.lockRangeMul,
    lockSpeedMul: w.lockSpeedMul,
    fogMul: w.fogMul,
  };
}
function rollWeather(seed) {
  const r = _mix32(seed | 0) / 4294967296;
  return r < 0.6 ? 'clear' : r < 0.8 ? 'fog' : 'storm';
}
// FogExp2 density. Visible distance at 2% transmittance is d = 1.978/density. Clear scales by tier
// (~28/34/38 km); storm/fog use a FIXED density so active weather slams the sightline on every tier.
const FOG_CLEAR_DENSITY = { low: 0.0000706, medium: 0.000058, high: 0.0000520 };
const FOG_ACTIVE_DENSITY = { storm: 0.000330, fog: 0.000659 };   // ~6 km / ~3 km
function fogDensityFor(tier, weatherType) {
  if (weatherType === 'storm' || weatherType === 'fog') return FOG_ACTIVE_DENSITY[weatherType];
  return FOG_CLEAR_DENSITY[tier] || FOG_CLEAR_DENSITY.medium;
}

/* ---------------- boss phases ---------------- */
const BOSS_PHASE2_HP = 0.6;
const BOSS_PHASE3_HP = 0.3;
function bossPhaseFor(hpFrac) {
  if (hpFrac < BOSS_PHASE3_HP) return 3;
  if (hpFrac < BOSS_PHASE2_HP) return 2;
  return 1;
}
// Never regresses: HP regen can't drop a phase.
function nextBossPhase(reached, hpFrac) {
  const want = bossPhaseFor(hpFrac);
  return want > reached ? want : reached;
}
// `phaseCfg` = authored per-phase array, or null for the legacy ramp (×1.18 turn rate per crossed
// phase, iterated to stay byte-identical with the old compounding multiply). `baseTurnRate` is the
// phase-1 rate, echoed back so the caller carries it across phases without a separate field.
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
  for (let p = 2; p <= phase; p++) turnRate *= 1.18;
  return { turnRate: turnRate, fireMul: 1, extraMissiles: 0, pattern: null, flags: [], baseTurnRate: baseTurnRate };
}

/* ---------------- damage resolution ---------------- */
// state = { hp, maxHp, type, playerDmg }; hit = { amt, byPlayer, rand (crit roll, injected),
// alphaMul, comboDmg, combo, critChance, critMul, execThresh, rpMul, tpDmg }.
// hpDelta == amt unless EXECUTE forced the rest; rp is the RP award for player-dealt damage.
function resolveDamage(state, hit) {
  const byPlayer = hit.byPlayer === undefined ? true : !!hit.byPlayer;
  let amt = hit.amt;
  let crit = false;
  if (byPlayer) {
    if (hit.alphaMul > 1 && state.hp >= state.maxHp - 0.5) amt *= hit.alphaMul;
    if (hit.comboDmg) amt *= 1 + Math.min(0.3, (hit.combo || 0) * hit.comboDmg);
    if (hit.critChance && (hit.rand || 0) < hit.critChance) { amt *= hit.critMul; crit = true; }
  }
  let hp = state.hp - amt;
  let playerDmg = state.playerDmg || 0;
  let rp = 0;
  if (byPlayer) { playerDmg += amt; rp = amt * (hit.tpDmg || 0) * (hit.rpMul || 1); }
  let executed = false;
  if (byPlayer && hit.execThresh && state.type !== 'boss' && hp > 0 && hp <= state.maxHp * hit.execThresh) {
    hp = 0; executed = true;
  }
  const hpDelta = state.hp - hp;
  return { amt, crit, hp, hpDelta, died: hp <= 0, executed, playerDmg, rp };
}

/* ---------------- boss rush ---------------- */
const BOSS_RUSH_POOL = ['boss', 'boss', 'boss', 'boss', 'boss'];
const BOSS_RUSH_TOTAL = BOSS_RUSH_POOL.length;
function bossRushNext(index) {
  if (index < 0 || index >= BOSS_RUSH_POOL.length) return null;
  return BOSS_RUSH_POOL[index];
}
function bossRushDone(killed, total) {
  return killed >= total;
}
// Lower run time wins; 0/undefined means "no record yet".
function betterTime(prev, next) {
  if (!(next > 0)) return prev > 0 ? prev : 0;
  if (!(prev > 0)) return next;
  return next < prev ? next : prev;
}

/* ---------------- tutorial ---------------- */
// Only the current step's event (or 'skip') advances; DONE is absorbing.
const TUTORIAL_STEPS = ['pitch', 'throttle', 'guns', 'missile', 'roll'];
const TUTORIAL_DONE = TUTORIAL_STEPS.length;
const TUTORIAL_EVENT_FOR_STEP = ['pitched', 'throttled', 'fired', 'missile', 'rolled'];
function tutorialNext(step, event) {
  if (step >= TUTORIAL_DONE) return TUTORIAL_DONE;
  if (event === 'skip') return TUTORIAL_DONE;
  if (event === TUTORIAL_EVENT_FOR_STEP[step]) return step + 1;
  return step;
}

/* ---------------- daily challenge ---------------- */
// mulberry32: same seed → same stream of floats in [0,1).
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
// Never reads the clock — the caller passes the date in.
function dailySeedFor(y, m, d) {
  return _mix32((((y | 0) * 12 + ((m | 0) - 1)) * 31 + ((d | 0) - 1)) | 0);
}

/* ---------------- camera shake ---------------- */
const CAMSHAKE_RATE = 6;   // shake units lost per second
const CAMSHAKE_K    = 1.2; // world-unit scale at camShake == 1
function decayShake(v, dt) { return Math.max(0, v - dt * CAMSHAKE_RATE); }

/* ---------------- AWACS support calls ---------------- */
// Cooldown-gated + capped per sector, NOT RP-costed (an RP price made a one-shot call never worth it
// vs a compounding upgrade).
const AWACS_COOLDOWNS = { strike: 30, resupply: 26, jam: 18 };
const AWACS_USES_MAX  = { strike: 1,   resupply: 1,  jam: 2 };
const AWACS_JAM_TIME  = 8;   // seconds enemy missiles stay blinded by a jamming call
// Returns a NEW {ok, reason, uses, last}; reason 'unknown' | 'empty' | 'cooldown' | 'ok'.
// last[key] <= 0 / missing means "never called".
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
const AWACS_EFFECTS = { strike: 'awacs.strike', resupply: 'awacs.resupply', jam: 'awacs.jam' };
// awacsCall + what combat.js must do: `effect` on success, else a failure banner key (null for an
// unknown key → caller plays a neutral sound).
function awacsResolve(state, cd, max, key, now) {
  const r = awacsCall(state, cd, max, key, now);
  if (!r.ok) {
    const banner = r.reason === 'cooldown' ? 'awacs.cooldown' : r.reason === 'empty' ? 'awacs.empty' : null;
    return { ok: false, reason: r.reason, uses: r.uses, last: r.last, effect: null, banner };
  }
  return { ok: true, reason: 'ok', uses: r.uses, last: r.last, effect: key, banner: AWACS_EFFECTS[key] };
}

/* ---------------- tech-screen cadence ---------------- */
// A modal every wave killed flow: skip wave 1, then every 2nd wave and always after a boss.
function shouldOpenTechScreen(wave, wasBoss) {
  if (wave < 2) return false;
  if (wasBoss) return true;
  return wave % 2 === 0;
}

/* ---------------- wave cadence + composition ---------------- */
// The next boss is rolled 3-5 waves out so it's never predictable.
const BOSS_WINDOW_MIN = 3;
const BOSS_WINDOW_MAX = 5;
const WAVE_COUNT_CAP  = 16;
function nextBossOffset(rng) {
  const span = BOSS_WINDOW_MAX - BOSS_WINDOW_MIN + 1;
  return BOSS_WINDOW_MIN + Math.floor(rng() * span);
}
function isBossWave(wave, bossWaveNext) { return wave >= bossWaveNext; }
function waveCount(wave, diffDelta, cap) {
  return clamp(3 + wave + diffDelta, 2, (cap === undefined ? WAVE_COUNT_CAP : cap));
}
// Rare (≈18%) denser non-boss "spike" wave from wave 5 on.
function isWildcardWave(wave, isBoss, roll) {
  return !isBoss && wave >= 5 && roll < 0.18;
}
// Decide the whole wave up front as one manifest; main.js nextWave only enacts it.
//   CAMPAIGN: { campaignPlan, bossPhases, bossWaveNext } — authored, no rng, boss schedule passed through.
//   ENDLESS:  { wave, strike, difficulty, weatherSeed, lockWeather, weeklyAces, weeklyWavePlan, countDelta,
//             groundAllowed, bossWaveNext, rivalDue, rng }.
// CONTRACT: rng() is drawn in the exact order (with randInt(a,b) expanded as a + floor(rng()·(b+1−a)))
// of the old inline nextWave, so rng === Math.random consumes the global stream byte-identically.
// Boss-schedule state comes in via ctx and goes out on the manifest — never a side effect.
function composeWave(ctx) {
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
      bossWaveNext: ctx.bossWaveNext, bossWaveActive: !!p.boss,
    };
  }
  const rng = ctx.rng, wave = ctx.wave;
  let weather = rollWeather(ctx.weatherSeed + wave);
  if (ctx.lockWeather) weather = ctx.lockWeather;
  // STRIKE wave: consumes NO rng and leaves the boss schedule alone.
  if (ctx.strike) {
    return {
      mode: 'endless', strike: true, weather,
      fighters: 3, formation: null, boss: false, wildcard: false,
      aces: 0, bomber: false, droneSwarm: 0, ground: 0, rival: false,
      banner: 'strike', strikeSite: true,
      bossWaveNext: ctx.bossWaveNext, bossWaveActive: false,
    };
  }
  let bossWaveNext = ctx.bossWaveNext;
  if (bossWaveNext < BOSS_WINDOW_MIN) bossWaveNext = nextBossOffset(rng);   // seed: first boss on wave 3-5
  const boss = isBossWave(wave, bossWaveNext);
  if (boss) bossWaveNext = wave + nextBossOffset(rng);
  const wildcard = isWildcardWave(wave, boss, rng());   // always draws
  let count = waveCount(wave, ctx.countDelta, WAVE_COUNT_CAP);
  if (wildcard) count = Math.min(WAVE_COUNT_CAP, count + (2 + Math.floor(rng() * 3)));
  const wrow = (ctx.weeklyWavePlan && wave <= ctx.weeklyWavePlan.pattern.length) ? ctx.weeklyWavePlan.pattern[wave - 1] : null;
  if (wrow) count = wrow.n;
  let aces = 0;
  if (wave >= 3 && !boss && rng() < (0.45 + ctx.difficulty * 0.12)) aces++;
  if (wildcard) aces++;
  if (ctx.weeklyAces && !boss) aces += ctx.weeklyAces;
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
function spawnDrainCount(queueLength, perFrame) {
  return Math.max(0, Math.min(perFrame, queueLength));
}

/* ---------------- barrel roll ---------------- */
function rollDetect(now, lastTapTime, threshold) {
  const gap = now - lastTapTime;
  return gap > 0 && gap <= threshold;
}
function rollCooldownGate(cooldown) {
  return cooldown <= 0;
}

/* ---------------- steering ---------------- */
// maxBank ≈ 80°; 'auto' banks gently (≈29°) and turns via a world-yaw ∝ sin(bank)*autoYawGain in combat.js.
const STEER = { maxBank: 1.4, bankGain: 2.4, autoLevelGain: 1.6, deadzone: 0.06, autoMaxBank: 0.5, autoYawGain: 1.6 };
// intent {pitch, roll} in -1..1; currentBank (rad) shares roll's sign frame.
//   'rate'   : stick = roll rate.
//   'pointer': proportional bank-hold to roll*maxBank; inside the deadzone, auto-levels.
//   'auto'   : as pointer with autoMaxBank; the turn is a world yaw so it stays out of pitch.
function steerCommand(scheme, intent, currentBank, t) {
  const pitchCmd = intent.pitch;
  if (scheme !== 'pointer' && scheme !== 'auto') return { pitchCmd, rollCmd: intent.roll };
  const cb = currentBank || 0;
  const mb = (scheme === 'auto') ? t.autoMaxBank : t.maxBank;
  let rollCmd;
  if (Math.abs(intent.roll) < t.deadzone) {
    rollCmd = clamp(-cb * t.autoLevelGain / mb, -1, 1);
  } else {
    const targetBank = intent.roll * mb;
    rollCmd = clamp(t.bankGain * (targetBank - cb) / mb, -1, 1);
  }
  return { pitchCmd, rollCmd };
}

/* ---------------- aim assist ---------------- */
// range: world units; cone: detection field (rad); maxRate: max pull (rad/s) at angErr≈0.
// Weakest → strongest; level 5 is the "forcing" tier.
const AIM_ASSIST_LEVELS = [
  { range: 2400, cone: 0.45, maxRate: 0.6 },
  { range: 2500, cone: 0.52, maxRate: 1.0 },
  { range: 2600, cone: 0.60, maxRate: 1.8 },   // default
  { range: 2800, cone: 0.75, maxRate: 3.0 },
  { range: 3000, cone: 1.20, maxRate: 7.0 },
];
const AIM_ASSIST = AIM_ASSIST_LEVELS[2];
// Magnet falloff (rad^-2): pull = maxRate / (1 + K·angErr²) → 100% at 0°, ~45% at 15°, ~17% at 30°.
const AIM_MAGNET_K = 18;
// Manual steering makes the forcing tier yield to the weakest preset.
function aimAssistCfg(level, manualOverride) {
  const i = Math.min(AIM_ASSIST_LEVELS.length, Math.max(1, level | 0)) - 1;
  if (manualOverride && i >= 4) return AIM_ASSIST_LEVELS[0];
  return AIM_ASSIST_LEVELS[i];
}
// Radians to rotate toward the gun lead this frame; 0 outside cone/range. Eased by distance,
// capped at maxRate*dt and at angErr so it never overshoots the lead.
function aimAssistStep(angErr, dist, dt, cfg) {
  cfg = cfg || AIM_ASSIST;
  if (!(dt > 0) || !(dist > 0) || dist > cfg.range) return 0;
  if (!(angErr > 1e-4) || angErr > cfg.cone) return 0;
  const falloff = 1 - dist / cfg.range;
  const pullForce = cfg.maxRate / (1 + AIM_MAGNET_K * angErr * angErr);
  const step = pullForce * falloff * dt;
  return Math.min(step, cfg.maxRate * dt, angErr);
}

/* ---------------- graphics quality ---------------- */
// auto/unknown: any touch device → medium, else high. The fps-based downgrade lives in globals.js refreshGfxTier.
function resolveQuality(setting, dpr, isTouch) {
  if (setting === 'low' || setting === 'medium' || setting === 'high') return setting;
  return isTouch ? 'medium' : 'high';
}

/* ---------------- environment tiers ---------------- */
// SEG drives (SEG+1)^2 verts. Visual relief must stay within a few units of the gameplay surface
// (props/units sit on terrainH).
const TERRAIN_TIER = {
  low:    { seg: 220, detailAmp: 0,  detailOct: 0 },
  medium: { seg: 300, detailAmp: 8,  detailOct: 2 },
  high:   { seg: 400, detailAmp: 14, detailOct: 3 },
};
const SEA_TIER = {
  low:    { seg: 200, waveOct: 3, normOct: 0, foam: 0, reflect: 0 },
  medium: { seg: 220, waveOct: 4, normOct: 1, foam: 0, reflect: 0 },
  high:   { seg: 256, waveOct: 5, normOct: 2, foam: 1, reflect: 1 },
};
// Tier-only VISUAL relief layered on terrainH (which gameplay reads unscaled), bounded ±detailAmp.
function terrainDetailH(x, z, cfg) {
  if (!cfg || !(cfg.detailAmp > 0) || !(cfg.detailOct > 0)) return 0;
  // rotated value-noise octaves (a sin×cos product tiled into a visible egg-carton)
  let h = 0, amp = 1, ampSum = 0, f = 0.0032, u = x, v = z;
  for (let o = 0; o < cfg.detailOct; o++) {
    h += amp * valueNoise2(u * f + o * 7.3, v * f - o * 3.1);
    ampSum += amp;
    const ru = u * 0.8 - v * 0.6, rv = u * 0.6 + v * 0.8; u = ru; v = rv;   // rotate ~37° per octave
    amp *= 0.5; f *= 2.1;
  }
  return (h / ampSum) * cfg.detailAmp;
}

/* ---------------- gameplay heightfield ---------------- */
// Deterministic 2D value noise in [-1,1] (integer-hash lattice, quintic fade) — every load builds the same world.
function _latticeHash(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = _latticeHash(ix, iz), b = _latticeHash(ix + 1, iz), c = _latticeHash(ix, iz + 1), d = _latticeHash(ix + 1, iz + 1);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}
// Ceiling of terrainHeight (+ visual detail) — anything above it can skip the ground query.
const TERRAIN_MAX_H = 1000;
// THE gameplay ground surface (collision, spawns, AGL, shadows, ground-object Y). Domain-warped fbm
// island chain, ridged ranges on land, sea surface at y≈-10. Range ≈ -700..+930.
function terrainHeight(x, z) {
  const u = x * 0.00024, v = z * 0.00024;
  const wu = u + 0.55 * valueNoise2(u * 0.8 + 17.3, v * 0.8 - 4.1);
  const wv = v + 0.55 * valueNoise2(u * 0.8 - 7.7, v * 0.8 + 12.9);
  // each octave rotated so the lattice never lines up into grid artefacts
  const n = 0.58 * valueNoise2(wu, wv)
          + 0.27 * valueNoise2(wu * 1.6 - wv * 1.2 + 3.1, wu * 1.2 + wv * 1.6 - 8.4)
          + 0.15 * valueNoise2(wu * 1.9 + wv * 3.4 - 1.3, -wu * 3.4 + wv * 1.9 + 5.7);
  let h = n * 900 + 40;
  if (h > 0) {
    const ra = wu * 2.2 + wv * 1.5 + 9.1, rb = -wu * 1.5 + wv * 2.2 - 2.2;
    const r1 = 1 - Math.abs(valueNoise2(ra, rb));
    const r2 = 1 - Math.abs(valueNoise2(ra * 2.1 - rb * 0.9 + 4.4, ra * 0.9 + rb * 2.1 + 1.7));
    h += Math.min(h / 300, 1) * (r1 * r1 * 0.7 + r2 * r2 * 0.3) * 300;
  }
  h += valueNoise2(x * 0.0031 + z * 0.0017, -x * 0.0017 + z * 0.0031) * 12;
  // open ocean ring beyond ~10.5 km so the terrain mesh edge (±13 km) is never a visible cliff
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge > 10500) { const t = Math.min((edge - 10500) / 2300, 1); h += (-320 - h) * t * t * (3 - 2 * t); }
  // flatten the coast into beaches ~18 above the sea surface so shores clear the swell (peaks ≈ +12)
  const c = h - 8;
  return h - 0.55 * c * Math.exp(-(c * c) / 3600);
}

/* ---------------- biomes (visual only — terrainH is identical in every biome) ---------------- */
const BIOMES = {
  temperate: { sand: 0xb9a57a, low: 0x4f7a34, mid: 0x355b2a, high: 0x6d6a58, rock: 0x6a6660, snow: 0xe9eef2, snowLine: 780,
               sea: 0x0f4460, shallow: 0x2f8a8c, canopy: 0x2f5a2c, tree: 'conifer', treeMul: 1, bldMul: 1,
               walls: [0xe8e2d4, 0xd6cbb4, 0xbfc3c4, 0xe3d3b0], roofs: [0x8a3b2a, 0x5c5f66, 0x7a4a2e, 0x3f4a55], flatRoofs: false },
  tropical:  { sand: 0xe0cf9e, low: 0x4f8f2e, mid: 0x2e6b27, high: 0x55653a, rock: 0x6f6a5c, snow: 0xe9eef2, snowLine: 99999,
               sea: 0x0b4f6e, shallow: 0x2fb3a8, canopy: 0x2f7a2a, tree: 'broadleaf', treeMul: 1.1, bldMul: 1,
               walls: [0xf2ede2, 0xe9dcc0, 0xd8e0da, 0xf0d9b8], roofs: [0xa64b2f, 0x8a3b2a, 0x3c6e6a, 0x6b4a3a], flatRoofs: false },
  alpine:    { sand: 0x8f8a7a, low: 0x3d5a36, mid: 0x2b4630, high: 0x6b6a66, rock: 0x5e5f63, snow: 0xeef3f8, snowLine: 330,
               sea: 0x0c2f45, shallow: 0x28606e, canopy: 0x22402c, tree: 'conifer', treeMul: 1, bldMul: 0.7,
               walls: [0x6b4a32, 0x7a5a3e, 0xb8b4aa, 0x5a4636], roofs: [0x3a3f47, 0x4a3a30, 0x2f3338, 0x5c5f66], flatRoofs: false },
  desert:    { sand: 0xd9c08c, low: 0xc9a870, mid: 0xb58d5a, high: 0x9a7452, rock: 0x86654a, snow: 0xf2eee6, snowLine: 99999,
               sea: 0x0d4a66, shallow: 0x3fb0b0, canopy: 0x5a7a34, tree: 'broadleaf', treeMul: 0.12, bldMul: 1.2,
               walls: [0xe6d3aa, 0xd9c18e, 0xcdb48a, 0xefe2c4], roofs: [0xd9c18e, 0xcdb48a, 0xe6d3aa, 0xbfa57a], flatRoofs: true },
  arctic:    { sand: 0xc9d2d8, low: 0xdfe7ee, mid: 0xcfd9e2, high: 0x9aa3ab, rock: 0x5c636b, snow: 0xf4f8fb, snowLine: 25,
               sea: 0x0b2a3e, shallow: 0x3a7d96, canopy: 0x26402f, tree: 'conifer', treeMul: 0.35, bldMul: 0.5,
               walls: [0x7a2e26, 0x3f4a55, 0xb8b4aa, 0x5a4636], roofs: [0xe9eef2, 0xdfe7ee, 0xe9eef2, 0xcfd9e2], flatRoofs: false },
};
function biomeFor(id) { return BIOMES[id] || BIOMES.temperate; }

/* ---------------- ground objects ---------------- */
// Per-tier spawn CEILINGS (placement may fall short, never exceed).
const GROUNDOBJ_TIER = {
  low:    { rocks: 0,    trees: 0,    buildings: 0,   roads: 0 },
  medium: { rocks: 600,  trees: 250,  buildings: 0,   roads: 0 },
  high:   { rocks: 1400, trees: 1200, buildings: 350, roads: 8 },
};
const GROUNDOBJ_RADIUS = 12000;
const GROUNDOBJ_WATER_MARGIN = 4;       // trees/buildings reject terrainH < this; rocks reject < 0
const GROUNDOBJ_PLATFORM_CLEAR = 600;   // keep clear of the spawn platform at the origin
const GROUNDOBJ_BUILD_MAX_SLOPE = 0.35;
// Deterministic placement plan → [{type, x, z, rot, scale}]. terrainHFn is injected (keeps core
// THREE-free) and is the gameplay surface, not the visual detail layer. Retries are budgeted so a
// hostile heightfield can't loop forever. Optional biome scales tree/building density + tree line;
// trees grow in noise-gated forest patches, buildings in village clusters.
function planGroundObjects(seed, tier, terrainHFn, biome) {
  const caps = GROUNDOBJ_TIER[tier] || GROUNDOBJ_TIER.low;
  const out = [];
  if (typeof terrainHFn !== 'function') return out;
  const rng = makeRng(seed);
  const R = GROUNDOBJ_RADIUS, platSq = GROUNDOBJ_PLATFORM_CLEAR * GROUNDOBJ_PLATFORM_CLEAR, E = 14;
  const treeCap = Math.min(caps.trees, Math.round(caps.trees * (biome ? biome.treeMul : 1)));
  const bldCap = Math.min(caps.buildings, Math.round(caps.buildings * (biome ? biome.bldMul : 1)));
  const treeLine = biome ? Math.min(biome.snowLine + 60, 700) : 700;
  const slopeOk = (x, z, cap) => {
    const dhx = (terrainHFn(x + E, z) - terrainHFn(x - E, z)) / (2 * E);
    const dhz = (terrainHFn(x, z + E) - terrainHFn(x, z - E)) / (2 * E);
    return Math.hypot(dhx, dhz) <= cap;
  };
  function place(type, count, minH, slopeCap, accept) {
    let made = 0, tries = 0, budget = count * 12 + 64;
    while (made < count && tries < budget) {
      tries++;
      // radius deliberately NOT sqrt'd: denser near the origin
      const ang = rng() * TWO_PI, rad = rng() * R;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (x * x + z * z < platSq) continue;
      const h = terrainHFn(x, z);
      if (h < minH) continue;
      if (1 - clamp(rad / R, 0, 1) * 0.6 < rng()) continue;   // radial density falloff
      if (accept && !accept(x, z, h)) continue;
      if (slopeCap != null && !slopeOk(x, z, slopeCap)) continue;
      out.push({ type: type, x: x, z: z, rot: rng() * TWO_PI, scale: 0.7 + rng() * 0.9 });
      made++;
    }
    return made;
  }
  place('rock', caps.rocks, 0, null);
  const forest = (x, z, h) => h < treeLine && valueNoise2(x * 0.0011 + 3.3, z * 0.0011 - 8.1) > -0.15;
  place('tree', treeCap, GROUNDOBJ_WATER_MARGIN, null, forest);
  // villages: pick flat low-lying centres, then scatter buildings tightly around them
  if (bldCap > 0) {
    const centres = [];
    const nC = Math.max(1, Math.ceil(bldCap / 22));
    let tries = 0;
    while (centres.length < nC && tries++ < nC * 60) {
      const ang = rng() * TWO_PI, rad = rng() * R * 0.85;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      if (x * x + z * z < platSq * 2) continue;
      const h = terrainHFn(x, z);
      if (h < GROUNDOBJ_WATER_MARGIN + 6 || h > 260 || !slopeOk(x, z, GROUNDOBJ_BUILD_MAX_SLOPE * 0.6)) continue;
      centres.push({ x: x, z: z });
    }
    let made = 0; tries = 0;
    while (centres.length && made < bldCap && tries++ < bldCap * 14) {
      const c = centres[Math.floor(rng() * centres.length)];
      const a = rng() * TWO_PI, r = (rng() + rng()) * 0.5 * 420;   // triangular falloff → dense core
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (x * x + z * z < platSq || Math.hypot(x, z) > R) continue;
      if (terrainHFn(x, z) < GROUNDOBJ_WATER_MARGIN || !slopeOk(x, z, GROUNDOBJ_BUILD_MAX_SLOPE)) continue;
      out.push({ type: 'building', x: x, z: z, rot: Math.floor(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.3, scale: 0.7 + rng() * 0.9 });
      made++;
    }
  }
  place('road', caps.roads, GROUNDOBJ_WATER_MARGIN, GROUNDOBJ_BUILD_MAX_SLOPE);
  return out;
}

/* ---------------- input shaping ---------------- */
// dead-zone → renormalize → expo blend (linear↔cubic) → clamp; sign-preserving.
function shapeAxis(v, opts) {
  const dz = (opts && opts.deadzone) || 0;
  const ex = (opts && opts.expo) || 0;
  const a = Math.abs(v);
  if (a <= dz) return 0;
  const n = (a - dz) / (1 - dz);
  const curved = (1 - ex) * n + ex * n * n * n;
  return clamp(Math.sign(v) * curved, -1, 1);
}
// Tested invariants: deadzone casual > balanced > direct; sens direct > balanced > casual.
const AGGRESSION = {
  casual:   { deadzone: 0.18, expo: 0.55, sens: 0.75, maxAngle: 45, autoLevel: 2.2, pitchClamp: 0.70 },
  balanced: { deadzone: 0.10, expo: 0.35, sens: 1.00, maxAngle: 35, autoLevel: 1.2, pitchClamp: 0.85 },
  direct:   { deadzone: 0.05, expo: 0.15, sens: 1.35, maxAngle: 28, autoLevel: 0.4, pitchClamp: 1.00 },
};
function mapFlightInput(raw, preset, invert) {
  let v = shapeAxis(raw, preset) * (preset && preset.sens != null ? preset.sens : 1);
  v = clamp(v, -1, 1);
  return invert ? -v : v;
}
function motionAxis(angle, offset, maxAngle) {
  return clamp((angle - offset) / maxAngle, -1, 1);
}
function emaSmooth(prev, next, alpha) { return prev + alpha * (next - prev); }

// Mirrors the enemy gun-fire gate: engaged, can see the player, inside gun cone and range.
function enemyIsAimingPlayer(o) {
  return !!(o && o.engaged && o.canSee && o.ang < o.gunCone && o.dist < o.gunRange);
}

/* ---------------- fighter archetypes ---------------- */
// Exotic roles (baiter/decoy/pincer) ramp in with the wave; wave 1 is all duelists. Elites lean
// exotic but never to zero duelists.
function pickArchetype(rng, wave, opts) {
  opts = opts || {};
  const w = Math.max(0, wave || 0);
  let exotic = Math.min(0.5, 0.04 * Math.max(0, w - 1));
  if (opts.elite) exotic = Math.min(0.7, exotic + 0.25);
  const r = rng();
  if (r >= exotic) return 'duelist';
  const k = exotic > 0 ? (r / exotic) : 0;
  if (k < 1 / 3) return 'baiter';
  if (k < 2 / 3) return 'decoy';
  return 'pincer';
}
// Baiters juke only while the player is locking them and the jink cooldown has elapsed.
function shouldJink(o) {
  return !!(o && o.lockedByPlayer && (o.jinkCd == null || o.jinkCd <= 0));
}
// The partner orbits the opposite way so the pair brackets the player; a 0/missing sign counts as +1.
function pincerSign(selfSign) {
  return (selfSign < 0) ? 1 : -1;
}

/* ---------------- 2nd special slot ---------------- */
// Slot-2 pool: unlocked jets with a real ability, minus the flown jet (its ability is slot 1), in
// roster order. `unlockedJetIds` may be an array or an {id:true} map.
function equippableSpecials(unlockedJetIds, jetsRoster, currentJetId) {
  const has = Array.isArray(unlockedJetIds)
    ? (id => unlockedJetIds.indexOf(id) !== -1)
    : (id => !!(unlockedJetIds && unlockedJetIds[id]));
  return (jetsRoster || [])
    .filter(j => j && j.ability && j.id !== currentJetId && has(j.id))
    .map(j => ({ id: j.id, name: j.ability }));
}
function isEquippableSpecial(id, unlockedJetIds, jetsRoster, currentJetId) {
  return !!id && equippableSpecials(unlockedJetIds, jetsRoster, currentJetId).some(s => s.id === id);
}
// No tech mods here (OVERCLOCK/GHOST apply to slot 1 only).
function specialCooldownMax(id, cdTable, fallback) {
  const fb = (typeof fallback === 'number') ? fallback : 15;
  if (!id || !cdTable) return fb;
  const v = cdTable[id];
  return (typeof v === 'number' && v > 0) ? v : fb;
}

/* ---------------- frontier draft (R&D tech tree) ---------------- */
const DRAFT_OFFER_N = 3;
const DRAFT_PITY_THRESHOLD = 3; // a node skipped this many visits is force-included next offer

// OR-gate over node.req, AND-gate over node.reqAll. With ground off, hidden ground nodes are looked
// through to their own prerequisites.
function reqSatisfied(node, ownsFn, byId, groundOn) {
  const met = (id) => {
    const rn = byId[id];
    if (!groundOn && rn && rn.ground) return reqSatisfied(rn, ownsFn, byId, groundOn);
    return ownsFn(id);
  };
  if (node.reqAll && !node.reqAll.every(met)) return false;
  const req = node.req;
  if (!req) return true;
  return Array.isArray(req) ? req.some(met) : met(req);
}

// Applicable, prereqs met, and not owned (repeatables stay offerable).
function frontierEligible(nodes, fns) {
  const owns = (fns && fns.owns) || (() => false);
  const reqSatisfied = (fns && fns.reqSatisfied) || (() => true);
  const applicable = (fns && fns.applicable) || (() => true);
  return (nodes || [])
    .filter(n => n && applicable(n) && (n.repeat || !owns(n.id)) && reqSatisfied(n))
    .map(n => n.id);
}

// Unowned prereq chain to `targetId`, deepest first, target last (if unowned). OR-gates follow the
// first unowned parent; AND-gates include every unowned parent.
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
    if (ownsFn(id)) return;
    const reqAll = node.reqAll || [];
    for (let i = 0; i < reqAll.length; i++) visit(reqAll[i]);
    const req = node.req;
    if (req) {
      const list = Array.isArray(req) ? req : [req];
      let parent = null;
      for (let i = 0; i < list.length; i++) { if (!ownsFn(list[i])) { parent = list[i]; break; } }
      if (parent) visit(parent);
    }
    acc.push(id);
  };
  visit(targetId);
  return acc;
}

// Offer priority: pity-due nodes (oldest debt first) → pinned goal's path → seeded shuffle of the
// rest. Offered nodes' pity resets to 0; every other frontier node ages by one.
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

  const due = frontier.filter(id => (pityIn[id] || 0) >= DRAFT_PITY_THRESHOLD)
                      .sort((a, b) => (pityIn[b] || 0) - (pityIn[a] || 0));
  for (let i = 0; i < due.length; i++) take(due[i]);
  for (let i = 0; i < pinPath.length; i++) take(pinPath[i]);

  const rest = frontier.filter(id => !taken[id]);
  for (let i = rest.length - 1; i > 0; i--) {     // Fisher–Yates
    const j = Math.floor(rng() * (i + 1));
    const tmp = rest[i]; rest[i] = rest[j]; rest[j] = tmp;
  }
  for (let i = 0; i < rest.length; i++) take(rest[i]);

  const pityOut = {};
  for (let i = 0; i < frontier.length; i++) {
    const id = frontier[i];
    pityOut[id] = taken[id] ? 0 : (pityIn[id] || 0) + 1;
  }
  return { offer, pity: pityOut };
}

/* ---------------- recon + stealth (waypoint missions) ---------------- */
function _wpDist2(a, b) {
  const dx = a.x - b.x, dy = (a.y || 0) - (b.y || 0), dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

// Mutates waypoints in place: a hit waypoint stays hit. nextIndex = first unhit, -1 when done.
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

function nextWaypoint(waypoints) {
  for (let i = 0; i < waypoints.length; i++) if (!waypoints[i].hit) return waypoints[i];
  return null;
}

// Raw signed per-frame meter delta; the CALLER clamps to 0..1. The meter is pre-detection pressure,
// never a fail bar (ADR-0006): reaching 1 triggers go-loud, and once blown it is frozen.
// Priority: patrol cone-LOS (fastest) > firing/being aimed at > proximity ring > decay.
function detectionDelta(o) {
  const dt = o.dt || 0;
  const rise = (o.riseRate == null ? 1 : o.riseRate);
  const decay = (o.decayRate == null ? 1 : o.decayRate);
  if (o.blown) return 0;
  const coneLOS = o.coneLOS || 0;
  if (coneLOS > 0) return rise * coneLOS * (o.coneMul == null ? 1.8 : o.coneMul) * dt;
  if (o.firing || o.beingAimed) return rise * dt;
  const prox = o.proximity || 0;
  if (prox > 0) return rise * prox * dt;
  return -decay * dt;
}

function reconWon(m) {
  const w = (m.params && m.params.waypoints) || [];
  return w.length > 0 && w.every(p => p.hit);
}
// ADR-0006: stealth wins only by reaching the extraction waypoint; the only fail is death (caller).
function stealthWon(m) {
  return reconWon(m);
}

/* ---------------- HUD instruments + units ---------------- */
// Full scale: 1000 kt airspeed, 20000 ft altitude arc. Angles pre-clamped so the CSS only rotates.
function instrumentState(kt, altFt, throttle) {
  kt = Math.max(0, kt | 0);
  altFt = Math.max(0, altFt | 0);
  const thr = Math.min(1, Math.max(0, +throttle || 0));
  const spdFrac = Math.min(1, kt / 1000);
  const altFrac = Math.min(1, altFt / 20000);
  return {
    spdKt: kt, altFt: altFt,
    spdFrac: spdFrac, altFrac: altFrac, thrFrac: thr,
    spdDeg: spdFrac * 240 - 120,
    thrDeg: thr * 270 - 135,
    altDeg: (altFt % 1000) / 1000 * 360,     // hundreds hand: 1 rev / 1000 ft
    altDegK: (altFt % 10000) / 10000 * 360,  // thousands hand: 1 rev / 10000 ft
  };
}

// The sim carries knots + feet; the readout is mph/ft (imperial, default) or kph/m (metric).
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

/* ---------------- campaign progression ---------------- */
// `campaign` = meta.campaign ({ [opId]: { unlocked, furthest, levels: { [levelId]: {cleared,bestScore,bestStars} } } });
// `ops` = OPERATIONS, injected so this file stays load-order-free. Store wrappers live in meta.js.
const LEVEL_WAVE_MIN = 2;
const LEVEL_WAVE_CAP = 4;
// A level row's literal `waves` overrides this at the call site.
function campaignWaveCount(index, cap) {
  return clamp(2 + (index >> 1), LEVEL_WAVE_MIN, cap === undefined ? LEVEL_WAVE_CAP : cap);
}
function levelCleared(wavesCleared, totalWaves, missionDone) {
  return wavesCleared >= totalWaves && !!missionDone;
}
function _levelIsCleared(campaign, opId, levelId) {
  const op = campaign && campaign[opId];
  return !!(op && op.levels && op.levels[levelId] && op.levels[levelId].cleared);
}
// Unlocked iff first, or the previous op's last (boss) level is cleared.
function isOpUnlocked(campaign, ops, opId) {
  const idx = ops.findIndex(o => o.id === opId);
  if (idx < 0) return false;
  if (idx === 0) return true;
  const prev = ops[idx - 1];
  const last = prev.levels[prev.levels.length - 1];
  return _levelIsCleared(campaign, prev.id, last.id);
}
function isLevelUnlocked(campaign, ops, opId, levelIndex) {
  if (!isOpUnlocked(campaign, ops, opId)) return false;
  const op = ops.find(o => o.id === opId);
  if (!op || levelIndex < 0 || levelIndex >= op.levels.length) return false;
  if (levelIndex === 0) return true;
  return _levelIsCleared(campaign, opId, op.levels[levelIndex - 1].id);
}
function levelState(campaign, ops, opId, levelIndex) {
  const op = ops.find(o => o.id === opId);
  if (!op || levelIndex < 0 || levelIndex >= op.levels.length) return 'locked';
  if (_levelIsCleared(campaign, opId, op.levels[levelIndex].id)) return 'cleared';
  return isLevelUnlocked(campaign, ops, opId, levelIndex) ? 'unlocked' : 'locked';
}
function _cloneOpRec(rec) {
  const c = { unlocked: !!rec.unlocked, furthest: rec.furthest || 0, levels: {} };
  if (rec.levels) for (const id in rec.levels) {
    const r = rec.levels[id];
    c.levels[id] = { cleared: !!r.cleared, bestScore: r.bestScore || 0, bestStars: r.bestStars || 0 };
  }
  return c;
}
// Returns a NEW map (input never mutated); best score/stars fold monotonically. Unknown op/level → input.
function markLevelCleared(campaign, ops, opId, levelIndex, score, stars, levelId) {
  const op = ops.find(o => o.id === opId);
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
// Checkpoint value copies. On rollback the glue must RE-DERIVE player stats (commitNode mutates
// derived stats in place), not just restore these.
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
// Replays re-grant rewards by design (farmable); pass farmable=false to make a replay grant nothing.
const CAMPAIGN_REPLAY_REWARDS = true;
function grantLevelRewards(index, isBoss, alreadyCleared, farmable) {
  const farm = (farmable === undefined) ? CAMPAIGN_REPLAY_REWARDS : farmable;
  if (alreadyCleared && !farm) return { rp: 0, score: 0 };
  return { rp: 40 + 20 * index + (isBoss ? 150 : 0), score: 1000 + 500 * index + (isBoss ? 5000 : 0) };
}

// Objective descriptors are a sector-type string or { type, wp?, spawn? }.
function objectiveTypes(objectives) {
  if (!Array.isArray(objectives)) return [];
  return objectives.map(o => (o && typeof o === 'object') ? o.type : o);
}
// -1 once the sequence is exhausted (level complete).
function nextObjectivePhase(idx, total) {
  return (idx + 1 < total) ? idx + 1 : -1;
}

// Multi-phase levels run a STRIKE phase with spawn.ground false, so strikeWaveActive is never set
// then — gating on the flag alone hangs the level. Also resolve off the live mission type.
function strikeSiteResolves(strikeWaveActive, missionType) {
  return !!strikeWaveActive || missionType === 'strike';
}

// Bounded levels spawn a fixed air budget, but the procedural kill target grows with the wave and
// could exceed it (the wave would never clear). Clamp to what actually spawned. Per-verb counts
// mirror missionKill's crediting. null = not a kill objective (target left as startMission set it).
function campaignSpawnedKillCount(verb, spawn) {
  const s = spawn || {};
  if (verb === 'sweep') return (s.fighters || 0) + (s.aces || 0);
  if (verb === 'intercept') return (s.bombers || 0);
  if (verb === 'strike') return 1;
  return null;
}
// NOTE: missions.js MISSIONS[verb].setup repeats these formulas inline — keep them in sync.
function campaignProceduralTarget(verb, wave) {
  if (verb === 'sweep') return Math.min(4 + (wave >> 1), 10);
  if (verb === 'intercept') return wave >= 8 ? 4 : 3;
  if (verb === 'strike') return 1;
  return null;
}
function campaignClearTarget(verb, wave, spawn) {
  const killable = campaignSpawnedKillCount(verb, spawn);
  if (killable === null) return null;
  return Math.min(campaignProceduralTarget(verb, wave), killable);
}

/* ---------------- kill rewards / combo / killstreak ---------------- */
const COMBO_TIMER = 2.2;          // seconds the combo stays alive after a hit
const KILLSTREAK_INTERVAL = 5;    // a streak reward fires every Nth kill

// Score scales by the POST-increment combo. Returns deltas.
function awardHit(state, event) {
  const combo = (state.combo || 0) + 1;
  const scoreMul = event.scoreMul == null ? 1 : event.scoreMul;
  const score = Math.round(event.amt * (1 + combo * 0.05) * scoreMul);
  return { combo: combo, comboTimer: COMBO_TIMER, score: score };
}

// RP by source: player kill, escort CCA (half), or an assist (player dealt > 0.5 damage).
// streakReward: this kill lands on a KILLSTREAK_INTERVAL boundary.
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

/* ---------------- lock-on ---------------- */
// sample = { acquiring, dt, rate (s to full lock), decayRate (s to bleed a full lock) }.
// justLocked is true only on the <1 → >=1 crossing frame, so lock-tone side effects fire once.
function advanceLock(lock, sample) {
  const prev = (lock && lock.progress) || 0;
  const progress = sample.acquiring
    ? Math.min(1, prev + sample.dt / sample.rate)
    : Math.max(0, prev - sample.dt / sample.decayRate);
  const locked = progress >= 1;
  return { progress: progress, locked: locked, justLocked: locked && prev < 1 };
}

// On an enemy death: drop a matching locked target, or a matching candidate (resetting progress).
function clearLockIf(lock, deadTarget) {
  const candidateDead = lock.candidate === deadTarget;
  return {
    target: lock.target === deadTarget ? null : lock.target,
    candidate: candidateDead ? null : lock.candidate,
    progress: candidateDead ? 0 : lock.progress,
  };
}

/* ---------------- kill-streak momentum ---------------- */
// Kills within `window` seconds of the LAST kill chain; the multiplier steps up at `counts`.
const STREAK = { window: 6, counts: [3, 6, 10], mults: [1, 1.5, 2, 3] };
// tierUp flags a multiplier increase (caller banners once per crossing); 'death' hard-resets.
function streakStep(streak, event, now) {
  const base = STREAK.mults[0];
  const s = (streak && typeof streak.count === 'number') ? streak : { count: 0, mult: base, t: 0 };
  if (event === 'death') return { count: 0, mult: base, t: 0, tierUp: false };
  const lapsed = now > (s.t || 0) + STREAK.window;
  const count = lapsed ? 1 : s.count + 1;
  let mult = base;
  for (let i = 0; i < STREAK.counts.length; i++) if (count >= STREAK.counts[i]) mult = STREAK.mults[i + 1];
  return { count: count, mult: mult, t: now, tierUp: mult > (s.mult || base) };
}

/* ---------------- wingman command wheel ---------------- */
// Real transitions carry a banner key; no-ops return banner null. Only ENGAGE falls back to FREE on
// 'targetLost' / 'lockLost'.
const WINGMAN_ORDERS = ['FREE', 'ENGAGE', 'COVER', 'REGROUP'];
const WINGMAN_ORDER_BANNER = {
  FREE: 'banner.wingmanFree', ENGAGE: 'banner.wingmanEngage',
  COVER: 'banner.wingmanCover', REGROUP: 'banner.wingmanRegroup',
};
function wingmanOrder(state, cmd) {
  const cur = WINGMAN_ORDERS.indexOf(state) >= 0 ? state : 'FREE';
  if (cmd === 'targetLost' || cmd === 'lockLost') {
    return cur === 'ENGAGE' ? { order: 'FREE', banner: 'banner.wingmanBreak' } : { order: cur, banner: null };
  }
  if (WINGMAN_ORDERS.indexOf(cmd) >= 0) {
    return cmd === cur ? { order: cur, banner: null } : { order: cmd, banner: WINGMAN_ORDER_BANNER[cmd] };
  }
  return { order: cur, banner: null };
}

/* ---------------- enemy defensive AI ---------------- */
// Randomness stays in the caller (entities.js applyEvade). The break reuses updateEnemy's _jinkT
// lateral break — no bespoke turnRate write that could fight the boss-phase ramp.
const EVADE = {
  breakDur: 1.5,
  breakTurnMul: 1.6,      // matches updateEnemy's _jinkT block
  cooldown: 2.2,
  lockTrigger: 0.5,       // player lock-progress on THIS enemy that provokes an evade
  missileDist: 900,       // nearest inbound player-missile distance that provokes an evade
  flareSpoofChance: 0.45, // per enemy flare vs a player missile (combat.js updateMissiles)
};
// 'none' below both triggers or inside the cooldown; 'flare' for an inbound missile with flares left
// (decrements them); otherwise 'break'.
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
// Priority: incoming missile → 'evade'; too close → 'extend'; sticky extend until 1.25×pref (hysteresis);
// a locked decoy keeps standoff to 1.6×pref; else 'engage'.
function enemyTacticalState(prev, o) {
  o = o || {};
  const dist = o.dist || 0;
  const prefRange = o.prefRange || 0;
  const nearRange = o.nearRange || 0;
  if (o.incoming) return 'evade';
  if (dist < nearRange) return 'extend';
  if (prev === 'extend' && dist < prefRange * 1.25) return 'extend';
  if (o.archetype === 'decoy' && o.lockedByPlayer && dist < prefRange * 1.6) return 'extend';
  return 'engage';
}
// Engage-state tracking timer. Draw order (gunRun rand, then gunRunCd rand) is part of the contract.
function gunRunCadence(state, dt) {
  state = state || {};
  let gunRun = state.gunRun || 0;
  let gunRunCd = state.gunRunCd || 0;
  gunRunCd -= dt;
  if (gunRun > 0) gunRun -= dt;
  else if (gunRunCd <= 0) { gunRun = rand(1.6, 2.8); gunRunCd = rand(2.2, 4.2); }
  return { gunRun, gunRunCd, tracking: gunRun > 0 };
}

/* ---------------- gun overheat ---------------- */
// At heat 1 the gun locks out until it cools below `rearm`. A locked gun can't fire, so heat always
// bleeds during lockout — a held trigger can't pin it hot. rise 0.20/s → 5 s to lock, keeping the
// ≥4 s continuous-fire balance guard; decay 0.40/s → ~1.6 s lockout.
const HEAT = { rise: 0.20, decay: 0.40, rearm: 0.35 };
// justLocked / justArmed fire only on the frame the lock flips.
function heatStep(state, firing, dt) {
  const wasLocked = !!(state && state.locked);
  const prevHeat = (state && state.heat) || 0;
  const building = firing && !wasLocked;
  const heat = clamp(prevHeat + (building ? HEAT.rise : -HEAT.decay) * dt, 0, 1);
  let locked = wasLocked, justLocked = false, justArmed = false;
  if (!wasLocked && heat >= 1)             { locked = true;  justLocked = true; }
  else if (wasLocked && heat < HEAT.rearm) { locked = false; justArmed = true; }
  return { heat: heat, locked: locked, justLocked: justLocked, justArmed: justArmed };
}

/* ---------------- enemy formations ---------------- */
// Slots are LOCAL offsets in the leader's frame: +x = leader's right, +z = BEHIND the leader.
const FORMATION_ENGAGE_RANGE = 1200;
const FORMATIONS = {
  vee:     { spacing: 190, engageRange: FORMATION_ENGAGE_RANGE },
  wall:    { spacing: 210, engageRange: FORMATION_ENGAGE_RANGE },
  echelon: { spacing: 200, engageRange: FORMATION_ENGAGE_RANGE },
  pincer:  { spacing: 220, engageRange: FORMATION_ENGAGE_RANGE },
};
// n offsets; slot 0 = leader at the origin.
function formationSlots(type, n, spacing) {
  const s = spacing || (FORMATIONS[type] && FORMATIONS[type].spacing) || 200;
  const slots = [{ x: 0, z: 0 }];
  const fc = Math.max(0, (n | 0) - 1);
  const tmpl = FORMATIONS[type] && FORMATIONS[type].slots;   // content-pack formation
  if (tmpl && tmpl.length) {
    // Template slots are in spacing units; extra followers repeat it one template-depth further back.
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
    for (let i = 1; i <= fc; i++) {
      const rank = Math.ceil(i / 2), side = (i % 2 === 1) ? 1 : -1;
      slots.push({ x: side * rank * s, z: 0 });
    }
  } else if (type === 'echelon') {
    for (let i = 1; i <= fc; i++) slots.push({ x: i * s, z: i * s });
  } else if (type === 'pincer') {
    // two flanks with a clear central gap (min |x| = 2s)
    for (let i = 1; i <= fc; i++) {
      const rank = Math.ceil(i / 2), side = (i % 2 === 1) ? 1 : -1;
      slots.push({ x: side * s * (rank + 1), z: rank * s * 0.5 });
    }
  } else {
    // vee: ± pairs trailing the leader; an odd leftover trails on the centreline
    const pairs = Math.floor(fc / 2);
    for (let r = 1; r <= pairs; r++) {
      slots.push({ x:  r * s, z: r * s });
      slots.push({ x: -r * s, z: r * s });
    }
    if (fc % 2 === 1) slots.push({ x: 0, z: (pairs + 1) * s });
  }
  return slots;
}
function formationBreak(distToPlayer, leaderAlive, cfg) {
  if (!leaderAlive) return true;
  const range = (cfg && cfg.engageRange) || FORMATION_ENGAGE_RANGE;
  return distToPlayer <= range;
}

/* ---------------- veterancy ---------------- */
const VET_THRESHOLDS = [25, 75, 150, 300, 600];
function vetRank(kills) {
  var k = kills > 0 ? kills : 0;
  var r = 0;
  for (var i = 0; i < VET_THRESHOLDS.length; i++) if (k >= VET_THRESHOLDS[i]) r = i + 1;
  return r;
}

/* ---------------- run-mode policy ---------------- */
// opensTechShop: a wave clear always opens the hub (campaign); endless/daily/weekly use the
// shouldOpenTechScreen cadence; bossRush has no shop.
const MODE_POLICY = {
  endless:  { bounded: false, opensTechShop: false },
  campaign: { bounded: true,  opensTechShop: true  },
  daily:    { bounded: false, opensTechShop: false },
  weekly:   { bounded: false, opensTechShop: false },
  bossRush: { bounded: false, opensTechShop: false },
};
// The mode flags are mutually exclusive at runtime; precedence mirrors that.
function modeKeyFor(f) {
  f = f || {};
  if (f.bossRush) return 'bossRush';
  if (f.campaignMode || f.opMode) return 'campaign';
  if (f.weeklyActive) return 'weekly';
  if (f.dailyMode) return 'daily';
  return 'endless';
}

/* ---------------- weekly challenge ---------------- */
// ISO-8601 weeks from a 'YYYY-MM-DD' string with integer math only (no Date), so one ISO week yields
// the same seed on any weekday in any timezone.
function wkIsLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function wkDayOfYear(y, m, d) {
  var cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  var ord = cum[(m - 1) | 0] + (d | 0);
  if (m > 2 && wkIsLeap(y)) ord += 1;
  return ord;
}
// ISO weekday Mon=1..Sun=7 via Sakamoto's congruence
function wkIsoDow(y, m, d) {
  var t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  var yy = m < 3 ? y - 1 : y;
  var dow = (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[(m - 1) | 0] + d) % 7; // 0=Sun
  return ((dow + 6) % 7) + 1;
}
function wkWeeksInYear(y) {
  var p = function (yr) { return ((yr + Math.floor(yr / 4) - Math.floor(yr / 100) + Math.floor(yr / 400)) % 7 + 7) % 7; };
  return (p(y) === 4 || p(y - 1) === 3) ? 53 : 52;
}
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
// '2026-07-13' → '2026-W29'
function weekIdFor(dateStr) {
  var p = isoWeekParts(dateStr);
  return p.weekYear + '-W' + ('0' + p.week).slice(-2);
}
function weeklySeedFor(dateStr) {
  var p = isoWeekParts(dateStr);
  return _mix32(((p.weekYear | 0) * 54 + (p.week | 0)) | 0);
}
// `effects` schema is shared with content-pack modifiers (PACK_LIMITS.effectKeys).
var WEEKLY_MODIFIERS = [
  { id: 'stormFront', effects: { lockWeather: 'storm' } },
  { id: 'noFlares',   effects: { flares: 0 } },
  { id: 'noMissiles', effects: { missiles: 0 } },
  { id: 'doubleAces', effects: { extraAces: 1 } },
  { id: 'heavyWing',  effects: { turnMul: 0.6 } },
];
// 2 distinct modifiers; the weekly runtime passes the pack-extended pool.
function weeklyModifiers(seed, pool) {
  var rng = makeRng(seed);
  pool = (pool || WEEKLY_MODIFIERS).slice();
  var out = [];
  for (var k = 0; k < 2 && pool.length; k++) {
    var i = Math.floor(rng() * pool.length);
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}

/* ---------------- wing-node routing ---------------- */
// These tech nodes open the wingman airframe picker instead of buying immediately.
const WING_NODES = new Set(['w1', 'w2', 'reserve']);
function routesToWingPicker(nodeId) { return WING_NODES.has(nodeId); }

/* ---------------- content packs ---------------- */
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
// `formations` = the merged table so far (collisions checked against it); `modIds` = ids already in
// the modifier pool. Packs are self-contained: a wave row may only reference base formations or
// ones defined in THIS pack.
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
// Validates packs IN ORDER against the progressively merged tables. A valid pack merges its
// formations INTO `formations` (mutated — the browser passes the live FORMATIONS); a rejected pack
// contributes nothing.
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
// Merge rules for overlapping knobs: flares/missiles MIN (harsher wins), extraAces SUM, turnMul
// MULTIPLY, lockWeather last in pool order.
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
// The fixed xor decouples this from the modifier draw, so adding patterns never reshuffles the mods.
function weeklyWavePattern(seed, patterns) {
  if (!patterns || !patterns.length) return null;
  var rng = makeRng((seed ^ 0x5f356495) >>> 0);
  return patterns[Math.floor(rng() * patterns.length)];
}

/* ---------------- campaign allies: convoys, raids, escort/intercept outcomes ---------------- */
// Friendly mission units live in `allies` (missions.js), never `enemies`.
// Follow a polyline; `leg` = index of the NEXT point. Overshoot carries into the next leg so fast
// units never stall on a corner; the unit parks at the last point (done).
function convoyStep(state, route, speed, dt) {
  let x = state.x, z = state.z, leg = state.leg || 0;
  let budget = Math.max(0, speed * dt), dirX = 0, dirZ = -1;
  if (!route || !route.length) return { x: x, z: z, leg: leg, done: true, dirX: dirX, dirZ: dirZ };
  while (leg < route.length) {
    const tx = route[leg].x - x, tz = route[leg].z - z, d = Math.hypot(tx, tz);
    if (d > 1e-6) { dirX = tx / d; dirZ = tz / d; }
    if (d > budget) { x += dirX * budget; z += dirZ * budget; budget = 0; break; }
    x = route[leg].x; z = route[leg].z; budget -= d; leg++;
    if (budget <= 0) break;
  }
  return { x: x, z: z, leg: leg, done: leg >= route.length, dirX: dirX, dirZ: dirZ };
}
// Raider cycle inbound → strafe → extend → inbound. It drops to 'engage' only when the player actually
// threatens it (recent hit, nose on it inside threatR, or very close) — merely flying near the convoy
// protects nothing — and resumes once the player is well clear.
const RAID = { strafeR: 1000, passR: 170, extendTime: 3.2, closeR: 450, threatR: 1500, engageHit: 3.5, resumeR: 2400 };
function raidMode(prev, o) {
  const hitAgo = (o.hitAgo == null) ? 99 : o.hitAgo;
  const pressed = hitAgo < RAID.engageHit || o.dPlayer < RAID.closeR || (!!o.threatened && o.dPlayer < RAID.threatR);
  if (prev === 'engage') {
    if (!pressed && o.dPlayer > RAID.resumeR && hitAgo > RAID.engageHit * 2) return { mode: 'inbound', extendT: 0 };
    return { mode: 'engage', extendT: 0 };
  }
  if (pressed) return { mode: 'engage', extendT: 0 };
  if (prev === 'extend') {
    const t = (o.extendT || 0) - (o.dt || 0);
    return t > 0 ? { mode: 'extend', extendT: t } : { mode: 'inbound', extendT: 0 };
  }
  if (prev === 'strafe') {
    if (o.dTarget < RAID.passR || o.dTarget > RAID.strafeR * 1.35) return { mode: 'extend', extendT: RAID.extendTime };
    return { mode: 'strafe', extendT: 0 };
  }
  return o.dTarget < RAID.strafeR ? { mode: 'strafe', extendT: 0 } : { mode: 'inbound', extendT: 0 };
}
// enRoute = alive and not yet delivered. Fails as soon as `required` is out of reach.
function escortOutcome(enRoute, delivered, required) {
  if (delivered + enRoute < required) return 'failed';
  if (enRoute === 0 && delivered >= required) return 'won';
  return 'active';
}
// Everything spawned and too few left to reach the target → fail early (a bomber got through).
function interceptDoomed(progress, target, aliveTargets, spawnedAll) {
  return !!spawnedAll && progress + aliveTargets < target;
}

// Node tests only; in the browser `module` is undefined and every symbol above is a plain global.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    reqSatisfied,
    TWO_PI, DEG, clamp, lerp, rand, randInt, damp,
    NIGHT_RADAR_MUL, WEATHER, resolveWeather, rollWeather,
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
    resolveQuality,
    TERRAIN_TIER, SEA_TIER, terrainDetailH, valueNoise2, terrainHeight, TERRAIN_MAX_H, BIOMES, biomeFor,
    FOG_CLEAR_DENSITY, FOG_ACTIVE_DENSITY, fogDensityFor,
    GROUNDOBJ_TIER, GROUNDOBJ_RADIUS, GROUNDOBJ_WATER_MARGIN, GROUNDOBJ_PLATFORM_CLEAR, GROUNDOBJ_BUILD_MAX_SLOPE, planGroundObjects,
    shapeAxis, AGGRESSION, mapFlightInput, motionAxis, emaSmooth,
    enemyIsAimingPlayer,
    reconProgress, nextWaypoint, detectionDelta, reconWon, stealthWon,
    pickArchetype, shouldJink, pincerSign,
    equippableSpecials, isEquippableSpecial, specialCooldownMax,
    DRAFT_OFFER_N, DRAFT_PITY_THRESHOLD, frontierEligible, prereqPath, draftOffer,
    instrumentState, speedDisplay, altDisplay, KT_TO_MPH, KT_TO_KPH, FT_TO_M,
    LEVEL_WAVE_MIN, LEVEL_WAVE_CAP, campaignWaveCount, levelCleared,
    isOpUnlocked, isLevelUnlocked, levelState, markLevelCleared,
    captureSnapshot, rollbackSnapshot, grantLevelRewards, CAMPAIGN_REPLAY_REWARDS,
    objectiveTypes, nextObjectivePhase, strikeSiteResolves,
    campaignSpawnedKillCount, campaignProceduralTarget, campaignClearTarget,
    COMBO_TIMER, KILLSTREAK_INTERVAL, awardHit, awardKill,
    advanceLock, clearLockIf,
    STREAK, streakStep,
    WINGMAN_ORDERS, wingmanOrder,
    EVADE, evadeDecision, enemyTacticalState, gunRunCadence,
    HEAT, heatStep,
    FORMATIONS, formationSlots, formationBreak,
    VET_THRESHOLDS, vetRank,
    MODE_POLICY, modeKeyFor,
    weeklySeedFor, weekIdFor, WEEKLY_MODIFIERS, weeklyModifiers,
    WING_NODES, routesToWingPicker,
    PACK_LIMITS, validatePack, applyContentPacks, weeklyEffectsFor, weeklyWavePattern,
    convoyStep, RAID, raidMode, escortOutcome, interceptDoomed,
  };
}
