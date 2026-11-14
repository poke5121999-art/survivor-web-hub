// HUD, menus, result screen. Builds its own DOM under #ui; reads G.match / G.me, never writes to the match.
import { MECHS, MECH_ORDER, DIFFICULTY, TEAMS, PICKUPS, RULES, levelXp } from './data.js';
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
  crate: `<rect x="4" y="6" width="16" height="13" rx="1.500" ${SOFT}/><path d="M4 11h16M12 6v13"/>`,
};
export function icon(name, cls) {
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.weapon}</svg>`;
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
  const portrait = (mech, team) => {
    const k = mech + team;
    if (!(k in portraits)) { try { portraits[k] = G.portrait ? G.portrait(mech, team) : ''; } catch (e) { portraits[k] = ''; } }
    return portraits[k];
  };
  const roleIcon = (mech) => icon(MECHS[mech].roleKey);

  let hudOn = false, paused = false, uiT = 0;
  let choice = null;

  /* ================= HUD ================= */
  const hud = el('div', 'hud');
  hud.innerHTML = `
    <div class="hud-top">
      <div class="sc">
        <div class="sc-side mine"><div class="sc-bar"><i data-r="bar0"></i></div><b class="sc-n" data-r="k0">0</b></div>
        <div class="sc-mid"><small>Mục tiêu <b data-r="tgt">25</b></small><span class="sc-clock" data-r="clock">5:00</span></div>
        <div class="sc-side foe"><b class="sc-n" data-r="k1">0</b><div class="sc-bar"><i data-r="bar1"></i></div></div>
      </div>
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
  let curMatch = null, myTeam = 0, S = null;
  const cards = {}, nps = {};
  let mmCtx = null, mmStatic = null, mmScale = 1;

  function setupMatch(m) {
    curMatch = m;
    const me = m.units[G.me];
    myTeam = me ? me.team : 0;
    S = { fb: false, streak: {}, oneMin: false, killedBy: '', miniAcc: 1, lowQ: -1 };
    H.colA.innerHTML = ''; H.colB.innerHTML = ''; fx.innerHTML = '';
    for (const k in cards) delete cards[k];
    for (const k in nps) delete nps[k];
    floats.length = 0; freeFloats.length = 0; byKey.clear();
    H.feed.innerHTML = ''; feed.length = 0;
    H.sc_side_a = hud.querySelector('.sc-side.mine'); H.sc_side_b = hud.querySelector('.sc-side.foe');
    H.sc_side_a.className = 'sc-side mine t' + myTeam; H.sc_side_b.className = 'sc-side foe t' + (1 - myTeam);
    H.mission.textContent = `Hạ gục đối thủ, đội nào chạm ${m.target} điểm trước sẽ thắng`;
    setText(H.tgt, String(m.target));

    for (const team of [myTeam, 1 - myTeam]) {
      const col = team === myTeam ? H.colA : H.colB;
      for (const u of m.units) {
        if (u.team !== team) continue;
        const c = el('div', `pc t${team}${u.id === G.me ? ' me' : ''}`);
        c.innerHTML = `<div class="pc-img"><img alt="" src="${portrait(u.mech, u.team)}"><span class="pc-role">${roleIcon(u.mech)}</span><div class="pc-dead"><b></b></div></div>
          <div class="pc-info"><span class="pc-name">${esc(u.name)}</span><div class="pc-hp"><i></i></div><span class="pc-kd">0 / 0</span></div>`;
        col.appendChild(c);
        cards[u.id] = { root: c, hp: c.querySelector('.pc-hp i'), dead: c.querySelector('.pc-dead b'), kd: c.querySelector('.pc-kd') };
        const np = el('div', `np t${team}${u.id === G.me ? ' self' : ''}`);
        np.innerHTML = u.id === G.me
          ? '<span class="np-mark"></span><div class="np-hp"><i class="np-f"></i></div><div class="np-sh"><i></i></div>'
          : `<span class="np-n">${roleIcon(u.mech)}${esc(u.name)}</span><div class="np-hp"><i class="np-f"></i></div><div class="np-sh"><i></i></div>`;
        np.classList.add('off');
        fx.appendChild(np);
        nps[u.id] = { root: np, f: np.querySelector('.np-f'), sh: np.querySelector('.np-sh i'), shBox: np.querySelector('.np-sh') };
      }
    }
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
    for (let t = 0; t < 2; t++) {
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
    for (const u of m.units) {
      if (!u.alive || u.id === G.me) continue;
      if (u.team !== myTeam && !visibleTo(m, u, myTeam)) continue;
      g.fillStyle = TEAMS[u.team].css; g.strokeStyle = '#05080b'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(X(u.x), Z(u.z), u.team === myTeam ? 3.8 : 3.4, 0, 7); g.fill(); g.stroke();
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
      ? `<b class="t${killer.team}">${esc(killer.name)}</b><span class="kf-ic t${killer.team}">${roleIcon(killer.mech)}</span><b class="t${victim.team}">${esc(victim.name)}</b>${ass}`
      : `<span class="kf-ic">${icon('skull')}</span><b class="t${victim.team}">${esc(victim.name)}</b>`;
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

    // score race
    const a = m.score[myTeam], b = m.score[1 - myTeam];
    if (H.k0._v !== String(a)) { setText(H.k0, String(a)); pop(H.k0); }
    if (H.k1._v !== String(b)) { setText(H.k1, String(b)); pop(H.k1); }
    setScale(H.bar0, a / m.target); setScale(H.bar1, b / m.target);
    const left = m.duration - m.time;
    setText(H.clock, mmss(left));
    flag(H.clock, 'warn', left <= 60); flag(H.clock, 'final', left <= 10);
    if (!S.oneMin && left <= 60 && m.duration > 75) { S.oneMin = true; announce('Còn 1 phút', 'Ai dẫn điểm sẽ thắng', 'warn'); }
    flag(H.mission, 'show', m.time < 7);

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
        <div class="coins">${icon('coin')}<b data-r="coins">0</b><small>xu</small></div>
      </div>
    </header>
    <div class="mn-body">
      <section class="panel roster"><h3>Chọn cơ giáp</h3><div class="cards" data-r="cards"></div></section>
      <section class="panel detail" data-r="detail"></section>
      <section class="panel setup">
        <h3>Độ khó</h3><div class="seg" data-r="diff"></div>
        <h3>Đấu trường</h3><div class="maps" data-r="maps"></div>
        <button class="play" data-r="play"><span>Vào trận</span></button>
        <div class="row2"><button class="btn" data-r="bSet">${icon('gear')}Cài đặt</button><button class="btn" data-r="bHelp">${icon('help')}Cách chơi</button></div>
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

  let sel = MECH_ORDER[0], diff = 'normal', mapKey = MAP_ORDER[0], menuInit = false;

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
  }
  function renderCards() {
    M.cards.innerHTML = '';
    for (const k of MECH_ORDER) {
      const d = MECHS[k], own = ownedMech(k);
      const c = el('button', 'mc' + (k === sel ? ' sel' : '') + (own ? '' : ' locked'));
      c.innerHTML = `<img alt="" src="${portrait(k, 0)}"><div class="mc-t"><span class="mc-role">${roleIcon(k)}${d.role}</span><b>${d.name}</b></div>
        ${own ? '' : `<span class="mc-lock">${icon('lock')}<b>${d.price}</b></span>`}`;
      c.onclick = () => { sel = k; renderCards(); renderDetail(); renderPlay(); };
      M.cards.appendChild(c);
    }
  }
  function renderDetail() {
    const d = MECHS[sel], own = ownedMech(sel), w = d.weapon;
    const wdesc = `Sát thương ${w.dmg}${w.splash ? ' (nổ lan)' : ''}, tầm ${vn(w.range, 1)} m, ${vn(1 / w.cd, 1)} phát mỗi giây.`;
    const rows = [
      { ic: 'weapon', key: 'Chuột', name: w.name, desc: wdesc, cd: '' },
      ...d.skills.map((s, i) => ({ ic: s.icon, key: ['Q', 'E', 'SPACE'][i], name: s.name, desc: s.desc, cd: vn(s.cd, 0) + ' giây', ult: i === 2 })),
    ];
    M.detail.innerHTML = `
      <div class="md-head"><img alt="" src="${portrait(sel, 0)}"><div><span class="role">${roleIcon(sel)}${d.role}</span><h2>${d.name}</h2><p>${d.blurb}</p></div></div>
      <div class="stats">${STAT.map((s) => { const v = s.f(d); return `<div class="st"><span>${s.label}</span><div class="bar"><i style="width:${Math.max(10, v / s.max * 100).toFixed(0)}%"></i></div><b>${s.fmt(v)}</b></div>`; }).join('')}</div>
      <div class="kit">${rows.map((r) => `<div class="sk${r.ult ? ' ult' : ''}"><div class="sk-ic">${icon(r.ic)}<kbd>${r.key}</kbd></div><div class="sk-tx"><b>${r.name}${r.cd ? `<small>${r.cd}</small>` : ''}</b><p>${r.desc}</p></div></div>`).join('')}</div>
      ${own ? '' : `<button class="btn buy" data-r="buy">${icon('lock')}Mở khóa · <b>${d.price}</b> xu</button>`}`;
    const buy = M.detail.querySelector('[data-r="buy"]');
    if (buy) buy.onclick = () => {
      if (G.meta && G.meta.buy(sel)) { renderPlayer(); renderCards(); renderDetail(); renderPlay(); toast('Đã mở khóa ' + MECHS[sel].name); }
      else { buy.animate && buy.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 240 }); toast('Chưa đủ xu để mở khóa'); }
    };
  }
  function renderPlay() { M.play.disabled = !ownedMech(sel); }
  function renderSetup() {
    M.diff.innerHTML = '';
    for (const k of Object.keys(DIFFICULTY)) {
      const b = el('button', k === diff ? 'on' : '', DIFFICULTY[k].name);
      b.onclick = () => { diff = k; renderSetup(); };
      M.diff.appendChild(b);
    }
    M.maps.innerHTML = '';
    for (const k of MAP_ORDER) {
      const b = el('button', 'map' + (k === mapKey ? ' on' : ''), `<b>${MAPS[k].name}</b><small>${MAPS[k].blurb}</small>`);
      b.onclick = () => { mapKey = k; renderSetup(); };
      M.maps.appendChild(b);
    }
  }
  M.play.onclick = () => {
    if (!ownedMech(sel)) return;
    choice = { mech: sel, diff, map: mapKey };
    const d = meta();
    if (d) { d.mech = sel; d.diff = diff; d.map = mapKey; G.meta.save(); }
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
    if (d) { sel = ownedMech(d.mech) ? d.mech : sel; diff = DIFFICULTY[d.diff] ? d.diff : diff; mapKey = MAPS[d.map] ? d.map : mapKey; }
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
  function closeModals() { settings.classList.remove('on'); help.classList.remove('on'); }
  root.append(settings, help);

  /* ================= result ================= */
  const result = el('div', 'screen result');
  result.dataset.block = '';
  root.appendChild(result);
  let resultTimers = [];
  function hideResult() { resultTimers.forEach(clearTimeout); resultTimers = []; result.classList.remove('on'); }
  const later = (fn, ms) => resultTimers.push(setTimeout(fn, ms));
  function tween(node, to, ms, fmt) {
    const t0 = performance.now();
    const f = (now) => {
      const k = clamp01((now - t0) / ms);
      node.textContent = fmt(Math.round(to * (1 - (1 - k) * (1 - k))));
      if (k < 1 && result.classList.contains('on')) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }

  function showResult(summary, rewards) {
    hideHUD(); hideMenu(); hidePause();
    const meRow = summary.rows.find((r) => r.id === G.me);
    const mt = meRow ? meRow.team : myTeam;
    const outcome = summary.winner === -1 ? 'draw' : summary.winner === mt ? 'win' : 'lose';
    const title = { win: 'Thắng', lose: 'Thua', draw: 'Hòa' }[outcome];
    const sub = { win: 'Đội của bạn giành chiến thắng', lose: 'Đội bạn đã bại trận', draw: 'Hai đội ngang tài ngang sức' }[outcome];
    const table = (team) => {
      const rows = summary.rows.filter((r) => r.team === team).sort((a, b) => b.rating - a.rating);
      return `<div class="tb t${team}"><div class="tb-h"><span></span><span>${TEAMS[team].name === 'Lam' ? 'Đội Lam' : 'Đội Hỏa'}</span><span>K / D / A</span><span>Sát thương</span><span>Hồi máu</span></div>
        ${rows.map((r) => `<div class="tb-r${r.id === G.me ? ' me' : ''}"><span class="tb-ic">${roleIcon(r.mech)}</span>
          <span class="tb-n"><b>${esc(r.name)}${r.id === summary.mvp ? '<em class="mvp">MVP</em>' : ''}</b><small>${MECHS[r.mech].name}</small></span>
          <span class="kda"><b>${r.kills}</b> / ${r.deaths} / ${r.assists}</span><span>${r.dmg}</span><span>${r.healed}</span></div>`).join('')}</div>`;
    };
    const rw = rewards;
    const parts = rw ? [
      [outcome === 'win' ? 'Chiến thắng' : outcome === 'draw' ? 'Hòa' : 'Tham chiến', rw.parts.base],
      ['Hạ gục', rw.parts.kills], ['Hỗ trợ', rw.parts.assists], ['MVP', rw.parts.mvp],
    ].filter((p) => p[1] > 0) : [];
    result.innerHTML = `
      <div class="rs-banner ${outcome}"><div class="hazard"></div><h1>${title}</h1><p>${sub}</p></div>
      <div class="rs-score"><b class="t${mt}">${summary.score[mt]}</b><span>:</span><b class="t${1 - mt}">${summary.score[1 - mt]}</b><small>${mmss(summary.time)}</small></div>
      <div class="rs-tables">${table(mt)}${table(1 - mt)}</div>
      <div class="rs-foot">
        ${rw ? `<div class="rw">
          <div class="rw-coin">${icon('coin')}<b data-r="rc">+0</b><small>xu</small></div>
          <div class="rw-xp"><div class="rw-top"><span>Cấp <b data-r="rl">${rw.levelBefore}</b></span><span data-r="rx">+0 XP</span></div><div class="xpbar"><i data-r="rf"></i></div><em class="lvup" data-r="up">Lên cấp!</em></div>
          <div class="rw-parts">${parts.map((p) => `<span>${p[0]} <b>+${p[1]}</b></span>`).join('')}</div></div>` : '<div></div>'}
        <div class="rs-btns"><button class="btn big primary" data-r="again">Đấu tiếp</button><button class="btn big" data-r="lobby">Về sảnh</button></div>
      </div>`;
    const R = refs(result);
    R.again.onclick = () => { const d = meta() || {}; G.bus.emit('ui:play', choice || { mech: d.mech || sel, diff: d.diff || diff, map: d.map || mapKey }); };
    R.lobby.onclick = () => G.bus.emit('ui:menu');
    result.classList.add('on');
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
