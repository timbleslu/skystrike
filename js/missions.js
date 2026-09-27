
/* Node bridge (require-safe): core.js's pure helpers (campaignClearTarget / nextObjectivePhase /
   reconWon / stealthWon / …) are load-order globals in the browser (core.js loads first). Under Node
   they are not globals, so the pure sequence walker, the budget rule, and the recon/stealth win
   predicates below would not resolve them. Pull them onto globalThis so free-variable lookups match
   the browser. Inert in the browser (require is undefined there; the globals already exist). core.js
   is itself pure/require-safe, so this touches no THREE/store/DOM. */
if (typeof require === 'function' && typeof campaignClearTarget === 'undefined') {
  try {
    var _core = require('./core.js');
    ['campaignClearTarget', 'nextObjectivePhase', 'objectiveTypes', 'reconProgress', 'nextWaypoint',
      'detectionDelta', 'reconWon', 'stealthWon', 'escortOutcome', 'interceptDoomed'].forEach(function (k) {
      if (typeof globalThis[k] === 'undefined' && _core[k]) globalThis[k] = _core[k];
    });
  } catch (e) { /* core.js not resolvable — pure fns needing it simply won't run in this env */ }
}

const MISSION_TYPES = ['sweep', 'intercept', 'escort', 'defend', 'strike', 'recon', 'stealth', 'boss'];

function missionForSector(type) {
  if (type === 'FURBALL' || type === 'SWEEP') return 'sweep';
  if (type === 'INTERCEPT') return 'intercept';
  if (type === 'STRIKE') return 'strike';
  if (type === 'ESCORT') return 'escort';
  if (type === 'DEFEND') return 'defend';
  if (type === 'RECON') return 'recon';
  if (type === 'STEALTH') return 'stealth';
  if (type === 'ELITE') return 'none';
  if (type === 'DEPOT') return 'none';
  if (type === 'FINAL' || type === 'BOSS') return 'boss';
  return 'sweep';
}

const MISSIONS = {
  sweep: {
    setup: function (wave, rng) {
      const n = Math.min(4 + (wave >> 1), 10);
      return { target: n, timer: 0, params: { spawn: n } };
    },
    onKill: function (e, m) { m.progress++; },
    winFail: function (m) {
      if (m.progress >= m.target) return 'won';
      return 'active';
    },
  },
  intercept: {
    setup: function (wave, rng) {
      const n = wave >= 8 ? 4 : 3;
      return { target: n, timer: 45 + wave, params: { bombers: n, spawnedAll: false, aliveTargets: n } };
    },
    onKill: function (e, m) { if (e && e._missionTarget) m.progress++; },
    onTick: function (dt, m) { m.timer -= dt; },
    winFail: function (m) {
      if (m.progress >= m.target) return 'won';
      if (m.timer <= 0) { m.failReason = 'timeUp'; return 'failed'; }
      // fail the moment the kill target is unreachable (glue keeps aliveTargets/spawnedAll live).
      if (interceptDoomed(m.progress, m.target, m.params.aliveTargets, m.params.spawnedAll)) { m.failReason = 'bomberEscaped'; return 'failed'; }
      return 'active';
    },
  },
  // ESCORT (campaign overhaul): a friendly convoy drives a land route to a safe zone while raiders hunt it.
  // It lives in the `allies` list (never `enemies`); the glue keeps enRoute/delivered live. target = how many
  // trucks must arrive (default: all but one). A truck is never "lost" by the player flying away from it.
  escort: {
    setup: function (wave, rng) {
      const n = 4;
      return { target: n - 1, timer: 0, params: { convoy: n, enRoute: n, delivered: 0, spawnedAll: false } };
    },
    winFail: function (m) {
      if (!m.params.spawnedAll) return 'active';   // don't judge until the whole convoy is on the road
      const r = escortOutcome(m.params.enRoute, m.params.delivered, m.target);
      if (r === 'failed') m.failReason = 'convoyLost';
      return r;
    },
  },
  defend: {
    setup: function (wave, rng) {
      const hold = 50 + wave * 2;
      return { target: 0, timer: hold, params: { assetHp: 100, assetMaxHp: 100 } };
    },
    onTick: function (dt, m) { m.timer -= dt; },
    winFail: function (m) {
      if (m.params.assetHp <= 0) { m.failReason = 'assetLost'; return 'failed'; }
      if (m.timer <= 0) return 'won';
      return 'active';
    },
  },
  strike: {
    setup: function (wave, rng) {
      return { target: 1, timer: 0, params: { siteUp: true } };
    },
    onTick: function (dt, m) { if (m.params.timed) m.timer -= dt; },
    winFail: function (m) {
      if (!m.params.siteUp) return 'won';
      if (m.timer < 0) { m.failReason = 'timeUp'; return 'failed'; }
      return 'active';
    },
  },
  recon: {
    setup: function (wave, rng) {
      const n = wave >= 8 ? 5 : 4;
      return { target: n, timer: 120, params: { waypoints: [], count: n, hitRadius: 320 } };
    },
    onTick: function (dt, m) { m.timer -= dt; },
    winFail: function (m) {
      if (reconWon(m)) return 'won';
      if (m.timer <= 0) return 'failed';
      return 'active';
    },
  },
  // STEALTH (no-kill, ADR-0006 "go loud"): reach the extraction waypoint ALIVE. The detection meter
  // (params.detect, 0..1) is PRE-DETECTION PRESSURE only — reaching 1 TRIGGERS go-loud (blowStealthCover),
  // it never fails the level. detect rises from patrol cone-LOS / proximity rings / firing / being aimed at,
  // and DECAYS otherwise (gentler decay so a brief slip recovers before 100% — ADR-0006 retune). Once blown
  // the meter freezes. The ONLY stealth fail is death (HP→0, handled by gameOver). Pure win below.
  stealth: {
    setup: function (wave, rng) {
      return { target: 1, timer: 0, params: { waypoints: [], count: 1, hitRadius: 360, detect: 0, riseRate: 0.45, decayRate: 0.30, coneMul: 1.8 } };
    },
    winFail: function (m) {
      // NEVER 'failed' from the meter (ADR-0006) — win only by reaching the waypoint; death fails elsewhere.
      if (stealthWon(m)) return 'won';
      return 'active';
    },
  },
  boss: {
    setup: function (wave, rng) { return { target: 1, timer: 0, params: {} }; },
    onKill: function (e, m) { if (e && (e.type === 'boss' || e.finalCap)) m.progress++; },
    winFail: function (m) { return m.progress >= m.target ? 'won' : 'active'; },
  },
};

function startMission(type, wave, rng) {
  const def = MISSIONS[type];
  if (!def) return { type: type, target: 0, progress: 0, timer: 0, status: 'active', params: {} };
  const s = def.setup(wave, rng || Math.random);
  return {
    type: type,
    target: s.target || 0,
    progress: 0,
    timer: s.timer || 0,
    status: 'active',
    params: s.params || {},
  };
}

function missionKill(m, e) {
  if (!m || m.status !== 'active') return;
  const def = MISSIONS[m.type];
  if (def && def.onKill) def.onKill(e, m);
}

function tickMission(m, dt) {
  if (!m || m.status !== 'active') return m;
  const def = MISSIONS[m.type];
  if (def && def.onTick) def.onTick(dt, m);
  if (def && def.winFail) m.status = def.winFail(m);
  return m;
}

function missionSequence(objectives) {
  return (Array.isArray(objectives) && objectives.length) ? { phases: objectives.slice(), idx: 0 } : null;
}
function sequenceDescriptor(seq) { return seq ? seq.phases[seq.idx] : null; }
function advanceSequence(seq) {
  const next = nextObjectivePhase(seq.idx, seq.phases.length);
  if (next < 0) return { seq: null, done: true };
  return { seq: { phases: seq.phases, idx: next }, done: false };
}

function phaseClearTarget(verb, wave, budget) {
  return (typeof campaignClearTarget === 'function') ? campaignClearTarget(verb, wave, budget) : null;
}

function planPhase(desc, wave, phase, total, isFirst) {
  const d = (desc && typeof desc === 'object') ? desc : {};
  const verb = missionForSector(d === desc ? d.type : desc);
  const mission = startMission(verb, wave, Math.random);
  if (d.wp != null) { mission.params.count = d.wp; mission.target = d.wp; }
  const spawn = d.spawn || null;
  const clamped = phaseClearTarget(verb, wave, spawn);
  if (clamped !== null) mission.target = clamped;
  // a scripted SWEEP phase means "clear the WHOLE authored flight" — the procedural 4-kill cap would
  // end the phase with bandits still airborne (and then vanish them).
  if (verb === 'sweep' && spawn) mission.target = Math.max(mission.target, sweepKills(spawn));
  if (d.timer != null && (verb === 'intercept' || verb === 'recon' || verb === 'strike')) { mission.timer = d.timer; if (verb === 'strike') mission.params.timed = true; }
  if (d.hold != null && verb === 'defend') mission.timer = d.hold;
  if (verb === 'intercept') mission.params.aliveTargets = mission.target;
  if (verb === 'escort') {
    if (d.convoy) { mission.params.convoy = d.convoy; mission.params.enRoute = d.convoy; mission.target = Math.max(1, d.convoy - 1); }
    if (d.required) mission.target = d.required;
    mission.params.escortKind = d.escort === 'transport' ? 'transport' : 'truck'; mission.params.allyLabel = d.label || null;
  }
  if (verb === 'defend') { mission.params.assetKind = d.asset === 'ship' ? 'ship' : 'outpost'; mission.params.allyLabel = d.label || null; }
  const spawnRequests = [{ kind: 'props', verb: verb }];
  if (verb === 'strike') spawnRequests.push(d.site ? { kind: 'strikeSite', size: d.site } : { kind: 'strikeSite' });
  if (spawn) budgetRequests(spawnRequests, spawn, raidsAllies(verb, d.raid), verb);
  if (verb === 'boss') spawnRequests.push({ kind: 'boss' });
  return {
    verb: verb,
    mission: mission,
    spawnRequests: spawnRequests,
    say: Array.isArray(d.say) ? d.say : null,
    events: Array.isArray(d.events) ? d.events : null,
    banners: {
      callout: { phase: phase, total: total },
      missionStart: !!isFirst,
      missionCard: isFirst ? verb : null,
      objective: true,
    },
  };
}
function planObjective(verb, wave, budget) {
  const mission = startMission(verb, wave, Math.random);
  const clamped = phaseClearTarget(verb, wave, budget);
  if (clamped !== null) mission.target = clamped;
  return {
    verb: verb,
    mission: mission,
    spawnRequests: [{ kind: 'props', verb: verb }],
    banners: {
      callout: { phase: 1, total: 1 },
      objective: true,
      missionCard: verb,
    },
  };
}

// the air-budget part of a spawn block as spawnRequests, in pendingSpawns order: fighters -> aces ->
// hostileAce -> bombers -> drones. Shared by planPhase and the glue's timed events (tickPhaseEvents).
function budgetRequests(out, spawn, raid, bomberVerb) {
  if (spawn.fighters) out.push(raid ? { kind: 'fighters', n: spawn.fighters, raid: true } : { kind: 'fighters', n: spawn.fighters });
  if (spawn.aces) out.push({ kind: 'aces', n: spawn.aces });
  if (spawn.hostileAce) out.push({ kind: 'hostileAce' });
  if (spawn.bombers) out.push(raid ? { kind: 'bombers', n: spawn.bombers, verb: bomberVerb, raid: true } : { kind: 'bombers', n: spawn.bombers, verb: bomberVerb });
  if (spawn.drones) out.push({ kind: 'drones', n: spawn.drones });
  return out;
}
function raidsAllies(verb, flag) { return (verb === 'escort' || verb === 'defend') ? flag !== false : !!flag; }
function sweepKills(spawn) { return (spawn.fighters || 0) + (spawn.aces || 0) + (spawn.hostileAce ? 1 : 0); }

let mission = null;          // active mission state, or null (observable — hud.js/combat.js/main.js read it)
let missionSeq = null;
let phaseClock = 0;
let phaseEvents = null;
let missionNotes = {};

let allies = [];
let bombs = [];
const ALLY_GREEN = 0x46ff8c;

function allyBeacon(g, scale, x, y, z, opacity) {
  const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: ALLY_GREEN, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  b.scale.setScalar(scale); b.position.set(x, y, z); g.add(b); g.userData.beacon = b;
}
function allyGroundY(x, z) { return Math.max(terrainH(x, z), surfaceH(x, z), SEA_LEVEL_Y); }
const ALLY_AIR_AGL = 520;
function buildShip() {
  const g = new THREE.Group();
  const hullM = new THREE.MeshStandardMaterial({ color: 0x5d6770, flatShading: true, roughness: 0.8 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 120), hullM); hull.position.y = 4; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(11, 26, 4), hullM); bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 4, -72); g.add(bow);
  const sup = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 34), new THREE.MeshStandardMaterial({ color: 0x7a848c, flatShading: true })); sup.position.set(0, 18, 8); g.add(sup);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 22, 6), hullM); mast.position.set(0, 36, 4); g.add(mast);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 6, 2.5, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x9aa6ae, side: THREE.DoubleSide, flatShading: true }));
  dish.position.set(0, 48, 4); dish.rotation.z = Math.PI / 3; g.add(dish); g.userData.dish = dish;
  allyBeacon(g, 22, 0, 52, 4, 0.9);
  markShadowCasters(g);
  return g;
}
function buildTransport() {
  const g = buildJetOrGLTF(0x8f9c94, 0x46ff8c, SHAPES.BOMBER, true, {});
  if (!g.userData.gltf) g.scale.setScalar(1.7);
  allyBeacon(g, 18, 0, 9, 6, 0.85);
  return g;
}
function friendlyMarker() {
  const m = makeMarker('fighter');
  m.material.color.setHex(ALLY_GREEN);
  scene.add(m);
  return m;
}
function buildOutpost() {
  const g = new THREE.Group();
  const conc = new THREE.MeshStandardMaterial({ color: 0x6b7068, flatShading: true, roughness: 1 });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(120, 2, 90), conc); pad.position.y = 1; g.add(pad);
  const radar = buildRadar(); radar.scale.setScalar(2.2); radar.position.set(-28, 2, -10); g.add(radar);
  g.userData.dish = radar.userData.dish;
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0x55604c, flatShading: true, roughness: 0.9 });
  for (let i = 0; i < 2; i++) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 34, 10, 1, false, 0, Math.PI), hangarMat);
    h.rotation.z = Math.PI / 2; h.rotation.y = Math.PI / 2; h.position.set(18 + i * 30, 2, 18); g.add(h);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 14, 12), new THREE.MeshStandardMaterial({ color: 0x8d8f86, flatShading: true }));
  tank.position.set(30, 9, -24); g.add(tank);
  allyBeacon(g, 26, -28, 40, -10, 0.9);
  markShadowCasters(g);
  return g;
}
function buildFriendlyTruck() {
  const g = buildTruck();
  g.children.forEach(c => { if (c.material && c.material.color) { c.material.color.setHex(0x4f6a3a); c.material.emissive = new THREE.Color(0x0c2a10); c.material.emissiveIntensity = 0.6; } });
  allyBeacon(g, 14, 0, 10, 0, 0.85);
  g.scale.setScalar(1.6);
  return g;
}
function spawnAlly(kind, x, z, opts) {
  opts = opts || {};
  const mesh = kind === 'outpost' ? buildOutpost() : kind === 'ship' ? buildShip() : kind === 'transport' ? buildTransport() : buildFriendlyTruck();
  mesh.position.set(x, allyGroundY(x, z) + (kind === 'transport' ? ALLY_AIR_AGL : 0), z);
  scene.add(mesh);
  const a = {
    kind, group: mesh, alive: true, friendly: true, air: kind === 'transport', static: kind === 'outpost' || kind === 'ship',
    hp: opts.hp || 100, maxHp: opts.hp || 100,
    label: opts.label || '', route: opts.route || null, leg: 0, speed: opts.speed || 0,
    delivered: false, hitFlash: 0, smokeT: 0, lastHitT: -99, marker: friendlyMarker(),
  };
  a.marker.position.copy(mesh.position);
  allies.push(a);
  return a;
}
function damageAlly(a, amt) {
  if (!a || !a.alive || amt <= 0) return;
  a.hp = Math.max(0, a.hp - amt); a.hitFlash = 0.15;
  const now = performance.now() / 1000;
  // radio: throttle "taking fire" calls to one every ~9s per mission so a strafing run doesn't spam
  if (now - (missionNotes._allyHitT || -99) > 9) {
    missionNotes._allyHitT = now;
    if (a.static) radioKey('ally', a.hp / a.maxHp < 0.35 ? 'comms.gen.assetCritical' : 'comms.gen.assetHit', { hp: Math.ceil(a.hp / a.maxHp * 100) });
    else radioKey('ally', a.air ? (a.hp / a.maxHp < 0.4 ? 'comms.gen.transportCritical' : 'comms.gen.transportHit') : 'comms.gen.convoyHit');
  }
  if (a.static && a.hp / a.maxHp < 0.5 && !a._halfLoss) { a._halfLoss = true; run.allyLosses = (run.allyLosses || 0) + 1; }
  a.lastHitT = now;
  if (a.hp <= 0) destroyAlly(a);
}
function destroyAlly(a) {
  if (!a.alive) return;
  a.alive = false;
  explode(a.group.position.clone().setY(a.group.position.y + 6), true);
  if (a.air) for (let k = 0; k < 4; k++) spawnSmoke(a.group.position, 0x1a1c20, 2.4);
  if (!a.static) run.allyLosses = (run.allyLosses || 0) + 1;
  despawnEnemy(a);
  if (a.static) radioKey('ally', 'comms.gen.assetLost');
  else {
    const left = allies.filter(o => o.alive && !o.static && !o.delivered).length;
    radioKey(a.air ? 'ovl' : 'ally', a.air ? 'comms.gen.transportLost' : 'comms.gen.convoyLost', { n: left });
    showBanner(t(a.air ? 'banner.transportLost' : 'banner.convoyTruckLost'));
  }
  audio.warn();
}
function clearAllies() {
  for (let i = 0; i < allies.length; i++) despawnEnemy(allies[i]);
  allies.length = 0;
  for (let i = 0; i < bombs.length; i++) { scene.remove(bombs[i].mesh); }
  bombs.length = 0;
}
function pickRaidTarget(from) {
  let best = null, bd = Infinity;
  for (let i = 0; i < allies.length; i++) {
    const a = allies[i]; if (!a.alive || a.delivered) continue;
    const d = from.distanceToSquared(a.group.position);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
const _convoyIn = { x: 0, z: 0, leg: 0 };
function updateAllies(dt) {
  for (let i = 0; i < allies.length; i++) {
    const a = allies[i]; if (!a.alive) continue;
    const pos = a.group.position;
    if (a.route && !a.delivered) {
      _convoyIn.x = pos.x; _convoyIn.z = pos.z; _convoyIn.leg = a.leg;
      const st = convoyStep(_convoyIn, a.route, a.speed, dt);
      pos.x = st.x; pos.z = st.z; a.leg = st.leg;
      a.group.rotation.y = Math.atan2(-st.dirX, -st.dirZ);
      if (st.done) {
        a.delivered = true;
        radioKey('ally', 'comms.gen.delivered', { n: allies.filter(o => o.delivered).length });
        audio.ping();
      }
    }
    if (a.air) { const want = allyGroundY(pos.x, pos.z) + ALLY_AIR_AGL; pos.y += clamp(want - pos.y, -90 * dt, 90 * dt); if (a.group.userData.engines) animEngines(a.group, 0.6); }
    else pos.y = allyGroundY(pos.x, pos.z) + (a.kind === 'ship' ? 2 : 0);
    if (a.group.userData.dish) a.group.userData.dish.rotation.y += dt * 1.2;
    if (a.group.userData.beacon) a.group.userData.beacon.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(performance.now() / 380 + i));
    const frac = a.hp / a.maxHp;
    if (frac < 0.7) { a.smokeT -= dt; if (a.smokeT <= 0) { spawnSmoke(t1.copy(pos).setY(pos.y + 8), frac < 0.35 ? 0x1a1c20 : 0x55585c, frac < 0.35 ? 2.2 : 1.4); a.smokeT = frac < 0.35 ? 0.16 : 0.35; } }
    if (a.hitFlash > 0) a.hitFlash -= dt;
    if (a.marker) {
      a.marker.position.set(pos.x, pos.y + 24, pos.z);
      const md = pos.distanceTo(player.group.position);
      a.marker.scale.setScalar(clamp(md * 0.05, 26, 260));
      a.marker.material.opacity = a.delivered ? 0.35 : 0.85;
    }
  }
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    b.vel.y -= 170 * dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    dirToQuat(t1.copy(b.vel).normalize(), b.mesh.quaternion);
    const gy = allyGroundY(b.mesh.position.x, b.mesh.position.z);
    if (b.mesh.position.y <= gy + 4) {
      const hit = b.mesh.position.clone().setY(gy + 4);
      explode(hit, true);
      for (let k = 0; k < allies.length; k++) {
        const a = allies[k]; if (!a.alive) continue;
        const dd = Math.hypot(a.group.position.x - hit.x, a.group.position.z - hit.z);
        if (dd < b.radius) damageAlly(a, b.dmg * (1 - dd / (b.radius * 1.4)));
      }
      scene.remove(b.mesh); bombs.splice(i, 1);
    }
  }
}
function dropBombs(e, target) {
  if (!target || target.air) return;
  for (let k = 0; k < 3; k++) {
    const m = buildMissileMesh(true);
    m.scale.setScalar(1.4);
    m.position.copy(e.group.position).add(t1.set(rand(-8, 8), -6 - k * 4, rand(-8, 8)));
    scene.add(m);
    const lead = t2.copy(target.group.position).sub(e.group.position); lead.y = 0;
    const v = e.vel.clone().multiplyScalar(0.35); v.y = -40;
    if (lead.lengthSq() > 1) v.add(lead.setLength(Math.min(90, lead.length() * 0.18)));
    bombs.push({ mesh: m, vel: v, dmg: target.static ? 11 : 60, radius: target.static ? 150 : 90 });
  }
  radioKey('enemy', 'comms.gen.bombsAway');
  audio.missile();
}

function landPoint(cx, cz, rMin, rMax, tries) {
  let best = null, bestH = -Infinity;
  for (let i = 0; i < (tries || 28); i++) {
    const ang = rand(0, TWO_PI), r = rand(rMin, rMax);
    const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
    const h = terrainH(x, z);
    const slope = Math.abs(terrainH(x + 40, z) - h) + Math.abs(terrainH(x, z + 40) - h);
    if (h > 25 && h < 700 && slope < 60) return { x, z };
    if (h > bestH) { bestH = h; best = { x, z }; }
  }
  return best;
}
function raidSpawnPos(target) {
  const c = target ? target.group.position : player.group.position;
  const ang = rand(0, TWO_PI), r = rand(3400, 4400);
  const x = c.x + Math.cos(ang) * r, z = c.z + Math.sin(ang) * r;
  const gy = Math.max(terrainH(x, z), SEA_LEVEL_Y);
  return new THREE.Vector3(x, clamp(Math.max(c.y, gy) + rand(500, 1000), gy + 500, 4200), z);
}

function objectiveText(m) {
  if (!m) return '';
  if (m.type === 'intercept') return t('mission.intercept') + ' ' + m.progress + '/' + m.target;
  if (m.type === 'escort')    return t('mission.escort') + '  ' + tf('mission.escort.safe', { n: m.params.delivered || 0, of: m.target });
  if (m.type === 'defend')    return t('mission.defend') + ' ' + fmtClock(Math.max(0, m.timer));
  if (m.type === 'strike')    return t('mission.strike') + (m.params.timed ? '  ' + fmtClock(Math.max(0, m.timer)) : '') + (m.params.coreLeft ? '  ·  ' + tf('mission.strike.left', { n: m.params.coreLeft }) : '');
  if (m.type === 'sweep')     return t('mission.sweep') + ' ' + m.progress + '/' + m.target;
  if (m.type === 'recon')     return t('mission.recon') + ' ' + m.progress + '/' + m.target;
  if (m.type === 'boss')      return t('mission.boss');
  if (m.type === 'stealth') {
    if (stealthBlown) return t('mission.stealth') + ' — ' + t('mission.stealth.escape');
    const det = Math.round(((m.params.detect || 0)) * 100);
    const tag = det >= 60 ? t('mission.stealth.spotted') : t('mission.stealth.undetected');
    return t('mission.stealth') + ' — ' + tag + ' ' + det + '%';
  }
  return '';
}
function fmtClock(sec) { sec = Math.ceil(sec); return Math.floor(sec / 60) + ':' + pad2(sec % 60); }

function missionName(type) { return t('mission.name.' + type) !== 'mission.name.' + type ? t('mission.name.' + type) : ''; }

function missionCardBlurbKey() { return levelBlurbKey(currentCampaignLevel()); }
function missionTypeSeen(verb) { try { return !!store.get('skystrike_seenMissionType_' + verb); } catch (e) { return true; } }
function sayLines(lines) {
  if (!lines) return;
  for (let i = 0; i < lines.length; i++) { const l = lines[i]; if (l && l[1]) radioKey(l[0], 'comms.' + l[1]); }
}

function startSectorMission(plan, wave) {
  missionSeq = missionSequence(plan.objectives);
  if (missionSeq) { startMissionPhase(missionSeq, wave, true); return; }
  const type = plan.mission;
  if (type === 'none' || type === 'boss' || !MISSIONS[type]) { mission = null; return; }
  const p = planObjective(type, wave, plan);
  mission = p.mission;
  phaseClock = 0; phaseEvents = null; missionNotes = {};
  applySpawnRequests(p.spawnRequests, mission, wave);
  const b = p.banners;
  announceObjective(b, () => showBanner(tf('banner.missionStart', { name: missionName(type) })));
  if (b.missionCard) showMissionCard(b.missionCard, missionCardBlurbKey());
}

function startMissionPhase(seq, wave, isFirst) {
  const plan = planPhase(sequenceDescriptor(seq), wave, seq.idx + 1, seq.phases.length, isFirst);
  mission = plan.mission;
  phaseClock = 0; missionNotes = {};
  phaseEvents = plan.events ? plan.events.map(ev => Object.assign({ _fired: false }, ev)) : null;
  applySpawnRequests(plan.spawnRequests, mission, wave);
  const b = plan.banners;
  announceObjective(b);
  if (b.missionStart && b.missionCard && !missionTypeSeen(b.missionCard)) showMissionCard(b.missionCard, missionCardBlurbKey());
  sayLines(plan.say);
}

// callout + objective banner for a new objective; held until the launch title card clears so the two
// never stack (a phase that already ended by then stays silent — its successor announces itself)
function announceObjective(b, lead) {
  const m = mission;
  const go = () => {
    if (mission !== m) return;
    if (lead) lead();
    if (b.callout) fireObjectiveCallout(objectiveText(m), b.callout.phase, b.callout.total);
    else if (b.objective) showBanner(objectiveText(m));
  };
  afterMissionIntro(go);
}

// turn the pure spawnRequests descriptors into real entities/props. Ordered props -> strikeSite ->
// air budget. This is the ONLY place a phase's budget touches createEnemy / pendingSpawns / queueStrikeSite.
function applySpawnRequests(reqs, m, wave) {
  for (let i = 0; i < reqs.length; i++) {
    const r = reqs[i];
    if (r.kind === 'props') spawnMissionProps(r.verb, m, wave);
    else if (r.kind === 'strikeSite') { queueStrikeSite(wave, r.size); }
    else if (r.kind === 'fighters') {
      if (r.raid) { for (let k = 0; k < r.n; k++) pendingSpawns.push(spawnRaider); }
      else queueFighterWave(r.n);
    }
    else if (r.kind === 'aces') { for (let k = 0; k < r.n; k++) pendingSpawns.push(spawnAce); }
    else if (r.kind === 'hostileAce') pendingSpawns.push(spawnHostileAce);
    else if (r.kind === 'bombers') {
      for (let k = 0; k < r.n; k++) pendingSpawns.push(r.raid ? spawnRaidBomber : (r.verb === 'intercept' ? spawnInterceptTarget : spawnBomber));
      if (r.verb === 'intercept') pendingSpawns.push(() => { if (mission === m) m.params.spawnedAll = true; });   // arm the early "bomber escaped" fail only once every target is airborne
    }
    else if (r.kind === 'drones') { const n = r.n; pendingSpawns.push(() => spawnDroneSwarm(n)); }
    else if (r.kind === 'boss') {
      pendingSpawns.push(() => {
        const lvl = currentCampaignLevel();
        campaignBossPhases = (lvl && lvl.boss && lvl.boss.phases) || null;
        if (lvl && lvl.boss) spawnCampaignBoss(lvl);
        else spawnBoss();
        if (lvl && lvl.boss && lvl.boss.introKey) radioKey('boss', lvl.boss.introKey);
      });
    }
  }
}
function spawnRaider() {
  const tgt = pickRaidTarget(player.group.position);
  const e = createEnemy('fighter', raidSpawnPos(tgt));
  e.raid = tgt; e.raidMode = 'inbound';
  if (tgt) { dirToQuat(t1.copy(tgt.group.position).sub(e.group.position).normalize(), e.logicQuat); e.group.quaternion.copy(e.logicQuat); }
  if (!missionNotes._raidCall) { missionNotes._raidCall = true; radioKey('ovl', tgt && tgt.kind === 'outpost' ? 'comms.gen.raidersOutpost' : 'comms.gen.raidersConvoy'); }
  return e;
}
function spawnRaidBomber() {
  const tgt = pickRaidTarget(player.group.position);
  const pos = raidSpawnPos(tgt); pos.y = clamp(pos.y + 300, 900, 4200);
  const e = createEnemy('bomber', pos);
  e.speed = 165; e.turnRate = 0.5; e.spawnPos = pos.clone();
  e.raid = tgt; e.raidBomber = true;
  e.escapeDir = new THREE.Vector3().copy(tgt ? tgt.group.position : player.group.position).sub(pos); e.escapeDir.y = 0; e.escapeDir.normalize();
  dirToQuat(e.escapeDir, e.logicQuat); e.group.quaternion.copy(e.logicQuat);
  e.marker.material.color.setHex(0xffb060);
  showBanner(t('banner.bomberRun'));
  radioKey('ovl', 'comms.gen.bomberRun');
  return e;
}

function spawnMissionProps(verb, m, wave) {
  if (verb === 'escort') spawnEscortConvoy(m, wave);
  else if (verb === 'defend') spawnDefendAsset(m, wave);
  else if (verb === 'recon') spawnReconWaypoints(m, wave);
  else if (verb === 'stealth') spawnStealthExtraction(m, wave);
}

function spawnEscortConvoy(m, wave) {
  const air = m.params.escortKind === 'transport';
  const p = player.group.position;
  const fwd = fwdOf(player.group, t1); const fl = Math.hypot(fwd.x, fwd.z) || 1;
  const fx = fwd.x / fl, fz = fwd.z / fl;
  const lead = air ? 900 : 1400, legLen = air ? 2400 : 1700;
  const pick = (x, z, r) => air ? { x: x + rand(-r, r), z: z + rand(-r, r) } : (landPoint(x, z, 0, r) || { x, z });
  const start = pick(p.x + fx * lead, p.z + fz * lead, air ? 200 : 700);
  const route = [];
  let cx = start.x, cz = start.z, hx = fx, hz = fz;
  for (let leg = 0; leg < 3; leg++) {
    const turn = rand(-0.7, 0.7); const c = Math.cos(turn), s = Math.sin(turn);
    const nx = hx * c - hz * s, nz = hx * s + hz * c; hx = nx; hz = nz;
    const pt = pick(cx + hx * legLen, cz + hz * legLen, 450);
    route.push(pt); cx = pt.x; cz = pt.z;
  }
  const dest = route[route.length - 1];
  m.params.dest = { x: dest.x, y: allyGroundY(dest.x, dest.z) + (air ? ALLY_AIR_AGL : 120), z: dest.z };
  m.params.route = route;
  const n = m.params.convoy, speed = air ? 105 : 52;
  const name = m.params.allyLabel;
  for (let k = 0; k < n; k++) {
    pendingSpawns.push(() => {
      const back = k * (air ? 160 : 70);
      const label = name ? (n > 1 ? t('ally.name.' + name) + ' ' + (k + 1) : t('ally.name.' + name)) : tf('ally.truck', { n: k + 1 });
      const a = spawnAlly(air ? 'transport' : 'truck', start.x - fx * back + (air ? k * 60 : 0), start.z - fz * back, { route, speed, label });
      a.group.rotation.y = Math.atan2(-fx, -fz);
      if (k === n - 1) m.params.spawnedAll = true;
    });
  }
}

function spawnDefendAsset(m, wave) {
  const p = player.group.position;
  const fwd = fwdOf(player.group, t1); const fl = Math.hypot(fwd.x, fwd.z) || 1;
  const ship = m.params.assetKind === 'ship';
  const cx = p.x + fwd.x / fl * 1900, cz = p.z + fwd.z / fl * 1900;
  const c = ship ? (seaPoint(cx, cz) || { x: cx, z: cz }) : (landPoint(cx, cz, 0, 900) || { x: p.x, z: p.z - 1900 });
  const label = m.params.allyLabel ? t('ally.name.' + m.params.allyLabel) : t(ship ? 'ally.ship' : 'ally.outpost');
  const a = spawnAlly(ship ? 'ship' : 'outpost', c.x, c.z, { hp: m.params.assetMaxHp, label });
  if (ship) a.group.rotation.y = rand(0, TWO_PI);
  m.params._asset = a;
}
function seaPoint(cx, cz) {
  for (let r = 0; r <= 6000; r += 400) {
    for (let i = 0; i < 16; i++) {
      const ang = i / 16 * TWO_PI, x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
      if (terrainH(x, z) < SEA_LEVEL_Y - 60 && terrainH(x + 200, z) < SEA_LEVEL_Y - 30 && terrainH(x, z + 200) < SEA_LEVEL_Y - 30) return { x, z };
    }
  }
  return null;
}

function spawnReconWaypoints(m, wave) {
  const p = player.group.position;
  const start = rand(0, TWO_PI);
  const wps = [];
  for (let k = 0; k < m.params.count; k++) {
    const ang = start + (k / m.params.count) * TWO_PI + rand(-0.25, 0.25);
    const r = rand(1800, 3600);
    wps.push({ x: p.x + Math.cos(ang) * r, y: clamp(p.y + rand(-300, 500), 400, 2400), z: p.z + Math.sin(ang) * r, hit: false });
  }
  m.params.waypoints = wps;
}

function spawnStealthExtraction(m, wave) {
  stealthExtraSpawns = 0;
  const p = player.group.position;
  const ang = rand(0, TWO_PI), r = rand(4200, 5200);
  const ex = p.x + Math.cos(ang) * r, ez = p.z + Math.sin(ang) * r;
  m.params.waypoints = [{ x: ex, y: clamp(p.y + rand(-200, 400), 400, 2400), z: ez, hit: false }];
  const dx = (ex - p.x) / r, dz = (ez - p.z) / r;
  const nx = -dz, nz = dx;
  const CORRIDOR = 950;
  const placeRing = (along, side, ringR, lateralPad, build) => {
    const lateral = CORRIDOR + ringR + lateralPad;
    const cx = p.x + dx * r * along + nx * side * lateral;
    const cz = p.z + dz * r * along + nz * side * lateral;
    pendingSpawns.push(() => build(cx, cz, ringR));
  };
  const nGround = 2 + (wave > 1 ? 1 : 0);
  for (let i = 0; i < nGround; i++) {
    const ringR = rand(720, 980);
    placeRing((i + 1) / (nGround + 1), (i % 2 ? 1 : -1), ringR, rand(140, 380), (cx, cz, rr) => {
      const e = spawnGroundAt(i === 0 ? 'radar' : 'sam', cx, cz);
      e.stealthThreat = true; e.detectR = rr; e.aggressive = false;
      run.spawned = Math.max(0, (run.spawned || 0) - 1);
      if (e.marker) e.marker.material.color.setHex(0xffa23a);
    });
  }
  for (let i = 0; i < 2; i++) {
    const ringR = rand(650, 850);
    const side = (i % 2 ? 1 : -1);
    placeRing((i + 0.5) / 2, side, ringR, rand(220, 500), (cx, cz, rr) => {
      const alt = clamp(p.y + rand(-150, 250), 600, 2000);
      const e = createEnemy('fighter', new THREE.Vector3(cx, alt, cz));
      e.patrol = true; e.stealthThreat = true; e.detectR = rr; e.aggressive = false;
      run.spawned = Math.max(0, (run.spawned || 0) - 1);
      e.orbitSign = side; e.patrolAlt = alt; e.patrolSpeed = rand(260, 340);
      if (e.marker) e.marker.material.color.setHex(0xffa23a);
    });
  }
}

// v1.3: proximity to the nearest live detection ring, 0 (clear) .. 1 (ring centre). Horizontal distance
// only — altitude doesn't help you hide from radar.
function stealthProximity() {
  let prox = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive || !e.stealthThreat || !e.detectR) continue;
    const ddx = player.group.position.x - e.group.position.x;
    const ddz = player.group.position.z - e.group.position.z;
    const d = Math.hypot(ddx, ddz);
    if (d < e.detectR) { const pf = (e.detectR - d) / e.detectR; if (pf > prox) prox = pf; }
  }
  return prox;
}

// ADR-0006: blow cover = GO LOUD (not a fail). Flip every stealth threat to aggressive (patrols start
// pursuing), once. The detection meter is frozen from here (detectionDelta returns 0 when blown); the
// sortie becomes a hot escape to the extraction waypoint — only death fails it.
function blowStealthCover() {
  if (stealthBlown) return;
  stealthBlown = true;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.stealthThreat) continue;
    e.patrol = false; e.aggressive = true; e.investigating = false; e.coneLOS = 0;
    if (e.marker) e.marker.material.color.setHex(0xff4444);
  }
  showBanner(t('mission.stealth.goLoud'));
  radioKey('ovl', 'comms.gen.goLoud');
  audio.warn();
}

// A player kill during a stealth op blows cover AND spawns reinforcements — going loud escalates. The TOTAL
// extra spawns are CAPPED (STEALTH_SPAWN_CAP, ADR-0006) so the hot escape stays hard but survivable; once the
// cap is hit, kills still aggro but stop adding pressure. Called from combat.js killEnemy.
function onStealthKill(e) {
  if (!mission || mission.type !== 'stealth') return;
  blowStealthCover();
  for (let k = 0; k < 2 && stealthExtraSpawns < STEALTH_SPAWN_CAP; k++) { pendingSpawns.push(spawnFighter); stealthExtraSpawns++; }
}

function tickPhaseEvents() {
  if (!phaseEvents) return;
  for (let i = 0; i < phaseEvents.length; i++) {
    const ev = phaseEvents[i];
    if (ev._fired || phaseClock < (ev.at || 0)) continue;
    ev._fired = true;
    if (ev.spawn) {
      const reqs = budgetRequests([], ev.spawn, raidsAllies(mission && mission.type, ev.raid), 'sweep');
      // reinforcements on a SWEEP phase raise its kill target so the phase still means "clear the sky"
      if (mission && mission.type === 'sweep') mission.target += sweepKills(ev.spawn);
      applySpawnRequests(reqs, mission, wave);
    }
    sayLines(ev.say);
  }
}

const _detectIn = { blown: false, firing: false, beingAimed: false, coneLOS: 0, coneMul: 1.8, proximity: 0, dt: 0, riseRate: 0, decayRate: 0 };
function updateMission(dt) {
  if (allies.length || bombs.length) updateAllies(dt);
  if (!mission || mission.status !== 'active') return;
  if (campaignEnd) return;
  phaseClock += dt;
  tickPhaseEvents();
  if (mission.type === 'escort') {
    let enRoute = 0, delivered = 0;
    for (let i = 0; i < allies.length; i++) {
      const a = allies[i]; if (a.static) continue;
      if (a.delivered && a.alive) delivered++;
      else if (a.alive) enRoute++;
    }
    mission.params.enRoute = enRoute; mission.params.delivered = delivered;
  } else if (mission.type === 'defend') {
    const a = mission.params._asset;
    mission.params.assetHp = (a && a.alive) ? a.hp : 0;
    const hold = mission._hold || (mission._hold = mission.timer);
    if (!missionNotes.half && mission.timer <= hold / 2) { missionNotes.half = true; radioKey('ally', 'comms.gen.defendHalf'); }
    if (!missionNotes.last && mission.timer <= 15) { missionNotes.last = true; radioKey('ally', 'comms.gen.defendLast'); }
  } else if (mission.type === 'intercept') {
    let alive = 0;
    for (let i = 0; i < enemies.length; i++) if (enemies[i].alive && enemies[i]._missionTarget) alive++;
    mission.params.aliveTargets = alive;
    if (!missionNotes.t30 && mission.timer <= 30 && mission.progress < mission.target) { missionNotes.t30 = true; radioKey('ovl', 'comms.gen.intercept30'); }
  } else if (mission.type === 'strike') {
    // the site resolves when its CORE (radar/SAM/AAA) is flattened — evaluated every frame, so a fleeing
    // supply truck escaping (or a stray stealth SAM left over from an earlier phase) can never stall it.
    let core = 0;
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.alive && e.strikeSite && e.gkind !== 'truck') core++; }
    mission.params.coreLeft = core;
    if (mission.params._armed && core === 0 && mission.params.siteUp) siteFlattened();
    if (core > 0) mission.params._armed = true;
  } else if (mission.type === 'recon') {
    const r = reconProgress(mission.params.waypoints, player.group.position, mission.params.hitRadius);
    if (r.hitCount > mission.progress) audio.ping();
    mission.progress = r.hitCount;
  } else if (mission.type === 'stealth') {
    const firing = (player.firingT || 0) > 0;
    if (firing) blowStealthCover();
    let beingAimed = false, coneLOS = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!e.alive) continue;
      if (e.aimingPlayer) beingAimed = true;
      if (e.coneLOS && e.coneLOS > coneLOS) coneLOS = e.coneLOS;
    }
    const prox = stealthProximity();
    const di = _detectIn;
    di.blown = stealthBlown; di.firing = firing; di.beingAimed = beingAimed; di.coneLOS = coneLOS; di.coneMul = mission.params.coneMul;
    di.proximity = prox; di.dt = dt; di.riseRate = mission.params.riseRate; di.decayRate = mission.params.decayRate;
    const d = detectionDelta(di);
    mission.params.detect = clamp((mission.params.detect || 0) + d, 0, 1);
    if (!stealthBlown && mission.params.detect >= 1) blowStealthCover();
    mission.params._prox = prox;
    mission.params._coneLOS = coneLOS;
    const cue = stealthBlown ? 0 : Math.max(prox, coneLOS);
    mission.params._beepT = (mission.params._beepT || 0) - dt;
    if (cue > 0.35 && mission.params._beepT <= 0) {
      audio.warn();
      mission.params._beepT = 0.9 - cue * 0.6;
    }
    const rs = reconProgress(mission.params.waypoints, player.group.position, mission.params.hitRadius);
    if (rs.hitCount > (mission._wpHit || 0)) audio.ping();
    mission._wpHit = rs.hitCount;
  }
  tickMission(mission, dt);
  if (mission.status === 'won') onMissionResolved(true);
  else if (mission.status === 'failed') onMissionResolved(false, mission.failReason);
}

function siteFlattened() {
  if (!mission || mission.type !== 'strike' || !mission.params.siteUp) return;
  const pay = Math.round((60 + wave * 6) * player.rpMul);
  player.tp += pay; player.score += Math.round(1500 * player.scoreMul);
  showBanner(tf('banner.siteFlattened', { rp: pay })); audio.power(); empFlash = Math.max(empFlash, 0.4);
  mission.params.siteUp = false;
}

function onMissionResolved(won, reason) {
  if (won) {
    if (missionSeq) {
      const adv = advanceSequence(missionSeq);
      if (!adv.done) {
        showBanner(t('banner.objectiveComplete')); audio.power(); empFlash = Math.max(empFlash, 0.3);
        clearMissionLeftovers();        // sweep leftover air + props so the next phase starts on a clean field
        missionSeq = adv.seq;
        startMissionPhase(missionSeq, wave, false);   // sets `mission` active again -> handleWaves stays blocked
        return;
      }
    }
    run.missions = (run.missions || 0) + 1;
    showBanner(t('banner.missionComplete'));
    missionSeq = null; phaseEvents = null;
    audio.power(); empFlash = Math.max(empFlash, 0.35);
    const bonus = Math.round((40 + wave * 4) * player.rpMul);
    player.tp += bonus; player.score += Math.round(1200 * player.scoreMul);
    clearMissionLeftovers();
  } else {
    missionSeq = null; phaseEvents = null;
    if (campaignMode) { beginCampaignEnd('fail', reason || 'objective'); return; }
    showBanner(t('banner.missionFailedObj'));
    audio.warn();
    gameOver();
  }
}

function clearMissionLeftovers() {
  const strikeLive = mission && mission.type === 'strike' && mission.status === 'active';
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    if (e.type === 'ground' && e.strikeSite && strikeLive) continue;
    e.alive = false; despawnEnemy(e); clearLocks(e);
  }
  pendingSpawns.length = 0;
  clearAllies();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MISSIONS, MISSION_TYPES, missionForSector, startMission, missionKill, tickMission,
    missionSequence, sequenceDescriptor, advanceSequence, phaseClearTarget, planPhase, planObjective,
  };
}
