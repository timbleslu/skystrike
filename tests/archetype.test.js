'use strict';
// Fighter archetype cores (AI threat variety, 2026-06). PURE selection + gates imported from the
// real implementation in js/core.js (no mirror copy). The imperative steering (lateral jukes,
// proactive flares, flank offsets) lives in entities.js updateEnemy, gated on e.archetype, and is
// THREE/DOM-coupled — not exercised here; only the pure decision logic is.
const assert = require('assert');
const {
  ARCHETYPES, pickArchetype, shouldJink, pincerSign,
} = require('../js/core.js');

// ===== pickArchetype: always returns a valid archetype across the whole rng range =====
for (const v of [0, 0.0001, 0.25, 0.5, 0.75, 0.999999]) {
  for (const w of [1, 5, 12, 30]) {
    const a = pickArchetype(() => v, w);
    assert.ok(ARCHETYPES.includes(a), 'pickArchetype returns a known archetype for rng=' + v + ' wave=' + w + ' (got ' + a + ')');
  }
}

// ===== wave 1 is pure duelists (clean opener) — exotic share is 0 there =====
for (const v of [0, 0.001, 0.3, 0.5, 0.99]) {
  assert.strictEqual(pickArchetype(() => v, 1), 'duelist', 'wave 1 is all duelist for rng=' + v);
}

// ===== deterministic for a given rng =====
assert.strictEqual(pickArchetype(() => 0.7, 20), pickArchetype(() => 0.7, 20), 'same rng + wave → same archetype');

// ===== duelist-heavy early, exotic share RISES with wave (sample a fixed rng grid) =====
function exoticShare(wave, opts) {
  const grid = 200; let exotic = 0;
  for (let i = 0; i < grid; i++) { const v = (i + 0.5) / grid; if (pickArchetype(() => v, wave, opts) !== 'duelist') exotic++; }
  return exotic / grid;
}
const sEarly = exoticShare(2);
const sMid = exoticShare(8);
const sLate = exoticShare(20);
assert.ok(sEarly < 0.2, 'early waves are duelist-dominant (exotic share ' + sEarly.toFixed(2) + ' < 0.20)');
assert.ok(sMid > sEarly, 'exotic share rises by mid-game (' + sMid.toFixed(2) + ' > ' + sEarly.toFixed(2) + ')');
assert.ok(sLate >= sMid, 'exotic share keeps rising (or holds at cap) into late game (' + sLate.toFixed(2) + ' >= ' + sMid.toFixed(2) + ')');
assert.ok(sLate <= 0.5 + 1e-9, 'exotic share is capped at ~50% so the game never goes all-gimmick (' + sLate.toFixed(2) + ')');

// ===== all three exotic roles are reachable when the exotic slice is wide (late wave) =====
{
  const seen = new Set();
  for (let i = 0; i < 300; i++) { const v = (i + 0.5) / 300; seen.add(pickArchetype(() => v, 30)); }
  assert.ok(seen.has('baiter') && seen.has('decoy') && seen.has('pincer'), 'baiter/decoy/pincer all reachable late: ' + [...seen].join(','));
}

// ===== elites/aces bias exotic but never to zero duelists =====
const sEliteEarly = exoticShare(2, { elite: true });
const sNormEarly = exoticShare(2);
assert.ok(sEliteEarly > sNormEarly, 'elites lean more exotic than normals at the same wave (' + sEliteEarly.toFixed(2) + ' > ' + sNormEarly.toFixed(2) + ')');
assert.ok(exoticShare(30, { elite: true }) < 1, 'elites still produce some duelists (exotic share < 1)');

// ===== shouldJink: jinks ONLY when locked-by-player AND off cooldown =====
assert.strictEqual(shouldJink({ lockedByPlayer: true, jinkCd: 0 }), true, 'locked + cooldown elapsed → jink');
assert.strictEqual(shouldJink({ lockedByPlayer: true, jinkCd: -0.1 }), true, 'locked + cooldown past zero → jink');
assert.strictEqual(shouldJink({ lockedByPlayer: true, jinkCd: 0.5 }), false, 'locked but cooldown still running → no jink');
assert.strictEqual(shouldJink({ lockedByPlayer: false, jinkCd: 0 }), false, 'not locked → no jink even off cooldown');
assert.strictEqual(shouldJink({ lockedByPlayer: true }), true, 'missing jinkCd treated as ready');
assert.strictEqual(shouldJink(null), false, 'null guard');

// ===== pincerSign: partner always takes the OPPOSITE orbit sign =====
assert.strictEqual(pincerSign(1), -1, 'partner of +1 orbits -1');
assert.strictEqual(pincerSign(-1), 1, 'partner of -1 orbits +1');
assert.strictEqual(pincerSign(0), -1, 'zero/unset self-sign defaults so partner orbits -1');
assert.notStrictEqual(pincerSign(1), pincerSign(-1), 'the two partners orbit opposite ways');

console.log('ok - fighter archetype cores (pickArchetype / shouldJink / pincerSign)');
