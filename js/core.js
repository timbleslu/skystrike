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
const WEATHER = {
  clear: { radarMul: 1.0, lockRangeMul: 1.0,  lockSpeedMul: 1.0,  turbulence: 0.0,  fogMul: 1.0 },
  fog:   { radarMul: 0.8, lockRangeMul: 0.65, lockSpeedMul: 1.15, turbulence: 0.0,  fogMul: 3.0 },
  storm: { radarMul: 0.7, lockRangeMul: 0.6,  lockSpeedMul: 1.35, turbulence: 0.0, fogMul: 1.6 },
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
// the step index never decreases, and DONE (4) is a terminal absorbing state.
const TUTORIAL_STEPS = ['pitch', 'throttle', 'guns', 'missile'];
const TUTORIAL_DONE = TUTORIAL_STEPS.length;   // 4
// the event that satisfies each step, by step index
const TUTORIAL_EVENT_FOR_STEP = ['pitched', 'throttled', 'fired', 'missile'];
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
// AWACS_COSTS = RP price per call; AWACS_USES_MAX = how many times each may be called per sector.
const AWACS_COSTS    = { strike: 140, resupply: 90, jam: 70 };
const AWACS_USES_MAX = { strike: 1,   resupply: 1,  jam: 2 };
const AWACS_JAM_TIME = 8;   // seconds enemy missiles stay blinded by a jamming call
// PURE resolver: given a snapshot {rp, uses:{strike,resupply,jam}}, the cost+cap tables, and a call
// key, returns a NEW snapshot. ok=false (state unchanged) when the call is unknown, capped out, or
// unaffordable. reason: 'unknown' | 'empty' (no uses left) | 'noRp' (can't afford) | 'ok'.
function awacsCall(state, costs, max, key) {
  const cost = costs[key], cap = max[key];
  if (cost === undefined || cap === undefined) return { ok: false, reason: 'unknown', rp: state.rp, uses: state.uses };
  const used = state.uses[key] || 0;
  if (used >= cap) return { ok: false, reason: 'empty', rp: state.rp, uses: state.uses };
  if (state.rp < cost) return { ok: false, reason: 'noRp', rp: state.rp, uses: state.uses };
  const uses = { strike: state.uses.strike || 0, resupply: state.uses.resupply || 0, jam: state.uses.jam || 0 };
  uses[key] = used + 1;
  return { ok: true, reason: 'ok', rp: state.rp - cost, uses: uses };
}
// AWACS effect/banner table — which outcome a SUCCESSFUL call applies, and its banner i18n key.
const AWACS_EFFECTS = { strike: 'awacs.strike', resupply: 'awacs.resupply', jam: 'awacs.jam' };
// PURE adapter decision: wrap awacsCall, then attach what combat.js must imperatively do. On success
// `effect` is the call key (strike/resupply/jam) and `banner` its success message; combat.js commits
// {rp, uses} and applies `effect`. On failure `effect` is null and `banner` is the failure message
// key (or null for an unknown key → caller plays a neutral ui sound). The ENTIRE "which message,
// which effect, allowed?" decision lives here (tested); combat.js only mutates game state + plays SFX.
function awacsResolve(state, costs, max, key) {
  const r = awacsCall(state, costs, max, key);
  if (!r.ok) {
    const banner = r.reason === 'noRp' ? 'awacs.noRp' : r.reason === 'empty' ? 'awacs.empty' : null;
    return { ok: false, reason: r.reason, rp: r.rp, uses: r.uses, effect: null, banner };
  }
  return { ok: true, reason: 'ok', rp: r.rp, uses: r.uses, effect: key, banner: AWACS_EFFECTS[key] };
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

/* ---------------- graphics-quality core (F11) ---------------- */
const GFX_TIERS = ['auto', 'low', 'high'];
// PURE — resolve the effective render tier ('low'|'high') from the gfxQuality setting plus a cheap
// device heuristic. Explicit 'low'/'high' pass through; 'auto' (and any unknown value) picks 'low'
// for touch devices on a non-flagship pixel ratio (dpr <= 2), else 'high'. The fps sample (which
// headless cannot measure) is layered on at the impure call site (refreshGfxTier in globals.js).
function resolveQuality(setting, dpr, isTouch) {
  if (setting === 'low' || setting === 'high') return setting;
  return (isTouch && dpr <= 2) ? 'low' : 'high';
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

/* ===================================================================
   CommonJS export — Node tests only. In the browser `module` is undefined, so this whole block
   is skipped and every symbol above remains a plain browser global (no behavioural change).
   =================================================================== */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TWO_PI, DEG, clamp, lerp, rand, randInt, damp,
    NIGHT_RADAR_MUL, WEATHER, resolveWeather, turbSample, rollWeather,
    BOSS_PHASE2_HP, BOSS_PHASE3_HP, bossPhaseFor, nextBossPhase,
    BOSS_RUSH_POOL, BOSS_RUSH_TOTAL, bossRushNext, bossRushDone, betterTime,
    TUTORIAL_STEPS, TUTORIAL_DONE, TUTORIAL_EVENT_FOR_STEP, tutorialNext,
    makeRng, dailySeedFor,
    CAMSHAKE_RATE, CAMSHAKE_K, decayShake,
    AWACS_COSTS, AWACS_USES_MAX, AWACS_JAM_TIME, AWACS_EFFECTS, awacsCall, awacsResolve,
    rollDetect, rollCooldownGate,
    STEER, steerCommand,
    GFX_TIERS, resolveQuality,
    shapeAxis, AGGRESSION, mapFlightInput, motionAxis, emaSmooth,
  };
}
