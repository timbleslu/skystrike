'use strict';
const assert = require('assert');
const { AIM_ASSIST, AIM_ASSIST_LEVELS, aimAssistCfg, aimAssistStep } = require('../js/core.js');

const dt = 1 / 60;

// ---- inert outside the engagement envelope ----
{
  // beyond range -> no assist
  assert.strictEqual(aimAssistStep(0.2, AIM_ASSIST.range + 1, dt), 0, 'no assist beyond range');
  // error wider than the cone = deliberate player aim -> leave it alone
  assert.strictEqual(aimAssistStep(AIM_ASSIST.cone + 0.01, 800, dt), 0, 'no assist outside the cone');
  // negligible / non-positive error -> nothing to do
  assert.strictEqual(aimAssistStep(0, 800, dt), 0, 'no assist when already on the lead point');
  assert.strictEqual(aimAssistStep(1e-9, 800, dt), 0, 'no assist for sub-epsilon error');
  // guards on bad inputs
  assert.strictEqual(aimAssistStep(0.2, 0, dt), 0, 'no assist at zero distance');
  assert.strictEqual(aimAssistStep(0.2, 800, 0), 0, 'no assist with zero dt');
  assert.strictEqual(aimAssistStep(-0.2, 800, dt), 0, 'no assist for negative error');
}

// ---- acts inside the envelope, always toward the lead ----
{
  const step = aimAssistStep(0.3, 800, dt);
  assert.ok(step > 0, 'assist acts inside cone+range');
  assert.ok(step <= 0.3, 'never rotates past the remaining error');
  assert.ok(step <= AIM_ASSIST.maxRate * dt + 1e-12, 'never exceeds the per-frame rate cap');
}

// ---- never overshoots the lead even with a huge effective gain ----
{
  // tiny error, close range: proportional pull would be minute, but the cap is the remaining error
  const small = 1e-3;
  const step = aimAssistStep(small, 1, dt);   // dist≈0 -> falloff≈1
  assert.ok(step <= small + 1e-12, 'step bounded by the remaining error (no overshoot)');
  // synthetic high-gain config: step must still clamp to angErr
  const hot = { range: 5000, cone: 1.5, gain: 1000, maxRate: 1000 };
  assert.ok(aimAssistStep(0.05, 100, dt, hot) <= 0.05 + 1e-12, 'high gain still clamps to error');
}

// ---- stronger up close than at range (distance falloff) ----
{
  const near = aimAssistStep(0.3, 200, dt);
  const far  = aimAssistStep(0.3, AIM_ASSIST.range - 200, dt);
  assert.ok(near > far, 'assist eases out with distance (stronger up close)');
  assert.ok(far >= 0, 'far step is non-negative');
}

// ---- rate cap binds when the proportional pull would exceed it ----
{
  // high-gain config so the proportional want far exceeds the cap -> step clamps to maxRate*dt
  const hot = { range: 5000, cone: 1.5, gain: 50, maxRate: 1.0 };
  const step = aimAssistStep(1.0, 50, dt, hot);
  assert.ok(Math.abs(step - hot.maxRate * dt) < 1e-9, 'rate cap binds when the proportional pull exceeds it');
  // and with the SHIPPED tunables the assist stays gentle: well under a hard snap even at the cone edge
  assert.ok(aimAssistStep(AIM_ASSIST.cone - 0.01, 50, dt) <= AIM_ASSIST.maxRate * dt + 1e-12, 'shipped assist never exceeds the cap');
}

// ---- iterating the assist converges monotonically toward the lead (never past it) ----
{
  let err = 0.5;   // within the default cone
  let prev = err;
  for (let i = 0; i < 240; i++) {
    const step = aimAssistStep(err, 600, dt);
    assert.ok(step >= 0 && step <= err + 1e-12, 'each step is bounded by the remaining error');
    err -= step;
    assert.ok(err <= prev + 1e-12, 'error is monotonically non-increasing');
    assert.ok(err >= -1e-12, 'error never crosses past the lead');
    prev = err;
  }
  assert.ok(err < 0.5, 'assist made progress toward the lead point');
}

// ---- aimAssistCfg: 5 levels, monotonic strength, clamping, top-tier manual release ----
{
  assert.strictEqual(AIM_ASSIST_LEVELS.length, 5, 'five strength presets');
  for (let i = 1; i < 5; i++) {
    assert.ok(AIM_ASSIST_LEVELS[i].gain > AIM_ASSIST_LEVELS[i - 1].gain, 'gain rises weakest->strongest');
    assert.ok(AIM_ASSIST_LEVELS[i].maxRate >= AIM_ASSIST_LEVELS[i - 1].maxRate, 'maxRate non-decreasing');
  }
  assert.strictEqual(aimAssistCfg(3, false), AIM_ASSIST_LEVELS[2], 'level 3 -> preset index 2');
  assert.strictEqual(aimAssistCfg(0, false), AIM_ASSIST_LEVELS[0], 'clamps below 1');
  assert.strictEqual(aimAssistCfg(99, false), AIM_ASSIST_LEVELS[4], 'clamps above 5');
  assert.strictEqual(aimAssistCfg(5, false), AIM_ASSIST_LEVELS[4], 'top tier hands-off = strongest');
  assert.strictEqual(aimAssistCfg(5, true), AIM_ASSIST_LEVELS[0], 'top tier yields to manual input');
  assert.strictEqual(aimAssistCfg(3, true), AIM_ASSIST_LEVELS[2], 'lower tiers ignore manual flag');
  assert.strictEqual(AIM_ASSIST, AIM_ASSIST_LEVELS[2], 'AIM_ASSIST stays the level-3 alias');
}

console.log('aim-assist.test.js OK');
