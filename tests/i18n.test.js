'use strict';
// Localization gate: EN/ZH/KO key parity, {placeholder} parity, and every literal t('…') / tf('…') /
// radioKey(…, '…') key used by the code exists in EN (so no raw key can reach the screen).
// Tables load through the shared VM loader (tests/lib/i18n.js); edit strings with scripts/i18n.mjs.
const assert = require('assert'), fs = require('fs'), path = require('path');
const I = require('./lib/i18n.js').loadI18N();
const strKeys = L => Object.keys(I[L]).filter(k => typeof I[L][k] === 'string');
const tokens = s => (String(s).match(/\{[a-zA-Z]+\}/g) || []).sort().join(',');

for (const L of ['ZH', 'KO']) {
  const miss = strKeys('EN').filter(k => I[L][k] == null);
  assert.deepStrictEqual(miss, [], L + ' is missing keys: ' + miss.join(' '));
  const extra = strKeys(L).filter(k => I.EN[k] == null);
  assert.deepStrictEqual(extra, [], L + ' has keys EN lacks: ' + extra.join(' '));
  const ph = strKeys('EN').filter(k => tokens(I[L][k]) !== tokens(I.EN[k]));
  assert.deepStrictEqual(ph, [], L + ' {placeholder} mismatch vs EN: ' + ph.join(' '));
}

const JS = path.join(__dirname, '..', 'js');
const src = fs.readdirSync(JS).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(JS, f), 'utf8')).join('\n');
const used = new Set();
for (const m of src.matchAll(/\bt[f]?\(\s*'([A-Za-z0-9_.\-]+)'\s*[,)]/g)) used.add(m[1]);
for (const m of src.matchAll(/\bradioKey(?:Safe)?\([^,()]+,\s*'([A-Za-z0-9_.\-]+)'\s*[,)]/g)) used.add(m[1]);
const unresolved = [...used].filter(k => I.EN[k] == null);
assert.deepStrictEqual(unresolved, [], 'keys used in code but missing from EN: ' + unresolved.join(' '));

console.log('ok - i18n: ' + strKeys('EN').length + ' keys in EN/ZH/KO parity, placeholders match, ' + used.size + ' literal keys resolve');
