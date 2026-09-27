/* Dev-only headless verification of the F5 KILL-STREAK momentum surface the Node unit tests can't reach:
   the REAL combat.js killEnemy path (streak steps + score multiplier) and the hud.js streak chip render.
   Boots the game, starts a run, kills 3 enemies rapidly through killEnemy -> asserts count 3 / mult 1.5 /
   3rd-kill score delta reflects the multiplier; then forces a tier-2+ streak and saves streak-check-chip.png.
   Usage: node scripts/verify-streak.mjs */
import { launchGame, bootToHangar } from './lib/boot.mjs';
const { page, port, close } = await launchGame({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await bootToHangar(page, { port, gotoWait: 1400, continueWait: 500 });

await page.evaluate(() => { startGame(selectedJet); });
await page.waitForTimeout(1500);

const R = await page.evaluate(() => {
  const out = [];
  const ok = (name, cond) => out.push({ name, pass: !!cond });

  mission = null;
  player.combo = 0; player.scoreMul = 1; player.killStreak = 0;
  player.streak = undefined;

  const makeEnemy = () => {
    const g = new THREE.Group();
    g.position.set(0, 220, -320);
    if (typeof scene !== 'undefined' && scene) scene.add(g);
    const e = { type: 'fighter', alive: true, group: g, hp: 1, maxHp: 1, playerDmg: 0, _lastPlayerWp: 'gun' };
    enemies.push(e);
    return e;
  };

  const deltas = [];
  for (let i = 0; i < 3; i++) {
    const e = makeEnemy();
    const before = player.score;
    killEnemy(e, true);
    deltas.push(player.score - before);
  }

  ok('3 rapid kills -> streak count is 3', player.streak && player.streak.count === 3);
  ok('streak at count 3 -> multiplier is 1.5', player.streak && player.streak.mult === 1.5);
  ok('kills 1 & 2 score at x1 (equal base deltas)', deltas[0] === deltas[1] && deltas[0] > 0);
  ok('3rd kill score delta reflects the x1.5 multiplier', deltas[2] === Math.round(deltas[0] * 1.5) && deltas[2] > deltas[1]);

  const e4 = makeEnemy();
  const savedNow = performance.now;
  player.streak = { count: 3, mult: 1.5, t: 0, tierUp: false };
  killEnemy(e4, true);
  ok('a kill after the window lapse restarts count at 1', player.streak && player.streak.count === 1);
  void savedNow;

  return { out, deltas };
});

await page.evaluate(() => {
  player.streak = { count: 8, mult: 2, t: performance.now() / 1000, tierUp: false };
});
await page.waitForTimeout(350);
await page.screenshot({ path: 'streak-check-chip.png' });

const chipHasInk = await page.evaluate(() => {
  const cv = document.getElementById('h2d');
  if (!cv) return false;
  const cx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  const sx = Math.floor(w * 0.6), sw = w - sx, sy = 110, sh = 90;
  const data = cx.getImageData(sx, sy, sw, sh).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 12) return true;
  return false;
});

await close();

let fail = 0;
for (const r of R.out) { console.log((r.pass ? 'ok   - ' : 'FAIL - ') + r.name); if (!r.pass) fail++; }
console.log((chipHasInk ? 'ok   - ' : 'FAIL - ') + 'streak chip rendered ink in the top-right HUD band (streak-check-chip.png)');
if (!chipHasInk) fail++;
console.log('  (kill deltas: ' + JSON.stringify(R.deltas) + ' — expected [base, base, round(base*1.5)])');
if (errs.length) { console.log('\nconsole/page errors:'); errs.forEach(e => console.log('  ' + e)); }
console.log('\n' + (fail === 0 && errs.length === 0 ? 'STREAK VERIFY PASS' : 'STREAK VERIFY FAIL (' + fail + ' assertion(s), ' + errs.length + ' error(s))'));
process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
