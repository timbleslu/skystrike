/* SKYSTRIKE — split from ui.js (god-file refactor). Global scope; load order among ui-*.js irrelevant, but all must load after deps and before controls.js/main.js. */
/* ui-flow.js: meta-progression screen, game lifecycle, end-run, boss rush, daily challenge. */
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
  if (!daily && !rush && typeof launchBlocked === 'function' && launchBlocked()) { showBanner(t('meta.buyNeeded')); audio.ui(); return; }   // previewing an UNOWNED skin → must BUY it first
  previewSkin = null;   // committing to launch → drop any transient preview (gameplay always uses the OWNED skin)
  if (opMode && !daily && !rush) { selectedJet = i; openOperationsSelect(); return; }   // Operations: enter campaign navigation (player built per-operation in launchLevel), not a direct run
  const _ptag = g('pilotTag');
  if (_ptag) {
    setTxt('pilotCallsignTxt', (meta && meta.callsign) || '');
    setTxt('pilotEmblemIcon', EMBLEM_GLYPHS[(meta && meta.emblem) || 'wings'] || '✈');
  }
  dailyMode = !!daily;   // explicit per-launch: only startDaily passes true; normal launches reset it to false
  bossRush = !!rush;     // F15: only startBossRush passes true; normal/daily launches reset it to false
  selectedJet = i; audio.init();
  closeManual();
  if (previewJet) { if (typeof previewScene !== 'undefined' && previewScene) previewScene.remove(previewJet); if (typeof disposeGroup === 'function') disposeGroup(previewJet); previewJet = null; }   // C2: preview lives in the ISOLATED previewScene now, not the shared scene
  if (platform) { scene.remove(platform); platform = null; }
  g('hangar').classList.add('hide');
  
  if (isTouchEnabled) g('touchControls').classList.add('show');

  wingDmgMul = 1;            // reset BEFORE building the player so a jet passive (F-47) can raise it
  createPlayer(i);
  if (!bossRush) applyMetaPerks(player);    // persistent meta-tree edges apply at run start, BEFORE in-run tech tree (F15: boss-rush is a FIXED loadout — no perks)
  equipSpecial2(player, special2Id, JETS[i].id);   // feature #3: load the equipped SLOT-2 special (or leave empty/inert if none/stale); slot 1 untouched
  for (let k = 0; k < decoys.length; k++) scene.remove(decoys[k].mesh);
  clearWingmen();
  enemies.length = bullets.length = missiles.length = flares.length = loots.length = particles.length = decoys.length = 0;
  pendingSpawns.length = 0;
  hitMarkers.length = dmgNumbers.length = 0;
  wave = 0; betweenWaves = true; waveTimer = 2.6; crateTimer = 9; strikeWaveActive = false;
  bossWaveNext = 0; bossWaveActive = false; lastWaveWasBoss = false;   // Endless boss schedule (balance 2026-06); seeded lazily in nextWave
  player._cheatUsed = false;   // APEX PREDATOR cheat-death is now ONCE PER RUN (balance 2026-06); reset here, NOT per wave
  barrelRollCooldown = 0; barrelRollAnim = 0; barrelRollRequest = false;
  barrelRollLastKeyTap = -999; barrelRollLastTouchTap = -999;
  opMap = null; opStage = 0; opSector = null; mission = null; setpieceActive = null;
  weatherT = 0; weatherSeed = dailyMode ? dailySeed : ((Math.random() * 0x7fffffff) | 0);   // daily fixes the weather seed; otherwise fresh per-run (standalone rolls derive from it)
  if (typeof applyWeather === 'function') applyWeather('clear');   // reset condition visuals; nextWave sets the per-sector/rolled weather
  if (typeof buildGroundObjects === 'function') buildGroundObjects();   // Track B: ground scatter deterministic from this run's weatherSeed (clearArena tore down the previous arena's)
  // (Operations campaign navigation is entered at the top of startGame via openOperationsSelect — genOpMap retired)
  if (_dewBeam) _dewBeam.visible = false;
  choosingUpgrade = false; pendingUpgrades = null; g('upgrade').classList.remove('show');
  resetDraftState();   // FRONTIER DRAFT (feature 4): fresh run seed + clear pin/pity/visit counter
  awacsUses = { strike: 0, resupply: 0, jam: 0 };   // AWACS use cap fresh each run (F10); nextWave also refreshes per sector
  awacsLast = { strike: 0, resupply: 0, jam: 0 };   // AWACS cooldown clock fresh each run (cooldown-gated, balance 2026-06)
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
  if (campaignMode) { campaignLevelFailed(); return; }   // Operations campaign: roll back to the pre-level checkpoint + return to the map (NOT run-end)
  state = 'dead';
  choosingUpgrade = false; pendingUpgrades = null; g('upgrade').classList.remove('show');
  explode(player.group.position, true);
  player.group.visible = false;
  clearWingmen();
  if (h2d) h2d.clearRect(0, 0, W, H);
  endRun(t('banner.missionFailed'));
}
// shared end-of-run overlay (death or operation victory) — fills stats and shows #gameover with the given title.
// `win` true = success outcome (debrief eyebrow turns --ok via .gowrap.win), default false = failure (--danger).
function endRun(title, win) {
  const gw = g('gameover').querySelector('.gowrap');
  if (gw) gw.classList.toggle('win', !!win);
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
  const spd = g('go_sp');
  if (spd) {
    // JUICE: SP earned ticks up from 0 over --dur-slow (the reward count-up). Reduced-motion sets it flat.
    if (prefersReducedMotion() || total <= 0) { spd.textContent = '+' + total.toLocaleString(); }
    else { countUp(spd, total, 560, v => '+' + Math.round(v).toLocaleString()); }
  }
  const spt = g('go_spTotal'); if (spt) spt.textContent = spBalance().toLocaleString();
  // render grade letter + bonus; A/S glow reward-gold, B/C glow primary-cyan (.grade-low)
  const dg = g('go_grade'); if (dg) { dg.querySelector('.grade-letter').textContent = grade.letter; dg.querySelector('.grade-bonus').textContent = t('grade.bonus') + ' x' + grade.mult.toFixed(2); }
  if (gw) gw.classList.toggle('grade-low', !(grade.letter === 'S' || grade.letter === 'A'));
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
  // JUICE: retrigger the staged reward reveal (grade snap → stars → SP rise) each time the debrief opens.
  if (gw && !prefersReducedMotion()) { gw.classList.remove('reveal'); void gw.offsetWidth; gw.classList.add('reveal'); }
  else if (gw) gw.classList.add('reveal');
}
function operationComplete() {
  if (state !== 'playing') return;
  state = 'dead';
  choosingUpgrade = false; pendingUpgrades = null; g('upgrade').classList.remove('show');
  player.score += 5000;
  // F15: clearing the campaign once unlocks Boss Rush mode (persisted; healed for legacy saves)
  if (meta && !meta.bossRushUnlocked) { meta.bossRushUnlocked = true; saveMeta(); }
  showBanner(t('banner.operationComplete'));
  endRun(t('banner.operationComplete'), true);
  if (typeof refreshBossRushEntry === 'function') refreshBossRushEntry();   // reflect the new unlock in the hangar
}

/* ===================== Operations campaign (linear multi-operation revamp) =====================
   Three-tier navigation: operations-select → linear level map → mission briefing → bounded level.
   ONE player persists across an operation's levels (RP/tech accumulate); each level snapshots the
   pre-level economy and rolls back on death. There is NO mid-level tech screen (shopping happens
   between levels from the map), so a failed attempt only loses in-level RP/score — tech bought
   between levels lives in the next level's snapshot and is preserved. Beating the operation's boss
   level completes the operation (unlocks the next) via operationComplete. */
let campaignBriefOp = null, campaignBriefIdx = -1;   // briefing-screen target

// clear the live arena between levels but KEEP the player (clearArena nulls the player; we don't want that)
function clearCampaignArena() {
  for (let i = 0; i < enemies.length; i++) { scene.remove(enemies[i].group); if (enemies[i].marker) scene.remove(enemies[i].marker); }
  for (let i = 0; i < bullets.length; i++) scene.remove(bullets[i].mesh);
  for (let i = 0; i < missiles.length; i++) scene.remove(missiles[i].mesh);
  for (let i = 0; i < flares.length; i++) scene.remove(flares[i].mesh);
  for (let i = 0; i < loots.length; i++) scene.remove(loots[i].mesh);
  for (let i = 0; i < particles.length; i++) scene.remove(particles[i].mesh);
  for (let i = 0; i < decoys.length; i++) scene.remove(decoys[i].mesh);
  clearWingmen();
  enemies.length = bullets.length = missiles.length = flares.length = loots.length = particles.length = decoys.length = 0;
  pendingSpawns.length = 0; hitMarkers.length = 0; dmgNumbers.length = 0;
  if (typeof BPOOL !== 'undefined') BPOOL.length = 0;
  mission = null; setpieceActive = null;
}

// hangar "Operations" launch entry → the operations-select screen (player NOT built yet)
function openOperationsSelect() {
  campaignMode = false; campaignOpId = null; opSector = null; paused = true;
  g('hangar').classList.add('hide');
  const ov = g('opsSelect'); if (!ov) return;
  renderOperationsSelect();
  g('briefing') && g('briefing').classList.remove('show');
  g('levelMap') && g('levelMap').classList.remove('show');
  ov.classList.add('show');
  setTxt('opsTitle', t('campaign.operations'));
  const back = g('opsBack'); if (back) { back.textContent = '◀ ' + t('campaign.back'); back.onclick = () => { ov.classList.remove('show'); campaignPlayerOpId = null; returnToHangar(); }; }
  if (audio.on) audio.ui();
}
function renderOperationsSelect() {
  const wrap = g('opsList'); if (!wrap) return;
  wrap.innerHTML = OPERATIONS.map((op, oi) => {
    const unlocked = campaignOpUnlocked(op.id);
    const beaten = campaignLevelState(op.id, op.levels.length - 1) === 'cleared';
    const cls = 'op-card' + (unlocked ? '' : ' locked') + (beaten ? ' done' : '');
    const sub = !unlocked ? t('campaign.locked') : beaten ? t('campaign.cleared') : t(op.theaterKey);
    return '<div class="' + cls + '" data-op="' + op.id + '"><div class="op-card-n">' + (oi + 1) +
      '</div><div class="op-card-name">' + t(op.nameKey) + '</div><div class="op-card-sub">' + sub + '</div></div>';
  }).join('');
  wrap.querySelectorAll('.op-card:not(.locked)').forEach(c => c.addEventListener('click', () => {
    g('opsSelect').classList.remove('show');
    openOperationLore(c.getAttribute('data-op'));
  }));
}

// op-lore panel (§5): tapping an operation surfaces its multi-paragraph backstory BEFORE the level
// map. "Enter" proceeds into the operation's level map; "Back" returns to the operations list.
function openOperationLore(opId) {
  const op = OPERATIONS.find(o => o.id === opId); if (!op) return;
  campaignMode = false; campaignOpId = opId; opSector = null; paused = true;
  g('opsSelect') && g('opsSelect').classList.remove('show');
  const ov = g('opLore'); if (!ov) { openLevelMap(opId); return; }   // graceful fallback if markup is absent
  setTxt('opLoreTitle', t(op.nameKey));
  setTxt('opLoreH', t('campaign.background'));
  setTxt('opLoreBody', t(op.loreKey));
  ov.classList.add('show');
  const go = g('opLoreGo'); if (go) { go.textContent = '▶ ' + t('campaign.enter'); go.onclick = () => { ov.classList.remove('show'); openLevelMap(opId); }; }
  const back = g('opLoreBack'); if (back) { back.textContent = '◀ ' + t('campaign.back'); back.onclick = () => { ov.classList.remove('show'); openOperationsSelect(); }; }
  if (audio.on) audio.ui();
}

// the linear level map for one operation (paused overlay; player persists if mid-operation)
function openLevelMap(opId) {
  campaignMode = false; campaignOpId = opId; opSector = null; paused = true;
  const ov = g('levelMap'); if (!ov) return;
  renderLevelMap(opId);
  g('briefing') && g('briefing').classList.remove('show');
  ov.classList.add('show');
  const rd = g('levelMapTech'); if (rd) { rd.textContent = '⚒ ' + t('campaign.rd'); rd.onclick = () => { if (campaignPlayerOpId === opId && player && typeof openTechScreen === 'function') { ov.classList.remove('show'); openTechScreen(); } }; }
  const back = g('levelMapBack'); if (back) { back.textContent = '◀ ' + t('campaign.back'); back.onclick = () => { ov.classList.remove('show'); openOperationsSelect(); }; }
  if (audio.on) audio.ui();
}
function renderLevelMap(opId) {
  const op = OPERATIONS.find(o => o.id === opId); if (!op) return;
  const title = g('levelMapTitle'); if (title) title.textContent = t(op.nameKey);
  const rd = g('levelMapTech'); if (rd) rd.style.display = (campaignPlayerOpId === opId && player) ? '' : 'none';   // R&D only mid-operation
  const wrap = g('levelNodes'); if (!wrap) return;
  // GEOGRAPHIC MAP: a per-op tactical SVG backdrop (CSS background-image — works from file://,
  // unlike fetch) with one absolutely-positioned mission dot per level at its lvl.coords %.
  // Progression logic is BYTE-FOR-BYTE the old behaviour: campaignLevelState → locked/unlocked/cleared,
  // boss adds a class, cleared shows star pips; locked dots get NO click listener, unlocked/cleared
  // dots → openBriefing(opId, idx). A faint route line traces the levels in order behind the dots.
  const route = op.levels.map((lvl, i) => (i ? 'L' : 'M') + lvl.coords.x + ' ' + lvl.coords.y).join(' ');
  const dots = op.levels.map((lvl, i) => {
    const st = campaignLevelState(opId, i);   // 'locked' | 'unlocked' | 'cleared'
    const rec = meta && meta.campaign && meta.campaign[opId] && meta.campaign[opId].levels[lvl.id];
    const stars = (rec && rec.bestStars) || 0;
    const pips = st === 'cleared' ? '<span class="opmap-stars">' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + '</span>' : '';
    return '<button class="opmap-dot ' + st + (lvl.isBoss ? ' boss' : '') + '" data-idx="' + i + '"' +
      (st === 'locked' ? ' disabled' : '') +
      ' style="left:' + lvl.coords.x + '%;top:' + lvl.coords.y + '%">' +
      '<span class="opmap-pin"></span>' +
      '<span class="opmap-tag"><span class="opmap-n">' + (i + 1) + '</span>' +
      '<span class="opmap-name">' + t(lvl.nameKey) + '</span>' + pips + '</span></button>';
  }).join('');
  wrap.innerHTML =
    '<div class="opmap-canvas" data-op="' + opId + '" style="background-image:url(\'assets/maps/' + opId + '.svg\')">' +
      '<svg class="opmap-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="' + route + '" fill="none" stroke="rgba(120,200,230,0.30)" stroke-width="0.5" stroke-dasharray="1.6 1.8" vector-effect="non-scaling-stroke"/>' +
      '</svg>' + dots +
    '</div>';
  // unlocked/cleared dots are clickable → briefing (IDENTICAL to the old list); locked dots are
  // disabled buttons with no listener.
  wrap.querySelectorAll('.opmap-dot.unlocked, .opmap-dot.cleared').forEach(n =>
    n.addEventListener('click', () => openBriefing(opId, +n.getAttribute('data-idx'))));
}

// full-screen mission briefing (a navigation layer visited BEFORE launch — not the in-game modal)
function openBriefing(opId, idx) {
  const op = OPERATIONS.find(o => o.id === opId); if (!op) return;
  const lvl = op.levels[idx]; if (!lvl) return;
  campaignBriefOp = opId; campaignBriefIdx = idx;
  g('levelMap') && g('levelMap').classList.remove('show');
  const ov = g('briefing'); if (!ov) return;
  setTxt('briefTitle', t(op.nameKey) + ' — ' + t('campaign.level') + ' ' + (idx + 1) + ': ' + t(lvl.nameKey));
  setTxt('briefLore', t(lvl.isBoss && lvl.boss && lvl.boss.introKey ? lvl.boss.introKey : lvl.loreKey));
  setTxt('briefObjectives', t(lvl.objectivesKey));
  let intel = t(lvl.enemyIntelKey);
  if (lvl.isBoss && lvl.boss && lvl.boss.phases) intel += '\n' + lvl.boss.phases.map(ph => '• ' + t(ph.descKey)).join('\n');
  setTxt('briefIntel', intel);
  setTxt('briefLoadout', campaignLoadoutSummary(opId));
  setTxt('briefLoreH', t('campaign.situation')); setTxt('briefObjH', t('campaign.objectives'));
  setTxt('briefIntelH', t('campaign.enemyIntel')); setTxt('briefLoadoutH', t('campaign.loadout'));
  ov.classList.add('show');
  const play = g('briefPlay'); if (play) { play.textContent = '▶ ' + t('campaign.play'); play.onclick = () => launchLevel(opId, idx); }
  const back = g('briefBack'); if (back) { back.textContent = '◀ ' + t('campaign.back'); back.onclick = () => { ov.classList.remove('show'); openLevelMap(opId); }; }
  if (audio.on) audio.ui();
}
// read-only loadout summary for the briefing screen
function campaignLoadoutSummary(opId) {
  const jet = JETS[selectedJet];
  const parts = [];
  if (jet) parts.push(jet.name || jet.id);
  const rp = (campaignPlayerOpId === opId && player) ? (player.tp || 0) : 0;
  parts.push('RP ' + rp);
  if (special2Id) parts.push('SPC2');
  return parts.join('  ·  ');
}

// build a fresh player for a NEW operation run (RP 0, no in-run tech; meta perks applied)
function enterOperationRun(opId) {
  clearCampaignArena();
  if (player && player.group) scene.remove(player.group);
  player = null;
  dailyMode = false; bossRush = false;
  wingDmgMul = 1;
  createPlayer(selectedJet);
  applyMetaPerks(player);
  equipSpecial2(player, special2Id, JETS[selectedJet].id);
  player._cheatUsed = false;
  barrelRollCooldown = 0; barrelRollAnim = 0; barrelRollRequest = false;
  campaignPlayerOpId = opId;
  run = { shots: 0, hits: 0, missiles: 0, kills: 0, ground: 0, boss: 0, missions: 0, t0: performance.now(), escortKills: 0, pMissiles: 0, pGunKills: 0, pFlares: 0, lastRivalWave: 0, damageTaken: 0, sectorAceSpawned: {}, setpieceDone: {}, cleanWaves: 0 };
  weatherT = 0; weatherSeed = (Math.random() * 0x7fffffff) | 0;
  if (typeof applyWeather === 'function') applyWeather('clear');
  if (typeof buildGroundObjects === 'function') buildGroundObjects();   // Track B: ground scatter deterministic from this run's weatherSeed
  resetDraftState();
  awacsUses = { strike: 0, resupply: 0, jam: 0 };
  awacsLast = { strike: 0, resupply: 0, jam: 0 };
}

// PLAY: launch the bounded level (builds the op player on first entry, reuses it after)
function launchLevel(opId, idx) {
  const op = OPERATIONS.find(o => o.id === opId); if (!op) return;
  const lvl = op.levels[idx]; if (!lvl) return;
  if (typeof launchBlocked === 'function' && launchBlocked()) { showBanner(t('meta.buyNeeded')); audio.ui(); return; }   // campaign launch respects the same unowned-skin gate
  previewSkin = null;   // committing to a level → drop any transient preview (op player uses the OWNED skin)
  g('briefing') && g('briefing').classList.remove('show');
  g('opsSelect') && g('opsSelect').classList.remove('show');
  g('levelMap') && g('levelMap').classList.remove('show');
  if (campaignPlayerOpId !== opId || !player) enterOperationRun(opId);   // fresh op run, or switching ops
  campaignOpId = opId; campaignLevelIdx = idx;
  campaignWavesLeft = lvl.waves || campaignWaveCount(idx);
  // every level starts at full health/ordnance (also covers retry after a failed attempt)
  player.hp = player.maxHp; if (player.maxShield) player.shield = player.maxShield;
  player.missiles = player.maxMissiles; player.flares = player.maxFlares;
  if (player.group) player.group.visible = true;
  campaignSnapshot = captureSnapshot(player);   // pre-level economy checkpoint (tp/score)
  wave = 0; betweenWaves = true; waveTimer = 1.4; strikeWaveActive = false;
  mission = null; setpieceActive = null; campaignBossPhases = null; noDamageWave = false;
  campaignMode = true; opSector = lvl.type;   // opSector reused as the level's mission/sector type
  state = 'playing'; paused = false;
  if (clock) clock.getDelta();
  if (isTouchEnabled) g('touchControls').classList.add('show');
  if (startWingman) spawnWingman(false, 'STD');
  showBanner(t('banner.launching'));
}

// WIN: commit rewards, persist the clear, return to the map (boss level → operation complete)
function campaignLevelComplete() {
  const opId = campaignOpId, idx = campaignLevelIdx;
  const lvl = currentCampaignLevel(); if (!lvl) return;
  campaignMode = false; campaignSnapshot = null; opSector = null;
  const firstClear = campaignLevelState(opId, idx) !== 'cleared';
  const rw = grantLevelRewards(idx, !!lvl.isBoss, !firstClear, CAMPAIGN_REPLAY_REWARDS);
  if (player) { player.tp = (player.tp || 0) + rw.rp; player.score += rw.score; }
  const stars = evalStars(run, player);
  campaignClearLevel(opId, idx, lvl.id, (player && player.score) || 0, stars);   // persists + advances furthest unlocked
  if (lvl.isBoss) { operationComplete(); return; }   // op boss → victory/debrief + unlock next operation
  clearCampaignArena();
  showBanner(t('campaign.cleared'));
  openLevelMap(opId);   // back to the paused map; the next node is now unlocked
}

// FAIL (death or objective failure): roll back the economy, return to the map, level stays unlocked
function campaignLevelFailed() {
  const opId = campaignOpId;
  campaignMode = false;
  if (campaignSnapshot && player) {
    const r = rollbackSnapshot(campaignSnapshot);   // pure; tech untouched (no mid-level shop) — only restore economy
    player.tp = r.rp; player.score = r.score;
  }
  campaignSnapshot = null; opSector = null;
  if (player && player.group) player.group.visible = true;   // un-hide (the gameOver guard returned before exploding)
  clearCampaignArena();
  showBanner(t('banner.missionFailed'));
  openLevelMap(opId);
}

// ===== Boss Rush mode (F15) =====
// Unlockable gauntlet: every boss in sequence, FIXED loadout, ONE life, NO tech tree. The run is
// timed; the lower (faster) full-clear time is kept as the local best. Death ends the run with no
// time recorded (gameOver → endRun). Completion records the time, then shows the result screen.
function startBossRush() {
  if (state !== 'hangar') return;
  if (!meta || (!meta.bossRushUnlocked && !devUnlockAll)) { showBanner(t('bossrush.locked')); audio.ui(); return; }
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
  endRun(t('bossrush.title'), true);
  if (typeof refreshBossRushEntry === 'function') refreshBossRushEntry();
}
// mm:ss for the leaderboard
function bossRushTimeStr(secs) { return (Math.floor(secs / 60)) + ':' + ('0' + (secs % 60)).slice(-2); }
// hangar entry: lock the button until unlocked; show the best time once set
function refreshBossRushEntry() {
  const btn = g('bossRushBtn'); if (!btn) return;
  const unlocked = devUnlockAll || !!(meta && meta.bossRushUnlocked);
  btn.disabled = !unlocked;
  btn.classList.toggle('disabled', !unlocked);
  btn.classList.toggle('is-locked', !unlocked);   // §3l: designed locked treatment, not just dimmed
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
