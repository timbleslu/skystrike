/* SKYSTRIKE — flight-input layer (touch stick + mouse + motion tilt + haptics).
   THE SEAM: every analog source converges on `flightInput = {pitch, roll}`, written once per frame by
   readFlightInput() and consumed by combat.js, which ADDS the digital keyboard on top before clamping.
   Pure shaping helpers + AGGRESSION live in core.js. */

let motionPrevState = '';
const MOTION_EMA_ALPHA = 0.2;     // lower = smoother
const MOTION_NODATA_MS = 1500;    // no deviceorientation event within this window => 'no-data'
let motionSmoothed = false;       // false => next event seeds the EMA (no startup lag spike)
let motionSm = { beta: 0, gamma: 0 };
let motionWatchdog = null;
let motionOffWatch = null;
function emitMotionStatus(status, msg) { window.onMotionStatus?.(status, msg); }
function clearMotionWatchdog() { if (motionWatchdog) { clearTimeout(motionWatchdog); motionWatchdog = null; } }
function armMotionWatchdog() {
  clearMotionWatchdog();
  motionWatchdog = setTimeout(() => { motionWatchdog = null; emitMotionStatus('no-data'); }, MOTION_NODATA_MS);
}
// The UI flips `mobileControl` to 'touch' directly and the per-frame seam only runs while playing, so a
// state-independent poll is the one reliable place to surface 'off'. Self-cancels on the edge.
function startMotionOffWatch() {
  if (motionOffWatch) return;
  motionOffWatch = setInterval(() => {
    if (mobileControl === 'motion') return;
    clearInterval(motionOffWatch); motionOffWatch = null;
    clearMotionWatchdog();
    emitMotionStatus('off');
  }, 400);
}
function readFlightInput() {
  // (Re)bind motion and recapture neutral when play begins — not at the attitude Motion was toggled on in the menu.
  if (state === 'playing' && motionPrevState !== 'playing' && mobileControl === 'motion') {
    attachMotionListener();
    if (motionInput.ready) recenterMotion();
  }
  motionPrevState = state;
  let pitch = 0, roll = 0;
  const a = AGGRESSION[motionAggression] || AGGRESSION.balanced;
  if (mobileControl === 'motion' && motionInput.ready) {
    const rawPitch = motionAxis(motionInput.beta, motionOffset.beta, a.maxAngle);
    const rawRoll = motionAxis(motionInput.gamma, motionOffset.gamma, a.maxAngle);
    pitch = mapFlightInput(rawPitch, a, !invertY) * a.pitchClamp;  // default push-up=climb -> invert raw beta
    roll = mapFlightInput(rawRoll, a, false);
  } else {
    // Directional stick (touch joystick, else mouse offset from centre): the jet flies TOWARD it. Invert flips the
    // WHOLE stick (pitch AND roll) — deliberately unlike the keyboard invert (combat.js), which flips pitch only.
    const stick = (isTouchEnabled && joyActive) ? touchInput
                : (mouseFlight && mouseInput.active && state === 'playing') ? mouseInput : null;
    if (stick) {
      const s = invertY ? -1 : 1;
      pitch = mapFlightInput(s * stick.y, a, false) * a.pitchClamp;
      roll = mapFlightInput(s * stick.x, a, false);
    }
  }
  flightInput.pitch = clamp(pitch, -1, 1);
  flightInput.roll = clamp(roll, -1, 1);
  paintThrSlider();
}

// Touch THR slider writes player.throttle directly (combat.js doesn't ramp throttle on touch).
let thrTouchId = null;
let _thrPainted = -1;   // skips the per-frame layout read when nothing changed
function paintThrSlider() {
  if (!isTouchEnabled) return;
  const frac = clamp(player ? player.throttle : 0, 0, 1);
  if (frac === _thrPainted) return;
  const sl = g('tb-thr'); if (!sl) return;
  const fill = g('tb-thr-fill'), thumb = g('tb-thr-thumb');
  const travel = Math.max(0, sl.clientHeight - (thumb ? thumb.offsetHeight : 0));   // read layout before any write
  if (fill) fill.style.height = (frac * 100) + '%';
  if (thumb) thumb.style.bottom = (frac * travel) + 'px';
  if (travel > 0) _thrPainted = frac;   // hidden track (0 height) → repaint once it's laid out
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

function haptic(ms) {
  if (haptics && navigator.vibrate) navigator.vibrate(ms);
}

function motionSupported() {
  return typeof DeviceOrientationEvent !== 'undefined';
}
function motionNeedsPermission() {
  return motionSupported() && typeof DeviceOrientationEvent.requestPermission === 'function';
}
// In landscape the phone's beta/gamma swap roles (sign depends on which way it's turned).
function readOrientationAngles(e) {
  const beta = e.beta || 0, gamma = e.gamma || 0;
  const o = (screen.orientation && typeof screen.orientation.angle === 'number')
    ? screen.orientation.angle
    : (typeof window.orientation === 'number' ? window.orientation : 0);
  if (o === 90) return { beta: -gamma, gamma: beta };
  if (o === -90 || o === 270) return { beta: gamma, gamma: -beta };
  return { beta: beta, gamma: gamma };
}
function onDeviceOrientation(e) {
  const a = readOrientationAngles(e);
  if (!motionSmoothed) { motionSm.beta = a.beta; motionSm.gamma = a.gamma; motionSmoothed = true; }
  else {
    motionSm.beta = emaSmooth(motionSm.beta, a.beta, MOTION_EMA_ALPHA);
    motionSm.gamma = emaSmooth(motionSm.gamma, a.gamma, MOTION_EMA_ALPHA);
  }
  motionInput.beta = motionSm.beta;
  motionInput.gamma = motionSm.gamma;
  clearMotionWatchdog();
  if (!motionInput.ready) { recenterMotion(); motionInput.ready = true; emitMotionStatus('live'); }
}
function recenterMotion() {
  motionOffset.beta = motionInput.beta;
  motionOffset.gamma = motionInput.gamma;
  motionSm.beta = motionInput.beta;   // snap the EMA so there's no post-recenter drift
  motionSm.gamma = motionInput.gamma;
  motionSmoothed = true;
}
// On (re)enable: drop stale smoothing, force the next event through the first-event path (recenter + 'live'),
// and arm the watchdog so a silent sensor surfaces as 'no-data'. The listener itself binds once.
function attachMotionListener() {
  motionSmoothed = false;
  motionInput.ready = false;
  armMotionWatchdog();
  startMotionOffWatch();
  if (motionInput.attached) return;
  window.addEventListener('deviceorientation', onDeviceOrientation, true);
  motionInput.attached = true;
}
// iOS 13+ permission (must run from a user gesture); resolves true on grant / no gate.
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
      attachMotionListener();
      resolve(true);
    }
  });
}

function initTouchControls() {
  if (isTouchEnabled) return;
  isTouchEnabled = true;
  document.documentElement.classList.add('is-touch');

  const joyBase = g('joyBase'), joyStick = g('joyStick');
  const half = innerWidth / 2;
  let radius = (joyBase ? joyBase.getBoundingClientRect().width : 130) / 2 || 65;
  const maxD = radius - 15;

  // Floating joystick: a touch on the LEFT half spawns the base under the thumb.
  function joyStart(e) {
    if (state !== 'playing' || paused) return;
    // keep the joystick zone below the top HUD bar so the pause button stays tappable
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
        // barrel roll: two releases with strong lateral deflection within the double-tap threshold
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

  // tap actions only fire while flying, unpaused
  function bindBtn(id, key, clickAction) {
    const el = g(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); touchBtns[key] = true; if (clickAction && state === 'playing' && !paused) clickAction(); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); touchBtns[key] = false; }, { passive: false });
  }
  bindBtn('tb-gun', 'gun');
  bindThrSlider();
  bindBtn('tb-msl', 'msl', () => fireMissile());
  bindBtn('tb-flr', 'flr', () => deployFlares());
  bindBtn('tb-spc', 'spc', () => useSpecial());
  bindBtn('tb-spc2', 'spc2', () => useSpecial(2));
  bindBtn('tb-lck', 'lck', () => cycleLock());
  bindBtn('tb-cam', 'cam', () => cycleCamera());
  bindBtn('tb-aws', 'aws', () => awacsAction('strike'));
  bindBtn('tb-ars', 'ars', () => awacsAction('resupply'));
  bindBtn('tb-ajm', 'ajm', () => awacsAction('jam'));
  bindBtn('tb-weng', 'weng', () => issueWingOrder('ENGAGE'));
  bindBtn('tb-wcov', 'wcov', () => issueWingOrder('COVER'));
  bindBtn('tb-wrgp', 'wrgp', () => issueWingOrder('REGROUP'));

  applyButtonStyle();
}

// --ctrl-scale maps hudScale linearly: Small(0.8)→0.75, Normal(1.0)→0.89, Large(1.15)→1.0, XL(1.3)→1.1
function applyButtonStyle() {
  const tc = g('touchControls');
  if (!tc) return;
  tc.style.setProperty('--btn-opacity', String(buttonOpacity));
  tc.style.setProperty('--ctrl-scale', String(Math.round((hudScale * 0.7 + 0.19) * 100) / 100));
  tc.classList.remove('layout-right', 'layout-left', 'layout-compact');
  tc.classList.add('layout-' + buttonLayout);
}

// Desktop mouse-pointer flight (off by default): the pointer offset from centre feeds mouseInput.
window.addEventListener('mousemove', (e) => {
  if (!mouseFlight || state !== 'playing' || paused) return;
  const nx = clamp((e.clientX - innerWidth / 2) / (innerWidth / 2), -1, 1);
  const ny = clamp((e.clientY - innerHeight / 2) / (innerHeight / 2), -1, 1);
  if (Math.hypot(nx, ny) < 0.06) { mouseInput.x = 0; mouseInput.y = 0; mouseInput.active = true; return; }   // dead-zone so the jet can fly straight
  mouseInput.x = nx; mouseInput.y = ny; mouseInput.active = true;
}, { passive: true });
// Left-click on the play field fires the gun (independent of mouse flight); UI clicks are ignored.
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || state !== 'playing' || paused) return;
  if (e.target && e.target.closest && e.target.closest('button, input, select, a, .segbtn, #manual, #touchControls')) return;
  mouseFiring = true;
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseFiring = false; });
window.addEventListener('blur', () => { mouseFiring = false; });
