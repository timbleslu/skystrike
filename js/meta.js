/* SKYSTRIKE — meta.js: persistent meta-progression layer (SP currency, jet unlocks, skins,
   meta-upgrade perks, achievements). Modeled on rival.js: owns state, loads/saves via the
   storage seam, exposes pure helpers. Loaded after rival.js, before opmap.js.

   SP is a SECOND, PERSISTENT currency, distinct from in-run RP (player.tp). It is earned each
   run (spAward, derived from the existing `run` stats object — the single source of run stats)
   and spent BETWEEN runs on the meta tree / jets / skins. Meta perks apply at run start
   (applyMetaPerks), BEFORE the in-run TECH_TREE. In-run RP behaviour is unchanged. */

const META_KEY = 'skystrike_meta';
const META_VERSION = 1;
let meta = null;            // persistent meta-progression state (loaded at boot)

/* jets unlocked for free from the start; the rest are gated behind SP. */
const STARTER_JETS = ['FT-1', 'F-22', 'SU-57'];

/* ---------------- SP award (PURE — mirrored byte-identical in tests/meta.test.js) ----------------
   Derives the run's SP payout from the existing `run` stats object + player score. Monotonic in
   every term; a do-nothing run pays 0. Callers stamp run.waveReached / run.rivalLevel before
   calling so this stays pure (no globals). */
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

/* ---------------- run grading (PURE — mirrored byte-identical in tests/grading.test.js) ----------------
   Grades the completed run on kill efficiency, time, damage taken, and objectives. Returns
   { letter, mult, score } where letter is S/A/B/C and mult is the SP bonus multiplier.
   Callers must stamp run.waveReached + run.timeSecs before calling so this stays pure. */
function gradeRun(run, player) {
  if (!run) return { letter: 'C', mult: 1.0, score: 0 };
  var waves = Math.max(1, run.waveReached || 1);
  var expected = waves * 4;
  var kills = (run.kills || 0) + (run.ground || 0) + (run.boss || 0);
  var killScore = Math.min(1, kills / expected);
  var secs = Math.max(1, run.timeSecs || 1);
  var timeScore = Math.min(1, (waves * 30) / secs);
  var maxDmg = 300 + waves * 60;
  var dmgScore = Math.max(0, 1 - (run.damageTaken || 0) / maxDmg);
  var missionScore = Math.min(1, (run.missions || 0) / Math.max(1, Math.floor(waves / 2)));
  var total = killScore * 0.40 + timeScore * 0.20 + dmgScore * 0.25 + missionScore * 0.15;
  var letter, mult;
  if (total >= 0.85)      { letter = 'S'; mult = 1.5; }
  else if (total >= 0.65) { letter = 'A'; mult = 1.3; }
  else if (total >= 0.40) { letter = 'B'; mult = 1.15; }
  else                    { letter = 'C'; mult = 1.0; }
  return { letter: letter, mult: mult, score: total };
}

/* ---------------- star objectives (PURE — mirrored byte-identical in tests/stars.test.js) ----------------
   1–3 secondary stars per run from three independent, checkable conditions over the existing
   `run` stats (kill efficiency / a full no-damage wave / objectives completed). Callers stamp
   run.waveReached first (as for spAward/gradeRun). run.cleanWaves counts waves cleared without
   taking a hit (tracked in main.js via the noDamageWave flag). Returns an integer 0..3. */
const STAR_KILL_FRAC = 0.6;   // ≥60% of the wave-scaled expected kills earns the kills star
function evalStars(run, player) {
  if (!run) return 0;
  var stars = 0;
  var waves = Math.max(1, run.waveReached || 1);
  var expected = waves * 4;
  var kills = (run.kills || 0) + (run.ground || 0) + (run.boss || 0);
  if (kills / expected >= STAR_KILL_FRAC) stars++;          // kill efficiency
  if ((run.cleanWaves || 0) >= 1) stars++;                  // a full wave with no damage taken
  if ((run.missions || 0) >= 1) stars++;                    // objectives / pilots rescued
  return stars;
}
/* Record `stars` as the per-jet best in meta.stars[jetId] (never regresses); returns the new best.
   Lazy-creates the stars map so a meta predating this field still works. PURE over (meta, args). */
function bestStars(m, jetId, stars) {
  if (!m || !jetId) return stars > 0 ? stars : 0;
  if (!m.stars) m.stars = {};
  var prev = m.stars[jetId] || 0;
  var best = stars > prev ? stars : prev;
  m.stars[jetId] = best;
  return best;
}

/* ---------------- meta-upgrade perk tree ----------------
   Each perk is a bounded persistent edge applied at run start. apply(p, lvl) mutates the freshly
   spawned player; lvl 0 is a no-op (perk not owned). Costs scale with level via perkCost. */
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

/* cost of the NEXT level of a perk (level = levels already owned). PURE — mirrored in tests. */
function perkCost(perkId, level) {
  const def = META_BY_ID[perkId];
  if (!def) return Infinity;
  return Math.round(def.base * Math.pow(1.6, level));
}

/* apply every owned meta perk to a freshly-spawned player. Called at run start, BEFORE in-run
   tech. PURE over (player, perks-map) — mirrored byte-identical in tests via a mock player. */
function applyMetaPerks(player) {
  if (!player || !meta || !meta.perks) return;
  for (var k = 0; k < META_PERKS.length; k++) {
    var def = META_PERKS[k];
    var lvl = meta.perks[def.id] || 0;
    if (lvl > 0) def.apply(player, lvl);
  }
}

/* ---------------- cosmetic skins (per airframe) ----------------
   id 'default' is always owned (the jet's stock color/accent, color:null = use the JETS row).
   Others cost SP and override the paint via color/accent at build time. */
const SKINS = {
  'FT-1':  [{ id: 'default', color: null }, { id: 'sand', color: 0xc8b88a, accent: 0xe0c060 }, { id: 'arctic', color: 0xdfe8ef, accent: 0x8fd0ff }],
  'F-22':  [{ id: 'default', color: null }, { id: 'splinter', color: 0x4a5a6a, accent: 0x9fe0ff }, { id: 'raptor', color: 0x1a2a3a, accent: 0xff3a3a }],
  'SU-57': [{ id: 'default', color: null }, { id: 'felon', color: 0x3a3a44, accent: 0xff6a2a }, { id: 'aurora', color: 0x2a3a5a, accent: 0x60ffd0 }],
};

/* ---------------- achievements ----------------
   test(run, player) is a PURE predicate over the same run stats + player. spReward is paid once
   (grantAch guards against re-award). */
const ACHIEVEMENTS = [
  { id: 'firstBlood', test: function (run, player) { return (run.kills || 0) + (run.ground || 0) + (run.boss || 0) >= 1; }, sp: 5 },
  { id: 'acePilot',   test: function (run, player) { return (run.kills || 0) >= 25; }, sp: 25 },
  { id: 'bossSlayer', test: function (run, player) { return (run.boss || 0) >= 1; }, sp: 30 },
  { id: 'survivor',   test: function (run, player) { return (run.waveReached || 0) >= 10; }, sp: 40 },
  { id: 'highScore',  test: function (run, player) { return ((player && player.score) || 0) >= 50000; }, sp: 50 },
  { id: 'groundPounder', test: function (run, player) { return (run.ground || 0) >= 20; }, sp: 25 },
  { id: 'tactician',  test: function (run, player) { return (run.missions || 0) >= 5; }, sp: 35 },
];

/* ---------------- persistence ----------------
   Only meta.js touches storage for the meta blob (via store.get/set). validMeta guards a loaded
   blob; malformed/legacy data falls back to a fresh meta. Mirrored byte-identical in tests. */
function freshMeta() {
  const jets = {};
  for (var i = 0; i < STARTER_JETS.length; i++) jets[STARTER_JETS[i]] = true;
  return { v: META_VERSION, sp: 0, jets: jets, skins: {}, perks: {}, ach: {}, stars: {} };
}
function validMeta(m) {
  return !!(m && typeof m === 'object' && typeof m.v === 'number' && typeof m.sp === 'number' && m.sp >= 0 &&
    m.jets && typeof m.jets === 'object' && m.skins && typeof m.skins === 'object' &&
    m.perks && typeof m.perks === 'object' && m.ach && typeof m.ach === 'object' &&
    m.stars && typeof m.stars === 'object');
}
function loadMeta() {
  try {
    const m = JSON.parse(store.get(META_KEY) || 'null');
    meta = validMeta(m) ? m : freshMeta();
  } catch (e) { meta = freshMeta(); }
  // ensure starter jets are always present even if an older save predates one
  for (var i = 0; i < STARTER_JETS.length; i++) if (!meta.jets[STARTER_JETS[i]]) meta.jets[STARTER_JETS[i]] = true;
}
function saveMeta() { try { store.set(META_KEY, JSON.stringify(meta)); } catch (e) {} }

/* ---------------- SP spend + ownership ---------------- */
function spBalance() { return meta ? meta.sp : 0; }
function bankSP(amount) { if (meta && amount > 0) { meta.sp += amount; saveMeta(); } return meta ? meta.sp : 0; }

function perkLevel(id) { return (meta && meta.perks[id]) || 0; }
function perkMaxed(id) { const d = META_BY_ID[id]; return !!d && perkLevel(id) >= d.max; }
function perkUnlocked(id) {           // prerequisite perk owned (≥1 level)? (req gate)
  const d = META_BY_ID[id];
  return !!d && (!d.req || perkLevel(d.req) > 0);
}
function buyPerk(id) {
  const d = META_BY_ID[id];
  if (!d || !meta) return false;
  if (perkMaxed(id) || !perkUnlocked(id)) return false;
  const cost = perkCost(id, perkLevel(id));
  if (meta.sp < cost) return false;
  meta.sp -= cost;
  meta.perks[id] = perkLevel(id) + 1;
  saveMeta();
  return true;
}

const JET_LOCK_COST = 250;            // flat SP cost to unlock any non-starter airframe
function jetUnlocked(key) { return !!(meta && meta.jets[key]); }
function jetCost(key) { return JET_LOCK_COST; }
function buyJet(key) {
  if (!meta || jetUnlocked(key)) return false;
  const cost = jetCost(key);
  if (meta.sp < cost) return false;
  meta.sp -= cost;
  meta.jets[key] = true;
  saveMeta();
  return true;
}

const SKIN_COST = 120;                // flat SP cost per cosmetic skin
function skinOwned(key, id) {
  if (id === 'default') return true;
  return !!(meta && meta.skins[key] && meta.skins[key].indexOf(id) !== -1);
}
function skinCost(key, id) { return SKIN_COST; }
function buySkin(key, id) {
  if (!meta || id === 'default' || skinOwned(key, id)) return false;
  const cost = skinCost(key, id);
  if (meta.sp < cost) return false;
  meta.sp -= cost;
  if (!meta.skins[key]) meta.skins[key] = [];
  meta.skins[key].push(id);
  saveMeta();
  return true;
}
/* currently-selected skin for a jet (persisted choice, default if unset/unowned) */
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
/* resolve a jet's paint {color, accent} honouring the chosen skin (falls back to the jet's stock) */
function jetPaint(jet) {
  const list = SKINS[jet.id];
  const id = selectedSkin(jet.id);
  if (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id && list[i].color != null) return { color: list[i].color, accent: list[i].accent != null ? list[i].accent : jet.accent };
    }
  }
  return { color: jet.color, accent: jet.accent };
}

/* ---------------- achievements ---------------- */
function achEarned(id) { return !!(meta && meta.ach[id]); }
function grantAch(id) {
  const def = ACHIEVEMENTS.find(function (a) { return a.id === id; });
  if (!def || !meta || achEarned(id)) return 0;
  meta.ach[id] = true;
  if (def.sp > 0) meta.sp += def.sp;
  saveMeta();
  return def.sp || 0;
}
/* run end: evaluate every achievement predicate, grant newly-earned ones, return total SP paid +
   the ids unlocked this run (for a banner). */
function checkAchievements(run, player) {
  var paid = 0; var unlocked = [];
  for (var i = 0; i < ACHIEVEMENTS.length; i++) {
    var a = ACHIEVEMENTS[i];
    if (!achEarned(a.id) && a.test(run, player)) { paid += grantAch(a.id); unlocked.push(a.id); }
  }
  return { sp: paid, unlocked: unlocked };
}
