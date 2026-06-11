/* SKYSTRIKE — storage.js: single persistence seam.
   Wraps localStorage today; swap these internals for Capacitor Preferences on iOS
   (WKWebView localStorage is evictable under storage pressure). Loaded first. */

const store = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (e) {} },
};
