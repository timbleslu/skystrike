/* Dev-only headless verification of OPERATION POLAR VORTEX (campaign op4). Boots the game (shot.mjs
   boot pattern), sets the dev unlock bypass, drives operations-select → the op4 briefing (asserting
   the briefing DOM shows RESOLVED strings — NO raw op.* i18n key leaks anywhere on screen), then
   launches 3 distinct levels (l1/l4/l8) far enough to render the arctic arena. Saves op4-check-*.png.
   Exits non-zero on any failed assertion or page error. Usage: node scripts/verify-op4.mjs [outPrefix] */
import { launchGame, bootToHangar } from './lib/boot.mjs';

const prefix = process.argv[2] || 'op4-check';

const { page, port, close } = await launchGame({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
// drive past the first-run language gate (langSelect → onboard → hangar) — mirror shot.mjs
await bootToHangar(page, { port, gotoWait: 1300 });

const results = [];
const ok = (name, cond) => results.push({ name, pass: !!cond });

// ---- op4 exists + navigate operations-select → op4 briefing (level 1), assert RESOLVED strings ----
const brief = await page.evaluate(() => {
  const out = { asserts: [] };
  const A = (name, cond) => out.asserts.push({ name, pass: !!cond });
  devUnlockLevels = true;                                              // v1.3 dev: every op/level open
  if (typeof devUnlockAll !== 'undefined') devUnlockAll = true;        // bypass any skin/jet launch gate
  const op = OPERATIONS.find(o => o.id === 'polarVortex');
  A('op4 polarVortex present in OPERATIONS', !!op);
  A('op4 has 8 levels', !!op && op.levels.length === 8);

  openOperationsSelect();
  A('operations-select shown', document.getElementById('opsSelect').classList.contains('show'));
  A('op4 card rendered in ops list', /POLAR VORTEX/i.test(document.getElementById('opsList').textContent || ''));

  openBriefing('polarVortex', 0);
  A('briefing overlay shown', document.getElementById('briefing').classList.contains('show'));

  // gather EVERY op4 i18n key string, then assert none leaks raw into the briefing (t() returns the
  // key verbatim on a miss, so an unresolved key would show up literally on screen).
  const keys = new Set();
  [op.nameKey, op.theaterKey, op.loreKey].forEach(k => k && keys.add(k));
  op.levels.forEach(l => {
    [l.nameKey, l.loreKey, l.objectivesKey, l.enemyIntelKey].forEach(k => k && keys.add(k));
    const bk = (typeof levelBlurbKey === 'function') ? levelBlurbKey(l) : null; if (bk) keys.add(bk);
    if (l.boss) { [l.boss.callsignKey, l.boss.introKey].forEach(k => k && keys.add(k)); (l.boss.phases || []).forEach(ph => ph.descKey && keys.add(ph.descKey)); }
  });
  const fields = ['briefTitle', 'briefLore', 'briefObjectives', 'briefIntel'].map(id => ((document.getElementById(id) || {}).textContent) || '');
  fields.forEach((tx, i) => A('briefing field #' + i + ' has resolved text', !!tx && tx.trim().length > 4));
  const screenText = document.getElementById('briefing').innerText || '';
  let leak = null;
  keys.forEach(k => { if (screenText.indexOf(k) !== -1) leak = k; });
  A('no raw op4 i18n key leaks anywhere in the briefing', leak === null);
  return { asserts: out.asserts, leak, title: fields[0].slice(0, 90), lore: fields[1].slice(0, 70) };
});
brief.asserts.forEach(a => results.push(a));
await page.waitForTimeout(200);
await page.screenshot({ path: `${prefix}-briefing.png` });

// ---- launch 3 distinct levels far enough to render the arctic terrain ----
const LEVELS = [[0, 'l1'], [3, 'l4'], [7, 'l8']];
for (const [idx, tag] of LEVELS) {
  const r = await page.evaluate((i) => {
    devUnlockLevels = true;
    if (typeof devUnlockAll !== 'undefined') devUnlockAll = true;
    launchLevel('polarVortex', i);
    const lvl = (typeof currentCampaignLevel === 'function') ? currentCampaignLevel() : null;
    return {
      state: (typeof state !== 'undefined') ? state : null,
      playerOk: !!(typeof player !== 'undefined' && player && player.group),
      campaignMode: (typeof campaignMode !== 'undefined') && campaignMode === true,
      weather: lvl && lvl.spawn ? lvl.spawn.weather : null,
      tod: lvl && lvl.spawn ? lvl.spawn.tod : null,
    };
  }, idx);
  ok('level ' + tag + ' launches to state=playing', r.state === 'playing');
  ok('level ' + tag + ' has a live player + campaignMode', r.playerOk && r.campaignMode);
  await page.waitForTimeout(1900);   // let the render loop build + draw the arena (weather/TOD applied)
  await page.screenshot({ path: `${prefix}-${tag}.png` });
  results.push({ name: 'level ' + tag + ' arena (weather=' + r.weather + ' tod=' + r.tod + ') captured', pass: true });
}

await close();

let fail = 0;
for (const r of results) { console.log((r.pass ? 'ok   - ' : 'FAIL - ') + r.name); if (!r.pass) fail++; }
console.log('\nbriefing title : ' + brief.title);
console.log('briefing lore  : ' + brief.lore + ' …');
if (brief.leak) console.log('LEAKED KEY     : ' + brief.leak);
if (errs.length) { console.log('\nPAGE ERRORS:'); errs.forEach(e => console.log('  ' + e)); }
const pass = fail === 0 && errs.length === 0;
console.log('\n' + (pass ? 'OP4 VERIFY PASS' : 'OP4 VERIFY FAIL (' + fail + ' assertion(s)' + (errs.length ? ' + ' + errs.length + ' page error(s)' : '') + ')'));
process.exit(pass ? 0 : 1);
