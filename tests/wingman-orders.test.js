'use strict';
// F3 wingman command-wheel state machine — pure core in js/core.js (no clock, no DOM). Imported from the
const assert = require('assert');
const { WINGMAN_ORDERS, wingmanOrder } = require('../js/core.js');

assert.deepStrictEqual(WINGMAN_ORDERS, ['FREE', 'ENGAGE', 'COVER', 'REGROUP'], 'four orders, FREE first');

const ORDER_BANNER = {
  FREE: 'banner.wingmanFree', ENGAGE: 'banner.wingmanEngage',
  COVER: 'banner.wingmanCover', REGROUP: 'banner.wingmanRegroup',
};

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

for (const from of WINGMAN_ORDERS) {
  for (const bad of ['', 'engage', 'ENGAGED', 'xyz', 'free', null, undefined, 42, {}, []]) {
    const r = wingmanOrder(from, bad);
    assert.strictEqual(r.order, from, 'unknown cmd keeps order ' + from);
    assert.strictEqual(r.banner, null, 'unknown cmd returns null banner from ' + from);
  }
}

{
  const r = wingmanOrder('BOGUS', 'COVER');
  assert.strictEqual(r.order, 'COVER'); assert.strictEqual(r.banner, ORDER_BANNER.COVER);
  const n = wingmanOrder(undefined, 'nope');
  assert.strictEqual(n.order, 'FREE'); assert.strictEqual(n.banner, null);
  const f = wingmanOrder(null, 'FREE');
  assert.strictEqual(f.order, 'FREE'); assert.strictEqual(f.banner, null);
}

for (const ev of ['targetLost', 'lockLost']) {
  const r = wingmanOrder('ENGAGE', ev);
  assert.strictEqual(r.order, 'FREE', 'ENGAGE + ' + ev + ' ⇒ FREE');
  assert.strictEqual(r.banner, 'banner.wingmanBreak', 'ENGAGE + ' + ev + ' shows the break banner');
}

for (const from of ['FREE', 'COVER', 'REGROUP']) {
  for (const ev of ['targetLost', 'lockLost']) {
    const r = wingmanOrder(from, ev);
    assert.strictEqual(r.order, from, from + ' + ' + ev + ' ⇒ unchanged (' + from + ')');
    assert.strictEqual(r.banner, null, from + ' + ' + ev + ' ⇒ null banner');
  }
}

{
  const a = wingmanOrder('FREE', 'ENGAGE');
  const b = wingmanOrder('FREE', 'ENGAGE');
  assert.deepStrictEqual(a, b, 'pure — same input, same output');
  assert.notStrictEqual(a, b, 'returns a fresh object each call');
}

console.log('ok - F3 wingman command-wheel state machine (orders, invalid no-ops, ENGAGE fallbacks)');
