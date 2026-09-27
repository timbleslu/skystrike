/* SKYSTRIKE — tech-tree screen, frontier draft, armory, wing picker, deploy. */
let techPanMoved = false;     // set while dragging to pan the tree (suppresses the click)
const TECH_COLW = 160, TECH_ROWH = 130, TECH_NODEW = 152, TECH_NODEH = 104, TECH_PAD = 28;
const TECH_TAB_NODES = TECH_TREE.filter(n => !n.tab || n.tab === 'tech');
let techTab = 'tech';
function owns(id) { return player.tech.indexOf(id) >= 0; }
function repeatCount(node) { return player.techRepeat[node.id] || 0; }
function nodeCost(node) { return node.repeat ? node.cost + (node.costStep || 0) * repeatCount(node) : node.cost; }

/* FRONTIER DRAFT (TECH tab only): the whole tree renders, but only a few unlockable frontier nodes are OFFERED
   per visit. PIN biases the offer toward a goal's prereq path; REROLL once per visit; PITY force-includes a
   long-skipped node. Pure logic in core.js (frontierEligible/prereqPath/draftOffer). Reset in startGame(). */
let draftState = { seed: 0, visit: 0, offer: [], rerollUsed: false, pin: null, pity: {} };
function resetDraftState() {
  draftState = { seed: (Math.random() * 0x7fffffff) | 0, visit: 0, offer: [], rerollUsed: false, pin: null, pity: {} };
}
function inOffer(id) { return draftState.offer.indexOf(id) >= 0; }
function draftFrontier() {
  return frontierEligible(TECH_TAB_NODES, {
    owns,
    reqSatisfied: (n) => reqSatisfied(n, owns, TECH_BY_ID, groundWar),
    applicable: (n) => { const s = nodeState(n); return s !== 'hidden' && s !== 'na' && s !== 'bought'; },
  });
}
// `sub` salts the seed (a reroll passes non-zero for a different draw)
function rollDraftOffer(sub) {
  const frontier = draftFrontier();
  const pinPath = draftState.pin ? prereqPath(draftState.pin, TECH_BY_ID, owns).filter(inFrontierOf(frontier)) : [];
  const rng = makeRng((draftState.seed ^ (draftState.visit * 0x9e3779b1) ^ ((sub || 0) * 0x85ebca6b)) | 0);
  const res = draftOffer({ frontier, pinPath, pity: draftState.pity, rng, n: DRAFT_OFFER_N });
  draftState.offer = res.offer;
  draftState.pity = res.pity;
}
function nextDraftVisit() {
  draftState.visit++;
  draftState.rerollUsed = false;
  rollDraftOffer(0);
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
  nextDraftVisit();
  document.querySelectorAll('.tech-tab').forEach(b => { b.classList.toggle('active', b.dataset.tab === 'tech'); b.onclick = () => switchTechTab(b.dataset.tab); });
  renderTechTree(true);
  choosingUpgrade = true; paused = true;
  // #upgrade is a MODAL over play or the level map with context-dependent teardown (deployFromTech), so it
  // stays outside the nav.js router's "hide current + show new" model.
  g('touchControls').classList.remove('show');
  g('upgrade').classList.add('show');
}
function nodeXY(node) { return { left: TECH_PAD + node.x * TECH_COLW, top: TECH_PAD + node.y * TECH_ROWH }; }
function nodeBody(n, costTxt) {
  return '<div class="tn-sym">' + n.sym + '</div>' +
    '<div class="tn-name">' + techText(n, 'name') + '</div>' +
    '<div class="tn-desc">' + techText(n, 'desc') + '</div>' +
    '<span class="tn-cost">' + costTxt + '</span>';
}
function repeatBadge(n) { return n.repeat ? '<span class="tn-rep">×' + repeatCount(n) + '</span>' : ''; }
function renderTechTree(recenter) {
  const rv = g('rpval'); if (rv) rv.textContent = Math.floor(player.tp).toLocaleString();
  const grid = g('techgrid'); if (!grid) return;
  let maxX = 0, maxY = 0; for (const n of TECH_TAB_NODES) { if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y; }
  const W = TECH_PAD * 2 + maxX * TECH_COLW + TECH_NODEW;
  const H = TECH_PAD * 2 + maxY * TECH_ROWH + TECH_NODEH;
  let svg = '<svg width="' + W + '" height="' + H + '">';
  for (const n of TECH_TAB_NODES) {
    const ns = nodeState(n);
    // `req` parents are OR-gates (solid edge), `reqAll` are AND-gates (dashed)
    const orReqs = n.req ? (Array.isArray(n.req) ? n.req : [n.req]) : [];
    const edges = orReqs.map(id => ({ id, and: false })).concat((n.reqAll || []).map(id => ({ id, and: true })));
    for (const edge of edges) {
      const p = TECH_BY_ID[edge.id]; if (!p) continue;
      const a = nodeXY(p), b = nodeXY(n);
      const px = a.left + TECH_NODEW / 2, pb = a.top + TECH_NODEH;
      const cx = b.left + TECH_NODEW / 2, ct = b.top;
      const midY = (pb + ct) / 2;
      const lit = owns(edge.id) && (n.repeat ? repeatCount(n) > 0 : owns(n.id));
      const open = owns(edge.id) && ns !== 'locked';
      const next = open && ns === 'avail';
      // tokens: --ok (both owned) · --primary-bright (affordable next) · --primary low (reachable) · --hairline (dormant)
      const col = lit ? '#4dffa0' : next ? '#ffd36b' : open ? 'rgba(255,185,56,.4)' : 'rgba(120,170,140,.34)';
      const dash = edge.and ? ' stroke-dasharray="7,5"' : '';
      svg += '<path d="M' + px + ',' + pb + ' V' + midY + ' H' + cx + ' V' + ct + '" fill="none" stroke="' + col + '" stroke-width="' + (lit ? 3 : 2) + '"' + dash + '/>';
    }
  }
  svg += '</svg>';
  let nodes = '';
  for (const n of TECH_TAB_NODES) {
    const raw = nodeState(n);
    if (raw === 'hidden') continue;
    const buyable = raw === 'avail' || raw === 'cantafford';
    const offered = buyable && inOffer(n.id);
    const st = buyable && !offered ? 'lockvisit' : raw;   // shown, but not buyable this visit
    const p = nodeXY(n), ac = FAM_C[n.fam] || '#ffb938';
    const pinned = draftState.pin === n.id;
    const costTxt = n.id === 'core' ? t('tech.core') : raw === 'bought' ? t('tech.owned') : raw === 'na' ? t('tech.na')
      : st === 'lockvisit' ? t('tech.lockVisit') : nodeCost(n) + ' RP';
    const cls = 'tnode ' + st + (n.repeat ? ' rep' : '') + (offered ? ' offered' : '') + (pinned ? ' pinned' : '');
    nodes += '<div class="' + cls + '" data-id="' + n.id + '" style="left:' + p.left + 'px;top:' + p.top + 'px;--ac:' + ac + '">' +
      repeatBadge(n) + (pinned ? '<span class="tn-pin">◈</span>' : '') + nodeBody(n, costTxt) + '</div>';
  }
  grid.innerHTML = '<div id="techcanvas" style="width:' + W + 'px;height:' + H + 'px">' + svg + nodes + '</div>';
  // OFFERED+affordable nodes buy; any other non-bought node toggles the PIN goal
  const cv = g('techcanvas');
  cv.querySelectorAll('.tnode.avail.offered').forEach(el => el.addEventListener('click', () => { if (techPanMoved) { techPanMoved = false; return; } buyNode(TECH_BY_ID[el.dataset.id]); }));
  cv.querySelectorAll('.tnode:not(.offered):not(.bought)').forEach(el => el.addEventListener('click', () => { if (techPanMoved) { techPanMoved = false; return; } togglePin(el.dataset.id); }));
  renderDraftBar();
  if (recenter) {
    const rootCX = TECH_PAD + 3 * TECH_COLW + TECH_NODEW / 2;
    grid.scrollLeft = Math.max(0, rootCX - grid.clientWidth / 2);
    grid.scrollTop = 0;
  }
}
function renderDraftBar() {
  const hint = g('techhint');
  if (hint && techTab === 'tech') hint.textContent = t('tech.hintTree');
  const pinEl = g('draftPin');
  if (pinEl) {
    pinEl.textContent = draftState.pin ? tf('tech.pinned', { name: techText(TECH_BY_ID[draftState.pin], 'name') }) : t('tech.pinHint');
    pinEl.classList.toggle('active', !!draftState.pin);
  }
  const dep = g('techDeploy');
  if (dep) dep.textContent = t('tech.deployBank');
  const rr = g('techReroll');
  if (rr) { rr.disabled = draftState.rerollUsed; rr.textContent = t('tech.reroll'); }
}
// Clicking the pinned node again clears it. The pin persists across visits within the run.
function togglePin(id) {
  if (!id || !TECH_BY_ID[id]) return;
  draftState.pin = (draftState.pin === id) ? null : id;
  audio.ui();
  if (techTab === 'tech') renderTechTree(false);
}
function rerollDraft() {
  if (draftState.rerollUsed) { audio.ui(); return; }
  draftState.rerollUsed = true;
  rollDraftOffer(draftState.visit * 7 + 1);
  audio.ui();
  if (techTab === 'tech') renderTechTree(false);
}
function renderArmory() {
  if (!player) return;
  const rv = g('rpval'); if (rv) rv.textContent = Math.floor(player.tp).toLocaleString();
  const grid = g('techgrid'); if (!grid) return;
  const hint = g('techhint');
  if (hint) hint.textContent = t('tech.hintArmory');
  let html = '<div class="armory-grid">';
  for (const n of TECH_TREE) {
    if (n.tab !== 'armory') continue;
    const st = nodeState(n);
    if (st === 'hidden') continue;
    const costTxt = st === 'bought' ? t('tech.owned') : st === 'na' ? t('tech.na') : nodeCost(n) + ' RP';
    html += '<div class="tnode ' + st + (n.repeat ? ' rep' : '') + '" data-id="' + n.id + '" style="--ac:' + (FAM_C[n.fam] || '#ffe14d') + '">' +
      repeatBadge(n) + nodeBody(n, costTxt) + '</div>';
  }
  html += '</div>';
  grid.innerHTML = html;
  grid.querySelectorAll('.tnode.avail').forEach(el => el.addEventListener('click', () => buyNode(TECH_BY_ID[el.dataset.id])));
}
function switchTechTab(tab) {
  techTab = tab;
  document.querySelectorAll('.tech-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'armory') renderArmory();
  else renderTechTree(true);
}
let pendingWingNode = null;

// ARMORY buys freely; TECH buys only offered nodes, then re-rolls a fresh offer so RP can keep being spent.
// Wing nodes (core.js WING_NODES) go through the jet picker first.
function buyNode(node) {
  if (!choosingUpgrade || !player || !node) return;
  if (nodeState(node) !== 'avail' || (techTab === 'tech' && !inOffer(node.id))) { audio.ui(); return; }
  if (routesToWingPicker(node.id)) { openWingPicker(node); return; }
  commitNode(node);
  if (techTab === 'tech') rerollAfterPick();
}
function rerollAfterPick() {
  nextDraftVisit();
  renderTechTree(false);
}

function commitNode(node) {
  player.tp -= nodeCost(node);
  node.apply(player);
  // Weekly ordnance caps stay sealed for the whole run: nodes that raise max + refill would otherwise buy it back.
  if (player._weeklyEffects) {
    const fx = player._weeklyEffects;
    if (fx.flares != null)   { player.flares = Math.min(player.flares, fx.flares); player.maxFlares = fx.flares; }
    if (fx.missiles != null) { player.missiles = Math.min(player.missiles, fx.missiles); player.maxMissiles = fx.missiles; }
  }
  if (node.repeat) { player.techRepeat[node.id] = repeatCount(node) + 1; }
  else { player.tech.push(node.id); player.upgrades.push(node.id); }
  audio.power(); empFlash = 0.26;
  showBanner(tf('banner.researched', { name: techText(node, 'name') }));
  if (techTab === 'tech') { draftState.pity[node.id] = 0; return; }
  renderArmory();
}

function openWingPicker(node) {
  pendingWingNode = node;
  const grid = g('wpGrid');
  grid.innerHTML = JETS.map((j, i) =>
    '<div class="wp-jet" data-i="' + i + '"><div class="wp-name">' + jetText(j, 'name') + '</div><div class="wp-role">' + jetText(j, 'role') + '</div></div>'
  ).join('');
  grid.querySelectorAll('.wp-jet').forEach(el =>
    el.addEventListener('click', () => confirmWingPick(+el.dataset.i)));
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
function deployFromTech() {
  if (!choosingUpgrade) return;
  g('upgrade').classList.remove('show');
  choosingUpgrade = false; paused = false;
  clock.getDelta();   // swallow the paused interval so dt doesn't spike
  if (isTouchEnabled && state === 'playing') g('touchControls').classList.add('show');
  if (campaignPlayerOpId && !campaignMode) { openLevelMap(campaignOpId); return; }   // opened from the level map → return to it
  betweenWaves = true; waveTimer = 1.4;
  showBanner(tf('banner.waveInbound', { n: wave + 1 }));
  audio.ui();
}
