'use strict';
const assert = require('assert');

// --- Production helper under test (mirror of js/engine.js disposeGroup) ---
function disposeGroup(group) {
  group.traverse(o => {
    if (o.isMesh || o.isSprite) {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) if (m.dispose) m.dispose();   // note: do NOT dispose m.map (shared textures)
    }
  });
}

// --- Minimal Three-like tree ---
function node(props) {
  return Object.assign({
    children: [],
    traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); },
  }, props);
}
function disposable() { let n = 0; return { dispose() { n++; }, calls: () => n }; }

(function testDisposesGeoAndMatNotTexture() {
  const geo = disposable(), tex = disposable();
  const matWithMap = Object.assign(disposable(), { map: tex });
  const mesh = node({ isMesh: true, geometry: geo, material: matWithMap });
  const root = node({ children: [mesh] });

  disposeGroup(root);

  assert.strictEqual(geo.calls(), 1, 'geometry disposed once');
  assert.strictEqual(matWithMap.calls(), 1, 'material disposed once');
  assert.strictEqual(tex.calls(), 0, 'texture (map) NOT disposed');
  console.log('ok - disposes geometry + material, leaves textures');
})();

(function testMultiMaterialArray() {
  const g = disposable(), m1 = disposable(), m2 = disposable();
  const mesh = node({ isMesh: true, geometry: g, material: [m1, m2] });
  disposeGroup(node({ children: [mesh] }));
  assert.strictEqual(m1.calls(), 1, 'array material[0] disposed');
  assert.strictEqual(m2.calls(), 1, 'array material[1] disposed');
  console.log('ok - multi-material array');
})();

console.log('ALL PASS');
