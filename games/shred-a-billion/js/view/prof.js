// PROFICIENCIES screen (Game.UI.Menus.ProficienciesScreen, singleColumn 1): one column per tab, the column's nodes
// laid out the way the original TreeFill lays the shown tree, lines from each node to the nodes it requires, node
// shapes from the data (0 circle, 1 square, 2 diamond). Tooltip next to the selected node with LEARN (click again or
// the button; hold = learn max). Points chip and legend as in the original. Learning rules live in Economy.canLearn/learn.
//
// Layout (ported, sources):
// - Slots: ProficiencyTreeLayout.Place @0x18093DC30 (+ Depth @0x18093D9A0, sort <Place>b__0 @0x18094C730; decomp
//   Game.UI.Menus/ProficiencyTreeLayout*.c, dump.cs:652725). Nodes of the column sorted by (requires depth, row, lane,
//   id); tier = max(tier of a placed required node + 1, 0); while (tier, lane) is taken, tier++. Slot = (tier, lane).
// - Pixels: TreeFill.Lay @0x18094A0C0 (decomp TreeFill.c, fields dump.cs:653427), values serialized on
//   Menus/Proficiencies/Content/Window/Tree/Viewport (mb.jsonl TreeFill pid 130850): margin 24, gap 28, minNode 68,
//   maxNode 128, baseNode 80, lineWidth 6 (canvas units). Over grid nodes (branch 0): lanes minLane..maxLane split the
//   width (colW = W / lanes), tiers 0..maxTier split the height (rowH = (H - 2 margin) / (maxTier + 1)).
//   node = rowH - gap < minNode ? minNode : min(rowH - gap, maxNode, colW - gap); rowH grows to node + gap when short
//   (content then scrolls: content height = max(H, (maxTier + 1) rowH + 2 margin)). Centre x = (lane - minLane + 0.5)
//   colW, y = margin + (tier + 0.5) rowH from the top. Line width = lineWidth * clamp(node / baseNode, 1, 1.6).
// - Side branches: ProficiencyNodeView.branch (-1 / +1; dump.cs ProficiencyNodeView field tooltip) puts a node one
//   ordinary step (rowH) from its first required node, up and out at 30 deg: dx = branch * rowH * BranchCos 0.8660254,
//   dy = rowH * BranchSin 0.5 up (TreeFill consts), resolved parent-first in up to 4 passes. The shipped build's 150
//   serialized node views (level0) ALL have branch 0, and ProficiencyNodeDef (content.json) has no branch field, so
//   every node of this build sits on its grid slot; `n.branch` is honoured only if data ever carries it. The side
//   diamonds of clip frame f15 come from another build's tree (its Shredder tab holds other nodes): not reproducible
//   from this build's data. Likewise this build has no separate root badge: columnRoots point at the tier-0 centre
//   node and the scene's Lines are only required-node edges, so the old web-only root badge is gone.
// - Canvas units -> px: the Proficiencies canvas CanvasScaler (level0, raw read) is ScaleWithScreenSize 2400x1350,
//   match 0.5; the web UI scales a 1280x720 design by --ui, so 1 canvas unit = --ui * 1280 / 2400 px.
// - UNKNOWN: the Scaler size of square / diamond nodes ("other shapes keep their proportion"): drawn in the same box.
import { T } from '../sim/i18n.js';
import { effect, STAT_NAMES } from './shop.js';

const UI = './art/ui/';
const SHAPE = ['tree_circle', 'tree_square', 'tree_diamond'];
const RING = ['tree_ring', 'tree_square_ring', 'tree_diamond_ring'];
const C = { learned: '#2fd5b4', maxed: '#2fd5b4', can: '#ffffff', need: '#7d86c2', locked: '#3a4380', line: '#5a64a8', lineOn: '#2fd5b4' };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const statKey = (id) => STAT_NAMES[id];

// ProficiencyTreeLayout.Place: (tier, lane) slot per node id.
function place(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n])), memo = new Map();
  const depth = (d, g) => {
    if (memo.has(d.id)) return memo.get(d.id);
    let v = 0;
    if (g < 64) for (const r of d.requires || []) { const q = r !== d.id && byId.get(r); if (q) v = Math.max(v, depth(q, g + 1) + 1); }
    memo.set(d.id, v); return v;
  };
  for (const n of nodes) depth(n, 0);
  const list = [...nodes].sort((a, b) => memo.get(a.id) - memo.get(b.id) || a.row - b.row || a.lane - b.lane || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const slot = new Map(), used = new Set();
  for (const n of list) {
    let t = 0;
    for (const r of n.requires || []) { const s = slot.get(r); if (s) t = Math.max(t, s.tier + 1); }
    while (used.has(t + ',' + n.lane)) t++;
    used.add(t + ',' + n.lane); slot.set(n.id, { tier: t, lane: n.lane });
  }
  return slot;
}

// TreeFill.Lay in canvas units (k px per unit): centre per node id, node size S, line width, content height (px).
const TF = { margin: 24, gap: 28, minNode: 68, maxNode: 128, baseNode: 80, lineWidth: 6, cos: 0.8660254, sin: 0.5 };
function lay(nodes, Wpx, Hpx, k) {
  const slot = place(nodes), W = Wpx / k, H0 = Hpx / k;
  const grid = nodes.filter(n => !n.branch);
  let maxT = 0, minL = Infinity, maxL = -Infinity;
  for (const n of grid) { const s = slot.get(n.id); maxT = Math.max(maxT, s.tier); minL = Math.min(minL, s.lane); maxL = Math.max(maxL, s.lane); }
  if (minL > maxL) { minL = 0; maxL = 0; }
  const colW = W / Math.max(1, maxL - minL + 1);
  let rowH = (H0 - 2 * TF.margin) / (maxT + 1);
  const byCol = Math.min(TF.maxNode, colW - TF.gap), byRow = rowH - TF.gap;
  const node = byRow < TF.minNode ? TF.minNode : Math.min(byRow, byCol);
  if (rowH < node + TF.gap) rowH = node + TF.gap;
  const H = Math.max(H0, (maxT + 1) * rowH + 2 * TF.margin);
  const p = new Map();
  for (const n of grid) { const s = slot.get(n.id); p.set(n.id, [(s.lane - minL + 0.5) * colW, TF.margin + (s.tier + 0.5) * rowH]); }
  const byId = new Map(nodes.map(n => [n.id, n]));
  const parent = (n) => byId.get((n.requires || [])[0]);
  const chain = (n) => { let c = 0, q = parent(n); while (q && q.branch && c <= 7) { c++; q = parent(q); } return c; };
  for (let pass = 0; pass < 4; pass++) {
    for (const n of nodes) {
      if (!n.branch || p.has(n.id) || chain(n) !== pass) continue;
      const q = parent(n), at = q && p.get(q.id); if (!at) continue;
      p.set(n.id, [at[0] + Math.sign(n.branch) * rowH * TF.cos, at[1] - rowH * TF.sin]);
    }
  }
  for (const n of nodes) if (!p.has(n.id)) { const s = slot.get(n.id); p.set(n.id, [(s.lane - minL + 0.5) * colW, TF.margin + (s.tier + 0.5) * rowH]); }
  for (const v of p.values()) { v[0] *= k; v[1] *= k; }
  return { p, S: node * k, line: TF.lineWidth * Math.min(1.6, Math.max(1, node / TF.baseNode)) * k, H: H * k };
}

export class Prof {
  constructor(root, game, sfx) {
    this.root = root; this.g = game; this.sfx = sfx; this.col = 'hands'; this.sel = null; this.open = false;
    addEventListener('pointerup', () => { this.down = false; clearTimeout(this.holdT); }, true);
  }
  show() {
    this.open = true;
    this.root.innerHTML = `<div class="screen" id="profScreen"><div class="panel">
      <div class="ptitle">${esc(T('menu.tab.proficiencies'))}</div>
      <div class="pwallet"><img src="${UI}star.webp" alt=""><span id="profPts"></span></div>
      <button class="pclose sbtn" id="profClose">✕</button>
      <div class="tabs" id="profTabs" style="margin-top:calc(14px * var(--ui))"></div>
      <div id="profBoard"></div>
      <div class="foot"><span class="legend"><i style="background:${C.locked}"></i>${esc(T('menu.legend.locked'))}<i style="background:${C.need}"></i>${esc(T('prof.deny.points'))}<i style="background:${C.can}"></i>${esc(T('menu.legend.can_learn'))}<i style="background:${C.learned}"></i>${esc(T('menu.legend.learned'))}</span>
        <span><b>Click</b>${esc(T('menu.hint.learn'))}</span><span><b>ESC</b>${esc(T('menu.hint.close'))}</span></div></div></div>`;
    this.root.querySelector('#profClose').addEventListener('click', () => this.onClose && this.onClose());
    this.root.querySelector('#profScreen').addEventListener('pointerdown', (e) => { if (e.target.id === 'profScreen') this.onClose && this.onClose(); });
    this.render();
  }
  // Proficiencies CanvasScaler 2400x1350 vs the web's 1280x720 design scaled by --ui.
  k() { return (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1) * 1280 / 2400; }
  hide() { this.open = false; this.root.innerHTML = ''; }
  state(n) {
    const e = this.g.econ, r = e.rank(n.id), max = Math.max(1, n.maxRank), why = e.canLearn(n.id);
    if (r >= max) return 'maxed';
    if (why === true) return 'can';
    if (why === 'prof.reason.points') return r > 0 ? 'learned' : 'need';
    return r > 0 ? 'learned' : 'locked';
  }
  render() {
    if (!this.open) return;
    const e = this.g.econ, CT = this.g.data.content;
    this.root.querySelector('#profPts').textContent = e.points + ' ' + T(e.points === 1 ? 'menu.unit.points#one' : 'menu.unit.points#other');
    const tabs = this.root.querySelector('#profTabs'); tabs.innerHTML = '';
    for (const c of CT.columns) {
      const ns = CT.nodes.filter(n => n.column === c.id);
      const have = ns.reduce((a, n) => a + e.rank(n.id), 0), tot = ns.reduce((a, n) => a + Math.max(1, n.maxRank), 0);
      const can = ns.filter(n => e.canLearn(n.id) === true).length;
      const locked = c.requiresUnlock && !e.hasUnlock(c.requiresUnlock);
      const t = document.createElement('button'); t.className = 'tab sbtn wide' + (c.id === this.col ? ' sel' : '') + (locked ? ' locked' : '');
      t.innerHTML = `<img src="${UI}${c.iconId}.webp" alt="">${esc(T(c.nameKey))}<span class="cnt">${have} / ${tot}</span>${can && !locked ? `<span class="dot">${can}</span>` : ''}`;
      t.addEventListener('click', () => { this.col = c.id; this.sel = null; this.sfx('UiClick'); this.render(); });
      tabs.appendChild(t);
    }
    const nodes = CT.nodes.filter(n => n.column === this.col);
    const board = this.root.querySelector('#profBoard'), keep = board.scrollTop;
    board.style.overflowY = 'hidden';
    const W = board.clientWidth || 800, H = board.clientHeight || 360;
    const L = lay(nodes, W, H, this.k());
    if (L.H > H + 0.5) board.style.overflowY = 'auto';
    const pos = (n) => L.p.get(n.id), S = L.S;
    let svg = `<svg width="${W}" height="${L.H}" style="position:absolute;left:0;top:0">`;
    const byId = new Map(nodes.map(n => [n.id, n]));
    for (const n of nodes) {
      const [x, y] = pos(n);
      const on = e.rank(n.id) > 0;
      for (const r of n.requires || []) {
        const q = byId.get(r); if (!q) continue;
        const [fx, fy] = pos(q);
        svg += `<line x1="${fx}" y1="${fy}" x2="${x}" y2="${y}" stroke="${on ? C.lineOn : C.line}" stroke-width="${L.line}" stroke-linecap="round"/>`;
      }
    }
    svg += '</svg>';
    let html = svg;
    for (const n of nodes) {
      const [x, y] = pos(n), st = this.state(n), r = e.rank(n.id), max = Math.max(1, n.maxRank);
      const shape = SHAPE[n.shape] || SHAPE[0], ring = RING[n.shape] || RING[0];
      const fill = st === 'maxed' || st === 'learned' ? C.learned : st === 'locked' ? C.locked : '#1b2870';
      const rc = st === 'can' ? C.can : st === 'need' ? C.need : st === 'locked' ? C.locked : C.learned;
      html += `<button class="pnode sbtn${n.id === this.sel ? ' sel' : ''} ${st}" data-id="${n.id}" style="left:${x}px;top:${y}px;width:${S}px;height:${S}px">
        <i style="background:${fill};-webkit-mask-image:url(${UI}${shape}.webp);mask-image:url(${UI}${shape}.webp)"></i>
        <i style="background:${rc};-webkit-mask-image:url(${UI}${ring}.webp);mask-image:url(${UI}${ring}.webp)"></i>
        <img src="${UI}${n.iconId}.webp" alt="">${st === 'maxed' ? `<span class="tag">${esc(T('prof.pill.max'))}</span>` : max > 1 && r > 0 ? `<span class="tag r">${r}/${max}</span>` : ''}</button>`;
    }
    board.innerHTML = html; board.scrollTop = keep;
    board.querySelectorAll('button.pnode').forEach(b => {
      b.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        const id = b.dataset.id, again = id === this.sel;
        this.sel = id; this.sfx('UiClick');
        if (again) { this.learn(id, false); this.holdT = setTimeout(() => this.learn(id, true), 500); }
        else this.render();
      });
    });
    this.tip(nodes, pos, S);
  }
  learn(id, max) {
    const e = this.g.econ; let n = 0;
    while (e.learn(id)) { n++; if (!max) break; }
    this.sfx(n ? 'SkillLearn' : 'UiDeny');
    this.render();
  }
  tip(nodes, pos, S) {
    const board = this.root.querySelector('#profBoard'), e = this.g.econ;
    const n = nodes.find(x => x.id === this.sel); if (!n) return;
    const [x, y] = pos(n), r = e.rank(n.id), max = Math.max(1, n.maxRank), why = e.canLearn(n.id), m = (n.modifiers || [])[0];
    const next = this.g.data.content.nodes.filter(k => (k.requires || []).includes(n.id)).map(k => T(k.nameKey));
    const reason = { 'prof.reason.tool': 'prof.deny.locked', 'prof.reason.maxed': 'prof.deny.maxed', 'prof.reason.points': 'prof.deny.points', 'prof.reason.requires': 'prof.deny.requires' }[why];
    const d = document.createElement('div'); d.className = 'ptip';
    const W = board.clientWidth || 800;
    d.style.left = (x > W * 0.6 ? x - S * 0.7 - 230 : x + S * 0.7) + 'px'; d.style.top = Math.max(0, y - 30) + 'px';
    d.innerHTML = `<div class="h">${esc(T(n.nameKey))}<span>${r >= max ? esc(T('prof.pill.max')) : esc(T('prof.details.rank', r, max))}</span></div>
      ${m ? `<div class="fx">${r > 0 && r < max ? effect(m, r, e) + ' → ' : ''}<b>${effect(m, Math.min(max, Math.max(1, r + (r < max ? 1 : 0))), e)}</b> ${esc(T('stat.' + statKey(m.stat)))}</div>` : `<div class="fx">${esc(T(n.descKey, ''))}</div>`}
      ${next.length ? `<div class="nx">${esc(T('prof.details.leads_to'))} ${esc(next.join(', '))}</div>` : ''}
      ${why === true ? `<button class="buyBig sbtn" id="learn">${esc(T('prof.details.learn', n.costPerRank + ' ' + T(n.costPerRank === 1 ? 'menu.unit.points#one' : 'menu.unit.points#other')))}</button>` : `<div class="why">${esc(reason ? T(reason) : '')}</div>`}`;
    board.appendChild(d);
    const b = d.querySelector('#learn'); if (b) b.addEventListener('click', (ev) => { ev.stopPropagation(); this.learn(n.id, false); });
  }
}
