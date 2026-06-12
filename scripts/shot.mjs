/* Dev-only screenshot harness: boots the game headless and captures gameplay frames.
   Usage: node scripts/shot.mjs <outPrefix> [timeOfDay 0|1|2]
   Requires playwright (npx playwright). Not part of the shipped game. */
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

const prefix = process.argv[2] || 'shot';
const tod = +(process.argv[3] || 0);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1200);

// hangar shot
await page.screenshot({ path: `${prefix}-hangar.png` });

// start a run and let a wave spawn
await page.evaluate((t) => { applyTimeOfDay(t); startGame(selectedJet); }, tod);
await page.waitForTimeout(4000);
await page.screenshot({ path: `${prefix}-flight.png` });

// fire missiles + gun for effects shot
await page.evaluate(() => { player.missiles = 99; fireMissile(); });
await page.waitForTimeout(600);
await page.screenshot({ path: `${prefix}-fx.png` });

// look down at terrain
await page.evaluate(() => { player.group.position.y = 900; player.group.rotation.x = -0.5; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${prefix}-terrain.png` });

await browser.close();
server.close();
console.log('done:', prefix);
