/* Functional proof for the UI-size DENSITY mechanism (v1.2.x).
   Asserts: HUD/UI sliders exist (5 opts, correct labels); UI size publishes --ui-content and is
   decoupled from --hud-scale; and the CORE PROOF — at UI size 0.65 a menu BOX keeps its footprint
   while the .ui-dense content inside scales DOWN (so more content fits the same box). Throwaway tool. */
import http from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  try { const d = await readFile(join(root, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1400);
await page.evaluate(() => { const en = document.querySelector('.ob-lang[data-lang="EN"], [data-lang="en"]'); if (en) en.click(); });
await page.waitForTimeout(200);
await page.evaluate(() => { const c = document.getElementById('obContinue') || document.querySelector('#onboard .btn-primary, #onboard button'); if (c) c.click(); });
await page.waitForTimeout(400);
await page.evaluate(() => { ['langSelect', 'onboard', 'touchControls'].forEach(id => { const e = document.getElementById(id); if (e) { e.classList.remove('show'); e.style.display = 'none'; } }); });
await page.waitForTimeout(300);

const setUi = (v) => page.evaluate((val) => { uiScale = val; applyUiScale(); }, v);
const fail = (m) => errs.push('ASSERT ' + m);

// settings selects present + labels
await page.evaluate(() => { if (typeof openManual === 'function') openManual(); if (typeof showManualTab === 'function') showManualTab('settings'); if (typeof showSettingsSubtab === 'function') showSettingsSubtab('display'); });
await page.waitForTimeout(250);
const sel = await page.evaluate(() => ({
  hudOpts: (document.getElementById('setHudScale') || {}).options?.length ?? -1,
  uiOpts: (document.getElementById('setUiScale') || {}).options?.length ?? -1,
  hudLbl: (document.getElementById('lblHudScale') || {}).textContent,
  uiLbl: (document.getElementById('lblUiScale') || {}).textContent,
}));
if (sel.hudOpts !== 5) fail(`#setHudScale opts ${sel.hudOpts} != 5`);
if (sel.uiOpts !== 5) fail(`#setUiScale opts ${sel.uiOpts} != 5`);
if (sel.hudLbl !== 'HUD size') fail(`HUD label "${sel.hudLbl}" != "HUD size"`);
if (sel.uiLbl !== 'UI size') fail(`UI label "${sel.uiLbl}" != "UI size"`);

// decoupling: --ui-content moves, --hud-scale doesn't (and vice versa)
await setUi(0.65);
const dec = await page.evaluate(() => ({
  uiVar: getComputedStyle(document.documentElement).getPropertyValue('--ui-content').trim(),
  hudVar: getComputedStyle(document.getElementById('hud')).getPropertyValue('--hud-scale').trim(),
}));
if (dec.uiVar !== '0.65') fail(`--ui-content ${dec.uiVar} != 0.65`);
if (dec.hudVar && dec.hudVar !== '1' && dec.hudVar !== '') fail(`--hud-scale moved with UI size: ${dec.hudVar}`);

// CORE PROOF on #briefing: box fixed, .ui-dense content shrinks at 0.65
await page.evaluate(() => { const m = document.getElementById('manual'); if (m) m.classList.remove('show'); });
await page.evaluate(() => { opMode = true; const op = (typeof OPERATIONS !== 'undefined') && OPERATIONS[0]; if (op && typeof openBriefing === 'function') openBriefing(op.id, 0); });
await page.waitForTimeout(450);
const measure = () => page.evaluate(() => {
  const box = document.querySelector('#briefing .brief-box') || document.querySelector('#briefing .cmp-box') || document.querySelector('#briefing > div');
  const dense = document.querySelector('#briefing .ui-dense');
  const br = box ? box.getBoundingClientRect() : null;
  const dr = dense ? dense.getBoundingClientRect() : null;
  return { boxW: br ? Math.round(br.width) : null, boxH: br ? Math.round(br.height) : null, denseW: dr ? Math.round(dr.width) : null, denseH: dr ? Math.round(dr.height) : null, hasDense: !!dense };
});
await setUi(1.0); await page.waitForTimeout(150); const at10 = await measure();
await setUi(0.65); await page.waitForTimeout(150); const at65 = await measure();

if (!at10.hasDense) fail('#briefing has no .ui-dense core to scale');
if (at10.boxW == null) fail('could not find #briefing box');
if (at10.boxW != null) {
  // box footprint stays fixed (width) while the dense core's vertical footprint shrinks => more content per box.
  // (.ui-dense-fill keeps visual WIDTH constant by design — width compensates the zoom — so density shows as height.)
  if (Math.abs(at65.boxW - at10.boxW) > 2) fail(`box WIDTH changed with UI size: ${at10.boxW} -> ${at65.boxW} (must stay fixed)`);
  if (at65.denseH == null || !(at65.denseH < at10.denseH * 0.9)) fail(`dense content height did NOT shrink: denseH ${at10.denseH} -> ${at65.denseH}`);
}

await browser.close();
server.close();
console.log(JSON.stringify({ sel, dec, briefing_at_1_0: at10, briefing_at_0_65: at65 }, null, 2));
if (errs.length) { console.log('FAIL\n' + errs.join('\n')); process.exit(1); }
console.log('PASS — UI size denses content (box fixed, .ui-dense shrinks), decoupled from HUD size');
