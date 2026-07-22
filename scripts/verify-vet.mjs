/* F9 veterancy — headless verification (REQUIRED by SPEC).
   Boots the game headless (shot.mjs pattern), then:
     1. sets meta.veterancy[<flown jet>] to a rank-3 value, re-renders the jet card, and asserts the
        rank insignia chip (.cvet) exists in the DOM with resolved rank-name text; saves vet-check-chip.png.
     2. runs applyMetaPerks on a fresh player and asserts the turn-rate multiplier is +3% vs baseline.
   Exits non-zero on any failure. Not part of the shipped game.
   Usage: node scripts/verify-vet.mjs */
import { launchGame } from './lib/boot.mjs';

const failures = [];
function check(cond, msg) { if (cond) { console.log('  ok  - ' + msg); } else { failures.push(msg); console.error('  FAIL- ' + msg); } }

// Boot as a RETURNING player so we land on a STABLE hangar. First-run onboarding's Continue button calls
// startGame(0) (an auto tutorial sortie) — seeding skystrike_onboarded makes isReturningPlayer true
// (globals.js), so onboarding is skipped and the jet card is the visible screen (no flight behind it).
const { page, port, close } = await launchGame({
  viewport: { width: 1280, height: 900 },
  initScript: () => {
    try {
      localStorage.setItem('skystrike_onboarded', '1');
      localStorage.setItem('skystrike_settings', JSON.stringify({ lang: 'EN' }));
    } catch (e) {}
  },
});
const pageErrors = [];
page.on('pageerror', e => { pageErrors.push(e.message); console.error('PAGE ERROR:', e.message); });
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1400);

// ---- 1. rank-3 insignia chip renders on the jet card with resolved text ----
const chip = await page.evaluate(() => {
  if (typeof LANG !== 'undefined') LANG = 'EN';   // deterministic EN strings for the assertion + shot
  const jetId = JETS[selectedJet].id;
  meta.veterancy[jetId] = VET_THRESHOLDS[2];   // rank 3
  renderJetCard(selectedJet);                  // re-render the card with the chip
  const el = document.querySelector('#jetCard .cvet');
  return {
    jetId,
    state: (typeof state !== 'undefined') ? state : '?',
    rank: vetRank(meta.veterancy[jetId]),
    exists: !!el,
    text: el ? el.textContent.trim() : '',
    wantName: t('vet.rank3'),
    wantLabel: t('vet.label'),
  };
});
check(chip.state === 'hangar', 'app is on a stable hangar screen for the shot (state=' + chip.state + ')');
check(chip.rank === 3, 'VET_THRESHOLDS[2] resolves to rank 3 (jet ' + chip.jetId + ')');
check(chip.exists, 'insignia chip (.cvet) is present in the jet-card DOM at rank 3');
check(chip.text.includes(chip.wantName), 'chip shows the resolved rank-3 name "' + chip.wantName + '" (got "' + chip.text + '")');
check(/❯/.test(chip.text), 'chip shows chevron glyphs alongside the rank name');

await page.waitForTimeout(150);
const card = await page.$('#jetCard');
if (card) await card.screenshot({ path: 'vet-check-chip.png' });
else await page.screenshot({ path: 'vet-check-chip.png' });
console.log('  saved vet-check-chip.png');

// ---- 2. applyMetaPerks: rank-3 veterancy on the flown jet gives +3% turn rate vs baseline ----
const perk = await page.evaluate(() => {
  const jetId = JETS[selectedJet].id;
  meta.veterancy = {};                                  // baseline: no veterancy
  const pBase = { jet: { id: jetId }, stats: { turnRate: 1 }, turnMul: 1 };
  applyMetaPerks(pBase);
  const base = pBase.turnMul;
  meta.veterancy[jetId] = VET_THRESHOLDS[2];            // rank 3
  const pVet = { jet: { id: jetId }, stats: { turnRate: 1 }, turnMul: 1 };
  applyMetaPerks(pVet);
  const buffed = pVet.turnMul;
  return { base, buffed, ratio: buffed / base };
});
check(Math.abs(perk.base - 1) < 1e-9, 'baseline turn multiplier is 1.00 with no veterancy');
check(Math.abs(perk.ratio - 1.03) < 1e-9, 'rank-3 veterancy gives +3% turn rate (ratio ' + perk.ratio.toFixed(4) + ')');

check(pageErrors.length === 0, 'no uncaught page errors during boot + veterancy render');

await close();

if (failures.length) {
  console.error('\nverify-vet: ' + failures.length + ' FAILURE(S)');
  process.exit(1);
}
console.log('\nverify-vet: ALL CHECKS PASSED');
process.exit(0);
