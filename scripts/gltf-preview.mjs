/* Dev-only: load f22.glb into the live game scene (real lighting + envmap), centered/
   rotated/scaled, hide the procedural preview, screenshot front/side/rear. Tunes the
   orient+scale transform before wiring into game code. Not shipped.
   Usage: node scripts/gltf-preview.mjs <outPrefix> [rotYdeg=90] [targetLen=26] [tod=0] */
import { chromium } from 'playwright';
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream' };
const server = http.createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  try { const d = await readFile(join(root, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const prefix = process.argv[2] || '.scratch/jet-visual-overhaul/gltf/f22';
const rotY = +(process.argv[3] || 90);
const targetLen = +(process.argv[4] || 26);
const tod = +(process.argv[5] || 0);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1200);
await page.addStyleTag({ content: 'body > *:not(canvas){display:none!important}' });

const info = await page.evaluate(({ rotY, targetLen, tod }) => new Promise((resolve) => {
  applyTimeOfDay(tod);
  if (typeof previewJet !== 'undefined' && previewJet) previewJet.visible = false;
  new THREE.GLTFLoader().load('/assets/jets/f22.glb', (g) => {
    const obj = g.scene;
    let box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.sub(c);                       // center model at origin
    const wrap = new THREE.Group(); wrap.add(obj);
    wrap.rotation.y = rotY * Math.PI / 180;    // align length (X) to game forward (Z)
    const size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    const s = targetLen / longest; wrap.scale.setScalar(s);
    box = new THREE.Box3().setFromObject(wrap);
    wrap.position.y = 2.5 - box.getCenter(new THREE.Vector3()).y;   // sit on the platform centre
    wrap.name = '__gltfPreview'; scene.add(wrap);
    resolve({ scale: +s.toFixed(3), worldLen: +(longest * s).toFixed(1) });
  }, undefined, (err) => resolve({ err: String((err && err.message) || err) }));
}), { rotY, targetLen, tod });

console.log('transform:', JSON.stringify(info));
const frames = [['front', { px: -18, py: 10, pz: -26 }], ['side', { px: -36, py: 9, pz: 1 }], ['rear', { px: 12, py: 8, pz: 29 }]];
for (const [name, cc] of frames) {
  await page.evaluate(({ cc }) => { camera.position.set(cc.px, cc.py, cc.pz); camera.lookAt(0, 2.5, 0); }, { cc });
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${prefix}-${name}.png` });
}
console.log('done:', prefix);
await browser.close(); server.close();
