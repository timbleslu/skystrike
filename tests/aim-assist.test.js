'use strict';
const assert = require('assert');
const { AIM_ASSIST, AIM_ASSIST_LEVELS, AIM_MAGNET_K, aimAssistCfg, aimAssistStep } = require('../js/core.js');

const dt = 1 / 60;
const DEG = Math.PI / 180;

{
  assert.strictEqual(aimAssistStep(0.2, AIM_ASSIST.range + 1, dt), 0, 'no assist beyond range');
  assert.strictEqual(aimAssistStep(AIM_ASSIST.cone + 0.01, 800, dt), 0, 'no assist outside the cone');
  assert.strictEqual(aimAssistStep(0, 800, dt), 0, 'no assist when already on the lead point');
  assert.strictEqual(aimAssistStep(1e-9, 800, dt), 0, 'no assist for sub-epsilon error');
  assert.strictEqual(aimAssistStep(0.2, 0, dt), 0, 'no assist at zero distance');
  assert.strictEqual(aimAssistStep(0.2, 800, 0), 0, 'no assist with zero dt');
  assert.strictEqual(aimAssistStep(-0.2, 800, dt), 0, 'no assist for negative error');
}

{
  const step = aimAssistStep(0.3, 800, dt);
  assert.ok(step > 0, 'assist acts inside cone+range');
  assert.ok(step <= 0.3, 'never rotates past the remaining error');
  assert.ok(step <= AIM_ASSIST.maxRate * dt + 1e-12, 'never exceeds the per-frame rate cap');
}

{
  const cfg = { range: 1e7, cone: Math.PI, gain: 1, maxRate: 0.3 };
  const dist = 1000;
  const force = (a) => aimAssistStep(a, dist, dt, cfg) / dt / (1 - dist / cfg.range);

  const f0 = force(0.01);
  assert.ok(Math.abs(f0 - cfg.maxRate) < 1e-2 * cfg.maxRate, 'pull force at the lead pip is ~the max force');

  let prev = Infinity;
  for (let d = 1; d <= 90; d++) {
    const f = force(d * DEG);
    assert.ok(f < prev + 1e-12, 'pull force strictly decreases as the reticle drifts off the lead');
    prev = f;
  }

  const r15 = force(15 * DEG) / cfg.maxRate;
  const r30 = force(30 * DEG) / cfg.maxRate;
  const r45 = force(45 * DEG) / cfg.maxRate;
  assert.ok(r15 > 0.42 && r15 < 0.52, `~half force at 15deg (got ${(r15 * 100).toFixed(1)}%)`);
  assert.ok(r30 < 0.25, `well below half force at 30deg (got ${(r30 * 100).toFixed(1)}%)`);
  assert.ok(r45 < r30, 'force keeps dropping past 30deg');
  const expect15 = 1 / (1 + AIM_MAGNET_K * (15 * DEG) ** 2);
  assert.ok(Math.abs(r15 - expect15) < 1e-2, 'force ratio matches the inverse-square magnet formula');
}

{
  const small = 1e-3;
  const step = aimAssistStep(small, 1, dt);
  assert.ok(step <= small + 1e-12, 'step bounded by the remaining error (no overshoot at max force)');
  const hot = { range: 5000, cone: 1.5, gain: 1000, maxRate: 1000 };
  assert.ok(aimAssistStep(0.05, 100, dt, hot) <= 0.05 + 1e-12, 'huge max force still clamps to error');
}

{
  const near = aimAssistStep(0.3, 200, dt);
  const far  = aimAssistStep(0.3, AIM_ASSIST.range - 200, dt);
  assert.ok(near > far, 'assist eases out with distance (stronger up close)');
  assert.ok(far >= 0, 'far step is non-negative');
}

{
  const hot = { range: 5000, cone: 1.5, gain: 50, maxRate: 0.3 };
  const step = aimAssistStep(0.02, 50, dt, hot);
  assert.ok(step <= hot.maxRate * dt + 1e-12, 'step never exceeds the per-frame rate cap');
  assert.ok(step > 0.95 * hot.maxRate * dt, 'near the lead the force saturates at the cap');
  assert.ok(aimAssistStep(AIM_ASSIST.cone - 0.01, 50, dt) <= AIM_ASSIST.maxRate * dt + 1e-12, 'shipped assist never exceeds the cap');
}

{
  let err = 0.5;
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

{
  assert.strictEqual(AIM_ASSIST_LEVELS.length, 5, 'five strength presets');
  for (let i = 1; i < 5; i++) {
    assert.ok(AIM_ASSIST_LEVELS[i].cone > AIM_ASSIST_LEVELS[i - 1].cone, 'cone (field radius) widens weakest->strongest');
    assert.ok(AIM_ASSIST_LEVELS[i].range >= AIM_ASSIST_LEVELS[i - 1].range, 'range non-decreasing weakest->strongest');
    assert.ok(AIM_ASSIST_LEVELS[i].maxRate > AIM_ASSIST_LEVELS[i - 1].maxRate, 'max force rises weakest->strongest');
  }
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
