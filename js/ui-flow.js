let metaTab = 'perks';
// #meta is a MODAL over the still-visible hangar (state stays 'hangar'), NOT a screen swap — so it is
// deliberately NOT routed through nav.js showScreen (which would hide the hangar underneath). Direct
// .show toggle. Same rationale for #manual / #upgrade / #wingpick below.
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
function startGame(i, daily, rush, weekly) {
  if (state !== 'hangar') return;
  if (!daily && !weekly && !jetUnlocked(JETS[i].id)) { showBanner(tf('meta.jetLocked', { c: jetCost(JETS[i].id) })); audio.ui(); return; }
  if (!daily && !rush && !weekly && typeof launchBlocked === 'function' && launchBlocked()) { showBanner(t('meta.buyNeeded')); audio.ui(); return; }   // previewing an UNOWNED skin → must BUY it first (weekly uses the seed jet, not the hangar preview)
  hangarPreview.clear();
  if (opMode && !daily && !rush) { selectedJet = i; openOperationsSelect(); return; }
  const _ptag = g('pilotTag');
  if (_ptag) {
    setTxt('pilotCallsignTxt', (meta && meta.callsign) || '');
    setTxt('pilotEmblemIcon', EMBLEM_GLYPHS[(meta && meta.emblem) || 'wings'] || '✈');
  }
  dailyMode = !!daily;
  bossRush = !!rush;
  weeklyMode = !!weekly; if (!weeklyMode) { weeklyMods = null; weeklyWavePlan = null; }
  selectedJet = i; audio.init();
  closeManual();
  if (previewJet) { if (typeof previewScene !== 'undefined' && previewScene) previewScene.remove(previewJet); if (typeof disposeGroup === 'function') disposeGroup(previewJet); previewJet = null; }
  if (platform) { scene.remove(platform); platform = null; }

  wingDmgMul = 1;            // reset BEFORE building the player so a jet passive (F-47) can raise it
  createPlayer(i);
  if (!bossRush) applyMetaPerks(player);    // persistent meta-tree edges apply at run start, BEFORE in-run tech tree (F15: boss-rush is a FIXED loadout — no perks)
  equipSpecial2(player, special2Id, JETS[i].id);
  if (weeklyMode && weeklyMods) applyWeeklyMods(player, weeklyMods);
  clearArenaEntities();
  wave = 0; betweenWaves = true; waveTimer = 2.6; crateTimer = 9; strikeWaveActive = false;
  bossWaveNext = 0; bossWaveActive = false; lastWaveWasBoss = false;
  player._cheatUsed = false;   // APEX PREDATOR cheat-death is now ONCE PER RUN (balance 2026-06); reset here, NOT per wave
  barrelRollCooldown = 0; barrelRollAnim = 0; barrelRollRequest = false;
  barrelRollLastKeyTap = -999; barrelRollLastTouchTap = -999;
  opSector = null; mission = null;
  weatherSeed = dailyMode ? dailySeed : weeklyMode ? weeklySeed : ((Math.random() * 0x7fffffff) | 0);
  if (typeof applyWeather === 'function') applyWeather('clear');
  if (typeof buildGroundObjects === 'function') buildGroundObjects();
  choosingUpgrade = false; g('upgrade').classList.remove('show');
  resetDraftState();
  resetAwacs();
  run = freshRun(performance.now());
  noDamageWave = false;
  bossRushIndex = 0; bossRushT0 = performance.now();
  showScreen('playing');
  if (!bossRush && !isReturningPlayer && !tutorial.done) startTutorial();
  else if (el.tut) el.tut.classList.remove('show');
  if (startWingman) spawnWingman(false, 'STD');
  showBanner(t('banner.getReady'));
}
let lastRunRestartable = false;
function redeployRun() {
  returnToHangar();
  if (!lastRunRestartable) return;
  opMode = false;
  startGame(selectedJet);
}
function gameOver() {
  if (state !== 'playing') return;
  if (campaignMode) {
    if (campaignEnd) return;
    explode(player.group.position, true); player.group.visible = false;
    beginCampaignEnd('fail', 'shotDown', true);
    return;
  }
  state = 'dead';
  if (typeof audio !== 'undefined' && audio.stopEngine) audio.stopEngine();
  choosingUpgrade = false; g('upgrade').classList.remove('show');
  explode(player.group.position, true);
  player.group.visible = false;
  clearWingmen();
  if (h2d) h2d.clearRect(0, 0, W, H);
  endRun(t('banner.missionFailed'));
}
function endRun(title, win) {
  if (typeof audio !== 'undefined' && audio.stopEngine) audio.stopEngine();
  const gw = g('gameover').querySelector('.gowrap');
  if (gw) gw.classList.toggle('win', !!win);
  const h1 = g('gameover').querySelector('h1'); if (h1) h1.textContent = title;
  if (player.score > bestScore) { bestScore = player.score; saveBest(); }
  if (dailyMode) {
    const rec = dailyToday();
    saveDaily({ date: rec.date, played: true, best: Math.max(rec.best || 0, player.score) });
  }
  if (weeklyMode && typeof meta !== 'undefined') {
    recordWeeklyBest(meta, weekIdFor(todayKey()), player.score); saveMeta();
  }
  g('go_score').textContent = player.score.toLocaleString();
  g('go_wave').textContent = wave;
  const secs = Math.max(0, Math.round((performance.now() - run.t0) / 1000));
  const acc = run.shots > 0 ? Math.round(run.hits / run.shots * 100) : 0;
  const dk = g('go_kills'); if (dk) dk.textContent = (run.kills + run.ground + run.boss);
  const da = g('go_acc'); if (da) da.textContent = acc + '%';
  const dm = g('go_msl'); if (dm) dm.textContent = run.missiles;
  const dt2 = g('go_time'); if (dt2) dt2.textContent = fmtClock(secs);
  // stamp derived stats onto run so spAward / gradeRun / achievement predicates stay pure
  run.waveReached = wave;
  run.rivalLevel = (rival && rival.level) || 0;
  run.timeSecs = secs;
  const award = spAward(run, player);
  const grade = gradeRun(run, player);
  const gradedAward = Math.round(award * grade.mult);
  const achRes = checkAchievements(run, player);
  bankSP(gradedAward);                 // achievement SP is banked inside grantAch
  stampVeterancy((player && player.jet && player.jet.id) || null, run.kills + (run.ground || 0) + (run.boss || 0));
  const total = gradedAward + (achRes.sp || 0);
  const spd = g('go_sp');
  if (spd) {
    if (prefersReducedMotion() || total <= 0) { spd.textContent = '+' + total.toLocaleString(); }
    else { countUp(spd, total, 560, v => '+' + Math.round(v).toLocaleString()); }
  }
  const spt = g('go_spTotal'); if (spt) spt.textContent = spBalance().toLocaleString();
  const dg = g('go_grade'); if (dg) { dg.querySelector('.grade-letter').textContent = grade.letter; dg.querySelector('.grade-bonus').textContent = grade.mult > 1 ? t('grade.bonus') + ' x' + grade.mult.toFixed(2) : ''; }
  if (gw) { gw.classList.toggle('grade-low', !(grade.letter === 'S' || grade.letter === 'A')); gw.classList.toggle('grade-none', grade.mult <= 1); }
  // Endless/Daily deaths (win falsy AND not a bounded-mode outcome) HIDE the star UI — the stats grid is
  // the performance readout. Operation victory (win) keeps stars. Campaign deaths never reach endRun
  // (gameOver routes them to the campaign failure debrief).
  const endless = !win && !MODE_POLICY[modeKeyFor({ campaignMode, opMode, dailyMode, weeklyActive: weeklyMode, bossRush })].bounded;
  lastRunRestartable = endless && !dailyMode && !weeklyMode && !bossRush;
  const rdb = g('redeploy'); if (rdb) rdb.style.display = lastRunRestartable ? '' : 'none';
  const hgb = g('goHangar'); if (hgb) hgb.classList.toggle('go-solo', !lastRunRestartable);
  const sd = g('go_stars');
  if (endless) {
    if (sd) sd.classList.add('hide');
  } else {
    if (sd) sd.classList.remove('hide');
    // SINGLE STAR-TRUTH: a campaign/op victory carries the per-level result computed ONCE in
    // campaignLevelComplete (delta vs level base, composed levelConds) via lastLevelResult — render
    // THAT, so the boss/op debrief matches the map pips. No stash → conds=null → evalStars fallback.
    const lr = (lastLevelResult && lastLevelResult.lr) || run;
    const conds = (lastLevelResult && lastLevelResult.conds) || null;
    const stars = (lastLevelResult && typeof lastLevelResult.stars === 'number') ? lastLevelResult.stars : evalStarsFor(run, player, conds);
    lastLevelResult = null;   // consumed — don't leak into a later non-campaign debrief
    const jetId = (player && player.jet && player.jet.id) || null;
    const best = bestStars(meta, jetId, stars); saveMeta();
    if (sd) {
      const pips = sd.querySelector('.stars-pips'); if (pips) pips.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      const note = sd.querySelector('.stars-note'); if (note) note.textContent = stars + ' / 3  ·  ' + tf('stars.best', { n: best });
      let cl = sd.querySelector('.stars-conds');
      if (conds) {
        if (!cl) { cl = document.createElement('span'); cl.className = 'stars-conds'; sd.appendChild(cl); }
        cl.innerHTML = conds.slice(0, 3).map(c =>
          '<span class="' + (starCondMet(c, lr) ? 'met' : 'miss') + '">' +
          (starCondMet(c, lr) ? '★ ' : '☆ ') + tf('stars.cond.' + c.type, { n: c.n || 0 }) +
          ' ' + t(starCondMet(c, lr) ? 'campaign.met' : 'campaign.miss') + '</span>'
        ).join('');
        cl.classList.remove('hide');
      } else if (cl) { cl.classList.add('hide'); }
    }
  }
  if (achRes.unlocked.length) showBanner(tf('banner.achUnlocked', { n: achRes.unlocked.length }));
  const goPilot = g('go_pilot');
  if (goPilot) {
    const cs = (meta && meta.callsign) || '';
    const emId = (meta && meta.emblem) || 'wings';
    const glyph = (typeof EMBLEM_GLYPHS !== 'undefined' && EMBLEM_GLYPHS[emId]) || '';
    goPilot.textContent = (glyph ? glyph + (cs ? ' ' + cs : '') : cs);
  }
  updateBest();
  showScreen('gameover');
  { const pb = lastRunRestartable ? g('redeploy') : g('goHangar'); if (pb && pb.focus) pb.focus({ preventScroll: true }); }
  if (gw && !prefersReducedMotion()) { gw.classList.remove('reveal'); void gw.offsetWidth; gw.classList.add('reveal'); }
  else if (gw) gw.classList.add('reveal');
}
function operationComplete() {
  if (state !== 'playing') return;
  state = 'dead';
  if (typeof audio !== 'undefined' && audio.stopEngine) audio.stopEngine();
  choosingUpgrade = false; g('upgrade').classList.remove('show');
  player.score += 5000;
  if (meta && !meta.bossRushUnlocked) { meta.bossRushUnlocked = true; saveMeta(); }
  showBanner(t('banner.operationComplete'));
  endRun(t('banner.operationComplete'), true);
  if (typeof refreshBossRushEntry === 'function') refreshBossRushEntry();
}

// SINGLE STAR-TRUTH stash: campaignLevelComplete computes the per-level stars ONCE (delta vs level base,
// composed levelConds). Both the #levelCleared panel and the boss/op endRun debrief render from THIS —
// never a separate recompute. Holds {stars, conds, lr}; endRun consumes + clears it on op victory.
let lastLevelResult = null;
// clear the live arena between levels but KEEP the player (clearArena nulls the player; we don't want that)
function clearCampaignArena() {
  clearArenaEntities();
  mission = null;
  if (typeof clearComms === 'function') clearComms();
}

let campaignEnd = null;
const FAIL_REASONS = ['shotDown', 'assetLost', 'convoyLost', 'timeUp', 'bomberEscaped', 'objective'];
function failReasonKey(reason) { return 'fail.' + (FAIL_REASONS.indexOf(reason) >= 0 ? reason : 'objective'); }
function beginCampaignEnd(kind, reason, frozen) {
  if (campaignEnd || !campaignMode) return;
  campaignEnd = { kind: kind, reason: reason || null, t: kind === 'win' ? 2.8 : 2.6, frozen: !!frozen };
  if (player) player.invuln = 99;
  waveTimer = 99; betweenWaves = true;
  if (typeof dismissMissionCard === 'function') dismissMissionCard();
  if (typeof showOutroStamp === 'function') showOutroStamp(kind === 'win', kind === 'win' ? null : failReasonKey(reason));
  if (typeof radioKey === 'function') {
    if (typeof clearComms === 'function') clearComms();
    radioKey('ovl', kind === 'win' ? 'comms.gen.missionComplete' : (reason === 'shotDown' ? 'comms.gen.pilotDown' : 'comms.gen.missionFailed'));
  }
}
function tickCampaignEnd(dt) {
  if (!campaignEnd) return;
  campaignEnd.t -= dt;
  if (campaignEnd.t > 0) return;
  const c = campaignEnd; campaignEnd = null;
  if (typeof hideOutroStamp === 'function') hideOutroStamp();
  if (c.kind === 'win') campaignLevelComplete(); else campaignLevelFailed(c.reason);
}
function levelDebriefStats(lr) {
  const kills = (lr.kills || 0) + (lr.ground || 0) + (lr.boss || 0);
  const acc = (lr.shots || 0) > 0 ? Math.round((lr.hits || 0) / lr.shots * 100) : 0;
  const secs = Math.max(0, Math.round(lr.timeSecs || 0));
  return { kills: kills, acc: acc, time: fmtClock(secs), dmg: Math.round(lr.damageTaken || 0) };
}

function freshSortie(p) {
  if (!p || !p.group) return;
  p.group.position.set(0, terrainH(0, 3200) + 950, 3200);
  p.group.quaternion.identity();
  if (p.vel) p.vel.set(0, 0, -1);
  p.speed = p.stats.minSpeed * 1.5; p.throttle = 0.6;
  p.pitchRate = 0; p.yawRate = 0; p.rollRate = 0;
  if (p.special) p.special.cd = 0;
  if (p.special2) p.special2.cd = 0;
  p.gunCd = 0; p.missileCd = 0; p.flareCd = 0; p.firingT = 0;
  p.invuln = 0; p.jammer = 0; p.slow = 0; p.overdrive = 0; p.empBurst = 0; p.stealthField = 0;
  p.lockedTarget = null; p.lockTarget = null; p.lockProgress = 0; p.combo = 0; p.comboTimer = 0;
  p.hp = p.maxHp; if (p.maxShield) p.shield = p.maxShield;
  p.missiles = p.maxMissiles; p.flares = p.maxFlares; p.bullets = p.maxBullets;
  barrelRollCooldown = 0; barrelRollAnim = 0; barrelRollRequest = false;
  resetAwacs();
  if (typeof stealthBlown !== 'undefined') stealthBlown = false;
}

function resetArenaForLevel(lvl) {
  clearCampaignArena();   // idempotent: tears down enemies/projectiles/particles/mission (keeps the player)
  const sp = (lvl && lvl.spawn) || {};
  if (typeof applyTimeOfDay === 'function') applyTimeOfDay(sp.tod || 0);
  if (typeof applyWeather === 'function') applyWeather(sp.weather || 'clear');
  if (typeof buildGroundObjects === 'function') buildGroundObjects();
  freshSortie(player);
}

const CW_ICON = {
  RECON: '<circle cx="12" cy="12" r="4"/><path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z"/>',
  STEALTH: '<path d="M15 3a9 9 0 1 0 6 15A8 8 0 0 1 15 3z"/>',
  STRIKE: '<circle cx="12" cy="12" r="8"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/>',
  SWEEP: '<path d="M3 15l5-5 4 4 9-9"/><path d="M15 5h6v6"/>',
  FURBALL: '<path d="M3 15l5-5 4 4 9-9"/><path d="M15 5h6v6"/>',
  INTERCEPT: '<path d="M2 12h14"/><path d="M11 6l6 6-6 6"/><path d="M21 4v16"/>',
  ESCORT: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  DEFEND: '<path d="M4 21V9l8-6 8 6v12z"/><path d="M9 21v-6h6v6"/>',
  BOSS: '<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>',
  FINAL: '<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>',
  LOCK: '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  CHECK: '<path d="M4 12l5 5L20 6"/>',
};
function cwIcon(k) { return '<svg class="cw-ico" viewBox="0 0 24 24" aria-hidden="true">' + (CW_ICON[k] || CW_ICON.STRIKE) + '</svg>'; }
function cwEsc(str) { return String(str == null ? '' : str).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function opStars(op) {
  const rec = meta && meta.campaign && meta.campaign[op.id];
  let got = 0, cleared = 0;
  op.levels.forEach(l => { const r = rec && rec.levels && rec.levels[l.id]; if (r && r.cleared) { cleared++; got += r.bestStars || 0; } });
  return { got: got, max: op.levels.length * 3, cleared: cleared, total: op.levels.length };
}
function levelBest(opId, lvl) {
  const r = meta && meta.campaign && meta.campaign[opId] && meta.campaign[opId].levels && meta.campaign[opId].levels[lvl.id];
  return (r && r.bestStars) || 0;
}
function starRow(n) { return '<span class="cw-pips">' + '★'.repeat(n) + '<i>' + '★'.repeat(3 - n) + '</i></span>'; }
function condLabel(lvl) { const sp = lvl.spawn || {}; return [t('tod.' + (['DAY', 'DUSK', 'NIGHT'][sp.tod || 0])), t('weather.' + (sp.weather || 'clear'))]; }
function levelBeats(lvl) {
  return (lvl.objectives || []).map(o => {
    let key = 'beat.' + o.type;
    if (o.type === 'ESCORT') key += o.escort === 'transport' ? '.air' : '.convoy';
    if (o.type === 'DEFEND' && o.asset === 'ship') key += '.ship';
    const name = o.label ? t('ally.name.' + o.label) : (o.type === 'BOSS' && lvl.boss ? t(lvl.boss.callsignKey) : '');
    const clock = o.timer || o.hold;
    const sp = o.spawn || {};
    let n = o.convoy || 0;
    if (o.type === 'SWEEP') {   // count the reinforcements its timed events add too — the phase needs them all
      n = sweepKills(sp);
      for (const ev of o.events || []) if (ev.spawn) n += sweepKills(ev.spawn);
      if (sp.aces || sp.hostileAce) key = 'beat.SWEEP.ace';
    }
    if (o.type === 'INTERCEPT') n = sp.bombers || 0;
    return { type: o.type, text: tf(key, { name: name, n: n }), clock: clock ? fmtClock(clock) : '' };
  });
}

function openOperationsSelect() {
  campaignMode = false; campaignOpId = null; opSector = null; paused = true;
  const ov = g('opsSelect'); if (!ov) return;
  renderOperationsSelect();
  showScreen('opsSelect');
  setTxt('opsTitle', t('campaign.operations'));
  const back = g('opsBack'); if (back) { back.textContent = '◀ ' + t('campaign.back'); back.onclick = () => { ov.classList.remove('show'); campaignPlayerOpId = null; returnToHangar(); }; }
  if (audio.on) audio.ui();
}
function renderOperationsSelect() {
  const wrap = g('opsList'); if (!wrap) return;
  let allGot = 0, allMax = 0;
  wrap.innerHTML = OPERATIONS.map((op, oi) => {
    const unlocked = campaignOpUnlocked(op.id);
    const st = opStars(op); allGot += st.got; allMax += st.max;
    const beaten = campaignLevelState(op.id, op.levels.length - 1) === 'cleared';
    const status = !unlocked ? tf('campaign.lockedAfter', { op: t(OPERATIONS[Math.max(0, oi - 1)].nameKey) })
      : beaten ? t('campaign.complete') : st.cleared ? tf('campaign.inProgress', { n: st.cleared, of: st.total }) : t('campaign.notStarted');
    const segs = op.levels.map((l, i) => '<i class="' + (campaignLevelState(op.id, i) === 'cleared' ? 'on' : '') + (l.isBoss ? ' boss' : '') + '"></i>').join('');
    return '<button class="cw-theater' + (unlocked ? '' : ' locked') + (beaten ? ' done' : '') + '" data-op="' + op.id + '"' + (unlocked ? '' : ' aria-disabled="true"') + '>' +
      '<span class="cw-theater-chart" style="background-image:url(\'assets/maps/' + op.id + '.svg\')"></span>' +
      '<span class="cw-theater-top"><b>' + tf('campaign.opN', { n: oi + 1 }) + '</b><span>' + cwEsc(t(op.theaterKey)) + '</span></span>' +
      '<span class="cw-theater-name">' + cwEsc(t(op.nameKey)) + '</span>' +
      '<span class="cw-theater-track">' + segs + '</span>' +
      '<span class="cw-theater-foot"><span>' + (unlocked ? '' : cwIcon('LOCK')) + cwEsc(status) + '</span><span class="cw-theater-stars">★ ' + st.got + '/' + st.max + '</span></span>' +
      '</button>';
  }).join('');
  setTxt('opsMeta', '★ ' + allGot + ' / ' + allMax);
  wrap.querySelectorAll('.cw-theater:not(.locked)').forEach(c => c.addEventListener('click', () => openOperationLore(c.getAttribute('data-op'))));
}

function openOperationLore(opId, force) {
  const op = OPERATIONS.find(o => o.id === opId); if (!op) return;
  campaignMode = false; campaignOpId = opId; opSector = null; paused = true;
  const ov = g('opLore'); if (!ov) { openLevelMap(opId); return; }
  setTxt('opLoreTitle', t(op.nameKey));
  setTxt('opLoreTheater', t(op.theaterKey));
  setTxt('opLoreH', t('campaign.background'));
  setTxt('opLoreBody', t(op.loreKey));
  const ch = g('opLoreChart'); if (ch) ch.style.backgroundImage = "url('assets/maps/" + op.id + ".svg')";
  showScreen('opLore');
  const st = opStars(op);
  const go = g('opLoreGo'); if (go) { go.textContent = '▶ ' + t(st.cleared ? 'campaign.resume' : 'campaign.enter'); go.onclick = () => { openLevelMap(opId); }; }
  const back = g('opLoreBack'); if (back) { back.textContent = '◀ ' + t('campaign.back'); back.onclick = () => { openOperationsSelect(); }; }
  if (audio.on) audio.ui();
}

let sortieSel = -1;
function openLevelMap(opId, selIdx) {
  campaignMode = false; campaignOpId = opId; opSector = null; paused = true;
  const ov = g('levelMap'); if (!ov) return;
  const op = OPERATIONS.find(o => o.id === opId); if (!op) return;
  if (selIdx == null) { selIdx = op.levels.findIndex((l, i) => campaignLevelState(opId, i) === 'unlocked'); if (selIdx < 0) selIdx = op.levels.length - 1; }
  sortieSel = selIdx;
  renderLevelMap(opId);
  showScreen('levelMap');
  const rd = g('levelMapTech'); if (rd) { rd.textContent = '⚒ ' + t('campaign.rd'); rd.onclick = () => { if (campaignPlayerOpId === opId && player && typeof openTechScreen === 'function') { ov.classList.remove('show'); openTechScreen(); } }; }
  const back = g('levelMapBack'); if (back) { back.textContent = '◀ ' + t('campaign.back'); back.onclick = () => { openOperationsSelect(); }; }
  if (audio.on) audio.ui();
}
function renderLevelMap(opId) {
  const op = OPERATIONS.find(o => o.id === opId); if (!op) return;
  setTxt('levelMapTitle', t(op.nameKey));
  const st = opStars(op);
  setTxt('levelMapMeta', tf('campaign.clearedOf', { n: st.cleared, of: st.total }) + '   ★ ' + st.got + '/' + st.max);
  const rd = g('levelMapTech'); if (rd) rd.style.display = (campaignPlayerOpId === opId && player) ? '' : 'none';
  const wrap = g('levelNodes'); if (!wrap) return;
  const states = op.levels.map((l, i) => campaignLevelState(opId, i));
  const nextIdx = states.indexOf('unlocked');
  let legs = '';
  for (let i = 1; i < op.levels.length; i++) {
    const a = op.levels[i - 1].coords, b = op.levels[i].coords;
    const cls = states[i] === 'cleared' ? 'flown' : i === nextIdx ? 'next' : 'future';
    legs += '<line class="' + cls + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" vector-effect="non-scaling-stroke"/>';
  }
  const dots = op.levels.map((lvl, i) => {
    const stt = states[i];
    const cls = 'cw-node ' + stt + (i === nextIdx ? ' next' : '') + (lvl.isBoss ? ' boss' : '') + (i === sortieSel ? ' sel' : '');
    const ico = stt === 'locked' ? cwIcon('LOCK') : stt === 'cleared' ? cwIcon('CHECK') : cwIcon(lvl.type);
    return '<button class="' + cls + '" data-idx="' + i + '" style="left:' + lvl.coords.x + '%;top:' + lvl.coords.y + '%" aria-label="' + cwEsc((i + 1) + ' ' + t(lvl.nameKey)) + '">' +
      '<span class="cw-pin">' + ico + '</span>' +
      '<span class="cw-tag"><b>' + ('0' + (i + 1)).slice(-2) + '</b> ' + cwEsc(t(lvl.nameKey)) + (stt === 'cleared' ? ' ' + starRow(levelBest(opId, lvl)) : '') + '</span></button>';
  }).join('');
  wrap.innerHTML = '<div class="cw-chart-art" style="background-image:url(\'assets/maps/' + opId + '.svg\')"></div>' +
    '<svg class="cw-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + legs + '</svg>' + dots;
  wrap.querySelectorAll('.cw-node').forEach(n => {
    n.addEventListener('click', () => {
      const i = +n.getAttribute('data-idx');
      if (i === sortieSel && states[i] !== 'locked') { openBriefing(opId, i); return; }
      sortieSel = i; renderLevelMap(opId); if (audio.on) audio.ui();
    });
  });
  renderSortieCard(op, sortieSel, states);
}
function renderSortieCard(op, idx, states) {
  const card = g('sortieCard'); if (!card) return;
  const lvl = op.levels[idx]; if (!lvl) { card.innerHTML = ''; return; }
  const stt = states[idx];
  const beats = levelBeats(lvl);
  const conds = levelConds(lvl);
  const best = levelBest(op.id, lvl);
  const prev = idx > 0 ? t(op.levels[idx - 1].nameKey) : '';
  card.innerHTML =
    '<div class="cw-sortie-head">' + cwIcon(lvl.type) + '<span>' + tf('campaign.sectorN', { n: ('0' + (idx + 1)).slice(-2) }) + ' · ' + cwEsc(t('campaign.type.' + lvl.type)) + '</span></div>' +
    '<h3 class="cw-sortie-name">' + cwEsc(t(lvl.nameKey)) + '</h3>' +
    '<div class="cw-chips">' + condLabel(lvl).map(c => '<span>' + cwEsc(c) + '</span>').join('') + '</div>' +
    '<ol class="cw-plan cw-plan-mini">' + beats.map(b => '<li>' + cwIcon(b.type) + '<span>' + cwEsc(b.text) + '</span>' + (b.clock ? '<em>' + b.clock + '</em>' : '') + '</li>').join('') + '</ol>' +
    '<div class="cw-sortie-stars">' + starRow(best) + '<span>' + cwEsc(conds.map(c => tf('stars.cond.' + c.type, { n: c.n || 0 })).join(' / ')) + '</span></div>' +
    (stt === 'locked'
      ? '<div class="cw-sortie-lock">' + cwIcon('LOCK') + cwEsc(tf('campaign.clearFirst', { name: prev })) + '</div>'
      : '<button class="cw-go cw-sortie-go" id="sortieBrief">' + t(stt === 'cleared' ? 'campaign.replayBrief' : 'campaign.brief') + ' ▶</button>');
  const b = g('sortieBrief'); if (b) b.onclick = () => openBriefing(op.id, idx);
}

function openBriefing(opId, idx) {
  const op = OPERATIONS.find(o => o.id === opId); if (!op) return;
  const lvl = op.levels[idx]; if (!lvl) return;
  const ov = g('briefing'); if (!ov) return;
  setTxt('briefTitle', ('0' + (idx + 1)).slice(-2) + '  ' + t(lvl.nameKey));
  const bc = g('briefCond'); if (bc) bc.innerHTML = '<span>' + cwEsc(t(op.nameKey)) + '</span>' + condLabel(lvl).map(c => '<span>' + cwEsc(c) + '</span>').join('');
  const fallback = t(lvl.isBoss && lvl.boss && lvl.boss.introKey ? lvl.boss.introKey : lvl.loreKey);
  const bk = (typeof levelBlurbKey === 'function') ? levelBlurbKey(lvl) : null;
  const blurb = bk ? t(bk) : '';
  setTxt('briefLore', (blurb && blurb !== bk) ? blurb : fallback);
  setTxt('briefObjectives', t(lvl.objectivesKey));
  let intel = t(lvl.enemyIntelKey);
  if (lvl.isBoss && lvl.boss && lvl.boss.phases) intel += '\n' + lvl.boss.phases.map(ph => '• ' + t(ph.descKey)).join('\n');
  setTxt('briefIntel', intel);
  const plan = g('briefPlan');
  if (plan) plan.innerHTML = levelBeats(lvl).map(b => '<li>' + cwIcon(b.type) + '<span><b>' + cwEsc(t('campaign.type.' + b.type)) + '</b>' + cwEsc(b.text) + '</span>' + (b.clock ? '<em>' + b.clock + '</em>' : '') + '</li>').join('');
  const sl = g('briefStars');
  if (sl) {
    const best = levelBest(opId, lvl);
    sl.innerHTML = levelConds(lvl).map((c, i) => '<li class="' + (i < best ? 'got' : '') + '">★ ' + cwEsc(tf('stars.cond.' + c.type, { n: c.n || 0 })) + '</li>').join('');
  }
  setTxt('briefLoadout', campaignLoadoutSummary(opId));
  setTxt('briefLoreH', t('campaign.situation')); setTxt('briefObjH', t('campaign.flightPlan'));
  setTxt('briefIntelH', t('campaign.enemyIntel')); setTxt('briefLoadoutH', t('campaign.loadout')); setTxt('briefStarsH', t('campaign.starTargets'));
  showScreen('briefing');
  const play = g('briefPlay'); if (play) { play.textContent = '▶ ' + t('campaign.play'); play.onclick = () => launchLevel(opId, idx); play.focus({ preventScroll: true }); }
  const back = g('briefBack'); if (back) { back.textContent = '◀ ' + t('campaign.back'); back.onclick = () => { openLevelMap(opId, idx); }; }
  if (audio.on) audio.ui();
}
function campaignLoadoutSummary(opId) {
  const jet = JETS[selectedJet];
  const parts = [];
  if (jet) parts.push(jet.name || jet.id);
  const rp = (campaignPlayerOpId === opId && player) ? (player.tp || 0) : 0;
  parts.push('RP ' + rp);
  if (special2Id) parts.push('SPC2');
  return parts.join('  ·  ');
}

function enterOperationRun(opId) {
  clearCampaignArena();
  if (player && player.group) scene.remove(player.group);
  player = null;
  dailyMode = false; bossRush = false; weeklyMode = false;
  wingDmgMul = 1;
  createPlayer(selectedJet);
  applyMetaPerks(player);
  equipSpecial2(player, special2Id, JETS[selectedJet].id);
  player._cheatUsed = false;
  barrelRollCooldown = 0; barrelRollAnim = 0; barrelRollRequest = false;
  campaignPlayerOpId = opId;
  run = freshRun(performance.now());
  weatherSeed = (Math.random() * 0x7fffffff) | 0;
  if (typeof applyWeather === 'function') applyWeather('clear');
  if (typeof buildGroundObjects === 'function') buildGroundObjects();
  resetDraftState();
  resetAwacs();
}

function launchLevel(opId, idx) {
  const op = OPERATIONS.find(o => o.id === opId); if (!op) return;
  const lvl = op.levels[idx]; if (!lvl) return;
  if (typeof launchBlocked === 'function' && launchBlocked()) { showBanner(t('meta.buyNeeded')); audio.ui(); return; }
  hangarPreview.clear();
  if (typeof showLoading === 'function') showLoading();
  if (campaignPlayerOpId !== opId || !player) enterOperationRun(opId);
  campaignOpId = opId; campaignLevelIdx = idx;
  campaignWavesLeft = lvl.waves || campaignWaveCount(idx);
  player.hp = player.maxHp; if (player.maxShield) player.shield = player.maxShield;
  player.missiles = player.maxMissiles; player.flares = player.maxFlares;
  if (player.group) player.group.visible = true;
  campaignSnapshot = captureSnapshot(player);
  campaignLevelRunBase = snapshotRunCounters(run);
  campaignLevelT0 = performance.now();
  wave = 0; betweenWaves = true; waveTimer = 1.4; strikeWaveActive = false;
  mission = null; campaignBossPhases = null; noDamageWave = false;
  campaignMode = true; opSector = lvl.type;
  campaignEnd = null; if (typeof hideOutroStamp === 'function') hideOutroStamp();
  resetArenaForLevel(lvl);
  showScreen('playing'); paused = false;
  if (clock) clock.getDelta();
  if (startWingman) spawnWingman(false, 'STD');
  if (typeof hideLoading === 'function') hideLoading();
  if (typeof showMissionIntro === 'function') showMissionIntro(op, idx, lvl);
}

function campaignLevelComplete() {
  const opId = campaignOpId, idx = campaignLevelIdx;
  const lvl = currentCampaignLevel(); if (!lvl) return;
  campaignMode = false; campaignSnapshot = null; opSector = null;
  const firstClear = campaignLevelState(opId, idx) !== 'cleared';
  const rw = grantLevelRewards(idx, !!lvl.isBoss, !firstClear, CAMPAIGN_REPLAY_REWARDS);
  if (player) { player.tp = (player.tp || 0) + rw.rp; player.score += rw.score; }
  const lr = levelRunDelta(run, campaignLevelRunBase);
  lr.waveReached = lvl.waves || campaignWaveCount(idx);
  lr.timeSecs = campaignLevelT0 ? (performance.now() - campaignLevelT0) / 1000 : 0;
  lr.expectedKills = lr.spawned || 0;
  const conds = levelConds(lvl);
  const stars = evalStarsFor(lr, player, conds);
  campaignClearLevel(opId, idx, lvl.id, (player && player.score) || 0, stars);
  lastLevelResult = { stars: stars, conds: conds, lr: lr };
  if (lvl.isBoss) { operationComplete(); return; }
  // NORMAL level win: stop the flight loop (state out of 'playing' so the main loop stops driving engine
  // audio + guns under the overlay — mirrors operationComplete), silence the hum, and show the dedicated
  // LEVEL CLEARED debrief (no SP award / hangar return). Continue → map.
  state = 'dead';
  if (typeof audio !== 'undefined' && audio.stopEngine) audio.stopEngine();
  clearCampaignArena();
  showLevelCleared(opId, idx, lvl, rw, firstClear);
}

function renderStarList(el, conds, lr) {
  if (!el) return;
  el.innerHTML = (conds || []).slice(0, 3).map(c => {
    const met = starCondMet(c, lr);
    return '<li class="' + (met ? 'got' : 'miss') + '">' + (met ? '★ ' : '☆ ') + cwEsc(tf('stars.cond.' + c.type, { n: c.n || 0 })) + '</li>';
  }).join('');
}
function statCells(st) {
  return [['campaign.stat.time', st.time], ['campaign.stat.kills', st.kills], ['campaign.stat.acc', st.acc + '%'], ['campaign.stat.dmg', st.dmg]]
    .map(r => '<div><span>' + cwEsc(t(r[0])) + '</span><b>' + cwEsc(r[1]) + '</b></div>').join('');
}
function showLevelCleared(opId, idx, lvl, rw, firstClear) {
  const ov = g('levelCleared'); if (!ov) { openLevelMap(opId); return; }
  const res = lastLevelResult || { stars: 0, conds: levelConds(lvl), lr: {} };
  lastLevelResult = null;   // consumed by THIS panel — never let it linger into a later non-campaign endRun debrief
  const op = OPERATIONS.find(o => o.id === opId);
  setTxt('lvlcSub', ((op && t(op.nameKey)) || '') + '  ·  ' + ('0' + (idx + 1)).slice(-2) + ' ' + t(lvl.nameKey));
  setTxt('lvlcTitle', t('campaign.accomplished'));
  const pips = g('lvlcPips');
  if (pips) { pips.innerHTML = [0, 1, 2].map(i => '<span class="' + (i < res.stars ? 'on' : '') + '" style="--i:' + i + '">★</span>').join(''); pips.setAttribute('aria-label', res.stars + ' / 3'); }
  renderStarList(g('lvlcConds'), res.conds, res.lr);
  const sc = g('lvlcStats'); if (sc) sc.innerHTML = statCells(levelDebriefStats(res.lr || {}));
  const rr = g('lvlcRewards'); if (rr) rr.textContent = '+' + (rw ? rw.rp : 0) + ' RP   +' + (rw ? rw.score : 0).toLocaleString() + ' ' + t('campaign.stat.score') + (firstClear ? '' : '   (' + t('campaign.replayRate') + ')');
  const hasNext = op && idx + 1 < op.levels.length;
  const go = g('lvlcContinue');
  if (go) { go.textContent = hasNext ? t('campaign.nextMission') + ' ▶' : t('campaign.continueMap'); go.onclick = () => { if (hasNext) openBriefing(opId, idx + 1); else openLevelMap(opId); }; }
  const mp = g('lvlcMap'); if (mp) { mp.textContent = t('campaign.map'); mp.onclick = () => openLevelMap(opId, hasNext ? idx + 1 : idx); }
  const rp = g('lvlcReplay'); if (rp) { rp.textContent = t('campaign.replay'); rp.onclick = () => launchLevel(opId, idx); }
  showScreen('levelCleared');
  if (go) go.focus({ preventScroll: true });
  if (audio.on) audio.ui();
}
function showLevelFailed(opId, idx, lvl, reason, lr) {
  const ov = g('levelFailed'); if (!ov) { openLevelMap(opId); return; }
  const op = OPERATIONS.find(o => o.id === opId);
  setTxt('lvlfSub', ((op && t(op.nameKey)) || '') + '  ·  ' + ('0' + (idx + 1)).slice(-2) + ' ' + (lvl ? t(lvl.nameKey) : ''));
  setTxt('lvlfTitle', t('campaign.failed'));
  setTxt('lvlfReason', t(failReasonKey(reason)));
  setTxt('lvlfTip', t('fail.tip.' + (FAIL_REASONS.indexOf(reason) >= 0 ? reason : 'objective')));
  const sc = g('lvlfStats'); if (sc) sc.innerHTML = statCells(levelDebriefStats(lr || {}));
  setTxt('lvlfNote', t('campaign.retryNote'));
  const rt = g('lvlfRetry'); if (rt) { rt.textContent = '▶ ' + t('campaign.retry'); rt.onclick = () => launchLevel(opId, idx); }
  const mp = g('lvlfMap'); if (mp) { mp.textContent = t('campaign.map'); mp.onclick = () => openLevelMap(opId, idx); }
  showScreen('levelFailed');
  if (rt) rt.focus({ preventScroll: true });
  if (audio.on) audio.ui();
}

function campaignLevelFailed(reason) {
  const opId = campaignOpId, idx = campaignLevelIdx;
  const lvl = currentCampaignLevel();
  const lr = levelRunDelta(run, campaignLevelRunBase);
  lr.timeSecs = campaignLevelT0 ? (performance.now() - campaignLevelT0) / 1000 : 0;
  campaignMode = false; campaignEnd = null;
  if (typeof audio !== 'undefined' && audio.stopEngine) audio.stopEngine();
  if (campaignSnapshot && player) {
    const r = rollbackSnapshot(campaignSnapshot);
    player.tp = r.rp; player.score = r.score;
  }
  campaignSnapshot = null; opSector = null;
  if (player && player.group) player.group.visible = true;
  clearCampaignArena();
  if (typeof hideOutroStamp === 'function') hideOutroStamp();
  showLevelFailed(opId, idx, lvl, reason || 'objective', lr);
}

function startBossRush() {
  if (state !== 'hangar') return;
  if (!meta || (!meta.bossRushUnlocked && !devUnlockAll)) { showBanner(t('bossrush.locked')); audio.ui(); return; }
  let jetIdx = 0;
  for (let k = 0; k < JETS.length; k++) { if (JETS[k].id === STARTER_JETS[0]) { jetIdx = k; break; } }
  opMode = false;
  startGame(jetIdx, false, true);
  if (state === 'playing') { spawnBossRushBoss(); showBanner(t('bossrush.title')); }
}
function bossRushComplete() {
  if (state !== 'playing') return;
  const secs = Math.max(0, Math.round((performance.now() - bossRushT0) / 1000));
  if (meta) { meta.bossRushBest = betterTime(meta.bossRushBest || 0, secs); saveMeta(); }
  player.score += 8000;
  state = 'dead';
  choosingUpgrade = false; g('upgrade').classList.remove('show');
  showBanner(tf('bossrush.cleared', { t: bossRushTimeStr(secs) }));
  endRun(t('bossrush.title'), true);
  if (typeof refreshBossRushEntry === 'function') refreshBossRushEntry();
}
function bossRushTimeStr(secs) { return (Math.floor(secs / 60)) + ':' + ('0' + (secs % 60)).slice(-2); }
function refreshBossRushEntry() {
  const btn = g('bossRushBtn'); if (!btn) return;
  const unlocked = devUnlockAll || !!(meta && meta.bossRushUnlocked);
  btn.disabled = !unlocked;
  btn.classList.toggle('disabled', !unlocked);
  btn.classList.toggle('is-locked', !unlocked);
  btn.textContent = unlocked ? t('bossrush.start') : t('bossrush.locked');
  const note = g('bossRushNote');
  if (note) {
    const best = (meta && meta.bossRushBest) || 0;
    note.textContent = !unlocked ? t('bossrush.locked')
      : (best > 0 ? tf('bossrush.best', { t: bossRushTimeStr(best) }) : t('bossrush.sub'));
  }
}

// CRITICAL: the clock is read ONCE here at the call site (browser runtime); the pure fns
// (dailySeedFor/makeRng in globals.js) never call new Date(). y/m/d are passed in.
function todayParts() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }; }
function todayKey() { const p = todayParts(); return p.y + '-' + ('0' + p.m).slice(-2) + '-' + ('0' + p.d).slice(-2); }
// NOT loadHealed: this is a nullable pass-through (returns the stored object or null) — the default
// record is built date-based in dailyToday (fresh unplayed when the stored date != today), not by
// typeof-key filling. loadHealed's fill-missing-keys shape does not apply, so it stays hand-rolled.
function loadDaily() {
  try { const o = JSON.parse(store.get('skystrike_daily') || 'null'); if (o && typeof o === 'object') return o; } catch (e) {}
  return null;
}
function saveDaily(o) { try { store.set('skystrike_daily', JSON.stringify(o)); } catch (e) {} }
function dailyToday() {
  const key = todayKey(); const rec = loadDaily();
  if (rec && rec.date === key) return rec;
  return { date: key, played: false, best: 0 };
}
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
function startDaily() {
  if (state !== 'hangar') return;
  const rec = dailyToday();
  if (rec.played) { showBanner(t('daily.locked')); if (audio.on) audio.ui(); return; }
  const p = todayParts();
  const seed = dailySeedFor(p.y, p.m, p.d);
  // mark the attempt as consumed up front (one attempt/day, even if the player bails mid-run)
  saveDaily({ date: rec.date, played: true, best: rec.best || 0 });
  opMode = false;
  const rng = makeRng(seed);
  const jetIdx = Math.floor(rng() * JETS.length) % JETS.length;
  dailySeed = seed;
  startGame(jetIdx, true);
}

// CRITICAL: the clock is read ONCE here at the call site (todayKey, browser runtime); the pure fns
// (weeklySeedFor/weekIdFor/weeklyModifiers in core.js) never read the clock. These state vars live
// here (not globals.js) because globals.js is not F8-owned; being top-level makes them readable by
// main.js spawn guards / ui-hangar wiring at runtime.
let weeklyMode = false;
let weeklySeed = 1;
let weeklyMods = null;
let weeklyWavePlan = null;
function weeklyThisWeek() {
  const key = todayKey();
  const seed = weeklySeedFor(key);
  return {
    id: weekIdFor(key), seed: seed,
    mods: weeklyModifiers(seed, packRuntime.modPool).map(function (m) { return m.id; }),
    wavePlan: weeklyWavePattern(seed, packRuntime.wavePatterns),
  };
}
function weeklyModNames(ids) {
  return (ids || []).map(function (id) { return t('weekly.mod.' + id); }).join('  ·  ');
}
// apply the 2 stacked modifiers onto the freshly-built player (called from startGame AFTER meta
// perks). Modifier effects are DATA (core.js WEEKLY_MODIFIERS + pack modifiers, merged by pure
// weeklyEffectsFor): ordnance/turn knobs apply here once; behavioural knobs (lockWeather,
// extraAces) + the weekly wave plan are enforced per-wave by the main.js nextWave guards via
// player._weeklyEffects/_weeklyAces/_weeklyWavePlan. ui-tech.js re-seals ordnance from
// _weeklyEffects after every tech/armory buy.
function applyWeeklyMods(p, ids) {
  if (!p || !ids) return;
  p._weeklyMods = ids.slice();
  const fx = weeklyEffectsFor(ids, packRuntime.modPool);
  p._weeklyEffects = fx;
  p._weeklyAces = fx.extraAces || 0;
  p._weeklyWavePlan = weeklyWavePlan || null;
  if (fx.flares != null)   { p.flares = fx.flares; p.maxFlares = fx.flares; }
  if (fx.missiles != null) { p.missiles = fx.missiles; p.maxMissiles = fx.missiles; }
  if (fx.turnMul != null)  { p.turnMul = (p.turnMul || 1) * fx.turnMul; }
}
function refreshWeeklyEntry() {
  const wk = weeklyThisWeek();
  const btn = g('weeklyBtn');
  if (btn) btn.textContent = t('weekly.play');
  const note = g('weeklyNoteTxt');
  if (note) {
    const best = (typeof weeklyBest === 'function' && typeof meta !== 'undefined') ? weeklyBest(meta, wk.id) : 0;
    let line = t('weekly.sub').replace('{mods}', weeklyModNames(wk.mods));
    if (best > 0) line += '  ·  ' + t('weekly.best').replace('{best}', best.toLocaleString());
    note.textContent = line;
  }
}
function startWeekly() {
  if (state !== 'hangar') return;
  const wk = weeklyThisWeek();
  opMode = false;
  weeklySeed = wk.seed;
  weeklyMods = wk.mods;
  weeklyWavePlan = wk.wavePlan;
  const rng = makeRng(wk.seed);
  const jetIdx = Math.floor(rng() * JETS.length) % JETS.length;
  showBanner(t('weekly.title') + '  ·  ' + weeklyModNames(wk.mods));
  startGame(jetIdx, false, false, true);
}
