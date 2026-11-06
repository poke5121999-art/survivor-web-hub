// Feature "telescope" (view part): the observatory building (Work 110) with its tap, the star telescope ("Quan Sat Sao"), the
// observatory windows (new look / new skill / limited cat with tickets) and the star-tree event. Entry points are the facility tap and
// the "more" quick menu, as in the original (UI_QuickMenu.c:405 / :685, UI_Stage.c:30018). Rules: js/sim/features/telescope.js,
// D:/catsoup-ref/rules/telescope.md. Frames come from the original prefabs art/ui/panels/set_telescope, set_telescope_talelist;
// the observatory and the star tree are DOM drawn with the game's atlas sprites and strings.
import * as TS from '../../sim/features/telescope.js';
import { GLTFLoader } from '../../../vendor/GLTFLoader.js';
import MeshoptDecoder from '../../../vendor/meshopt_decoder.js';
import { loadLib } from '../world.js';
import { cellPos } from '../forest.js';
import { find } from '../ngui.js';

const UI1 = 'atlas_ui1_atlas', UI2 = 'atlas_ui2_atlas', FOOD = 'atlas_food_atlas', SHOP = 'atlas_shop_atlas', ICON = 'atlas_icon_atlas', IMG = 'atlas_img_atlas';
const EQUIP = ['atlas_equip1_atlas', 'atlas_equip2_atlas', 'atlas_equip3_atlas', 'atlas_equip4_atlas'];
const FURN = ['atlas_furniture1_atlas', 'atlas_furniture2_atlas'];
const GOLD = { 1101: ['ticket_gold1', 'ticketGold', 1], 1102: ['ticket_gold3', 'ticketGold', 3], 1103: ['ticket_gold6', 'ticketGold', 6], 1201: ['ticket_energy1', 'ticketEnergy', 1], 1202: ['ticket_energy3', 'ticketEnergy', 3], 1203: ['ticket_energy6', 'ticketEnergy', 6] };
const el = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
const PARTNER = ['startree_popup_select_cat_name1', 'startree_popup_select_cat_name2', 'startree_popup_select_cat_name3'];

export default {
  id: 'telescope',

  async mount(ctx) {
    this.ctx = ctx;
    this.game = ctx.game;
    this.S = ctx.game.feat.telescope;
    this.hud = ctx.hud;
    this.ng = ctx.ng;
    this.t = (key, fb, ...a) => (ctx.lang[key] != null ? ctx.t(key, ...a) : (fb ?? key));
    ctx.css('css/telescope.css');
    // test / preview hook: ?tdate=YYYYMMDD[HH] moves this feature's calendar (the star-tree event runs 2026-08-20 .. 2026-09-09)
    const q = new URLSearchParams(location.search).get('tdate');
    if (q && /^\d{8}(\d{2})?$/.test(q)) {
      const y = +q.slice(0, 4), m = +q.slice(4, 6) - 1, d = +q.slice(6, 8), h = q.length > 8 ? +q.slice(8, 10) : 12;
      const t0 = new Date(y, m, d, h).getTime(), real = Date.now();
      ctx.game._now = () => t0 + (Date.now() - real);
      ctx.game.feat.telescope.sync(ctx.game);
      ctx.game.feat.telescope.starSync(ctx.game);
    }
    this.el = el('ts');
    ctx.hud.el.appendChild(this.el);
    this.screen = null;
    this.since = 0;
    window.__telescope = this;
    const menu = (sec, key, sprite, run, ok) => ctx.hud.addMenu({ sec, key, sprite, run, ok });
    menu('cat', 'title_build110', 'icon_observatory', () => this.enter('observatory'));
    menu('forest', 'title_telescope', 'icon_telescope', () => this.enter('telescope'));
    menu('etc', 'startree_popup_main_title', 'event_startree', () => this.enter('tree'), () => this.S.starActive(this.game));
    const [tel, tale] = await Promise.all(['set_telescope', 'set_telescope_talelist'].map(n => ctx.panel(n).catch(() => null)));
    this.tree = { tel, tale };
  },

  // ================= the building (Work 110) =================
  update(dt) {
    const g = this.game, w = this.S.obsWork(g);
    this.building(w && g.state.works.includes(w) ? w : null, dt);
    this.since += dt;
    if (this.since < (this.screen === 'tree' ? 4 : 1)) return;      // the tree redraws its DOM: slowly, actions redraw at once
    this.since = 0;
    if (this.screen === 'tree' && !this.pop) this.drawTree();
    else if (this.screen === 'telescope') this.drawTelescope();
  },

  // Work 110 (eventType 4) is not in the core's places.json, so its model has its own library (tools/export_telescope.py --art).
  building(w, dt) {
    const { view } = this.ctx;
    if (!w) { if (this.obj) { this.obj.removeFromParent(); this.obj = null; } return; }
    if (!this.lib) {
      this.lib = loadLib(this.ctx.base, 'telescope/place110', GLTFLoader, MeshoptDecoder).catch(() => null);
      this.lib.then(l => { this.libReady = l; });
    }
    if (!this.libReady) return;
    if (!this.obj) {
      try { this.obj = this.libReady.instantiate('places/place110'); } catch (e) { this.libReady = null; this.lib = Promise.resolve(null); return; }
      this.obj.scale.setScalar(0.01);
      this.obj.userData.workId = w.id;
      view.root.add(this.obj);
    }
    cellPos(w.pos[0], w.pos[1], this.obj.position);
    const sc = this.obj.scale.x;
    if (sc < 1) this.obj.scale.setScalar(Math.min(1, sc + (dt || 0.016) * 4));
  },

  onTap(work) {
    if (work.a !== TS.OBS) return false;
    this.enter('observatory');
    return true;
  },

  onEvent(e) {
    if (e.type === 'catLook') {                                    // the 3D cat is rebuilt with the new fur
      const v = this.ctx.view.cats.get(e.cat.id);
      if (v) { v.obj.removeFromParent(); this.ctx.view.cats.delete(e.cat.id); }
    }
    if (!this.screen) return;
    if (e.type === 'reward' && this.screen === 'tree') this.drawTree();
  },

  // quick-menu / tap entry: the telescope and the observatory exist once the building stands
  enter(name) {
    const g = this.game, S = this.S;
    if (name === 'tree') return this.open('tree');
    if (!S.obsWork(g)) return this.openBuild(name);
    this.open(name);
  },

  openBuild(name) {
    const { hud, t } = this.ctx;
    const S = this.S, g = this.game;
    hud.open(t('title_build110'), '', [{ title: t('title_build110') }], list => {
      const row = el('row');
      row.appendChild(hud.sprite('atlas_build_atlas', 'build110', 'icon'));
      const txt = el('txt');
      txt.innerHTML = '<b></b><small></small>';
      txt.querySelector('b').textContent = t('title_build110');
      txt.querySelector('small').textContent = t('info_build110');
      row.appendChild(txt);
      const ok = S.canBuildObs(g);
      const b = el(`price ${ok ? '' : 'off'}`, ok ? t('title_build110') : `🔒 ${t('title_build8')}`);
      b.onclick = () => {
        if (!ok) { hud.toast(`${t('title_build8')} ?`); return; }
        const w = S.buildObs(g);
        if (w) { hud.close(); hud.onBuilt && hud.onBuilt(w); }
      };
      row.appendChild(b);
      list.appendChild(row);
    });
  },

  // ================= shared helpers =================
  open(name, arg) {
    this.close(true);
    this.screen = name;
    this.arg = arg;
    this.root = el('ts-screen');
    this.el.appendChild(this.root);
    this.el.classList.add('on');
    this.hud.close && this.hud.close();
    ({ telescope: () => this.buildTelescope(), observatory: () => this.buildObservatory(), tree: () => this.buildTree() })[name]();
  },
  close(keep) {
    this.closePop();
    if (this.root) this.root.remove();
    this.root = null;
    this.screen = null;
    if (!keep) this.el.classList.remove('on');
  },
  closePop() { if (this.pop) this.pop.remove(); this.pop = null; },
  node(tree) { const n = this.ng.build(tree.roots[0]); const w = el('ts-nroot'); w.appendChild(n); this.root.appendChild(w); return n; },
  text(n, path, s) { const x = typeof path === 'string' ? find(n, path) : path; if (x && x.box) x.box.textContent = s; return x; },
  hide(n, ...paths) { for (const p of paths) { const x = find(n, p); if (x) x.style.display = 'none'; } },
  btn(n, path, fn) {
    const x = typeof path === 'string' ? find(n, path) : path;
    if (!x) return null;
    x.classList.add('btn');
    for (const b of x.querySelectorAll('.w')) { b.style.pointerEvents = 'auto'; b.style.cursor = 'pointer'; b.onclick = e => { e.stopPropagation(); fn(e); }; }
    return x;
  },
  atlasOf(name) { return Object.keys(this.ng.atlases).find(a => this.ng.atlases[a].sprites[name]); },
  // sprite fitted into a box of size x size (or h)
  icon(name, w, h = w, atlas = null, cls = '') {
    const a = atlas && this.ng.spriteInfo(atlas, name) ? atlas : this.atlasOf(name);
    const d = this.hud.sprite(a || UI1, a ? name : 'icon_question', cls);
    const s = a && this.ng.spriteInfo(a, name);
    if (s) { const k = Math.min(w / s[2], h / s[3]); d.style.width = `${Math.round(s[2] * k)}px`; d.style.height = `${Math.round(s[3] * k)}px`; }
    else { d.style.width = `${w}px`; d.style.height = `${h}px`; }
    return d;
  },
  // a sliced-sprite button: label children are put on top of the background
  pill(color, w, h, fn, ...kids) {
    const b = el('pb');
    b.style.width = `${w}px`; b.style.height = `${h}px`;
    const bg = el('bgs');
    this.ng.paint(bg, UI1, `button_${color}`, true);
    b.appendChild(bg);
    for (const k of kids) b.appendChild(typeof k === 'string' ? el('', k, 'span') : k);
    if (fn) b.onclick = e => { e.stopPropagation(); fn(e); };
    return b;
  },
  box(w, h, sprite = 'box_round1', cls = '') {
    const d = el(cls);
    d.style.width = `${w}px`; d.style.height = `${h}px`;
    this.ng.paint(d, sprite.includes('_l') && !this.ng.spriteInfo(UI1, sprite) ? IMG : UI1, sprite, true);
    return d;
  },
  exitButton(fn) {
    const d = el('ts-exit btn');
    const bg = this.hud.sprite(UI1, 'button_circle1', 'bg'), ic = this.hud.sprite(UI1, 'icon_exit', 'ic');
    bg.style.width = bg.style.height = '110px'; ic.style.width = ic.style.height = '80px';
    d.append(bg, ic);
    d.onclick = fn;
    return d;
  },
  fx(text, x, y) {
    const d = el('ts-fx', text);
    d.style.left = `${x}px`; d.style.top = `${y}px`;
    this.root.appendChild(d);
    setTimeout(() => d.remove(), 1700);
  },
  popup(build, cls = '') {
    this.closePop();
    const p = el('ts-pop');
    const box = el(`ts-box ${cls}`);
    build(box, () => this.closePop());
    p.appendChild(box);
    p.onclick = e => { if (e.target === p) this.closePop(); };
    this.root.appendChild(p);
    this.pop = p;
    return box;
  },
  okButton(box, fn) { box.appendChild(this.pill('blue', 330, 110, fn || (() => this.closePop()), this.t('okay', 'OK') === 'okay' ? 'OK' : this.t('okay', 'OK'))); },
  remainText(ms) {
    const r = this.S.splitRemain(ms), t = this.t;
    return r.days > 0 ? `${t('day', null, r.days)} ${t('hour', null, r.hours)}` : `${t('hour', null, r.hours)} ${t('minute', null, r.mins)}`;
  },

  // ---- what a reward looks like (names from the original strings) ----
  look(type, value) {
    const g = this.game, t = this.t;
    if (type === 5) {
      const a = g.feat.equip && g.feat.equip.asset(g, value);
      const atlas = a && [EQUIP[a.type], ...EQUIP].find(x => x && this.ng.spriteInfo(x, a.resName));
      return { atlas, sprite: a && a.resName, name: a ? t(`title_${a.resName}`, a.resName) : `#${value}`, kind: 'equip' };
    }
    if (type === 6) {
      const f = (g.t.Furniture || []).find(x => x.index === value);
      const atlas = f && FURN.find(x => this.ng.spriteInfo(x, f.resName));
      return { atlas, sprite: f && f.resName, name: f ? (this.ctx.lang[`title_${f.resName}`] != null ? t(`title_${f.resName}`) : t(`furnitureType${f.subType}`, `#${value}`)) : `#${value}`, kind: 'furniture' };
    }
    if (type === 201) return { sprite: null, name: `#${value}`, kind: 'prop' };
    if (GOLD[type]) { const [sp, k, h] = GOLD[type]; return { atlas: UI1, sprite: sp, name: t(k, k, t('hour', null, h)) }; }
    if (type === 1401) return { atlas: UI1, sprite: 'ticket_catChange1', name: t('ticketObservatory') };
    if (type === 1402) return { atlas: UI1, sprite: 'ticket_catChange2', name: t('ticketObservatorySp') };
    if (type >= 1403 && type <= 1405) return { atlas: UI1, sprite: `ticket_fatType${type - 1403}`, name: t(`ticketObservatory_catType_fatType${type - 1403}`) };
    if (type === 1406) return { atlas: UI1, sprite: 'ticket_limitType1', name: t('ticketObservatory_catType_limitType') };
    if (type === 1407) return { atlas: UI1, sprite: 'ticket_kittyChange1', name: t('ticketObservatory_catType_kitty') };
    if (type === 1408) return { atlas: UI1, sprite: 'ticket_random_fatType', name: t('ticketObservatory_catType_random_fatType') };
    if (type >= 1501 && type <= 1524) { const c = TS.LIMITED[type - 1501]; return { atlas: UI1, sprite: `ticket_cat${c}`, name: t(`ticketObservatory_catType${c}`, `#${type}`) }; }
    const k = { 3: ['icon_gem', 'gem'], 4: ['icon_coin', 'coin'], 96: ['icon_token', 'souvenirToken'], 98: ['icon_butterfly', 'butterfly'], 6001: ['icon_telescope_lens', 'title_telescopeLens'],
      6002: ['baitSp', 'title_baitSp'], 23: ['fish100', 'catFood100'], 24: ['fish101', 'catFood101'], 7106: ['fish106', 'catFood106'], 7107: ['fish107', 'catFood107'], 3012: ['icon_treasure', 'travelItem'] }[type];
    if (k) return { sprite: k[0], name: t(k[1], k[1]) };
    return { sprite: null, name: `#${type}` };
  },
  rewardCell(type, value, opt = {}) {
    const lk = this.look(type, value);
    const c = el(`ts-item ${opt.tale ? 'tale' : ''} ${opt.got ? 'got' : ''}`);
    const ico = el('ico');
    if (lk.sprite) ico.appendChild(this.icon(lk.sprite, 120, 120, lk.atlas));
    else ico.textContent = '🎁';
    c.appendChild(ico);
    c.appendChild(el('', lk.name, 'b'));
    if (opt.count != null) c.appendChild(el('', `x${type === 5 || type === 6 || type === 201 ? 1 : opt.count}`, 'small'));
    if (opt.tale) c.appendChild(el('tag', this.t('title_telescopeSpecialReward')));
    if (opt.got) { const k = this.icon('icon_complete', 56, 56, UI1, 'chk'); c.appendChild(k); }
    if (opt.locked) { const k = this.icon('icon_lock_s', 50, 50, UI1, 'lock'); c.appendChild(k); }
    return c;
  },

  // ================= telescope =================
  buildTelescope() {
    const n = this.node(this.tree.tel);
    this.tn = n;
    this.root.classList.add('ts-tel');
    for (const p of ['bt_black', 'ui_pannel/bt_skip', 'ui_pannel/set_rightBottom/bt_Info_2', 'ui_pannel/bts/set_bt/bt_observationX1/txt_free']) this.hide(n, p);
    const glow = find(n, 'starGlow'); if (glow) glow.dataset.n = 'starGlow';
    n.appendChild(this.exitButton(() => this.close()));
    n.lastChild.style.left = '-55px'; n.lastChild.style.top = '800px';
    this.btn(n, 'ui_pannel/bts/icon_guide button', () => this.telGuide());
    this.btn(n, 'ui_pannel/bts/icon_reward_button', () => this.taleList());
    this.btn(n, 'ui_pannel/set_rightBottom/bt_Info_1', () => this.probabilities());
    this.text(n, 'ui_pannel/set_rightBottom/bt_Info_1/sp_box/info', 'Xem xác suất');   // the lang file keeps the Korean placeholder
    this.btn(n, 'ui_pannel/bts/set_bt/bt_observationX1', () => this.pull(1));
    this.btn(n, 'ui_pannel/bts/set_bt/bt_observationX5', () => this.pull(5));
    // lens counter and the lens icons on the buttons are drawn by drawTelescope
    this.lensEl = el('ts-lens');
    n.appendChild(this.lensEl);
    this.costs = [1, 5].map(k => { const c = el('ts-cost'); find(n, `ui_pannel/bts/set_bt/bt_observationX${k}`).appendChild(c); return c; });
    this.costs.forEach((c, i) => { c.style.left = '-52px'; c.style.top = '-24px'; });
    // the three lens packages are real-money items of the original: shown, not for sale here
    const pk = find(n, 'ui_pannel/set_purchase ');
    if (pk) {
      for (const k of [1, 2, 3]) {
        const b = find(pk, String(k));
        if (b) { b.classList.add('ts-dim'); b.onclick = () => this.hud.toast(this.t('msg_cannotBuyReal', 'Gói mua bằng tiền thật: chưa mở trong bản web')); for (const w of b.querySelectorAll('.w')) w.style.pointerEvents = 'none'; }
        this.text(pk, `${k}/buycount`, `0 / ${3}`);
      }
      this.text(pk, 'bar/lb_info', this.t('dailyLimited', null, 3));
    }
    this.drawTelescope();
    if (this.S.isActive(this.game)) {
      const r = this.S.splitRemain(this.S.seasonRemain(this.game));
      if (r.days < 7 && !this.noticed) { this.noticed = true; this.seasonNotice(r); }
    }
  },

  seasonNotice(r) {
    this.popup((box, close) => {
      box.appendChild(el('', this.t('observe_star_popup_notice_title'), 'h2'));
      box.appendChild(el('msg', this.t('observe_star_popup_notice_01', null, r.days, r.hours)));
      this.okButton(box, close);
    });
  },

  drawTelescope() {
    const n = this.tn, g = this.game, S = this.S, t = this.t;
    if (!n) return;
    const st = g.state.telescope, active = S.isActive(g);
    this.text(n, 'ui_pannel/bts/title', t('info_telescope'));
    this.text(n, 'ui_pannel/bts/info', t('time_telescopeNext'));
    const left = S.remainTaleCount(g) > 0 ? String(S.untilGuarantee(g)) : '-';
    this.text(n, 'ui_pannel/bts/info_num', left);
    const season = S.seasonRow(g);
    this.text(n, 'ui_pannel/lb_time', active ? this.remainText(S.seasonRemain(g)) : '--');
    this.text(n, 'ui_pannel/lb_time/txt_time', t('time_telescopeFinish'));
    this.lensEl.textContent = '';
    this.lensEl.append(this.icon('icon_telescope_lens_b', 52, 52, UI1), el('', `${t('title_telescopeLens')}  ${S.lens(g)}`, 'span'));
    if (season) this.lensEl.append(el('', `· ${t(`title_telescope_season${season.index}`, season.name)}`, 'span'));
    const lens = S.lens(g), free = !st.free;
    [[1, free ? null : 1], [5, 5]].forEach(([k, cost], i) => {
      const bt = find(n, `ui_pannel/bts/set_bt/bt_observationX${k}`), lab = find(bt, 'txt');
      const c = this.costs[i];
      c.textContent = '';
      if (cost == null) c.append(el('', t('free'), 'span'));
      else c.append(this.icon('icon_telescope_lens_b', 44, 44, UI1), el('', String(cost), 'span'));
      if (lab) lab.style.display = 'none';
      const can = S.canObserve(g, k);
      bt.style.opacity = can ? '' : '0.55';
    });
  },

  pull(k) {
    const S = this.S, g = this.game;
    if (!S.canObserve(g, k)) {
      if (!S.isActive(g)) this.hud.toast(this.t('time_telescopeFinish'));
      else this.hud.toast(`${this.t('title_telescopeLens')} 0`);
      return;
    }
    const r = S.observe(g, k);
    if (!r.ok) return;
    this.drawTelescope();
    this.showResult(r);
  },

  showResult(r) {
    this.popup((box, close) => {
      box.classList.add('night');
      box.appendChild(el('', this.t('title_telescope'), 'h2'));
      const grid = el('ts-grid');
      for (const w of r.rewards) grid.appendChild(this.rewardCell(w.type, w.value, { tale: w.tale, count: w.value }));
      if (!r.rewards.length) grid.appendChild(el('msg', '-'));
      box.appendChild(grid);
      this.okButton(box, close);
    });
  },

  telGuide() {
    this.popup((box, close) => {
      box.classList.add('night');
      box.appendChild(el('', this.t('title_telescope'), 'h2'));
      for (const k of [1, 2, 3, 4]) box.appendChild(el('ts-guide', this.t(`guidebook_telescope_${k}`)));
      box.appendChild(el('ts-guide', this.t('observe_star_info_popup_notice_01')));
      this.okButton(box, close);
    });
  },

  probabilities() {
    const S = this.S, g = this.game;
    this.popup((box, close) => {
      box.classList.add('night');
      box.appendChild(el('', 'Xác suất', 'h2'));
      const sc = el('ts-scroll');
      const names = { tale: this.t('title_telescopeSpecialReward'), limit: this.t('ticketObservatory_catType_limitType'), select: this.t('ticketObservatory_catType_random_fatType') };
      for (const p of S.probabilities(g)) {
        const row = el('ts-row');
        const lk = typeof p.key === 'number' ? this.look(p.key, 1) : null;
        row.appendChild(lk && lk.sprite ? this.icon(lk.sprite, 64, 64, lk.atlas) : this.icon(p.key === 'tale' ? 'icon_telescope_reward' : 'ticket_limitType1', 64, 64));
        row.appendChild(el('', lk ? lk.name : names[p.key], 'span'));
        row.lastChild.style.flex = '1'; row.lastChild.style.fontSize = '30px';
        const bar = el('bar'); const fill = el('', null, 'i'); fill.style.width = `${Math.min(100, p.percent * 2.5)}%`; bar.appendChild(fill);
        row.append(bar, el('', `${p.percent.toFixed(p.percent < 1 ? 2 : 1)}%`, 'b'));
        sc.appendChild(row);
      }
      box.appendChild(sc);
      this.okButton(box, close);
    });
  },

  taleList() {
    const S = this.S, g = this.game;
    const list = S.taleList(g);
    this.popup((box, close) => {
      box.classList.add('night');
      const season = S.seasonRow(g);
      box.appendChild(el('', this.t('title_telescopeSpecialReward'), 'h2'));
      box.appendChild(el('msg', season ? this.t(`title_telescope_season${season.index}`, season.name) : ''));
      const sc = el('ts-scroll');
      for (const q of [1, 2, 3]) {
        const rows = list.filter(r => r.quarter === q);
        if (!rows.length) continue;
        sc.appendChild(el('ts-sect', `${q} / 3${q > g.state.telescope.quarter ? '  🔒' : ''}`));
        const grid = el('ts-grid');
        for (const r of rows) grid.appendChild(this.rewardCell(r.rt, r.rv, { got: r.owned, locked: r.locked && !r.owned }));
        sc.appendChild(grid);
      }
      box.appendChild(sc);
      box.appendChild(el('msg', this.t('observe_star_shop_notice_01')));
      box.lastChild.style.fontSize = '24px';
      this.okButton(box, close);
    });
  },

  // ================= observatory =================
  buildObservatory() {
    const g = this.game;
    this.obs = this.obs || { cat: 0, tab: 0, slot: 0, pick: 0, fat: 0 };
    this.root.classList.add('ts-obs');
    if (this.obs.cat >= g.state.cats.length) this.obs.cat = 0;
    const root = this.root;
    this.title = el('ts-title', this.t('title_build110'));
    this.title.style.top = '30px';
    this.sub = el('ts-sub', this.t('info_observatory'));
    this.sub.style.top = '104px';
    root.append(this.title, this.sub);
    root.appendChild(this.exitButton(() => this.close()));
    root.lastChild.style.left = '485px'; root.lastChild.style.top = '1760px';
    this.drawObs();
  },

  curCat() { return this.game.state.cats[this.obs.cat]; },

  skillIcon(ab, lv) {
    const d = el('ski');
    d.appendChild(this.icon(`skill${ab.index}`, 84, 84, FOOD));
    if (lv && ab.type === 101) d.appendChild(el('lv', '★'.repeat(lv)));
    return d;
  },
  mainText(s) { return this.t('ability101', null, this.t(`title_build${s.ability.subIndex}`, `#${s.ability.subIndex}`), `+${this.game.feat.cats.abilityValue(this.game, s.ability, s.lv)}%`); },
  subText(ab) { return this.t(`abilityS_${ab.subIndex}`, null, `+${this.game.feat.cats.abilityValue(this.game, ab, 1)}%`); },
  skillBox(sk, label) {
    const C = this.game.feat.cats, g = this.game;
    const d = el('sk');
    if (sk == null) { d.appendChild(this.icon('skill_unknown', 84, 84, FOOD)); d.appendChild(el('', label, 'b')); return d; }
    d.appendChild(this.skillIcon(sk.ability, sk.lv));
    const tx = el('');
    tx.appendChild(el('', label, 'small'));
    tx.appendChild(el('', sk.sub ? this.subText(sk.ability) : this.mainText(sk), 'b'));
    d.appendChild(tx);
    return d;
  },
  skillPair(g, cat) {
    const C = g.feat.cats, ab = i => C.ability(g, i);
    const sk = this.S.skillsOf(g, cat);
    return { main: { ability: ab(sk.main.a), lv: sk.main.lv }, sub: sk.sub != null ? { ability: ab(sk.sub), sub: true, lv: 1 } : null };
  },

  drawObs() {
    const g = this.game, S = this.S, t = this.t, o = this.obs;
    if (!this.root) return;
    for (const c of [...this.root.children]) if (c !== this.title && c !== this.sub && !c.classList.contains('ts-exit')) c.remove();
    const cat = this.curCat();
    if (!cat) return;
    const stage = el('stage');
    const row = g.t.CatType.find(c => c.index === cat.type);
    const img = this.icon(`cat${cat.type}`, 330, 330, FOOD, 'cat');
    stage.appendChild(img);
    stage.appendChild(el('nm', t(`catType${cat.type}`, `#${cat.type}`)));
    stage.appendChild(el('dots', g.state.cats.map((_, i) => (i === o.cat ? '●' : '○')).join('')));
    for (const [side, d] of [['l', -1], ['r', 1]]) {
      const a = el(`arrow ${side}`);
      a.appendChild(this.icon('bg_arrow', 40, 70, UI1));
      if (side === 'l') a.firstChild.style.transform = 'scaleX(1)';
      else a.firstChild.style.transform = 'scaleX(-1)';
      a.onclick = () => { o.cat = (o.cat + d + g.state.cats.length) % g.state.cats.length; this.drawObs(); };
      stage.appendChild(a);
    }
    this.root.appendChild(stage);
    stage.style.pointerEvents = 'auto';
    const sp = this.skillPair(g, cat);
    const skills = el('skills');
    skills.append(this.skillBox(sp.main, t('mainSkill', 'Kỹ năng chính')), this.skillBox(sp.sub, t('subSkill', 'Kỹ năng phụ')));
    skills.firstChild.firstChild; // eslint-disable-line no-unused-expressions
    this.root.appendChild(skills);
    const tabs = el('tabs');
    ['title_catGacha0', 'title_catGacha1', 'title_catGacha2', 'title_catGacha3'].forEach((k, i) => {
      const b = el(`tab ${o.tab === i ? 'on' : ''}`, t(k));
      b.onclick = () => { o.tab = i; this.drawObs(); };
      tabs.appendChild(b);
    });
    this.root.appendChild(tabs);
    const body = el('body');
    this.root.appendChild(body);
    [() => this.tabNewCat(body, cat), () => this.tabLook(body, cat), () => this.tabSkill(body, cat), () => this.tabCustom(body, cat)][o.tab]();
  },

  costButton(c, label, fn) {
    const S = this.S, g = this.game;
    const kids = [];
    if (c.ticket) {
      const lk = this.look(c.ticket, 1);
      kids.push(this.icon(lk.sprite, 58, 58, lk.atlas), el('', `${S.count(g, c.ticket)}/${c.n}`, 'span'));
    } else if (c.ads) kids.push(el('', `${this.t('showAds')}  ${S.adsLeft(g)} / ${TS.ADS_PER_DAY}`, 'span'));
    else kids.push(this.icon('icon_gem', 54, 54, UI1), el('', String(c.gems), 'span'));
    const b = this.pill(c.ads ? 'green' : 'blue', c.ads ? 470 : 380, 112, () => fn(c), ...kids);
    if (!S.canPay(g, c)) b.classList.add('off');
    return b;
  },

  warn(body, cat, kind, slot) {
    const w = this.S.warnings(this.game, cat, kind, slot);
    for (const k of w) body.appendChild(el('warn', this.t(k).replace(/\n/g, ' ')));
    return w;
  },

  preview(body, cat, what) {
    const g = this.game, S = this.S;
    const p = el('prev');
    const sp = this.skillPair(g, cat);
    const cur = el('');
    cur.style.display = 'flex'; cur.style.gap = '10px';
    cur.appendChild(this.icon(`cat${cat.type}`, 110, 110, FOOD));
    if (what !== 'look') cur.appendChild(this.skillIcon(sp.main.ability, sp.main.lv));
    if (what !== 'look' && sp.sub) cur.appendChild(this.skillIcon(sp.sub.ability, 0));
    const nw = el('');
    nw.style.display = 'flex'; nw.style.gap = '10px';
    if (what !== 'skill') nw.appendChild(el('q', '?'));
    if (what !== 'look') nw.appendChild(el('q', '?'));
    p.append(cur, el('arr', '▶'), nw);
    body.appendChild(p);
  },

  tabNewCat(body, cat) {
    const S = this.S, g = this.game, t = this.t;
    body.appendChild(el('info', t('info_newCat').replace(/\n/g, ' ')));
    this.preview(body, cat, 'both');
    this.warn(body, cat, 'newcat');
    const acts = el('acts');
    acts.appendChild(this.costButton(S.cost(g, 'newcat'), '', () => this.run(cat, 'newcat', 0)));
    body.appendChild(acts);
    body.appendChild(el('warn', t('mas_needDicision')));
    body.lastChild.style.color = '#7a604a';
  },

  tabLook(body, cat) {
    const S = this.S, g = this.game, t = this.t;
    body.appendChild(el('info', t('info_catGacha1')));
    this.preview(body, cat, 'look');
    this.warn(body, cat, 'look');
    const acts = el('acts');
    acts.appendChild(this.costButton(S.cost(g, 'ads'), '', () => this.run(cat, 'ads', 0)));
    acts.appendChild(this.costButton(S.cost(g, 'look'), '', () => this.run(cat, 'look', 0)));
    body.appendChild(acts);
    body.appendChild(el('warn', t('guidebook_observ_2')));
    body.lastChild.style.color = '#7a604a';
  },

  tabSkill(body, cat) {
    const S = this.S, g = this.game, t = this.t, o = this.obs;
    const info = [t('info_catGacha2'), t('info_catGacha2_1'), t('info_catGacha2_2')][o.slot];
    body.appendChild(el('info', info));
    const sub = el('sub');
    ['info_catGacha2', 'info_catGacha2_1', 'info_catGacha2_2'].forEach((k, i) => {
      const ch = el(`chip ${o.slot === i ? 'sel' : ''}`, [t('title_catGacha2'), t('subSkill', 'Kỹ năng phụ'), t('mainSkill', 'Kỹ năng chính')][i]);
      ch.style.width = '240px';
      ch.style.fontSize = '28px';
      ch.onclick = () => { o.slot = i; this.drawObs(); };
      sub.appendChild(ch);
    });
    body.appendChild(sub);
    this.preview(body, cat, 'skill');
    if (o.slot === 1) body.appendChild(el('warn', t('info_catGacha2_1_1').replace(/\[[^\]]*\]/g, '')));
    if (o.slot === 1) body.appendChild(el('warn', t('info_catGacha2_1_2').replace(/\[[^\]]*\]/g, '')));
    this.warn(body, cat, 'skill', o.slot);
    const acts = el('acts');
    acts.appendChild(this.costButton(S.cost(g, 'skill', o.slot), '', () => this.run(cat, 'skill', o.slot)));
    body.appendChild(acts);
  },

  tabCustom(body, cat) {
    const S = this.S, g = this.game, t = this.t, o = this.obs;
    body.appendChild(el('info', t('title_catGacha3')));
    const chips = el('chips');
    const mk = (type, label, n, fn, selKey) => {
      const lk = this.look(type, 1);
      const c = el(`chip ${n < 1 ? 'none' : ''} ${o.pick === selKey ? 'sel' : ''}`);
      c.append(this.icon(lk.sprite, 96, 96, lk.atlas), el('', label, 'div'), el('n', String(n)));
      c.onclick = fn;
      return c;
    };
    S.limitedTickets(g).forEach(tk => chips.appendChild(mk(tk.type, t(`ticketObservatory_catType${tk.cat}`, `#${tk.type}`).replace(/^V[ée]\s*/i, ''), tk.n, () => { o.pick = tk.type; o.fat = -1; this.drawObs(); }, tk.type)));
    [0, 1, 2].forEach(f => chips.appendChild(mk(1403 + f, t(`ticketObservatory_catType_fatType${f}`).replace(/^V[ée]\s*/i, ''), S.count(g, 1403 + f), () => { o.pick = 1403 + f; this.drawObs(); }, 1403 + f)));
    chips.appendChild(mk(1408, t('ticketObservatory_catType_random_fatType').replace(/^V[ée]\s*/i, ''), S.count(g, 1408), () => { o.pick = 1408; this.drawObs(); }, 1408));
    body.appendChild(chips);
    const pick = o.pick || 0;
    const acts = el('acts');
    if (pick >= 1501 && pick <= 1524) {
      const c = S.cost(g, 'limited', pick - 1501);
      body.appendChild(el('info', t(`info_catChange${TS.LIMITED[pick - 1501]}`, t('info_catChange_limitType'))));
      this.warn(body, cat, 'select');
      acts.appendChild(this.costButton(c, '', () => this.run(cat, 'limited', pick - 1501)));
    } else if (pick >= 1403 && pick <= 1405) {
      body.appendChild(el('info', t(`info_catChange_fatType${pick - 1403}`)));
      this.warn(body, cat, 'select');
      acts.appendChild(this.costButton(S.cost(g, 'select', pick - 1403), '', () => this.run(cat, 'select', pick - 1403)));
    } else if (pick === 1408) {
      body.appendChild(el('info', t('info_ticketObservatory_catType_random_fatType').replace(/\n/g, ' ')));
      this.warn(body, cat, 'randomFat');
      acts.appendChild(this.costButton(S.cost(g, 'randomFat'), '', () => this.run(cat, 'randomFat', 0)));
    } else body.appendChild(el('warn', t('info_catChange_limitType')));
    body.appendChild(acts);
  },

  run(cat, kind, arg) {
    const S = this.S, g = this.game;
    const r = S.change(g, cat, kind, arg);
    if (!r.ok) {
      this.hud.toast({ gems: this.t('notEnoughGem', 'Không đủ ngọc'), ticket: this.t('ticketObservatory'), ads: this.t('showAds') }[r.reason] || r.reason);
      return;
    }
    this.drawObs();
    this.obsResult(cat, r);
  },

  obsResult(cat, r) {
    const g = this.game, t = this.t;
    const colBefore = r.before, colAfter = r.after;
    this.popup((box, close) => {
      box.classList.add('night');
      box.appendChild(el('', t('title_catGacha' + (r.kind === 'skill' ? 2 : r.kind === 'newcat' ? 0 : r.kind === 'ads' || r.kind === 'look' ? 1 : 3)), 'h2'));
      const row = el('prev');
      row.style.color = '#fff';
      const side = (s, n) => {
        const d = el('');
        d.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px';
        d.appendChild(this.icon(`cat${s.type}`, 210, 210, FOOD));
        d.appendChild(el('', t(`catType${s.type}`, `#${s.type}`), 'b'));
        d.lastChild.style.fontSize = '30px';
        const ab = el('');
        ab.style.cssText = 'display:flex;gap:8px';
        const m = g.feat.cats.ability(g, s.main.a);
        ab.appendChild(this.skillIcon(m, s.main.lv));
        if (s.sub != null) ab.appendChild(this.skillIcon(g.feat.cats.ability(g, s.sub), 0));
        d.appendChild(ab);
        return d;
      };
      row.append(side(colBefore), el('arr', '▶'), side(colAfter));
      box.appendChild(row);
      this.okButton(box, close);
    }, 'night');
  },

  // ================= star tree =================
  buildTree() {
    const S = this.S, g = this.game;
    this.root.appendChild(this.exitButton(() => this.close()));
    this.root.lastChild.style.left = '485px'; this.root.lastChild.style.top = '1790px';
    this.tbody = el('ts-tree');
    this.tbody.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    this.root.appendChild(this.tbody);
    if (!S.starState(g).cat) this.pickCat();
    this.drawTree();
  },

  pickCat() {
    const S = this.S, g = this.game, t = this.t;
    if (!S.starActive(g)) return;
    this.popup((box, close) => {
      box.classList.add('ts-pick');
      box.appendChild(el('', t('startree_popup_select_cat_title'), 'h2'));
      box.appendChild(el('msg', t('startree_popup_select_cat_decs')));
      S.starCats(g).forEach((c, i) => {
        const row = el('cat3');
        row.appendChild(this.icon(`cat${c.catType}`, 140, 140, FOOD));
        const tx = el('');
        tx.appendChild(el('', t(`startree_popup_select_cat_name${i + 1}`), 'b'));
        tx.appendChild(el('', t(`startree_popup_select_cat_info${i + 1}`), 'small'));
        row.appendChild(tx);
        row.onclick = () => this.confirmCat(i + 1, c.catType);
        box.appendChild(row);
      });
      box.appendChild(this.pill('gray', 330, 100, () => { close(); this.close(); }, this.t('cancel', 'Hủy')));
    });
  },
  confirmCat(i, catType) {
    const t = this.t;
    this.popup((box, close) => {
      box.appendChild(el('', t(`startree_popup_select_cat_name${i}`), 'h2'));
      box.appendChild(el('msg', t('startree_popup_partner_confirm_desc', null, t(`startree_popup_select_cat_name${i}`))));
      const row = el('');
      row.style.cssText = 'display:flex;gap:20px';
      row.appendChild(this.pill('gray', 300, 100, () => this.pickCat(), t('no')));
      row.appendChild(this.pill('blue', 300, 100, () => { this.S.starPick(this.game, i); this.closePop(); this.drawTree(); }, t('yes')));
      box.appendChild(row);
    });
  },

  treeArt(level) {
    // the star tree grows with its level (10 prefabs in the original, Resources startree/startree1-10): trunk, canopy, stars
    const w = el('');
    const sc = 0.45 + level * 0.075;
    w.style.cssText = `position:relative;width:520px;height:${380 + level * 34}px`;
    const trunk = el('');
    trunk.style.cssText = `position:absolute;left:50%;bottom:0;width:${40 + level * 8}px;height:${60 + level * 28}px;margin-left:${-(20 + level * 4)}px;background:linear-gradient(90deg,#6b4423,#9a6a3a,#6b4423);border-radius:10px 10px 4px 4px`;
    w.appendChild(trunk);
    const blobs = [[0, 0, 1], [-1, 0.5, 0.8], [1, 0.5, 0.8], [-0.5, 1.2, 0.7], [0.6, 1.2, 0.7], [0, 1.8, 0.6]];
    const n = Math.min(blobs.length, 1 + Math.ceil(level / 2));
    for (let i = 0; i < n; i++) {
      const [bx, by, bs] = blobs[i];
      const b = el('');
      const r = 150 * bs * sc + 40;
      b.style.cssText = `position:absolute;left:calc(50% + ${bx * 120 * sc}px);bottom:${70 + level * 22 + by * 100 * sc}px;width:${r * 2}px;height:${r * 1.7}px;margin-left:${-r}px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#8fe07a,#3e9c4f 70%,#2a7040);box-shadow:inset 0 -10px 0 #0002`;
      w.appendChild(b);
    }
    const stars = Math.min(24, level * 3);
    for (let i = 0; i < stars; i++) {
      const s = el('', '★');
      const a = (i * 137.5) % 360, rr = 40 + ((i * 53) % 130) * sc;
      s.style.cssText = `position:absolute;left:calc(50% + ${Math.cos(a * Math.PI / 180) * rr * 1.2}px);bottom:${150 + level * 26 + Math.sin(a * Math.PI / 180) * rr * 0.8 + 60}px;font-size:${24 + (i % 3) * 8}px;color:#ffe066;text-shadow:0 0 10px #ffd54a;animation:ts-tw ${1.6 + (i % 5) * 0.4}s ease-in-out infinite;animation-delay:${(i % 7) * 0.3}s`;
      w.appendChild(s);
    }
    return w;
  },

  drawTree() {
    const g = this.game, S = this.S, t = this.t;
    const box = this.tbody;
    if (!box) return;
    const st = S.starState(g), active = S.starActive(g), pr = S.starProgress(g);
    box.textContent = '';
    const title = el('ts-title', t('startree_popup_main_title'));
    title.style.top = '36px';
    const sky = el('sky');
    const ground = el('ground');
    sky.appendChild(ground);
    const tb = el('treebox');
    tb.appendChild(this.treeArt(pr.level));
    sky.appendChild(tb);
    box.append(title, sky);
    const gauge = el('gauge');
    gauge.appendChild(el('', t('startree_level', null, pr.level), 'span'));
    const bar = el('bar');
    const fill = el('', null, 'i'); fill.style.width = `${Math.round(pr.ratio * 100)}%`;
    bar.append(fill, el('', pr.need ? `${Math.floor(pr.into).toLocaleString()} / ${Math.floor(pr.need).toLocaleString()}` : t('startree_exp_max'), 'span'));
    gauge.appendChild(bar);
    box.appendChild(gauge);
    if (st.cat) {
      const cats = S.starCats(g), c = cats[st.cat - 1];
      const part = el('partner');
      part.appendChild(this.icon(`cat${c.catType}`, 120, 120, FOOD));
      part.appendChild(el('', t(`startree_popup_select_cat_name${st.cat}`)));
      box.appendChild(part);
    }
    // groups
    const groups = el('groups');
    const pts = S.starGroups(g);
    S.starCats(g).forEach((c, i) => {
      const d = el(`grp ${st.cat === i + 1 ? 'mine' : ''}`);
      d.appendChild(this.icon(`cat${c.catType}`, 80, 80, FOOD));
      d.appendChild(el('', t(`startree_popup_select_cat_name${i + 1}`)));
      d.appendChild(el('', pts[i].toLocaleString(), 'b'));
      groups.appendChild(d);
    });
    box.appendChild(groups);
    box.appendChild(el('mine-pt', `${t('startree_popup_growth_cat_point')}  ·  ${st.points}`));
    // skills
    const sk = el('skills');
    for (const k of S.starSkills(g)) {
      const cd = S.starCooldown(g, k.index);
      const d = el(`skill ${cd > 0 ? 'cool' : ''}`);
      const ic = this.icon(k.icon, 90, 90, EQUIP[2]);
      ic.style.display = 'block'; ic.style.margin = '0 auto 6px';
      d.append(ic, el('', `+${k.point}`, 'b'));
      d.appendChild(el('', cd > 0 ? this.remainText(cd) : t('startree_ready', 'Sẵn sàng'), 'small'));
      d.onclick = () => this.useSkill(k.index);
      sk.appendChild(d);
    }
    box.appendChild(sk);
    // participation rewards
    const rw = el('rewards');
    rw.appendChild(el('', `${t('startree_popup_reward_info_title')}  (${st.count})`, 'h4'));
    const list = el('rlist');
    for (const r of S.starRewardsP(g)) {
      const lk = this.look(r.rt, r.rv);
      const d = el(`rs ${r.got ? 'got' : r.ready ? 'ready' : ''}`);
      d.appendChild(lk.sprite ? this.icon(lk.sprite, 64, 64, lk.atlas) : el('', '🎁'));
      d.appendChild(el('n', `x${r.rv}`));
      d.appendChild(el('', r.got ? '✔' : `${r.count}`, 'small'));
      if (r.ready) d.onclick = () => { const got = S.starClaimP(g, r.index); if (got) { this.fx(`+${got.value}`, 480, 1400); this.drawTree(); } };
      list.appendChild(d);
    }
    rw.appendChild(list);
    box.appendChild(rw);
    const gb = this.pill(S.starRewardsG(g).some(r => r.ready) ? 'green' : 'blue', 700, 100, () => this.growthRewards(), t('startree_popup_reward_title'));
    gb.classList.add('growbtn');
    gb.style.pointerEvents = 'auto';
    box.appendChild(gb);
    box.appendChild(el('remain', active ? `${t('time_eventFinish')}  ${this.remainText(S.starRemain(g))}` : t('event_end', 'Sự kiện đã kết thúc')));
    for (const c of box.querySelectorAll('.skill, .rs.ready')) c.style.pointerEvents = 'auto';
  },

  useSkill(index) {
    const S = this.S, g = this.game, t = this.t;
    if (!S.starState(g).cat) return this.pickCat();
    const cd = S.starCooldown(g, index);
    if (cd > 0) { this.hud.toast(t(`startree_skillcooldown_desc0${index}`, null, this.remainText(cd))); return; }
    const r = S.starUse(g, index);
    if (!r) { this.hud.toast(t('startree_other_skill_use_fail')); return; }
    this.fx(`+${r.point}`, 470, 800);
    this.drawTree();
  },

  growthRewards() {
    const S = this.S, g = this.game, t = this.t;
    this.popup((box, close) => {
      box.appendChild(el('', t('startree_popup_reward_title'), 'h2'));
      box.appendChild(el('msg', t('startree_popup_reward_desc')));
      const sc = el('ts-scroll');
      const grid = el('ts-grid');
      for (const r of S.starRewardsG(g)) {
        const c = this.rewardCell(r.rt, r.rv, { count: r.rv, got: r.got, locked: !r.got && !r.ready });
        c.insertBefore(el('small', t('startree_level', null, r.level)), c.firstChild);
        if (r.ready) {
          c.style.borderColor = '#3fb35f';
          c.style.cursor = 'pointer';
          c.style.pointerEvents = 'auto';
          c.onclick = () => { const got = S.starClaimG(g, r.level); if (got) { this.closePop(); this.drawTree(); this.growthRewards(); } };
        }
        grid.appendChild(c);
      }
      sc.appendChild(grid);
      box.appendChild(sc);
      this.okButton(box, close);
    });
  },
};
