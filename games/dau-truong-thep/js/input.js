// Keyboard + mouse and twin-stick touch. sample(u) turns the current device state into one sim input.
import { makeTouch } from './touch.js';
import * as K from './keys.js';
import { newLock, clearLock, updateLock, aimFor, fireOk, createTracker } from './autoaim.js';

const BLOCK = 'button,input,select,textarea,a,[data-block]';
const AIM_REACH = 14, TOUCH_REACH = 12;
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
  let scripted = null, aimInit = false, lastAim = 0, chatting = false, device = 'kb', handFire = false;
  // Devices report screen directions. A view turned half round (camera.js, flipFor) turns them with it.
  const sgn = () => (G.cam ? G.cam.sign : 1);
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
  // A held thumb must not start a text selection, an image drag or a callout: Android buzzes once per long press.
  addEventListener('selectstart', (e) => { if ((running() || touch) && !typing(e.target)) e.preventDefault(); });
  addEventListener('dragstart', (e) => { if (running() || touch) e.preventDefault(); });
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true; device = 'kb'; }
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true;
    if (e.button <= 2 && !(e.target.closest && e.target.closest(BLOCK))) { keys.add('Mouse' + e.button); if (e.button === 1 && running()) e.preventDefault(); }
  });
  addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') keys.delete('Mouse' + e.button); });

  /* ---- touch layer: touch.js owns the pointers, the buttons and the layout ---- */
  const tc = makeTouch(G, { touch });
  tc.bindAim(() => lastAim);
  // Gamepad auto-aim (an option, off by default): the trigger without the right stick picks and keeps a target, like the touch fire button.
  const padLock = newLock(), padTrack = createTracker();
  function padAssist(u) {
    const m = G.match, cfg = tc.aimCfg();
    if (!cfg.pad || device !== 'pad' || !m || !u.alive || !pad.fire || pad.ad > 0) { clearLock(padLock); return null; }
    padTrack.see(m);
    const t = updateLock(padLock, m, u, { priority: cfg.priority });
    if (!t) return null;
    const a = aimFor(m, u, t, { track: padTrack });
    return { aim: a.aim, tx: a.tx, tz: a.tz, fire: fireOk(u, a.aim, t) };
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
  // Phone haptics: sparse, deliberate moments only, one table per level. Never called for the player's own firing.
  const HAPTIC = {
    hit:   { light: [15], strong: [35] },
    death: { light: [20, 50, 20], strong: [40, 60, 40] },
    ult:   { light: [12], strong: [25] },
    kill:  { light: [12], strong: [28] },
  };
  const HAPTIC_GAP = 400;
  let lastHaptic = -1e9;
  function haptic(kind) {
    const d = G.meta && G.meta.get && G.meta.get();
    const level = d && d.settings ? d.settings.vibe : 'light';
    if (level === 'off' || !touch || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    // Chrome refuses (and logs) a vibrate before the first tap on the page.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
    const pat = HAPTIC[kind] && HAPTIC[kind][level];
    const now = performance.now();
    if (!pat || now - lastHaptic < HAPTIC_GAP) return false;
    lastHaptic = now;
    try { navigator.vibrate(pat); } catch (e) { return false; }
    return true;
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
    if (!aimInit) { aimInit = true; lastAim = u.aim; }
    if (scripted) return typeof scripted === 'function' ? scripted(G.match, u) : scripted;
    const kd = (id) => !chatting && K.isDown(id, keys);
    let mx = 0, mz = 0;
    if (kd('up')) mz -= 1;
    if (kd('down')) mz += 1;
    if (kd('left')) mx -= 1;
    if (kd('right')) mx += 1;
    if (pad.mx || pad.mz) { mx = pad.mx; mz = pad.mz; }
    const t = tc.read(u);
    if (t && t.move) { mx = t.move[0]; mz = t.move[1]; }
    if (sgn() < 0) { mx = -mx; mz = -mz; }
    if (t && t.mx !== null) { mx = t.mx; mz = t.mz; }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }

    let aim = lastAim, fire = kd('fire') || pad.fire, tx = u.x + Math.cos(lastAim) * 8, tz = u.z + Math.sin(lastAim) * 8;
    if (t && t.fire) fire = true;
    const padAuto = !(t && t.aim !== null) && padAssist(u);
    let hand = false;
    if (pad.ad > 0) {
      aim = Math.atan2(pad.az * sgn(), pad.ax * sgn()); hand = pad.fire;
      tx = u.x + Math.cos(aim) * pad.ad * AIM_REACH; tz = u.z + Math.sin(aim) * pad.ad * AIM_REACH;
    } else if (t && t.aim !== null) {
      aim = t.aim; hand = t.hand;
      tx = t.tx !== null ? t.tx : u.x + Math.cos(aim) * TOUCH_REACH; tz = t.tz !== null ? t.tz : u.z + Math.sin(aim) * TOUCH_REACH;
    } else if (padAuto) {
      aim = padAuto.aim; tx = padAuto.tx; tz = padAuto.tz; fire = padAuto.fire;
    } else if (mouse.seen && device !== 'pad') {
      const g = G.groundAt(mouse.x, mouse.y);
      if (g) { tx = g[0]; tz = g[1]; aim = Math.atan2(tz - u.z, tx - u.x); hand = fire; }
    }
    lastAim = aim; handFire = hand;
    return {
      mx, mz, aim, fire, tx, tz,
      s1: kd('s1') || !!(t && t.s1) || pad.s1, s2: kd('s2') || !!(t && t.s2) || pad.s2,
      ult: kd('ult') || !!(t && t.ult) || pad.ult, heal: kd('heal') || !!(t && t.heal) || pad.heal,
    };
  }

  return {
    touch, sample, setTouchVisible: tc.setVisible, updateTouch: () => {}, pressed: keys,
    layout: tc.layout, aimState: () => ({ hint: tc.hint, fire: handFire && !scripted, aim: lastAim }), get aimHint() { return tc.hint; }, get lock() { return device === 'pad' ? padLock.target : tc.lock; },
    setPadSource: (fn) => { padFn = typeof fn === 'function' ? fn : () => []; },
    device: () => device, cursor: () => (mouse.seen && device !== 'pad' && !touch ? mouse : { seen: false }), rumble, haptic, hapticTest: () => { lastHaptic = -1e9; return haptic('hit'); }, setChatting, padState: () => ({ ...pad }),
    script: (s) => { scripted = s || null; },
  };
}
