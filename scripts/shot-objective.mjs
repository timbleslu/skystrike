/* Dev-only: capture the Req B fly-to marker + Req D objective callout in-flight (visual evidence).
   Boots headless, starts a flight, forces a RECON objective with a waypoint dead ahead + fires the
   phase callout, then screenshots (a) the 3s callout up and (b) after it fades (persistent slot +
   marker). Usage: node scripts/shot-objective.mjs [outDir]   (default /tmp/skystrike-objshots) */
import { chromium } from 'playwright';
import http from 'http';
import { readFile, mkdir } from 'fs/promises';
import { extname, join } from 'path';
const root = new URL('..', import.meta.url).pathname;
const outDir = process.argv[2] || '/tmp/skystrike-objshots';
await mkdir(outDir, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const server = http.createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  try { const d = await readFile(join(root, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1200);
await page.evaluate(() => { const en = document.querySelector('.ob-lang[data-lang="EN"]'); if (en) en.click(); });
await page.waitForTimeout(250);
await page.evaluate(() => { const c = document.getElementById('obContinue'); if (c) c.click(); });
await page.waitForTimeout(600);
await page.evaluate(() => { applyTimeOfDay(0); startGame(selectedJet); });
await page.waitForTimeout(6500);   // let the run-intro "GET READY" DOM banner clear

const killClutter = () => page.evaluate(() => {
  // kill any DOM banner + tutorial overlay so the CANVAS objective callout reads clean
  bannerT = 0; if (el && el.banner) el.banner.classList.remove('show');
  document.querySelectorAll('#tutorial, .tut, #tutorialBox').forEach(x => x && (x.style.display = 'none'));
  if (Array.isArray(enemies)) { for (const e of enemies) { if (e.group) scene.remove(e.group); if (e.marker) scene.remove(e.marker); } enemies.length = 0; }
  if (Array.isArray(pendingSpawns)) pendingSpawns.length = 0;
});
await killClutter();

// force a RECON objective with a waypoint ahead + up (clear sky) + fire the phase callout
await page.evaluate(() => {
  mission = startMission('recon', 1, Math.random);
  mission.target = 2; mission.params.count = 2;
  spawnReconWaypoints(mission, 1);
  const fwd = fwdOf(player.group, new THREE.Vector3());
  const p = player.group.position;
  mission.params.waypoints[0] = { x: p.x + fwd.x * 2000, y: p.y + fwd.y * 2000 + 260, z: p.z + fwd.z * 2000, hit: false };
  fireObjectiveCallout(objectiveText(mission), 1, 3);
});
await page.waitForTimeout(450);   // callout is up (within its 3s window)
await killClutter();
await page.screenshot({ path: join(outDir, 'callout.png') });

await page.waitForTimeout(3200);  // let the callout fade; persistent slot + orange marker remain
await killClutter();
await page.screenshot({ path: join(outDir, 'marker.png') });

await browser.close();
server.close();
console.log('done -> ' + outDir + ' (callout.png, marker.png)');
