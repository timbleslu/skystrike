/* Dev-only: load a .glb headless and dump its structure (bbox, node tree, materials,
   animations) so we know how to scale/orient it + whether it has control-surface nodes.
   Usage: node scripts/gltf-inspect.mjs [glbUrlPath]  (default /assets/jets/f22.glb) */
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
const glb = process.argv[2] || '/assets/jets/f22.glb';

const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1500);

const res = await page.evaluate((glb) => new Promise((resolve) => {
  new THREE.GLTFLoader().load(glb, (g) => {
    const box = new THREE.Box3().setFromObject(g.scene);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    let meshes = 0, tris = 0; const seen = new Set(), mats = []; const nodes = [];
    g.scene.traverse((o) => {
      nodes.push((o.name || '(unnamed)') + ':' + o.type);
      if (o.isMesh && o.geometry) {
        meshes++; const ix = o.geometry.index, pos = o.geometry.attributes.position;
        tris += ix ? ix.count / 3 : (pos ? pos.count / 3 : 0);
        const arr = Array.isArray(o.material) ? o.material : [o.material];
        arr.forEach((m) => { if (m && !seen.has(m.uuid)) { seen.add(m.uuid); mats.push((m.name || '(unnamed)') + ' [' + m.type + (m.map ? ' +map' : '') + (m.color ? ' #' + m.color.getHexString() : '') + ']'); } });
      }
    });
    resolve({
      meshes, tris: Math.round(tris), nodeCount: nodes.length,
      size: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)],
      center: [+center.x.toFixed(2), +center.y.toFixed(2), +center.z.toFixed(2)],
      anims: g.animations.map((a) => a.name),
      mats, nodes,
    });
  }, undefined, (err) => resolve({ ok: false, why: String((err && err.message) || err) }));
}), glb);

if (res.why) { console.log('LOAD FAILED:', res.why); }
else {
  console.log('meshes=' + res.meshes, 'tris=' + res.tris, 'nodes=' + res.nodeCount);
  console.log('bbox size=' + JSON.stringify(res.size), 'center=' + JSON.stringify(res.center));
  console.log('animations:', JSON.stringify(res.anims));
  console.log('materials (' + res.mats.length + '):'); res.mats.forEach((m) => console.log('  ' + m));
  // node names that look like control surfaces
  const cs = res.nodes.filter((n) => /aileron|elevon|elevator|flaperon|flap|rudder|stab|slat|spoiler|canard|tail|wing|surface|hinge/i.test(n));
  console.log('control-surface-ish nodes (' + cs.length + '):'); cs.slice(0, 40).forEach((n) => console.log('  ' + n));
  console.log('ALL nodes (first 60):'); res.nodes.slice(0, 60).forEach((n) => console.log('  ' + n));
}
if (errs.length) console.log('page errors:', errs.slice(0, 5).join(' | '));
await browser.close(); server.close();
