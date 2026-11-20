// Per-hero statistics for the result screen: a team overview (one chunky row per hero, sortable) and one hero's
// detail card (damage by source, cards picked, stats then and now, support numbers). The numbers come from the sim's
// battleReport; this file only formats and draws them. Every drawn string is also written to game.statsUi so the
// tools can compare what the screen says with the report.
import { HERO } from '../data/heroes.js?v=20261120e';
import { CARD, CARD_RARITY } from '../data/cards.js?v=20261120e';
import { heroColor, kill } from './hud.js?v=20261120e';

// ---------- formatting ----------
const nf = (n, d = 0) => { try { return n.toLocaleString('vi-VN', { maximumFractionDigits: d }); } catch (e) { return String(n); } };
export const fmtNum = (n) => { n = Math.round(n); const a = Math.abs(n); return a <= 999999 ? nf(n) : a < 1e9 ? nf(n / 1e6, 1) + ' Tr' : nf(n / 1e9, 1) + ' Tỷ'; };
export const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export const fmtDec = (v) => nf(v, 2);
// largest-remainder rounding so the shown shares add up; a hero under 1% reads "<1%" and takes no part in the split
export function sharePcts(report) {
  const raw = report.map((h) => h.share * 100), out = raw.map(() => null), idx = [];
  raw.forEach((p, i) => { if (p > 0 && p < 1) out[i] = '<1%'; else if (p <= 0) out[i] = '0%'; else idx.push(i); });
  const floors = idx.map((i) => Math.floor(raw[i])); let left = 100 - floors.reduce((s, v) => s + v, 0);
  const order = idx.map((i, k) => k).sort((a, b) => (raw[idx[b]] - floors[b]) - (raw[idx[a]] - floors[a]));
  if (idx.length) for (const k of order) { if (left <= 0) break; floors[k]++; left--; }
  idx.forEach((i, k) => { out[i] = floors[k] + '%'; });
  return out;
}
const DOWN_SHOWN = 1; // seconds of time down below which the red figure stays hidden

const ROLE = { tank: 'Đỡ đòn', melee: 'Cận chiến', ranged: 'Tầm xa', healer: 'Hồi máu' };
export const SORTS = [
  { id: 'dealt', label: 'Sát thương', key: (h) => h.dealt },
  { id: 'taken', label: 'Chịu đòn', key: (h) => h.taken },
  { id: 'heal', label: 'Hồi máu', key: (h) => h.healed + h.shieldGiven },
];
const SRC = [
  { id: 'atk', name: () => 'Đòn thường', color: 0xff9a1f },
  { id: 's1', name: (h) => HERO[h.id].s1.name, color: 0x35d65a },
  { id: 's2', name: (h) => HERO[h.id].s2.name, color: 0x2f9bff },
  { id: 'ult', name: (h) => HERO[h.id].ult.name, color: 0xb46cff },
  { id: 'fx', name: () => 'Hiệu ứng (cháy, độc...)', color: 0xff4a6a },
];
const STAT_ROWS = [
  { key: 'atk', label: 'Công', fmt: (v) => fmtNum(v) },
  { key: 'hp', label: 'Máu', fmt: (v) => fmtNum(v) },
  { key: 'aspd', label: 'Tốc đánh', fmt: (v) => fmtDec(v) },
  { key: 'crit', label: 'Chí mạng', fmt: (v) => Math.round(v * 100) + '%', points: true },
];
const LAV = 0xd9ccff, GOLD = 0xffe14a, GREEN = 0x7dffa0, BLUE = 0x7fd0ff, RED = 0xff7b8c;
// landscape: the overview is a table of compact rows in the middle column; the detail takes the wide area with three columns
const ROW = { x: 226, y0: 112, w: 378, h: 54, pitch: 60 };
const CARD_ROW = { x: 22, y: 58, w: 584, h: 288, pad: 10, colW: 180, gap: 12 };

export function createStatsPanel(game) {
  const ui = game.ui, PAL = ui.PAL, THREE = ui.THREE;
  const root = ui.group({ w: ui.W, h: 360 });
  const reg = game.statsUi = { view: 'list', sortId: 'dealt', header: null, rows: [], detail: null, texts: [], report: [] };
  let listG = null, detailG = null, report = [], r0 = null, sortI = 0;

  // a text node that is also written to the registry; `box` is the panel it must stay inside
  const T = (parent, str, o, x, y, z = 12, box = null) => {
    const n = ui.text(str, { outlineW: o.size >= 15 ? undefined : 1.5, valign: 'mid', ...o }); parent.put(n, x, y, z);
    reg.texts.push({ str: String(str), node: n, box, align: o.align || 'left', top: 'valign' in o && !o.valign }); return n;
  };
  const fit = (n, maxW) => { if (n.w > maxW) n.scale.setScalar(maxW / n.w); return n; };

  function crown(size) {
    const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
    x.lineJoin = 'round'; x.beginPath(); x.moveTo(12, 80); x.lineTo(6, 28); x.lineTo(30, 50); x.lineTo(48, 14); x.lineTo(66, 50); x.lineTo(90, 28); x.lineTo(84, 80); x.closePath();
    x.lineWidth = 12; x.strokeStyle = '#1a1420'; x.stroke(); x.fillStyle = '#ffd23f'; x.fill();
    x.fillStyle = '#ff5a6a'; x.beginPath(); x.arc(48, 62, 7, 0, 7); x.fill(); x.fillStyle = '#fff5b0'; x.fillRect(18, 70, 60, 5);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const n = ui.group({ w: size, h: size });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    m.position.set(size / 2, -size / 2, 0); n.add(m); return n;
  }

  function chip(parent, x, y, icon, parts, box, gap = 5) {
    parent.put(ui.icon(icon, { size: 16, sway: false }), x, y - 8, 2);
    let cx = x + 19;
    for (const [s, color] of parts) { const n = T(parent, s, { size: 12, color: color ?? 0xffffff }, cx, y, 12, box); cx += n.w + gap; }
    return cx + gap;
  }
  const label = (parent, s, x, y) => T(parent, s, { size: 11, color: 0xffd23f, outlineW: 1.3 }, x, y);

  function clear() {
    if (listG) { kill(listG); listG = null; } if (detailG) { kill(detailG); detailG = null; }
    reg.texts = []; reg.rows = []; reg.detail = null; reg.header = null;
  }

  function sorted() { const k = SORTS[sortI].key; return report.map((h, i) => i).sort((a, b) => k(report[b]) - k(report[a]) || a - b); }
  function place() { sorted().forEach((i, rank) => { const row = reg.rows[i]; row.rank = rank; row.y = ROW.y0 + rank * ROW.pitch; row.node.pos(ROW.x, row.y, 0); }); reg.order = sorted(); }

  // ---------- overview ----------
  function buildList() {
    const g = listG = ui.group({ w: ui.W, h: 360 }); root.put(g, 0, 0, 0);
    const r = r0, pct = sharePcts(report), total = report.reduce((s, h) => s + h.dealt, 0), top = Math.max(1, ...report.map((h) => h.dealt));
    // header line: stage time, team damage, kills, and the sort switch
    const hdr = reg.header = { time: fmtTime(r.seconds), dmg: fmtNum(total), kills: fmtNum(r.kills) };
    let hx = ROW.x + 4;
    for (const [icon, key] of [['cdr', 'time'], ['sword', 'dmg'], ['skull', 'kills']]) { g.put(ui.icon(icon, { size: 20, sway: false }), hx, 68, 4); const n = T(g, hdr[key], { size: 13 }, hx + 22, 78, 12); hx += 22 + n.w + 10; }
    const sortBtn = ui.button({ id: 'stats-sort', w: 100, h: 32, r: 12, color: PAL.teal, label: SORTS[sortI].label, size: 12, onTap: () => { sortI = (sortI + 1) % SORTS.length; reg.sortId = SORTS[sortI].id; sortBtn.setLabel(SORTS[sortI].label); reg.sortLabel = SORTS[sortI].label; place(); } });
    reg.sortLabel = SORTS[sortI].label; g.put(sortBtn, ROW.x + ROW.w - 100, 70, 14);
    report.forEach((h, i) => g.put(makeRow(h, i, pct[i], top), 0, 0, 0));
    place();
  }

  function makeRow(h, i, pctStr, top) {
    const def = HERO[h.id], col = heroColor(h.id), t = {}, rowG = ui.group({ w: ROW.w, h: ROW.h });
    if (h.mvp) rowG.put(ui.panel({ w: ROW.w + 8, h: ROW.h + 8, r: 17, color: 0xffc21f, depth: 3, bevel: 2, ow: 2.4, shadow: false, gloss: false }), -4, -4, -10);
    const b = ui.button({ id: 'stat-hero' + i, w: ROW.w, h: ROW.h, r: 14, color: h.mvp ? 0x6b5214 : 0x3d3180, onTap: () => openDetail(i) });
    rowG.put(b, 0, 0, 0);
    b.put(ui.portrait(h.id, { size: 40, color: col, fps: 4, shadow: false }), 7, 7, 2);
    if (h.mvp) b.put(crown(22), -3, -9, 20);
    t.name = fit(T(b, def.name, { size: 12 }, 54, 10, 12, b), h.mvp ? 56 : 118);
    if (h.mvp) {
      const p = ui.panel({ w: 66, h: 15, r: 7.5, color: 0xffb800, depth: 2, bevel: 1.2, ow: 2, shadow: false, gloss: false }); b.put(p, 108, 3, 4);
      const pt = ui.text('GÁNH ĐỘI', { size: 10, align: 'center', valign: 'mid', outlineW: 1.3 }); p.put(pt, 33, 8, 4); reg.texts.push({ str: 'GÁNH ĐỘI', node: pt, box: b, align: 'center' });
      t.mvp = 'GÁNH ĐỘI';
    }
    const bar = ui.bar({ w: 118, h: 12, color: col }); b.put(bar, 54, 20, 1); bar.set(h.dealt / top, true);
    t.dmg = fmtNum(h.dealt); t.pct = pctStr;
    fit(T(b, t.dmg, { size: 14 }, 56, 42, 12, b), 70);
    T(b, t.pct, { size: 12, align: 'right', color: GOLD }, 172, 42, 12, b);
    t.dps = fmtNum(h.dps) + '/s'; t.taken = fmtNum(h.taken);
    const X0 = 184;
    let x = chip(b, X0, 17, 'bolt', [[t.dps, 0xffe14a]], b, 4);
    x = chip(b, x, 17, 'heart', [[t.taken, 0xffb0ba]], b, 4);
    if (h.healed > 0 || h.shieldGiven > 0) {
      const parts = []; t.heal = h.healed > 0 ? fmtNum(h.healed) : null; t.shield = h.shieldGiven > 0 ? fmtNum(h.shieldGiven) : null;
      if (t.heal) parts.push([t.heal, GREEN]); if (t.shield) parts.push([t.shield, BLUE]);
      chip(b, x, 17, t.heal ? 'regen' : 'shield', parts, b, 4);
    }
    t.kills = fmtNum(h.kills); t.ults = fmtNum(h.ults); t.alive = fmtTime(h.aliveT);
    x = chip(b, X0, 38, 'skull', [[t.kills]], b, 4);
    x = chip(b, x, 38, 'ult', [[t.ults]], b, 4);
    x = chip(b, x, 38, 'cdr', [[t.alive]], b, 4);
    if (Math.floor(h.downT) >= DOWN_SHOWN) { t.down = fmtTime(h.downT); T(b, 'Gục ' + t.down, { size: 12, color: RED }, x, 38, 12, b); }
    reg.rows[i] = { i, id: 'stat-hero' + i, hero: h.id, mvp: !!h.mvp, t, node: rowG, y: 0, rank: 0 };
    return rowG;
  }

  // ---------- detail: three columns ----------
  function openDetail(i) {
    if (detailG) return;
    listG.setVisible(false); if (api.onDetail) api.onDetail(true);
    const h = report[i], def = HERO[h.id], col = heroColor(h.id), pct = sharePcts(report)[i], C = CARD_ROW;
    const g = detailG = ui.group({ w: ui.W, h: 360 }); root.put(g, 0, 0, 0);
    const card = ui.panel({ w: C.w, h: C.h, r: 20, color: 0x1d1546, depth: 4, bevel: 2.4, ow: 2.6, gloss: false }); g.put(card, C.x, C.y, 0);
    const d = reg.detail = { i, id: 'stat-hero' + i, hero: h.id, mvp: !!h.mvp, src: [], cards: [], stats: [], support: {} };
    const cx = (k) => C.pad + k * (C.colW + C.gap);
    // column 1: who, and the support numbers
    const back = ui.button({ id: 'stats-back', w: 52, h: 38, r: 13, color: PAL.blue, icon: 'back', onTap: closeDetail }); card.put(back, cx(0), 8, 6);
    card.put(ui.portrait(h.id, { size: 44, color: col, fps: 6, shadow: false }), cx(0) + 62, 8, 4);
    if (h.mvp) card.put(crown(26), cx(0) + 56, -6, 20);
    d.name = def.name; fit(T(card, def.name, { size: 16 }, cx(0) + 112, 20, 8, card), h.mvp ? 68 : 68);
    d.role = ROLE[def.role] || def.role; T(card, d.role, { size: 11, color: LAV, outlineW: 1.3 }, cx(0) + 112, 38, 8, card);
    if (h.mvp) {
      const p = ui.panel({ w: 80, h: 17, r: 8.5, color: 0xffb800, depth: 2, bevel: 1.2, ow: 2, shadow: false, gloss: false }); card.put(p, cx(0) + 100, 50, 6);
      const pt = ui.text('GÁNH ĐỘI', { size: 11, align: 'center', valign: 'mid', outlineW: 1.3 }); p.put(pt, 40, 9, 4); reg.texts.push({ str: 'GÁNH ĐỘI', node: pt, box: card, align: 'center' });
    }
    d.over = 'Dư: ' + fmtNum(h.over); T(card, d.over, { size: 11, color: LAV, outlineW: 1.3 }, cx(0), 66, 8, card);
    const SUP = [['Chịu đòn', 'taken', fmtNum(h.taken)], ['Tự hồi', 'selfHeal', fmtNum(h.selfHeal)], ['Hồi đồng đội', 'healed', fmtNum(h.healed)],
      ['Khiên cho đội', 'shieldGiven', fmtNum(h.shieldGiven)], ['Lần tung chiêu', 'casts', fmtNum(h.casts)], ['Lần gục', 'downs', fmtNum(h.downs)]];
    SUP.forEach(([name, key, val], k) => {
      const x = cx(0) + (k % 2) * 92, y = 98 + Math.floor(k / 2) * 46;
      fit(T(card, name, { size: 11, color: LAV, outlineW: 1.3 }, x, y, 8, card), 88); T(card, val, { size: 15 }, x, y + 17, 8, card);
      d.support[key] = val;
    });
    // column 2: damage by source
    const c2 = cx(1);
    label(card, 'SÁT THƯƠNG THEO NGUỒN', c2, 14);
    d.total = fmtNum(h.dealt); d.pct = pct;
    T(card, `${d.total} (${pct})`, { size: 15, align: 'right', color: GOLD }, c2 + C.colW, 34, 8, card);
    card.put(ui.panel({ w: C.colW, h: 14, r: 7, color: 0x0f0a28, depth: 2, bevel: 1, ow: 1.8, gloss: false, shadow: false }), c2, 48, 2);
    let sx = c2 + 2;
    for (const s of SRC) {
      const v = h.bySrc[s.id] || 0; if (v <= 0 || h.dealt <= 0) continue;
      const w = Math.max(3, Math.round(v / h.dealt * (C.colW - 4))), sw = Math.min(w, c2 + C.colW - 2 - sx); if (sw <= 0) continue;
      const seg = ui.panel({ w: sw, h: 10, r: Math.min(3, sw / 2), color: s.color, depth: 2, bevel: 1, outline: null, gloss: false, shadow: false }); card.put(seg, sx, 50, 6); sx += w;
    }
    SRC.forEach((s, k) => {
      const v = h.bySrc[s.id] || 0, y = 82 + k * 40, name = s.name(h), num = fmtNum(v), share = h.dealt > 0 ? Math.round(v / h.dealt * 100) + '%' : '0%';
      const nodes = [card.put(ui.panel({ w: 10, h: 10, r: 3, color: s.color, depth: 1, bevel: 0.8, ow: 1.4, gloss: false, shadow: false }), c2, y - 5, 4)];
      nodes.push(fit(T(card, name, { size: 12 }, c2 + 16, y, 8, card), C.colW - 16));
      nodes.push(T(card, num, { size: 14, align: 'left' }, c2 + 16, y + 17, 8, card));
      nodes.push(T(card, share, { size: 12, align: 'right', color: GOLD }, c2 + C.colW, y + 17, 8, card));
      if (v <= 0) nodes.forEach((n) => n.setOpacity && n.setOpacity(0.42));
      d.src.push({ id: s.id, name, num, val: v, pct: share, dim: v <= 0 });
    });
    // column 3: cards, then the stats
    const c3 = cx(2);
    label(card, `THẺ ĐÃ CHỌN (${h.cards.length})`, c3, 14);
    const descT = T(card, '', { size: 12, color: 0xfff1cf, maxW: C.colW, lineH: 13, valign: undefined }, c3, 78, 8, card);
    const marks = [];
    const select = (k) => { const c = CARD[h.cards[k]]; d.selected = k; descT.set(`${c.name}: ${c.desc}`); d.desc = `${c.name}: ${c.desc}`; marks.forEach((m, j) => m.setVisible(j === k)); };
    h.cards.slice(0, 4).forEach((cid, k) => {
      const c = CARD[cid], rc = CARD_RARITY[c.rar] ? CARD_RARITY[c.rar].color : 0x8fa3b8, x = c3 + 2 + k * 46;
      const m = ui.panel({ w: 44, h: 44, r: 11, color: 0xffffff, depth: 2, bevel: 1.4, ow: 2, shadow: false, gloss: false }); card.put(m, x - 2, 26, 1); marks.push(m);
      const b = ui.button({ id: 'stat-card' + k, w: 40, h: 40, r: 10, color: rc, icon: c.icon, onTap: () => select(k) }); card.put(b, x, 28, 4);
      d.cards.push({ id: cid, name: c.name, desc: c.desc, rar: c.rar });
    });
    if (h.cards.length) select(0); else T(card, 'Chưa chọn thẻ nào ở ải này', { size: 12, align: 'center', color: LAV }, c3 + C.colW / 2, 50, 8, card);
    label(card, 'CHỈ SỐ: ĐẦU ẢI → CUỐI ẢI', c3, 148);
    STAT_ROWS.forEach((s, k) => {
      const y = 168 + k * 29, a = h.start[s.key], z = h.end[s.key], same = Math.abs(z - a) < 1e-6 || s.fmt(a) === s.fmt(z);
      const then = s.fmt(a), now = s.fmt(z), line = `${then} → ${now}`;
      const gain = same ? '' : s.points ? `+${Math.round((z - a) * 100)} điểm` : `${z > a ? '+' : ''}${Math.round((z - a) / a * 100)}%`;
      T(card, s.label, { size: 11, color: LAV, outlineW: 1.3 }, c3, y, 8, card);
      T(card, line, { size: 13 }, c3, y + 13, 8, card);
      if (gain) T(card, gain, { size: 12, align: 'right', color: z > a ? GREEN : RED }, c3 + C.colW, y + 13, 8, card);
      d.stats.push({ key: s.key, label: s.label, then, now, gain, line });
    });
  }
  function closeDetail() { if (detailG) { kill(detailG); detailG = null; } reg.detail = null; reg.texts = reg.texts.filter((t) => t.node.parent); if (listG) listG.setVisible(true); if (api.onDetail) api.onDetail(false); }

  // text ink against its panel, in the panel's own frame: returns the strings that stick out
  const _v = new THREE.Vector3();
  reg.audit = () => {
    const bad = [];
    for (const t of reg.texts) {
      const n = t.node, b = t.box; if (!b || !n.parent) continue; let on = true; for (let a = n; a; a = a.parent) if (a.visible === false) on = false; if (!on) continue;
      const slot = b.slot || b; n.updateWorldMatrix(true, false); slot.updateWorldMatrix(true, false);
      const w = n.w, h = n.h, x0 = t.align === 'right' ? -w : t.align === 'center' ? -w / 2 : 0, y0 = t.top ? -h : -h / 2, y1 = t.top ? 0 : h / 2, bw = b.w, bh = b.h;
      let lo = [1e9, 1e9], hi = [-1e9, -1e9];
      for (const [cx, cy] of [[x0, y0], [x0 + w, y0], [x0, y1], [x0 + w, y1]]) { _v.set(cx, cy, 0); n.localToWorld(_v); slot.worldToLocal(_v); lo = [Math.min(lo[0], _v.x), Math.min(lo[1], _v.y)]; hi = [Math.max(hi[0], _v.x), Math.max(hi[1], _v.y)]; }
      const e = 0.6;
      if (lo[0] < -e || hi[0] > bw + e || hi[1] > e || lo[1] < -bh - e) bad.push(`${t.str}: x ${lo[0].toFixed(1)}..${hi[0].toFixed(1)} of 0..${bw}, y ${(-hi[1]).toFixed(1)}..${(-lo[1]).toFixed(1)} of 0..${bh}`);
    }
    return bad;
  };

  const api = {
    node: root,
    build(r) {
      clear(); r0 = r; report = (r.report || []).slice(); sortI = 0; reg.sortId = 'dealt'; reg.report = report; reg.view = 'list';
      buildList();
    },
    dbg() { return { view: detailG ? 'detail' : 'list', sort: reg.sortId }; },
  };
  return api;
}
