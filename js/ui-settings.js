/* SKYSTRIKE — split from ui.js (god-file refactor). Global scope; load order among ui-*.js irrelevant, but all must load after deps and before controls.js/main.js. */
/* ui-settings.js: best/settings persistence, applyLang i18n binding, motion, hud scale, arena cleanup. */

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
    if (typeof s.devUnlockLevels === 'boolean') devUnlockLevels = s.devUnlockLevels;   // v1.3 dev: unlock all levels
    if (typeof s.devUnlocked === 'boolean') devUnlocked = s.devUnlocked;               // v1.3: dev-panel password gate cleared
    if (typeof s.mouseFlight === 'boolean') mouseFlight = s.mouseFlight;   // F7: desktop mouse-pointer flight toggle
    if (typeof s.rivalEnabled === 'boolean') rivalEnabled = s.rivalEnabled;
    if (typeof s.groundWar === 'boolean') groundWar = s.groundWar;
    if (typeof s.opMode === 'boolean') opMode = s.opMode;
    if (typeof s.gunLead === 'boolean') gunLead = s.gunLead;
    if (typeof s.aimAssist === 'boolean') aimAssist = s.aimAssist;
    if (typeof s.aimStrength === 'number') aimStrength = clamp(s.aimStrength | 0, 1, 5);
    if (s.lang === 'EN' || s.lang === 'ZH' || s.lang === 'KO') LANG = s.lang;
    if (typeof s.controlSensitivity === 'number') controlSensitivity = clamp(s.controlSensitivity, 0.5, 2.0);
    if (typeof s.hudScale === 'number') hudScale = Math.max(0.65, Math.min(1.6, s.hudScale));
    else if ('ontouchstart' in window) hudScale = 0.8;
    if (typeof s.uiScale === 'number') uiScale = Math.max(0.5, Math.min(1.6, s.uiScale));
    else if ('ontouchstart' in window) uiScale = 0.65;   // menus default dense on touch (one level below desktop) so more fits
    controlScheme = ['auto', 'pointer', 'rate'].includes(s.controlScheme) ? s.controlScheme : 'auto';
    if (s.mobileControl === 'touch' || s.mobileControl === 'motion') mobileControl = s.mobileControl;
    if (s.motionAggression === 'casual' || s.motionAggression === 'balanced' || s.motionAggression === 'direct') motionAggression = s.motionAggression;
    if (typeof s.haptics === 'boolean') haptics = s.haptics;
    if (typeof s.buttonOpacity === 'number') buttonOpacity = clamp(s.buttonOpacity, 0.4, 1.0);
    if (s.buttonLayout === 'right' || s.buttonLayout === 'left' || s.buttonLayout === 'compact') buttonLayout = s.buttonLayout;
    if (s.gfxQuality === 'auto' || s.gfxQuality === 'low' || s.gfxQuality === 'medium' || s.gfxQuality === 'high') gfxQuality = s.gfxQuality;
    if (typeof refreshGfxTier === 'function') { refreshGfxTier(); if (typeof applyGfxQuality === 'function') applyGfxQuality(); }   // F11: re-resolve tier from the persisted setting + resize the shadow map
    if (s.unitSystem === 'imperial' || s.unitSystem === 'metric') unitSystem = s.unitSystem;   // HUD units (mph+ft / kph+m)
    if (typeof s.difficulty === 'number') difficulty = clamp(s.difficulty | 0, 0, 2);
    if (typeof s.timeOfDay === 'number') timeOfDay = clamp(s.timeOfDay | 0, 0, 2);
    if (typeof s.selectedJet === 'number') selectedJet = clamp(s.selectedJet | 0, 0, JETS.length - 1);
    if (typeof s.special2Id === 'string' || s.special2Id === null) special2Id = s.special2Id;   // feature #3: equipped SLOT-2 special (validated against the unlocked pool at equip/launch time)
  } catch (e) {}
}
// retranslate all static DOM text + re-render dynamic panels for the current LANG
function setTxt(id, str) { const e = g(id); if (e) e.textContent = str; }
// HUD speed/altitude unit labels reflect the chosen unit system. Called from applyLang (lang change /
// load) and from the Units toggle's onChange so labels flip live. Numeric readouts convert in ui-hud.js
// updateDom; the unit abbreviations (MPH/KPH/FT/M) are intentionally latin in both languages.
function applyUnitLabels() {
  setTxt('lblSpd', t(unitSystem === 'metric' ? 'hud.kph' : 'hud.mph'));
  setTxt('lblAlt', t(unitSystem === 'metric' ? 'hud.metres' : 'hud.ft'));
}
function applyLang() {
  // language-select / onboarding screens
  setTxt('langTagline', t('lang.tagline')); setTxt('langBegin', t('lang.begin'));
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
  setTxt('lblDiff', t('hangar.difficulty')); setTxt('lblEnv', t('hangar.environment'));
  setTxt('rbTitle', t('hangar.rivalBoard'));
  // mode-choice + endless-setup screens (pre-launch reflow)
  setTxt('modeTitle', t('mode.title'));
  setTxt('modeEndlessName', t('mode.endless')); setTxt('modeEndlessDesc', t('mode.endlessDesc'));
  setTxt('modeOperationName', t('mode.operation')); setTxt('modeOperationDesc', t('mode.operationDesc'));
  setTxt('modeBack', '◀ ' + t('common.back'));
  setTxt('endlessTitle', t('mode.endless'));
  setTxt('endlessBack', '◀ ' + t('common.back'));
  setTxt('endlessStart', '▶ ' + t('mode.start'));
  refreshLaunchSub();   // the hangar CTA now reads "SELECT <jet>" (label fully owned by refreshLaunchSub)
  setTxt('manualBtn', t('hangar.manualBtn'));
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
  // endless death rating (shown in place of stars in endless/daily; see ui-flow.js endRun)
  setTxt('goLblRating', t('rating.title'));
  setTxt('goLblRatKills', t('rating.kills')); setTxt('goLblRatAcc', t('rating.acc')); setTxt('goLblRatWaves', t('rating.waves'));
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
  renderDraftBar();   // FRONTIER DRAFT: localize the pin readout + reroll button on language switch
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
  applyUnitLabels();
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
  setTxt('lblVol', t('set.volume')); setTxt('lblInvert', t('set.invert')); setTxt('lblMouseFlight', t('set.mouseFlight'));
  setTxt('lblAutoLock', t('set.autoLock')); setTxt('lblWingman', t('set.wingman'));
  setTxt('lblRival', t('set.rival')); setTxt('lblGroundWar', t('set.groundWar'));
  setTxt('lblGunLead', t('set.gunLead')); setTxt('lblAimAssist', t('set.aimAssist')); setTxt('lblAimStrength', t('set.aimStrength')); setTxt('lblMute', t('set.mute'));
  setTxt('setLangEN', t('set.langEN')); setTxt('setLangZH', t('set.langZH')); setTxt('setLangKO', t('set.langKO'));
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
  setTxt('lblUiScale', t('set.uiScale'));
  setTxt('lblSkin', t('set.skin'));
  if (typeof refreshSkinGallery === 'function') refreshSkinGallery(activeSkin);
  setTxt('lblPalette', t('set.palette'));
  setTxt('ssetTab_display', t('set.tab.display'));
  setTxt('ssetTab_controls', t('set.tab.controls'));
  setTxt('ssetTab_audio', t('set.tab.audio'));
  setTxt('ssetTab_game', t('set.tab.game'));
  // settings-redesign: grouped section sub-headers within each subtab
  setTxt('ssecAppearance', t('set.sec.appearance')); setTxt('ssecReadout', t('set.sec.readout'));
  setTxt('ssecSteering', t('set.sec.steering')); setTxt('ssecTouch', t('set.sec.touch')); setTxt('ssecMotion', t('set.sec.motion'));
  setTxt('ssecMix', t('set.sec.mix')); setTxt('ssecAim', t('set.sec.aim')); setTxt('ssecModes', t('set.sec.modes')); setTxt('ssecDev', t('set.sec.dev'));
  const shs2 = g('setHudScale');
  if (shs2 && shs2.options.length >= 5) {
    shs2.options[0].textContent = t('set.hudXs');
    shs2.options[1].textContent = t('set.hudSmall');
    shs2.options[2].textContent = t('set.hudNormal');
    shs2.options[3].textContent = t('set.hudLarge');
    shs2.options[4].textContent = t('set.hudXl');
  }
  const sus2 = g('setUiScale');
  if (sus2 && sus2.options.length >= 5) {
    sus2.options[0].textContent = t('set.hudXs');
    sus2.options[1].textContent = t('set.hudSmall');
    sus2.options[2].textContent = t('set.hudNormal');
    sus2.options[3].textContent = t('set.hudLarge');
    sus2.options[4].textContent = t('set.hudXl');
  }
  setTxt('setEnableMotion', t('set.enableMotion')); setTxt('setRecenter', t('set.recenter'));
  const segTxt = (sel, key) => { const b = document.querySelector(sel); if (b) b.textContent = t(key); };
  segTxt('#controlSchemeTog [data-cs="auto"]', 'set.csAuto'); segTxt('#controlSchemeTog [data-cs="pointer"]', 'set.csPointer'); segTxt('#controlSchemeTog [data-cs="rate"]', 'set.csClassic');
  segTxt('#mobileControlTog [data-mc="touch"]', 'set.mcTouch'); segTxt('#mobileControlTog [data-mc="motion"]', 'set.mcMotion');
  segTxt('#aggressionTog [data-ag="casual"]', 'set.agCasual'); segTxt('#aggressionTog [data-ag="balanced"]', 'set.agBalanced'); segTxt('#aggressionTog [data-ag="direct"]', 'set.agDirect');
  segTxt('#btnLayoutTog [data-bl="right"]', 'set.blRight'); segTxt('#btnLayoutTog [data-bl="left"]', 'set.blLeft'); segTxt('#btnLayoutTog [data-bl="compact"]', 'set.blCompact');
  segTxt('#gfxQualityTog [data-gq="auto"]', 'set.gfxAuto'); segTxt('#gfxQualityTog [data-gq="low"]', 'set.gfxLow'); segTxt('#gfxQualityTog [data-gq="medium"]', 'set.gfxMedium'); segTxt('#gfxQualityTog [data-gq="high"]', 'set.gfxHigh');
  segTxt('#unitsTog [data-un="imperial"]', 'set.unitsImperial'); segTxt('#unitsTog [data-un="metric"]', 'set.unitsMetric'); setTxt('lblUnits', t('set.units'));
  document.querySelectorAll('.langbtn').forEach(b => b.classList.toggle('on', b.dataset.lang === LANG));
  // in-flight HUD warnings, hint bar, pause button (canvas labels are localized at draw time)
  setTxt('w_pull', t('hud.pullUp')); setTxt('w_missile', t('hud.missileAlert')); setTxt('w_drone', t('hud.droneSwarm'));
  setTxt('w_highg', t('hud.highG')); setTxt('w_stealth', t('hud.stealthActive')); setTxt('w_lock', t('hud.targetLocked'));
  setTxt('wingStatus', t('hud.escort'));
  const hintEl = g('hint'); if (hintEl) hintEl.textContent = t('hud.hint');
  const pauseEl = g('btnPause'); if (pauseEl) pauseEl.textContent = t('hud.pause');
  // touch buttons
  setTxt('tb-gun', t('touch.gun')); setTxt('tb-msl', t('touch.msl')); setTxt('tb-flr', t('touch.flr')); setTxt('tb-spc', t('touch.spc'));
  setTxt('tb-thr-lbl', t('touch.thr')); setTxt('tb-cam', t('touch.cam')); setTxt('tb-lck', t('touch.lck'));
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
  mark('unitsTog', 'un', unitSystem);
  const sh = g('setHaptics'); if (sh) sh.checked = haptics;
  const sbo = g('setBtnOpacity'); if (sbo) sbo.value = Math.round(buttonOpacity * 100);
  const smf = g('setMouseFlight');   // F7: desktop mouse-pointer flight toggle (bound once)
  if (smf) { smf.checked = mouseFlight; if (!smf._bound) { smf._bound = true; smf.addEventListener('change', () => { mouseFlight = smf.checked; if (typeof audio !== 'undefined' && audio.on) audio.ui(); saveSettings(); }); } }
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
  // HUD size: in-flight HUD only — DOM panels via the CSS var + canvas HUD via hudK(). Menus are driven by applyUiScale().
  const h = g('hud');
  if (h) h.style.setProperty('--hud-scale', String(hudScale));
  if (typeof applyButtonStyle === 'function') applyButtonStyle();
}
// UI size: publishes the --ui-content scale factor (root custom prop). Menu BOXES keep their fixed
// footprint; only the CONTENT inside (text, map nodes, jet preview…) scales, via CSS that consumes
// var(--ui-content) on `.ui-dense` cores. Lower = denser = more content visible per same-size box.
// (NOT whole-screen zoom — that just shrank the box too and showed the same amount of content.)
function applyUiScale() {
  document.documentElement.style.setProperty('--ui-content', String(uiScale));
}
function saveSettings() {
  try {
    store.set('skystrike_settings', JSON.stringify({
      volume, muted, invertY, autoLock, startWingman, devUnlockAll, devUnlockLevels, devUnlocked, mouseFlight, gunLead, aimAssist, aimStrength, difficulty, timeOfDay, selectedJet, special2Id, rivalEnabled, groundWar, opMode,
      lang: LANG, controlSensitivity, hudScale, uiScale, controlScheme,
      mobileControl, motionAggression, haptics, buttonOpacity, buttonLayout, gfxQuality, unitSystem
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
  if (typeof clearGroundObjects === 'function') clearGroundObjects();   // Track B: free per-arena InstancedMesh ground scatter (shared templates spared)
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
  if (typeof audio !== 'undefined' && audio.stopEngine) audio.stopEngine();   // leaving flight for the hangar → silence the engine hum (also covers abortMission, which routes here)
  clearArena();
  // Operations campaign: tear down any active operation run + hide its navigation overlays
  campaignMode = false; campaignPlayerOpId = null; campaignOpId = null; campaignLevelIdx = -1; opSector = null;
  ['modeChoice', 'endlessSetup', 'opsSelect', 'levelMap', 'levelCleared', 'briefing'].forEach(id => { const e = g(id); if (e) e.classList.remove('show'); });
  g('gameover').classList.remove('show');
  g('touchControls').classList.remove('show');
  makePlatform();
  if (typeof buildGroundObjects === 'function') buildGroundObjects();   // Track B: re-scatter ground objects for the hangar view (tier-gated)
  camMode = 0;
  camera.position.set(0, 6, 42); camera.lookAt(0, 2, 0);
  state = 'hangar'; paused = false;
  if (clock) clock.getDelta();
  g('hangar').classList.remove('hide');
  previewSkin = null; previewYaw = 0; previewPitch = 0; previewSpinResumeAt = 0; _previewJetIdx = -1;   // enter hangar fresh: no lingering unowned preview, reset drag orientation
  selectJet(selectedJet);
  updateBest();
  renderKillBoard();
  refreshDailyEntry();   // daily button label/play-state can change after a run — keep it current
  if (typeof refreshBossRushEntry === 'function') refreshBossRushEntry();   // F15: unlock/best-time can change after a run
}
