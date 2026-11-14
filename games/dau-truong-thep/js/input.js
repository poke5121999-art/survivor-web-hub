// Keyboard + mouse and twin-stick touch. sample(u) turns the current device state into one sim input.
import { RULES } from './data.js';
import { icon } from './ui.js';
import * as K from './keys.js';

const BLOCK = 'button,input,select,textarea,a,[data-block]';
const AIM_REACH = 14;
const PAD_DEAD = 0.18, PAD_FIRE = 0.35;
// Standard-mapping button indices.
const PB = { A: 0, X: 2, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, DPAD: [12, 14, 15, 13] };
// Radial dead zone, rescaled so a stick just past it reads near 0 and a full push reads exactly 1.
function stick(x, y) {
  const m = Math.hypot(x, y);
  if (m < PAD_DEAD) return [0, 0, 0];
  const k = (Math.min(1, m) - PAD_DEAD) / (1 - PAD_DEAD);
  return [x / m * k, y / m * k, k];
}

export function makeInput(G) {
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const keys = new Set();
  const mouse = { x: 0, y: 0, seen: false };
  const sticks = { move: null, aim: null };
  const btn = { s1: false, s2: false, ult: false, heal: false };
  let scripted = null, touchOn = false, lastAim = 0, R = 56, chatting = false, device = 'kb';
  let padFn = () => (typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []);
  const pad = { present: false, mx: 0, mz: 0, ax: 0, az: 0, ad: 0, fire: false, s1: false, s2: false, ult: false, heal: false };
  const edge = { start: false, back: false, dpad: [false, false, false, false] };

  const running = () => !!(G.match && !G.match.over);
  const typing = (t) => t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);

  addEventListener('keydown', (e) => {
    if (typing(e.target)) return;
    // Space scrolls and Tab moves focus: both would fight the match while it runs.
    if (running() && (e.code === 'Space' || e.code === 'Tab' || K.actionOf(e.code))) e.preventDefault();
    device = 'kb';
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); });
  addEventListener('contextmenu', (e) => { if (running() || touch) e.preventDefault(); });
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true; device = 'kb'; }
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true;
    if (e.button <= 2 && !(e.target.closest && e.target.closest(BLOCK))) { keys.add('Mouse' + e.button); if (e.button === 1 && running()) e.preventDefault(); }
  });
  addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') keys.delete('Mouse' + e.button); });

  /* ---- touch layer ---- */
  let layer = null, stickEls = null;
  const tbtns = {};
  if (touch) {
    document.documentElement.style.touchAction = 'none';
    layer = document.createElement('div');
    layer.id = 'touch';
    layer.innerHTML = `<div class="stick move"><i></i></div><div class="stick aim"><i></i></div>`;
    stickEls = { move: layer.children[0], aim: layer.children[1] };
    const defs = [['ult', 'ult'], ['s1', ''], ['s2', ''], ['heal', 'item']];
    for (const [k, cls] of defs) {
      const b = document.createElement('button');
      b.className = `tbtn ${k} ${cls}`;
      b.dataset.block = '';
      b.innerHTML = `<span class="tb-i"></span><i class="tb-cd"></i><b class="tb-t"></b>`;
      layer.appendChild(b);
      tbtns[k] = { root: b, ic: b.firstChild, t: b.querySelector('.tb-t'), p: -1, txt: '', iconKey: '' };
      const down = (e) => { e.preventDefault(); e.stopPropagation(); btn[k] = true; b._pid = e.pointerId; b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } };
      const up = (e) => { if (e.pointerId === b._pid) { btn[k] = false; b.classList.remove('down'); } };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
    }
    document.body.appendChild(layer);

    const place = (name) => {
      const s = sticks[name], e = stickEls[name];
      e.style.transform = `translate3d(${s.ox}px,${s.oy}px,0)`;
      const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / R);
      e.firstChild.style.transform = `translate3d(${(dx / d * k * R).toFixed(1)}px,${(dy / d * k * R).toFixed(1)}px,0)`;
    };
    addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !touchOn) return;
      if (e.target.closest && e.target.closest(BLOCK)) return;
      const name = e.clientX < innerWidth / 2 ? 'move' : 'aim';
      if (sticks[name]) return;
      R = Math.max(40, Math.min(70, Math.min(innerWidth, innerHeight) * 0.13));
      sticks[name] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      stickEls[name].classList.add('on');
      place(name);
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') return;
      for (const name of ['move', 'aim']) {
        const s = sticks[name];
        if (s && s.id === e.pointerId) { s.x = e.clientX; s.y = e.clientY; place(name); }
      }
    }, { passive: true });
    const end = (e) => {
      if (e.pointerType !== 'touch') return;
      for (const name of ['move', 'aim']) {
        const s = sticks[name];
        if (s && s.id === e.pointerId) { sticks[name] = null; stickEls[name].classList.remove('on'); }
      }
    };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  }

  function setTouchVisible(on) {
    touchOn = !!on;
    if (!layer) return;
    layer.classList.toggle('on', touchOn);
    if (!touchOn) {
      sticks.move = sticks.aim = null;
      stickEls.move.classList.remove('on'); stickEls.aim.classList.remove('on');
      for (const k in btn) { btn[k] = false; tbtns[k] && tbtns[k].root.classList.remove('down'); }
    }
  }

  // Cooldown rings and icons on the round buttons.
  function updateTouch() {
    if (!layer || !touchOn) return;
    const m = G.match, u = m && m.units[G.me];
    if (!u) return;
    const total = { s1: u.def.skills[0].cd, s2: u.def.skills[1].cd, ult: u.def.skills[2].cd, heal: RULES.healItem.cd };
    for (const k of ['s1', 's2', 'ult', 'heal']) {
      const b = tbtns[k];
      const ik = k === 'heal' ? 'medkit' : u.def.skills[k === 's1' ? 0 : k === 's2' ? 1 : 2].icon;
      if (b.iconKey !== ik) { b.iconKey = ik; b.ic.innerHTML = icon(ik); }
      const rem = u.cd[k];
      const p = Math.round(Math.min(1, Math.max(0, rem / total[k])) * 100);
      if (p !== b.p) { b.p = p; b.root.style.setProperty('--p', p + '%'); b.root.classList.toggle('ready', rem <= 0); }
      const txt = rem > 0.05 ? (rem >= 10 ? String(Math.ceil(rem)) : rem.toFixed(1).replace('.', ',')) : '';
      if (txt !== b.txt) { b.txt = txt; b.t.textContent = txt; }
    }
  }


  /* ---- gamepad ---- */
  const readPad = () => {
    let list = [];
    try { list = padFn() || []; } catch (e) { list = []; }
    for (const p of list) if (p && p.connected !== false && p.axes && p.axes.length >= 2 && p.buttons) return p;
    return null;
  };
  // Reads the pad once per call and turns button edges into bus events; sample() and the frame loop below both call it.
  function poll() {
    const p = readPad();
    pad.present = !!p;
    if (!p) {
      Object.assign(pad, { mx: 0, mz: 0, ax: 0, az: 0, ad: 0, fire: false, s1: false, s2: false, ult: false, heal: false });
      if (edge.back) { edge.back = false; G.bus.emit('input:score', { down: false }); }
      edge.start = false; edge.dpad.fill(false);
      return;
    }
    const b = (i) => { const x = p.buttons[i]; return !!x && (x.pressed || x.value > 0.5); };
    const [lx, lz] = stick(p.axes[0] || 0, p.axes[1] || 0);
    const [rx, rz, rd] = p.axes.length >= 4 ? stick(p.axes[2] || 0, p.axes[3] || 0) : [0, 0, 0];
    pad.mx = lx; pad.mz = lz; pad.ax = rx; pad.az = rz; pad.ad = rd;
    pad.fire = rd > PAD_FIRE || b(PB.RT);
    pad.s1 = b(PB.LB); pad.s2 = b(PB.RB); pad.ult = b(PB.LT) || b(PB.A); pad.heal = b(PB.X);
    const start = b(PB.START), back = b(PB.BACK), dp = PB.DPAD.map(b);
    if (lx || lz || rd || pad.fire || pad.s1 || pad.s2 || pad.ult || pad.heal || start || back || dp.some(Boolean)) device = 'pad';
    if (start && !edge.start) G.bus.emit('input:pause');
    if (back !== edge.back) G.bus.emit('input:score', { down: back });
    dp.forEach((d, i) => { if (d && !edge.dpad[i]) G.bus.emit('input:phrase', i); });
    edge.start = start; edge.back = back; edge.dpad = dp;
  }
  // Start must still work while the match is paused and sample() is not being called.
  if (typeof requestAnimationFrame === 'function') {
    const loop = () => { poll(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  function rumble(kind) {
    const d = G.meta && G.meta.get && G.meta.get();
    if (d && d.settings && d.settings.rumble === false) return false;
    if (device !== 'pad') return false;
    const p = readPad(), va = p && p.vibrationActuator;
    if (!va || typeof va.playEffect !== 'function') return false;
    const [duration, strongMagnitude, weakMagnitude] = kind === 'death' ? [500, 1, 0.8] : [180, 0.8, 0.4];
    try {
      const r = va.playEffect(va.type || 'dual-rumble', { startDelay: 0, duration, strongMagnitude, weakMagnitude });
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (e) { return false; }
    return true;
  }
  // Typing in the chat box: held keys and mouse buttons stop counting until it closes.
  function setChatting(on) {
    chatting = !!on;
    if (chatting) { keys.clear(); }
  }

  function sample(u) {
    poll();
    if (scripted) return typeof scripted === 'function' ? scripted(G.match, u) : scripted;
    const kd = (id) => !chatting && K.isDown(id, keys);
    let mx = 0, mz = 0;
    if (kd('up')) mz -= 1;
    if (kd('down')) mz += 1;
    if (kd('left')) mx -= 1;
    if (kd('right')) mx += 1;
    if (pad.mx || pad.mz) { mx = pad.mx; mz = pad.mz; }
    const ms = sticks.move;
    if (ms) {
      const dx = (ms.x - ms.ox) / R, dy = (ms.y - ms.oy) / R;
      const l = Math.hypot(dx, dy);
      if (l > 0.12) { mx = dx; mz = dy; }
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }

    let aim = lastAim, fire = kd('fire') || pad.fire, tx = u.x + Math.cos(lastAim) * 8, tz = u.z + Math.sin(lastAim) * 8;
    const as = sticks.aim;
    if (pad.ad > 0) {
      aim = Math.atan2(pad.az, pad.ax);
      tx = u.x + Math.cos(aim) * pad.ad * AIM_REACH; tz = u.z + Math.sin(aim) * pad.ad * AIM_REACH;
    } else if (as) {
      const dx = as.x - as.ox, dy = as.y - as.oy, l = Math.hypot(dx, dy);
      const defl = Math.min(1, l / R);
      if (l > 4) {
        aim = Math.atan2(dy, dx);
        tx = u.x + Math.cos(aim) * defl * AIM_REACH; tz = u.z + Math.sin(aim) * defl * AIM_REACH;
      }
      if (defl > 0.3) fire = true;
    } else if (mouse.seen && device !== 'pad') {
      const g = G.groundAt(mouse.x, mouse.y);
      if (g) { tx = g[0]; tz = g[1]; aim = Math.atan2(tz - u.z, tx - u.x); }
    }
    lastAim = aim;
    return {
      mx, mz, aim, fire, tx, tz,
      s1: kd('s1') || btn.s1 || pad.s1, s2: kd('s2') || btn.s2 || pad.s2,
      ult: kd('ult') || btn.ult || pad.ult, heal: kd('heal') || btn.heal || pad.heal,
    };
  }

  return {
    touch, sample, setTouchVisible, updateTouch, pressed: keys,
    setPadSource: (fn) => { padFn = typeof fn === 'function' ? fn : () => []; },
    device: () => device, rumble, setChatting, padState: () => ({ ...pad }),
    script: (s) => { scripted = s || null; },
  };
}
