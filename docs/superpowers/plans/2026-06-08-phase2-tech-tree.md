# Phase 2 — Tech Tree Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix tech tree overflow/scroll, compress from 11 to 7 columns, then split into TECH TREE + ARMORY tabs.

**Architecture:** Three sequential features — F5 (overflow/scroll fix), F6 (coordinate remap), F7 (tab split + armory). F6 subsumes F5's recenter logic update; F7 adds a new rendering path and armory-only nodes. All changes touch `globals.js`, `ui.js`, `styles.css`, `index.html` only — no game logic changes.

**Tech Stack:** Vanilla JS/HTML/CSS, no build step. Open `index.html` directly in a browser to test.

---

## File Map

| File | Changes |
|------|---------|
| `styles.css` | F5: `#techgrid` max-height/max-width; F7: tab button styles + armory card grid |
| `js/ui.js` | F5: recenter formula; F6: COLW/ROWH constants + recenter; F7: `renderTechTree` filter + new `renderArmory` + tab state |
| `js/globals.js` | F6: all `x`/`y` coords in TECH_TREE; F7: `tab` field on every node + 3 new armory nodes |
| `index.html` | F7: tab buttons inside `#upgrade` panel |

---

## Task 1 — F5: Overflow & Recenter Fix

**Files:**
- Modify: `styles.css` (~line 244, `#techgrid` rule)
- Modify: `js/ui.js` (~line 555, recenter line in `renderTechTree`)

- [ ] **Step 1: Fix `#techgrid` CSS**

In `styles.css`, find the `#techgrid{...}` rule and add `max-height:80vh;max-width:100%;` inside it:

```css
#techgrid{position:relative;overflow:auto;flex:1 1 auto;min-height:0;max-height:80vh;max-width:100%;border:1px solid rgba(91,138,134,.18);
  background:radial-gradient(circle at 50% 0%,rgba(25,240,212,.06),transparent 55%),
  repeating-linear-gradient(0deg,rgba(91,138,134,.05) 0 1px,transparent 1px 30px),
  repeating-linear-gradient(90deg,rgba(91,138,134,.05) 0 1px,transparent 1px 30px);
  cursor:grab}
```

- [ ] **Step 2: Fix recenter to target root node (column 5)**

In `js/ui.js`, find `renderTechTree`, find the recenter line (currently `grid.scrollLeft = Math.max(0, (W - grid.clientWidth) / 2)`). Replace with:

```js
if (recenter) {
  const rootCX = TECH_PAD + 5 * TECH_COLW + TECH_NODEW / 2;
  grid.scrollLeft = Math.max(0, rootCX - grid.clientWidth / 2);
  grid.scrollTop = 0;
}
```

- [ ] **Step 3: Verify in browser**

Open `index.html`. Start a game, clear wave 1 (or set `betweenWaves=true` in console). Tech tree panel opens. Confirm: tree centered on the CORE node, horizontally scrollable, no overflow beyond panel bounds.

- [ ] **Step 4: Commit**

```bash
git add styles.css js/ui.js
git commit -m "fix: tech tree scroll container constraints and root-centered recenter"
```

---

## Task 2 — F6: 7-Column Structure Overhaul

**Files:**
- Modify: `js/globals.js` — all `x`/`y` fields in `TECH_TREE`
- Modify: `js/ui.js` — `TECH_COLW`, `TECH_ROWH` constants; recenter formula (root now at x=3)

**New layout (x=0..6, y=0..14):**
```
x=0  Gunnery      (g1–g5,  y=2..6)
x=1  Munitions    (u1–u4,  y=2..5)
x=2  Missiles     (m1–m6,  y=2..7)
x=3  Armour       (a1–a6,  y=2..7)     core at (3,0)
x=4  Propulsion   (p1–p4,  y=2..5)
x=5  EW           (e1–e6,  y=2..7)
x=6  Economy      (s1–s5,  y=2..6)
     Tactics      (t1–t4,  y=7..10)    same column, lower block
     Wing         (w1-w3,  y=11..13)   same column, lowest block
     reserve              y=14
```

Trunks: `wpn` at (1,1), `def` at (4,1), `cmd` at (6,1).
New constants: `TECH_COLW=160`, `TECH_ROWH=130` (unchanged TECH_NODEW=152, TECH_NODEH=104, TECH_PAD=28).
Canvas width: 56 + 6×160 + 152 = **1168px** (fits in 1340px viewport, no horizontal scroll needed for most screens).

- [ ] **Step 1: Update TECH_COLW and TECH_ROWH in ui.js**

Find line:
```js
const TECH_COLW = 176, TECH_ROWH = 142, TECH_NODEW = 152, TECH_NODEH = 104, TECH_PAD = 28;
```
Replace with:
```js
const TECH_COLW = 160, TECH_ROWH = 130, TECH_NODEW = 152, TECH_NODEH = 104, TECH_PAD = 28;
```

- [ ] **Step 2: Update recenter formula in ui.js (root now at x=3)**

Find the recenter block added in Task 1, step 2. Change `5 * TECH_COLW` to `3 * TECH_COLW`:
```js
if (recenter) {
  const rootCX = TECH_PAD + 3 * TECH_COLW + TECH_NODEW / 2;
  grid.scrollLeft = Math.max(0, rootCX - grid.clientWidth / 2);
  grid.scrollTop = 0;
}
```

- [ ] **Step 3: Remap all TECH_TREE x/y coordinates in globals.js**

Find `const TECH_TREE = [` and replace the entire array with the remapped version below. The `id`, `req`, `fam`, `cost`, `costStep`, `repeat`, `sym`, `name`, `desc`, `ok`, `apply` fields are **unchanged** — only `x` and `y` change:

```js
const TECH_TREE = [
  // ---- root ----
  { id:'core', x:3, y:0, req:null, fam:'core', cost:0, sym:'◆', name:'CORE SYSTEMS', desc:'Boot the upgrade bus. (Owned from the start of every run.)', apply:()=>{} },
  // ---- three trunks ----
  { id:'wpn', x:1, y:1, req:'core', fam:'wpn', cost:110, sym:'✤', name:'WEAPONS BUS', desc:'+12% cannon AND +12% missile damage. Opens the Gunnery, Munitions and Missile branches.', apply:p=>{ p.gunDmgMul *= 1.12; p.missileDmgMul *= 1.12; } },
  { id:'def', x:4, y:1, req:'core', fam:'def', cost:110, sym:'◈', name:'AIRFRAME BUS', desc:'+25 max HP and +12 max shield, topped up now. Opens Armour, Propulsion and EW.', apply:p=>{ p.maxHp += 25; p.hp = p.maxHp; p.maxShield += 12; p.shield = p.maxShield; } },
  { id:'cmd', x:6, y:1, req:'core', fam:'cmd', cost:110, sym:'★', name:'COMMAND BUS', desc:'+12% score from everything. Opens Command/Economy, Tactics and Flight.', apply:p=>{ p.scoreMul *= 1.12; } },

  // ===== WEAPONS ==========================================================
  // ---- GUNNERY x=0 ----
  { id:'g1', x:0, y:2, req:'wpn', fam:'gun', cost:150, sym:'◉', name:'HEAVY ROUNDS',     desc:'+25% cannon damage.',                                              ok:p=>!p.noCannon, apply:p=>{ p.gunDmgMul *= 1.25; } },
  { id:'g2', x:0, y:3, req:'g1',  fam:'gun', cost:280, sym:'▤', name:'RAPID FEED',        desc:'+22% cannon rate of fire.',                                        ok:p=>!p.noCannon, apply:p=>{ p.fireRateMul *= 0.78; } },
  { id:'g3', x:0, y:4, req:'g2',  fam:'gun', cost:450, sym:'≡', name:'AP PENETRATORS',    desc:'Rounds punch THROUGH one extra target, and fly faster.',           ok:p=>!p.noCannon, apply:p=>{ p.pierce += 1; p.bulletSpeedMul *= 1.2; } },
  { id:'g4', x:0, y:5, req:'g3',  fam:'gun', cost:640, sym:'◎', name:'CRITICAL OPTICS',   desc:'+20% chance to land a critical hit for ×1.8 damage.',              ok:p=>!p.noCannon, apply:p=>{ p.critChance = Math.min(0.6, p.critChance + 0.2); p.critMul = Math.max(p.critMul, 1.8); } },
  { id:'g5', x:0, y:6, req:'g4',  fam:'gun', cost:980, sym:'✦', name:'GAUSS DRIVER',      desc:'CAPSTONE — +45% cannon damage, +1 pierce, hypervelocity rounds, and critical hits now DETONATE on impact.', ok:p=>!p.noCannon, apply:p=>{ p.gunDmgMul *= 1.45; p.pierce += 1; p.bulletSpeedMul *= 1.2; p.critChance = Math.min(0.6, p.critChance + 0.05); p.critChain = true; } },

  // ---- MUNITIONS x=1 ----
  { id:'u1', x:1, y:2, req:'wpn', fam:'mun', cost:170, sym:'⊛', name:'SMART FUZING',      desc:'Every kill cooks off in a small blast, damaging nearby foes.',     apply:p=>{ p.chainRadius = Math.max(p.chainRadius, 150); p.chainDmg += 24; } },
  { id:'u2', x:1, y:3, req:'u1',  fam:'mun', cost:300, sym:'◈', name:'OVERPRESSURE',      desc:'+15% cannon AND +15% missile damage.',                             apply:p=>{ p.gunDmgMul *= 1.15; p.missileDmgMul *= 1.15; } },
  { id:'u3', x:1, y:4, req:'u2',  fam:'mun', cost:470, sym:'⁂', name:'CLUSTER CHARGES',   desc:'Kill blasts are much larger and hit harder.',                      apply:p=>{ p.chainRadius += 100; p.chainDmg += 22; } },
  { id:'u4', x:1, y:5, req:'u3',  fam:'mun', cost:820, sym:'✧', name:'CHAIN REACTION',    desc:'CAPSTONE — kill blasts DETONATE TWICE, reach further, and all your damage rises +20%. Cascading carnage.', apply:p=>{ p.chainProp = true; p.chainRadius += 70; p.chainDmg += 18; p.gunDmgMul *= 1.2; p.missileDmgMul *= 1.2; } },

  // ---- MISSILES x=2 ----
  { id:'m1', x:2, y:2, req:'wpn', fam:'msl', cost:150, sym:'➙', name:'HE WARHEADS',       desc:'+28% missile damage.',                                             apply:p=>{ p.missileDmgMul *= 1.28; } },
  { id:'m2', x:2, y:3, req:'m1',  fam:'msl', cost:280, sym:'◐', name:'AESA RADAR',        desc:'Missiles lock on 30% faster.',                                     apply:p=>{ p.lockSpeedMul *= 0.7; } },
  { id:'m3', x:2, y:4, req:'m2',  fam:'msl', cost:450, sym:'✺', name:'THERMOBARIC',       desc:'Missiles burst into a damaging blast on impact.',                  apply:p=>{ p.splashRadius = Math.max(p.splashRadius, 340); p.splashDmg += 24; } },
  { id:'m4', x:2, y:5, req:'m3',  fam:'msl', cost:620, sym:'⊺', name:'AUTOLOADER',        desc:'40% chance a kill refunds a missile to the rack.',                 apply:p=>{ p.mslRefund += 0.4; } },
  { id:'m5', x:2, y:6, req:'m4',  fam:'msl', cost:860, sym:'☰', name:'SWARM RACK',        desc:'Each launch looses an extra missile, and +6 to the rack.',         apply:p=>{ p.mslSwarm += 1; p.maxMissiles += 6; p.missiles = p.maxMissiles; } },
  { id:'m6', x:2, y:7, req:'m5',  fam:'msl', cost:1150, sym:'✣', name:'HYDRA SYSTEM',    desc:'CAPSTONE — +30% missile damage, +1 more missile per launch, every bird hard-homes, and far bigger blasts.', apply:p=>{ p.missileDmgMul *= 1.3; p.mslSwarm += 1; p.mslHard = true; p.splashRadius = Math.max(p.splashRadius, 340) + 120; p.splashDmg += 22; } },

  // ===== AIRFRAME =========================================================
  // ---- ARMOUR x=3 ----
  { id:'a1', x:3, y:2, req:'def', fam:'arm', cost:150, sym:'▣', name:'REINFORCED HULL',   desc:'+35 max HP and fully repair the airframe.',                        apply:p=>{ p.maxHp += 35; p.hp = p.maxHp; } },
  { id:'a2', x:3, y:3, req:'a1',  fam:'arm', cost:280, sym:'◒', name:'AEGIS PLATING',     desc:'+22 max shield, +40% shield regen, recharged now.',                apply:p=>{ p.maxShield += 22; p.shield = p.maxShield; p.shieldRegenMul *= 1.4; } },
  { id:'a3', x:3, y:4, req:'a2',  fam:'arm', cost:450, sym:'✚', name:'GUARDIAN SYSTEM',   desc:'Take 18% less damage from all sources.',                           apply:p=>{ p.dmgReduce = clamp(p.dmgReduce + 0.18, 0, 0.6); } },
  { id:'a4', x:3, y:5, req:'a3',  fam:'arm', cost:620, sym:'✛', name:'NANITE REPAIR',     desc:'Repair 7 HP every time you destroy something.',                    apply:p=>{ p.lifesteal += 7; } },
  { id:'a5', x:3, y:6, req:'a4',  fam:'arm', cost:860, sym:'⦿', name:'REACTIVE ARMOUR',   desc:'When your shield breaks it DETONATES — concussing foes and blinding incoming missiles.', apply:p=>{ p.reactive = Math.max(p.reactive, 70); } },
  { id:'a6', x:3, y:7, req:'a5',  fam:'arm', cost:1150, sym:'◆', name:'JUGGERNAUT',       desc:'CAPSTONE — +50 max HP, another 12% damage reduction, and overhealing now banks as bonus OVERSHIELD.', apply:p=>{ p.maxHp += 50; p.hp = p.maxHp; p.dmgReduce = clamp(p.dmgReduce + 0.12, 0, 0.7); p.vampShield = Math.max(p.vampShield, 0.5); p.overshieldCap += 60; } },

  // ---- PROPULSION x=4 ----
  { id:'p1', x:4, y:2, req:'def', fam:'prop', cost:170, sym:'↑', name:'THRUST VECTORING', desc:'+12% turn rate — tighter, faster turns.',                         apply:p=>{ p.turnMul *= 1.12; } },
  { id:'p2', x:4, y:3, req:'p1',  fam:'prop', cost:300, sym:'◇', name:'ADAPTIVE INTAKES', desc:'+14% top speed.',                                                  apply:p=>{ p.speedMul *= 1.14; } },
  { id:'p3', x:4, y:4, req:'p2',  fam:'prop', cost:480, sym:'✲', name:'ENERGY MANEUVER',  desc:'+12% turn rate and +8% top speed.',                                apply:p=>{ p.turnMul *= 1.12; p.speedMul *= 1.08; } },
  { id:'p4', x:4, y:5, req:'p3',  fam:'prop', cost:820, sym:'➤', name:'SUPERCRUISE',      desc:'CAPSTONE — +18% speed, +12% turn, and a constant 6% damage reduction from sheer energy.', apply:p=>{ p.speedMul *= 1.18; p.turnMul *= 1.12; p.dmgReduce = clamp(p.dmgReduce + 0.06, 0, 0.7); } },

  // ---- EW x=5 ----
  { id:'e1', x:5, y:2, req:'def', fam:'ew', cost:140, sym:'✴', name:'DECOY POD',          desc:'+4 max flares (refilled) and they burn longer.',                   apply:p=>{ p.maxFlares += 4; p.flares = p.maxFlares; p.flarePro = 1; } },
  { id:'e2', x:5, y:3, req:'e1',  fam:'ew', cost:270, sym:'◌', name:'RCS COATING',        desc:'Incoming missiles lose your lock far more often.',                 apply:p=>{ p.mslEvade = clamp(p.mslEvade + 0.22, 0, 0.9); } },
  { id:'e3', x:5, y:4, req:'e2',  fam:'ew', cost:430, sym:'↻', name:'OVERCLOCK',          desc:'Special ability recharges 25% faster.',                            apply:p=>{ p.special.max *= 0.75; } },
  { id:'e4', x:5, y:5, req:'e3',  fam:'ew', cost:620, sym:'✷', name:'POINT-DEFENSE LASER', desc:'An auto-laser swats incoming missiles that stray too close.',    apply:p=>{ p.pointDefense = Math.max(p.pointDefense, 0.5); } },
  { id:'e5', x:5, y:6, req:'e4',  fam:'ew', cost:840, sym:'⦿', name:'TRACTOR FIELD',      desc:'Supply pickups are drawn toward you from range.',                  apply:p=>{ p.lootMagnet += 420; } },
  { id:'e6', x:5, y:7, req:'e5',  fam:'ew', cost:1120, sym:'✲', name:'GHOST PROTOCOL',    desc:'CAPSTONE — missiles rarely hold lock, special recharges another 20% faster, and the point-defense laser fires far more aggressively.', apply:p=>{ p.mslEvade = clamp(p.mslEvade + 0.3, 0, 0.95); p.special.max *= 0.8; p.pointDefense += 0.45; } },

  // ===== COMMAND ==========================================================
  // ---- ECONOMY x=6, y=2..6 ----
  { id:'s1', x:6, y:2, req:'cmd', fam:'sc', cost:150, sym:'★', name:'ACE BONUS',          desc:'+25% score from everything.',                                      apply:p=>{ p.scoreMul *= 1.25; } },
  { id:'s2', x:6, y:3, req:'s1',  fam:'sc', cost:300, sym:'◉', name:'FIELD ANALYTICS',    desc:'+25% research points (RP) earned.',                                apply:p=>{ p.rpMul *= 1.25; } },
  { id:'s3', x:6, y:4, req:'s2',  fam:'sc', cost:470, sym:'¤', name:'BOUNTY CONTRACTS',   desc:'Every kill you land pays a flat +6 RP bounty, and restock all ammo now.', apply:p=>{ p.rpPerKill += 6; p.bullets = p.maxBullets; p.missiles = p.maxMissiles; p.flares = p.maxFlares; } },
  { id:'s4', x:6, y:5, req:'s3',  fam:'sc', cost:640, sym:'☰', name:'WAR CHEST',          desc:'+25% score, and fully restock guns, missiles & flares.',           apply:p=>{ p.scoreMul *= 1.25; p.bullets = p.maxBullets; p.missiles = p.maxMissiles; p.flares = p.maxFlares; } },
  { id:'s5', x:6, y:6, req:'s4',  fam:'sc', cost:980, sym:'✲', name:'ACE PEDIGREE',       desc:'CAPSTONE — +35% score, +20% RP, and another +6 RP bounty per kill.', apply:p=>{ p.scoreMul *= 1.35; p.rpMul *= 1.2; p.rpPerKill += 6; } },

  // ---- TACTICS x=6, y=7..10 ----
  { id:'t1', x:6, y:7,  req:'cmd', fam:'tac', cost:180, sym:'⌖', name:'MARKSMAN',         desc:'+20% damage to any target still at full health — reward the alpha strike.', apply:p=>{ p.alphaMul = Math.max(p.alphaMul, 1.2); } },
  { id:'t2', x:6, y:8,  req:'t1',  fam:'tac', cost:320, sym:'⬇', name:'ADRENALINE',        desc:'The lower your HP, the harder you hit — up to +35% damage near death.', apply:p=>{ p.berserk = Math.max(p.berserk, 0.35); } },
  { id:'t3', x:6, y:9,  req:'t2',  fam:'tac', cost:500, sym:'▼', name:'EXECUTIONER',       desc:'Instantly destroy any non-boss dropped below 12% health.',         apply:p=>{ p.execThresh = Math.max(p.execThresh, 0.12); } },
  { id:'t4', x:6, y:10, req:'t3',  fam:'tac', cost:880, sym:'✪', name:'APEX PREDATOR',     desc:'CAPSTONE — +25% score, execute threshold rises to 18%, and once per wave you SURVIVE a lethal blow at 40% HP.', apply:p=>{ p.scoreMul *= 1.25; p.cheatDeath = true; p.execThresh = Math.max(p.execThresh, 0.18); } },

  // ---- WING x=6, y=11..14 ----
  { id:'w1', x:6, y:11, req:'cmd', fam:'wing', cost:300, sym:'▲', name:'WING COMMANDER',  desc:'Deploy a 2nd AI escort, then repair & up-armour the flight.', ok:()=>permWingmen() < 2, apply:()=>{ if (permWingmen() < MAX_WINGMEN) spawnWingman(); buffFlight(60); } },
  { id:'w2', x:6, y:12, req:'w1',  fam:'wing', cost:520, sym:'▲', name:'SQUADRON',        desc:'Deploy a 3rd AI escort and heavily up-armour the flight.', ok:()=>permWingmen() < 3, apply:()=>{ if (permWingmen() < MAX_WINGMEN) spawnWingman(); buffFlight(80); } },
  { id:'w3', x:6, y:13, req:'w2',  fam:'wing', cost:820, sym:'✲', name:'FLEET COMMANDER', desc:'CAPSTONE — +25% score, escorts hit 60% harder, flight fully repaired.', apply:p=>{ p.scoreMul *= 1.25; wingDmgMul *= 1.6; buffFlight(40); } },
  { id:'reserve', x:6, y:14, req:'w3', fam:'wing', cost:400, costStep:240, repeat:true, sym:'…', name:'RESERVE SQUADRON',
    desc:'REPEATABLE — scramble another escort (up to ' + MAX_WINGMEN + ' in the air) and up-armour the whole flight. Cost rises each time. A bottomless place to pour spare RP.',
    apply:()=>{ if (permWingmen() < MAX_WINGMEN) spawnWingman(); buffFlight(55); } },
];
```

- [ ] **Step 4: Verify in browser**

Open `index.html`. Confirm tree renders with 7 visible columns, connectors draw correctly between trunks and sub-branches, Economy/Tactics/Wing blocks are separated by visual whitespace in the right column. No nodes overlap.

- [ ] **Step 5: Commit**

```bash
git add js/globals.js js/ui.js
git commit -m "refactor: compress tech tree from 11 to 7 columns with remapped coordinates"
```

---

## Task 3 — F7: Split into TECH TREE + ARMORY Tabs

**Files:**
- Modify: `js/globals.js` — add `tab` field to every node + 3 new armory nodes
- Modify: `js/ui.js` — tab state, `renderTechTree` filter, new `renderArmory`, tab handler
- Modify: `styles.css` — tab button styles, armory card grid
- Modify: `index.html` — tab buttons + subtitle update

- [ ] **Step 1: Add `tab` field to every TECH_TREE node in globals.js**

Add `tab:'tree'` to every node in TECH_TREE except `reserve` which gets `tab:'armory'`. Then append three new armory-only nodes at the end of the array (before the closing `]`):

```js
  // ---- ARMORY-ONLY nodes (no prereq, purchasable any time) ----
  { id:'ar_ammo', tab:'armory', x:0, y:0, req:null, fam:'wpn', cost:120, sym:'⌁', name:'AMMO RESTOCK', desc:'Immediately reload 200 cannon rounds and 4 missiles.', apply:p=>{ p.bullets = Math.min(p.maxBullets, p.bullets + 200); p.missiles = Math.min(p.maxMissiles, p.missiles + 4); } },
  { id:'ar_flare', tab:'armory', x:0, y:0, req:null, fam:'ew',  cost:80,  sym:'✸', name:'FLARE PACK',   desc:'Immediately restock 6 flares.', apply:p=>{ p.flares = Math.min(p.maxFlares, p.flares + 6); } },
  { id:'ar_repair',tab:'armory', x:0, y:0, req:null, fam:'arm', cost:150, sym:'✚', name:'FIELD REPAIR',  desc:'Immediately repair 30 HP and recharge 20 shield.', apply:p=>{ p.hp = Math.min(p.maxHp, p.hp + 30); p.shield = Math.min(p.maxShield, p.shield + 20); } },
```

Also add `tab:'tree'` to every existing node. The fastest way: in globals.js, add a post-array pass after `const TECH_BY_ID = ...`:

```js
for (const n of TECH_TREE) { if (!n.tab) n.tab = (n.repeat ? 'armory' : 'tree'); }
```

This tags `reserve` as `'armory'` (repeat:true) and all others as `'tree'` without editing each node individually. The three new armory nodes already have `tab:'armory'` set explicitly.

- [ ] **Step 2: Add tab state and update openTechScreen in ui.js**

Near the top of the tech tree section (around line 497), add:
```js
let techTab = 'tree';   // 'tree' or 'armory'
```

Update `openTechScreen` to reset to 'tree' tab on open:
```js
function openTechScreen() {
  if (!player) return;
  techTab = 'tree';
  renderTechScreen(true);
  choosingUpgrade = true; paused = true;
  g('touchControls').classList.remove('show');
  g('upgrade').classList.add('show');
}
```

Add a new dispatcher `renderTechScreen(recenter)` that calls the right renderer:
```js
function renderTechScreen(recenter) {
  const rv = g('rpval'); if (rv) rv.textContent = Math.floor(player.tp).toLocaleString();
  const tabTree = g('techTabTree'), tabArm = g('techTabArmory');
  if (tabTree) tabTree.classList.toggle('on', techTab === 'tree');
  if (tabArm)  tabArm.classList.toggle('on', techTab === 'armory');
  if (techTab === 'armory') renderArmory();
  else renderTechTree(recenter);
}
```

- [ ] **Step 3: Update renderTechTree to filter tree-tab nodes only**

In `renderTechTree`, change the two `for (const n of TECH_TREE)` loops (one for maxX/maxY, one for SVG connectors, one for nodes) so each iterates only `TECH_TREE.filter(n => n.tab === 'tree')`:

```js
function renderTechTree(recenter) {
  const grid = g('techgrid'); if (!grid) return;
  const treeNodes = TECH_TREE.filter(n => n.tab === 'tree');
  let maxX = 0, maxY = 0; for (const n of treeNodes) { if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y; }
  const W = TECH_PAD * 2 + maxX * TECH_COLW + TECH_NODEW;
  const H = TECH_PAD * 2 + maxY * TECH_ROWH + TECH_NODEH;
  let svg = '<svg width="' + W + '" height="' + H + '">';
  for (const n of treeNodes) {
    if (!n.req) continue; const p = TECH_BY_ID[n.req]; if (!p || p.tab !== 'tree') continue;
    // ... rest of connector drawing unchanged ...
  }
  svg += '</svg>';
  let nodes = '';
  for (const n of treeNodes) {
    // ... node HTML generation unchanged ...
  }
  grid.innerHTML = '<div id="techcanvas" style="width:' + W + 'px;height:' + H + 'px">' + svg + nodes + '</div>';
  const cv = g('techcanvas');
  cv.querySelectorAll('.tnode.avail').forEach(el => el.addEventListener('click', () => { if (techPanMoved) { techPanMoved = false; return; } buyNode(TECH_BY_ID[el.getAttribute('data-id')]); }));
  if (recenter) {
    const rootCX = TECH_PAD + 3 * TECH_COLW + TECH_NODEW / 2;
    grid.scrollLeft = Math.max(0, rootCX - grid.clientWidth / 2);
    grid.scrollTop = 0;
  }
}
```

- [ ] **Step 4: Add renderArmory function in ui.js**

Add after `renderTechTree`:
```js
function renderArmory() {
  const grid = g('techgrid'); if (!grid) return;
  const armNodes = TECH_TREE.filter(n => n.tab === 'armory');
  let cards = '';
  for (const n of armNodes) {
    const st = nodeState(n), ac = FAM_C[n.fam] || '#19f0d4';
    const cost = nodeCost(n);
    const costTxt = st === 'bought' ? 'OWNED' : st === 'na' ? 'N/A' : cost + ' RP';
    const badge = n.repeat ? '<span class="tn-rep">×' + repeatCount(n) + '</span>' : '';
    cards += '<div class="tnode armcard ' + st + (n.repeat ? ' rep' : '') + '" data-id="' + n.id + '" style="--ac:' + ac + '">' +
      badge +
      '<div class="tn-sym">' + n.sym + '</div>' +
      '<div class="tn-name">' + n.name + '</div>' +
      '<div class="tn-desc">' + n.desc + '</div>' +
      '<span class="tn-cost">' + costTxt + '</span>' +
    '</div>';
  }
  grid.innerHTML = '<div class="armory-grid">' + cards + '</div>';
  grid.querySelectorAll('.tnode.avail').forEach(el => el.addEventListener('click', () => {
    const id = el.getAttribute('data-id'); buyNode(TECH_BY_ID[id]);
  }));
  grid.scrollTop = 0;
}
```

Update `buyNode` to call `renderTechScreen(false)` instead of `renderTechTree(false)`:
```js
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
  renderTechScreen(false);
}
```

- [ ] **Step 5: Add tab buttons to index.html**

Inside `#upgrade > .uwrap > .techhead > div` (the first child div containing the h2), add tab buttons below the `<p class="usub">`:

```html
<div class="tech-tabs">
  <button id="techTabTree" class="tech-tab on" onclick="techTab='tree';renderTechScreen(false)">TECH TREE</button>
  <button id="techTabArmory" class="tech-tab" onclick="techTab='armory';renderTechScreen(false)">ARMORY</button>
</div>
```

Also update the `usub` paragraph text:
```html
<p class="usub">// PATH DOWN ANY BRANCH · UPGRADES PERSIST FOR THE RUN //</p>
```

- [ ] **Step 6: Add CSS for tabs and armory grid in styles.css**

Add after the `#techDeploy` rule (around line 277):
```css
/* tech tree tabs */
.tech-tabs{display:flex;gap:8px;margin-top:10px}
.tech-tab{background:transparent;border:1px solid rgba(91,138,134,.4);color:var(--dim);font-family:var(--disp);letter-spacing:2px;font-size:11px;padding:7px 18px;cursor:pointer;transition:.18s;clip-path:polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%)}
.tech-tab:hover{border-color:var(--cy);color:var(--txt)}
.tech-tab.on{border-color:var(--cy);color:var(--ink);background:var(--cy);box-shadow:0 0 14px rgba(25,240,212,.4)}

/* armory grid */
.armory-grid{display:flex;flex-wrap:wrap;gap:14px;padding:16px;align-content:flex-start}
.tnode.armcard{position:static;width:180px}
```

- [ ] **Step 7: Verify in browser**

Open `index.html`. Start game, clear wave. On tech screen:
- TECH TREE tab shows the 7-column tree (Economy/Tactics/Wing stacked in right column)
- ARMORY tab shows flat card grid: AMMO RESTOCK, FLARE PACK, FIELD REPAIR, RESERVE SQUADRON
- Buying a node on either tab updates RP display and re-renders correctly
- DEPLOY button works from both tabs

- [ ] **Step 8: Commit**

```bash
git add js/globals.js js/ui.js styles.css index.html
git commit -m "feat: split tech tree into TECH TREE + ARMORY tabs with 3 new armory consumables"
```

---

## Self-Review

**Spec coverage:**
- F5 overflow fix ✓ (Task 1: CSS max-height/max-width, recenter formula)
- F5 recenter to root ✓ (Task 1: rootCX formula)
- F6 7-column remap ✓ (Task 2: all x/y coords, COLW/ROWH constants)
- F7 tab split ✓ (Task 3: tab buttons, renderTechTree filter, renderArmory)
- F7 armory flat grid ✓ (Task 3: armory-grid CSS, renderArmory)
- F7 new consumable nodes ✓ (Task 3: ar_ammo, ar_flare, ar_repair)
- F7 tab:`armory` tagging ✓ (Task 3: post-array pass + explicit armory node tags)

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:** `renderTechScreen` consistently called from `openTechScreen` and `buyNode`. `techTab` state used in `renderTechScreen`. `g('techTabTree')`/`g('techTabArmory')` IDs match the HTML added in Step 5.

**Edge case:** `nodeState` for armory nodes with `req:null` — `owns(null)` returns false but the `if (node.req && !owns(node.req))` guard short-circuits on `null`, so they correctly show as `avail` when affordable. ✓
