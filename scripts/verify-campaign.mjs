/* Headless campaign gate (campaign overhaul 2026-09). Plays EVERY campaign level with a god-mode bot on a
   fixed 30 Hz sim step (no render):
     kill mode    — the bot kills a hostile (raiders first) every KILL_EVERY s and flies recon/stealth
                    waypoints → every level must COMPLETE (no stall, no fail).
     passive mode — ESCORT/DEFEND levels only; the bot clears everything EXCEPT raiders → the level must
                    FAIL (the raiders are a real threat; ignoring them loses the convoy/asset).
   Exits non-zero on any wrong outcome or page error. Usage: node scripts/verify-campaign.mjs */
import { launchGame, bootToHangar } from './lib/boot.mjs';

const KILL_EVERY = 1.2, SIM_CAP = 900, DT = 1 / 30;
const { page, port, close } = await launchGame({ viewport: { width: 640, height: 400 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await bootToHangar(page, { port, returnToHangar: true });
await page.evaluate(() => {
  devUnlockLevels = true; window.__sw0 = startWingman;
  tutorial.active = false; tutorial.done = true;
  window.animate = function () {};   // stop the rAF loop; the bot steps the sim itself
  window.__step = function (dt) {    // animate()'s 'playing' branch, minus render
    readFlightInput(); updateWeather(dt); if (!(campaignEnd && campaignEnd.frozen)) updatePlayer(dt);
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (!e.alive) continue; tickEnemyStatus(e, dt); if (e.alive) updateEnemy(e, dt); }
    updateWingmen(dt); updateBullets(dt, 1); updateMissiles(dt, 1); updateFlares(dt); updateDecoys(dt); updateLoot(dt); updateParticles(dt);
    for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i].alive) enemies.splice(i, 1);
    updateMission(dt); tickCampaignEnd(dt); handleWaves(dt);
  };
});

const levels = await page.evaluate(() => OPERATIONS.flatMap(op => op.levels.map((l, i) => ({ op: op.id, idx: i, id: l.id, type: l.type }))));
const runs = levels.map(L => ({ L, mode: 'kill', want: 'COMPLETE' }))
  .concat(levels.filter(L => L.type === 'ESCORT' || L.type === 'DEFEND').map(L => ({ L, mode: 'passive', want: 'FAILED' })));

let bad = 0;
for (const { L, mode, want } of runs) {
  const r = await page.evaluate(({ L, mode, KILL_EVERY, SIM_CAP, DT }) => {
    let outcome = null;
    const origComplete = campaignLevelComplete, origFail = campaignLevelFailed;
    window.campaignLevelComplete = function () { outcome = outcome || 'COMPLETE'; return origComplete.apply(this, arguments); };
    window.campaignLevelFailed = function () { outcome = outcome || 'FAILED'; return origFail.apply(this, arguments); };
    if (state !== 'hangar') returnToHangar();
    startWingman = mode === 'passive' ? false : __sw0;   // a passive run must not have a wingman doing the defending
    launchLevel(L.op, L.idx);
    let simT = 0, killCd = 3;
    while (simT < SIM_CAP && !outcome) {
      player.hp = player.maxHp; player.invuln = 0;
      const m = mission;
      if (m && (m.type === 'recon' || m.type === 'stealth') && m.params.waypoints) {
        const wp = m.params.waypoints.find(w => !w.hit);
        if (wp) { const p = player.group.position; const dx = wp.x - p.x, dy = wp.y - p.y, dz = wp.z - p.z; const d = Math.hypot(dx, dy, dz); const s = Math.min(d, 1500 * DT); if (d > 1) { p.x += dx / d * s; p.y += dy / d * s; p.z += dz / d * s; } }
      }
      if (!(m && m.type === 'stealth') && (killCd -= DT) <= 0) {
        killCd = KILL_EVERY;
        const e = enemies.filter(e => e.alive && !e.stealthThreat && !(mode === 'passive' && e.raid)).sort((a, b) => (b.raid ? 1 : 0) - (a.raid ? 1 : 0))[0];
        if (e) { if (e.type === 'boss' || e.finalCap) damageEnemy(e, e.maxHp * 0.12, undefined, true); else killEnemy(e, true); }
      }
      __step(DT); simT += DT;
      if (state !== 'playing' && !outcome) outcome = 'STATE:' + state;
    }
    window.campaignLevelComplete = origComplete; window.campaignLevelFailed = origFail;
    if (state !== 'hangar') { try { returnToHangar(); } catch (e) {} }
    ['levelCleared', 'levelFailed', 'levelMap', 'gameover', 'briefing'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('show'); });
    return { outcome: outcome || 'STALL', simT: Math.round(simT), mission: mission && mission.type };
  }, { L, mode, KILL_EVERY, SIM_CAP, DT });
  const pass = r.outcome === want;
  if (!pass) bad++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${mode.padEnd(7)} ${L.op}:${L.idx} ${L.id} [${L.type}] -> ${r.outcome} @${r.simT}s${pass ? '' : ' (want ' + want + ', mission=' + r.mission + ')'}`);
}
await close();
if (errs.length) console.log('PAGE ERRORS', errs.slice(0, 10));
if (bad || errs.length) { console.log(`verify-campaign: FAIL (${bad} wrong outcomes, ${errs.length} page errors)`); process.exit(1); }
console.log(`verify-campaign: PASS (${runs.length} runs)`);
