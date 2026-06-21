/* SKYSTRIKE — split from ui.js (god-file refactor). Global scope; load order among ui-*.js irrelevant, but all must load after deps and before controls.js/main.js. */
/* ui-hud.js: camera, projection, gunsight, HUD/radar canvas, DOM HUD, tutorial, banners. */
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
// Canvas HUD renderer (drawHUD + draw* family) → js/hud.js (loaded before this file).

/* ---------------- HUD canvas ---------------- */
// Canvas-HUD size multiplier driven by the global hudScale setting (Settings → UI size).
// World-projected x/y positions stay EXACT; only sizes (radii, fonts, line offsets) get ×k.
function hudK() { return (typeof hudScale === 'number') ? Math.max(0.6, Math.min(1.6, hudScale)) : 1; }
function spawnHitMarker() { hitMarkers.push({ t: 0.25 }); }
function spawnDamageNumber(pos, val, crit) { dmgNumbers.push({ pos: pos.clone(), val, life: crit ? 1.1 : 0.9, crit: !!crit }); }
// JUICE: count a number up to `target` over `ms`, formatting each frame via fmt(v)→string.
// Cancels any prior count-up on the same element (stored on el._cuRaf) so re-opens don't stack tweens.
function countUp(el, target, ms, fmt) {
  if (!el) return;
  if (el._cuRaf) cancelAnimationFrame(el._cuRaf);
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / ms);
    const eased = 1 - (1 - p) * (1 - p);   // ease-out
    el.textContent = fmt(target * eased);
    if (p < 1) el._cuRaf = requestAnimationFrame(step); else { el.textContent = fmt(target); el._cuRaf = 0; }
  };
  el._cuRaf = requestAnimationFrame(step);
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

/* ---------------- DOM HUD ---------------- */
let el = {};
function g(id) { return document.getElementById(id); }
function cacheEl() {
  el = {
    hudRoot: g('hud'), hp: g('hpfill'), thr: g('thrfill'), shd: g('shfill'), spd: g('spd'), alt: g('alt'),
    score: g('score'), wave: g('wave'), combo: g('combo'), tp: g('tp'),
    flares: g('flares'), missiles: g('missiles'), bullets: g('bullets'), special: g('special'), special2: g('special2'),
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
      el.tutSkip.addEventListener('click', () => { skipTutorial(); });
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
  // (barrel roll is now its own tutorial step — no parting tip banner; that double-taught it)
  setTimeout(() => { if (state === 'playing' && tutorial.done) returnToHangar(); }, 4000);
}
// Skip = abandon the tutorial and return to the hangar immediately (do NOT keep flying the tutorial waves).
// Latches tutorial.done so the start gate (ui-flow.js) won't relaunch it on the next mission.
function skipTutorial() {
  tutorial.active = false; tutorial.done = true;
  if (el.tut) el.tut.classList.remove('show');
  if (audio.on) audio.ui();
  if (typeof returnToHangar === 'function') returnToHangar();
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
// v1.3 loading curtain: an opaque overlay shown during a flight-to-flight arena swap so the player never
// glimpses the previous mission's terrain/weather. showLoading() raises it instantly; hideLoading() holds
// it briefly (so the freshly-built arena paints underneath) then fades it out.
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
    ls.classList.add('fading');   // CSS transitions opacity → 0
    _loadingHideT = setTimeout(() => { ls.classList.remove('show', 'fading'); _loadingHideT = null; }, 420);
  }, 450);
}
// Mission intro CARD (§2): center-screen at sector/mission start — mission-type name + mechanical
// description + the per-level lore blurb. FIRST time a type is seen (seenMissionType_<verb> in storage)
// the card is interactive and persists until the player taps/clicks/keys to dismiss; REPEAT encounters
// auto-dismiss after 5s (ticked in updateDom) but still show the blurb so context isn't lost.
let missionCardT = 0;   // >0 = repeat auto-dismiss countdown (s); 0 = idle or persistent (first-time)
function showMissionCard(verb, blurbKey) {
  const card = g('missionCard');
  if (!card || !verb) return;
  const nameStr = t('mission.name.' + verb), descStr = t('mission.desc.' + verb);
  const ti = g('missionCardTitle'); if (ti) ti.textContent = (nameStr !== 'mission.name.' + verb) ? nameStr : verb;
  const de = g('missionCardDesc'); if (de) de.textContent = (descStr !== 'mission.desc.' + verb) ? descStr : '';
  // §1: the 2-paragraph mission lore now lives on the pre-launch briefing screen; the in-flight card stays a
  // concise objective + how-to (mission.desc.<verb>) only — drop the lore blurb here. blurbKey kept for back-compat.
  const be = g('missionCardBlurb'); if (be) { be.textContent = ''; be.style.display = 'none'; }
  let firstTime = false;
  const seenKey = 'skystrike_seenMissionType_' + verb;
  try { firstTime = !store.get(seenKey); } catch (e) {}
  const hi = g('missionCardHint'); if (hi) { hi.textContent = t('card.tapContinue'); hi.style.display = firstTime ? '' : 'none'; }
  card.classList.add('show');
  if (firstTime) {
    try { store.set(seenKey, '1'); } catch (e) {}
    missionCardT = 0;                     // persistent — dismiss on the next user input
    card.classList.add('interactive');    // capture pointer events so the tap dismisses instead of flying the jet
    const onInput = () => { dismissMissionCard(); window.removeEventListener('pointerdown', onInput, true); window.removeEventListener('keydown', onInput, true); };
    window.addEventListener('pointerdown', onInput, true);
    window.addEventListener('keydown', onInput, true);
  } else {
    card.classList.remove('interactive'); // non-blocking reminder; flying continues underneath
    missionCardT = 5;                     // repeat encounter: auto-dismiss after 5s
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
  const now = performance.now() / 1000;
  const chip = (key, cntId, costId) => {
    const rem = Math.max(0, (AWACS_USES_MAX[key] || 0) - ((awacsUses && awacsUses[key]) || 0));
    const c = g(cntId); if (c) c.textContent = '×' + rem;
    // AWACS is cooldown-gated, not RP-costed (balance 2026-06): the `<i>` shows the live cooldown
    // remaining (Ns) when on cooldown, else the call's cooldown length as a hint (e.g. "30s").
    const cd = AWACS_COOLDOWNS[key] || 0;
    const last = (awacsLast && awacsLast[key]) || 0;
    const left = last > 0 ? Math.max(0, cd - (now - last)) : 0;
    const k = g(costId); if (k) k.textContent = left > 0 ? Math.ceil(left) + 's' : cd + 's';
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
  const kt = Math.round(player.speed * 2.3);
  const altFt = Math.round(Math.max(0, player.group.position.y) * 3.28);
  const sd = speedDisplay(kt, unitSystem), ad = altDisplay(altFt, unitSystem);   // imperial(mph+ft) / metric(kph+m); labels via applyUnitLabels
  el.spd.textContent = sd.value;
  el.alt.textContent = ad.value;
  // INSTRUMENT SEAM: publish normalized flight state so per-skin CSS gauges (analog needles,
  // blueprint dials, flat arcs) render the same numbers the bl-panel readouts show. CSS derives
  // sweep angles from the *-frac via calc(); altimeter hands need real periodic angles, so we
  // hand those over precomputed. Set on the #hud root so it cascades to every instrument widget.
  if (el.hudRoot) {
    const s = el.hudRoot.style, m = instrumentState(kt, altFt, player.throttle);
    s.setProperty('--spd-kt', sd.value);   // legacy prop name; now carries the displayed speed in the active unit
    s.setProperty('--alt-ft', ad.value);   // legacy prop name; displayed altitude in the active unit
    s.setProperty('--spd-frac', m.spdFrac.toFixed(4));
    s.setProperty('--alt-frac', m.altFrac.toFixed(4));
    s.setProperty('--thr-frac', m.thrFrac.toFixed(4));
    s.setProperty('--spd-deg', m.spdDeg.toFixed(1) + 'deg');     // airspeed dial sweep ±120°
    s.setProperty('--thr-deg', m.thrDeg.toFixed(1) + 'deg');     // throttle arc ±135°
    s.setProperty('--alt-deg', m.altDeg.toFixed(1) + 'deg');     // altimeter hundreds hand
    s.setProperty('--alt-deg-k', m.altDegK.toFixed(1) + 'deg');  // altimeter thousands hand
  }
  el.score.textContent = player.score.toLocaleString();
  if (el.tp) { el.tp.textContent = Math.floor(player.tp).toLocaleString(); el.tp.style.color = player.tp >= 120 ? '#ffe14d' : ''; }
  el.wave.textContent = wave;
  // JUICE: combo chip scale-pops on each increment (reflow-retrigger pattern, like showBanner). _comboShown tracks the last drawn value.
  const comboTxt = player.combo > 1 ? 'x' + player.combo : '';
  if (comboTxt !== el.combo.textContent) {
    el.combo.textContent = comboTxt;
    if (player.combo > 1 && player.combo > (el._comboShown || 0)) { el.combo.classList.remove('pop'); void el.combo.offsetWidth; el.combo.classList.add('pop'); }
    el._comboShown = player.combo;
  }
  el.flares.textContent = player.flares;
  el.missiles.textContent = player.missiles;
  if (player.noCannon) { el.bullets.textContent = '\u2014'; el.bullets.style.color = '#6cf2c8'; }
  else { el.bullets.textContent = player.bullets; el.bullets.style.color = player.bullets <= 80 ? '#ff8c2b' : ''; }
  el.missiles.style.color = player.missiles <= 0 ? '#ff394b' : '';
  if (!hasSpecial(player.jet)) { el.special.textContent = t('hud.noSpecial'); el.special.classList.remove('ready'); }
  else if (player.special.cd <= 0) { el.special.textContent = jetText(player.jet, 'ability') + ' \u25B8 ' + t('hud.ready'); el.special.classList.add('ready'); }
  else { el.special.textContent = jetText(player.jet, 'ability') + ' \u25B8 ' + Math.ceil(player.special.cd) + t('hud.sec'); el.special.classList.remove('ready'); }
  { const tbS = g('tb-spc'); if (tbS) tbS.classList.toggle('ready', hasSpecial(player.jet) && player.special.cd <= 0); }  // touch: SPC button carries READY (desktop chip hidden on touch)
  // SLOT 2 chip (feature #3): hidden when nothing equipped, else mirrors the slot-1 name + READY/countdown.
  // The mobile SPC2 button mirrors the chip's visibility (only shown when something is equipped).
  if (el.special2) {
    const s2 = player.special2;
    const equipped = !!(s2 && s2.id);
    if (!equipped) { el.special2.style.display = 'none'; }
    else {
      el.special2.style.display = '';
      const j2 = JETS.find(j => j.id === s2.id);
      const nm = j2 ? jetText(j2, 'ability') : s2.id;
      if (s2.cd <= 0) { el.special2.textContent = nm + ' \u25B8 ' + t('hud.ready'); el.special2.classList.add('ready'); }
      else { el.special2.textContent = nm + ' \u25B8 ' + Math.ceil(s2.cd) + t('hud.sec'); el.special2.classList.remove('ready'); }
    }
    const tb2 = g('tb-spc2');
    if (tb2) { tb2.style.display = (equipped && isTouchEnabled) ? '' : 'none'; tb2.classList.toggle('ready', equipped && s2.cd <= 0); }
  }
  updateWingmanSidebar();
  tog(el.wStealth, player.stealth);
  tog(el.wHighG, player.highG);
  tog(el.wPull, player.gpws);
  tog(el.wMissile, missiles.some(m => m.enemy));
  tog(el.wDrone, enemies.some(e => e.alive && e.type === 'drone'));
  const lockedNow = !!(player.lockedTarget && player.lockedTarget.alive && player.lockProgress >= 1);
  const acquiringNow = !lockedNow && player.lockTarget && player.lockTarget.alive && player.lockProgress > 0.02;
  tog(el.wLock, lockedNow || acquiringNow);
  if (lockedNow) { el.wLock.textContent = t('hud.targetLocked'); el.wLock.style.color = '#ff394b'; }   /* --danger: LOCKED payoff */
  else if (acquiringNow) { el.wLock.textContent = t('hud.acquiring') + ' ' + Math.round(player.lockProgress * 100) + '%'; el.wLock.style.color = '#ffe14d'; }   /* --reward: lock building */
  el.hpbar.classList.toggle('low', player.hp / player.maxHp < 0.3);

  let boss = null;
  for (let i = 0; i < enemies.length; i++) { if (enemies[i].alive && enemies[i].type === 'boss') { boss = enemies[i]; break; } }
  if (boss) { el.bossbar.classList.add('show'); el.bossfill.style.width = clamp(boss.hp / boss.maxHp * 100, 0, 100) + '%'; }
  else el.bossbar.classList.remove('show');

  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.classList.remove('show'); }
  if (missionCardT > 0) { missionCardT -= dt; if (missionCardT <= 0) dismissMissionCard(); }   // §2 repeat-encounter card auto-dismiss

  const gforce = clamp((Math.abs(player.pitchRate) + Math.abs(player.rollRate) * 0.4) / (player.stats.turnRate * 2.1), 0, 1);
  let vig = gforce * 0.7; if (player.highG) vig = Math.max(vig, 0.92);
  if (player.slow > 0) vig = Math.max(vig, 0.55);   // bullet-time vignette
  el.vignette.style.opacity = vig.toFixed(3);
  el.dmg.style.opacity = clamp(player.damageFlash / 0.5, 0, 1).toFixed(3);
  if (empFlash > 0) { empFlash -= dt; el.flash.style.opacity = (empFlash * 0.5).toFixed(3); } else el.flash.style.opacity = '0';
  updateAwacsHud();
  const _pt = g('pilotTag');
  // show the pilot nameplate + emblem badge while flying; the emblem always shows (callsign text self-hides when empty via :empty)
  if (_pt) _pt.style.display = (state === 'playing' && !paused && meta) ? 'flex' : 'none';
}

