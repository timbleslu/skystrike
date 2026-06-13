'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// load js/i18n.js for real (only needs MAX_WINGMEN from globals.js, used in one ZH string)
const i18nSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8');
const sandbox = { MAX_WINGMEN: 6 };
vm.createContext(sandbox);
vm.runInContext(i18nSrc, sandbox);
const I18N = vm.runInContext('I18N', sandbox);

// ---- 1. every t()-style key defined for one language must be defined for the other ----
function flatKeys(dict) {
  return Object.keys(dict).filter(k => k !== 'jet' && k !== 'tech');
}
const enFlat = new Set(flatKeys(I18N.EN));
const zhFlat = new Set(flatKeys(I18N.ZH));
const missingZH = [...enFlat].filter(k => !zhFlat.has(k));
const missingEN = [...zhFlat].filter(k => !enFlat.has(k));
assert.deepStrictEqual(missingZH, [], 'I18N.ZH is missing translations for: ' + missingZH.join(', '));
assert.deepStrictEqual(missingEN, [], 'I18N.EN is missing keys that only exist in ZH: ' + missingEN.join(', '));

// ---- 2. {token} interpolation placeholders must match between EN and ZH ----
function tokens(s) { return new Set(String(s).match(/\{\w+\}/g) || []); }
for (const key of enFlat) {
  const enT = [...tokens(I18N.EN[key])].sort();
  const zhT = [...tokens(I18N.ZH[key])].sort();
  assert.deepStrictEqual(zhT, enT, 'I18N.ZH["' + key + '"] must use the same {tokens} as I18N.EN["' + key + '"]');
}

// ---- 3. every JETS entry has a ZH override for the fields jetText() can render ----
const gsrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'globals.js'), 'utf8');
const jetsBlock = gsrc.slice(gsrc.indexOf('const JETS = ['), gsrc.indexOf('\n];', gsrc.indexOf('const JETS = [')));
const REQUIRED_JET_FIELDS = ['role', 'topSpeed', 'ceiling', 'cannon', 'desc', 'context'];
for (const chunk of jetsBlock.split(/(?=\{ id:')/).slice(1)) {
  const id = chunk.match(/id:'([^']+)'/)[1];
  const zh = I18N.ZH.jet[id];
  assert.ok(zh, 'I18N.ZH.jet is missing a translation for new jet "' + id + '"');
  for (const f of REQUIRED_JET_FIELDS) {
    assert.ok(zh[f], 'I18N.ZH.jet["' + id + '"] is missing "' + f + '"');
  }
  if (!/ability:\s*null/.test(chunk)) assert.ok(zh.abilityDesc, 'I18N.ZH.jet["' + id + '"] is missing "abilityDesc"');
  if (!/passive:\s*null/.test(chunk)) assert.ok(zh.passive, 'I18N.ZH.jet["' + id + '"] is missing "passive"');
}

// ---- 4. every TECH_TREE entry has a ZH override for the fields techText() can render ----
const techBlock = gsrc.slice(gsrc.indexOf('const TECH_TREE = ['), gsrc.indexOf('\n];', gsrc.indexOf('const TECH_TREE = [')));
for (const id of [...techBlock.matchAll(/id:'([^']+)'/g)].map(m => m[1])) {
  const zh = I18N.ZH.tech[id];
  assert.ok(zh, 'I18N.ZH.tech is missing a translation for new tech node "' + id + '"');
  assert.ok(zh.name, 'I18N.ZH.tech["' + id + '"] is missing "name"');
  assert.ok(zh.desc, 'I18N.ZH.tech["' + id + '"] is missing "desc"');
}

console.log('ok - I18N.EN/ZH key parity, {token} parity, and JETS/TECH_TREE ZH overrides are complete');
