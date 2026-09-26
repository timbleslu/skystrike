/* Localization CLI — edit strings without opening the 1000-line js/lang/*.js files.
     node scripts/i18n.mjs get <key>                          print the key in EN/ZH/KO
     node scripts/i18n.mjs set <key> --en "…" [--zh "…"] [--ko "…"]   add or replace (top-level string keys)
     node scripts/i18n.mjs rm <key> [<key>…]                  delete from all three languages
     node scripts/i18n.mjs apply <file.json> --lang ZH        bulk-replace {key: string} (e.g. a review pass)
     node scripts/i18n.mjs check                              missing/extra keys, {placeholder} mismatches, unused keys
   New keys are appended at the end of each language table. Nested groups (jet/tech/meta) are edited by hand. */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { loadI18N } = require('../tests/lib/i18n.js');

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const LANGS = ['EN', 'ZH', 'KO'];
const file = L => path.join(ROOT, 'js', 'lang', L.toLowerCase() + '.js');
const STR = String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|` + '`(?:[^`\\\\]|\\\\.)*`)';
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lit = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
const keyRe = k => new RegExp("(['\"])" + esc(k) + "\\1(\\s*:\\s*)" + STR);

function setKey(L, key, val) {
  let s = fs.readFileSync(file(L), 'utf8');
  const re = keyRe(key);
  if (re.test(s)) s = s.replace(re, (m, q, sep) => q + key + q + sep + lit(val));
  else {
    const end = s.lastIndexOf('\n};');
    if (end < 0) throw new Error('no closing }; in ' + file(L));
    s = s.slice(0, end) + '\n  ' + lit(key) + ': ' + lit(val) + ',' + s.slice(end);
  }
  fs.writeFileSync(file(L), s);
}
function rmKey(L, key) {
  const s = fs.readFileSync(file(L), 'utf8');
  const re = new RegExp("[ \\t]*(['\"])" + esc(key) + "\\1\\s*:\\s*" + STR + "\\s*,[ \\t]*\\n?");
  const out = s.replace(re, '').replace(/\n[ \t]*\n(?=[ \t]*\n)/g, '\n');
  fs.writeFileSync(file(L), out);
  return out !== s;
}
function flag(name) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; }
const tokens = s => (String(s).match(/\{[a-zA-Z]+\}/g) || []).sort().join(',');

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'get') {
  const I = loadI18N();
  for (const L of LANGS) console.log(L + ': ' + JSON.stringify(I[L][args[0]]));
} else if (cmd === 'set') {
  const key = args[0]; let n = 0;
  if (!key || key.startsWith('--')) throw new Error('usage: set <key> --en "…" [--zh "…"] [--ko "…"]');
  for (const L of LANGS) { const v = flag(L.toLowerCase()); if (v != null) { setKey(L, key, v); n++; } }
  if (!loadI18N().EN[key]) console.warn('warning: ' + key + ' has no EN value (t() falls back to EN, then the raw key)');
  console.log('set ' + key + ' in ' + n + ' language(s)');
} else if (cmd === 'rm') {
  for (const key of args) console.log(key + ': ' + LANGS.map(L => L + (rmKey(L, key) ? '✓' : '·')).join(' '));
} else if (cmd === 'apply') {
  const L = (flag('lang') || '').toUpperCase(); if (!LANGS.includes(L)) throw new Error('--lang EN|ZH|KO required');
  const map = JSON.parse(fs.readFileSync(args[0], 'utf8')), EN = loadI18N().EN; let ok = 0; const skipped = [];
  for (const [k, v] of Object.entries(map)) {
    if (typeof v !== 'string' || typeof EN[k] !== 'string') { skipped.push(k + ' (not a top-level string key)'); continue; }
    if (tokens(v) !== tokens(EN[k])) { skipped.push(k + ' (placeholders ' + tokens(v) + ' ≠ EN ' + tokens(EN[k]) + ')'); continue; }
    setKey(L, k, v); ok++;
  }
  console.log('applied ' + ok + ' → ' + L + (skipped.length ? '\nskipped:\n  ' + skipped.join('\n  ') : ''));
} else if (cmd === 'check') {
  const I = loadI18N(); let bad = 0;
  const strKeys = L => Object.keys(I[L]).filter(k => typeof I[L][k] === 'string');
  for (const L of ['ZH', 'KO']) {
    const miss = strKeys('EN').filter(k => I[L][k] == null), extra = strKeys(L).filter(k => I.EN[k] == null);
    const ph = strKeys('EN').filter(k => I[L][k] != null && tokens(I[L][k]) !== tokens(I.EN[k]));
    if (miss.length) { bad++; console.log(L + ' missing (' + miss.length + '): ' + miss.join(' ')); }
    if (extra.length) { bad++; console.log(L + ' extra (' + extra.length + '): ' + extra.join(' ')); }
    if (ph.length) { bad++; console.log(L + ' placeholder mismatch: ' + ph.join(' ')); }
  }
  // unused: a key is "used" if its literal appears in js/ or index.html, or it starts with a string prefix the code
  // concatenates ('op.' + id …) — dynamic keys are therefore never flagged (conservative).
  const src = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n') + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const lits = new Set([...src.matchAll(/['"`]([A-Za-z0-9_.\-]+)['"`]/g)].map(m => m[1]));
  const pre = [...src.matchAll(/['"`]([A-Za-z0-9_.\-]+)['"`]\s*\+/g), ...src.matchAll(/`([A-Za-z0-9_.\-]+)\$\{/g)].map(m => m[1]).filter(p => p.length > 2 && /[.\-_]/.test(p));
  const suf = [...lits].filter(x => x.startsWith('.') && x.length > 2);   // e.g. nameKey.replace('.name', '.blurb')
  const unused = strKeys('EN').filter(k => !lits.has(k) && !pre.some(p => k.startsWith(p)) && !suf.some(x => k.endsWith(x)));
  if (unused.length) console.log('possibly unused EN keys (' + unused.length + '): ' + unused.join(' '));
  console.log(bad ? 'i18n check: FAIL' : 'i18n check: OK (' + strKeys('EN').length + ' keys, EN/ZH/KO in parity)');
  process.exit(bad ? 1 : 0);
} else {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
}
