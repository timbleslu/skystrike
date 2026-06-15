# SKYSTRIKE — Glass Cockpit UI Overhaul

**Direction:** F-35 glass-cockpit avionics. Refined, restrained, precise.
**Scope:** full 2D UI layer — menus, live HUD, boot/gates, global type+color. (3D scene already overhauled.)
**Intensity:** Balanced — bold at load-in / hero / key transitions, calm during play.

## Design system

### Palette (replaces cyan-teal)
Two-tone avionics: **amber = active/attention signal**, **green = nominal/structure**, on green-black.

| token | old (teal) | new (glass cockpit) | role |
|-------|-----------|---------------------|------|
| --base | #04070e | **#060a09** | green-black field |
| --surface-1 | #0a1018 | **#0b1311** | raised panel |
| --surface-2 | #0e1722 | **#0f1916** | card / modal body |
| --surface-3 | #13202e | **#15211d** | hover / active |
| --hairline | rgba(91,138,134,.34) | **rgba(120,170,140,.24)** | faint green MFD grid line |
| --hairline-lit | rgba(25,240,212,.55) | **rgba(255,185,56,.55)** | amber when active/focused |
| --ink-hi | #eafffb | **#f6fff4** | warm-white headings/hero numerals |
| --ink | #bdeee6 | **#cfe6d6** | pale-green body |
| --ink-dim | #5b8a86 | **#6f9180** | muted-green labels |
| --ink-on-primary | #04070e | **#1a1200** | dark text on amber fill |
| --primary | #19f0d4 | **#ffb938** | MFD amber — brand/active signal |
| --primary-bright | #0bd5ff | **#ffd36b** | hot amber |
| --primary-deep | #0a8e84 | **#b9781a** | pressed / shadow |
| --danger | #ff394b | #ff3b3b | (keep) incoming/low-HP/fail |
| --warn | #ff8c2b | **#ff7a1f** | orange caution (distinct from amber primary) |
| --ok | #46ff8c | **#4dffa0** | HUD green — nominal / success / secondary |
| --info | #0bd5ff | **#5ad1ff** | cool data accent (sparse, for contrast) |
| --reward | #ffe14d | #ffe14d | (keep) gold: SP/combo/grade/stars |
| --locked | #4a5d6b | **#4a5d54** | desaturated steel-green |
| --rival | #ff5a2a | #ff5a2a | (keep) nemesis |

Glows softer (amber, not neon):
- --glow-primary: `0 0 18px rgba(255,185,56,.40)`
- --glow-danger / --glow-reward: retune rgba to match.

### Hardcoded teal literals to sweep
styles.css (~63): `rgba(25,240,212,*)`→amber `rgba(255,185,56,*)`; `rgba(11,213,255,*)`→`rgba(255,211,107,*)`; `rgba(45,255,176,*)` (wing teal)→green `rgba(77,255,160,*)`; bare `#19f0d4/#0bd5ff`→amber.
hud.js HUD object (hud.js:5): primary `25,240,212`→`255,185,56`; primaryBright `11,213,255`→`255,211,107`; ok `70,255,140`→`77,255,160`; velvec `0,255,170`→keep green; ink `189,238,230`→`207,230,214`; dim `91,138,134`→`111,145,128`.
hud.js literals: `150,255,235`, `70,255,200`, `25,240,212,*` (radar bg lines) → amber/green.

### Typography
Unify on **Share Tech Mono** (the avionics voice) for both --disp and --mono. Retire Orbitron from active use (leave @font-face so nothing breaks). Hierarchy via size/weight/tracking/case. Tighten display tracking slightly for precision.

### Panel / treatment (balanced refinement)
- Thinner hairlines, calmer amber glow (no neon bloom).
- MFD corner ticks on key panels (L-bracket pseudo-elements).
- Keep CRT/scanline but dial amber, lower chroma.
- Hero moments: lang gate boot-in, hangar title, LAUNCH — staggered reveal. Calm in-flight.

## Build order (sequential — shared files)
1. [x] styles.css :root tokens + fonts (amber primary, green nominal, green-black field; unified Share Tech Mono)
2. [x] styles.css teal-literal sweep (63 literals + vignette/flash/meter/radar/wing/lang-gate bg)
3. [x] hud.js palette + literal sweep (HUD object + radar wedge/rings/sweep + wing marker + player blip; ui.js connectors + FAM_C; globals.js core family)
4. [x] panel treatment + hero motion: MFD corner ticks on the 4 HUD quadrants + lang-gate staggered power-on reveal
5. [x] verify: npm test green, node --check js/hud.js OK, screenshots confirm. Final teal scan CLEAN.

## STATUS: COMPLETE (not yet committed — awaiting review)
Verified: amber/green glass cockpit across HUD, hangar, lang gate, meta. No teal remaining. Tests green.
Intentionally-kept cool accents: shield blue, AWACS datalink blue, CCA-drone electric blue, EW/tac family purples (avionics multi-color convention).
Not done (out of scope / could extend): per-modal corner-frame treatment, tech-tree node restyle beyond recolor, custom display font (kept Share Tech Mono unified).

## Success criteria
- No teal/cyan remaining in UI (amber/green only; red/gold/blue-info as semantic accents).
- npm test green. hud.js parses. Boots past lang gate.
- Reads as deliberate glass-cockpit, not recolored generic HUD.
