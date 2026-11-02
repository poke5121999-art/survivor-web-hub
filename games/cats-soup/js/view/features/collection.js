// Feature "collection" (view part): the HUD buttons Bộ sưu tập (bt_collection) and the picture book (bt_pictureBook), and the
// item storage "Kho" (set_enterstorage -> set_storage). The frames are the original NGUI prefabs (art/ui/panels/set_collection,
// set_picturebook, set_storage, set_enterstorage); the rows are drawn with the game's atlas sprites and strings.
// Rules: js/sim/features/collection.js. Contract: js/view/registry.js.
import { find } from '../ngui.js';

const BTN_COLLECTION = 'mainUI/set_topRight/buttons/bt_collection';
const BTN_BOOK = 'mainUI/set_topRight/buttons/bt_pictureBook';
const UI1 = 'atlas_ui1_atlas';
// Collection.type tabs (UI_Collection: cat, fish, furniture, equipment) and PictureBookType tabs (UI_PictureBook.MenuText)
const COLLECTION_TABS = ['cat', 'fish', 'furniture', 'equipment'];
const BOOK_TABS = ['cat', 'equipment', 'furniture', 'FurnitureCattower', 'skin', 'timer'];
const ENTER = ['title_storage_category_01', 'title_storage_category_02', 'title_storage_category_03', 'title_storage_category_04', 'title_storage_category_05'];
const GOLD_TICKET = { 1101: 'ticket_gold1', 1102: 'ticket_gold3', 1103: 'ticket_gold6', 1201: 'ticket_energy1', 1202: 'ticket_energy3', 1203: 'ticket_energy6' };
const HOURS = { 1101: 1, 1102: 3, 1103: 6, 1201: 1, 1202: 3, 1203: 6 };
// Storage_item.LinkButtonDest that this build can reach: 100 gift shop, 31 aquarium (fishing view).
const HUD_DEST = { 100: 'mainUI/set_topRight/buttons/bt_shop' };

const el = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };

export default {
  id: 'collection',

  async mount(ctx) {
    this.ctx = ctx;
    this.game = ctx.game;
    this.sim = ctx.game.feat.collection;
    this.hud = ctx.hud;
    this.ng = ctx.ng;
    this.t = (key, fb, ...a) => (ctx.lang[key] != null ? ctx.t(key, ...a) : (fb ?? key));
    ctx.css('css/collection.css');
    this.el = el('cl');
    ctx.hud.el.appendChild(this.el);
    this.screen = null;
    this.since = 0;
    window.__collection = this;
    // the buttons first, the panels load behind them
    this.dots = {};
    for (const [key, path, fn] of [['collection', BTN_COLLECTION, () => this.open('collection')], ['book', BTN_BOOK, () => this.open('book')]]) {
      ctx.hud.bind(path, fn);
      const b = find(ctx.root, path);
      this.dots[key] = el('cl-dot', null, 'i');
      if (b) b.appendChild(this.dots[key]);
    }
    this.mountKho();
    const [collection, book, storage, enter] = await Promise.all(['set_collection', 'set_picturebook', 'set_storage', 'set_enterstorage'].map(n => ctx.panel(n)));
    this.tree = { collection, book, storage, enter };
    this.tab = { collection: 0, book: 0 };
  },

  update(dt) {
    this.since += dt;
    if (this.since < 0.5) return;
    this.since = 0;
    const s = this.sim, g = this.game;
    if (this.dots.collection) this.dots.collection.style.display = s.anyFresh(g) ? 'block' : 'none';
    if (this.dots.book) this.dots.book.style.display = s.bookDot(g) ? 'block' : 'none';
    if (this.screen === 'collection' || this.screen === 'book') this.refresh();
  },

  onEvent(e) {
    if (!this.screen) return;
    if (e.type === 'collection' || e.type === 'bookClaim' || e.type === 'reward') this.refresh();
  },

  // ---- screens ----
  open(name, arg) {
    if (!this.tree) return;
    this.close(true);
    this.screen = name;
    this.arg = arg;
    // each visit starts on the first tab that has something new (a NEW set / a claimable row), else the first
    const g = this.game, sim = this.sim;
    if (name === 'collection') this.tab.collection = Math.max(0, [0, 1, 2, 3].findIndex(i => sim.freshIn(g, i)));
    if (name === 'book') this.tab.book = Math.max(0, [0, 1, 2, 3, 4, 5].findIndex(i => sim.bookDot(g, i)));
    this.root = el('cl-screen');
    this.el.appendChild(this.root);
    this.el.classList.add('on');
    this.hud.close && this.hud.close();
    ({ collection: () => this.buildCollection(), book: () => this.buildBook(), enter: () => this.buildEnter(), storage: () => this.buildStorage() })[name]();
  },

  close(keep) {
    if (this.screen === 'collection') this.sim.clearFresh(this.game);   // UI_Collection.OnCloseUI -> ClearNewCollection
    if (this.root) this.root.remove();
    this.root = null;
    this.screen = null;
    if (!keep) this.el.classList.remove('on');
  },

  refresh() {
    ({ collection: () => this.drawCollection(), book: () => this.drawBook(), storage: () => this.drawStorage() })[this.screen]?.();
  },

  // ---- helpers ----
  node(tree) { const n = this.ng.build(tree.roots[0]); const w = el('cl-nroot'); w.appendChild(n); this.root.appendChild(w); return n; },
  text(n, path, s) { const x = typeof path === 'string' ? find(n, path) : path; if (x && x.box) x.box.textContent = s; return x; },
  btn(n, path, fn) {
    const x = typeof path === 'string' ? find(n, path) : path;
    if (!x) return null;
    x.classList.add('btn');
    for (const b of x.querySelectorAll('.w')) { b.style.pointerEvents = 'auto'; b.style.cursor = 'pointer'; b.onclick = e => { e.stopPropagation(); fn(e); }; }
    return x;
  },
  // the sprite `name` from whichever atlas holds it, fitted in a w x h box
  atlasOf(name) { return Object.keys(this.ng.atlases).find(a => this.ng.atlases[a].sprites[name]); },
  icon(name, w, h = w, atlas = null, cls = '') {
    const a = atlas && this.ng.spriteInfo(atlas, name) ? atlas : this.atlasOf(name);
    const d = this.hud.sprite(a || UI1, a ? name : 'icon_question', cls);
    const s = a && this.ng.spriteInfo(a, name);
    if (s) { const k = Math.min(w / s[2], h / s[3]); d.style.width = `${Math.round(s[2] * k)}px`; d.style.height = `${Math.round(s[3] * k)}px`; }
    else { d.style.width = `${w}px`; d.style.height = `${h}px`; }
    return d;
  },
  exitButton(fn) {
    const d = el('cl-exit btn');
    d.appendChild(this.hud.sprite(UI1, 'button_circle1', 'bg'));
    d.appendChild(this.hud.sprite(UI1, 'icon_exit', 'ic'));
    for (const c of d.children) { c.style.width = c.classList.contains('bg') ? '110px' : '80px'; c.style.height = c.classList.contains('bg') ? '110px' : '80px'; }
    d.onclick = fn;
    return d;
  },
  tabs(n, labels, current, dotOf, onPick) {
    labels.forEach((label, i) => {
      const tab = find(n, `tabs/t${i + 1}`);
      if (!tab) return;
      tab.style.display = '';
      this.text(n, `tabs/t${i + 1}/txt`, this.t(label));
      const bg = find(n, `tabs/t${i + 1}/bg`);
      if (bg && bg.box) this.ng.paint(bg.box, UI1, i === current ? 'tab_on' : 'tab_off', true);
      tab.classList.toggle('cl-tabdot', !!dotOf(i));
      if (!tab.dataset.bound) { tab.dataset.bound = 1; this.btn(n, tab, () => onPick(i)); }
    });
  },

  // ---- names and icons of the collected things ----
  furnitureRow(id) { return (this.game.t.Furniture || []).find(f => f.index === id); },
  equipRow(id) { return this.game.feat.equip && this.game.feat.equip.asset ? this.game.feat.equip.asset(this.game, id) : null; },
  nameOf(type, id) {
    const g = this.game;
    if (type === 0) return this.t(`catType${id}`, `#${id}`);
    if (type === 1) return this.t(`fish${id}`, `#${id}`);
    if (type === 3) { const a = this.equipRow(id); return a ? this.t(`title_${a.resName}`, a.resName) : `#${id}`; }
    if (type === 2) {
      const f = this.furnitureRow(id);
      if (!f) return `#${id}`;
      const base = f.resName.replace(/\d+$/, '');
      return [`title_${f.resName}`, f.resName, base].map(k => (this.ctx.lang[k] != null ? this.ctx.t(k) : null)).find(Boolean) || f.resName;
    }
    return `#${id}`;
  },
  itemIcon(type, id, size, owned) {
    let atlas = null, name = null;
    if (type === 0) { atlas = 'atlas_food_atlas'; name = `cat${id}`; }
    else if (type === 1) { atlas = 'atlas_shop_atlas'; name = `fish${id}`; }
    else if (type === 2) { const f = this.furnitureRow(id); name = f && f.resName; }
    else if (type === 3) { const a = this.equipRow(id); name = a && a.resName; }
    const box = el(`cl-ico ${owned ? 'yes' : 'no'}`);
    box.title = this.nameOf(type, id);
    if (name && (atlas ? this.ng.spriteInfo(atlas, name) : this.atlasOf(name))) box.appendChild(this.icon(name, size - 14, size - 14, atlas));
    else box.appendChild(this.icon('icon_question', size - 30, size - 30, 'atlas_furniture1_atlas'));
    return box;
  },
  abilityText(set) {
    const g = this.game, t = this.t;
    const ab = g.t.Ability.find(a => a.index === set.ability);
    if (!ab) return '';
    const v = `+${this.sim.abilityValue(g, ab, set.abilityLv)}%`;
    if (ab.type === 3) {
      const f = g.food.get(ab.subIndex);
      return t('ability3', null, f ? t(`name_${f.resName}`, f.resName) : `#${ab.subIndex}`, v);
    }
    if (ab.type === 11) return t(`abilityS_${ab.subIndex}`, null, v);
    return t('ability1', null, t(`title_build${ab.subIndex}`, `#${ab.subIndex}`), v);
  },

  // ===================================================== Bộ sưu tập
  buildCollection() {
    const n = this.node(this.tree.collection);
    this.ce = n;
    n.appendChild(el('cl-title', this.t('title_collection')));
    const a = find(n, 'a');
    this.list = el('cl-list');
    a.appendChild(this.list);
    const slide = find(n, 'a/slide');
    if (slide) slide.style.display = 'none';
    n.appendChild(this.exitButton(() => this.close()));
    n.lastChild.style.left = '-55px';
    n.lastChild.style.top = '700px';
    this.drawCollection();
  },

  drawCollection() {
    const n = this.ce, g = this.game, s = this.sim;
    if (!n) return;
    const type = this.tab.collection;
    this.tabs(n, COLLECTION_TABS, type, i => s.freshIn(g, i), i => { this.tab.collection = i; this.drawCollection(); this.list.scrollTop = 0; });
    this.list.textContent = '';
    const rows = s.sets(g).filter(c => c.type === type);
    const head = el('cl-txt');
    head.appendChild(el('', `${this.t('msg_collectionEffect')}  ${rows.filter(c => s.isComplete(g, c.index)).length}/${rows.length}`, 'b'));
    this.list.appendChild(head);
    head.style.padding = '0 8px';
    for (const c of rows) {
      const done = s.isComplete(g, c.index), have = s.have(g, c.index);
      const r = el(`cl-row ${done ? 'done' : ''} ${s.isFresh(g, c.index) ? 'fresh' : ''}`);
      const txt = el('cl-txt');
      txt.appendChild(el('', this.t(`collection${c.index}`, `#${c.index}`), 'b'));
      txt.appendChild(el('eff', this.abilityText(c), 'small'));
      r.appendChild(txt);
      const icons = el('cl-icons');
      c.ids.forEach((id, k) => icons.appendChild(this.itemIcon(c.type, id, 118, !!have[k])));
      r.appendChild(icons);
      r.appendChild(el(`cl-badge ${done ? 'done' : ''}`, done ? '✔' : `${have.filter(Boolean).length}/${c.ids.length}`));
      this.list.appendChild(r);
    }
  },

  // ===================================================== picture book
  buildBook() {
    const n = this.node(this.tree.book);
    this.be = n;
    n.classList.add('cl-book');
    n.appendChild(el('cl-title', this.t('title_pictureBook', 'Sách tranh')));
    const a = find(n, 'a');
    this.list = el('cl-list book');
    a.appendChild(this.list);
    // the prefab stacks tabs 4-7 on one spot: six tabs spread over the frame, the unused seventh hidden
    BOOK_TABS.forEach((_, i) => {
      const tab = find(n, `tabs/t${i + 1}`);
      if (tab) tab.style.left = `${-375 + i * 150}px`;
    });
    for (const x of n.querySelectorAll('[data-n="tabs"] > [data-n^="t"]')) if (x.dataset.n === 't7') x.style.display = 'none';
    for (let i = 1; i <= 6; i++) { const bg = find(n, `tabs/t${i}/bg`); if (bg) bg.style.transform = 'scale(0.72)'; }
    n.appendChild(this.exitButton(() => this.close()));
    n.lastChild.style.left = '-55px';
    n.lastChild.style.top = '700px';
    this.drawBook();
  },

  drawBook() {
    const n = this.be, g = this.game, s = this.sim;
    if (!n) return;
    const type = this.tab.book;
    this.tabs(n, BOOK_TABS, type, i => s.bookDot(g, i), i => { this.tab.book = i; this.drawBook(); this.list.scrollTop = 0; });
    this.list.textContent = '';
    const rows = s.bookRows(g, type);
    for (const row of rows) {
      const owned = s.bookOwned(g, row), claimed = s.bookClaimed(g, row), ready = s.bookReady(g, row);
      const r = el(`cl-row ${claimed ? 'done' : ''} ${ready ? 'fresh' : ''}`);
      const icons = el('cl-icons');
      row.ids.forEach((id, k) => icons.appendChild(this.itemIcon(type === 1 ? 3 : type === 0 ? 0 : type === 2 ? 2 : 9, id, 96, owned[k])));
      r.appendChild(icons);
      const txt = el('cl-txt');
      txt.appendChild(el('', row.ids.length === 1 ? (owned[0] ? this.nameOf(type === 1 ? 3 : type, row.ids[0]) : '???') : `${owned.filter(Boolean).length}/${owned.length}`, 'b'));
      if (row.ids.length === 1) txt.appendChild(el('', `${owned.filter(Boolean).length}/${owned.length}`, 'small'));
      r.appendChild(txt);
      const rw = el('cl-reward');
      rw.appendChild(this.icon(row.rewardType === 3 ? 'icon_gem' : 'icon_coin', 56, 56, UI1));
      rw.appendChild(el('', `x${row.rewardValue}`, 'span'));
      r.appendChild(rw);
      const b = el(`cl-btn ${claimed ? 'done' : ready ? '' : 'off'}`, claimed ? '✔' : this.t('getReward'));
      if (ready) b.onclick = () => { const out = s.claimBook(g, row.index); if (out) this.hud.toast(`+${row.rewardValue} 💎`); this.drawBook(); };
      r.appendChild(b);
      this.list.appendChild(r);
    }
    if (!rows.length) this.root.appendChild(el('cl-empty', '—'));
  },

  // ===================================================== Kho
  mountKho() {
    const b = el('cl-kho btn');
    b.appendChild(this.hud.sprite(UI1, 'button_circle1', 'bg'));
    b.appendChild(this.hud.sprite(UI1, 'bt_storage', 'ic'));
    b.firstChild.style.cssText = 'width:120px;height:120px';
    b.lastChild.style.cssText = 'width:92px;height:92px';
    b.title = this.t('title_storage');
    b.onclick = () => this.open('enter');
    this.hud.addMenu({ sec: 'etc', key: 'title_storage', sprite: 'bt_storage', run: () => this.open('enter') });
  },

  buildEnter() {
    const n = this.node(this.tree.enter);
    this.text(n, 'set_title/Label', this.t('title_storage'));
    this.text(n, 'set_title/Label (1)', '');
    const frame = find(n, 'bgFrame');
    const bts = [...frame.children].filter(c => c.dataset.n === 'bt');
    bts.forEach((b, i) => {
      const txt = find(b, 'txt');
      if (txt && txt.box) txt.box.textContent = this.t(ENTER[i]);
      if (i === 0) this.btn(n, b, () => this.open('storage'));
      else { b.classList.add('off'); for (const w of b.querySelectorAll('.w')) w.style.opacity = 0.5; this.btn(n, b, () => this.hud.toast(this.t(ENTER[i]))); }
    });
    const guide = find(n, 'bt_guide');
    if (guide) guide.style.display = 'none';
    n.appendChild(this.exitButton(() => this.close()));
    n.lastChild.style.left = '-55px';
    n.lastChild.style.top = '470px';
  },

  buildStorage() {
    const n = this.node(this.tree.storage);
    this.se = n;
    this.text(n, 'set_title/Label', this.t('title_storage'));
    this.text(n, 'set_title/Label (1)', this.t('title_storage_category_01'));
    const guide = find(n, 'bt_guide');
    if (guide) guide.style.display = 'none';
    const a = find(n, 'a');
    this.list = el('cl-list kho');
    a.appendChild(this.list);
    const slide = find(n, 'a/slide');
    if (slide) slide.style.display = 'none';
    this.empty = find(n, 'emptyText');
    if (this.empty) this.empty.style.display = 'none';
    n.appendChild(this.exitButton(() => this.open('enter')));
    n.lastChild.style.left = '-55px';
    n.lastChild.style.top = '525px';
    this.drawStorage();
  },

  // GetRewardIcon (DataManager.c:64764) per item type and the names the original shows for them
  itemLook(type) {
    const g = this.game, t = this.t;
    const k = {
      3: ['icon_gem', 'gem'], 88: ['icon_gem', 'gem'], 4: ['icon_coin', 'coin'], 96: ['icon_token', 'souvenirToken'], 98: ['icon_butterfly', 'butterfly'],
      99: ['icon_stamp', 'stamp'], 6001: ['icon_telescope_lens', 'title_telescopeLens'], 6002: ['icon_baitSp', 'title_baitSp'],
      23: ['fish100', 'catFood100'], 24: ['fish101', 'catFood101'],
    }[type];
    if (k) return { icon: k[0], name: t(k[1], k[1]) };
    if (GOLD_TICKET[type]) return { icon: GOLD_TICKET[type], name: t(type < 1200 ? 'ticketGold' : 'ticketEnergy', null, t('hour', null, HOURS[type])) };
    if (type >= 7102 && type <= 7109) return { icon: `fish${type - 7000}`, name: `${this.t('fish100', 'Bánh quy cá')} ${type - 7000}` };
    if (type >= 1401 && type <= 1408) return { icon: 'icon_ticket_01', name: `${t(type % 2 ? 'ticketObservatory' : 'ticketObservatorySp')} #${type - 1400}` };
    if (type >= 1501 && type <= 1524) return { icon: 'icon_ticket_01', name: `${t('ticketObservatory')} #${type - 1500}` };
    if (type >= 3002 && type <= 3013) return { icon: 'icon_treasure', name: `${t('travelItem')} #${type - 3000}` };
    return { icon: 'icon_treasure', name: `#${type}` };
  },

  drawStorage() {
    const n = this.se, g = this.game;
    if (!n) return;
    this.list.textContent = '';
    const rows = this.sim.storageRows(g);
    for (const { row, type, count } of rows) {
      const look = this.itemLook(type);
      const r = el(`cl-slot ${count < 1 ? 'zero' : ''}`);
      const ico = el('ico');
      ico.appendChild(this.icon(look.icon, 84, 84));
      r.appendChild(ico);
      r.appendChild(el('nm', look.name));
      r.appendChild(el('num', String(count)));
      const reach = HUD_DEST[row.dest] || (row.dest === 31 && window.__fishing);
      if (row.dest > 1 && row.link && this.ctx.lang[row.link] != null) {
        const go = el(`go ${reach ? '' : 'off'}`, this.t(row.link));
        if (reach) go.onclick = () => this.goTo(row.dest);
        r.appendChild(go);
      }
      this.list.appendChild(r);
    }
    if (!rows.length && this.empty) { this.empty.style.display = ''; }
  },

  goTo(dest) {
    if (dest === 31 && window.__fishing) { this.close(); window.__fishing.open('aquarium'); return; }
    const path = HUD_DEST[dest];
    if (!path) return;
    this.close();
    const b = find(this.ctx.root, path);
    const w = b && b.querySelector('.w');
    if (w && w.onclick) w.onclick();
  },
};

