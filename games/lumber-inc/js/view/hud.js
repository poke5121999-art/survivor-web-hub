// In-game HUD: the original GamingPanel prefab (art/ui/panels/gamingpanel.json) laid out by ui.js, fed from the sim:
// coin and gem counters, player level and exp bar, MAX!! when the pack is full, the zoom button; plus world-anchored
// price tags over unlock pads.
import * as THREE from 'three';
import { setSlider } from './ui.js';

// Nodes the original switches on at runtime for features this build does not have yet (resident coin, town, events,
// phone, ad boxes, buffs...).
const HIDE = ['residentCoin', 'tickets', 'hometown', 'sponCoin', 'PackData', 'packItem', 'SpecialOrderRoot', 'BtnEaster', 'BtnCoin',
  'BtnPhone', 'buffRoot', 'guideTips', 'btnMoto', 'MapSelectBtn', 'Pre_UIRedpoint',
  'imgAdd'];

export function fmt(n) {
  n = Math.floor(n);
  if (n < 1000) return `${n}`;
  const u = ['K', 'M', 'B', 'T'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0).replace(/\.0+$/, '')}${u[i]}`;
}

export class Hud {
  constructor(host, ui, panels, sim, world, camera) {
    Object.assign(this, { host, ui, panels, sim, world, camera });
    this.tags = document.createElement('div');
    this.tags.className = 'tags';
    host.appendChild(this.tags);
    this.build();
    this.padTags = new Map();
    addEventListener('resize', () => this.build());
  }

  build() {
    if (this.panel) this.panel.root.remove();
    this.panel = this.ui.panel(this.panels.gamingpanel, null, this.host, { hide: HIDE });
    const p = this.panel;
    const bar = name => p.get(name);
    this.coinText = bar('coin') && bar('coin').querySelector('[data-name="txtCoins"]');
    this.gemText = bar('gem') && bar('gem').querySelector('[data-name="txtCoins"]');
    this.spinText = bar('sponCoin') && bar('sponCoin').querySelector('[data-name="txtCoins"]');
    this.lv = p.get('TxtLv');
    this.exp = p.get('TxtExp');
    this.lvBar = p.get('Slider');
    this.max = p.get('txtMax');
    this.zoom = p.get('btnScaling');
    if (this.zoom) this.zoom.addEventListener('click', e => { e.stopPropagation(); this.onZoom && this.onZoom(); });
    // BtnBuildTips (GamingPanel): into and out of the town view, once the construction site is open.
    this.townBtn = p.get('BtnBuildTips');
    if (this.townBtn) {
      this.townBtn.classList.add('btn');
      this.townBtn.addEventListener('click', e => { e.stopPropagation(); this.onTown && this.onTown(); });
      const dot = this.townBtn.querySelector('[data-name="Pre_UIRedpoint (4)"]');
      if (dot) dot.style.display = 'none';
    }
    // Main task bar (GamingPanelMainTask): description, progress, coin reward; tap to claim when complete.
    this.task = p.get('MainTaskRoot');
    if (this.task) {
      this.taskDes = this.task.querySelector('[data-name="TxtDes"]');
      this.taskProg = this.task.querySelector('[data-name="TxtProgress"]');
      this.taskReward = this.task.querySelector('[data-name="TxtReward"]');
      this.taskBar = this.task.querySelector('[data-name="Slider (1)"]');
      this.taskDone = this.task.querySelector('[data-name="complete"]');
      this.taskTips = this.task.querySelector('[data-name="tips"]');
      this.task.classList.add('btn');
      this.task.addEventListener('click', e => { e.stopPropagation(); this.sim.missions.claim(); });
      this.task.addEventListener('pointerdown', e => e.stopPropagation());
    }
    this.last = {};
  }

  set(el, key, s) {
    if (!el || this.last[key] === s) return;
    this.last[key] = s;
    el.textContent = s;
  }

  update() {
    const S = this.sim.state;
    this.set(this.coinText, 'coin', fmt(S.coins));
    this.set(this.gemText, 'gem', fmt(S.gems));
    this.set(this.spinText, 'spin', fmt(S.spin || 0));
    this.set(this.lv, 'lv', `${S.level}`);
    const need = this.sim.needExp();
    this.set(this.exp, 'exp', need ? `${S.exp}/${need}` : 'MAX');
    if (this.lvBar && this.last.bar !== S.exp) { this.last.bar = S.exp; setSlider(this.lvBar, need ? S.exp / need : 1); }
    if (this.max) this.max.style.display = this.sim.pack.full ? 'flex' : 'none';
    this.updateTask();
    this.updatePadTags();
  }

  updateTask() {
    if (!this.task) return;
    const M = this.sim.missions, m = M.current;
    this.task.style.display = m ? 'block' : 'none';
    if (!m) return;
    const [v, t] = M.progress(m);
    const done = v >= t;
    this.set(this.taskDes, 'tdes', this.ui.t(m.MissionDes));
    this.set(this.taskProg, 'tprog', done ? this.ui.t('Finish') : `${v}/${t}`);
    this.set(this.taskReward, 'trew', `+${fmt(m.RewardNum)}`);
    if (this.taskDone) this.taskDone.style.display = done ? 'block' : 'none';
    if (this.task._skin) this.task._skin.style.display = done ? 'none' : '';
    if (this.taskTips) this.taskTips.style.display = done ? 'block' : 'none';
    this.task.classList.toggle('pulse', done);
    if (this.taskBar && this.last.tbar !== `${m.Id}:${v}`) { this.last.tbar = `${m.Id}:${v}`; setSlider(this.taskBar, t ? v / t : 0); }
  }

  // Price over each open pad and each research frame whose next star is open: coin icon + coins still to pay.
  updatePadTags() {
    const sim = this.sim;
    const spots = [];
    for (const b of this.world.buildings.values()) {
      if (b.pad) spots.push({ key: b.id, at: b.pad.center, cost: sim.status(b) === 'locked' ? b.cost : null });
      if (b.researchBox && sim.research.has(b.id)) {
        spots.push({ key: `r${b.id}`, at: b.researchBox.middle, cost: sim.starBlocked(b.id) ? null : sim.nextStar(b.id).Cost });
      }
    }
    for (const { key, at, cost } of spots) {
      this.worldTag(key, cost == null ? null : at, 'common_money_icon_01', cost == null ? '' : fmt(cost - (sim.state.paid[key] || 0)), 0.2);
    }
    // Bubbles of the buildings around the line (rules/map1-extra.md): order progress, gas in the station, a machine's
    // gas boost, the bike and drone rentals.
    const X = sim.extras, S = sim.state;
    const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    for (const b of this.world.buildings.values()) {
      const on = sim.active(b.id);
      if (b.kind === 'orderMan') {
        const o = S.order;
        this.worldTag('order', on && o.need > 0 ? b.manBox.middle : null, 'mainpanel_specailorder_icon', o.cur >= o.need ? '!' : `${o.cur}/${o.need}`, 2.6);
      } else if (b.kind === 'gas') {
        this.worldTag('gas', on ? b.pos : null, 'mainpanel_oil_progressbar_oil_icon', `${X.gasStock()}`, 3.2);
      } else if (b.kind === 'factory') {
        const left = on ? X.boostLeft(b.id) : 0;
        this.worldTag(`boost${b.id}`, left > 0 ? b.pos : null, 'mainpanel_petroleum_icon', clock(left), 3.5);
      } else if (b.kind === 'uav') {
        this.worldTag('uav', on && X.flying ? b.pos : null, 'offlinepanel_clock_icon', clock(X.rentLeft('uav')), 3.5);
      }
    }
    this.worldTag('bike', X.riding ? S.player : null, 'icon_vehicle_moto_small', clock(X.rentLeft('bike')), 2.6);
    this.starEntry();
    if (this.townBtn) this.townBtn.style.display = sim.town.open ? '' : 'none';
  }

  // FactoryResearchEntry (FactoryBuildingCtrller.EnterTriggerShow, rules/map1-extra.md 63): standing at a starred
  // machine that still has the normal look shows a button that reopens the machine choice for its current star.
  starEntry() {
    const sim = this.sim, p = sim.state.player;
    const b = [...this.world.buildings.values()].find(f => f.kind === 'factory' && f.mainBox && sim.stars(f.id) > 0 && !sim.state.starAd[f.id]
      && f.mainBox.contains(p, 0.3));
    this.worldButton('starEntry', b && b.pos, 'mainpanel_starup_btn', () => this.onStarEntry && this.onStarEntry(b.id), 4);
  }

  // A clickable world-anchored sprite button over `at` (null hides it).
  worldButton(key, at, sprite, onClick, y = 4) {
    let el = this.padTags.get(key);
    if (!el) {
      el = document.createElement('div');
      el.className = 'tag btn';
      el.style.cssText = `pointer-events:auto;width:calc(144 * var(--u));height:calc(147 * var(--u));background:url("${this.ui.url(sprite)}") center/contain no-repeat;cursor:pointer`;
      el.addEventListener('pointerdown', e => e.stopPropagation());
      el.addEventListener('click', e => { e.stopPropagation(); if (el._fn) el._fn(); });
      this.tags.appendChild(el);
      this.padTags.set(key, el);
    }
    el._fn = onClick;
    if (!at) { el.style.display = 'none'; return; }
    const v = (this.v || (this.v = new THREE.Vector3())).set(at.x, y, at.z).project(this.camera);
    const off = v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2;
    el.style.display = off ? 'none' : 'block';
    if (!off) el.style.transform = `translate(${((v.x + 1) / 2) * this.host.clientWidth}px, ${((1 - v.y) / 2) * this.host.clientHeight}px) translate(-50%, -50%)`;
  }

  // A world-anchored icon + text over `at` (null hides it), height y metres.
  worldTag(key, at, icon, text, y) {
    let el = this.padTags.get(key);
    if (!at) { if (el) el.style.display = 'none'; return; }
    if (!el) {
      el = document.createElement('div');
      el.className = 'tag price';
      el.innerHTML = `<img src="${this.ui.url(icon)}" alt=""><span></span>`;
      this.tags.appendChild(el);
      this.padTags.set(key, el);
    }
    const v = this.v || (this.v = new THREE.Vector3());
    v.set(at.x, y, at.z).project(this.camera);
    const off = v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2;
    el.style.display = off ? 'none' : 'flex';
    if (off) return;
    el.style.transform = `translate(${((v.x + 1) / 2) * this.host.clientWidth}px, ${((1 - v.y) / 2) * this.host.clientHeight}px) translate(-50%, -50%)`;
    const span = el.lastChild;
    if (span.textContent !== text) span.textContent = text;
  }
}
