// HUD, menus, result screen. Builds its own DOM under #ui; reads G.match / G.me, never writes to the match.
import { MECHS, MECH_ORDER, DIFFICULTY, TEAMS, PICKUPS, RULES, levelXp, UPGRADE, upgradeMods, PAINTS, RANKS, BOSSES, MODES, MODE_ORDER } from './data.js';
import { rankOf, placeOf } from './meta.js';
import { MAPS, MAP_ORDER } from './maps.js';
import { visibleTo } from './sim.js';

/* ---------- icons ---------- */
const SOFT = 'fill="currentColor" fill-opacity=".26"';
const ICONS = {
  shield: `<path d="M12 3l7 3v6c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6z" ${SOFT}/><path d="M12 7.500v9"/>`,
  dash: `<path d="M11 5l8 7-8 7z" ${SOFT}/><path d="M3 8h5M2 12h6M3 16h5"/>`,
  quake: '<path d="M4 20h16"/><path d="M6.500 15a7 7 0 0111 0"/><path d="M3.500 11.500a11 11 0 0117 0" opacity=".6"/><path d="M12 20l-1.500-3 3-2-1.500-3"/>',
  rocket: `<path d="M12 2.500c3 2.500 4 6 4 9.500v3H8v-3c0-3.500 1-7 4-9.500z" ${SOFT}/><circle cx="12" cy="9" r="1.600"/><path d="M8 13l-3 4.500 3-1M16 13l3 4.500-3-1M10.500 18.500L12 22l1.500-3.500"/>`,
  boost: `<path d="M13 2L5 13.500h6L10 22l9-12.500h-6z" ${SOFT}/>`,
  barrage: `<path d="M6 3v6m0 0l-2-2.500M6 9l2-2.500M12 4v8m0 0l-2.500-3M12 12l2.500-3M18 3v6m0 0l-2-2.500M18 9l2-2.500"/><ellipse cx="12" cy="18" rx="8.500" ry="3" ${SOFT}/>`,
  mine: `<circle cx="12" cy="12" r="5" ${SOFT}/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2 2M16.400 16.400l2 2M18.400 5.600l-2 2M7.600 16.400l-2 2"/>`,
  blink: `<path d="M6 20v-9a6 6 0 0112 0v9l-2.500-2-3.500 2-3.500-2z" ${SOFT}/><circle cx="9.500" cy="11" r="1" fill="currentColor"/><circle cx="14.500" cy="11" r="1" fill="currentColor"/>`,
  beam: '<path d="M3 12h18" stroke-width="4" opacity=".3"/><path d="M3 12h18"/><circle cx="5" cy="12" r="2.500" fill="currentColor"/><path d="M15.500 8l3.500 4-3.500 4"/>',
  heal: `<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" ${SOFT}/>`,
  slow: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
  dome: `<path d="M3 19a9 9 0 0118 0z" ${SOFT}/><path d="M7 19a5 5 0 0110 0" opacity=".7"/>`,
  weapon: `<path d="M3 13h11v-3.500H3z" ${SOFT}/><path d="M14 10.500h7v2h-7zM6 13v4h5v-4"/>`,
  medkit: `<rect x="3.500" y="7" width="17" height="12" rx="2" ${SOFT}/><path d="M9 7V5h6v2M12 10v6M9 13h6"/>`,
  power: `<path d="M12 3l5 7h-3v10h-4V10H7z" ${SOFT}/>`,
  haste: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
  refresh: '<path d="M19 12a7 7 0 11-2.500-5.400"/><path d="M19 4v4.500h-4.500"/>',
  stun: `<path d="M12 3l2 5 5 .5-4 3.500 1.200 5.200L12 14.500 7.800 17.200 9 12 5 8.500 10 8z" ${SOFT}/>`,
  tank: `<path d="M12 2.500l8 4.500v10l-8 4.500-8-4.500V7z" ${SOFT}/><path d="M8.500 12h7"/>`,
  assault: '<path d="M5 8l7-4 7 4M5 14l7-4 7 4M5 20l7-4 7 4"/>',
  sniper: '<circle cx="12" cy="12" r="6.500"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  support: `<path d="M12 2l9 10-9 10-9-10z" ${SOFT}/><path d="M12 8v8M8 12h8"/>`,
  skull: '<path d="M12 3a7 7 0 00-4 12.800V19h8v-3.200A7 7 0 0012 3z"/><circle cx="9.500" cy="11" r="1.300" fill="currentColor"/><circle cx="14.500" cy="11" r="1.300" fill="currentColor"/>',
  coin: `<circle cx="12" cy="12" r="8.500" ${SOFT}/><circle cx="12" cy="12" r="5"/><path d="M12 9.500v5"/>`,
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M18.700 5.300l-2.100 2.100M7.400 16.600l-2.100 2.100"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.500 2.500 0 114 2c-1 .8-1.500 1.200-1.500 2.500M12 17.500v.5"/>',
  smoke: `<path d="M7 17.500a4 4 0 010-8 5 5 0 019.500-1A4.300 4.300 0 0117 17.500z" ${SOFT}/><path d="M7 21h10" opacity=".6"/>`,
  recoil: '<path d="M14 12H4M7.500 8.500L4 12l3.500 3.500"/><path d="M16.500 7.500l3-3M16.500 16.500l3 3M18 12h3.500"/>',
  storm: `<path d="M7 12.500a3.800 3.800 0 010-7.500 5 5 0 019.500 1A3.400 3.400 0 0117 12.500z" ${SOFT}/><path d="M11 14l-2 4h3l-1.500 4M16.500 14l-1.500 3h2.500l-1 3.500"/>`,
  cloak: '<path d="M2.500 12S6 6 12 6s9.500 6 9.500 6-3.500 6-9.500 6S2.500 12 2.500 12z"/><circle cx="12" cy="12" r="2.500"/><path d="M4.500 20L19.500 4"/>',
  spin: '<path d="M19 12a7 7 0 01-12.500 4.300M5 12a7 7 0 0112.500-4.300"/><path d="M18.500 3.500v4h-4M5.500 20.500v-4h4"/><circle cx="12" cy="12" r="1.500" fill="currentColor"/>',
  wall: `<rect x="3" y="6" width="18" height="12" ${SOFT}/><path d="M3 10h18M3 14h18M9 6v4M15 6v4M6 10v4M12 10v4M18 10v4M9 14v4M15 14v4"/>`,
  frost: '<path d="M12 3v18M4.200 7.500l15.600 9M4.200 16.500l15.600-9"/><path d="M9.500 4.500L12 7l2.500-2.500M9.500 19.500L12 17l2.500 2.500"/>',
  blizzard: `<path d="M7 12a3.500 3.500 0 010-7 4.500 4.500 0 018.700-.8A3.500 3.500 0 0117 12z" ${SOFT}/><path d="M8 15.500v.01M12 15.500v.01M16 15.500v.01M10 19.500v.01M14 19.500v.01" stroke-width="2.800"/>`,
  turret: `<path d="M6 19.500V15a5 5 0 0110 0v4.500z" ${SOFT}/><path d="M3 19.500h18"/><path d="M14 11.500l6-3" stroke-width="3"/>`,
  magnet: '<path d="M6 3.500V12a6 6 0 0012 0V3.500"/><path d="M6 7.500h4M14 7.500h4" stroke-width="3"/>',
  mines: `<circle cx="7" cy="15" r="3" ${SOFT}/><circle cx="17" cy="15" r="3" ${SOFT}/><circle cx="12" cy="7.500" r="3" ${SOFT}/><path d="M7 10.500v1M17 10.500v1M12 3v1M3 15h1M20 15h1"/>`,
  artillery: `<path d="M3.500 20.500h10"/><path d="M7 17.500l3-8 4 1.500-2 8z" ${SOFT}/><path d="M14 5a6.500 6.500 0 016.500 6.500" stroke-dasharray="1.500 2.500"/><circle cx="20.500" cy="13" r="1" fill="currentColor"/>`,
  flanker: '<path d="M4 20c0-7 5-11 13-11"/><path d="M13.500 4.500l4 4.500-4.500 3.500"/><circle cx="5.500" cy="19" r="1.600" fill="currentColor"/>',
  control: `<circle cx="12" cy="12" r="3" ${SOFT}/><path d="M12 3v4.500M12 21v-4.500M3 12h4.500M21 12h-4.500"/><path d="M9.500 5.500L12 8l2.500-2.500M9.500 18.500L12 16l2.500 2.500"/>`,
  engineer: `<path d="M14.500 5.500a4 4 0 00-5 5L4 16l4 4 5.500-5.500a4 4 0 005-5l-2.500 2.500-2.500-.5-.5-2.500z" ${SOFT}/>`,
  trophy: `<path d="M8 4h8v5a4 4 0 01-8 0z" ${SOFT}/><path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M10 17h4M8.500 20h7"/>`,
  wrench: `<path d="M14.500 5.500a4 4 0 00-5 5L4 16l4 4 5.500-5.500a4 4 0 005-5l-2.500 2.500-2.500-.5-.5-2.500z" ${SOFT}/>`,
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500v.01" stroke-width="2.400"/>',
  up: '<path d="M12 19V6M6 12l6-6 6 6"/>',
  generic: `<path d="M12 3l8 4.500v9L12 21l-8-4.500v-9z" ${SOFT}/><circle cx="12" cy="12" r="2"/>`,
  boss: '<path d="M12 6a7 7 0 00-4 12.800V21h8v-2.200A7 7 0 0012 6z"/><path d="M5 3.500l3.500 4M19 3.500l-3.500 4"/><circle cx="9.500" cy="13" r="1.300" fill="currentColor"/><circle cx="14.500" cy="13" r="1.300" fill="currentColor"/>',
  swords: '<path d="M4 4l9 9M20 4l-9 9"/><path d="M3.500 14.500l3 3M20.500 14.500l-3 3M7 17l-3 3M17 17l3 3"/>',
  flag: `<path d="M6 21V4" /><path d="M6 5h11l-2.500 3.500L17 12H6z" ${SOFT}/>`,
  leaf: `<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14z" ${SOFT}/><path d="M5 19l8-8"/>`,
  dune: `<circle cx="16.500" cy="7.500" r="3" ${SOFT}/><path d="M2.500 19c3-6 6-6 9 0 2-3.500 4.500-3.500 6.500-1l3.500 1"/>`,
  flake: '<path d="M12 3v18M4.200 7.500l15.600 9M4.200 16.500l15.600-9"/>',
  flame: `<path d="M12 3c1 4 5 6 5 11a5 5 0 01-10 0c0-2 1-3.500 2-4.500 0 2 1 3 2 3 0-3-1-6 1-9.500z" ${SOFT}/>`,
  crate: `<rect x="4" y="6" width="16" height="13" rx="1.500" ${SOFT}/><path d="M4 11h16M12 6v13"/>`,
};
const has = Object.prototype.hasOwnProperty;
export function icon(name, cls) {
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${has.call(ICONS, name) ? ICONS[name] : ICONS.generic}</svg>`;
}
const PICKUP_ICON = { heal: 'heal', power: 'power', haste: 'haste', refresh: 'refresh', shield: 'shield' };

/* ---------- helpers ---------- */
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const refs = (root) => { const o = {}; root.querySelectorAll('[data-r]').forEach((n) => { o[n.dataset.r] = n; }); return o; };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const vn = (n, d = 0) => n.toFixed(d).replace('.', ',');
const mmss = (t) => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
// Cached writers: touching the DOM only when a value changed keeps update() cheap on phones.
const setText = (n, v) => { if (n._v !== v) { n._v = v; n.textContent = v; } };
const setScale = (n, f) => { const q = Math.round(clamp01(f) * 200); if (n._q !== q) { n._q = q; n.style.transform = `scaleX(${q / 200})`; } };
const setVar = (n, k, v) => { if (n['_' + k] !== v) { n['_' + k] = v; n.style.setProperty(k, v); } };
const flag = (n, c, on) => { on = !!on; if (n['_f' + c] !== on) { n['_f' + c] = on; n.classList.toggle(c, on); } };
const pop = (n, from = 1.45, ms = 320) => { if (n.animate) n.animate([{ transform: `scale(${from})` }, { transform: 'scale(1)' }], { duration: ms, easing: 'cubic-bezier(.2,1.4,.4,1)' }); };

const SLOT_DEFS = [
  { k: 'fire', key: 'Chuột', cls: '' },
  { k: 's1', key: 'Q', cls: '' },
  { k: 's2', key: 'E', cls: '' },
  { k: 'ult', key: 'SPACE', cls: 'ult' },
  { k: 'heal', key: 'F', cls: 'item' },
];
const BUFFS = [
  ['hasteT', 'Tăng tốc', 'haste', 'good'], ['dmgT', 'Sát thương', 'power', 'good'], ['rapidT', 'Bắn nhanh', 'boost', 'good'],
  ['shieldT', 'Khiên', 'shield', 'good'], ['stealthT', 'Tàng hình', 'blink', 'good'], ['invulnT', 'Bảo hộ', 'dome', 'good'],
  ['slowT', 'Bị chậm', 'slow', 'bad'], ['stunT', 'Choáng', 'stun', 'bad'],
];
const STREAK = ['', '', 'Hạ đôi', 'Hạ ba', 'Hạ bốn', 'Hạ năm'];
const FLOAT_MAX = 40;
const NP_Y = 2.7;

export function makeUI(G) {
  const root = el('div'); root.id = 'ui';
  root.style.setProperty('--t0', TEAMS[0].css);
  root.style.setProperty('--t1', TEAMS[1].css);
  document.body.appendChild(root);
  const isTouch = () => !!(G.input ? G.input.touch : ('ontouchstart' in window || navigator.maxTouchPoints > 0));
  root.classList.toggle('is-touch', isTouch());

  const meta = () => G.meta && G.meta.get();
  const portraits = {};
  const portrait = (mech, team, paint) => {
    const k = mech + '|' + team + '|' + (paint || '');
    if (!(k in portraits)) { try { portraits[k] = G.portrait ? G.portrait(mech, team, paint) : ''; } catch (e) { portraits[k] = ''; } }
    return portraits[k];
  };
  const paintOf = (mech) => { const d = meta(); return (d && d.paints && d.paints[mech]) || 'goc'; };
  const levelOf = (mech) => { const d = meta(); return Math.min(UPGRADE.max, (d && d.upgrades && d.upgrades[mech]) || 0); };
  const rankNow = () => (G.meta && G.meta.rank ? G.meta.rank() : rankOf(0));
  // Accepts a unit (u.def covers bosses) or a mech key; a bare MECHS[key] lookup is undefined for 'titan'.
  const roleIcon = (x) => { const d = typeof x === 'string' ? MECHS[x] || BOSSES[x] : x && x.def; return icon(d ? d.roleKey : 'generic'); };

  let hudOn = false, paused = false, uiT = 0;
  let choice = null;

  /* ================= HUD ================= */
  const hud = el('div', 'hud');
  hud.innerHTML = `
    <div class="hud-top">
      <div class="top-bar" data-r="topBar"></div>
      <div class="mission" data-r="mission"></div>
    </div>
    <div class="col mine" data-r="colA"></div>
    <div class="col foe" data-r="colB"></div>
    <button class="pausebtn" data-block data-r="pauseBtn" aria-label="Tạm dừng">${icon('pause')}</button>
    <div class="feed" data-r="feed"></div>
    <div class="mm" data-r="mm"><canvas data-r="mmc"></canvas><span class="mm-name" data-r="mmn"></span></div>
    <div class="dock">
      <div class="buffs" data-r="buffs"></div>
      <div class="hpb">
        <div class="hpb-sh"><i data-r="shBar"></i></div>
        <div class="hpb-main"><i data-r="hpBar"></i><span data-r="hpNum">0</span></div>
      </div>
      <div class="slots" data-r="slots"></div>
    </div>
    <div class="vig" data-r="vig"><i></i></div>
    <div class="ann" data-r="ann"><b></b><small></small></div>
    <div class="warn" data-r="warn"><b></b></div>
    <div class="rsp" data-r="rsp"><div class="rsp-n" data-r="rspN">3</div><div class="rsp-t">Hồi sinh sau <b data-r="rspS">3</b></div><small data-r="rspBy"></small></div>`;
  const H = refs(hud);
  const hpb = hud.querySelector('.hpb');
  const fx = el('div', 'fx');
  root.append(fx, hud);

  // skill slots
  const slotEls = {};
  for (const d of SLOT_DEFS) {
    const s = el('div', 'slot ' + d.cls);
    s.innerHTML = `<div class="sl-ic"></div><i class="sl-cd"></i><b class="sl-t"></b><kbd>${d.key}</kbd>`;
    H.slots.appendChild(s);
    slotEls[d.k] = { root: s, ic: s.firstChild, t: s.querySelector('.sl-t'), total: 1, prev: 0 };
  }
  const buffEls = BUFFS.map((b) => {
    const c = el('span', 'chip ' + b[3], `${icon(b[2])}<em>${b[1]}</em><b></b>`);
    c.hidden = true; H.buffs.appendChild(c);
    return { root: c, t: c.querySelector('b'), on: false };
  });

  /* ---- per-match state ---- */
  let curMatch = null, myTeam = 0, myColor = 0, S = null, MH = null, T = {};
  const cards = {}, nps = {};
  let mmCtx = null, mmStatic = null, mmScale = 1;

  const fmtN = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const bossOf = (m) => m.units.find((u) => u.def.boss);
  const sideColor = (team) => (team === myTeam ? myColor : 1 - myColor);
  const POINT_LETTER = ['A', 'B', 'C', 'D', 'E'];
  // Cached width writer for the boss bar: the asserted value is the real percentage, not a transform.
  const setW = (n, f) => { const q = Math.round(clamp01(f) * 1000) / 10; if (n._w !== q) { n._w = q; n.style.width = q + '%'; } };

  function addCard(col, u) {
    const c = el('div', `pc t${u.color}${u.id === G.me ? ' me' : ''}`);
    c.innerHTML = `<div class="pc-img"><img alt="" src="${portrait(u.mech, u.color, u.id === G.me ? paintOf(u.mech) : u.paint)}"><span class="pc-role">${roleIcon(u)}</span><div class="pc-dead"><b></b></div></div>
      <div class="pc-info"><span class="pc-name">${esc(u.name)}</span><div class="pc-hp"><i></i></div><span class="pc-kd">0 / 0</span></div>`;
    col.appendChild(c);
    cards[u.id] = { root: c, hp: c.querySelector('.pc-hp i'), dead: c.querySelector('.pc-dead b'), kd: c.querySelector('.pc-kd') };
  }
  function addPlate(u) {
    const np = el('div', `np t${u.color}${u.id === G.me ? ' self' : ''}${u.def.boss ? ' boss' : ''}`);
    np.innerHTML = u.id === G.me
      ? '<span class="np-mark"></span><div class="np-hp"><i class="np-f"></i></div><div class="np-sh"><i></i></div>'
      : `<span class="np-n">${roleIcon(u)}${esc(u.name)}</span><div class="np-hp"><i class="np-f"></i></div><div class="np-sh"><i></i></div>`;
    np.classList.add('off');
    fx.appendChild(np);
    nps[u.id] = { root: np, f: np.querySelector('.np-f'), sh: np.querySelector('.np-sh i'), shBox: np.querySelector('.np-sh') };
  }
  const teamCols = (m) => {
    for (const team of [myTeam, 1 - myTeam]) for (const u of m.units) if (u.team === team) addCard(team === myTeam ? H.colA : H.colB, u);
  };

  // Score bar shared by tdm and chiem; tudo labels its two sides with a name.
  const scoreTop = (m, who) => `<div class="sc">
      <div class="sc-side mine t${myColor}"><div class="sc-col">${who ? '<small data-r="w0">Bạn</small>' : ''}<div class="sc-bar"><i data-r="bar0"></i></div></div><b class="sc-n" data-r="k0">0</b></div>
      <div class="sc-mid"><small>Mục tiêu <b data-r="tgt">${m.target}</b></small><span class="sc-clock" data-r="clock">5:00</span></div>
      <div class="sc-side foe t${1 - myColor}"><b class="sc-n" data-r="k1">0</b><div class="sc-col">${who ? '<small data-r="w1"></small>' : ''}<div class="sc-bar"><i data-r="bar1"></i></div></div></div>
    </div>`;
  function setScores(a, b, target) {
    if (T.k0._v !== String(a)) { setText(T.k0, String(a)); pop(T.k0); }
    if (T.k1._v !== String(b)) { setText(T.k1, String(b)); pop(T.k1); }
    setScale(T.bar0, a / target); setScale(T.bar1, b / target);
  }

  const warn = (text) => { H.warn.firstChild.textContent = text; S.warnT = 2.4; };

  // One row per game mode: how its top bar, side columns, minimap extras, world labels and events are built and kept current.
  // solo: no right-hand column.  minuteSub: second line of the "Còn 1 phút" call-out.
  const MODE_HUD = {
    tdm: {
      minuteSub: 'Ai dẫn điểm sẽ thắng',
      top: (m) => scoreTop(m, false),
      cols: teamCols,
      tick(m) { setScores(m.score[myTeam], m.score[1 - myTeam], m.target); },
    },

    chiem: {
      minuteSub: 'Ai dẫn điểm sẽ thắng',
      top: (m) => scoreTop(m, false) + `<div class="pts">${m.points.map((p) => `<div class="ppt" data-owner="none"><b>${POINT_LETTER[p.id]}</b></div>`).join('')}</div>`,
      cols: teamCols,
      build(m) {
        S.pOwner = m.points.map((p) => p.owner);
        T.pp = [...H.topBar.querySelectorAll('.ppt')];
        S.labels = m.points.map((p) => {
          const n = el('div', 'pl', `<b>${POINT_LETTER[p.id]}</b><small></small>`);
          fx.appendChild(n);
          return { root: n, s: n.lastChild };
        });
      },
      tick(m) {
        setScores(m.score[myTeam], m.score[1 - myTeam], m.target);
        m.points.forEach((p, i) => {
          const pip = T.pp[i], lab = S.labels[i];
          if (!pip) return;
          const mineSide = p.prog < 0 === (myTeam === 0);
          const owner = p.owner < 0 ? 'none' : p.owner === myTeam ? 'mine' : 'foe';
          if (pip._o !== owner) { pip._o = owner; pip.dataset.owner = owner; pop(pip, 1.35, 360); }
          setVar(pip, '--p', Math.round(Math.abs(p.prog) * 100) + '%');
          setVar(pip, '--rc', p.prog === 0 ? 'transparent' : TEAMS[mineSide ? myColor : 1 - myColor].css);
          const frac = Math.round(Math.abs(p.prog) * 100);
          setText(lab.s, frac >= 100 ? (owner === 'mine' ? 'Của ta' : 'Của địch') : frac > 0 ? frac + '%' : owner === 'none' ? 'Trống' : (owner === 'mine' ? 'Của ta' : 'Của địch'));
          lab.root.dataset.owner = owner;
          setVar(pip, '--own', owner === 'none' ? '#8d98a6' : TEAMS[owner === 'mine' ? myColor : 1 - myColor].css);
          setVar(lab.root, '--rc', owner === 'none' ? '#c3ccd6' : TEAMS[owner === 'mine' ? myColor : 1 - myColor].css);
          const pr = G.project(p.x, 0.4, p.z);
          flag(lab.root, 'off', !pr.visible);
          if (pr.visible) lab.root.style.transform = `translate3d(${pr.x.toFixed(1)}px,${pr.y.toFixed(1)}px,0) translate(-50%,-50%)`;
        });
      },
      mini(g, m, X, Z) {
        for (const p of m.points) {
          const col = p.owner < 0 ? '#c3ccd6' : TEAMS[p.owner === myTeam ? myColor : 1 - myColor].css, x = X(p.x), z = Z(p.z), r = Math.max(5, p.r * mmScale);
          g.fillStyle = col + '40'; g.strokeStyle = col; g.lineWidth = 1.6;
          g.beginPath(); g.arc(x, z, r, 0, 7); g.fill(); g.stroke();
          g.fillStyle = '#fff'; g.font = '800 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.strokeStyle = '#05080b'; g.lineWidth = 2.5; g.strokeText(POINT_LETTER[p.id], x, z); g.fillText(POINT_LETTER[p.id], x, z);
        }
      },
      event(e, m) {
        if (e.t !== 'capture' || !S.pOwner) return;
        const letter = POINT_LETTER[e.point], was = S.pOwner[e.point];
        S.pOwner[e.point] = e.team;
        if (e.team === myTeam) announce('Đã chiếm cứ điểm ' + letter, was >= 0 ? 'Giành lại từ tay địch' : '', 'mine');
        else announce(was === myTeam ? 'Mất cứ điểm ' + letter : 'Địch chiếm cứ điểm ' + letter, '', 'foe');
      },
    },

    tudo: {
      solo: true,
      minuteSub: 'Ai dẫn điểm sẽ thắng',
      top: (m) => scoreTop(m, true),
      cols(m) {
        H.colA.innerHTML = '<div class="rk"><div class="rk-h">Xếp hạng <small>hạ gục</small></div><div class="rk-list" data-r="rkList"></div></div>';
        const list = H.colA.querySelector('.rk-list');
        S.rows = {};
        for (const u of m.units) {
          const r = el('div', `rkr t${u.color}${u.id === G.me ? ' me' : ''}`, `<b class="rk-p">1</b><span class="rk-ic">${roleIcon(u)}</span><span class="rk-n">${esc(u.name)}</span><b class="rk-k">0</b>`);
          r.dataset.id = u.id;
          S.rows[u.id] = { root: r, p: r.firstChild, k: r.lastChild };
        }
        S.rkList = list; S.rkSig = '';
      },
      tick(m) {
        const sc = m.score;
        const mine = sc[G.me] || 0;
        let rival = null;
        for (const u of m.units) if (u.id !== G.me && (!rival || sc[u.id] > sc[rival.id])) rival = u;
        setScores(mine, rival ? sc[rival.id] : 0, m.target);
        setText(T.w1, rival ? (sc[rival.id] > mine ? 'Dẫn đầu: ' : 'Đối thủ: ') + rival.name : '');
        const order = m.units.slice().sort((a, b) => sc[b.id] - sc[a.id] || a.deaths - b.deaths || a.id - b.id);
        const myPlace = order.findIndex((u) => u.id === G.me);
        const shown = order.slice(0, 5);
        if (myPlace >= 5) shown.push(order[myPlace]);
        const sig = shown.map((u) => u.id).join() + '|' + (myPlace >= 5 ? 'g' : '');
        if (sig !== S.rkSig) {
          S.rkSig = sig;
          S.rkList.innerHTML = '';
          shown.forEach((u, i) => {
            if (i === 5) S.rkList.appendChild(el('div', 'rk-gap', '···'));
            S.rkList.appendChild(S.rows[u.id].root);
          });
        }
        order.forEach((u, i) => { const r = S.rows[u.id]; setText(r.p, String(i + 1)); setText(r.k, String(sc[u.id])); });
      },
    },

    trum: {
      solo: true,
      minuteSub: 'Hết giờ là Cự Thần thắng',
      top(m) {
        const b = bossOf(m), n = m.rule.lives || m.lives;
        return `<div class="boss-top">
          <div class="bt-h"><span class="bt-ic">${icon('boss')}</span><b data-r="bname">${esc(b ? b.name : 'Cự Thần')}</b><small>Trùm</small><span class="sc-clock bt-clock" data-r="clock">6:00</span></div>
          <div class="bh"><i class="bh-trail" data-r="trail"></i><i class="bh-fill" data-r="fill"></i><span class="bh-num" data-r="num"></span></div>
          <div class="lv"><small>Mạng còn lại</small><div class="lv-pips" data-r="lvp">${'<i class="lp on"></i>'.repeat(n)}</div><b data-r="lvn">${m.lives}</b></div>
        </div>`;
      },
      cols(m) { for (const u of m.units) if (u.team === myTeam) addCard(H.colA, u); },
      build(m) {
        T.lp = [...T.lvp.children];
        S.trail = 1; S.lives = m.lives; S.cast = null; S.ultCd = null;
      },
      tick(m, me, dt) {
        const b = bossOf(m);
        const f = b ? Math.max(0, b.hp) / b.maxHp : 0;
        S.trail = Math.max(f, S.trail - dt * 0.18);
        setW(T.fill, f); setW(T.trail, S.trail);
        setText(T.num, b ? `${fmtN(Math.ceil(Math.max(0, b.hp)))} / ${fmtN(b.maxHp)}` : '');
        T.lp.forEach((pip, i) => flag(pip, 'on', i < m.lives));
        setText(T.lvn, String(Math.max(0, m.lives)));
        flag(T.lvp, 'low', m.lives <= 3);
        if (m.lives < S.lives) { pop(T.lvn, 1.8, 420); if (m.lives === 3 && !m.over) announce('Chỉ còn 3 mạng', 'Cả đội giữ vững đội hình', 'warn'); }
        S.lives = m.lives;
        if (b && b.alive) {
          const c = b.cast;
          if (c && c !== S.cast && c.skill.do === 'nova' && c.left === (c.skill.repeat || 1)) warn('Cự Thần sắp dậm đất!');
          S.cast = c;
          // Barrage has no wind-up on the unit: its cooldown jumping up is the moment it was cast.
          if (S.ultCd !== null && b.cd.ult > S.ultCd + 0.5) warn('Cự Thần sắp triệu mưa pháo!');
          S.ultCd = b.cd.ult;
        }
      },
      mini(g, m, X, Z) {
        const b = bossOf(m);
        if (!b || !b.alive) return;
        const x = X(b.x), z = Z(b.z), k = 0.5 + 0.5 * Math.sin(uiT * 5);
        g.strokeStyle = `rgba(255,90,54,${(0.35 + 0.5 * k).toFixed(2)})`; g.lineWidth = 2;
        g.beginPath(); g.arc(x, z, 8 + 3 * k, 0, 7); g.stroke();
      },
      event(e, m) {
        if (e.t === 'death' && m.units[e.id] && m.units[e.id].def.boss) announce('Đã hạ Cự Thần', 'Chiến thắng thuộc về cả đội', 'mine');
      },
    },
  };

  function setupMatch(m) {
    curMatch = m;
    const me = m.units[G.me];
    myTeam = me ? me.team : 0;
    myColor = me ? me.color | 0 : 0;
    MH = MODE_HUD[m.mode] || MODE_HUD.tdm;
    S = { fb: false, streak: {}, oneMin: false, killedBy: '', miniAcc: 1, lowQ: -1, warnT: 0 };
    H.colA.innerHTML = ''; H.colB.innerHTML = ''; fx.innerHTML = '';
    for (const k in cards) delete cards[k];
    for (const k in nps) delete nps[k];
    floats.length = 0; freeFloats.length = 0; byKey.clear();
    H.feed.innerHTML = ''; feed.length = 0;
    hud.classList.toggle('solo', !!MH.solo);
    hud.dataset.mode = m.mode;
    H.topBar.innerHTML = MH.top(m);
    T = refs(H.topBar);
    H.mission.textContent = m.rule.mission.replace('{target}', m.target).replace('{lives}', m.rule.lives || m.lives);
    if (T.tgt) setText(T.tgt, String(m.target));
    MH.cols(m);
    for (const u of m.units) addPlate(u);
    if (MH.build) MH.build(m);
    if (me) {
      SLOT_DEFS.forEach((d, i) => {
        const s = slotEls[d.k];
        const sk = i >= 1 && i <= 3 ? me.def.skills[i - 1] : null;
        s.ic.innerHTML = icon(d.k === 'fire' ? 'weapon' : d.k === 'heal' ? 'medkit' : sk.icon);
        s.total = d.k === 'fire' ? me.def.weapon.cd : d.k === 'heal' ? RULES.healItem.cd : sk.cd;
        s.root.title = d.k === 'fire' ? me.def.weapon.name : d.k === 'heal' ? 'Bình máu' : sk.name;
        s.prev = 0;
      });
    }
    buildMini(m);
    hpb.classList.toggle('off', !me);
  }

  /* ---- minimap ---- */
  function buildMini(m) {
    const mp = m.map, W = 216, Hh = Math.round(216 * mp.d / mp.w);
    H.mmc.width = W; H.mmc.height = Hh;
    mmCtx = H.mmc.getContext('2d');
    mmScale = W / mp.w;
    const c = el('canvas'); c.width = W; c.height = Hh;
    const g = c.getContext('2d');
    const X = (x) => (x + mp.hw) * mmScale, Z = (z) => (z + mp.hd) * mmScale;
    g.fillStyle = '#16221c'; g.fillRect(0, 0, W, Hh);
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
    for (let x = 0; x <= mp.w; x += 6.5) { g.beginPath(); g.moveTo(X(x - mp.hw), 0); g.lineTo(X(x - mp.hw), Hh); g.stroke(); }
    for (let z = 0; z <= mp.d; z += 6.5) { g.beginPath(); g.moveTo(0, Z(z - mp.hd)); g.lineTo(W, Z(z - mp.hd)); g.stroke(); }
    g.fillStyle = 'rgba(70,150,80,.55)';
    for (const b of mp.bushes) { g.beginPath(); g.arc(X(b.x), Z(b.z), b.r * mmScale, 0, 7); g.fill(); }
    const HAZ = { lava: '#ff6a2a', ice: '#bfe9ff', vent: '#ff9f3d' };
    for (const h of mp.hazards) {
      const col = HAZ[h.kind] || '#fff';
      g.fillStyle = col + (h.kind === 'vent' ? '55' : '44'); g.strokeStyle = col; g.lineWidth = 1;
      g.beginPath(); g.arc(X(h.x), Z(h.z), h.r * mmScale, 0, 7); g.fill(); g.stroke();
    }
    for (let t = 0; t < 2 && (m.mode === 'tdm' || m.mode === 'chiem'); t++) {
      const [bx, bz] = mp.bases[t];
      g.fillStyle = TEAMS[t].css + '33'; g.strokeStyle = TEAMS[t].css; g.lineWidth = 1.5;
      g.beginPath(); g.arc(X(bx), Z(bz), RULES.baseRadius * mmScale, 0, 7); g.fill(); g.stroke();
    }
    for (const r of mp.rounds) {
      g.fillStyle = r.kind === 'tree' ? '#3c7a45' : r.kind === 'rock' ? '#7b838c' : '#b3bac2';
      g.beginPath(); g.arc(X(r.x), Z(r.z), Math.max(1.6, r.r * mmScale), 0, 7); g.fill();
    }
    g.fillStyle = '#9aa3ad';
    for (const w of mp.walls) g.fillRect(X(w.x0), Z(w.z0), Math.max(2, (w.x1 - w.x0) * mmScale), Math.max(2, (w.z1 - w.z0) * mmScale));
    mmStatic = c;
    H.mmn.textContent = mp.name;
    H.mm.style.aspectRatio = `${W} / ${Hh}`;
  }
  function drawMini(m, me) {
    const g = mmCtx, mp = m.map;
    g.drawImage(mmStatic, 0, 0);
    const X = (x) => (x + mp.hw) * mmScale, Z = (z) => (z + mp.hd) * mmScale;
    for (const c of m.crates) {
      const col = '#' + PICKUPS[c.type].color.toString(16).padStart(6, '0');
      const x = X(c.x), z = Z(c.z), r = c.fall > 0 ? 3 + 1.5 * Math.sin(uiT * 8) : 4;
      g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, z - r); g.lineTo(x + r, z); g.lineTo(x, z + r); g.lineTo(x - r, z); g.closePath(); g.fill(); g.stroke();
    }
    if (MH.mini) MH.mini(g, m, X, Z, me);
    for (const u of m.units) {
      if (!u.alive || u.id === G.me) continue;
      if (u.team !== myTeam && !u.def.boss && !visibleTo(m, u, myTeam)) continue;
      g.fillStyle = TEAMS[u.color].css; g.strokeStyle = '#05080b'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(X(u.x), Z(u.z), u.def.boss ? 6 : u.team === myTeam ? 3.8 : 3.4, 0, 7); g.fill(); g.stroke();
    }
    if (me && me.alive) {
      const x = X(me.x), z = Z(me.z), a = me.aim;
      g.save(); g.translate(x, z); g.rotate(a);
      g.fillStyle = '#fff'; g.strokeStyle = '#05080b'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(8, 0); g.lineTo(-4.5, 5); g.lineTo(-2, 0); g.lineTo(-4.5, -5); g.closePath(); g.stroke(); g.fill();
      g.restore();
    }
  }

  /* ---- kill feed ---- */
  const feed = [];
  function addFeed(killer, victim, assists) {
    const row = el('div', 'kf' + (killer && killer.id === G.me ? ' by-me' : victim.id === G.me ? ' on-me' : ''));
    const ass = assists && assists.length ? `<em>+${assists.length}</em>` : '';
    row.innerHTML = killer
      ? `<b class="t${killer.color}">${esc(killer.name)}</b><span class="kf-ic t${killer.color}">${roleIcon(killer)}</span><b class="t${victim.color}">${esc(victim.name)}</b>${ass}`
      : `<span class="kf-ic">${icon('skull')}</span><b class="t${victim.color}">${esc(victim.name)}</b>`;
    H.feed.appendChild(row);
    feed.push({ row, t0: uiT, out: false });
    while (feed.length > 6) { feed.shift().row.remove(); }
  }

  /* ---- announcements ---- */
  const annQ = [];
  let annCur = null;
  const annB = H.ann.firstChild, annS = H.ann.lastChild;
  function announce(text, sub, kind) {
    if (annQ.length > 3) annQ.shift();
    annQ.push({ text, sub: sub || '', kind: kind || '' });
  }
  function annStep() {
    if (annCur && uiT - annCur.t0 < annCur.dur) return;
    if (annCur) { H.ann.style.opacity = '0'; annCur = null; }
    const n = annQ.shift();
    if (!n) return;
    annCur = { t0: uiT, dur: 1.9 };
    annB.textContent = n.text; annS.textContent = n.sub;
    H.ann.className = 'ann ' + n.kind;
    if (H.ann.animate) H.ann.animate([
      { opacity: 0, transform: 'translate(-50%,0) scale(1.7)' }, { opacity: 1, transform: 'translate(-50%,0) scale(1)', offset: 0.14 },
      { opacity: 1, transform: 'translate(-50%,0) scale(1)', offset: 0.8 }, { opacity: 0, transform: 'translate(-50%,-14px) scale(.96)' },
    ], { duration: 1900, fill: 'forwards' });
    else H.ann.style.opacity = '1';
  }

  /* ---- floating numbers ---- */
  const floats = [], freeFloats = [], byKey = new Map();
  function addFloat(key, kind, val, x, z, text, life) {
    const now = uiT;
    const old = key && byKey.get(key);
    if (old && old.live && now - old.last < 0.25) {
      old.val += val; old.last = now; old.pop = 0;
      setText(old.el, '' + Math.round(old.val));
      return;
    }
    if (floats.length >= FLOAT_MAX) retire(floats[0]);
    const node = freeFloats.pop() || fx.appendChild(el('div'));
    node.className = 'fn ' + kind + (val >= 500 ? ' big' : '');
    node.style.display = '';
    node.textContent = text || (kind.startsWith('heal') ? '+' : '') + Math.round(val);
    node._v = node.textContent;
    const it = { el: node, x, y: kind === 'pick' ? 3.2 : 2.3, z, age: 0, life: life || (kind === 'other' ? 0.75 : 0.95), kind, key, val, last: now, pop: 0, jx: (Math.random() - 0.5) * 26, live: true };
    floats.push(it);
    if (key) byKey.set(key, it);
  }
  function retire(it) {
    it.live = false;
    it.el.style.display = 'none';
    const i = floats.indexOf(it);
    if (i >= 0) floats.splice(i, 1);
    if (it.key && byKey.get(it.key) === it) byKey.delete(it.key);
    freeFloats.push(it.el);
  }
  function stepFloats(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const it = floats[i];
      it.age += dt; it.pop += dt;
      if (it.age >= it.life) { retire(it); continue; }
      const p = G.project(it.x, it.y, it.z);
      if (!p.visible) { it.el.style.opacity = '0'; continue; }
      const t = it.age / it.life;
      const rise = (1 - (1 - t) * (1 - t)) * (it.kind === 'pick' ? 34 : 52);
      const sc = 1 + 0.7 * clamp01(1 - it.pop / 0.16);
      it.el.style.transform = `translate3d(${(p.x + it.jx).toFixed(1)}px,${(p.y - rise).toFixed(1)}px,0) translate(-50%,-50%) scale(${sc.toFixed(2)})`;
      it.el.style.opacity = t > 0.62 ? ((1 - t) / 0.38).toFixed(2) : '1';
    }
  }

  /* ---- events ---- */
  function event(e) {
    const m = G.match;
    if (!m || !e) return;
    if (m !== curMatch) setupMatch(m);
    if (MH.event) MH.event(e, m);
    const me = G.me;
    switch (e.t) {
      case 'hit': {
        const v = m.units[e.id];
        if (!v) break;
        const mine = e.by === me, taken = e.id === me;
        if (!mine && !taken && !visibleTo(m, v, myTeam)) break;
        const kind = taken ? 'taken' : mine ? 'dealt' : 'other';
        if (e.amt >= 1) addFloat(`${e.id}|${kind}`, kind, e.amt, e.x, e.z);
        if (e.absorbed >= 1) addFloat(`${e.id}|shield`, 'shield', e.absorbed, e.x, e.z);
        break;
      }
      case 'heal':
        if (e.amt >= 1) addFloat(`${e.id}|heal`, e.id === me ? 'heal' : 'heal sm', e.amt, e.x, e.z);
        break;
      case 'death': {
        const v = m.units[e.id], k = e.by >= 0 ? m.units[e.by] : null;
        if (!v) break;
        addFeed(k, v, e.assists);
        if (e.id === me) S.killedBy = k ? k.name : '';
        if (k) {
          if (!S.fb) { S.fb = true; announce('Chiến công đầu', k.id === me ? 'Bạn mở tỉ số' : k.name, k.team === myTeam ? 'mine' : 'foe'); }
          const st = S.streak[k.id];
          const n = st && m.time - st.t <= 8 ? st.n + 1 : 1;
          S.streak[k.id] = { n, t: m.time };
          if (n >= 2) announce(STREAK[Math.min(n, 5)], k.id === me ? 'Bạn' : k.name, k.team === myTeam ? 'mine' : 'foe');
        }
        break;
      }
      case 'respawn':
        if (e.id === me) S.killedBy = '';
        break;
      case 'pickup':
        if (e.id === me && PICKUPS[e.type]) addFloat('', 'pick', 0, e.x, e.z, '+ ' + PICKUPS[e.type].name, 1.5);
        break;
      case 'crateDrop':
        announce('Tiếp tế đang rơi', '', 'supply');
        break;
      default:
    }
  }

  /* ---- update ---- */
  function update(dt) {
    const m = G.match;
    if (!hudOn || !m) return;
    uiT += dt;
    if (m !== curMatch) setupMatch(m);
    const me = m.units[G.me];
    const al = G.alpha == null ? 1 : G.alpha;

    MH.tick(m, me, dt, al);
    const left = m.duration - m.time;
    setText(T.clock, mmss(left));
    flag(T.clock, 'warn', left <= 60); flag(T.clock, 'final', left <= 10);
    if (!S.oneMin && left <= 60 && m.duration > 75) { S.oneMin = true; announce('Còn 1 phút', MH.minuteSub, 'warn'); }
    flag(H.mission, 'show', m.time < 7);
    if (S.warnT > 0) S.warnT -= dt;
    flag(H.warn, 'on', S.warnT > 0);

    // portrait cards
    for (const u of m.units) {
      const c = cards[u.id];
      if (!c) continue;
      setScale(c.hp, u.alive ? u.hp / u.maxHp : 0);
      flag(c.root, 'dead', !u.alive);
      if (!u.alive) setText(c.dead, String(Math.max(1, Math.ceil(u.respawnT))));
      setText(c.kd, u.kills + ' / ' + u.deaths);
    }

    if (me) {
      // hp, shield, numbers
      setScale(H.hpBar, me.hp / me.maxHp);
      setText(H.hpNum, Math.ceil(Math.max(0, me.hp)) + ' / ' + me.maxHp + (me.shield > 0 ? '  +' + Math.ceil(me.shield) : ''));
      flag(hpb, 'has-shield', me.shield > 0);
      flag(hpb, 'low', me.hp / me.maxHp < 0.35);
      setScale(H.shBar, me.shield > 0 ? me.shield / Math.max(1, me.shieldMax) : 0);
      const frac = me.alive ? me.hp / me.maxHp : 1;
      const lowQ = frac < 0.35 ? Math.round((0.35 - frac) / 0.35 * 10) : 0;
      if (lowQ !== S.lowQ) { S.lowQ = lowQ; H.vig.style.setProperty('--v', (0.4 + 0.6 * lowQ / 10).toFixed(2)); flag(H.vig, 'on', lowQ > 0); }

      // skills
      for (const d of SLOT_DEFS) {
        const s = slotEls[d.k], rem = me.cd[d.k];
        const p = Math.round(clamp01(rem / s.total) * 100);
        setVar(s.root, '--p', p + '%');
        setText(s.t, d.k !== 'fire' && rem > 0.05 ? (rem >= 10 ? String(Math.ceil(rem)) : vn(rem, 1)) : '');
        if (s.prev > 0 && rem <= 0 && me.alive && s.root.animate) s.root.animate([{ filter: 'brightness(2.4)', transform: 'scale(1.18)' }, { filter: 'none', transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
        s.prev = rem;
        flag(s.root, 'ready', rem <= 0);
        flag(s.root, 'idle', d.k === 'heal' && me.hp >= me.maxHp);
      }
      flag(H.slots, 'off', !me.alive);

      // buffs
      BUFFS.forEach((bf, i) => {
        const t = bf[0] === 'shieldT' ? (me.shield > 0 ? me.shieldT || 0.001 : 0) : me[bf[0]];
        const be = buffEls[i], on = me.alive && t > 0;
        if (on !== be.on) { be.on = on; be.root.hidden = !on; }
        if (on) setText(be.t, bf[0] === 'shieldT' && me.shieldT <= 0 ? '' : String(Math.ceil(t)));
      });

      // respawn overlay
      const dead = !me.alive && !m.over;
      flag(H.rsp, 'on', dead);
      if (dead) {
        const n = Math.max(1, Math.ceil(me.respawnT));
        setText(H.rspN, String(n)); setText(H.rspS, String(n));
        setText(H.rspBy, S.killedBy ? 'Bị hạ gục bởi ' + S.killedBy : 'Bạn đã bị hạ gục');
      }
    }

    // minimap at 10 Hz
    S.miniAcc += dt;
    if (S.miniAcc >= 0.1) { S.miniAcc = 0; drawMini(m, me); }

    // nameplates
    for (const u of m.units) {
      const np = nps[u.id];
      if (!np) continue;
      let on = u.alive && visibleTo(m, u, myTeam);
      let p = null;
      if (on) {
        const x = u.px + (u.x - u.px) * al, z = u.pz + (u.z - u.pz) * al;
        p = G.project(x, NP_Y, z);
        on = p.visible;
      }
      flag(np.root, 'off', !on);
      if (!on) continue;
      np.root.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) translate(-50%,-100%)`;
      setScale(np.f, u.hp / u.maxHp);
      flag(np.shBox, 'on', u.shield > 0);
      if (u.shield > 0) setScale(np.sh, u.shield / Math.max(1, u.shieldMax));
      flag(np.root, 'ghost', u.stealthT > 0 || u.bush >= 0);
    }

    stepFloats(dt);

    for (let i = feed.length - 1; i >= 0; i--) {
      const f = feed[i], age = uiT - f.t0;
      if (age > 5 && !f.out) { f.out = true; f.row.classList.add('out'); }
      if (age > 5.5) { f.row.remove(); feed.splice(i, 1); }
    }
    annStep();
    if (G.input && G.input.updateTouch) G.input.updateTouch();
  }

  function showHUD() {
    hideMenu(); hideResult(); hidePause();
    hudOn = true;
    root.classList.add('in-hud');
    root.classList.toggle('is-touch', isTouch());
    hud.classList.add('on'); fx.classList.add('on');
    if (G.match) { curMatch = null; setupMatch(G.match); }
    annQ.length = 0; annCur = null; H.ann.style.opacity = '0';
    if (G.input && G.input.setTouchVisible) G.input.setTouchVisible(true);
  }
  function hideHUD() {
    hudOn = false;
    root.classList.remove('in-hud');
    hud.classList.remove('on'); fx.classList.remove('on');
    if (G.input && G.input.setTouchVisible) G.input.setTouchVisible(false);
  }

  /* ================= pause ================= */
  const pauseEl = el('div', 'screen pause');
  pauseEl.dataset.block = '';
  pauseEl.innerHTML = `<div class="box"><div class="hazard"></div><h2>Tạm dừng</h2>
    <button class="btn big" data-r="resume">Tiếp tục</button><button class="btn big danger" data-r="quit">Về sảnh</button>
    <p class="hint">Nhấn Esc để tiếp tục</p></div>`;
  const PA = refs(pauseEl);
  root.appendChild(pauseEl);
  function showPause() {
    if (!hudOn || paused) return;
    paused = true; pauseEl.classList.add('on');
    if (G.input && G.input.setTouchVisible) G.input.setTouchVisible(false);
    G.bus.emit('ui:pause', { paused: true });
  }
  function hidePause() {
    if (!paused) { pauseEl.classList.remove('on'); return; }
    paused = false; pauseEl.classList.remove('on');
    if (hudOn && G.input && G.input.setTouchVisible) G.input.setTouchVisible(true);
    G.bus.emit('ui:pause', { paused: false });
  }
  const togglePause = () => (paused ? hidePause() : showPause());
  PA.resume.onclick = hidePause;
  PA.quit.onclick = () => { hidePause(); G.bus.emit('ui:menu'); };
  H.pauseBtn.onclick = showPause;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && hudOn && G.match && !G.match.over) { e.preventDefault(); togglePause(); }
  });

  /* ================= menu ================= */
  const menu = el('div', 'screen menu');
  menu.dataset.block = '';
  menu.innerHTML = `
    <header class="mn-head">
      <div class="logo"><h1>Đấu Trường Thép</h1><span>Cơ giáp 5 đấu 5 · Thời gian thực</span></div>
      <div class="player">
        <div class="lvl"><small>Cấp</small><b data-r="lvl">1</b></div>
        <div class="pl-main">
          <input class="pl-name" data-r="name" maxlength="16" spellcheck="false" aria-label="Tên phi công">
          <div class="xpbar"><i data-r="xpFill"></i><span data-r="xpTxt">0 / 200 XP</span></div>
        </div>
        <div class="rank" data-r="rank" style="--rc:#8d98a6">
          <div class="rk-badge">${icon('trophy')}</div>
          <div class="rk-tx"><b data-r="rkName">Sắt</b><span><i data-r="rkTr">0</i> cúp</span><div class="rk-bar" title=""><i data-r="rkFill"></i></div><small data-r="rkNext"></small></div>
        </div>
        <div class="coins" data-r="coinBox">${icon('coin')}<b data-r="coins">0</b><small>xu</small></div>
      </div>
    </header>
    <div class="mn-body">
      <section class="panel roster"><h3>Chọn cơ giáp</h3><div class="cards" data-r="cards"></div></section>
      <section class="panel detail" data-r="detail"></section>
      <section class="panel setup">
        <div class="opts">
          <h3>Chế độ</h3><div class="modes" data-r="modes"></div><p class="mode-bl" data-r="modeBl"></p>
          <h3>Độ khó</h3><div class="seg" data-r="diff"></div>
          <h3>Đấu trường</h3><div class="maps" data-r="maps"></div>
        </div>
        <div class="acts">
          <button class="play" data-r="play"><span>Vào trận</span></button>
          <div class="row2"><button class="btn" data-r="bSet">${icon('gear')}Cài đặt</button><button class="btn" data-r="bHelp">${icon('help')}Cách chơi</button></div>
        </div>
      </section>
    </div>`;
  const M = refs(menu);
  root.appendChild(menu);

  const maxOf = (f) => Math.max(...MECH_ORDER.map((k) => f(MECHS[k])));
  const STAT = [
    { label: 'Giáp', f: (d) => d.hp, fmt: (v) => String(v) },
    { label: 'Tốc độ', f: (d) => d.speed, fmt: (v) => vn(v, 1) },
    { label: 'Sát thương', f: (d) => d.weapon.dmg / d.weapon.cd, fmt: (v) => Math.round(v) + '/s' },
    { label: 'Tầm bắn', f: (d) => d.weapon.range, fmt: (v) => vn(v, 1) + ' m' },
  ].map((s) => ({ ...s, max: maxOf(s.f) }));

  let sel = MECH_ORDER[0], diff = 'normal', mapKey = MAP_ORDER[0], modeKey = MODE_ORDER[0], menuInit = false, tab = 'info';

  function ownedMech(k) { const d = meta(); return !d || d.owned.includes(k); }

  function renderPlayer() {
    const d = meta();
    if (!d) return;
    M.name.value = d.name;
    M.lvl.textContent = d.level;
    const need = levelXp(d.level);
    M.xpFill.style.transform = `scaleX(${clamp01(d.xp / need)})`;
    M.xpTxt.textContent = `${d.xp} / ${need} XP`;
    M.coins.textContent = d.coins;
    const rk = rankNow(), cur = RANKS[rk.index];
    M.rank.style.setProperty('--rc', rk.color);
    M.rkName.textContent = rk.name;
    M.rkTr.textContent = rk.trophies;
    M.rkFill.style.transform = `scaleX(${rk.next ? clamp01((rk.trophies - cur.min) / (rk.next.min - cur.min)) : 1})`;
    M.rkNext.textContent = rk.next ? `${rk.next.min - rk.trophies} cúp nữa lên ${rk.next.name}` : 'Hạng cao nhất';
  }
  function renderCards() {
    M.cards.innerHTML = '';
    for (const k of MECH_ORDER) {
      const d = MECHS[k], own = ownedMech(k);
      const c = el('button', 'mc' + (k === sel ? ' sel' : '') + (own ? '' : ' locked'));
      c.dataset.mech = k;
      const lv = levelOf(k);
      c.innerHTML = `<img alt="" src="${portrait(k, 0, own ? paintOf(k) : undefined)}"><div class="mc-t"><span class="mc-role">${roleIcon(k)}${d.role}</span><div class="mc-nm"><b>${d.name}</b>${own ? (lv ? `<span class="mc-lv">+${lv}</span>` : '') : `<span class="mc-lock">${icon('lock')}<b>${d.price}</b></span>`}</div></div>`;
      c.onclick = () => { sel = k; if (!ownedMech(k)) tab = 'info'; renderCards(); renderDetail(); renderPlay(); };
      M.cards.appendChild(c);
    }
  }

  const shake = (n) => { if (n && n.animate) n.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 300 }); };
  const noCoins = (n) => { shake(n); shake(M.coinBox); toast('Chưa đủ xu'); };
  const refreshAll = () => { renderPlayer(); renderCards(); renderDetail(); renderPlay(); };

  function buyMech(k) {
    const d = MECHS[k];
    if (!G.meta) return;
    if (meta().coins < d.price) { noCoins(M.detail.querySelector('[data-r="buy"]') || M.play); return; }
    ask(`Mở khóa ${d.name}?`, `Trả <b>${d.price}</b> xu để mang ${d.name} vào trận.`, 'Mở khóa', () => {
      if (G.meta.buy(k)) { sel = k; refreshAll(); toast('Đã mở khóa ' + d.name); } else noCoins();
    });
  }

  const pct = (v) => Math.round((v - 1) * 100);
  function renderGarage(d, own) {
    const lv = levelOf(sel), maxed = lv >= UPGRADE.max, m = upgradeMods(lv), nx = upgradeMods(Math.min(UPGRADE.max, lv + 1));
    const cost = maxed ? 0 : UPGRADE.cost(lv), coins = meta() ? meta().coins : 0;
    const eq = paintOf(sel), op = (meta() && meta().ownedPaints) || ['goc'];
    const gain = (label, key, base) => `<div class="gn"><span>${label}</span><b>${Math.round(base * m[key])}</b><em>+${pct(m[key])}%</em>${maxed ? '' : `<i>${icon('up')}+${pct(nx[key])}%</i>`}</div>`;
    return `<div class="garage">
      <div class="up" data-level="${lv}">
        <div class="up-h"><h4>Nâng cấp</h4><div class="pips" aria-label="Cấp ${lv} trên ${UPGRADE.max}">${Array.from({ length: UPGRADE.max }, (_, i) => `<span class="pip${i < lv ? ' on' : ''}"></span>`).join('')}</div><b class="up-lv">Cấp ${lv} / ${UPGRADE.max}</b></div>
        <div class="gains">${gain('Máu', 'hp', d.hp)}${gain('Sát thương', 'dmg', d.weapon.dmg)}</div>
        <p class="up-note">Mỗi cấp tăng ${Math.round(UPGRADE.hp * 100)}% máu và ${Math.round(UPGRADE.dmg * 100)}% sát thương.</p>
        <button class="btn upbtn${!maxed && coins < cost ? ' poor' : ''}" data-r="up"${maxed ? ' disabled' : ''}>${maxed ? 'Đã tối đa' : `${icon('up')}Nâng cấp · ${icon('coin')}<b>${cost}</b> xu`}</button>
      </div>
      <div class="paints">
        <h4>Sơn viền</h4>
        <div class="pgrid">${Object.keys(PAINTS).map((k) => {
          const p = PAINTS[k], have = op.includes(k), on = eq === k;
          const bg = p.color == null ? '' : ` style="background:#${p.color.toString(16).padStart(6, '0')}"`;
          return `<button class="pt${have ? ' own' : ''}${on ? ' eq' : ''}" data-paint="${k}"><i class="${p.color == null ? 'orig' : ''}"${bg}></i><b>${p.name}</b><small>${on ? 'Đang dùng' : have ? 'Trang bị' : `${p.price} xu`}</small></button>`;
        }).join('')}</div>
      </div>
    </div>`;
  }

  function renderDetail() {
    const d = MECHS[sel], own = ownedMech(sel), w = d.weapon;
    if (!own) tab = 'info';
    const wdesc = `Sát thương ${w.dmg}${w.splash ? ' (nổ lan)' : ''}, tầm ${vn(w.range, 1)} m, ${vn(1 / w.cd, 1)} phát mỗi giây.`;
    const rows = [
      { ic: 'weapon', key: 'Chuột', name: w.name, desc: wdesc, cd: '' },
      ...d.skills.map((s, i) => ({ ic: s.icon, key: ['Q', 'E', 'SPACE'][i], name: s.name, desc: s.desc, cd: vn(s.cd, 0) + ' giây', ult: i === 2 })),
    ];
    const lv = levelOf(sel);
    const body = tab === 'garage' && own ? renderGarage(d, own) : `
      <div class="stats">${STAT.map((s) => { const v = s.f(d); return `<div class="st"><span>${s.label}</span><div class="bar"><i style="width:${Math.max(10, v / s.max * 100).toFixed(0)}%"></i></div><b>${s.fmt(v)}</b></div>`; }).join('')}</div>
      <div class="kit">${rows.map((r) => `<div class="sk${r.ult ? ' ult' : ''}"><div class="sk-ic">${icon(r.ic)}<kbd>${r.key}</kbd></div><div class="sk-tx"><b>${r.name}${r.cd ? `<small>${r.cd}</small>` : ''}</b><p>${r.desc}</p></div></div>`).join('')}</div>`;
    M.detail.innerHTML = `
      <div class="md-head"><img alt="" src="${portrait(sel, 0, own ? paintOf(sel) : undefined)}"><div><span class="role">${roleIcon(sel)}${d.role}</span><h2>${d.name}${own && lv ? `<em class="md-lv">+${lv}</em>` : ''}</h2><p>${d.blurb}</p></div></div>
      ${own ? `<div class="tabs"><button data-tab="info" class="${tab === 'info' ? 'on' : ''}">${icon('info')}Chi tiết</button><button data-tab="garage" class="${tab === 'garage' ? 'on' : ''}">${icon('wrench')}Gara</button></div>`
        : `<button class="btn buy" data-r="buy">${icon('lock')}Mở khóa · <b>${d.price}</b> xu</button>`}
      ${body}`;
    M.detail.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; renderDetail(); }; });
    const buy = M.detail.querySelector('[data-r="buy"]');
    if (buy) buy.onclick = () => buyMech(sel);
    const up = M.detail.querySelector('[data-r="up"]');
    if (up) up.onclick = () => {
      if (G.meta && G.meta.upgrade(sel)) { refreshAll(); toast(`${d.name} lên cấp ${levelOf(sel)}`); pop(M.detail.querySelector('.up-lv'), 1.5, 400); }
      else noCoins(up);
    };
    M.detail.querySelectorAll('[data-paint]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.paint, p = PAINTS[k];
        if (!G.meta) return;
        if (meta().ownedPaints.includes(k)) { G.meta.setPaint(sel, k); refreshAll(); return; }
        if (meta().coins < p.price) { noCoins(b); return; }
        ask(`Mua sơn ${p.name}?`, `Trả <b>${p.price}</b> xu, sơn sẽ được trang bị cho ${d.name}.`, 'Mua sơn', () => {
          if (G.meta.buyPaint(k) && G.meta.setPaint(sel, k)) { refreshAll(); toast('Đã trang bị ' + p.name); } else noCoins();
        });
      };
    });
  }
  function renderPlay() {
    const own = ownedMech(sel);
    M.play.disabled = false;
    M.play.firstChild.textContent = own ? 'Vào trận' : 'Mua ' + MECHS[sel].name;
    M.play.classList.toggle('buying', !own);
  }
  const MODE_ICON = { tdm: 'swords', chiem: 'flag', tudo: 'sniper', trum: 'boss' };
  const THEME_ICON = { jungle: 'leaf', desert: 'dune', ice: 'flake', lava: 'flame' };
  const HAZARD_TEXT = { vent: 'Họng lửa phụt', ice: 'Băng trơn trượt', lava: 'Hồ dung nham' };
  // The hazard line is derived from the map's own hazard list so a new map cannot drift from its label.
  const hazardOf = (mp) => { const kind = ((mp.hazards || [])[0] || [])[0]; return kind ? { kind, text: HAZARD_TEXT[kind] || kind } : { kind: 'none', text: 'Không có bẫy' }; };
  function renderSetup() {
    M.diff.innerHTML = '';
    for (const k of Object.keys(DIFFICULTY)) {
      const b = el('button', k === diff ? 'on' : '', DIFFICULTY[k].name);
      b.onclick = () => { diff = k; renderSetup(); };
      M.diff.appendChild(b);
    }
    M.modes.innerHTML = '';
    for (const k of MODE_ORDER) {
      const b = el('button', 'mode' + (k === modeKey ? ' on' : ''), `${icon(MODE_ICON[k])}<span>${MODES[k].name}</span>`);
      b.dataset.mode = k;
      b.onclick = () => { modeKey = k; renderSetup(); };
      M.modes.appendChild(b);
    }
    M.modeBl.textContent = MODES[modeKey].blurb;
    M.maps.innerHTML = '';
    for (const k of MAP_ORDER) {
      const mp = MAPS[k], hz = hazardOf(mp);
      const b = el('button', 'map' + (k === mapKey ? ' on' : ''), `<span class="sw ${mp.theme}">${icon(THEME_ICON[mp.theme] || 'generic')}</span><span class="mp-t"><b>${mp.name}</b><em class="hz ${hz.kind}">${hz.text}</em><small>${mp.blurb}</small></span>`);
      b.dataset.map = k; b.dataset.theme = mp.theme;
      b.onclick = () => { mapKey = k; renderSetup(); };
      M.maps.appendChild(b);
    }
  }
  const makeChoice = (mech, df, map, mode) => ({ mech, diff: df, map, mode, mods: upgradeMods(levelOf(mech)), paint: paintOf(mech) });
  M.play.onclick = () => {
    if (!ownedMech(sel)) { buyMech(sel); return; }
    choice = makeChoice(sel, diff, mapKey, modeKey);
    const d = meta();
    if (d) { d.mech = sel; d.diff = diff; d.map = mapKey; d.mode = modeKey; G.meta.save(); }
    G.bus.emit('ui:play', choice);
  };
  M.name.addEventListener('change', () => {
    const d = meta();
    if (!d) return;
    d.name = M.name.value.trim().slice(0, 16) || 'Phi công';
    M.name.value = d.name; G.meta.save();
  });
  M.name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') M.name.blur(); });

  function applySettings() {
    const d = meta();
    if (!d) return;
    // quality is not re-emitted here: main reloads the page when it differs from the running quality.
    if (G.audio) {
      if (G.audio.setVolume) G.audio.setVolume(d.settings.volume);
      if (G.audio.setMusic) G.audio.setMusic(d.settings.music);
    }
  }

  function showMenu() {
    hideHUD(); hideResult(); hidePause();
    const d = meta();
    if (d) { sel = ownedMech(d.mech) ? d.mech : sel; diff = DIFFICULTY[d.diff] ? d.diff : diff; mapKey = MAPS[d.map] ? d.map : mapKey; modeKey = MODES[d.mode] ? d.mode : modeKey; }
    if (!menuInit) { menuInit = true; applySettings(); }
    renderPlayer(); renderCards(); renderDetail(); renderSetup(); renderPlay();
    menu.classList.add('on');
  }
  function hideMenu() { menu.classList.remove('on'); closeModals(); }

  /* ---- settings + help modals ---- */
  const toastEl = el('div', 'toast'); root.appendChild(toastEl);
  let toastT = 0;
  function toast(text) {
    toastEl.textContent = text; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 1800);
  }

  const confirmEl = el('div', 'modal');
  confirmEl.dataset.block = '';
  confirmEl.innerHTML = `<div class="modal-box ask"><div class="hazard"></div><h2 data-r="t"></h2><p class="lead" data-r="p"></p>
    <div class="ask-btns"><button class="btn big" data-r="no">Hủy</button><button class="btn big primary" data-r="yes">Đồng ý</button></div></div>`;
  const CF = refs(confirmEl);
  let confirmFn = null;
  function ask(title, html, yes, fn) {
    CF.t.textContent = title; CF.p.innerHTML = html; CF.yes.textContent = yes; confirmFn = fn;
    confirmEl.classList.add('on');
  }
  CF.no.onclick = () => { confirmFn = null; confirmEl.classList.remove('on'); };
  CF.yes.onclick = () => { const f = confirmFn; confirmFn = null; confirmEl.classList.remove('on'); if (f) f(); };

  const settings = el('div', 'modal');
  settings.dataset.block = '';
  settings.innerHTML = `<div class="modal-box"><div class="hazard"></div><h2>Cài đặt</h2>
    <div class="fld"><span>Chất lượng đồ họa</span><div class="seg" data-r="q"></div></div>
    <div class="fld"><span>Âm lượng chung <b data-r="vTxt"></b></span><input type="range" min="0" max="100" data-r="vol"></div>
    <div class="fld"><span>Nhạc nền <b data-r="mTxt"></b></span><input type="range" min="0" max="100" data-r="mus"></div>
    <button class="btn big" data-r="close">Xong</button></div>`;
  const ST = refs(settings);
  const QL = [['low', 'Thấp'], ['medium', 'Vừa'], ['high', 'Cao']];
  function renderSettings() {
    const d = meta(); if (!d) return;
    ST.q.innerHTML = '';
    for (const [k, n] of QL) {
      const b = el('button', d.settings.quality === k ? 'on' : '', n);
      b.onclick = () => { d.settings.quality = k; G.meta.save(); G.bus.emit('quality:set', k); renderSettings(); };
      ST.q.appendChild(b);
    }
    ST.vol.value = Math.round(d.settings.volume * 100); ST.mus.value = Math.round(d.settings.music * 100);
    ST.vTxt.textContent = ST.vol.value + '%'; ST.mTxt.textContent = ST.mus.value + '%';
  }
  ST.vol.oninput = () => {
    const d = meta(), v = ST.vol.value / 100; d.settings.volume = v; ST.vTxt.textContent = ST.vol.value + '%';
    if (G.audio && G.audio.setVolume) G.audio.setVolume(v);
  };
  ST.mus.oninput = () => {
    const d = meta(), v = ST.mus.value / 100; d.settings.music = v; ST.mTxt.textContent = ST.mus.value + '%';
    if (G.audio && G.audio.setMusic) G.audio.setMusic(v);
  };
  ST.vol.onchange = ST.mus.onchange = () => G.meta.save();
  ST.close.onclick = () => settings.classList.remove('on');
  M.bSet.onclick = () => { renderSettings(); settings.classList.add('on'); };

  const help = el('div', 'modal');
  help.dataset.block = '';
  const kc = (t) => `<kbd>${t}</kbd>`;
  help.innerHTML = `<div class="modal-box wide"><div class="hazard"></div><h2>Cách chơi</h2>
    <p class="lead">Hai đội năm cơ giáp. Đội nào hạ gục đủ điểm mục tiêu trước, hoặc dẫn điểm khi hết giờ, sẽ thắng.</p>
    <div class="help-cols">
      <div><h4>Máy tính</h4><ul>
        <li><span>${kc('W')}${kc('A')}${kc('S')}${kc('D')}</span>Di chuyển</li>
        <li><span>${kc('Chuột')}</span>Ngắm theo con trỏ</li>
        <li><span>${kc('Chuột trái')}</span>Bắn</li>
        <li><span>${kc('Q')}${kc('E')}${kc('SPACE')}</span>Chiêu 1, chiêu 2, tuyệt kỹ</li>
        <li><span>${kc('F')}</span>Dùng bình máu</li>
        <li><span>${kc('Esc')}</span>Tạm dừng</li></ul></div>
      <div><h4>Cảm ứng</h4><ul>
        <li><span>Cần trái</span>Chạm nửa trái màn hình để đi</li>
        <li><span>Cần phải</span>Kéo để ngắm, kéo xa là tự bắn</li>
        <li><span>Nút tròn</span>Chiêu 1, chiêu 2, tuyệt kỹ, bình máu</li></ul>
        <h4>Mẹo</h4><ul class="tips"><li>Núp trong bụi cỏ để tàng hình trước địch.</li><li>Nhặt hòm tiếp tế rơi giữa sân để tăng sức mạnh.</li></ul></div>
    </div><button class="btn big" data-r="close">Đã hiểu</button></div>`;
  const HP = refs(help);
  HP.close.onclick = () => help.classList.remove('on');
  M.bHelp.onclick = () => help.classList.add('on');
  function closeModals() { settings.classList.remove('on'); help.classList.remove('on'); confirmEl.classList.remove('on'); confirmFn = null; }
  root.append(settings, help, confirmEl);

  /* ================= result ================= */
  const result = el('div', 'screen result');
  result.dataset.block = '';
  root.appendChild(result);
  let resultTimers = [];
  function hideResult() { resultTimers.forEach(clearTimeout); resultTimers = []; result.classList.remove('on'); }
  const later = (fn, ms) => resultTimers.push(setTimeout(fn, ms));
  function tween(node, to, ms, fmt, from = 0) {
    const t0 = performance.now();
    const f = (now) => {
      const k = clamp01((now - t0) / ms);
      node.textContent = fmt(Math.round(from + (to - from) * (1 - (1 - k) * (1 - k))));
      if (k < 1 && result.classList.contains('on')) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }

  function trophyHtml(rw) {
    if (!rw.rankBefore || !rw.rankAfter) return '';
    const d = rw.trophiesAfter - rw.trophiesBefore, a = rw.rankAfter, up = a.index > rw.rankBefore.index, down = a.index < rw.rankBefore.index;
    return `<div class="rw-tr" data-r="tr" style="--rc:${rw.rankBefore.color}">
      <div class="rk-badge" data-r="trBadge">${icon('trophy')}</div>
      <div class="rk-tx"><b data-r="trName">${rw.rankBefore.name}</b><span><i data-r="trN">${rw.trophiesBefore}</i> cúp <em class="tr-d ${d > 0 ? 'plus' : d < 0 ? 'minus' : ''}" data-r="trD">${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}</em></span>
        <div class="rk-bar"><i data-r="trFill"></i></div></div>
      <em class="rankup ${down ? 'down' : ''}" data-r="trUp">${up ? 'Lên hạng! ' + a.name : down ? 'Xuống hạng · ' + a.name : ''}</em></div>`;
  }

  function rankFill(r, t) {
    const cur = RANKS[r.index], nx = RANKS[r.index + 1];
    return nx ? clamp01((t - cur.min) / (nx.min - cur.min)) : 1;
  }
  function trophyAnim(R, rw) {
    const fill = (f, anim) => { R.trFill.style.transition = anim ? 'transform .9s cubic-bezier(.3,.7,.2,1)' : 'none'; R.trFill.style.transform = `scaleX(${f})`; };
    const same = rw.rankAfter.index === rw.rankBefore.index;
    fill(rankFill(rw.rankBefore, rw.trophiesBefore), false);
    void R.trFill.offsetWidth;
    tween(R.trN, rw.trophiesAfter, 1000, (v) => String(v), rw.trophiesBefore);
    if (same) { fill(rankFill(rw.rankAfter, rw.trophiesAfter), true); return; }
    fill(rw.rankAfter.index > rw.rankBefore.index ? 1 : 0, true);
    later(() => {
      R.tr.style.setProperty('--rc', rw.rankAfter.color);
      R.trName.textContent = rw.rankAfter.name;
      R.trUp.classList.add('on'); R.tr.classList.add(rw.rankAfter.index > rw.rankBefore.index ? 'ranked-up' : 'ranked-down');
      pop(R.trBadge, 2.2, 600);
      fill(rankFill(rw.rankAfter, rw.trophiesAfter), false);
    }, 950);
  }

  // Result per mode: returns the banner, the score strip and the table block. Teams use the K/D/A table; tudo one ranking; trum damage on the boss.
  const teamRow = (r, summary, cols) => `<div class="tb-r${r.id === G.me ? ' me' : ''}"><span class="tb-ic">${roleIcon(r.mech)}</span>
      <span class="tb-n"><b>${esc(r.name)}${r.id === summary.mvp ? '<em class="mvp">MVP</em>' : ''}</b><small>${(MECHS[r.mech] || BOSSES[r.mech]).name}</small></span>${cols}</div>`;
  const teamTable = (summary, team, name) => {
    const rows = summary.rows.filter((r) => r.team === team).sort((a, b) => b.rating - a.rating);
    return `<div class="tb t${team}"><div class="tb-h"><span></span><span>${name}</span><span>K / D / A</span><span>Sát thương</span><span>Hồi máu</span></div>
      ${rows.map((r) => teamRow(r, summary, `<span class="kda"><b>${r.kills}</b> / ${r.deaths} / ${r.assists}</span><span>${r.dmg}</span><span>${r.healed}</span>`)).join('')}</div>`;
  };
  const RESULT = {
    teams(summary, x) {
      const mt = x.mt, outcome = summary.winner === -1 ? 'draw' : summary.winner === mt ? 'win' : 'lose';
      const names = (t) => (TEAMS[t].name === 'Lam' ? 'Đội Lam' : 'Đội Hỏa');
      return {
        outcome, title: { win: 'Thắng', lose: 'Thua', draw: 'Hòa' }[outcome],
        sub: { win: 'Đội của bạn giành chiến thắng', lose: 'Đội bạn đã bại trận', draw: 'Hai đội ngang tài ngang sức' }[outcome],
        score: `<b class="t${mt}">${summary.score[mt]}</b><span>:</span><b class="t${1 - mt}">${summary.score[1 - mt]}</b><small>${mmss(summary.time)}</small>`,
        body: `<div class="rs-tables">${teamTable(summary, mt, names(mt))}${teamTable(summary, 1 - mt, names(1 - mt))}</div>`,
        base: { win: 'Chiến thắng', draw: 'Hòa', lose: 'Tham chiến' }[outcome],
      };
    },
    tudo(summary, x) {
      const n = summary.rows.length, place = placeOf(summary, G.me);
      const outcome = place === 1 ? 'win' : place <= 3 ? 'draw' : 'lose';
      const sc = (r) => (Array.isArray(summary.score) && summary.score.length >= n ? summary.score[r.id] : r.kills);
      const order = summary.rows.slice().sort((a, b) => placeOf(summary, a.id) - placeOf(summary, b.id));
      const me = x.me || {};
      return {
        outcome, title: `Hạng ${place}/${n}`,
        sub: place === 1 ? 'Bạn là cỗ máy cuối cùng đứng vững' : place <= 3 ? 'Bạn đã lên bục vinh danh' : 'Chưa lọt vào top 3',
        score: `<b class="t0">${sc(me)}</b><small>hạ gục · ${mmss(summary.time)}</small>`,
        body: `<div class="rs-tables one"><div class="tb t1 ffa"><div class="tb-h"><span>#</span><span>Phi công</span><span>Hạ gục</span><span>Sát thương</span><span>Hồi máu</span></div>
          ${order.map((r, i) => `<div class="tb-r${r.id === G.me ? ' me' : ''}"><span class="tb-ic"><b class="plc${i < 3 ? ' top' : ''}">${i + 1}</b></span>
            <span class="tb-n"><b>${esc(r.name)}${r.id === summary.mvp ? '<em class="mvp">MVP</em>' : ''}${r.id === G.me ? '<em class="you">Bạn</em>' : ''}</b><small>${MECHS[r.mech].name}</small></span>
            <span class="kda"><b>${sc(r)}</b> <small>/ ${r.deaths}</small></span><span>${r.dmg}</span><span>${r.healed}</span></div>`).join('')}</div></div>`,
        base: `Hạng ${place}`,
      };
    },
    trum(summary, x) {
      const win = summary.winner === x.mt, m = G.match, lives = m && m.mode === 'trum' ? m.lives : null;
      const team = summary.rows.filter((r) => r.team === x.mt).sort((a, b) => b.dmg - a.dmg);
      const total = Math.max(1, team.reduce((a, r) => a + r.dmg, 0));
      return {
        outcome: win ? 'win' : 'lose', title: win ? 'Đã hạ Cự Thần' : 'Cự Thần thắng',
        sub: win ? 'Cả đội hợp sức đánh gục trùm' : 'Đội bạn đã hết mạng hoặc hết giờ',
        score: `${lives === null ? '' : `<b class="t0">${Math.max(0, lives)}</b><small>mạng còn lại</small>`}<small>${mmss(summary.time)}</small>`,
        body: `<div class="rs-tables one"><div class="tb t0 boss"><div class="tb-h"><span></span><span>Đội Lam</span><span>Gục</span><span>Sát thương lên Cự Thần</span><span>Hồi máu</span></div>
          ${team.map((r) => `<div class="tb-r${r.id === G.me ? ' me' : ''}" style="--sh:${Math.round(r.dmg / total * 100)}%"><span class="tb-ic">${roleIcon(r.mech)}</span>
            <span class="tb-n"><b>${esc(r.name)}${r.id === summary.mvp ? '<em class="mvp">MVP</em>' : ''}</b><small>${MECHS[r.mech].name}</small></span>
            <span class="kda"><b>${r.deaths}</b></span><span class="bd"><b>${fmtN(r.dmg)}</b> <small>${Math.round(r.dmg / total * 100)}%</small></span><span>${r.healed}</span></div>`).join('')}</div></div>`,
        base: win ? 'Hạ Cự Thần' : 'Tham chiến',
      };
    },
  };
  const RESULT_OF = { tdm: 'teams', chiem: 'teams', tudo: 'tudo', trum: 'trum' };

  function showResult(summary, rewards) {
    hideHUD(); hideMenu(); hidePause();
    const mode = MODES[summary.mode] ? summary.mode : (G.match && MODES[G.match.mode] ? G.match.mode : 'tdm');
    const meRow = summary.rows.find((r) => r.id === G.me);
    const mt = meRow ? meRow.team : myTeam;
    const view = RESULT[RESULT_OF[mode]](summary, { me: meRow, mt });
    const outcome = view.outcome;
    const rw = rewards;
    const parts = rw ? [
      [view.base, rw.parts.base], ['Hạ gục', rw.parts.kills], ['Hỗ trợ', rw.parts.assists], ['Sát thương lên trùm', rw.parts.boss || 0], ['MVP', rw.parts.mvp],
    ].filter((p) => p[1] > 0) : [];
    result.className = 'screen result on mode-' + mode;
    result.innerHTML = `
      <div class="rs-banner ${outcome}"><div class="hazard"></div><h1>${view.title}</h1><p>${view.sub}</p></div>
      <div class="rs-score">${view.score}</div>
      ${view.body}
      <div class="rs-foot">
        ${rw ? `<div class="rw">
          <div class="rw-coin">${icon('coin')}<b data-r="rc">+0</b><small>xu</small></div>
          <div class="rw-xp"><div class="rw-top"><span>Cấp <b data-r="rl">${rw.levelBefore}</b></span><span data-r="rx">+0 XP</span></div><div class="xpbar"><i data-r="rf"></i></div><em class="lvup" data-r="up">Lên cấp!</em></div>
          ${rw.trophy ? trophyHtml(rw) : ''}
          <div class="rw-parts">${parts.map((p) => `<span>${p[0]} <b>+${p[1]}</b></span>`).join('')}</div></div>` : '<div></div>'}
        <div class="rs-btns"><button class="btn big primary" data-r="again">Đấu tiếp</button><button class="btn big" data-r="lobby">Về sảnh</button></div>
      </div>`;
    const R = refs(result);
    R.again.onclick = () => { const d = meta() || {}; const mech = choice ? choice.mech : (d.mech || sel); choice = makeChoice(mech, choice ? choice.diff : (d.diff || diff), choice ? choice.map : (d.map || mapKey), choice ? choice.mode : (d.mode || modeKey)); G.bus.emit('ui:play', choice); };
    R.lobby.onclick = () => G.bus.emit('ui:menu');
    if (rw) {
      const fill = (f, anim) => { R.rf.style.transition = anim ? 'transform .9s cubic-bezier(.3,.7,.2,1)' : 'none'; R.rf.style.transform = `scaleX(${clamp01(f)})`; };
      fill(rw.xpBefore / levelXp(rw.levelBefore), false);
      later(() => {
        tween(R.rc, rw.coins, 1100, (v) => '+' + v); tween(R.rx, rw.xp, 1100, (v) => '+' + v + ' XP');
        if (rw.levelAfter > rw.levelBefore) {
          fill(1, true);
          later(() => {
            R.up.classList.add('on'); R.rl.textContent = rw.levelAfter; pop(R.rl, 2, 500);
            fill(0, false); void R.rf.offsetWidth; fill(rw.xpAfter / levelXp(rw.levelAfter), true);
          }, 950);
        } else fill(rw.xpAfter / levelXp(rw.levelAfter), true);
        if (R.tr) trophyAnim(R, rw);
      }, 700);
    }
  }

  /* ================= rotate hint ================= */
  const rot = el('div', 'rotate', `<svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="8" width="24" height="42" rx="4"/><path d="M28 44h8"/><path d="M50 22c6 3 8 9 5 15M55 37l-1-6M55 37l-6-1"/></svg><b>Xoay ngang máy</b><span>Đấu Trường Thép chơi ở chế độ màn hình ngang</span>`);
  root.appendChild(rot);

  return {
    showMenu, hideMenu, showHUD, hideHUD, update, event, showResult,
    showPause, hidePause, togglePause, announce, toast,
    get paused() { return paused; },
  };
}
