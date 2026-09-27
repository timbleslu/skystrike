function renderKillBoard() {
  const list = g('rbList'); if (!list || !rival) return;
  list.innerHTML = rival.board.length
    ? rival.board.slice().reverse().map(b => '<div class="rb-row"><span>☠ ' + b.name + '</span><span>' + b.jetName + '</span><span>' + tf('hud.killRow', { lv: b.level, wv: b.wave }) + '</span></div>').join('')
    : '<div class="rb-empty">' + t('hangar.noRivals') + '</div>';
}
function updateAimStrengthVis() { const r = g('rowAimStrength'); if (r) r.style.display = aimAssist ? '' : 'none'; }
function buildHangar() {
  const dots = g('jetDots'); dots.innerHTML = '';
  JETS.forEach((j, i) => {
    const d = document.createElement('i'); d.title = jetText(j, 'name');
    d.addEventListener('click', () => selectJet(i));
    dots.appendChild(d);
  });
  g('jetPrev').addEventListener('click', () => cycleJet(-1));
  g('wpCancel').addEventListener('click', () => { closeWingPicker(); audio.ui(); });
  g('jetNext').addEventListener('click', () => cycleJet(1));
  // double-click the aircraft PREVIEW = shortcut for the SELECT CTA (same gated path, opens mode choice).
  // Scoped to the preview host so double-clicking a skin chip / buy button / select never launches.
  g('jetCard').addEventListener('dblclick', (e) => { if (e.target.closest('#jetPreview3D') && !e.target.closest('input')) openModeChoice(); });

  g('launch').addEventListener('click', () => openModeChoice());
  g('manualBtn').addEventListener('click', openManual);
  g('manualClose').addEventListener('click', closeManual);
  g('manualAbort').addEventListener('click', abortMission);
  const mnav = g('manNav'); if (mnav) mnav.addEventListener('click', e => { const b = e.target.closest('.mnavbtn'); if (b) showManualTab(b.dataset.tab); });
  const ssn = g('ssetNav'); if (ssn) ssn.addEventListener('click', e => { const b = e.target.closest('.ssetbtn'); if (b) { showSettingsSubtab(b.dataset.sset); audio.ui(); } });
  g('redeploy').addEventListener('click', redeployRun);
  const goH = g('goHangar'); if (goH) goH.addEventListener('click', returnToHangar);
  const td = g('techDeploy'); if (td) td.addEventListener('click', deployFromTech);
  const trr = g('techReroll'); if (trr) trr.addEventListener('click', rerollDraft);
  const tg = g('techgrid');
  if (tg) {
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
  g('modeEndless').addEventListener('click', () => { opMode = false; saveSettings(); openEndlessSetup(); });
  g('modeOperation').addEventListener('click', () => { opMode = true; saveSettings(); g('modeChoice').classList.remove('show'); openOperationsSelect(); });
  g('modeBack').addEventListener('click', () => { g('modeChoice').classList.remove('show'); audio.ui(); });
  g('endlessBack').addEventListener('click', () => { g('endlessSetup').classList.remove('show'); openModeChoice(); });
  g('endlessStart').addEventListener('click', () => { opMode = false; g('endlessSetup').classList.remove('show'); startGame(selectedJet); });
  const sv = g('setVol'); if (sv) { sv.value = Math.round(volume * 100); sv.addEventListener('input', () => { volume = sv.value / 100; audio.setMaster(muted ? 0 : volume); saveSettings(); }); }
  bindToggle('setInvert', 'invertY', invertY, false);
  bindToggle('setAutoLock', 'autoLock', autoLock);
  bindToggle('setWingman', 'startWingman', startWingman);
  const sdu = g('setDevUnlock'); if (sdu) { sdu.checked = devUnlockAll; sdu.addEventListener('change', () => { devUnlockAll = sdu.checked; audio.ui(); saveSettings(); renderJetCard(); }); }
  bindToggle('setDevUnlockLevels', 'devUnlockLevels', devUnlockLevels);
  syncDevPanel();
  const dpb = g('devUnlockBtn'), dpf = g('devPass'), dpd = g('devDeny');
  const tryDevUnlock = () => {
    if (!dpf) return;
    if (dpf.value === 'timbles') { devUnlocked = true; saveSettings(); if (dpd) dpd.hidden = true; dpf.value = ''; syncDevPanel(); audio.ui(); }
    else { if (dpd) dpd.hidden = false; audio.warn(); const dl = g('devLock'); if (dl) replayClass(dl, 'deny-shake'); }
  };
  if (dpb) dpb.addEventListener('click', tryDevUnlock);
  if (dpf) dpf.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tryDevUnlock(); } });
  bindToggle('setRival', 'rivalEnabled', rivalEnabled);
  bindToggle('setGroundWar', 'groundWar', groundWar);
  bindToggle('setGunLead', 'gunLead', gunLead);
  const saa = g('setAimAssist'); if (saa) { saa.checked = aimAssist; saa.addEventListener('change', () => { aimAssist = saa.checked; audio.ui(); saveSettings(); updateAimStrengthVis(); }); }
  bindRange('setAimStrength', 'aimStrength', aimStrength, 1);
  updateAimStrengthVis();
  const sm = g('setMute'); if (sm) { sm.checked = muted; sm.addEventListener('change', () => { muted = sm.checked; audio.setMaster(muted ? 0 : volume); saveSettings(); }); }
  bindRange('setSens', 'controlSensitivity', controlSensitivity, 100);
  // bindSeg still fires onChange (audio) + its own saveSettings (a harmless redundant write). mobileControl
  // stays bespoke — the 'motion' branch triggers the permission flow (enableMotionFlow).
  bindSeg('controlSchemeTog', 'cs', () => controlScheme, (v) => applySetting('controlScheme', v), () => audio.ui());
  bindSeg('mobileControlTog', 'mc', () => mobileControl, (v) => { mobileControl = v; if (v === 'motion') enableMotionFlow(); }, () => audio.ui());
  bindSeg('aggressionTog', 'ag', () => motionAggression, (v) => applySetting('motionAggression', v), () => audio.ui());
  bindSeg('btnLayoutTog', 'bl', () => buttonLayout, (v) => applySetting('buttonLayout', v), () => audio.ui());
  bindSeg('gfxQualityTog', 'gq', () => gfxQuality, (v) => applySetting('gfx', v), () => audio.ui());
  bindSeg('unitsTog', 'un', () => unitSystem, (v) => applySetting('unitSystem', v), () => audio.ui());
  const sh = g('setHaptics'); if (sh) { sh.checked = haptics; sh.addEventListener('change', () => { haptics = sh.checked; if (haptics) haptic(20); saveSettings(); }); }
  bindRange('setBtnOpacity', 'buttonOpacity', buttonOpacity, 100);
  const shs = g('setHudScale');
  if (shs) {
    shs.value = String(hudScale);
    shs.addEventListener('change', () => {
      hudScale = Math.max(0.6, Math.min(1.6, parseFloat(shs.value) || 1));
      applyHudScale();
      audio.ui();
      saveSettings();
    });
  }
  applyHudScale();
  const sus = g('setUiScale');
  if (sus) {
    // On touch (mobile), shift the UI-size options down a level + add a smaller floor — phone menus run dense.
    // Labels (XS..XL) stay; only the underlying scale VALUES change. Desktop keeps the original set.
    if ('ontouchstart' in window) {
      const mobileVals = ['0.5', '0.65', '0.8', '1', '1.15'];
      for (let i = 0; i < mobileVals.length && i < sus.options.length; i++) sus.options[i].value = mobileVals[i];
    }
    sus.value = String(uiScale);
    sus.addEventListener('change', () => {
      uiScale = Math.max(0.5, Math.min(1.6, parseFloat(sus.value) || 1));
      applyUiScale();
      audio.ui();
      saveSettings();
    });
  }
  applyUiScale();
  const storedSkin = store.get('skystrike_skin') || 'standard';
  const storedPalette = store.get('skystrike_palette') || 'amber';
  applySkin(storedSkin);
  applyPalette(storedPalette);
  buildSkinGallery(storedSkin);
  const spal = g('setPalette');
  if (spal) { spal.value = storedPalette; spal.addEventListener('change', () => { applyPalette(spal.value); audio.ui(); }); }
  const sem = g('setEnableMotion'); if (sem) sem.addEventListener('click', () => { mobileControl = 'motion'; enableMotionFlow(); audio.ui(); });
  const srec = g('setRecenter'); if (srec) srec.addEventListener('click', () => { recenterMotion(); audio.ui(); });
  installMotionStatus();
  syncControlSettingsUI();
  document.querySelectorAll('.langbtn').forEach(b => b.addEventListener('click', () => { if (LANG === b.dataset.lang) return; LANG = b.dataset.lang; saveSettings(); applyLang(); audio.ui(); }));
  applyLang();
  selectJet(selectedJet);
  updateBest();
  updateSpHud();
  renderKillBoard();
  const db = g('dailyBtn'); if (db) db.addEventListener('click', startDaily);
  refreshDailyEntry();
  const wb = g('weeklyBtn'); if (wb) wb.addEventListener('click', startWeekly);
  refreshWeeklyEntry();
  const brb = g('bossRushBtn'); if (brb) brb.addEventListener('click', startBossRush);
  refreshBossRushEntry();
  const mb = g('metaBtn'); if (mb) mb.addEventListener('click', openMetaScreen);
  const mc = g('metaClose'); if (mc) mc.addEventListener('click', closeMetaScreen);
  const mn = g('metaNav'); if (mn) mn.addEventListener('click', e => { const b = e.target.closest('.mnavbtn'); if (b) showMetaTab(b.dataset.tab); });
  const mg = g('metaGrid'); if (mg) mg.addEventListener('click', onMetaGridClick);
  const js = g('jetStage'); if (js) { js.addEventListener('click', onJetMetaClick);
    js.addEventListener('mouseover', onJetMetaHover); js.addEventListener('focusin', onJetMetaHover); }
  renderPilotPanel();
}
function bindToggle(id, key, on, sfx = true) {
  const el = g(id); if (!el) return;
  el.checked = on;
  el.addEventListener('change', () => { applySetting(key, el.checked); if (sfx) audio.ui(); });
}
// the slider shows value*scale; scale 1 passes the raw slider string through, like the original handler
function bindRange(id, key, v, scale) {
  const el = g(id); if (!el) return;
  el.value = scale === 1 ? v : Math.round(v * scale);
  el.addEventListener('input', () => applySetting(key, scale === 1 ? el.value : el.value / scale));
}
function syncDevPanel() {
  const lock = g('devLock'), panel = g('devPanel');
  if (lock) lock.hidden = !!devUnlocked;
  if (panel) panel.hidden = !devUnlocked;
}
const EMBLEM_GLYPHS = { wings: '✈', skull: '☠', star: '★', dragon: 'ᚴ', ace: '◈' };
function renderPilotPanel() {
  const inp = g('callsignInput');
  if (inp) {
    inp.value = (meta && meta.callsign) || '';
    inp.placeholder = t('pilot.placeholder');
    inp.removeEventListener('input', _onCallsignInput);
    inp.addEventListener('input', _onCallsignInput);
    inp.removeEventListener('blur', _onCallsignBlur);
    inp.addEventListener('blur', _onCallsignBlur);
  }
  const grid = g('emblemGrid');
  if (!grid) return;
  grid.innerHTML = '';
  EMBLEMS.forEach(em => {
    const unlocked = emblemUnlocked(em.id, meta);
    const active = meta && meta.emblem === em.id;
    const btn = document.createElement('button');
    btn.className = 'emblembtn' + (active ? ' active' : '') + (unlocked ? '' : ' elocked');
    btn.title = em.id;
    btn.dataset.eid = em.id;
    btn.textContent = EMBLEM_GLYPHS[em.id] || '◆';
    if (!unlocked && em.gate === 'sp') {
      const cost = document.createElement('span');
      cost.className = 'emblemcost';
      cost.textContent = em.cost;
      btn.appendChild(cost);
    }
    btn.addEventListener('click', () => onEmblemClick(em.id));
    grid.appendChild(btn);
  });
  setTxt('lblCallsign', t('pilot.callsign'));
  setTxt('lblEmblem', t('pilot.emblem'));
}
function _onCallsignInput(e) { e.target.value = sanitizeCallsign(e.target.value); }
function _onCallsignBlur(e) {
  if (!meta) return;
  _onCallsignInput(e);
  setCallsign(e.target.value);
}
function onEmblemClick(id) {
  if (!meta) return;
  if (emblemUnlocked(id, meta)) {
    setEmblem(id);
    renderPilotPanel();
  } else {
    const def = EMBLEMS.find(e => e.id === id);
    if (def && def.gate === 'sp') {
      if (buyPatch(id)) { setEmblem(id); updateSpHud(); renderPilotPanel(); audio.ui(); }
      else showBanner(t('meta.needSp'));
    } else if (def && def.gate === 'ach') {
      showBanner(tf('pilot.needAch', { a: def.ach }));
    }
  }
}
function initOnboarding() {
  const langDd = g('langDropdown');
  const lv = g('langVersion'), vt = g('versionTag');
  if (lv && vt) { const m = vt.textContent.match(/[\d.]+/); lv.textContent = 'Version: ' + (m ? m[0] : ''); }
  if (langDd) langDd.addEventListener('change', () => {
    if (!langDd.value) return;
    LANG = langDd.value; saveSettings(); applyLang(); audio.ui();
    g('langSelect').classList.remove('show');
    g('onboard').classList.add('show');
  });
  const oc = g('obContinue');
  if (oc) oc.addEventListener('click', () => {
    g('onboard').classList.remove('show');
    onboarding = false;
    store.set('skystrike_onboarded', '1');
    audio.ui();
    startGame(0);
  });
  if (isReturningPlayer) {
    store.set('skystrike_onboarded', '1');
    return;
  }
  onboarding = true;
  g('langSelect').classList.add('show');
}
function cycleJet(dir) { selectJet((selectedJet + dir + JETS.length) % JETS.length); }

function unlockedJetIds() { return JETS.filter(j => jetUnlocked(j.id)).map(j => j.id); }
// Cooldown starts ready (cd=0); max is the raw SPECIAL_CD (NO OVERCLOCK/GHOST mods — those are slot-1 only).
function equipSpecial2(p, id, currentJetId) {
  if (!p) return;
  const ok = isEquippableSpecial(id, unlockedJetIds(), JETS, currentJetId);
  p.special2 = ok
    ? { id: id, cd: 0, max: specialCooldownMax(id, SPECIAL_CD, 15) }
    : { id: null, cd: 0, max: 15 };
}
function setSpecial2(id) {
  special2Id = id || null;
  saveSettings();
  renderJetCard(selectedJet);
  audio.ui();
}

function renderJetCard(i) {
  const j = JETS[i];
  const vetKills = (meta && meta.veterancy && meta.veterancy[j.id]) || 0;
  const vetR = vetRank(vetKills);
  const vetChip = vetR > 0
    ? '<div class="cvet" title="' + t('vet.label') + ' · ' + vetKills + '"><span class="cvet-ch">' + '❯'.repeat(vetR) + '</span><span>' + t('vet.rank' + vetR) + '</span></div>'
    : '';
  g('jetCard').innerHTML =
    '<div id="jetPreview3D" class="jetpreview3d">' +
      '<div class="jpzoom">' +
        '<span class="jpzoomlbl">' + t('hangar.zoom') + '</span>' +
        '<input id="jetZoom" class="jpzoomrange" type="range" min="0.8" max="2.5" step="0.05" value="1" aria-label="' + t('hangar.zoom') + '">' +
      '</div>' +
    '</div>' +
    '<div class="cbgrid">' +
      '<div class="cbhead">' +
        '<div><div class="cname">' + jetText(j, 'name') + '</div><div class="crole">' + jetText(j, 'role') + '</div></div>' +
        '<div class="cbtags"><div class="cgen">' + genText(j.gen) + '</div><div class="cability">\u25C8 ' + (j.ability ? jetText(j, 'ability') : t('card.noSpecial')) + '</div>' + vetChip + '</div>' +
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
      '<div id="special2Row" class="special2row"></div>' +
      '<div id="jetMeta" class="jetmeta"></div>' +
      '<div class="cblurb">' + jetText(j, 'desc') + '</div>' +
      '<div class="ccontext"><div class="cctlbl">' + t('card.realBrief') + '</div>' + jetText(j, 'context') + '</div>' +
    '</div>';
  mountPreviewCanvas();
  wireZoomSlider();
  renderSpecial2Picker(i);
  renderJetMeta(i);
}
function renderSpecial2Picker(i) {
  const wrap = g('special2Row'); if (!wrap) return;
  const head = '<div class="cspeclbl">' + t('card.special2') + '</div>';
  if (!slot2Unlocked()) {
    if (special2Id) { special2Id = null; saveSettings(); }
    wrap.innerHTML = head + '<div class="cabilitydesc">' + t('card.slot2Locked') + '</div>' +
                     '<button id="slot2Unlock" class="segbtn" style="margin-top:6px">' + tf('card.slot2Unlock', { n: SLOT2_COST }) + '</button>';
    const ub = g('slot2Unlock');
    if (ub) ub.addEventListener('click', () => {
      audio.ui();
      if (buySlot2()) renderJetCard(selectedJet); else ub.textContent = t('card.slot2NoSP');
    });
    return;
  }
  const pool = equippableSpecials(unlockedJetIds(), JETS, JETS[i].id);
  if (!pool.length) {
    wrap.innerHTML = head + '<div class="cabilitydesc">' + t('card.special2NoneAvail') + '</div>';
    return;
  }
  // drop a stale saved equip from the rendered selection (e.g. now-current jet / locked) without persisting
  const curId = isEquippableSpecial(special2Id, unlockedJetIds(), JETS, JETS[i].id) ? special2Id : '';
  let opts = '<option value=""' + (curId === '' ? ' selected' : '') + '>' + t('card.special2None') + '</option>';
  for (let k = 0; k < pool.length; k++) {
    const p = pool[k], jk = JETS.find(j => j.id === p.id);
    const nm = jk ? jetText(jk, 'ability') : p.name;
    opts += '<option value="' + p.id + '"' + (curId === p.id ? ' selected' : '') + '>' + nm + '</option>';
  }
  let html = head + '<select id="special2Sel" class="special2sel">' + opts + '</select>';
  const chosen = curId ? JETS.find(j => j.id === curId) : null;
  html += '<div class="cabilitydesc">' + (chosen ? jetText(chosen, 'abilityDesc') : t('card.special2Hint')) + '</div>';
  wrap.innerHTML = html;
  const sel = g('special2Sel');
  if (sel) sel.addEventListener('change', e => setSpecial2(e.target.value));
}
function refreshLaunchSub() {
  const lb = g('launch'); if (lb) { const sub = g('launchSub'); lb.textContent = tf('hangar.selectJet', { n: jetText(JETS[selectedJet], 'name') }); if (sub) { sub.textContent = ''; lb.appendChild(sub); } }
}
function openModeChoice() {
  if (launchBlocked()) { showBanner(t('meta.buyNeeded')); audio.ui(); return; }
  // #modeChoice / #endlessSetup are MODALS over the still-visible hangar (they do NOT hide it), tracked in
  // nav.js SCREENS as entry:'manual' so hideAllScreens() resets them, but entered here by hand — a router
  // showScreen would wrongly hide the hangar underneath. They toggle each other's .show directly. (nav.js)
  const ov = g('modeChoice'); if (!ov) return;
  g('endlessSetup') && g('endlessSetup').classList.remove('show');
  ov.classList.add('show');
  audio.ui();
}
function openEndlessSetup() {
  const ov = g('endlessSetup'); if (!ov) return;
  g('modeChoice') && g('modeChoice').classList.remove('show');
  ov.classList.add('show');
  audio.ui();
}
function setDifficulty(d) {
  difficulty = clamp(d, 0, 2);
  document.querySelectorAll('.dbtn[data-d]').forEach(b => b.classList.toggle('on', +b.dataset.d === difficulty));
  setTxt('diffdesc', t('diff.desc' + DIFFS[difficulty].key));
  refreshLaunchSub();
  audio.ui();
  saveSettings();
}
function setTimeOfDay(t) {
  applyTimeOfDay(t);
  document.querySelectorAll('.tbtn').forEach(b => b.classList.toggle('on', +b.dataset.t === timeOfDay));
  refreshLaunchSub();
  audio.ui();
  saveSettings();
}
function showManualTab(name) {
  document.querySelectorAll('#manual .mtab').forEach(t => t.classList.toggle('show', t.dataset.tab === name));
  document.querySelectorAll('#manual .mnavbtn').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  if (name === 'settings') showSettingsSubtab(settingsSubtab);
  audio.ui();
}
let settingsSubtab = 'display';
function showSettingsSubtab(name) {
  settingsSubtab = name;
  document.querySelectorAll('#manual .sset-group').forEach(gp => gp.classList.toggle('show', gp.dataset.sset === name));
  document.querySelectorAll('#manual .ssetbtn').forEach(b => b.classList.toggle('on', b.dataset.sset === name));
}
// Global persistent gear button (body-level #manualBtn). Visible on EVERY menu, hidden in flight/gameover and
// behind the pre-game language/onboard gates and the open manual panel. Called every frame from animate() so all
// screen transitions are covered without per-call-site hooks. (state === 'hangar' for all menu screens — only
// launch flips it to 'playing'.)
function syncManualBtn() {
  const b = g('manualBtn'); if (!b) return;
  b.classList.toggle('mb-hide', state !== 'hangar' || isShown('langSelect') || isShown('onboard') || isShown('manual'));
  const v = g('versionTag');
  if (v) v.classList.toggle('mb-hide', state === 'playing' || state === 'dead');
}
function openManual() { g('manual').classList.add('show'); showManualTab('guide'); paused = true; g('touchControls').classList.remove('show'); }
function closeManual() { g('manual').classList.remove('show'); paused = false; clock.getDelta(); if (isTouchEnabled && state === 'playing') g('touchControls').classList.add('show'); }
function toggleManual() { if (isShown('manual')) closeManual(); else openManual(); }
function abortMission() { closeManual(); if (state !== 'hangar') returnToHangar(); }
function statBar(lbl, v) {
  let s = '<div class="sb"><span>' + lbl + '</span><div class="bar">';
  for (let k = 1; k <= 10; k++) s += '<i class="' + (k <= v ? 'on' : '') + '"></i>';
  return s + '</div></div>';
}
/* hangar-preview paint: show the TRANSIENT hangarPreview.skin (owned OR not) on the live jet; fall back to the
   owned/equipped paint. UI-ONLY — never reaches createPlayer/gameplay (which uses jetPaint = owned only). */
function previewPaint(jet) {
  const s = previewSkinFor(jet.id);
  return s ? resolveSkin(jet, s) : jetPaint(jet);
}
// the transient preview skin, only when it belongs to the selected jet
function previewSkinFor(jetId) { return hangarPreview.skin && JETS[selectedJet] && jetId === JETS[selectedJet].id ? hangarPreview.skin : null; }

/* ---------------- TRACK C2: isolated hangar-preview renderer ----------------
   One singleton WebGLRenderer bound to a dedicated <canvas> that is REPARENTED into the live jet card's
   #jetPreview3D host on each card rebuild (the canvas persists; the card innerHTML is rebuilt per
   selection, so we MOVE the canvas in rather than recreate a WebGL context). Separate Scene + Camera +
   lights; matches the main renderer's colour pipeline (sRGB + ACES, exposure 1.0) so liveries read true.
   Own rAF loop, idle-cheap off the hangar. NO game entities / HUD ever enter this scene. */
let previewRenderer = null, previewScene = null, previewCamera = null, previewCanvas = null, previewRO = null;
const PREVIEW_CAM_Z = 40, PREVIEW_CAM_Y = 14, PREVIEW_FOV = 38;

function ensurePreviewRenderer() {
  if (previewRenderer || typeof THREE === 'undefined') return previewRenderer;
  previewCanvas = document.createElement('canvas');
  previewCanvas.id = 'jetPreviewCanvas';
  previewCanvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:grab';

  previewRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true });
  previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
  previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  previewRenderer.toneMappingExposure = 1.0;
  previewRenderer.setPixelRatio(window.devicePixelRatio);
  previewRenderer.setSize(380, 320, false);

  previewScene = new THREE.Scene();
  previewCamera = new THREE.PerspectiveCamera(PREVIEW_FOV, 380 / 320, 1, 4000);
  previewCamera.position.set(0, PREVIEW_CAM_Y, PREVIEW_CAM_Z);
  previewCamera.lookAt(0, 0, 0);

  // own lighting (do NOT couple to the game's envmap): a studio environment gives the PBR glTF metals
  // something to reflect (without one they render near-black), plus key + cool rim + low fill.
  const pm = new THREE.PMREMGenerator(previewRenderer);
  previewScene.environment = pm.fromScene(buildStudioEnv(), 0.04).texture;
  pm.dispose();
  previewScene.add(new THREE.HemisphereLight(0xb8d0ff, 0x1a2430, 0.45));
  const key = new THREE.DirectionalLight(0xfff0d6, 1.9); key.position.set(40, 60, 50); previewScene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc0ff, 1.6); rim.position.set(-50, 25, -45); previewScene.add(rim);
  previewScene.add(buildContactShadow());

  previewRO = new ResizeObserver(resizePreview);
  previewRO.observe(previewCanvas);

  requestAnimationFrame(previewLoop);
  return previewRenderer;
}
function buildStudioEnv() {
  const s = new THREE.Scene();
  const dome = new THREE.SphereGeometry(50, 32, 16), col = [], p = dome.attributes.position, c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50;
    c.setRGB(0.05, 0.06, 0.08).lerp(new THREE.Color(0.55, 0.6, 0.68), THREE.MathUtils.smoothstep(y, -0.3, 0.9));
    col.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  s.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const box = (w, h, x, y, z, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  box(40, 14, 0, 45, 10, 5);
  box(16, 24, 42, 12, 20, 2.5);
  return s;
}
function buildContactShadow() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = -7;
  return m;
}
function resizePreview() {
  if (!previewRenderer || !previewCanvas) return;
  const w = previewCanvas.clientWidth || 300, h = previewCanvas.clientHeight || 220;
  if (w === 0 || h === 0) return;
  previewRenderer.setSize(w, h, false);
  previewCamera.aspect = w / h; previewCamera.updateProjectionMatrix();
}
function mountPreviewCanvas() {
  ensurePreviewRenderer();
  const host = g('jetPreview3D');
  if (host && previewCanvas && previewCanvas.parentNode !== host) host.appendChild(previewCanvas);
  resizePreview();
}
function wireZoomSlider() {
  const z = g('jetZoom'); if (!z) return;
  z.value = hangarPreview.zoom;
  z.addEventListener('input', () => { hangarPreview.zoom = parseFloat(z.value) || 1.0; });
}
function previewLoop() {
  requestAnimationFrame(previewLoop);
  if (state !== 'hangar') return;
  if (!previewRenderer || !previewScene || !previewCamera) return;
  const z = 1 / (hangarPreview.zoom || 1);                                   // F2: dolly toward origin along the look dir (zoom in = closer); no FOV change → no distortion
  previewCamera.position.set(0, PREVIEW_CAM_Y * z, PREVIEW_CAM_Z * z);
  if (previewJet) {
    const pn = performance.now();
    if (!hangarPreview.dragging && pn > hangarPreview.spinResumeAt) hangarPreview.yaw += 0.012;
    previewJet.rotation.set(hangarPreview.pitch, hangarPreview.yaw, 0);
    previewJet.position.y = Math.sin(pn * 0.0012) * 0.6;
  }
  previewRenderer.render(previewScene, previewCamera);
}
function launchBlocked() {
  return !!(hangarPreview.skin && JETS[selectedJet] && !skinOwned(JETS[selectedJet].id, hangarPreview.skin));
}
function refreshLaunchGate() {
  const lb = g('launch'); if (lb) { const b = launchBlocked(); lb.classList.toggle('gated', b); lb.disabled = b; }
}
let _previewJetIdx = -1;
function selectJet(i) {
  if (i !== _previewJetIdx) { hangarPreview.clear(); _previewJetIdx = i; }
  selectedJet = i;
  renderJetCard(i);
  const dots = g('jetDots'); if (dots) { const ch = dots.children; for (let k = 0; k < ch.length; k++) ch[k].classList.toggle('on', k === i); }
  const c = g('jetCounter'); if (c) c.textContent = pad2(i + 1) + ' / ' + pad2(JETS.length);
  ensurePreviewRenderer();
  if (previewJet) { if (previewScene) previewScene.remove(previewJet); disposeGroup(previewJet); }   // free the prev preview's per-instance painted/burner clones (shared geo/mats spared)
  const paint = previewPaint(JETS[i]);
  previewJet = buildJetOrGLTF(paint.color, paint.accent, SHAPES[JETS[i].shape], true, { skin: paint });
  previewJet.position.set(0, 0, 0);
  previewJet.rotation.set(hangarPreview.pitch, hangarPreview.yaw, 0);
  if (previewScene) previewScene.add(previewJet);   // → isolated preview scene, NEVER the shared game scene
  refreshLaunchSub();
  audio.init(); audio.ui();
  saveSettings();
}
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
      // the skin currently being PREVIEWED but NOT owned (the only state that gates launch + shows the BUY CTA)
      const pv = previewSkinFor(j.id), pvUnowned = pv && !skinOwned(j.id, pv) ? pv : null;
      html += '<div class="jmskins"><span class="jmskinlbl">' + t('meta.skins') + '</span>';
      for (let s = 0; s < skins.length; s++) {
        const sk = skins[s], owned = skinOwned(j.id, sk.id), sel = selectedSkin(j.id) === sk.id;
        const previewing = sk.id === pvUnowned;
        const sw = (sk.color != null ? sk.color : j.color);
        html += '<button class="jmskin' + (sel && !pvUnowned ? ' on' : '') + (owned ? '' : ' locked') + (previewing ? ' preview' : '') + '" data-skin="' + sk.id + '" data-jet="' + j.id +
                '" style="--sw:#' + ('000000' + (sw >>> 0).toString(16)).slice(-6) + '" title="' + metaText({ id: 'skin.' + sk.id }, 'name') + '">' +
                (owned ? '' : '<span class="jmsklk">' + skinCost(j.id, sk.id) + '</span>') + '</button>';
      }
      html += '</div>';
      const curId = pv || selectedSkin(j.id);
      html += '<div id="jetSkinName" class="jmskinname">' + metaText({ id: 'skin.' + curId }, 'name') + '</div>';
      if (pvUnowned) html += '<button id="jetMetaBuy" class="jmpvbuy" data-buyskin="' + pvUnowned + '" data-jet="' + j.id + '">' + tf('meta.buyPaint', { c: skinCost(j.id, pvUnowned) }) + '</button>';
    }
  }
  wrap.innerHTML = html;
  refreshLaunchGate();
}
function onJetMetaClick(e) {
  const buy = e.target.closest('[data-buyjet]');
  if (buy) { if (buyJet(buy.dataset.buyjet)) { updateSpHud(); selectJet(selectedJet); audio.ui(); } else showBanner(t('meta.needSp')); return; }
  const buySk = e.target.closest('[data-buyskin]');
  if (buySk) {
    const jet = buySk.dataset.jet, id = buySk.dataset.buyskin;
    if (buySkin(jet, id)) { setSkin(jet, id); hangarPreview.skin = id; updateSpHud(); selectJet(selectedJet); audio.ui(); }
    else showBanner(t('meta.needSp'));
    return;
  }
  const sk = e.target.closest('.jmskin');
  if (sk) {
    const jet = sk.dataset.jet, id = sk.dataset.skin;
    hangarPreview.skin = id;
    if (skinOwned(jet, id)) setSkin(jet, id);  // owned → also equip (persist); unowned → preview only, NO meta/store write
    selectJet(selectedJet);
    audio.ui();
  }
}
function onJetMetaHover(e) {
  const sk = e.target.closest('.jmskin'); if (!sk) return;
  const lbl = g('jetSkinName'); if (lbl) lbl.textContent = metaText({ id: 'skin.' + sk.dataset.skin }, 'name');
}

const SKIN_IDS = ['standard', 'futuristic', 'analog', 'manual', 'flat', 'blueprint'];
function buildSkinGallery(current) {
  const gal = g('skinGallery');
  if (!gal) return;
  if (!gal._built) {
    gal._built = true;
    SKIN_IDS.forEach(id => {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'skin-card'; card.dataset.skin = id; card.dataset.id = id;
      card.setAttribute('role', 'radio');
      card.innerHTML =
        '<span class="sc-name"></span>' +
        '<span class="sc-prev" aria-hidden="true">' +
          '<span class="pv pv-spd"><i class="pv-dial"></i><i class="pv-needle"></i><b class="pv-val">340</b></span>' +
          '<span class="pv pv-alt"><i class="pv-dial"></i><i class="pv-needle"></i><b class="pv-val">12.4k</b></span>' +
          '<span class="pv pv-thr"><i class="pv-bar"></i><i class="pv-dial"></i><i class="pv-needle"></i></span>' +
        '</span>' +
        '<span class="sc-desc"></span>';
      card.addEventListener('click', () => selectSkinCard(id));
      gal.appendChild(card);
    });
    gal.addEventListener('keydown', (e) => {
      const cur = SKIN_IDS.indexOf(activeSkin);
      let ni = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') ni = (cur + 1) % SKIN_IDS.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ni = (cur - 1 + SKIN_IDS.length) % SKIN_IDS.length;
      if (ni < 0) return;
      e.preventDefault();
      selectSkinCard(SKIN_IDS[ni]);
      const c = gal.children[ni]; if (c) c.focus();
    });
  }
  refreshSkinGallery(current || activeSkin);
}
function selectSkinCard(id) {
  applySkin(id);
  refreshSkinGallery(id);
  audio.ui();
}
function refreshSkinGallery(current) {
  const gal = g('skinGallery');
  if (!gal) return;
  Array.prototype.forEach.call(gal.children, (card) => {
    const id = card.dataset.id, on = id === current;
    card.classList.toggle('sel', on);
    card.setAttribute('aria-checked', on ? 'true' : 'false');
    card.tabIndex = on ? 0 : -1;
    const nm = card.querySelector('.sc-name'); if (nm) nm.textContent = t('skin.' + id);
    const ds = card.querySelector('.sc-desc'); if (ds) ds.textContent = t('skin.' + id + '.d');
  });
}
