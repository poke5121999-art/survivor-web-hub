// Gacha machine and skin panels (art/ui/panels/spineggpanel.json, skinpanel.json; rules/meta.md D 17-21, G 27-30):
//   SpinPanel   SpinEggPanel: spin coin / daily ad draws, a short capsule shake, then SkinRewardPanel (claim x1 / ad x3)
//               and SpinEggRatePanel (display-only odds table). The Spine machine in the prefab is not exported.
//   SkinsPanel  SkinPanel, tabs Role / Vehicle (the Upgrade tab hands over to UpgradePanel through onUpgrade): skin cards,
//               unlock, wear, and the ability board. The 3D model swap on wear is the lead's job (skinWear event).

import { Modal } from './panels.js';
import { setSlider } from './ui.js';

const SHADOW = '1.2px 1.8px 0 rgba(0,0,0,0.455)';
const ADS = 'employeepanel_ads_icon';

const icon = (row, piece) => (piece && row.PieceIcon) || row.SkinIcon;
const lookup = (meta, id, bike) => (bike ? meta.bikeRows : meta.skinRows).get(id);

// Text of a TextMeshPro node (no text in the prefab): centred, white, outlined by a shadow.
function tmp(el, s, size, color = '#fff') {
  Object.assign(el.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: '1.05',
    fontSize: `${size}px`, color, textShadow: color === '#fff' ? SHADOW : 'none', whiteSpace: 'pre-line' });
  el.textContent = s;
}

const press = (el, fn) => {
  el.classList.add('btn');
  el.addEventListener('click', e => { e.stopPropagation(); fn(); });
};

// SkinRewardPanel: the prize of one draw. Claim gives the pieces once, the ad button three times over.
class RewardPanel extends Modal {
  constructor(host, ui, pj, sim) {
    super(host, ui, pj, sim, 'SkinRewardPanel', ['UIEffect for SkinRewardPanel']);
    this.wrap.style.zIndex = 22;
    this.wrap.style.background = 'rgba(0,0,0,0.65)';
  }

  begin(prize, done) { this.prize = prize; this.done = done; }

  setup() {
    const { p, ui, sim } = this, pr = this.prize, meta = sim.meta;
    const row = lookup(meta, pr.id, pr.bike);
    this.sprite(p.get('icon'), icon(row, true));
    const name = p.get('Text');
    const s = meta.skin(pr.id, pr.bike);
    name.innerHTML = `<div style="text-align:center">${ui.t(row.SkinName)}<br><span style="font-size:0.62em">+${pr.n} &nbsp; ${s.pieces}/${meta.need(pr.id, pr.bike)}</span></div>`;
    const take = (btn, ad) => press(p.get(btn), () => {
      if (!meta.claimDraw(pr, ad)) return;
      this.close();
      if (this.done) this.done();
    });
    take('Pre_BtnGet', false);
    take('Pre_BtnAd', true);
  }

  update() {}
}

// SpinEggRatePanel: SpinRewardRateConf, Type 1 = rarity groups with their share, Type 2 = each prize's share in its group.
class RatePanel extends Modal {
  constructor(host, ui, pj, sim) {
    super(host, ui, pj, sim, 'SpinEggRatePanel', ['group']);
    this.wrap.style.zIndex = 22;
    this.wrap.style.background = 'rgba(0,0,0,0.65)';
  }

  begin() {}

  setup() {
    const { p, ui, sim } = this, meta = sim.meta;
    press(p.get('BtnClose (1)'), () => this.close());
    const sc = this.scroller(p.find('Scroll View/Viewport'));
    const rows = sim.config.SpinRewardRateConf;
    for (const g of rows.filter(r => r.Type === 1)) {
      const box = document.createElement('div');
      box.style.cssText = 'position:relative;width:634px;height:54.32px;margin:12px auto 8px';
      sc.appendChild(box);
      const t = ui.instance(this.pj, this.prefab, 'group/title', box, {});
      ui.setSprite(t.root, g.Bg);
      const tx = t.get('Text (Legacy)');
      tx.textContent = `${ui.t(g.Title)} (${g.Rate}%)`;
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,300px);gap:8px 12px;justify-content:center;padding-bottom:6px';
      sc.appendChild(grid);
      for (const r of rows.filter(q => q.Type === 2 && q.Group === g.Group)) {
        const id = +r.Para, bike = id >= 100, sk = lookup(meta, id, bike);
        if (!sk) continue;
        const cell = document.createElement('div');
        cell.style.cssText = 'position:relative;width:300px;height:120px';
        grid.appendChild(cell);
        // The prefab item is a zero-size anchor; its children sit around the centre.
        const mid = document.createElement('div');
        mid.style.cssText = 'position:absolute;left:150px;top:60px;width:0;height:0';
        cell.appendChild(mid);
        const it = ui.instance(this.pj, this.prefab, 'group/info/item', mid, {});
        const back = document.createElement('div');
        back.className = 'n';
        back.style.cssText = 'left:0;top:0;width:300px;height:120px';
        cell.insertBefore(back, mid);
        ui.sprite(back, it.root._node.image);
        if (it.root._skin) it.root._skin.style.display = 'none';
        this.sprite(it.get('Image'), icon(sk, true));
        const nm = it.get('Text (Legacy)');
        ui.text(nm, nm._node, ui.t(sk.SkinName));
        ui.text(it.get('rate'), it.get('rate')._node, `${r.Rate}%`);
      }
    }
    const pad = document.createElement('div');
    pad.style.height = '24px';
    sc.appendChild(pad);
  }

  update() {}
}

export class SpinPanel extends Modal {
  constructor(host, ui, pj, sim) {
    super(host, ui, pj, sim, 'SpinEggPanel', ['residentCoin', 'hometown', 'tickets']);
    this.reward = new RewardPanel(host, ui, pj, sim);
    this.rate = new RatePanel(host, ui, pj, sim);
    this.busy = false;
    ui.prefetch(pj, 'SkinRewardPanel', ['mainpanel_icon_capsule', ADS]);
  }

  begin() { this.busy = false; }

  close() {
    this.reward.close();
    this.rate.close();
    super.close();
  }

  setup() {
    const { p, sim } = this;
    press(p.get('BtnClose'), () => this.close());
    press(p.get('BtnRate'), () => this.rate.open());
    press(p.get('BtnSkin'), () => {
      this.close();
      if (this.onSkins) this.onSkins();
      else if (window.__li && window.__li.skins) window.__li.skins.open();
    });
    const title = p.find('title (1)/title');
    if (title) title.textContent = this.ui.t('SpinEggTitle');
    const sk = p.get('Skin');
    if (sk) sk.textContent = this.ui.t('Custom_skin').toUpperCase();
    const txt = n => p.get(n).querySelector('[data-name="txtCoins"]');
    this.coinText = txt('coin');
    this.gemText = txt('gem');
    this.spinText = txt('sponCoin');
    this.coinBtn = p.get('BtnCostCoin');
    this.adBtn = p.get('BtnAd');
    this.coinLabel = this.coinBtn.querySelector('[data-name="Text (Legacy)"]');
    this.adLabel = this.adBtn.querySelector('[data-name="TextPic"]');
    // The machine is a Spine skeleton that is not exported: an idle capsule bobs in its place.
    const bg = p.get('bg');
    if (bg) {
      this.idle = document.createElement('img');
      this.idle.src = this.ui.url('mainpanel_icon_capsule');
      this.idle.alt = '';
      this.idle.style.cssText = 'position:absolute;left:50%;top:34%;width:220px;margin-left:-110px;pointer-events:none;z-index:4';
      bg.appendChild(this.idle);
      if (this.idle.animate) this.idle.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(0)' }],
        { duration: 1600, iterations: Infinity, easing: 'ease-in-out' });
    }
    press(this.coinBtn, () => this.go(false));
    press(this.adBtn, () => this.go(true));
  }

  go(ad) {
    const meta = this.sim.meta;
    if (this.busy || !meta.canDraw(ad)) return;
    const prize = meta.draw(ad);
    if (!prize) return;
    this.busy = true;
    this.update(true);
    this.capsule(() => {
      this.busy = false;
      if (!this.isOpen) return;
      this.update(true);
      this.reward.open(prize, () => this.update(true));
    });
  }

  // About a second of a capsule shaking and popping over the machine; a plain timer when animate() is missing.
  capsule(done) {
    const bg = this.p && this.p.get('bg');
    if (!bg || !bg.animate) { setTimeout(done, 300); return; }
    const img = document.createElement('img');
    img.src = this.ui.url('mainpanel_icon_capsule');
    img.alt = '';
    img.style.cssText = 'position:absolute;left:50%;top:34%;width:220px;margin-left:-110px;pointer-events:none;z-index:5';
    bg.appendChild(img);
    if (this.idle) this.idle.style.visibility = 'hidden';
    const a = img.animate([
      { transform: 'translateY(-60px) rotate(0) scale(0.8)', offset: 0 },
      { transform: 'translateY(0) rotate(-14deg) scale(1)', offset: 0.2 },
      { transform: 'rotate(14deg) scale(1)', offset: 0.35 },
      { transform: 'rotate(-14deg) scale(1)', offset: 0.5 },
      { transform: 'rotate(10deg) scale(1.05)', offset: 0.65 },
      { transform: 'rotate(0) scale(1.15)', offset: 0.8 },
      { transform: 'rotate(0) scale(1.9)', opacity: 0, offset: 1 },
    ], { duration: 1000, easing: 'ease-in-out', fill: 'forwards' });
    a.onfinish = () => { img.remove(); if (this.idle) this.idle.style.visibility = ''; done(); };
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    const { sim, ui } = this, S = sim.state, meta = sim.meta;
    const left = meta.spinAdLeft();
    const sig = `${Math.floor(S.coins)}|${S.gems}|${meta.M.spin}|${left}|${this.busy}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    this.barText();
    this.spinText.textContent = `${meta.M.spin}`;
    const can = meta.canDraw(false);
    Object.assign(this.coinLabel.style, { fontSize: '34px', color: '#fff', textShadow: SHADOW, whiteSpace: 'nowrap' });
    this.coinLabel.innerHTML = `<span style="color:${can ? '#fff' : '#FF5B47'}">${meta.M.spin}</span>/1`;
    this.dim(this.coinBtn, can && !this.busy);
    if (left > 0) this.cost(this.adLabel, ADS, `${left}/5`, 34);
    else this.cost(this.adLabel, null, ui.t('SpinEggDailyEmpty'), 21);
    this.adLabel.style.whiteSpace = 'normal';
    this.adLabel.style.textAlign = 'center';
    this.dim(this.adBtn, meta.canDraw(true) && !this.busy);
  }
}

// Clicks on a dimmed button are ignored by the click handlers above (canDraw is checked there too).
const TABS = [{ bike: false, view: 'Scroll View', item: 'Scroll View/Viewport/item', tog: 'togPlayer' },
  { bike: true, view: 'ViewBikeSkin', item: 'ViewBikeSkin/Viewport/item', tog: 'togBike' }];

export class SkinsPanel extends Modal {
  constructor(host, ui, pj, sim) {
    super(host, ui, pj, sim, 'SkinPanel', ['residentCoin', 'sponCoin', 'hometown', 'tickets', 'ViewUpgrade', 'btnBuff']);
    this.tab = 0;
  }

  // open('bike') starts on the vehicle tab.
  begin(which) { if (which !== undefined) this.tab = which === 'bike' || which === 1 ? 1 : 0; }

  setup() {
    const { ui, p, sim } = this;
    this.bar();
    this.togs = TABS.map(t => p.get(t.tog));
    const up = p.get('togUpgrade');
    const label = (tog, s) => {
      const on = tog.querySelector('[data-name="des"]'), off = tog.querySelector('[data-name="off"]');
      on.textContent = s;
      off.textContent = s;
    };
    label(up, ui.t('Upgrade_btn'));
    label(this.togs[0], ui.t('TogPlayerSkin'));
    label(this.togs[1], ui.t('TogBikeSkin'));
    press(up, () => { if (this.onUpgrade) this.onUpgrade(); else this.close(); });
    this.togs.forEach((tg, i) => press(tg, () => { this.tab = i; this.update(true); }));
    const egg = p.get('btnEgg');
    const eggText = egg.querySelector('[data-name="Addition"]');
    if (eggText) eggText.textContent = ui.t('SpinEggEnter');
    press(egg, () => {
      this.close();
      if (this.onSpin) this.onSpin();
      else if (window.__li && window.__li.spin) window.__li.spin.open();
    });
    const board = p.get('buffbg');
    board.querySelector('[data-name="TxtTitle"]').textContent = ui.t('SkinBuffTitle');
    this.vals = [...board.children].filter(c => c.dataset.name === 'val');
    ['SkinBuffSpd', 'SkinBuffBag', 'SkinBuffDmg'].forEach((k, i) => { this.vals[i].firstElementChild.textContent = ui.t(k); });
    const desc = p.find('Scroll View/title/Text (Legacy)');
    if (desc) desc.textContent = ui.t('SkinPanelDesc');
    this.views = TABS.map((t, ti) => {
      const view = ti ? p.get('ViewBikeSkin') : p.find('content/Scroll View');
      const sc = this.scroller(p.find(`${t.view}/Viewport`));
      const list = document.createElement('div');
      list.style.cssText = 'position:relative;width:700px;display:flex;flex-wrap:wrap;padding-bottom:30px';
      sc.appendChild(list);
      const cards = sim.meta.rows(t.bike).sort((a, b) => a.Id - b.Id).map(row => {
        const box = document.createElement('div');
        box.style.cssText = 'position:relative;width:232.88px;height:328.08px;flex:none';
        list.appendChild(box);
        const out = ui.instance(this.pj, this.prefab, t.item, box, {});
        const c = { row, out, bike: t.bike, mask: out.get('mask') };
        const m = c.mask;
        const a = m._node.image.color[3];
        if (m._skin) m._skin.style.display = 'none';
        Object.assign(m.style, { backgroundColor: `rgba(0,0,0,${a})`, borderRadius: '18px', pointerEvents: 'none' });
        out.root.classList.add('btn');
        out.root.addEventListener('click', e => { e.stopPropagation(); this.tap(c); });
        return c;
      });
      return { view, cards };
    });
  }

  tap(c) {
    const meta = this.sim.meta;
    if (meta.canUnlock(c.row.Id, c.bike)) meta.unlock(c.row.Id, c.bike);
    else meta.wear(c.row.Id, c.bike);
    this.update(true);
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    const { sim, ui } = this, meta = sim.meta, M = meta.M, S = sim.state;
    const sig = `${Math.floor(S.coins)}|${S.gems}|${this.tab}|${M.skin}|${M.bike}|${JSON.stringify([M.skins, M.bikes])}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    this.barText();
    // tabs
    const up = this.p.get('togUpgrade');
    this.show(up.querySelector('[data-name="on"]'), false);
    this.show(up.querySelector('[data-name="off"]'), true);
    this.togs.forEach((tg, i) => {
      this.show(tg.querySelector('[data-name="on"]'), i === this.tab);
      this.show(tg.querySelector('[data-name="off"]'), i !== this.tab);
      const dot = tg.querySelector('[data-name^="Pre_UIRedpoint"]');
      this.show(dot, meta.rows(!!i).some(r => meta.canUnlock(r.Id, !!i)));
    });
    this.views.forEach((v, i) => this.show(v.view, i === this.tab));
    // worn skin and the ability board
    const worn = lookup(meta, M.skin, false) || lookup(meta, 0, false);
    this.sprite(this.p.get('iconSkin'), worn.SkinIconFull || worn.SkinIcon);
    const bk = M.bike >= 0 ? lookup(meta, M.bike, true) : null;
    this.show(this.p.get('iconBike'), !!bk);
    if (bk) this.sprite(this.p.get('iconBike'), bk.SkinIcon);
    const nm = this.p.find('info/title/Text (Legacy)');
    ui.text(nm, nm._node, ui.t((this.tab && bk ? bk : worn).SkinName));
    const b = meta.skinBuff();
    [b.Spd, b.BackPack, b.Dmg].forEach((v, i) => {
      const el = this.vals[i];
      let t = [...el.childNodes].find(n => n.nodeType === 3);
      if (!t) el.insertBefore(t = document.createTextNode(''), el.firstChild);
      t.nodeValue = `+${+v.toFixed(2)}`;
    });
    this.views[this.tab].cards.forEach(c => this.fill(c));
  }

  fill(c) {
    const { ui, sim } = this, meta = sim.meta, { row, out, bike } = c, id = row.Id;
    const s = meta.skin(id, bike), need = meta.need(id, bike);
    const own = s.unlock, can = meta.canUnlock(id, bike);
    const worn = own && (bike ? meta.M.bike : meta.M.skin) === id;
    const q = n => out.get(n);
    this.sprite(q('bg'), row.SkinBg);
    this.sprite(q('icon'), row.SkinIcon);
    const nm = q('namebg').querySelector('[data-name="Text (Legacy)"]');
    ui.text(nm, nm._node, ui.t(row.SkinName));
    const slider = out.root.querySelector('[data-name^="Slider"]');
    const withBar = !own && !can && need > 0;
    const pre = !own && !can && need <= 0;
    this.show(q('select'), worn);
    this.show(q('ImgUsed'), worn);
    this.show(q('mask'), !own && !can);
    this.show(q('ImgLocked'), !own && !can);
    this.show(slider, withBar);
    this.show(q('TxtOwend'), own, 'flex');
    this.show(q('TxtLocked'), can, 'flex');
    this.show(q('TxtLockedPre'), pre, 'flex');
    if (own) tmp(q('TxtOwend'), ui.t(worn ? 'SkinUsed' : 'SkinOwend'), 30, '#57433c');
    if (can) tmp(q('TxtLocked'), ui.t('SkinUnlockReady'), 30);
    if (pre) tmp(q('TxtLockedPre'), ui.t(row.UnlockDesc), 20, '#0e2554');
    if (withBar) {
      setSlider(slider, Math.min(1, s.pieces / need));
      slider.querySelector('[data-name="Text (Legacy)"]').textContent = `${s.pieces}/${need}`;
    }
    this.show(out.root.querySelector('[data-name^="Pre_UIRedpoint"]'), can);
  }
}
