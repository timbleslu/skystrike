'use strict';
const assert = require('assert');

// ---- mirror of js/globals.js AWACS pure resolver (feature F10) ----
// MUST be byte-identical with the block between the MIRROR(awacsCall) markers in js/globals.js.
// MIRROR(awacsCall): keep byte-identical with tests/awacs.test.js
// Pure resolver: given a snapshot {rp, uses:{strike,resupply,jam}}, the cost+cap tables, and a call key,
// returns a NEW snapshot. ok=false (state unchanged) when the call is unknown, capped out, or unaffordable.
// reason: 'unknown' | 'empty' (no uses left) | 'noRp' (can't afford) | 'ok'.
function awacsCall(state, costs, max, key) {
  const cost = costs[key], cap = max[key];
  if (cost === undefined || cap === undefined) return { ok: false, reason: 'unknown', rp: state.rp, uses: state.uses };
  const used = state.uses[key] || 0;
  if (used >= cap) return { ok: false, reason: 'empty', rp: state.rp, uses: state.uses };
  if (state.rp < cost) return { ok: false, reason: 'noRp', rp: state.rp, uses: state.uses };
  const uses = { strike: state.uses.strike || 0, resupply: state.uses.resupply || 0, jam: state.uses.jam || 0 };
  uses[key] = used + 1;
  return { ok: true, reason: 'ok', rp: state.rp - cost, uses: uses };
}
// MIRROR_END(awacsCall)

// ---- byte-identity guard: the mirrored block must match the source block, char-for-char ----
// Anchor on the function definition (unique in both files) so stray marker mentions don't confuse extraction.
const fs = require('fs');
const path = require('path');
const ANCHOR = '\nfunction awacsCall(state, costs, max, key) {';   // leading \n: only matches the real definition, not this string literal
const END = '// MIRROR_END(awacsCall)';
function block(text) {
  const i = text.indexOf(ANCHOR);
  const j = text.indexOf(END, i);
  assert.ok(i !== -1 && j !== -1, 'awacsCall block present');
  return text.slice(i + 1, j + END.length);   // +1 drops the anchor's leading newline
}
const srcBlock  = block(fs.readFileSync(path.join(__dirname, '..', 'js', 'globals.js'), 'utf8'));
const testBlock = block(fs.readFileSync(__filename, 'utf8'));
assert.strictEqual(testBlock, srcBlock, 'awacsCall mirror is byte-identical with js/globals.js');

// ---- tables mirror the live values in globals.js (kept in sync with the source) ----
const COSTS = { strike: 140, resupply: 90, jam: 70 };
const MAX   = { strike: 1,   resupply: 1,  jam: 2 };
const fresh = () => ({ strike: 0, resupply: 0, jam: 0 });

// 1) a successful call deducts exactly its RP cost and increments only its own uses counter
{
  const r = awacsCall({ rp: 500, uses: fresh() }, COSTS, MAX, 'strike');
  assert.strictEqual(r.ok, true, 'strike succeeds with ample RP');
  assert.strictEqual(r.reason, 'ok');
  assert.strictEqual(r.rp, 500 - 140, 'RP deducted by the strike cost');
  assert.strictEqual(r.uses.strike, 1, 'strike use incremented');
  assert.strictEqual(r.uses.resupply, 0, 'other counters untouched');
  assert.strictEqual(r.uses.jam, 0, 'other counters untouched');
}

// 2) per-sector cap: a 1-use call cannot be made a second time; state is unchanged on the blocked attempt
{
  const s1 = awacsCall({ rp: 1000, uses: fresh() }, COSTS, MAX, 'resupply');
  assert.strictEqual(s1.ok, true);
  assert.strictEqual(s1.uses.resupply, 1);
  const s2 = awacsCall({ rp: s1.rp, uses: s1.uses }, COSTS, MAX, 'resupply');
  assert.strictEqual(s2.ok, false, 'second resupply blocked by the per-sector cap');
  assert.strictEqual(s2.reason, 'empty');
  assert.strictEqual(s2.rp, s1.rp, 'no RP spent on a capped call');
  assert.strictEqual(s2.uses.resupply, 1, 'use counter not bumped past the cap');
}

// 3) a 2-use call (jam) allows exactly two, then caps
{
  const a = awacsCall({ rp: 1000, uses: fresh() }, COSTS, MAX, 'jam');
  assert.strictEqual(a.ok, true); assert.strictEqual(a.uses.jam, 1);
  const b = awacsCall({ rp: a.rp, uses: a.uses }, COSTS, MAX, 'jam');
  assert.strictEqual(b.ok, true, 'second jam allowed (cap is 2)'); assert.strictEqual(b.uses.jam, 2);
  assert.strictEqual(b.rp, 1000 - 70 - 70, 'two jam calls cost two jam prices');
  const c = awacsCall({ rp: b.rp, uses: b.uses }, COSTS, MAX, 'jam');
  assert.strictEqual(c.ok, false, 'third jam blocked'); assert.strictEqual(c.reason, 'empty');
}

// 4) insufficient RP rejects the call and spends nothing / consumes no use
{
  const r = awacsCall({ rp: 139, uses: fresh() }, COSTS, MAX, 'strike');
  assert.strictEqual(r.ok, false, 'cannot afford strike at 139 RP (cost 140)');
  assert.strictEqual(r.reason, 'noRp');
  assert.strictEqual(r.rp, 139, 'no RP deducted when unaffordable');
  assert.strictEqual(r.uses.strike, 0, 'no use consumed when unaffordable');
}

// 5) exact-cost boundary succeeds (rp === cost), leaving zero RP
{
  const r = awacsCall({ rp: 70, uses: fresh() }, COSTS, MAX, 'jam');
  assert.strictEqual(r.ok, true, 'rp exactly equal to cost is affordable');
  assert.strictEqual(r.rp, 0);
  assert.strictEqual(r.uses.jam, 1);
}

// 6) unknown call key is rejected without side effects
{
  const r = awacsCall({ rp: 1000, uses: fresh() }, COSTS, MAX, 'nope');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'unknown');
  assert.strictEqual(r.rp, 1000);
}

// 7) purity: the input snapshot is never mutated by a successful call
{
  const input = { rp: 300, uses: fresh() };
  awacsCall(input, COSTS, MAX, 'strike');
  assert.strictEqual(input.rp, 300, 'input rp not mutated');
  assert.strictEqual(input.uses.strike, 0, 'input uses not mutated');
}

console.log('ok - AWACS support calls cost/uses resolver (F10)');
