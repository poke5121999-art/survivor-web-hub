// Full-screen panels over the HUD, built from the original uGUI prefabs by ui.js:
//   HirePanel    EmployeeUpgradePanel (art/ui/panels/employeeupgradepanel.json): hire and upgrade a hut's 12 workers.
//   UpgradePanel SkinPanel, tab ViewUpgrade (art/ui/panels/skinpanel.json): the player cabin's backpack / speed / axe rows
//                (UpgradePanelItem). The skin and bike tabs, the buff board and the capsule button are not in this build.
// Both sit above the HUD in `host`, swallow pointerdown so the joystick underneath does not move, and close with the X.

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
