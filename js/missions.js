/* SKYSTRIKE — missions.js: typed-mission state machine. Loaded after opmap.js, before combat.js.
   main.js nextWave hands a level plan to startSectorMission, which walks the level's objective phases
   (spawning what each needs); updateMission() ticks the live phase each frame and resolves win/fail.

   The file is split into two VISIBLY separated halves:
   • PURE HALF (require-safe, CommonJS-exported): the mission state machine, the multi-phase objective
     SEQUENCE walker (the cursor lives INSIDE a sequence value — no module-level cursor globals), ONE
     shared phase/budget clamp rule, and the pure objective PLANNERS that return PLAIN DATA
     ({mission, spawnRequests, banners}) instead of calling THREE / createEnemy inline. Fully
     exercisable in Node (tests/missions.test.js, tests/mission-sequence.test.js require the REAL impl).
   • BROWSER GLUE HALF (not exported): startSectorMission / startMissionPhase / updateMission /
     onMissionResolved apply that data — THREE math, createEnemy / prop spawns, banners, callouts.
     ALL THREE / createEnemy / DOM usage lives ONLY here, inside functions (never at load). */

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
      'detectionDelta', 'reconWon', 'stealthWon', 'stealthFailed', 'escortOutcome', 'interceptDoomed'].forEach(function (k) {
      if (typeof globalThis[k] === 'undefined' && _core[k]) globalThis[k] = _core[k];
    });
  } catch (e) { /* core.js not resolvable — pure fns needing it simply won't run in this env */ }
}

/* ========================= PURE HALF (require-safe; exported via footer) ========================= */

// ---- mission state machine ----
// recon + stealth (2026-06) are the first NON-combat verbs: fly waypoints / sneak to extraction.
const MISSION_TYPES = ['sweep', 'intercept', 'escort', 'defend', 'strike', 'recon', 'stealth', 'boss'];

// op-map sector type -> mission type. Pure + deterministic.
// ESCORT/DEFEND are first-class objective sectors; ELITE is a no-objective elite-ace furball.
// RECON/STEALTH are non-combat objective sectors (no kills required).
function missionForSector(type) {
  if (type === 'FURBALL' || type === 'SWEEP') return 'sweep';   // SWEEP = the multi-phase dogfight verb (objectives queue)
  if (type === 'INTERCEPT') return 'intercept';
  if (type === 'STRIKE') return 'strike';
  if (type === 'ESCORT') return 'escort';
  if (type === 'DEFEND') return 'defend';
  if (type === 'RECON') return 'recon';
  if (type === 'STEALTH') return 'stealth';
  if (type === 'ELITE') return 'none';
  if (type === 'DEPOT') return 'none';
  if (type === 'FINAL' || type === 'BOSS') return 'boss';   // BOSS = the boss-arrival phase of a scripted FINAL level
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
      // campaign overhaul: a target bomber that ESCAPES used to leave the level waiting out the clock —
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
      if (m.timer < 0) { m.failReason = 'timeUp'; return 'failed'; }   // optional authored strike clock (desc.timer)
      return 'active';
    },
  },
  // RECON (non-combat): fly through N waypoints. `waypoints` is filled with positions by the
  // impure spawner in the runtime glue; updateMission hit-tests them via the pure reconProgress.
  // target = N (count); progress = waypoints hit. Generous soft timer so it can't stall a sector.
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
  // BOSS (campaign overhaul): the boss-arrival phase of a scripted FINAL level. Won when the operation's
  // boss (or the nemesis standing in for it) goes down — so a boss clear finally counts as the objective.
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

/* ---------------- multi-phase objective SEQUENCE walker (pure) ----------------
   A multi-phase Operations level (opmap.js) carries an authored `objectives` queue walked phase by
   phase: phase 0 starts at sector launch and each 'won' advances to the next, completing the level
   only after the LAST phase. The SEQUENCE VALUE folds the queue together with its cursor — the glue
   holds ONE `missionSeq` value and derives the cursor from it. */
// build a sequence value from an authored objectives queue; null for a single-objective sector.
function missionSequence(objectives) {
  return (Array.isArray(objectives) && objectives.length) ? { phases: objectives.slice(), idx: 0 } : null;
}
// the descriptor the cursor currently points at (a phase {type,wp?,spawn?} or a bare type string).
function sequenceDescriptor(seq) { return seq ? seq.phases[seq.idx] : null; }
// advance the cursor after a phase resolves 'won'. Returns { seq, done }: done=true means the LAST
// phase just won (level complete, seq=null); otherwise seq carries the NEXT cursor. Uses core.js
// nextObjectivePhase for the queue arithmetic.
function advanceSequence(seq) {
  const next = nextObjectivePhase(seq.idx, seq.phases.length);
  if (next < 0) return { seq: null, done: true };
  return { seq: { phases: seq.phases, idx: next }, done: false };
}

/* ---------------- shared phase/budget rule (pure) ----------------
   ONE clamp used by BOTH the single-objective sector and every multi-phase phase: make a freshly
   started kill mission winnable with EXACTLY the kill-targets that will spawn. Delegates to core.js
   campaignClearTarget = min(procedural, spawnedKillCount) — the single source of truth also imported
   by tests/clear-count.test.js. null = non-kill verb / no budget -> leave mission.target as
   startMission set it. */
function phaseClearTarget(verb, wave, budget) {
  return (typeof campaignClearTarget === 'function') ? campaignClearTarget(verb, wave, budget) : null;
}

/* ---------------- objective PLANNERS (pure — return plain data the glue applies) ----------------
   A planner starts the objective's mission, applies the shared budget clamp, trims a nav leg, and
   describes the spawns + banners as PLAIN DATA. NO THREE / createEnemy / pendingSpawns / t() here —
   the glue half turns spawnRequests into real entities and banners into real callouts. spawnRequests
   are ordered so the glue reproduces the exact pendingSpawns order: props -> strikeSite -> fighters
   -> bombers. */
// plan ONE phase of a multi-phase sequence. desc = 'RECON' | {type,wp?,spawn?}. phase/total/isFirst
// drive the banner descriptors (1-based phase index, total phases, first-phase intro card).
function planPhase(desc, wave, phase, total, isFirst) {
  const d = (desc && typeof desc === 'object') ? desc : {};
  const verb = missionForSector(d === desc ? d.type : desc);   // 'RECON'/'STRIKE'/'SWEEP'/…
  const mission = startMission(verb, wave, Math.random);
  if (d.wp != null) { mission.params.count = d.wp; mission.target = d.wp; }   // trim the nav leg (RECON opener -> 2 waypoints)
  const spawn = d.spawn || null;
  const clamped = phaseClearTarget(verb, wave, spawn);   // shared budget rule (both paths)
  if (clamped !== null) mission.target = clamped;
  // a scripted SWEEP phase means "clear the WHOLE authored flight" — the procedural 4-kill cap would
  // end the phase with bandits still airborne (and then vanish them).
  if (verb === 'sweep' && spawn) mission.target = Math.max(mission.target, sweepKills(spawn));
  // authored per-phase tuning (all optional): clocks, hold time, convoy size, required deliveries
  if (d.timer != null && (verb === 'intercept' || verb === 'recon' || verb === 'strike')) { mission.timer = d.timer; if (verb === 'strike') mission.params.timed = true; }
  if (d.hold != null && verb === 'defend') mission.timer = d.hold;
  if (verb === 'intercept') mission.params.aliveTargets = mission.target;
  if (verb === 'escort') {
    if (d.convoy) { mission.params.convoy = d.convoy; mission.params.enRoute = d.convoy; mission.target = Math.max(1, d.convoy - 1); }   // a lone transport must make it; a convoy may lose one
    if (d.required) mission.target = d.required;
    mission.params.escortKind = d.escort === 'transport' ? 'transport' : 'truck'; mission.params.allyLabel = d.label || null;
  }
  if (verb === 'defend') { mission.params.assetKind = d.asset === 'ship' ? 'ship' : 'outpost'; mission.params.allyLabel = d.label || null; }
  const spawnRequests = [{ kind: 'props', verb: verb }];   // escort/defend/recon/stealth props (glue no-ops for other verbs)
  if (verb === 'strike') spawnRequests.push(d.site ? { kind: 'strikeSite', size: d.site } : { kind: 'strikeSite' });   // ground target this phase
  // per-phase combat budget (designer hints): air targets for sweep/intercept; air threat for escort/defend
  if (spawn) budgetRequests(spawnRequests, spawn, raidsAllies(verb, d.raid), verb);
  if (verb === 'boss') spawnRequests.push({ kind: 'boss' });
  return {
    verb: verb,
    mission: mission,
    spawnRequests: spawnRequests,
    say: Array.isArray(d.say) ? d.say : null,          // radio lines on phase start ([[speaker, key], …])
    events: Array.isArray(d.events) ? d.events : null, // timed mid-phase reinforcements/beats [{at, spawn?, say?, raid?}]
    banners: {
      callout: { phase: phase, total: total },   // Req D: big center callout on EVERY phase transition
      missionStart: !!isFirst,                    // level's first phase leads with the objective header
      missionCard: isFirst ? verb : null,         // §2 intro card on the first phase
      objective: true,                            // persistent objective banner
    },
  };
}
// plan a single-objective sector (no `objectives` queue). `budget` = the level's spawn plan (main.js
// owns the level's air/ground budget, so only props spawn here).
function planObjective(verb, wave, budget) {
  const mission = startMission(verb, wave, Math.random);
  const clamped = phaseClearTarget(verb, wave, budget);   // SAME shared budget rule
  if (clamped !== null) mission.target = clamped;
  return {
    verb: verb,
    mission: mission,
    spawnRequests: [{ kind: 'props', verb: verb }],
    banners: {
      callout: { phase: 1, total: 1 },
      objective: true,
      missionCard: verb,              // §2 intro card
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
// escort/defend air budgets hunt the allies unless the row opts out (raid:false); other verbs only on raid:true
function raidsAllies(verb, flag) { return (verb === 'escort' || verb === 'defend') ? flag !== false : !!flag; }
// kill targets a spawn block puts in the air for a SWEEP (aces + the hostile ace count too)
function sweepKills(spawn) { return (spawn.fighters || 0) + (spawn.aces || 0) + (spawn.hostileAce ? 1 : 0); }

/* ========================= BROWSER GLUE HALF (browser only; not exported) ========================= */

let mission = null;          // active mission state, or null (observable — hud.js/combat.js/main.js read it)
let missionSeq = null;       // multi-phase objective SEQUENCE value {phases, idx} (or null; internal to this file)
let phaseClock = 0;          // seconds since the current phase started (drives authored timed events)
let phaseEvents = null;      // this phase's authored timed events [{at, spawn?, say?, raid?, _fired}]
let missionNotes = {};       // one-shot radio-cue latches for the current phase (defend "halfway", intercept "30s", …)

/* ---------------- ALLIES (campaign overhaul) ----------------
   Friendly mission units — the escort convoy and the defended outpost — live HERE, never in `enemies`.
   That one move is what makes them friendly everywhere at once: the player can't lock / shoot / missile
   them, AWACS strikes and wingmen ignore them, the HUD draws them green, and no "hostile escaped"
   despawn can ever fail an escort because the player flew away. Enemy RAIDERS (e.raid → an ally) fly
   attack runs on them (entities.js updateRaider / updateBomber) and hurt them via damageAlly(). */
let allies = [];
let bombs = [];   // falling bombs released by raiding bombers → impact damage on allies
const ALLY_GREEN = 0x46ff8c;

// the surface an ally sits on: land, or the sea plane for a ship / a truck that strays onto the shelf
function allyGroundY(x, z) { return Math.max(terrainH(x, z), surfaceH(x, z), SEA_LEVEL_Y); }
const ALLY_AIR_AGL = 520;   // escorted transports cruise this high over the terrain — low + slow, a raider's dream
// a coalition frigate (DEFEND at sea): grey hull + superstructure + mast beacon
function buildShip() {
  const g = new THREE.Group();
  const hullM = new THREE.MeshStandardMaterial({ color: 0x5d6770, flatShading: true, roughness: 0.8 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 120), hullM); hull.position.y = 4; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(11, 26, 4), hullM); bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 4, -72); g.add(bow);
  const sup = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 34), new THREE.MeshStandardMaterial({ color: 0x7a848c, flatShading: true })); sup.position.set(0, 18, 8); g.add(sup);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 22, 6), hullM); mast.position.set(0, 36, 4); g.add(mast);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 6, 2.5, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x9aa6ae, side: THREE.DoubleSide, flatShading: true }));
  dish.position.set(0, 48, 4); dish.rotation.z = Math.PI / 3; g.add(dish); g.userData.dish = dish;
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: ALLY_GREEN, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
  beacon.scale.setScalar(22); beacon.position.set(0, 52, 4); g.add(beacon); g.userData.beacon = beacon;
  markShadowCasters(g);
  return g;
}
// an escorted transport (medevac / SAR / friendly bomber wing): the heavy airframe in allied colours
function buildTransport() {
  const g = buildJetOrGLTF(0x8f9c94, 0x46ff8c, SHAPES.BOMBER, true, {});
  if (!g.userData.gltf) g.scale.setScalar(1.7);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: ALLY_GREEN, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
  beacon.scale.setScalar(18); beacon.position.set(0, 9, 6); g.add(beacon); g.userData.beacon = beacon;
  return g;
}
function friendlyMarker() {
  const m = makeMarker('fighter');
  m.material.color.setHex(ALLY_GREEN);
  scene.add(m);
  return m;
}
// a small airbase/radar compound — the thing a DEFEND phase protects (bigger + more legible than one dish)
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
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: ALLY_GREEN, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
  beacon.scale.setScalar(26); beacon.position.set(-28, 40, -10); g.add(beacon);
  g.userData.beacon = beacon;
  markShadowCasters(g);
  return g;
}
// friendly supply truck: the enemy truck mesh repainted in allied olive-green + a green roof beacon
function buildFriendlyTruck() {
  const g = buildTruck();
  g.children.forEach(c => { if (c.material && c.material.color) { c.material.color.setHex(0x4f6a3a); c.material.emissive = new THREE.Color(0x0c2a10); c.material.emissiveIntensity = 0.6; } });
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: ALLY_GREEN, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
  beacon.scale.setScalar(14); beacon.position.set(0, 10, 0); g.add(beacon);
  g.userData.beacon = beacon;
  g.scale.setScalar(1.6);
  return g;
}
function spawnAlly(kind, x, z, opts) {
  opts = opts || {};
  const mesh = kind === 'outpost' ? buildOutpost() : kind === 'ship' ? buildShip() : kind === 'transport' ? buildTransport() : buildFriendlyTruck();
  mesh.position.set(x, allyGroundY(x, z) + (kind === 'transport' ? ALLY_AIR_AGL : 0), z);
  scene.add(mesh);
  const a = {
    kind: kind, group: mesh, alive: true, friendly: true, air: kind === 'transport', static: kind === 'outpost' || kind === 'ship',
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
    if (a.static) radioKeySafe('ally', a.hp / a.maxHp < 0.35 ? 'comms.gen.assetCritical' : 'comms.gen.assetHit', { hp: Math.ceil(a.hp / a.maxHp * 100) });
    else radioKeySafe('ally', a.air ? (a.hp / a.maxHp < 0.4 ? 'comms.gen.transportCritical' : 'comms.gen.transportHit') : 'comms.gen.convoyHit');
  }
  if (a.static && a.hp / a.maxHp < 0.5 && !a._halfLoss) { a._halfLoss = true; if (run) run.allyLosses = (run.allyLosses || 0) + 1; }   // a crippled asset costs the no-losses star
  a.lastHitT = now;
  if (a.hp <= 0) destroyAlly(a);
}
function destroyAlly(a) {
  if (!a.alive) return;
  a.alive = false;
  explode(a.group.position.clone().setY(a.group.position.y + 6), true);
  if (a.air) for (let k = 0; k < 4; k++) spawnSmoke(a.group.position, 0x1a1c20, 2.4);
  if (run && !a.static) run.allyLosses = (run.allyLosses || 0) + 1;
  scene.remove(a.group); disposeGroup(a.group);
  if (a.marker) scene.remove(a.marker);
  if (a.static) radioKeySafe('ally', 'comms.gen.assetLost');
  else {
    const left = allies.filter(o => o.alive && !o.static && !o.delivered).length;
    radioKeySafe(a.air ? 'ovl' : 'ally', a.air ? 'comms.gen.transportLost' : 'comms.gen.convoyLost', { n: left });
    showBanner(t(a.air ? 'banner.transportLost' : 'banner.convoyTruckLost'));
  }
  if (typeof audio !== 'undefined' && audio.warn) audio.warn();
}
function clearAllies() {
  for (let i = 0; i < allies.length; i++) {
    const a = allies[i];
    if (a.group) { scene.remove(a.group); disposeGroup(a.group); }
    if (a.marker) scene.remove(a.marker);
  }
  allies.length = 0;
  for (let i = 0; i < bombs.length; i++) { scene.remove(bombs[i].mesh); }
  bombs.length = 0;
}
// the ally a raider should hit next: the nearest living, still-in-play one
function pickRaidTarget(from) {   // (outpost/ship/truck/transport alike — whichever is closest and still in play)
  let best = null, bd = Infinity;
  for (let i = 0; i < allies.length; i++) {
    const a = allies[i]; if (!a.alive || a.delivered) continue;
    const d = from.distanceToSquared(a.group.position);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
const _convoyIn = { x: 0, z: 0, leg: 0 };   // reused convoyStep input (read, never retained)
function updateAllies(dt) {
  for (let i = 0; i < allies.length; i++) {
    const a = allies[i]; if (!a.alive) continue;
    const pos = a.group.position;
    if (a.route && !a.delivered) {
      _convoyIn.x = pos.x; _convoyIn.z = pos.z; _convoyIn.leg = a.leg;
      const st = convoyStep(_convoyIn, a.route, a.speed, dt);
      pos.x = st.x; pos.z = st.z; a.leg = st.leg;
      a.group.rotation.y = Math.atan2(-st.dirX, -st.dirZ);   // nose (−Z) along the route
      if (st.done) {
        a.delivered = true;
        radioKeySafe('ally', 'comms.gen.delivered', { n: allies.filter(o => o.delivered).length });
        if (typeof audio !== 'undefined' && audio.ping) audio.ping();
      }
    }
    if (a.air) { const want = allyGroundY(pos.x, pos.z) + ALLY_AIR_AGL; pos.y += clamp(want - pos.y, -90 * dt, 90 * dt); if (a.group.userData.engines) animEngines(a.group, 0.6); }
    else pos.y = allyGroundY(pos.x, pos.z) + (a.kind === 'ship' ? 2 : 0);
    if (a.group.userData.dish) a.group.userData.dish.rotation.y += dt * 1.2;
    if (a.group.userData.beacon) a.group.userData.beacon.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(performance.now() / 380 + i));
    // damaged units trail smoke (heavier the worse it is) — readable from the air at a glance
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
  // bombs released by raiding bombers: fall, then burst on whatever ally is under them
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
// a raiding bomber releases a stick of bombs over its target (called from entities.js updateBomber)
function dropBombs(e, target) {
  if (!target || target.air) return;   // bombs are for surface targets; an escorted airframe is the fighters' job
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
  radioKeySafe('enemy', 'comms.gen.bombsAway');
  if (typeof audio !== 'undefined' && audio.missile) audio.missile();
}

// pick a spot on LAND (terrain above the waterline) near (cx,cz); falls back to the best sample tried
function landPoint(cx, cz, rMin, rMax, tries) {
  let best = null, bestH = -Infinity;
  for (let i = 0; i < (tries || 28); i++) {
    const ang = rand(0, TWO_PI), r = rand(rMin, rMax);
    const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
    const h = terrainH(x, z);
    const slope = Math.abs(terrainH(x + 40, z) - h) + Math.abs(terrainH(x, z + 40) - h);
    if (h > 25 && h < 700 && slope < 60) return { x: x, z: z };
    if (h > bestH) { bestH = h; best = { x: x, z: z }; }
  }
  return best;
}
// where raiders ingress from: out on a ring around their target, off to one side of the player's approach
function raidSpawnPos(target) {
  const c = target ? target.group.position : player.group.position;
  const ang = rand(0, TWO_PI), r = rand(3400, 4400);
  const x = c.x + Math.cos(ang) * r, z = c.z + Math.sin(ang) * r;
  const gy = Math.max(terrainH(x, z), SEA_LEVEL_Y);
  return new THREE.Vector3(x, clamp(Math.max(c.y, gy) + rand(500, 1000), gy + 500, 4200), z);
}

// objective readout for the HUD/banner; localized. timer mm:ss for timed types.
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
    // ADR-0006: once blown the meter is irrelevant — read it as a hot escape to the extraction point.
    if (typeof stealthBlown !== 'undefined' && stealthBlown) return t('mission.stealth') + ' — ' + t('mission.stealth.escape');
    const det = Math.round(((m.params.detect || 0)) * 100);
    const tag = det >= 60 ? t('mission.stealth.spotted') : t('mission.stealth.undetected');
    return t('mission.stealth') + ' — ' + tag + ' ' + det + '%';
  }
  return '';
}
function fmtClock(sec) { sec = Math.ceil(sec); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }

// localized name shown in the start-of-sector objective banner
function missionName(type) { return t('mission.name.' + type) !== 'mission.name.' + type ? t('mission.name.' + type) : ''; }

// §2 mission-card lore-blurb key for the level currently being flown (campaign only; null elsewhere).
function missionCardBlurbKey() {
  if (typeof currentCampaignLevel !== 'function' || typeof levelBlurbKey !== 'function') return null;
  return levelBlurbKey(currentCampaignLevel());
}
function missionTypeSeen(verb) { try { return !!store.get('skystrike_seenMissionType_' + verb); } catch (e) { return true; } }
// speak an authored [[speaker, key], …] list (comms keys are relative: 'firstLight.p1' → 'comms.firstLight.p1')
function sayLines(lines) {
  if (!lines) return;
  for (let i = 0; i < lines.length; i++) { const l = lines[i]; if (l && l[1]) radioKeySafe(l[0], 'comms.' + l[1]); }
}
// radioKey is owned by ui-hud.js (comms panel); guard so the Node-side / headless callers never trip on it
function radioKeySafe(who, key, vars) { if (typeof radioKey === 'function') radioKey(who, key, vars); }

/* ---------------- sector start ----------------
   Called from nextWave() (main.js) for campaign levels. A level's `objectives` queue is walked as a
   multi-phase SEQUENCE (startMissionPhase); a level without one runs its single typed mission. */
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
  if (b.missionCard && typeof showMissionCard === 'function') showMissionCard(b.missionCard, missionCardBlurbKey());
}

/* ---------------- multi-phase objective walker (glue) ----------------
   Applies the pure planPhase() data for the phase the sequence cursor points at: publishes `mission`,
   fulfils the spawnRequests, fires the banners/callout + the phase's authored radio lines, and arms
   its timed events. */
function startMissionPhase(seq, wave, isFirst) {
  const plan = planPhase(sequenceDescriptor(seq), wave, seq.idx + 1, seq.phases.length, isFirst);
  mission = plan.mission;   // publish the observable global
  phaseClock = 0; missionNotes = {};
  phaseEvents = plan.events ? plan.events.map(ev => Object.assign({ _fired: false }, ev)) : null;
  applySpawnRequests(plan.spawnRequests, mission, wave);
  const b = plan.banners;
  announceObjective(b);
  // teach a mission type the FIRST time it's ever flown (interactive card); after that the title card, the radio
  // and the objective callout carry it — the old 5s repeat card just blocked the view at every launch
  if (b.missionStart && b.missionCard && typeof showMissionCard === 'function' && !missionTypeSeen(b.missionCard)) showMissionCard(b.missionCard, missionCardBlurbKey());
  sayLines(plan.say);
}

// callout + objective banner for a new objective; held until the launch title card clears so the two
// never stack (a phase that already ended by then stays silent — its successor announces itself)
function announceObjective(b, lead) {
  const m = mission;
  const go = () => {
    if (mission !== m) return;
    if (lead) lead();
    if (b.callout && typeof fireObjectiveCallout === 'function') fireObjectiveCallout(objectiveText(m), b.callout.phase, b.callout.total);
    else if (b.objective) showBanner(objectiveText(m));   // the callout already carries the objective text
  };
  if (typeof afterMissionIntro === 'function') afterMissionIntro(go); else go();
}

// turn the pure spawnRequests descriptors into real entities/props. Ordered props -> strikeSite ->
// air budget. This is the ONLY place a phase's budget touches createEnemy / pendingSpawns / queueStrikeSite.
function applySpawnRequests(reqs, m, wave) {
  for (let i = 0; i < reqs.length; i++) {
    const r = reqs[i];
    if (r.kind === 'props') spawnMissionProps(r.verb, m, wave);
    else if (r.kind === 'strikeSite') { if (typeof queueStrikeSite === 'function') queueStrikeSite(wave, r.size); }
    else if (r.kind === 'fighters') {
      if (r.raid) { for (let k = 0; k < r.n; k++) pendingSpawns.push(spawnRaider); }
      else if (typeof queueFighterWave === 'function') queueFighterWave(r.n);
      else for (let k = 0; k < r.n; k++) pendingSpawns.push(spawnFighter);
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
        // the operation's named ace ALWAYS flies the boss beat (the old path swapped in the Endless nemesis
        // whenever the rival system was on — so WARLORD/GLACIER/… never actually appeared)
        if (lvl && lvl.boss && typeof spawnCampaignBoss === 'function') spawnCampaignBoss(lvl);
        else spawnBoss();
        if (lvl && lvl.boss && lvl.boss.introKey) radioKeySafe('boss', lvl.boss.introKey);
      });
    }
  }
}
// raider = a fighter that ingresses on an ally and flies attack runs on it until the player engages it
function spawnRaider() {
  const tgt = pickRaidTarget(player.group.position);
  const e = createEnemy('fighter', raidSpawnPos(tgt));
  e.raid = tgt; e.raidMode = 'inbound';
  if (tgt) { dirToQuat(t1.copy(tgt.group.position).sub(e.group.position).normalize(), e.logicQuat); e.group.quaternion.copy(e.logicQuat); }
  if (!missionNotes._raidCall) { missionNotes._raidCall = true; radioKeySafe('ovl', tgt && tgt.kind === 'outpost' ? 'comms.gen.raidersOutpost' : 'comms.gen.raidersConvoy'); }
  return e;
}
// raid bomber = a heavy that flies straight at an ally and releases a bomb stick over it (must die first)
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
  radioKeySafe('ovl', 'comms.gen.bomberRun');
  return e;
}

// spawn the objective-specific PROPS for a mission verb (recon waypoints / stealth extraction /
// escort convoy / defend outpost). Shared by the single-objective path and the multi-phase walker.
function spawnMissionProps(verb, m, wave) {
  if (verb === 'escort') spawnEscortConvoy(m, wave);
  else if (verb === 'defend') spawnDefendAsset(m, wave);
  else if (verb === 'recon') spawnReconWaypoints(m, wave);
  else if (verb === 'stealth') spawnStealthExtraction(m, wave);
}

// escort: a friendly convoy on a 3-leg LAND route out ahead of the player, ending at a safe zone. The
// convoy is in `allies` (friendly everywhere); the destination is published as the mission waypoint so
// the HUD marks it. ~80–100s of driving — long enough for 2–3 raid beats.
function spawnEscortConvoy(m, wave) {
  const air = m.params.escortKind === 'transport';
  const p = player.group.position;
  const fwd = fwdOf(player.group, t1); const fl = Math.hypot(fwd.x, fwd.z) || 1;
  const fx = fwd.x / fl, fz = fwd.z / fl;
  const lead = air ? 900 : 1400, legLen = air ? 2400 : 1700;
  const pick = (x, z, r) => air ? { x: x + rand(-r, r), z: z + rand(-r, r) } : (landPoint(x, z, 0, r) || { x: x, z: z });
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
      const back = k * (air ? 160 : 70);   // single file, nose to tail (transports fly a loose trail)
      const label = name ? (n > 1 ? t('ally.name.' + name) + ' ' + (k + 1) : t('ally.name.' + name)) : tf('ally.truck', { n: k + 1 });
      const a = spawnAlly(air ? 'transport' : 'truck', start.x - fx * back + (air ? k * 60 : 0), start.z - fz * back, { route: route, speed: speed, label: label });
      a.group.rotation.y = Math.atan2(-fx, -fz);
      if (k === n - 1) m.params.spawnedAll = true;   // whole convoy under way: arm the delivery/fail check
    });
  }
}

// defend: an allied outpost (radar + hangars) on land ahead of the player. Its hp is a 0..100 integrity;
// only real raider gun runs / bomb sticks hurt it (no more ambient "enemies nearby" drain).
function spawnDefendAsset(m, wave) {
  const p = player.group.position;
  const fwd = fwdOf(player.group, t1); const fl = Math.hypot(fwd.x, fwd.z) || 1;
  const ship = m.params.assetKind === 'ship';
  const cx = p.x + fwd.x / fl * 1900, cz = p.z + fwd.z / fl * 1900;
  const c = ship ? (seaPoint(cx, cz) || { x: cx, z: cz }) : (landPoint(cx, cz, 0, 900) || { x: p.x, z: p.z - 1900 });
  const label = m.params.allyLabel ? t('ally.name.' + m.params.allyLabel) : t(ship ? 'ally.ship' : 'ally.outpost');
  const a = spawnAlly(ship ? 'ship' : 'outpost', c.x, c.z, { hp: m.params.assetMaxHp, label: label });
  if (ship) a.group.rotation.y = rand(0, TWO_PI);
  m.params._asset = a;
}
// nearest open water to (cx,cz) for a ship — spirals outward so the frigate never parks on a beach
function seaPoint(cx, cz) {
  for (let r = 0; r <= 6000; r += 400) {
    for (let i = 0; i < 16; i++) {
      const ang = i / 16 * TWO_PI, x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
      if (terrainH(x, z) < SEA_LEVEL_Y - 60 && terrainH(x + 200, z) < SEA_LEVEL_Y - 30 && terrainH(x, z + 200) < SEA_LEVEL_Y - 30) return { x: x, z: z };
    }
  }
  return null;
}

// recon: lay N waypoints in a ring around the player's spawn at flight altitude. POSITIONING is
// impure (reads spawn pos); the hit-test is the PURE reconProgress (core.js), ticked in updateMission.
// Waypoints are plain {x,y,z,hit} so the pure primitive stays THREE-free (no Vector3).
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

// stealth: one extraction waypoint placed far out — the player must reach it undetected. Same plain
// {x,y,z,hit} shape feeding the pure waypoint primitive (1-waypoint path = the extraction goal).
// v1.3: also seeds the THREAT FIELD — static SAM/radar detection rings + non-pursuing patrol fighters,
// all pushed clear of a central CORRIDOR so there is always a flyable gap to the extraction point. Each
// threat carries `e.detectR` (its ring radius); proximity to any ring fills the detection meter
// (updateMission), and the rings are drawn on the world + radar so the safe lane is readable.
function spawnStealthExtraction(m, wave) {
  stealthExtraSpawns = 0;   // reset the go-loud reinforcement cap counter for this sortie
  const p = player.group.position;
  const ang = rand(0, TWO_PI), r = rand(4200, 5200);
  const ex = p.x + Math.cos(ang) * r, ez = p.z + Math.sin(ang) * r;
  m.params.waypoints = [{ x: ex, y: clamp(p.y + rand(-200, 400), 400, 2400), z: ez, hit: false }];
  // route frame: forward (player→extraction) + its left normal, for a guaranteed central corridor
  const dx = (ex - p.x) / r, dz = (ez - p.z) / r;
  const nx = -dz, nz = dx;
  const CORRIDOR = 950;   // half-width of the safe lane no ring may intrude on
  const placeRing = (along, side, ringR, lateralPad, build) => {
    const lateral = CORRIDOR + ringR + lateralPad;   // pushed fully outside the corridor
    const cx = p.x + dx * r * along + nx * side * lateral;
    const cz = p.z + dz * r * along + nz * side * lateral;
    pendingSpawns.push(() => build(cx, cz, ringR));
  };
  // 2–3 static ground rings (first is a RADAR, rest SAM sites)
  const nGround = 2 + (wave > 1 ? 1 : 0);
  for (let i = 0; i < nGround; i++) {
    const ringR = rand(720, 980);
    placeRing((i + 1) / (nGround + 1), (i % 2 ? 1 : -1), ringR, rand(140, 380), (cx, cz, rr) => {
      const e = spawnGroundAt(i === 0 ? 'radar' : 'sam', cx, cz);
      e.stealthThreat = true; e.detectR = rr; e.aggressive = false;
      if (run) run.spawned = Math.max(0, (run.spawned || 0) - 1);   // threat-field props aren't kill targets (kill-efficiency star)
      if (e.marker) e.marker.material.color.setHex(0xffa23a);
    });
  }
  // 2 patrol fighters orbiting posts off to the sides (moving rings, non-pursuing until cover is blown)
  for (let i = 0; i < 2; i++) {
    const ringR = rand(650, 850);
    const side = (i % 2 ? 1 : -1);
    placeRing((i + 0.5) / 2, side, ringR, rand(220, 500), (cx, cz, rr) => {
      const alt = clamp(p.y + rand(-150, 250), 600, 2000);
      const e = createEnemy('fighter', new THREE.Vector3(cx, alt, cz));
      e.patrol = true; e.stealthThreat = true; e.detectR = rr; e.aggressive = false;
      if (run) run.spawned = Math.max(0, (run.spawned || 0) - 1);
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
    if (e.marker) e.marker.material.color.setHex(0xff4444);   // hostile red now
  }
  showBanner(t('mission.stealth.goLoud'));
  radioKeySafe('ovl', 'comms.gen.goLoud');
  if (typeof audio !== 'undefined' && audio.warn) audio.warn();
}

// A player kill during a stealth op blows cover AND spawns reinforcements — going loud escalates. The TOTAL
// extra spawns are CAPPED (STEALTH_SPAWN_CAP, ADR-0006) so the hot escape stays hard but survivable; once the
// cap is hit, kills still aggro but stop adding pressure. Called from combat.js killEnemy.
function onStealthKill(e) {
  if (!mission || mission.type !== 'stealth') return;
  blowStealthCover();
  for (let k = 0; k < 2 && stealthExtraSpawns < STEALTH_SPAWN_CAP; k++) { pendingSpawns.push(spawnFighter); stealthExtraSpawns++; }
}

// fire this phase's authored timed events whose clock has come due (reinforcements + radio beats)
function tickPhaseEvents() {
  if (!phaseEvents) return;
  for (let i = 0; i < phaseEvents.length; i++) {
    const ev = phaseEvents[i];
    if (ev._fired || phaseClock < (ev.at || 0)) continue;
    ev._fired = true;
    if (ev.spawn) {
      // event bombers are never intercept targets ('sweep' → plain spawnBomber)
      const reqs = budgetRequests([], ev.spawn, raidsAllies(mission && mission.type, ev.raid), 'sweep');
      // reinforcements on a SWEEP phase raise its kill target so the phase still means "clear the sky"
      if (mission && mission.type === 'sweep') mission.target += sweepKills(ev.spawn);
      applySpawnRequests(reqs, mission, wave);
    }
    sayLines(ev.say);
  }
}

const _detectIn = { blown: false, firing: false, beingAimed: false, coneLOS: 0, coneMul: 1.8, proximity: 0, dt: 0, riseRate: 0, decayRate: 0 };   // reused detectionDelta input (read, never retained)
/* ---------------- per-frame update + resolution ----------------
   Ticked from animate() while playing. Moves the allies/bombs, fires timed events, recomputes the live
   objective state, ticks the pure machine, then resolves win/fail once (banner + sector flow). */
function updateMission(dt) {
  if (allies.length || bombs.length) updateAllies(dt);
  if (!mission || mission.status !== 'active') return;
  if (typeof campaignEnd !== 'undefined' && campaignEnd) return;   // outcome already decided — the outro is playing
  phaseClock += dt;
  tickPhaseEvents();
  if (mission.type === 'escort') {
    let enRoute = 0, delivered = 0;
    for (let i = 0; i < allies.length; i++) {
      const a = allies[i]; if (a.static) continue;   // escorted units: trucks or transports
      if (a.delivered && a.alive) delivered++;
      else if (a.alive) enRoute++;
    }
    mission.params.enRoute = enRoute; mission.params.delivered = delivered;
  } else if (mission.type === 'defend') {
    const a = mission.params._asset;
    mission.params.assetHp = (a && a.alive) ? a.hp : 0;
    const hold = mission._hold || (mission._hold = mission.timer);
    if (!missionNotes.half && mission.timer <= hold / 2) { missionNotes.half = true; radioKeySafe('ally', 'comms.gen.defendHalf'); }
    if (!missionNotes.last && mission.timer <= 15) { missionNotes.last = true; radioKeySafe('ally', 'comms.gen.defendLast'); }
  } else if (mission.type === 'intercept') {
    let alive = 0;
    for (let i = 0; i < enemies.length; i++) if (enemies[i].alive && enemies[i]._missionTarget) alive++;
    mission.params.aliveTargets = alive;
    if (!missionNotes.t30 && mission.timer <= 30 && mission.progress < mission.target) { missionNotes.t30 = true; radioKeySafe('ovl', 'comms.gen.intercept30'); }
  } else if (mission.type === 'strike') {
    // the site resolves when its CORE (radar/SAM/AAA) is flattened — evaluated every frame, so a fleeing
    // supply truck escaping (or a stray stealth SAM left over from an earlier phase) can never stall it.
    let core = 0;
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.alive && e.strikeSite && e.gkind !== 'truck') core++; }
    mission.params.coreLeft = core;
    if (mission.params._armed && core === 0 && mission.params.siteUp) siteFlattened();
    if (core > 0) mission.params._armed = true;
  } else if (mission.type === 'recon') {
    // pure hit-test against the player position; progress mirrors the waypoint hit-count
    const r = reconProgress(mission.params.waypoints, player.group.position, mission.params.hitRadius);
    if (r.hitCount > mission.progress && typeof audio !== 'undefined' && audio.ping) audio.ping();   // F1: one-shot chime the frame a waypoint checks off
    mission.progress = r.hitCount;
  } else if (mission.type === 'stealth') {
    // ADR-0006 "go loud": the meter is PRE-DETECTION PRESSURE. It rises from patrol cone-LOS (fastest),
    // proximity rings, firing, or being aimed at; decays otherwise. Reaching 1.0 TRIGGERS go-loud (NOT a fail).
    const firing = (player.firingT || 0) > 0;
    if (firing) blowStealthCover();
    let beingAimed = false, coneLOS = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!e.alive) continue;
      if (e.aimingPlayer) beingAimed = true;
      if (e.coneLOS && e.coneLOS > coneLOS) coneLOS = e.coneLOS;   // strongest patrol scan-cone LOS this frame
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
      if (typeof audio !== 'undefined' && audio.warn) audio.warn();
      mission.params._beepT = 0.9 - cue * 0.6;
    }
    const rs = reconProgress(mission.params.waypoints, player.group.position, mission.params.hitRadius);
    if (rs.hitCount > (mission._wpHit || 0) && typeof audio !== 'undefined' && audio.ping) audio.ping();
    mission._wpHit = rs.hitCount;
  }
  tickMission(mission, dt);
  if (mission.status === 'won') onMissionResolved(true);
  else if (mission.status === 'failed') onMissionResolved(false, mission.failReason);
}

// a strike site's core is down: payout + resolve (was driven only from killEnemy's "last ground unit" check,
// which a fleeing truck or a leftover stealth SAM could hold open forever)
function siteFlattened() {
  if (!mission || mission.type !== 'strike' || !mission.params.siteUp) return;
  const pay = Math.round((60 + wave * 6) * (player.rpMul || 1));
  player.tp += pay; player.score += Math.round(1500 * (player.scoreMul || 1));
  showBanner(tf('banner.siteFlattened', { rp: pay })); if (typeof audio !== 'undefined' && audio.power) audio.power(); empFlash = Math.max(empFlash, 0.4);
  mission.params.siteUp = false;
}

function onMissionResolved(won, reason) {
  if (won) {
    // multi-phase level: advance to the NEXT objective instead of ending the sector. Only the final
    // phase falls through to the sector-complete path below (advanceSequence -> done = level complete).
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
    if (typeof run !== 'undefined' && run) run.missions = (run.missions || 0) + 1;   // feeds spAward / achievement / the objective star (once per level)
    showBanner(t('banner.missionComplete'));
    missionSeq = null; phaseEvents = null;
    audio.power(); empFlash = Math.max(empFlash, 0.35);
    const bonus = Math.round((40 + wave * 4) * (player.rpMul || 1));
    player.tp += bonus; player.score += Math.round(1200 * (player.scoreMul || 1));
    // the objective win drives the level: clear lingering combat enemies + allies so handleWaves declares it clear
    clearMissionLeftovers();
  } else {
    missionSeq = null; phaseEvents = null;
    if (typeof campaignMode !== 'undefined' && campaignMode && typeof beginCampaignEnd === 'function') { beginCampaignEnd('fail', reason || 'objective'); return; }
    showBanner(t('banner.missionFailedObj'));
    audio.warn();
    if (typeof gameOver === 'function') { gameOver(); }
  }
}

// despawn leftover combat enemies (air + any stealth threat-field props) and every ally so the next phase
// (or the level-clear check) starts on a clean field. Genuine strike-site ground stays — that objective
// resolves itself — but only while a strike is still running.
function clearMissionLeftovers() {
  const strikeLive = mission && mission.type === 'strike' && mission.status === 'active';
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    if (e.type === 'ground' && e.strikeSite && strikeLive) continue;
    e.alive = false; scene.remove(e.group); disposeGroup(e.group);
    if (e.marker) scene.remove(e.marker); clearLocks(e);
  }
  pendingSpawns.length = 0;
  clearAllies();
}

/* CommonJS export for Node tests — inert in the browser. Exports the PURE half only: the state
   machine, the sequence walker, the shared budget rule, and the objective planners. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MISSIONS, MISSION_TYPES, missionForSector, startMission, missionKill, tickMission,
    missionSequence, sequenceDescriptor, advanceSequence, phaseClearTarget, planPhase, planObjective,
  };
}
