'use strict';
const assert = require('assert');

// rival.js touches `store` inside its fns — stub it so require() is clean under Node.
global.store = { get: () => null, set: () => {} };
const { HOSTILE_ACES, hostileAceFor, hostileAceDeltas } = require('../js/rival.js');
// aceShapePool/jetNameForShape + the roster now import the REAL impl (js/roster.js,
// require-safe) instead of a hand-mirrored stub copy that silently drifts from the game.
const { JETS, aceShapePool, jetNameForShape } = require('../js/roster.js');

const pool = aceShapePool();
assert.ok(!pool.includes('STD'), 'ace pool must exclude the plain STD airframe');
assert.strictEqual(pool.length, JETS.length - 1, 'ace pool is every roster shape except the lone STD trainer');
assert.ok(pool.includes('F22') && pool.includes('SU57') && pool.includes('J20'), 'ace pool contains the named real jets');
assert.strictEqual(jetNameForShape('F22'), 'F-22 RAPTOR', 'shape resolves to roster name');
assert.strictEqual(jetNameForShape('CCAJET'), 'CCAJET', 'unknown shape falls back to its key');

console.log('ok - aceShapePool excludes STD and jetNameForShape maps shapes to names');

// pool non-empty for each combat sector type
const COMBAT_SECTORS = ['FURBALL', 'INTERCEPT', 'STRIKE', 'ESCORT', 'DEFEND', 'ELITE'];
COMBAT_SECTORS.forEach(function (s) {
  const entry = hostileAceFor(s);
  assert.ok(entry !== null, 'pool has an entry for sector ' + s);
  assert.ok(typeof entry.callsign === 'string' && entry.callsign.length > 0, 'entry has a callsign (' + s + ')');
});

// DEPOT and FINAL have no entry (not combat sectors with named aces)
assert.strictEqual(hostileAceFor('DEPOT'), null, 'DEPOT has no hostile ace entry');
assert.strictEqual(hostileAceFor('FINAL'), null, 'FINAL has no hostile ace entry');
assert.strictEqual(hostileAceFor('UNKNOWN'), null, 'unknown sector returns null');

// selection is deterministic — same type always returns same callsign
COMBAT_SECTORS.forEach(function (s) {
  assert.strictEqual(hostileAceFor(s).callsign, hostileAceFor(s).callsign, 'callsign is stable for ' + s);
});

// all callsigns are unique across the pool
const callsigns = COMBAT_SECTORS.map(function (s) { return hostileAceFor(s).callsign; });
const unique = callsigns.filter(function (c, i) { return callsigns.indexOf(c) === i; });
assert.strictEqual(unique.length, callsigns.length, 'all hostile ace callsigns are unique');

// stat deltas are within sane bounds: hpMul 1.0–1.5, turnRate 1.0–2.5, speed 1.0–1.5
COMBAT_SECTORS.forEach(function (s) {
  const d = hostileAceDeltas(hostileAceFor(s));
  assert.ok(d.hpMul >= 1.0 && d.hpMul <= 1.5, 'hpMul in sane range for ' + s);
  assert.ok(d.turnRate >= 1.0 && d.turnRate <= 2.5, 'turnRate in sane range for ' + s);
  assert.ok(d.speed >= 1.0 && d.speed <= 1.5, 'speed in sane range for ' + s);
});

// hostileAceDeltas returns null for null input
assert.strictEqual(hostileAceDeltas(null), null, 'hostileAceDeltas(null) returns null');

// hostileAceDeltas returns only stat fields (no callsign leaking into deltas)
const deltas = hostileAceDeltas(hostileAceFor('FURBALL'));
assert.ok(!('callsign' in deltas), 'deltas object has no callsign field');
assert.ok('hpMul' in deltas && 'turnRate' in deltas && 'speed' in deltas, 'deltas has expected stat fields');

console.log('ok - HOSTILE_ACES pool: non-empty per combat sector, unique callsigns, deterministic, deltas within sane bounds');
