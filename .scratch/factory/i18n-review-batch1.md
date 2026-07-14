# Batch-1 ZH/KO i18n review (2026-07-13, model-drafted review — still needs a native pass)

Scope: all `// === F<N>` tail blocks in `js/i18n.js` (F1/F3/F5/F6-op4/F7/F8/F9). 87 keys × ZH + KO reviewed against EN. **No wrong-meaning (HIGH) findings.** Core aviation/gaming terminology is correct throughout (连杀/연속 격추, 机炮/기총, 挂架, 出击/출격, 箔条/채프, 截击机/요격기, 紧急升空/긴급발진, 五代机/5세대 기체).

## Applied (MED, 2026-07-13 on fix/batch1-followups)
- `weekly.sub` ZH: 修正 → 特殊规则 ("modifier" mistranslated as "correction")
- `weekly.sub` KO: 수정자 → 규칙 (same issue)
- `op.polarVortex.l2.obj` ZH: 屏护 → 屏障 (non-idiomatic coinage for "fighter screen")
- `op.polarVortex.l7.intel` ZH: 屏护 → 空中巡逻 ("fighter cap")
- `op.polarVortex.l3.obj` + `.l3.blurb` ZH: 应援 → 增援 (应援 = fan/idol-culture "cheering", tonally wrong in a military brief)

## Rejected findings
- `weekly.mod.noFlares` / `.d` ZH "干扰弹 should be 热焰弹": **rejected** — 干扰弹 is the repo's established flare term (`hud.flares` js/i18n.js:745, pre-batch). Changing it only here would fork terminology. If a native reviewer prefers 热焰弹, change it game-wide.

## Open LOW findings (for the native reviewer)
- `vet.rank1` ZH `初阵` → `初战`/`首战` (初阵 is JP-derived 初陣)
- `weekly.mod.stormFront` ZH `暴风前线` → `风暴锋面` (weather front = 锋面; stylized name, optional)
- `weekly.mod.heavyWing` ZH `重型机翼` → `重型机体` (mechanic is a heavier airframe, not the wing)
- `boss.boreas` KO left `BOREAS` while KO prose uses 보레아스 (ZH localized it to 博瑞亚斯) — decide callsign policy
- `weekly.mod.*.d` KO block mixes 합니다체 declaratives with 해라체 imperatives — unify to plain style (`고정된다`…)
- `hud.streak` KO `연속` → `연속격추` if HUD width allows
- `hud.gunHeat` KO `기총 열` → `기총 과열도`
- `vet.rank1` KO `실전` → `첫 실전` (optional)
