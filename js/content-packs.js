// === CF content-factory: CONTENT PACKS ===
// Versioned, pure-DATA content drops: new enemy formations, weekly-challenge modifiers, and weekly
// wave patterns. NO logic here — validation/merge is core.js (validatePack/applyContentPacks),
// runtime merge happens in globals.js (→ packRuntime). Require-safe like roster.js: no THREE/store/
// DOM. tests/content-packs.test.js requires this file and asserts every shipped pack validates.
//
// Pack schema (version 1, bounds in core.js PACK_LIMITS):
//   id         3-40 char kebab slug, unique
//   formations { name: { spacing, engageRange, slots: [{x,z}…] } } — slots are FOLLOWER offsets in
//              SPACING UNITS (leader implicit at the origin; +x = leader's right, +z = behind).
//              formationSlots repeats the template one depth further back when a wave outgrows it.
//   modifiers  [{ id, effects }] — effects keys: lockWeather('fog'|'storm') / flares / missiles /
//              extraAces / turnMul. Player-facing name lives in i18n: weekly.mod.<id> (+ '.d').
//   waves      [{ id, pattern: [{n, formation?}…] }] — weekly runs pick one per week; row i drives
//              wave i's fighter count (+ optional pinned formation), then normal cadence resumes.
//
// Authoring flow: add a candidate pack → `node scripts/validate-packs.mjs` (rejects malformed/
// impossible packs) → `npm test` must stay green → new modifier ids need EN+ZH+KO i18n entries.
var CONTENT_PACKS = [
  {
    // Candidate A — formation geometry drop: three new shapes + a ladder that shows them off.
    id: 'vanguard-geometry',
    version: 1,
    formations: {
      // classic 4-ship diamond: paired mid flankers + a trailer sealing the box
      diamond: { spacing: 200, engageRange: 1200, slots: [{ x: 1, z: 1 }, { x: -1, z: 1 }, { x: 0, z: 2 }] },
      // tight arrowhead: two nested vee ranks + a centreline trailer, denser than the base vee
      spear:   { spacing: 170, engageRange: 1200, slots: [{ x: 0.8, z: 0.9 }, { x: -0.8, z: 0.9 }, { x: 1.6, z: 1.8 }, { x: -1.6, z: 1.8 }, { x: 0, z: 2.6 }] },
      // broad shallow crescent: a wall whose tips sweep back — reads as an enveloping front
      phalanx: { spacing: 230, engageRange: 1300, slots: [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 2, z: 0.4 }, { x: -2, z: 0.4 }, { x: 3, z: 0.8 }, { x: -3, z: 0.8 }] },
    },
    modifiers: [],
    waves: [
      { id: 'vanguardLadder', pattern: [{ n: 4, formation: 'diamond' }, { n: 5, formation: 'spear' }, { n: 6 }, { n: 7, formation: 'phalanx' }, { n: 8, formation: 'pincer' }] },
    ],
  },
  {
    // Candidate B — weekly-modifier drop: four new run-start handicaps on the shared effect knobs.
    id: 'iron-skies',
    version: 1,
    formations: {},
    modifiers: [
      { id: 'fogBank',   effects: { lockWeather: 'fog' } },   // the sky is locked to dense fog all week
      { id: 'lastFlare', effects: { flares: 1 } },            // one flare for the whole run — spend it well
      { id: 'oneShot',   effects: { missiles: 1 } },          // a single missile — every launch must count
      { id: 'aceSeason', effects: { extraAces: 2 } },         // two extra aces join every wave
    ],
    waves: [],
  },
  {
    // Candidate C — pressure-line drop: a strung-out trail formation + a gauntlet that leans on it.
    id: 'gauntlet-lines',
    version: 1,
    formations: {
      // single-file trail line behind the leader — a strafing queue begging to be raked end-to-end
      column: { spacing: 210, engageRange: 1100, slots: [{ x: 0, z: 1 }, { x: 0, z: 2 }, { x: 0, z: 3 }] },
    },
    modifiers: [],
    waves: [
      { id: 'columnCrawl', pattern: [{ n: 3, formation: 'column' }, { n: 5, formation: 'column' }, { n: 6, formation: 'vee' }, { n: 8, formation: 'wall' }, { n: 10, formation: 'column' }] },
    ],
  },
];
if (typeof module !== 'undefined' && module.exports) module.exports = { CONTENT_PACKS };
// === end CF content-packs ===
