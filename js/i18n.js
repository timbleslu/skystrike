/* SKYSTRIKE — i18n.js: localization (EN / Simplified Chinese). Load 2nd (after globals.js, before engine.js).
   Convention: every NEW user-facing string is rendered through t(key). Data-table strings (JETS/TECH_TREE)
   keep their English fields as canonical source and are localized at render time via jetText()/techText(),
   which fall back to the English object field when no ZH override exists. */

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

function t(key) {
  const L = I18N[LANG];
  if (L && L[key] != null) return L[key];
  return I18N.EN[key] != null ? I18N.EN[key] : key;
}

const I18N = {
  EN: {
    /* ---- language / onboarding ---- */
    'lang.title': 'SELECT LANGUAGE',
    'lang.sub': '// 选择语言 //',
    'onboard.title': 'CONTROLS',
    'onboard.sub': '// PRE-FLIGHT BRIEF //',
    'onboard.flight': 'FLIGHT',
    'onboard.flightKeys': 'W/S pitch · Q/E roll · A/D yaw · SHIFT/CTRL throttle/brake · CTRL+S high-G turn',
    'onboard.combat': 'COMBAT',
    'onboard.combatKeys': 'SPACE gun · G missile · X flares · F lock target · R special ability',
    'onboard.view': 'VIEW',
    'onboard.viewKeys': 'C cycle camera · V look back · hold RMB track · H / ESC manual & pause',
    'onboard.touch': 'Touchscreen controls auto-detect and activate on mobile devices.',
    'onboard.more': 'Full reference, aircraft briefs and Settings live in the FLIGHT MANUAL (▣ CONTROLS & MANUAL in the hangar).',
    'onboard.continue': '▶ CONTINUE TO HANGAR',

    /* ---- hud labels ---- */
    'hud.guns': 'GUNS',
    'hud.locking': 'LOCKING',
    'hud.locked': '◉ LOCKED',
    'hud.targetLocked': '◉ TARGET LOCKED',
    'hud.acquiring': 'ACQUIRING',
    'hud.supply': 'SUPPLY',
    'hud.boss': '◆ BOSS',
    'hud.bomber': '⚑ BOMBER',
    'hud.noSpecial': 'NO SPECIAL',
    'hud.ready': 'READY',
    'hud.pause': '|| PAUSE',
    'hud.pullUp': '⚠ PULL UP ⚠',
    'hud.missileAlert': '▲ MISSILE ALERT ▲',
    'hud.droneSwarm': '⚠ DRONE SWARM ⚠',
    'hud.highG': 'HIGH-G PULL',
    'hud.stealthActive': 'STEALTH ACTIVE',
    'hud.hp': 'HP', 'hud.shd': 'SHD', 'hud.thr': 'THR',
    'hud.score': 'Score', 'hud.rd': 'R&D', 'hud.wave': 'Wave', 'hud.combo': 'Combo',
    'hud.knots': 'Knots', 'hud.ft': 'Ft',
    'hud.gun': 'Gun', 'hud.flares': 'Flares', 'hud.msl': 'Msl',
    'hud.escort': '▲ ESCORT',
    'hud.onStation': 'ON STATION', 'hud.regrouping': 'REGROUPING',

    /* ---- banners ---- */
    'banner.getReady': 'GET READY',
    'banner.waveInbound': 'WAVE {n} INBOUND',
    'banner.wave': 'WAVE {n}',
    'banner.waveClear': 'WAVE {n} CLEAR',
    'banner.bossIncoming': '⚠ BOSS INCOMING ⚠',
    'banner.bossEnraged': '⚠ BOSS ENRAGED ⚠',
    'banner.aceInbound': '★ ACE INBOUND ★',
    'banner.bomberDetected': '⚑ BOMBER DETECTED ⚑',
    'banner.strikeWave': '⚒ STRIKE WAVE — FLATTEN THE SITE ⚒',
    'banner.finalTarget': '⚠ FINAL TARGET ⚠',
    'banner.sector': 'SECTOR: {s}',
    'banner.depot': '⚙ DEPOT — REPAIRED & REARMED ⚙',
    'banner.researched': '◈ {name} RESEARCHED ◈',
    'banner.cam': '{name} CAM',
    'banner.missionFailed': 'MISSION FAILED',
    'banner.operationComplete': '★ OPERATION COMPLETE ★',
    'banner.onStation': '▲ {name} ON STATION ▲',
    'banner.down': '▼ {name} DOWN ▼',
    'banner.rivalOnStation': '☠ RIVAL ON STATION — {name} · Lv{lvl} ☠',

    /* ---- tech tree ui ---- */
    'tech.core': 'CORE', 'tech.owned': 'OWNED', 'tech.na': 'N/A', 'tech.rp': 'RP',
    'tech.researchPoints': 'RESEARCH POINTS',
    'tech.title': 'R&D TECH TREE',
    'tech.sub': '// ONE TREE · PATH DOWN ANY BRANCH · UPGRADES PERSIST FOR THE RUN //',
    'tech.tabTech': 'TECH TREE', 'tech.tabArmory': 'ARMORY',
    'tech.deploy': '▶ DEPLOY TO NEXT WAVE',
    'tech.hintTree': 'Drag or scroll to explore the tree. Tap a lit node to research it — or just DEPLOY and spend nothing. The dashed RESERVE SQUADRON node can be bought over and over to grow & up-armour your flight.',
    'tech.hintArmory': 'Click any lit card to purchase. WEAPONS LOCKER, COMMAND AUTHORITY and TARGETING COMPUTER have no prerequisites — just spare RP.',

    /* ---- wing picker ---- */
    'wing.title': 'SELECT WINGMAN AIRFRAME',
    'wing.sub': '// CHOOSE THE JET YOUR NEW ESCORT WILL FLY //',
    'wing.cancel': 'CANCEL',

    /* ---- operation map ---- */
    'op.title': 'OPERATION MAP',
    'op.sub': '// SELECT NEXT SECTOR //',
    'op.info': "Plot your own course through enemy territory: pick one highlighted sector per column, left to right. Each pick is the next wave you fly — clear it, spend your RP, then return here. Reach FINAL and destroy the boss to complete the operation.",
    'op.launch': '▶ LAUNCH',
    'op.legFurball': 'fighter swarm — grows with depth',
    'op.legIntercept': 'bombers — down them before they escape',
    'op.legStrike': 'fortified ground site + fleeing convoy',
    'op.legElite': 'ace squadron — your rival hunts here',
    'op.legDepot': 'repair & full rearm, no combat',
    'op.legFinal': "the operation's boss target",
    'op.FURBALL': 'FURBALL', 'op.INTERCEPT': 'INTERCEPT', 'op.STRIKE': 'STRIKE',
    'op.ELITE': 'ELITE', 'op.DEPOT': 'DEPOT', 'op.FINAL': 'FINAL',

    /* ---- hangar ---- */
    'hangar.sub': '// SELECT YOUR AIRCRAFT //',
    'hangar.best': 'BEST SCORE',
    'hangar.difficulty': 'DIFFICULTY',
    'hangar.environment': 'ENVIRONMENT',
    'hangar.mode': 'MODE',
    'hangar.endless': 'ENDLESS', 'hangar.operation': 'OPERATION',
    'hangar.rivalBoard': 'RIVAL KILL BOARD',
    'hangar.noRivals': 'NO RIVALS DOWNED',
    'hangar.launch': '▶ LAUNCH MISSION',
    'hangar.manualBtn': '▣ CONTROLS & MANUAL',
    'hangar.controls1': 'pitch · roll · yaw (rudder) · throttle/brake · high-G turn',
    'hangar.controls2': 'gun · missile · flares · lock · special · camera · look back · track · manual',
    'hangar.controls3': 'Touchscreen controls auto-detect and activate on mobile devices.',
    'diff.ROOKIE': 'ROOKIE', 'diff.VETERAN': 'VETERAN', 'diff.ACE': 'ACE',
    'diff.descROOKIE': 'Forgiving — fewer, gentler foes & a tougher hull.',
    'diff.descVETERAN': 'The intended challenge.',
    'diff.descACE': 'Lethal — more foes, faster guns, fragile hull.',
    'tod.DAY': 'DAY', 'tod.DUSK': 'DUSK', 'tod.NIGHT': 'NIGHT',

    /* ---- jet card ---- */
    'card.noSpecial': 'NO SPECIAL',
    'card.noSpecialAbility': 'NO SPECIAL ABILITY',
    'card.special': 'SPECIAL',
    'card.passive': 'PASSIVE',
    'card.topSpeed': 'Top Speed', 'card.ceiling': 'Ceiling', 'card.cannon': 'Cannon',
    'card.realBrief': '// REAL-WORLD BRIEF //',
    'stat.SPD': 'SPD', 'stat.AGI': 'AGI', 'stat.ACC': 'ACC',
    'stat.ARM': 'ARM', 'stat.STL': 'STL', 'stat.FPW': 'FPW',

    /* ---- game over ---- */
    'go.score': 'SCORE', 'go.wave': 'WAVE', 'go.best': 'BEST',
    'go.kills': 'Kills', 'go.accuracy': 'Accuracy', 'go.missiles': 'Missiles', 'go.time': 'Time',
    'go.redeploy': '▶ REDEPLOY',

    /* ---- manual ---- */
    'manual.title': 'FLIGHT MANUAL',
    'manual.sub': '// TACTICAL REFERENCE //',
    'manual.resume': '▶ RESUME',
    'manual.abort': '✖ ABORT TO HANGAR',
    'manual.hFlight': 'Flight',
    'manual.hCombat': 'Combat',
    'manual.hLock': 'Target Lock',
    'manual.hStats': 'Aircraft Stats',
    'manual.hHud': 'HUD & Radar',
    'manual.hWingman': 'Your Wingman',
    'manual.hEnemies': 'Enemies & Abilities',
    'manual.hTech': 'R&D Tech Tree',
    'manual.hSettings': 'Settings',

    /* ---- settings labels ---- */
    'set.language': 'Language',
    'set.sensitivity': 'Control sensitivity',
    'set.volume': 'Master volume',
    'set.invert': 'Invert pitch (W = nose up)',
    'set.autoLock': 'Auto-lock nearest target (off = press F to lock)',
    'set.wingman': 'Launch with a starting wingman',
    'set.rival': 'Nemesis rival ace (persistent named enemy)',
    'set.groundWar': 'Ground war (SAM/AAA sites, strike waves)',
    'set.gunLead': 'Lead-computing gunsight (deflection pipper)',
    'set.mute': 'Mute all audio',
    'set.langEN': 'English', 'set.langZH': '简体中文',
  },

  ZH: {
    'lang.title': '选择语言',
    'lang.sub': '// SELECT LANGUAGE //',
    'onboard.title': '操作说明',
    'onboard.sub': '// 起飞前简报 //',
    'onboard.flight': '飞行',
    'onboard.flightKeys': 'W/S 俯仰 · Q/E 滚转 · A/D 偏航 · SHIFT/CTRL 加速/减速 · CTRL+S 高过载转弯',
    'onboard.combat': '战斗',
    'onboard.combatKeys': 'SPACE 机炮 · G 导弹 · X 干扰弹 · F 锁定目标 · R 特殊技能',
    'onboard.view': '视角',
    'onboard.viewKeys': 'C 切换镜头 · V 后视 · 按住右键 跟踪 · H / ESC 手册与暂停',
    'onboard.touch': '在移动设备上将自动检测并启用触屏操控。',
    'onboard.more': '完整操作参考、机型简报与设置均在《飞行手册》中（机库内点击「▣ 操作与手册」）。',
    'onboard.continue': '▶ 进入机库',

    'hud.guns': '可射击',
    'hud.locking': '锁定中',
    'hud.locked': '◉ 已锁定',
    'hud.targetLocked': '◉ 目标已锁定',
    'hud.acquiring': '搜索中',
    'hud.supply': '补给',
    'hud.boss': '◆ 首领',
    'hud.bomber': '⚑ 轰炸机',
    'hud.noSpecial': '无技能',
    'hud.ready': '就绪',
    'hud.pause': '|| 暂停',
    'hud.pullUp': '⚠ 拉起 ⚠',
    'hud.missileAlert': '▲ 导弹来袭 ▲',
    'hud.droneSwarm': '⚠ 无人机蜂群 ⚠',
    'hud.highG': '高过载',
    'hud.stealthActive': '隐身启动',
    'hud.hp': '血量', 'hud.shd': '护盾', 'hud.thr': '油门',
    'hud.score': '分数', 'hud.rd': '研发', 'hud.wave': '波次', 'hud.combo': '连击',
    'hud.knots': '节', 'hud.ft': '英尺',
    'hud.gun': '机炮', 'hud.flares': '干扰弹', 'hud.msl': '导弹',
    'hud.escort': '▲ 僚机',
    'hud.onStation': '就位', 'hud.regrouping': '重整中',

    'banner.getReady': '准备就绪',
    'banner.waveInbound': '第 {n} 波来袭',
    'banner.wave': '第 {n} 波',
    'banner.waveClear': '第 {n} 波已清除',
    'banner.bossIncoming': '⚠ 首领来袭 ⚠',
    'banner.bossEnraged': '⚠ 首领狂暴 ⚠',
    'banner.aceInbound': '★ 王牌来袭 ★',
    'banner.bomberDetected': '⚑ 发现轰炸机 ⚑',
    'banner.strikeWave': '⚒ 对地打击波 — 夷平据点 ⚒',
    'banner.finalTarget': '⚠ 最终目标 ⚠',
    'banner.sector': '区域：{s}',
    'banner.depot': '⚙ 补给站 — 已修复并补给 ⚙',
    'banner.researched': '◈ {name} 研发完成 ◈',
    'banner.cam': '{name} 视角',
    'banner.missionFailed': '任务失败',
    'banner.operationComplete': '★ 战役完成 ★',
    'banner.onStation': '▲ {name} 已就位 ▲',
    'banner.down': '▼ {name} 被击落 ▼',
    'banner.rivalOnStation': '☠ 宿敌出击 — {name} · 等级{lvl} ☠',

    'tech.core': '核心', 'tech.owned': '已拥有', 'tech.na': '不可用', 'tech.rp': '点',
    'tech.researchPoints': '研究点数',
    'tech.title': '研发科技树',
    'tech.sub': '// 一棵科技树 · 沿任意分支前进 · 升级在本局内永久生效 //',
    'tech.tabTech': '科技树', 'tech.tabArmory': '军械库',
    'tech.deploy': '▶ 出击至下一波',
    'tech.hintTree': '拖动或滚动浏览科技树。点击亮起的节点进行研发——也可以直接出击，一点不花。虚线的「预备中队」节点可反复购买，用以扩充并强化你的机群。',
    'tech.hintArmory': '点击任意亮起的卡片即可购买。「武器库」「战区授权」与「火控计算机」无前置要求——有余裕的研究点数即可购入。',

    'wing.title': '选择僚机机型',
    'wing.sub': '// 选定新僚机将驾驶的战机 //',
    'wing.cancel': '取消',

    'op.title': '战役地图',
    'op.sub': '// 选择下一区域 //',
    'op.info': '在敌方领土上规划自己的路线：每列从左到右选取一个高亮区域。每次选择即是你接下来要飞的一波——清除它，花掉研究点数，再回到这里。抵达「最终」并摧毁首领即可完成战役。',
    'op.launch': '▶ 出击',
    'op.legFurball': '战机蜂群——随推进而壮大',
    'op.legIntercept': '轰炸机——趁其逃离前击落',
    'op.legStrike': '设防地面据点 + 逃窜车队',
    'op.legElite': '王牌中队——你的宿敌在此狩猎',
    'op.legDepot': '修复并完全补给，无战斗',
    'op.legFinal': '战役的首领目标',
    'op.FURBALL': '混战', 'op.INTERCEPT': '拦截', 'op.STRIKE': '打击',
    'op.ELITE': '精英', 'op.DEPOT': '补给站', 'op.FINAL': '最终',

    'hangar.sub': '// 选择你的战机 //',
    'hangar.best': '最高分',
    'hangar.difficulty': '难度',
    'hangar.environment': '环境',
    'hangar.mode': '模式',
    'hangar.endless': '无尽', 'hangar.operation': '战役',
    'hangar.rivalBoard': '宿敌击杀榜',
    'hangar.noRivals': '尚无宿敌被击落',
    'hangar.launch': '▶ 出击执行任务',
    'hangar.manualBtn': '▣ 操作与手册',
    'hangar.controls1': '俯仰 · 滚转 · 偏航（方向舵）· 加速/减速 · 高过载转弯',
    'hangar.controls2': '机炮 · 导弹 · 干扰弹 · 锁定 · 特殊技能 · 镜头 · 后视 · 跟踪 · 手册',
    'hangar.controls3': '在移动设备上将自动检测并启用触屏操控。',
    'diff.ROOKIE': '新兵', 'diff.VETERAN': '老兵', 'diff.ACE': '王牌',
    'diff.descROOKIE': '宽容——敌人更少更弱，机体更耐打。',
    'diff.descVETERAN': '设计之初的标准挑战。',
    'diff.descACE': '致命——敌人更多、火力更猛、机体更脆。',
    'tod.DAY': '白昼', 'tod.DUSK': '黄昏', 'tod.NIGHT': '夜晚',

    'card.noSpecial': '无技能',
    'card.noSpecialAbility': '无特殊技能',
    'card.special': '特殊技能',
    'card.passive': '被动',
    'card.topSpeed': '最大速度', 'card.ceiling': '升限', 'card.cannon': '机炮',
    'card.realBrief': '// 现实背景简报 //',
    'stat.SPD': '速度', 'stat.AGI': '敏捷', 'stat.ACC': '加速',
    'stat.ARM': '装甲', 'stat.STL': '隐身', 'stat.FPW': '火力',

    'go.score': '分数', 'go.wave': '波次', 'go.best': '最高',
    'go.kills': '击杀', 'go.accuracy': '命中率', 'go.missiles': '导弹', 'go.time': '时间',
    'go.redeploy': '▶ 重新部署',

    'manual.title': '飞行手册',
    'manual.sub': '// 战术参考 //',
    'manual.resume': '▶ 继续',
    'manual.abort': '✖ 中止返回机库',
    'manual.hFlight': '飞行',
    'manual.hCombat': '战斗',
    'manual.hLock': '目标锁定',
    'manual.hStats': '战机数据',
    'manual.hHud': '平显与雷达',
    'manual.hWingman': '你的僚机',
    'manual.hEnemies': '敌人与能力',
    'manual.hTech': '研发科技树',
    'manual.hSettings': '设置',

    'set.language': '语言',
    'set.sensitivity': '操控灵敏度',
    'set.volume': '主音量',
    'set.invert': '反转俯仰（W = 机头上仰）',
    'set.autoLock': '自动锁定最近目标（关闭则按 F 锁定）',
    'set.wingman': '出击时携带初始僚机',
    'set.rival': '宿敌王牌（持续存在的具名敌人）',
    'set.groundWar': '对地战争（防空/高炮据点、打击波）',
    'set.gunLead': '提前量瞄准镜（偏置瞄准点）',
    'set.mute': '静音所有音频',
    'set.langEN': 'English', 'set.langZH': '简体中文',
  },
};

/* small {token} interpolation helper for banner strings */
function tf(key, vars) {
  let s = t(key);
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}
