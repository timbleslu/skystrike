/* Campaign visual check: screenshots every campaign screen (theater board, dossier, sortie map, briefings) at
   desktop 1280×800 / phone 390×844 / phone-landscape 844×390, plus in-flight frames (title card, comms, escort,
   outro stamp) and both debriefs. Headless flight renders ~2-5 fps, so flight shots force Low gfx and
   fast-forward the sim with __ff(seconds).
   Usage: node scripts/shot-campaign.mjs [label] [all|menus|flight]   → .scratch/shots/<label>/<vp>-<screen>.png */
import { launchGame, bootToHangar } from './lib/boot.mjs';
import { mkdir } from 'fs/promises';
const label = process.argv[2] || 'after';
const which = process.argv[3] || 'all';   // all | menus | flight
const out = new URL('../.scratch/shots/' + label + '/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const vps = [{ n: 'desk', width: 1280, height: 800 }, { n: 'mob', width: 390, height: 844 }, { n: 'land', width: 844, height: 390 }];
for (const vp of vps) {
  if (which === 'flight' && vp.n === 'mob') continue;
  const { page, port, close } = await launchGame({ viewport: { width: vp.width, height: vp.height } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await bootToHangar(page, { port, returnToHangar: true });
  await page.evaluate(() => {
    const op = OPERATIONS[0];
    [3, 2, 3].forEach((st, i) => campaignClearLevel('ironVeil', i, op.levels[i].id, 12000, st));
    window.__ff = (sec) => { const dt = 1 / 30; for (let t = 0; t < sec && state === 'playing' && player; t += dt) { readFlightInput(); updatePlayer(dt); for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.alive) { tickEnemyStatus(e, dt); if (e.alive) updateEnemy(e, dt); } } updateWingmen(dt); updateBullets(dt, 1); updateMissiles(dt, 1); updateFlares(dt); updateParticles(dt); for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i].alive) enemies.splice(i, 1); updateMission(dt); tickCampaignEnd(dt); handleWaves(dt); updateDom(dt, hudViewState()); } };
  });
  if (which === 'flight') await page.evaluate(() => { if (typeof applySetting === 'function') applySetting('gfx', 'low'); });
  const shot = async (name, fn, wait) => { await page.evaluate(fn); await page.waitForTimeout(wait || 700); await page.screenshot({ path: out + vp.n + '-' + name + '.png' }); };
  if (which !== 'flight') {
    await shot('opsSelect', () => { opMode = true; openOperationsSelect(); });
    await shot('opLore', () => openOperationLore('ironVeil'));
    await shot('levelMap', () => openLevelMap('ironVeil'));
    await shot('levelMapSel', () => { const n = document.querySelector('.cw-node[data-idx="1"]'); n && n.click(); });
    await shot('briefing', () => openBriefing('ironVeil', 5));
    await shot('briefingBoss', () => openBriefing('ironVeil', 7));
  }
  if (vp.n !== 'mob' && which !== 'menus') {
    await page.evaluate(() => { try { localStorage.setItem('skystrike_seenMissionType_sweep', '1'); } catch (e) {} opMode = true; openBriefing('ironVeil', 5); launchLevel('ironVeil', 5); });
    await page.evaluate(() => { tutorial.active = false; tutorial.done = true; if (el.tut) el.tut.classList.remove('show'); });
    await page.evaluate(() => __ff(1.2)); await page.waitForTimeout(1500); await page.screenshot({ path: out + vp.n + '-flight-intro.png' });
    await page.evaluate(() => __ff(3)); await page.waitForTimeout(1500); await page.screenshot({ path: out + vp.n + '-flight-comms.png' });
    // clear the pickup-zone sweep so the escort beat starts, then let the raiders arrive
    await page.evaluate(() => { __ff(1); enemies.filter(e => e.alive).forEach(e => killEnemy(e, true)); __ff(16); });
    await page.waitForTimeout(1500); await page.screenshot({ path: out + vp.n + '-flight-escort.png' });
    await page.evaluate(() => { beginCampaignEnd('fail', 'convoyLost'); __ff(0.6); });
    await page.waitForTimeout(1200); await page.screenshot({ path: out + vp.n + '-flight-outro.png' });
    await page.evaluate(() => __ff(2.4)); await page.waitForTimeout(900); await page.screenshot({ path: out + vp.n + '-levelFailed.png' });
    await page.evaluate(() => { openBriefing('ironVeil', 4); launchLevel('ironVeil', 4); __ff(3); enemies.filter(e => e.alive).forEach(e => killEnemy(e, true)); mission.timer = 0.3; __ff(1); enemies.filter(e => e.alive).forEach(e => killEnemy(e, true)); __ff(1); enemies.filter(e => e.alive).forEach(e => killEnemy(e, true)); __ff(4); });
    await page.waitForTimeout(1600); await page.screenshot({ path: out + vp.n + '-levelCleared.png' });
  }
  console.log(vp.n, 'errors:', errs.slice(0, 10));
  await close();
}
