/* SKYSTRIKE — airframes.js: per-airframe SHAPES geometry-spec table + enemy shape pools.
   Pure literal config + flag-normalization (no THREE / store / DOM) — require-safe.
   Consumed at call-time by buildJet (entities/combat/main) + the hangar preview; the CommonJS
   footer lets tests/plain-shapes.test.js + tests/npc-airframes.test.js import the REAL tables
   instead of regex-scraping entities.js source. Load order: before entities.js. */

/* per-aircraft data. forward = -Z. wing/canard/htail are right-half planforms [span, chordZ] */
const SHAPES = {
  F22:  { len:18, noseLen:6.5, frontR:1.5, rearR:1.15, flat:0.6,
          wing:[[1.6,-1.6],[9.3,6.2],[9.3,7.5],[1.6,5.0]], wingY:-0.2, wingThick:0.55,
          htail:[[1.0,5.4],[4.9,8.7],[4.9,9.9],[1.0,8.6]],
          vtail:{type:'twin', base:3.8, tip:1.5, h:4.3, sweep:1.5, x:2.1, z:4.4, cant:0.49},
          lerx:true, engines:2, gap:2.0, intake:'side', wingspan:9.3,
          tailBoom:true, boomRecept:true, gunPort:true },
  SU57: { len:19, noseLen:7, frontR:1.4, rearR:1.2, flat:0.55,
          wing:[[1.6,-2.8],[9.2,4.0],[9.2,5.3],[1.8,6.6]], wingY:-0.1, wingThick:0.5,
          htail:[[1.2,5.6],[5.2,8.2],[5.2,9.3],[1.2,9.0]], htailY:-0.1,
          vtail:{type:'twin', base:2.6, tip:1.1, h:2.9, sweep:1.9, x:3.2, z:5.8, cant:0.28},
          lerx:false, engines:2, gap:3.6, intake:'side', wingspan:9.2,
          levcon:true, tunnel:true, stinger:true, nacelleSplit:true },
  J20:  { len:21, noseLen:8.5, frontR:1.25, rearR:1.1, flat:0.56,
          wing:[[1.3,-1.0],[9.6,5.4],[9.6,6.4],[1.5,7.6]], wingY:-0.2, wingThick:0.55,
          canard:[[1.2,-7.2],[4.6,-4.6],[4.6,-3.9],[1.4,-4.6]], canardY:0.25, canardDihedral:0.17,
          vtail:{type:'twin', base:2.4, tip:0.8, h:3.2, sweep:1.9, x:2.1, z:7.6, cant:0.28},
          lerx:false, engines:2, gap:1.5, intake:'side', wingspan:9.6,
          chineRidge:true, finBoom:true, bayWide:true },
  F35:  { len:16, noseLen:5.5, frontR:1.7, rearR:1.35, flat:0.72,
          wing:[[1.7,-0.8],[7.8,3.2],[7.8,4.8],[1.7,6.4]], wingY:-0.2, wingThick:0.6,
          htail:[[1.0,5.2],[4.4,7.5],[4.4,8.9],[1.0,8.8]],
          vtail:{type:'twin', base:3.4, tip:1.2, h:3.9, sweep:1.6, x:1.8, z:4.8, cant:0.42},
          lerx:true, engines:1, gap:0, intake:'side', wingspan:7.8,
          boomRecept:true, gunPort:'shoulder', sawtoothDoors:true },
  EFT:  { len:17, noseLen:7, frontR:1.3, rearR:1.2, flat:0.62,
          wing:[[1.3,-1.6],[10.4,6.6],[10.4,7.8],[1.5,8.3]], wingY:-0.15, wingThick:0.55,
          canard:[[1.3,-6.6],[3.5,-5.3],[3.5,-4.7],[1.4,-4.9]], canardY:0.35,
          vtail:{type:'single', base:4.6, tip:1.3, h:4.8, sweep:2.3, z:3.6},
          lerx:false, engines:2, gap:1.8, intake:'chin', wingspan:10.4,
          chinSplit:true, finFillet:true, dorsalBrake:true },
  TEJAS:{ len:14, noseLen:5.5, frontR:1.35, rearR:1.05, flat:0.66,
          wing:[[1.2,-1.6],[4.0,0.8],[7.4,5.0],[7.4,6.0],[1.4,6.4]], wingY:-0.15, wingThick:0.5,
          vtail:{type:'single', base:3.4, tip:1.0, h:3.6, sweep:1.9, z:3.2},
          lerx:false, engines:1, gap:0, intake:'side', wingspan:7.4,
          shoulderIntake:true, finFillet:true, tipRail:true },
  RAFALE:{ len:17, noseLen:6.5, frontR:1.35, rearR:1.2, flat:0.62,
          wing:[[1.4,-1.0],[9.6,5.6],[9.6,7.0],[1.6,7.6]], wingY:-0.1, wingThick:0.55,
          canard:[[1.5,-3.4],[3.8,-2.2],[3.8,-1.5],[1.6,-1.8]], canardY:0.55,
          vtail:{type:'single', base:3.8, tip:1.1, h:4.2, sweep:2.0, z:4.4},
          lerx:false, engines:2, gap:2.0, intake:'side', wingspan:9.6,
          semiIntake:true, noseProbe:true, finTipPod:true },
  FA18:{ len:16.5, noseLen:6, frontR:1.5, rearR:1.2, flat:0.64,
          wing:[[1.8,-0.5],[8.4,2.9],[8.4,4.6],[1.8,5.0]], wingY:-0.15, wingThick:0.55,
          htail:[[1.0,5.2],[4.9,6.9],[4.9,8.3],[1.0,8.6]],
          vtail:{type:'twin', base:3.4, tip:1.1, h:3.9, sweep:1.7, x:1.9, z:3.0, cant:0.35},
          lerx:true, bigLerx:true, engines:2, gap:1.8, intake:'side', wingspan:8.4,
          wingFold:true, tipRails:true, refuelProbe:true },
  // ---- 6th-gen tailless designs (no vertical tails) ----
  J36:  { len:24, noseLen:9, frontR:1.8, rearR:1.55, flat:0.5,
          wing:[[1.8,-6.0],[6.0,1.5],[13.0,8.0],[13.0,9.8],[7.0,9.2],[6.2,11.2],[2.0,11.6]],
          wingY:-0.1, wingThick:0.7,
          lerx:false, engines:3, gap:2.8, intake:'side', wingspan:13.0,
          dorsalIntake:true, sawtoothTE:true, wideCanopy:1.45, splitRudderTips:true },
  F47:  { len:19.5, noseLen:8, frontR:1.65, rearR:1.35, flat:0.54,
          wing:[[1.5,-1.0],[10.8,5.2],[10.8,7.0],[5.4,6.2],[1.8,8.2]], wingY:-0.18, wingThick:0.56,
          canard:[[1.5,-6.8],[4.6,-4.6],[4.6,-3.8],[1.7,-4.4]], canardY:0.2, canardCant:0.35,
          lerx:false, engines:2, gap:2.0, intake:'side', wingspan:10.8 },
  J50:  { len:18, noseLen:7.5, frontR:1.45, rearR:1.2, flat:0.55,
          wing:[[1.4,-2.0],[9.4,4.3],[9.4,5.4],[5.2,5.0],[3.4,8.0],[1.6,8.4]],
          wingY:-0.12, wingThick:0.55,
          lerx:false, engines:2, gap:1.9, intake:'side', wingspan:9.4,
          tipPivot:true, lambdaFairing:true, noseChineBlend:true, canopyFlush:true },
  ENEMY:{ len:16.5, noseLen:7.5, frontR:1.25, rearR:1.05, flat:0.58,
          wing:[[1.3,0.0],[7.6,5.2],[7.6,6.4],[1.5,7.2]], wingY:-0.2, wingThick:0.48,
          htail:[[0.9,6.0],[4.0,8.2],[4.0,9.2],[0.9,9.4]],
          vtail:{type:'twin', base:3.0, tip:0.8, h:3.4, sweep:1.8, x:1.8, z:4.8, cant:0.55},
          lerx:true, engines:2, gap:1.5, intake:'side', wingspan:7.6,
          ventral:true, noseSpike:true, hostileLights:true },
  BOSS: { len:22, noseLen:8.5, frontR:1.9, rearR:1.6, flat:0.6,
          wing:[[1.7,-2.0],[12.0,4.5],[12.0,7.5],[6.0,8.5],[2.0,10.0]], wingY:-0.2, wingThick:0.75,
          canard:[[1.7,-7.5],[4.8,-5.2],[4.8,-4.2],[1.9,-4.6]], canardY:0.15,
          vtail:{type:'twin', base:4.2, tip:1.3, h:5.4, sweep:2.2, x:3.0, z:6.5, cant:0.25},
          lerx:true, engines:3, gap:2.4, intake:'side', wingspan:12,
          ventral:true, noseSpike:true, dorsalHump:true, hostileLights:true, spineGun:true },
  STD:  { len:15.5, noseLen:5.5, frontR:1.35, rearR:1.1, flat:0.64,
          wing:[[1.3,-0.8],[8.0,3.0],[8.0,4.8],[1.5,5.8]], wingY:-0.18, wingThick:0.5,
          htail:[[0.9,5.4],[3.8,7.0],[3.8,8.0],[0.9,8.2]],
          lerx:false, engines:1, gap:0, intake:'side', wingspan:8.0,
          finFillet:true, tipRail:true,
          vtail:{type:'single', base:3.2, tip:1.1, h:3.6, sweep:1.6, z:4.6} },
  CCAJET:{ len:11, noseLen:4.5, frontR:0.95, rearR:0.8, flat:0.55,
          wing:[[0.9,-1.2],[6.8,2.6],[6.8,3.8],[3.0,3.2],[1.1,4.6]], wingY:-0.08, wingThick:0.38,
          ccaVtail:{type:'twin', base:1.8, tip:0.6, h:2.2, sweep:1.2, x:0.9, z:3.6, cant:0.7},
          lerx:false, engines:1, gap:0, intake:'dorsal', wingspan:6.8,
          clean:true, noCanopy:true, facetNose:true },
  BOMBER:{ len:21, noseLen:4, frontR:2.2, rearR:1.7, flat:0.5,
          wing:[[2.0,-8.0],[15,2.0],[15,3.8],[10.5,0.8],[6.0,5.2],[2.2,1.6]],
          wingY:0, wingThick:1.15,
          lerx:false, engines:2, gap:5.0, intake:'none', wingspan:15,
          clean:true, nozzle:'2d', eots:true,
          flyingWing:true, dorsalIntake:true, bayDoors:true },
};

/* stable id per shape — used as the geometry-cache key prefix */
Object.keys(SHAPES).forEach(k => { SHAPES[k].id = k; });

/* per-airframe accuracy flags (stealth jets fly clean; others carry tip missiles) */
['F22', 'F35', 'J20', 'SU57', 'J36', 'F47', 'J50'].forEach(k => { if (SHAPES[k]) SHAPES[k].clean = true; });
if (SHAPES.F22) SHAPES.F22.nozzle = '2d';            // F-22: rectangular 2D thrust-vectoring nozzles
if (SHAPES.J20) { SHAPES.J20.dsi = true; }  // J-20: DSI bumps (ventral fins now carried by finBoom block)
if (SHAPES.F35) SHAPES.F35.dsi = true;               // F-35: DSI inlet bumps
// 6th-gen: flat stealth nozzles & diverterless intakes
if (SHAPES.F47) { SHAPES.F47.nozzle = '2d'; SHAPES.F47.dsi = true; }
if (SHAPES.J36) { SHAPES.J36.dsi = true; }
if (SHAPES.J50) { SHAPES.J50.nozzle = '2d'; SHAPES.J50.dsi = true; }
// electro-optical sensors: forward IRST ball (Flanker/Typhoon/Rafale) vs faceted under-nose EOTS / aperture (F-35, J-20, 6th-gen)
['SU57', 'EFT', 'RAFALE'].forEach(k => { if (SHAPES[k]) SHAPES[k].irst = true; });
['F35', 'J20', 'F47', 'J36', 'J50'].forEach(k => { if (SHAPES[k]) SHAPES[k].eots = true; });
// 6th-gen US blended-body details
if (SHAPES.F47) { SHAPES.F47.dorsalHump = true; SHAPES.F47.chineRidge = true; }
// flag aliasing — unify near-duplicate spec names onto one generic implementation each
Object.keys(SHAPES).forEach(k => {
  const s = SHAPES[k];
  if (s.chineLine || s.noseChineBlend) s.chineRidge = true;   // one chine-strip block
  if (s.sawtooth || s.sawtoothDoors) s.sawtoothTE = true;     // one TE-serration block
  if (s.tipRails) s.tipRail = true;                            // one wingtip-rail block
});

/* enemy shape pools — fodder all fly STD; aces fly the named real jets */
const FIGHTER_SHAPES = ['STD'];   // regular fodder all fly the plain trainer; aces fly the named real jets
const ACE_SHAPES     = ['J20', 'F22', 'SU57', 'EFT'];

/* CommonJS export for Node tests — inert in the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SHAPES, FIGHTER_SHAPES, ACE_SHAPES };
}
