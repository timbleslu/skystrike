/* Dev-only: boot headless and capture the HANGAR jet-card screen (not the flight tutorial that
   scripts/shot.mjs reaches on a first run). Forces state→hangar, selects a jet, optionally previews
   a skin + applies a drag rotation, then screenshots. Used to verify the draggable 3D preview +
   buy-to-preview chips.
   Usage: node scripts/shot-hangar.mjs <outPrefix> [jetIndex=0] [previewSkinId] [dragYawDeg] [dragPitchDeg] */
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

const prefix = process.argv[2] || '.scratch/hangar';
const jetIndex = parseInt(process.argv[3] || '0', 10);
const previewSkinId = process.argv[4] || '';
const dragYaw = parseFloat(process.argv[5] || '0');
const dragPitch = parseFloat(process.argv[6] || '0');

const browser = await chromium.launch();
const VW = parseInt(process.env.HANGAR_W || '1280', 10), VH = parseInt(process.env.HANGAR_H || '800', 10);   // HANGAR_W=420 to test the narrow/mobile framing
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1400);

// drive past the first-run language gate, then force the hangar (skip the tutorial flight first-run takes)
await page.evaluate(() => { const en = document.querySelector('[data-lang="en"]'); if (en) en.click(); });
await page.waitForTimeout(200);
await page.evaluate(() => { const c = document.querySelector('#onboard .btn-primary, #onboard button'); if (c) c.click(); });
await page.waitForTimeout(300);
await page.evaluate(() => {
  // hide any onboarding/tutorial overlays and land squarely on the hangar
  ['langSelect', 'onboard', 'manual', 'touchControls'].forEach(id => { const e = document.getElementById(id); if (e) { e.classList.remove('show'); e.classList.add('hide'); e.style.display = 'none'; } });
  if (typeof tutorial !== 'undefined' && tutorial) tutorial.active = false;
  if (typeof finishTutorial === 'function') try { finishTutorial(); } catch (e) {}
  if (typeof returnToHangar === 'function') returnToHangar();
  const h = document.getElementById('hangar'); if (h) { h.classList.remove('hide'); h.style.removeProperty('display'); }
  if (typeof state !== 'undefined') state = 'hangar';
});
await page.waitForTimeout(300);
await page.evaluate((i) => { if (typeof selectJet === 'function') selectJet(i); }, jetIndex);
await page.waitForTimeout(900);   // let any glTF model finish loading + re-select

// optional: preview a skin (owned or not) on the jet — drive the real chip-click path
if (previewSkinId) {
  await page.evaluate((id) => {
    previewSkin = id;                                   // transient hangar preview (global lexical binding)
    if (typeof selectJet === 'function') selectJet(selectedJet);   // rebuild preview with previewPaint + refresh chips/gate
  }, previewSkinId);
  await page.waitForTimeout(800);
}
// optional: apply a drag rotation to the preview jet
if (dragYaw || dragPitch) {
  await page.evaluate(({ y, p }) => {
    if (typeof previewJet !== 'undefined' && previewJet) { previewJet.rotation.y = y * Math.PI / 180; previewJet.rotation.x = p * Math.PI / 180; }
  }, { y: dragYaw, p: dragPitch });
  await page.waitForTimeout(120);
}

await page.screenshot({ path: `${prefix}.png` });
console.log('saved ' + prefix + '.png  | jet ' + jetIndex + (previewSkinId ? ' skin=' + previewSkinId : '') + ((dragYaw || dragPitch) ? ' drag=' + dragYaw + ',' + dragPitch : ''));
console.log(errs.length ? ('ERRORS:\n' + errs.join('\n')) : 'no console/page errors');
await browser.close();
server.close();
