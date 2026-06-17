/* SKYSTRIKE — opmap.js: operation mode map generation + sector plans. Loaded after rival.js. */
let opMap = null;       // legacy stages array (retired with genOpMap; campaign now reads OPERATIONS)
let opStage = 0;        // index of the stage the NEXT pick comes from
let opSector = null;    // currently-flying sector type (string) or null

/* ---- OPERATIONS table (Operations Map revamp) ----
   The fixed three-operation campaign as DATA. Every level row is hand-authored with an
   ABSOLUTE spawn budget (D2 — no wave-scaled procedural plan) plus the typed-mission `type`,
   a bounded `waves` bank, and i18n KEYS for all user-facing text (strings authored in i18n.js).
   Boss levels (`type:'FINAL'`, `isBoss:true`) carry a 3-phase `boss` descriptor (PROPOSAL §2.5).
   Meta is keyed on `${opId}.${id}` — ids are stable and MUST NOT be renumbered. */
const OPERATIONS = [
  {
    id: 'ironVeil', nameKey: 'op.ironVeil.name', theaterKey: 'op.ironVeil.theater', loreKey: 'op.ironVeil.lore',
    levels: [
      { id: 'firstLight',  coords: { x: 18, y: 82 }, nameKey: 'op.ironVeil.l1.name', type: 'RECON',     objectives: [{ type: 'RECON', wp: 2 }, { type: 'STRIKE', spawn: { ground: true } }], loreKey: 'op.ironVeil.l1.lore', objectivesKey: 'op.ironVeil.l1.obj', enemyIntelKey: 'op.ironVeil.l1.intel', waves: 1, spawn: { fighters: 2, aces: 0, bombers: 0, ground: false, weather: 'clear', tod: 0, hostileAce: false } },
      { id: 'openSkies',   coords: { x: 40, y: 70 }, nameKey: 'op.ironVeil.l2.name', type: 'FURBALL',   loreKey: 'op.ironVeil.l2.lore', objectivesKey: 'op.ironVeil.l2.obj', enemyIntelKey: 'op.ironVeil.l2.intel', waves: 2, spawn: { fighters: 4, aces: 0, bombers: 0, ground: false, weather: 'clear', tod: 0, hostileAce: true } },
      { id: 'blindspot',   coords: { x: 68, y: 76 }, nameKey: 'op.ironVeil.l3.name', type: 'STEALTH',   objectives: [{ type: 'STEALTH', wp: 1 }, { type: 'STRIKE', spawn: { ground: true } }], loreKey: 'op.ironVeil.l3.lore', objectivesKey: 'op.ironVeil.l3.obj', enemyIntelKey: 'op.ironVeil.l3.intel', waves: 1, spawn: { fighters: 2, aces: 0, bombers: 0, ground: false, weather: 'fog', tod: 2, hostileAce: false } },
      { id: 'tripwire',    coords: { x: 30, y: 26 }, nameKey: 'op.ironVeil.l4.name', type: 'INTERCEPT', loreKey: 'op.ironVeil.l4.lore', objectivesKey: 'op.ironVeil.l4.obj', enemyIntelKey: 'op.ironVeil.l4.intel', waves: 3, spawn: { fighters: 3, aces: 0, bombers: 2, ground: false, weather: 'fog', tod: 1, hostileAce: true } },
      { id: 'ironShield',  coords: { x: 14, y: 50 }, nameKey: 'op.ironVeil.l5.name', type: 'DEFEND',    loreKey: 'op.ironVeil.l5.lore', objectivesKey: 'op.ironVeil.l5.obj', enemyIntelKey: 'op.ironVeil.l5.intel', waves: 3, spawn: { fighters: 3, aces: 1, bombers: 1, ground: false, weather: 'storm', tod: 1, hostileAce: true } },
      { id: 'lifeline',    coords: { x: 80, y: 30 }, nameKey: 'op.ironVeil.l6.name', type: 'ESCORT',    loreKey: 'op.ironVeil.l6.lore', objectivesKey: 'op.ironVeil.l6.obj', enemyIntelKey: 'op.ironVeil.l6.intel', waves: 4, spawn: { fighters: 3, aces: 1, bombers: 0, ground: false, weather: 'clear', tod: 0, hostileAce: true } },
      { id: 'hammerFall',  coords: { x: 56, y: 54 }, nameKey: 'op.ironVeil.l7.name', type: 'STRIKE',    loreKey: 'op.ironVeil.l7.lore', objectivesKey: 'op.ironVeil.l7.obj', enemyIntelKey: 'op.ironVeil.l7.intel', waves: 4, spawn: { fighters: 3, aces: 0, bombers: 0, ground: true, weather: 'storm', tod: 0, hostileAce: true } },
      { id: 'warlord',     coords: { x: 62, y: 38 }, nameKey: 'op.ironVeil.l8.name', type: 'FINAL',     loreKey: 'op.ironVeil.l8.lore', objectivesKey: 'op.ironVeil.l8.obj', enemyIntelKey: 'op.ironVeil.l8.intel', waves: 1, isBoss: true, bossApproachWave: true, spawn: { fighters: 4, aces: 2, bombers: 0, ground: false, weather: 'storm', tod: 2, hostileAce: false },
        boss: { callsignKey: 'boss.warlord', introKey: 'op.ironVeil.l8.bossIntro', phases: [
          { descKey: 'boss.warlord.p1', turnMul: 1.0, fireMul: 1.0, extraMissiles: 0 },
          { descKey: 'boss.warlord.p2', turnMul: 1.0, fireMul: 1.3, extraMissiles: 2, weather: 'storm', flags: ['chaff'] },
          { descKey: 'boss.warlord.p3', turnMul: 1.4, fireMul: 1.0, extraMissiles: 0, pattern: 'headOn' },
        ] } },
    ],
  },
  {
    id: 'midnightMeridian', nameKey: 'op.midnightMeridian.name', theaterKey: 'op.midnightMeridian.theater', loreKey: 'op.midnightMeridian.lore',
    levels: [
      { id: 'deadChannel',  coords: { x: 30, y: 84 }, nameKey: 'op.midnightMeridian.l1.name', type: 'STEALTH',   objectives: [{ type: 'STEALTH', wp: 1 }, { type: 'STRIKE', spawn: { ground: true } }, { type: 'SWEEP', spawn: { fighters: 3 } }], loreKey: 'op.midnightMeridian.l1.lore', objectivesKey: 'op.midnightMeridian.l1.obj', enemyIntelKey: 'op.midnightMeridian.l1.intel', waves: 1, spawn: { fighters: 2, aces: 0, bombers: 0, ground: true,  weather: 'fog',   tod: 2, hostileAce: false } },
      { id: 'ghostSignal',  coords: { x: 52, y: 72 }, nameKey: 'op.midnightMeridian.l2.name', type: 'RECON',     objectives: [{ type: 'RECON', wp: 2 }, { type: 'STRIKE', spawn: { ground: true } }, { type: 'INTERCEPT', spawn: { bombers: 3 } }], loreKey: 'op.midnightMeridian.l2.lore', objectivesKey: 'op.midnightMeridian.l2.obj', enemyIntelKey: 'op.midnightMeridian.l2.intel', waves: 1, spawn: { fighters: 2, aces: 0, bombers: 0, ground: false, weather: 'fog',   tod: 2, hostileAce: false } },
      { id: 'coldIron',     coords: { x: 74, y: 62 }, nameKey: 'op.midnightMeridian.l3.name', type: 'FURBALL',   loreKey: 'op.midnightMeridian.l3.lore', objectivesKey: 'op.midnightMeridian.l3.obj', enemyIntelKey: 'op.midnightMeridian.l3.intel', waves: 3, spawn: { fighters: 4, aces: 0, bombers: 0, ground: false, weather: 'storm', tod: 1, hostileAce: true } },
      { id: 'ironCurtain',  coords: { x: 60, y: 24 }, nameKey: 'op.midnightMeridian.l4.name', type: 'INTERCEPT', loreKey: 'op.midnightMeridian.l4.lore', objectivesKey: 'op.midnightMeridian.l4.obj', enemyIntelKey: 'op.midnightMeridian.l4.intel', waves: 3, spawn: { fighters: 3, aces: 0, bombers: 3, ground: false, weather: 'fog',   tod: 1, hostileAce: true } },
      { id: 'lastLine',     coords: { x: 16, y: 56 }, nameKey: 'op.midnightMeridian.l5.name', type: 'DEFEND',    loreKey: 'op.midnightMeridian.l5.lore', objectivesKey: 'op.midnightMeridian.l5.obj', enemyIntelKey: 'op.midnightMeridian.l5.intel', waves: 4, spawn: { fighters: 3, aces: 1, bombers: 2, ground: false, weather: 'storm', tod: 2, hostileAce: true } },
      { id: 'longReach',    coords: { x: 46, y: 46 }, nameKey: 'op.midnightMeridian.l6.name', type: 'STRIKE',    loreKey: 'op.midnightMeridian.l6.lore', objectivesKey: 'op.midnightMeridian.l6.obj', enemyIntelKey: 'op.midnightMeridian.l6.intel', waves: 4, spawn: { fighters: 3, aces: 1, bombers: 0, ground: true,  weather: 'storm', tod: 1, hostileAce: true } },
      { id: 'extraction',   coords: { x: 24, y: 30 }, nameKey: 'op.midnightMeridian.l7.name', type: 'ESCORT',    loreKey: 'op.midnightMeridian.l7.lore', objectivesKey: 'op.midnightMeridian.l7.obj', enemyIntelKey: 'op.midnightMeridian.l7.intel', waves: 4, spawn: { fighters: 4, aces: 1, bombers: 0, ground: false, weather: 'storm', tod: 2, hostileAce: true } },
      { id: 'glacier',      coords: { x: 50, y: 14 }, nameKey: 'op.midnightMeridian.l8.name', type: 'FINAL',     loreKey: 'op.midnightMeridian.l8.lore', objectivesKey: 'op.midnightMeridian.l8.obj', enemyIntelKey: 'op.midnightMeridian.l8.intel', waves: 1, isBoss: true, bossApproachWave: true, spawn: { fighters: 4, aces: 2, bombers: 0, ground: false, weather: 'storm', tod: 1, hostileAce: false },
        boss: { callsignKey: 'boss.glacier', introKey: 'op.midnightMeridian.l8.bossIntro', phases: [
          { descKey: 'boss.glacier.p1', turnMul: 0.8, fireMul: 1.0, extraMissiles: 2, pattern: 'standoff', weather: 'fog', tod: 2 },
          { descKey: 'boss.glacier.p2', turnMul: 1.3, fireMul: 1.2, extraMissiles: 0, weather: 'storm' },
          { descKey: 'boss.glacier.p3', turnMul: 1.4, fireMul: 1.0, extraMissiles: 0, pattern: 'dive' },
        ] } },
    ],
  },
  {
    id: 'sunfireHorizon', nameKey: 'op.sunfireHorizon.name', theaterKey: 'op.sunfireHorizon.theater', loreKey: 'op.sunfireHorizon.lore',
    levels: [
      { id: 'openWater',     coords: { x: 22, y: 86 }, nameKey: 'op.sunfireHorizon.l1.name', type: 'FURBALL',   loreKey: 'op.sunfireHorizon.l1.lore', objectivesKey: 'op.sunfireHorizon.l1.obj', enemyIntelKey: 'op.sunfireHorizon.l1.intel', waves: 2, spawn: { fighters: 4, aces: 0, bombers: 0, ground: false, weather: 'clear', tod: 0, hostileAce: true } },
      { id: 'sunscreen',     coords: { x: 78, y: 74 }, nameKey: 'op.sunfireHorizon.l2.name', type: 'INTERCEPT', loreKey: 'op.sunfireHorizon.l2.lore', objectivesKey: 'op.sunfireHorizon.l2.obj', enemyIntelKey: 'op.sunfireHorizon.l2.intel', waves: 2, spawn: { fighters: 3, aces: 1, bombers: 2, ground: false, weather: 'clear', tod: 0, hostileAce: true } },
      { id: 'deadReckoning', coords: { x: 50, y: 64 }, nameKey: 'op.sunfireHorizon.l3.name', type: 'RECON',     objectives: [{ type: 'RECON', wp: 2 }, { type: 'SWEEP', spawn: { fighters: 3 } }, { type: 'DEFEND', spawn: { bombers: 2 } }], loreKey: 'op.sunfireHorizon.l3.lore', objectivesKey: 'op.sunfireHorizon.l3.obj', enemyIntelKey: 'op.sunfireHorizon.l3.intel', waves: 1, spawn: { fighters: 2, aces: 0, bombers: 0, ground: false, weather: 'clear', tod: 1, hostileAce: false } },
      { id: 'shieldwall',    coords: { x: 14, y: 70 }, nameKey: 'op.sunfireHorizon.l4.name', type: 'DEFEND',    loreKey: 'op.sunfireHorizon.l4.lore', objectivesKey: 'op.sunfireHorizon.l4.obj', enemyIntelKey: 'op.sunfireHorizon.l4.intel', waves: 3, spawn: { fighters: 3, aces: 1, bombers: 2, ground: true,  weather: 'storm', tod: 0, hostileAce: true } },
      { id: 'lifeguard',     coords: { x: 20, y: 44 }, nameKey: 'op.sunfireHorizon.l5.name', type: 'ESCORT',    loreKey: 'op.sunfireHorizon.l5.lore', objectivesKey: 'op.sunfireHorizon.l5.obj', enemyIntelKey: 'op.sunfireHorizon.l5.intel', waves: 3, spawn: { fighters: 3, aces: 1, bombers: 0, ground: false, weather: 'clear', tod: 1, hostileAce: true } },
      { id: 'silentEntry',   coords: { x: 46, y: 48 }, nameKey: 'op.sunfireHorizon.l6.name', type: 'STEALTH',   objectives: [{ type: 'STEALTH', wp: 1 }, { type: 'STRIKE', spawn: { ground: true } }, { type: 'ESCORT', spawn: { fighters: 3 } }], loreKey: 'op.sunfireHorizon.l6.lore', objectivesKey: 'op.sunfireHorizon.l6.obj', enemyIntelKey: 'op.sunfireHorizon.l6.intel', waves: 1, spawn: { fighters: 3, aces: 0, bombers: 0, ground: true,  weather: 'fog',   tod: 2, hostileAce: false } },
      { id: 'firstVolley',   coords: { x: 70, y: 38 }, nameKey: 'op.sunfireHorizon.l7.name', type: 'STRIKE',    loreKey: 'op.sunfireHorizon.l7.lore', objectivesKey: 'op.sunfireHorizon.l7.obj', enemyIntelKey: 'op.sunfireHorizon.l7.intel', waves: 4, spawn: { fighters: 3, aces: 1, bombers: 0, ground: true,  weather: 'storm', tod: 1, hostileAce: true } },
      { id: 'secondSun',     coords: { x: 40, y: 26 }, nameKey: 'op.sunfireHorizon.l8.name', type: 'STRIKE',    loreKey: 'op.sunfireHorizon.l8.lore', objectivesKey: 'op.sunfireHorizon.l8.obj', enemyIntelKey: 'op.sunfireHorizon.l8.intel', waves: 4, spawn: { fighters: 4, aces: 1, bombers: 0, ground: true,  weather: 'storm', tod: 2, hostileAce: true } },
      { id: 'corsair',       coords: { x: 66, y: 18 }, nameKey: 'op.sunfireHorizon.l9.name', type: 'FINAL',     loreKey: 'op.sunfireHorizon.l9.lore', objectivesKey: 'op.sunfireHorizon.l9.obj', enemyIntelKey: 'op.sunfireHorizon.l9.intel', waves: 1, isBoss: true, bossApproachWave: true, spawn: { fighters: 4, aces: 2, bombers: 0, ground: false, weather: 'storm', tod: 2, hostileAce: false },
        boss: { callsignKey: 'boss.corsair', introKey: 'op.sunfireHorizon.l9.bossIntro', phases: [
          { descKey: 'boss.corsair.p1', turnMul: 1.2, fireMul: 1.0, extraMissiles: 0, flags: ['mirror'] },
          { descKey: 'boss.corsair.p2', turnMul: 1.2, fireMul: 1.3, extraMissiles: 2 },
          { descKey: 'boss.corsair.p3', turnMul: 1.5, fireMul: 1.3, extraMissiles: 2, pattern: 'headOn' },
        ] } },
    ],
  },
];

// PURE: build the authored-absolute spawn plan for a level row. Unlike sectorPlan(type, wave)
// (whose wave-scaled branches are DEAD at bounded waves), this reads the level's hand-authored
// `spawn` budget verbatim, adds the typed-mission descriptor + boss flag, and folds an optional
// set-piece. Returns a NEW object; the level row is never mutated (mirrors setpiecePlan).
function levelPlan(lvl) {
  const s = lvl.spawn || {};
  const plan = {
    fighters: s.fighters, aces: s.aces, bombers: s.bombers,
    ground: !!s.ground, weather: s.weather, tod: s.tod,
    hostileAce: !!s.hostileAce,
    rival: false, depot: false,
    mission: sectorMission(lvl.type),
    boss: lvl.type === 'FINAL',
  };
  // multi-phase objective sequence (Operations objective pass): pass the authored queue through so
  // startSectorMission walks it phase-by-phase. `mission` above stays the FIRST phase's verb.
  if (Array.isArray(lvl.objectives) && lvl.objectives.length) plan.objectives = lvl.objectives;
  if (lvl.setpiece) return setpiecePlan(lvl.setpiece, plan);
  return plan;
}
// sector type -> mission type for the typed-mission layer (missions.js). Pure + deterministic.
// ESCORT/DEFEND are first-class objective sectors; ELITE is a no-objective elite-ace furball.
function sectorMission(type) {
  if (type === 'FURBALL') return 'sweep';
  if (type === 'INTERCEPT') return 'intercept';
  if (type === 'STRIKE') return 'strike';
  if (type === 'ESCORT') return 'escort';
  if (type === 'DEFEND') return 'defend';
  if (type === 'RECON') return 'recon';
  if (type === 'STEALTH') return 'stealth';
  if (type === 'ELITE') return 'none';
  if (type === 'DEPOT') return 'none';
  return 'boss';   // FINAL
}
// Each plan carries the legacy spawn fields PLUS a `mission` descriptor and the feature #4
// `weather` + `tod` slots — the tactical condition for the sector (applied in main.js nextWave
// via applyWeather/applyTimeOfDay). tod: 0 day · 1 dusk · 2 night. Deterministic per sector type.
function sectorPlan(type, wave) {
  if (type === 'FURBALL')   return { fighters: Math.min(4 + (wave >> 1), 10), aces: wave >= 6 ? 1 : 0, bombers: 0, ground: false, boss: false, rival: false, depot: false, hostileAce: true,  mission: 'sweep', weather: 'clear', tod: 0 };
  if (type === 'INTERCEPT') return { fighters: 3, aces: 0, bombers: wave >= 8 ? 4 : 3, ground: false, boss: false, rival: false, depot: false, hostileAce: true,  mission: 'intercept', weather: 'fog', tod: 1 };
  if (type === 'STRIKE')    return { fighters: 3, aces: 0, bombers: 0, ground: true, boss: false, rival: false, depot: false, hostileAce: true,  mission: 'strike', weather: 'storm', tod: 0 };
  if (type === 'ESCORT')    return { fighters: 3, aces: wave >= 8 ? 1 : 0, bombers: 0, ground: false, boss: false, rival: false, depot: false, hostileAce: true,  mission: 'escort', weather: 'clear', tod: 0 };
  if (type === 'DEFEND')    return { fighters: 3, aces: 0, bombers: wave >= 8 ? 2 : 1, ground: false, boss: false, rival: false, depot: false, hostileAce: true,  mission: 'defend', weather: 'storm', tod: 1 };
  if (type === 'RECON')     return { fighters: 2, aces: 0, bombers: 0, ground: false, boss: false, rival: false, depot: false, hostileAce: false, mission: 'recon', weather: 'clear', tod: 0 };   // non-combat photo-pass: light contact, kills not required
  if (type === 'STEALTH')   return { fighters: 2, aces: 0, bombers: 0, ground: false, boss: false, rival: false, depot: false, hostileAce: false, mission: 'stealth', weather: 'fog', tod: 2 };   // no-kill infiltration: patrols that can SPOT you raise the alarm
  if (type === 'ELITE')     return { fighters: 2, aces: 2, bombers: 0, ground: false, boss: false, rival: true, depot: false, hostileAce: true,  mission: 'none', weather: 'fog', tod: 2 };
  if (type === 'DEPOT')     return { fighters: 0, aces: 0, bombers: 0, ground: false, boss: false, rival: false, depot: true, hostileAce: false, mission: 'none', weather: 'clear', tod: 1 };
  return { fighters: 4, aces: 2, bombers: 0, ground: false, boss: true, rival: false, depot: false, hostileAce: false, mission: 'boss', weather: 'storm', tod: 2 };   // FINAL
}

/* ---- Scripted set-pieces (F14) ----
   Specific campaign NODES trigger an AUTHORED encounter instead of procedural waves.
   The selection + plan-fold + resolution below are PURE and mirrored byte-identical in
   tests/setpiece.test.js between the MIRROR markers. The runtime glue (banner + spawns)
   lives in missions.js (startSetpiece), driven from nextWave (main.js). */
// ---- BEGIN MIRROR (js/opmap.js setpiece core) ----
// Authored encounters as DATA. `mission` reuses the existing typed-mission seam
// (missions.js) so each set-piece resolves through onMissionResolved's win/fail.
// `ground` reuses queueStrikeSite's fortified SAM/AAA/convoy. i18n keys carry the
// localized name + intro/outro lines. `convoy`/`bombers` tune the authored spawns.
const SETPIECES = {
  // outrun a wall of SAMs: a fortified ground site IS the objective (strike it).
  samCorridor: { mission: 'strike',    ground: true,  bombers: 0, convoy: 0, name: 'setpiece.samCorridor', intro: 'setpiece.samCorridor.intro', outro: 'setpiece.samCorridor.outro' },
  // shepherd a friendly bomber wing out through SAM lanes (escort + ground threat).
  bomberRun:   { mission: 'escort',    ground: true,  bombers: 0, convoy: 4, name: 'setpiece.bomberRun',   intro: 'setpiece.bomberRun.intro',   outro: 'setpiece.bomberRun.outro' },
  // thread a carrier group's screen of interceptors (no ground; pure air gauntlet).
  carrier:     { mission: 'intercept', ground: false, bombers: 5, convoy: 0, name: 'setpiece.carrier',     intro: 'setpiece.carrier.intro',     outro: 'setpiece.carrier.outro' },
};

// RETIRED with genOpMap: set-pieces are now opt-in per level row (`lvl.setpiece`, folded by
// levelPlan), not keyed on stage coordinates. Kept exported for back-compat; always returns null.
function setpieceFor(type, stage) {
  return null;
}

// PURE: fold an authored encounter onto a base sector plan. Overrides the mission
// descriptor + ground flag + bomber/convoy counts the script needs, tags `setpiece`,
// and leaves the base plan's weather/tod/hostileAce/etc. untouched. Returns a NEW plan.
function setpiecePlan(id, base) {
  const sp = SETPIECES[id];
  if (!sp) return base;
  const p = {};
  for (const k in base) p[k] = base[k];
  p.mission = sp.mission;
  p.ground = sp.ground;
  p.bombers = sp.bombers;
  p.setpiece = id;
  p.convoy = sp.convoy;
  p.boss = false;
  return p;
}

// PURE: an authored encounter resolves through the SAME mission win/fail seam; map
// the outcome to the localized outro/fail banner key. Win -> the encounter's outro;
// loss -> the shared objective-failed line.
function setpieceOutcome(id, won) {
  const sp = SETPIECES[id];
  if (won) return sp ? sp.outro : 'banner.missionComplete';
  return 'banner.missionFailedObj';
}
// ---- END MIRROR ----

/* CommonJS export for Node tests — inert in the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OPERATIONS, levelPlan, sectorMission, sectorPlan, SETPIECES, setpieceFor, setpiecePlan, setpieceOutcome };
}
