'use strict';
// FRONTIER DRAFT (feature 4) pure cores. Each shop visit offers only a few of the player's currently-
const assert = require('assert');
const {
  DRAFT_OFFER_N, DRAFT_PITY_THRESHOLD,
  frontierEligible, prereqPath, draftOffer,
} = require('../js/core.js');

const NODES = [
  { id: 'root' },
  { id: 'a', req: 'root' },
  { id: 'b', req: 'a' },
  { id: 'c', req: 'root' },
  { id: 'r', req: 'root', repeat: true },
  { id: 'x', req: 'root' },
];
const BY_ID = {}; NODES.forEach(n => { BY_ID[n.id] = n; });
const OWNED = { root: true };
const ownsFn = (id) => !!OWNED[id];
const reqSatisfiedFn = (n) => { const r = n.req; return !r || ownsFn(Array.isArray(r) ? r[0] : r); };
const applicableFn = (n) => n.id !== 'x';

(() => {
  const fr = frontierEligible(NODES, { owns: ownsFn, reqSatisfied: reqSatisfiedFn, applicable: applicableFn });
  assert.ok(fr.includes('a'), 'a (prereq root owned, unowned) is on the frontier');
  assert.ok(fr.includes('c'), 'c (sibling branch off root) is on the frontier');
  assert.ok(fr.includes('r'), 'r (repeatable) stays offerable even when already owned');
  assert.ok(!fr.includes('root'), 'root is owned — not on the frontier');
  assert.ok(!fr.includes('b'), 'b needs a (unowned) — not yet on the frontier');
  assert.ok(!fr.includes('x'), 'x is not applicable to this map — excluded');
  const fr2 = frontierEligible(NODES, { owns: (id) => id === 'root', reqSatisfied: reqSatisfiedFn, applicable: applicableFn });
  assert.ok(fr2.includes('r'), 'unowned repeatable is offerable too');
})();

(() => {
  const p = prereqPath('b', BY_ID, ownsFn);
  assert.deepStrictEqual(p, ['a', 'b'], 'prereqPath(b) = [a, b] (root owned, dropped)');
  assert.ok(p.indexOf('a') < p.indexOf('b'), 'prereq a appears before target b');
  assert.deepStrictEqual(prereqPath('root', BY_ID, ownsFn), [], 'owned target → empty path');
  assert.deepStrictEqual(prereqPath('zzz', BY_ID, ownsFn), [], 'unknown target → empty path');
  assert.deepStrictEqual(prereqPath('a', BY_ID, ownsFn), ['a'], 'direct frontier node → [self]');
})();

(() => {
  const frontier = ['a', 'c', 'r', 'd', 'e'];
  const noPity = {};

  const r1 = draftOffer({ frontier, pinPath: [], pity: noPity, rng: () => 0.5, n: 3 });
  assert.strictEqual(r1.offer.length, 3, 'offer holds exactly n=3 when frontier > n');
  r1.offer.forEach(id => assert.ok(frontier.includes(id), 'every offered id is a frontier node'));
  assert.strictEqual(new Set(r1.offer).size, 3, 'no duplicates in the offer');

  const seqA = []; let i = 0; const seq = [0.1, 0.9, 0.4, 0.7, 0.2];
  const rngA = () => seq[(i++) % seq.length];
  i = 0; const a = draftOffer({ frontier, pinPath: [], pity: noPity, rng: rngA, n: 3 });
  i = 0; const b = draftOffer({ frontier, pinPath: [], pity: noPity, rng: rngA, n: 3 });
  assert.deepStrictEqual(a.offer, b.offer, 'fixed rng → identical offer (deterministic)');

  const pity = {}; pity['e'] = DRAFT_PITY_THRESHOLD;
  const r2 = draftOffer({ frontier, pinPath: [], pity, rng: () => 0.99, n: 3 });
  assert.ok(r2.offer.includes('e'), 'pity-due node is force-included regardless of rng');

  const r3 = draftOffer({ frontier, pinPath: ['d'], pity: noPity, rng: () => 0.0, n: 1 });
  assert.deepStrictEqual(r3.offer, ['d'], 'single-slot offer goes to the pinned-path node');

  const small = ['a', 'c'];
  const r4 = draftOffer({ frontier: small, pinPath: [], pity: noPity, rng: () => 0.3, n: 3 });
  assert.strictEqual(r4.offer.length, 2, 'frontier < n → offer all of it');
  assert.deepStrictEqual(r4.offer.slice().sort(), ['a', 'c'], 'whole small frontier offered');
})();

(() => {
  const frontier = ['a', 'c', 'r', 'd', 'e'];
  const pityIn = { a: 1, c: 0, r: 2, d: 0, e: 0 };
  const res = draftOffer({ frontier, pinPath: ['a', 'c', 'r'], pity: pityIn, rng: () => 0, n: 3 });
  assert.deepStrictEqual(res.offer.slice().sort(), ['a', 'c', 'r'], 'pinned path fills the 3 slots');
  assert.strictEqual(res.pity['a'], 0, 'offered node a resets to 0');
  assert.strictEqual(res.pity['c'], 0, 'offered node c resets to 0');
  assert.strictEqual(res.pity['r'], 0, 'offered node r resets to 0');
  assert.strictEqual(res.pity['d'], 1, 'skipped node d increments 0 -> 1');
  assert.strictEqual(res.pity['e'], 1, 'skipped node e increments 0 -> 1');
  let p = { d: DRAFT_PITY_THRESHOLD - 1 };
  let r = draftOffer({ frontier: ['d', 'e', 'f', 'g'], pinPath: [], pity: p, rng: () => 0.0, n: 1 });
  if (!r.offer.includes('d')) assert.strictEqual(r.pity['d'], DRAFT_PITY_THRESHOLD, 'd ages to THRESHOLD when skipped');
})();

assert.ok(DRAFT_OFFER_N === 3, 'default offer size is 3 (FRONTIER DRAFT spec)');
console.log('draft.test.js OK');
