# Skystrike — changelog

One line per release, newest first. Detail lives in `git log`.

- **2026-09 chainsaw** — codebase trim: comments/dead code/verbosity cut across js/, CSS deduped, jet models Draco+WebP-compressed, stale docs/specs/one-off scripts removed.
- **2026-09-26 maintainability** — i18n split into `js/lang/{en,zh,ko}.js` + `scripts/i18n.mjs` CLI; lean CLAUDE.md; bombers/wingmen bank into turns; SAM/AAA traverse yaw-only.
- **v1.9 campaign overhaul** — fixed broken missions, `allies` seam, scripted multi-beat levels, immersion + screen rework, `verify-campaign` gate.
- **v1.8 polish** — graphics pass, UX pass, particle pool + allocation cleanup.
- **Content factory (2026-07-14)** — formations, weekly modifiers and wave patterns as versioned data packs (`content-packs.js`).
- **Feature batch 1 (2026-07-13)** — gun overheat, enemy formations, wingman command wheel, enemy defensive AI, kill-streak momentum, Operation Polar Vortex, weekly challenge, per-jet veterancy, reset-path geometry/material leak fixes.
- **v1.4** — LEVEL CLEARED debrief, engine silence on teardown, single star truth, unlock-all fix, stealth go-loud (ADR-0006).
- **v1.3** — clean flight restart behind a loading curtain (ADR-0005), per-level stars, working stealth, dev panel gate.
- **v1.1–1.2 (2026-06-17)** — HUD/UX/units batch, lore relocation, UX pass 2.
- **Base game** — touch/motion/mouse flight, meta-progression (SP, perks, jets, skins), 7 mission types, sector bosses + AWACS, daily + boss rush, weather/TOD, EN/ZH/KO.
