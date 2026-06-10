# Plain Default Jet + Ace / Wingman / CCA Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a plain, ability-free `FT-1 STANDARD` airframe and re-cast NPC airframes — regular enemies and the initial wingman fly the plain jet, aces fly a randomized named real jet, CCAs get a unique plain airframe, and tech-tree wingmen are chosen via a picker popup.

**Architecture:** Two new parametric entries in the existing `SHAPES` table (`STD`, `CCAJET`) flow through the unchanged `buildJet` + geometry-cache path. A new playable `JETS[0]` entry with `ability:null`/`passive:null` requires guarding every ability/passive reader. Spawn logic is routed through small pure helpers (`wingShape`, `aceShapePool`, `jetNameForShape`, `hasSpecial`) so the behavior is unit-testable in the existing mirror-style node test harness.

**Tech Stack:** Vanilla JS, THREE.js (global script load order: globals → entities → ... → ui → main), plain `node tests/*.test.js` (no package manager; tests mirror production logic).

**Spec:** `docs/superpowers/specs/2026-06-10-plain-default-jet-design.md`

**Test convention:** Tests are standalone node scripts that *mirror* production logic (the game runs as browser globals, not importable modules). Run a test with `node tests/<name>.test.js`; PASS prints an `ok - ...` line and exits 0, FAIL throws an `assert` error and exits non-zero. New pure helpers must be written so the production copy and the test mirror are byte-identical.

---

### Task 1: Add `SHAPES.STD` and `SHAPES.CCAJET` geometry

Plain default airframe (single tail, no canard/LERX/twin-tail/sensor flags) and a small tailless CCA airframe. Both reuse `buildJet` unchanged; `buildJet` already tolerates missing `vtail`/`htail`/`canard` (NGAD/J50 are already tailless). The existing `Object.keys(SHAPES).forEach(k => SHAPES[k].id = k)` pass auto-assigns their cache ids.

**Files:**
- Modify: `js/entities.js` (the `const SHAPES = { ... };` block, just before the closing `};` at the `BOMBER` entry ~line 138–143)
- Test: `tests/plain-shapes.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/plain-shapes.test.js`:

```javascript
'use strict';
const assert = require('assert');
const fs = require('fs');

// Read the production SHAPES source and assert the two new plain airframes exist
// and are genuinely "plain" (no canard / no twin vertical tail / no sensor tricks).
const src = fs.readFileSync(__dirname + '/../js/entities.js', 'utf8');

function shapeBlock(name) {
  // grab from "NAME:" to the next top-level "}," that closes the entry
  const re = new RegExp('\\b' + name + ':\\s*\\{[\\s\\S]*?\\}\\s*,', 'm');
  const m = src.match(re);
  assert.ok(m, name + ' must be defined in SHAPES');
  return m[0];
}

const std = shapeBlock('STD');
assert.ok(/vtail:\s*\{\s*type:\s*'single'/.test(std), 'STD must use a single vertical tail');
assert.ok(!/canard:/.test(std), 'STD must have no canard');
assert.ok(/lerx:\s*false/.test(std), 'STD must have no LERX');

const cca = shapeBlock('CCAJET');
assert.ok(!/vtail:/.test(cca), 'CCAJET must be tailless (no vtail)');
assert.ok(!/canard:/.test(cca), 'CCAJET must have no canard');
assert.ok(!/htail:/.test(cca), 'CCAJET must have no horizontal tail');

console.log('ok - SHAPES.STD plain single-tail and SHAPES.CCAJET tailless are defined');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/plain-shapes.test.js`
Expected: FAIL — `AssertionError: STD must be defined in SHAPES`.

- [ ] **Step 3: Add the two shapes**

In `js/entities.js`, inside `const SHAPES = { ... }`, immediately **before** the `BOMBER:{ ... },` entry, insert:

```javascript
  STD:  { len:16, noseLen:6, frontR:1.4, rearR:1.15, flat:0.62,
          wing:[[1.3,-1],[8.5,3.2],[8.5,5.4],[1.6,6.8]], wingY:-0.2, wingThick:0.5,
          vtail:{type:'single', base:3.4, tip:1.2, h:3.8, sweep:1.7, z:4.6},
          lerx:false, engines:1, gap:0, intake:'side', wingspan:8.5 },
  CCAJET:{ len:11, noseLen:4.5, frontR:1.0, rearR:0.85, flat:0.6,
          wing:[[1.0,-1.5],[6.5,2.0],[6.5,3.6],[2.6,4.6],[1.2,4.8]], wingY:-0.1, wingThick:0.4,
          lerx:false, engines:1, gap:0, intake:'belly', wingspan:6.5 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/plain-shapes.test.js`
Expected: PASS — `ok - SHAPES.STD plain single-tail and SHAPES.CCAJET tailless are defined`.

- [ ] **Step 5: Commit**

```bash
git add js/entities.js tests/plain-shapes.test.js
git commit -m "feat: add plain STD and tailless CCAJET airframes to SHAPES"
```

---

### Task 2: `hasSpecial` helper + guard the special ability for ability-less jets

A jet with `ability:null` must not fire `useSpecial()` and must not crash/garble the HUD special readout. Introduce one pure helper used by both production and tests.

**Files:**
- Modify: `js/combat.js` (`useSpecial()` ~line 577; add helper just above it)
- Modify: `js/ui.js` (HUD special readout, lines 479–480)
- Test: `tests/has-special.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/has-special.test.js`:

```javascript
'use strict';
const assert = require('assert');

// mirror of js/combat.js hasSpecial
function hasSpecial(jet) { return !!(jet && jet.ability); }

assert.strictEqual(hasSpecial({ ability: 'OVERDRIVE' }), true, 'jet with ability has a special');
assert.strictEqual(hasSpecial({ ability: null }), false, 'ability:null jet has no special');
assert.strictEqual(hasSpecial({}), false, 'jet without ability key has no special');
assert.strictEqual(hasSpecial(null), false, 'null jet is safe');

console.log('ok - hasSpecial reflects presence of jet.ability');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/has-special.test.js`
Expected: PASS in isolation (the mirror is self-contained). This test locks the contract the production helper must match. Proceed to add the production copy.

- [ ] **Step 3: Add the production helper and guard `useSpecial`**

In `js/combat.js`, directly above `function useSpecial() {`, add:

```javascript
function hasSpecial(jet) { return !!(jet && jet.ability); }
```

Then change the top of `useSpecial()` from:

```javascript
function useSpecial() {
  if (player.special.cd > 0) { audio.ui(); return; }
```

to:

```javascript
function useSpecial() {
  if (!hasSpecial(player.jet)) { audio.ui(); return; }
  if (player.special.cd > 0) { audio.ui(); return; }
```

- [ ] **Step 4: Guard the HUD special readout**

In `js/ui.js`, replace lines 479–480:

```javascript
  if (player.special.cd <= 0) { el.special.textContent = player.jet.ability + ' ▸ READY'; el.special.classList.add('ready'); }
  else { el.special.textContent = player.jet.ability + ' ▸ ' + Math.ceil(player.special.cd) + 's'; el.special.classList.remove('ready'); }
```

with:

```javascript
  if (!hasSpecial(player.jet)) { el.special.textContent = 'NO SPECIAL'; el.special.classList.remove('ready'); }
  else if (player.special.cd <= 0) { el.special.textContent = player.jet.ability + ' ▸ READY'; el.special.classList.add('ready'); }
  else { el.special.textContent = player.jet.ability + ' ▸ ' + Math.ceil(player.special.cd) + 's'; el.special.classList.remove('ready'); }
```

- [ ] **Step 5: Run test + commit**

Run: `node tests/has-special.test.js`
Expected: PASS — `ok - hasSpecial reflects presence of jet.ability`.

```bash
git add js/combat.js js/ui.js tests/has-special.test.js
git commit -m "feat: guard special ability + HUD for ability-less jets via hasSpecial"
```

---

### Task 3: Add playable `FT-1 STANDARD` at `JETS[0]` + guard card/passives

The default jet: plain stats, `ability:null`, `passive:null`, placed first so it is the default hangar selection. Guard `renderJetCard` (which unconditionally reads `j.ability`/`j.abilityDesc`) and ensure `applyJetPassives` no-ops for it (its `switch (j.id)` already falls through with no default — verify and leave a comment).

**Files:**
- Modify: `js/globals.js` (`const JETS = [` opening, ~line 17 — insert new first element)
- Modify: `js/ui.js` (`renderJetCard`, lines ~678–698)
- Modify: `js/entities.js` (`applyJetPassives`, ~line 521 — add explicit FT-1 comment/case)
- Test: `tests/has-special.test.js` is extended (the roster contract)

- [ ] **Step 1: Write the failing test**

Append to `tests/has-special.test.js` (before the final `console.log`):

```javascript
// FT-1 STANDARD is the ability-less default jet
const fs = require('fs');
const gsrc = fs.readFileSync(__dirname + '/../js/globals.js', 'utf8');
const ft1 = gsrc.match(/\{[^{}]*id:'FT-1'[\s\S]*?\}/);
assert.ok(ft1, 'JETS must contain an FT-1 entry');
assert.ok(/ability:\s*null/.test(ft1[0]), 'FT-1 must have ability:null');
assert.ok(/passive:\s*null/.test(ft1[0]), 'FT-1 must have passive:null');
assert.ok(/shape:'STD'/.test(ft1[0]), 'FT-1 must use the STD airframe');
// FT-1 must be the first roster entry (default selection)
assert.ok(/const JETS = \[\s*\{[^{}]*id:'FT-1'/.test(gsrc.replace(/\n/g, ' ')), 'FT-1 must be JETS[0]');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/has-special.test.js`
Expected: FAIL — `AssertionError: JETS must contain an FT-1 entry`.

- [ ] **Step 3: Insert the FT-1 entry as `JETS[0]`**

In `js/globals.js`, change the array opening from:

```javascript
const JETS = [
  { id:'F-22', shape:'F22', name:'F-22 RAPTOR', role:'Air Superiority', topSpeed:'Mach 2.25', ceiling:'65,000 ft', cannon:'20mm M61A2', gen:'5th GEN',
```

to (insert the FT-1 block as the new first element):

```javascript
const JETS = [
  { id:'FT-1', shape:'STD', name:'FT-1 STANDARD', role:'Multirole Trainer', topSpeed:'Mach 1.4', ceiling:'48,000 ft', cannon:'20mm rotary', gen:'BASELINE',
    speed:6, agility:6, accel:6, armor:6, stealth:4, firepower:6, color:0x8a96a4, accent:0x5fb0d0,
    ability:null, abilityDesc:'', passive:null,
    desc:'A plain, dependable airframe — no tricks, no special. The baseline every pilot learns on.',
    context:'Generic trainer/multirole. A no-frills fourth-generation airframe with honest, middle-of-the-road handling and no signature weapon or party trick — the control against which the exotic jets in this hangar are measured.' },
  { id:'F-22', shape:'F22', name:'F-22 RAPTOR', role:'Air Superiority', topSpeed:'Mach 2.25', ceiling:'65,000 ft', cannon:'20mm M61A2', gen:'5th GEN',
```

- [ ] **Step 4: Guard `renderJetCard`**

In `js/ui.js`, the card builder reads `j.ability` in the tag chip (line ~681) and the special block (lines ~695–696). Replace this fragment:

```javascript
        '<div class="cbtags"><div class="cgen">' + (j.gen || '') + '</div><div class="cability">◈ ' + j.ability + '</div></div>' +
```

with:

```javascript
        '<div class="cbtags"><div class="cgen">' + (j.gen || '') + '</div><div class="cability">◈ ' + (j.ability || 'NO SPECIAL') + '</div></div>' +
```

And replace this fragment:

```javascript
        '<div class="cspeclbl">SPECIAL — ' + j.ability + '</div>' +
        '<div class="cabilitydesc">' + j.abilityDesc + '</div>' +
```

with:

```javascript
        (j.ability ? '<div class="cspeclbl">SPECIAL — ' + j.ability + '</div>' +
        '<div class="cabilitydesc">' + j.abilityDesc + '</div>' : '<div class="cspeclbl">NO SPECIAL ABILITY</div>') +
```

(The passive line already guards on `j.passive ? ... : ''`, so `passive:null` is safe.)

- [ ] **Step 5: Make `applyJetPassives` explicit for FT-1**

In `js/entities.js`, `function applyJetPassives(p, j) { switch (j.id) {` — the `switch` has no `default`, so an unknown id is already a no-op. Add an explicit no-op case for clarity, immediately after the `switch (j.id) {` line:

```javascript
    case 'FT-1': break;   // plain trainer — no passive identity
```

- [ ] **Step 6: Run test + manual check + commit**

Run: `node tests/has-special.test.js`
Expected: PASS — `ok - hasSpecial reflects presence of jet.ability`.

Manual: open `index.html`, hangar shows `FT-1 STANDARD` first with "NO SPECIAL ABILITY"; HUD in-flight shows `NO SPECIAL`; pressing R does nothing/no crash.

```bash
git add js/globals.js js/ui.js js/entities.js tests/has-special.test.js
git commit -m "feat: add playable FT-1 STANDARD default jet (no ability/passive)"
```

---

### Task 4: Regular enemies fly `STD`

**Files:**
- Modify: `js/entities.js` (`const FIGHTER_SHAPES = [...]`, ~line 562)
- Test: `tests/npc-airframes.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/npc-airframes.test.js`:

```javascript
'use strict';
const assert = require('assert');
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/entities.js', 'utf8');

const fp = src.match(/const FIGHTER_SHAPES\s*=\s*(\[[^\]]*\])/);
assert.ok(fp, 'FIGHTER_SHAPES must be defined');
const pool = JSON.parse(fp[1].replace(/'/g, '"'));
assert.deepStrictEqual(pool, ['STD'], 'regular fighters must all fly the plain STD airframe');

console.log('ok - regular enemy fighters use STD');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/npc-airframes.test.js`
Expected: FAIL — `regular fighters must all fly the plain STD airframe`.

- [ ] **Step 3: Change the pool**

In `js/entities.js`, replace:

```javascript
const FIGHTER_SHAPES = ['SU57', 'EFT', 'TEJAS', 'RAFALE', 'FA18', 'J50'];
```

with:

```javascript
const FIGHTER_SHAPES = ['STD'];   // regular fodder all fly the plain trainer; aces fly the named real jets
```

- [ ] **Step 4: Run test + commit**

Run: `node tests/npc-airframes.test.js`
Expected: PASS — `ok - regular enemy fighters use STD`.

```bash
git add js/entities.js tests/npc-airframes.test.js
git commit -m "feat: regular enemy fighters fly the plain STD airframe"
```

---

### Task 5: `wingShape` helper + route wingman/CCA spawn shapes (initial → STD, CCA → CCAJET)

Refactor `spawnWingman` to take an explicit shape and resolve it through a pure helper. Add a global `pendingWingShape` (used later by the tech-tree picker; defaults to `'STD'`). Route the initial-launch call and the CCA paths.

**Files:**
- Modify: `js/main.js` (`spawnWingman` ~line 210; `buildWingman` ~line 173; `spawnCCA` ~line 181; add `wingShape` helper)
- Modify: `js/globals.js` (add `let pendingWingShape = 'STD';` near the wingman globals, ~line 162)
- Modify: `js/ui.js` (initial launch call, line 759)
- Test: `tests/npc-airframes.test.js` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/npc-airframes.test.js` (before the final `console.log`):

```javascript
// mirror of js/main.js wingShape
function wingShape(temp, explicit) { return explicit || (temp ? 'CCAJET' : 'STD'); }
assert.strictEqual(wingShape(false), 'STD', 'default escort flies STD');
assert.strictEqual(wingShape(true), 'CCAJET', 'CCA flies CCAJET');
assert.strictEqual(wingShape(false, 'F22'), 'F22', 'explicit shape is honored');
assert.strictEqual(wingShape(true, 'F47'), 'F47', 'explicit overrides even for temp');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/npc-airframes.test.js`
Expected: PASS for the mirror (self-contained), but it now also locks the production contract. (If you prefer a true RED, temporarily assert `wingShape(false) === 'XXX'`, watch it fail, then restore.) Proceed to wire production.

- [ ] **Step 3: Add `pendingWingShape` global**

In `js/globals.js`, just below `const MAX_WINGMEN = 6;` (line 162), add:

```javascript
let pendingWingShape = 'STD';   // airframe the next tech-tree wingman will fly (set by the picker)
```

- [ ] **Step 4: Add `wingShape` and refactor `spawnWingman`**

In `js/main.js`, directly above `function spawnWingman(temp) {`, add:

```javascript
function wingShape(temp, explicit) { return explicit || (temp ? 'CCAJET' : 'STD'); }
```

Change the signature and shape line of `spawnWingman` from:

```javascript
function spawnWingman(temp) {
  if (!player) return;
  const side = wingmen.length % 2 === 0 ? 1 : -1;
  const wShape = temp ? CCA_POOL[(Math.random() * CCA_POOL.length) | 0] : WINGMAN_POOL[(Math.random() * WINGMAN_POOL.length) | 0];
```

to:

```javascript
function spawnWingman(temp, explicit) {
  if (!player) return;
  const side = wingmen.length % 2 === 0 ? 1 : -1;
  const wShape = wingShape(temp, explicit);
```

The wingman's displayed name uses `jetName: wShape`; replace it (in the `wingmen.push({ ... })` object) so escorts show the real jet name:

Change:

```javascript
    shape: wShape, jetName: wShape, flares: 3, sprintT: 0, priorityCd: 0, flareCd: 0,
```

to:

```javascript
    shape: wShape, jetName: jetNameForShape(wShape), flares: 3, sprintT: 0, priorityCd: 0, flareCd: 0,
```

(`jetNameForShape` is added in Task 7. Until then it is undefined; do Task 7 before running the game, or temporarily keep `jetName: wShape`. To keep tasks independently runnable, **temporarily** leave `jetName: wShape` here and switch to `jetNameForShape(wShape)` at the end of Task 7.)

- [ ] **Step 5: Route the initial-launch call**

In `js/ui.js` line 759, change:

```javascript
  if (startWingman) spawnWingman();   // optional loyal escort (toggle in Settings)
```

to:

```javascript
  if (startWingman) spawnWingman(false, 'STD');   // initial escort flies the plain trainer
```

- [ ] **Step 6: Point `spawnCCA` at `CCAJET`**

In `js/main.js`, in `spawnCCA`, change:

```javascript
  const ccaShape = CCA_POOL[(Math.random() * CCA_POOL.length) | 0];
  const mesh = buildJet(0x0d9cd4, 0x00ffee, SHAPES[ccaShape]);   // vivid electric-blue body, cyan accent
```

to:

```javascript
  const ccaShape = 'CCAJET';
  const mesh = buildJet(0x0d9cd4, 0x00ffee, SHAPES[ccaShape]);   // vivid electric-blue body, cyan accent
```

- [ ] **Step 7: Remove dead pools**

In `js/main.js`, delete the now-unused lines:

```javascript
const WINGMAN_POOL = ['F22', 'EFT', 'RAFALE', 'FA18'];
const CCA_POOL = ['F47', 'NGAD', 'J50'];
```

(Grep first: `grep -rn "WINGMAN_POOL\|CCA_POOL" js/` — confirm no other references remain before deleting.)

- [ ] **Step 8: Run test + commit**

Run: `node tests/npc-airframes.test.js`
Expected: PASS — `ok - regular enemy fighters use STD`.

```bash
git add js/main.js js/globals.js js/ui.js tests/npc-airframes.test.js
git commit -m "feat: route wingman/CCA spawn shapes via wingShape (initial STD, CCA CCAJET)"
```

---

### Task 6: Aces fly a randomized named real jet + `ACE · <name>` label

Add two pure helpers: `aceShapePool()` (all roster shapes except `STD`) and `jetNameForShape(shape)` (roster name for a shape, fallback to the raw shape key). `spawnAce` uses the pool and stores `e.aceName`; the HUD nameplate appends it.

**Files:**
- Modify: `js/entities.js` (add `aceShapePool` + `jetNameForShape` near `FIGHTER_SHAPES`/`ACE_SHAPES`, ~line 562)
- Modify: `js/main.js` (`spawnAce`, ~line 22)
- Modify: `js/ui.js` (ace nameplate, line 340)
- Modify: `js/main.js` (finish the deferred `jetNameForShape(wShape)` from Task 5 Step 4)
- Test: `tests/ace-pool.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/ace-pool.test.js`:

```javascript
'use strict';
const assert = require('assert');

// mirror of js/entities.js aceShapePool + jetNameForShape, fed a stub roster
const JETS = [
  { id:'FT-1', shape:'STD',  name:'FT-1 STANDARD' },
  { id:'F-22', shape:'F22',  name:'F-22 RAPTOR' },
  { id:'SU-57', shape:'SU57', name:'SU-57 FELON' },
];
function aceShapePool() { return JETS.filter(j => j.shape !== 'STD').map(j => j.shape); }
function jetNameForShape(shape) { const j = JETS.find(x => x.shape === shape); return j ? j.name : shape; }

const pool = aceShapePool();
assert.ok(!pool.includes('STD'), 'ace pool must exclude the plain STD airframe');
assert.deepStrictEqual(pool, ['F22', 'SU57'], 'ace pool is every real roster shape');
assert.strictEqual(jetNameForShape('F22'), 'F-22 RAPTOR', 'shape resolves to roster name');
assert.strictEqual(jetNameForShape('CCAJET'), 'CCAJET', 'unknown shape falls back to its key');

console.log('ok - aceShapePool excludes STD and jetNameForShape maps shapes to names');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/ace-pool.test.js`
Expected: PASS for the self-contained mirror — it locks the contract. Proceed to add production copies that match exactly.

- [ ] **Step 3: Add production helpers**

In `js/entities.js`, just below the `const ACE_SHAPES = [...]` line (~line 563), add:

```javascript
function aceShapePool() { return JETS.filter(j => j.shape !== 'STD').map(j => j.shape); }
function jetNameForShape(shape) { const j = JETS.find(x => x.shape === shape); return j ? j.name : shape; }
```

- [ ] **Step 4: Use the pool + store the ace name in `spawnAce`**

In `js/main.js`, in `spawnAce`, change:

```javascript
  const e = createEnemy('fighter', new THREE.Vector3(px, py, pz), { shapePool: ACE_SHAPES });
  e.elite = true;
  e.callsign = genCallsign('ACE');
```

to:

```javascript
  const e = createEnemy('fighter', new THREE.Vector3(px, py, pz), { shapePool: aceShapePool() });
  e.elite = true;
  e.aceName = jetNameForShape(e.shapeKey);
  e.callsign = genCallsign('ACE');
```

(`createEnemy` already sets `e.shapeKey` to the chosen shape — verified at `js/entities.js` ~line 593.)

- [ ] **Step 5: Append the jet name to the ace nameplate**

In `js/ui.js` line 340, change:

```javascript
    else if (e.elite) { ctx.fillStyle = 'rgba(255,210,77,1)'; ctx.font = 'bold 12px ' + HUDFONT; ctx.fillText('★ ' + (e.callsign || 'ACE'), x, by - 8); }
```

to:

```javascript
    else if (e.elite) { ctx.fillStyle = 'rgba(255,210,77,1)'; ctx.font = 'bold 12px ' + HUDFONT; ctx.fillText('★ ' + (e.callsign || 'ACE') + (e.aceName ? ' · ' + e.aceName : ''), x, by - 8); }
```

- [ ] **Step 6: Finish the deferred wingman name from Task 5**

In `js/main.js`, in the `spawnWingman` `wingmen.push({ ... })` object, ensure the line reads (switch it now if you left it as `jetName: wShape`):

```javascript
    shape: wShape, jetName: jetNameForShape(wShape), flares: 3, sprintT: 0, priorityCd: 0, flareCd: 0,
```

- [ ] **Step 7: Run test + manual + commit**

Run: `node tests/ace-pool.test.js`
Expected: PASS — `ok - aceShapePool excludes STD and jetNameForShape maps shapes to names`.

Manual: in-flight, an `★ ACE INBOUND` enemy shows a recognizable airframe and a nameplate like `★ ACE-07 · F-22 RAPTOR`.

```bash
git add js/entities.js js/main.js js/ui.js tests/ace-pool.test.js
git commit -m "feat: aces fly a randomized named real jet labeled ACE-xx | jet name"
```

---

### Task 7: Tech-tree wingman jet picker popup

Buying `WING COMMANDER` (`w1`), `SQUADRON` (`w2`), or `RESERVE SQUADRON` (`reserve`) opens a modal listing every roster jet (incl. FT-1). Picking one spends the RP and spawns that airframe; cancel spends nothing. The node `apply` closures spawn `spawnWingman(false, pendingWingShape)`, and the picker sets `pendingWingShape` before committing.

**Files:**
- Modify: `js/globals.js` (the three wingman node `apply` closures, lines 232/233/238)
- Modify: `index.html` (add `#wingpick` modal after the `#upgrade` block, ~line 153)
- Modify: `styles.css` (modal styles)
- Modify: `js/ui.js` (`buyNode` ~line 611 — split into router + `commitNode`, add picker fns)
- Test: `tests/wing-picker.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/wing-picker.test.js`:

```javascript
'use strict';
const assert = require('assert');

// mirror of the buyNode routing decision in js/ui.js
const WING_NODES = new Set(['w1', 'w2', 'reserve']);
function routesToPicker(nodeId) { return WING_NODES.has(nodeId); }

assert.strictEqual(routesToPicker('w1'), true, 'WING COMMANDER opens the picker');
assert.strictEqual(routesToPicker('w2'), true, 'SQUADRON opens the picker');
assert.strictEqual(routesToPicker('reserve'), true, 'RESERVE SQUADRON opens the picker');
assert.strictEqual(routesToPicker('e1'), false, 'non-wing nodes buy immediately');
assert.strictEqual(routesToPicker('core'), false, 'core never routes to picker');

console.log('ok - only wingman nodes route through the jet picker');
```

- [ ] **Step 2: Run test to verify it passes (contract lock)**

Run: `node tests/wing-picker.test.js`
Expected: PASS — self-contained mirror locking the routing set. Proceed to production.

- [ ] **Step 3: Point the node closures at `pendingWingShape`**

In `js/globals.js`, change the three closures. Line 232 (`w1`):

```javascript
apply:()=>{ if (permWingmen() < MAX_WINGMEN) spawnWingman(); buffFlight(60); } },
```
→
```javascript
apply:()=>{ if (permWingmen() < MAX_WINGMEN) spawnWingman(false, pendingWingShape); buffFlight(60); } },
```

Line 233 (`w2`):

```javascript
apply:()=>{ if (permWingmen() < MAX_WINGMEN) spawnWingman(); buffFlight(80); } },
```
→
```javascript
apply:()=>{ if (permWingmen() < MAX_WINGMEN) spawnWingman(false, pendingWingShape); buffFlight(80); } },
```

Line 238 (`reserve`):

```javascript
    apply:()=>{ if (permWingmen() < MAX_WINGMEN) spawnWingman(); buffFlight(55); } },
```
→
```javascript
    apply:()=>{ if (permWingmen() < MAX_WINGMEN) spawnWingman(false, pendingWingShape); buffFlight(55); } },
```

- [ ] **Step 4: Add the picker modal markup**

In `index.html`, immediately **after** the closing `</div>` of the `#upgrade` block (the line before `<div id="manual">`, ~line 154), insert:

```html
<div id="wingpick">
  <div class="wp-box">
    <div class="wp-title">SELECT WINGMAN AIRFRAME</div>
    <div class="wp-sub">// CHOOSE THE JET YOUR NEW ESCORT WILL FLY //</div>
    <div id="wpGrid" class="wp-grid"></div>
    <button id="wpCancel">CANCEL</button>
  </div>
</div>
```

- [ ] **Step 5: Add modal styles**

In `styles.css`, append:

```css
#wingpick{position:absolute;inset:0;z-index:70;display:none;background:rgba(2,6,10,.86);backdrop-filter:blur(5px)}
#wingpick.show{display:flex;align-items:center;justify-content:center}
#wingpick .wp-box{width:min(720px,92vw);max-height:84vh;overflow:auto;border:1px solid rgba(91,138,134,.4);background:linear-gradient(160deg,rgba(10,22,30,.96),rgba(4,9,14,.97));padding:22px 24px}
#wingpick .wp-title{font-family:var(--disp);font-weight:800;letter-spacing:5px;color:#eafffb;font-size:20px;text-align:center}
#wingpick .wp-sub{font-family:var(--mono);text-align:center;color:var(--cy);letter-spacing:2px;font-size:10px;margin:6px 0 16px;opacity:.8}
#wingpick .wp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
#wingpick .wp-jet{cursor:pointer;border:1px solid rgba(91,138,134,.35);background:rgba(8,18,26,.7);padding:10px 12px;font-family:var(--mono)}
#wingpick .wp-jet:hover{border-color:var(--cy);background:rgba(16,40,52,.8)}
#wingpick .wp-jet .wp-name{color:#eafffb;font-size:12px;letter-spacing:1px}
#wingpick .wp-jet .wp-role{color:var(--cy);font-size:9px;opacity:.75;margin-top:3px}
#wingpick #wpCancel{display:block;margin:18px auto 0;font-family:var(--mono);letter-spacing:2px;background:transparent;color:var(--cy);border:1px solid rgba(91,138,134,.5);padding:8px 22px;cursor:pointer}
#wingpick #wpCancel:hover{border-color:var(--cy);color:#eafffb}
```

(`var(--disp)`, `var(--mono)`, `var(--cy)` are existing CSS variables — confirm with `grep -n "\-\-cy\|\-\-mono\|\-\-disp" styles.css`.)

- [ ] **Step 6: Split `buyNode` and add picker functions**

In `js/ui.js`, replace the whole `buyNode` function (lines 611–621):

```javascript
function buyNode(node) {
  if (!choosingUpgrade || !player || !node) return;
  if (nodeState(node) !== 'avail') { audio.ui(); return; }
  const cost = nodeCost(node);
  player.tp -= cost;
  node.apply(player);
  if (node.repeat) { player.techRepeat[node.id] = repeatCount(node) + 1; }
  else { player.tech.push(node.id); player.upgrades.push(node.id); }
  audio.power(); empFlash = 0.26;
  showBanner('◈ ' + node.name + ' RESEARCHED ◈');
  techTab === 'armory' ? renderArmory() : renderTechTree(false);
}
```

with:

```javascript
const WING_NODES = new Set(['w1', 'w2', 'reserve']);
let pendingWingNode = null;

function buyNode(node) {
  if (!choosingUpgrade || !player || !node) return;
  if (nodeState(node) !== 'avail') { audio.ui(); return; }
  if (WING_NODES.has(node.id)) { openWingPicker(node); return; }
  commitNode(node);
}

function commitNode(node) {
  const cost = nodeCost(node);
  player.tp -= cost;
  node.apply(player);
  if (node.repeat) { player.techRepeat[node.id] = repeatCount(node) + 1; }
  else { player.tech.push(node.id); player.upgrades.push(node.id); }
  audio.power(); empFlash = 0.26;
  showBanner('◈ ' + node.name + ' RESEARCHED ◈');
  techTab === 'armory' ? renderArmory() : renderTechTree(false);
}

function openWingPicker(node) {
  pendingWingNode = node;
  const grid = g('wpGrid');
  grid.innerHTML = JETS.map((j, i) =>
    '<div class="wp-jet" data-i="' + i + '"><div class="wp-name">' + j.name + '</div><div class="wp-role">' + j.role + '</div></div>'
  ).join('');
  grid.querySelectorAll('.wp-jet').forEach(el =>
    el.addEventListener('click', () => confirmWingPick(+el.getAttribute('data-i'))));
  g('wingpick').classList.add('show');
  audio.ui();
}

function confirmWingPick(i) {
  const node = pendingWingNode;
  closeWingPicker();
  if (!node) return;
  pendingWingShape = JETS[i].shape;
  commitNode(node);
}

function closeWingPicker() {
  pendingWingNode = null;
  g('wingpick').classList.remove('show');
}
```

- [ ] **Step 7: Wire the cancel button**

In `js/ui.js`, in `buildHangar()` (where other one-time DOM listeners are wired, near `g('jetPrev').addEventListener(...)`, ~line 760+), add:

```javascript
  g('wpCancel').addEventListener('click', () => { closeWingPicker(); audio.ui(); });
```

- [ ] **Step 8: Run test + manual + commit**

Run: `node tests/wing-picker.test.js`
Expected: PASS — `ok - only wingman nodes route through the jet picker`.

Manual: open tech tree (between waves), click WING COMMANDER → picker appears → pick a jet → RP is spent, escort spawns flying that jet, sidebar shows its name. Click WING COMMANDER → CANCEL → no RP spent, node still available. Buy RESERVE SQUADRON repeatedly with different jets.

```bash
git add js/globals.js index.html styles.css js/ui.js tests/wing-picker.test.js
git commit -m "feat: tech-tree wingman jet picker popup"
```

---

### Task 8: Full regression run

- [ ] **Step 1: Run every test**

Run:
```bash
for t in tests/*.test.js; do echo "== $t =="; node "$t" || exit 1; done
```
Expected: every file prints its `ok - ...` line; loop exits 0.

- [ ] **Step 2: Manual smoke test in the browser**

Open `index.html` and verify, in order:
1. Hangar opens on `FT-1 STANDARD` (plain grey jet, "NO SPECIAL ABILITY").
2. Cycle to a real jet — its ability text returns; cycle back to FT-1 — no crash, "NO SPECIAL".
3. Start a sortie: initial wingman is a plain teal STD jet; pressing R as FT-1 does nothing.
4. Early waves: regular enemies are all the plain red STD airframe.
5. An ACE spawns flying a recognizable jet, nameplate `★ ACE-xx · <JET NAME>`.
6. F-47 SWARM (if playing F-47) launches blue CCAs of the new tailless CCAJET airframe.
7. Tech tree: buy WING COMMANDER → picker → choose a jet → escort flies it; CANCEL spends nothing.

- [ ] **Step 3: Final commit (if any manual-fix touch-ups were needed)**

```bash
git add -A
git commit -m "test: full regression pass for plain default jet rework"
```

---

## Self-Review notes

- **Spec coverage:** F1 default jet → Tasks 1,3; F2 regular enemies + initial wingman → Tasks 4,5; F3 aces randomized + labeled → Task 6; F4 CCA unique design → Tasks 1,5; F5 wingman picker → Task 7. Null-ability risk → Tasks 2,3.
- **Type consistency:** `wingShape(temp, explicit)`, `aceShapePool()`, `jetNameForShape(shape)`, `hasSpecial(jet)`, `pendingWingShape` (globals.js), `pendingWingNode`/`WING_NODES`/`commitNode`/`openWingPicker`/`confirmWingPick`/`closeWingPicker` (ui.js) — names used identically across tasks. `spawnWingman(temp, explicit)` signature consistent across globals.js closures, ui.js launch, and main.js CCA.
- **Deferred dependency:** `jetNameForShape` is referenced in Task 5 Step 4 but defined in Task 6 Step 3 — Task 5 explicitly keeps `jetName: wShape` until Task 6 Step 6 switches it. Run Tasks 5 and 6 in order.
