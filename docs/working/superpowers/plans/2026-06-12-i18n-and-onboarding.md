# i18n (EN/ZH) + Onboarding Flow + Sensitivity Setting

## Goal
1. Full English + Simplified Chinese localization.
2. New first-run flow: Language Select screen → brief Controls/Instructions screen → existing hangar (jet select).
3. Settings menu: add Language toggle (changeable anytime) + Control Sensitivity slider.

## Architecture
- New file `js/i18n.js`, loaded right after `js/globals.js` (before engine.js) in index.html script order. Update CLAUDE.md load-order chain + Architecture table.
- `js/i18n.js` exports (as globals): `let LANG = 'EN'`, `const I18N = { EN: {...}, ZH: {...} }`, `function t(key){ return (I18N[LANG]&&I18N[LANG][key]) ?? I18N.EN[key] ?? key; }`.
- Every user-facing string in the game gets a key in both `I18N.EN` and `I18N.ZH`. Group keys by area (menu, hud, settings, manual, jets, tech, opmap, banners) for readability — flat key namespace is fine, e.g. `hud.guns`, `jet.F22.name`, `tech.gunner.desc`.

## Scope of strings to translate (from exploration)
- `globals.js` JETS array (~13 jets × name/role/ability/passive/desc/context, ~65 strings)
- `globals.js` TECHTREE array (~45 nodes × name + desc, ~90 strings)
- `ui.js`: HUD labels (GUNS/LOCKING/ACQUIRING/etc.), banners (WAVE N INBOUND/GET READY/MISSION FAILED/OPERATION COMPLETE), tech tree UI (CORE/OWNED/N/A/RP), operation map sector labels (FURBALL/INTERCEPT/STRIKE/ELITE/DEPOT/FINAL), buttons (ROOKIE/VETERAN/ACE, DAY/DUSK/NIGHT, DEPLOY, SELECT, etc.)
- `index.html`: manual section headings (Flight/Combat/Target Lock/Aircraft Stats/HUD & Radar/Your Wingman/R&D Tech Tree/Settings/Difficulty), settings row labels (Master volume/Invert pitch/Auto-lock/Launch with wingman/Nemesis rival/Ground war/Gun lead/Mute)

For data-table strings (JETS/TECHTREE), simplest approach: keep the arrays as the canonical EN source but add a parallel lookup — e.g. `I18N.ZH.jet[id].name` etc — and have rendering code call `t()`-style helper `jetText(jet, 'name')` / `techText(node, 'desc')` that falls back to the English field on the object if no ZH entry. Pick whichever approach is least invasive; document the chosen pattern in CLAUDE.md.

## New screens
1. **Language Select** (`#langSelect` or similar, new div in index.html + CSS, shown/hidden like `#manual`):
   - Two big buttons: "English 🇬🇧" and "简体中文 🇨🇳".
   - Shown on boot ONLY if no saved language preference exists in storage (`store.get`).
   - Selecting sets `LANG`, persists via `saveSettings()`, then proceeds to the Controls/Instructions screen.

2. **Controls/Instructions** (new div, shown after language select, before `buildHangar()`):
   - Brief, localized summary of basic controls (flight stick/keys, fire, special, pause/manual).
   - A line pointing players to the Settings menu (in the flight manual) for full details.
   - "Continue" / start button → proceeds to `buildHangar()` (normal boot continues).
   - Both EN and ZH text driven by `t()`.

Both screens skip on subsequent boots once a language is saved — but the user can re-trigger language change via Settings (see below). Changing language in Settings should re-render the currently visible screen's text (at minimum: hangar labels, manual/settings labels — full retranslation of static visible DOM).

## Settings menu additions (existing `#manual` settings rows, ui.js ~776-970)
- **Language toggle**: two buttons or a select (EN / 简体中文). On change: set `LANG`, `saveSettings()`, re-render visible UI text (hangar + manual + HUD labels next frame).
- **Control sensitivity slider**: `let controlSensitivity = 1.0` (range 0.5–2.0, default 1.0, e.g. HTML range input 50-200 / 100). Persist via `saveSettings()`/`loadSettings()`.
  - Apply in `combat.js` (~line 778-810) turn-rate calc: multiply `tb = st.turnRate * controlSensitivity * (player.turnMul || 1) * (...)`.

## Persistence
Extend `loadSettings()`/`saveSettings()` (ui.js ~930-970) to include `LANG` and `controlSensitivity`. Boot sequence (main.js) checks for saved `LANG`; if absent, show Language Select → Controls screens before `buildHangar()`.

## Verification (mandatory)
1. `npm test` passes.
2. `node scripts/shot.mjs i18n-en 0` — boots with default/EN, no errors.
3. Manually verify ZH path doesn't crash: e.g. temporarily force `LANG='ZH'` in a quick headless check or add a test script invocation if `scripts/shot.mjs` supports a lang override; otherwise reason about code paths (every `t()` call has EN fallback so missing ZH keys can't crash — but verify `t()` is actually used everywhere new text is rendered).
4. Update CLAUDE.md: Architecture table (new `js/i18n.js` row + load-order chain), Hard rules if a new convention is introduced (e.g. "all user-facing strings go through `t()`"), Current state.
5. If anything is left incomplete due to scope, write a checklist file under `docs/working/superpowers/plans/` documenting remaining strings/screens, then leave this plan file in place (don't delete) until checklist is empty.
