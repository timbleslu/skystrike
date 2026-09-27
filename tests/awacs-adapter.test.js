'use strict';
// AWACS adapter decision (F10): awacsResolve is the PURE half of combat.js awacsAction — it decides
const assert = require('assert');
const { awacsResolve, awacsCall, AWACS_COOLDOWNS, AWACS_USES_MAX } = require('../js/core.js');

const fresh = () => ({ uses: { strike: 0, resupply: 0, jam: 0 }, last: { strike: 0, resupply: 0, jam: 0 } });

for (const [key, banner] of [['strike', 'awacs.strike'], ['resupply', 'awacs.resupply'], ['jam', 'awacs.jam']]) {
  const state = fresh();
  const now = 500;
  const r = awacsResolve(state, AWACS_COOLDOWNS, AWACS_USES_MAX, key, now);
  const base = awacsCall(state, AWACS_COOLDOWNS, AWACS_USES_MAX, key, now);
  assert.strictEqual(r.ok, true, `${key} succeeds off cooldown`);
  assert.strictEqual(r.effect, key, `${key} effect is the call key`);
  assert.strictEqual(r.banner, banner, `${key} success banner`);
  assert.deepStrictEqual(r.uses, base.uses, `${key} uses match awacsCall`);
  assert.deepStrictEqual(r.last, base.last, `${key} last match awacsCall`);
}

{
  const a = awacsResolve(fresh(), AWACS_COOLDOWNS, AWACS_USES_MAX, 'jam', 100);
  const b = awacsResolve({ uses: a.uses, last: a.last }, AWACS_COOLDOWNS, AWACS_USES_MAX, 'jam', 100 + 1);
  assert.strictEqual(b.ok, false);
  assert.strictEqual(b.reason, 'cooldown');
  assert.strictEqual(b.effect, null, 'no effect on a cooldown rejection');
  assert.strictEqual(b.banner, 'awacs.cooldown');
  assert.strictEqual(b.uses.jam, 1, 'use not consumed while on cooldown');
}

{
  const cd = AWACS_COOLDOWNS.jam;
  const a = awacsResolve(fresh(), AWACS_COOLDOWNS, AWACS_USES_MAX, 'jam', 0);
  const b = awacsResolve({ uses: a.uses, last: a.last }, AWACS_COOLDOWNS, AWACS_USES_MAX, 'jam', cd);
  const c = awacsResolve({ uses: b.uses, last: b.last }, AWACS_COOLDOWNS, AWACS_USES_MAX, 'jam', cd * 3);
  assert.strictEqual(b.ok, true, 'second jam allowed once its cooldown elapses (cap 2)');
  assert.strictEqual(c.ok, false, 'third jam blocked by the cap even after another cooldown');
  assert.strictEqual(c.reason, 'empty');
  assert.strictEqual(c.effect, null);
  assert.strictEqual(c.banner, 'awacs.empty');
}

{
  const r = awacsResolve(fresh(), AWACS_COOLDOWNS, AWACS_USES_MAX, 'nope', 0);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'unknown');
  assert.strictEqual(r.effect, null);
  assert.strictEqual(r.banner, null, 'unknown key carries no banner');
}

{
  const input = fresh();
  awacsResolve(input, AWACS_COOLDOWNS, AWACS_USES_MAX, 'strike', 42);
  assert.strictEqual(input.uses.strike, 0, 'input uses not mutated');
  assert.strictEqual(input.last.strike, 0, 'input last not mutated');
}

console.log('ok - AWACS adapter decision (awacsResolve: effect + banner + cooldown/cap, cooldown-gated)');
