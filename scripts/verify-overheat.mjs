/* Dev-only verification harness for F1 gun-overheat. Boots the game headless, forces continuous
   gun fire via touchBtns.gun, and asserts the heat model end-to-end against the LIVE game:
     heat rises under fire -> locks at 1.0 -> gun gated (no new shots); release -> cools + re-arms
     below the 0.35 hysteresis threshold. Then forces heat ~0.8 and saves overheat-check-gauge.png
     with the HUD gauge partly filled. Exits non-zero on any failed assertion.
   Boot pattern copied from scripts/shot.mjs (ephemeral port). Requires playwright. Not shipped. */
import { launchGame, bootToHangar } from './lib/boot.mjs';

const { page, port, close } = await launchGame();
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
await bootToHangar(page, { port, continueWait: 400 });

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

await page.evaluate(() => { touchBtns.gun = true; });
let rose = false, locked = false, shotsAtLock = 0, lockHeat = 0;
for (let i = 0; i < 220; i++) {
  await page.waitForTimeout(100);
  if (i % 8 === 0) await keepAlive();
  const s = await read();
  if (s.heat > 0.2) rose = true;
  if (s.locked) { locked = true; shotsAtLock = s.shots; lockHeat = s.heat; break; }
}
check(rose, 'gun heat RISES under continuous fire');
check(locked, 'gun LOCKS OUT under sustained fire');
check(lockHeat >= 0.9, 'lockout occurs near heat 1.0 (freshly locked, pre-cooldown)');

await page.waitForTimeout(160);
const sg = await read();
check(sg.locked, 'still locked immediately after lockout');
check(sg.shots === shotsAtLock, 'gun is GATED while overheated (no shots fired during lockout)');

await page.evaluate(() => { touchBtns.gun = false; });
let rearmed = false, rearmHeat = 1, decayed = false, prevHeat = sg.heat;
for (let i = 0; i < 120; i++) {
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

await keepAlive();
await page.evaluate(() => { touchBtns.gun = false; player.gunHeat = 0.8; player.gunLocked = false; });
await page.waitForTimeout(70);
await page.screenshot({ path: 'overheat-check-gauge.png' });
const sgg = await read();
check(sgg.heat > 0.6 && sgg.heat < 1, 'heat held ~0.8 for the gauge screenshot (bar partly filled)');

await close();
if (failed) { console.error('verify-overheat: FAILED'); process.exit(1); }
console.log('verify-overheat: PASS — heat rises, locks at 1.0, gun gated, cools + re-arms < 0.35, gauge rendered');
