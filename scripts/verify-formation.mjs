/* Dev-only headless verification of F2 enemy FORMATIONS — the browser-only behaviour the Node unit tests
   can't reach: the real spawn path (spawnFighterFormation) tags a leader + slot-holding followers, and
   applyFormationSteer (hooked in updateEnemy) keeps followers on their leader-relative slots over several
   seconds of real frames. Boots the game, enters a run, freezes the player far from the ring so the
   formation legitimately HOLDS (> engage range), steps ~3.5s, then asserts each follower is within
   tolerance of its slot's world position and the group is a tight cluster. Saves formation-check-vee.png.
   Usage: node scripts/verify-formation.mjs */
import { launchGame, bootToHangar } from './lib/boot.mjs';
import { join } from 'path';
const { page, port, root, close } = await launchGame({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
// dismiss the first-run language gate the way the game does — set EN + hide the gate overlays (no
// onboarding Continue, so no tutorial sortie; the test drives the run itself)
await bootToHangar(page, { port, gotoWait: 1400, mode: 'hide' });

// ---- enter a real run, freeze the player far from the ring, force-spawn a 5-fighter vee via the REAL path ----
const setup = await page.evaluate(() => {
  opMode = false;
  startGame(0);                                   // FT-1 endless run -> state='playing', animate() ticks
  updatePlayer = function () {};                  // freeze the player so it can't close to engage range / die
  if (player) { player.hp = 1e9; player.invuln = 999; if (player.vel) player.vel.set(0, 0, 0); }
  pendingSpawns.length = 0; enemies.length = 0;   // drop the auto wave-1 queue -> clean slate
  const leader = spawnFighterFormation(5, 'vee'); // the SAME function nextWave/queueFighterWave use in-game
  const followers = enemies.filter(e => e.formation);
  return {
    total: enemies.length,
    followers: followers.length,
    type: followers[0] && followers[0].formation.type,
    leaderHasFormation: !!(leader && leader.formation),
    dist0: Math.round(leader ? leader.group.position.distanceTo(player.group.position) : 0),
  };
});

await page.waitForTimeout(3500);                  // step ~3.5s of real frames — followers steer to their slots

const R = await page.evaluate(() => {
  const out = [];
  const ok = (name, cond) => out.push({ name, pass: !!cond });

  const followers = enemies.filter(e => e.alive && e.formation);
  const leader = enemies.find(e => e.alive && e.type === 'fighter' && !e.formation);
  ok('leader alive + flying NORMAL AI (carries no e.formation)', !!leader && !leader.formation);
  ok('all 4 followers still HOLDING formation (e.formation set)', followers.length === 4);

  // recompute each follower's slot world position from the leader's CURRENT heading, same transform as
  // applyFormationSteer: slot = leaderPos + right*off.x - forward*off.z
  const lf = fwdQ(leader.logicQuat, new THREE.Vector3());
  const right = new THREE.Vector3().copy(lf).cross(UPV); if (right.lengthSq() > 1e-6) right.normalize();
  let maxErr = 0;
  for (const f of followers) {
    const off = f.formation.offset;
    const slot = new THREE.Vector3().copy(leader.group.position).addScaledVector(right, off.x).addScaledVector(lf, -off.z);
    const err = slot.distanceTo(f.group.position);
    if (err > maxErr) maxErr = err;
  }
  ok('every follower within tolerance of its slot (formation HELD): maxErr=' + Math.round(maxErr) + ' < 600', maxErr < 600);

  // cluster proof: the 5 jets are a tight group, NOT scattered across the 2600-4600 ring they'd occupy if
  // each spawned independently (which would be many thousands of units apart)
  const jets = [leader].concat(followers);
  let diam = 0;
  for (let i = 0; i < jets.length; i++) for (let j = i + 1; j < jets.length; j++) {
    const d = jets[i].group.position.distanceTo(jets[j].group.position);
    if (d > diam) diam = d;
  }
  ok('formation is a tight cluster (diameter ' + Math.round(diam) + ' << scattered) < 2200', diam < 2200);

  // the formation legitimately HELD because it stayed clear of the player's engage range
  const leaderDist = leader.group.position.distanceTo(player.group.position);
  ok('held clear of engage range (leader dist ' + Math.round(leaderDist) + ' > ' + FORMATIONS.vee.engageRange + ')', leaderDist > FORMATIONS.vee.engageRange);

  // aim the frozen player at the formation centroid so the chase camera frames it for the screenshot
  const c = new THREE.Vector3();
  for (const e of jets) c.add(e.group.position);
  c.multiplyScalar(1 / jets.length);
  const dir = new THREE.Vector3().copy(c).sub(player.group.position); if (dir.lengthSq() > 1e-6) dir.normalize();
  dirToQuat(dir, player.group.quaternion);
  if (player.logicQuat) dirToQuat(dir, player.logicQuat);
  // make sure no menu/onboarding overlay lingers over the flight canvas for the screenshot
  ['langSelect', 'onboard', 'manual', 'touchControls', 'hangar', 'gameover'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });

  return out;
});

await page.waitForTimeout(500);                   // let the chase camera settle on the formation
await page.screenshot({ path: join(root, 'formation-check-vee.png') });

await close();

let fail = 0;
console.log('setup: ' + JSON.stringify(setup));
if (!(setup.total === 5 && setup.followers === 4 && setup.type === 'vee' && !setup.leaderHasFormation)) {
  console.log('FAIL - real spawn path produced 1 leader (no e.formation) + 4 vee followers'); fail++;
} else {
  console.log('ok   - real spawn path produced 1 leader (no e.formation) + 4 vee followers');
}
for (const r of R) { console.log((r.pass ? 'ok   - ' : 'FAIL - ') + r.name); if (!r.pass) fail++; }
if (errs.length) { console.log('\nPAGE ERRORS:'); errs.forEach(e => console.log('  ' + e)); }
console.log('\n' + (fail === 0 && errs.length === 0 ? 'FORMATION VERIFY PASS' : 'FORMATION VERIFY FAIL (' + fail + ' assertion(s)' + (errs.length ? ' + ' + errs.length + ' page error(s)' : '') + ')'));
process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
