'use strict';
// Screen router (js/nav.js) — asserts SCREENS table integrity + the pure navPlan transition logic.
// nav.js is require-safe: the table is pure data and DOM/state application lives inside functions that
// are never called at load, so requiring it here touches no browser globals.
const assert = require('assert');
const { SCREENS, navPlan } = require('../js/nav.js');

const STATES = new Set(['hangar', 'playing', 'dead']);
const TOUCH = new Set(['show', 'hide']);
const ENTRY = new Set(['router', 'manual']);

/* ===== table integrity ===== */
const names = Object.keys(SCREENS);
assert.ok(names.length >= 8, 'table has the routed screens (>=8)');
assert.strictEqual(names.length, new Set(names).size, 'screen names are unique');

const seenPanels = new Set();
let invertedCount = 0;
let nullPanelCount = 0;
for (const name of names) {
  const row = SCREENS[name];
  assert.ok(row && typeof row === 'object', name + ': row is an object');
  // panel: a non-empty string (an overlay id) OR null (the panel-less flight screen)
  assert.ok(row.panel === null || (typeof row.panel === 'string' && row.panel.length > 0),
    name + ': panel is a non-empty string or null');
  if (row.panel === null) { nullPanelCount++; }
  else {
    assert.ok(!seenPanels.has(row.panel), name + ': panel id "' + row.panel + '" is unique across rows');
    seenPanels.add(row.panel);
  }
  // state: a valid game state or null (leave state alone)
  assert.ok(row.state === null || STATES.has(row.state), name + ': state is a valid state or null');
  // touch: show | hide | null
  assert.ok(row.touch === null || TOUCH.has(row.touch), name + ': touch is show|hide|null');
  // inverted: boolean
  assert.strictEqual(typeof row.inverted, 'boolean', name + ': inverted is a boolean');
  if (row.inverted) invertedCount++;
  // entry: router | manual
  assert.ok(ENTRY.has(row.entry), name + ': entry is router|manual');
}
assert.strictEqual(invertedCount, 1, 'exactly one inverted screen (the hangar)');
assert.ok(SCREENS.hangar && SCREENS.hangar.inverted === true, 'the hangar is the inverted screen');
assert.ok(nullPanelCount <= 1, 'at most one panel-less screen (playing)');

// the eight full-screen flow screens the router drives must exist
for (const s of ['hangar', 'playing', 'gameover', 'opsSelect', 'opLore', 'levelMap', 'briefing', 'levelCleared']) {
  assert.ok(SCREENS[s], 'routed screen "' + s + '" is present');
  assert.strictEqual(SCREENS[s].entry, 'router', s + ' is a router-entry screen');
}
// the two menu overlays are present and flagged manual-entry (hand-rolled, hideAllScreens-managed)
for (const s of ['modeChoice', 'endlessSetup']) {
  assert.ok(SCREENS[s], 'menu overlay "' + s + '" is present');
  assert.strictEqual(SCREENS[s].entry, 'manual', s + ' is a manual-entry overlay');
}
// spot-check the encoded per-screen semantics that must stay byte-exact to preserve behaviour
assert.strictEqual(SCREENS.playing.state, 'playing', 'playing writes state=playing');
assert.strictEqual(SCREENS.playing.panel, null, 'playing has no overlay panel');
assert.strictEqual(SCREENS.playing.touch, 'show', 'playing shows touch controls');
assert.strictEqual(SCREENS.gameover.state, 'dead', 'gameover writes state=dead');
assert.strictEqual(SCREENS.gameover.touch, 'hide', 'gameover hides touch controls');
assert.strictEqual(SCREENS.hangar.state, 'hangar', 'hangar writes state=hangar');
assert.strictEqual(SCREENS.hangar.touch, 'hide', 'hangar hides touch controls');

/* ===== pure navPlan transition logic ===== */
// hangar -> playing: hide the (inverted) hangar, show nothing (panel-less), write playing, show touch
(function () {
  const p = navPlan(SCREENS.hangar, SCREENS.playing);
  assert.deepStrictEqual(p.hide, { panel: 'hangar', inverted: true }, 'hangar->playing hides the inverted hangar');
  assert.strictEqual(p.show, null, 'hangar->playing shows no panel (flight has none)');
  assert.strictEqual(p.state, 'playing', 'hangar->playing writes state=playing');
  assert.strictEqual(p.touch, 'show', 'hangar->playing touch=show');
})();

// playing -> gameover: nothing to hide (playing is panel-less), show gameover, write dead, hide touch
(function () {
  const p = navPlan(SCREENS.playing, SCREENS.gameover);
  assert.strictEqual(p.hide, null, 'playing->gameover hides nothing (playing panel-less)');
  assert.deepStrictEqual(p.show, { panel: 'gameover', inverted: false }, 'playing->gameover shows #gameover');
  assert.strictEqual(p.state, 'dead', 'playing->gameover writes state=dead');
  assert.strictEqual(p.touch, 'hide', 'playing->gameover touch=hide');
})();

// campaign nav swap: opsSelect -> opLore hides one overlay and shows the next, touching neither state nor touch
(function () {
  const p = navPlan(SCREENS.opsSelect, SCREENS.opLore);
  assert.deepStrictEqual(p.hide, { panel: 'opsSelect', inverted: false }, 'opsSelect->opLore hides #opsSelect');
  assert.deepStrictEqual(p.show, { panel: 'opLore', inverted: false }, 'opsSelect->opLore shows #opLore');
  assert.strictEqual(p.state, null, 'campaign-nav swap leaves state alone');
  assert.strictEqual(p.touch, null, 'campaign-nav swap leaves touch controls alone');
})();

// same-panel re-show (deployFromTech -> openLevelMap while currentScreen is still levelMap): no hide, just show
(function () {
  const p = navPlan(SCREENS.levelMap, SCREENS.levelMap);
  assert.strictEqual(p.hide, null, 'levelMap->levelMap does not hide-then-show the same panel');
  assert.deepStrictEqual(p.show, { panel: 'levelMap', inverted: false }, 'levelMap->levelMap re-shows #levelMap');
})();

// gameover -> hangar (return): hides the previous overlay, shows the inverted hangar, writes hangar, hides touch
(function () {
  const p = navPlan(SCREENS.gameover, SCREENS.hangar);
  assert.deepStrictEqual(p.hide, { panel: 'gameover', inverted: false }, 'gameover->hangar hides #gameover');
  assert.deepStrictEqual(p.show, { panel: 'hangar', inverted: true }, 'gameover->hangar shows the inverted hangar');
  assert.strictEqual(p.state, 'hangar', 'gameover->hangar writes state=hangar');
  assert.strictEqual(p.touch, 'hide', 'gameover->hangar touch=hide');
})();

// no current screen (fromRow falsy): nothing to hide, just apply the target
(function () {
  const p = navPlan(null, SCREENS.opsSelect);
  assert.strictEqual(p.hide, null, 'null from-row hides nothing');
  assert.deepStrictEqual(p.show, { panel: 'opsSelect', inverted: false }, 'null from-row still shows the target');
})();

// falsy target: an inert no-op plan (defensive — showScreen guards this before calling, but the pure fn is total)
(function () {
  const p = navPlan(SCREENS.hangar, undefined);
  assert.deepStrictEqual(p, { hide: null, show: null, state: null, touch: null }, 'undefined target -> inert plan');
})();

// navPlan is pure: it never mutates the rows it is handed
(function () {
  const before = JSON.stringify(SCREENS);
  navPlan(SCREENS.hangar, SCREENS.playing);
  navPlan(SCREENS.opsSelect, SCREENS.briefing);
  assert.strictEqual(JSON.stringify(SCREENS), before, 'navPlan does not mutate the SCREENS table');
})();

console.log('ok - nav: SCREENS table integrity + navPlan transition logic (hide/show/state/touch, inverted hangar, same-panel, null rows)');
