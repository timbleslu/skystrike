'use strict';
// Operations objective SEQUENCES (campaign overhaul 2026-09). Every level is a scripted run of 2–3
// objective beats. PURE queue helpers come from the REAL js/core.js; the invariants run against the REAL
// OPERATIONS data (js/opmap.js) + a scrape of js/i18n.js (the tests/storage.test.js precedent — i18n.js is
// not require-safe) so a level can never reference a radio line / ally name that doesn't exist.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { nextObjectivePhase, objectiveTypes } = require('../js/core.js');
const { OPERATIONS } = require('../js/opmap.js');
const { missionForSector } = require('../js/missions.js');

// ===== nextObjectivePhase: walk the queue, -1 when exhausted =====
assert.strictEqual(nextObjectivePhase(0, 3), 1, 'phase 0 -> 1');
assert.strictEqual(nextObjectivePhase(1, 3), 2, 'phase 1 -> 2');
assert.strictEqual(nextObjectivePhase(2, 3), -1, 'last phase -> done (-1)');
assert.strictEqual(nextObjectivePhase(0, 1), -1, 'single-phase -> done immediately after it wins');
assert.strictEqual(nextObjectivePhase(5, 3), -1, 'out-of-range index -> done');

// ===== objectiveTypes: normalize string OR {type,...} descriptors to a type list =====
assert.deepStrictEqual(
  objectiveTypes(['RECON', { type: 'STRIKE', spawn: { ground: true } }, { type: 'SWEEP' }]),
  ['RECON', 'STRIKE', 'SWEEP'], 'mixes string + object descriptors');
assert.deepStrictEqual(objectiveTypes(null), [], 'null queue -> empty');
assert.deepStrictEqual(objectiveTypes([]), [], 'empty queue -> empty');

// ===== i18n scrape (EN/ZH/KO key sets) =====
const i18nSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8');
const langKeys = { EN: new Set(), ZH: new Set(), KO: new Set() };
let curLang = null;
i18nSrc.split('\n').forEach(function (line) {
  const sec = line.match(/^\s*(EN|ZH|KO)\s*:\s*\{/) || line.match(/Object\.assign\(\s*I18N\.(EN|ZH|KO)/);
  if (sec) { curLang = sec[1]; return; }
  if (!curLang) return;
  const re = /(['"])([A-Za-z0-9_.\-]+)\1\s*:/g; let m;
  while ((m = re.exec(line))) langKeys[curLang].add(m[2]);
});
const hasAll = k => ['EN', 'ZH', 'KO'].every(L => langKeys[L].has(k));

// ===== the scripted-level contract =====
const PHASE_TYPES = ['RECON', 'STEALTH', 'STRIKE', 'SWEEP', 'INTERCEPT', 'ESCORT', 'DEFEND', 'BOSS'];
const SPEAKERS = ['ovl', 'hq', 'wing', 'ally', 'enemy', 'boss'];
const HEADLINE = { FURBALL: 'SWEEP', FINAL: 'BOSS' };   // level.type → the phase type that must appear
const NAV = { RECON: 4, STEALTH: 1 };
const flyToOf = o => (o.wp != null ? o.wp : (NAV[o.type] || 0));
const budgetOk = sp => !sp || Object.keys(sp).every(k => (k === 'hostileAce' ? typeof sp[k] === 'boolean' : Number.isInteger(sp[k]) && sp[k] >= 0));
let commsKeys = 0;
const checkSay = (say, where) => {
  assert.ok(Array.isArray(say) && say.length >= 1, where + ' has at least one radio line');
  say.forEach(l => {
    assert.ok(Array.isArray(l) && SPEAKERS.includes(l[0]) && typeof l[1] === 'string', where + ' radio line is [speaker, key] (' + JSON.stringify(l) + ')');
    assert.ok(hasAll('comms.' + l[1]), where + ' radio line resolves in EN/ZH/KO: comms.' + l[1]);
    commsKeys++;
  });
};

for (const op of OPERATIONS) {
  const opTypes = new Set();
  op.levels.forEach((lvl, li) => {
    const where = op.id + '.' + lvl.id;
    const obj = lvl.objectives;
    assert.ok(Array.isArray(obj) && obj.length >= 2 && obj.length <= 3, where + ' is a scripted 2–3 beat level');
    assert.strictEqual(lvl.waves, 1, where + ' waves:1 (the sequence IS the level)');
    const types = objectiveTypes(obj);
    types.forEach(t => { assert.ok(PHASE_TYPES.includes(t), where + ' phase type is known (' + t + ')'); opTypes.add(t); });
    assert.ok(types.includes(HEADLINE[lvl.type] || lvl.type), where + ' runs its headline type (' + lvl.type + ') somewhere in ' + types.join('>'));
    // BOSS only ever closes a FINAL level
    const isLast = li === op.levels.length - 1;
    types.forEach((t, i) => { if (t === 'BOSS') assert.ok(isLast && lvl.isBoss && i === types.length - 1, where + ' BOSS is only the last beat of the FINAL level'); });
    if (lvl.isBoss) assert.strictEqual(types[types.length - 1], 'BOSS', where + ' FINAL ends on the BOSS beat (approach fight first)');
    // navigation stays short (the Req A audit cap)
    assert.ok(obj.reduce((s, o) => s + flyToOf(o), 0) <= 2, where + ' lays <=2 fly-to waypoints');
    obj.forEach((o, pi) => {
      const pw = where + ' phase ' + (pi + 1) + ' (' + o.type + ')';
      assert.notStrictEqual(missionForSector(o.type), 'none', pw + ' maps to a real mission verb');
      checkSay(o.say, pw);
      assert.ok(budgetOk(o.spawn), pw + ' spawn budget is integer counts');
      if (o.type === 'SWEEP') assert.ok(o.spawn && ((o.spawn.fighters || 0) + (o.spawn.aces || 0) + (o.spawn.hostileAce ? 1 : 0)) >= 1, pw + ' a sweep has something to sweep');
      if (o.type === 'INTERCEPT') assert.ok(o.spawn && o.spawn.bombers >= 1 && o.timer > 0, pw + ' an intercept has targets + a clock');
      if (o.type === 'ESCORT') {
        assert.ok(['truck', 'transport'].includes(o.escort), pw + ' names its escort kind');
        assert.ok(Number.isInteger(o.convoy) && o.convoy >= 1, pw + ' has a convoy size');
        if (o.required != null) assert.ok(o.required >= 1 && o.required <= o.convoy, pw + ' required deliveries within the convoy');
        if (o.label) assert.ok(hasAll('ally.name.' + o.label), pw + ' ally label resolves: ally.name.' + o.label);
      }
      if (o.type === 'DEFEND') {
        assert.ok(['outpost', 'ship'].includes(o.asset), pw + ' names its asset kind');
        assert.ok(o.hold >= 30, pw + ' has a hold clock');
        if (o.label) assert.ok(hasAll('ally.name.' + o.label), pw + ' ally label resolves: ally.name.' + o.label);
      }
      if (o.events) {
        let last = -1;
        o.events.forEach((ev, ei) => {
          assert.ok(ev.at > last, pw + ' events are in time order');
          last = ev.at;
          if (o.type === 'DEFEND') assert.ok(ev.at < o.hold, pw + ' event ' + ei + ' fires inside the hold window');
          if (o.timer) assert.ok(ev.at < o.timer, pw + ' event ' + ei + ' fires inside the phase clock');
          assert.ok(budgetOk(ev.spawn), pw + ' event budget is integer counts');
          if (ev.say) checkSay(ev.say, pw + ' event ' + ei);
        });
      }
    });
    if (lvl.boss) {
      assert.ok(hasAll(lvl.boss.introKey), where + ' boss entrance line resolves: ' + lvl.boss.introKey);
      lvl.boss.phases.forEach((ph, i) => { if (ph.say) assert.ok(hasAll('comms.' + ph.say), where + ' boss phase ' + (i + 1) + ' taunt resolves'); });
    }
  });
  assert.ok(opTypes.size >= 6, op.id + ' mixes at least 6 distinct beat types across the operation (got ' + [...opTypes].join(',') + ')');
}

console.log('objective-phases.test.js PASS (' + commsKeys + ' radio lines resolved ×3 languages)');
