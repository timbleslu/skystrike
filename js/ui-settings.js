
function updateBest() {
  const a = g('go_best'); if (a) a.textContent = bestScore.toLocaleString();
  const b = g('hangarBest'); if (b) { b.style.display = bestScore > 0 ? 'block' : 'none'; const v = g('hangarBestVal'); if (v) v.textContent = bestScore.toLocaleString(); }
}
function updateSpHud() { const v = g('hangarSpVal'); if (v) v.textContent = spBalance().toLocaleString(); }
// NOT loadHealed: this is a bare scalar (parseInt + monotonic max-into-bestScore), not a JSON blob with
// default-filling — the loadHealed key-heal shape does not apply, so it stays hand-rolled by design.
function loadBest() {
  const v = parseInt(store.get('skystrike_best') || '0', 10);
  if (!isNaN(v) && v > bestScore) bestScore = v;
}
function saveBest() { store.set('skystrike_best', String(bestScore)); }
function loadSettings() {
  try {
    const s = JSON.parse(store.get('skystrike_settings') || '{}');
    loadSettingsFold(s);
    // --- bespoke rows kept hand-rolled (device reads / relocalize side effects — don't force the table) ---
    if (s.lang === 'EN' || s.lang === 'ZH' || s.lang === 'KO') LANG = s.lang;   // language picker: relocalize (applyLang) is caller-driven, not a plain apply chain
    const touch = 'ontouchstart' in window;   // touch devices default to denser HUD + menus
    if (typeof s.hudScale === 'number') hudScale = clamp(s.hudScale, 0.65, 1.6); else if (touch) hudScale = 0.8;
    if (typeof s.uiScale === 'number') uiScale = clamp(s.uiScale, 0.5, 1.6); else if (touch) uiScale = 0.65;
    if (typeof s.special2Id === 'string' || s.special2Id === null) special2Id = s.special2Id;
    // F11: re-resolve the gfx tier from the persisted setting + resize the shadow map. The ordering
    // invariant (refreshGfxTier BEFORE applyGfxQuality) is now encoded once in the SETTINGS 'gfx' row's
    // apply chain; run it unconditionally here (independent of whether gfxQuality was in the blob).
    runSettingApply('gfx');
  } catch (e) {}
}
function setTxt(id, str) { const e = g(id); if (e) e.textContent = str; }
// updateDom; the unit abbreviations (MPH/KPH/FT/M) are intentionally latin in both languages.
function applyUnitLabels() {
  setTxt('lblSpd', t(unitSystem === 'metric' ? 'hud.kph' : 'hud.mph'));
  setTxt('lblAlt', t(unitSystem === 'metric' ? 'hud.metres' : 'hud.ft'));
}
// static DOM labels: [element id, i18n key]
const LANG_TEXT = [
  ['langTagline', 'lang.tagline'], ['langBegin', 'lang.begin'], ['obTitle', 'onboard.title'],
  ['obSub', 'onboard.sub'], ['obFlightH', 'onboard.flight'], ['obFlightK', 'onboard.flightKeys'],
  ['obCombatH', 'onboard.combat'], ['obCombatK', 'onboard.combatKeys'], ['obViewH', 'onboard.view'],
  ['obViewK', 'onboard.viewKeys'], ['obTouch', 'onboard.touch'], ['obMore', 'onboard.more'], ['tutSkip', 'tut.skip'],
  ['obContinue', 'onboard.continue'], ['hangarSub', 'hangar.sub'], ['hangarBestLbl', 'hangar.best'],
  ['lblDiff', 'hangar.difficulty'], ['lblEnv', 'hangar.environment'], ['rbTitle', 'hangar.rivalBoard'],
  ['modeTitle', 'mode.title'], ['modeEndlessName', 'mode.endless'], ['modeEndlessDesc', 'mode.endlessDesc'],
  ['modeOperationName', 'mode.operation'], ['modeOperationDesc', 'mode.operationDesc'],
  ['endlessTitle', 'mode.endless'], ['manualBtn', 'hangar.manualBtn'], ['hangarSpLbl', 'meta.sp'],
  ['metaBtn', 'meta.btn'], ['lblCallsign', 'pilot.callsign'], ['lblEmblem', 'pilot.emblem'],
  ['dbtn0', 'diff.ROOKIE'], ['dbtn1', 'diff.VETERAN'], ['dbtn2', 'diff.ACE'], ['tbtn0', 'tod.DAY'],
  ['tbtn1', 'tod.DUSK'], ['tbtn2', 'tod.NIGHT'], ['hangarCtl1', 'hangar.controls1'],
  ['hangarCtl2', 'hangar.controls2'], ['hangarCtl3', 'hangar.controls3'], ['goLblScore', 'go.score'],
  ['goLblWave', 'go.wave'], ['goLblBest', 'go.best'], ['goLblKills', 'go.kills'], ['goLblAcc', 'go.accuracy'],
  ['goLblMsl', 'go.missiles'], ['goLblTime', 'go.time'], ['goLblSp', 'meta.spEarned'],
  ['goLblSpTotal', 'meta.banked'], ['goLblGrade', 'grade.title'], ['goLblStars', 'stars.title'],
  ['redeploy', 'go.redeploy'], ['goHangar', 'go.hangar'], ['metaTitle', 'meta.title'], ['metaSub', 'meta.sub'],
  ['metaSpLbl', 'meta.sp'], ['metaTab_perks', 'meta.tabPerks'], ['metaTab_ach', 'meta.tabAch'],
  ['metaClose', 'meta.back'], ['metaHint', 'meta.hint'], ['rplab', 'tech.researchPoints'],
  ['techHeadTitle', 'tech.title'], ['techHeadSub', 'tech.sub'], ['techDeploy', 'tech.deploy'],
  ['wpTitle', 'wing.title'], ['wpSub', 'wing.sub'], ['wpCancel', 'wing.cancel'], ['lblHp', 'hud.hp'],
  ['lblShd', 'hud.shd'], ['lblThr', 'hud.thr'], ['lblScore', 'hud.score'], ['lblRd', 'hud.rd'],
  ['lblCombo', 'hud.combo'], ['lblGun', 'hud.gun'], ['lblFlares', 'hud.flares'], ['lblMsl', 'hud.msl'],
  ['manTitle', 'manual.title'], ['manSub', 'manual.sub'], ['manualClose', 'manual.resume'],
  ['manualAbort', 'manual.abort'], ['manH_Flight', 'manual.hFlight'], ['manH_Combat', 'manual.hCombat'],
  ['manH_Lock', 'manual.hLock'], ['manH_Stats', 'manual.hStats'], ['manH_Hud', 'manual.hHud'],
  ['manH_Wingman', 'manual.hWingman'], ['manH_Enemies', 'manual.hEnemies'], ['manH_Tech', 'manual.hTech'],
  ['manH_Settings', 'manual.hSettings'], ['manH_Sorties', 'manual.hSorties'], ['manH_Special', 'manual.hSpecial'],
  ['manH_Missions', 'manual.hMissions'], ['manTab_guide', 'manual.tabGuide'],
  ['manTab_systems', 'manual.tabSystems'], ['manTab_tactics', 'manual.tabTactics'],
  ['manTab_settings', 'manual.tabSettings'], ['lblLang', 'set.language'], ['lblSens', 'set.sensitivity'],
  ['lblVol', 'set.volume'], ['lblInvert', 'set.invert'], ['lblMouseFlight', 'set.mouseFlight'],
  ['lblAutoLock', 'set.autoLock'], ['lblWingman', 'set.wingman'], ['lblRival', 'set.rival'],
  ['lblGroundWar', 'set.groundWar'], ['lblGunLead', 'set.gunLead'], ['lblAimAssist', 'set.aimAssist'],
  ['lblAimStrength', 'set.aimStrength'], ['lblMute', 'set.mute'], ['setLangEN', 'set.langEN'],
  ['setLangZH', 'set.langZH'], ['setLangKO', 'set.langKO'], ['lblControlScheme', 'set.controlScheme'],
  ['lblMobileControl', 'set.mobileControl'], ['lblAggression', 'set.aggression'], ['lblMotion', 'set.motionSensor'],
  ['lblHaptics', 'set.haptics'], ['lblBtnOpacity', 'set.btnOpacity'], ['lblBtnLayout', 'set.btnLayout'],
  ['lblGfx', 'set.gfx'], ['lblDevUnlock', 'set.devUnlock'], ['awacsLblStrike', 'awacs.chipStrike'],
  ['awacsLblResupply', 'awacs.chipResupply'], ['awacsLblJam', 'awacs.chipJam'], ['manH_Awacs', 'manual.awacs'],
  ['callsignHint', 'pilot.hint'], ['lblHudScale', 'set.hudScale'], ['lblUiScale', 'set.uiScale'],
  ['lblSkin', 'set.skin'], ['lblPalette', 'set.palette'], ['ssetTab_display', 'set.tab.display'],
  ['ssetTab_controls', 'set.tab.controls'], ['ssetTab_audio', 'set.tab.audio'], ['ssetTab_game', 'set.tab.game'],
  ['ssecAppearance', 'set.sec.appearance'], ['ssecReadout', 'set.sec.readout'], ['ssecSteering', 'set.sec.steering'],
  ['ssecTouch', 'set.sec.touch'], ['ssecMotion', 'set.sec.motion'], ['ssecMix', 'set.sec.mix'],
  ['ssecAim', 'set.sec.aim'], ['ssecModes', 'set.sec.modes'], ['ssecDev', 'set.sec.dev'],
  ['setEnableMotion', 'set.enableMotion'], ['setRecenter', 'set.recenter'], ['lblUnits', 'set.units'],
  ['w_pull', 'hud.pullUp'], ['w_missile', 'hud.missileAlert'], ['w_drone', 'hud.droneSwarm'],
  ['w_highg', 'hud.highG'], ['w_stealth', 'hud.stealthActive'], ['wingStatus', 'hud.escort'], ['hint', 'hud.hint'],
  ['btnPause', 'hud.pause'], ['tb-gun', 'touch.gun'], ['tb-msl', 'touch.msl'], ['tb-flr', 'touch.flr'],
  ['tb-spc', 'touch.spc'], ['tb-thr-lbl', 'touch.thr'], ['tb-cam', 'touch.cam'], ['tb-lck', 'touch.lck'],
  ['tb-aws', 'touch.aws'], ['tb-ars', 'touch.ars'], ['tb-ajm', 'touch.ajm'], ['tb-weng', 'touch.weng'],
  ['tb-wcov', 'touch.wcov'], ['tb-wrgp', 'touch.wrgp']
];
function applyLang() {
  for (const [id, key] of LANG_TEXT) setTxt(id, t(key));
  if (tutorial.active && !tutorial.done) renderTutorial();
  setTxt('modeBack', '◀ ' + t('common.back'));
  setTxt('endlessBack', '◀ ' + t('common.back'));
  setTxt('endlessStart', '▶ ' + t('mode.start'));
  refreshLaunchSub();
  refreshDailyEntry();
  refreshWeeklyEntry();
  refreshBossRushEntry();
  const ci = g('callsignInput'); if (ci) ci.placeholder = t('pilot.placeholder');
  setTxt('diffdesc', t('diff.desc' + DIFFS[difficulty].key));
  document.querySelectorAll('.tech-tab').forEach(b => { b.textContent = b.dataset.tab === 'armory' ? t('tech.tabArmory') : t('tech.tabTech'); });
  setTxt('techhint', techTab === 'armory' ? t('tech.hintArmory') : t('tech.hintTree'));
  renderDraftBar();
  if (el.abIndicator) el.abIndicator.textContent = t('hud.ab');
  { const lw = g('lblWave'); if (lw) putText(lw, t('hud.wave')); }
  applyUnitLabels();
  const _maw = g('manP_Awacs'); if (_maw) _maw.innerHTML = t('manBody.awacs');
  refreshSkinGallery(activeSkin);
  const sizeKeys = ['set.hudXs', 'set.hudSmall', 'set.hudNormal', 'set.hudLarge', 'set.hudXl'];
  ['setHudScale', 'setUiScale'].forEach(id => { const sel = g(id); if (sel && sel.options.length >= 5) sizeKeys.forEach((k, i) => { sel.options[i].textContent = t(k); }); });
  const segTxt = (sel, key) => { const b = document.querySelector(sel); if (b) b.textContent = t(key); };
  segTxt('#controlSchemeTog [data-cs="auto"]', 'set.csAuto'); segTxt('#controlSchemeTog [data-cs="pointer"]', 'set.csPointer'); segTxt('#controlSchemeTog [data-cs="rate"]', 'set.csClassic');
  segTxt('#mobileControlTog [data-mc="touch"]', 'set.mcTouch'); segTxt('#mobileControlTog [data-mc="motion"]', 'set.mcMotion');
  segTxt('#aggressionTog [data-ag="casual"]', 'set.agCasual'); segTxt('#aggressionTog [data-ag="balanced"]', 'set.agBalanced'); segTxt('#aggressionTog [data-ag="direct"]', 'set.agDirect');
  segTxt('#btnLayoutTog [data-bl="right"]', 'set.blRight'); segTxt('#btnLayoutTog [data-bl="left"]', 'set.blLeft'); segTxt('#btnLayoutTog [data-bl="compact"]', 'set.blCompact');
  segTxt('#gfxQualityTog [data-gq="auto"]', 'set.gfxAuto'); segTxt('#gfxQualityTog [data-gq="low"]', 'set.gfxLow'); segTxt('#gfxQualityTog [data-gq="medium"]', 'set.gfxMedium'); segTxt('#gfxQualityTog [data-gq="high"]', 'set.gfxHigh');
  segTxt('#unitsTog [data-un="imperial"]', 'set.unitsImperial'); segTxt('#unitsTog [data-un="metric"]', 'set.unitsMetric');
  document.querySelectorAll('.langbtn').forEach(b => b.classList.toggle('on', b.dataset.lang === LANG));
  { const wl = g('w_lock'); if (wl) putText(wl, t('hud.targetLocked')); }   // updateDom's guarded-write cache owns this node
  const setHTML = (id, key) => { const e = g(id); if (e) e.innerHTML = t(key); };
  setHTML('manUL_Flight', 'manBody.flight'); setHTML('manUL_Combat', 'manBody.combat'); setHTML('manP_Lock', 'manBody.lock');
  setHTML('manUL_Stats', 'manBody.stats'); setHTML('manUL_Hud', 'manBody.hud'); setHTML('manUL_Wingman', 'manBody.wingman');
  setHTML('manUL_Enemies', 'manBody.enemies'); setHTML('manP_Tech', 'manBody.tech');
  setHTML('manUL_Sorties', 'manBody.sorties'); setHTML('manUL_Special', 'manBody.special'); setHTML('manUL_Missions', 'manBody.missions');
  if (player && choosingUpgrade) { techTab === 'armory' ? renderArmory() : renderTechTree(false); }
  renderJetCard(selectedJet);
  renderKillBoard();
  updateSpHud();
  if (isShown('meta')) renderMetaScreen();
}

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
function syncControlSettingsUI() {
  const mark = (id, attr, val) => { const box = g(id); if (box) box.querySelectorAll('.segbtn').forEach(b => b.classList.toggle('on', b.dataset[attr] === val)); };
  mark('controlSchemeTog', 'cs', controlScheme);
  mark('mobileControlTog', 'mc', mobileControl);
  mark('aggressionTog', 'ag', motionAggression);
  mark('btnLayoutTog', 'bl', buttonLayout);
  mark('gfxQualityTog', 'gq', gfxQuality);
  mark('unitsTog', 'un', unitSystem);
  const sh = g('setHaptics'); if (sh) sh.checked = haptics;
  const sbo = g('setBtnOpacity'); if (sbo) sbo.value = Math.round(buttonOpacity * 100);
  const smf = g('setMouseFlight');
  if (smf) { smf.checked = mouseFlight; if (!smf._bound) { smf._bound = true; smf.addEventListener('change', () => { mouseFlight = smf.checked; audio.ui(); saveSettings(); }); } }
}
function enableMotionFlow() {
  const note = g('motionNote'), txt = g('motionNoteTxt');
  if (!motionSupported()) {
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
  applyButtonStyle();
}
// UI size: publishes the --ui-content scale factor (root custom prop). Menu BOXES keep their fixed
// footprint; only the CONTENT inside (text, map nodes, jet preview…) scales, via CSS that consumes
// var(--ui-content) on `.ui-dense` cores. Lower = denser = more content visible per same-size box.
// (NOT whole-screen zoom — that just shrank the box too and showed the same amount of content.)
function applyUiScale() {
  document.documentElement.style.setProperty('--ui-content', String(uiScale));
}
function saveSettings() {
  store.set('skystrike_settings', JSON.stringify({
    volume, muted, invertY, autoLock, startWingman, devUnlockAll, devUnlockLevels, devUnlocked, mouseFlight, gunLead, aimAssist, aimStrength, difficulty, timeOfDay, selectedJet, special2Id, rivalEnabled, groundWar, opMode,
    lang: LANG, controlSensitivity, hudScale, uiScale, controlScheme,
    mobileControl, motionAggression, haptics, buttonOpacity, buttonLayout, gfxQuality, unitSystem
  }));
}
// THE per-arena entity teardown (enemies, projectiles, particles, decoys, wingmen + spawn/HUD queues),
// shared by clearArena (→ hangar), clearCampaignArena (between levels) and startGame. Keeps the player.
function clearArenaEntities() {
  for (let i = 0; i < enemies.length; i++) { if (player) clearLocks(enemies[i]); despawnEnemy(enemies[i]); }
  const lists = [bullets, missiles, flares, loots];
  for (let l = 0; l < lists.length; l++) for (let i = 0; i < lists[l].length; i++) scene.remove(lists[l][i].mesh);
  for (let i = 0; i < particles.length; i++) releaseParticle(particles[i].mesh);   // pooled sprites stay warm for the next arena
  for (let i = 0; i < decoys.length; i++) despawnObject(decoys[i].mesh);
  clearWingmen();
  enemies.length = bullets.length = missiles.length = flares.length = loots.length = particles.length = decoys.length = 0;
  pendingSpawns.length = 0; BPOOL.length = 0; hitMarkers.length = 0; dmgNumbers.length = 0;
  clearAllies();
  campaignEnd = null;
  hideOutroStamp();
  hideMissionIntro();
}
function clearArena() {
  clearArenaEntities();
  clearGroundObjects();
  if (player) despawnObject(player.group);
  player = null;
  if (h2d) h2d.clearRect(0, 0, W, H);
  if (radarCtx) radarCtx.clearRect(0, 0, radarCanvas.width, radarCanvas.height);
  ['wPull', 'wMissile', 'wHighG', 'wStealth', 'wLock'].forEach(k => { if (el[k]) el[k].classList.remove('show'); });
  if (el.vignette) putStyle(el.vignette, 'opacity', '0');   // via putStyle so updateDom's write cache stays true
  if (el.dmg) putStyle(el.dmg, 'opacity', '0');
  if (el.flash) putStyle(el.flash, 'opacity', '0');
  if (el.bossbar) el.bossbar.classList.remove('show');
  if (el.banner) el.banner.classList.remove('show');
  closeUpgrade();
}
function returnToHangar() {
  audio.stopEngine();
  clearArena();
  campaignMode = false; campaignPlayerOpId = null; campaignOpId = null; campaignLevelIdx = -1; opSector = null;
  hideAllScreens();
  makePlatform();
  buildGroundObjects();
  camMode = 0;
  camera.position.set(0, 6, 42); camera.lookAt(0, 2, 0);
  state = 'hangar'; paused = false;
  clock.getDelta();
  showScreen('hangar');
  hangarPreview.clear(); _previewJetIdx = -1;
  selectJet(selectedJet);
  updateBest();
  renderKillBoard();
  refreshDailyEntry();
  refreshWeeklyEntry();
  refreshBossRushEntry();
}
