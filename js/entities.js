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

/* ---------------- jet meshes (high-poly parametric) ---------------- */
/* extruded, swept wing/canard/stab built from a half-planform [span, chordZ] (chordZ<0 = forward) */
function extrudeWing(pts, thick, mat, y, bevelSeg, cacheKey) {
  const bs = bevelSeg || 1;
  const geo = cacheGeo(cacheKey, () => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    const g2 = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.42, bevelSize: 0.22, bevelSegments: bs, steps: 1, curveSegments: bs > 1 ? 8 : 4 });
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
    const g2 = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: bs, steps: 1, curveSegments: bs > 1 ? 6 : 3 });
    g2.translate(0, 0, -th / 2); g2.rotateY(-Math.PI / 2);   // geometry-space transforms run once
    return g2;
  });
  return new THREE.Mesh(geo, mat);
}
/* compact AIM-9-style wingtip missile (built nose toward -Z), returned as a positioned group */
function buildTipMissile(x, y, z, mat, glowColor) {
  const g = new THREE.Group();
  const bodyL = 3.4, bodyR = 0.2;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 1.8), mat);
  rail.position.set(0, 0.3, 0.2); g.add(rail);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(bodyR, bodyR, bodyL, 10), mat);
  tube.rotation.x = Math.PI / 2; g.add(tube);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(bodyR, 0.7, 10), mat);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -bodyL / 2 - 0.32; g.add(nose);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(bodyR * 0.7, 8, 6), new THREE.MeshBasicMaterial({ color: glowColor || 0x66ccff, fog: false }));
  tip.position.z = -bodyL / 2 - 0.62; g.add(tip);
  for (const zz of [-bodyL / 2 + 0.7, bodyL / 2 - 0.4]) {
    const span = zz < 0 ? 0.42 : 0.55;
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(span, 0.05, 0.5), mat);
      fin.position.z = zz; fin.rotation.z = k * Math.PI / 2; fin.translateX(bodyR + span / 2);
      g.add(fin);
    }
  }
  g.position.set(x, y, z);
  return g;
}

/* per-aircraft data. forward = -Z. wing/canard/htail are right-half planforms [span, chordZ] */
const SHAPES = {
  F22:  { len:18, noseLen:6.5, frontR:1.5, rearR:1.15, flat:0.6,
          wing:[[1.4,-2],[10,2.2],[10,4.0],[1.6,6.0]], wingY:-0.2, wingThick:0.55,
          htail:[[1.0,5.8],[5.0,7.8],[5.0,9.2],[1.0,9.4]],
          vtail:{type:'twin', base:3.4, tip:1.2, h:4.0, sweep:1.7, x:2.0, z:5.4, cant:0.30},
          lerx:true, engines:2, gap:2.0, intake:'side', wingspan:10 },
  SU57: { len:19, noseLen:7, frontR:1.4, rearR:1.2, flat:0.58,
          wing:[[1.5,-2],[9.5,2.5],[9.5,4.2],[1.7,6.8]], wingY:-0.2, wingThick:0.55,
          canard:[[1.4,-3.2],[3.2,-2.4],[3.2,-1.6],[1.5,-1.8]], canardY:0.05,
          htail:[[1.0,5.8],[4.6,7.6],[4.6,9.0],[1.0,9.2]],
          vtail:{type:'twin', base:3.0, tip:1.0, h:3.8, sweep:1.5, x:2.7, z:6.2, cant:0.32},
          lerx:false, engines:2, gap:3.4, intake:'side', wingspan:9.5 },
  J20:  { len:21, noseLen:8.5, frontR:1.25, rearR:1.1, flat:0.58,
          wing:[[1.2,-1],[9.5,4.5],[9.5,6.0],[1.4,7.5]], wingY:-0.2, wingThick:0.55,
          canard:[[1.2,-7],[4.2,-5.0],[4.2,-4.2],[1.4,-4.4]], canardY:0.1,
          vtail:{type:'twin', base:3.0, tip:0.9, h:3.6, sweep:1.6, x:2.0, z:7.2, cant:0.30},
          lerx:false, engines:2, gap:1.6, intake:'side', wingspan:9.5 },
  F35:  { len:16, noseLen:5.5, frontR:1.7, rearR:1.25, flat:0.66,
          wing:[[1.4,-0.5],[8.5,3],[8.5,5.5],[1.6,7]], wingY:-0.2, wingThick:0.55,
          htail:[[1.0,5.8],[4.2,7.4],[4.2,8.6],[1.0,8.8]],
          vtail:{type:'twin', base:3.2, tip:1.1, h:3.8, sweep:1.5, x:1.7, z:4.4, cant:0.50},
          lerx:true, engines:1, gap:0, intake:'side', wingspan:8.5 },
  EFT:  { len:17, noseLen:7, frontR:1.3, rearR:1.2, flat:0.62,
          wing:[[1.3,-0.5],[9.5,5.5],[9.5,7.0],[1.5,8.0]], wingY:-0.15, wingThick:0.55,
          canard:[[1.3,-6.5],[3.6,-5.0],[3.6,-4.3],[1.5,-4.5]], canardY:0.12,
          vtail:{type:'single', base:4.0, tip:1.4, h:4.2, sweep:2.0, z:4.2},
          lerx:false, engines:2, gap:1.8, intake:'belly', wingspan:9.5 },
  TEJAS:{ len:14.5, noseLen:5.5, frontR:1.4, rearR:1.1, flat:0.66,
          wing:[[1.2,-2],[3.2,-1.4],[7.6,3.0],[7.6,5.5],[1.4,6.5]], wingY:-0.15, wingThick:0.5,
          vtail:{type:'single', base:3.6, tip:1.2, h:3.8, sweep:1.8, z:3.4},
          lerx:false, engines:1, gap:0, intake:'side', wingspan:7.6 },
  RAFALE:{ len:17, noseLen:6.5, frontR:1.35, rearR:1.2, flat:0.62,
          wing:[[1.4,-0.5],[8.8,4.5],[8.8,6.2],[1.6,7.2]], wingY:-0.15, wingThick:0.55,
          canard:[[1.5,-4.8],[3.6,-3.2],[3.6,-2.4],[1.7,-2.8]], canardY:0.12,
          vtail:{type:'single', base:3.6, tip:1.2, h:4.0, sweep:1.8, z:4.6},
          lerx:false, engines:2, gap:2.0, intake:'side', wingspan:8.8 },
  FA18:{ len:16.5, noseLen:6, frontR:1.5, rearR:1.2, flat:0.64,
          wing:[[1.6,-1.5],[8.2,1.5],[8.2,3.8],[1.8,5.8]], wingY:-0.15, wingThick:0.55,
          htail:[[1.0,5.6],[4.6,7.0],[4.6,8.4],[1.0,8.8]],
          vtail:{type:'twin', base:3.2, tip:1.1, h:3.8, sweep:1.4, x:2.0, z:4.0, cant:0.42},
          lerx:true, engines:2, gap:1.8, intake:'side', wingspan:8.2 },
  // ---- 6th-gen tailless designs (no vertical tails) ----
  J36:  { len:24, noseLen:9, frontR:1.75, rearR:1.5, flat:0.56,
          wing:[[1.6,-3.5],[12.6,5.5],[12.6,8.6],[1.9,9.6]], wingY:-0.15, wingThick:0.64,
          lerx:true, engines:3, gap:2.6, intake:'side', wingspan:12.6 },
  F47:  { len:19.5, noseLen:8, frontR:1.5, rearR:1.25, flat:0.6,
          wing:[[1.4,-1],[10.5,4.5],[10.5,6.8],[1.7,8.0]], wingY:-0.18, wingThick:0.56,
          canard:[[1.4,-6.2],[3.5,-4.8],[3.5,-4.1],[1.6,-4.4]], canardY:0.1,
          lerx:false, engines:2, gap:2.0, intake:'side', wingspan:10.5 },
  NGAD: { len:20.5, noseLen:8.5, frontR:1.45, rearR:1.3, flat:0.57,
          wing:[[1.3,-0.5],[11.5,5.5],[11.5,7.8],[5.5,9.2],[1.7,9.6]], wingY:-0.16, wingThick:0.55,
          lerx:true, engines:2, gap:2.2, intake:'side', wingspan:11.5 },
  J50:  { len:18, noseLen:7, frontR:1.4, rearR:1.2, flat:0.6,
          wing:[[1.3,-1.5],[9.5,3.5],[9.5,6.0],[3.8,7.8],[1.6,8.0]], wingY:-0.15, wingThick:0.54,
          lerx:true, engines:2, gap:1.8, intake:'side', wingspan:9.5 },
  ENEMY:{ len:16, noseLen:6.5, frontR:1.4, rearR:1.1, flat:0.62,
          wing:[[1.4,-1],[8.5,3],[8.5,5],[1.6,6.8]], wingY:-0.2, wingThick:0.5,
          htail:[[1.0,5.8],[4.2,7.6],[4.2,8.8],[1.0,9.0]],
          vtail:{type:'twin', base:3.2, tip:1.1, h:3.6, sweep:1.5, x:2.0, z:4.4, cant:0.30},
          lerx:true, engines:2, gap:1.7, intake:'side', wingspan:8.5 },
  BOSS: { len:20, noseLen:8, frontR:1.7, rearR:1.4, flat:0.66,
          wing:[[1.5,-1.5],[11,5],[11,7.5],[1.8,9]], wingY:-0.2, wingThick:0.7,
          canard:[[1.5,-7],[4.0,-5],[4.0,-4],[1.7,-4.2]], canardY:0.12,
          vtail:{type:'twin', base:3.6, tip:1.2, h:4.6, sweep:1.8, x:2.6, z:6.0, cant:0.30},
          lerx:false, engines:2, gap:2.6, intake:'side', wingspan:11 },
  BOMBER:{ len:24, noseLen:7, frontR:2.0, rearR:1.6, flat:0.7,
          wing:[[2,-3],[15,-1],[15,2],[2.5,4.5]], wingY:0.1, wingThick:0.7,
          htail:[[1.2,8],[6,9.5],[6,10.8],[1.2,11]],
          vtail:{type:'single', base:4.5, tip:1.6, h:5.0, sweep:2.4, z:6.5},
          lerx:false, engines:2, gap:7, intake:'belly', wingspan:15 },
};

/* stable id per shape — used as the geometry-cache key prefix */
Object.keys(SHAPES).forEach(k => { SHAPES[k].id = k; });

/* per-airframe accuracy flags (stealth jets fly clean; others carry tip missiles) */
['F22', 'F35', 'J20', 'SU57', 'J36', 'F47', 'NGAD', 'J50'].forEach(k => { if (SHAPES[k]) SHAPES[k].clean = true; });
if (SHAPES.F22) SHAPES.F22.nozzle = '2d';            // F-22: rectangular 2D thrust-vectoring nozzles
if (SHAPES.J20) { SHAPES.J20.ventral = true; SHAPES.J20.dsi = true; }  // J-20: ventral fins + DSI bumps
if (SHAPES.F35) SHAPES.F35.dsi = true;               // F-35: DSI inlet bumps
// 6th-gen: flat stealth nozzles & diverterless intakes
if (SHAPES.F47) { SHAPES.F47.nozzle = '2d'; SHAPES.F47.dsi = true; }
if (SHAPES.NGAD) { SHAPES.NGAD.nozzle = '2d'; SHAPES.NGAD.dsi = true; }
if (SHAPES.J36) { SHAPES.J36.dsi = true; }
if (SHAPES.J50) { SHAPES.J50.nozzle = '2d'; SHAPES.J50.dsi = true; }
// electro-optical sensors: forward IRST ball (Flanker/Typhoon/Rafale) vs faceted under-nose EOTS / aperture (F-35, J-20, 6th-gen)
['SU57', 'EFT', 'RAFALE'].forEach(k => { if (SHAPES[k]) SHAPES[k].irst = true; });
['F35', 'J20', 'F47', 'NGAD', 'J36', 'J50'].forEach(k => { if (SHAPES[k]) SHAPES[k].eots = true; });

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

function buildJet(color, accent, cfg, hero) {
  cfg = cfg || SHAPES.ENEMY;
  const g = new THREE.Group();
  const bs = hero ? 3 : 1;
  const SID = cfg.id || '';                 // '' => cacheGeo bypasses (no shared key)
  const H = hero ? 1 : 0;
  const gk = part => (SID ? SID + ':' + part + ':' + H : '');   // geometry cache key for this shape/part/hero
  const body  = new THREE.MeshStandardMaterial({ color, metalness: 0.42, roughness: 0.46, side: THREE.DoubleSide });
  const dark  = new THREE.MeshStandardMaterial({ color: 0x222a33, metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide });
  const panel = new THREE.MeshStandardMaterial({ color: 0x171d25, metalness: 0.55, roughness: 0.6, side: THREE.DoubleSide });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6b7785, metalness: 0.85, roughness: 0.35 });
  const nozIn = new THREE.MeshStandardMaterial({ color: 0x0a0d11, metalness: 0.3, roughness: 0.75 });
  const sensor = new THREE.MeshStandardMaterial({ color: 0x1a2630, metalness: 0.55, roughness: 0.12, emissive: 0x0b1a26, emissiveIntensity: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x213a52, metalness: 0.3, roughness: 0.08, emissive: 0x0a1622, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const L = cfg.len, half = L / 2, fR = cfg.frontR, rR = cfg.rearR, flat = cfg.flat || 0.62;
  const wy = (cfg.wingY != null ? cfg.wingY : -0.2);

  // ---- fuselage: smooth surface of revolution (ogive nose -> area-ruled body -> boattail) ----
  const z0 = -half - cfg.noseLen + 0.5;   // nose tip
  const zNose = -half + 0.5;              // nose/body join
  const zBody = half - 0.3;               // body/boattail join
  const z1 = half + 2.3;                  // open exhaust end (covered by nozzles)
  const prof = [];
  const NS = hero ? 34 : 15;
  for (let i = 0; i <= NS; i++) { const t = i / NS; prof.push(new THREE.Vector2(Math.max(0.001, fR * Math.pow(t, 0.6)), z0 + (zNose - z0) * t)); }
  const BS = hero ? 20 : 6;
  for (let i = 1; i <= BS; i++) { const t = i / BS; prof.push(new THREE.Vector2(lerp(fR, rR, t) - 0.075 * fR * Math.sin(Math.PI * t), zNose + (zBody - zNose) * t)); }  // area-rule waist
  const TS = hero ? 10 : 3;
  for (let i = 1; i <= TS; i++) { const t = i / TS; prof.push(new THREE.Vector2(lerp(rR, rR * 0.6, t), zBody + (z1 - zBody) * t)); }
  const RING = hero ? 56 : 18;
  const fgeo = cacheGeo(gk('fuse'), () => { const lg = new THREE.LatheGeometry(prof, RING); lg.rotateX(Math.PI / 2); return lg; });
  const fuse = new THREE.Mesh(fgeo, body); fuse.scale.set(1, flat, 1); g.add(fuse);

  // panel-join scribe rings around the fuselage (hero only — adds surface detail)
  if (hero) {
    for (const zf of [-0.34, -0.06, 0.24, 0.5]) {
      const cz = lerp(zNose, zBody, (zf + 0.5));
      const rr = (lerp(fR, rR, (zf + 0.5)) - 0.075 * fR) * 1.005;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.035, 5, RING), panel);
      ring.position.set(0, 0, cz); ring.scale.set(1, flat, 1); g.add(ring);
    }
  }

  // dorsal spine (blended)
  const spine = new THREE.Mesh(new THREE.BoxGeometry(fR * 0.9, fR * 0.55, L * 0.5), body);
  spine.position.set(0, fR * flat * 0.55, half * 0.1); g.add(spine);

  if (hero) { // fine nose probe (pitot) + twin AoA vanes
    const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 1.5, 8), steel);
    pitot.rotation.x = Math.PI / 2; pitot.position.set(0, 0, z0 - 0.65); g.add(pitot);
    for (const sx of [-1, 1]) {
      const vane = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), dark);
      vane.position.set(sx * fR * 0.75, 0, z0 + 1.6); g.add(vane);
    }
  }

  // ---- electro-optical sensors ----
  if (hero && cfg.irst) {           // forward IRST ball, offset to starboard ahead of the windscreen
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), sensor);
    ball.scale.set(0.9, 0.9, 1.1); ball.position.set(fR * 0.34, fR * flat * 0.62, -half + 0.8); g.add(ball);
  }
  if (hero && cfg.eots) {           // faceted under-nose EO targeting / aperture
    const eo = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 5), sensor);
    eo.scale.set(1, 0.7, 1.25); eo.position.set(0, -fR * flat * 0.62, -half + 1.4); g.add(eo);
  }

  // ---- canopy: windscreen wedge + bubble + frame (+ interior for hero) ----
  const canopyZ = cfg.canopyZ != null ? cfg.canopyZ : (-half + cfg.noseLen * 0.1 + 2.6);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(fR * 1.18, fR * 0.5, 3.3), body);
  sill.position.set(0, fR * flat * 0.55, canopyZ + 0.4); g.add(sill);
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
  const can = new THREE.Mesh(new THREE.SphereGeometry(fR * 0.9, hero ? 36 : 14, hero ? 24 : 10), glass);
  can.scale.set(0.92, 0.74, 1.9); can.position.set(0, fR * flat + 0.3, canopyZ); g.add(can);
  if (hero) { // forward windscreen wedge for a sharper canopy line
    const ws = new THREE.Mesh(new THREE.SphereGeometry(fR * 0.78, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), glass);
    ws.scale.set(0.9, 0.8, 1.3); ws.position.set(0, fR * flat + 0.18, canopyZ - 1.7); g.add(ws);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 3.3), dark);
      rail.position.set(sx * fR * 0.52, fR * flat + 0.32, canopyZ); g.add(rail);
    }
    const bow = new THREE.Mesh(new THREE.BoxGeometry(fR * 1.1, 0.14, 0.16), dark);
    bow.position.set(0, fR * flat + 0.42, canopyZ - 1.45); g.add(bow);
  }

  // ---- LERX / chine strakes ----
  if (cfg.lerx) {
    const lz = cfg.wing[0][1];
    const lpts = [[0.75, lz + 0.4], [2.8, lz - 0.6], [0.75, lz - cfg.noseLen * 0.42]];
    g.add(extrudeWing(lpts, 0.28, body, wy + 0.14, bs, gk('lerx')));
  }

  // ---- lifting surfaces ----
  g.add(extrudeWing(cfg.wing, cfg.wingThick || 0.5, body, wy, bs, gk('wing')));
  if (cfg.canard) g.add(extrudeWing(cfg.canard, 0.34, body, cfg.canardY != null ? cfg.canardY : 0.12, bs, gk('canard')));
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
  const vt = cfg.vtail;
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

  // ---- ventral fins (J-20) ----
  if (hero && cfg.ventral) {
    const vf = { base: 1.6, tip: 0.5, h: 1.8, sweep: 1.0, thick: 0.25 };
    for (const sx of [-1, 1]) {
      const f = buildFin(vf, body, bs, gk('ventral'));
      f.position.set(sx * rR * 0.7, -fR * flat * 0.45, half - 2.0);
      f.rotation.z = Math.PI + sx * 0.3;
      g.add(f);
    }
  }

  // ---- intakes (+ caret lips, splitter plates & DSI bumps for hero) ----
  if (cfg.intake === 'side') {
    for (const sx of [-1, 1]) {
      const ik = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7 * flat + 0.5, 4.2), dark);
      ik.position.set(sx * (fR + 0.45), -fR * flat * 0.35, -half + 3.6); g.add(ik);
      if (hero) {
        const lip = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.12, 8, 18), steel);
        lip.position.set(sx * (fR + 0.45), -fR * flat * 0.35, -half + 1.5);
        lip.scale.set(0.62, (1.7 * flat + 0.5) / 1.85, 1); g.add(lip);
        // boundary-layer splitter plate between intake & fuselage
        const split = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7 * flat + 0.4, 2.6), panel);
        split.position.set(sx * (fR - 0.05), -fR * flat * 0.32, -half + 3.4); g.add(split);
        if (cfg.dsi) {
          const bump = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 12), body);
          bump.scale.set(0.7, 0.85, 1.3); bump.position.set(sx * (fR + 0.15), -fR * flat * 0.2, -half + 2.1); g.add(bump);
        }
      }
    }
  } else if (cfg.intake === 'belly' || cfg.intake === 'chin') {
    const ik = new THREE.Mesh(new THREE.BoxGeometry(fR * 1.9, 1.4, 3.8), dark);
    ik.position.set(0, -fR * flat - 0.2, -half + 3.2); g.add(ik);
    if (hero) {
      const lip = new THREE.Mesh(new THREE.TorusGeometry(fR * 0.9, 0.12, 8, 18), steel);
      lip.rotation.x = Math.PI / 2; lip.position.set(0, -fR * flat - 0.2, -half + 1.4); lip.scale.set(1, 0.5, 1); g.add(lip);
    }
  }

  // ---- stores: weapon-bay door outlines (stealth jets) or underwing pylons + tip missiles (others) ----
  if (hero && cfg.clean) {
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, L * 0.22), panel);
      door.position.set(sx * fR * 0.5, -fR * flat - 0.01, -half * 0.05); g.add(door);
    }
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(fR * 0.95, 0.05, 0.05), panel);
    cross1.position.set(0, -fR * flat - 0.01, -half * 0.05 - L * 0.11); g.add(cross1);
    const cross2 = cross1.clone(); cross2.position.z = -half * 0.05 + L * 0.11; g.add(cross2);
  }
  if (hero && !cfg.clean && cfg.wing) {
    let tx = 0, tz = 0;
    for (const p of cfg.wing) { if (p[0] > tx) { tx = p[0]; tz = p[1]; } }
    for (const sx of [-1, 1]) {
      g.add(buildTipMissile(sx * tx, wy, tz + 1.5, dark, accent));
      // an inboard underwing pylon
      const py = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 1.6), dark);
      py.position.set(sx * tx * 0.5, wy - 0.45, tz * 0.3 + 1.2); g.add(py);
    }
  }

  // blade antenna on the spine (hero)
  if (hero) {
    const ant = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.9), dark);
    ant.position.set(0, fR * flat * 0.55 + 0.5, canopyZ + 3.2); ant.rotation.x = -0.12; g.add(ant);
  }

  // ---- engines: nozzle detail + afterburner glow/flame (userData.engines contract preserved) ----
  const engines = [];
  const exZ = half + 1.6;
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
      const segN = hero ? 28 : 12;
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(rR * 0.8, rR * 0.94, 1.9, segN), dark);
      noz.rotation.x = Math.PI / 2; noz.scale.y = flat; noz.position.set(ex, 0, exZ - 0.5); g.add(noz);
      if (hero) {
        const petals = 16;
        for (let k = 0; k < petals; k++) {
          const a = (k / petals) * Math.PI * 2;
          const pet = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 1.25), steel);
          pet.position.set(ex + Math.cos(a) * rR * 0.82, Math.sin(a) * rR * 0.82 * flat, exZ + 0.2);
          pet.rotation.z = a + Math.PI / 2; pet.scale.y = flat; g.add(pet);
        }
        const inner = new THREE.Mesh(new THREE.CylinderGeometry(rR * 0.6, rR * 0.7, 1.6, segN), nozIn);
        inner.rotation.x = Math.PI / 2; inner.scale.y = flat; inner.position.set(ex, 0, exZ + 0.2); g.add(inner);
        const can2 = new THREE.Mesh(new THREE.CylinderGeometry(rR * 0.5, rR * 0.55, 0.6, segN), new THREE.MeshBasicMaterial({ color: 0x331008, fog: false }));
        can2.rotation.x = Math.PI / 2; can2.scale.y = flat; can2.position.set(ex, 0, exZ + 0.7); g.add(can2);
      }
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(rR * 0.78, 10, 8), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5, fog: false }));
    glow.position.set(ex, 0, exZ + 0.5); glow.scale.set(1, flat, 1.8); g.add(glow);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(rR * 0.7, 5.5, 12), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flame.rotation.x = Math.PI / 2; flame.position.set(ex, 0, exZ + 2.4); g.add(flame);
    engines.push({ glow, flame });
  }
  g.userData.engines = engines; g.userData.body = body; g.userData.cfg = cfg;
  return g;
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
  return g;
}

/* ---------------- player ---------------- */
function createPlayer(idx) {
  const j = JETS[idx], st = jetStats(j);
  const mesh = buildJet(j.color, j.accent, SHAPES[j.shape], true); scene.add(mesh);
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
    speedMul: 1, turnMul: 1,                          // PROPULSION: raw flight performance
    alphaMul: 1,                                      // TACTICS: bonus damage vs undamaged targets
    berserk: 0,                                       // TACTICS: bonus damage that grows as HP falls
    execThresh: 0,                                    // TACTICS: instantly finish low-HP non-boss foes
    rpPerKill: 0,                                     // COMMAND: flat research bounty per kill
    cheatDeath: false, _cheatUsed: false,             // TACTICS capstone: survive one lethal blow per wave
    tp: 0, tech: ['core'], techRepeat: {}, rpMul: 1,   // research points + purchased nodes (root owned free)
    special: { cd: 0, max: SPECIAL_CD[j.id] || 15 },
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
const FIGHTER_SHAPES = ['SU57', 'EFT', 'TEJAS', 'RAFALE', 'FA18', 'J50'];
const ACE_SHAPES     = ['J20', 'F22', 'SU57', 'EFT'];
const CALLPFX = ['BANDIT','BOGEY','TANGO','VENOM','GHOST','REAPER','TALON','VIPER','RAVEN','SPECTRE'];
function genCallsign(pfx) { return (pfx || CALLPFX[randInt(0, CALLPFX.length - 1)]) + '-' + randInt(1, 99).toString().padStart(2, '0'); }

function createEnemy(type, pos, opts) {
  opts = opts || {};
  let mesh, hp, shapeKey;
  if (type === 'boss') { mesh = buildBoss(); hp = 1000 + wave * 70; }
  else if (type === 'ground') { mesh = buildGround(); hp = 75; }
  else if (type === 'drone') { mesh = buildDrone(); hp = 16 + wave * 1.4; }
  else if (type === 'bomber') { mesh = buildJet(0x8a9468, 0xffb060, SHAPES.BOMBER); mesh.scale.setScalar(1.7); hp = 240 + wave * 8; }
  else {
    const pool = opts.shapePool || FIGHTER_SHAPES;
    shapeKey = pool[randInt(0, pool.length - 1)];
    mesh = buildJet(0xff5a5a, 0xff2a2a, SHAPES[shapeKey] || SHAPES.ENEMY);
    hp = 46 + wave * 4;
  }
  scene.add(mesh); mesh.position.copy(pos);
  if (mesh.userData.body) { mesh.userData.body.emissive = new THREE.Color(type === 'boss' ? 0x550033 : 0x3a0606); mesh.userData.body.emissiveIntensity = 0.7; }
  const e = {
    group: mesh, type, hp, maxHp: hp,
    vel: new THREE.Vector3(), speed: type === 'ground' ? 0 : rand(150, 205),
    turnRate: type === 'boss' ? 0.82 : type === 'ground' ? 0 : rand(0.95, 1.32),
    logicQuat: mesh.quaternion.clone(), bank: 0, baseScale: mesh.scale.x,
    fireCd: rand(0.6, 2), missileCd: rand(3, 7), flareCd: 0, trailT: 0,
    gunRun: 0, gunRunCd: rand(2.5, 5.5),
    orbitSign: Math.random() < 0.5 ? -1 : 1,
    state: 'engage', alive: true, isInCloud: false, hitFlash: 0,
    marker: type === 'drone' ? null : makeMarker(type),
    callsign: type === 'fighter' ? genCallsign() : null,
    shapeKey: shapeKey || null,
  };
  // ----- per-type ammunition loadouts -----
  //  regular fighter : limited cannon, 1 missile, no flares
  //  bomber          : heavier cannon, 2 missiles, a few flares
  //  boss            : huge cannon,    many missiles, medium flares
  //  ground turret   : missile-only SAM site
  if (type === 'boss')        { e.bulletAmmo = 600; e.missileAmmo = 24; e.flareAmmo = 10; }
  else if (type === 'bomber') { e.bulletAmmo = 90;  e.missileAmmo = 2;  e.flareAmmo = 4;  }
  else if (type === 'ground') { e.bulletAmmo = 0;   e.missileAmmo = 4;  e.flareAmmo = 0;  }
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

function updateEnemy(e, dt) {
  if (e.type === 'ground') { updateGround(e, dt); return; }
  if (e.type === 'drone') { updateDrone(e, dt); return; }
  if (e.type === 'bomber') { updateBomber(e, dt); return; }
  const toP = t1.copy(player.group.position).sub(e.group.position);
  const dist = toP.length();
  toP.multiplyScalar(1 / Math.max(dist, 0.001));
  const fwd = fwdQ(e.logicQuat, t3);

  const prev = e.state;
  let incoming = false;
  for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (!m.enemy && m.target === e && m.mesh.position.distanceToSquared(e.group.position) < 640000) { incoming = true; break; } }
  if (e.elite && !e.desprintUsed && e.hp / e.maxHp < 0.3) { e.desprintUsed = true; e.sprintTimer = 2.5; e.orbitSign *= -1; }
  if (e.elite && e.flareCd <= 0 && e.flareAmmo > 0) { for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (!m.enemy && m.target === e && m.mesh.position.distanceToSquared(e.group.position) < 1440000) { enemyFlares(e); e.flareCd = 2.0; break; } } }
  const PREF = e.type === 'boss' ? 1700 : 1250;
  const NEAR = e.type === 'boss' ? 1150 : 760;
  if (incoming) e.state = 'evade';
  else if (dist < NEAR) e.state = 'extend';
  else if (prev === 'extend' && dist < PREF * 1.25) e.state = 'extend';
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
  desired.normalize();
  if (e.elite && e.sprintTimer > 0) { e.sprintTimer -= dt; e.speed = lerp(e.speed, 340, dt * 2.5); }

  dirToQuat(desired, q1);
  e.logicQuat.rotateTowards(q1, e.turnRate * dt);
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

  const scrambled = player.empBurst > 0 && e.group.position.distanceToSquared(player.group.position) < 1960000;
  if (scrambled) { e.fireCd = Math.max(e.fireCd, 1.4); e.missileCd = Math.max(e.missileCd, 3); }
  const jammed = player.jammer > 0;

  const visible = !player.stealth;
  if (e.state === 'engage' && visible && !scrambled) {
    const ang = nf.angleTo(toP);
    const df = DIFFS[difficulty].fire, dms = DIFFS[difficulty].missile;
    const enr = e.enraged ? 0.55 : 1;
    // ----- cannon: flat effective range so enemies actually strafe (stealth still gates them via `visible`) -----
    e.fireCd -= dt;
    const gunCone = e.gunRun > 0 ? 0.34 : 0.24;
    const gunRange = e.type === 'boss' ? 2200 : 1750;
    if (ang < gunCone && dist < gunRange && e.fireCd <= 0 && e.bulletAmmo > 0) {
      const wm = (wingmen.length && Math.random() < 0.34) ? firstAliveWingman() : null;
      enemyFireGun(e, wm);
      if (e.type === 'boss') { enemyFireGun(e); enemyFireGun(e); }
      else if (e.elite && e.gunRun > 0 && dist < 900) { enemyFireGun(e); }
      e.fireCd = (e.type === 'boss' ? rand(0.24, 0.5) : (e.gunRun > 0 ? rand(0.14, 0.26) : rand(0.4, 0.75))) * df * enr;
    }
    // ----- missiles (jamming shuts down launches) -----
    e.missileCd -= dt;
    const cap = e.type === 'boss' ? 8 : 6;
    const mslRange = e.type === 'boss' ? 3000 : 2600;
    if (!jammed && dist < mslRange && dist > 360 && ang < 0.6 && e.missileCd <= 0 && e.missileAmmo > 0 && activeEnemyMissiles() < cap) {
      enemyFireMissile(e);
      if (e.type === 'boss') { enemyFireMissile(e); if (e.enraged) enemyFireMissile(e); }
      e.missileCd = (e.type === 'boss' ? rand(3.5, 6) : rand(5, 9)) * dms * enr;
    }
  }
  if (e.type === 'boss') updateBossSpecials(e, dt, dist);
}

function updateBomber(e, dt) {
  const desired = t2.copy(e.escapeDir);
  const agl = e.group.position.y - terrainH(e.group.position.x, e.group.position.z);
  if (agl < 320) desired.y = Math.max(desired.y, 0.18);
  desired.normalize();
  dirToQuat(desired, q1);
  e.logicQuat.rotateTowards(q1, 0.5 * dt);
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
  const canShoot = !player.stealth && player.empBurst <= 0;
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
    if (player.lockedTarget === e) player.lockedTarget = null;
    if (player.lockTarget === e) { player.lockTarget = null; player.lockProgress = 0; }
    showBanner('BOMBER ESCAPED');
  }
}
function updateGround(e, dt) {
  if (e.group.userData.turret) e.group.lookAt(player.group.position);
  const d = e.group.position.distanceTo(player.group.position);
  e.missileCd -= dt;
  if (d < 3200 && !player.stealth && player.empBurst <= 0 && player.jammer <= 0 && e.missileCd <= 0 && e.missileAmmo > 0 && activeEnemyMissiles() < 5) {
    const dir = t1.copy(player.group.position).sub(e.group.position).normalize(); dir.y = Math.max(dir.y, 0.35); dir.normalize();
    spawnMissile(t2.copy(e.group.position).setY(e.group.position.y + 9), dir, null, true, 1);
    e.missileAmmo--; e.missileCd = rand(5, 9); audio.missile();
  }
  if (e.hitFlash > 0) { e.hitFlash -= dt; e.group.scale.setScalar(e.baseScale * (1 + (e.hitFlash > 0 ? 0.1 : 0))); }
  updateMarker(e);
}

/* Kamikaze drones home straight in and detonate on contact. Fragile, but lethal in a pack.
   Cloak / clouds / EMP all break their tracking, giving the player real counters. */
function updateDrone(e, dt) {
  const toP = t1.copy(player.group.position).sub(e.group.position);
  const dist = toP.length(); toP.multiplyScalar(1 / Math.max(dist, 0.001));
  const u = e.group.userData;

  const scrambled = player.empBurst > 0 && e.group.position.distanceToSquared(player.group.position) < 1960000;
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
    if (player.lockedTarget === e) player.lockedTarget = null;
    if (player.lockTarget === e) { player.lockTarget = null; player.lockProgress = 0; }
    return;
  }
  // self-destruct after a lifetime so they can never soft-lock a wave
  e.droneLife -= dt;
  if (e.droneLife <= 0) {
    e.alive = false; explode(e.group.position, false);
    if (player.lockedTarget === e) player.lockedTarget = null;
    if (player.lockTarget === e) { player.lockTarget = null; player.lockProgress = 0; }
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
