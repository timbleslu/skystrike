/* THROWAWAY visual-verification harness (not shipped). Boots the hangar headless on HIGH gfx tier,
   dev-unlocks everything, then loops the 7 textureless jets × 3 skins. For each (jet, skin) it sets
   the transient previewSkin, rebuilds via selectJet(rosterIndex), freezes the preview jet at a fixed
   3/4 front-top angle, and screenshots the isolated #jetPreviewCanvas. Skin 3 also gets 2 extra angles.
   It additionally dumps, per skin, a structural report of what applyPaint actually added to the model
   (decal plane count, geo-accent mesh count) so we can prove the elevated read is real, not just pixels.
   Usage: node .scratch/jet-skins/verify-skins3.mjs */
import { chromium } from 'playwright';
import http from 'http';
import { readFile, mkdir } from 'fs/promises';
import { extname, join } from 'path';

const root = new URL('../../', import.meta.url).pathname;   // repo root (file lives in .scratch/jet-skins/)
const OUT = join(root, '.scratch/jet-skins/shots');
await mkdir(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = http.createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  try { const d = await readFile(join(root, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

// roster index → jet id, for the 7 textureless airframes (confirmed from js/roster.js)
const JET_ROWS = [
  { idx: 0,  id: 'FT-1', shape: 'STD' },
  { idx: 3,  id: 'J-20', shape: 'J20' },
  { idx: 5,  id: 'EFT',  shape: 'EFT' },
  { idx: 8,  id: 'FA18', shape: 'FA18' },
  { idx: 9,  id: 'F-47', shape: 'F47' },
  { idx: 10, id: 'J-36', shape: 'J36' },
  { idx: 11, id: 'J-50', shape: 'J50' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1400);

// drive past the language gate + onboarding, force HIGH tier + dev-unlock, land on the hangar
await page.evaluate(() => { const en = document.querySelector('[data-lang="en"]'); if (en) en.click(); });
await page.waitForTimeout(200);
await page.evaluate(() => { const c = document.querySelector('#onboard .btn-primary, #onboard button'); if (c) c.click(); });
await page.waitForTimeout(300);
await page.evaluate(() => {
  ['langSelect', 'onboard', 'manual', 'touchControls'].forEach(id => { const e = document.getElementById(id); if (e) { e.classList.remove('show'); e.classList.add('hide'); e.style.display = 'none'; } });
  if (typeof tutorial !== 'undefined' && tutorial) tutorial.active = false;
  if (typeof finishTutorial === 'function') try { finishTutorial(); } catch (e) {}
  if (typeof returnToHangar === 'function') returnToHangar();
  const h = document.getElementById('hangar'); if (h) { h.classList.remove('hide'); h.style.removeProperty('display'); }
  if (typeof state !== 'undefined') state = 'hangar';
  // FORCE high tier so textureless glTF models load + decals/geo render; dev-unlock so every skin is "owned"
  if (typeof gfxTier !== 'undefined') gfxTier = 'high';
  if (typeof gfxQuality !== 'undefined') gfxQuality = 'high';
  if (typeof devUnlockAll !== 'undefined') devUnlockAll = true;
  if (typeof meta !== 'undefined') { meta.sp = 999999; if (typeof saveMeta === 'function') saveMeta(); }
});
await page.waitForTimeout(300);

// wait for ALL seven textureless glTF templates to load (they load async after boot)
const loaded = await page.evaluate(async (shapes) => {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    if (typeof jetGLTF !== 'undefined' && shapes.every(s => jetGLTF[s])) return { ok: true, have: Object.keys(jetGLTF) };
    await new Promise(r => setTimeout(r, 250));
  }
  return { ok: false, have: (typeof jetGLTF !== 'undefined') ? Object.keys(jetGLTF) : [] };
}, JET_ROWS.map(r => r.shape));
console.log('GLTF templates loaded:', JSON.stringify(loaded));

// freeze a fixed 3/4 front-top angle on the preview jet and screenshot the host element.
// yaw rotates around vertical; pitch tips nose down so we see the dorsal/spine. Auto-spin is parked far ahead.
async function shoot(name, yaw, pitch) {
  await page.evaluate(({ y, p }) => {
    if (typeof previewSpinResumeAt !== 'undefined') previewSpinResumeAt = performance.now() + 1e9; // park auto-rotate
    if (typeof previewYaw !== 'undefined') previewYaw = y;
    if (typeof previewPitch !== 'undefined') previewPitch = p;
    if (typeof previewJet !== 'undefined' && previewJet) previewJet.rotation.set(p, y, 0);
  }, { y: yaw, p: pitch });
  await page.waitForTimeout(260);
  // re-assert in case the render loop nudged it
  await page.evaluate(({ y, p }) => { if (typeof previewJet !== 'undefined' && previewJet) previewJet.rotation.set(p, y, 0); }, { y: yaw, p: pitch });
  await page.waitForTimeout(80);
  const host = await page.$('#jetPreview3D');
  const target = host || await page.$('#jetPreviewCanvas');
  if (target) await target.screenshot({ path: join(OUT, name + '.png') });
  else await page.screenshot({ path: join(OUT, name + '.png') });
}

// per (jet, skin): set previewSkin, rebuild, then report structure + capture
const report = [];
for (const row of JET_ROWS) {
  // discover the 3 skin ids for this jet from SKINS at runtime (exact, ownership-agnostic)
  const skinInfo = await page.evaluate((jetId) => {
    const list = (typeof SKINS !== 'undefined' && SKINS[jetId]) ? SKINS[jetId] : [];
    return list.map(s => ({ id: s.id, hasZones: !!s.zones, hasDecal: !!s.decal, decalPattern: s.decal && s.decal.pattern, decalPlace: s.decal && s.decal.place, geoKits: (s.geo || []).map(g => g.kit + (g.on ? ':' + g.on : '') + (g.tall ? ':tall' : '')) }));
  }, row.id);

  for (let si = 0; si < skinInfo.length; si++) {
    const sk = skinInfo[si];
    // set transient preview skin + rebuild the preview jet
    const built = await page.evaluate(({ idx, skinId }) => {
      previewSkin = skinId;
      if (typeof selectJet === 'function') selectJet(idx);
      // measure what actually got added to the model
      let decalPlanes = 0, geoAccents = 0, totalMeshes = 0;
      if (typeof previewJet !== 'undefined' && previewJet) {
        previewJet.traverse(o => {
          if (!o.isMesh) return;
          totalMeshes++;
          // decal sheets: PlaneGeometry w/ MeshBasicMaterial map + renderOrder 4 (added by addSkinDecal)
          const isPlane = o.geometry && o.geometry.type === 'PlaneGeometry';
          const basicMapped = o.material && o.material.map && o.material.type === 'MeshBasicMaterial';
          if (isPlane && basicMapped) decalPlanes++;
          // geo accents: MeshStandardMaterial meshes flagged shared:false that are NOT the hull (hull clones are shared:false too,
          // but accents are small primitives: Box/Torus/Cone). Count primitive accent geometries.
          const gt = o.geometry && o.geometry.type;
          if (o.material && o.material.type === 'MeshStandardMaterial' && (gt === 'BoxGeometry' || gt === 'TorusGeometry' || gt === 'ConeGeometry')) geoAccents++;
        });
      }
      return { decalPlanes, geoAccents, totalMeshes, modelLoaded: !!(previewJet && previewJet.userData && previewJet.userData.gltf) };
    }, { idx: row.idx, skinId: sk.id });

    const tag = `${row.id.toLowerCase().replace(/[^a-z0-9]/g, '')}-${si + 1}-${sk.id}`;
    await shoot(tag, -0.7, 0.42);   // 3/4 from front-left, nose tipped down → dorsal + spine visible
    if (si === 2) {                 // skin 3 = elevated → extra angles
      await shoot(tag + '-top', 0.0, 1.0);     // near top-down → dorsal decal + spine read
      await shoot(tag + '-rear', 2.5, 0.35);   // 3/4 from rear → tail flashes / wingtip read
    }
    report.push({ jet: row.id, slot: si + 1, skin: sk.id, ...sk, built });
    console.log(`${row.id} skin${si + 1} ${sk.id}: planes=${built.decalPlanes} geoAccents=${built.geoAccents} meshes=${built.totalMeshes} (spec decal=${sk.decalPattern || '-'}/${sk.decalPlace || '-'} geo=[${sk.geoKits.join(',')}])`);
  }
}

console.log('\n===STRUCT_REPORT_JSON===');
console.log(JSON.stringify(report, null, 0));
console.log('===END===');
console.log(errs.length ? ('\nERRORS:\n' + errs.join('\n')) : '\nno console/page errors');
await browser.close();
server.close();
