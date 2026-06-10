'use strict';
const assert = require('assert');

// mirror of js/entities.js aceShapePool + jetNameForShape, fed a stub roster
const JETS = [
  { id:'FT-1', shape:'STD',  name:'FT-1 STANDARD' },
  { id:'F-22', shape:'F22',  name:'F-22 RAPTOR' },
  { id:'SU-57', shape:'SU57', name:'SU-57 FELON' },
];
function aceShapePool() { return JETS.filter(j => j.shape !== 'STD').map(j => j.shape); }
function jetNameForShape(shape) { const j = JETS.find(x => x.shape === shape); return j ? j.name : shape; }

const pool = aceShapePool();
assert.ok(!pool.includes('STD'), 'ace pool must exclude the plain STD airframe');
assert.deepStrictEqual(pool, ['F22', 'SU57'], 'ace pool is every real roster shape');
assert.strictEqual(jetNameForShape('F22'), 'F-22 RAPTOR', 'shape resolves to roster name');
assert.strictEqual(jetNameForShape('CCAJET'), 'CCAJET', 'unknown shape falls back to its key');

console.log('ok - aceShapePool excludes STD and jetNameForShape maps shapes to names');
