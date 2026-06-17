/* Dev-only smoke test: boots index.html headless and confirms the vendored global
   THREE.GLTFLoader can load a .glb end-to-end (parses, yields meshes). Not shipped.
   Usage: node scripts/gltf-smoke.mjs [glbUrlPath]   (default: the bundled sample box) */
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
const glb = process.argv[2] || '/assets/jets/_smoketest.glb';

const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1500);

const res = await page.evaluate((glb) => new Promise((resolve) => {
  if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader !== 'function') { resolve({ ok: false, why: 'THREE.GLTFLoader is not a function' }); return; }
  try {
    new THREE.GLTFLoader().load(glb, (g) => {
      let meshes = 0, tris = 0, nodes = 0;
      g.scene.traverse((o) => { nodes++; if (o.isMesh && o.geometry) { meshes++; const ix = o.geometry.index, pos = o.geometry.attributes.position; tris += ix ? ix.count / 3 : (pos ? pos.count / 3 : 0); } });
      resolve({ ok: true, meshes, tris: Math.round(tris), nodes });
    }, undefined, (err) => resolve({ ok: false, why: String((err && err.message) || err) }));
  } catch (e) { resolve({ ok: false, why: 'threw ' + e.message }); }
}), glb);

console.log('GLTFLoader smoke:', JSON.stringify(res));
if (errs.length) console.log('page errors:', errs.slice(0, 5).join(' | '));
await browser.close(); server.close();
process.exit(res.ok ? 0 : 1);
