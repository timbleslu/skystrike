/* SKYSTRIKE — globals.js: constants, jet roster, tech tree, global state, math & vector helpers. Load 1st (after three.js). */

/* =====================================================================
   SKYSTRIKE :: ACE PROTOCOL  —  low-poly arcade flight combat
   ===================================================================== */

/* ---------------- math helpers ---------------- */
const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/* ---------------- jet roster ---------------- */
const JETS = [
  { id:'FT-1', shape:'STD', name:'FT-1 STANDARD', role:'Multirole Trainer', topSpeed:'Mach 1.4', ceiling:'48,000 ft', cannon:'20mm rotary', gen:'BASELINE',
    speed:6, agility:6, accel:6, armor:6, stealth:4, firepower:6, color:0x8a96a4, accent:0x5fb0d0,
    ability:null, abilityDesc:'', passive:null,
    desc:'A plain, dependable airframe — no tricks, no special. The baseline every pilot learns on.',
    context:'Generic trainer/multirole. A no-frills fourth-generation airframe with honest, middle-of-the-road handling and no signature weapon or party trick — the control against which the exotic jets in this hangar are measured.' },
  { id:'F-22', shape:'F22', name:'F-22 RAPTOR', role:'Air Superiority', topSpeed:'Mach 2.25', ceiling:'65,000 ft', cannon:'20mm M61A2', gen:'5th GEN',
    speed:8, agility:9, accel:9, armor:7, stealth:9, firepower:8, color:0x7fd8ff, accent:0x00ffe0,
    ability:'OVERDRIVE', abilityDesc:'Afterburner surge for 6s: +75% speed, +50% gun damage, and the cannon widens to a 4-round spread.',
    passive:'PRECISION GUNS \u2014 +20% cannon damage and a standing 10% chance to land a critical hit.',
    desc:'Thrust-vectoring all-rounder \u2014 no glaring weakness, deadly in any phase of the fight.',
    context:'Lockheed Martin \u00B7 USA. The world\u2019s first operational fifth-generation fighter, in USAF service since 2005. Its twin F119 engines with rectangular thrust-vectoring nozzles let it \u201Csupercruise\u201D \u2014 sustain supersonic flight without afterburner. Only 187 were built and U.S. law forbids exporting it; for two decades it has been the benchmark every other stealth fighter is measured against.' },
  { id:'SU-57', shape:'SU57', name:'SU-57 FELON', role:'Multirole', topSpeed:'Mach 2.0', ceiling:'66,000 ft', cannon:'30mm GSh-30-1', gen:'5th GEN',
    speed:8, agility:10, accel:8, armor:7, stealth:6, firepower:9, color:0xff8b6a, accent:0xffc73a,
    ability:'COBRA', abilityDesc:'Post-stall snap: instant brake & flip, 1.5s invulnerability, plus a kinetic shockwave that guts nearby foes and shreds incoming missiles.',
    passive:'SUPERMANEUVER \u2014 +12% turn rate and grows deadlier as its health falls (up to +20% damage). Lighter hull.',
    desc:'Post-stall knife-fighter built to win the turning duel up close.',
    context:'Sukhoi \u00B7 Russia. Russia\u2019s first fifth-generation fighter, first flown in 2010 and fielded in small numbers from around 2020. It inherits the legendary supermaneuverability of the Flanker line \u2014 thrust-vectoring nozzles let it perform post-stall tricks like the Cobra \u2014 though its all-aspect stealth is widely judged less complete than its Western rivals.' },
  { id:'J-20', shape:'J20', name:'J-20 MIGHTY DRAGON', role:'Interceptor', topSpeed:'Mach 2.0', ceiling:'66,000 ft', cannon:'None (PL-15)', gen:'5th GEN',
    speed:9, agility:6, accel:8, armor:6, stealth:8, firepower:9, color:0xc78bff, accent:0xff39c8,
    ability:'EMP PULSE', abilityDesc:'Wide-area EMP: scrambles enemy weapons 6s, detonates incoming missiles, and hands you a free instant lock on the nearest contact.',
    passive:'PL-15 SNIPER \u2014 NO cannon, but +50% missile damage, +10 missiles, lightning locks, and warheads burst on impact.',
    desc:'A pure long-range missile sniper that hunts high-value targets from stand-off range.',
    context:'Chengdu \u00B7 China. China\u2019s first fifth-generation fighter, operational since 2017. Big and long-ranged, its canard-delta layout and large internal bays are built around the long-reach PL-15 air-to-air missile \u2014 it is designed to hunt tankers, AWACS and other high-value targets from stand-off range rather than turn-and-burn in a knife fight. Early jets carry no internal gun.' },
  { id:'F-35', shape:'F35', name:'F-35 LIGHTNING II', role:'Stealth Multirole', topSpeed:'Mach 1.6', ceiling:'50,000 ft', cannon:'25mm GAU-22/A', gen:'5th GEN',
    speed:6, agility:6, accel:6, armor:8, stealth:10, firepower:7, color:0x9ee86b, accent:0x39ff86,
    ability:'STEALTH FIELD', abilityDesc:'Active cloak for 7s; missiles fired while cloaked auto-home the nearest foe and ambush-kill any non-boss.',
    passive:'SENSOR FUSION \u2014 incoming missiles routinely lose lock and your own missiles hard-home. Modest cannon.',
    desc:'Software-defined stealth multirole; its real weapon is the picture it builds of the battle.',
    context:'Lockheed Martin \u00B7 USA. The most-produced stealth fighter in the world, built in three flavours: the A for runways, the jump-jet B for the Marines and amphibious ships, and the carrier C. Its real weapon is software \u2014 sensor fusion blends radar, infrared and electronic data into one picture and shares it across the formation. Flown by well over a dozen allied nations.' },
  { id:'EFT', shape:'EFT', name:'EUROFIGHTER TYPHOON', role:'Air-Superiority', topSpeed:'Mach 2.0', ceiling:'65,000 ft', cannon:'27mm Mauser BK-27', gen:'4.5 GEN',
    speed:8, agility:9, accel:10, armor:6, stealth:3, firepower:7, color:0xffdf6a, accent:0xff8a2b,
    ability:'MISSILE SALVO', abilityDesc:'Salvo: 6 hard-homing missiles at +40% damage, spread across the nearest threats.',
    passive:'ENERGY FIGHTER \u2014 +15% cannon damage, +10% turn rate and fast locks, but a thin flare load and no stealth.',
    desc:'A computer-flown canard-delta prized for ferocious instantaneous turn and acceleration.',
    context:'Airbus / BAE / Leonardo \u00B7 Europe. A four-nation collaboration (UK, Germany, Italy, Spain) in service since 2003. Deliberately built unstable and flown by computer, its close-coupled canard-delta gives ferocious instantaneous turn and class-leading acceleration \u2014 a pure energy fighter prized for within-visual-range air superiority rather than stealth.' },
  { id:'RAFALE', shape:'RAFALE', name:'DASSAULT RAFALE', role:'Omnirole', topSpeed:'Mach 1.8', ceiling:'50,000 ft', cannon:'30mm GIAT 30', gen:'4.5 GEN',
    speed:8, agility:9, accel:9, armor:6, stealth:5, firepower:8, color:0x8694a6, accent:0x4f7bff,
    ability:'SPECTRA JAMMER', abilityDesc:'SPECTRA EW field: 6s of total missile immunity — incoming missiles go blind and enemies can\u2019t launch.',
    passive:'SPECTRA SUITE \u2014 +6 long-burning flares and a reflexive point-defense that sometimes swats incoming missiles.',
    desc:'Omnirole fighter with a world-class electronic-warfare suite that fights threats instead of hiding from them.',
    context:'Dassault \u00B7 France. France calls it \u201Comnirole\u201D \u2014 one airframe for air defence, strike, recon and carrier-borne nuclear deterrence. Its SPECTRA electronic-warfare suite is among the best in the world, jamming and spoofing threats instead of hiding from them. Combat-proven over Libya, Mali, Iraq and Syria, and exported to India, Egypt, Qatar, the UAE, Greece and Croatia.' },
  { id:'TEJAS', shape:'TEJAS', name:'HAL TEJAS', role:'Light Multirole', topSpeed:'Mach 1.8', ceiling:'52,000 ft', cannon:'23mm GSh-23', gen:'4.5 GEN',
    speed:7, agility:9, accel:8, armor:5, stealth:4, firepower:6, color:0xa9c2d6, accent:0xff8c2b,
    ability:'HOLO-DECOYS', abilityDesc:'Projects 3 holographic doubles that soak up enemy guns and missiles for 6s.',
    passive:'FEATHERWEIGHT \u2014 fastest shield regen in the hangar and +14% turn rate, on a fragile 70% hull.',
    desc:'A tiny tailless compound-delta \u2014 a darting, hard-to-pin target in a turning fight.',
    context:'HAL / ADA \u00B7 India. India\u2019s home-grown lightweight fighter, inducted by the Air Force in 2016 after a long development. One of the smallest and lightest combat jets flying, its tailless compound-delta wing makes it a tricky, darting target \u2014 the cornerstone of India\u2019s push for an indigenous aerospace industry.' },
  { id:'FA18', shape:'FA18', name:'F/A-18 SUPER HORNET', role:'Carrier Multirole', topSpeed:'Mach 1.8', ceiling:'50,000 ft', cannon:'20mm M61A2', gen:'4.5 GEN',
    speed:6, agility:8, accel:7, armor:8, stealth:4, firepower:8, color:0x8f9ba9, accent:0xffd24d,
    ability:'COMBAT TRANCE', abilityDesc:'Bullet-time: the world slows to 40% for 4s while you keep flying and firing at full speed.',
    passive:'ORDNANCE TRUCK \u2014 huge gun & missile magazines, a tough 115% hull, and 6 HP repaired on every kill.',
    desc:'A rugged carrier workhorse: forgiving, adaptable, and built to keep flying when hit.',
    context:'Boeing \u00B7 USA. The backbone of the U.S. Navy\u2019s carrier air wings \u2014 a larger, longer-ranged development of the original Hornet. Rugged, forgiving at the low speeds needed for carrier approaches, and endlessly adaptable; its EA-18G \u201CGrowler\u201D cousin is the West\u2019s primary carrier-based electronic-attack jet.' },
  { id:'J-36', shape:'J36', name:'J-36', role:'Heavy Stealth \u00B7 6th Gen', topSpeed:'Classified', ceiling:'Classified', cannon:'Internal AAM bays', gen:'6th GEN',
    speed:8, agility:5, accel:6, armor:9, stealth:9, firepower:10, color:0x59708f, accent:0x33e1ff,
    ability:'ORDNANCE STORM', abilityDesc:'Empties the bays: a saturation barrage of 10 hard-homing missiles at +55% damage spread across every nearby threat, and snaps a heavy ablative shield over the airframe.',
    passive:'SATURATION PLATFORM \u2014 enormous loadout & hull and missiles burst with a heavy blast. Sluggish in a turn.',
    desc:'A flying magazine meant to penetrate deep and unload a heavy salvo rather than dogfight.',
    context:'Chengdu \u00B7 China (demonstrator). A large tailless aircraft first seen flying on 26 December 2024. Its most striking features are a broad modified-delta planform with no vertical tails and an apparent three-engine (trijet) layout \u2014 hints at a long-range, high-payload platform meant to penetrate deep and carry a heavy load of missiles rather than dogfight. Almost everything about it is still secret.' },
  { id:'F-47', shape:'F47', name:'F-47', role:'Air Dominance \u00B7 6th Gen', topSpeed:'Classified', ceiling:'Classified', cannon:'Classified', gen:'6th GEN',
    speed:9, agility:8, accel:8, armor:8, stealth:10, firepower:9, color:0x8f9aa8, accent:0xffcf3a,
    ability:'CCA SWARM', abilityDesc:'Deploys three vivid-blue Collaborative Combat Aircraft directly in front of you. They immediately hunt and gun down nearby threats for ~16s before standing down. The F-47\u2019s passive makes them hit 25% harder.',
    passive:'WING QUARTERBACK \u2014 balanced & stealthy, and every AI escort or CCA you field hits 25% harder.',
    desc:'The crewed centrepiece of a flight, built to direct teams of uncrewed combat aircraft.',
    context:'Boeing \u00B7 USA. Unveiled on 21 March 2025 as the crewed centrepiece of the U.S. Air Force\u2019s Next Generation Air Dominance (NGAD) program. The F-47 is designed less as a lone dogfighter and more as a \u201Cquarterback\u201D \u2014 a stealthy, long-range manned jet that directs teams of cheaper uncrewed Collaborative Combat Aircraft (CCAs) and is built around adaptive-cycle engines.' },
  { id:'NGAD', shape:'NGAD', name:'NGAD DEMONSTRATOR', role:'Experimental \u00B7 6th Gen', topSpeed:'Classified', ceiling:'Classified', cannon:'Directed-energy', gen:'6th GEN',
    speed:10, agility:8, accel:9, armor:8, stealth:10, firepower:9, color:0x70808f, accent:0x8fe9ff,
    ability:'DEW LANCE', abilityDesc:'Fires the directed-energy weapon: a sustained ~3s beam that melts whatever sits in your forward arc and swats any missile that strays into it.',
    passive:'BLEEDING EDGE \u2014 +10% top speed, near-perfect missile evasion, and a built-in point-defense laser.',
    desc:'A bleeding-edge demonstrator: adaptive propulsion, next-gen sensor fusion and a directed-energy weapon.',
    context:'U.S. Air Force (program / demonstrator). \u201CNGAD\u201D is the name of the whole Next Generation Air Dominance effort \u2014 and of a full-scale technology demonstrator the USAF says secretly flew as early as 2020, years before the F-47 was chosen. It stands in here for the program\u2019s bleeding edge: adaptive-cycle propulsion, next-gen sensor fusion and airborne directed-energy weapons. The real specifications remain classified.' },
  { id:'J-50', shape:'J50', name:'J-50', role:'Stealth Fighter \u00B7 6th Gen', topSpeed:'Classified', ceiling:'Classified', cannon:'Classified', gen:'6th GEN',
    speed:9, agility:9, accel:9, armor:6, stealth:8, firepower:8, color:0x6c7f96, accent:0x46ffd0,
    ability:'VECTOR SURGE', abilityDesc:'Swivels the wingtips and goes supermaneuverable for 6s: turn rate and thrust soar, every incoming missile loses its lock, and a searing plasma wake guts anything you cut close past.',
    passive:'PHANTOM AGILITY \u2014 +15% turn rate, very slippery to missiles, and a standing 10% critical-hit chance. Lighter hull.',
    desc:'A tailless phantom that steers on swivelling wingtips \u2014 nimble and slippery, lightly built.',
    context:'Shenyang / SAC \u00B7 China (demonstrator). A second Chinese sixth-generation design that surfaced in December 2024 \u2014 smaller and more fighter-like than the J-36. It is a tailless, twin-engine, lambda-wing jet that appears to use swivelling wingtips for control in place of vertical tails, and is rumoured to be aimed in part at future carrier operations.' },
];
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
// === MIRROR START (globals.js weather core) ===
const NIGHT_RADAR_MUL = 0.75;   // night (TOD index 2) additionally shortens radar detection
const WEATHER = {
  clear: { radarMul: 1.0, lockRangeMul: 1.0,  lockSpeedMul: 1.0,  turbulence: 0.0,  fogMul: 1.0 },
  fog:   { radarMul: 0.8, lockRangeMul: 0.65, lockSpeedMul: 1.15, turbulence: 0.05, fogMul: 3.0 },
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
// === MIRROR END ===
// === MIRROR START (globals.js boss phase core) ===
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
// === MIRROR END ===
let W = innerWidth, H = innerHeight;
let h2d, radarCtx, radarCanvas;
let state = 'hangar';
let onboarding = false;   // true while the first-run language-select / controls-brief screens are showing
// captured before boot writes skystrike_settings (cacheEl -> selectJet -> saveSettings), so the
// first-run check in initOnboarding() isn't fooled by settings saved during this same boot
const isReturningPlayer = !!(store.get('skystrike_onboarded') || store.get('skystrike_settings'));
let lastDt = 0.016, empFlash = 0;
let selectedJet = 0, previewJet = null, platform = null;

let player = null;
let enemies = [], bullets = [], missiles = [], flares = [], loots = [], particles = [], clouds = [], decoys = [];
let wingmen = [];   // AI escort jets that fly with the player
const BPOOL = [];
let hitMarkers = [], dmgNumbers = [];
let wave = 0, betweenWaves = true, waveTimer = 2.6;
let strikeWaveActive = false;   // true while the current wave is a ground-war strike wave
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
let gunLead = true;      // lead-computing gunsight (deflection pipper) for the cannon
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
let run = { shots: 0, hits: 0, missiles: 0, kills: 0, ground: 0, boss: 0, missions: 0, t0: 0, escortKills: 0, pMissiles: 0, pGunKills: 0, pFlares: 0, lastRivalWave: 0 };

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
const FAM_C = { core:'#19f0d4', wpn:'#ffb347', gun:'#ff9a3c', msl:'#ff7a4d', mun:'#ff5024', def:'#5dffa0', arm:'#46ff8c', prop:'#37e0ff', ew:'#ff61cf', cmd:'#ffe14d', sc:'#ffd24d', tac:'#b76bff', wing:'#8ad0ff', sup:'#ffab61', strike:'#ff4444' };
const TECH_TREE = [
  // ---- root ----
  { id:'core', x:3, y:0, req:null, fam:'core', cost:0, sym:'\u2756', name:'CORE SYSTEMS', desc:'Boot the upgrade bus. (Owned from the start of every run.)', apply:()=>{} },
  // ---- three trunks off the root; each fans into three sub-branches ----
  { id:'wpn', x:1, y:1, req:'core', fam:'wpn', cost:110, sym:'\u2724', name:'WEAPONS BUS', desc:'+12% cannon AND +12% missile damage. Opens the Gunnery, Munitions and Missile branches.', apply:p=>{ p.gunDmgMul *= 1.12; p.missileDmgMul *= 1.12; } },
  { id:'def', x:5, y:1, req:'core', fam:'def', cost:110, sym:'\u25C8', name:'AIRFRAME BUS', desc:'+25 max HP and +12 max shield, topped up now. Opens Armour, Propulsion and EW.', apply:p=>{ p.maxHp += 25; p.hp = p.maxHp; p.maxShield += 12; p.shield = p.maxShield; } },
  { id:'cmd', x:9, y:1, req:'core', fam:'cmd', tab:'armory', cost:110, sym:'\u2605', name:'COMMAND BUS', desc:'+12% score from everything. Opens Command/Economy, Tactics and Flight.', apply:p=>{ p.scoreMul *= 1.12; } },

  // ===== WEAPONS group ===========================================================
  // ---- GUNNERY (cannon line, far left) ----
  { id:'g1', x:0, y:2, req:'wpn', fam:'gun', cost:150, sym:'\u25C9', name:'HEAVY ROUNDS',     desc:'+25% cannon damage.',                                              ok:p=>!p.noCannon, apply:p=>{ p.gunDmgMul *= 1.25; } },
  { id:'g2', x:0, y:3, req:'g1',  fam:'gun', cost:280, sym:'\u25A4', name:'RAPID FEED',        desc:'+22% cannon rate of fire.',                                        ok:p=>!p.noCannon, apply:p=>{ p.fireRateMul *= 0.78; } },
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

  // ===== COMMAND group ===========================================================
  // ---- ECONOMY / ACE (score & research line, left of COMMAND) ----
  { id:'s1', x:8, y:2, req:'cmd', fam:'sc', tab:'armory', cost:150, sym:'\u2605', name:'ACE BONUS',          desc:'+25% score from everything.',                                      apply:p=>{ p.scoreMul *= 1.25; } },
  { id:'s2', x:8, y:3, req:'s1',  fam:'sc', tab:'armory', cost:300, sym:'\u25C9', name:'FIELD ANALYTICS',    desc:'+25% research points (RP) earned.',                                apply:p=>{ p.rpMul *= 1.25; } },
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

const keys = {};
let mouseRight = false;
const GAME_CODES = new Set(['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','KeyG','KeyX','KeyF','KeyR','KeyC','KeyV','KeyT','KeyY','Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight']);
const down = (c) => !!keys[c];
const HUDFONT = "'Share Tech Mono', monospace";

/* Touch controls state */
let isTouchEnabled = false;
let joyActive = false, joyTouchId = null, joyBaseCenter = {x:0, y:0}, touchInput = {x:0, y:0};
let touchBtns = { gun:false, msl:false, flr:false, spc:false, thr:false, brk:false };
// unified flight-input seam (controls.js writes it each frame; combat.js consumes + adds keyboard)
let flightInput = { pitch: 0, roll: 0 };           // normalized analog flight axes, -1..1
let motionInput = { beta: 0, gamma: 0, ready: false, attached: false };  // live device-orientation tilt
let motionOffset = { beta: 0, gamma: 0 };           // captured neutral attitude (recenter)

// flight control scheme — how combat.js INTERPRETS the flightInput seam (orthogonal to touch/motion source).
//   'auto'    (default) = bank-hold like pointer + sin(bank)*autoPitchGain back-pressure -> banking auto-turns.
//   'pointer'           = point-to-steer: roll intent -> target BANK ANGLE held; release auto-levels to wings-level.
//   'rate'              = classic: roll intent -> roll RATE (hold stick = keep rolling). Persisted via saveSettings (owner D).
let controlScheme = 'auto';
// point-to-steer tunables (only combat.js reads these). maxBank ≈ 80°. Verified stable (negative-feedback bank-hold).
const STEER = { maxBank: 1.4, bankGain: 2.4, autoLevelGain: 1.6, deadzone: 0.06, autoPitchGain: 0.6 };
// PURE — map normalized flight intent to the engine's pitch/roll command axes, honouring the control scheme.
// `intent` = { pitch, roll } in -1..1 (point-to-fly signs: +pitch=climb, +roll=bank right). `currentBank` is the
// airframe's present bank angle in radians, SAME sign frame as roll intent (combat.js passes atan2(-right.y, up.y)).
// Returns { pitchCmd, rollCmd } to be consumed exactly where flightInput.pitch/roll were before (so 'rate' is identical).
//   'rate'    : rollCmd = roll intent (-> roll rate, today's mapping). pitchCmd = pitch intent.
//   'pointer' : rollCmd holds bank to rollIntent*maxBank; |rollIntent|<deadzone auto-levels to wings-level.
//               pitchCmd = pitch intent unchanged (same climb/dive authority in both schemes).
//   'auto'    : same bank-hold as pointer; also adds sin(currentBank)*autoPitchGain to pitchCmd so banking auto-turns.
function steerCommand(scheme, intent, currentBank, t) {
  const pitchCmd = intent.pitch;
  if (scheme !== 'pointer' && scheme !== 'auto') return { pitchCmd, rollCmd: intent.roll };   // 'rate' (classic) — byte-identical mapping
  const cb = currentBank || 0;
  let rollCmd;
  if (Math.abs(intent.roll) < t.deadzone) {
    rollCmd = clamp(-cb * t.autoLevelGain / t.maxBank, -1, 1);           // wings-level seek when stick released
  } else {
    const targetBank = intent.roll * t.maxBank;
    rollCmd = clamp(t.bankGain * (targetBank - cb) / t.maxBank, -1, 1);  // proportional bank-hold
  }
  if (scheme === 'auto') {
    return { pitchCmd: clamp(pitchCmd + Math.sin(cb) * t.autoPitchGain, -1, 1), rollCmd };
  }
  return { pitchCmd, rollCmd };
}

/* shared temporaries (avoid per-frame allocation) */
const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), t3 = new THREE.Vector3(),
      t4 = new THREE.Vector3(), t5 = new THREE.Vector3(), tA = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const eul = new THREE.Euler();
const ZERO = new THREE.Vector3(0, 0, 0), UPV = new THREE.Vector3(0, 1, 0), ZAX = new THREE.Vector3(0, 0, 1);
const m4 = new THREE.Matrix4();
const pp1 = new THREE.Vector3(), pp2 = new THREE.Vector3(), pp3 = new THREE.Vector3();

function fwdOf(o, out) { return (out || new THREE.Vector3()).set(0, 0, -1).applyQuaternion(o.quaternion); }
function rightOf(o, out) { return (out || new THREE.Vector3()).set(1, 0, 0).applyQuaternion(o.quaternion); }
function upOf(o, out) { return (out || new THREE.Vector3()).set(0, 1, 0).applyQuaternion(o.quaternion); }
function fwdQ(qq, out) { return (out || new THREE.Vector3()).set(0, 0, -1).applyQuaternion(qq); }
function dirToQuat(dir, out) { m4.lookAt(ZERO, dir, UPV); return (out || new THREE.Quaternion()).setFromRotationMatrix(m4); }
