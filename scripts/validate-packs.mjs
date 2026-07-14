/* CF content-factory — the candidate-pack gate. Validates every pack in js/content-packs.js with
   the SAME pure core (applyContentPacks → validatePack) the game runs at load, printing a verdict
   per candidate and the merged content totals. Any rejected candidate exits 1.
   Run this after authoring/editing a pack, before npm test.
   Usage: node scripts/validate-packs.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { FORMATIONS, WEEKLY_MODIFIERS, applyContentPacks } = require('../js/core.js');
const { CONTENT_PACKS } = require('../js/content-packs.js');

const forms = JSON.parse(JSON.stringify(FORMATIONS));
const rt = applyContentPacks(CONTENT_PACKS, forms, WEEKLY_MODIFIERS);
for (const id of rt.applied) console.log('ok   - ' + id);
for (const r of rt.rejected) {
  console.log('FAIL - ' + r.id);
  for (const e of r.errors) console.log('         ' + e);
}
const newForms = Object.keys(forms).filter(k => !FORMATIONS[k]);
console.log(`\n${rt.applied.length}/${CONTENT_PACKS.length} packs valid · +${newForms.length} formations (${newForms.join(', ') || 'none'}) · +${rt.modPool.length - WEEKLY_MODIFIERS.length} weekly modifiers · +${rt.wavePatterns.length} wave patterns`);
console.log(rt.rejected.length ? 'PACK VALIDATION FAIL' : 'PACK VALIDATION PASS');
process.exit(rt.rejected.length ? 1 : 0);
