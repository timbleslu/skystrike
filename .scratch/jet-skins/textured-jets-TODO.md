# Deferred — alt-skin pass for the BAKED-TEXTURE jets

Status: **NOT STARTED** (out of scope for the 2026-06-17 textureless-jet skin redesign).

## Context
The 2026-06-17 pass redesigned skins 2 & 3 for the **7 textureless jets** (geometry-only / flat-albedo
glTF exports that render colourless, recoloured in-code): `FT-1, F-47, J-20, J-36, J-50, EFT, FA18`
(see `TEXTURELESS_SHAPES` in `js/entities.js` and the `SKINS` map in `js/meta.js`). Those jets get an
in-code `applyPaint` recolour: per-material `zones` (skin 2) plus a procedural canvas decal + accent
geometry (skin 3).

The **baked-texture jets are everything else in the roster** — the airframes whose `.glb` ships a baked
albedo/texture livery, so an in-code recolour either does nothing useful or fights the baked art. By
shape these are `F22, F35, SU57, RAFALE, TEJAS, BOMBER` (i.e. every roster shape NOT in
`TEXTURELESS_SHAPES`). Confirm the exact jet set against `js/roster.js` `JETS` at implementation time.

> NOTE on the original task prompt: it listed `std` among the baked-texture jets. That is an error —
> `STD` is the FT-1's shape and is **textureless / in-scope** (it has skins today). Do not re-skin FT-1
> here; it is already done.

These baked jets currently have **no skins at all** (no chips in the hangar) — `SKINS` intentionally
omits them, and `cloneJetGLTF` only calls `applyPaint` when `userData.textureless` is set.

## Why they need a DIFFERENT mechanism
`applyPaint`'s `zones` recolour sets `material.color`, which multiplies/replaces the base colour. On a
baked-texture jet that has a real albedo map, recolouring the material tints the whole baked livery a
flat hue and destroys the art. So the textureless approach does not transfer. The baked jets need an
**alt-skin / texture-override subsystem**, e.g. one or more of:
- **Swap `material.map`** to an alternate baked texture set (author or bake alt liveries per jet; ship as
  extra textures or a texture atlas). Highest fidelity, biggest asset cost.
- **Emissive / tint / detail overlay**: keep the baked albedo, layer a controlled tint, decal sheet, or
  emissive accent on top (re-use the new `addSkinDecal`/`addSkinGeo` from this pass — they are
  airframe-agnostic and already work on any model, baked or not).
- **Per-zone recolour ONLY where the baked texture is neutral/greyscale** (some exports have a paintable
  grey base + separate detail) — verify per model with `scripts/gltf-inspect.mjs`.

## Checklist (when this is picked up)
- [ ] Enumerate the exact baked-texture roster jets from `js/roster.js` (shape ∉ `TEXTURELESS_SHAPES`).
- [ ] Inspect each baked `.glb` (`node scripts/gltf-inspect.mjs <file>`): material names, which carry a
      baked `map`, whether any base material is neutral/paintable, UV availability.
- [ ] Decide the override mechanism per jet (texture-swap vs overlay/decal-only vs partial recolour).
- [ ] Extend the skin pipeline: a baked jet needs a skin path that does NOT blanket-tint the baked
      albedo. Likely a new descriptor field (e.g. `mapOverride` / `overlayOnly`) + a branch in
      `applyPaint` (or a sibling `applyBakedSkin`) that respects baked textures. Re-use
      `addSkinDecal`/`addSkinGeo` for the decal + geometry layers (they are baked-safe).
- [ ] Author skins 2 & 3 per baked jet, anchored to role/faction/operation lore (mirror the
      `.scratch/jet-skins/theme-plan.md` structure). Add EN+ZH `skin.<id>` names to `js/i18n.js`.
- [ ] Add the baked jets' ids to `SKINS` (and relax / extend `tests/skins.test.js`, which currently
      asserts `SKINS` keys are EXACTLY the 7 textureless jets — that invariant must change).
- [ ] Hangar: confirm chips + `previewPaint` + buy/equip work for the baked jets (they already would,
      once `SKINS[jetId]` exists — the UI iterates `SKINS[j.id]`).
- [ ] Visual-verify every baked jet × every skin in the hangar preview (mirror
      `scripts/verify-skins3.mjs` / `scripts/beauty.mjs`).
- [ ] Mobile/iOS: texture-swap liveries add texture memory — budget per tier; tier-gate alt textures.

## Ready-to-run follow-up prompt (mirrors the textureless pass)
> Skystrike — design alt-skins (skins 2 & 3) for the BAKED-TEXTURE jets (the roster airframes whose shape
> is NOT in `TEXTURELESS_SHAPES` — confirm the exact set from `js/roster.js`; do NOT touch the 7
> textureless jets, already done). These jets ship baked albedo liveries, so the textureless `zones`
> recolour does not apply — build the alt-skin/texture-override subsystem first (texture-`map` swap and/or
> baked-safe overlay; the `addSkinDecal`/`addSkinGeo` decal+geometry layers from the textureless pass are
> airframe-agnostic and reusable). FILES: `js/meta.js` `SKINS` + `resolveSkinPaint`; `js/entities.js`
> `applyPaint` (add a baked-safe branch / sibling); `js/roster.js` for the jet set; `js/i18n.js` for
> EN+ZH `skin.<id>` names; `tests/skins.test.js` (the "exactly 7 textureless" invariant must be relaxed
> to include the baked jets). THEMES first: write a theme-plan (each baked jet → skin-2 + skin-3,
> justified by role/faction/operation), mirroring `.scratch/jet-skins/theme-plan.md`. SKIN 2 =
> colour-block-equivalent that respects the baked art; SKIN 3 = elevated (decal + geo + texture override),
> visibly busier. ACCEPTANCE: each baked jet's skins instantly distinguishable, skin 3 busier than skin 2,
> verified in the hangar preview for every jet; keep tests green. Agent plan: Narrative Designer →
> Technical Artist (baked-safe override infra) → Frontend Developer (skin 2 ‖ skin 3 data) → Evidence
> Collector. FLAG the texture-memory cost on mobile/iOS in the summary.
