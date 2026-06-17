/* One-shot: vendor the Draco decoder + adapt DRACOLoader.js to a browser global (matches
   vendor/GLTFLoader.js). Run once: node scripts/_vendor-draco.mjs  (safe to delete after). */
import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const tm = join(root, 'node_modules/three/examples/jsm');

// 1. decoder binaries (wasm path: wrapper + .wasm only; no JS fallback / encoder)
await mkdir(join(root, 'vendor/draco'), { recursive: true });
for (const f of ['draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
  await copyFile(join(tm, 'libs/draco/gltf', f), join(root, 'vendor/draco', f));
}

// 2. DRACOLoader.js → browser global
let src = await readFile(join(tm, 'loaders/DRACOLoader.js'), 'utf8');
const names = 'BufferAttribute, BufferGeometry, Color, FileLoader, Loader, LinearSRGBColorSpace, SRGBColorSpace';
src = src.replace(/^import \{[\s\S]*?\} from 'three';/m,
  `(function () {\nconst { ${names} } = THREE;`);
src = src.replace(/export \{ DRACOLoader \};/, 'THREE.DRACOLoader = DRACOLoader;\n})();');
const header = `/* Vendored Three.js r159 DRACOLoader adapted to a browser GLOBAL (no ES modules).
   Source: three@0.159.0 examples/jsm/loaders/DRACOLoader.js; 'three' imports rewired to the
   global THREE; exposes THREE.DRACOLoader. Load AFTER vendor/GLTFLoader.js. Decoder binaries
   vendored in vendor/draco/ (draco_wasm_wrapper.js + draco_decoder.wasm). Regenerate if three bumps. */\n`;
await writeFile(join(root, 'vendor/DRACOLoader.js'), header + src);
console.log('wrote vendor/DRACOLoader.js +', 'vendor/draco/{draco_wasm_wrapper.js,draco_decoder.wasm}');
