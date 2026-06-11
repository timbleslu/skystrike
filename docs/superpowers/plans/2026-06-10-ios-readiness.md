# iOS-Readiness Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Skystrike self-contained (no CDNs), upgrade Three.js, add a persistence seam, polish iOS viewport handling, and scaffold a Capacitor iOS wrap.

**Architecture:** Keep the existing classic-script (non-module) architecture — it works offline in a WKWebView with zero build step. Vendor all external assets (Three.js, fonts) locally. Add `js/storage.js` as the single persistence seam so localStorage can later be swapped for Capacitor Preferences. Capacitor wraps a `www/` folder produced by a copy script.

**Tech Stack:** Three.js 0.159.0 (last UMD build), Node built-in test scripts, Capacitor 6+, no bundler (deliberately — see Deferred section).

**Branch:** `feat/ios-readiness` off `master`.

---

### Task 1: npm scaffold + test runner

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "skystrike",
  "private": true,
  "version": "0.1.0",
  "description": "SKYSTRIKE // ACE PROTOCOL — arcade jet combat (Three.js)",
  "scripts": {
    "test": "sh -c 'for f in tests/*.test.js; do node \"$f\" || exit 1; done; echo ALL TESTS PASS'",
    "build:www": "sh scripts/build-www.sh"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
www/
.DS_Store
```

- [ ] **Step 3: Verify baseline green**

Run: `npm test`
Expected: each test file's ok lines, then `ALL TESTS PASS`

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: add npm scaffold with test runner script"
```

### Task 2: Vendor Three.js locally + upgrade r128 → r159

r159 is the last release shipping a UMD `three.min.js`, so the classic-script architecture survives. API scan confirmed the game uses only stable APIs (Mesh, geometries, materials, math, Sprite, Points, Fog) — nothing removed between r128 and r159. Two behavior changes need shims: color management (r152 defaults renderer output to sRGB) and light intensity scaling (r155 defaults `useLegacyLights` to false). Shims preserve the r128 look exactly.

**Files:**
- Create: `vendor/three.min.js` (copied from npm package)
- Modify: `index.html:278` (script tag)
- Modify: `js/engine.js:102-103` (renderer shims)

- [ ] **Step 1: Install and vendor**

```bash
npm i -D three@0.159.0
mkdir -p vendor
cp node_modules/three/build/three.min.js vendor/three.min.js
```

- [ ] **Step 2: Verify vendored build loads and is r159**

Run: `node -e "const THREE=require('./vendor/three.min.js'); console.log(THREE.REVISION)"`
Expected: `159`

- [ ] **Step 3: Swap CDN script tag in index.html**

Replace:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
```
with:
```html
<script src="vendor/three.min.js"></script>
```

- [ ] **Step 4: Add renderer compat shims in js/engine.js**

After `renderer = new THREE.WebGLRenderer(...)` (line 102), before `renderer.setSize`:

```js
  // r128-equivalent rendering: keep linear output + legacy light intensities after the r159 upgrade
  THREE.ColorManagement.enabled = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.useLegacyLights = true;
```

- [ ] **Step 5: Tests + commit**

Run: `npm test` → `ALL TESTS PASS`

```bash
git add vendor/three.min.js index.html js/engine.js package.json package-lock.json
git commit -m "feat: vendor Three.js locally and upgrade r128 -> r159 with compat shims"
```

Manual browser smoke required afterwards (visual parity: sky, lighting, jets).

### Task 3: storage.js persistence seam

All persistence goes through one module so the localStorage internals can be swapped for Capacitor Preferences on iOS (localStorage in WKWebView is evictable). Call sites: `js/rival.js:40,44` and `js/ui.js:914,917,922,939`.

**Files:**
- Create: `js/storage.js`
- Modify: `js/rival.js:38-44`, `js/ui.js:913-943`
- Modify: `index.html` (script tag before `js/globals.js`)
- Test: `tests/storage.test.js`

- [ ] **Step 1: Write failing contract test**

`tests/storage.test.js`:
```js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// storage.js is the single persistence seam: no other game file may touch localStorage directly
const jsDir = path.join(__dirname, '..', 'js');
for (const f of fs.readdirSync(jsDir)) {
  if (!f.endsWith('.js') || f === 'storage.js') continue;
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  assert.ok(!/localStorage/.test(src), f + ' must use store.get/store.set, not localStorage');
}

const ssrc = fs.readFileSync(path.join(jsDir, 'storage.js'), 'utf8');
assert.ok(/const store\s*=/.test(ssrc), 'storage.js defines store');
assert.ok(/localStorage\.getItem/.test(ssrc) && /localStorage\.setItem/.test(ssrc), 'store wraps localStorage');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.indexOf('js/storage.js') < html.indexOf('js/globals.js'), 'storage.js loads before globals.js');

console.log('ok - storage seam: no direct localStorage outside storage.js');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/storage.test.js`
Expected: FAIL (`storage.js` missing / rival.js uses localStorage)

- [ ] **Step 3: Create js/storage.js**

```js
/* SKYSTRIKE — storage.js: single persistence seam.
   Wraps localStorage today; swap these internals for Capacitor Preferences on iOS
   (WKWebView localStorage is evictable under storage pressure). Loaded first. */

const store = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (e) {} },
};
```

- [ ] **Step 4: Replace call sites**

`js/rival.js` — `loadRival`/`saveRival` become:
```js
function loadRival() {
  try {
    const r = JSON.parse(store.get(RIVAL_KEY) || 'null');
    rival = validRival(r) ? r : genRival(r && Array.isArray(r.board) ? r.board : []);
  } catch (e) { rival = genRival([]); }
}
function saveRival() { try { store.set(RIVAL_KEY, JSON.stringify(rival)); } catch (e) {} }
```

`js/ui.js` — in `loadBest`/`saveBest`/`loadSettings`/`saveSettings`, replace `localStorage.getItem(` → `store.get(` and `localStorage.setItem(` → `store.set(` (4 lines; keep surrounding try/catch as-is).

`index.html` — add before `js/globals.js`:
```html
<script src="js/storage.js"></script>
```

- [ ] **Step 5: Run tests + commit**

Run: `npm test` → `ALL TESTS PASS` (including new storage test)

```bash
git add js/storage.js js/rival.js js/ui.js index.html tests/storage.test.js
git commit -m "feat: route all persistence through storage.js seam"
```

### Task 4: iOS viewport + safe-area polish

Touch controls (virtual joystick `#joyBase`, touch buttons) already exist in `js/main.js:577-637`. Remaining gaps: notch/home-indicator insets and rubber-band scrolling.

**Files:**
- Modify: `index.html:5` (viewport meta)
- Modify: `styles.css:10,29`

- [ ] **Step 1: Viewport meta — add viewport-fit=cover**

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

- [ ] **Step 2: styles.css — overscroll + callout suppression on html,body (line 10)**

Append to the existing `html,body{...}` rule:
```
overscroll-behavior:none;-webkit-user-select:none;-webkit-touch-callout:none;
```

- [ ] **Step 3: styles.css — HUD safe-area padding (line 29)**

Change `#hud` rule to:
```css
#hud{position:fixed;inset:0;z-index:40;pointer-events:none;text-transform:uppercase;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
```

- [ ] **Step 4: Tests + commit**

Run: `npm test` → `ALL TESTS PASS`

```bash
git add index.html styles.css
git commit -m "feat: iOS safe-area insets and overscroll suppression"
```

### Task 5: Vendor fonts (offline-ready)

Google Fonts CDN fails offline inside an installed app. Vendor woff2 files locally.

**Files:**
- Create: `vendor/fonts/*.woff2` (Orbitron 500/700/900, Share Tech Mono 400)
- Create: `vendor/fonts/fonts.css`
- Modify: `index.html:7-10` (remove CDN links, add local stylesheet)

- [ ] **Step 1: Download woff2 files**

Fetch the Google Fonts CSS with a modern UA, extract woff2 URLs, download each into `vendor/fonts/` as `orbitron-500.woff2`, `orbitron-700.woff2`, `orbitron-900.woff2`, `share-tech-mono-400.woff2` (latin subset is enough).

- [ ] **Step 2: Create vendor/fonts/fonts.css**

```css
@font-face{font-family:'Orbitron';font-style:normal;font-weight:500;font-display:swap;src:url('orbitron-500.woff2') format('woff2')}
@font-face{font-family:'Orbitron';font-style:normal;font-weight:700;font-display:swap;src:url('orbitron-700.woff2') format('woff2')}
@font-face{font-family:'Orbitron';font-style:normal;font-weight:900;font-display:swap;src:url('orbitron-900.woff2') format('woff2')}
@font-face{font-family:'Share Tech Mono';font-style:normal;font-weight:400;font-display:swap;src:url('share-tech-mono-400.woff2') format('woff2')}
```

- [ ] **Step 3: Swap index.html head**

Remove the two `<link rel="preconnect">` lines and the fonts.googleapis.com stylesheet link; add:
```html
<link rel="stylesheet" href="vendor/fonts/fonts.css">
```

- [ ] **Step 4: Tests + commit**

Run: `npm test` → `ALL TESTS PASS`

```bash
git add vendor/fonts index.html
git commit -m "feat: vendor Orbitron and Share Tech Mono fonts for offline use"
```

### Task 6: Capacitor iOS scaffold

**Files:**
- Create: `scripts/build-www.sh`
- Create: `capacitor.config.json`
- Create: `docs/ios.md`
- Create: `ios/` (generated by `npx cap add ios`; commit it)

- [ ] **Step 1: Create scripts/build-www.sh**

```sh
#!/bin/sh
# Assemble the static web build Capacitor wraps. No bundler: the game is plain scripts.
set -e
cd "$(dirname "$0")/.."
rm -rf www
mkdir -p www
cp index.html styles.css www/
cp -R js vendor www/
echo "www/ ready"
```

- [ ] **Step 2: Install Capacitor + config**

```bash
npm i @capacitor/core && npm i -D @capacitor/cli && npm i @capacitor/ios
```

`capacitor.config.json`:
```json
{
  "appId": "com.timbles.skystrike",
  "appName": "Skystrike",
  "webDir": "www",
  "ios": { "contentInset": "never" }
}
```

- [ ] **Step 3: Build www + add iOS platform**

```bash
npm run build:www
npx cap add ios
npx cap sync ios
```

If `cap add ios` fails on missing Xcode/CocoaPods, record the error in docs/ios.md and continue — config and www are still valid; the user runs it after installing Xcode.

- [ ] **Step 4: Write docs/ios.md**

Document: prerequisites (Xcode, CocoaPods), `npm run build:www && npx cap sync ios`, `npx cap open ios`, signing team selection, run on device. Note the storage.js seam as the place to adopt `@capacitor/preferences` before App Store release.

- [ ] **Step 5: Tests + commit**

Run: `npm test` → `ALL TESTS PASS`

```bash
git add scripts/build-www.sh capacitor.config.json docs/ios.md package.json package-lock.json ios 2>/dev/null
git commit -m "feat: Capacitor iOS scaffold with www build script"
```

---

## Deferred: ES modules + Vite

Deliberately out of scope. `js/globals.js` declares ~80 mutable top-level `let` bindings (`player`, `wave`, `enemies`, …) reassigned from every other file. ES module imports are read-only views, so a mechanical script-tag→module conversion breaks every cross-file assignment; the correct fix is a state-object refactor (`G.player = …`) touching thousands of references, verified in-browser. That is its own plan. Nothing in the iOS path requires it — Capacitor wraps the classic-script build as-is. When done later, it unlocks Vite and Three.js ≥ r160 (ESM-only).

## Manual verification after one-shot

1. `open index.html` (or serve) — visual parity vs r128: sky gradient, sun, jet colors, lighting.
2. Settings/best-score/rival persistence across reload.
3. Fonts render with network disabled.
4. After Xcode install: `npx cap open ios`, run on device, check joystick + safe areas.
