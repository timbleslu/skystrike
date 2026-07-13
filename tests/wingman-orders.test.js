'use strict';
// F3 wingman command-wheel state machine — pure core in js/core.js (no clock, no DOM). Imported from the
// REAL implementation (no mirror copy). Covers: every state × every order-command transition, invalid-cmd
// no-ops, ENGAGE fallback events (targetLost / lockLost → FREE), COVER/REGROUP/FREE ignoring those events,
// and banner keys present on real transitions / null on no-ops.
const assert = require('assert');
const { WINGMAN_ORDERS, wingmanOrder } = require('../js/core.js');

// ===== the order set (FREE first = default / current behaviour) =====
assert.deepStrictEqual(WINGMAN_ORDERS, ['FREE', 'ENGAGE', 'COVER', 'REGROUP'], 'four orders, FREE first');

const ORDER_BANNER = {
  FREE: 'banner.wingmanFree', ENGAGE: 'banner.wingmanEngage',
  COVER: 'banner.wingmanCover', REGROUP: 'banner.wingmanRegroup',
};

// ===== every state × every order command: change → order+banner, re-issue → no-op (null banner) =====
for (const from of WINGMAN_ORDERS) {
  for (const to of WINGMAN_ORDERS) {
    const r = wingmanOrder(from, to);
    assert.strictEqual(r.order, to, from + ' + ' + to + ' ⇒ order ' + to);
    if (from === to) {
      assert.strictEqual(r.banner, null, 're-issuing ' + to + ' (already ' + from + ') is a no-op — null banner');
    } else {
      assert.strictEqual(r.banner, ORDER_BANNER[to], from + '→' + to + ' is a real transition — banner ' + ORDER_BANNER[to]);
    }
  }
}

// ===== unknown / malformed commands are no-ops from every state =====
for (const from of WINGMAN_ORDERS) {
  for (const bad of ['', 'engage', 'ENGAGED', 'xyz', 'free', null, undefined, 42, {}, []]) {
    const r = wingmanOrder(from, bad);
    assert.strictEqual(r.order, from, 'unknown cmd keeps order ' + from);
    assert.strictEqual(r.banner, null, 'unknown cmd returns null banner from ' + from);
  }
}

// ===== an unknown STATE is treated as FREE; a valid order still applies =====
{
  const r = wingmanOrder('BOGUS', 'COVER');
  assert.strictEqual(r.order, 'COVER'); assert.strictEqual(r.banner, ORDER_BANNER.COVER);
  const n = wingmanOrder(undefined, 'nope');
  assert.strictEqual(n.order, 'FREE'); assert.strictEqual(n.banner, null);
  const f = wingmanOrder(null, 'FREE');   // unknown-state + FREE cmd = already-FREE no-op
  assert.strictEqual(f.order, 'FREE'); assert.strictEqual(f.banner, null);
}

// ===== ENGAGE fallback events (ordered target dies / player lock lost) revert to FREE with the break banner =====
for (const ev of ['targetLost', 'lockLost']) {
  const r = wingmanOrder('ENGAGE', ev);
  assert.strictEqual(r.order, 'FREE', 'ENGAGE + ' + ev + ' ⇒ FREE');
  assert.strictEqual(r.banner, 'banner.wingmanBreak', 'ENGAGE + ' + ev + ' shows the break banner');
}

// ===== those same events are no-ops in every NON-ENGAGE state (COVER/REGROUP unaffected by a lost lock) =====
for (const from of ['FREE', 'COVER', 'REGROUP']) {
  for (const ev of ['targetLost', 'lockLost']) {
    const r = wingmanOrder(from, ev);
    assert.strictEqual(r.order, from, from + ' + ' + ev + ' ⇒ unchanged (' + from + ')');
    assert.strictEqual(r.banner, null, from + ' + ' + ev + ' ⇒ null banner');
  }
}

// ===== purity: same input → identical result, but a fresh object each call (no shared mutation) =====
{
  const a = wingmanOrder('FREE', 'ENGAGE');
  const b = wingmanOrder('FREE', 'ENGAGE');
  assert.deepStrictEqual(a, b, 'pure — same input, same output');
  assert.notStrictEqual(a, b, 'returns a fresh object each call');
}

console.log('ok - F3 wingman command-wheel state machine (orders, invalid no-ops, ENGAGE fallbacks)');
