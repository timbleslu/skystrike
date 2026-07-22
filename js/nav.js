/* SKYSTRIKE — screen router (Candidate 3 "Screen router"). Browser globals; loaded AFTER hud.js and
   BEFORE ui-hud.js. Consolidates the smeared classList add/remove('show'|'hide') screen-navigation
   that used to live across ui-flow.js / ui-hangar.js / ui-tech.js / ui-settings.js.

   SCOPE: this router owns the FULL-SCREEN flow — the mutually-exclusive screens that REPLACE one
   another (hangar ⇄ campaign-nav chain, hangar → playing → gameover). It does NOT own modal overlays
   that render ON TOP of the current screen without hiding it (meta, manual, tech/upgrade, wingpick,
   opmap, langSelect, onboard) — those stay hand-rolled at their call sites (a "hide current + show
   new" model would wrongly hide the screen underneath the modal). #modeChoice / #endlessSetup are
   also modal-over-hangar (entered by hand-rolled code) but are listed here so hideAllScreens() can
   reset them; see their `entry:'manual'` rows.

   ADR-0001/0002: NO import/export — the ONLY module syntax is the inert CommonJS footer, guarded so
   it never runs in the browser. NOTHING here touches the DOM / `state` / `isTouchEnabled` at LOAD
   time (the table is pure data; all DOM application is inside functions) so the file stays
   require-safe for tests/nav.test.js. */

/* SCREENS: screenName → row.
   panel    : DOM overlay id, or null for the panel-less flight screen ('playing').
   state    : `state` global to write on enter ('hangar'|'playing'|'dead'), or null = leave state alone.
   touch    : 'show' (show touch controls IF isTouchEnabled) | 'hide' (always hide) | null (leave alone).
   inverted : hangar only — it is shown by REMOVING 'hide' and hidden by ADDING 'hide' (opposite of the
              overlays, which toggle 'show'). Encodes the pre-existing hangar semantics exactly.
   entry    : 'router' = navigated via showScreen(); 'manual' = a menu overlay entered by hand-rolled
              code (over the still-visible hangar) but tracked here so hideAllScreens() can clear it. */
const SCREENS = {
  hangar:       { panel: 'hangar',       state: 'hangar',  touch: 'hide', inverted: true,  entry: 'router' },
  playing:      { panel: null,           state: 'playing', touch: 'show', inverted: false, entry: 'router' },
  gameover:     { panel: 'gameover',     state: 'dead',    touch: 'hide', inverted: false, entry: 'router' },
  opsSelect:    { panel: 'opsSelect',    state: null,      touch: null,   inverted: false, entry: 'router' },
  opLore:       { panel: 'opLore',       state: null,      touch: null,   inverted: false, entry: 'router' },
  levelMap:     { panel: 'levelMap',     state: null,      touch: null,   inverted: false, entry: 'router' },
  briefing:     { panel: 'briefing',     state: null,      touch: null,   inverted: false, entry: 'router' },
  levelCleared: { panel: 'levelCleared', state: null,      touch: null,   inverted: false, entry: 'router' },
  // menu overlays over the hangar — entered hand-rolled (openModeChoice/openEndlessSetup); here only
  // so hideAllScreens() resets them. Do NOT drive these via showScreen (it would hide the hangar).
  modeChoice:   { panel: 'modeChoice',   state: null,      touch: null,   inverted: false, entry: 'manual' },
  endlessSetup: { panel: 'endlessSetup', state: null,      touch: null,   inverted: false, entry: 'manual' },
};

// the active screen. Boots into the hangar (which is visible with no 'hide' class at page load, and
// `state` starts 'hangar' in globals.js). Updated only by showScreen().
let currentScreen = 'hangar';

/* PURE transition computation: given the current row and the target row, decide which panel to hide,
   which to show, the state write, and the touch action. No DOM / globals — testable in isolation.
   Returns { hide, show, state, touch }; hide/show are { panel, inverted } or null. */
function navPlan(fromRow, toRow) {
  if (!toRow) return { hide: null, show: null, state: null, touch: null };
  const hide = (fromRow && fromRow.panel && fromRow.panel !== toRow.panel)
    ? { panel: fromRow.panel, inverted: !!fromRow.inverted }
    : null;
  const show = toRow.panel ? { panel: toRow.panel, inverted: !!toRow.inverted } : null;
  return { hide: hide, show: show, state: toRow.state || null, touch: toRow.touch || null };
}

// IMPURE: apply one panel plan { panel, inverted } to the DOM. Non-inverted panels toggle 'show';
// the inverted hangar toggles 'hide' (visible = no 'hide').
function applyPanel(p, visible) {
  if (!p) return;
  const el = g(p.panel);
  if (!el) return;
  if (p.inverted) el.classList.toggle('hide', !visible);
  else el.classList.toggle('show', visible);
}

/* Navigate to a screen: hide the currently-active screen's panel, apply the target row (show panel +
   state write + touch-control visibility), and track currentScreen. Pixel-identical to the old
   hand-rolled hide-current/show-new + state + touch clusters. */
function showScreen(name) {
  const toRow = SCREENS[name];
  if (!toRow) return;
  const plan = navPlan(SCREENS[currentScreen], toRow);
  applyPanel(plan.hide, false);
  applyPanel(plan.show, true);
  if (plan.state) state = plan.state;
  if (plan.touch === 'show') { if (isTouchEnabled) g('touchControls').classList.add('show'); }
  else if (plan.touch === 'hide') { g('touchControls').classList.remove('show'); }
  currentScreen = name;
}

/* Hide every overlay panel + the touch controls (belt-and-suspenders reset used by returnToHangar).
   Skips the inverted hangar (we want it shown) and the panel-less flight screen. */
function hideAllScreens() {
  for (const key in SCREENS) {
    const row = SCREENS[key];
    if (row.inverted || !row.panel) continue;
    const el = g(row.panel);
    if (el) el.classList.remove('show');
  }
  const tc = g('touchControls');
  if (tc) tc.classList.remove('show');
}

// require-safe footer (inert in the browser): export the pure table + transition fn for tests.
if (typeof module !== 'undefined' && module.exports) module.exports = { SCREENS: SCREENS, navPlan: navPlan };
