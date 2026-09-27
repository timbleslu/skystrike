/* SKYSTRIKE — storage.js: the only localStorage access. Swap for Capacitor Preferences on iOS (WKWebView localStorage is evictable). */

const store = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (e) {} },
};
