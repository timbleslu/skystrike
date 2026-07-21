/* Dev-only headless verification of two browser-only feature surfaces the Node unit tests can't reach:
   (F3) the HUD UNITS toggle — speed/altitude readout conversion + live #lblSpd/#lblAlt labels; and
   (F2) the MISSION INTRO CARD — DOM, content (type name + mechanical desc + lore blurb), and the
   first-encounter (interactive, persistent) vs repeat (5s auto-dismiss) behaviour.
   Usage: node scripts/verify-units-card.mjs */
import { launchGame, bootToHangar } from './lib/boot.mjs';
const { page, port, close } = await launchGame({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await bootToHangar(page, { port, gotoWait: 1400, mode: 'langOnly', langSelector: '[data-lang="EN"]', wait: 200 });

const R = await page.evaluate(() => {
  const out = [];
  const ok = (name, cond) => out.push({ name, pass: !!cond });
  const g = (id) => document.getElementById(id);

  // ===== F3 units: pure conversion + DOM labels =====
  ok('speedDisplay 100kt imperial = 115 mph', speedDisplay(100, 'imperial').value === 115 && speedDisplay(100, 'imperial').unit === 'mph');
  ok('speedDisplay 100kt metric = 185 kph', speedDisplay(100, 'metric').value === 185 && speedDisplay(100, 'metric').unit === 'kph');
  ok('altDisplay 10000ft metric = 3048 m', altDisplay(10000, 'metric').value === 3048 && altDisplay(10000, 'metric').unit === 'm');

  ok('#unitsTog control exists', !!g('unitsTog'));
  ok('#unitsTog has imperial + metric buttons', !!document.querySelector('#unitsTog [data-un="imperial"]') && !!document.querySelector('#unitsTog [data-un="metric"]'));

  unitSystem = 'imperial'; applyUnitLabels();
  ok('imperial -> #lblSpd = mph', g('lblSpd') && g('lblSpd').textContent === 'mph');
  ok('imperial -> #lblAlt = ft', g('lblAlt') && g('lblAlt').textContent === 'ft');
  unitSystem = 'metric'; applyUnitLabels();
  ok('metric -> #lblSpd = kph', g('lblSpd') && g('lblSpd').textContent === 'kph');
  ok('metric -> #lblAlt = m', g('lblAlt') && g('lblAlt').textContent === 'm');
  unitSystem = 'imperial'; applyUnitLabels();

  // F3 REGRESSION: the segmented control must be WIRED (bindSeg('unitsTog')) — clicking a button flips unitSystem.
  // (Previously this control had markup + labels but NO bindSeg call, so clicks did nothing.)
  unitSystem = 'imperial';
  const mBtn = document.querySelector('#unitsTog [data-un="metric"]'); if (mBtn) mBtn.click();
  ok('click Metric -> unitSystem = metric', unitSystem === 'metric');
  ok('click Metric -> metric button gets .on', !!(mBtn && mBtn.classList.contains('on')));
  const iBtn = document.querySelector('#unitsTog [data-un="imperial"]'); if (iBtn) iBtn.click();
  ok('click Imperial -> unitSystem = imperial', unitSystem === 'imperial');
  unitSystem = 'imperial'; applyUnitLabels();   // restore default

  // ===== F2 mission card: DOM, content, first-time vs repeat =====
  ok('#missionCard exists', !!g('missionCard'));
  try { localStorage.removeItem('skystrike_seenMissionType_strike'); } catch (e) {}

  showMissionCard('strike', 'op.ironVeil.l7.blurb');   // FIRST encounter
  const card = g('missionCard');
  ok('card shows on mission start', card && card.classList.contains('show'));
  ok('card title = STRIKE type name', g('missionCardTitle') && g('missionCardTitle').textContent === t('mission.name.strike'));
  ok('card desc = mechanical strike description', g('missionCardDesc') && g('missionCardDesc').textContent === t('mission.desc.strike') && g('missionCardDesc').textContent.length > 6);
  ok('card blurb = per-level lore blurb', g('missionCardBlurb') && g('missionCardBlurb').textContent === t('op.ironVeil.l7.blurb') && g('missionCardBlurb').textContent.length > 6);
  ok('first encounter is interactive (persists until tap)', card.classList.contains('interactive') && missionCardT === 0);
  ok('first encounter shows the TAP hint', g('missionCardHint') && g('missionCardHint').style.display !== 'none' && g('missionCardHint').textContent === t('card.tapContinue'));
  ok('seen flag persisted after first encounter', !!localStorage.getItem('skystrike_seenMissionType_strike'));

  dismissMissionCard();
  ok('dismiss clears the card', !card.classList.contains('show') && !card.classList.contains('interactive'));

  showMissionCard('strike', 'op.ironVeil.l7.blurb');   // REPEAT encounter
  ok('repeat encounter is non-interactive (does not block flying)', !card.classList.contains('interactive'));
  ok('repeat encounter arms the 5s auto-dismiss', missionCardT === 5);
  ok('repeat encounter hides the TAP hint', g('missionCardHint') && g('missionCardHint').style.display === 'none');
  ok('repeat encounter still shows the blurb (context kept)', g('missionCardBlurb') && g('missionCardBlurb').textContent === t('op.ironVeil.l7.blurb'));
  dismissMissionCard();

  // ===== F5 operation-lore panel (tap op -> lore -> Enter proceeds to the level map) =====
  ok('#opLore panel exists', !!g('opLore'));
  openOperationLore('ironVeil');
  const lore = g('opLore');
  ok('op-lore panel shows on operation tap', lore && lore.classList.contains('show'));
  ok('op-lore title = operation name', g('opLoreTitle') && g('opLoreTitle').textContent === t('op.ironVeil.name'));
  ok('op-lore body = operation lore text', g('opLoreBody') && g('opLoreBody').textContent === t('op.ironVeil.lore') && g('opLoreBody').textContent.length > 20);
  ok('op-lore has Enter + Back actions', !!(g('opLoreGo') && g('opLoreBack') && g('opLoreGo').textContent && g('opLoreBack').textContent));
  g('opLoreGo').click();
  ok('Enter proceeds to the level map', g('levelMap') && g('levelMap').classList.contains('show') && !lore.classList.contains('show'));

  return out;
});

await close();
let fail = 0;
for (const r of R) { console.log((r.pass ? 'ok   - ' : 'FAIL - ') + r.name); if (!r.pass) fail++; }
if (errs.length) { console.log('\nconsole/page errors:'); errs.forEach(e => console.log('  ' + e)); }
console.log('\n' + (fail === 0 && errs.length === 0 ? 'UNITS+CARD VERIFY PASS' : 'UNITS+CARD VERIFY FAIL (' + fail + ' assertion(s), ' + errs.length + ' error(s))'));
process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
