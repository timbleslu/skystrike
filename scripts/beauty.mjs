/* Dev-only close-up harness: frames the hangar preview jet, a missile and tracer
   rounds with the DOM UI hidden — for judging model/material quality up close.
   Usage: node scripts/beauty.mjs <outPrefix> [jetIndex=1] [timeOfDay 0|1|2]
   Requires playwright. Not part of the shipped game. */
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

const prefix = process.argv[2] || 'beauty';
const jetIdx = +(process.argv[3] || 1);
const tod = +(process.argv[4] || 0);
const zoom = +(process.argv[5] || 1);   // <1 = closer dolly for judging fine detail (default 1 = standard framing)
const thr = process.argv[6] != null ? +process.argv[6] : 0.95;   // engine throttle for the shot (low = small plume, judge the model)

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1200);
await page.waitForFunction(() => typeof jetGLTF !== 'undefined' && jetGLTF.F22, { timeout: 7000 }).catch(() => {});

await page.addStyleTag({ content: 'body > *:not(canvas){display:none!important}' });
await page.evaluate(({ j, t, thr }) => {
  applyTimeOfDay(t);
  selectJet(j);
  previewJet.rotation.set(0, 0, 0);
  animEngines(previewJet, thr);
}, { j: jetIdx, t: tod, thr });

const frames = [
  ['front', { px: -18, py: 10, pz: -26 }],
  ['side', { px: -36, py: 9, pz: 1 }],
  ['rear', { px: 12, py: 8, pz: 29 }],
];
for (const [name, c] of frames) {
  await page.evaluate(({ c, zoom, thr }) => {
    animEngines(previewJet, thr);
    camera.position.set(c.px * zoom, c.py * zoom, c.pz * zoom);
    camera.lookAt(0, 2.5, 0);
  }, { c, zoom, thr });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${prefix}-jet-${name}.png` });
}

// missile + tracer rounds staged over the platform
await page.evaluate(() => {
  scene.remove(previewJet);
  const m = buildMissileMesh(false); m.position.set(-2, 5, 0); m.rotation.y = 0.55; m.userData.halo.visible = false; scene.add(m);
  const me = buildMissileMesh(true); me.position.set(2.5, 8, -3); me.rotation.y = 0.7; me.userData.halo.visible = false; scene.add(me);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(ASSET.bulletGeo, i % 2 ? ASSET.ebulletMat : ASSET.bulletMat);
    b.position.set(-7 + i * 6, 2.2, 5); b.rotation.y = 0.6; scene.add(b);
  }
  camera.position.set(-3, 7, -20); camera.lookAt(0, 5.5, 0);
});
await page.waitForTimeout(150);
await page.screenshot({ path: `${prefix}-ordnance.png` });

await browser.close();
server.close();
console.log('done:', prefix);
