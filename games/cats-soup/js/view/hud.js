// HUD on top of the rebuilt NGUI mainUI (art/ui/hud.json): currency counters, the food shelf on the wooden bar, the
// facility card, and the CRAFT / RECIPE panels. Panels are DOM drawn with the game's own atlas sprites and strings.
import * as B from '../sim/big.js';
import { find } from './ngui.js';

const TABS = [
  { key: 'cook', label: 'tab_buildType0', types: [1, 2] },
  { key: 'rest', label: 'tab_buildType1', types: [3] },
  { key: 'func', label: 'tab_buildType2', types: [4] },
];
const LINES = ['soup', 'juice', 'fry'];

export class Hud {
  constructor({ game, ng, root, lang, onBuilt }) {
    Object.assign(this, { game, ng, root, lang, onBuilt });
    this.el = document.createElement('div');
    this.el.className = 'hud';
    root.parentElement.appendChild(this.el);
    this.money = find(root, 'mainUI/set_top/topbar/set_money');
    const nums = [...this.money.children].filter(c => c.dataset.n === 'num');
    this.gold = nums[0].box;
    this.energy = nums[1].box;
    this.gem = nums[3].box;
    nums[4].style.display = 'none';
    // Event and IAP widgets of the original HUD that this build has no feature behind yet.
    for (const p of ['mainUI/set_top/NewContent', 'mainUI/set_top/set_newbieGuide', 'mainUI/set_top/set_buff', 'mainUI/set_topLeft/set_side',
      'mainUI/set_topRight/buttons/set_eventBox', 'mainUI/set_hideBottomLeft', 'mainUI/set_hideUI',
      'mainUI/set_bottomRight/bt_catTower/accReward']) {
      const n = find(root, p);
      if (n) n.style.display = 'none';
    }
    const speech = [...root.children].find(c => c.dataset.n === 'set_speech');
    if (speech) speech.style.display = 'none';
    this.catNum = find(root, 'mainUI/set_topLeft/set_cat/set_userProfileSlot/CatNum/num');
    this.bind('mainUI/set_bottomRight/bt_build', () => this.openBuild());
    this.bind('mainUI/set_bottomRight/bt_recipe', () => this.openRecipe());
    this.shelf = document.createElement('div');
    this.shelf.className = 'shelf';
    this.el.appendChild(this.shelf);
    this.card = document.createElement('div');
    this.card.className = 'card';
    this.el.appendChild(this.card);
    this.panel = null;
    this.selected = null;
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.el.appendChild(this.toastEl);
    this.expandBtn = document.createElement('div');
    this.expandBtn.className = 'expand btn';
    this.expandBtn.onclick = () => this.game.expand();
    this.el.appendChild(this.expandBtn);
    this.shelfKey = '';
    this.menu = [];
  }

  // Entries of the "more" quick menu (bt_more, built by the shop feature) for windows that have no HUD button of their
  // own in the original: { sec: 'cat' | 'forest' | 'minigame' | 'shop' | 'etc', key (lang) or fallback, sprite, run, ok? }.
  addMenu(entry) { this.menu.push(entry); }

  t(key, ...args) {
    let s = this.lang[key] ?? key;
    args.forEach((a, i) => { s = s.replace(`{${i}}`, a); });
    return s.replace(/\[[0-9a-fA-F]{6}\]|\[-\]|\[\/?c\]/g, '');
  }

  bind(path, fn) {
    const n = find(this.root, path);
    if (!n) return;
    n.classList.add('btn');
    for (const b of n.querySelectorAll('.w')) { b.style.pointerEvents = 'auto'; b.style.cursor = 'pointer'; b.onclick = fn; }
  }

  sprite(atlas, name, cls = '') {
    const d = document.createElement('i');
    d.className = `spr ${cls}`;
    this.ng.paint(d, atlas, name, false);
    return d;
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('on');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('on');
  }

  update() {
    const s = this.game.state;
    this.gold.textContent = B.format(s.gold);
    this.energy.textContent = B.format(s.energy);
    this.gem.textContent = String(s.gem);
    if (this.catNum && this.catNum.box) this.catNum.box.textContent = String(s.cats.length);
    const key = s.shelf.map(i => `${i.a}:${B.format(i.p)}`).join('|');
    if (key !== this.shelfKey) { this.shelfKey = key; this.drawShelf(); }
    if (this.selected) this.drawCard();
    const can = this.game.canExpand();
    this.expandBtn.style.display = can ? 'flex' : 'none';
    if (can) this.expandBtn.textContent = this.t('guide_expandNow');
  }

  drawShelf() {
    const g = this.game;
    this.shelf.textContent = '';
    g.state.shelf.forEach((item, i) => {
      const f = g.food.get(item.a);
      const d = document.createElement('div');
      d.className = 'dish';
      d.appendChild(this.sprite('atlas_food_atlas', f.resName, 'bowl'));
      const p = document.createElement('b');
      p.textContent = B.format(item.p);
      d.appendChild(p);
      d.onclick = () => { g.sell(i); this.shelfKey = ''; };
      this.shelf.appendChild(d);
    });
  }

  // Bottom-left card of the tapped facility: icon, level, upgrade price (as in the video, "Lv.91 / 18b").
  select(work) {
    this.selected = work;
    this.drawCard();
  }

  drawCard() {
    const g = this.game, w = this.selected;
    if (!w || !g.state.works.includes(w)) { this.card.style.display = 'none'; this.selected = null; return; }
    const a = g.work.get(w.a);
    const price = g.upgradePrice(w);
    const k = `${w.id}:${w.lv}:${B.format(price)}:${B.gte(g.state.gold, price)}`;
    if (this.card.dataset.k === k) return;
    this.card.dataset.k = k;
    this.card.textContent = '';
    this.card.style.display = 'flex';
    const lv = document.createElement('div');
    lv.className = 'lv';
    lv.textContent = `Lv.${w.lv}`;
    this.card.appendChild(lv);
    this.card.appendChild(this.sprite('atlas_build_atlas', `build${a.index}`, 'icon'));
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = this.t(`title_build${a.index}`);
    this.card.appendChild(name);
    const up = document.createElement('div');
    up.className = `up ${B.gte(g.state.gold, price) ? '' : 'off'}`;
    up.innerHTML = `<span>▲</span> ${B.format(price)}`;
    up.onpointerdown = e => { e.stopPropagation(); this.holdUpgrade(w); };
    this.card.appendChild(up);
    const x = document.createElement('div');
    x.className = 'x';
    x.textContent = '×';
    x.onclick = () => { this.selected = null; this.card.style.display = 'none'; };
    this.card.appendChild(x);
  }

  // Holding the upgrade button repeats it, faster the longer it is held (guide_longPress: "bạn có thể giữ nó!").
  holdUpgrade(w) {
    this.stopHold();
    const once = () => {
      if (this.game.upgrade(w, 1)) return true;
      this.toast(this.t('msg_shortGold'));
      this.stopHold();
      return false;
    };
    if (!once()) return;
    let delay = 400, n = 0;
    const next = () => { this.hold = setTimeout(() => { if (once()) { n++; delay = Math.max(40, 150 - n * 8); next(); } }, delay); };
    next();
    if (!this.holdEnd) {
      this.holdEnd = () => this.stopHold();
      addEventListener('pointerup', this.holdEnd);
      addEventListener('pointercancel', this.holdEnd);
    }
  }

  stopHold() { clearTimeout(this.hold); this.hold = null; }

  // ---- panels ----
  open(title, sub, tabs, draw) {
    this.close();
    const p = document.createElement('div');
    p.className = 'panel';
    p.innerHTML = `<div class="ttl"><h1></h1><h2></h2></div><div class="tabs"></div><div class="list"></div><div class="close">×</div>`;
    p.querySelector('h1').textContent = title;
    if (title.length > 14) p.querySelector('h1').classList.add('long');
    p.querySelector('h2').textContent = sub;
    p.querySelector('.close').onclick = () => this.close();
    const tabEl = p.querySelector('.tabs');
    const list = p.querySelector('.list');
    let cur = 0;
    const show = i => {
      cur = i;
      [...tabEl.children].forEach((t, k) => t.classList.toggle('on', k === i));
      list.textContent = '';
      draw(list, tabs[i]);
    };
    tabs.forEach((t, i) => {
      const b = document.createElement('div');
      b.textContent = t.title;
      b.onclick = () => show(i);
      tabEl.appendChild(b);
    });
    this.el.appendChild(p);
    this.panel = { el: p, refresh: () => { const y = list.scrollTop; show(cur); list.scrollTop = y; } };
    show(0);
  }

  close() {
    if (this.panel) this.panel.el.remove();
    this.panel = null;
  }

  // CRAFT: facilities in table order up to the first one never built (the next one to buy); later rows stay locked.
  openBuild() {
    const g = this.game;
    const tabs = TABS.map(t => ({ ...t, title: this.t(t.label) }));
    this.open(this.t('title_build'), '', tabs, (list, tab) => {
      if (this.onMove) {
        const mv = document.createElement('div');
        mv.className = 'row move btn';
        mv.appendChild(this.sprite('atlas_ui1_atlas', 'icon_forest_exit', 'icon'));
        const b = document.createElement('b');
        b.textContent = this.t('title_forestdeco');
        mv.appendChild(b);
        mv.onclick = () => this.onMove();
        list.appendChild(mv);
      }
      const all = g.buildList();
      const frontier = all.findIndex(o => o.n === 0);
      let lockedShown = false;
      all.forEach((o, i) => {
        if (!tab.types.includes(o.w.type)) return;
        if (frontier >= 0 && i > frontier) {
          if (lockedShown) return;
          lockedShown = true;
          const row = document.createElement('div');
          row.className = 'row locked';
          const first = all[frontier].w;
          row.textContent = `🔒 ${this.t(`title_build${first.index}`)}`;
          list.appendChild(row);
          return;
        }
        const row = document.createElement('div');
        row.className = 'row';
        row.appendChild(this.sprite('atlas_build_atlas', `build${o.w.index}`, 'icon'));
        const txt = document.createElement('div');
        txt.className = 'txt';
        txt.innerHTML = '<b></b><small></small>';
        txt.querySelector('b').textContent = this.t(`title_build${o.w.index}`);
        txt.querySelector('small').textContent = this.t(`info_build${o.w.index}`);
        row.appendChild(txt);
        const right = document.createElement('div');
        right.className = 'buy';
        const cnt = document.createElement('i');
        cnt.textContent = `${o.n}/${Math.max(o.max, 1)}`;
        right.appendChild(cnt);
        if (o.n < o.max) {
          const btn = document.createElement('div');
          const ok = g.canBuild(o.w.index);
          btn.className = `price ${ok ? '' : 'off'}`;
          btn.textContent = o.w.costGem ? `💎 ${o.w.costGem}` : B.format(o.price);
          btn.onclick = () => {
            const placed = g.build(o.w.index);
            if (placed) { this.close(); this.onBuilt && this.onBuilt(placed); } else this.toast(g.autoCell() ? this.t('msg_shortGold') : this.t('msg_no_build'));
          };
          right.appendChild(btn);
        } else {
          const ok = document.createElement('div');
          ok.className = 'done';
          ok.textContent = '✔';
          right.appendChild(ok);
        }
        row.appendChild(right);
        list.appendChild(row);
      });
    });
  }

  // RECIPE: per cooking line, current selling price, learned recipes with level and +%, learn/upgrade with energy.
  openRecipe() {
    const g = this.game;
    const tabs = LINES.map((k, i) => ({ line: i, title: this.t(`foodType${i}`) })).filter(t => g.cookBuilt(t.line));
    this.open(this.t('title_recipe'), '', tabs, (list, tab) => {
      const head = document.createElement('div');
      head.className = 'row head';
      head.innerHTML = `<div class="txt"><b></b><small></small></div>`;
      head.querySelector('b').textContent = this.t('currentPrice', this.t('foodType' + tab.line));
      head.querySelector('small').textContent = B.format(g.averagePrice(tab.line));
      list.appendChild(head);
      for (const r of g.recipeList(tab.line)) {
        if (!r.open) continue;
        const row = document.createElement('div');
        row.className = 'row';
        row.appendChild(this.sprite('atlas_food_atlas', r.f.resName, 'icon'));
        const txt = document.createElement('div');
        txt.className = 'txt';
        txt.innerHTML = '<b></b><small></small>';
        txt.querySelector('b').textContent = `${r.lv ? `Lv.${r.lv} ` : ''}${this.t(`name_${r.f.resName}`)}`;
        txt.querySelector('small').textContent = r.lv ? `${this.t('price')} ${B.format(g.price(r.f))}  +${r.f.price + 10 * (r.lv - 1)}%` : '🔒';
        row.appendChild(txt);
        const right = document.createElement('div');
        right.className = 'buy';
        const cost = g.recipeCost(r.f);
        const btn = document.createElement('div');
        btn.className = `price energy ${B.gte(g.state.energy, cost) ? '' : 'off'}`;
        btn.textContent = `⚡ ${B.format(cost)}`;
        btn.onclick = () => { if (g.upgradeRecipe(r.f.index, 1)) this.panel.refresh(); else this.toast(this.t('msg_shortEnergy')); };
        right.appendChild(btn);
        row.appendChild(right);
        list.appendChild(row);
      }
    });
  }
}
