/* SKYSTRIKE — meta.js: persistent meta-progression (SP, jet unlocks, skins, perks, achievements, stars,
   campaign saves). SP is persistent and separate from in-run RP (player.tp); meta perks apply at run
   start, BEFORE the in-run tech tree. Pure scorers expect callers to stamp run.waveReached / timeSecs /
   rivalLevel first. */

const META_KEY = 'skystrike_meta';
const META_VERSION = 1;
let meta = null;

const STARTER_JETS = ['FT-1'];

function runKills(run) { return (run.kills || 0) + (run.ground || 0) + (run.boss || 0); }

function spAward(run, player) {
  if (!run) return 0;
  const score = (player && player.score) || 0;
  const sp =
    (run.kills || 0) * 2 +
    (run.ground || 0) * 1 +
    (run.boss || 0) * 25 +
    (run.escortKills || 0) * 1 +
    (run.waveReached || 0) * 3 +
    (run.rivalLevel || 0) * 10 +
    Math.floor(score / 500);
  return Math.max(0, Math.floor(sp));
}

// { letter S/A/B/C, mult = SP bonus multiplier, score }.
function gradeRun(run, player) {
  if (!run) return { letter: 'C', mult: 1.0, score: 0 };
  var waves = Math.max(1, run.waveReached || 1);
  var killScore = Math.min(1, runKills(run) / (waves * 4));
  var secs = Math.max(1, run.timeSecs || 1);
  var timeScore = Math.min(1, (waves * 30) / secs);
  var maxDmg = 300 + waves * 60;
  var dmgScore = Math.max(0, 1 - (run.damageTaken || 0) / maxDmg);
  var missionScore = Math.min(1, (run.missions || 0) / Math.max(1, Math.floor(waves / 2)));
  // Survival credit (fast + undamaged) scales with what the run achieved, so a do-nothing run can't grade B.
  var engaged = Math.max(killScore, missionScore);
  var total = killScore * 0.40 + (timeScore * 0.20 + dmgScore * 0.25) * engaged + missionScore * 0.15;
  var letter, mult;
  if (total >= 0.85)      { letter = 'S'; mult = 1.5; }
  else if (total >= 0.65) { letter = 'A'; mult = 1.3; }
  else if (total >= 0.40) { letter = 'B'; mult = 1.15; }
  else                    { letter = 'C'; mult = 1.0; }
  return { letter: letter, mult: mult, score: total };
}

// Endless: 0..3 stars (kill efficiency vs 4/wave, a no-damage wave, an objective).
const STAR_KILL_FRAC = 0.6;
function evalStars(run, player) {
  if (!run) return 0;
  var stars = 0;
  var waves = Math.max(1, run.waveReached || 1);
  if (runKills(run) / (waves * 4) >= STAR_KILL_FRAC) stars++;
  if ((run.cleanWaves || 0) >= 1) stars++;
  if ((run.missions || 0) >= 1) stars++;
  return stars;
}
/* Campaign star conditions { type, n? }, each over one real `run` stat. Unlike evalStars, 'kills'
   measures against run.expectedKills when stamped (starExpectedKills). */
const STAR_DEFAULT_CONDS = [{ type: 'kills' }, { type: 'clean' }, { type: 'objective' }];
function starCondMet(cond, run) {
  if (!cond || !run) return false;
  var kills = runKills(run);
  switch (cond.type) {
    case 'kills':     return kills / starExpectedKills(run) >= STAR_KILL_FRAC;
    case 'clean':     return (run.cleanWaves || 0) >= 1;
    case 'objective': return (run.missions || 0) >= 1;
    case 'noDamage':  return (run.damageTaken || 0) === 0;
    case 'accuracy':  return (run.shots || 0) > 0 && (run.hits || 0) / run.shots * 100 >= (cond.n || 0);
    case 'flawless':  return (run.missions || 0) >= 1 && (run.damageTaken || 0) === 0;
    case 'gunOnly':   return kills > 0 && (run.pMissiles || 0) === 0;
    case 'noFlares':  return (kills > 0 || (run.missions || 0) >= 1) && (run.pFlares || 0) === 0;
    case 'fastClear': return (run.timeSecs || 0) > 0 && run.timeSecs <= (cond.n || 0);
    case 'killsN':    return kills >= (cond.n || 0);
    case 'alliesIntact': return (run.missions || 0) >= 1 && (run.allyLosses || 0) === 0;
    default:          return false;
  }
}
// What the level actually spawned (run.expectedKills); 4/wave for Endless/legacy.
function starExpectedKills(run) {
  if (run && run.expectedKills > 0) return run.expectedKills;
  return Math.max(1, (run && run.waveReached) || 1) * 4;
}
/* Mid-flight readout of a star condition over the per-level delta `lr`; ctx = { elapsed } seconds.
   state: 'met' (locked in) | 'track' (met if nothing changes) | 'fail' (lost) | 'pending' (undecided).
   cur/need are what the HUD prints ("4/6", "58%", "1:12"). */
function starCondLive(cond, lr, ctx) {
  lr = lr || {}; ctx = ctx || {};
  var kills = runKills(lr);
  switch (cond && cond.type) {
    case 'noDamage':
    case 'flawless': return { state: (lr.damageTaken || 0) > 0 ? 'fail' : 'track' };
    case 'gunOnly':  return { state: (lr.pMissiles || 0) > 0 ? 'fail' : (kills > 0 ? 'track' : 'pending') };
    case 'noFlares': return { state: (lr.pFlares || 0) > 0 ? 'fail' : 'track' };
    case 'alliesIntact': return { state: (lr.allyLosses || 0) > 0 ? 'fail' : 'track' };
    case 'killsN':   return { state: kills >= (cond.n || 0) ? 'met' : 'pending', cur: kills, need: cond.n || 0 };
    case 'kills': {
      var need = Math.ceil(starExpectedKills(lr) * STAR_KILL_FRAC);
      return { state: kills >= need ? 'met' : 'pending', cur: kills, need: need };
    }
    case 'accuracy': {
      var acc = (lr.shots || 0) > 0 ? Math.round((lr.hits || 0) / lr.shots * 100) : 0;
      return { state: (lr.shots || 0) > 0 ? (acc >= (cond.n || 0) ? 'track' : 'pending') : 'pending', cur: acc, need: cond.n || 0 };
    }
    case 'fastClear': {
      var left = (cond.n || 0) - (ctx.elapsed || 0);
      return { state: left >= 0 ? 'track' : 'fail', cur: Math.max(0, Math.ceil(left)), need: cond.n || 0 };
    }
    case 'clean':     return { state: (lr.cleanWaves || 0) >= 1 ? 'met' : 'pending' };
    case 'objective': return { state: (lr.missions || 0) >= 1 ? 'met' : 'pending' };
    default:          return { state: 'pending' };
  }
}
// Level stars = the type's two defaults + the level's `starUnique`; an explicit `lvl.stars` wins.
var STAR_TYPE_CONDS = {
  FURBALL:   [{ type: 'kills' },     { type: 'noDamage' }],
  SWEEP:     [{ type: 'kills' },     { type: 'clean' }],
  INTERCEPT: [{ type: 'kills' },     { type: 'accuracy', n: 55 }],
  STRIKE:    [{ type: 'objective' }, { type: 'accuracy', n: 50 }],
  RECON:     [{ type: 'objective' }, { type: 'clean' }],
  STEALTH:   [{ type: 'objective' }, { type: 'noDamage' }],
  ESCORT:    [{ type: 'objective' }, { type: 'alliesIntact' }],
  DEFEND:    [{ type: 'objective' }, { type: 'alliesIntact' }],
  FINAL:     [{ type: 'noDamage' },  { type: 'objective' }],
};
function starsForType(type) {
  var c = STAR_TYPE_CONDS[type];
  return c ? [c[0], c[1]] : [{ type: 'kills' }, { type: 'clean' }];
}
function levelConds(lvl) {
  if (!lvl) return STAR_DEFAULT_CONDS;
  if (Array.isArray(lvl.stars) && lvl.stars.length) return lvl.stars.slice(0, 3);
  var base = starsForType(lvl.type);
  return lvl.starUnique ? [base[0], base[1], lvl.starUnique] : [base[0], base[1]];
}
/* `run` accumulates across an operation's levels (op-end SP stays cumulative) but stars are per level:
   snapshot counters at level start and diff here. */
var RUN_DELTA_KEYS = ['shots', 'hits', 'missiles', 'kills', 'ground', 'boss', 'missions',
  'escortKills', 'pMissiles', 'pGunKills', 'pFlares', 'damageTaken', 'cleanWaves', 'allyLosses', 'spawned'];
function snapshotRunCounters(run) {
  var s = {}; run = run || {};
  for (var i = 0; i < RUN_DELTA_KEYS.length; i++) s[RUN_DELTA_KEYS[i]] = run[RUN_DELTA_KEYS[i]] || 0;
  return s;
}
function levelRunDelta(run, base) {
  run = run || {}; base = base || {};
  var d = {};
  for (var i = 0; i < RUN_DELTA_KEYS.length; i++) {
    d[RUN_DELTA_KEYS[i]] = Math.max(0, (run[RUN_DELTA_KEYS[i]] || 0) - (base[RUN_DELTA_KEYS[i]] || 0));
  }
  return d;
}
function evalStarsFor(run, player, conds) {
  if (!run) return 0;
  if (!Array.isArray(conds) || !conds.length) return evalStars(run, player);
  var stars = 0;
  for (var i = 0; i < conds.length && i < 3; i++) if (starCondMet(conds[i], run)) stars++;
  return stars;
}
// m[field][key] = max(stored, value), never regressing; lazy-creates the map for pre-field saves.
function _recordBest(m, field, key, value) {
  if (!m || !key) return value > 0 ? value : 0;
  if (!m[field]) m[field] = {};
  var prev = m[field][key] || 0;
  var best = value > prev ? value : prev;
  m[field][key] = best;
  return best;
}
function bestStars(m, jetId, stars) { return _recordBest(m, 'stars', jetId, stars); }
// Weekly-challenge best score, keyed by ISO week id.
function weeklyBest(m, weekId) {
  if (!m || !m.weekly || !weekId) return 0;
  return m.weekly[weekId] || 0;
}
function recordWeeklyBest(m, weekId, score) { return _recordBest(m, 'weekly', weekId, score); }

// Adds a run's kills to the flown airframe's lifetime tally; returns the new tally.
function stampVeterancy(jetId, kills) {
  if (!meta || !jetId) return 0;
  if (!meta.veterancy) meta.veterancy = {};
  var add = kills > 0 ? Math.floor(kills) : 0;
  meta.veterancy[jetId] = (meta.veterancy[jetId] || 0) + add;
  saveMeta();
  return meta.veterancy[jetId];
}

// apply(p, lvl) mutates the freshly spawned player; cost of level L is base * 1.6^L.
const META_PERKS = [
  { id: 'hull',    x: 0, y: 0, base: 40, max: 5,
    apply: function (p, lvl) { if (lvl > 0) { p.maxHp = Math.round(p.maxHp * (1 + 0.06 * lvl)); p.hp = p.maxHp; } } },
  { id: 'plating', x: 0, y: 1, base: 50, max: 5, req: 'hull',
    apply: function (p, lvl) { if (lvl > 0) { p.maxShield = Math.round(p.maxShield * (1 + 0.08 * lvl)); p.shield = p.maxShield; } } },
  { id: 'guns',    x: 1, y: 0, base: 45, max: 5,
    apply: function (p, lvl) { if (lvl > 0) p.gunDmgMul *= (1 + 0.04 * lvl); } },
  { id: 'warheads',x: 1, y: 1, base: 55, max: 5, req: 'guns',
    apply: function (p, lvl) { if (lvl > 0) p.missileDmgMul *= (1 + 0.05 * lvl); } },
  { id: 'magazine',x: 2, y: 0, base: 40, max: 3,
    apply: function (p, lvl) { if (lvl > 0) { var add = 4 * lvl; p.missiles += add; p.maxMissiles += add; p.flares += lvl; p.maxFlares += lvl; } } },
  { id: 'research',x: 2, y: 1, base: 60, max: 3, req: 'magazine',
    apply: function (p, lvl) { if (lvl > 0) p.rpMul *= (1 + 0.10 * lvl); } },
  { id: 'bounty',  x: 3, y: 0, base: 70, max: 1,
    apply: function (p, lvl) { if (lvl > 0) p.scoreMul *= 1.15; } },
];
const META_BY_ID = {};
for (var _i = 0; _i < META_PERKS.length; _i++) META_BY_ID[META_PERKS[_i].id] = META_PERKS[_i];

// Cost of the NEXT level (level = levels already owned).
function perkCost(perkId, level) {
  const def = META_BY_ID[perkId];
  if (!def) return Infinity;
  return Math.round(def.base * Math.pow(1.6, level));
}

function applyMetaPerks(player) {
  if (!player || !meta || !meta.perks) return;
  for (var k = 0; k < META_PERKS.length; k++) {
    var def = META_PERKS[k];
    var lvl = meta.perks[def.id] || 0;
    if (lvl > 0) def.apply(player, lvl);
  }
  // Veterancy: +1% turn rate per rank of the flown airframe. vetRank (core.js) may be absent in Node tests.
  var vetJet = player.jet && player.jet.id;
  if (vetJet && meta.veterancy && typeof vetRank === 'function') {
    var vr = vetRank(meta.veterancy[vetJet] || 0);
    if (vr > 0) player.turnMul = (player.turnMul || 1) * (1 + 0.01 * vr);
  }
}

/* Paint skins, only for the texture-less glTF jets (the rest ship baked liveries). 'default' is plain and
   always owned; designed skins colour-block by material name via `zones` (the exports have no usable UVs),
   `color` is the fallback for unnamed materials, `accent` drives the afterburner. Material names: `npx @gltf-transform/cli inspect <glb>`. */
const SKINS = {
  'FT-1': [
    { id: 'default', color: 0x9aa3ad, accent: 0xffd23f },
    { id: 'splinter', accent: 0x4fd1ff, color: 0x394d74, zones: { 'Grey': 0x394d74, 'Material': 0x394d74, 'LightGrey': 0x5b73a4, 'Material.002': 0x5b73a4, 'Black': 0x141b29, 'Green': 0x222d44, 'Yellow': 0x4fd1ff, 'Material.001': 0x4fd1ff } },
    { id: 'valedictor', accent: 0xffcf33, color: 0x2b3340, zones: { 'Grey': 0x2b3340, 'Material': 0x2b3340, 'LightGrey': 0x3c4658, 'Material.002': 0x3c4658, 'Black': 0x11161f, 'Green': 0x202632, 'Yellow': 0xffcf33, 'Material.001': 0xffcf33 } },
  ],
  'F-47': [
    { id: 'default', color: 0x3c4a58, accent: 0x36e0ff },
    { id: 'eagle', accent: 0x36e0ff, color: 0x9aa3ae, zones: { 'DoNothingMaterialClone': 0x9aa3ae, 'AngkatanBersenjata-2OD4o_Atlas_Material_Instance': 0x5b6470 } },
    { id: 'havglass', accent: 0xffb020, color: 0x3d444d, zones: { 'DoNothingMaterialClone': 0x3d444d, 'AngkatanBersenjata-2OD4o_Atlas_Material_Instance': 0x707a86 } },
  ],
  'J-20': [
    { id: 'default', color: 0x2d3138, accent: 0xff5a3c },
    { id: 'silverdragon', accent: 0xff5a3c, color: 0x9aa6b2, zones: { 'grey': 0x9aa6b2, 'material_0': 0x9aa6b2, 'Material.007': 0xb4bdc6, 'Material.005': 0xb4bdc6, 'Material.009': 0xb4bdc6, 'Material.003': 0x6c7783, 'Material.099': 0x6c7783, 'Material.002': 0x6c7783, 'Material.001': 0x4a535d, 'Material.026': 0x4a535d, 'Facade_Glass': 0x10171f, 'Basic_Glass.001': 0x10171f } },
    { id: 'mightydragon', accent: 0xff7a1e, color: 0x8e1a1a, zones: { 'grey': 0x8e1a1a, 'material_0': 0x8e1a1a, 'Material.007': 0xb83a2a, 'Material.005': 0xb83a2a, 'Material.009': 0xb83a2a, 'Material.003': 0x5e1010, 'Material.099': 0x5e1010, 'Material.002': 0x5e1010, 'Material.001': 0x3a0a0a, 'Material.026': 0x3a0a0a, 'Facade_Glass': 0x1f0606, 'Basic_Glass.001': 0x1f0606 } },
  ],
  'J-36': [
    { id: 'default', color: 0x4a525c, accent: 0xffd23f },
    { id: 'desertghost', accent: 0xff9500, color: 0xc9b487, zones: { 'PartMaterialClone': 0xc9b487, 'DSEG14Classic-Regular_Atlas_Material_Instance': 0xe2d4ab, 'DoNothingMaterialClone': 0xff9500, 'PartTransparentZWriteClone': 0x4a3c1d } },
    { id: 'nightfall', accent: 0x36e0ff, color: 0x2c333f, zones: { 'PartMaterialClone': 0x2c333f, 'DSEG14Classic-Regular_Atlas_Material_Instance': 0x4c5666, 'DoNothingMaterialClone': 0x36e0ff, 'PartTransparentZWriteClone': 0x0c1018 } },
  ],
  'J-50': [
    { id: 'default', color: 0xc2c8ce, accent: 0x36e0ff },
    { id: 'arctic', accent: 0x6bd6ff, color: 0xd3d7d9, zones: { 'PartMaterialClone': 0xd3d7d9, 'PartTransparentClone': 0x949ea8, 'PartTransparentZWriteClone': 0x949ea8, 'DoNothingMaterialClone': 0x6bd6ff } },
    { id: 'nightreaper', accent: 0xff2a5a, color: 0x1a1b1f, zones: { 'PartMaterialClone': 0x1a1b1f, 'PartTransparentClone': 0x0e0f12, 'PartTransparentZWriteClone': 0x0e0f12, 'DoNothingMaterialClone': 0xff3060 } },
  ],
  'EFT': [
    { id: 'default', color: 0x5f6a72, accent: 0xff5a3c },
    { id: 'tigermeet', accent: 0xffcf33, color: 0xe07b1e, zones: { 'white': 0xe07b1e, 'Whitish_grey.001': 0xf2a64d, 'Whitish_grey.002': 0xf2a64d, 'Material.001': 0xa8500f, 'Material.002': 0xa8500f, 'Not_so_dark': 0xa8500f, 'Darker_paint': 0x6e3408, 'Darker_paint.001': 0x6e3408, 'darkness': 0x6e3408, 'darkenss': 0x6e3408, 'darkenss.001': 0x6e3408, 'Darkness.001': 0x6e3408, 'Nato_black': 0x241208, 'Eurofighter_RT': 0x141414, 'Eurofighter_RT.001': 0x141414, 'Eurofighter_LT': 0x141414, 'Glowing_green.001': 0xffcf33 } },
    { id: 'nightjar', accent: 0xff5a3c, color: 0x33383f, zones: { 'white': 0x33383f, 'Whitish_grey.001': 0x515862, 'Whitish_grey.002': 0x515862, 'Material.001': 0x262b31, 'Material.002': 0x262b31, 'Not_so_dark': 0x262b31, 'Darker_paint': 0x1b1f24, 'Darker_paint.001': 0x1b1f24, 'darkness': 0x1b1f24, 'darkenss': 0x1b1f24, 'darkenss.001': 0x1b1f24, 'Darkness.001': 0x1b1f24, 'Nato_black': 0x0e1013, 'Eurofighter_RT': 0x3c434b, 'Eurofighter_RT.001': 0x3c434b, 'Eurofighter_LT': 0x3c434b, 'Glowing_green.001': 0xff5a3c } },
  ],
  'FA18': [
    { id: 'default', color: 0x6b7782, accent: 0x36e0ff },
    { id: 'aggressor', accent: 0x36e0ff, color: 0x2e3742, zones: { 'Base_paint': 0x2e3742, 'Base_paint_2': 0x2e3742, 'side_color': 0x556272, 'Whitish_grey.001': 0x556272, 'Whitish_grey.002': 0x556272, 'Not_so_dark.001': 0x3c4854, 'Darker_paint': 0x3c4854, 'Fa18_L': 0x3c4854, 'Fa18_R': 0x3c4854, 'Darkness.001': 0x222932, 'darkenss': 0x222932, 'darkenss.001': 0x222932, 'Nato_black': 0x222932, 'Fa18_engine': 0x161b21, 'engine_color': 0x161b21, 'Glowing_green.001': 0x36e0ff } },
    { id: 'blueangel', accent: 0xffd23f, color: 0x1c4fbf, zones: { 'Base_paint': 0x1c4fbf, 'Base_paint_2': 0x1c4fbf, 'side_color': 0x3f74e0, 'Whitish_grey.001': 0x3f74e0, 'Whitish_grey.002': 0x3f74e0, 'Not_so_dark.001': 0x143a96, 'Darker_paint': 0x143a96, 'Fa18_L': 0x143a96, 'Fa18_R': 0x143a96, 'Darkness.001': 0x0d2a72, 'darkenss': 0x0d2a72, 'darkenss.001': 0x0d2a72, 'Nato_black': 0x0d2a72, 'Fa18_engine': 0x0a1f55, 'engine_color': 0x0a1f55, 'Glowing_green.001': 0xffd23f } },
  ],
};

// test(run, player) is pure; sp is paid once.
const ACHIEVEMENTS = [
  { id: 'firstBlood', test: function (run, player) { return runKills(run) >= 1; }, sp: 5 },
  { id: 'acePilot',   test: function (run, player) { return (run.kills || 0) >= 25; }, sp: 25 },
  { id: 'bossSlayer', test: function (run, player) { return (run.boss || 0) >= 1; }, sp: 30 },
  { id: 'survivor',   test: function (run, player) { return (run.waveReached || 0) >= 10; }, sp: 40 },
  { id: 'highScore',  test: function (run, player) { return ((player && player.score) || 0) >= 50000; }, sp: 50 },
  { id: 'groundPounder', test: function (run, player) { return (run.ground || 0) >= 20; }, sp: 25 },
  { id: 'tactician',  test: function (run, player) { return (run.missions || 0) >= 5; }, sp: 35 },
];

// Emblem gate: 'free' | 'sp' (bought for cost) | 'ach' (earned achievement id).
const EMBLEMS = [
  { id: 'wings',    gate: 'free' },
  { id: 'skull',    gate: 'sp',  cost: 80 },
  { id: 'star',     gate: 'sp',  cost: 80 },
  { id: 'dragon',   gate: 'ach', ach: 'bossSlayer' },
  { id: 'ace',      gate: 'ach', ach: 'acePilot' },
];
// Uppercase A-Z0-9, max 8 chars; '' is valid (anonymous).
function sanitizeCallsign(str) {
  if (!str) return '';
  return String(str).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}
function emblemUnlocked(id, m) {
  if (devUnlockAll) return true;
  if (!m) return false;
  for (var j = 0; j < EMBLEMS.length; j++) {
    var e = EMBLEMS[j];
    if (e.id !== id) continue;
    if (e.gate === 'free') return true;
    if (e.gate === 'sp') return !!(m.patches && m.patches[id]);
    if (e.gate === 'ach') return !!(m.ach && m.ach[e.ach]);
    return false;
  }
  return false;
}
function buyPatch(id) {
  if (!meta) return false;
  var def = EMBLEMS.find(function (e) { return e.id === id; });
  if (!def || def.gate !== 'sp') return false;
  if ((meta.patches && meta.patches[id]) || !_spend(def.cost)) return false;
  if (!meta.patches) meta.patches = {};
  meta.patches[id] = true;
  saveMeta();
  return true;
}
function setEmblem(id) {
  if (!meta || !emblemUnlocked(id, meta)) return false;
  meta.emblem = id;
  saveMeta();
  return true;
}
function setCallsign(str) {
  if (!meta) return;
  meta.callsign = sanitizeCallsign(str);
  saveMeta();
}

// Node tests require meta.js without prefs.js; in the browser loadHealed is already a global.
if (typeof loadHealed === 'undefined' && typeof require === 'function') {
  try { loadHealed = require('./prefs.js').loadHealed; } catch (e) {}
}
function freshMeta() {
  const jets = {};
  for (var i = 0; i < STARTER_JETS.length; i++) jets[STARTER_JETS[i]] = true;
  return { v: META_VERSION, sp: 0, jets: jets, skins: {}, perks: {}, ach: {}, stars: {}, campaign: {}, veterancy: {}, weekly: {}, callsign: '', emblem: 'wings', patches: {}, slot2: false, bossRushUnlocked: false, bossRushBest: 0 };
}
function validMeta(m) {
  return !!(m && typeof m === 'object' && typeof m.v === 'number' && typeof m.sp === 'number' && m.sp >= 0 &&
    m.jets && typeof m.jets === 'object' && m.skins && typeof m.skins === 'object' &&
    m.perks && typeof m.perks === 'object' && m.ach && typeof m.ach === 'object');
}
function loadMeta() {
  meta = loadHealed(META_KEY, freshMeta, { valid: validMeta });
  for (var i = 0; i < STARTER_JETS.length; i++) if (!meta.jets[STARTER_JETS[i]]) meta.jets[STARTER_JETS[i]] = true;
}
function saveMeta() { try { store.set(META_KEY, JSON.stringify(meta)); } catch (e) {} }

function spBalance() { return meta ? meta.sp : 0; }
function bankSP(amount) { if (meta && amount > 0) { meta.sp += amount; saveMeta(); } return meta ? meta.sp : 0; }
// Deducts cost if affordable; callers have already checked `meta`.
function _spend(cost) {
  if (meta.sp < cost) return false;
  meta.sp -= cost;
  return true;
}

function perkLevel(id) { return (meta && meta.perks[id]) || 0; }
function perkMaxed(id) { const d = META_BY_ID[id]; return !!d && perkLevel(id) >= d.max; }
function perkUnlocked(id) {
  const d = META_BY_ID[id];
  return !!d && (!d.req || perkLevel(d.req) > 0);
}
function buyPerk(id) {
  if (!META_BY_ID[id] || !meta || perkMaxed(id) || !perkUnlocked(id)) return false;
  if (!_spend(perkCost(id, perkLevel(id)))) return false;
  meta.perks[id] = perkLevel(id) + 1;
  saveMeta();
  return true;
}

const JET_LOCK_COST = 250;
function jetUnlocked(key) { return devUnlockAll || !!(meta && meta.jets[key]); }
function jetCost(key) { return JET_LOCK_COST; }
function buyJet(key) {
  if (!meta || jetUnlocked(key) || !_spend(jetCost(key))) return false;
  meta.jets[key] = true;
  saveMeta();
  return true;
}

const SKIN_COST = 120;
function skinOwned(key, id) {
  if (id === 'default') return true;
  return devUnlockAll || !!(meta && meta.skins[key] && meta.skins[key].indexOf(id) !== -1);
}
function skinCost(key, id) { return SKIN_COST; }
function buySkin(key, id) {
  if (!meta || id === 'default' || skinOwned(key, id) || !_spend(skinCost(key, id))) return false;
  if (!meta.skins[key]) meta.skins[key] = [];
  meta.skins[key].push(id);
  saveMeta();
  return true;
}
const SLOT2_COST = 300;               // one-time unlock of the second special slot
function slot2Unlocked() { return devUnlockAll || !!(meta && meta.slot2); }
function buySlot2() {
  if (!meta || slot2Unlocked() || !_spend(SLOT2_COST)) return false;
  meta.slot2 = true;
  saveMeta();
  return true;
}
function selectedSkin(key) {
  const sel = meta && meta.sel && meta.sel[key];
  if (sel && skinOwned(key, sel)) return sel;
  return 'default';
}
function setSkin(key, id) {
  if (!meta || !skinOwned(key, id)) return false;
  if (!meta.sel) meta.sel = {};
  meta.sel[key] = id;
  saveMeta();
  return true;
}
/* The single skin resolver: paint {color, accent, zones} for an explicit skin id, ownership-agnostic;
   unknown ids fall back to the jet's stock paint. */
function resolveSkin(jet, skinId) {
  const list = SKINS[jet.id];
  if (list) {
    for (var i = 0; i < list.length; i++) {
      const sk = list[i];
      if (sk.id === skinId) return { color: sk.color != null ? sk.color : jet.color, accent: sk.accent != null ? sk.accent : jet.accent, zones: sk.zones || null };
    }
  }
  return { color: jet.color, accent: jet.accent, zones: null };
}
// Old name, kept for scripts/jets-sheet.mjs.
function resolveSkinPaint(jet, id) { return resolveSkin(jet, id); }
// Owned paint for gameplay — never the transient hangar preview, so an unowned preview can't launch.
function jetPaint(jet) { return resolveSkin(jet, selectedSkin(jet.id)); }

// Store-touching wrappers over the pure campaign cores in core.js.
function campaignOpUnlocked(opId) {
  if (typeof devUnlockLevels !== 'undefined' && devUnlockLevels) return true;
  return isOpUnlocked((meta && meta.campaign) || {}, OPERATIONS, opId);
}
function campaignLevelState(opId, levelIndex) {
  var st = levelState((meta && meta.campaign) || {}, OPERATIONS, opId, levelIndex);
  // dev unlock promotes only 'locked', so a genuine 'cleared' keeps its star pips
  if (st === 'locked' && typeof devUnlockLevels !== 'undefined' && devUnlockLevels) return 'unlocked';
  return st;
}
function campaignClearLevel(opId, levelIndex, levelId, score, stars) {
  if (!meta) return;
  meta.campaign = markLevelCleared(meta.campaign || {}, OPERATIONS, opId, levelIndex, score, stars, levelId);
  saveMeta();
}

function achEarned(id) { return !!(meta && meta.ach[id]); }
function grantAch(id) {
  const def = ACHIEVEMENTS.find(function (a) { return a.id === id; });
  if (!def || !meta || achEarned(id)) return 0;
  meta.ach[id] = true;
  if (def.sp > 0) meta.sp += def.sp;
  saveMeta();
  return def.sp || 0;
}
// Run end: grant newly earned achievements; returns { sp paid, ids unlocked }.
function checkAchievements(run, player) {
  var paid = 0; var unlocked = [];
  for (var i = 0; i < ACHIEVEMENTS.length; i++) {
    var a = ACHIEVEMENTS[i];
    if (!achEarned(a.id) && a.test(run, player)) { paid += grantAch(a.id); unlocked.push(a.id); }
  }
  return { sp: paid, unlocked: unlocked };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    spAward, gradeRun, evalStars, evalStarsFor, starCondMet, STAR_DEFAULT_CONDS, bestStars, perkCost,
    starsForType, levelConds, STAR_TYPE_CONDS, snapshotRunCounters, levelRunDelta,
    applyMetaPerks, stampVeterancy, sanitizeCallsign, emblemUnlocked,
    freshMeta, validMeta, loadMeta, saveMeta,
    perkLevel, perkMaxed, perkUnlocked, buyPerk,
    jetUnlocked, jetCost, buyJet, skinOwned, skinCost, buySkin,
    selectedSkin, setSkin, jetPaint, resolveSkin, resolveSkinPaint,
    slot2Unlocked, buySlot2, SLOT2_COST,
    achEarned, grantAch, checkAchievements,
    campaignOpUnlocked, campaignLevelState, campaignClearLevel,
    META_KEY, META_VERSION, STARTER_JETS, STAR_KILL_FRAC,
    META_PERKS, META_BY_ID, SKINS, ACHIEVEMENTS, EMBLEMS,
    JET_LOCK_COST, SKIN_COST,
    weeklyBest, recordWeeklyBest,
    starExpectedKills, starCondLive,
  };
}
