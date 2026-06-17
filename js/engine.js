/* SKYSTRIKE — engine.js: synthesized audio engine, three.js scene/world setup, terrain, shared assets & visual-effect spawners. Load 2nd. */

/* ---------------- audio engine (fully synthesized) ---------------- */
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
  setEngine(thr, sf) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(0.028 + thr * 0.042, t, 0.2);
    const f = 48 + thr * 56 + sf * 28;
    this.eO1.frequency.setTargetAtTime(f, t, 0.2);
    this.eO2.frequency.setTargetAtTime(f * 1.5, t, 0.2);
    this.eLP.frequency.setTargetAtTime(240 + thr * 480 + sf * 220, t, 0.2);
  }
  // Per-jet engine timbre table: baseAdd shifts the idle pitch, ratio scales the 2nd oscillator,
  // lpAdd opens/closes the filter for brighter vs throatier tones.
  // Jets grouped by character: twin-whine (hi ratio), heavy (lo base), agile (mid/bright).
  static jetEngParams(id) {
    const P = {
      'FT-1':   { baseAdd:  0, ratio: 1.50, lpAdd:   0 },   // baseline
      'F-22':   { baseAdd: -6, ratio: 1.48, lpAdd: -30 },   // deep stealth growl
      'SU-57':  { baseAdd: 10, ratio: 1.62, lpAdd:  40 },   // twin-whine nacelles
      'J-20':   { baseAdd:  4, ratio: 1.58, lpAdd:  20 },   // twin-whine canard
      'F-35':   { baseAdd: -4, ratio: 1.44, lpAdd: -20 },   // single fat engine, duller
      'EFT':    { baseAdd:  8, ratio: 1.60, lpAdd:  30 },   // Typhoon twin scream
      'RAFALE': { baseAdd:  6, ratio: 1.56, lpAdd:  20 },   // Rafale snappy
      'TEJAS':  { baseAdd: -2, ratio: 1.45, lpAdd: -10 },   // light single, quieter
      'FA18':   { baseAdd:  2, ratio: 1.52, lpAdd:  10 },   // Hornet mid-growl
      'J-36':   { baseAdd:-10, ratio: 1.40, lpAdd: -50 },   // flying wing, buried exhaust, deep
      'F-47':   { baseAdd:-12, ratio: 1.38, lpAdd: -60 },   // 6th-gen ultra-deep
      'NGAD':   { baseAdd: -8, ratio: 1.42, lpAdd: -40 },   // demonstrator, slightly lighter
      'J-50':   { baseAdd:  3, ratio: 1.54, lpAdd:  10 },   // lambda wing, slight whine
    };
    return P[id] || P['FT-1'];
  }
  setEngineJet(jetId, thr, sf) {
    if (!this.on) return;
    const p = AudioEngine.jetEngParams(jetId);
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(0.028 + thr * 0.042, t, 0.2);
    const f = 48 + p.baseAdd + thr * 56 + sf * 28;
    this.eO1.frequency.setTargetAtTime(f, t, 0.2);
    this.eO2.frequency.setTargetAtTime(f * p.ratio, t, 0.2);
    this.eLP.frequency.setTargetAtTime(240 + p.lpAdd + thr * 480 + sf * 220, t, 0.2);
  }
  // Rising sweep (300→1600 Hz, 0.32s) then a held locked tone (1800 Hz, 0.18s) — fires ONCE on lock edge.
  lockTone() {
    if (!this.on) return;
    const ctx = this.ctx, now = ctx.currentTime;
    // sweep: sine rising 300→1600
    const os = ctx.createOscillator(), gs = ctx.createGain();
    os.type = 'sine'; os.frequency.setValueAtTime(300, now);
    os.frequency.exponentialRampToValueAtTime(1600, now + 0.30);
    gs.gain.setValueAtTime(0.0001, now);
    gs.gain.linearRampToValueAtTime(0.13, now + 0.005);
    gs.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    os.connect(gs); gs.connect(this.master); os.start(now); os.stop(now + 0.35);
    // locked tone: steady 1800 Hz sine, short attack/release
    const ol = ctx.createOscillator(), gl = ctx.createGain();
    ol.type = 'sine'; ol.frequency.value = 1800;
    gl.gain.setValueAtTime(0.0001, now + 0.28);
    gl.gain.linearRampToValueAtTime(0.15, now + 0.30);
    gl.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
    ol.connect(gl); gl.connect(this.master); ol.start(now + 0.28); ol.stop(now + 0.50);
  }
  // Crunch burst (filtered noise) + descending engine fade (saw 160→30 Hz) — fires on player kill.
  killSfx() {
    if (!this.on) return;
    const ctx = this.ctx, now = ctx.currentTime;
    // crunch: bandpass noise burst (harsh metallic)
    this.burst(0.18, 0.28, 'bandpass', 1800, 400);
    // descending engine fade: sawtooth 160→30 Hz
    const od = ctx.createOscillator(), gd = ctx.createGain();
    od.type = 'sawtooth'; od.frequency.setValueAtTime(160, now);
    od.frequency.exponentialRampToValueAtTime(30, now + 0.45);
    gd.gain.setValueAtTime(0.0001, now);
    gd.gain.linearRampToValueAtTime(0.12, now + 0.008);
    gd.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    od.connect(gd); gd.connect(this.master); od.start(now); od.stop(now + 0.52);
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
  lock()     { this.blip(1500, 0.07, 'sine', 0.11); }
  warn()     { this.blip(720, 0.12, 'square', 0.12); }
  hit()      { this.blip(1300, 0.04, 'square', 0.08, 1700); }
  ui()       { this.blip(560, 0.05, 'square', 0.09, 880); }
  flare()    { this.burst(0.3, 0.18, 'highpass', 900, 2200); }
  power()    { this.blip(280, 0.35, 'sawtooth', 0.16, 920); }
  hurt()     { this.burst(0.25, 0.3, 'lowpass', 700, 120); }
}
const audio = new AudioEngine();

/* ---------------- terrain ---------------- */
function terrainH(x, z) {
  let h = 0;
  h += Math.sin(x * 0.0011) * Math.cos(z * 0.0013) * 430;
  h += Math.sin(x * 0.0031 + 1.7) * Math.cos(z * 0.0025 + 0.5) * 150;
  h += Math.sin(x * 0.0082 + 4.1) * Math.cos(z * 0.0071 + 2.3) * 46;
  h += Math.sin(x * 0.02 + 0.3) * Math.cos(z * 0.018 + 1.1) * 11;
  return h;
}

/* ---------------- scene setup ---------------- */
function initThree() {
  // filmic pipeline: managed colors, sRGB output, ACES tone mapping, physically-scaled lights
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
  // one tight shadow frustum that updateSunRig keeps centred on the player
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -650;
  sun.shadow.camera.right = sun.shadow.camera.top = 650;
  sun.shadow.camera.near = 50; sun.shadow.camera.far = 6000;
  sun.shadow.bias = -0.0001; sun.shadow.normalBias = 2.5;
  refreshGfxTier(); applyGfxQuality();   // F11: pick render tier + size the shadow map for it (low = cheaper shadows)
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0x77a8ff, 0.55);
  rim.position.set(-0.5, 0.35, -0.9).multiplyScalar(2000); scene.add(rim); rimLight = rim;

  clock = new THREE.Clock();
  buildSky(); buildTerrain(); buildClouds(); buildAssets(); buildScenery();
  applyTimeOfDay(timeOfDay);

  makePlatform();

  h2d = document.getElementById('h2d').getContext('2d');
  document.getElementById('h2d').width = W; document.getElementById('h2d').height = H;
  radarCanvas = document.getElementById('radar'); radarCtx = radarCanvas.getContext('2d');

  addEventListener('resize', onResize);
}

function onResize() {
  W = innerWidth; H = innerHeight;
  camera.aspect = W / H; camera.updateProjectionMatrix();
  renderer.setSize(W, H);
  const c = document.getElementById('h2d'); c.width = W; c.height = H;
  if(isTouchEnabled) initTouchControls();
}

// F11 mobile perf — apply the resolved gfxTier to the sun shadow (resolution + frustum depth). VISUAL-ONLY:
// no light direction, scene contents, or gameplay change — just a cheaper shadow pass on the low tier. Idempotent
// (safe to call on every settings change). Disposing the existing shadow.map forces Three to reallocate it at the
// new mapSize on the next render; the far plane shrink also tightens depth precision for the closer mid-range view.
function applyGfxQuality() {
  if (!sun) return;
  const low = gfxTier === 'low';
  const res = low ? 1024 : 2048;
  sun.shadow.mapSize.set(res, res);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }   // force realloc at the new resolution
  sun.shadow.camera.far = low ? 3000 : 6000;
  sun.shadow.camera.updateProjectionMatrix();
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
      // atmospheric scatter: tight warm glow at the sun + a broad sky-wide tint
      '  float s = max(dot(d, sunDir), 0.0);',
      '  c += sunCol * (pow(s, 20.0) * 0.5 + pow(s, 3.0) * 0.16) * scatter;',
      // dense haze band hugging the horizon
      '  c += hor * pow(1.0 - abs(h), 6.0) * 0.18;',
      // blue-noise-ish dither so the smooth gradient never bands
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
function buildTerrain() {
  // smooth-shaded indexed grid: analytic normals from the terrainH gradient,
  // per-vertex height/slope colouring, shader-level fbm albedo detail
  const SIZE = 26000, SEG = 220;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cLow = new THREE.Color(0x16343a), cMid = new THREE.Color(0x26523a), cHigh = new THREE.Color(0x55626e), cSnow = new THREE.Color(0xdde9f2);
  const cRock = new THREE.Color(0x3a444c), cSand = new THREE.Color(0x6e6450);
  const colors = new Float32Array(pos.count * 3), normals = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), E = 14;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = terrainH(x, z);
    pos.setY(i, h);
    // analytic normal via central differences
    const dhx = (terrainH(x + E, z) - terrainH(x - E, z)) / (2 * E);
    const dhz = (terrainH(x, z + E) - terrainH(x, z - E)) / (2 * E);
    const inv = 1 / Math.hypot(dhx, 1, dhz);
    normals[i * 3] = -dhx * inv; normals[i * 3 + 1] = inv; normals[i * 3 + 2] = -dhz * inv;
    // height bands
    const t = clamp((h + 220) / 760, 0, 1);
    if (t < 0.45) c.copy(cLow).lerp(cMid, t / 0.45);
    else if (t < 0.82) c.copy(cMid).lerp(cHigh, (t - 0.45) / 0.37);
    else c.copy(cHigh).lerp(cSnow, ((t - 0.82) / 0.18) * 0.9);   // snow caps only the true peaks
    // shoreline sand near sea level, bare rock on steep faces
    if (h < 8) c.lerp(cSand, clamp((8 - h) / 26, 0, 1) * 0.8);
    const steep = clamp((0.78 - inv) / 0.3, 0, 1);
    c.lerp(cRock, steep * 0.8);
    const j = 1 + (Math.random() - 0.5) * 0.07;
    colors[i * 3] = c.r * j; colors[i * 3 + 1] = c.g * j; colors[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.95 });
  // two-scale world-space noise breaks up the per-vertex colour bands into ground texture
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'varying vec3 vWPos;',
        'float thash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float tnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);',
        '  return mix(mix(thash(i), thash(i+vec2(1,0)), u.x), mix(thash(i+vec2(0,1)), thash(i+vec2(1,1)), u.x), u.y); }',
        'float tfbm(vec2 p){ return 0.55*tnoise(p) + 0.28*tnoise(p*2.7) + 0.17*tnoise(p*6.1); }',
      ].join('\n'))
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        '{',
        '  float macro  = tfbm(vWPos.xz * 0.0014);',   // broad vegetation/soil patches
        '  float detail = tfbm(vWPos.xz * 0.035);',    // mid-scale ground breakup
        '  float micro  = tnoise(vWPos.xz * 0.3);',    // fine grain up close
        '  diffuseColor.rgb *= 0.80 + macro * 0.38;',
        '  diffuseColor.rgb *= 0.88 + detail * 0.20;',
        '  diffuseColor.rgb *= 0.95 + micro * 0.08;',
        '}',
      ].join('\n'));
  };
  terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;   // ridgelines throw real shadows into the valleys
  scene.add(terrainMesh);
}

/* fbm-eroded puff texture — soft radial falloff with noisy edges, baked once */
let CLOUDTEX = null;
function cloudPuffTex() {
  if (CLOUDTEX) return CLOUDTEX;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), img = x.createImageData(S, S);
  const N = 48, L = []; for (let i = 0; i < (N + 1) * (N + 1); i++) L.push(Math.random());
  const val = (u, v, sc) => {
    const gu = Math.min(u * sc, N - 0.001), gv = Math.min(v * sc, N - 0.001);
    const iu = Math.floor(gu), iv = Math.floor(gv), fu = gu - iu, fv = gv - iv;
    const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
    const a = L[iv * (N + 1) + iu], b = L[iv * (N + 1) + iu + 1], d = L[(iv + 1) * (N + 1) + iu], e = L[(iv + 1) * (N + 1) + iu + 1];
    return lerp(lerp(a, b, su), lerp(d, e, su), sv);
  };
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

/* volumetric-style cloud banks: clusters of softly-lit billboard puffs.
   Top puffs tint toward the sun, bottoms toward the fog (retintClouds, per TOD).
   updateClouds drifts the banks with the wind and slowly churns each puff. */
function buildClouds() {
  const tex = cloudPuffTex();
  for (let i = 0; i < 30; i++) {
    const g = new THREE.Group();
    const base = rand(220, 480);
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
      sp.userData.shade = clamp(sp.position.y / base + 0.5, 0, 1);   // 0 = belly, 1 = sunlit crown
      sp.userData.spin = rand(-0.02, 0.02);
      g.add(sp);
    }
    g.position.set(rand(-10000, 10000), rand(680, 2700), rand(-10000, 10000));
    g.userData.radius = base * 1.55;
    scene.add(g); clouds.push(g);
  }
}
/* re-light every puff for the active time of day (called from applyTimeOfDay) */
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
/* slow wind drift (wrapping across the map) + per-puff churn */
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

let seaMesh, seaMat;
function buildScenery() {
  // animated open water: GPU swell + fresnel + sun glint, fading into the fog with distance
  const seaGeo = new THREE.PlaneGeometry(70000, 70000, 200, 200);
  seaGeo.rotateX(-Math.PI / 2);
  seaMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      time: { value: 0 },
      sunDir: { value: new THREE.Vector3(0.5, 1.0, 0.35).normalize() },
      sunCol: { value: new THREE.Color(0xfff3d0) },
      deepCol: { value: new THREE.Color(0x0c2c3e) },
      horCol: { value: new THREE.Color(0x2a6a7a) },
      fogCol: { value: new THREE.Color(0x0a1424) },
    },
    vertexShader: [
      'uniform float time;',
      'varying vec3 vPos; varying vec3 vNrm;',
      'float wave(vec2 p){',
      '  return sin(p.x*0.0015 + time*0.8)*4.2 + sin(p.y*0.0021 - time*0.6)*3.2 + sin((p.x+p.y)*0.0034 + time*1.4)*1.9;',
      '}',
      'void main(){',
      '  vec3 p = position;',
      '  p.y += wave(p.xz);',
      '  float e = 90.0;',
      '  float hx = wave(p.xz + vec2(e,0.)) - wave(p.xz - vec2(e,0.));',
      '  float hz = wave(p.xz + vec2(0.,e)) - wave(p.xz - vec2(0.,e));',
      '  vNrm = normalize(vec3(-hx/(2.0*e)*60.0, 1.0, -hz/(2.0*e)*60.0));',
      '  vPos = (modelMatrix * vec4(p, 1.0)).xyz;',
      '  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 deepCol; uniform vec3 horCol; uniform vec3 fogCol;',
      'varying vec3 vPos; varying vec3 vNrm;',
      'void main(){',
      '  vec3 V = normalize(cameraPosition - vPos);',
      '  vec3 N = normalize(vNrm);',
      '  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
      '  vec3 col = mix(deepCol, horCol * 0.85, fres * 0.75);',
      '  vec3 R = reflect(-sunDir, N);',
      '  float rv = max(dot(R, V), 0.0);',
      '  col += sunCol * (pow(rv, 260.0) * 1.5 + pow(rv, 16.0) * 0.16);',
      '  float d = length(cameraPosition - vPos);',
      '  col = mix(col, fogCol, 1.0 - exp(-d * 0.000048));',
      '  gl_FragColor = vec4(col, 0.94);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
  });
  seaMesh = new THREE.Mesh(seaGeo, seaMat);
  seaMesh.position.y = -10; scene.add(seaMesh);

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
function applyTimeOfDay(tod) {
  timeOfDay = clamp(tod, 0, 2);
  const T = TODS[timeOfDay];
  if (skyMat) {
    skyMat.uniforms.top.value.setHex(T.top); skyMat.uniforms.hor.value.setHex(T.hor); skyMat.uniforms.bot.value.setHex(T.bot);
    skyMat.uniforms.sunDir.value.set(0.5, T.sunY, 0.35).normalize();
    skyMat.uniforms.sunCol.value.setHex(T.disc);
    skyMat.uniforms.scatter.value = 1.15 - T.stars * 0.8;   // strong by day/dusk, faint under stars
  }
  if (seaMat) {
    seaMat.uniforms.sunDir.value.set(0.5, T.sunY, 0.35).normalize();
    seaMat.uniforms.sunCol.value.setHex(T.disc);
    seaMat.uniforms.horCol.value.setHex(T.hor);
    seaMat.uniforms.fogCol.value.setHex(T.fog);
    seaMat.uniforms.deepCol.value.setHex(T.bot).multiplyScalar(0.5);
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
  applyWeather(weather.type);   // re-apply the weather overlay on the new TOD baseline (also refreshes the night radar factor)
  buildEnvMap();                // env captures the (possibly storm-dimmed) sky
}

/* Apply a weather condition: copy its modifiers into `weather` (folding the night radar factor
   via resolveWeather) and drive the visuals through the existing TOD/fog/cloud pipeline. Sibling
   of applyTimeOfDay; reads the current timeOfDay. IDEMPOTENT — visuals are recomputed from the
   TOD baseline each call (no accumulation). Does NOT rebuild the env map: pair with applyTimeOfDay
   when a fresh sky env is wanted (e.g. sector start). */
function applyWeather(type) {
  const m = resolveWeather(type, timeOfDay);
  weather.type = m.type;
  weather.radarMul = m.radarMul;
  weather.lockRangeMul = m.lockRangeMul;
  weather.lockSpeedMul = m.lockSpeedMul;
  weather.turbulence = m.turbulence;
  weather.fogMul = m.fogMul;
  const T = TODS[timeOfDay];
  const storm = weather.type === 'storm';
  if (scene && scene.fog) {
    scene.fog.density = FOG_BASE * weather.fogMul;
    const fc = new THREE.Color(T.fog);
    if (storm) fc.lerp(new THREE.Color(0x23262c), 0.55);   // desaturated slate overcast
    scene.fog.color.copy(fc);
    if (scene.background && scene.background.copy) scene.background.copy(fc);
  }
  if (skyMat) skyMat.uniforms.scatter.value = (1.15 - T.stars * 0.8) * (storm ? 0.5 : 1);
  retintClouds(T);   // reset every puff to the TOD baseline...
  if (storm) {        // ...then darken + desaturate them into a low overcast
    const grey = new THREE.Color(0x3a3f47);
    for (let i = 0; i < clouds.length; i++) {
      const kids = clouds[i].children;
      for (let k = 0; k < kids.length; k++) kids[k].material.color.lerp(grey, 0.5).multiplyScalar(0.8);
    }
  }
}

let _lightT = 5;   // seconds until the next storm lightning flash
/* Per-frame weather tick: advance the turbulence phase clock (read by combat.js) and fire the
   occasional storm lightning flash (reuses the empFlash screen-flash channel). */
function updateWeather(dt) {
  weatherT += dt;
  if (weather.type === 'storm') {
    _lightT -= dt;
    if (_lightT <= 0) { empFlash = Math.max(empFlash, 0.22); _lightT = 3.5 + Math.random() * 6.5; }
  }
}

/* Keep the sun rig centred on the action each frame: the shadow frustum tracks the
   player, while the disc + halos stay pinned to the camera so the sun never drifts
   as the player ranges across the map. Called once per frame from animate(). */
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

/* Low-res PMREM of the sky dome → scene.environment, so metallic surfaces (jets,
   missiles, sea foam) pick up real sky reflections. Rebuilt on time-of-day change. */
let envRT = null;
function buildEnvMap() {
  if (!renderer || !skyMat) return;
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(100, 24, 16), skyMat));
  if (envRT) envRT.dispose();
  envRT = pm.fromScene(es, 0.04);
  scene.environment = envRT.texture;
  pm.dispose();
}

/* soft blob shadow that pins the player to the deck during low-level flight */
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
  const gh = Math.max(terrainH(p.x, p.z), -10);   // shadow falls on terrain or the sea surface
  const agl = p.y - gh;
  if (agl > 700 || agl < 0) { playerShadow.visible = false; return; }
  playerShadow.visible = true;
  playerShadow.position.set(p.x, gh + 2.5, p.z);
  playerShadow.material.opacity = 0.32 * (1 - agl / 700);
  playerShadow.scale.setScalar(1 + agl * 0.0035);
}

function makePlatform() {
  platform = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(20, 23, 2.4, 36),
    new THREE.MeshStandardMaterial({ color: 0x0b1622, metalness: 0.45, roughness: 0.55, emissive: 0x06121e }));
  disc.position.y = -3; disc.receiveShadow = true; platform.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(20, 0.5, 8, 40), new THREE.MeshBasicMaterial({ color: 0x19f0d4 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -1.7; platform.add(ring);
  scene.add(platform);
}

/* ---------------- shared assets ---------------- */
const ASSET = {};

/* merge same-attribute BufferGeometries into one non-indexed geometry so a
   multi-part model (missile hull + fins + nose) renders as a single draw call */
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

/* swept missile fin: extruded trapezoid in the (radial, chord) plane, radiating +X.
   rootR = radial start, span = radial extent, chord = root chord, at z station zF. */
function missileFinGeo(rootR, span, chord, sweep, zF) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(span, sweep); sh.lineTo(span, sweep + chord * 0.32); sh.lineTo(0, chord); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, steps: 1, curveSegments: 4 });
  g.translate(0, 0, -0.06); g.rotateX(Math.PI / 2);   // shape-y (chord) -> +Z, thickness -> Y
  g.translate(rootR, 0, zF);
  return g;
}

function buildAssets() {
  // tracer rounds: crossed gradient-streak quads oriented along velocity (see updateBullets).
  // Head (hot end) sits at -Z to match dirToQuat's forward convention.
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
  ASSET.bulletMat = new THREE.MeshBasicMaterial({ map: tracerTex(), color: 0xffe9a0, fog: false, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  ASSET.ebulletMat = new THREE.MeshBasicMaterial({ map: tracerTex(), color: 0xff6a50, fog: false, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  // ---- missile: slender high-poly airframe, nose toward -Z (tip z=-12, exhaust z=+12) ----
  // hull (one merged draw call): ogive nose, body tube, boattail, 4 tail fins + 4 canards
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
    // trim (second draw call): seeker tip, two accent paint bands, exhaust disc
    const seeker = new THREE.SphereGeometry(0.36, 14, 10); seeker.translate(0, 0, -11.75);
    const band1 = new THREE.CylinderGeometry(R + 0.045, R + 0.045, 0.55, 24, 1, true); band1.rotateX(Math.PI / 2); band1.translate(0, 0, -5.6);
    const band2 = new THREE.CylinderGeometry(R + 0.045, R + 0.045, 0.55, 24, 1, true); band2.rotateX(Math.PI / 2); band2.translate(0, 0, 6.6);
    const exDisc = new THREE.CircleGeometry(0.62, 16); exDisc.translate(0, 0, 11.22);
    ASSET.missileTrimGeo = mergeGeos([seeker, band1, band2, exDisc]);
  }
  // matte/metallic hulls — subtle cool-grey (player) vs darker warm-grey (enemy) tint, NO neon emissive
  ASSET.missileMatPlayer = new THREE.MeshStandardMaterial({ color: 0xc6ccd2, metalness: 0.6, roughness: 0.5, envMapIntensity: 1.1 });
  ASSET.missileMatEnemy  = new THREE.MeshStandardMaterial({ color: 0x4a4640, metalness: 0.55, roughness: 0.6, envMapIntensity: 1.0 });
  // trim/seeker/bands: plain matte paint accents — emissive zeroed (was bright neon)
  ASSET.missileTrimPlayer = new THREE.MeshStandardMaterial({ color: 0x20262c, metalness: 0.45, roughness: 0.5 });
  ASSET.missileTrimEnemy  = new THREE.MeshStandardMaterial({ color: 0x241a14, metalness: 0.45, roughness: 0.55 });
  // small constant rear thruster flame — warm, soft, additive (NOT a big plume); reuses the fire texture
  ASSET.mslExhaust    = new THREE.SpriteMaterial({ map: fireTex(), color: 0xffb267, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  // every missile shares these — tag so disposeGroup (boss/tip-missile teardown) never frees them
  [ASSET.missileHullGeo, ASSET.missileTrimGeo].forEach(g => { g.userData.shared = true; });
  [ASSET.missileMatPlayer, ASSET.missileMatEnemy, ASSET.missileTrimPlayer, ASSET.missileTrimEnemy,
   ASSET.mslExhaust].forEach(m => { m.userData.shared = true; });
  ASSET.flareGeo = new THREE.SphereGeometry(3.2, 5, 4);
  ASSET.flareMat = new THREE.MeshBasicMaterial({ color: 0xffb33a, fog: false });
  ASSET.sparkGeo = new THREE.BoxGeometry(1.6, 1.6, 5);
  ASSET.fragGeo = new THREE.BoxGeometry(3.5, 3.5, 3.5);
  ASSET.fragMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.8 });
  ASSET.smokeGeo = new THREE.IcosahedronGeometry(1, 0);
  ASSET.lootGeo = new THREE.OctahedronGeometry(8, 0);
  // supply-crate building blocks
  ASSET.crateBoxGeo = new THREE.BoxGeometry(16, 16, 16);
  ASSET.crateEdgeGeo = new THREE.EdgesGeometry(ASSET.crateBoxGeo);
  ASSET.crateRingGeo = new THREE.TorusGeometry(15, 1.1, 8, 24);
  ASSET.crateBeamGeo = new THREE.CylinderGeometry(3, 3, 900, 6, 1, true);
  if (typeof loadJetModels === 'function') loadJetModels();   // preload glTF hero models (async; swaps in when ready)
}

/* assemble a flight-ready missile from the shared assets: matte/metallic hull +
   matte trim accents + a SMALL warm rear thruster flame (no neon halo). Everything
   is shared, so teardown is plain scene.remove — nothing per-instance to dispose. */
function buildMissileMesh(enemy) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ASSET.missileHullGeo, enemy ? ASSET.missileMatEnemy : ASSET.missileMatPlayer));
  g.add(new THREE.Mesh(ASSET.missileTrimGeo, enemy ? ASSET.missileTrimEnemy : ASSET.missileTrimPlayer));
  const exhaust = new THREE.Sprite(ASSET.mslExhaust);
  exhaust.position.z = 12.0; exhaust.scale.setScalar(6); g.add(exhaust);
  g.userData.exhaust = exhaust;
  return g;
}

/* radial glow sprite texture (shared) */
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
/* anamorphic tracer streak: hot round head fading down a tapering tail.
   Near-white core so the material color tints the falloff, not the peak. */
let TRACERTEX = null;
function tracerTex() {
  if (TRACERTEX) return TRACERTEX;
  const W2 = 256, H2 = 64, c = document.createElement('canvas'); c.width = W2; c.height = H2;
  const x = c.getContext('2d'), img = x.createImageData(W2, H2);
  for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) {
    const u = i / (W2 - 1), v = j / (H2 - 1);
    const head = Math.exp(-Math.pow(u * 4.2, 2));                       // bright bulb at u=0
    const tail = Math.pow(Math.max(0, 1 - u), 1.6) * 0.85;              // long falling tail
    const lat = Math.exp(-Math.pow((v - 0.5) * (3.4 + u * 5.0), 2));    // narrows toward the tail
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
/* fiery blast texture: noisy radial heat ramp (white core → orange → red edge) */
let FIRETEX = null;
function fireTex() {
  if (FIRETEX) return FIRETEX;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), img = x.createImageData(S, S);
  const N = 24, L = []; for (let i = 0; i < (N + 1) * (N + 1); i++) L.push(Math.random());
  const val = (u, v, sc) => {
    const gu = Math.min(u * sc, N - 0.001), gv = Math.min(v * sc, N - 0.001);
    const iu = Math.floor(gu), iv = Math.floor(gv), fu = gu - iu, fv = gv - iv;
    const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
    return lerp(lerp(L[iv * (N + 1) + iu], L[iv * (N + 1) + iu + 1], su), lerp(L[(iv + 1) * (N + 1) + iu], L[(iv + 1) * (N + 1) + iu + 1], su), sv);
  };
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
function spawnTrail(pos, color, op) {
  if (particles.length > 540) return;
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity: op || 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
  m.position.copy(pos); m.scale.setScalar(rand(6, 10)); scene.add(m);
  particles.push({ mesh: m, vel: null, life: 0.85, max: 0.85, type: 'trail', grow: 9 });
}
function spawnShockwave(pos) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(2, 3.6, 30), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  ring.position.copy(pos); ring.lookAt(camera.position); scene.add(ring);
  particles.push({ mesh: ring, vel: null, life: 0.6, max: 0.6, type: 'ring' });
}
/* thin white/grey missile contrail — a single small low-opacity smoke puff, no glowing core.
   `color` tints the smoke (subtle cool-/warm-grey per side), never neon. */
function spawnMissileTrail(pos, color) {
  if (particles.length > 620) return;
  const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudPuffTex(), color: color || 0xdfe2e6, transparent: true, opacity: 0.26, depthWrite: false, fog: true, rotation: rand(0, TWO_PI) }));
  puff.position.copy(pos); puff.scale.setScalar(rand(4, 7)); scene.add(puff);
  particles.push({ mesh: puff, vel: new THREE.Vector3(rand(-2, 2), rand(-1, 2), rand(-2, 2)), life: rand(0.7, 1.1), max: 1.1, type: 'smoke', grow: 16, rot: rand(-1.2, 1.2) });
}
/* floating supply crate: glowing box, wire edges, spin ring, beacon glow + sky beam */
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
