'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

/* ----------------------------------------------------------------------------
   Mirrors of js/opmap.js scripted set-piece PURE helpers (F14).
   Keep byte-identical with the source between the MIRROR markers. Set-pieces
   are AUTHORED encounters bound to fixed campaign coordinates (sector type +
   stage index) — deterministic, so the same campaign node always triggers the
   same scripted event. No THREE / DOM here.
---------------------------------------------------------------------------- */

// ---- BEGIN MIRROR (js/opmap.js setpiece core) ----
// Authored encounters as DATA. `mission` reuses the existing typed-mission seam
// (missions.js) so each set-piece resolves through onMissionResolved's win/fail.
// `ground` reuses queueStrikeSite's fortified SAM/AAA/convoy. i18n keys carry the
// localized name + intro/outro lines. `convoy`/`bombers` tune the authored spawns.
const SETPIECES = {
  // outrun a wall of SAMs: a fortified ground site IS the objective (strike it).
  samCorridor: { mission: 'strike',    ground: true,  bombers: 0, convoy: 0, name: 'setpiece.samCorridor', intro: 'setpiece.samCorridor.intro', outro: 'setpiece.samCorridor.outro' },
  // shepherd a friendly bomber wing out through SAM lanes (escort + ground threat).
  bomberRun:   { mission: 'escort',    ground: true,  bombers: 0, convoy: 4, name: 'setpiece.bomberRun',   intro: 'setpiece.bomberRun.intro',   outro: 'setpiece.bomberRun.outro' },
  // thread a carrier group's screen of interceptors (no ground; pure air gauntlet).
  carrier:     { mission: 'intercept', ground: false, bombers: 5, convoy: 0, name: 'setpiece.carrier',     intro: 'setpiece.carrier.intro',     outro: 'setpiece.carrier.outro' },
};

// PURE + deterministic: which authored set-piece (if any) a campaign node triggers.
// Keyed on (sector type, stage index) against the FIXED genOpMap campaign, so a given
// run's node always plays the same scripted event. Returns an id into SETPIECES or null.
// 1–2 per campaign: STRIKE @ stage 1 = the SAM corridor; ESCORT @ stage 4 = the bomber run.
function setpieceFor(type, stage) {
  if (type === 'STRIKE' && stage === 1) return 'samCorridor';
  if (type === 'ESCORT' && stage === 4) return 'bomberRun';
  return null;
}

// PURE: fold an authored encounter onto a base sector plan. Overrides the mission
// descriptor + ground flag + bomber/convoy counts the script needs, tags `setpiece`,
// and leaves the base plan's weather/tod/hostileAce/etc. untouched. Returns a NEW plan.
function setpiecePlan(id, base) {
  const sp = SETPIECES[id];
  if (!sp) return base;
  const p = {};
  for (const k in base) p[k] = base[k];
  p.mission = sp.mission;
  p.ground = sp.ground;
  p.bombers = sp.bombers;
  p.setpiece = id;
  p.convoy = sp.convoy;
  p.boss = false;
  return p;
}

// PURE: an authored encounter resolves through the SAME mission win/fail seam; map
// the outcome to the localized outro/fail banner key. Win -> the encounter's outro;
// loss -> the shared objective-failed line.
function setpieceOutcome(id, won) {
  const sp = SETPIECES[id];
  if (won) return sp ? sp.outro : 'banner.missionComplete';
  return 'banner.missionFailedObj';
}
// ---- END MIRROR ----

// --- deterministic node -> encounter mapping ---
assert.strictEqual(setpieceFor('STRIKE', 1), 'samCorridor', 'STRIKE @ stage 1 is the SAM corridor');
assert.strictEqual(setpieceFor('ESCORT', 4), 'bomberRun', 'ESCORT @ stage 4 is the bomber run');
// same coordinates always resolve the same way (pure + stable)
assert.strictEqual(setpieceFor('STRIKE', 1), setpieceFor('STRIKE', 1), 'selection is deterministic');
// non-authored nodes never trigger a set-piece (procedural sectors untouched)
assert.strictEqual(setpieceFor('STRIKE', 4), null, 'STRIKE at the wrong stage is procedural');
assert.strictEqual(setpieceFor('ESCORT', 1), null, 'ESCORT at the wrong stage is procedural');
assert.strictEqual(setpieceFor('FURBALL', 0), null, 'FURBALL is always procedural');
assert.strictEqual(setpieceFor('INTERCEPT', 1), null, 'INTERCEPT is always procedural');
assert.strictEqual(setpieceFor('DEFEND', 2), null, 'DEFEND is always procedural');
assert.strictEqual(setpieceFor('DEPOT', 3), null, 'DEPOT is always procedural');
assert.strictEqual(setpieceFor('FINAL', 6), null, 'FINAL stays the boss, not a set-piece');

// exactly two authored campaign nodes across the whole fixed map (1–2 per campaign)
const STAGES = [
  ['FURBALL', 'INTERCEPT'],
  ['STRIKE', 'ESCORT'],
  ['DEFEND', 'FURBALL'],
  ['DEPOT', 'INTERCEPT'],
  ['ESCORT', 'STRIKE'],
  ['ELITE', 'DEFEND'],
  ['FINAL'],
];
let authored = 0;
for (let s = 0; s < STAGES.length; s++) {
  for (let i = 0; i < STAGES[s].length; i++) {
    if (setpieceFor(STAGES[s][i], s)) authored++;
  }
}
assert.strictEqual(authored, 2, 'exactly two authored set-piece nodes in the campaign');

// every authored id resolves to a real SETPIECES entry
['samCorridor', 'bomberRun'].forEach(function (id) {
  assert.ok(SETPIECES[id], 'authored id ' + id + ' has a data entry');
  assert.ok(SETPIECES[id].name && SETPIECES[id].intro && SETPIECES[id].outro, 'set-piece ' + id + ' carries name/intro/outro i18n keys');
  assert.ok(['sweep', 'intercept', 'escort', 'defend', 'strike'].indexOf(SETPIECES[id].mission) !== -1, 'set-piece ' + id + ' uses a real mission type');
});

// --- setpiecePlan folds the encounter onto a base plan without mutating it ---
const base = { fighters: 3, aces: 0, bombers: 9, ground: false, boss: false, rival: false, depot: false, hostileAce: true, mission: 'sweep', weather: 'storm', tod: 1 };
const corridor = setpiecePlan('samCorridor', base);
assert.strictEqual(corridor.mission, 'strike', 'SAM corridor flies the strike objective');
assert.strictEqual(corridor.ground, true, 'SAM corridor brings the ground site');
assert.strictEqual(corridor.setpiece, 'samCorridor', 'plan is tagged with the encounter id');
assert.strictEqual(corridor.weather, 'storm', 'base weather is preserved');
assert.strictEqual(corridor.tod, 1, 'base tod is preserved');
assert.strictEqual(corridor.hostileAce, true, 'base hostileAce is preserved');
assert.strictEqual(base.mission, 'sweep', 'base plan is NOT mutated (pure fold)');
assert.strictEqual(base.bombers, 9, 'base plan bombers untouched');

const bomber = setpiecePlan('bomberRun', base);
assert.strictEqual(bomber.mission, 'escort', 'bomber run flies the escort objective');
assert.strictEqual(bomber.convoy, 4, 'bomber run shepherds a 4-unit convoy');
assert.strictEqual(bomber.ground, true, 'bomber run runs the SAM lanes');
assert.strictEqual(bomber.setpiece, 'bomberRun', 'plan tagged with bomberRun');

// unknown id is a no-op fold (returns base untouched)
assert.strictEqual(setpiecePlan('nope', base), base, 'unknown encounter id leaves the base plan alone');

// --- resolution rides the shared mission win/fail seam ---
assert.strictEqual(setpieceOutcome('samCorridor', true), 'setpiece.samCorridor.outro', 'SAM corridor win shows its outro');
assert.strictEqual(setpieceOutcome('bomberRun', true), 'setpiece.bomberRun.outro', 'bomber run win shows its outro');
assert.strictEqual(setpieceOutcome('samCorridor', false), 'banner.missionFailedObj', 'a lost set-piece uses the shared fail banner');
assert.strictEqual(setpieceOutcome('bomberRun', false), 'banner.missionFailedObj', 'a lost set-piece uses the shared fail banner');

// --- the mirror above MUST stay byte-identical with js/opmap.js (drift fails here) ---
(function () {
  const MK = '// ---- BEGIN MIRROR (js/opmap.js setpiece core) ----';
  const EK = '// ---- END MIRROR ----';
  function block(src) { const a = src.indexOf(MK); const b = src.indexOf(EK, a); return src.slice(a + MK.length, b); }
  const here = fs.readFileSync(__filename, 'utf8');
  const there = fs.readFileSync(path.join(__dirname, '..', 'js', 'opmap.js'), 'utf8');
  assert.strictEqual(block(here), block(there), 'setpiece MIRROR block is byte-identical with js/opmap.js source');
})();

console.log('ok - setpiece: deterministic node->encounter mapping, plan fold is pure, win/fail resolution');
