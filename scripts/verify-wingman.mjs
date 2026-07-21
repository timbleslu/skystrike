/* F3 wingman-wheel headless verification (REQUIRED). Boots the game, starts a run, puts one escort on-station
   so the wingman sidebar (and its order badge) renders, then dispatches Digit4/5/6 and asserts BOTH the order
   STATE (player.wingOrder) and the sidebar BADGE text advance ENGAGE → COVER → REGROUP. Saves
   wingman-check-sidebar.png. Exit non-zero on any failure. Pattern mirrors scripts/shot.mjs. */
import { launchGame, bootToHangar } from './lib/boot.mjs';

let failed = false;
const fail = (msg) => { console.error('FAIL:', msg); failed = true; };

const { page, port, close } = await launchGame();
page.on('pageerror', e => { console.error('PAGE ERROR:', e.message); failed = true; });
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
// clear the first-run language / onboarding gates → hangar
await bootToHangar(page, { port });

// start a run, then put one permanent escort on-station so the wingman sidebar + order badge render
await page.evaluate(() => { startGame(selectedJet); });
await page.waitForTimeout(2500);
await page.evaluate(() => { if (typeof spawnWingman === 'function') spawnWingman(false); });
await page.waitForTimeout(700);

// press a key, let a frame render the badge, then read back the order state + badge text + sidebar visibility
async function order(code) {
  await page.keyboard.press(code);
  await page.waitForTimeout(350);
  return page.evaluate(() => {
    const sb = document.getElementById('wingSidebar');
    const b = sb && sb.querySelector('.wing-order');
    return {
      order: (typeof player !== 'undefined' && player && player.wingOrder) || null,
      badge: (b && b.textContent) || '',
      sidebarVisible: !!(sb && sb.classList.contains('visible')),
    };
  });
}

const checks = [
  { code: 'Digit4', order: 'ENGAGE', label: 'ENGAGE' },
  { code: 'Digit5', order: 'COVER', label: 'COVER' },
  { code: 'Digit6', order: 'REGROUP', label: 'REGROUP' },
];
for (const c of checks) {
  const r = await order(c.code);
  if (!r.sidebarVisible) fail(`${c.code}: wingman sidebar not visible (no escort on-station?)`);
  if (r.order !== c.order) fail(`${c.code}: expected player.wingOrder=${c.order}, got ${r.order}`);
  if (!r.badge.includes(c.label)) fail(`${c.code}: sidebar badge "${r.badge}" missing "${c.label}"`);
  if (r.order === c.order && r.badge.includes(c.label)) console.log(`ok  ${c.code} → order=${r.order} badge="${r.badge}"`);
}

// capture the sidebar badge in its final (REGROUP) state
await page.screenshot({ path: 'wingman-check-sidebar.png' });

await close();
if (failed) { console.error('verify-wingman: FAILED'); process.exit(1); }
console.log('verify-wingman: OK — orders ENGAGE/COVER/REGROUP drive both state + sidebar badge');
