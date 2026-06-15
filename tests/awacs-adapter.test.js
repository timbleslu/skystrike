'use strict';
// AWACS adapter decision (F10, candidate D): awacsResolve is the PURE half of combat.js awacsAction —
// it decides affordability + per-sector cap (via awacsCall) AND which effect/banner to apply. combat.js
// only commits {rp,uses} and imperatively applies the effect. This test covers that decision (previously
// the key->effect/banner wiring lived inline in combat.js and was untested).
const assert = require('assert');
const { awacsResolve, awacsCall, AWACS_COSTS, AWACS_USES_MAX } = require('../js/core.js');

const fresh = () => ({ strike: 0, resupply: 0, jam: 0 });

// 1) each successful call resolves to its own effect + success banner, and matches awacsCall's rp/uses
for (const [key, banner] of [['strike', 'awacs.strike'], ['resupply', 'awacs.resupply'], ['jam', 'awacs.jam']]) {
  const state = { rp: 1000, uses: fresh() };
  const r = awacsResolve(state, AWACS_COSTS, AWACS_USES_MAX, key);
  const base = awacsCall(state, AWACS_COSTS, AWACS_USES_MAX, key);
  assert.strictEqual(r.ok, true, `${key} succeeds with ample RP`);
  assert.strictEqual(r.effect, key, `${key} effect is the call key`);
  assert.strictEqual(r.banner, banner, `${key} success banner`);
  assert.strictEqual(r.rp, base.rp, `${key} rp matches awacsCall`);
  assert.deepStrictEqual(r.uses, base.uses, `${key} uses match awacsCall`);
}

// 2) failure: not enough RP → no effect, the noRp banner, state unchanged
{
  const r = awacsResolve({ rp: 10, uses: fresh() }, AWACS_COSTS, AWACS_USES_MAX, 'strike');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'noRp');
  assert.strictEqual(r.effect, null, 'no effect on failure');
  assert.strictEqual(r.banner, 'awacs.noRp');
  assert.strictEqual(r.rp, 10, 'rp not spent on a rejected call');
}

// 3) failure: per-sector cap reached → empty banner, no effect (jam caps at 2)
{
  const a = awacsResolve({ rp: 1000, uses: fresh() }, AWACS_COSTS, AWACS_USES_MAX, 'jam');
  const b = awacsResolve({ rp: a.rp, uses: a.uses }, AWACS_COSTS, AWACS_USES_MAX, 'jam');
  const c = awacsResolve({ rp: b.rp, uses: b.uses }, AWACS_COSTS, AWACS_USES_MAX, 'jam');
  assert.strictEqual(b.ok, true, 'second jam allowed (cap 2)');
  assert.strictEqual(c.ok, false, 'third jam blocked');
  assert.strictEqual(c.reason, 'empty');
  assert.strictEqual(c.effect, null);
  assert.strictEqual(c.banner, 'awacs.empty');
}

// 4) unknown key → rejected with NO banner (combat.js plays a neutral ui blip, not a warn)
{
  const r = awacsResolve({ rp: 1000, uses: fresh() }, AWACS_COSTS, AWACS_USES_MAX, 'nope');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'unknown');
  assert.strictEqual(r.effect, null);
  assert.strictEqual(r.banner, null, 'unknown key carries no banner');
}

// 5) purity: the input snapshot is never mutated by a successful resolve
{
  const input = { rp: 500, uses: fresh() };
  awacsResolve(input, AWACS_COSTS, AWACS_USES_MAX, 'strike');
  assert.strictEqual(input.rp, 500, 'input rp not mutated');
  assert.strictEqual(input.uses.strike, 0, 'input uses not mutated');
}

console.log('ok - AWACS adapter decision (awacsResolve: effect + banner + cap/affordability)');
