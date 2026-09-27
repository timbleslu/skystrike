/* SKYSTRIKE — nav.js: full-screen router. Owns only the mutually-exclusive screens that REPLACE one another;
   modal overlays drawn over the current screen (meta, manual, tech, wingpick, langSelect, onboard) stay
   hand-rolled at their call sites. Require-safe: no DOM/globals touched at load. */

/* panel    : DOM overlay id, or null for the panel-less flight screen.
   state    : `state` value written on enter, or null = leave alone.
   touch    : 'show' (if isTouchEnabled) | 'hide' | null.
   inverted : hangar only — shown by REMOVING 'hide' rather than adding 'show'.
   entry    : 'manual' = menu overlay over the hangar, entered by hand (openModeChoice/openEndlessSetup) and
              listed only so hideAllScreens() resets it. Never showScreen() these — it would hide the hangar. */
const SCREENS = {
  hangar:       { panel: 'hangar',       state: 'hangar',  touch: 'hide', inverted: true,  entry: 'router' },
  playing:      { panel: null,           state: 'playing', touch: 'show', inverted: false, entry: 'router' },
  gameover:     { panel: 'gameover',     state: 'dead',    touch: 'hide', inverted: false, entry: 'router' },
  opsSelect:    { panel: 'opsSelect',    state: null,      touch: null,   inverted: false, entry: 'router' },
  opLore:       { panel: 'opLore',       state: null,      touch: null,   inverted: false, entry: 'router' },
  levelMap:     { panel: 'levelMap',     state: null,      touch: null,   inverted: false, entry: 'router' },
  briefing:     { panel: 'briefing',     state: null,      touch: null,   inverted: false, entry: 'router' },
  levelCleared: { panel: 'levelCleared', state: 'dead',    touch: 'hide', inverted: false, entry: 'router' },
  levelFailed:  { panel: 'levelFailed',  state: 'dead',    touch: 'hide', inverted: false, entry: 'router' },
  modeChoice:   { panel: 'modeChoice',   state: null,      touch: null,   inverted: false, entry: 'manual' },
  endlessSetup: { panel: 'endlessSetup', state: null,      touch: null,   inverted: false, entry: 'manual' },
};

let currentScreen = 'hangar';

// Pure: { hide, show, state, touch }; hide/show are { panel, inverted } or null.
function navPlan(fromRow, toRow) {
  if (!toRow) return { hide: null, show: null, state: null, touch: null };
  const hide = (fromRow && fromRow.panel && fromRow.panel !== toRow.panel)
    ? { panel: fromRow.panel, inverted: !!fromRow.inverted }
    : null;
  const show = toRow.panel ? { panel: toRow.panel, inverted: !!toRow.inverted } : null;
  return { hide: hide, show: show, state: toRow.state || null, touch: toRow.touch || null };
}

function applyPanel(p, visible) {
  if (!p) return;
  const el = g(p.panel);
  if (p.inverted) el.classList.toggle('hide', !visible);
  else el.classList.toggle('show', visible);
}

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

// Hide every overlay panel + touch controls (the hangar and the panel-less flight screen are skipped).
function hideAllScreens() {
  for (const key in SCREENS) {
    const row = SCREENS[key];
    if (row.inverted || !row.panel) continue;
    g(row.panel).classList.remove('show');
  }
  g('touchControls').classList.remove('show');
}

/* Esc = BACK: overlay panel id → the id of the button whose click already implements that screen's BACK.
   Topmost-first precedence. */
const MENU_BACK = [
  ['gameover',     'goHangar'],
  ['levelCleared', 'lvlcMap'],
  ['levelFailed',  'lvlfMap'],
  ['briefing',     'briefBack'],
  ['opLore',       'opLoreBack'],
  ['levelMap',     'levelMapBack'],
  ['opsSelect',    'opsBack'],
  ['endlessSetup', 'endlessBack'],
  ['modeChoice',   'modeBack'],
  ['meta',         'metaClose'],
];
function menuBackTarget(openPanels) {
  for (let i = 0; i < MENU_BACK.length; i++) if (openPanels.indexOf(MENU_BACK[i][0]) !== -1) return MENU_BACK[i][1];
  return null;
}
// Capture-phase so it runs BEFORE main.js's bubble handler; claims keys only on menus.
function installMenuKeys() {
  const activatable = (el) => !!(el && el !== document.body && el.closest && el.closest('button,a,select,[role="button"],[role="radio"],[tabindex]'));
  window.addEventListener('keydown', function (e) {
    const ae = document.activeElement, tag = ae && ae.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (isShown('manual') || isShown('upgrade') || isShown('wingpick') || onboarding) return;   // those own their keys
    const open = MENU_BACK.map(r => r[0]).filter(isShown);
    if (e.code === 'Escape') {
      const b = g(menuBackTarget(open) || '');
      if (b && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); b.click(); }
      return;
    }
    const actKey = e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter';
    // debriefs (state 'dead'): focused buttons activate natively
    if ((isShown('gameover') || isShown('levelCleared') || isShown('levelFailed')) && actKey && activatable(ae)) { e.stopImmediatePropagation(); return; }
    if (state !== 'hangar') return;
    if (open.length) {
      // an overlay is up: hangar carousel shortcuts must not fire beneath it; focused buttons activate natively
      if (actKey || e.code === 'ArrowLeft' || e.code === 'ArrowRight') e.stopImmediatePropagation();
      return;
    }
    if (actKey && activatable(ae)) { e.stopImmediatePropagation(); return; }
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) {
      e.preventDefault(); e.stopImmediatePropagation(); openModeChoice();
    }
  }, true);
}
if (typeof window !== 'undefined') installMenuKeys();

if (typeof module !== 'undefined' && module.exports) module.exports = { SCREENS, navPlan, MENU_BACK, menuBackTarget };
