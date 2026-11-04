// Boot, input, interactions and the frame loop.
import { Sim } from './sim/sim.js';
import { LAYOUT, solids, slotById } from './sim/layout.js';
import { World } from './view/world.js';
import { UI } from './view/ui.js';
import { money } from './view/icons.js';
import { KeyLabels } from './view/keys.js';

const SAVE_KEY = 'supermarket-v1';
const params = new URLSearchParams(location.search);
const state = window.__sm = { ready: false, error: null };

// ---- tiny WebAudio sfx -------------------------------------------------------------------------------------------
const sfx = {
  ctx: null,
  play(kind) {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      const spec = { beep: [1800, 0.07, 'square'], coin: [1200, 0.05, 'triangle'], cash: [880, 0.25, 'triangle'], err: [160, 0.3, 'sawtooth'],
        put: [500, 0.05, 'sine'], tick: [1000, 0.03, 'square'], open: [660, 0.3, 'sine'], level: [990, 0.4, 'triangle'] }[kind] || [600, 0.1, 'sine'];
      o.type = spec[2]; o.frequency.setValueAtTime(spec[0], t);
      if (kind === 'cash' || kind === 'level') o.frequency.exponentialRampToValueAtTime(spec[0] * 1.5, t + spec[1]);
      g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + spec[1]);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + spec[1] + 0.02);
    } catch (e) { /* audio is optional */ }
  },
};

function loadSave() {
  if (params.has('fresh')) return null;
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
}
function writeSave(sim) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(sim.save())); } catch (e) { /* private mode */ } }

async function boot() {
  const data = await (await fetch('./data/game.json?v=' + (window.SM_REV || ''))).json();
  const sim = new Sim(data, { save: loadSave() });
  const world = new World(document.getElementById('view'), sim);
  const ui = new UI(sim, sfx);
  // First person, as the original (StarterAssets FirstPersonController: Player/Move, Player/Look, CharacterController).
  // yaw 0 looks into the store (-z); forward = (-sin yaw, -cos yaw).
  const player = { x: 2.2, z: 3.2, yaw: -Math.PI / 2, pitch: -0.25, dir: Math.PI / 2, moving: false, atRegister: false };
  let walls = [], wallSig = '';
  const refreshWalls = () => { const sig = sim.sections + '|' + sim.s.shelves.map(s => s.id).join(','); if (sig !== wallSig) { wallSig = sig; walls = solids(sim.sections, sim.s.shelves.map(s => s.id)); } };
  Object.assign(state, { sim, world, ui, player, data });

  // ---- input --------------------------------------------------------------------------------------------------
  const keys = new Set();
  const joy = { x: 0, z: 0, id: null, ox: 0, oy: 0 };
  addEventListener('keydown', e => {
    if (ui.panel && ui.panel.type && (/^[0-9]$/.test(e.key) || e.key === 'Backspace' || e.key === 'Enter')) { ui.panel.type(e.key); e.preventDefault(); return; }
    keys.add(e.key.toLowerCase());
    if (e.key === 'e' || e.key === 'E' || e.key === ' ') { act(); e.preventDefault(); }
    if (e.key === 'q' || e.key === 'Q') drop();
    if (e.key === 'Escape') closePanel();
    if (e.key === 'Tab') { e.preventDefault(); ui.panel ? closePanel() : (unlock(), ui.openTasks()); }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  const pad = document.getElementById('joy'), knob = document.getElementById('knob');
  const view = document.getElementById('view');
  const look = { id: null, x: 0, y: 0 };
  const SENS = 0.0026;
  const turn = (dx, dy) => { player.yaw -= dx * SENS; player.pitch = Math.max(-1.25, Math.min(1.1, player.pitch - dy * SENS)); };
  const locked = () => document.pointerLockElement === view;
  view.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      if (!ui.panel && view.requestPointerLock) { try { const r = view.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* not allowed here */ } }
      look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; return; // drag-to-look when the lock is refused
    }
    if (e.clientX < innerWidth * 0.45 && joy.id == null) { // touch: left side = move stick, right side = look
      joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
      pad.style.display = 'block'; pad.style.left = e.clientX + 'px'; pad.style.top = e.clientY + 'px';
    } else if (look.id == null) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' && locked()) { turn(e.movementX, e.movementY); return; }
    if (e.pointerId === look.id) { turn(e.clientX - look.x, e.clientY - look.y); look.x = e.clientX; look.y = e.clientY; return; }
    if (e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const d = Math.hypot(dx, dy), R = 50;
    if (d > R) { dx *= R / d; dy *= R / d; }
    joy.x = dx / R; joy.z = dy / R; knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const endPtr = e => {
    if (e.pointerId === look.id) look.id = null;
    if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.z = 0; pad.style.display = 'none'; knob.style.transform = '';
  };
  view.addEventListener('pointerup', endPtr); view.addEventListener('pointercancel', endPtr);
  const unlock = () => { if (locked()) document.exitPointerLock(); };
  const keyLabels = KeyLabels.wanted() ? new KeyLabels(view) : null;
  document.getElementById('actbtn').onclick = () => act();
  document.getElementById('dropbtn').onclick = () => drop();
  addEventListener('resize', () => world.resize());

  // ---- interactions ---------------------------------------------------------------------------------------------
  let focus = null;
  function interactables() {
    const out = [], carry = sim.carried();
    for (const sh of sim.s.shelves) { const sl = slotById(sh.id, sim.sections); if (sl) out.push({ kind: 'shelf', id: sh.id, x: sl.front.x, z: sl.front.z, ax: sl.x, az: sl.z, r: 0.75, label: carry ? 'Stock shelf' : 'Shelf · prices' }); }
    if (sim.s.toPlace.length && !carry) {
      const name = sim.data.furniture.find(f => f.id === sim.s.toPlace[0]).name;
      for (const f of sim.freeSlots()) out.push({ kind: 'place', id: f.id, x: f.front.x, z: f.front.z, ax: f.x, az: f.z, r: 0.7, label: `Place ${name} here` });
    }
    out.push({ kind: 'register', x: LAYOUT.register.stand.x, z: LAYOUT.register.stand.z, ax: LAYOUT.register.x, az: LAYOUT.register.z, r: 1.0, label: 'Use register' });
    out.push({ kind: 'computer', x: LAYOUT.computer.stand.x, z: LAYOUT.computer.stand.z, ax: LAYOUT.computer.x, az: LAYOUT.computer.z, r: 1.0, label: 'Use computer (order stock)' });
    if (carry) out.push({ kind: 'trash', x: LAYOUT.trash.x, z: LAYOUT.trash.z, r: 1.1, label: carry.count ? 'Trash (box is not empty)' : 'Throw away empty box' });
    else for (const b of sim.s.boxes) if (b.where === 'floor') {
      const top = !sim.s.boxes.some(o => o.where === 'floor' && o.x === b.x && o.z === b.z && o.y > b.y);
      if (top) out.push({ kind: 'box', id: b.id, x: b.x, z: b.z, r: 0.85, label: `Pick up box · ${sim.P.get(b.pid).name} ×${b.count}` });
    }
    return out;
  }
  // What the player looks at: within reach and close to the view direction; else whatever stands right at the feet.
  function nearest() {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    let best = null, bs = 1e9, near = null, nd = 1e9;
    for (const it of interactables()) {
      const ax = it.ax ?? it.x, az = it.az ?? it.z, dx = ax - player.x, dz = az - player.z, d = Math.hypot(dx, dz);
      const ang = d < 0.05 ? 0 : Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
      if (d < 2.4 && ang < 0.55) { const sc = ang + d * 0.15; if (sc < bs) { bs = sc; best = it; } }
      const df = Math.hypot(it.x - player.x, it.z - player.z); if (df < it.r * 0.8 && df < nd) { nd = df; near = it; }
    }
    return best || near;
  }
  function act(it = focus) {
    if (!it || player.atRegister) return;
    if (it.kind !== 'box' && it.kind !== 'trash' && it.kind !== 'place') unlock(); // panels need the mouse
    if (it.kind === 'box') { if (sim.pickBox(it.id).ok) sfx.play('put'); }
    else if (it.kind === 'shelf') ui.openShelf(it.id);
    else if (it.kind === 'computer') ui.openComputer();
    else if (it.kind === 'trash') { const r = sim.trashBox(); if (r.ok) { sfx.play('put'); ui.toast('Empty box thrown away'); } else ui.toast(r.why, 'bad'); }
    else if (it.kind === 'register') enterRegister();
    else if (it.kind === 'place') { const r = sim.place(it.id); if (r.ok) { sfx.play('put'); ui.toast('Placed! Stock it with matching products.', 'good'); } else ui.toast(r.why, 'bad'); }
  }
  function drop() {
    if (!sim.carried()) return;
    const x = player.x + Math.sin(player.dir) * 0.6, z = player.z + Math.cos(player.dir) * 0.6;
    sim.dropBox(Math.round(x * 10) / 10, Math.round(z * 10) / 10); sfx.play('put');
  }
  function enterRegister() {
    player.atRegister = true; player.x = LAYOUT.register.stand.x; player.z = LAYOUT.register.stand.z; player.yaw = Math.PI; player.pitch = innerWidth < innerHeight ? -0.75 : -0.32; // the panel covers the lower part; portrait needs the customer higher
    ui.openRegister(() => { player.atRegister = false; });
  }
  function closePanel() { if (ui.isOpen('register')) player.atRegister = false; ui.close(); }
  Object.assign(state, { act, drop, enterRegister, nearest, interactables, closePanel });

  // ---- sim events -> feedback --------------------------------------------------------------------------------
  function drainEvents() {
    for (const ev of sim.events.splice(0)) {
      if (ev.type === 'hired') { if (ui.isOpen('computer')) ui.refresh(); }
      else if (ev.type === 'staffEnd') ui.toast(ev.kind === 'cashier' ? '🧑‍💼 The cashier finished the shift' : '📦 The stock clerk finished the shift');
      else if (ev.type === 'prices') ui.toast(`📈 ${ev.n} prices changed today — see Prices on the computer`);
      else if (ev.type === 'taskDone' || ev.type === 'fund') { /* toast shown by the panel */ }
      else if (ev.type === 'expand') ui.toast('🏗️ New section open — the store is bigger!', 'good');
      else if (ev.type === 'license') ui.toast(`📜 ${sim.lic(ev.id).name}: new products in the market`, 'good');
      else if (ev.type === 'furniture') ui.toast('📦 Walk to a glowing spot and press E to place it');
      else if (ev.type === 'levelup') { ui.toast(`⭐ Store level ${ev.level}!`, 'good'); sfx.play('level'); }
      else if (ev.type === 'delivered') ui.toast(`🚚 Delivery: ${ev.boxes} box${ev.boxes > 1 ? 'es' : ''} of ${sim.P.get(ev.pid).name}`);
      else if (ev.type === 'closing') ui.toast('22:00 — no new customers. Finish the queue.');
      else if (ev.type === 'report') { if (ui.isOpen('register')) player.atRegister = false; ui.openReport(); writeSave(sim); }
      else if (ev.type === 'register' || ev.type === 'sale' || ev.type === 'pay') { if (ui.isOpen('register')) ui.refresh(); }
      else if (ev.type === 'delivered' || ev.type === 'order') { if (ui.isOpen('computer')) ui.refresh(); }
    }
  }

  // ---- frame loop ---------------------------------------------------------------------------------------------
  let last = performance.now(), saveT = 0, hudT = 0;
  const speed = 3.4, rad = 0.28;
  function movePlayer(dt) {
    let f = 0, r = 0;
    if (keys.has('w') || keys.has('arrowup')) f += 1;
    if (keys.has('s') || keys.has('arrowdown')) f -= 1;
    if (keys.has('a') || keys.has('arrowleft')) r -= 1;
    if (keys.has('d') || keys.has('arrowright')) r += 1;
    f -= joy.z; r += joy.x;
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    const mx = -sy * f + cy * r, mz = -cy * f - sy * r;
    const len = Math.hypot(mx, mz);
    player.moving = len > 0.05 && !player.atRegister && !(ui.panel && ui.panel.kind !== 'shelf');
    if (!player.moving) return;
    if (ui.isOpen('shelf')) ui.close();
    const k = Math.min(1, len) * speed * dt / len;
    for (const [ax, az] of [[mx * k, 0], [0, mz * k]]) {
      const nx = player.x + ax, nz = player.z + az;
      if (!walls.some(([x0, z0, x1, z1]) => nx > x0 - rad && nx < x1 + rad && nz > z0 - rad && nz < z1 + rad)) { player.x = nx; player.z = nz; }
    }
    player.x = Math.max(-30, Math.min(12, player.x)); player.z = Math.max(-6, Math.min(10, player.z));
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const steps = state.fast || 1;
    sim.playerAtRegister = player.atRegister;
    for (let i = 0; i < steps; i++) sim.step(dt);
    refreshWalls();
    movePlayer(dt);
    player.dir = Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw));
    if (ui.panel && ui.panel.kind !== 'shelf') unlock();
    drainEvents();
    focus = player.atRegister || (ui.panel && ui.panel.kind !== 'shelf') ? null : nearest();
    world.markAt(focus);
    ui.setPrompt(focus ? `<kbd>E</kbd> ${focus.label}` : sim.carried() ? `<kbd>Q</kbd> Put the box down` : '');
    const playing = !ui.panel || ui.panel.kind === 'shelf';
    const ab = document.getElementById('actbtn');
    ab.style.display = focus || (keyLabels && !keyLabels.disposed && playing && !player.atRegister) ? '' : 'none'; ab.classList.toggle('dim', !focus);
    document.getElementById('crosshair').style.display = playing && !player.atRegister ? '' : 'none';
    if (keyLabels) keyLabels.update(playing && !player.atRegister);
    document.getElementById('dropbtn').style.display = sim.carried() && !player.atRegister ? '' : 'none';
    world.sync(dt, player);
    ui.updateBubbles(world);
    if ((hudT -= dt) <= 0) { ui.updateHud(); hudT = 0.2; ui.tick(); }
    if ((saveT += dt) > 5) { saveT = 0; writeSave(sim); }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(sim); });
  addEventListener('pagehide', () => writeSave(sim));
  if (sim.s.phase === 'report') ui.openReport();
  else if (sim.s.day === 1 && sim.s.phase === 'prep' && !sim.s.served) ui.toast('Pick up the noodle box, stock a shelf, then open the store.');
  document.getElementById('loading').remove();
  state.ready = true; state.money = money;
  requestAnimationFrame(frame);
}

boot().catch(e => { state.error = String(e && e.stack || e); const l = document.getElementById('loading'); if (l) l.textContent = 'Error: ' + e.message; console.error(e); });
