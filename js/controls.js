/* SKYSTRIKE — controls.js: unified flight-input layer (touch stick + motion tilt + haptics).
   Loaded after ui.js, before main.js. Browser globals only (no imports).

   THE SEAM: every analog flight source converges on `flightInput = {pitch, roll}` (globals.js),
   recomputed once per frame by readFlightInput() and consumed by combat.js updatePlayer().
   Keyboard stays digital in combat.js and is ADDED on top before clamping, so desktop is unchanged.
   Pure shaping helpers (shapeAxis/mapFlightInput/motionAxis) + the AGGRESSION table are mirrored
   byte-for-byte in tests/controls.test.js — keep them in sync. */

/* ---------------- pure input shaping (unit-tested) ---------------- */
// dead-zone -> renormalize -> expo blend (linear<->cubic) -> clamp; sign-preserving.
function shapeAxis(v, opts) {
  const dz = (opts && opts.deadzone) || 0;
  const ex = (opts && opts.expo) || 0;
  const a = Math.abs(v);
  if (a <= dz) return 0;
  const n = (a - dz) / (1 - dz);
  const curved = (1 - ex) * n + ex * n * n * n;
  return clamp(Math.sign(v) * curved, -1, 1);
}

// per-aggression motion tuning. Invariants (asserted in tests):
//   deadzone: casual > balanced > direct ; sens: direct > balanced > casual.
//   autoLevel: reserved for a future roll auto-leveling assist (values + ordering tests
//   exist; runtime wiring is a later step, intentionally not read yet).
const AGGRESSION = {
  casual:   { deadzone: 0.18, expo: 0.55, sens: 0.75, maxAngle: 45, autoLevel: 2.2, pitchClamp: 0.70 },
  balanced: { deadzone: 0.10, expo: 0.35, sens: 1.00, maxAngle: 35, autoLevel: 1.2, pitchClamp: 0.85 },
  direct:   { deadzone: 0.05, expo: 0.15, sens: 1.35, maxAngle: 28, autoLevel: 0.4, pitchClamp: 1.00 },
};

// shape a raw analog axis (touch or tilt) into a flight axis: curve -> sens -> clamp -> invert.
function mapFlightInput(raw, preset, invert) {
  let v = shapeAxis(raw, preset) * (preset && preset.sens != null ? preset.sens : 1);
  v = clamp(v, -1, 1);
  return invert ? -v : v;
}

// motion recenter: tilt relative to the captured neutral offset, normalized by maxAngle.
function motionAxis(angle, offset, maxAngle) {
  return clamp((angle - offset) / maxAngle, -1, 1);
}

/* ---------------- per-frame source selection (the seam writer) ---------------- */
// Picks the active analog source by Settings.mobileControl and writes flightInput{pitch,roll}.
// Keyboard is intentionally NOT read here — combat.js adds digital keys on top before clamping.
function readFlightInput() {
  let pitch = 0, roll = 0;
  if (mobileControl === 'motion' && motionInput.ready) {
    const a = AGGRESSION[motionAggression] || AGGRESSION.balanced;
    // beta -> pitch (push nose down by tilting forward by default; invertPitch flips), gamma -> roll
    const rawPitch = motionAxis(motionInput.beta, motionOffset.beta, a.maxAngle);
    const rawRoll = motionAxis(motionInput.gamma, motionOffset.gamma, a.maxAngle);
    pitch = mapFlightInput(rawPitch, a, !invertPitch) * a.pitchClamp;  // default push-up=climb -> invert raw beta
    roll = mapFlightInput(rawRoll, a, false);
  } else if (isTouchEnabled && joyActive) {
    const a = AGGRESSION[motionAggression] || AGGRESSION.balanced;
    // stick: up (negative y) = climb by default; invertPitch flips. push right (+x) = roll right.
    pitch = mapFlightInput(-touchInput.y, a, invertPitch) * a.pitchClamp;  // cap pitch authority like the motion path
    roll = mapFlightInput(touchInput.x, a, false);
  }
  flightInput.pitch = clamp(pitch, -1, 1);
  flightInput.roll = clamp(roll, -1, 1);
}

/* ---------------- haptics ---------------- */
// short vibration on key events, guarded by the Haptics setting + device support.
function haptic(ms) {
  if (!haptics) return;
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try { navigator.vibrate(ms); } catch (e) {}
}

/* ---------------- motion (device orientation) ---------------- */
function motionSupported() {
  return typeof window !== 'undefined' && typeof window.DeviceOrientationEvent !== 'undefined';
}
function motionNeedsPermission() {
  return motionSupported() && typeof DeviceOrientationEvent.requestPermission === 'function';
}
// landscape mapping: in landscape, the phone's gamma/beta swap roles vs portrait.
function readOrientationAngles(e) {
  const beta = e.beta || 0, gamma = e.gamma || 0;
  const o = (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number')
    ? screen.orientation.angle
    : (typeof window.orientation === 'number' ? window.orientation : 0);
  // landscape: tilt forward/back is gamma; tilt left/right is beta (sign depends on which way it's turned).
  if (o === 90) return { beta: -gamma, gamma: beta };
  if (o === -90 || o === 270) return { beta: gamma, gamma: -beta };
  return { beta: beta, gamma: gamma };  // portrait fallback
}
function onDeviceOrientation(e) {
  const a = readOrientationAngles(e);
  motionInput.beta = a.beta;
  motionInput.gamma = a.gamma;
  if (!motionInput.ready) { recenterMotion(); motionInput.ready = true; }
}
// capture the current attitude as the neutral offset.
function recenterMotion() {
  motionOffset.beta = motionInput.beta;
  motionOffset.gamma = motionInput.gamma;
}
function attachMotionListener() {
  if (motionInput.attached) return;
  window.addEventListener('deviceorientation', onDeviceOrientation, true);
  motionInput.attached = true;
}
// Request iOS 13+ permission from a user gesture; resolve(true) on grant / no-gate, false otherwise.
function requestMotionPermission() {
  return new Promise((resolve) => {
    if (!motionSupported()) { resolve(false); return; }
    if (motionNeedsPermission()) {
      DeviceOrientationEvent.requestPermission()
        .then((res) => { if (res === 'granted') { attachMotionListener(); resolve(true); } else resolve(false); })
        .catch(() => resolve(false));
    } else {
      attachMotionListener();  // Android / other: no permission gate
      resolve(true);
    }
  });
}

/* ---------------- touch controls (floating joystick + action buttons) ---------------- */
function initTouchControls() {
  if (isTouchEnabled) return;   // bind once
  isTouchEnabled = true;

  const joyBase = g('joyBase'), joyStick = g('joyStick');
  const half = innerWidth / 2;
  let radius = (joyBase ? joyBase.getBoundingClientRect().width : 130) / 2 || 65;
  const maxD = radius - 15;

  // Floating joystick: a touch on the LEFT half spawns the base under the thumb.
  function joyStart(e) {
    if (state !== 'playing' || paused) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const tch = e.changedTouches[i];
      if (tch.clientX < half && !joyActive) {
        joyActive = true;
        joyTouchId = tch.identifier;
        joyBaseCenter = { x: tch.clientX, y: tch.clientY };
        if (joyBase) { joyBase.style.left = (tch.clientX - radius) + 'px'; joyBase.style.top = (tch.clientY - radius) + 'px'; joyBase.style.bottom = 'auto'; joyBase.classList.add('floating'); }
        e.preventDefault();
        return;
      }
    }
  }
  function joyMove(e) {
    if (!joyActive) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const tch = e.changedTouches[i];
      if (tch.identifier !== joyTouchId) continue;
      const dx = tch.clientX - joyBaseCenter.x;
      const dy = tch.clientY - joyBaseCenter.y;
      const dist = Math.hypot(dx, dy);
      let nx = dx, ny = dy;
      if (dist > maxD) { nx = (dx / dist) * maxD; ny = (dy / dist) * maxD; }
      if (joyStick) joyStick.style.transform = `translate(${nx}px, ${ny}px)`;
      touchInput.x = clamp(nx / maxD, -1, 1);
      touchInput.y = clamp(ny / maxD, -1, 1);
      e.preventDefault();
      return;
    }
  }
  function joyEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchId) {
        joyActive = false; joyTouchId = null; touchInput.x = 0; touchInput.y = 0;
        if (joyStick) joyStick.style.transform = `translate(0px, 0px)`;
        if (joyBase) joyBase.classList.remove('floating');
        return;
      }
    }
  }
  window.addEventListener('touchstart', joyStart, { passive: false });
  window.addEventListener('touchmove', joyMove, { passive: false });
  window.addEventListener('touchend', joyEnd, { passive: false });
  window.addEventListener('touchcancel', joyEnd, { passive: false });

  // Action buttons (unchanged behavior; always on-screen on the right).
  function bindBtn(id, key, clickAction) {
    const el = g(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); touchBtns[key] = true; if (clickAction) clickAction(); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); touchBtns[key] = false; }, { passive: false });
  }
  bindBtn('tb-gun', 'gun');
  bindBtn('tb-thr', 'thr');
  bindBtn('tb-brk', 'brk');
  bindBtn('tb-msl', 'msl', () => { if (state === 'playing' && !paused) fireMissile(); });
  bindBtn('tb-flr', 'flr', () => { if (state === 'playing' && !paused) deployFlares(); });
  bindBtn('tb-spc', 'spc', () => { if (state === 'playing' && !paused) useSpecial(); });
  bindBtn('tb-lck', 'lck', () => { if (state === 'playing' && !paused) cycleLock(); });
  bindBtn('tb-cam', 'cam', () => { if (state === 'playing' && !paused) cycleCamera(); });

  applyButtonStyle();
}

// Apply opacity + preset layout to the on-screen touch controls (called on init + Settings change).
function applyButtonStyle() {
  const tc = g('touchControls');
  if (!tc) return;
  tc.style.setProperty('--btn-opacity', String(buttonOpacity));
  tc.classList.remove('layout-right', 'layout-left', 'layout-compact');
  tc.classList.add('layout-' + (buttonLayout || 'right'));
}
