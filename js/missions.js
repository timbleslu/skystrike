/* SKYSTRIKE — missions.js: typed-mission state machine. Loaded after opmap.js, before combat.js.
   The op-map sets a sector's mission type; the wave scheduler (main.js) reads `mission` and the
   directives from startMission() to spawn what the objective needs; updateMission() ticks it each
   frame and resolves win/fail. The CORE table + helpers below are PURE (no THREE / DOM) and are
   mirrored byte-identical in tests/missions.test.js between the MIRROR markers. Runtime glue
   (banners, sector resolve) lives below the pure core. */

// ---- BEGIN MIRROR (js/missions.js) ----
// recon + stealth (2026-06) are the first NON-combat verbs: fly waypoints / sneak to extraction.
const MISSION_TYPES = ['sweep', 'intercept', 'escort', 'defend', 'strike', 'recon', 'stealth'];

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
  if (type === 'FINAL') return 'boss';
  return 'sweep';
}

const MISSIONS = {
  sweep: {
    setup: function (wave, rng) {
      const n = Math.min(4 + (wave >> 1), 10);
      return { target: n, timer: 0, params: { spawn: n } };
    },
    onKill: function (e, m) { m.progress++; },
    onTick: function (dt, m) {},
    winFail: function (m) {
      if (m.progress >= m.target) return 'won';
      return 'active';
    },
  },
  intercept: {
    setup: function (wave, rng) {
      const n = wave >= 8 ? 4 : 3;
      return { target: n, timer: 45 + wave, params: { bombers: n } };
    },
    onKill: function (e, m) { if (e && e._missionTarget) m.progress++; },
    onTick: function (dt, m) { m.timer -= dt; },
    winFail: function (m) {
      if (m.progress >= m.target) return 'won';
      if (m.timer <= 0) return 'failed';
      return 'active';
    },
  },
  escort: {
    setup: function (wave, rng) {
      const n = 4;
      // balance pass 2026-06: tighten the survivor threshold from half (lose 2 of 4) to n-1 (lose AT MOST 1
      // of 4). Losing half was too forgiving — escort never forced a genuinely protective flight pattern.
      return { target: n - 1, timer: 0, params: { convoy: n, survivors: n, exited: false } };
    },
    onKill: function (e, m) {},
    onTick: function (dt, m) {},
    winFail: function (m) {
      if (m.params.survivors < m.target) return 'failed';
      if (m.params.exited) return 'won';
      return 'active';
    },
  },
  defend: {
    setup: function (wave, rng) {
      const hold = 50 + wave * 2;
      return { target: 0, timer: hold, params: { assetHp: 100, assetMaxHp: 100 } };
    },
    onKill: function (e, m) {},
    onTick: function (dt, m) { m.timer -= dt; },
    winFail: function (m) {
      if (m.params.assetHp <= 0) return 'failed';
      if (m.timer <= 0) return 'won';
      return 'active';
    },
  },
  strike: {
    setup: function (wave, rng) {
      return { target: 1, timer: 0, params: { siteUp: true } };
    },
    onKill: function (e, m) {},
    onTick: function (dt, m) {},
    winFail: function (m) {
      if (!m.params.siteUp) return 'won';
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
    onKill: function (e, m) {},
    onTick: function (dt, m) { m.timer -= dt; },
    winFail: function (m) {
      if (reconWon(m)) return 'won';
      if (m.timer <= 0) return 'failed';
      return 'active';
    },
  },
  // STEALTH (no-kill): reach the extraction waypoint without the detection meter (params.detect,
  // 0..1) hitting 1. detect rises while firing weapons OR while any enemy is aiming at you, decays
  // otherwise (ticked impurely in updateMission via the pure detectionDelta). Pure win/fail below.
  stealth: {
    setup: function (wave, rng) {
      return { target: 1, timer: 0, params: { waypoints: [], count: 1, hitRadius: 360, detect: 0, riseRate: 0.45, decayRate: 0.18 } };
    },
    onKill: function (e, m) {},
    onTick: function (dt, m) {},
    winFail: function (m) {
      if (stealthFailed(m)) return 'failed';
      if (stealthWon(m)) return 'won';
      return 'active';
    },
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
// ---- END MIRROR ----

/* ---------------- runtime glue (browser only; not mirrored) ---------------- */
let mission = null;     // active mission state, or null for sweep-only / non-mission sectors
let setpieceActive = null;   // F14: id of the authored set-piece running this sector (or null for procedural)

// objective readout for the HUD/banner; localized. timer mm:ss for timed types.
function objectiveText(m) {
  if (!m) return '';
  if (m.type === 'intercept') return t('mission.intercept') + ' ' + m.progress + '/' + m.target;
  if (m.type === 'escort')    return t('mission.escort') + ' ' + (m.params.survivors || 0) + '/' + m.params.convoy;
  if (m.type === 'defend')    return t('mission.defend') + ' ' + fmtClock(Math.max(0, m.timer));
  if (m.type === 'strike')    return t('mission.strike');
  if (m.type === 'sweep')     return t('mission.sweep') + ' ' + m.progress + '/' + m.target;
  if (m.type === 'recon')     return t('mission.recon') + ' ' + m.progress + '/' + m.target;
  if (m.type === 'stealth') {
    const det = Math.round(((m.params.detect || 0)) * 100);
    const tag = det >= 60 ? t('mission.stealth.spotted') : t('mission.stealth.undetected');
    return t('mission.stealth') + ' — ' + tag + ' ' + det + '%';
  }
  return '';
}
function fmtClock(sec) { sec = Math.ceil(sec); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }

// localized name shown in the start-of-sector objective banner
function missionName(type) { return t('mission.name.' + type) !== 'mission.name.' + type ? t('mission.name.' + type) : ''; }

/* ---------------- sector start ----------------
   Called from nextWave() (main.js) for op-mode sectors. `plan.mission` is the descriptor
   from sectorPlan() — escort/defend are first-class sectors now (no roll).
   'none' (DEPOT/ELITE) and 'boss' (FINAL) clear the mission — those sectors use the legacy flow. */
function startSectorMission(plan, wave) {
  setpieceActive = plan.setpiece || null;   // F14: tag the resolution path when this node is an authored set-piece
  // Operations objective SEQUENCE (multi-phase level): walk the authored `objectives` queue. The
  // first phase starts here; onMissionResolved advances to the next on each 'won' (see below).
  missionPhases = (Array.isArray(plan.objectives) && plan.objectives.length) ? plan.objectives.slice() : null;
  missionPhaseIdx = 0;
  if (missionPhases) { startMissionPhase(0, wave, true); return; }
  const type = plan.mission;
  if (type === 'none' || type === 'boss' || !MISSIONS[type]) { mission = null; return; }
  mission = startMission(type, wave, Math.random);
  spawnMissionProps(type, mission, wave);
  // F14: a set-piece leads with its own authored intro line instead of the generic objective header
  if (setpieceActive && SETPIECES[setpieceActive]) showBanner(t(SETPIECES[setpieceActive].intro));
  else showBanner(tf('banner.missionStart', { name: missionName(type) }));
  if (typeof fireObjectiveCallout === 'function') fireObjectiveCallout(objectiveText(mission), 1, 1);   // Req D: big center flash on objective issue
  showBanner(objectiveText(mission));
}

// spawn the objective-specific PROPS for a mission verb (recon waypoints / stealth extraction /
// escort convoy / defend asset). Shared by the single-objective path and the multi-phase walker.
function spawnMissionProps(verb, m, wave) {
  if (verb === 'escort') spawnEscortConvoy(m, wave);
  else if (verb === 'defend') spawnDefendAsset(m, wave);
  else if (verb === 'recon') spawnReconWaypoints(m, wave);
  else if (verb === 'stealth') spawnStealthExtraction(m, wave);
}

/* ---------------- multi-phase objective walker ----------------
   A flagged level's `objectives` queue (opmap.js) is walked phase-by-phase. The PURE arithmetic
   (nextObjectivePhase) lives in core.js; this glue owns the per-phase spawns + banners + callout. */
let missionPhases = null;   // ordered objective queue for the active multi-phase level (or null)
let missionPhaseIdx = 0;    // index of the active phase within missionPhases

function startMissionPhase(idx, wave, isFirst) {
  const desc = missionPhases[idx];
  const sectorType = (desc && typeof desc === 'object') ? desc.type : desc;   // 'RECON'/'STRIKE'/'SWEEP'/…
  const verb = missionForSector(sectorType);
  mission = startMission(verb, wave, Math.random);
  const wp = (desc && typeof desc === 'object') ? desc.wp : undefined;
  if (wp != null && mission.params) { mission.params.count = wp; mission.target = wp; }   // trim the nav leg (RECON opener -> 2 waypoints)
  const spawn = (desc && typeof desc === 'object') ? desc.spawn : null;
  // make the objective winnable with EXACTLY the phase's authored enemy budget (so a sweep/intercept
  // phase can't stall waiting on kills that were never spawned).
  if (verb === 'sweep' && spawn && spawn.fighters) { mission.target = spawn.fighters; if (mission.params) mission.params.spawn = spawn.fighters; }
  if (verb === 'intercept' && spawn && spawn.bombers) { mission.target = spawn.bombers; if (mission.params) mission.params.bombers = spawn.bombers; }
  spawnMissionProps(verb, mission, wave);
  if (verb === 'strike' && typeof queueStrikeSite === 'function') queueStrikeSite(wave);   // ground target this phase
  if (spawn) {   // per-phase combat budget (designer hints): air targets for sweep/intercept; air threat for escort/defend
    for (let i = 0; i < (spawn.fighters || 0); i++) pendingSpawns.push(spawnFighter);
    for (let i = 0; i < (spawn.bombers || 0); i++) pendingSpawns.push(verb === 'intercept' ? spawnInterceptTarget : spawnBomber);
  }
  // Req D: issue the big center objective callout (3s) on EVERY phase transition, then the persistent banner.
  if (typeof fireObjectiveCallout === 'function') fireObjectiveCallout(objectiveText(mission), idx + 1, missionPhases.length);
  if (isFirst) showBanner(tf('banner.missionStart', { name: missionName(verb) }));
  showBanner(objectiveText(mission));
}

// escort: a friendly convoy the player must keep alive until it reaches the map edge.
// Reuses the truck entity but flagged friendly (escortUnit) so it isn't a kill target.
function spawnEscortConvoy(m, wave) {
  const cAng = rand(0, TWO_PI);
  const cDir = new THREE.Vector3(Math.cos(cAng), 0, Math.sin(cAng));
  const base = groundSpawnPos(900, 1500);
  for (let k = 0; k < m.params.convoy; k++) {
    const off = k * 130;
    pendingSpawns.push(() => {
      const e = spawnGroundAt('truck', base.x + cDir.x * off + rand(-40, 40), base.z + cDir.z * off + rand(-40, 40));
      // convoy:true uses updateGround's fast truck movement; they reach the exit (5500u) well
      // before the convoy auto-despawn range (7800u), so the escort resolves first.
      e.truckDir = cDir.clone(); e.convoy = true; e.escortUnit = true; e.convoySpeed = 60 + wave * 0.5;
      e.spawnPos = e.group.position.clone();
      e.marker.material.color.setHex(0x46ff8c);   // friendly green marker
      if (k === m.params.convoy - 1) m.params.spawnedAll = true;   // last truck on field: arm the survivor/fail check
    });
  }
}

// defend: a stationary asset (radar station) the player must keep alive for the hold timer.
function spawnDefendAsset(m, wave) {
  const c = groundSpawnPos(700, 1100);
  pendingSpawns.push(() => {
    const e = spawnGroundAt('radar', c.x, c.z);
    e.defendAsset = true; e.hp = e.maxHp = m.params.assetMaxHp;
    e.marker.material.color.setHex(0x46ff8c);
    m.params._asset = e;
  });
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
function spawnStealthExtraction(m, wave) {
  const p = player.group.position;
  const ang = rand(0, TWO_PI), r = rand(4200, 5200);
  m.params.waypoints = [{ x: p.x + Math.cos(ang) * r, y: clamp(p.y + rand(-200, 400), 400, 2400), z: p.z + Math.sin(ang) * r, hit: false }];
}

/* ---------------- per-frame update + resolution ----------------
   Ticked from animate() while playing. Recomputes live state for escort/defend, ticks the
   pure machine, then resolves win/fail once (banner + sector flow). */
function updateMission(dt) {
  if (!mission || mission.status !== 'active') return;
  if (mission.type === 'escort') {
    let alive = 0, exited = false;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.escortUnit || !e.alive) continue;
      alive++;
      if (e.spawnPos && e.group.position.distanceTo(e.spawnPos) > 5500) { e.reachedExit = true; }
      if (e.reachedExit) exited = true;
    }
    if (mission.params.spawnedAll) mission.params.survivors = alive;   // don't count survivors until the convoy is fully spawned (avoids a false fail mid-spawn)
    if (exited) mission.params.exited = true;   // any surviving truck reaching the map edge clears the escort
  } else if (mission.type === 'defend') {
    const a = mission.params._asset;
    if (a && a.alive) {
      // enemy fighters/drones loitering near the asset chip away at it — gives the hold real stakes
      let pressure = 0;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.alive || e.type === 'ground') continue;
        if (a.group.position.distanceToSquared(e.group.position) < 1600 * 1600) pressure++;
      }
      if (pressure > 0) { a.hp -= pressure * 6 * dt; if (a.hp <= 0) { a.hp = 0; a.alive = false; killEnemy(a, false); } }
      mission.params.assetHp = a.hp;
    } else if (a) { mission.params.assetHp = 0; }
  } else if (mission.type === 'recon') {
    // pure hit-test against the player position; progress mirrors the waypoint hit-count
    const r = reconProgress(mission.params.waypoints, player.group.position, mission.params.hitRadius);
    mission.progress = r.hitCount;
  } else if (mission.type === 'stealth') {
    // detection: rises while firing weapons OR while any enemy is aiming at you, decays otherwise.
    // player.firingT (combat.js) > 0 means a gun/missile left the rail in the last few frames.
    let beingAimed = false;
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.alive && e.aimingPlayer) { beingAimed = true; break; } }
    const firing = (player.firingT || 0) > 0;
    const d = detectionDelta({ firing: firing, beingAimed: beingAimed, dt: dt, riseRate: mission.params.riseRate, decayRate: mission.params.decayRate });
    mission.params.detect = clamp((mission.params.detect || 0) + d, 0, 1);
    // reach the extraction waypoint (pure hit-test); win/fail resolved by the pure stealth predicates
    reconProgress(mission.params.waypoints, player.group.position, mission.params.hitRadius);
  }
  tickMission(mission, dt);
  if (mission.status === 'won') onMissionResolved(true);
  else if (mission.status === 'failed') onMissionResolved(false);
}

// strike completion is detected from killEnemy (site flattened) — flip the flag from there.
function missionSiteDown() { if (mission && mission.type === 'strike') mission.params.siteUp = false; }

function onMissionResolved(won) {
  if (won) {
    // multi-phase level: advance to the NEXT objective instead of ending the sector. Only the final
    // phase falls through to the sector-complete path below (nextObjectivePhase -> -1 = done).
    if (missionPhases) {
      const next = nextObjectivePhase(missionPhaseIdx, missionPhases.length);
      if (next >= 0) {
        showBanner(t('banner.objectiveComplete')); audio.power(); empFlash = Math.max(empFlash, 0.3);
        clearMissionLeftovers();        // sweep leftover air + props so the next phase starts on a clean field
        missionPhaseIdx = next;
        startMissionPhase(next, wave, false);   // sets `mission` active again -> handleWaves stays blocked
        return;
      }
    }
    if (typeof run !== 'undefined' && run) run.missions = (run.missions || 0) + 1;   // feeds spAward / achievement at run end (once per level)
    // F14: an authored set-piece shows its own outro line; procedural objectives use the generic one
    showBanner(setpieceActive ? t(setpieceOutcome(setpieceActive, true)) : t('banner.missionComplete'));
    setpieceActive = null; missionPhases = null; missionPhaseIdx = 0;
    audio.power(); empFlash = Math.max(empFlash, 0.35);
    // pay a small RP/score bonus for completing the objective (meta SP follows from run stats at run end)
    const bonus = Math.round((40 + wave * 4) * (player.rpMul || 1));
    player.tp += bonus; player.score += Math.round(1200 * (player.scoreMul || 1));
    // the objective win drives the sector: clear any lingering combat enemies + friendly props
    // so handleWaves declares the sector clear and the op-map advances (sweep is already empty).
    if (mission.type !== 'sweep') clearMissionLeftovers();
  } else {
    showBanner(t('banner.missionFailedObj'));
    setpieceActive = null; missionPhases = null; missionPhaseIdx = 0;   // any phase fail = level fail
    audio.warn();
    if (typeof gameOver === 'function') { gameOver(); }
  }
}

// despawn leftover combat enemies (and mission-spawned friendly props) so handleWaves can
// declare the sector clear after an objective win. Real strike-site ground stays — that path
// already drives its own clear; here we only sweep air enemies + escort/defend props.
function clearMissionLeftovers() {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    const isProp = e.escortUnit || e.defendAsset;
    if (e.type === 'ground' && !isProp) continue;   // leave genuine ground targets (strike site)
    e.alive = false; scene.remove(e.group); disposeGroup(e.group);
    if (e.marker) scene.remove(e.marker); clearLocks(e);
  }
}

/* CommonJS export for Node tests — inert in the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MISSIONS, MISSION_TYPES, missionForSector, startMission, missionKill, tickMission };
}
