const pp1 = new THREE.Vector3(), pp2 = new THREE.Vector3(), pp3 = new THREE.Vector3();
const _hudIp = new THREE.Vector3();   // hudViewState's gun lead point (read by drawHUD later the same frame)
const _hudGun = { target: null, interceptPoint: null }, _hudView = { k: 1, gun: null, kt: 0, altFt: 0, inst: null };   // reused per frame
function updateCamera(dt) {
  const p = player.group, fwd = fwdOf(p, t1);
  const trackCam = mouseRight && player.lockedTarget && player.lockedTarget.alive;
  const lookBack = down('KeyV') && !trackCam;
  const lbChanged = lookBack !== player._lbPrev;     // snap on transitions (don't sweep through the jet)
  player._lbPrev = lookBack;

  if (camMode === 2) {
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
    p.visible = true;
    const off = camMode === 0 ? t2.set(0, 7.5, 27) : t2.set(0, 4.6, 15);
    if (lookBack) { off.z = -off.z * 0.82; off.y *= 0.8; }
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
  camera.updateMatrixWorld();   // Camera.updateMatrixWorld also refreshes matrixWorldInverse
}
function cycleCamera() { camMode = (camMode + 1) % 3; audio.ui(); showBanner(tf('banner.cam', { name: t('cam.' + CAM_NAMES[camMode]) })); }

// `out` (optional) is filled and returned instead of a fresh {x,y,behind} — hot per-frame loops pass one.
function projectPoint(pos, out) {
  pp1.copy(pos).project(camera);
  pp2.copy(pos).sub(camera.position);
  pp3.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const o = out || {};
  o.x = (pp1.x * 0.5 + 0.5) * W; o.y = (-pp1.y * 0.5 + 0.5) * H; o.behind = pp2.dot(pp3) < 0;
  return o;
}

function pickGunTarget() {
  const fwd = fwdOf(player.group, t3), pp = player.group.position;
  let best = null, bestScore = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]; if (!e.alive) continue;
    const to = t4.copy(e.group.position).sub(pp);
    const dist = to.length();
    if (dist < 1 || dist > 2600) continue;
    const ang = fwd.dot(to) / dist;
    if (ang < 0.5) continue;
    const score = dist * (1.7 - ang);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

// Canvas-HUD size multiplier driven by the global hudScale setting (Settings → UI size).
// World-projected x/y positions stay EXACT; only sizes (radii, fonts, line offsets) get ×k.
function hudK() { return clamp(hudScale, 0.6, 1.6); }
function spawnHitMarker() { hitMarkers.push({ t: 0.25 }); }
function spawnDamageNumber(pos, val, crit) { dmgNumbers.push({ pos: pos.clone(), val, life: crit ? 1.1 : 0.9, crit: !!crit }); }
// Cancels any prior count-up on the same element (stored on el._cuRaf) so re-opens don't stack tweens.
function countUp(el, target, ms, fmt) {
  if (!el) return;
  if (el._cuRaf) cancelAnimationFrame(el._cuRaf);
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / ms);
    const eased = 1 - (1 - p) * (1 - p);
    el.textContent = fmt(target * eased);
    if (p < 1) el._cuRaf = requestAnimationFrame(step); else { el.textContent = fmt(target); el._cuRaf = 0; }
  };
  el._cuRaf = requestAnimationFrame(step);
}

function weatherLabel() {
  const night = timeOfDay === 2, wt = weather.type;
  if (wt === 'clear' && !night) return '';
  let s = wt !== 'clear' ? t('weather.' + wt) : '';
  if (night) s = s ? (s + ' · ' + t('weather.night')) : t('weather.night');
  return s;
}

/* ---------------- per-frame HUD view-model ----------------
   ONE presentation model, assembled at the top of each HUD frame (main.js animate) and handed to
   BOTH adapters — the canvas renderer (drawHUD, via a param) and the DOM renderer (updateDom, via a
   param). It owns the numbers that used to be recomputed on drift-prone paths (canvas / DOM readout /
   per-skin CSS gauges) PLUS the two helpers the canvas adapter used to reach SIDEWAYS into this file
   for (hudK / pickGunTarget). Compute once, read everywhere → the surfaces cannot diverge.
     k          — canvas-HUD scale (hudK's value; 0.6–1.6)
     gun        — gun-lead solution { target, interceptPoint } or null (null ⇒ draw no pipper)
     kt / altFt — displayed airspeed (kt) + altitude (ft): the shared flight numbers
     inst       — instrumentState(kt, altFt, throttle): gauge fracs + pre-clamped needle angles (core.js) */
function hudViewState() {
  let gun = null;
  if (gunLead && !player.noCannon) {
    const e = pickGunTarget();
    if (e) {
      const S = 1400 * (player.bulletSpeedMul || 1);
      const relV = t1.copy(e.vel || ZERO).addScaledVector(player.vel, -0.9);
      const ip = interceptPoint(player.group.position, e.group.position, relV, S, _hudIp) || _hudIp.copy(e.group.position);
      gun = _hudGun; gun.target = e; gun.interceptPoint = ip;   // ip is module scratch, detached from the live mesh position
    }
  }
  const v = _hudView;
  v.k = hudK(); v.gun = gun;
  v.kt = Math.round(player.speed * 2.3);
  v.altFt = Math.round(Math.max(0, player.group.position.y) * 3.28);
  v.inst = instrumentState(v.kt, v.altFt, player.throttle);
  return v;
}

let el = {};
function g(id) { return document.getElementById(id); }
function isShown(id) { const e = g(id); return !!e && e.classList.contains('show'); }
function cacheEl() {
  el = {
    hudRoot: g('hud'), hp: g('hpfill'), thr: g('thrfill'), shd: g('shfill'), spd: g('spd'), alt: g('alt'),
    score: g('score'), wave: g('wave'), combo: g('combo'), tp: g('tp'),
    flares: g('flares'), missiles: g('missiles'), bullets: g('bullets'), special: g('special'), special2: g('special2'),
    hpbar: g('hpbar'), banner: g('banner'), sidebar: g('wingSidebar'),
    wPull: g('w_pull'), wMissile: g('w_missile'), wHighG: g('w_highg'), wStealth: g('w_stealth'), wLock: g('w_lock'), wDrone: g('w_drone'),
    vignette: g('vignette'), dmg: g('dmg'), flash: g('flash'),
    bossbar: g('bossbar'), bossfill: g('bossfill'),
    abIndicator: g('abIndicator'), heatBar: g('heatBar'), heatLbl: g('lblHeat'),
    tut: g('tutorial'), tutCard: g('tutCard'), tutArrow: g('tutArrow'),
    tutStep: g('tutStep'), tutText: g('tutText'), tutSkip: g('tutSkip'),
    lblWave: g('lblWave'), tbSpc: g('tb-spc'), tbSpc2: g('tb-spc2'), touch: g('touchControls'), pilotTag: g('pilotTag'),
    bossLabel: document.querySelector('#bossbar .bosslabel'),
  };
}
function tog(e, on) { e.classList.toggle('show', !!on); }
// Change-guarded DOM writes for the per-frame HUD: most values repeat frame to frame, and an unguarded
// textContent/style write still invalidates style/layout. The last written value is cached on the node.
function putText(e, v) { v = '' + v; if (e._t !== v) { e._t = v; e.textContent = v; } }
function putStyle(e, p, v) { const k = '_s_' + p; if (e[k] !== v) { e[k] = v; e.style[p] = v; } }
function putVar(e, p, v) { const k = '_v' + p; if (e[k] !== v) { e[k] = v; e.style.setProperty(p, v); } }

function tutStepKey(step) {
  const base = TUTORIAL_STEPS[step];
  if (!base) return 'tut.done';
  return isTouchEnabled ? ('tut.' + base + 'Touch') : ('tut.' + base);
}
function tutArrowTarget(step) {
  if (TUTORIAL_STEPS[step] === 'throttle') return el.thr && el.thr.parentElement;
  if (TUTORIAL_STEPS[step] === 'missile') return el.missiles;
  return null;
}
function placeTutArrow(target) {
  const a = el.tutArrow;
  if (!a) return;
  if (!target) { a.classList.remove('show'); return; }
  const r = target.getBoundingClientRect();
  if (!r.width && !r.height) { a.classList.remove('show'); return; }
  const cx = r.left + r.width / 2;
  const above = r.top > 46;
  a.classList.toggle('up', !above);
  a.style.left = cx + 'px';
  a.style.top = (above ? r.top - 26 : r.bottom + 6) + 'px';
  a.classList.add('show');
}
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
  tutorial.prevShots = run.shots || 0;
  tutorial.prevMissiles = run.missiles || 0;
  if (el.tutSkip) {
    el.tutSkip.textContent = t('tut.skip');
    if (!el.tutSkip._wired) {
      el.tutSkip._wired = true;
      el.tutSkip.addEventListener('click', skipTutorial);
    }
  }
  renderTutorial();
}
// tear down: latch done, hide overlay. Persistence is shared with onboarding (skystrike_onboarded
// is already set once a new player clears the controls brief) — no extra storage key.
function endTutorial() {
  tutorial.active = false; tutorial.done = true;
  if (el.tut) el.tut.classList.remove('show');
}
function finishTutorial() {
  endTutorial();
  showBanner(t('tut.done'));
  setTimeout(() => { if (state === 'playing' && tutorial.done) returnToHangar(); }, 4000);
}
// Skip = abandon the tutorial and return to the hangar immediately (do NOT keep flying the tutorial waves).
// Latches tutorial.done so the start gate (ui-flow.js) won't relaunch it on the next mission.
function skipTutorial() {
  endTutorial();
  audio.ui();
  returnToHangar();
}
function advanceTutorial(event) {
  if (!tutorial.active || tutorial.done) return;
  const next = tutorialNext(tutorial.step, event);
  if (next === tutorial.step) return;
  tutorial.step = next;
  if (next >= TUTORIAL_DONE) { finishTutorial(); return; }
  audio.ui();
  renderTutorial();
}

let bannerT = 0;
// restart a CSS animation: drop the class, force a reflow, re-add it
function replayClass(e, cls) { e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls); }
function showBanner(txt) { el.banner.textContent = txt; replayClass(el.banner, 'show'); bannerT = 2.0; }
let _loadingHideT = null;
function showLoading() {
  const ls = g('loadingScreen'); if (!ls) return;
  if (_loadingHideT) { clearTimeout(_loadingHideT); _loadingHideT = null; }
  ls.classList.remove('fading'); ls.classList.add('show');
}
function hideLoading() {
  const ls = g('loadingScreen'); if (!ls) return;
  if (_loadingHideT) clearTimeout(_loadingHideT);
  _loadingHideT = setTimeout(() => {
    ls.classList.add('fading');
    _loadingHideT = setTimeout(() => { ls.classList.remove('show', 'fading'); _loadingHideT = null; }, 420);
  }, 450);
}
let missionCardT = 0;
function showMissionCard(verb, blurbKey) {
  const card = g('missionCard');
  if (!card || !verb) return;
  const nameStr = t('mission.name.' + verb), descStr = t('mission.desc.' + verb);
  const ti = g('missionCardTitle'); if (ti) ti.textContent = (nameStr !== 'mission.name.' + verb) ? nameStr : verb;
  const de = g('missionCardDesc'); if (de) de.textContent = (descStr !== 'mission.desc.' + verb) ? descStr : '';
  const be = g('missionCardBlurb'); if (be) { be.textContent = ''; be.style.display = 'none'; }
  let firstTime = false;
  const seenKey = 'skystrike_seenMissionType_' + verb;
  try { firstTime = !store.get(seenKey); } catch (e) {}
  const hi = g('missionCardHint'); if (hi) { hi.textContent = t('card.tapContinue'); hi.style.display = firstTime ? '' : 'none'; }
  card.classList.add('show');
  if (firstTime) {
    try { store.set(seenKey, '1'); } catch (e) {}
    missionCardT = 0;
    card.classList.add('interactive');    // capture pointer events so the tap dismisses instead of flying the jet
    const onInput = () => { dismissMissionCard(); window.removeEventListener('pointerdown', onInput, true); window.removeEventListener('keydown', onInput, true); };
    window.addEventListener('pointerdown', onInput, true);
    window.addEventListener('keydown', onInput, true);
  } else {
    card.classList.remove('interactive');
    missionCardT = 5;
  }
}
function dismissMissionCard() {
  const card = g('missionCard');
  if (card) { card.classList.remove('show'); card.classList.remove('interactive'); }
  missionCardT = 0;
}

function updateWingmanSidebar() {
  if (!el.sidebar) return;
  if (!wingmen.length) { el.sidebar.classList.remove('visible'); return; }
  el.sidebar.classList.add('visible');
  // F3 wingman-wheel: active flight-ORDER badge — a persistent child 0 (wingman rows follow at 1..n), patched
  // in place and excluded from the count-driven row rebuild below. Order read from player.wingOrder (|| FREE).
  let badge = el.sidebar.firstElementChild;
  if (!badge || badge.className !== 'wing-order') {
    badge = document.createElement('div'); badge.className = 'wing-order';
    el.sidebar.insertBefore(badge, el.sidebar.firstChild);
  }
  const ord = player.wingOrder || 'FREE';
  putText(badge, '◆ ' + t('wing.order.' + ord.toLowerCase()));
  putStyle(badge, 'color', ord === 'ENGAGE' ? '#ff6a4d' : ord === 'COVER' ? '#ffd24d' : ord === 'REGROUP' ? '#6cc8ff' : '#7dffcf');
  // Rebuild wingman rows only when the count changes; otherwise just patch text/style. (Badge is child 0.)
  if (el.sidebar.children.length - 1 !== wingmen.length) {
    while (el.sidebar.children.length > 1) el.sidebar.removeChild(el.sidebar.lastChild);
    for (let i = 0; i < wingmen.length; i++) {
      const row = document.createElement('div');
      row.innerHTML = '<div class="wn"></div><div class="ws"></div><div class="whb"><div class="whf"></div></div>';
      el.sidebar.appendChild(row);
    }
  }
  for (let i = 0; i < wingmen.length; i++) {
    const w = wingmen[i], row = el.sidebar.children[i + 1];
    const cls = 'wing-row' + (w.cca ? ' cca' : '') + (!w.alive ? ' down' : '');
    if (row.className !== cls) row.className = cls;
    const hp = w.alive ? clamp(w.hp / w.maxHp * 100, 0, 100) : 0;
    let sub;
    if (w.cca) sub = (w.jetName || '?') + ' · ' + t('hud.exp') + ' ' + Math.max(0, Math.ceil(w.expire || 0)) + t('hud.sec');
    else if (!w.alive) sub = t('hud.rtb') + ' ' + Math.max(0, Math.ceil(w.rtb)) + t('hud.sec');
    else sub = (w.jetName || '?') + (w.flares != null ? ' · ★' + w.flares : '');
    putText(row.children[0], w.name);
    putText(row.children[1], sub);
    putStyle(row.children[2].children[0], 'width', hp.toFixed(1) + '%');
  }
}
function updateAwacsHud() {
  const box = g('awacsHud'); if (!box) return;
  const show = state === 'playing' && !paused;
  putStyle(box, 'display', show ? 'flex' : 'none');
  if (!show) return;
  const now = performance.now() / 1000;
  for (const [key, id] of AWACS_CHIPS) {
    const rem = Math.max(0, (AWACS_USES_MAX[key] || 0) - (awacsUses[key] || 0));
    const c = g('awacsUses' + id); if (c) putText(c, '×' + rem);
    const cd = AWACS_COOLDOWNS[key] || 0, last = awacsLast[key] || 0;
    const left = last > 0 ? Math.max(0, cd - (now - last)) : 0;
    const k = g('awacsCost' + id); if (k) putText(k, left > 0 ? Math.ceil(left) + 's' : cd + 's');
  }
}
const AWACS_CHIPS = [['strike', 'Strike'], ['resupply', 'Resupply'], ['jam', 'Jam']];
function specialChipText(jet, st) {
  if (!hasSpecial(jet)) return t('hud.noSpecial');
  return jetText(jet, 'ability') + ' \u25B8 ' + (st.cd <= 0 ? t('hud.ready') : Math.ceil(st.cd) + t('hud.sec'));
}
function updateDom(dt, hudView) {
  putStyle(el.hp, 'width', clamp(player.hp / player.maxHp * 100, 0, 100).toFixed(1) + '%');
  putStyle(el.shd, 'width', clamp(player.shield / player.maxShield * 100, 0, 100).toFixed(1) + '%');
  putStyle(el.thr, 'width', clamp(player.throttle * 100, 0, 100).toFixed(1) + '%');
  putStyle(el.abIndicator, 'display', (player.throttle > 0.85 || player.overdrive > 0) ? 'inline-block' : 'none');
  const kt = hudView.kt, altFt = hudView.altFt;
  const sd = speedDisplay(kt, unitSystem), ad = altDisplay(altFt, unitSystem);
  putText(el.spd, sd.value);
  putText(el.alt, ad.value);
  // INSTRUMENT SEAM: publish normalized flight state so per-skin CSS gauges (analog needles,
  // blueprint dials, flat arcs) render the same numbers the bl-panel readouts show. CSS derives
  // sweep angles from the *-frac via calc(); altimeter hands need real periodic angles, so we
  // hand those over precomputed. Set on the #hud root so it cascades to every instrument widget.
  if (el.hudRoot) {
    const m = hudView.inst;
    const r = el.hudRoot;
    putVar(r, '--spd-frac', m.spdFrac.toFixed(3));
    putVar(r, '--alt-frac', m.altFrac.toFixed(3));
    putVar(r, '--spd-deg', m.spdDeg.toFixed(1) + 'deg');
    putVar(r, '--thr-deg', m.thrDeg.toFixed(1) + 'deg');
    putVar(r, '--alt-deg', m.altDeg.toFixed(1) + 'deg');
    putVar(r, '--alt-deg-k', m.altDegK.toFixed(1) + 'deg');
  }
  putText(el.score, player.score.toLocaleString());
  if (el.tp) { putText(el.tp, Math.floor(player.tp).toLocaleString()); putStyle(el.tp, 'color', player.tp >= 120 ? '#ffe14d' : ''); }
  if (campaignMode && missionSeq) { putText(el.wave, (missionSeq.idx + 1) + '/' + missionSeq.phases.length); putText(el.lblWave, t('hud.phase')); }
  else { putText(el.wave, wave); putText(el.lblWave, t('hud.wave')); }
  const comboTxt = player.combo > 1 ? 'x' + player.combo : '';
  if (comboTxt !== el.combo.textContent) {
    el.combo.textContent = comboTxt;
    if (player.combo > 1 && player.combo > (el._comboShown || 0)) replayClass(el.combo, 'pop');
    el._comboShown = player.combo;
  }
  putText(el.flares, player.flares);
  putText(el.missiles, player.missiles);
  if (player.noCannon) { putText(el.bullets, '\u2014'); putStyle(el.bullets, 'color', '#6cf2c8'); }
  else { putText(el.bullets, player.bullets); putStyle(el.bullets, 'color', player.bullets <= 80 ? '#ff8c2b' : ''); }
  putStyle(el.missiles, 'color', player.missiles <= 0 ? '#ff394b' : '');
  if (el.heatBar) {
    if (player.noCannon) putStyle(el.heatBar, 'display', 'none');
    else {
      const heat = clamp(player.gunHeat || 0, 0, 1), locked = !!player.gunLocked;
      putStyle(el.heatBar, 'display', '');
      putVar(el.heatBar, '--heat', heat.toFixed(3));
      putVar(el.heatBar, '--rearm', '' + HEAT.rearm);
      el.heatBar.classList.toggle('warm', heat > 0.55 && heat <= 0.82);
      el.heatBar.classList.toggle('hot', heat > 0.82);
      el.heatBar.classList.toggle('locked', locked);
      const lbl = t(locked ? 'hud.overheat' : 'hud.gunHeat');
      if (el.heatLbl && el.heatLbl.textContent !== lbl) el.heatLbl.textContent = lbl;
    }
  }
  putText(el.special, specialChipText(player.jet, player.special));
  el.special.classList.toggle('ready', hasSpecial(player.jet) && player.special.cd <= 0);
  if (el.tbSpc) el.tbSpc.classList.toggle('ready', hasSpecial(player.jet) && player.special.cd <= 0);
  if (el.special2) {
    const s2 = player.special2;
    const equipped = !!(s2 && s2.id);
    putStyle(el.special2, 'display', equipped ? '' : 'none');
    if (equipped) {
      putText(el.special2, specialChipText(JETS.find(j => j.id === s2.id) || { ability: s2.id }, s2));
      el.special2.classList.toggle('ready', s2.cd <= 0);
    }
    const tb2 = el.tbSpc2;
    if (tb2) { putStyle(tb2, 'display', (equipped && isTouchEnabled) ? '' : 'none'); tb2.classList.toggle('ready', equipped && s2.cd <= 0); }
  }
  updateWingmanSidebar();
  if (el.touch) {
    el.touch.classList.toggle('no-wing', !firstAliveWingman());
  }
  tog(el.wStealth, player.stealth);
  tog(el.wHighG, player.highG);
  tog(el.wPull, player.gpws);
  tog(el.wMissile, player.incoming);
  let drone = false; for (let i = 0; i < enemies.length; i++) if (enemies[i].alive && enemies[i].type === 'drone') { drone = true; break; }
  tog(el.wDrone, drone);
  const lockedNow = !!(player.lockedTarget && player.lockedTarget.alive && player.lockProgress >= 1);
  const acquiringNow = !lockedNow && player.lockTarget && player.lockTarget.alive && player.lockProgress > 0.02;
  tog(el.wLock, lockedNow || acquiringNow);
  if (lockedNow) { putText(el.wLock, t('hud.targetLocked')); putStyle(el.wLock, 'color', '#ff394b'); }
  else if (acquiringNow) { putText(el.wLock, t('hud.acquiring') + ' ' + Math.round(player.lockProgress * 100) + '%'); putStyle(el.wLock, 'color', '#ffe14d'); }
  el.hpbar.classList.toggle('low', player.hp / player.maxHp < 0.3);

  let boss = null;
  for (let i = 0; i < enemies.length; i++) { if (enemies[i].alive && (enemies[i].type === 'boss' || enemies[i].campaignBoss)) { boss = enemies[i]; break; } }
  if (boss) {
    el.bossbar.classList.add('show'); putStyle(el.bossfill, 'width', clamp(boss.hp / boss.maxHp * 100, 0, 100).toFixed(1) + '%');
    const bl = el.bossLabel; if (bl) putText(bl, '◆ ' + (boss.campaignBoss ? boss.callsign + ' · ' + t('hud.phase') + ' ' + (boss.phase || 1) + '/3' : t('hud.boss')));
  }
  else el.bossbar.classList.remove('show');

  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.classList.remove('show'); }
  if (missionCardT > 0) { missionCardT -= dt; if (missionCardT <= 0) dismissMissionCard(); }
  tickComms(dt);
  if (missionIntroT > 0) { missionIntroT -= dt; if (missionIntroT <= 0) { const f = missionIntroAfter; hideMissionIntro(); if (f) f(); } }

  const gforce = clamp((Math.abs(player.pitchRate) + Math.abs(player.rollRate) * 0.4) / (player.stats.turnRate * 2.1), 0, 1);
  let vig = gforce * 0.7; if (player.highG) vig = Math.max(vig, 0.92);
  if (player.slow > 0) vig = Math.max(vig, 0.55);
  putStyle(el.vignette, 'opacity', vig.toFixed(2));
  putStyle(el.dmg, 'opacity', clamp(player.damageFlash / 0.5, 0, 1).toFixed(2));
  if (empFlash > 0) { empFlash -= dt; putStyle(el.flash, 'opacity', (empFlash * 0.5).toFixed(2)); } else putStyle(el.flash, 'opacity', '0');
  updateAwacsHud();
  if (el.pilotTag) putStyle(el.pilotTag, 'display', (state === 'playing' && !paused && meta) ? 'flex' : 'none');
}

const COMMS_TONE = { ovl: 'info', wing: 'ok', ally: 'ok', hq: 'primary', enemy: 'danger', boss: 'boss' };
let commsQ = [], commsCur = null, commsGap = 0;
function commsSpeaker(who) {
  if (who === 'wing') { for (let i = 0; i < wingmen.length; i++) if (wingmen[i].alive && !wingmen[i].cca && wingmen[i].name) return wingmen[i].name; }
  if (who === 'boss') { const lvl = currentCampaignLevel(); if (lvl && lvl.boss && lvl.boss.callsignKey) return t(lvl.boss.callsignKey); }
  return t('comms.who.' + who);
}
function radio(who, text, opts) {
  if (!text) return;
  opts = opts || {};
  const low = !!opts.low;
  if (low && commsQ.length >= 2) return;                    // don't let event chatter pile up behind story beats
  if (commsQ.length >= 5) commsQ.shift();
  commsQ.push({ who, text: String(text), low });
}
function radioKey(who, key, vars) {
  const cs = (meta && meta.callsign) || t('comms.defaultCs');
  const s = tf(key, Object.assign({ cs }, vars));
  if (!s || s === key) return;                               // missing string → stay silent rather than print a key
  radio(who, s, { low: key.indexOf('comms.gen.') === 0 });
}
function clearComms() {
  commsQ.length = 0; commsCur = null; commsGap = 0;
  const c = g('comms'); if (c) c.classList.remove('show');
}
function tickComms(dt) {
  const box = g('comms'); if (!box) return;
  if (!commsCur) {
    if (commsGap > 0) { commsGap -= dt; return; }
    if (!commsQ.length) return;
    commsCur = commsQ.shift(); commsCur.t = 0;
    commsCur.dur = Math.min(7, 2.2 + commsCur.text.length * 0.042);
    box.dataset.tone = COMMS_TONE[commsCur.who] || 'info';
    putText(g('commsWho'), commsSpeaker(commsCur.who));
    putText(g('commsText'), '');
    box.classList.add('show');
    audio.radio();
  }
  commsCur.t += dt;
  const n = prefersReducedMotion() ? commsCur.text.length : Math.min(commsCur.text.length, Math.floor(commsCur.t * 60));
  putText(g('commsText'), commsCur.text.slice(0, n));
  if (commsCur.t >= commsCur.dur) { commsCur = null; commsGap = 0.35; if (!commsQ.length) box.classList.remove('show'); }
}

let missionIntroT = 0, missionIntroAfter = null;
// run fn once the title card clears (now if none is up) — keeps the first objective callout off the card
function afterMissionIntro(fn) { if (missionIntroT > 0) missionIntroAfter = fn; else fn(); }
function showMissionIntro(op, idx, lvl) {
  const box = g('missionIntro'); if (!box || !op || !lvl) return;
  putText(g('miOp'), t(op.nameKey));
  putText(g('miNum'), tf('campaign.sectorN', { n: pad2(idx + 1) }) + '  ·  ' + t('campaign.type.' + lvl.type));
  putText(g('miName'), t(lvl.nameKey));
  putText(g('miCond'), [t(op.theaterKey), ...condLabel(lvl)].join('  ·  '));
  replayClass(box, 'show');
  missionIntroT = 3.8; missionIntroAfter = null;
}
function hideMissionIntro() { const box = g('missionIntro'); if (box) box.classList.remove('show'); missionIntroT = 0; missionIntroAfter = null; }

function showOutroStamp(win, reasonKey) {
  const box = g('outroStamp'); if (!box) return;
  box.classList.toggle('win', !!win); box.classList.toggle('fail', !win);
  putText(g('outroTitle'), t(win ? 'campaign.accomplished' : 'campaign.failed'));
  putText(g('outroReason'), reasonKey ? t(reasonKey) : '');
  replayClass(box, 'show');
  audio.stamp(!!win);
}
function hideOutroStamp() { const box = g('outroStamp'); if (box) box.classList.remove('show'); }
