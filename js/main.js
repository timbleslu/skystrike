/* SKYSTRIKE — main.js: wave/boss/wingman spawning, input & touch controls, main animation loop, boot. Load 6th (last). */

/* ---------------- waves ---------------- */
function groundSpawnsAllowed(wave, on) { return !!on && wave >= 2; }
function isStrikeWave(wave, on) { return !!on && wave >= 5 && wave % 5 === 0 && wave % 4 !== 0; }
// Operations campaign: resolve the level row currently being flown (or null outside a campaign level).
function currentCampaignLevel() {
  if (typeof OPERATIONS === 'undefined' || !campaignOpId) return null;
  const op = OPERATIONS.find(o => o.id === campaignOpId);
  return op ? (op.levels[campaignLevelIdx] || null) : null;
}
function nextWave() {
  wave++;
  noDamageWave = true;   // arm the per-wave no-damage star tracker; damagePlayer clears it on a hit
  awacsUses = { strike: 0, resupply: 0, jam: 0 };   // AWACS use cap refreshes each sector/wave (F10)
  awacsLast = { strike: 0, resupply: 0, jam: 0 };   // AWACS cooldown clears each sector/wave (cooldown-gated, balance 2026-06)
  const strike = isStrikeWave(wave, groundWar);
  strikeWaveActive = strike;
  if (campaignMode && campaignOpId) {
    // Operations campaign: a BOUNDED level. The plan is AUTHORED per level (levelPlan reads the level's
    // own spawn fields — NOT sectorPlan(type,wave), whose wave-scaled branches are dead at the small
    // bounded wave counts). Difficulty/weather/tod are FIXED by the level row. Distinct path; the
    // endless scheduler below is untouched.
    const lvl = currentCampaignLevel();
    let plan = levelPlan(lvl);
    if (lvl.setpiece && !run.setpieceDone[lvl.id]) { run.setpieceDone[lvl.id] = true; plan = setpiecePlan(lvl.setpiece, plan); }
    strikeWaveActive = plan.ground;
    bossWaveActive = lastWaveWasBoss = !!plan.boss;
    applyWeather(plan.weather || 'clear'); applyTimeOfDay(plan.tod || 0);   // authored condition, fixed per level (not rolled)
    startSectorMission(plan, wave);
    const sectorLine = plan.boss ? t('banner.finalTarget') : t(lvl.nameKey);
    const condLine = weatherLabel(); showBanner(condLine ? sectorLine + '  ·  ' + condLine : sectorLine);
    // multi-phase objective levels (plan.objectives) own ALL their spawns per phase (startMissionPhase
    // in missions.js); skip the level's base air/ground budget so phase 1 (a nav leg) starts clean.
    if (!plan.objectives) {
      for (let i = 0; i < plan.fighters; i++) pendingSpawns.push(spawnFighter);
      for (let i = 0; i < plan.aces; i++) pendingSpawns.push(spawnAce);
      for (let i = 0; i < plan.bombers; i++) pendingSpawns.push(plan.mission === 'intercept' ? spawnInterceptTarget : spawnBomber);
    }
    if (plan.boss) {
      campaignBossPhases = (lvl.boss && lvl.boss.phases) || null;   // hand authored phase knobs to spawnBoss → e._phaseCfg
      if (rivalEnabled) { run.lastRivalWave = wave; pendingSpawns.push(spawnFinalRival); } else pendingSpawns.push(spawnBoss);
    }
    if (plan.ground && !plan.objectives) queueStrikeSite(wave);
    const aceKey = campaignOpId + ':' + campaignLevelIdx;
    if (plan.hostileAce && !plan.objectives && !run.sectorAceSpawned[aceKey]) { run.sectorAceSpawned[aceKey] = true; pendingSpawns.push(spawnHostileAce); }
    return;
  }
  applyWeather(rollWeather(weatherSeed + wave));
  const _wCond = weatherLabel();
  if (strike) {
    strikeWaveActive = true; bossWaveActive = lastWaveWasBoss = false;
    showBanner(t('banner.strikeWave'));
    queueStrikeSite(wave);
    for (let i = 0; i < 3; i++) pendingSpawns.push(spawnFighter);
    return;
  }
  // Windowed boss schedule (balance pass 2026-06) — replaces the old `wave % 4` metronome. Seed the
  // schedule the first time we need it, then a boss wave fires once `wave` reaches the scheduled mark
  // and the NEXT mark is rolled 3-5 waves further out, so cadence is never predictable.
  if (bossWaveNext < BOSS_WINDOW_MIN) bossWaveNext = BOSS_WINDOW_MIN + Math.floor(Math.random() * (BOSS_WINDOW_MAX - BOSS_WINDOW_MIN + 1));
  bossWaveActive = isBossWave(wave, bossWaveNext);
  if (bossWaveActive) bossWaveNext = wave + nextBossOffset(Math.random);   // reschedule the next boss off THIS wave
  lastWaveWasBoss = bossWaveActive;
  // occasional non-boss "wildcard spike" — a denser-than-usual swarm to break the rhythm (~18%, wave >=5)
  const wildcard = isWildcardWave(wave, bossWaveActive, Math.random());
  let count = waveCount(wave, DIFFS[difficulty].count, WAVE_COUNT_CAP);
  if (wildcard) count = Math.min(WAVE_COUNT_CAP, count + randInt(2, 4));
  for (let i = 0; i < count; i++) pendingSpawns.push(spawnFighter);   // fighters first \u2192 first drained = combat enemy
  if (bossWaveActive) { pendingSpawns.push(spawnBoss); showBanner(t('banner.bossIncoming')); }
  else if (wildcard) { showBanner(t('banner.wildcardWave')); }
  else showBanner(_wCond ? tf('banner.wave', { n: wave }) + '  ·  ' + _wCond : tf('banner.wave', { n: wave }));
  if (wave >= 3 && !bossWaveActive && Math.random() < (0.45 + difficulty * 0.12)) pendingSpawns.push(spawnAce);
  if (wildcard) pendingSpawns.push(spawnAce);   // wildcard always brings an extra ace for spice
  if (!strike && rivalDue(wave, run.lastRivalWave, rivalEnabled)) { run.lastRivalWave = wave; pendingSpawns.push(spawnRival); }
  if (wave >= 4 && !bossWaveActive && Math.random() < 0.32) pendingSpawns.push(spawnBomber);
  if (wave >= 3 && !bossWaveActive && Math.random() < 0.5) {
    const dn = randInt(3, 4) + Math.floor(wave / 4);
    pendingSpawns.push(() => spawnDroneSwarm(dn));
  }
  if (groundSpawnsAllowed(wave, groundWar)) { const ng = randInt(1, 2); for (let k = 0; k < ng; k++) pendingSpawns.push(spawnGround); }
}
function processSpawnQueue(n) {
  for (let i = 0; i < n && pendingSpawns.length; i++) pendingSpawns.shift()();
}
/* Random spawn point on a ring around the player, altitude clamped to [terrain+minAGL, maxY]. */
function airSpawnPos(rMin, rMax, yJitMin, yJitMax, minAGL, maxY) {
  const ang = rand(0, TWO_PI), r = rand(rMin, rMax);
  const px = player.group.position.x + Math.cos(ang) * r, pz = player.group.position.z + Math.sin(ang) * r;
  const py = clamp(player.group.position.y + rand(yJitMin, yJitMax), terrainH(px, pz) + minAGL, maxY);
  return new THREE.Vector3(px, py, pz);
}
function groundSpawnPos(rMin, rMax) {
  const ang = rand(0, TWO_PI), r = rand(rMin, rMax);
  const px = player.group.position.x + Math.cos(ang) * r, pz = player.group.position.z + Math.sin(ang) * r;
  return new THREE.Vector3(px, terrainH(px, pz), pz);
}
function styleElite(e, bodyHex, emissiveHex, intensity, glowHex, flameHex) {
  if (e.group.userData.body) { e.group.userData.body.color.setHex(bodyHex); e.group.userData.body.emissive = new THREE.Color(emissiveHex); e.group.userData.body.emissiveIntensity = intensity; }
  const eng = e.group.userData.engines || [];
  for (let i = 0; i < eng.length; i++) { eng[i].glow.material.color.setHex(glowHex); eng[i].flame.material.color.setHex(flameHex); }
  e.marker.material.color.setHex(glowHex);
}
function spawnAce() {
  const e = createEnemy('fighter', airSpawnPos(2800, 4400, -300, 600, 450, 4300), { shapePool: aceShapePool(), useGLTF: true });
  e.elite = true;
  e.aceName = jetNameForShape(e.shapeKey);
  e.callsign = genCallsign('ACE');
  e.desprintUsed = false; e.sprintTimer = 0;
  e.hp = e.maxHp = 170 + wave * 9;
  e.turnRate = 1.5; e.gunRunCd = rand(1.5, 3);
  e.bulletAmmo = 75; e.missileAmmo = 2; e.flareAmmo = 1;
  styleElite(e, 0xffcf3a, 0x4a3300, 0.9, 0xffd24d, 0xffd24d);
  showBanner(t('banner.aceInbound'));
}
function spawnHostileAce() {
  const aceEntry = hostileAceFor(opSector);
  if (!aceEntry) return;
  const e = createEnemy('fighter', airSpawnPos(2800, 4400, -300, 600, 450, 4300), { shapePool: aceShapePool(), useGLTF: true });
  e.elite = true;
  e.aceName = jetNameForShape(e.shapeKey);
  e.callsign = aceEntry.callsign;
  e.hostileAce = true;
  e.desprintUsed = false; e.sprintTimer = 0;
  const baseHp = 170 + wave * 9;
  e.hp = e.maxHp = Math.round(baseHp * aceEntry.hpMul);
  e.turnRate = aceEntry.turnRate;
  e.speed = (e.speed || 280) * aceEntry.speed;
  e.gunRunCd = rand(1.2, 2.5);
  e.bulletAmmo = 90; e.missileAmmo = 3; e.flareAmmo = 2;
  styleElite(e, 0xd44fff, 0x330044, 1.0, 0xcc55ff, 0xcc44ff);
  showBanner(tf('banner.hostileAceInbound', { name: aceEntry.callsign }));
}
function spawnRival() {
  const e = createEnemy('fighter', airSpawnPos(2800, 4400, -300, 600, 450, 4300), { shapePool: [rival.shape], useGLTF: true });
  e.elite = true; e.rival = true;
  e.aceName = rival.jetName;
  e.callsign = rival.name;
  e.desprintUsed = false; e.sprintTimer = 0;
  e.hp = e.maxHp = rivalHpFor(wave, rival.level);
  e.turnRate = 1.55; e.gunRunCd = rand(1.2, 2.5);
  e.bulletAmmo = 120; e.missileAmmo = 3; e.flareAmmo = 2;
  e.rivalSpCd = 6;            // first special after 6s, then every 12s
  e.fleeing = false;
  // traits
  if (rival.traits.indexOf('FLARE_WALL') !== -1) { e.flareAmmo = 4; e.flareWall = true; }
  if (rival.traits.indexOf('SCISSORS') !== -1) { e.turnRate *= 1.25; }
  if (rival.traits.indexOf('HEADHUNTER') !== -1) { e.headhunter = true; }
  if (rival.traits.indexOf('VETERAN') !== -1) { e.hp = e.maxHp = Math.round(e.maxHp * 1.2); e.turnRate *= 1.1; }
  styleElite(e, 0xff5a2a, 0x551100, 1.0, 0xff5a2a, 0xff7a3a);
  showBanner(tf('banner.rivalOnStation', { name: rival.name, lvl: rival.level }));
}
function spawnFighter() {
  createEnemy('fighter', airSpawnPos(2600, 4600, -400, 650, 400, 4200));
}
function spawnBomber() {
  const pos = airSpawnPos(5500, 5500, -150, 500, 700, 4200);
  const e = createEnemy('bomber', pos);
  e.speed = 150; e.turnRate = 0.5;
  e.spawnPos = pos.clone();
  e.escapeDir = new THREE.Vector3().copy(player.group.position).sub(pos); e.escapeDir.y *= 0.2; e.escapeDir.normalize();
  dirToQuat(e.escapeDir, e.logicQuat);
  e.marker.material.color.setHex(0xffb060);
  showBanner(t('banner.bomberDetected'));
}
// intercept-mission bomber: a normal bomber flagged so missionKill credits the objective
function spawnInterceptTarget() {
  const before = enemies.length;
  spawnBomber();
  const e = enemies[enemies.length - 1];
  if (e && enemies.length > before) e._missionTarget = true;
}
// FINAL sector cap: the nemesis rival as a boss that fights to the death (no withdrawal),
// so completing the operation requires actually defeating it. Defeat pays out + advances via killEnemy.
function spawnFinalRival() {
  const before = enemies.length;
  spawnRival();
  const e = enemies[enemies.length - 1];
  if (e && enemies.length > before) { e.finalCap = true; e.noFlee = true; e.hp = e.maxHp = Math.round(e.maxHp * 1.25); if (campaignBossPhases) e._phaseCfg = campaignBossPhases; }
}
function spawnBoss() {
  const px = player.group.position.x + rand(-1200, 1200), pz = player.group.position.z - 4200, py = player.group.position.y + 450;
  createEnemy('boss', new THREE.Vector3(px, py, pz));
  const e = enemies[enemies.length - 1];
  if (campaignBossPhases && e && e.type === 'boss') e._phaseCfg = campaignBossPhases;   // authored multi-phase knobs (campaign); absent in endless/boss-rush
  return e;
}
function spawnGround() {
  createEnemy('ground', groundSpawnPos(1600, 4200));
}
function spawnGroundAt(gkind, x, z) {
  return createEnemy('ground', new THREE.Vector3(x, terrainH(x, z), z), { gkind: gkind });
}
/* Strike target spawns as a coherent fortified site instead of scattered turrets:
   radar at the centre, a SAM/AAA ring around it, and a supply convoy already rolling
   for the horizon — kill the radar to blind the SAMs, catch the trucks before they
   escape, flatten everything for a site bonus (see killEnemy). Scales with wave. */
function queueStrikeSite(w) {
  const center = groundSpawnPos(2000, 3200);
  const nSam = 2 + Math.min(2, Math.floor(w / 10));
  const nAaa = 2 + Math.min(2, Math.floor(w / 12));
  const nTruck = 3 + Math.min(3, Math.floor(w / 8));
  pendingSpawns.push(() => spawnGroundAt('radar', center.x, center.z));
  const ringN = nSam + nAaa;
  for (let i = 0; i < ringN; i++) {
    const kind = i < nSam ? 'sam' : 'aaa';
    const ang = (i / ringN) * TWO_PI + rand(-0.25, 0.25), r = rand(340, 560);
    pendingSpawns.push(() => spawnGroundAt(kind, center.x + Math.cos(ang) * r, center.z + Math.sin(ang) * r));
  }
  const cAng = rand(0, TWO_PI);
  const cDir = new THREE.Vector3(Math.cos(cAng), 0, Math.sin(cAng));
  for (let k = 0; k < nTruck; k++) {
    const off = 700 + k * 120;
    pendingSpawns.push(() => {
      const e = spawnGroundAt('truck', center.x + cDir.x * off + rand(-45, 45), center.z + cDir.z * off + rand(-45, 45));
      e.truckDir = cDir.clone(); e.convoy = true; e.convoySpeed = 46 + w * 0.6;
    });
  }
}
function spawnDroneSwarm(n, origin) {
  const base = origin ? origin.clone() : airSpawnPos(2200, 3600, -200, 500, 350, 4300);
  for (let i = 0; i < n; i++) {
    const p = base.clone().add(new THREE.Vector3(rand(-220, 220), rand(-130, 130), rand(-220, 220)));
    const e = createEnemy('drone', p);
    e.speed = rand(150, 190);
    e.turnRate = rand(1.55, 2.05);
    e.wob = rand(0, TWO_PI);
    e.droneLife = 16;
    dirToQuat(t1.copy(player.group.position).sub(p).normalize(), e.logicQuat);
    e.group.quaternion.copy(e.logicQuat);
  }
  showBanner(t('banner.droneSwarm'));
  audio.warn(); audio.blip(360, 0.18, 'sawtooth', 0.12, 140);
}

/* ---------------- boss phase specials ---------------- */
// The boss periodically winds up a telegraphed super-attack. While `e.attack`
// is set it pulses its core/ring for the warning window (e.tele), then fires.
function updateBossSpecials(e, dt, dist) {
  if (e.specialCd == null) { e.specialCd = rand(5, 8); e.attack = null; e.tele = 0; e.teleMax = 1; }
  const u = e.group.userData;

  if (e.attack) {
    // winding up: charge the telegraph, then unleash
    e.tele -= dt;
    const f = 1 - clamp(e.tele / e.teleMax, 0, 1);                 // 0 -> 1 as it charges
    if (u.core) u.core.material.emissiveIntensity = 1.2 + f * 4.8 + Math.sin(performance.now() * 0.03) * 0.6;
    if (u.ring) u.ring.scale.setScalar(1 + f * 0.55);
    if (e.tele <= 0) {
      fireBossAttack(e, dist);
      e.attack = null;
      if (u.core) u.core.material.emissiveIntensity = 1.2;
      if (u.ring) u.ring.scale.setScalar(1);
      e.specialCd = (e.phase >= 3 ? rand(2.6, 4.2) : e.phase >= 2 ? rand(3.5, 5.5) : rand(6, 9)) / (e._fireMul || 1);   // _fireMul: authored campaign boss cadence (default 1)
    }
    return;
  }

  if (dist > 3400) { e.specialCd = Math.min(e.specialCd, 1.5); return; }   // hold fire until the player closes in
  e.specialCd -= dt;
  if (e.specialCd <= 0) {
    const roll = Math.random();
    let atk;
    if (dist < 1000 && roll < 0.4) atk = 'pulse';
    else if (roll < 0.7) atk = 'barrage';
    else atk = 'drones';
    e.attack = atk;
    e.teleMax = atk === 'pulse' ? 0.9 : 1.2;
    e.tele = e.teleMax;
    const label = atk === 'pulse' ? t('banner.shockwavePulse')
                : atk === 'barrage' ? t('banner.missileBarrage')
                : t('banner.droneDeploy');
    showBanner(label);
    audio.warn(); audio.blip(300, 0.2, 'sawtooth', 0.13, 90);
  }
}

function fireBossAttack(e, dist) {
  const pp = e.group.position;
  const enr = e.phase >= 2;   // phase 2 keeps the legacy "enraged" intensity; phase 3 pushes further
  const p3 = e.phase >= 3;
  if (e.attack === 'barrage') {
    // radial fan of homing missiles — wide spread so positioning + flares matter
    const count = (p3 ? 16 : enr ? 12 : 8) + (e._extraMissiles || 0);   // _extraMissiles: authored campaign boss salvo bonus (default 0)
    const fwd = fwdQ(e.logicQuat, t3);
    const spread = p3 ? 3.1 : enr ? 2.6 : 1.9;
    for (let i = 0; i < count; i++) {
      const a = (count > 1 ? (i / (count - 1) - 0.5) : 0) * spread;
      const dir = t1.copy(fwd).applyAxisAngle(UPV, a);
      dir.y += rand(-0.05, 0.13); dir.normalize();
      spawnMissile(pp, dir, null, true, 0.8);
    }
    audio.missile(); audio.blip(220, 0.3, 'sawtooth', 0.12, 70);
  } else if (e.attack === 'drones') {
    spawnDroneSwarm(p3 ? 6 : enr ? 5 : 3, pp);          // plays its own banner + audio
  } else if (e.attack === 'pulse') {
    spawnBigRing(pp, 0xff39c8, 150);
    empFlash = 0.5;
    audio.explode(true); audio.blip(120, 0.5, 'sine', 0.16, 40);
    // instant close-range AoE — the telegraph gave the player time to break away
    if (player.invuln <= 0 && pp.distanceTo(player.group.position) < 900) {
      damagePlayer(p3 ? 46 : enr ? 38 : 26, pp);
    }
    for (let i = 0; i < wingmen.length; i++) { const w = wingmen[i]; if (w.alive && pp.distanceToSquared(w.group.position) < 810000) damageWingman(w, p3 ? 85 : enr ? 70 : 50); }
  }
}

function spawnBigRing(pos, color, maxK) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(4, 7, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  ring.position.copy(pos); if (camera) ring.lookAt(camera.position); scene.add(ring);
  particles.push({ mesh: ring, vel: null, life: 0.9, max: 0.9, type: 'ring', ringK: maxK || 80 });
}

/* ---------------- AI wingman (loyal escort) ---------------- */
const WING_NAMES = ['VIPER', 'GHOST', 'RAZOR', 'TALON', 'JESTER', 'COBRA', 'MAVERICK'];
const WING_TEAL = 0x2dffb0;
function wingShape(temp, explicit) { return explicit || (temp ? 'CCAJET' : 'STD'); }
function firstAliveWingman() { for (let i = 0; i < wingmen.length; i++) if (wingmen[i].alive) return wingmen[i]; return null; }
function buildWingman(cca, shape) {
  const body = cca ? 0x2a4c7a : 0x1f7d68, accent = cca ? 0x49b6ff : WING_TEAL, emis = cca ? 0x0a2347 : 0x05322a;
  const g = buildJet(body, accent, SHAPES[shape] || SHAPES.ENEMY);
  g.scale.setScalar(cca ? 0.78 : 0.95);
  if (g.userData.body) { g.userData.body.emissive = new THREE.Color(emis); g.userData.body.emissiveIntensity = cca ? 0.9 : 0.7; }
  return g;
}
/* Spawn a visually distinct, aggressive CCA drone at a given world position (used by F-47 SWARM). */
function spawnCCA(spawnPos) {
  if (!player) return null;
  const ccaShape = 'CCAJET';
  const mesh = buildJet(0x0d9cd4, 0x00ffee, SHAPES[ccaShape]);   // vivid electric-blue body, cyan accent
  mesh.scale.setScalar(0.82);
  if (mesh.userData.body) { mesh.userData.body.emissive = new THREE.Color(0x003a6e); mesh.userData.body.emissiveIntensity = 1.5; }
  const engs = mesh.userData.engines || [];
  for (let i = 0; i < engs.length; i++) { engs[i].glow.material.color.setHex(0x00ffee); engs[i].flame.material.color.setHex(0x00ddff); }
  mesh.position.copy(spawnPos);
  mesh.quaternion.copy(player.group.quaternion);
  scene.add(mesh);
  const nm = 'CCA-' + (Math.random() * 99 | 0);
  const w = {
    group: mesh, vel: fwdOf(player.group, new THREE.Vector3()).multiplyScalar(player.speed || 340),
    logicQuat: mesh.quaternion.clone(), bank: 0, baseScale: mesh.scale.x, _spd: 340,
    hp: 100, maxHp: 100, alive: true, side: wingmen.length % 2 === 0 ? 1 : -1,
    target: null, retargetCd: 0, fireCd: 0.08, missileCd: rand(1.2, 2.5),   // minimal delay — attack immediately
    rtb: 0, hitFlash: 0, trailT: 0, name: nm, temp: true, expire: 16, cca: true,
    shape: ccaShape, jetName: ccaShape, flares: 2, sprintT: 0, priorityCd: 0, flareCd: 0,
    forced: null, defend: 0,
  };
  wingmen.push(w);
  w.target = nearestEnemyForWingman(w);   // instant target acquisition on deploy
  return w;
}
function wingmanSlot(side, out) {
  // a station off the player's wing, slightly back and high
  const r = rightOf(player.group, t3), f = fwdOf(player.group, tA);
  return out.copy(player.group.position).addScaledVector(r, 95 * side).addScaledVector(f, -70).addScaledVector(UPV, 16);
}
function spawnWingman(temp, explicit) {
  if (!player) return;
  const side = wingmen.length % 2 === 0 ? 1 : -1;
  const wShape = wingShape(temp, explicit);
  const mesh = buildWingman(temp, wShape);
  wingmanSlot(side, t1); mesh.position.copy(t1).addScaledVector(rightOf(player.group, t4), side * (temp ? rand(20, 60) : 0));
  mesh.quaternion.copy(player.group.quaternion);
  scene.add(mesh);
  const nm = temp ? ('CCA-' + (1 + ((Math.random() * 9) | 0))) : WING_NAMES[(Math.random() * WING_NAMES.length) | 0];
  wingmen.push({
    group: mesh, vel: fwdOf(player.group, new THREE.Vector3()).multiplyScalar(player.speed || 320),
    logicQuat: mesh.quaternion.clone(), bank: 0, baseScale: mesh.scale.x, _spd: 320,
    hp: temp ? 80 : 130, maxHp: temp ? 80 : 130, alive: true, side: side,
    target: null, retargetCd: 0, fireCd: rand(0.2, 0.8), missileCd: rand(2, 5),
    rtb: 0, hitFlash: 0, trailT: 0, name: nm, temp: !!temp, expire: temp ? 15 : 0, cca: !!temp,
    shape: wShape, jetName: jetNameForShape(wShape), flares: 3, sprintT: 0, priorityCd: 0, flareCd: 0,
    forced: null, defend: 0, specialCd: rand(25, 40),
  });
  if (!temp) { showBanner(tf('banner.onStation', { name: wingmen[wingmen.length - 1].name })); audio.ui(); }
}
function damageWingman(w, amt) {
  if (!w.alive) return;
  w.hp -= amt; w.hitFlash = 0.1;
  if (w.hp <= 0) {
    w.alive = false; explode(w.group.position, true); scene.remove(w.group);
    w.rtb = 13;   // regroup / replacement timer
    showBanner(tf('banner.down', { name: w.name })); audio.warn();
  }
}
function reviveWingman(w) {
  if (!player) return;
  const mesh = buildWingman(false, w.shape);
  wingmanSlot(w.side, t1); mesh.position.copy(t1).addScaledVector(fwdOf(player.group, t4), -90);
  mesh.quaternion.copy(player.group.quaternion); scene.add(mesh);
  w.group = mesh; w.logicQuat = mesh.quaternion.clone(); w.baseScale = mesh.scale.x;
  w.hp = w.maxHp; w.alive = true; w.target = null; w.retargetCd = 0;
  w.fireCd = rand(0.4, 1); w.missileCd = rand(3, 6); w._spd = player.speed || 320;
  w.vel = fwdOf(player.group, new THREE.Vector3()).multiplyScalar(player.speed || 320);
  w.flares = 3; w.sprintT = 0; w.priorityCd = 0; w.flareCd = 0; w.forced = null; w.defend = 0;
  showBanner(tf('banner.onStation', { name: w.name })); audio.ui();
}
function nearestEnemyForWingman(w) {
  let best = null, bestScore = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive) continue;
    const d2 = w.group.position.distanceToSquared(e.group.position);
    if (d2 > 4500 * 4500) continue;
    const s = e.type === 'ground' ? d2 * 2.4 : (e.type === 'drone' ? d2 * 0.8 : d2);   // favour air threats, then drones
    if (s < bestScore) { bestScore = s; best = e; }
  }
  return best;
}
/* WINGMAN COMMANDS — issue a flight order to every airborne escort at once.
   'focus'   → converge and concentrate fire on your locked (or nearest forward) target
   'regroup' → break off, tuck into formation and fly defensively for a few seconds */
function wingCommand(kind) {
  let n = 0; for (let i = 0; i < wingmen.length; i++) if (wingmen[i].alive) n++;
  if (!n) { audio.ui(); showBanner(t('banner.wingNone')); return; }
  if (kind === 'focus') {
    let tgt = (player.lockedTarget && player.lockedTarget.alive) ? player.lockedTarget
            : (player.lockTarget && player.lockTarget.alive) ? player.lockTarget
            : nearestEnemyInFront(0.4);
    if (!tgt) { audio.ui(); showBanner(t('banner.wingNoTarget')); return; }
    for (let i = 0; i < wingmen.length; i++) { const w = wingmen[i]; if (!w.alive) continue; w.forced = tgt; w.target = tgt; w.defend = 0; w.retargetCd = 1.2; }
    showBanner(t('banner.wingFocus')); audio.power();
  } else {
    for (let i = 0; i < wingmen.length; i++) { const w = wingmen[i]; if (!w.alive) continue; w.forced = null; w.target = null; w.defend = 6; }
    showBanner(t('banner.wingRegroup')); audio.ui();
  }
}
function updateCCA(w, dt) {
  w.retargetCd -= dt;
  if (w.forced && !w.forced.alive) w.forced = null;
  if (w.forced) { w.target = w.forced; }
  else if (!w.target || !w.target.alive || w.retargetCd <= 0) { w.target = nearestEnemyForWingman(w); w.retargetCd = 0.4; }

  const terminal = w.expire <= 1.5 || w.hp <= 10;
  let desired = t2, engaging = false;
  if (w.target && w.target.alive) {
    const tp = w.target.group.position;
    const td = w.group.position.distanceTo(tp);
    if (td < 4400) {
      engaging = true;
      if (terminal) {
        desired.copy(tp).sub(w.group.position).normalize();
        if (td < 28) {
          damageEnemy(w.target, 80, w.group.position, false, true);
          w.alive = false; explode(w.group.position, false); return;
        }
      } else {
        const lead = interceptPoint(w.group.position, tp, w.target.vel || ZERO, 1400);
        desired.copy(lead || tp).sub(w.group.position).normalize();
      }
    } else { w.target = null; }
  }
  if (!engaging) {
    wingmanSlot(w.side, t1);
    const toS = t5.copy(t1).sub(w.group.position); const sd = toS.length();
    if (sd > 14) desired.copy(toS).normalize(); else desired.copy(fwdOf(player.group, t4));
    w._spd = lerp(w._spd, clamp((player.speed || 300) * (sd > 240 ? 1.45 : 1.0), 230, 920), 2 * dt);
  } else {
    w._spd = lerp(w._spd, 420, 2 * dt);
  }
  const agl = w.group.position.y - terrainH(w.group.position.x, w.group.position.z);
  if (agl < 180) desired.y = Math.max(desired.y, 0.35);
  desired.normalize();

  dirToQuat(desired, q1);
  w.logicQuat.rotateTowards(q1, 3.5 * dt);
  const nf = fwdQ(w.logicQuat, t4);
  const cross = t5.copy(fwdQ(w.logicQuat, tA)).cross(nf);
  w.bank = damp(w.bank, clamp(-cross.y * 5, -0.7, 0.7), 3, dt);
  q2.setFromAxisAngle(ZAX, w.bank);
  w.group.quaternion.copy(w.logicQuat).multiply(q2);
  w.vel.copy(nf).multiplyScalar(w._spd);
  w.group.position.addScaledVector(w.vel, dt);

  const u = w.group.userData;
  if (u.engines) for (let k = 0; k < u.engines.length; k++) u.engines[k].flame.material.opacity = 0.45 + Math.random() * 0.25;
  w.trailT -= dt;
  if (w.trailT <= 0 && !inCloud(w.group.position)) { spawnTrail(w.group.position, 0x49b6ff, 0.3); w.trailT = 0.06; }
  if (w.hitFlash > 0) { w.hitFlash -= dt; w.group.scale.setScalar(w.baseScale * (1 + (w.hitFlash > 0 ? 0.12 : 0))); }
  else w.group.scale.setScalar(w.baseScale);

  w.fireCd -= dt; w.missileCd -= dt;
  if (engaging && !terminal && w.fireCd <= 0) {
    const nf0 = fwdQ(w.logicQuat, t4), tp = w.target.group.position;
    const aimGood = w.target.alive && w.group.position.distanceTo(tp) < 2600 && nf0.angleTo(t5.copy(tp).sub(w.group.position).normalize()) < 0.13;
    if (aimGood) { wingmanFireGun(w); w.fireCd = rand(0.06, 0.1); }
    else w.fireCd = 0.06;
  }
  if (engaging && !terminal && w.missileCd <= 0 && w.target && w.target.alive) {
    const td2 = w.group.position.distanceTo(w.target.group.position);
    if (td2 < 3000 && td2 > 280) { wingmanFireMissile(w); w.missileCd = rand(4, 7); }
  }
}

// F11 mobile perf — draw-distance cull of distant enemy meshes. VISUAL-ONLY: toggles e.group.visible, NEVER
// despawns (markers/locks/AI keep running on hidden foes). High tier forces everything visible (so toggling
// quality high mid-run instantly restores draw). Inactive (non-boss, non-rival) jets hide sooner as a cheap
// far-LOD; bosses/rivals stay drawn (they anchor the fight and are rarely beyond cull range).
function cullDistantEnemies() {
  if (!player || !player.group) return;
  const high = gfxTier !== 'low';
  const px = player.group.position;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive || !e.group) continue;
    if (high) { if (!e.group.visible) e.group.visible = true; continue; }
    if (e.type === 'boss' || e.rival) { if (!e.group.visible) e.group.visible = true; continue; }
    const inactiveJet = e.type !== 'ground';   // air fodder/drones/bombers get the tighter LOD band
    const r = inactiveJet ? GFX_CULL_JET : GFX_CULL_FAR;
    const vis = e.group.position.distanceToSquared(px) <= r * r;
    if (e.group.visible !== vis) e.group.visible = vis;
  }
}
function updateWingmen(dt) {
  for (let i = wingmen.length - 1; i >= 0; i--) {
    const w = wingmen[i];
    if (w.alive && w.group) animEngines(w.group, 0.85);
    if (w.temp) {
      w.expire -= dt;
      if (!w.alive || w.expire <= 0) {            // CCA expended or recalled to base — no respawn
        if (w.alive && w.group) { explode(w.group.position, false); scene.remove(w.group); }
        wingmen.splice(i, 1);
        continue;
      }
      if (w.cca) updateCCA(w, dt); else updateWingman(w, dt);
      continue;
    }
    if (!w.alive) { w.rtb -= dt; if (w.rtb <= 0 && state === 'playing' && player) reviveWingman(w); continue; }
    updateWingman(w, dt);
  }
}
function updateWingman(w, dt) {
  // ----- target selection (honours FOCUS / REGROUP flight orders) -----
  w.retargetCd -= dt;
  if (w.forced && !w.forced.alive) w.forced = null;
  if (w.defend > 0) w.defend -= dt;
  if (w.forced) { w.target = w.forced; }
  else if (!w.target || !w.target.alive || w.retargetCd <= 0) { w.target = (w.defend > 0 ? null : nearestEnemyForWingman(w)); w.retargetCd = 0.5; }

  let desired = t2, engaging = false, aimGood = false, td = Infinity;
  if (w.target && w.target.alive) {
    const tp = w.target.group.position;
    td = w.group.position.distanceTo(tp);
    if (td < 4400) {
      engaging = true;
      const lead = interceptPoint(w.group.position, tp, w.target.vel || ZERO, 1400);
      desired.copy(lead || tp).sub(w.group.position).normalize();
      const nf0 = fwdQ(w.logicQuat, t4);
      aimGood = td < 2600 && nf0.angleTo(t5.copy(tp).sub(w.group.position).normalize()) < 0.13;
    } else { w.target = null; }
  }
  if (!engaging) {
    // ----- hold formation off the player's wing -----
    wingmanSlot(w.side, t1);
    const toS = t5.copy(t1).sub(w.group.position); const sd = toS.length();
    if (sd > 14) desired.copy(toS).normalize(); else desired.copy(fwdOf(player.group, t4));
    w._spd = lerp(w._spd, clamp((player.speed || 300) * (sd > 240 ? 1.45 : 1.0), 230, 920), 2 * dt);
  } else {
    w._spd = lerp(w._spd, 365, 2 * dt);
    w.sprintT -= dt;
    if (td > 2200 && w.sprintT <= 0) {
      w._spd = clamp(w._spd * 1.4, 320, 700);
      w.sprintT = 9.5;
    }
  }

  // terrain avoidance
  const agl = w.group.position.y - terrainH(w.group.position.x, w.group.position.z);
  if (agl < 180) desired.y = Math.max(desired.y, 0.35);
  desired.normalize();

  // steer + bank
  dirToQuat(desired, q1);
  w.logicQuat.rotateTowards(q1, 2.5 * dt);
  const nf = fwdQ(w.logicQuat, t4);
  const cross = t5.copy(fwdQ(w.logicQuat, tA)).cross(nf);
  w.bank = damp(w.bank, clamp(-cross.y * 5, -0.7, 0.7), 3, dt);
  q2.setFromAxisAngle(ZAX, w.bank);
  w.group.quaternion.copy(w.logicQuat).multiply(q2);
  w.vel.copy(nf).multiplyScalar(w._spd);
  w.group.position.addScaledVector(w.vel, dt);

  // engine flicker + contrail + hit flash
  const u = w.group.userData;
  if (u.engines) for (let k = 0; k < u.engines.length; k++) u.engines[k].flame.material.opacity = 0.45 + Math.random() * 0.25;
  w.trailT -= dt;
  if (w.trailT <= 0 && !inCloud(w.group.position)) { spawnTrail(w.group.position, w.cca ? 0x49b6ff : WING_TEAL, 0.3); w.trailT = 0.06; }
  if (w.hitFlash > 0) { w.hitFlash -= dt; w.group.scale.setScalar(w.baseScale * (1 + (w.hitFlash > 0 ? 0.12 : 0))); }
  else w.group.scale.setScalar(w.baseScale);

  // ----- weapons -----
  w.fireCd -= dt; w.missileCd -= dt;
  if (engaging && aimGood && w.fireCd <= 0) { wingmanFireGun(w); w.fireCd = rand(0.09, 0.14); }
  if (engaging && w.missileCd <= 0 && w.target && w.target.alive) {
    const td2 = w.group.position.distanceTo(w.target.group.position);
    if (td2 < 3000 && td2 > 280) { wingmanFireMissile(w); w.missileCd = rand(6, 10); }
  }

  // priority salvo vs boss/bomber
  w.priorityCd -= dt;
  if (engaging && w.priorityCd <= 0 && w.target && w.target.alive) {
    const tt = w.target.type;
    if ((tt === 'boss' || tt === 'bomber') && w.group.position.distanceTo(w.target.group.position) < 2500) {
      wingmanFireMissile(w); w.priorityCd = 3;
    }
  }

  // special ability on cooldown
  w.specialCd -= dt;
  if (w.specialCd <= 0 && engaging && w.target && w.target.alive) wingmanSpecial(w);

  // auto-flares: pop when enemy missile closes within 1000u
  w.flareCd -= dt;
  if (w.flares > 0 && w.flareCd <= 0) {
    for (let k = 0; k < missiles.length; k++) {
      const m = missiles[k];
      if (!m.enemy || m.decoyed) continue;
      if (m.mesh.position.distanceToSquared(w.group.position) < 1000000) { wingmanDeployFlares(w); break; }
    }
  }
}
function wingmanFireGun(w) {
  const fwd = fwdQ(w.logicQuat, t1);
  let dir;
  if (w.target && w.target.alive) {
    const lead = interceptPoint(w.group.position, w.target.group.position, w.target.vel || ZERO, 1500);
    dir = t2.copy(lead || w.target.group.position).sub(w.group.position).normalize();
  } else dir = t2.copy(fwd);
  dir.x += rand(-0.012, 0.012); dir.y += rand(-0.012, 0.012); dir.normalize();
  const b = getBullet(); b.enemy = false; b.ai = true; b.byCCA = !!w.cca; b.dmg = 5.5 * wingDmgMul; b.life = 1.6;
  b.mesh.material = ASSET.bulletMat; b.mesh.scale.setScalar(1);
  b.mesh.position.copy(w.group.position).addScaledVector(fwd, 14);
  b.vel.copy(dir).multiplyScalar(1500).addScaledVector(w.vel, 0.4);
  bullets.push(b);
  if (Math.random() < 0.5) audio.blip(900, 0.035, 'square', 0.04, 560);   // light, quieter than the player's cannon
}
function wingmanFireMissile(w) {
  const dir = fwdQ(w.logicQuat, t1);
  const m = spawnMissile(w.group.position, dir, (w.target && w.target.alive) ? w.target : null, false, 0.9 * wingDmgMul);
  if (m) { m.ai = true; m.byCCA = !!w.cca; m.trailColor = 0xdfe2e6; }   // thin cool-grey contrail (allied), no neon team tint
  audio.blip(320, 0.4, 'sawtooth', 0.06, 80);
}
function wingmanDeployFlares(w) {
  if (w.flares <= 0) return;
  w.flares--; w.flareCd = 1.2;
  const back = fwdQ(w.logicQuat, t1).clone().multiplyScalar(-1);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(ASSET.flareGeo, ASSET.flareMat); scene.add(m);
    m.position.copy(w.group.position).addScaledVector(UPV, rand(-6, 6));
    const v = back.clone().multiplyScalar(rand(60, 150)); v.x += rand(-60, 60); v.y += rand(-90, -30); v.z += rand(-60, 60);
    flares.push({ mesh: m, vel: v, life: 3.2, owner: 'player' });
  }
  audio.flare();
}
function wingmanSpecial(w) {
  if (!w.target || !w.target.alive) return;
  const pos = w.group.position;
  const jet = JETS.find(function(j) { return j.shape === w.shape; });
  const id = jet ? jet.id : null;

  // fire N hard-homing missiles spread across nearest enemies
  function burstMissiles(count) {
    const tgts = enemies.filter(function(e) { return e.alive; }).sort(function(a, b) {
      return pos.distanceToSquared(a.group.position) - pos.distanceToSquared(b.group.position);
    });
    if (!tgts.length) return;
    for (let k = 0; k < count; k++) {
      const tgt = tgts[k % tgts.length];
      const dir = fwdQ(w.logicQuat, new THREE.Vector3()).applyAxisAngle(UPV, rand(-0.4, 0.4));
      dir.y += rand(-0.08, 0.15); dir.normalize();
      const m = spawnMissile(pos, dir, tgt, false, 0.9 * wingDmgMul);
      if (m) { m.ai = true; m.hardHome = true; m.trailColor = 0xdfe2e6; }   // thin cool-grey contrail (allied), no neon team tint
    }
  }

  if (id === 'SU-57') {
    // COBRA: area shockwave + AOE damage
    spawnShockwave(pos.clone()); explode(pos.clone(), true);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.alive && e.type !== 'boss' && pos.distanceToSquared(e.group.position) < 340 * 340)
        damageEnemy(e, 90, e.group.position);
    }
    // shred nearby inbound missiles
    for (let i = 0; i < missiles.length; i++) {
      const m = missiles[i];
      if (m.enemy && pos.distanceToSquared(m.mesh.position) < 420 * 420) { m.decoyed = true; if (Math.random() < 0.7) m.life = 0.05; }
    }
  } else if (id === 'J-20') {
    // EMP: detonate nearby enemy missiles
    empFlash = Math.max(empFlash || 0, 0.55);
    for (let i = 0; i < missiles.length; i++) {
      const m = missiles[i];
      if (m.enemy && !m.decoyed && pos.distanceToSquared(m.mesh.position) < 650 * 650) {
        explode(m.mesh.position.clone(), false); m.life = 0;
      }
    }
    burstMissiles(2);
  } else if (id === 'F-35') {
    // STEALTH: shed missiles tracking this wingman, then fire
    for (let i = 0; i < missiles.length; i++) {
      const m = missiles[i];
      if (m.enemy && m.target === w.group) m.decoyed = true;
    }
    burstMissiles(3);
  } else if (id === 'EFT') {
    burstMissiles(4);
  } else if (id === 'RAFALE') {
    // SPECTRA: jam nearby missiles + burst
    for (let i = 0; i < missiles.length; i++) {
      const m = missiles[i];
      if (m.enemy && !m.decoyed && pos.distanceToSquared(m.mesh.position) < 550 * 550) m.decoyed = true;
    }
    burstMissiles(3);
  } else if (id === 'TEJAS') {
    if (typeof spawnDecoys === 'function') spawnDecoys(2);
    burstMissiles(1);
  } else if (id === 'J-36') {
    burstMissiles(6);
  } else if (id === 'F-47') {
    // CCA SWARM: spawn a drone ahead
    const pt = pos.clone().addScaledVector(fwdQ(w.logicQuat, t1.clone()), 200);
    spawnCCA(pt);
    burstMissiles(2);
  } else if (id === 'J-50') {
    // VECTOR SURGE: shed tracking missiles + burst
    for (let i = 0; i < missiles.length; i++) {
      const m = missiles[i];
      if (m.enemy && m.target === w.group) m.decoyed = true;
    }
    burstMissiles(3);
  } else {
    // F-22, FA18, STD, and anything else: missile burst
    burstMissiles(id === 'F-22' ? 3 : 2);
  }

  audio.power && audio.power();
  w.specialCd = rand(30, 45);
}

function clearWingmen() {
  for (let i = 0; i < wingmen.length; i++) if (wingmen[i].group) scene.remove(wingmen[i].group);
  wingmen.length = 0;
}

function handleWaves(dt) {
  const aliveCombat = enemies.some(e => e.alive && (strikeWaveActive ? e.type !== 'bomber' && e.gkind !== 'truck' : e.type !== 'ground' && e.type !== 'bomber'));
  if (!betweenWaves) {
    // Don't declare the wave clear until the queue is empty — otherwise the frames between
    // nextWave() and the first fighter being built would look "enemy-free" and re-trigger clear.
    // a mission sector stays open until its objective resolves (escort exit / defend hold / etc.)
    if (!aliveCombat && pendingSpawns.length === 0 && wave > 0 && !(mission && mission.status === 'active')) {
      if (noDamageWave) run.cleanWaves = (run.cleanWaves || 0) + 1;   // cleared a full wave untouched → no-damage star progress
      betweenWaves = true; waveTimer = 4; showBanner(tf('banner.waveClear', { n: wave }));
      if (campaignMode) {   // Operations campaign: BOUNDED level clear — distinct path, never the endless scheduler
        campaignWavesLeft--;
        const clvl = currentCampaignLevel();
        if ((clvl && clvl.isBoss) || campaignWavesLeft <= 0) { campaignLevelComplete(); return; }
        return;   // more bounded waves remain: the waveTimer auto-advances; NO mid-level tech screen
      }
      if (opMode && opSector === 'FINAL') { operationComplete(); return; }
      // Tech-screen cadence (balance pass 2026-06): in OPERATION mode the tech screen is also the
      // campaign-navigation hub (deployFromTech → openOpMap is the ONLY path to the next sector), so
      // it must always open. In ENDLESS the shop opens on a cadence (skip wave 1, then every 2nd wave
      // + after any boss) so it stops ejecting the player from the dogfight every ~60-90s; RP banks in
      // player.tp between visits. When skipped, the waveTimer above auto-advances to the next wave.
      if (opMode || shouldOpenTechScreen(wave, lastWaveWasBoss)) openTechScreen();
    }
  } else if (!choosingUpgrade) {
    waveTimer -= dt;
    if (waveTimer <= 0) { betweenWaves = false; nextWave(); }
  }
  processSpawnQueue(SPAWN_PER_FRAME);   // build a few queued enemies this frame
}

/* Boss-rush (F15): replaces the wave/tech loop. No waves, no R&D tech tree, no op-map — just the
   fixed boss gauntlet flown back-to-back. The next boss spawns once the arena is clear; the run
   completes when every boss in BOSS_RUSH_POOL has been defeated. bossRushIndex counts spawned legs;
   bossRushKilled (run.boss) counts defeats. Timed from bossRushT0 for the local best-time board. */
function spawnBossRushBoss() {
  const kind = bossRushNext(bossRushIndex);   // pure: the boss type for this leg (or null when done)
  if (!kind) return;
  spawnBoss();                                // reuse the F4 multi-phase boss spawner
  bossRushIndex++;
  showBanner(tf('bossrush.wave', { n: bossRushIndex, total: BOSS_RUSH_TOTAL }));
}
function handleBossRush(dt) {
  processSpawnQueue(SPAWN_PER_FRAME);
  if (bossRushDone(run.boss, BOSS_RUSH_TOTAL)) {   // every boss defeated → finish + record time
    if (state === 'playing') bossRushComplete();
    return;
  }
  const bossAlive = enemies.some(e => e.alive && e.type === 'boss');
  if (!bossAlive && pendingSpawns.length === 0) {
    if (bossRushIndex < BOSS_RUSH_TOTAL) {         // arena clear and more bosses to come → next leg
      betweenWaves = true; waveTimer -= dt;
      if (waveTimer <= 0) { waveTimer = 3; spawnBossRushBoss(); betweenWaves = false; }
    }
  }
}

/* First-run guided tutorial (F5): each frame, detect whether the player performed the CURRENT
   step's action from live player/run state and feed the matching event to the pure step machine
   (advanceTutorial → tutorialNext, ui.js/globals.js). Detection is action-based so the prompt only
   advances once the pilot actually does the thing — works identically for keyboard and touch input.
     step 0 pitch    : nose pitching (|pitchRate| past a clear threshold)
     step 1 throttle : throttle pushed past 0.6
     step 2 guns     : the run shot counter ticked up since we started/last advanced
     step 3 missile  : a full lock was achieved AND a missile was launched since baseline
     step 4 roll     : a barrel roll is mid-animation (double-tap Q/E → barrelRollAnim > 0) */
function tickTutorial() {
  if (typeof tutorial === 'undefined' || !tutorial.active || tutorial.done || !player) return;
  const step = TUTORIAL_STEPS[tutorial.step];
  if (step === 'pitch') {
    if (Math.abs(player.pitchRate || 0) > 0.25) advanceTutorial('pitched');
  } else if (step === 'throttle') {
    if ((player.throttle || 0) > 0.6) advanceTutorial('throttled');
  } else if (step === 'guns') {
    if ((run.shots || 0) > tutorial.prevShots) { tutorial.prevMissiles = run.missiles || 0; advanceTutorial('fired'); }
  } else if (step === 'missile') {
    if (player.lockedTarget && (run.missiles || 0) > tutorial.prevMissiles) advanceTutorial('missile');
  } else if (step === 'roll') {
    if (barrelRollAnim > 0) advanceTutorial('rolled');   // the 360° snap-roll is actually executing
  }
}

/* ---------------- input ---------------- */
addEventListener('keydown', e => {
  // Don't steal game keys while typing in a text field (callsign input, etc.)
  const _tag = document.activeElement && document.activeElement.tagName;
  if (_tag === 'INPUT' || _tag === 'TEXTAREA') return;
  keys[e.code] = true;
  if (GAME_CODES.has(e.code) || (e.ctrlKey && e.code === 'KeyS')) e.preventDefault();
  if (choosingUpgrade) {                 // tech tree open: Enter / Space / Esc deploys to the next wave
    if (!e.repeat && (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape' || e.code === 'KeyR')) { e.preventDefault(); deployFromTech(); }
    return;
  }
  if (onboarding) return;   // first-run language/brief screens capture all keyboard input
  if ((e.code === 'KeyH' || e.code === 'Escape') && !e.repeat) { toggleManual(); return; }
  if (state === 'hangar' && !paused && !e.repeat) {     // carousel: arrows browse jets, Enter launches
    if (e.code === 'ArrowLeft')  { e.preventDefault(); cycleJet(-1); return; }
    if (e.code === 'ArrowRight') { e.preventDefault(); cycleJet(1);  return; }
    if (e.code === 'Enter')      { e.preventDefault(); startGame(selectedJet); return; }
  }
  if (state !== 'playing' || e.repeat || paused) return;
  // Barrel-roll double-tap: Q or E pressed twice within BARREL_ROLL_THRESHOLD seconds
  if (e.code === 'KeyQ' || e.code === 'KeyE') {
    const now = performance.now() / 1000;
    if (rollDetect(now, barrelRollLastKeyTap, BARREL_ROLL_THRESHOLD) && rollCooldownGate(barrelRollCooldown)) {
      barrelRollRequest = true;
    }
    barrelRollLastKeyTap = now;
  }
  switch (e.code) {
    case 'KeyG': fireMissile(); break;
    case 'KeyX': deployFlares(); break;
    case 'KeyF': cycleLock(); break;
    case 'KeyR': useSpecial(); break;
    case 'KeyB': useSpecial(2); break;     // feature #3: equipped SLOT-2 special
    case 'KeyC': cycleCamera(); break;
    case 'KeyT': wingCommand('focus'); break;
    case 'KeyY': wingCommand('regroup'); break;
    case 'Digit1': awacsAction('strike'); break;     // AWACS orbital strike (key 1)
    case 'Digit2': awacsAction('resupply'); break;   // AWACS emergency resupply (key 2)
    case 'Digit3': awacsAction('jam'); break;        // AWACS jamming (key 3)
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousedown', e => { if (e.button === 2) mouseRight = true; });
addEventListener('mouseup', e => { if (e.button === 2) mouseRight = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/* ---------------- touch logic ---------------- */
// initTouchControls() + the unified flight-input layer live in js/controls.js.
// Auto-detect first touch, bind controls once, and reveal the on-screen pad in flight.
window.addEventListener('touchstart', function firstTouch() {
    initTouchControls();
    if(state === 'playing' && !paused) g('touchControls').classList.add('show');
    window.removeEventListener('touchstart', firstTouch);
});


/* ---------------- main loop ---------------- */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); lastDt = dt;
  if (seaMat) seaMat.uniforms.time.value = clock.elapsedTime;
  updateSunRig();
  if (paused) { renderer.render(scene, camera); return; }
  updateClouds(dt);

  if (state === 'hangar') {
    // C2: the jet preview now spins/renders in its OWN isolated loop (ui-hangar.js previewLoop) on a
    // dedicated canvas inside the card — previewJet is NOT in the shared scene, so nothing to do here.
    if (platform) platform.children[1].rotation.z += dt * 0.6;
  } else if (state === 'playing') {
    const ts = (player && player.slow > 0) ? 0.4 : 1;   // COMBAT TRANCE slows the world, not the player
    readFlightInput();   // compose touch/motion into flightInput before the player update consumes it
    updateWeather(dt * ts);   // advance turbulence phase + storm lightning before the player update reads it
    updatePlayer(dt);
    tickTutorial();   // first-run guided tutorial: gate stepped prompts on the player's own actions
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (!e.alive) continue; tickEnemyStatus(e, dt * ts); if (e.alive) updateEnemy(e, dt * ts); }
    cullDistantEnemies();   // F11: low tier hides far enemy meshes (.visible only; AI/markers/locks untouched)
    updateWingmen(dt * ts);
    updateBullets(dt, ts); updateMissiles(dt, ts); updateFlares(dt * ts); updateDecoys(dt); updateLoot(dt); updateParticles(dt * ts);
    for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i].alive) enemies.splice(i, 1);
    updateMission(dt * ts);   // tick the active sector mission + resolve win/fail
    if (bossRush) handleBossRush(dt);   // F15: fixed boss gauntlet — no waves / tech tree / op-map
    else handleWaves(dt);
    maybeSpawnCrate(dt);
    updateCamera(dt);
    updatePlayerShadow();
    audio.setEngineJet(player.jet && player.jet.id, player.throttle, clamp(player.speed / player.stats.maxSpeed, 0, 1));
    drawHUD(); drawRadar(); updateDom(dt);
  } else if (state === 'dead') {
    updateParticles(dt);
    camera.updateMatrixWorld();
  }
  renderer.render(scene, camera);
}

/* ---------------- hangar 3D-preview drag-to-rotate (touch + mouse) ----------------
   TRACK C2: the preview renders to its OWN isolated canvas (previewCanvas) inside the jet card, so a
   pointerdown ON that canvas is unambiguously a drag — no raycast denylist needed. A drag STARTS only
   when the pointerdown lands on previewCanvas; pointermove/up stay on the window so a drag that leaves
   the canvas still tracks. Horizontal = yaw, vertical = pitch (clamped ±PREVIEW_PITCH_MAX). */
function initPreviewDrag() {
  if (initPreviewDrag._bound) return; initPreviewDrag._bound = true;
  let lastX = 0, lastY = 0;
  addEventListener('pointerdown', (e) => {
    if (state !== 'hangar' || previewDragging) return;
    if (typeof previewCanvas === 'undefined' || !previewCanvas) return;
    if (e.target !== previewCanvas) return;            // only the preview canvas starts a drag — UI/scroll elsewhere untouched
    previewDragging = true; lastX = e.clientX; lastY = e.clientY;
    previewCanvas.style.cursor = 'grabbing'; e.preventDefault();
  });
  addEventListener('pointermove', (e) => {
    if (!previewDragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    previewYaw += dx * 0.01;
    previewPitch = clamp(previewPitch + dy * 0.01, -PREVIEW_PITCH_MAX, PREVIEW_PITCH_MAX);
    if (previewJet) previewJet.rotation.set(previewPitch, previewYaw, 0);
    e.preventDefault();
  });
  const endDrag = () => {
    if (!previewDragging) return;
    previewDragging = false; previewSpinResumeAt = performance.now() + 3000;   // auto-rotate resumes ~3s after release
    if (typeof previewCanvas !== 'undefined' && previewCanvas) previewCanvas.style.cursor = 'grab';
  };
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);
  addEventListener('resize', () => { if (typeof resizePreview === 'function') resizePreview(); });   // keep the preview canvas matched to its host box
}

/* ---------------- boot ---------------- */
initThree();
cacheEl();
loadBest();
loadSettings();
applyButtonStyle();   // apply persisted touch button opacity/layout before first touch
loadRival();
loadMeta();
buildHangar();
initOnboarding();
initPreviewDrag();   // hangar drag-to-rotate (raycast-gated, touch + mouse)
animate();
