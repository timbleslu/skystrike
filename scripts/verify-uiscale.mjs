/* Functional check for the HUD-size / UI-size split (v1.2).
   Asserts: both selects exist w/ 5 opts + correct labels; UI size zooms every menu screen
   (incl. the ones the old list missed) and is DECOUPLED from HUD size. Throwaway dev tool. */
import http from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream' };
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
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1400);
await page.evaluate(() => { const en = document.querySelector('.ob-lang[data-lang="EN"], [data-lang="en"]'); if (en) en.click(); });
await page.waitForTimeout(200);
await page.evaluate(() => { const c = document.getElementById('obContinue') || document.querySelector('#onboard .btn-primary, #onboard button'); if (c) c.click(); });
await page.waitForTimeout(400);
await page.evaluate(() => { ['langSelect', 'onboard', 'touchControls'].forEach(id => { const e = document.getElementById(id); if (e) { e.classList.remove('show'); e.style.display = 'none'; } }); });
await page.waitForTimeout(400);
// open Settings → Display so the two selects are live
await page.evaluate(() => { if (typeof openManual === 'function') openManual(); if (typeof showManualTab === 'function') showManualTab('settings'); if (typeof showSettingsSubtab === 'function') showSettingsSubtab('display'); });
await page.waitForTimeout(300);

const fail = (m) => errs.push('ASSERT ' + m);

const r = await page.evaluate(() => {
  const out = {};
  const hud = document.getElementById('setHudScale'), ui = document.getElementById('setUiScale');
  out.hudOpts = hud ? hud.options.length : -1;
  out.uiOpts = ui ? ui.options.length : -1;
  out.hudLbl = (document.getElementById('lblHudScale') || {}).textContent;
  out.uiLbl = (document.getElementById('lblUiScale') || {}).textContent;

  // (1) UI size 0.65 -> menus shrink, HUD untouched
  ui.value = '0.65'; ui.dispatchEvent(new Event('change'));
  out.uiGlobal = (typeof uiScale !== 'undefined') ? uiScale : null;
  out.zoomHangar = document.getElementById('hangar').style.zoom;
  out.zoomManual = document.getElementById('manual').style.zoom;
  out.zoomOpsSelect = (document.getElementById('opsSelect') || {}).style ? document.getElementById('opsSelect').style.zoom : 'MISSING'; // was missing from old list
  out.zoomBriefing = document.getElementById('briefing').style.zoom; // was missing from old list
  out.hudVarAfterUi = getComputedStyle(document.getElementById('hud')).getPropertyValue('--hud-scale').trim();

  // (2) HUD size 1.3 -> HUD var changes, menu zoom unchanged (decoupled)
  hud.value = '1.3'; hud.dispatchEvent(new Event('change'));
  out.hudVar = getComputedStyle(document.getElementById('hud')).getPropertyValue('--hud-scale').trim();
  out.zoomHangarAfterHud = document.getElementById('hangar').style.zoom; // must still be 0.65
  return out;
});

if (r.hudOpts !== 5) fail(`#setHudScale opts ${r.hudOpts} != 5`);
if (r.uiOpts !== 5) fail(`#setUiScale opts ${r.uiOpts} != 5`);
if (r.hudLbl !== 'HUD size') fail(`HUD label "${r.hudLbl}" != "HUD size"`);
if (r.uiLbl !== 'UI size') fail(`UI label "${r.uiLbl}" != "UI size"`);
if (Math.abs(r.uiGlobal - 0.65) > 1e-9) fail(`uiScale global ${r.uiGlobal} != 0.65`);
if (r.zoomHangar !== '0.65') fail(`#hangar zoom ${r.zoomHangar} != 0.65`);
if (r.zoomManual !== '0.65') fail(`#manual zoom ${r.zoomManual} != 0.65`);
if (r.zoomOpsSelect !== '0.65') fail(`#opsSelect zoom ${r.zoomOpsSelect} != 0.65 (old list missed it)`);
if (r.zoomBriefing !== '0.65') fail(`#briefing zoom ${r.zoomBriefing} != 0.65 (old list missed it)`);
if (r.hudVarAfterUi && r.hudVarAfterUi !== '1' && r.hudVarAfterUi !== '') fail(`HUD var moved when UI changed: ${r.hudVarAfterUi}`);
if (r.hudVar !== '1.3') fail(`#hud --hud-scale ${r.hudVar} != 1.3`);
if (r.zoomHangarAfterHud !== '0.65') fail(`HUD size leaked into menus: #hangar zoom now ${r.zoomHangarAfterHud}`);

await browser.close();
server.close();
console.log(JSON.stringify(r, null, 2));
if (errs.length) { console.log('FAIL\n' + errs.join('\n')); process.exit(1); }
console.log('PASS — HUD/UI split works, menus (incl. previously-missed opsSelect/briefing) zoom, decoupled');
