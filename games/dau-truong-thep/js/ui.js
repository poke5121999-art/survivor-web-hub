// HUD, menus, result screen. Builds its own DOM under #ui; reads G.match / G.me, never writes to the match.
import { MECHS, MECH_ORDER, DIFFICULTY, TEAMS, PICKUPS, RULES, levelXp, UPGRADE, upgradeMods, PAINTS, RANKS, BOSSES, MODES, MODE_ORDER } from './data.js';
import { rankOf, placeOf } from './meta.js';
import * as MAPMOD from './maps.js';
const { MAPS, MAP_ORDER, THEMES, THEME_ORDER } = MAPMOD;
import { visibleTo, towerOpen } from './sim.js';
import * as K from './keys.js';

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
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.500 3 3.500 15 0 18M12 3c-3.500 3-3.500 15 0 18"/>',
  copy: `<rect x="8.500" y="8.500" width="11.500" height="11.500" rx="2" ${SOFT}/><path d="M15.500 8.500V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.500a2 2 0 002 2h2.500"/>`,
  check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
  exit: '<path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M15 8l4 4-4 4M19 12H9"/>',
  swap: '<path d="M4 8h14M14 4.500L18 8l-4 3.500M20 16H6M10 12.500L6 16l4 3.500"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  tower: `<path d="M7 21V9L5.500 7V4h3v1.500h1.500V4h4v1.500h1.500V4h3v3L17 9v12z" ${SOFT}/><path d="M10.500 21v-4h3v4M10.500 12.500h3"/>`,
  city: '<path d="M4 21V10h5v11M9 21V4h6v17M15 21v-7h5v7M3 21h18"/><path d="M11 8h2M11 12h2M11 16h2"/>',
  swamp: '<path d="M3 19c2-2 3-2 5 0s3 2 5 0 3-2 5 0 1.500 1 3 0"/><path d="M8 16V8M8 11l-2.500-2.500M8 12.500l2.500-2.500M16 16V6M16 9.500l-2.500-2.500M16 11l2.500-2.500"/>',
  dice: `<rect x="4" y="4" width="16" height="16" rx="3" ${SOFT}/><circle cx="9" cy="9" r="1.200" fill="currentColor"/><circle cx="15" cy="15" r="1.200" fill="currentColor"/><circle cx="12" cy="12" r="1.200" fill="currentColor"/>`,
  canyon: `<path d="M3 20l4-9 3 4 3-8 4 7 4-3v9z" ${SOFT}/>`,
  layout: `<path d="M9 4L3 6.500V20l6-2.500 6 2.500 6-2.500V4l-6 2.500z" ${SOFT}/><path d="M9 4v13.500M15 6.500V20"/>`,
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
  { k: 'fire', cls: '' },
  { k: 's1', cls: '' },
  { k: 's2', cls: '' },
  { k: 'ult', cls: 'ult' },
  { k: 'heal', cls: 'item' },
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
    s.innerHTML = `<div class="sl-ic"></div><i class="sl-cd"></i><b class="sl-t"></b><kbd>${esc(K.labelFor(d.k))}</kbd>`;
    H.slots.appendChild(s);
    slotEls[d.k] = { root: s, ic: s.firstChild, t: s.querySelector('.sl-t'), kbd: s.querySelector('kbd'), total: 1, prev: 0 };
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

    nha: {
      minuteSub: 'Trụ nhà còn nhiều máu hơn sẽ thắng',
      top(m) {
        const pips = (team, mineSide) => {
          const ts = m.towers.filter((t) => t.team === team);
          const subs = ts.filter((t) => t.kind === 'sub'), main = ts.filter((t) => t.kind === 'main');
          return (mineSide ? subs.concat(main) : main.concat(subs))
            .map((t) => `<div class="tw ${t.kind}" data-tw="${t.id}" data-state="up" title="${t.kind === 'main' ? 'Trụ chính' : 'Trụ phụ'}"><i class="tw-f"></i><span class="tw-lk">${icon('lock')}</span></div>`).join('');
        };
        return `<div class="sc nh">
          <div class="sc-side nh-side mine t${myColor}"><div class="sc-col"><div class="tws">${pips(myTeam, true)}</div><div class="sc-bar"><i data-r="bar0"></i></div></div></div>
          <div class="sc-mid"><small>Trụ hạ <b data-r="k0">0</b> : <b data-r="k1">0</b></small><span class="sc-clock" data-r="clock">8:00</span></div>
          <div class="sc-side nh-side foe t${1 - myColor}"><div class="sc-col"><div class="tws">${pips(1 - myTeam, false)}</div><div class="sc-bar"><i data-r="bar1"></i></div></div></div>
        </div>`;
      },
      cols: teamCols,
      build(m) {
        S.tw = {}; S.twHit = {}; S.atkAt = -99; S.blkAt = -99; S.mainOpen = {};
        const pipEls = {};
        H.topBar.querySelectorAll('[data-tw]').forEach((n) => { pipEls[n.dataset.tw] = n; });
        for (const t of m.towers) {
          const bar = el('div', `twb ${t.kind} t${t.color}`, `<span class="twb-l">${icon('lock')}</span><div class="twb-hp"><i></i></div>`);
          bar.classList.add('off');
          fx.appendChild(bar);
          S.tw[t.id] = { pip: pipEls[t.id], bar, fill: bar.querySelector('.twb-hp i') };
          if (t.kind === 'main') S.mainOpen[t.team] = towerOpen(m, t);
        }
      },
      tick(m) {
        const hp = [0, 0], mx = [0, 0];
        for (const t of m.towers) {
          const w = S.tw[t.id];
          if (!w) continue;
          const open = towerOpen(m, t), state = !t.alive ? 'down' : open ? 'up' : 'locked';
          const pct = Math.round(clamp01(t.alive ? t.hp / t.maxHp : 0) * 100) + '%';
          if (w.pip) {
            if (w.pip.dataset.state !== state) w.pip.dataset.state = state;
            setVar(w.pip, '--hp', pct);
            flag(w.pip, 'hit', uiT - (S.twHit[t.id] ?? -99) < 0.5);
          }
          hp[t.team] += t.alive ? t.hp : 0; mx[t.team] += t.maxHp;
          if (t.kind === 'main' && t.alive && open !== S.mainOpen[t.team]) {
            S.mainOpen[t.team] = open;
            if (open && !m.over) {
              if (t.team === myTeam) announce('Trụ chính nhà mình đã mở, về thủ!', 'Địch có thể phá trụ chính', 'foe');
              else announce('Trụ chính của địch đã mở', 'Dồn lực phá trụ chính', 'mine');
            }
          }
          const pr = t.alive ? G.project(t.x, 6, t.z) : null;
          flag(w.bar, 'off', !pr || !pr.visible);
          if (pr && pr.visible) {
            w.bar.style.transform = `translate3d(${pr.x.toFixed(1)}px,${pr.y.toFixed(1)}px,0) translate(-50%,-100%)`;
            setScale(w.fill, t.hp / t.maxHp);
            flag(w.bar, 'locked', !open);
          }
        }
        if (T.k0._v !== String(m.score[myTeam])) { setText(T.k0, String(m.score[myTeam])); pop(T.k0); }
        if (T.k1._v !== String(m.score[1 - myTeam])) { setText(T.k1, String(m.score[1 - myTeam])); pop(T.k1); }
        setScale(T.bar0, hp[myTeam] / (mx[myTeam] || 1)); setScale(T.bar1, hp[1 - myTeam] / (mx[1 - myTeam] || 1));
      },
      mini(g, m, X, Z) {
        for (const t of m.towers) {
          const x = X(t.x), z = Z(t.z), r = t.kind === 'main' ? 6.2 : 4.4, col = TEAMS[t.color].css;
          if (!t.alive) {
            g.strokeStyle = '#7b838c'; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(x - 3, z - 3); g.lineTo(x + 3, z + 3); g.moveTo(x + 3, z - 3); g.lineTo(x - 3, z + 3); g.stroke();
            continue;
          }
          const age = uiT - (S.twHit[t.id] ?? -99);
          if (age < 1.2) {
            g.strokeStyle = `rgba(255,255,255,${(1 - age / 1.2).toFixed(2)})`; g.lineWidth = 2;
            g.beginPath(); g.arc(x, z, r + 2 + age * 8, 0, 7); g.stroke();
          }
          g.fillStyle = col; g.strokeStyle = '#05080b'; g.lineWidth = 1.6;
          g.beginPath();
          for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; g.lineTo(x + Math.cos(a) * r * 1.2, z + Math.sin(a) * r * 1.2); }
          g.closePath(); g.fill(); g.stroke();
          if (t.kind === 'main') { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, z, 1.8, 0, 7); g.fill(); }
          if (!towerOpen(m, t)) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x - r - 1.5, z - r - 1.5, 2 * r + 3, 2 * r + 3); }
        }
      },
      event(e, m) {
        const t = e.tower != null ? m.towers[e.tower] : null;
        if (!t) return;
        if (e.t === 'towerHit') {
          S.twHit[t.id] = uiT;
          if (t.team === myTeam && m.time - S.atkAt > 8) { S.atkAt = m.time; announce('Trụ nhà đang bị tấn công', t.kind === 'main' ? 'Trụ chính' : 'Trụ phụ', 'foe'); }
          if (e.by === G.me) addFloat(`tw${t.id}|dealt`, 'dealt', e.amt, e.x, e.z);
        } else if (e.t === 'towerBlock') {
          if (t.team !== myTeam && m.time - S.blkAt > 1.5) { S.blkAt = m.time; addFloat('', 'other', 0, e.x, e.z, 'Trụ đang khóa', 1.1); }
        } else if (e.t === 'towerDown') {
          const foe = t.team !== myTeam;
          if (t.kind === 'sub') announce(foe ? 'Trụ phụ của địch đã đổ' : 'Trụ phụ nhà mình đã đổ', foe ? '' : 'Giữ chặt trụ còn lại', foe ? 'mine' : 'foe');
          else announce(foe ? 'Đã phá trụ chính của địch' : 'Trụ chính nhà mình đã sập', '', foe ? 'mine' : 'foe');
        }
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
    H.mmn.textContent = `${mp.name} · ${(THEMES[mp.theme] || {}).name || ''}`;
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
        setText(s.kbd, K.labelFor(d.k));
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
    if (sbOn) { sbAcc += dt; if (sbAcc >= 0.25) { sbAcc = 0; sb.innerHTML = sbHtml(m); } }

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
    hudOn = false; syncScore();
    root.classList.remove('in-hud');
    hud.classList.remove('on'); fx.classList.remove('on');
    if (G.input && G.input.setTouchVisible) G.input.setTouchVisible(false);
  }

  /* ================= pause ================= */
  const pauseEl = el('div', 'screen pause');
  pauseEl.dataset.block = '';
  pauseEl.innerHTML = `<div class="box"><div class="hazard"></div><h2 data-r="title">Tạm dừng</h2>
    <button class="btn big" data-r="resume">Tiếp tục</button><button class="btn big danger" data-r="quit">Về sảnh</button>
    <p class="hint" data-r="hint">Nhấn Esc để tiếp tục</p></div>`;
  const PA = refs(pauseEl);
  root.appendChild(pauseEl);
  // An online match has other people in it: the menu opens over a running game and never emits ui:pause.
  const onlinePlaying = () => !!(G.online && G.online.state === 'playing');
  let pausedLive = false;
  function showPause() {
    if (!hudOn || paused) return;
    pausedLive = onlinePlaying();
    PA.title.textContent = pausedLive ? 'Trận đang diễn ra' : 'Tạm dừng';
    PA.quit.textContent = pausedLive ? 'Rời trận' : 'Về sảnh';
    const pk = K.labelFor('pause');
    PA.hint.textContent = pausedLive ? `Trận không dừng khi bạn mở menu. Nhấn ${pk} để quay lại` : `Nhấn ${pk} để tiếp tục`;
    paused = true; pauseEl.classList.add('on'); syncScore();
    if (G.input && G.input.setTouchVisible) G.input.setTouchVisible(false);
    if (!pausedLive) G.bus.emit('ui:pause', { paused: true });
  }
  function hidePause() {
    if (!paused) { pauseEl.classList.remove('on'); return; }
    paused = false; pauseEl.classList.remove('on');
    if (hudOn && G.input && G.input.setTouchVisible) G.input.setTouchVisible(true);
    if (!pausedLive) G.bus.emit('ui:pause', { paused: false });
    pausedLive = false;
  }
  const togglePause = () => (paused ? hidePause() : showPause());
  PA.resume.onclick = hidePause;
  PA.quit.onclick = () => { hidePause(); G.bus.emit('ui:menu'); };
  H.pauseBtn.onclick = showPause;
  // Esc always resumes so a bad rebind can never trap the player in the pause menu.
  window.addEventListener('keydown', (e) => {
    if (e.repeat || !hudOn || !G.match || G.match.over) return;
    if (K.has('pause', e.code) || (paused && e.code === 'Escape')) { e.preventDefault(); togglePause(); }
  });

  /* ================= scoreboard (hold) ================= */
  const sb = el('div', 'sb');
  root.appendChild(sb);
  const held = new Set();
  let sbOn = false, sbAcc = 0;
  const teamName = (t) => (TEAMS[t].name === 'Lam' ? 'Đội Lam' : 'Đội Hỏa');
  function sbHtml(m) {
    const rows = m.units.map((u) => ({ id: u.id, team: u.team, name: u.name, mech: u.mech, kills: u.kills, deaths: u.deaths, assists: u.assists, dmg: Math.round(u.dmg), healed: Math.round(u.healed),
      rating: u.kills * 3 + u.assists * 1.5 + u.dmg / 600 }));
    const sum = { rows, mvp: -1 };
    const mp = m.map, left = m.duration - m.time;
    let body, score = '';
    if (m.mode === 'tudo') {
      const order = rows.slice().sort((a, b) => (m.score[b.id] || 0) - (m.score[a.id] || 0) || a.deaths - b.deaths || a.id - b.id);
      body = `<div class="tb t1 ffa"><div class="tb-h"><span>#</span><span>Phi công</span><span>Hạ gục</span><span>Sát thương</span><span>Hồi máu</span></div>
        ${order.map((r, i) => `<div class="tb-r${r.id === G.me ? ' me' : ''}"><span class="tb-ic"><b class="plc${i < 3 ? ' top' : ''}">${i + 1}</b></span><span class="tb-n"><b>${esc(r.name)}</b><small>${MECHS[r.mech].name}</small></span><span class="kda"><b>${m.score[r.id] || 0}</b> <small>/ ${r.deaths}</small></span><span>${r.dmg}</span><span>${r.healed}</span></div>`).join('')}</div>`;
    } else if (m.mode === 'trum') {
      const b = bossOf(m);
      body = teamTable(sum, myTeam, teamName(myTeam));
      score = b ? `<span>${esc(b.name)} <b>${fmtN(Math.max(0, b.hp))}</b> / ${fmtN(b.maxHp)}</span><span>Mạng <b>${Math.max(0, m.lives)}</b></span>` : '';
    } else {
      body = `<div class="sb-two">${teamTable(sum, myTeam, teamName(myTeam))}${teamTable(sum, 1 - myTeam, teamName(1 - myTeam))}</div>`;
      if (m.mode === 'nha') {
        const hp = (team) => m.towers.filter((t) => t.team === team && t.alive).reduce((a, t) => a + t.hp, 0);
        score = `<span class="t${myColor}">Trụ ta <b>${fmtN(hp(myTeam))}</b></span><span class="t${1 - myColor}">Trụ địch <b>${fmtN(hp(1 - myTeam))}</b></span>`;
      } else score = `<span class="t${myColor}"><b>${m.score[myTeam]}</b></span><span>:</span><span class="t${1 - myColor}"><b>${m.score[1 - myTeam]}</b></span>`;
    }
    return `<div class="sb-box"><div class="sb-h"><b>${MODES[m.mode].name}</b><span class="sb-sc">${score}</span><span class="sb-m">${esc(mp.name)} · ${esc((THEMES[mp.theme] || {}).name || '')} · ${mmss(left)}</span></div>${body}
      <p class="hint">Thả ${esc(K.labelFor('score'))} để đóng bảng điểm</p></div>`;
  }
  function syncScore() {
    const m = G.match, on = !!(hudOn && m && !paused && K.isDown('score', held));
    if (on !== sbOn) { sbOn = on; sb.classList.toggle('on', on); if (on) { sb.innerHTML = sbHtml(m); sbAcc = 0; } }
  }
  const typingIn = (t) => t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  window.addEventListener('keydown', (e) => { if (!typingIn(e.target)) { held.add(e.code); syncScore(); } });
  window.addEventListener('keyup', (e) => { held.delete(e.code); syncScore(); });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button <= 2 && !(e.target.closest && e.target.closest('button,input,select,a'))) { held.add('Mouse' + e.button); syncScore(); } });
  window.addEventListener('pointerup', (e) => { held.delete('Mouse' + e.button); syncScore(); });
  window.addEventListener('blur', () => { held.clear(); syncScore(); });

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
          <h3>Môi trường</h3><div class="themes" data-r="themes"></div><p class="mode-bl th-bl" data-r="themeBl"></p>
        </div>
        <div class="acts">
          <div class="prow"><button class="play" data-r="play"><span>Vào trận</span></button><button class="netbtn" data-r="net" hidden>${icon('globe')}<span>Chơi mạng</span></button></div>
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

  let sel = MECH_ORDER[0], diff = 'normal', mapKey = MAP_ORDER[0], themeKey = null, modeKey = MODE_ORDER[0], menuInit = false, tab = 'info';

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
      { ic: 'weapon', key: K.labelFor('fire'), name: w.name, desc: wdesc, cd: '' },
      ...d.skills.map((s, i) => ({ ic: s.icon, key: K.labelFor(['s1', 's2', 'ult'][i]), name: s.name, desc: s.desc, cd: vn(s.cd, 0) + ' giây', ult: i === 2 })),
    ];
    const lv = levelOf(sel);
    const body = tab === 'garage' && own ? renderGarage(d, own) : `
      <div class="stats">${STAT.map((s) => { const v = s.f(d); return `<div class="st"><span>${s.label}</span><div class="bar"><i style="width:${Math.max(10, v / s.max * 100).toFixed(0)}%"></i></div><b>${s.fmt(v)}</b></div>`; }).join('')}</div>
      <div class="kit">${rows.map((r) => `<div class="sk${r.ult ? ' ult' : ''}"><div class="sk-ic">${icon(r.ic)}<kbd>${esc(r.key)}</kbd></div><div class="sk-tx"><b>${r.name}${r.cd ? `<small>${r.cd}</small>` : ''}</b><p>${r.desc}</p></div></div>`).join('')}</div>`;
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
  const MODE_ICON = { tdm: 'swords', chiem: 'flag', tudo: 'sniper', trum: 'boss', nha: 'tower' };
  const THEME_ICON = { jungle: 'leaf', desert: 'dune', ice: 'flake', lava: 'flame', city: 'city', swamp: 'swamp', autumn: 'leaf', canyon: 'canyon', random: 'dice', layout: 'layout' };
  const HAZARD_TEXT = { vent: 'Họng lửa phụt', ice: 'Băng trơn trượt', lava: 'Hồ dung nham', mud: 'Bùn lầy chậm bước' };
  const validTheme = (t) => t === 'random' || (typeof t === 'string' && has.call(THEMES, t));
  const themeName = (t) => (t === 'random' ? 'Ngẫu nhiên' : validTheme(t) ? THEMES[t].name : 'Theo bố cục');
  // The hazard line follows the theme actually in force: the chosen one, else the layout's own. A layout with no hazard spots stays clear whatever the theme says.
  function hazardFor(mp, th) {
    if (th === 'random') return { kind: 'rand', text: 'Mối nguy đổi theo môi trường' };
    const hz = THEMES[validTheme(th) ? th : mp.theme].hazard;
    return hz && (mp.hazards || []).length ? { kind: hz, text: HAZARD_TEXT[hz] || hz } : { kind: 'none', text: 'Không có bẫy' };
  }
  const THEME_BLURB = { layout: 'Mỗi bố cục giữ môi trường riêng của nó.', random: 'Mỗi trận bốc thăm một môi trường, mối nguy cũng đổi theo.' };
  const themeBlurb = (t) => (t === 'random' ? THEME_BLURB.random : validTheme(t) ? THEMES[t].blurb : THEME_BLURB.layout);
  const themeTiles = (cur, attr, cls) => [null, ...THEME_ORDER, 'random'].map((k) => {
    const id = k === null ? 'layout' : k;
    return `<button class="th${k === cur ? ' on' : ''}${cls || ''}" ${attr}="${id}" title="${esc(themeBlurb(k))}"><span class="sw ${k === null ? 'layout' : k === 'random' ? 'rnd' : k}">${icon(THEME_ICON[id])}</span><span class="th-n">${esc(themeName(k))}</span></button>`;
  }).join('');
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
    for (const k of [...MAP_ORDER, 'random']) {
      const rnd = k === 'random', mp = MAPS[k];
      const sw = rnd ? 'rnd' : validTheme(themeKey) && themeKey !== 'random' ? themeKey : mp.theme;
      const hz = rnd ? { kind: 'rand', text: 'Bố cục bốc thăm mỗi trận' } : hazardFor(mp, themeKey);
      const b = el('button', 'map' + (k === mapKey ? ' on' : ''), `<span class="sw ${sw}">${icon(rnd ? 'dice' : THEME_ICON[sw] || 'generic')}</span><span class="mp-t"><b>${rnd ? 'Ngẫu nhiên' : mp.name}</b><em class="hz ${hz.kind}">${hz.text}</em><small>${rnd ? 'Một trong các bố cục, chốt khi vào trận.' : mp.blurb}</small></span>`);
      b.dataset.map = k; b.dataset.theme = rnd ? '' : sw;
      b.onclick = () => { mapKey = k; renderSetup(); };
      M.maps.appendChild(b);
    }
    M.themes.innerHTML = themeTiles(themeKey, 'data-th');
    M.themes.querySelectorAll('[data-th]').forEach((b) => { b.onclick = () => { themeKey = b.dataset.th === 'layout' ? null : b.dataset.th; renderSetup(); }; });
    M.themeBl.innerHTML = `<b>${esc(themeName(themeKey))}</b>: ${esc(themeBlurb(themeKey))}`;
  }
  const makeChoice = (mech, df, map, mode, theme) => ({ mech, diff: df, map, mode, theme: theme === undefined ? null : theme, mods: upgradeMods(levelOf(mech)), paint: paintOf(mech) });
  M.play.onclick = () => {
    if (!ownedMech(sel)) { buyMech(sel); return; }
    choice = makeChoice(sel, diff, mapKey, modeKey, themeKey);
    const d = meta();
    if (d) { d.mech = sel; d.diff = diff; d.map = mapKey; d.theme = themeKey; d.mode = modeKey; G.meta.save(); }
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
    hideHUD(); hideResult(); hidePause(); hideEntry(); hideLobby();
    const d = meta();
    if (d) { sel = ownedMech(d.mech) ? d.mech : sel; diff = DIFFICULTY[d.diff] ? d.diff : diff; mapKey = MAPS[d.map] || d.map === 'random' ? d.map : mapKey; themeKey = validTheme(d.theme) ? d.theme : null; modeKey = MODE_ORDER.includes(d.mode) ? d.mode : modeKey; }
    if (!menuInit) { menuInit = true; applySettings(); }
    renderPlayer(); renderCards(); renderDetail(); renderSetup(); renderPlay();
    M.net.hidden = !G.online;
    menu.classList.add('on');
  }
  function hideMenu() { menu.classList.remove('on'); closeModals(); hideEntry(); hideLobby(); }

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
  settings.innerHTML = `<div class="modal-box" data-r="box"><div class="hazard"></div><h2>Cài đặt</h2>
    <div class="st-tabs" data-r="stTabs"><button data-st="gen" class="on">Chung</button><button data-st="keys">Phím</button></div>
    <div class="st-pane" data-pane="gen">
      <div class="fld"><span>Chất lượng đồ họa</span><div class="seg" data-r="q"></div></div>
      <div class="fld"><span>Âm lượng chung <b data-r="vTxt"></b></span><input type="range" min="0" max="100" data-r="vol"></div>
      <div class="fld"><span>Nhạc nền <b data-r="mTxt"></b></span><input type="range" min="0" max="100" data-r="mus"></div>
    </div>
    <div class="st-pane" data-pane="keys" hidden>
      <div class="klist" data-r="klist"></div>
      <div class="kmsg" data-r="kmsg" aria-live="polite"></div>
      <button class="btn" data-r="kreset">Về mặc định</button>
    </div>
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
  M.bSet.onclick = () => { renderSettings(); settings.querySelector('[data-st="keys"]').hidden = isTouch(); setSettingsTab('gen'); settings.classList.add('on'); };

  /* ---- key binding tab ---- */
  let kTab = 'gen', cap = null, conflict = null, lastBound = '', lastBoundAt = 0;
  const actLabel = (id) => (K.ACTIONS.find((a) => a.id === id) || {}).label || id;
  function setSettingsTab(t) {
    kTab = t === 'keys' && !isTouch() ? 'keys' : 'gen';
    settings.querySelectorAll('[data-st]').forEach((b) => b.classList.toggle('on', b.dataset.st === kTab));
    settings.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== kTab; });
    ST.box.classList.toggle('wide', kTab === 'keys');
    if (kTab === 'keys') renderKeys(); else endCapture();
  }
  function renderKeys(focus) {
    const b = K.getBindings();
    ST.klist.innerHTML = K.ACTIONS.map((a) => `<div class="kr"><span class="kr-n">${a.label}</span><span class="kr-k">${b[a.id].map((c, i) => {
      const on = cap && cap.id === a.id && cap.slot === i;
      return `<button class="kcap${on ? ' on' : ''}" data-act="${a.id}" data-slot="${i}" aria-label="${a.label}: ${esc(K.codeName(c))}">${on ? 'Bấm phím mới…' : esc(K.codeName(c))}</button>`;
    }).join('')}</span></div>`).join('');
    if (conflict) {
      ST.kmsg.className = 'kmsg ask';
      ST.kmsg.innerHTML = `<span>Phím <b>${esc(K.codeName(conflict.code))}</b> đang dùng cho <b>${esc(actLabel(conflict.other))}</b>. Hoán đổi hai phím?</span><button class="btn" data-r="kswap">Hoán đổi</button><button class="btn" data-r="kcancel">Hủy</button>`;
      ST.kmsg.querySelector('[data-r="kswap"]').focus();
    } else {
      ST.kmsg.className = 'kmsg';
      ST.kmsg.textContent = cap ? `Bấm phím mới cho «${actLabel(cap.id)}». Esc để hủy.` : 'Chọn một ô rồi bấm phím mới. Chuột phải và chuột giữa cũng được; chuột trái: bấm lại vào ô đang chờ.';
    }
    if (focus) { const n = ST.klist.querySelector(`[data-act="${focus.id}"][data-slot="${focus.slot}"]`); if (n) n.focus(); }
  }
  function endCapture(refocus) {
    const was = cap;
    cap = null; conflict = null;
    if (kTab === 'keys') renderKeys(refocus && was);
  }
  function doBind(code, swap) {
    const r = K.bind(cap.id, code, cap.slot, swap ? { swap: true } : undefined);
    if (r.ok) { lastBound = code; lastBoundAt = Date.now(); endCapture(true); return; }
    if (r.conflict) { conflict = { code, other: r.conflict }; renderKeys(); return; }
    toast('Không dùng được phím này cho hành động này');
  }
  ST.klist.addEventListener('click', (e) => {
    const b = e.target.closest('.kcap');
    if (!b) return;
    const id = b.dataset.act, slot = +b.dataset.slot;
    // A second click on the waiting cell is the only way to pick the left mouse button without every stray click binding it.
    if (cap && !conflict && cap.id === id && cap.slot === slot) { doBind('Mouse0'); return; }
    cap = { id, slot }; conflict = null;
    renderKeys({ id, slot });
  });
  ST.kmsg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.r === 'kswap') doBind(conflict.code, true); else endCapture(true);
  });
  ST.kreset.onclick = () => { endCapture(); K.resetBindings(); toast('Đã về phím mặc định'); renderKeys(); };
  settings.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => setSettingsTab(b.dataset.st); });
  window.addEventListener('keydown', (e) => {
    if (!cap) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') { endCapture(true); return; }
    if (conflict) { if (e.code === 'Enter') doBind(conflict.code, true); return; }
    doBind(e.code);
  }, true);
  window.addEventListener('keyup', (e) => {
    if (e.code === lastBound && Date.now() - lastBoundAt < 700) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  settings.addEventListener('pointerdown', (e) => {
    if (!cap || conflict || e.button === 0) return;
    e.preventDefault(); e.stopImmediatePropagation();
    doBind('Mouse' + e.button);
  }, true);
  settings.addEventListener('contextmenu', (e) => { if (cap) e.preventDefault(); });

  const help = el('div', 'modal');
  help.dataset.block = '';
  const kc = (t) => `<kbd>${esc(t)}</kbd>`;
  help.innerHTML = `<div class="modal-box wide"><div class="hazard"></div><h2>Cách chơi</h2>
    <p class="lead">Hai đội năm cơ giáp. Đội nào hạ gục đủ điểm mục tiêu trước, hoặc dẫn điểm khi hết giờ, sẽ thắng. Ở chế độ Thủ nhà, hạ hai trụ phụ rồi phá trụ chính của địch.</p>
    <div class="help-cols" data-r="cols"></div><button class="btn big" data-r="close">Đã hiểu</button></div>`;
  const HP = refs(help);
  function renderHelp() {
    const L = K.labelFor;
    HP.cols.innerHTML = `
      <div><h4>Máy tính</h4><ul>
        <li><span>${['up', 'left', 'down', 'right'].map((a) => kc(L(a))).join('')}</span>Di chuyển</li>
        <li><span>${kc('Chuột')}</span>Ngắm theo con trỏ</li>
        <li><span>${kc(L('fire'))}</span>Bắn</li>
        <li><span>${kc(L('s1'))}${kc(L('s2'))}${kc(L('ult'))}</span>Chiêu 1, chiêu 2, tuyệt kỹ</li>
        <li><span>${kc(L('heal'))}</span>Dùng bình máu</li>
        <li><span>${kc(L('score'))}</span>Giữ để xem bảng điểm</li>
        <li><span>${kc(L('pause'))}</span>Tạm dừng</li></ul>
        <p class="hint">Đổi phím trong Cài đặt, tab Phím.</p></div>
      <div><h4>Cảm ứng</h4><ul>
        <li><span>Cần trái</span>Chạm nửa trái màn hình để đi</li>
        <li><span>Cần phải</span>Kéo để ngắm, kéo xa là tự bắn</li>
        <li><span>Nút tròn</span>Chiêu 1, chiêu 2, tuyệt kỹ, bình máu</li></ul>
        <h4>Mẹo</h4><ul class="tips"><li>Núp trong bụi cỏ để tàng hình trước địch.</li><li>Nhặt hòm tiếp tế rơi giữa sân để tăng sức mạnh.</li><li>Trụ chính chỉ bị thương khi hai trụ phụ của đội đó đã đổ.</li></ul></div>`;
  }
  HP.close.onclick = () => help.classList.remove('on');
  M.bHelp.onclick = () => { renderHelp(); help.classList.add('on'); };
  // A rebind shows up everywhere a key is printed, at once.
  K.onChange(() => {
    for (const d of SLOT_DEFS) setText(slotEls[d.k].kbd, K.labelFor(d.k));
    if (menu.classList.contains('on')) renderDetail();
    if (help.classList.contains('on')) renderHelp();
    if (paused) PA.hint.textContent = PA.hint.textContent.replace(/Nhấn .+? để/, `Nhấn ${K.labelFor('pause')} để`);
  });
  function closeModals() { endCapture(); settings.classList.remove('on'); help.classList.remove('on'); confirmEl.classList.remove('on'); confirmFn = null; }
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
    // The summary carries no tower data, so the verdict and final tower HP come from the finished match.
    nha(summary, x) {
      const mt = x.mt, base = RESULT.teams(summary, x), tw = (G.match && G.match.towers) || [];
      const mine = (team) => tw.filter((t) => t.team === team);
      const hp = (team) => mine(team).reduce((a, t) => a + (t.alive ? t.hp : 0), 0);
      const fallen = tw.find((t) => t.kind === 'main' && !t.alive);
      const outcome = base.outcome;
      let title, sub;
      if (fallen) {
        title = fallen.team !== mt ? 'ĐÃ PHÁ TRỤ CHÍNH' : 'NHÀ ĐÃ SẬP';
        sub = fallen.team !== mt ? 'Trụ chính của địch đã đổ' : 'Trụ chính nhà mình đã đổ';
      } else {
        title = { win: 'Thắng khi hết giờ', lose: 'Thua khi hết giờ', draw: 'Hòa khi hết giờ' }[outcome];
        sub = { win: 'Trụ nhà còn nhiều máu hơn địch', lose: 'Trụ địch còn nhiều máu hơn nhà mình', draw: 'Hai bên còn lượng máu trụ bằng nhau' }[outcome];
      }
      const group = (team) => `<div class="rtw t${team}"><b>${teamName(team)}</b><em>${fmtN(hp(team))}</em>${mine(team).slice().sort((a, b) => (a.kind === 'main') - (b.kind === 'main')).map((t) => `<span class="rt${t.alive ? '' : ' dead'}${t.kind === 'main' ? ' main' : ''}" style="--hp:${Math.round(clamp01(t.alive ? t.hp / t.maxHp : 0) * 100)}%"><small>${t.kind === 'main' ? 'Chính' : 'Phụ'}</small><i></i><b>${t.alive ? fmtN(t.hp) : 'Đã đổ'}</b></span>`).join('')}</div>`;
      return {
        outcome, title, sub,
        score: `<b class="t${mt}">${summary.score[mt]}</b><span>:</span><b class="t${1 - mt}">${summary.score[1 - mt]}</b><small>trụ đã hạ · ${mmss(summary.time)}</small>`,
        body: (tw.length ? `<div class="rs-tw">${group(mt)}${group(1 - mt)}</div>` : '') + base.body,
        base: { win: 'Chiến thắng', draw: 'Hòa', lose: 'Tham chiến' }[outcome],
      };
    },
  };
  const RESULT_OF = { tdm: 'teams', chiem: 'teams', tudo: 'tudo', trum: 'trum', nha: 'nha' };

  function showResult(summary, rewards) {
    hideHUD(); hideMenu(); hidePause();
    const mode = MODES[summary.mode] ? summary.mode : (G.match && MODES[G.match.mode] ? G.match.mode : 'tdm');
    const meRow = summary.rows.find((r) => r.id === G.me);
    const mt = meRow ? meRow.team : myTeam;
    const view = RESULT[RESULT_OF[mode]](summary, { me: meRow, mt });
    const outcome = view.outcome;
    const rw = rewards, live = onlinePlaying();
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
        <div class="rs-btns">${live ? '<button class="btn big primary" data-r="lobby">Về phòng</button>' : '<button class="btn big primary" data-r="again">Đấu tiếp</button><button class="btn big" data-r="lobby">Về sảnh</button>'}</div>
      </div>`;
    const R = refs(result);
    if (R.again) R.again.onclick = () => { const d = meta() || {}; const mech = choice ? choice.mech : (d.mech || sel); choice = makeChoice(mech, choice ? choice.diff : (d.diff || diff), choice ? choice.map : (d.map || mapKey), choice ? choice.mode : (d.mode || modeKey), choice ? choice.theme : (d.theme === undefined ? themeKey : d.theme)); G.bus.emit('ui:play', choice); };
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

  /* ================= online: entry screen and lobby ================= */
  const TEAM_NAME = ['Đội Lam', 'Đội Hỏa'];
  const seatsOf = (mode) => (mode === 'tudo' ? 10 : 5);
  const entry = el('div', 'screen online');
  entry.dataset.block = '';
  entry.innerHTML = `
    <header class="ol-head">
      <button class="btn" data-r="back">${icon('back')}Quay lại</button>
      <div class="ol-title"><h2>Chơi mạng</h2><span>Mở phòng hoặc vào phòng của bạn bè</span></div>
      <label class="ol-me"><small>Tên phi công</small><input class="in" data-r="name" maxlength="16" spellcheck="false" aria-label="Tên phi công"></label>
    </header>
    <p class="ol-err" data-r="err" role="alert" hidden></p>
    <div class="ol-body">
      <section class="panel ol-make">
        <h3>Tạo phòng</h3>
        <input class="in" data-r="room" maxlength="24" spellcheck="false" aria-label="Tên phòng">
        <button class="tog" data-r="priv" aria-pressed="false"><i></i><span>Phòng riêng tư<small>Chỉ vào được bằng mã phòng</small></span></button>
        <button class="btn big primary" data-r="create">${icon('globe')}Tạo phòng</button>
        <h3>Vào bằng mã</h3>
        <div class="ol-code"><input class="in code" data-r="code" maxlength="12" spellcheck="false" autocomplete="off" placeholder="Mã phòng" aria-label="Mã phòng"><button class="btn big" data-r="joinCode">Vào</button></div>
      </section>
      <section class="panel ol-rooms">
        <div class="ol-rh"><h3>Phòng đang mở</h3><button class="btn" data-r="refresh">${icon('refresh')}Làm mới</button></div>
        <div class="rm rm-h"><span>Phòng</span><span>Chế độ</span><span>Đấu trường</span><span>Người</span><span></span></div>
        <div class="rm-list" data-r="list"></div>
      </section>
    </div>
    <div class="ol-wait" data-r="wait"><div class="box"><div class="hazard"></div><div class="spin"></div><h2>Đang kết nối</h2><p class="hint">Vui lòng chờ trong giây lát</p><button class="btn big" data-r="cancel">Hủy</button></div></div>`;
  const OE = refs(entry);
  const lobbyEl = el('div', 'screen lobby');
  lobbyEl.dataset.block = '';
  root.append(entry, lobbyEl);

  let entryOn = false, lobbyOn = false, privateRoom = false, lobbyMsg = '', roomsTicket = 0, roomsTimer = 0, roomsShown = false;
  const myName = () => { const d = meta(); return (d && d.name) || 'Phi công'; };
  const setEntryErr = (t) => { OE.err.textContent = t || ''; OE.err.hidden = !t; };
  const modeName = (k) => (MODES[k] ? MODES[k].name : '');
  const mapName = (k) => (k === 'random' ? 'Ngẫu nhiên' : MAPS[k] ? MAPS[k].name : '');

  function commitName() {
    const d = meta();
    if (!d) return;
    d.name = OE.name.value.trim().slice(0, 16) || 'Phi công';
    OE.name.value = d.name; G.meta.save();
    OE.room.placeholder = 'Phòng của ' + d.name;
  }
  OE.name.addEventListener('change', commitName);
  for (const i of [OE.name, OE.room, OE.code]) i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });
  OE.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') OE.joinCode.click(); });
  OE.code.addEventListener('input', () => { OE.code.value = OE.code.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); });

  function renderRooms(state, rows) {
    const L = OE.list;
    if (state === 'loading') { L.innerHTML = '<div class="rm-empty"><div class="spin sm"></div><b>Đang tìm phòng…</b></div>'; return; }
    if (state === 'error') { L.innerHTML = '<div class="rm-empty"><b>Không tải được danh sách phòng.</b><span>Hãy kiểm tra mạng rồi bấm Làm mới.</span></div>'; return; }
    if (!rows.length) { L.innerHTML = '<div class="rm-empty"><b>Chưa có phòng nào đang mở</b><span>Hãy tạo phòng mới rồi gửi mã cho bạn bè.</span></div>'; return; }
    L.innerHTML = rows.map((r) => {
      const full = r.players >= r.max;
      return `<div class="rm" data-room="${esc(r.id)}"><span class="rm-n"><b>${esc(r.name)}</b><small>Chủ phòng: ${esc(r.host)}</small></span><span>${esc(modeName(r.mode))}</span><span>${esc(mapName(r.map))}</span><span class="rm-p${full ? ' full' : ''}">${r.players}/${r.max}</span>
        <button class="btn" data-join="${esc(r.id)}"${full ? ' disabled' : ''}>${full ? 'Đầy' : 'Vào'}</button></div>`;
    }).join('');
  }
  async function refreshRooms(quiet) {
    const o = G.online, ticket = ++roomsTicket;
    if (!quiet || !roomsShown) renderRooms('loading');
    o.error = '';
    let rows = [];
    try { rows = await o.listRooms(); } catch (e) { o.error = 'x'; }
    if (ticket !== roomsTicket || !entryOn) return;
    roomsShown = true;
    if (o.error) { o.error = ''; renderRooms('error'); } else renderRooms('rows', Array.isArray(rows) ? rows : []);
  }

  function showEntry() {
    const o = G.online;
    if (!o) return;
    if (o.state === 'lobby') { openLobby(false); return; }
    hideHUD(); hideResult(); hidePause(); closeModals(); hideLobby();
    menu.classList.remove('on');
    entryOn = true; roomsShown = false;
    OE.name.value = myName(); OE.room.placeholder = 'Phòng của ' + myName(); OE.code.value = '';
    setEntryErr('');
    entry.classList.add('on');
    syncOnline();
    renderRooms('loading');
    refreshRooms(false);
    clearInterval(roomsTimer);
    roomsTimer = setInterval(() => { if (entryOn && G.online.state === 'off') refreshRooms(true); }, 4000);
  }
  function hideEntry() {
    entryOn = false; clearInterval(roomsTimer); roomsTicket++;
    entry.classList.remove('on');
  }

  const afterAttempt = () => { if (G.online.state === 'off') setEntryErr(G.online.error); };
  async function attempt(fn) {
    if (G.online.state !== 'off') return;
    commitName(); setEntryErr('');
    const ok = await fn();
    if (!ok) afterAttempt();
  }
  OE.create.onclick = () => attempt(() => G.online.host({ name: OE.room.value.trim() || undefined, isPrivate: privateRoom, playerName: myName() }));
  OE.joinCode.onclick = () => {
    const code = OE.code.value.trim();
    if (!code) { setEntryErr('Hãy nhập mã phòng.'); shake(OE.code); OE.code.focus(); return; }
    attempt(() => G.online.join({ code, playerName: myName() }));
  };
  OE.list.onclick = (e) => {
    const b = e.target.closest('[data-join]');
    if (b && !b.disabled) attempt(() => G.online.join({ lobbyId: b.dataset.join, playerName: myName() }));
  };
  OE.priv.onclick = () => { privateRoom = !privateRoom; OE.priv.setAttribute('aria-pressed', String(privateRoom)); };
  OE.refresh.onclick = () => { if (G.online.state === 'off') refreshRooms(false); };
  OE.cancel.onclick = () => { G.online.leave(); setEntryErr(''); };
  OE.back.onclick = () => showMenu();
  M.net.onclick = () => showEntry();
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && entryOn && G.online.state === 'off') showMenu(); });

  /* ---- lobby ---- */
  const lobbyMe = () => { const o = G.online; return o && o.lobby && o.lobby.players.find((p) => p.id === o.me); };
  const mechDef = (k) => MECHS[k] || BOSSES[k] || { name: k, role: '' };

  // Paint and upgrade mods always come from the save; the mech is the saved favourite on first entry and the lobby's own afterwards.
  function pushMine(first) {
    const o = G.online, me = lobbyMe(), d = meta();
    if (!me || !d) return;
    let mech = !first && ownedMech(me.mech) ? me.mech : d.mech;
    if (!ownedMech(mech)) mech = MECH_ORDER.find(ownedMech) || MECH_ORDER[0];
    o.setMine({ mech, paint: paintOf(mech), mods: upgradeMods(levelOf(mech)) });
  }

  function seatHtml(p, ffa) {
    const o = G.online, me = p.id === o.me, d = mechDef(p.mech);
    const swap = o.role === 'host' && !ffa && o.lobby.mode !== 'trum' ? `<button class="btn mini" data-a="swap" data-pid="${esc(p.id)}" title="Chuyển ${esc(p.name)} sang đội kia">${icon('swap')}Đổi đội</button>` : '';
    return `<div class="seat t${ffa ? 2 : p.team}${me ? ' me' : ''}${p.ready ? ' rdy' : ''}" data-pid="${esc(p.id)}">
      <img alt="" src="${portrait(p.mech, p.team, p.paint)}">
      <div class="st-t"><b class="st-n"><span>${esc(p.name)}</span>${p.host ? '<em class="badge">Chủ phòng</em>' : ''}${me ? '<em class="you">Bạn</em>' : ''}</b><span class="st-m">${roleIcon(p.mech)}${d.name}</span></div>
      <div class="st-r"><span class="rdy-p">${icon(p.ready ? 'check' : 'pause')}${p.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</span>${swap}</div>
    </div>`;
  }
  const botSeat = (t) => `<div class="seat bot t${t}"><div class="bot-ph">${icon('generic')}</div><div class="st-t"><b class="st-n">Bot</b><span class="st-m">Máy sẽ điền chỗ trống</span></div></div>`;
  function teamHtml(L, team, title) {
    const ps = L.players.filter((p) => p.team === team), n = seatsOf(L.mode);
    return `<div class="lb-team t${team}"><div class="lb-th"><b>${title}</b><small>${ps.length} / ${n}</small></div><div class="seats">${ps.map((p) => seatHtml(p, false)).join('')}${botSeat(team).repeat(Math.max(0, n - ps.length))}</div></div>`;
  }
  function teamsHtml(L) {
    if (L.mode === 'tudo') {
      const n = seatsOf('tudo');
      return `<div class="lb-team ffa"><div class="lb-th"><b>Hỗn chiến</b><small>${L.players.length} / ${n}</small></div><div class="seats">${L.players.map((p) => seatHtml(p, true)).join('')}${botSeat(2).repeat(Math.max(0, n - L.players.length))}</div></div>`;
    }
    if (L.mode === 'trum') {
      const boss = BOSSES.titan;
      return teamHtml(L, 0, TEAM_NAME[0]) + `<div class="lb-team t1 boss"><div class="lb-th"><b>Trùm</b><small>Bot</small></div><div class="bossbox"><div class="bot-ph">${icon('boss')}</div><b>${boss.name}</b><span>Hạ trùm trước khi cả đội hết mạng</span></div></div>`;
    }
    return teamHtml(L, 0, TEAM_NAME[0]) + teamHtml(L, 1, TEAM_NAME[1]);
  }

  function settingsHtml(L, host) {
    if (!host) {
      const mp = MAPS[L.map];
      return `<div class="kv"><span>Chế độ</span><b>${esc(modeName(L.mode))}</b></div><p class="mode-bl">${esc((MODES[L.mode] || {}).blurb || '')}</p>
        <div class="kv"><span>Đấu trường</span><b>${esc(mapName(L.map))}</b></div><div class="kv"><span>Môi trường</span><b>${esc(themeName(validTheme(L.theme) ? L.theme : null))}</b></div><div class="kv"><span>Độ khó bot</span><b>${esc((DIFFICULTY[L.diff] || {}).name || '')}</b></div>
        <p class="hint">Chỉ chủ phòng đổi được thiết lập.</p>`;
    }
    return `<h3>Chế độ</h3><div class="modes">${MODE_ORDER.map((k) => `<button class="mode${k === L.mode ? ' on' : ''}" data-a="mode" data-k="${k}">${icon(MODE_ICON[k])}<span>${MODES[k].name}</span></button>`).join('')}</div>
      <p class="mode-bl">${esc(MODES[L.mode].blurb)}</p>
      <h3>Độ khó bot</h3><div class="seg">${Object.keys(DIFFICULTY).map((k) => `<button class="${k === L.diff ? 'on' : ''}" data-a="diff" data-k="${k}">${DIFFICULTY[k].name}</button>`).join('')}</div>
      <h3>Đấu trường</h3><div class="maps">${MAP_ORDER.map((k) => `<button class="map${k === L.map ? ' on' : ''}" data-a="map" data-k="${k}"><span class="sw ${MAPS[k].theme}">${icon(THEME_ICON[MAPS[k].theme] || 'generic')}</span><span class="mp-t"><b>${MAPS[k].name}</b></span></button>`).join('')}<button class="map${L.map === 'random' ? ' on' : ''}" data-a="map" data-k="random"><span class="sw rnd">${icon('dice')}</span><span class="mp-t"><b>Ngẫu nhiên</b></span></button></div>
      <h3>Môi trường</h3><div class="themes">${themeTiles(validTheme(L.theme) ? L.theme : null, 'data-k').replace(/<button class="th/g, '<button data-a="theme" class="th')}</div>`;
  }

  function renderLobby() {
    const o = G.online, L = o && o.lobby;
    if (!L || !lobbyOn) return;
    const host = o.role === 'host', me = lobbyMe() || {}, ffaOrBoss = L.mode === 'tudo' || L.mode === 'trum';
    const waiting = L.players.filter((p) => !p.ready).length;
    const owned = MECH_ORDER.filter(ownedMech);
    const lv = levelOf(me.mech), paint = PAINTS[me.paint] || PAINTS.goc;
    const keep = lobbyEl.querySelector('.lb-teams'), top = keep ? keep.scrollTop : 0;
    lobbyEl.innerHTML = `
      <header class="ol-head lb-head">
        <button class="btn danger" data-a="leave">${icon('exit')}Rời phòng</button>
        <div class="lb-code"><small>Mã phòng</small><b data-r="code">${esc(o.code)}</b><button class="btn" data-a="copy">${icon('copy')}Chép mã</button></div>
        <div class="lb-info"><b>${L.players.length} người chơi</b><span>${host ? 'Bạn là chủ phòng' : 'Chờ chủ phòng bắt đầu'}</span></div>
      </header>
      <div class="lb-body">
        <div class="lb-main">
          <div class="lb-teams m-${L.mode}">${teamsHtml(L)}</div>
          <section class="panel lb-mine"><div class="lb-mh"><h3>Cơ giáp của bạn</h3><small>Sơn ${esc(paint.name)}${lv ? ` · Nâng cấp +${lv}` : ''}, lấy từ kho của bạn</small></div>
            <div class="lm-grid">${owned.map((k) => `<button class="lm${k === me.mech ? ' sel' : ''}" data-a="mech" data-k="${k}"><img alt="" src="${portrait(k, me.team || 0, paintOf(k))}"><span><b>${MECHS[k].name}</b><em>${roleIcon(k)}${MECHS[k].role}</em></span></button>`).join('')}</div></section>
        </div>
        <div class="lb-side">
          <section class="panel setup lb-set"><h3>Thiết lập phòng</h3><div class="opts">${settingsHtml(L, host)}</div></section>
          <section class="panel lb-act">
            ${lobbyMsg ? `<p class="ol-err">${esc(lobbyMsg)}</p>` : ''}
            <div class="lb-hint">${host ? (waiting ? `Còn ${waiting} người chưa sẵn sàng` : 'Mọi người đã sẵn sàng') : (me.ready ? 'Đã sẵn sàng, chờ chủ phòng bắt đầu' : 'Bấm Sẵn sàng khi bạn đã chọn xong')}</div>
            ${host ? '<button class="play go" data-a="start"><span>Bắt đầu</span></button>' : `<button class="btn big rdy-btn${me.ready ? ' on' : ''}" data-a="ready" aria-pressed="${!!me.ready}">${icon('check')}Sẵn sàng</button>`}
            <button class="btn" data-a="swapme"${ffaOrBoss ? ' disabled' : ''}>${icon('swap')}Đổi đội</button>
          </section>
        </div>
      </div>`;
    const t = lobbyEl.querySelector('.lb-teams');
    if (t) t.scrollTop = top;
  }

  function openLobby(fresh) {
    hideHUD(); hideResult(); hidePause(); closeModals(); hideEntry();
    menu.classList.remove('on');
    lobbyOn = true; lobbyMsg = '';
    lobbyEl.classList.add('on');
    pushMine(fresh);
    renderLobby();
  }
  function hideLobby() { lobbyOn = false; lobbyEl.classList.remove('on'); }
  function showLobby() {
    if (!G.online || G.online.state !== 'lobby') { showMenu(); return; }
    openLobby(false);
  }

  async function copyCode() {
    const code = G.online.code;
    try { await navigator.clipboard.writeText(code); toast('Đã chép mã phòng ' + code); return; } catch (e) { /* no clipboard permission: fall back below */ }
    const t = el('textarea'); t.value = code; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* not allowed */ }
    t.remove();
    toast(ok ? 'Đã chép mã phòng ' + code : 'Không chép được, hãy gõ tay mã ' + code);
  }

  lobbyEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    const o = G.online;
    if (!b || b.disabled || !o) return;
    const k = b.dataset.k, me = lobbyMe() || {};
    lobbyMsg = '';
    switch (b.dataset.a) {
      case 'leave': o.leave(); if (lobbyOn) showMenu(); return;
      case 'copy': copyCode(); return;
      case 'mech': { const d = meta(); if (d) { d.mech = k; G.meta.save(); } o.setMine({ mech: k, paint: paintOf(k), mods: upgradeMods(levelOf(k)) }); break; }
      case 'ready': o.setMine({ ready: !me.ready }); break;
      case 'swapme': if (o.swapTeam(o.me) === false && o.role === 'host') lobbyMsg = o.error; break;
      case 'swap': if (o.swapTeam(b.dataset.pid) === false) lobbyMsg = o.error; break;
      case 'mode': if (o.setRoom({ mode: k }) === false) lobbyMsg = o.error; break;
      case 'map': o.setRoom({ map: k }); break;
      case 'theme': o.setRoom({ theme: k === 'layout' ? null : k }); break;
      case 'diff': o.setRoom({ diff: k }); break;
      case 'start': if (o.start() === false) { lobbyMsg = o.error; shake(b); } break;
      default:
    }
    renderLobby();
  });

  // The connection table lives in online.js; this only follows it. Leaving or losing the room closes the lobby.
  function syncOnline() {
    const o = G.online;
    if (!o) return;
    OE.wait.classList.toggle('on', entryOn && o.state === 'connecting');
    if (o.state === 'lobby' && entryOn) { openLobby(true); return; }
    if (!lobbyOn) return;
    if (o.state === 'lobby') renderLobby();
    else if (o.state === 'off') { showMenu(); if (o.error) toast(o.error); } else hideLobby();
  }
  G.bus.on('net:state', syncOnline);
  G.bus.on('net:lobby', () => { lobbyMsg = ''; if (lobbyOn && G.online.state === 'lobby') renderLobby(); });

  /* ================= rotate hint ================= */
  const rot = el('div', 'rotate', `<svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="8" width="24" height="42" rx="4"/><path d="M28 44h8"/><path d="M50 22c6 3 8 9 5 15M55 37l-1-6M55 37l-6-1"/></svg><b>Xoay ngang máy</b><span>Đấu Trường Thép chơi ở chế độ màn hình ngang</span>`);
  root.appendChild(rot);

  return {
    showMenu, hideMenu, showHUD, hideHUD, update, event, showResult,
    showPause, hidePause, togglePause, announce, toast, showLobby, hideLobby, showOnline: showEntry, hideOnline: hideEntry,
    get paused() { return paused; },
  };
}
