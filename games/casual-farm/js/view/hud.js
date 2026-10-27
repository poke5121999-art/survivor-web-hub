// DOM overlay in the original's look (sprites from art/ui, font Londrina Solid, reference canvas 750x1334):
// cash counter, floating joystick, MAX over the player, price tags on open mats and the carry upgrade zone,
// demand bubbles over customers.
import * as THREE from 'three';
import { carryLimit, UPGRADE } from '../sim/sim.js';
import { Action } from '../sim/tasks.js';

const v3 = new THREE.Vector3();
const KEYS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };

export class Hud {
  constructor({ sim, store, camera, canvas, items, art, world, tasks, matArrows, nextMart, workerDefs, sound, martMap }) {
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
      <div class="cash"><img src="${ui('cashIcon')}" alt=""><span id="cash">0</span></div>
      <div class="joy" id="joy"><img class="ring" src="${ui('AllAxis_Outline_Arrows')}" alt=""><img class="knob" src="${ui('Handle_Plain')}" alt=""></div>
      <div class="max" id="max">MAX</div>
      <div class="tags" id="tags"></div>
      <div class="task" id="task"><img alt=""><span></span><b></b></div>
      <div class="next" id="next"><i>NEXT MART</i><b></b><div><a class="btn go">GO!</a><a class="btn close">✕</a></div></div>
      <a class="btn snd" id="snd"></a>
      <a class="btn upbtn" id="upbtn"><img src="${ui('upgradeIcon')}" alt=""></a>
      <div class="upmenu" id="upmenu"><div class="head"><b>UPGRADES</b><a class="btn x">✕</a></div><div class="rows"></div></div>
      <a class="btn mapbtn" id="mapbtn"><img src="${ui('MapCityUI')}" alt=""></a>
      <div class="upmenu map" id="mapmenu"><div class="head"><b>MARTS</b><a class="btn x">✕</a></div><div class="rows"></div></div>`;
    const snd = this.root.querySelector('#snd');
    const showSnd = () => { snd.textContent = sound && sound.muted ? '🔇' : '🔊'; };
    showSnd();
    snd.addEventListener('click', () => { if (sound) sound.setMuted(!sound.muted); showSnd(); });
    // SoundManager.PlayTapSfx on every button, PlayCancelSfx on close buttons.
    this.root.addEventListener('click', e => {
      const b = e.target.closest('.btn');
      if (b && sound) sound.play(b.matches('.x, .close') ? 'cancel' : 'tap');
    });
    this.upEl = this.root.querySelector('#upmenu');
    this.upRows = this.upEl.querySelector('.rows');
    this.root.querySelector('#upbtn').addEventListener('click', () => { this.upEl.classList.toggle('open'); this.upKey = null; });
    this.upEl.querySelector('.x').addEventListener('click', () => this.upEl.classList.remove('open'));
    this.upRows.addEventListener('click', e => {
      const b = e.target.closest('[data-k]');
      const slot = b && this.slots && this.slots.get(b.dataset.k);
      if (slot && sim.buyUpgrade(slot)) this.upKey = null;
    });
    this.mapEl = this.root.querySelector('#mapmenu');
    this.mapRows = this.mapEl.querySelector('.rows');
    this.root.querySelector('#mapbtn').addEventListener('click', () => {
      this.upEl.classList.remove('open');
      this.mapEl.classList.toggle('open');
      this.mapKey = null;
      this.mapT = 0;
    });
    this.root.querySelector('#upbtn').addEventListener('click', () => this.mapEl.classList.remove('open'));
    this.mapEl.querySelector('.x').addEventListener('click', () => this.mapEl.classList.remove('open'));
    this.mapRows.addEventListener('click', e => {
      const b = e.target.closest('[data-id]');
      const row = b && this.martRows && this.martRows.find(r => r.id === b.dataset.id);
      if (!row || !this.martMap) return;
      if (b.dataset.act === 'collect' && row.ready) { this.martMap.collect(row); this.mapT = 0; }
      if (b.dataset.act === 'go' && row.visited && !row.here) this.martMap.go(row);
    });
    this.nextEl = this.root.querySelector('#next');
    this.nextEl.querySelector('b').textContent = nextMart ? nextMart.name : '';
    this.nextEl.querySelector('.go').addEventListener('click', () => sim.depart());
    this.nextEl.querySelector('.close').addEventListener('click', () => Object.assign(sim.state.next, { ready: false, closed: true }));
    this.taskEl = this.root.querySelector('#task');
    this.cashEl = this.root.querySelector('#cash');
    this.joyEl = this.root.querySelector('#joy');
    this.knob = this.joyEl.querySelector('.knob');
    this.maxEl = this.root.querySelector('#max');
    this.tagsEl = this.root.querySelector('#tags');
    this.tags = new Map();
    this.stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
    this.keys = new Set();
    this.bindInput();
  }

  bindInput() {
    const el = this.canvas.parentElement || document.body;
    const R = () => Math.min(window.innerWidth, window.innerHeight) * 0.13;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.btn, .upmenu, .next, .car')) return;
      this.stick = { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      this.joyEl.style.display = 'block';
      this.joyEl.style.left = `${e.clientX}px`;
      this.joyEl.style.top = `${e.clientY}px`;
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
    let x = this.stick.x, y = this.stick.y;
    for (const k of this.keys) { x += KEYS[k][0]; y += KEYS[k][1]; }
    const mag = Math.min(1, Math.hypot(x, y));
    if (mag < 0.12) return { x: 0, y: 0, mag: 0 };
    const l = Math.hypot(x, y);
    return { x: x / l, y: y / l, mag };
  }

  screen(p, out = {}) {
    v3.set(p.x, p.y || 0, p.z).project(this.camera);
    out.x = (v3.x + 1) / 2 * window.innerWidth;
    out.y = (1 - v3.y) / 2 * window.innerHeight;
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

  // Welcome-back popup with the offline income; Collect pays it.
  welcome(amount, collect) {
    const el = document.createElement('div');
    el.className = 'next welcome';
    el.innerHTML = `<i>WELCOME BACK!</i><b><img src="${this.ui('cashIcon')}" alt=""> ${amount}</b><div><a class="btn go">COLLECT</a></div>`;
    el.style.display = 'flex';
    el.querySelector('.go').addEventListener('click', () => { collect(); el.remove(); });
    this.root.appendChild(el);
  }

  // Upgrade menu (FunflareUpgradeMenuController): one slot each for the player, every unlocked machine or truck and
  // every unlocked shelver / farmer / chef; the button buys the slot's next step (Sim.upgradeOffer).
  upgradeSlots() {
    const sim = this.sim, s = this.store, slots = [];
    slots.push({ key: 'player', kind: 'player', title: 'You', icon: this.ui('playerIcon') });
    s.producers.forEach((p, i) => {
      if (!p.upgradable || !sim.isActive(p.name)) return;
      const it = this.items.types[p.out];
      slots.push({ key: `p${i}`, kind: 'producer', i, title: p.title.replace(/^(Machine|Animal)_/, '').replace(/_/g, ' '),
        icon: it && it.icon ? `${this.art}/items/${it.icon}` : this.ui('upgradeIcon') });
    });
    const ROLE = { shelver: ['Shelver', 'workerShelfIcon'], farmer: ['Farmer', 'workerFarmerIcon'], chef: ['Chef', 'workerChefIcon'] };
    this.workerDefs.forEach(d => {
      if (!ROLE[d.role] || !sim.isActive(d.name)) return;
      slots.push({ key: `w${d.name}`, kind: 'worker', name: d.name, base: s.unlockCost(d.name),
        title: `${ROLE[d.role][0]} ${d.name.replace(/^.*?([A-Z])$/, '$1')}`, icon: this.ui(ROLE[d.role][1]) });
    });
    return slots;
  }

  updateMenu() {
    const sim = this.sim, st = sim.state;
    const slots = this.upgradeSlots();
    const rows = slots.map(slot => {
      const offer = sim.upgradeOffer(slot);
      let info;
      if (slot.kind === 'player') {
        info = offer ? `Carry ${carryLimit(st.stackLevel)} → ${carryLimit(st.stackLevel + 1)}` : `Carry ${carryLimit(st.stackLevel)}`;
      } else {
        const lv = slot.kind === 'producer' ? st.levels.producers[slot.i] : sim.workerLevel(slot.name);
        const speed = slot.kind === 'producer' ? `×${UPGRADE.FACTORY_SPEED[lv.speed]}` : `${UPGRADE.WORKER_SPEED[lv.speed]}`;
        const cap = slot.kind === 'producer' ? sim.limitOf(slot.i) : Math.min(3 + lv.stack, 6);
        info = !offer ? `Speed ${speed} · Cap ${cap}` : offer.track === 'speed' ? `Speed ${speed} → next` : `Capacity ${cap} → next`;
      }
      const buy = offer ? `<a class="btn buy${st.cash >= offer.price ? '' : ' poor'}" data-k="${slot.key}"><img src="${this.ui('cashIcon')}" alt="">${offer.price}</a>`
        : '<a class="btn buy max">MAX</a>';
      return `<div class="row"><img src="${slot.icon}" alt=""><span><b>${slot.title}</b><i>${info}</i></span>${buy}</div>`;
    });
    const key = rows.join('');
    if (key === this.upKey) return;
    this.upKey = key;
    this.slots = new Map(slots.map(x => [x.key, x]));
    this.upRows.innerHTML = key;
  }

  // Map menu rows: progress bar, idle income (COLLECT when the 3-hour clock is up, else the time left) and GO.
  updateMap() {
    const rows = this.martRows = this.martMap.rows();
    const cash = `<img src="${this.ui('cashIcon')}" alt="">`;
    const clock = s => { const m = Math.ceil(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
    const html = rows.map(r => {
      if (!r.visited) return `<div class="row locked"><img src="${this.ui('padlock_icon')}" alt=""><span><b>${r.name}</b><i>Locked</i></span></div>`;
      const pct = Math.floor(r.rate * 100);
      const idle = r.ready ? `<a class="btn buy" data-id="${r.id}" data-act="collect">${cash}${r.amount}</a>`
        : r.amount > 0 ? `<a class="btn buy poor">${cash}${r.amount} · ${clock(r.left)}</a>` : '';
      const go = r.here ? '<a class="btn buy max">HERE</a>' : `<a class="btn buy go" data-id="${r.id}" data-act="go">GO</a>`;
      return `<div class="row"><img src="${this.ui('martIcon')}" alt=""><span><b>${r.name}</b><i class="bar"><u style="width:${pct}%"></u></i><i>${pct}%</i></span>${idle}${go}</div>`;
    }).join('');
    if (html === this.mapKey) return;
    this.mapKey = html;
    this.mapRows.innerHTML = html;
  }

  // Bouncing arrow over a world point; off screen it sticks to the edge and turns toward the target.
  arrow(key, p) {
    const t = this.tag(`arrow:${key}`, 'arrow', '<i></i>');
    const s = this.screen(p);
    const W = window.innerWidth, H = window.innerHeight, m = 36;
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
    // Car order: what the car still needs, and Collect once it is full (PhoneOrderMenuController).
    const car = st.car && st.car.order && sim.cars && sim.cars.ready() ? st.car.order : null;
    if (car) {
      const full = sim.cars.full();
      const html = full ? '<a class="btn collect" data-car="1">COLLECT</a>'
        : car.items.map(x => `<img class="ico" src="${this.art}/items/${(this.items.types[x.type] || {}).icon}" alt=""><b>${x.got}/${x.n}</b>`).join('');
      const t = this.tag('car', `bubble car${full ? ' full' : ''}`, html);
      this.place(t, { x: sim.cars.point.x, y: 10, z: sim.cars.point.z });
      if (!t._wired) {
        t._wired = true;
        t.addEventListener('click', e => { if (e.target.closest('[data-car]')) sim.cars.collect(); });
      }
    }
    const th = st.thief && st.thief.chasing && st.thief.agent;
    if (th) this.arrow('thief', { x: th.x, y: 6, z: th.z });
    this.nextEl.style.display = st.next.ready ? 'flex' : 'none';
    if (this.upEl.classList.contains('open')) this.updateMenu();
    // Twice a second: each refresh reads the other marts' saves.
    if (this.martMap && this.mapEl.classList.contains('open') && !(performance.now() - (this.mapT || 0) < 500)) {
      this.mapT = performance.now();
      this.updateMap();
    }
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
