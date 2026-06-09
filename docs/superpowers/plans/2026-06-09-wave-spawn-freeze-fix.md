# Wave-Spawn Freeze Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the frame freeze that occurs every time a wave is announced, by spreading enemy mesh construction across multiple frames instead of building the whole wave synchronously in one call.

**Architecture:** `nextWave()` currently builds every enemy mesh (LatheGeometry + multiple ExtrudeGeometry triangulations + dozens of meshes + ~7 materials per jet) synchronously in a single frame — up to 10 fighters + boss + drone swarm + turrets at once. We convert those direct spawn calls into a FIFO queue of zero-arg closures (`pendingSpawns`) drained a few per frame from the main loop. Total work is unchanged; the single-frame spike is amortized over ~5–10 frames (<170 ms wall, invisible per-frame). A second, independent task disposes enemy GPU geometry/materials on death to stop the unbounded memory growth that makes the hitch worsen over a long session.

**Tech Stack:** Vanilla JS, Three.js (global `THREE`), browser globals loaded via `<script>` tags (no module system, no existing test framework). Node.js used only for an isolated logic test.

**Root cause evidence (from debugging session):**
- `js/main.js:4-15` `nextWave()` calls `spawnFighter()` ×count, `spawnBoss()`, `spawnAce()`, `spawnBomber()`, `spawnDroneSwarm()`, `spawnGround()` — all synchronously in one frame.
- `js/entities.js:157` `buildJet()` builds 1 `LatheGeometry`, 3–4 `ExtrudeGeometry` (earcut triangulation, via `extrudeWing` at `entities.js:5`), ~20-30 primitive geometries, and ~7 fresh `MeshStandardMaterial` per fighter. Boss is `hero=true` → far denser (`NS=34`, `RING=56`, 16-petal nozzle loops).
- Zero geometry/material reuse and zero `dispose()` anywhere in `entities.js` (secondary leak).
- The only runtime mutation of a cached enemy material is the boss-enrage `emissiveIntensity` bump (`js/combat.js:458`); boss is unique, so amortization introduces no cross-instance hazard.

**Why amortize instead of cache+clone:** A template-clone refactor would cut total CPU further but requires re-linking `userData` pointers (`body`, `engines`, `core`, `ring`, `glow`, `shell`) into each cloned subtree and is invasive/risky. Amortization is a zero-behavior-change fix that fully removes the reported freeze. Caching can be a later optimization if needed.

---

## File Structure

- `js/globals.js` — add the `pendingSpawns` queue global next to existing wave state (`js/globals.js:125`).
- `js/main.js` — rewrite `nextWave()` (`:4`) to enqueue closures; add `processSpawnQueue()`; drain it once per frame from `handleWaves()` (`:459`).
- `tests/spawn-queue.test.js` — new isolated Node test asserting the queue invariants (drain rate + at-least-one-combat-enemy-first-tick, which prevents the wave-clear re-trigger race).

---

## Task 1: Frame-amortized wave spawning

**Files:**
- Test: `tests/spawn-queue.test.js` (create)
- Modify: `js/globals.js:125`
- Modify: `js/main.js:4-15` (`nextWave`), `js/main.js:459-470` (`handleWaves`)

- [ ] **Step 1: Write the failing test**

Create `tests/spawn-queue.test.js`. This test reproduces the queue logic in isolation (the game's globals require a browser + Three.js, so we validate the amortization invariants here and verify the in-game freeze manually in Step 8). It asserts two things the fix must guarantee:
1. Only `n` queued spawns run per `processSpawnQueue(n)` tick (the amortization itself).
2. The first tick builds at least one combat enemy, so `handleWaves()`'s `aliveCombat` check cannot immediately re-trigger "WAVE CLEAR" the frame after `nextWave()` runs (the race this fix must not introduce).

```javascript
'use strict';
const assert = require('assert');

// --- Mirror of the production queue logic (js/globals.js + js/main.js) ---
let pendingSpawns = [];
function processSpawnQueue(n) {
  for (let i = 0; i < n && pendingSpawns.length; i++) pendingSpawns.shift()();
}

// --- Test 1: only n built per tick ---
(function testDrainRate() {
  pendingSpawns = [];
  let built = 0;
  const spawn = () => { built++; };
  for (let i = 0; i < 10; i++) pendingSpawns.push(spawn);  // 10-fighter wave

  processSpawnQueue(2);
  assert.strictEqual(built, 2, 'first tick builds exactly 2');
  assert.strictEqual(pendingSpawns.length, 8, '8 still queued');

  for (let t = 0; t < 4; t++) processSpawnQueue(2);
  assert.strictEqual(built, 10, 'all 10 built after 5 ticks total');
  assert.strictEqual(pendingSpawns.length, 0, 'queue drained');
  console.log('ok - drain rate');
})();

// --- Test 2: a combat enemy is built on the first tick (no wave-clear race) ---
(function testFirstTickHasCombatEnemy() {
  pendingSpawns = [];
  let combatAlive = 0;
  const spawnFighter = () => { combatAlive++; };
  const spawnGround  = () => { /* non-combat: excluded from aliveCombat */ };
  // nextWave enqueues fighters first, then turrets (mirrors js/main.js ordering)
  pendingSpawns.push(spawnFighter, spawnFighter, spawnGround);

  processSpawnQueue(2);
  assert.ok(combatAlive >= 1, 'at least one combat enemy exists after first tick');
  console.log('ok - first tick has combat enemy');
})();

console.log('ALL PASS');
```

- [ ] **Step 2: Run test to verify it passes against the mirror (guards the invariant)**

Run: `node tests/spawn-queue.test.js`
Expected: prints `ok - drain rate`, `ok - first tick has combat enemy`, `ALL PASS`, exit 0.

> Note: because the test mirrors the logic, it passes immediately — its job is to lock the invariant and fail if a later edit changes the drain contract. The behavioral failing-state for this task is the **in-game freeze**, reproduced manually in Step 8 before the fix and confirmed gone after.

- [ ] **Step 3: Add the `pendingSpawns` global**

In `js/globals.js`, line 125 currently reads:

```javascript
let wave = 0, betweenWaves = true, waveTimer = 2.6;
```

Change it to:

```javascript
let wave = 0, betweenWaves = true, waveTimer = 2.6;
let pendingSpawns = [];          // FIFO of zero-arg spawn closures, drained a few per frame to avoid wave-start hitch
const SPAWN_PER_FRAME = 2;       // enemies actually built per frame after a wave is announced
```

- [ ] **Step 4: Rewrite `nextWave()` to enqueue instead of build**

In `js/main.js`, replace the entire `nextWave` function (lines 4–15):

```javascript
function nextWave() {
  wave++;
  player._cheatUsed = false;   // APEX PREDATOR's save refreshes every wave
  const count = clamp(3 + wave + DIFFS[difficulty].count, 2, 10);
  for (let i = 0; i < count; i++) pendingSpawns.push(spawnFighter);   // fighters first → first drained = combat enemy
  if (wave % 4 === 0) { pendingSpawns.push(spawnBoss); showBanner('⚠ BOSS INCOMING ⚠'); }
  else showBanner('WAVE ' + wave);
  if (wave >= 3 && wave % 4 !== 0 && Math.random() < (0.45 + difficulty * 0.12)) pendingSpawns.push(spawnAce);
  if (wave >= 4 && wave % 4 !== 0 && Math.random() < 0.32) pendingSpawns.push(spawnBomber);
  if (wave >= 3 && wave % 4 !== 0 && Math.random() < 0.5) {
    const dn = randInt(3, 4) + Math.floor(wave / 4);
    pendingSpawns.push(() => spawnDroneSwarm(dn));
  }
  if (wave >= 2) { const ng = randInt(1, 2); for (let k = 0; k < ng; k++) pendingSpawns.push(spawnGround); }
}
```

Key points preserved:
- `wave++`, `_cheatUsed` reset, and `showBanner` still fire immediately (the banner is intentionally instant).
- The random branches still evaluate at announce time (so per-wave RNG outcome is unchanged); only the *building* is deferred.
- Fighters are pushed before turrets/drones so the first items drained are always combat fighters (feeds Step 6's race guard).
- `spawnDroneSwarm` keeps its single-call form (drones are lightweight — Octahedron/Box/Icosahedron/Sprite, no Lathe/Extrude — so one frame of 3–4 drones is not a visible spike). Its own `'DRONE SWARM'` banner now appears a moment after the wave banner, which reads fine.

- [ ] **Step 5: Add `processSpawnQueue()`**

In `js/main.js`, add this function immediately after `nextWave` (before `spawnAce` at the old line 16):

```javascript
function processSpawnQueue(n) {
  for (let i = 0; i < n && pendingSpawns.length; i++) pendingSpawns.shift()();
}
```

- [ ] **Step 6: Drain the queue every frame from `handleWaves()`**

In `js/main.js`, `handleWaves` currently is (lines 459–470):

```javascript
function handleWaves(dt) {
  const aliveCombat = enemies.some(e => e.alive && e.type !== 'ground' && e.type !== 'bomber');
  if (!betweenWaves) {
    if (!aliveCombat && wave > 0) {
      betweenWaves = true; waveTimer = 4; showBanner('WAVE ' + wave + ' CLEAR');
      openTechScreen();   // open the R&D tech tree before the next wave
    }
  } else if (!choosingUpgrade) {
    waveTimer -= dt;
    if (waveTimer <= 0) { betweenWaves = false; nextWave(); }
  }
}
```

Add the drain at the end, and guard the wave-clear check so it cannot fire while spawns are still pending. Replace the whole function with:

```javascript
function handleWaves(dt) {
  const aliveCombat = enemies.some(e => e.alive && e.type !== 'ground' && e.type !== 'bomber');
  if (!betweenWaves) {
    // Don't declare the wave clear until the queue is empty — otherwise the frames between
    // nextWave() and the first fighter being built would look "enemy-free" and re-trigger clear.
    if (!aliveCombat && pendingSpawns.length === 0 && wave > 0) {
      betweenWaves = true; waveTimer = 4; showBanner('WAVE ' + wave + ' CLEAR');
      openTechScreen();   // open the R&D tech tree before the next wave
    }
  } else if (!choosingUpgrade) {
    waveTimer -= dt;
    if (waveTimer <= 0) { betweenWaves = false; nextWave(); }
  }
  processSpawnQueue(SPAWN_PER_FRAME);   // build a few queued enemies this frame
}
```

The `pendingSpawns.length === 0` guard is the authoritative fix for the wave-clear race (belt-and-suspenders with the fighters-first ordering): a wave can never be reported clear while enemies are still queued to spawn.

- [ ] **Step 7: Re-run the logic test**

Run: `node tests/spawn-queue.test.js`
Expected: `ALL PASS`, exit 0. (Guards that the drain contract the code relies on still holds.)

- [ ] **Step 8: Manual in-browser verification of the actual freeze**

Open `index.html` in a browser (or `python3 -m http.server` then load `localhost:8000`). Open DevTools → Performance, start a recording, and play through at least 3 wave transitions including one boss wave (wave 4).

Verify:
1. **No freeze:** At each "WAVE N" / "BOSS INCOMING" / "DRONE SWARM" banner there is no multi-frame stall. In the Performance timeline there is no single long task at wave start; instead spawning is spread over ~5–10 short frames. (Before the fix: one long blocking task at wave start.)
2. **Enemies still appear:** The full wave (fighters, plus ace/bomber/drones/turrets per RNG) materializes within ~1 s of the banner. Because enemies spawn 2000–4400 units out, the staggered appearance is not visible to the player.
3. **Waves still clear and advance:** Clearing a wave still shows "WAVE N CLEAR", opens the tech screen, and proceeds to the next wave. Confirm a wave is **never** reported clear instantly at its own start (the race guard).
4. **Boss wave:** Wave 4 spawns the boss and the fighters with no hitch.

- [ ] **Step 9: Commit**

```bash
git add js/globals.js js/main.js tests/spawn-queue.test.js
git commit -m "perf: amortize wave enemy spawning across frames to kill wave-start freeze

nextWave() built the entire wave's meshes (Lathe + Extrude triangulation,
dozens of meshes and ~7 materials per jet, up to 10 jets + boss + drones)
synchronously in one frame, freezing the game at each wave banner. Queue
spawns as closures in pendingSpawns and drain SPAWN_PER_FRAME per frame from
handleWaves(); guard wave-clear on an empty queue so a wave is never reported
clear before its enemies finish spawning.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Dispose enemy GPU resources on death (memory-leak mitigation)

Independent of the freeze fix. Enemies are removed from the scene on death but their geometries/materials are never freed (`dispose` count in `entities.js` = 0), so a long session accumulates GPU buffers and GC pressure that make hitches grow over time. This task frees them. Safe because no enemy currently shares geometry or materials with another (every `buildJet`/`buildDrone`/etc. allocates fresh).

**Files:**
- Test: `tests/dispose-group.test.js` (create)
- Modify: `js/combat.js` (in `killEnemy`, around the `scene.remove(e.group)` at `js/combat.js:491`)
- Modify: `js/entities.js` (bomber-escape removal at `js/entities.js:730`)

- [ ] **Step 1: Write the failing test**

Create `tests/dispose-group.test.js`. It builds a fake Three-style object tree and asserts `disposeGroup` calls `dispose()` exactly once on every mesh geometry and material, and does **not** touch material textures (`.map`) — textures may be shared/cached (e.g. drone glow via `glowTex()`), so disposing them is unsafe.

```javascript
'use strict';
const assert = require('assert');

// --- Production helper under test (mirror of js/combat.js disposeGroup) ---
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
  const geo = disposable(), mat = disposable(), tex = disposable();
  const mesh = node({ isMesh: true, geometry: geo, material: Object.assign(disposable(), { map: tex }) });
  // give the mesh's material its own dispose counter while keeping a .map texture:
  const matWithMap = Object.assign(disposable(), { map: tex });
  mesh.material = matWithMap;
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
```

- [ ] **Step 2: Run the test to verify it passes against the mirror**

Run: `node tests/dispose-group.test.js`
Expected: `ok - disposes geometry + material, leaves textures`, `ok - multi-material array`, `ALL PASS`, exit 0.

- [ ] **Step 3: Add `disposeGroup()` in `js/combat.js`**

In `js/combat.js`, add this helper immediately above `killEnemy` (which starts at `js/combat.js:468`):

```javascript
// Free GPU geometry + materials of a removed object subtree. Leaves textures (.map) alone —
// some are shared/cached (e.g. drone glow sprite), and disposing a shared texture breaks others.
function disposeGroup(group) {
  if (!group) return;
  group.traverse(o => {
    if (o.isMesh || o.isSprite) {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) if (m && m.dispose) m.dispose();
    }
  });
}
```

- [ ] **Step 4: Call `disposeGroup` where the enemy group is removed**

In `js/combat.js`, `killEnemy` currently removes the group at line 491:

```javascript
  scene.remove(e.group);
  if (e.marker) scene.remove(e.marker);
```

Change to:

```javascript
  scene.remove(e.group);
  disposeGroup(e.group);
  if (e.marker) scene.remove(e.marker);   // marker geometry/material may be shared — do not dispose it here
```

In `js/entities.js`, the bomber-escape path at line 730:

```javascript
    e.alive = false; scene.remove(e.group); if (e.marker) scene.remove(e.marker);
```

Change to:

```javascript
    e.alive = false; scene.remove(e.group); disposeGroup(e.group); if (e.marker) scene.remove(e.marker);
```

(`disposeGroup` is a global function from `combat.js`, which loads before `main.js`; `entities.js` load order — confirm `combat.js` is loaded before `entities.js` in `index.html`. If `entities.js` loads first, instead inline the same traverse there or move `disposeGroup` into `globals.js`/`engine.js` which load earliest. Verify in Step 5.)

- [ ] **Step 5: Verify load order, then test in browser**

Check `index.html` `<script>` order. `disposeGroup` must be defined in a file that loads **before** any caller. If `combat.js` loads after `entities.js`, move the `disposeGroup` definition into `js/engine.js` (loaded early) instead of `combat.js`. Confirm:

Run (or open DevTools console while playing): destroy many enemies across several waves and watch DevTools → Memory / Performance. JS heap and GPU memory should stay roughly flat across waves instead of climbing monotonically. Confirm no console error like `disposeGroup is not defined`, and that destroyed enemies render no visual artifacts (no other enemy losing its mesh — which would indicate an unexpected shared resource).

- [ ] **Step 6: Re-run the logic test**

Run: `node tests/dispose-group.test.js`
Expected: `ALL PASS`.

- [ ] **Step 7: Commit**

```bash
git add js/combat.js js/entities.js tests/dispose-group.test.js
git commit -m "perf: dispose enemy geometry/materials on death to stop GPU/heap leak

Enemy meshes were removed from the scene but never disposed, so each wave
leaked geometry buffers and materials, growing GC pressure over a session.
Add disposeGroup() and call it when an enemy group is removed. Textures are
intentionally left alone (shared/cached, e.g. drone glow sprite).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Reported bug — "game freezes when each wave is announced" → Task 1 (amortized spawning) directly removes the single-frame construction spike. ✓
- Root-cause secondary finding — no `dispose`, growing GC/GPU leak that worsens hitches over time → Task 2. ✓
- Wave-clear re-trigger race introduced by deferring spawns → guarded two ways (fighters-first ordering + `pendingSpawns.length === 0` check) and covered by `spawn-queue.test.js` Test 2. ✓

**Placeholder scan:** No TBD/“handle edge cases”/“similar to” — all code shown in full. ✓

**Type/name consistency:** `pendingSpawns` (array, `js/globals.js`), `SPAWN_PER_FRAME` (const), `processSpawnQueue(n)`, `disposeGroup(group)` — names used identically across `globals.js`/`main.js`/`combat.js` and both test files. `nextWave` keeps its exact existing call sites (`handleWaves`); `handleWaves` keeps its signature `(dt)` and call site (`js/main.js:581`). ✓

**Known limitation:** Total spawn CPU per wave is unchanged (we spread it, not reduce it). If a future profile shows the spread frames are still individually too heavy, the follow-up is the template-cache+clone refactor noted in the Architecture section (cache triangulated geometry per shape, re-link `userData` per clone). Out of scope here.
