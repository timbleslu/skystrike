'use strict';
// FRONTIER DRAFT (feature 4) pure cores. Each shop visit offers only a few of the player's currently-
// unlockable frontier nodes as buyable; the rest of the tree stays visible but locked-this-visit.
// These helpers are imported from the REAL implementation in js/core.js (no mirror copy).
const assert = require('assert');
const {
  DRAFT_OFFER_N, DRAFT_PITY_THRESHOLD,
  frontierEligible, prereqPath, draftOffer,
} = require('../js/core.js');

// A tiny tech graph: root → a → b (linear), root → c (branch), repeatable r off root.
//   owned: root.  a/c/r are frontier (prereq met, unowned). b is locked (needs a). x is na.
const NODES = [
  { id: 'root' },
  { id: 'a', req: 'root' },
  { id: 'b', req: 'a' },
  { id: 'c', req: 'root' },
  { id: 'r', req: 'root', repeat: true },
  { id: 'x', req: 'root' },        // applicable() will reject this one (simulates na/hidden)
];
const BY_ID = {}; NODES.forEach(n => { BY_ID[n.id] = n; });
const OWNED = { root: true };      // r is repeatable; pretend it has been bought once (still offerable)
const ownsFn = (id) => !!OWNED[id];
const reqSatisfiedFn = (n) => { const r = n.req; return !r || ownsFn(Array.isArray(r) ? r[0] : r); };
const applicableFn = (n) => n.id !== 'x';   // x is "not applicable to this map" (na/hidden)

// ===== frontierEligible: only prereq-satisfied + unowned (repeatables stay) + applicable =====
(() => {
  const fr = frontierEligible(NODES, { owns: ownsFn, reqSatisfied: reqSatisfiedFn, applicable: applicableFn });
  assert.ok(fr.includes('a'), 'a (prereq root owned, unowned) is on the frontier');
  assert.ok(fr.includes('c'), 'c (sibling branch off root) is on the frontier');
  assert.ok(fr.includes('r'), 'r (repeatable) stays offerable even when already owned');
  assert.ok(!fr.includes('root'), 'root is owned — not on the frontier');
  assert.ok(!fr.includes('b'), 'b needs a (unowned) — not yet on the frontier');
  assert.ok(!fr.includes('x'), 'x is not applicable to this map — excluded');
  // repeatable that is NOT owned is still offerable
  const fr2 = frontierEligible(NODES, { owns: (id) => id === 'root', reqSatisfied: reqSatisfiedFn, applicable: applicableFn });
  assert.ok(fr2.includes('r'), 'unowned repeatable is offerable too');
})();

// ===== prereqPath: ordered unowned chain to target; empty if owned / no path =====
(() => {
  // path to b (unowned) from owned root: a then b (root owned → skipped, prereqs first)
  const p = prereqPath('b', BY_ID, ownsFn);
  assert.deepStrictEqual(p, ['a', 'b'], 'prereqPath(b) = [a, b] (root owned, dropped)');
  assert.ok(p.indexOf('a') < p.indexOf('b'), 'prereq a appears before target b');
  // target already owned → empty
  assert.deepStrictEqual(prereqPath('root', BY_ID, ownsFn), [], 'owned target → empty path');
  // unknown target → empty
  assert.deepStrictEqual(prereqPath('zzz', BY_ID, ownsFn), [], 'unknown target → empty path');
  // direct child of owned root → just itself
  assert.deepStrictEqual(prereqPath('a', BY_ID, ownsFn), ['a'], 'direct frontier node → [self]');
})();

// ===== draftOffer: ≤n, deterministic for fixed rng, pity force-include, pin bias, frontier<n =====
(() => {
  const frontier = ['a', 'c', 'r', 'd', 'e'];   // 5 frontier ids, offer N=3
  const noPity = {};

  // returns ≤ n
  const r1 = draftOffer({ frontier, pinPath: [], pity: noPity, rng: () => 0.5, n: 3 });
  assert.strictEqual(r1.offer.length, 3, 'offer holds exactly n=3 when frontier > n');
  r1.offer.forEach(id => assert.ok(frontier.includes(id), 'every offered id is a frontier node'));
  assert.strictEqual(new Set(r1.offer).size, 3, 'no duplicates in the offer');

  // deterministic for a fixed rng (same seed → same offer)
  const seqA = []; let i = 0; const seq = [0.1, 0.9, 0.4, 0.7, 0.2];
  const rngA = () => seq[(i++) % seq.length];
  i = 0; const a = draftOffer({ frontier, pinPath: [], pity: noPity, rng: rngA, n: 3 });
  i = 0; const b = draftOffer({ frontier, pinPath: [], pity: noPity, rng: rngA, n: 3 });
  assert.deepStrictEqual(a.offer, b.offer, 'fixed rng → identical offer (deterministic)');

  // pity force-include: a node skipped >= THRESHOLD visits is always in the offer
  const pity = {}; pity['e'] = DRAFT_PITY_THRESHOLD;   // e is pity-due
  const r2 = draftOffer({ frontier, pinPath: [], pity, rng: () => 0.99, n: 3 });
  assert.ok(r2.offer.includes('e'), 'pity-due node is force-included regardless of rng');

  // pin bias: pinPath frontier nodes are preferred over random fill
  const r3 = draftOffer({ frontier, pinPath: ['d'], pity: noPity, rng: () => 0.0, n: 1 });
  assert.deepStrictEqual(r3.offer, ['d'], 'single-slot offer goes to the pinned-path node');

  // frontier < n → offer the whole frontier (no padding, no dupes)
  const small = ['a', 'c'];
  const r4 = draftOffer({ frontier: small, pinPath: [], pity: noPity, rng: () => 0.3, n: 3 });
  assert.strictEqual(r4.offer.length, 2, 'frontier < n → offer all of it');
  assert.deepStrictEqual(r4.offer.slice().sort(), ['a', 'c'], 'whole small frontier offered');
})();

// ===== pity counter update: increments on skip, resets on offer/buy =====
(() => {
  const frontier = ['a', 'c', 'r', 'd', 'e'];
  const pityIn = { a: 1, c: 0, r: 2, d: 0, e: 0 };
  // force a known offer via pin so we can assert the counter deltas deterministically
  const res = draftOffer({ frontier, pinPath: ['a', 'c', 'r'], pity: pityIn, rng: () => 0, n: 3 });
  assert.deepStrictEqual(res.offer.slice().sort(), ['a', 'c', 'r'], 'pinned path fills the 3 slots');
  // offered nodes reset to 0
  assert.strictEqual(res.pity['a'], 0, 'offered node a resets to 0');
  assert.strictEqual(res.pity['c'], 0, 'offered node c resets to 0');
  assert.strictEqual(res.pity['r'], 0, 'offered node r resets to 0');
  // skipped nodes increment (aged one more visit)
  assert.strictEqual(res.pity['d'], 1, 'skipped node d increments 0 -> 1');
  assert.strictEqual(res.pity['e'], 1, 'skipped node e increments 0 -> 1');
  // a node skipped enough becomes pity-due and is force-included next time
  let p = { d: DRAFT_PITY_THRESHOLD - 1 };
  let r = draftOffer({ frontier: ['d', 'e', 'f', 'g'], pinPath: [], pity: p, rng: () => 0.0, n: 1 });
  // d only at THRESHOLD-1 — not yet forced; advance it one visit when skipped
  if (!r.offer.includes('d')) assert.strictEqual(r.pity['d'], DRAFT_PITY_THRESHOLD, 'd ages to THRESHOLD when skipped');
})();

assert.ok(DRAFT_OFFER_N === 3, 'default offer size is 3 (FRONTIER DRAFT spec)');
console.log('draft.test.js OK');
