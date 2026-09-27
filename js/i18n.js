/* SKYSTRIKE — localization runtime. String tables are js/lang/{en,zh,ko}.js (edit via `node scripts/i18n.mjs`). */

let LANG = 'EN';

/* Data-row text (JETS/TECH_TREE/meta): current language, then EN override, then the row's own EN field. */
function rowText(obj, id, field, group) {
  const L = I18N[LANG] && I18N[LANG][group];
  if (L && L[id] && L[id][field] != null) return L[id][field];
  const E = I18N.EN[group];
  if (E && E[id] && E[id][field] != null) return E[id][field];
  return obj[field] != null ? obj[field] : '';
}
function jetText(j, field) { return rowText(j, j.id, field, 'jet'); }
function techText(n, field) { return rowText(n, n.id, field, 'tech'); }
function metaText(n, field) { return rowText(n, n.id, field, 'meta'); }

function t(key) {
  const L = I18N[LANG];
  if (L && L[key] != null) return L[key];
  return I18N.EN[key] != null ? I18N.EN[key] : key;
}

const I18N = {};   // filled by js/lang/*.js

function tf(key, vars) {
  let s = t(key);
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}

function genText(gen) {
  if (!gen) return '';
  const L = I18N[LANG];
  if (L && L['gen.' + gen] != null) return L['gen.' + gen];
  return gen;
}
