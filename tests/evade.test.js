'use strict';
// F4 — enemy defensive AI. Pure evasion decision core (js/core.js): cooldown-gated break-turn +
// finite flares that spoof player missiles. Imported from the real implementation (no mirror copy).
const assert = require('assert');
const { EVADE, evadeDecision } = require('../js/core.js');

// ---- helpers: threats that clear / miss the trigger thresholds ----
const NOW = 100;                                   // any clock value comfortably past the cooldown from -Infinity
const above = EVADE.lockTrigger + 0.2;             // lock progress that DOES trip the lock trigger
const below = EVADE.lockTrigger - 0.2;             // lock progress that does NOT
const near = EVADE.missileDist - 100;              // missile distance that DOES trip the missile trigger
const far = EVADE.missileDist + 500;               // missile distance that does NOT
const lockThreat = { lockProgress: above, missileDist: Infinity };   // locked, no missile inbound
const mslThreat = { lockProgress: 0, missileDist: near };            // missile inbound, not locked
const noThreat = { lockProgress: below, missileDist: far };          // below BOTH triggers

// ===== EVADE tunables are sane =====
assert.ok(EVADE.breakDur > 0 && EVADE.cooldown > 0, 'positive break duration + cooldown');
assert.ok(EVADE.lockTrigger > 0 && EVADE.lockTrigger <= 1, 'lock trigger is a 0..1 progress');
assert.ok(EVADE.missileDist > 0, 'positive missile trigger distance');
assert.ok(EVADE.flareSpoofChance >= 0 && EVADE.flareSpoofChance <= 1, 'flare spoof chance is a probability');

// ===== trigger thresholds: below BOTH -> 'none'; above either -> an action =====
assert.strictEqual(evadeDecision({ flares: 2 }, noThreat, NOW).action, 'none', 'below both triggers holds');
assert.strictEqual(evadeDecision({ flares: 2 }, lockThreat, NOW).action, 'break', 'a lock (no missile) provokes a break-turn');
assert.strictEqual(evadeDecision({ flares: 2 }, mslThreat, NOW).action, 'flare', 'an inbound missile with flares provokes a flare');
// exactly-at-threshold is inclusive (>= / <=)
assert.strictEqual(evadeDecision({ flares: 0 }, { lockProgress: EVADE.lockTrigger, missileDist: Infinity }, NOW).action, 'break', 'lock exactly at threshold trips');
assert.strictEqual(evadeDecision({ flares: 1 }, { lockProgress: 0, missileDist: EVADE.missileDist }, NOW).action, 'flare', 'missile exactly at threshold trips');

// ===== cooldown gating: a second evade inside the cooldown window -> 'none' =====
const r1 = evadeDecision({ lastEvade: undefined, flares: 2 }, mslThreat, NOW);
assert.strictEqual(r1.action, 'flare', 'first evade fires (starts uncooled)');
assert.strictEqual(r1.state.lastEvade, NOW, 'cooldown clock stamped to now on an action');
const r2 = evadeDecision(r1.state, mslThreat, NOW + EVADE.cooldown * 0.5);   // still cooling
assert.strictEqual(r2.action, 'none', 'second evade inside the cooldown is suppressed');
assert.strictEqual(r2.state.lastEvade, NOW, 'a suppressed evade does NOT reset the cooldown clock');
const r3 = evadeDecision(r2.state, mslThreat, NOW + EVADE.cooldown + 0.01);  // cooled down
assert.strictEqual(r3.action, 'flare', 'once the cooldown lapses the evade fires again');

// ===== flare depletion: returned state decrements; at 0 flares a missile threat prefers 'break' =====
let st = { lastEvade: undefined, flares: 2 };
const f1 = evadeDecision(st, mslThreat, 0);
assert.strictEqual(f1.action, 'flare', 'flare #1 with 2 in the rack');
assert.strictEqual(f1.state.flares, 1, 'flare pool decremented to 1');
const f2 = evadeDecision(f1.state, mslThreat, EVADE.cooldown);           // past cooldown
assert.strictEqual(f2.action, 'flare', 'flare #2 with 1 in the rack');
assert.strictEqual(f2.state.flares, 0, 'flare pool decremented to 0');
const f3 = evadeDecision(f2.state, mslThreat, EVADE.cooldown * 2);       // past cooldown, empty
assert.strictEqual(f3.action, 'break', 'empty rack + missile threat falls back to a break-turn');
assert.strictEqual(f3.state.flares, 0, 'flares never go negative');
// a break-turn never spends a flare
const b = evadeDecision({ flares: 3 }, lockThreat, NOW);
assert.strictEqual(b.action, 'break', 'lock-only picks break');
assert.strictEqual(b.state.flares, 3, 'a break-turn preserves the flare pool');

// ===== boss config (0 flares) can NEVER produce 'flare' across every threat / clock =====
let bossLast;
for (let i = 0; i < 200; i++) {
  const th = { lockProgress: Math.random(), missileDist: Math.random() * 2000 };
  const out = evadeDecision({ lastEvade: bossLast, flares: 0 }, th, i * 1.7);
  assert.notStrictEqual(out.action, 'flare', 'a 0-flare boss never flares (iter ' + i + ')');
  bossLast = out.state.lastEvade;
}

// ===== deterministic: identical inputs -> identical output (no hidden randomness/clock read) =====
const d1 = evadeDecision({ lastEvade: 5, flares: 2 }, mslThreat, 50);
const d2 = evadeDecision({ lastEvade: 5, flares: 2 }, mslThreat, 50);
assert.deepStrictEqual(d1, d2, 'evadeDecision is a pure function of its inputs');

console.log('evade.test.js OK');
