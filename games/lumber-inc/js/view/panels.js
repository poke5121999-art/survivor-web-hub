// Full-screen panels over the HUD, built from the original uGUI prefabs by ui.js:
//   HirePanel    EmployeeUpgradePanel (art/ui/panels/employeeupgradepanel.json): hire and upgrade a hut's 12 workers.
//   UpgradePanel SkinPanel, tab ViewUpgrade (art/ui/panels/skinpanel.json): the player cabin's backpack / speed / axe rows
//                (UpgradePanelItem). The skin and bike tabs, the buff board and the capsule button are not in this build.
// Both sit above the HUD in `host`, swallow pointerdown so the joystick underneath does not move, and close with the X.

import { setSlider } from './ui.js';

const fmt = n => {
  n = Math.floor(n);
  if (n < 1000) return `${n}`;
  const u = ['K', 'M', 'B', 'T'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0).replace(/\.0+$/, '')}${u[i]}`;
};

const COIN = 'common_money_icon_01', GEM = 'common_diamonds_icon_01';
const TITLE = { timber: 'TitleEmpTimber', carrier: 'TitleEmpCarrier', builder: 'TitleEmpBuilder' };
const NO_BAR = ['residentCoin', 'sponCoin', 'tickets', 'hometown'];
const SHADOW = '1.2px 1.8px 0 rgba(0,0,0,0.455)';

class Modal {
  constructor(host, ui, pj, sim, prefab, hide) {
    Object.assign(this, { host, ui, pj, sim, prefab, hide, built: null, last: '' });
    this.wrap = document.createElement('div');
    this.wrap.className = 'panel-wrap';
    this.wrap.style.cssText = 'position:absolute;inset:0;z-index:20;display:none;pointer-events:auto;overflow:hidden';
    // The HUD turns pointerdown into a joystick drag; a panel on top must not let it through.
    for (const ev of ['pointerdown', 'mousedown', 'touchstart']) this.wrap.addEventListener(ev, e => e.stopPropagation());
    host.appendChild(this.wrap);
    addEventListener('resize', () => { if (this.isOpen) this.rebuild(); });
    ui.prefetch(pj, prefab, [COIN, GEM]);
  }

  get isOpen() { return this.wrap.style.display !== 'none'; }

  open(...a) {
    this.wrap.style.display = 'block';
    this.begin(...a);
    this.rebuild();
  }

  close() {
    this.wrap.style.display = 'none';
  }

  rebuild() {
    this.wrap.textContent = '';
    this.p = this.ui.panel(this.pj, this.prefab, this.wrap, { hide: this.hide });
    this.last = '';
    this.setup();
    this.update(true);
  }

  // Header bits every panel has: coin and gem counters, close button.
  bar() {
    const p = this.p;
    const txt = n => p.get(n) && p.get(n).querySelector('[data-name="txtCoins"]');
    this.coinText = txt('coin');
    this.gemText = txt('gem');
    const x = p.get('btnClose');
    if (x) { x.classList.add('btn'); x.addEventListener('click', e => { e.stopPropagation(); this.close(); }); }
  }

  barText() {
    const S = this.sim.state;
    if (this.coinText) this.coinText.textContent = fmt(S.coins);
    if (this.gemText) this.gemText.textContent = fmt(S.gems);
  }

  // A scrolling box laid over a prefab Viewport / Scroll View node (a sibling of it: that node's own tint alpha and its
  // UIMask sprite are Unity clipping helpers and would hide or paint over the rows).
  scroller(node) {
    const sc = document.createElement('div');
    const { left, top, width, height } = node.style;
    sc.style.cssText = `position:absolute;left:${left};top:${top};width:${width};height:${height};overflow-y:auto;overflow-x:hidden;pointer-events:auto;touch-action:pan-y;scrollbar-width:none`;
    node.parentElement.appendChild(sc);
    node.style.display = 'none';
    return sc;
  }

  sprite(el, name) {
    if (!el) return;
    this.ui.setSprite(el, name);
  }

  show(el, on, disp = '') { if (el) el.style.display = on ? disp : 'none'; }

  // Fills a button's cost label (TextMeshPro in the prefab, so no text node): icon + number, or a plain word.
  cost(label, icon, s, size) {
    Object.assign(label.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: `${size}px`, color: '#fff', textShadow: SHADOW, whiteSpace: 'nowrap' });
    label.innerHTML = '';
    if (icon) { const i = document.createElement('img'); i.src = this.ui.url(icon); i.alt = ''; i.style.cssText = `height:${size * 1.25}px;width:auto`; label.appendChild(i); }
    const sp = document.createElement('span');
    sp.textContent = s;
    label.appendChild(sp);
  }

  dim(btn, can) {
    btn.style.filter = can ? '' : 'grayscale(0.85) brightness(0.8)';
    btn.dataset.can = can ? '1' : '0';
  }
}

export class HirePanel extends Modal {
  constructor(host, ui, panelJson, sim) {
    // special = the super-worker card, desBg = its hint banner: advanced skins are not in this build. btnAdUp = ad upgrade.
    super(host, ui, panelJson, sim, 'EmployeeUpgradePanel', [...NO_BAR, 'special', 'desBg', 'item']);
    this.hut = 0;
  }

  begin(hut) { this.hut = hut; }

  setup() {
    const { ui, sim, p } = this;
    this.bar();
    const kind = sim.crew.kind(this.hut);
    const t = p.get('TxtTitle');
    if (t) ui.text(t, t._node, ui.t(TITLE[kind]));
    // The prefab's Scroll View has a flexible height (fills what is left under the title); ui.js does not lay that out.
    const view = p.get('Scroll View'), title = p.get('Title')._box, top = title.y + title.h;
    Object.assign(view.style, { top: `${top}px`, height: `${parseFloat(p.root.style.height) - top}px` });
    const sc = this.scroller(view);
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,370px);grid-auto-rows:538.46px;justify-content:center;padding-bottom:30px;position:relative';
    sc.appendChild(grid);
    this.cells = sim.crew.hutRows(this.hut).map((row, i) => {
      const box = document.createElement('div');
      box.style.cssText = 'position:relative;width:370px;height:538.46px';
      grid.appendChild(box);
      const out = ui.instance(this.pj, this.prefab, 'item', box, { hide: ['btnAdUp'] });
      const c = { box, out, row, i };
      const btn = out.get('btnUp');
      btn.classList.add('btn');
      btn.addEventListener('click', e => { e.stopPropagation(); this.press(c); });
      const lock = document.createElement('div');
      const bc = out.get('BtnContent')._box;
      lock.className = 'n t';
      lock.style.cssText = `left:${bc.x + 25}px;top:${bc.y}px;width:${bc.w - 50}px;height:${bc.h}px;font-size:24px;color:#fff;align-items:center;justify-content:center;text-align:center;line-height:1.1;text-shadow:${SHADOW}`;
      lock.textContent = ui.t('EmpLockedDes');
      out.root.appendChild(lock);
      c.lock = lock;
      return c;
    });
  }

  press(c) {
    const { crew } = this.sim;
    const hired = crew.hired(this.hut);
    if (c.i < hired) crew.upgrade(c.row);
    else if (c.i === hired) crew.hire(this.hut);
    if (this.onPress) this.onPress(c);
    this.update(true);
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    const { sim } = this, S = sim.state, crew = sim.crew;
    const sig = `${Math.floor(S.coins)}|${Math.floor(S.gems)}|${crew.hired(this.hut)}|${crew.hutRows(this.hut).map(r => crew.level(r)).join('')}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    this.barText();
    this.cells.forEach(c => this.fill(c));
  }

  fill(c) {
    const { ui, sim } = this, crew = sim.crew, { out, row, i } = c;
    const hired = crew.hired(this.hut);
    const state = i < hired ? 'hired' : i === hired ? 'next' : 'locked';
    const lv = state === 'hired' ? crew.level(row) : 1;
    const rows = crew.levelRows.get(row.WorkerUpgradeId) || [];
    const tools = sim.config.EmployeeToolInfoConf;
    const toolOf = r => r && tools.find(x => x.Id === r.ToolInfoId);
    const cur = toolOf(rows[lv - 1]), nxt = toolOf(rows[lv]);
    const f = path => out.find(path);
    this.sprite(f('iconbg/icon'), cur && cur.EmpBg);
    this.sprite(f('iconbg/icon/icon (1)'), row.Icon);
    this.sprite(f('iconbg/icon/toolIcon'), cur && cur.EmpToolIcon);
    f('iconbg/icon/TxtLv').textContent = ui.t(lv >= 2 ? 'Advance' : 'Normal');
    this.sprite(f('tools/currentbg'), cur && cur.IconBg);
    this.sprite(f('tools/currentbg/icon'), cur && cur.Icon);
    ui.text(f('tools/currentbg/lv'), f('tools/currentbg/lv')._node, ui.t('Normal'));
    this.sprite(f('tools/nextBg'), nxt && nxt.IconBg);
    this.sprite(f('tools/nextBg/icon'), nxt && nxt.Icon);
    ui.text(f('tools/nextBg/lv'), f('tools/nextBg/lv')._node, ui.t('Advance'));
    const hasNext = lv < rows.length && !!nxt;
    this.show(out.get('nextBg'), hasNext);
    const locked = state === 'locked';
    // mask / maskIcon: a black 60 % overlay in Unity. the tinted 9-slice washes out, so draw plain black.
    [['mask', 36], ['maskIcon', 30]].forEach(([n, r]) => {
      const m = out.get(n);
      const a = m._node.image.color[3];
      if (m._skin) m._skin.style.display = 'none';
      Object.assign(m.style, { backgroundColor: `rgba(0,0,0,${a})`, borderRadius: `${r}px` });
      this.show(m, locked);
    });
    this.show(c.lock, locked, 'flex');
    const btn = out.get('btnUp'), label = out.get('txtCost');
    let max = false;
    if (state === 'hired') {
      const g = crew.upgradeCost(row);
      max = g < 0;
      if (!max) { this.cost(label, GEM, fmt(g), 34); this.dim(btn, sim.state.gems >= g); }
    } else if (state === 'next') {
      const k = row.CostNum;
      this.cost(label, k > 0 ? COIN : null, k > 0 ? fmt(k) : ui.t('Upgrade_free'), 34);
      this.dim(btn, sim.state.coins >= k);
    }
    this.show(btn, !locked && !max);
    this.show(out.get('TxtMax'), max, 'flex');
    this.show(out.get('BtnContent'), !locked);
  }
}

export class UpgradePanel extends Modal {
  constructor(host, ui, panelJson, sim) {
    // Skin and bike tabs, skin-buff board, capsule and use/ad buttons: the skin system is not in this build.
    super(host, ui, panelJson, sim, 'SkinPanel', [...NO_BAR, 'iconBike', 'buffbg', 'btnBuff', 'btnEgg', 'Pre_BtnAd', 'Pre_BtnUse',
      'TxtUsed', 'TextPic', 'togPlayer', 'togBike', 'Scroll View', 'ViewBikeSkin', 'item']);
  }

  begin() {}

  get tracks() {
    const r = this.sim.role;
    const { ui } = this;
    return [
      { id: r.PackUpId, icon: 'playercabin_ upgrade_icon_bag', name: ui.t('Upgrade_backpack'), fmt: v => `${v}` },
      { id: r.SpdUpId, icon: 'playercabin_ upgrade_icon_speed', name: ui.t('Upgrade_movespd'), fmt: v => `${+v.toFixed(2)}` },
      { id: r.ToolUpId, icon: 'playercabin_ upgrade_icon_log', name: ui.t('Upgrade_power'), fmt: v => `${Math.round(v)}` },
    ];
  }

  setup() {
    const { ui, p } = this;
    this.bar();
    this.show(p.get('togUpgrade').querySelector('[data-name="off"]'), false);
    const skin = p.get('iconSkin');
    if (skin) this.sprite(skin, 'icon_Role001');
    const nm = p.find('title/Text (Legacy)');
    if (nm) ui.text(nm, nm._node, ui.t('NewSkin_name_Cowboy'));
    const sc = this.scroller(p.find('ViewUpgrade/Viewport'));
    const list = document.createElement('div');
    list.style.cssText = 'position:relative;width:100%;padding-bottom:20px';
    sc.appendChild(list);
    this.rows = this.tracks.map(t => {
      const box = document.createElement('div');
      box.style.cssText = 'position:relative;width:700px;height:144.14px;margin:0 auto';
      list.appendChild(box);
      const out = ui.instance(this.pj, this.prefab, 'ViewUpgrade/Viewport/item', box, {});
      const c = { t, out };
      const btn = out.get('btnUp');
      btn.classList.add('btn');
      btn.addEventListener('click', e => { e.stopPropagation(); this.sim.buyUpgrade(t.id); this.update(true); });
      this.show(out.find('btnUp/free'), false);
      this.show(out.get('txtBtnUp'), false);
      const d = out.get('txtDesc');
      Object.assign(d.style, { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', paddingLeft: '10px', color: '#a4531b', fontSize: '32px', lineHeight: '1.15', whiteSpace: 'pre' });
      this.sprite(out.find('item/icon'), t.icon);
      return c;
    });
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    const { sim } = this, S = sim.state;
    const sig = `${Math.floor(S.coins)}|${this.tracks.map(t => sim.up.level(t.id)).join(',')}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    this.barText();
    this.rows.forEach(({ t, out }) => {
      const lv = sim.up.level(t.id), cost = sim.up.nextCost(t.id), max = cost < 0;
      const now = t.fmt(sim.up.value(t.id));
      const next = max ? null : t.fmt(sim.up.tracks.get(t.id)[lv].v);
      out.get('txtDesc').textContent = max ? `${t.name}\n${now}` : `${t.name}\n${now} > ${next}`;
      out.get('txtLvl').textContent = max ? this.ui.t('UpgradeMaxLv') : `Lv.${lv}`;
      const btn = out.get('btnUp'), label = out.get('txtCost');
      if (max) {
        this.cost(label, null, this.ui.t('UpgradeMaxLv'), 34);
        this.dim(btn, false);
      } else {
        this.cost(label, COIN, fmt(cost), 34);
        this.dim(btn, S.coins >= cost);
      }
    });
  }
}

// UpgradeBuildingStarPanel: opens when a research star has been paid on a machine's frame and offers the machine for that
// star (UpgradeBuildingStarPanel_Item, index 0..2): the normal one for free, or the senior one (ResearchUpgradeConf "Ad"
// columns, +StarAddAd exp) for 10 gems or for an ad, which the hub grants at once.
export class StarPanel extends Modal {
  constructor(host, ui, panelJson, sim) {
    super(host, ui, panelJson, sim, 'UpgradeBuildingStarPanel', []);
    const icons = sim.config.ResearchUpgradeConf.flatMap(r => (r.BuildIcon || '').split('|'));
    ui.prefetch(panelJson, this.prefab, [...icons, 'employeepanel_ads_icon']);
  }

  begin(id) { this.id = id; }

  setup() {
    const { ui, p, sim } = this;
    this.bar();
    const shut = p.get('BtbClose');
    if (shut) { shut.style.pointerEvents = 'auto'; shut.addEventListener('click', e => { e.stopPropagation(); this.close(); }); }
    const name = p.get('Name');
    ui.text(name, name._node, ui.t(`Building_${this.id}`));
    const r = sim.starRow(this.id);
    const icons = (r.BuildIcon || '').split('|');
    this.items = ['bg (1)/Item1', 'bg (1)/Item1 (3)', 'bg (1)/Item1 (2)'].map((path, index) => {
      const el = p.find(path);
      const q = n => el.querySelector(`[data-name="${n}"]`);
      const rows = [...q('content').children].filter(c => c.classList.contains('n'));
      const btn = q('BtnChose');
      btn.classList.add('btn');
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (sim.chooseMachine(this.id, index)) this.close(); else this.update(true);
      });
      this.sprite(q('icon'), icons[index]);
      return { el, index, rows, btn, label: q('txtfree'), using: q('Text (Legacy)') };
    });
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    const { sim, ui } = this, S = sim.state, id = this.id;
    const sig = `${S.gems}|${sim.stars(id)}|${S.starAd[id]}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    this.barText();
    const r = sim.starRow(id);
    const lv = this.p.get('lv');
    lv.textContent = `LV.${sim.stars(id) + 1}`;
    const c = sim.factoryConf.get(id);
    const base = c && c.EfficiencyUpId ? sim.up.value(c.EfficiencyUpId) : 0;
    const chosen = S.starAd[id] ? 1 : null;
    for (const it of this.items) {
      const ad = it.index > 0;
      const income = ad ? r.IncomeAddAd : r.IncomeAdd, cut = ad ? r.ProdSpdAddAdUI : r.ProdSpdAddUI, cap = ad ? r.CapacitAddAd : r.CapacitAdd;
      const [inc, spd, room, exp] = it.rows;
      inc.querySelector('[data-name="val"]').textContent = `+${income}`;
      // Seconds cut per item shown as the speed-up they give, the way the senior row's "+484.2%" placeholder reads.
      const fast = base > cut && cut > 0 ? (base / (base - cut) - 1) * 100 : 0;
      this.show(spd, fast > 0);
      spd.querySelector('[data-name="val"]').textContent = `+${fast.toFixed(1)}%`;
      room.querySelector('[data-name="val"]').textContent = `+${cap}`;
      if (exp) exp.querySelector('[data-name="val"]').textContent = `+${r.StarAddAd}`;
      const used = chosen !== null && ad;
      this.show(it.using, used);
      this.show(it.btn, !used && chosen === null);
      if (it.index === 0) this.cost(it.label, null, ui.t('Choice'), 34);
      else if (it.index === 1) { this.cost(it.label, GEM, '10', 34); this.dim(it.btn, S.gems >= 10); }
      else this.cost(it.label, 'employeepanel_ads_icon', ui.t('Choice'), 34);
    }
  }
}

// MotoProvidePanel / UAVProvidePanel (bonuspanel.json, rules/map1-extra.md 25-27, 43): rent the bike or the drone
// for 180 s. The first rent is free, later ones cost an ad, which the hub grants at once. btnBuy is the permanent IAP
// purchase, not in this build.
export class RentPanel extends Modal {
  constructor(host, ui, panelJson, sim, prefab, what) {
    super(host, ui, panelJson, sim, prefab, ['btnBuy', 'GameObject (1)']);
    this.what = what;
  }

  begin() {}

  setup() {
    const { p, sim } = this;
    for (const n of ['BtnClose', 'Button']) {
      const x = p.get(n);
      if (x) { x.classList.add('btn'); x.addEventListener('click', e => { e.stopPropagation(); this.close(); }); }
    }
    const ad = p.get('btnAd');
    ad.classList.add('btn');
    ad.addEventListener('click', e => { e.stopPropagation(); sim.extras.rent(this.what); this.close(); });
  }

  update() {}
}

// OrderManPanel (ordermanpanel.json, rules/map1-extra.md 33-36): the special order's progress, time left and reward;
// Claim pays 60 x the 5 s factory output, the ad button twice that. The resident coin reward belongs to the town.
export class OrderPanel extends Modal {
  constructor(host, ui, panelJson, sim) {
    super(host, ui, panelJson, sim, 'OrderManPanel', ['D_1 (1)', 'Image (1)']);
  }

  begin() {}

  setup() {
    const { p, sim } = this;
    const x = p.get('BtnClose');
    x.classList.add('btn');
    x.addEventListener('click', e => { e.stopPropagation(); this.close(); });
    const press = (name, rate) => {
      const b = p.get(name);
      b.classList.add('btn');
      b.addEventListener('click', e => { e.stopPropagation(); if (rate) sim.extras.claimOrder(rate); this.close(); });
      return b;
    };
    this.claim = press('Pre_BtnClaim', 1);
    this.ad = press('Pre_BtnAd', 2);
    this.go = press('Pre_BtnGoTo', 0);
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    const { sim, p } = this, X = sim.extras, o = sim.state.order;
    const left = Math.max(0, o.ends - X.clock);
    const sig = `${o.cur}|${o.need}|${Math.floor(left)}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    const done = X.orderDone();
    const t = p.find('Bg/need/content/D_1/Text (Legacy)');
    if (t) t.innerHTML = `<span style="color:${done ? '#1DC967' : '#fff'}">${o.cur}</span>/${o.need}`;
    const bar = p.find('Bg/need/content/D_1/Slider');
    if (bar) setSlider(bar, o.need ? o.cur / o.need : 0);
    this.show(p.find('Bg/need/content/D_1/Image'), done);
    const time = p.find('Bg/Title/time');
    if (time) time.textContent = `${Math.floor(left / 3600)}:${String(Math.floor(left / 60) % 60).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    const r = p.find('Bg/Image/content/Image/txtReward');
    if (r) r.textContent = fmt(X.orderReward());
    this.show(this.claim, done);
    this.show(this.ad, done);
    this.show(this.go, !done);
  }
}

// AdWorkerTimberPanel / AdWorkerCarrierPanel (adboxpanel.json, rules/workers-guide-camera.md A 23-26): hire the spot's
// super worker for 180 s with its fixed tool, bag and speed; 10 gems or an ad (granted at once here).
export class SpecialPanel extends Modal {
  constructor(host, ui, panelJson, sim, prefab, title) {
    super(host, ui, panelJson, sim, prefab, ['txtDesc (1)']);
    this.title = title;
  }

  begin(id) { this.b = this.sim.world.buildings.get(id); }

  setup() {
    const { p, sim, ui } = this;
    const x = p.get('BtnClose (1)');
    x.classList.add('btn');
    x.addEventListener('click', e => { e.stopPropagation(); this.close(); });
    const d = p.get('txtDesc');
    if (d) ui.text(d, d._node, ui.t(this.title));
    const st = this.title === 'TimberAdTitle' ? { tool: 100, bag: 12, spd: 3.4 } : { bag: 12, spd: 4 };
    for (const [k, v] of Object.entries(st)) {
      const row = p.byName.get(k) ? p.get(k) : p.get(`${k} (1)`);
      const val = row && row.querySelector('[data-name="val"]');
      if (val) val.textContent = `${v}`;
    }
    const hire = (name, gems) => {
      const b = p.get(name);
      b.classList.add('btn');
      b.addEventListener('click', e => { e.stopPropagation(); if (sim.crew.hireSpecial(this.b, gems)) this.close(); });
      return b;
    };
    this.gemBtn = hire('Pre_BtnGem (1)', true);
    hire('Pre_BtnAd', false);
    const t = this.gemBtn.querySelector('[data-name="Text (Legacy)"]');
    if (t) t.textContent = '10';
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    const sig = `${this.sim.state.gems}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    this.dim(this.gemBtn, this.sim.state.gems >= 10);
  }
}

// Town panels (buildhousepanel.json, rules/hometown.md E5-E8, G2). The house a lot builds, its resident and buff
// come from HomeTownBookConf -> HouseInfoConf / ResidentInfoConf.
const pct = v => `${+(v * 100).toFixed(1)}%`;
function townInfo(sim, lotId) {
  const T = sim.town, b = sim.world.buildings.get(lotId), book = T.book(b);
  const house = T.houses.get(+book.HouseIds.split(';')[0]);
  const res = adv => T.residentRows.get(+(adv ? book.AdvResidentId : book.NormalResidentId).split(';')[0]);
  return { T, b, book, house, res };
}

// StartBuildChoicePanel: build the lot normally (free, 3 exp) or advanced (an ad: 5 exp, half the squares).
export class ChoicePanel extends Modal {
  constructor(host, ui, panelJson, sim) { super(host, ui, panelJson, sim, 'StartBuildChoicePanel', []); }

  begin(id) { this.id = id; }

  setup() {
    const { p, sim, ui } = this;
    const { T, book, house, res } = townInfo(sim, this.id);
    const x = p.get('Button (Legacy)');
    x.classList.add('btn');
    x.addEventListener('click', e => { e.stopPropagation(); this.close(); });
    const set = (path, s) => { const el = p.find(path); if (el) el.textContent = s; };
    set('reward/coinBg/coin/Text (Legacy)', fmt(book.RewardCoinRatio * sim.extras.valuable()));
    set('reward/gembg/coin/Text (Legacy)', `${book.RewardSpinCoin}`);
    for (const [card, adv] of [['itemNormal', false], ['itemAdv', true]]) {
      const r = res(adv);
      set(`${card}/Text (Legacy)`, ui.t(adv ? 'buildAdv' : 'buildNormal'));
      set(`${card}/content/item/Text (Legacy)`, ui.t('Build'));
      set(`${card}/content/item/val`, ui.t(adv ? house.NameAdv : house.Name));
      set(`${card}/content/item (1)/Text (Legacy)`, ui.t('Need materials'));
      // The count text grows leftwards from a zero-wide box; its square icon sits just left of the digits.
      const need = p.find(`${card}/content/item (1)/val`);
      if (need) {
        const img = need.querySelector('[data-name="Image"]');
        need.textContent = '';
        const sp = document.createElement('span');
        sp.textContent = `${adv ? book.NeedWoodAdv : book.NeedWood}`;
        need.appendChild(sp);
        if (img) { need.appendChild(img); img.style.left = `${-(sp.offsetWidth + parseFloat(img.style.width) + 6)}px`; }
      }
      this.sprite(p.find(`${card}/iconBg/icon`), adv ? house.HouseIconAdv : house.HouseIcon);
      const buff = p.find(`${card}/content/item (2)/Text (Legacy)`);
      if (buff) buff.innerHTML = `${ui.t(r.BuffDesc)} <span style="color:${adv ? '#AF1CE3' : '#50A11B'}">+${pct(r.BuffVal)}</span>`;
      set(`${card}/content/${adv ? 'itemstar' : 'itemstar (1)'}/val`, `+${adv ? book.UnlockStarAd : book.UnlockStarNormal}`);
    }
    const go = (name, adv) => {
      const b = p.get(name);
      b.classList.add('btn');
      b.addEventListener('click', e => { e.stopPropagation(); if (T.startBuild(this.id, adv)) this.close(); });
    };
    go('BtnChoice', false);
    go('Pre_BtnAd', true);
  }

  update() {}
}

// BuildHousePanel (claim): the full site pays coins and spin coins, x2 for an ad; then the tenant is chosen.
export class ClaimPanel extends Modal {
  constructor(host, ui, panelJson, sim) { super(host, ui, panelJson, sim, 'BuildHousePanel', ['startRoot', 'Text (Legacy)/Image (2)']); }

  begin(id) { this.id = id; }

  setup() {
    const { p, sim, ui } = this;
    const { T, book, house } = townInfo(sim, this.id);
    const x = p.get('BtnClose');
    x.classList.add('btn');
    x.addEventListener('click', e => { e.stopPropagation(); this.close(); });
    const set = (path, s) => { const el = p.find(path); if (el) el.textContent = s; };
    const name = ui.t(T.lot(this.id).adv ? house.NameAdv : house.Name);
    set('namebg/val', name);
    set('namebg (1)/val', name);
    set('reward/coinBg/coin/Text (Legacy)', fmt(T.reward()));
    set('reward/townCoinBg/coin (1)/Text (Legacy)', `${book.RewardSpinCoin}`);
    set('buildingRoot/Slider/Progress', '100%');
    const bar = p.find('buildingRoot/Slider');
    if (bar) setSlider(bar, 1);
    this.show(p.find('buildingRoot/Text (Legacy)'), false);
    const claim = (name, rate) => {
      const b = p.get(name);
      b.classList.add('btn');
      b.addEventListener('click', e => {
        e.stopPropagation();
        if (T.claim(rate)) { this.close(); if (this.onClaim) this.onClaim(book.Id); }
      });
    };
    claim('BtnTransport', 1);
    claim('Pre_BtnAd', 2);
  }

  update() {}
}

// ResidentAdvPanel: the tenant for one slot of a house, the normal one or the advanced one (an ad).
export class TenantPanel extends Modal {
  constructor(host, ui, panelJson, sim) { super(host, ui, panelJson, sim, 'ResidentAdvPanel', ['tips', 'new']); }

  begin(book, level) { this.book = book; this.level = level; }

  setup() {
    const { p, sim, ui } = this;
    const T = sim.town, book = T.books.get(this.book);
    for (const [card, adv] of [['item', false], ['itemAdv', true]]) {
      const r = T.residentRows.get(+(adv ? book.AdvResidentId : book.NormalResidentId).split(';')[this.level - 1]);
      const el = p.find(`/${card}`) || p.get(card);
      const q = n => el.querySelector(`[data-name="${n}"]`);
      this.sprite(q('icon'), r.Icon);
      q('TxtName').textContent = ui.t(r.Name);
      q('TxtQuality').textContent = ui.t(adv ? 'Resident_quality3' : 'Resident_quality1');
      q('TxtBuff').textContent = `${ui.t(r.BuffDesc)} (+${pct(r.BuffVal)})`;
      const sp = q('TxtBuffSpecial');
      if (sp && r.SpecialBuffDesc) { sp.style.display = ''; sp.textContent = ui.t(r.SpecialBuffDesc); }
      const btn = q(adv ? 'Pre_BtnAd ' : 'Pre_BtnGem');
      btn.classList.add('btn');
      btn.addEventListener('click', e => { e.stopPropagation(); if (T.setResident(this.book, this.level, adv)) this.close(); });
    }
  }

  update() {}
}

// MapPanel (mappanel.json, rules/meta.md A2-A5): the three maps. A map is open once the map before it reached its
// UnlockPlayerLv (15); the current one is marked; tapping another open map enters it. levelOf(m) reads each map's save.
export class MapPanel extends Modal {
  constructor(host, ui, panelJson, sim, current, levelOf) {
    super(host, ui, panelJson, sim, 'MapPanel', ['BtnReward', 'newMap', 'newMap (1)', 'hometown', 'tickets', 'residentCoin', 'sponCoin']);
    Object.assign(this, { current, levelOf });
  }

  begin() {}

  open_(m) { return m === 0 || this.levelOf(m - 1) >= this.sim.config.MapConf[m].UnlockPlayerLv; }

  setup() {
    const { p, sim, ui } = this;
    this.bar();
    const x = p.find('Scroll View/btnClose');
    if (x) { x.classList.add('btn'); x.addEventListener('click', e => { e.stopPropagation(); this.close(); }); }
    sim.config.MapConf.forEach((conf, m) => {
      const el = p.find(`Content/map${m}`);
      if (!el) return;
      const q = n => el.querySelector(`[data-name="${n}"]`);
      q('txtTitle').textContent = ui.t(conf.MapName);
      this.sprite(q('mapIcon'), conf.IconName);
      const can = this.open_(m);
      this.show(q('currentMap'), m === this.current);
      this.show(q('locked'), !can);
      this.show(q('content'), !can);
      const need = el.querySelector('[data-name="content"] [data-name="Text (Legacy)"]');
      if (need && m > 0) need.textContent = `${ui.t(sim.config.MapConf[m - 1].MapName)}`;
      const lv = el.querySelector('[data-name="star"] [data-name="star"]');
      if (lv) lv.textContent = `${conf.UnlockPlayerLv}`;
      el.classList.add('btn');
      el.addEventListener('click', e => { e.stopPropagation(); if (can && m !== this.current && this.onEnter) this.onEnter(m); });
    });
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    const sig = `${Math.floor(this.sim.state.coins)}|${this.sim.state.gems}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    this.barText();
  }
}
