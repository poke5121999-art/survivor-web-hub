// Meta menus, loaded on first open: game modes, Customization (skins / ropes / trails by collection), the XP road,
// the Lucky Wheel and the market (daily free coins, skip tickets).
// `app` is main.js's handle: save, meta, custom loader, overlay(), writeSave(), applyEquip(), hud(), icon(), ...
import { Renderer } from './render.js';
import { bake } from './fx.js';
import { XP_ROAD, SKIP_TICKETS, qty } from './meta.js';
import { MODES } from './modes.js';

const CSS = `
.sheet { margin: auto; background: #12314d; color: #fff; border: 4px solid #0d1b2a; border-radius: 22px; width: min(96vw, 620px);
  height: min(92vh, 900px); display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; }
.overlay.dim { background: rgba(0, 30, 55, .8); }
.sheet header { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #0d1b2a; }
.sheet header h2 { flex: 1; margin: 0; font-size: 20px; }
.x { width: 38px; height: 38px; border-radius: 12px; border: 3px solid #fff; background: none; color: #fff; font: 900 18px system-ui; cursor: pointer; }
.coinpill { display: flex; align-items: center; gap: 4px; }
.coinpill i, .mode i, .rwd i { display: inline-block; background-repeat: no-repeat; flex: none; }
.scroll { overflow: auto; flex: 1; padding: 8px 12px 16px; }
.prev { display: flex; gap: 12px; padding: 10px 12px; align-items: center; background: #0f2a43; }
.prev canvas { width: 132px; height: 132px; border-radius: 16px; flex: none; }
.prev .info { flex: 1; min-width: 0; }
.prev b { font-size: 19px; display: block; }
.prev .rar { font-size: 13px; font-weight: 900; }
.prev .how { font-size: 14px; margin-top: 6px; opacity: .95; }
.tabs { display: flex; gap: 6px; padding: 8px 12px 0; }
.tabs button { flex: 1; border: 3px solid #0d1b2a; border-bottom: 0; border-radius: 14px 14px 0 0; background: #24496d; color: #fff;
  font: 900 16px system-ui; padding: 8px; cursor: pointer; }
.tabs button.on { background: #ffd23f; color: #0d1b2a; }
.col h3 { margin: 14px 2px 6px; font-size: 16px; display: flex; justify-content: space-between; gap: 8px; }
.col h3 small { opacity: .75; font-weight: 700; }
.cells { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 8px; }
.cell { position: relative; border-radius: 14px; border: 3px solid; padding: 4px 2px 6px; display: flex; flex-direction: column;
  align-items: center; gap: 2px; cursor: pointer; font: 800 11px/1.15 system-ui; color: #0d1b2a; min-height: 104px; }
.cell canvas { width: 64px; height: 64px; }
.cell.locked { background: #2b3f55 !important; color: #fff; }
.cell.locked canvas { opacity: .45; filter: grayscale(.6); }
.cell.sel { outline: 3px solid #fff; outline-offset: 1px; }
.cell .tag { position: absolute; top: -7px; right: -5px; border-radius: 9px; padding: 1px 6px; font-size: 11px; background: #ff5a5f; color: #fff; }
.cell .eq { background: #20c060; }
.cell .t { text-align: center; }
.mode { display: flex; align-items: center; gap: 12px; background: #1d4266; border-radius: 16px; padding: 10px; margin: 8px 0; }
.mode .nm { flex: 1; font-size: 18px; font-weight: 900; }
.mode .st { font-size: 13px; opacity: .9; text-align: right; }
.mode.off { opacity: .8; }
.mode button { border: 3px solid #0d1b2a; border-radius: 14px; background: #ffd23f; font: 900 16px system-ui; padding: 8px 14px; cursor: pointer; }
.step { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: 14px; margin: 6px 0; background: #1d4266; }
.step.done { opacity: .55; }
.step.ready { background: #2f6b3a; }
.step .rk { width: 54px; text-align: center; font-weight: 900; flex: none; }
.step .rk small { display: block; font-size: 11px; opacity: .8; }
.step .rw { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; }
.rwd { display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,.25); border-radius: 10px; padding: 3px 8px 3px 3px; font-size: 13px; }
.rwd canvas, .rwd i { width: 34px; height: 34px; flex: none; }
.rwd .soon { color: #ffb4b4; font-size: 11px; display: block; }
.league { margin: 12px 0 2px; font-weight: 900; color: #ffd23f; }
.foot { padding: 10px 12px; background: #0d1b2a; display: flex; gap: 10px; align-items: center; }
.foot .big { font-size: 18px; padding: 10px; }
.foot .big:disabled { background: #9aa5b1; }
#wheel { background: rgba(4, 18, 38, .88); }
#wheel canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#wheel .wspin { position: absolute; border: 0; background: none; cursor: pointer; color: #fff; font: 900 26px/1 system-ui;
  text-shadow: 0 2px 0 #9a4b00; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
#wheel .wspin small { font-size: 19px; display: flex; align-items: center; gap: 4px; }
#wheel .wspin.off { filter: grayscale(.8) brightness(.8); }
#wheel .wclose { position: absolute; left: 0; right: 0; border: 0; background: none; color: #fff; font: 900 22px system-ui;
  text-shadow: 0 2px 0 #0d1b2a; cursor: pointer; }
#wheel .wtop { position: absolute; top: max(12px, env(safe-area-inset-top)); right: 12px; display: flex; gap: 8px; }
#wheel .wtop div, .tpill { display: flex; align-items: center; gap: 4px; background: #0d1b2a; border-radius: 99px; padding: 3px 10px 3px 3px;
  color: #fff; font: 800 15px system-ui; }
#wheel .winfo { position: absolute; border: 0; background: none; cursor: pointer; padding: 0; }
.offer { display: flex; align-items: center; gap: 12px; background: #1d4266; border-radius: 16px; padding: 10px; margin: 8px 0; }
.offer .nm { flex: 1; font-size: 17px; font-weight: 900; }
.offer .nm small { display: block; font-size: 13px; font-weight: 700; opacity: .8; }
.offer button { border: 3px solid #0d1b2a; border-radius: 14px; background: #ffd23f; font: 900 16px system-ui; padding: 8px 12px;
  cursor: pointer; display: flex; align-items: center; gap: 4px; min-width: 96px; justify-content: center; }
.offer button:disabled { background: #9aa5b1; cursor: default; }
.mk h3 { margin: 14px 2px 4px; font-size: 16px; }
.mk p { margin: 0 2px 6px; font-size: 13px; opacity: .8; }
`;

const KIND_TABS = [['skins', 'Skin'], ['ropes', 'Dây'], ['trails', 'Vệt']];
const FLAGS = { 'flag.has_coin_offers': 'Ưu đãi xu trong chợ', 'flag.has_welcome_booster': 'Gói thẻ chào mừng',
  'flag.seasonal_event': 'Sự kiện theo mùa' };

let styled = false;
function sheetOverlay(app, id, title) {
  if (!styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'ui overlay dim';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="sheet"><header><button class="x" title="Đóng">✕</button><h2>${title}</h2>
    <div class="coinpill"><i data-ico="coin"></i><b class="c"></b></div></header></div>`;
  const sheet = el.firstChild;
  el.querySelector('.x').onclick = () => { app.play('popup_out'); close(app, id); };
  app.icon(el.querySelector('[data-ico]'), 'coin', 26);
  el.querySelector('.c').textContent = app.save.coins;
  app.overlay(id, true);
  return sheet;
}

const loops = {};
function close(app, id) {
  cancelAnimationFrame(loops[id]);
  app.overlay(id, false);
  app.hud();
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// textTemplate rich text: <color=#RRGGBB>..</color> and \n
function rich(t) {
  return esc(t.trim()).replace(/&lt;color=(#[0-9a-fA-F]{6,8})&gt;/g, '<span style="color:$1">').replace(/&lt;\/color&gt;/g, '</span>')
    .replace(/\n/g, '<br>');
}

function iconCanvas(icons, it, px) {
  const c = document.createElement('canvas');
  c.width = c.height = px * 2;
  const r = icons.rects[it.kind + '/' + it.asset];
  if (!r) return c;
  let src = icons.img, rr = r;
  if (it.fx) { const b = bake(icons.img, r, it.fx); src = b.canvas; rr = [0, 0, b.canvas.width, b.canvas.height]; }
  const k = (px * 2) / Math.max(rr[2], rr[3]);
  c.getContext('2d').drawImage(src, rr[0], rr[1], rr[2], rr[3], (px * 2 - rr[2] * k) / 2, (px * 2 - rr[3] * k) / 2, rr[2] * k, rr[3] * k);
  return c;
}

// ---- game modes ----------------------------------------------------------------------------------------------------
// mode.lucky_wheel has no levels (game_modes: no config, no icon): it is the wheel's unlock, granted by the XP road's
// first step (0 XP). Its row opens the wheel.
const SCREENS = { 'mode.lucky_wheel': { open: (app) => openWheel(app), icon: 'wheel' } };

export function openModes(app) {
  const { meta, save } = app;
  const sheet = sheetOverlay(app, 'modes', 'Chế độ chơi');
  const box = document.createElement('div');
  box.className = 'scroll';
  for (const m of meta.d.modes) {
    const st = meta.modeState(save, m);
    const screen = SCREENS[st.id];
    const playable = st.open && (MODES[st.id] || screen);
    const row = document.createElement('div');
    row.className = 'mode' + (playable ? '' : ' off');
    row.dataset.id = st.id;
    const ic = document.createElement('i');
    const key = screen ? screen.icon : st.id;
    app.icon(ic, key, 52);
    if (!meta.d.menu[key]) Object.assign(ic.style, { width: '52px', height: '52px' });
    row.appendChild(ic);
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = st.name;
    row.appendChild(nm);
    if (playable) {
      const b = document.createElement('button');
      b.textContent = 'Chơi';
      b.onclick = () => {
        app.play('button');
        if (!screen) { app.openMode(st.id); return; }
        close(app, 'modes');
        screen.open(app);
      };
      row.appendChild(b);
    } else {
      const s = document.createElement('div');
      s.className = 'st';
      s.innerHTML = st.need
        ? '🔒 ' + (st.need.road === XP_ROAD ? `Cần ${st.need.value} XP` : `Hoàn thành màn ${st.need.value}`)
        : 'Sắp có';
      row.appendChild(s);
    }
    box.appendChild(row);
  }
  sheet.appendChild(box);
}

// ---- customization -------------------------------------------------------------------------------------------------
export async function openShop(app) {
  const { meta, save, custom } = app;
  const sheet = sheetOverlay(app, 'shop', 'Tuỳ biến');
  sheet.insertAdjacentHTML('beforeend', `<div class="prev"><canvas></canvas><div class="info"><b></b><span class="rar"></span>
    <div class="how"></div></div></div><div class="tabs"></div><div class="scroll">Đang tải…</div>`);
  const tabs = sheet.querySelector('.tabs'), list = sheet.querySelector('.scroll'), info = sheet.querySelector('.info');
  const state = { kind: 'skins', sel: meta.item('skins', save.equipped.skins) };
  for (const [kind, label] of KIND_TABS) {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.kind = kind;
    b.onclick = () => { app.play('button'); state.kind = kind; state.sel = meta.item(kind, save.equipped[kind]); render(); };
    tabs.appendChild(b);
  }
  const icons = await custom.icons();
  const preview = startPreview(app, sheet.querySelector('.prev canvas'), state);

  function showInfo() {
    const it = state.sel, rar = meta.d.rarities[it.rarity];
    info.querySelector('b').textContent = it.title;
    info.querySelector('.rar').textContent = rar[0];
    info.querySelector('.rar').style.color = rar[1];
    const owned = save.owned[it.kind].includes(it.name);
    const u = meta.unlockInfo(it);
    info.querySelector('.how').innerHTML = save.equipped[it.kind] === it.name ? 'Đang dùng'
      : owned ? 'Đã có. Chạm để dùng.'
        : rich(u.text || 'Locked') + (u.live ? '' : '<br><small style="opacity:.7">Cách mở này sắp có ở bản web</small>');
    preview.select(it);
  }

  function render() {
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.kind === state.kind);
    list.innerHTML = '';
    const cols = Object.entries(meta.d.collections).filter(([, c]) => c[1] === state.kind).sort((a, b) => a[1][2] - b[1][2] || a[1][3] - b[1][3]);
    for (const [cid, c] of cols) {
      const items = meta.items.filter((it) => it.collection === cid && it.kind === state.kind);
      if (!items.length) continue;
      items.sort((a, b) => meta.d.rarityIds.indexOf(a.rarity) - meta.d.rarityIds.indexOf(b.rarity) || a.title.localeCompare(b.title));
      const have = items.filter((it) => save.owned[it.kind].includes(it.name)).length;
      const sec = document.createElement('div');
      sec.className = 'col';
      sec.innerHTML = `<h3>${esc(c[0])}<small>${have}/${items.length}${c[4] ? ' · +' + c[4] + ' XP' : ''}</small></h3><div class="cells"></div>`;
      const cells = sec.querySelector('.cells');
      for (const it of items) cells.appendChild(cell(it));
      list.appendChild(sec);
    }
    showInfo();
  }

  function cell(it) {
    const rar = meta.d.rarities[it.rarity];
    const owned = save.owned[it.kind].includes(it.name), eq = save.equipped[it.kind] === it.name;
    const b = document.createElement('div');
    b.className = 'cell' + (owned ? '' : ' locked') + (state.sel === it ? ' sel' : '');
    b.dataset.id = it.id;
    b.style.background = rar[1];
    b.style.borderColor = rar[2];
    b.appendChild(iconCanvas(icons, it, 32));
    const t = document.createElement('div');
    t.className = 't';
    t.innerHTML = owned ? esc(it.title) : rich(meta.unlockInfo(it).text || 'Locked');
    b.appendChild(t);
    if (eq) b.insertAdjacentHTML('beforeend', '<span class="tag eq">✓</span>');
    b.onclick = () => {
      app.play('button');
      if (owned && !eq) {
        save.equipped[it.kind] = it.name;
        app.writeSave();
        app.applyEquip();
      }
      state.sel = it;
      render();
    };
    return b;
  }
  render();
}

// Dancing preview of the selected (or equipped) skin, with the selected rope or trail next to it.
function startPreview(app, canvas, state) {
  const { atlas, meta, custom, save } = app;
  const R = new Renderer(canvas, atlas.img, atlas.rects, atlas.fontImg, atlas.font);
  R.theme = app.R.theme;
  const view = { skin: null, rope: null, trail: null, want: null };
  const pick = (kind) => (state.sel?.kind === kind ? state.sel : meta.item(kind, save.equipped[kind]));
  function select() {
    const sk = pick('skins'), rp = pick('ropes'), tr = pick('trails');
    view.want = sk.id;
    custom.skin(sk).then((s) => { if (view.want === s.id) view.skin = s; });
    view.trail = meta.d.trails[tr.asset];
    view.rope = null;
    if (rp.name !== 'basic') custom.ropes().then((img) => { view.rope = { img, r: meta.d.ropes[rp.asset] }; });
  }
  const t0 = performance.now();
  const pts = [];
  function loop(now) {
    loops.shop = requestAnimationFrame(loop);
    R.resize();
    const t = (now - t0) / 1000;
    R.begin({ x: 0, y: -0.15, zoom: 0.75 });
    if (state.kind === 'trails' && view.trail) {
      pts.push({ x: Math.cos(t * 3) * 0.5, y: -0.2 + Math.sin(t * 6) * 0.2, t });
      while (pts.length && t - pts[0].t > view.trail.time) pts.shift();
      R.trail(pts, t, view.trail);
    }
    if (state.kind === 'ropes') {
      if (view.rope) {
        const r = view.rope.r;
        R.rope(view.rope.img, r.rect, 0, 0.8, 0, -0.15, (r.rect[2] / r.ppu) * 0.32, (r.rect[3] / r.ppu) * 0.4);
      } else R.line(0, 0.8, 0, -0.15, 0.045, '#0d1b2a');
    }
    const sk = view.skin;
    if (sk) {
      const d = sk.dance.frames.length ? sk.dance : { frames: sk.states[2], fps: 1 };
      const name = d.frames[Math.floor(t * d.fps) % d.frames.length];
      const [img, r] = sk.frames[name];
      if (!meta.byId.get(sk.id).noShadow) R.spriteFrom(img, name, r, [0.3, 0, 0, 0.3, 0, -0.32 - 0.1], { shadow: true });
      R.spriteFrom(img, name, r, [0.3, 0, 0, 0.3, 0, -0.32]);
      app.look.previewDrawn = sk.id;
    }
  }
  loops.shop = requestAnimationFrame(loop);
  return { select };
}

// ---- XP road -------------------------------------------------------------------------------------------------------
export async function openRoad(app) {
  const { meta, save, custom } = app;
  const sheet = sheetOverlay(app, 'road', 'Đường XP');
  sheet.insertAdjacentHTML('beforeend', '<div class="scroll">Đang tải…</div><div class="foot"><span class="sum"></span><button class="big">Nhận thưởng</button></div>');
  const list = sheet.querySelector('.scroll'), btn = sheet.querySelector('.foot .big'), sum = sheet.querySelector('.sum');
  const icons = await custom.icons();

  function reward([res, q]) {
    const el = document.createElement('div');
    el.className = 'rwd';
    const kind = res.split('.')[0];
    const it = meta.byId.get(res);
    let label, soon = false;
    if (it) { el.appendChild(iconCanvas(icons, it, 17)); label = it.title; }
    else {
      const ic = document.createElement('i');
      const key = res === 'currency.skin_coins' ? 'coin' : kind === 'booster' ? 'booster.' + meta.d.boosters[res]?.[1]?.replace('welcome', 'epic')
        : kind === 'unlocked_level_mode' ? 'mode.challenge' : res;
      app.icon(ic, key, 34);
      el.appendChild(ic);
      const mode = meta.d.modes.find((m) => m[0] === res);
      if (res === 'currency.skin_coins') label = q + ' xu';
      else if (mode) label = 'Mở ' + mode[1];
      else if (kind === 'unlocked_level_mode') label = 'Challenge +' + q + ' màn';
      else if (kind === 'booster') { label = meta.d.boosters[res]?.[0] || res; soon = true; }
      else label = FLAGS[res] || res;
    }
    const s = document.createElement('span');
    s.innerHTML = rich(label) + (soon ? '<span class="soon">🔒 sắp có</span>' : '');
    el.appendChild(s);
    return el;
  }

  function render() {
    list.innerHTML = '';
    const done = save.claimed[XP_ROAD] ?? -1;
    meta.xpRoad.forEach(([v, rewards, league], i) => {
      if (league) list.insertAdjacentHTML('beforeend', `<div class="league">${esc(meta.d.leagues[league])}</div>`);
      if (!rewards.length) return;
      const row = document.createElement('div');
      row.className = 'step' + (v <= done ? ' done' : v <= save.xp ? ' ready' : '');
      row.innerHTML = `<div class="rk">Hạng ${i + 1}<small>${v} XP</small></div><div class="rw"></div>`;
      for (const r of rewards) row.querySelector('.rw').appendChild(reward(r));
      if (v <= done) row.querySelector('.rk').insertAdjacentHTML('beforeend', '<small>✓ đã nhận</small>');
      list.appendChild(row);
    });
    const n = meta.claimable(save);
    btn.disabled = !n;
    btn.textContent = n ? `Nhận thưởng (${n})` : 'Nhận thưởng';
    const b = meta.xpBar(save.xp);
    sum.textContent = `${save.xp} XP · Hạng ${b.rank}`;
    sheet.querySelector('.c').textContent = save.coins;
    (list.querySelector('.ready') || list.querySelector('.step:not(.done)'))?.scrollIntoView({ block: 'center' });
  }
  btn.onclick = () => {
    app.play('popup_in');
    const got = meta.claim(save, XP_ROAD, save.xp);
    app.writeSave();
    app.applyEquip();
    const names = got.map((g) => g.item?.title || (g.coins && g.coins + ' xu') || (g.mode && 'chế độ mới') || null).filter(Boolean);
    if (names.length) app.toast('Nhận: ' + names.join(', '));
    render();
  };
  render();
}

// ---- Lucky Wheel ---------------------------------------------------------------------------------------------------
// LuckyWheelPopup, drawn on a canvas from art/wheel.webp and laid out from the prefab in reference UI units (y up, from
// the screen centre; [ĐỀ XUẤT] a 750 x 1334 reference, the CanvasScaler is not read). The spin and close buttons are DOM.
// The reel is a vertical strip of 50 rewards (LuckyWheelSettings); the spin scrolls it 8 s along the settings' curve
// until slot 45 (the reward) stops at the arrow. Rules: Bonus.wheel* (bonus.js).
const REF = [750, 1334];
const ITEM_H = 170; // FortuneWheelItem prefab height; [ĐỀ XUẤT] width = viewport minus the layout padding (15 + 15)
const VIEW = { x: 0, y: 4, w: 286, h: 638 }; // Viewport: Background (0, -60) 420 x 900, Inner -120 / -248 at +64, Viewport -14
const START = 2; // [ĐỀ XUẤT] slot under the arrow before the first spin

// Unity AnimationCurve: cubic Hermite between keys [time, value, inSlope, outSlope]
function curveAt(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0, , o0] = keys[i], [t1, v1, i1] = keys[i + 1];
    if (t > t1) continue;
    const d = t1 - t0, u = (t - t0) / d, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * d * o0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * d * i1;
  }
  return keys[keys.length - 1][1];
}

const wheelIcon = (res) => (res.endsWith('_single_card') ? 'card' : res);

// Vertical layout group with force-expanded slots: each child centred in an equal share of the free height.
function column(h, sizes) {
  const free = (h - sizes.reduce((a, b) => a + b, 0)) / sizes.length;
  let y = h / 2;
  return sizes.map((sz) => { const c = y - (sz + free) / 2; y -= sz + free; return c; });
}
const BOLTS = [56, 20, 56, 20, 56, 20, 56, 20, 56, 20, 56];

export async function openWheel(app) {
  const { meta, save } = app, bonus = await app.loadBonus();
  if (!styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
  let el = document.getElementById('wheel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wheel';
    el.className = 'ui overlay';
    document.body.appendChild(el);
  }
  el.innerHTML = `<canvas></canvas><div class="wtop"><div><i data-ico="coin"></i><b class="c"></b></div>
    <div><i data-ico="ticket"></i><b class="t"></b></div></div>
    <button class="winfo" title="Phần thưởng"></button><button class="wspin"><b>Quay</b><small></small></button>
    <button class="wclose">Đóng</button>`;
  app.icon(el.querySelector('[data-ico="coin"]'), 'coin', 24);
  app.icon(el.querySelector('[data-ico="ticket"]'), 'ticket', 24);
  app.overlay('wheel', true);
  const cv = el.querySelector('canvas'), g = cv.getContext('2d');
  const spinBtn = el.querySelector('.wspin'), closeBtn = el.querySelector('.wclose'), infoBtn = el.querySelector('.winfo');
  const w = bonus.d.wheel, A = bonus.d.wheelArt;
  const W = { reel: bonus.wheelReel(save), p: START, spin: null, tick: 0, angle: 0, won: -1, t: 0, img: null };
  app.look.wheel = W;
  closeBtn.onclick = () => { app.play('popup_out'); close(app, 'wheel'); };
  infoBtn.onclick = () => {
    const by = {};
    const all = bonus.wheelRewards(save);
    const total = all.reduce((t, r) => t + r.w, 0);
    for (const r of all) { const k = r.pool.split('.')[0]; by[k] = (by[k] || 0) + r.w; }
    const NAMES = { skin: 'skin', rope: 'dây', trail: 'vệt', booster: 'gói thẻ', booster_card: 'thẻ' };
    app.toast(Object.entries(by).map(([k, v]) => `${NAMES[k] || k} ${Math.round((v / total) * 100)}%`).join(' · '));
  };

  function refresh() {
    const price = bonus.wheelPrice(save);
    el.querySelector('.c').textContent = save.coins;
    el.querySelector('.t').textContent = qty(save, SKIP_TICKETS);
    const sm = spinBtn.querySelector('small');
    sm.innerHTML = price[1] ? `${price[1]}<i></i>` : 'Miễn phí';
    if (price[1]) app.icon(sm.querySelector('i'), 'coin', 20);
    spinBtn.classList.toggle('off', !!W.spin || save.coins < price[1] || !W.reel.length);
  }
  spinBtn.onclick = () => {
    if (W.spin) return;
    const r = bonus.wheelSpin(save);
    if (r.refused) {
      app.toast(r.refused === 'coins' ? 'Cần thêm xu để quay vòng quay' : 'Đã có hết phần thưởng của vòng quay');
      return;
    }
    app.play('button');
    app.writeSave();
    // keep the strip under the arrow where it is, then put the reward at slot 45
    if (W.won >= 0) {
      const fresh = bonus.wheelReel(save), next = fresh.length ? fresh : W.reel.slice();
      for (let d = -2; d <= 2; d++) next[START + d] = W.reel[Math.round(W.p) + d] || next[START + d];
      W.reel = next;
      W.p = START;
    }
    W.reel[w.at] = r.reward;
    // the cycled list may hold the reward next to slot 45 too: show another reward there
    const other = W.reel.find((x) => x.res !== r.reward.res);
    for (let i = w.at - 3; i <= w.at + 3; i++) if (i !== w.at && other && W.reel[i]?.res === r.reward.res) W.reel[i] = other;
    W.spin = { t: 0, from: W.p, r };
    W.won = -1;
    refresh();
  };
  refresh();

  const img = await app.image('./art/wheel.webp');
  W.img = img;
  let last = performance.now();
  function frame(now) {
    loops.wheel = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    W.t += dt;
    if (W.spin) {
      const s = W.spin;
      s.t += dt;
      const k = Math.min(1, s.t / w.spin);
      W.p = s.from + (w.at - s.from) * curveAt(w.curve, k);
      if (k >= 1) {
        W.p = w.at;
        W.spin = null;
        W.won = W.t;
        app.play('popup_in');
        app.applyEquip();
        app.hud();
        app.toast('Nhận: ' + meta.resTitle(s.r.reward.res) + (s.r.got.some((x) => x.later) ? ' (sắp có ở bản web)' : ''));
        refresh();
      }
    }
    // ticker: each slot passing the arrow kicks it down (max 45 degrees), it springs back at tickerUpSpeed
    const idx = Math.round(W.p);
    if (idx !== W.tick) { W.tick = idx; if (W.spin) W.angle = w.ticker[1]; }
    W.angle *= Math.exp(-dt / Math.max(0.01, w.ticker[3]));
    draw();
  }
  loops.wheel = requestAnimationFrame(frame);

  function draw() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cw = el.clientWidth, ch = el.clientHeight;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const k = Math.min(cw / REF[0], ch / REF[1]);
    const cx = cw / 2, cy = ch / 2 - 30 * k; // Holder at (0, 30)
    const X = (x) => cx + x * k, Y = (y) => cy - y * k;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    const spr = (key, x, y, sw, sh, rot = 0, alpha = 1, piv = [0.5, 0.5]) => {
      const r = A[key];
      if (!r) return;
      g.save();
      g.globalAlpha = alpha;
      g.translate(X(x), Y(y));
      g.rotate(-rot);
      g.drawImage(W.img, r[0], r[1], r[2], r[3], -piv[0] * sw * k, -(1 - piv[1]) * sh * k, sw * k, sh * k);
      g.restore();
    };
    const sliced = (key, x, y, sw, sh) => {
      const r = A[key];
      const dw = sw * k, dh = sh * k, f = (r[8] || 1) * k;
      let [l, b, rr, t] = [r[4] || 0, r[5] || 0, r[6] || 0, r[7] || 0];
      const sx = Math.min(1, dw / ((l + rr) * f || 1)), sy = Math.min(1, dh / ((t + b) * f || 1));
      const L = l * f * sx, R = rr * f * sx, T = t * f * sy, B = b * f * sy;
      const x0 = X(x) - dw / 2, y0 = Y(y) - dh / 2;
      const sxs = [r[0], r[0] + l, r[0] + r[2] - rr, r[0] + r[2]], sys = [r[1], r[1] + t, r[1] + r[3] - b, r[1] + r[3]];
      const dxs = [x0, x0 + L, x0 + dw - R, x0 + dw], dys = [y0, y0 + T, y0 + dh - B, y0 + dh];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const s0 = sxs[i], s1 = sxs[i + 1], t0 = sys[j], t1 = sys[j + 1];
        if (s1 - s0 < 0.5 || t1 - t0 < 0.5 || dxs[i + 1] - dxs[i] < 0.5 || dys[j + 1] - dys[j] < 0.5) continue;
        g.drawImage(W.img, s0, t0, s1 - s0, t1 - t0, dxs[i], dys[j], dxs[i + 1] - dxs[i], dys[j + 1] - dys[j]);
      }
    };
    if (!W.img) return;
    // sun (UIRotator; [ĐỀ XUẤT] 12 deg/s) and the floating dice ([ĐỀ XUẤT] 6 px bob)
    spr('ShinySun', 0, 234, 800, 800, W.t * 0.21);
    const bob = (i) => Math.sin(W.t * 1.6 + i * 2) * 6;
    spr('Dice', -250, 248 + bob(0), 100, 100, 0.614);
    spr('Dice', -258, 180 + bob(1), 70, 70, 0.233);
    spr('Dice', 266, -362 + bob(2), 130, 130, -0.263);
    sliced('FortuneWheel_Background', 0, -60, 420, 900);
    spr('BG_CenterSpin', 0, 4, 300, 652);
    sliced('BG_CenterSpin', VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    // reel, clipped to the viewport: slot i is centred at VIEW.y + (i - p) * ITEM_H
    g.save();
    g.beginPath();
    g.rect(X(VIEW.x - VIEW.w / 2), Y(VIEW.y + VIEW.h / 2), VIEW.w * k, VIEW.h * k);
    g.clip();
    const iw = VIEW.w - 30;
    for (let i = Math.floor(W.p - 3); i <= Math.ceil(W.p + 3); i++) {
      const it = W.reel[i];
      if (!it) continue;
      const y = VIEW.y + (i - W.p) * ITEM_H;
      const pulse = W.won >= 0 && i === w.at ? 1 + 0.06 * Math.sin((W.t - W.won) * 10) * Math.exp(-(W.t - W.won)) : 1;
      sliced('holder.' + it.rarity, 0, y, iw * pulse, (ITEM_H - 6) * pulse);
      const r = A[wheelIcon(it.res)];
      if (r) {
        const sc = (160 * 0.8 * pulse) / Math.max(r[2], r[3]);
        spr(wheelIcon(it.res), 0, y, r[2] * sc, r[3] * sc, -0.349);
      }
      spr('Nail', -iw / 2 + 45, y - ITEM_H / 2 - 2, 40, 40);
    }
    g.restore();
    sliced('Shadow', 0, 3.8, 286, 639.5);
    sliced('Reflect', 0, 212, 260, 200);
    // bolt lines (LuckyWheelBoltLineView: [ĐỀ XUẤT] a wave when idle, blinking while spinning, all lit after a win)
    const ys = column(652 + 185, BOLTS);
    const lit = (i) => (W.won >= 0 ? Math.floor((W.t - W.won) * 6) % 2 === 0 : W.spin ? (i + Math.floor(W.t * 10)) % 2 === 0
      : i === Math.floor(W.t * 4) % BOLTS.length);
    for (const side of [-1, 1]) {
      BOLTS.forEach((sz, i) => {
        const big = sz > 30, x = side * 178, y = -66.5 + ys[i];
        spr(big ? 'BoltBig_Off' : 'BoltSmallOff', x, y, sz, sz);
        if (lit(i)) spr(big ? 'BoltBig_On' : 'BoltSmallOn', x, y, big ? sz : sz * 1.2, big ? sz : sz * 1.2);
      });
    }
    // stars on top of the reel: pivot (0.5, 0.2), origin 12.8 above the inner top (y 330)
    [[-90, -5, 120], [0, 0, 200], [90, -5, 120]].forEach(([x, y, sz], i) => {
      const on = W.won >= 0 || (W.spin ? (i + Math.floor(W.t * 6)) % 2 === 0 : i === 1);
      spr(on ? 'StarsOn' : 'StarsOff', x, 342.8 + y, sz, sz, 0, 1, [0.5, 0.2]);
    });
    // arrow at the left of the reel, pivot (0.1, 0.6), kicked by the ticker
    spr('Arrow', -150, 4, 75, 75, (-W.angle * Math.PI) / 180, 1, [0.1, 0.6]);
    const tr = A.Title;
    spr('Title', 12.9, 480, 400, (400 * tr[3]) / tr[2]);
    spr('InfoButton', 195, 375, 55, 59);
    sliced('OutlinedButtonGold', 0, -397, 285, 120);
    // DOM buttons over their drawn rects
    Object.assign(spinBtn.style, { left: X(-142.5) + 'px', top: Y(-337) + 'px', width: 285 * k + 'px', height: 120 * k + 'px',
      fontSize: Math.max(16, 48 * k) + 'px' });
    spinBtn.querySelector('small').style.fontSize = Math.max(13, 36 * k) + 'px';
    Object.assign(infoBtn.style, { left: X(167.5) + 'px', top: Y(404.5) + 'px', width: 55 * k + 'px', height: 59 * k + 'px' });
    Object.assign(closeBtn.style, { bottom: 62.5 * k + 'px', height: 125 * k + 'px', fontSize: Math.max(18, 50 * k) + 'px' });
  }
}

// ---- Market: daily free coins and skip tickets ---------------------------------------------------------------------
// offer.free_coins (FREE, once a day: periodic daily.free_coins) and the skip ticket packs. The original sells the packs
// (and every other coin or ticket pack) for real money; here they cost coins ([ĐỀ XUẤT] price). Rewarded coins need an ad: not here.
export async function openMarket(app) {
  const { save } = app, bonus = await app.loadBonus();
  const sheet = sheetOverlay(app, 'market', 'Chợ');
  sheet.insertAdjacentHTML('beforeend', '<div class="scroll mk"></div>');
  const box = sheet.querySelector('.scroll');
  const offer = (ico, name, sub, btn, enabled, onclick) => {
    const row = document.createElement('div');
    row.className = 'offer';
    row.innerHTML = `<i></i><div class="nm">${name}<small>${sub}</small></div><button>${btn}</button>`;
    app.icon(row.querySelector('i'), ico, 52);
    const b = row.querySelector('button');
    b.disabled = !enabled;
    b.onclick = onclick;
    b.querySelectorAll('[data-ico]').forEach((i) => app.icon(i, i.dataset.ico, 18));
    box.appendChild(row);
    return row;
  };
  function render() {
    box.innerHTML = `<h3>Xu</h3>`;
    const ready = bonus.freeCoinsReady(save);
    offer('coinpile', `${bonus.d.offers.freeCoins} xu miễn phí`, 'Mỗi ngày một lần', ready ? 'Nhận' : 'Mai quay lại', ready, () => {
      const n = bonus.claimFreeCoins(save);
      if (!n) return;
      app.play('popup_in');
      app.writeSave();
      app.toast(`Nhận ${n} xu`);
      render();
    }).dataset.id = 'free_coins';
    box.insertAdjacentHTML('beforeend', `<h3>Vé bỏ qua · đang có <span class="tk">${qty(save, SKIP_TICKETS)}</span></h3>
      <p>Mỗi vé thay một lần xem quảng cáo của bản gốc: bỏ qua màn, mở hoặc nạp heo đất.</p>`);
    bonus.d.offers.tickets.forEach(([q, price], i) => {
      offer('ticket', `${q} vé`, 'Bản gốc: tiền thật', `${price}<i data-ico="coin"></i>`, save.coins >= price, () => {
        if (!bonus.buyTickets(save, i)) return;
        app.play('popup_in');
        app.writeSave();
        app.toast(`Nhận ${q} vé bỏ qua`);
        render();
      }).dataset.id = 'tickets_' + i;
    });
    sheet.querySelector('.c').textContent = save.coins;
  }
  render();
}
