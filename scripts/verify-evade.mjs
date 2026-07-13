/* F4 — enemy defensive AI headless verify. Boots the game, forces a threat onto a live enemy
   (a homing PLAYER missile within EVADE.missileDist), and asserts the evade mechanic end-to-end:
     1. FLARE  — a stocked enemy pops a visible owner:'enemy' flare that spoofs player missiles,
                 and its finite e.flares pool decrements. Saves evade-check-flare.png at the pop.
     2. BREAK  — with the flare pool emptied, the same threat falls back to a break-turn
                 (e._evadeBreakT active) and NO further flare is popped (pool stays 0).
   Exits non-zero on any failure. Usage: node scripts/verify-evade.mjs
   Requires playwright (dev dep). Not part of the shipped game. */
import { chromium } from 'playwright';
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const data = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });

let failed = false;
function ok(cond, label) {
  console.log((cond ? 'ok   - ' : 'FAIL - ') + label);
  if (!cond) failed = true;
}
async function done() {
  await browser.close();
  server.close();
  if (failed) { console.error('verify-evade: FAILURES ABOVE'); process.exit(1); }
  console.log('verify-evade: ALL CHECKS PASS');
  process.exit(0);
}

await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1200);

// drive past the first-run language gate → hangar (mirrors scripts/shot.mjs)
await page.evaluate(() => {
  const dd = document.getElementById('langDropdown');
  if (dd) { dd.value = 'EN'; dd.dispatchEvent(new Event('change', { bubbles: true })); }
  const en = document.querySelector('.ob-lang[data-lang="EN"]');
  if (en) en.click();
});
await page.waitForTimeout(250);
await page.evaluate(() => { const c = document.getElementById('obContinue'); if (c) c.click(); });
await page.waitForTimeout(600);

// start a run and let wave 1 spawn
await page.evaluate(() => { applyTimeOfDay(1); startGame(selectedJet); });

// tag a live fighter, stage it dead-ahead of the player, and mark it (window.__e) for later steps.
// poll (waves spawn over a few seconds); if a fighter never comes, force-spawn one so the test is robust.
let staged = { ok: false };
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(400);
  staged = await page.evaluate(() => {
    let e = enemies.find(x => x.alive && x.type === 'fighter') || enemies.find(x => x.alive && x.type !== 'ground' && x.type !== 'boss');
    if (!e && typeof createEnemy === 'function' && typeof player !== 'undefined' && player.group) {
      const fwd = fwdOf(player.group, new THREE.Vector3());
      e = createEnemy('fighter', player.group.position.clone().addScaledVector(fwd, 900));   // mook: opts.useGLTF absent -> 1 flare
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

// helper (runs in-page): pin the enemy + a homing player missile in a stable, visible frame ahead of
// the player so applyEvade sees a live missile threat every frame without the missile ever impacting.
await page.evaluate(() => {
  window.__pin = function () {
    const e = window.__e;
    const fwd = fwdOf(player.group, new THREE.Vector3());
    e.group.position.copy(player.group.position).addScaledVector(fwd, 260); e.group.position.y += 20;
    e.speed = 0;                                   // freeze for a clean, stable screenshot
    let m = missiles.find(x => !x.enemy && x.target === e);
    if (!m) { m = spawnMissile(player.group.position.clone().addScaledVector(fwd, 110), fwd.clone(), e, false, 1); }
    m.mesh.position.copy(player.group.position).addScaledVector(fwd, 110);   // ~150u from e: in range, never impacts
    m.armed = 5; m.life = 6;
  };
});

// ---------- 1. FLARE: a stocked enemy pops a visible enemy flare when a missile is inbound ----------
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

// capture the flare fx (keep the frame pinned so the flares are fresh on screen)
await page.evaluate(() => { window.__pin(); });
await page.waitForTimeout(60);
await page.screenshot({ path: 'evade-check-flare.png' });
console.log('saved evade-check-flare.png');

// confirm the enemy flare actually spoofs a PLAYER missile (combat.js EVADE.flareSpoofChance path)
const spoofed = await page.evaluate(() => {
  // give it a couple hundred ms of pinned frames for the 45%/frame spoof roll to land
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

// ---------- 2. BREAK: an empty flare pool falls back to a cooldown-gated break-turn ----------
// Drive the REAL hook fn directly so the check is deterministic and independent of whether the frozen
// probe survived the flare phase (the animate loop only calls applyEvade for live enemies).
const brk = await page.evaluate(() => {
  const e = window.__e;
  e.alive = true; e.speed = 0;
  e.flares = 0; e._evadeLast = -1e9; e._evadeBreakT = 0; e._jinkT = 0;
  window.__pin();                                   // guarantee a live missile threat within range
  const missileDist = Math.min(...missiles.filter(m => !m.enemy && m.target === e)
    .map(m => Math.sqrt(m.mesh.position.distanceToSquared(e.group.position))).concat([Infinity]));
  applyEvade(e, 0.016);                             // one frame of the real evasion hook
  return { breakT: e._evadeBreakT, jinkT: e._jinkT, flares: e.flares, missileDist };
});
ok(brk.breakT > 0, 'an empty-rack enemy under threat falls back to an active break-turn (e._evadeBreakT=' + brk.breakT.toFixed(2) + ', missileDist=' + Math.round(brk.missileDist) + ')');
ok(brk.jinkT > 0, 'the break-turn drives the engine lateral-break primitive (e._jinkT > 0)');
ok(brk.flares === 0, 'a depleted flare pool never pops another flare (stays at 0, no negative)');

// boss carries 0 flares by construction (break-turns only, never flares)
const bossFlares = await page.evaluate(() => {
  if (typeof createEnemy !== 'function') return null;
  const b = createEnemy('boss', new THREE.Vector3(player.group.position.x, player.group.position.y, player.group.position.z - 4000));
  const f = b.flares; b.alive = false;   // dispose-flag the probe boss
  return f;
});
ok(bossFlares === 0, 'a boss is built with e.flares === 0 (break-turns only) — got ' + bossFlares);

await done();
