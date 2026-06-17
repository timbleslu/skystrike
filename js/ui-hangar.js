/* SKYSTRIKE — split from ui.js (god-file refactor). Global scope; load order among ui-*.js irrelevant, but all must load after deps and before controls.js/main.js. */
/* ui-hangar.js: hangar, kill board, pilot panel, jet select, onboarding, manual tabs. */
/* ---------------- hangar / flow ---------------- */
function renderKillBoard() {
  const list = g('rbList'); if (!list || !rival) return;
  list.innerHTML = rival.board.length
    ? rival.board.slice().reverse().map(b => '<div class="rb-row"><span>☠ ' + b.name + '</span><span>' + b.jetName + '</span><span>' + tf('hud.killRow', { lv: b.level, wv: b.wave }) + '</span></div>').join('')
    : '<div class="rb-empty">' + t('hangar.noRivals') + '</div>';
}
// the aim-assist strength bar only appears while aim assist is enabled
function updateAimStrengthVis() { const r = g('rowAimStrength'); if (r) r.style.display = aimAssist ? '' : 'none'; }
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

  g('launch').addEventListener('click', () => openModeChoice());
  g('manualBtn').addEventListener('click', openManual);
  g('manualClose').addEventListener('click', closeManual);
  g('manualAbort').addEventListener('click', abortMission);
  const mnav = g('manNav'); if (mnav) mnav.addEventListener('click', e => { const b = e.target.closest('.mnavbtn'); if (b) showManualTab(b.dataset.tab); });
  const ssn = g('ssetNav'); if (ssn) ssn.addEventListener('click', e => { const b = e.target.closest('.ssetbtn'); if (b) { showSettingsSubtab(b.dataset.sset); if (audio.on) audio.ui(); } });
  g('redeploy').addEventListener('click', returnToHangar);
  const td = g('techDeploy'); if (td) td.addEventListener('click', deployFromTech);
  const trr = g('techReroll'); if (trr) trr.addEventListener('click', rerollDraft);   // FRONTIER DRAFT: reroll the 3 offers (once/visit)
  const tg = g('techgrid');
  if (tg) {   // drag anywhere to pan the tech tree (scroll wheel & touch still work too)
    let panning = false, sx = 0, sy = 0, sl = 0, stp = 0;
    tg.addEventListener('pointerdown', e => { panning = true; techPanMoved = false; sx = e.clientX; sy = e.clientY; sl = tg.scrollLeft; stp = tg.scrollTop; });
    tg.addEventListener('pointermove', e => { if (!panning) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 5) techPanMoved = true; tg.scrollLeft = sl - dx; tg.scrollTop = stp - dy; });
    const endPan = () => { panning = false; };
    tg.addEventListener('pointerup', endPan); tg.addEventListener('pointerleave', endPan); tg.addEventListener('pointercancel', endPan);
  }
  // Difficulty/environment now live on the #endlessSetup screen; their .dbtn/.tbtn ids are unchanged so this global wiring still applies.
  document.querySelectorAll('.dbtn[data-d]').forEach(b => b.addEventListener('click', () => setDifficulty(+b.dataset.d)));
  setDifficulty(difficulty);
  document.querySelectorAll('.tbtn').forEach(b => b.addEventListener('click', () => setTimeOfDay(+b.dataset.t)));
  setTimeOfDay(timeOfDay);
  // mode (Endless/Operation) is now chosen on the #modeChoice screen, not a hangar toggle.
  g('modeEndless').addEventListener('click', () => { opMode = false; saveSettings(); openEndlessSetup(); });
  g('modeOperation').addEventListener('click', () => { opMode = true; saveSettings(); g('modeChoice').classList.remove('show'); openOperationsSelect(); });
  g('modeBack').addEventListener('click', () => { g('modeChoice').classList.remove('show'); if (audio.on) audio.ui(); });
  g('endlessBack').addEventListener('click', () => { g('endlessSetup').classList.remove('show'); openModeChoice(); });
  g('endlessStart').addEventListener('click', () => { opMode = false; g('endlessSetup').classList.remove('show'); startGame(selectedJet); });
  const sv = g('setVol'); if (sv) { sv.value = Math.round(volume * 100); sv.addEventListener('input', () => { volume = sv.value / 100; audio.setMaster(muted ? 0 : volume); saveSettings(); }); }
  const si = g('setInvert'); if (si) { si.checked = invertY; si.addEventListener('change', () => { invertY = si.checked; saveSettings(); }); }
  const sal = g('setAutoLock'); if (sal) { sal.checked = autoLock; sal.addEventListener('change', () => { autoLock = sal.checked; if (audio.on) audio.ui(); saveSettings(); }); }
  const sw = g('setWingman'); if (sw) { sw.checked = startWingman; sw.addEventListener('change', () => { startWingman = sw.checked; if (audio.on) audio.ui(); saveSettings(); }); }
  const sdu = g('setDevUnlock'); if (sdu) { sdu.checked = devUnlockAll; sdu.addEventListener('change', () => { devUnlockAll = sdu.checked; if (audio.on) audio.ui(); saveSettings(); renderJetCard(); }); }
  const srv = g('setRival'); if (srv) { srv.checked = rivalEnabled; srv.addEventListener('change', () => { rivalEnabled = srv.checked; if (audio.on) audio.ui(); saveSettings(); }); }
  const sgw = g('setGroundWar'); if (sgw) { sgw.checked = groundWar; sgw.addEventListener('change', () => { groundWar = sgw.checked; if (audio.on) audio.ui(); saveSettings(); }); }
  const sgl = g('setGunLead'); if (sgl) { sgl.checked = gunLead; sgl.addEventListener('change', () => { gunLead = sgl.checked; if (audio.on) audio.ui(); saveSettings(); }); }
  const saa = g('setAimAssist'); if (saa) { saa.checked = aimAssist; saa.addEventListener('change', () => { aimAssist = saa.checked; if (audio.on) audio.ui(); saveSettings(); updateAimStrengthVis(); }); }
  const sas = g('setAimStrength'); if (sas) { sas.value = aimStrength; sas.addEventListener('input', () => { aimStrength = clamp(sas.value | 0, 1, 5); saveSettings(); }); }
  updateAimStrengthVis();
  const sm = g('setMute'); if (sm) { sm.checked = muted; sm.addEventListener('change', () => { muted = sm.checked; audio.setMaster(muted ? 0 : volume); saveSettings(); }); }
  const ss = g('setSens'); if (ss) { ss.value = Math.round(controlSensitivity * 100); ss.addEventListener('input', () => { controlSensitivity = clamp(ss.value / 100, 0.5, 2.0); saveSettings(); }); }
  // mobile control settings (controls.js owns the input layer; these just set state + persist)
  bindSeg('controlSchemeTog', 'cs', () => controlScheme, (v) => { controlScheme = v; }, () => { if (audio.on) audio.ui(); });
  bindSeg('mobileControlTog', 'mc', () => mobileControl, (v) => { mobileControl = v; if (v === 'motion') enableMotionFlow(); }, () => { if (audio.on) audio.ui(); });
  bindSeg('aggressionTog', 'ag', () => motionAggression, (v) => { motionAggression = v; }, () => { if (audio.on) audio.ui(); });
  bindSeg('btnLayoutTog', 'bl', () => buttonLayout, (v) => { buttonLayout = v; if (typeof applyButtonStyle === 'function') applyButtonStyle(); }, () => { if (audio.on) audio.ui(); });
  // F11 graphics quality (auto/low/high) — re-resolve the render tier + resize the shadow map on change (visual-only)
  bindSeg('gfxQualityTog', 'gq', () => gfxQuality, (v) => { gfxQuality = v; if (typeof refreshGfxTier === 'function') refreshGfxTier(); if (typeof applyGfxQuality === 'function') applyGfxQuality(); }, () => { if (audio.on) audio.ui(); });
  // F3 HUD units (imperial mph+ft / metric kph+m) — readout reads unitSystem live; refresh the speed/alt labels on change
  bindSeg('unitsTog', 'un', () => unitSystem, (v) => { unitSystem = v; if (typeof applyUnitLabels === 'function') applyUnitLabels(); }, () => { if (audio.on) audio.ui(); });
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
  // Theming: visual language (skin) + color scheme (palette). Apply stored choice at boot, then wire selects.
  const storedSkin = store.get('skystrike_skin') || 'standard';
  const storedPalette = store.get('skystrike_palette') || 'amber';
  if (typeof applySkin === 'function') applySkin(storedSkin);
  if (typeof applyPalette === 'function') applyPalette(storedPalette);
  buildSkinGallery(storedSkin);
  const spal = g('setPalette');
  if (spal) { spal.value = storedPalette; spal.addEventListener('change', () => { applyPalette(spal.value); if (audio.on) audio.ui(); }); }
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
  const js = g('jetStage'); if (js) { js.addEventListener('click', onJetMetaClick);   // jet-card lock/skin buys (delegated)
    js.addEventListener('mouseover', onJetMetaHover); js.addEventListener('focusin', onJetMetaHover); }   // F3: surface livery name on hover/focus (delegated)
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
  const langDd = g('langDropdown');
  if (langDd) langDd.addEventListener('change', () => {
    if (!langDd.value) return;
    LANG = langDd.value; saveSettings(); applyLang(); if (audio.on) audio.ui();
    g('langSelect').classList.remove('show');
    g('onboard').classList.add('show');
  });
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

/* ---------------- SLOT-2 special equip (feature #3) ----------------
   The set of jet ids the player has UNLOCKED, used as the source pool for slot-2 equippable
   specials (mirrors the hangar's own jetUnlocked() gate so the picker only offers owned airframes). */
function unlockedJetIds() {
  const out = [];
  for (let k = 0; k < JETS.length; k++) if (jetUnlocked(JETS[k].id)) out.push(JETS[k].id);
  return out;
}
// equipSpecial2(p, id, currentJetId): fill p.special2 from a chosen equip id, validated against the
// equippable pool (unlocked, real ability, not the current jet). Stale/invalid/null → empty inert slot.
// Cooldown starts ready (cd=0); max is the raw SPECIAL_CD (NO OVERCLOCK/GHOST mods — those are slot-1 only).
function equipSpecial2(p, id, currentJetId) {
  if (!p) return;
  const ok = isEquippableSpecial(id, unlockedJetIds(), JETS, currentJetId);
  p.special2 = ok
    ? { id: id, cd: 0, max: specialCooldownMax(id, SPECIAL_CD, 15) }
    : { id: null, cd: 0, max: 15 };
}
// setSpecial2(id): hangar-side setter — persists the equip (via saveSettings, the selectedJet seam)
// and re-renders the card so the chosen ability shows. `null`/'' clears the slot.
function setSpecial2(id) {
  special2Id = (id && id !== '') ? id : null;
  saveSettings();
  renderJetCard(selectedJet);
  if (audio.on) audio.ui();
}

function renderJetCard(i) {
  const j = JETS[i];
  g('jetCard').innerHTML =
    '<div id="jetPreview3D" class="jetpreview3d">' +   // C1: 3D preview HERO at the TOP of the card (the persistent isolated canvas is reparented in here)
      '<div class="jpzoom">' +   // F2: side-mounted zoom slider (dollies previewCamera; reset to 1.0 on jet switch)
        '<span class="jpzoomlbl">' + t('hangar.zoom') + '</span>' +
        '<input id="jetZoom" class="jpzoomrange" type="range" min="0.8" max="2.5" step="0.05" value="1" aria-label="' + t('hangar.zoom') + '">' +
      '</div>' +
    '</div>' +
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
      '<div id="special2Row" class="special2row"></div>' +
      '<div id="jetMeta" class="jetmeta"></div>' +
    '</div>';
  mountPreviewCanvas();   // C2: reparent the persistent isolated preview canvas into this card's #jetPreview3D host
  wireZoomSlider();       // F2: sync the zoom slider to previewZoom + bind its input
  renderSpecial2Picker(i);
  renderJetMeta(i);
}
// SLOT-2 equip picker (feature #3): a compact <select> offering every UNLOCKED jet's ability except
// this jet's own (that is slot 1). Persists via setSpecial2 → saveSettings (the selectedJet seam).
function renderSpecial2Picker(i) {
  const wrap = g('special2Row'); if (!wrap) return;
  // feature #3: equipping a 2nd special is gated behind a one-time SP unlock (devUnlockAll bypasses)
  if (!slot2Unlocked()) {
    if (special2Id) { special2Id = null; saveSettings(); }   // drop any stale equip while the slot is locked
    wrap.innerHTML = '<div class="cspeclbl">' + t('card.special2') + '</div>' +
                     '<div class="cabilitydesc">' + t('card.slot2Locked') + '</div>' +
                     '<button id="slot2Unlock" class="segbtn" style="margin-top:6px">' + tf('card.slot2Unlock', { n: SLOT2_COST }) + '</button>';
    const ub = g('slot2Unlock');
    if (ub) ub.addEventListener('click', () => {
      if (buySlot2()) { if (audio.on) audio.ui(); renderJetCard(selectedJet); }
      else { if (audio.on) audio.ui(); ub.textContent = t('card.slot2NoSP'); }
    });
    return;
  }
  const pool = equippableSpecials(unlockedJetIds(), JETS, JETS[i].id);
  if (!pool.length) {                                   // nothing to equip yet — surface why, no control
    wrap.innerHTML = '<div class="cspeclbl">' + t('card.special2') + '</div>' +
                     '<div class="cabilitydesc">' + t('card.special2NoneAvail') + '</div>';
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
  let html = '<div class="cspeclbl">' + t('card.special2') + '</div>' +
             '<select id="special2Sel" class="special2sel">' + opts + '</select>';
  const chosen = curId ? JETS.find(j => j.id === curId) : null;
  html += '<div class="cabilitydesc">' + (chosen ? jetText(chosen, 'abilityDesc') : t('card.special2Hint')) + '</div>';
  wrap.innerHTML = html;
  const sel = g('special2Sel');
  if (sel) sel.addEventListener('change', e => setSpecial2(e.target.value));
}
// Pre-launch reflow: the hangar CTA now reads "SELECT <jet>" and opens the mode-choice screen.
// Difficulty/env/mode moved off the hangar, so the old diff·tod·mode subtitle is retired (kept blank).
function refreshLaunchSub() {
  const lb = g('launch'); if (lb) { const sub = g('launchSub'); lb.textContent = tf('hangar.selectJet', { n: jetText(JETS[selectedJet], 'name') }); if (sub) { sub.textContent = ''; lb.appendChild(sub); } }
}
// hangar "SELECT <jet>" → mode-choice screen (Endless / Operation). state stays 'hangar' (no player built yet).
function openModeChoice() {
  if (typeof launchBlocked === 'function' && launchBlocked()) { showBanner(t('meta.buyNeeded')); audio.ui(); return; }   // previewing an UNOWNED skin → must BUY it first
  const ov = g('modeChoice'); if (!ov) return;
  g('endlessSetup') && g('endlessSetup').classList.remove('show');
  ov.classList.add('show');
  if (audio.on) audio.ui();
}
// Endless branch: difficulty + environment + an explicit START.
function openEndlessSetup() {
  const ov = g('endlessSetup'); if (!ov) return;
  g('modeChoice') && g('modeChoice').classList.remove('show');
  ov.classList.add('show');
  if (audio.on) audio.ui();
}
function setDifficulty(d) {
  difficulty = clamp(d, 0, 2);
  document.querySelectorAll('.dbtn[data-d]').forEach(b => b.classList.toggle('on', +b.dataset.d === difficulty));
  const dd = g('diffdesc'); if (dd) dd.textContent = DIFFS[difficulty].desc;
  refreshLaunchSub();
  if (audio.on) audio.ui();
  saveSettings();
}
function setTimeOfDay(t) {
  applyTimeOfDay(t);
  document.querySelectorAll('.tbtn').forEach(b => b.classList.toggle('on', +b.dataset.t === timeOfDay));
  refreshLaunchSub();
  if (audio.on) audio.ui();
  saveSettings();
}
// (setOpMode + the hangar #modesel toggle were retired in the pre-launch reflow; opMode is now
//  set directly by the #modeChoice buttons — Endless sets it false, Operation sets it true.)
function showManualTab(name) {
  document.querySelectorAll('#manual .mtab').forEach(t => t.classList.toggle('show', t.dataset.tab === name));
  document.querySelectorAll('#manual .mnavbtn').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  if (name === 'settings') showSettingsSubtab(settingsSubtab);   // restore the last settings sub-section
  if (audio.on) audio.ui();
}
let settingsSubtab = 'display';
// Settings is split into Display / Controls / Audio / Gameplay sub-sections so the long list is navigable.
function showSettingsSubtab(name) {
  settingsSubtab = name;
  document.querySelectorAll('#manual .sset-group').forEach(gp => gp.classList.toggle('show', gp.dataset.sset === name));
  document.querySelectorAll('#manual .ssetbtn').forEach(b => b.classList.toggle('on', b.dataset.sset === name));
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
/* hangar-preview paint: show the TRANSIENT previewSkin (owned OR not) on the live jet; fall back to the
   owned/equipped paint. UI-ONLY — never reaches createPlayer/gameplay (which uses jetPaint = owned only). */
function previewPaint(jet) {
  if (previewSkin && JETS[selectedJet] && jet.id === JETS[selectedJet].id && typeof resolveSkinPaint === 'function') return resolveSkinPaint(jet, previewSkin);
  return jetPaint(jet);
}
/* TRACK C2: the preview no longer lives in a cleared world gutter — it renders to its OWN isolated
   WebGLRenderer/canvas hosted INSIDE the jet card (ensurePreviewRenderer below). This stub keeps the
   one historical call-site safe (selectJet) while the model just sits at origin in the preview scene. */
function layoutPreviewJet() { /* no-op — preview model is centred at origin in previewScene */ }

/* ---------------- TRACK C2: isolated hangar-preview renderer ----------------
   One singleton WebGLRenderer bound to a dedicated <canvas> that is REPARENTED into the live jet card's
   #jetPreview3D host on each card rebuild (the canvas persists; the card innerHTML is rebuilt per
   selection, so we MOVE the canvas in rather than recreate a WebGL context). Separate Scene + Camera +
   lights; matches the main renderer's colour pipeline (sRGB + ACES, exposure 1.0) so liveries read true.
   Own rAF loop, idle-cheap off the hangar. NO game entities / HUD ever enter this scene. */
let previewRenderer = null, previewScene = null, previewCamera = null, previewCanvas = null, previewRO = null;
const PREVIEW_CAM_Z = 62, PREVIEW_CAM_Y = 6, PREVIEW_FOV = 38;   // frames a len≈26 fighter (BOMBER 44) nicely

function ensurePreviewRenderer() {
  if (previewRenderer || typeof THREE === 'undefined') return previewRenderer;
  previewCanvas = document.createElement('canvas');
  previewCanvas.id = 'jetPreviewCanvas';
  previewCanvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:grab';

  previewRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true });
  previewRenderer.outputColorSpace = THREE.SRGBColorSpace;            // match engine.js initThree pipeline
  previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  previewRenderer.toneMappingExposure = 1.0;
  previewRenderer.setPixelRatio(window.devicePixelRatio);            // kill retina blur (main caps at 2; preview is small → full DPR is cheap)
  previewRenderer.setSize(380, 320, false);                          // larger base box (F1); resized by the RO to the real host box

  previewScene = new THREE.Scene();                                 // transparent bg (alpha:true) → the hangar backdrop shows behind the card already
  previewCamera = new THREE.PerspectiveCamera(PREVIEW_FOV, 380 / 320, 1, 4000);
  previewCamera.position.set(0, PREVIEW_CAM_Y, PREVIEW_CAM_Z);
  previewCamera.lookAt(0, 0, 0);

  // own lighting (do NOT couple to the game's envmap) — read the liveries clearly: fill + hemi + key + rim.
  previewScene.add(new THREE.AmbientLight(0x5a6e88, 0.9));
  previewScene.add(new THREE.HemisphereLight(0x9fc0ff, 0x21303f, 0.7));
  const key = new THREE.DirectionalLight(0xfff0d6, 1.35); key.position.set(40, 60, 50); previewScene.add(key);
  const rim = new THREE.DirectionalLight(0x88a8ff, 0.6); rim.position.set(-50, 20, -40); previewScene.add(rim);

  // track the host box (card-relative) so the canvas always matches its container, sharp on resize.
  previewRO = new ResizeObserver(resizePreview);
  previewRO.observe(previewCanvas);

  requestAnimationFrame(previewLoop);
  return previewRenderer;
}
function resizePreview() {
  if (!previewRenderer || !previewCanvas) return;
  const w = previewCanvas.clientWidth || 300, h = previewCanvas.clientHeight || 220;
  if (w === 0 || h === 0) return;
  previewRenderer.setSize(w, h, false);
  previewCamera.aspect = w / h; previewCamera.updateProjectionMatrix();
}
/* host the persistent preview canvas inside the CURRENT card's #jetPreview3D block (called from renderJetCard,
   which has just rebuilt the card innerHTML and destroyed the previous host). */
function mountPreviewCanvas() {
  ensurePreviewRenderer();
  const host = g('jetPreview3D');
  if (host && previewCanvas && previewCanvas.parentNode !== host) host.appendChild(previewCanvas);
  resizePreview();
}
/* F2: sync the zoom slider UI to previewZoom and bind it — previewLoop reads previewZoom each frame.
   Called after each card rebuild; previewZoom is reset to 1.0 in selectJet on a real jet switch. */
function wireZoomSlider() {
  const z = g('jetZoom'); if (!z) return;
  z.value = previewZoom;
  z.addEventListener('input', () => { previewZoom = parseFloat(z.value) || 1.0; });
}
/* dedicated rAF — auto-rotate + drag orientation; idles cheaply (no render) when not in the hangar. */
function previewLoop() {
  requestAnimationFrame(previewLoop);
  if (typeof state !== 'undefined' && state !== 'hangar') return;   // off-hangar: keep the loop alive but skip the draw
  if (!previewRenderer || !previewScene || !previewCamera) return;
  const z = 1 / (previewZoom || 1);                                          // F2: dolly toward origin along the look dir (zoom in = closer); no FOV change → no distortion
  previewCamera.position.set(0, PREVIEW_CAM_Y * z, PREVIEW_CAM_Z * z);
  if (previewJet) {
    const pn = performance.now();
    if (!previewDragging && pn > previewSpinResumeAt) previewYaw += 0.012;   // auto-rotate (resumes ~3s after release via previewSpinResumeAt)
    previewJet.rotation.set(previewPitch, previewYaw, 0);                    // own the full orientation (yaw spins, dragged pitch held)
    previewJet.position.y = Math.sin(pn * 0.0012) * 0.6;                     // gentle bob (optional)
  }
  previewRenderer.render(previewScene, previewCamera);
}
/* launch is BLOCKED while previewing an UNOWNED skin (must buy it first). */
function launchBlocked() {
  return !!(previewSkin && JETS[selectedJet] && typeof skinOwned === 'function' && !skinOwned(JETS[selectedJet].id, previewSkin));
}
/* reflect the gate on the LAUNCH control (disabled + dimmed .gated). */
function refreshLaunchGate() {
  const lb = g('launch'); if (lb) { const b = launchBlocked(); lb.classList.toggle('gated', b); lb.disabled = b; }
}
let _previewJetIdx = -1;   // last jet whose preview was built; a real jet switch reverts previewSkin + resets drag orientation
function selectJet(i) {
  if (i !== _previewJetIdx) { previewSkin = null; previewYaw = 0; previewPitch = 0; previewZoom = 1.0; previewSpinResumeAt = 0; _previewJetIdx = i; }   // jet switch → revert preview, reset orientation + zoom (F2)
  selectedJet = i;
  renderJetCard(i);
  const dots = g('jetDots'); if (dots) { const ch = dots.children; for (let k = 0; k < ch.length; k++) ch[k].classList.toggle('on', k === i); }
  const c = g('jetCounter'); if (c) c.textContent = ('0' + (i + 1)).slice(-2) + ' / ' + ('0' + JETS.length).slice(-2);
  ensurePreviewRenderer();               // C2: build the isolated renderer/scene/camera once (mountPreviewCanvas in renderJetCard reparents the canvas into this card)
  if (previewJet) { if (previewScene) previewScene.remove(previewJet); if (typeof disposeGroup === 'function') disposeGroup(previewJet); }   // free the prev preview's per-instance painted/burner clones (shared geo/mats spared)
  const paint = previewPaint(JETS[i]);   // previewing skin (owned OR not) → live look; gameplay still uses jetPaint
  previewJet = buildJetOrGLTF(paint.color, paint.accent, SHAPES[JETS[i].shape], true, { skin: paint });
  previewJet.position.set(0, 0, 0);      // C2: centred at origin in the PREVIEW scene (no world gutter)
  previewJet.rotation.set(previewPitch, previewYaw, 0);
  if (previewScene) previewScene.add(previewJet);   // → isolated preview scene, NEVER the shared game scene
  refreshLaunchSub();   // CTA reads "SELECT <jet>" — keep it in sync with the selected airframe name
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
      // the skin currently being PREVIEWED but NOT owned (the only state that gates launch + shows the BUY CTA)
      const pvUnowned = (previewSkin && JETS[selectedJet] && j.id === JETS[selectedJet].id && !skinOwned(j.id, previewSkin)) ? previewSkin : null;
      html += '<div class="jmskins"><span class="jmskinlbl">' + t('meta.skins') + '</span>';
      for (let s = 0; s < skins.length; s++) {
        const sk = skins[s], owned = skinOwned(j.id, sk.id), sel = selectedSkin(j.id) === sk.id;
        const previewing = sk.id === pvUnowned;   // previewing-but-unowned: distinct chip state
        const sw = (sk.color != null ? sk.color : j.color);
        html += '<button class="jmskin' + (sel && !pvUnowned ? ' on' : '') + (owned ? '' : ' locked') + (previewing ? ' preview' : '') + '" data-skin="' + sk.id + '" data-jet="' + j.id +
                '" style="--sw:#' + ('000000' + (sw >>> 0).toString(16)).slice(-6) + '" title="' + metaText({ id: 'skin.' + sk.id }, 'name') + '">' +
                (owned ? '' : '<span class="jmsklk">' + skinCost(j.id, sk.id) + '</span>') + '</button>';
      }
      html += '</div>';
      // F3: livery NAME readout — shows the hovered/focused/selected paint name prominently (any skin id, via metaText)
      const curId = previewSkin && JETS[selectedJet] && j.id === JETS[selectedJet].id ? previewSkin : selectedSkin(j.id);
      html += '<div id="jetSkinName" class="jmskinname">' + metaText({ id: 'skin.' + curId }, 'name') + '</div>';
      // buy-to-preview: while previewing an UNOWNED skin, surface an inline BUY · cost right at the preview
      if (pvUnowned) html += '<button id="jetMetaBuy" class="jmpvbuy" data-buyskin="' + pvUnowned + '" data-jet="' + j.id + '">' + tf('meta.buyPaint', { c: skinCost(j.id, pvUnowned) }) + '</button>';
    }
  }
  wrap.innerHTML = html;
  refreshLaunchGate();   // chips changed → keep the LAUNCH gate in sync
}
// delegated buy/select handlers for the jet-card meta overlay
function onJetMetaClick(e) {
  const buy = e.target.closest('[data-buyjet]');
  if (buy) { if (buyJet(buy.dataset.buyjet)) { updateSpHud(); selectJet(selectedJet); audio.ui(); } else showBanner(t('meta.needSp')); return; }
  // inline BUY · cost — purchase the previewed (unowned) skin, equip it, clear the launch block
  const buySk = e.target.closest('[data-buyskin]');
  if (buySk) {
    const jet = buySk.dataset.jet, id = buySk.dataset.buyskin;
    if (buySkin(jet, id)) { setSkin(jet, id); previewSkin = id; updateSpHud(); selectJet(selectedJet); audio.ui(); }
    else showBanner(t('meta.needSp'));
    return;
  }
  const sk = e.target.closest('.jmskin');
  if (sk) {
    const jet = sk.dataset.jet, id = sk.dataset.skin;
    previewSkin = id;                          // preview ANY chip (owned or not) on the live model — UI only
    if (skinOwned(jet, id)) setSkin(jet, id);  // owned → also equip (persist); unowned → preview only, NO meta/store write
    selectJet(selectedJet);                    // rebuild preview with previewPaint (+ refreshes chips + gate)
    audio.ui();
  }
}
// F3: hover/focus a paint chip → show its livery NAME (any skin id, resolved generically via metaText).
// Mouse leaving the chips restores the equipped/previewed name (re-rendered by renderJetMeta otherwise).
function onJetMetaHover(e) {
  const sk = e.target.closest('.jmskin'); if (!sk) return;
  const lbl = g('jetSkinName'); if (lbl) lbl.textContent = metaText({ id: 'skin.' + sk.dataset.skin }, 'name');
}

/* ---- Visual-style picker: 6-card gallery, each card a mini-HUD preview rendered in its OWN skin.
   Replaces the old <select>. Cards carry data-skin locally so the preview CSS (.skin-card[data-skin]
   .pv-*) renders in-style without touching :root. Selection applies the skin live + persists. ---- */
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
    // roving-tabindex arrow navigation across the radiogroup
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
  if (audio.on) audio.ui();
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
