# Skystrike on iOS (Capacitor)

The game ships as a static web build (`www/`) wrapped by Capacitor. No bundler — `scripts/build-www.sh` just copies `index.html`, `styles.css`, `js/`, and `vendor/` into `www/`.

## Prerequisites

- Xcode 15+ (App Store)
- Capacitor 7 generates a Swift Package Manager project (`ios/App/CapApp-SPM`) — CocoaPods is **not** required.

## Build & run

```bash
npm run build:www      # assemble www/ from source
npx cap sync ios       # copy www/ into the iOS project + update plugins
npx cap open ios       # open ios/App in Xcode
```

In Xcode:

1. Select the `App` target → Signing & Capabilities → pick your Team.
2. Choose a simulator or plugged-in device and Run.

Repeat `npm run build:www && npx cap sync ios` after every web-code change; Xcode picks up the new `public/` assets on the next run.

## Storage caveat (before App Store release)

WKWebView `localStorage` can be evicted under storage pressure. All persistence already flows through the seam in `js/storage.js` (`store.get`/`store.set`) — swap its internals for [`@capacitor/preferences`](https://capacitorjs.com/docs/apis/preferences) before shipping. No other file may touch storage (enforced by `tests/storage.test.js`).

## Manual device checklist

- Virtual joystick + touch buttons respond.
- HUD respects notch / home-indicator safe areas (`viewport-fit=cover` + `env(safe-area-inset-*)` padding).
- No rubber-band scrolling or text-selection callouts.
- Fonts render with airplane mode on (vendored in `vendor/fonts/`).
- Settings / best score / rival survive an app relaunch.
