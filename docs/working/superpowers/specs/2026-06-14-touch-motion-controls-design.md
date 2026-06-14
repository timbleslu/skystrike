# Touch + Motion Controls — Design Spec

**Date:** 2026-06-14
**Feature:** #1 of 4 (controls → meta-progression → missions+bosses → weather)
**Target branch:** `feat/touch-motion-controls` (off `master`)
**Status:** Approved design, pre-plan

## 1. Overview

Mobile players currently fly with a single fixed-position virtual joystick (`touchInput.x/y` → roll/pitch) plus action buttons (`touchBtns`). This feature:

1. Adds **motion (tilt) controls** as a parallel input mode — fly by tilting the phone.
2. **Reworks the touch stick** to be more intuitive and ergonomic.
3. Adds a configurable **aggressiveness / assist** model, **invert-pitch**, **haptics**, and **button layout/opacity** options.

Desktop keyboard play is unaffected.

## 2. Goals / Non-Goals

**Goals**
- Phone players can choose **Touch** or **Motion** control, switchable in Settings.
- Tilt-to-fly with a default "Balanced" feel and a 3-preset aggressiveness toggle.
- Touch stick is floating (spawns under thumb), with tunable response curve + dead-zone.
- Default pitch is "push-up = climb"; an Invert-Pitch toggle serves stick-flyers.
- Haptic feedback on key events where the device supports it.
- Button opacity + size + preset layouts (Right / Left / Compact).
- All new strings localized EN + ZH; all new settings persisted via the storage seam.

**Non-Goals (YAGNI)**
- No yaw axis, no raw-gyro integration (orientation events only).
- No per-button remapping or free drag-to-reposition editor (preset layouts only).
- No multiplayer / gamepad support.

## 3. Architecture — Unified Input Layer (Approach A)

All flight input converges on one normalized struct consumed by the player update.

```
keyboard (digital) ─┐
touch stick ────────┤→ readFlightInput() → flightInput{pitch,roll} → combat.js player update
motion (tilt) ──────┘     picks source by Settings.mobileControl,
                          shapes via mapFlightInput()
action buttons ─────────────────────────────→ touchBtns (unchanged, always on-screen)
```

- **`flightInput = {pitch, roll}`** — new global (range −1..1), recomputed each frame.
- **`readFlightInput()`** (main.js, called in the game loop before player update) selects the active analog source and writes `flightInput`:
  - `mobileControl === 'motion'` and motion ready → motion source
  - else if touch stick active → touch source
  - else → analog zero (keyboard handled separately, see below)
- **Keyboard stays digital** in combat.js (`down()` arrows/WASD) and is *added* to `flightInput` before clamping, so desktop is unchanged and a plugged-in key always works.
- **`mapFlightInput()` / `shapeAxis(v, opts)`** — pure function: dead-zone → expo curve → invert → clamp(−1,1). Shared by stick and tilt. **Unit-tested** (mirrored byte-identical with source, per project test convention).

This isolates all new logic behind one pure function + one selector, matching the globals-only, mirror-to-test codebase style.

## 4. Motion Source

- Listen to `deviceorientation`; read `beta` (front/back tilt) and `gamma` (left/right tilt).
- Phone held **landscape**: detect orientation (`screen.orientation` / `window.orientation`) and map tilt axes to roll/pitch accordingly.
- **Recenter**: on Enable (and an explicit Recenter action), capture current `beta`/`gamma` as the neutral offset. Raw input = `(angle − offset) / maxAngle`, then through `mapFlightInput` with the active aggression preset.
- **Aggression presets** (3-toggle, default **Balanced**) bundle: auto-level pull, pitch clamp, dead-zone, sensitivity / `maxAngle`.
  - **Casual** — strong auto-level, gentle pitch clamp, large dead-zone, low sensitivity.
  - **Balanced** — bank-to-turn + moderate auto-level (default).
  - **Direct** — near 1:1 attitude, minimal assist, small dead-zone.
  - Exact constants tuned during implementation; ordering invariants (casual deadzone > balanced > direct; direct sens > balanced > casual) asserted in tests.

### iOS permission flow
- iOS 13+ requires `DeviceOrientationEvent.requestPermission()` invoked from a **user gesture**.
- Provide an **"Enable Motion"** button (Settings + first-time prompt when Motion is selected).
- On grant → attach listener, persist enabled state.
- On deny / unsupported / no `DeviceOrientationEvent` → fall back to Touch and show a localized notice.
- Android / other → attach listener directly (no permission gate).

## 5. Touch Improvements

- **Floating joystick** — a touch anywhere on the left half spawns the joystick base at the touch point (recode `handleJoyMove` to use a dynamic center instead of the fixed `joyBaseCenter`).
- **Response curve + dead-zone** — applied via `mapFlightInput` (benefits motion too).
- **Intuitive mapping** — default **push-up = climb** (point-to-fly); **Invert Pitch** toggle flips it for stick/sim players. Roll stays bank-to-turn (push right = bank + turn right).
- **Haptics** — `haptic(ms)` helper guarded by `navigator.vibrate` + the Haptics setting; fired on gun fire, missile lock, taking a hit, dealing a hit/kill.
- **Layout / opacity** — bigger safe-area-aware hit-targets; button **opacity** slider; **preset layouts** (Right-handed / Left-handed / Compact) that reposition the on-screen controls. Reuses existing iOS safe-area CSS.

## 6. Settings

New settings, surfaced in the Settings tab, persisted via `saveSettings` (storage.js only):

| Setting | Values | Default |
|---|---|---|
| `mobileControl` | `touch` / `motion` | `touch` |
| `motionAggression` | `casual` / `balanced` / `direct` | `balanced` |
| `invertPitch` | bool | `false` (push-up = climb) |
| `haptics` | bool | `true` |
| `buttonOpacity` | 0.4–1.0 | ~0.8 |
| `buttonLayout` | `right` / `left` / `compact` | `right` |

Existing `controlSensitivity` slider stays and still applies.

## 7. Persistence & i18n

- **Persistence:** all new settings flow through `saveSettings`/`loadSettings`; no direct `localStorage` access outside `storage.js` (enforced by `tests/storage.test.js`).
- **i18n:** every new label/notice gets EN + ZH entries in `js/i18n.js` (mode labels, aggression presets, invert, enable-motion, recenter, permission-denied notice, layout names, haptics).

## 8. Testing

- **`tests/controls.test.js`** (new, plain Node, mirrored helpers byte-identical with source):
  - `shapeAxis`: dead-zone zeros sub-threshold input; expo is monotonic; invert flips sign; output clamped to [−1,1].
  - Aggression preset table: ordering invariants (dead-zone and sensitivity monotonic across casual/balanced/direct).
  - Motion recenter math: `(angle − offset)` neutralizes at the captured offset.
- **`tests/storage.test.js`** stays green (no new direct localStorage).
- **Manual device smoke** (headless can't simulate touch/orientation): iOS Safari permission prompt + tilt fly + recenter; floating stick under thumb; haptics; opacity + each layout; EN/ZH labels.

## 9. Files Touched

| File | Change |
|---|---|
| `js/globals.js` | `flightInput`, `motionInput`, motion offsets, new settings state, `AGGRESSION` preset table, `shapeAxis`/`mapFlightInput` |
| `js/main.js` | `deviceorientation` listener + permission flow + recenter, floating-stick recode, `readFlightInput()` loop hook, haptic wiring |
| `js/combat.js` | read `flightInput` for pitch/roll (replace `touchInput` lines), haptic on fire/hit |
| `js/ui.js` | Settings UI (mode, aggression toggle, invert, haptics, opacity, layout) + save/load + apply |
| `js/i18n.js` | EN + ZH strings |
| `index.html` | Enable-Motion button, opacity CSS var, safe-area on button layouts |
| `tests/controls.test.js` | new unit tests |
| `CLAUDE.md` | update Current state + Architecture (input layer convention) |

## 10. Acceptance Criteria

1. `npm test` green, including new `controls.test.js`; `storage.test.js` still green.
2. Touch stick floats under the thumb on left-half touch and flies the plane.
3. Motion mode: Enable → iOS permission prompt → tilt flies the plane; Recenter works; deny/unsupported falls back to Touch with a notice.
4. Aggression toggle (Casual/Balanced/Direct) changes feel; preset ordering invariants asserted in tests.
5. Invert Pitch flips pitch for both touch and motion.
6. Haptics fire on fire/lock/hit/damage when enabled + supported; silent when off/unsupported.
7. Button opacity slider + preset layout (Right/Left/Compact) apply and persist across reload.
8. All new strings render in EN and ZH.
9. Settings persist via the storage seam; no direct `localStorage` outside `storage.js`.
10. Desktop keyboard control is unchanged.
