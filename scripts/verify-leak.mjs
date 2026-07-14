/* F10 acceptance gate: reset-path material/geometry leak detector.
   Boots the game headless (ephemeral-port static server, mirrors scripts/shot.mjs),
   then loops N cycles of startGame(selectedJet) -> a few stepped frames -> returnToHangar()
   and samples GPU resource counts after each cycle.

   The authoritative leak signal is renderer.info.memory.geometries / .textures:
   a geometry uploaded to the GPU is only decremented on .dispose(), NOT on scene.remove,
   so anything detached-without-dispose on the reset path keeps climbing monotonically.
   We also traverse the live scene for a unique-material count + expose GEO_CACHE.size.

   PASS  = the last 3 cycles plateau (spread <= EPS) for every tracked metric.
   FAIL  = monotonic growth (non-zero exit) — the reset path is leaking.

   Usage: node scripts/verify-leak.mjs   (optional env: LEAK_CYCLES, LEAK_STEP, LEAK_EPS)
   Requires playwright (devDep). Not part of the shipped game. */
import { chromium } from 'playwright';
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.glb': 'model/gltf-binary' };
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

const CYCLES = +(process.env.LEAK_CYCLES || 8);
const STEP = +(process.env.LEAK_STEP || 300);   // ms of stepped frames between build + teardown
const EPS = +(process.env.LEAK_EPS || 2);       // allowed spread across the last 3 cycles

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let pageErr = null;
page.on('pageerror', e => { pageErr = e.message; console.error('PAGE ERROR:', e.message); });
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1400);

// drive past the first-run language gate (langSelect -> onboard -> hangar), same as shot.mjs
await page.evaluate(() => {
  const dd = document.getElementById('langDropdown');
  if (dd) { dd.value = 'EN'; dd.dispatchEvent(new Event('change', { bubbles: true })); }
  const en = document.querySelector('.ob-lang[data-lang="EN"]');
  if (en) en.click();
});
await page.waitForTimeout(250);
await page.evaluate(() => { const cont = document.getElementById('obContinue'); if (cont) cont.click(); });
await page.waitForTimeout(700);

// The per-cycle sampler runs entirely in page scope so raw THREE objects never cross the bridge.
const measure = () => {
  const info = renderer.info, mem = info.memory || {};
  const mats = new Set(), geos = new Set(), texs = new Set();
  scene.traverse(o => {
    if (o.geometry && o.geometry.uuid) geos.add(o.geometry.uuid);
    const ml = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of ml) {
      if (!m) continue;
      mats.add(m.uuid);
      for (const k in m) { const v = m[k]; if (v && v.isTexture && v.uuid) texs.add(v.uuid); }
    }
  });
  let geoCache = -1;
  try { geoCache = (typeof GEO_CACHE !== 'undefined') ? GEO_CACHE.size : -1; } catch { geoCache = -1; }
  return {
    gpuGeo: mem.geometries || 0,          // renderer.info.memory.geometries — leak signal (survives scene.remove)
    gpuTex: mem.textures || 0,            // renderer.info.memory.textures
    sceneMat: mats.size,                  // unique materials currently in the scene graph
    sceneGeo: geos.size,                  // unique geometries currently in the scene graph
    geoCache,                             // GEO_CACHE.size (bounded shared-template cache — should plateau fast)
    children: scene.children.length,
    programs: (info.programs || []).length
  };
};

const rows = [];
for (let c = 0; c < CYCLES; c++) {
  const started = await page.evaluate(() => {
    try {
      if (typeof opMode !== 'undefined') opMode = false;   // ensure a direct Endless run (Operations would divert to nav)
      if (state !== 'hangar') { if (typeof returnToHangar === 'function') returnToHangar(); }
      startGame(selectedJet);
      return state === 'playing';
    } catch (e) { return 'ERR:' + e.message; }
  });
  if (started !== true) { console.error(`cycle ${c + 1}: startGame did not enter play (${started})`); }
  await page.waitForTimeout(STEP);
  await page.evaluate(() => { try { returnToHangar(); } catch (e) { console.error('returnToHangar threw', e.message); } });
  await page.waitForTimeout(300);                          // let the hangar render so renderer.info is current
  const m = await page.evaluate(measure);
  rows.push(m);
}

await browser.close();
server.close();

// ---- report ----
const cols = ['gpuGeo', 'gpuTex', 'sceneMat', 'sceneGeo', 'geoCache', 'children', 'programs'];
const pad = (s, w) => String(s).padStart(w);
console.log('\nReset-path leak — per-cycle GPU/scene sample (N=' + CYCLES + ', step=' + STEP + 'ms)\n');
console.log('cycle | ' + cols.map(c => pad(c, 9)).join(' | '));
console.log('------+-' + cols.map(() => '---------').join('-+-'));
rows.forEach((r, i) => console.log(pad(i + 1, 5) + ' | ' + cols.map(c => pad(r[c], 9)).join(' | ')));

// gate metrics: GPU-resident resources persist across scene.remove, so they expose the leak.
const gate = ['gpuGeo', 'gpuTex', 'sceneMat'];
const last3 = rows.slice(-3);
let fail = false;
console.log('\nLast-3-cycle plateau check (spread <= ' + EPS + '):');
for (const key of gate) {
  const vals = last3.map(r => r[key]);
  const spread = Math.max(...vals) - Math.min(...vals);
  const growth = rows[rows.length - 1][key] - rows[0][key];
  const ok = spread <= EPS;
  if (!ok) fail = true;
  console.log('  ' + key.padEnd(9) + ' last3=[' + vals.join(', ') + '] spread=' + spread + '  total-growth=' + growth + '  ' + (ok ? 'PLATEAU' : 'LEAKING'));
}
if (pageErr) { console.error('\nFAIL: page error during run: ' + pageErr); process.exit(2); }
if (fail) { console.error('\nFAIL: reset path is leaking (a gated metric grows across the last 3 cycles).'); process.exit(1); }
console.log('\nPASS: reset path plateaus — no material/geometry leak across ' + CYCLES + ' cycles.');
