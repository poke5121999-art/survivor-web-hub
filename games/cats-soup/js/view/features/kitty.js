// Feature "kitty" (view part): the kitty house window (ui/functionwork/set_kittyhome, set_select_destination,
// ui/kittyhouse/set_newdestination): send a kitty on a trip with travel items, collect the souvenirs, the travel album,
// magnets, the travel item shop and the dance stage. Drawn as DOM with the game's own atlas sprites and strings.
// Rules: js/sim/features/kitty.js and D:/catsoup-ref/rules/kitty.md. Contract: js/view/registry.js.
const FOOD = 'atlas_food_atlas', ITEM = 'atlas_item_atlas', UI1 = 'atlas_ui1_atlas', MAG = 'atlas_magnet_atlas', SHOP = 'atlas_shop_atlas';
const TABS = [['trip', 'sendTravel'], ['stage', 'title_build406'], ['album', 'travelAlbum'], ['magnet', 'Magnet_hud_09'], ['shop', 'title_build401']];
const el = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
const clock = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export default {
  id: 'kitty',

  mount(ctx) {
    this.ctx = ctx;
    this.game = ctx.game;
    this.K = ctx.game.feat.kitty;
    this.hud = ctx.hud;
    this.ng = ctx.ng;
    this.pop = null;
    this.tab = 'trip';
    this.house = 402;
    this.sel = [];           // chosen TravelItem indexes for the next trip
    this.acc = 0;
    ctx.css('css/kitty.css');
    // set_kittyhome is opened from the "more" menu (the facility itself is not in the 3D forest of this port).
    ctx.hud.addMenu({ sec: 'cat', key: 'title_build112', sprite: 'icon_trip', run: () => this.open() });
    window.__kitty = { open: tab => this.open(tab), close: () => this.close(), view: this };
  },

  // ---- text and sprites ----
  has(k) { return this.ctx.lang[k] != null; },
  t(key, fb, ...a) { return this.has(key) ? this.ctx.t(key, ...a) : (fb ?? key); },
  spr(atlas, name, h, cls = '') {
    const d = this.hud.sprite(atlas, name, cls);
    const i = this.ng.spriteInfo(atlas, name);
    if (i) { d.style.width = `${Math.round(i[2] * h / i[3])}px`; d.style.height = `${h}px`; } else { d.style.width = d.style.height = `${h}px`; }
    return d;
  },
  catIcon(type, h) { return this.spr(FOOD, `cat${type}`, h, 'ky-cat'); },
  itemIcon(it, h) { return this.spr(ITEM, `travel${it.index}`, h); },
  destName(d) { return this.t(`title_travelDestination${d}`, `#${d}`); },
  itemName(i) { return this.t(`title_travelItem${i}`, `#${i}`); },

  heart(k) {
    const h = this.K.heart(this.game, k);
    const g = el('ky-heart');
    g.appendChild(this.spr(UI1, 'icon_heart_s', 36));
    const bar = el('bar'), fill = el('fill');
    fill.style.width = h.need ? `${Math.round(h.into / h.need * 100)}%` : '100%';
    bar.appendChild(fill);
    bar.appendChild(el('lbl', `Lv.${h.level}${h.need ? `  ${h.into}/${h.need}` : '  MAX'}`));
    g.appendChild(bar);
    return g;
  },

  // A photo: the destination picture with the kitty of the trip standing in it (TravelPictureInfo: pose L/R, x offset, zoom).
  photo(ph, caption) {
    const d = el('ky-photo');
    d.style.backgroundImage = `url(${this.ctx.base}/art/kitty/dest/${ph.dest}.webp)`;
    const p = this.K.pic(this.game, ph.pic);
    const k = this.catIcon(ph.kitty, 100);
    const si = this.ng.spriteInfo(FOOD, `cat${ph.kitty}`);
    k.classList.add('k');
    k.style.width = 'auto';
    k.style.height = '';
    if (si) k.style.aspectRatio = `${si[2]} / ${si[3]}`;
    const left = Math.max(12, Math.min(88, 50 + (p ? p[2] : 0) / 512 * 100));
    k.style.left = `${left}%`;
    if (ph.pose.endsWith('R')) k.classList.add('flip');
    d.appendChild(k);
    if (caption) d.appendChild(el('cap', caption));
    return d;
  },

  // ---- window ----
  close() { if (this.pop) this.pop.remove(); this.pop = null; this.res = null; },
  open(tab) {
    if (tab) this.tab = tab;
    this.close();
    const pop = this.pop = el('ky-pop');
    const box = el('box');
    box.appendChild(el('ttl', this.t('title_build112')));
    const x = el('x', '×');
    x.onclick = () => this.close();
    box.appendChild(x);
    const tabs = el('tabs');
    for (const [id, key] of TABS) {
      const b = el(`tab${id === this.tab ? ' on' : ''}`, this.t(key));
      b.dataset.tab = id;
      b.onclick = () => { this.tab = id; this.draw(); };
      tabs.appendChild(b);
    }
    box.appendChild(tabs);
    this.body = el('body');
    box.appendChild(this.body);
    pop.appendChild(box);
    this.hud.el.appendChild(pop);
    this.tabsEl = tabs;
    this.draw();
  },
  draw() {
    if (!this.pop) return;
    for (const b of this.tabsEl.children) b.classList.toggle('on', b.dataset.tab === this.tab);
    this.body.textContent = '';
    this[`draw_${this.tab}`](this.body);
  },
  btn(text, cls, fn) {
    const b = el(`btn ${cls || ''}`, text);
    if (!/off/.test(cls || '')) b.onclick = fn;
    return b;
  },

  // ---- trip tab: the three houses, the items, send / cancel / collect ----
  draw_trip(body) {
    const K = this.K, g = this.game, s = g.state.kitty;
    const row = el('ky-houses');
    for (const w of K.HOUSES) {
      const k = K.inHouse(g, w), built = s.houses.includes(w);
      const c = el(`ky-house${w === this.house ? ' on' : ''}${built ? '' : ' lock'}`);
      c.dataset.house = w;
      c.appendChild(el('', this.t(`title_build${w}`)));
      if (k) { c.appendChild(this.catIcon(k.type, 120)); c.appendChild(el('', k.trip ? (K.tripDone(k) ? this.t('endTravel') : this.t('traveling', 'Đang đi')) : this.t(`catType${k.type}`))); }
      else c.appendChild(el('', built ? '' : '🔒'));
      c.onclick = () => { this.house = w; this.draw(); };
      row.appendChild(c);
    }
    body.appendChild(row);
    const w = this.house, k = K.inHouse(g, w);
    if (!k) {
      body.appendChild(el('note', this.t('msg_unbuildKittyHome')));
      if (K.canBuildHouse(g, w)) body.appendChild(this.btn(this.t('build'), 'green', () => { K.buildHouse(g, w); this.draw(); }));
      else body.appendChild(el('note', this.t(`title_build${K.HOUSES[K.HOUSES.indexOf(w) - 1]}`)));
      return;
    }
    const card = el('ky-card');
    const line = el('ky-line');
    line.appendChild(this.catIcon(k.type, 150));
    const txt = el('txt');
    txt.appendChild(el('', this.t(`catType${k.type}`)));
    txt.appendChild(this.heart(k));
    const ab = K.ability(g, K.HOUSES.indexOf(w) + 1);
    if (ab) {
      const col = ['tokenUp', 'butterflyUp', 'magnetUp'][ab.type - 1];
      txt.appendChild(el('', `${this.t(`KittyAbility${ab.type}`, ['', 'Kỷ Niệm Chương', 'Bướm vàng', 'Nam châm'][ab.type])} +${K.bonus(g, ab.type)}%`));
      txt.lastChild.title = col;
    }
    line.appendChild(txt);
    card.appendChild(line);
    // feed fish: hearts grow with Fish.heartValue
    const inv = g.state.fishing ? Object.entries(g.state.fishing.inv).filter(([, v]) => v.n - v.a >= 1) : [];
    if (inv.length) {
      const fr = el('ky-row');
      for (const [id, v] of inv.slice(0, 6)) {
        const f = el('ky-fish');
        f.dataset.fish = id;
        f.appendChild(this.spr(SHOP, `fish${id}`, 56));
        f.appendChild(el('', `×${v.n - v.a} ${this.t('feed', 'Cho ăn')}`));
        f.onclick = () => { if (K.feed(g, k.id, +id) != null) this.draw(); };
        fr.appendChild(f);
      }
      card.appendChild(fr);
    }
    body.appendChild(card);

    if (k.trip) {
      const c2 = el('ky-card');
      c2.appendChild(el('note', this.t(K.tripDone(k) ? 'completeTravel' : 'info_traveling')));
      const tm = el('ky-time', clock(k.trip.left));
      tm.dataset.tm = k.id;
      if (!K.tripDone(k)) c2.appendChild(tm);
      const used = el('ky-row');
      for (const i of k.trip.items) { const it = K.item(g, i); used.appendChild(this.itemIcon(it, 90)); }
      c2.appendChild(used);
      const bs = el('btns');
      if (K.tripDone(k)) bs.appendChild(this.btn(this.t('getReward'), 'green', () => this.claim(k)));
      else bs.appendChild(this.btn(this.t('cancelTravel'), 'red', () => { if (K.cancel(g, k.id)) this.draw(); }));
      c2.appendChild(bs);
      body.appendChild(c2);
      return;
    }
    // choose items: one of each type (TravelItem.type 0 snack, 1 essential, 2 transport ticket)
    this.sel = this.sel.filter(i => K.itemCount(g, i) >= 1);
    body.appendChild(el('note', this.t('info_sendTravel')));
    for (const type of [0, 1, 2]) {
      const c3 = el('ky-card');
      c3.appendChild(el('h3', this.t(`travelItemType${type}`)));
      const r = el('ky-row');
      for (const it of g.data.kitty.items.filter(x => x.type === type)) {
        const n = K.itemCount(g, it.index);
        const on = this.sel.includes(it.index);
        const c4 = el(`ky-item${on ? ' on' : ''}${n ? '' : ' none'}`);
        c4.dataset.item = it.index;
        c4.appendChild(this.itemIcon(it, 90));
        c4.appendChild(el('', this.itemName(it.index)));
        c4.appendChild(el('n', `×${n}`));
        if (n) c4.onclick = () => {
          this.sel = on ? this.sel.filter(i => i !== it.index) : [...this.sel.filter(i => K.item(g, i).type !== type), it.index];
          this.draw();
        };
        r.appendChild(c4);
      }
      c3.appendChild(r);
      const picked = this.sel.map(i => K.item(g, i)).find(x => x.type === type);
      if (picked) c3.appendChild(el('note', this.t(`info_travelItem${picked.index}`)));
      body.appendChild(c3);
    }
    const sec = K.tripSeconds(g, this.sel);
    body.appendChild(el('note', `⏱ ${clock(sec)}`));
    body.appendChild(this.btn(this.t('sendTravel'), 'green', () => { if (K.travel(g, k.id, this.sel)) { this.sel = []; this.draw(); } }));
  },

  // ---- result of a trip ----
  claim(k) {
    const r = this.K.collect(this.game, k.id);
    if (!r) return;
    this.draw();
    this.showResult(r);
  },
  showResult(r) {
    const K = this.K, g = this.game;
    if (this.res) this.res.remove();
    const pop = this.res = el('ky-pop res');
    const box = el('box');
    box.appendChild(el('ttl', this.t('completeTravel')));
    box.appendChild(this.photo(r.photo, this.destName(r.dest.index)));
    const line = el('ky-line');
    line.appendChild(this.spr(UI1, 'icon_token', 90));
    line.appendChild(el('', `${this.t('souvenirToken')} ×${r.tokens}`));
    box.appendChild(line);
    if (r.magnet) {
      const m = el('ky-line');
      m.appendChild(this.spr(MAG, r.magnet.res, 130));
      m.appendChild(el('', `${this.t('Magnet_hud_09')} — ${this.t('Magnet_hud_25')}`));
      box.appendChild(m);
    }
    const done = () => { pop.remove(); this.res = null; this.draw(); };
    if (g.state.kitty.pending) {
      const p = g.state.kitty.pending;
      box.appendChild(el('note', this.t('msg_updatetravelAlbum')));
      const both = el('ky-grid');
      for (const [ph, label, keep] of [[g.state.kitty.album[p.dest], this.t('info_oldtravelAlbum'), false], [p.photo, this.t('info_newtravelAlbum'), true]]) {
        const c = el('cell');
        c.appendChild(this.photo(ph));
        c.appendChild(this.btn(label, keep ? 'green' : '', () => { K.choosePhoto(g, keep); done(); }));
        both.appendChild(c);
      }
      both.style.gridTemplateColumns = '1fr 1fr';
      box.appendChild(both);
    } else {
      box.appendChild(this.btn(this.t('ok'), 'green', done));
    }
    pop.appendChild(box);
    this.hud.el.appendChild(pop);
  },

  // ---- dance stage ----
  draw_stage(body) {
    const K = this.K, g = this.game, s = g.state.kitty;
    body.appendChild(el('note', this.t('info_build406')));
    if (!s.stage) {
      const c = el('ky-card');
      c.appendChild(el('h3', this.t('title_build406')));
      c.appendChild(el('', `${this.t('gold')}: 1e25`));
      if (!K.stageNeedsBuilt(g)) c.appendChild(el('note', this.t('title_build22')));
      c.appendChild(this.btn(this.t('build'), K.canBuildStage(g) ? 'green' : 'off', () => { K.buildStage(g); this.draw(); }));
      body.appendChild(c);
      return;
    }
    for (const k of K.stageKitties(g)) {
      const c = el('ky-card');
      const l = el('ky-line');
      l.appendChild(this.catIcon(k.type, 120));
      const txt = el('txt');
      txt.appendChild(el('', this.t(`catType${k.type}`)));
      txt.appendChild(this.heart(k));
      l.appendChild(txt);
      c.appendChild(l);
      body.appendChild(c);
    }
    const cost = K.slotCost(g);
    if (cost != null) {
      const label = cost ? `${this.t('msg_kittyunlockalert')} 💎${cost}` : this.t('build');
      body.appendChild(this.btn(label, g.state.gem >= cost ? 'green' : 'off', () => { K.addStageKitty(g); this.draw(); }));
    }
  },

  // ---- album ----
  draw_album(body) {
    const K = this.K, g = this.game, s = g.state.kitty;
    const dests = g.data.kitty.dests;
    body.appendChild(el('note', this.t('Magnet_hud_17', 'Album {0}/{1}', K.albumList(g).length, dests.length)));
    const grid = el('ky-grid');
    for (const d of dests) {
      const ph = s.album[d.index];
      const c = el(`cell${ph ? '' : ' empty'}`);
      c.dataset.dest = d.index;
      if (ph) c.appendChild(this.photo(ph));
      else { const e = el('ky-photo'); e.style.backgroundImage = `url(${this.ctx.base}/art/kitty/dest/${d.index}.webp)`; c.appendChild(e); }
      c.appendChild(el('', ph ? this.destName(d.index) : '???'));
      grid.appendChild(c);
    }
    body.appendChild(grid);
  },

  // ---- magnets ----
  draw_magnet(body) {
    const K = this.K, g = this.game, s = g.state.kitty;
    body.appendChild(el('note', `${this.t('Magnet_hud_08')} ${Object.keys(s.magnets).length}/${g.data.kitty.magnets.length}`));
    const grid = el('ky-grid');
    for (const m of g.data.kitty.magnets) {
      const n = s.magnets[m.index] || 0;
      const c = el(`ky-mag${n ? '' : ' empty'}`);
      c.dataset.magnet = m.index;
      c.appendChild(this.spr(MAG, m.res, 150));
      c.appendChild(el('', this.destName(m.dest)));
      if (n) c.appendChild(el('n', `×${n}`));
      grid.appendChild(c);
    }
    body.appendChild(grid);
    body.appendChild(el('note', this.t('magnet_public_info01')));
  },

  // ---- travel item shop (work 401): items for golden butterflies ----
  draw_shop(body) {
    const K = this.K, g = this.game;
    const bal = el('ky-bal');
    bal.appendChild(this.spr(UI1, 'icon_butterfly', 70));
    bal.appendChild(el('', String(K.count(g, K.BUTTERFLY))));
    body.appendChild(bal);
    for (const type of [0, 1, 2]) {
      const c = el('ky-card');
      c.appendChild(el('h3', this.t(`travelItemType${type}`)));
      const r = el('ky-row');
      for (const it of g.data.kitty.items.filter(x => x.type === type)) {
        const ok = K.count(g, K.BUTTERFLY) >= it.price;
        const b = el(`ky-item${ok ? '' : ' none'}`);
        b.dataset.buy = it.index;
        b.appendChild(this.itemIcon(it, 90));
        b.appendChild(el('', this.itemName(it.index)));
        b.appendChild(el('n', `×${K.itemCount(g, it.index)}`));
        const p = el('p');
        p.appendChild(this.spr(UI1, 'icon_butterfly_s', 34));
        p.appendChild(el('', String(it.price), 'span'));
        b.appendChild(p);
        b.onclick = () => { if (K.buy(g, it.index, 1)) this.draw(); else this.hud.toast(this.t('msg_shortTravel')); };
        r.appendChild(b);
      }
      c.appendChild(r);
      body.appendChild(c);
    }
  },

  update(dt) {
    this.acc += dt;
    if (this.acc < 0.5 || !this.pop) return;
    this.acc = 0;
    const g = this.game;
    for (const n of this.pop.querySelectorAll('[data-tm]')) {
      const k = this.K.kitty(g, +n.dataset.tm);
      if (k && k.trip) { if (k.trip.left <= 0) this.draw(); else n.textContent = clock(k.trip.left); }
    }
  },
  onTap() { return false; },
  onEvent(e) {
    if (e.type === 'kittyReady') this.hud.toast(this.t('Travel_endPush', this.t('endTravel')));
    else if (e.type === 'kittyHeart') this.hud.toast(`${this.t(`catType${e.kitty.type}`)} Lv.${e.level}`);
  },
};
