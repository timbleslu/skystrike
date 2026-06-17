/* Dev-only: headless assertion of the buy-to-preview skin state machine (Feature 3) — the browser-only
   bits the Node unit tests can't reach (previewSkin / launchBlocked / #launch gate / no gameplay leak).
   Drives the REAL hangar DOM (chip clicks via the delegated handler). Usage: node scripts/verify-skin-gate.mjs */
import { chromium } from 'playwright';
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
const root = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const server = http.createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  try { const d = await readFile(join(root, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1400);
await page.evaluate(() => { const en = document.querySelector('[data-lang="en"]'); if (en) en.click(); });
await page.waitForTimeout(200);
await page.evaluate(() => { const c = document.querySelector('#onboard .btn-primary, #onboard button'); if (c) c.click(); });
await page.waitForTimeout(300);
await page.evaluate(() => {
  ['langSelect', 'onboard', 'manual', 'touchControls'].forEach(id => { const e = document.getElementById(id); if (e) { e.classList.add('hide'); e.style.display = 'none'; } });
  if (typeof returnToHangar === 'function') returnToHangar();
  const h = document.getElementById('hangar'); if (h) { h.classList.remove('hide'); h.style.removeProperty('display'); }
  if (typeof state !== 'undefined') state = 'hangar';
  // ensure SP is spendable for the buy step, and the FT-1 (jet 0) is selected fresh
  if (typeof meta !== 'undefined') { meta.sp = 9999; if (typeof saveMeta === 'function') saveMeta(); }
  selectJet(0);
});
await page.waitForTimeout(700);

const R = await page.evaluate(async () => {
  const out = [];
  const ok = (name, cond) => out.push({ name, pass: !!cond });
  const jetId = JETS[selectedJet].id;
  const store0 = JSON.parse(store.get('skystrike_meta') || '{}');

  // 1) tap an UNOWNED chip → previews, gates launch, shows BUY, never writes meta
  const lockedChip = document.querySelector('#jetMeta .jmskin.locked');
  ok('an unowned (locked) chip exists', lockedChip);
  const previewId = lockedChip && lockedChip.dataset.skin;
  if (lockedChip) lockedChip.click();
  ok('previewSkin set to the tapped unowned skin', previewSkin === previewId);
  ok('launchBlocked() true while previewing unowned', launchBlocked() === true);
  const launch = document.getElementById('launch');
  ok('#launch disabled + .gated', launch && launch.disabled && launch.classList.contains('gated'));
  ok('inline #jetMetaBuy shown', !!document.getElementById('jetMetaBuy'));
  ok('previewing chip has .preview state', !!document.querySelector('#jetMeta .jmskin.preview'));
  ok('GAMEPLAY paint stays owned-only (jetPaint zones null, no preview leak)', jetPaint(JETS[selectedJet]).zones === null);
  ok('skin NOT yet owned (preview did not buy)', skinOwned(jetId, previewId) === false);
  const storeAfterPreview = JSON.parse(store.get('skystrike_meta') || '{}');
  ok('NO meta/store write on mere preview (sel unchanged)', JSON.stringify(storeAfterPreview.sel || {}) === JSON.stringify(store0.sel || {}));

  // 2) tap an OWNED chip (default) → equips, clears the gate
  const ownedChip = document.querySelector('#jetMeta .jmskin:not(.locked)');
  if (ownedChip) ownedChip.click();
  ok('tapping owned chip clears the block', launchBlocked() === false);
  ok('owned chip equips (selectedSkin persists)', selectedSkin(jetId) === ownedChip.dataset.skin);

  // 3) preview unowned again, then BUY via the inline CTA → owns + equips + unblocks
  document.querySelector('#jetMeta .jmskin.locked').click();
  ok('re-blocked after previewing unowned again', launchBlocked() === true);
  const buyBtn = document.getElementById('jetMetaBuy');
  const buyId = buyBtn && buyBtn.dataset.buyskin;
  if (buyBtn) buyBtn.click();
  ok('skin now OWNED after BUY', skinOwned(jetId, buyId) === true);
  ok('launch UNBLOCKED after BUY', launchBlocked() === false);
  ok('#launch enabled after BUY', !document.getElementById('launch').disabled);
  ok('bought skin now equipped', selectedSkin(jetId) === buyId);

  // 4) revert on leave: previewing unowned then returnToHangar clears previewSkin
  const stillLocked = document.querySelector('#jetMeta .jmskin.locked');
  if (stillLocked) stillLocked.click();
  ok('previewing an unowned skin again', launchBlocked() === true);
  returnToHangar();
  ok('previewSkin cleared on leaving the hangar', previewSkin === null);
  ok('launch un-gated after revert', launchBlocked() === false);

  return out;
});

// ---- Feature 2: drag-to-rotate (raycast-gated; synthetic pointer events) ----
const D = await page.evaluate(async () => {
  const out = []; const ok = (name, cond) => out.push({ name, pass: !!cond });
  returnToHangar(); selectJet(0);
  await new Promise(r => setTimeout(r, 300));
  const rect = renderer.domElement.getBoundingClientRect();
  const wp = new THREE.Vector3(); previewJet.getWorldPosition(wp);
  const v = wp.clone().project(camera);
  const cx = (v.x * 0.5 + 0.5) * rect.width + rect.left, cy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
  // find a screen pixel actually OVER the jet (a tall-tail model's bbox centre can sit in empty air)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let sx = null, sy = null;
  for (let oy = -70; oy <= 70 && sx === null; oy += 8) for (let ox = -90; ox <= 90; ox += 8) {
    const tx = cx + ox, ty = cy + oy;
    ndc.set(((tx - rect.left) / rect.width) * 2 - 1, -((ty - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(previewJet, true).length) { sx = tx; sy = ty; break; }
  }
  ok('the preview jet is grabbable on the canvas (raycast finds it)', sx !== null);
  if (sx === null) { sx = cx; sy = cy; }
  const fire = (type, x, y) => window.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, cancelable: true }));
  // miss → no drag
  fire('pointerdown', 4, 4); ok('pointerdown off the jet does NOT start a drag', previewDragging === false); fire('pointerup', 4, 4);
  // hit → drag starts
  const yaw0 = previewYaw;
  fire('pointerdown', sx, sy); ok('pointerdown ON the jet starts a drag (raycast hit)', previewDragging === true);
  fire('pointermove', sx + 100, sy); ok('horizontal drag yaws the jet', Math.abs(previewYaw - (yaw0 + 1.0)) < 0.001);
  fire('pointermove', sx + 100, sy + 100000); ok('vertical drag pitches, CLAMPED to +60deg', Math.abs(previewPitch - PREVIEW_PITCH_MAX) < 1e-6);
  fire('pointermove', sx + 100, sy - 100000); ok('opposite drag clamps to -60deg', Math.abs(previewPitch + PREVIEW_PITCH_MAX) < 1e-6);
  const before = performance.now();
  fire('pointerup', sx + 100, sy); ok('pointerup ends the drag', previewDragging === false);
  ok('idle spin/bob paused ~3s after release', previewSpinResumeAt > before + 2000);
  return out;
});

let fail = 0;
for (const r of R.concat(D)) { console.log((r.pass ? 'ok   ' : 'FAIL ') + r.name); if (!r.pass) fail++; }
if (errs.length) { console.log('\nPAGE ERRORS:\n' + errs.join('\n')); fail += errs.length; }
console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL SKIN-GATE CHECKS PASS');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
