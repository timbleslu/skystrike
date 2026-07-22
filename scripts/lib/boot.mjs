/* Shared headless-boot glue for the scripts/verify-*.mjs acceptance gates (and shot.mjs).
   Every headless harness needs the same three things: a static file server rooted at the repo,
   a Chromium page, and a walk past the first-run language/onboarding gate into the hangar.
   This module owns that boilerplate so each verify script keeps ONLY its assertions.

   scripts/ are .mjs ES modules — import/export is fine HERE. (The no-ESM rule, ADR-0001, applies to
   the js/ game code only; these dev tools have always been ESM.)

   Usage:
     import { launchGame, bootToHangar } from './lib/boot.mjs';
     const { page, port, root, close } = await launchGame({ viewport: { width: 1280, height: 720 } });
     page.on('pageerror', ...);                 // attach your own listeners BEFORE nav
     await bootToHangar(page, { port, continueWait: 600 });
     ...assertions...
     await close();

   launchGame does NOT navigate, so callers attach error listeners (and any addInitScript state) on the
   returned page before the first goto — preserving each script's exact error-capture timing. */
import { chromium } from 'playwright';
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';

// Superset MIME map: a union of every map the scripts used. Content-type is only a response header
// here — GLTFLoader/fetch/<img> read the bytes regardless — so a superset is behaviour-identical while
// being strictly more correct (e.g. .svg map art renders, draco .wasm gets its required type).
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
};

// repo root = two levels up from scripts/lib/boot.mjs
const ROOT = new URL('../..', import.meta.url).pathname;

/* Static file server rooted at the repo, on an ephemeral port. decodeURIComponent handles any
   percent-encoded asset path (identity for the plain ASCII paths the game requests). */
function makeServer(root) {
  return http.createServer(async (req, res) => {
    const p = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
    try {
      const data = await readFile(join(root, p));
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
}

/* Boot a static server + Chromium page. Returns before navigating so the caller can attach its own
   page listeners first. opts:
     viewport   {width,height}     — default 1280x720
     initScript fn                 — optional page.addInitScript (e.g. seed localStorage for a returning player)
   Returns { browser, page, server, port, root, close }. */
export async function launchGame(opts = {}) {
  const { viewport = { width: 1280, height: 720 }, initScript } = opts;
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  // 180s nav timeout for every goto (incl. scripts that navigate themselves):
  // headless WebGL boot on a loaded machine routinely exceeds Playwright's 30s
  // default, and this suite gates merges — waiting beats a roving-flake failure.
  page.setDefaultNavigationTimeout(180000);
  if (initScript) await page.addInitScript(initScript);
  const close = async () => { await browser.close(); await new Promise(r => server.close(r)); };
  return { browser, page, server, port, root: ROOT, close };
}

/* Walk past the first-run language/onboarding gate. Does NOT navigate — call after page.goto.
   opts.mode selects the technique the scripts used:
     'continue' (default) — pick EN, click #obContinue (the real onboarding walk to the hangar).
                            opts.langWait (250) / opts.continueWait (600); opts.returnToHangar (bool)
                            lands deterministically in the hangar after the onboarding tutorial sortie,
                            opts.returnWait (500).
     'hide'               — set the lang dropdown to EN, then hide the gate overlays without clicking
                            through (skips the tutorial sortie). opts.hideIds / opts.wait (400).
     'langOnly'           — click a single [data-lang] button and wait (for harnesses that drive
                            globals directly and don't need the hangar). opts.langSelector overrides
                            the button selector; opts.wait (200). */
export async function dismissLanguageGate(page, opts = {}) {
  const mode = opts.mode || 'continue';

  if (mode === 'hide') {
    const ids = opts.hideIds || ['langSelect', 'onboard', 'manual', 'touchControls'];
    await page.evaluate((ids) => {
      const dd = document.getElementById('langDropdown');
      if (dd) { dd.value = 'EN'; dd.dispatchEvent(new Event('change', { bubbles: true })); }
      ids.forEach(id => { const e = document.getElementById(id); if (e) { e.classList.remove('show'); e.classList.add('hide'); e.style.display = 'none'; } });
    }, ids);
    await page.waitForTimeout(opts.wait ?? 400);
    return;
  }

  if (mode === 'langOnly') {
    const sel = opts.langSelector || null;
    await page.evaluate((sel) => {
      const en = sel ? document.querySelector(sel)
        : (document.querySelector('[data-lang="en"]') || document.querySelector('.ob-lang[data-lang="EN"]') || document.querySelector('[data-lang="EN"]'));
      if (en) en.click();
    }, sel);
    await page.waitForTimeout(opts.wait ?? 200);
    return;
  }

  // mode === 'continue'
  await page.evaluate(() => {
    const dd = document.getElementById('langDropdown');
    if (dd) { dd.value = 'EN'; dd.dispatchEvent(new Event('change', { bubbles: true })); }
    const en = document.querySelector('.ob-lang[data-lang="EN"]') || document.querySelector('[data-lang="EN"]');
    if (en) en.click();
  });
  await page.waitForTimeout(opts.langWait ?? 250);
  await page.evaluate(() => { const c = document.getElementById('obContinue'); if (c) c.click(); });
  await page.waitForTimeout(opts.continueWait ?? 600);
  if (opts.returnToHangar) {
    await page.evaluate(() => { if (typeof state !== 'undefined' && state !== 'hangar' && typeof returnToHangar === 'function') returnToHangar(); });
    await page.waitForTimeout(opts.returnWait ?? 500);
  }
}

/* Convenience: navigate to the served page, settle, then dismiss the language gate.
   opts.port (required), opts.gotoWait (1200), plus any dismissLanguageGate opts.
   Nav timeout is 180s, not Playwright's 30s default — headless WebGL boot on a
   loaded machine routinely exceeds 30s and the suite gates merges, so waiting
   beats a roving-flake failure. */
export async function bootToHangar(page, opts = {}) {
  await page.goto(`http://127.0.0.1:${opts.port}/`, { timeout: opts.gotoTimeout ?? 180000 });
  await page.waitForTimeout(opts.gotoWait ?? 1200);
  await dismissLanguageGate(page, opts);
}
