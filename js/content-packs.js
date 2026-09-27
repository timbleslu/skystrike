// Content packs: pure data (validated/merged by core.js validatePack/applyContentPacks; bounds in PACK_LIMITS).
//   formations { name: { spacing, engageRange, slots: [{x,z}…] } } — FOLLOWER offsets in spacing units
//              (leader implicit at origin; +x = leader's right, +z = behind).
//   modifiers  [{ id, effects }] — effects: lockWeather('fog'|'storm') / flares / missiles / extraAces / turnMul;
//              name lives in i18n weekly.mod.<id> (+ '.d').
//   waves      [{ id, pattern: [{n, formation?}…] }] — row i drives weekly wave i's fighter count.
// New pack → `node scripts/validate-packs.mjs` + `npm test`.
var CONTENT_PACKS = [
  {
    id: 'vanguard-geometry',
    version: 1,
    formations: {
      diamond: { spacing: 200, engageRange: 1200, slots: [{ x: 1, z: 1 }, { x: -1, z: 1 }, { x: 0, z: 2 }] },
      spear:   { spacing: 170, engageRange: 1200, slots: [{ x: 0.8, z: 0.9 }, { x: -0.8, z: 0.9 }, { x: 1.6, z: 1.8 }, { x: -1.6, z: 1.8 }, { x: 0, z: 2.6 }] },
      phalanx: { spacing: 230, engageRange: 1300, slots: [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 2, z: 0.4 }, { x: -2, z: 0.4 }, { x: 3, z: 0.8 }, { x: -3, z: 0.8 }] },
    },
    modifiers: [],
    waves: [
      { id: 'vanguardLadder', pattern: [{ n: 4, formation: 'diamond' }, { n: 5, formation: 'spear' }, { n: 6 }, { n: 7, formation: 'phalanx' }, { n: 8, formation: 'pincer' }] },
    ],
  },
  {
    id: 'iron-skies',
    version: 1,
    formations: {},
    modifiers: [
      { id: 'fogBank',   effects: { lockWeather: 'fog' } },
      { id: 'lastFlare', effects: { flares: 1 } },
      { id: 'oneShot',   effects: { missiles: 1 } },
      { id: 'aceSeason', effects: { extraAces: 2 } },
    ],
    waves: [],
  },
  {
    id: 'gauntlet-lines',
    version: 1,
    formations: {
      column: { spacing: 210, engageRange: 1100, slots: [{ x: 0, z: 1 }, { x: 0, z: 2 }, { x: 0, z: 3 }] },
    },
    modifiers: [],
    waves: [
      { id: 'columnCrawl', pattern: [{ n: 3, formation: 'column' }, { n: 5, formation: 'column' }, { n: 6, formation: 'vee' }, { n: 8, formation: 'wall' }, { n: 10, formation: 'column' }] },
    ],
  },
];
if (typeof module !== 'undefined' && module.exports) module.exports = { CONTENT_PACKS };
