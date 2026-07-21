/* Dev-only headless verification of CF CONTENT PACKS — the browser-only half the Node tests can't
   reach: the load-time merge in globals.js (packRuntime), a PACK formation flying through the REAL
   spawn path (spawnFighterFormation + applyFormationSteer holding template slots over real frames),
   and the weekly runtime drawing from the pack-extended pools. Mirrors verify-formation.mjs.
   Saves pack-check-diamond.png. Usage: node scripts/verify-packs.mjs */
import { launchGame, bootToHangar } from './lib/boot.mjs';
import { join } from 'path';
const { page, port, root, close } = await launchGame({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await bootToHangar(page, { port, gotoWait: 1400, mode: 'hide' });

// ---- load-time merge + weekly pools, all read from the LIVE runtime ----
const merge = await page.evaluate(() => {
  const wk = weeklyThisWeek();
  return {
    applied: packRuntime.applied,
    rejected: packRuntime.rejected,
    formationsMerged: ['diamond', 'spear', 'phalanx', 'column'].every(k => !!FORMATIONS[k]),
    baseIntact: ['vee', 'wall', 'echelon', 'pincer'].every(k => !!FORMATIONS[k]),
    modPoolSize: packRuntime.modPool.length,
    wavePatterns: packRuntime.wavePatterns.map(w => w.id),
    weeklyMods: wk.mods,
    weeklyModsFromPool: wk.mods.every(id => packRuntime.modPool.some(m => m.id === id)),
    weeklyModNamesResolve: wk.mods.every(id => t('weekly.mod.' + id) !== 'weekly.mod.' + id),
    wavePlanId: wk.wavePlan && wk.wavePlan.id,
  };
});

// ---- enter a run and fly a PACK formation (diamond) through the REAL spawn path ----
const setup = await page.evaluate(() => {
  opMode = false;
  startGame(0);
  updatePlayer = function () {};                  // freeze the player so the formation legitimately holds
  if (player) { player.hp = 1e9; player.invuln = 999; if (player.vel) player.vel.set(0, 0, 0); }
  pendingSpawns.length = 0; enemies.length = 0;
  const leader = spawnFighterFormation(4, 'diamond');   // pack formation via the SAME in-game path
  const followers = enemies.filter(e => e.formation);
  return { total: enemies.length, followers: followers.length, type: followers[0] && followers[0].formation.type, leaderHasFormation: !!(leader && leader.formation) };
});

await page.waitForTimeout(3500);                  // real frames — followers steer onto the template slots

const R = await page.evaluate(() => {
  const out = [];
  const ok = (name, cond) => out.push({ name, pass: !!cond });
  const followers = enemies.filter(e => e.alive && e.formation);
  const leader = enemies.find(e => e.alive && e.type === 'fighter' && !e.formation);
  ok('leader alive + flying NORMAL AI (no e.formation)', !!leader && !leader.formation);
  ok('all 3 diamond followers still HOLDING (e.formation set)', followers.length === 3);
  const lf = fwdQ(leader.logicQuat, new THREE.Vector3());
  const right = new THREE.Vector3().copy(lf).cross(UPV); if (right.lengthSq() > 1e-6) right.normalize();
  let maxErr = 0;
  for (const f of followers) {
    const off = f.formation.offset;
    const slot = new THREE.Vector3().copy(leader.group.position).addScaledVector(right, off.x).addScaledVector(lf, -off.z);
    const err = slot.distanceTo(f.group.position);
    if (err > maxErr) maxErr = err;
  }
  ok('every follower within tolerance of its TEMPLATE slot: maxErr=' + Math.round(maxErr) + ' < 600', maxErr < 600);
  const jets = [leader].concat(followers);
  let diam = 0;
  for (let i = 0; i < jets.length; i++) for (let j = i + 1; j < jets.length; j++) {
    const d = jets[i].group.position.distanceTo(jets[j].group.position);
    if (d > diam) diam = d;
  }
  ok('diamond is a tight cluster (diameter ' + Math.round(diam) + ') < 2200', diam < 2200);
  const c = new THREE.Vector3();
  for (const e of jets) c.add(e.group.position);
  c.multiplyScalar(1 / jets.length);
  const dir = new THREE.Vector3().copy(c).sub(player.group.position); if (dir.lengthSq() > 1e-6) dir.normalize();
  dirToQuat(dir, player.group.quaternion);
  if (player.logicQuat) dirToQuat(dir, player.logicQuat);
  ['langSelect', 'onboard', 'manual', 'touchControls', 'hangar', 'gameover'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  return out;
});

await page.waitForTimeout(500);
await page.screenshot({ path: join(root, 'pack-check-diamond.png') });

// ---- fresh reload: the WEEKLY wave plan drives wave 1 end-to-end (startWeekly → nextWave) ----
await bootToHangar(page, { port, gotoWait: 1400, mode: 'hide' });
const weekly = await page.evaluate(() => {
  startWeekly();
  if (player) { player.hp = 1e9; player.invuln = 999; }
  pendingSpawns.length = 0; enemies.length = 0;
  nextWave();                                     // the REAL per-wave path reads player._weeklyWavePlan
  processSpawnQueue(99);                          // drain the queue so the formation actually spawns
  const followers = enemies.filter(e => e.formation);
  const planned = player._weeklyWavePlan && player._weeklyWavePlan.pattern[0];
  return {
    planId: player._weeklyWavePlan && player._weeklyWavePlan.id,
    plannedRow: planned,
    fighters: enemies.filter(e => e.type === 'fighter').length,
    followers: followers.length,
    formationType: followers[0] && followers[0].formation.type,
  };
});

await close();

let fail = 0;
const check = (name, cond) => { console.log((cond ? 'ok   - ' : 'FAIL - ') + name); if (!cond) fail++; };
console.log('merge: ' + JSON.stringify(merge));
check('all 3 shipped packs applied at load', merge.applied.length === 3 && merge.rejected.length === 0);
check('pack formations merged into FORMATIONS (base 4 intact)', merge.formationsMerged && merge.baseIntact);
check('weekly modifier pool = base 5 + 4 pack mods', merge.modPoolSize === 9);
check('both wave patterns registered', merge.wavePatterns.length === 2);
check('this week draws 2 mods from the EXTENDED pool', merge.weeklyMods.length === 2 && merge.weeklyModsFromPool);
check('every drawn mod resolves an i18n name', merge.weeklyModNamesResolve);
check('this week has a wave plan (' + merge.wavePlanId + ')', !!merge.wavePlanId);
console.log('setup: ' + JSON.stringify(setup));
check('real spawn path: 1 leader + 3 diamond followers', setup.total === 4 && setup.followers === 3 && setup.type === 'diamond' && !setup.leaderHasFormation);
for (const r of R) { console.log((r.pass ? 'ok   - ' : 'FAIL - ') + r.name); if (!r.pass) fail++; }
console.log('weekly: ' + JSON.stringify(weekly));
check('weekly run carries a wave plan (' + weekly.planId + ')', !!weekly.planId);
check('wave 1 fighter count follows the plan row (' + weekly.fighters + ' = ' + (weekly.plannedRow && weekly.plannedRow.n) + ')', !!weekly.plannedRow && weekly.fighters === weekly.plannedRow.n);
check('wave 1 formation matches the pinned type (' + weekly.formationType + ')', !weekly.plannedRow || !weekly.plannedRow.formation || (weekly.formationType === weekly.plannedRow.formation && weekly.followers === weekly.plannedRow.n - 1));
if (errs.length) { console.log('\nPAGE ERRORS:'); errs.forEach(e => console.log('  ' + e)); }
console.log('\n' + (fail === 0 && errs.length === 0 ? 'PACKS VERIFY PASS' : 'PACKS VERIFY FAIL (' + fail + ' assertion(s)' + (errs.length ? ' + ' + errs.length + ' page error(s)' : '') + ')'));
process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
