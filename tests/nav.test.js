'use strict';
// Screen router (js/nav.js) — asserts SCREENS table integrity + the pure navPlan transition logic.
const assert = require('assert');
const { SCREENS, navPlan, MENU_BACK, menuBackTarget } = require('../js/nav.js');

const STATES = new Set(['hangar', 'playing', 'dead']);
const TOUCH = new Set(['show', 'hide']);
const ENTRY = new Set(['router', 'manual']);

const names = Object.keys(SCREENS);
assert.ok(names.length >= 8, 'table has the routed screens (>=8)');
assert.strictEqual(names.length, new Set(names).size, 'screen names are unique');

const seenPanels = new Set();
let invertedCount = 0;
let nullPanelCount = 0;
for (const name of names) {
  const row = SCREENS[name];
  assert.ok(row && typeof row === 'object', name + ': row is an object');
  assert.ok(row.panel === null || (typeof row.panel === 'string' && row.panel.length > 0),
    name + ': panel is a non-empty string or null');
  if (row.panel === null) { nullPanelCount++; }
  else {
    assert.ok(!seenPanels.has(row.panel), name + ': panel id "' + row.panel + '" is unique across rows');
    seenPanels.add(row.panel);
  }
  assert.ok(row.state === null || STATES.has(row.state), name + ': state is a valid state or null');
  assert.ok(row.touch === null || TOUCH.has(row.touch), name + ': touch is show|hide|null');
  assert.strictEqual(typeof row.inverted, 'boolean', name + ': inverted is a boolean');
  if (row.inverted) invertedCount++;
  assert.ok(ENTRY.has(row.entry), name + ': entry is router|manual');
}
assert.strictEqual(invertedCount, 1, 'exactly one inverted screen (the hangar)');
assert.ok(SCREENS.hangar && SCREENS.hangar.inverted === true, 'the hangar is the inverted screen');
assert.ok(nullPanelCount <= 1, 'at most one panel-less screen (playing)');

for (const s of ['hangar', 'playing', 'gameover', 'opsSelect', 'opLore', 'levelMap', 'briefing', 'levelCleared']) {
  assert.ok(SCREENS[s], 'routed screen "' + s + '" is present');
  assert.strictEqual(SCREENS[s].entry, 'router', s + ' is a router-entry screen');
}
for (const s of ['modeChoice', 'endlessSetup']) {
  assert.ok(SCREENS[s], 'menu overlay "' + s + '" is present');
  assert.strictEqual(SCREENS[s].entry, 'manual', s + ' is a manual-entry overlay');
}
assert.strictEqual(SCREENS.playing.state, 'playing', 'playing writes state=playing');
assert.strictEqual(SCREENS.playing.panel, null, 'playing has no overlay panel');
assert.strictEqual(SCREENS.playing.touch, 'show', 'playing shows touch controls');
assert.strictEqual(SCREENS.gameover.state, 'dead', 'gameover writes state=dead');
assert.strictEqual(SCREENS.gameover.touch, 'hide', 'gameover hides touch controls');
assert.strictEqual(SCREENS.hangar.state, 'hangar', 'hangar writes state=hangar');
assert.strictEqual(SCREENS.hangar.touch, 'hide', 'hangar hides touch controls');

(function () {
  const p = navPlan(SCREENS.hangar, SCREENS.playing);
  assert.deepStrictEqual(p.hide, { panel: 'hangar', inverted: true }, 'hangar->playing hides the inverted hangar');
  assert.strictEqual(p.show, null, 'hangar->playing shows no panel (flight has none)');
  assert.strictEqual(p.state, 'playing', 'hangar->playing writes state=playing');
  assert.strictEqual(p.touch, 'show', 'hangar->playing touch=show');
})();

(function () {
  const p = navPlan(SCREENS.playing, SCREENS.gameover);
  assert.strictEqual(p.hide, null, 'playing->gameover hides nothing (playing panel-less)');
  assert.deepStrictEqual(p.show, { panel: 'gameover', inverted: false }, 'playing->gameover shows #gameover');
  assert.strictEqual(p.state, 'dead', 'playing->gameover writes state=dead');
  assert.strictEqual(p.touch, 'hide', 'playing->gameover touch=hide');
})();

(function () {
  const p = navPlan(SCREENS.opsSelect, SCREENS.opLore);
  assert.deepStrictEqual(p.hide, { panel: 'opsSelect', inverted: false }, 'opsSelect->opLore hides #opsSelect');
  assert.deepStrictEqual(p.show, { panel: 'opLore', inverted: false }, 'opsSelect->opLore shows #opLore');
  assert.strictEqual(p.state, null, 'campaign-nav swap leaves state alone');
  assert.strictEqual(p.touch, null, 'campaign-nav swap leaves touch controls alone');
})();

(function () {
  const p = navPlan(SCREENS.levelMap, SCREENS.levelMap);
  assert.strictEqual(p.hide, null, 'levelMap->levelMap does not hide-then-show the same panel');
  assert.deepStrictEqual(p.show, { panel: 'levelMap', inverted: false }, 'levelMap->levelMap re-shows #levelMap');
})();

(function () {
  const p = navPlan(SCREENS.gameover, SCREENS.hangar);
  assert.deepStrictEqual(p.hide, { panel: 'gameover', inverted: false }, 'gameover->hangar hides #gameover');
  assert.deepStrictEqual(p.show, { panel: 'hangar', inverted: true }, 'gameover->hangar shows the inverted hangar');
  assert.strictEqual(p.state, 'hangar', 'gameover->hangar writes state=hangar');
  assert.strictEqual(p.touch, 'hide', 'gameover->hangar touch=hide');
})();

(function () {
  const p = navPlan(null, SCREENS.opsSelect);
  assert.strictEqual(p.hide, null, 'null from-row hides nothing');
  assert.deepStrictEqual(p.show, { panel: 'opsSelect', inverted: false }, 'null from-row still shows the target');
})();

(function () {
  const p = navPlan(SCREENS.hangar, undefined);
  assert.deepStrictEqual(p, { hide: null, show: null, state: null, touch: null }, 'undefined target -> inert plan');
})();

(function () {
  const before = JSON.stringify(SCREENS);
  navPlan(SCREENS.hangar, SCREENS.playing);
  navPlan(SCREENS.opsSelect, SCREENS.briefing);
  assert.strictEqual(JSON.stringify(SCREENS), before, 'navPlan does not mutate the SCREENS table');
})();

(function () {
  assert.strictEqual(menuBackTarget([]), null, 'no open overlay -> Esc does nothing here (main.js keeps the manual toggle)');
  assert.strictEqual(menuBackTarget(['modeChoice']), 'modeBack', 'mode choice -> its BACK');
  assert.strictEqual(menuBackTarget(['meta']), 'metaClose', 'command/progression -> BACK TO HANGAR');
  assert.strictEqual(menuBackTarget(['gameover']), 'goHangar', 'debrief -> HANGAR');
  assert.strictEqual(menuBackTarget(['modeChoice', 'endlessSetup']), 'endlessBack', 'deeper overlay wins');
  assert.strictEqual(menuBackTarget(['levelMap', 'briefing']), 'briefBack', 'briefing over the map backs to the map');
  const ids = MENU_BACK.map(r => r[0]);
  assert.strictEqual(new Set(ids).size, ids.length, 'MENU_BACK panels are unique');
  for (const k in SCREENS) { const r = SCREENS[k]; if (r.panel && !r.inverted) assert.ok(ids.indexOf(r.panel) !== -1, 'Esc target for ' + r.panel); }
})();

console.log('ok - nav: SCREENS table integrity + navPlan transition logic (hide/show/state/touch, inverted hangar, same-panel, null rows)');
