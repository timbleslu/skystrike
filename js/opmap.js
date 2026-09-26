/* SKYSTRIKE — opmap.js: the OPERATIONS campaign data table + level plans. Loaded after meta.js. */
let opSector = null;    // currently-flying sector type (string) or null

/* ---- OPERATIONS table ----
   The fixed campaign as DATA: hand-authored level rows with i18n KEYS for all user-facing text
   (strings live in i18n.js). Boss levels (`type:'FINAL'`, `isBoss:true`) carry a 3-phase `boss`
   descriptor. Meta is keyed on `${opId}.${id}` — ids are stable and MUST NOT be renumbered. */
const OPERATIONS = [
  /* Every level is a SCRIPTED sequence of 2–3 varied objective beats
     (`objectives`), each with its own air/ground budget, radio lines (`say`: [[speaker, key], …] → i18n
     'comms.<key>') and timed mid-phase `events` (reinforcements / bomb runs / taunts at `at` seconds).
     Speakers: ovl = OVERLORD (AWACS) · hq = command · wing = your wingman · ally = the unit you protect ·
     enemy = intercepted chatter · boss = the operation's ace. ESCORT phases pick `escort:'truck'|'transport'`
     (ground convoy / escorted aircraft), DEFEND phases `asset:'outpost'|'ship'`; `label` names the ally
     ('ally.name.<label>'). FINAL levels open with an approach fight, then a BOSS phase spawns the ace.
     The top-level `spawn` row still carries the level's fixed weather/tod (and a legacy budget the Node
     tests read); `type` stays the level's headline type (map icon + star defaults). waves:1 everywhere —
     the objective sequence IS the level. */
  {
    id: 'ironVeil', biome: 'tropical', nameKey: 'op.ironVeil.name', theaterKey: 'op.ironVeil.theater', loreKey: 'op.ironVeil.lore',
    levels: [
      { id: 'firstLight',  coords: { x: 18, y: 82 }, nameKey: 'op.ironVeil.l1.name', type: 'RECON', loreKey: 'op.ironVeil.l1.lore', objectivesKey: 'op.ironVeil.l1.obj', enemyIntelKey: 'op.ironVeil.l1.intel', starUnique: { type: 'fastClear', n: 240 }, waves: 1,
        spawn: { fighters: 2, aces: 0, bombers: 0, ground: false, weather: 'clear', tod: 0, hostileAce: false },
        objectives: [
          { type: 'RECON', wp: 2, say: [['ovl', 'fl.1'], ['wing', 'fl.2']] },
          { type: 'STRIKE', site: 'outpost', say: [['hq', 'fl.3']] },
          { type: 'SWEEP', spawn: { fighters: 2 }, say: [['ovl', 'fl.4'], ['enemy', 'fl.5']] },
        ] },
      { id: 'openSkies',   coords: { x: 40, y: 70 }, nameKey: 'op.ironVeil.l2.name', type: 'FURBALL', loreKey: 'op.ironVeil.l2.lore', objectivesKey: 'op.ironVeil.l2.obj', enemyIntelKey: 'op.ironVeil.l2.intel', starUnique: { type: 'gunOnly' }, waves: 1,
        spawn: { fighters: 4, aces: 0, bombers: 0, ground: false, weather: 'clear', tod: 0, hostileAce: true },
        objectives: [
          { type: 'SWEEP', spawn: { fighters: 3 }, say: [['ovl', 'os.1']], events: [{ at: 22, spawn: { fighters: 2 }, say: [['ovl', 'os.2']] }] },
          { type: 'SWEEP', spawn: { fighters: 1, hostileAce: true }, say: [['enemy', 'os.3'], ['wing', 'os.4']] },
        ] },
      { id: 'blindspot',   coords: { x: 68, y: 76 }, nameKey: 'op.ironVeil.l3.name', type: 'STEALTH', loreKey: 'op.ironVeil.l3.lore', objectivesKey: 'op.ironVeil.l3.obj', enemyIntelKey: 'op.ironVeil.l3.intel', starUnique: { type: 'noFlares' }, waves: 1,
        spawn: { fighters: 2, aces: 0, bombers: 0, ground: false, weather: 'fog', tod: 2, hostileAce: false },
        objectives: [
          { type: 'STEALTH', wp: 1, say: [['ovl', 'bs.1'], ['wing', 'bs.2']] },
          { type: 'STRIKE', site: 'outpost', timer: 100, say: [['hq', 'bs.3']], events: [{ at: 20, spawn: { fighters: 2 }, say: [['enemy', 'bs.4']] }] },
          { type: 'SWEEP', spawn: { fighters: 2 }, say: [['ovl', 'bs.5']] },
        ] },
      { id: 'tripwire',    coords: { x: 30, y: 26 }, nameKey: 'op.ironVeil.l4.name', type: 'INTERCEPT', loreKey: 'op.ironVeil.l4.lore', objectivesKey: 'op.ironVeil.l4.obj', enemyIntelKey: 'op.ironVeil.l4.intel', starUnique: { type: 'noDamage' }, waves: 1,
        spawn: { fighters: 3, aces: 0, bombers: 2, ground: false, weather: 'fog', tod: 1, hostileAce: true },
        objectives: [
          { type: 'INTERCEPT', timer: 85, spawn: { bombers: 2, fighters: 2 }, say: [['ovl', 'tw.1'], ['wing', 'tw.2']] },
          { type: 'INTERCEPT', timer: 80, spawn: { bombers: 3 }, say: [['ovl', 'tw.3']], events: [{ at: 14, spawn: { fighters: 2, hostileAce: true }, say: [['enemy', 'tw.4']] }] },
        ] },
      { id: 'ironShield',  coords: { x: 14, y: 50 }, nameKey: 'op.ironVeil.l5.name', type: 'DEFEND', loreKey: 'op.ironVeil.l5.lore', objectivesKey: 'op.ironVeil.l5.obj', enemyIntelKey: 'op.ironVeil.l5.intel', starUnique: { type: 'flawless' }, waves: 1,
        spawn: { fighters: 3, aces: 1, bombers: 1, ground: false, weather: 'storm', tod: 1, hostileAce: true },
        objectives: [
          { type: 'DEFEND', asset: 'outpost', label: 'strip', hold: 85, spawn: { fighters: 2 }, say: [['ally', 'is.1'], ['ovl', 'is.2']],
            events: [{ at: 20, spawn: { bombers: 1 }, say: [['ovl', 'is.3']] }, { at: 42, spawn: { fighters: 2 }, say: [['ally', 'is.4']] }, { at: 62, spawn: { bombers: 1, fighters: 1 } }] },
          { type: 'SWEEP', spawn: { fighters: 1, hostileAce: true }, say: [['ally', 'is.5'], ['enemy', 'is.6']] },
        ] },
      { id: 'lifeline',    coords: { x: 80, y: 30 }, nameKey: 'op.ironVeil.l6.name', type: 'ESCORT', loreKey: 'op.ironVeil.l6.lore', objectivesKey: 'op.ironVeil.l6.obj', enemyIntelKey: 'op.ironVeil.l6.intel', starUnique: { type: 'noDamage' }, waves: 1,
        spawn: { fighters: 3, aces: 1, bombers: 0, ground: false, weather: 'clear', tod: 0, hostileAce: true },
        objectives: [
          { type: 'SWEEP', spawn: { fighters: 2 }, say: [['ovl', 'll.1']] },
          { type: 'ESCORT', escort: 'transport', label: 'mercy', convoy: 1, spawn: { fighters: 2 }, say: [['ally', 'll.2'], ['ovl', 'll.3']],
            events: [{ at: 24, spawn: { fighters: 2 }, say: [['enemy', 'll.4']] }, { at: 46, spawn: { aces: 1, fighters: 1 }, say: [['ovl', 'll.5']] }] },
        ] },
      { id: 'hammerFall',  coords: { x: 56, y: 54 }, nameKey: 'op.ironVeil.l7.name', type: 'STRIKE', loreKey: 'op.ironVeil.l7.lore', objectivesKey: 'op.ironVeil.l7.obj', enemyIntelKey: 'op.ironVeil.l7.intel', starUnique: { type: 'noFlares' }, waves: 1,
        spawn: { fighters: 3, aces: 0, bombers: 0, ground: true, weather: 'storm', tod: 0, hostileAce: true },
        objectives: [
          { type: 'STRIKE', site: 'fortified', spawn: { fighters: 2 }, say: [['hq', 'hf.1']] },
          { type: 'INTERCEPT', timer: 75, spawn: { bombers: 2 }, say: [['ovl', 'hf.2']] },
          { type: 'STRIKE', site: 'outpost', timer: 90, say: [['hq', 'hf.3']], events: [{ at: 18, spawn: { fighters: 2 }, say: [['wing', 'hf.4']] }] },
        ] },
      { id: 'warlord',     coords: { x: 62, y: 38 }, nameKey: 'op.ironVeil.l8.name', type: 'FINAL', loreKey: 'op.ironVeil.l8.lore', objectivesKey: 'op.ironVeil.l8.obj', enemyIntelKey: 'op.ironVeil.l8.intel', starUnique: { type: 'killsN', n: 6 }, waves: 1, isBoss: true,
        spawn: { fighters: 4, aces: 2, bombers: 0, ground: false, weather: 'storm', tod: 2, hostileAce: false },
        objectives: [
          { type: 'SWEEP', spawn: { fighters: 3, aces: 1 }, say: [['ovl', 'wl.1'], ['enemy', 'wl.2']] },
          { type: 'BOSS', say: [['ovl', 'wl.3']] },
        ],
        boss: { callsignKey: 'boss.warlord', introKey: 'comms.wl.boss', phases: [
          { descKey: 'boss.warlord.p1', turnMul: 1.0, fireMul: 1.0, extraMissiles: 0 },
          { descKey: 'boss.warlord.p2', turnMul: 1.0, fireMul: 1.3, extraMissiles: 2, weather: 'storm', flags: ['chaff'], say: 'wl.p2' },
          { descKey: 'boss.warlord.p3', turnMul: 1.4, fireMul: 1.0, extraMissiles: 0, pattern: 'headOn', say: 'wl.p3' },
        ] } },
    ],
  },
  {
    id: 'midnightMeridian', biome: 'alpine', nameKey: 'op.midnightMeridian.name', theaterKey: 'op.midnightMeridian.theater', loreKey: 'op.midnightMeridian.lore',
    levels: [
      { id: 'deadChannel',  coords: { x: 30, y: 84 }, nameKey: 'op.midnightMeridian.l1.name', type: 'STEALTH', loreKey: 'op.midnightMeridian.l1.lore', objectivesKey: 'op.midnightMeridian.l1.obj', enemyIntelKey: 'op.midnightMeridian.l1.intel', starUnique: { type: 'noFlares' }, waves: 1,
        spawn: { fighters: 2, aces: 0, bombers: 0, ground: true, weather: 'fog', tod: 2, hostileAce: false },
        objectives: [
          { type: 'STEALTH', wp: 1, say: [['ovl', 'dc.1']] },
          { type: 'STRIKE', site: 'outpost', say: [['hq', 'dc.2']] },
          { type: 'SWEEP', spawn: { fighters: 3 }, say: [['enemy', 'dc.3'], ['wing', 'dc.4']] },
        ] },
      { id: 'ghostSignal',  coords: { x: 52, y: 72 }, nameKey: 'op.midnightMeridian.l2.name', type: 'RECON', loreKey: 'op.midnightMeridian.l2.lore', objectivesKey: 'op.midnightMeridian.l2.obj', enemyIntelKey: 'op.midnightMeridian.l2.intel', starUnique: { type: 'accuracy', n: 45 }, waves: 1,
        spawn: { fighters: 2, aces: 0, bombers: 0, ground: false, weather: 'fog', tod: 2, hostileAce: false },
        objectives: [
          { type: 'RECON', wp: 2, say: [['hq', 'gs.1'], ['wing', 'gs.2']] },
          { type: 'STRIKE', site: 'outpost', say: [['hq', 'gs.3']] },
          { type: 'INTERCEPT', timer: 80, spawn: { bombers: 3 }, say: [['ovl', 'gs.4']], events: [{ at: 18, spawn: { fighters: 2 }, say: [['ovl', 'gs.5']] }] },
        ] },
      { id: 'coldIron',     coords: { x: 74, y: 62 }, nameKey: 'op.midnightMeridian.l3.name', type: 'FURBALL', loreKey: 'op.midnightMeridian.l3.lore', objectivesKey: 'op.midnightMeridian.l3.obj', enemyIntelKey: 'op.midnightMeridian.l3.intel', starUnique: { type: 'accuracy', n: 45 }, waves: 1,
        spawn: { fighters: 4, aces: 0, bombers: 0, ground: false, weather: 'storm', tod: 1, hostileAce: true },
        objectives: [
          { type: 'SWEEP', spawn: { fighters: 2 }, say: [['ovl', 'ci.1']], events: [{ at: 14, spawn: { fighters: 2 }, say: [['ovl', 'ci.2']] }] },
          { type: 'SWEEP', spawn: { fighters: 2, hostileAce: true }, say: [['enemy', 'ci.3'], ['wing', 'ci.4']] },
        ] },
      { id: 'ironCurtain',  coords: { x: 60, y: 24 }, nameKey: 'op.midnightMeridian.l4.name', type: 'INTERCEPT', loreKey: 'op.midnightMeridian.l4.lore', objectivesKey: 'op.midnightMeridian.l4.obj', enemyIntelKey: 'op.midnightMeridian.l4.intel', starUnique: { type: 'noDamage' }, waves: 1,
        spawn: { fighters: 3, aces: 0, bombers: 3, ground: false, weather: 'fog', tod: 1, hostileAce: true },
        objectives: [
          { type: 'INTERCEPT', timer: 85, spawn: { bombers: 2, fighters: 2 }, say: [['ovl', 'ic.1']] },
          { type: 'INTERCEPT', timer: 80, spawn: { bombers: 3 }, say: [['ovl', 'ic.2']], events: [{ at: 12, spawn: { fighters: 2 }, say: [['enemy', 'ic.3']] }] },
          { type: 'STRIKE', site: 'outpost', say: [['hq', 'ic.4']] },
        ] },
      { id: 'lastLine',     coords: { x: 16, y: 56 }, nameKey: 'op.midnightMeridian.l5.name', type: 'DEFEND', loreKey: 'op.midnightMeridian.l5.lore', objectivesKey: 'op.midnightMeridian.l5.obj', enemyIntelKey: 'op.midnightMeridian.l5.intel', starUnique: { type: 'killsN', n: 10 }, waves: 1,
        spawn: { fighters: 3, aces: 1, bombers: 2, ground: false, weather: 'storm', tod: 2, hostileAce: true },
        objectives: [
          { type: 'DEFEND', asset: 'outpost', label: 'sigint', hold: 90, spawn: { fighters: 2 }, say: [['ally', 'lnl.1'], ['ovl', 'lnl.2']],
            events: [{ at: 18, spawn: { bombers: 1 }, say: [['ovl', 'lnl.3']] }, { at: 38, spawn: { fighters: 2 } }, { at: 58, spawn: { bombers: 2 }, say: [['ally', 'lnl.4']] }, { at: 72, spawn: { fighters: 1 } }] },
          { type: 'SWEEP', spawn: { fighters: 1, hostileAce: true }, say: [['ally', 'lnl.5']] },
        ] },
      { id: 'longReach',    coords: { x: 46, y: 46 }, nameKey: 'op.midnightMeridian.l6.name', type: 'STRIKE', loreKey: 'op.midnightMeridian.l6.lore', objectivesKey: 'op.midnightMeridian.l6.obj', enemyIntelKey: 'op.midnightMeridian.l6.intel', starUnique: { type: 'fastClear', n: 330 }, waves: 1,
        spawn: { fighters: 3, aces: 1, bombers: 0, ground: true, weather: 'storm', tod: 1, hostileAce: true },
        objectives: [
          { type: 'SWEEP', spawn: { fighters: 2 }, say: [['ovl', 'lr.1']] },
          { type: 'STRIKE', site: 'fortified', timer: 110, say: [['hq', 'lr.2']], events: [{ at: 30, spawn: { fighters: 2 }, say: [['wing', 'lr.3']] }] },
          { type: 'INTERCEPT', timer: 75, spawn: { bombers: 2 }, say: [['ovl', 'lr.4']] },
        ] },
      { id: 'extraction',   coords: { x: 24, y: 30 }, nameKey: 'op.midnightMeridian.l7.name', type: 'ESCORT', loreKey: 'op.midnightMeridian.l7.lore', objectivesKey: 'op.midnightMeridian.l7.obj', enemyIntelKey: 'op.midnightMeridian.l7.intel', starUnique: { type: 'flawless' }, waves: 1,
        spawn: { fighters: 4, aces: 1, bombers: 0, ground: false, weather: 'storm', tod: 2, hostileAce: true },
        objectives: [
          { type: 'ESCORT', escort: 'transport', label: 'dustoff', convoy: 1, spawn: { fighters: 2 }, say: [['ally', 'ex.1'], ['ovl', 'ex.2']],
            events: [{ at: 20, spawn: { fighters: 2 }, say: [['enemy', 'ex.3']] }, { at: 44, spawn: { fighters: 2, aces: 1 }, say: [['ovl', 'ex.4']] }] },
          { type: 'SWEEP', spawn: { fighters: 3 }, say: [['ally', 'ex.5'], ['ovl', 'ex.6']] },
        ] },
      { id: 'glacier',      coords: { x: 50, y: 14 }, nameKey: 'op.midnightMeridian.l8.name', type: 'FINAL', loreKey: 'op.midnightMeridian.l8.lore', objectivesKey: 'op.midnightMeridian.l8.obj', enemyIntelKey: 'op.midnightMeridian.l8.intel', starUnique: { type: 'accuracy', n: 40 }, waves: 1, isBoss: true,
        spawn: { fighters: 4, aces: 2, bombers: 0, ground: false, weather: 'storm', tod: 1, hostileAce: false },
        objectives: [
          { type: 'STRIKE', site: 'fortified', spawn: { fighters: 2 }, say: [['hq', 'gl.1']] },
          { type: 'BOSS', say: [['ovl', 'gl.2']] },
        ],
        boss: { callsignKey: 'boss.glacier', introKey: 'comms.gl.boss', phases: [
          { descKey: 'boss.glacier.p1', turnMul: 0.8, fireMul: 1.0, extraMissiles: 2, pattern: 'standoff', weather: 'fog', tod: 2 },
          { descKey: 'boss.glacier.p2', turnMul: 1.3, fireMul: 1.2, extraMissiles: 0, weather: 'storm', say: 'gl.p2' },
          { descKey: 'boss.glacier.p3', turnMul: 1.4, fireMul: 1.0, extraMissiles: 0, pattern: 'dive', say: 'gl.p3' },
        ] } },
    ],
  },
  {
    id: 'sunfireHorizon', biome: 'desert', nameKey: 'op.sunfireHorizon.name', theaterKey: 'op.sunfireHorizon.theater', loreKey: 'op.sunfireHorizon.lore',
    levels: [
      { id: 'openWater',     coords: { x: 22, y: 86 }, nameKey: 'op.sunfireHorizon.l1.name', type: 'FURBALL', loreKey: 'op.sunfireHorizon.l1.lore', objectivesKey: 'op.sunfireHorizon.l1.obj', enemyIntelKey: 'op.sunfireHorizon.l1.intel', starUnique: { type: 'noFlares' }, waves: 1,
        spawn: { fighters: 4, aces: 0, bombers: 0, ground: false, weather: 'clear', tod: 0, hostileAce: true },
        objectives: [
          { type: 'SWEEP', spawn: { fighters: 3 }, say: [['ovl', 'ow.1'], ['wing', 'ow.2']], events: [{ at: 18, spawn: { fighters: 2 }, say: [['ovl', 'ow.3']] }] },
          { type: 'SWEEP', spawn: { fighters: 2, hostileAce: true }, say: [['enemy', 'ow.4']] },
        ] },
      { id: 'sunscreen',     coords: { x: 78, y: 74 }, nameKey: 'op.sunfireHorizon.l2.name', type: 'INTERCEPT', loreKey: 'op.sunfireHorizon.l2.lore', objectivesKey: 'op.sunfireHorizon.l2.obj', enemyIntelKey: 'op.sunfireHorizon.l2.intel', starUnique: { type: 'gunOnly' }, waves: 1,
        spawn: { fighters: 3, aces: 1, bombers: 2, ground: false, weather: 'clear', tod: 0, hostileAce: true },
        objectives: [
          { type: 'INTERCEPT', timer: 80, spawn: { bombers: 2, fighters: 2 }, say: [['ovl', 'ss.1'], ['wing', 'ss.2']] },
          { type: 'SWEEP', spawn: { fighters: 3, aces: 1 }, say: [['ovl', 'ss.3'], ['enemy', 'ss.4']] },
        ] },
      { id: 'deadReckoning', coords: { x: 50, y: 64 }, nameKey: 'op.sunfireHorizon.l3.name', type: 'RECON', loreKey: 'op.sunfireHorizon.l3.lore', objectivesKey: 'op.sunfireHorizon.l3.obj', enemyIntelKey: 'op.sunfireHorizon.l3.intel', starUnique: { type: 'noDamage' }, waves: 1,
        spawn: { fighters: 2, aces: 0, bombers: 0, ground: false, weather: 'clear', tod: 1, hostileAce: false },
        objectives: [
          { type: 'RECON', wp: 2, say: [['hq', 'dr.1']] },
          { type: 'SWEEP', spawn: { fighters: 3 }, say: [['ovl', 'dr.2']] },
          { type: 'STRIKE', site: 'outpost', timer: 90, say: [['hq', 'dr.3']] },
        ] },
      { id: 'shieldwall',    coords: { x: 14, y: 70 }, nameKey: 'op.sunfireHorizon.l4.name', type: 'DEFEND', loreKey: 'op.sunfireHorizon.l4.lore', objectivesKey: 'op.sunfireHorizon.l4.obj', enemyIntelKey: 'op.sunfireHorizon.l4.intel', starUnique: { type: 'noDamage' }, waves: 1,
        spawn: { fighters: 3, aces: 1, bombers: 2, ground: true, weather: 'storm', tod: 0, hostileAce: true },
        objectives: [
          { type: 'DEFEND', asset: 'ship', label: 'frigate', hold: 90, spawn: { fighters: 2 }, say: [['ally', 'sw.1'], ['ovl', 'sw.2']],
            events: [{ at: 16, spawn: { bombers: 1 }, say: [['ovl', 'sw.3']] }, { at: 36, spawn: { fighters: 2 } }, { at: 50, spawn: { drones: 5 }, say: [['wing', 'sw.4']] }, { at: 64, spawn: { bombers: 2 }, say: [['ally', 'sw.5']] }] },
          { type: 'SWEEP', spawn: { fighters: 2, aces: 1 }, say: [['ally', 'sw.6']] },
        ] },
      { id: 'lifeguard',     coords: { x: 20, y: 44 }, nameKey: 'op.sunfireHorizon.l5.name', type: 'ESCORT', loreKey: 'op.sunfireHorizon.l5.lore', objectivesKey: 'op.sunfireHorizon.l5.obj', enemyIntelKey: 'op.sunfireHorizon.l5.intel', starUnique: { type: 'fastClear', n: 240 }, waves: 1,
        spawn: { fighters: 3, aces: 1, bombers: 0, ground: false, weather: 'clear', tod: 1, hostileAce: true },
        objectives: [
          { type: 'SWEEP', spawn: { fighters: 2 }, say: [['ovl', 'lg.1']] },
          { type: 'ESCORT', escort: 'transport', label: 'lifeguard', convoy: 1, spawn: { fighters: 2 }, say: [['ally', 'lg.2']],
            events: [{ at: 20, spawn: { fighters: 2 }, say: [['enemy', 'lg.3']] }, { at: 42, spawn: { aces: 1, fighters: 1 }, say: [['ovl', 'lg.4']] }] },
        ] },
      { id: 'silentEntry',   coords: { x: 46, y: 48 }, nameKey: 'op.sunfireHorizon.l6.name', type: 'STEALTH', loreKey: 'op.sunfireHorizon.l6.lore', objectivesKey: 'op.sunfireHorizon.l6.obj', enemyIntelKey: 'op.sunfireHorizon.l6.intel', starUnique: { type: 'alliesIntact' }, waves: 1,
        spawn: { fighters: 3, aces: 0, bombers: 0, ground: true, weather: 'fog', tod: 2, hostileAce: false },
        objectives: [
          { type: 'STEALTH', wp: 1, say: [['ovl', 'se.1']] },
          { type: 'STRIKE', site: 'outpost', say: [['hq', 'se.2']] },
          { type: 'ESCORT', escort: 'truck', convoy: 4, spawn: { fighters: 2 }, say: [['ally', 'se.3'], ['ovl', 'se.4']],
            events: [{ at: 22, spawn: { fighters: 2 }, say: [['enemy', 'se.5']] }, { at: 48, spawn: { bombers: 1 }, say: [['ovl', 'se.6']] }] },
        ] },
      { id: 'firstVolley',   coords: { x: 70, y: 38 }, nameKey: 'op.sunfireHorizon.l7.name', type: 'STRIKE', loreKey: 'op.sunfireHorizon.l7.lore', objectivesKey: 'op.sunfireHorizon.l7.obj', enemyIntelKey: 'op.sunfireHorizon.l7.intel', starUnique: { type: 'gunOnly' }, waves: 1,
        spawn: { fighters: 3, aces: 1, bombers: 0, ground: true, weather: 'storm', tod: 1, hostileAce: true },
        objectives: [
          { type: 'STRIKE', site: 'fortified', timer: 120, spawn: { fighters: 2 }, say: [['hq', 'fv.1'], ['wing', 'fv.2']] },
          { type: 'SWEEP', spawn: { fighters: 2, hostileAce: true }, say: [['ovl', 'fv.3']] },
          { type: 'INTERCEPT', timer: 75, spawn: { bombers: 2 }, say: [['ovl', 'fv.4']] },
        ] },
      { id: 'secondSun',     coords: { x: 40, y: 26 }, nameKey: 'op.sunfireHorizon.l8.name', type: 'STRIKE', loreKey: 'op.sunfireHorizon.l8.lore', objectivesKey: 'op.sunfireHorizon.l8.obj', enemyIntelKey: 'op.sunfireHorizon.l8.intel', starUnique: { type: 'killsN', n: 12 }, waves: 1,
        spawn: { fighters: 4, aces: 1, bombers: 0, ground: true, weather: 'storm', tod: 2, hostileAce: true },
        objectives: [
          { type: 'SWEEP', spawn: { fighters: 2, drones: 6 }, say: [['ovl', 'sn.1']] },
          { type: 'STRIKE', site: 'fortified', timer: 140, say: [['hq', 'sn.2']], events: [{ at: 24, spawn: { fighters: 2 }, say: [['enemy', 'sn.3']] }, { at: 55, spawn: { aces: 1 } }] },
          { type: 'SWEEP', spawn: { fighters: 3 }, say: [['wing', 'sn.4']] },
        ] },
      { id: 'corsair',       coords: { x: 66, y: 18 }, nameKey: 'op.sunfireHorizon.l9.name', type: 'FINAL', loreKey: 'op.sunfireHorizon.l9.lore', objectivesKey: 'op.sunfireHorizon.l9.obj', enemyIntelKey: 'op.sunfireHorizon.l9.intel', starUnique: { type: 'fastClear', n: 300 }, waves: 1, isBoss: true,
        spawn: { fighters: 4, aces: 2, bombers: 0, ground: false, weather: 'storm', tod: 2, hostileAce: false },
        objectives: [
          { type: 'SWEEP', spawn: { fighters: 3, aces: 1 }, say: [['ovl', 'cs.1'], ['enemy', 'cs.2']] },
          { type: 'BOSS', say: [['ovl', 'cs.3']] },
        ],
        boss: { callsignKey: 'boss.corsair', introKey: 'comms.cs.boss', phases: [
          { descKey: 'boss.corsair.p1', turnMul: 1.2, fireMul: 1.0, extraMissiles: 0, flags: ['mirror'] },
          { descKey: 'boss.corsair.p2', turnMul: 1.2, fireMul: 1.3, extraMissiles: 2, say: 'cs.p2' },
          { descKey: 'boss.corsair.p3', turnMul: 1.5, fireMul: 1.3, extraMissiles: 2, pattern: 'headOn', say: 'cs.p3' },
        ] } },
    ],
  },
  {
    id: 'polarVortex', biome: 'arctic', nameKey: 'op.polarVortex.name', theaterKey: 'op.polarVortex.theater', loreKey: 'op.polarVortex.lore',
    levels: [
      { id: 'iceBreaker',  coords: { x: 20, y: 84 }, nameKey: 'op.polarVortex.l1.name', type: 'RECON', loreKey: 'op.polarVortex.l1.lore', objectivesKey: 'op.polarVortex.l1.obj', enemyIntelKey: 'op.polarVortex.l1.intel', starUnique: { type: 'fastClear', n: 240 }, waves: 1,
        spawn: { fighters: 2, aces: 0, bombers: 0, ground: false, weather: 'fog', tod: 0, hostileAce: false },
        objectives: [
          { type: 'RECON', wp: 2, say: [['ovl', 'ib.1'], ['wing', 'ib.2']] },
          { type: 'STRIKE', site: 'outpost', say: [['hq', 'ib.3']] },
          { type: 'SWEEP', spawn: { fighters: 2 }, say: [['enemy', 'ib.4']] },
        ] },
      { id: 'coldStart',   coords: { x: 44, y: 74 }, nameKey: 'op.polarVortex.l2.name', type: 'FURBALL', loreKey: 'op.polarVortex.l2.lore', objectivesKey: 'op.polarVortex.l2.obj', enemyIntelKey: 'op.polarVortex.l2.intel', starUnique: { type: 'gunOnly' }, waves: 1,
        spawn: { fighters: 4, aces: 0, bombers: 0, ground: false, weather: 'clear', tod: 0, hostileAce: true },
        objectives: [
          { type: 'SWEEP', spawn: { fighters: 4 }, say: [['ovl', 'cst.1'], ['wing', 'cst.2']] },
          { type: 'SWEEP', spawn: { fighters: 1, hostileAce: true }, say: [['enemy', 'cst.3']], events: [{ at: 15, spawn: { fighters: 2 }, say: [['ovl', 'cst.4']] }] },
        ] },
      { id: 'whiteout',    coords: { x: 70, y: 78 }, nameKey: 'op.polarVortex.l3.name', type: 'STEALTH', loreKey: 'op.polarVortex.l3.lore', objectivesKey: 'op.polarVortex.l3.obj', enemyIntelKey: 'op.polarVortex.l3.intel', starUnique: { type: 'noFlares' }, waves: 1,
        spawn: { fighters: 2, aces: 0, bombers: 0, ground: true, weather: 'fog', tod: 2, hostileAce: false },
        objectives: [
          { type: 'STEALTH', wp: 1, say: [['ovl', 'wo.1']] },
          { type: 'STRIKE', site: 'outpost', say: [['hq', 'wo.2']] },
          { type: 'SWEEP', spawn: { fighters: 3 }, say: [['enemy', 'wo.3'], ['wing', 'wo.4']] },
        ] },
      { id: 'hardFreeze',  coords: { x: 60, y: 50 }, nameKey: 'op.polarVortex.l4.name', type: 'INTERCEPT', loreKey: 'op.polarVortex.l4.lore', objectivesKey: 'op.polarVortex.l4.obj', enemyIntelKey: 'op.polarVortex.l4.intel', starUnique: { type: 'accuracy', n: 40 }, waves: 1,
        spawn: { fighters: 3, aces: 0, bombers: 3, ground: false, weather: 'storm', tod: 1, hostileAce: true },
        objectives: [
          { type: 'INTERCEPT', timer: 85, spawn: { bombers: 2, fighters: 2 }, say: [['ovl', 'hz.1']] },
          { type: 'INTERCEPT', timer: 85, spawn: { bombers: 3, fighters: 1 }, say: [['ovl', 'hz.2']], events: [{ at: 20, spawn: { hostileAce: true }, say: [['enemy', 'hz.3']] }] },
        ] },
      { id: 'polarNight',  coords: { x: 28, y: 40 }, nameKey: 'op.polarVortex.l5.name', type: 'DEFEND', loreKey: 'op.polarVortex.l5.lore', objectivesKey: 'op.polarVortex.l5.obj', enemyIntelKey: 'op.polarVortex.l5.intel', starUnique: { type: 'flawless' }, waves: 1,
        spawn: { fighters: 3, aces: 1, bombers: 1, ground: false, weather: 'storm', tod: 2, hostileAce: true },
        objectives: [
          { type: 'DEFEND', asset: 'outpost', label: 'listening', hold: 95, spawn: { fighters: 2 }, say: [['ally', 'pn.1'], ['ovl', 'pn.2']],
            events: [{ at: 16, spawn: { bombers: 1 }, say: [['ovl', 'pn.3']] }, { at: 36, spawn: { fighters: 2 } }, { at: 54, spawn: { bombers: 1, fighters: 1 }, say: [['ally', 'pn.4']] }, { at: 74, spawn: { fighters: 2 } }] },
          { type: 'SWEEP', spawn: { fighters: 1, hostileAce: true }, say: [['ally', 'pn.5']] },
        ] },
      { id: 'iceRoad',     coords: { x: 14, y: 60 }, nameKey: 'op.polarVortex.l6.name', type: 'ESCORT', loreKey: 'op.polarVortex.l6.lore', objectivesKey: 'op.polarVortex.l6.obj', enemyIntelKey: 'op.polarVortex.l6.intel', starUnique: { type: 'noDamage' }, waves: 1,
        spawn: { fighters: 3, aces: 1, bombers: 0, ground: false, weather: 'fog', tod: 1, hostileAce: true },
        objectives: [
          { type: 'ESCORT', escort: 'transport', label: 'hammer', convoy: 2, required: 1, spawn: { fighters: 2 }, say: [['ally', 'ir.1'], ['ovl', 'ir.2']],
            events: [{ at: 20, spawn: { fighters: 2 }, say: [['enemy', 'ir.3']] }, { at: 42, spawn: { fighters: 2, hostileAce: true }, say: [['ovl', 'ir.4']] }] },
          { type: 'STRIKE', site: 'outpost', timer: 90, say: [['ally', 'ir.5'], ['hq', 'ir.6']] },
        ] },
      { id: 'thinIce',     coords: { x: 50, y: 30 }, nameKey: 'op.polarVortex.l7.name', type: 'STRIKE', loreKey: 'op.polarVortex.l7.lore', objectivesKey: 'op.polarVortex.l7.obj', enemyIntelKey: 'op.polarVortex.l7.intel', starUnique: { type: 'killsN', n: 10 }, waves: 1,
        spawn: { fighters: 3, aces: 0, bombers: 0, ground: true, weather: 'storm', tod: 0, hostileAce: true },
        objectives: [
          { type: 'SWEEP', spawn: { fighters: 2 }, say: [['ovl', 'ti.1']] },
          { type: 'STRIKE', site: 'fortified', timer: 130, spawn: { fighters: 1 }, say: [['hq', 'ti.2']], events: [{ at: 30, spawn: { fighters: 2 }, say: [['wing', 'ti.3']] }] },
          { type: 'INTERCEPT', timer: 70, spawn: { bombers: 2 }, say: [['ovl', 'ti.4']] },
        ] },
      { id: 'northWind',   coords: { x: 72, y: 20 }, nameKey: 'op.polarVortex.l8.name', type: 'FINAL', loreKey: 'op.polarVortex.l8.lore', objectivesKey: 'op.polarVortex.l8.obj', enemyIntelKey: 'op.polarVortex.l8.intel', starUnique: { type: 'killsN', n: 6 }, waves: 1, isBoss: true,
        spawn: { fighters: 4, aces: 2, bombers: 0, ground: false, weather: 'storm', tod: 2, hostileAce: false },
        objectives: [
          { type: 'SWEEP', spawn: { fighters: 3, aces: 1 }, say: [['ovl', 'nw.1'], ['enemy', 'nw.2']] },
          { type: 'BOSS', say: [['ovl', 'nw.3']] },
        ],
        boss: { callsignKey: 'boss.boreas', introKey: 'comms.nw.boss', phases: [
          { descKey: 'boss.boreas.p1', turnMul: 0.9, fireMul: 1.0, extraMissiles: 2, pattern: 'standoff', weather: 'storm', tod: 2 },
          { descKey: 'boss.boreas.p2', turnMul: 1.2, fireMul: 1.3, extraMissiles: 2, weather: 'fog', flags: ['chaff'], say: 'nw.p2' },
          { descKey: 'boss.boreas.p3', turnMul: 1.5, fireMul: 1.0, extraMissiles: 0, pattern: 'headOn', say: 'nw.p3' },
        ] } },
    ],
  },
];

// PURE: build the spawn plan for a level row. Reads the level's hand-authored `spawn` budget
// verbatim and adds the typed-mission descriptor + boss flag.
// Returns a NEW object; the level row is never mutated.
function levelPlan(lvl) {
  const s = lvl.spawn || {};
  const plan = {
    fighters: s.fighters, aces: s.aces, bombers: s.bombers,
    ground: !!s.ground, weather: s.weather, tod: s.tod,
    hostileAce: !!s.hostileAce,
    rival: false, depot: false,
    mission: sectorMission(lvl.type),
    boss: lvl.type === 'FINAL',
  };
  // multi-phase objective sequence: pass the authored queue through so
  // startSectorMission walks it phase-by-phase. `mission` above stays the FIRST phase's verb.
  if (Array.isArray(lvl.objectives) && lvl.objectives.length) plan.objectives = lvl.objectives;
  return plan;
}
// i18n key for a level's mission-card / briefing blurb. Derived from the regular
// nameKey ('op.<id>.l<N>.name' -> '.blurb') so every level exposes one without 25 duplicate fields;
// an explicit lvl.missionBlurbKey overrides. Pure.
function levelBlurbKey(lvl) {
  if (!lvl) return null;
  if (lvl.missionBlurbKey) return lvl.missionBlurbKey;
  return lvl.nameKey ? lvl.nameKey.replace(/\.name$/, '.blurb') : null;
}
// sector type -> mission type for the typed-mission layer (missions.js). Pure + deterministic.
// ESCORT/DEFEND are first-class objective sectors; ELITE is a no-objective elite-ace furball.
function sectorMission(type) {
  if (type === 'FURBALL') return 'sweep';
  if (type === 'INTERCEPT') return 'intercept';
  if (type === 'STRIKE') return 'strike';
  if (type === 'ESCORT') return 'escort';
  if (type === 'DEFEND') return 'defend';
  if (type === 'RECON') return 'recon';
  if (type === 'STEALTH') return 'stealth';
  if (type === 'ELITE') return 'none';
  if (type === 'DEPOT') return 'none';
  return 'boss';   // FINAL
}

/* CommonJS export for Node tests — inert in the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OPERATIONS, levelPlan, levelBlurbKey, sectorMission };
}
