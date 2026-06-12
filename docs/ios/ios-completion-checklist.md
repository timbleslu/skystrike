# iOS Readiness Completion Checklist

Implementation complete on `feat/ios-readiness` (2026-06-10). Return here when ready to finish. All steps are sequential; can pause between any two.

---

## Step 1: Browser smoke test

Verify web build works and persists before touching Xcode.

```bash
open index.html
# Or: python3 -m http.server 8000, then http://localhost:8000
```

**Visual parity vs r128:**
- Sky gradient blue (not gray)?
- Sun visible?
- Jet colors correct (red player, green/blue enemies)?
- Lighting natural (not blown out or dark)?

**Fonts render:**
- Orbitron in HUD (speed, altitude, "HANGAR")?
- Share Tech Mono in mono text?
- Works with network disabled (Command+Shift+Delete → Clear offline data in DevTools)?

**Persistence survives reload:**
- Play 30 seconds, kill 1-2 enemies.
- Close tab / reload page.
- Rival stats still there? Best score? Settings (difficulty)?

✅ All three pass → proceed to Step 2.
❌ Any fail → check console (F12), screenshot the error, ask for help.

---

## Step 2: Build & run on device/simulator

Needs Xcode 15+ (App Store).

```bash
cd /Users/timothylu/Claude/Skystrike
npm run build:www           # assemble www/
npx cap sync ios            # sync to Xcode project
npx cap open ios            # open Xcode
```

**In Xcode:**
1. Top-left: verify `App` target selected.
2. Wait for indexing (watch progress bar top-right).
3. Top-left dropdown: pick simulator (iPhone 15 Pro) or plug device.
4. Cmd+R to build & run.
5. Wait ~30 seconds for build to finish.

**Device checklist:**
- [ ] Virtual joystick (bottom-left): tap & drag, jet responds.
- [ ] Touch buttons (top-right): fire, weapon-switch work.
- [ ] HUD doesn't hide behind notch / home indicator.
- [ ] No rubber-band scroll bounce at edges.
- [ ] Fonts match browser.
- [ ] Persistence: kill enemy, app backgrounded/relaunched, stats still there.

After each web-code change: `npm run build:www && npx cap sync ios` in terminal, then Cmd+R in Xcode.

✅ All pass → proceed to Step 3.
❌ Any fail → check Xcode console (bottom panel), screenshot, ask.

---

## Step 3: Storage layer swap (deferred)

**Do NOT do this yet.** Game uses sync calls; Capacitor Preferences is async. Requires:
- Import `@capacitor/preferences`
- Convert `js/storage.js` to async
- Convert all `store.get/set` call sites to `await`
- Likely refactor globals from classic-scripts to ES modules

This is a 2-3 hour task. Mark it as "Post-merge: async storage refactor" in the roadmap if you want. For now, `localStorage` works fine in WKWebView during dev.

---

## Step 4: Merge to main

After device smoke passes:

```bash
git checkout main
git pull                          # if using remote tracking
git merge feat/ios-readiness
# Optional: git push origin main  # if you have a remote
```

✅ Done. iOS scaffolding is live on main.

---

## Returning to this checklist

Clone the current branch state:
```bash
git checkout feat/ios-readiness
```

All tools are in place. `npm run build:www`, `npx cap sync ios`, `npx cap open ios`.
