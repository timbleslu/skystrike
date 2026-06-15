/* SKYSTRIKE — opmap.js: operation mode map generation + sector plans. Loaded after rival.js. */
let opMap = null;       // stages array from genOpMap
let opStage = 0;        // index of the stage the NEXT pick comes from
let opSector = null;    // currently-flying sector type (string) or null

// Fixed campaign progression — the same hand-authored map every run (no longer random).
// Each stage offers a choice of sectors; the player picks one per column, left to right.
// All five mission types (sweep/intercept/escort/defend/strike) appear as labelled sectors,
// a mid-campaign DEPOT gives a resupply breather, and FINAL caps the operation with the boss.
// STRIKE needs the ground war; when it's off those sectors fall back to an air INTERCEPT.
function genOpMap(groundOn) {
  const strike = groundOn ? 'STRIKE' : 'INTERCEPT';
  return [
    ['FURBALL', 'INTERCEPT'],
    [strike, 'ESCORT'],
    ['DEFEND', 'FURBALL'],
    ['DEPOT', 'INTERCEPT'],
    ['ESCORT', strike],
    ['ELITE', 'DEFEND'],
    ['FINAL'],
  ];
}
// sector type -> mission type for the typed-mission layer (missions.js). Pure + deterministic.
// ESCORT/DEFEND are first-class objective sectors; ELITE is a no-objective elite-ace furball.
function sectorMission(type) {
  if (type === 'FURBALL') return 'sweep';
  if (type === 'INTERCEPT') return 'intercept';
  if (type === 'STRIKE') return 'strike';
  if (type === 'ESCORT') return 'escort';
  if (type === 'DEFEND') return 'defend';
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

// PURE + deterministic: which authored set-piece (if any) a campaign node triggers.
// Keyed on (sector type, stage index) against the FIXED genOpMap campaign, so a given
// run's node always plays the same scripted event. Returns an id into SETPIECES or null.
// 1–2 per campaign: STRIKE @ stage 1 = the SAM corridor; ESCORT @ stage 4 = the bomber run.
function setpieceFor(type, stage) {
  if (type === 'STRIKE' && stage === 1) return 'samCorridor';
  if (type === 'ESCORT' && stage === 4) return 'bomberRun';
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
  module.exports = { genOpMap, sectorMission, sectorPlan, SETPIECES, setpieceFor, setpiecePlan, setpieceOutcome };
}
