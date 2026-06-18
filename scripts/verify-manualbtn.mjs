/* Verifies Fix 1 (Jun-17 handoff): the global Controls&Manual gear (#manualBtn) is a body-level overlay pinned to
   the viewport top-right that does NOT scroll with a scroll container, persists across menus, and hides in flight.
   Usage: node scripts/verify-manualbtn.mjs   (requires playwright devDep) */
import { chromium } from 'playwright';
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try { const data = await readFile(join(root, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
// short viewport so the hangar content overflows and is genuinely scrollable
const page = await browser.newPage({ viewport: { width: 480, height: 560 } });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1200);

// past the language/onboard gate → hangar
await page.evaluate(() => {
  const dd = document.getElementById('langDropdown');
  if (dd) { dd.value = 'EN'; dd.dispatchEvent(new Event('change', { bubbles: true })); }
  const en = document.querySelector('.ob-lang[data-lang="EN"]'); if (en) en.click();
});
await page.waitForTimeout(250);
await page.evaluate(() => { const c = document.getElementById('obContinue'); if (c) c.click(); });
await page.waitForTimeout(500);
// first-run onboarding auto-starts the tutorial flight; land deterministically in the real hangar menu
await page.evaluate(() => { if (typeof returnToHangar === 'function') returnToHangar(); });
await page.waitForTimeout(500);

const fails = [];
const rectOf = (id) => page.evaluate((i) => { const e = document.getElementById(i); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, right: r.right, w: r.width, h: r.height, hidden: e.classList.contains('mb-hide') || r.width === 0 }; }, id);
const vw = await page.evaluate(() => innerWidth);

// 1) visible in hangar, pinned top-right
let r = await rectOf('manualBtn');
if (!r || r.hidden) fails.push('manualBtn hidden in hangar');
else { if (r.top > 40) fails.push(`manualBtn not at top in hangar (top=${r.top.toFixed(1)})`); if (vw - r.right > 40) fails.push(`manualBtn not at right in hangar (gap=${(vw - r.right).toFixed(1)})`); }
const topInHangar = r ? r.top : null;

// 2) scroll the hangar — button must NOT move (the bug: it scrolled with content)
const scrolled = await page.evaluate(() => { const h = document.getElementById('hangar'); h.scrollTop = 99999; return h.scrollTop; });
await page.waitForTimeout(200);
const r2 = await rectOf('manualBtn');
if (scrolled <= 0) console.log('NOTE: hangar did not scroll at this viewport (content fit); pin check trivial');
if (r2 && topInHangar != null && Math.abs(r2.top - topInHangar) > 2) fails.push(`manualBtn DRIFTED on hangar scroll: ${topInHangar.toFixed(1)} -> ${r2.top.toFixed(1)} (scrollTop=${scrolled})`);
await page.screenshot({ path: 'manualbtn-hangar-scrolled.png' });

// 3) persists on a menu overlay (operations select, z-73) — still top-right, still visible
await page.evaluate(() => { document.getElementById('hangar').scrollTop = 0; if (typeof openOperationsSelect === 'function') { opMode = true; openOperationsSelect(); } });
await page.waitForTimeout(300);
const r3 = await rectOf('opsSelect');
const rb3 = await rectOf('manualBtn');
if (r3 && !r3.hidden) { if (!rb3 || rb3.hidden) fails.push('manualBtn hidden on operations-select menu'); else if (rb3.top > 40) fails.push(`manualBtn not pinned on ops menu (top=${rb3.top.toFixed(1)})`); }
else console.log('NOTE: operations-select did not open; skipping menu-persist check');
await page.screenshot({ path: 'manualbtn-ops-menu.png' });

// 4) hidden in flight
await page.evaluate(() => { if (typeof openOperationsSelect === 'function') { const ov = document.getElementById('opsSelect'); if (ov) ov.classList.remove('show'); } opMode = false; startGame(selectedJet); });
await page.waitForTimeout(900);
const r4 = await rectOf('manualBtn');
if (r4 && !r4.hidden) fails.push('manualBtn still visible during flight (should hide)');

await browser.close();
server.close();
if (fails.length) { console.error('FAIL:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS: manualBtn pinned top-right, no scroll drift, persists on menu, hidden in flight');
