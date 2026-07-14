/* Dev-only: build each roster jet as the game does (buildJetOrGLTF player path → afterburner),
   throttle the engines up, and render a rear-3/4 grid with the game's env lighting — one screenshot
   to verify per-jet FLAMES (count/position) + COLOUR/texture + orientation. Usage: node scripts/verify-jets.mjs [out.png] */
import { chromium } from 'playwright';
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
const root = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.bin': 'application/octet-stream' };
const server = http.createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  try { const d = await readFile(join(root, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const out = process.argv[2] || '.scratch/jet-visual-overhaul/verify-jets.png';
const view = process.argv[3] || '3q';                          // top | rear | 3q
const shapesArg = process.argv[4] || '';                       // csv subset, e.g. SU57,EFT,RAFALE
const skinId = process.argv[5] || '';                          // optional skin id (e.g. splinter) → render that livery's zones

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1150 } });
page.on('pageerror', e => console.error('PAGEERR', e.message));
await page.goto(`http://127.0.0.1:${port}/`);
// wait for all glTF templates to load
await page.waitForFunction(() => typeof jetGLTF !== 'undefined' && Object.keys(jetGLTF).length >= 13, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(400);

const dataUrl = await page.evaluate(({ view, shapesArg, skinId }) => {
  const ALL = ['F22', 'SU57', 'J20', 'F35', 'EFT', 'TEJAS', 'RAFALE', 'FA18', 'J36', 'F47', 'J50', 'STD', 'BOMBER'];
  const SHAPESL = shapesArg ? shapesArg.split(',') : ALL;
  const W = 1500, H = 1150;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x1a2028);
  if (typeof scene !== 'undefined' && scene.environment) sc.environment = scene.environment;   // reuse game PBR env
  sc.add(new THREE.HemisphereLight(0xffffff, 0x40454a, 1.1));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(30, 50, 20); sc.add(dl);
  const present = SHAPESL.filter(id => jetGLTF[id]);
  const cell = 46, cols = Math.min(4, present.length), rows = Math.ceil(present.length / cols);
  const loaded = [];
  for (let k = 0; k < present.length; k++) {
    const id = present[k];
    const jet = (typeof JETS !== 'undefined') && JETS.find(j => j.shape === id);
    // skinId: '' = equipped (jetPaint); '0'|'1'|'2' = that SKIN SLOT for each jet (so one montage = every jet's Nth livery); else a literal skin id
    let paint;
    if (jet && skinId !== '' && typeof resolveSkinPaint === 'function') {
      const list = (typeof SKINS !== 'undefined') && SKINS[jet.id];
      if (/^[0-2]$/.test(skinId) && list && list[+skinId]) paint = resolveSkinPaint(jet, list[+skinId].id);
      else paint = resolveSkinPaint(jet, skinId);
    } else paint = (jet && typeof jetPaint === 'function') ? jetPaint(jet) : { color: 0xdfe4ea, accent: 0xff7a2a };
    const clone = buildJetOrGLTF(paint.color, paint.accent, SHAPES[id], true, { skin: paint });   // player path -> skin paint (zones) + burner
    if (clone.userData.engines && typeof animEngines === 'function') animEngines(clone, 0.95);
    const gx = ((k % cols) - (cols - 1) / 2) * cell;
    const gr = (Math.floor(k / cols) - (rows - 1) / 2) * cell;
    if (view === 'rear') clone.position.set(gx, -gr, 0);   // rows stack in Y
    else clone.position.set(gx, 0, gr);                    // top / 3q: rows in Z
    sc.add(clone); loaded.push(id);
  }
  const aspect = W / H;
  let hX = cols * cell / 2 + cell * 0.3, hY = rows * cell / 2 + cell * 0.3;
  if (hX / hY < aspect) hX = hY * aspect; else hY = hX / aspect;
  const cam = new THREE.OrthographicCamera(-hX, hX, hY, -hY, 0.1, 4000);
  if (view === 'top') { cam.position.set(0, 1000, 0); cam.up.set(0, 0, -1); }
  else if (view === 'rear') { cam.position.set(0, 0, 1000); cam.up.set(0, 1, 0); }
  else { cam.position.copy(new THREE.Vector3(0.45, 0.6, 1).normalize().multiplyScalar(1000)); cam.up.set(0, 1, 0); }
  cam.lookAt(0, 0, 0);
  renderer.render(sc, cam);
  return { url: canvas.toDataURL('image/png'), loaded };
}, { view, shapesArg, skinId });

const b64 = dataUrl.url.split(',')[1];
const { writeFile, mkdir } = await import('fs/promises');
const { dirname } = await import('path');
await mkdir(dirname(join(root, out)), { recursive: true });
await writeFile(join(root, out), Buffer.from(b64, 'base64'));
console.log('wrote', out, '\norder (4 cols):', dataUrl.loaded.join(' '));
await browser.close(); server.close();
