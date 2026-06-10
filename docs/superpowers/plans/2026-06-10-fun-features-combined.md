# Fun Features Combined Plan — Rival Ace → Ground War → Operation Map

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three flagship features, executed strictly in order: (1) a persistent Nemesis Rival Ace, (2) an expanded toggle-able Ground War, (3) an FTL-style Operation Map mode. All three integrate with the existing wave loop; features 2 and 3 each gate on toggles.

**Specs:**
- Feature 1: `docs/superpowers/specs/2026-06-10-nemesis-rival-ace-design.md` (full spec)
- Features 2 & 3: design locked in the preambles inside this document (no separate spec).

**Tech Stack:** Vanilla JS + THREE.js, global script load order: `globals → entities → rival (new) → combat → engine? (verify actual order in index.html before adding the tag) → ui → main`. No package manager.

**Test convention:** Tests are standalone node scripts that *mirror* production logic (the game runs as browser globals, not importable modules). Run with `node tests/<name>.test.js`; PASS prints `ok - ...` and exits 0, FAIL throws. Pure helpers must be byte-identical between production and test mirror.

**Execution rules for the implementing agent:**
1. Execute Parts in order: Part 1 (R1–R7) → Part 2 (G1–G6) → Part 3 (M1–M6). Do not interleave.
2. One commit per task, message given in the task.
3. After each Part, run the full suite: `for t in tests/*.test.js; do echo "== $t =="; node "$t" || exit 1; done` and `for f in js/*.js; do node --check "$f" || exit 1; done`.
4. Line numbers are approximate (file drifts as you edit). The **quoted code is exact** as of commit `bad5c9d` — locate by content, not by line.
5. Where the plan says "grep first", run the grep and adapt to what you find before editing.

---

# PART 1 — NEMESIS RIVAL ACE (Tasks R1–R7)

A single named rival persists across waves and runs (`localStorage.skystrike_rival`). He escapes below 20% HP, levels up (cap 5), gains counter-traits against your habits, and uses a mirrored special. Killing him pays `150 + 100×level` RP and records him on a hangar kill board. Settings toggle `rivalEnabled`, ON by default.

### Task R1: `js/rival.js` — state, persistence, pure helpers

**Files:**
- Create: `js/rival.js`
- Modify: `index.html` (script tag)
- Test: `tests/rival.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/rival.test.js`:

```javascript
'use strict';
const assert = require('assert');

// ---- mirrors of js/rival.js pure helpers (must stay byte-identical) ----
function rivalDue(wave, lastRivalWave, enabled) {
  return !!enabled && wave >= 5 && wave % 4 !== 0 && (wave - (lastRivalWave || 0)) >= 3;
}
function rivalHpFor(wave, level) { return Math.round((170 + wave * 9) * Math.pow(1.3, level - 1)); }
function rivalPayout(level) { return 150 + 100 * level; }
function pickTrait(profile, owned) {
  const p = profile || {};
  const cand = [];
  if ((p.missiles || 0) >= (p.gunKills || 0) && (p.missiles || 0) > 0) cand.push('FLARE_WALL');
  if ((p.gunKills || 0) > (p.missiles || 0)) cand.push('SCISSORS');
  if ((p.wingmen || 0) >= 2) cand.push('HEADHUNTER');
  cand.push('VETERAN');
  for (let i = 0; i < cand.length; i++) if (owned.indexOf(cand[i]) === -1) return cand[i];
  return null;
}
function validRival(r) {
  return !!(r && typeof r.name === 'string' && typeof r.shape === 'string' &&
    typeof r.jetName === 'string' && typeof r.level === 'number' && r.level >= 1 && r.level <= 5 &&
    Array.isArray(r.traits) && Array.isArray(r.board) && r.profile && typeof r.profile === 'object');
}

// cadence
assert.strictEqual(rivalDue(5, 0, true), true, 'first rival at wave 5');
assert.strictEqual(rivalDue(4, 0, true), false, 'not before wave 5');
assert.strictEqual(rivalDue(8, 5, true), false, 'wave 8 is a boss wave');
assert.strictEqual(rivalDue(9, 5, true), true, 'wave 9: 4 waves after last, not boss');
assert.strictEqual(rivalDue(7, 5, true), false, 'only 2 waves since last appearance');
assert.strictEqual(rivalDue(9, 5, false), false, 'toggle off kills the cadence');

// escalation + payout
assert.strictEqual(rivalHpFor(5, 1), 215, 'level 1 = ace baseline at wave 5');
assert.strictEqual(rivalHpFor(5, 3), Math.round(215 * 1.69), 'level 3 = x1.3^2');
assert.strictEqual(rivalPayout(1), 250); assert.strictEqual(rivalPayout(5), 650);

// traits
assert.strictEqual(pickTrait({missiles: 9, gunKills: 1, wingmen: 0}, []), 'FLARE_WALL');
assert.strictEqual(pickTrait({missiles: 1, gunKills: 9, wingmen: 0}, []), 'SCISSORS');
assert.strictEqual(pickTrait({missiles: 0, gunKills: 0, wingmen: 3}, []), 'HEADHUNTER');
assert.strictEqual(pickTrait({missiles: 0, gunKills: 0, wingmen: 0}, []), 'VETERAN');
assert.strictEqual(pickTrait({missiles: 9, gunKills: 1, wingmen: 0}, ['FLARE_WALL']), 'VETERAN', 'skips owned, falls back');
assert.strictEqual(pickTrait({missiles: 9, gunKills: 0, wingmen: 2}, ['FLARE_WALL']), 'HEADHUNTER', 'next candidate');

// persistence shape
const fresh = { name: 'VULTURE', shape: 'SU57', jetName: 'SU-57 FELON', level: 1, traits: [], profile: {missiles:0,gunKills:0,flares:0,wingmen:0}, encounters: 0, board: [] };
assert.ok(validRival(fresh), 'fresh rival validates');
assert.ok(validRival(JSON.parse(JSON.stringify(fresh))), 'round-trips');
assert.ok(!validRival(null) && !validRival({}) && !validRival({name:'X'}), 'garbage rejected');
const lvl9 = JSON.parse(JSON.stringify(fresh)); lvl9.level = 9;
assert.ok(!validRival(lvl9), 'level out of range rejected');

console.log('ok - rival cadence, escalation, traits, persistence validate');
```

- [ ] **Step 2: Run it** — `node tests/rival.test.js`. PASS (self-contained mirror; locks the contract).

- [ ] **Step 3: Create `js/rival.js`**

```javascript
/* SKYSTRIKE — rival.js: persistent nemesis rival ace. State, persistence, traits.
   Loaded after entities.js (needs aceShapePool/jetNameForShape) and before ui/main. */

const RIVAL_NAMES = ['VULTURE', 'HAVOC', 'WIDOWMAKER', 'CERBERUS', 'MANTIS', 'JACKAL', 'BARON', 'WRAITH', 'KESTREL', 'OMEN'];
const RIVAL_KEY = 'skystrike_rival';
let rival = null;            // persistent rival identity (loaded at boot)

function rivalDue(wave, lastRivalWave, enabled) {
  return !!enabled && wave >= 5 && wave % 4 !== 0 && (wave - (lastRivalWave || 0)) >= 3;
}
function rivalHpFor(wave, level) { return Math.round((170 + wave * 9) * Math.pow(1.3, level - 1)); }
function rivalPayout(level) { return 150 + 100 * level; }
function pickTrait(profile, owned) {
  const p = profile || {};
  const cand = [];
  if ((p.missiles || 0) >= (p.gunKills || 0) && (p.missiles || 0) > 0) cand.push('FLARE_WALL');
  if ((p.gunKills || 0) > (p.missiles || 0)) cand.push('SCISSORS');
  if ((p.wingmen || 0) >= 2) cand.push('HEADHUNTER');
  cand.push('VETERAN');
  for (let i = 0; i < cand.length; i++) if (owned.indexOf(cand[i]) === -1) return cand[i];
  return null;
}
function validRival(r) {
  return !!(r && typeof r.name === 'string' && typeof r.shape === 'string' &&
    typeof r.jetName === 'string' && typeof r.level === 'number' && r.level >= 1 && r.level <= 5 &&
    Array.isArray(r.traits) && Array.isArray(r.board) && r.profile && typeof r.profile === 'object');
}
function genRival(board) {
  const pool = aceShapePool();
  const shape = pool[(Math.random() * pool.length) | 0];
  return {
    name: RIVAL_NAMES[(Math.random() * RIVAL_NAMES.length) | 0],
    shape: shape, jetName: jetNameForShape(shape),
    level: 1, traits: [], profile: { missiles: 0, gunKills: 0, flares: 0, wingmen: 0 },
    encounters: 0, board: board || []
  };
}
function loadRival() {
  try {
    const r = JSON.parse(localStorage.getItem(RIVAL_KEY) || 'null');
    rival = validRival(r) ? r : genRival(r && Array.isArray(r.board) ? r.board : []);
  } catch (e) { rival = genRival([]); }
}
function saveRival() { try { localStorage.setItem(RIVAL_KEY, JSON.stringify(rival)); } catch (e) {} }
function rivalEscaped(profile) {
  rival.level = Math.min(5, rival.level + 1);
  rival.encounters++;
  rival.profile = profile;
  if (rival.traits.length < 3) { const t = pickTrait(profile, rival.traits); if (t) rival.traits.push(t); }
  saveRival();
}
function rivalDefeated(atWave) {
  rival.board.push({ name: rival.name, jetName: rival.jetName, level: rival.level, wave: atWave });
  if (rival.board.length > 10) rival.board.shift();
  const pay = rivalPayout(rival.level);
  rival = genRival(rival.board);
  saveRival();
  return pay;
}
```

The four pure helpers (`rivalDue`, `rivalHpFor`, `rivalPayout`, `pickTrait`, `validRival`) must be **byte-identical** to the test mirrors in Step 1.

- [ ] **Step 4: Add the script tag**

In `index.html`, find the script block at the bottom (grep `entities.js`). Insert immediately **after** the entities.js tag:

```html
<script src="js/rival.js"></script>
```

- [ ] **Step 5: Call `loadRival()` at boot**

Grep `loadSettings()` call site in `js/main.js` (the boot sequence near the bottom). Insert `loadRival();` directly after the `loadSettings();` line.

- [ ] **Step 6: Verify + commit**

`node tests/rival.test.js` and `node --check js/rival.js`.

```bash
git add js/rival.js index.html js/main.js tests/rival.test.js
git commit -m "feat(rival): rival state, persistence, cadence/trait/escalation helpers"
```

---

### Task R2: `rivalEnabled` settings toggle (ON by default)

**Files:**
- Modify: `js/globals.js`, `js/ui.js`, `index.html`

- [ ] **Step 1: Global**

In `js/globals.js`, grep `let startWingman`. Add below it:

```javascript
let rivalEnabled = true;     // nemesis rival ace appearances (Settings toggle)
```

- [ ] **Step 2: Settings row (HTML)**

In `index.html`, after the exact line:

```html
        <div class="srow"><label for="setWingman">Launch with a starting wingman</label><input id="setWingman" type="checkbox"></div>
```

add:

```html
        <div class="srow"><label for="setRival">Nemesis rival ace (persistent named enemy)</label><input id="setRival" type="checkbox"></div>
```

- [ ] **Step 3: Wire listener**

In `js/ui.js`, find the existing wiring (exact code):

```javascript
  const sw = g('setWingman'); if (sw) { sw.checked = startWingman; sw.addEventListener('change', () => { startWingman = sw.checked; if (audio.on) audio.ui(); saveSettings(); }); }
```

Add directly below, same pattern:

```javascript
  const srv = g('setRival'); if (srv) { srv.checked = rivalEnabled; srv.addEventListener('change', () => { rivalEnabled = srv.checked; if (audio.on) audio.ui(); saveSettings(); }); }
```

- [ ] **Step 4: Persist**

In `js/ui.js` `loadSettings()`, after the `startWingman` line add:

```javascript
    if (typeof s.rivalEnabled === 'boolean') rivalEnabled = s.rivalEnabled;
```

In `saveSettings()`, extend the object literal: add `rivalEnabled` to the field list:

```javascript
      volume, muted, invertY, autoLock, startWingman, gunLead, difficulty, timeOfDay, selectedJet, rivalEnabled
```

- [ ] **Step 5: Verify + commit**

`node --check js/ui.js js/globals.js` (run separately per file).

```bash
git add js/globals.js js/ui.js index.html
git commit -m "feat(rival): rivalEnabled settings toggle, on by default"
```

---

### Task R3: habit counters on `run`

**Files:**
- Modify: `js/globals.js`, `js/combat.js`

- [ ] **Step 1: Extend `run`**

In `js/globals.js`, replace the exact line:

```javascript
let run = { shots: 0, hits: 0, missiles: 0, kills: 0, ground: 0, boss: 0, t0: 0, escortKills: 0 };
```

with:

```javascript
let run = { shots: 0, hits: 0, missiles: 0, kills: 0, ground: 0, boss: 0, t0: 0, escortKills: 0, pMissiles: 0, pGunKills: 0, pFlares: 0, lastRivalWave: 0 };
```

**Important:** grep for where `run` is reset between sorties (`grep -n "run = {\|run.shots = 0\|run\.kills = 0" js/*.js`). If a reset re-assigns a fresh object literal, mirror the new fields there too. If it resets field-by-field, add the four new fields to that reset.

- [ ] **Step 2: Count player missiles**

In `js/combat.js` `fireMissile()` (~line 69): find the point where the missile is actually spawned (after ammo/cooldown early-returns; grep the function body first). Add `run.pMissiles++;` there.

- [ ] **Step 3: Count player flares**

In `js/combat.js` find the exact line:

```javascript
  player.flareCd = 0.45; player.flares--;
```

Add `run.pFlares++;` directly after it.

- [ ] **Step 4: Count player gun kills**

`damageEnemy(e, amt, wp, byPlayer, byCCA)` knows the weapon; `killEnemy` does not. First learn the `wp` tokens: `grep -n "damageEnemy(" js/*.js` and note what callers pass for the cannon (likely `'gun'` or `'bullet'`).

In `damageEnemy`, after its opening line, add (substituting the real gun token you found):

```javascript
  if (byPlayer) e._lastPlayerWp = wp;
```

In `killEnemy`, after the `if (byPlayer) player.tp += ...` line, add (again substituting the real token):

```javascript
  if (byPlayer && e._lastPlayerWp === 'gun') run.pGunKills++;
```

- [ ] **Step 5: Verify + commit**

```bash
node --check js/globals.js && node --check js/combat.js
git add js/globals.js js/combat.js
git commit -m "feat(rival): per-run habit counters (missiles, gun kills, flares)"
```

---

### Task R4: `spawnRival` + wave hook

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Add `spawnRival`**

In `js/main.js`, directly below the existing `spawnAce()` function (quoted in full below so you can locate it — ends with the `showBanner('★ ACE INBOUND ★')` line), add:

```javascript
function spawnRival() {
  const ang = rand(0, TWO_PI), r = rand(2800, 4400);
  const px = player.group.position.x + Math.cos(ang) * r, pz = player.group.position.z + Math.sin(ang) * r;
  const py = clamp(player.group.position.y + rand(-300, 600), terrainH(px, pz) + 450, 4300);
  const e = createEnemy('fighter', new THREE.Vector3(px, py, pz), { shapePool: [rival.shape] });
  e.elite = true; e.rival = true;
  e.aceName = rival.jetName;
  e.callsign = rival.name;
  e.desprintUsed = false; e.sprintTimer = 0;
  e.hp = e.maxHp = rivalHpFor(wave, rival.level);
  e.turnRate = 1.55; e.gunRunCd = rand(1.2, 2.5);
  e.bulletAmmo = 120; e.missileAmmo = 3; e.flareAmmo = 2;
  e.rivalSpCd = 6;            // first special after 6s, then every 12s
  e.fleeing = false;
  // traits
  if (rival.traits.indexOf('FLARE_WALL') !== -1) { e.flareAmmo = 4; e.flareWall = true; }
  if (rival.traits.indexOf('SCISSORS') !== -1) { e.turnRate *= 1.25; }
  if (rival.traits.indexOf('HEADHUNTER') !== -1) { e.headhunter = true; }
  if (rival.traits.indexOf('VETERAN') !== -1) { e.hp = e.maxHp = Math.round(e.maxHp * 1.2); e.turnRate *= 1.1; }
  if (e.group.userData.body) { e.group.userData.body.color.setHex(0xff5a2a); e.group.userData.body.emissive = new THREE.Color(0x551100); e.group.userData.body.emissiveIntensity = 1.0; }
  const eng = e.group.userData.engines || [];
  for (let i = 0; i < eng.length; i++) { eng[i].glow.material.color.setHex(0xff5a2a); eng[i].flame.material.color.setHex(0xff7a3a); }
  e.marker.material.color.setHex(0xff5a2a);
  showBanner('☠ RIVAL ON STATION — ' + rival.name + ' · Lv' + rival.level + ' ☠');
}
```

- [ ] **Step 2: Hook `nextWave`**

Current `nextWave()` (exact, for location):

```javascript
function nextWave() {
  wave++;
  player._cheatUsed = false;   // APEX PREDATOR's save refreshes every wave
  const count = clamp(3 + wave + DIFFS[difficulty].count, 2, 10);
  for (let i = 0; i < count; i++) pendingSpawns.push(spawnFighter);   // fighters first → first drained = combat enemy
  if (wave % 4 === 0) { pendingSpawns.push(spawnBoss); showBanner('⚠ BOSS INCOMING ⚠'); }
  else showBanner('WAVE ' + wave);
  if (wave >= 3 && wave % 4 !== 0 && Math.random() < (0.45 + difficulty * 0.12)) pendingSpawns.push(spawnAce);
```

Add directly after the `spawnAce` line:

```javascript
  if (rivalDue(wave, run.lastRivalWave, rivalEnabled)) { run.lastRivalWave = wave; pendingSpawns.push(spawnRival); }
```

- [ ] **Step 3: Verify + commit**

```bash
node --check js/main.js
git add js/main.js
git commit -m "feat(rival): spawnRival with trait application + nextWave cadence hook"
```

---

### Task R5: flee state machine + defeat/escape resolution

**Files:**
- Modify: `js/entities.js` (updateEnemy), `js/combat.js` (killEnemy)

- [ ] **Step 1: Flee trigger + helper**

In `js/entities.js` `updateEnemy`, locate the exact elite-sprint line:

```javascript
  if (e.elite && !e.desprintUsed && e.hp / e.maxHp < 0.3) { e.desprintUsed = true; e.sprintTimer = 2.5; e.orbitSign *= -1; }
```

Add directly after it:

```javascript
  if (e.rival && !e.fleeing && e.hp / e.maxHp < 0.2) { e.fleeing = true; e.sprintTimer = 9; showBanner('☠ ' + e.callsign + ' IS BREAKING OFF ☠'); }
  if (e.rival && e.fleeing) { if (updateRivalFlee(e, dt)) return; }
```

Then add this function directly **above** `function updateEnemy(e, dt) {`:

```javascript
/* Rival escape run: burn straight away from the player, flare against locks, vanish past 5000u.
   Returns true when the rival despawned (caller must stop processing the enemy this frame). */
function updateRivalFlee(e, dt) {
  const away = t1.copy(e.group.position).sub(player.group.position);
  const dist = away.length();
  away.multiplyScalar(1 / Math.max(dist, 0.001)); away.y = Math.max(away.y, 0.05); away.normalize();
  dirToQuat(away, q1);
  e.logicQuat.rotateTowards(q1, e.turnRate * 1.4 * dt);
  const nf = fwdQ(e.logicQuat, t4);
  e.group.quaternion.copy(e.logicQuat);
  e.speed = lerp(e.speed, 360, dt * 2);
  e.vel.copy(nf).multiplyScalar(e.speed);
  e.group.position.addScaledVector(e.vel, dt);
  e.flareCd -= dt;
  if (e.flareCd <= 0 && e.flareAmmo > 0) {
    for (let i = 0; i < missiles.length; i++) { const m = missiles[i]; if (!m.enemy && m.target === e) { enemyFlares(e); e.flareCd = 1.6; break; } }
  }
  updateMarker(e);
  if (dist > 5000) {
    e.alive = false;
    scene.remove(e.group); disposeGroup(e.group);
    if (e.marker) scene.remove(e.marker);
    if (player.lockedTarget === e) player.lockedTarget = null;
    if (player.lockTarget === e) { player.lockTarget = null; player.lockProgress = 0; }
    rivalEscaped({ missiles: run.pMissiles, gunKills: run.pGunKills, flares: run.pFlares, wingmen: wingmen.length });
    showBanner('☠ ' + e.callsign + ' WITHDRAWS — HE WILL RETURN STRONGER ☠');
    return true;
  }
  return false;
}
```

**Wave-clear note:** the despawned rival has `e.alive = false`, so the `handleWaves` check (`enemies.some(e => e.alive && ...)`) treats him exactly like a kill — no wave-stall. The dead entry is purged by the existing dead-enemy sweep in the main loop (grep `enemies.splice` to confirm it keys on `!e.alive`; if it keys on something else, adapt).

- [ ] **Step 2: HEADHUNTER targeting**

Still in `updateEnemy`: the engage branch steers at `player.group.position` throughout. Full retargeting is invasive — implement the cheap version: HEADHUNTER deals bonus damage to wingmen instead of preferring them. Grep where enemy bullets damage wingmen (`grep -n "wingm" js/combat.js | head -20`, look for a damage application to `w.hp`). At that site, multiply by 1.5 when the shooter is flagged: if the bullet/missile carries an owner reference with `.headhunter`, apply `* 1.5`. If owner attribution does not exist in the bullet object, **skip this step** and note it in the commit message — do not plumb new ownership fields for a flavor trait.

- [ ] **Step 3: Defeat payout in `killEnemy`**

In `js/combat.js` `killEnemy`, after the exact line:

```javascript
  if (e.type === 'boss') { run.boss++; showBanner('◆ BOSS DESTROYED ◆'); empFlash = 0.5; }
```

add:

```javascript
  if (e.rival) { const pay = rivalDefeated(wave); player.tp += pay; showBanner('☠ RIVAL DOWN — +' + pay + ' RP ☠'); }
```

- [ ] **Step 4: Verify + commit**

```bash
node --check js/entities.js && node --check js/combat.js
git add js/entities.js js/combat.js
git commit -m "feat(rival): flee state machine, escape resolution, defeat payout"
```

---

### Task R6: mirrored special (4 archetypes)

**Files:**
- Modify: `js/rival.js` (archetype map), `js/entities.js` (firing logic)
- Test: `tests/rival.test.js` (extend)

- [ ] **Step 1: Extend the test**

Append to `tests/rival.test.js` before the final `console.log`:

```javascript
// mirror of js/rival.js rivalSpecialFor
function rivalSpecialFor(shape) {
  if (shape === 'J20' || shape === 'J35') return 'VOLLEY';
  if (shape === 'NGAD' || shape === 'F47') return 'FLARESTORM';
  if (shape === 'J50' || shape === 'SU57' || shape === 'SU75') return 'GHOST';
  return 'OVERDRIVE';
}
assert.strictEqual(rivalSpecialFor('J20'), 'VOLLEY');
assert.strictEqual(rivalSpecialFor('F47'), 'FLARESTORM');
assert.strictEqual(rivalSpecialFor('SU57'), 'GHOST');
assert.strictEqual(rivalSpecialFor('F22'), 'OVERDRIVE');
assert.strictEqual(rivalSpecialFor('WHATEVER'), 'OVERDRIVE', 'unknown shapes default safely');
```

Run — fails only if mirror and production drift; proceed.

- [ ] **Step 2: Production map in `js/rival.js`**

Append (byte-identical to mirror):

```javascript
function rivalSpecialFor(shape) {
  if (shape === 'J20' || shape === 'J35') return 'VOLLEY';
  if (shape === 'NGAD' || shape === 'F47') return 'FLARESTORM';
  if (shape === 'J50' || shape === 'SU57' || shape === 'SU75') return 'GHOST';
  return 'OVERDRIVE';
}
```

First `grep -n "shape:'" js/globals.js` and check the real roster shape keys; if `J35`/`SU75` don't exist, keep the lines anyway (harmless) — the default branch covers everything.

- [ ] **Step 3: Firing logic in `updateEnemy`**

In `js/entities.js`, in the rival block added in R5 (after the flee lines), add:

```javascript
  if (e.rival && !e.fleeing) {
    e.rivalSpCd -= dt;
    if (e.rivalSpCd <= 0) { e.rivalSpCd = 12; fireRivalSpecial(e); }
  }
```

Then add above `updateRivalFlee`:

```javascript
function fireRivalSpecial(e) {
  const kind = rivalSpecialFor(e.shapeKey);
  if (e.group.userData.body) { e.group.userData.body.emissiveIntensity = 2.2; setTimeout(() => { if (e.group.userData.body) e.group.userData.body.emissiveIntensity = 1.0; }, 500); }
  audio.power();
  if (kind === 'OVERDRIVE') { e.sprintTimer = 4; }
  else if (kind === 'VOLLEY') { e._volley = 3; e._volleyT = 0; }
  else if (kind === 'FLARESTORM') { enemyFlares(e); enemyFlares(e); enemyFlares(e); }
  else if (kind === 'GHOST') {
    e._ghostT = 3;
    if (player.lockedTarget === e) player.lockedTarget = null;
    if (player.lockTarget === e) { player.lockTarget = null; player.lockProgress = 0; }
  }
}
```

VOLLEY drain — in the same rival block in `updateEnemy`, extend to:

```javascript
  if (e.rival && !e.fleeing) {
    e.rivalSpCd -= dt;
    if (e.rivalSpCd <= 0) { e.rivalSpCd = 12; fireRivalSpecial(e); }
    if (e._volley > 0) {
      e._volleyT -= dt;
      if (e._volleyT <= 0 && e.missileAmmo > 0) {
        const dir = t1.copy(player.group.position).sub(e.group.position).normalize();
        spawnMissile(t2.copy(e.group.position), dir, null, true, 1);
        e._volley--; e._volleyT = 0.3; audio.missile();
      }
    }
    if (e._ghostT > 0) { e._ghostT -= dt; if (e.marker) e.marker.visible = e._ghostT <= 0; }
    else if (e.marker && !e.marker.visible) e.marker.visible = true;
  }
```

(Check `spawnMissile`'s signature first: `grep -n "function spawnMissile" js/combat.js` — the ground SAM calls it as `spawnMissile(pos, dir, null, true, 1)`, mirror that usage exactly.)

GHOST + lock re-acquisition: grep the lock-acquisition loop (`grep -n "lockTarget" js/main.js | head`) and add a `if (e._ghostT > 0) continue;`-style skip so ghosted rivals can't be re-locked for the duration. If the loop structure makes this awkward, marker-hiding alone is acceptable — note the cut in the commit.

- [ ] **Step 4: Verify + commit**

```bash
node tests/rival.test.js && node --check js/rival.js && node --check js/entities.js
git add js/rival.js js/entities.js tests/rival.test.js
git commit -m "feat(rival): mirrored specials (OVERDRIVE, VOLLEY, FLARESTORM, GHOST)"
```

---

### Task R7: nameplate, kill board, regression

**Files:**
- Modify: `js/ui.js`, `index.html`, `styles.css`

- [ ] **Step 1: Nameplate**

In `js/ui.js`, the elite nameplate (exact current code):

```javascript
    else if (e.elite) { ctx.fillStyle = 'rgba(255,210,77,1)'; ctx.font = 'bold 12px ' + HUDFONT; ctx.fillText('★ ' + (e.callsign || 'ACE') + (e.aceName ? ' · ' + e.aceName : ''), x, by - 8); }
```

Insert a rival case **before** it (so it wins):

```javascript
    else if (e.rival) { ctx.fillStyle = 'rgba(255,90,42,1)'; ctx.font = 'bold 12px ' + HUDFONT; ctx.fillText('☠ ' + e.callsign + ' · ' + e.aceName + ' · Lv' + rival.level, x, by - 8); }
```

(Note: the chain starts with some `if` above these — keep `else if` ordering: rival before elite.)

- [ ] **Step 2: Kill board HTML**

In `index.html`, after the `#jetNav` close (locate `<div id="jetDots"></div>` and its enclosing div), add:

```html
    <div id="rivalBoard"><div class="rb-title">RIVAL KILL BOARD</div><div id="rbList"></div></div>
```

- [ ] **Step 3: Kill board CSS**

Append to `styles.css`:

```css
#rivalBoard{margin:14px auto 0;max-width:520px;border:1px solid rgba(91,138,134,.3);padding:8px 14px;font-family:var(--mono)}
#rivalBoard .rb-title{color:#ff5a2a;font-size:10px;letter-spacing:3px;text-align:center}
#rivalBoard .rb-row{color:#9fb8c8;font-size:10px;letter-spacing:1px;display:flex;justify-content:space-between;margin-top:4px}
#rivalBoard .rb-empty{color:#5b8a86;font-size:10px;text-align:center;margin-top:4px;opacity:.7}
```

- [ ] **Step 4: Render function + hooks**

In `js/ui.js`, add near `buildHangar`:

```javascript
function renderKillBoard() {
  const list = g('rbList'); if (!list || !rival) return;
  list.innerHTML = rival.board.length
    ? rival.board.slice().reverse().map(b => '<div class="rb-row"><span>☠ ' + b.name + '</span><span>' + b.jetName + '</span><span>Lv' + b.level + ' · W' + b.wave + '</span></div>').join('')
    : '<div class="rb-empty">NO RIVALS DOWNED</div>';
}
```

Call `renderKillBoard();` at the end of `buildHangar()` and inside `returnToHangar()` (grep both; in `returnToHangar` place it next to where the hangar div is shown).

- [ ] **Step 5: Full Part-1 regression + manual smoke + commit**

```bash
for t in tests/*.test.js; do echo "== $t =="; node "$t" || exit 1; done
for f in js/*.js; do node --check "$f" || exit 1; done
```

Manual (browser): settings shows rival toggle ON; by wave 5–7 a red-orange `☠` rival appears with banner; damaging him below 20% triggers breakaway + WITHDRAWS banner; 3+ waves later he returns Lv2; killing him pays RP and the hangar kill board lists him.

```bash
git add js/ui.js index.html styles.css
git commit -m "feat(rival): rival nameplate, hangar kill board, banners"
```

---

# PART 2 — GROUND WAR, TOGGLE-ABLE (Tasks G1–G6)

## Design preamble (locked decisions)

**Current state:** ground units already exist — `spawnGround()` (1–2 per wave from wave 2), `createEnemy('ground')` = static SAM turret (`buildGround`, hp 75, 4 missiles, fires within 3200u via `updateGround`). Ground/bomber don't block wave-clear (`handleWaves` excludes them). `TP.ground = 28`, `run.ground` counts kills.

**Locked:**
1. **Master toggle `groundWar`, ON by default**, settings row + persisted, same pattern as `rivalEnabled`. OFF ⇒ zero ground spawns (including the existing wave-2 SAM line), no strike waves, ground-war tech hidden and **bypassed in req chains**.
2. **New ground kinds** (same `type:'ground'`, new `e.gkind` field): `sam` (existing turret), `aaa` (flak battery: timed proximity bursts, no missiles), `radar` (unarmed; while any radar alive, SAM range 3200→4800 and reload 30% faster), `truck` (convoy: 3 moving trucks, unarmed, bonus RP).
3. **Strike waves:** wave ≥ 5 and `wave % 5 === 0`, skipped on boss waves (`wave % 4 === 0` wins, e.g. wave 20). Composition: 1 radar + 2 SAM + 2 AAA + 1 convoy (3 trucks) + 3 fighters. During a strike wave ground units **do** block wave-clear. Banner `⚒ STRIKE WAVE — FLATTEN THE SITE ⚒`.
4. **Armory "STRIKE" branch** (3 nodes, all flagged `ground:true`, `tab:'armory'`, `fam:'strike'`): `agm1` AGM RAILS (+75% player missile damage vs ground), `rkt1` ROCKET PODS (+100% player cannon damage vs ground), `bel1` BELLY ARMOR (−35% damage taken from ground-launched missiles). Nodes chain `agm1 → rkt1 → bel1`.
5. **Req bypass rule:** a node whose `req` points at a hidden ground node resolves its requirement through the ground node's own `req` (transitively). Pure helper `reqSatisfied`, unit-tested. (The strike branch is a leaf branch today, so this is defensive — but it is the user's explicit requirement, so it ships.)
6. Rival cadence unchanged on strike waves **except** rival skips them (`rivalDue` call site gains `&& !strike`).

### Task G1: `groundWar` toggle + spawn gating

**Files:**
- Modify: `js/globals.js`, `js/ui.js`, `index.html`, `js/main.js`
- Test: `tests/ground-war.test.js` (create)

- [ ] **Step 1: Failing test**

Create `tests/ground-war.test.js`:

```javascript
'use strict';
const assert = require('assert');

// ---- mirrors of js/main.js ground-war pure helpers ----
function groundSpawnsAllowed(wave, on) { return !!on && wave >= 2; }
function isStrikeWave(wave, on) { return !!on && wave >= 5 && wave % 5 === 0 && wave % 4 !== 0; }

assert.strictEqual(groundSpawnsAllowed(1, true), false, 'no ground before wave 2');
assert.strictEqual(groundSpawnsAllowed(2, true), true);
assert.strictEqual(groundSpawnsAllowed(9, false), false, 'toggle off = never');

assert.strictEqual(isStrikeWave(5, true), true, 'first strike at wave 5');
assert.strictEqual(isStrikeWave(10, true), true);
assert.strictEqual(isStrikeWave(20, true), false, 'boss wave wins over strike');
assert.strictEqual(isStrikeWave(15, true), true);
assert.strictEqual(isStrikeWave(7, true), false);
assert.strictEqual(isStrikeWave(10, false), false, 'toggle off = no strike waves');

console.log('ok - ground spawn gating and strike cadence');
```

Run: PASS (mirror lock).

- [ ] **Step 2: Global + settings row + listener + persistence**

Exactly mirror Task R2's four edits, with: global `let groundWar = true;` (comment: `// ground units + strike waves (Settings toggle)`), HTML row label `Ground war (SAM/AAA sites, strike waves)` id `setGroundWar`, listener const `sgw`, settings field `groundWar` in both `loadSettings` and `saveSettings`.

- [ ] **Step 3: Production helpers + gate `nextWave`**

In `js/main.js` above `nextWave`, add (byte-identical to mirrors):

```javascript
function groundSpawnsAllowed(wave, on) { return !!on && wave >= 2; }
function isStrikeWave(wave, on) { return !!on && wave >= 5 && wave % 5 === 0 && wave % 4 !== 0; }
```

In `nextWave`, replace the exact line:

```javascript
  if (wave >= 2) { const ng = randInt(1, 2); for (let k = 0; k < ng; k++) pendingSpawns.push(spawnGround); }
```

with:

```javascript
  if (groundSpawnsAllowed(wave, groundWar)) { const ng = randInt(1, 2); for (let k = 0; k < ng; k++) pendingSpawns.push(spawnGround); }
```

- [ ] **Step 4: Verify + commit**

```bash
node tests/ground-war.test.js && node --check js/main.js && node --check js/ui.js && node --check js/globals.js
git add js/globals.js js/ui.js index.html js/main.js tests/ground-war.test.js
git commit -m "feat(ground): groundWar toggle gating all ground spawns"
```

---

### Task G2: tech-tree ground flag + req bypass

**Files:**
- Modify: `js/ui.js` (nodeState + render filters), `js/globals.js` (no nodes yet — branch lands in G5)
- Test: `tests/ground-war.test.js` (extend)

- [ ] **Step 1: Extend test**

Append before the final `console.log`:

```javascript
// mirror of js/ui.js reqSatisfied — walks req chains, skipping ground nodes when ground war is off
function reqSatisfied(node, ownsFn, byId, groundOn) {
  let req = node.req;
  while (req) {
    const rn = byId[req];
    if (!groundOn && rn && rn.ground) { req = rn.req; continue; }   // bypass hidden ground nodes
    return ownsFn(req);
  }
  return true;
}
const byId = {
  core: { id: 'core' },
  agm1: { id: 'agm1', req: 'core', ground: true },
  rkt1: { id: 'rkt1', req: 'agm1', ground: true },
  xyz:  { id: 'xyz',  req: 'rkt1' },              // hypothetical non-ground node chained on ground
};
const owns = id => id === 'core';
assert.strictEqual(reqSatisfied(byId.agm1, owns, byId, true), true, 'ground on: agm1 needs only core');
assert.strictEqual(reqSatisfied(byId.rkt1, owns, byId, true), false, 'ground on: rkt1 needs agm1');
assert.strictEqual(reqSatisfied(byId.xyz, owns, byId, false), true, 'ground off: xyz bypasses rkt1+agm1 down to core');
assert.strictEqual(reqSatisfied(byId.xyz, () => false, byId, false), false, 'bypass still requires the surviving req');
```

- [ ] **Step 2: Production `reqSatisfied` + `nodeState` integration**

In `js/ui.js`, current `nodeState` (exact):

```javascript
function nodeState(node) {
  if (!node.repeat && owns(node.id)) return 'bought';
  if (node.ok && !node.ok(player)) return 'na';
  if (node.req && !owns(node.req)) return 'locked';
  return player.tp >= nodeCost(node) ? 'avail' : 'cantafford';
}
```

Replace with:

```javascript
function reqSatisfied(node, ownsFn, byId, groundOn) {
  let req = node.req;
  while (req) {
    const rn = byId[req];
    if (!groundOn && rn && rn.ground) { req = rn.req; continue; }   // bypass hidden ground nodes
    return ownsFn(req);
  }
  return true;
}
let NODE_BY_ID = null;
function nodeById(id) {
  if (!NODE_BY_ID) { NODE_BY_ID = {}; TECH_TREE.forEach(n => NODE_BY_ID[n.id] = n); }
  return NODE_BY_ID;
}
function nodeState(node) {
  if (node.ground && !groundWar) return 'hidden';
  if (!node.repeat && owns(node.id)) return 'bought';
  if (node.ok && !node.ok(player)) return 'na';
  if (!reqSatisfied(node, owns, nodeById(), groundWar)) return 'locked';
  return player.tp >= nodeCost(node) ? 'avail' : 'cantafford';
}
```

(`reqSatisfied` byte-identical to the mirror. Grep the actual tech-tree array name first — `grep -n "TECH_TREE" js/globals.js js/ui.js` — and use the real name in `nodeById`.)

- [ ] **Step 3: Render filters**

In `renderTechTree` and `renderArmory` (ui.js), find where nodes are iterated for display (grep `nodeState(` inside each). Skip hidden nodes: at the top of each per-node loop body add `if (nodeState(node) === 'hidden') return;` (or `continue;` matching the loop construct). Also guard `buyNode`: in its early-return line, extend to treat `'hidden'` like unavailable — the existing `if (nodeState(node) !== 'avail')` check already covers this; verify and leave as is.

- [ ] **Step 4: Verify + commit**

```bash
node tests/ground-war.test.js && node --check js/ui.js
git add js/ui.js tests/ground-war.test.js
git commit -m "feat(ground): ground-flagged tech hidden + req chains bypass when ground war off"
```

---

### Task G3: new ground kinds — AAA, radar, convoy trucks

**Files:**
- Modify: `js/entities.js` (builders + createEnemy + updateGround), `js/main.js` (spawn helpers)

- [ ] **Step 1: Builders**

In `js/entities.js`, directly after `buildGround()` (quoted earlier; ends `return g; }`), add:

```javascript
function buildAAA() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 11, 5, 8), new THREE.MeshStandardMaterial({ color: 0x3c4434, flatShading: true, roughness: 1 }));
  base.position.y = 2.5; g.add(base);
  const barrels = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 13), new THREE.MeshStandardMaterial({ color: 0x55603f, emissive: 0x1a2008, flatShading: true }));
  barrels.position.set(0, 7, -2); barrels.rotation.x = -0.5; g.add(barrels);
  g.userData.turret = barrels;
  return g;
}
function buildRadar() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 10), new THREE.MeshStandardMaterial({ color: 0x4a5258, flatShading: true, roughness: 1 }));
  base.position.y = 4; g.add(base);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 7, 3, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a98a0, emissive: 0x0a2a30, flatShading: true, side: THREE.DoubleSide }));
  dish.position.y = 11; dish.rotation.z = Math.PI / 3; g.add(dish);
  g.userData.dish = dish;
  return g;
}
function buildTruck() {
  const g = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(5, 3.5, 11), new THREE.MeshStandardMaterial({ color: 0x5a4a30, flatShading: true, roughness: 1 }));
  bed.position.y = 2.6; g.add(bed);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 3.5), new THREE.MeshStandardMaterial({ color: 0x6a5a3a, flatShading: true }));
  cab.position.set(0, 4.6, -4.6); g.add(cab);
  return g;
}
```

- [ ] **Step 2: `createEnemy` routing**

In `js/entities.js` `createEnemy`, the ground branch (exact):

```javascript
  else if (type === 'ground') { mesh = buildGround(); hp = 75; }
```

Replace with:

```javascript
  else if (type === 'ground') {
    const gk = (opts && opts.gkind) || 'sam';
    mesh = gk === 'aaa' ? buildAAA() : gk === 'radar' ? buildRadar() : gk === 'truck' ? buildTruck() : buildGround();
    hp = gk === 'radar' ? 110 : gk === 'truck' ? 45 : gk === 'aaa' ? 90 : 75;
  }
```

After the enemy object is assembled (grep where `e.type = type` or the object literal closes and `e` exists), set `e.gkind = (type === 'ground' && opts && opts.gkind) || (type === 'ground' ? 'sam' : null);`. Also: the ammo line for ground (exact):

```javascript
  else if (type === 'ground') { e.bulletAmmo = 0;   e.missileAmmo = 4;  e.flareAmmo = 0;  }
```

Replace with:

```javascript
  else if (type === 'ground') { e.bulletAmmo = 0; e.missileAmmo = (!opts || !opts.gkind || opts.gkind === 'sam') ? 4 : 0; e.flareAmmo = 0; }
```

- [ ] **Step 3: `updateGround` per-kind behavior**

Current `updateGround` (exact, replace wholesale):

```javascript
function updateGround(e, dt) {
  if (e.group.userData.turret) e.group.lookAt(player.group.position);
  const d = e.group.position.distanceTo(player.group.position);
  e.missileCd -= dt;
  if (d < 3200 && !player.stealth && player.empBurst <= 0 && player.jammer <= 0 && e.missileCd <= 0 && e.missileAmmo > 0 && activeEnemyMissiles() < 5) {
    const dir = t1.copy(player.group.position).sub(e.group.position).normalize(); dir.y = Math.max(dir.y, 0.35); dir.normalize();
    spawnMissile(t2.copy(e.group.position).setY(e.group.position.y + 9), dir, null, true, 1);
    e.missileAmmo--; e.missileCd = rand(5, 9); audio.missile();
  }
  if (e.hitFlash > 0) { e.hitFlash -= dt; e.group.scale.setScalar(e.baseScale * (1 + (e.hitFlash > 0 ? 0.1 : 0))); }
  updateMarker(e);
}
```

with:

```javascript
function radarUp() { for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.alive && e.type === 'ground' && e.gkind === 'radar') return true; } return false; }
function updateGround(e, dt) {
  if (e.group.userData.turret) e.group.lookAt(player.group.position);
  const d = e.group.position.distanceTo(player.group.position);
  if (e.gkind === 'radar') {
    if (e.group.userData.dish) e.group.userData.dish.rotation.y += dt * 1.2;
  } else if (e.gkind === 'truck') {
    if (!e.truckDir) { e.truckDir = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize(); }
    e.group.position.addScaledVector(e.truckDir, dt * 28);
    e.group.position.y = terrainH(e.group.position.x, e.group.position.z);
  } else if (e.gkind === 'aaa') {
    e.missileCd -= dt;          // reused as the flak timer
    if (d < 1500 && player.group.position.y - e.group.position.y < 1100 && e.missileCd <= 0) {
      e.missileCd = rand(1.1, 1.8);
      flakBurst(e);
    }
  } else {   // 'sam' — original behavior, radar-boosted when a radar station is alive
    const boosted = radarUp();
    const range = boosted ? 4800 : 3200;
    e.missileCd -= dt;
    if (d < range && !player.stealth && player.empBurst <= 0 && player.jammer <= 0 && e.missileCd <= 0 && e.missileAmmo > 0 && activeEnemyMissiles() < 5) {
      const dir = t1.copy(player.group.position).sub(e.group.position).normalize(); dir.y = Math.max(dir.y, 0.35); dir.normalize();
      spawnMissile(t2.copy(e.group.position).setY(e.group.position.y + 9), dir, null, true, 1);
      e.missileAmmo--; e.missileCd = rand(5, 9) * (boosted ? 0.7 : 1); audio.missile();
    }
  }
  if (e.hitFlash > 0) { e.hitFlash -= dt; e.group.scale.setScalar(e.baseScale * (1 + (e.hitFlash > 0 ? 0.1 : 0))); }
  updateMarker(e);
}
function flakBurst(e) {
  // burst at a point near the player's predicted position; proximity damage, no homing
  const aim = t1.copy(player.group.position).addScaledVector(player.vel, rand(0.4, 0.9));
  aim.x += rand(-90, 90); aim.y += rand(-70, 70); aim.z += rand(-90, 90);
  explode(aim, false);
  const d2 = aim.distanceToSquared(player.group.position);
  if (d2 < 120 * 120) damagePlayer(rand(5, 9) * (1 - Math.sqrt(d2) / 120), 'flak');
}
```

**Before committing:** `grep -n "function damagePlayer\|function explode" js/combat.js js/engine.js` — confirm both exist and check `damagePlayer`'s real signature; adapt the call (some codebases take `(amt)` only — if so, drop `'flak'`).

- [ ] **Step 4: Verify + commit**

```bash
node --check js/entities.js
git add js/entities.js
git commit -m "feat(ground): AAA flak, radar station (SAM boost), convoy trucks"
```

---

### Task G4: strike waves

**Files:**
- Modify: `js/main.js` (nextWave, handleWaves, spawn helpers, rival call site)

- [ ] **Step 1: Spawn helpers**

In `js/main.js`, below `spawnGround`, add:

```javascript
function spawnGroundKind(gkind) {
  const ang = rand(0, TWO_PI), r = rand(1400, 3000);
  const px = player.group.position.x + Math.cos(ang) * r, pz = player.group.position.z + Math.sin(ang) * r;
  createEnemy('ground', new THREE.Vector3(px, terrainH(px, pz), pz), { gkind: gkind });
}
```

- [ ] **Step 2: Strike composition in `nextWave`**

`nextWave` currently opens with the fighter count + boss/ace/bomber/drone/ground pushes (quoted in R4/G1). Restructure: right after `wave++;` and the `_cheatUsed` line, add:

```javascript
  const strike = isStrikeWave(wave, groundWar);
  strikeWaveActive = strike;
```

Add the global in `js/globals.js` near `let betweenWaves` (grep it): `let strikeWaveActive = false;`.

Then wrap the normal composition: if `strike`, push the strike package **instead of** the standard one:

```javascript
  if (strike) {
    showBanner('⚒ STRIKE WAVE — FLATTEN THE SITE ⚒');
    pendingSpawns.push(() => spawnGroundKind('radar'));
    pendingSpawns.push(() => spawnGroundKind('sam'));
    pendingSpawns.push(() => spawnGroundKind('sam'));
    pendingSpawns.push(() => spawnGroundKind('aaa'));
    pendingSpawns.push(() => spawnGroundKind('aaa'));
    for (let k = 0; k < 3; k++) pendingSpawns.push(() => spawnGroundKind('truck'));
    for (let i = 0; i < 3; i++) pendingSpawns.push(spawnFighter);
    return;
  }
```

Place this **after** the banner/boss logic decision: cleanest is to compute `strike` first, and on strike waves skip the entire standard block with the early `return` above (fighters/boss/ace/bomber/drone/ground lines all skipped). Keep `wave++`/`_cheatUsed` above it. Note the standard `showBanner('WAVE ' + wave)` must not also fire — the early return handles that.

**Order caution:** `pendingSpawns` drains FIFO and the first drained entry must be a combat enemy for the wave-clear guard — but on strike waves ground units COUNT as combat (next step), so radar-first is fine.

- [ ] **Step 3: Wave-clear includes ground on strike waves**

In `handleWaves` (exact current line):

```javascript
  const aliveCombat = enemies.some(e => e.alive && e.type !== 'ground' && e.type !== 'bomber');
```

replace with:

```javascript
  const aliveCombat = enemies.some(e => e.alive && (strikeWaveActive ? e.type !== 'bomber' && e.gkind !== 'truck' : e.type !== 'ground' && e.type !== 'bomber'));
```

(Trucks stay optional loot targets even on strike waves; radar/SAM/AAA must die to clear.)

- [ ] **Step 4: Rival skips strike waves**

The R4 hook line becomes:

```javascript
  if (!strike && rivalDue(wave, run.lastRivalWave, rivalEnabled)) { run.lastRivalWave = wave; pendingSpawns.push(spawnRival); }
```

(With the early `return` in Step 2 this is already guaranteed — apply the guard anyway for clarity if the line sits above the return; otherwise note it's structurally unreachable on strike waves.)

- [ ] **Step 5: Verify + commit**

```bash
node tests/ground-war.test.js && node --check js/main.js && node --check js/globals.js
git add js/main.js js/globals.js
git commit -m "feat(ground): strike waves every 5th wave with ground-clear objective"
```

---

### Task G5: armory STRIKE branch + damage hooks

**Files:**
- Modify: `js/globals.js` (TECH_TREE nodes), `js/combat.js` (damage multipliers)

- [ ] **Step 1: Find the armory node block**

`grep -n "tab:'armory'" js/globals.js` — note coordinates (`x`,`y`) of existing armory nodes and pick a free column (e.g. one column right of the rightmost armory node; read neighbors and choose non-colliding x/y).

- [ ] **Step 2: Add the three nodes**

Append to the TECH_TREE array (adjust `x` per Step 1; `req:'core'` assumed as branch root — grep how other armory branch roots declare `req` and copy that convention):

```javascript
  { id:'agm1', x:12, y:2, req:'core', fam:'strike', tab:'armory', ground:true, cost:260, sym:'▼', name:'AGM RAILS',
    desc:'Air-to-ground missile rails — +75% missile damage against ground targets.',
    apply:p=>{ p.agmMul = 1.75; } },
  { id:'rkt1', x:12, y:3, req:'agm1', fam:'strike', tab:'armory', ground:true, cost:300, sym:'▼', name:'ROCKET PODS',
    desc:'Cannon fire fragments against soft ground targets — +100% gun damage vs ground.',
    apply:p=>{ p.rktMul = 2; } },
  { id:'bel1', x:12, y:4, req:'rkt1', fam:'strike', tab:'armory', ground:true, cost:280, sym:'▼', name:'BELLY ARMOR',
    desc:'Hardened underside — −35% damage from ground-launched missiles.',
    apply:p=>{ p.bellyArmor = 0.65; } },
```

- [ ] **Step 3: Damage hooks**

In `js/combat.js` `damageEnemy(e, amt, wp, byPlayer, byCCA)`, at the top (after the `_lastPlayerWp` line from R3), add (substituting the real `wp` tokens learned in R3 Step 4):

```javascript
  if (byPlayer && e.type === 'ground') {
    if (wp === 'missile' && player.agmMul) amt *= player.agmMul;
    if (wp === 'gun' && player.rktMul) amt *= player.rktMul;
  }
```

For BELLY ARMOR: grep where the player takes missile damage (`grep -n "damagePlayer" js/*.js`) and find the enemy-missile impact site. SAM missiles are `spawnMissile(..., true, 1)` from ground units — if missiles carry no origin flag, add one: in `updateGround`'s spawn call (and ONLY there), capture the returned missile if `spawnMissile` returns it (`grep` its return), set `m.fromGround = true`; at the player-damage impact site, scale: `if (m.fromGround && player.bellyArmor) dmg *= player.bellyArmor;`. If `spawnMissile` returns nothing, add the return — one line — or set the flag via the missiles array tail: `missiles[missiles.length-1].fromGround = true;` immediately after the spawn call.

- [ ] **Step 4: Verify + commit**

```bash
node --check js/globals.js && node --check js/combat.js
git add js/globals.js js/combat.js
git commit -m "feat(ground): STRIKE armory branch (AGM/rockets/belly armor) with ground damage hooks"
```

---

### Task G6: Part-2 regression + toggle matrix

- [ ] **Step 1:** Full suite + syntax loop (commands in the header). All green.

- [ ] **Step 2: Manual matrix (browser)**

| groundWar | expect |
|---|---|
| ON | SAMs from wave 2; wave 5 strike banner, radar dish spins, flak puffs near you under 1500u, trucks crawl; wave clears only after radar/SAM/AAA die; STRIKE branch visible in armory |
| OFF (flip in settings, restart sortie) | zero ground units any wave; no strike banner at wave 5/10; STRIKE branch absent from armory; remaining armory nodes still buyable |

- [ ] **Step 3:** Commit any touch-ups: `git commit -am "test(ground): regression touch-ups"` (only if needed).

---

# PART 3 — OPERATION MAP MODE (Tasks M1–M6)

## Design preamble (locked decisions)

1. **Mode select in hangar:** a third button row (pattern: existing `#diffsel` / `#todsel`): `ENDLESS` (default, current behavior) | `OPERATION`. Persisted as `opMode` boolean in settings.
2. **Map:** generated at sortie start. 5 stages: stage 1 = 2 sector choices, stages 2–4 = 2–3 choices each, stage 5 = single `FINAL`. Exactly **one `DEPOT`** placed in a random stage 2–4 (replacing one choice). `STRIKE` sectors only generated when `groundWar` is on (replaced by `FURBALL` otherwise).
3. **Sector types → wave composition** (`sectorPlan`, pure): `FURBALL` fighters-heavy, `INTERCEPT` bombers+escort, `STRIKE` ground package (reuses G4 composition), `ELITE` 2 aces + rival forced if enabled, `DEPOT` no combat (repair 35% + full missiles/flares, auto-advance), `FINAL` boss + 2 aces + 4 fighters.
4. **Flow:** OPERATION sortie → map screen (pick stage-1 sector) → wave fights → wave clear → R&D tech screen (unchanged) → DEPLOY now opens the **map** for the next pick instead of auto-starting the next wave. After `FINAL` clears → `OPERATION COMPLETE` victory screen (+5000 score bonus). Death → existing death screen.
5. **Wave counter still increments** once per sector (difficulty/HP scaling untouched). Endless mode runs the entire current loop untouched — every operation hook is gated behind `opMode`.
6. Rival cadence in operation mode: normal `rivalDue` rules still apply on non-ELITE sectors; `ELITE` forces him (if enabled and alive cadence-wise the forced spawn also stamps `run.lastRivalWave`).

### Task M1: mode select + map generation

**Files:**
- Modify: `index.html`, `js/globals.js`, `js/ui.js`
- Test: `tests/op-map.test.js` (create)

- [ ] **Step 1: Failing test**

Create `tests/op-map.test.js`:

```javascript
'use strict';
const assert = require('assert');

// ---- mirrors of js/opmap.js pure helpers ----
function genOpMap(groundOn, rng) {
  rng = rng || Math.random;
  const pool = ['FURBALL', 'INTERCEPT', 'ELITE'].concat(groundOn ? ['STRIKE'] : []);
  const pick = () => pool[(rng() * pool.length) | 0];
  const stages = [];
  stages.push([pick(), pick()]);
  for (let s = 0; s < 3; s++) {
    const n = 2 + ((rng() * 2) | 0);
    const arr = []; for (let i = 0; i < n; i++) arr.push(pick());
    stages.push(arr);
  }
  const depotStage = 1 + ((rng() * 3) | 0);          // stages[1..3]
  stages[depotStage][(rng() * stages[depotStage].length) | 0] = 'DEPOT';
  stages.push(['FINAL']);
  return stages;
}
function sectorPlan(type, wave) {
  if (type === 'FURBALL')   return { fighters: Math.min(4 + (wave >> 1), 10), aces: wave >= 6 ? 1 : 0, bombers: 0, ground: false, boss: false, rival: false, depot: false };
  if (type === 'INTERCEPT') return { fighters: 3, aces: 0, bombers: wave >= 8 ? 3 : 2, ground: false, boss: false, rival: false, depot: false };
  if (type === 'STRIKE')    return { fighters: 3, aces: 0, bombers: 0, ground: true, boss: false, rival: false, depot: false };
  if (type === 'ELITE')     return { fighters: 2, aces: 2, bombers: 0, ground: false, boss: false, rival: true, depot: false };
  if (type === 'DEPOT')     return { fighters: 0, aces: 0, bombers: 0, ground: false, boss: false, rival: false, depot: true };
  return { fighters: 4, aces: 2, bombers: 0, ground: false, boss: true, rival: false, depot: false };   // FINAL
}

// deterministic rng
function seqRng(vals) { let i = 0; return () => vals[i++ % vals.length]; }

const m = genOpMap(true, seqRng([0.1, 0.4, 0.7, 0.2, 0.9, 0.3, 0.6, 0.5, 0.8, 0.05, 0.45, 0.95, 0.25, 0.65, 0.15]));
assert.strictEqual(m.length, 6, '5 stages + FINAL');
assert.strictEqual(m[0].length, 2, 'stage 1 offers 2');
assert.deepStrictEqual(m[5], ['FINAL'], 'last stage is FINAL only');
let depots = 0; m.forEach(st => st.forEach(s => { if (s === 'DEPOT') depots++; }));
assert.strictEqual(depots, 1, 'exactly one DEPOT');
assert.ok(!m[0].includes('DEPOT') && !m[4].includes('DEPOT'), 'DEPOT only in stages 2-4');

const m2 = genOpMap(false, seqRng([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
m2.forEach(st => st.forEach(s => assert.notStrictEqual(s, 'STRIKE', 'no STRIKE sectors when ground war off')));

assert.strictEqual(sectorPlan('ELITE', 7).rival, true);
assert.strictEqual(sectorPlan('FURBALL', 12).fighters, 10, 'fighter count caps at 10');
assert.strictEqual(sectorPlan('DEPOT', 5).depot, true);
assert.strictEqual(sectorPlan('FINAL', 13).boss, true);

console.log('ok - operation map generation and sector plans');
```

Run: PASS (mirror lock).

- [ ] **Step 2: Create `js/opmap.js`** with byte-identical `genOpMap` + `sectorPlan`, plus state:

```javascript
/* SKYSTRIKE — opmap.js: operation mode map generation + sector plans. Loaded after rival.js. */
let opMap = null;       // stages array from genOpMap
let opStage = 0;        // index of the stage the NEXT pick comes from
let opSector = null;    // currently-flying sector type (string) or null
```

(then the two functions). Add `<script src="js/opmap.js"></script>` after the rival.js tag. Add `let opMode = false;` to `js/globals.js` near `rivalEnabled`.

- [ ] **Step 3: Hangar mode row**

In `index.html` after the `#todsel` div (quoted earlier — ends `</div>` after the three tbtn buttons), add:

```html
    <div id="modesel">
      <span class="dlab">MODE</span>
      <div class="dbtns">
        <button class="dbtn mbtn" data-m="0">ENDLESS</button>
        <button class="dbtn mbtn" data-m="1">OPERATION</button>
      </div>
    </div>
```

Wire in `js/ui.js` `buildHangar()` mirroring how the `.tbtn` time-of-day buttons are wired (grep `tbtn` in ui.js, copy the pattern): clicking sets `opMode = !!+btn.dataset.m`, toggles an `active` class, calls `saveSettings()`. Persist `opMode` in `loadSettings`/`saveSettings` like `rivalEnabled` (boolean).

- [ ] **Step 4: Verify + commit**

```bash
node tests/op-map.test.js && node --check js/opmap.js && node --check js/ui.js
git add js/opmap.js index.html js/globals.js js/ui.js tests/op-map.test.js
git commit -m "feat(opmap): operation mode select, map generation, sector plans"
```

---

### Task M2: map screen modal

**Files:**
- Modify: `index.html`, `styles.css`, `js/ui.js`

- [ ] **Step 1: HTML** — after the `#wingpick` block (Task 7 of the previous feature added it; grep `id="wingpick"`), add:

```html
<div id="opmap">
  <div class="op-box">
    <div class="op-title">OPERATION MAP</div>
    <div class="op-sub">// SELECT NEXT SECTOR //</div>
    <div id="opStages" class="op-stages"></div>
    <button id="opLaunch" disabled>&#9654; LAUNCH</button>
  </div>
</div>
```

- [ ] **Step 2: CSS** — append to `styles.css`:

```css
#opmap{position:absolute;inset:0;z-index:72;display:none;background:rgba(2,6,10,.9);backdrop-filter:blur(5px)}
#opmap.show{display:flex;align-items:center;justify-content:center}
#opmap .op-box{width:min(860px,94vw);max-height:86vh;overflow:auto;border:1px solid rgba(91,138,134,.4);background:linear-gradient(160deg,rgba(10,22,30,.96),rgba(4,9,14,.97));padding:22px 26px}
#opmap .op-title{font-family:var(--disp);font-weight:800;letter-spacing:5px;color:#eafffb;font-size:20px;text-align:center}
#opmap .op-sub{font-family:var(--mono);text-align:center;color:var(--cy);letter-spacing:2px;font-size:10px;margin:6px 0 16px;opacity:.8}
#opmap .op-stages{display:flex;gap:14px;justify-content:center;align-items:stretch}
#opmap .op-stage{display:flex;flex-direction:column;gap:8px;justify-content:center}
#opmap .op-sector{font-family:var(--mono);font-size:10px;letter-spacing:1px;border:1px solid rgba(91,138,134,.35);background:rgba(8,18,26,.7);color:#9fb8c8;padding:10px 12px;min-width:96px;text-align:center}
#opmap .op-sector.pickable{cursor:pointer;color:#eafffb;border-color:var(--cy)}
#opmap .op-sector.pickable:hover{background:rgba(16,40,52,.85)}
#opmap .op-sector.done{opacity:.35}
#opmap .op-sector.chosen{border-color:#ffd24d;color:#ffd24d}
#opmap #opLaunch{display:block;margin:18px auto 0;font-family:var(--mono);letter-spacing:2px;background:transparent;color:var(--cy);border:1px solid rgba(91,138,134,.5);padding:8px 22px;cursor:pointer}
#opmap #opLaunch:disabled{opacity:.35;cursor:default}
```

- [ ] **Step 3: Render + pick flow in `js/ui.js`**

Add:

```javascript
let opPicked = null;          // sector type picked on the map, pending launch
function openOpMap() {
  opPicked = null;
  const wrap = g('opStages'); if (!wrap) return;
  wrap.innerHTML = opMap.map((stage, si) =>
    '<div class="op-stage">' + stage.map((s, i) => {
      const cls = si < opStage ? 'op-sector done' : si === opStage ? 'op-sector pickable' : 'op-sector';
      return '<div class="' + cls + '" data-s="' + si + '" data-i="' + i + '">' + s + '</div>';
    }).join('') + '</div>'
  ).join('');
  wrap.querySelectorAll('.op-sector.pickable').forEach(el => el.addEventListener('click', () => {
    wrap.querySelectorAll('.op-sector.chosen').forEach(c => c.classList.remove('chosen'));
    el.classList.add('chosen');
    opPicked = opMap[+el.getAttribute('data-s')][+el.getAttribute('data-i')];
    g('opLaunch').disabled = false;
  }));
  g('opLaunch').disabled = true;
  g('opmap').classList.add('show');
  paused = true;
  audio.ui();
}
function launchSector() {
  if (!opPicked) return;
  opSector = opPicked; opStage++;
  g('opmap').classList.remove('show');
  paused = false;
  if (clock) clock.getDelta();
  if (opSector === 'DEPOT') { applyDepot(); return; }
  betweenWaves = true; waveTimer = 1.4;
  showBanner('SECTOR: ' + opSector); audio.ui();
}
```

Wire once in `buildHangar()` next to the `wpCancel` listener: `g('opLaunch').addEventListener('click', launchSector);`

- [ ] **Step 4: Verify + commit**

```bash
node --check js/ui.js
git add index.html styles.css js/ui.js
git commit -m "feat(opmap): operation map modal with sector picking"
```

---

### Task M3: route waves through sectors

**Files:**
- Modify: `js/main.js` (nextWave), `js/ui.js` (startGame, deployFromTech)

- [ ] **Step 1: `nextWave` sector branch**

At the top of `nextWave`, after `wave++;` + `_cheatUsed` + the `strike` const from G4, add:

```javascript
  if (opMode && opSector) {
    const plan = sectorPlan(opSector, wave);
    strikeWaveActive = plan.ground;
    showBanner(plan.boss ? '⚠ FINAL TARGET ⚠' : 'SECTOR: ' + opSector);
    for (let i = 0; i < plan.fighters; i++) pendingSpawns.push(spawnFighter);
    for (let i = 0; i < plan.aces; i++) pendingSpawns.push(spawnAce);
    for (let i = 0; i < plan.bombers; i++) pendingSpawns.push(spawnBomber);
    if (plan.boss) pendingSpawns.push(spawnBoss);
    if (plan.ground) {
      pendingSpawns.push(() => spawnGroundKind('radar'));
      pendingSpawns.push(() => spawnGroundKind('sam'));
      pendingSpawns.push(() => spawnGroundKind('sam'));
      pendingSpawns.push(() => spawnGroundKind('aaa'));
      pendingSpawns.push(() => spawnGroundKind('aaa'));
      for (let k = 0; k < 3; k++) pendingSpawns.push(() => spawnGroundKind('truck'));
    }
    if (plan.rival && rivalEnabled) { run.lastRivalWave = wave; pendingSpawns.push(spawnRival); }
    else if (rivalDue(wave, run.lastRivalWave, rivalEnabled) && !plan.boss && !plan.ground) { run.lastRivalWave = wave; pendingSpawns.push(spawnRival); }
    return;
  }
```

(Everything below — the endless composition including G4's strike block — runs only when not in operation mode or before the first sector pick.)

- [ ] **Step 2: `startGame` opens the map**

In `js/ui.js` `startGame(i)` (quoted earlier), after the `wave = 0; betweenWaves = true; waveTimer = 2.6; crateTimer = 9;` line, add:

```javascript
  opMap = null; opStage = 0; opSector = null;
  if (opMode) { opMap = genOpMap(groundWar); openOpMap(); }
```

(`openOpMap` pauses; the first `launchSector` un-pauses and arms `betweenWaves`/`waveTimer`, so the first wave only spawns after the pick. Verify `paused` actually gates `handleWaves` — grep how `paused` is consumed in the main loop; if `handleWaves` runs regardless of pause, set `waveTimer = 9999` before `openOpMap()` and let `launchSector`'s `waveTimer = 1.4` arm it.)

- [ ] **Step 3: `deployFromTech` goes to the map**

Current function (exact) quoted here; modify the tail:

```javascript
function deployFromTech() {
  if (!choosingUpgrade) return;
  pendingUpgrades = null;
  g('upgrade').classList.remove('show');
  choosingUpgrade = false; paused = false;
  if (clock) clock.getDelta();   // swallow the paused interval so dt doesn't spike
  if (isTouchEnabled && state === 'playing') g('touchControls').classList.add('show');
  betweenWaves = true; waveTimer = 1.4;   // short breather, then the next wave spawns
  showBanner('WAVE ' + (wave + 1) + ' INBOUND'); audio.ui();
}
```

becomes:

```javascript
function deployFromTech() {
  if (!choosingUpgrade) return;
  pendingUpgrades = null;
  g('upgrade').classList.remove('show');
  choosingUpgrade = false; paused = false;
  if (clock) clock.getDelta();   // swallow the paused interval so dt doesn't spike
  if (isTouchEnabled && state === 'playing') g('touchControls').classList.add('show');
  if (opMode && opMap) {
    if (opStage >= opMap.length) return;          // FINAL already cleared; victory path owns the flow
    openOpMap(); return;
  }
  betweenWaves = true; waveTimer = 1.4;   // short breather, then the next wave spawns
  showBanner('WAVE ' + (wave + 1) + ' INBOUND'); audio.ui();
}
```

- [ ] **Step 4: Verify + commit**

```bash
node tests/op-map.test.js && node --check js/main.js && node --check js/ui.js
git add js/main.js js/ui.js
git commit -m "feat(opmap): sector-driven wave composition, map between waves"
```

---

### Task M4: DEPOT + victory

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: DEPOT**

Add to `js/ui.js` (near `launchSector`):

```javascript
function applyDepot() {
  player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.35);
  player.missiles = player.maxMissiles;
  player.flares = player.maxFlares;
  showBanner('⚙ DEPOT — REPAIRED & REARMED ⚙'); audio.power();
  openOpMap();                       // straight back to the map for the next pick
}
```

(Grep `player.maxMissiles` / `player.maxFlares` to confirm the field names; adapt if they differ.)

- [ ] **Step 2: Victory**

Find the wave-clear branch in `handleWaves` (main.js, quoted in G4 Step 3). Inside the clear branch (`betweenWaves = true; waveTimer = 4; ...`), add before `openTechScreen();`:

```javascript
      if (opMode && opSector === 'FINAL') { operationComplete(); return; }
```

Then in `js/ui.js`: grep the function that sets `state = 'dead'` (~line 799) — it renders the end screen. Add a sibling:

```javascript
function operationComplete() {
  player.score += 5000;
  showBanner('★ OPERATION COMPLETE ★');
  // reuse the end-of-run screen with a victory title — grep the death flow (state = 'dead')
  // and mirror it: same overlay, title text 'OPERATION COMPLETE', score line included.
}
```

**Implementing agent:** read that death/end-screen function fully, then fill `operationComplete` to invoke the same overlay path with a victory title (do NOT duplicate its body — extract or parameterize if it's a straight title swap, e.g. `endRun('OPERATION COMPLETE')`). Keep `state = 'dead'` semantics for the input handling (restart buttons etc.) unless a cleaner `state` exists.

- [ ] **Step 3: Verify + commit**

```bash
node --check js/ui.js && node --check js/main.js
git add js/ui.js js/main.js
git commit -m "feat(opmap): depot repair/rearm + operation victory screen"
```

---

### Task M5: integration gates

- [ ] **Step 1:** STRIKE ↔ groundWar: already handled at generation (`genOpMap(groundWar)`) — verify by flipping the toggle and regenerating.
- [ ] **Step 2:** ELITE ↔ rival: handled in M3's plan branch (`plan.rival && rivalEnabled`). When `rivalEnabled` is false, ELITE still spawns its 2 aces — verify.
- [ ] **Step 3:** Endless regression: with `opMode` off play 3 waves — composition, tech screen, deploy flow byte-for-byte the pre-Part-3 behavior (no map ever shows).
- [ ] **Step 4:** Commit if touch-ups: `git commit -am "fix(opmap): integration touch-ups"`.

### Task M6: final regression

- [ ] **Step 1:** Full suite + syntax loop (header commands). All green.
- [ ] **Step 2: Manual end-to-end (browser):** OPERATION mode → map shows 6 stage columns → pick FURBALL → fight → clear → R&D → DEPLOY → map again → route through a DEPOT (repair banner) → reach FINAL → boss dies → OPERATION COMPLETE with +5000 score. Then: settings ground war OFF + new operation → map contains no STRIKE sectors. Rival toggle OFF → ELITE sector spawns aces only.
- [ ] **Step 3:** Final commit:

```bash
git add -A && git commit -m "test: full regression pass for rival/ground-war/operation-map features"
```

---

## Cross-part consistency notes (for the implementing agent)

- Names used across parts — do not rename: `rival`, `rivalEnabled`, `rivalDue`, `rivalHpFor`, `rivalPayout`, `pickTrait`, `validRival`, `genRival`, `loadRival`, `saveRival`, `rivalEscaped`, `rivalDefeated`, `rivalSpecialFor`, `fireRivalSpecial`, `updateRivalFlee`, `run.pMissiles/pGunKills/pFlares/lastRivalWave`, `groundWar`, `groundSpawnsAllowed`, `isStrikeWave`, `strikeWaveActive`, `spawnGroundKind`, `e.gkind`, `reqSatisfied`, `nodeById`, `opMode`, `opMap`, `opStage`, `opSector`, `genOpMap`, `sectorPlan`, `openOpMap`, `launchSector`, `applyDepot`, `operationComplete`.
- Script load order after all parts: `globals → entities → rival → opmap → (existing combat/engine/ui/main order)`. Verify the real tag order in index.html before inserting; rival.js and opmap.js must load before ui.js and main.js.
- Every quoted "exact" block was verified against commit `bad5c9d`. If an anchor fails to match, the file drifted — grep the nearest identifier and re-anchor; do not skip the edit.
- `nodeState` gains a `'hidden'` state in G2 — any switch/if over node states added later must handle it.
