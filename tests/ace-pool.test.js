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

// MIRROR START — hostileAceFor / hostileAceDeltas
// Named hostile ace pool: one named antagonist per sector type.
// Pure + deterministic given sectorType + index (no random, no globals).
// Stat deltas are intentionally small — just enough to feel distinct.
const HOSTILE_ACES = {
  FURBALL:   { callsign: 'TALON',   hpMul: 1.10, turnRate: 1.55, speed: 1.08 },
  INTERCEPT: { callsign: 'BANSHEE', hpMul: 1.12, turnRate: 1.50, speed: 1.10 },
  STRIKE:    { callsign: 'REAPER',  hpMul: 1.15, turnRate: 1.45, speed: 1.05 },
  ESCORT:    { callsign: 'DAGGER',  hpMul: 1.10, turnRate: 1.52, speed: 1.07 },
  DEFEND:    { callsign: 'VIPER',   hpMul: 1.12, turnRate: 1.48, speed: 1.06 },
  ELITE:     { callsign: 'SPECTER', hpMul: 1.18, turnRate: 1.60, speed: 1.12 },
};
function hostileAceFor(sectorType) {
  return HOSTILE_ACES[sectorType] || null;
}
function hostileAceDeltas(entry) {
  // Returns a copy of stat deltas only (no callsign). Safe to apply to any enemy.
  if (!entry) return null;
  return { hpMul: entry.hpMul, turnRate: entry.turnRate, speed: entry.speed };
}
// MIRROR END

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
