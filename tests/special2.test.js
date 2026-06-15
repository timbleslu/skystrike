'use strict';
// 2nd equippable SPECIAL slot (feature #3). Pure cores only — the equippable pool, the cooldown-max
// lookup, and the slot-ready gate. Effect application (THREE/spawn/DOM) lives in combat.js and is NOT
// tested here. Imported from the real implementation in js/core.js (no mirror copy).
const assert = require('assert');
const {
  equippableSpecials, isEquippableSpecial, specialCooldownMax, specialSlotReady,
} = require('../js/core.js');

// A trimmed roster mirroring the real shape: FT-1 has a null ability; the rest carry one.
const ROSTER = [
  { id: 'FT-1', ability: null },
  { id: 'F-22', ability: 'OVERDRIVE' },
  { id: 'SU-57', ability: 'COBRA' },
  { id: 'J-20', ability: 'EMP PULSE' },
  { id: 'F-35', ability: 'STEALTH FIELD' },
];
const CD = { 'F-22': 15, 'SU-57': 15, 'J-20': 18, 'F-35': 18 };

// ===== equippableSpecials: excludes FT-1 null ability + locked jets + the current jet =====
(() => {
  // Everything unlocked, flying F-22 → pool = the other ability-carrying jets (no FT-1, no F-22).
  const unlocked = ['FT-1', 'F-22', 'SU-57', 'J-20', 'F-35'];
  const pool = equippableSpecials(unlocked, ROSTER, 'F-22');
  const ids = pool.map(p => p.id);
  assert.deepStrictEqual(ids, ['SU-57', 'J-20', 'F-35'], 'pool = unlocked others with a real ability');
  assert.ok(!ids.includes('FT-1'), 'FT-1 null ability is never equippable');
  assert.ok(!ids.includes('F-22'), 'the current jet (slot 1) is excluded from slot 2');
  assert.strictEqual(pool[0].name, 'COBRA', 'pool entries carry the ability name');
})();

// locked jets are excluded even if they have an ability
(() => {
  const unlocked = ['FT-1', 'F-22', 'SU-57']; // J-20, F-35 NOT unlocked
  const ids = equippableSpecials(unlocked, ROSTER, 'F-22').map(p => p.id);
  assert.deepStrictEqual(ids, ['SU-57'], 'only unlocked others appear');
  assert.ok(!ids.includes('J-20') && !ids.includes('F-35'), 'locked jets excluded');
})();

// flying a jet with NO native special (FT-1) still offers all unlocked ability jets
(() => {
  const unlocked = ['FT-1', 'F-22', 'SU-57'];
  const ids = equippableSpecials(unlocked, ROSTER, 'FT-1').map(p => p.id);
  assert.deepStrictEqual(ids, ['F-22', 'SU-57'], 'FT-1 has no slot-1 ability to exclude');
})();

// accepts a {id:true} map for unlocked just like the array form
(() => {
  const map = { 'F-22': true, 'SU-57': true };
  const ids = equippableSpecials(map, ROSTER, 'F-22').map(p => p.id);
  assert.deepStrictEqual(ids, ['SU-57'], 'map form yields the same pool as the array form');
})();

// ===== isEquippableSpecial: validates a saved/chosen equip against the live pool =====
(() => {
  const unlocked = ['F-22', 'SU-57', 'J-20'];
  assert.strictEqual(isEquippableSpecial('SU-57', unlocked, ROSTER, 'F-22'), true, 'unlocked other ability = equippable');
  assert.strictEqual(isEquippableSpecial('F-22', unlocked, ROSTER, 'F-22'), false, 'current jet not equippable');
  assert.strictEqual(isEquippableSpecial('F-35', unlocked, ROSTER, 'F-22'), false, 'locked jet not equippable');
  assert.strictEqual(isEquippableSpecial('FT-1', unlocked, ROSTER, 'F-22'), false, 'null-ability jet not equippable');
  assert.strictEqual(isEquippableSpecial(null, unlocked, ROSTER, 'F-22'), false, 'null id (empty slot) not equippable');
  assert.strictEqual(isEquippableSpecial('', unlocked, ROSTER, 'F-22'), false, 'empty-string id not equippable');
})();

// ===== specialCooldownMax: per-id table lookup with a sane fallback (NO tech mods here) =====
(() => {
  assert.strictEqual(specialCooldownMax('J-20', CD, 15), 18, 'reads the per-id cooldown from the table');
  assert.strictEqual(specialCooldownMax('F-22', CD, 15), 15, 'reads F-22 cooldown');
  assert.strictEqual(specialCooldownMax('UNKNOWN', CD, 15), 15, 'unknown id falls back to the default');
  assert.strictEqual(specialCooldownMax(null, CD, 15), 15, 'null id falls back to the default');
  assert.strictEqual(specialCooldownMax('J-20', null, 15), 15, 'missing table falls back to the default');
})();

// ===== specialSlotReady: an equipped slot fires only when fully recharged; empty slot never fires =====
(() => {
  assert.strictEqual(specialSlotReady({ id: 'J-20', cd: 0, max: 18 }), true, 'equipped + cd<=0 is ready');
  assert.strictEqual(specialSlotReady({ id: 'J-20', cd: -0.1, max: 18 }), true, 'cd just past zero is ready');
  assert.strictEqual(specialSlotReady({ id: 'J-20', cd: 4.2, max: 18 }), false, 'mid-cooldown is NOT ready');
  assert.strictEqual(specialSlotReady({ id: null, cd: 0, max: 15 }), false, 'empty slot (no id) is never ready');
  assert.strictEqual(specialSlotReady(null), false, 'missing slot object is never ready');
})();

// ===== an unequipped / unknown slot-2 id yields an empty (inert) slot, no effect =====
(() => {
  // What startGame's equip resolver does: validate, then either equip or leave empty.
  function resolveSlot2(id, unlocked, currentJetId) {
    return isEquippableSpecial(id, unlocked, ROSTER, currentJetId)
      ? { id: id, cd: 0, max: specialCooldownMax(id, CD, 15) }
      : { id: null, cd: 0, max: 15 };
  }
  const unlocked = ['F-22', 'SU-57'];
  // stale equip: J-20 not unlocked → slot clears to empty/inert
  let s = resolveSlot2('J-20', unlocked, 'F-22');
  assert.strictEqual(s.id, null, 'stale (locked) equip resolves to an empty slot');
  assert.strictEqual(specialSlotReady(s), false, 'empty resolved slot never fires');
  // valid equip → live slot with the right cooldown
  s = resolveSlot2('SU-57', unlocked, 'F-22');
  assert.strictEqual(s.id, 'SU-57', 'valid equip resolves to a live slot');
  assert.strictEqual(s.max, 15, 'live slot carries the per-id cooldown max');
  assert.strictEqual(specialSlotReady(s), true, 'a freshly equipped slot (cd 0) is ready');
})();

console.log('ALL TESTS PASS');
