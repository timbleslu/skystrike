/* SKYSTRIKE — hud.js: canvas HUD renderer. Loaded before ui.js. Reads global game state, writes the 2D canvas context. No DOM. Extracted from ui.js. */
/* Canvas-HUD colour roles (rgb triplets — the canvas twin of the CSS semantic tokens, §2a).
   Glass-cockpit avionics: amber = active signal, green = nominal. ONE red (danger) for
   lock + locked + missile + enemy markers, matching CSS --danger.
   Boss keeps its unique magenta as a deliberate identity exception. */
const HUD = {
  primary: '255,185,56',  primaryBright: '255,211,107',
  danger: '255,59,59',    warn: '255,122,31',
  ok: '77,255,160',       reward: '255,225,77',
  velvec: '90,255,180',   ink: '207,230,214',  dim: '111,145,128',
  rival: '255,90,42',     boss: '255,80,220',   waypoint: '255,138,28'
};

/* Req D — OBJECTIVE CALLOUT: a large centre flash issued on EVERY objective transition (sector start
   + each multi-phase advance), fired by missions.js `fireObjectiveCallout`. It holds for 3s then
   fades out; the persistent top-centre readout (below) keeps the current objective up until it
   changes. Wall-clock timed, so it needs no per-frame dt plumbing. */
let objectiveCallout = { text: '', phase: 0, total: 1, t0: -1e9 };
const OBJ_CALLOUT_DUR = 3.0, OBJ_CALLOUT_FADE = 0.6;   // seconds: total hold, trailing fade
function fireObjectiveCallout(text, phase, total) {
  objectiveCallout = { text: text || '', phase: phase || 0, total: total || 1, t0: (typeof performance !== 'undefined' ? performance.now() : 0) };
}
function drawObjectiveCallout(ctx, cx, cy, k) {
  if (!objectiveCallout.text) return;
  const now = (typeof performance !== 'undefined' ? performance.now() : 0);
  const el = (now - objectiveCallout.t0) / 1000;
  if (el < 0 || el > OBJ_CALLOUT_DUR) return;
  const a = el > OBJ_CALLOUT_DUR - OBJ_CALLOUT_FADE ? Math.max(0, (OBJ_CALLOUT_DUR - el) / OBJ_CALLOUT_FADE) : 1;
  const yc = cy - 96 * k;
  let head = t('objective.new');
  if (objectiveCallout.total > 1) head += '   ' + objectiveCallout.phase + '/' + objectiveCallout.total;
  ctx.save();
  ctx.textAlign = 'center';
  // size a centered backing plate to the wider of the two lines so the callout reads over busy terrain
  ctx.font = 'bold ' + (36 * k) + 'px ' + HUDFONT;
  const lineW = ctx.measureText(objectiveCallout.text).width;
  ctx.font = 'bold ' + (18 * k) + 'px ' + HUDFONT;
  const headW = ctx.measureText(head).width;
  const bw = Math.max(lineW, headW) + 56 * k, bh = 74 * k;
  ctx.fillStyle = 'rgba(8,14,12,' + (0.62 * a) + ')';
  ctx.fillRect(cx - bw / 2, yc - 6 * k, bw, bh);
  ctx.fillStyle = 'rgba(' + HUD.waypoint + ',' + a + ')';   // accent bar + header in the waypoint orange = "new objective"
  ctx.fillRect(cx - bw / 2, yc - 6 * k, bw, 3 * k);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(head, cx, yc + 16 * k);
  ctx.fillStyle = 'rgba(' + HUD.primaryBright + ',' + (0.98 * a) + ')';   // objective line: large + bright
  ctx.font = 'bold ' + (36 * k) + 'px ' + HUDFONT; ctx.textBaseline = 'top';
  ctx.fillText(objectiveCallout.text, cx, yc + 24 * k);
  ctx.restore();
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
    ctx.strokeStyle = 'rgba(' + HUD.primary + ',0.22)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(bsp.x, bsp.y); ctx.lineTo(sp.x, sp.y); ctx.stroke();
  }

  const col = solution ? HUD.ok : HUD.reward;
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
    ctx.strokeStyle = 'rgba(' + HUD.ok + ',0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y - s); ctx.lineTo(sp.x + s, sp.y); ctx.lineTo(sp.x, sp.y + s); ctx.lineTo(sp.x - s, sp.y); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(' + HUD.ok + ',0.95)'; ctx.fillText(t('hud.guns'), sp.x, sp.y - s - 6);
    ctx.restore();
    // "shoot now" cue ringing the central reticle
    const cx = W / 2, cy = H / 2;
    ctx.strokeStyle = 'rgba(' + HUD.ok + ',' + (0.45 + 0.3 * Math.sin(performance.now() * 0.02)) + ')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 11 * k, 0, TWO_PI); ctx.stroke();
  }
  if (solution && !player._gunSol) audio.blip(1240, 0.04, 'sine', 0.05, 1560);   // soft tick on acquiring a gun solution
  player._gunSol = solution;
  ctx.lineWidth = 2;
}

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
  let y = 72;   // F2: below the objective line (y=44) + detection bar, clear of the pause button
  for (let i = 0; i < items.length; i++) {
    const met = items[i][0], label = (met ? '★ ' : '☆ ') + items[i][1];
    const w = ctx.measureText(label).width;
    ctx.fillStyle = met ? 'rgba(' + HUD.reward + ',0.95)' : 'rgba(' + HUD.dim + ',0.75)';
    ctx.fillText(label, cx - w / 2, y);
    y += 15 * k;
  }
  ctx.restore();
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
  const padX = 9 * k, x = 16, y = 136, h = 23 * k, w = ctx.measureText(label).width + padX * 2;   // below HP/SHD/THR bars + the pilot tag (callsign), each row its own space
  ctx.fillStyle = storm ? 'rgba(120,140,200,0.16)' : 'rgba(' + HUD.primary + ',0.10)';
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 1; ctx.strokeStyle = storm ? 'rgba(150,170,235,0.7)' : 'rgba(' + HUD.primary + ',0.5)';
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = storm ? 'rgba(205,215,255,0.95)' : 'rgba(255,230,200,0.95)';
  ctx.fillText(label, x + padX, y + 6 * k);
  ctx.restore();
}

// v1.3 STEALTH telegraphing — world-space detection rings drawn on the ground (projected polygon) so the
// player can literally see the no-go circles + the safe lane between them. Patrols also show a facing
// wedge so you can tell which way to slip behind them. Amber while sneaking, red once cover is blown.
function drawStealthThreats(ctx) {
  if (typeof enemies === 'undefined' || !enemies.length) return;
  const blown = (typeof stealthBlown !== 'undefined' && stealthBlown);
  const col = blown ? '255,70,70' : '255,162,58';
  const coneHalf = (typeof STEALTH_CONE_HALF !== 'undefined') ? STEALTH_CONE_HALF : 0.6;
  ctx.save(); ctx.lineWidth = 3;
  // SAFE-LANE hint (pre-blown): the central corridor toward the extraction waypoint is kept clear of rings
  // (spawnStealthExtraction). Draw a soft guide line player→extraction so the flyable gap reads at a glance.
  if (!blown && typeof mission !== 'undefined' && mission && mission.params && mission.params.waypoints && mission.params.waypoints[0]) {
    const wp = mission.params.waypoints[0];
    const py = player.group.position.y, gy0 = terrainH(player.group.position.x, player.group.position.z) + 30;
    const a0 = projectPoint(t2.set(player.group.position.x, gy0, player.group.position.z));
    const a1 = projectPoint(t3.set(wp.x, terrainH(wp.x, wp.z) + 30, wp.z));
    if (!a0.behind && !a1.behind) {
      ctx.setLineDash([14, 12]); ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(120,230,160,0.32)';   // green = the clear lane
      ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 3;
    }
  }
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive || !e.stealthThreat || !e.detectR) continue;
    const cxp = e.group.position.x, czp = e.group.position.z, gy = terrainH(cxp, czp) + 8;
    // detection ring as a projected ground polygon — bolder, with a faint fill so the no-go zone is unmistakable
    ctx.setLineDash([10, 8]); ctx.beginPath(); let started = false, anyFront = false;
    for (let s = 0; s <= 36; s++) {
      const a = s / 36 * TWO_PI;
      const sp = projectPoint(t2.set(cxp + Math.cos(a) * e.detectR, gy, czp + Math.sin(a) * e.detectR));
      if (sp.behind) { started = false; continue; }
      anyFront = true;
      if (!started) { ctx.moveTo(sp.x, sp.y); started = true; } else ctx.lineTo(sp.x, sp.y);
    }
    if (anyFront) { ctx.strokeStyle = 'rgba(' + col + ',0.85)'; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.setLineDash([]);
    // patrol scan cone (the ACTUAL detection wedge — STEALTH_CONE_HALF half-angle, range e.detectR). Brightens
    // when the patrol is investigating or actively sees you (coneLOS), so the threat reads honestly.
    if (e.patrol && !blown && e.logicQuat) {
      const fwd = fwdQ(e.logicQuat, t3), fa = Math.atan2(fwd.x, fwd.z), len = e.detectR;
      const c = projectPoint(t2.set(cxp, gy, czp));
      const pl = projectPoint(t2.set(cxp + Math.sin(fa - coneHalf) * len, gy, czp + Math.cos(fa - coneHalf) * len));
      const pr = projectPoint(t2.set(cxp + Math.sin(fa + coneHalf) * len, gy, czp + Math.cos(fa + coneHalf) * len));
      if (!c.behind && !pl.behind && !pr.behind) {
        const hot = e.investigating ? 0.30 : (e.coneLOS ? 0.14 + 0.3 * e.coneLOS : 0.12);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(pl.x, pl.y); ctx.lineTo(pr.x, pr.y); ctx.closePath();
        ctx.fillStyle = (e.investigating ? 'rgba(255,90,90,' : 'rgba(' + col + ',') + hot.toFixed(2) + ')'; ctx.fill();
        ctx.strokeStyle = 'rgba(' + col + ',0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// v1.3: red proximity vignette that intensifies as you near a ring (or pulses hard once cover is blown) —
// the "you're getting too close" cue before the meter alarms.
function drawStealthWarning(ctx, prox) {
  const blown = (typeof stealthBlown !== 'undefined' && stealthBlown);
  const intensity = blown ? 0.6 : prox;
  if (intensity <= 0.02) return;
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.012);
  const a = clamp(intensity, 0, 1) * 0.45 * pulse;
  const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.62);
  grad.addColorStop(0, 'rgba(255,40,40,0)'); grad.addColorStop(1, 'rgba(255,40,40,' + a.toFixed(3) + ')');
  ctx.save(); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H); ctx.restore();
}

function drawHUD() {
  const ctx = h2d, cx = W / 2, cy = H / 2, k = hudK();
  const reduce = (typeof prefersReducedMotion === 'function') && prefersReducedMotion();   // gates the non-essential canvas juice (kill flash, hit ring, lock-snap overshoot, HP pulse)
  ctx.clearRect(0, 0, W, H);
  ctx.lineWidth = 2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  drawHorizon(ctx, cx, cy);

  // central reticle — scaled around its screen anchor (cx,cy)
  ctx.strokeStyle = 'rgba(' + HUD.primary + ',0.9)';
  ctx.beginPath(); ctx.arc(cx, cy, 4 * k, 0, TWO_PI);
  ctx.moveTo(cx - 15 * k, cy); ctx.lineTo(cx - 7 * k, cy); ctx.moveTo(cx + 7 * k, cy); ctx.lineTo(cx + 15 * k, cy); ctx.moveTo(cx, cy - 15 * k); ctx.lineTo(cx, cy - 7 * k);
  ctx.stroke();

  const vd = t1.copy(player.vel);
  if (vd.lengthSq() > 1) {
    vd.normalize();
    const fp = projectPoint(t2.copy(player.group.position).addScaledVector(vd, 1600));
    if (!fp.behind) {
      // velocity-vector marker — projected position fixed, size ×k
      ctx.strokeStyle = 'rgba(' + HUD.velvec + ',0.9)';
      ctx.beginPath(); ctx.arc(fp.x, fp.y, 6 * k, 0, TWO_PI);
      ctx.moveTo(fp.x - 6 * k, fp.y); ctx.lineTo(fp.x - 15 * k, fp.y); ctx.moveTo(fp.x + 6 * k, fp.y); ctx.lineTo(fp.x + 15 * k, fp.y); ctx.moveTo(fp.x, fp.y - 6 * k); ctx.lineTo(fp.x, fp.y - 13 * k);
      ctx.stroke();
    }
  }

  // active sector-mission objective readout (top-centre), tinted by urgency / outcome
  if (typeof mission !== 'undefined' && mission && mission.status === 'active') {
    const detHot = (mission.type === 'stealth' && (mission.params.detect || 0) >= 0.6);
    const timed = (mission.type === 'intercept' && mission.timer <= 10) || detHot;
    ctx.fillStyle = timed ? 'rgba(' + HUD.warn + ',0.95)' : 'rgba(' + HUD.primary + ',0.95)';
    ctx.font = 'bold ' + (15 * k) + 'px ' + HUDFONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    let line = objectiveText(mission);
    if (mission.type === 'intercept') line += '   ⏱ ' + fmtClock(Math.max(0, mission.timer));
    ctx.fillText(line, cx, 44);   // F2: shifted below the top-centre pause button (was y=14, overlapped #btnPause)
    ctx.textBaseline = 'middle';
    // recon/stealth: point the objective marker at the next waypoint + (stealth) draw the detection bar
    if (mission.type === 'recon' || mission.type === 'stealth') drawMissionWaypoint(ctx, cx, cy, k, reduce);
    if (mission.type === 'stealth') { drawStealthThreats(ctx); drawDetectionBar(ctx, cx, k); drawStealthWarning(ctx, Math.max(mission.params._prox || 0, mission.params._coneLOS || 0)); }
  }
  drawObjectiveCallout(ctx, cx, cy, k);   // Req D: 3s big centre flash on objective issue / phase change

  drawStarObjectives(ctx, cx);   // small secondary-objective (star) checklist, top-centre
  drawWeatherChip(ctx);   // active condition (storm / fog / night) top-left

  // lead-computing gunsight for the nearest forward gun target
  if (gunLead && !player.noCannon) drawGunPipper(ctx, pickGunTarget());
  else player._gunSol = false;

  const lt = (player.lockTarget && player.lockTarget.alive) ? player.lockTarget : null;
  if (lt) {
    drawLockReticle(ctx, lt, player.lockProgress, player.lockedTarget === lt && player.lockProgress >= 1);
  }

  drawThreatReticle(ctx, cx, cy, k, reduce);   // §4b: warn bracket when an enemy is currently aiming at YOU
  drawMissileWarning(ctx, cx, cy, k, reduce);  // RWR spikes pointing toward each active inbound missile

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
    ctx.strokeStyle = 'rgba(77,255,160,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y - s); ctx.lineTo(sp.x + s, sp.y); ctx.lineTo(sp.x, sp.y + s); ctx.lineTo(sp.x - s, sp.y); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(77,255,160,0.85)'; ctx.font = (9 * k) + 'px ' + HUDFONT; ctx.textAlign = 'center';
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

  // gun-hit marker — chevrons stab INWARD (snap-in ease-out) then fade; fresh hits get one expanding confirm ring.
  for (let i = hitMarkers.length - 1; i >= 0; i--) {
    const hm = hitMarkers[i]; hm.t -= lastDt; const a = clamp(hm.t / 0.25, 0, 1);
    const p = 1 - a;                          // life progress 0→1
    const eo = 1 - (1 - p) * (1 - p);         // ease-out
    const s = (reduce ? (11 + a * 9) : (20 - 9 * eo)) * k, t7 = 7 * k;   // juice: start wide (20), stab to 11. reduced-motion keeps the original linear shrink.
    ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx - s + t7, cy - s + t7);
    ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx + s - t7, cy - s + t7);
    ctx.moveTo(cx - s, cy + s); ctx.lineTo(cx - s + t7, cy + s - t7);
    ctx.moveTo(cx + s, cy + s); ctx.lineTo(cx + s - t7, cy + s - t7);
    ctx.stroke();
    if (!reduce && p < 0.4) {                 // expanding confirm ring, first ~100ms — pure punch
      const rp = p / 0.4, rr = (6 + 22 * rp) * k;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - rp)) + ')'; ctx.lineWidth = 1.6 * k;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TWO_PI); ctx.stroke();
    }
    if (hm.t <= 0) hitMarkers.splice(i, 1);
  }
  ctx.lineWidth = 2;

  for (let i = dmgNumbers.length - 1; i >= 0; i--) {
    const d = dmgNumbers[i]; d.life -= lastDt; d.pos.y += (d.crit ? 42 : 30) * lastDt;
    const p = projectPoint(d.pos);
    if (!p.behind) {
      const lifeMax = d.crit ? 1.1 : 0.9, a = clamp(d.life / lifeMax, 0, 1);
      // JUICE: numbers PUNCH IN big on the first ~120ms (overshoot, bigger for crits) then settle to base size.
      const age = lifeMax - d.life;
      const pop = reduce ? 1 : (age < 0.12 ? 1 + (d.crit ? 0.9 : 0.55) * (1 - age / 0.12) : 1);
      if (d.crit) { ctx.fillStyle = 'rgba(255,150,40,' + a + ')'; ctx.font = 'bold ' + ((22 + (1 - a) * 12) * pop * k) + 'px ' + HUDFONT; }
      else { ctx.fillStyle = 'rgba(255,230,120,' + a + ')'; ctx.font = 'bold ' + ((16 + (1 - a) * 7) * pop * k) + 'px ' + HUDFONT; }
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
    ctx.strokeStyle = 'rgba(' + HUD.danger + ',' + (0.85 * a) + ')'; ctx.lineWidth = 6 * k; ctx.lineCap = 'round';   // survival edge ring — one red (--danger)
    ctx.beginPath(); ctx.arc(0, 0, rr, -Math.PI / 2 - 0.36, -Math.PI / 2 + 0.36); ctx.stroke();
    ctx.fillStyle = 'rgba(' + HUD.danger + ',' + (0.9 * a) + ')';
    ctx.beginPath(); ctx.moveTo(0, -rr - 7 * k); ctx.lineTo(-9 * k, -rr + 9 * k); ctx.lineTo(9 * k, -rr + 9 * k); ctx.closePath(); ctx.fill();
    ctx.lineCap = 'butt'; ctx.restore();
  }

  // ---- JUICE overlays (full-screen, drawn last so they sit on top) ----
  // LOW-HP screen pulse: a breathing red edge vignette when the player is in the danger band.
  // Essential threat signal, so it still renders under reduced-motion — just as a STEADY band, no breathing.
  if (player.alive && player.hp / player.maxHp < 0.3) {
    const sev = clamp(1 - (player.hp / player.maxHp) / 0.3, 0, 1);   // 0 at 30% HP → 1 at 0% HP
    const breathe = reduce ? 0.5 : (0.5 + 0.5 * Math.sin(performance.now() * 0.006));
    const edge = Math.max(cx, cy);
    const grad = ctx.createRadialGradient(cx, cy, edge * 0.55, cx, cy, edge);
    grad.addColorStop(0, 'rgba(' + HUD.danger + ',0)');
    grad.addColorStop(1, 'rgba(' + HUD.danger + ',' + (0.12 + 0.26 * sev * breathe) + ')');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  }

  // KILL CONFIRM flash: a quick white screen-edge bloom on a player kill (set in combat.js killEnemy).
  // Reward punctuation, not a survival signal → fully suppressed under reduced-motion.
  if (!reduce && typeof killFlash !== 'undefined' && killFlash > 0) {
    killFlash -= lastDt;
    const a = clamp(killFlash / 0.28, 0, 1), eo = a * a;   // ease-out fade
    const edge = Math.max(cx, cy);
    const grad = ctx.createRadialGradient(cx, cy, edge * 0.4, cx, cy, edge);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(' + HUD.ok + ',' + (0.22 * eo) + ')');   // green = "you got it" (matches kill/ok role)
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    if (killFlash <= 0) killFlash = 0;
  }
}

function drawWingman(ctx, w, cx, cy) {
  const pos = w.group.position;
  const p = projectPoint(pos);
  const dist = player.group.position.distanceTo(pos);
  const onScreen = !p.behind && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
  const col = w.cca ? '73,182,255' : '77,255,160';
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

// recon/stealth objective pointer: a diamond on the next waypoint when on-screen, or an edge
// arrowhead aiming you toward it when off-screen. Reuses projectPoint + the pure nextWaypoint
// (core.js) — the SAME world-projected-marker idiom as the escort/objective markers (no new mesh).
function drawMissionWaypoint(ctx, cx, cy, k, reduce) {
  const wp = nextWaypoint(mission.params.waypoints || []);
  if (!wp) return;
  const dist = Math.round(Math.hypot(wp.x - player.group.position.x, wp.y - player.group.position.y, wp.z - player.group.position.z));
  const arrive = (mission.params && mission.params.hitRadius) || 320;
  const wpScale = lerp(0.6, 2.0, clamp((4500 - dist) / (4500 - arrive), 0, 1));   // F1: marker grows toward arrival (2.0x), shrinks with distance (0.6x at ~4500u)
  const p = projectPoint(wp);
  const col = HUD.waypoint;   // dedicated waypoint orange — distinct from every other HUD marker
  const onScreen = !p.behind && p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
  // gentle pulse (steady under reduced-motion — the marker itself always shows)
  const pulse = reduce ? 0.85 : 0.55 + 0.35 * Math.abs(Math.sin(performance.now() / 320));
  ctx.save();
  ctx.strokeStyle = 'rgba(' + col + ',' + pulse.toFixed(3) + ')'; ctx.lineWidth = 2 * k;
  if (onScreen) {
    const h = 15 * k * wpScale, x = p.x, y = p.y, t2 = 6 * k * wpScale;   // F1: box reticle scales with distance (wpScale)
    ctx.beginPath();   // hollow box outline
    ctx.moveTo(x - h, y - h); ctx.lineTo(x + h, y - h); ctx.lineTo(x + h, y + h); ctx.lineTo(x - h, y + h); ctx.closePath();
    ctx.stroke();
    ctx.beginPath();   // corner brackets reading as a targeting gate
    ctx.moveTo(x - h, y - h + t2); ctx.lineTo(x - h - t2, y - h + t2); ctx.lineTo(x - h - t2, y - h - t2); ctx.lineTo(x - h + t2, y - h - t2);
    ctx.moveTo(x + h, y - h + t2); ctx.lineTo(x + h + t2, y - h + t2); ctx.lineTo(x + h + t2, y - h - t2); ctx.lineTo(x + h - t2, y - h - t2);
    ctx.moveTo(x - h, y + h - t2); ctx.lineTo(x - h - t2, y + h - t2); ctx.lineTo(x - h - t2, y + h + t2); ctx.lineTo(x - h + t2, y + h + t2);
    ctx.moveTo(x + h, y + h - t2); ctx.lineTo(x + h + t2, y + h - t2); ctx.lineTo(x + h + t2, y + h + t2); ctx.lineTo(x + h - t2, y + h + t2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(' + col + ',0.6)';
    ctx.beginPath(); ctx.arc(x, y, 2.4 * k * wpScale, 0, TWO_PI); ctx.fill();
    const label = mission.type === 'stealth' ? t('hud.extraction') : t('hud.waypoint');
    ctx.fillStyle = 'rgba(' + col + ',0.85)'; ctx.font = (9 * k) + 'px ' + HUDFONT; ctx.textAlign = 'center';
    ctx.fillText(label + ' ' + dist, x, y - h - 7 * k);
  } else {
    const ang = p.behind ? Math.atan2(-(p.y - cy), -(p.x - cx)) : Math.atan2(p.y - cy, p.x - cx);
    const ex = cx + Math.cos(ang) * (W / 2 - 48), ey = cy + Math.sin(ang) * (H / 2 - 48);
    ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(24 * k, 0); ctx.lineTo(-16 * k, -13 * k); ctx.lineTo(-16 * k, 13 * k); ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth = 2;
}

// stealth detection bar (top-centre, just under the objective line). The fill always renders;
// only the SPOTTED flash is motion-gated. Colour ramps ok→reward→warn→danger as the alarm climbs.
function drawDetectionBar(ctx, cx, k) {
  const det = clamp(mission.params.detect || 0, 0, 1);
  const bw = 150 * k, bh = 6 * k, bx = cx - bw / 2, by = 44 + 22 * k;   // F2: sits just under the shifted objective line
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx, by, bw, bh);
  const col = det < 0.4 ? HUD.ok : det < 0.7 ? HUD.reward : det < 0.9 ? HUD.warn : HUD.danger;
  // near-alarm flash is gated by reduced-motion; the solid fill below always shows the level
  const reduce = (typeof prefersReducedMotion === 'function') && prefersReducedMotion();
  const a = (det >= 0.9 && !reduce) ? (0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 120))) : 0.95;
  ctx.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')'; ctx.fillRect(bx, by, bw * det, bh);
  ctx.strokeStyle = 'rgba(' + HUD.dim + ',0.7)'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
  ctx.restore();
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
  // horizon ladder — primary cyan; storm desaturates to a cold blue-grey
  const storm = (typeof weather !== 'undefined' && weather && weather.type === 'storm');
  const ladderCol = storm ? '150,170,235' : HUD.primary;
  ctx.strokeStyle = 'rgba(' + ladderCol + ',0.5)'; ctx.lineWidth = 2; ctx.font = '11px ' + HUDFONT; ctx.fillStyle = 'rgba(' + ladderCol + ',0.6)';
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
    // LOCKED — one red (--danger), thicker box, blinking diamond: the "you can fire" payoff
    // JUICE: the moment lock ENGAGES (player.lockFlash, set once in combat.js), the box SNAPS in from
    // oversize with an --ease-snap-style overshoot and an expanding shockring radiates out. Makes the lock feel earned.
    const lf = (typeof player.lockFlash === 'number' && player.lockFlash > 0) ? player.lockFlash : 0;
    const reduceL = (typeof prefersReducedMotion === 'function') && prefersReducedMotion();
    let bs = s;
    if (lf > 0 && !reduceL) {
      const fp = 1 - lf / 0.42;                          // 0→1 over the snap
      const overshoot = 1 + 0.9 * (1 - fp) * Math.cos(fp * 7.5);   // damped overshoot wobble → settles to 1
      bs = s * overshoot;
    }
    ctx.strokeStyle = 'rgba(' + HUD.danger + ',1)'; ctx.lineWidth = 2.5;
    ctx.strokeRect(x - bs, y - bs, bs * 2, bs * 2);
    ctx.lineWidth = 2;
    for (const c of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath(); ctx.moveTo(x + c[0] * bs, y + c[1] * bs); ctx.lineTo(x + c[0] * (bs + 8), y + c[1] * bs);
      ctx.moveTo(x + c[0] * bs, y + c[1] * bs); ctx.lineTo(x + c[0] * bs, y + c[1] * (bs + 8)); ctx.stroke();
    }
    if (lf > 0 && !reduceL) {                            // expanding shockring on the snap
      const fp = 1 - lf / 0.42, rr = bs + 6 + 60 * fp;
      ctx.strokeStyle = 'rgba(' + HUD.danger + ',' + (0.8 * (1 - fp)) + ')'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TWO_PI); ctx.stroke(); ctx.lineWidth = 2;
    }
    ctx.fillStyle = 'rgba(' + HUD.danger + ',0.95)';
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill();
    const blink = (performance.now() % 600) < 400 ? 1 : 0.35;
    ctx.fillStyle = 'rgba(' + HUD.danger + ',' + blink + ')'; ctx.font = 'bold 13px ' + HUDFONT;
    ctx.fillText(t('hud.locked'), x, y - s - 11);
  } else if (progress > 0.02) {
    // LOCKING — caution-tier amber (--warn) converging brackets; progress ring shifts reward→warn as it climbs
    const o = base * (1.35 - progress * 0.9); // brackets converge as progress→1
    const a = 0.5 + progress * 0.5;
    ctx.strokeStyle = 'rgba(' + HUD.warn + ',' + a + ')'; ctx.lineWidth = 2;
    for (const c of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const px = x + c[0] * (s + o), py = y + c[1] * (s + o);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - c[0] * 11, py); ctx.moveTo(px, py); ctx.lineTo(px, py - c[1] * 11); ctx.stroke();
    }
    const ringCol = progress < 0.6 ? HUD.reward : HUD.warn;   // reward→warn as the lock matures
    ctx.strokeStyle = 'rgba(' + ringCol + ',0.85)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, base * 0.62, -Math.PI / 2, -Math.PI / 2 + progress * TWO_PI); ctx.stroke();
    ctx.fillStyle = 'rgba(' + HUD.warn + ',0.95)'; ctx.font = '11px ' + HUDFONT;
    ctx.fillText(t('hud.locking') + ' ' + Math.round(progress * 100) + '%', x, y + base * 0.62 + 14);
  }
  ctx.restore();
}
// §4b "being-locked-by-enemy" threat reticle. updateEnemy now sets e.aimingPlayer when a fighter/boss
// is aligned + in gun range (the same gate the gun-fire uses), so we have the per-enemy state to drive it.
// Draws a --warn (amber) bracket around screen centre that PULSES to read as "you are being targeted",
// plus a chevron toward the nearest aiming threat. Distinct colour from the player's own lock reticle
// (which is danger/red). Pulse is gated by prefersReducedMotion — a steady bracket still shows.
function drawThreatReticle(ctx, cx, cy, k, reduce) {
  // worst (nearest) enemy currently aiming at the player; iterate only ALIVE enemies so a dead/despawned
  // one can never leave a stale warning on screen
  let worst = null, wd = Infinity, count = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive || !e.aimingPlayer) continue;
    count++;
    const d = player.group.position.distanceToSquared(e.group.position);
    if (d < wd) { wd = d; worst = e; }
  }
  if (!count) return;

  // pulse 0..1 (suppressed to a steady value under reduced-motion — the warning itself still shows)
  const pulse = reduce ? 0.85 : 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 260));
  const r = 26 * k, len = 9 * k;
  ctx.save();
  ctx.strokeStyle = 'rgba(' + HUD.warn + ',' + pulse.toFixed(3) + ')';
  ctx.lineWidth = 2 * k;
  for (const c of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {   // four corner brackets framing the centre
    const px = cx + c[0] * r, py = cy + c[1] * r;
    ctx.beginPath();
    ctx.moveTo(px - c[0] * len, py); ctx.lineTo(px, py); ctx.lineTo(px, py - c[1] * len);
    ctx.stroke();
  }

  // chevron toward the nearest threat (screen-space direction to its projected position)
  if (worst) {
    const wp = projectPoint(worst.group.position);
    let dx = wp.x - cx, dy = wp.y - cy;
    if (wp.behind) { dx = -dx; dy = -dy; }   // off-screen behind: point the way you must turn
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m; dy /= m;
      const cxr = cx + dx * (r + 12 * k), cyr = cy + dy * (r + 12 * k);
      const ax = -dy, ay = dx, w = 6 * k, h = 9 * k;   // perpendicular for the chevron base
      ctx.fillStyle = 'rgba(' + HUD.warn + ',' + pulse.toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(cxr + dx * h, cyr + dy * h);
      ctx.lineTo(cxr + ax * w, cyr + ay * w);
      ctx.lineTo(cxr - ax * w, cyr - ay * w);
      ctx.closePath(); ctx.fill();
    }
  }

  // label (localized) under the bracket; show the threat count when more than one enemy is aiming
  ctx.fillStyle = 'rgba(' + HUD.warn + ',0.95)';
  ctx.font = 'bold ' + (11 * k) + 'px ' + HUDFONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⚠ ' + t('hud.threat') + (count > 1 ? ' ×' + count : ''), cx, cy + r + 16 * k);
  ctx.restore();
}

// RWR-style inbound missile warning: spikes point toward each active inbound missile,
// pulse rate scales with proximity. Only shown for undecoyed enemy missiles.
function drawMissileWarning(ctx, cx, cy, k, reduce) {
  let count = 0, nearest = null, nearestDist = Infinity;
  for (let i = 0; i < missiles.length; i++) {
    const m = missiles[i];
    if (!m.enemy || m.decoyed) continue;
    count++;
    const d = player.group.position.distanceTo(m.mesh.position);
    if (d < nearestDist) { nearestDist = d; nearest = m; }
  }
  if (!count) return;

  const fast = nearestDist < 380;
  const pulse = reduce ? 0.9 : 0.65 + 0.35 * Math.abs(Math.sin(performance.now() / (fast ? 90 : 210)));
  const r = 46 * k;
  ctx.save();

  // thin danger ring
  ctx.strokeStyle = 'rgba(' + HUD.danger + ',' + (pulse * 0.38).toFixed(3) + ')';
  ctx.lineWidth = 1 * k;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TWO_PI); ctx.stroke();

  // one spike per inbound missile (cap at 8 for readability)
  ctx.lineWidth = 1.8 * k;
  let drawn = 0;
  for (let i = 0; i < missiles.length && drawn < 8; i++) {
    const m = missiles[i];
    if (!m.enemy || m.decoyed) continue;
    drawn++;
    const mp = projectPoint(m.mesh.position);
    let dx = mp.x - cx, dy = mp.y - cy;
    if (mp.behind) { dx = -dx; dy = -dy; }
    const mlen = Math.hypot(dx, dy); if (mlen < 1) continue;
    dx /= mlen; dy /= mlen;
    const spikeLen = 11 * k;
    ctx.strokeStyle = 'rgba(' + HUD.danger + ',' + pulse.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(cx + dx * r, cy + dy * r);
    ctx.lineTo(cx + dx * (r + spikeLen), cy + dy * (r + spikeLen));
    ctx.stroke();
    // arrowhead
    const ax = -dy, ay = dx, hw = 3.5 * k, hl = 5.5 * k;
    ctx.fillStyle = 'rgba(' + HUD.danger + ',' + pulse.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(cx + dx * (r + spikeLen + hl), cy + dy * (r + spikeLen + hl));
    ctx.lineTo(cx + dx * (r + spikeLen) + ax * hw, cy + dy * (r + spikeLen) + ay * hw);
    ctx.lineTo(cx + dx * (r + spikeLen) - ax * hw, cy + dy * (r + spikeLen) - ay * hw);
    ctx.closePath(); ctx.fill();
  }

  // label: MSL ×N  dist
  ctx.fillStyle = 'rgba(' + HUD.danger + ',' + pulse.toFixed(3) + ')';
  ctx.font = 'bold ' + (10 * k) + 'px ' + HUDFONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const distLabel = Math.round(nearestDist);
  ctx.fillText('◆ MSL' + (count > 1 ? ' \xD7' + count : '') + '  ' + distLabel, cx, cy + r + 14 * k);
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
    ctx.strokeStyle = 'rgba(' + HUD.danger + ',' + (locked || isNear ? 1 : 0.82) + ')'; ctx.lineWidth = locked ? 2.4 : 1.6;
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(' + HUD.danger + ',0.5)'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TWO_PI); ctx.fill();
    ctx.restore(); ctx.lineWidth = 2;
    return;
  }

  // enemy markers share --danger; boss keeps its identity magenta; rival --rival; elite --reward; bomber/ground keep distinct ambers
  const col = boss ? HUD.boss : e.rival ? HUD.rival : e.type === 'bomber' ? '255,176,96' : e.elite ? HUD.reward : grd ? '255,165,55' : HUD.danger;

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
    ctx.fillStyle = hpFrac > 0.5 ? 'rgba(' + HUD.ok + ',0.9)' : hpFrac > 0.25 ? 'rgba(' + HUD.reward + ',0.9)' : 'rgba(' + HUD.danger + ',0.95)';
    ctx.fillRect(bx, by, bw * hpFrac, 3);
    ctx.fillStyle = 'rgba(' + col + ',0.95)'; ctx.font = '11px ' + HUDFONT;
    ctx.fillText(dist >= 1000 ? (dist / 1000).toFixed(1) + t('hud.km') : Math.round(dist) + t('hud.m'), x, y + s + 12);
    if (boss) { ctx.fillStyle = 'rgba(' + HUD.boss + ',0.95)'; ctx.font = 'bold 12px ' + HUDFONT; ctx.fillText(t('hud.boss'), x, by - 8); }
    else if (e.type === 'bomber') { ctx.fillStyle = 'rgba(255,176,96,1)'; ctx.font = 'bold 12px ' + HUDFONT; ctx.fillText(t('hud.bomber'), x, by - 8); }
    else if (e.rival) { ctx.fillStyle = 'rgba(' + HUD.rival + ',1)'; ctx.font = 'bold 12px ' + HUDFONT; ctx.fillText('\u2620 ' + e.callsign + ' \u00b7 ' + e.aceName + ' \u00b7 ' + t('hud.lv') + rival.level, x, by - 8); }
    else if (e.elite) { ctx.fillStyle = 'rgba(' + HUD.reward + ',1)'; ctx.font = 'bold 12px ' + HUDFONT; ctx.fillText('\u2605 ' + (e.callsign || t('hud.ace')) + (e.aceName ? ' \u00b7 ' + e.aceName : ''), x, by - 8); }
    else if (e.callsign) { ctx.fillStyle = 'rgba(' + HUD.danger + ',0.85)'; ctx.font = '10px ' + HUDFONT; ctx.fillText(e.callsign, x, by - 8); }
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
  ctx.fillStyle = 'rgba(255,185,56,0.07)';
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fill();

  // rings + crosshair
  ctx.strokeStyle = 'rgba(255,185,56,0.22)'; ctx.lineWidth = 1;
  for (let r = R / 3; r <= R + 0.5; r += R / 3) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TWO_PI); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();

  // sweep
  const sweep = (performance.now() * 0.0011) % TWO_PI;
  const grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweep - Math.PI / 2) * R, cy + Math.sin(sweep - Math.PI / 2) * R);
  grad.addColorStop(0, 'rgba(255,185,56,0.5)'); grad.addColorStop(1, 'rgba(255,185,56,0)');
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
    if (ring) { ctx.strokeStyle = 'rgba(' + HUD.reward + ',0.95)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X, Y, sz + 3, 0, TWO_PI); ctx.stroke(); }
  }
  // v1.3 stealth: detection rings on the scope so the safe lane is readable at a glance (under the blips)
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive || !e.stealthThreat || !e.detectR) continue;
    const dx = e.group.position.x - player.group.position.x, dz = e.group.position.z - player.group.position.z;
    const ahead = dx * Fx + dz * Fz, right = dx * Rx + dz * Rz;
    const X = cx + right / range * R, Y = cy - ahead / range * R, rr = e.detectR / range * R;
    const blown = (typeof stealthBlown !== 'undefined' && stealthBlown);
    ctx.fillStyle = blown ? 'rgba(255,70,70,0.14)' : 'rgba(255,162,58,0.16)';
    ctx.beginPath(); ctx.arc(X, Y, rr, 0, TWO_PI); ctx.fill();
    ctx.strokeStyle = blown ? 'rgba(255,70,70,0.7)' : 'rgba(255,162,58,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(X, Y, rr, 0, TWO_PI); ctx.stroke();
  }
  // radar contacts mirror the marker roles: boss magenta, rival --rival, elite --reward, drone/fighter --danger
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive || e.isInCloud) continue;
    const rdx = e.group.position.x - player.group.position.x, rdz = e.group.position.z - player.group.position.z;
    if (detR < 6500 && rdx * rdx + rdz * rdz > detR2) continue;   // weather/night only: drop contacts beyond the reduced detection range (clear day = unchanged)
    const lk = player.lockedTarget === e;
    if (e.type === 'boss') plot(e.group.position, 255, 80, 220, 5, false, lk);
    else if (e.rival) plot(e.group.position, 255, 90, 42, 4, false, lk);
    else if (e.type === 'bomber') plot(e.group.position, 255, 176, 96, 5, false, lk);
    else if (e.type === 'drone') plot(e.group.position, 255, 57, 75, 3, false, lk);
    else if (e.elite) plot(e.group.position, 255, 225, 77, 4, false, lk);
    else if (e.type === 'ground') plot(e.group.position, 255, 165, 55, 4, true, lk);
    else plot(e.group.position, 255, 57, 75, 4, false, lk);
  }
  for (let i = 0; i < missiles.length; i++) if (missiles[i].enemy) plot(missiles[i].mesh.position, 255, 255, 255, 2);
  for (let i = 0; i < wingmen.length; i++) { if (wingmen[i].alive) plot(wingmen[i].group.position, 45, 255, 176, 4, true); }
  for (let i = 0; i < loots.length; i++) { const isC = loots[i].kind === 'crate'; plot(loots[i].mesh.position, 70, 255, 190, isC ? 4 : 3, isC); }
  ctx.fillStyle = '#ffb938'; ctx.beginPath();
  ctx.moveTo(cx, cy - 8); ctx.lineTo(cx - 6, cy + 6); ctx.lineTo(cx + 6, cy + 6); ctx.closePath(); ctx.fill();
}
