// Meta menus, loaded on first open: game modes, Customization (skins / ropes / trails by collection), the XP road,
// the Lucky Wheel and the market (daily free coins, skip tickets).
// `app` is main.js's handle: save, meta, custom loader, overlay(), writeSave(), applyEquip(), hud(), icon(), ...
import { Renderer } from './render.js';
import { bake } from './fx.js';
import { XP_ROAD, SKIP_TICKETS, qty } from './meta.js';
import { MODES } from './modes.js';
import { artPage, spr, slice, label, glText, U, kitStyle } from './uikit.js';

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

const KIND_TABS = [['ropes', 'Dây'], ['skins', 'Skin'], ['trails', 'Vệt']]; // CategoriesToggles order
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

// GameModesPage (ui_pages_gamemodes): UIGradient #0082FF -> #00EAFF, Pattern_Game mode tiled, "Game Mode" title with
// GameModes_Icon, a scroll of GameModeItemUi cards (gamemodes_*_menuitem, 700 x 235): BG rounded_square_128px #4FC3FF
// (locked #B2B2B2), white line at 0.61-0.63, the mode's illustration masked under it, Frame_Mode_01 outline, icon + title
// + subtitle on top, Counter_01 (#045483) with the level; locked: BottomFrameLocked with the condition and Icon_Lock.
// The whole card is the button (BG Button); the web keeps a transparent "Chơi" button over it.
const MODE_ART = {
  'mode.adventure': ['IllustrationAdventure', 'Icon', 'Bạn đi được bao xa?'],
  'mode.grapple': ['IllustrationGrapple', 'Grapple_Icon', 'Lao thẳng tới mục tiêu'],
  'mode.challenge': ['IllustrationChallenge', 'IconChallenge completed', 'Không dễ đâu!'],
  'mode.pachinko': ['IllustrationPachinko', 'Icon_Pachinko', 'Thử vận may, thử tài!'],
  'mode.tournament': [null, 'Icon_Trophy', 'Đua với ghost của người chơi khác'],
  'mode.lucky_wheel': [null, 'Icon_LuckyWheel', 'Quay lấy quà'],
  'mode.normal': [null, 'Icon_Home', 'Các màn chính'],
};
const MODES_CSS = `
#modes .abody { margin: 0 ${U(24)} calc(env(safe-area-inset-bottom) + ${U(24)}); border-radius: ${U(30)}; background: rgba(35, 34, 122, .44);
  overflow: auto; padding: ${U(14)} ${U(12)}; gap: ${U(18)}; }
#modes .mode { position: relative; flex: none; width: 100%; max-width: ${U(700)}; height: ${U(235)}; margin: 0 auto; border-radius: ${U(26)};
  background: #4fc3ff; box-shadow: 0 ${U(8)} 0 rgba(0, 0, 0, .25); }
#modes .mode.off { background: #b2b2b2; }
#modes .mode.noill { height: ${U(100)}; }
#modes .mode.noill .line { display: none; }
#modes .mode.noill .ic { height: 70%; top: 12%; }
#modes .mode.noill .nm { top: 10%; height: 40%; }
#modes .mode.noill .sub { top: 58%; }
#modes .mode.noill .cnt { top: 22%; height: 46%; }
#modes .mode.noill .lockf { bottom: ${U(4)}; transform: scale(.8); }
#modes .mode .ill { position: absolute; left: ${U(2)}; right: ${U(2)}; bottom: 5%; height: 56%; border-radius: 0 0 ${U(20)} ${U(20)};
  background-size: 118% 298%; background-position: 50% 50%; }
#modes .mode.off .ill { filter: grayscale(1) brightness(1.05); opacity: .8; }
#modes .mode .line { position: absolute; left: ${U(6)}; right: ${U(6)}; top: 37%; height: 2%; background: #fff; }
#modes .mode .fr { position: absolute; inset: 0; }
#modes .mode .ic { position: absolute; left: 3%; top: 5%; width: 10%; height: 31%; filter: drop-shadow(0 ${U(3)} 0 rgba(0,0,0,.3)); }
#modes .mode .nm { position: absolute; left: 14%; top: 4%; height: 16%; display: flex; align-items: center; font-size: ${U(32)}; }
#modes .mode .sub { position: absolute; left: 14%; top: 22%; font: 800 ${U(20)}/1.2 system-ui, sans-serif; color: #045483; }
#modes .mode.off .sub { color: #5b5b5b; }
#modes .mode .cnt { position: absolute; right: 3%; top: 8%; min-width: 18%; height: 15%; border-radius: ${U(12)}; background: #045483;
  display: flex; align-items: center; justify-content: center; font-size: ${U(26)}; padding: 0 ${U(8)}; box-sizing: border-box; }
#modes .mode .lockf { position: absolute; left: 50%; bottom: ${U(36 - 22.5)}; width: ${U(330)}; height: ${U(45)}; margin-left: ${U(-165 - 7)};
  display: flex; align-items: center; justify-content: center; }
#modes .mode .lockf span { font-size: ${U(22)}; }
#modes .mode .lk { position: absolute; left: 50%; top: 50%; width: ${U(82 * 0.7)}; height: ${U(124 * 0.7)}; margin: ${U(-43 - 6)} 0 0 ${U(-29)}; }
#modes .mode > button { position: absolute; inset: 0; border: 0; background: none; color: transparent; font-size: 1px; cursor: pointer; }
#modes .mode > button:active ~ .fr { transform: scale(.98); }
`;

export async function openModes(app) {
  const { meta, save } = app;
  kitStyle();
  if (!document.getElementById('modesCss')) document.head.insertAdjacentHTML('beforeend', `<style id="modesCss">${MODES_CSS}</style>`);
  const { body, sh } = await artPage(app, 'modes', 'modes', { grad: 'linear-gradient(#0082ff, #00eaff)', pattern: 'Pattern_Game mode',
    patSize: 256, patAlpha: 0.08, title: 'Chế độ chơi', icon: 'GameModes_Icon' });
  for (const m of meta.d.modes) {
    const st = meta.modeState(save, m);
    const screen = SCREENS[st.id];
    const playable = st.open && (MODES[st.id] || screen);
    const [ill, ic, sub] = MODE_ART[st.id] || [null, null, 'Sự kiện theo mùa'];
    const row = document.createElement('div');
    row.className = 'mode' + (playable ? '' : ' off') + (ill ? '' : ' noill');
    row.dataset.id = st.id;
    row.innerHTML = `${ill ? '<i class="ill"></i>' : ''}<i class="line"></i><i class="fr"></i>${ic ? '<i class="ic"></i>' : ''}
      <b class="nm"></b><span class="sub"></span>`;
    if (ill) spr(row.querySelector('.ill'), sh, ill);
    slice(row.querySelector('.fr'), sh, 'Frame_Mode_01', 1);
    if (ic) spr(row.querySelector('.ic'), sh, ic === 'IconChallenge completed' && !playable ? 'IconChallengeLocked' : ic);
    const nm = row.querySelector('.nm');
    nm.textContent = st.name;
    row.querySelector('.sub').textContent = sub;
    if (playable) {
      const lv = MODES[st.id]?.slot?.(save);
      if (lv && st.id !== 'mode.tournament') {
        const c = document.createElement('b');
        c.className = 'cnt';
        c.textContent = (lv.level || 0) + 1;
        row.appendChild(c);
      }
      const b = document.createElement('button');
      b.textContent = 'Chơi';
      b.title = 'Chơi ' + st.name;
      b.onclick = () => {
        app.play('button');
        if (!screen) { app.openMode(st.id); return; }
        close(app, 'modes');
        screen.open(app);
      };
      row.appendChild(b);
    } else {
      row.insertAdjacentHTML('beforeend', '<div class="lockf st"><span></span></div><i class="lk"></i>');
      slice(row.querySelector('.lockf'), sh, 'BottomFrameLocked', 0.5);
      spr(row.querySelector('.lk'), sh, 'Icon_Lock');
      const t = row.querySelector('.lockf span');
      t.textContent = st.need ? (st.need.road === XP_ROAD ? `Cần ${st.need.value} XP` : `Hoàn thành màn ${st.need.value}`) : 'Sắp có';
      glText(app, t, 22);
    }
    body.appendChild(row);
    glText(app, nm, 32);
  }
}

// ---- customization -------------------------------------------------------------------------------------------------
// CustomizationPage (ui_pages_customization): the top third (anchors 0.67-1) is the preview: background2, ShinySun
// (#6BFCFF, turning), the skin in the middle (298 x 285), the rope and the trail in ShopTrailRopeHolder (#2E77B08D,
// 130 x 130) at 0.25 / 0.75 of the width. Under it, on #062452: ROPES / SKINS / TRAILS toggles (Button_ShopSelection /
// Unselected), the page numbers (Container_PageCollection, ContainerPage_Selected / Unselected) and the collections:
// yellow when complete, blue otherwise, with their count, and one ShopHolder / ShopLocked card per item by rarity.
// The web keeps every collection of a kind in one scroll; a page number scrolls to its collections (7 pages).
const SHOP_CSS = `
#shop .abody { background: #062452; }
#shop .top { position: relative; flex: none; height: ${U(300)}; overflow: hidden; }
#shop .top .bg2 { position: absolute; inset: 0; }
#shop .top .sun { position: absolute; left: 50%; top: 50%; width: ${U(520)}; height: ${U(520)}; margin: ${U(-260)} 0 0 ${U(-260)};
  animation: shopsun 12s linear infinite; opacity: .55; }
@keyframes shopsun { to { transform: rotate(360deg); } }
#shop .top canvas.pv { position: absolute; left: 50%; top: 50%; width: ${U(300)}; height: ${U(300)}; margin: ${U(-150)} 0 0 ${U(-150)}; }
#shop .top .hold { position: absolute; top: 50%; width: ${U(130)}; height: ${U(130)}; margin-top: ${U(-65)}; border-radius: ${U(30)};
  background: rgba(46, 119, 176, .55); }
#shop .top .hold canvas { position: absolute; inset: ${U(5)}; width: ${U(120)}; height: ${U(120)}; }
#shop .top .hold.r { left: calc(25% - ${U(30 + 65)}); }
#shop .top .hold.t { left: calc(75% + ${U(30 - 65)}); }
#shop .info { position: absolute; left: ${U(16)}; right: ${U(16)}; bottom: ${U(6)}; text-align: center; font: 800 ${U(21)}/1.2 system-ui, sans-serif;
  text-shadow: 0 ${U(2)} 0 #062452; }
#shop .info b { font-size: ${U(26)}; }
#shop .info .rar { margin-left: ${U(8)}; font-weight: 900; }
#shop .tabs { flex: none; display: flex; height: ${U(82)}; padding: ${U(6)} ${U(12)} 0; gap: ${U(4)}; }
#shop .tabs button { flex: 1; cursor: pointer; color: #fff; font: 900 ${U(30)} system-ui, sans-serif; -webkit-text-stroke: ${U(5)} #1a1c4b;
  paint-order: stroke fill; text-transform: uppercase; padding: 0 0 ${U(8)}; }
#shop .tabs button.on { transform: translateY(${U(-4)}); }
#shop .pages { flex: none; align-self: center; display: flex; gap: ${U(6)}; align-items: center; height: ${U(64)}; padding: 0 ${U(24)};
  margin: ${U(8)} 0; }
#shop .pages button { width: ${U(46)}; height: ${U(48)}; border: 0; cursor: pointer; font-size: ${U(26)}; color: #fff; padding: 0; }
#shop .scroll { flex: 1; overflow: auto; padding: ${U(4)} ${U(16)} calc(env(safe-area-inset-bottom) + ${U(30)}); }
#shop .col { position: relative; margin: 0 0 ${U(24)}; padding: ${U(78)} ${U(16)} ${U(22)}; }
#shop .col h3 { position: absolute; left: ${U(24)}; right: ${U(24)}; top: ${U(14)}; margin: 0; display: flex; align-items: center;
  justify-content: space-between; height: ${U(50)}; }
#shop .col h3 span { font-size: ${U(30)}; }
#shop .col h3 small { min-width: ${U(80)}; height: ${U(44)}; display: flex; align-items: center; justify-content: center; font-size: ${U(26)};
  padding: 0 ${U(8)}; }
#shop .cells { display: grid; grid-template-columns: repeat(3, 1fr); gap: ${U(18)}; }
#shop .cell { position: relative; aspect-ratio: 281 / 285; cursor: pointer; display: flex; flex-direction: column; align-items: center;
  justify-content: center; }
#shop .cell canvas { width: 70%; height: 70%; }
#shop .cell.locked canvas { opacity: .5; filter: grayscale(.7) brightness(.7); }
#shop .cell .t { position: absolute; left: 6%; right: 6%; bottom: 7%; text-align: center; font: 900 ${U(17)}/1.1 system-ui, sans-serif;
  color: #fff; -webkit-text-stroke: ${U(3)} #1a1c4b; paint-order: stroke fill; text-transform: uppercase; }
#shop .cell:not(.locked) .t { display: none; }
#shop .cell.sel { outline: ${U(6)} solid #fff; outline-offset: ${U(-2)}; border-radius: ${U(26)}; }
#shop .cell .eq { position: absolute; right: ${U(-8)}; top: ${U(-10)}; width: ${U(56)}; height: ${U(56)}; }
`;

export async function openShop(app) {
  const { meta, save, custom } = app;
  kitStyle();
  if (!document.getElementById('shopCss')) document.head.insertAdjacentHTML('beforeend', `<style id="shopCss">${SHOP_CSS}</style>`);
  const [{ body, sh }, icons] = await Promise.all([artPage(app, 'shop', 'shop', { grad: '#062452', title: 'Tuỳ biến',
    onClose: () => close(app, 'shop') }), custom.icons()]);
  body.innerHTML = `<div class="top"><i class="bg2"></i><i class="sun"></i><div class="hold r"><canvas></canvas></div>
    <canvas class="pv"></canvas><div class="hold t"><canvas></canvas></div><div class="info"><b></b><span class="rar"></span><div class="how"></div></div></div>
    <div class="tabs"></div><div class="pages"></div><div class="scroll"></div>`;
  spr(body.querySelector('.bg2'), sh, 'background2');
  spr(body.querySelector('.sun'), sh, 'ShinySun');
  const tabs = body.querySelector('.tabs'), list = body.querySelector('.scroll'), info = body.querySelector('.info');
  const pages = body.querySelector('.pages');
  slice(pages, sh, 'Container_PageCollection', 0.7);
  const state = { kind: 'skins', sel: meta.item('skins', save.equipped.skins) };
  for (const [kind, text] of KIND_TABS) {
    const b = document.createElement('button');
    b.textContent = text;
    b.dataset.kind = kind;
    b.onclick = () => { app.play('button'); state.kind = kind; state.sel = meta.item(kind, save.equipped[kind]); render(); };
    tabs.appendChild(b);
  }
  const preview = startPreview(app, body.querySelector('canvas.pv'), state);
  const holders = [...body.querySelectorAll('.hold canvas')];

  function showInfo() {
    const it = state.sel, rar = meta.d.rarities[it.rarity];
    info.querySelector('b').textContent = it.title;
    info.querySelector('.rar').textContent = rar[0];
    info.querySelector('.rar').style.color = rar[1];
    const owned = save.owned[it.kind].includes(it.name);
    const u = meta.unlockInfo(it);
    info.querySelector('.how').innerHTML = save.equipped[it.kind] === it.name ? 'Đang dùng'
      : owned ? 'Đã có. Chạm để dùng.'
        : rich(u.text || 'Locked') + (u.live ? '' : ' <small style="opacity:.7">(cách mở này sắp có ở bản web)</small>');
    preview.select(it);
    // the rope and trail holders show the selected (or equipped) rope and trail
    for (const [i, kind] of [[0, 'ropes'], [1, 'trails']]) {
      const pick = state.sel.kind === kind ? state.sel : meta.item(kind, save.equipped[kind]);
      const c = iconCanvas(icons, pick, 60);
      holders[i].width = c.width; holders[i].height = c.height;
      holders[i].getContext('2d').drawImage(c, 0, 0);
    }
  }

  function render() {
    for (const b of tabs.children) {
      b.classList.toggle('on', b.dataset.kind === state.kind);
      slice(b, sh, b.dataset.kind === state.kind ? 'Button_ShopSelection' : 'Button_ShopUnselected', 0.45);
    }
    list.innerHTML = '';
    pages.innerHTML = '';
    const cols = Object.entries(meta.d.collections).filter(([, c]) => c[1] === state.kind).sort((a, b) => a[1][2] - b[1][2] || a[1][3] - b[1][3]);
    // the original has 7 pages: the collections of a kind spread over at most 7 numbers
    let n = 0;
    const per = Math.max(1, Math.ceil(cols.length / 7));
    for (const [cid, c] of cols) {
      const items = meta.items.filter((it) => it.collection === cid && it.kind === state.kind);
      if (!items.length) continue;
      items.sort((a, b) => meta.d.rarityIds.indexOf(a.rarity) - meta.d.rarityIds.indexOf(b.rarity) || a.title.localeCompare(b.title));
      const have = items.filter((it) => save.owned[it.kind].includes(it.name)).length, full = have === items.length;
      const sec = document.createElement('div');
      sec.className = 'col';
      sec.innerHTML = `<h3><span></span><small></small></h3><div class="cells"></div>`;
      slice(sec, sh, full ? 'HolderCollection_01' : 'HolderGameMode_01', 0.7);
      const t = sec.querySelector('h3 span'), cnt = sec.querySelector('h3 small');
      t.textContent = c[0];
      cnt.textContent = `${have}/${items.length}`;
      cnt.title = c[4] ? `+${c[4]} XP khi đủ bộ` : '';
      spr(cnt, sh, full ? 'Container_CollectionNumberCompleted' : 'Container_CollectionNumber');
      const cells = sec.querySelector('.cells');
      for (const it of items) cells.appendChild(cell(it));
      if (n % per === 0) {
        const b = document.createElement('button'), page = n / per + 1;
        b.textContent = page;
        b.onclick = () => { app.play('button'); sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
        pages.appendChild(b);
      }
      n++;
      list.appendChild(sec);
      glText(app, t, 30);
      glText(app, cnt, 26);
    }
    const marks = [...pages.children];
    marks.forEach((b, i) => { spr(b, sh, i === 0 ? 'ContainerPage_Selected' : 'ContainerPage_Unselected'); glText(app, b, 26); });
    list.onscroll = () => {
      const secs = [...list.children], top = list.getBoundingClientRect().top;
      const at = Math.max(0, secs.findIndex((e) => e.getBoundingClientRect().bottom > top + 10));
      marks.forEach((b, i) => spr(b, sh, i === Math.floor(at / per) ? 'ContainerPage_Selected' : 'ContainerPage_Unselected'));
    };
    showInfo();
  }

  function cell(it) {
    const owned = save.owned[it.kind].includes(it.name), eq = save.equipped[it.kind] === it.name;
    const b = document.createElement('div');
    b.className = 'cell' + (owned ? '' : ' locked') + (state.sel === it ? ' sel' : '');
    b.dataset.id = it.id;
    b.title = it.title;
    spr(b, sh, (owned ? 'ShopHolder_' : 'ShopLocked_') + it.rarity);
    b.appendChild(iconCanvas(icons, it, 48));
    const t = document.createElement('div');
    t.className = 't';
    t.innerHTML = owned ? esc(it.title) : rich(meta.unlockInfo(it).text || 'Locked');
    b.appendChild(t);
    if (eq) { const e = document.createElement('i'); e.className = 'eq'; spr(e, sh, 'ValidateIcon_01'); b.appendChild(e); }
    b.onclick = () => {
      app.play('button');
      if (owned && !eq) {
        save.equipped[it.kind] = it.name;
        app.writeSave();
        app.applyEquip();
      }
      state.sel = it;
      const y = list.scrollTop;
      render();
      list.scrollTop = y;
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
    R.ctx.clearRect(0, 0, canvas.width, canvas.height); // over the page's preview background (CustomizationPage TopHolder)
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
// XpRoadPopup (ui_xproad_popup): UIGradient #DA73D6 (top) -> #3673C7, Pattern_Trophy tiled, a vertical scroller and the
// HomeButton 85 x 85 at (-60, 60) from the bottom right. No header in the original: the web keeps none either.
// Rows from the bottom (XpRoadPooledScroller): ElementStart (454 high, the first league under the first step), then one
// 300-high ElementReward (or ElementLeague when the step opens a league) per step. Each row's Bar (x 85, 47 wide,
// #2B247B) ends at the row top in an octagon 80 x 66 (Octogone_HolderTrophyRoad #4E47A1 in its outline #2B247B, the
// rank in Junegull 28 #A46AC7). Step i sits 33 units under its row top: Y(i) = 454 + 300 i - 33 from the bottom.
// The progress fill (#6DDCFF, right half #25CAFF, CursorTrophyRoad #6FDCFF at its tip) climbs between steps in
// proportion to the XP. Rewards hang on a link (#372B8582, 5 high) from the bar at 30 % of the width, centred on the
// step: TrophyRoadRewardBigUI (400 x 180: customization items and booster packs, on the rarity's XpRoadHolder),
// TrophyRoadRewardSmallUI (180 x 180: coins, single cards, tickets, flags) or TrophyRoadRewardModeUI (400 x 180: the
// mode's illustration, its name and "New Mode" / "New Challenge" in #FFC93D), frame rounded_square #372B85 at 50 %,
// IconValidate 60 x 60 on the top right once claimed (XpRoadSettings prefabs in the xproadconfig bundle).
//
// Opening: XpRoadPopup.OnShowEndedAsync [asm 0x1240a94..0x12413f8]. With pending XP (Meta.xpPending) the back button
// stays hidden, the XP flies in as Xp stars (XpRoadParticlesGenerator: StartPoint bottom centre -> EndPoint x 85, 30 %
// of the height) and the bar fills (AnimateAllXpProgress), then ProgressionRoadService.ClaimAllRewards [asm 0x1240c38],
// UpdateView, Task.Delay(600) [asm 0x1240e6c] and Close. Without pending XP: Delay(100) [asm 0x1241210], GoToLevel
// (0.45 s, [asm 0x1240d88]) to the current step and the back button shows.
// The same popup opens by itself (Meta.xpPending): main.js roadPopup after a level's end and on the home page.
// [ĐỀ XUẤT] star count min(10, XP gained), 0.06 s apart, 0.5 s flight, fill 0.6 s (clip 2026 0:15.8-0:17.4: ~1.6 s).
const ROW = 300, ROAD_START = 454, STEP_DY = 33, BAR_X = 85, CARD_X = 0.3;
const ROAD_CSS = `
#road { z-index: 6; }
#road header { display: none; }
#road .abody { overflow-y: auto; overflow-x: hidden; scrollbar-width: none; }
#road .abody::-webkit-scrollbar { display: none; }
#road .steps { position: relative; flex: none; width: 100%; }
#road .col { position: absolute; left: ${U(BAR_X - 23.5)}; width: ${U(47)}; bottom: ${U(-1000)}; background: #2b247b; }
#road .fill { position: absolute; left: ${U(BAR_X - 20.5)}; width: ${U(41)}; bottom: ${U(-1000)};
  background: linear-gradient(90deg, #6ddcff 50%, #25caff 50%); }
#road .fill .cur { position: absolute; left: 50%; top: 0; width: ${U(60)}; height: ${U(22)}; transform: translate(-50%, -50%);
  filter: drop-shadow(0 0 ${U(8)} #6fdcff); }
#road .oct { position: absolute; left: ${U(BAR_X - 40)}; width: ${U(80)}; height: ${U(66)}; }
#road .oct i { position: absolute; inset: 0; background-size: 100% 100%; }
#road .oct b { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
#road .oct.medal { left: ${U(BAR_X - 55)}; width: ${U(110)}; height: ${U(110)}; }
#road .link { position: absolute; left: ${U(BAR_X + 5)}; height: ${U(5)}; background: #372b8582; }
#road .rcard { position: absolute; height: ${U(180)}; }
#road .rcard .frame { position: absolute; inset: 0; background: #372b8580; border-radius: ${U(26)}; }
#road .rcard .hold { position: absolute; inset: ${U(8)}; background-size: 100% 100%; border-radius: ${U(20)}; overflow: hidden; }
#road .rcard .art { position: absolute; background-repeat: no-repeat; }
#road .rcard .t1, #road .rcard .t2 { position: absolute; left: 0; right: 0; display: flex; justify-content: center; }
#road .rcard .ok { position: absolute; width: ${U(60)}; height: ${U(60)}; }
#road .rcard .ok.pop { animation: roadOk .35s ease-out; }
@keyframes roadOk { 0% { transform: scale(0); } 70% { transform: scale(1.25); } 100% { transform: scale(1); } }
#road .lg { position: absolute; left: 0; right: 0; height: ${U(8)}; background: #ffffffcc; }
#road .lgm { position: absolute; width: ${U(180)}; height: ${U(180)}; transform: translateX(-50%); }
#road .lgn { position: absolute; transform: translateX(-50%); }
#road .home { position: absolute; right: ${U(60 - 42.5)}; bottom: calc(env(safe-area-inset-bottom) + ${U(60 - 42.5)}); width: ${U(85)};
  height: ${U(85)}; border: 0; padding: 0; background-color: transparent; cursor: pointer; z-index: 2;
  filter: drop-shadow(0 ${U(4)} 0 rgba(0,0,0,.35)); }
#road .stars { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
#road .stars i { position: absolute; width: ${U(70)}; height: ${U(70)}; margin: ${U(-35)} 0 0 ${U(-35)}; }
`;
const MEDAL = { Bronze: 'BronzeMedals_01', Silver: 'SilverMedals_01', Gold: 'GoldMedal_01', Platine: 'OtherMedals_01',
  Diamond: 'Diamond_Small', Master: 'Master_Small' };
const MODE_ILLU = { 'mode.challenge': 'RoadMode_challengeMode', 'mode.grapple': 'RoadMode_grappleMode',
  'mode.lucky_wheel': 'RoadMode_fortuneWheel', 'mode.tournament': 'RoadMode_tournamentMode', 'mode.pachinko': 'RoadMode_pachinkoMode',
  'mode.adventure': 'RoadMode_adventure' };

// A white sprite tinted (UI Image colour), as an image URL
const tints = new Map();
function tinted(sh, name, color) {
  const key = name + color;
  if (!tints.has(key)) {
    const r = sh.rects[name], c = document.createElement('canvas');
    c.width = r[2]; c.height = r[3];
    const g = c.getContext('2d');
    g.drawImage(sh.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, r[2], r[3]);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(sh.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    tints.set(key, c.toDataURL());
  }
  return `url(${tints.get(key)})`;
}

// TMP rich text "<color=#A3D6FF>Common</color> Booster" as a row of Junegull labels, one per colour run
function richRow(app, text, px) {
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: U(px * 0.3) });
  const re = /<color=(#[0-9a-fA-F]{6,8})>(.*?)<\/color>|([^<]+)/g;
  for (let m; (m = re.exec(text));) {
    const t = (m[2] ?? m[3]).trim();
    if (t) row.appendChild(label(app, t, px, m[1] ? m[1].slice(0, 7) : null));
  }
  return row;
}

// The card of one road step: [{el, ok}] (ok: where the check mark goes)
function roadCard(app, sh, icons, rewards, claimed) {
  const { meta } = app;
  const [res, q] = rewards[0];
  const kind = res.split('.')[0];
  const it = meta.byId.get(res);
  const booster = meta.d.boosters[res];
  const modeId = kind === 'mode' ? res : kind === 'unlocked_level_mode' ? 'mode.' + res.split('.')[1] : null;
  const big = !!(it || (booster && !res.endsWith('_single_card'))) || !!modeId;
  const el = document.createElement('div');
  const kind2 = modeId ? 'mode' : big ? 'big' : 'small';
  el.className = 'rcard rc-' + kind2; // not .big: index.html styles .big buttons
  el.dataset.kind = kind2;
  el.dataset.res = res;
  el.style.width = U(big ? 400 : 180);
  el.innerHTML = '<i class="frame"></i><div class="hold"></div>';
  const hold = el.querySelector('.hold');
  const art = (name, x, y, w, h) => {
    const a = document.createElement('i');
    a.className = 'art';
    Object.assign(a.style, { left: `calc(50% + ${U(x - w / 2)})`, top: `calc(50% + ${U(-y - h / 2)})`, width: U(w), height: U(h) });
    if (name) spr(a, sh, name);
    el.appendChild(a);
    return a;
  };
  const text = (cls, t, y, px, color) => {
    const d = document.createElement('div');
    d.className = cls;
    d.style.top = `calc(50% + ${U(-y - px * 0.6)})`;
    d.appendChild(t.includes('<color') ? richRow(app, t, px) : label(app, t, px, color));
    el.appendChild(d);
  };
  // CheckMark centre from the card centre (x right, y up): Big and Mode (190, 57), Small (72, 49)
  let okAt = [190, 57];
  if (modeId) {
    // TrophyRoadRewardModeUI: Mask 384 x 164 with the mode sprite, ModeName (22) at -54, the second line (30, #FFC93D) at -82
    hold.style.inset = U(8);
    spr(hold, sh, MODE_ILLU[modeId] || 'RoadMode_challengeMode');
    const name = modeName(meta, modeId);
    const lv = kind === 'unlocked_level_mode' ? meta.d.roads[XP_ROAD].filter(([v, rw]) => v <= stepValue(rewards) && rw.some(([r]) => r === res)).length : 0;
    text('t1', lv ? `${name} level ${lv}` : name, -54 + 6, 22);
    text('t2', lv ? 'New challenge' : 'New mode', -82 + 6, 30, '#FFC93D');
    okAt = [190, 57];
  } else if (big) {
    // TrophyRoadRewardBigUI: the rarity's XpRoadHolder; the item icon (BigRewardWithBackground, 230 at +50) or the
    // booster pack (BigRewardWithoutBackground, 160 x 150 at +25), the title (30) along the bottom
    const rar = it ? (it.rarity === 'ultimate' ? 'legendary' : ['epic', 'legendary'].includes(it.rarity) ? it.rarity : 'common') : booster[1].replace('welcome', 'epic');
    spr(hold, sh, 'XpRoadHolder_' + rar);
    if (it) {
      const a = art(null, 0, 20, 150, 150);
      const c = iconCanvas(icons, it, 75);
      Object.assign(c.style, { width: '100%', height: '100%' });
      a.appendChild(c);
    } else art(rar + '_nooutline', 0, 35, 150, 150 * (sh.rects[rar + '_nooutline'][3] / sh.rects[rar + '_nooutline'][2]));
    text('t1', it ? it.title : booster[0], -70, 30);
  } else {
    // TrophyRoadRewardSmallUI: SmallRewardCoinsPrize (SkinCoinsPile + the amount), a single card, tickets, a flag
    el.querySelector('.frame').style.background = '#372b8582';
    hold.style.display = 'none';
    if (res === 'currency.skin_coins') { art('SkinCoinsPile', 0, 10, 130, 128); text('t1', String(q), -62, 32); }
    else if (booster) {
      const rar = booster[1], n = rar + 'card_nooutline', r = sh.rects[n];
      art(n, 0, 12, 120 * (r[2] / r[3]), 120);
      text('t1', booster[0].replace(/ Card$/, ' card'), -70, 22);
    } else if (res === SKIP_TICKETS) { art('Ticket', 0, 12, 110, 89); text('t1', `x${q} tickets`, -70, 22); }
    else { const a = art(null, 0, 15, 90, 90); app.icon(a, res, 90 * (window.innerHeight / 1334)); text('t1', FLAGS[res] || res, -70, 18); }
    okAt = [72, 49];
  }
  const ok = document.createElement('i');
  ok.className = 'ok';
  Object.assign(ok.style, { left: `calc(50% + ${U(okAt[0] - 30)})`, top: `calc(50% + ${U(-okAt[1] - 30)})` });
  spr(ok, sh, 'IconValidate');
  ok.style.display = claimed ? '' : 'none';
  el.appendChild(ok);
  return el;
}
const stepValue = (rewards) => rewards.value;
function modeName(meta, id) { return meta.d.modes.find((m) => m[0] === id)?.[1] || id; }

// opts.auto: the automatic popup (main.js roadPopup). Resolves when the popup closes, with the rewards claimed.
export async function openRoad(app, opts = {}) {
  const { meta, save, custom } = app;
  kitStyle();
  if (!document.getElementById('roadCss')) document.head.insertAdjacentHTML('beforeend', `<style id="roadCss">${ROAD_CSS}</style>`);
  let finish;
  const closed = new Promise((r) => { finish = r; });
  const [{ el: page, body, sh }, icons] = await Promise.all([
    artPage(app, 'road', 'road', { grad: 'linear-gradient(#da73d6, #3673c7)', pattern: 'Pattern_Trophy', patSize: 256, patAlpha: 0.08,
      title: 'Đường XP' }), custom.icons()]);
  const steps = meta.xpRoad, n = steps.length;
  const Y = (i) => ROAD_START + ROW * i - STEP_DY;
  // the XP's height on the bar: between the steps it lies between, in proportion
  const yOf = (xp) => {
    let i = 0;
    while (i + 1 < n && steps[i + 1][0] <= xp) i++;
    if (i + 1 >= n) return Y(i);
    const k = Math.min(1, Math.max(0, (xp - steps[i][0]) / (steps[i + 1][0] - steps[i][0])));
    return Y(i) + ROW * k;
  };
  body.innerHTML = `<div class="steps" style="height:${U(ROAD_START + ROW * (n - 1) + 200)}"><i class="col"></i><i class="fill"><i class="cur"></i></i></div>`;
  page.insertAdjacentHTML('beforeend', '<button class="home" title="Đóng"></button><div class="stars"></div>');
  const list = body.querySelector('.steps'), fill = list.querySelector('.fill'), home = page.querySelector('.home');
  list.querySelector('.col').style.height = `calc(${U(1000)} + ${U(Y(n - 1))})`;
  spr(fill.querySelector('.cur'), sh, 'CursorTrophyRoad');
  spr(home, sh, 'Icon_Home');
  const octBg = `${tinted(sh, 'Octogone_HolderTrophyRoad', '#4e47a1')}, ${tinted(sh, 'Octogone_HolderTrophyRoadOutline', '#2b247b')}`;
  const cards = [];
  let league = '';
  function render(shownXp) {
    for (const e of list.querySelectorAll('.oct, .link, .rcard, .lg, .lgm, .lgn')) e.remove();
    cards.length = 0;
    const done = save.claimed[XP_ROAD] ?? -1, rank = meta.rankOf(shownXp);
    steps.forEach(([v, rewards, lg], i) => {
      const y = Y(i);
      if (lg) {
        league = meta.d.leagues[lg];
        // ElementStart / ElementLeague: LeagueHolder 30 under the row top (ElementStart: 154 from its bottom) with the
        // limit line (BarRankTrophyRoad, 8 high) on it, the medal 30 above it at x +50, the league name 35 under it
        const at = i === 0 ? 154 : y + STEP_DY - 30;
        if (i) { const l = document.createElement('i'); l.className = 'lg'; l.style.bottom = U(at - 8); list.appendChild(l); }
        const m = document.createElement('i');
        m.className = 'lgm';
        Object.assign(m.style, { left: `calc(50% + ${U(50)})`, bottom: U(at + 30 - 90) });
        spr(m, sh, MEDAL[league] || 'BronzeMedals_01');
        list.appendChild(m);
        const t = document.createElement('div');
        t.className = 'lgn';
        Object.assign(t.style, { left: `calc(50% + ${U(50)})`, bottom: U(at - 35 - 25) });
        t.appendChild(label(app, league, 40));
        list.appendChild(t);
      }
      const oct = document.createElement('div');
      oct.className = 'oct' + (i === rank ? ' medal' : '');
      oct.dataset.step = i;
      oct.style.bottom = `calc(${U(y)} - ${U(i === rank ? 55 : 33)})`;
      oct.innerHTML = '<i></i><b></b>';
      if (i === rank) spr(oct.firstChild, sh, MEDAL[meta.league(shownXp)] || 'BronzeMedals_01');
      else oct.firstChild.style.backgroundImage = octBg;
      oct.lastChild.appendChild(label(app, String(i), i === rank ? 34 : 28, i === rank ? null : '#A46AC7'));
      list.appendChild(oct);
      if (!rewards.length) return;
      const link = document.createElement('i');
      link.className = 'link';
      Object.assign(link.style, { bottom: U(y + 0.5), width: `calc(${CARD_X * 100}% - ${U(BAR_X + 5)})` });
      list.appendChild(link);
      const rw = Object.assign([...rewards], { value: v });
      const card = roadCard(app, sh, icons, rw, v <= done);
      Object.assign(card.style, { left: `${CARD_X * 100}%`, bottom: `calc(${U(y)} - ${U(90)})` });
      card.dataset.step = i;
      list.appendChild(card);
      cards.push([v, card]);
    });
  }
  const setFill = (xp) => { fill.style.height = `calc(${U(1000)} + ${U(yOf(xp))})`; };
  // scroll so the given height of the bar sits at 30 % of the view from the bottom (EndPoint anchor y 0.3)
  const scrollTo = (y) => {
    body.scrollTop = list.clientHeight - y * u() - body.clientHeight * 0.7;
  };
  const u = () => window.innerHeight / 1334;
  // data-state (and the data-states history, data-pend at opening) for the tests
  const mark = (st) => { page.dataset.state = st; page.dataset.states = (page.dataset.states ? page.dataset.states + ',' : '') + st; };
  const close = (got) => { mark('closed'); app.overlay('road', false); app.hud(); finish(got); };
  home.onclick = () => { app.play('popup_out'); close([]); };

  const pend = meta.xpPending(save), from = save.xp - pend;
  page.dataset.states = '';
  page.dataset.pend = pend;
  mark(pend ? 'animating' : 'browse');
  render(pend ? from : save.xp);
  setFill(pend ? from : save.xp);
  scrollTo(yOf(pend ? from : save.xp));
  if (!pend) {
    // SetBackButtonVisibility(true) after GoToLevel; nothing to claim
    home.style.display = '';
    page.dataset.home = 'shown';
    return closed;
  }
  home.style.display = 'none'; // SetBackButtonVisibility(false) while the XP animates
  page.dataset.home = 'hidden';
  // XpRoadParticlesGenerator: Xp stars from the bottom centre to the fill's tip, then the bar fills
  const stars = page.querySelector('.stars'), count = Math.min(10, pend);
  const tStart = performance.now(), FLY = 0.5, GAP = 0.06, FILL = 0.6;
  const t1 = FLY + GAP * (count - 1);
  const items = [];
  for (let k = 0; k < count; k++) { const s = document.createElement('i'); spr(s, sh, 'Xp'); s.style.display = 'none'; stars.appendChild(s); items.push(s); }
  await new Promise((done) => {
    const step = () => {
      const t = (performance.now() - tStart) / 1000, W = page.clientWidth, H = page.clientHeight;
      const ex = BAR_X * u(), ey = H * 0.7;
      items.forEach((s, k) => {
        const kt = (t - k * GAP) / FLY;
        if (kt < 0 || kt >= 1) { s.style.display = 'none'; return; }
        const e = 1 - (1 - kt) * (1 - kt), sx = W / 2, sy = H;
        // a curve bending left of the straight line (CurveProfile) [ĐỀ XUẤT]
        const x = sx + (ex - sx) * e - Math.sin(Math.PI * kt) * W * 0.15, y = sy + (ey - sy) * e;
        Object.assign(s.style, { display: '', left: x + 'px', top: y + 'px', transform: `scale(${1 - 0.4 * kt})` });
      });
      const kf = Math.min(1, Math.max(0, (t - FLY) / Math.max(FILL, t1 - FLY + 0.1)));
      const xp = from + pend * (1 - (1 - kf) * (1 - kf));
      setFill(xp);
      scrollTo(yOf(xp));
      page.dataset.xp = Math.round(xp);
      if (kf < 1) requestAnimationFrame(step); else { stars.innerHTML = ''; done(); }
    };
    requestAnimationFrame(step);
  });
  // ClaimAllRewards, then UpdateView: the newly claimed cards get their check mark
  const doneBefore = save.claimed[XP_ROAD] ?? -1;
  const { got } = meta.claimRoad(save);
  app.writeSave();
  const doneNow = save.claimed[XP_ROAD] ?? -1;
  for (const [v, card] of cards) {
    if (v <= doneBefore || v > doneNow) continue;
    const ok = card.querySelector('.ok');
    ok.style.display = ''; ok.classList.add('pop');
  }
  mark('claimed');
  page.dataset.claimed = save.claimed[XP_ROAD] ?? -1;
  for (const g of got) {
    if (g.item) app.toast('Mở khoá: ' + g.item.title);
    else if (g.unlocked && g.mode) app.toast('Chế độ mới: ' + modeName(meta, g.mode));
  }
  await new Promise((r) => setTimeout(r, 600)); // Task.Delay(600) [asm 0x1240e6c]
  close(got);
  return closed;
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
    launch(r);
  };
  // card.extra_lucky_wheel: after a claim, an automatic free spin (LuckyWheelPopup IsAutomatic, card popup first)
  function extraSpin() {
    const r = bonus.wheelFreeSpin(save);
    if (r.refused) return;
    app.cardsUi?.cardToast(app, 'card.extra_lucky_wheel');
    launch(r);
  }
  W.extraSpin = extraSpin;
  function launch(r) {
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
  }
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
        app.toast(s.r.empty ? 'Lượt quay thêm không phát thưởng (như bản gốc)'
          : 'Nhận: ' + meta.resTitle(s.r.reward.res) + (s.r.got.some((x) => x.later) ? ' (sắp có ở bản web)' : ''));
        refresh();
        if (s.r.extra) setTimeout(() => { if (document.getElementById('wheel')?.classList.contains('on')) extraSpin(); }, 1200);
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
    // boosters and the Black Market (js/cardsui.js, loaded now)
    const token = (render.n = (render.n || 0) + 1);
    const sec = document.createElement('div');
    sec.className = 'cardsec';
    box.appendChild(sec);
    app.loadCardsUi().then(() => { if (render.n === token) return app.cardsUi.marketSections(app, app.cards, sec, render); })
      .then(() => { sheet.querySelector('.c').textContent = save.coins; })
      .catch((e) => { sec.textContent = 'Không tải được Chợ Đen: ' + e.message; });
  }
  render();
}
