'use strict';
const assert = require('assert');
const {
  TERRAIN_TIER, SEA_TIER, terrainDetailH,
  FOG_CLEAR_DENSITY, FOG_ACTIVE_DENSITY, fogDensityFor,
  GROUNDOBJ_TIER, GROUNDOBJ_RADIUS, GROUNDOBJ_WATER_MARGIN, GROUNDOBJ_PLATFORM_CLEAR, GROUNDOBJ_BUILD_MAX_SLOPE, planGroundObjects,
} = require('../js/core.js');

/* ---------------- terrain tier config + visual detail (Track B §2) ---------------- */
// LOW must equal the current shipping geometry (SEG 220, NO detail layer) — zero regression.
assert.strictEqual(TERRAIN_TIER.low.seg, 220, 'LOW terrain SEG = 220 (current)');
assert.strictEqual(TERRAIN_TIER.low.detailAmp, 0, 'LOW has no visual detail amplitude');
assert.strictEqual(TERRAIN_TIER.medium.seg, 300, 'MEDIUM terrain SEG = 300');
assert.strictEqual(TERRAIN_TIER.high.seg, 400, 'HIGH terrain SEG = 400');
assert.ok(TERRAIN_TIER.medium.detailAmp <= 28, 'MEDIUM detail amplitude <= 28 units (spec cap)');
assert.ok(TERRAIN_TIER.high.detailAmp <= 60, 'HIGH detail amplitude <= 60 units (spec cap)');
assert.strictEqual(TERRAIN_TIER.medium.detailOct, 2, 'MEDIUM detail is 2-octave');
assert.strictEqual(TERRAIN_TIER.high.detailOct, 3, 'HIGH detail is 3-octave');
// tri/vert math the spec quotes (verts=(seg+1)^2, tris=2*seg^2)
assert.strictEqual(2 * TERRAIN_TIER.low.seg * TERRAIN_TIER.low.seg, 96800, 'LOW = 96,800 tris');
assert.strictEqual(2 * TERRAIN_TIER.medium.seg * TERRAIN_TIER.medium.seg, 180000, 'MEDIUM = 180,000 tris');
assert.strictEqual(2 * TERRAIN_TIER.high.seg * TERRAIN_TIER.high.seg, 320000, 'HIGH = 320,000 tris');

// terrainDetailH: LOW → exactly 0 everywhere; deterministic; bounded by ±detailAmp.
for (const [x, z] of [[0, 0], [1234, -5678], [-26000, 26000], [777, 777]]) {
  assert.strictEqual(terrainDetailH(x, z, TERRAIN_TIER.low), 0, 'LOW detail is 0 at (' + x + ',' + z + ')');
  assert.strictEqual(terrainDetailH(x, z), 0, 'no cfg → 0 (safe default)');
}
for (const tier of ['medium', 'high']) {
  const cfg = TERRAIN_TIER[tier];
  for (let i = 0; i < 4000; i++) {
    const x = (i * 137.5) % 26000 - 13000, z = (i * 311.7) % 26000 - 13000;
    const a = terrainDetailH(x, z, cfg);
    assert.strictEqual(a, terrainDetailH(x, z, cfg), tier + ' detail is deterministic');
    assert.ok(Math.abs(a) <= cfg.detailAmp + 1e-9, tier + ' detail within ±detailAmp (' + a + ' <= ' + cfg.detailAmp + ')');
  }
}

/* ---------------- sea tier config (Track B §3) ---------------- */
assert.strictEqual(SEA_TIER.low.seg, 200, 'LOW sea SEG = 200 (current)');
assert.strictEqual(SEA_TIER.low.waveOct, 3, 'LOW sea 3 wave octaves (current)');
assert.strictEqual(SEA_TIER.low.foam, 0, 'LOW sea no foam');
assert.strictEqual(SEA_TIER.medium.seg, 220, 'MEDIUM sea SEG = 220');
assert.strictEqual(SEA_TIER.medium.waveOct, 4, 'MEDIUM sea 4 wave octaves');
assert.strictEqual(SEA_TIER.high.seg, 256, 'HIGH sea SEG = 256');
assert.strictEqual(SEA_TIER.high.waveOct, 5, 'HIGH sea 5 wave octaves');
assert.strictEqual(SEA_TIER.high.foam, 1, 'HIGH sea has foam');
assert.strictEqual(SEA_TIER.high.reflect, 1, 'HIGH sea has reflectance term');

/* ---------------- fog density per tier (Track B §5) ---------------- */
// FogExp2 visible distance d = 1.978/density. Targets: clear 28/34/38km, storm ~6km, fog ~3km (all tiers).
const vis = (d) => 1.978 / d;
const FOG_BASE = 0.000058;   // mirrors globals.js FOG_BASE (the current/neutral FogExp2 density)
assert.ok(Math.abs(vis(fogDensityFor('low', 'clear')) - 28000) < 1500, 'LOW clear ≈ 28 km');
assert.ok(Math.abs(vis(fogDensityFor('medium', 'clear')) - 34000) < 1500, 'MEDIUM clear ≈ 34 km');
assert.ok(Math.abs(vis(fogDensityFor('high', 'clear')) - 38000) < 1500, 'HIGH clear ≈ 38 km');
// MEDIUM clear baseline IS the current FOG_BASE (medium = current look)
assert.strictEqual(fogDensityFor('medium', 'clear'), FOG_BASE, 'MEDIUM clear baseline = FOG_BASE (current)');
// clear density ordering: richer tier draws farther (lower density)
assert.ok(fogDensityFor('low', 'clear') > fogDensityFor('medium', 'clear'), 'LOW clear denser than MEDIUM');
assert.ok(fogDensityFor('medium', 'clear') > fogDensityFor('high', 'clear'), 'MEDIUM clear denser than HIGH');
// active weather is tier-INDEPENDENT and dramatically tighter
for (const tier of ['low', 'medium', 'high']) {
  assert.ok(Math.abs(vis(fogDensityFor(tier, 'storm')) - 6000) < 700, tier + ' storm ≈ 6 km');
  assert.ok(Math.abs(vis(fogDensityFor(tier, 'fog')) - 3000) < 400, tier + ' fog ≈ 3 km');
  assert.strictEqual(fogDensityFor(tier, 'storm'), FOG_ACTIVE_DENSITY.storm, tier + ' storm density is fixed');
  assert.strictEqual(fogDensityFor(tier, 'fog'), FOG_ACTIVE_DENSITY.fog, tier + ' fog density is fixed');
  // active weather must be far denser than that tier's clear (the headline "fog active" fix)
  assert.ok(fogDensityFor(tier, 'storm') > fogDensityFor(tier, 'clear') * 4, tier + ' storm >> clear');
  assert.ok(fogDensityFor(tier, 'fog') > fogDensityFor(tier, 'storm'), tier + ' fog denser than storm');
}
assert.strictEqual(fogDensityFor('garbage', 'clear'), FOG_BASE, 'unknown tier clear → medium baseline');

/* ---------------- ground-object placement plan (Track B §4) ---------------- */
// A coarse rolling-hills heightfield mirroring engine.js terrainH's shape (sea ≈ 0 in the troughs).
const terr = (x, z) => Math.sin(x * 0.0011) * Math.cos(z * 0.0013) * 430 + Math.sin(x * 0.0031 + 1.7) * Math.cos(z * 0.0025 + 0.5) * 150;

// LOW spawns nothing.
assert.deepStrictEqual(planGroundObjects(1, 'low', terr), [], 'LOW → no ground objects');
assert.deepStrictEqual(GROUNDOBJ_TIER.low, { rocks: 0, trees: 0, buildings: 0, roads: 0 }, 'LOW caps all zero');

// Determinism: same seed+tier+terrain → identical plan.
assert.deepStrictEqual(planGroundObjects(12345, 'high', terr), planGroundObjects(12345, 'high', terr), 'same seed → identical plan');
// Different seed → different plan (overwhelmingly likely; assert at least one coord differs).
const pa = planGroundObjects(1, 'medium', terr), pb = planGroundObjects(2, 'medium', terr);
assert.ok(pa.length && pb.length, 'medium produces objects');
assert.ok(JSON.stringify(pa) !== JSON.stringify(pb), 'different seed → different plan');

for (const tier of ['medium', 'high']) {
  const caps = GROUNDOBJ_TIER[tier];
  const plan = planGroundObjects(999, tier, terr);
  const byType = { rock: 0, tree: 0, building: 0, road: 0 };
  for (const o of plan) {
    byType[o.type]++;
    // every object: within radius, above water margin, off the platform, valid record shape.
    const r = Math.hypot(o.x, o.z);
    assert.ok(r <= GROUNDOBJ_RADIUS + 1e-6, tier + ' object within placement radius');
    assert.ok(r >= GROUNDOBJ_PLATFORM_CLEAR, tier + ' object clears the platform exclusion');
    const minH = o.type === 'rock' ? 0 : GROUNDOBJ_WATER_MARGIN;
    assert.ok(terr(o.x, o.z) >= minH, tier + ' ' + o.type + ' is not in water (h>=' + minH + ')');
    assert.ok(typeof o.rot === 'number' && o.scale > 0, tier + ' object has rot + positive scale');
  }
  // counts never EXCEED the caps (caps are ceilings)
  assert.ok(byType.rock <= caps.rocks, tier + ' rocks <= cap (' + byType.rock + '/' + caps.rocks + ')');
  assert.ok(byType.tree <= caps.trees, tier + ' trees <= cap (' + byType.tree + '/' + caps.trees + ')');
  assert.ok(byType.building <= caps.buildings, tier + ' buildings <= cap');
  assert.ok(byType.road <= caps.roads, tier + ' roads <= cap');
  // and with this benign heightfield the planner should essentially hit the caps (placement succeeds)
  assert.ok(byType.rock >= caps.rocks * 0.9, tier + ' rocks roughly hit cap');
  if (caps.trees) assert.ok(byType.tree >= caps.trees * 0.85, tier + ' trees roughly hit cap');
}

// MEDIUM never spawns buildings or roads (those are High-only).
const medPlan = planGroundObjects(7, 'medium', terr);
assert.ok(!medPlan.some(o => o.type === 'building' || o.type === 'road'), 'MEDIUM has no buildings/roads');

// Building slope rejection: every placed building sits on a face <= the slope cap.
const E = 14;
for (const o of planGroundObjects(55, 'high', terr).filter(o => o.type === 'building')) {
  const dhx = (terr(o.x + E, o.z) - terr(o.x - E, o.z)) / (2 * E);
  const dhz = (terr(o.x, o.z + E) - terr(o.x, o.z - E)) / (2 * E);
  assert.ok(Math.hypot(dhx, dhz) <= GROUNDOBJ_BUILD_MAX_SLOPE + 1e-9, 'building not on a cliff (slope <= cap)');
}

// A nearly-all-water heightfield (everything below the margin except a tiny island) must reject almost
// everything → the result respects the cap and never invents land objects in the sea.
const sea = (x, z) => (Math.hypot(x, z) < 500 ? 50 : -100);
const wet = planGroundObjects(3, 'high', sea);
assert.ok(wet.every(o => sea(o.x, o.z) >= (o.type === 'rock' ? 0 : GROUNDOBJ_WATER_MARGIN)), 'all-water field: no object below margin');
assert.ok(wet.length <= GROUNDOBJ_TIER.high.rocks + GROUNDOBJ_TIER.high.trees + GROUNDOBJ_TIER.high.buildings + GROUNDOBJ_TIER.high.roads, 'caps still hold on hostile field');

console.log('ok - terrain/sea/fog/ground-object tier cores (Track B)');
