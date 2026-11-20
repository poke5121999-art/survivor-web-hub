// Shared chrome of the menu screens in landscape (the left rail of five tabs, the settings gear, the counters with the
// account level top-right, the warm backdrop) and the Ra Trận tab. The other menu screens (heroes.js, gacha.js, soon.js)
// never draw the chrome: they only name themselves in MENU. Their content lives right of RAIL.right (106) and below the
// counters (y 48) on the right; the toast sits top-centre (ui.toastAt).
import { stageDef, expectedLevel } from '../data/stages.js?v=20261120d';
import { HERO } from '../data/heroes.js?v=20261120d';
import { HERO_RARITY, levelMul } from '../data/economy.js?v=20261120d';
import { createDiorama } from './diorama.js?v=20261120d';
import { lockButton } from './guide.js?v=20261120d';
import { xpNeed } from '../data/unlocks.js?v=20261120d';

export const MENU = ['home', 'heroes', 'hero', 'gacha', 'equip', 'rewards'];
// rail geometry in design units: buttons start at x, the backdrop panel ends at right; content starts at right + 8
export const RAIL = { x: 28, w: 60, right: 98, top: 62, gap: 3, tabH: 52, content: 106 };
const TAB_OF = { home: 'tab-battle', heroes: 'tab-heroes', hero: 'tab-heroes', gacha: 'tab-gacha', equip: 'tab-equip', rewards: 'tab-rewards' };
const GO = { 'tab-gacha': 'gacha', 'tab-equip': 'equip', 'tab-battle': 'home', 'tab-heroes': 'heroes', 'tab-rewards': 'rewards' };
const DOT_OF = { 'tab-gacha': 'gacha', 'tab-equip': 'equip', 'tab-heroes': 'heroes', 'tab-rewards': 'rewards' };
const TAB_LOCK = { 'tab-gacha': 'gacha', 'tab-equip': 'equip' };
const TABS = [['tab-gacha', 'Triệu Hồi', null], ['tab-equip', 'Trang Bị', 'armor'], ['tab-battle', 'Ra Trận', 'sword'], ['tab-heroes', 'Tướng', 'shield'], ['tab-rewards', 'Thưởng', 'chest']];

// The left rail. Built once per game into `screen` (the shared chrome, which is shown above every MENU screen, so the
// other screens get it without calling this); a later call only sets the active tab and returns the same rail.
// Returns { setActive(id), update(dt), refreshDots(), setVisible(b), dirty(), tabs, right }.
export function buildRail(ui, game, screen, active = 'tab-battle') {
  if (game.rail) { game.rail.setActive(active); return game.rail; }
  const meta = game.meta, PAL = ui.PAL, THREE = ui.THREE, mui = game.metaUi || (game.metaUi = {});
  const nav = ui.panel({ w: RAIL.right + 26, h: 5 * RAIL.tabH + 4 * RAIL.gap + 16, r: 18, color: 0x3a2d78, depth: 5, bevel: 3 });
  screen.put(nav, -26, RAIL.top - 8, 0);
  const glowCan = document.createElement('canvas'); glowCan.width = glowCan.height = 64;
  { const c = glowCan.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,210,120,1)'); g.addColorStop(0.5, 'rgba(255,150,60,.55)'); g.addColorStop(1, 'rgba(255,120,40,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(92, 92), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glowCan), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  nav.put(glow, 56, 34, 0.2);
  const tabs = {}; let y = 8;
  for (const [id, label, icon] of TABS) {
    const big = id === 'tab-battle', w = RAIL.w, h = RAIL.tabH;
    const b = ui.button({ id, w, h, r: 14, color: big ? PAL.orange : 0x5b49a8, icon: icon || undefined, label, stack: true, size: 10, onTap: () => { const need = TAB_LOCK[id]; if (need && !meta.unlocked(need)) { ui.toast(meta.lockText(need)); return; } game.goto(GO[id]); } });
    nav.put(b, RAIL.x + 26, y, 1.5);
    if (!icon) { const cap = capsule3d(THREE, 0xff8ad0, 0x6ad8ff); cap.scale.setScalar(16); cap.rotation.z = 0.55; cap.rotation.x = 0.25; b.put(cap, w / 2, h * 0.36, 9); }
    tabs[id] = { b, x0: RAIL.x + 26, cx: RAIL.x + 26, y0: y, cy: y };
    if (TAB_LOCK[id]) { tabs[id].lock = ui.icon('lock', { size: 24, sway: false }); b.put(tabs[id].lock, w - 24, -4, 16); }
    y += h + RAIL.gap;
  }
  let cur = active, dotsDirty = true;
  meta.on(() => { dotsDirty = true; });
  const rail = {
    tabs, right: RAIL.right, node: nav,
    setActive(id) { cur = id; },
    dirty() { dotsDirty = true; },
    setVisible(b) { nav.setVisible(!!b); },
    refreshDots() {
      const d = meta.dots(); mui.badges = {};
      for (const id of Object.keys(DOT_OF)) { mui.badges[id] = !!d[DOT_OF[id]]; tabs[id].b.setBadge(mui.badges[id]); }
    },
    update(dt) {
      if (dotsDirty) { dotsDirty = false; rail.refreshDots(); }
      for (const id in TAB_LOCK) { const lk = !meta.unlocked(TAB_LOCK[id]); lockButton(tabs[id].b, lk); tabs[id].lock.setVisible(lk); }
      for (const id in tabs) { const tb = tabs[id], tx = tb.x0 + (id === cur ? 8 : 0); tb.cx += (tx - tb.cx) * (1 - Math.exp(-dt * 14)); tb.b.pos(tb.cx, tb.y0); }
      const at = tabs[cur];
      if (at) { glow.position.x += (at.cx + RAIL.w / 2 - glow.position.x) * (1 - Math.exp(-dt * 14)); glow.position.y = -(at.y0 + RAIL.tabH / 2); const s = 1 + Math.sin(ui.t * 4) * 0.06; glow.scale.set(s, s, 1); }
    },
  };
  game.rail = rail; rail.refreshDots();
  return rail;
}

const VISIT = { gacha: 'gacha', heroes: 'heroes', hero: 'heroes', equip: 'equip', rewards: 'rewards' };
const SLOT_UNLOCK = [null, 'slot2', 'slot3', 'slot4'];
const STAGES_PER_CHAPTER = 5, CAMPAIGN_CHAPTERS = 6;
const chapterOf = (n) => Math.floor((n - 1) / STAGES_PER_CHAPTER);
const chapterStart = (k) => k * STAGES_PER_CHAPTER + 1;

// kit dispose() mutates the tree while it walks it: release the deepest nodes first
export function kill(n) { const list = []; n.traverse((o) => list.push(o)); for (let i = list.length - 1; i >= 0; i--) if (list[i].dispose) list[i].dispose(); n.parent && n.parent.remove(n); }
export const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const rarityColor = (id) => HERO_RARITY[HERO[id].rarity].color;
const hex = (n) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');
const fmtTime = (s) => { const m = Math.floor(s / 60), r = Math.round(s % 60); return m ? `${m} phút ${r} giây` : `${r} giây`; };

// ---------- backdrop: a vertical gradient with slow soft shapes ----------
const THEMES = {
  battle: { g: ['#2a1c78', '#7a2fa8', '#e0507a'], accent: 0xffb060 },
  heroes: { g: ['#0f3f86', '#1f86c0', '#2fd0a8'], accent: 0x9affd8 },
  gacha: { g: ['#3a1a8a', '#b02f9a', '#ff7a5a'], accent: 0xffd0f0 },
  equip: { g: ['#a8340f', '#f07a1f', '#ffc23a'], accent: 0xfff0b0 },
  rewards: { g: ['#7a2a8a', '#e0902a', '#ffd860'], accent: 0xfff6c0 },
};
const texCache = new Map();
function softTex(THREE, kind) {
  if (texCache.has(kind)) return texCache.get(kind);
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  if (kind === 'glow') { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }
  else if (kind === 'sq') { g.fillStyle = '#fff'; g.beginPath(); g.roundRect(14, 14, 100, 100, 26); g.fill(); }
  else { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(64, 6); g.lineTo(122, 64); g.lineTo(64, 122); g.lineTo(6, 64); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; texCache.set(kind, t); return t;
}
export function makeBackdrop(ui, theme) {
  const THREE = ui.THREE, T = THEMES[theme], node = ui.group(), c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256); T.g.forEach((col, i) => gr.addColorStop(i / 2, col)); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(780, 440), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); bg.position.set(390, -180, 0); node.add(bg);
  const shapes = [];
  const defs = [['glow', 360, 0.38, 130, 90], ['glow', 320, 0.3, 640, 120], ['glow', 400, 0.26, 380, 300], ['sq', 130, 0.12, 120, 260], ['sq', 100, 0.12, 690, 300], ['dia', 150, 0.1, 560, 60], ['dia', 100, 0.12, 260, 90], ['sq', 120, 0.09, 730, 200]];
  defs.forEach(([k, s, a, x, y], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: softTex(THREE, k), color: T.accent, transparent: true, opacity: a, depthWrite: false, toneMapped: false, blending: k === 'glow' ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.position.set(x, -y, 1 + i * 0.1); node.add(m); shapes.push({ m, x, y, k, ph: i * 1.3, sp: 0.15 + (i % 3) * 0.07 });
  });
  node.tick = (t) => { for (const s of shapes) { s.m.position.set(s.x + Math.sin(t * s.sp + s.ph) * 26, -(s.y + Math.cos(t * s.sp * 0.8 + s.ph) * 22), s.m.position.z); if (s.k !== 'glow') s.m.rotation.z = t * 0.12 * (s.ph % 2 > 1 ? -1 : 1) + s.ph; } };
  return node;
}

// ---------- burst of little gems at a design point; the owner calls update(dt) ----------
export function makeBurst(ui) {
  const THREE = ui.THREE, node = ui.group(), geo = new THREE.OctahedronGeometry(1), ps = [];
  return {
    node,
    spawn(x, y, n = 16, color = 0xffd21f, speed = 160) {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xffffff : color, transparent: true, toneMapped: false }));
        const a = Math.random() * 6.283, v = speed * (0.4 + Math.random() * 0.8), s = 2.5 + Math.random() * 3.5;
        m.scale.set(s, s * 1.4, s); m.position.set(x, -y, 4); node.add(m); ps.push({ m, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: 0.55 + Math.random() * 0.4 });
      }
    },
    update(dt) {
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]; p.t += dt; p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        p.m.position.set(p.x, -p.y, 4); p.m.rotation.y += dt * 8; p.m.material.opacity = Math.max(0, 1 - p.t / p.life);
        if (p.t >= p.life) { p.m.material.dispose(); node.remove(p.m); ps.splice(i, 1); }
      }
    },
  };
}

// ---------- the gacha capsule: a two-tone pill with a gold seam band (not a ball) ----------
export function capsule3d(THREE, colA, colB) {
  const g = new THREE.Group(), r = 0.42, len = 0.9;
  const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.rough ?? 0.32, emissive: o.emi || 0, emissiveIntensity: o.emi ? 0.6 : 0 });
  const half = (c, sign) => {
    const h = new THREE.Group(), mat = m(c);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len / 2, 20, 1, true), mat); cyl.position.y = sign * len / 4; h.add(cyl);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, sign > 0 ? 0 : Math.PI / 2, Math.PI / 2), mat); cap.position.y = sign * len / 2; h.add(cap);
    const gloss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })); gloss.scale.set(0.8, 1.9, 0.5); gloss.position.set(-0.22, sign * len * 0.5, 0.28); h.add(gloss);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, 20), new THREE.MeshBasicMaterial({ color: 0x20153a, side: THREE.DoubleSide })); inner.rotation.x = Math.PI / 2; h.add(inner);
    return h;
  };
  const top = half(colA, 1), bot = half(colB, -1); g.add(top, bot);
  const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.015, 0.045, 8, 24), m(0xffd21f, { rough: 0.25 })); band.rotation.x = Math.PI / 2; g.add(band);
  g.userData = { top, bot, band, len, r };
  return g;
}

function recPower(meta, n) {
  const L = expectedLevel(n), mul = levelMul(L);
  return meta.acc.team.reduce((s, id) => s + Math.round(HERO[id].atk * mul * 4 + (HERO[id].hp * mul) / 2), 0);
}

export function createHome(game) {
  const ui = game.ui, meta = game.meta, PAL = ui.PAL, THREE = ui.THREE;
  const mui = (game.metaUi = { titles: [], barText: { gold: '', gems: '' }, rates: [], regTitle(screen, node, str) { mui.titles.push({ screen, node, str }); } });
  const chrome = ui.screen('chrome'), home = ui.screen('home');
  const chromeShown = () => MENU.some((n) => ui.isShown(n));

  // ---- chrome: counters and account level top-right, the gear top-left above the rail ----
  const shownVal = { gold: meta.acc.gold, gems: meta.acc.gems };
  const counters = {};
  const pill = (key, icon, x, w) => {
    const p = ui.panel({ w, h: 32, r: 16, color: 0x2a2150, depth: 3, bevel: 2, ow: 2.2, shadow: false }); chrome.put(p, x, 8);
    const t = ui.text(fmt(shownVal[key]), { size: 16, align: 'right', valign: 'mid' }); p.put(t, w - 12, 17); p.put(ui.icon(icon, { size: 36 }), -8, -3, 4);
    counters[key] = { t, last: fmt(shownVal[key]) }; mui.barText[key] = counters[key].last;
  };
  pill('gold', 'gold', 466, 100); pill('gems', 'gem', 572, 92);
  const lvPill = ui.panel({ w: 80, h: 32, r: 16, color: 0x2a2150, depth: 3, bevel: 2, ow: 2.2, shadow: false }); chrome.put(lvPill, 672, 8);
  const lvTxt = ui.text('Cấp 1', { size: 13, align: 'center', valign: 'mid' }); lvPill.put(lvTxt, 40, 10, 2);
  const lvBar = ui.bar({ w: 62, h: 8, color: PAL.green, r: 4, value: 0 }); lvPill.put(lvBar, 9, 19.5, 1);
  mui.level = { text: 'Cấp 1' };
  let lvKey = '';
  const gear = ui.button({ id: 'gear', w: RAIL.w, h: 44, r: 12, color: PAL.blue, icon: 'gear', shadow: false, onTap: () => { if (game.openSettings) game.openSettings(); } });
  chrome.put(gear, RAIL.x, 6);

  const rail = buildRail(ui, game, chrome, 'tab-battle');
  game.chrome = {
    raise() { ui.show('chrome', { transition: 'none' }); },
    setNav(b) { rail.setVisible(b); },
  };
  game.events.on('screen', ({ name }) => {
    if (!MENU.includes(name)) return;
    rail.setActive(TAB_OF[name]); game.chrome.raise(); rail.setVisible(name !== 'hero');
    if (VISIT[name]) meta.visitTab(VISIT[name]);
  });

  const bd = makeBackdrop(ui, 'battle'); home.put(bd, 0, 0, -40);

  // ---- Ra Trận: header and diorama in the middle, team and the start button in the right column ----
  const CX = 338, COL = 576, COLW = 176;
  let sel = 0, lastMax = 0; mui.stage = () => sel;
  const maxStage = () => meta.acc.cleared + 1;
  const chapLine = ui.text('CHƯƠNG 1: PHỐ HOANG', { size: 12.5, color: 0xffe9a8, align: 'center', upper: true, outlineW: 2.2 }); home.put(chapLine, CX, 5, 6); mui.regTitle('home', chapLine);
  const title = ui.text('ẢI 1', { size: 30, color: PAL.gold, align: 'center', upper: true, outlineW: 3.6, shadow: 2.5 }); home.put(title, CX, 19, 6); mui.regTitle('home', title);
  const stageName = ui.text('PHỐ HOANG 1', { size: 14, align: 'center', upper: true, outlineW: 2.2 }); home.put(stageName, CX, 57, 6); mui.regTitle('home', stageName);
  const bossPill = ui.panel({ w: 200, h: 26, r: 13, color: 0x2a2150, depth: 3, bevel: 2, ow: 2.2, shadow: false }); home.put(bossPill, 238, 78);
  const skull = ui.icon('skull', { size: 28 }); bossPill.put(skull, -6, -1, 4);
  const bossTxt = ui.text('Boss: Khổng Lồ', { size: 13, align: 'left', valign: 'mid' }); bossPill.put(bossTxt, 28, 14);
  const spikeTag = ui.panel({ w: 80, h: 26, r: 13, color: 0xe0242e, depth: 3, bevel: 2, ow: 2.2, shadow: false }); home.put(spikeTag, 402, 78);
  spikeTag.put(ui.text('ẢI GẮT', { size: 13, align: 'center', upper: true, valign: 'mid' }), 40, 14);

  const DW = 344, DH = 224, FX = 160, FY = 108;
  const dio = createDiorama(ui, { w: DW, h: DH });
  const frameP = ui.panel({ w: DW + 12, h: DH + 12, r: 22, color: 0x5a3fa0, depth: 5, bevel: 3 }); home.put(frameP, FX, FY);
  frameP.put(dio.node, 6, 6, 1);
  const hint = ui.text('', { size: 12, align: 'center', color: 0xffe9a8, outlineW: 2 }); frameP.put(hint, (DW + 12) / 2, DH - 14, 10);
  // five pips of the chapter under the diorama's top edge: cleared, next to play, locked; the fifth is the boss spike
  const pipBar = ui.panel({ w: 186, h: 34, r: 17, color: 0x2a2150, depth: 3, bevel: 2, ow: 2.2, shadow: false }); home.put(pipBar, CX - 93, FY + 6, 12);
  const pipRing = ui.panel({ w: 30, h: 30, r: 15, color: 0xffffff, depth: 1, bevel: 0.5, ow: 2, shadow: false }); pipBar.put(pipRing, 0, 2, 1);
  const pips = [0, 1, 2, 3, 4].map((i) => {
    const spike = i === STAGES_PER_CHAPTER - 1, p = ui.panel({ w: 24, h: 24, r: 12, color: PAL.disabled, depth: 2, bevel: 1.2, ow: 2, shadow: false }); pipBar.put(p, 13 + i * 34, 5, 3);
    if (spike) { const sk = ui.icon('skull', { size: 24, sway: false }); p.put(sk, 0, 0, 4); }
    return { p, x: 13 + i * 34 };
  });
  mui.pips = []; mui.chapterLine = '';
  const AX = RAIL.content, BX = FX + DW + 12 + 4;
  const prev = ui.button({ id: 'stage-prev', w: 48, h: 56, r: 14, color: PAL.blue, icon: 'left', onTap: () => setStage(sel - 1) }); home.put(prev, AX, 138, 6);
  const next = ui.button({ id: 'stage-next', w: 48, h: 56, r: 14, color: PAL.blue, icon: 'right', onTap: () => setStage(sel + 1) }); home.put(next, BX, 138, 6);
  const lockI = ui.icon('lock', { size: 22 }); home.put(lockI, BX + 13, 152, 20);
  const chapPrev = ui.button({ id: 'chapter-prev', w: 48, h: 56, r: 14, color: PAL.purple, icon: 'left', label: 'CHƯƠNG', stack: true, size: 8.5, onTap: () => setStage(chapterStart(chapterOf(sel) - 1)) }); home.put(chapPrev, AX, 208, 6);
  const chapNext = ui.button({ id: 'chapter-next', w: 48, h: 56, r: 14, color: PAL.purple, icon: 'right', label: 'CHƯƠNG', stack: true, size: 8.5, onTap: () => setStage(chapterStart(chapterOf(sel) + 1)) }); home.put(chapNext, BX, 208, 6);

  home.put(ui.text('ĐỘI HÌNH', { size: 12, color: 0xffe9a8, outlineW: 2 }), COL, 48, 6);
  const powTxt = ui.text('', { size: 12, align: 'left', color: 0xffe9a8, outlineW: 1.8 }); home.put(powTxt, COL, 64, 6);
  let slotNodes = [];
  const recTxt = ui.text('', { size: 12, align: 'center', outlineW: 1.8 }); home.put(recTxt, COL + COLW / 2, 226, 6);
  const bestTxt = ui.text('', { size: 11.5, align: 'center', color: 0xffe9a8, outlineW: 1.8 }); home.put(bestTxt, COL + COLW / 2, 243, 6);
  const start = ui.button({ id: 'start', w: COLW, h: 64, color: PAL.green, label: 'BẮT ĐẦU', sub: ' ', size: 24, pulse: true, onTap: () => { if (sel >= 1 && sel <= maxStage()) game.startBattle(sel); } });
  home.put(start, COL, 268, 6);

  function buildSlots() {
    for (const s of slotNodes) kill(s); slotNodes = [];
    const S = 66, G = 8, X0 = COL + (COLW - 2 * S - G) / 2;
    for (let i = 0; i < 4; i++) {
      const id = meta.acc.team[i], px = X0 + (i % 2) * (S + G), py = 82 + Math.floor(i / 2) * (S + 6), need = SLOT_UNLOCK[i];
      if (need && !meta.unlocked(need)) {
        const p = ui.tile({ size: S, color: 0x6b6785, id: 'team-' + i, onTap: () => ui.toast(meta.lockText(need)) });
        p.put(ui.icon('lock', { size: 32, sway: false }), 17, 5, 14);
        p.put(ui.text(meta.lockText(need).replace('Mở khi qua ải ', 'Ải '), { size: 10, align: 'center', outlineW: 1.6, maxW: 58 }), S / 2, 42, 14);
        home.put(p, px, py, 6); slotNodes.push(p);
      } else if (id) {
        const p = ui.portrait(id, { size: S, color: rarityColor(id), id: 'team-' + i, onTap: () => game.goto('heroes', { mode: 'team', slot: i }) });
        p.put(ui.text('Lv.' + meta.acc.heroes[id].level, { size: 11, outlineW: 1.8 }), 6, 50, 14); home.put(p, px, py, 6); slotNodes.push(p);
      } else {
        const p = ui.tile({ size: S, color: PAL.disabled, node: ui.text('+', { size: 32 }), id: 'team-' + i, onTap: () => game.goto('heroes', { mode: 'team', slot: i }) });
        home.put(p, px, py, 6); slotNodes.push(p);
      }
    }
  }
  let teamKey = '';
  function setStage(n) {
    const max = maxStage(); n = Math.max(1, Math.min(max, n)); const same = n === sel; sel = n;
    const def = stageDef(n); dio.dress(n);
    const k = chapterOf(n), endless = k >= CAMPAIGN_CHAPTERS;
    mui.chapterLine = endless ? 'Vô Tận: ải ' + n : 'Chương ' + (k + 1) + ': ' + def.chapterName; chapLine.set(mui.chapterLine);
    title.set('ẢI ' + n); stageName.set(def.name);
    mui.pips = pips.map((pp, i) => {
      const m = chapterStart(k) + i, st = m <= meta.acc.cleared ? 'cleared' : m <= max ? 'current' : 'locked', spike = i === STAGES_PER_CHAPTER - 1;
      pp.p.setColor(st === 'cleared' ? PAL.green : st === 'current' ? PAL.gold : spike ? 0x6a3040 : PAL.disabled);
      return { n: m, state: st, spike, sel: m === n };
    });
    pipRing.pos(pips[(n - 1) % STAGES_PER_CHAPTER].x - 3, 2);

    bossTxt.set('Boss: ' + def.bossName);
    spikeTag.setVisible(def.spike); bossPill.pos(def.spike ? 194 : 238, 78);
    const best = meta.acc.best[n]; bestTxt.set(best ? 'Kỷ lục: ' + fmtTime(best) : 'Chưa có kỷ lục');
    prev.setEnabled(n > 1);
    const lockedNext = n >= max; next.setEnabled(!lockedNext); lockI.setVisible(lockedNext);
    chapPrev.setEnabled(k > 0); chapNext.setEnabled(chapterStart(k + 1) <= max);
    hint.set(n >= max ? 'Thắng ải này để mở ải kế tiếp' : '');
    start.setSub('Ải ' + n);
    refreshTeam(false); return !same;
  }
  function refreshTeam(force) {
    const key = meta.acc.team.map((id) => id + meta.acc.heroes[id].level).join(',') + '|' + meta.slots();
    if (force || key !== teamKey) { teamKey = key; buildSlots(); }
    const tp = meta.teamPower(), rp = recPower(meta, sel);
    powTxt.set('Sức mạnh đội: ' + fmt(tp));
    recTxt.set('Đề nghị: ' + fmt(rp)); recTxt.setColor(tp >= rp ? 0x7dff8a : 0xffa040);
  }

  const showHome = () => {
    const max = maxStage();
    if (!sel || sel === lastMax || sel > max) sel = max;
    lastMax = max; ui.show('home', { transition: 'none' }); setStage(sel); rail.dirty();
  };
  const hideHome = () => ui.hide('home', { transition: 'none' });
  meta.on(() => { if (ui.isShown('home')) { const m = maxStage(); if (sel === lastMax) sel = m; lastMax = m; setStage(sel); } });

  const screenApi = { name: 'home', show: showHome, hide: hideHome, update() { if (ui.isShown('home')) bd.tick(ui.t); } };

  const chromeApi = {
    name: 'chrome', show() {}, hide() {},
    update(dt) {
      const on = chromeShown();
      if (!on) { if (ui.isShown('chrome')) ui.hide('chrome', { transition: 'none' }); return; }
      if (!ui.isShown('chrome')) game.chrome.raise();
      for (const key of ['gold', 'gems']) {
        const tgt = meta.acc[key]; let v = shownVal[key];
        if (v !== tgt) { v += (tgt - v) * (1 - Math.exp(-dt * 9)); if (Math.abs(tgt - v) < 0.6) v = tgt; shownVal[key] = v; }
        const s = fmt(v); if (s !== counters[key].last) { counters[key].last = s; counters[key].t.set(s); mui.barText[key] = s; }
      }
      { const L = meta.acc.level, k = L + ':' + meta.acc.xp; if (k !== lvKey) { lvKey = k; lvTxt.set('Cấp ' + L); lvBar.set(meta.acc.xp / xpNeed(L)); mui.level = { text: 'Cấp ' + L, level: L, xp: meta.acc.xp, need: xpNeed(L) }; } }
      rail.update(dt);
    },
  };
  return [chromeApi, screenApi];
}
