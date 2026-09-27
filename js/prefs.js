/* SKYSTRIKE — prefs.js: player-settings registry + generic save-heal. Require-safe: the setting globals
   (globals.js), apply fns, clamp and store are only referenced inside functions, resolved at call time. */

// Apply fns are function-declaration globals looked up by name; inert if absent (Node).
function _runPrefFn(name) {
  var fn = globalThis[name];
  if (typeof fn === 'function') fn();
}

var _prefBool = function (v) { return typeof v === 'boolean'; };
var _prefNum = function (v) { return typeof v === 'number'; };
var _prefId = function (v) { return v; };
var _prefTruthy = function (v) { return !!v; };
function _prefOneOf() {
  var opts = Array.prototype.slice.call(arguments);
  return function (v) { return opts.indexOf(v) !== -1; };
}
function _boolRow(id, def, set) {
  return { id: id, key: id, def: def, accept: _prefBool, parse: _prefTruthy, set: set, apply: null };
}

/* Row: id (applySetting handle), key (skystrike_settings blob property), def (globals.js default),
   accept (load guard), parse (parse+clamp), set (mutate the global), apply (ordered apply-fn names or null).
   Load applies parse+set only; apply chains run on change (gfx's boot apply is run by loadSettings).
   lang / hudScale / uiScale / special2Id stay hand-rolled in ui-settings.js loadSettings. */
const SETTINGS = [
  _boolRow('muted',           false, function (v) { muted = v; }),
  _boolRow('invertY',         false, function (v) { invertY = v; }),
  _boolRow('autoLock',        false, function (v) { autoLock = v; }),
  _boolRow('startWingman',    true,  function (v) { startWingman = v; }),
  _boolRow('devUnlockAll',    false, function (v) { devUnlockAll = v; }),
  _boolRow('devUnlockLevels', false, function (v) { devUnlockLevels = v; }),
  _boolRow('devUnlocked',     false, function (v) { devUnlocked = v; }),
  _boolRow('mouseFlight',     false, function (v) { mouseFlight = v; }),
  _boolRow('rivalEnabled',    true,  function (v) { rivalEnabled = v; }),
  _boolRow('groundWar',       true,  function (v) { groundWar = v; }),
  _boolRow('opMode',          false, function (v) { opMode = v; }),
  _boolRow('gunLead',         true,  function (v) { gunLead = v; }),
  _boolRow('aimAssist',       true,  function (v) { aimAssist = v; }),
  _boolRow('haptics',         true,  function (v) { haptics = v; }),
  { id: 'volume',             key: 'volume',             def: 0.55,       accept: _prefNum, parse: function (v) { return clamp(v, 0, 1); }, set: function (v) { volume = v; }, apply: null },
  { id: 'aimStrength',        key: 'aimStrength',        def: 3,          accept: _prefNum, parse: function (v) { return clamp(v | 0, 1, 5); }, set: function (v) { aimStrength = v; }, apply: null },
  { id: 'controlSensitivity', key: 'controlSensitivity', def: 1.0,        accept: _prefNum, parse: function (v) { return clamp(v, 0.5, 2.0); }, set: function (v) { controlSensitivity = v; }, apply: null },
  { id: 'buttonOpacity',      key: 'buttonOpacity',      def: 0.8,        accept: _prefNum, parse: function (v) { return clamp(v, 0.4, 1.0); }, set: function (v) { buttonOpacity = v; }, apply: ['applyButtonStyle'] },
  { id: 'difficulty',         key: 'difficulty',         def: 1,          accept: _prefNum, parse: function (v) { return clamp(v | 0, 0, 2); }, set: function (v) { difficulty = v; }, apply: null },
  { id: 'timeOfDay',          key: 'timeOfDay',          def: 0,          accept: _prefNum, parse: function (v) { return clamp(v | 0, 0, 2); }, set: function (v) { timeOfDay = v; }, apply: null },
  { id: 'selectedJet',        key: 'selectedJet',        def: 0,          accept: _prefNum, parse: function (v) { return clamp(v | 0, 0, JETS.length - 1); }, set: function (v) { selectedJet = v; }, apply: null },
  { id: 'controlScheme',      key: 'controlScheme',      def: 'auto',     accept: _prefOneOf('auto', 'pointer', 'rate'), parse: _prefId, set: function (v) { controlScheme = v; }, apply: null },
  { id: 'mobileControl',      key: 'mobileControl',      def: 'touch',    accept: _prefOneOf('touch', 'motion'), parse: _prefId, set: function (v) { mobileControl = v; }, apply: null },
  { id: 'motionAggression',   key: 'motionAggression',   def: 'balanced', accept: _prefOneOf('casual', 'balanced', 'direct'), parse: _prefId, set: function (v) { motionAggression = v; }, apply: null },
  { id: 'buttonLayout',       key: 'buttonLayout',       def: 'right',    accept: _prefOneOf('right', 'left', 'compact'), parse: _prefId, set: function (v) { buttonLayout = v; }, apply: ['applyButtonStyle'] },
  { id: 'unitSystem',         key: 'unitSystem',         def: 'imperial', accept: _prefOneOf('imperial', 'metric'), parse: _prefId, set: function (v) { unitSystem = v; }, apply: ['applyUnitLabels'] },
  // refreshGfxTier must run BEFORE applyGfxQuality.
  { id: 'gfx',                key: 'gfxQuality',         def: 'auto',     accept: _prefOneOf('auto', 'low', 'medium', 'high'), parse: _prefId, set: function (v) { gfxQuality = v; }, apply: ['refreshGfxTier', 'applyGfxQuality'] },
];

function settingById(id) {
  for (var i = 0; i < SETTINGS.length; i++) if (SETTINGS[i].id === id) return SETTINGS[i];
  return null;
}
function runSettingApply(id) {
  var row = settingById(id);
  if (!row || !row.apply) return;
  for (var i = 0; i < row.apply.length; i++) _runPrefFn(row.apply[i]);
}
function applySetting(id, value) {
  var row = settingById(id);
  if (!row) return;
  row.set(row.parse(value));
  runSettingApply(id);
  if (typeof saveSettings === 'function') saveSettings();
}
function loadSettingsFold(s) {
  s = s || {};
  for (var i = 0; i < SETTINGS.length; i++) {
    var row = SETTINGS[i];
    var raw = s[row.key];
    if (row.accept(raw)) row.set(row.parse(raw));
  }
}

/* Read a flat JSON blob; if it passes opts.valid (default: any object), fill every top-level key that is
   null or typeof-mismatched vs freshFn(), else return fresh wholesale. Never wipes un-modeled keys. */
function loadHealed(key, freshFn, opts) {
  opts = opts || {};
  var fresh = freshFn();
  var parsed;
  try { parsed = JSON.parse(store.get(key) || 'null'); } catch (e) { parsed = null; }
  var valid = opts.valid || function (o) { return !!(o && typeof o === 'object'); };
  if (!valid(parsed)) return fresh;
  for (var k in fresh) {
    if (parsed[k] == null || typeof parsed[k] !== typeof fresh[k]) parsed[k] = fresh[k];
  }
  return parsed;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SETTINGS, settingById, loadHealed };
}
