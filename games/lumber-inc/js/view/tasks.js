// Meta panels reached from the phone, the HUD and the map:
//   TaskPanel  DailyTaskPanel + DailyTaskDoublePanel (art/ui/panels/achievementpanel.json, rules/meta.md F 24): the six
//              daily tasks; a finished one is claimed through the double-chance dialog (free, or the ad ratio).
//              The prefab has no achievement tab, so the achievement rows (meta.achieve) are not shown.
//   BoxPanel   AdBoxCoinPanel / AdBoxBuffPanel / AdGasBuffPanel (art/ui/panels/adboxpanel.json, meta.md I 34-35): what
//              a walked-into ad box offers, for an ad or 20 gems.
//   ShopPanel  ShopPanel (art/ui/panels/shoppanel.json, meta.md C): free daily gems, coin packs and spin coins for gems.

import { Modal, fmt, COIN } from './panels.js';
import { setSlider } from './ui.js';
import { BUFF_SEC, BOX_GEMS, SHOP } from '../sim/meta.js';

const SPIN = 'gashapon_icon_coin';
const GEM_BIG = 'shop_gem01_icon';

// Replaces a label's text but keeps its child nodes (TxtCur / TxtNum carry an icon inside).
function setNum(el, s) {
  if (!el) return;
  const kids = [...el.children];
  el.textContent = s;
  kids.forEach(k => el.appendChild(k));
}

function press(el, fn) {
  if (!el) return;
  el.classList.add('btn');
  el.addEventListener('click', e => { e.stopPropagation(); fn(); });
}

// DailyTaskDoublePanel: "Claim" pays the plain reward, the ad button the reward x RewardRatio.
class DoublePanel extends Modal {
  constructor(host, ui, pj, sim, onClaim) {
    super(host, ui, pj, sim, 'DailyTaskDoublePanel', []);
    this.onClaim = onClaim;
  }

  begin(row) { this.row = row; }

  setup() {
    const { p, ui, sim, row } = this;
    const m = sim.meta, gem = row.RewardType === 2, icon = gem ? GEM_BIG : COIN, ratio = row.RewardRatio;
    press(p.get('BtnClose (1)'), () => this.close());
    const title = p.find('title/Text (Legacy)');
    if (title) ui.text(title, title._node, ui.t(ratio >= 3 ? 'Task_triple_pic' : 'Task_double_pic'));
    const desc = p.get('txtDesc');
    if (desc) ui.text(desc, desc._node, ui.t(ratio >= 3 ? 'Task_triple_des' : 'Task_double_des'));
    const mid = p.get('Middle');
    const cur = p.get('TxtCur'), next = p.get('TxtNext');
    setNum(cur, fmt(m.taskReward(row)));
    setNum(next, fmt(m.taskReward(row, ratio)));
    // TxtCur is a zero-wide box: bestFit shrank it to the minimum, so size it by hand.
    Object.assign(cur.style, { fontSize: '34px', whiteSpace: 'nowrap' });
    const ci = cur.querySelector('[data-name="Image"]');
    ci.style.left = `${parseFloat(ci.style.left) - 40}px`;
    this.sprite(cur.querySelector('[data-name="Image"]'), icon);
    this.sprite(p.get('Image (1)'), icon);
    const free = p.get('Pre_BtnGem'), ad = p.get('Pre_BtnAd');
    const t = ad.querySelector('[data-name="Text (Legacy)"]');
    if (t) ui.text(t, t._node, `Claim x${ratio}`);
    const go = adv => { if (m.claimTask(row.Id, adv)) { this.close(); this.onClaim(); } };
    press(free, () => go(false));
    press(ad, () => go(true));
    this.show(mid, true);
  }

  update() {}
}

export class TaskPanel extends Modal {
  constructor(host, ui, pj, sim) {
    super(host, ui, pj, sim, 'DailyTaskPanel', []);
    this.dbl = new DoublePanel(host, ui, pj, sim, () => this.update(true));
  }

  // The prefab has only the daily list; the achievement list reuses its item template, switched by a small tab button.
  begin(tab) { this.tab = tab === 'achieve' ? 'achieve' : 'daily'; }

  get achieve() { return this.tab === 'achieve'; }

  setup() {
    const { p, ui, sim } = this;
    press(p.get('BtnClose'), () => this.close());
    const title = p.find('Title/Text');
    if (title) ui.text(title, title._node, ui.t(this.achieve ? 'Task_archieve' : 'Task_daily'));
    const sw = document.createElement('div');
    sw.className = 'n t btn';
    sw.textContent = ui.t(this.achieve ? 'Task_daily' : 'Task_archieve');
    sw.style.cssText = 'left:24px;top:24px;width:190px;height:52px;font-size:22px;color:#fff;background:#a4531b;border-radius:26px;align-items:center;justify-content:center;text-align:center;cursor:pointer';
    sw.addEventListener('click', e => { e.stopPropagation(); this.tab = this.achieve ? 'daily' : 'achieve'; this.rebuild(); });
    p.get('Bg').appendChild(sw);
    const sc = this.scroller(p.get('Scroll View'));
    const list = document.createElement('div');
    list.style.cssText = 'position:relative;width:100%;display:flex;flex-direction:column;gap:7.77px;padding-bottom:10px';
    sc.appendChild(list);
    this.rows = (this.achieve ? sim.meta.achieve : sim.meta.daily).map(row => {
      const box = document.createElement('div');
      box.style.cssText = 'position:relative;width:640px;height:149.68px;flex:none';
      list.appendChild(box);
      const out = ui.instance(this.pj, this.prefab, 'item', box, {});
      const c = { row, out };
      if (this.achieve && ui.SPR[row.Icon]) this.sprite(out.get('icon'), row.Icon); // the achievement icons were not exported: keep the clipboard
      press(out.get('RewardBg'), () => {
        if (this.achieve) { if (sim.meta.claimAchieve(row.Id)) this.update(true); } else if (this.ready(row)) this.dbl.open(row);
      });
      return c;
    });
  }

  ready(row) { const m = this.sim.meta; return m.taskDone(row) && !m.taskClaimed(row); }

  updateAchieve() {
    const { ui } = this, m = this.sim.meta;
    this.rows.forEach(({ row, out }) => {
      const st = m.stage(row), n = m.achieveCount(row), ready = m.achieveReady(row);
      const mis = out.get('TxtMission');
      ui.text(mis, mis._node, `${ui.t(row.Title)}: ${ui.t(row.MissionDes, st.target)}`);
      const shown = st.done ? st.target : Math.min(n, st.target);
      out.get('TxtProgress').textContent = `${fmt(shown)}/${fmt(st.target)}`;
      setSlider(out.get('SliderProgress'), st.done ? 1 : shown / st.target);
      this.sprite(out.find('RewardBg/Image'), 'shop_gem02_icon');
      out.get('TxtRewrad').textContent = st.done ? ui.t('Claimed') : `+${st.gems}`;
      this.show(out.get('Tips'), ready);
      this.show(out.get('tips (1)'), ready);
      this.show(out.get('claimedBg'), st.done);
      out.get('RewardBg').style.opacity = st.done ? '0.6' : '';
      out.get('RewardBg').classList.toggle('btn', ready);
    });
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    const m = this.sim.meta;
    const sig = this.achieve
      ? m.achieve.map(r => `${m.achieveCount(r)}.${m.stage(r).i}`).join('|')
      : m.daily.map(r => `${m.taskProgress(r)}${m.taskClaimed(r) ? 'c' : ''}`).join('|') + `|${m.M.day}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    if (this.achieve) { this.updateAchieve(); return; }
    const { ui } = this;
    this.rows.forEach(({ row, out }) => {
      const prog = m.taskProgress(row), claimed = m.taskClaimed(row), ready = this.ready(row);
      const mis = out.get('TxtMission');
      ui.text(mis, mis._node, ui.t(row.MissionDes, row.Target));
      out.get('TxtProgress').textContent = `${prog}/${row.Target}`;
      setSlider(out.get('SliderProgress'), prog / row.Target);
      const gem = row.RewardType === 2;
      this.sprite(out.find('RewardBg/Image'), gem ? 'shop_gem02_icon' : COIN);
      const rw = out.get('TxtRewrad');
      rw.textContent = claimed ? ui.t('Claimed') : `+${fmt(m.taskReward(row))}`;
      this.show(out.get('Tips'), ready);
      this.show(out.get('tips (1)'), ready);
      this.show(out.get('claimedBg'), claimed);
      out.get('RewardBg').style.opacity = claimed ? '0.6' : '';
      out.get('RewardBg').classList.toggle('btn', ready);
    });
  }
}

const BUFF = {
  speed: { n: 2, title: 'dropbonuspanel_title_icon', pic: 'dropbonuspanel_speed_chahua_img' },
  bag: { n: 3, title: 'dropbonuspanel_title_bag', pic: 'dropbonuspanel_title_bag' },
  damage: { n: 4, title: 'dropbonuspanel_title_cuttrees', pic: 'dropbonuspanel_title_cuttrees' },
  income: { n: 5, title: 'dropbonuspanel_title_machineincome', pic: 'dropbonuspanel_machineincome_chahua' },
};

export class BoxPanel extends Modal {
  constructor(host, ui, pj, sim) {
    super(host, ui, pj, sim, 'AdBoxCoinPanel', []);
    for (const n of ['AdBoxBuffPanel', 'AdGasBuffPanel']) ui.prefetch(pj, n, []);
  }

  // Modal.open runs begin() before the rebuild, so the prefab can be chosen here.
  begin(group) {
    this.group = group;
    const h = this.sim.meta.boxes[group], k = h && h.box && h.box.row.kind;
    this.prefab = k === 'coin' ? 'AdBoxCoinPanel' : k === 'gas' ? 'AdGasBuffPanel' : 'AdBoxBuffPanel';
  }

  get row() { const h = this.sim.meta.boxes[this.group]; return h && h.box && h.box.row; }

  setup() {
    const { p, ui, sim } = this, row = this.row;
    press(p.get('BtnClose (1)'), () => this.close());
    if (!row) return;
    const rich = (el, html) => { if (el) { el.innerHTML = html; } };
    const green = s => `<span style="color:#2CC800">${s}</span>`;
    if (row.kind === 'coin') {
      const num = p.get('Pre_TxtNum');
      this.cost(num, COIN, `+${fmt(sim.meta.boxReward(row))}`, 64);
      Object.assign(num.style, { color: '#a4531b', textShadow: 'none' });
    } else if (row.kind === 'gas') {
      rich(p.get('txtDesc (1)'), `${ui.t('GasAdDes')} ${green(`+${row.val}`)}`);
    } else {
      const b = BUFF[row.kind];
      const d = p.get('txtDesc');
      ui.text(d, d._node, ui.t(`adboxBuffDesTitle${b.n}`, BUFF_SEC / 60));
      const gain = row.kind === 'bag' ? `+${row.val}` : `+${Math.round((row.val - 1) * 100)}%`;
      rich(p.get('txtDesc (1)'), `${ui.t(`adboxBuffDesVal${b.n}`)} ${green(gain)}`);
      this.sprite(p.get('Title (1)'), b.title);
      this.sprite(p.find('Middle/Image'), b.pic);
    }
    const gem = p.get('Pre_BtnGem (1)'), ad = p.get('Pre_BtnAd');
    const gt = gem.querySelector('[data-name="Text (Legacy)"]');
    if (gt) gt.textContent = `${BOX_GEMS}`;
    this.gemBtn = gem;
    press(gem, () => { if (sim.meta.claimBox(this.group, true)) this.close(); });
    press(ad, () => { if (sim.meta.claimBox(this.group, false)) this.close(); });
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    if (!this.row) { this.close(); return; }
    const sig = `${this.sim.state.gems}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    if (this.gemBtn) this.dim(this.gemBtn, this.sim.state.gems >= BOX_GEMS);
  }
}

export class ShopPanel extends Modal {
  constructor(host, ui, pj, sim) {
    // Gift bags are real-money products, residentCoin belongs to the town shop.
    super(host, ui, pj, sim, 'ShopPanel', ['Gift1011', 'Gift1012', 'Gift1013', 'Gift1014', 'Gift1015', 'residentCoin']);
    ui.prefetch(pj, this.prefab, [SPIN, GEM_BIG]);
  }

  begin() {}

  setup() {
    const { p, ui, sim } = this, m = sim.meta;
    this.bar();
    const spin = p.get('sponCoin');
    this.spinText = spin && spin.querySelector('[data-name="txtCoins"]');
    const f = path => p.find(path);
    const cell = (group, i) => {
      const it = f(`${group}/${i ? `Item (${i})` : 'Item'}`);
      const q = n => it.querySelector(`[data-name="${n}"]`);
      return { it, num: q('TxtNum'), icon: q('Image'), btn: q('BtnBuy'), label: q('Text (Legacy)'), gem: q('BtnBuy').querySelector('[data-name="Image"]') };
    };
    // The 200-gem pack is free once a day; the other two gem packs (real money) are dropped and the first is centred.
    this.free = cell('groupGem', 0);
    this.free.it.style.left = `${(750 - parseFloat(this.free.it.style.width)) / 2}px`;
    for (const i of [1, 2]) f(`groupGem/Item (${i})`).style.display = 'none';
    press(this.free.btn, () => { m.takeFreeGems(); this.update(true); });
    this.coin = [0, 1, 2].map(i => cell('groupCoin', i));
    this.coin.forEach((c, i) => press(c.btn, () => { m.buyCoin(i); this.update(true); }));
    // groupTownCoin sells spin coins here.
    const title = f('Title (2)/Text (Legacy)');
    ui.text(title, title._node, 'SPIN COINS');
    this.spin = [0, 1, 2].map(i => cell('groupTownCoin', i));
    this.spin.forEach((c, i) => {
      this.sprite(c.icon, SPIN);
      press(c.btn, () => { m.buySpin(i); this.update(true); });
    });
    this.scrollList();
  }

  // Resources is the only block left in Content; scroll it inside the Scroll View's box.
  scrollList() {
    const res = this.p.get('Resources'), view = this.p.get('Scroll View');
    const sc = document.createElement('div');
    // The Scroll View box is stretched by Unity to fill what is left under the header; ui.js leaves it 0 high.
    const top = parseFloat(this.p.get('Top').style.height), height = parseFloat(this.p.root.style.height) - top;
    sc.style.cssText = `position:absolute;left:0;top:${top}px;width:750px;height:${height}px;overflow-y:auto;overflow-x:hidden;pointer-events:auto;touch-action:pan-y;scrollbar-width:none`;
    view.parentElement.appendChild(sc);
    view.style.display = 'none';
    const inner = document.createElement('div');
    const bottom = Math.max(...[...res.children].map(c => parseFloat(c.style.top) + parseFloat(c.style.height)));
    inner.style.cssText = `position:relative;width:750px;height:${bottom + 40}px`;
    Object.assign(res.style, { left: '0', top: '0', height: `${bottom}px` });
    inner.appendChild(res);
    sc.appendChild(inner);
  }

  update(force) {
    if (!this.isOpen || !this.p) return;
    const { sim, ui } = this, m = sim.meta, S = sim.state;
    const sig = `${Math.floor(S.coins)}|${S.gems}|${m.M.spin}|${m.freeGemsLeft()}`;
    if (!force && sig === this.last) return;
    this.last = sig;
    this.barText();
    if (this.spinText) this.spinText.textContent = fmt(m.M.spin);
    const fr = this.free, avail = m.freeGemsLeft();
    ui.text(fr.num, fr.num._node, fmt(SHOP.freeGems));
    ui.text(fr.label, fr.label._node, ui.t('Upgrade_free'));
    this.dim(fr.btn, avail);
    this.coin.forEach((c, i) => {
      const r = m.shopCoin(i);
      ui.text(c.num, c.num._node, fmt(r.coins));
      c.label.textContent = `${r.gems}`;
      this.dim(c.btn, S.gems >= r.gems);
    });
    this.spin.forEach((c, i) => {
      const r = SHOP.spin[i];
      ui.text(c.num, c.num._node, `${r.n}`);
      c.label.textContent = `${r.gems}`;
      this.dim(c.btn, S.gems >= r.gems);
    });
  }
}
