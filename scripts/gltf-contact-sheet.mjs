/* Dev-only: render every assets/jets/*.glb in a top-down grid (own offscreen scene) after
   applying the per-shape rotateY from ROT below, so one screenshot verifies nose→-Z (nose
   points UP in the image) + alignment (not sideways) for all models at once.
   Usage: node scripts/gltf-contact-sheet.mjs [out.png] [view top|side] */
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
const out = process.argv[2] || '.scratch/jet-visual-overhaul/contact.png';
const view = process.argv[3] || 'top';

// derived rotateY (deg) per glb to point nose -> -Z (game forward); see gltf-inspect-all output
const ROT = { 'f22.glb': -90, 'bomber.glb': -90,
  'su57.glb': 90, 'eft.glb': 90, 'fa18.glb': 90, 'j20.glb': 90, 'j36.glb': 90, 'std.glb': 90,
  'rafale.glb': 180, 'f35.glb': 180, 'f47.glb': 180, 'j50.glb': 180, 'tejas.glb': 180 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
page.on('pageerror', () => {});
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1200);

const dataUrl = await page.evaluate(async ({ ROT, view }) => {
  const files = Object.keys(ROT);
  const W = 1400, H = 1100;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x202830);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.4));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(20, 40, 20); scene.add(dl);
  const cols = 4, cell = 40, target = 30;
  const load = (url) => new Promise((res) => {
    const l = new THREE.GLTFLoader();
    if (THREE.DRACOLoader) { const d = new THREE.DRACOLoader(); d.setDecoderPath('/vendor/draco/'); l.setDRACOLoader(d); }
    l.load(url, (g) => res(g.scene), undefined, () => res(null));
  });
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const obj = await load('/assets/jets/' + f);
    if (!obj) continue;
    let box = new THREE.Box3().setFromObject(obj);
    obj.position.sub(box.getCenter(new THREE.Vector3()));
    const wrap = new THREE.Group(); wrap.add(obj);
    wrap.rotation.y = ROT[f] * Math.PI / 180;
    const size = box.getSize(new THREE.Vector3());
    wrap.scale.setScalar(target / Math.max(size.x, size.y, size.z));
    const cx = (i % cols) * cell - (cols - 1) * cell / 2;
    const cz = Math.floor(i / cols) * cell - 1.0 * cell;
    const holder = new THREE.Group(); holder.position.set(cx, 0, cz); holder.add(wrap); scene.add(holder);
  }
  const span = cols * cell;
  const cam = new THREE.OrthographicCamera(-span / 2 - cell, span / 2 + cell, span / 2 + cell, -span / 2 - cell, 0.1, 2000);
  if (view === 'side') { cam.position.set(0, 0, 300); cam.up.set(0, 1, 0); }
  else { cam.position.set(0, 300, 0); cam.up.set(0, 0, -1); }      // top-down: nose(-Z) points UP in image
  cam.lookAt(0, 0, 0);
  renderer.render(scene, cam);
  return canvas.toDataURL('image/png');
}, { ROT, view });

const b64 = dataUrl.split(',')[1];
const { writeFile, mkdir } = await import('fs/promises');
await mkdir(join(root, '.scratch/jet-visual-overhaul'), { recursive: true });
await writeFile(join(root, out), Buffer.from(b64, 'base64'));
console.log('wrote', out, '(grid order:', Object.keys(ROT).join(' '), ')');
await browser.close(); server.close();
