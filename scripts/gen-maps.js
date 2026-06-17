/* SKYSTRIKE — gen-maps.js: generate ONE stylized tactical SVG per Operation into
   assets/maps/<opId>.svg. The Operations level-map (ui-flow.js renderLevelMap) uses these
   as the geographic backdrop for the clickable mission dots (positioned by lvl.coords %).

   These are STYLIZED MILITARY/TACTICAL maps, NOT realistic cartography: a dark-navy sea fill,
   a desaturated landmass approximated from the theater, a thin cyan/amber graticule grid, range
   rings + a compass rose + sector labels. viewBox is 0 0 100 100 so the SVG internal units line
   up 1:1 with the dot %-coords (the dots are overlaid by CSS % over the box, independent anyway).

   Self-contained — no network, no external map/tile API. Run:  node scripts/gen-maps.js
   Output is committed by the integrator; this script just guarantees the files exist on disk. */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'maps');

/* Muted tactical palette — dark navy sea, desaturated land, cyan/amber HUD grid.
   Bright mission dots (drawn by CSS in the overlay) pop against this. */
const PAL = {
  sea0: '#06121d', sea1: '#0a1b2a',          // sea gradient (deep -> shallow)
  land: '#1c2b22', landEdge: '#3a5a44',      // desaturated landmass + coastline
  landAlt: '#2a2620', landAltEdge: '#5a4a32', // arid/desert land variant (sunfire)
  ice: '#22303a', iceEdge: '#5a7488',         // snow/ridge land variant (midnight)
  grid: 'rgba(90,150,180,0.14)', gridLit: 'rgba(120,200,230,0.22)',
  amber: 'rgba(210,150,60,0.32)', amberDim: 'rgba(210,150,60,0.16)',
  ring: 'rgba(120,200,230,0.16)', ink: 'rgba(150,200,225,0.55)', inkDim: 'rgba(120,170,200,0.32)',
};

/* shared defs: sea gradient + soft glow + a faint grid pattern, parametrized by id suffix */
function defs(id, sea0, sea1) {
  return `
  <defs>
    <radialGradient id="sea_${id}" cx="50%" cy="42%" r="78%">
      <stop offset="0%" stop-color="${sea1}"/>
      <stop offset="100%" stop-color="${sea0}"/>
    </radialGradient>
    <linearGradient id="vig_${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.35)"/>
    </linearGradient>
  </defs>`;
}

/* tactical graticule: a 10-unit grid, every other line slightly brighter, + edge frame */
function grid() {
  let lines = '';
  for (let v = 10; v < 100; v += 10) {
    const lit = (v % 20 === 0);
    const stroke = lit ? PAL.gridLit : PAL.grid;
    const w = lit ? 0.18 : 0.12;
    lines += `<line x1="${v}" y1="0" x2="${v}" y2="100" stroke="${stroke}" stroke-width="${w}"/>`;
    lines += `<line x1="0" y1="${v}" x2="100" y2="${v}" stroke="${stroke}" stroke-width="${w}"/>`;
  }
  return `<g>${lines}</g>`;
}

/* range rings centered on a focal point (the operation's objective area) */
function rings(cx, cy) {
  let r = '';
  [14, 26, 38].forEach(rad => {
    r += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${PAL.ring}" stroke-width="0.14" stroke-dasharray="1.4 1.8"/>`;
  });
  // crosshair tick at focal point
  r += `<line x1="${cx - 3}" y1="${cy}" x2="${cx + 3}" y2="${cy}" stroke="${PAL.ink}" stroke-width="0.16"/>`;
  r += `<line x1="${cx}" y1="${cy - 3}" x2="${cx}" y2="${cy + 3}" stroke="${PAL.ink}" stroke-width="0.16"/>`;
  return `<g>${r}</g>`;
}

/* compass rose in a corner */
function compass(cx, cy) {
  const a = 6;
  return `<g opacity="0.7">
    <circle cx="${cx}" cy="${cy}" r="${a}" fill="none" stroke="${PAL.inkDim}" stroke-width="0.16"/>
    <path d="M${cx} ${cy - a} L${cx + 1.3} ${cy} L${cx} ${cy + a} L${cx - 1.3} ${cy} Z" fill="${PAL.amber}" stroke="${PAL.ink}" stroke-width="0.1"/>
    <path d="M${cx - a} ${cy} L${cx} ${cy - 1.3} L${cx + a} ${cy} L${cx} ${cy + 1.3} Z" fill="rgba(120,200,230,0.18)" stroke="${PAL.inkDim}" stroke-width="0.1"/>
    <text x="${cx}" y="${cy - a - 1.2}" fill="${PAL.ink}" font-size="2.4" font-family="monospace" text-anchor="middle">N</text>
  </g>`;
}

/* sector label text */
function label(x, y, text, anchor) {
  return `<text x="${x}" y="${y}" fill="${PAL.inkDim}" font-size="2.5" letter-spacing="0.4" font-family="monospace" text-anchor="${anchor || 'start'}">${text}</text>`;
}

/* ---- per-theater landmass paths (simplified, stylized — NOT survey-accurate) ---- */

// IRON VEIL — South China Sea / Daolin Island Chain.
// Open sea center; a mainland coast cutting the W edge, scattered island shapes (a chain) toward
// the NE/center, a larger contested island near the objective. Sea-dominant theater.
function ironVeil() {
  const focal = [60, 44];
  const land = `
    <g>
      <!-- mainland coast (W edge) -->
      <path d="M0 6 L11 10 L8 24 L14 38 L7 52 L13 66 L6 80 L10 94 L0 96 Z"
            fill="${PAL.land}" stroke="${PAL.landEdge}" stroke-width="0.3"/>
      <!-- Daolin contested island (central objective) -->
      <path d="M54 34 L66 31 L72 40 L68 52 L57 55 L50 47 L52 39 Z"
            fill="${PAL.land}" stroke="${PAL.landEdge}" stroke-width="0.3"/>
      <!-- island chain (reefs/islets) -->
      <path d="M76 24 L82 26 L80 33 L73 32 Z" fill="${PAL.land}" stroke="${PAL.landEdge}" stroke-width="0.25"/>
      <path d="M82 60 L88 58 L90 66 L84 67 Z" fill="${PAL.land}" stroke="${PAL.landEdge}" stroke-width="0.25"/>
      <circle cx="34" cy="78" r="2.4" fill="${PAL.land}" stroke="${PAL.landEdge}" stroke-width="0.2"/>
      <circle cx="42" cy="22" r="1.8" fill="${PAL.land}" stroke="${PAL.landEdge}" stroke-width="0.2"/>
      <circle cx="80" cy="42" r="1.5" fill="${PAL.land}" stroke="${PAL.landEdge}" stroke-width="0.2"/>
    </g>`;
  const labels = `${label(2.5, 5, 'MAINLAND COAST')}${label(58, 30, 'DAOLIN I.', 'middle')}${label(86, 23, 'NORTH REEF', 'middle')}${label(50, 97, 'OPEN SEA · APPROACH', 'middle')}`;
  return { theater: 'SOUTH CHINA SEA', sub: 'DAOLIN ISLAND CHAIN', focal, sea0: PAL.sea0, sea1: PAL.sea1, land, labels };
}

// MIDNIGHT MERIDIAN — Vostok Highlands / winter ridgeline.
// Land-dominant: a mountainous landmass filling most of the frame with a ridgeline spine, a frozen
// valley/channel cutting through, sparse water. Ice/snow palette.
function midnightMeridian() {
  const focal = [50, 30];
  const land = `
    <g>
      <!-- highland landmass (fills frame, sea only at corners) -->
      <path d="M-2 14 L20 8 L44 12 L70 7 L96 13 L102 30 L98 60 L102 88 L70 96 L40 92 L14 96 L-2 86 Z"
            fill="${PAL.ice}" stroke="${PAL.iceEdge}" stroke-width="0.3"/>
      <!-- frozen valley channel (darker low ground) -->
      <path d="M18 34 L40 40 L58 36 L78 44 L74 52 L54 48 L36 52 L20 46 Z"
            fill="${PAL.sea1}" stroke="${PAL.iceEdge}" stroke-width="0.2" opacity="0.9"/>
      <!-- ridgeline spine (hatch ticks) -->
      <path d="M22 20 L40 26 L60 20 L80 28" fill="none" stroke="${PAL.iceEdge}" stroke-width="0.3" stroke-dasharray="0.6 1.2"/>
      <path d="M16 64 L38 70 L62 66 L84 72" fill="none" stroke="${PAL.iceEdge}" stroke-width="0.3" stroke-dasharray="0.6 1.2"/>
    </g>`;
  const labels = `${label(50, 18, 'VOSTOK RIDGE', 'middle')}${label(48, 45, 'FROZEN VALLEY', 'middle')}${label(8, 90, 'EXFIL', 'start')}${label(92, 12, 'FORWARD EDGE', 'end')}`;
  return { theater: 'VOSTOK HIGHLANDS', sub: 'WINTER RIDGELINE', focal, sea0: '#0a1622', sea1: '#12202c', land, labels };
}

// SUNFIRE HORIZON — Persian Gulf / fortified peninsula.
// A Gulf body (sea) with a fortified peninsula jutting from the NE, an arid mainland on the E/N,
// a coalition channel to the SW. Arid/desert land palette.
function sunfireHorizon() {
  const focal = [58, 34];
  const land = `
    <g>
      <!-- arid mainland (N + E) -->
      <path d="M30 -2 L60 4 L96 -2 L102 22 L96 44 L100 70 L102 102 L66 102 L70 70 L58 50 L72 30 L52 16 L34 10 Z"
            fill="${PAL.landAlt}" stroke="${PAL.landAltEdge}" stroke-width="0.3"/>
      <!-- fortified peninsula (the objective complex) -->
      <path d="M52 22 L70 24 L78 34 L70 44 L56 46 L50 38 L50 28 Z"
            fill="${PAL.landAlt}" stroke="${PAL.landAltEdge}" stroke-width="0.32"/>
      <!-- SW coalition shoal -->
      <path d="M2 64 L14 62 L12 74 L0 76 Z" fill="${PAL.landAlt}" stroke="${PAL.landAltEdge}" stroke-width="0.25"/>
    </g>`;
  const labels = `${label(62, 36, 'PENINSULA', 'middle')}${label(90, 60, 'MAINLAND', 'end')}${label(28, 92, 'GULF APPROACH', 'middle')}${label(6, 60, 'COALITION', 'start')}`;
  return { theater: 'PERSIAN GULF', sub: 'FORTIFIED PENINSULA', focal, sea0: PAL.sea0, sea1: '#0a1922', land, labels };
}

function buildSVG(id, spec) {
  const [fx, fy] = spec.focal;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
${defs(id, spec.sea0, spec.sea1)}
  <rect x="0" y="0" width="100" height="100" fill="url(#sea_${id})"/>
  ${grid()}
  ${spec.land}
  ${rings(fx, fy)}
  ${compass(88, 14)}
  ${spec.labels}
  <rect x="0" y="0" width="100" height="100" fill="url(#vig_${id})"/>
  <rect x="0.4" y="0.4" width="99.2" height="99.2" fill="none" stroke="${PAL.gridLit}" stroke-width="0.4"/>
  ${label(3, 96.5, spec.theater + ' // ' + spec.sub, 'start')}
</svg>
`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ops = {
    ironVeil: ironVeil(),
    midnightMeridian: midnightMeridian(),
    sunfireHorizon: sunfireHorizon(),
  };
  Object.keys(ops).forEach(id => {
    const svg = buildSVG(id, ops[id]);
    const file = path.join(OUT_DIR, id + '.svg');
    fs.writeFileSync(file, svg, 'utf8');
    console.log('wrote', file, '(' + svg.length + ' bytes)');
  });
  console.log('gen-maps: done — ' + Object.keys(ops).length + ' tactical maps in ' + OUT_DIR);
}

main();
