/* Throwaway: capture the in-scope MENU/overlay screens for the aesthetic redesign pass.
   Navigates past the language gate + onboarding into the hangar, then opens each overlay
   and screenshots it in BOTH EN and ZH. Default skin (standard) + default palette (amber).
   Usage: node scripts/shot-menus.mjs <label>   (label = 'before' | 'after')
   Output: .scratch/menus/<label>-<screen>-<lang>.png */
import { chromium } from 'playwright';
import http from 'http';
import { readFile, mkdir } from 'fs/promises';
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

const label = process.argv[2] || 'before';
const outDir = join(root, '.scratch', 'menus');
await mkdir(outDir, { recursive: true });

const VW = 1280, VH = 860;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1400);

// past the language gate + onboarding, land in the real hangar
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

const setLang = async (lang) => {
  await page.evaluate((L) => { if (typeof LANG !== 'undefined') { LANG = L; if (typeof saveSettings === 'function') saveSettings(); if (typeof applyLang === 'function') applyLang(); } }, lang);
  await page.waitForTimeout(300);
};

const hideAllOverlays = () => page.evaluate(() => {
  ['manual', 'meta', 'modeChoice', 'endlessSetup', 'opsSelect', 'levelMap', 'briefing', 'opLore', 'wingpick', 'upgrade', 'gameover'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('show'); });
});

const shot = async (screen, lang) => {
  await page.screenshot({ path: join(outDir, `${label}-${screen}-${lang}.png`) });
};

// the screens to capture per language and how to open each
const open = {
  hangar: async () => { await hideAllOverlays(); await page.evaluate(() => { if (typeof returnToHangar === 'function') returnToHangar(); if (typeof selectJet === 'function') selectJet(0); }); await page.waitForTimeout(700); },
  manualGuide: async () => { await page.evaluate(() => { if (typeof openManual === 'function') openManual(); if (typeof showManualTab === 'function') showManualTab('guide'); }); await page.waitForTimeout(350); },
  manualSettings: async () => { await page.evaluate(() => { if (typeof openManual === 'function') openManual(); if (typeof showManualTab === 'function') showManualTab('settings'); if (typeof showSettingsSubtab === 'function') showSettingsSubtab('display'); }); await page.waitForTimeout(350); },
  manualSettingsControls: async () => { await page.evaluate(() => { if (typeof openManual === 'function') openManual(); if (typeof showManualTab === 'function') showManualTab('settings'); if (typeof showSettingsSubtab === 'function') showSettingsSubtab('controls'); }); await page.waitForTimeout(350); },
  modeChoice: async () => { await hideAllOverlays(); await page.evaluate(() => { if (typeof openModeChoice === 'function') openModeChoice(); else { const m = document.getElementById('modeChoice'); if (m) m.classList.add('show'); } }); await page.waitForTimeout(300); },
  endlessSetup: async () => { await hideAllOverlays(); await page.evaluate(() => { if (typeof openEndlessSetup === 'function') openEndlessSetup(); else { const m = document.getElementById('endlessSetup'); if (m) m.classList.add('show'); } }); await page.waitForTimeout(300); },
  opsSelect: async () => { await hideAllOverlays(); await page.evaluate(() => { opMode = true; if (typeof openOperationsSelect === 'function') openOperationsSelect(); }); await page.waitForTimeout(400); },
  meta: async () => { await hideAllOverlays(); await page.evaluate(() => { if (typeof openMetaScreen === 'function') openMetaScreen(); else { const m = document.getElementById('meta'); if (m) m.classList.add('show'); } }); await page.waitForTimeout(400); },
};

for (const lang of ['EN', 'ZH']) {
  await setLang(lang);
  for (const [screen, fn] of Object.entries(open)) {
    try {
      // reset to hangar baseline before each non-hangar overlay so state is clean
      if (screen !== 'hangar') { await page.evaluate(() => { const mn = document.getElementById('manual'); if (mn) mn.classList.remove('show'); paused = false; }); await hideAllOverlays(); await page.evaluate(() => { if (typeof returnToHangar === 'function') returnToHangar(); }); await page.waitForTimeout(150); }
      await fn();
      await shot(screen, lang);
    } catch (e) { errs.push(`SHOT ${screen}/${lang}: ${e.message}`); }
  }
}

await browser.close();
server.close();
console.log(`saved menu shots → .scratch/menus/${label}-*.png`);
console.log(errs.length ? ('ERRORS:\n' + errs.join('\n')) : 'no console/page errors');
