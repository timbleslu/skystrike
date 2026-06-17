/* SKYSTRIKE — Req A audit: count fly-to-waypoint objectives per level across all OPERATIONS.
   A level is flagged REPETITIVE if either:
     (1) it lays >2 fly-to-waypoints (the per-level cap), OR
     (2) it is monotype-navigation — its WHOLE objective set is a single fly-to type (RECON/STEALTH).
   Pure-combat single-type levels (FURBALL/INTERCEPT/STRIKE/DEFEND/ESCORT) are NOT repetitive
   navigation, so the trivial "one objective => same type" case is intentionally excluded.

   Reads the data model directly: a level row carries a single `type` today; after the Req C
   conversion a flagged level carries an ordered `objectives` array of phase descriptors
   (string type OR {type, wp}). The audit reads `objectives` when present, else the single `type`,
   so the SAME script scopes Req C (pre) and verifies it (post).

   Run: node scripts/audit-flyto.mjs   (exit 0 if 0 levels exceed the fly-to cap, else 1)

   Uses CommonJS require via createRequire (this is an .mjs but opmap.js is a CommonJS module). */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { OPERATIONS } = require('../js/opmap.js');

// fly-to-waypoint navigation types and how many waypoints each lays by default.
// RECON lays a ring of N waypoints (missions.js recon.setup: 4 at bounded campaign waves, 5 late).
// STEALTH lays 1 extraction waypoint. An objective may override its count with `wp`.
const FLYTO_DEFAULT = { RECON: 4, STEALTH: 1 };
const NAV_TYPES = new Set(['RECON', 'STEALTH']);

function typeOf(obj) { return typeof obj === 'string' ? obj : obj.type; }
function flyToOf(obj) {
  if (obj && typeof obj === 'object' && obj.wp != null) return obj.wp;   // explicit per-phase override
  return FLYTO_DEFAULT[typeOf(obj)] || 0;
}
function objectivesOf(level) {
  if (Array.isArray(level.objectives) && level.objectives.length) return level.objectives;
  return [level.type];   // legacy single-objective level
}

const rows = [];
for (const op of OPERATIONS) {
  for (const lvl of op.levels) {
    const objs = objectivesOf(lvl);
    const types = objs.map(typeOf);
    const flyTo = objs.reduce((s, o) => s + flyToOf(o), 0);
    const distinct = new Set(types).size;
    const tooMany = flyTo > 2;
    const monotypeNav = distinct === 1 && NAV_TYPES.has(types[0]);
    const reasons = [];
    if (tooMany) reasons.push(`>2 fly-to (${flyTo})`);
    if (monotypeNav) reasons.push(`monotype-nav (${types[0]})`);
    rows.push({
      opId: op.id, levelId: lvl.id, types: types.join('→'), distinct, flyTo,
      flagged: tooMany || monotypeNav, reasons,
    });
  }
}

// ---- report ----
const W = (s, n) => String(s).padEnd(n);
console.log('\n=== FLY-TO-WAYPOINT AUDIT (per level) ===\n');
let curOp = null;
for (const r of rows) {
  if (r.opId !== curOp) { curOp = r.opId; console.log(`-- ${curOp} --`); }
  const flag = r.flagged ? `⚠ FLAG: ${r.reasons.join(', ')}` : 'ok';
  console.log(`  ${W(r.levelId, 14)} types=${W(r.types, 34)} distinct=${r.distinct}  flyTo=${r.flyTo}  ${flag}`);
}

const offenders = rows.filter(r => r.flagged);
const overCap = rows.filter(r => r.flyTo > 2);

console.log('\n=== OFFENDER LIST (scopes Req C — do NOT touch non-flagged levels) ===');
if (offenders.length === 0) console.log('  (none)');
for (const r of offenders) console.log(`  ${r.opId}.${r.levelId} — ${r.reasons.join(', ')}`);

console.log('\n=== SUMMARY ===');
console.log(`  levels total:                ${rows.length}`);
console.log(`  flagged repetitive:          ${offenders.length}`);
console.log(`  levels with >2 fly-to:       ${overCap.length}${overCap.length ? '  [' + overCap.map(r => r.opId + '.' + r.levelId).join(', ') + ']' : ''}`);

const pass = overCap.length === 0;
console.log(`\n  CAP CHECK: ${pass ? 'PASS — 0 levels exceed the fly-to-waypoint cap' : 'FAIL — ' + overCap.length + ' level(s) exceed the cap (>2 fly-to-waypoints)'}\n`);
process.exit(pass ? 0 : 1);
