/* SKYSTRIKE — missions.js: typed-mission state machine. Loaded after opmap.js, before combat.js.
   The op-map sets a sector's mission type; the wave scheduler (main.js) reads `mission` and the
   directives from startMission() to spawn what the objective needs; updateMission() ticks it each
   frame and resolves win/fail. The CORE table + helpers below are PURE (no THREE / DOM) and are
   mirrored byte-identical in tests/missions.test.js between the MIRROR markers. Runtime glue
   (banners, sector resolve) lives below the pure core. */

// ---- BEGIN MIRROR (js/missions.js) ----
const MISSION_TYPES = ['sweep', 'intercept', 'escort', 'defend', 'strike'];

// op-map sector type -> mission type. Pure + deterministic.
// ESCORT/DEFEND are first-class objective sectors; ELITE is a no-objective elite-ace furball.
function missionForSector(type) {
  if (type === 'FURBALL') return 'sweep';
  if (type === 'INTERCEPT') return 'intercept';
  if (type === 'STRIKE') return 'strike';
  if (type === 'ESCORT') return 'escort';
  if (type === 'DEFEND') return 'defend';
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
  const type = plan.mission;
  if (type === 'none' || type === 'boss' || !MISSIONS[type]) { mission = null; return; }
  mission = startMission(type, wave, Math.random);
  if (type === 'escort') spawnEscortConvoy(mission, wave);
  if (type === 'defend') spawnDefendAsset(mission, wave);
  // F14: a set-piece leads with its own authored intro line instead of the generic objective header
  if (setpieceActive && SETPIECES[setpieceActive]) showBanner(t(SETPIECES[setpieceActive].intro));
  else showBanner(tf('banner.missionStart', { name: missionName(type) }));
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
  }
  tickMission(mission, dt);
  if (mission.status === 'won') onMissionResolved(true);
  else if (mission.status === 'failed') onMissionResolved(false);
}

// strike completion is detected from killEnemy (site flattened) — flip the flag from there.
function missionSiteDown() { if (mission && mission.type === 'strike') mission.params.siteUp = false; }

function onMissionResolved(won) {
  if (won) {
    if (typeof run !== 'undefined' && run) run.missions = (run.missions || 0) + 1;   // feeds spAward / achievement at run end
    // F14: an authored set-piece shows its own outro line; procedural objectives use the generic one
    showBanner(setpieceActive ? t(setpieceOutcome(setpieceActive, true)) : t('banner.missionComplete'));
    setpieceActive = null;
    audio.power(); empFlash = Math.max(empFlash, 0.35);
    // pay a small RP/score bonus for completing the objective (meta SP follows from run stats at run end)
    const bonus = Math.round((40 + wave * 4) * (player.rpMul || 1));
    player.tp += bonus; player.score += Math.round(1200 * (player.scoreMul || 1));
    // the objective win drives the sector: clear any lingering combat enemies + friendly props
    // so handleWaves declares the sector clear and the op-map advances (sweep is already empty).
    if (mission.type !== 'sweep') clearMissionLeftovers();
  } else {
    showBanner(t('banner.missionFailedObj'));
    setpieceActive = null;
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
