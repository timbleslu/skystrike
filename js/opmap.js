/* SKYSTRIKE — opmap.js: operation mode map generation + sector plans. Loaded after rival.js. */
let opMap = null;       // stages array from genOpMap
let opStage = 0;        // index of the stage the NEXT pick comes from
let opSector = null;    // currently-flying sector type (string) or null

function genOpMap(groundOn, rng) {
  rng = rng || Math.random;
  const pool = ['FURBALL', 'INTERCEPT', 'ELITE'].concat(groundOn ? ['STRIKE'] : []);
  const pick = () => pool[(rng() * pool.length) | 0];
  const stages = [];
  stages.push([pick(), pick()]);
  for (let s = 0; s < 4; s++) {
    const n = 2 + ((rng() * 2) | 0);
    const arr = []; for (let i = 0; i < n; i++) arr.push(pick());
    stages.push(arr);
  }
  const depotStage = 1 + ((rng() * 3) | 0);          // stages[1..3]
  stages[depotStage][(rng() * stages[depotStage].length) | 0] = 'DEPOT';
  stages.push(['FINAL']);
  return stages;
}
// sector type -> mission type for the typed-mission layer (missions.js). Pure + deterministic.
// ELITE carries an 'elite' descriptor here; startMission rolls it to escort/defend at launch.
function sectorMission(type) {
  if (type === 'FURBALL') return 'sweep';
  if (type === 'INTERCEPT') return 'intercept';
  if (type === 'STRIKE') return 'strike';
  if (type === 'ELITE') return 'elite';
  if (type === 'DEPOT') return 'none';
  return 'boss';   // FINAL
}
// Each plan carries the legacy spawn fields PLUS a `mission` descriptor and the feature #4
// `weather` + `tod` slots — the tactical condition for the sector (applied in main.js nextWave
// via applyWeather/applyTimeOfDay). tod: 0 day · 1 dusk · 2 night. Deterministic per sector type.
function sectorPlan(type, wave) {
  if (type === 'FURBALL')   return { fighters: Math.min(4 + (wave >> 1), 10), aces: wave >= 6 ? 1 : 0, bombers: 0, ground: false, boss: false, rival: false, depot: false, mission: 'sweep', weather: 'clear', tod: 0 };
  if (type === 'INTERCEPT') return { fighters: 3, aces: 0, bombers: wave >= 8 ? 4 : 3, ground: false, boss: false, rival: false, depot: false, mission: 'intercept', weather: 'fog', tod: 1 };
  if (type === 'STRIKE')    return { fighters: 3, aces: 0, bombers: 0, ground: true, boss: false, rival: false, depot: false, mission: 'strike', weather: 'storm', tod: 0 };
  if (type === 'ELITE')     return { fighters: 2, aces: 2, bombers: 0, ground: false, boss: false, rival: true, depot: false, mission: 'elite', weather: 'fog', tod: 2 };
  if (type === 'DEPOT')     return { fighters: 0, aces: 0, bombers: 0, ground: false, boss: false, rival: false, depot: true, mission: 'none', weather: 'clear', tod: 1 };
  return { fighters: 4, aces: 2, bombers: 0, ground: false, boss: true, rival: false, depot: false, mission: 'boss', weather: 'storm', tod: 2 };   // FINAL
}
