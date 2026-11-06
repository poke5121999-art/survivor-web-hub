// Phone menu, 8-day sign-in and the closed-app offline reward (rules/meta.md E, F 26, H), from the original prefabs:
//   PhonePanel   (art/ui/panels/phonepanel.json): one icon per PhoneConf row; apps with a panel in this build open it.
//   SignPanel    (signpanel.json): the 8 reward cells, one claim per login day.
//   OfflinePanel (offlinepanel.json): coins earned while the game was closed, claim or x2 (instant ad).

import { Modal, fmt } from './panels.js';
import { setSlider } from './ui.js';

const SHADOW = '1.2px 1.8px 0 rgba(0,0,0,0.455)';
const SKIN_DAY8 = 13;

export class PhonePanel extends Modal {
  constructor(host, ui, pj, sim, apps = {}) {
    super(host, ui, pj, sim, 'PhonePanel', ['item', 'popRoot']);
    this.apps = apps;
  }

  begin() {}

  setup() {
    const { ui, p, sim } = this;
    for (const n of ['BtnClose', 'BtnClosePop']) {
      const b = p.get(n);
      if (!b) continue;
      b.classList.add('btn');
      b.addEventListener('click', e => { e.stopPropagation(); if (n === 'BtnClose') this.close(); else this.show(this.pop, false); });
    }
    this.pop = p.get('popRoot');
    this.show(this.pop, false);
    this.show(p.get('BtnClosePop'), false);
    const content = p.get('Content');
    const w = parseFloat(content.style.width) || 654;
    const cell = { w: 163, h: 185 }, cols = Math.max(1, Math.floor(w / cell.w));
    const view = p.get('Viewport');
    const sc = this.scroller(view);
    const grid = document.createElement('div');
    grid.style.cssText = `position:relative;width:${cols * cell.w}px;height:${Math.ceil(sim.config.PhoneConf.length / cols) * cell.h + 25}px;margin:0 auto`;
    sc.appendChild(grid);
    // popRoot lives inside the Scroll View but under the Viewport: lift it above the scroller.
    this.pop.parentElement.appendChild(this.pop);
    this.pop.style.zIndex = '3';
    this.rows = sim.config.PhoneConf.map((row, i) => {
      const box = document.createElement('div');
      box.style.cssText = `position:absolute;left:${(i % cols) * cell.w}px;top:${Math.floor(i / cols) * cell.h}px;width:${cell.w}px;height:${cell.h}px`;
      grid.appendChild(box);
      const out = ui.instance(this.pj, this.prefab, 'item', box, {});
      // The template node has no size: its children hang off the cell centre.
      Object.assign(out.root.style, { left: `${cell.w / 2}px`, top: `${cell.h / 2}px` });
      this.sprite(out.get('icon'), row.IconResName);
      this.sprite(out.get('mask'), row.IconResName);
      const nm = out.get('name');
      ui.text(nm, nm._node, ui.t(row.AppName));
      const c = { row, out, box };
      box.classList.add('btn');
      box.addEventListener('click', e => { e.stopPropagation(); this.tap(c, i); });
      return c;
    });
  }

  locked(row) {
    return row.UnlockLevel > this.sim.state.level || !(row.TargetUI in this.apps);
  }

  tap(c, i) {
    const { row } = c, { ui } = this;
    if (row.UnlockLevel > this.sim.state.level) { this.note('REQUIRES:', `Unlocks at Lv.${row.UnlockLevel}`, i); return; }
    if (!(row.TargetUI in this.apps)) { this.note('', ui.t('Under_Construction'), i); return; }
    this.close();
    this.apps[row.TargetUI]();
  }

  // The prefab bubble is a content-sized vertical layout (height 0 here), so it is sized and its two texts placed by hand.
  // It sits above the tapped icon, kept inside the Scroll View.
  note(title, body, i) {
    const { pop } = this, v = this.p.get('Scroll View');
    const W = parseFloat(v.style.width), cols = Math.floor(W / 163);
    const cx = Math.max(145, Math.min(W - 145, (W - cols * 163) / 2 + (i % cols) * 163 + 81.5));
    const cy = 25 + Math.floor(i / cols) * 185 + 92.5;
    Object.assign(pop.style, { left: `${cx - 50}px`, top: `${cy - 50}px`, zIndex: '3' });
    const des = this.p.get('popDes');
    des.style.height = '150px';
    const t = [...pop.querySelectorAll('[data-name^="TxtTitle"]')];
    const set = (el, top, h, s, size) => {
      if (!el) return;
      Object.assign(el.style, { display: s ? 'flex' : 'none', left: '10px', top: `${top}px`, width: '251px', height: `${h}px`, fontSize: `${size}px`, color: '#7a3d12', textShadow: 'none', whiteSpace: 'normal', justifyContent: 'center', alignItems: 'center', textAlign: 'center' });
      el.textContent = s;
    };
    set(t[0], 18, 44, title, 26);
    set(t[1], title ? 62 : 36, title ? 64 : 80, body, 26);
    this.show(pop, true);
    this.show(this.p.get('BtnClosePop'), true);
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    const { sim } = this, m = sim.meta, S = sim.state;
    const red = {
      SkinPanel: m.skinsReady() > 0,
      SignPanel: m.signReady(),
      SpinEggPanel: m.spinAdLeft() > 0 || m.M.spin > 0,
      DailyTaskPanel: m.tasksReady() + m.achievesReady() > 0,
      ChatPanelRootUIPanel: !!(sim.chat && sim.chat.on && (sim.chat.hasRequest() || sim.chat.hasUnread())),
    };
    const sig = `${S.level}|${Object.values(red).join('')}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    for (const { row, out } of this.rows) {
      this.show(out.get('mask'), this.locked(row));
      this.show(out.get('Pre_UIRedpoint'), !!red[row.TargetUI] && !this.locked(row));
      const inner = out.get('Pre_UIRedpoint');
      if (inner) for (const el of inner.querySelectorAll('[data-name]')) el.style.display = '';
    }
  }
}

export class SignPanel extends Modal {
  constructor(host, ui, pj, sim) {
    super(host, ui, pj, sim, 'SignPanel', ['Button (1)']);
  }

  begin() {}

  setup() {
    const { ui, p } = this;
    const x = p.get('BtnClose');
    x.classList.add('btn');
    x.addEventListener('click', e => { e.stopPropagation(); this.close(); });
    const t = p.find('Title/Text');
    if (t) ui.text(t, t._node, ui.t('Signin_des'));
    this.cells = [...p.get('content').children].filter(el => /^item/.test(el.dataset.name)).map((el, j) => {
      const q = n => el.querySelector(`[data-name="${n}"]`);
      el.classList.add('btn');
      el.addEventListener('click', e => { e.stopPropagation(); this.tap(j); });
      const amount = q('txtAmount');
      Object.assign(amount.style, { textShadow: SHADOW });
      return { el, q, j, amount, signed: q('imgSigned'), select: q('select') };
    });
  }

  base() { return 8 * Math.floor(this.sim.meta.M.sign.length / 8); }

  tap(j) {
    if (this.sim.meta.sign(this.base() + j)) this.update(true);
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    const { ui, sim } = this, m = sim.meta;
    const sig = `${m.M.sign.length}|${m.M.loginDay}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    const base = this.base();
    for (const c of this.cells) {
      const idx = base + c.j, r = m.signRow(idx);
      const skin = r.type === 6 ? m.skinRows.get(r.num) || m.skinRows.get(SKIN_DAY8) : null;
      const ti = c.q('txtTitle');
      ui.text(ti, ti._node, ui.t(`Signin_day${c.j + 1}`));
      const icon = c.q('icon');
      ui.sprite(icon, { sprite: skin ? skin.SkinIcon : r.icon, type: 'simple', color: [1, 1, 1, 1] });
      ui.text(c.amount, c.amount._node, skin ? '' : `x${r.num}`);
      // The "RARE SKIN" tag belongs to the Cowboy skin only, not to day 8 of later cycles.
      const tag = [...c.el.children].find(k => k.dataset.name === 'Image (2)');
      this.show(tag, !!skin);
      const tt = tag && tag.querySelector('[data-name="Text (Legacy)"]');
      if (tt) tt.textContent = 'RARE\nSKIN';
      const done = m.M.sign.includes(idx);
      this.show(c.signed.parentElement, done);
      this.show(c.signed, done);
      this.show(c.select, m.canSign(idx));
    }
  }
}

export class OfflinePanel extends Modal {
  constructor(host, ui, pj, sim) {
    super(host, ui, pj, sim, 'OfflinePanel', ['Pre_BtnGem', 'BtnClose (1)']);
    this.reward = null;
  }

  begin(reward) { this.reward = reward; }

  setup() {
    const { ui, p } = this;
    const r = this.reward || { min: 0, coins: 0 };
    const rows = [...p.get('content').children];
    this.show(rows[1], false); // gas line: its amount has no source in this build
    const coin = rows[0] && rows[0].querySelector('[data-name="txtReward"]');
    if (coin) coin.textContent = `x${fmt(r.coins)}`;
    const d = p.get('txtDesc');
    ui.text(d, d._node, ui.t('Offlinebonus_des'));
    const claim = p.get('Pre_BtnClaim');
    const ct = claim.querySelector('[data-name="Text (Legacy)"]');
    if (ct) ct.textContent = ui.t('Offlinebonus_claim');
    const h = Math.floor(r.min / 60), mm = r.min % 60;
    const time = p.get('time');
    const tt = [...time.children].find(k => k.dataset.name === 'Text (Legacy)');
    if (tt) tt.textContent = `${h}:${String(mm).padStart(2, '0')}:00`;
    setSlider(time.querySelector('[data-name="Slider"]'), Math.min(1, r.min / 180));
    for (const [el, ad] of [[claim, false], [p.get('Pre_BtnAd'), true]]) {
      el.classList.add('btn');
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (this.reward) this.sim.meta.claimOffline(this.reward, ad);
        this.close();
      });
    }
  }

  update() {}
}
