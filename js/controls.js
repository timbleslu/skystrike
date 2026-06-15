/* SKYSTRIKE — controls.js: unified flight-input layer (touch stick + motion tilt + haptics).
   Loaded after ui.js, before main.js. Browser globals only (no imports).

   THE SEAM: every analog flight source converges on `flightInput = {pitch, roll}` (globals.js),
   recomputed once per frame by readFlightInput() and consumed by combat.js updatePlayer().
   Keyboard stays digital in combat.js and is ADDED on top before clamping, so desktop is unchanged.
   Pure shaping helpers (shapeAxis/mapFlightInput/motionAxis/emaSmooth) + the AGGRESSION table now
   live in core.js (require-safe; tests import them directly — no byte-identical mirror). */

/* ---------------- pure input shaping → core.js (shapeAxis, AGGRESSION, mapFlightInput, motionAxis, emaSmooth) ---------------- */

/* ---------------- per-frame source selection (the seam writer) ---------------- */
// Picks the active analog source by Settings.mobileControl and writes flightInput{pitch,roll}.
// Keyboard is intentionally NOT read here — combat.js adds digital keys on top before clamping.
let motionPrevState = '';
// ---- motion smoothing + no-data watchdog + status-seam state ----
const MOTION_EMA_ALPHA = 0.2;     // EMA low-pass factor on the tilt axes (lower = smoother)
const MOTION_NODATA_MS = 1500;    // no deviceorientation event within this window => 'no-data'
let motionSmoothed = false;       // false => next event seeds the EMA (no startup lag spike)
let motionSm = { beta: 0, gamma: 0 };
let motionWatchdog = null;        // one-shot setTimeout; fires 'no-data' if no event arrives
let motionOffWatch = null;        // interval that detects mobileControl leaving 'motion' (menu or in-flight)
// fire the motion status seam if the UI provided a handler (optional-chaining => never crashes).
function emitMotionStatus(status, msg) {
  if (typeof window !== 'undefined') window.onMotionStatus?.(status, msg);
}
function clearMotionWatchdog() { if (motionWatchdog) { clearTimeout(motionWatchdog); motionWatchdog = null; } }
// (re)arm the no-data watchdog: if no event lands within MOTION_NODATA_MS, report 'no-data'.
function armMotionWatchdog() {
  if (typeof setTimeout !== 'function') return;
  clearMotionWatchdog();
  motionWatchdog = setTimeout(() => { motionWatchdog = null; emitMotionStatus('no-data'); }, MOTION_NODATA_MS);
}
// Watch for motion being disabled. ui.js toggles `mobileControl` to 'touch' directly (menu or
// fallback) without calling controls.js, and the per-frame seam only runs while playing — so a
// state-independent poll is the one reliable place to surface 'off'. Self-cancels on the edge.
function startMotionOffWatch() {
  if (typeof setInterval !== 'function' || motionOffWatch) return;
  motionOffWatch = setInterval(() => {
    if (typeof mobileControl !== 'undefined' && mobileControl === 'motion') return;
    clearInterval(motionOffWatch); motionOffWatch = null;
    clearMotionWatchdog();          // no dangling 'no-data' after motion is off
    emitMotionStatus('off');
  }, 400);
}
function readFlightInput() {
  // At sortie start, (re)bind motion and recapture the neutral attitude at the moment play begins —
  // not whatever attitude the phone was at when Motion was toggled on in the menu (which left the
  // controls biased/unresponsive). The manual Recenter button still works mid-flight.
  if (state === 'playing' && motionPrevState !== 'playing' && mobileControl === 'motion') {
    attachMotionListener();
    if (motionInput.ready) recenterMotion();
  }
  motionPrevState = state;
  let pitch = 0, roll = 0;
  if (mobileControl === 'motion' && motionInput.ready) {
    const a = AGGRESSION[motionAggression] || AGGRESSION.balanced;
    // beta -> pitch (push nose down by tilting forward by default; invertY flips), gamma -> roll
    const rawPitch = motionAxis(motionInput.beta, motionOffset.beta, a.maxAngle);
    const rawRoll = motionAxis(motionInput.gamma, motionOffset.gamma, a.maxAngle);
    pitch = mapFlightInput(rawPitch, a, !invertY) * a.pitchClamp;  // default push-up=climb -> invert raw beta
    roll = mapFlightInput(rawRoll, a, false);
  } else if (isTouchEnabled && joyActive) {
    const a = AGGRESSION[motionAggression] || AGGRESSION.balanced;
    // DIRECTIONAL joystick: the jet flies TOWARD the stick — up = climb, down = dive, left/right = bank that way.
    // (combat.js applies pitchIn = -pitchCmd and +pitchRate = nose up, so +touchInput.y / pull-down -> dive.)
    // MOBILE invert flips the WHOLE stick: s negates BOTH pitch and roll, so the jet flies OPPOSITE the stick.
    // This is deliberately different from the keyboard invert (combat.js), which flips pitch only.
    const s = invertY ? -1 : 1;
    pitch = mapFlightInput(s * touchInput.y, a, false) * a.pitchClamp;
    roll = mapFlightInput(s * touchInput.x, a, false);
  }
  flightInput.pitch = clamp(pitch, -1, 1);
  flightInput.roll = clamp(roll, -1, 1);
  paintThrSlider();   // keep the touch THR slider visual in sync with player.throttle each frame
}

/* ---------------- THR throttle slider (touch) ---------------- */
// Drag the vertical track to set player.throttle directly (0 = bottom, 1 = top). Replaces the old
// momentary THR/BRK touch buttons. combat.js no longer ramps throttle on touch (touchBtns.thr/brk
// stay false there); the slider writes player.throttle and readFlightInput repaints it each frame.
// Keyboard Shift/Ctrl throttle is unchanged (desktop unaffected).
let thrTouchId = null;
function paintThrSlider() {
  const sl = g('tb-thr'); if (!sl) return;
  const fill = g('tb-thr-fill'), thumb = g('tb-thr-thumb');
  const frac = clamp(player ? player.throttle : 0, 0, 1);
  if (fill) fill.style.height = (frac * 100) + '%';
  if (thumb) thumb.style.bottom = (frac * Math.max(0, sl.clientHeight - thumb.offsetHeight)) + 'px';
}
function bindThrSlider() {
  const sl = g('tb-thr'); if (!sl) return;
  const setFromTouch = (touch) => {
    const r = sl.getBoundingClientRect();
    if (player) player.throttle = clamp(1 - (touch.clientY - r.top) / r.height, 0, 1);   // top of track = full throttle
    paintThrSlider();
  };
  sl.addEventListener('touchstart', (e) => {
    if (state !== 'playing' || paused) return;
    e.preventDefault(); e.stopPropagation();
    thrTouchId = e.changedTouches[0].identifier;
    setFromTouch(e.changedTouches[0]);
  }, { passive: false });
  sl.addEventListener('touchmove', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === thrTouchId) { e.preventDefault(); e.stopPropagation(); setFromTouch(e.changedTouches[i]); }
    }
  }, { passive: false });
  const end = (e) => { for (let i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === thrTouchId) thrTouchId = null; };
  sl.addEventListener('touchend', end, { passive: false });
  sl.addEventListener('touchcancel', end, { passive: false });
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
  // EMA low-pass the raw axes so sensor jitter is removed before they reach the seam.
  // Seed directly on the first event after enable/recenter so there is no startup lag spike.
  if (!motionSmoothed) { motionSm.beta = a.beta; motionSm.gamma = a.gamma; motionSmoothed = true; }
  else {
    motionSm.beta = emaSmooth(motionSm.beta, a.beta, MOTION_EMA_ALPHA);
    motionSm.gamma = emaSmooth(motionSm.gamma, a.gamma, MOTION_EMA_ALPHA);
  }
  motionInput.beta = motionSm.beta;
  motionInput.gamma = motionSm.gamma;
  // Any event means the sensor is alive — cancel the no-data watchdog (idempotent).
  clearMotionWatchdog();
  // First real event after enable: capture neutral + report 'live'.
  const wasReady = motionInput.ready;
  if (!motionInput.ready) { recenterMotion(); motionInput.ready = true; }
  if (!wasReady) emitMotionStatus('live');
}
// capture the current attitude as the neutral offset.
function recenterMotion() {
  motionOffset.beta = motionInput.beta;
  motionOffset.gamma = motionInput.gamma;
  // Snap the EMA state to the current attitude so the smoother starts coherent (no post-recenter drift).
  motionSm.beta = motionInput.beta;
  motionSm.gamma = motionInput.gamma;
  motionSmoothed = true;
}
function attachMotionListener() {
  // On (re)enable: reset smoothing so a stale EMA value can't drag the first reading, force the
  // next event through the first-event path (recenter + 'live'), and (re)arm the no-data watchdog
  // so a silent sensor surfaces as 'no-data'.
  motionSmoothed = false;
  motionInput.ready = false;
  armMotionWatchdog();
  startMotionOffWatch();              // surface 'off' when the user later disables motion
  if (motionInput.attached) return;   // bind the listener once; resets above still run on re-entry
  window.addEventListener('deviceorientation', onDeviceOrientation, true);
  motionInput.attached = true;
}
// Request iOS 13+ permission from a user gesture; resolve(true) on grant / no-gate, false otherwise.
function requestMotionPermission() {
  return new Promise((resolve) => {
    if (!motionSupported()) { emitMotionStatus('unsupported'); resolve(false); return; }
    if (motionNeedsPermission()) {
      emitMotionStatus('requesting');
      DeviceOrientationEvent.requestPermission()
        .then((res) => {
          if (res === 'granted') { attachMotionListener(); resolve(true); }
          else { emitMotionStatus('denied'); resolve(false); }
        })
        .catch(() => { emitMotionStatus('denied'); resolve(false); });
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
    // keep the joystick zone below the top HUD bar so the pause button (top-center) stays tappable
    const pb = g('btnPause');
    const pbr = pb && pb.getBoundingClientRect();
    const topGuard = (pbr && pbr.bottom > 0) ? pbr.bottom + 12 : 100;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const tch = e.changedTouches[i];
      if (tch.clientX < half && tch.clientY > topGuard && !joyActive) {
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
        // Barrel-roll touch double-tap: release with strong lateral deflection twice within threshold
        if (state === 'playing' && !paused && Math.abs(touchInput.x) > 0.6) {
          const now = performance.now() / 1000;
          if (rollDetect(now, barrelRollLastTouchTap, BARREL_ROLL_THRESHOLD) && rollCooldownGate(barrelRollCooldown)) {
            barrelRollRequest = true;
          }
          barrelRollLastTouchTap = now;
        }
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
  bindThrSlider();   // THR slider replaces the old thr/brk momentary buttons (sets player.throttle directly)
  bindBtn('tb-msl', 'msl', () => { if (state === 'playing' && !paused) fireMissile(); });
  bindBtn('tb-flr', 'flr', () => { if (state === 'playing' && !paused) deployFlares(); });
  bindBtn('tb-spc', 'spc', () => { if (state === 'playing' && !paused) useSpecial(); });
  bindBtn('tb-spc2', 'spc2', () => { if (state === 'playing' && !paused) useSpecial(2); });   // feature #3: equipped SLOT-2 special
  bindBtn('tb-lck', 'lck', () => { if (state === 'playing' && !paused) cycleLock(); });
  bindBtn('tb-cam', 'cam', () => { if (state === 'playing' && !paused) cycleCamera(); });
  bindBtn('tb-aws', 'aws', () => { if (state === 'playing' && !paused) awacsAction('strike'); });    // AWACS orbital strike
  bindBtn('tb-ars', 'ars', () => { if (state === 'playing' && !paused) awacsAction('resupply'); });   // AWACS resupply
  bindBtn('tb-ajm', 'ajm', () => { if (state === 'playing' && !paused) awacsAction('jam'); });        // AWACS jamming

  applyButtonStyle();
}

// Apply opacity + scale + preset layout to the on-screen touch controls (called on init + Settings change).
// --ctrl-scale maps hudScale linearly: Small(0.8)→0.75, Normal(1.0)→0.89, Large(1.15)→1.0, XL(1.3)→1.1
function applyButtonStyle() {
  const tc = g('touchControls');
  if (!tc) return;
  tc.style.setProperty('--btn-opacity', String(buttonOpacity));
  const hs = (typeof hudScale === 'number') ? hudScale : 1;
  tc.style.setProperty('--ctrl-scale', String(Math.round((hs * 0.7 + 0.19) * 100) / 100));
  tc.classList.remove('layout-right', 'layout-left', 'layout-compact');
  tc.classList.add('layout-' + (buttonLayout || 'right'));
}
