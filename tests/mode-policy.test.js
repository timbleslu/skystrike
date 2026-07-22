'use strict';
// Candidate 8 — run-mode policy table. Asserts MODE_POLICY + modeKeyFor reproduce today's behaviour
// matrix at the two converted lifecycle branch points (endRun `endless`, handleWaves tech-shop force-open),
// so the table is a pure restatement — never a behaviour change.
const assert = require('assert');
const { MODE_POLICY, modeKeyFor } = require('../js/core.js');

const F = (o) => Object.assign(
  { campaignMode: false, opMode: false, dailyMode: false, weeklyActive: false, bossRush: false }, o);

// ---- modeKeyFor: classify the flag tuple → one key (runtime-exclusive precedence) ----
assert.strictEqual(modeKeyFor(F({})), 'endless', 'all-false → endless');
assert.strictEqual(modeKeyFor(F({ opMode: true })), 'campaign', 'opMode (Operations selected) → campaign');
assert.strictEqual(modeKeyFor(F({ campaignMode: true })), 'campaign', 'campaignMode (in-flight bounded) → campaign');
assert.strictEqual(modeKeyFor(F({ campaignMode: true, opMode: true })), 'campaign', 'both op flags → campaign');
assert.strictEqual(modeKeyFor(F({ dailyMode: true })), 'daily', 'dailyMode → daily');
assert.strictEqual(modeKeyFor(F({ weeklyActive: true })), 'weekly', 'weeklyActive → weekly');
assert.strictEqual(modeKeyFor(F({ bossRush: true })), 'bossRush', 'bossRush → bossRush');
// precedence (only matters defensively — flags are mutually exclusive at runtime)
assert.strictEqual(modeKeyFor(F({ bossRush: true, opMode: true })), 'bossRush', 'bossRush precedence over campaign');
assert.strictEqual(modeKeyFor(F({ opMode: true, weeklyActive: true, dailyMode: true })), 'campaign', 'campaign precedence over weekly/daily');
assert.strictEqual(modeKeyFor(F({ weeklyActive: true, dailyMode: true })), 'weekly', 'weekly precedence over daily');
assert.strictEqual(modeKeyFor(), 'endless', 'no arg → endless (defensive)');

// ---- MODE_POLICY table: every key present, shape complete ----
for (const k of ['endless', 'campaign', 'daily', 'weekly', 'bossRush']) {
  assert.ok(MODE_POLICY[k], 'policy row exists: ' + k);
  assert.strictEqual(typeof MODE_POLICY[k].bounded, 'boolean', k + '.bounded is boolean');
  assert.strictEqual(typeof MODE_POLICY[k].opensTechShop, 'boolean', k + '.opensTechShop is boolean');
}
// only campaign is bounded / always opens the tech+nav hub
assert.strictEqual(MODE_POLICY.campaign.bounded, true, 'campaign bounded');
assert.strictEqual(MODE_POLICY.campaign.opensTechShop, true, 'campaign opensTechShop');
for (const k of ['endless', 'daily', 'weekly', 'bossRush']) {
  assert.strictEqual(MODE_POLICY[k].bounded, false, k + ' NOT bounded');
  assert.strictEqual(MODE_POLICY[k].opensTechShop, false, k + ' NOT opensTechShop');
}

// ---- behaviour parity: the table reproduces today's two converted derivations ----
// (A) endRun `endless` local was literally: !win && !opMode && !campaignMode
const endlessOld = (win, f) => !win && !f.opMode && !f.campaignMode;
const endlessNew = (win, f) => !win && !MODE_POLICY[modeKeyFor(f)].bounded;
// (B) handleWaves force-open-tech-shop was literally: opMode  (|| shouldOpenTechScreen)
const techOld = (f) => !!f.opMode;
const techNew = (f) => MODE_POLICY[modeKeyFor(f)].opensTechShop;

// every runtime-reachable, mutually-exclusive mode tuple
const modes = [
  F({}),                                  // endless
  F({ dailyMode: true }),                 // daily
  F({ weeklyActive: true }),              // weekly
  F({ bossRush: true }),                  // bossRush
  F({ opMode: true }),                    // Operation victory reaches endRun with campaignMode already false
  F({ campaignMode: true, opMode: true }),// in-flight bounded (won't reach these sites; must still agree)
];
for (const f of modes) {
  for (const win of [false, true]) {
    assert.strictEqual(endlessNew(win, f), endlessOld(win, f),
      'endRun endless parity: ' + modeKeyFor(f) + ' win=' + win);
  }
  // handleWaves reaches the tech-shop line only after the campaignMode early-return, so campaignMode=false there
  const atClear = Object.assign({}, f, { campaignMode: false });
  assert.strictEqual(techNew(atClear), techOld(atClear),
    'handleWaves tech-shop parity: ' + modeKeyFor(atClear));
}

console.log('ok - MODE_POLICY table + modeKeyFor classifier (5 modes, bounded/opensTechShop, branch-parity)');
