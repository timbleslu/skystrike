# SKYSTRIKE // ACE PROTOCOL — UI Design Spec

**Author:** UI Designer · **Date:** 2026-06-15 · **Branch:** `aesthetic-overhaul`
**Status:** SPEC-ONLY. No code in this doc is committed; the Frontend Developer implements it next.
**Scope:** Visual system only (look, not copy). Every user-facing string already routes through `t(key)` / `jetText` / `techText` — we touch CSS in `styles.css`, classes/structure in `index.html` + `js/ui.js`, and canvas literals in `js/hud.js`. No build step, no framework, no preprocessor, no CDN fonts.

**Design thesis:** The bones are right — Orbitron + Share Tech Mono on near-black with cyan signal glow already reads "military tech-readout." What makes it look *amateur* is that the system is **undisciplined**: ad-hoc hex everywhere instead of named roles, ~9 different spacing values picked by eye, every warning rendered at the same weight (so MISSILE looks like a weather blip), and no visual hierarchy on the hangar (five buttons read as equals). The fix is **discipline, not reinvention**: rationalize the existing palette into tokens, impose one spacing scale, and add ONE new idea — a **tiered signal system** (chrome → status → survival) that the HUD, warnings, and the debrief all obey. That single move turns it from "a bunch of cyan boxes" into "a designed instrument."

---

## 1. Current-state audit

### 1a. Tokens that exist today (`styles.css:2–8`)
```
--cy:#19f0d4  --cy2:#0bd5ff        (primary cyan + brighter cyan)
--ink:#04070e  --ink2:#0a1018      (base black + raised black)
--warn:#ff8c2b  --red:#ff394b      (amber / red)
--grn:#46ff8c  --yel:#ffe14d  --mag:#ff45c8
--txt:#bdeee6  --dim:#5b8a86       (body ink / muted ink)
--disp:'Orbitron',…  --mono:'Share Tech Mono',…
```
Plus the runtime var `--hud-scale` (DOM corner panels, `styles.css:32–37`) and the canvas twin `hudK()` (`globals.js`), and `HUDFONT = "'Share Tech Mono', monospace"` (`globals.js:366`).

**Verdict:** a genuinely good starting palette and the right two typefaces (both ZH-safe via fallback — see §2b). The problem is *coverage and consistency*, not taste.

### 1b. Top visual problems (each a fix target)

| # | Problem | Evidence (`file:line`) |
|---|---|---|
| A | **No semantic color layer.** Components reach for `--red`/`--warn`/`--cy` directly, so "this is danger" vs "this is the brand" is decided per-element. Canvas HUD is *worse*: it hard-codes ~50 unique rgba literals (`rgba(255,64,96,…)` lock, `rgba(255,55,55,…)` locked, `rgba(0,255,170,…)` velocity vector) that do **not** match the CSS tokens — the red in CSS is `#ff394b`, the red on canvas is `255,55,55` AND `255,64,96` AND `255,70,70`. Three reds for one concept. | `styles.css:3–4`; `hud.js:305,312,315,345` |
| B | **Ad-hoc spacing.** Padding/margins are eyeballed: `.panel` `12px 14px`, `#launch` `15px 54px`, `.ghostbtn` `14px 22px`, `.dbtn` `8px 18px`, hangar margins `0 0 18px`, `margin-top:22px/26px`, `#warns top:86px`. No scale → nothing aligns to a grid. | `styles.css:38,207,214,251,254,211,207,86` |
| C | **Flat warning hierarchy (UX-05/06).** Every warning is the same `.warn` chip — only the *color class* changes. A MISSILE-incoming alert and a "combo extended" blip render at identical weight/position/animation. Survival signals don't win. | `styles.css:87–95` (`.warn`, `.warn.red`, `.warn.cyan` all same box) |
| D | **No primary path on hangar (UX-02).** `#launch` is a solid cyan button but it sits in `.hbtns` (a flex row, `gap:14px`) as a *sibling* of two ghost buttons; difficulty/env/mode/callsign/emblem/carousel/rival all stack *above* it with equal visual weight. The eye has no anchor. | `styles.css:213` (`.hbtns`), `index.html:89–155` |
| E | **First screen sells nothing (UX-01).** `#langSelect` is `SKYSTRIKE` + "SELECT LANGUAGE" + two ghost buttons on black. No tagline, no jet, no hook. Confirmed by screenshot: all three `ui-look-*.png` frames are this same screen. | `index.html:391–401`; screenshots |
| F | **Debrief leads with failure (UX-10).** `#gameover` `<h1>` is "MISSION FAILED" in 86px red (`.gowrap h1`, `--red`, glow). The grade/stars/SP reward block renders *below* it, smaller. The retention payload is buried under a death notice. | `styles.css:276`; `index.html:157–174` |
| G | **In-flight keybind ribbon (UX-05).** `#hint` dumps the full 13-key bind string permanently at screen bottom during flight. Pure chrome competing with combat. | `index.html:61`; `styles.css:101` |
| H | **Locked state is just `:disabled` opacity.** BOSS RUSH (UX-07) and locked jets use `.ghostbtn.disabled{opacity:.45}` — dimmed, not *designed*. No "locked, here's how to unlock" affordance. | `styles.css:216` |
| I | **No radius/border/glow/elevation tokens.** Borders are re-declared inline (`1px solid rgba(91,138,134,.5)` appears 6+ times with slightly different alphas: `.4`, `.5`, `.35`, `.3`). Glows are bespoke `box-shadow` per element. | `styles.css:214,254,364,256,43` |
| J | **No motion vocabulary.** Durations are sprinkled (`.2s`, `.12s linear`, `.3s`, `.15s`, `.55s`, `.5s`) with no shared scale; the Whimsy/juice agent has nothing to build on. | `styles.css:210,44,255,87,326-style` |

---

## 2. Design system / tokens

Drop this block into `styles.css :root`, **keeping the existing short aliases** (`--cy`, `--red`, etc.) so nothing breaks on day one, then migrate components to the semantic names. New tokens are additive.

### 2a. Color

```css
:root{
  /* ---- BASE / SURFACE (near-black field, raised panels) ---- */
  --base:        #04070e;   /* page black — was --ink */
  --surface-1:   #0a1018;   /* raised panel — was --ink2 */
  --surface-2:   #0e1722;   /* card / modal body */
  --surface-3:   #13202e;   /* hover / active panel */
  --hairline:    rgba(91,138,134,.34);  /* THE canonical 1px border (kills the .3/.35/.4/.5 drift) */
  --hairline-lit:rgba(25,240,212,.55);  /* border when focused/active */

  /* ---- INK (text) ---- */
  --ink-hi:   #eafffb;   /* headings / hero numerals */
  --ink:      #bdeee6;   /* body — was --txt */
  --ink-dim:  #5b8a86;   /* labels / secondary — was --dim */
  --ink-on-primary:#04070e; /* text on a cyan fill */

  /* ---- BRAND / PRIMARY (cyan signal) ---- */
  --primary:      #19f0d4;  /* was --cy */
  --primary-bright:#0bd5ff; /* was --cy2 */
  --primary-deep: #0a8e84;  /* pressed / shadow side of gradients */

  /* ---- SEMANTIC SIGNAL ROLES (use these, not raw hex) ---- */
  --danger:  #ff394b;   /* incoming missile, low HP, MISSION FAILED — was --red */
  --warn:    #ff8c2b;   /* caution: stall, ammo low, lock-on-you building */
  --ok:      #46ff8c;   /* clear, success, wave complete — was --grn */
  --info:    #0bd5ff;   /* neutral status, AWACS, tips */
  --reward:  #ffe14d;   /* combo, SP, grade, stars — was --yel */
  --locked:  #4a5d6b;   /* desaturated steel — locked content (NOT just dimmed cyan) */
  --rival:   #ff5a2a;   /* nemesis / hostile-ace identity — was the bespoke #ff5a2a */

  /* ---- GLOW alpha helpers (reuse, don't re-invent box-shadows) ---- */
  --glow-primary: 0 0 24px rgba(25,240,212,.45);
  --glow-danger:  0 0 22px rgba(255,57,75,.55);
  --glow-reward:  0 0 22px rgba(255,225,77,.55);

  /* fonts unchanged */
  --disp:'Orbitron','Arial Narrow',sans-serif;
  --mono:'Share Tech Mono','Courier New',monospace;
}
```

**Canvas-HUD equivalents (for `js/hud.js` — these are hex/rgb strings, NOT CSS vars).** Define a small const map at the top of `hud.js` so the canvas stops hard-coding three different reds:
```js
const HUD = {
  primary:'25,240,212',  primaryBright:'11,213,255',
  danger:'255,57,75',    warn:'255,140,43',
  ok:'70,255,140',       reward:'255,225,77',
  velvec:'0,255,170',    ink:'189,238,230',  dim:'91,138,134',
  rival:'255,90,42'
};
// usage: ctx.strokeStyle = 'rgba('+HUD.danger+',1)';
```
This is the single most consistency-improving canvas change: **one red** (`255,57,75`) for lock+locked+missile, matching CSS `--danger`. The lock reticle currently uses `255,64,96` (line 345) and `255,55,55` (line 305) and `255,70,70` (line 315) — collapse all to `HUD.danger`.

### 2b. Type

Two vendored families only (confirmed in `vendor/fonts/fonts.css`): **Orbitron** (variable, weights 500/700/900) and **Share Tech Mono** (400). Both render Latin; ZH characters fall through to the system CJK font via the existing `'Arial Narrow'`/`'Courier New'` → system stack — **so all caps-tracked ZH must use generous `letter-spacing` only on Latin runs.** Rule below.

| Role | Family | Size (rem / px) | Weight | letter-spacing | Notes |
|---|---|---|---|---|---|
| Display / hero title | Orbitron | `clamp(2.5rem,6vw,4.5rem)` / 40–72px | 900 | `0.18em` Latin | SKYSTRIKE wordmark, screen `<h1>` |
| Heading | Orbitron | `1.5rem` / 24px | 700 | `0.12em` | panel titles, modal headers |
| Subhead / eyebrow label | Orbitron | `0.625rem` / 10px | 700 | `0.25em` | the `.lab`/`.dlab` tech-readout caps |
| Stat numeral (hero) | Orbitron | `2.5rem` / 40px | 900 | `0` | speed/alt big readouts, grade letter |
| Stat numeral (small) | Orbitron | `1.5rem` / 24px | 900 | `0` | score/RD/wave |
| Button label | Orbitron | `0.75rem` / 12px | 700 | `0.16em` | all CTAs |
| Body | Share Tech Mono | `0.8125rem` / 13px | 400 | `0.02em` | descriptions, hints, manual body |
| Data / HUD readout | Share Tech Mono | `0.625–0.6875rem` / 10–11px | 400 | `0.06em` | callsigns, ammo, radar text |

Define as scale tokens for reuse:
```css
:root{
  --fs-display:clamp(2.5rem,6vw,4.5rem); --fs-h1:2.25rem; --fs-h2:1.5rem;
  --fs-stat-hero:2.5rem; --fs-stat:1.5rem; --fs-body:0.8125rem;
  --fs-label:0.625rem; --fs-data:0.6875rem; --fs-btn:0.75rem;
  --ls-display:0.18em; --ls-caps:0.25em; --ls-btn:0.16em; --ls-body:0.02em;
}
```
**ZH legibility rule (hard):** any element that may hold ZH copy (`#hangarSub`, `.dlab`, `.warn`, manual body, banners) must NOT exceed `letter-spacing:0.12em` and must keep `font-size ≥ 13px` for body / `≥ 11px` for labels — Chinese glyphs at 10px + 0.25em tracking are illegible (the current `.dlab` at 10px/3px is borderline; raise to 11px when ZH is active is acceptable but the simplest safe rule is 11px/0.18em for label role). Caps tracking above `0.18em` is **Latin-only** — gate it behind `:lang(en)` if needed, or simply cap all tracking at `0.18em` globally (recommended — the techy look survives).

### 2c. Spacing — one 4px scale, replaces every ad-hoc px

```css
:root{
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px;
  --sp-5:24px; --sp-6:32px; --sp-7:48px; --sp-8:64px;
}
```
Mapping of current → token (the dev applies these mechanically):
- `.panel{padding:12px 14px}` → `padding:var(--sp-3) var(--sp-4)` (12/16)
- `#launch{padding:15px 54px}` → `padding:var(--sp-4) var(--sp-7)` (16/48), keep visually dominant
- `.ghostbtn{padding:14px 22px}` → `padding:var(--sp-3) var(--sp-5)` (12/24)
- `.dbtn{padding:8px 18px}` → `padding:var(--sp-2) var(--sp-4)` (8/16)
- hangar cluster margins `0 0 18px` → `0 0 var(--sp-5)` (24)
- `#warns{top:86px}` → `top:var(--sp-8)` (64) — moves the warning stack tighter under the top panels
- `.hbtns{gap:14px}` → `gap:var(--sp-4)`; `.tr{gap:24px}` → `gap:var(--sp-5)`

### 2d. Radius, borders, glow, scanline/CRT

```css
:root{
  --r-sm:2px;    /* chips, meters — keep it sharp/military, not rounded */
  --r-md:4px;    /* buttons, cards */
  --r-lg:6px;    /* modals */
  --bevel:10px;  /* the clip-path corner-cut size, unify the 8/12px drift */
  --bd:1px solid var(--hairline);
  --bd-lit:1px solid var(--hairline-lit);
}
```
- **Corner-cut (chamfer)** is the signature shape. Standardize ONE bevel via `--bevel` used in every `clip-path:polygon(...)`. Current values drift (8px on `.ghostbtn`, 12px on `#launch`, 7px on `.meter`). Use `--bevel` (10px) for buttons/cards; keep the meter's small `7px` skew as-is (it's a different effect).
- **Scanline / CRT / vignette — tokenize intensity** so it can be turned down for accessibility and is consistent:
```css
:root{
  --scan-opacity:0.18;   /* the dark scanline band alpha (was hard 0.18) */
  --crt-flicker:0.92;    /* flicker rest opacity */
  --vignette-edge:rgba(2,8,14,.92); /* corner darkness */
}
```
Wire `#crt` (`styles.css:23–27`) and `#vignette` to read these. Add `@media (prefers-reduced-motion:reduce){ #crt{animation:none} }` and respect a future "reduce CRT" setting by setting `--scan-opacity:0`. The chromatic-aberration `#crt::after` stays but should be gated by the same reduced-motion query.

### 2e. Motion tokens (vocabulary for the Whimsy/juice agent)

```css
:root{
  --dur-instant:80ms;   /* meter fills, value ticks */
  --dur-fast:150ms;     /* hovers, toggles, button states */
  --dur-base:250ms;     /* panel/modal fade, banner */
  --dur-slow:500ms;     /* screen transitions, debrief reveal */
  --ease-out:cubic-bezier(.2,.8,.2,1);     /* default UI */
  --ease-in-out:cubic-bezier(.65,.05,.36,1);
  --ease-snap:cubic-bezier(.2,1.4,.3,1);   /* overshoot pop (banners, grade reveal) */
}
```
Replace `.12s linear` meter transition with `var(--dur-instant)`, `.2s` hovers with `var(--dur-fast) var(--ease-out)`, modal `.3s fadein` with `var(--dur-base)`. The existing `bpop`/`wflash`/`lowblink` keyframes stay; just re-time them off these tokens. **The juice agent owns the actual choreography** — this only fixes the vocabulary so everyone uses the same four durations.

---

## 3. Component specs

All components below use ONLY tokens from §2. States: default / hover / active / disabled. Where a class exists today I note the migration.

### 3a. Primary button (`.btn-primary`, migrate `#launch`)
The single most important button in the app. It must be unmistakably the dominant action on any screen it appears on.
- **default:** `background:linear-gradient(100deg,var(--primary-bright),var(--primary))`; `color:var(--ink-on-primary)`; `font:700 var(--fs-btn)/1 var(--disp)`; `letter-spacing:var(--ls-btn)`; `padding:var(--sp-4) var(--sp-7)`; `clip-path` chamfer using `--bevel`; `box-shadow:var(--glow-primary)`; no border.
- **hover:** `box-shadow:0 0 46px rgba(25,240,212,.9)`; `transform:translateY(-1px) scale(1.02)`; `transition:var(--dur-fast) var(--ease-out)`.
- **active:** `transform:scale(.99)`; gradient shifts toward `--primary-deep`.
- **disabled:** fill → `--locked`; `color:var(--ink-dim)`; no glow; `cursor:not-allowed`.

### 3b. Ghost button (`.ghostbtn`, keep class)
Secondary actions. Must read as clearly subordinate to primary.
- **default:** `background:transparent`; `border:var(--bd)`; `color:var(--primary)`; `font:700 var(--fs-btn) var(--disp)`; `letter-spacing:var(--ls-btn)`; `padding:var(--sp-3) var(--sp-5)`; chamfer `--bevel`.
- **hover:** `border:var(--bd-lit)`; `background:rgba(25,240,212,.08)`; `box-shadow:var(--glow-primary)`.
- **active:** `background:rgba(25,240,212,.14)`.
- **disabled:** see Locked treatment §3l — ghost buttons that are *locked* (BOSS RUSH) get the locked treatment, not plain opacity.

### 3c. Panel / card (`.panel`, `.card`)
- HUD `.panel` (corner clusters): `background:transparent` (overlay on 3D), `padding:var(--sp-3) var(--sp-4)`. Add a subtle `backdrop-filter:blur(2px)` ONLY behind the tl HP cluster and tr stats so survival data stays legible over bright sky — keep it off the rest to preserve the "drawn on glass" look.
- Menu `.card` (jet card, meta card, modal body): `background:var(--surface-2)`; `border:var(--bd)`; `border-radius:var(--r-md)`; `padding:var(--sp-5)`; optional top accent rule `box-shadow:inset 0 2px 0 var(--primary-deep)`.

### 3d. Stat readouts + bar meters (HP / SHD / THR) (`.barrow`, `.meter`, `.big`, `.stat`)
- Keep the skewed-polygon meter shape (`clip-path` with 7px skew) — it's good.
- **Token the fills** to semantic roles:
  - HP `.meter.hp>div`: `linear-gradient(90deg,var(--primary),var(--ok))` (healthy). Low state → `linear-gradient(90deg,var(--danger),var(--warn))` + `--glow-danger` + `lowblink` (existing `#hpbar.low`, keep).
  - SHD `.meter.shd>div`: keep ice-blue `#7fd8ff→#cdeeff` (reads as a distinct "shield" material, intentionally not a semantic token).
  - THR `.meter.thr>div`: `linear-gradient(90deg,var(--primary-bright),var(--primary))`.
- Hero numerals (`.big b`, speed/alt): `--fs-stat-hero`, `--primary`, `text-shadow:var(--glow-primary)`. Combo numeral uses `--reward`.
- **Bevel/AB chip** (`.ab-chip`): keep amber fill but token it: `background:var(--reward)` → no, AB is *thrust boost* not reward; use `background:var(--warn)` `color:var(--base)` — amber = "boost active", consistent with caution-tier energy.

### 3e. Chips — combo / AB / AWACS (`.chip` new utility + existing `.ab-chip`)
One chip shape, color by role:
- base `.chip`: `display:inline-flex; align-items:center; gap:var(--sp-1); padding:2px var(--sp-2); border-radius:var(--r-sm); font:700 var(--fs-data) var(--disp); letter-spacing:1px; line-height:1`.
- `.chip--combo` → border+text `--reward`, transparent bg.
- `.chip--ab` → solid `--warn` fill, `--base` text (the existing AB look, retinted to the warn token).
- `.chip--awacs` → border+text `--info`.

### 3f. Segmented toggle (`.segtog`/`.segbtn`, also `.dbtn` difficulty/env/mode)
These are the same component conceptually — unify visually.
- track: `display:inline-flex; gap:var(--sp-1); border:var(--bd); border-radius:var(--r-md); padding:2px`.
- segment default: `background:transparent; color:var(--ink); border:none; padding:var(--sp-2) var(--sp-4); font:700 var(--fs-data) var(--disp); letter-spacing:2px`.
- segment hover: `color:var(--ink-hi)`.
- segment **on/active**: `background:var(--primary); color:var(--base); box-shadow:var(--glow-primary)`. (This is exactly the current `.dbtn.on` — make `.segbtn.on` match it so settings + hangar selectors look identical.)
- difficulty active color can vary by stake: ROOKIE on → `--ok`, VETERAN on → `--primary`, ACE on → `--danger` fill. Small touch, big "this is the hard one" signal.

### 3g. Difficulty / env / mode selectors (`#diffsel` etc.)
Visually demote per UX-02: these become the **collapsed loadout strip** (see §5 hangar). Each is a labeled segmented toggle (3f). Group label `.dlab` uses the eyebrow style (`--fs-label` raised to 11px for ZH, `--ls-caps` capped at 0.18em, `--ink-dim`).

### 3h. Nav arrows (`.navarrow`, jet carousel)
- `width/height:54px` (keep); `border-radius:50%`; `border:var(--bd)`; `color:var(--primary)`; `background:var(--surface-1)`.
- hover: `border:var(--bd-lit)`; `background:var(--surface-3)`; `box-shadow:var(--glow-primary)`.
- active: `transform:scale(.94)`.

### 3i. Tech-tree node (`.tnode`)
- default (affordable, unowned): `background:var(--surface-2)`; `border:var(--bd-lit)`; cost in `--reward`.
- can't afford: `border:var(--bd)`; `opacity:.8`; cost in `--danger`.
- owned/bought: `border:1px solid var(--ok)`; faint `--ok` inner glow; checkmark.
- unavailable (`na`): `--locked` border, body `--ink-dim`.
- hover (available only): `border:var(--bd-lit)` brighten + `var(--glow-primary)` + `transform:translateY(-2px)`.
- connector lines between nodes: `--hairline` default, `--ok` when both endpoints owned, `--primary-bright` when the next node is affordable (lights the path forward).

### 3j. Tech tabs (`.tech-tab`) & manual nav (`.mnavbtn`)
Same pattern: underline-style tab. inactive `--ink-dim` + `--hairline` bottom border; active `--primary` text + `--primary` 2px bottom border + `var(--glow-primary)`. Already close (`styles.css` `.tech-tab.active` uses `--ac`); point `--ac` at `--primary` or replace.

### 3k. Modal / screen frame (`#upgrade`, `#opmap`, `#manual`, `#meta`, `#wingpick`, `#gameover`)
Unify all full-screen overlays to one frame recipe:
- backdrop: `radial-gradient(ellipse at 50% 35%, rgba(8,20,30,.88), rgba(2,5,10,.97))` + `backdrop-filter:blur(4px)`.
- body container: `background:var(--surface-2)`; `border:var(--bd)`; `border-radius:var(--r-lg)`; max-width per screen; `--sp-6` padding.
- header: Orbitron `--fs-h2` `--ink-hi`; eyebrow subtitle `.sub` in `--ink-dim` (drop the `// … //` slash decorators OR keep as a single consistent motif — pick one; recommend keeping `//` only on the langSelect/hangar eyebrow as a brand tic, removing elsewhere to reduce noise).
- entry: `animation:fadein var(--dur-base) var(--ease-out)`.

### 3l. Locked-state treatment (NEW — used by BOSS RUSH UX-07 + locked jets)
Locked content is **designed, not dimmed**. A `.is-locked` modifier:
- desaturated steel: `border:1px solid var(--locked)`; `color:var(--ink-dim)`; `background:repeating-linear-gradient(45deg, transparent 0 6px, rgba(74,93,107,.10) 6px 8px)` (hazard-stripe hint, very subtle).
- a 🔒 glyph + an unlock-condition line in `--ink-dim` (`"CLEAR A CAMPAIGN TO UNLOCK"` for boss rush; `"UNLOCK — {c} SP"` for jets — strings already exist in i18n `meta.*`).
- hover does NOT light up cyan (it's not actionable as itself) — instead it brightens the unlock-condition line. This makes locked feel like a *goal*, not a dead button.

---

## 4. HUD layout redesign (UX-05 / UX-06)

**Principle: three signal tiers, and a higher tier always visually beats a lower one.**

| Tier | Contains | Treatment | Lifecycle |
|---|---|---|---|
| **T3 Chrome** (lowest) | corner panels (HP/SHD/THR, score/RD/wave/combo, speed/alt, radar/ammo), reticle, velocity vector, horizon | thin, `--ink-dim`/`--primary` at low alpha, never animates on its own | always-on, quiet |
| **T2 Status** | combo extend, wave clear, AWACS ready, weather chip, mission objective, lock-*you-have* progress | mid-weight chips top-center, `--info`/`--reward`/`--ok`, gentle | transient (2–4s) |
| **T1 Survival** (highest) | **MISSILE INCOMING, LOW HP, being-locked, STALL** | big, centered, `--danger`/`--warn`, fast flash, screen-edge bleed | only while the threat is live; *interrupts* T2 |

### 4a. Concrete DOM changes
1. **Kill the in-flight keybind ribbon (UX-05/G).** Delete/hide `#hint` during flight (`styles.css:101`; it's already `display:none` under `max-width:640px` at `:349` — extend to all sizes when `#hud` is active). Keybinds live in the manual only.
2. **Split `#warns` into two stacks (UX-06/C):**
   - `#warns-survival` (T1): top-center, `~22%` down, the `.warn.big` treatment — `--fs-h2`+ Orbitron 900, `--danger`/`--warn`, `wflash` fast (`.4s`), plus it triggers the existing `#dmg` red edge-vignette. MISSILE INCOMING goes here and **nothing else of lower tier may render in this slot while it's active**.
   - `#warns-status` (T2): a slim row just under the top panels (`top:var(--sp-8)`), small `.warn` chips, no big flash. Combo/AWACS/weather here.
   - New classes: `.warn--survival` / `.warn--status` setting size, position-layer, and animation. Color classes (`--danger` etc.) still apply on top.

### 4b. Lock progression = an unmistakable HUD moment (UX-06)
The lock reticle already converges + arcs (`drawLockReticle`, `hud.js:296–331`) — good. Elevate it with token discipline + one added beat:
- **locking** (`progress<1`): brackets `rgba(HUD.warn,a)`, converging (keep). Add a faint audio-synced ring pulse using `--reward`→`--warn` as progress climbs.
- **LOCKED** (`progress>=1`): switch to `HUD.danger` (one red), thicker `2.5px`, blinking diamond (keep), and **the word `LOCK` snaps in with a one-frame scale-overshoot** (juice agent) — this is the "you can fire" payoff beat the UX brief asks for.
- **being-locked-by-enemy** (T1 survival, currently weak): when an enemy is locking *you*, draw a `--warn` shrinking reticle on THAT enemy + a `WARNING — LOCK` survival chip. Distinct color (warn, not danger) from your own lock so the player never confuses "I'm locking" with "I'm being locked."

### 4c. Canvas-HUD styling values (for `hud.js`, via the `HUD` map in §2a)
| Element | Color | lineWidth | font | line ref |
|---|---|---|---|---|
| Central reticle | `rgba(HUD.primary,.9)` | 2 | — | `hud.js:117` |
| Velocity vector | `rgba(HUD.velvec,.9)` | 2 | — | `hud.js:128` |
| Horizon ladder | `rgba(HUD.primary,.5)` (storm→`rgba(150,170,235,.7)`) | 1 | `9px HUDFONT` | `hud.js:41,102` |
| Lock — locking brackets | `rgba(HUD.warn,a)` | 2 | `11px HUDFONT` | `hud.js:320,327` |
| Lock — LOCKED box | `rgba(HUD.danger,1)` | 2.5 | `bold 13px HUDFONT` | `hud.js:305,315` (was 255,55,55 / 255,70,70 — unify) |
| Enemy marker (default) | `rgba(HUD.danger,.85)` | 1.8 | `11px HUDFONT` | `hud.js:359,371` (was 255,64,96 — unify to danger) |
| Enemy marker (boss) | `rgba(255,80,220,.95)` magenta | — | `bold 12px HUDFONT` | `hud.js:373` (keep magenta = boss identity) |
| Enemy marker (rival) | `rgba(HUD.rival,1)` | — | `bold 12px HUDFONT` | `hud.js:375` |
| Enemy marker (elite) | `rgba(HUD.reward,1)` | — | `bold 12px HUDFONT` | `hud.js:376` |
| Radar ring | `rgba(HUD.primary,.22)` | 1 | — | `hud.js:413` |
| Mission objective | `rgba(HUD.primary,.95)` (timed→`rgba(255,90,60,.95)` warn) | — | `bold 15px*k HUDFONT` | `hud.js:138` |
| Star objectives | `rgba(HUD.ok,.85)`/`rgba(HUD.reward,…)` | — | `9px*k HUDFONT` | `hud.js:171,182` |

Rule: **enemy markers and your-lock share `--danger`; the things that mean "reward/secondary" share `--reward`; boss keeps its unique magenta.** No more than the role colors + boss-magenta on the canvas.

### 4d. Layout sketch (16:9 flight HUD)
```
┌─────────────────────────────────────────────────────────────┐
│ [HP ▓▓▓▓▓░]            ┌── T2 status chips ──┐    SCORE  R&D  │ T3 chrome
│ [SHD ▓▓▓░]             │ ◷WEATHER  ⬡AWACS RDY │    WAVE  COMBO │
│ [THR ▓▓▓▓▓] AB         └──────────────────────┘               │
│                                                               │
│                  ╔═══════════════════╗                        │
│                  ║  ⚠ MISSILE  ⚠     ║  ← T1 survival (interrupts) │
│                  ╚═══════════════════╝                        │
│                         ⊕  ← reticle / velocity vector        │
│                      ⌜ LOCK 73% ⌟  ← T2 your-lock progress    │
│                                                               │
│  ▌SPD 540 KNOTS                                    ╭─────╮    │
│  ▌ALT 12,400 FT                                    │ ◉ rdr│   │ T3 chrome
│  ABILITY ▸ READY                          GUN 240 · MSL 4 ╰──╯ │
└─────────────────────────────────────────────────────────────┘
```
Survival (T1) owns center-upper and may darken the screen edges; status (T2) is a thin band that yields to T1; chrome (T3) is the quiet corner frame that never moves.

---

## 5. Screen-by-screen visual direction

### 5a. `#langSelect` — SELL THE GAME (UX-01) · `index.html:391`
- The 3D scene is already booting underneath (`#gl`). **Let it show through**: make `#langSelect` background `transparent`→ a `linear-gradient` scrim only at top/bottom so a slow auto-orbiting jet (or the live scene) is the hero, not black.
- **Headline = the game.** Keep the SKYSTRIKE wordmark (display token) but add a one-line tagline below it (`t('lang.tagline')` — new EN/ZH key for the dev/copy, e.g. "ARCADE JET COMBAT"). Tagline in Orbitron 700 `--primary` `--ls-caps`.
- **Demote language to a small two-button row** at the bottom third using `.langbtn` (already exists, `styles.css:430`) — not the headline. Drop "SELECT LANGUAGE" as the title; the flag buttons self-explain.
- Add a single pulsing `▶` affordance under the buttons so it reads "press to begin," giving momentum.

### 5b. `#onboard` — one-card intro (UX-03/04) · `index.html:403`
- Visual: collapse the three keybind cards into **one** `.card` (§3c) with a short "you're a fighter pilot — let's fly" line and the single `▶ START TUTORIAL` primary button (§3a). The full keybind grid moves to the manual (already lives at `index.html:225+`). This is mostly a structural/copy change the UX brief owns; visually it's "one card, one primary button, lots of negative space (`--sp-7` rhythm)."

### 5c. `#hangar` — ONE dominant LAUNCH path (UX-02) · `index.html:89`
The flagship fix. Reorganize into a clear hierarchy:
1. **Hero zone (top):** jet carousel + jet card stay as the visual centerpiece (the player's chosen aircraft is the hero image).
2. **THE primary action:** a single large `▶ LAUNCH` (§3a) placed **directly under the jet**, visually the biggest interactive thing on screen, with `--glow-primary`. Default to a one-tap "QUICK LAUNCH (VETERAN · DAY · ENDLESS)" — the button carries the current loadout as a subtitle line.
3. **Loadout strip (collapsed, subordinate):** difficulty / env / mode / callsign / emblem become a single horizontal `.loadout` row of compact segmented toggles (§3f) sitting BELOW launch, behind an "◢ ADJUST LOADOUT" disclosure if we want it fully out of the way. Visually 60% the weight of LAUNCH — smaller type, `--ink-dim` labels, no glow.
4. **Secondary tier (smallest, grouped):** COMMAND & PROGRESSION, CONTROLS & MANUAL, DAILY, BOSS RUSH as a tidy row of ghost buttons (§3b) at the very bottom. BOSS RUSH uses the locked treatment (§3l) until unlocked.
5. **Rival board:** demote to a slim collapsible strip; it's flavor, not a decision.
- Spacing: one vertical rhythm — `--sp-6` between major zones, `--sp-4` within. This alone removes the "wall of clusters" feel.

### 5d. In-flight HUD · `index.html:15` — see §4 in full.

### 5e. `#upgrade` tech tree · `index.html:175`
- Apply modal frame (§3k) + node states (§3i) + tab pattern (§3j). The lit-path connector (affordable next node glows `--primary-bright`) gives the eye a route through the lattice, addressing the "enormous tree" overwhelm visually.
- `▶ DEPLOY TO NEXT WAVE` is the primary button (§3a); "spend nothing, just deploy" stays a legible, non-scary option (DEPLOY is always the dominant, safe path).

### 5f. `#opmap` operation map · `index.html:205`
- Sector nodes: pick-able = `--primary` ring + glow; locked/future = `--locked`; cleared = `--ok` fill. FINAL/boss node gets the boss-magenta accent so the destination reads at a glance. `#opLaunch` = primary button.

### 5g. `#gameover` debrief — LEAD WITH REWARD (UX-10) · `index.html:157`
Invert the hierarchy. **The grade/stars/SP reward block becomes the hero**, the outcome line becomes a small eyebrow.
- Order top→bottom: (1) **GRADE letter** huge (`--fs-stat-hero`+, `--reward` for A/S, `--primary` for B/C) with stars pips (`--reward`) right under it — this is the payload; (2) **SP EARNED → BANKED** line in `--reward`; (3) the stat grid (kills/acc/msl/time) as quiet `--ink` data; (4) a small outcome eyebrow — on failure, "SECTOR LOST" in `--danger` at *label size* (`--fs-label`), NOT an 86px headline. On success, "SECTOR CLEARED" in `--ok`.
- Replace `.gowrap h1{font-size:clamp(40px,8vw,86px); color:--red}` (`styles.css:276`) — that 86px red "MISSION FAILED" is the exact anti-pattern. The grade letter inherits that size budget instead.
- Reveal choreography (juice agent): grade letter `--ease-snap` pop, then stars count up, then SP ticks — staged on `--dur-slow`.

### 5h. `#meta` command & progression · `index.html:370`
- Modal frame (§3k); SP balance in `--reward` hero numeral; perk/jet cards use `.card` + locked treatment (§3l); achievement rows quiet `--ink`. Owned = `--ok` accent.

### 5i. `#manual` flight manual · `index.html:225`
- Modal frame + tab pattern (§3j). This is now the *home* of the full keybind grid (moved out of onboard + flight). Keybinds as a clean two-column `<kbd>`-style list: each key in a small `.chip` (mono, `--primary` border) + description in `--ink`. `✖ ABORT TO HANGAR` = ghost button.

---

## 6. Implementation map for the Frontend Developer

### Files & what changes
| File | Change | Type |
|---|---|---|
| `styles.css :root` | Add all §2 tokens (color/type/spacing/radius/motion). Keep old aliases initially. | Pure CSS, additive |
| `styles.css` (components) | Migrate `.panel/.btn/#launch/.ghostbtn/.dbtn/.segbtn/.meter/.warn/.tnode/.tech-tab/modals/.gowrap` to tokens + new states (§3). Add `.btn-primary`, `.chip`, `.is-locked`, `.loadout`, `.warn--survival/--status`. | Pure CSS (most), some need a class added in HTML |
| `index.html` | **Structural:** split `#warns` into `#warns-survival` + `#warns-status` (§4a); demote `#hint` (hide in flight); hangar reorder into hero/launch/loadout/secondary tiers (§5c); langSelect tagline + flag-row demotion (§5a); onboard → one card (§5b); gameover reorder grade-first (§5g). Add `is-locked` to BOSS RUSH. | DOM-structure change |
| `js/ui.js` | Where the above DOM is *built* (`buildHangar` ~`ui.js:527`, warns rendering, gameover populate). Update class names / element grouping to match new structure. Tech-node state classes (§3i) in `nodeState`/render. | Logic touch (class/markup), no behavior change |
| `js/hud.js` | Add the `HUD` color const map (§2a); replace ~50 hard-coded rgba literals with `HUD.*`; unify the three reds → `HUD.danger`; apply §4c values; add being-locked-by-enemy reticle (§4b). | Canvas literals |
| `js/globals.js` | (optional) move `HUD` map here next to `HUDFONT:366` so it's defined before hud.js loads. | 1 const |

### Prioritized build order
- **P0 — System tokens (foundation).** Add §2 `:root` tokens. Migrate `.btn-primary`/`#launch`, `.ghostbtn`, `.dbtn`/`.segbtn`, `.panel`, `.card`, spacing scale, radius/bevel unification. Nothing should regress; this is pure consolidation. *Verify with `node scripts/shot.mjs token-pass` — langSelect must still render correctly.*
- **P1 — HUD tier system (highest gameplay value).** `hud.js` `HUD` map + red unification + §4c values; split `#warns`; kill `#hint` in flight; lock-moment elevation. This is where "looks like a shipped game" lands hardest because it's what players stare at.
- **P2 — Per-screen, in UX-priority order:** hangar (UX-02) → langSelect (UX-01) → gameover (UX-10) → onboard (UX-03) → tech/opmap/meta/manual. Each screen applies modal frame + components + locked treatment (BOSS RUSH UX-07 rides in with hangar).
- **P3 — Motion + CRT/accessibility tokens** handed to the Whimsy/juice agent (they consume §2e); add `prefers-reduced-motion` gating of `#crt`.

### Pure-CSS vs DOM-structure flags
- **Pure CSS (no HTML/JS):** all of §2 tokens, §3a/b/d/f/h/i/j/k component restyles, §2d CRT tokens, §2e motion retiming.
- **Needs a class added (HTML/ui.js, no logic change):** `.is-locked` on BOSS RUSH; `.chip` on manual keybinds; `.btn-primary` rename on `#launch` (or just restyle `#launch` in place — simpler, recommended).
- **Needs real DOM restructure (HTML + ui.js):** `#warns` split (§4a); hangar tier reorg (§5c); langSelect hero/tagline (§5a); onboard one-card (§5b); gameover grade-first reorder (§5g). These are the only items requiring coordinated HTML+ui.js edits — sequence them carefully and re-screenshot after each.

### Verification
After P0 and after each P2 screen: `node scripts/shot.mjs <prefix>` and visually diff against the prior frame. Headless can only reach langSelect, so hangar/HUD/debrief need a manual browser pass (the screenshotter gates on language). `npm test` must stay green (these are visual-only edits; no core logic touched).
