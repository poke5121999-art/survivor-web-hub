// Meta menus, loaded on first open: game modes, Customization (skins / ropes / trails by collection) and the XP road.
// `app` is main.js's handle: save, meta, custom loader, overlay(), writeSave(), applyEquip(), hud(), icon(), ...
import { Renderer } from './render.js';
import { bake } from './fx.js';
import { XP_ROAD } from './meta.js';

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
export function openModes(app) {
  const { meta, save } = app;
  const sheet = sheetOverlay(app, 'modes', 'Chế độ chơi');
  const box = document.createElement('div');
  box.className = 'scroll';
  for (const m of meta.d.modes) {
    const st = meta.modeState(save, m);
    const row = document.createElement('div');
    row.className = 'mode' + (st.open ? '' : ' off');
    row.dataset.id = st.id;
    const ic = document.createElement('i');
    app.icon(ic, st.id, 52);
    if (!meta.d.menu[st.id]) Object.assign(ic.style, { width: '52px', height: '52px' });
    row.appendChild(ic);
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = st.name;
    row.appendChild(nm);
    if (st.open) {
      const b = document.createElement('button');
      b.textContent = 'Chơi';
      b.onclick = () => { app.play('button'); close(app, 'modes'); app.overlay('start', false); };
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
