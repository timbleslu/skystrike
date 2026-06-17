'use strict';
const assert = require('assert');
const { AIM_ASSIST, AIM_ASSIST_LEVELS, AIM_MAGNET_K, aimAssistCfg, aimAssistStep } = require('../js/core.js');

const dt = 1 / 60;
const DEG = Math.PI / 180;

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

// ---- magnet curve: MAX force at the lead pip, dropping rapidly with angular distance ----
// Use a wide cone + huge range so the distance falloff is ~constant and we isolate the angle-only
// magnet shape. maxForce = cfg.maxRate; keep it small enough that maxRate*dt is below every probed
// error, so the never-overshoot (angErr) clamp never binds and we read the raw magnet force.
{
  const cfg = { range: 1e7, cone: Math.PI, gain: 1, maxRate: 0.3 };  // maxRate*dt = 0.005 rad
  const dist = 1000;                              // dist << range -> falloff ~ 1 (constant across the sweep)
  const force = (a) => aimAssistStep(a, dist, dt, cfg) / dt / (1 - dist / cfg.range);  // recover the per-second pull force

  // peak force near the lead pip approaches maxForce (the inverse-square denominator -> 1)
  const f0 = force(0.01);                         // 0.01 > maxRate*dt, so the angErr clamp is inactive
  assert.ok(Math.abs(f0 - cfg.maxRate) < 1e-2 * cfg.maxRate, 'pull force at the lead pip is ~the max force');

  // monotonically DECREASING in angErr
  let prev = Infinity;
  for (let d = 1; d <= 90; d++) {
    const f = force(d * DEG);
    assert.ok(f < prev + 1e-12, 'pull force strictly decreases as the reticle drifts off the lead');
    prev = f;
  }

  // ~50% of max at ~15 degrees (target 45-50%); well below half at ~30 degrees
  const r15 = force(15 * DEG) / cfg.maxRate;
  const r30 = force(30 * DEG) / cfg.maxRate;
  const r45 = force(45 * DEG) / cfg.maxRate;
  assert.ok(r15 > 0.42 && r15 < 0.52, `~half force at 15deg (got ${(r15 * 100).toFixed(1)}%)`);
  assert.ok(r30 < 0.25, `well below half force at 30deg (got ${(r30 * 100).toFixed(1)}%)`);
  assert.ok(r45 < r30, 'force keeps dropping past 30deg');
  // matches the documented inverse-square: pullForce = maxForce / (1 + k*angErr^2)
  const expect15 = 1 / (1 + AIM_MAGNET_K * (15 * DEG) ** 2);
  assert.ok(Math.abs(r15 - expect15) < 1e-2, 'force ratio matches the inverse-square magnet formula');
}

// ---- never overshoots the lead even at maximum force (angErr -> 0) ----
{
  // tiny error, close range: at angErr~0 the magnet wants ~maxForce, but the cap is the remaining error
  const small = 1e-3;
  const step = aimAssistStep(small, 1, dt);   // dist≈0 -> falloff≈1, magnet force ≈ maxForce
  assert.ok(step <= small + 1e-12, 'step bounded by the remaining error (no overshoot at max force)');
  // synthetic hot config (huge max force): step must still clamp to angErr
  const hot = { range: 5000, cone: 1.5, gain: 1000, maxRate: 1000 };
  assert.ok(aimAssistStep(0.05, 100, dt, hot) <= 0.05 + 1e-12, 'huge max force still clamps to error');
}

// ---- stronger up close than at range (distance falloff retained) ----
{
  const near = aimAssistStep(0.3, 200, dt);
  const far  = aimAssistStep(0.3, AIM_ASSIST.range - 200, dt);
  assert.ok(near > far, 'assist eases out with distance (stronger up close)');
  assert.ok(far >= 0, 'far step is non-negative');
}

// ---- rate cap binds: near the lead the magnet force ~= maxForce, so the step clamps to maxRate*dt ----
{
  // small maxForce so maxRate*dt is tiny; a small (but > maxRate*dt) error keeps the magnet force near
  // max while leaving the remaining error larger than the cap -> the step must clamp to maxRate*dt.
  const hot = { range: 5000, cone: 1.5, gain: 50, maxRate: 0.3 };  // maxRate*dt = 0.005 rad
  const step = aimAssistStep(0.02, 50, dt, hot);                   // 0.02 > 0.005, magnet force ~ maxForce
  assert.ok(step <= hot.maxRate * dt + 1e-12, 'step never exceeds the per-frame rate cap');
  assert.ok(step > 0.95 * hot.maxRate * dt, 'near the lead the force saturates at the cap');
  // and with the SHIPPED tunables the assist stays gentle: never exceeds the cap anywhere in the cone
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

// ---- aimAssistCfg: 5 levels, monotonic field + max force, clamping, top-tier manual release ----
{
  assert.strictEqual(AIM_ASSIST_LEVELS.length, 5, 'five strength presets');
  for (let i = 1; i < 5; i++) {
    // larger strength -> larger detection field (cone/range) AND larger max force (maxRate)
    assert.ok(AIM_ASSIST_LEVELS[i].cone > AIM_ASSIST_LEVELS[i - 1].cone, 'cone (field radius) widens weakest->strongest');
    assert.ok(AIM_ASSIST_LEVELS[i].range >= AIM_ASSIST_LEVELS[i - 1].range, 'range non-decreasing weakest->strongest');
    assert.ok(AIM_ASSIST_LEVELS[i].maxRate > AIM_ASSIST_LEVELS[i - 1].maxRate, 'max force rises weakest->strongest');
  }
  // a stronger level => a stronger pull at the same (in-field) error: bigger field => stronger snap
  const aErr = 0.2, aDist = 500;
  for (let i = 1; i < 5; i++) {
    const lo = aimAssistStep(aErr, aDist, dt, AIM_ASSIST_LEVELS[i - 1]);
    const hi = aimAssistStep(aErr, aDist, dt, AIM_ASSIST_LEVELS[i]);
    assert.ok(hi >= lo, 'stronger level pulls at least as hard at the same error');
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
