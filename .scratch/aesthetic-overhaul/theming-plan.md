# SKYSTRIKE — Theming system: 5 visual languages × 5 color schemes

Two independent Settings toggles, mix & match, persisted via storage seam.

## Axes
**Visual Language** (`<html data-skin>`): treatment = fonts, glow, panel shape, scanlines, borders.
- `futuristic` (DEFAULT = current glass cockpit; no overrides)
- `analog` — vintage warbird: no glow, no scan, brushed-metal panels, serif/slab, square bezels, warm
- `manual` — field manual/stencil: flat matte, no glow, square corners, stencil caps, olive/paper tint
- `flat` — modern flat: clean system sans, no glow/scan, soft-rounded, generous, minimal chrome
- `blueprint` — drafting schematic: grid-paper ground, fine line borders, no glow, thin strokes

**Color Scheme** (`<html data-palette>`): palette = the `--*-rgb` triplets + a few hex.
- `amber` (DEFAULT) 255,185,56 / green 77,255,160 / field 6,10,9
- `cyan` — 25,240,212 / 11,213,255 / field 4,7,14 (original look)
- `phosphor` — mono green 70,255,140 everything / field 2,8,4
- `ice` — 150,210,255 / white 230,240,255 / charcoal field 10,14,18
- `red` — 255,90,70 / amber 255,170,60 / field 10,5,5 (night-ops)

## Architecture
### Color = tokenize then CSS-data-attr
1. Restructure `:root` → `--X-rgb` triplets are the source; hex tokens derived `--primary: rgb(var(--primary-rgb))`; glows/hairlines `rgba(var(--primary-rgb), a)`.
2. Sweep ALL rgba literals in styles.css → `rgba(var(--<role>-rgb), a)` so glows/shadows follow palette.
3. `[data-palette="x"]{ --primary-rgb:..; --ok-rgb:..; --base-rgb:..; --surface-*:..; --ink-*:.. }` blocks.
4. Canvas HUD (hud.js reads JS `HUD` object) — JS `PALETTES` map; `applyPalette` reassigns `HUD.*` triplets + redraw.

### Visual language = CSS treatment overrides
`[data-skin="x"] ...{ }` override blocks. Futuristic = default (no block). Each skin tunes: `--scan-opacity`, glow tokens→none, `--disp`/`--mono`/HUDFONT font stacks, clip-path bevels→square/round, panel backgrounds, letter-spacing. Fonts: reuse Orbitron + Share Tech Mono + system stacks (serif for analog, system-ui for flat) — no new vendoring.

### Wiring
- storage seam: `skystrike_skin`, `skystrike_palette`.
- globals.js: `PALETTES` (canvas triplets + HUDFONT per skin), `applySkin(id)`, `applyPalette(id)`.
- ui.js: two `seldrop` selects in Settings (manual tab); read in loadSettings, write on change; apply at boot.
- index.html: two `.srow` rows with `<select>`.
- i18n.js: EN+ZH labels (settings.skin / settings.palette + option names).

## Build order
1. [x] Tokenize :root → `--*-rgb` triplets; swept 9 rgba families in styles.css to `rgba(var(--role-rgb),a)` (glows follow palette)
2. [x] 5 palette CSS blocks (`:root[data-palette]`) — amber default + cyan/phosphor/ice/red
3. [x] 5 skin CSS blocks (`:root[data-skin]`) — futuristic default + analog/manual/flat/blueprint
4. [x] globals.js: PALETTES (canvas triplets) + SKIN_HUDFONT + applySkin/applyPalette; HUDFONT now `let`
5. [x] index.html 2 selects (setSkin/setPalette); ui.js boot-apply stored + onChange; storage keys skystrike_skin/palette
6. [x] i18n EN+ZH (set.skin / set.palette) + applyLang setTxt
7. [x] verify: npm test green, node --check all, matrix screenshots (analog/manual/flat/blueprint/futuristic × amber/cyan/phosphor/ice/red), in-flight canvas recolor confirmed, default unchanged, zero boot errors

## STATUS: COMPLETE (not committed — awaiting review)
25 combos (5 skins × 5 palettes), independent + mix-and-match, persisted, DOM + canvas both follow.
Default futuristic+amber byte-for-byte unchanged. Settings → Visual style + Color scheme dropdowns.
Notes: option labels hardcoded English (matches existing HUD-size dropdown precedent); boss-magenta + AWACS/CCA blue kept fixed across palettes.

## Success criteria
- Both selects in Settings persist + apply at boot.
- Palette swap recolors DOM **and** canvas HUD (glows included — no stuck amber).
- Each skin visibly distinct treatment; futuristic unchanged from current.
- npm test green; no teal regressions in default amber/futuristic.
