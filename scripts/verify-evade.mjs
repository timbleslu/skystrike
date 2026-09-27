/* F4 — enemy defensive AI headless verify. Boots the game, forces a threat onto a live enemy
   (a homing PLAYER missile within EVADE.missileDist), and asserts the evade mechanic end-to-end:
     1. FLARE  — a stocked enemy pops a visible owner:'enemy' flare that spoofs player missiles,
                 and its finite e.flares pool decrements. Saves evade-check-flare.png at the pop.
     2. BREAK  — with the flare pool emptied, the same threat falls back to a break-turn
                 (e._evadeBreakT active) and NO further flare is popped (pool stays 0).
   Exits non-zero on any failure. Usage: node scripts/verify-evade.mjs
   Requires playwright (dev dep). Not part of the shipped game. */
import { launchGame, bootToHangar } from './lib/boot.mjs';

const { page, port, close } = await launchGame();
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });

let failed = false;
function ok(cond, label) {
  console.log((cond ? 'ok   - ' : 'FAIL - ') + label);
  if (!cond) failed = true;
}
async function done() {
  await close();
  if (failed) { console.error('verify-evade: FAILURES ABOVE'); process.exit(1); }
  console.log('verify-evade: ALL CHECKS PASS');
  process.exit(0);
}

await bootToHangar(page, { port });

await page.evaluate(() => { applyTimeOfDay(1); startGame(selectedJet); });

let staged = { ok: false };
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(400);
  staged = await page.evaluate(() => {
    let e = enemies.find(x => x.alive && x.type === 'fighter') || enemies.find(x => x.alive && x.type !== 'ground' && x.type !== 'boss');
    if (!e && typeof createEnemy === 'function' && typeof player !== 'undefined' && player.group) {
      const fwd = fwdOf(player.group, new THREE.Vector3());
      e = createEnemy('fighter', player.group.position.clone().addScaledVector(fwd, 900));
    }
    if (!e) return { ok: false, n: enemies.length, types: enemies.map(x => x.type).join(','), state: (typeof state !== 'undefined' ? state : '?') };
    window.__e = e;
    window.__mdist = (typeof EVADE !== 'undefined') ? EVADE.missileDist : 900;
    return { ok: true, type: e.type, flares: e.flares, mdist: window.__mdist };
  });
  if (staged.ok) break;
}
if (!staged.ok) console.error('no enemy: ' + JSON.stringify(staged));
ok(staged.ok, 'a live fighter/mook spawned to test (type=' + staged.type + ', e.flares=' + staged.flares + ')');
ok(typeof staged.flares === 'number' && staged.flares >= 1, 'the mook carries a finite flare loadout (>=1)');
if (!staged.ok) { await done(); }

await page.evaluate(() => {
  window.__pin = function () {
    const e = window.__e;
    const fwd = fwdOf(player.group, new THREE.Vector3());
    e.group.position.copy(player.group.position).addScaledVector(fwd, 260); e.group.position.y += 20;
    e.speed = 0;
    let m = missiles.find(x => !x.enemy && x.target === e);
    if (!m) { m = spawnMissile(player.group.position.clone().addScaledVector(fwd, 110), fwd.clone(), e, false, 1); }
    m.mesh.position.copy(player.group.position).addScaledVector(fwd, 110);
    m.armed = 5; m.life = 6;
  };
});

await page.evaluate(() => { const e = window.__e; e.flares = 3; e._evadeLast = undefined; e._evadeBreakT = 0; });
let flarePopped = false, flaresLeft = 3;
for (let i = 0; i < 40; i++) {
  const r = await page.evaluate(() => {
    window.__pin();
    return { enemyFlare: flares.some(f => f.owner === 'enemy'), left: window.__e.flares };
  });
  flaresLeft = r.left;
  if (r.enemyFlare) { flarePopped = true; break; }
  await page.waitForTimeout(50);
}
ok(flarePopped, 'a stocked enemy popped a visible owner:"enemy" flare under missile threat');
ok(flaresLeft < 3, 'the finite flare pool decremented on the pop (3 -> ' + flaresLeft + ')');

await page.evaluate(() => { window.__pin(); });
await page.waitForTimeout(60);
await page.screenshot({ path: 'evade-check-flare.png' });
console.log('saved evade-check-flare.png');

const spoofed = await page.evaluate(() => {
  return new Promise(res => {
    let n = 0;
    const iv = setInterval(() => {
      window.__pin();
      const m = missiles.find(x => !x.enemy && x.target === window.__e);
      if (m && m.decoy && m.decoy.owner === 'enemy') { clearInterval(iv); res(true); }
      else if (++n > 30) { clearInterval(iv); res(false); }
    }, 30);
  });
});
ok(spoofed, 'an enemy flare spoofed the inbound player missile (m.decoy = enemy flare)');

const brk = await page.evaluate(() => {
  const e = window.__e;
  e.alive = true; e.speed = 0;
  e.flares = 0; e._evadeLast = -1e9; e._evadeBreakT = 0; e._jinkT = 0;
  window.__pin();
  const missileDist = Math.min(...missiles.filter(m => !m.enemy && m.target === e)
    .map(m => Math.sqrt(m.mesh.position.distanceToSquared(e.group.position))).concat([Infinity]));
  applyEvade(e, 0.016);
  return { breakT: e._evadeBreakT, jinkT: e._jinkT, flares: e.flares, missileDist };
});
ok(brk.breakT > 0, 'an empty-rack enemy under threat falls back to an active break-turn (e._evadeBreakT=' + brk.breakT.toFixed(2) + ', missileDist=' + Math.round(brk.missileDist) + ')');
ok(brk.jinkT > 0, 'the break-turn drives the engine lateral-break primitive (e._jinkT > 0)');
ok(brk.flares === 0, 'a depleted flare pool never pops another flare (stays at 0, no negative)');

const bossFlares = await page.evaluate(() => {
  if (typeof createEnemy !== 'function') return null;
  const b = createEnemy('boss', new THREE.Vector3(player.group.position.x, player.group.position.y, player.group.position.z - 4000));
  const f = b.flares; b.alive = false;
  return f;
});
ok(bossFlares === 0, 'a boss is built with e.flares === 0 (break-turns only) — got ' + bossFlares);

await done();
