'use strict';
const assert = require('assert');
const { awacsCall, AWACS_COSTS, AWACS_USES_MAX } = require('../js/core.js');

const fresh = () => ({ strike: 0, resupply: 0, jam: 0 });

// 1) a successful call deducts exactly its RP cost and increments only its own uses counter
{
  const r = awacsCall({ rp: 500, uses: fresh() }, AWACS_COSTS, AWACS_USES_MAX, 'strike');
  assert.strictEqual(r.ok, true, 'strike succeeds with ample RP');
  assert.strictEqual(r.reason, 'ok');
  assert.strictEqual(r.rp, 500 - 140, 'RP deducted by the strike cost');
  assert.strictEqual(r.uses.strike, 1, 'strike use incremented');
  assert.strictEqual(r.uses.resupply, 0, 'other counters untouched');
  assert.strictEqual(r.uses.jam, 0, 'other counters untouched');
}

// 2) per-sector cap: a 1-use call cannot be made a second time; state is unchanged on the blocked attempt
{
  const s1 = awacsCall({ rp: 1000, uses: fresh() }, AWACS_COSTS, AWACS_USES_MAX, 'resupply');
  assert.strictEqual(s1.ok, true);
  assert.strictEqual(s1.uses.resupply, 1);
  const s2 = awacsCall({ rp: s1.rp, uses: s1.uses }, AWACS_COSTS, AWACS_USES_MAX, 'resupply');
  assert.strictEqual(s2.ok, false, 'second resupply blocked by the per-sector cap');
  assert.strictEqual(s2.reason, 'empty');
  assert.strictEqual(s2.rp, s1.rp, 'no RP spent on a capped call');
  assert.strictEqual(s2.uses.resupply, 1, 'use counter not bumped past the cap');
}

// 3) a 2-use call (jam) allows exactly two, then caps
{
  const a = awacsCall({ rp: 1000, uses: fresh() }, AWACS_COSTS, AWACS_USES_MAX, 'jam');
  assert.strictEqual(a.ok, true); assert.strictEqual(a.uses.jam, 1);
  const b = awacsCall({ rp: a.rp, uses: a.uses }, AWACS_COSTS, AWACS_USES_MAX, 'jam');
  assert.strictEqual(b.ok, true, 'second jam allowed (cap is 2)'); assert.strictEqual(b.uses.jam, 2);
  assert.strictEqual(b.rp, 1000 - 70 - 70, 'two jam calls cost two jam prices');
  const c = awacsCall({ rp: b.rp, uses: b.uses }, AWACS_COSTS, AWACS_USES_MAX, 'jam');
  assert.strictEqual(c.ok, false, 'third jam blocked'); assert.strictEqual(c.reason, 'empty');
}

// 4) insufficient RP rejects the call and spends nothing / consumes no use
{
  const r = awacsCall({ rp: 139, uses: fresh() }, AWACS_COSTS, AWACS_USES_MAX, 'strike');
  assert.strictEqual(r.ok, false, 'cannot afford strike at 139 RP (cost 140)');
  assert.strictEqual(r.reason, 'noRp');
  assert.strictEqual(r.rp, 139, 'no RP deducted when unaffordable');
  assert.strictEqual(r.uses.strike, 0, 'no use consumed when unaffordable');
}

// 5) exact-cost boundary succeeds (rp === cost), leaving zero RP
{
  const r = awacsCall({ rp: 70, uses: fresh() }, AWACS_COSTS, AWACS_USES_MAX, 'jam');
  assert.strictEqual(r.ok, true, 'rp exactly equal to cost is affordable');
  assert.strictEqual(r.rp, 0);
  assert.strictEqual(r.uses.jam, 1);
}

// 6) unknown call key is rejected without side effects
{
  const r = awacsCall({ rp: 1000, uses: fresh() }, AWACS_COSTS, AWACS_USES_MAX, 'nope');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'unknown');
  assert.strictEqual(r.rp, 1000);
}

// 7) purity: the input snapshot is never mutated by a successful call
{
  const input = { rp: 300, uses: fresh() };
  awacsCall(input, AWACS_COSTS, AWACS_USES_MAX, 'strike');
  assert.strictEqual(input.rp, 300, 'input rp not mutated');
  assert.strictEqual(input.uses.strike, 0, 'input uses not mutated');
}

console.log('ok - AWACS support calls cost/uses resolver (F10)');
