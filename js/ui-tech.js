/* SKYSTRIKE — split from ui.js (god-file refactor). Global scope; load order among ui-*.js irrelevant, but all must load after deps and before controls.js/main.js. */
/* ui-tech.js: tech-tree screen, frontier draft, armory, op map, deploy. */
/* ---------------- tech tree (between-wave R&D) ---------------- */
let pendingUpgrades = null;   // retained no-op (legacy reset references)
let techPanMoved = false;     // true while the player is dragging to pan the tree (suppresses the click)
const TECH_COLW = 160, TECH_ROWH = 130, TECH_NODEW = 152, TECH_NODEH = 104, TECH_PAD = 28;
let techTab = 'tech';
function owns(id) { return player.tech.indexOf(id) >= 0; }
function repeatCount(node) { return player.techRepeat[node.id] || 0; }
function nodeCost(node) { return node.repeat ? node.cost + (node.costStep || 0) * repeatCount(node) : node.cost; }
// reqSatisfied(node, ownsFn, byId, groundOn) → js/core.js (pure, require-safe; tests import the real impl). Called below at call-time.
/* ---------------- FRONTIER DRAFT (feature 4) ----------------
   Run-scoped draft state. The full tech tree still renders (positions/connectors unchanged); only a
   few currently-unlockable FRONTIER nodes are OFFERED as buyable each visit. PIN biases the offer
   toward a goal's prereq path; REROLL re-rolls once per visit; PITY force-includes a long-skipped node.
   Pure draft logic lives in core.js (frontierEligible/prereqPath/draftOffer); this is just the glue.
   Reset in startGame(). Scoped to the TECH tab only — the ARMORY tab keeps its full-list behaviour. */
let draftState = { seed: 0, visit: 0, offer: [], drafted: false, rerollUsed: false, pin: null, pity: {}, selected: null };
function resetDraftState() {
  draftState = { seed: (Math.random() * 0x7fffffff) | 0, visit: 0, offer: [], drafted: false, rerollUsed: false, pin: null, pity: {}, selected: null };
}
function inOffer(id) { return draftState.offer.indexOf(id) >= 0; }
// the per-visit frontier: currently-unlockable, unowned (repeatables stay), applicable tech-tab nodes.
function draftFrontier() {
  const treeNodes = TECH_TREE.filter(n => !n.tab || n.tab === 'tech');
  return frontierEligible(treeNodes, {
    owns,
    reqSatisfied: (n) => reqSatisfied(n, owns, TECH_BY_ID, groundWar),
    applicable: (n) => nodeState(n) !== 'hidden' && nodeState(n) !== 'na' && nodeState(n) !== 'bought',
  });
}
// roll the offer for this visit. `sub` salts the seed (reroll passes a non-zero salt for a fresh 3).
function rollDraftOffer(sub) {
  const frontier = draftFrontier();
  const pinPath = draftState.pin ? prereqPath(draftState.pin, TECH_BY_ID, owns).filter(inFrontierOf(frontier)) : [];
  const rng = makeRng((draftState.seed ^ (draftState.visit * 0x9e3779b1) ^ ((sub || 0) * 0x85ebca6b)) | 0);
  const res = draftOffer({ frontier, pinPath, pity: draftState.pity, rng, n: DRAFT_OFFER_N });
  draftState.offer = res.offer;
  draftState.pity = res.pity;
}
function inFrontierOf(frontier) { const s = new Set(frontier); return (id) => s.has(id); }
function nodeState(node) {
  if (node.ground && !groundWar) return 'hidden';
  if (!node.repeat && owns(node.id)) return 'bought';
  if (node.ok && !node.ok(player)) return 'na';
  if (!reqSatisfied(node, owns, TECH_BY_ID, groundWar)) return 'locked';
  return player.tp >= nodeCost(node) ? 'avail' : 'cantafford';
}
function openTechScreen() {
  if (!player) return;
  techTab = 'tech';
  // FRONTIER DRAFT: new visit → roll a fresh 3-node offer (deterministic per run seed + visit index),
  // arm the reroll, and clear the "already drafted this visit" flag.
  draftState.visit++;
  draftState.drafted = false;
  draftState.rerollUsed = false;
  draftState.selected = null;          // no pick chosen yet this visit
  rollDraftOffer(0);
  document.querySelectorAll('.tech-tab').forEach(b => { b.classList.toggle('active', b.dataset.tab === 'tech'); b.onclick = () => switchTechTab(b.dataset.tab); });
  renderTechTree(true);
  choosingUpgrade = true; paused = true;
  g('touchControls').classList.remove('show');
  g('upgrade').classList.add('show');
}
function nodeXY(node) { return { left: TECH_PAD + node.x * TECH_COLW, top: TECH_PAD + node.y * TECH_ROWH }; }
// FRONTIER DRAFT display gate: only OFFERED nodes are buyable this visit. A node that would otherwise
// be 'avail'/'cantafford' but isn't in the offer renders as the non-buyable 'lockvisit' state (shown,
// not buyable). Owned/bought/locked/na/hidden pass through unchanged.
function draftDisplayState(node, st) {
  if (st === 'avail' || st === 'cantafford') {
    if (inOffer(node.id)) return st === 'avail' ? 'avail' : 'cantafford';
    return 'lockvisit';   // visible-but-locked-this-visit (not on this visit's frontier offer)
  }
  return st;
}
function renderTechTree(recenter) {
  const rv = g('rpval'); if (rv) rv.textContent = Math.floor(player.tp).toLocaleString();
  const grid = g('techgrid'); if (!grid) return;
  const treeNodes = TECH_TREE.filter(n => !n.tab || n.tab === 'tech');
  let maxX = 0, maxY = 0; for (const n of treeNodes) { if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y; }
  const W = TECH_PAD * 2 + maxX * TECH_COLW + TECH_NODEW;
  const H = TECH_PAD * 2 + maxY * TECH_ROWH + TECH_NODEH;
  // connectors (SVG), drawn first so nodes sit on top
  let svg = '<svg width="' + W + '" height="' + H + '">';
  for (const n of treeNodes) {
    // draw an edge from every parent: `req` entries are OR-gates (solid), `reqAll` are AND-gates (dashed)
    const orReqs = n.req ? (Array.isArray(n.req) ? n.req : [n.req]) : [];
    const edges = orReqs.map(id => ({ id, and: false })).concat((n.reqAll || []).map(id => ({ id, and: true })));
    for (const edge of edges) {
      const p = TECH_BY_ID[edge.id]; if (!p) continue;
      const a = nodeXY(p), b = nodeXY(n);
      const px = a.left + TECH_NODEW / 2, pb = a.top + TECH_NODEH;
      const cx = b.left + TECH_NODEW / 2, ct = b.top;
      const midY = (pb + ct) / 2;
      const lit = owns(edge.id) && (n.repeat ? repeatCount(n) > 0 : owns(n.id));
      const open = owns(edge.id) && nodeState(n) !== 'locked';
      const next = open && nodeState(n) === 'avail';   // parent owned + child affordable → light the path forward
      // tokens: --ok (both owned) · --primary-bright (affordable next) · --primary low (reachable) · --hairline (dormant)
      const col = lit ? '#4dffa0' : next ? '#ffd36b' : open ? 'rgba(255,185,56,.4)' : 'rgba(120,170,140,.34)';
      const dash = edge.and ? ' stroke-dasharray="7,5"' : '';
      svg += '<path d="M' + px + ',' + pb + ' V' + midY + ' H' + cx + ' V' + ct + '" fill="none" stroke="' + col + '" stroke-width="' + (lit ? 3 : 2) + '"' + dash + '/>';
    }
  }
  svg += '</svg>';
  let nodes = '';
  for (const n of treeNodes) {
    const raw = nodeState(n);
    if (raw === 'hidden') continue;
    const st = draftDisplayState(n, raw);   // FRONTIER DRAFT: gate buyability to this visit's offer
    const p = nodeXY(n), ac = FAM_C[n.fam] || '#ffb938';
    const cost = nodeCost(n);
    const offered = inOffer(n.id) && (raw === 'avail' || raw === 'cantafford');   // one of the 3 frontier picks
    const selected = offered && draftState.selected === n.id;                     // the pick chosen this visit
    const passed = offered && draftState.selected && !selected;                   // a fellow offer, set aside
    const pinned = draftState.pin === n.id;
    const costTxt = selected ? t('tech.drafted') : n.id === 'core' ? t('tech.core') : raw === 'bought' ? t('tech.owned') : raw === 'na' ? t('tech.na')
      : st === 'lockvisit' ? t('tech.lockVisit') : cost + ' RP';
    const badge = n.repeat ? '<span class="tn-rep">\u00D7' + repeatCount(n) + '</span>' : '';
    const cls = 'tnode ' + st + (n.repeat ? ' rep' : '') + (offered ? ' offered' : '') + (selected ? ' selected' : '') + (passed ? ' passed' : '') + (pinned ? ' pinned' : '');
    nodes += '<div class="' + cls + '" data-id="' + n.id + '" style="left:' + p.left + 'px;top:' + p.top + 'px;--ac:' + ac + '">' +
      badge +
      (pinned ? '<span class="tn-pin">\u25C8</span>' : '') +
      '<div class="tn-sym">' + n.sym + '</div>' +
      '<div class="tn-name">' + techText(n, 'name') + '</div>' +
      '<div class="tn-desc">' + techText(n, 'desc') + '</div>' +
      '<span class="tn-cost">' + costTxt + '</span>' +
    '</div>';
  }
  grid.innerHTML = '<div id="techcanvas" style="width:' + W + 'px;height:' + H + 'px">' + svg + nodes + '</div>';
  // wire clicks: OFFERED+affordable nodes buy (draft pick); any other non-bought tree node toggles the PIN goal.
  const cv = g('techcanvas');
  cv.querySelectorAll('.tnode.avail.offered').forEach(el => el.addEventListener('click', () => { if (techPanMoved) { techPanMoved = false; return; } const id = el.getAttribute('data-id'); buyNode(TECH_BY_ID[id]); }));
  cv.querySelectorAll('.tnode:not(.offered):not(.bought)').forEach(el => el.addEventListener('click', () => { if (techPanMoved) { techPanMoved = false; return; } togglePin(el.getAttribute('data-id')); }));
  renderDraftBar();
  if (recenter) {
    const rootCX = TECH_PAD + 3 * TECH_COLW + TECH_NODEW / 2;
    grid.scrollLeft = Math.max(0, rootCX - grid.clientWidth / 2);
    grid.scrollTop = 0;
  }
}
// FRONTIER DRAFT control bar: pin readout + reroll button state. Lives in #draftBar (index.html).
function renderDraftBar() {
  const sel = draftState.selected ? TECH_BY_ID[draftState.selected] : null;
  const hint = g('techhint');
  if (hint && techTab === 'tech') hint.textContent = t('tech.hintTree');
  const pinEl = g('draftPin');
  if (pinEl) {
    pinEl.textContent = sel
      ? tf('tech.selectedHint', { name: techText(sel, 'name') })          // a pick is staged → explain confirm/switch
      : draftState.pin
        ? tf('tech.pinned', { name: techText(TECH_BY_ID[draftState.pin], 'name') })
        : t('tech.pinHint');
    pinEl.classList.toggle('active', !!sel || !!draftState.pin);
  }
  const dep = g('techDeploy');
  if (dep) dep.textContent = sel ? tf('tech.deployPick', { name: techText(sel, 'name') }) : t('tech.deployBank');
  const rr = g('techReroll');
  if (rr) { rr.disabled = draftState.rerollUsed || !!sel; rr.textContent = t('tech.reroll'); }   // can't reroll once a pick is staged
}
// PIN: clicking a non-offered tree node sets it as the goal (offers bias toward its prereq path).
// Clicking the already-pinned node clears the pin. Pin persists across visits within the run.
function togglePin(id) {
  if (!id || !TECH_BY_ID[id]) return;
  draftState.pin = (draftState.pin === id) ? null : id;
  audio.ui();
  if (techTab === 'tech') renderTechTree(false);   // re-render to show/clear the pin marker + readout
}
// REROLL: once per visit, re-roll this visit's offer with a fresh sub-seed (pity + pin still applied).
function rerollDraft() {
  if (draftState.rerollUsed || draftState.selected) { audio.ui(); return; }   // no reroll after a pick is staged
  draftState.rerollUsed = true;
  rollDraftOffer(draftState.visit * 7 + 1);   // non-zero salt → a different draw than the visit's first roll
  audio.ui();
  if (techTab === 'tech') renderTechTree(false);
}
function renderArmory() {
  if (!player) return;
  const rv = g('rpval'); if (rv) rv.textContent = Math.floor(player.tp).toLocaleString();
  const grid = g('techgrid'); if (!grid) return;
  const hint = g('techhint');
  if (hint) hint.textContent = t('tech.hintArmory');
  const armNodes = TECH_TREE.filter(n => n.tab === 'armory');
  let html = '<div class="armory-grid">';
  for (const n of armNodes) {
    const st = nodeState(n);
    if (st === 'hidden') continue;
    const ac = FAM_C[n.fam] || '#ffe14d';
    const cost = nodeCost(n);
    const costTxt = st === 'bought' ? t('tech.owned') : st === 'na' ? t('tech.na') : cost + ' RP';
    const badge = n.repeat ? '<span class="tn-rep">\u00D7' + repeatCount(n) + '</span>' : '';
    html += '<div class="tnode ' + st + (n.repeat ? ' rep' : '') + '" data-id="' + n.id + '" style="--ac:' + ac + '">' +
      badge +
      '<div class="tn-sym">' + n.sym + '</div>' +
      '<div class="tn-name">' + techText(n, 'name') + '</div>' +
      '<div class="tn-desc">' + techText(n, 'desc') + '</div>' +
      '<span class="tn-cost">' + costTxt + '</span>' +
    '</div>';
  }
  html += '</div>';
  grid.innerHTML = html;
  grid.querySelectorAll('.tnode.avail').forEach(el => el.addEventListener('click', () => { const id = el.getAttribute('data-id'); buyNode(TECH_BY_ID[id]); }));
}
function switchTechTab(tab) {
  techTab = tab;
  document.querySelectorAll('.tech-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'armory') { renderArmory(); return; }
  const hint = g('techhint');
  if (hint) hint.textContent = t('tech.hintTree');
  renderTechTree(true);
}
const WING_NODES = new Set(['w1', 'w2', 'reserve']);
let pendingWingNode = null;

function buyNode(node) {
  if (!choosingUpgrade || !player || !node) return;
  if (nodeState(node) !== 'avail') { audio.ui(); return; }
  // ARMORY tab: unrestricted, buy-as-many. Wing nodes never live here, but keep the guard for safety.
  if (techTab !== 'tech') {
    if (WING_NODES.has(node.id)) { openWingPicker(node); return; }
    commitNode(node);
    return;
  }
  // FRONTIER DRAFT: commit immediately, then reroll fresh 3 so the player can keep buying with RP.
  if (!inOffer(node.id)) { audio.ui(); return; }
  if (WING_NODES.has(node.id)) { openWingPicker(node); return; }
  commitNode(node);
  rerollAfterPick();
}
function rerollAfterPick() {
  draftState.visit++;
  draftState.drafted = false;
  draftState.rerollUsed = false;
  draftState.selected = null;
  rollDraftOffer(0);
  renderTechTree(false);
}

function commitNode(node) {
  const cost = nodeCost(node);
  player.tp -= cost;
  node.apply(player);
  if (node.repeat) { player.techRepeat[node.id] = repeatCount(node) + 1; }
  else { player.tech.push(node.id); player.upgrades.push(node.id); }
  audio.power(); empFlash = 0.26;
  showBanner(tf('banner.researched', { name: techText(node, 'name') }));
  // FRONTIER DRAFT: a committed TECH-tab node is the visit's ONE draft pick — clear its pity debt + latch
  // 'drafted'. Deploy is driven explicitly by deployFromTech (the player confirms). Armory keeps buy-multiple.
  if (techTab === 'tech') {
    draftState.pity[node.id] = 0;
    draftState.drafted = true;
    return;
  }
  renderArmory();
}

function openWingPicker(node) {
  pendingWingNode = node;
  const grid = g('wpGrid');
  grid.innerHTML = JETS.map((j, i) =>
    '<div class="wp-jet" data-i="' + i + '"><div class="wp-name">' + jetText(j, 'name') + '</div><div class="wp-role">' + jetText(j, 'role') + '</div></div>'
  ).join('');
  grid.querySelectorAll('.wp-jet').forEach(el =>
    el.addEventListener('click', () => confirmWingPick(+el.getAttribute('data-i'))));
  g('wingpick').classList.add('show');
  audio.ui();
}

function confirmWingPick(i) {
  const node = pendingWingNode;
  closeWingPicker();
  if (!node) return;
  pendingWingShape = JETS[i].shape;
  commitNode(node);
  if (choosingUpgrade && techTab === 'tech') rerollAfterPick();
}

function closeWingPicker() {
  pendingWingNode = null;
  g('wingpick').classList.remove('show');
}
let opPicked = null;          // sector type picked on the map, pending launch
function openOpMap() {
  opPicked = null;
  const wrap = g('opStages'); if (!wrap) return;
  wrap.innerHTML = opMap.map((stage, si) =>
    '<div class="op-stage">' + stage.map((s, i) => {
      let cls = si < opStage ? 'op-sector done' : si === opStage ? 'op-sector pickable' : 'op-sector';
      if (s === 'FINAL') cls += ' boss';   // FINAL/boss node gets the boss-magenta accent (§5f)
      return '<div class="' + cls + '" data-s="' + si + '" data-i="' + i + '">' + t('op.' + s) + '</div>';
    }).join('') + '</div>'
  ).join('');
  wrap.querySelectorAll('.op-sector.pickable').forEach(el => el.addEventListener('click', () => {
    wrap.querySelectorAll('.op-sector.chosen').forEach(c => c.classList.remove('chosen'));
    el.classList.add('chosen');
    opPicked = opMap[+el.getAttribute('data-s')][+el.getAttribute('data-i')];
    g('opLaunch').disabled = false;
  }));
  g('opLaunch').disabled = true;
  g('opmap').classList.add('show');
  paused = true;
  audio.ui();
}
function launchSector() {
  if (!opPicked) return;
  opSector = opPicked; opStage++;
  g('opmap').classList.remove('show');
  paused = false;
  if (clock) clock.getDelta();
  if (opSector === 'DEPOT') { applyDepot(); return; }
  betweenWaves = true; waveTimer = 1.4;
  showBanner(tf('banner.sector', { s: t('op.' + opSector) })); audio.ui();
}
function applyDepot() {
  player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.35);
  player.missiles = player.maxMissiles;
  player.flares = player.maxFlares;
  showBanner(t('banner.depot')); audio.power();
  openOpMap();                       // straight back to the map for the next pick
}
function deployFromTech() {
  if (!choosingUpgrade) return;
  // FRONTIER DRAFT: commit the ONE staged pick (if any) before leaving. No pick = bank RP.
  // Wing nodes open the jet picker first; confirmWingPick re-enters deploy once the jet is chosen.
  if (draftState && draftState.selected) {
    const pick = TECH_BY_ID[draftState.selected];
    draftState.selected = null;
    if (pick && nodeState(pick) === 'avail' && inOffer(pick.id)) {
      if (WING_NODES.has(pick.id)) { openWingPicker(pick); return; }
      commitNode(pick);
    }
  }
  pendingUpgrades = null;
  g('upgrade').classList.remove('show');
  choosingUpgrade = false; paused = false;
  if (clock) clock.getDelta();   // swallow the paused interval so dt doesn't spike
  if (isTouchEnabled && state === 'playing') g('touchControls').classList.add('show');
  if (campaignPlayerOpId && !campaignMode) {   // Operations campaign: the tech screen is opened from the level map → return to it
    openLevelMap(campaignOpId); return;
  }
  betweenWaves = true; waveTimer = 1.4;   // short breather, then the next wave spawns
  showBanner(tf('banner.waveInbound', { n: wave + 1 })); audio.ui();
}

