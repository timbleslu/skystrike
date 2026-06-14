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
