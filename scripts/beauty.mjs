/* Dev-only close-up harness: frames the hangar preview jet, a missile and tracer
   rounds with the DOM UI hidden — for judging model/material quality up close.
   Usage: node scripts/beauty.mjs <outPrefix> [jetIndex=1] [timeOfDay 0|1|2]
   Requires playwright. Not part of the shipped game. */
import { launchGame } from './lib/boot.mjs';

const prefix = process.argv[2] || 'beauty';
const jetIdx = +(process.argv[3] || 1);
const tod = +(process.argv[4] || 0);
const zoom = +(process.argv[5] || 1);
const thr = process.argv[6] != null ? +process.argv[6] : 0.95;

const { page, port, close } = await launchGame();
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(1200);
await page.waitForFunction(() => typeof jetGLTF !== 'undefined' && jetGLTF.F22, { timeout: 7000 }).catch(() => {});

await page.addStyleTag({ content: 'body > *:not(canvas){display:none!important}' });
await page.evaluate(({ j, t, thr, zoom }) => {
  applyTimeOfDay(t);
  selectJet(j);
  document.body.appendChild(previewCanvas);
  previewCanvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
  previewRenderer.setSize(window.innerWidth, window.innerHeight, false);
  previewCamera.aspect = window.innerWidth / window.innerHeight;
  previewCamera.updateProjectionMatrix();
  hangarPreview.spinResumeAt = Infinity;
  hangarPreview.pitch = 0;
  hangarPreview.zoom = 1 / zoom;
  animEngines(previewJet, thr);
}, { j: jetIdx, t: tod, thr, zoom });

const frames = [
  ['front', Math.PI],
  ['side', Math.PI / 2],
  ['rear', 0],
];
for (const [name, yaw] of frames) {
  await page.evaluate(({ yaw, thr }) => {
    animEngines(previewJet, thr);
    hangarPreview.yaw = yaw;
  }, { yaw, thr });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${prefix}-jet-${name}.png` });
}

await page.evaluate(() => {
  previewCanvas.style.display = 'none';
  const m = buildMissileMesh(false); m.position.set(-2, 5, 0); m.rotation.y = 0.55; scene.add(m);
  const me = buildMissileMesh(true); me.position.set(2.5, 8, -3); me.rotation.y = 0.7; scene.add(me);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(ASSET.bulletGeo, i % 2 ? ASSET.ebulletMat : ASSET.bulletMat);
    b.position.set(-7 + i * 6, 2.2, 5); b.rotation.y = 0.6; scene.add(b);
  }
  camera.position.set(-3, 7, -20); camera.lookAt(0, 5.5, 0);
});
await page.waitForTimeout(150);
await page.screenshot({ path: `${prefix}-ordnance.png` });

await close();
console.log('done:', prefix);
