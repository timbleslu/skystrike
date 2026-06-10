/* SKYSTRIKE — combat.js: bullets, missiles, flares, decoys, loot, particles, damage/kill resolution, targeting, specials, player update, DEW lance. Load 4th. */

/* ---------------- bullets ---------------- */
function getBullet() {
  let b = BPOOL.pop();
  if (!b) b = { mesh: new THREE.Mesh(ASSET.bulletGeo, ASSET.bulletMat), vel: new THREE.Vector3(), life: 0, dmg: 0, enemy: false };
  b.ai = false;
  scene.add(b.mesh); return b;
}
function recycleBullet(b) { scene.remove(b.mesh); BPOOL.push(b); }

// ADRENALINE — bonus damage that scales with how much HP you've lost (1.0 at full HP)
function berserkMul() { return player.berserk ? 1 + player.berserk * (1 - clamp(player.hp / player.maxHp, 0, 1)) : 1; }
function fireGun() {
  if (player.noCannon) { player.gunCd = 0.3; return; }   // J-20 carries no internal gun
  if (player.gunCd > 0) return;
  if (player.bullets <= 0) { player.gunCd = 0.25; audio.ui(); return; }
  const od = player.overdrive > 0;
  player.gunCd = (od ? 0.05 : 0.07) * (player.fireRateMul || 1);
  const fwd = fwdOf(player.group, t1), rgt = rightOf(player.group, t2);
  const dmg = player.stats.gunDmg * player.gunDmgMul * (od ? 1.5 : 1) * berserkMul();
  const offs = od ? [-3.6, -1.2, 1.2, 3.6] : [-2.6, 2.6];   // overdrive widens to a 4-round burst
  for (const off of offs) {
    const b = getBullet(); b.enemy = false; b.dmg = dmg; b.life = 2.0; b.mesh.material = ASSET.bulletMat; b.mesh.scale.setScalar(1);
    b.pierce = player.pierce || 0; b.passed = null;
    b.mesh.position.copy(player.group.position).addScaledVector(rgt, off).addScaledVector(fwd, 12);
    b.vel.copy(fwd).multiplyScalar(1400 * (player.bulletSpeedMul || 1)).addScaledVector(player.vel, 0.9);
    if (od) b.vel.addScaledVector(rgt, off * 1.4);          // slight fan on the spread
    bullets.push(b);
  }
  const used = offs.length;
  player.bullets = Math.max(0, player.bullets - used);
  player.shake = Math.max(player.shake, 0.12);
  audio.gun();
  run.shots += used;
}

function updateBullets(dt, ts) {
  ts = ts || 1;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; const sdt = b.enemy ? dt * ts : dt;
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
            damageEnemy(e, b.dmg, b.mesh.position, !b.ai, b.byCCA);
            if (!b.ai) { spawnHitMarker(); run.hits++; if (lastCrit && player.critChain) critBlast(b.mesh.position); }
            if (!b.ai && b.pierce > 0) { b.pierce--; (b.passed || (b.passed = [])).push(e); }
            else dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.mesh.position.y < terrainH(b.mesh.position.x, b.mesh.position.z)) dead = true;
    if (dead) { recycleBullet(b); bullets.splice(i, 1); }
  }
}

/* ---------------- missiles ---------------- */
function fireMissile() {
  if (player.missileCd > 0) return;
  if (player.missiles <= 0) { audio.ui(); return; }
  let tgt = (player.lockedTarget && player.lockedTarget.alive && player.lockProgress >= 1) ? player.lockedTarget : null;
  let ambush = false;
  if (player.stealthField > 0) {
    // cloaked fire-and-forget: auto-home the nearest enemy in front and ambush-kill it
    const near = nearestEnemyInFront(0.72);
    if (near) { tgt = near; ambush = true; }
  }
  const dm = player.missileDmgMul * (player.overdrive > 0 ? 1.4 : 1) * berserkMul();
  player.missileCd = 0.55;
  const salvo = Math.min(1 + (player.mslSwarm || 0), player.missiles);   // SWARM RACK looses extra birds
  const baseDir = fwdOf(player.group, t1).clone();
  for (let s = 0; s < salvo; s++) {
    const dir = baseDir.clone();
    if (salvo > 1) dir.applyAxisAngle(UPV, (s - (salvo - 1) / 2) * 0.16).normalize();
    const m = spawnMissile(player.group.position, dir, tgt, false, dm);
    if (m) {
      if (ambush) { m.ambush = true; m.hardHome = true; }
      if ((player.mslHard || salvo > 1) && tgt) m.hardHome = true;   // MULTI-TRACK capstone / swarm guidance
      if (player.splashRadius) { m.splash = player.splashRadius; m.splashDmg = player.splashDmg; }
    }
  }
  player.missiles -= salvo; run.missiles += salvo;
  audio.missile();
}
function spawnMissile(pos, dir, target, enemy, dmgMul) {
  const mesh = new THREE.Mesh(ASSET.missileGeo, enemy ? ASSET.missileMatEnemy : ASSET.missileMatPlayer);
  mesh.position.copy(pos).addScaledVector(dir, 11);
  // bright additive halo locked to the missile so it's easy to track at any range
  const glowColor = enemy ? 0xff6a2e : 0x38d6ff;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: glowColor, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
  halo.scale.setScalar(enemy ? 48 : 42); mesh.add(halo);
  scene.add(mesh);
  const obj = {
    mesh, halo, vel: dir.clone().multiplyScalar(enemy ? 500 : 600), speed: enemy ? 500 : 600,
    maxSpeed: enemy ? 880 : 1050, target, enemy, life: 7, dmg: (enemy ? 16 : 34) * (dmgMul || 1),
    armed: 0.22, decoy: null, decoyed: false, smokeT: 0, trailColor: glowColor, hardHome: false, ambush: false,
  };
  missiles.push(obj);
  return obj;
}
function updateMissiles(dt, ts) {
  ts = ts || 1;
  const now = performance.now();
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    const sdt = m.enemy ? dt * ts : dt;        // enemy ordnance slows in bullet-time; yours doesn't
    m.life -= sdt; m.armed -= sdt;
    let tgtPos = null;
    if (m.enemy) {
      const ev = player.mslEvade || 0;
      // SPECTRA jamming blinds every hostile missile outright
      if (player.jammer > 0) { m.decoyed = true; if (m.maxSpeed > 600) m.maxSpeed = 600; }
      // holographic decoys (Tejas) soak missiles like irresistible bait
      if (!m.decoyed && !m.holo && decoys.length) {
        for (let k = 0; k < decoys.length; k++) { const d = decoys[k]; if (d.life > 0 && m.mesh.position.distanceToSquared(d.mesh.position) < 250000 && Math.random() < 0.9) { m.holo = d; m.decoyed = true; break; } }
      }
      // flares: high, stealth- & SPECTRA-boosted spoof chance over a generous radius
      if (!m.decoyed && !m.decoy) {
        const pr = clamp(0.82 + ev * 0.4 + (player.flarePro ? 0.12 : 0), 0, 0.99);
        for (let k = 0; k < flares.length; k++) { const f = flares[k]; if (f.owner !== 'enemy' && m.mesh.position.distanceToSquared(f.mesh.position) < 144400 && Math.random() < pr) { m.decoy = f; m.decoyed = true; break; } }
      }
      if (m.holo && m.holo.life > 0) tgtPos = m.holo.mesh.position;
      else if (m.decoy && m.decoy.life > 0) tgtPos = m.decoy.mesh.position;
      else if (m.decoyed) tgtPos = null;        // spoofed/jammed → fly ballistic, never reacquire
      else if (!player.stealth) tgtPos = player.group.position;
    } else {
      if (!m.decoy) { for (let k = 0; k < flares.length; k++) { const f = flares[k]; if (f.owner === 'enemy' && m.mesh.position.distanceToSquared(f.mesh.position) < 67600 && Math.random() < 0.45) { m.decoy = f; break; } } }
      if (m.decoy && m.decoy.life > 0) tgtPos = m.decoy.mesh.position;
      else if (m.target && m.target.alive && !m.target.isInCloud) tgtPos = m.target.group.position;
    }
    const cur = t2.copy(m.vel).normalize();
    if (tgtPos) {
      const rate = m.enemy ? 2.6 * (1 - 0.5 * (player.mslEvade || 0)) : (m.hardHome ? 5.5 : 3.4);
      const des = t1.copy(tgtPos).sub(m.mesh.position).normalize();
      cur.lerp(des, clamp(rate * sdt, 0, 1)).normalize();
    }
    m.speed = Math.min(m.maxSpeed, m.speed + 850 * sdt);
    m.vel.copy(cur).multiplyScalar(m.speed);
    m.mesh.position.addScaledVector(m.vel, sdt);
    dirToQuat(cur, m.mesh.quaternion);

    if (m.halo) m.halo.material.opacity = 0.7 + 0.3 * Math.sin(now * 0.02);
    m.smokeT -= sdt; if (m.smokeT <= 0) { spawnMissileTrail(m.mesh.position, m.trailColor || (m.enemy ? 0xff6a2e : 0x38d6ff)); m.smokeT = 0.02; }

    let hit = false;
    if (m.enemy) {
      // POINT-DEFENSE LASER — a chance to swat an incoming missile out of the air before it connects
      if (player.pointDefense && m.armed <= 0 && m.mesh.position.distanceToSquared(player.group.position) < 810000 && Math.random() < player.pointDefense * sdt * 3.2) {
        explode(m.mesh.position, false); audio.blip(1500, 0.05, 'square', 0.07, 900); hit = true;
      }
      if (!hit && m.armed <= 0 && player.invuln <= 0 && m.mesh.position.distanceToSquared(player.group.position) < 3600) { damagePlayer(m.dmg, m.mesh.position); explode(m.mesh.position, true); hit = true; }
    } else {
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k]; if (!e.alive) continue;
        const r = e.type === 'boss' ? 130 : e.type === 'bomber' ? 95 : e.type === 'drone' ? 50 : 60;
        if (m.mesh.position.distanceToSquared(e.group.position) < r * r) {
          if (m.ambush && e.type !== 'boss') { killEnemy(e, !m.ai, m.byCCA); }
          else if (e.type === 'boss' || e.elite || e.type === 'bomber') { damageEnemy(e, m.dmg * 1.6, m.mesh.position, !m.ai, m.byCCA); }
          else { if (!m.ai) { player.combo++; player.comboTimer = 2.2; player.score += Math.round(60 * (player.scoreMul || 1)); } killEnemy(e, !m.ai, m.byCCA); }
          if (!m.ai) spawnHitMarker();
          explode(m.mesh.position, true);
          if (!m.ai && m.splash) missileSplash(m.mesh.position, m.splashDmg, m.splash, e);   // THERMOBARIC blast
          hit = true; break;
        }
      }
    }
    if (!hit && m.holo && m.holo.life > 0 && m.mesh.position.distanceToSquared(m.holo.mesh.position) < 2500) { explode(m.mesh.position, false); m.holo.life -= 1.2; hit = true; }
    if (!hit && m.decoy && m.decoy.life > 0 && m.mesh.position.distanceToSquared(m.decoy.mesh.position) < 1600) { explode(m.mesh.position, false); hit = true; }
    if (!hit && m.mesh.position.y < terrainH(m.mesh.position.x, m.mesh.position.z) + 4) { explode(m.mesh.position, true); hit = true; }
    if (hit || m.life <= 0) { scene.remove(m.mesh); missiles.splice(i, 1); }
  }
}

/* ---------------- flares ---------------- */
function deployFlares() {
  if (player.flareCd > 0) return;
  if (player.flares <= 0) { audio.ui(); return; }
  player.flareCd = 0.45; player.flares--;
  const back = fwdOf(player.group, t1).multiplyScalar(-1), up = upOf(player.group, t2);
  const count = 3 + (player.flarePro ? 2 : 0);   // SPECTRA airframes throw a denser cloud
  const fresh = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(ASSET.flareGeo, ASSET.flareMat); scene.add(m);
    m.position.copy(player.group.position).addScaledVector(up, rand(-6, 6));
    const v = back.clone().multiplyScalar(rand(60, 150)); v.x += rand(-60, 60); v.y += rand(-90, -30); v.z += rand(-60, 60);
    const f = { mesh: m, vel: v, life: player.flarePro ? 4.0 : 3.2, owner: 'player' };
    flares.push(f); fresh.push(f);
  }
  // actively seduce any missile currently tracking the player so popping flares feels decisive
  const grab = clamp(0.85 + (player.mslEvade || 0) * 0.3 + (player.flarePro ? 0.1 : 0), 0, 0.99);
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
    if (Math.random() < 0.6) spawnSmoke(f.mesh.position, 0xffcc66, 0.45);
    if (f.life <= 0) { scene.remove(f.mesh); flares.splice(i, 1); }
  }
}

/* ---------------- holographic decoys (Tejas) ---------------- */
function buildDecoy() {
  const g = buildJet(0x39e6ff, 0x9af6ff, SHAPES[player.jet.shape]);
  g.traverse(o => { if (o.isMesh && o.material) { const m = o.material; m.transparent = true; m.opacity = 0.42; if (m.emissive) { m.emissive = new THREE.Color(0x1bd6ff); m.emissiveIntensity = 0.9; } m.depthWrite = false; } });
  return g;
}
function spawnDecoys(n) {
  for (let i = 0; i < n; i++) {
    const g = buildDecoy();
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
    if (d.life <= 0) { scene.remove(d.mesh); decoys.splice(i, 1); }
  }
}

/* ---------------- loot & supply crates ---------------- */
let crateTimer = 9;
const MAX_CRATES = 3;

/* small pickup dropped when an enemy dies */
function spawnLoot(pos) {
  const m = new THREE.Mesh(ASSET.lootGeo, new THREE.MeshStandardMaterial({ color: 0x33ffcc, emissive: 0x119977, emissiveIntensity: 1.0, flatShading: true }));
  m.position.copy(pos); scene.add(m);
  loots.push({ mesh: m, kind: 'drop', life: 20, t: rand(0, TWO_PI), radius: 70,
    give: { bullets: 120, missiles: 4, flares: 4, hp: 14 } });
}

/* big free-floating crate the player flies into to rearm */
function spawnCrate(pos) {
  const grp = buildCrate(); grp.position.copy(pos); scene.add(grp);
  loots.push({ mesh: grp, kind: 'crate', life: 34, t: rand(0, TWO_PI), radius: 95,
    give: { bullets: 260, missiles: 6, flares: 6, hp: 18 } });
}

/* periodically drop crates near the player at a reachable altitude */
function maybeSpawnCrate(dt) {
  crateTimer -= dt;
  if (crateTimer > 0) return;
  crateTimer = rand(11, 17);
  let count = 0; for (let i = 0; i < loots.length; i++) if (loots[i].kind === 'crate') count++;
  if (count >= MAX_CRATES) return;
  const ang = rand(0, TWO_PI), r = rand(900, 1900);
  const px = player.group.position.x + Math.cos(ang) * r;
  const pz = player.group.position.z + Math.sin(ang) * r;
  const py = clamp(player.group.position.y + rand(-250, 250), terrainH(px, pz) + 300, 4200);
  spawnCrate(new THREE.Vector3(px, py, pz));
}

function collectLoot(l) {
  const give = l.give || {};
  if (give.bullets)  player.bullets  = Math.min(player.maxBullets,  player.bullets  + give.bullets);
  if (give.missiles) player.missiles = Math.min(player.maxMissiles, player.missiles + give.missiles);
  if (give.flares)   player.flares   = Math.min(player.maxFlares,   player.flares   + give.flares);
  if (give.hp)       player.hp       = Math.min(player.maxHp,       player.hp       + give.hp);
  audio.power(); empFlash = 0.4;
  if (l.kind === 'crate') showBanner('\u25C8 SUPPLY CRATE \u25C8');
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
    // TRACTOR FIELD upgrade: draw small pickups toward the player
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
    const rr = l.radius || 70;
    if (l.mesh.position.distanceToSquared(player.group.position) < rr * rr) {
      collectLoot(l); scene.remove(l.mesh); loots.splice(i, 1); continue;
    }
    if (l.life <= 0) { scene.remove(l.mesh); loots.splice(i, 1); }
  }
}

/* ---------------- particles ---------------- */
function explode(pos, big) {
  audio.explode(big);
  const f = new THREE.Mesh(new THREE.SphereGeometry(big ? 18 : 9, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.9, fog: false }));
  f.position.copy(pos); scene.add(f);
  particles.push({ mesh: f, life: 0.5, max: 0.5, type: 'flash', grow: big ? 110 : 60 });
  const n = big ? 24 : 13;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(ASSET.sparkGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffaa33 : 0xff6633, transparent: true, fog: false }));
    s.position.copy(pos);
    const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(90, 260) * (big ? 1.6 : 1));
    s.quaternion.copy(dirToQuat(v.clone().normalize(), q1)); scene.add(s);
    particles.push({ mesh: s, vel: v, life: rand(0.5, 1.1), max: 1.1, type: 'spark' });
  }
  
  // Physical debris chunks
  const numDebris = big ? randInt(7, 14) : randInt(3, 7);
  for (let i = 0; i < numDebris; i++) {
    const m = new THREE.Mesh(ASSET.fragGeo, ASSET.fragMat);
    m.position.copy(pos).add(new THREE.Vector3(rand(-3,3), rand(-3,3), rand(-3,3)));
    const vel = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1.5), rand(-1, 1)).normalize().multiplyScalar(rand(80, 220));
    m.rotation.set(rand(0, TWO_PI), rand(0, TWO_PI), rand(0, TWO_PI));
    scene.add(m);
    particles.push({ mesh: m, vel, life: rand(1.5, 3.5), max: 3.5, type: 'debris' });
  }

  for (let i = 0; i < (big ? 8 : 4); i++) spawnSmoke(pos, 0x2c2c2c, big ? 1.6 : 1);
  if (big) spawnShockwave(pos);
}
function spawnSmoke(pos, color, scl) {
  const m = new THREE.Mesh(ASSET.smokeGeo, new THREE.MeshBasicMaterial({ color: color || 0x888888, transparent: true, opacity: 0.5, fog: false }));
  m.position.copy(pos).add(t1.set(rand(-4, 4), rand(-4, 4), rand(-4, 4)));
  m.scale.setScalar((scl || 1) * rand(6, 12)); scene.add(m);
  particles.push({ mesh: m, vel: new THREE.Vector3(rand(-8, 8), rand(4, 16), rand(-8, 8)), life: rand(0.6, 1.3), max: 1.3, type: 'smoke', grow: 20 });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; const t = clamp(p.life / p.max, 0, 1);
    if (p.vel) p.mesh.position.addScaledVector(p.vel, dt);
    
    if (p.type === 'flash') { p.mesh.scale.addScalar(p.grow * dt); p.mesh.material.opacity = t * 0.9; }
    else if (p.type === 'spark') { p.vel.multiplyScalar(1 - 2 * dt); p.mesh.material.opacity = t; }
    else if (p.type === 'ring') { const k = 1 + (1 - t) * (p.ringK || 46); p.mesh.scale.setScalar(k); p.mesh.material.opacity = t * 0.85; if (camera) p.mesh.lookAt(camera.position); }
    else if (p.type === 'trail') { p.mesh.scale.addScalar(p.grow * dt); p.mesh.material.opacity = t * 0.4; }
    else if (p.type === 'mcore') { p.mesh.scale.addScalar(p.grow * dt); p.mesh.material.opacity = t * 0.85; }
    else if (p.type === 'debris') { 
        p.vel.y -= 150 * dt; // gravity
        p.vel.multiplyScalar(1 - 0.5 * dt); // drag
        p.mesh.rotation.x += dt * 3;
        p.mesh.rotation.y += dt * 4;
        p.mesh.scale.setScalar(t * 1.2); 
    }
    else { p.mesh.scale.addScalar(p.grow * dt); p.mesh.material.opacity = t * 0.5; if (p.vel) p.vel.multiplyScalar(1 - 1.5 * dt); }
    
    if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
  }
}

/* ---------------- combat resolution ---------------- */
function damagePlayer(amt, src) {
  if (player.invuln > 0) return;
  amt *= DIFFS[difficulty].dmg;
  if (player.dmgReduce) amt *= (1 - player.dmgReduce);   // GUARDIAN SYSTEM upgrade
  player.shieldT = 4.0;
  const hadShield = player.shield > 0;
  if (player.shield > 0) { const s = Math.min(player.shield, amt); player.shield -= s; amt -= s; }
  player.hp -= amt; player.damageFlash = 0.5; player.shake = Math.max(player.shake, 0.4);
  if (src) { player.hurtDir = new THREE.Vector3().copy(src).sub(player.group.position).normalize(); player.hurtT = 1.0; }
  audio.hurt();
  if (player.reactive && hadShield && player.shield <= 0) reactivePulse();   // REACTIVE ARMOUR — the shield going down detonates
  if (player.hp <= 0) {
    if (player.cheatDeath && !player._cheatUsed) {   // APEX PREDATOR — cheat the reaper once per wave
      player._cheatUsed = true; player.hp = player.maxHp * 0.4; player.shield = player.maxShield;
      player.invuln = 2.5; player.damageFlash = 0; empFlash = Math.max(empFlash, 0.6);
      showBanner('\u271D GUARDIAN ANGEL \u271D'); audio.power(); return;
    }
    player.hp = 0; gameOver();
  }
}
/* ---- tech-driven effect helpers (crits, chains, splash, reactive armour) ---- */
let chaining = false;
function critBlast(pos) {
  // ANNIHILATION ROUNDS — an exploding crit throws a small concussive blast at the impact point
  explode(pos.clone ? pos.clone() : pos, false);
  const r2 = 155 * 155, d = player.stats.gunDmg * player.gunDmgMul * 1.3;
  for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (!e.alive) continue; if (pos.distanceToSquared(e.group.position) < r2) damageEnemy(e, d, e.group.position, true); }
}
function chainBlast(origin) {
  spawnShockwave(origin.clone ? origin.clone() : origin);
  const r2 = player.chainRadius * player.chainRadius;
  for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (!e.alive) continue; if (origin.distanceToSquared(e.group.position) < r2) damageEnemy(e, player.chainDmg, e.group.position, true); }
}
function missileSplash(pos, dmg, radius, primary) {
  if (!dmg || !radius) return;
  spawnShockwave(pos.clone ? pos.clone() : pos);
  const r2 = radius * radius;
  for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (!e.alive || e === primary) continue; if (pos.distanceToSquared(e.group.position) < r2) damageEnemy(e, dmg, e.group.position, true); }
}
function reactivePulse() {
  // REACTIVE ARMOUR — a broken shield detonates: concuss nearby foes and blind incoming missiles
  empFlash = Math.max(empFlash, 0.45); spawnShockwave(player.group.position.clone());
  const pp = player.group.position, r2 = 640 * 640;
  for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (!e.alive) continue; if (e.type !== 'boss' && pp.distanceToSquared(e.group.position) < r2) damageEnemy(e, player.reactive, e.group.position, true); }
  for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy && pp.distanceToSquared(m.mesh.position) < r2) m.decoyed = true; }
  showBanner('\u25C8 REACTIVE PULSE'); audio.power();
}
let lastCrit = false;   // set per-hit by damageEnemy so the cannon can spawn an exploding-crit blast
function damageEnemy(e, amt, wp, byPlayer, byCCA) {
  if (byPlayer === undefined) byPlayer = true;
  lastCrit = false;
  if (byPlayer) {
    if (player.alphaMul > 1 && e.hp >= e.maxHp - 0.5) amt *= player.alphaMul;            // MARKSMAN — alpha strike on a healthy target
    if (player.critChance && Math.random() < player.critChance) { amt *= player.critMul; lastCrit = true; }   // CRITICAL OPTICS
  }
  e.hp -= amt; e.hitFlash = 0.12;
  spawnDamageNumber(wp || e.group.position, Math.round(amt), lastCrit);
  player.combo++; player.comboTimer = 2.2;
  player.score += Math.round(amt * (1 + player.combo * 0.05) * (player.scoreMul || 1));
  if (byPlayer) { e.playerDmg = (e.playerDmg || 0) + amt; player.tp += amt * TP.dmg * (player.rpMul || 1); }   // RP from damage YOU deal
  audio.hit();
  if (lastCrit) audio.blip(1700, 0.05, 'sine', 0.09, 1250);
  // EXECUTIONER — finish a wounded non-boss outright
  if (byPlayer && player.execThresh && e.type !== 'boss' && e.hp > 0 && e.hp <= e.maxHp * player.execThresh) {
    e.hp = 0; spawnDamageNumber(e.group.position, '\u2620 EXECUTE', true);
  }
  if (e.type === 'boss' && !e.enraged && e.hp > 0 && e.hp / e.maxHp < 0.35) {
    e.enraged = true; e.turnRate *= 1.3; empFlash = 0.45; showBanner('\u26A0 BOSS ENRAGED \u26A0');
    if (e.group.userData.body) e.group.userData.body.emissiveIntensity = 1.8;
  }
  if (e.hp <= 0) killEnemy(e, byPlayer, byCCA);
}
function tpBaseFor(e) {
  return e.type === 'boss' ? TP.boss : e.type === 'bomber' ? TP.bomber : e.elite ? TP.ace
       : e.type === 'ground' ? TP.ground : e.type === 'drone' ? TP.drone : TP.fighter;
}
function killEnemy(e, byPlayer, byCCA) {
  if (byPlayer === undefined) byPlayer = true;
  e.alive = false; explode(e.group.position, e.type === 'boss' || e.type === 'bomber');
  let pts = e.type === 'boss' ? 6000 : e.type === 'bomber' ? 3000 : e.elite ? 2500 : e.type === 'ground' ? 450 : e.type === 'drone' ? 250 : 1000;
  player.score += Math.round(pts * (1 + player.combo * 0.1) * (player.scoreMul || 1));
  const tpBase = tpBaseFor(e), rpm = (player.rpMul || 1);
  if (byPlayer) player.tp += (tpBase + (player.rpPerKill || 0)) * rpm;
  else if (byCCA) { player.tp += tpBase * 0.5 * rpm; run.escortKills++; }
  else if ((e.playerDmg || 0) > 0.5) player.tp += tpBase * TP.assistFrac * rpm;
  // field-upgrade payoffs
  const shieldCap = player.maxShield + (player.overshieldCap || 0);          // JUGGERNAUT lets shields bank past their normal ceiling
  if (player.lifesteal) {
    const room = player.maxHp - player.hp;
    player.hp = Math.min(player.maxHp, player.hp + player.lifesteal);
    if (player.vampShield && player.lifesteal > room) player.shield = Math.min(shieldCap, player.shield + (player.lifesteal - room) * player.vampShield);  // overheal bleeds into overshield
  }
  if (player.shieldOnKill) player.shield = Math.min(shieldCap, player.shield + player.shieldOnKill);
  if (player.mslRefund && Math.random() < player.mslRefund) player.missiles = Math.min(player.maxMissiles, player.missiles + 1);
  if (player.chainDmg && !chaining) { chaining = true; chainBlast(e.group.position); if (player.chainProp) chainBlast(e.group.position); chaining = false; }  // CHAIN REACTION: a kill cooks off into its neighbours
  if (e.type === 'boss') { run.boss++; showBanner('\u25C6 BOSS DESTROYED \u25C6'); empFlash = 0.5; }
  else if (e.type === 'ground') run.ground++;
  else if (e.type === 'bomber') { run.kills++; showBanner('\u2691 BOMBER DOWN \u2691'); }
  else run.kills++;
  if (e.type === 'drone') { if (Math.random() < 0.12) spawnLoot(e.group.position); }
  else if (e.type !== 'fighter' || e.elite || Math.random() < 0.5) spawnLoot(e.group.position);
  scene.remove(e.group);
  disposeGroup(e.group);
  if (e.marker) scene.remove(e.marker);   // marker geometry/material may be shared — do not dispose it here
  if (player.lockedTarget === e) player.lockedTarget = null;
  if (player.lockTarget === e) { player.lockTarget = null; player.lockProgress = 0; }

  player.killStreak++;
  if (player.killStreak > 0 && player.killStreak % 5 === 0) killStreakReward();
}
function killStreakReward() {
  const n = player.killStreak;
  const names = { 5: 'KILLSTREAK', 10: 'RAMPAGE', 15: 'UNSTOPPABLE', 20: 'GODLIKE' };
  const label = names[n] || 'KILLSTREAK';
  player.flares = player.maxFlares;
  player.missiles = Math.min(player.maxMissiles, player.missiles + 4 + Math.floor(n / 5));
  player.bullets = Math.min(player.maxBullets, player.bullets + 150);
  if (n >= 10) { player.hp = Math.min(player.maxHp, player.hp + 25); player.shield = player.maxShield; }
  showBanner('\u2605 ' + label + ' x' + n + ' \u2605');
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
function cycleLock() {
  const fwd = fwdOf(player.group, t3);
  const cand = [];
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive) continue;
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
  // auto-designate the nearest target only when Auto-Lock is enabled; otherwise the player must press F
  if (!player.lockTarget || !player.lockTarget.alive) {
    if (autoLock) { player.lockTarget = nearestEnemyInFront(0.94); }
    else if (!player.lockTarget) player.lockTarget = null;
    player.lockProgress = 0; player.lockedTarget = null;
  }
  const tgt = player.lockTarget;
  if (!tgt || !tgt.alive) { player.lockProgress = 0; player.lockedTarget = null; return; }
  const fwd = fwdOf(player.group, t3);
  const to = t4.copy(tgt.group.position).sub(player.group.position);
  const dist = to.length(); to.multiplyScalar(1 / Math.max(dist, 0.001));
  const aligned = fwd.dot(to);
  const acquiring = aligned > 0.92 && dist < 5200 && !tgt.isInCloud;
  if (acquiring) {
    const prev = player.lockProgress;
    player.lockProgress = Math.min(1, player.lockProgress + dt / (LOCK_TIME * (player.lockSpeedMul || 1)));
    player._lockT -= dt;
    if (player._lockT <= 0) { audio.blip(820 + player.lockProgress * 700, 0.04, 'square', 0.05); player._lockT = lerp(0.34, 0.07, player.lockProgress); }
    if (prev < 1 && player.lockProgress >= 1) { player.lockedTarget = tgt; audio.lock(); audio.blip(1850, 0.14, 'sine', 0.13); }
  } else {
    player.lockProgress = Math.max(0, player.lockProgress - dt / (LOCK_TIME * 0.5));
    if (player.lockProgress < 1) player.lockedTarget = null;
    if (aligned < 0.55 || dist > 6500) player.lockTarget = null;
  }
}
function interceptPoint(shooter, tp, tv, bs) {
  const D = tA.copy(tp).sub(shooter);
  const a = tv.dot(tv) - bs * bs, b = 2 * D.dot(tv), c = D.dot(D);
  let t;
  if (Math.abs(a) < 1e-3) { if (Math.abs(b) < 1e-6) return null; t = -c / b; }
  else { const disc = b * b - 4 * a * c; if (disc < 0) return null; const sq = Math.sqrt(disc); const r1 = (-b - sq) / (2 * a), r2 = (-b + sq) / (2 * a); t = Math.min(r1, r2); if (t < 0) t = Math.max(r1, r2); }
  if (!(t > 0) || t > 6) return null;
  return new THREE.Vector3().copy(tp).addScaledVector(tv, t);
}

/* ---------------- special abilities ---------------- */
function hasSpecial(jet) { return !!(jet && jet.ability); }
function useSpecial() {
  if (!hasSpecial(player.jet)) { audio.ui(); return; }
  if (player.special.cd > 0) { audio.ui(); return; }
  player.special.cd = player.special.max; audio.power();
  const id = player.jet.id;
  const pp = player.group.position;

  if (id === 'F-22') {
    // OVERDRIVE — afterburner surge: +speed, +gun dmg, 4-round spread cannon (see fireGun)
    player.overdrive = 6; showBanner('OVERDRIVE'); empFlash = 0.3;

  } else if (id === 'SU-57') {
    // COBRA + KINETIC SHOCKWAVE — post-stall reversal that also blasts anyone close
    player.speed *= 0.2; player.pitchRate = player.stats.turnRate * 3.6; player.invuln = 1.5;
    spawnShockwave(pp); explode(pp, true);
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.alive && e.type !== 'boss' && e.group.position.distanceToSquared(pp) < 102400) damageEnemy(e, 120, e.group.position); }
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy && m.mesh.position.distanceToSquared(pp) < 490000) { m.decoyed = true; if (Math.random() < 0.85) m.life = 0.05; } }
    showBanner('COBRA'); audio.explosion && audio.explosion();

  } else if (id === 'J-20') {
    // EMP PULSE — wide-area systems kill + free instant lock on the nearest contact (it has no gun)
    player.empBurst = 6; empFlash = 0.85;
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy && m.mesh.position.distanceToSquared(pp) < 2890000) { explode(m.mesh.position, false); m.life = 0; } }
    const near = nearestEnemyInFront(0.4) || (enemies.filter(e => e.alive).sort((a, b) => pp.distanceToSquared(a.group.position) - pp.distanceToSquared(b.group.position))[0]);
    if (near) { player.lockTarget = near; player.lockProgress = 1; player.lockedTarget = near; }
    showBanner('EMP PULSE');

  } else if (id === 'F-35') {
    // STEALTH FIELD — vanish; missiles fired while cloaked become guaranteed ambush kills (see fireMissile)
    player.stealthField = 7; showBanner('CLOAK \u00B7 AMBUSH ARMED');

  } else if (id === 'EFT') {
    // MISSILE SALVO — 6 hard-homing missiles, +40% damage, spread across the nearest threats
    const tg = enemies.filter(e => e.alive).sort((a, b) => pp.distanceToSquared(a.group.position) - pp.distanceToSquared(b.group.position));
    for (let k = 0; k < 6; k++) {
      const target = tg[k % Math.max(1, tg.length)] || player.lockedTarget;
      const dir = fwdOf(player.group, new THREE.Vector3()).applyAxisAngle(UPV, rand(-0.4, 0.4)); dir.y += rand(-0.1, 0.18); dir.normalize();
      const m = spawnMissile(pp, dir, target, false, 1.4 * player.missileDmgMul); if (m && target) m.hardHome = true;
    }
    showBanner('MISSILE SALVO'); audio.missile(); run.missiles += 6;

  } else if (id === 'RAFALE') {
    // SPECTRA JAMMER — 6s of total missile immunity: incoming go blind, enemies can't launch
    player.jammer = 6; empFlash = 0.4;
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy) { m.decoyed = true; if (m.maxSpeed > 600) m.maxSpeed = 600; } }
    showBanner('SPECTRA JAMMER'); audio.power();

  } else if (id === 'TEJAS') {
    // HOLO-DECOYS — 3 holographic doubles draw enemy guns & missiles, and pull current shots off you
    spawnDecoys(3);
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy && !m.decoyed && decoys.length) { m.holo = decoys[(Math.random() * decoys.length) | 0]; m.decoyed = true; } }
    showBanner('HOLO-DECOYS'); empFlash = 0.25;

  } else if (id === 'FA18') {
    // COMBAT TRANCE — bullet-time: the world drops to 40% while you fly & fire at full speed
    player.slow = 4; empFlash = 0.3; showBanner('COMBAT TRANCE'); audio.power();

  } else if (id === 'J-36') {
    // ORDNANCE STORM — empty the bays: a 10-missile saturation barrage + a heavy ablative shield
    const tg = enemies.filter(e => e.alive).sort((a, b) => pp.distanceToSquared(a.group.position) - pp.distanceToSquared(b.group.position));
    let fired = 0;
    for (let k = 0; k < 10; k++) {
      const target = tg[k % Math.max(1, tg.length)] || player.lockedTarget;
      const dir = fwdOf(player.group, new THREE.Vector3()).applyAxisAngle(UPV, rand(-0.55, 0.55)); dir.y += rand(-0.12, 0.22); dir.normalize();
      const m = spawnMissile(pp, dir, target, false, 1.55 * player.missileDmgMul); if (m) { if (target) m.hardHome = true; fired++; }
    }
    player.shield = Math.max(player.shield, player.maxShield) + 90; player.shieldT = 6;   // ablative over-shield
    empFlash = 0.4; showBanner('ORDNANCE STORM'); audio.missile(); run.missiles += fired;

  } else if (id === 'F-47') {
    // CCA SWARM — launch three vivid electric-blue drones far ahead where you can see them
    const fwd = fwdOf(player.group, new THREE.Vector3()), right = rightOf(player.group, new THREE.Vector3());
    const pp = player.group.position;
    const offsets = [                             // staggered fan: centre + left + right
      { ahead: 320, lateral:   0, vert:  10 },
      { ahead: 240, lateral:-185, vert:  30 },
      { ahead: 240, lateral: 185, vert:  30 },
    ];
    let launched = 0;
    for (let k = 0; k < offsets.length; k++) {
      const o = offsets[k];
      const pt = pp.clone().addScaledVector(fwd, o.ahead).addScaledVector(right, o.lateral).addScaledVector(UPV, o.vert);
      if (spawnCCA(pt)) launched++;
    }
    spawnShockwave(pp.clone());
    explode(pp.clone(), false);
    empFlash = Math.max(empFlash, 0.5);
    audio.power();
    showBanner('\u25B6 CCA SWARM \u00B7 ' + launched + ' DRONES AWAY');

  } else if (id === 'NGAD') {
    // DEW LANCE — sustained directed-energy beam (damage handled in updatePlayer)
    player.dewLance = 3; empFlash = 0.3; showBanner('DEW LANCE \u00B7 FIRING'); audio.power();

  } else if (id === 'J-50') {
    // VECTOR SURGE — supermaneuver: agility & thrust soar, missiles lose lock, a plasma wake guts close passes
    player.vectorSurge = 6; player.invuln = 0.4; empFlash = 0.3;
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy) { m.decoyed = true; if (m.maxSpeed > 640) m.maxSpeed = 640; } }
    showBanner('VECTOR SURGE'); audio.power();
  }
}

/* ---------------- player update ---------------- */
function updatePlayer(dt) {
  const st = player.stats;
  player.gunCd -= dt; player.missileCd -= dt; player.flareCd -= dt;
  if (player.overdrive > 0) player.overdrive -= dt;
  if (player.empBurst > 0) player.empBurst -= dt;
  if (player.stealthField > 0) player.stealthField -= dt;
  if (player.invuln > 0) player.invuln -= dt;
  if (player.jammer > 0) player.jammer -= dt;
  if (player.slow > 0) player.slow -= dt;
  if (player.dewLance > 0) player.dewLance -= dt;
  if (player.vectorSurge > 0) player.vectorSurge -= dt;
  if (player.special.cd > 0) player.special.cd -= dt;
  if (player.damageFlash > 0) player.damageFlash -= dt;
  if (player.shake > 0) player.shake -= dt;
  if (player.comboTimer > 0) { player.comboTimer -= dt; if (player.comboTimer <= 0) player.combo = 0; }
  if (player.shieldT > 0) player.shieldT -= dt;
  else if (player.shield < player.maxShield) player.shield = Math.min(player.maxShield, player.shield + 16 * (player.shieldRegenMul || 1) * dt);

  // Combine keyboard and touch input
  let pitchIn = 0, rollIn = 0, yawIn = 0;
  if (down('KeyW')) pitchIn -= 1;
  if (down('KeyS')) pitchIn += 1;
  if (down('KeyQ')) rollIn += 1;
  if (down('KeyE')) rollIn -= 1;
  if (down('KeyA')) yawIn += 1;
  if (down('KeyD')) yawIn -= 1;

  if (isTouchEnabled && joyActive) {
    pitchIn = touchInput.y;
    rollIn = -touchInput.x;
  }

  if (invertY) pitchIn = -pitchIn;
  
  const brake = down('ControlLeft') || down('ControlRight') || touchBtns.brk;
  const thr = down('ShiftLeft') || down('ShiftRight') || touchBtns.thr;
  player.highG = brake && (down('KeyS') || (isTouchEnabled && touchInput.y > 0.5));

  const tb = st.turnRate * (player.turnMul || 1) * (player.vectorSurge > 0 ? 1.85 : 1);   // PROPULSION agility + VECTOR SURGE supermaneuver
  const tgtPitch = pitchIn * tb * (player.highG ? 2.0 : 1.0);
  const tgtRoll = rollIn * tb * 1.6;
  const tgtYaw = yawIn * tb * 0.5;
  player.pitchRate = damp(player.pitchRate, tgtPitch, player.vectorSurge > 0 ? 6.5 : 4.5, dt);
  player.rollRate = damp(player.rollRate, tgtRoll, 5.5, dt);
  player.yawRate = damp(player.yawRate, tgtYaw, 4.5, dt);

  eul.set(player.pitchRate * dt, player.yawRate * dt, player.rollRate * dt, 'XYZ');
  q1.setFromEuler(eul);
  player.group.quaternion.multiply(q1);

  let tT = player.throttle;
  if (thr) tT += dt * (0.35 + st.accel * 0.22);
  if (brake) tT -= dt * (0.5 + st.accel * 0.3);
  player.throttle = clamp(tT, 0, 1);
  let maxS = st.maxSpeed * (player.speedMul || 1) * (player.overdrive > 0 ? 1.75 : player.vectorSurge > 0 ? 1.4 : 1);
  if (player.highG) maxS *= 0.42;
  const tgtSpeed = lerp(st.minSpeed, maxS, player.throttle);
  player.speed = damp(player.speed, tgtSpeed, (player.highG ? 3.0 : 0.9) * st.accel, dt);

  const fwd = fwdOf(player.group, t1);
  const rgt = rightOf(player.group, t3);
  
  player.vel.lerp(t2.copy(fwd).multiplyScalar(player.speed), 1 - Math.exp(-3.5 * dt));
  player.group.position.addScaledVector(player.vel, dt);

  const gh = terrainH(player.group.position.x, player.group.position.z);
  const agl = player.group.position.y - gh;
  player.gpws = agl < 270 && fwd.y < 0.06;
  if (agl < 130) player.pitchRate = Math.max(player.pitchRate, tb * 1.7);
  if (agl < 22) { player.group.position.y = gh + 22; player.vel.y = Math.max(player.vel.y, 30); }

  const B = 12000;
  if (player.group.position.x > B) player.group.position.x = B;
  if (player.group.position.x < -B) player.group.position.x = -B;
  if (player.group.position.z > B) player.group.position.z = B;
  if (player.group.position.z < -B) player.group.position.z = -B;
  if (player.group.position.y > 5200) player.group.position.y = 5200;

  player.stealth = player.stealthField > 0 || inCloud(player.group.position);

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
  
  // Trails and wingtip vortices — kept sparse so they don't clutter the view in level flight
  player._trailT -= dt;
  if (player._trailT <= 0) {
      // Engine contrails ONLY on afterburner (overdrive) or near full throttle at high speed — short & faint
      if (player.overdrive > 0 || (player.throttle > 0.95 && player.speed > st.maxSpeed * 0.92)) {
        const bk = fwdOf(player.group, t4).multiplyScalar(-1);
        const op = player.overdrive > 0 ? 0.32 : 0.18;
        spawnTrail(t5.copy(player.group.position).addScaledVector(rgt, 6).addScaledVector(bk, 4), 0xbfeaff, op);
        spawnTrail(t5.copy(player.group.position).addScaledVector(rgt, -6).addScaledVector(bk, 4), 0xbfeaff, op);
      }
      // Wingtip vapor ONLY during genuine hard maneuvering
      if (player.highG || Math.abs(player.pitchRate) > st.turnRate * 1.5 || Math.abs(player.rollRate) > st.turnRate * 1.7) {
          const span = (player.group.userData.cfg && player.group.userData.cfg.wingspan) || 9;
          spawnTrail(t4.copy(player.group.position).addScaledVector(rgt, span), 0xffffff, 0.32);
          spawnTrail(t4.copy(player.group.position).addScaledVector(rgt, -span), 0xffffff, 0.32);
      }
      player._trailT = 0.07;
  }

  if (down('Space') || touchBtns.gun) fireGun();
  updateLockOn(dt);

  // ---- DEW LANCE (NGAD): sustained directed-energy beam down the boresight ----
  updateDewLance(dt);
  // ---- VECTOR SURGE (J-50): plasma wake guts anything you cut close past; missiles keep losing lock ----
  if (player.vectorSurge > 0) {
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (m.enemy && Math.random() < 0.6) m.decoyed = true; }
    player._wakeT -= dt;
    if (player._wakeT <= 0) {
      const bk = fwdOf(player.group, t4).multiplyScalar(-1);
      spawnTrail(t5.copy(player.group.position).addScaledVector(bk, 5), 0x46ffd0, 0.5);
      player._wakeT = 0.03;
    }
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]; if (!e.alive || e.type === 'boss') continue;
      if (e.group.position.distanceToSquared(player.group.position) < 38000) damageEnemy(e, 110 * dt, e.group.position, true);
    }
  }

  player._gpwsT -= dt; if (player.gpws && player._gpwsT <= 0) { audio.warn(); player._gpwsT = 0.5; }
  const incoming = missiles.some(m => m.enemy);
  player._missT -= dt; if (incoming && player._missT <= 0) { audio.blip(900, 0.1, 'square', 0.13); player._missT = 0.55; }
}

/* DEW LANCE — directed-energy beam: melts whatever is in the forward arc, swats missiles that stray in */
let _dewBeam = null;
function ensureDewBeam() {
  if (_dewBeam) return _dewBeam;
  const geo = new THREE.CylinderGeometry(0.6, 1.6, 1, 12, 1, true);
  geo.translate(0, -0.5, 0); geo.rotateX(-Math.PI / 2);   // grows forward along -Z from the nose
  const mat = new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  _dewBeam = new THREE.Mesh(geo, mat); _dewBeam.visible = false; scene.add(_dewBeam);
  return _dewBeam;
}
function updateDewLance(dt) {
  const beam = ensureDewBeam();
  if (!player || player.dewLance <= 0) { beam.visible = false; return; }
  const pp = player.group.position, fwd = fwdOf(player.group, t1);
  const RANGE = 2600, COSCONE = 0.985;   // tight ~10° cone
  // visual: a flickering lance from the nose
  beam.visible = true;
  beam.position.copy(pp).addScaledVector(fwd, 13);
  dirToQuat(fwd, beam.quaternion);
  beam.scale.set(1 + Math.random() * 0.25, 1 + Math.random() * 0.25, RANGE);
  beam.material.opacity = 0.45 + Math.random() * 0.3;
  // damage the nearest target inside the cone
  let best = null, bd = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive) continue;
    const to = t2.copy(e.group.position).sub(pp); const d = to.length();
    if (d > RANGE) continue; to.multiplyScalar(1 / d);
    if (fwd.dot(to) < COSCONE) continue;
    if (d < bd) { bd = d; best = e; }
  }
  if (best) {
    damageEnemy(best, 360 * dt, best.group.position, true);   // ~360 dmg/s — melts fighters, hurts bosses
    if (Math.random() < 0.5) spawnTrail(best.group.position, 0x9ff0ff, 0.5);
  }
  // swat incoming missiles that wander into the beam
  for (let i = 0; i < missiles.length; i++) {
    const m = missiles[i]; if (!m.enemy) continue;
    const to = t2.copy(m.mesh.position).sub(pp); const d = to.length();
    if (d > RANGE) continue; to.multiplyScalar(1 / d);
    if (fwd.dot(to) > COSCONE - 0.01) { explode(m.mesh.position, false); m.life = 0; }
  }
}
