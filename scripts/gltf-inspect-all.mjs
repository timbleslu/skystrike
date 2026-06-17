/* Dev-only: load every assets/jets/*.glb headless and print a one-line summary each:
   dims [x,y,z], longest axis (= length), 2nd axis (= span), tris, anim count, and a
   crude nose-direction guess (the long-axis end with LESS cross-section = the nose).
   Usage: node scripts/gltf-inspect-all.mjs */
import { chromium } from 'playwright';
import http from 'http';
import { readFile, readdir } from 'fs/promises';
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
const files = (await readdir(join(root, 'assets/jets'))).filter(f => f.endsWith('.glb')).sort();

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.error('PAGEERR', e.message));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1200);

for (const f of files) {
  const r = await page.evaluate((glb) => new Promise((resolve) => {
    const _l = new THREE.GLTFLoader();
    if (THREE.DRACOLoader) { const _d = new THREE.DRACOLoader(); _d.setDecoderPath('/vendor/draco/'); _l.setDRACOLoader(_d); }
    _l.load(glb, (g) => {
      const box = new THREE.Box3().setFromObject(g.scene);
      const s = box.getSize(new THREE.Vector3());
      const dims = { x: s.x, y: s.y, z: s.z };
      const axes = Object.keys(dims).sort((a, b) => dims[b] - dims[a]);
      const longAxis = axes[0];
      // Sample vertices: split along the long axis at its midpoint, compare cross-section
      // spread of each half. The NOSE half is narrower (less span+height variance).
      const ctr = box.getCenter(new THREE.Vector3());
      const cross = ['x', 'y', 'z'].filter(a => a !== longAxis);
      let posSpread = 0, negSpread = 0, posN = 0, negN = 0;
      g.scene.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        const p = o.geometry.attributes.position; const v = new THREE.Vector3();
        const step = Math.max(1, Math.floor(p.count / 400));
        for (let i = 0; i < p.count; i += step) {
          v.fromBufferAttribute(p, i); o.localToWorld(v);
          const along = v[longAxis] - ctr[longAxis];
          const dc0 = v[cross[0]] - ctr[cross[0]], dc1 = v[cross[1]] - ctr[cross[1]];
          const r2 = dc0 * dc0 + dc1 * dc1;
          if (along >= 0) { posSpread += r2; posN++; } else { negSpread += r2; negN++; }
        }
      });
      const posAvg = posN ? posSpread / posN : 0, negAvg = negN ? negSpread / negN : 0;
      // nose = narrower half along the long axis
      const noseEnd = posAvg < negAvg ? '+' + longAxis : '-' + longAxis;
      let tris = 0; g.scene.traverse(o => { if (o.isMesh && o.geometry) { const ix = o.geometry.index, ps = o.geometry.attributes.position; tris += ix ? ix.count / 3 : (ps ? ps.count / 3 : 0); } });
      resolve({ dims: [+s.x.toFixed(1), +s.y.toFixed(1), +s.z.toFixed(1)], longAxis, span: axes[1], noseEnd, tris: Math.round(tris), anims: g.animations.length });
    }, undefined, (err) => resolve({ fail: String((err && err.message) || err) }));
  }), '/assets/jets/' + f);
  if (r.fail) { console.log(f.padEnd(14), 'FAIL', r.fail); continue; }
  console.log(f.padEnd(14), 'dims', JSON.stringify(r.dims).padEnd(22), 'len=' + r.longAxis, 'span=' + r.span, 'nose=' + r.noseEnd, 'tris=' + r.tris, 'anims=' + r.anims);
}
await browser.close(); server.close();
