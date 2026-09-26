/* SKYSTRIKE — i18n.js: localization runtime (EN / Simplified Chinese / Korean). Loaded after globals.js; the string
   tables themselves are js/lang/{en,zh,ko}.js (loaded right after) — edit them with `node scripts/i18n.mjs`.
   Convention: every NEW user-facing string is rendered through t(key). Data-table strings (JETS/TECH_TREE)
   keep their English fields as canonical source and are localized at render time via jetText()/techText(),
   which fall back to the English object field when no ZH/KO override exists. */

let LANG = 'EN';

/* localize one of a data row's text fields. `dict` is I18N[LANG].jet or .tech; `id`+`field` index it.
   Falls back to the English override, then to the live object's own field (canonical EN source). */
function rowText(obj, id, field, group) {
  const L = I18N[LANG] && I18N[LANG][group];
  if (L && L[id] && L[id][field] != null) return L[id][field];
  const E = I18N.EN[group];
  if (E && E[id] && E[id][field] != null) return E[id][field];
  return obj[field] != null ? obj[field] : '';
}
function jetText(j, field) { return rowText(j, j.id, field, 'jet'); }
function techText(n, field) { return rowText(n, n.id, field, 'tech'); }
/* meta-progression data strings (perks/achievements/skins). The data tables in meta.js carry no
   text fields, so the EN copy lives under the 'meta' group and rowText falls through to it. */
function metaText(n, field) { return rowText(n, n.id, field, 'meta'); }

function t(key) {
  const L = I18N[LANG];
  if (L && L[key] != null) return L[key];
  return I18N.EN[key] != null ? I18N.EN[key] : key;
}

const I18N = {};   // filled by js/lang/en.js, zh.js, ko.js (loaded right after this file)

/* small {token} interpolation helper for banner strings */
function tf(key, vars) {
  let s = t(key);
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}

/* localize an airframe generation label (e.g. '5th GEN'); falls back to the raw value */
function genText(gen) {
  if (!gen) return '';
  const L = I18N[LANG];
  if (L && L['gen.' + gen] != null) return L['gen.' + gen];
  return gen;
}






