/* SKYSTRIKE — entities.js: jet/boss/ground/drone mesh construction, player & enemy creation, enemy AI updates & weapons. Load 3rd. */

/* ---------------- geometry cache ----------------
   Jet geometry is deterministic per (shape, hero). Triangulating LatheGeometry +
   ExtrudeGeometry on every spawn caused the wave-start freeze, so build each shape's
   geometry once and share it across all instances. Materials stay per-instance, so
   runtime colour/emissive mutations are unaffected. Cached geometry is tagged
   userData.shared so disposeGroup never frees geometry still used by living enemies.
   A falsy key bypasses the cache (defensive — every SHAPES entry has an id). */
const GEO_CACHE = new Map();
function cacheGeo(key, factory) {
  if (!key) return factory();
  let g = GEO_CACHE.get(key);
  if (!g) { g = factory(); g.userData.shared = true; GEO_CACHE.set(key, g); }
  return g;
}

/* flag every opaque mesh in a built model as a shadow caster (glows, flames and
   the tinted canopy stay non-casting so additive/transparent parts don't block light) */
function markShadowCasters(g) {
  g.traverse(o => { if (o.isMesh && o.material && !o.material.transparent && o.material.blending !== THREE.AdditiveBlending) o.castShadow = true; });
}

/* object-space noise patch for airframe skins: subtle panel-grime albedo breakup +
   roughness variation so sun glints streak across the hull instead of reading flat.
   UV-free, so it works on lathe and extrude geometry alike; identical shader source
   keeps one compiled program shared across every patched material. */
function patchJetSurface(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'varying vec3 vOPos;',
        'float jhash(vec3 p){ return fract(sin(dot(p, vec3(17.1, 31.7, 53.7))) * 43758.5453); }',
        'float jnoise(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); vec3 u = f*f*(3.0-2.0*f);',
        '  return mix(mix(mix(jhash(i), jhash(i+vec3(1,0,0)), u.x), mix(jhash(i+vec3(0,1,0)), jhash(i+vec3(1,1,0)), u.x), u.y),',
        '             mix(mix(jhash(i+vec3(0,0,1)), jhash(i+vec3(1,0,1)), u.x), mix(jhash(i+vec3(0,1,1)), jhash(i+vec3(1,1,1)), u.x), u.y), u.z); }',
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'diffuseColor.rgb *= 0.93 + jnoise(vOPos * 0.55) * 0.10 + jnoise(vOPos * 2.3) * 0.04;',
        // scribed panel lines at fuselage stations (z) and butt lines (x), faintly darker
        'float jst = fract(vOPos.z * 0.30); float jln = smoothstep(0.045, 0.0, min(jst, 1.0 - jst));',
        'float jst2 = fract(vOPos.x * 0.42 + 0.5); float jln2 = smoothstep(0.035, 0.0, min(jst2, 1.0 - jst2));',
        'diffuseColor.rgb *= 1.0 - 0.05 * jln - 0.035 * jln2;',
        // operational two-tone: darker spine, paler belly
        'diffuseColor.rgb *= mix(1.05, 0.93, smoothstep(-1.4, 1.6, vOPos.y));',
      ].join('\n'))
      .replace('#include <roughnessmap_fragment>', [
        '#include <roughnessmap_fragment>',
        'roughnessFactor = clamp(roughnessFactor + (jnoise(vOPos * 1.7) - 0.5) * 0.22 + jln * 0.1, 0.05, 1.0);',
      ].join('\n'));
  };
}

/* per-frame engine animation: afterburner flame stretches and flickers with throttle;
   nozzle interior heats up, the white core lengthens, and shock diamonds fade in at burner */
function animEngines(group, thr) {
  const eng = group.userData.engines; if (!eng) return;
  const hm = group.userData.heatMat;
  if (hm) hm.emissiveIntensity = 0.25 + thr * 1.9;
  for (let i = 0; i < eng.length; i++) {
    const en = eng[i];
    const fl = 0.92 + Math.random() * 0.16;
    en.flame.scale.set(fl, fl, (0.55 + thr * 1.05) * fl);
    en.flame.material.opacity = (0.28 + thr * 0.42) * fl;
    en.glow.material.opacity = 0.35 + thr * 0.3;
    if (en.core) { en.core.scale.set(fl, fl, (0.4 + thr * 1.25) * fl); en.core.material.opacity = (0.18 + thr * 0.55) * fl; }
    if (en.dia) {
      const on = thr > 0.52; en.dia.visible = on;
      if (on) { const k = (thr - 0.52) / 0.48; en.diaMat.opacity = (0.22 + 0.55 * k) * fl; en.dia.scale.z = 0.75 + k * 0.45; }
    }
  }
}

/* ---------------- jet meshes (high-poly parametric) ---------------- */
/* extruded, swept wing/canard/stab built from a half-planform [span, chordZ] (chordZ<0 = forward) */
function extrudeWing(pts, thick, mat, y, bevelSeg, cacheKey) {
  const bs = bevelSeg || 1;
  const geo = cacheGeo(cacheKey, () => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    const g2 = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.46, bevelSize: 0.26, bevelSegments: bs, steps: 1, curveSegments: bs > 2 ? 10 : 6 });
    g2.translate(0, 0, -thick / 2); g2.rotateX(Math.PI / 2);   // geometry-space transforms run once
    return g2;
  });
  const grp = new THREE.Group();
  const r = new THREE.Mesh(geo, mat);
  const l = new THREE.Mesh(geo, mat); l.scale.x = -1;
  grp.add(r, l); grp.position.y = y || 0; return grp;
}
/* swept vertical fin from {base,tip,h,sweep,thick} */
function buildFin(p, mat, bevelSeg, cacheKey) {
  const th = p.thick || 0.3;
  const bs = bevelSeg || 1;
  const geo = cacheGeo(cacheKey, () => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(p.base, 0); sh.lineTo(p.sweep + p.tip, p.h); sh.lineTo(p.sweep, p.h); sh.closePath();
    const g2 = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: bs, steps: 1, curveSegments: bs > 2 ? 8 : 5 });
    g2.translate(0, 0, -th / 2); g2.rotateY(-Math.PI / 2);   // geometry-space transforms run once
    return g2;
  });
  return new THREE.Mesh(geo, mat);
}
/* compact wingtip missile (nose toward -Z): the real shared missile airframe scaled
   down on a launch rail. ASSET geometry/trim material are shared-tagged, so jet
   teardown via disposeGroup leaves the live missile pool untouched. */
function buildTipMissile(x, y, z, mat, glowColor) {
  const g = new THREE.Group();
  const rail = new THREE.Mesh(cacheGeo('tipmsl:rail', () => new THREE.BoxGeometry(0.16, 0.34, 2.4)), mat);
  rail.position.set(0, 0.32, 0.3); g.add(rail);
  const sc = 0.22;
  const hull = new THREE.Mesh(ASSET.missileHullGeo, mat); hull.scale.setScalar(sc); g.add(hull);
  const trim = new THREE.Mesh(ASSET.missileTrimGeo, ASSET.missileTrimPlayer); trim.scale.setScalar(sc); g.add(trim);
  const tip = new THREE.Mesh(cacheGeo('tipmsl:tip', () => new THREE.SphereGeometry(0.15, 10, 8)), new THREE.MeshBasicMaterial({ color: glowColor || 0x66ccff, fog: false }));
  tip.position.z = -12 * sc - 0.1; g.add(tip);
  g.position.set(x, y, z);
  return g;
}

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
  NGAD: { len:21, noseLen:9, frontR:1.7, rearR:1.45, flat:0.5,
          wing:[[1.4,-3.0],[12.2,6.0],[12.2,8.0],[7.0,7.0],[3.6,9.8],[1.6,9.0]], wingY:-0.14, wingThick:0.6,
          lerx:true, engines:2, gap:2.4, intake:'side', wingspan:12.2 },
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
['F22', 'F35', 'J20', 'SU57', 'J36', 'F47', 'NGAD', 'J50'].forEach(k => { if (SHAPES[k]) SHAPES[k].clean = true; });
if (SHAPES.F22) SHAPES.F22.nozzle = '2d';            // F-22: rectangular 2D thrust-vectoring nozzles
if (SHAPES.J20) { SHAPES.J20.dsi = true; }  // J-20: DSI bumps (ventral fins now carried by finBoom block)
if (SHAPES.F35) SHAPES.F35.dsi = true;               // F-35: DSI inlet bumps
// 6th-gen: flat stealth nozzles & diverterless intakes
if (SHAPES.F47) { SHAPES.F47.nozzle = '2d'; SHAPES.F47.dsi = true; }
if (SHAPES.NGAD) { SHAPES.NGAD.nozzle = '2d'; SHAPES.NGAD.dsi = true; }
if (SHAPES.J36) { SHAPES.J36.dsi = true; }
if (SHAPES.J50) { SHAPES.J50.nozzle = '2d'; SHAPES.J50.dsi = true; }
// electro-optical sensors: forward IRST ball (Flanker/Typhoon/Rafale) vs faceted under-nose EOTS / aperture (F-35, J-20, 6th-gen)
['SU57', 'EFT', 'RAFALE'].forEach(k => { if (SHAPES[k]) SHAPES[k].irst = true; });
['F35', 'J20', 'F47', 'NGAD', 'J36', 'J50'].forEach(k => { if (SHAPES[k]) SHAPES[k].eots = true; });
// 6th-gen US blended-body details (NGAD/F47 share dorsalHump + chineRidge; NGAD adds sawtoothTE + buriedExhaust)
if (SHAPES.NGAD) { SHAPES.NGAD.dorsalHump = true; SHAPES.NGAD.chineRidge = true; SHAPES.NGAD.sawtoothTE = true; SHAPES.NGAD.buriedExhaust = true; }
if (SHAPES.F47) { SHAPES.F47.dorsalHump = true; SHAPES.F47.chineRidge = true; }
// flag aliasing — unify near-duplicate spec names onto one generic implementation each
Object.keys(SHAPES).forEach(k => {
  const s = SHAPES[k];
  if (s.chineLine || s.noseChineBlend) s.chineRidge = true;   // one chine-strip block
  if (s.sawtooth || s.sawtoothDoors) s.sawtoothTE = true;     // one TE-serration block
  if (s.tipRails) s.tipRail = true;                            // one wingtip-rail block
});

/* thin dark control-surface seam laid along a wing planform's trailing edge (both sides) */
function buildHingeSeam(pts, y, thick, mat) {
  const rootTE = pts[pts.length - 1];
  let tip = pts[0]; for (const p of pts) if (p[0] > tip[0]) tip = p;
  const x0 = Math.min(rootTE[0] + 0.6, tip[0] * 0.55), z0 = rootTE[1] - 0.35;
  const x1 = tip[0] * 0.9, z1 = tip[1] - 0.35;
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  const dx = x1 - x0, dz = z1 - z0, len = Math.max(1.2, Math.hypot(dx, dz));
  const grp = new THREE.Group();
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, thick * 1.5, len), mat);
    m.position.set(sx * mx, 0, mz); m.rotation.y = sx * Math.atan2(dx, dz);
    grp.add(m);
  }
  grp.position.y = y + thick * 0.55;
  return grp;
}

/* ---- lofted fuselage: superellipse cross-sections swept nose→tail ----
   Replaces the old lathe body. Per-station the hull blends: rounder forebody →
   squarer engine section; stealth shapes pick up a soft forebody chine; twin/tri
   jets widen aft into a flat engine deck that swallows the nozzles (no more
   floating engines). Height is pre-flattened, so no mesh-level Y scale. */
function loftFuselage(cfg, hero) {
  const L = cfg.len, half = L / 2, fR = cfg.frontR, rR = cfg.rearR, flat = cfg.flat || 0.62;
  const z0 = -half - cfg.noseLen + 0.5, zNose = -half + 0.5, zBody = half - 0.3, z1 = half + 2.3;
  const ST = hero ? 64 : 28, RAD = hero ? 48 : 24;
  const ss = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  const chine = cfg.clean ? 0.5 : (cfg.id === 'SU57' ? 0.32 : 0.1);
  const engW = cfg.engines > 1 ? (cfg.gap / 2 + rR * 0.9) / rR : 1.08;
  const tn = (zNose - z0) / (z1 - z0), tb = (zBody - z0) / (z1 - z0);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= ST; i++) {
    const t = i / ST, z = z0 + (z1 - z0) * t;
    let r;
    if (t <= tn) r = Math.max(0.012, fR * Math.pow(t / tn, 0.62));
    else if (t <= tb) { const u2 = (t - tn) / (tb - tn); r = lerp(fR, rR, u2) - 0.075 * fR * Math.sin(Math.PI * u2); }
    else { const u2 = (t - tb) / (1 - tb); r = lerp(rR, rR * 0.6, u2); }
    const w = r * lerp(1, engW, ss(0.45, 0.8, t));          // aft engine-deck widening
    const h = r * flat;
    const n = 2.4 - 0.35 * ss(0.15, 0.5, t);                // rounder nose, squarer aft
    const ch = chine * Math.sin(Math.PI * clamp(t / 0.8, 0, 1));
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * TWO_PI, c = Math.cos(a), s = Math.sin(a);
      let x = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * w;
      const y = Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * h;
      x *= 1 + ch * Math.exp(-Math.pow(y / Math.max(h, 0.001), 2) * 10);   // waterline chine
      pos.push(x, y, z); uv.push(j / RAD, t);
    }
  }
  for (let i = 0; i < ST; i++) for (let j = 0; j < RAD; j++) {
    const a = i * (RAD + 1) + j, b = a + RAD + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  // weld the uv-seam normals (column 0 and column RAD share positions)
  const nrm = geo.attributes.normal;
  for (let i = 0; i <= ST; i++) {
    const a = i * (RAD + 1), b = a + RAD;
    const nx = (nrm.getX(a) + nrm.getX(b)) / 2, ny = (nrm.getY(a) + nrm.getY(b)) / 2, nz = (nrm.getZ(a) + nrm.getZ(b)) / 2;
    nrm.setXYZ(a, nx, ny, nz); nrm.setXYZ(b, nx, ny, nz);
  }
  nrm.needsUpdate = true;
  return geo;
}

/* beveled caret intake duct (replaces the old plain box): outward-leaning
   parallelogram cross-section extruded into a duct, depth along -Z…+Z */
function intakeDuctGeo(wd, ht, depth) {
  const sh = new THREE.Shape();
  sh.moveTo(-wd / 2, 0); sh.lineTo(wd / 2, -ht * 0.14); sh.lineTo(wd / 2, ht * 0.86); sh.lineTo(-wd / 2, ht); sh.closePath();
  const g2 = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2, steps: 1, curveSegments: 4 });
  g2.translate(0, -ht * 0.43, -depth / 2);
  return g2;
}

function buildJet(color, accent, cfg, hero) {
  cfg = cfg || SHAPES.ENEMY;
  const g = new THREE.Group();
  const bs = hero ? 4 : 2;
  const SID = cfg.id || '';                 // '' => cacheGeo bypasses (no shared key)
  const H = hero ? 1 : 0;
  const gk = part => (SID ? SID + ':' + part + ':' + H : '');   // geometry cache key for this shape/part/hero
  // hero airframes wear a clearcoated show finish; the fodder flies flat paint
  const body = hero
    ? new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 1.25, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.38, envMapIntensity: 1.1, side: THREE.DoubleSide });
  const dark  = new THREE.MeshStandardMaterial({ color: 0x222a33, metalness: 0.6, roughness: 0.5, envMapIntensity: 1.1, side: THREE.DoubleSide });
  const panel = new THREE.MeshStandardMaterial({ color: 0x171d25, metalness: 0.55, roughness: 0.6, side: THREE.DoubleSide });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6b7785, metalness: 0.85, roughness: 0.3, envMapIntensity: 1.4 });
  const nozIn = new THREE.MeshStandardMaterial({ color: 0x0a0d11, metalness: 0.3, roughness: 0.75, emissive: 0xff6a22, emissiveIntensity: 0.3 });
  const sensor = new THREE.MeshStandardMaterial({ color: 0x1a2630, metalness: 0.55, roughness: 0.12, emissive: 0x0b1a26, emissiveIntensity: 0.5 });
  // hero canopy: clearcoated, faintly iridescent glass (gold-coated look); fodder keeps cheap tint
  const glass = hero
    ? new THREE.MeshPhysicalMaterial({ color: 0x2a4a66, metalness: 0.25, roughness: 0.03, clearcoat: 1.0, clearcoatRoughness: 0.06, iridescence: 0.55, iridescenceIOR: 1.9, emissive: 0x0a1622, envMapIntensity: 2.4, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ color: 0x213a52, metalness: 0.4, roughness: 0.04, emissive: 0x0a1622, envMapIntensity: 2.0, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  patchJetSurface(body); patchJetSurface(dark);
  const L = cfg.len, half = L / 2, fR = cfg.frontR, rR = cfg.rearR, flat = cfg.flat || 0.62;
  const wy = (cfg.wingY != null ? cfg.wingY : -0.2);

  // ---- fuselage: lofted superellipse hull (ogive nose → chined/area-ruled body → engine deck) ----
  const z0 = -half - cfg.noseLen + 0.5;   // nose tip (open exhaust end covered by nozzles)
  const fgeo = cacheGeo(gk('fuse'), () => loftFuselage(cfg, hero));
  const fuse = new THREE.Mesh(fgeo, body); g.add(fuse);

  // dorsal spine: blended capsule fairing instead of a slab (suppressed on flying wings;
  // dorsalHump swaps in a wide stealth fairing)
  if (cfg.dorsalHump) {
    const hump = new THREE.Mesh(cacheGeo(gk('dorsalhump'), () => { const s = new THREE.SphereGeometry(fR * 1.1, hero ? 18 : 10, hero ? 12 : 7); s.scale(1.5, 0.45, 2.6); return s; }), body);
    hump.position.set(0, fR * flat * 0.55, L * 0.08); g.add(hump);
  } else if (!cfg.flyingWing) {
    const spine = new THREE.Mesh(cacheGeo(gk('spine'), () => {
      const cg = new THREE.CapsuleGeometry(cfg.frontR * 0.52, cfg.len * 0.42, hero ? 8 : 4, hero ? 20 : 10);
      cg.rotateX(Math.PI / 2); return cg;
    }), body);
    spine.scale.set(0.95, 0.6, 1); spine.position.set(0, fR * flat * 0.52, half * 0.1); g.add(spine);
  }

  if (hero && !cfg.noseSpike && !cfg.facetNose) { // fine nose probe (pitot) + twin AoA vanes
    const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 1.5, 8), steel);
    pitot.rotation.x = Math.PI / 2; pitot.position.set(0, 0, z0 - 0.65); g.add(pitot);
    for (const sx of [-1, 1]) {
      const vane = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), dark);
      vane.position.set(sx * fR * 0.75, 0, z0 + 1.6); g.add(vane);
    }
  }
  // menacing nose boom (all LODs) — replaces hero pitot
  if (cfg.noseSpike) {
    const spike = new THREE.Mesh(cacheGeo(gk('nosespike'), () => new THREE.CylinderGeometry(0.04, 0.16, 2.6, 6)), dark);
    spike.rotation.x = Math.PI / 2; spike.position.set(0, 0, z0 - 1.2); g.add(spike);
  }
  // faceted EO sensor nose (all LODs) — replaces hero pitot
  if (cfg.facetNose) {
    const fn = new THREE.Mesh(cacheGeo(gk('facetnose'), () => { const o = new THREE.OctahedronGeometry(fR * 0.85, 0); o.scale(0.9, 0.6, 2.2); return o; }), sensor);
    fn.position.set(0, -fR * flat * 0.1, z0 + 1.0); g.add(fn);
  }

  // ---- electro-optical sensors ----
  if (hero && cfg.irst) {           // forward IRST ball, offset to starboard ahead of the windscreen
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), sensor);
    ball.scale.set(0.9, 0.9, 1.1); ball.position.set(fR * 0.34, fR * flat * 0.62, -half + 0.8); g.add(ball);
  }
  if (hero && cfg.eots) {           // faceted under-nose EO targeting / aperture
    const eo = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 5), sensor);
    eo.scale.set(1, 0.7, 1.25); eo.position.set(0, -fR * flat * 0.62, -half + 1.4); g.add(eo);
  }

  // ---- canopy: windscreen wedge + bubble + frame (+ interior for hero) ----
  const canopyZ = cfg.canopyZ != null ? cfg.canopyZ : (-half + cfg.noseLen * 0.1 + 2.6);
  const noCanopy = cfg.noCanopy || cfg.flyingWing;
  if (!noCanopy) {
  const sill = new THREE.Mesh(cacheGeo(gk('sill'), () => {
    const cg = new THREE.CapsuleGeometry(cfg.frontR * 0.6, 2.8, hero ? 6 : 3, hero ? 16 : 8);
    cg.rotateX(Math.PI / 2); return cg;
  }), body);
  sill.scale.set(1.0, 0.52, 1); sill.position.set(0, fR * flat * 0.55, canopyZ + 0.4); g.add(sill);
  if (hero) { // ejection seat + tub, visible through the tinted canopy
    const tub = new THREE.Mesh(new THREE.BoxGeometry(fR * 0.9, fR * 0.5, 3.0), dark);
    tub.position.set(0, fR * flat * 0.35, canopyZ + 0.2); g.add(tub);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(fR * 0.5, fR * 0.55, 0.7), dark);
    seat.position.set(0, fR * flat * 0.72, canopyZ + 0.6); g.add(seat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(fR * 0.2, 10, 8), dark);
    head.position.set(0, fR * flat * 1.0, canopyZ + 0.95); g.add(head);
    const hud = new THREE.Mesh(new THREE.BoxGeometry(fR * 0.5, 0.5, 0.06), glass);
    hud.position.set(0, fR * flat * 0.95, canopyZ - 1.0); g.add(hud);
  }
  const can = new THREE.Mesh(new THREE.SphereGeometry(fR * 0.9, hero ? 48 : 20, hero ? 32 : 14), glass);
  if (cfg.canopyFlush) { can.scale.set(0.92, 0.5, 2.1); can.position.set(0, fR * flat + 0.3 - 0.15, canopyZ); }
  else { can.scale.set(0.92, 0.74, 1.9); can.position.set(0, fR * flat + 0.3, canopyZ); }
  if (cfg.wideCanopy) { can.scale.x *= cfg.wideCanopy; can.scale.y = 0.6; }
  g.add(can);
  if (hero) { // forward windscreen wedge for a sharper canopy line
    const ws = new THREE.Mesh(new THREE.SphereGeometry(fR * 0.78, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), glass);
    ws.scale.set(0.9, 0.8, 1.3); ws.position.set(0, fR * flat + 0.18, canopyZ - 1.7); g.add(ws);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 3.3), dark);
      rail.position.set(sx * fR * 0.52, fR * flat + 0.32, canopyZ); g.add(rail);
    }
    const bow = new THREE.Mesh(new THREE.BoxGeometry(fR * 1.1, 0.14, 0.16), dark);
    bow.position.set(0, fR * flat + 0.42, canopyZ - 1.45); g.add(bow);
  }
  }
  // dorsal fairing in place of the canopy (drones)
  if (cfg.noCanopy && !cfg.flyingWing) {
    const fair = new THREE.Mesh(cacheGeo(gk('ccanfair'), () => { const c = new THREE.CapsuleGeometry(fR * 0.55, 2.2, 4, 10); c.rotateX(Math.PI / 2); c.scale(1, 0.5, 1); return c; }), body);
    fair.position.set(0, fR * flat * 0.6, canopyZ); g.add(fair);
  }
  // flush cockpit beak for flying-wing bombers
  if (cfg.flyingWing) {
    const beak = new THREE.Mesh(cacheGeo(gk('beak'), () => { const s = new THREE.SphereGeometry(fR * 0.7, 16, 10); s.scale(1.6, 0.55, 1.8); return s; }), body);
    beak.position.set(0, fR * flat * 0.75, -half - cfg.noseLen * 0.35); g.add(beak);
    for (const sx of [-1, 1]) {
      const wm = new THREE.Mesh(cacheGeo(gk('beakwin'), () => new THREE.PlaneGeometry(0.9, 0.45)), glass);
      wm.rotation.x = -0.6; wm.rotation.y = sx * 0.5; wm.position.set(sx * 0.7, fR * flat * 0.95, -half - cfg.noseLen * 0.45); g.add(wm);
    }
  }

  // ---- LERX / chine strakes ----
  if (cfg.lerx) {
    const lz = cfg.wing[0][1];
    const lpts = cfg.bigLerx
      ? [[0.8, lz + 0.6], [3.0, lz - 1.2], [2.4, lz - 4.6], [0.8, lz - cfg.noseLen * 0.78]]
      : [[0.75, lz + 0.4], [2.8, lz - 0.6], [0.75, lz - cfg.noseLen * 0.42]];
    g.add(extrudeWing(lpts, cfg.bigLerx ? 0.26 : 0.28, body, wy + (cfg.bigLerx ? 0.16 : 0.14), bs, gk('lerx')));
  }
  // ---- LEVCON strakes (Su-57) ----
  if (cfg.levcon) {
    const wRoot = cfg.wing[0][1];
    const lpts = [[0.9, wRoot - 0.4], [3.4, wRoot - 0.2], [0.9, wRoot - 4.2]];
    g.add(extrudeWing(lpts, 0.26, body, wy + 0.12, bs, gk('levcon')));
    if (hero) for (const sx of [-1, 1]) {
      const hs = new THREE.Mesh(cacheGeo(gk('levconseam'), () => new THREE.BoxGeometry(0.4, 0.1, 2.2)), panel);
      hs.position.set(sx * 2.0, wy + 0.18, wRoot - 1.2); g.add(hs);
    }
  }

  // ---- lifting surfaces ----
  g.add(extrudeWing(cfg.wing, cfg.wingThick || 0.5, body, wy, bs, gk('wing')));
  if (cfg.canard) {
    const cY = cfg.canardY != null ? cfg.canardY : 0.12;
    if (cfg.canardDihedral || cfg.canardCant) {
      // mirrored canted/dihedral foreplanes — each half pivots about its root
      const ang = cfg.canardDihedral || cfg.canardCant;
      const rootX = cfg.canard[0][0];
      const halfGeo = cacheGeo(gk('canardhalf'), () => {
        const sh = new THREE.Shape(); sh.moveTo(cfg.canard[0][0], cfg.canard[0][1]);
        for (let i = 1; i < cfg.canard.length; i++) sh.lineTo(cfg.canard[i][0], cfg.canard[i][1]);
        sh.closePath();
        const g2 = new THREE.ExtrudeGeometry(sh, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.26, bevelSegments: bs, steps: 1, curveSegments: bs > 2 ? 10 : 6 });
        g2.translate(-rootX, 0, -0.17); g2.rotateX(Math.PI / 2); return g2;
      });
      for (const sx of [-1, 1]) {
        const m = new THREE.Mesh(halfGeo, body); m.scale.x = sx;
        m.rotation.z = -sx * ang; m.position.set(sx * rootX, cY, 0); g.add(m);
      }
    } else {
      g.add(extrudeWing(cfg.canard, 0.34, body, cY, bs, gk('canard')));
    }
  }
  if (cfg.htail) g.add(extrudeWing(cfg.htail, 0.36, body, cfg.htailY != null ? cfg.htailY : -0.1, bs, gk('htail')));

  // control-surface seams (hero only) — elevons on the main wing & all-moving tail
  if (hero) {
    g.add(buildHingeSeam(cfg.wing, wy, cfg.wingThick || 0.5, panel));
    if (cfg.htail) g.add(buildHingeSeam(cfg.htail, cfg.htailY != null ? cfg.htailY : -0.1, 0.36, panel));
  }

  // wingtip navigation lights (port = red, starboard = green) — hero only
  if (hero) {
    let tx = cfg.wing[0][0], tz = cfg.wing[0][1]; for (const p of cfg.wing) if (p[0] > tx) { tx = p[0]; tz = p[1]; }
    const lp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b, fog: false }));
    lp.position.set(-tx, wy, tz - 0.6); g.add(lp);
    const ls = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x46ff8c, fog: false }));
    ls.position.set(tx, wy, tz - 0.6); g.add(ls);
  }

  // ---- vertical tails (with a rudder seam for hero) ----
  const vt = cfg.vtail || cfg.ccaVtail;   // ccaVtail: drone V-tails (kept off the `vtail` key for the plain-shapes test)
  if (vt) {
    const baseY = fR * flat * 0.4;
    const finXs = vt.type === 'single' ? [0] : [-1, 1];
    for (const s of finXs) {
      const f = buildFin(vt, body, bs, gk('vtail'));
      const fz = vt.z != null ? vt.z : half - vt.base - (vt.type === 'single' ? 1 : 1.5);
      f.position.set(vt.type === 'single' ? 0 : s * vt.x, baseY, fz);
      if (vt.type !== 'single') f.rotation.z = -s * (vt.cant || 0.3);
      g.add(f);
      if (hero) {   // rudder hinge line on the trailing edge of the fin
        const rud = new THREE.Mesh(new THREE.BoxGeometry((vt.thick || 0.3) + 0.06, vt.h * 0.92, 0.14), panel);
        const rx = (vt.type === 'single' ? 0 : s * vt.x) + (vt.type === 'single' ? 0 : 0);
        rud.position.set(rx, baseY + vt.h * 0.5, fz + Math.min(vt.base, vt.sweep) * 0.5 + 0.2);
        if (vt.type !== 'single') rud.rotation.z = -s * (vt.cant || 0.3);
        g.add(rud);
      }
    }
  }

  // ---- tail booms carrying fins/ventrals (J-20) ----
  if (cfg.finBoom) {
    for (const sx of [-1, 1]) {
      const boom = new THREE.Mesh(cacheGeo(gk('finboom'), () => { const c = new THREE.CapsuleGeometry(0.45, 4.5, 3, 8); c.rotateX(Math.PI / 2); c.scale(1, 0.7, 1); return c; }), body);
      boom.position.set(sx * (cfg.gap / 2 + rR * 0.8), -0.1, half - 1.2); g.add(boom);
    }
  }
  // ---- ventral fins (J-20 / hostile darts) ----
  if (hero && cfg.ventral) {
    const vf = { base: 1.6, tip: 0.5, h: 1.8, sweep: 1.0, thick: 0.25 };
    const vx = cfg.finBoom ? (cfg.gap / 2 + rR * 0.8) : rR * 0.7;
    for (const sx of [-1, 1]) {
      const f = buildFin(vf, body, bs, gk('ventral'));
      f.position.set(sx * vx, -fR * flat * 0.45, half - 2.0);
      f.rotation.z = Math.PI + sx * 0.3;
      g.add(f);
    }
  }

  // ---- intakes: beveled caret ducts canted into the hull (+ lips, splitters & DSI bumps for hero) ----
  if (cfg.intake === 'side') {
    for (const sx of [-1, 1]) {
      if (cfg.semiIntake) {
        // Rafale: semicircular un-splittered side duct — no splitter plate
        const duct = new THREE.Mesh(cacheGeo(gk('semiintake'), () => { const c = new THREE.CylinderGeometry(1.0, 1.05, 4.0, 16, 1, false, 0, Math.PI); c.rotateX(Math.PI / 2); return c; }), dark);
        duct.rotation.z = sx * Math.PI / 2; duct.position.set(sx * (fR + 0.35), -fR * flat * 0.30, -half + 3.6); g.add(duct);
        if (hero) {
          const lip = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.1, 8, 18, Math.PI), steel);
          lip.rotation.x = Math.PI / 2; lip.rotation.z = sx * Math.PI / 2; lip.position.set(sx * (fR + 0.35), -fR * flat * 0.30, -half + 1.6); g.add(lip);
        }
        continue;
      }
      if (cfg.shoulderIntake) {
        // Tejas: small high-set Y-duct trunk, no splitter
        const ik = new THREE.Mesh(cacheGeo(gk('shoulderintake'), () => intakeDuctGeo(1.0, 1.1, 3.2)), dark);
        ik.scale.x = sx; ik.position.set(sx * (fR + 0.25), -fR * flat * 0.05, -half + 3.2); g.add(ik);
        if (hero) {
          const fair = new THREE.Mesh(cacheGeo(gk('shoulderfair'), () => { const s = new THREE.SphereGeometry(0.5, 14, 10); s.scale(0.6, 0.7, 1.4); return s; }), body);
          fair.position.set(sx * (fR + 0.05), -fR * flat * 0.05, -half + 2.2); g.add(fair);
        }
        continue;
      }
      const ik = new THREE.Mesh(cacheGeo(gk('intake'), () => intakeDuctGeo(1.5, 1.7 * (cfg.flat || 0.62) + 0.5, 4.2)), dark);
      ik.scale.x = sx;   // mirror so the caret leans outward on both sides
      ik.position.set(sx * (fR + 0.45), -fR * flat * 0.35, -half + 3.6); ik.rotation.z = sx * 0.08; g.add(ik);
      if (hero) {
        const lip = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.12, 10, 26), steel);
        lip.position.set(sx * (fR + 0.45), -fR * flat * 0.35, -half + 1.5);
        lip.scale.set(0.62, (1.7 * flat + 0.5) / 1.85, 1); g.add(lip);
        // boundary-layer splitter plate between intake & fuselage
        const split = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7 * flat + 0.4, 2.6), panel);
        split.position.set(sx * (fR - 0.05), -fR * flat * 0.32, -half + 3.4); g.add(split);
        if (cfg.dsi) {
          const bump = new THREE.Mesh(new THREE.SphereGeometry(0.8, 22, 16), body);
          bump.scale.set(0.7, 0.85, 1.3); bump.position.set(sx * (fR + 0.15), -fR * flat * 0.2, -half + 2.1); g.add(bump);
        }
      }
    }
  } else if (cfg.intake === 'belly' || cfg.intake === 'chin') {
    const ik = new THREE.Mesh(cacheGeo(gk('intake'), () => intakeDuctGeo(cfg.frontR * 1.9, 1.4, 3.8)), dark);
    ik.position.set(0, -fR * flat - 0.2, -half + 3.2); g.add(ik);
    if (hero) {
      const lip = new THREE.Mesh(new THREE.TorusGeometry(fR * 0.9, 0.12, 10, 26), steel);
      lip.rotation.x = Math.PI / 2; lip.position.set(0, -fR * flat - 0.2, -half + 1.4); lip.scale.set(1, 0.5, 1); g.add(lip);
    }
    if (hero && cfg.chinSplit) {
      // Typhoon rectangular chin intake: horizontal splitter + drooped lip
      const plate = new THREE.Mesh(new THREE.BoxGeometry(fR * 1.8, 0.1, 2.6), panel);
      plate.position.set(0, -fR * flat - 0.2, -half + 3.0); g.add(plate);
      const lowLip = new THREE.Mesh(new THREE.BoxGeometry(fR * 1.9, 0.16, 0.5), steel);
      lowLip.position.set(0, -fR * flat - 0.95, -half + 1.5); lowLip.rotation.x = 0.25; g.add(lowLip);
    }
  } else if (cfg.intake === 'dorsal') {
    // top-mounted NACA-style hump duct (drones)
    const ik = new THREE.Mesh(cacheGeo(gk('intake'), () => intakeDuctGeo(fR * 1.6, 1.0, 3.0)), dark);
    ik.position.set(0, fR * flat * 0.75, -half + cfg.noseLen * 0.2 + 2.2); g.add(ik);
    if (hero) {
      const lip = new THREE.Mesh(new THREE.TorusGeometry(fR * 0.7, 0.08, 8, 16, Math.PI), steel);
      lip.rotation.x = Math.PI / 2; lip.position.set(0, fR * flat * 0.75, -half + cfg.noseLen * 0.2 + 0.7); g.add(lip);
    }
  }
  // ---- dorsal over-spine intake (J-36 center engine / B-2 over-wing inlets) ----
  if (cfg.dorsalIntake) {
    if (cfg.flyingWing) {
      // twin buried over-wing inlets + humps
      for (const sx of [-1, 1]) {
        const duct = new THREE.Mesh(cacheGeo(gk('dorsalduct'), () => intakeDuctGeo(2.2, 0.9, 3.0)), dark);
        duct.position.set(sx * (cfg.gap / 2 + 0.6), fR * flat * 0.55, -half + 2.5); g.add(duct);
        const hump = new THREE.Mesh(cacheGeo(gk('dorsalhumpb'), () => { const s = new THREE.SphereGeometry(1.4, 14, 10); s.scale(1.1, 0.4, 1.9); return s; }), body);
        hump.position.set(sx * (cfg.gap / 2 + 0.6), fR * flat * 0.7, -half + 2.5); g.add(hump);
      }
    } else {
      // single caret duct opening upward on the spine behind the canopy
      const duct = new THREE.Mesh(cacheGeo(gk('dorsalduct'), () => intakeDuctGeo(fR * 1.5, 1.3, 4.5)), dark);
      duct.rotation.z = Math.PI; duct.position.set(0, fR * flat * 0.85, -half + cfg.noseLen * 0.35 + 3.0); g.add(duct);
      if (hero) {
        const bump = new THREE.Mesh(cacheGeo(gk('dorsaldsi'), () => { const s = new THREE.SphereGeometry(0.9, 16, 12); s.scale(1.3, 0.7, 1.5); return s; }), body);
        bump.position.set(0, fR * flat * 0.8, -half + cfg.noseLen * 0.35 + 1.4); g.add(bump);
      }
    }
  }

  // ---- stores: weapon-bay door outlines (stealth jets) or underwing pylons + tip missiles (others) ----
  if (hero && cfg.bayDoors) {
    // BOMBER: twin long belly bay rails + cross seams
    for (const sx of [-1, 1]) {
      for (const bx of [1.2, 3.0]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 7.5), panel);
        rail.position.set(sx * bx, -fR * flat - 0.02, 1.5); g.add(rail);
      }
      for (const cz of [1.5 - 3.75, 1.5 + 3.75]) {
        const seam = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.06), panel);
        seam.position.set(sx * 2.1, -fR * flat - 0.02, cz); g.add(seam);
      }
    }
  } else if (hero && cfg.clean) {
    const doorLen = cfg.bayWide ? L * 0.30 : L * 0.22;
    const doorX = cfg.bayWide ? fR * 0.62 : fR * 0.5;
    const doorZ = cfg.bayWide ? -half * 0.02 : -half * 0.05;
    if (cfg.sawtoothDoors) {
      // F-35: zigzag bay-door seams instead of straight slabs
      for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, L * 0.06), panel);
        seg.rotation.y = (k % 2 ? 1 : -1) * 0.5;
        seg.position.set(sx * fR * 0.55, -fR * flat - 0.01, doorZ + (k - 1.5) * L * 0.055); g.add(seg);
      }
    } else {
      for (const sx of [-1, 1]) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, doorLen), panel);
        door.position.set(sx * doorX, -fR * flat - 0.01, doorZ); g.add(door);
      }
    }
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(fR * 0.95, 0.05, 0.05), panel);
    cross1.position.set(0, -fR * flat - 0.01, doorZ - doorLen * 0.5); g.add(cross1);
    const cross2 = cross1.clone(); cross2.position.z = doorZ + doorLen * 0.5; g.add(cross2);
  }
  if (hero && !cfg.clean && !cfg.flyingWing && cfg.wing) {
    let tx = 0, tz = 0;
    for (const p of cfg.wing) { if (p[0] > tx) { tx = p[0]; tz = p[1]; } }
    for (const sx of [-1, 1]) {
      g.add(buildTipMissile(sx * tx, wy, tz + 1.5, dark, accent));
      // an inboard underwing pylon
      const py = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 1.6), dark);
      py.position.set(sx * tx * 0.5, wy - 0.45, tz * 0.3 + 1.2); g.add(py);
    }
  }

  // blade antenna on the spine (hero) + formation/recognition lights
  if (hero && !cfg.flyingWing) {
    const ant = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.9), dark);
    ant.position.set(0, fR * flat * 0.55 + 0.5, canopyZ + 3.2); ant.rotation.x = -0.12; g.add(ant);
    const slime = new THREE.MeshBasicMaterial({ color: cfg.hostileLights ? 0xff4444 : 0xcaff7a, transparent: true, opacity: 0.85, fog: false });
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 2.4), slime);
      strip.position.set(sx * fR * 0.96, 0, -half + 2.0); g.add(strip);
    }
    const sstrip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 1.9), slime);
    sstrip.position.set(0, fR * flat * 0.52 + 0.62, half * 0.32); g.add(sstrip);
  }
  // hostile under-nose recognition strip (all LODs when flagged)
  if (cfg.hostileLights) {
    const hstrip = new THREE.Mesh(cacheGeo(gk('hostilestrip'), () => new THREE.BoxGeometry(0.42, 0.05, 1.6)),
      new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.85, fog: false }));
    hstrip.position.set(0, -fR * flat * 0.7, -half + 1.6); g.add(hstrip);
  }

  // ---- forebody chine strips (generic; J20/J50/F47/NGAD) ----
  if (cfg.chineRidge) {
    const cl = cfg.noseLen;
    for (const sx of [-1, 1]) {
      const strip = new THREE.Mesh(cacheGeo(gk('chine'), () => new THREE.BoxGeometry(0.15, 0.09, cl * 0.8)), panel);
      strip.position.set(sx * fR * 0.9, -0.02, z0 + cl * 0.45); strip.rotation.z = sx * 0.48; g.add(strip);
    }
  }

  // ---- F-22 tail booms (stingers flanking the 2D nozzles) ----
  if (cfg.tailBoom) {
    for (const sx of [-1, 1]) {
      const boom = new THREE.Mesh(cacheGeo(gk('tailboom'), () => new THREE.BoxGeometry(0.9, rR * flat * 1.1, 4.2)), body);
      boom.position.set(sx * (cfg.gap / 2 + rR * 1.15), 0, half - 0.6); g.add(boom);
      const tip = new THREE.Mesh(cacheGeo(gk('tailboomtip'), () => { const c = new THREE.ConeGeometry(0.45, 1.4, 4); c.rotateX(Math.PI / 2); return c; }), body);
      tip.scale.y = flat; tip.position.set(sx * (cfg.gap / 2 + rR * 1.15), 0, half + 1.5); g.add(tip);
    }
  }

  // ---- dorsal refueling receptacle (F-22/F-35) ----
  if (cfg.boomRecept) {
    const spineTopY = fR * flat * 0.52 + fR * 0.31;
    const rec = new THREE.Mesh(cacheGeo(gk('boomrecept'), () => new THREE.BoxGeometry(0.9, 0.04, 1.3)), panel);
    rec.position.set(0, spineTopY + 0.02, canopyZ + (cfg.id === 'F22' ? 4.2 : 3.6)); g.add(rec);
  }

  // ---- gun port fairing (F-22 starboard root / F-35 port shoulder) ----
  if (cfg.gunPort === 'shoulder') {
    const gp = new THREE.Mesh(cacheGeo(gk('gunportsh'), () => { const s = new THREE.SphereGeometry(0.34, 10, 8); s.scale(0.8, 0.6, 2.6); return s; }), body);
    gp.position.set(-fR * 0.8, fR * flat * 0.5, -half + 3.0); g.add(gp);
  } else if (cfg.gunPort) {
    const gp = new THREE.Mesh(cacheGeo(gk('gunport'), () => { const s = new THREE.SphereGeometry(0.28, 10, 8); s.scale(1, 0.55, 2.2); return s; }), dark);
    gp.position.set(fR * 0.95, fR * flat * 0.35, -half + 3.2); g.add(gp);
  }

  // ---- SU-57 inter-engine tunnel + stinger + nacelle pods ----
  if (cfg.tunnel) {
    const ch = new THREE.Mesh(cacheGeo(gk('tunnel'), () => new THREE.BoxGeometry(cfg.gap - rR * 0.6, rR * flat * 0.9, L * 0.45)), body);
    ch.position.set(0, -rR * flat * 0.25, half * 0.30); g.add(ch);
    const deck = new THREE.Mesh(cacheGeo(gk('tunneldeck'), () => new THREE.BoxGeometry(cfg.gap + rR * 1.2, 0.18, L * 0.40)), body);
    deck.position.set(0, rR * flat * 0.55, half * 0.30); g.add(deck);
  }
  if (cfg.nacelleSplit) {
    for (const sx of [-1, 1]) {
      const pod = new THREE.Mesh(cacheGeo(gk('nacelle'), () => { const c = new THREE.CapsuleGeometry(rR * 0.85, L * 0.45, 4, 12); c.rotateX(Math.PI / 2); return c; }), body);
      pod.scale.y = flat; pod.position.set(sx * cfg.gap / 2, -rR * flat * 0.35, half * 0.25); g.add(pod);
    }
  }
  if (cfg.stinger) {
    const st = new THREE.Mesh(cacheGeo(gk('stinger'), () => { const c = new THREE.ConeGeometry(rR * 0.55, 4.2, 10); c.rotateX(-Math.PI / 2); return c; }), body);
    st.scale.set(1.5, 0.45, 1); st.position.set(0, 0, half + 2.6); g.add(st);
  }

  // ---- J-50 lambda centre-body fairing + beaver tail ----
  if (cfg.lambdaFairing) {
    const fair = new THREE.Mesh(cacheGeo(gk('lambdafair'), () => new THREE.BoxGeometry(cfg.gap + rR * 1.6, rR * flat * 1.1, 4.5)), body);
    fair.scale.set(1, 0.8, 1); fair.position.set(0, -0.05, half - 1.0); g.add(fair);
    const bt = new THREE.Mesh(cacheGeo(gk('beavertail'), () => { const c = new THREE.ConeGeometry(rR * 0.9, 2.4, 4); c.rotateX(-Math.PI / 2); return c; }), body);
    bt.scale.set(2.0, 0.35, 1); bt.position.set(0, 0, half + 2.0); g.add(bt);
  }

  // ---- J-50 swiveling wingtip panels ----
  if (cfg.tipPivot) {
    const tpts = [[0, 0], [1.8, 0.9], [1.8, 1.6], [0, 1.4]];
    for (const sx of [-1, 1]) {
      const pv = new THREE.Group();
      pv.add(extrudeWing(tpts, (cfg.wingThick || 0.5) * 0.8, body, 0, bs, gk('tippivot')));
      pv.position.set(sx * (9.4 - 1.8), wy, 4.3 + 1.1 * 0.8); pv.rotation.x = sx * 0.10;
      pv.scale.x = sx; g.add(pv);
      if (hero) {
        const seam = new THREE.Mesh(cacheGeo(gk('tippivotseam'), () => new THREE.BoxGeometry(0.12, (cfg.wingThick || 0.5) * 1.4, 1.4)), panel);
        seam.position.set(sx * (9.4 - 1.8), wy, 4.3 + 0.7); g.add(seam);
      }
    }
  }

  // ---- generic TE sawtooth serrations (J36/NGAD/F35-style stealth deck trim) ----
  if (cfg.sawtoothTE && hero) {
    if (cfg.id === 'J36') {
      for (const sx of [-1, 1]) for (const sp of [[4.2, 11.0], [9.5, 9.5]]) {
        const tri = new THREE.Mesh(cacheGeo(gk('sawtri'), () => {
          const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(1.6, 0); sh.lineTo(0.8, 1.1); sh.closePath();
          const g2 = new THREE.ExtrudeGeometry(sh, { depth: (cfg.wingThick || 0.5) * 0.8, bevelEnabled: false }); g2.rotateX(-Math.PI / 2); return g2;
        }), body);
        tri.scale.x = sx; tri.position.set(sx * sp[0], wy, sp[1]); g.add(tri);
      }
    } else {
      // NGAD W-deck crank trim strips
      for (const sx of [-1, 1]) for (const sp of [[7.0, 7.0], [3.6, 9.8]]) {
        const strip = new THREE.Mesh(cacheGeo(gk('sawstrip'), () => new THREE.BoxGeometry(0.6, (cfg.wingThick || 0.5) * 1.4, 0.1)), panel);
        strip.position.set(sx * sp[0], wy, sp[1]); g.add(strip);
      }
    }
  }

  // ---- J-36 split drag rudders at the wingtips ----
  if (cfg.splitRudderTips && hero) {
    for (const sx of [-1, 1]) for (const sy of [1, -1]) {
      const plate = new THREE.Mesh(cacheGeo(gk('dragrudder'), () => new THREE.BoxGeometry(2.2, 0.06, 1.1)), panel);
      plate.position.set(sx * (13.0 - 1.2), wy + sy * 0.10, 9.8 - 0.7); plate.rotation.x = -sy * 0.08; g.add(plate);
    }
  }

  // ---- FA-18 wing-fold hinges + wingtip rails ----
  if (cfg.wingFold) {
    for (const sx of [-1, 1]) {
      const fair = new THREE.Mesh(cacheGeo(gk('wingfold'), () => new THREE.BoxGeometry(0.22, (cfg.wingThick || 0.5) * 1.7, 2.4)), panel);
      fair.position.set(sx * 5.2, wy + (cfg.wingThick || 0.5) * 0.5, 2.9); g.add(fair);
      const hinge = new THREE.Mesh(cacheGeo(gk('wingfoldpin'), () => { const c = new THREE.CylinderGeometry(0.09, 0.09, 2.4, 6); c.rotateX(Math.PI / 2); return c; }), steel);
      hinge.position.set(sx * 5.2, wy + (cfg.wingThick || 0.5) * 0.5 + 0.2, 2.9); g.add(hinge);
    }
  }
  // wingtip launch rails (FA-18 tipRails / generic tipRail)
  if (cfg.tipRails || cfg.tipRail) {
    let tx = 0, tz = 0; for (const p of cfg.wing) if (p[0] > tx) { tx = p[0]; tz = p[1]; }
    const big = !!cfg.tipRails;
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(cacheGeo(gk('tiprail'), () => new THREE.BoxGeometry(big ? 0.22 : 0.14, big ? 0.3 : 0.18, big ? 3.2 : 2.2)), dark);
      rail.position.set(sx * tx, wy + (big ? 0 : 0.05), tz + (big ? 0.4 : -0.4)); g.add(rail);
      g.add(buildTipMissile(sx * tx, wy - (big ? 0.3 : 0.18), tz + (big ? 0.4 : 0.0), dark, accent));
    }
  }
  // retracted refuel probe door (FA-18) / fixed nose probe (Rafale)
  if (cfg.refuelProbe) {
    const door = new THREE.Mesh(cacheGeo(gk('refueldoor'), () => new THREE.BoxGeometry(0.08, 0.5, 1.5)), panel);
    door.position.set(fR * 0.7, fR * flat * 0.3, -half + 1.2); door.rotation.y = 0.15; g.add(door);
  }
  if (cfg.noseProbe) {
    const pr = new THREE.Mesh(cacheGeo(gk('noseprobe'), () => { const c = new THREE.CylinderGeometry(0.05, 0.07, 1.8, 8); c.rotateX(Math.PI / 2 - 0.2); return c; }), steel);
    pr.position.set(fR * 0.45, fR * flat * 0.55, z0 + 1.4); g.add(pr);
  }

  // ---- single-fin dorsal fillet (EFT/TEJAS/STD) ----
  if (cfg.finFillet && cfg.vtail && cfg.vtail.type === 'single') {
    const vh = cfg.vtail.h, runLen = (cfg.id === 'TEJAS' || cfg.id === 'STD') ? vh * 1.0 : vh * 1.4;
    const fil = new THREE.Mesh(cacheGeo(gk('finfillet'), () => {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, vh * 0.45); sh.lineTo(runLen, 0); sh.closePath();
      const g2 = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: false }); g2.translate(0, 0, -0.11); g2.rotateY(Math.PI / 2); return g2;
    }), body);
    fil.position.set(0, fR * flat * 0.45, cfg.vtail.z - runLen + 0.2); g.add(fil);
  }
  // ---- single-fin tip EW pod (Rafale Spectra) ----
  if (cfg.finTipPod && cfg.vtail && cfg.vtail.type === 'single') {
    const pod = new THREE.Mesh(cacheGeo(gk('fintippod'), () => { const c = new THREE.CapsuleGeometry(0.16, 0.9, 4, 8); c.rotateX(Math.PI / 2); return c; }), sensor);
    pod.position.set(0, fR * flat * 0.4 + cfg.vtail.h - 0.1, cfg.vtail.z + cfg.vtail.sweep + 0.3); g.add(pod);
  }
  // ---- spine airbrake seam (EFT) ----
  if (cfg.dorsalBrake && hero) {
    const br = new THREE.Mesh(cacheGeo(gk('dorsalbrake'), () => new THREE.BoxGeometry(1.1, 0.06, 1.9)), panel);
    br.position.set(0, fR * flat * 0.62 + 0.05, canopyZ + 3.4); g.add(br);
  }
  // ---- dorsal turret blister (BOSS) ----
  if (cfg.spineGun && hero) {
    const blister = new THREE.Mesh(cacheGeo(gk('spinegun'), () => { const s = new THREE.SphereGeometry(0.9, 14, 10); s.scale(1, 0.6, 1); return s; }), dark);
    blister.position.set(0, fR * flat * 0.62 + 0.3, L * 0.05); g.add(blister);
    const barrel = new THREE.Mesh(cacheGeo(gk('spinegunbarrel'), () => { const c = new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8); c.rotateX(Math.PI / 2 + 0.15); return c; }), steel);
    barrel.position.set(0, fR * flat * 0.62 + 0.55, L * 0.05 - 1.4); g.add(barrel);
  }

  // ---- engines: nozzle detail + afterburner glow/flame (userData.engines contract preserved) ----
  const engines = [];
  const exZ = half + 1.6 - (cfg.buriedExhaust ? 1.2 : 0);
  if (cfg.buriedExhaust) {
    const shelf = new THREE.Mesh(cacheGeo(gk('exhaustshelf'), () => new THREE.BoxGeometry(cfg.gap + rR * 1.6, 0.18, 2.4)), body);
    shelf.position.set(0, rR * flat * 0.55, half + 0.4); g.add(shelf);
  }
  const xs = cfg.engines === 1 ? [0] : cfg.engines === 3 ? [-cfg.gap, 0, cfg.gap] : [-cfg.gap / 2, cfg.gap / 2];
  for (const ex of xs) {
    if (cfg.nozzle === '2d') {
      const w = rR * 1.5, h = rR * 1.5 * flat;
      const noz = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.2), dark);
      noz.position.set(ex, 0, exZ - 0.4); g.add(noz);
      const ramps = hero ? 5 : 1;
      for (const sy of [-1, 1]) {
        for (let r = 0; r < ramps; r++) {
          const ramp = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.12, 2.0 / ramps), hero ? steel : steel);
          ramp.position.set(ex, sy * h * 0.5, exZ - 1.0 + (r + 0.5) * (2.0 / ramps)); g.add(ramp);
        }
      }
      const inner = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.6, 1.0), nozIn);
      inner.position.set(ex, 0, exZ + 0.3); g.add(inner);
    } else {
      const segN = hero ? 40 : 20;
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(rR * 0.8, rR * 0.94, 1.9, segN), dark);
      noz.rotation.x = Math.PI / 2; noz.scale.y = flat; noz.position.set(ex, 0, exZ - 0.5); g.add(noz);
      if (hero) {
        const petals = 22;
        for (let k = 0; k < petals; k++) {
          const a = (k / petals) * Math.PI * 2;
          const pet = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.46, 1.25), steel);
          pet.position.set(ex + Math.cos(a) * rR * 0.82, Math.sin(a) * rR * 0.82 * flat, exZ + 0.2);
          pet.rotation.z = a + Math.PI / 2; pet.scale.y = flat; g.add(pet);
        }
        const can2 = new THREE.Mesh(new THREE.CylinderGeometry(rR * 0.5, rR * 0.55, 0.6, segN), new THREE.MeshBasicMaterial({ color: 0x331008, fog: false }));
        can2.rotation.x = Math.PI / 2; can2.scale.y = flat; can2.position.set(ex, 0, exZ + 0.7); g.add(can2);
      }
      // throttle-heated nozzle interior on every jet (animEngines drives the emissive)
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(rR * 0.6, rR * 0.7, 1.6, segN), nozIn);
      inner.rotation.x = Math.PI / 2; inner.scale.y = flat; inner.position.set(ex, 0, exZ + 0.2); g.add(inner);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(rR * 0.78, 10, 8), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5, fog: false }));
    glow.position.set(ex, 0, exZ + 0.5); glow.scale.set(1, flat, 1.8); g.add(glow);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(rR * 0.7, 5.5, hero ? 18 : 12), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flame.rotation.x = Math.PI / 2; flame.position.set(ex, 0, exZ + 2.4); g.add(flame);
    const eng = { glow, flame };
    if (hero) {
      // white-hot inner tongue + a ladder of shock diamonds, lit by animEngines at burner
      const core = new THREE.Mesh(new THREE.ConeGeometry(rR * 0.4, 3.8, 14), new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      core.rotation.x = Math.PI / 2; core.position.set(ex, 0, exZ + 1.8); g.add(core);
      const diaMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const dia = new THREE.Group();
      for (let d = 0; d < 4; d++) {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(rR * (0.34 - d * 0.05), 1), diaMat);
        m.scale.z = 1.6; m.position.z = 0.9 + d * 1.05; dia.add(m);
      }
      dia.position.set(ex, 0, exZ + 1.2); dia.visible = false; g.add(dia);
      eng.core = core; eng.dia = dia; eng.diaMat = diaMat;
    }
    engines.push(eng);
  }
  g.userData.engines = engines; g.userData.heatMat = nozIn; g.userData.body = body; g.userData.cfg = cfg;
  markShadowCasters(g);
  return g;
}

/* ---- glTF hero models (High tier): real modeled jets in place of the procedural builder ----
   Loaded once, oriented (length → -Z) / centered / scaled to the procedural footprint, then cloned
   per spawn. Geometry + materials are tagged userData.shared so disposeGroup never frees the shared
   template. Falls back to buildJet on Low tier or until the model finishes loading. */
/* shape id → { file, rotY (radians, to point nose → game forward -Z), len (target max-dim) }.
   rotY was derived + verified per model via a top-down contact-sheet render (the models do NOT
   share a native orientation): nose -X → -π/2, +X → +π/2, +Z → π. Fighters scale to len 26
   (the proven F-22 footprint); the BOMBER flying wing is bigger (≈ the old procedural ×1.7). */
const JET_MODELS = {
  F22:    { file: 'f22.glb',    rotY: -Math.PI / 2, len: 26 },
  SU57:   { file: 'su57.glb',   rotY:  Math.PI / 2, len: 26 },
  RAFALE: { file: 'rafale.glb', rotY: -Math.PI / 2, len: 26 },
  EFT:    { file: 'eft.glb',    rotY:  Math.PI / 2, len: 26 },
  FA18:   { file: 'fa18.glb',   rotY:  Math.PI / 2, len: 26 },
  J20:    { file: 'j20.glb',    rotY:  Math.PI / 2, len: 26 },
  J36:    { file: 'j36.glb',    rotY:  Math.PI,     len: 28 },
  F35:    { file: 'f35.glb',    rotY:  Math.PI,     len: 26 },
  F47:    { file: 'f47.glb',    rotY:  Math.PI,     len: 26 },
  J50:    { file: 'j50.glb',    rotY:  Math.PI,     len: 26 },
  TEJAS:  { file: 'tejas.glb',  rotY:  Math.PI,     len: 24 },
  STD:    { file: 'std.glb',    rotY:  Math.PI / 2, len: 26 },
  BOMBER: { file: 'bomber.glb', rotY: -Math.PI / 2, len: 44 },
};
/* per-jet afterburner anchor tweaks over the auto-derived defaults (xw = half twin-nozzle spacing,
   default 1.1; dy = raise(+)/lower(-) the plume; dz = aft(+)/forward(-) the plume). Tuned visually
   against the model nozzles (scripts/verify-jets.mjs top+rear). */
const BURN_OVERRIDE = {
  SU57:   { xw: 2.0, dy: 0.6, dz: -1.5 }, // wide nozzles; raised + pulled forward
  EFT:    { dy: -0.8, dz: -1.6 },         // was too high + too far aft
  RAFALE: { dy: -0.8, dz: -1.6 },
  FA18:   { dz: -1.2 },                    // a touch too far aft
  F47:    { xw: 2.0, dy: 1.4 },           // wider + raised
  J36:    { xw: 0.95, dy: 1.6 },          // trijet: widen splay back a bit + raise more
  J50:    { dy: 1.0, dz: -1.5 },          // was too low + too far aft
};
/* shapes whose glb is geometry-only (no baked textures) → render flat grey, so recolour them in-code
   via the SKINS paint (applyPaint). The other airframes ship textures and must NOT be repainted. */
const TEXTURELESS_SHAPES = { F47: 1, J20: 1, J36: 1, J50: 1, STD: 1 };
function loadJetModels() {
  if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader !== 'function') return;
  if (typeof gfxTier !== 'undefined' && gfxTier === 'low') return;   // low/mobile tier = procedural only; skip the model memory entirely
  const loader = new THREE.GLTFLoader();
  if (typeof THREE.DRACOLoader === 'function') {                      // some models ship Draco-compressed (vendor/draco decoder)
    const draco = new THREE.DRACOLoader();
    draco.setDecoderPath('vendor/draco/');
    loader.setDRACOLoader(draco);
  }
  Object.keys(JET_MODELS).forEach(id => {
    const spec = JET_MODELS[id];
    loader.load('assets/jets/' + spec.file, (gl) => {
      const obj = gl.scene;
      const box = new THREE.Box3().setFromObject(obj);
      obj.position.sub(box.getCenter(new THREE.Vector3()));     // centre model at its own origin
      const wrap = new THREE.Group(); wrap.add(obj);
      wrap.rotation.y = spec.rotY;                              // verified per-model: nose → game forward (-Z)
      const size = box.getSize(new THREE.Vector3());
      wrap.scale.setScalar(spec.len / Math.max(size.x, size.y, size.z));
      wrap.traverse(o => {                                      // shared template — disposeGroup must never free it
        if (o.isMesh) {
          if (o.geometry) o.geometry.userData.shared = true;
          const m = o.material; (Array.isArray(m) ? m : [m]).forEach(mm => { if (mm) mm.userData.shared = true; });
          if (!o.material || !o.material.transparent) o.castShadow = true;
        }
      });
      wrap.userData.textureless = !!TEXTURELESS_SHAPES[id];     // geometry-only export → recolour in-code via skins (applyPaint)
      // afterburner anchors derived from the oriented template: nozzles at the tail (+Z), spread by engine count
      const bb = new THREE.Box3().setFromObject(wrap);
      const bs = bb.getSize(new THREE.Vector3()), bc = bb.getCenter(new THREE.Vector3());
      const cnt = (typeof SHAPES !== 'undefined' && SHAPES[id] && SHAPES[id].engines) || 2;
      const buried = !!(typeof SHAPES !== 'undefined' && SHAPES[id] && (SHAPES[id].buriedExhaust || SHAPES[id].flyingWing));
      const tw = BURN_OVERRIDE[id] || {};
      const xw = tw.xw != null ? tw.xw : 1.1;                    // half the twin-nozzle spacing (≈ the F-22's ±1.0)
      wrap.userData.burn = {
        z: bb.max.z - 0.5 + (tw.dz || 0),                        // just inside the tail (dz: aft+/forward-)
        y: bc.y - bs.y * 0.12 + (tw.dy || 0),                    // slightly below the centreline (dy: up+/down-)
        xs: cnt === 1 ? [0] : cnt === 3 ? [-2 * xw, 0, 2 * xw] : [-xw, xw],
        rad: buried ? 0.5 : 1,                                   // stealth flying-wing exhaust is subtle
      };
      jetGLTF[id] = wrap;
      // if the hangar is previewing this exact shape, re-run selectJet so the model swaps in once loaded
      if (typeof previewJet !== 'undefined' && previewJet && typeof JETS !== 'undefined' && JETS[selectedJet] && JETS[selectedJet].shape === id && typeof selectJet === 'function') selectJet(selectedJet);
    }, undefined, (err) => { try { console.warn('jet glTF load failed:', spec.file, (err && err.message) || err); } catch (e) {} });
  });
}

/* afterburner plume attached directly to the game-space clone group at the jet's tail nozzle(s).
   burn = { z (tail, +Z aft), y, xs[] (per-engine X centre), rad (size scale) } — computed per template
   in loadJetModels from its oriented bbox + SHAPES.engines. Builds the userData.engines contract that
   animEngines drives (player/wingmen modulate by throttle; enemies keep this cruise level). Meshes are
   PER-INSTANCE (never userData.shared) so disposeGroup frees them. */
function addBurner(g, burn, accent) {
  const engines = [];
  const acc = (typeof accent === 'number') ? accent : 0xff7a2a;
  const r = burn.rad || 1;
  const heatMat = new THREE.MeshBasicMaterial({ color: 0xffcaa0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  for (const ex of burn.xs) {
    const ny = burn.y, nz = burn.z;                   // nozzle exit (game space; aft = +Z)
    // additive glow puff right at the nozzle lip
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9 * r, 12, 10), new THREE.MeshBasicMaterial({ color: acc, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.position.set(ex, ny, nz + 0.3); glow.scale.set(1, 1, 1.8); g.add(glow);
    // afterburner flame cone — apex at the nozzle, plume streaming aft (+Z)
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.62 * r, 6.0 * r, 16), new THREE.MeshBasicMaterial({ color: acc, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flame.rotation.x = Math.PI / 2;                   // cone +Y -> +Z (point the base downstream)
    flame.position.set(ex, ny, nz + 2.6 * r); g.add(flame);
    // white-hot inner tongue
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.34 * r, 4.0 * r, 14), new THREE.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    core.rotation.x = Math.PI / 2; core.position.set(ex, ny, nz + 1.9 * r); g.add(core);
    // shock-diamond ladder (fades in at burner via animEngines)
    const diaMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const dia = new THREE.Group();
    for (let d = 0; d < 4; d++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry((0.3 - d * 0.045) * r, 1), diaMat);
      m.scale.z = 1.6; m.position.z = (0.9 + d * 1.05) * r; dia.add(m);   // march downstream (+Z)
    }
    dia.position.set(ex, ny, nz + 1.0 * r); dia.visible = false; g.add(dia);
    engines.push({ glow, flame, core, dia, diaMat });
  }
  g.userData.engines = engines;
  g.userData.heatMat = heatMat;   // harmless emissive sink (no nozzle-interior mesh on the fused models)
}

/* enemy glTF clones can't take the game's red enemy paint (textures are baked), so friend/foe is
   unreadable in a furball. Give each enemy INSTANCE a red emissive sheen. The template's materials
   are userData.shared and must never be mutated, so clone the material per mesh and tag the clone
   shared:false (disposeGroup frees it; the player's same-type jet stays normal-coloured). */
function applyFoeTint(obj) {
  const tintOne = (m) => {
    const c = m.clone();
    c.userData = { shared: false };
    if (c.emissive) { c.emissive = new THREE.Color(0x6e0000); c.emissiveIntensity = 0.6; }
    return c;
  };
  obj.traverse(o => {
    if (!o.isMesh || !o.material) return;
    o.material = Array.isArray(o.material) ? o.material.map(tintOne) : tintOne(o.material);
  });
}
/* solid in-code paint for the texture-less jets (geometry-only glTF exports render flat grey).
   Clones materials PER INSTANCE (templates are userData.shared — never mutate them) and sets the base
   colour; tag the clone shared:false so disposeGroup frees it. */
function applyPaint(obj, color) {
  obj.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const paintOne = (m) => { const c = m.clone(); c.userData = { shared: false }; if (c.color) c.color = new THREE.Color(color); return c; };
    o.material = Array.isArray(o.material) ? o.material.map(paintOne) : paintOne(o.material);
  });
}

/* clone a loaded glTF template for one spawn (shares the tagged geo/materials). The scaled model
   nests in a NEW outer game-space group; the afterburner attaches there in un-scaled game coords. */
function cloneJetGLTF(id, color, accent, opts) {
  opts = opts || {};
  const inner = jetGLTF[id].clone(true);
  const g = new THREE.Group();
  g.add(inner);
  if (jetGLTF[id].userData.textureless && typeof color === 'number') applyPaint(inner, color);   // skin paint (player) / enemy-red (foe)
  else if (opts.enemy) applyFoeTint(inner);            // textured enemy: per-instance red sheen for foe readability
  const burn = jetGLTF[id].userData.burn;
  if (burn) addBurner(g, burn, accent);                // afterburner per jet (player: animEngines drives it; enemies: static cruise plume)
  g.userData.gltf = true;
  return g;
}

/* hero jets use the glTF model on High tier once loaded; everything else uses the procedural builder */
function buildJetOrGLTF(color, accent, cfg, hero, opts) {
  opts = opts || {};
  if (hero && cfg && jetGLTF[cfg.id] && (typeof gfxTier === 'undefined' || gfxTier !== 'low'))
    return cloneJetGLTF(cfg.id, color, accent, { enemy: !!opts.enemy });
  return buildJet(color, accent, cfg, hero);
}
function buildBoss() {
  const g = buildJet(0xb348d6, 0xff39c8, SHAPES.BOSS, true);
  g.scale.setScalar(3.4);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(5.5, 0), new THREE.MeshStandardMaterial({ color: 0x3a0040, emissive: 0xff20b0, emissiveIntensity: 1.2, flatShading: true }));
  core.position.set(0, 1.6, 1.5); g.add(core); g.userData.core = core;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(11, 0.6, 6, 24), new THREE.MeshBasicMaterial({ color: 0xff39c8, fog: false }));
  ring.position.z = 3; g.add(ring); g.userData.ring = ring;
  return g;
}

function buildGround() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 6, 8), new THREE.MeshStandardMaterial({ color: 0x4a4030, flatShading: true, roughness: 1 }));
  base.position.y = 3; g.add(base);
  const turret = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), new THREE.MeshStandardMaterial({ color: 0x7a5e2c, flatShading: true })); turret.position.y = 7; g.add(turret);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 11), new THREE.MeshStandardMaterial({ color: 0xff9a36, emissive: 0x331400, flatShading: true })); rail.position.set(0, 8, -3); g.add(rail);
  g.userData.turret = turret;
  markShadowCasters(g);
  return g;
}
function buildAAA() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 11, 5, 8), new THREE.MeshStandardMaterial({ color: 0x3c4434, flatShading: true, roughness: 1 }));
  base.position.y = 2.5; g.add(base);
  const barrels = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 13), new THREE.MeshStandardMaterial({ color: 0x55603f, emissive: 0x1a2008, flatShading: true }));
  barrels.position.set(0, 7, -2); barrels.rotation.x = -0.5; g.add(barrels);
  g.userData.turret = barrels;
  markShadowCasters(g);
  return g;
}
function buildRadar() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 10), new THREE.MeshStandardMaterial({ color: 0x4a5258, flatShading: true, roughness: 1 }));
  base.position.y = 4; g.add(base);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 7, 3, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a98a0, emissive: 0x0a2a30, flatShading: true, side: THREE.DoubleSide }));
  dish.position.y = 11; dish.rotation.z = Math.PI / 3; g.add(dish);
  g.userData.dish = dish;
  markShadowCasters(g);
  return g;
}
function buildTruck() {
  const g = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(5, 3.5, 11), new THREE.MeshStandardMaterial({ color: 0x5a4a30, flatShading: true, roughness: 1 }));
  bed.position.y = 2.6; g.add(bed);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 3.5), new THREE.MeshStandardMaterial({ color: 0x6a5a3a, flatShading: true }));
  cab.position.set(0, 4.6, -4.6); g.add(cab);
  markShadowCasters(g);
  return g;
}

/* ---------------- kamikaze drone ---------------- */
function buildDrone() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a0e12, metalness: 0.6, roughness: 0.5, flatShading: true });
  const shell = new THREE.Mesh(new THREE.OctahedronGeometry(4.4, 0), bodyMat);
  g.add(shell);
  for (let k = 0; k < 4; k++) {                       // X-frame fins
    const fin = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.35, 1.5), bodyMat);
    fin.rotation.z = k * Math.PI / 2 + Math.PI / 4; g.add(fin);
  }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5, 0),
    new THREE.MeshStandardMaterial({ color: 0x3a0008, emissive: 0xff2a2a, emissiveIntensity: 1.5, flatShading: true }));
  g.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff3a2a, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  glow.scale.setScalar(24); g.add(glow);
  g.userData.shell = shell; g.userData.core = core; g.userData.glow = glow;
  markShadowCasters(g);
  return g;
}

/* ---------------- player ---------------- */
function createPlayer(idx) {
  const j = JETS[idx], st = jetStats(j);
  const paint = (typeof jetPaint === 'function') ? jetPaint(j) : { color: j.color, accent: j.accent };
  const mesh = buildJetOrGLTF(paint.color, paint.accent, SHAPES[j.shape], true); scene.add(mesh);
  // muzzle flash: one persistent sprite at the nose, blinked on by fireGun
  const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd76a, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
  muzzle.position.set(0, 0, -14); muzzle.scale.setScalar(14); muzzle.visible = false; mesh.add(muzzle);
  mesh.userData.muzzle = muzzle;
  const maxHp = Math.round(st.maxHp * DIFFS[difficulty].hp);
  const maxShield = Math.round(36 + j.armor * 3);
  player = {
    jet: j, stats: st, group: mesh,
    vel: new THREE.Vector3(0, 0, -1), speed: st.minSpeed * 1.5, throttle: 0.6,
    pitchRate: 0, yawRate: 0, rollRate: 0,
    hp: maxHp, maxHp: maxHp, shield: maxShield, maxShield: maxShield, shieldT: 0,
    flares: 10, missiles: st.missiles, bullets: 800,
    maxFlares: 10, maxMissiles: Math.max(40, st.missiles), maxBullets: 800,
    lockedTarget: null, lockTarget: null, lockProgress: 0,
    gunCd: 0, missileCd: 0, flareCd: 0,
    highG: false, stealth: false, gpws: false,
    combo: 0, comboTimer: 0, score: 0, killStreak: 0,
    overdrive: 0, empBurst: 0, stealthField: 0, invuln: 0, jammer: 0, slow: 0,
    dewLance: 0, vectorSurge: 0,
    noCannon: false, gunDmgMul: 1, missileDmgMul: 1, mslEvade: 0, lockSpeedMul: 1, shieldRegenMul: 1, flarePro: 0,
    fireRateMul: 1, bulletSpeedMul: 1, scoreMul: 1, lifesteal: 0, mslRefund: 0, lootMagnet: 0, dmgReduce: 0,
    mslHard: false, upgrades: [],
    // ---- advanced combat systems (driven by tech tree + jet passives) ----
    critChance: 0, critMul: 1.7, critChain: false,   // GUNNERY: lucky hits, exploding crits
    pierce: 0,                                        // rounds punch through this many extra targets
    splashRadius: 0, splashDmg: 0,                    // MISSILES: thermobaric blast on impact
    mslSwarm: 0,                                      // MISSILES: extra missiles loosed per launch
    chainRadius: 0, chainDmg: 0, chainProp: false,    // MUNITIONS: kills detonate, chains can cascade
    shieldOnKill: 0, overshieldCap: 0, vampShield: 0, // ARMOUR: kills feed the shield; overheal banks as overshield
    reactive: 0,                                      // ARMOUR: shield-break emits a damaging pulse
    pointDefense: 0,                                  // EW: chance/s to swat an incoming missile
    burnDps: 0, burnTime: 0, burnSpread: false,       // INCENDIARY: cannon hits ignite a DoT; INFERNO CASCADE spreads it on burn-death
    empKill: 0,                                       // EMP SUBMUNITIONS: kills burst a stunning shock (radius)
    escortPD: false,                                  // GUARDIAN ESCORTS: wingmen run their own point-defense
    frenzyOnKill: 0, frenzy: 0, frenzyMax: 0,         // KILL FRENZY: kills stoke a decaying fire-rate/damage surge
    speedMul: 1, turnMul: 1,                          // PROPULSION: raw flight performance
    alphaMul: 1,                                      // TACTICS: bonus damage vs undamaged targets
    berserk: 0,                                       // TACTICS: bonus damage that grows as HP falls
    execThresh: 0,                                    // TACTICS: instantly finish low-HP non-boss foes
    rpPerKill: 0,                                     // COMMAND: flat research bounty per kill
    comboDmg: 0,                                      // RHYTHM OF WAR: bonus damage per combo point (capped)
    gunScavenge: 0,                                   // BRASS SCAVENGER: cannon rounds recovered per kill
    slowOnKill: 0,                                    // KILL CLOCK / OMEGA: seconds of bullet-time per kill
    flakFlares: 0,                                    // FLAK BLOOM: flares detonate for this damage on burnout
    execBlast: 0,                                     // HEADSMAN: executions detonate for this damage
    cheatDeath: false, _cheatUsed: false,             // TACTICS capstone: survive one lethal blow per wave
    tp: 0, tech: ['core'], techRepeat: {}, rpMul: 1,   // research points + purchased nodes (root owned free)
    special: { id: j.ability ? j.id : null, cd: 0, max: SPECIAL_CD[j.id] || 15 },   // SLOT 1 = native jet special (id null on FT-1 → inert)
    special2: { id: null, cd: 0, max: 15 },            // SLOT 2 = equipped secondary special; startGame fills id+max from the saved equip

    damageFlash: 0, shake: 0, hurtDir: null, hurtT: 0,
    _gpwsT: 0, _missT: 0, _lockT: 0, _trailT: 0, _look: null, _lbPrev: false, _wakeT: 0,
  };
  // ---------- per-jet passive identity (trade-offs beyond raw stats) ----------
  applyJetPassives(player, j);
  mesh.position.set(0, terrainH(0, 3200) + 950, 3200);
  mesh.quaternion.identity();
}
/* Each airframe gets a memorable strength and a matching weakness, now drawing on the
   advanced combat systems (crits, pierce, splash, point-defense, berserk, agility...). */
function applyJetPassives(p, j) {
  switch (j.id) {
    case 'FT-1': break;   // plain trainer — no passive identity
    case 'F-22': // PRECISION GUNS — twin cannon + standing crit chance
      p.gunDmgMul = 1.2; p.critChance = 0.1; break;
    case 'SU-57': // SUPERMANEUVER — vectored agility, fights harder hurt, lighter hull
      p.turnMul = 1.12; p.berserk = Math.max(p.berserk, 0.2); p.lockSpeedMul = 0.85; p.hpMul = 0.95; break;
    case 'J-20': // PL-15 SNIPER — no gun, brutal long-range missiles that burst on impact
      p.noCannon = true; p.bullets = 0; p.maxBullets = 0;
      p.missileDmgMul = 1.5; p.lockSpeedMul = 0.55; p.mslEvade = 0.25;
      p.splashRadius = 220; p.splashDmg = 14;
      p.missiles += 10; p.maxMissiles += 10; break;
    case 'F-35': // SENSOR FUSION — slippery to missiles, fused targeting hard-homes, soft gun
      p.mslEvade = 0.45; p.lockSpeedMul = 0.85; p.gunDmgMul = 0.9; p.mslHard = true; break;
    case 'EFT': // ENERGY FIGHTER — strong gun, ferocious turn & locks, sparse flares
      p.gunDmgMul = 1.15; p.turnMul = 1.1; p.lockSpeedMul = 0.85;
      p.flares = Math.max(2, p.flares - 4); p.maxFlares = Math.max(2, p.maxFlares - 4); break;
    case 'RAFALE': // SPECTRA SUITE — extra long-burning flares + a point-defense reflex
      p.flares += 6; p.maxFlares += 6; p.flarePro = 1; p.pointDefense = 0.25; p.lockSpeedMul = 0.9; break;
    case 'TEJAS': // FEATHERWEIGHT — fragile, but blistering shield regen and a darting turn
      p.shieldRegenMul = 2.2; p.turnMul = 1.14; break;
    case 'FA18': // ORDNANCE TRUCK — vast magazines, tough hull, mends itself on every kill
      p.missiles += 6; p.maxMissiles += 6; p.bullets += 400; p.maxBullets += 400; p.lifesteal += 6; break;
    case 'J-36': // SATURATION PLATFORM — flying magazine, heavy blast missiles, sluggish turn
      p.missiles += 16; p.maxMissiles += 20; p.bullets += 300; p.maxBullets += 300;
      p.gunDmgMul = 1.1; p.lockSpeedMul = 0.85; p.splashRadius = 300; p.splashDmg = 18; p.turnMul = 0.9; break;
    case 'F-47': // WING QUARTERBACK — balanced, stealthy, and a force multiplier for escorts
      p.gunDmgMul = 1.1; p.missileDmgMul = 1.1; p.lockSpeedMul = 0.7; p.mslEvade = 0.2;
      wingDmgMul = Math.max(wingDmgMul, 1.25); break;   // your AI escorts & CCAs hit 25% harder
    case 'NGAD': // BLEEDING EDGE — fastest jet in the hangar, near-perfect stealth, point-defense
      p.gunDmgMul = 1.1; p.missileDmgMul = 1.15; p.lockSpeedMul = 0.65; p.mslEvade = 0.3;
      p.speedMul = 1.1; p.pointDefense = 0.3; break;
    case 'J-50': // PHANTOM AGILITY — supremely nimble & slippery, lands crits, lightly built
      p.mslEvade = 0.38; p.lockSpeedMul = 0.8; p.turnMul = 1.15; p.critChance = 0.1; p.hpMul = 0.9; break;
  }
  // hull multipliers fold into current + max HP
  if (j.id === 'TEJAS') { p.maxHp = Math.round(p.maxHp * 0.7); p.hp = p.maxHp; }
  if (j.id === 'FA18')  { p.maxHp = Math.round(p.maxHp * 1.15); p.hp = p.maxHp; }
  if (j.id === 'J-36')  { p.maxHp = Math.round(p.maxHp * 1.22); p.hp = p.maxHp; }
  if (p.hpMul) { p.maxHp = Math.round(p.maxHp * p.hpMul); p.hp = p.maxHp; }
}

/* ---------------- enemies ---------------- */
const FIGHTER_SHAPES = ['STD'];   // regular fodder all fly the plain trainer; aces fly the named real jets
const ACE_SHAPES     = ['J20', 'F22', 'SU57', 'EFT'];
function aceShapePool() { return JETS.filter(j => j.shape !== 'STD').map(j => j.shape); }
function jetNameForShape(shape) { const j = JETS.find(x => x.shape === shape); return j ? j.name : shape; }
const CALLPFX = ['BANDIT','BOGEY','TANGO','VENOM','GHOST','REAPER','TALON','VIPER','RAVEN','SPECTRE'];
function genCallsign(pfx) { return (pfx || CALLPFX[randInt(0, CALLPFX.length - 1)]) + '-' + randInt(1, 99).toString().padStart(2, '0'); }

function createEnemy(type, pos, opts) {
  opts = opts || {};
  let mesh, hp, shapeKey;
  if (type === 'boss') { mesh = buildBoss(); hp = 1000 + wave * 70; }
  else if (type === 'ground') {
    const gk = (opts && opts.gkind) || 'sam';
    mesh = gk === 'aaa' ? buildAAA() : gk === 'radar' ? buildRadar() : gk === 'truck' ? buildTruck() : buildGround();
    hp = gk === 'radar' ? 110 : gk === 'truck' ? 45 : gk === 'aaa' ? 90 : 75;
  }
  else if (type === 'drone') { mesh = buildDrone(); hp = 16 + wave * 2.2; }   // balance 2026-06: was *1.4 — keeps late-run swarms threatening (drones were one-tapped past ~wave 10)
  else if (type === 'bomber') {
    mesh = buildJetOrGLTF(0x8a9468, 0xffb060, SHAPES.BOMBER, true, { enemy: true });   // always glTF-eligible on High tier
    if (!mesh.userData.gltf) mesh.scale.setScalar(1.7);   // procedural fallback still needs the ×1.7 bump; glTF is pre-scaled
    hp = 240 + wave * 8;
  }
  else {
    const pool = opts.shapePool || FIGHTER_SHAPES;
    shapeKey = pool[randInt(0, pool.length - 1)];
    mesh = buildJetOrGLTF(0xff5a5a, 0xff2a2a, SHAPES[shapeKey] || SHAPES.ENEMY, !!opts.useGLTF, { enemy: true });   // aces/rivals set useGLTF; mooks stay procedural
    hp = 46 + wave * 4;
  }
  scene.add(mesh); mesh.position.copy(pos);
  if (mesh.userData.body) { mesh.userData.body.emissive = new THREE.Color(type === 'boss' ? 0x550033 : 0x3a0606); mesh.userData.body.emissiveIntensity = 0.7; }
  // Fighter threat variety (balance pass 2026-06, cheap version): roll a coarse temperament so not every
  // fighter flies the same "circle-then-strafe" routine. ~40% are AGGRESSIVE knife-fighters (sharper turn,
  // tighter fire cadence); the rest are STANDOFF (wider, looser). turnRate range widened from rand(0.95,1.32)
  // to a per-temperament split; fire cooldown tightened for the aggressive side. Full multi-archetype AI
  // (evaders, decoy-users, coordinated pincers) is deferred — see balance-implementation-report.md.
  const aggressive = type === 'fighter' && Math.random() < 0.4;
  const fighterTurn = type === 'fighter'
    ? (aggressive ? rand(1.18, 1.5) : rand(0.85, 1.15))   // aggressive out-turns the player harder; standoff is lazier
    : rand(0.95, 1.32);                                   // bombers etc. keep the legacy roll
  const fighterFireCd = aggressive ? rand(0.45, 1.1) : rand(0.6, 2);   // aggressive fighters re-engage faster
  const e = {
    group: mesh, type, hp, maxHp: hp, aggressive, aimingPlayer: false,
    vel: new THREE.Vector3(), speed: type === 'ground' ? 0 : rand(150, 205),
    turnRate: type === 'boss' ? 0.82 : type === 'ground' ? 0 : fighterTurn,
    logicQuat: mesh.quaternion.clone(), bank: 0, baseScale: mesh.scale.x,
    fireCd: fighterFireCd, missileCd: rand(3, 7), flareCd: 0, trailT: 0,
    gunRun: 0, gunRunCd: rand(2.5, 5.5),
    orbitSign: Math.random() < 0.5 ? -1 : 1,
    // fighter behavioral archetype (2026-06): duelist (baseline, keeps the `aggressive` sub-roll)
    // / baiter (jukes to break player lock) / decoy (proactive flares + standoff) / pincer (pairs up
    // to flank). Non-fighters always fly the duelist routine. jinkCd/pincerPartner are per-archetype
    // scratch used by updateEnemy; pickArchetype is the PURE selector in core.js.
    archetype: type === 'fighter' ? pickArchetype(Math.random, wave, { elite: !!(opts && opts.elite) }) : 'duelist',
    jinkCd: 0, pincerPartner: null,
    state: 'engage', alive: true, isInCloud: false, hitFlash: 0,
    marker: type === 'drone' ? null : makeMarker(type),
    callsign: type === 'fighter' ? genCallsign() : null,
    shapeKey: shapeKey || null,
    gkind: (type === 'ground' && opts && opts.gkind) || (type === 'ground' ? 'sam' : null),
  };
  // ----- per-type ammunition loadouts -----
  //  regular fighter : limited cannon, 1 missile, no flares
  //  bomber          : heavier cannon, 2 missiles, a few flares
  //  boss            : huge cannon,    many missiles, medium flares
  //  ground turret   : missile-only SAM site
  if (type === 'boss')        { e.bulletAmmo = 600; e.missileAmmo = 24; e.flareAmmo = 10; e.phase = 1; }
  else if (type === 'bomber') { e.bulletAmmo = 90;  e.missileAmmo = 2;  e.flareAmmo = 4;  }
  else if (type === 'ground') { e.bulletAmmo = 0; e.missileAmmo = (!opts || !opts.gkind || opts.gkind === 'sam') ? 4 : 0; e.flareAmmo = 0; }
  else if (type === 'drone')  { e.bulletAmmo = 0;   e.missileAmmo = 0;  e.flareAmmo = 0;  }
  else                        { e.bulletAmmo = 42;  e.missileAmmo = 1;  e.flareAmmo = 0;  }
  if (e.marker) scene.add(e.marker);
  enemies.push(e); return e;
}
function updateMarker(e) {
  e.marker.position.copy(e.group.position);
  const md = e.group.position.distanceTo(player.group.position);
  let ms = clamp(md * 0.055, 26, 300); if (e.type === 'boss') ms *= 1.7;
  const locked = player.lockedTarget === e;
  if (locked) ms *= 1 + 0.22 * Math.sin(performance.now() * 0.012);
  e.marker.scale.setScalar(ms);
  e.marker.material.opacity = e.isInCloud ? 0.22 : (locked ? 1.0 : 0.8);
}

function activeEnemyMissiles() { let n = 0; for (let i = 0; i < missiles.length; i++) if (missiles[i].enemy) n++; return n; }

function clearLocks(e) {
  if (player.lockedTarget === e) player.lockedTarget = null;
  if (player.lockTarget === e) { player.lockTarget = null; player.lockProgress = 0; }
}

function fireRivalSpecial(e) {
  const kind = rivalSpecialFor(e.shapeKey);
  if (e.group.userData.body) { e.group.userData.body.emissiveIntensity = 2.2; setTimeout(() => { if (e.group.userData.body) e.group.userData.body.emissiveIntensity = 1.0; }, 500); }
  audio.power();
  if (kind === 'OVERDRIVE') { e.sprintTimer = 4; }
  else if (kind === 'VOLLEY') { e._volley = 3; e._volleyT = 0; }
  else if (kind === 'FLARESTORM') { enemyFlares(e); enemyFlares(e); enemyFlares(e); }
  else if (kind === 'GHOST') {
    e._ghostT = 3;
    clearLocks(e);
  }
}

/* Rival escape run: burn straight away from the player, flare against locks, vanish past 5000u.
   Returns true when the rival despawned (caller must stop processing the enemy this frame). */
function updateRivalFlee(e, dt) {
  const away = t1.copy(e.group.position).sub(player.group.position);
  const dist = away.length();
  away.multiplyScalar(1 / Math.max(dist, 0.001)); away.y = Math.max(away.y, 0.05); away.normalize();
  dirToQuat(away, q1);
  e.logicQuat.rotateTowards(q1, e.turnRate * 1.4 * dt);
  const nf = fwdQ(e.logicQuat, t4);
  e.group.quaternion.copy(e.logicQuat);
  e.speed = lerp(e.speed, 360, dt * 2);
  e.vel.copy(nf).multiplyScalar(e.speed);
  e.group.position.addScaledVector(e.vel, dt);
  e.flareCd -= dt;
  if (e.flareCd <= 0 && e.flareAmmo > 0) {
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (!m.enemy && m.target === e) { enemyFlares(e); e.flareCd = 1.6; break; } }
  }
  updateMarker(e);
  if (dist > 5000) {
    e.alive = false;
    scene.remove(e.group); disposeGroup(e.group);
    if (e.marker) scene.remove(e.marker);
    clearLocks(e);
    rivalEscaped({ missiles: run.pMissiles, gunKills: run.pGunKills, flares: run.pFlares, wingmen: wingmen.length });
    showBanner('☠ ' + e.callsign + ' WITHDRAWS — HE WILL RETURN STRONGER ☠');
    return true;
  }
  return false;
}

/* status effects applied to EVERY enemy type (ticked before the per-type AI so a burn can finish a foe) */
function tickEnemyStatus(e, dt) {
  if (e.stun > 0) {
    e.stun -= dt;
    e.stunSparkT = (e.stunSparkT || 0) - dt;
    if (e.stunSparkT <= 0) { e.stunSparkT = 0.08; spawnTrail(e.group.position, 0x6cc8ff, 0.7); }   // crackling EMP arcs
  }
  if (e.burnT > 0) {
    e.burnT -= dt;
    e.burnTickT = (e.burnTickT || 0) - dt;
    if (e.burnTickT <= 0) {
      e.burnTickT = 0.4;
      damageEnemy(e, e.burnDps * 0.4, e.group.position, true);   // INCENDIARY DoT counts as your damage
      if (e.alive) spawnSmoke(e.group.position, 0xff7a2a, 0.6);   // licking flames
    }
  }
}
function updateEnemy(e, dt) {
  if (e.type === 'ground') { updateGround(e, dt); return; }
  if (e.type === 'drone') { updateDrone(e, dt); return; }
  if (e.type === 'bomber') { updateBomber(e, dt); return; }
  const toP = t1.copy(player.group.position).sub(e.group.position);
  const dist = toP.length();
  toP.multiplyScalar(1 / Math.max(dist, 0.001));
  const fwd = fwdQ(e.logicQuat, t3);
  animEngines(e.group, clamp((e.speed || 480) / 700, 0.35, 1));

  const prev = e.state;
  let incoming = false;
  for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (!m.enemy && m.target === e && m.mesh.position.distanceToSquared(e.group.position) < 640000) { incoming = true; break; } }
  if (e.elite && !e.desprintUsed && e.hp / e.maxHp < 0.3) { e.desprintUsed = true; e.sprintTimer = 2.5; e.orbitSign *= -1; }
  if (e.rival && !e.noFlee && !e.fleeing && e.hp / e.maxHp < 0.2) { e.fleeing = true; e.sprintTimer = 9; showBanner('☠ ' + e.callsign + ' IS BREAKING OFF ☠'); }   // FINAL-cap rivals (noFlee) fight to the death
  if (e.rival && e.fleeing) { if (updateRivalFlee(e, dt)) return; }
  if (e.rival && !e.fleeing) {
    e.rivalSpCd -= dt;
    if (e.rivalSpCd <= 0) { e.rivalSpCd = 12; fireRivalSpecial(e); }
    if (e._volley > 0) {
      e._volleyT -= dt;
      if (e._volleyT <= 0 && e.missileAmmo > 0) {
        const dir = t1.copy(player.group.position).sub(e.group.position).normalize();
        spawnMissile(t2.copy(e.group.position), dir, null, true, 1);
        e._volley--; e._volleyT = 0.3; audio.missile();
      }
    }
    if (e._ghostT > 0) { e._ghostT -= dt; if (e.marker) e.marker.visible = e._ghostT <= 0; }
    else if (e.marker && !e.marker.visible) e.marker.visible = true;
  }
  if (e.elite && e.flareCd <= 0 && e.flareAmmo > 0) { for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (!m.enemy && m.target === e && m.mesh.position.distanceToSquared(e.group.position) < 1440000) { enemyFlares(e); e.flareCd = 2.0; break; } } }
  // ----- archetype scratch (2026-06): all behavior below is gated on e.archetype, so duelists run the
  // unchanged routine. lockedByPlayer = the player is acquiring or fully locked onto THIS enemy. -----
  e.jinkCd -= dt;
  const lockedByPlayer = (player.lockTarget === e) || (player.lockedTarget === e);
  if (e.archetype === 'pincer') {
    // lazy pairing: createEnemy spawns one enemy per call, so partners link up here. Find another
    // partnerless live pincer and bracket the player by taking the OPPOSITE orbit sign.
    if (!e.pincerPartner || !e.pincerPartner.alive) {
      e.pincerPartner = null;
      for (let i = 0; i < enemies.length; i++) { const o = enemies[i]; if (o !== e && o.alive && o.type === 'fighter' && o.archetype === 'pincer' && (!o.pincerPartner || !o.pincerPartner.alive)) { e.pincerPartner = o; o.pincerPartner = e; break; } }
    }
    if (e.pincerPartner && e.pincerPartner.alive) e.orbitSign = pincerSign(e.pincerPartner.orbitSign);
    // a partnerless pincer just flies the duelist routine (no flank) — exactly per spec.
  } else if (e.archetype === 'decoy' && lockedByPlayer && e.flareCd <= 0 && e.flareAmmo > 0) {
    // proactive decoy: pop chaff the MOMENT it's locked (not only when a missile is already inbound),
    // making the player's missiles unreliable vs it. Counter: close to gun range.
    enemyFlares(e); e.flareCd = 2.3;
  }
  const PREF = e.type === 'boss' ? 1700 : 1250;
  const NEAR = e.type === 'boss' ? 1150 : 760;
  if (incoming) e.state = 'evade';
  else if (dist < NEAR) e.state = 'extend';
  else if (prev === 'extend' && dist < PREF * 1.25) e.state = 'extend';
  else if (e.archetype === 'decoy' && lockedByPlayer && dist < PREF * 1.6) e.state = 'extend';   // decoy keeps distance while locked
  else e.state = 'engage';

  let desired = t2;
  if (e.state === 'evade') {
    desired.copy(e.group.position).sub(player.group.position).setLength(1); desired.y += 0.22;
    t5.copy(toP).cross(UPV).multiplyScalar(e.orbitSign * 0.5); desired.add(t5).normalize();
    e.flareCd -= dt; if (e.flareCd <= 0 && e.flareAmmo > 0) { enemyFlares(e); e.flareCd = 2.6; }
    e.speed = lerp(e.speed, 252, dt);
  } else if (e.state === 'extend') {
    desired.copy(e.group.position).sub(player.group.position).normalize();
    t5.copy(toP).cross(UPV).multiplyScalar(e.orbitSign * 0.6); desired.add(t5).normalize(); desired.y += 0.04;
    e.speed = lerp(e.speed, 242, dt);
  } else {
    e.gunRunCd -= dt;
    if (e.gunRun > 0) e.gunRun -= dt;
    else if (e.gunRunCd <= 0) { e.gunRun = rand(1.6, 2.8); e.gunRunCd = rand(2.2, 4.2); }
    const tracking = e.gunRun > 0;
    const rangeErr = clamp((dist - PREF) / PREF, -1, 1);
    t4.copy(toP).multiplyScalar(tracking ? Math.max(rangeErr, -0.15) : rangeErr);
    t5.copy(toP).cross(UPV).multiplyScalar(e.orbitSign * (tracking ? 0.3 : 1));
    desired.copy(t4).add(t5).normalize();
    const lead = interceptPoint(e.group.position, player.group.position, player.vel, 1400);
    if (lead) { tA.copy(lead).sub(e.group.position).normalize(); desired.lerp(tA, tracking ? 0.8 : 0.25).normalize(); }
    e.speed = lerp(e.speed, tracking ? (e.type === 'boss' ? 200 : 226) : (e.type === 'boss' ? 178 : 198), dt);
  }
  const agl = e.group.position.y - terrainH(e.group.position.x, e.group.position.z);
  if (agl < 220) desired.y = Math.max(desired.y, 0.45);
  // ----- campaign boss phase descriptors (Operations map). Gated on e._phaseCfg (set at spawn by
  // main.js); absent for endless/boss-rush/rivals, so their AI is byte-identical. Phase 1's cfg is
  // applied lazily here once (bossEnterPhase in combat.js only fires for crossed thresholds 2/3), then
  // _pattern/_flags bias the ALREADY-computed `desired` heading rather than rewriting the AI. -----
  if (e._phaseCfg) {
    if (e.phase === 1 && !e._cfgInit && typeof bossApplyPhaseCfg === 'function') bossApplyPhaseCfg(e, 1);
    bossPatternSteer(e, dt, desired, toP, dist, lockedByPlayer);
  }
  // ----- baiter break-turn (2026-06): when the player is locking this enemy, juke HARD sideways on a
  // short cooldown to break the lock, then settle back. Adds a big lateral offset to the heading +
  // a transient turn-rate boost so the juke actually snaps. Counter: stay on it / lead the juke. -----
  let turnMul = 1;
  if (e.archetype === 'baiter' && shouldJink({ lockedByPlayer, jinkCd: e.jinkCd })) {
    e.jinkCd = rand(1.4, 2.2);            // re-engage window between jukes (player gets a beat to re-acquire)
    e.orbitSign = -e.orbitSign;           // flip the break direction each juke (unpredictable)
    e._jinkT = 0.5;                       // hold the boosted turn for the snap
  }
  if (e._jinkT > 0) {
    e._jinkT -= dt;
    t5.copy(toP).cross(UPV).multiplyScalar(e.orbitSign * 1.1); desired.add(t5);   // hard lateral break
    turnMul = 1.6;
  }
  desired.normalize();
  if (e.elite && e.sprintTimer > 0) { e.sprintTimer -= dt; e.speed = lerp(e.speed, 340, dt * 2.5); }

  dirToQuat(desired, q1);
  e.logicQuat.rotateTowards(q1, e.turnRate * turnMul * dt * (e.stun > 0 ? 0.35 : 1));   // EMP stun makes them wallow; baiter jukes boost turnMul
  const nf = fwdQ(e.logicQuat, t4);
  const cross = t5.copy(fwd).cross(nf);
  const wantBank = clamp(-cross.y * 6, -1, 1);
  e.bank = damp(e.bank, wantBank, 6, dt);
  q2.setFromAxisAngle(ZAX, e.bank);
  e.group.quaternion.copy(e.logicQuat).multiply(q2);

  e.vel.copy(nf).multiplyScalar(e.speed);
  e.group.position.addScaledVector(e.vel, dt);
  e.isInCloud = inCloud(e.group.position);
  e.trailT -= dt;
  if (e.trailT <= 0 && !e.isInCloud && e.speed > 160) { spawnTrail(e.group.position, e.type === 'boss' ? 0xff9adf : 0xffb4b4, 0.4); e.trailT = 0.06; }
  
  updateMarker(e);

  if (e.group.userData.ring) e.group.userData.ring.rotation.z += dt * 2;
  if (e.hitFlash > 0) { e.hitFlash -= dt; e.group.scale.setScalar(e.baseScale * (1 + (e.hitFlash > 0 ? 0.14 : 0))); }

  const scrambled = (player.empBurst > 0 && e.group.position.distanceToSquared(player.group.position) < 1960000) || (e.stun > 0);
  if (scrambled) { e.fireCd = Math.max(e.fireCd, 1.4); e.missileCd = Math.max(e.missileCd, 3); }
  const jammed = player.jammer > 0;

  const visible = !player.stealth;
  e.aimingPlayer = false;   // recomputed below when the enemy is an active gun threat to the player this frame
  if (e.state === 'engage' && visible && !scrambled) {
    const ang = nf.angleTo(toP);
    const df = DIFFS[difficulty].fire, dms = DIFFS[difficulty].missile;
    const enr = e.phase >= 3 ? 0.42 : e.phase >= 2 ? 0.55 : 1;   // boss phases tighten fire cadence
    // ----- cannon: flat effective range so enemies actually strafe (stealth still gates them via `visible`) -----
    e.fireCd -= dt;
    const gunCone = e.gunRun > 0 ? 0.34 : 0.24;
    const gunRange = e.type === 'boss' ? 2200 : 1750;
    // threat reticle (§4b): flag when this fighter/boss is aligned + in gun range — i.e. aiming at the player NOW
    e.aimingPlayer = enemyIsAimingPlayer({ ang, dist, gunCone, gunRange, engaged: true, canSee: visible });
    if (ang < gunCone && dist < gunRange && e.fireCd <= 0 && e.bulletAmmo > 0) {
      const wm = (wingmen.length && Math.random() < 0.34) ? firstAliveWingman() : null;
      enemyFireGun(e, wm);
      if (e.type === 'boss') { enemyFireGun(e); enemyFireGun(e); }
      else if (e.elite && e.gunRun > 0 && dist < 900) { enemyFireGun(e); }
      e.fireCd = (e.type === 'boss' ? rand(0.24, 0.5) : (e.gunRun > 0 ? rand(0.14, 0.26) : rand(0.4, 0.75))) * df * enr * (e.aggressive ? 0.78 : 1);   // aggressive fighters keep up a tighter cadence (balance 2026-06)
    }
    // ----- missiles (jamming shuts down launches) -----
    e.missileCd -= dt;
    const cap = e.type === 'boss' ? 8 : 6;
    const mslRange = e.type === 'boss' ? 3000 : 2600;
    if (!jammed && dist < mslRange && dist > 360 && ang < 0.6 && e.missileCd <= 0 && e.missileAmmo > 0 && activeEnemyMissiles() < cap) {
      enemyFireMissile(e);
      if (e.type === 'boss') { enemyFireMissile(e); if (e.phase >= 2) enemyFireMissile(e); if (e.phase >= 3) enemyFireMissile(e); }
      e.missileCd = (e.type === 'boss' ? rand(3.5, 6) : rand(5, 9)) * dms * enr;
    }
  }
  if (e.type === 'boss' && !(e.stun > 0)) updateBossSpecials(e, dt, dist);
}

// Campaign-boss movement polish (Operations map). Reads e._pattern / e._flags (set from the phase
// descriptor in combat.js bossApplyPhaseCfg). Biases the ALREADY-computed `desired` heading and reuses
// existing systems (enemyFlares for chaff, the baiter _jinkT break for mirror) — no new engine. Only
// touches scratch tA, which updateEnemy no longer reads after this call. Inert when no pattern/flag set.
function bossPatternSteer(e, dt, desired, toP, dist, lockedByPlayer) {
  const pat = e._pattern;
  if (pat === 'standoff') {
    // GLACIER p1 — BVR: hold missile range, refuse the gun merge. Push away when inside ~2400u.
    if (dist < 2400) { desired.copy(e.group.position).sub(player.group.position).normalize(); desired.y += 0.05; desired.normalize(); }
  } else if (pat === 'headOn') {
    // WARLORD p3 / CORSAIR p3 — commit to a high-closure head-on merge at the player's predicted position.
    const lead = interceptPoint(e.group.position, player.group.position, player.vel, 1400);
    if (lead) { tA.copy(lead).sub(e.group.position).normalize(); desired.lerp(tA, 0.85).normalize(); }
    else { desired.lerp(toP, 0.85).normalize(); }
    e.speed = lerp(e.speed, 300, dt);                    // bore in hard
  } else if (pat === 'dive') {
    // GLACIER p3 — climb for altitude, then a steep diving attack. Hysteresis on _diving so it commits.
    const agl = e.group.position.y - terrainH(e.group.position.x, e.group.position.z);
    if (!e._diving && agl > 2000) e._diving = true;       // reached perch -> roll into the dive
    else if (e._diving && agl < 700) e._diving = false;   // bottomed out -> climb again
    if (e._diving) { desired.copy(toP); desired.y = Math.min(desired.y, -0.55); desired.normalize(); e.speed = lerp(e.speed, 320, dt); }
    else { desired.y = Math.max(desired.y, 0.6); desired.normalize(); e.speed = lerp(e.speed, 230, dt); }
  }
  const flags = e._flags;
  if (flags && flags.length) {
    // chaff (WARLORD p2): periodically seed decoys from the boss via the EXISTING enemy flare pathway.
    if (flags.indexOf('chaff') >= 0) {
      e._chaffCd = (e._chaffCd || 0) - dt;
      if (e._chaffCd <= 0 && e.flareAmmo > 0) { enemyFlares(e); e._chaffCd = 1.8; }
    }
    // mirror (CORSAIR p1): a small canned-counter feel — on a cooldown, when the player locks the boss,
    // fire one of 3 scripted reactions by reusing the baiter break (flip orbit + a transient turn boost
    // via _jinkT, which the block below already turns into a hard lateral juke). Reads as adaptive briefly.
    if (flags.indexOf('mirror') >= 0) {
      e._mirrorCd = (e._mirrorCd || 0) - dt;
      if (lockedByPlayer && e._mirrorCd <= 0) {
        e._mirrorCd = 2.4;
        e._mirrorMove = ((e._mirrorMove || 0) + 1) % 3;   // 0=break left/right, 1=hard break + dump chaff, 2=extend
        e.orbitSign = -e.orbitSign;
        e._jinkT = 0.5;                                   // reuse baiter snap (turnMul=1.6 in the block below)
        if (e._mirrorMove === 1 && e.flareAmmo > 0) enemyFlares(e);
        else if (e._mirrorMove === 2) { desired.copy(e.group.position).sub(player.group.position).normalize(); desired.y += 0.04; desired.normalize(); }
      }
    }
  }
}

function updateBomber(e, dt) {
  const desired = t2.copy(e.escapeDir);
  const agl = e.group.position.y - terrainH(e.group.position.x, e.group.position.z);
  if (agl < 320) desired.y = Math.max(desired.y, 0.18);
  desired.normalize();
  dirToQuat(desired, q1);
  e.logicQuat.rotateTowards(q1, 0.5 * dt * (e.stun > 0 ? 0.35 : 1));
  const nf = fwdQ(e.logicQuat, t3);
  const cross = t4.copy(fwdQ(e.logicQuat, t5)).cross(nf);
  e.bank = damp(e.bank, clamp(-cross.y * 4, -0.5, 0.5), 3, dt);
  q2.setFromAxisAngle(ZAX, e.bank);
  e.group.quaternion.copy(e.logicQuat).multiply(q2);
  e.vel.copy(nf).multiplyScalar(e.speed);
  e.group.position.addScaledVector(e.vel, dt);
  e.isInCloud = inCloud(e.group.position);
  e.trailT -= dt;
  if (e.trailT <= 0 && !e.isInCloud) { spawnTrail(e.group.position, 0xffd0a0, 0.45); e.trailT = 0.05; }
  updateMarker(e);
  if (e.hitFlash > 0) { e.hitFlash -= dt; e.group.scale.setScalar(e.baseScale * (1 + (e.hitFlash > 0 ? 0.08 : 0))); }
  const d = e.group.position.distanceTo(player.group.position);
  const canShoot = !player.stealth && player.empBurst <= 0 && !(e.stun > 0);
  // guns (medium magazine)
  if (d < 1500 && canShoot && e.bulletAmmo > 0) { e.fireCd -= dt; if (e.fireCd <= 0) { enemyFireGun(e); e.fireCd = rand(0.5, 1.0) * DIFFS[difficulty].fire; } }
  // missiles fired straight at the player (2 in the magazine)
  e.missileCd -= dt;
  if (d < 2600 && canShoot && player.jammer <= 0 && e.missileAmmo > 0 && e.missileCd <= 0 && activeEnemyMissiles() < 6) {
    const dir = t1.copy(player.group.position).sub(e.group.position).normalize();
    spawnMissile(e.group.position, dir, null, true, 1); e.missileAmmo--; audio.missile();
    e.missileCd = rand(4, 7) * DIFFS[difficulty].missile;
  }
  // pop a few flares when a player missile is chasing it
  let bInc = false;
  for (let k = 0; k < missiles.length; k++) { const m = missiles[k]; if (!m.enemy && m.target === e && m.mesh.position.distanceToSquared(e.group.position) < 640000) { bInc = true; break; } }
  if (bInc) { e.flareCd -= dt; if (e.flareCd <= 0 && e.flareAmmo > 0) { enemyFlares(e); e.flareCd = 2.2; } }
  if (e.group.position.distanceToSquared(e.spawnPos) > 144000000) {
    e.alive = false; scene.remove(e.group); disposeGroup(e.group); if (e.marker) scene.remove(e.marker);
    clearLocks(e);
    showBanner('BOMBER ESCAPED');
  }
}
function radarUp() { for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.alive && e.type === 'ground' && e.gkind === 'radar') return true; } return false; }
function updateGround(e, dt) {
  if (e.group.userData.turret) e.group.lookAt(player.group.position);
  const d = e.group.position.distanceTo(player.group.position);
  if (e.gkind === 'radar') {
    if (e.group.userData.dish) e.group.userData.dish.rotation.y += dt * 1.2;
  } else if (e.gkind === 'truck') {
    if (!e.truckDir) { e.truckDir = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize(); }
    e.group.position.addScaledVector(e.truckDir, dt * (e.convoy ? (e.convoySpeed || 46) : 28));
    e.group.position.y = terrainH(e.group.position.x, e.group.position.z);
    if (e.convoy && d > 7800) {   // convoy truck outruns the radar — gone for good
      e.alive = false; scene.remove(e.group); disposeGroup(e.group); if (e.marker) scene.remove(e.marker);
      clearLocks(e);
      showBanner(t('banner.convoyEscaped'));
      return;
    }
  } else if (e.gkind === 'aaa') {
    e.missileCd -= dt;          // reused as the flak timer
    if (d < 1500 && player.group.position.y - e.group.position.y < 1100 && e.missileCd <= 0) {
      e.missileCd = rand(1.1, 1.8);
      flakBurst(e);
    }
  } else {   // 'sam' — original behavior, radar-boosted when a radar station is alive
    const boosted = radarUp();
    const range = boosted ? 4800 : 3200;
    e.missileCd -= dt;
    if (d < range && !player.stealth && player.empBurst <= 0 && player.jammer <= 0 && !(e.stun > 0) && e.missileCd <= 0 && e.missileAmmo > 0 && activeEnemyMissiles() < 5) {
      const dir = t1.copy(player.group.position).sub(e.group.position).normalize(); dir.y = Math.max(dir.y, 0.35); dir.normalize();
      spawnMissile(t2.copy(e.group.position).setY(e.group.position.y + 9), dir, null, true, 1);
      missiles[missiles.length - 1].fromGround = true;
      e.missileAmmo--; e.missileCd = rand(5, 9) * (boosted ? 0.7 : 1); audio.missile();
    }
  }
  if (e.hitFlash > 0) { e.hitFlash -= dt; e.group.scale.setScalar(e.baseScale * (1 + (e.hitFlash > 0 ? 0.1 : 0))); }
  updateMarker(e);
}
function flakBurst(e) {
  // burst at a point near the player's predicted position; proximity damage, no homing
  const aim = t1.copy(player.group.position).addScaledVector(player.vel, rand(0.4, 0.9));
  aim.x += rand(-90, 90); aim.y += rand(-70, 70); aim.z += rand(-90, 90);
  explode(aim, false);
  const d2 = aim.distanceToSquared(player.group.position);
  if (d2 < 120 * 120) damagePlayer(rand(5, 9) * (1 - Math.sqrt(d2) / 120), aim);
}

/* Kamikaze drones home straight in and detonate on contact. Fragile, but lethal in a pack.
   Cloak / clouds / EMP all break their tracking, giving the player real counters. */
function updateDrone(e, dt) {
  const toP = t1.copy(player.group.position).sub(e.group.position);
  const dist = toP.length(); toP.multiplyScalar(1 / Math.max(dist, 0.001));
  const u = e.group.userData;

  const scrambled = (player.empBurst > 0 && e.group.position.distanceToSquared(player.group.position) < 1960000) || (e.stun > 0);
  const canSee = !player.stealth && !scrambled;
  e.speed = lerp(e.speed, canSee ? 320 : 70, dt * (canSee ? 0.9 : 1.6));   // surge toward the player

  let desired = t2;
  if (canSee) {
    desired.copy(toP);
    const wob = Math.sin(performance.now() * 0.004 + (e.wob || 0)) * 0.14;   // light weave so a swarm fans out
    t5.copy(toP).cross(UPV).multiplyScalar(wob); desired.add(t5).normalize();
  } else {
    desired.copy(fwdQ(e.logicQuat, t3)); desired.y += 0.02;
  }
  const agl = e.group.position.y - terrainH(e.group.position.x, e.group.position.z);
  if (agl < 120) desired.y = Math.max(desired.y, 0.4);
  desired.normalize();

  dirToQuat(desired, q1);
  e.logicQuat.rotateTowards(q1, e.turnRate * dt);
  const nf = fwdQ(e.logicQuat, t4);
  e.group.quaternion.copy(e.logicQuat);
  e.vel.copy(nf).multiplyScalar(e.speed);
  e.group.position.addScaledVector(e.vel, dt);
  e.isInCloud = inCloud(e.group.position);

  e.trailT -= dt;
  if (e.trailT <= 0 && !e.isInCloud) { spawnTrail(e.group.position, 0xff5a3a, 0.5); e.trailT = 0.04; }
  if (u.shell) u.shell.rotation.y += dt * 5;
  const pulse = 1.2 + 0.6 * Math.sin(performance.now() * 0.02 + (e.wob || 0));
  if (u.core) u.core.material.emissiveIntensity = pulse;
  if (u.glow) u.glow.material.opacity = 0.6 + 0.35 * Math.sin(performance.now() * 0.02 + (e.wob || 0));
  if (e.hitFlash > 0) { e.hitFlash -= dt; e.group.scale.setScalar(e.baseScale * (1 + (e.hitFlash > 0 ? 0.2 : 0))); }

  // contact detonation
  if (canSee && player.invuln <= 0 && dist < 36) {
    damagePlayer(16, e.group.position);
    e.alive = false; explode(e.group.position, false);
    clearLocks(e);
    return;
  }
  // self-destruct after a lifetime so they can never soft-lock a wave
  e.droneLife -= dt;
  if (e.droneLife <= 0) {
    e.alive = false; explode(e.group.position, false);
    clearLocks(e);
  }
}
function enemyFireGun(e, aimObj) {
  if (e.bulletAmmo <= 0) return;
  e.bulletAmmo--;
  let aimPos;
  if (aimObj && aimObj.alive) { aimPos = interceptPoint(e.group.position, aimObj.group.position, aimObj.vel, 1100) || aimObj.group.position; }
  else if (decoys.length && Math.random() < 0.6) { aimPos = decoys[(Math.random() * decoys.length) | 0].mesh.position; }
  else { aimPos = interceptPoint(e.group.position, player.group.position, player.vel, 1100) || player.group.position; }
  const dir = t1.copy(aimPos).sub(e.group.position).normalize();
  dir.x += rand(-0.03, 0.03); dir.y += rand(-0.03, 0.03); dir.normalize();
  const b = getBullet(); b.enemy = true; b.dmg = e.type === 'boss' ? 6 : 4; b.life = 2.2; b.mesh.material = ASSET.ebulletMat; b.mesh.scale.setScalar(1.8);
  b.mesh.position.copy(e.group.position).addScaledVector(fwdQ(e.logicQuat, t2), 12);
  b.vel.copy(dir).multiplyScalar(1150); bullets.push(b);
  audio.enemyGun();
}
function enemyFireMissile(e) { if (e.missileAmmo <= 0) return; e.missileAmmo--; spawnMissile(e.group.position, fwdQ(e.logicQuat, t1), null, true, 1); audio.missile(); }
function enemyFlares(e) {
  if (e.flareAmmo <= 0) return;
  const n = Math.min(2, e.flareAmmo); e.flareAmmo -= n;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(ASSET.flareGeo, ASSET.flareMat); m.position.copy(e.group.position); scene.add(m);
    flares.push({ mesh: m, vel: new THREE.Vector3(rand(-50, 50), rand(-30, -90), rand(-50, 50)), life: 3, owner: 'enemy' });
  }
}
