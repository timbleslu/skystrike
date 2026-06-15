/* SKYSTRIKE — ui.js: camera, projection, gunsight, HUD/radar canvas, DOM HUD, tech-tree screen, hangar & game flow. Load 5th. */

/* ---------------- camera ---------------- */
function updateCamera(dt) {
  const p = player.group, fwd = fwdOf(p, t1);
  const trackCam = mouseRight && player.lockedTarget && player.lockedTarget.alive;
  const lookBack = down('KeyV') && !trackCam;        // hold V to glance behind
  const lbChanged = lookBack !== player._lbPrev;     // snap on transitions (don't sweep through the jet)
  player._lbPrev = lookBack;

  if (camMode === 2) {
    // cockpit: hide our own airframe so the forward view is fully unobstructed
    p.visible = false;
    const local = t2.set(0, 1.3, -3.8).applyQuaternion(p.quaternion).add(p.position);
    camera.position.copy(local);
    if (lookBack) {
      camera.lookAt(t3.copy(p.position).addScaledVector(fwd, -60));
    } else if (trackCam) {
      camera.lookAt(player.lockedTarget.group.position);
    } else {
      q1.copy(p.quaternion);
      camera.quaternion.slerp(q1, 1 - Math.exp(-24 * dt));
    }
  } else {
    // chase / close: airframe visible
    p.visible = true;
    const off = camMode === 0 ? t2.set(0, 7.5, 27) : t2.set(0, 4.6, 15);
    if (lookBack) { off.z = -off.z * 0.82; off.y *= 0.8; }  // swing to the front, looking aft
    const desired = off.applyQuaternion(p.quaternion).add(p.position);
    const gh = terrainH(desired.x, desired.z) + 8; if (desired.y < gh) desired.y = gh;
    let look;
    if (trackCam) look = t3.copy(player.lockedTarget.group.position);
    else if (lookBack) look = t3.copy(p.position).addScaledVector(fwd, -90);
    else look = t3.copy(p.position).addScaledVector(fwd, 90);
    if (lookBack || lbChanged) {
      camera.position.copy(desired);
      if (!player._look) player._look = look.clone(); else player._look.copy(look);
    } else {
      camera.position.lerp(desired, 1 - Math.exp(-9 * dt));
      if (!player._look) player._look = look.clone();
      player._look.lerp(look, 1 - Math.exp(-13 * dt));
    }
    camera.lookAt(player._look);
  }
  if (player.shake > 0) {
    camera.position.x += rand(-1, 1) * player.shake * 3;
    camera.position.y += rand(-1, 1) * player.shake * 3;
    camera.position.z += rand(-1, 1) * player.shake * 2;
  }
  if (camShake > 0) {
    camera.position.x += rand(-1, 1) * camShake * CAMSHAKE_K;
    camera.position.y += rand(-1, 1) * camShake * CAMSHAKE_K;
    camShake = decayShake(camShake, dt);
  }
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
}
function cycleCamera() { camMode = (camMode + 1) % 3; audio.ui(); showBanner(tf('banner.cam', { name: t('cam.' + CAM_NAMES[camMode]) })); }

/* ---------------- projection helper ---------------- */
function projectPoint(pos) {
  pp1.copy(pos).project(camera);
  pp2.copy(pos).sub(camera.position);
  pp3.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const behind = pp2.dot(pp3) < 0;
  return { x: (pp1.x * 0.5 + 0.5) * W, y: (-pp1.y * 0.5 + 0.5) * H, behind };
}

/* ---------------- lead-computing gunsight (deflection pipper) ----------------
   Picks the most plausible cannon target (near & well inside the forward cone),
   solves the firing intercept at true round speed, and paints a pipper showing
   exactly where to put the nose. Snaps green ("GUNS") when a gun solution exists. */
function pickGunTarget() {
  const fwd = fwdOf(player.group, t3), pp = player.group.position;
  let best = null, bestScore = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive) continue;
    const to = t4.copy(e.group.position).sub(pp);
    const dist = to.length();
    if (dist < 1 || dist > 2600) continue;
    const ang = fwd.dot(to) / dist;          // cos of angle off boresight
    if (ang < 0.5) continue;                 // ~60-degree forward cone
    const score = dist * (1.7 - ang);        // favour near & well-aligned contacts
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}
function drawGunPipper(ctx, e) {
  if (!e) { player._gunSol = false; return; }
  const k = hudK();
  const pp = player.group.position;
  const S = 1400 * (player.bulletSpeedMul || 1);
  // rounds inherit 0.9 of the jet's velocity, so solve in that relative frame
  const relV = t1.copy(e.vel || ZERO).addScaledVector(player.vel, -0.9);
  const ip = interceptPoint(pp, e.group.position, relV, S) || e.group.position;
  const sp = projectPoint(ip);
  const dist = pp.distanceTo(e.group.position);
  if (sp.behind) { player._gunSol = false; return; }

  const fwd = fwdOf(player.group, t2);
  const bsp = projectPoint(t3.copy(pp).addScaledVector(fwd, dist));   // boresight at target range
  const tgtR = e.type === 'boss' ? 72 : e.type === 'ground' ? 17 : e.type === 'drone' ? 16 : 22;
  const edge = projectPoint(t4.copy(ip).addScaledVector(rightOf(player.group, t5), tgtR));
  const screenR = Math.max(8, Math.hypot(edge.x - sp.x, edge.y - sp.y));
  const sep = bsp.behind ? 1e9 : Math.hypot(sp.x - bsp.x, sp.y - bsp.y);
  const solution = sep < screenR * 1.15 && dist < 2300;

  // correction line from boresight to the lead point
  if (!bsp.behind && sep > 5) {
    ctx.strokeStyle = 'rgba(120,255,220,0.25)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(bsp.x, bsp.y); ctx.lineTo(sp.x, sp.y); ctx.stroke();
  }

  const col = solution ? '90,255,150' : '255,210,80';
  ctx.save(); ctx.translate(sp.x, sp.y); ctx.scale(k, k); ctx.translate(-sp.x, -sp.y);   // UI-size: gun pipper scales around the lead point
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(' + col + ',0.95)';
  ctx.beginPath(); ctx.arc(sp.x, sp.y, 7, 0, TWO_PI); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sp.x - 7, sp.y); ctx.lineTo(sp.x - 12, sp.y);
  ctx.moveTo(sp.x + 7, sp.y); ctx.lineTo(sp.x + 12, sp.y);
  ctx.moveTo(sp.x, sp.y - 7); ctx.lineTo(sp.x, sp.y - 12);
  ctx.moveTo(sp.x, sp.y + 7); ctx.lineTo(sp.x, sp.y + 12);
  ctx.stroke();
  ctx.fillStyle = 'rgba(' + col + ',' + (solution ? 0.95 : 0.55) + ')';
  ctx.beginPath(); ctx.arc(sp.x, sp.y, solution ? 3 : 2, 0, TWO_PI); ctx.fill();

  ctx.font = '9px ' + HUDFONT; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(' + col + ',0.8)';
  ctx.fillText(Math.round(dist), sp.x, sp.y + 20);
  ctx.restore();

  if (solution) {
    const s = 13 + Math.sin(performance.now() * 0.02) * 2;
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.scale(k, k); ctx.translate(-sp.x, -sp.y);   // UI-size: "guns" diamond scales around lead point
    ctx.strokeStyle = 'rgba(90,255,150,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y - s); ctx.lineTo(sp.x + s, sp.y); ctx.lineTo(sp.x, sp.y + s); ctx.lineTo(sp.x - s, sp.y); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(90,255,150,0.95)'; ctx.fillText(t('hud.guns'), sp.x, sp.y - s - 6);
    ctx.restore();
    // "shoot now" cue ringing the central reticle
    const cx = W / 2, cy = H / 2;
    ctx.strokeStyle = 'rgba(90,255,150,' + (0.45 + 0.3 * Math.sin(performance.now() * 0.02)) + ')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 11 * k, 0, TWO_PI); ctx.stroke();
  }
  if (solution && !player._gunSol) audio.blip(1240, 0.04, 'sine', 0.05, 1560);   // soft tick on acquiring a gun solution
  player._gunSol = solution;
  ctx.lineWidth = 2;
}

/* ---------------- HUD canvas ---------------- */
// Canvas-HUD size multiplier driven by the global hudScale setting (Settings → UI size).
// World-projected x/y positions stay EXACT; only sizes (radii, fonts, line offsets) get ×k.
function hudK() { return (typeof hudScale === 'number') ? Math.max(0.6, Math.min(1.6, hudScale)) : 1; }
function spawnHitMarker() { hitMarkers.push({ t: 0.25 }); }
function spawnDamageNumber(pos, val, crit) { dmgNumbers.push({ pos: pos.clone(), val, life: crit ? 1.1 : 0.9, crit: !!crit }); }

// Small secondary-objective (star) checklist on the HUD: three live conditions, each ★ when met.
// Mirrors evalStars' conditions (kill efficiency / no-damage wave / objectives) against the live run.
function drawStarObjectives(ctx, cx) {
  if (typeof run === 'undefined' || !run) return;
  const waves = Math.max(1, wave || 1);
  const killsMet = ((run.kills || 0) + (run.ground || 0) + (run.boss || 0)) / (waves * 4) >= 0.6;
  const cleanMet = (run.cleanWaves || 0) >= 1;
  const rescMet = (run.missions || 0) >= 1;
  const items = [
    [killsMet, t('stars.obj.kills')],
    [cleanMet, t('stars.obj.noDamage')],
    [rescMet, t('stars.obj.rescue')],
  ];
  const k = hudK();
  ctx.save();
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = (11 * k) + 'px ' + HUDFONT;
  let y = 40;
  for (let i = 0; i < items.length; i++) {
    const met = items[i][0], label = (met ? '★ ' : '☆ ') + items[i][1];
    const w = ctx.measureText(label).width;
    ctx.fillStyle = met ? 'rgba(255,210,80,0.95)' : 'rgba(150,170,190,0.7)';
    ctx.fillText(label, cx - w / 2, y);
    y += 15 * k;
  }
  ctx.restore();
}

// Localized active-condition label (incl. night), or '' for plain daylight-clear (nothing to flag).
function weatherLabel() {
  const night = (typeof timeOfDay !== 'undefined') && timeOfDay === 2;
  const wt = (typeof weather !== 'undefined' && weather) ? weather.type : 'clear';
  if (wt === 'clear' && !night) return '';
  let s = wt !== 'clear' ? t('weather.' + wt) : '';
  if (night) s = s ? (s + ' · ' + t('weather.night')) : t('weather.night');
  return s;
}
// HUD weather chip (top-left): names the active condition; storm tints blue-grey, else teal.
function drawWeatherChip(ctx) {
  const label = weatherLabel();
  if (!label) return;
  const storm = (typeof weather !== 'undefined' && weather) ? weather.type === 'storm' : false;
  const k = hudK();
  ctx.save();
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = 'bold ' + (13 * k) + 'px ' + HUDFONT;
  const padX = 9 * k, x = 16, y = 86, h = 23 * k, w = ctx.measureText(label).width + padX * 2;
  ctx.fillStyle = storm ? 'rgba(120,140,200,0.16)' : 'rgba(25,240,212,0.10)';
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 1; ctx.strokeStyle = storm ? 'rgba(150,170,235,0.7)' : 'rgba(25,240,212,0.5)';
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = storm ? 'rgba(205,215,255,0.95)' : 'rgba(150,255,235,0.95)';
  ctx.fillText(label, x + padX, y + 6 * k);
  ctx.restore();
}
function drawHUD() {
  const ctx = h2d, cx = W / 2, cy = H / 2, k = hudK();
  ctx.clearRect(0, 0, W, H);
  ctx.lineWidth = 2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  drawHorizon(ctx, cx, cy);

  // central reticle — scaled around its screen anchor (cx,cy)
  ctx.strokeStyle = 'rgba(120,255,220,0.9)';
  ctx.beginPath(); ctx.arc(cx, cy, 4 * k, 0, TWO_PI);
  ctx.moveTo(cx - 15 * k, cy); ctx.lineTo(cx - 7 * k, cy); ctx.moveTo(cx + 7 * k, cy); ctx.lineTo(cx + 15 * k, cy); ctx.moveTo(cx, cy - 15 * k); ctx.lineTo(cx, cy - 7 * k);
  ctx.stroke();

  const vd = t1.copy(player.vel);
  if (vd.lengthSq() > 1) {
    vd.normalize();
    const fp = projectPoint(t2.copy(player.group.position).addScaledVector(vd, 1600));
    if (!fp.behind) {
      // velocity-vector marker — projected position fixed, size ×k
      ctx.strokeStyle = 'rgba(0,255,170,0.9)';
      ctx.beginPath(); ctx.arc(fp.x, fp.y, 6 * k, 0, TWO_PI);
      ctx.moveTo(fp.x - 6 * k, fp.y); ctx.lineTo(fp.x - 15 * k, fp.y); ctx.moveTo(fp.x + 6 * k, fp.y); ctx.lineTo(fp.x + 15 * k, fp.y); ctx.moveTo(fp.x, fp.y - 6 * k); ctx.lineTo(fp.x, fp.y - 13 * k);
      ctx.stroke();
    }
  }

  // active sector-mission objective readout (top-centre), tinted by urgency / outcome
  if (typeof mission !== 'undefined' && mission && mission.status === 'active') {
    const timed = (mission.type === 'intercept' && mission.timer <= 10);
    ctx.fillStyle = timed ? 'rgba(255,90,60,0.95)' : 'rgba(120,255,220,0.95)';
    ctx.font = 'bold ' + (15 * k) + 'px ' + HUDFONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    let line = objectiveText(mission);
    if (mission.type === 'intercept') line += '   ⏱ ' + fmtClock(Math.max(0, mission.timer));
    ctx.fillText(line, cx, 14);
    ctx.textBaseline = 'middle';
  }

  drawStarObjectives(ctx, cx);   // small secondary-objective (star) checklist, top-centre
  drawWeatherChip(ctx);   // active condition (storm / fog / night) top-left

  // lead-computing gunsight for the nearest forward gun target
  if (gunLead && !player.noCannon) drawGunPipper(ctx, pickGunTarget());
  else player._gunSol = false;

  const lt = (player.lockTarget && player.lockTarget.alive) ? player.lockTarget : null;
  if (lt) {
    drawLockReticle(ctx, lt, player.lockProgress, player.lockedTarget === lt && player.lockProgress >= 1);
  }

  let near = null, nd = Infinity;
  for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (!e.alive) continue; const d = player.group.position.distanceToSquared(e.group.position); if (d < nd) { nd = d; near = e; } }
  for (let i = 0; i < enemies.length; i++) if (enemies[i].alive) drawEnemy(ctx, enemies[i], cx, cy, enemies[i] === near);
  for (let i = 0; i < wingmen.length; i++) if (wingmen[i].alive) drawWingman(ctx, wingmen[i], cx, cy);   // friendly escorts on the main HUD

  // supply-crate markers (diamond + range over any crate in view)
  for (let i = 0; i < loots.length; i++) {
    const l = loots[i]; if (l.kind !== 'crate') continue;
    const sp = projectPoint(l.mesh.position);
    if (sp.behind || sp.x < 0 || sp.x > W || sp.y < 0 || sp.y > H) continue;
    const s = (9 + Math.sin(performance.now() * 0.006) * 2) * k;   // projected pos fixed, size ×k
    ctx.strokeStyle = 'rgba(70,255,200,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y - s); ctx.lineTo(sp.x + s, sp.y); ctx.lineTo(sp.x, sp.y + s); ctx.lineTo(sp.x - s, sp.y); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(70,255,200,0.85)'; ctx.font = (9 * k) + 'px ' + HUDFONT; ctx.textAlign = 'center';
    ctx.fillText(t('hud.supply') + ' ' + Math.round(player.group.position.distanceTo(l.mesh.position)), sp.x, sp.y - s - 7 * k);
  }
  ctx.lineWidth = 2;

  // KILL FRENZY meter — a hot bar that drains while you hold off the trigger
  if (player.frenzyMax && player.frenzy > 0) {
    const f = clamp(player.frenzy / player.frenzyMax, 0, 1);
    const bw = 168 * k, bh = 6 * k, bx = cx - bw / 2, by = H - 96;   // centred bar, scaled around cx
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(255,140,40,0.92)'; ctx.fillRect(bx, by, bw * f, bh);
    ctx.fillStyle = 'rgba(255,185,90,0.95)'; ctx.font = 'bold ' + (11 * k) + 'px ' + HUDFONT; ctx.textAlign = 'center';
    ctx.fillText(t('hud.frenzy') + ' ×' + (1 + 0.3 * f).toFixed(2), cx, by - 7 * k);
  }

  for (let i = hitMarkers.length - 1; i >= 0; i--) {
    const hm = hitMarkers[i]; hm.t -= lastDt; const a = clamp(hm.t / 0.25, 0, 1); const s = (11 + (1 - a) * 9) * k, t7 = 7 * k;
    ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx - s + t7, cy - s + t7);
    ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx + s - t7, cy - s + t7);
    ctx.moveTo(cx - s, cy + s); ctx.lineTo(cx - s + t7, cy + s - t7);
    ctx.moveTo(cx + s, cy + s); ctx.lineTo(cx + s - t7, cy + s - t7);
    ctx.stroke();
    if (hm.t <= 0) hitMarkers.splice(i, 1);
  }
  ctx.lineWidth = 2;

  for (let i = dmgNumbers.length - 1; i >= 0; i--) {
    const d = dmgNumbers[i]; d.life -= lastDt; d.pos.y += (d.crit ? 42 : 30) * lastDt;
    const p = projectPoint(d.pos);
    if (!p.behind) {
      const lifeMax = d.crit ? 1.1 : 0.9, a = clamp(d.life / lifeMax, 0, 1);
      if (d.crit) { ctx.fillStyle = 'rgba(255,150,40,' + a + ')'; ctx.font = 'bold ' + ((22 + (1 - a) * 12) * k) + 'px ' + HUDFONT; }
      else { ctx.fillStyle = 'rgba(255,230,120,' + a + ')'; ctx.font = 'bold ' + ((16 + (1 - a) * 7) * k) + 'px ' + HUDFONT; }
      ctx.fillText(d.val, p.x, p.y);
    }
    if (d.life <= 0) dmgNumbers.splice(i, 1);
  }

  if (player.hurtT > 0 && player.hurtDir) {
    player.hurtT -= lastDt;
    const cr = t1.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const cu = t2.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const cfw = t3.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const dx = player.hurtDir.dot(cr), dy = player.hurtDir.dot(cu), dz = player.hurtDir.dot(cfw);
    let ang2; const mag = Math.hypot(dx, dy);
    if (dz < -0.2 && mag < 0.35) ang2 = Math.PI; else ang2 = Math.atan2(dx, dy);
    const a = clamp(player.hurtT, 0, 1);
    const rr = Math.min(cx, cy) * 0.72;   // edge-ring radius kept (screen-anchored); stroke + arrowhead ×k
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang2);
    ctx.strokeStyle = 'rgba(255,55,55,' + (0.85 * a) + ')'; ctx.lineWidth = 6 * k; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, rr, -Math.PI / 2 - 0.36, -Math.PI / 2 + 0.36); ctx.stroke();
    ctx.fillStyle = 'rgba(255,80,80,' + (0.9 * a) + ')';
    ctx.beginPath(); ctx.moveTo(0, -rr - 7 * k); ctx.lineTo(-9 * k, -rr + 9 * k); ctx.lineTo(9 * k, -rr + 9 * k); ctx.closePath(); ctx.fill();
    ctx.lineCap = 'butt'; ctx.restore();
  }
}

/* Friendly escort marker — an open teal chevron (deliberately unlike the enemies' square brackets) so you
   can always read where your flight is, who they're focusing, and how healthy they are. */
function drawWingman(ctx, w, cx, cy) {
  const pos = w.group.position;
  const p = projectPoint(pos);
  const dist = player.group.position.distanceTo(pos);
  const onScreen = !p.behind && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
  const col = w.cca ? '73,182,255' : '45,255,176';
  if (onScreen) {
    const s = clamp(52000 / Math.max(dist, 1), 11, 28), x = p.x, y = p.y;
    ctx.save(); ctx.translate(x, y); ctx.scale(hudK(), hudK()); ctx.translate(-x, -y);   // UI-size: escort marker scales around its position
    ctx.strokeStyle = 'rgba(' + col + ',0.92)'; ctx.lineWidth = 2;
    ctx.beginPath();                              // upward chevron ∧ centred on the escort
    ctx.moveTo(x - s, y + s * 0.55); ctx.lineTo(x, y - s * 0.7); ctx.lineTo(x + s, y + s * 0.55);
    ctx.stroke();
    ctx.fillStyle = 'rgba(' + col + ',0.6)';
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TWO_PI); ctx.fill();
    const hpFrac = clamp(w.hp / w.maxHp, 0, 1);    // slim health pip above the chevron
    const bw = s * 1.5, bx = x - bw / 2, by = y - s * 0.7 - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = 'rgba(' + col + ',0.9)'; ctx.fillRect(bx, by, bw * hpFrac, 3);
    ctx.fillStyle = 'rgba(' + col + ',0.92)'; ctx.font = '10px ' + HUDFONT; ctx.textAlign = 'center';
    const tag = w.forced ? ' ▸' + t('hud.focus') : (w.defend > 0 ? ' ▸' + t('hud.guard') : '');
    ctx.fillText(w.name + tag, x, y + s * 0.55 + 12);
    ctx.restore();
  } else {
    let ang = p.behind ? Math.atan2(-(p.y - cy), -(p.x - cx)) : Math.atan2(p.y - cy, p.x - cx);
    const rx = W / 2 - 48, ry = H / 2 - 48;
    const ex = cx + Math.cos(ang) * rx, ey = cy + Math.sin(ang) * ry;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(' + col + ',0.85)'; ctx.lineWidth = 2;   // hollow teal arrowhead at the screen edge
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-9, -7); ctx.lineTo(-9, 7); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  ctx.lineWidth = 2;
}

function drawHorizon(ctx, cx, cy) {
  const fwd = fwdOf(player.group, t1), up = upOf(player.group, t2), rgt = rightOf(player.group, t3);
  const pitch = Math.asin(clamp(fwd.y, -1, 1));
  const roll = Math.atan2(rgt.y, up.y);
  const scale = 6.2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(hudK(), hudK());   // UI-size: enlarge the whole pitch ladder uniformly around centre
  ctx.rotate(roll);
  ctx.translate(0, (pitch / DEG) * scale);
  ctx.strokeStyle = 'rgba(0,255,190,0.55)'; ctx.lineWidth = 2; ctx.font = '11px ' + HUDFONT; ctx.fillStyle = 'rgba(0,255,190,0.6)';
  ctx.beginPath(); ctx.moveTo(-260, 0); ctx.lineTo(-70, 0); ctx.moveTo(70, 0); ctx.lineTo(260, 0);
  ctx.moveTo(-70, 0); ctx.lineTo(-70, 9); ctx.moveTo(70, 0); ctx.lineTo(70, 9);
  ctx.stroke();
  ctx.lineWidth = 1.4;
  for (let a = -40; a <= 40; a += 10) {
    if (a === 0) continue;
    const y = -a * scale;
    const w = a > 0 ? 60 : 50;
    ctx.beginPath();
    ctx.moveTo(-w, y); ctx.lineTo(-30, y); ctx.moveTo(30, y); ctx.lineTo(w, y);
    if (a < 0) { ctx.moveTo(-w, y); ctx.lineTo(-w, y - 6); ctx.moveTo(w, y); ctx.lineTo(w, y - 6); }
    else { ctx.moveTo(-w, y); ctx.lineTo(-w, y + 6); ctx.moveTo(w, y); ctx.lineTo(w, y + 6); }
    ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillText((a > 0 ? '+' : '') + a, w + 5, y);
    ctx.textAlign = 'right'; ctx.fillText((a > 0 ? '+' : '') + a, -w - 5, y);
  }
  ctx.restore();
  ctx.textAlign = 'center';
}

function drawLockReticle(ctx, tgt, progress, locked) {
  const p = projectPoint(tgt.group.position);
  if (p.behind) return;
  const dist = player.group.position.distanceTo(tgt.group.position);
  const base = clamp(120000 / Math.max(dist, 1), 34, 150);
  const x = p.x, y = p.y, s = base * 0.45;
  ctx.textAlign = 'center';
  ctx.save(); ctx.translate(x, y); ctx.scale(hudK(), hudK()); ctx.translate(-x, -y);   // UI-size: lock box scales around target, position fixed
  if (locked) {
    ctx.strokeStyle = 'rgba(255,55,55,1)'; ctx.lineWidth = 2.5;
    ctx.strokeRect(x - s, y - s, s * 2, s * 2);
    ctx.lineWidth = 2;
    for (const c of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath(); ctx.moveTo(x + c[0] * s, y + c[1] * s); ctx.lineTo(x + c[0] * (s + 8), y + c[1] * s);
      ctx.moveTo(x + c[0] * s, y + c[1] * s); ctx.lineTo(x + c[0] * s, y + c[1] * (s + 8)); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,55,55,0.95)';
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill();
    const blink = (performance.now() % 600) < 400 ? 1 : 0.35;
    ctx.fillStyle = 'rgba(255,70,70,' + blink + ')'; ctx.font = 'bold 13px ' + HUDFONT;
    ctx.fillText(t('hud.locked'), x, y - s - 11);
  } else if (progress > 0.02) {
    const o = base * (1.35 - progress * 0.9); // brackets converge as progress→1
    const a = 0.5 + progress * 0.5;
    ctx.strokeStyle = 'rgba(255,210,80,' + a + ')'; ctx.lineWidth = 2;
    for (const c of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = x + c[0] * (s + o), py = y + c[1] * (s + o);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - c[0] * 11, py); ctx.moveTo(px, py); ctx.lineTo(px, py - c[1] * 11); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,210,80,0.85)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, base * 0.62, -Math.PI / 2, -Math.PI / 2 + progress * TWO_PI); ctx.stroke();
    ctx.fillStyle = 'rgba(255,210,80,0.95)'; ctx.font = '11px ' + HUDFONT;
    ctx.fillText(t('hud.locking') + ' ' + Math.round(progress * 100) + '%', x, y + base * 0.62 + 14);
  }
  ctx.restore();
}
function drawEnemy(ctx, e, cx, cy, isNear) {
  const pos = e.group.position;
  const p = projectPoint(pos);
  const dist = player.group.position.distanceTo(pos);
  const boss = e.type === 'boss', grd = e.type === 'ground', drone = e.type === 'drone';
  const locked = player.lockedTarget === e;
  const onScreen = !p.behind && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;

  if (drone) {                          // lightweight crimson diamond — swarms stay readable
    if (!onScreen) return;
    const s = clamp(60000 / Math.max(dist, 1), 9, 34), x = p.x, y = p.y;
    ctx.save(); ctx.translate(x, y); ctx.scale(hudK(), hudK()); ctx.translate(-x, -y);   // UI-size: marker scales around target
    ctx.strokeStyle = 'rgba(255,64,96,' + (locked || isNear ? 1 : 0.82) + ')'; ctx.lineWidth = locked ? 2.4 : 1.6;
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,64,96,0.5)'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TWO_PI); ctx.fill();
    ctx.restore(); ctx.lineWidth = 2;
    return;
  }

  const col = boss ? '255,80,220' : e.type === 'bomber' ? '255,176,96' : e.elite ? '255,210,77' : grd ? '255,165,55' : '255,80,80';

  if (onScreen) {
    const size = clamp(90000 / Math.max(dist, 1), 24, 110) * (boss ? 1.7 : 1);
    const s = size / 2, x = p.x, y = p.y, c = Math.max(7, s * 0.32);
    ctx.save(); ctx.translate(x, y); ctx.scale(hudK(), hudK()); ctx.translate(-x, -y);   // UI-size: bracket + label + hp bar scale around target, position fixed
    ctx.strokeStyle = 'rgba(' + col + ',' + (locked || isNear ? 1 : 0.85) + ')';
    ctx.lineWidth = locked ? 3 : isNear ? 2.4 : 1.8;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s + c); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + c, y - s);
    ctx.moveTo(x + s - c, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + c);
    ctx.moveTo(x + s, y + s - c); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - c, y + s);
    ctx.moveTo(x - s + c, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s, y + s - c);
    ctx.stroke();
    const hpFrac = clamp(e.hp / e.maxHp, 0, 1);
    const bw = size, bx = x - s, by = y - s - 7;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx, by, bw, 3);
    ctx.fillStyle = hpFrac > 0.5 ? 'rgba(70,255,140,0.9)' : hpFrac > 0.25 ? 'rgba(255,210,80,0.9)' : 'rgba(255,70,70,0.95)';
    ctx.fillRect(bx, by, bw * hpFrac, 3);
    ctx.fillStyle = 'rgba(' + col + ',0.95)'; ctx.font = '11px ' + HUDFONT;
    ctx.fillText(dist >= 1000 ? (dist / 1000).toFixed(1) + t('hud.km') : Math.round(dist) + t('hud.m'), x, y + s + 12);
    if (boss) { ctx.fillStyle = 'rgba(255,80,220,0.95)'; ctx.font = 'bold 12px ' + HUDFONT; ctx.fillText(t('hud.boss'), x, by - 8); }
    else if (e.type === 'bomber') { ctx.fillStyle = 'rgba(255,176,96,1)'; ctx.font = 'bold 12px ' + HUDFONT; ctx.fillText(t('hud.bomber'), x, by - 8); }
    else if (e.rival) { ctx.fillStyle = 'rgba(255,90,42,1)'; ctx.font = 'bold 12px ' + HUDFONT; ctx.fillText('\u2620 ' + e.callsign + ' \u00b7 ' + e.aceName + ' \u00b7 ' + t('hud.lv') + rival.level, x, by - 8); }
    else if (e.elite) { ctx.fillStyle = 'rgba(255,210,77,1)'; ctx.font = 'bold 12px ' + HUDFONT; ctx.fillText('\u2605 ' + (e.callsign || t('hud.ace')) + (e.aceName ? ' \u00b7 ' + e.aceName : ''), x, by - 8); }
    else if (e.callsign) { ctx.fillStyle = 'rgba(255,80,80,0.85)'; ctx.font = '10px ' + HUDFONT; ctx.fillText(e.callsign, x, by - 8); }
    ctx.restore();
  } else {
    let ang = p.behind ? Math.atan2(-(p.y - cy), -(p.x - cx)) : Math.atan2(p.y - cy, p.x - cx);
    const rx = W / 2 - 64, ry = H / 2 - 64;
    const ex = cx + Math.cos(ang) * rx, ey = cy + Math.sin(ang) * ry;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
    const big = isNear ? 1.4 : 1;
    ctx.fillStyle = 'rgba(' + col + ',' + (isNear ? 1 : 0.9) + ')';
    ctx.beginPath(); ctx.moveTo(17 * big, 0); ctx.lineTo(-11 * big, -9 * big); ctx.lineTo(-11 * big, 9 * big); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(' + col + ',0.85)'; ctx.font = '10px ' + HUDFONT; ctx.textAlign = 'center';
    const tx = cx + Math.cos(ang) * (rx - 22), ty = cy + Math.sin(ang) * (ry - 22);
    ctx.fillText(dist >= 1000 ? (dist / 1000).toFixed(1) + t('hud.km') : Math.round(dist) + t('hud.m'), tx, ty);
  }
}

/* ---------------- radar ---------------- */
function drawRadar() {
  const ctx = radarCtx, w = radarCanvas.width, h = radarCanvas.height, cx = w / 2, cy = h / 2, R = w / 2 - 5;
  ctx.clearRect(0, 0, w, h);

  const fwd = fwdOf(player.group, t1);
  const fx = fwd.x, fz = fwd.z, fl = Math.hypot(fx, fz) || 1;
  const Fx = fx / fl, Fz = fz / fl, Rx = -Fz, Rz = Fx;
  const range = 6500;
  // weather + night shorten radar detection: contacts beyond detR drop off the scope entirely
  const detR = 6500 * ((typeof weather !== 'undefined' && weather) ? (weather.radarMul || 1) : 1);
  const detR2 = detR * detR;

  // forward FOV wedge
  ctx.fillStyle = 'rgba(25,240,212,0.07)';
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fill();

  // rings + crosshair
  ctx.strokeStyle = 'rgba(25,240,212,0.22)'; ctx.lineWidth = 1;
  for (let r = R / 3; r <= R + 0.5; r += R / 3) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TWO_PI); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();

  // sweep
  const sweep = (performance.now() * 0.0011) % TWO_PI;
  const grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweep - Math.PI / 2) * R, cy + Math.sin(sweep - Math.PI / 2) * R);
  grad.addColorStop(0, 'rgba(25,240,212,0.5)'); grad.addColorStop(1, 'rgba(25,240,212,0)');
  ctx.strokeStyle = grad; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sweep - Math.PI / 2) * R, cy + Math.sin(sweep - Math.PI / 2) * R); ctx.stroke();

  function plot(pos, r, g, b, sz, sq, ring) {
    const dx = pos.x - player.group.position.x, dz = pos.z - player.group.position.z;
    let ahead = dx * Fx + dz * Fz, right = dx * Rx + dz * Rz;
    let px = right / range * R, py = -ahead / range * R;
    const dlen = Math.hypot(px, py);
    if (dlen > R) { px = px / dlen * R; py = py / dlen * R; }
    const X = cx + px, Y = cy + py;
    const dy = pos.y - player.group.position.y;
    if (Math.abs(dy) > 120) { // altitude tick
      ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, Y + (dy > 0 ? -7 : 7)); ctx.stroke();
    }
    ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    if (sq) ctx.fillRect(X - sz, Y - sz, sz * 2, sz * 2);
    else { ctx.beginPath(); ctx.arc(X, Y, sz, 0, TWO_PI); ctx.fill(); }
    if (ring) { ctx.strokeStyle = 'rgba(255,225,77,0.95)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X, Y, sz + 3, 0, TWO_PI); ctx.stroke(); }
  }
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive || e.isInCloud) continue;
    const rdx = e.group.position.x - player.group.position.x, rdz = e.group.position.z - player.group.position.z;
    if (detR < 6500 && rdx * rdx + rdz * rdz > detR2) continue;   // weather/night only: drop contacts beyond the reduced detection range (clear day = unchanged)
    const lk = player.lockedTarget === e;
    if (e.type === 'boss') plot(e.group.position, 255, 69, 200, 5, false, lk);
    else if (e.type === 'bomber') plot(e.group.position, 255, 176, 96, 5, false, lk);
    else if (e.type === 'drone') plot(e.group.position, 255, 64, 96, 3, false, lk);
    else if (e.elite) plot(e.group.position, 255, 210, 77, 4, false, lk);
    else if (e.type === 'ground') plot(e.group.position, 255, 165, 55, 4, true, lk);
    else plot(e.group.position, 255, 80, 80, 4, false, lk);
  }
  for (let i = 0; i < missiles.length; i++) if (missiles[i].enemy) plot(missiles[i].mesh.position, 255, 255, 255, 2);
  for (let i = 0; i < wingmen.length; i++) { if (wingmen[i].alive) plot(wingmen[i].group.position, 45, 255, 176, 4, true); }
  for (let i = 0; i < loots.length; i++) { const isC = loots[i].kind === 'crate'; plot(loots[i].mesh.position, 70, 255, 190, isC ? 4 : 3, isC); }
  ctx.fillStyle = '#19f0d4'; ctx.beginPath();
  ctx.moveTo(cx, cy - 8); ctx.lineTo(cx - 6, cy + 6); ctx.lineTo(cx + 6, cy + 6); ctx.closePath(); ctx.fill();
}

/* ---------------- DOM HUD ---------------- */
let el = {};
function g(id) { return document.getElementById(id); }
function cacheEl() {
  el = {
    hp: g('hpfill'), thr: g('thrfill'), shd: g('shfill'), spd: g('spd'), alt: g('alt'),
    score: g('score'), wave: g('wave'), combo: g('combo'), tp: g('tp'),
    flares: g('flares'), missiles: g('missiles'), bullets: g('bullets'), special: g('special'),
    hpbar: g('hpbar'), banner: g('banner'), sidebar: g('wingSidebar'),
    wPull: g('w_pull'), wMissile: g('w_missile'), wHighG: g('w_highg'), wStealth: g('w_stealth'), wLock: g('w_lock'), wDrone: g('w_drone'),
    vignette: g('vignette'), dmg: g('dmg'), flash: g('flash'),
    bossbar: g('bossbar'), bossfill: g('bossfill'),
    abIndicator: g('abIndicator'),
    tut: g('tutorial'), tutCard: g('tutCard'), tutArrow: g('tutArrow'),
    tutStep: g('tutStep'), tutText: g('tutText'), tutSkip: g('tutSkip'),
  };
}
function tog(e, on) { e.classList.toggle('show', !!on); }

/* ---------------- first-run guided tutorial (F5) ----------------
   Lightweight stepped prompts that gate on the player's own actions during their first wave.
   The pure step machine is `tutorialNext` (globals.js, mirrored in tests/tutorial.test.js); the
   `tutorial` runtime state lives in globals.js. main.js feeds detected action events here each frame.
   Touch vs keyboard is chosen at render time (isTouchEnabled) so the hint text matches the input mode. */
// i18n key for the current step's hint, touch-aware.
function tutStepKey(step) {
  const base = TUTORIAL_STEPS[step];                 // 'pitch' | 'throttle' | 'guns' | 'missile'
  if (!base) return 'tut.done';
  return isTouchEnabled ? ('tut.' + base + 'Touch') : ('tut.' + base);  // e.g. tut.pitchTouch / tut.pitch
}
// the HUD element a step's arrow should point at (null = no specific element → arrow hidden).
function tutArrowTarget(step) {
  if (TUTORIAL_STEPS[step] === 'throttle') return el.thr && el.thr.parentElement;   // the THR meter row
  if (TUTORIAL_STEPS[step] === 'missile') return el.missiles;                       // the Msl counter
  return null;
}
// position the pointer arrow just above (or below) the target element, in viewport coords.
function placeTutArrow(target) {
  const a = el.tutArrow;
  if (!a) return;
  if (!target) { a.classList.remove('show'); return; }
  const r = target.getBoundingClientRect();
  if (!r.width && !r.height) { a.classList.remove('show'); return; }
  const cx = r.left + r.width / 2;
  // prefer pointing DOWN from just above the element; if it's near the top edge, flip to point UP from below.
  const above = r.top > 46;
  a.classList.toggle('up', !above);
  a.style.left = cx + 'px';
  a.style.top = (above ? r.top - 26 : r.bottom + 6) + 'px';
  a.classList.add('show');
}
// render the overlay for the current tutorial.step (or hide it when done/inactive).
function renderTutorial() {
  if (!el.tut) return;
  if (!tutorial.active || tutorial.done || tutorial.step >= TUTORIAL_DONE) { el.tut.classList.remove('show'); return; }
  el.tut.classList.add('show');
  if (el.tutText) el.tutText.textContent = t(tutStepKey(tutorial.step));
  if (el.tutStep) el.tutStep.textContent = (tutorial.step + 1) + '/' + TUTORIAL_DONE;
  placeTutArrow(tutArrowTarget(tutorial.step));
}
// begin the tutorial for a new player's first run. Idempotent; baselines the run-stat counters
// so we detect the NEXT gun/missile action rather than ammo spent before this point.
function startTutorial() {
  tutorial.active = true; tutorial.done = false; tutorial.step = 0;
  tutorial.prevShots = (typeof run === 'object' && run) ? (run.shots || 0) : 0;
  tutorial.prevMissiles = (typeof run === 'object' && run) ? (run.missiles || 0) : 0;
  if (el.tutSkip) {
    el.tutSkip.textContent = t('tut.skip');
    if (!el.tutSkip._wired) {                        // wire Skip once
      el.tutSkip._wired = true;
      el.tutSkip.addEventListener('click', () => { advanceTutorial('skip'); if (audio.on) audio.ui(); });
    }
  }
  renderTutorial();
}
// tear down: latch done, hide overlay. Persistence is shared with onboarding (skystrike_onboarded
// is already set once a new player clears the controls brief) — no extra storage key.
function finishTutorial() {
  tutorial.active = false; tutorial.done = true;
  if (el.tut) el.tut.classList.remove('show');
  showBanner(t('tut.done'));
  setTimeout(() => { if (state === 'playing') showBanner(t('tut.barrelRoll'), 4); }, 2600);
  setTimeout(() => { if (state === 'playing' && tutorial.done) returnToHangar(); }, 4000);
}
// feed one detected action event into the pure machine; re-render or finish on a step change.
function advanceTutorial(event) {
  if (!tutorial.active || tutorial.done) return;
  const next = tutorialNext(tutorial.step, event);
  if (next === tutorial.step) return;               // no-op event
  tutorial.step = next;
  if (next >= TUTORIAL_DONE) { finishTutorial(); return; }
  if (audio.on) audio.ui();
  renderTutorial();
}

let bannerT = 0;
function showBanner(txt) { el.banner.textContent = txt; el.banner.classList.remove('show'); void el.banner.offsetWidth; el.banner.classList.add('show'); bannerT = 2.0; }

function updateWingmanSidebar() {
  if (!el.sidebar) return;
  if (!wingmen.length) { el.sidebar.classList.remove('visible'); return; }
  el.sidebar.classList.add('visible');
  // Rebuild structure only when wingmen count changes; otherwise just patch text/style
  if (el.sidebar.children.length !== wingmen.length) {
    el.sidebar.innerHTML = '';
    for (let i = 0; i < wingmen.length; i++) {
      const row = document.createElement('div');
      row.innerHTML = '<div class="wn"></div><div class="ws"></div><div class="whb"><div class="whf"></div></div>';
      el.sidebar.appendChild(row);
    }
  }
  const rows = el.sidebar.children;
  for (let i = 0; i < wingmen.length; i++) {
    const w = wingmen[i], row = rows[i];
    row.className = 'wing-row' + (w.cca ? ' cca' : '') + (!w.alive ? ' down' : '');
    const hp = w.alive ? clamp(w.hp / w.maxHp * 100, 0, 100) : 0;
    let sub;
    if (w.cca) sub = (w.jetName || '?') + ' · ' + t('hud.exp') + ' ' + Math.max(0, Math.ceil(w.expire || 0)) + t('hud.sec');
    else if (!w.alive) sub = t('hud.rtb') + ' ' + Math.max(0, Math.ceil(w.rtb)) + t('hud.sec');
    else sub = (w.jetName || '?') + (w.flares != null ? ' · ★' + w.flares : '');
    row.children[0].textContent = w.name;
    row.children[1].textContent = sub;
    row.children[2].children[0].style.width = hp.toFixed(1) + '%';
  }
}
function updateAwacsHud() {
  const el = g('awacsHud'); if (!el) return;
  const show = state === 'playing' && !paused;
  el.style.display = show ? 'flex' : 'none';
  if (!show) return;
  const chip = (key, cntId, costId) => {
    const rem = Math.max(0, (AWACS_USES_MAX[key] || 0) - ((awacsUses && awacsUses[key]) || 0));
    const c = g(cntId); if (c) c.textContent = '×' + rem;
    const k = g(costId); if (k) k.textContent = (AWACS_COSTS[key] || 0) + ' RP';
  };
  chip('strike', 'awacsUsesStrike', 'awacsCostStrike');
  chip('resupply', 'awacsUsesResupply', 'awacsCostResupply');
  chip('jam', 'awacsUsesJam', 'awacsCostJam');
}
function updateDom(dt) {
  el.hp.style.width = clamp(player.hp / player.maxHp * 100, 0, 100) + '%';
  el.shd.style.width = clamp(player.shield / player.maxShield * 100, 0, 100) + '%';
  el.thr.style.width = clamp(player.throttle * 100, 0, 100) + '%';
  el.abIndicator.style.display = (player.throttle > 0.85 || player.overdrive > 0) ? 'inline-block' : 'none';
  el.spd.textContent = Math.round(player.speed * 2.3);
  el.alt.textContent = Math.round(Math.max(0, player.group.position.y) * 3.28);
  el.score.textContent = player.score.toLocaleString();
  if (el.tp) { el.tp.textContent = Math.floor(player.tp).toLocaleString(); el.tp.style.color = player.tp >= 120 ? '#ffe14d' : ''; }
  el.wave.textContent = wave;
  el.combo.textContent = player.combo > 1 ? 'x' + player.combo : '';
  el.flares.textContent = player.flares;
  el.missiles.textContent = player.missiles;
  if (player.noCannon) { el.bullets.textContent = '\u2014'; el.bullets.style.color = '#6cf2c8'; }
  else { el.bullets.textContent = player.bullets; el.bullets.style.color = player.bullets <= 80 ? '#ff8c2b' : ''; }
  el.missiles.style.color = player.missiles <= 0 ? '#ff394b' : '';
  if (!hasSpecial(player.jet)) { el.special.textContent = t('hud.noSpecial'); el.special.classList.remove('ready'); }
  else if (player.special.cd <= 0) { el.special.textContent = jetText(player.jet, 'ability') + ' \u25B8 ' + t('hud.ready'); el.special.classList.add('ready'); }
  else { el.special.textContent = jetText(player.jet, 'ability') + ' \u25B8 ' + Math.ceil(player.special.cd) + t('hud.sec'); el.special.classList.remove('ready'); }
  updateWingmanSidebar();
  tog(el.wStealth, player.stealth);
  tog(el.wHighG, player.highG);
  tog(el.wPull, player.gpws);
  tog(el.wMissile, missiles.some(m => m.enemy));
  tog(el.wDrone, enemies.some(e => e.alive && e.type === 'drone'));
  const lockedNow = !!(player.lockedTarget && player.lockedTarget.alive && player.lockProgress >= 1);
  const acquiringNow = !lockedNow && player.lockTarget && player.lockTarget.alive && player.lockProgress > 0.02;
  tog(el.wLock, lockedNow || acquiringNow);
  if (lockedNow) { el.wLock.textContent = t('hud.targetLocked'); el.wLock.style.color = '#ff5a5a'; }
  else if (acquiringNow) { el.wLock.textContent = t('hud.acquiring') + ' ' + Math.round(player.lockProgress * 100) + '%'; el.wLock.style.color = '#ffd24d'; }
  el.hpbar.classList.toggle('low', player.hp / player.maxHp < 0.3);

  let boss = null;
  for (let i = 0; i < enemies.length; i++) { if (enemies[i].alive && enemies[i].type === 'boss') { boss = enemies[i]; break; } }
  if (boss) { el.bossbar.classList.add('show'); el.bossfill.style.width = clamp(boss.hp / boss.maxHp * 100, 0, 100) + '%'; }
  else el.bossbar.classList.remove('show');

  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.classList.remove('show'); }

  const gforce = clamp((Math.abs(player.pitchRate) + Math.abs(player.rollRate) * 0.4) / (player.stats.turnRate * 2.1), 0, 1);
  let vig = gforce * 0.7; if (player.highG) vig = Math.max(vig, 0.92);
  if (player.slow > 0) vig = Math.max(vig, 0.55);   // bullet-time vignette
  el.vignette.style.opacity = vig.toFixed(3);
  el.dmg.style.opacity = clamp(player.damageFlash / 0.5, 0, 1).toFixed(3);
  if (empFlash > 0) { empFlash -= dt; el.flash.style.opacity = (empFlash * 0.5).toFixed(3); } else el.flash.style.opacity = '0';
  updateAwacsHud();
  const _pt = g('pilotTag');
  if (_pt) _pt.style.display = (state === 'playing' && !paused && meta && meta.callsign) ? 'flex' : 'none';
}

/* ---------------- tech tree (between-wave R&D) ---------------- */
let pendingUpgrades = null;   // retained no-op (legacy reset references)
let techPanMoved = false;     // true while the player is dragging to pan the tree (suppresses the click)
const TECH_COLW = 160, TECH_ROWH = 130, TECH_NODEW = 152, TECH_NODEH = 104, TECH_PAD = 28;
let techTab = 'tech';
function owns(id) { return player.tech.indexOf(id) >= 0; }
function repeatCount(node) { return player.techRepeat[node.id] || 0; }
function nodeCost(node) { return node.repeat ? node.cost + (node.costStep || 0) * repeatCount(node) : node.cost; }
function reqSatisfied(node, ownsFn, byId, groundOn) {
  // a single prerequisite is met if it's owned — or if it's a hidden ground node,
  // in which case we look through it to its own prerequisites instead
  const met = (id) => {
    const rn = byId[id];
    if (!groundOn && rn && rn.ground) return reqSatisfied(rn, ownsFn, byId, groundOn);   // bypass hidden ground nodes
    return ownsFn(id);
  };
  if (node.reqAll && !node.reqAll.every(met)) return false;        // AND-gate: every listed node required
  const req = node.req;
  if (!req) return true;
  return Array.isArray(req) ? req.some(met) : met(req);            // OR-gate: any one parent unlocks
}
function nodeState(node) {
  if (node.ground && !groundWar) return 'hidden';
  if (!node.repeat && owns(node.id)) return 'bought';
  if (node.ok && !node.ok(player)) return 'na';
  if (!reqSatisfied(node, owns, TECH_BY_ID, groundWar)) return 'locked';
  return player.tp >= nodeCost(node) ? 'avail' : 'cantafford';
}
function openTechScreen() {
  if (!player) return;
  techTab = 'tech';
  document.querySelectorAll('.tech-tab').forEach(b => { b.classList.toggle('active', b.dataset.tab === 'tech'); b.onclick = () => switchTechTab(b.dataset.tab); });
  renderTechTree(true);
  choosingUpgrade = true; paused = true;
  g('touchControls').classList.remove('show');
  g('upgrade').classList.add('show');
}
function nodeXY(node) { return { left: TECH_PAD + node.x * TECH_COLW, top: TECH_PAD + node.y * TECH_ROWH }; }
function renderTechTree(recenter) {
  const rv = g('rpval'); if (rv) rv.textContent = Math.floor(player.tp).toLocaleString();
  const grid = g('techgrid'); if (!grid) return;
  const treeNodes = TECH_TREE.filter(n => !n.tab || n.tab === 'tech');
  let maxX = 0, maxY = 0; for (const n of treeNodes) { if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y; }
  const W = TECH_PAD * 2 + maxX * TECH_COLW + TECH_NODEW;
  const H = TECH_PAD * 2 + maxY * TECH_ROWH + TECH_NODEH;
  // connectors (SVG), drawn first so nodes sit on top
  let svg = '<svg width="' + W + '" height="' + H + '">';
  for (const n of treeNodes) {
    // draw an edge from every parent: `req` entries are OR-gates (solid), `reqAll` are AND-gates (dashed)
    const orReqs = n.req ? (Array.isArray(n.req) ? n.req : [n.req]) : [];
    const edges = orReqs.map(id => ({ id, and: false })).concat((n.reqAll || []).map(id => ({ id, and: true })));
    for (const edge of edges) {
      const p = TECH_BY_ID[edge.id]; if (!p) continue;
      const a = nodeXY(p), b = nodeXY(n);
      const px = a.left + TECH_NODEW / 2, pb = a.top + TECH_NODEH;
      const cx = b.left + TECH_NODEW / 2, ct = b.top;
      const midY = (pb + ct) / 2;
      const lit = owns(edge.id) && (n.repeat ? repeatCount(n) > 0 : owns(n.id));
      const open = owns(edge.id) && nodeState(n) !== 'locked';
      const col = lit ? '#46ff8c' : open ? 'rgba(25,240,212,.55)' : 'rgba(91,138,134,.3)';
      const dash = edge.and ? ' stroke-dasharray="7,5"' : '';
      svg += '<path d="M' + px + ',' + pb + ' V' + midY + ' H' + cx + ' V' + ct + '" fill="none" stroke="' + col + '" stroke-width="' + (lit ? 3 : 2) + '"' + dash + '/>';
    }
  }
  svg += '</svg>';
  let nodes = '';
  for (const n of treeNodes) {
    const st = nodeState(n);
    if (st === 'hidden') continue;
    const p = nodeXY(n), ac = FAM_C[n.fam] || '#19f0d4';
    const cost = nodeCost(n);
    const costTxt = n.id === 'core' ? t('tech.core') : st === 'bought' ? t('tech.owned') : st === 'na' ? t('tech.na') : cost + ' RP';
    const badge = n.repeat ? '<span class="tn-rep">\u00D7' + repeatCount(n) + '</span>' : '';
    nodes += '<div class="tnode ' + st + (n.repeat ? ' rep' : '') + '" data-id="' + n.id + '" style="left:' + p.left + 'px;top:' + p.top + 'px;--ac:' + ac + '">' +
      badge +
      '<div class="tn-sym">' + n.sym + '</div>' +
      '<div class="tn-name">' + techText(n, 'name') + '</div>' +
      '<div class="tn-desc">' + techText(n, 'desc') + '</div>' +
      '<span class="tn-cost">' + costTxt + '</span>' +
    '</div>';
  }
  grid.innerHTML = '<div id="techcanvas" style="width:' + W + 'px;height:' + H + 'px">' + svg + nodes + '</div>';
  // wire clicks for purchasable nodes
  const cv = g('techcanvas');
  cv.querySelectorAll('.tnode.avail').forEach(el => el.addEventListener('click', () => { if (techPanMoved) { techPanMoved = false; return; } const id = el.getAttribute('data-id'); buyNode(TECH_BY_ID[id]); }));
  if (recenter) {
    const rootCX = TECH_PAD + 3 * TECH_COLW + TECH_NODEW / 2;
    grid.scrollLeft = Math.max(0, rootCX - grid.clientWidth / 2);
    grid.scrollTop = 0;
  }
}
function renderArmory() {
  if (!player) return;
  const rv = g('rpval'); if (rv) rv.textContent = Math.floor(player.tp).toLocaleString();
  const grid = g('techgrid'); if (!grid) return;
  const hint = g('techhint');
  if (hint) hint.textContent = t('tech.hintArmory');
  const armNodes = TECH_TREE.filter(n => n.tab === 'armory');
  let html = '<div class="armory-grid">';
  for (const n of armNodes) {
    const st = nodeState(n);
    if (st === 'hidden') continue;
    const ac = FAM_C[n.fam] || '#ffe14d';
    const cost = nodeCost(n);
    const costTxt = st === 'bought' ? t('tech.owned') : st === 'na' ? t('tech.na') : cost + ' RP';
    const badge = n.repeat ? '<span class="tn-rep">\u00D7' + repeatCount(n) + '</span>' : '';
    html += '<div class="tnode ' + st + (n.repeat ? ' rep' : '') + '" data-id="' + n.id + '" style="--ac:' + ac + '">' +
      badge +
      '<div class="tn-sym">' + n.sym + '</div>' +
      '<div class="tn-name">' + techText(n, 'name') + '</div>' +
      '<div class="tn-desc">' + techText(n, 'desc') + '</div>' +
      '<span class="tn-cost">' + costTxt + '</span>' +
    '</div>';
  }
  html += '</div>';
  grid.innerHTML = html;
  grid.querySelectorAll('.tnode.avail').forEach(el => el.addEventListener('click', () => { const id = el.getAttribute('data-id'); buyNode(TECH_BY_ID[id]); }));
}
function switchTechTab(tab) {
  techTab = tab;
  document.querySelectorAll('.tech-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'armory') { renderArmory(); return; }
  const hint = g('techhint');
  if (hint) hint.textContent = t('tech.hintTree');
  renderTechTree(true);
}
const WING_NODES = new Set(['w1', 'w2', 'reserve']);
let pendingWingNode = null;

function buyNode(node) {
  if (!choosingUpgrade || !player || !node) return;
  if (nodeState(node) !== 'avail') { audio.ui(); return; }
  if (WING_NODES.has(node.id)) { openWingPicker(node); return; }
  commitNode(node);
}

function commitNode(node) {
  const cost = nodeCost(node);
  player.tp -= cost;
  node.apply(player);
  if (node.repeat) { player.techRepeat[node.id] = repeatCount(node) + 1; }
  else { player.tech.push(node.id); player.upgrades.push(node.id); }
  audio.power(); empFlash = 0.26;
  showBanner(tf('banner.researched', { name: techText(node, 'name') }));
  techTab === 'armory' ? renderArmory() : renderTechTree(false);
}

function openWingPicker(node) {
  pendingWingNode = node;
  const grid = g('wpGrid');
  grid.innerHTML = JETS.map((j, i) =>
    '<div class="wp-jet" data-i="' + i + '"><div class="wp-name">' + jetText(j, 'name') + '</div><div class="wp-role">' + jetText(j, 'role') + '</div></div>'
  ).join('');
  grid.querySelectorAll('.wp-jet').forEach(el =>
    el.addEventListener('click', () => confirmWingPick(+el.getAttribute('data-i'))));
  g('wingpick').classList.add('show');
  audio.ui();
}

function confirmWingPick(i) {
  const node = pendingWingNode;
  closeWingPicker();
  if (!node) return;
  pendingWingShape = JETS[i].shape;
  commitNode(node);
}

function closeWingPicker() {
  pendingWingNode = null;
  g('wingpick').classList.remove('show');
}
let opPicked = null;          // sector type picked on the map, pending launch
function openOpMap() {
  opPicked = null;
  const wrap = g('opStages'); if (!wrap) return;
  wrap.innerHTML = opMap.map((stage, si) =>
    '<div class="op-stage">' + stage.map((s, i) => {
      const cls = si < opStage ? 'op-sector done' : si === opStage ? 'op-sector pickable' : 'op-sector';
      return '<div class="' + cls + '" data-s="' + si + '" data-i="' + i + '">' + t('op.' + s) + '</div>';
    }).join('') + '</div>'
  ).join('');
  wrap.querySelectorAll('.op-sector.pickable').forEach(el => el.addEventListener('click', () => {
    wrap.querySelectorAll('.op-sector.chosen').forEach(c => c.classList.remove('chosen'));
    el.classList.add('chosen');
    opPicked = opMap[+el.getAttribute('data-s')][+el.getAttribute('data-i')];
    g('opLaunch').disabled = false;
  }));
  g('opLaunch').disabled = true;
  g('opmap').classList.add('show');
  paused = true;
  audio.ui();
}
function launchSector() {
  if (!opPicked) return;
  opSector = opPicked; opStage++;
  g('opmap').classList.remove('show');
  paused = false;
  if (clock) clock.getDelta();
  if (opSector === 'DEPOT') { applyDepot(); return; }
  betweenWaves = true; waveTimer = 1.4;
  showBanner(tf('banner.sector', { s: t('op.' + opSector) })); audio.ui();
}
function applyDepot() {
  player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.35);
  player.missiles = player.maxMissiles;
  player.flares = player.maxFlares;
  showBanner(t('banner.depot')); audio.power();
  openOpMap();                       // straight back to the map for the next pick
}
function deployFromTech() {
  if (!choosingUpgrade) return;
  pendingUpgrades = null;
  g('upgrade').classList.remove('show');
  choosingUpgrade = false; paused = false;
  if (clock) clock.getDelta();   // swallow the paused interval so dt doesn't spike
  if (isTouchEnabled && state === 'playing') g('touchControls').classList.add('show');
  if (opMode && opMap) {
    if (opStage >= opMap.length) return;          // FINAL already cleared; victory path owns the flow
    openOpMap(); return;
  }
  betweenWaves = true; waveTimer = 1.4;   // short breather, then the next wave spawns
  showBanner(tf('banner.waveInbound', { n: wave + 1 })); audio.ui();
}

/* ---------------- hangar / flow ---------------- */
function renderKillBoard() {
  const list = g('rbList'); if (!list || !rival) return;
  list.innerHTML = rival.board.length
    ? rival.board.slice().reverse().map(b => '<div class="rb-row"><span>☠ ' + b.name + '</span><span>' + b.jetName + '</span><span>' + tf('hud.killRow', { lv: b.level, wv: b.wave }) + '</span></div>').join('')
    : '<div class="rb-empty">' + t('hangar.noRivals') + '</div>';
}
function buildHangar() {
  // ---- single-jet carousel selector ----
  const dots = g('jetDots'); dots.innerHTML = '';
  JETS.forEach((j, i) => {
    const d = document.createElement('i'); d.title = jetText(j, 'name');
    d.addEventListener('click', () => selectJet(i));
    dots.appendChild(d);
  });
  g('jetPrev').addEventListener('click', () => cycleJet(-1));
  g('wpCancel').addEventListener('click', () => { closeWingPicker(); audio.ui(); });
  g('opLaunch').addEventListener('click', launchSector);
  g('jetNext').addEventListener('click', () => cycleJet(1));
  g('jetCard').addEventListener('dblclick', () => startGame(selectedJet));

  g('launch').addEventListener('click', () => startGame(selectedJet));
  g('manualBtn').addEventListener('click', openManual);
  g('manualClose').addEventListener('click', closeManual);
  g('manualAbort').addEventListener('click', abortMission);
  const mnav = g('manNav'); if (mnav) mnav.addEventListener('click', e => { const b = e.target.closest('.mnavbtn'); if (b) showManualTab(b.dataset.tab); });
  g('redeploy').addEventListener('click', returnToHangar);
  const td = g('techDeploy'); if (td) td.addEventListener('click', deployFromTech);
  const tg = g('techgrid');
  if (tg) {   // drag anywhere to pan the tech tree (scroll wheel & touch still work too)
    let panning = false, sx = 0, sy = 0, sl = 0, stp = 0;
    tg.addEventListener('pointerdown', e => { panning = true; techPanMoved = false; sx = e.clientX; sy = e.clientY; sl = tg.scrollLeft; stp = tg.scrollTop; });
    tg.addEventListener('pointermove', e => { if (!panning) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 5) techPanMoved = true; tg.scrollLeft = sl - dx; tg.scrollTop = stp - dy; });
    const endPan = () => { panning = false; };
    tg.addEventListener('pointerup', endPan); tg.addEventListener('pointerleave', endPan); tg.addEventListener('pointercancel', endPan);
  }
  document.querySelectorAll('.dbtn[data-d]').forEach(b => b.addEventListener('click', () => setDifficulty(+b.dataset.d)));
  setDifficulty(difficulty);
  document.querySelectorAll('.tbtn').forEach(b => b.addEventListener('click', () => setTimeOfDay(+b.dataset.t)));
  setTimeOfDay(timeOfDay);
  document.querySelectorAll('.mbtn').forEach(b => b.addEventListener('click', () => setOpMode(+b.dataset.m)));
  setOpMode(opMode ? 1 : 0);
  const sv = g('setVol'); if (sv) { sv.value = Math.round(volume * 100); sv.addEventListener('input', () => { volume = sv.value / 100; audio.setMaster(muted ? 0 : volume); saveSettings(); }); }
  const si = g('setInvert'); if (si) { si.checked = invertY; si.addEventListener('change', () => { invertY = si.checked; saveSettings(); }); }
  const sal = g('setAutoLock'); if (sal) { sal.checked = autoLock; sal.addEventListener('change', () => { autoLock = sal.checked; if (audio.on) audio.ui(); saveSettings(); }); }
  const sw = g('setWingman'); if (sw) { sw.checked = startWingman; sw.addEventListener('change', () => { startWingman = sw.checked; if (audio.on) audio.ui(); saveSettings(); }); }
  const sdu = g('setDevUnlock'); if (sdu) { sdu.checked = devUnlockAll; sdu.addEventListener('change', () => { devUnlockAll = sdu.checked; if (audio.on) audio.ui(); saveSettings(); renderJetCard(); }); }
  const srv = g('setRival'); if (srv) { srv.checked = rivalEnabled; srv.addEventListener('change', () => { rivalEnabled = srv.checked; if (audio.on) audio.ui(); saveSettings(); }); }
  const sgw = g('setGroundWar'); if (sgw) { sgw.checked = groundWar; sgw.addEventListener('change', () => { groundWar = sgw.checked; if (audio.on) audio.ui(); saveSettings(); }); }
  const sgl = g('setGunLead'); if (sgl) { sgl.checked = gunLead; sgl.addEventListener('change', () => { gunLead = sgl.checked; if (audio.on) audio.ui(); saveSettings(); }); }
  const sm = g('setMute'); if (sm) { sm.checked = muted; sm.addEventListener('change', () => { muted = sm.checked; audio.setMaster(muted ? 0 : volume); saveSettings(); }); }
  const ss = g('setSens'); if (ss) { ss.value = Math.round(controlSensitivity * 100); ss.addEventListener('input', () => { controlSensitivity = clamp(ss.value / 100, 0.5, 2.0); saveSettings(); }); }
  // mobile control settings (controls.js owns the input layer; these just set state + persist)
  bindSeg('controlSchemeTog', 'cs', () => controlScheme, (v) => { controlScheme = v; }, () => { if (audio.on) audio.ui(); });
  bindSeg('mobileControlTog', 'mc', () => mobileControl, (v) => { mobileControl = v; if (v === 'motion') enableMotionFlow(); }, () => { if (audio.on) audio.ui(); });
  bindSeg('aggressionTog', 'ag', () => motionAggression, (v) => { motionAggression = v; }, () => { if (audio.on) audio.ui(); });
  bindSeg('btnLayoutTog', 'bl', () => buttonLayout, (v) => { buttonLayout = v; if (typeof applyButtonStyle === 'function') applyButtonStyle(); }, () => { if (audio.on) audio.ui(); });
  // F11 graphics quality (auto/low/high) — re-resolve the render tier + resize the shadow map on change (visual-only)
  bindSeg('gfxQualityTog', 'gq', () => gfxQuality, (v) => { gfxQuality = v; if (typeof refreshGfxTier === 'function') refreshGfxTier(); if (typeof applyGfxQuality === 'function') applyGfxQuality(); }, () => { if (audio.on) audio.ui(); });
  const sh = g('setHaptics'); if (sh) { sh.checked = haptics; sh.addEventListener('change', () => { haptics = sh.checked; if (haptics && typeof haptic === 'function') haptic(20); saveSettings(); }); }
  const sbo = g('setBtnOpacity'); if (sbo) { sbo.value = Math.round(buttonOpacity * 100); sbo.addEventListener('input', () => { buttonOpacity = clamp(sbo.value / 100, 0.4, 1.0); if (typeof applyButtonStyle === 'function') applyButtonStyle(); saveSettings(); }); }
  const shs = g('setHudScale');
  if (shs) {
    shs.value = String(hudScale);
    shs.addEventListener('change', () => {
      hudScale = Math.max(0.6, Math.min(1.6, parseFloat(shs.value) || 1));
      applyHudScale();
      if (audio.on) audio.ui();
      saveSettings();
    });
  }
  applyHudScale();
  const sem = g('setEnableMotion'); if (sem) sem.addEventListener('click', () => { mobileControl = 'motion'; enableMotionFlow(); if (audio.on) audio.ui(); });
  const srec = g('setRecenter'); if (srec) srec.addEventListener('click', () => { if (typeof recenterMotion === 'function') recenterMotion(); if (audio.on) audio.ui(); });
  installMotionStatus();
  syncControlSettingsUI();
  document.querySelectorAll('.langbtn').forEach(b => b.addEventListener('click', () => { if (LANG === b.dataset.lang) return; LANG = b.dataset.lang; saveSettings(); applyLang(); if (audio.on) audio.ui(); }));
  applyLang();
  selectJet(selectedJet);
  updateBest();
  updateSpHud();
  renderKillBoard();
  const db = g('dailyBtn'); if (db) db.addEventListener('click', startDaily);
  refreshDailyEntry();
  const brb = g('bossRushBtn'); if (brb) brb.addEventListener('click', startBossRush);   // F15
  refreshBossRushEntry();
  const mb = g('metaBtn'); if (mb) mb.addEventListener('click', openMetaScreen);
  const mc = g('metaClose'); if (mc) mc.addEventListener('click', closeMetaScreen);
  const mn = g('metaNav'); if (mn) mn.addEventListener('click', e => { const b = e.target.closest('.mnavbtn'); if (b) showMetaTab(b.dataset.tab); });
  const mg = g('metaGrid'); if (mg) mg.addEventListener('click', onMetaGridClick);
  const js = g('jetStage'); if (js) js.addEventListener('click', onJetMetaClick);   // jet-card lock/skin buys (delegated)
  renderPilotPanel();
}
/* ---------------- pilot callsign + emblem (F13) ---------------- */
const EMBLEM_GLYPHS = { wings: '✈', skull: '☠', star: '★', dragon: 'ᚴ', ace: '◈' };
function renderPilotPanel() {
  // callsign input
  const inp = g('callsignInput');
  if (inp) {
    inp.value = (meta && meta.callsign) || '';
    inp.placeholder = t('pilot.placeholder');
    inp.removeEventListener('input', _onCallsignInput);
    inp.addEventListener('input', _onCallsignInput);
    inp.removeEventListener('blur', _onCallsignBlur);
    inp.addEventListener('blur', _onCallsignBlur);
  }
  // emblem grid
  const grid = g('emblemGrid');
  if (!grid) return;
  grid.innerHTML = '';
  EMBLEMS.forEach(function(em) {
    const unlocked = emblemUnlocked(em.id, meta);
    const active = meta && meta.emblem === em.id;
    const btn = document.createElement('button');
    btn.className = 'emblembtn' + (active ? ' active' : '') + (unlocked ? '' : ' elocked');
    btn.title = em.id;
    btn.dataset.eid = em.id;
    const glyph = EMBLEM_GLYPHS[em.id] || '◆';
    btn.textContent = glyph;
    if (!unlocked && em.gate === 'sp') {
      const cost = document.createElement('span');
      cost.className = 'emblemcost';
      cost.textContent = em.cost;
      btn.appendChild(cost);
    }
    btn.addEventListener('click', function() { onEmblemClick(em.id); });
    grid.appendChild(btn);
  });
  // update label
  setTxt('lblCallsign', t('pilot.callsign'));
  setTxt('lblEmblem', t('pilot.emblem'));
}
function _onCallsignInput(e) {
  // show sanitized value live
  const raw = e.target.value;
  const clean = sanitizeCallsign(raw);
  e.target.value = clean;
}
function _onCallsignBlur(e) {
  if (!meta) return;
  const clean = sanitizeCallsign(e.target.value);
  e.target.value = clean;
  setCallsign(clean);
}
function onEmblemClick(id) {
  if (!meta) return;
  if (emblemUnlocked(id, meta)) {
    setEmblem(id);
    renderPilotPanel();
  } else {
    // try to buy if SP-gated
    const def = EMBLEMS.filter(function(e) { return e.id === id; })[0];
    if (def && def.gate === 'sp') {
      if (buyPatch(id)) { setEmblem(id); updateSpHud(); renderPilotPanel(); if (typeof audio !== 'undefined' && audio.on) audio.ui(); }
      else showBanner(t('meta.needSp'));
    } else if (def && def.gate === 'ach') {
      const achDef = EMBLEMS.filter(function(e) { return e.id === id; })[0];
      showBanner(tf('pilot.needAch', { a: achDef.ach }));
    }
  }
}
// first-run flow: language select -> controls/instructions brief -> hangar. Skipped for returning players.
function initOnboarding() {
  document.querySelectorAll('.ob-lang').forEach(b => b.addEventListener('click', () => {
    LANG = b.dataset.lang; saveSettings(); applyLang(); if (audio.on) audio.ui();
    g('langSelect').classList.remove('show');
    g('onboard').classList.add('show');
  }));
  const oc = g('obContinue');
  if (oc) oc.addEventListener('click', () => {
    g('onboard').classList.remove('show');
    onboarding = false;
    store.set('skystrike_onboarded', '1');
    if (audio.on) audio.ui();
    startGame(0);
  });
  if (isReturningPlayer) {     // already onboarded, or a returning player from before onboarding existed
    store.set('skystrike_onboarded', '1');
    return;
  }
  onboarding = true;
  g('langSelect').classList.add('show');
}
function cycleJet(dir) { selectJet((selectedJet + dir + JETS.length) % JETS.length); }
function renderJetCard(i) {
  const j = JETS[i];
  g('jetCard').innerHTML =
    '<div class="cbgrid">' +
      '<div class="cbhead">' +
        '<div><div class="cname">' + jetText(j, 'name') + '</div><div class="crole">' + jetText(j, 'role') + '</div></div>' +
        '<div class="cbtags"><div class="cgen">' + genText(j.gen) + '</div><div class="cability">\u25C8 ' + (j.ability ? jetText(j, 'ability') : t('card.noSpecial')) + '</div></div>' +
      '</div>' +
      '<div>' +
        '<div class="cstats">' +
          statBar(t('stat.SPD'), j.speed) + statBar(t('stat.AGI'), j.agility) + statBar(t('stat.ACC'), j.accel) +
          statBar(t('stat.ARM'), j.armor) + statBar(t('stat.STL'), j.stealth) + statBar(t('stat.FPW'), j.firepower) +
        '</div>' +
        '<div class="cspecs">' +
          '<div><span>' + t('card.topSpeed') + '</span><b>' + jetText(j, 'topSpeed') + '</b></div>' +
          '<div><span>' + t('card.ceiling') + '</span><b>' + jetText(j, 'ceiling') + '</b></div>' +
          '<div><span>' + t('card.cannon') + '</span><b>' + jetText(j, 'cannon') + '</b></div>' +
        '</div>' +
      '</div>' +
      '<div>' +
        (j.ability ? '<div class="cspeclbl">' + t('card.special') + ' \u2014 ' + jetText(j, 'ability') + '</div>' +
        '<div class="cabilitydesc">' + jetText(j, 'abilityDesc') + '</div>' : '<div class="cspeclbl">' + t('card.noSpecialAbility') + '</div>') +
        (j.passive ? '<div class="cpassivelbl">' + t('card.passive') + ' \u2014 ' + jetText(j, 'passive').split('\u2014')[0].trim() + '</div><div class="cpassivetext">' + jetText(j, 'passive') + '</div>' : '') +
      '</div>' +
      '<div class="cblurb">' + jetText(j, 'desc') + '</div>' +
      '<div class="ccontext"><div class="cctlbl">' + t('card.realBrief') + '</div>' + jetText(j, 'context') + '</div>' +
      '<div id="jetMeta" class="jetmeta"></div>' +
    '</div>';
  renderJetMeta(i);
}
function setDifficulty(d) {
  difficulty = clamp(d, 0, 2);
  document.querySelectorAll('.dbtn[data-d]').forEach(b => b.classList.toggle('on', +b.dataset.d === difficulty));
  const dd = g('diffdesc'); if (dd) dd.textContent = DIFFS[difficulty].desc;
  if (audio.on) audio.ui();
  saveSettings();
}
function setTimeOfDay(t) {
  applyTimeOfDay(t);
  document.querySelectorAll('.tbtn').forEach(b => b.classList.toggle('on', +b.dataset.t === timeOfDay));
  if (audio.on) audio.ui();
  saveSettings();
}
function setOpMode(m) {
  opMode = !!m;
  document.querySelectorAll('.mbtn').forEach(b => b.classList.toggle('on', (+b.dataset.m === 1) === opMode));
  if (audio.on) audio.ui();
  saveSettings();
}
function showManualTab(name) {
  document.querySelectorAll('#manual .mtab').forEach(t => t.classList.toggle('show', t.dataset.tab === name));
  document.querySelectorAll('#manual .mnavbtn').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  if (audio.on) audio.ui();
}
function openManual() { g('manual').classList.add('show'); showManualTab('guide'); paused = true; g('touchControls').classList.remove('show'); }
function closeManual() { g('manual').classList.remove('show'); paused = false; if (clock) clock.getDelta(); if(isTouchEnabled && state === 'playing') g('touchControls').classList.add('show'); }
function toggleManual() { if (g('manual').classList.contains('show')) closeManual(); else openManual(); }
function abortMission() { closeManual(); if (state !== 'hangar') returnToHangar(); }
function statBar(lbl, v) {
  let s = '<div class="sb"><span>' + lbl + '</span><div class="bar">';
  for (let k = 1; k <= 10; k++) s += '<i class="' + (k <= v ? 'on' : '') + '"></i>';
  return s + '</div></div>';
}
function selectJet(i) {
  selectedJet = i;
  renderJetCard(i);
  const dots = g('jetDots'); if (dots) { const ch = dots.children; for (let k = 0; k < ch.length; k++) ch[k].classList.toggle('on', k === i); }
  const c = g('jetCounter'); if (c) c.textContent = ('0' + (i + 1)).slice(-2) + ' / ' + ('0' + JETS.length).slice(-2);
  if (previewJet) scene.remove(previewJet);
  const paint = jetPaint(JETS[i]);     // honour the chosen skin (falls back to stock paint)
  previewJet = buildJet(paint.color, paint.accent, SHAPES[JETS[i].shape], true);
  previewJet.position.set(0, 2.5, 0);
  scene.add(previewJet);
  audio.init(); audio.ui();
  saveSettings();
}
// jet-card overlay: lock/buy state + skin chips (called by renderJetCard tail)
function renderJetMeta(i) {
  const j = JETS[i];
  const wrap = g('jetMeta'); if (!wrap) return;
  let html = '';
  if (!jetUnlocked(j.id)) {
    html += '<div class="jmlock"><span class="jmlocklbl">' + t('meta.locked') + '</span>' +
            '<button class="jmbuy" data-buyjet="' + j.id + '">' + tf('meta.buyJet', { c: jetCost(j.id) }) + '</button></div>';
  } else {
    const skins = SKINS[j.id];
    if (skins && skins.length > 1) {
      html += '<div class="jmskins"><span class="jmskinlbl">' + t('meta.skins') + '</span>';
      for (let s = 0; s < skins.length; s++) {
        const sk = skins[s], owned = skinOwned(j.id, sk.id), sel = selectedSkin(j.id) === sk.id;
        const sw = (sk.color != null ? sk.color : j.color);
        html += '<button class="jmskin' + (sel ? ' on' : '') + (owned ? '' : ' locked') + '" data-skin="' + sk.id + '" data-jet="' + j.id +
                '" style="--sw:#' + ('000000' + (sw >>> 0).toString(16)).slice(-6) + '" title="' + metaText({ id: 'skin.' + sk.id }, 'name') + '">' +
                (owned ? '' : '<span class="jmsklk">' + skinCost(j.id, sk.id) + '</span>') + '</button>';
      }
      html += '</div>';
    }
  }
  wrap.innerHTML = html;
}
// delegated buy/select handlers for the jet-card meta overlay
function onJetMetaClick(e) {
  const buy = e.target.closest('[data-buyjet]');
  if (buy) { if (buyJet(buy.dataset.buyjet)) { updateSpHud(); selectJet(selectedJet); audio.ui(); } else showBanner(t('meta.needSp')); return; }
  const sk = e.target.closest('.jmskin');
  if (sk) {
    const jet = sk.dataset.jet, id = sk.dataset.skin;
    if (skinOwned(jet, id)) { setSkin(jet, id); selectJet(selectedJet); audio.ui(); }
    else if (buySkin(jet, id)) { setSkin(jet, id); updateSpHud(); selectJet(selectedJet); audio.ui(); }
    else showBanner(t('meta.needSp'));
  }
}
/* ---------------- meta-progression screen (perk tree + achievements) ---------------- */
let metaTab = 'perks';
function openMetaScreen() { if (state !== 'hangar') return; metaTab = 'perks'; g('meta').classList.add('show'); renderMetaScreen(); if (audio.on) audio.ui(); }
function closeMetaScreen() { g('meta').classList.remove('show'); if (audio.on) audio.ui(); }
function showMetaTab(name) { metaTab = name; renderMetaScreen(); if (audio.on) audio.ui(); }
function renderMetaScreen() {
  const sp = g('metaSpVal'); if (sp) sp.textContent = spBalance().toLocaleString();
  document.querySelectorAll('#meta .mnavbtn').forEach(b => b.classList.toggle('on', b.dataset.tab === metaTab));
  g('metaGrid').innerHTML = (metaTab === 'ach') ? renderAchGrid() : renderPerkGrid();
}
function renderPerkGrid() {
  let html = '<div class="perkgrid">';
  for (let i = 0; i < META_PERKS.length; i++) {
    const d = META_PERKS[i], lvl = perkLevel(d.id), maxed = perkMaxed(d.id), unlocked = perkUnlocked(d.id);
    const cost = perkCost(d.id, lvl), afford = spBalance() >= cost;
    const cls = maxed ? 'maxed' : (!unlocked ? 'locked' : (afford ? 'afford' : 'poor'));
    html += '<div class="perknode ' + cls + '">' +
      '<div class="pntitle">' + metaText(d, 'name') + '</div>' +
      '<div class="pndesc">' + metaText(d, 'desc') + '</div>' +
      '<div class="pnlvl">' + tf('meta.level', { l: lvl, m: d.max }) + '</div>' +
      (maxed ? '<div class="pnmax">' + t('meta.maxed') + '</div>'
        : !unlocked ? '<div class="pnreq">' + tf('meta.requires', { r: metaText(META_BY_ID[d.req], 'name') }) + '</div>'
        : '<button class="pnbuy" data-perk="' + d.id + '">' + tf('meta.buyLvl', { c: cost }) + '</button>') +
      '</div>';
  }
  return html + '</div>';
}
function renderAchGrid() {
  let html = '<div class="achgrid">';
  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const a = ACHIEVEMENTS[i], earned = achEarned(a.id);
    html += '<div class="achnode ' + (earned ? 'earned' : 'lockedach') + '">' +
      '<div class="achbadge">' + (earned ? '★' : '☆') + '</div>' +
      '<div class="achname">' + metaText({ id: 'ach.' + a.id }, 'name') + '</div>' +
      '<div class="achdesc">' + metaText({ id: 'ach.' + a.id }, 'desc') + '</div>' +
      '<div class="achsp">+' + a.sp + ' SP</div>' +
      '</div>';
  }
  return html + '</div>';
}
function onMetaGridClick(e) {
  const b = e.target.closest('[data-perk]');
  if (!b) return;
  if (buyPerk(b.dataset.perk)) { updateSpHud(); renderMetaScreen(); audio.ui(); }
  else showBanner(t('meta.needSp'));
}
function startGame(i, daily, rush) {
  if (state !== 'hangar') return;
  if (!daily && !jetUnlocked(JETS[i].id)) { showBanner(tf('meta.jetLocked', { c: jetCost(JETS[i].id) })); audio.ui(); return; }
  const _ptag = g('pilotTag');
  if (_ptag) {
    setTxt('pilotCallsignTxt', (meta && meta.callsign) || '');
    setTxt('pilotEmblemIcon', EMBLEM_GLYPHS[(meta && meta.emblem) || 'wings'] || '✈');
  }
  dailyMode = !!daily;   // explicit per-launch: only startDaily passes true; normal launches reset it to false
  bossRush = !!rush;     // F15: only startBossRush passes true; normal/daily launches reset it to false
  selectedJet = i; audio.init();
  closeManual();
  if (previewJet) { scene.remove(previewJet); previewJet = null; }
  if (platform) { scene.remove(platform); platform = null; }
  g('hangar').classList.add('hide');
  
  if (isTouchEnabled) g('touchControls').classList.add('show');

  wingDmgMul = 1;            // reset BEFORE building the player so a jet passive (F-47) can raise it
  createPlayer(i);
  if (!bossRush) applyMetaPerks(player);    // persistent meta-tree edges apply at run start, BEFORE in-run tech tree (F15: boss-rush is a FIXED loadout — no perks)
  for (let k = 0; k < decoys.length; k++) scene.remove(decoys[k].mesh);
  clearWingmen();
  enemies.length = bullets.length = missiles.length = flares.length = loots.length = particles.length = decoys.length = 0;
  pendingSpawns.length = 0;
  hitMarkers.length = dmgNumbers.length = 0;
  wave = 0; betweenWaves = true; waveTimer = 2.6; crateTimer = 9; strikeWaveActive = false;
  barrelRollCooldown = 0; barrelRollAnim = 0; barrelRollRequest = false;
  barrelRollLastKeyTap = -999; barrelRollLastTouchTap = -999;
  opMap = null; opStage = 0; opSector = null; mission = null; setpieceActive = null;
  weatherT = 0; weatherSeed = dailyMode ? dailySeed : ((Math.random() * 0x7fffffff) | 0);   // daily fixes the weather seed; otherwise fresh per-run (standalone rolls derive from it)
  if (typeof applyWeather === 'function') applyWeather('clear');   // reset condition visuals; nextWave sets the per-sector/rolled weather
  if (opMode) { opMap = genOpMap(groundWar); openOpMap(); }
  if (_dewBeam) _dewBeam.visible = false;
  choosingUpgrade = false; pendingUpgrades = null; g('upgrade').classList.remove('show');
  awacsUses = { strike: 0, resupply: 0, jam: 0 };   // AWACS support calls fresh each run (F10); nextWave also refreshes per sector
  run = { shots: 0, hits: 0, missiles: 0, kills: 0, ground: 0, boss: 0, missions: 0, t0: performance.now(), escortKills: 0, pMissiles: 0, pGunKills: 0, pFlares: 0, lastRivalWave: 0, damageTaken: 0, sectorAceSpawned: {}, setpieceDone: {}, cleanWaves: 0 };
  noDamageWave = false;   // armed per-wave by nextWave; reset here so a fresh run starts clean
  bossRushIndex = 0; bossRushT0 = performance.now();   // F15: leg counter + run clock (only consulted while bossRush)
  state = 'playing';
  // first-run guided tutorial (F5): only a brand-new player (this session) who hasn't finished it yet.
  // isReturningPlayer (globals.js) is captured at boot, so returning players skip entirely. Never in boss-rush.
  if (!bossRush && !isReturningPlayer && !tutorial.done) startTutorial();
  else if (el.tut) el.tut.classList.remove('show');
  if (startWingman) spawnWingman(false, 'STD');   // initial escort flies the plain trainer
  showBanner(t('banner.getReady'));
}
function gameOver() {
  if (state !== 'playing') return;
  state = 'dead';
  choosingUpgrade = false; pendingUpgrades = null; g('upgrade').classList.remove('show');
  explode(player.group.position, true);
  player.group.visible = false;
  clearWingmen();
  if (h2d) h2d.clearRect(0, 0, W, H);
  endRun(t('banner.missionFailed'));
}
// shared end-of-run overlay (death or operation victory) — fills stats and shows #gameover with the given title
function endRun(title) {
  const h1 = g('gameover').querySelector('h1'); if (h1) h1.textContent = title;
  if (player.score > bestScore) { bestScore = player.score; saveBest(); }
  if (dailyMode) {   // record today's daily best (attempt already marked played in startDaily); keep the higher score
    const rec = dailyToday();
    saveDaily({ date: rec.date, played: true, best: Math.max(rec.best || 0, player.score) });
  }
  g('go_score').textContent = player.score.toLocaleString();
  g('go_wave').textContent = wave;
  const secs = Math.max(0, Math.round((performance.now() - run.t0) / 1000));
  const acc = run.shots > 0 ? Math.round(run.hits / run.shots * 100) : 0;
  const dk = g('go_kills'); if (dk) dk.textContent = (run.kills + run.ground + run.boss);
  const da = g('go_acc'); if (da) da.textContent = acc + '%';
  const dm = g('go_msl'); if (dm) dm.textContent = run.missiles;
  const dt2 = g('go_time'); if (dt2) dt2.textContent = (Math.floor(secs / 60)) + ':' + ('0' + (secs % 60)).slice(-2);
  // ---- meta-progression: bank SP + evaluate achievements from this run's stats ----
  // stamp derived stats onto run so spAward / gradeRun / achievement predicates stay pure
  run.waveReached = wave;
  run.rivalLevel = (rival && rival.level) || 0;
  run.timeSecs = secs;
  const award = spAward(run, player);
  const grade = gradeRun(run, player);
  const gradedAward = Math.round(award * grade.mult);
  const achRes = checkAchievements(run, player);
  bankSP(gradedAward);                 // achievement SP is banked inside grantAch
  const total = gradedAward + (achRes.sp || 0);
  const spd = g('go_sp'); if (spd) spd.textContent = '+' + total.toLocaleString();
  const spt = g('go_spTotal'); if (spt) spt.textContent = spBalance().toLocaleString();
  // render grade letter + bonus
  const dg = g('go_grade'); if (dg) { dg.querySelector('.grade-letter').textContent = grade.letter; dg.querySelector('.grade-bonus').textContent = t('grade.bonus') + ' x' + grade.mult.toFixed(2); }
  // ---- star objectives: compute this run's stars, fold into the per-jet best, render on #gameover ----
  const stars = evalStars(run, player);
  const jetId = (player && player.jet && player.jet.id) || null;
  const best = bestStars(meta, jetId, stars); saveMeta();   // meta.stars[jet] now holds the lifetime best
  const sd = g('go_stars');
  if (sd) {
    const pips = sd.querySelector('.stars-pips'); if (pips) pips.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    const note = sd.querySelector('.stars-note'); if (note) note.textContent = stars + ' / 3  ·  ' + tf('stars.best', { n: best });
  }
  if (achRes.unlocked.length) showBanner(tf('banner.achUnlocked', { n: achRes.unlocked.length }));
  // pilot callsign + emblem on debrief
  const goPilot = g('go_pilot');
  if (goPilot) {
    const cs = (meta && meta.callsign) || '';
    const emId = (meta && meta.emblem) || 'wings';
    const glyph = (typeof EMBLEM_GLYPHS !== 'undefined' && EMBLEM_GLYPHS[emId]) || '';
    goPilot.textContent = cs ? (glyph ? glyph + ' ' + cs : cs) : '';
  }
  updateBest();
  g('touchControls').classList.remove('show');
  g('gameover').classList.add('show');
}
function operationComplete() {
  if (state !== 'playing') return;
  state = 'dead';
  choosingUpgrade = false; pendingUpgrades = null; g('upgrade').classList.remove('show');
  player.score += 5000;
  // F15: clearing the campaign once unlocks Boss Rush mode (persisted; healed for legacy saves)
  if (meta && !meta.bossRushUnlocked) { meta.bossRushUnlocked = true; saveMeta(); }
  showBanner(t('banner.operationComplete'));
  endRun(t('banner.operationComplete'));
  if (typeof refreshBossRushEntry === 'function') refreshBossRushEntry();   // reflect the new unlock in the hangar
}

// ===== Boss Rush mode (F15) =====
// Unlockable gauntlet: every boss in sequence, FIXED loadout, ONE life, NO tech tree. The run is
// timed; the lower (faster) full-clear time is kept as the local best. Death ends the run with no
// time recorded (gameOver → endRun). Completion records the time, then shows the result screen.
function startBossRush() {
  if (state !== 'hangar') return;
  if (!meta || !meta.bossRushUnlocked) { showBanner(t('bossrush.locked')); audio.ui(); return; }
  // fixed airframe: the player's first starter jet (always owned) — boss-rush is a level playing field.
  let jetIdx = 0;
  for (let k = 0; k < JETS.length; k++) { if (JETS[k].id === STARTER_JETS[0]) { jetIdx = k; break; } }
  opMode = false;   // not the op-map campaign; single-life gauntlet
  startGame(jetIdx, false, true);   // rush=true → fixed loadout (no meta perks), no tutorial, boss-rush loop
  if (state === 'playing') { spawnBossRushBoss(); showBanner(t('bossrush.title')); }   // launch the first boss immediately
}
// every boss down → record the best time and show the debrief
function bossRushComplete() {
  if (state !== 'playing') return;
  const secs = Math.max(0, Math.round((performance.now() - bossRushT0) / 1000));
  if (meta) { meta.bossRushBest = betterTime(meta.bossRushBest || 0, secs); saveMeta(); }   // keep the LOWER time
  player.score += 8000;   // gauntlet clear bonus
  state = 'dead';
  choosingUpgrade = false; pendingUpgrades = null; g('upgrade').classList.remove('show');
  showBanner(tf('bossrush.cleared', { t: bossRushTimeStr(secs) }));
  endRun(t('bossrush.title'));
  if (typeof refreshBossRushEntry === 'function') refreshBossRushEntry();
}
// mm:ss for the leaderboard
function bossRushTimeStr(secs) { return (Math.floor(secs / 60)) + ':' + ('0' + (secs % 60)).slice(-2); }
// hangar entry: lock the button until unlocked; show the best time once set
function refreshBossRushEntry() {
  const btn = g('bossRushBtn'); if (!btn) return;
  const unlocked = !!(meta && meta.bossRushUnlocked);
  btn.disabled = !unlocked;
  btn.classList.toggle('disabled', !unlocked);
  btn.textContent = unlocked ? t('bossrush.start') : t('bossrush.locked');
  const note = g('bossRushNote');
  if (note) {
    const best = (meta && meta.bossRushBest) || 0;
    note.textContent = !unlocked ? t('bossrush.locked')
      : (best > 0 ? tf('bossrush.best', { t: bossRushTimeStr(best) }) : t('bossrush.sub'));
  }
}

// ===== Daily seeded challenge (F7) =====
// Calendar-date seed → fixed layout/weather/jet restriction, one attempt per day, score saved locally.
// CRITICAL: the clock is read ONCE here at the call site (browser runtime); the pure fns
// (dailySeedFor/makeRng in globals.js) never call new Date(). y/m/d are passed in.
function todayParts() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }; }
function todayKey() { const p = todayParts(); return p.y + '-' + ('0' + p.m).slice(-2) + '-' + ('0' + p.d).slice(-2); }
function loadDaily() {
  try { const o = JSON.parse(store.get('skystrike_daily') || 'null'); if (o && typeof o === 'object') return o; } catch (e) {}
  return null;
}
function saveDaily(o) { try { store.set('skystrike_daily', JSON.stringify(o)); } catch (e) {} }
// today's record, or a fresh unplayed record if the stored one is for a previous day
function dailyToday() {
  const key = todayKey(); const rec = loadDaily();
  if (rec && rec.date === key) return rec;
  return { date: key, played: false, best: 0 };
}
// refresh the hangar Daily entry: lock the button once played, surface today's best / lock note
function refreshDailyEntry() {
  const rec = dailyToday();
  const btn = g('dailyBtn');
  if (btn) {
    btn.textContent = rec.played ? t('daily.done') : t('daily.play');
    btn.disabled = !!rec.played;
    btn.classList.toggle('disabled', !!rec.played);
  }
  const note = g('dailyNoteTxt');
  if (note) {
    if (rec.played) note.textContent = t('daily.best').replace('{best}', rec.best.toLocaleString()) + ' · ' + t('daily.locked');
    else note.textContent = t('daily.sub').replace('{date}', rec.date);
  }
}
// launch today's daily run: seed-fix everything off the calendar date, force one-life endless, restrict the jet
function startDaily() {
  if (state !== 'hangar') return;
  const rec = dailyToday();
  if (rec.played) { showBanner(t('daily.locked')); if (audio.on) audio.ui(); return; }
  const p = todayParts();
  const seed = dailySeedFor(p.y, p.m, p.d);
  // mark the attempt as consumed up front (one attempt/day, even if the player bails mid-run)
  saveDaily({ date: rec.date, played: true, best: rec.best || 0 });
  opMode = false;                                  // daily is single-life endless, not the op-map campaign
  const rng = makeRng(seed);
  const jetIdx = Math.floor(rng() * JETS.length) % JETS.length;   // seed-derived jet restriction (everyone flies the same airframe today)
  dailySeed = seed;                                // startGame reads this to reset weatherSeed deterministically when dailyMode
  startGame(jetIdx, true);
}

function updateBest() {
  const a = g('go_best'); if (a) a.textContent = bestScore.toLocaleString();
  const b = g('hangarBest'); if (b) { b.style.display = bestScore > 0 ? 'block' : 'none'; const v = g('hangarBestVal'); if (v) v.textContent = bestScore.toLocaleString(); }
}
// refresh the persistent SP balance shown in the hangar header (call after any SP spend)
function updateSpHud() { const v = g('hangarSpVal'); if (v) v.textContent = spBalance().toLocaleString(); }
// best score survives reloads when the file is opened locally (storage may be blocked in some sandboxes)
function loadBest() {
  try { const v = parseInt(store.get('skystrike_best') || '0', 10); if (!isNaN(v) && v > bestScore) bestScore = v; } catch (e) {}
}
function saveBest() {
  try { store.set('skystrike_best', String(bestScore)); } catch (e) {}
}
// player settings (volume, toggles, last loadout) persist across reloads when storage is available
function loadSettings() {
  try {
    const s = JSON.parse(store.get('skystrike_settings') || '{}');
    if (typeof s.volume === 'number') volume = clamp(s.volume, 0, 1);
    if (typeof s.muted === 'boolean') muted = s.muted;
    if (typeof s.invertY === 'boolean') invertY = s.invertY;
    if (typeof s.autoLock === 'boolean') autoLock = s.autoLock;
    if (typeof s.startWingman === 'boolean') startWingman = s.startWingman;
    if (typeof s.devUnlockAll === 'boolean') devUnlockAll = s.devUnlockAll;
    if (typeof s.rivalEnabled === 'boolean') rivalEnabled = s.rivalEnabled;
    if (typeof s.groundWar === 'boolean') groundWar = s.groundWar;
    if (typeof s.opMode === 'boolean') opMode = s.opMode;
    if (typeof s.gunLead === 'boolean') gunLead = s.gunLead;
    if (s.lang === 'EN' || s.lang === 'ZH') LANG = s.lang;
    if (typeof s.controlSensitivity === 'number') controlSensitivity = clamp(s.controlSensitivity, 0.5, 2.0);
    if (typeof s.hudScale === 'number') hudScale = Math.max(0.6, Math.min(1.6, s.hudScale));
    controlScheme = ['auto', 'pointer', 'rate'].includes(s.controlScheme) ? s.controlScheme : 'auto';
    if (s.mobileControl === 'touch' || s.mobileControl === 'motion') mobileControl = s.mobileControl;
    if (s.motionAggression === 'casual' || s.motionAggression === 'balanced' || s.motionAggression === 'direct') motionAggression = s.motionAggression;
    if (typeof s.haptics === 'boolean') haptics = s.haptics;
    if (typeof s.buttonOpacity === 'number') buttonOpacity = clamp(s.buttonOpacity, 0.4, 1.0);
    if (s.buttonLayout === 'right' || s.buttonLayout === 'left' || s.buttonLayout === 'compact') buttonLayout = s.buttonLayout;
    if (s.gfxQuality === 'auto' || s.gfxQuality === 'low' || s.gfxQuality === 'high') gfxQuality = s.gfxQuality;
    if (typeof refreshGfxTier === 'function') { refreshGfxTier(); if (typeof applyGfxQuality === 'function') applyGfxQuality(); }   // F11: re-resolve tier from the persisted setting + resize the shadow map
    if (typeof s.difficulty === 'number') difficulty = clamp(s.difficulty | 0, 0, 2);
    if (typeof s.timeOfDay === 'number') timeOfDay = clamp(s.timeOfDay | 0, 0, 2);
    if (typeof s.selectedJet === 'number') selectedJet = clamp(s.selectedJet | 0, 0, JETS.length - 1);
  } catch (e) {}
}
// retranslate all static DOM text + re-render dynamic panels for the current LANG
function setTxt(id, str) { const e = g(id); if (e) e.textContent = str; }
function applyLang() {
  // language-select / onboarding screens
  setTxt('langTitle', t('lang.title')); setTxt('langSub', t('lang.sub'));
  setTxt('obTitle', t('onboard.title')); setTxt('obSub', t('onboard.sub'));
  setTxt('obFlightH', t('onboard.flight')); setTxt('obFlightK', t('onboard.flightKeys'));
  setTxt('obCombatH', t('onboard.combat')); setTxt('obCombatK', t('onboard.combatKeys'));
  setTxt('obViewH', t('onboard.view')); setTxt('obViewK', t('onboard.viewKeys'));
  setTxt('obTouch', t('onboard.touch')); setTxt('obMore', t('onboard.more'));
  setTxt('tutSkip', t('tut.skip'));
  if (typeof tutorial !== 'undefined' && tutorial.active && !tutorial.done) renderTutorial();   // retranslate live tutorial hint
  setTxt('obContinue', t('onboard.continue'));
  // hangar
  setTxt('hangarSub', t('hangar.sub')); setTxt('hangarBestLbl', t('hangar.best'));
  setTxt('lblDiff', t('hangar.difficulty')); setTxt('lblEnv', t('hangar.environment')); setTxt('lblMode', t('hangar.mode'));
  setTxt('mbtnEndless', t('hangar.endless')); setTxt('mbtnOperation', t('hangar.operation'));
  setTxt('rbTitle', t('hangar.rivalBoard'));
  setTxt('launch', t('hangar.launch')); setTxt('manualBtn', t('hangar.manualBtn'));
  setTxt('hangarSpLbl', t('meta.sp')); setTxt('metaBtn', t('meta.btn'));
  if (typeof refreshDailyEntry === 'function') refreshDailyEntry();   // daily entry label/note follow language + play-state
  if (typeof refreshBossRushEntry === 'function') refreshBossRushEntry();   // F15: boss-rush entry label/note follow language + unlock state
  setTxt('lblCallsign', t('pilot.callsign')); setTxt('lblEmblem', t('pilot.emblem'));
  const ci = g('callsignInput'); if (ci) ci.placeholder = t('pilot.placeholder');
  setTxt('dbtn0', t('diff.ROOKIE')); setTxt('dbtn1', t('diff.VETERAN')); setTxt('dbtn2', t('diff.ACE'));
  setTxt('tbtn0', t('tod.DAY')); setTxt('tbtn1', t('tod.DUSK')); setTxt('tbtn2', t('tod.NIGHT'));
  setTxt('diffdesc', t('diff.desc' + DIFFS[difficulty].key));
  // hangar inline controls (3 lines)
  const c1 = g('hangarCtl1'); if (c1) c1.textContent = t('hangar.controls1');
  const c2 = g('hangarCtl2'); if (c2) c2.textContent = t('hangar.controls2');
  const c3 = g('hangarCtl3'); if (c3) c3.textContent = t('hangar.controls3');
  // game over labels
  setTxt('goLblScore', t('go.score')); setTxt('goLblWave', t('go.wave')); setTxt('goLblBest', t('go.best'));
  setTxt('goLblKills', t('go.kills')); setTxt('goLblAcc', t('go.accuracy')); setTxt('goLblMsl', t('go.missiles')); setTxt('goLblTime', t('go.time'));
  setTxt('goLblSp', t('meta.spEarned')); setTxt('goLblSpTotal', t('meta.banked'));
  setTxt('goLblGrade', t('grade.title'));
  setTxt('goLblStars', t('stars.title'));
  setTxt('redeploy', t('go.redeploy'));
  // meta-progression screen labels
  setTxt('metaTitle', t('meta.title')); setTxt('metaSub', t('meta.sub')); setTxt('metaSpLbl', t('meta.sp'));
  setTxt('metaTab_perks', t('meta.tabPerks')); setTxt('metaTab_ach', t('meta.tabAch'));
  setTxt('metaClose', t('meta.back')); setTxt('metaHint', t('meta.hint'));
  // tech tree shell
  setTxt('rplab', t('tech.researchPoints'));
  const th = g('techHeadTitle'); if (th) th.textContent = t('tech.title');
  const ts = g('techHeadSub'); if (ts) ts.textContent = t('tech.sub');
  document.querySelectorAll('.tech-tab').forEach(b => { b.textContent = b.dataset.tab === 'armory' ? t('tech.tabArmory') : t('tech.tabTech'); });
  setTxt('techDeploy', t('tech.deploy'));
  const hint = g('techhint'); if (hint) hint.textContent = techTab === 'armory' ? t('tech.hintArmory') : t('tech.hintTree');
  // wing picker
  const wt = g('wpTitle'); if (wt) wt.textContent = t('wing.title');
  const wsx = g('wpSub'); if (wsx) wsx.textContent = t('wing.sub');
  setTxt('wpCancel', t('wing.cancel'));
  // operation map
  const ot = g('opTitle'); if (ot) ot.textContent = t('op.title');
  const osb = g('opSub'); if (osb) osb.textContent = t('op.sub');
  const oi = g('opInfo'); if (oi) oi.textContent = t('op.info');
  setTxt('opLaunch', '▶ ' + t('op.launch').replace('▶ ', ''));
  setTxt('opLaunch', t('op.launch'));
  applyOpLegend();
  // hud panel labels
  setTxt('lblHp', t('hud.hp')); setTxt('lblShd', t('hud.shd')); setTxt('lblThr', t('hud.thr'));
  if (el.abIndicator) el.abIndicator.textContent = t('hud.ab');
  setTxt('lblScore', t('hud.score')); setTxt('lblRd', t('hud.rd')); setTxt('lblWave', t('hud.wave')); setTxt('lblCombo', t('hud.combo'));
  setTxt('lblSpd', t('hud.knots')); setTxt('lblAlt', t('hud.ft'));
  setTxt('lblGun', t('hud.gun')); setTxt('lblFlares', t('hud.flares')); setTxt('lblMsl', t('hud.msl'));
  // manual
  setTxt('manTitle', t('manual.title')); setTxt('manSub', t('manual.sub'));
  setTxt('manualClose', t('manual.resume')); setTxt('manualAbort', t('manual.abort'));
  setTxt('manH_Flight', t('manual.hFlight')); setTxt('manH_Combat', t('manual.hCombat'));
  setTxt('manH_Lock', t('manual.hLock')); setTxt('manH_Stats', t('manual.hStats'));
  setTxt('manH_Hud', t('manual.hHud')); setTxt('manH_Wingman', t('manual.hWingman'));
  setTxt('manH_Enemies', t('manual.hEnemies')); setTxt('manH_Tech', t('manual.hTech'));
  setTxt('manH_Settings', t('manual.hSettings'));
  setTxt('manH_Sorties', t('manual.hSorties')); setTxt('manH_Special', t('manual.hSpecial')); setTxt('manH_Missions', t('manual.hMissions'));
  setTxt('manTab_guide', t('manual.tabGuide')); setTxt('manTab_systems', t('manual.tabSystems'));
  setTxt('manTab_tactics', t('manual.tabTactics')); setTxt('manTab_settings', t('manual.tabSettings'));
  // settings labels
  setTxt('lblLang', t('set.language')); setTxt('lblSens', t('set.sensitivity'));
  setTxt('lblVol', t('set.volume')); setTxt('lblInvert', t('set.invert'));
  setTxt('lblAutoLock', t('set.autoLock')); setTxt('lblWingman', t('set.wingman'));
  setTxt('lblRival', t('set.rival')); setTxt('lblGroundWar', t('set.groundWar'));
  setTxt('lblGunLead', t('set.gunLead')); setTxt('lblMute', t('set.mute'));
  setTxt('setLangEN', t('set.langEN')); setTxt('setLangZH', t('set.langZH'));
  // mobile control settings labels + segmented button captions
  setTxt('lblControlScheme', t('set.controlScheme'));
  setTxt('lblMobileControl', t('set.mobileControl')); setTxt('lblAggression', t('set.aggression'));
  setTxt('lblMotion', t('set.motionSensor'));
  setTxt('lblHaptics', t('set.haptics')); setTxt('lblBtnOpacity', t('set.btnOpacity'));
  setTxt('lblBtnLayout', t('set.btnLayout'));
  setTxt('lblGfx', t('set.gfx'));
  setTxt('lblDevUnlock', t('set.devUnlock'));
  setTxt('awacsLblStrike', t('awacs.chipStrike'));
  setTxt('awacsLblResupply', t('awacs.chipResupply'));
  setTxt('awacsLblJam', t('awacs.chipJam'));
  setTxt('manH_Awacs', t('manual.awacs'));
  const _maw = g('manP_Awacs'); if (_maw) _maw.innerHTML = t('manBody.awacs');
  setTxt('callsignHint', t('pilot.hint'));
  setTxt('lblHudScale', t('set.hudScale'));
  const shs2 = g('setHudScale');
  if (shs2 && shs2.options.length >= 4) {
    shs2.options[0].textContent = t('set.hudSmall');
    shs2.options[1].textContent = t('set.hudNormal');
    shs2.options[2].textContent = t('set.hudLarge');
    shs2.options[3].textContent = t('set.hudXl');
  }
  setTxt('setEnableMotion', t('set.enableMotion')); setTxt('setRecenter', t('set.recenter'));
  const segTxt = (sel, key) => { const b = document.querySelector(sel); if (b) b.textContent = t(key); };
  segTxt('#controlSchemeTog [data-cs="auto"]', 'set.csAuto'); segTxt('#controlSchemeTog [data-cs="pointer"]', 'set.csPointer'); segTxt('#controlSchemeTog [data-cs="rate"]', 'set.csClassic');
  segTxt('#mobileControlTog [data-mc="touch"]', 'set.mcTouch'); segTxt('#mobileControlTog [data-mc="motion"]', 'set.mcMotion');
  segTxt('#aggressionTog [data-ag="casual"]', 'set.agCasual'); segTxt('#aggressionTog [data-ag="balanced"]', 'set.agBalanced'); segTxt('#aggressionTog [data-ag="direct"]', 'set.agDirect');
  segTxt('#btnLayoutTog [data-bl="right"]', 'set.blRight'); segTxt('#btnLayoutTog [data-bl="left"]', 'set.blLeft'); segTxt('#btnLayoutTog [data-bl="compact"]', 'set.blCompact');
  segTxt('#gfxQualityTog [data-gq="auto"]', 'set.gfxAuto'); segTxt('#gfxQualityTog [data-gq="low"]', 'set.gfxLow'); segTxt('#gfxQualityTog [data-gq="high"]', 'set.gfxHigh');
  document.querySelectorAll('.langbtn').forEach(b => b.classList.toggle('on', b.dataset.lang === LANG));
  // in-flight HUD warnings, hint bar, pause button (canvas labels are localized at draw time)
  setTxt('w_pull', t('hud.pullUp')); setTxt('w_missile', t('hud.missileAlert')); setTxt('w_drone', t('hud.droneSwarm'));
  setTxt('w_highg', t('hud.highG')); setTxt('w_stealth', t('hud.stealthActive')); setTxt('w_lock', t('hud.targetLocked'));
  setTxt('wingStatus', t('hud.escort'));
  const hintEl = g('hint'); if (hintEl) hintEl.textContent = t('hud.hint');
  const pauseEl = g('btnPause'); if (pauseEl) pauseEl.textContent = t('hud.pause');
  // touch buttons
  setTxt('tb-gun', t('touch.gun')); setTxt('tb-msl', t('touch.msl')); setTxt('tb-flr', t('touch.flr')); setTxt('tb-spc', t('touch.spc'));
  setTxt('tb-thr', t('touch.thr')); setTxt('tb-brk', t('touch.brk')); setTxt('tb-cam', t('touch.cam')); setTxt('tb-lck', t('touch.lck'));
  setTxt('tb-aws', t('touch.aws')); setTxt('tb-ars', t('touch.ars')); setTxt('tb-ajm', t('touch.ajm'));
  // flight manual body (HTML content)
  const setHTML = (id, key) => { const e = g(id); if (e) e.innerHTML = t(key); };
  setHTML('manUL_Flight', 'manBody.flight'); setHTML('manUL_Combat', 'manBody.combat'); setHTML('manP_Lock', 'manBody.lock');
  setHTML('manUL_Stats', 'manBody.stats'); setHTML('manUL_Hud', 'manBody.hud'); setHTML('manUL_Wingman', 'manBody.wingman');
  setHTML('manUL_Enemies', 'manBody.enemies'); setHTML('manP_Tech', 'manBody.tech');
  setHTML('manUL_Sorties', 'manBody.sorties'); setHTML('manUL_Special', 'manBody.special'); setHTML('manUL_Missions', 'manBody.missions');
  // re-render dynamic panels that bake text in
  if (player && choosingUpgrade) { techTab === 'armory' ? renderArmory() : renderTechTree(false); }
  if (typeof selectedJet === 'number') renderJetCard(selectedJet);
  renderKillBoard();
  updateSpHud();
  if (g('meta') && g('meta').classList.contains('show')) renderMetaScreen();
}
function applyOpLegend() {
  const map = { FURBALL: 'op.legFurball', INTERCEPT: 'op.legIntercept', STRIKE: 'op.legStrike', ESCORT: 'op.legEscort', DEFEND: 'op.legDefend', ELITE: 'op.legElite', DEPOT: 'op.legDepot', FINAL: 'op.legFinal' };
  const order = ['FURBALL', 'INTERCEPT', 'STRIKE', 'ESCORT', 'DEFEND', 'ELITE', 'DEPOT', 'FINAL'];
  const leg = document.querySelector('#opmap .op-legend');
  if (!leg) return;
  leg.innerHTML = order.map(k => '<span><b>' + t('op.' + k) + '</b> ' + t(map[k]) + '</span>').join('');
}
// generic segmented toggle: data-<attr> buttons, getter()/setter(v) on a global, optional onChange.
function bindSeg(containerId, attr, getter, setter, onChange) {
  const box = g(containerId);
  if (!box) return;
  box.querySelectorAll('.segbtn[data-' + attr + ']').forEach(b => {
    b.addEventListener('click', () => {
      const v = b.dataset[attr];
      if (getter() === v) return;
      setter(v);
      box.querySelectorAll('.segbtn').forEach(x => x.classList.toggle('on', x.dataset[attr] === v));
      if (onChange) onChange();
      saveSettings();
    });
  });
}
// reflect current control-setting state into the Settings widgets (on open / after load).
function syncControlSettingsUI() {
  const mark = (id, attr, val) => { const box = g(id); if (box) box.querySelectorAll('.segbtn').forEach(b => b.classList.toggle('on', b.dataset[attr] === val)); };
  mark('controlSchemeTog', 'cs', controlScheme);
  mark('mobileControlTog', 'mc', mobileControl);
  mark('aggressionTog', 'ag', motionAggression);
  mark('btnLayoutTog', 'bl', buttonLayout);
  mark('gfxQualityTog', 'gq', gfxQuality);
  const sh = g('setHaptics'); if (sh) sh.checked = haptics;
  const sbo = g('setBtnOpacity'); if (sbo) sbo.value = Math.round(buttonOpacity * 100);
}
// Enable-Motion flow: request permission from this user gesture; fall back to Touch on deny/unsupported.
function enableMotionFlow() {
  const note = g('motionNote'), txt = g('motionNoteTxt');
  if (typeof requestMotionPermission !== 'function' || typeof motionSupported !== 'function' || !motionSupported()) {
    mobileControl = 'touch';
    if (note && txt) { txt.textContent = t('set.motionUnsupported'); note.style.display = ''; }
    syncControlSettingsUI(); saveSettings();
    return;
  }
  requestMotionPermission().then(ok => {
    if (ok) {
      mobileControl = 'motion';
      if (note) note.style.display = 'none';
    } else {
      mobileControl = 'touch';
      if (note && txt) { txt.textContent = t('set.motionDenied'); note.style.display = ''; }
    }
    syncControlSettingsUI(); saveSettings();
  });
}
// Motion status seam: controls.js (Slice C) calls window.onMotionStatus(status, msg) on every
// motion state change. Renders #motionNote (show/hide + state class + text). Installed once at UI init.
function installMotionStatus() {
  const MOTION_STATUS = {
    requesting:  { cls: 'ms-info', msg: t('set.msRequesting') },
    denied:      { cls: 'ms-err',  msg: t('set.msDenied') },
    unsupported: { cls: 'ms-err',  msg: t('set.msUnsupported') },
    'no-data':   { cls: 'ms-warn', msg: t('set.msNoData') },
    live:        { cls: 'ms-ok',   msg: t('set.msLive') },
    off:         { cls: '',        msg: '' }
  };
  let hideTimer = null;
  window.onMotionStatus = (status, msg) => {
    const note = g('motionNote'), txt = g('motionNoteTxt');
    if (!note) return;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    const cfg = MOTION_STATUS[status];
    note.classList.remove('ms-info', 'ms-ok', 'ms-warn', 'ms-err');
    if (!cfg || status === 'off') { note.style.display = 'none'; return; }
    if (cfg.cls) note.classList.add(cfg.cls);
    if (txt) txt.textContent = msg || cfg.msg;
    note.style.display = '';
    if (status === 'live') hideTimer = setTimeout(() => { note.style.display = 'none'; hideTimer = null; }, 2000);
  };
}
function applyHudScale() {
  const h = g('hud');
  if (h) h.style.setProperty('--hud-scale', String(hudScale));
  if (typeof applyButtonStyle === 'function') applyButtonStyle();
}
function saveSettings() {
  try {
    store.set('skystrike_settings', JSON.stringify({
      volume, muted, invertY, autoLock, startWingman, devUnlockAll, gunLead, difficulty, timeOfDay, selectedJet, rivalEnabled, groundWar, opMode,
      lang: LANG, controlSensitivity, hudScale, controlScheme,
      mobileControl, motionAggression, haptics, buttonOpacity, buttonLayout, gfxQuality
    }));
  } catch (e) {}
}
function clearArena() {
  for (let i = 0; i < enemies.length; i++) { scene.remove(enemies[i].group); if (enemies[i].marker) scene.remove(enemies[i].marker); }
  for (let i = 0; i < bullets.length; i++) scene.remove(bullets[i].mesh);
  for (let i = 0; i < missiles.length; i++) scene.remove(missiles[i].mesh);
  for (let i = 0; i < flares.length; i++) scene.remove(flares[i].mesh);
  for (let i = 0; i < loots.length; i++) scene.remove(loots[i].mesh);
  for (let i = 0; i < particles.length; i++) scene.remove(particles[i].mesh);
  for (let i = 0; i < decoys.length; i++) scene.remove(decoys[i].mesh);
  clearWingmen();
  enemies.length = bullets.length = missiles.length = flares.length = loots.length = particles.length = decoys.length = 0;
  pendingSpawns.length = 0;
  BPOOL.length = 0; hitMarkers.length = 0; dmgNumbers.length = 0;
  if (player && player.group) scene.remove(player.group);
  player = null;
  if (h2d) h2d.clearRect(0, 0, W, H);
  if (radarCtx) radarCtx.clearRect(0, 0, radarCanvas.width, radarCanvas.height);
  ['wPull', 'wMissile', 'wHighG', 'wStealth', 'wLock'].forEach(k => { if (el[k]) el[k].classList.remove('show'); });
  if (el.vignette) el.vignette.style.opacity = '0';
  if (el.dmg) el.dmg.style.opacity = '0';
  if (el.flash) el.flash.style.opacity = '0';
  if (el.bossbar) el.bossbar.classList.remove('show');
  if (el.banner) el.banner.classList.remove('show');
  choosingUpgrade = false; pendingUpgrades = null;
  if (_dewBeam) _dewBeam.visible = false;
  const up = g('upgrade'); if (up) up.classList.remove('show');
}
function returnToHangar() {
  clearArena();
  g('gameover').classList.remove('show');
  g('touchControls').classList.remove('show');
  makePlatform();
  camMode = 0;
  camera.position.set(0, 6, 42); camera.lookAt(0, 2, 0);
  state = 'hangar'; paused = false;
  if (clock) clock.getDelta();
  g('hangar').classList.remove('hide');
  selectJet(selectedJet);
  updateBest();
  renderKillBoard();
  refreshDailyEntry();   // daily button label/play-state can change after a run — keep it current
  if (typeof refreshBossRushEntry === 'function') refreshBossRushEntry();   // F15: unlock/best-time can change after a run
}
