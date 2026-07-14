// CF content-factory — validatePack / applyContentPacks / weeklyEffectsFor / weeklyWavePattern /
// the formationSlots template branch, PLUS the shipped js/content-packs.js candidates: every
// shipped pack must validate, and every shipped pack modifier must have EN+ZH+KO i18n entries.
const assert = require('assert');
const {
  FORMATIONS, formationSlots, WEEKLY_MODIFIERS, weeklyModifiers,
  validatePack, applyContentPacks, weeklyEffectsFor, weeklyWavePattern,
} = require('../js/core.js');
const { CONTENT_PACKS } = require('../js/content-packs.js');

const baseIds = WEEKLY_MODIFIERS.map(m => m.id);
const freshForms = () => JSON.parse(JSON.stringify(FORMATIONS));

// ===== shipped packs: every candidate validates + merges cleanly =====
{
  const forms = freshForms();
  const rt = applyContentPacks(CONTENT_PACKS, forms, WEEKLY_MODIFIERS);
  assert.strictEqual(rt.rejected.length, 0, 'no shipped pack is rejected: ' + JSON.stringify(rt.rejected));
  assert.strictEqual(rt.applied.length, CONTENT_PACKS.length, 'every shipped pack applies');
  assert.ok(forms.diamond && forms.spear && forms.phalanx && forms.column, 'pack formations merged');
  assert.ok(FORMATIONS.vee && !FORMATIONS.diamond, 'merge mutates only the passed table, not the base');
  assert.strictEqual(rt.modPool.length, WEEKLY_MODIFIERS.length + 4, 'weekly pool extended by the 4 iron-skies modifiers');
  assert.strictEqual(rt.wavePatterns.length, 2, 'both wave patterns collected');
}

// ===== validatePack: malformed / impossible candidates are rejected =====
{
  const forms = freshForms();
  const bad = (over) => Object.assign({ id: 'bad-pack', version: 1, formations: {}, modifiers: [], waves: [] }, over);
  const v = (p) => validatePack(p, forms, baseIds);
  assert.ok(!v(null).ok, 'non-object rejected');
  assert.ok(!v(bad({})).ok, 'empty pack rejected');
  assert.ok(!v(bad({ id: 'Bad Pack!', modifiers: [{ id: 'x', effects: { flares: 0 } }] })).ok, 'non-slug id rejected');
  assert.ok(!v(bad({ version: 2, modifiers: [{ id: 'x', effects: { flares: 0 } }] })).ok, 'unknown schema version rejected');
  assert.ok(!v(bad({ formations: { vee: { spacing: 200, engageRange: 1200, slots: [{ x: 1, z: 1 }] } } })).ok, 'base-formation id collision rejected');
  assert.ok(!v(bad({ formations: { tight: { spacing: 20, engageRange: 1200, slots: [{ x: 1, z: 1 }] } } })).ok, 'spacing under the floor rejected');
  assert.ok(!v(bad({ formations: { farfar: { spacing: 200, engageRange: 9000, slots: [{ x: 1, z: 1 }] } } })).ok, 'engageRange over the cap rejected');
  assert.ok(!v(bad({ formations: { overlap: { spacing: 200, engageRange: 1200, slots: [{ x: 1, z: 1 }, { x: 1.1, z: 1 }] } } })).ok, 'overlapping slots rejected');
  assert.ok(!v(bad({ formations: { origin: { spacing: 200, engageRange: 1200, slots: [{ x: 0.1, z: 0.1 }] } } })).ok, 'slot on the leader rejected');
  assert.ok(!v(bad({ formations: { nan: { spacing: 200, engageRange: 1200, slots: [{ x: NaN, z: 1 }] } } })).ok, 'NaN offset rejected');
  assert.ok(!v(bad({ modifiers: [{ id: 'stormFront', effects: { flares: 0 } }] })).ok, 'base modifier id collision rejected');
  assert.ok(!v(bad({ modifiers: [{ id: 'x', effects: { invulnerable: true } }] })).ok, 'unknown effect key rejected');
  assert.ok(!v(bad({ modifiers: [{ id: 'x', effects: {} }] })).ok, 'empty effects rejected');
  assert.ok(!v(bad({ modifiers: [{ id: 'x', effects: { lockWeather: 'clear' } }] })).ok, 'lockWeather clear (a buff) rejected');
  assert.ok(!v(bad({ modifiers: [{ id: 'x', effects: { turnMul: 1.5 } }] })).ok, 'turnMul buff rejected');
  assert.ok(!v(bad({ modifiers: [{ id: 'x', effects: { flares: 2.5 } }] })).ok, 'fractional ordnance rejected');
  assert.ok(!v(bad({ waves: [{ id: 'w', pattern: [{ n: 99 }] }] })).ok, 'wave count over WAVE_COUNT_CAP rejected');
  assert.ok(!v(bad({ waves: [{ id: 'w', pattern: [{ n: 4, formation: 'ghost' }] }] })).ok, 'unknown wave formation ref rejected');
  assert.ok(!v(bad({ waves: [{ id: 'w', pattern: [] }] })).ok, 'empty wave pattern rejected');
  // packs are self-contained: a wave row may reference a formation defined in the SAME pack
  assert.ok(v(bad({ formations: { ring: { spacing: 200, engageRange: 1200, slots: [{ x: 1, z: 1 }] } }, waves: [{ id: 'w', pattern: [{ n: 4, formation: 'ring' }] }] })).ok, 'same-pack formation ref accepted');
}

// ===== applyContentPacks: all-or-nothing per pack + duplicate pack ids =====
{
  const forms = freshForms();
  const good = { id: 'ok-pack', version: 1, formations: { ring: { spacing: 200, engageRange: 1200, slots: [{ x: 1, z: 1 }] } }, modifiers: [], waves: [] };
  const halfBad = { id: 'half-bad', version: 1, formations: { fine: { spacing: 200, engageRange: 1200, slots: [{ x: 1, z: 1 }] } }, modifiers: [{ id: 'x', effects: { nope: 1 } }], waves: [] };
  const rt = applyContentPacks([good, good, halfBad], forms, WEEKLY_MODIFIERS);
  assert.deepStrictEqual(rt.applied, ['ok-pack'], 'duplicate pack id + broken pack rejected');
  assert.strictEqual(rt.rejected.length, 2);
  assert.ok(forms.ring, 'valid pack merged');
  assert.ok(!forms.fine, 'a rejected pack contributes NOTHING (all-or-nothing)');
  assert.strictEqual(rt.modPool.length, WEEKLY_MODIFIERS.length, 'no modifiers leak from a rejected pack');
}

// ===== formationSlots: template branch (pack formations), base generators untouched =====
{
  const forms = freshForms();
  applyContentPacks(CONTENT_PACKS, forms, WEEKLY_MODIFIERS);
  FORMATIONS.diamond = forms.diamond;   // graft the merged entry onto the shared table for the test
  const s4 = formationSlots('diamond', 4, FORMATIONS.diamond.spacing);
  assert.deepStrictEqual(s4, [{ x: 0, z: 0 }, { x: 200, z: 200 }, { x: -200, z: 200 }, { x: 0, z: 400 }], '4-ship diamond = leader + exact scaled template');
  const s8 = formationSlots('diamond', 8, 200);
  assert.strictEqual(s8.length, 8, 'oversize wave still fills every slot');
  assert.deepStrictEqual(s8[4], { x: 200, z: (1 + 3) * 200 }, 'wrap repeats the template one template-depth (maxZ+1) further back');
  assert.deepStrictEqual(formationSlots('diamond', 4, 100)[1], { x: 100, z: 100 }, 'spacing scales the template');
  delete FORMATIONS.diamond;
  assert.strictEqual(formationSlots('vee', 6, 100).length, 6, 'base generators untouched');
}

// ===== weeklyEffectsFor: merge rules =====
{
  assert.deepStrictEqual(weeklyEffectsFor(['noFlares', 'heavyWing'], WEEKLY_MODIFIERS), { flares: 0, turnMul: 0.6 });
  const pool = WEEKLY_MODIFIERS.concat([{ id: 'aceSeason', effects: { extraAces: 2 } }, { id: 'lastFlare', effects: { flares: 1 } }]);
  assert.strictEqual(weeklyEffectsFor(['doubleAces', 'aceSeason'], pool).extraAces, 3, 'extraAces SUM');
  assert.strictEqual(weeklyEffectsFor(['noFlares', 'lastFlare'], pool).flares, 0, 'flares take the MIN (harsher wins)');
  assert.deepStrictEqual(weeklyEffectsFor([], pool), {}, 'no ids → no effects');
}

// ===== weeklyModifiers: extended-pool draw stays deterministic; default arg = base table =====
{
  const pool = WEEKLY_MODIFIERS.concat([{ id: 'fogBank', effects: { lockWeather: 'fog' } }]);
  const a = weeklyModifiers(12345, pool), b = weeklyModifiers(12345, pool);
  assert.deepStrictEqual(a.map(m => m.id), b.map(m => m.id), 'deterministic with a custom pool');
  assert.strictEqual(a.length, 2);
  assert.notStrictEqual(a[0].id, a[1].id, 'two DISTINCT modifiers');
  a.forEach(m => assert.ok(pool.some(p => p.id === m.id), 'picks come from the pool'));
  weeklyModifiers(777).forEach(m => assert.ok(baseIds.indexOf(m.id) >= 0, 'no pool arg → base table (regression)'));
}

// ===== weeklyWavePattern: deterministic pick, null when none =====
{
  assert.strictEqual(weeklyWavePattern(42, []), null);
  assert.strictEqual(weeklyWavePattern(42, null), null);
  const pats = [{ id: 'a', pattern: [{ n: 3 }] }, { id: 'b', pattern: [{ n: 4 }] }];
  assert.strictEqual(weeklyWavePattern(42, pats), weeklyWavePattern(42, pats), 'deterministic');
  assert.ok(pats.indexOf(weeklyWavePattern(42, pats)) >= 0, 'pick comes from the shipped patterns');
}

// ===== i18n: every shipped pack modifier has name + desc in EN + ZH + KO =====
{
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../js/i18n.js'), 'utf8');
  for (const pk of CONTENT_PACKS) for (const m of (pk.modifiers || [])) {
    for (const suffix of ['', '.d']) {
      const key = "'weekly.mod." + m.id + suffix + "':";
      const hits = src.split(key).length - 1;
      assert.strictEqual(hits, 3, key + ' must appear in EN+ZH+KO (found ' + hits + ')');
    }
  }
}

console.log('content-packs.test.js PASS');
