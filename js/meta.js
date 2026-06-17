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

/* the only jet unlocked for free from the start; the rest (incl. F-22, SU-57) are gated behind SP. */
const STARTER_JETS = ['FT-1'];

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
/* In-code paint skins ONLY for the texture-less glTF jets (geometry-only / flat-albedo exports render flat):
   FT-1(STD), F-47(F47), J-20(J20), J-36(J36), J-50(J50), EFT, FA18. cloneJetGLTF→applyPaint recolours
   their bare materials. Each jet gets exactly 3 skins:
     - `default` — PLAIN solid colour (always free/owned), the neutral stock look. Fast path: {color, accent}.
     - skins 2 & 3 — COLOUR-BLOCK liveries: per-material `zones` (material.name → colour) so distinct hull sections
       paint differently with NO texture/UV needed (the textureless exports have no usable UVs — confirmed). `color`
       is the fallback for any material not named in `zones`. `accent` drives the afterburner flame (addBurner). The
       two designed skins are independent colourways (e.g. cool splinter vs warm signature) — distinct at a glance.
   Material names below were read from each .glb via scripts/gltf-inspect.mjs. The other airframes ship baked
   liveries and are intentionally absent here (no chips). */
const SKINS = {
  // FT-1 (STD) — trainer, 8 clean semantic materials
  'FT-1': [
    { id: 'default', color: 0x9aa3ad, accent: 0xffd23f },
    { id: 'splinter', accent: 0x4fd1ff, color: 0x394d74, zones: { 'Grey': 0x394d74, 'Material': 0x394d74, 'LightGrey': 0x5b73a4, 'Material.002': 0x5b73a4, 'Black': 0x141b29, 'Green': 0x222d44, 'Yellow': 0x4fd1ff, 'Material.001': 0x4fd1ff } },
    { id: 'valedictor', accent: 0xffcf33, color: 0x2b3340, zones: { 'Grey': 0x2b3340, 'Material': 0x2b3340, 'LightGrey': 0x3c4658, 'Material.002': 0x3c4658, 'Black': 0x11161f, 'Green': 0x202632, 'Yellow': 0xffcf33, 'Material.001': 0xffcf33 } },
  ],
  // F-47 (F47) — 2 materials only: body (DoNothingMaterialClone) + 1 atlas decal → bold 2-tone ceiling
  'F-47': [
    { id: 'default', color: 0x3c4a58, accent: 0x36e0ff },
    { id: 'eagle', accent: 0x36e0ff, color: 0x9aa3ae, zones: { 'DoNothingMaterialClone': 0x9aa3ae, 'AngkatanBersenjata-2OD4o_Atlas_Material_Instance': 0x5b6470 } },
    { id: 'havglass', accent: 0xffb020, color: 0x3d444d, zones: { 'DoNothingMaterialClone': 0x3d444d, 'AngkatanBersenjata-2OD4o_Atlas_Material_Instance': 0x707a86 } },
  ],
  // J-20 (J20) — 12 materials, rich multi-panel fuselage
  'J-20': [
    { id: 'default', color: 0x2d3138, accent: 0xff5a3c },
    { id: 'silverdragon', accent: 0xff5a3c, color: 0x9aa6b2, zones: { 'grey': 0x9aa6b2, 'material_0': 0x9aa6b2, 'Material.007': 0xb4bdc6, 'Material.005': 0xb4bdc6, 'Material.009': 0xb4bdc6, 'Material.003': 0x6c7783, 'Material.099': 0x6c7783, 'Material.002': 0x6c7783, 'Material.001': 0x4a535d, 'Material.026': 0x4a535d, 'Facade_Glass': 0x10171f, 'Basic_Glass.001': 0x10171f } },
    { id: 'mightydragon', accent: 0xff7a1e, color: 0x8e1a1a, zones: { 'grey': 0x8e1a1a, 'material_0': 0x8e1a1a, 'Material.007': 0xb83a2a, 'Material.005': 0xb83a2a, 'Material.009': 0xb83a2a, 'Material.003': 0x5e1010, 'Material.099': 0x5e1010, 'Material.002': 0x5e1010, 'Material.001': 0x3a0a0a, 'Material.026': 0x3a0a0a, 'Facade_Glass': 0x1f0606, 'Basic_Glass.001': 0x1f0606 } },
  ],
  // J-36 (J36) — 4 materials: body(22) + panel/cockpit cluster(15) + 2 accents
  'J-36': [
    { id: 'default', color: 0x4a525c, accent: 0xffd23f },
    { id: 'desertghost', accent: 0xff9500, color: 0xc9b487, zones: { 'PartMaterialClone': 0xc9b487, 'DSEG14Classic-Regular_Atlas_Material_Instance': 0xe2d4ab, 'DoNothingMaterialClone': 0xff9500, 'PartTransparentZWriteClone': 0x4a3c1d } },
    { id: 'nightfall', accent: 0x36e0ff, color: 0x2c333f, zones: { 'PartMaterialClone': 0x2c333f, 'DSEG14Classic-Regular_Atlas_Material_Instance': 0x4c5666, 'DoNothingMaterialClone': 0x36e0ff, 'PartTransparentZWriteClone': 0x0c1018 } },
  ],
  // J-50 (J50) — body = PartMaterialClone(15); other mats are HUD atlases (left at fallback)
  'J-50': [
    { id: 'default', color: 0xc2c8ce, accent: 0x36e0ff },
    { id: 'arctic', accent: 0x6bd6ff, color: 0xd3d7d9, zones: { 'PartMaterialClone': 0xd3d7d9, 'PartTransparentClone': 0x949ea8, 'PartTransparentZWriteClone': 0x949ea8, 'DoNothingMaterialClone': 0x6bd6ff } },
    { id: 'nightreaper', accent: 0xff2a5a, color: 0x1a1b1f, zones: { 'PartMaterialClone': 0x1a1b1f, 'PartTransparentClone': 0x0e0f12, 'PartTransparentZWriteClone': 0x0e0f12, 'DoNothingMaterialClone': 0xff3060 } },
  ],
  // EFT — 23 named materials, richest surface
  'EFT': [
    { id: 'default', color: 0x5f6a72, accent: 0xff5a3c },
    { id: 'tigermeet', accent: 0xffcf33, color: 0xe07b1e, zones: { 'white': 0xe07b1e, 'Whitish_grey.001': 0xf2a64d, 'Whitish_grey.002': 0xf2a64d, 'Material.001': 0xa8500f, 'Material.002': 0xa8500f, 'Not_so_dark': 0xa8500f, 'Darker_paint': 0x6e3408, 'Darker_paint.001': 0x6e3408, 'darkness': 0x6e3408, 'darkenss': 0x6e3408, 'darkenss.001': 0x6e3408, 'Darkness.001': 0x6e3408, 'Nato_black': 0x241208, 'Eurofighter_RT': 0x141414, 'Eurofighter_RT.001': 0x141414, 'Eurofighter_LT': 0x141414, 'Glowing_green.001': 0xffcf33 } },
    { id: 'nightjar', accent: 0xff5a3c, color: 0x33383f, zones: { 'white': 0x33383f, 'Whitish_grey.001': 0x515862, 'Whitish_grey.002': 0x515862, 'Material.001': 0x262b31, 'Material.002': 0x262b31, 'Not_so_dark': 0x262b31, 'Darker_paint': 0x1b1f24, 'Darker_paint.001': 0x1b1f24, 'darkness': 0x1b1f24, 'darkenss': 0x1b1f24, 'darkenss.001': 0x1b1f24, 'Darkness.001': 0x1b1f24, 'Nato_black': 0x0e1013, 'Eurofighter_RT': 0x3c434b, 'Eurofighter_RT.001': 0x3c434b, 'Eurofighter_LT': 0x3c434b, 'Glowing_green.001': 0xff5a3c } },
  ],
  // FA18 — 31 named materials, richest surface
  'FA18': [
    { id: 'default', color: 0x6b7782, accent: 0x36e0ff },
    { id: 'aggressor', accent: 0x36e0ff, color: 0x2e3742, zones: { 'Base_paint': 0x2e3742, 'Base_paint_2': 0x2e3742, 'side_color': 0x556272, 'Whitish_grey.001': 0x556272, 'Whitish_grey.002': 0x556272, 'Not_so_dark.001': 0x3c4854, 'Darker_paint': 0x3c4854, 'Fa18_L': 0x3c4854, 'Fa18_R': 0x3c4854, 'Darkness.001': 0x222932, 'darkenss': 0x222932, 'darkenss.001': 0x222932, 'Nato_black': 0x222932, 'Fa18_engine': 0x161b21, 'engine_color': 0x161b21, 'Glowing_green.001': 0x36e0ff } },
    { id: 'blueangel', accent: 0xffd23f, color: 0x1c4fbf, zones: { 'Base_paint': 0x1c4fbf, 'Base_paint_2': 0x1c4fbf, 'side_color': 0x3f74e0, 'Whitish_grey.001': 0x3f74e0, 'Whitish_grey.002': 0x3f74e0, 'Not_so_dark.001': 0x143a96, 'Darker_paint': 0x143a96, 'Fa18_L': 0x143a96, 'Fa18_R': 0x143a96, 'Darkness.001': 0x0d2a72, 'darkenss': 0x0d2a72, 'darkenss.001': 0x0d2a72, 'Nato_black': 0x0d2a72, 'Fa18_engine': 0x0a1f55, 'engine_color': 0x0a1f55, 'Glowing_green.001': 0xffd23f } },
  ],
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

/* ---------------- callsign + emblem (F13) ----------------
   PURE helpers — mirrored byte-identical in tests/meta.test.js.
   EMBLEMS: each patch has a gate type: 'free', 'sp' (cost = gate value), or 'ach' (achievement id). */
const EMBLEMS = [
  { id: 'wings',    gate: 'free' },
  { id: 'skull',    gate: 'sp',  cost: 80 },
  { id: 'star',     gate: 'sp',  cost: 80 },
  { id: 'dragon',   gate: 'ach', ach: 'bossSlayer' },
  { id: 'ace',      gate: 'ach', ach: 'acePilot' },
];
/* uppercase, strip non-A-Z0-9, clamp to 8 chars. Empty string is valid (anonymous). */
function sanitizeCallsign(str) {
  if (!str) return '';
  return String(str).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}
/* true if the emblem is accessible to the player given current meta state. */
function emblemUnlocked(id, m) {
  if (devUnlockAll) return true;   // F4: dev-unlock everything
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
/* buy a SP-gated patch. Returns true on success. */
function buyPatch(id) {
  if (!meta) return false;
  var def = null;
  for (var j = 0; j < EMBLEMS.length; j++) { if (EMBLEMS[j].id === id) { def = EMBLEMS[j]; break; } }
  if (!def || def.gate !== 'sp') return false;
  if (meta.patches && meta.patches[id]) return false;      // already owned
  if (meta.sp < def.cost) return false;
  meta.sp -= def.cost;
  if (!meta.patches) meta.patches = {};
  meta.patches[id] = true;
  saveMeta();
  return true;
}
/* set the active emblem (must be unlocked). */
function setEmblem(id) {
  if (!meta || !emblemUnlocked(id, meta)) return false;
  meta.emblem = id;
  saveMeta();
  return true;
}
/* set callsign (sanitizes before saving). */
function setCallsign(str) {
  if (!meta) return;
  meta.callsign = sanitizeCallsign(str);
  saveMeta();
}

/* ---------------- persistence ----------------
   Only meta.js touches storage for the meta blob (via store.get/set). validMeta guards a loaded
   blob; malformed/legacy data falls back to a fresh meta. Mirrored byte-identical in tests. */
function freshMeta() {
  const jets = {};
  for (var i = 0; i < STARTER_JETS.length; i++) jets[STARTER_JETS[i]] = true;
  return { v: META_VERSION, sp: 0, jets: jets, skins: {}, perks: {}, ach: {}, stars: {}, campaign: {}, callsign: '', emblem: 'wings', patches: {}, slot2: false, bossRushUnlocked: false, bossRushBest: 0 };
}
function validMeta(m) {
  return !!(m && typeof m === 'object' && typeof m.v === 'number' && typeof m.sp === 'number' && m.sp >= 0 &&
    m.jets && typeof m.jets === 'object' && m.skins && typeof m.skins === 'object' &&
    m.perks && typeof m.perks === 'object' && m.ach && typeof m.ach === 'object');
}
function loadMeta() {
  try {
    const m = JSON.parse(store.get(META_KEY) || 'null');
    meta = validMeta(m) ? m : freshMeta();
  } catch (e) { meta = freshMeta(); }
  // ensure starter jets are always present even if an older save predates one
  for (var i = 0; i < STARTER_JETS.length; i++) if (!meta.jets[STARTER_JETS[i]]) meta.jets[STARTER_JETS[i]] = true;
  // heal legacy saves missing stars (F6) / callsign,emblem,patches (F13) / boss-rush (F15) — keep progression, never wipe
  if (!meta.stars || typeof meta.stars !== 'object') meta.stars = {};
  if (typeof meta.callsign !== 'string') meta.callsign = '';
  if (typeof meta.emblem !== 'string') meta.emblem = 'wings';
  if (!meta.patches || typeof meta.patches !== 'object') meta.patches = {};
  if (typeof meta.bossRushUnlocked !== 'boolean') meta.bossRushUnlocked = false;
  if (typeof meta.bossRushBest !== 'number') meta.bossRushBest = 0;
  if (typeof meta.slot2 !== 'boolean') meta.slot2 = false;   // F3: 2nd-special-slot unlock
  if (!meta.campaign || typeof meta.campaign !== 'object') meta.campaign = {};   // Operations Map revamp — campaign progress (heal, never wipe)
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
function jetUnlocked(key) { return devUnlockAll || !!(meta && meta.jets[key]); }
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
  return devUnlockAll || !!(meta && meta.skins[key] && meta.skins[key].indexOf(id) !== -1);
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
// SLOT-2 unlock (feature #3): one-time SP purchase that enables equipping a second special.
const SLOT2_COST = 300;               // flat SP cost to unlock the second special slot
function slot2Unlocked() { return devUnlockAll || !!(meta && meta.slot2); }   // devUnlockAll bypass (feature #4)
function buySlot2() {
  if (!meta || slot2Unlocked()) return false;
  if (meta.sp < SLOT2_COST) return false;
  meta.sp -= SLOT2_COST;
  meta.slot2 = true;
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
/* resolve a skin id → paint descriptor {color, accent, zones} for a jet (ownership-AGNOSTIC). Plain skins
   carry just colour+accent; designed skins also carry `zones` (material.name → colour) that entities.js
   applyPaint interprets for multi-zone liveries. Falls back to the jet's stock paint. */
function resolveSkinPaint(jet, id) {
  const list = SKINS[jet.id];
  if (list) {
    for (var i = 0; i < list.length; i++) {
      const sk = list[i];
      if (sk.id === id) return { color: sk.color != null ? sk.color : jet.color, accent: sk.accent != null ? sk.accent : jet.accent, zones: sk.zones || null };
    }
  }
  return { color: jet.color, accent: jet.accent, zones: null };
}
/* a jet's OWNED paint (honours the persisted skin choice). Used by gameplay (createPlayer) — NEVER reads the
   transient hangar previewSkin, so an unowned preview can never leak into a launched jet. */
function jetPaint(jet) { return resolveSkinPaint(jet, selectedSkin(jet.id)); }

/* ---------------- campaign progress (Operations Map revamp) ----------------
   Thin store-touching wrappers over the PURE cores in core.js (isOpUnlocked / isLevelUnlocked /
   levelState / markLevelCleared). `OPERATIONS` is the opmap.js data table — a global at runtime;
   these are only ever called after load order completes. meta.campaign persists inside the
   existing skystrike_meta blob (no new storage key, no version bump — healed in loadMeta). */
function campaignOpUnlocked(opId) {
  return isOpUnlocked((meta && meta.campaign) || {}, OPERATIONS, opId);
}
function campaignLevelUnlocked(opId, levelIndex) {
  return isLevelUnlocked((meta && meta.campaign) || {}, OPERATIONS, opId, levelIndex);
}
function campaignLevelState(opId, levelIndex) {
  return levelState((meta && meta.campaign) || {}, OPERATIONS, opId, levelIndex);
}
function campaignClearLevel(opId, levelIndex, levelId, score, stars) {
  if (!meta) return;
  meta.campaign = markLevelCleared(meta.campaign || {}, OPERATIONS, opId, levelIndex, score, stars, levelId);
  saveMeta();
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

/* CommonJS export for Node tests — inert in the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // pure/scoring cores
    spAward, gradeRun, evalStars, bestStars, perkCost,
    applyMetaPerks, sanitizeCallsign, emblemUnlocked,
    // meta lifecycle
    freshMeta, validMeta, loadMeta, saveMeta,
    // perk API
    perkLevel, perkMaxed, perkUnlocked, buyPerk,
    // jet/skin API
    jetUnlocked, jetCost, buyJet, skinOwned, skinCost, buySkin,
    selectedSkin, setSkin, jetPaint, resolveSkinPaint,
    // second-special-slot unlock (F3)
    slot2Unlocked, buySlot2, SLOT2_COST,
    // achievements
    achEarned, grantAch, checkAchievements,
    // campaign progress (Operations Map revamp)
    campaignOpUnlocked, campaignLevelUnlocked, campaignLevelState, campaignClearLevel,
    // tables & constants
    META_KEY, META_VERSION, STARTER_JETS, STAR_KILL_FRAC,
    META_PERKS, META_BY_ID, SKINS, ACHIEVEMENTS, EMBLEMS,
    JET_LOCK_COST, SKIN_COST,
  };
}
