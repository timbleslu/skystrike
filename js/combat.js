/* SKYSTRIKE — combat.js: bullets, missiles, flares, decoys, loot, particles, damage/kill resolution, targeting, specials, player update, DEW lance. Load 4th. */

/* ---------------- bullets ---------------- */
function getBullet() {
  let b = BPOOL.pop();
  if (!b) b = { mesh: new THREE.Mesh(ASSET.bulletGeo, ASSET.bulletMat), vel: new THREE.Vector3(), life: 0, dmg: 0, enemy: false };
  b.ai = false; b.oriented = false;
  scene.add(b.mesh); return b;
}
function recycleBullet(b) { detachFromScene(b.mesh); BPOOL.push(b); }

// ADRENALINE — bonus damage that scales with how much HP you've lost (1.0 at full HP)
function berserkMul() { return player.berserk ? 1 + player.berserk * (1 - clamp(player.hp / player.maxHp, 0, 1)) : 1; }
// KILL FRENZY — current intensity 0..1 from the decaying frenzy timer
function frenzyAmt() { return player.frenzyMax ? clamp(player.frenzy / player.frenzyMax, 0, 1) : 0; }
function fireGun() {
  if (player.noCannon) { player.gunCd = 0.3; return; }   // J-20 carries no internal gun
  if (player.gunCd > 0) return;
  if (player.bullets <= 0) { player.gunCd = 0.25; audio.ui(); return; }
  const od = player.overdrive > 0;
  const fz = frenzyAmt();
  player.gunCd = (od ? 0.05 : 0.07) * (player.fireRateMul || 1) * (1 - 0.4 * fz);   // FRENZY spins the cannon up
  const fwd = fwdOf(player.group, t1), rgt = rightOf(player.group, t2);
  const dmg = player.stats.gunDmg * player.gunDmgMul * (od ? 1.5 : 1) * berserkMul() * (1 + 0.3 * fz);
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
  const mz = player.group.userData.muzzle;
  if (mz) { mz.visible = true; mz.scale.setScalar(rand(11, 18)); mz.material.rotation = rand(0, TWO_PI); player.muzzleT = 0.045; }
  player.shake = Math.max(player.shake, 0.12);
  player.firingT = 0.12;   // "weapon fired this frame" tell for the stealth detection meter (missions.js)
  audio.gun();
  haptic(8);
  run.shots += used;
}

function updateBullets(dt, ts) {
  ts = ts || 1;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; const sdt = b.enemy ? dt * ts : dt;
    if (!b.oriented) { b.oriented = true; dirToQuat(t3.copy(b.vel).normalize(), b.mesh.quaternion); }   // align tracer with flight path
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
            if (!b.ai) e._lastPlayerWp = 'gun';
            let bDmg = b.dmg;
            if (!b.ai && e.type === 'ground' && player.rktMul) bDmg *= player.rktMul;   // ROCKET PODS
            damageEnemy(e, bDmg, b.mesh.position, !b.ai, b.byCCA);
            if (!b.ai) { spawnHitMarker(); run.hits++; if (lastCrit && player.critChain) critBlast(b.mesh.position); }
            if (!b.ai && player.burnDps && e.alive) { e.burnT = player.burnTime; e.burnDps = player.burnDps; }   // INCENDIARY ROUNDS: light it up
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
  const dm = player.missileDmgMul * (player.overdrive > 0 ? 1.4 : 1) * berserkMul() * (1 + 0.3 * frenzyAmt());
  player.missileCd = 0.55;
  player.firingT = 0.12;   // missile launch also trips the stealth detection meter (missions.js)
  const salvo = 1 + (player.mslSwarm || 0);   // SWARM RACK looses extra birds — bonus birds are free, only 1 leaves the rack
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
  player.missiles -= 1; run.missiles += salvo; run.pMissiles += salvo;
  audio.missile();
  haptic(25);
}
function spawnMissile(pos, dir, target, enemy, dmgMul) {
  // shared-asset airframe with tracking halo + motor exhaust baked in (see buildMissileMesh)
  const mesh = buildMissileMesh(enemy);
  mesh.position.copy(pos).addScaledVector(dir, 11);
  scene.add(mesh);
  const smokeColor = enemy ? 0xd9d2cc : 0xdfe2e6;   // thin warm-grey (foe) / cool-grey (yours) contrail — no neon
  const obj = {
    mesh, halo: mesh.userData.halo, exhaust: mesh.userData.exhaust,
    vel: dir.clone().multiplyScalar(enemy ? 500 : 600), speed: enemy ? 500 : 600,
    maxSpeed: enemy ? 880 : 1050, target, enemy, life: 7, dmg: (enemy ? 16 : 34) * (dmgMul || 1),
    armed: 0.22, decoy: null, decoyed: false, smokeT: 0, trailColor: smokeColor, hardHome: false, ambush: false,
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
      // === F4 defensive-ai: enemy flares spoof PLAYER missiles (mirror of the player-flare spoof above) ===
      if (!m.decoy) { for (let k = 0; k < flares.length; k++) { const f = flares[k]; if (f.owner === 'enemy' && m.mesh.position.distanceToSquared(f.mesh.position) < 67600 && Math.random() < EVADE.flareSpoofChance) { m.decoy = f; break; } } }
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

    if (m.exhaust) m.exhaust.scale.setScalar(5.5 + 1.6 * (m.speed / m.maxSpeed) + rand(-0.5, 0.5));   // small rear flame, gentle flicker
    m.smokeT -= sdt; if (m.smokeT <= 0) { spawnMissileTrail(m.mesh.position, m.trailColor || (m.enemy ? 0xd9d2cc : 0xdfe2e6)); m.smokeT = 0.02; }

    let hit = false;
    if (m.enemy) {
      // POINT-DEFENSE LASER — a chance to swat an incoming missile out of the air before it connects
      if (player.pointDefense && m.armed <= 0 && m.mesh.position.distanceToSquared(player.group.position) < 810000 && Math.random() < player.pointDefense * sdt * 3.2) {
        firePdBeam(player.group.position, m.mesh.position, 0x9ff0ff);
        explode(m.mesh.position, false); audio.blip(1500, 0.05, 'square', 0.07, 900); hit = true;
      }
      // GUARDIAN ESCORTS — your wingmen run their own point-defense over the flight
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
        if (m.fromGround && player.bellyArmor) mDmg *= player.bellyArmor;   // BELLY ARMOR
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
            if (!m.ai && player.agmMul) gDmg *= player.agmMul;   // AGM RAILS
            damageEnemy(e, gDmg, m.mesh.position, !m.ai, m.byCCA);
          }
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
    if (f.life <= 0) {
      if (f.owner === 'player' && player.flakFlares) missileSplash(f.mesh.position, player.flakFlares, 260, null);   // FLAK BLOOM — flares burn out as HE bursts
      detachFromScene(f.mesh); flares.splice(i, 1);
    }
  }
}

/* ---------------- holographic decoys (Tejas) ---------------- */
function buildDecoy() {
  const g = buildJet(0x39e6ff, 0x9af6ff, SHAPES[player.jet.shape]);
  holoTint(g);   // render layer owns the holographic material mutation
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
    if (d.life <= 0) { detachFromScene(d.mesh); decoys.splice(i, 1); }
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
  // Crate cadence scales UP over the run (balance pass 2026-06): early waves get frequent restocks
  // (~11-17s) but the gap stretches toward ~18-28s by ~wave 14, so late-game resource pressure returns
  // (constant fast resupply was erasing the loss-aversion tension). Linear ramp, clamped both ends.
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
  const give = l.give || {};
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
      collectLoot(l); detachFromScene(l.mesh); loots.splice(i, 1); continue;
    }
    if (l.life <= 0) { detachFromScene(l.mesh); loots.splice(i, 1); }
  }
}

/* ---------------- particles ---------------- */
function explode(pos, big) {
  audio.explode(big);
  // white-hot core flash
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff2cc, blending: THREE.AdditiveBlending, transparent: true, opacity: 1, depthWrite: false, fog: false }));
  f.position.copy(pos); f.scale.setScalar(big ? 110 : 55); scene.add(f);
  particles.push({ mesh: f, life: 0.22, max: 0.22, type: 'flash', grow: big ? 320 : 180 });
  // additive fireball bloom — sells the blast at any distance
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff8a30, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
  glow.position.copy(pos); glow.scale.setScalar(big ? 240 : 120); scene.add(glow);
  particles.push({ mesh: glow, life: 0.55, max: 0.55, type: 'flash', grow: big ? 140 : 70 });
  // churning fireball: textured flame sprites tumbling outward
  const nf = big ? 7 : 4;
  for (let i = 0; i < nf; i++) {
    const fb = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex(), blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false, fog: false, rotation: rand(0, TWO_PI) }));
    fb.position.copy(pos).add(t1.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(big ? 16 : 7));
    fb.scale.setScalar(rand(0.7, 1.3) * (big ? 95 : 48)); scene.add(fb);
    particles.push({ mesh: fb, vel: new THREE.Vector3(rand(-26, 26), rand(-6, 44), rand(-26, 26)), life: rand(0.45, 0.8), max: 0.8, type: 'fire', grow: (big ? 70 : 42), rot: rand(-2.4, 2.4) });
  }
  const n = big ? 24 : 13;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(ASSET.sparkGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffaa33 : 0xff6633, transparent: true, fog: false }));
    s.position.copy(pos);
    const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(90, 260) * (big ? 1.6 : 1));
    s.quaternion.copy(dirToQuat(v.clone().normalize(), q1)); scene.add(s);
    particles.push({ mesh: s, vel: v, life: rand(0.5, 1.1), max: 1.1, type: 'spark' });
  }

  // Physical debris chunks, trailing embers while hot
  const numDebris = big ? randInt(7, 14) : randInt(3, 7);
  for (let i = 0; i < numDebris; i++) {
    const m = new THREE.Mesh(ASSET.fragGeo, ASSET.fragMat);
    m.position.copy(pos).add(new THREE.Vector3(rand(-3,3), rand(-3,3), rand(-3,3)));
    const vel = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1.5), rand(-1, 1)).normalize().multiplyScalar(rand(80, 220));
    m.rotation.set(rand(0, TWO_PI), rand(0, TWO_PI), rand(0, TWO_PI));
    scene.add(m);
    particles.push({ mesh: m, vel, life: rand(1.5, 3.5), max: 3.5, type: 'debris', emberT: 0 });
  }

  for (let i = 0; i < (big ? 9 : 5); i++) spawnSmoke(pos, 0x20242a, big ? 2.6 : 1.5);
  // ground strikes throw up a ring of dust hugging the deck
  const gh = Math.max(terrainH(pos.x, pos.z), -10);
  if (pos.y - gh < 30) {
    for (let i = 0; i < (big ? 8 : 5); i++) {
      const a = rand(0, TWO_PI), r = rand(10, big ? 60 : 34);
      const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudPuffTex(), color: 0x8a7a62, transparent: true, opacity: 0.55, depthWrite: false, fog: true, rotation: rand(0, TWO_PI) }));
      d.position.set(pos.x + Math.cos(a) * r, gh + rand(4, 14), pos.z + Math.sin(a) * r);
      d.scale.setScalar(rand(26, 54)); scene.add(d);
      particles.push({ mesh: d, vel: new THREE.Vector3(Math.cos(a) * 28, rand(6, 16), Math.sin(a) * 28), life: rand(1.2, 2.0), max: 2.0, type: 'smokeS', grow: 30, rot: rand(-0.8, 0.8) });
    }
  }
  if (big) spawnShockwave(pos);
}
function spawnSmoke(pos, color, scl) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudPuffTex(), color: color || 0x888888, transparent: true, opacity: 0.55, depthWrite: false, fog: true, rotation: rand(0, TWO_PI) }));
  m.position.copy(pos).add(t1.set(rand(-4, 4), rand(-4, 4), rand(-4, 4)));
  m.scale.setScalar((scl || 1) * rand(16, 26)); scene.add(m);
  particles.push({ mesh: m, vel: new THREE.Vector3(rand(-8, 8), rand(8, 22), rand(-8, 8)), life: rand(1.0, 1.9), max: 1.9, type: 'smokeS', grow: 26, rot: rand(-1.2, 1.2) });
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
    else if (p.type === 'fire') {   // textured fireball: churn, swell, burn out fast
        p.mesh.scale.addScalar(p.grow * dt);
        p.mesh.material.rotation += p.rot * dt;
        p.mesh.material.opacity = t * t * 0.95;
        p.vel.multiplyScalar(1 - 1.2 * dt);
    }
    else if (p.type === 'smokeS') { // textured smoke: drift up, slow roll, long fade
        p.mesh.scale.addScalar(p.grow * dt);
        p.mesh.material.rotation += p.rot * dt;
        p.mesh.material.opacity = t * 0.55;
        p.vel.multiplyScalar(1 - 0.9 * dt);
    }
    else if (p.type === 'debris') {
        p.vel.y -= 150 * dt; // gravity
        p.vel.multiplyScalar(1 - 0.5 * dt); // drag
        p.mesh.rotation.x += dt * 3;
        p.mesh.rotation.y += dt * 4;
        p.mesh.scale.setScalar(t * 1.2);
        p.emberT -= dt;     // hot fragments shed a glowing trail for the first half of their life
        if (p.emberT <= 0 && t > 0.5) { spawnTrail(p.mesh.position, 0xff9540, 0.45); p.emberT = 0.07; }
    }
    else { p.mesh.scale.addScalar(p.grow * dt); p.mesh.material.opacity = t * 0.5; if (p.vel) p.vel.multiplyScalar(1 - 1.5 * dt); }
    
    if (p.life <= 0) { detachFromScene(p.mesh); particles.splice(i, 1); }
  }
}

/* ---------------- combat resolution ---------------- */
function damagePlayer(amt, src) {
  if (player.invuln > 0) return;
  amt *= DIFFS[difficulty].dmg;
  if (player.dmgReduce) amt *= (1 - player.dmgReduce);   // GUARDIAN SYSTEM upgrade
  run.damageTaken = (run.damageTaken || 0) + amt;
  noDamageWave = false;   // a hit landed this wave — the no-damage star is off for it (star objectives)
  player.shieldT = 4.0;
  const hadShield = player.shield > 0;
  if (player.shield > 0) { const s = Math.min(player.shield, amt); player.shield -= s; amt -= s; }
  player.hp -= amt; player.damageFlash = 0.5; player.shake = Math.max(player.shake, 0.4); shakeCam(0.5);
  if (src) { player.hurtDir = new THREE.Vector3().copy(src).sub(player.group.position).normalize(); player.hurtT = 1.0; }
  audio.hurt();
  haptic(60);
  if (player.reactive && hadShield && player.shield <= 0) reactivePulse();   // REACTIVE ARMOUR — the shield going down detonates
  if (player.hp <= 0) {
    if (player.cheatDeath && !player._cheatUsed) {   // APEX PREDATOR — cheat the reaper once per RUN (balance 2026-06; _cheatUsed reset only in startGame)
      player._cheatUsed = true; player.hp = player.maxHp * 0.4; player.shield = player.maxShield;
      player.invuln = 2.5; player.damageFlash = 0; empFlash = Math.max(empFlash, 0.6);
      showBanner(t('banner.guardianAngel')); audio.power(); return;
    }
    player.hp = 0; player.streak = streakStep(player.streak, 'death', 0); gameOver();   // F5: player death resets the kill-streak (death branch ignores the clock arg)
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
  showBanner(t('banner.reactivePulse')); audio.power();
}
let lastCrit = false;   // set per-hit by damageEnemy so the cannon can spawn an exploding-crit blast
function damageEnemy(e, amt, wp, byPlayer, byCCA) {
  if (byPlayer === undefined) byPlayer = true;
  lastCrit = false;
  // Pure arithmetic/decision (core.js resolveDamage): multipliers, hp, RP, EXECUTE + death.
  // The crit roll is injected (Math.random()) so the core stays pure; we APPLY the result below.
  const dr = resolveDamage(
    { hp: e.hp, maxHp: e.maxHp, type: e.type, playerDmg: e.playerDmg },
    { amt: amt, byPlayer: byPlayer, rand: Math.random(),
      alphaMul: player.alphaMul, comboDmg: player.comboDmg, combo: player.combo,
      critChance: player.critChance, critMul: player.critMul,
      execThresh: player.execThresh, rpMul: player.rpMul, tpDmg: TP.dmg }
  );
  amt = dr.amt; lastCrit = dr.crit;
  e.hp = dr.hp; e.hitFlash = 0.12;
  spawnDamageNumber(wp || e.group.position, Math.round(amt), lastCrit);
  // Pure hit-reward (core.js awardHit): combo bump + timer reset + combo-scaled hit score.
  const hr = awardHit({ combo: player.combo }, { amt: amt, scoreMul: player.scoreMul || 1 });
  player.combo = hr.combo; player.comboTimer = hr.comboTimer; player.score += hr.score;
  if (byPlayer) { e.playerDmg = dr.playerDmg; player.tp += dr.rp; }   // RP from damage YOU deal
  audio.hit();
  if (lastCrit) audio.blip(1700, 0.05, 'sine', 0.09, 1250);
  // EXECUTIONER — finish a wounded non-boss outright
  if (dr.executed) {
    spawnDamageNumber(e.group.position, '\u2620 EXECUTE', true);
    if (player.execBlast) missileSplash(e.group.position, player.execBlast, 320, e);   // HEADSMAN \u2014 the execution detonates
  }
  if (e.type === 'boss' && e.hp > 0) {
    // HP thresholds drive a once-per-phase state machine (bossPhaseFor/nextBossPhase, globals.js).
    // nextBossPhase never regresses and only advances, so a transition fires exactly once even if
    // HP oscillates near a boundary (lifesteal etc.) — and a big hit can skip straight to phase 3.
    const np = nextBossPhase(e.phase, e.hp / e.maxHp);
    while (e.phase < np) bossEnterPhase(e, e.phase + 1);   // step through each crossed phase in order
  }
  if (e.hp <= 0) killEnemy(e, byPlayer, byCCA);
  else if (byPlayer) haptic(6);   // light buzz on landing a non-fatal hit (kills buzz via killEnemy)
}
// Boss crosses an HP threshold -> escalate. Idempotent per phase (the caller guards via
// nextBossPhase). Bumps aggression (turnRate; fire-rate/specials read e.phase elsewhere) and
// fires a visual cue + banner + screen shake. Reusable by a future Boss-Rush mode.
function bossEnterPhase(e, ph) {
  e.phase = ph;
  // Capture the boss's BASE turnRate once so per-phase multipliers compose cleanly off it
  // (instead of the old compounding ×1.18). Campaign bosses carry e._phaseCfg (set at spawn by
  // main.js) with an authored turnMul per phase; endless/boss-rush/rivals have no _phaseCfg and
  // keep the byte-identical ×1.18 ramp below.
  if (e._baseTurnRate === undefined) e._baseTurnRate = e.turnRate;
  if (e._phaseCfg) bossApplyPhaseCfg(e, ph);            // data-driven: turnMul + stash fire/pattern/flags for entities.js + main.js
  else e.turnRate *= 1.18;                              // legacy: each phase is a little twitchier
  empFlash = Math.max(empFlash, ph >= 3 ? 0.6 : 0.45);  // afterburner-ignition screen flash
  if (e.group.userData.body) e.group.userData.body.emissiveIntensity = ph >= 3 ? 2.4 : 1.8;
  if (e.group.userData.core) e.group.userData.core.material.emissiveIntensity = ph >= 3 ? 5.5 : 3.5;
  if (ph >= 3) for (let i = 0; i < 6; i++) spawnSmoke(e.group.position, 0xff5a8a, 2.2);   // armor shed
  showBanner(t(ph >= 3 ? 'banner.bossPhase3' : 'banner.bossPhase2'));
  audio.power(); audio.warn();
  haptic([40, 30, 60]);
  if (typeof shakeCam === 'function') shakeCam(ph >= 3 ? 1.0 : 0.8);   // shakeCam may not be merged yet
}
// Campaign bosses only: apply phase descriptor `e._phaseCfg[ph-1]` = {turnMul, fireMul, extraMissiles,
// weather?, tod?, pattern?, flags?}. turnRate is set RELATIVE to the captured base so phases compose;
// fireMul/extraMissiles are STASHED on the enemy for main.js (updateBossSpecials/fireBossAttack) to read —
// this file does NOT fire boss weapons. pattern/flags are read by entities.js updateEnemy movement AI.
// weather/tod (if present) shift the arena via the existing engine hooks (guarded like shakeCam above).
function bossApplyPhaseCfg(e, ph) {
  const cfg = e._phaseCfg[ph - 1];
  if (!cfg) return;
  if (e._baseTurnRate === undefined) e._baseTurnRate = e.turnRate;
  e.turnRate = e._baseTurnRate * (cfg.turnMul != null ? cfg.turnMul : 1);
  e._fireMul = cfg.fireMul != null ? cfg.fireMul : 1;       // consumed by main.js fire-cadence wiring
  e._extraMissiles = cfg.extraMissiles || 0;                // consumed by main.js extra-salvo wiring
  e._pattern = cfg.pattern || null;                         // movement pattern (entities.js)
  e._flags = cfg.flags || [];                               // behavior flags e.g. 'chaff','mirror' (entities.js)
  e._cfgInit = true;                                        // entities.js: phase cfg now applied for this phase
  if (cfg.weather && typeof applyWeather === 'function') applyWeather(cfg.weather);   // e.g. WARLORD p2 -> storm
  if (cfg.tod != null && typeof applyTimeOfDay === 'function') applyTimeOfDay(cfg.tod);
}
function tpBaseFor(e) {
  return e.type === 'boss' ? TP.boss : e.type === 'bomber' ? TP.bomber : e.elite ? TP.ace
       : e.type === 'ground' ? TP.ground : e.type === 'drone' ? TP.drone : TP.fighter;
}
function killEnemy(e, byPlayer, byCCA) {
  if (byPlayer === undefined) byPlayer = true;
  missionKill(mission, e);   // credit objective progress (intercept targets, etc.) before the entity is torn down
  if (byPlayer && typeof onStealthKill === 'function' && mission && mission.type === 'stealth') onStealthKill(e);   // v1.3: a kill blows cover → aggro + reinforcements
  e.alive = false; explode(e.group.position, e.type === 'boss' || e.type === 'bomber');
  if (byPlayer) { haptic(e.type === 'boss' || e.type === 'bomber' ? [30, 30, 30] : 20); shakeCam(e.type === 'boss' || e.type === 'bomber' ? 0.42 : 0.25); audio.killSfx(); if (typeof killFlash !== 'undefined') killFlash = (e.type === 'boss' || e.type === 'bomber') ? 0.5 : 0.28; }   // killFlash = VISUAL-ONLY kill-confirm timer (hud.js); shake bumped for big targets only
  let pts = e.type === 'boss' ? 6000 : e.type === 'bomber' ? 3000 : e.elite ? 2500 : e.type === 'ground' ? 450 : e.type === 'drone' ? 250 : 1000;
  // === F5 killstreak === extend the chain (window/tiers in core.js streakStep); the resulting mult scales THIS kill's score below.
  player.streak = streakStep(player.streak, 'kill', performance.now() / 1000);
  // === end F5 ===
  // Pure kill-reward (core.js awardKill): kill score (combo-scaled) + RP by source + killstreak.
  const kr = awardKill(
    { combo: player.combo, killStreak: player.killStreak },
    { pts: pts, scoreMul: player.scoreMul || 1, byPlayer: byPlayer, byCCA: byCCA,
      tpBase: tpBaseFor(e), rpPerKill: player.rpPerKill || 0, rpMul: player.rpMul || 1,
      assistFrac: TP.assistFrac, playerDmg: e.playerDmg || 0 }
  );
  player.score += Math.round(kr.score * player.streak.mult); player.tp += kr.rp;   // F5: kill-streak multiplier scales the kill's score contribution
  if (player.streak.tierUp) { showBanner(tf('banner.streak', { mult: player.streak.mult })); haptic([30, 40, 30]); }   // F5: banner + haptic once per tier crossing (x1.5 / x2 / x3)
  if (byPlayer) { if (e._lastPlayerWp === 'gun') run.pGunKills++; }
  else if (byCCA) { run.escortKills++; }
  // field-upgrade payoffs
  const shieldCap = player.maxShield + (player.overshieldCap || 0);          // JUGGERNAUT lets shields bank past their normal ceiling
  if (player.lifesteal) {
    const room = player.maxHp - player.hp;
    player.hp = Math.min(player.maxHp, player.hp + player.lifesteal);
    if (player.vampShield && player.lifesteal > room) player.shield = Math.min(shieldCap, player.shield + (player.lifesteal - room) * player.vampShield);  // overheal bleeds into overshield
  }
  if (player.shieldOnKill) player.shield = Math.min(shieldCap, player.shield + player.shieldOnKill);
  if (player.gunScavenge) player.bullets = Math.min(player.maxBullets, player.bullets + player.gunScavenge);   // BRASS SCAVENGER
  if (byPlayer && player.slowOnKill) player.slow = Math.max(player.slow, player.slowOnKill);                   // KILL CLOCK — a beat of bullet-time
  if (player.mslRefund && Math.random() < player.mslRefund) player.missiles = Math.min(player.maxMissiles, player.missiles + 1);
  if (player.chainDmg && !chaining) { chaining = true; chainBlast(e.group.position); if (player.chainProp) chainBlast(e.group.position); chaining = false; }  // CHAIN REACTION: a kill cooks off into its neighbours
  if (byPlayer && player.empKill) {   // EMP SUBMUNITIONS — the kill bursts a stunning shock over nearby foes
    spawnShockwave(e.group.position.clone());
    const er2 = player.empKill * player.empKill;
    for (let i = 0; i < enemies.length; i++) { const o = enemies[i]; if (!o.alive || o === e) continue; if (e.group.position.distanceToSquared(o.group.position) < er2) o.stun = Math.max(o.stun || 0, 2.0); }
    empFlash = Math.max(empFlash, 0.3);
  }
  if (player.burnSpread && e.burnT > 0) {   // INFERNO CASCADE — a burning death splashes fire onto neighbours
    const br2 = 240 * 240;
    for (let i = 0; i < enemies.length; i++) { const o = enemies[i]; if (!o.alive || o === e) continue; if (e.group.position.distanceToSquared(o.group.position) < br2) { o.burnT = player.burnTime; o.burnDps = player.burnDps; } }
  }
  if (byPlayer && player.frenzyOnKill) player.frenzy = Math.min(player.frenzyMax, player.frenzy + player.frenzyOnKill);   // KILL FRENZY stacks up
  if (e.type === 'boss') { run.boss++; showBanner(t('banner.bossDestroyed')); empFlash = 0.5; }
  if (e.rival) { const pay = rivalDefeated(wave); player.tp += pay; showBanner(tf('banner.rivalDown', { rp: pay })); run.kills++; }
  else if (e.type === 'ground') {
    run.ground++;
    if (strikeSiteResolves(strikeWaveActive, mission ? mission.type : null)) {
      if (e.gkind === 'radar') showBanner(t('banner.radarDown'));
      if (!enemies.some(o => o.alive && o.type === 'ground' && !o.escortUnit && !o.defendAsset)) {   // last site element down → payout
        const pay = Math.round((60 + wave * 6) * (player.rpMul || 1));
        player.tp += pay; player.score += Math.round(1500 * (player.scoreMul || 1));
        showBanner(tf('banner.siteFlattened', { rp: pay })); audio.power(); empFlash = Math.max(empFlash, 0.4);
        missionSiteDown();   // strike mission: the fortified site is down → objective met
      }
    }
  }
  else if (e.type === 'bomber') { run.kills++; showBanner(t('banner.bomberDown')); }
  else run.kills++;
  if (e.type === 'drone') { if (Math.random() < 0.12) spawnLoot(e.group.position); }
  else if (e.type !== 'fighter' || e.elite || Math.random() < 0.5) spawnLoot(e.group.position);
  despawnEnemy(e);
  clearLocks(e);

  player.killStreak = kr.killStreak;             // killstreak count from awardKill (core.js)
  if (kr.streakReward) killStreakReward();        // interval boundary → fire the streak bonus
}
function killStreakReward() {
  const n = player.killStreak;
  const label = t('ks.' + n) !== 'ks.' + n ? t('ks.' + n) : t('ks.5');
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
// nearest LIVE non-boss enemy in any direction (AWACS orbital strike targets it; bosses are immune).
function nearestNonBossEnemy() {
  let best = null, bd = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive || e.type === 'boss') continue;
    const d = t4.copy(e.group.position).sub(player.group.position).length();
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/* ---------------- AWACS support calls (F10/F11/F12) ---------------- */
// Cooldown-gated, capped-per-sector radio call (balance pass 2026-06: NO LONGER costs RP — calls used
// to draw from player.tp, the same pool as the permanent TECH_TREE, so they were never rational vs. a
// compounding upgrade and the feature was dead. Now they're free but gated by a per-call cooldown +
// the unchanged per-sector use cap). The allow/effect/banner decision is the pure awacsResolve()
// (core.js, tested in tests/awacs.test.js + tests/awacs-adapter.test.js); this glue applies the effect.
function awacsAction(key) {
  if (!player) return false;
  const now = performance.now() / 1000;   // seconds clock for the cooldown gate
  // Pure decision (core.js awacsResolve): cooldown + per-sector cap + which effect + which banner.
  const res = awacsResolve({ uses: awacsUses, last: awacsLast }, AWACS_COOLDOWNS, AWACS_USES_MAX, key, now);
  if (!res.ok) {
    if (res.banner) { showBanner(t(res.banner)); audio.warn(); }   // cooldown / empty
    else audio.ui();                                               // unknown key — neutral blip
    return false;
  }
  awacsUses = res.uses; awacsLast = res.last;   // commit the use spend + cooldown stamp
  // imperative application of the resolved effect (game-state mutation only; decision already made)
  if (res.effect === 'strike') {
    const tgt = nearestNonBossEnemy();
    if (tgt) { explode(tgt.group.position, true); killEnemy(tgt, true); }
    empFlash = Math.max(empFlash, 0.45);
  } else if (res.effect === 'resupply') {
    player.bullets = player.maxBullets;
    player.flares = player.maxFlares;
    player.missiles = player.maxMissiles;
  } else if (res.effect === 'jam') {
    player.jammer = Math.max(player.jammer, AWACS_JAM_TIME);   // reuse the SPECTRA jam pathway (updateMissiles blinds enemy missiles while jammer>0)
  }
  showBanner(t(res.banner)); audio.power();
  return true;
}
function cycleLock() {
  const fwd = fwdOf(player.group, t3);
  const cand = [];
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive) continue;
    if (e._ghostT > 0) continue;   // GHOST special: rival cannot be cycled to while cloaked
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
  if (tgt._ghostT > 0) { player.lockTarget = null; player.lockProgress = 0; player.lockedTarget = null; return; }   // GHOST: drop lock while cloaked
  const fwd = fwdOf(player.group, t3);
  const to = t4.copy(tgt.group.position).sub(player.group.position);
  const dist = to.length(); to.multiplyScalar(1 / Math.max(dist, 0.001));
  const aligned = fwd.dot(to);
  const acquiring = aligned > 0.92 && dist < 5200 * (weather.lockRangeMul || 1) && !tgt.isInCloud;   // weather cuts lock acquisition range
  // PURE progress/promote math lives in core.js (advanceLock); THREE geometry (aligned/dist) stays here.
  const adv = advanceLock(
    { progress: player.lockProgress, target: player.lockedTarget },
    { acquiring: acquiring,
      dt: dt,
      rate: LOCK_TIME * (player.lockSpeedMul || 1) * (weather.lockSpeedMul || 1),   // weather slows lock-on
      decayRate: LOCK_TIME * 0.5 }
  );
  player.lockProgress = adv.progress;
  if (acquiring) {
    player._lockT -= dt;
    if (player._lockT <= 0) { audio.blip(820 + player.lockProgress * 700, 0.04, 'square', 0.05); player._lockT = lerp(0.34, 0.07, player.lockProgress); }
    if (adv.justLocked) { player.lockedTarget = tgt; audio.lockTone(); haptic([18, 40, 18]); player.lockFlash = 0.42; }   // lockFlash = VISUAL-ONLY snap timer for hud.js (no balance/timing impact)
  } else {
    if (!adv.locked) player.lockedTarget = null;
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

// useSpecial(slot): slot 1 (default) = the NATIVE jet special (KeyR / tb-spc — behaviour unchanged);
// slot 2 = the equipped secondary special (KeyB / tb-spc2). Each slot owns its own cooldown state
// (player.special / player.special2); both fire the SAME id-keyed effect via applySpecialEffect, so an
// effect is fully portable — it works no matter which airframe is currently flown.
function useSpecial(slot) {
  const st = (slot === 2) ? player.special2 : player.special;
  if (!st || !st.id) { audio.ui(); return; }          // empty slot (FT-1 native, or nothing equipped) is inert
  if (st.cd > 0) { audio.ui(); return; }
  st.cd = st.max; audio.power();
  applySpecialEffect(st.id);
}

// applySpecialEffect(id): fires a special's EFFECT keyed purely on the ability/jet id, INDEPENDENT of
// player.jet — this is what lets slot 2 run another jet's ability. (Was the inline switch body of the
// old useSpecial; the per-slot cooldown gate moved up into useSpecial.)
function applySpecialEffect(id) {
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
    player.stealthField = 7; showBanner(t('banner.cloakAmbush'));

  } else if (id === 'EFT') {
    // MISSILE SALVO — 6 hard-homing missiles, +40% damage, spread across the nearest threats
    // SWARM RACK / HYDRA multiply the barrage just like a normal launch (x2 / x3)
    const count = 6 * (1 + (player.mslSwarm || 0));
    const tg = enemies.filter(e => e.alive).sort((a, b) => pp.distanceToSquared(a.group.position) - pp.distanceToSquared(b.group.position));
    for (let k = 0; k < count; k++) {
      const target = tg[k % Math.max(1, tg.length)] || player.lockedTarget;
      const dir = fwdOf(player.group, new THREE.Vector3()).applyAxisAngle(UPV, rand(-0.4, 0.4)); dir.y += rand(-0.1, 0.18); dir.normalize();
      const m = spawnMissile(pp, dir, target, false, 1.4 * player.missileDmgMul); if (m && target) m.hardHome = true;
    }
    showBanner('MISSILE SALVO'); audio.missile(); run.missiles += count;

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
    // SWARM RACK / HYDRA multiply the storm just like a normal launch (x2 / x3)
    const stormCount = 10 * (1 + (player.mslSwarm || 0));
    const tg = enemies.filter(e => e.alive).sort((a, b) => pp.distanceToSquared(a.group.position) - pp.distanceToSquared(b.group.position));
    let fired = 0;
    for (let k = 0; k < stormCount; k++) {
      const target = tg[k % Math.max(1, tg.length)] || player.lockedTarget;
      const dir = fwdOf(player.group, new THREE.Vector3()).applyAxisAngle(UPV, rand(-0.55, 0.55)); dir.y += rand(-0.12, 0.22); dir.normalize();
      const m = spawnMissile(pp, dir, target, false, 1.55 * player.missileDmgMul); if (m) { if (target) m.hardHome = true; fired++; }
    }
    player.shield = Math.max(player.shield, player.maxShield) + 90; player.shieldT = 6;   // ablative over-shield
    empFlash = 0.4; showBanner('ORDNANCE STORM'); audio.missile(); run.missiles += fired;

  } else if (id === 'F-47') {
    // CCA SWARM — launch vivid electric-blue drones far ahead where you can see them
    // SWARM RACK / HYDRA scale the swarm just like a missile salvo (3 / 6 / 9), extra ranks fanned out so they stay visible
    const fwd = fwdOf(player.group, new THREE.Vector3()), right = rightOf(player.group, new THREE.Vector3());
    const pp = player.group.position;
    const mult = 1 + (player.mslSwarm || 0);
    const base = [                                // staggered fan per rank: centre + left + right
      { ahead: 320, lateral:   0, vert: 10 },
      { ahead: 240, lateral:-185, vert: 30 },
      { ahead: 240, lateral: 185, vert: 30 },
    ];
    let launched = 0;
    for (let r = 0; r < mult; r++) {
      const spread = (r - (mult - 1) / 2) * 95;   // fan extra ranks left/right of centre so they don't overlap
      for (let k = 0; k < base.length; k++) {
        const o = base[k];
        const pt = pp.clone()
          .addScaledVector(fwd, o.ahead - r * 45)
          .addScaledVector(right, o.lateral + spread)
          .addScaledVector(UPV, o.vert + r * 6);
        if (spawnCCA(pt)) launched++;
      }
    }
    spawnShockwave(pp.clone());
    explode(pp.clone(), false);
    empFlash = Math.max(empFlash, 0.5);
    audio.power();
    showBanner(tf('banner.ccaSwarm', { n: launched }));

  } else if (id === 'NGAD') {
    // DEW LANCE — sustained directed-energy beam (damage handled in updatePlayer)
    player.dewLance = 3; empFlash = 0.3; showBanner(t('banner.dewLance')); audio.power();

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
  if (barrelRollCooldown > 0) barrelRollCooldown -= dt;
  if (barrelRollAnim > 0) barrelRollAnim -= dt;
  if (player.jammer > 0) player.jammer -= dt;
  if (player.slow > 0) player.slow -= dt;
  if (player.dewLance > 0) player.dewLance -= dt;
  if (player.vectorSurge > 0) player.vectorSurge -= dt;
  if (player.frenzy > 0) player.frenzy = Math.max(0, player.frenzy - dt);   // KILL FRENZY bleeds off when you stop scoring
  if (player.special.cd > 0) player.special.cd -= dt;
  if (player.special2 && player.special2.cd > 0) player.special2.cd -= dt;   // SLOT 2 recharge (feature #3)
  if (player.damageFlash > 0) player.damageFlash -= dt;
  if (player.lockFlash > 0) player.lockFlash -= dt;   // VISUAL-ONLY lock-snap overshoot timer (hud.js drawLockReticle)
  if (player.muzzleT > 0) { player.muzzleT -= dt; if (player.muzzleT <= 0 && player.group.userData.muzzle) player.group.userData.muzzle.visible = false; }
  if (player.firingT > 0) player.firingT -= dt;   // decays the stealth "firing" tell set in fireGun/fireMissile
  if (player.shake > 0) player.shake -= dt;
  if (player.comboTimer > 0) { player.comboTimer -= dt; if (player.comboTimer <= 0) player.combo = 0; }
  if (player.shieldT > 0) player.shieldT -= dt;
  else if (player.shield < player.maxShield) player.shield = Math.min(player.maxShield, player.shield + 16 * (player.shieldRegenMul || 1) * dt);

  // Unified flight input: digital keyboard (here) + analog flightInput (touch/motion, via readFlightInput).
  let pitchIn = 0, rollIn = 0, yawIn = 0;
  if (down('KeyW')) pitchIn -= 1;
  if (down('KeyS')) pitchIn += 1;
  if (down('KeyQ')) rollIn += 1;
  if (down('KeyE')) rollIn -= 1;
  if (down('KeyA')) yawIn += 1;
  if (down('KeyD')) yawIn -= 1;
  if (invertY) pitchIn = -pitchIn;   // KEYBOARD invert = pitch only (laptop). Touch invert flips the whole stick (controls.js).

  // add the shaped analog source on top so a plugged-in key always works alongside it, then clamp.
  // flightInput uses point-to-fly signs (+pitch=climb, +roll=bank right); convert to engine signs here.
  // controlScheme reinterprets the seam: 'rate' = today's mapping (rollCmd = roll intent); 'pointer' = bank-hold + auto-level.
  // currentBank = atan2(-right.y, up.y): SAME sign frame as roll intent (+roll bank-right reads positive) -> stable feedback.
  const _rgt = rightOf(player.group, t1), _up = upOf(player.group, t2);
  const currentBank = Math.atan2(-_rgt.y, _up.y);
  const cmd = steerCommand(controlScheme, flightInput, currentBank, STEER);
  pitchIn = clamp(pitchIn - cmd.pitchCmd, -1, 1);   // +pitchCmd (climb) -> -pitchIn (nose up, = W)
  rollIn = clamp(rollIn - cmd.rollCmd, -1, 1);      // +rollCmd (bank right / bank-hold) -> -rollIn (= E)

  // Barrel-roll evasive maneuver: consume the request flag set by controls/main keydown
  if (barrelRollRequest) {
    barrelRollRequest = false;
    barrelRollDir = (rollIn !== 0) ? Math.sign(rollIn) : 1;   // capture roll intent at trigger
    barrelRollAnim = BARREL_ROLL_DURATION;
    barrelRollCooldown = BARREL_ROLL_COOLDOWN;
    // capture the orientation at trigger; the roll is anchored to it so a full 360° returns EXACTLY here
    if (!player._brQuat0) player._brQuat0 = player.group.quaternion.clone();
    else player._brQuat0.copy(player.group.quaternion);
    player.invuln = Math.max(player.invuln, BARREL_ROLL_INVULN);
    haptic(80);
    if (typeof showBanner === 'function') showBanner(t('banner.evade'), 1.2);
  }

  const brake = down('ControlLeft') || down('ControlRight') || touchBtns.brk;
  const thr = down('ShiftLeft') || down('ShiftRight') || touchBtns.thr;
  player.highG = brake && (down('KeyS') || (isTouchEnabled && flightInput.pitch < -0.5));

  const tb = st.turnRate * controlSensitivity * (player.turnMul || 1) * (player.vectorSurge > 0 ? 1.85 : 1);   // sensitivity + PROPULSION agility + VECTOR SURGE supermaneuver
  const tgtPitch = pitchIn * tb * (player.highG ? 2.0 : 1.0);
  const tgtRoll = rollIn * tb * 1.6;
  const tgtYaw = yawIn * tb * 0.5;
  player.pitchRate = damp(player.pitchRate, tgtPitch, player.vectorSurge > 0 ? 6.5 : 4.5, dt);
  player.rollRate = damp(player.rollRate, tgtRoll, 5.5, dt);
  player.yawRate = damp(player.yawRate, tgtYaw, 4.5, dt);

  // ANALOG DIRECTIONAL MODE: when a joystick / mouse-flight / motion source is driving, the jet flies
  // TOWARD the stick in screen space and auto-levels. Pitch is referenced to the WORLD horizon and the
  // turn is a WORLD-up yaw, so steering is identical regardless of bank/inversion (never flips upside-down).
  const _motionDriving = (typeof mobileControl !== 'undefined' && mobileControl === 'motion' && typeof motionInput !== 'undefined' && motionInput && motionInput.ready);
  const _mouseDriving  = (typeof mouseFlight !== 'undefined' && mouseFlight);
  const _touchDriving  = (typeof isTouchEnabled !== 'undefined' && isTouchEnabled && !(typeof mobileControl !== 'undefined' && mobileControl === 'motion'));
  const directional = _motionDriving || _mouseDriving || _touchDriving;

  if (barrelRollAnim > 0) {
    // Barrel roll: a PURE body-Z roll ANCHORED to the orientation captured at trigger (player._brQuat0).
    // Drive it by progress so the rotation is exactly barrelRollDir·2π·prog — at prog=1 that's a full turn
    // back to the start, so heading AND pitch are UNCHANGED when it completes. The pitch/yaw integrate AND
    // the auto-scheme heading yaw are both frozen for the duration, so nothing can drift the final facing.
    player.rollRate = barrelRollDir * (TWO_PI / BARREL_ROLL_DURATION);   // tells (wingtip vapor, HUD) still read rollRate
    player.invuln = Math.max(player.invuln, barrelRollAnim);   // keep i-frames topped up to the remaining roll time so projectile immunity spans the WHOLE roll, not just BARREL_ROLL_INVULN
    const prog = clamp(1 - barrelRollAnim / BARREL_ROLL_DURATION, 0, 1);
    player.group.quaternion.copy(player._brQuat0).multiply(q1.setFromAxisAngle(ZAX, barrelRollDir * prog * TWO_PI));
    player._brEnding = true;
  } else {
    if (player._brEnding && player._brQuat0) {   // roll just finished: pin EXACTLY back to the captured orientation
      player.group.quaternion.copy(player._brQuat0);
      player._brEnding = false;
      player.rollRate = player.pitchRate = player.yawRate = 0;   // zero rates so this frame's integrate is identity (no drift)
      player._brSettle = true;   // skip auto-yaw THIS frame: currentBank (read at the top of updatePlayer) is still the
                                 // stale mid-roll bank, and feeding it to the coordinated-turn yaw would nudge heading
    }
    if (directional && !player._brSettle) {
      // World-relative "fly toward the stick" + auto-level. stick in point-to-fly signs: +sx = steer right,
      // +sy = climb (flightInput.pitch is negative-for-climb, so negate). Keyboard still folds in on top.
      let sx = flightInput.roll, sy = -flightInput.pitch;
      if (down('KeyW')) sy += 1; if (down('KeyS')) sy -= 1;
      if (down('KeyD')) sx += 1; if (down('KeyA')) sx -= 1;
      sx = clamp(sx, -1, 1); sy = clamp(sy, -1, 1);
      player.yawRate   = damp(player.yawRate,   sx * tb * 1.15, 6.0, dt);   // heading-turn magnitude
      player.pitchRate = damp(player.pitchRate, sy * tb * 1.00, 5.5, dt);   // climb/dive magnitude
      const fwd = fwdOf(player.group, t3);
      const hr  = t4.copy(fwd).cross(UPV);                  // world-horizontal axis ⟂ heading → bank-independent pitch
      if (hr.lengthSq() < 1e-5) hr.copy(rightOf(player.group, t4));   // near-vertical: fall back to body right
      hr.normalize();
      player.group.quaternion.premultiply(q1.setFromAxisAngle(hr, player.pitchRate * dt));   // pitch toward world up/down (no inversion)
      player.group.quaternion.premultiply(q2.setFromAxisAngle(UPV, -player.yawRate * dt));   // turn heading (right stick = right)
      const tgtBank = sx * STEER.autoMaxBank;               // cosmetic bank INTO the turn; 0 when centered → wings auto-level
      const rollStep = clamp((tgtBank - currentBank) * STEER.bankGain, -8, 8) * dt;
      player.group.quaternion.multiply(q1.setFromAxisAngle(ZAX, -rollStep));                 // body roll toward target bank / level
      player.rollRate = -rollStep / Math.max(dt, 1e-4);     // keep the wingtip-vapor / HUD roll tell in sync
    } else if (!directional) {
      eul.set(player.pitchRate * dt, player.yawRate * dt, player.rollRate * dt, 'XYZ');
      q1.setFromEuler(eul);
      player.group.quaternion.multiply(q1);
    }
  }
  // AUTO scheme heading turn: a WORLD-axis yaw proportional to the current bank. Applied here (not in steerCommand)
  // and about the WORLD up axis so it's DECOUPLED from pitch — you can dive/climb while turning (diagonals work).
  // sign: bank right (currentBank>0) -> negative world yaw -> nose right. Scaled by tb so it tracks airframe agility.
  // Gated OFF during a barrel roll: otherwise the 360° bank sweep feeds this term a net heading yaw (drift).
  if (controlScheme === 'auto' && !directional && barrelRollAnim <= 0 && !player._brSettle) {
    const autoYaw = -STEER.autoYawGain * Math.sin(currentBank) * tb * dt;
    if (autoYaw) player.group.quaternion.premultiply(q2.setFromAxisAngle(UPV, autoYaw));
  }
  player._brSettle = false;   // one-frame settle guard consumed; next frame reads a fresh (level) currentBank

  // AIM ASSIST — gently steer the nose toward the gun lead pip of the nearest forward target (the SAME
  // interceptPoint drawGunPipper draws). Optional, ON by default. A bounded world-axis nudge: it only acts
  // inside a forward cone within gun range, eases out with distance, is rate-capped (never a hard snap), and
  // yields entirely during a barrel roll — player input always dominates. Mirrors the autoYaw premultiply above.
  if (aimAssist && !player.noCannon && barrelRollAnim <= 0 && typeof pickGunTarget === 'function') {
    const at = pickGunTarget();
    if (at && at.alive) {
      // strongest tier "forces" toward the lead UNLESS the player is actively orienting elsewhere
      const manualAim = down('KeyW') || down('KeyS') || down('KeyQ') || down('KeyE') || down('KeyA') || down('KeyD') || Math.hypot(flightInput.pitch || 0, flightInput.roll || 0) > 0.12;
      const cfg = aimAssistCfg(aimStrength, manualAim);
      const pp = player.group.position;
      const relV = aimT1.copy(at.vel || ZERO).addScaledVector(player.vel, -0.9);   // rounds inherit 0.9 of jet vel
      const ip = interceptPoint(pp, at.group.position, relV, 1400 * (player.bulletSpeedMul || 1));
      if (ip) {
        const desired = aimT2.copy(ip).sub(pp);
        const dist = desired.length();
        if (dist > 1) {
          desired.multiplyScalar(1 / dist);
          const fwdv = fwdOf(player.group, aimT3);
          const angErr = Math.acos(clamp(fwdv.dot(desired), -1, 1));
          const step = aimAssistStep(angErr, dist, dt, cfg);
          if (step > 0) {
            const axis = aimT1.crossVectors(fwdv, desired);   // aimT1 free now (relV consumed)
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

  // wingtip vortices: condensation streamers whenever the airframe is pulling hard
  if ((player.highG || Math.abs(player.pitchRate) > tb * 0.8) && player.speed > 240) {
    player.vaporT = (player.vaporT || 0) - dt;
    if (player.vaporT <= 0) {
      player.vaporT = 0.022;
      spawnTrail(t4.copy(player.group.position).addScaledVector(rgt, 9), 0xcfe2f2, 0.3);
      spawnTrail(t4.copy(player.group.position).addScaledVector(rgt, -9), 0xcfe2f2, 0.3);
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

  if (down('Space') || touchBtns.gun || mouseFiring) fireGun();
  updateLockOn(dt);

  // ---- DEW LANCE (NGAD): sustained directed-energy beam down the boresight ----
  updateDewLance(dt);
  updatePdBeams(dt);   // fade any point-defense laser bolts

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

  animEngines(player.group, player.throttle);
  player._gpwsT -= dt; if (player.gpws && player._gpwsT <= 0) { audio.warn(); player._gpwsT = 0.5; }
  const incoming = missiles.some(m => m.enemy);
  player._missT -= dt; if (incoming && player._missT <= 0) { audio.blip(900, 0.1, 'square', 0.13); player._missT = 0.55; }
}

/* POINT-DEFENSE LASER visuals — brief additive bolts fired from the airframe (or an escort) to a missile it swats */
const PD_POOL = [];
let pdBeams = [];
function getPdBeam() {
  let b = PD_POOL.pop();
  if (!b) {
    const geo = new THREE.CylinderGeometry(0.7, 0.7, 1, 6, 1, true);
    geo.rotateX(Math.PI / 2); geo.translate(0, 0, -0.5);   // unit length running from origin toward -Z (Object3D.lookAt's forward)
    const mat = new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    b = new THREE.Mesh(geo, mat); scene.add(b);
  }
  b.visible = true; return b;
}
function firePdBeam(from, to, color) {
  const len = from.distanceTo(to); if (len < 1) return;
  const b = getPdBeam();
  b.material.color.setHex(color != null ? color : 0x9ff0ff);
  b.position.copy(from);
  b.lookAt(to);                 // local -Z now points at the missile
  b.scale.set(1, 1, len);
  b.material.opacity = 0.95;
  pdBeams.push({ mesh: b, t: 0.13, max: 0.13 });
  spawnTrail(to, color != null ? color : 0x9ff0ff, 0.9);   // bright hit flash at the intercept point
}
function updatePdBeams(dt) {
  for (let i = pdBeams.length - 1; i >= 0; i--) {
    const p = pdBeams[i]; p.t -= dt;
    const k = clamp(p.t / p.max, 0, 1);
    p.mesh.material.opacity = 0.95 * k;
    p.mesh.scale.x = p.mesh.scale.y = 0.5 + (1 - k) * 1.8;   // bloom outward as it dies
    if (p.t <= 0) { p.mesh.visible = false; PD_POOL.push(p.mesh); pdBeams.splice(i, 1); }
  }
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
