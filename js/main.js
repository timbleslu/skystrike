
function groundSpawnsAllowed(wave, on) { return !!on && wave >= 2; }
function isStrikeWave(wave, on) { return !!on && wave >= 5 && wave % 5 === 0 && wave % 4 !== 0; }
function currentCampaignLevel() {
  if (!campaignOpId) return null;
  const op = opById(campaignOpId);
  return op ? (op.levels[campaignLevelIdx] || null) : null;
}
function nextWave() {
  wave++;
  noDamageWave = true;   // arm the per-wave no-damage star tracker; damagePlayer clears it on a hit
  resetAwacs();
  const strike = isStrikeWave(wave, groundWar);
  strikeWaveActive = strike;
  if (campaignMode && campaignOpId) {
    const lvl = currentCampaignLevel();
    const plan = levelPlan(lvl);
    const m = composeWave({ campaignPlan: plan, bossPhases: (lvl.boss && lvl.boss.phases) || null, bossWaveNext });
    strikeWaveActive = m.ground;
    bossWaveActive = lastWaveWasBoss = m.boss;
    applyWeather(m.weather); applyTimeOfDay(m.tod);
    startSectorMission(plan, wave);
    if (!m.objectives) {
      const sectorLine = m.boss ? t('banner.finalTarget') : t(lvl.nameKey); const condLine = weatherLabel();
      showBanner(condLine ? sectorLine + '  ·  ' + condLine : sectorLine);
      queueFighterWave(m.fighters);
      for (let i = 0; i < m.aces; i++) pendingSpawns.push(spawnAce);
      for (let i = 0; i < m.bombers; i++) pendingSpawns.push(m.mission === 'intercept' ? spawnInterceptTarget : spawnBomber);
      if (m.boss) {
        campaignBossPhases = m.bossPhases;
        if (rivalEnabled) { run.lastRivalWave = wave; pendingSpawns.push(spawnFinalRival); } else pendingSpawns.push(spawnBoss);
      }
      if (m.ground) queueStrikeSite(wave);
      const aceKey = campaignOpId + ':' + campaignLevelIdx;
      if (m.hostileAce && !run.sectorAceSpawned[aceKey]) { run.sectorAceSpawned[aceKey] = true; pendingSpawns.push(spawnHostileAce); }
    }
    return;
  }
  const m = composeWave({
    wave, strike, difficulty,
    weatherSeed,
    lockWeather: (player && player._weeklyEffects && player._weeklyEffects.lockWeather) || null,
    weeklyAces: (player && player._weeklyAces) || 0,
    weeklyWavePlan: (player && player._weeklyWavePlan) || null,
    countDelta: DIFFS[difficulty].count,
    groundAllowed: groundSpawnsAllowed(wave, groundWar),
    bossWaveNext,
    rivalDue: !strike && rivalDue(wave, run.lastRivalWave, rivalEnabled),
    rng: Math.random,
  });
  bossWaveNext = m.bossWaveNext;
  bossWaveActive = lastWaveWasBoss = m.bossWaveActive;
  applyWeather(m.weather);
  const _wCond = weatherLabel();
  if (m.strike) {
    showBanner(t('banner.strikeWave'));
    queueStrikeSite(wave);
    queueFighterWave(3);
    return;
  }
  queueFighterWave(m.fighters, m.formation);
  if (m.banner === 'boss') showBanner(t('banner.bossIncoming'));
  else if (m.banner === 'wildcard') showBanner(t('banner.wildcardWave'));
  else showBanner(_wCond ? tf('banner.wave', { n: wave }) + '  ·  ' + _wCond : tf('banner.wave', { n: wave }));
  if (m.boss) pendingSpawns.push(spawnBoss);
  for (let i = 0; i < m.aces; i++) pendingSpawns.push(spawnAce);
  if (m.rival) { run.lastRivalWave = wave; pendingSpawns.push(spawnRival); }
  if (m.bomber) pendingSpawns.push(spawnBomber);
  if (m.droneSwarm) { const dn = m.droneSwarm; pendingSpawns.push(() => spawnDroneSwarm(dn)); }
  for (let k = 0; k < m.ground; k++) pendingSpawns.push(spawnGround);
}
function processSpawnQueue(n) {
  // core.js spawnDrainCount owns the pure "how many to build this frame" decision; the FIFO drain +
  // closure invocation stay here (impure — the closures run THREE-bound spawn side effects).
  for (let i = spawnDrainCount(pendingSpawns.length, n); i > 0; i--) pendingSpawns.shift()();
}
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
function spawnEliteFighter(shapePool) {
  const e = createEnemy('fighter', airSpawnPos(2800, 4400, -300, 600, 450, 4300), { shapePool, useGLTF: true });
  e.elite = true; e.desprintUsed = false; e.sprintTimer = 0;
  return e;
}
function spawnAce() {
  const e = spawnEliteFighter(aceShapePool());
  e.aceName = jetNameForShape(e.shapeKey);
  e.callsign = genCallsign('ACE');
  e.hp = e.maxHp = 170 + wave * 9;
  e.turnRate = 1.5; e.gunRunCd = rand(1.5, 3);
  e.bulletAmmo = 75; e.missileAmmo = 2; e.flareAmmo = 1;
  styleElite(e, 0xffcf3a, 0x4a3300, 0.9, 0xffd24d, 0xffd24d);
  showBanner(t('banner.aceInbound'));
}
function spawnHostileAce() {
  const aceEntry = hostileAceFor(opSector);
  if (!aceEntry) return;
  const e = spawnEliteFighter(aceShapePool());
  e.aceName = jetNameForShape(e.shapeKey);
  e.callsign = aceEntry.callsign;
  e.hostileAce = true;
  e.hp = e.maxHp = Math.round((170 + wave * 9) * aceEntry.hpMul);
  e.turnRate = aceEntry.turnRate;
  e.speed = (e.speed || 280) * aceEntry.speed;
  e.gunRunCd = rand(1.2, 2.5);
  e.bulletAmmo = 90; e.missileAmmo = 3; e.flareAmmo = 2;
  styleElite(e, 0xd44fff, 0x330044, 1.0, 0xcc55ff, 0xcc44ff);
  showBanner(tf('banner.hostileAceInbound', { name: aceEntry.callsign }));
}
function spawnRival() {
  const e = spawnEliteFighter([rival.shape]);
  e.rival = true;
  e.aceName = rival.jetName;
  e.callsign = rival.name;
  e.hp = e.maxHp = rivalHpFor(wave, rival.level);
  e.turnRate = 1.55; e.gunRunCd = rand(1.2, 2.5);
  e.bulletAmmo = 120; e.missileAmmo = 3; e.flareAmmo = 2;
  e.rivalSpCd = 6;
  e.fleeing = false;
  if (rival.traits.indexOf('FLARE_WALL') !== -1) { e.flareAmmo = 4; e.flareWall = true; }
  if (rival.traits.indexOf('SCISSORS') !== -1) { e.turnRate *= 1.25; }
  if (rival.traits.indexOf('HEADHUNTER') !== -1) { e.headhunter = true; }
  if (rival.traits.indexOf('VETERAN') !== -1) { e.hp = e.maxHp = Math.round(e.maxHp * 1.2); e.turnRate *= 1.1; }
  styleElite(e, 0xff5a2a, 0x551100, 1.0, 0xff5a2a, 0xff7a3a);
  showBanner(tf('banner.rivalOnStation', { name: rival.name, lvl: rival.level }));
  return e;
}
function spawnFighter() {
  createEnemy('fighter', airSpawnPos(2600, 4600, -400, 650, 400, 4200));
}
function spawnFighterFormation(n, forceType) {
  const types = Object.keys(FORMATIONS);
  const type = (forceType && FORMATIONS[forceType]) ? forceType : types[randInt(0, types.length - 1)];
  const cfg = FORMATIONS[type];
  const slots = formationSlots(type, n, cfg.spacing);
  const leaderPos = airSpawnPos(2600, 4600, -400, 650, 400, 4200);
  // leader heading bores in toward the player so the whole formation flies in together (locals: createEnemy is
  // called between placements and may touch the global t-scratch, so we must NOT keep heading/right in scratch)
  const heading = new THREE.Vector3().copy(player.group.position).sub(leaderPos); heading.y *= 0.3;
  if (heading.lengthSq() < 1e-6) heading.set(0, 0, -1); else heading.normalize();
  const right = new THREE.Vector3().copy(heading).cross(UPV);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0); else right.normalize();
  const leader = createEnemy('fighter', leaderPos);
  dirToQuat(heading, leader.logicQuat); leader.group.quaternion.copy(leader.logicQuat);
  for (let i = 1; i < slots.length; i++) {
    const off = slots[i];   // world slot = leaderPos + right*off.x - heading*off.z (off.z = behind the leader)
    const fx = leaderPos.x + right.x * off.x - heading.x * off.z;
    const fz = leaderPos.z + right.z * off.x - heading.z * off.z;
    const fy = clamp(leaderPos.y + right.y * off.x - heading.y * off.z, terrainH(fx, fz) + 400, 4200);
    const fol = createEnemy('fighter', new THREE.Vector3(fx, fy, fz));
    dirToQuat(heading, fol.logicQuat); fol.group.quaternion.copy(fol.logicQuat);
    fol.formation = { type: type, leaderRef: leader, slot: i, offset: off };
  }
  return leader;
}
function queueFighterWave(n, forceType) {
  if (n >= 3) { pendingSpawns.push(() => spawnFighterFormation(n, forceType)); return; }
  for (let i = 0; i < n; i++) pendingSpawns.push(spawnFighter);
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
  return e;
}
function spawnInterceptTarget() { spawnBomber()._missionTarget = true; }
function spawnFinalRival() {
  const e = spawnRival();
  e.finalCap = true; e.noFlee = true; e.hp = e.maxHp = Math.round(e.maxHp * 1.25);
  if (campaignBossPhases) e._phaseCfg = campaignBossPhases;
}
const CAMPAIGN_BOSS_SHAPE = { warlord: 'J20', glacier: 'SU57', corsair: 'F22', northWind: 'J50' };
function spawnCampaignBoss(lvl) {
  const shape = CAMPAIGN_BOSS_SHAPE[lvl.id] || 'SU57';
  const pp = player.group.position;
  const x = pp.x + rand(-1400, 1400), z = pp.z - 4400;
  const pos = new THREE.Vector3(x, clamp(pp.y + 500, terrainH(x, z) + 600, 4200), z);
  const e = createEnemy('fighter', pos, { shapePool: [shape], useGLTF: true, elite: true });
  e.elite = true; e.campaignBoss = true; e.finalCap = true; e.noFlee = true; e.desprintUsed = true;
  e.callsign = t(lvl.boss.callsignKey); e.aceName = jetNameForShape(shape);
  e.hp = e.maxHp = 1150; e.turnRate = 1.55; e.speed = 260; e.gunRunCd = rand(1.2, 2.2);
  e.bulletAmmo = 500; e.missileAmmo = 18; e.flareAmmo = 6; e.flares = 4;
  e.phase = 1; e._phaseCfg = lvl.boss.phases;
  styleElite(e, 0xc8389a, 0x40002a, 1.1, 0xff50dc, 0xff50dc);
  dirToQuat(t1.copy(pp).sub(pos).normalize(), e.logicQuat); e.group.quaternion.copy(e.logicQuat);
  showBanner(tf('banner.bossArrives', { name: e.callsign }));
  audio.warn();
  return e;
}
function spawnBoss() {
  const px = player.group.position.x + rand(-1200, 1200), pz = player.group.position.z - 4200, py = player.group.position.y + 450;
  const e = createEnemy('boss', new THREE.Vector3(px, py, pz));
  if (campaignBossPhases) e._phaseCfg = campaignBossPhases;
  return e;
}
function spawnGround() {
  createEnemy('ground', groundSpawnPos(1600, 4200));
}
function spawnGroundAt(gkind, x, z) {
  return createEnemy('ground', new THREE.Vector3(x, terrainH(x, z), z), { gkind: gkind });
}
function queueStrikeSite(w, size) {
  let center = groundSpawnPos(2000, 3200);
  { const lp = landPoint(player.group.position.x, player.group.position.z, 2000, 3400); if (lp) center = new THREE.Vector3(lp.x, terrainH(lp.x, lp.z), lp.z); }
  const small = size === 'outpost', big = size === 'fortified';
  const nSam = small ? 1 : (big ? 3 : 2) + Math.min(2, Math.floor(w / 10));
  const nAaa = small ? 1 : (big ? 3 : 2) + Math.min(2, Math.floor(w / 12));
  const nTruck = small ? 2 : 3 + Math.min(3, Math.floor(w / 8));
  const site = (kind, x, z) => { const e = spawnGroundAt(kind, x, z); e.strikeSite = true; return e; };
  pendingSpawns.push(() => site('radar', center.x, center.z));
  if (big) pendingSpawns.push(() => site('radar', center.x + rand(-160, 160), center.z + rand(-160, 160)));
  const ringN = nSam + nAaa;
  for (let i = 0; i < ringN; i++) {
    const kind = i < nSam ? 'sam' : 'aaa';
    const ang = (i / ringN) * TWO_PI + rand(-0.25, 0.25), r = rand(340, 560);
    pendingSpawns.push(() => site(kind, center.x + Math.cos(ang) * r, center.z + Math.sin(ang) * r));
  }
  const cAng = rand(0, TWO_PI);
  const cDir = new THREE.Vector3(Math.cos(cAng), 0, Math.sin(cAng));
  for (let k = 0; k < nTruck; k++) {
    const off = 700 + k * 120;
    pendingSpawns.push(() => {
      const e = site('truck', center.x + cDir.x * off + rand(-45, 45), center.z + cDir.z * off + rand(-45, 45));
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

function updateBossSpecials(e, dt, dist) {
  if (e.specialCd == null) { e.specialCd = rand(5, 8); e.attack = null; e.tele = 0; e.teleMax = 1; }
  const u = e.group.userData;

  if (e.attack) {
    e.tele -= dt;
    const f = 1 - clamp(e.tele / e.teleMax, 0, 1);
    if (u.core) u.core.material.emissiveIntensity = 1.2 + f * 4.8 + Math.sin(performance.now() * 0.03) * 0.6;
    if (u.ring) u.ring.scale.setScalar(1 + f * 0.55);
    if (e.tele <= 0) {
      fireBossAttack(e, dist);
      e.attack = null;
      if (u.core) u.core.material.emissiveIntensity = 1.2;
      if (u.ring) u.ring.scale.setScalar(1);
      e.specialCd = (e.phase >= 3 ? rand(2.6, 4.2) : e.phase >= 2 ? rand(3.5, 5.5) : rand(6, 9)) / ((e.phaseState && e.phaseState.fireMul) || 1);
    }
    return;
  }

  if (dist > 3400) { e.specialCd = Math.min(e.specialCd, 1.5); return; }
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
  const enr = e.phase >= 2;
  const p3 = e.phase >= 3;
  if (e.attack === 'barrage') {
    const count = (p3 ? 16 : enr ? 12 : 8) + ((e.phaseState && e.phaseState.extraMissiles) || 0);
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
    spawnDroneSwarm(p3 ? 6 : enr ? 5 : 3, pp);
  } else if (e.attack === 'pulse') {
    spawnBigRing(pp, 0xff39c8, 150);
    empFlash = 0.5;
    audio.explode(true); audio.blip(120, 0.5, 'sine', 0.16, 40);
    if (player.invuln <= 0 && pp.distanceTo(player.group.position) < 900) {
      damagePlayer(p3 ? 46 : enr ? 38 : 26, pp);
    }
    for (let i = 0; i < wingmen.length; i++) { const w = wingmen[i]; if (w.alive && pp.distanceToSquared(w.group.position) < 810000) damageWingman(w, p3 ? 85 : enr ? 70 : 50); }
  }
}

function spawnBigRing(pos, color, maxK) {
  const ring = new THREE.Mesh(ASSET.bigRingGeo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  ring.position.copy(pos); if (camera) ring.lookAt(camera.position); scene.add(ring);
  particles.push({ mesh: ring, vel: null, life: 0.9, max: 0.9, type: 'ring', ringK: maxK || 80 });
}

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
// shared escort state (wingmen + CCAs); `o` holds the per-kind fields
function wingmanState(mesh, spd, o) {
  return Object.assign({
    group: mesh, vel: fwdOf(player.group, new THREE.Vector3()).multiplyScalar(player.speed || spd),
    logicQuat: mesh.quaternion.clone(), bank: 0, baseScale: mesh.scale.x, _spd: spd, alive: true,
    target: null, retargetCd: 0, rtb: 0, hitFlash: 0, trailT: 0, sprintT: 0, priorityCd: 0, flareCd: 0, forced: null, defend: 0,
  }, o);
}
function spawnCCA(spawnPos) {
  if (!player) return null;
  const ccaShape = 'CCAJET';
  const mesh = buildJet(0x0d9cd4, 0x00ffee, SHAPES[ccaShape]);
  mesh.scale.setScalar(0.82);
  if (mesh.userData.body) { mesh.userData.body.emissive = new THREE.Color(0x003a6e); mesh.userData.body.emissiveIntensity = 1.5; }
  const engs = mesh.userData.engines || [];
  for (let i = 0; i < engs.length; i++) { engs[i].glow.material.color.setHex(0x00ffee); engs[i].flame.material.color.setHex(0x00ddff); }
  mesh.position.copy(spawnPos);
  mesh.quaternion.copy(player.group.quaternion);
  scene.add(mesh);
  const nm = 'CCA-' + (Math.random() * 99 | 0);
  const w = wingmanState(mesh, 340, {
    hp: 100, maxHp: 100, side: wingmen.length % 2 === 0 ? 1 : -1, fireCd: 0.08, missileCd: rand(1.2, 2.5),
    name: nm, temp: true, expire: 16, cca: true, shape: ccaShape, jetName: ccaShape, flares: 2,
  });
  wingmen.push(w);
  w.target = nearestEnemyForWingman(w);
  return w;
}
function wingmanSlot(side, out) {
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
  wingmen.push(wingmanState(mesh, 320, {
    hp: temp ? 80 : 130, maxHp: temp ? 80 : 130, side, fireCd: rand(0.2, 0.8), missileCd: rand(2, 5),
    name: nm, temp: !!temp, expire: temp ? 15 : 0, cca: !!temp,
    shape: wShape, jetName: jetNameForShape(wShape), flares: 3, specialCd: rand(25, 40),
  }));
  if (!temp) { showBanner(tf('banner.onStation', { name: wingmen[wingmen.length - 1].name })); audio.ui(); }
}
function damageWingman(w, amt) {
  if (!w.alive) return;
  w.hp -= amt; w.hitFlash = 0.1;
  if (w.hp <= 0) {
    w.alive = false; explode(w.group.position, true); despawnObject(w.group);
    w.rtb = 13;
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
    const s = e.type === 'ground' ? d2 * 2.4 : (e.type === 'drone' ? d2 * 0.8 : d2);
    if (s < bestScore) { bestScore = s; best = e; }
  }
  return best;
}
function wingCommand(kind) {
  if (!firstAliveWingman()) { audio.ui(); showBanner(t('banner.wingNone')); return; }
  if (kind === 'focus') {
    const tgt = wingPlayerLock() || nearestEnemyInFront(0.4);
    if (!tgt) { audio.ui(); showBanner(t('banner.wingNoTarget')); return; }
    for (let i = 0; i < wingmen.length; i++) { const w = wingmen[i]; if (!w.alive) continue; w.forced = tgt; w.target = tgt; w.defend = 0; w.retargetCd = 1.2; }
    showBanner(t('banner.wingFocus')); audio.power();
  } else {
    for (let i = 0; i < wingmen.length; i++) { const w = wingmen[i]; if (!w.alive) continue; w.forced = null; w.target = null; w.defend = 6; }
    showBanner(t('banner.wingRegroup')); audio.ui();
  }
}
function wingHoldStation(w, desired, dt) {
  wingmanSlot(w.side, t1);
  const toS = t5.copy(t1).sub(w.group.position); const sd = toS.length();
  if (sd > 14) desired.copy(toS).normalize(); else desired.copy(fwdOf(player.group, t4));
  w._spd = lerp(w._spd, clamp((player.speed || 300) * (sd > 240 ? 1.45 : 1.0), 230, 920), 2 * dt);
}
function flyWingman(w, desired, turnRate, dt) {
  const agl = w.group.position.y - terrainH(w.group.position.x, w.group.position.z);
  if (agl < 180) desired.y = Math.max(desired.y, 0.35);
  desired.normalize();

  dirToQuat(desired, q1);
  const pf = fwdQ(w.logicQuat, tA);   // heading BEFORE the turn — bank follows the turn rate
  w.logicQuat.rotateTowards(q1, turnRate * dt);
  const nf = fwdQ(w.logicQuat, t4);
  const cross = t5.copy(pf).cross(nf);
  w.bank = damp(w.bank, clamp(-cross.y / Math.max(dt, 1e-3) * 0.25, -0.7, 0.7), 3, dt);
  q2.setFromAxisAngle(ZAX, w.bank);
  w.group.quaternion.copy(w.logicQuat).multiply(q2);
  w.vel.copy(nf).multiplyScalar(w._spd);
  w.group.position.addScaledVector(w.vel, dt);

  const u = w.group.userData;
  if (u.engines) for (let k = 0; k < u.engines.length; k++) u.engines[k].flame.material.opacity = 0.45 + Math.random() * 0.25;
  w.trailT -= dt;
  if (w.trailT <= 0 && !inCloud(w.group.position)) { spawnTrail(w.group.position, w.cca ? 0x49b6ff : WING_TEAL, 0.3); w.trailT = 0.06; }
  if (w.hitFlash > 0) { w.hitFlash -= dt; w.group.scale.setScalar(w.baseScale * (1 + (w.hitFlash > 0 ? 0.12 : 0))); }
  else w.group.scale.setScalar(w.baseScale);
}
function updateCCA(w, dt) {
  w.retargetCd -= dt;
  if (w.forced && !w.forced.alive) w.forced = null;
  if (!wingApplyOrder(w)) {
    if (w.forced) { w.target = w.forced; }
    else if (!w.target || !w.target.alive || w.retargetCd <= 0) { w.target = nearestEnemyForWingman(w); w.retargetCd = 0.4; }
  }

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
          w.alive = false; explode(w.group.position, false); despawnObject(w.group); return;
        }
      } else {
        const lead = interceptPoint(w.group.position, tp, w.target.vel || ZERO, 1400, tLead);
        desired.copy(lead || tp).sub(w.group.position).normalize();
      }
    } else { w.target = null; }
  }
  if (!engaging) {
    wingHoldStation(w, desired, dt);
  } else {
    w._spd = lerp(w._spd, 420, 2 * dt);
  }
  flyWingman(w, desired, 3.5, dt);

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
    const inactiveJet = e.type !== 'ground';
    const r = inactiveJet ? GFX_CULL_JET : GFX_CULL_FAR;
    const vis = e.group.position.distanceToSquared(px) <= r * r;
    if (e.group.visible !== vis) e.group.visible = vis;
  }
}
function updateWingmen(dt) {
  wingOrderTick();
  for (let i = wingmen.length - 1; i >= 0; i--) {
    const w = wingmen[i];
    if (w.alive && w.group) animEngines(w.group, 0.85);
    if (w.temp) {
      w.expire -= dt;
      if (!w.alive || w.expire <= 0) {
        if (w.alive && w.group) { explode(w.group.position, false); despawnObject(w.group); }
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
  w.retargetCd -= dt;
  if (w.forced && !w.forced.alive) w.forced = null;
  if (w.defend > 0) w.defend -= dt;
  if (!wingApplyOrder(w)) {
    if (w.forced) { w.target = w.forced; }
    else if (!w.target || !w.target.alive || w.retargetCd <= 0) { w.target = (w.defend > 0 ? null : nearestEnemyForWingman(w)); w.retargetCd = 0.5; }
  }

  let desired = t2, engaging = false, aimGood = false, td = Infinity;
  if (w.target && w.target.alive) {
    const tp = w.target.group.position;
    td = w.group.position.distanceTo(tp);
    if (td < 4400) {
      engaging = true;
      const lead = interceptPoint(w.group.position, tp, w.target.vel || ZERO, 1400, tLead);
      desired.copy(lead || tp).sub(w.group.position).normalize();
      const nf0 = fwdQ(w.logicQuat, t4);
      aimGood = td < 2600 && nf0.angleTo(t5.copy(tp).sub(w.group.position).normalize()) < 0.13;
    } else { w.target = null; }
  }
  if (!engaging) {
    wingHoldStation(w, desired, dt);
  } else {
    w._spd = lerp(w._spd, 365, 2 * dt);
    w.sprintT -= dt;
    if (td > 2200 && w.sprintT <= 0) {
      w._spd = clamp(w._spd * 1.4, 320, 700);
      w.sprintT = 9.5;
    }
  }

  flyWingman(w, desired, 2.5, dt);

  w.fireCd -= dt; w.missileCd -= dt;
  if (engaging && aimGood && w.fireCd <= 0) { wingmanFireGun(w); w.fireCd = rand(0.09, 0.14); }
  if (engaging && w.missileCd <= 0 && w.target && w.target.alive) {
    const td2 = w.group.position.distanceTo(w.target.group.position);
    if (td2 < 3000 && td2 > 280) { wingmanFireMissile(w); w.missileCd = rand(6, 10); }
  }

  w.priorityCd -= dt;
  if (engaging && w.priorityCd <= 0 && w.target && w.target.alive) {
    const tt = w.target.type;
    if ((tt === 'boss' || tt === 'bomber') && w.group.position.distanceTo(w.target.group.position) < 2500) {
      wingmanFireMissile(w); w.priorityCd = 3;
    }
  }

  w.specialCd -= dt;
  if (w.specialCd <= 0 && engaging && w.target && w.target.alive) wingmanSpecial(w);

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
    const lead = interceptPoint(w.group.position, w.target.group.position, w.target.vel || ZERO, 1500, tLead);
    dir = t2.copy(lead || w.target.group.position).sub(w.group.position).normalize();
  } else dir = t2.copy(fwd);
  dir.x += rand(-0.012, 0.012); dir.y += rand(-0.012, 0.012); dir.normalize();
  const b = getBullet(); b.enemy = false; b.ai = true; b.byCCA = !!w.cca; b.dmg = 5.5 * wingDmgMul; b.life = 1.6;
  b.mesh.material = ASSET.bulletMat; b.mesh.scale.setScalar(1);
  b.mesh.position.copy(w.group.position).addScaledVector(fwd, 14);
  b.vel.copy(dir).multiplyScalar(1500).addScaledVector(w.vel, 0.4);
  bullets.push(b);
  if (Math.random() < 0.5) audio.blip(900, 0.035, 'square', 0.04, 560);
}
function wingmanFireMissile(w) {
  const dir = fwdQ(w.logicQuat, t1);
  const m = spawnMissile(w.group.position, dir, (w.target && w.target.alive) ? w.target : null, false, 0.9 * wingDmgMul);
  if (m) { m.ai = true; m.byCCA = !!w.cca; m.trailColor = 0xdfe2e6; }
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
const WING_BURST = { 'F-35': 3, EFT: 4, 'J-36': 6, 'J-50': 3, 'F-22': 3 };
function wingmanSpecial(w) {
  if (!w.target || !w.target.alive) return;
  const pos = w.group.position;
  const jet = JETS.find(j => j.shape === w.shape);
  const id = jet ? jet.id : null;

  function burstMissiles(count) {
    const tgts = aliveByDistance(pos);
    if (!tgts.length) return;
    for (let k = 0; k < count; k++) {
      const tgt = tgts[k % tgts.length];
      const dir = fwdQ(w.logicQuat, new THREE.Vector3()).applyAxisAngle(UPV, rand(-0.4, 0.4));
      dir.y += rand(-0.08, 0.15); dir.normalize();
      const m = spawnMissile(pos, dir, tgt, false, 0.9 * wingDmgMul);
      if (m) { m.ai = true; m.hardHome = true; m.trailColor = 0xdfe2e6; }
    }
  }

  if (id === 'SU-57') {
    spawnShockwave(pos); explode(pos, true);
    blastEnemies(pos, 340 * 340, 90, null, true);
    for (let i = 0; i < missiles.length; i++) {
      const m = missiles[i];
      if (m.enemy && pos.distanceToSquared(m.mesh.position) < 420 * 420) { m.decoyed = true; if (Math.random() < 0.7) m.life = 0.05; }
    }
  } else if (id === 'J-20') {
    empFlash = Math.max(empFlash || 0, 0.55);
    for (let i = 0; i < missiles.length; i++) {
      const m = missiles[i];
      if (m.enemy && !m.decoyed && pos.distanceToSquared(m.mesh.position) < 650 * 650) {
        explode(m.mesh.position, false); m.life = 0;
      }
    }
    burstMissiles(2);
  } else if (id === 'RAFALE') {
    for (let i = 0; i < missiles.length; i++) {
      const m = missiles[i];
      if (m.enemy && !m.decoyed && pos.distanceToSquared(m.mesh.position) < 550 * 550) m.decoyed = true;
    }
    burstMissiles(3);
  } else if (id === 'TEJAS') {
    spawnDecoys(2);
    burstMissiles(1);
  } else if (id === 'F-47') {
    const pt = pos.clone().addScaledVector(fwdQ(w.logicQuat, t1), 200);
    spawnCCA(pt);
    burstMissiles(2);
  } else {
    burstMissiles(WING_BURST[id] || 2);
  }

  audio.power();
  w.specialCd = rand(30, 45);
}

function clearWingmen() {
  for (let i = 0; i < wingmen.length; i++) despawnObject(wingmen[i].group);
  wingmen.length = 0;
}

function handleWaves(dt) {
  let aliveCombat = false;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.alive && (strikeWaveActive ? e.type !== 'bomber' && e.gkind !== 'truck' : e.type !== 'ground' && e.type !== 'bomber')) { aliveCombat = true; break; }
  }
  if (!betweenWaves) {
    // Don't declare the wave clear until the queue is empty — otherwise the frames between
    // nextWave() and the first fighter being built would look "enemy-free" and re-trigger clear.
    if (!aliveCombat && pendingSpawns.length === 0 && wave > 0 && !(mission && mission.status === 'active')) {
      if (noDamageWave) run.cleanWaves = (run.cleanWaves || 0) + 1;
      betweenWaves = true; waveTimer = 4; if (!campaignMode) showBanner(tf('banner.waveClear', { n: wave }));
      if (campaignMode) {
        campaignWavesLeft--;
        const clvl = currentCampaignLevel();
        if ((clvl && clvl.isBoss) || campaignWavesLeft <= 0) beginCampaignEnd('win');
        return;
      }
      // Tech-screen cadence (balance pass 2026-06): the shop opens on a cadence (skip wave 1, then every 2nd
      // wave + after any boss) so it stops ejecting the player from the dogfight every ~60-90s; RP banks in
      // player.tp between visits. When skipped, the waveTimer above auto-advances to the next wave.
      if (MODE_POLICY[modeKeyFor({ campaignMode, opMode, dailyMode, weeklyActive: weeklyMode, bossRush })].opensTechShop || shouldOpenTechScreen(wave, lastWaveWasBoss)) openTechScreen();
    }
  } else if (!choosingUpgrade) {
    waveTimer -= dt;
    if (waveTimer <= 0) { betweenWaves = false; nextWave(); }
  }
  processSpawnQueue(SPAWN_PER_FRAME);
}

function spawnBossRushBoss() {
  const kind = bossRushNext(bossRushIndex);
  if (!kind) return;
  spawnBoss();
  bossRushIndex++;
  showBanner(tf('bossrush.wave', { n: bossRushIndex, total: BOSS_RUSH_TOTAL }));
}
function handleBossRush(dt) {
  processSpawnQueue(SPAWN_PER_FRAME);
  if (bossRushDone(run.boss, BOSS_RUSH_TOTAL)) {
    if (state === 'playing') bossRushComplete();
    return;
  }
  let bossAlive = false;
  for (let i = 0; i < enemies.length; i++) if (enemies[i].alive && enemies[i].type === 'boss') { bossAlive = true; break; }
  if (!bossAlive && pendingSpawns.length === 0) {
    if (bossRushIndex < BOSS_RUSH_TOTAL) {
      betweenWaves = true; waveTimer -= dt;
      if (waveTimer <= 0) { waveTimer = 3; spawnBossRushBoss(); betweenWaves = false; }
    }
  }
}

function tickTutorial() {
  if (!tutorial.active || tutorial.done || !player) return;
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
    if (barrelRollAnim > 0) advanceTutorial('rolled');
  }
}

addEventListener('keydown', e => {
  // Don't steal game keys while typing in a text field (callsign input, etc.)
  const _tag = document.activeElement && document.activeElement.tagName;
  if (_tag === 'INPUT' || _tag === 'TEXTAREA') return;
  keys[e.code] = true;
  if (GAME_CODES.has(e.code) || (e.ctrlKey && e.code === 'KeyS')) e.preventDefault();
  if (choosingUpgrade) {
    if (!e.repeat && (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape' || e.code === 'KeyR')) { e.preventDefault(); deployFromTech(); }
    return;
  }
  if (onboarding) return;
  if ((e.code === 'KeyH' || e.code === 'Escape') && !e.repeat) { toggleManual(); return; }
  if (state === 'hangar' && !paused && !e.repeat) {
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
    case 'KeyB': useSpecial(2); break;
    case 'KeyC': cycleCamera(); break;
    case 'KeyT': wingCommand('focus'); break;
    case 'KeyY': wingCommand('regroup'); break;
    case 'Digit1': awacsAction('strike'); break;
    case 'Digit2': awacsAction('resupply'); break;
    case 'Digit3': awacsAction('jam'); break;
    case 'Digit4': issueWingOrder('ENGAGE'); break;
    case 'Digit5': issueWingOrder('COVER'); break;
    case 'Digit6': issueWingOrder('REGROUP'); break;
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousedown', e => { if (e.button === 2) mouseRight = true; });
addEventListener('mouseup', e => { if (e.button === 2) mouseRight = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

window.addEventListener('touchstart', function firstTouch() {
    initTouchControls();
    if(state === 'playing' && !paused) g('touchControls').classList.add('show');
    window.removeEventListener('touchstart', firstTouch);
});

let hangarCoverT = 0;
function animate() {
  requestAnimationFrame(animate);
  syncManualBtn();
  const dt = Math.min(clock.getDelta(), 0.05); lastDt = dt;
  if (seaMat) seaMat.uniforms.time.value = clock.elapsedTime;
  updateSunRig();
  // AUDIO: gate the synthesized storm rain bed EVERY frame, BEFORE the paused early-return so the
  // bed ducks to silence while paused / in menus / on weather change (tickWeather reads state+paused
  // +weather.type itself; muted/volume apply upstream via the master gain). See AudioEngine.tickWeather.
  audio.tickWeather();
  // the hangar is an opaque full-viewport panel — once its 0.5s fade-in is done nothing behind it is visible,
  // so skip the world sim + draw (the first frames still draw, which also compiles the scene's shaders at boot)
  const covered = state === 'hangar' && currentScreen === 'hangar' && !g('hangar').classList.contains('hide');
  if (!covered) hangarCoverT = 0; else if (!hangarCoverT) hangarCoverT = performance.now();
  if (covered && performance.now() - hangarCoverT > 600) return;
  if (paused) { renderFrame(); return; }
  updateClouds(dt);

  if (state === 'hangar') {
    if (platform) platform.children[1].rotation.z += dt * 0.6;
  } else if (state === 'playing') {
    const ts = (player && player.slow > 0) ? 0.4 : 1;   // COMBAT TRANCE slows the world, not the player
    readFlightInput();
    updateWeather(dt * ts);
    if (!(campaignEnd && campaignEnd.frozen)) updatePlayer(dt);
    tickTutorial();
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (!e.alive) continue; tickEnemyStatus(e, dt * ts); if (e.alive) updateEnemy(e, dt * ts); }
    cullDistantEnemies();
    updateWingmen(dt * ts);
    updateBullets(dt, ts); updateMissiles(dt, ts); updateFlares(dt * ts); updateDecoys(dt); updateLoot(dt); updateParticles(dt * ts);
    for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i].alive) enemies.splice(i, 1);
    updateMission(dt * ts);
    tickCampaignEnd(dt);
    if (bossRush) handleBossRush(dt);
    else handleWaves(dt);
    maybeSpawnCrate(dt);
    updateCamera(dt);
    updatePlayerShadow();
    audio.setEngineJet(player.jet && player.jet.id, player.throttle, clamp(player.speed / player.stats.maxSpeed, 0, 1));
    const hudView = hudViewState();
    drawHUD(hudView); drawRadar(); updateDom(dt, hudView);
    drawWeatherOverlay(h2d, dt);
  } else if (state === 'dead') {
    updateParticles(dt);
    camera.updateMatrixWorld();
  }
  renderFrame();
}

function initPreviewDrag() {
  if (initPreviewDrag._bound) return; initPreviewDrag._bound = true;
  let lastX = 0, lastY = 0;
  addEventListener('pointerdown', (e) => {
    if (state !== 'hangar' || hangarPreview.dragging) return;
    if (!previewCanvas || e.target !== previewCanvas) return;
    hangarPreview.dragging = true; lastX = e.clientX; lastY = e.clientY;
    previewCanvas.style.cursor = 'grabbing'; e.preventDefault();
  });
  addEventListener('pointermove', (e) => {
    if (!hangarPreview.dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    hangarPreview.yaw += dx * 0.01;
    hangarPreview.pitch = clamp(hangarPreview.pitch + dy * 0.01, -PREVIEW_PITCH_MAX, PREVIEW_PITCH_MAX);
    if (previewJet) previewJet.rotation.set(hangarPreview.pitch, hangarPreview.yaw, 0);
    e.preventDefault();
  });
  const endDrag = () => {
    if (!hangarPreview.dragging) return;
    hangarPreview.dragging = false; hangarPreview.spinResumeAt = performance.now() + 3000;
    if (previewCanvas) previewCanvas.style.cursor = 'grab';
  };
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);
  addEventListener('resize', resizePreview);
}

function wingPlayerLock() {
  if (!player) return null;
  if (player.lockedTarget && player.lockedTarget.alive) return player.lockedTarget;
  if (player.lockTarget && player.lockTarget.alive) return player.lockTarget;
  return null;
}
// COVER priority: nearest enemy actively aiming at the player (entities.js maintains e.aimingPlayer each tick).
function wingCoverTarget(w) {
  let best = null, bs = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive || !e.group || !e.aimingPlayer) continue;
    const d2 = w.group.position.distanceToSquared(e.group.position);
    if (d2 < bs) { bs = d2; best = e; }
  }
  return best;
}
function wingApplyOrder(w) {
  const order = player ? (player.wingOrder || 'FREE') : 'FREE';
  if (order === 'FREE') return false;
  if (order === 'REGROUP') { w.forced = null; w.target = null; return true; }
  if (order === 'ENGAGE')  { w.forced = null; w.target = (player.wingTarget && player.wingTarget.alive) ? player.wingTarget : nearestEnemyForWingman(w); return true; }
  if (order === 'COVER')   { w.forced = null; w.target = wingCoverTarget(w) || nearestEnemyForWingman(w); return true; }
  return false;
}
// Per-frame fallback: while ENGAGE, the latched bogey dying (targetLost) or the player's lock moving off it
// (lockLost) reverts the order to FREE via the pure state machine. No latched bogey ⇒ general engage, no revert.
function wingOrderTick() {
  if (!player || (player.wingOrder || 'FREE') !== 'ENGAGE') return;
  const wt = player.wingTarget;
  if (!wt) return;
  if (!wt.alive) issueWingOrder('targetLost');
  else if (wingPlayerLock() !== wt) issueWingOrder('lockLost');
}
function issueWingOrder(cmd) {
  if (!player || state !== 'playing') return;
  const cur = player.wingOrder || 'FREE';
  const res = wingmanOrder(cur, cmd);
  player.wingOrder = res.order;
  player.wingTarget = res.order === 'ENGAGE' ? (cmd === 'ENGAGE' ? wingPlayerLock() : player.wingTarget) : null;
  if (res.banner) { showBanner(t(res.banner)); (cmd === 'targetLost' || cmd === 'lockLost') ? audio.warn() : audio.power(); }
  else if (WINGMAN_ORDERS.indexOf(cmd) >= 0) audio.ui();
}

initThree();
cacheEl();
loadBest();
loadSettings();
applyButtonStyle();
loadRival();
loadMeta();
buildHangar();
initOnboarding();
initPreviewDrag();
animate();
