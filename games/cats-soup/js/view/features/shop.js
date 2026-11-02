// Feature "shop" (view part): HUD shop button (bt_shop), settings (bt_option), notices (bt_notice), the "more" quick menu
// (bt_more), the offline-earnings popup and the double-speed ad button. Rules: js/sim/features/shop.js, D:/catsoup-ref/rules/shop.md.
// Windows are the original prefabs (art/ui/panels: set_shop, set_option, set_notice, set_noticeviewer, set_quickmenu, set_offline)
// built with ctx.ng.build; list rows are DOM drawn with the original atlas sprites. Contract: js/view/registry.js.
import { find } from '../ngui.js';
import * as B from '../../sim/big.js';

const SAVE_KEY = 'cats-soup-v1';
const BTN = { shop: 'mainUI/set_topRight/buttons/bt_shop', option: 'mainUI/set_topRight/set_option/bt_option',
  notice: 'mainUI/set_topRight/set_option/bt_notice', more: 'mainUI/set_bottomRight/rightBottomSide/bt_more',
  speed: 'mainUI/set_bottomRight/set_dbSpeedBt', speedBt: 'mainUI/set_bottomRight/set_dbSpeedBt/bt_ads', speedEf: 'mainUI/set_bottomRight/set_dbSpeedEf' };
const HOURS = { 1101: 1, 1102: 3, 1103: 6, 1201: 1, 1202: 3, 1203: 6 };
const TABS = ['stamp', 'special', 'term', 'goods'];   // shop tabs t4 t1 t2 t3 of the prefab, left to right

let C, sim;                       // ctx and the sim feature
let P = {};                       // exported panels
let layer = null;                 // the open window: { el, root, holder, onClose }

const el = (cls = '', text = '', tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text) d.textContent = text; return d; };
const has = k => C.hud.lang[k] != null;
const tx = (k, fb, ...a) => (has(k) ? C.t(k, ...a) : fb);
const clock = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hoursText = n => C.t('hour', n);
const play = n => C.sound.play(n);

// ---- sprites ----
const atlasCache = new Map();
function atlasOf(name) {
  if (!atlasCache.has(name)) {
    let found = null;
    for (const [a, v] of Object.entries(C.ng.atlases)) if (v.sprites[name]) { found = a; if (a === 'atlas_ui1_atlas') break; }
    atlasCache.set(name, found);
  }
  return atlasCache.get(name);
}
function icon(name, cls = '') {
  const a = atlasOf(name);
  return a ? C.hud.sprite(a, name, cls) : el(`spr ${cls}`);
}
function skin(d, name) { const a = atlasOf(name); if (a) C.ng.paint(d, a, name, true); return d; }
const hide = (root, ...paths) => { for (const p of paths) { const n = find(root, p); if (n) n.style.display = 'none'; } };
const jfind = (node, path) => path.split('/').reduce((n, s) => n && (n.c || []).find(c => c.n === s), node);
function press(d, fn) { d.classList.add('sh-btn'); d.onclick = fn; return d; }
function setText(root, path, text) { const n = find(root, path); if (n && n.box) n.box.textContent = text; return n; }

// ---- windows ----
function closeLayer() {
  if (!layer) return;
  const l = layer;
  layer = null;
  if (l.onClose) l.onClose();
  l.el.remove();
}
// A full-screen layer over the HUD: a dim backdrop (tap to close) and a holder at the centre of the 1080x1920 screen.
function openLayer(node, { close = true, x = 0, y = 0 } = {}) {
  closeLayer();
  if (C.hud.panel) C.hud.close();
  const d = el('sh-layer');
  const dim = el('sh-dim');
  dim.onclick = closeLayer;
  const holder = el('sh-holder');
  const root = node ? C.ng.build(node) : el('sh-root');
  holder.appendChild(root);
  d.append(dim, holder);
  if (close) {
    const xb = el('sh-x', '×');
    xb.onclick = closeLayer;
    xb.style.left = `${x}px`;
    xb.style.top = `${y}px`;
    holder.appendChild(xb);
  }
  C.hud.el.appendChild(d);
  layer = { el: d, root, holder };
  return layer;
}
function dialog(message, yes, onYes) {
  const d = el('sh-confirm');
  const box = el('sh-confirm-box');
  box.appendChild(el('sh-msg', message));
  const row = el('sh-row');
  const no = press(skin(el('sh-b gray', C.t('cancel')), 'button_gray'), () => d.remove());
  const ok = press(skin(el('sh-b green', yes), 'button_green'), () => { d.remove(); onYes(); });
  row.append(no, ok);
  box.appendChild(row);
  d.appendChild(box);
  (layer ? layer.el : C.hud.el).appendChild(d);
}

// ---- what a good looks like ----
const EQUIP_ATLAS = { 0: 'atlas_equip1_atlas', 1: 'atlas_equip2_atlas', 2: 'atlas_equip3_atlas', 3: 'atlas_equip4_atlas' };
function equipSprite(index) {
  const e = C.game.t.Equip.find(x => x.index === index);
  const a = e && EQUIP_ATLAS[e.type];
  return a && C.ng.spriteInfo(a, e.resName) ? [a, e.resName, tx(`title_${e.resName}`, e.resName)] : null;
}
function describe(row) {
  const v = row.rewardValue, t = row.rewardType;
  if (t === 3) return { sprite: 'icon_gem', name: `${v} ${C.t('gem')}`, info: '' };
  if (t === 4) return { sprite: row.res, name: `${C.t('coin')} x${v}`, info: '' };
  if (t === 101) return { sprite: row.res, name: `${C.t('gold')} (${hoursText(v / 3600)})`, info: C.t('info_timeGold', hoursText(v / 3600)) };
  if (t === 102) return { sprite: row.res, name: `${C.t('energy')} (${hoursText(v / 3600)})`, info: C.t('info_timeEnergy', hoursText(v / 3600)) };
  if (HOURS[t]) {
    const gold = t < 1200;
    return { sprite: `ticket_${gold ? 'gold' : 'energy'}${HOURS[t]}`, name: C.t(gold ? 'ticketGold' : 'ticketEnergy', hoursText(HOURS[t])),
      info: C.t(gold ? 'info_ticketGold' : 'info_ticketEnergy', hoursText(HOURS[t])) };
  }
  if (t === 88) return { sprite: row.res, name: `${v} ${C.t('gem')}`, info: row.bonus ? `+${row.bonus} ${C.t('gem')}` : '' };
  if (t === 6) return { sprite: 'icon_furnitureshop', name: tx('saleFurniture', row.res), info: '' };
  if (row.pack) { // gem package: the outfit of its first equipment part gives the picture and, without a lang title, the name
    const eq = row.pack.find(([pt]) => pt === 5), q = eq && equipSprite(eq[1]);
    const gem = row.pack.filter(([pt]) => pt === 3).reduce((a, [, n]) => a + n, 0);
    return { sprite: row.res, equip: q, name: tx(`goods${row.index}_title`, q ? q[2] : row.res), info: gem ? `+${gem} ${C.t('gem')}` : '' };
  }
  // packages, subscriptions, specials: the original name and description of the goods
  return { sprite: row.res, name: tx(`goods${row.index}_title`, tx(`title_${row.res}`, tx(row.res, row.res))),
    info: tx(`goods${row.index}_info0`, tx(`info_${row.res}`, tx(`${row.res}_info0`, ''))) };
}
const priceIcon = costType => (costType === 3 ? 'icon_gem_s' : costType === 4 ? 'icon_coin_s' : HOURS[costType] ? `ticket_${costType < 1200 ? 'gold' : 'energy'}${HOURS[costType]}` : null);

function costButton(text, name, cls, fn) {
  const b = press(skin(el(`sh-b ${cls}`), name), fn);
  b.appendChild(text);
  return b;
}
const label = (txt, ico) => { const s = el('sh-lbl'); if (ico) s.appendChild(icon(ico, 'sh-mini')); s.appendChild(el('', txt, 'span')); return s; };

function gotToast(out) {
  const list = [].concat(out).filter(Boolean);
  if (!list.length) return;
  play('007_Powerup upgrade 35');
  const parts = list.map(o => {
    const n = (o.amount || o.value);
    if (o.type === 3) return `+${n} ${C.t('gem')}`;
    if (o.type === 4) return `+${n} ${C.t('coin')}`;
    if (o.type === 101) return `+${B.format(o.amount)} ${C.t('gold')}`;
    if (o.type === 102) return `+${B.format(o.amount)} ${C.t('energy')}`;
    if (HOURS[o.type]) return C.t(o.type < 1200 ? 'ticketGold' : 'ticketEnergy', hoursText(HOURS[o.type]));
    return `x${n}`;
  });
  C.hud.toast(parts.join('  '));
}

// ---- the shop ----
function shopCard(row, redraw) {
  const g = C.game;
  const d = el('sh-card');
  const info = describe(row);
  const ic = el('sh-pic');
  ic.appendChild(info.equip ? C.hud.sprite(info.equip[0], info.equip[1], 'sh-icon') : icon(info.sprite, 'sh-icon'));
  d.appendChild(ic);
  const txt = el('sh-txt');
  txt.append(el('', info.name, 'b'), el('', info.info, 'small'));
  d.appendChild(txt);
  const why = sim.blocked(g, row);
  let btn;
  if (why === 'iap') {
    // real money: shown disabled with the price of the table (Korean won, as in the prefab "₩6000")
    btn = costButton(label(`₩${row.cost}`), 'button_gray', 'off', () => C.hud.toast(tx('warning_noShopInfo', '')));
  } else if (why === 'owned') {
    btn = el('sh-done', '✔');
  } else if (why === 'unsupported') {
    btn = costButton(label(tx('notForSale', '—')), 'button_gray', 'off', () => C.hud.toast(tx('msg_notForSale', tx('notForSale', ''))));
  } else {
    const ad = row.costType === 9;
    const pay = ad ? label(C.t('showAds')) : label(String(row.cost), priceIcon(row.costType));
    btn = costButton(pay, ad ? 'button_green' : 'button_blue', why ? 'lack' : '', () => {
      const r = sim.buy(g, row.index);
      if (!r || r.why) {
        C.hud.toast(r && r.why === 'gem' ? C.t('msg_shortGem') : r && r.why === 'coin' ? C.t('msg_shortCoin') : r && r.why === 'ticket' ? C.t('msg_shortTicket') : '');
        return;
      }
      gotToast(r.given);
      redraw();
    });
  }
  d.appendChild(btn);
  return d;
}

function stampTab(list, redraw) {
  const g = C.game, s = g.state.shop;
  const head = el('sh-head');
  head.appendChild(icon('icon_stamp_b', 'sh-stamp'));
  const t = el('sh-txt');
  t.append(el('', `${C.t('stamp')}: ${s.stamps}`, 'b'), el('', C.t('info_guideStamp', g.data.shop.init.maxStampPerDay), 'small'));
  head.appendChild(t);
  head.appendChild(costButton(label(`${C.t('showAds')}  +${g.data.shop.init.perViewStamp}`), 'button_green', '', () => { if (sim.watchStamp(g)) redraw(); else C.hud.toast(C.t('msg_shortStamp')); }));
  list.appendChild(head);
  for (const row of sim.stampRows(g)) {
    const d = el('sh-card');
    const q = equipSprite(row.rewardValue);
    const ic = el('sh-pic');
    ic.appendChild(q ? C.hud.sprite(q[0], q[1], 'sh-icon') : icon('icon_unknown', 'sh-icon'));
    d.appendChild(ic);
    const txt = el('sh-txt');
    txt.append(el('', q && q[2] ? q[2] : `#${row.rewardValue}`, 'b'));
    d.appendChild(txt);
    const bought = s.adsBought[row.index];
    d.appendChild(bought ? el('sh-done', '✔') : costButton(label(String(row.require), 'icon_stamp_s'), 'button_blue', s.stamps >= row.require ? '' : 'lack', () => {
      const r = sim.buyStamp(g, row.index);
      if (r.why) return C.hud.toast(r.why === 'stamp' ? C.t('msg_shortStamp') : tx('notForSale', ''));
      play('007_Powerup upgrade 35');
      C.hud.toast(C.t('buy_complete'));
      redraw();
    }));
    list.appendChild(d);
  }
}

function openShop(tab = 'goods') {
  const g = C.game;
  const L = openLayer(P.shop.roots[0], { x: 400, y: -700 });
  const root = L.root;
  hide(root, 'OtherShopButton', 'WishlistButton', 'set_bottom', 'Texture', 'a/slide');
  // prefab tabs t4 t1 t2 t3 become: stamp rally, special, subscription, goods, spread over the 900 px of the frame
  const names = { t4: ['stamp', 'stamp'], t1: ['special', 'specialGoods'], t2: ['term', 'fixedtermGoods'], t3: ['goods', 'todayGoods'] };
  const tabEls = {};
  Object.entries(names).forEach(([n, [key, lang]], k) => {
    const e = find(root, `tabs/${n}`);
    tabEls[key] = e;
    e.style.left = `${-337 + k * 225}px`;
    for (const part of [find(e, 'bg'), find(e, 'txt')]) { part.box.style.width = '215px'; part.box.style.left = '-107px'; }
    const t = find(e, 'txt');
    t.box.textContent = C.t(lang);
    t.box.style.fontSize = '27px';
    t.box.style.textAlign = 'center';
  });
  const scroll = find(root, 'a/scroll');
  const list = el('sh-list');
  scroll.appendChild(list);
  let cur = tab;
  const draw = () => {
    const y = list.scrollTop;
    list.textContent = '';
    for (const [key, e] of Object.entries(tabEls)) {
      const bg = find(e, 'bg');
      if (bg) skin(bg.box, key === cur ? 'tab_on' : 'tab_off');
    }
    if (cur === 'stamp') stampTab(list, draw);
    else {
      const rows = sim.listed(g, cur === 'goods' ? 2 : cur === 'term' ? 1 : 0).filter(r => sim.blocked(g, r) !== 'unsupported');
      for (const r of rows) list.appendChild(shopCard(r, draw));
      if (!rows.length) list.appendChild(el('sh-empty', C.t('msg_noContext')));
    }
    list.scrollTop = y;
  };
  for (const [key, e] of Object.entries(tabEls)) {
    e.classList.add('btn');
    for (const w of e.querySelectorAll('.w')) { w.style.pointerEvents = 'auto'; w.style.cursor = 'pointer'; w.onclick = () => { cur = key; list.scrollTop = 0; draw(); }; }
  }
  draw();
  L.redraw = draw;
  L.onClose = () => { shopLayerRedraw = null; };
  shopLayerRedraw = draw;
}
let shopLayerRedraw = null;

// ---- settings ----
function openOption() {
  const L = openLayer(P.option.roots[0], { x: 330, y: -620 });
  const root = L.root;
  hide(root, 'tabs/t2', 'tabs/t3', 'tabs/t4', 'set1/set_sfx_food', 'set1/set_sfx_ui', 'set1/set_sfx_cat', 'set1/helper', 'set2', 'set3', 'set4');
  setText(root, 'set1/set_language/bt_language/title', 'Tiếng Việt');
  const par = jfind(P.option.roots[0], 'set2/set_par');
  const rows = [find(root, 'set1/set_bgm'), find(root, 'set1/set_sfx')];
  const sync = () => {
    for (const r of rows) {
      r.onoff[0].classList.toggle('sh-sel', C.sound.on);
      r.onoff[1].classList.toggle('sh-sel', !C.sound.on);
    }
  };
  rows.forEach((r, k) => {
    r.style.top = `${k * 130 + 40}px`;
    hide(r, 'slide');
    r.onoff = ['bt_on', 'bt_off'].map((n, i) => {
      const b = C.ng.build({ ...jfind(par, n), t: [i ? 120 : -50, 0] });
      for (const w of b.querySelectorAll('.w')) { w.style.pointerEvents = 'auto'; w.style.cursor = 'pointer'; }
      b.onclick = () => { if (C.sound.on !== !i) C.sound.toggle(); sync(); };
      r.appendChild(b);
      return b;
    });
  });
  sync();
  // reset save: the original "delete data" button and its confirm text (UI_Option.OnClick_DeleteOfflineData)
  const red = press(skin(el('sh-b red sh-reset', C.t('customer_option_bt3_offline')), 'button_red'), () => {
    dialog(C.t('info_deleteAccount_Offline'), C.t('ok'), resetSave);
  });
  L.holder.appendChild(red);
  const ver = el('sh-ver', `${C.t('version')}  5.3.0`);
  L.holder.appendChild(ver);
}

// Removes the local save and reloads. The page's own save timer and pagehide handler write the live state back, so the state
// they write is swapped for an empty one first (game.load starts a fresh game when the version differs).
function resetSave() {
  C.game.save = () => ({ v: 0, savedAt: Date.now() });
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage blocked */ }
  location.reload();
}

// ---- notices ----
function openNotice() {
  const g = C.game;
  const L = openLayer(P.notice.roots[0], { x: 390, y: -640 });
  const root = L.root;
  hide(root, 'tabs/t2', 'tabs/t3', 'ingameNotice', 'Label', 'a/slide');
  setText(root, 'txt_title', C.t('notice'));
  hide(root, 'a/scroll/txt_info');
  const list = el('sh-notice');
  find(root, 'a/scroll').appendChild(list);
  const groups = g.data.shop.notices;
  groups.forEach((n, i) => {
    const p = n.pages[0];
    const slot = C.ng.build(P.noticeslot.roots[0]);
    slot.style.left = '385px';
    slot.style.top = `${i * 130 + 60}px`;
    const tt = setText(slot, 'txt', tx(p.title, p.title));
    tt.box.style.fontSize = '28px';
    tt.box.style.whiteSpace = 'normal';
    for (const w of slot.querySelectorAll('.w')) { w.style.pointerEvents = 'auto'; w.style.cursor = 'pointer'; w.onclick = () => openNoticeViewer(n); }
    list.appendChild(slot);
  });
    const inner = el('sh-spacer');
  inner.style.height = `${groups.length * 130 + 20}px`;
  list.appendChild(inner);
}

function openNoticeViewer(group) {
  let i = 0;
  const L = openLayer(P.noticeviewer.roots[0], { x: 340, y: -580 });
  const root = L.root;
  for (const n of ['pt_shineStar', 'pt_shineStar (1)', 'txt_time', 'tag', 'list_noticeBanner', 'list__Notice_Link', 'list_noticeRoom', 'NoticeGroup_01', 'NoticeGroup_02',
    'NoticeGroup_03', 'bottom_box_01', 'bottom_box_02', 'pagination', 'NoticeReward']) hide(root, n);
  const body = el('sh-nbody');
  L.holder.appendChild(body);
  const left = find(root, 'bt_side/bt_l'), right = find(root, 'bt_side/bt_r');
  const show = () => {
    const p = group.pages[i];
    body.textContent = '';
    const img = el('sh-nimg', '', 'img');
    img.src = `${C.base}/art/shop/notice/${p.image}.webp`;
    body.appendChild(img);
    body.appendChild(el('sh-ntitle', tx(p.title, p.title)));
    body.appendChild(el('sh-ntext', tx(p.body, '')));
    if (group.pages.length > 1) body.appendChild(el('sh-npage', `${i + 1} / ${group.pages.length}`));
    left.style.display = i > 0 ? '' : 'none';
    right.style.display = i < group.pages.length - 1 ? '' : 'none';
  };
  for (const [b, d] of [[left, -1], [right, 1]]) {
    for (const w of b.querySelectorAll('.w')) { w.style.pointerEvents = 'auto'; w.style.cursor = 'pointer'; w.onclick = () => { i += d; show(); }; }
  }
  if (group.pages.length < 2) hide(root, 'bt_side');
  show();
}

// ---- the "more" quick menu: windows other features open ----
// An entry is shown only when the HUD button it stands for has a handler (its feature is installed), checked when the menu opens.
const handler = path => {
  const n = find(C.root, path);
  return n ? [...n.querySelectorAll('.w')].map(w => w.onclick).find(Boolean) || null : null;
};
function entries() {
  const own = {
    shop: () => openShop('goods'), stamp: () => openShop('stamp'), option: () => openOption(), notice: () => openNotice(),
  };
  const hud = (path, fb) => () => { const h = handler(path); if (h) h(); else if (fb) fb(); };
  return [
    { sec: 'cat', key: 'title_unitGift', sprite: 'icon_player', path: 'mainUI/set_bottomRight/rightBottomSide/bt_unitGift' },
    { sec: 'forest', key: 'title_build', sprite: 'icon_build', path: 'mainUI/set_bottomRight/bt_build' },
    { sec: 'forest', key: 'title_recipe', sprite: 'icon_recipe', path: 'mainUI/set_bottomRight/bt_recipe' },
    { sec: 'forest', key: 'title_forestdeco', sprite: 'icon_moveforest', run: () => (window.__move && C.hud.onMove ? C.hud.onMove() : null), ok: () => !!C.hud.onMove },
    { sec: 'forest', key: 'title_catTower', sprite: 'icon_town', path: 'mainUI/set_bottomRight/bt_catTower' },
    { sec: 'shop', key: 'shop', sprite: 'bt_shop', run: own.shop, ok: () => true },
    { sec: 'shop', key: 'title_adsShop', sprite: 'icon_stamp_b', run: own.stamp, ok: () => true },
    { sec: 'shop', key: 'tradingPost', sprite: 'icon_eventShop', path: 'mainUI/set_bottom/set_trader/anim/bt_trader' },
    { sec: 'etc', key: 'title_quest', sprite: 'icon_quest_s', path: 'mainUI/set_topRight/buttons/bt_quest' },
    { sec: 'etc', key: 'title_collection', sprite: 'icon_collection', path: 'mainUI/set_topRight/buttons/bt_collection' },
    { sec: 'etc', key: 'title_pictureBook', fallback: 'Sách tranh', sprite: 'bt_pictureBook', path: 'mainUI/set_topRight/buttons/bt_pictureBook' },
    { sec: 'etc', key: 'notice', sprite: 'icon_notice', run: own.notice, ok: () => true },
    { sec: 'etc', key: 'title_option', sprite: 'icon_option', run: own.option, ok: () => true },
    ...C.hud.menu,
  ].map(e => ({ ...e, run: e.run || hud(e.path), ok: e.ok || (e.path ? () => !!handler(e.path) : () => true) }));
}

function openMore() {
  const L = openLayer(P.quick.roots[0], { x: 380, y: -745 });
  const root = L.root;
  hide(root, 'set_moregame', 'set_sns', 'set_lineSticker', 'set_imessage', 'set_collabo', 'Texture', 'a');
  const all = entries().filter(e => e.ok() && (has(e.key) || e.fallback));
  const titles = { cat: 'cat', forest: 'manageForest', minigame: 'miniGame', shop: 'shop', etc: 'etc' };
  const host = el('sh-more-list');
  L.holder.appendChild(host);
  for (const sec of ['cat', 'forest', 'minigame', 'shop', 'etc']) {
    const list = all.filter(e => e.sec === sec);
    if (!list.length) continue;
    host.appendChild(el('sh-more-title', C.t(titles[sec])));
    const grid = el('sh-more-grid');
    for (const e of list) {
      const b = el('sh-more');
      b.appendChild(icon(e.sprite, 'sh-moreico'));
      b.appendChild(el('', has(e.key) ? C.t(e.key) : e.fallback, 'span'));
      press(b, () => { closeLayer(); e.run(); });
      grid.appendChild(b);
    }
    host.appendChild(grid);
  }
}

// ---- offline earnings ----
function openOffline(a) {
  const g = C.game;
  const L = openLayer(P.offline.roots[0], { close: false });
  const root = L.root;
  hide(root, 'title');
  const show = (path, ico, text) => {
    const n = find(root, path);
    n.box.textContent = text;
    const i = icon(ico, 'sh-off-ico');
    n.appendChild(i);
    return n;
  };
  show('num_gold', 'icon_gold', `+${B.format(a.gold)}`);
  show('num_heart', 'icon_energy', `+${B.format(a.energy)}`);
  const min = Math.floor(a.seconds / 60);
  const cap = (g.t.Init[0].value || 180) + (g.state.works.some(w => w.a === 102) ? 180 : 0);
  setText(root, 'num_time', min >= 60 ? `${hoursText(Math.floor(min / 60))} ${C.t('minute', min % 60)}` : C.t('minute', min));
  setText(root, 'set_progress/num', `${min} / ${cap}`);
  const gauge = find(root, 'set_progress/gauge');
  if (gauge) gauge.box.style.clipPath = `inset(0 ${100 - Math.min(100, (100 * min) / cap)}% 0 0)`;
  const earn = find(root, 'bt_earn'), ads = find(root, 'bt_earnAds');
  for (const w of earn.querySelectorAll('.w')) { w.style.pointerEvents = 'auto'; w.style.cursor = 'pointer'; w.onclick = closeLayer; }
  const at = setText(root, 'bt_earnAds/txt', C.t('getReward'));
  at.box.style.fontSize = '22px';
  setText(root, 'bt_earnAds/txt_ads', C.t('showAds'));
  hide(root, 'bt_earnAds/txt_adsT');
  const x2 = el('sh-x2', `x${C.game.data.shop.init.offlineAdsFactor}`);
  ads.appendChild(x2);
  for (const w of ads.querySelectorAll('.w')) {
    w.style.pointerEvents = 'auto';
    w.style.cursor = 'pointer';
    w.onclick = () => {
      const r = sim.claimOfflineAds(g);
      if (r) gotToast([{ type: 101, amount: r.gold }, { type: 102, amount: r.energy }]);
      closeLayer();
    };
  }
}

// ---- the feature ----
export default {
  id: 'shop',
  async mount(ctx) {
    C = ctx;
    sim = ctx.game.feat.shop;
    ctx.css('css/shop.css');
    const names = ['shop', 'option', 'notice', 'noticeslot', 'noticeviewer', 'quick', 'offline'];
    const files = ['set_shop', 'set_option', 'set_notice', 'set_noticeslot', 'set_noticeviewer', 'set_quickmenu', 'set_offline'];
    const got = await Promise.all(files.map(f => ctx.panel(f)));
    names.forEach((n, i) => { P[n] = got[i]; });
    ctx.hud.bind(BTN.shop, () => openShop('goods'));
    ctx.hud.bind(BTN.more, () => openMore());
    ctx.hud.bind(BTN.speedBt, () => this.startDouble());
    // set_option holds a sound toggle added by main.js on every widget; a capture listener on the group takes the two buttons first.
    const opt = find(ctx.root, 'mainUI/set_topRight/set_option');
    const own = (path, fn) => {
      const n = find(ctx.root, path);
      if (!n) return;
      n.classList.add('btn');
      for (const w of n.querySelectorAll('.w')) { w.style.pointerEvents = 'auto'; w.style.cursor = 'pointer'; }
      opt.addEventListener('click', e => { if (n.contains(e.target)) { e.stopPropagation(); fn(); } }, true);
    };
    own(BTN.option, openOption);
    own(BTN.notice, openNotice);
    const sp = find(ctx.root, BTN.speed);
    if (sp) {
      setText(sp, 'bt_ads/txt', ctx.t('doubleSpeedCook'));
      setText(sp, 'bt_ads/txt_ads', ctx.t('showAds'));
      hide(sp, 'bt_ads/txt_adsT', 'bt_ads/Sprite');
      // The longer Vietnamese lines keep inside the green button
      for (const [k, fs] of [['bt_ads/txt', 30], ['bt_ads/txt_ads', 27]]) { const b = find(sp, k).box; Object.assign(b.style, { width: '240px', left: '-120px', fontSize: `${fs}px`, textAlign: 'center' }); }
    }
    // Bottom right on the wooden bar like the original (centre 148 px in from the right edge, 75 px above the bottom; the prefab's own x is a design leftover)
    if (sp) { sp.style.left = '-132px'; sp.style.top = '-75px'; }
    this.speed = sp;
    this.ef = find(ctx.root, BTN.speedEf);
    const shopBtn = find(ctx.root, BTN.shop);
    this.dot = el('sh-dot');
    if (shopBtn) shopBtn.appendChild(this.dot);
    this.since = 1;
    this.ready = true;
    const a = sim.away(ctx.game);
    if (a) {
      ctx.hud.toastEl.classList.remove('on'); // main.js shows the same amounts as a toast; the popup replaces it
      openOffline(a);
    }
  },

  startDouble() {
    if (sim.startDouble(C.game)) C.hud.toast(C.t('msg_doubleSpeedStart'));
  },

  update(dt) {
    if (!this.ready) return;
    this.since += dt;
    if (this.since < 0.25) return;
    this.since = 0;
    const g = C.game;
    // double speed: the ad button while a cooking facility works and no boost runs, the countdown while it runs
    if (this.speed) this.speed.style.display = sim.doubleAvailable(g) ? '' : 'none';
    if (this.ef) {
      const left = sim.doubleLeft(g);
      this.ef.style.display = left > 0 ? '' : 'none';
      if (left > 0) setText(this.ef, 'Label', clock(left));
    }
    // red dot on the shop button while the daily free gems wait
    const free = sim.itemRow(g, 9);
    this.dot.style.display = free && !sim.blocked(g, free) ? 'block' : 'none';
  },

  onEvent(e) {
    if (e.type === 'doubleSpeedEnd') C.hud.toast(C.t('msg_doubleSpeedEnd'));
    if (shopLayerRedraw && (e.type === 'shopReset')) shopLayerRedraw();
  },
};
