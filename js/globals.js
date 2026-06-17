/* SKYSTRIKE — globals.js: constants, jet roster, tech tree, global state, math & vector helpers. Load 1st (after three.js). */

/* =====================================================================
   SKYSTRIKE :: ACE PROTOCOL  —  low-poly arcade flight combat
   ===================================================================== */

/* ---------------- math helpers ---------------- */
// TWO_PI, DEG, clamp, lerp, rand, randInt, damp → core.js (pure, require-safe; loaded before this file).

/* ---------------- jet roster ---------------- */
// JETS roster + aceShapePool/jetNameForShape → js/roster.js (require-safe, loaded before this file). jetStats stays here (call-site uses lerp from core.js).
function jetStats(j) {
  return {
    maxSpeed: 150 + j.speed * 26,
    minSpeed: 58 + j.speed * 3,
    turnRate: 0.8 + j.agility * 0.17,
    accel: 0.55 + j.accel * 0.12,
    maxHp: 45 + j.armor * 16,
    gunDmg: 6 + j.firepower * 0.95,
    missiles: Math.round(16 + j.firepower * 3),
    stealth: j.stealth,
    detect: lerp(1.32, 0.55, (j.stealth - 1) / 9),
  };
}

/* ---------------- globals ---------------- */
let scene, camera, renderer, clock, sun;
let skyMat, sunDisc, ambientLight, hemiLight, starsMat, rimLight, haloA, haloB;
let timeOfDay = 0;
const TODS = [
  // intensities are physical-light scaled (useLegacyLights = false ≈ legacy × π)
  { key: 'DAY',  top: 0x0a1c44, hor: 0x2a6a7a, bot: 0x1d4a63, fog: 0x0a1424, sun: 0xfff0d6, sunI: 4.2, amb: 0.95, hemi: 0.75, rim: 1.25, stars: 0.0,  disc: 0xfff3d0, sunY: 1.0 },
  { key: 'DUSK', top: 0x1a2150, hor: 0xe08a44, bot: 0x5a3340, fog: 0x2a1a28, sun: 0xffb060, sunI: 3.6, amb: 0.7, hemi: 0.6, rim: 1.1, stars: 0.35, disc: 0xffcf88, sunY: 0.32 },
  { key: 'NIGHT', top: 0x02030f, hor: 0x0c1832, bot: 0x070d1c, fog: 0x05070f, sun: 0x9fb6ff, sunI: 1.7, amb: 0.55, hemi: 0.5, rim: 0.95, stars: 1.0, disc: 0xcdd8ff, sunY: 0.6 },
];

/* ---------------- weather (feature #4: weather + TOD gameplay) ---------------- */
// Live weather modifiers — engine.js applyWeather writes these; combat.js (lock + turbulence),
// ui.js (radar + HUD chip) and engine.js (fog/sky) read them. Default clear = neutral (no-op).
let weather = { type: 'clear', radarMul: 1.0, lockRangeMul: 1.0, lockSpeedMul: 1.0, turbulence: 0.0, fogMul: 1.0 };
let weatherT = 0;            // turbulence phase clock, advanced each frame by updateWeather(dt)
let weatherSeed = 1;         // per-run seed for standalone (non-op) weather rolls; reseeded in startGame
const FOG_BASE = 0.000058;   // neutral FogExp2 density; weather.fogMul scales from this (matches scene init)
// weather core (NIGHT_RADAR_MUL, WEATHER, resolveWeather, turbSample, rollWeather) → core.js.
// boss-phase core (BOSS_PHASE2_HP, BOSS_PHASE3_HP, bossPhaseFor, nextBossPhase) → core.js.
// Boss-rush mode (F15): unlockable gauntlet — fight every boss in sequence, fixed loadout,
// ONE life, no tech tree. Runtime mode flag + progress; best time persists in meta.
let bossRush = false;        // true while a Boss Rush run is active (gates tech tree / meta perks / loadout)
let bossRushIndex = 0;       // how many bosses have been DEFEATED so far this run (0..BOSS_RUSH_TOTAL)
let bossRushT0 = 0;          // performance.now() at run start, for the timed leaderboard
// boss-rush core (BOSS_RUSH_POOL, BOSS_RUSH_TOTAL, bossRushNext, bossRushDone, betterTime) → core.js.
// tutorial step machine (TUTORIAL_STEPS, TUTORIAL_DONE, TUTORIAL_EVENT_FOR_STEP, tutorialNext) → core.js.
let dailyMode = false;       // true while a Daily Challenge run is active (F7): seed-fixed layout/weather, one life
let dailySeed = 0;           // the active daily calendar seed; startGame resets weatherSeed from it when dailyMode
// daily-challenge core (makeRng, dailySeedFor) → core.js.
let W = innerWidth, H = innerHeight;
let h2d, radarCtx, radarCanvas;
let state = 'hangar';
let onboarding = false;   // true while the first-run language-select / controls-brief screens are showing
// First-run guided tutorial (F5). `active` = run the stepped prompts this session (set for a brand-new
// player when onboarding starts); `step` indexes TUTORIAL_STEPS (DONE = finished); `done` latches once the
// player completes or skips. prevShots/prevMissiles baseline the run-stat counters so we detect the NEXT
// gun/missile action (not ammo already spent). Not persisted separately — reuses skystrike_onboarded.
let tutorial = { active: false, step: 0, done: false, prevShots: 0, prevMissiles: 0 };
// captured before boot writes skystrike_settings (cacheEl -> selectJet -> saveSettings), so the
// first-run check in initOnboarding() isn't fooled by settings saved during this same boot
const isReturningPlayer = !!(store.get('skystrike_onboarded') || store.get('skystrike_settings'));
let lastDt = 0.016, empFlash = 0;
let selectedJet = 0, previewJet = null, platform = null;   // default to the FT-1 trainer (roster index 0) — the only jet unlocked at a fresh start; a saved skystrike_settings.selectedJet overrides
// Hangar 3D-preview interaction. previewSkin is a TRANSIENT, UI-only skin being shown on the preview jet
// (owned OR not) — it is NEVER persisted and NEVER read by gameplay (createPlayer uses jetPaint = owned only),
// so an unowned preview can't reach a launched jet. Cleared on jet switch / leaving the hangar.
let previewSkin = null;
let previewDragging = false;          // pointer is dragging the preview jet (raycast-gated on pointerdown)
let previewSpinResumeAt = 0;          // performance.now() ms after which idle spin+bob resume (paused while dragging + ~3s after release)
let previewYaw = 0, previewPitch = 0; // accumulated drag orientation (rad); pitch clamped to ±PREVIEW_PITCH_MAX
const PREVIEW_PITCH_MAX = Math.PI / 3;   // ±60° pitch clamp
let jetGLTF = {};   // loaded glTF hero-jet templates by shape id (e.g. F22), cloned per spawn on High tier
let special2Id = null;   // feature #3: equipped SLOT-2 special (ability/jet id), persisted in skystrike_settings like selectedJet

let player = null;
let enemies = [], bullets = [], missiles = [], flares = [], loots = [], particles = [], clouds = [], decoys = [];
let wingmen = [];   // AI escort jets that fly with the player
const BPOOL = [];
let hitMarkers = [], dmgNumbers = [];
// JS twin of the CSS prefers-reduced-motion gate (styles.css:96): when true, the canvas-juice
// layer (hud.js kill flash / lock-snap / low-HP pulse) renders its calm fallback. Cached + live.
let _reduceMotionMQ = (typeof matchMedia === 'function') ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let _reduceMotion = !!(_reduceMotionMQ && _reduceMotionMQ.matches);
if (_reduceMotionMQ && _reduceMotionMQ.addEventListener) _reduceMotionMQ.addEventListener('change', e => { _reduceMotion = e.matches; });
function prefersReducedMotion() { return _reduceMotion; }
let killFlash = 0;   // VISUAL-ONLY: brief frame timer set on a player kill (hud.js draws a confirm flash). Decays in drawHUD.
let wave = 0, betweenWaves = true, waveTimer = 2.6;
let strikeWaveActive = false;   // true while the current wave is a ground-war strike wave
// Endless-mode boss schedule (balance pass 2026-06): the next wave a boss arrives on. Replaces the old
// `wave % 4` metronome — re-rolled 3-5 waves out by nextBossOffset after each boss spawns. lastWaveWasBoss
// records whether the just-spawned wave carried a boss (drives the tech-screen cadence after it clears).
let bossWaveNext = 0;           // wave number the next Endless boss is scheduled for (0 = uninitialized)
let bossWaveActive = false;     // true while the CURRENT wave contains a boss (Endless metronome replacement)
let lastWaveWasBoss = false;    // did the wave that just cleared contain a boss? (tech-screen cadence)
let pendingSpawns = [];          // FIFO of zero-arg spawn closures, drained a few per frame to avoid wave-start hitch
const SPAWN_PER_FRAME = 2;       // enemies actually built per frame after a wave is announced
let camMode = 0;
let paused = false;
let bestScore = 0;
let invertY = false, volume = 0.55, muted = false;
let autoLock = false; // when off, the player must press F to designate a lock target
let startWingman = true; // launch each sortie with a starting AI escort (toggle in Settings)
let rivalEnabled = true;     // nemesis rival ace appearances (Settings toggle)
let groundWar = true;        // ground units + strike waves (Settings toggle)
let opMode = false;          // operation map mode vs endless (Hangar mode select)
// Operations Map revamp — bounded linear campaign. opMode = "Operations selected in hangar";
// campaignMode = "currently flying a bounded campaign level" (the distinct in-flight path).
let campaignMode = false;    // true only while a bounded campaign level's combat is live
let campaignOpId = null;     // operation id being played (set on entering an operation)
let campaignLevelIdx = -1;   // level index within the operation currently launched
let campaignWavesLeft = 0;   // bounded wave-bank countdown for the active level
let campaignSnapshot = null; // pre-level {tp,score,…} checkpoint for death rollback
let campaignPlayerOpId = null; // which operation the live player belongs to (null = no op player built)
let campaignBossPhases = null; // authored boss phase descriptors handed to spawnBoss → e._phaseCfg
let gunLead = true;      // lead-computing gunsight (deflection pipper) for the cannon
let aimAssist = true;    // aim assist: gently steers the nose toward the gun lead point (Settings toggle, on by default)
let aimStrength = 3;     // aim-assist strength 1..5 (Settings slider, shown only when aimAssist is on; 5 = forcing)
let controlSensitivity = 1.0; // turn-rate multiplier (0.5–2.0, Settings slider)
// mobile control settings (Settings tab; persisted via storage seam)
let mobileControl = 'touch';      // 'touch' | 'motion' — active analog flight source on mobile
let motionAggression = 'balanced';// 'casual' | 'balanced' | 'direct' — tilt assist preset
let haptics = true;               // vibration feedback where supported
let buttonOpacity = 0.8;          // 0.4–1.0 on-screen touch button opacity
let buttonLayout = 'right';       // 'right' | 'left' | 'compact' — touch button preset layout
let hudScale = 1.0;               // HUD/readout size multiplier (Settings → HUD size dropdown; 0.8–1.3)
let choosingUpgrade = false; // true while the between-wave field-upgrade screen is open
let difficulty = 1;
const DIFFS = [
  { key: 'ROOKIE',  dmg: 0.6, fire: 1.35, missile: 1.5, count: -1, hp: 1.3,  desc: 'Forgiving — fewer, gentler foes & a tougher hull.' },
  { key: 'VETERAN', dmg: 1.0, fire: 1.0,  missile: 1.0, count: 0,  hp: 1.0,  desc: 'The intended challenge.' },
  { key: 'ACE',     dmg: 1.5, fire: 0.72, missile: 0.7, count: 1,  hp: 0.85, desc: 'Lethal — more foes, faster guns, fragile hull.' },
];
let run = { shots: 0, hits: 0, missiles: 0, kills: 0, ground: 0, boss: 0, missions: 0, t0: 0, escortKills: 0, pMissiles: 0, pGunKills: 0, pFlares: 0, lastRivalWave: 0, damageTaken: 0, sectorAceSpawned: {}, setpieceDone: {}, cleanWaves: 0 };
let noDamageWave = false;   // per-wave "no hit taken yet" flag for star objectives — set true at wave start (main.js), cleared in damagePlayer; a wave cleared while still true bumps run.cleanWaves

/* per-airframe special-ability cooldown (seconds) */
const SPECIAL_CD = {
  'F-22':15, 'SU-57':15, 'J-20':18, 'F-35':18, 'EFT':15, 'RAFALE':18, 'TEJAS':15, 'FA18':18,
  'J-36':20, 'F-47':22, 'NGAD':20, 'J-50':16,
};

/* ---------------- research-point economy ----------------
   Points (RP) are earned ONLY from damage, kills and assists the PLAYER personally deals.
   Wingmen / deployed drones earn the player NOTHING toward the tech tree. */
const TP = { dmg: 0.5, fighter: 55, drone: 12, ground: 28, bomber: 150, ace: 140, boss: 380, assistFrac: 0.4 };
let wingDmgMul = 1;   // FLEET COMMANDER capstone boosts escort firepower

/* ---------------- TECH TREE (one connected lattice) ----------------
   A single research lattice grown from a CORE root. Every node lists its parent(s):
   `req` may be a single id or an ARRAY (owning ANY one unlocks the node — an OR-gate
   that lets branches weave into each other), and `reqAll` is an array of ids that must
   ALL be owned (an AND-gate for hybrid nodes that fuse two branches). Grid position
   (`x` column, `y` row) drives the on-screen layout. Purchases persist for the run.
   The CORE node is owned for free at the start of every run.
   `ok(p)` (optional) gates a node to relevant airframes; `repeat` marks the points-sink. */
const MAX_WINGMEN = 6;                 // hard cap on escorts in the air
let pendingWingShape = 'STD';          // airframe the next tech-tree wingman will fly (set by the picker)
const FAM_C = { core:'#ffb938', wpn:'#ffb347', gun:'#ff9a3c', msl:'#ff7a4d', mun:'#ff5024', def:'#5dffa0', arm:'#46ff8c', prop:'#5ad1ff', ew:'#ff61cf', cmd:'#ffe14d', sc:'#ffd24d', tac:'#b76bff', wing:'#8ad0ff', sup:'#ffab61', strike:'#ff4444' };
const TECH_TREE = [
  // ---- root ----
  { id:'core', x:3, y:0, req:null, fam:'core', cost:0, sym:'\u2756', name:'CORE SYSTEMS', desc:'Boot the upgrade bus. (Owned from the start of every run.)', apply:()=>{} },
  // ---- three trunks off the root; each fans into three sub-branches ----
  { id:'wpn', x:1, y:1, req:'core', fam:'wpn', cost:160, sym:'\u2724', name:'WEAPONS BUS', desc:'+12% cannon AND +12% missile damage. Opens the Gunnery, Munitions and Missile branches.', apply:p=>{ p.gunDmgMul *= 1.12; p.missileDmgMul *= 1.12; } },
  { id:'def', x:5, y:1, req:'core', fam:'def', cost:110, sym:'\u25C8', name:'AIRFRAME BUS', desc:'+25 max HP and +12 max shield, topped up now. Opens Armour, Propulsion and EW.', apply:p=>{ p.maxHp += 25; p.hp = p.maxHp; p.maxShield += 12; p.shield = p.maxShield; } },
  { id:'cmd', x:9, y:1, req:'core', fam:'cmd', tab:'armory', cost:110, sym:'\u2605', name:'COMMAND BUS', desc:'+12% score from everything. Opens Command/Economy, Tactics and Flight.', apply:p=>{ p.scoreMul *= 1.12; } },

  // ===== WEAPONS group ===========================================================
  // ---- GUNNERY (cannon line, far left) ----
  { id:'g1', x:0, y:2, req:'wpn', fam:'gun', cost:150, sym:'\u25C9', name:'HEAVY ROUNDS',     desc:'+25% cannon damage.',                                              ok:p=>!p.noCannon, apply:p=>{ p.gunDmgMul *= 1.25; } },
  { id:'g2', x:0, y:3, req:'g1',  fam:'gun', cost:280, sym:'\u25A4', name:'RAPID FEED',        desc:'+18% cannon rate of fire.',                                        ok:p=>!p.noCannon, apply:p=>{ p.fireRateMul *= 0.85; } },
  { id:'g3', x:0, y:4, req:['g2','u2'], fam:'gun', cost:450, sym:'\u2261', name:'AP PENETRATORS', desc:'Rounds punch THROUGH one extra target, and fly faster. (Reached via Gunnery OR Munitions.)', ok:p=>!p.noCannon, apply:p=>{ p.pierce += 1; p.bulletSpeedMul *= 1.2; } },
  { id:'g4', x:0, y:5, req:'g3',  fam:'gun', cost:640, sym:'\u25CE', name:'CRITICAL OPTICS',   desc:'+20% chance to land a critical hit for ×1.8 damage.',              ok:p=>!p.noCannon, apply:p=>{ p.critChance = Math.min(0.6, p.critChance + 0.2); p.critMul = Math.max(p.critMul, 1.8); } },
  { id:'g5', x:0, y:6, req:'g4',  fam:'gun', cost:980, sym:'\u2726', name:'GAUSS DRIVER',      desc:'CAPSTONE \u2014 +45% cannon damage, +1 pierce, hypervelocity rounds, and critical hits now DETONATE on impact.', ok:p=>!p.noCannon, apply:p=>{ p.gunDmgMul *= 1.45; p.pierce += 1; p.bulletSpeedMul *= 1.2; p.critChance = Math.min(0.6, p.critChance + 0.05); p.critChain = true; } },
  { id:'sv', x:1, y:6, req:['g3','u3'], fam:'gun', cost:560, sym:'\u267b', name:'BRASS SCAVENGER', desc:'BRIDGE \u2014 every kill recovers 40 cannon rounds from the wreckage, and +10% cannon damage. (Gunnery OR Munitions.)', ok:p=>!p.noCannon, apply:p=>{ p.gunScavenge += 40; p.gunDmgMul *= 1.1; } },
  { id:'g6', x:0, y:7, req:'g5', fam:'gun', cost:1180, sym:'♨', name:'INCENDIARY ROUNDS', desc:'Cannon hits set targets ABLAZE — they keep burning for heavy damage over time.', ok:p=>!p.noCannon, apply:p=>{ p.burnDps += 30; p.burnTime = Math.max(p.burnTime, 3.2); } },
  { id:'ic', x:0, y:8, req:'g6', fam:'gun', cost:1320, sym:'❋', name:'INFERNO CASCADE', desc:'CAPSTONE — a foe that BURNS TO DEATH bursts, splashing its fire onto everything nearby. +16 burn damage. The blaze never stops spreading.', ok:p=>!p.noCannon, apply:p=>{ p.burnSpread = true; p.burnDps += 16; } },

  // ---- MUNITIONS (kill-cascade line, centre-left, under the WEAPONS trunk) ----
  { id:'u1', x:1, y:2, req:'wpn', fam:'mun', cost:170, sym:'\u229B', name:'SMART FUZING',      desc:'Every kill cooks off in a small blast, damaging nearby foes.',     apply:p=>{ p.chainRadius = Math.max(p.chainRadius, 150); p.chainDmg += 24; } },
  { id:'u2', x:1, y:3, req:'u1',  fam:'mun', cost:300, sym:'\u25C8', name:'OVERPRESSURE',      desc:'+15% cannon AND +15% missile damage.',                             apply:p=>{ p.gunDmgMul *= 1.15; p.missileDmgMul *= 1.15; } },
  { id:'u3', x:1, y:4, req:'u2',  fam:'mun', cost:470, sym:'\u2042', name:'CLUSTER CHARGES',   desc:'Kill blasts are much larger and hit harder.',                      apply:p=>{ p.chainRadius += 100; p.chainDmg += 22; } },
  { id:'u4', x:1, y:5, req:'u3',  fam:'mun', cost:820, sym:'\u2747', name:'CHAIN REACTION',    desc:'CAPSTONE \u2014 kill blasts DETONATE TWICE, reach further, and all your damage rises +20%. Cascading carnage.', apply:p=>{ p.chainProp = true; p.chainRadius += 70; p.chainDmg += 18; p.gunDmgMul *= 1.2; p.missileDmgMul *= 1.2; } },
  { id:'u5', x:1, y:7, req:'u4', fam:'mun', cost:980, sym:'⚡', name:'EMP SUBMUNITIONS', desc:'Every kill bursts an EMP that STUNS nearby foes — cutting their guns, missiles and turns for ~2s.', apply:p=>{ p.empKill = Math.max(p.empKill, 540); } },

  // ---- MISSILES (ordnance line, centre) ----
  { id:'m1', x:2, y:2, req:'wpn', fam:'msl', cost:150, sym:'\u27B9', name:'HE WARHEADS',       desc:'+28% missile damage.',                                             apply:p=>{ p.missileDmgMul *= 1.28; } },
  { id:'m2', x:2, y:3, req:'m1',  fam:'msl', cost:280, sym:'\u25D0', name:'AESA RADAR',        desc:'Missiles lock on 30% faster.',                                     apply:p=>{ p.lockSpeedMul *= 0.7; } },
  { id:'m3', x:2, y:4, req:['m2','u2'], fam:'msl', cost:450, sym:'\u273A', name:'THERMOBARIC', desc:'Missiles burst into a damaging blast on impact. (Reached via Missiles OR Munitions.)', apply:p=>{ p.splashRadius = Math.max(p.splashRadius, 340); p.splashDmg += 24; } },
  { id:'m4', x:2, y:5, req:'m3',  fam:'msl', cost:620, sym:'\u293A', name:'AUTOLOADER',        desc:'40% chance a kill refunds a missile to the rack.',                 apply:p=>{ p.mslRefund += 0.4; } },
  { id:'m5', x:2, y:6, req:'m4',  fam:'msl', cost:860, sym:'\u2630', name:'SWARM RACK',        desc:'Each launch looses an extra free missile (specials too), and +6 to the rack.',         apply:p=>{ p.mslSwarm += 1; p.maxMissiles += 6; p.missiles = p.maxMissiles; } },
  { id:'m6', x:2, y:7, req:'m5',  fam:'msl', cost:1150, sym:'\u2723', name:'HYDRA SYSTEM',     desc:'CAPSTONE \u2014 +30% missile damage, +1 more missile per launch, every bird hard-homes, and far bigger blasts.', apply:p=>{ p.missileDmgMul *= 1.3; p.mslSwarm += 1; p.mslHard = true; p.splashRadius = Math.max(p.splashRadius, 340) + 120; p.splashDmg += 22; } },

  // ---- CONVERGENCE SPINE (x3, under the CORE) — hybrid nodes that fuse branches ----
  { id:'dl', x:3, y:3, req:['m1','p1'], fam:'tac', cost:260, sym:'⌖', name:'DATALINK ARRAY',
    desc:'BRIDGE — sensor fusion across the airframe: missiles lock 20% faster AND +6% top speed. (Missiles OR Propulsion.)',
    apply:p=>{ p.lockSpeedMul *= 0.8; p.speedMul *= 1.06; } },
  { id:'cm', x:3, y:4, req:'dl', fam:'tac', cost:420, sym:'♫', name:'RHYTHM OF WAR',
    desc:'Combat flow state — every point of COMBO adds +2% damage, up to +30%. Keep the hits coming.',
    apply:p=>{ p.comboDmg = Math.max(p.comboDmg, 0.02); } },
  { id:'oc', x:3, y:5, reqAll:['u2','a2'], fam:'mun', cost:520, sym:'⧉', name:'OVERLOAD COUPLING',
    desc:'FUSION — requires OVERPRESSURE + AEGIS PLATING. Wires the shield into the warload: +18 max shield, and a shield-break pulse hits harder.',
    apply:p=>{ p.maxShield += 18; p.shield = Math.min(p.maxShield, p.shield + 18); p.reactive = Math.max(p.reactive, 50); } },
  { id:'sk', x:3, y:6, req:['a3','e3'], fam:'arm', cost:540, sym:'⚭', name:'SIPHON FIELD',
    desc:'BRIDGE — harvest the static of a dying machine: every kill restores 6 shield. (Armour OR EW.)',
    apply:p=>{ p.shieldOnKill += 6; } },
  { id:'omega', x:3, y:8, reqAll:['m6','a6'], fam:'core', cost:2000, sym:'Ω', name:'OMEGA PROTOCOL',
    desc:'ULTRA-CAPSTONE — requires HYDRA SYSTEM + JUGGERNAUT. The airframe transcends: +15% ALL damage, +8% damage reduction, +1 missile per launch, and every kill bends time for a moment.',
    apply:p=>{ p.gunDmgMul *= 1.15; p.missileDmgMul *= 1.15; p.dmgReduce = clamp(p.dmgReduce + 0.08, 0, 0.75); p.mslSwarm += 1; p.slowOnKill = Math.max(p.slowOnKill, 0.7); } },

  // ===== AIRFRAME group ==========================================================
  // ---- ARMOUR (survivability line, left of AIRFRAME) ----
  { id:'a1', x:4, y:2, req:'def', fam:'arm', cost:150, sym:'\u25A3', name:'REINFORCED HULL',   desc:'+35 max HP and fully repair the airframe.',                        apply:p=>{ p.maxHp += 35; p.hp = p.maxHp; } },
  { id:'a2', x:4, y:3, req:'a1',  fam:'arm', cost:280, sym:'\u25D2', name:'AEGIS PLATING',     desc:'+22 max shield, +40% shield regen, recharged now.',                apply:p=>{ p.maxShield += 22; p.shield = p.maxShield; p.shieldRegenMul *= 1.4; } },
  { id:'a3', x:4, y:4, req:['a2','p2'], fam:'arm', cost:450, sym:'\u271A', name:'GUARDIAN SYSTEM', desc:'Take 18% less damage from all sources. (Reached via Armour OR Propulsion.)', apply:p=>{ p.dmgReduce = clamp(p.dmgReduce + 0.18, 0, 0.6); } },
  { id:'a4', x:4, y:5, req:'a3',  fam:'arm', cost:620, sym:'\u271B', name:'NANITE REPAIR',     desc:'Repair 7 HP every time you destroy something.',                    apply:p=>{ p.lifesteal += 7; } },
  { id:'a5', x:4, y:6, req:'a4',  fam:'arm', cost:860, sym:'\u29BF', name:'REACTIVE ARMOUR',   desc:'When your shield breaks it DETONATES \u2014 concussing foes and blinding incoming missiles.', apply:p=>{ p.reactive = Math.max(p.reactive, 70); } },
  { id:'a6', x:4, y:7, req:'a5',  fam:'arm', cost:1150, sym:'\u2756', name:'JUGGERNAUT',       desc:'CAPSTONE \u2014 +50 max HP, another 12% damage reduction, and overhealing now banks as bonus OVERSHIELD.', apply:p=>{ p.maxHp += 50; p.hp = p.maxHp; p.dmgReduce = clamp(p.dmgReduce + 0.12, 0, 0.7); p.vampShield = Math.max(p.vampShield, 0.5); p.overshieldCap += 60; } },

  // ---- PROPULSION (flight-performance line, centre, under the AIRFRAME trunk) ----
  { id:'p1', x:5, y:2, req:'def', fam:'prop', cost:170, sym:'\u2191', name:'THRUST VECTORING', desc:'+12% turn rate \u2014 tighter, faster turns.',                     apply:p=>{ p.turnMul *= 1.12; } },
  { id:'p2', x:5, y:3, req:'p1',  fam:'prop', cost:300, sym:'\u25C7', name:'ADAPTIVE INTAKES', desc:'+14% top speed.',                                                  apply:p=>{ p.speedMul *= 1.14; } },
  { id:'p3', x:5, y:4, req:'p2',  fam:'prop', cost:480, sym:'\u2742', name:'ENERGY MANEUVER',  desc:'+12% turn rate and +8% top speed.',                                apply:p=>{ p.turnMul *= 1.12; p.speedMul *= 1.08; } },
  { id:'tk', x:5, y:5, req:['p3','e3'], fam:'tac', cost:600, sym:'\u29D6', name:'KILL CLOCK',
    desc:'BRIDGE \u2014 reflex injection on confirmed kill: the world slows for a beat every time you down something. (Propulsion OR EW.)',
    apply:p=>{ p.slowOnKill = Math.max(p.slowOnKill, 0.6); } },
  { id:'p4', x:5, y:6, req:'p3',  fam:'prop', cost:820, sym:'\u27A4', name:'SUPERCRUISE',      desc:'CAPSTONE \u2014 +18% speed, +12% turn, and a constant 6% damage reduction from sheer energy.', apply:p=>{ p.speedMul *= 1.18; p.turnMul *= 1.12; p.dmgReduce = clamp(p.dmgReduce + 0.06, 0, 0.7); } },
  { id:'p5', x:5, y:7, req:'p4', fam:'prop', cost:1080, sym:'⇈', name:'SCRAMJET CORE', desc:'+14% top speed, +10% turn rate, and a further 6% damage reduction from sheer energy.', apply:p=>{ p.speedMul *= 1.14; p.turnMul *= 1.10; p.dmgReduce = clamp(p.dmgReduce + 0.06, 0, 0.72); } },

  // ---- ELECTRONIC WARFARE (defence/utility line, right of AIRFRAME) ----
  { id:'e1', x:6, y:2, req:'def', fam:'ew', cost:140, sym:'\u2734', name:'DECOY POD',          desc:'+4 max flares (refilled) and they burn longer.',                   apply:p=>{ p.maxFlares += 4; p.flares = p.maxFlares; p.flarePro = 1; } },
  { id:'e2', x:6, y:3, req:'e1',  fam:'ew', cost:270, sym:'\u25CC', name:'RCS COATING',        desc:'Incoming missiles lose your lock far more often.',                 apply:p=>{ p.mslEvade = clamp(p.mslEvade + 0.22, 0, 0.9); } },
  { id:'e3', x:6, y:4, req:['e2','p2'], fam:'ew', cost:430, sym:'\u21BB', name:'OVERCLOCK',    desc:'Special ability recharges 25% faster. (Reached via EW OR Propulsion.)',            apply:p=>{ p.special.max *= 0.75; } },
  { id:'fk', x:7, y:3, req:'e1', fam:'ew', cost:380, sym:'\u2749', name:'FLAK BLOOM',
    desc:'Flares are re-cored with HE \u2014 each one DETONATES as a flak burst when it burns out, shredding anything nearby. +2 max flares.',
    apply:p=>{ p.flakFlares = Math.max(p.flakFlares, 45); p.maxFlares += 2; p.flares = p.maxFlares; } },
  { id:'fz', x:7, y:5, req:['t2','e3'], fam:'tac', cost:600, sym:'✶', name:'KILL FRENZY',
    desc:'BRIDGE — every kill stokes a FRENZY: a stacking, decaying surge of fire-rate and damage. Stay on the trigger. (Tactics OR EW.)',
    apply:p=>{ p.frenzyOnKill = 1.25; p.frenzyMax = 6; } },
  { id:'e4', x:6, y:5, req:'e3',  fam:'ew', cost:620, sym:'\u2737', name:'POINT-DEFENSE LASER', desc:'An auto-laser swats incoming missiles that stray too close.',     apply:p=>{ p.pointDefense = Math.max(p.pointDefense, 0.5); } },
  { id:'e5', x:6, y:6, req:'e4',  fam:'ew', cost:840, sym:'\u29BF', name:'TRACTOR FIELD',      desc:'Supply pickups are drawn toward you from range.',                  apply:p=>{ p.lootMagnet += 420; } },
  { id:'e6', x:6, y:7, req:'e5',  fam:'ew', cost:1120, sym:'\u2742', name:'GHOST PROTOCOL',    desc:'CAPSTONE \u2014 missiles rarely hold lock, special recharges another 20% faster, and the point-defense laser fires far more aggressively.', apply:p=>{ p.mslEvade = clamp(p.mslEvade + 0.3, 0, 0.95); p.special.max *= 0.8; p.pointDefense += 0.45; } },

  // ===== TACTICAL group (3rd draftable trunk: Recon / Sustain / Warlord) =========
  { id:'tbus', x:9, y:1, req:'core', fam:'sup', cost:140, sym:'⌘', name:'TACTICAL BUS',
    desc:'+10% turn rate and +8% score. Opens the Recon, Sustain and Warlord branches.',
    apply:p=>{ p.turnMul *= 1.10; p.scoreMul *= 1.08; } },

  // ---- RECON (targeting / crit line, left of the TACTICAL trunk) ----
  { id:'rc1', x:8, y:2, req:'tbus', fam:'sc', cost:160, sym:'◎', name:'SENSOR FUSION',
    desc:'Missiles lock 22% faster and +8% crit chance.', apply:p=>{ p.lockSpeedMul *= 0.78; p.critChance = Math.min(0.6, p.critChance + 0.08); } },
  { id:'rc2', x:8, y:3, req:'rc1', fam:'sc', cost:300, sym:'⌖', name:'TARGET MARKING',
    desc:'+18% damage to any target still at full health — punish the first pass.', apply:p=>{ p.alphaMul = Math.max(p.alphaMul, 1.18); } },
  { id:'rc3', x:8, y:4, req:['rc2','e3'], fam:'sc', cost:470, sym:'✷', name:'PREDICTIVE TRACKING',
    desc:'+12% crit chance and crits deal at least ×2.0. (Reached via Recon OR EW.)', apply:p=>{ p.critChance = Math.min(0.6, p.critChance + 0.12); p.critMul = Math.max(p.critMul, 2.0); } },
  { id:'rc4', x:8, y:5, req:'rc3', fam:'sc', cost:880, sym:'❂', name:'DEADEYE PROTOCOL',
    desc:'CAPSTONE — +15% crit chance, +15% cannon damage, and critical hits now DETONATE on impact.', apply:p=>{ p.critChance = Math.min(0.6, p.critChance + 0.15); p.gunDmgMul *= 1.15; p.critChain = true; } },

  // ---- SUSTAIN (self-repair line, centre, under the TACTICAL trunk) ----
  { id:'ss1', x:9, y:2, req:'tbus', fam:'def', cost:150, sym:'✚', name:'COMBAT MEDIC',
    desc:'Repair 5 HP every time you destroy something.', apply:p=>{ p.lifesteal += 5; } },
  { id:'ss2', x:9, y:3, req:'ss1', fam:'def', cost:290, sym:'⦿', name:'SIPHON CELLS',
    desc:'Every kill restores 5 shield.', apply:p=>{ p.shieldOnKill += 5; } },
  { id:'ss3', x:9, y:4, req:['ss2','a3'], fam:'def', cost:470, sym:'✛', name:'REGEN MATRIX',
    desc:'+18 max shield and +40% shield regen, recharged now. (Reached via Sustain OR Armour.)', apply:p=>{ p.maxShield += 18; p.shield = p.maxShield; p.shieldRegenMul *= 1.4; } },
  { id:'ss4', x:9, y:5, req:'ss3', fam:'def', cost:900, sym:'❖', name:'PHOENIX CORE',
    desc:'CAPSTONE — +40 max HP, +8 repair per kill, and overhealing now banks as bonus OVERSHIELD.', apply:p=>{ p.maxHp += 40; p.hp = p.maxHp; p.lifesteal += 8; p.vampShield = Math.max(p.vampShield, 0.5); p.overshieldCap += 40; } },

  // ---- WARLORD (tempo / momentum line, right of the TACTICAL trunk) ----
  { id:'wl1', x:10, y:2, req:'tbus', fam:'tac', cost:170, sym:'♫', name:'BATTLE RHYTHM',
    desc:'Every point of COMBO adds +2% damage, up to +30%.', apply:p=>{ p.comboDmg = Math.max(p.comboDmg, 0.02); } },
  { id:'wl2', x:10, y:3, req:'wl1', fam:'tac', cost:300, sym:'↯', name:'ADRENAL SURGE',
    desc:'The lower your HP, the harder you hit — up to +30% damage near death.', apply:p=>{ p.berserk = Math.max(p.berserk, 0.3); } },
  { id:'wl3', x:10, y:4, req:['wl2','p3'], fam:'tac', cost:480, sym:'⧖', name:'KILL MOMENTUM',
    desc:'Each kill stokes a stacking FRENZY of fire-rate, and the world slows for a beat. (Reached via Warlord OR Propulsion.)', apply:p=>{ p.frenzyOnKill = Math.max(p.frenzyOnKill || 0, 1.2); p.frenzyMax = Math.max(p.frenzyMax || 0, 5); p.slowOnKill = Math.max(p.slowOnKill, 0.5); } },
  { id:'wl4', x:10, y:5, req:'wl3', fam:'tac', cost:900, sym:'✪', name:'CONQUEROR',
    desc:'CAPSTONE — +25% score, +10% all weapon damage, and instantly destroy any non-boss dropped below 12% health.', apply:p=>{ p.scoreMul *= 1.25; p.gunDmgMul *= 1.10; p.missileDmgMul *= 1.10; p.execThresh = Math.max(p.execThresh, 0.12); } },

  // ---- WAR ROOM (TACTICAL convergence — reachable from either new capstone) ----
  { id:'warroom', x:9, y:6, req:['ss4','wl4'], fam:'core', cost:1300, sym:'✧', name:'WAR ROOM',
    desc:'FUSION — total battlefield command: +12% all weapon damage and special ability recharges 20% faster. (Sustain OR Warlord capstone.)', apply:p=>{ p.gunDmgMul *= 1.12; p.missileDmgMul *= 1.12; p.special.max *= 0.8; } },

  // ===== COMMAND group ===========================================================
  // ---- ECONOMY / ACE (score & research line, left of COMMAND) ----
  { id:'s1', x:8, y:2, req:'cmd', fam:'sc', tab:'armory', cost:150, sym:'\u2605', name:'ACE BONUS',          desc:'+25% score from everything.',                                      apply:p=>{ p.scoreMul *= 1.25; } },
  { id:'s2', x:8, y:3, req:'s1',  fam:'sc', tab:'armory', cost:300, sym:'\u25C9', name:'FIELD ANALYTICS',    desc:'+15% research points (RP) earned.',                                apply:p=>{ p.rpMul *= 1.15; } },
  { id:'s3', x:8, y:4, req:'s2',  fam:'sc', tab:'armory', cost:470, sym:'\u00A4', name:'BOUNTY CONTRACTS',   desc:'Every kill you land pays a flat +6 RP bounty, and restock all ammo now.', apply:p=>{ p.rpPerKill += 6; p.bullets = p.maxBullets; p.missiles = p.maxMissiles; p.flares = p.maxFlares; } },
  { id:'s4', x:8, y:5, req:'s3',  fam:'sc', tab:'armory', cost:640, sym:'\u2630', name:'WAR CHEST',          desc:'+25% score, and fully restock guns, missiles & flares.',           apply:p=>{ p.scoreMul *= 1.25; p.bullets = p.maxBullets; p.missiles = p.maxMissiles; p.flares = p.maxFlares; } },
  { id:'s5', x:8, y:6, req:'s4',  fam:'sc', tab:'armory', cost:980, sym:'\u2742', name:'ACE PEDIGREE',       desc:'CAPSTONE \u2014 +35% score, +20% RP, and another +6 RP bounty per kill.', apply:p=>{ p.scoreMul *= 1.35; p.rpMul *= 1.2; p.rpPerKill += 6; } },

  // ---- TACTICS (lethality line, centre, under the COMMAND trunk) ----
  { id:'t1', x:9, y:2, req:'cmd', fam:'tac', tab:'armory', cost:180, sym:'\u2316', name:'MARKSMAN',          desc:'+20% damage to any target still at full health \u2014 reward the alpha strike.', apply:p=>{ p.alphaMul = Math.max(p.alphaMul, 1.2); } },
  { id:'t2', x:9, y:3, req:'t1',  fam:'tac', tab:'armory', cost:320, sym:'\u21AF', name:'ADRENALINE',        desc:'The lower your HP, the harder you hit \u2014 up to +35% damage near death.', apply:p=>{ p.berserk = Math.max(p.berserk, 0.35); } },
  { id:'t3', x:9, y:4, req:'t2',  fam:'tac', tab:'armory', cost:500, sym:'\u25BC', name:'EXECUTIONER',       desc:'Instantly destroy any non-boss dropped below 12% health.',         apply:p=>{ p.execThresh = Math.max(p.execThresh, 0.12); } },
  { id:'xb', x:9, y:6, req:'t3', fam:'tac', tab:'armory', cost:650, sym:'\u2604', name:'HEADSMAN',
    desc:'Executions detonate the victim \u2014 each EXECUTE throws a concussive blast into everything nearby.',
    apply:p=>{ p.execBlast = Math.max(p.execBlast, 60); } },
  { id:'intel', x:8, y:7, req:['s2','t1'], fam:'sc', tab:'armory', cost:420, sym:'\u2709', name:'SPOILS OF WAR',
    desc:'BRIDGE \u2014 battlefield intelligence harvest: +4 RP bounty per kill and kills repair 3 HP. (Economy OR Tactics.)',
    apply:p=>{ p.rpPerKill += 4; p.lifesteal += 3; } },
  { id:'t4', x:9, y:5, req:'t3',  fam:'tac', tab:'armory', cost:880, sym:'\u272A', name:'APEX PREDATOR',     desc:'CAPSTONE \u2014 +25% score, execute threshold rises to 18%, and once per wave you SURVIVE a lethal blow at 40% HP.', apply:p=>{ p.scoreMul *= 1.25; p.cheatDeath = true; p.execThresh = Math.max(p.execThresh, 0.18); } },

  // ---- FLIGHT / ESCORTS (right of COMMAND) ----
  { id:'w1', x:10, y:2, req:'cmd', fam:'wing', tab:'armory', cost:300, sym:'\u25B2', name:'WING COMMANDER',  desc:'Deploy a 2nd AI escort, then repair & up-armour the flight.', ok:()=>permWingmen() < 2, apply:()=>{ if (permWingmen() < MAX_WINGMEN) spawnWingman(false, pendingWingShape); buffFlight(60); } },
  { id:'w2', x:10, y:3, req:'w1',  fam:'wing', tab:'armory', cost:520, sym:'\u25B2', name:'SQUADRON',        desc:'Deploy a 3rd AI escort and heavily up-armour the flight.', ok:()=>permWingmen() < 3, apply:()=>{ if (permWingmen() < MAX_WINGMEN) spawnWingman(false, pendingWingShape); buffFlight(80); } },
  { id:'w3', x:10, y:4, req:'w2',  fam:'wing', tab:'armory', cost:820, sym:'\u2742', name:'FLEET COMMANDER', desc:'CAPSTONE \u2014 +25% score, escorts hit 60% harder, flight fully repaired.', apply:p=>{ p.scoreMul *= 1.25; wingDmgMul *= 1.6; buffFlight(40); } },
  // ---- the points sink: repeatable, scaling cost ----
  { id:'reserve', x:10, y:5, req:'w3', fam:'wing', tab:'armory', cost:400, costStep:240, repeat:true, sym:'\u22EF', name:'RESERVE SQUADRON',
    desc:'REPEATABLE \u2014 scramble another escort (up to ' + MAX_WINGMEN + ' in the air) and up-armour the whole flight. Cost rises each time. A bottomless place to pour spare RP.',
    apply:()=>{ if (permWingmen() < MAX_WINGMEN) spawnWingman(false, pendingWingShape); buffFlight(55); } },
  { id:'gd', x:11, y:4, req:'w3', fam:'wing', tab:'armory', cost:760, sym:'⛨', name:'GUARDIAN ESCORTS', desc:'Your escorts run their OWN point-defense laser — swatting enemy missiles that stray near the flight.', apply:p=>{ p.escortPD = true; } },

  // ===== ARMORY items (shown as grid in the Armory tab) ==========================
  { id:'fa1', x:0, y:0, tab:'armory', req:null, fam:'sup', cost:300, sym:'⚙', name:'WEAPONS LOCKER',
    desc:'Armory vaults unsealed — +600 max cannon rounds and +20 max missiles, fully restocked now.',
    apply:p=>{ p.maxBullets += 600; p.bullets = p.maxBullets; p.maxMissiles += 20; p.missiles = p.maxMissiles; } },
  { id:'fa2', x:0, y:0, tab:'armory', req:null, fam:'sup', cost:400, sym:'⎈', name:'COMMAND AUTHORITY',
    desc:'Theater authorization clears maximum-yield ordnance — +15% all weapon damage, escorts hit 25% harder.',
    apply:p=>{ p.gunDmgMul *= 1.15; p.missileDmgMul *= 1.15; wingDmgMul *= 1.25; } },
  { id:'fa3', x:0, y:0, tab:'armory', req:null, fam:'sup', cost:450, sym:'⚡', name:'TARGETING COMPUTER',
    desc:'Combat AI pre-computes firing solutions — +25% crit chance, critical hits deal at least ×2.2 damage.',
    apply:p=>{ p.critChance = Math.min(0.6, p.critChance + 0.25); p.critMul = Math.max(p.critMul, 2.2); } },
  { id:'fa4', x:0, y:0, tab:'armory', req:null, fam:'sup', cost:500, sym:'☒', name:'BLACK MARKET STOCKPILE',
    desc:'Off-the-books logistics — +6 max flares, +10 max missiles, +400 max cannon rounds, everything restocked now.',
    apply:p=>{ p.maxFlares += 6; p.flares = p.maxFlares; p.maxMissiles += 10; p.missiles = p.maxMissiles; p.maxBullets += 400; p.bullets = p.maxBullets; } },

  // ---- STRIKE branch (ground-war only) ----
  { id:'agm1', x:12, y:2, req:'core', fam:'strike', tab:'armory', ground:true, cost:260, sym:'▼', name:'AGM RAILS',
    desc:'Air-to-ground missile rails — +75% missile damage against ground targets.',
    apply:p=>{ p.agmMul = 1.75; } },
  { id:'rkt1', x:12, y:3, req:'agm1', fam:'strike', tab:'armory', ground:true, cost:300, sym:'▼', name:'ROCKET PODS',
    desc:'Cannon fire fragments against soft ground targets — +100% gun damage vs ground.',
    apply:p=>{ p.rktMul = 2; } },
  { id:'bel1', x:12, y:4, req:'rkt1', fam:'strike', tab:'armory', ground:true, cost:280, sym:'▼', name:'BELLY ARMOR',
    desc:'Hardened underside — −35% damage from ground-launched missiles.',
    apply:p=>{ p.bellyArmor = 0.65; } },
];
const TECH_BY_ID = {}; for (const n of TECH_TREE) TECH_BY_ID[n.id] = n;
function permWingmen() { let n = 0; for (let i = 0; i < wingmen.length; i++) if (!wingmen[i].temp) n++; return n; }
function buffFlight(extra) { for (let i = 0; i < wingmen.length; i++) { const w = wingmen[i]; w.maxHp += extra; if (w.alive) w.hp = w.maxHp; else w.rtb = Math.min(w.rtb, 1.5); } }
const LOCK_TIME = 1.3;
const CAM_NAMES = ['CHASE', 'CLOSE', 'COCKPIT'];

// ---- camera shake globals (F1) ----
// camShake: current shake magnitude; decays to 0 each frame via decayShake.
// shakeCam(amt): sets camShake = max(current, amt) — strongest pending shake wins, never accumulates unboundedly.
// decayShake(v, dt): PURE — returns max(0, v - dt * CAMSHAKE_RATE). Mirrored byte-identical in tests/camshake.test.js.
let camShake = 0;
function shakeCam(amt) { camShake = Math.max(camShake, amt); }
// camera-shake core (CAMSHAKE_RATE, CAMSHAKE_K, decayShake) → core.js.

const keys = {};
let mouseRight = false;
const GAME_CODES = new Set(['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','KeyG','KeyX','KeyF','KeyR','KeyB','KeyC','KeyV','KeyT','KeyY','Digit1','Digit2','Digit3','Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight']);
const down = (c) => !!keys[c];
let HUDFONT = "'Share Tech Mono', monospace";   // skin-swappable (applySkin)

/* ---------------- THEMING: 5 color schemes × 5 visual languages ----------------
   DOM side follows <html data-palette>/<html data-skin> (CSS). The canvas HUD reads
   the JS `HUD` triplets + HUDFONT, so applyPalette/applySkin keep the canvas in sync. */
const PALETTES = {
  amber:    { primary:'255,185,56',  primaryBright:'255,211,107', danger:'255,59,59',   warn:'255,122,31',  ok:'77,255,160',  reward:'255,225,77',  velvec:'90,255,180',  ink:'207,230,214', dim:'111,145,128', rival:'255,90,42',  boss:'255,80,220' },
  cyan:     { primary:'25,240,212',  primaryBright:'11,213,255',  danger:'255,57,75',   warn:'255,140,43',  ok:'70,255,140',  reward:'255,225,77',  velvec:'0,255,170',   ink:'189,238,230', dim:'91,138,134',  rival:'255,90,42',  boss:'255,80,220' },
  phosphor: { primary:'70,255,140',  primaryBright:'150,255,185', danger:'255,120,110', warn:'205,255,120', ok:'120,255,165', reward:'185,255,140', velvec:'120,255,160', ink:'130,235,160', dim:'78,150,96',   rival:'255,150,120',boss:'180,255,120' },
  ice:      { primary:'150,210,255', primaryBright:'212,236,255', danger:'255,92,92',   warn:'255,190,90',  ok:'120,232,182', reward:'255,226,122', velvec:'150,210,255', ink:'204,222,242', dim:'122,142,168', rival:'255,122,92', boss:'200,150,255' },
  red:      { primary:'255,92,72',   primaryBright:'255,152,92',  danger:'255,40,40',   warn:'255,122,40',  ok:'255,172,62',  reward:'255,202,82',  velvec:'255,150,90',  ink:'240,182,162', dim:'152,96,82',   rival:'255,70,40',  boss:'255,80,160' },
};
const SKIN_HUDFONT = {
  standard:   "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",   // default: plain, no character
  futuristic: "'Share Tech Mono', monospace",
  analog:     "Georgia, 'Times New Roman', serif",
  manual:     "'Courier New', Courier, monospace",
  flat:       "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  blueprint:  "'Courier New', monospace",
};
let activePalette = 'amber', activeSkin = 'standard';
function applyPalette(id) {
  if (!PALETTES[id]) id = 'amber';
  activePalette = id;
  document.documentElement.dataset.palette = id;          // DOM (CSS variables) follows
  if (typeof HUD !== 'undefined') { const p = PALETTES[id]; for (const k in p) HUD[k] = p[k]; }  // canvas follows
  store.set('skystrike_palette', id);
}
function applySkin(id) {
  if (!SKIN_HUDFONT[id]) id = 'standard';
  activeSkin = id;
  document.documentElement.dataset.skin = id;
  HUDFONT = SKIN_HUDFONT[id];
  store.set('skystrike_skin', id);
}

/* ---------------- AWACS support calls (F10) ---------------- */
// Core (AWACS_COOLDOWNS, AWACS_USES_MAX, AWACS_JAM_TIME, pure awacsCall resolver) → core.js.
// AWACS calls are now COOLDOWN-GATED (not RP-costed — balance pass 2026-06). awacsUses is the live
// per-sector use counter (hard cap, reset per sector + per run); awacsLast is the per-key timestamp
// (performance.now()/1000) of the last successful call, used for the cooldown gate (reset per sector).
// combat.js awacsAction wraps awacsResolve reading {uses: awacsUses, last: awacsLast}.
let awacsUses = { strike: 0, resupply: 0, jam: 0 };   // calls SPENT this sector (reset per sector + per run)
let awacsLast = { strike: 0, resupply: 0, jam: 0 };   // sec-clock of last successful call per key (cooldown gate)

/* Touch controls state */
let isTouchEnabled = false;
let joyActive = false, joyTouchId = null, joyBaseCenter = {x:0, y:0}, touchInput = {x:0, y:0};
let mouseFlight = false;                            // desktop mouse-pointer flight toggle (default off)
let mouseInput = { x: 0, y: 0, active: false };     // normalized pointer offset from center, -1..1
let mouseFiring = false;                             // left mouse button held over the play field → fire gun (combat.js)
let touchBtns = { gun:false, msl:false, flr:false, spc:false, thr:false, brk:false };
// unified flight-input seam (controls.js writes it each frame; combat.js consumes + adds keyboard)
let flightInput = { pitch: 0, roll: 0 };           // normalized analog flight axes, -1..1

// barrel-roll pure helpers (rollDetect, rollCooldownGate) → core.js.

// Barrel-roll evasive maneuver constants
const BARREL_ROLL_INVULN   = 0.4;   // seconds of i-frames granted
const BARREL_ROLL_COOLDOWN = 6.0;   // seconds before another roll is allowed
const BARREL_ROLL_DURATION = 0.65;  // seconds the 360° spin animation plays
const BARREL_ROLL_THRESHOLD = 0.35; // seconds: max gap for double-tap recognition

// Barrel-roll runtime state (reset each game start)
let barrelRollCooldown   = 0;   // counts down from BARREL_ROLL_COOLDOWN; >0 = on cooldown
let barrelRollAnim       = 0;   // counts down from BARREL_ROLL_DURATION; >0 = rolling
let barrelRollRequest    = false; // set true by controls when double-tap detected; cleared by combat
let barrelRollLastKeyTap = -999; // time (performance.now()/1000) of last keyboard Q or E press
let barrelRollLastTouchTap = -999; // time of last joystick roll-direction flick release
let barrelRollDir = 1;   // +1 right, -1 left; captured at roll initiation
let motionInput = { beta: 0, gamma: 0, ready: false, attached: false };  // live device-orientation tilt
let motionOffset = { beta: 0, gamma: 0 };           // captured neutral attitude (recenter)

// flight control scheme — how combat.js INTERPRETS the flightInput seam (orthogonal to touch/motion source).
//   'auto'    (default) = "fly toward the stick": gentle bank-hold (capped at autoMaxBank) + a WORLD-axis yaw
//                         (combat.js, ∝ bank) that turns the heading. Pitch stays fully manual so DIAGONALS work
//                         (you can dive AND turn at once). Turn is decoupled from pitch on purpose — see combat.js.
//   'pointer'           = point-to-steer: roll intent -> target BANK ANGLE held; release auto-levels to wings-level.
//   'rate'              = classic: roll intent -> roll RATE (hold stick = keep rolling). Persisted via saveSettings (owner D).
let controlScheme = 'auto';
let devUnlockAll = false;   // dev toggle: bypass SP gate on all jets/skins
// steering core (STEER tunables + pure steerCommand) → core.js. combat.js reads STEER + calls steerCommand.

// graphics quality (F11 mobile perf): 'auto' picks a render tier by a cheap device heuristic; 'low'/'high'
// force it. VISUAL-ONLY — never changes gameplay (it gates shadow-map resolution, shadow-camera far, and a
// draw-distance .visible cull on distant enemy meshes; enemies are NEVER despawned, so locks/markers survive).
// Persisted via the settings seam (saveSettings/loadSettings in ui.js). engine.js owns applyGfxQuality().
let gfxQuality = 'auto';
let unitSystem = 'imperial';   // HUD units: 'imperial' (mph + ft, default) | 'metric' (kph + m). Persisted; drives the speedometer/altimeter readout + labels.
// gfx-quality core (GFX_TIERS + pure resolveQuality) → core.js. refreshGfxTier (below) is the impure call site.
// live resolved tier ('low'|'high'); recomputed from gfxQuality whenever the setting changes (engine.js applyGfxQuality
// reads it). Default 'high' so desktop is untouched until refreshGfxTier() runs at boot/settings-load.
let gfxTier = 'high';
// low-tier draw-distance cull radii (world units). Beyond GFX_CULL_FAR an enemy mesh is hidden (.visible=false, NOT
// despawned — AI/markers/locks keep running); 'inactive' (non-boss, non-rival) jets hide sooner at GFX_CULL_JET as a
// cheap far-LOD. High tier never hides. These sit well past the radar reach so hidden foes are off-screen specks.
const GFX_CULL_FAR = 9000, GFX_CULL_JET = 6500;
// recompute gfxTier from the current setting + a cheap device read. isTouch heuristic mirrors controls.js touch detection;
// dpr from devicePixelRatio. Pure resolveQuality does the decision; this is the impure call site (could fold an fps
// sample later). Returns the resolved tier.
function refreshGfxTier() {
  const isTouch = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
                  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || ('ontouchstart' in (typeof window !== 'undefined' ? window : {}));
  const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1;
  gfxTier = resolveQuality(gfxQuality, dpr, !!isTouch);
  return gfxTier;
}

/* shared temporaries (avoid per-frame allocation) */
const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), t3 = new THREE.Vector3(),
      t4 = new THREE.Vector3(), t5 = new THREE.Vector3(), tA = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const eul = new THREE.Euler();
const ZERO = new THREE.Vector3(0, 0, 0), UPV = new THREE.Vector3(0, 1, 0), ZAX = new THREE.Vector3(0, 0, 1);
const m4 = new THREE.Matrix4();
const pp1 = new THREE.Vector3(), pp2 = new THREE.Vector3(), pp3 = new THREE.Vector3();
const aimT1 = new THREE.Vector3(), aimT2 = new THREE.Vector3(), aimT3 = new THREE.Vector3();  // aim-assist scratch (combat.js updatePlayer)

function fwdOf(o, out) { return (out || new THREE.Vector3()).set(0, 0, -1).applyQuaternion(o.quaternion); }
function rightOf(o, out) { return (out || new THREE.Vector3()).set(1, 0, 0).applyQuaternion(o.quaternion); }
function upOf(o, out) { return (out || new THREE.Vector3()).set(0, 1, 0).applyQuaternion(o.quaternion); }
function fwdQ(qq, out) { return (out || new THREE.Vector3()).set(0, 0, -1).applyQuaternion(qq); }
function dirToQuat(dir, out) { m4.lookAt(ZERO, dir, UPV); return (out || new THREE.Quaternion()).setFromRotationMatrix(m4); }
