/* Dev-only measurement harness: boots the game headless and reports the
   triangle / mesh / material budget of each roster jet's hangar preview model.
   Read-only — never mutates game source. Use to capture before/after tri-count
   deltas for the jet visual overhaul (Phase 0 go/no-go measurement).
   Usage: node scripts/measure-jet.mjs [jetIndex]   (omit = measure whole roster)
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

const onlyIdx = process.argv[2] != null ? +process.argv[2] : null;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1200);

const measure = (jet) => page.evaluate((j) => {
  selectJet(j);
  let tris = 0, meshes = 0, verts = 0;
  const geos = new Set(), mats = new Set();
  previewJet.traverse(o => {
    if (o.isMesh && o.geometry) {
      meshes++;
      const g = o.geometry; geos.add(g.uuid);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m.uuid));
      const idx = g.index, pos = g.attributes && g.attributes.position;
      if (idx) tris += idx.count / 3; else if (pos) tris += pos.count / 3;
      if (pos) verts += pos.count;
    }
  });
  return { jet: j, id: (typeof JETS !== 'undefined' && JETS[j]) ? JETS[j].id : String(j), meshes, uniqueGeos: geos.size, materials: mats.size, triangles: Math.round(tris), vertices: verts };
}, jet);

const count = await page.evaluate(() => (typeof JETS !== 'undefined' ? JETS.length : 1));
const indices = onlyIdx != null ? [onlyIdx] : Array.from({ length: count }, (_, i) => i);
const rows = [];
for (const i of indices) rows.push(await measure(i));

console.log('idx  id            meshes  uniqGeo  mats   tris    verts');
for (const r of rows) {
  console.log(
    String(r.jet).padEnd(4),
    r.id.padEnd(13),
    String(r.meshes).padStart(5),
    String(r.uniqueGeos).padStart(7),
    String(r.materials).padStart(5),
    String(r.triangles).padStart(7),
    String(r.vertices).padStart(8),
  );
}
console.log('\nJSON ' + JSON.stringify(rows));

await browser.close();
server.close();
