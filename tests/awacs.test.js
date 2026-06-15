'use strict';
// AWACS support calls (F10) are COOLDOWN-GATED, not RP-costed (balance pass 2026-06): they used to draw
// from player.tp — the same pool as the permanent TECH_TREE — so a one-shot call was never rational vs.
// a compounding upgrade and the whole feature was dead. They're now free, gated by a per-call cooldown
// (AWACS_COOLDOWNS) PLUS the unchanged per-sector use cap (AWACS_USES_MAX). awacsCall is the pure
// resolver: given {uses, last} + the current time `now` (seconds), it returns a NEW {uses, last}.
const assert = require('assert');
const { awacsCall, AWACS_COOLDOWNS, AWACS_USES_MAX } = require('../js/core.js');

const fresh = () => ({ uses: { strike: 0, resupply: 0, jam: 0 }, last: { strike: 0, resupply: 0, jam: 0 } });

// 1) a successful call increments only its own use counter and stamps only its own `last` time; no RP concept
{
  const r = awacsCall(fresh(), AWACS_COOLDOWNS, AWACS_USES_MAX, 'strike', 100);
  assert.strictEqual(r.ok, true, 'strike succeeds when off cooldown and under the cap');
  assert.strictEqual(r.reason, 'ok');
  assert.strictEqual(r.uses.strike, 1, 'strike use incremented');
  assert.strictEqual(r.uses.resupply, 0, 'other use counters untouched');
  assert.strictEqual(r.uses.jam, 0, 'other use counters untouched');
  assert.strictEqual(r.last.strike, 100, 'strike last-call time stamped to now');
  assert.strictEqual(r.last.jam, 0, 'other last-call times untouched');
  assert.strictEqual(r.rp, undefined, 'no RP concept remains in the resolver');
}

// 2) per-sector cap: a 1-use call cannot be made a second time even long after its cooldown elapses
{
  const s1 = awacsCall(fresh(), AWACS_COOLDOWNS, AWACS_USES_MAX, 'resupply', 0);
  assert.strictEqual(s1.ok, true);
  assert.strictEqual(s1.uses.resupply, 1);
  // far in the future: cooldown is long gone, but the per-sector cap (1) still blocks it
  const s2 = awacsCall({ uses: s1.uses, last: s1.last }, AWACS_COOLDOWNS, AWACS_USES_MAX, 'resupply', 9999);
  assert.strictEqual(s2.ok, false, 'second resupply blocked by the per-sector cap, not the cooldown');
  assert.strictEqual(s2.reason, 'empty');
  assert.strictEqual(s2.uses.resupply, 1, 'use counter not bumped past the cap');
}

// 3) cooldown gate: a call repeated BEFORE its cooldown elapses is rejected with reason 'cooldown'
{
  const cd = AWACS_COOLDOWNS.jam;   // jam has the shortest cooldown and a 2-use cap
  const a = awacsCall(fresh(), AWACS_COOLDOWNS, AWACS_USES_MAX, 'jam', 1000);
  assert.strictEqual(a.ok, true); assert.strictEqual(a.uses.jam, 1);
  // immediately again (now == last) -> still on cooldown
  const b = awacsCall({ uses: a.uses, last: a.last }, AWACS_COOLDOWNS, AWACS_USES_MAX, 'jam', 1000 + cd - 0.01);
  assert.strictEqual(b.ok, false, 'jam blocked while still inside its cooldown window');
  assert.strictEqual(b.reason, 'cooldown');
  assert.strictEqual(b.uses.jam, 1, 'no use consumed while on cooldown');
}

// 4) cooldown gate: once the cooldown elapses, the SAME call is allowed again (until the cap is hit)
{
  const cd = AWACS_COOLDOWNS.jam;
  const a = awacsCall(fresh(), AWACS_COOLDOWNS, AWACS_USES_MAX, 'jam', 0);
  const b = awacsCall({ uses: a.uses, last: a.last }, AWACS_COOLDOWNS, AWACS_USES_MAX, 'jam', cd);   // exactly cd later
  assert.strictEqual(b.ok, true, 'jam allowed again once a full cooldown has elapsed (cap is 2)');
  assert.strictEqual(b.uses.jam, 2);
  assert.strictEqual(b.last.jam, cd, 'last-call time advanced to the second call');
  // a third jam, even after another full cooldown, is blocked by the 2-use cap
  const c = awacsCall({ uses: b.uses, last: b.last }, AWACS_COOLDOWNS, AWACS_USES_MAX, 'jam', cd * 3);
  assert.strictEqual(c.ok, false, 'third jam blocked by the per-sector cap'); assert.strictEqual(c.reason, 'empty');
}

// 5) cooldown boundary: now - last === cooldown is treated as elapsed (>= boundary succeeds)
{
  const cd = AWACS_COOLDOWNS.strike;
  const a = awacsCall({ uses: { strike: 0, resupply: 0, jam: 0 }, last: { strike: 50, resupply: 0, jam: 0 } },
                       AWACS_COOLDOWNS, AWACS_USES_MAX, 'strike', 50 + cd);
  assert.strictEqual(a.ok, true, 'exactly one cooldown after the last call is allowed');
}

// 6) unknown call key is rejected without side effects
{
  const r = awacsCall(fresh(), AWACS_COOLDOWNS, AWACS_USES_MAX, 'nope', 10);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'unknown');
}

// 7) purity: the input snapshot is never mutated by a successful call
{
  const input = fresh();
  awacsCall(input, AWACS_COOLDOWNS, AWACS_USES_MAX, 'strike', 200);
  assert.strictEqual(input.uses.strike, 0, 'input uses not mutated');
  assert.strictEqual(input.last.strike, 0, 'input last not mutated');
}

console.log('ok - AWACS support calls cooldown/uses resolver (F10, cooldown-gated)');
