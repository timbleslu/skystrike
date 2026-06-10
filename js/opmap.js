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
function sectorPlan(type, wave) {
  if (type === 'FURBALL')   return { fighters: Math.min(4 + (wave >> 1), 10), aces: wave >= 6 ? 1 : 0, bombers: 0, ground: false, boss: false, rival: false, depot: false };
  if (type === 'INTERCEPT') return { fighters: 3, aces: 0, bombers: wave >= 8 ? 3 : 2, ground: false, boss: false, rival: false, depot: false };
  if (type === 'STRIKE')    return { fighters: 3, aces: 0, bombers: 0, ground: true, boss: false, rival: false, depot: false };
  if (type === 'ELITE')     return { fighters: 2, aces: 2, bombers: 0, ground: false, boss: false, rival: true, depot: false };
  if (type === 'DEPOT')     return { fighters: 0, aces: 0, bombers: 0, ground: false, boss: false, rival: false, depot: true };
  return { fighters: 4, aces: 2, bombers: 0, ground: false, boss: true, rival: false, depot: false };   // FINAL
}
