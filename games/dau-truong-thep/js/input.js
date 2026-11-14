// Keyboard + mouse and twin-stick touch. sample(u) turns the current device state into one sim input.
import { RULES } from './data.js';
import { icon } from './ui.js';
import * as K from './keys.js';

const BLOCK = 'button,input,select,textarea,a,[data-block]';
const AIM_REACH = 14;

export function makeInput(G) {
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const keys = new Set();
  const mouse = { x: 0, y: 0, seen: false };
  const sticks = { move: null, aim: null };
  const btn = { s1: false, s2: false, ult: false, heal: false };
  let scripted = null, touchOn = false, lastAim = 0, R = 56;

  const running = () => !!(G.match && !G.match.over);
  const typing = (t) => t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);

  addEventListener('keydown', (e) => {
    if (typing(e.target)) return;
    // Space scrolls and Tab moves focus: both would fight the match while it runs.
    if (running() && (e.code === 'Space' || e.code === 'Tab' || K.actionOf(e.code))) e.preventDefault();
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); });
  addEventListener('contextmenu', (e) => { if (running() || touch) e.preventDefault(); });
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true; }
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

  function sample(u) {
    if (scripted) return typeof scripted === 'function' ? scripted(G.match, u) : scripted;
    let mx = 0, mz = 0;
    if (K.isDown('up', keys)) mz -= 1;
    if (K.isDown('down', keys)) mz += 1;
    if (K.isDown('left', keys)) mx -= 1;
    if (K.isDown('right', keys)) mx += 1;
    const ms = sticks.move;
    if (ms) {
      const dx = (ms.x - ms.ox) / R, dy = (ms.y - ms.oy) / R;
      const l = Math.hypot(dx, dy);
      if (l > 0.12) { mx = dx; mz = dy; }
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }

    let aim = lastAim, fire = K.isDown('fire', keys), tx = u.x + Math.cos(lastAim) * 8, tz = u.z + Math.sin(lastAim) * 8;
    const as = sticks.aim;
    if (as) {
      const dx = as.x - as.ox, dy = as.y - as.oy, l = Math.hypot(dx, dy);
      const defl = Math.min(1, l / R);
      if (l > 4) {
        aim = Math.atan2(dy, dx);
        tx = u.x + Math.cos(aim) * defl * AIM_REACH; tz = u.z + Math.sin(aim) * defl * AIM_REACH;
      }
      if (defl > 0.3) fire = true;
    } else if (mouse.seen) {
      const g = G.groundAt(mouse.x, mouse.y);
      if (g) { tx = g[0]; tz = g[1]; aim = Math.atan2(tz - u.z, tx - u.x); }
    }
    lastAim = aim;
    return {
      mx, mz, aim, fire, tx, tz,
      s1: K.isDown('s1', keys) || btn.s1, s2: K.isDown('s2', keys) || btn.s2,
      ult: K.isDown('ult', keys) || btn.ult, heal: K.isDown('heal', keys) || btn.heal,
    };
  }

  return {
    touch, sample, setTouchVisible, updateTouch, pressed: keys,
    script: (s) => { scripted = s || null; },
  };
}
