/* Dev-only screenshot harness: boots the game headless and captures gameplay frames.
   Usage: node scripts/shot.mjs <outPrefix> [timeOfDay 0|1|2]
   Requires playwright (npx playwright). Not part of the shipped game. */
import { launchGame, bootToHangar } from './lib/boot.mjs';

const prefix = process.argv[2] || 'shot';
const tod = +(process.argv[3] || 0);

const { page, port, close } = await launchGame();
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
await bootToHangar(page, { port });

await page.screenshot({ path: `${prefix}-hangar.png` });

await page.evaluate((t) => { applyTimeOfDay(t); startGame(selectedJet); }, tod);
await page.waitForTimeout(4000);
await page.screenshot({ path: `${prefix}-flight.png` });

await page.evaluate(() => { player.missiles = 99; fireMissile(); });
await page.waitForTimeout(450);
await page.evaluate(() => { explode(player.group.position.clone().add(new THREE.Vector3(25, 8, -70)), true); });
await page.waitForTimeout(180);
await page.screenshot({ path: `${prefix}-fx.png` });

await page.evaluate(() => { player.group.position.y = 900; player.group.rotation.x = -0.5; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-terrain.png` });

await page.evaluate(() => { if (typeof gameOver === 'function') gameOver(); });
await page.waitForTimeout(700);
await page.screenshot({ path: `${prefix}-debrief.png` });

await close();
console.log('done:', prefix);
