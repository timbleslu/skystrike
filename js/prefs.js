/* SKYSTRIKE — prefs.js: player-settings REGISTRY + generic save-heal. Loaded right after core.js.
   Require-safe: no THREE/store/DOM at LOAD. The store seam, the setting globals (globals.js), the
   apply fns (ui-settings.js/engine.js/globals.js) and clamp (core.js) are all referenced INSIDE
   functions, resolved at CALL time (the meta.js/rival.js pattern — prefs.js loads before globals.js,
   but nothing here reads a global until loadSettings/applySetting run at boot). Consolidates the
   per-setting knowledge that used to be stated three times: loadSettings parse/clamp, ~30 buildHangar
   change handlers, and the scattered apply fns (incl. the "refreshGfxTier BEFORE applyGfxQuality"
   ordering invariant — now encoded once, in the 'gfx' row's apply chain). */

/* run a named apply fn (a function-declaration global) at call time; inert if unresolved (Node). */
function _runPrefFn(name) {
  var scope = (typeof globalThis !== 'undefined') ? globalThis : null;
  var fn = scope ? scope[name] : null;
  if (typeof fn === 'function') fn();
}

/* accept-predicate + parse helpers (mirror the exact typeof/enum guards the old loadSettings used). */
var _prefBool = function (v) { return typeof v === 'boolean'; };
var _prefNum = function (v) { return typeof v === 'number'; };
function _prefOneOf() {
  var opts = Array.prototype.slice.call(arguments);
  return function (v) { return opts.indexOf(v) !== -1; };
}
var _prefId = function (v) { return v; };            // identity parse (enums / already-typed values)
var _prefTruthy = function (v) { return !!v; };      // boolean parse (total)

/* THE registry. Each row: id (applySetting handle), key (skystrike_settings blob property), def
   (globals.js init default), accept (load guard), parse (parse+clamp), set (mutate the global), apply
   (ordered apply-fn NAMES, or null). loadSettingsFold applies parse+set for each ACCEPTED row (NO apply
   — most apply fns fire on change only; gfx's boot apply is run once, unconditionally, by loadSettings).
   applySetting does parse+set+apply+save. Genuinely bespoke settings (lang / hudScale / uiScale /
   special2Id) stay hand-rolled in ui-settings.js loadSettings — device reads / relocalize side effects. */
const SETTINGS = [
  // --- booleans (load fold; several change handlers stay hand-rolled for audio / render side effects) ---
  { id: 'muted',              key: 'muted',              def: false,      accept: _prefBool, parse: _prefTruthy, set: function (v) { muted = v; }, apply: null },
  { id: 'invertY',            key: 'invertY',            def: false,      accept: _prefBool, parse: _prefTruthy, set: function (v) { invertY = v; }, apply: null },
  { id: 'autoLock',           key: 'autoLock',           def: false,      accept: _prefBool, parse: _prefTruthy, set: function (v) { autoLock = v; }, apply: null },
  { id: 'startWingman',       key: 'startWingman',       def: true,       accept: _prefBool, parse: _prefTruthy, set: function (v) { startWingman = v; }, apply: null },
  { id: 'devUnlockAll',       key: 'devUnlockAll',       def: false,      accept: _prefBool, parse: _prefTruthy, set: function (v) { devUnlockAll = v; }, apply: null },
  { id: 'devUnlockLevels',    key: 'devUnlockLevels',    def: false,      accept: _prefBool, parse: _prefTruthy, set: function (v) { devUnlockLevels = v; }, apply: null },
  { id: 'devUnlocked',        key: 'devUnlocked',        def: false,      accept: _prefBool, parse: _prefTruthy, set: function (v) { devUnlocked = v; }, apply: null },
  { id: 'mouseFlight',        key: 'mouseFlight',        def: false,      accept: _prefBool, parse: _prefTruthy, set: function (v) { mouseFlight = v; }, apply: null },
  { id: 'rivalEnabled',       key: 'rivalEnabled',       def: true,       accept: _prefBool, parse: _prefTruthy, set: function (v) { rivalEnabled = v; }, apply: null },
  { id: 'groundWar',          key: 'groundWar',          def: true,       accept: _prefBool, parse: _prefTruthy, set: function (v) { groundWar = v; }, apply: null },
  { id: 'opMode',             key: 'opMode',             def: false,      accept: _prefBool, parse: _prefTruthy, set: function (v) { opMode = v; }, apply: null },
  { id: 'gunLead',            key: 'gunLead',            def: true,       accept: _prefBool, parse: _prefTruthy, set: function (v) { gunLead = v; }, apply: null },
  { id: 'aimAssist',          key: 'aimAssist',          def: true,       accept: _prefBool, parse: _prefTruthy, set: function (v) { aimAssist = v; }, apply: null },
  { id: 'haptics',            key: 'haptics',            def: true,       accept: _prefBool, parse: _prefTruthy, set: function (v) { haptics = v; }, apply: null },
  // --- numbers (parse = clamp; exact bounds lifted from the old loadSettings) ---
  { id: 'volume',             key: 'volume',             def: 0.55,       accept: _prefNum, parse: function (v) { return clamp(v, 0, 1); }, set: function (v) { volume = v; }, apply: null },
  { id: 'aimStrength',        key: 'aimStrength',        def: 3,          accept: _prefNum, parse: function (v) { return clamp(v | 0, 1, 5); }, set: function (v) { aimStrength = v; }, apply: null },
  { id: 'controlSensitivity', key: 'controlSensitivity', def: 1.0,        accept: _prefNum, parse: function (v) { return clamp(v, 0.5, 2.0); }, set: function (v) { controlSensitivity = v; }, apply: null },
  { id: 'buttonOpacity',      key: 'buttonOpacity',      def: 0.8,        accept: _prefNum, parse: function (v) { return clamp(v, 0.4, 1.0); }, set: function (v) { buttonOpacity = v; }, apply: ['applyButtonStyle'] },
  { id: 'difficulty',         key: 'difficulty',         def: 1,          accept: _prefNum, parse: function (v) { return clamp(v | 0, 0, 2); }, set: function (v) { difficulty = v; }, apply: null },
  { id: 'timeOfDay',          key: 'timeOfDay',          def: 0,          accept: _prefNum, parse: function (v) { return clamp(v | 0, 0, 2); }, set: function (v) { timeOfDay = v; }, apply: null },
  { id: 'selectedJet',        key: 'selectedJet',        def: 0,          accept: _prefNum, parse: function (v) { return clamp(v | 0, 0, JETS.length - 1); }, set: function (v) { selectedJet = v; }, apply: null },
  // --- enums (accept = membership; parse = identity) ---
  { id: 'controlScheme',      key: 'controlScheme',      def: 'auto',     accept: _prefOneOf('auto', 'pointer', 'rate'), parse: _prefId, set: function (v) { controlScheme = v; }, apply: null },
  { id: 'mobileControl',      key: 'mobileControl',      def: 'touch',    accept: _prefOneOf('touch', 'motion'), parse: _prefId, set: function (v) { mobileControl = v; }, apply: null },
  { id: 'motionAggression',   key: 'motionAggression',   def: 'balanced', accept: _prefOneOf('casual', 'balanced', 'direct'), parse: _prefId, set: function (v) { motionAggression = v; }, apply: null },
  { id: 'buttonLayout',       key: 'buttonLayout',       def: 'right',    accept: _prefOneOf('right', 'left', 'compact'), parse: _prefId, set: function (v) { buttonLayout = v; }, apply: ['applyButtonStyle'] },
  { id: 'unitSystem',         key: 'unitSystem',         def: 'imperial', accept: _prefOneOf('imperial', 'metric'), parse: _prefId, set: function (v) { unitSystem = v; }, apply: ['applyUnitLabels'] },
  // gfx quality — the ordering invariant (refreshGfxTier BEFORE applyGfxQuality) lives HERE now, once,
  // and is consumed by BOTH loadSettings (runSettingApply('gfx'), unconditional) and applySetting.
  { id: 'gfx',                key: 'gfxQuality',         def: 'auto',     accept: _prefOneOf('auto', 'low', 'medium', 'high'), parse: _prefId, set: function (v) { gfxQuality = v; }, apply: ['refreshGfxTier', 'applyGfxQuality'] },
];

function settingById(id) {
  for (var i = 0; i < SETTINGS.length; i++) if (SETTINGS[i].id === id) return SETTINGS[i];
  return null;
}
/* run a row's apply chain in declared order (call-time global lookup; inert if a fn is absent). */
function runSettingApply(id) {
  var row = settingById(id);
  if (!row || !row.apply) return;
  for (var i = 0; i < row.apply.length; i++) _runPrefFn(row.apply[i]);
}
/* change-handler seam: parse+clamp the raw value, mutate the global, run the apply chain, persist. */
function applySetting(id, value) {
  var row = settingById(id);
  if (!row) return;
  row.set(row.parse(value));
  runSettingApply(id);
  if (typeof saveSettings === 'function') saveSettings();
}
/* load-time fold: for each row, if the stored raw value passes the row's accept guard, parse+set it
   (NO apply — matches the old loadSettings, where only gfx applied on load, and that runs separately).
   Bespoke rows + the unconditional gfx boot apply stay in ui-settings.js loadSettings. */
function loadSettingsFold(s) {
  s = s || {};
  for (var i = 0; i < SETTINGS.length; i++) {
    var row = SETTINGS[i];
    var raw = s[row.key];
    if (row.accept(raw)) row.set(row.parse(raw));
  }
}

/* ---------------- generic save-heal (loadHealed) ----------------
   "read blob -> validate -> fill defaults" — the shape re-implemented across loadMeta / loadSettings /
   loadBest / loadDaily / rival. Reads via the store seam (INSIDE the fn), JSON-parses defensively, and —
   when the blob passes the outer validity gate — fills any key whose value is null OR whose typeof
   differs from freshFn()'s. FLAT (no recursion — matches loadMeta, the only converted loader, which heals
   top-level keys only). Lenient: never wipes progression, no version bump. opts.valid overrides the default
   object gate (loadMeta passes validMeta so a malformed blob falls back to fresh WHOLESALE, as before). */
function loadHealed(key, freshFn, opts) {
  opts = opts || {};
  var fresh = freshFn();
  var parsed;
  try { parsed = JSON.parse(store.get(key) || 'null'); } catch (e) { parsed = null; }
  var valid = opts.valid || function (o) { return !!(o && typeof o === 'object'); };
  if (!valid(parsed)) return fresh;
  for (var k in fresh) {
    if (!Object.prototype.hasOwnProperty.call(fresh, k)) continue;
    if (parsed[k] == null || typeof parsed[k] !== typeof fresh[k]) parsed[k] = fresh[k];
  }
  return parsed;
}

/* CommonJS export for Node tests — inert in the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SETTINGS, settingById, applySetting, runSettingApply, loadSettingsFold, loadHealed };
}
