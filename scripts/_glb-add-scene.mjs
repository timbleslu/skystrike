/* Repair glbs that have no scene graph: inject scenes:[{nodes:[roots]}] + scene:0 so GLTFLoader
   yields a non-empty gltf.scene. Idempotent (skips files that already have a scene). Backs up
   originals to .scratch/jet-visual-overhaul/glb-orig/. Usage: node scripts/_glb-add-scene.mjs f47 j20 j36 j50 */
import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { join } from 'path';
const root = new URL('..', import.meta.url).pathname;
const JSON_TYPE = 0x4e4f534a, BIN_TYPE = 0x004e4942;
const pad4 = (n) => (4 - (n % 4)) % 4;

for (const id of process.argv.slice(2)) {
  const path = join(root, 'assets/jets', id + '.glb');
  const buf = await readFile(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) { console.log(id, 'NOT a glb, skip'); continue; }
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== JSON_TYPE) { console.log(id, 'first chunk not JSON, skip'); continue; }
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  if (json.scene !== undefined && Array.isArray(json.scenes) && json.scenes.length) { console.log(id, 'already has scene, skip'); continue; }
  if (!Array.isArray(json.nodes) || !json.nodes.length) { console.log(id, 'NO nodes — cannot repair'); continue; }
  // root nodes = indices never referenced as a child
  const child = new Set();
  json.nodes.forEach(nd => (nd.children || []).forEach(c => child.add(c)));
  const roots = json.nodes.map((_, i) => i).filter(i => !child.has(i));
  json.scenes = [{ nodes: roots }];
  json.scene = 0;

  // rebuild glb: header + JSON chunk (space-padded) + original BIN chunk (verbatim)
  let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jp = pad4(jsonBytes.length);
  if (jp) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jp, 0x20)]);
  const binStart = 20 + jsonLen;
  const binChunk = binStart < buf.length ? buf.slice(binStart) : Buffer.alloc(0);   // [len][type][data] verbatim
  const total = 12 + 8 + jsonBytes.length + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);   // header
  out.writeUInt32LE(jsonBytes.length, 12); out.writeUInt32LE(JSON_TYPE, 16); jsonBytes.copy(out, 20);
  binChunk.copy(out, 20 + jsonBytes.length);

  await mkdir(join(root, '.scratch/jet-visual-overhaul/glb-orig'), { recursive: true });
  await copyFile(path, join(root, '.scratch/jet-visual-overhaul/glb-orig', id + '.glb'));   // backup
  await writeFile(path, out);
  console.log(id, 'PATCHED — roots:', JSON.stringify(roots), 'bin kept:', binChunk.length, 'B');
}
