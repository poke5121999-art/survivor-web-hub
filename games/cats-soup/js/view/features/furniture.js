// Feature "furniture" (view part): two HUD buttons (shop, mini room), the furniture shop panel (today's goods, catalog, sell) and the
// mini room editor of a cat as an overlay screen with a way back to the forest. Rules: js/sim/features/furniture.js,
// D:/catsoup-ref/rules/furniture.md. Art: art/furniture (tools/export_furniture.py), icons from atlas_furniture1/2_atlas.
import * as FU from '../../sim/features/furniture.js';
import { GLTFLoader } from '../../../vendor/GLTFLoader.js';
import MeshoptDecoder from '../../../vendor/meshopt_decoder.js';
import { loadLib } from '../world.js';
import { cellPos } from '../forest.js';

const ICON_ATLAS = ['atlas_furniture1_atlas', 'atlas_furniture2_atlas'];
// Catalog tab labels. The tab -> Furniture.type mapping is GameExtensions.EnableTabIndex; the label strings are inferred from the sub types.
const TAB_LABEL = ['furnitureType1', 'furnitureType2', 'furnitureType4', 'furnitureType7', 'furnitureType5'];
const PAGE = 40;
// Stage = the mini room in world units: wall 0.82 square centred at y 0.16, floor 0.82 x 0.41 centred at y -0.29 (inferred from the
// clamp ranges of UI_UnitInfo.CaculateFurniturePos and the 512x512 / 512x256 textures); K stage pixels per world unit.
const K = 1000, X0 = -0.41, Y1 = 0.57, W = 820, H = 1070;
const el = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };

export default {
  id: 'furniture',
  mount(ctx) {
    this.ctx = ctx;
    this.game = ctx.game;
    this.F = ctx.game.feat.furniture;
    ctx.css('css/furniture.css');
    this.cat = null;               // cat id shown in the room editor
    this.sel = null;               // selected item number in the room
    this.inTab = 0;                // inventory tab of the room editor
    this.cTab = 0; this.cAll = false; this.cPage = 0;   // catalog state
    this.sPage = 0;
    // In the original the shop is the facility (work 111, tapped) and rooms open per cat; the quick menu reaches both.
    this.shopBtn = el('fu-btn');
    ctx.hud.addMenu({ sec: 'forest', key: 'title_build111', sprite: 'icon_furnitureshop', run: () => this.openShop() });
    ctx.hud.addMenu({ sec: 'cat', key: 'makeRoom', sprite: 'icon_room', run: () => this.openRoom() });
    this.art = null;
    ctx.json('data/furniture.json').then(a => { this.art = a; if (this.room) this.drawRoom(); }).catch(() => { this.art = { items: {}, sheets: 0 }; });
    window.__furniture = this;
  },

  button(icon, label, top, fn) {
    const b = el('fu-btn btn', icon);
    b.style.top = `${top}px`;
    b.appendChild(el('', label, 'small'));
    b.onclick = fn;
    this.ctx.hud.el.appendChild(b);
    return b;
  },

  update(dt) {
    const w = this.game.state.works.find(x => x.a === FU.SHOP) || null;
    this.shopBtn.classList.toggle('lock', !w);
    this.shop3d(w, dt);
  },

  // The core's places.json only lists main-forest works (eventType 0), so work 111 (eventType 4) has no model there; the shop building
  // is exported to art/furniture/place111 and put on its cell from here (the tap still goes through game.workAt -> onTap).
  shop3d(w, dt) {
    const { view } = this.ctx;
    if (!w) { if (this.obj) { this.obj.removeFromParent(); this.obj = null; } return; }
    if (!this.lib) {
      this.lib = loadLib(this.ctx.base, 'furniture/place111', GLTFLoader, MeshoptDecoder).catch(() => null);
      this.lib.then(l => { this.libReady = l; });
    }
    if (!this.libReady) return;
    if (!this.obj) {
      try { this.obj = this.libReady.instantiate('places/place111'); } catch (e) { this.libReady = null; this.lib = Promise.resolve(null); return; }
      this.obj.scale.setScalar(0.01);
      this.obj.userData.workId = w.id;
      view.root.add(this.obj);
    }
    cellPos(w.pos[0], w.pos[1], this.obj.position);
    const sc = this.obj.scale.x;
    if (sc < 1) this.obj.scale.setScalar(Math.min(1, sc + (dt || 0.016) * 4));
  },

  onTap(work) {
    if (work.a !== FU.SHOP) return false;
    this.openShop();
    return true;
  },

  onEvent(e) {
    if (e.type === 'furnitureRestock' || e.type === 'furnitureBuy' || e.type === 'furnitureSell') {
      if (this.ctx.hud.panel && this.ctx.hud.panel.el.classList.contains('fu-panel')) this.ctx.hud.panel.refresh();
    }
  },

  // ---- icons ----
  icon(index, size = 120, cls = 'icon') {
    const r = this.F.row(this.game, index);
    const d = el(`spr ${cls}`);
    d.style.width = d.style.height = `${size}px`;
    if (!r) return d;
    const { ng } = this.ctx;
    const atlas = ICON_ATLAS.find(a => ng.spriteInfo(a, r.resName));
    if (atlas) ng.paint(d, atlas, r.resName, false);
    else { d.textContent = '🪑'; d.style.fontSize = `${size * 0.6}px`; d.style.textAlign = 'center'; }
    return d;
  },
  name(index) {
    const r = this.F.row(this.game, index);
    return r ? `${this.ctx.t(`furnitureType${r.subType}`)} #${index}` : '';
  },

  // ---- shop ----
  openShop() {
    const { hud, t } = this.ctx;
    if (!this.F.shopWork(this.game)) { this.openBuild(); return; }
    this.F.ensureDaily(this.game);
    const tabs = [{ key: 'daily', title: t('dailyFurniture') }, { key: 'catalog', title: t('catalog') }, { key: 'sell', title: t('sell') }];
    hud.open(t('title_build111'), '', tabs, (list, tab) => this[tab.key](list));
    hud.panel.el.classList.add('fu-panel');
  },

  // Work 111 needs work 14 and nothing else (Work.json), so the only gate is that the crane is built.
  openBuild() {
    const { hud, t } = this.ctx;
    hud.open(t('title_build111'), '', [{ title: t('furniture') }], list => {
      const row = el('row');
      row.appendChild(hud.sprite('atlas_build_atlas', 'build111', 'icon'));
      const txt = el('txt');
      txt.innerHTML = '<b></b><small></small>';
      txt.querySelector('b').textContent = t('title_build111');
      txt.querySelector('small').textContent = t('info_build111');
      row.appendChild(txt);
      const ok = this.F.canBuildShop(this.game);
      const b = el(`price ${ok ? '' : 'off'}`, ok ? t('title_build111') : `🔒 ${t('title_build14')}`);
      b.onclick = () => {
        if (!ok) { hud.toast(t('buildFurniture')); return; }
        const w = this.F.buildShop(this.game);
        if (w) { hud.close(); hud.onBuilt && hud.onBuilt(w); }
      };
      row.appendChild(b);
      list.appendChild(row);
    });
    hud.panel.el.classList.add('fu-panel');
  },

  coinRow(list) {
    const c = el('coin');
    c.innerHTML = `<span>🪑</span><b>${this.game.state.coin}</b>`;
    list.appendChild(c);
  },

  daily(list) {
    const { t, hud } = this.ctx;
    const g = this.game, S = g.state.furniture;
    this.coinRow(list);
    list.appendChild(el('say', t(`dialogue_furnitureShop${1 + (S.day.length + S.goods.length) % 3}`).split('(')[0].trim()));
    S.goods.forEach((_, k) => {
      const sl = this.F.slot(g, k);
      const row = el(`row ${sl.sold ? 'sold' : ''}`);
      row.dataset.k = k;
      row.appendChild(this.icon(sl.index, 130));
      const txt = el('txt');
      txt.innerHTML = '<b></b><small></small>';
      txt.querySelector('b').textContent = this.name(sl.index);
      txt.querySelector('small').textContent = sl.have ? '✔' : '';
      if (sl.row.eventType > 0) txt.appendChild(el('tag', t('info_furnitureToggle')));
      row.appendChild(txt);
      const buy = el(`price coin-p ${sl.sold || g.state.coin < sl.price ? 'off' : ''}`, sl.sold ? t('msg_alreadyPurchase') : String(sl.price));
      buy.onclick = () => {
        const r = this.F.buyDaily(g, k);
        if (r.ok) hud.toast(t('msg_purchase')); else if (r.why === 'coin') hud.toast(t('msg_shortCoin')); else if (r.why === 'sold') hud.toast(t('msg_alreadyPurchase'));
      };
      row.appendChild(buy);
      list.appendChild(row);
    });
    if (!S.goods.length) list.appendChild(el('say', t('msg_noFurniture')));
    list.appendChild(el('say', t('resetFurniture')));
    const bar = el('bar2');
    const ads = el(`price ${S.ads > 0 ? '' : 'off'}`, `▶ ${S.ads}/${FU.dailyAds(g)}`);
    ads.title = t('msg_ads_restock');
    ads.onclick = () => { if (!this.F.restock(g, 'ads').ok) hud.toast(t('msg_noPeriod')); };
    const gem = el(`price ${g.state.gem >= FU.RESTOCK_GEMS ? '' : 'off'}`, `💎 ${FU.RESTOCK_GEMS}`);
    gem.onclick = () => { if (!this.F.restock(g, 'gem').ok) hud.toast(t('msg_shortGem')); };
    bar.append(ads, gem);
    list.appendChild(bar);
  },

  catalog(list) {
    const { t, hud } = this.ctx;
    const g = this.game;
    this.coinRow(list);
    const sub = el('subtabs');
    TAB_LABEL.forEach((k, i) => {
      const d = el(i === this.cTab ? 'on' : '', t(k));
      d.onclick = () => { this.cTab = i; this.cPage = 0; hud.panel.refresh(); };
      sub.appendChild(d);
    });
    const tog = el(this.cAll ? 'on' : '', `${t('info_furnitureToggle')}: ${this.cAll ? t('furnitureToggle_on') : t('furnitureToggle_off')}`);
    tog.onclick = () => { this.cAll = !this.cAll; this.cPage = 0; hud.panel.refresh(); };
    sub.appendChild(tog);
    list.appendChild(sub);
    list.appendChild(el('say', t('info_orderFurniture')));
    const items = this.F.catalog(g, this.cTab, this.cAll);
    const grid = el('grid');
    for (const r of items.slice(this.cPage * PAGE, (this.cPage + 1) * PAGE)) {
      const ok = this.F.canOrder(r);
      const c = el(`cell ${ok && g.state.coin >= r.cost ? '' : 'off'}`);
      c.dataset.i = r.index;
      c.appendChild(this.icon(r.index, 120));
      c.appendChild(el('', ok ? `🪑 ${r.cost}` : '🔒', 'b'));
      if (this.F.count(g, r.index)) c.appendChild(el('', `x${this.F.count(g, r.index)}`, 'i'));
      c.onclick = () => {
        const res = this.F.buyCatalog(g, r.index);
        if (res.ok) { hud.toast(t('msg_purchase')); hud.panel.refresh(); } else hud.toast(res.why === 'coin' ? t('msg_shortCoin') : t('msg_notForSale'));
      };
      grid.appendChild(c);
    }
    list.appendChild(grid);
    if (items.length > PAGE) list.appendChild(this.pager(items.length, this.cPage, p => { this.cPage = p; hud.panel.refresh(); }));
  },

  sell(list) {
    const { t, hud } = this.ctx;
    const g = this.game;
    this.coinRow(list);
    list.appendChild(el('say', t('info_sellFurniture')));
    const stock = this.F.sellable(g);
    if (!stock.length) { list.appendChild(el('say', t('info_noFurn_inStore'))); return; }
    const grid = el('grid');
    for (const i of stock.slice(this.sPage * PAGE, (this.sPage + 1) * PAGE)) {
      const r = this.F.row(g, i);
      const c = el('cell');
      c.dataset.i = i;
      c.appendChild(this.icon(i, 120));
      c.appendChild(el('', `🪑 ${this.F.sellPrice(g, r)}`, 'b'));
      c.appendChild(el('', `x${this.F.count(g, i)}`, 'i'));
      c.onclick = () => {
        const res = this.F.sell(g, i, 1);
        if (res.ok) hud.toast(`+${res.coin} 🪑`);
        else hud.toast(t('msg_notForSale'));
      };
      grid.appendChild(c);
    }
    list.appendChild(grid);
    if (stock.length > PAGE) list.appendChild(this.pager(stock.length, this.sPage, p => { this.sPage = p; hud.panel.refresh(); }));
  },

  pager(total, page, go) {
    const pages = Math.ceil(total / PAGE);
    const p = el('pager');
    const prev = el('', '◀'), next = el('', '▶');
    prev.onclick = () => go((page + pages - 1) % pages);
    next.onclick = () => go((page + 1) % pages);
    p.append(prev, el('', `${page + 1}/${pages}`, 'span'), next);
    return p;
  },

  // ---- mini room ----
  openRoom(catId) {
    const g = this.game;
    this.ctx.hud.close();
    this.closeRoom();
    this.cat = catId && g.state.cats.some(c => c.id === catId) ? catId : (this.cat && g.state.cats.some(c => c.id === this.cat) ? this.cat : g.state.cats[0].id);
    this.sel = null;
    this.room = el('fu-room');
    this.ctx.hud.el.appendChild(this.room);
    this.drawRoom();
  },

  closeRoom() {
    if (this.room) this.room.remove();
    this.room = null;
    this.drag = null;
  },

  catName(c) { return this.ctx.t(`catType${c.type}`); },

  drawRoom() {
    if (!this.room) return;
    const { t, hud } = this.ctx;
    const g = this.game, F = this.F;
    const cat = g.state.cats.find(c => c.id === this.cat);
    const rm = F.room(g, this.cat);
    this.room.textContent = '';
    const head = el('head');
    head.appendChild(el('', t('title_miniRoom', this.catName(cat)), 'h1'));
    const x = el('x', '×');
    x.onclick = () => this.closeRoom();
    head.appendChild(x);
    this.room.appendChild(head);
    const cats = el('cats');
    for (const c of g.state.cats) {
      const d = el(c.id === this.cat ? 'on' : '', this.catName(c));
      d.dataset.id = c.id;
      d.onclick = () => { this.cat = c.id; this.sel = null; this.drawRoom(); };
      cats.appendChild(d);
    }
    this.room.appendChild(cats);

    // stage: wall, floor, then the pieces
    const stage = el('stage');
    this.stage = stage;
    const px = (wx, wy) => [(wx - X0) * K, (Y1 - wy) * K];
    const bg = (cls, index, cx, cy, ww, hh) => {
      const d = el(cls);
      const [lx, ty] = px(cx - ww / 2, cy + hh / 2);
      Object.assign(d.style, { left: `${lx}px`, top: `${ty}px`, width: `${ww * K}px`, height: `${hh * K}px`, backgroundImage: `url(${this.ctx.base}/art/furniture/bg/${index}.webp${globalThis.CS_V || ''})` });
      stage.appendChild(d);
    };
    bg('bgw', rm.wall, 0, 0.16, 0.82, 0.82);
    bg('bgf', rm.floor, 0, -0.29, 0.82, 0.41);
    const items = rm.items.slice().sort((a, b) => this.z(a) - this.z(b));
    for (const it of items) stage.appendChild(this.pieceEl(it));
    stage.addEventListener('pointerdown', e => { if (e.target === stage || e.target.classList.contains('bgw') || e.target.classList.contains('bgf')) { this.sel = null; this.drawActs(); this.markSel(); } });
    this.room.appendChild(stage);

    this.actsEl = el('acts');
    this.room.appendChild(this.actsEl);
    this.drawActs();

    const inv = el('inv');
    const sub = el('subtabs');
    TAB_LABEL.forEach((k, i) => {
      const d = el(i === this.inTab ? 'on' : '', t(k));
      d.onclick = () => { this.inTab = i; this.drawRoom(); };
      sub.appendChild(d);
    });
    inv.appendChild(sub);
    const cells = el('cells');
    const types = FU.TABS[this.inTab];
    const stock = Object.keys(g.state.furniture.inv).map(Number).filter(i => types.includes(F.row(g, i).type)).sort((a, b) => a - b);
    // The room's own floor and wall (Furniture 0 and 1) are always at hand (ChangeFurnitureData defaultCheck).
    if (this.inTab === 0 && rm.floor !== FU.DEFAULT.floor) stock.unshift(FU.DEFAULT.floor);
    if (this.inTab === 1 && rm.wall !== FU.DEFAULT.wall) stock.unshift(FU.DEFAULT.wall);
    if (!stock.length) cells.appendChild(el('none', t('msg_noFurniture')));
    for (const i of stock) {
      const c = el('fu-cell');
      c.dataset.i = i;
      c.appendChild(this.icon(i, 100));
      if (i > 1) c.appendChild(el('', `x${F.count(g, i)}`, 'i'));
      c.onclick = () => this.putFromStock(i);
      cells.appendChild(c);
    }
    inv.appendChild(cells);
    this.room.appendChild(inv);
  },

  z(it) {
    const r = this.F.row(this.game, it.a);
    if (r.type === 3) return 1;                       // carpets lie flat under everything
    if (r.type === 4) return 10;                      // wall pieces sit behind the floor furniture
    return 100 + Math.round((0.6 - it.y) * 1000);     // the lower on screen, the closer
  },

  // One placed piece: its sprite parts cut from the sheet (data/furniture.json: p = sheet, x, y, w, h, ox, oy, dw, dh, order, flip).
  pieceEl(it) {
    const d = el('it');
    d.dataset.n = it.n;
    d.style.zIndex = this.z(it);
    this.layoutPiece(d, it);
    d.onpointerdown = e => this.startDrag(e, it);
    return d;
  },

  layoutPiece(d, it) {
    const a = this.art && this.art.items[it.a];
    d.textContent = '';
    const [cx, cy] = [(it.x - X0) * K, (Y1 - it.y) * K];
    d.style.left = `${cx}px`;
    d.style.top = `${cy}px`;
    d.style.width = d.style.height = '0px';
    if (!a || !a.p) { d.appendChild(this.fallbackPart(it)); return; }
    for (const p of a.p) {
      const [sheet, sx, sy, sw, sh, ox, oy, dw, dh, order, flip] = p;
      const part = el('part');
      const f = (dw * K) / sw;
      const ofx = it.dir ? -(ox + dw) : ox;
      Object.assign(part.style, {
        position: 'absolute', left: `${ofx * K}px`, top: `${-(oy + dh) * K}px`, width: `${dw * K}px`, height: `${dh * K}px`, zIndex: order,
        backgroundImage: `url(${this.ctx.base}/art/furniture/sheet${sheet}.webp${globalThis.CS_V || ''})`,
        backgroundSize: `${this.art.sheet * f}px auto`, backgroundPosition: `${-sx * f}px ${-sy * f}px`,
        transform: (flip ^ it.dir) ? 'scaleX(-1)' : '', pointerEvents: 'auto',
      });
      d.appendChild(part);
    }
  },

  fallbackPart(it) {
    const f = el('part', '🪑');
    Object.assign(f.style, { position: 'absolute', left: '-40px', top: '-80px', fontSize: '80px', pointerEvents: 'auto' });
    return f;
  },

  startDrag(e, it) {
    e.preventDefault();
    e.stopPropagation();
    this.sel = it.n;
    this.markSel();
    this.drawActs();
    const rect = this.stage.getBoundingClientRect();
    const k = rect.width / W;
    const wx = (e.clientX - rect.left) / k / K + X0, wy = Y1 - (e.clientY - rect.top) / k / K;
    this.drag = { it, dx: it.x - wx, dy: it.y - wy, moved: false, k, rect };
    const move = ev => {
      const dr = this.drag;
      if (!dr) return;
      const mx = (ev.clientX - dr.rect.left) / dr.k / K + X0, my = Y1 - (ev.clientY - dr.rect.top) / dr.k / K;
      this.F.moveItem(this.game, this.cat, it.n, mx + dr.dx, my + dr.dy);
      dr.moved = true;
      const d = this.stage.querySelector(`.it[data-n="${it.n}"]`);
      if (d) { d.style.left = `${(it.x - X0) * K}px`; d.style.top = `${(Y1 - it.y) * K}px`; d.style.zIndex = this.z(it); }
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      this.drag = null;
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  },

  markSel() {
    if (!this.stage) return;
    for (const d of this.stage.querySelectorAll('.it')) d.classList.toggle('sel', +d.dataset.n === this.sel);
  },

  drawActs() {
    if (!this.actsEl) return;
    const { t, hud } = this.ctx;
    const g = this.game, F = this.F;
    const a = this.actsEl;
    a.textContent = '';
    const rm = F.room(g, this.cat);
    if (this.sel != null) {
      const flip = el('', '↔');
      flip.onclick = () => { F.flipItem(g, this.cat, this.sel); this.redrawPiece(); };
      const back = el('warn', '↩ ' + t('title_furnitureList'));
      back.dataset.act = 'back';
      back.onclick = () => { F.takeBack(g, this.cat, this.sel); this.sel = null; this.drawRoom(); };
      a.append(flip, back);
    }
    const all = el('', t('msg_furnitureKeepAll').split('\n')[0].replace(/\?$/, '').slice(0, 26) + '…');
    all.dataset.act = 'clear';
    all.onclick = () => { if (!rm.items.length) return; F.clearRoom(g, this.cat); this.sel = null; this.drawRoom(); };
    a.appendChild(all);
    a.appendChild(el('', `${rm.items.length}/${FU.ROOM_MAX + 1}`, 'span'));
  },

  redrawPiece() {
    const it = this.F.room(this.game, this.cat).items.find(q => q.n === this.sel);
    const d = this.stage.querySelector(`.it[data-n="${this.sel}"]`);
    if (it && d) this.layoutPiece(d, it);
  },

  putFromStock(i) {
    const { t, hud } = this.ctx;
    const g = this.game, F = this.F;
    const r = F.row(g, i);
    const range = FU.ROOM_Y[r.type];
    const y = range ? (range[0] + range[1]) / 2 : 0;
    const res = F.place(g, this.cat, i, 0, y, 0);
    if (!res.ok) { hud.toast(res.why === 'full' ? t('msg_limintFurniture') : t('msg_noFurniture')); return; }
    this.sel = res.item ? res.item.n : null;
    this.drawRoom();
    this.markSel();
  },
};
