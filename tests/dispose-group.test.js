'use strict';
const assert = require('assert');

// --- Production helper under test (mirror of js/engine.js disposeGroup) ---
function disposeGroup(group) {
  if (!group) return;
  group.traverse(o => {
    if (o.isMesh || o.isSprite) {
      if (o.geometry && o.geometry.dispose && !o.geometry.userData.shared) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) if (m && m.dispose) m.dispose();   // note: do NOT dispose m.map (shared textures)
    }
  });
}

// fakes
const mkGeo = (shared) => ({ disposed: false, userData: shared ? { shared: true } : {}, dispose() { this.disposed = true; } });
const mkMat = (withMap) => ({ disposed: false, map: withMap ? { disposed: false, dispose() { this.disposed = true; } } : null, dispose() { this.disposed = true; } });
function mkGroup(children) { return { traverse(fn) { for (const c of children) fn(c); } }; }

// per-instance geometry IS disposed; shared geometry is NOT; materials always disposed; textures never
const perInst = mkGeo(false), sharedG = mkGeo(true);
const mat1 = mkMat(false), mat2 = mkMat(true);
const group = mkGroup([
  { isMesh: true, geometry: perInst, material: mat1 },
  { isMesh: true, geometry: sharedG, material: mat2 },
]);
disposeGroup(group);

assert.strictEqual(perInst.disposed, true, 'per-instance geometry must be disposed');
assert.strictEqual(sharedG.disposed, false, 'shared geometry must NOT be disposed');
assert.strictEqual(mat1.disposed, true, 'material must be disposed');
assert.strictEqual(mat2.disposed, true, 'material with map must be disposed');
assert.strictEqual(mat2.map.disposed, false, 'texture (map) must NOT be disposed');
console.log('ok - disposeGroup skips shared geometry, frees per-instance geo + materials, spares textures');

// material array support
const arrMat = [mkMat(false), mkMat(false)];
const g2 = mkGroup([{ isSprite: true, geometry: mkGeo(false), material: arrMat }]);
disposeGroup(g2);
assert.ok(arrMat.every(m => m.disposed), 'all materials in an array must be disposed');
console.log('ok - multi-material array');
