/* SKYSTRIKE — rival.js: persistent nemesis rival ace. State, persistence, traits.
   Loaded after entities.js (needs aceShapePool/jetNameForShape) and before ui/main. */

const RIVAL_NAMES = ['VULTURE', 'HAVOC', 'WIDOWMAKER', 'CERBERUS', 'MANTIS', 'JACKAL', 'BARON', 'WRAITH', 'KESTREL', 'OMEN'];
const RIVAL_KEY = 'skystrike_rival';
let rival = null;            // persistent rival identity (loaded at boot)

function rivalDue(wave, lastRivalWave, enabled) {
  return !!enabled && wave >= 5 && wave % 4 !== 0 && (wave - (lastRivalWave || 0)) >= 3;
}
function rivalHpFor(wave, level) { return Math.round((170 + wave * 9) * Math.pow(1.3, level - 1)); }
function rivalPayout(level) { return 150 + 100 * level; }
function pickTrait(profile, owned) {
  const p = profile || {};
  const cand = [];
  if ((p.missiles || 0) >= (p.gunKills || 0) && (p.missiles || 0) > 0) cand.push('FLARE_WALL');
  if ((p.gunKills || 0) > (p.missiles || 0)) cand.push('SCISSORS');
  if ((p.wingmen || 0) >= 2) cand.push('HEADHUNTER');
  cand.push('VETERAN');
  for (let i = 0; i < cand.length; i++) if (owned.indexOf(cand[i]) === -1) return cand[i];
  return null;
}
function validRival(r) {
  return !!(r && typeof r.name === 'string' && typeof r.shape === 'string' &&
    typeof r.jetName === 'string' && typeof r.level === 'number' && r.level >= 1 && r.level <= 5 &&
    Array.isArray(r.traits) && Array.isArray(r.board) && r.profile && typeof r.profile === 'object');
}
function genRival(board) {
  const pool = aceShapePool();
  const shape = pool[(Math.random() * pool.length) | 0];
  return {
    name: RIVAL_NAMES[(Math.random() * RIVAL_NAMES.length) | 0],
    shape: shape, jetName: jetNameForShape(shape),
    level: 1, traits: [], profile: { missiles: 0, gunKills: 0, flares: 0, wingmen: 0 },
    encounters: 0, board: board || []
  };
}
function loadRival() {
  try {
    const r = JSON.parse(store.get(RIVAL_KEY) || 'null');
    rival = validRival(r) ? r : genRival(r && Array.isArray(r.board) ? r.board : []);
  } catch (e) { rival = genRival([]); }
}
function saveRival() { try { store.set(RIVAL_KEY, JSON.stringify(rival)); } catch (e) {} }
function rivalEscaped(profile) {
  rival.level = Math.min(5, rival.level + 1);
  rival.encounters++;
  rival.profile = profile;
  if (rival.traits.length < 3) { const t = pickTrait(profile, rival.traits); if (t) rival.traits.push(t); }
  saveRival();
}
function rivalDefeated(atWave) {
  rival.board.push({ name: rival.name, jetName: rival.jetName, level: rival.level, wave: atWave });
  if (rival.board.length > 10) rival.board.shift();
  const pay = rivalPayout(rival.level);
  rival = genRival(rival.board);
  saveRival();
  return pay;
}
function rivalSpecialFor(shape) {
  if (shape === 'J20' || shape === 'J35') return 'VOLLEY';
  if (shape === 'F47') return 'FLARESTORM';
  if (shape === 'J50' || shape === 'SU57' || shape === 'SU75') return 'GHOST';
  return 'OVERDRIVE';
}

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

/* CommonJS export for Node tests — inert in the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { rivalDue, rivalHpFor, rivalPayout, pickTrait, validRival, rivalSpecialFor, genRival, loadRival, saveRival, HOSTILE_ACES, hostileAceFor, hostileAceDeltas };
}
