/* Dev-only headless verification of the Operations objective SEQUENCE (multi-phase levels) — the
   browser-only glue the Node unit tests can't reach: the phase WALK (startSectorMission ->
   onMissionResolved advance), the Req D objective CALLOUT render, and the Req B distinct marker.
   Drives ONE converted level (ironVeil.firstLight: RECON -> STRIKE) by stubbing the minimal runtime
   state the phase runner touches, then simulating phase wins. Usage: node scripts/verify-objective-phases.mjs */
import { launchGame, bootToHangar } from './lib/boot.mjs';
const { page, port, close } = await launchGame({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
await bootToHangar(page, { port, gotoWait: 1400, mode: 'langOnly', langSelector: '[data-lang="en"]', wait: 200 });

const R = await page.evaluate(() => {
  const out = [];
  const ok = (name, cond) => out.push({ name, pass: !!cond });

  // ---- minimal runtime stubs so the phase runner can execute outside a full arena launch ----
  player = player || {}; player.group = player.group || { position: new THREE.Vector3(0, 1200, 0) };
  if (typeof player.tp !== 'number') player.tp = 0; if (typeof player.score !== 'number') player.score = 0;
  player.rpMul = player.rpMul || 1; player.scoreMul = player.scoreMul || 1; player.firingT = 0;
  enemies = enemies || []; enemies.length = 0;
  pendingSpawns = pendingSpawns || []; pendingSpawns.length = 0;
  run = run || {}; run.missions = 0; run.sectorAceSpawned = run.sectorAceSpawned || {}; run.setpieceDone = run.setpieceDone || {};
  campaignMode = true; campaignOpId = 'ironVeil'; campaignLevelIdx = 0; wave = 1;

  // ---- build the AUTHORED plan for the converted level + walk it ----
  const lvl = currentCampaignLevel();
  ok('level resolved = ironVeil.firstLight', lvl && lvl.id === 'firstLight');
  const plan = levelPlan(lvl);
  ok('plan carries the objectives sequence (2 phases)', Array.isArray(plan.objectives) && plan.objectives.length === 2);

  // PHASE 1
  startSectorMission(plan, wave);
  ok('phase 1 mission = recon', mission && mission.type === 'recon');
  ok('recon opener trimmed to wp:2', mission && mission.target === 2 && (mission.params.count === 2));
  ok('queue initialized at phase 0 of 2', missionSeq && missionSeq.phases.length === 2 && missionSeq.idx === 0);
  ok('objective callout fired for phase 1/2', objectiveCallout && objectiveCallout.total === 2 && objectiveCallout.phase === 1 && objectiveCallout.text);
  const calloutP1 = objectiveCallout.text;

  // Req D render proof: drawObjectiveCallout writes the orange header + the objective line to the ctx
  const draws = [];
  const recCtx = { save() {}, restore() {}, fillRect() {}, measureText() { return { width: 120 }; }, fillText(s) { draws.push({ s, fill: this.fillStyle }); }, set fillStyle(v) { this._f = v; }, get fillStyle() { return this._f; }, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {} };
  drawObjectiveCallout(recCtx, 640, 400, 1);
  ok('callout renders the localized "NEW OBJECTIVE" header in waypoint orange',
    draws.some(d => String(d.fill).includes('255,138,28')) && draws.some(d => String(d.s).indexOf(t('objective.new')) === 0));
  ok('callout renders the objective line text', draws.some(d => d.s === calloutP1));

  // PHASE 1 -> 2 : simulate the recon win
  onMissionResolved(true);
  ok('advanced to phase 2 mission = strike', mission && mission.type === 'strike');
  ok('queue index advanced to 1 (still active, not complete)', missionSeq && missionSeq.idx === 1);
  ok('objective callout re-fired for phase 2/2', objectiveCallout && objectiveCallout.phase === 2);
  ok('phase-2 callout text differs from phase-1', objectiveCallout.text !== calloutP1);

  // PHASE 2 win = LAST phase -> level/sector completes
  const tp0 = player.tp, missions0 = run.missions;
  onMissionResolved(true);
  ok('sequence exhausted -> queue cleared (level complete path)', missionSeq === null);
  ok('run.missions incremented once for the level (not per phase)', run.missions === missions0 + 1);
  ok('completion paid an RP bonus', player.tp > tp0);

  // Req B marker: a dedicated, distinct waypoint colour + the renderer is wired
  ok('HUD.waypoint is the dedicated orange', HUD.waypoint === '255,138,28');
  const others = [HUD.danger, HUD.ok, HUD.reward, HUD.primary, HUD.primaryBright, HUD.velvec, HUD.boss, HUD.rival];
  ok('waypoint colour is NOT reused by any other HUD marker', !others.includes(HUD.waypoint));
  ok('drawMissionWaypoint renderer exists', typeof drawMissionWaypoint === 'function');

  return out;
});

await close();

let fail = 0;
for (const r of R) { console.log((r.pass ? 'ok   - ' : 'FAIL - ') + r.name); if (!r.pass) fail++; }
if (errs.length) { console.log('\nPAGE ERRORS:'); errs.forEach(e => console.log('  ' + e)); }
console.log('\n' + (fail === 0 && errs.length === 0 ? 'OBJECTIVE-PHASES VERIFY PASS' : 'OBJECTIVE-PHASES VERIFY FAIL (' + fail + ' assertion(s)' + (errs.length ? ' + ' + errs.length + ' page error(s)' : '') + ')'));
process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
