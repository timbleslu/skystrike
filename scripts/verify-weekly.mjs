/* Dev-only headless verification of the F8 WEEKLY CHALLENGE surface the Node unit tests can't reach:
   (1) the hangar WEEKLY card renders this week's 2 modifier NAMES (resolved strings, not raw keys);
   (2) launching via the real entry path (startWeekly) makes BOTH of this week's modifiers take effect
       in live globals — whichever pair the current ISO-week seed picks (read from weeklyModifiers first).
   Saves weekly-check-card.png. Exits non-zero on any failure.
   Usage: node scripts/verify-weekly.mjs */
import { chromium } from 'playwright';
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const server = http.createServer(async (req, res) => {
  try { const p = req.url === '/' ? '/index.html' : req.url.split('?')[0]; const d = await readFile(join(root, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrs = [];
page.on('pageerror', e => pageErrs.push('PAGEERR ' + e.message));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1400);

// drive past the first-run language gate (langSelect → onboard → hangar)
await page.evaluate(() => {
  const dd = document.getElementById('langDropdown');
  if (dd) { dd.value = 'EN'; dd.dispatchEvent(new Event('change', { bubbles: true })); }
  const en = document.querySelector('.ob-lang[data-lang="EN"]') || document.querySelector('[data-lang="EN"]');
  if (en) en.click();
});
await page.waitForTimeout(250);
await page.evaluate(() => { const c = document.getElementById('obContinue'); if (c) c.click(); });
await page.waitForTimeout(700);
// the first-run onboarding auto-starts a tutorial sortie; land back in the hangar so the weekly
// entry point (which requires state === 'hangar') behaves exactly as it does for a real player.
await page.evaluate(() => { if (typeof state !== 'undefined' && state !== 'hangar' && typeof returnToHangar === 'function') returnToHangar(); });
await page.waitForTimeout(400);

// ===== Phase 1: hangar weekly card renders this week's 2 modifier NAMES (resolved) =====
const card = await page.evaluate(() => {
  const out = [];
  const ok = (name, cond) => out.push({ name, pass: !!cond });
  if (typeof refreshWeeklyEntry === 'function') refreshWeeklyEntry();
  const wk = weeklyThisWeek();
  const names = wk.mods.map(id => t('weekly.mod.' + id));
  const btn = document.getElementById('weeklyBtn');
  const note = document.getElementById('weeklyNoteTxt');
  ok('#weeklyBtn exists', !!btn);
  ok('#weeklyBtn shows the CTA (weekly.play)', btn && btn.textContent === t('weekly.play'));
  ok('#weeklyNoteTxt exists + non-empty', note && note.textContent.length > 0);
  ok('note has NO raw i18n keys', note && !note.textContent.includes('weekly.mod.') && !note.textContent.includes('{mods}'));
  ok('note shows modifier NAME 1 (' + names[0] + ')', note && note.textContent.includes(names[0]));
  ok('note shows modifier NAME 2 (' + names[1] + ')', note && note.textContent.includes(names[1]));
  return { out, weekId: wk.id, mods: wk.mods, names };
});
await page.screenshot({ path: 'weekly-check-card.png' });

// ===== Phase 2: launch via the real entry path; both modifiers must take effect in live globals =====
await page.evaluate(() => {
  if (typeof startWeekly === 'function') startWeekly();
  if (typeof player !== 'undefined' && player) { player.hp = 1e9; player.invuln = 999; }   // survive the check window regardless of the modifier difficulty
  // headless rAF is heavily throttled (GPU stalls), so the natural 2.6s wave timer won't fire in a
  // short wait; call nextWave() directly to spawn wave 1 — the SAME per-wave code path (and stormFront
  // weather-lock guard) the game loop runs.
  if (typeof nextWave === 'function') { try { nextWave(); } catch (e) {} }
});
await page.waitForTimeout(500);
const live = await page.evaluate(() => {
  const out = [];
  const ok = (name, cond) => out.push({ name, pass: !!cond });
  const wk = weeklyThisWeek();
  // effect predicate per modifier id — matches whatever the CURRENT week's seed picked
  const EFFECT = {
    stormFront:  () => typeof weather !== 'undefined' && weather.type === 'storm',
    noFlares:    () => player.maxFlares === 0 && player.flares === 0,
    noMissiles:  () => player.maxMissiles === 0 && player.missiles === 0,
    doubleAces:  () => player._weeklyAces === true,
    heavyWing:   () => player.turnMul > 0 && player.turnMul < 1,
  };
  ok('real launch reached flight (state = playing)', state === 'playing');
  ok('weeklyMode flag is set', weeklyMode === true);
  ok('player carries the 2 active modifier ids', Array.isArray(player._weeklyMods) && player._weeklyMods.length === 2);
  for (const id of wk.mods) ok('modifier "' + id + '" took effect in live globals', EFFECT[id] ? EFFECT[id]() : false);
  return { out, mods: wk.mods, weatherType: (typeof weather !== 'undefined' ? weather.type : '?'), maxFlares: player.maxFlares, maxMissiles: player.maxMissiles, turnMul: player.turnMul, aces: player._weeklyAces };
});

await browser.close();
server.close();

// ---- report ----
const all = [...card.out, ...live.out];
console.log('WEEK ' + card.weekId + ' — modifiers: ' + card.mods.join(', ') + '  (' + card.names.join(' · ') + ')');
console.log('live globals: ' + JSON.stringify({ weather: live.weatherType, maxFlares: live.maxFlares, maxMissiles: live.maxMissiles, turnMul: live.turnMul, doubleAces: live.aces }));
let failed = 0;
for (const r of all) { console.log((r.pass ? 'PASS' : 'FAIL') + ' - ' + r.name); if (!r.pass) failed++; }
if (pageErrs.length) console.log('PAGE ERRORS:\n' + pageErrs.join('\n'));
if (failed || pageErrs.length) { console.log('\nweekly verify FAILED (' + failed + ' assertions, ' + pageErrs.length + ' page errors)'); process.exit(1); }
console.log('\nweekly verify OK — card renders this week’s modifiers + both took effect live; saved weekly-check-card.png');
