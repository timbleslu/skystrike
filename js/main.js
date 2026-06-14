/* SKYSTRIKE — main.js: wave/boss/wingman spawning, input & touch controls, main animation loop, boot. Load 6th (last). */

/* ---------------- waves ---------------- */
function groundSpawnsAllowed(wave, on) { return !!on && wave >= 2; }
function isStrikeWave(wave, on) { return !!on && wave >= 5 && wave % 5 === 0 && wave % 4 !== 0; }
function nextWave() {
  wave++;
  player._cheatUsed = false;   // APEX PREDATOR's save refreshes every wave
  const strike = isStrikeWave(wave, groundWar);
  strikeWaveActive = strike;
  if (opMode && opSector) {
    const plan = sectorPlan(opSector, wave);
    strikeWaveActive = plan.ground;
    applyWeather(plan.weather); applyTimeOfDay(plan.tod);   // sector condition: gameplay modifiers + sky/fog visuals + fresh env
    startSectorMission(plan, wave);   // sets `mission` + spawns escort convoy / defend asset
    const sectorLine = plan.boss ? t('banner.finalTarget') : tf('banner.sector', { s: t('op.' + opSector) });
    const condLine = weatherLabel(); showBanner(condLine ? sectorLine + '  ·  ' + condLine : sectorLine);   // intro line names the condition
    for (let i = 0; i < plan.fighters; i++) pendingSpawns.push(spawnFighter);
    for (let i = 0; i < plan.aces; i++) pendingSpawns.push(spawnAce);
    for (let i = 0; i < plan.bombers; i++) pendingSpawns.push(plan.mission === 'intercept' ? spawnInterceptTarget : spawnBomber);
    // FINAL boss graduates from the nemesis system — the rival ace IS the sector cap
    if (plan.boss) { if (rivalEnabled) { run.lastRivalWave = wave; pendingSpawns.push(spawnFinalRival); } else pendingSpawns.push(spawnBoss); }
    if (plan.ground) queueStrikeSite(wave);
    if (plan.rival && rivalEnabled && !plan.boss) { run.lastRivalWave = wave; pendingSpawns.push(spawnRival); }
    else if (rivalDue(wave, run.lastRivalWave, rivalEnabled) && !plan.boss && !plan.ground) { run.lastRivalWave = wave; pendingSpawns.push(spawnRival); }
    return;
  }
  applyWeather(rollWeather(weatherSeed + wave));   // standalone play: deterministic per-run weather, weighted toward clear
  if (strike) {
    showBanner(t('banner.strikeWave'));
    queueStrikeSite(wave);
    for (let i = 0; i < 3; i++) pendingSpawns.push(spawnFighter);
    return;
  }
  const count = clamp(3 + wave + DIFFS[difficulty].count, 2, 10);
  for (let i = 0; i < count; i++) pendingSpawns.push(spawnFighter);   // fighters first \u2192 first drained = combat enemy
  if (wave % 4 === 0) { pendingSpawns.push(spawnBoss); showBanner(t('banner.bossIncoming')); }
  else showBanner(tf('banner.wave', { n: wave }));
  if (wave >= 3 && wave % 4 !== 0 && Math.random() < (0.45 + difficulty * 0.12)) pendingSpawns.push(spawnAce);
  if (!strike && rivalDue(wave, run.lastRivalWave, rivalEnabled)) { run.lastRivalWave = wave; pendingSpawns.push(spawnRival); }
  if (wave >= 4 && wave % 4 !== 0 && Math.random() < 0.32) pendingSpawns.push(spawnBomber);
  if (wave >= 3 && wave % 4 !== 0 && Math.random() < 0.5) {
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
  const e = createEnemy('fighter', airSpawnPos(2800, 4400, -300, 600, 450, 4300), { shapePool: aceShapePool() });
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
function spawnRival() {
  const e = createEnemy('fighter', airSpawnPos(2800, 4400, -300, 600, 450, 4300), { shapePool: [rival.shape] });
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
  if (e && enemies.length > before) { e.finalCap = true; e.noFlee = true; e.hp = e.maxHp = Math.round(e.maxHp * 1.25); }
}
function spawnBoss() {
  const px = player.group.position.x + rand(-1200, 1200), pz = player.group.position.z - 4200, py = player.group.position.y + 450;
  createEnemy('boss', new THREE.Vector3(px, py, pz));
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
      e.specialCd = e.enraged ? rand(3.5, 5.5) : rand(6, 9);
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
  const enr = e.enraged;
  if (e.attack === 'barrage') {
    // radial fan of homing missiles — wide spread so positioning + flares matter
    const count = enr ? 12 : 8;
    const fwd = fwdQ(e.logicQuat, t3);
    const spread = enr ? 2.6 : 1.9;
    for (let i = 0; i < count; i++) {
      const a = (count > 1 ? (i / (count - 1) - 0.5) : 0) * spread;
      const dir = t1.copy(fwd).applyAxisAngle(UPV, a);
      dir.y += rand(-0.05, 0.13); dir.normalize();
      spawnMissile(pp, dir, null, true, 0.8);
    }
    audio.missile(); audio.blip(220, 0.3, 'sawtooth', 0.12, 70);
  } else if (e.attack === 'drones') {
    spawnDroneSwarm(enr ? 5 : 3, pp);          // plays its own banner + audio
  } else if (e.attack === 'pulse') {
    spawnBigRing(pp, 0xff39c8, 150);
    empFlash = 0.5;
    audio.explode(true); audio.blip(120, 0.5, 'sine', 0.16, 40);
    // instant close-range AoE — the telegraph gave the player time to break away
    if (player.invuln <= 0 && pp.distanceTo(player.group.position) < 900) {
      damagePlayer(enr ? 38 : 26, pp);
    }
    for (let i = 0; i < wingmen.length; i++) { const w = wingmen[i]; if (w.alive && pp.distanceToSquared(w.group.position) < 810000) damageWingman(w, enr ? 70 : 50); }
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
    forced: null, defend: 0,
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
  const col = w.cca ? 0x49b6ff : WING_TEAL;
  const m = spawnMissile(w.group.position, dir, (w.target && w.target.alive) ? w.target : null, false, 0.9 * wingDmgMul);
  if (m) { m.ai = true; m.byCCA = !!w.cca; m.trailColor = col; if (m.halo) m.halo.material.color.setHex(col); }
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
      betweenWaves = true; waveTimer = 4; showBanner(tf('banner.waveClear', { n: wave }));
      if (opMode && opSector === 'FINAL') { operationComplete(); return; }
      openTechScreen();   // open the R&D tech tree before the next wave
    }
  } else if (!choosingUpgrade) {
    waveTimer -= dt;
    if (waveTimer <= 0) { betweenWaves = false; nextWave(); }
  }
  processSpawnQueue(SPAWN_PER_FRAME);   // build a few queued enemies this frame
}

/* ---------------- input ---------------- */
addEventListener('keydown', e => {
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
  switch (e.code) {
    case 'KeyG': fireMissile(); break;
    case 'KeyX': deployFlares(); break;
    case 'KeyF': cycleLock(); break;
    case 'KeyR': useSpecial(); break;
    case 'KeyC': cycleCamera(); break;
    case 'KeyT': wingCommand('focus'); break;
    case 'KeyY': wingCommand('regroup'); break;
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
    if (previewJet) { previewJet.rotation.y += dt * 0.5; previewJet.position.y = 2.5 + Math.sin(performance.now() * 0.0012) * 0.6; }
    if (platform) platform.children[1].rotation.z += dt * 0.6;
  } else if (state === 'playing') {
    const ts = (player && player.slow > 0) ? 0.4 : 1;   // COMBAT TRANCE slows the world, not the player
    readFlightInput();   // compose touch/motion into flightInput before the player update consumes it
    updateWeather(dt * ts);   // advance turbulence phase + storm lightning before the player update reads it
    updatePlayer(dt);
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (!e.alive) continue; tickEnemyStatus(e, dt * ts); if (e.alive) updateEnemy(e, dt * ts); }
    updateWingmen(dt * ts);
    updateBullets(dt, ts); updateMissiles(dt, ts); updateFlares(dt * ts); updateDecoys(dt); updateLoot(dt); updateParticles(dt * ts);
    for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i].alive) enemies.splice(i, 1);
    updateMission(dt * ts);   // tick the active sector mission + resolve win/fail
    handleWaves(dt);
    maybeSpawnCrate(dt);
    updateCamera(dt);
    updatePlayerShadow();
    audio.setEngine(player.throttle, clamp(player.speed / player.stats.maxSpeed, 0, 1));
    drawHUD(); drawRadar(); updateDom(dt);
  } else if (state === 'dead') {
    updateParticles(dt);
    camera.updateMatrixWorld();
  }
  renderer.render(scene, camera);
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
animate();
