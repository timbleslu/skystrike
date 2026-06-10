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
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070d18);
  scene.fog = new THREE.FogExp2(0x0a1424, 0.000058);

  camera = new THREE.PerspectiveCamera(72, W / H, 1, 40000);
  camera.position.set(0, 6, 42); camera.lookAt(0, 2, 0);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: true });
  renderer.setSize(W, H); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  ambientLight = new THREE.AmbientLight(0x4a5e7a, 0.85); scene.add(ambientLight);
  hemiLight = new THREE.HemisphereLight(0x9fc0ff, 0x21303f, 0.65); scene.add(hemiLight);
  sun = new THREE.DirectionalLight(0xfff0d6, 1.2);
  sun.position.set(0.5, 1.0, 0.35).multiplyScalar(2000); scene.add(sun);
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

function buildSky() {
  const geo = new THREE.SphereGeometry(22000, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x081230) }, bot: { value: new THREE.Color(0x1d4a63) }, hor: { value: new THREE.Color(0x2a6a7a) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bot; uniform vec3 hor; void main(){ float h=normalize(vP).y; vec3 c = h>0.0 ? mix(hor,top,pow(h,0.55)) : mix(hor,bot,pow(-h,0.7)); gl_FragColor=vec4(c,1.0); }'
  });
  scene.add(new THREE.Mesh(geo, mat));
  skyMat = mat;
  const g = new THREE.Mesh(new THREE.SphereGeometry(420, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3d0, fog: false }));
  g.position.copy(sun.position).setLength(18000); scene.add(g); sunDisc = g;
}

let terrainMesh;
function buildTerrain() {
  const SIZE = 26000, SEG = 150;
  let geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  geo = geo.toNonIndexed();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainH(pos.getX(i), pos.getZ(i)));
  const cLow = new THREE.Color(0x143038), cMid = new THREE.Color(0x1f4a3a), cHigh = new THREE.Color(0x586d7e), cSnow = new THREE.Color(0xd2e4ef);
  const colors = []; const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const ay = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    let t = clamp((ay + 220) / 760, 0, 1);
    if (t < 0.4) c.copy(cLow).lerp(cMid, t / 0.4);
    else if (t < 0.74) c.copy(cMid).lerp(cHigh, (t - 0.4) / 0.34);
    else c.copy(cHigh).lerp(cSnow, (t - 0.74) / 0.26);
    const j = 1 + (Math.random() - 0.5) * 0.12;
    for (let k = 0; k < 3; k++) colors.push(c.r * j, c.g * j, c.b * j);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  terrainMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0, roughness: 0.96 }));
  scene.add(terrainMesh);
}

let cloudGeo, cloudMat;
function buildClouds() {
  cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  cloudMat = new THREE.MeshStandardMaterial({ color: 0xdfe9f6, flatShading: true, transparent: true, opacity: 0.5, roughness: 1, metalness: 0, depthWrite: false });
  for (let i = 0; i < 32; i++) {
    const g = new THREE.Group();
    const base = rand(190, 440);
    const n = randInt(5, 9);
    for (let p = 0; p < n; p++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      m.position.set(rand(-1, 1) * base * 1.2, rand(-0.3, 0.3) * base, rand(-1, 1) * base * 1.2);
      const s = rand(0.5, 1.1) * base;
      m.scale.set(s, s * rand(0.5, 0.7), s);
      m.renderOrder = 2;
      g.add(m);
    }
    g.position.set(rand(-10000, 10000), rand(680, 2700), rand(-10000, 10000));
    g.userData.radius = base * 1.55;
    scene.add(g); clouds.push(g);
  }
}
function inCloud(pos) {
  for (let i = 0; i < clouds.length; i++) if (pos.distanceToSquared(clouds[i].position) < clouds[i].userData.radius * clouds[i].userData.radius) return true;
  return false;
}

let seaMesh;
function buildScenery() {
  seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(70000, 70000, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x0c2c3e, metalness: 0.35, roughness: 0.22, transparent: true, opacity: 0.92 }));
  seaMesh.rotation.x = -Math.PI / 2; seaMesh.position.y = -10; scene.add(seaMesh);

  const sv = [];
  for (let i = 0; i < 700; i++) { const d = new THREE.Vector3(rand(-1, 1), rand(0.06, 1), rand(-1, 1)).normalize().multiplyScalar(19000); sv.push(d.x, d.y, d.z); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
  starsMat = new THREE.PointsMaterial({ color: 0xcfe6ff, size: 32, sizeAttenuation: true, transparent: true, opacity: 0.85, fog: false, depthWrite: false });
  scene.add(new THREE.Points(sg, starsMat));

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff0c0, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false }));
  halo.scale.setScalar(5200); halo.position.copy(sun.position).setLength(17000); scene.add(halo); haloA = halo;
  const halo2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffe6a0, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.32, depthWrite: false, depthTest: false }));
  halo2.scale.setScalar(9000); halo2.position.copy(halo.position); scene.add(halo2); haloB = halo2;
}
function applyTimeOfDay(tod) {
  timeOfDay = clamp(tod, 0, 2);
  const T = TODS[timeOfDay];
  if (skyMat) { skyMat.uniforms.top.value.setHex(T.top); skyMat.uniforms.hor.value.setHex(T.hor); skyMat.uniforms.bot.value.setHex(T.bot); }
  if (scene) { if (scene.fog) scene.fog.color.setHex(T.fog); scene.background.setHex(T.fog); }
  if (sun) { sun.color.setHex(T.sun); sun.intensity = T.sunI; sun.position.set(0.5, T.sunY, 0.35).setLength(2000); }
  if (sunDisc) { sunDisc.material.color.setHex(T.disc); sunDisc.position.copy(sun.position).setLength(18000); }
  if (ambientLight) ambientLight.intensity = T.amb;
  if (hemiLight) hemiLight.intensity = T.hemi;
  if (rimLight) rimLight.intensity = T.rim;
  if (starsMat) starsMat.opacity = T.stars;
  const f = 1 - T.stars * 0.8;
  if (haloA) { haloA.position.copy(sun.position).setLength(17000); haloA.material.opacity = 0.6 * f; }
  if (haloB) { haloB.position.copy(sun.position).setLength(17000); haloB.material.opacity = 0.32 * f; }
}

function makePlatform() {
  platform = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(20, 23, 2.4, 36),
    new THREE.MeshStandardMaterial({ color: 0x0b1622, metalness: 0.45, roughness: 0.55, emissive: 0x06121e }));
  disc.position.y = -3; platform.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(20, 0.5, 8, 40), new THREE.MeshBasicMaterial({ color: 0x19f0d4 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -1.7; platform.add(ring);
  scene.add(platform);
}

/* ---------------- shared assets ---------------- */
const ASSET = {};
function buildAssets() {
  ASSET.bulletGeo = new THREE.SphereGeometry(2.4, 6, 4);
  ASSET.bulletMat = new THREE.MeshBasicMaterial({ color: 0xfff090, fog: false });
  ASSET.ebulletMat = new THREE.MeshBasicMaterial({ color: 0xff5440, fog: false });
  ASSET.missileGeo = new THREE.ConeGeometry(3.4, 22, 8); ASSET.missileGeo.rotateX(-Math.PI / 2);
  ASSET.missileMatPlayer = new THREE.MeshStandardMaterial({ color: 0xeaffff, emissive: 0x2ec8ff, emissiveIntensity: 1.5, flatShading: true });
  ASSET.missileMatEnemy  = new THREE.MeshStandardMaterial({ color: 0xfff0e6, emissive: 0xff5a22, emissiveIntensity: 1.7, flatShading: true });
  ASSET.missileMat = ASSET.missileMatEnemy;
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
function makeMarker(type) {
  const color = type === 'boss' ? 0xff39c8 : type === 'ground' ? 0xffa033 : 0xff4040;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false, transparent: true, opacity: 0.85 }));
  sp.scale.setScalar(60); return sp;
}
function spawnTrail(pos, color, op) {
  if (particles.length > 540) return;
  const m = new THREE.Mesh(ASSET.smokeGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op || 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
  m.position.copy(pos); m.scale.setScalar(rand(3, 5)); scene.add(m);
  particles.push({ mesh: m, vel: null, life: 0.85, max: 0.85, type: 'trail', grow: 7 });
}
function spawnShockwave(pos) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(2, 3.6, 30), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  ring.position.copy(pos); ring.lookAt(camera.position); scene.add(ring);
  particles.push({ mesh: ring, vel: null, life: 0.6, max: 0.6, type: 'ring' });
}
/* fat, glowing missile exhaust — bright core puff + expanding pale smoke so the trail reads clearly */
function spawnMissileTrail(pos, color) {
  if (particles.length > 620) return;
  const core = new THREE.Mesh(ASSET.smokeGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  core.position.copy(pos); core.scale.setScalar(rand(5, 7.5)); scene.add(core);
  particles.push({ mesh: core, vel: null, life: 0.5, max: 0.5, type: 'mcore', grow: 12 });
  const puff = new THREE.Mesh(ASSET.smokeGeo, new THREE.MeshBasicMaterial({ color: 0xe6edf4, transparent: true, opacity: 0.5, depthWrite: false, fog: true }));
  puff.position.copy(pos); puff.scale.setScalar(rand(6, 9)); scene.add(puff);
  particles.push({ mesh: puff, vel: new THREE.Vector3(rand(-4, 4), rand(-2, 4), rand(-4, 4)), life: rand(0.7, 1.1), max: 1.1, type: 'smoke', grow: 26 });
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

/* Free GPU geometry + materials of a removed object subtree. Skips geometry tagged
   userData.shared (cached jet geometry reused by living enemies) and textures (.map,
   shared/cached e.g. the drone glow sprite) — disposing either would corrupt others. */
function disposeGroup(group) {
  if (!group) return;
  group.traverse(o => {
    if (o.isMesh || o.isSprite) {
      if (o.geometry && o.geometry.dispose && !o.geometry.userData.shared) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) if (m && m.dispose) m.dispose();
    }
  });
}
