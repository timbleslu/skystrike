# Controls Redesign — 2026-06-14

Two goals, implemented as 5 file-disjoint slices (A–D parallel, E after).

## Goal 1 — Joystick: add "point-to-steer" scheme (default), keep classic
The on-screen stick already emits clean normalized intent (`flightInput.{pitch,roll}` in -1..1).
The change is NOT in `controls.js`. It is in how `combat.js` *interprets* that intent.

- **Classic ("rate")** = current behaviour: `roll` intent → roll RATE (hold stick = keep rolling).
- **Point-to-steer ("pointer")** = new default: `roll` intent → **target bank ANGLE held**
  while pushed; releasing auto-levels to wings-level and the plane flies straight.
  `pitch` intent → climb/dive as today. This is the "go in this direction" feel.

`controlScheme` is orthogonal to input *source* (touch vs motion) — it applies to the
`flightInput` seam regardless. Keyboard (desktop, added on top in combat.js) is OUT OF SCOPE:
leave the keyboard path untouched.

## Goal 2 — Mobile motion: completely redo (tested in mobile browser)
Diagnosis (from source map): pipeline math is mostly right (landscape beta/gamma swap, recenter
baseline, deadzone/expo, `requestPermission()` fired from a real tap). The failures:
1. **No secure context** — `deviceorientation` needs HTTPS; opening the page over `file://`/`http://`
   yields ZERO events = "completely broken." (Slice A fixes the dev environment.)
2. **No smoothing** — raw angles → jitter.
3. **Silent failure** — no visible feedback when events never arrive.

Fix = HTTPS dev server (A) + EMA smoothing + no-data watchdog + visible status (C/D).

---

## SHARED GLOBAL CONTRACT (do not rename — parallel slices depend on these)

Declared in `globals.js` (owner: B):
- `controlScheme` : string, `'pointer'` (default) | `'rate'`.
- `STEER` tunables object, e.g. `{ maxBank, bankGain, autoLevelGain }` — B chooses values; only B reads them.

Persisted (owner: D, via existing `loadSettings`/`saveSettings`, key `skystrike_settings`):
- `controlScheme` ← read on load, written on toggle.

Motion status seam (set by C in `controls.js`, rendered by D in `ui.js`):
- C calls `window.onMotionStatus?.(status, msg)` whenever motion state changes, where
  `status` ∈ `'off' | 'requesting' | 'denied' | 'unsupported' | 'live' | 'no-data'`.
- D defines `window.onMotionStatus = (status,msg) => { ...update #motionNote... }`.
  If D's handler isn't present, C must not crash (optional-chaining call).

DOM ids (owner: D):
- `#controlSchemeTog` — segmented toggle (Point-to-steer | Classic), wired with the existing
  `bindSeg` pattern → sets `controlScheme` → `saveSettings()`.
- `#motionNote` — reused as the live motion status line (already exists, currently hidden).

---

## Slice specs + success criteria

### A — HTTPS dev server  (files: `package.json`, `scripts/serve-https.mjs`)
- Add `scripts/serve-https.mjs`: a static file server (Node built-ins) over **HTTPS** on
  `0.0.0.0` (LAN-reachable) serving the repo root, default port 8443. Self-signed cert
  generated in-memory (devDependency `selfsigned` is acceptable). Print the LAN URL on start.
- Add npm script `"serve:https": "node scripts/serve-https.mjs"`.
- Success: `npm run serve:https` boots; `curl -k https://localhost:8443/index.html` returns the page.
  Document in the script's header comment that on a phone you must accept the self-signed cert warning.

### B — Flight scheme  (files: `globals.js`, `combat.js`)
- Add `controlScheme` + `STEER` to `globals.js`.
- In `combat.js` `updatePlayer` (~:823-840) branch on `controlScheme` for the `flightInput` seam:
  - `'rate'`: keep EXACT current behaviour.
  - `'pointer'`: implement bank-hold + auto-level. Find how the player's current bank/roll is
    stored (read the file fully), compute `rollRate = bankGain * (targetBank - currentBank)`,
    `targetBank = rollIntent * maxBank`; when `|rollIntent| < deadzone` → `rollRate = -currentBank * autoLevelGain`.
    Pitch handling: keep current pitch authority (climb/dive from pitch intent).
- Put the pointer mapping in a PURE function (in `globals.js` or top of `combat.js`) so Slice E can unit-test it:
  `steerCommand(scheme, intent, currentBank, tunables) -> { pitchCmd, rollCmd }` (or rate-equivalent).
- Success: with `controlScheme='pointer'`, holding roll intent settles to a fixed bank then stops
  rolling; zero intent drives bank→0. `'rate'` reproduces today's feel. Keyboard path untouched.

### C — Motion pipeline  (file: `controls.js` ONLY)
- Add EMA low-pass smoothing to the motion axes (α ≈ 0.2) before they feed the seam.
- Add a no-data watchdog: when motion is enabled, if no `deviceorientation` event arrives within
  ~1.5s, emit `onMotionStatus('no-data', ...)`. On first real event emit `onMotionStatus('live')`.
- Wire `onMotionStatus` calls through the permission/enable/disable flow:
  `'requesting'` on tap, `'denied'`/`'unsupported'` on those paths, `'live'` on first event, `'off'` on disable.
- Keep the existing correct bits (landscape swap, recenter baseline, requestPermission-from-tap).
- Do NOT touch the joystick math (it stays as the normalized-intent producer it already is).
- Success: enabling motion updates `#motionNote` via the status seam; smoothed (non-jittery) tilt;
  recenter still works; silent-dead path now shows `'no-data'`.

### D — UI / DOM / styles  (files: `ui.js`, `index.html`, `styles.css`)
- `index.html`: add `#controlSchemeTog` segmented control near the existing control toggles (~:296-299).
- `ui.js`: bind it with `bindSeg` → `controlScheme` + `saveSettings`; extend `loadSettings`/`saveSettings`
  to persist `controlScheme`; define `window.onMotionStatus` to render `#motionNote` (show/hide + text/colour
  per status: requesting/denied/unsupported/live/no-data/off).
- `styles.css`: style the new toggle (match existing segmented toggles) + status states for `#motionNote`.
- Success: toggle visible, persists across reload, flips feel; motion status line shows live feedback.

### E — Tests  (files: `tests/`)
- Unit-test the pure `steerCommand` (bank-hold: settles to bank, auto-levels at zero intent;
  rate: linear) and the EMA smoothing helper if exposed.
- Keep existing suite green. Use the existing test harness/runner (discover from `package.json`).
- Success: `npm test` (or the repo's runner) all green.

## Out of scope
- Keyboard/desktop control feel. Networked/backend anything (static Capacitor client).
- Changing the iOS Capacitor build config.
