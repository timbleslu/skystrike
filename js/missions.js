/* SKYSTRIKE — missions.js: typed-mission state machine. Loaded after opmap.js, before combat.js.
   The op-map sets a sector's mission type; the wave scheduler (main.js) reads `mission` and the
   directives from startMission() to spawn what the objective needs; updateMission() ticks it each
   frame and resolves win/fail.

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
      'detectionDelta', 'reconWon', 'stealthWon', 'stealthFailed'].forEach(function (k) {
      if (typeof globalThis[k] === 'undefined' && _core[k]) globalThis[k] = _core[k];
    });
  } catch (e) { /* core.js not resolvable — pure fns needing it simply won't run in this env */ }
}

/* ========================= PURE HALF (require-safe; exported via footer) ========================= */

// ---- mission state machine ----
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
  // STEALTH (no-kill, ADR-0006 "go loud"): reach the extraction waypoint ALIVE. The detection meter
  // (params.detect, 0..1) is PRE-DETECTION PRESSURE only — reaching 1 TRIGGERS go-loud (blowStealthCover),
  // it never fails the level. detect rises from patrol cone-LOS / proximity rings / firing / being aimed at,
  // and DECAYS otherwise (gentler decay so a brief slip recovers before 100% — ADR-0006 retune). Once blown
  // the meter freezes. The ONLY stealth fail is death (HP→0, handled by gameOver). Pure win below.
  stealth: {
    setup: function (wave, rng) {
      return { target: 1, timer: 0, params: { waypoints: [], count: 1, hitRadius: 360, detect: 0, riseRate: 0.45, decayRate: 0.30, coneMul: 1.8 } };
    },
    onKill: function (e, m) {},
    onTick: function (dt, m) {},
    winFail: function (m) {
      // NEVER 'failed' from the meter (ADR-0006) — win only by reaching the waypoint; death fails elsewhere.
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

/* ---------------- multi-phase objective SEQUENCE walker (pure) ----------------
   A multi-phase Operations level (opmap.js) carries an authored `objectives` queue walked phase by
   phase: phase 0 starts at sector launch and each 'won' advances to the next, completing the level
   only after the LAST phase. The SEQUENCE VALUE folds the queue together with its cursor, so the old
   module-level cursor globals (missionPhases / missionPhaseIdx) are gone — the glue holds ONE
   `missionSeq` value and derives the cursor from it. */
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
   by tests/clear-count.test.js (verified: for the authored multi-phase budgets this equals the old
   inline sweep->spawn.fighters / intercept->spawn.bombers override at every wave). null = non-kill
   verb / no budget -> leave mission.target as startMission set it. */
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
  const sectorType = (desc && typeof desc === 'object') ? desc.type : desc;   // 'RECON'/'STRIKE'/'SWEEP'/…
  const verb = missionForSector(sectorType);
  const mission = startMission(verb, wave, Math.random);
  const wp = (desc && typeof desc === 'object') ? desc.wp : undefined;
  if (wp != null && mission.params) { mission.params.count = wp; mission.target = wp; }   // trim the nav leg (RECON opener -> 2 waypoints)
  const spawn = (desc && typeof desc === 'object') ? desc.spawn : null;
  const clamped = phaseClearTarget(verb, wave, spawn);   // shared budget rule (both paths)
  if (clamped !== null) mission.target = clamped;
  const spawnRequests = [{ kind: 'props', verb: verb }];   // escort/defend/recon/stealth props (glue no-ops for other verbs)
  if (verb === 'strike') spawnRequests.push({ kind: 'strikeSite' });   // ground target this phase
  if (spawn) {   // per-phase combat budget (designer hints): air targets for sweep/intercept; air threat for escort/defend
    if (spawn.fighters) spawnRequests.push({ kind: 'fighters', n: spawn.fighters });
    if (spawn.bombers) spawnRequests.push({ kind: 'bombers', n: spawn.bombers, verb: verb });
  }
  return {
    verb: verb,
    mission: mission,
    spawnRequests: spawnRequests,
    banners: {
      callout: { phase: phase, total: total },   // Req D: big center callout on EVERY phase transition
      missionStart: !!isFirst,                    // level's first phase leads with the objective header
      missionCard: isFirst ? verb : null,         // §2 intro card on the first phase
      objective: true,                            // persistent objective banner
    },
  };
}
// plan a single-objective sector (no `objectives` queue). `budget` = the level's spawn plan (main.js
// owns the level's air/ground budget, so only props spawn here). `setpiece` = an authored encounter id.
function planObjective(verb, wave, budget, setpiece) {
  const mission = startMission(verb, wave, Math.random);
  const clamped = phaseClearTarget(verb, wave, budget);   // SAME shared budget rule
  if (clamped !== null) mission.target = clamped;
  return {
    verb: verb,
    mission: mission,
    spawnRequests: [{ kind: 'props', verb: verb }],
    banners: {
      setpiece: setpiece || null,     // a set-piece leads with its own authored intro line
      callout: { phase: 1, total: 1 },
      objective: true,
      missionCard: verb,              // §2 intro card
    },
  };
}

/* ========================= BROWSER GLUE HALF (browser only; not exported) ========================= */

let mission = null;          // active mission state, or null (observable — hud.js/combat.js/main.js read it)
let setpieceActive = null;   // F14: id of the authored set-piece running this sector (observable — ui-flow.js resets it)
let missionSeq = null;       // multi-phase objective SEQUENCE value {phases, idx} (or null); folds the former
                             // missionPhases/missionPhaseIdx cursor globals into ONE value (internal to this file)

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

/* ---------------- sector start ----------------
   Called from nextWave() (main.js) for op-mode sectors. `plan.mission` is the descriptor from
   levelPlan() (sectorMission(type)) — escort/defend are first-class sectors now (no roll). 'none'
   (DEPOT/ELITE) and 'boss' (FINAL) clear the mission — those sectors use the legacy flow. A level's
   optional `objectives` queue is walked as a multi-phase SEQUENCE (startMissionPhase). */
function startSectorMission(plan, wave) {
  setpieceActive = plan.setpiece || null;   // F14: tag the resolution path when this node is an authored set-piece
  // Operations objective SEQUENCE (multi-phase level): walk the authored `objectives` queue. The first
  // phase starts here; onMissionResolved advances to the next on each 'won' (see below).
  missionSeq = missionSequence(plan.objectives);
  if (missionSeq) { startMissionPhase(missionSeq, wave, true); return; }
  const type = plan.mission;
  if (type === 'none' || type === 'boss' || !MISSIONS[type]) { mission = null; return; }
  // BOUNDED campaign: every wave spawns the SAME authored air budget, so planObjective clamps a
  // kill-type's clear target to the kill-targets actually spawned this wave (shared phaseClearTarget).
  const p = planObjective(type, wave, plan, setpieceActive);
  mission = p.mission;
  applySpawnRequests(p.spawnRequests, mission, wave);
  const b = p.banners;
  // F14: a set-piece leads with its own authored intro line instead of the generic objective header
  if (b.setpiece && SETPIECES[b.setpiece]) showBanner(t(SETPIECES[b.setpiece].intro));
  else showBanner(tf('banner.missionStart', { name: missionName(type) }));
  if (b.callout && typeof fireObjectiveCallout === 'function') fireObjectiveCallout(objectiveText(mission), b.callout.phase, b.callout.total);   // Req D: big center flash on objective issue
  if (b.objective) showBanner(objectiveText(mission));
  if (b.missionCard && typeof showMissionCard === 'function') showMissionCard(b.missionCard, missionCardBlurbKey());   // §2: mission intro card
}

/* ---------------- multi-phase objective walker (glue) ----------------
   Applies the pure planPhase() data for the phase the sequence cursor points at: publishes `mission`,
   fulfils the spawnRequests, fires the banners/callout. The PURE arithmetic (planPhase / advanceSequence
   / phaseClearTarget) lives above; this owns the per-phase spawns + banners + callout only. */
function startMissionPhase(seq, wave, isFirst) {
  const plan = planPhase(sequenceDescriptor(seq), wave, seq.idx + 1, seq.phases.length, isFirst);
  mission = plan.mission;   // publish the observable global
  applySpawnRequests(plan.spawnRequests, mission, wave);
  const b = plan.banners;
  // Req D: issue the big center objective callout (3s) on EVERY phase transition, then the persistent banner.
  if (b.callout && typeof fireObjectiveCallout === 'function') fireObjectiveCallout(objectiveText(mission), b.callout.phase, b.callout.total);
  if (b.missionStart) { showBanner(tf('banner.missionStart', { name: missionName(plan.verb) })); if (b.missionCard && typeof showMissionCard === 'function') showMissionCard(b.missionCard, missionCardBlurbKey()); }   // §2: intro card on the level's first phase
  if (b.objective) showBanner(objectiveText(mission));
}

// turn the pure spawnRequests descriptors into real entities/props. Ordered props -> strikeSite ->
// fighters -> bombers (matches the historical pendingSpawns order). This is the ONLY place a phase's
// air/ground budget touches createEnemy / pendingSpawns / queueStrikeSite.
function applySpawnRequests(reqs, m, wave) {
  for (let i = 0; i < reqs.length; i++) {
    const r = reqs[i];
    if (r.kind === 'props') spawnMissionProps(r.verb, m, wave);
    else if (r.kind === 'strikeSite') { if (typeof queueStrikeSite === 'function') queueStrikeSite(wave); }   // ground target this phase
    else if (r.kind === 'fighters') { for (let k = 0; k < r.n; k++) pendingSpawns.push(spawnFighter); }
    else if (r.kind === 'bombers') { for (let k = 0; k < r.n; k++) pendingSpawns.push(r.verb === 'intercept' ? spawnInterceptTarget : spawnBomber); }
  }
}

// spawn the objective-specific PROPS for a mission verb (recon waypoints / stealth extraction /
// escort convoy / defend asset). Shared by the single-objective path and the multi-phase walker.
function spawnMissionProps(verb, m, wave) {
  if (verb === 'escort') spawnEscortConvoy(m, wave);
  else if (verb === 'defend') spawnDefendAsset(m, wave);
  else if (verb === 'recon') spawnReconWaypoints(m, wave);
  else if (verb === 'stealth') spawnStealthExtraction(m, wave);
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
  if (typeof audio !== 'undefined' && audio.warn) audio.warn();
}

// A player kill during a stealth op blows cover AND spawns reinforcements — going loud escalates. The TOTAL
// extra spawns are CAPPED (STEALTH_SPAWN_CAP, ADR-0006) so the hot escape stays hard but survivable; once the
// cap is hit, kills still aggro but stop adding pressure. Called from combat.js killEnemy.
function onStealthKill(e) {
  if (!mission || mission.type !== 'stealth') return;
  blowStealthCover();
  const cap = (typeof STEALTH_SPAWN_CAP !== 'undefined') ? STEALTH_SPAWN_CAP : 6;
  for (let k = 0; k < 2 && stealthExtraSpawns < cap; k++) { pendingSpawns.push(spawnFighter); stealthExtraSpawns++; }
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
    if (r.hitCount > mission.progress && typeof audio !== 'undefined' && audio.ping) audio.ping();   // F1: one-shot chime the frame a waypoint checks off
    mission.progress = r.hitCount;
  } else if (mission.type === 'stealth') {
    // ADR-0006 "go loud": the meter is PRE-DETECTION PRESSURE. It rises from patrol cone-LOS (fastest),
    // proximity rings, firing, or being aimed at; decays otherwise. Reaching 1.0 TRIGGERS go-loud (NOT a fail).
    // Firing/killing also go loud. Once blown the meter freezes (detectionDelta returns 0) and stops driving
    // anything — the sortie is now a hot escape to the extraction waypoint; only death fails.
    const firing = (player.firingT || 0) > 0;
    if (firing) blowStealthCover();
    let beingAimed = false, coneLOS = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!e.alive) continue;
      if (e.aimingPlayer) beingAimed = true;
      if (e.coneLOS && e.coneLOS > coneLOS) coneLOS = e.coneLOS;   // strongest patrol scan-cone LOS this frame
    }
    const prox = stealthProximity();
    const d = detectionDelta({ blown: stealthBlown, firing: firing, beingAimed: beingAimed, coneLOS: coneLOS, coneMul: mission.params.coneMul, proximity: prox, dt: dt, riseRate: mission.params.riseRate, decayRate: mission.params.decayRate });
    mission.params.detect = clamp((mission.params.detect || 0) + d, 0, 1);
    // meter reaching 100% TRIGGERS go-loud (ADR-0006) — it is never a loss condition.
    if (!stealthBlown && mission.params.detect >= 1) blowStealthCover();
    mission.params._prox = prox;   // cached for the proximity warning glow (HUD)
    mission.params._coneLOS = coneLOS;   // cached for HUD telegraph
    // proximity audio cue: a warble that quickens the closer you are to a ring or patrol cone (pre-blown only)
    const cue = stealthBlown ? 0 : Math.max(prox, coneLOS);
    mission.params._beepT = (mission.params._beepT || 0) - dt;
    if (cue > 0.35 && mission.params._beepT <= 0) {
      if (typeof audio !== 'undefined' && audio.warn) audio.warn();
      mission.params._beepT = 0.9 - cue * 0.6;   // 0.36s at full cue, ~0.7s at the edge
    }
    // reach the extraction waypoint (pure hit-test); win/fail resolved by the pure stealth predicates
    const rs = reconProgress(mission.params.waypoints, player.group.position, mission.params.hitRadius);
    if (rs.hitCount > (mission._wpHit || 0) && typeof audio !== 'undefined' && audio.ping) audio.ping();   // F1: chime when extraction point reached
    mission._wpHit = rs.hitCount;
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
    if (typeof run !== 'undefined' && run) run.missions = (run.missions || 0) + 1;   // feeds spAward / achievement at run end (once per level)
    // F14: an authored set-piece shows its own outro line; procedural objectives use the generic one
    showBanner(setpieceActive ? t(setpieceOutcome(setpieceActive, true)) : t('banner.missionComplete'));
    setpieceActive = null; missionSeq = null;
    audio.power(); empFlash = Math.max(empFlash, 0.35);
    // pay a small RP/score bonus for completing the objective (meta SP follows from run stats at run end)
    const bonus = Math.round((40 + wave * 4) * (player.rpMul || 1));
    player.tp += bonus; player.score += Math.round(1200 * (player.scoreMul || 1));
    // the objective win drives the sector: clear any lingering combat enemies + friendly props
    // so handleWaves declares the sector clear and the op-map advances (sweep is already empty).
    if (mission.type !== 'sweep') clearMissionLeftovers();
  } else {
    showBanner(t('banner.missionFailedObj'));
    setpieceActive = null; missionSeq = null;   // any phase fail = level fail
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

/* CommonJS export for Node tests — inert in the browser. Exports the PURE half only: the state
   machine, the sequence walker, the shared budget rule, and the objective planners. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MISSIONS, MISSION_TYPES, missionForSector, startMission, missionKill, tickMission,
    missionSequence, sequenceDescriptor, advanceSequence, phaseClearTarget, planPhase, planObjective,
  };
}
