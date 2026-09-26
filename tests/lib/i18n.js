'use strict';
// Shared Node loader for the localization tables: evaluates js/i18n.js + js/lang/{en,zh,ko}.js in a VM
// (the browser load order) and returns the REAL I18N object — tests never regex-scrape the source.
const vm = require('vm'), fs = require('fs'), path = require('path');
const JS = path.join(__dirname, '..', '..', 'js');
const LANG_FILES = ['i18n.js', 'lang/en.js', 'lang/zh.js', 'lang/ko.js'];
function loadI18N() {
  const g = fs.readFileSync(path.join(JS, 'globals.js'), 'utf8').match(/MAX_WINGMEN\s*=\s*(\d+)/);
  const ctx = { MAX_WINGMEN: g ? +g[1] : 3 };   // the only runtime global the tables interpolate
  vm.createContext(ctx);
  vm.runInContext(LANG_FILES.map(f => fs.readFileSync(path.join(JS, f), 'utf8')).join('\n;\n') + '\n;this.__I18N = I18N;', ctx);
  return JSON.parse(JSON.stringify(ctx.__I18N));   // plain objects in this realm
}
module.exports = { loadI18N, LANG_FILES };
