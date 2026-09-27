/* combat.js — player flight & weapons, bullets, missiles, flares, decoys, loot, particles, damage/kill resolution, targeting, specials. */

const eul = new THREE.Euler();
const aimT1 = new THREE.Vector3(), aimT2 = new THREE.Vector3(), aimT3 = new THREE.Vector3();   // aim-assist scratch

/* ---------------- bullets ---------------- */
function getBullet() {
  let b = BPOOL.pop();
  if (!b) b = { mesh: new THREE.Mesh(ASSET.bulletGeo, ASSET.bulletMat), vel: new THREE.Vector3(), life: 0, dmg: 0, enemy: false };
  b.ai = false; b.oriented = false;
  scene.add(b.mesh); return b;
}
function recycleBullet(b) { detachFromScene(b.mesh); BPOOL.push(b); }

// ADRENALINE: 1.0 at full HP, grows as HP is lost
function berserkMul() { return player.berserk ? 1 + player.berserk * (1 - clamp(player.hp / player.maxHp, 0, 1)) : 1; }
function frenzyAmt() { return player.frenzyMax ? clamp(player.frenzy / player.frenzyMax, 0, 1) : 0; }
const GUN_OFFS = [-2.6, 2.6], GUN_OFFS_OD = [-3.6, -1.2, 1.2, 3.6];   // barrel lateral offsets; overdrive fires a 4-round burst
function fireGun() {
  if (player.noCannon) { player.gunCd = 0.3; return; }
  if (player.gunCd > 0) return;
  if (player.bullets <= 0) { player.gunCd = 0.25; audio.ui(); return; }
  const od = player.overdrive > 0;
  const fz = frenzyAmt();
  player.gunCd = (od ? 0.05 : 0.07) * player.fireRateMul * (1 - 0.4 * fz);
  const fwd = fwdOf(player.group, t1), rgt = rightOf(player.group, t2);
  const dmg = player.stats.gunDmg * player.gunDmgMul * (od ? 1.5 : 1) * berserkMul() * (1 + 0.3 * fz);
  const offs = od ? GUN_OFFS_OD : GUN_OFFS;
  for (const off of offs) {
    const b = getBullet(); b.enemy = false; b.dmg = dmg; b.life = 2.0; b.mesh.material = ASSET.bulletMat; b.mesh.scale.setScalar(1);
    b.pierce = player.pierce; b.passed = null;
    b.mesh.position.copy(player.group.position).addScaledVector(rgt, off).addScaledVector(fwd, 12);
    b.vel.copy(fwd).multiplyScalar(1400 * player.bulletSpeedMul).addScaledVector(player.vel, 0.9);
    if (od) b.vel.addScaledVector(rgt, off * 1.4);
    bullets.push(b);
  }
  player.bullets = Math.max(0, player.bullets - offs.length);
  const mz = player.group.userData.muzzle;
  if (mz) { mz.visible = true; mz.scale.setScalar(rand(11, 18)); mz.material.rotation = rand(0, TWO_PI); player.muzzleT = 0.045; }
  player.shake = Math.max(player.shake, 0.12);
  player.firingT = 0.12;   // stealth detection tell (missions.js)
  audio.gun();
  haptic(8);
  run.shots += offs.length;
}

function updateBullets(dt, ts) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; const sdt = b.enemy ? dt * ts : dt;
    if (!b.oriented) { b.oriented = true; dirToQuat(t3.copy(b.vel).normalize(), b.mesh.quaternion); }
    b.life -= sdt; b.mesh.position.addScaledVector(b.vel, sdt);
    let dead = b.life <= 0;
    if (!dead) {
      if (b.enemy) {
        if (player.invuln <= 0 && b.mesh.position.distanceToSquared(player.group.position) < 576) { damagePlayer(b.dmg, b.mesh.position); dead = true; }
        else { for (let k = 0; k < wingmen.length; k++) { const w = wingmen[k]; if (w.alive && b.mesh.position.distanceToSquared(w.group.position) < 900) { damageWingman(w, b.dmg); dead = true; break; } } }
      } else {
        for (let k = 0; k < enemies.length; k++) {
          const e = enemies[k]; if (!e.alive) continue;
          if (b.passed && b.passed.indexOf(e) >= 0) continue;   // AP round already punched through this one
          const r = e.type === 'boss' ? 72 : e.type === 'ground' ? 17 : e.type === 'drone' ? 16 : 22;
          if (b.mesh.position.distanceToSquared(e.group.position) < r * r) {
            let bDmg = b.dmg;
            if (!b.ai) { e._lastPlayerWp = 'gun'; if (e.type === 'ground' && player.rktMul) bDmg *= player.rktMul; }
            damageEnemy(e, bDmg, b.mesh.position, !b.ai, b.byCCA);
            if (!b.ai) { spawnHitMarker(); run.hits++; if (lastCrit && player.critChain) critBlast(b.mesh.position); }
            if (!b.ai && player.burnDps && e.alive) { e.burnT = player.burnTime; e.burnDps = player.burnDps; }
            if (!b.ai && b.pierce > 0) { b.pierce--; (b.passed || (b.passed = [])).push(e); }
            else dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.mesh.position.y < TERRAIN_MAX_H && b.mesh.position.y < terrainH(b.mesh.position.x, b.mesh.position.z)) dead = true;
    if (dead) { recycleBullet(b); bullets.splice(i, 1); }
  }
}

/* ---------------- missiles ---------------- */
function fireMissile() {
  if (player.missileCd > 0) return;
  if (player.missiles <= 0) { audio.ui(); return; }
  let tgt = (player.lockedTarget && player.lockedTarget.alive && player.lockProgress >= 1) ? player.lockedTarget : null;
  let ambush = false;
  if (player.stealthField > 0) {   // cloaked fire-and-forget: auto-home the nearest enemy in front for an ambush kill
    const near = nearestEnemyInFront(0.72);
    if (near) { tgt = near; ambush = true; }
  }
  const dm = player.missileDmgMul * (player.overdrive > 0 ? 1.4 : 1) * berserkMul() * (1 + 0.3 * frenzyAmt());
  player.missileCd = 0.55;
  player.firingT = 0.12;
  const salvo = 1 + player.mslSwarm;   // SWARM RACK birds are free: only one leaves the rack
  const baseDir = fwdOf(player.group, t1).clone();
  for (let s = 0; s < salvo; s++) {
    const dir = baseDir.clone();
    if (salvo > 1) dir.applyAxisAngle(UPV, (s - (salvo - 1) / 2) * 0.16).normalize();
    const m = spawnMissile(player.group.position, dir, tgt, false, dm);
    if (ambush) { m.ambush = true; m.hardHome = true; }
    if ((player.mslHard || salvo > 1) && tgt) m.hardHome = true;
    if (player.splashRadius) { m.splash = player.splashRadius; m.splashDmg = player.splashDmg; }
  }
  player.missiles -= 1; run.missiles += salvo; run.pMissiles += salvo;
  audio.missile();
  haptic(25);
}
function spawnMissile(pos, dir, target, enemy, dmgMul) {
  const mesh = buildMissileMesh(enemy);
  mesh.position.copy(pos).addScaledVector(dir, 11);
  scene.add(mesh);
  const obj = {
    mesh, exhaust: mesh.userData.exhaust,
    vel: dir.clone().multiplyScalar(enemy ? 500 : 600), speed: enemy ? 500 : 600,
    maxSpeed: enemy ? 880 : 1050, target, enemy, life: 7, dmg: (enemy ? 16 : 34) * dmgMul,
    armed: 0.22, decoy: null, decoyed: false, smokeT: 0, trailColor: enemy ? 0xd9d2cc : 0xdfe2e6, hardHome: false, ambush: false,
  };
  missiles.push(obj);
  return obj;
}
function updateMissiles(dt, ts) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    const sdt = m.enemy ? dt * ts : dt;        // bullet-time slows enemy ordnance, not yours
    m.life -= sdt; m.armed -= sdt;
    let tgtPos = null;
    if (m.enemy) {
      const ev = player.mslEvade;
      if (player.jammer > 0) { m.decoyed = true; if (m.maxSpeed > 600) m.maxSpeed = 600; }
      if (!m.decoyed && !m.holo && decoys.length) {
        for (let k = 0; k < decoys.length; k++) { const d = decoys[k]; if (d.life > 0 && m.mesh.position.distanceToSquared(d.mesh.position) < 250000 && Math.random() < 0.9) { m.holo = d; m.decoyed = true; break; } }
      }
      if (!m.decoyed && !m.decoy) {
        const pr = clamp(0.82 + ev * 0.4 + (player.flarePro ? 0.12 : 0), 0, 0.99);
        for (let k = 0; k < flares.length; k++) { const f = flares[k]; if (f.owner !== 'enemy' && m.mesh.position.distanceToSquared(f.mesh.position) < 144400 && Math.random() < pr) { m.decoy = f; m.decoyed = true; break; } }
      }
      if (m.holo && m.holo.life > 0) tgtPos = m.holo.mesh.position;
      else if (m.decoy && m.decoy.life > 0) tgtPos = m.decoy.mesh.position;
      else if (m.decoyed) tgtPos = null;        // spoofed/jammed: fly ballistic, never reacquire
      else if (!player.stealth) tgtPos = player.group.position;
    } else {
      // enemy flares spoof player missiles
      if (!m.decoy) { for (let k = 0; k < flares.length; k++) { const f = flares[k]; if (f.owner === 'enemy' && m.mesh.position.distanceToSquared(f.mesh.position) < 67600 && Math.random() < EVADE.flareSpoofChance) { m.decoy = f; break; } } }
      if (m.decoy && m.decoy.life > 0) tgtPos = m.decoy.mesh.position;
      else if (m.target && m.target.alive && !m.target.isInCloud) tgtPos = m.target.group.position;
    }
    const cur = t2.copy(m.vel).normalize();
    if (tgtPos) {
      const rate = m.enemy ? 2.6 * (1 - 0.5 * player.mslEvade) : (m.hardHome ? 5.5 : 3.4);
      const des = t1.copy(tgtPos).sub(m.mesh.position).normalize();
      cur.lerp(des, clamp(rate * sdt, 0, 1)).normalize();
    }
    m.speed = Math.min(m.maxSpeed, m.speed + 850 * sdt);
    m.vel.copy(cur).multiplyScalar(m.speed);
    m.mesh.position.addScaledVector(m.vel, sdt);
    dirToQuat(cur, m.mesh.quaternion);

    if (m.exhaust) m.exhaust.scale.setScalar(5.5 + 1.6 * (m.speed / m.maxSpeed) + rand(-0.5, 0.5));
    m.smokeT -= sdt; if (m.smokeT <= 0) { spawnMissileTrail(m.mesh.position, m.trailColor); m.smokeT = 0.02; }

    let hit = false;
    if (m.enemy) {
      // POINT-DEFENSE LASER
      if (player.pointDefense && m.armed <= 0 && m.mesh.position.distanceToSquared(player.group.position) < 810000 && Math.random() < player.pointDefense * sdt * 3.2) {
        firePdBeam(player.group.position, m.mesh.position, 0x9ff0ff);
        explode(m.mesh.position, false); audio.blip(1500, 0.05, 'square', 0.07, 900); hit = true;
      }
      // GUARDIAN ESCORTS: wingmen run their own point-defense
      if (!hit && player.escortPD && m.armed <= 0) {
        for (let wi = 0; wi < wingmen.length; wi++) {
          const w = wingmen[wi]; if (!w.alive) continue;
          if (m.mesh.position.distanceToSquared(w.group.position) < 422500 && Math.random() < 0.55 * sdt * 3.2) {
            firePdBeam(w.group.position, m.mesh.position, w.cca ? 0x49b6ff : 0x2dffb0);
            explode(m.mesh.position, false); audio.blip(1400, 0.05, 'square', 0.06, 850); hit = true; break;
          }
        }
      }
      if (!hit && m.armed <= 0 && player.invuln <= 0 && m.mesh.position.distanceToSquared(player.group.position) < 3600) {
        let mDmg = m.dmg;
        if (m.fromGround && player.bellyArmor) mDmg *= player.bellyArmor;
        shakeCam(0.5); damagePlayer(mDmg, m.mesh.position); explode(m.mesh.position, true); hit = true;
      }
    } else {
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k]; if (!e.alive) continue;
        const r = e.type === 'boss' ? 130 : e.type === 'bomber' ? 95 : e.type === 'drone' ? 50 : 60;
        if (m.mesh.position.distanceToSquared(e.group.position) < r * r) {
          if (!m.ai) e._lastPlayerWp = 'missile';
          if (m.ambush && e.type !== 'boss') { killEnemy(e, !m.ai, m.byCCA); }
          else if (e.type === 'boss' || e.elite || e.type === 'bomber') { damageEnemy(e, m.dmg * 1.6, m.mesh.position, !m.ai, m.byCCA); }
          else if (e.type === 'ground') {
            let gDmg = m.dmg * 1.6;
            if (!m.ai && player.agmMul) gDmg *= player.agmMul;
            damageEnemy(e, gDmg, m.mesh.position, !m.ai, m.byCCA);
          }
          else { if (!m.ai) { player.combo++; player.comboTimer = 2.2; player.score += Math.round(60 * player.scoreMul); } killEnemy(e, !m.ai, m.byCCA); }
          if (!m.ai) spawnHitMarker();
          explode(m.mesh.position, true);
          if (!m.ai && m.splash) missileSplash(m.mesh.position, m.splashDmg, m.splash, e);
          hit = true; break;
        }
      }
    }
    if (!hit && m.holo && m.holo.life > 0 && m.mesh.position.distanceToSquared(m.holo.mesh.position) < 2500) { explode(m.mesh.position, false); m.holo.life -= 1.2; hit = true; }
    if (!hit && m.decoy && m.decoy.life > 0 && m.mesh.position.distanceToSquared(m.decoy.mesh.position) < 1600) { explode(m.mesh.position, false); hit = true; }
    if (!hit && m.mesh.position.y < TERRAIN_MAX_H && m.mesh.position.y < terrainH(m.mesh.position.x, m.mesh.position.z) + 4) { explode(m.mesh.position, true); hit = true; }
    if (hit || m.life <= 0) { detachFromScene(m.mesh); missiles.splice(i, 1); }
  }
}

/* ---------------- flares ---------------- */
function deployFlares() {
  if (player.flareCd > 0) return;
  if (player.flares <= 0) { audio.ui(); return; }
  player.flareCd = 0.45; player.flares--;
  run.pFlares++;
  const back = fwdOf(player.group, t1).multiplyScalar(-1), up = upOf(player.group, t2);
  const count = 3 + (player.flarePro ? 2 : 0);
  const fresh = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(ASSET.flareGeo, ASSET.flareMat); scene.add(m);
    m.position.copy(player.group.position).addScaledVector(up, rand(-6, 6));
    const v = back.clone().multiplyScalar(rand(60, 150)); v.x += rand(-60, 60); v.y += rand(-90, -30); v.z += rand(-60, 60);
    const f = { mesh: m, vel: v, life: player.flarePro ? 4.0 : 3.2, owner: 'player' };
    flares.push(f); fresh.push(f);
  }
  // actively seduce missiles already tracking the player so popping flares feels decisive
  const grab = clamp(0.85 + player.mslEvade * 0.3 + (player.flarePro ? 0.1 : 0), 0, 0.99);
  for (let i = 0; i < missiles.length; i++) {
    const m = missiles[i];
    if (!m.enemy || m.decoyed) continue;
    if (m.mesh.position.distanceToSquared(player.group.position) < 1440000 && Math.random() < grab) {
      m.decoy = fresh[(Math.random() * fresh.length) | 0]; m.decoyed = true;
    }
  }
  audio.flare();
}
function updateFlares(dt) {
  for (let i = flares.length - 1; i >= 0; i--) {
    const f = flares[i]; f.life -= dt; f.vel.y -= 120 * dt; f.vel.multiplyScalar(1 - 0.5 * dt);
    f.mesh.position.addScaledVector(f.vel, dt);
    f.smokeT = (f.smokeT || 0) - dt;
    if (f.smokeT <= 0) { spawnSmoke(f.mesh.position, 0xffcc66, 0.45); f.smokeT = 0.028; }
    if (f.life <= 0) {
      if (f.owner === 'player' && player.flakFlares) missileSplash(f.mesh.position, player.flakFlares, 260, null);   // FLAK BLOOM
      detachFromScene(f.mesh); flares.splice(i, 1);
    }
  }
}

/* ---------------- holographic decoys (Tejas) ---------------- */
function spawnDecoys(n) {
  for (let i = 0; i < n; i++) {
    const g = buildJet(0x39e6ff, 0x9af6ff, SHAPES[player.jet.shape]);
    holoTint(g);
    const ang = (i / n) * TWO_PI + rand(-0.4, 0.4);
    g.position.copy(player.group.position).add(new THREE.Vector3(Math.cos(ang) * rand(45, 95), rand(-25, 25), Math.sin(ang) * rand(45, 95)));
    g.quaternion.copy(player.group.quaternion);
    const vel = fwdOf(player.group, new THREE.Vector3()).multiplyScalar(Math.max(160, player.speed * rand(0.7, 1.0)));
    vel.x += rand(-50, 50); vel.z += rand(-50, 50);
    scene.add(g);
    decoys.push({ mesh: g, vel, life: 6, max: 6, spin: rand(-0.5, 0.5), bobT: rand(0, 6) });
  }
}
function updateDecoys(dt) {
  const now = performance.now();
  for (let i = decoys.length - 1; i >= 0; i--) {
    const d = decoys[i]; d.life -= dt;
    d.mesh.position.addScaledVector(d.vel, dt);
    d.vel.multiplyScalar(1 - 0.25 * dt);
    d.bobT += dt; d.mesh.position.y += Math.sin(d.bobT * 3) * 6 * dt;
    d.mesh.rotation.z += d.spin * dt;
    const op = 0.42 * Math.min(1, d.life / 1.0) * (0.72 + 0.28 * Math.sin(now * 0.02 + i));
    d.mesh.traverse(o => { if (o.isMesh && o.material) o.material.opacity = op; });
    if (d.life <= 0) { despawnObject(d.mesh); decoys.splice(i, 1); }   // frees the per-decoy holo material clones
  }
}

/* ---------------- loot & supply crates ---------------- */
let crateTimer = 9;
const MAX_CRATES = 3;

function spawnLoot(pos) {
  const m = new THREE.Mesh(ASSET.lootGeo, ASSET.lootMat);
  m.position.copy(pos); scene.add(m);
  loots.push({ mesh: m, kind: 'drop', life: 20, t: rand(0, TWO_PI), radius: 70,
    give: { bullets: 120, missiles: 4, flares: 4, hp: 14 } });
}

function spawnCrate(pos) {
  const grp = buildCrate(); grp.position.copy(pos); scene.add(grp);
  loots.push({ mesh: grp, kind: 'crate', life: 34, t: rand(0, TWO_PI), radius: 95,
    give: { bullets: 260, missiles: 6, flares: 6, hp: 18 } });
}

function maybeSpawnCrate(dt) {
  crateTimer -= dt;
  if (crateTimer > 0) return;
  // gap stretches from ~11-17s to ~18-28s by wave 14 so late-game resource pressure returns
  const lateF = clamp((wave - 4) / 10, 0, 1);
  crateTimer = rand(11 + 7 * lateF, 17 + 11 * lateF);
  let count = 0; for (let i = 0; i < loots.length; i++) if (loots[i].kind === 'crate') count++;
  if (count >= MAX_CRATES) return;
  const ang = rand(0, TWO_PI), r = rand(900, 1900);
  const px = player.group.position.x + Math.cos(ang) * r;
  const pz = player.group.position.z + Math.sin(ang) * r;
  const py = clamp(player.group.position.y + rand(-250, 250), terrainH(px, pz) + 300, 4200);
  spawnCrate(new THREE.Vector3(px, py, pz));
}

function collectLoot(l) {
  const give = l.give;
  if (give.bullets)  player.bullets  = Math.min(player.maxBullets,  player.bullets  + give.bullets);
  if (give.missiles) player.missiles = Math.min(player.maxMissiles, player.missiles + give.missiles);
  if (give.flares)   player.flares   = Math.min(player.maxFlares,   player.flares   + give.flares);
  if (give.hp)       player.hp       = Math.min(player.maxHp,       player.hp       + give.hp);
  audio.power(); empFlash = 0.4;
  if (l.kind === 'crate') showBanner(t('banner.supplyCrate'));
}

function updateLoot(dt) {
  const now = performance.now();
  for (let i = loots.length - 1; i >= 0; i--) {
    const l = loots[i]; l.life -= dt; l.t += dt;
    if (l.kind === 'crate') {
      const u = l.mesh.userData;
      l.mesh.position.y += Math.sin(now * 0.002 + l.t) * 8 * dt;
      if (u.box) u.box.rotation.y += dt * 0.8;
      if (u.ring) u.ring.rotation.z += dt * 1.6;
      if (u.beacon) u.beacon.material.opacity = 0.6 + 0.4 * Math.sin(now * 0.006);
      if (u.edges) u.edges.material.opacity = (l.life < 5 && Math.sin(now * 0.02) < 0) ? 0.25 : 1;
    } else {
      l.mesh.rotation.y += dt * 2; l.mesh.rotation.x += dt * 1.3;
      l.mesh.position.y += Math.sin(now * 0.003 + l.t) * 6 * dt;
    }
    // TRACTOR FIELD: draw small pickups toward the player
    if (player.lootMagnet && l.kind === 'drop') {
      const dx = player.group.position.x - l.mesh.position.x;
      const dy = player.group.position.y - l.mesh.position.y;
      const dz = player.group.position.z - l.mesh.position.z;
      const dd = Math.hypot(dx, dy, dz);
      if (dd < player.lootMagnet && dd > 1) {
        const pull = (260 + (1 - dd / player.lootMagnet) * 520) * dt;
        l.mesh.position.x += dx / dd * pull;
        l.mesh.position.y += dy / dd * pull;
        l.mesh.position.z += dz / dd * pull;
      }
    }
    if (l.mesh.position.distanceToSquared(player.group.position) < l.radius * l.radius) {
      collectLoot(l); detachFromScene(l.mesh); loots.splice(i, 1); continue;
    }
    if (l.life <= 0) { detachFromScene(l.mesh); loots.splice(i, 1); }
  }
}

/* ---------------- particles ---------------- */
const _xpV = new THREE.Vector3();   // explode()-only scratch: callers may pass the shared t1 as `pos` (flakBurst)
function explode(pos, big) {
  audio.explode(big);
  // white-hot core flash
  const f = particleSprite(glowTex(), true, false, 0xfff2cc, 1);
  f.position.copy(pos); f.scale.setScalar(big ? 110 : 55); scene.add(f);
  particles.push({ mesh: f, life: 0.22, max: 0.22, type: 'flash', grow: big ? 320 : 180 });
  // additive fireball bloom
  const glow = particleSprite(glowTex(), true, false, 0xff8a30, 0.5);
  glow.position.copy(pos); glow.scale.setScalar(big ? 190 : 100); scene.add(glow);
  particles.push({ mesh: glow, life: 0.5, max: 0.5, type: 'flash', grow: big ? 110 : 60, op: 0.5 });
  // churning fireball
  const nf = big ? 7 : 4;
  for (let i = 0; i < nf; i++) {
    const fb = particleSprite(fireTex(), true, false, 0xffffff, 0.95, rand(0, TWO_PI));
    fb.position.copy(pos).add(_xpV.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(big ? 16 : 7));
    fb.scale.setScalar(rand(0.7, 1.3) * (big ? 95 : 48)); scene.add(fb);
    particles.push({ mesh: fb, vel: new THREE.Vector3(rand(-26, 26), rand(-6, 44), rand(-26, 26)), life: rand(0.45, 0.8), max: 0.8, type: 'fire', grow: (big ? 70 : 42), rot: rand(-2.4, 2.4) });
  }
  // over the particle budget: keep the flash + fireball (the feedback), skip the secondary dressing
  const rich = particles.length < 620;
  const n = rich ? (big ? 24 : 13) : 0;
  for (let i = 0; i < n; i++) {
    const s = particleSpark(i % 2 ? 0xffaa33 : 0xff6633);
    s.position.copy(pos);
    const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(90, 260) * (big ? 1.6 : 1));
    dirToQuat(_xpV.copy(v).normalize(), s.quaternion); scene.add(s);
    particles.push({ mesh: s, vel: v, life: rand(0.5, 1.1), max: 1.1, type: 'spark' });
  }

  const numDebris = !rich ? 0 : big ? randInt(7, 14) : randInt(3, 7);
  for (let i = 0; i < numDebris; i++) {
    const m = new THREE.Mesh(ASSET.fragGeo, ASSET.fragMat);
    m.position.copy(pos).add(_xpV.set(rand(-3, 3), rand(-3, 3), rand(-3, 3)));
    const vel = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1.5), rand(-1, 1)).normalize().multiplyScalar(rand(80, 220));
    m.rotation.set(rand(0, TWO_PI), rand(0, TWO_PI), rand(0, TWO_PI));
    scene.add(m);
    particles.push({ mesh: m, vel, life: rand(1.5, 3.5), max: 3.5, type: 'debris', emberT: 0 });
  }

  if (rich) for (let i = 0; i < (big ? 9 : 5); i++) spawnSmoke(pos, 0x20242a, big ? 2.6 : 1.5);
  // ground strikes throw up a ring of dust hugging the deck
  const gh = Math.max(terrainH(pos.x, pos.z), -10);
  if (rich && pos.y - gh < 30) {
    for (let i = 0; i < (big ? 8 : 5); i++) {
      const a = rand(0, TWO_PI), r = rand(10, big ? 60 : 34);
      const d = particleSprite(cloudPuffTex(), false, true, 0x8a7a62, 0.55, rand(0, TWO_PI));
      d.position.set(pos.x + Math.cos(a) * r, gh + rand(4, 14), pos.z + Math.sin(a) * r);
      d.scale.setScalar(rand(26, 54)); scene.add(d);
      particles.push({ mesh: d, vel: new THREE.Vector3(Math.cos(a) * 28, rand(6, 16), Math.sin(a) * 28), life: rand(1.2, 2.0), max: 2.0, type: 'smokeS', grow: 30, rot: rand(-0.8, 0.8) });
    }
  }
  if (big) spawnShockwave(pos, 15, 0.5);
}
function spawnSmoke(pos, color, scl) {
  if (particles.length > 620) return;
  const m = particleSprite(cloudPuffTex(), false, true, color, 0.55, rand(0, TWO_PI));
  m.position.copy(pos).add(t1.set(rand(-4, 4), rand(-4, 4), rand(-4, 4)));
  m.scale.setScalar(scl * rand(16, 26)); scene.add(m);
  particles.push({ mesh: m, vel: new THREE.Vector3(rand(-8, 8), rand(8, 22), rand(-8, 8)), life: rand(1.0, 1.9), max: 1.9, type: 'smokeS', grow: 26, rot: rand(-1.2, 1.2) });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; const t = clamp(p.life / p.max, 0, 1);
    if (p.vel) p.mesh.position.addScaledVector(p.vel, dt);
    if (p.type === 'flash') { p.mesh.scale.addScalar(p.grow * dt); p.mesh.material.opacity = t * (p.op || 0.9); }
    else if (p.type === 'spark') { p.vel.multiplyScalar(1 - 2 * dt); p.mesh.material.opacity = t; }
    else if (p.type === 'ring') { const k = 1 + (1 - t) * (p.ringK || 46); p.mesh.scale.setScalar(k); p.mesh.material.opacity = t * t * (p.ringOp || 0.85); if (camera) p.mesh.lookAt(camera.position); }
    else if (p.type === 'trail') { p.mesh.scale.addScalar(p.grow * dt); p.mesh.material.opacity = t * 0.4; }
    else if (p.type === 'fire') {
      p.mesh.scale.addScalar(p.grow * dt);
      p.mesh.material.rotation += p.rot * dt;
      p.mesh.material.opacity = t * t * 0.95;
      p.vel.multiplyScalar(1 - 1.2 * dt);
    }
    else if (p.type === 'smokeS') {
      p.mesh.scale.addScalar(p.grow * dt);
      p.mesh.material.rotation += p.rot * dt;
      p.mesh.material.opacity = t * 0.55;
      p.vel.multiplyScalar(1 - 0.9 * dt);
    }
    else if (p.type === 'debris') {
      p.vel.y -= 150 * dt;
      p.vel.multiplyScalar(1 - 0.5 * dt);
      p.mesh.rotation.x += dt * 3;
      p.mesh.rotation.y += dt * 4;
      p.mesh.scale.setScalar(t * 1.2);
      p.emberT -= dt;   // hot fragments shed embers for the first half of their life
      if (p.emberT <= 0 && t > 0.5) { spawnTrail(p.mesh.position, 0xff9540, 0.5, 0.45); p.emberT = 0.07; }
    }
    else { p.mesh.scale.addScalar(p.grow * dt); p.mesh.material.opacity = t * 0.5; if (p.vel) p.vel.multiplyScalar(1 - 1.5 * dt); }
    if (p.life <= 0) { releaseParticle(p.mesh); particles.splice(i, 1); }
  }
}

/* ---------------- combat resolution ---------------- */
function damagePlayer(amt, src) {
  if (player.invuln > 0) return;
  amt *= DIFFS[difficulty].dmg;
  if (player.dmgReduce) amt *= (1 - player.dmgReduce);
  run.damageTaken += amt;
  noDamageWave = false;
  player.shieldT = 4.0;
  const hadShield = player.shield > 0;
  if (player.shield > 0) { const s = Math.min(player.shield, amt); player.shield -= s; amt -= s; }
  player.hp -= amt; player.damageFlash = 0.5; player.shake = Math.max(player.shake, 0.4); shakeCam(0.5);
  if (src) { (player.hurtDir || (player.hurtDir = new THREE.Vector3())).copy(src).sub(player.group.position).normalize(); player.hurtT = 1.0; }
  audio.hurt();
  haptic(60);
  if (player.reactive && hadShield && player.shield <= 0) reactivePulse();
  if (player.hp <= 0) {
    if (player.cheatDeath && !player._cheatUsed) {   // once per RUN: _cheatUsed resets only in startGame
      player._cheatUsed = true; player.hp = player.maxHp * 0.4; player.shield = player.maxShield;
      player.invuln = 2.5; player.damageFlash = 0; empFlash = Math.max(empFlash, 0.6);
      showBanner(t('banner.guardianAngel')); audio.power(); return;
    }
    player.hp = 0; player.streak = streakStep(player.streak, 'death', 0); gameOver();
  }
}
// player-credited damage to every live enemy within sqrt(r2) of pos, sparing `skip` (and bosses when spareBoss)
function blastEnemies(pos, r2, dmg, skip, spareBoss) {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.alive && e !== skip && !(spareBoss && e.type === 'boss') && pos.distanceToSquared(e.group.position) < r2) damageEnemy(e, dmg, e.group.position, true);
  }
}
let chaining = false;
function critBlast(pos) {
  explode(pos, false);
  blastEnemies(pos, 155 * 155, player.stats.gunDmg * player.gunDmgMul * 1.3);
}
function chainBlast(origin) {
  spawnShockwave(origin);
  blastEnemies(origin, player.chainRadius * player.chainRadius, player.chainDmg);
}
function missileSplash(pos, dmg, radius, primary) {
  if (!dmg || !radius) return;
  spawnShockwave(pos);
  blastEnemies(pos, radius * radius, dmg, primary);
}
function reactivePulse() {   // a broken shield concusses nearby foes and blinds incoming missiles
  empFlash = Math.max(empFlash, 0.45); spawnShockwave(player.group.position);
  const pp = player.group.position, r2 = 640 * 640;
  blastEnemies(pp, r2, player.reactive, null, true);
  for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy && pp.distanceToSquared(m.mesh.position) < r2) m.decoyed = true; }
  showBanner(t('banner.reactivePulse')); audio.power();
}
let lastCrit = false;   // set per hit by damageEnemy so the cannon can spawn an exploding-crit blast
function damageEnemy(e, amt, wp, byPlayer = true, byCCA) {
  const dr = resolveDamage(
    { hp: e.hp, maxHp: e.maxHp, type: e.type, playerDmg: e.playerDmg },
    { amt, byPlayer, rand: Math.random(),
      alphaMul: player.alphaMul, comboDmg: player.comboDmg, combo: player.combo,
      critChance: player.critChance, critMul: player.critMul,
      execThresh: player.execThresh, rpMul: player.rpMul, tpDmg: TP.dmg }
  );
  amt = dr.amt; lastCrit = dr.crit;
  e.hp = dr.hp; e.hitFlash = 0.12;
  spawnDamageNumber(wp || e.group.position, Math.round(amt), lastCrit);
  const hr = awardHit({ combo: player.combo }, { amt, scoreMul: player.scoreMul });
  player.combo = hr.combo; player.comboTimer = hr.comboTimer; player.score += hr.score;
  if (byPlayer) { e.playerDmg = dr.playerDmg; player.tp += dr.rp; e.lastHitT = performance.now(); }   // lastHitT: a raider you hit turns to fight (updateRaider)
  audio.hit();
  if (lastCrit) audio.blip(1700, 0.05, 'sine', 0.09, 1250);
  if (dr.executed) {
    spawnDamageNumber(e.group.position, '\u2620 EXECUTE', true);
    if (player.execBlast) missileSplash(e.group.position, player.execBlast, 320, e);
  }
  if ((e.type === 'boss' || e.campaignBoss) && e.hp > 0) {
    // nextBossPhase only advances, so each transition fires once even if HP oscillates; a big hit may skip phases
    const np = nextBossPhase(e.phase, e.hp / e.maxHp);
    while (e.phase < np) bossEnterPhase(e, e.phase + 1);
  }
  if (e.hp <= 0) killEnemy(e, byPlayer, byCCA);
  else if (byPlayer) haptic(6);
}
function bossEnterPhase(e, ph) {
  e.phase = ph;
  bossApplyPhase(e, ph);
  empFlash = Math.max(empFlash, ph >= 3 ? 0.6 : 0.45);
  if (e.group.userData.body) e.group.userData.body.emissiveIntensity = ph >= 3 ? 2.4 : 1.8;
  if (e.group.userData.core) e.group.userData.core.material.emissiveIntensity = ph >= 3 ? 5.5 : 3.5;
  if (ph >= 3) for (let i = 0; i < 6; i++) spawnSmoke(e.group.position, 0xff5a8a, 2.2);   // armor shed
  showBanner(t(ph >= 3 ? 'banner.bossPhase3' : 'banner.bossPhase2'));
  const pc = e._phaseCfg && e._phaseCfg[ph - 1];
  if (pc && pc.say) radioKey('boss', 'comms.' + pc.say);
  audio.power(); audio.warn();
  haptic([40, 30, 60]);
  shakeCam(ph >= 3 ? 1.0 : 0.8);
}
// No transition FX: also used by the lazy phase-1 init in entities.js updateEnemy. The boss's original turnRate
// is captured once in phaseState.baseTurnRate so per-phase multipliers compose off the true base.
function bossApplyPhase(e, ph) {
  const base = (e.phaseState && e.phaseState.baseTurnRate != null) ? e.phaseState.baseTurnRate : e.turnRate;
  e.phaseState = resolveBossPhase(e._phaseCfg || null, ph, base);
  e.turnRate = e.phaseState.turnRate;
  const cfg = e._phaseCfg && e._phaseCfg[ph - 1];
  if (cfg) {
    if (cfg.weather) applyWeather(cfg.weather);
    if (cfg.tod != null) applyTimeOfDay(cfg.tod);
  }
}
function tpBaseFor(e) {
  return e.type === 'boss' ? TP.boss : e.type === 'bomber' ? TP.bomber : e.elite ? TP.ace
       : e.type === 'ground' ? TP.ground : e.type === 'drone' ? TP.drone : TP.fighter;
}
function killEnemy(e, byPlayer = true, byCCA) {
  missionKill(mission, e);   // credit objectives before the entity is torn down
  if (byPlayer && mission && mission.type === 'stealth') onStealthKill(e);
  const big = e.type === 'boss' || e.type === 'bomber';
  e.alive = false; explode(e.group.position, big);
  if (byPlayer) { haptic(big ? [30, 30, 30] : 20); shakeCam(big ? 0.42 : 0.25); audio.killSfx(); killFlash = big ? 0.5 : 0.28; }
  const pts = e.type === 'boss' ? 6000 : e.type === 'bomber' ? 3000 : e.elite ? 2500 : e.type === 'ground' ? 450 : e.type === 'drone' ? 250 : 1000;
  player.streak = streakStep(player.streak, 'kill', performance.now() / 1000);
  const kr = awardKill(
    { combo: player.combo, killStreak: player.killStreak },
    { pts, scoreMul: player.scoreMul, byPlayer, byCCA,
      tpBase: tpBaseFor(e), rpPerKill: player.rpPerKill, rpMul: player.rpMul,
      assistFrac: TP.assistFrac, playerDmg: e.playerDmg || 0 }
  );
  player.score += Math.round(kr.score * player.streak.mult); player.tp += kr.rp;
  if (player.streak.tierUp) { showBanner(tf('banner.streak', { mult: player.streak.mult })); haptic([30, 40, 30]); }
  if (byPlayer) { if (e._lastPlayerWp === 'gun') run.pGunKills++; }
  else if (byCCA) { run.escortKills++; }
  const shieldCap = player.maxShield + player.overshieldCap;
  if (player.lifesteal) {
    const room = player.maxHp - player.hp;
    player.hp = Math.min(player.maxHp, player.hp + player.lifesteal);
    if (player.vampShield && player.lifesteal > room) player.shield = Math.min(shieldCap, player.shield + (player.lifesteal - room) * player.vampShield);   // overheal banks as overshield
  }
  if (player.shieldOnKill) player.shield = Math.min(shieldCap, player.shield + player.shieldOnKill);
  if (player.gunScavenge) player.bullets = Math.min(player.maxBullets, player.bullets + player.gunScavenge);
  if (byPlayer && player.slowOnKill) player.slow = Math.max(player.slow, player.slowOnKill);
  if (player.mslRefund && Math.random() < player.mslRefund) player.missiles = Math.min(player.maxMissiles, player.missiles + 1);
  if (player.chainDmg && !chaining) { chaining = true; chainBlast(e.group.position); if (player.chainProp) chainBlast(e.group.position); chaining = false; }
  if (byPlayer && player.empKill) {   // EMP SUBMUNITIONS: stun nearby foes
    spawnShockwave(e.group.position);
    const er2 = player.empKill * player.empKill;
    for (let i = 0; i < enemies.length; i++) { const o = enemies[i]; if (!o.alive || o === e) continue; if (e.group.position.distanceToSquared(o.group.position) < er2) o.stun = Math.max(o.stun || 0, 2.0); }
    empFlash = Math.max(empFlash, 0.3);
  }
  if (player.burnSpread && e.burnT > 0) {   // INFERNO CASCADE: a burning death spreads fire
    const br2 = 240 * 240;
    for (let i = 0; i < enemies.length; i++) { const o = enemies[i]; if (!o.alive || o === e) continue; if (e.group.position.distanceToSquared(o.group.position) < br2) { o.burnT = player.burnTime; o.burnDps = player.burnDps; } }
  }
  if (byPlayer && player.frenzyOnKill) player.frenzy = Math.min(player.frenzyMax, player.frenzy + player.frenzyOnKill);
  if (e.type === 'boss' || e.campaignBoss) { run.boss++; showBanner(e.campaignBoss ? tf('banner.aceDown', { name: e.callsign }) : t('banner.bossDestroyed')); empFlash = 0.5; }
  if (e.campaignBoss) { /* counted as a boss above */ }
  else if (e.rival) { const pay = rivalDefeated(wave); player.tp += pay; showBanner(tf('banner.rivalDown', { rp: pay })); run.kills++; }
  else if (e.type === 'ground') {
    run.ground++;
    if (strikeSiteResolves(strikeWaveActive, mission ? mission.type : null)) {
      if (e.gkind === 'radar') showBanner(t('banner.radarDown'));
      // Endless strike-wave payout only; campaign strike phases resolve on the site core (missions.js siteFlattened)
      if (!campaignMode && !enemies.some(o => o.alive && o.type === 'ground')) {
        const pay = Math.round((60 + wave * 6) * player.rpMul);
        player.tp += pay; player.score += Math.round(1500 * player.scoreMul);
        showBanner(tf('banner.siteFlattened', { rp: pay })); audio.power(); empFlash = Math.max(empFlash, 0.4);
      }
    }
  }
  else if (e.type === 'bomber') { run.kills++; showBanner(t('banner.bomberDown')); }
  else run.kills++;
  if (e.type === 'drone') { if (Math.random() < 0.12) spawnLoot(e.group.position); }
  else if (e.type !== 'fighter' || e.elite || Math.random() < 0.5) spawnLoot(e.group.position);
  despawnEnemy(e);
  clearLocks(e);

  player.killStreak = kr.killStreak;
  if (kr.streakReward) killStreakReward();
}
function killStreakReward() {
  const n = player.killStreak;
  const ks = t('ks.' + n), label = ks !== 'ks.' + n ? ks : t('ks.5');
  player.flares = player.maxFlares;
  player.missiles = Math.min(player.maxMissiles, player.missiles + 4 + Math.floor(n / 5));
  player.bullets = Math.min(player.maxBullets, player.bullets + 150);
  if (n >= 10) { player.hp = Math.min(player.maxHp, player.hp + 25); player.shield = player.maxShield; }
  showBanner(tf('banner.killStreak', { label: label, n: n }));
  audio.power(); empFlash = 0.35;
}

/* ---------------- targeting ---------------- */
function nearestEnemyInFront(coneDot) {
  const fwd = fwdOf(player.group, t3); let best = null, bd = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive) continue;
    const to = t4.copy(e.group.position).sub(player.group.position); const d = to.length();
    if (d > 7000) continue; to.multiplyScalar(1 / d);
    if (fwd.dot(to) < coneDot) continue;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
// nearest live non-boss enemy in any direction (AWACS strike target; bosses are immune)
function nearestNonBossEnemy() {
  let best = null, bd = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive || e.type === 'boss') continue;
    const d = e.group.position.distanceToSquared(player.group.position);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function aliveByDistance(pos) {
  return enemies.filter(e => e.alive).sort((a, b) => pos.distanceToSquared(a.group.position) - pos.distanceToSquared(b.group.position));
}

/* ---------------- AWACS support calls ---------------- */
// Free but cooldown-gated and capped per sector; the decision is the pure awacsResolve (core.js).
function awacsAction(key) {
  if (!player) return false;
  const now = performance.now() / 1000;
  const res = awacsResolve({ uses: awacsUses, last: awacsLast }, AWACS_COOLDOWNS, AWACS_USES_MAX, key, now);
  if (!res.ok) {
    if (res.banner) { showBanner(t(res.banner)); audio.warn(); }   // cooldown / empty
    else audio.ui();                                               // unknown key
    return false;
  }
  awacsUses = res.uses; awacsLast = res.last;
  if (res.effect === 'strike') {
    const tgt = nearestNonBossEnemy();
    if (tgt) { explode(tgt.group.position, true); killEnemy(tgt, true); }
    empFlash = Math.max(empFlash, 0.45);
  } else if (res.effect === 'resupply') {
    player.bullets = player.maxBullets;
    player.flares = player.maxFlares;
    player.missiles = player.maxMissiles;
  } else if (res.effect === 'jam') {
    player.jammer = Math.max(player.jammer, AWACS_JAM_TIME);   // reuses the SPECTRA jam path in updateMissiles
  }
  showBanner(t(res.banner)); audio.power();
  return true;
}
function cycleLock() {
  const fwd = fwdOf(player.group, t3);
  const cand = [];
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive) continue;
    if (e._ghostT > 0) continue;   // cloaked rival
    const to = t4.copy(e.group.position).sub(player.group.position); const d = to.length();
    if (d > 6500) continue; to.multiplyScalar(1 / d);
    const ang = Math.acos(clamp(fwd.dot(to), -1, 1));
    if (ang < 1.05) cand.push({ e, ang });
  }
  if (!cand.length) { player.lockTarget = null; player.lockedTarget = null; player.lockProgress = 0; audio.ui(); return; }
  cand.sort((a, b) => a.ang - b.ang);
  let idx = cand.findIndex(o => o.e === player.lockTarget);
  idx = (idx + 1) % cand.length;
  player.lockTarget = cand[idx].e; player.lockProgress = 0; player.lockedTarget = null; audio.ui();
}
function updateLockOn(dt) {
  if (!player.lockTarget || !player.lockTarget.alive) {
    if (autoLock) player.lockTarget = nearestEnemyInFront(0.94);
    player.lockProgress = 0; player.lockedTarget = null;
  }
  const tgt = player.lockTarget;
  if (!tgt || !tgt.alive) { player.lockProgress = 0; player.lockedTarget = null; return; }
  if (tgt._ghostT > 0) { player.lockTarget = null; player.lockProgress = 0; player.lockedTarget = null; return; }   // cloaked rival drops lock
  const fwd = fwdOf(player.group, t3);
  const to = t4.copy(tgt.group.position).sub(player.group.position);
  const dist = to.length(); to.multiplyScalar(1 / Math.max(dist, 0.001));
  const aligned = fwd.dot(to);
  const acquiring = aligned > 0.92 && dist < 5200 * (weather.lockRangeMul || 1) && !tgt.isInCloud;
  const adv = advanceLock(
    { progress: player.lockProgress, target: player.lockedTarget },
    { acquiring: acquiring,
      dt: dt,
      rate: LOCK_TIME * player.lockSpeedMul * (weather.lockSpeedMul || 1),
      decayRate: LOCK_TIME * 0.5 }
  );
  player.lockProgress = adv.progress;
  if (acquiring) {
    player._lockT -= dt;
    if (player._lockT <= 0) { audio.blip(820 + player.lockProgress * 700, 0.04, 'square', 0.05); player._lockT = lerp(0.34, 0.07, player.lockProgress); }
    if (adv.justLocked) { player.lockedTarget = tgt; audio.lockTone(); haptic([18, 40, 18]); player.lockFlash = 0.42; }
  } else {
    if (!adv.locked) player.lockedTarget = null;
    if (aligned < 0.55 || dist > 6500) player.lockTarget = null;
  }
}
// Writes the lead point into `out` (never tA, used internally); null when there is no solution within 6 s.
function interceptPoint(shooter, tp, tv, bs, out) {
  const D = tA.copy(tp).sub(shooter);
  const a = tv.dot(tv) - bs * bs, b = 2 * D.dot(tv), c = D.dot(D);
  let t;
  if (Math.abs(a) < 1e-3) { if (Math.abs(b) < 1e-6) return null; t = -c / b; }
  else { const disc = b * b - 4 * a * c; if (disc < 0) return null; const sq = Math.sqrt(disc); const r1 = (-b - sq) / (2 * a), r2 = (-b + sq) / (2 * a); t = Math.min(r1, r2); if (t < 0) t = Math.max(r1, r2); }
  if (!(t > 0) || t > 6) return null;
  return out.copy(tp).addScaledVector(tv, t);
}

/* ---------------- special abilities ---------------- */
function hasSpecial(jet) { return !!(jet && jet.ability); }

// slot 1 = the native jet special (KeyR), slot 2 = the equipped secondary (KeyB); each slot owns its cooldown
function useSpecial(slot) {
  const st = (slot === 2) ? player.special2 : player.special;
  if (!st || !st.id) { audio.ui(); return; }
  if (st.cd > 0) { audio.ui(); return; }
  st.cd = st.max; audio.power();
  applySpecialEffect(st.id);
}

// n hard-homing player missiles fanned ±yaw, spread round-robin over the nearest live enemies (lock as fallback)
function missileBarrage(n, yaw, yLo, yHi, dmgMul) {
  const pp = player.group.position, tg = aliveByDistance(pp);
  for (let k = 0; k < n; k++) {
    const target = tg[k % Math.max(1, tg.length)] || player.lockedTarget;
    const dir = fwdOf(player.group, new THREE.Vector3()).applyAxisAngle(UPV, rand(-yaw, yaw)); dir.y += rand(yLo, yHi); dir.normalize();
    const m = spawnMissile(pp, dir, target, false, dmgMul * player.missileDmgMul);
    if (target) m.hardHome = true;
  }
  run.missiles += n;
}

// Keyed purely on the ability id (not player.jet), so slot 2 can run another jet's ability.
function applySpecialEffect(id) {
  const pp = player.group.position;

  if (id === 'F-22') {   // OVERDRIVE: +speed, +gun dmg, 4-round spread cannon (fireGun)
    player.overdrive = 6; showBanner('OVERDRIVE'); empFlash = 0.3;

  } else if (id === 'SU-57') {   // COBRA: post-stall reversal + close-range shockwave
    player.speed *= 0.2; player.pitchRate = player.stats.turnRate * 3.6; player.invuln = 1.5;
    spawnShockwave(pp); explode(pp, true);
    blastEnemies(pp, 102400, 120, null, true);
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy && m.mesh.position.distanceToSquared(pp) < 490000) { m.decoyed = true; if (Math.random() < 0.85) m.life = 0.05; } }
    showBanner('COBRA');

  } else if (id === 'J-20') {   // EMP PULSE: kills nearby missiles + free instant lock (no gun)
    player.empBurst = 6; empFlash = 0.85;
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy && m.mesh.position.distanceToSquared(pp) < 2890000) { explode(m.mesh.position, false); m.life = 0; } }
    const near = nearestEnemyInFront(0.4) || aliveByDistance(pp)[0];
    if (near) { player.lockTarget = near; player.lockProgress = 1; player.lockedTarget = near; }
    showBanner('EMP PULSE');

  } else if (id === 'F-35') {   // STEALTH FIELD: missiles fired while cloaked are ambush kills (fireMissile)
    player.stealthField = 7; showBanner(t('banner.cloakAmbush'));

  } else if (id === 'EFT') {   // MISSILE SALVO; SWARM RACK / HYDRA multiply it like a normal launch
    missileBarrage(6 * (1 + player.mslSwarm), 0.4, -0.1, 0.18, 1.4);
    showBanner('MISSILE SALVO'); audio.missile();

  } else if (id === 'RAFALE') {   // SPECTRA JAMMER: incoming go blind, enemies can't launch
    player.jammer = 6; empFlash = 0.4;
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy) { m.decoyed = true; if (m.maxSpeed > 600) m.maxSpeed = 600; } }
    showBanner('SPECTRA JAMMER'); audio.power();

  } else if (id === 'TEJAS') {   // HOLO-DECOYS draw fire and pull current missiles off you
    spawnDecoys(3);
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy && !m.decoyed && decoys.length) { m.holo = decoys[(Math.random() * decoys.length) | 0]; m.decoyed = true; } }
    showBanner('HOLO-DECOYS'); empFlash = 0.25;

  } else if (id === 'FA18') {   // COMBAT TRANCE: the world drops to 40% speed, you don't
    player.slow = 4; empFlash = 0.3; showBanner('COMBAT TRANCE'); audio.power();

  } else if (id === 'J-36') {   // ORDNANCE STORM: saturation barrage + ablative over-shield
    missileBarrage(10 * (1 + player.mslSwarm), 0.55, -0.12, 0.22, 1.55);
    player.shield = Math.max(player.shield, player.maxShield) + 90; player.shieldT = 6;
    empFlash = 0.4; showBanner('ORDNANCE STORM'); audio.missile();

  } else if (id === 'F-47') {   // CCA SWARM far ahead; SWARM RACK / HYDRA add ranks (3 / 6 / 9)
    const fwd = fwdOf(player.group, new THREE.Vector3()), right = rightOf(player.group, new THREE.Vector3());
    const mult = 1 + player.mslSwarm;
    const base = [   // per rank: centre + left + right
      { ahead: 320, lateral:   0, vert: 10 },
      { ahead: 240, lateral:-185, vert: 30 },
      { ahead: 240, lateral: 185, vert: 30 },
    ];
    let launched = 0;
    for (let r = 0; r < mult; r++) {
      const spread = (r - (mult - 1) / 2) * 95;   // fan extra ranks sideways so they don't overlap
      for (let k = 0; k < base.length; k++) {
        const o = base[k];
        const pt = pp.clone()
          .addScaledVector(fwd, o.ahead - r * 45)
          .addScaledVector(right, o.lateral + spread)
          .addScaledVector(UPV, o.vert + r * 6);
        if (spawnCCA(pt)) launched++;
      }
    }
    spawnShockwave(pp);
    explode(pp, false);
    empFlash = Math.max(empFlash, 0.5);
    audio.power();
    showBanner(tf('banner.ccaSwarm', { n: launched }));

  } else if (id === 'J-50') {   // VECTOR SURGE: agility + thrust, missiles lose lock, plasma wake (updatePlayer)
    player.vectorSurge = 6; player.invuln = 0.4; empFlash = 0.3;
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy) { m.decoyed = true; if (m.maxSpeed > 640) m.maxSpeed = 640; } }
    showBanner('VECTOR SURGE'); audio.power();
  }
}

/* ---------------- player update ---------------- */
const PLAYER_TIMERS = ['overdrive', 'empBurst', 'stealthField', 'invuln', 'jammer', 'slow', 'vectorSurge', 'damageFlash', 'lockFlash', 'firingT', 'shake'];
function updatePlayer(dt) {
  const st = player.stats, pos = player.group.position;
  player.gunCd -= dt; player.missileCd -= dt; player.flareCd -= dt;
  for (let i = 0; i < PLAYER_TIMERS.length; i++) { const k = PLAYER_TIMERS[i]; if (player[k] > 0) player[k] -= dt; }
  if (barrelRollCooldown > 0) barrelRollCooldown -= dt;
  if (barrelRollAnim > 0) barrelRollAnim -= dt;
  if (player.frenzy > 0) player.frenzy = Math.max(0, player.frenzy - dt);
  if (player.special.cd > 0) player.special.cd -= dt;
  if (player.special2.cd > 0) player.special2.cd -= dt;
  if (player.muzzleT > 0) { player.muzzleT -= dt; if (player.muzzleT <= 0 && player.group.userData.muzzle) player.group.userData.muzzle.visible = false; }
  if (player.comboTimer > 0) { player.comboTimer -= dt; if (player.comboTimer <= 0) player.combo = 0; }
  if (player.shieldT > 0) player.shieldT -= dt;
  else if (player.shield < player.maxShield) player.shield = Math.min(player.maxShield, player.shield + 16 * player.shieldRegenMul * dt);

  // keyboard in engine signs; the analog flightInput (point-to-fly signs) is folded in below
  let pitchIn = down('KeyS') - down('KeyW'), rollIn = down('KeyQ') - down('KeyE'), yawIn = down('KeyA') - down('KeyD');
  if (invertY) pitchIn = -pitchIn;   // keyboard invert = pitch only; touch invert flips the whole stick (controls.js)

  // currentBank = atan2(-right.y, up.y): same sign frame as roll intent (+ = bank right) for stable feedback
  const _rgt = rightOf(player.group, t1), _up = upOf(player.group, t2);
  const currentBank = Math.atan2(-_rgt.y, _up.y);
  const cmd = steerCommand(controlScheme, flightInput, currentBank, STEER);
  pitchIn = clamp(pitchIn - cmd.pitchCmd, -1, 1);
  rollIn = clamp(rollIn - cmd.rollCmd, -1, 1);

  if (barrelRollRequest) {
    barrelRollRequest = false;
    barrelRollDir = (rollIn !== 0) ? Math.sign(rollIn) : 1;
    barrelRollAnim = BARREL_ROLL_DURATION;
    barrelRollCooldown = BARREL_ROLL_COOLDOWN;
    (player._brQuat0 || (player._brQuat0 = new THREE.Quaternion())).copy(player.group.quaternion);   // the roll is anchored here
    player.invuln = Math.max(player.invuln, BARREL_ROLL_INVULN);
    haptic(80);
    showBanner(t('banner.evade'), 1.2);
  }

  const brake = down('ControlLeft') || down('ControlRight') || touchBtns.brk;
  const thr = down('ShiftLeft') || down('ShiftRight') || touchBtns.thr;
  player.highG = brake && (down('KeyS') || (isTouchEnabled && flightInput.pitch < -0.5));

  const tb = st.turnRate * controlSensitivity * player.turnMul * (player.vectorSurge > 0 ? 1.85 : 1);
  const tgtPitch = pitchIn * tb * (player.highG ? 2.0 : 1.0);
  const tgtRoll = rollIn * tb * 1.6;
  const tgtYaw = yawIn * tb * 0.5;
  player.pitchRate = damp(player.pitchRate, tgtPitch, player.vectorSurge > 0 ? 6.5 : 4.5, dt);
  player.rollRate = damp(player.rollRate, tgtRoll, 5.5, dt);
  player.yawRate = damp(player.yawRate, tgtYaw, 4.5, dt);

  // Directional mode (stick / mouse-flight / motion): fly TOWARD the stick with world-horizon pitch and
  // world-up yaw, so steering is identical at any bank and never flips inverted; wings auto-level.
  const motionOn = mobileControl === 'motion';
  const directional = (motionOn && motionInput.ready) || mouseFlight || (isTouchEnabled && !motionOn);

  if (barrelRollAnim > 0) {
    // pure body-Z roll driven by progress from _brQuat0: at prog=1 it's exactly a full turn, so heading and
    // pitch are unchanged; pitch/yaw integration and auto-yaw are frozen meanwhile
    player.rollRate = barrelRollDir * (TWO_PI / BARREL_ROLL_DURATION);   // wingtip vapor / HUD still read rollRate
    player.invuln = Math.max(player.invuln, barrelRollAnim);   // i-frames span the whole roll
    const prog = clamp(1 - barrelRollAnim / BARREL_ROLL_DURATION, 0, 1);
    player.group.quaternion.copy(player._brQuat0).multiply(q1.setFromAxisAngle(ZAX, barrelRollDir * prog * TWO_PI));
    player._brEnding = true;
  } else {
    if (player._brEnding && player._brQuat0) {   // roll just finished: pin exactly back to the captured orientation
      player.group.quaternion.copy(player._brQuat0);
      player._brEnding = false;
      player.rollRate = player.pitchRate = player.yawRate = 0;
      player._brSettle = true;   // skip auto-yaw this frame: currentBank is still the stale mid-roll bank
    }
    if (directional && !player._brSettle) {
      // +sx = steer right, +sy = climb (flightInput.pitch is negative-for-climb)
      let sx = flightInput.roll, sy = -flightInput.pitch;
      if (down('KeyW')) sy += 1; if (down('KeyS')) sy -= 1;
      if (down('KeyD')) sx += 1; if (down('KeyA')) sx -= 1;
      sx = clamp(sx, -1, 1); sy = clamp(sy, -1, 1);
      player.yawRate   = damp(player.yawRate,   sx * tb * 1.15, 6.0, dt);
      player.pitchRate = damp(player.pitchRate, sy * tb * 1.00, 5.5, dt);
      const fwd = fwdOf(player.group, t3);
      const hr  = t4.copy(fwd).cross(UPV);                  // world-horizontal axis ⟂ heading → bank-independent pitch
      if (hr.lengthSq() < 1e-5) hr.copy(rightOf(player.group, t4));   // near-vertical: fall back to body right
      hr.normalize();
      player.group.quaternion.premultiply(q1.setFromAxisAngle(hr, player.pitchRate * dt));
      player.group.quaternion.premultiply(q2.setFromAxisAngle(UPV, -player.yawRate * dt));
      const tgtBank = sx * STEER.autoMaxBank;               // cosmetic bank into the turn; 0 when centred → auto-level
      const rollStep = clamp((tgtBank - currentBank) * STEER.bankGain, -8, 8) * dt;
      player.group.quaternion.multiply(q1.setFromAxisAngle(ZAX, -rollStep));
      player.rollRate = -rollStep / Math.max(dt, 1e-4);
    } else if (!directional) {
      eul.set(player.pitchRate * dt, player.yawRate * dt, player.rollRate * dt, 'XYZ');
      q1.setFromEuler(eul);
      player.group.quaternion.multiply(q1);
    }
  }
  // 'auto' scheme: world-up yaw ∝ bank, decoupled from pitch so diagonals work. Off during a barrel roll,
  // whose 360° bank sweep would otherwise feed it a net heading drift.
  if (controlScheme === 'auto' && !directional && barrelRollAnim <= 0 && !player._brSettle) {
    const autoYaw = -STEER.autoYawGain * Math.sin(currentBank) * tb * dt;
    if (autoYaw) player.group.quaternion.premultiply(q2.setFromAxisAngle(UPV, autoYaw));
  }
  player._brSettle = false;

  // AIM ASSIST: bounded, rate-capped world-axis nudge toward the gun lead pip (same interceptPoint the HUD
  // pipper draws); yields during a barrel roll so player input always dominates
  if (aimAssist && !player.noCannon && barrelRollAnim <= 0) {
    const at = pickGunTarget();
    if (at && at.alive) {
      const manualAim = down('KeyW') || down('KeyS') || down('KeyQ') || down('KeyE') || down('KeyA') || down('KeyD') || Math.hypot(flightInput.pitch || 0, flightInput.roll || 0) > 0.12;
      const cfg = aimAssistCfg(aimStrength, manualAim);
      const relV = aimT1.copy(at.vel || ZERO).addScaledVector(player.vel, -0.9);   // rounds inherit 0.9 of jet vel
      const ip = interceptPoint(pos, at.group.position, relV, 1400 * player.bulletSpeedMul, tLead);
      if (ip) {
        const desired = aimT2.copy(ip).sub(pos);
        const dist = desired.length();
        if (dist > 1) {
          desired.multiplyScalar(1 / dist);
          const fwdv = fwdOf(player.group, aimT3);
          const angErr = Math.acos(clamp(fwdv.dot(desired), -1, 1));
          const step = aimAssistStep(angErr, dist, dt, cfg);
          if (step > 0) {
            const axis = aimT1.crossVectors(fwdv, desired);   // relV consumed, aimT1 free
            if (axis.lengthSq() > 1e-9) player.group.quaternion.premultiply(q2.setFromAxisAngle(axis.normalize(), step));
          }
        }
      }
    }
  }

  let tT = player.throttle;
  if (thr) tT += dt * (0.35 + st.accel * 0.22);
  if (brake) tT -= dt * (0.5 + st.accel * 0.3);
  player.throttle = clamp(tT, 0, 1);
  let maxS = st.maxSpeed * player.speedMul * (player.overdrive > 0 ? 1.75 : player.vectorSurge > 0 ? 1.4 : 1);
  if (player.highG) maxS *= 0.42;
  const tgtSpeed = lerp(st.minSpeed, maxS, player.throttle);
  player.speed = damp(player.speed, tgtSpeed, (player.highG ? 3.0 : 0.9) * st.accel, dt);

  const fwd = fwdOf(player.group, t1);
  const rgt = rightOf(player.group, t3);
  player.vel.lerp(t2.copy(fwd).multiplyScalar(player.speed), 1 - Math.exp(-3.5 * dt));
  pos.addScaledVector(player.vel, dt);

  const gh = terrainH(pos.x, pos.z);
  const agl = pos.y - gh;
  player.gpws = agl < 270 && fwd.y < 0.06;
  if (agl < 130) player.pitchRate = Math.max(player.pitchRate, tb * 1.7);
  if (agl < 22) { pos.y = gh + 22; player.vel.y = Math.max(player.vel.y, 30); }

  const B = 12000;
  pos.x = clamp(pos.x, -B, B); pos.z = clamp(pos.z, -B, B);
  if (pos.y > 5200) pos.y = 5200;

  player.stealth = player.stealthField > 0 || inCloud(pos);

  // wingtip vortices while pulling hard
  if ((player.highG || Math.abs(player.pitchRate) > tb * 0.8) && player.speed > 240) {
    player.vaporT = (player.vaporT || 0) - dt;
    if (player.vaporT <= 0) {
      player.vaporT = 0.022;
      for (let s = 1; s >= -1; s -= 2) spawnTrail(t4.copy(pos).addScaledVector(rgt, 9 * s), 0xcfe2f2, 0.3);
    }
  }

  const engs = player.group.userData.engines;
  if (engs) {
    const baseFl = 0.5 + player.throttle * 1.5 + (player.overdrive > 0 ? 2.4 : 0);
    const glowS = 1 + player.throttle * 1.6 + (player.overdrive > 0 ? 1.8 : 0);
    for (let i = 0; i < engs.length; i++) {
      const en = engs[i];
      en.glow.scale.set(1, 1, glowS * 1.4 * (0.9 + Math.random() * 0.2));
      en.glow.material.opacity = 0.4 + player.throttle * 0.45;
      en.flame.scale.set(1, 1, baseFl * (0.82 + Math.random() * 0.36));
      en.flame.material.opacity = 0.32 + player.throttle * 0.45;
      en.flame.material.color.setHex(player.overdrive > 0 ? 0xff7a2a : player.jet.accent);
    }
  }

  // contrails + wingtip vapor, kept sparse so level flight stays uncluttered
  player._trailT -= dt;
  if (player._trailT <= 0) {
    if (player.overdrive > 0 || (player.throttle > 0.95 && player.speed > st.maxSpeed * 0.92)) {
      const bk = fwdOf(player.group, t4).multiplyScalar(-1);
      const op = player.overdrive > 0 ? 0.32 : 0.18;
      for (let s = 1; s >= -1; s -= 2) spawnTrail(t5.copy(pos).addScaledVector(rgt, 6 * s).addScaledVector(bk, 4), 0xbfeaff, op);
    }
    if (player.highG || Math.abs(player.pitchRate) > st.turnRate * 1.5 || Math.abs(player.rollRate) > st.turnRate * 1.7) {
      const span = (player.group.userData.cfg && player.group.userData.cfg.wingspan) || 9;
      for (let s = 1; s >= -1; s -= 2) spawnTrail(t4.copy(pos).addScaledVector(rgt, span * s), 0xffffff, 0.32);
    }
    player._trailT = 0.07;
  }

  // gun overheat: gunHeat/gunLocked aren't in createPlayer, hence the ?? defaults
  const wantFire = down('Space') || touchBtns.gun || mouseFiring;
  const heatRes = heatStep({ heat: player.gunHeat ?? 0, locked: player.gunLocked ?? false }, wantFire && !player.noCannon, dt);
  player.gunHeat = heatRes.heat; player.gunLocked = heatRes.locked;
  if (heatRes.justLocked) { showBanner(t('banner.gunsOverheat')); haptic([40, 60, 40]); }
  if (wantFire && !heatRes.locked) fireGun();
  updateLockOn(dt);

  updatePdBeams(dt);

  // VECTOR SURGE: plasma wake guts anything you cut close past; missiles keep losing lock
  if (player.vectorSurge > 0) {
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy && Math.random() < 0.6) m.decoyed = true; }
    player._wakeT -= dt;
    if (player._wakeT <= 0) {
      const bk = fwdOf(player.group, t4).multiplyScalar(-1);
      spawnTrail(t5.copy(pos).addScaledVector(bk, 5), 0x46ffd0, 0.5);
      player._wakeT = 0.03;
    }
    blastEnemies(pos, 38000, 110 * dt, null, true);
  }

  animEngines(player.group, player.throttle);
  player._gpwsT -= dt; if (player.gpws && player._gpwsT <= 0) { audio.warn(); player._gpwsT = 0.5; }
  player.incoming = false;   // once per frame; the HUD MISSILE warning reads it too
  for (let i = 0; i < missiles.length; i++) if (missiles[i].enemy) { player.incoming = true; break; }
  player._missT -= dt; if (player.incoming && player._missT <= 0) { audio.blip(900, 0.1, 'square', 0.13); player._missT = 0.55; }
}

/* ---------------- point-defense laser bolts ---------------- */
const PD_POOL = [];
const pdBeams = [];
function getPdBeam() {
  let b = PD_POOL.pop();
  if (!b) {
    const geo = new THREE.CylinderGeometry(0.7, 0.7, 1, 6, 1, true);
    geo.rotateX(Math.PI / 2); geo.translate(0, 0, -0.5);   // unit length from origin toward -Z (Object3D.lookAt's forward)
    const mat = new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    b = new THREE.Mesh(geo, mat); scene.add(b);
  }
  b.visible = true; return b;
}
function firePdBeam(from, to, color) {
  const len = from.distanceTo(to); if (len < 1) return;
  const b = getPdBeam();
  b.material.color.setHex(color);
  b.position.copy(from);
  b.lookAt(to);
  b.scale.set(1, 1, len);
  b.material.opacity = 0.95;
  pdBeams.push({ mesh: b, t: 0.13, max: 0.13 });
  spawnTrail(to, color, 0.9);   // hit flash at the intercept point
}
function updatePdBeams(dt) {
  for (let i = pdBeams.length - 1; i >= 0; i--) {
    const p = pdBeams[i]; p.t -= dt;
    const k = clamp(p.t / p.max, 0, 1);
    p.mesh.material.opacity = 0.95 * k;
    p.mesh.scale.x = p.mesh.scale.y = 0.5 + (1 - k) * 1.8;
    if (p.t <= 0) { p.mesh.visible = false; PD_POOL.push(p.mesh); pdBeams.splice(i, 1); }
  }
}
