// HUD on top of the rebuilt NGUI mainUI (art/ui/hud.json): currency counters, the food shelf on the wooden bar, the
// facility card, and the CRAFT / RECIPE panels. Panels are DOM drawn with the game's own atlas sprites and strings.
import * as B from '../sim/big.js';
import * as E from '../sim/economy.js';
import { find } from './ngui.js';

const TABS = [
  { key: 'cook', label: 'tab_buildType0', types: [1, 2] },
  { key: 'rest', label: 'tab_buildType1', types: [3] },
  { key: 'func', label: 'tab_buildType2', types: [4] },
  { key: 'special', label: 'tab_buildType3', types: [] },   // the original's fourth tab; its facilities (Work.type 21) are not built by this port
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
    this.P = {};
    this.mult = 1;
    // Original prefabs the HUD windows are drawn from (art/ui/panels): upgrade card, facility window.
    for (const n of ['set_upgrade']) {
      fetch(`${ng.base}/art/ui/panels/${n}.json${globalThis.CS_V || ''}`).then(r => r.json()).then(j => { this.P[n] = j.roots[0]; }).catch(() => {});
    }
  }

  // Covers the world like the original: while a window is open the HUD (right column, shelf, buttons) goes and only the
  // money bar stays; the world is dimmed blue-grey by the window's backdrop.
  syncCover() {
    const on = !!this.panel || (!!this.selected && this.card.style.display === 'flex');
    this.el.classList.toggle('cover', on);
    this.el.classList.toggle('pan', !!this.panel);
    this.root.classList.toggle('cover', on);
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

  // A sprite drawn at the size of its original canvas (trimmed rect + padding, NGUI keeps the padding), scaled so the
  // longer side is `size` px. Two of them at the same origin stack exactly like the original's dish under its food.
  full(atlas, name, size) {
    const box = document.createElement('div');
    box.className = 'full';
    const s = this.ng.spriteInfo(atlas, name);
    if (!s) return box;
    const [, , w, h, , , , , pl, pr, pt, pb] = s;
    const cw = w + pl + pr, ch = h + pt + pb, k = size / Math.max(cw, ch);
    box.style.width = `${cw * k}px`;
    box.style.height = `${ch * k}px`;
    const i = this.sprite(atlas, name);
    Object.assign(i.style, { position: 'absolute', left: `${pl * k}px`, top: `${pt * k}px`, width: `${w * k}px`, height: `${h * k}px` });
    box.appendChild(i);
    return box;
  }

  // Food over its bowl (dish0 soup bowl, dish1 juice glass, dish2 plate): both are 128 px canvases at one origin
  // in the original (ui/stage/set_food).
  stack(food, size) {
    const st = document.createElement('div');
    st.className = 'stack';
    st.appendChild(this.full('atlas_food_atlas', `dish${food.type}`, size));
    st.appendChild(this.full('atlas_food_atlas', food.resName, size));
    return st;
  }

  drawShelf() {
    const g = this.game;
    this.shelf.textContent = '';
    g.state.shelf.forEach((item, i) => {
      const f = g.food.get(item.a);
      const d = document.createElement('div');
      d.className = 'dish';
      d.appendChild(this.stack(f, 118));
      const p = document.createElement('b');
      p.textContent = B.format(item.p);
      d.appendChild(p);
      d.onclick = () => { g.sell(i); this.shelfKey = ''; };
      this.shelf.appendChild(d);
    });
  }

  // Effect line of a facility at a level, as the original's upgrade window prints it under the level
  // ("Soup cooking price increase + 7217a"): cooking and prep facilities raise their line's price, rest facilities the
  // recipe points of one charge; the others only have their own description.
  effect(w) {
    const g = this.game, a = g.work.get(w.a);
    if (a.type === 1 || a.type === 2) return { text: this.t('info_getGrade', this.t(`foodType${w.line}`)), val: lv => `+ ${B.format(E.gradeValue(a, lv))}` };
    if (a.type === 3) return { text: this.t('info_getEnergy'), val: lv => `+ ${B.format(E.energyAmount(a, lv, false, 1))}` };
    return { text: this.t(`info_build${a.index}`), val: () => '' };
  }

  // Tapped facility: the original's upgrade window (ui/facility/set_upgrade) in the middle of the dimmed screen.
  select(work) {
    this.selected = work;
    if (work) this.card.style.display = 'flex';
    this.drawCard();
  }

  closeCard() {
    this.selected = null;
    this.card.style.display = 'none';
    this.syncCover();
  }

  buildCard(w) {
    const g = this.game, a = g.work.get(w.a);
    this.card.textContent = '';
    this.cardWork = w;
    this.card.dataset.k = '';
    const hold = document.createElement('div');
    hold.className = 'cardroot';
    const el = this.ng.build(this.P.set_upgrade);
    hold.appendChild(el);
    this.card.appendChild(hold);
    const n = {};
    const walk = (e, path) => { for (const c of e.children) if (c.dataset && c.dataset.n) { const p = `${path}${c.dataset.n}`; n[p] = c; walk(c, `${p}/`); } };
    walk(el, '');
    this.cn = n;
    n['txt_title'].box.textContent = this.t(`title_build${a.index}`);
    this.ng.paint(n['icon'].box, 'atlas_build_atlas', `build${a.index}`, false);
    n['num_lv/txt_;v'].box.textContent = this.t('level');
    n['set_sfx'].style.display = 'none';
    n['num_next'].style.display = 'none';
    n['set_maxLv'].style.display = 'none';
    n['set_next'].style.display = '';
    const nl = n['set_next/set_nextLv/txt_info'];
    nl.box.textContent = this.t('nextLv');
    Object.assign(nl.box.style, { width: '200px', left: '-100px', fontSize: '24px' });
    nl.style.left = '-95px';
    const nv = n['set_next/set_nextLv/num_next'];
    Object.assign(nv.box.style, { width: '170px', left: '-85px', textAlign: 'center' });
    nv.style.left = '100px';
    const bt = n['set_next/bt_upgrade'];
    bt.classList.add('btn');
    const up = bt.querySelector('[data-n="bg"] > .w');
    up.classList.add('up');
    for (const b of bt.querySelectorAll('.w')) { b.style.pointerEvents = b.classList.contains('label') ? 'none' : 'auto'; b.style.cursor = 'pointer'; b.onpointerdown = e => { e.stopPropagation(); this.holdUpgrade(w); }; }
    this.cardUp = up;
    const lu = document.createElement('div');
    lu.className = 'lvup';
    hold.appendChild(lu);
    this.lvupEl = lu;
    this.card.onclick = e => { if (e.target === this.card) this.closeCard(); };
  }

  drawCard() {
    const g = this.game, w = this.selected;
    if (!w || !g.state.works.includes(w)) {
      if (this.card.style.display !== 'none') this.card.style.display = 'none';
      this.selected = null;
      this.syncCover();
      return;
    }
    if (this.card.style.display === '') this.card.style.display = 'flex';
    this.syncCover();
    if (!this.P.set_upgrade) return;
    if (this.cardWork !== w || !this.card.firstChild) this.buildCard(w);
    const price = g.upgradePrice(w);
    const max = w.lv >= E.LEVEL_MAX;
    const ok = B.gte(g.state.gold, price);
    const k = `${w.id}:${w.lv}:${B.format(price)}:${ok}`;
    if (this.card.dataset.k === k) return;
    this.card.dataset.k = k;
    const n = this.cn, ef = this.effect(w);
    n['num_lv'].box.textContent = String(w.lv);
    n['txt_info'].box.textContent = ef.text;
    n['num_value'].box.textContent = ef.val(w.lv);
    n['set_next/set_nextLv/num_next'].box.textContent = ef.val(w.lv + 1);
    n['set_next/set_nextLv'].style.display = ef.val(w.lv) ? '' : 'none';
    const txt = n['set_next/bt_upgrade/txt'].box;
    txt.textContent = '';
    txt.appendChild(this.sprite('atlas_ui1_atlas', 'icon_gold_s', 'coin'));
    txt.appendChild(document.createTextNode(` ${B.format(price)}`));
    Object.assign(txt.style, { width: '300px', left: '-150px' });
    this.cardUp.classList.toggle('off', !ok);
    n['set_next/bt_upgrade'].style.display = max ? 'none' : '';
    n['set_maxLv'].style.display = max ? '' : 'none';
  }

  // "<facility> leveled up 12 -> 13" over the window; held upgrades keep the first level and move the last.
  noteUp(w, before) {
    if (!this.lvupEl || this.cardWork !== w) return;
    if (!this.lvupAt) this.lvupFrom = before;
    this.lvupAt = 1;
    const a = this.game.work.get(w.a);
    this.lvupEl.textContent = this.t('smg_quickUpgrade', this.t(`title_build${a.index}`), this.lvupFrom, w.lv);
    this.lvupEl.classList.remove('on');
    void this.lvupEl.offsetWidth;
    this.lvupEl.classList.add('on');
    clearTimeout(this.lvupTimer);
    this.lvupTimer = setTimeout(() => { this.lvupAt = 0; if (this.lvupEl) this.lvupEl.classList.remove('on'); }, 1400);
  }

  // Holding the upgrade button repeats it, faster the longer it is held (guide_longPress: "bạn có thể giữ nó!").
  holdUpgrade(w, times = 1, after = null) {
    this.stopHold();
    const once = () => {
      const before = w.lv;
      if (this.game.upgrade(w, times)) { this.noteUp(w, before); if (after) after(); return true; }
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
    // The facility window of the original (set_facility): the skins panel of the selected facility gets its picture, the
    // arrows to the neighbouring facilities and a Level tab with the upgrade.
    const sel = this.selected;
    const fw = sel && this.game.state.works.includes(sel) && title === this.t(`title_build${sel.a}`) ? sel : null;
    if (fw) {
      tabs = [...tabs, { key: '__level', title: this.t('level') }];
      const inner = draw;
      draw = (list, tab) => (tab.key === '__level' ? this.drawLevelTab(list, fw) : inner(list, tab));
    }
    const p = document.createElement('div');
    p.className = 'panel';
    const fhead = fw ? '<div class="fhead"><div class="fimg"></div><div class="fnav l">◀</div><div class="fnav r">▶</div><div class="finfo"><small></small></div></div>' : '';
    p.innerHTML = `<div class="ttl"><h1></h1><h2></h2></div>${fhead}<div class="tabs"></div><div class="list"></div><div class="close">×</div>`;
    p.querySelector('h1').textContent = title;
    if (title.length > 14) p.querySelector('h1').classList.add('long');
    p.querySelector('h2').textContent = sub;
    p.querySelector('.close').onclick = () => this.close();
    if (fw) {
      p.classList.add('fac');
      p.querySelector('.fimg').appendChild(this.full('atlas_build_atlas', `build${this.game.work.get(fw.a).index}`, 230));
      p.querySelector('.finfo small').textContent = this.t(`info_build${fw.a}`);
      const ws = this.game.state.works;
      const go = d => {
        const n = ws[(ws.indexOf(fw) + d + ws.length) % ws.length];
        if (!n || n === fw) return;
        this.selected = n;
        const th = this.el.querySelector('.th-skin');
        if (th) th.click(); else this.close();
      };
      p.querySelector('.fnav.l').onclick = () => go(-1);
      p.querySelector('.fnav.r').onclick = () => go(1);
    }
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
    this.syncCover();
    show(0);
  }

  close() {
    if (this.panel) this.panel.el.remove();
    this.panel = null;
    this.syncCover();
  }

  // Level tab of the facility window: current and next level with their effect, the upgrade button with x1 / x10 / Max.
  drawLevelTab(list, w) {
    const g = this.game, ef = this.effect(w);
    const box = document.createElement('div');
    box.className = 'lvtab';
    const card = (cls, lv, val) => `<div class="lvc ${cls}"><small>Lv.${lv}</small><b>${val || ''}</b></div>`;
    box.innerHTML = `<div class="eff"></div><div class="cmp">${card('cur', w.lv, ef.val(w.lv))}<i>▲</i>${card('nxt', w.lv + 1, ef.val(w.lv + 1))}</div>`;
    box.querySelector('.eff').textContent = ef.text;
    list.appendChild(box);
    if (w.lv >= E.LEVEL_MAX) {
      const m = document.createElement('div');
      m.className = 'maxlv';
      m.textContent = this.t('msg_maxLv');
      box.appendChild(m);
      return;
    }
    const times = this.mult === 'max' ? E.LEVEL_MAX : this.mult;
    // price of the chosen number of levels (Max: as many as the gold pays for)
    const a = g.work.get(w.a), m = g.mult('upgrade', w);
    let sum = B.ZERO, n = 0;
    for (let lv = w.lv; n < times && lv < E.LEVEL_MAX && n < 400; lv++) {
      let c = E.upgradeCost(a, lv);
      if (m !== 1) c = B.mul(c, m);
      if (this.mult === 'max' && !B.gte(g.state.gold, B.add(sum, c))) break;
      sum = B.add(sum, c);
      n++;
    }
    if (!n) sum = g.upgradePrice(w);
    const row = document.createElement('div');
    row.className = 'lvbtns';
    const up = document.createElement('div');
    up.className = `up2 ${B.gte(g.state.gold, sum) ? '' : 'off'}`;
    up.appendChild(this.sprite('atlas_ui1_atlas', 'icon_gold_s', 'coin'));
    up.appendChild(document.createTextNode(` ${B.format(sum)}`));
    up.onpointerdown = e => { e.stopPropagation(); this.holdUpgrade(w, times, () => this.panel && this.panel.refresh()); };
    row.appendChild(up);
    box.appendChild(row);
    const mults = document.createElement('div');
    mults.className = 'mults';
    for (const [k, label] of [[1, 'x1'], [10, 'x10'], ['max', this.t('facility_levelup_max_btn')]]) {
      const b = document.createElement('div');
      b.className = `mu ${this.mult === k ? 'on' : ''}`;
      b.textContent = label;
      b.onclick = () => { this.mult = k; this.panel.refresh(); };
      mults.appendChild(b);
    }
    box.appendChild(mults);
    const note = document.createElement('small');
    note.className = 'note';
    note.textContent = this.t('facility_levelup_notice_01');
    box.appendChild(note);
  }

  // CRAFT: facilities in table order up to the first one never built (the next one to buy); later rows stay locked.
  openBuild() {
    const g = this.game;
    const tabs = TABS.map(t => ({ ...t, title: this.t(t.label) }));
    this.open(this.t('title_build'), '', tabs, (list, tab) => {
      const all = g.buildList();
      const frontier = all.findIndex(o => o.n === 0);
      const lock = text => {
        const row = document.createElement('div');
        row.className = 'row locked';
        row.appendChild(this.sprite('atlas_ui1_atlas', 'icon_lock_s', 'lk'));
        if (text) { const t = document.createElement('small'); t.textContent = text; row.appendChild(t); }
        list.appendChild(row);
      };
      let lockedShown = 0;
      all.forEach((o, i) => {
        if (!tab.types.includes(o.w.type)) return;
        if (frontier >= 0 && i > frontier) {
          if (lockedShown) return;
          lockedShown = 1;
          const first = all[frontier].w;
          const from = TABS.find(t => t.types.includes(first.type));
          lock(this.t('buildRequire', this.t(from.label), this.t(`title_build${first.index}`), '').replace(/\s*\n\s*/g, '\n'));
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
      // Special: this port builds none of its facilities, so empty slots like the original's locked rows
      if (!tab.types.length) for (let k = 0; k < 4; k++) lock('');
    });
  }

  // RECIPE: per cooking line, current selling price, learned recipes with level and +%, learn/upgrade with energy,
  // and under the window the Recommend box (the cheapest recipe of the line to level next).
  openRecipe() {
    const g = this.game;
    const tabs = LINES.map((k, i) => ({ line: i, title: g.cookBuilt(i) ? this.t(`foodType${i}`) : '🔒', locked: !g.cookBuilt(i) }));
    const energy = (cost, ok) => {
      const btn = document.createElement('div');
      btn.className = `price energy ${ok ? '' : 'off'}`;
      btn.appendChild(this.sprite('atlas_ui1_atlas', 'icon_energy_s', 'mini'));
      btn.appendChild(document.createTextNode(` ${B.format(cost)}`));
      return btn;
    };
    const coin = () => this.sprite('atlas_ui1_atlas', 'icon_gold_s', 'coin');
    const lockRow = list => {
      const row = document.createElement('div');
      row.className = 'row locked';
      row.appendChild(this.sprite('atlas_ui1_atlas', 'icon_lock_s', 'lk'));
      list.appendChild(row);
    };
    this.open(this.t('title_recipe'), '', tabs, (list, tab) => {
      this.panel.el.classList.add('rcp');
      this.panel.el.querySelectorAll('.rec').forEach(e => e.remove());
      if (tab.locked) { lockRow(list); lockRow(list); return; }
      const head = document.createElement('div');
      head.className = 'row head';
      head.innerHTML = '<div class="txt"><b></b><small></small></div><div class="plank"></div>';
      head.querySelector('b').textContent = this.t('currentPrice', this.t(`foodType${tab.line}`));
      const sm = head.querySelector('small');
      sm.appendChild(coin());
      sm.appendChild(document.createTextNode(` ${B.format(g.averagePrice(tab.line))}`));
      head.querySelector('.plank').appendChild(this.full('atlas_food_atlas', `dish${tab.line}`, 110));
      list.appendChild(head);
      let best = null, shownLocks = 0;
      for (const r of g.recipeList(tab.line)) {
        if (!r.open) { if (shownLocks++ < 2) lockRow(list); continue; }
        const cost = g.recipeCost(r.f);
        const ok = B.gte(g.state.energy, cost);
        if (r.lv && (!best || B.lt(cost, best.cost))) best = { r, cost, ok };
        const row = document.createElement('div');
        row.className = 'row rcp';
        const pic = document.createElement('div');
        pic.className = 'pic';
        pic.appendChild(this.stack(r.f, 118));
        row.appendChild(pic);
        const txt = document.createElement('div');
        txt.className = 'txt';
        txt.innerHTML = '<b></b><small class="meta"></small>';
        txt.querySelector('b').textContent = this.t(`name_${r.f.resName}`);
        const meta = txt.querySelector('.meta');
        if (r.lv) {
          const lv = document.createElement('span');
          lv.textContent = `Lv.${r.lv}`;
          meta.appendChild(lv);
          meta.appendChild(document.createTextNode(`  ${this.t('price')} `));
          meta.appendChild(coin());
          meta.appendChild(document.createTextNode(` ${B.format(g.price(r.f))}`));
          const chip = document.createElement('em');
          chip.className = 'chip';
          chip.textContent = `+${E.recipePercent(r.f, r.lv)} %`;
          meta.appendChild(chip);
        } else meta.appendChild(this.sprite('atlas_ui1_atlas', 'icon_lock_s', 'lk'));
        row.appendChild(txt);
        const right = document.createElement('div');
        right.className = 'buy';
        const nl = document.createElement('i');
        nl.textContent = `Lv.${r.lv + 1}`;
        right.appendChild(nl);
        const btn = energy(cost, ok);
        btn.onclick = () => { if (g.upgradeRecipe(r.f.index, 1)) this.panel.refresh(); else this.toast(this.t('msg_shortEnergy')); };
        right.appendChild(btn);
        row.appendChild(right);
        list.appendChild(row);
      }
      if (best) {
        const rec = document.createElement('div');
        rec.className = 'rec';
        rec.innerHTML = '<div class="tag"></div><div class="body"><div class="pic"></div><div class="txt"><b></b><small></small></div></div>';
        rec.querySelector('.tag').textContent = this.t('recommendResearch');
        rec.querySelector('.pic').appendChild(this.stack(best.r.f, 110));
        rec.querySelector('b').textContent = this.t(`name_${best.r.f.resName}`);
        rec.querySelector('small').textContent = `Lv.${best.r.lv}  ➔  Lv.${best.r.lv + 1}`;
        const btn = energy(best.cost, best.ok);
        btn.onclick = () => { if (g.upgradeRecipe(best.r.f.index, 1)) this.panel.refresh(); else this.toast(this.t('msg_shortEnergy')); };
        rec.querySelector('.body').appendChild(btn);
        this.panel.el.appendChild(rec);
      }
    });
  }
}
