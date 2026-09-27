
// Per-jet engine timbre table: baseAdd shifts the idle pitch, ratio scales the 2nd oscillator,
// lpAdd opens/closes the filter for brighter vs throatier tones.
const JET_ENG_PARAMS = {
  'FT-1':   { baseAdd:  0, ratio: 1.50, lpAdd:   0 },
  'F-22':   { baseAdd: -6, ratio: 1.48, lpAdd: -30 },
  'SU-57':  { baseAdd: 10, ratio: 1.62, lpAdd:  40 },
  'J-20':   { baseAdd:  4, ratio: 1.58, lpAdd:  20 },
  'F-35':   { baseAdd: -4, ratio: 1.44, lpAdd: -20 },
  'EFT':    { baseAdd:  8, ratio: 1.60, lpAdd:  30 },
  'RAFALE': { baseAdd:  6, ratio: 1.56, lpAdd:  20 },
  'TEJAS':  { baseAdd: -2, ratio: 1.45, lpAdd: -10 },
  'FA18':   { baseAdd:  2, ratio: 1.52, lpAdd:  10 },
  'J-36':   { baseAdd:-10, ratio: 1.40, lpAdd: -50 },
  'F-47':   { baseAdd:-12, ratio: 1.38, lpAdd: -60 },
  'J-50':   { baseAdd:  3, ratio: 1.54, lpAdd:  10 },
};
class AudioEngine {
  constructor() { this.on = false; }
  init() {
    if (this.ctx) { this.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = muted ? 0 : volume;
    this.master.connect(this.ctx.destination);
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    this.on = true;
    this.startEngine();
    this.resume();
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMaster(v) { if (this.master) this.master.gain.value = v; }
  noise() { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.start(); return s; }
  startEngine() {
    const ctx = this.ctx;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360;
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 56;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 86; o2.detune.value = 6;
    const og2 = ctx.createGain(); og2.gain.value = 0.45;
    const n = this.noise(); const ng = ctx.createGain(); ng.gain.value = 0.05;
    const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = 300; nbp.Q.value = 0.6;
    o1.connect(lp); o2.connect(og2); og2.connect(lp); lp.connect(this.engGain);
    n.connect(nbp); nbp.connect(ng); ng.connect(this.engGain);
    this.engGain.connect(this.master);
    o1.start(); o2.start();
    this.eO1 = o1; this.eO2 = o2; this.eLP = lp;
  }
  // Ramp the engine hum to silence on flight exit. Oscillators are KEPT running (not .stop()'d) —
  // setEngineJet ramps engGain back up on the next flight. Without this, the hum HOLDS at
  // its last value whenever the flight loop stops driving it.
  stopEngine() { if (this.on && this.engGain) this.engGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12); }
  setEngineJet(jetId, thr, sf) {
    if (!this.on) return;
    const p = JET_ENG_PARAMS[jetId] || JET_ENG_PARAMS['FT-1'];
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(0.028 + thr * 0.042, t, 0.2);
    const f = 48 + p.baseAdd + thr * 56 + sf * 28;
    this.eO1.frequency.setTargetAtTime(f, t, 0.2);
    this.eO2.frequency.setTargetAtTime(f * p.ratio, t, 0.2);
    this.eLP.frequency.setTargetAtTime(240 + p.lpAdd + thr * 480 + sf * 220, t, 0.2);
  }
  // enveloped oscillator: starts at t0 on f0 (ramping to f1 by t0+fT when f1 is set), gain 0 → peak at t0+atk →
  // silent at t0+end, stopped at t0+stop. Times are relative to t0.
  tone(type, t0, f0, f1, fT, peak, atk, end, stop) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + fT);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + end);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + stop);
  }
  lockTone() {   // rising sweep, then a held lock tone
    if (!this.on) return;
    const now = this.ctx.currentTime;
    this.tone('sine', now, 300, 1600, 0.30, 0.13, 0.005, 0.32, 0.35);
    this.tone('sine', now + 0.28, 1800, 0, 0, 0.15, 0.02, 0.18, 0.22);
  }
  killSfx() {
    if (!this.on) return;
    this.burst(0.18, 0.28, 'bandpass', 1800, 400);
    this.tone('sawtooth', this.ctx.currentTime, 160, 30, 0.45, 0.12, 0.008, 0.48, 0.52);
  }
  blip(freq, dur, type, gain, slideTo) {
    if (!this.on) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    g.gain.value = 0.0001;
    g.gain.linearRampToValueAtTime(gain || 0.2, ctx.currentTime + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(ctx.currentTime + dur + 0.03);
  }
  burst(dur, gain, ftype, ffreq, fslide) {
    if (!this.on) return;
    const ctx = this.ctx, s = this.noise(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = ftype || 'lowpass'; f.frequency.value = ffreq || 1000;
    if (fslide) f.frequency.exponentialRampToValueAtTime(Math.max(40, fslide), ctx.currentTime + dur);
    g.gain.value = gain || 0.4;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    setTimeout(() => { try { s.stop(); } catch (e) {} }, dur * 1000 + 80);
  }
  gun()      { this.blip(880, 0.05, 'square', 0.10, 480); }
  enemyGun() { this.blip(440, 0.05, 'sawtooth', 0.05, 280); }
  missile()  { this.burst(0.5, 0.22, 'lowpass', 1300, 220); this.blip(300, 0.5, 'sawtooth', 0.10, 80); }
  explode(big){ this.burst(big ? 0.95 : 0.45, big ? 0.55 : 0.38, 'lowpass', big ? 1600 : 1200, 60); this.blip(big ? 85 : 140, 0.4, 'sine', 0.14, 38); }
  warn()     { this.blip(720, 0.12, 'square', 0.12); }
  hit()      { this.blip(1300, 0.04, 'square', 0.08, 1700); }
  ui()       { this.blip(560, 0.05, 'square', 0.09, 880); }
  flare()    { this.burst(0.3, 0.18, 'highpass', 900, 2200); }
  power()    { this.blip(280, 0.35, 'sawtooth', 0.16, 920); }
  ping()     { this.blip(1046, 0.09, 'sine', 0.12, 1568); }
  radio()    { this.burst(0.07, 0.07, 'bandpass', 2600, 1700); this.blip(1320, 0.05, 'square', 0.035, 1050); }
  stamp(win) { if (win) { this.blip(392, 0.22, 'triangle', 0.14, 392); this.blip(523, 0.5, 'triangle', 0.12, 523); } else { this.blip(220, 0.5, 'sawtooth', 0.10, 110); } }
  hurt()     { this.burst(0.25, 0.3, 'lowpass', 700, 120); }

  // Built once and kept alive (an ambience like the engine voice) — gated by gain in setRain(), never
  // re-created, so it can't leak voices over a long session.
  _ensureRainBed() {
    if (!this.on || this.rainGain) return;
    const ctx = this.ctx;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    const n = this.noise();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';  lp.frequency.value = 1400; lp.Q.value = 0.4;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 320;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency); lfo.start();
    n.connect(lp); lp.connect(bp); bp.connect(this.rainGain); this.rainGain.connect(this.master);
  }
  setRain(active) {
    if (!this.on || active === this._rainOn) return;
    this._rainOn = active;
    if (active) this._ensureRainBed();
    if (!this.rainGain) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(active ? 0.06 : 0, t, 0.5);
  }
  tickWeather() {
    if (!this.on) return;
    this.setRain(weather.type === 'storm' && state === 'playing' && !paused);
  }
  thunder(intensity) {
    if (!this.on) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const k = clamp(intensity || 0, 0, 1);
    const rs = this.noise(), rg = ctx.createGain(), rf = ctx.createBiquadFilter();
    rf.type = 'lowpass'; rf.frequency.setValueAtTime(420, now);
    rf.frequency.exponentialRampToValueAtTime(90, now + 1.3);
    rg.gain.setValueAtTime(0.0001, now);
    rg.gain.linearRampToValueAtTime(0.10 + 0.22 * k, now + 0.05);
    rg.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    rs.connect(rf); rf.connect(rg); rg.connect(this.master);
    setTimeout(() => { try { rs.stop(); } catch (e) {} }, 1500);
    this.tone('sine', now, 70, 30, 0.9, 0.10 + 0.18 * k, 0.04, 1.0, 1.05);
    const delay = 0.12 + (1 - k) * 0.5;
    const cStart = now + delay;
    const cs = this.noise(), cg = ctx.createGain(), cf = ctx.createBiquadFilter();
    cf.type = 'bandpass'; cf.Q.value = 0.7;
    cf.frequency.setValueAtTime(1200 + 2200 * k, cStart);
    cf.frequency.exponentialRampToValueAtTime(400, cStart + 0.35);
    cg.gain.setValueAtTime(0.0001, cStart);
    cg.gain.linearRampToValueAtTime(0.06 + 0.26 * k, cStart + 0.006);
    cg.gain.exponentialRampToValueAtTime(0.0001, cStart + 0.4);
    cs.connect(cf); cf.connect(cg); cg.connect(this.master);
    setTimeout(() => { try { cs.stop(); } catch (e) {} }, (delay + 0.5) * 1000);
  }
}
const audio = new AudioEngine();

const terrainH = terrainHeight;

function initThree() {
  THREE.ColorManagement.enabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070d18);
  scene.fog = new THREE.FogExp2(0x0a1424, FOG_BASE);

  camera = new THREE.PerspectiveCamera(72, W / H, 1, 40000);
  camera.position.set(0, 6, 42); camera.lookAt(0, 2, 0);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.useLegacyLights = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(W, H); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  ambientLight = new THREE.AmbientLight(0x4a5e7a, 0.85); scene.add(ambientLight);
  hemiLight = new THREE.HemisphereLight(0x9fc0ff, 0x21303f, 0.65); scene.add(hemiLight);
  sun = new THREE.DirectionalLight(0xfff0d6, 1.2);
  sun.position.set(0.5, 1.0, 0.35).multiplyScalar(2000); scene.add(sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -650;
  sun.shadow.camera.right = sun.shadow.camera.top = 650;
  sun.shadow.camera.near = 50; sun.shadow.camera.far = 6000;
  sun.shadow.bias = -0.0001; sun.shadow.normalBias = 2.5;
  refreshGfxTier(); applyGfxQuality();
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0x77a8ff, 0.55);
  rim.position.set(-0.5, 0.35, -0.9).multiplyScalar(2000); scene.add(rim); rimLight = rim;

  clock = new THREE.Clock();
  buildSky(); buildTerrain(); buildClouds(); buildAssets(); buildScenery();
  applyTimeOfDay(timeOfDay);

  makePlatform();
  buildGroundObjects();

  const hc = document.getElementById('h2d');
  h2d = hc.getContext('2d'); hc.width = W; hc.height = H;
  radarCanvas = document.getElementById('radar'); radarCtx = radarCanvas.getContext('2d');

  addEventListener('resize', onResize);
}

function onResize() {
  W = innerWidth; H = innerHeight;
  camera.aspect = W / H; camera.updateProjectionMatrix();
  renderer.setSize(W, H);
  if (postFX) sizePostFX();
  const c = document.getElementById('h2d'); c.width = W; c.height = H;
  if(isTouchEnabled) initTouchControls();
}

let postFX = null;
const BLOOM = { threshold: 0.92, knee: 0.45, strength: 0.62, levels: 5 };
function makePostPass(frag, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: frag,
  });
}
function buildPostFX() {
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false };
  const P = { mips: [], tmps: [], quad: null, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene: new THREE.Scene() };
  P.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  for (let i = 0; i < BLOOM.levels; i++) { P.mips.push(new THREE.WebGLRenderTarget(1, 1, rtOpts)); P.tmps.push(new THREE.WebGLRenderTarget(1, 1, rtOpts)); }
  P.bright = makePostPass([
    'uniform sampler2D src; uniform float threshold; uniform float knee; varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(src, vUv).rgb;',
    '  float br = max(c.r, max(c.g, c.b));',
    '  float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);',
    '  gl_FragColor = vec4(c * max(soft, br - threshold) / max(br, 1e-4), 1.0);',
    '}'].join('\n'), { src: { value: null }, threshold: { value: BLOOM.threshold }, knee: { value: BLOOM.knee } });
  P.blur = makePostPass([
    'uniform sampler2D src; uniform vec2 dir; varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(src, vUv).rgb * 0.227027;',
    '  c += (texture2D(src, vUv + dir * 1.384615).rgb + texture2D(src, vUv - dir * 1.384615).rgb) * 0.316216;',
    '  c += (texture2D(src, vUv + dir * 3.230769).rgb + texture2D(src, vUv - dir * 3.230769).rgb) * 0.070270;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'].join('\n'), { src: { value: null }, dir: { value: new THREE.Vector2() } });
  P.composite = makePostPass([
    'uniform sampler2D scene; uniform sampler2D b0; uniform sampler2D b1; uniform sampler2D b2; uniform sampler2D b3; uniform sampler2D b4;',
    'uniform float strength; varying vec2 vUv;',
    'void main(){',
    '  vec3 bloom = texture2D(b0, vUv).rgb * 0.30 + texture2D(b1, vUv).rgb * 0.26 + texture2D(b2, vUv).rgb * 0.20',
    '             + texture2D(b3, vUv).rgb * 0.14 + texture2D(b4, vUv).rgb * 0.10;',
    '  gl_FragColor = vec4(texture2D(scene, vUv).rgb + bloom * strength, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}'].join('\n'), {
      scene: { value: P.rt.texture }, strength: { value: BLOOM.strength },
      b0: { value: P.mips[0].texture }, b1: { value: P.mips[1].texture }, b2: { value: P.mips[2].texture }, b3: { value: P.mips[3].texture }, b4: { value: P.mips[4].texture },
    });
  P.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), P.bright);
  P.quad.frustumCulled = false;
  P.scene.add(P.quad);
  postFX = P;
  sizePostFX();
}
const _pfxSize = new THREE.Vector2();
function sizePostFX() {
  renderer.getDrawingBufferSize(_pfxSize);
  const w = Math.max(1, _pfxSize.x), h = Math.max(1, _pfxSize.y);
  postFX.rt.setSize(w, h);
  for (let i = 0; i < BLOOM.levels; i++) {
    const d = 2 << i;
    postFX.mips[i].setSize(Math.max(1, Math.round(w / d)), Math.max(1, Math.round(h / d)));
    postFX.tmps[i].setSize(Math.max(1, Math.round(w / d)), Math.max(1, Math.round(h / d)));
  }
}
function postPass(mat, target) {
  postFX.quad.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(postFX.scene, postFX.cam);
}
// Bloom renders into half-float targets: WebGL2 AND a float-renderable colour buffer, else render direct.
let _bloomOk = null;
function bloomSupported() {
  if (_bloomOk === null) _bloomOk = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
  return _bloomOk;
}
// THE per-frame world render. Every scene draw goes through here so the bloom path can't be bypassed.
function renderFrame() {
  if (gfxTier !== 'high' || !bloomSupported()) { renderer.render(scene, camera); return; }
  if (!postFX) buildPostFX();
  const P = postFX;
  renderer.setRenderTarget(P.rt);
  renderer.render(scene, camera);
  P.bright.uniforms.src.value = P.rt.texture;
  postPass(P.bright, P.mips[0]);
  for (let i = 0; i < BLOOM.levels; i++) {
    const m = P.mips[i], tmp = P.tmps[i];
    if (i > 0) { P.blur.uniforms.src.value = P.mips[i - 1].texture; P.blur.uniforms.dir.value.set(0, 0); postPass(P.blur, m); }
    P.blur.uniforms.src.value = m.texture; P.blur.uniforms.dir.value.set(1 / m.width, 0); postPass(P.blur, tmp);
    P.blur.uniforms.src.value = tmp.texture; P.blur.uniforms.dir.value.set(0, 1 / m.height); postPass(P.blur, m);
  }
  postPass(P.composite, null);
}

const GFX_SHADOW = {
  low:    { map: 1024, far: 3000 },
  medium: { map: 2048, far: 4500 },
  high:   { map: 2048, far: 6000 },
};
function applyGfxQuality() {
  if (!sun) return;
  const s = GFX_SHADOW[gfxTier] || GFX_SHADOW.high;
  sun.shadow.mapSize.set(s.map, s.map);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }   // force realloc at the new resolution
  sun.shadow.camera.far = s.far;
  sun.shadow.camera.updateProjectionMatrix();
  applyEnvTier();
}

function applyEnvTier() {
  if (!scene || !terrainMesh || !seaMesh) return;   // first boot: meshes not built yet (no-op; built tier-aware)
  retuneTerrain();
  retuneSea();
  buildGroundObjects();
  applyWeather(weather.type);
}

function buildSky() {
  const geo = new THREE.SphereGeometry(22000, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x081230) }, bot: { value: new THREE.Color(0x1d4a63) }, hor: { value: new THREE.Color(0x2a6a7a) },
      sunDir: { value: new THREE.Vector3(0.5, 1.0, 0.35).normalize() }, sunCol: { value: new THREE.Color(0xfff3d0) }, scatter: { value: 1.0 },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'varying vec3 vP; uniform vec3 top; uniform vec3 bot; uniform vec3 hor;',
      'uniform vec3 sunDir; uniform vec3 sunCol; uniform float scatter;',
      'void main(){',
      '  vec3 d = normalize(vP);',
      '  float h = d.y;',
      '  vec3 c = h>0.0 ? mix(hor,top,pow(h,0.55)) : mix(hor,bot,pow(-h,0.7));',
      '  float s = max(dot(d, sunDir), 0.0);',
      '  c += sunCol * (pow(s, 20.0) * 0.5 + pow(s, 3.0) * 0.16) * scatter;',
      '  c += hor * pow(1.0 - abs(h), 6.0) * 0.18;',
      '  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 160.0;',
      '  gl_FragColor = vec4(c, 1.0);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n')
  });
  scene.add(new THREE.Mesh(geo, mat));
  skyMat = mat;
  const g = new THREE.Mesh(new THREE.SphereGeometry(420, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3d0, fog: false }));
  g.position.copy(sun.position).setLength(18000); scene.add(g); sunDisc = g;
}

let terrainMesh;
const TERRAIN_SIZE = 26000;
let arenaBiome = 'temperate';
function arenaBiomeId() {
  if (campaignMode && campaignOpId) {
    const op = OPERATIONS.find(o => o.id === campaignOpId);
    if (op && op.biome) return op.biome;
  }
  return 'temperate';
}
function syncArenaBiome() {
  const id = arenaBiomeId();
  if (id === arenaBiome) return;
  arenaBiome = id;
  if (terrainMesh) paintTerrain(terrainMesh.geometry, biomeFor(id));
  if (seaMat) applyTimeOfDay(timeOfDay);
}
// Build the displaced+coloured terrain geometry for a tier cfg (Track B §2). terrainH is the SOLE
// gameplay/shadow base and is NEVER scaled per tier; cfg.detailAmp adds a tier-only VISUAL displacement
// (terrainDetailH) on top, and the analytic normal folds in its gradient so lighting matches the relief.
// Colours come from paintTerrain for the live arena biome. Returns a fresh BufferGeometry.
function buildTerrainGeo(cfg) {
  const SEG = cfg.seg;
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const normals = new Float32Array(pos.count * 3), E = 14;
  const H = cfg.detailAmp > 0 ? (x, z) => terrainH(x, z) + terrainDetailH(x, z, cfg) : terrainH;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, H(x, z));
    const dhx = (H(x + E, z) - H(x - E, z)) / (2 * E);
    const dhz = (H(x, z + E) - H(x, z - E)) / (2 * E);
    const inv = 1 / Math.hypot(dhx, 1, dhz);
    normals[i * 3] = -dhx * inv; normals[i * 3 + 1] = inv; normals[i * 3 + 2] = -dhz * inv;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  paintTerrain(geo, biomeFor(arenaBiome));
  return geo;
}
const _tc = { low: new THREE.Color(), mid: new THREE.Color(), high: new THREE.Color() };
const terrainU = { sandCol: { value: new THREE.Color() }, rockCol: { value: new THREE.Color() }, snowCol: { value: new THREE.Color() }, snowLine: { value: 99999 } };
function paintTerrain(geo, B) {
  const pos = geo.attributes.position;
  _tc.low.setHex(B.low); _tc.mid.setHex(B.mid); _tc.high.setHex(B.high);
  terrainU.sandCol.value.setHex(B.sand); terrainU.rockCol.value.setHex(B.rock); terrainU.snowCol.value.setHex(B.snow);
  terrainU.snowLine.value = B.snowLine;
  let col = geo.attributes.color;
  if (!col) { col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3); geo.setAttribute('color', col); }
  const colors = col.array, c = new THREE.Color();
  const ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);
    const n1 = valueNoise2(x * 0.004 + 1.3, z * 0.004 - 2.9);
    c.copy(_tc.low).lerp(_tc.mid, ss(30, 330, h + n1 * 70));
    c.lerp(_tc.high, ss(330, 640, h + n1 * 90));
    const j = 1 + n1 * 0.06;
    colors[i * 3] = c.r * j; colors[i * 3 + 1] = c.g * j; colors[i * 3 + 2] = c.b * j;
  }
  col.needsUpdate = true;
}
let terrainTierBuilt = null;
function terrainCfg() { return TERRAIN_TIER[gfxTier] || TERRAIN_TIER.low; }
function buildTerrain() {
  const geo = buildTerrainGeo(terrainCfg());
  terrainTierBuilt = gfxTier;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.95 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, terrainU);   // shared uniform objects → biome swaps need no recompile
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWNrm = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'varying vec3 vWPos; varying vec3 vWNrm;',
        'uniform vec3 sandCol; uniform vec3 rockCol; uniform vec3 snowCol; uniform float snowLine;',
        'float thash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float tnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);',
        '  return mix(mix(thash(i), thash(i+vec2(1,0)), u.x), mix(thash(i+vec2(0,1)), thash(i+vec2(1,1)), u.x), u.y); }',
        'float tfbm(vec2 p){ return 0.55*tnoise(p) + 0.28*tnoise(p*2.7) + 0.17*tnoise(p*6.1); }',
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        '{',
        '  float camD   = length(cameraPosition - vWPos);',
        '  float macro  = tfbm(vWPos.xz * 0.0014);',
        '  float detail = tfbm(vWPos.xz * 0.035);',
        '  float micro  = tnoise(vWPos.xz * 0.3) * (1.0 - smoothstep(300.0, 1500.0, camD));',
        '  float edgeN  = tfbm(vWPos.xz * 0.012) - 0.5;',
        '  float slope  = 1.0 - normalize(vWNrm).y;',
        '  diffuseColor.rgb = mix(diffuseColor.rgb, rockCol * (0.85 + detail * 0.3), smoothstep(0.10, 0.30, slope + edgeN * 0.08) * 0.85);',
        '  diffuseColor.rgb = mix(diffuseColor.rgb, sandCol * (0.92 + detail * 0.16), (1.0 - smoothstep(3.0, 18.0 + edgeN * 14.0, vWPos.y)) * 0.92);',
        '  float snow = smoothstep(snowLine - 30.0, snowLine + 60.0, vWPos.y + edgeN * 90.0) * (1.0 - smoothstep(0.18, 0.42, slope));',
        '  diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, snow);',
        '  diffuseColor.rgb *= mix(1.0, 0.80 + macro * 0.38, 1.0 - snow * 0.7);',
        '  diffuseColor.rgb *= 0.88 + detail * 0.20;',
        '  diffuseColor.rgb *= 0.95 + micro * 0.08;',
        '}',
      ].join('\n'));
  };
  terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  scene.add(terrainMesh);
}
function retuneTerrain() {
  if (!terrainMesh) return;
  if (terrainTierBuilt === gfxTier) return;
  const old = terrainMesh.geometry;
  terrainMesh.geometry = buildTerrainGeo(terrainCfg());
  if (old && old.dispose) old.dispose();
  terrainTierBuilt = gfxTier;
}

// smooth value noise over a random (N+1)² lattice; val(u, v, scale) with u, v in [0, 1)
function latticeNoise(N) {
  const L = []; for (let i = 0; i < (N + 1) * (N + 1); i++) L.push(Math.random());
  return (u, v, sc) => {
    const gu = Math.min(u * sc, N - 0.001), gv = Math.min(v * sc, N - 0.001);
    const iu = Math.floor(gu), iv = Math.floor(gv), fu = gu - iu, fv = gv - iv;
    const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
    return lerp(lerp(L[iv * (N + 1) + iu], L[iv * (N + 1) + iu + 1], su), lerp(L[(iv + 1) * (N + 1) + iu], L[(iv + 1) * (N + 1) + iu + 1], su), sv);
  };
}
let CLOUDTEX = null;
function cloudPuffTex() {
  if (CLOUDTEX) return CLOUDTEX;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), img = x.createImageData(S, S);
  const val = latticeNoise(48);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S;
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const n = 0.55 * val(u, v, 6) + 0.3 * val(u, v, 13) + 0.15 * val(u, v, 27);
    const body = clamp((1 - r) * 1.5, 0, 1);
    const a = Math.pow(body, 1.5) * clamp(n * 2.2 - 0.45, 0, 1);
    const k = (j * S + i) * 4, lum = 215 + n * 40;
    img.data[k] = lum; img.data[k + 1] = lum; img.data[k + 2] = lum; img.data[k + 3] = a * 255;
  }
  x.putImageData(img, 0, 0);
  CLOUDTEX = new THREE.CanvasTexture(c);
  return CLOUDTEX;
}

function buildClouds() {
  const tex = cloudPuffTex();
  for (let i = 0; i < 30; i++) {
    const g = new THREE.Group();
    const base = rand(300, 640);
    const n = randInt(6, 10);
    for (let p = 0; p < n; p++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: rand(0.5, 0.72), depthWrite: false,
        rotation: rand(0, TWO_PI),
      }));
      sp.position.set(rand(-1, 1) * base * 1.25, rand(-0.32, 0.42) * base, rand(-1, 1) * base * 1.25);
      const s = rand(0.9, 1.7) * base;
      sp.scale.set(s * rand(1.1, 1.5), s * rand(0.55, 0.75), 1);
      sp.renderOrder = 2;
      sp.userData.shade = clamp(sp.position.y / base + 0.5, 0, 1);
      sp.userData.spin = rand(-0.02, 0.02);
      g.add(sp);
    }
    g.position.set(rand(-10000, 10000), rand(680, 2700), rand(-10000, 10000));
    g.userData.radius = base * 1.55;
    scene.add(g); clouds.push(g);
  }
}
function retintClouds(T) {
  const lit = new THREE.Color(0xffffff).lerp(new THREE.Color(T.disc), 0.3).multiplyScalar(1 - T.stars * 0.55);
  const shade = new THREE.Color(T.fog).lerp(lit, 0.38);
  const tmp = new THREE.Color();
  for (let i = 0; i < clouds.length; i++) {
    const kids = clouds[i].children;
    for (let k = 0; k < kids.length; k++) {
      tmp.copy(shade).lerp(lit, kids[k].userData.shade);
      kids[k].material.color.copy(tmp);
    }
  }
}
function updateClouds(dt) {
  for (let i = 0; i < clouds.length; i++) {
    const g = clouds[i];
    g.position.x += 14 * dt;
    if (g.position.x > 13000) g.position.x = -13000;
    const kids = g.children;
    for (let k = 0; k < kids.length; k++) kids[k].material.rotation += kids[k].userData.spin * dt;
  }
}
function inCloud(pos) {
  for (let i = 0; i < clouds.length; i++) if (pos.distanceToSquared(clouds[i].position) < clouds[i].userData.radius * clouds[i].userData.radius) return true;
  return false;
}

let seaMesh, seaMat, seaTierBuilt = null;
const SEA_SIZE = 70000, SEA_LEVEL_Y = -10;
// CPU. Cached + userData.shared so disposeGroup and tier swaps never free it.
let FOAMMASK = null;
function foamMaskTex() {
  if (FOAMMASK) return FOAMMASK;
  const S = 512;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d'), img = x.createImageData(S, S);
  const land = new Float32Array(S * S), tmp = new Float32Array(S * S), B = 2;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const wx = (i / (S - 1) - 0.5) * TERRAIN_SIZE, wz = (j / (S - 1) - 0.5) * TERRAIN_SIZE;
    const h = terrainH(wx, wz) - SEA_LEVEL_Y;
    const sh = h >= 0 ? 1 : clamp(1 + h / 170, 0, 1);
    img.data[(j * S + i) * 4 + 1] = sh * 255;
    land[j * S + i] = h >= 0 ? 1 : 0;
  }
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { let a = 0; for (let d = -B; d <= B; d++) a += land[j * S + clamp(i + d, 0, S - 1)]; tmp[j * S + i] = a; }
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    let a = 0; for (let d = -B; d <= B; d++) a += tmp[clamp(j + d, 0, S - 1) * S + i];
    const k = (j * S + i) * 4;
    img.data[k] = Math.min(1, a / 4) * 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  FOAMMASK = new THREE.CanvasTexture(cv);
  FOAMMASK.flipY = false;   // row j ↔ world z ascending, matching the shader's muv.y = z/size + 0.5
  FOAMMASK.userData.shared = true;
  return FOAMMASK;
}
const SEA_WAVES = [
  [0.0015, 0, 4.2, 0.8], [0, 0.0021, 3.2, -0.6], [0.0034, 0.0034, 1.9, 1.4],
  [0.0026, -0.0026, 1.4, 1.0],
  [0.0052, 0, 0.8, -1.7], [0, 0.0061, 0.7, 1.9],
];
// The fragment MUST end with #include <tonemapping_fragment> then #include <colorspace_fragment>.
function buildSeaMat(cfg) {
  const waveOct = cfg.waveOct, normOct = cfg.normOct, foam = cfg.foam, reflect = cfg.reflect;
  const waves = SEA_WAVES.slice(0, waveOct <= 3 ? 3 : waveOct === 4 ? 4 : 6);
  const f = (v) => v.toFixed(5);
  const hTerms = waves.map(w => `sin(p.x*${f(w[0])} + p.y*${f(w[1])} + time*${f(w[3])})*${f(w[2])}`).join(' + ');
  const gTerms = waves.map(w => `cos(p.x*${f(w[0])} + p.y*${f(w[1])} + time*${f(w[3])})*${f(w[2])}*vec2(${f(w[0])}, ${f(w[1])})`).join(' + ');
  const perPixel = normOct >= 1;
  const vtf = !renderer || renderer.capabilities.maxVertexTextures > 0;
  const vert = [
    'uniform float time; uniform sampler2D coastMask; uniform float maskSize;',
    'varying vec3 vPos; varying vec3 vNrm;',
    '#include <fog_pars_vertex>',
    'float wave(vec2 p){ return ' + hTerms + '; }',
    'vec2 waveGrad(vec2 p){ return ' + gTerms + '; }',
    'void main(){',
    '  vec3 p = position;',
    '  vec2 muv = p.xz / maskSize + 0.5;',
    vtf ? '  float sh = (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) ? texture2D(coastMask, muv).g : 0.0;'
        : '  float sh = 0.0;',   // no vertex texture units (rare old WebGL1) → undamped swell
    '  float damp = 1.0 - 0.85 * sh * sh;',
    '  p.y += wave(p.xz) * damp;',
    '  vec2 g = waveGrad(p.xz) * 11.0 * damp;',
    '  vNrm = normalize(vec3(-g.x, 1.0, -g.y));',
    '  vPos = (modelMatrix * vec4(p, 1.0)).xyz;',
    '  vec4 mvPosition = viewMatrix * vec4(vPos, 1.0);',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}',
  ].join('\n');
  const frag = [
    'uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 deepCol; uniform vec3 shallowCol; uniform vec3 horCol; uniform vec3 skyTop;',
    'uniform float time; uniform sampler2D coastMask; uniform float maskSize;',
    'varying vec3 vPos; varying vec3 vNrm;',
    '#include <fog_pars_fragment>',
    perPixel ? 'vec2 waveGrad(vec2 p){ return ' + gTerms + '; }' : '',
    'void main(){',
    '  vec3 V = normalize(cameraPosition - vPos);',
    '  float dist = length(cameraPosition - vPos);',
    '  float near = 1.0 - smoothstep(250.0, 2600.0, dist);',
    '  vec2 muv = vPos.xz / maskSize + 0.5;',
    '  vec4 mk = (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) ? texture2D(coastMask, muv) : vec4(0.0);',
    perPixel ? '  vec2 g = waveGrad(vPos.xz) * 11.0 * (1.0 - 0.85 * mk.g * mk.g); vec3 N = vec3(-g.x, 1.0, -g.y);' : '  vec3 N = vNrm;',
    (normOct >= 1 ? '  N.xz += vec2(sin(vPos.x*0.061 + vPos.z*0.023 + time*1.8) + sin(vPos.x*0.029 - vPos.z*0.052 - time*1.3), cos(vPos.z*0.058 - vPos.x*0.019 - time*1.6) + cos(vPos.z*0.031 + vPos.x*0.047 + time*1.1)) * 0.03 * near;' : ''),
    (normOct >= 2 ? '  N.xz += vec2(sin(vPos.x*0.19 - vPos.z*0.07 - time*2.6), cos(vPos.z*0.17 + vPos.x*0.05 + time*2.9)) * 0.018 * near;' : ''),
    '  N = normalize(N);',
    '  float cosT = max(dot(N, V), 0.0);',
    '  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);',
    '  vec3 R = reflect(-V, N);',
    '  vec3 sky = mix(horCol, skyTop, pow(clamp(R.y, 0.0, 1.0), 0.6));',
    '  float shelf = mk.g * mk.g;',
    '  vec3 body = mix(deepCol, shallowCol, shelf * (0.35 + 0.65 * cosT));',
    '  vec3 col = mix(body, sky, fres * ' + (reflect ? '0.95' : '0.8') + ');',
    '  float rv = max(dot(R, sunDir), 0.0);',
    '  float sharp = mix(90.0, ' + (reflect ? '700.0' : '400.0') + ', near);',
    '  col += sunCol * (pow(rv, sharp) * mix(1.2, ' + (reflect ? '7.0' : '4.0') + ', near) + pow(rv, 48.0) * 0.22) * smoothstep(-0.05, 0.12, sunDir.y);',
    (foam ? '  float surf = smoothstep(0.962, 0.988, mk.g) * (1.0 - smoothstep(0.994, 1.0, mk.g)) * smoothstep(0.15, 0.6, mk.r);' : ''),
    (foam ? '  float foamA = surf * (0.5 + 0.5*sin(time*1.7 + vPos.x*0.03 + vPos.z*0.021)) * (0.6 + 0.4*sin(vPos.x*0.11 - vPos.z*0.07));' : ''),
    (foam ? '  col = mix(col, mix(horCol * 1.4, vec3(0.9, 0.94, 0.96), smoothstep(-0.05, 0.3, sunDir.y)), clamp(foamA, 0.0, 0.8));' : ''),
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <fog_fragment>',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}',
  ].filter(l => l !== '').join('\n');
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    time: { value: 0 },
    sunDir: { value: new THREE.Vector3(0.5, 1.0, 0.35).normalize() },
    sunCol: { value: new THREE.Color(0xfff3d0) },
    deepCol: { value: new THREE.Color(0x0c2c3e) },
    shallowCol: { value: new THREE.Color(0x2f8a8c) },
    horCol: { value: new THREE.Color(0x2a6a7a) },
    skyTop: { value: new THREE.Color(0x0a1c44) },
    maskSize: { value: TERRAIN_SIZE },
  }]);
  uniforms.coastMask = { value: foamMaskTex() };   // after merge: UniformsUtils.merge would clone the texture
  return new THREE.ShaderMaterial({ fog: true, uniforms, vertexShader: vert, fragmentShader: frag });
}
function seaCfg() { return SEA_TIER[gfxTier] || SEA_TIER.low; }
function seaGeoFor(cfg) { const g = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, cfg.seg, cfg.seg); g.rotateX(-Math.PI / 2); return g; }
function buildScenery() {
  const cfg = seaCfg();
  seaMat = buildSeaMat(cfg);
  seaTierBuilt = gfxTier;
  seaMesh = new THREE.Mesh(seaGeoFor(cfg), seaMat);
  seaMesh.position.y = SEA_LEVEL_Y; scene.add(seaMesh);

  const sv = [];
  for (let i = 0; i < 700; i++) { const d = new THREE.Vector3(rand(-1, 1), rand(0.06, 1), rand(-1, 1)).normalize().multiplyScalar(19000); sv.push(d.x, d.y, d.z); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
  starsMat = new THREE.PointsMaterial({ color: 0xcfe6ff, size: 36, sizeAttenuation: true, map: glowTex(), transparent: true, opacity: 0.85, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(sg, starsMat));

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff0c0, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false }));
  halo.scale.setScalar(5200); halo.position.copy(sun.position).setLength(17000); scene.add(halo); haloA = halo;
  const halo2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffe6a0, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.32, depthWrite: false, depthTest: false }));
  halo2.scale.setScalar(9000); halo2.position.copy(halo.position); scene.add(halo2); haloB = halo2;
}
function retuneSea() {
  if (!seaMesh) return;
  if (seaTierBuilt === gfxTier) return;
  const cfg = seaCfg();
  const oldGeo = seaMesh.geometry, oldMat = seaMesh.material;
  seaMat = buildSeaMat(cfg);
  seaMesh.geometry = seaGeoFor(cfg);
  seaMesh.material = seaMat;
  if (oldGeo && oldGeo.dispose) oldGeo.dispose();
  if (oldMat && oldMat.dispose) oldMat.dispose();
  seaTierBuilt = gfxTier;
  applyTimeOfDay(timeOfDay);
}
function applyTimeOfDay(tod) {
  timeOfDay = clamp(tod, 0, 2);
  const T = TODS[timeOfDay];
  if (skyMat) {
    skyMat.uniforms.top.value.setHex(T.top); skyMat.uniforms.hor.value.setHex(T.hor); skyMat.uniforms.bot.value.setHex(T.bot);
    skyMat.uniforms.sunDir.value.set(0.5, T.sunY, 0.35).normalize();
    skyMat.uniforms.sunCol.value.setHex(T.disc);
    skyMat.uniforms.scatter.value = 1.15 - T.stars * 0.8;
  }
  if (seaMat) {
    const B = biomeFor(arenaBiome);
    seaMat.uniforms.sunDir.value.set(0.5, T.sunY, 0.35).normalize();
    seaMat.uniforms.sunCol.value.setHex(T.disc);
    seaMat.uniforms.horCol.value.setHex(T.hor);
    seaMat.uniforms.skyTop.value.setHex(T.top);
    seaMat.uniforms.deepCol.value.setHex(B.sea).multiplyScalar(T.seaK);
    seaMat.uniforms.shallowCol.value.setHex(B.shallow).multiplyScalar(T.seaK);
  }
  if (scene) { if (scene.fog) scene.fog.color.setHex(T.fog); scene.background.setHex(T.fog); }
  if (sun) { sun.color.setHex(T.sun); sun.intensity = T.sunI; sun.position.set(0.5, T.sunY, 0.35).setLength(2000); }
  if (sunDisc) { sunDisc.material.color.setHex(T.disc); sunDisc.position.copy(sun.position).setLength(18000); }
  if (ambientLight) ambientLight.intensity = T.amb;
  if (hemiLight) hemiLight.intensity = T.hemi;
  if (rimLight) rimLight.intensity = T.rim;
  if (starsMat) starsMat.opacity = T.stars;
  retintClouds(T);
  const f = 1 - T.stars * 0.8;
  if (haloA) { haloA.position.copy(sun.position).setLength(17000); haloA.material.opacity = 0.6 * f; }
  if (haloB) { haloB.position.copy(sun.position).setLength(17000); haloB.material.opacity = 0.32 * f; }
  applyWeather(weather.type);
  buildEnvMap();
}

function applyWeather(type) {
  const m = resolveWeather(type, timeOfDay);
  weather.type = m.type;
  weather.radarMul = m.radarMul;
  weather.lockRangeMul = m.lockRangeMul;
  weather.lockSpeedMul = m.lockSpeedMul;
  weather.fogMul = m.fogMul;
  const T = TODS[timeOfDay];
  const storm = weather.type === 'storm';
  if (scene && scene.fog) {
    scene.fog.density = fogDensityFor(gfxTier, weather.type);
    const fc = new THREE.Color(T.fog);
    if (storm) fc.lerp(new THREE.Color(0x23262c), 0.55);
    scene.fog.color.copy(fc);
    if (scene.background && scene.background.copy) scene.background.copy(fc);
  }
  if (skyMat) skyMat.uniforms.scatter.value = (1.15 - T.stars * 0.8) * (storm ? 0.5 : 1);
  retintClouds(T);
  if (storm) {
    const grey = new THREE.Color(0x3a3f47);
    for (let i = 0; i < clouds.length; i++) {
      const kids = clouds[i].children;
      for (let k = 0; k < kids.length; k++) kids[k].material.color.lerp(grey, 0.5).multiplyScalar(0.8);
    }
  }
}

function onLightningFlash(intensity) { audio.thunder(intensity); }

const RAIN_MAX = 240;
let _rain = null;
const _rainAngle = 0.18;
function _buildRain(n) {
  const a = new Array(n);
  for (let i = 0; i < n; i++) a[i] = { x: Math.random(), y: Math.random(), len: 0.02 + Math.random() * 0.05, spd: 0.9 + Math.random() * 0.9, };
  return a;
}
function drawWeatherOverlay(ctx, dt) {
  if (!ctx || weather.type !== 'storm') return;
  if (prefersReducedMotion()) return;
  const cap = gfxTier === 'low' ? (RAIN_MAX >> 1) : RAIN_MAX;
  if (!_rain || _rain.length !== cap) _rain = _buildRain(cap);
  ctx.save();
  ctx.fillStyle = 'rgba(60,66,78,0.10)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(200,215,235,0.55)';
  ctx.lineWidth = Math.max(1, W / 1280);
  ctx.globalAlpha = 0.33;
  ctx.beginPath();
  for (let i = 0; i < _rain.length; i++) {
    const p = _rain[i];
    p.y += p.spd * dt * 1.35;
    p.x += p.spd * dt * _rainAngle;
    if (p.y > 1) { p.y -= 1.05; p.x = Math.random(); }
    if (p.x > 1) p.x -= 1;
    const sx = p.x * W, sy = p.y * H;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - _rainAngle * p.len * H, sy + p.len * H);
  }
  ctx.stroke();
  ctx.restore();
}

let _lightT = 5;
function updateWeather(dt) {
  // enemy tracers are fog:false, so dim them by hand under fog/storm — incoming fire is harder to spot
  if (ASSET.ebulletMat) ASSET.ebulletMat.opacity = weather.type === 'fog' ? 0.5 : weather.type === 'storm' ? 0.65 : 0.98;
  if (weather.type === 'storm') {
    _lightT -= dt;
    if (_lightT <= 0) {
      const intensity = 0.18 + Math.random() * 0.62;
      empFlash = Math.max(empFlash, intensity);
      onLightningFlash(intensity);
      _lightT = 4 + Math.random() * 11;
    }
  }
}

let groundObjGroup = null;
const GOBJ_TPL = {};
function groundObjTemplates() {
  if (GOBJ_TPL.rockGeo) return GOBJ_TPL;
  const shared = (o) => { o.userData.shared = true; return o; };
  const white = (extra) => shared(new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: 0.9, metalness: 0, flatShading: true }, extra)));
  const rg = new THREE.IcosahedronGeometry(8, 1);
  { const p = rg.attributes.position; for (let i = 0; i < p.count; i++) { const s = 0.8 + 0.4 * Math.abs(Math.sin(p.getX(i) * 1.7 + p.getY(i) * 2.3 + p.getZ(i) * 1.1)); p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7 - 2, p.getZ(i) * s); } rg.computeVertexNormals(); }
  GOBJ_TPL.rockGeo = shared(rg);
  GOBJ_TPL.mat = white();
  const tg = new THREE.CylinderGeometry(1.0, 1.5, 12, 5); tg.translate(0, 6, 0);
  GOBJ_TPL.trunkGeo = shared(tg);
  const c1 = new THREE.ConeGeometry(7.5, 16, 7); c1.translate(0, 17, 0);
  const c2 = new THREE.ConeGeometry(5.2, 12, 7); c2.translate(0, 26, 0);
  GOBJ_TPL.coniferGeo = shared(mergeGeos([c1, c2]));
  const bl = new THREE.IcosahedronGeometry(9, 0); bl.scale(1, 0.8, 1); bl.translate(0, 17, 0);
  GOBJ_TPL.broadleafGeo = shared(bl);
  const walls = new THREE.BoxGeometry(16, 12, 16); walls.translate(0, 6, 0);
  GOBJ_TPL.wallGeo = shared(walls);
  const gable = new THREE.CylinderGeometry(0, 12.4, 7, 4, 1); gable.rotateY(Math.PI / 4); gable.scale(1, 1, 1); gable.translate(0, 15.5, 0);
  GOBJ_TPL.gableGeo = shared(gable);
  const flat = new THREE.BoxGeometry(17, 1.4, 17); flat.translate(0, 12.7, 0);
  GOBJ_TPL.flatRoofGeo = shared(flat);
  GOBJ_TPL.roadMat = shared(new THREE.MeshStandardMaterial({ color: 0x57524a, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  return GOBJ_TPL;
}
// The VISIBLE ground height: gameplay terrainH + the tier's visual-only detail layer. Use it to seat props
// (scatter, ground units) on the mesh the player actually sees; collision keeps using terrainH.
function surfaceH(x, z) {
  const cfg = TERRAIN_TIER[terrainTierBuilt || gfxTier];
  return terrainH(x, z) + (cfg ? terrainDetailH(x, z, cfg) : 0);
}
const _gobjM4 = new THREE.Matrix4(), _gobjQ = new THREE.Quaternion(), _gobjP = new THREE.Vector3(), _gobjS = new THREE.Vector3(), _gobjC = new THREE.Color();
function makeInstanced(geo, mat, list, cast, each) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const sc = { sx: 1, sy: 1, sz: 1 };
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    sc.sx = sc.sy = sc.sz = o.scale;
    const hex = each ? each(o, i, sc) : null;
    _gobjP.set(o.x, o.y, o.z);
    _gobjQ.setFromAxisAngle(UPV, o.rot);
    _gobjS.set(sc.sx, sc.sy, sc.sz);
    _gobjM4.compose(_gobjP, _gobjQ, _gobjS);
    im.setMatrixAt(i, _gobjM4);
    if (hex != null) im.setColorAt(i, _gobjC.setHex(hex));
  }
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = !!cast; im.receiveShadow = true;
  return im;
}
const _gj = (o, k) => { const v = Math.sin(o.x * 12.9898 + o.z * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };
function buildRoadGeo(roads) {
  const pos = [], idx = []; const HALF = 11, STEP = 30, LEN = 900;
  for (const r of roads) {
    const dx = Math.sin(r.rot), dz = Math.cos(r.rot), px = dz, pz = -dx;
    let prev = -1;
    for (let d = -LEN / 2; d <= LEN / 2; d += STEP) {
      const cx = r.x + dx * d, cz = r.z + dz * d;
      const th = terrainH(cx, cz);
      if (th < GROUNDOBJ_WATER_MARGIN || th > 320 || Math.abs(terrainH(cx + dx * 20, cz + dz * 20) - th) > 7) { prev = -1; continue; }
      const lx = cx + px * HALF, lz = cz + pz * HALF, rx = cx - px * HALF, rz = cz - pz * HALF;
      const base = pos.length / 3;
      pos.push(lx, surfaceH(lx, lz) + 1.2, lz, rx, surfaceH(rx, rz) + 1.2, rz);
      if (prev >= 0) idx.push(prev, prev + 1, base, prev + 1, base + 1, base);
      prev = base;
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// (Re)build the per-arena ground objects for the current tier + biome. Idempotent — clears any existing
function buildGroundObjects() {
  syncArenaBiome();
  clearGroundObjects();
  if (!scene || gfxTier === 'low') return;
  const B = biomeFor(arenaBiome);
  const seed = weatherSeed || 1;
  const plan = planGroundObjects(seed, gfxTier, terrainH, B);
  if (!plan.length) return;
  const tpl = groundObjTemplates();
  const cast = gfxTier === 'high';
  const rocks = [], trees = [], blds = [], roads = [];
  for (const o of plan) {
    o.y = surfaceH(o.x, o.z);
    (o.type === 'rock' ? rocks : o.type === 'tree' ? trees : o.type === 'building' ? blds : roads).push(o);
  }
  const shade = (hex, o, k, amt) => _gobjC.setHex(hex).multiplyScalar(1 - amt + _gj(o, k) * amt * 2).getHex();
  groundObjGroup = new THREE.Group();
  if (rocks.length) groundObjGroup.add(makeInstanced(tpl.rockGeo, tpl.mat, rocks, cast, (o) => shade(B.rock, o, 1, 0.18)));
  if (trees.length) {
    const tall = (o, i, s) => { s.sy = o.scale * (0.85 + _gj(o, 2) * 0.6); };
    groundObjGroup.add(makeInstanced(tpl.trunkGeo, tpl.mat, trees, cast, (o, i, s) => { tall(o, i, s); return 0x4a3a2a; }));
    groundObjGroup.add(makeInstanced(B.tree === 'broadleaf' ? tpl.broadleafGeo : tpl.coniferGeo, tpl.mat, trees, cast,
      (o, i, s) => { tall(o, i, s); return shade(B.canopy, o, 3, 0.22); }));
  }
  if (blds.length) {
    const dims = (o, i, s) => {
      const w = 0.8 + _gj(o, 4) * 0.7, tallB = _gj(o, 5) > 0.9 ? 1.8 + _gj(o, 6) * 1.6 : 0.8 + _gj(o, 6) * 0.6;
      s.sx = w * (0.8 + _gj(o, 7) * 0.5); s.sz = w; s.sy = tallB;
    };
    groundObjGroup.add(makeInstanced(tpl.wallGeo, tpl.mat, blds, cast, (o, i, s) => { dims(o, i, s); return B.walls[Math.floor(_gj(o, 8) * B.walls.length)]; }));
    groundObjGroup.add(makeInstanced(B.flatRoofs ? tpl.flatRoofGeo : tpl.gableGeo, tpl.mat, blds, cast, (o, i, s) => { dims(o, i, s); return B.roofs[Math.floor(_gj(o, 9) * B.roofs.length)]; }));
  }
  if (roads.length) {
    const rg = buildRoadGeo(roads);
    if (rg) { const m = new THREE.Mesh(rg, tpl.roadMat); m.receiveShadow = true; groundObjGroup.add(m); }
  }
  scene.add(groundObjGroup);
}
function clearGroundObjects() {
  if (!groundObjGroup) return;
  if (scene) scene.remove(groundObjGroup);
  groundObjGroup.traverse(o => { if (o.isInstancedMesh && o.dispose) o.dispose(); });
  disposeGroup(groundObjGroup);
  groundObjGroup = null;
}

function updateSunRig() {
  if (!sun) return;
  const T = TODS[timeOfDay];
  t1.set(0.5, T.sunY, 0.35).normalize();
  const focus = (player && player.group) ? player.group.position : camera.position;
  sun.position.copy(focus).addScaledVector(t1, 2600);
  sun.target.position.copy(focus);
  if (sunDisc) sunDisc.position.copy(camera.position).addScaledVector(t1, 18000);
  if (haloA) haloA.position.copy(camera.position).addScaledVector(t1, 17000);
  if (haloB) haloB.position.copy(camera.position).addScaledVector(t1, 17000);
}

let envRT = null;
function buildEnvMap() {
  if (!renderer || !skyMat) return;
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene(), geo = new THREE.SphereGeometry(100, 24, 16);
  es.add(new THREE.Mesh(geo, skyMat));
  if (envRT) envRT.dispose();
  envRT = pm.fromScene(es, 0.04);
  scene.environment = envRT.texture;
  pm.dispose(); geo.dispose();
}

let playerShadow = null;
function makePlayerShadow() {
  playerShadow = new THREE.Mesh(new THREE.CircleGeometry(13, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  playerShadow.rotation.x = -Math.PI / 2; playerShadow.visible = false; scene.add(playerShadow);
}
function updatePlayerShadow() {
  if (!playerShadow) makePlayerShadow();
  if (!player || !player.group || state !== 'playing') { playerShadow.visible = false; return; }
  const p = player.group.position;
  const gh = Math.max(terrainH(p.x, p.z), SEA_LEVEL_Y);
  const agl = p.y - gh;
  if (agl > 700 || agl < 0) { playerShadow.visible = false; return; }
  playerShadow.visible = true;
  playerShadow.position.set(p.x, gh + 2.5, p.z);
  playerShadow.material.opacity = 0.32 * (1 - agl / 700);
  playerShadow.scale.setScalar(1 + agl * 0.0035);
}

let _platformCache = null;   // F10: the hangar platform is a fixed prop — build its geo/mats once and reuse the group across
                             // returnToHangar, so the reset path (startGame removes it with no dispose) can never leak it.
function makePlatform() {
  if (!_platformCache) {
    _platformCache = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(20, 23, 2.4, 36),
      new THREE.MeshStandardMaterial({ color: 0x0b1622, metalness: 0.45, roughness: 0.55, emissive: 0x06121e }));
    disc.position.y = -3; disc.receiveShadow = true; _platformCache.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(20, 0.5, 8, 40), new THREE.MeshBasicMaterial({ color: 0x19f0d4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = -1.7; _platformCache.add(ring);
  }
  platform = _platformCache;
  scene.add(platform);
}

const ASSET = {};

function mergeGeos(geos) {
  const parts = geos.map(g => { const ng = g.index ? g.toNonIndexed() : g; if (ng !== g) g.dispose(); return ng; });
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const item = parts[0].attributes[name].itemSize;
    const arr = new Float32Array(n * item);
    let o = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, item));
  }
  for (const g of parts) g.dispose();
  return out;
}

function missileFinGeo(rootR, span, chord, sweep, zF) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(span, sweep); sh.lineTo(span, sweep + chord * 0.32); sh.lineTo(0, chord); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, steps: 1, curveSegments: 4 });
  g.translate(0, 0, -0.06); g.rotateX(Math.PI / 2);
  g.translate(rootR, 0, zF);
  return g;
}

function buildAssets() {
  {
    const L = 26, Wd = 3.4, pos = [], uvs = [], idx = [];
    for (let ax = 0; ax < 2; ax++) {
      const o = pos.length / 3;
      for (const [w, z, u] of [[-1, -L / 2, 0], [1, -L / 2, 0], [1, L / 2, 1], [-1, L / 2, 1]]) {
        pos.push(ax ? 0 : w * Wd / 2, ax ? w * Wd / 2 : 0, z);
        uvs.push(u, w * 0.5 + 0.5);
      }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    ASSET.bulletGeo = new THREE.BufferGeometry();
    ASSET.bulletGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ASSET.bulletGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    ASSET.bulletGeo.setIndex(idx);
  }
  const tracer = color => new THREE.MeshBasicMaterial({ map: tracerTex(), color, fog: false, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  ASSET.bulletMat = tracer(0xffe9a0);
  ASSET.ebulletMat = tracer(0xff6a50);

  {
    const R = 1.05, prof = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20; prof.push(new THREE.Vector2(Math.max(0.001, R * Math.pow(t, 0.62)), -5.5 * (1 - t))); }
    const nose = new THREE.LatheGeometry(prof, 24); nose.rotateX(Math.PI / 2); nose.translate(0, 0, -6.5);
    // lathe spins about +Y; after rotateX(PI/2) the profile's -Y (tip) lands at -Z
    const body = new THREE.CylinderGeometry(R, R, 15.5, 24, 1, true); body.rotateX(Math.PI / 2); body.translate(0, 0, 1.25);
    const tail = new THREE.CylinderGeometry(R, R * 0.74, 2.2, 24, 1, true); tail.rotateX(Math.PI / 2); tail.translate(0, 0, 10.1);
    const fins = [];
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      const f = missileFinGeo(0.85, 2.3, 2.9, 1.65, 7.7); f.rotateZ(a); fins.push(f);
      const c = missileFinGeo(0.85, 1.35, 1.5, 0.95, -5.4); c.rotateZ(a); fins.push(c);
    }
    ASSET.missileHullGeo = mergeGeos([nose, body, tail].concat(fins));
    const seeker = new THREE.SphereGeometry(0.36, 14, 10); seeker.translate(0, 0, -11.75);
    const band = z => { const b = new THREE.CylinderGeometry(R + 0.045, R + 0.045, 0.55, 24, 1, true); b.rotateX(Math.PI / 2); b.translate(0, 0, z); return b; };
    const exDisc = new THREE.CircleGeometry(0.62, 16); exDisc.translate(0, 0, 11.22);
    ASSET.missileTrimGeo = mergeGeos([seeker, band(-5.6), band(6.6), exDisc]);
  }
  ASSET.missileMatPlayer = new THREE.MeshStandardMaterial({ color: 0xc6ccd2, metalness: 0.6, roughness: 0.5, envMapIntensity: 1.1 });
  ASSET.missileMatEnemy  = new THREE.MeshStandardMaterial({ color: 0x4a4640, metalness: 0.55, roughness: 0.6, envMapIntensity: 1.0 });
  ASSET.missileTrimPlayer = new THREE.MeshStandardMaterial({ color: 0x20262c, metalness: 0.45, roughness: 0.5 });
  ASSET.missileTrimEnemy  = new THREE.MeshStandardMaterial({ color: 0x241a14, metalness: 0.45, roughness: 0.55 });
  ASSET.mslExhaust    = new THREE.SpriteMaterial({ map: fireTex(), color: 0xffb267, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  // every missile shares these — tag so disposeGroup (boss/tip-missile teardown) never frees them
  [ASSET.missileHullGeo, ASSET.missileTrimGeo].forEach(g => { g.userData.shared = true; });
  [ASSET.missileMatPlayer, ASSET.missileMatEnemy, ASSET.missileTrimPlayer, ASSET.missileTrimEnemy,
   ASSET.mslExhaust].forEach(m => { m.userData.shared = true; });
  ASSET.flareGeo = new THREE.SphereGeometry(3.2, 5, 4);
  ASSET.flareMat = new THREE.MeshBasicMaterial({ color: 0xffb33a, fog: false });
  ASSET.sparkGeo = new THREE.BoxGeometry(0.9, 0.9, 6);
  ASSET.fragGeo = new THREE.TetrahedronGeometry(2.1, 0); ASSET.fragGeo.scale(1, 0.55, 1.6);
  ASSET.fragMat = new THREE.MeshStandardMaterial({ color: 0x2e2b28, metalness: 0.35, roughness: 0.75, flatShading: true });
  ASSET.ringGeo = new THREE.RingGeometry(2, 3.6, 30); ASSET.ringGeo.userData.shared = true;
  ASSET.bigRingGeo = new THREE.RingGeometry(4, 7, 40); ASSET.bigRingGeo.userData.shared = true;
  ASSET.lootGeo = new THREE.OctahedronGeometry(8, 0);
  ASSET.lootMat = new THREE.MeshStandardMaterial({ color: 0x33ffcc, emissive: 0x119977, emissiveIntensity: 1.0, flatShading: true });
  ASSET.lootMat.userData.shared = true;   // every drop shares it (drops are detached, never disposed)
  ASSET.crateBoxGeo = new THREE.BoxGeometry(16, 16, 16);
  ASSET.crateEdgeGeo = new THREE.EdgesGeometry(ASSET.crateBoxGeo);
  ASSET.crateRingGeo = new THREE.TorusGeometry(15, 1.1, 8, 24);
  ASSET.crateBeamGeo = new THREE.CylinderGeometry(3, 3, 900, 6, 1, true);
  loadJetModels();
}

function buildMissileMesh(enemy) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ASSET.missileHullGeo, enemy ? ASSET.missileMatEnemy : ASSET.missileMatPlayer));
  g.add(new THREE.Mesh(ASSET.missileTrimGeo, enemy ? ASSET.missileTrimEnemy : ASSET.missileTrimPlayer));
  const exhaust = new THREE.Sprite(ASSET.mslExhaust);
  exhaust.position.z = 12.0; exhaust.scale.setScalar(6); g.add(exhaust);
  g.userData.exhaust = exhaust;
  return g;
}

let GLOWTEX = null;
function glowTex() {
  if (GLOWTEX) return GLOWTEX;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.32)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
  GLOWTEX = new THREE.CanvasTexture(c); return GLOWTEX;
}
let TRACERTEX = null;
function tracerTex() {
  if (TRACERTEX) return TRACERTEX;
  const W2 = 256, H2 = 64, c = document.createElement('canvas'); c.width = W2; c.height = H2;
  const x = c.getContext('2d'), img = x.createImageData(W2, H2);
  for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) {
    const u = i / (W2 - 1), v = j / (H2 - 1);
    const head = Math.exp(-Math.pow(u * 4.2, 2));
    const tail = Math.pow(Math.max(0, 1 - u), 1.6) * 0.85;
    const lat = Math.exp(-Math.pow((v - 0.5) * (3.4 + u * 5.0), 2));
    const e = clamp((head + tail) * lat, 0, 1);
    const k = (j * W2 + i) * 4;
    img.data[k]     = 255 * Math.min(1, e * 1.25);
    img.data[k + 1] = 255 * Math.min(1, e * 1.1);
    img.data[k + 2] = 255 * Math.min(1, e * 0.8);
    img.data[k + 3] = 255 * e;
  }
  x.putImageData(img, 0, 0);
  TRACERTEX = new THREE.CanvasTexture(c); return TRACERTEX;
}
let FIRETEX = null;
function fireTex() {
  if (FIRETEX) return FIRETEX;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), img = x.createImageData(S, S);
  const val = latticeNoise(24);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S;
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const n = 0.6 * val(u, v, 5) + 0.4 * val(u, v, 11);
    const heat = clamp(1 - r * 1.12 + (n - 0.5) * 0.6, 0, 1);
    const k = (j * S + i) * 4;
    img.data[k]     = Math.min(255, heat * 640);
    img.data[k + 1] = clamp(heat * 1.9 - 0.32, 0, 1) * 255;
    img.data[k + 2] = clamp(heat * 2.1 - 1.3, 0, 1) * 255;
    img.data[k + 3] = Math.pow(heat, 1.1) * 255;
  }
  x.putImageData(img, 0, 0);
  FIRETEX = new THREE.CanvasTexture(c);
  return FIRETEX;
}

function makeMarker(type) {
  const color = type === 'boss' ? 0xff39c8 : type === 'ground' ? 0xffa033 : 0xff4040;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false, transparent: true, opacity: 0.85 }));
  sp.scale.setScalar(60); return sp;
}
/* Particle recycling. Each particle keeps its OWN material (updateParticles fades opacity / spins rotation
   per instance), so materials can't be shared; instead an expired sprite/spark goes back to a free list keyed
   by texture/blend/fog and is re-armed on the next spawn. Lists are bounded by the live-particle cap (~620). */
const PARTICLE_POOL = {};
function particleSprite(tex, additive, fog, color, op, rot) {
  const key = tex.id + (additive ? ':add' : ':nrm') + (fog ? ':fog' : '');
  const free = PARTICLE_POOL[key];
  let s = free && free.pop();
  if (!s) {
    s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.userData.pool = key;
  }
  s.material.color.setHex(color); s.material.opacity = op; s.material.rotation = rot || 0;
  return s;
}
function particleSpark(color) {
  const free = PARTICLE_POOL.spark;
  let s = free && free.pop();
  if (!s) { s = new THREE.Mesh(ASSET.sparkGeo, new THREE.MeshBasicMaterial({ transparent: true, fog: false })); s.userData.pool = 'spark'; }
  s.material.color.setHex(color); s.material.opacity = 1;
  return s;
}
function releaseParticle(mesh) {
  scene.remove(mesh);
  const k = mesh.userData.pool;
  if (k) (PARTICLE_POOL[k] || (PARTICLE_POOL[k] = [])).push(mesh);
}
function spawnTrail(pos, color, op, sz) {
  if (particles.length > 540) return;
  const k = sz || 1;
  const m = particleSprite(glowTex(), true, true, color, op || 0.4);
  m.position.copy(pos); m.scale.setScalar(rand(6, 10) * k); scene.add(m);
  particles.push({ mesh: m, vel: null, life: 0.85 * k, max: 0.85 * k, type: 'trail', grow: 9 * k });
}
function spawnShockwave(pos, k, op) {
  const ring = new THREE.Mesh(ASSET.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: op || 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  ring.position.copy(pos); ring.lookAt(camera.position); scene.add(ring);
  particles.push({ mesh: ring, vel: null, life: 0.6, max: 0.6, type: 'ring', ringK: k, ringOp: op });
}
function spawnMissileTrail(pos, color) {
  if (particles.length > 620) return;
  const puff = particleSprite(cloudPuffTex(), false, true, color || 0xdfe2e6, 0.26, rand(0, TWO_PI));
  puff.position.copy(pos); puff.scale.setScalar(rand(4, 7)); scene.add(puff);
  particles.push({ mesh: puff, vel: new THREE.Vector3(rand(-2, 2), rand(-1, 2), rand(-2, 2)), life: rand(0.7, 1.1), max: 1.1, type: 'smoke', grow: 16, rot: rand(-1.2, 1.2) });
}
function buildCrate() {
  const grp = new THREE.Group();
  const box = new THREE.Mesh(ASSET.crateBoxGeo, new THREE.MeshStandardMaterial({ color: 0x0a3a33, emissive: 0x17e8a0, emissiveIntensity: 0.95, metalness: 0.35, roughness: 0.5 }));
  grp.add(box);
  const edges = new THREE.LineSegments(ASSET.crateEdgeGeo, new THREE.LineBasicMaterial({ color: 0x6effd6, transparent: true, opacity: 1 }));
  grp.add(edges);
  const ring = new THREE.Mesh(ASSET.crateRingGeo, new THREE.MeshBasicMaterial({ color: 0x9dffe6, transparent: true, opacity: 0.8, fog: false }));
  ring.rotation.x = Math.PI / 2; grp.add(ring);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x46ffc8, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  beacon.scale.setScalar(72); grp.add(beacon);
  const beam = new THREE.Mesh(ASSET.crateBeamGeo, new THREE.MeshBasicMaterial({ color: 0x33ffcc, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  grp.add(beam);
  grp.userData = { box, edges, ring, beacon, beam };
  return grp;
}

/* Free GPU geometry + materials of a removed object subtree. Skips geometry AND
   materials tagged userData.shared (cached jet geometry, pooled missile assets)
   plus textures (.map, shared/cached e.g. the drone glow sprite) — disposing any
   of these would corrupt other live objects. */
function disposeGroup(group) {
  if (!group) return;
  group.traverse(o => {
    if (o.isMesh || o.isSprite) {
      if (o.geometry && o.geometry.dispose && !o.geometry.userData.shared) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) if (m && m.dispose && !(m.userData && m.userData.shared)) m.dispose();
    }
  });
}

/* Full enemy despawn: drop the body group from the scene, free its per-instance
   GPU resources (disposeGroup spares userData.shared), and remove the radar
   marker WITHOUT disposing it (marker geo/mat is shared/cached). */
function despawnEnemy(e) {
  if (!e) return;
  if (e.group) { scene.remove(e.group); disposeGroup(e.group); }
  if (e.marker) scene.remove(e.marker);   // marker geometry/material may be shared — never dispose it
}

function despawnObject(obj) {
  if (!obj) return;
  scene.remove(obj); disposeGroup(obj);
}

/* Remove a mesh from the scene WITHOUT disposing it — for objects whose GPU
   resources outlive the scene membership (pooled bullets, shared-asset flares). */
function detachFromScene(obj) {
  if (obj) scene.remove(obj);
}

function holoTint(group) {
  if (!group) return;
  group.traverse(o => {
    if (o.isMesh && o.material) {
      const m = o.material;
      m.transparent = true; m.opacity = 0.42;
      if (m.emissive) { m.emissive = new THREE.Color(0x1bd6ff); m.emissiveIntensity = 0.9; }
      m.depthWrite = false;
    }
  });
}
