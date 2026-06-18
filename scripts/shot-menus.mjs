/* Throwaway: capture the in-scope MENU/overlay screens for the per-screen layout redesign pass.
   Navigates past the language gate + onboarding into the hangar, then opens each overlay and
   screenshots it. Default skin (standard) + default palette (amber).

   THREE capture modes per screen prove the redesign goals:
     - desktop EN/ZH @ 1280x860, UI size 1.0   (baseline bold layout)
     - desktop      @ 1280x860, UI size 0.65    (DENSITY proof: box stays fixed, content denser)
     - mobile       @ 390x844,  UI size 1.0     (responsive reflow proof)

   Usage: node scripts/shot-menus.mjs <label>   (label = 'before' | 'after')
   Output: .scratch/menus/<label>-<screen>-<lang>.png
           .scratch/menus/<label>-<screen>-dense.png   (UI 0.65)
           .scratch/menus/<label>-<screen>-mobile.png  (390 wide) */
import { chromium } from 'playwright';
import http from 'http';
import { readFile, mkdir } from 'fs/promises';
import { extname, join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream' };
const server = http.createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  try { const d = await readFile(join(root, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const label = process.argv[2] || 'before';
const outDir = join(root, '.scratch', 'menus');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const errs = [];

/* ---- shared bootstrap: drive a fresh page past the language gate + onboarding into the hangar ---- */
async function bootstrap(page) {
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const dd = document.getElementById('langDropdown');
    if (dd) { dd.value = 'EN'; dd.dispatchEvent(new Event('change', { bubbles: true })); }
    const en = document.querySelector('.ob-lang[data-lang="EN"], [data-lang="en"]'); if (en) en.click();
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => { const c = document.getElementById('obContinue') || document.querySelector('#onboard .btn-primary, #onboard button'); if (c) c.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    if (typeof tutorial !== 'undefined' && tutorial) tutorial.active = false;
    if (typeof finishTutorial === 'function') try { finishTutorial(); } catch (e) {}
    if (typeof returnToHangar === 'function') returnToHangar();
    ['langSelect', 'onboard', 'touchControls'].forEach(id => { const e = document.getElementById(id); if (e) { e.classList.remove('show'); e.style.display = 'none'; } });
  });
  await page.waitForTimeout(500);
}

const setLang = (page, lang) => page.evaluate((L) => { if (typeof LANG !== 'undefined') { LANG = L; if (typeof saveSettings === 'function') saveSettings(); if (typeof applyLang === 'function') applyLang(); } }, lang).then(() => page.waitForTimeout(300));

const setUiScale = (page, s) => page.evaluate((v) => { if (typeof uiScale !== 'undefined') { uiScale = v; if (typeof applyUiScale === 'function') applyUiScale(); } else { document.documentElement.style.setProperty('--ui-content', String(v)); } }, s).then(() => page.waitForTimeout(250));

const hideAllOverlays = (page) => page.evaluate(() => {
  ['manual', 'meta', 'modeChoice', 'endlessSetup', 'opsSelect', 'levelMap', 'briefing', 'opLore', 'wingpick', 'upgrade', 'gameover'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('show'); });
});

// the screens to capture and how to open each (priority screens reach the deep flow screens)
const open = {
  hangar: async (page) => { await hideAllOverlays(page); await page.evaluate(() => { if (typeof returnToHangar === 'function') returnToHangar(); if (typeof selectJet === 'function') selectJet(0); }); await page.waitForTimeout(700); },
  modeChoice: async (page) => { await hideAllOverlays(page); await page.evaluate(() => { if (typeof openModeChoice === 'function') openModeChoice(); else { const m = document.getElementById('modeChoice'); if (m) m.classList.add('show'); } }); await page.waitForTimeout(300); },
  endlessSetup: async (page) => { await hideAllOverlays(page); await page.evaluate(() => { if (typeof openEndlessSetup === 'function') openEndlessSetup(); else { const m = document.getElementById('endlessSetup'); if (m) m.classList.add('show'); } }); await page.waitForTimeout(300); },
  opsSelect: async (page) => { await hideAllOverlays(page); await page.evaluate(() => { opMode = true; if (typeof openOperationsSelect === 'function') openOperationsSelect(); }); await page.waitForTimeout(400); },
  // deep flow: operation 0's level map (needs the op unlocked — op 0 always is)
  levelMap: async (page) => { await hideAllOverlays(page); await page.evaluate(() => { opMode = true; const op = (typeof OPERATIONS !== 'undefined') && OPERATIONS[0]; if (op && typeof openLevelMap === 'function') openLevelMap(op.id); }); await page.waitForTimeout(450); },
  briefing: async (page) => { await hideAllOverlays(page); await page.evaluate(() => { opMode = true; const op = (typeof OPERATIONS !== 'undefined') && OPERATIONS[0]; if (op && typeof openBriefing === 'function') openBriefing(op.id, 0); }); await page.waitForTimeout(450); },
  opLore: async (page) => { await hideAllOverlays(page); await page.evaluate(() => { opMode = true; const op = (typeof OPERATIONS !== 'undefined') && OPERATIONS[0]; if (op && typeof openOperationLore === 'function') openOperationLore(op.id); }); await page.waitForTimeout(450); },
  manualSettings: async (page) => { await page.evaluate(() => { if (typeof openManual === 'function') openManual(); if (typeof showManualTab === 'function') showManualTab('settings'); if (typeof showSettingsSubtab === 'function') showSettingsSubtab('display'); }); await page.waitForTimeout(350); },
  meta: async (page) => { await hideAllOverlays(page); await page.evaluate(() => { if (typeof openMetaScreen === 'function') openMetaScreen(); else { const m = document.getElementById('meta'); if (m) m.classList.add('show'); } }); await page.waitForTimeout(400); },
};

// the priority screens that must show the density + mobile proof
const PRIORITY = ['hangar', 'opsSelect', 'levelMap', 'briefing', 'opLore', 'manualSettings'];

async function resetToHangar(page) {
  await page.evaluate(() => { const mn = document.getElementById('manual'); if (mn) mn.classList.remove('show'); paused = false; });
  await hideAllOverlays(page);
  await page.evaluate(() => { if (typeof returnToHangar === 'function') returnToHangar(); });
  await page.waitForTimeout(150);
}

/* ===== PASS 1: desktop 1280x860, EN + ZH, UI size 1.0 ===== */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  await bootstrap(page);
  for (const lang of ['EN', 'ZH']) {
    await setLang(page, lang);
    await setUiScale(page, 1.0);
    for (const [screen, fn] of Object.entries(open)) {
      try {
        if (screen !== 'hangar') await resetToHangar(page);
        await setUiScale(page, 1.0);
        await fn(page);
        await page.screenshot({ path: join(outDir, `${label}-${screen}-${lang}.png`) });
      } catch (e) { errs.push(`SHOT ${screen}/${lang}: ${e.message}`); }
    }
  }
  await page.close();
}

/* ===== PASS 2: desktop 1280x860, UI size 0.65 — DENSITY proof (box fixed, content denser) ===== */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  await bootstrap(page);
  await setLang(page, 'EN');
  for (const screen of PRIORITY) {
    try {
      if (screen !== 'hangar') await resetToHangar(page);
      await setUiScale(page, 0.65);
      await open[screen](page);
      await setUiScale(page, 0.65);
      await page.screenshot({ path: join(outDir, `${label}-${screen}-dense.png`) });
    } catch (e) { errs.push(`DENSE ${screen}: ${e.message}`); }
  }
  await page.close();
}

/* ===== PASS 3: mobile 390x844 — responsive reflow proof ===== */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await bootstrap(page);
  await setLang(page, 'EN');
  for (const screen of PRIORITY) {
    try {
      if (screen !== 'hangar') await resetToHangar(page);
      await setUiScale(page, 1.0);
      await open[screen](page);
      await page.screenshot({ path: join(outDir, `${label}-${screen}-mobile.png`) });
    } catch (e) { errs.push(`MOBILE ${screen}: ${e.message}`); }
  }
  await page.close();
}

await browser.close();
server.close();
console.log(`saved menu shots → .scratch/menus/${label}-*.png`);
console.log(errs.length ? ('ERRORS:\n' + errs.join('\n')) : 'no console/page errors');
