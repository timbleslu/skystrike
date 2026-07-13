/* Dev-only verification harness for F1 gun-overheat. Boots the game headless, forces continuous
   gun fire via touchBtns.gun, and asserts the heat model end-to-end against the LIVE game:
     heat rises under fire -> locks at 1.0 -> gun gated (no new shots); release -> cools + re-arms
     below the 0.35 hysteresis threshold. Then forces heat ~0.8 and saves overheat-check-gauge.png
     with the HUD gauge partly filled. Exits non-zero on any failed assertion.
   Boot pattern copied from scripts/shot.mjs (ephemeral port). Requires playwright. Not shipped. */
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
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1200);

// drive past the first-run language gate into the hangar (as shot.mjs does)
await page.evaluate(() => {
  const dd = document.getElementById('langDropdown');
  if (dd) { dd.value = 'EN'; dd.dispatchEvent(new Event('change', { bubbles: true })); }
  const en = document.querySelector('.ob-lang[data-lang="EN"]');
  if (en) en.click();
});
await page.waitForTimeout(250);
await page.evaluate(() => { const c = document.getElementById('obContinue'); if (c) c.click(); });
await page.waitForTimeout(400);

// start a run; keep the player alive + airborne so the flight loop keeps ticking for the whole test
await page.evaluate(() => {
  startGame(selectedJet);
  player.hp = 1e9; player.invuln = 1e4; player.group.position.y = 2500;
});
await page.waitForTimeout(1500);

let failed = false;
const check = (cond, msg) => { console.log((cond ? '  ok   - ' : '  FAIL - ') + msg); if (!cond) failed = true; };
const read = () => page.evaluate(() => ({
  heat: player.gunHeat ?? 0, locked: !!player.gunLocked,
  shots: (typeof run !== 'undefined' ? run.shots : 0),
  noCannon: !!player.noCannon, state: state,
}));
const keepAlive = () => page.evaluate(() => { player.hp = 1e9; player.invuln = 1e4; if (player.group.position.y < 800) player.group.position.y = 2000; });

const s0 = await read();
check(!s0.noCannon, 'default jet has a cannon (overheat applies)');
check(s0.heat < 0.05, 'gun starts cold (heat ~0)');

// ---- force continuous fire: heat must RISE, then LOCK at 1.0 ----
await page.evaluate(() => { touchBtns.gun = true; });
let rose = false, locked = false, shotsAtLock = 0, lockHeat = 0;
for (let i = 0; i < 220; i++) {                     // up to ~22s (generous for reduced headless fps)
  await page.waitForTimeout(100);
  if (i % 8 === 0) await keepAlive();
  const s = await read();
  if (s.heat > 0.2) rose = true;
  if (s.locked) { locked = true; shotsAtLock = s.shots; lockHeat = s.heat; break; }
}
check(rose, 'gun heat RISES under continuous fire');
check(locked, 'gun LOCKS OUT under sustained fire');
// The lock itself proves heat crossed 1.0 (heatStep only locks at heat>=1 — exact-1.0 is unit-tested).
// The observed value is sampled up to a poll-interval AFTER the crossing, by which point a locked
// gun has already begun cooling (0.4/s), so it reads a touch under 1.0 rather than exactly 1.0.
check(lockHeat >= 0.9, 'lockout occurs near heat 1.0 (freshly locked, pre-cooldown)');

// ---- gun is GATED while locked: no new shots fire during lockout ----
await page.waitForTimeout(160);
const sg = await read();
check(sg.locked, 'still locked immediately after lockout');
check(sg.shots === shotsAtLock, 'gun is GATED while overheated (no shots fired during lockout)');

// ---- release fire: heat DECAYS + RE-ARMS below the 0.35 threshold ----
await page.evaluate(() => { touchBtns.gun = false; });
let rearmed = false, rearmHeat = 1, decayed = false, prevHeat = sg.heat;
for (let i = 0; i < 120; i++) {                     // up to ~12s
  await page.waitForTimeout(100);
  if (i % 8 === 0) await keepAlive();
  const s = await read();
  if (s.heat < prevHeat - 1e-6) decayed = true;
  prevHeat = s.heat;
  if (!s.locked) { rearmed = true; rearmHeat = s.heat; break; }
}
check(decayed, 'gun heat DECAYS after releasing fire');
check(rearmed, 'gun RE-ARMS after cooling');
check(rearmHeat < 0.35, 're-arm happens below the 0.35 hysteresis threshold');

// ---- gauge screenshot: force heat ~0.8 and capture the partly-filled HUD bar ----
await keepAlive();
await page.evaluate(() => { touchBtns.gun = false; player.gunHeat = 0.8; player.gunLocked = false; });
await page.waitForTimeout(70);
await page.screenshot({ path: 'overheat-check-gauge.png' });
const sgg = await read();
check(sgg.heat > 0.6 && sgg.heat < 1, 'heat held ~0.8 for the gauge screenshot (bar partly filled)');

await browser.close();
server.close();
if (failed) { console.error('verify-overheat: FAILED'); process.exit(1); }
console.log('verify-overheat: PASS — heat rises, locks at 1.0, gun gated, cools + re-arms < 0.35, gauge rendered');
