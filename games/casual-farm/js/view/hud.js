// DOM overlay in the original's look (sprites from art/ui, font Londrina Solid, reference canvas 750x1334):
// cash counter, floating joystick, MAX over the player, price tags on open mats and the carry upgrade zone,
// demand bubbles over customers.
import * as THREE from 'three';
import { carryLimit, UPGRADE } from '../sim/sim.js';
import { Action } from '../sim/tasks.js';
import { MartMenu } from './martmenu.js';

const v3 = new THREE.Vector3();
const KEYS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };

export class Hud {
  constructor({ sim, store, camera, canvas, items, art, world, tasks, matArrows, nextMart, workerDefs, sound, martMap, upgradeRows, onMapView }) {
    this.upgradeRows = upgradeRows || null;
    this.floats = [];
    this.martMap = martMap;
    this.sound = sound;
    this.nextMart = nextMart;
    this.workerDefs = workerDefs || [];
    this.tasks = tasks;
    this.matArrows = matArrows || [];
    this.sim = sim;
    this.store = store;
    this.camera = camera;
    this.canvas = canvas;
    this.items = items;
    this.art = art;
    this.world = world;
    this.root = document.getElementById('hud');
    const ui = n => `${art}/ui/sprites/${n}.webp`;
    this.ui = ui;
    this.root.innerHTML = `
      <div class="counters"><div class="cash"><img src="${ui('cashIcon')}" alt=""><span id="cash">0</span></div>
        <div class="cash gold" id="goldc"><img src="${art}/ui/menus/goldBarIcon.webp" alt=""><span id="gold">0</span></div></div>
      <div class="joy" id="joy"><img class="ring" src="${ui('AllAxis_Outline_Arrows')}" alt=""><img class="knob" src="${ui('Handle_Plain')}" alt=""></div>
      <div class="max" id="max">MAX</div>
      <div class="tags" id="tags"></div>
      <div class="task" id="task"><img alt=""><span></span><b></b></div>
      <div class="next" id="next"><i>NEXT MART</i><b></b><div><a class="btn go">GO!</a><a class="btn close">✕</a></div></div>
      <div class="lbtns" style="--btn: url('${ui('normalButtonLarge')}')">
        <a class="btn lb set" id="setbtn"><img src="${ui('settingsUI')}" alt=""></a>
        <a class="btn lb mapbtn" id="mapbtn"><img src="${ui('MapCityUI')}" alt=""><i class="dot"></i></a>
        <a class="btn lb upbtn" id="upbtn"><img src="${ui('upgradeIcon')}" alt=""><i class="dot"></i></a>
        <a class="btn lb phone" id="phonebtn"><img src="${ui('mobilePhoneIcon')}" alt=""><i class="dot"></i><s></s></a>
      </div>
      <div class="upmenu phonemenu" id="phonemenu"><div class="head"><img src="${ui('car_CustomerIcon')}" alt=""><b>ORDER</b><a class="btn x">✕</a></div>
        <div class="rows"></div><div class="foot"><a class="btn buy collect" data-collect="1">COLLECT</a></div></div>
      <div class="saving" id="saving">Save...</div>
      <div class="upmenu settings" id="setmenu"><div class="head"><b>SETTINGS</b><a class="btn x">✕</a></div>
        <div class="rows"><div class="row"><span><b>Sound</b></span><a class="btn buy tog" data-tog="sound"></a></div>
        <div class="row"><span><b>Music</b></span><a class="btn buy tog" data-tog="music"></a></div>
        <div class="row"><span><b>Vibration</b></span><a class="btn buy tog" data-tog="vibrate"></a></div></div></div>
      <div class="upmenu upgrades" id="upmenu"><div class="head"><img src="${ui('upgradeIcon')}" alt=""><b>UPGRADES</b><a class="btn x">✕</a></div>
        <div class="tabs"><a class="btn tab workers" data-tab="workers">Workers<i class="dot"></i></a><a class="btn tab machines" data-tab="machines">Machines<i class="dot"></i></a><a class="btn tab animals" data-tab="animals">Animals<i class="dot"></i></a></div>
        <div class="rows"></div></div>
      <div class="boosts" id="boosts"></div>`;
    // SettingMenuController: sound, music and vibration (VibratePref, on by default) switches.
    try { this.vibrate = localStorage.getItem('mmm-vibrate') !== '0'; } catch (e) { this.vibrate = true; }
    this.setEl = this.root.querySelector('#setmenu');
    const showTog = () => this.setEl.querySelectorAll('[data-tog]').forEach(b => {
      const on = b.dataset.tog === 'vibrate' ? this.vibrate : !sound || (b.dataset.tog === 'sound' ? !sound.muted : sound.music);
      b.textContent = on ? 'ON' : 'OFF';
      b.classList.toggle('poor', !on);
    });
    showTog();
    this.setEl.addEventListener('click', e => {
      const b = e.target.closest('[data-tog]');
      if (!b) return;
      if (b.dataset.tog === 'vibrate') {
        this.vibrate = !this.vibrate;
        try { localStorage.setItem('mmm-vibrate', this.vibrate ? '1' : '0'); } catch (err) { /* storage unavailable */ }
        if (this.vibrate) this.buzz(10);
      } else if (!sound) return;
      else if (b.dataset.tog === 'sound') sound.setMuted(!sound.muted); else sound.setMusic(!sound.music);
      showTog();
    });
    this.root.querySelector('#setbtn').addEventListener('click', () => {
      this.closeMenus(this.setEl);
      this.setEl.classList.toggle('open');
    });
    this.setEl.querySelector('.x').addEventListener('click', () => this.setEl.classList.remove('open'));
    // SoundManager.PlayTapSfx on every button, PlayCancelSfx on close buttons.
    this.root.addEventListener('click', e => {
      const b = e.target.closest('.btn');
      if (b && sound) sound.play(b.matches('.x, .close') ? 'cancel' : 'tap');
    });
    this.upEl = this.root.querySelector('#upmenu');
    this.upRows = this.upEl.querySelector('.rows');
    // UpgradeMenuController (legacy menu, the one in gameplay video; rules/upgrade-menu.md): Workers / Machines /
    // Animals tabs, every row of the mart listed (locked ones as black silhouettes), Stack and Speed bought separately.
    this.tab = 'workers';
    this.root.querySelector('#upbtn').addEventListener('click', () => {
      this.closeMenus(this.upEl);
      if (this.upEl.classList.toggle('open')) this.openTab(this.tab);
      this.upKey = null;
    });
    this.upEl.querySelector('.x').addEventListener('click', () => this.upEl.classList.remove('open'));
    this.upEl.querySelector('.tabs').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) this.openTab(b.dataset.tab);
    });
    this.upRows.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      const row = b && this.menuRows && this.menuRows[+b.dataset.r];
      if (!row || !row.unlocked) return;
      if (b.dataset.pause != null) {
        const lv = sim.workerLevel(row.slot.name);
        lv.paused = !lv.paused;
        this.upKey = null;
        return;
      }
      const track = b.dataset.t, offer = sim.upgradeOffer(row.slot, track);
      if (!offer) return;
      // CounterController.ShakeCashOnce when the cash is short.
      if (sim.state.cash < offer.price) { this.shakeCash(); return; }
      const firstCarry = row.slot.kind === 'player' && sim.state.stackLevel === 0;
      this.tutorialCarry = !!(this.tasks && this.tasks.current && this.tasks.current.menu);
      if (!sim.buyUpgrade(row.slot, track)) return;
      this.upKey = null;
      this.afterBuy(row, track, firstCarry);
    });
    // Phone order (PhoneMenuButton / PhoneOrderMenuController): the button counts down the order's time, its dot lights
    // when the car arrives; the popup lists every line with n/m and a bar, Collect works once all are full, and the
    // popup closes as soon as the player moves.
    this.phoneEl = this.root.querySelector('#phonemenu');
    this.root.querySelector('#phonebtn').addEventListener('click', () => {
      this.closeMenus(this.phoneEl);
      this.phoneEl.classList.toggle('open');
      this.phoneSeen = true;
      this.phoneKey = null;
    });
    this.phoneEl.querySelector('.x').addEventListener('click', () => this.phoneEl.classList.remove('open'));
    this.phoneEl.querySelector('[data-collect]').addEventListener('click', () => {
      if (sim.cars && sim.cars.full()) { sim.cars.collect(); this.phoneEl.classList.remove('open'); }
    });
    // GameSingleton haptics: VibrateSuccess when a mat completes, VibrateLight when the checkout box pops.
    sim.listeners.push(e => {
      if (e.type === 'matDone') this.buzz([20, 40, 20]);
      if (e.type === 'customerPack' && !(sim.state.cashiers[e.cashier] || {}).worker) this.buzz(10);
    });
    // City map card + prestige screens (MartMenuController, PrestigeMenuController), see martmenu.js.
    if (martMap) {
      this.martMenu = new MartMenu({ root: this.root, art, ui, martMap, sound, onOpen: () => this.closeMenus(this.martMenu.card), onView: onMapView });
      this.mapEl = this.martMenu.card;
      this.root.querySelector('#mapbtn').addEventListener('click', () => {
        if (this.martMenu.isOpen) this.martMenu.close(); else this.martMenu.open();
      });
    }
    this.boostEl = this.root.querySelector('#boosts');
    this.boostEl.addEventListener('click', e => {
      const b = e.target.closest('[data-boost]');
      if (!b || !sim.boosters) return;
      if (b.dataset.boost === 'cash-mat') sim.boosters.claimCash();
      else sim.boosters.claim();
    });
    this.nextEl = this.root.querySelector('#next');
    this.nextEl.querySelector('b').textContent = nextMart ? nextMart.name : '';
    this.nextEl.querySelector('.go').addEventListener('click', () => sim.depart());
    this.nextEl.querySelector('.close').addEventListener('click', () => Object.assign(sim.state.next, { ready: false, closed: true }));
    this.taskEl = this.root.querySelector('#task');
    this.cashEl = this.root.querySelector('#cash');
    this.goldEl = this.root.querySelector('#gold');
    this.joyEl = this.root.querySelector('#joy');
    this.knob = this.joyEl.querySelector('.knob');
    this.maxEl = this.root.querySelector('#max');
    this.tagsEl = this.root.querySelector('#tags');
    this.tags = new Map();
    this.stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
    this.keys = new Set();
    this.bindInput();
  }

  // The tab on show is marked seen (its red dot goes); OnEnable does the same for the tab the menu opens on.
  openTab(tab) {
    if (tab === 'animals' && !this.animalsTab()) tab = 'workers';
    this.tab = tab;
    this.sim.state.seen[tab] = true;
    this.upEl.dataset.tab = tab;
    this.upKey = null;
  }

  animalsTab() {
    return !!(this.upgradeRows && this.upgradeRows.animalsTab && this.upgradeRows.tabs.animals.length);
  }

  shakeCash() {
    const el = this.root.querySelector('.cash');
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  // After a buy: PlayUpgradePS shows CARRY / SPEED over the worker or player 0.4 s later for 3 s; a machine speed buy
  // shows SPEED over it 1 s later for 1 s. The camera highlight (CameraDirector) hides the UI for its 1.5 s. The very
  // first carry upgrade of the Store 1 tutorial closes the menu (UpgradeSuccessful).
  afterBuy(row, track, firstCarry) {
    const t = this.sim.state.t, word = track === 'speed' ? 'SPEED' : 'CARRY';
    if (row.slot.kind === 'player') this.floats.push({ text: 'CARRY', at: () => this.sim.state.player, start: t + 0.4, end: t + 3.4 });
    else if (row.slot.kind === 'worker') {
      const w = (this.sim.state.workers || []).find(x => x.name === row.slot.name);
      if (w) this.floats.push({ text: word, at: () => w, start: t + 0.4, end: t + 3.4 });
    } else if (track === 'speed') {
      const p = this.store.producers[row.slot.i].spawn;
      this.floats.push({ text: 'SPEED', at: () => p, start: t + 1, end: t + 2 });
    }
    this.upEl.classList.add('hl');
    clearTimeout(this.hlTimer);
    this.hlTimer = setTimeout(() => this.upEl.classList.remove('hl'), 1500);
    if (firstCarry && this.tutorialCarry) this.upEl.classList.remove('open');
  }

  updateFloats() {
    const t = this.sim.state.t;
    this.floats = this.floats.filter(f => t < f.end);
    this.floats.forEach((f, i) => {
      if (t < f.start) return;
      const p = f.at();
      this.place(this.tag(`float:${i}:${f.text}`, 'float', `${f.text} <i>↑</i>`), { x: p.x, y: 11 + (t - f.start) * 0.8, z: p.z });
    });
  }

  buzz(pattern) {
    if (this.vibrate && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* not allowed */ } }
  }

  // "Save..." in the lower-left corner when the game saves (shown at most every 30 s, like the original's cadence).
  saved() {
    const now = performance.now();
    if (now - (this.savedAt || -1e9) < 30000) return;
    this.savedAt = now;
    const el = this.root.querySelector('#saving');
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  updatePhone() {
    const sim = this.sim, o = sim.state.car && sim.state.car.order, btn = this.root.querySelector('#phonebtn');
    btn.style.display = o ? '' : 'none';
    if (!o) { this.phoneEl.classList.remove('open'); this.phoneSeen = false; return; }
    const left = Math.max(0, o.expires - sim.state.t), m = Math.floor(left / 60), sec = Math.floor(left % 60);
    btn.querySelector('s').textContent = `${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
    btn.classList.toggle('alert', sim.cars.ready() && !this.phoneSeen);
    if (!this.phoneEl.classList.contains('open')) return;
    if (sim.state.player.moving) { this.phoneEl.classList.remove('open'); return; }
    const rows = o.items.map(x => {
      const it = this.items.types[x.type];
      return `<div class="row"><img src="${this.art}/items/${it && it.icon}" alt=""><i class="bar"><u style="width:${Math.min(100, x.got / x.n * 100)}%"></u></i><b>${x.got}/${x.n}</b></div>`;
    }).join('');
    const full = sim.cars.full();
    const key = rows + full;
    if (key === this.phoneKey) return;
    this.phoneKey = key;
    this.phoneEl.querySelector('.rows').innerHTML = rows;
    this.phoneEl.querySelector('[data-collect]').classList.toggle('poor', !full);
  }

  // Map card refresh, and CheckShouldPopUpPrestigeInfo: once the current mart is 100 % built (prestigeRequirement 1.0)
  // and HasSeenPrestigeInfo is unset, the "New Update: Prestige" popup points at the map.
  updatePrestige() {
    this.martMenu.update();
    const g = this.martMap.global;
    if (g.seenPrestigeInfo || this.martMenu.pending) return;
    const mats = Object.values(this.sim.state.mats);
    if (mats.length && mats.every(m => m.done)) {
      g.seenPrestigeInfo = true;
      this.closeMenus();
      this.martMenu.showInfo();
    }
  }

  // One popup at a time.
  closeMenus(keep) {
    for (const el of [this.upEl, this.setEl, this.phoneEl]) if (el && el !== keep) el.classList.remove('open');
    if (this.martMenu && keep !== this.mapEl) this.martMenu.close();
  }

  bindInput() {
    const el = this.canvas.parentElement || document.body;
    const R = () => Math.min(this.root.clientWidth, this.root.clientHeight) * 0.13;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.btn, .upmenu, .next, .car, .boosts, .lbtns')) return;
      this.stick = { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      this.joyEl.style.display = 'block';
      const box = this.root.getBoundingClientRect();
      this.joyEl.style.left = `${e.clientX - box.left}px`;
      this.joyEl.style.top = `${e.clientY - box.top}px`;
      this.knob.style.transform = 'translate(-50%, -50%)';
    });
    window.addEventListener('pointermove', e => {
      const s = this.stick;
      if (!s.active || e.pointerId !== s.id) return;
      let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
      const d = Math.hypot(dx, dy), r = R();
      if (d > r) { dx *= r / d; dy *= r / d; }
      s.x = dx / r; s.y = dy / r;
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = e => {
      if (e.pointerId !== this.stick.id) return;
      this.stick = { active: false, x: 0, y: 0 };
      this.joyEl.style.display = 'none';
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('keydown', e => { if (KEYS[e.code]) { this.keys.add(e.code); e.preventDefault(); } });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  joystick() {
    if (this.root.querySelector('.upmenu.open, .mcard.open, .mshade.open')) return { x: 0, y: 0, mag: 0 };
    let x = this.stick.x, y = this.stick.y;
    for (const k of this.keys) { x += KEYS[k][0]; y += KEYS[k][1]; }
    const mag = Math.min(1, Math.hypot(x, y));
    if (mag < 0.12) return { x: 0, y: 0, mag: 0 };
    const l = Math.hypot(x, y);
    return { x: x / l, y: y / l, mag };
  }

  screen(p, out = {}) {
    v3.set(p.x, p.y || 0, p.z).project(this.camera);
    out.x = (v3.x + 1) / 2 * this.root.clientWidth;
    out.y = (1 - v3.y) / 2 * this.root.clientHeight;
    return out;
  }

  tag(key, cls, html) {
    let t = this.tags.get(key);
    if (!t) {
      t = document.createElement('div');
      t.className = `tag ${cls}`;
      this.tagsEl.appendChild(t);
      this.tags.set(key, t);
      t._html = null;
    }
    if (t._html !== html) { t.innerHTML = html; t._html = html; }
    t._seen = true;
    return t;
  }

  place(t, p, dy = 0) {
    const s = this.screen(p);
    t.style.transform = `translate(${s.x}px, ${s.y + dy}px) translate(-50%, -50%)`;
  }

  // Task banner (icon, text, cur/trigger) plus the focus arrow; waiting tasks have no text and show nothing.
  updateTask() {
    const task = this.tasks && this.tasks.current;
    const on = !!(task && task.text);
    this.upBtn = this.upBtn || this.root.querySelector('#upbtn');
    this.upBtn.classList.toggle('hint', !!(on && task.menu));
    this.taskEl.style.display = on ? 'flex' : 'none';
    if (!on) return;
    const icon = task.item != null && this.items.types[task.item] ? `${this.art}/items/${this.items.types[task.item].icon}`
      : task.action === Action.Checkout ? this.ui('cashierIcon') : this.ui('upgradeIcon');
    const [img, span, b] = this.taskEl.children;
    if (img.getAttribute('src') !== icon) img.setAttribute('src', icon);
    span.textContent = task.text;
    b.textContent = `${this.sim.state.task.count}/${task.amount}`;
    const c = task.color;
    if (c) this.taskEl.style.setProperty('--c', `rgb(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0})`);
    if (task.target) this.arrow('task', { x: task.target.x, y: (task.target.y || 0) + 4, z: task.target.z });
  }

  // Upgrade slots the sim understands, one per unlocked row (the bot, the red dot of old and tests use this list).
  upgradeSlots() {
    return this.menuModel().filter(r => r.unlocked).map(r => r.slot);
  }

  // Rows of every tab from art/ui/upgrade/icons.json (scene node names), each tied to a sim slot.
  menuModel() {
    if (this.model) return this.model;
    const s = this.store, R = this.upgradeRows;
    const rows = [];
    const tabs = R ? R.tabs : { workers: [{ node: s.nodes[s.player.node].n, kind: 'player', name: 'Player', icon: null }], machines: [], animals: [] };
    for (const tab of ['workers', 'machines', 'animals']) {
      for (const r of tabs[tab] || []) {
        let slot;
        if (r.kind === 'player') slot = { kind: 'player' };
        else if (r.kind === 'worker') slot = { kind: 'worker', name: r.node, base: s.unlockCost(r.node) };
        else {
          const i = s.producers.findIndex(p => p.name === r.node);
          if (i < 0 || !s.producers[i].upgradable) continue;
          slot = { kind: 'producer', i };
        }
        const d = r.kind === 'worker' ? this.workerDefs.find(x => x.name === r.node) : null;
        // responsibleImages: what the worker carries (its shelves' goods and the inputs it feeds).
        const goods = d ? [...new Set([...(d.shelves || []).map(si => s.shelves[si].type), ...(d.feeds || []).flatMap(pi => s.producers[pi].ins)])] : [];
        rows.push({ tab, ...r, slot, goods, icon: r.icon ? `${this.art}/ui/upgrade/${r.icon}` : this.ui('playerIcon') });
      }
    }
    this.model = rows;
    return rows;
  }

  updateMenu() {
    const sim = this.sim, st = sim.state;
    const cash = `<img src="${this.ui('cashIcon')}" alt="">`;
    const rows = this.menuModel();
    rows.forEach(r => { r.unlocked = r.slot.kind === 'player' || sim.isActive(r.node); });
    this.menuRows = rows;
    const level = (r, track) => (r.slot.kind === 'player' ? st.stackLevel : (r.slot.kind === 'producer' ? st.levels.producers[r.slot.i] : sim.workerLevel(r.slot.name))[track]) + 1;
    const html = rows.map((r, idx) => {
      if (r.tab !== this.tab) return '';
      if (!r.unlocked) {
        const q = r.kind === 'worker' ? '<div class="tracks"><div class="tr"><span>???</span></div><div class="tr"><span>???</span></div></div>' : '';
        return `<div class="row locked"><div class="who"><img src="${r.icon}" alt=""><b>???</b></div>${q}</div>`;
      }
      const tracks = (r.slot.kind === 'player' ? ['stack'] : ['stack', 'speed']).map(track => {
        const offer = sim.upgradeOffer(r.slot, track);
        const btn = offer ? `<a class="btn buy${st.cash >= offer.price ? '' : ' poor'}" data-r="${idx}" data-t="${track}">${cash}${offer.price}</a>`
          : '<a class="btn buy max">MAX</a>';
        return `<div class="tr"><span>${track === 'stack' ? 'Stack' : 'Speed'} - Lvl.${level(r, track)}</span>${btn}</div>`;
      }).join('');
      const paused = r.slot.kind === 'worker' && sim.workerLevel(r.slot.name).paused;
      const pause = r.slot.kind === 'worker' ? `<a class="btn pause" data-r="${idx}" data-pause="1">${paused ? '▶' : 'II'}</a>` : '';
      const goods = r.goods.length ? `<div class="goods">${r.goods.map(t => (this.items.types[t] && this.items.types[t].icon ? `<img src="${this.art}/items/${this.items.types[t].icon}" alt="">` : '')).join('')}</div>` : '';
      return `<div class="row"><div class="who"><img src="${r.icon}" alt=""><b>${r.name}</b>${pause}${goods}</div><div class="tracks">${tracks}</div></div>`;
    }).join('');
    const dots = ['workers', 'machines', 'animals'].map(t => (st.seen[t] ? '' : t)).join(',');
    const key = `${this.tab}|${html}|${dots}`;
    if (key === this.upKey) return;
    this.upKey = key;
    this.upRows.innerHTML = html;
    this.upEl.querySelector('.tab.animals').style.display = this.animalsTab() ? '' : 'none';
    for (const t of ['workers', 'machines', 'animals']) this.upEl.querySelector(`.tab.${t}`).classList.toggle('alert', !st.seen[t] && t !== this.tab);
  }

  // Booster buttons (BoosterAdsController): the running boosts with their time left, the current offer, and the
  // extra-cash button; the extra-cash mat also gets a price tag in the world.
  updateBoosts() {
    const sim = this.sim, b = sim.state.boost, t = sim.state.t, cash = this.ui('cashIcon');
    const ICON = { cash, player: this.ui('playerIcon'), worker: this.ui('workerShelfIcon'), machine: this.ui('Blender'), customer: this.ui('giftTrolleyIcon') };
    const LABEL = { cash: 'CASH x2', player: 'SPEED UP', worker: 'FAST STAFF', machine: 'MACHINES x2', customer: '+3 CUSTOMERS' };
    const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    let html = Object.keys(b.active).filter(k => sim.boosters.on(k))
      .map(k => `<div class="on"><img src="${ICON[k]}" alt=""><b>${clock(sim.boosters.left(k))}</b></div>`).join('');
    if (b.offer) html += `<a class="btn offer" data-boost="${b.offer.kind}"><img src="${ICON[b.offer.kind]}" alt=""><b>${LABEL[b.offer.kind]}</b><i>${Math.ceil(b.offer.until - t)}</i></a>`;
    if (b.cash) html += `<a class="btn offer xcash" data-boost="cash-mat"><img src="${cash}" alt=""><b>+${b.cash.amount}</b><i>${Math.ceil(b.cash.until - t)}</i></a>`;
    if (html !== this.boostKey) { this.boostKey = html; this.boostEl.innerHTML = html; }
    const m = sim.boosters.cashMat;
    if (b.cash && m) this.place(this.tag('xcash', 'price', `<img src="${cash}" alt="">+${b.cash.amount}`), { x: m.pos.x, y: 3, z: m.pos.z });
  }

  // Bouncing arrow over a world point; off screen it sticks to the edge and turns toward the target.
  arrow(key, p) {
    const t = this.tag(`arrow:${key}`, 'arrow', '<i></i>');
    const s = this.screen(p);
    const W = this.root.clientWidth, H = this.root.clientHeight, m = 36;
    if (s.x >= m && s.x <= W - m && s.y >= m && s.y <= H - m) {
      t.classList.remove('edge');
      t.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      return;
    }
    const cx = W / 2, cy = H / 2, dx = s.x - cx, dy = s.y - cy;
    const k = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
    t.classList.add('edge');
    t.style.transform = `translate(${cx + dx * k}px, ${cy + dy * k}px) translate(-50%, -50%) rotate(${Math.atan2(dy, dx) - Math.PI / 2}rad)`;
  }

  update() {
    const sim = this.sim, st = sim.state, s = this.store;
    this.cashEl.textContent = st.cash;
    const gold = this.martMap ? this.martMap.global.gold || 0 : 0;
    this.goldEl.textContent = gold;
    this.goldEl.parentNode.style.display = gold > 0 ? '' : 'none';
    for (const t of this.tags.values()) t._seen = false;

    s.mats.forEach(m => {
      const ms = st.mats[m.name];
      if (!ms.open || !st.active.has(m.name) || st.t < ms.openAt - 0.25) return;
      const rem = m.cost - ms.paid;
      // Worker / next-mart mats (MatUnlockUpgradeController) also name what they unlock.
      const label = m.upgradeType ? `<i>${m.upgradeType}</i>` : '';
      const t = this.tag(`mat:${m.name}`, 'price', `${label}<img src="${this.ui('cashIcon')}" alt=""><b>${rem}</b>`);
      this.place(t, m.zone.middle);
    });

    const up = s.player.upgradeZone;
    if (up && st.active.has('UpgradeZone_Player')) {
      const prices = s.player.stackPrices;
      const maxed = st.stackLevel >= prices.length;
      const rem = maxed ? 0 : prices[st.stackLevel] - st.upgrade.paid;
      const t = this.tag('upgrade', 'upgrade', maxed ? '<b>MAX</b>'
        : `<i>CARRY ${carryLimit(st.stackLevel)}→${carryLimit(st.stackLevel + 1)}</i><span><img src="${this.ui('cashIcon')}" alt=""><b>${rem}</b></span>`);
      this.place(t, up.middle);
    }

    for (const c of st.customers || []) {
      // OpenAngryFacePopUp when the patience bar runs out, then the customer moves on.
      if (c.angryAt != null && st.t - c.angryAt < 1) {
        this.place(this.tag(`c:${c.id}`, 'bubble', `<img class="ico" src="${this.ui('angryIcon')}" alt="">`), { x: c.x, y: 9, z: c.z }, -10);
        continue;
      }
      // MatCustomer.SelectNewFace at walk-away: happy, or neutral when part of the order was missing.
      if (c.state === 7 && c.face) {
        const face = this.ui(c.face === 'happy' ? 'happyIcon' : 'neutralIcon');
        this.place(this.tag(`c:${c.id}`, 'bubble', `<img class="ico" src="${face}" alt="">`), { x: c.x, y: 9, z: c.z }, -10);
        continue;
      }
      if (c.state >= 5) continue;
      let html;
      if (c.di >= c.items.length || c.state === 2 || c.state === 3 || c.state === 4 || c.state === 8) {
        html = `<img class="ico" src="${this.ui('cashierIcon') }" onerror="this.style.display='none'" alt="">`;
      } else {
        const it = c.items[c.di];
        const icon = this.items.types[it.type] && this.items.types[it.type].icon;
        html = `${icon ? `<img class="ico" src="${this.art}/items/${icon}" alt="">` : ''}<b>${it.got}/${it.n}</b>${c.patienceOn ? `<s style="--p:${Math.min(1, c.patience / 10)}"></s>` : ''}`;
      }
      const t = this.tag(`c:${c.id}`, 'bubble', html);
      this.place(t, { x: c.x, y: 9, z: c.z }, -10);
    }

    this.updateTask();
    // Car order bubble (CarUI is a CustomerUI): what the car still needs, a happy face once it is full; Collect is in the
    // phone popup (PhoneOrderMenuController).
    const car = st.car && st.car.order && sim.cars && sim.cars.ready() ? st.car.order : null;
    if (car) {
      const full = sim.cars.full();
      const html = full ? `<img class="ico" src="${this.ui('happyIcon')}" alt="">`
        : car.items.map(x => `<img class="ico" src="${this.art}/items/${(this.items.types[x.type] || {}).icon}" alt=""><b>${x.got}/${x.n}</b>`).join('');
      this.place(this.tag('car', 'bubble car', html), { x: sim.cars.point.x, y: 10, z: sim.cars.point.z });
    }
    const th = st.thief && st.thief.chasing && st.thief.agent;
    if (th) this.arrow('thief', { x: th.x, y: 6, z: th.z });
    // CWCommUIController on the thief: an evil laugh while it steals and runs, crying once caught.
    const ta = st.thief && st.thief.agent;
    if (ta && ta.state !== 'walk') {
      const face = ta.state === 'caught' ? 'sadIcon' : 'thiefIcon';
      this.place(this.tag('thief-face', 'bubble', `<img class="ico" src="${this.ui(face)}" alt="">`), { x: ta.x, y: 9, z: ta.z }, -10);
    }
    this.updatePhone();
    if (sim.boosters) this.updateBoosts();
    this.nextEl.style.display = st.next.ready ? 'flex' : 'none';
    // _notificationCircle on the upgrade button (CanvasManager.UpdateUpgradeButtonNotif): a tab holds something
    // unlocked since it was last looked at. The map button shows once a second mart has been reached.
    const seen = st.seen, unseen = !seen.workers || !seen.machines || (this.animalsTab() && !seen.animals);
    this.upBtn.classList.toggle('alert', unseen);
    if (this.martMap) this.root.querySelector('#mapbtn').style.display = this.martMap.global.visited.length > 1 ? '' : 'none';
    this.updateFloats();
    if (this.upEl.classList.contains('open')) this.updateMenu();
    if (this.martMenu) this.updatePrestige();
    this.matArrows.forEach((p, i) => {
      const m = s.mats[i], ms = st.mats[m.name];
      if (p && ms.open && !ms.done && st.active.has(m.name) && st.t >= ms.openAt) this.arrow(`ma:${i}`, p);
    });

    const full = st.carry.length >= carryLimit(st.stackLevel);
    this.maxEl.style.display = full ? 'block' : 'none';
    if (full) {
      const p = this.screen({ x: st.player.x, y: 8 + st.carry.length * 1.3, z: st.player.z });
      this.maxEl.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }

    for (const [k, t] of this.tags) {
      if (!t._seen) { t.remove(); this.tags.delete(k); }
    }
  }
}
