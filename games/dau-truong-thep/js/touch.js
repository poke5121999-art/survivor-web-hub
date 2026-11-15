// Touch controls for landscape phones: floating stick on the left, fire button and a skill arc on the right.
// Layout is one table (CONTROLS) plus the player's overrides from the save data; every pointer runs a small state machine (STATES).
import { RULES } from './data.js';
import { icon } from './ui.js';

// x, y: centre of the control in design px from its anchor corner (inside the safe area). size: diameter in design px.
// One scale factor from the short side turns design px into CSS px; it never drops below 1, so no target is under 48 px.
export const CONTROLS = [
  { id: 'move', kind: 'stick', slot: -1, anchor: 'bl', x: 120, y: 104, size: 132, opacity: 0.6 },
  { id: 'fire', kind: 'fire', slot: -1, anchor: 'br', x: 66, y: 66, size: 96, opacity: 1 },
  { id: 's1', kind: 'skill', slot: 0, anchor: 'br', x: 166, y: 73, size: 56, opacity: 1 },
  { id: 'ult', kind: 'skill', slot: 2, anchor: 'br', x: 137, y: 137, size: 66, opacity: 1 },
  { id: 's2', kind: 'skill', slot: 1, anchor: 'br', x: 73, y: 166, size: 56, opacity: 1 },
  { id: 'heal', kind: 'heal', slot: -1, anchor: 'br', x: 240, y: 50, size: 50, opacity: 1 },
  { id: 'score', kind: 'util', slot: -1, anchor: 'br', x: 236, y: 112, size: 48, opacity: 1 },
];
const NAMES = { move: 'Cần gạt di chuyển', fire: 'Nút bắn', s1: 'Chiêu 1', s2: 'Chiêu 2', ult: 'Tuyệt kỹ', heal: 'Bình máu', score: 'Bảng điểm' };
const BASE_SHORT = 390, MIN_PX = 48, MAX_SIZE = 150;
const SLOT_KEY = ['s1', 's2', 'ult'];
const STICK_DEAD = 0.12, FIRE_DRAG = 9, TAP_MS = 220, HOLD_MS = 170, GROUND_DEF = 0.7, AIM_REACH = 12;

// What each skill draws and how far a drag may reach. mode: 'dir' = fixed length along the aim, 'ground' = the drag sets the distance up to `range`, 'self' = no aiming.
const line = (range, width) => ({ kind: 'line', mode: 'dir', range, radius: 0, width });
const around = (radius) => ({ kind: 'area', mode: 'self', range: 0, radius, width: 0 });
const spot = (range, radius) => ({ kind: 'area', mode: 'ground', range, radius, width: 0 });
const pick = (s) => ({ kind: 'point', mode: 'ground', range: s.cast, radius: s.pick, width: 0 });
const NONE = () => ({ kind: 'point', mode: 'self', range: 0, radius: 0.9, width: 0 });
export const SHAPES = {
  dash: (s) => line(s.dist, 2.4),
  blink: (s) => line(s.dist, 1.8),
  beam: (s) => line(s.range, s.width * 2.4),
  sweep: (s) => line(s.range, s.width * 2.4),
  hook: (s) => line(s.range, 1.2),
  volley: (s) => {
    const arc = (s.n - 1) * (s.fan || 0);
    return arc > 0.12 ? { kind: 'cone', mode: 'dir', range: s.range, radius: 0, width: 2 * s.range * Math.tan(Math.min(arc, 3) / 2) } : line(s.range, Math.max(0.8, s.r * 3));
  },
  wall: (s) => ({ kind: 'line', mode: 'ground', range: s.cast, radius: 0, width: 1.4 }),
  barrage: (s) => spot(s.cast, s.radius),
  zone: (s) => (s.at === 'self' ? around(s.radius) : spot(s.cast, s.radius)),
  mine: (s) => spot(s.cast, s.blast),
  minefield: (s) => spot(s.cast, s.radius),
  turret: (s) => spot(s.cast, 1),
  wire: (s) => spot(s.cast, s.width / 2),
  leap: (s) => spot(s.cast, s.radius),
  warp: (s) => ({ kind: 'point', mode: 'ground', range: s.dist, radius: 1.2, width: 0 }),
  swap: pick, bless: pick, mark: pick,
  nova: (s) => around(s.radius), dome: (s) => around(s.radius), rally: (s) => around(s.radius), recoil: (s) => around(s.radius),
  shield: NONE, buff: NONE, decoy: NONE, drone: NONE, stance: NONE,
};
export const shapeOf = (s) => (SHAPES[s.do] || NONE)(s);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export function makeTouch(G, opts) {
  const touchDevice = !!opts.touch;
  const P = new Map();            // pointer id -> { id, state, ctl, ox, oy, x, y, t0, blocked }
  const latch = { heal: false };
  let pending = null;             // a released skill waiting for a sim tick to take it: { slot, aim, tx, tz, t0, sent }
  let hold = null;                // the aim of the last cast, kept for a moment so a late tick still sees it
  let layer = null, probe = null, edit = null, ctls = null, cancelEl = null, reachEl = null, dotEl = null;
  let touchOn = false, editing = false, dirty = true, onClose = null, selected = 'fire', dragEd = null, lastU = null;
  let env = { W: 0, H: 0, l: 0, r: 0, t: 0, b: 0, S: 1 };
  const rects = {}, cancel = { cx: 0, cy: 0, r: 40 };
  const hint = { slot: 0, kind: 'line', x: 0, z: 0, tx: 0, tz: 0, range: 0, radius: 0, width: 0, cancel: false };
  const api = { hint: null };

  /* ---- layout data ---- */
  const store = () => { const d = G.meta && G.meta.get && G.meta.get(); if (!d) return null; if (!d.controls || d.controls.v !== 1) d.controls = { v: 1, fixedStick: false, o: {} }; return d.controls; };
  const overrides = () => { const s = store(); return s ? s.o : fallback.o; };
  const fallback = { v: 1, fixedStick: false, o: {} };
  const fixed = () => { const s = store(); return !!(s ? s.fixedStick : fallback.fixedStick); };
  const persist = () => { try { if (G.meta && G.meta.save) G.meta.save(); } catch (e) { /* a blocked store keeps the layout for this page only */ } };
  const merged = (c) => { const o = overrides()[c.id]; return o ? { ...c, ...o } : { ...c }; };
  const byId = (id) => CONTROLS.find((c) => c.id === id);

  function measure() {
    const cs = getComputedStyle(probe);
    const px = (v) => parseFloat(v) || 0;
    const W = innerWidth, H = innerHeight;
    env = { W, H, l: px(cs.paddingLeft), r: px(cs.paddingRight), t: px(cs.paddingTop), b: px(cs.paddingBottom), S: clamp(Math.min(W, H) / BASE_SHORT, 1, 1.5) };
  }
  function rectOf(c) {
    const { S } = env, sz = c.size * S, half = sz / 2;
    const cx = c.anchor === 'bl' ? env.l + c.x * S : env.W - env.r - c.x * S, cy = env.H - env.b - c.y * S;
    return { cx, cy, sz, l: cx - half, t: cy - half, r: cx + half, b: cy + half };
  }
  function layoutAll() {
    dirty = false;
    measure();
    layer.style.setProperty('--S', env.S);
    for (const c0 of CONTROLS) {
      const c = merged(c0), r = rects[c.id] = rectOf(c), v = ctls[c.id];
      v.c = c;
      v.root.style.setProperty('--sz', r.sz.toFixed(1) + 'px');
      v.root.style.setProperty('--op', c.opacity);
      if (!(c.kind === 'stick' && v.floating)) v.root.style.transform = `translate3d(${r.l.toFixed(1)}px,${r.t.toFixed(1)}px,0)`;
    }
    // The cancel disc sits above the right-hand cluster, centred on the fire button.
    let top = Infinity;
    for (const id of ['fire', 's1', 's2', 'ult']) top = Math.min(top, rects[id].t);
    cancel.r = Math.max(34, 30 * env.S);
    cancel.cx = rects.fire.cx;
    cancel.cy = Math.max(env.t + cancel.r + 8, top - 14 - cancel.r);
    cancelEl.style.transform = `translate3d(${(cancel.cx - cancel.r).toFixed(1)}px,${(cancel.cy - cancel.r).toFixed(1)}px,0)`;
    cancelEl.style.setProperty('--sz', cancel.r * 2 + 'px');
  }

  /* ---- pointer state machine ---- */
  // Each state maps an event to the next state. A handler may return nothing to stay where it is.
  const distOf = (p, cx, cy) => Math.hypot(p.x - cx, p.y - cy);
  const reachOf = (p) => Math.max(70, rects[p.ctl.id].sz * 1.35);
  const tapOf = (p) => Math.max(10, rects[p.ctl.id].sz * 0.28);
  const inCancel = (p) => Math.hypot(p.x - cancel.cx, p.y - cancel.cy) <= cancel.r;
  const skillRow = (p) => (lastU ? lastU.def.skills[p.ctl.slot] : null);

  function release(p) {
    const u = lastU, s = skillRow(p);
    const shape = shapeOf(s), c = rects[p.ctl.id];
    const a = p.state === 'skill-press' ? null : Math.atan2(p.y - c.cy, p.x - c.cx);
    const frac = a === null ? GROUND_DEF : clamp01((distOf(p, c.cx, c.cy) - tapOf(p)) / (reachOf(p) - tapOf(p)));
    pending = { slot: p.ctl.slot, aim: a, frac, shape, t0: performance.now(), sent: false, u };
  }
  const STATES = {
    stick: {
      move(p) {
        const R = rects.move.sz / 2, dx = p.x - p.ox, dy = p.y - p.oy, d = Math.hypot(dx, dy);
        if (!p.fixed && d > R) { p.ox += dx / d * (d - R); p.oy += dy / d * (d - R); }
      },
      up: () => 'idle',
    },
    fire: { move(p) { if (distOf(p, p.ox, p.oy) > FIRE_DRAG) return 'fire-drag'; }, up: () => 'idle' },
    'fire-drag': { up: () => 'idle' },
    press: { up: () => 'idle' },
    'skill-press': {
      move(p) { if (!p.blocked && distOf(p, p.ox, p.oy) > tapOf(p)) return 'skill-aim'; },
      up(p) { if (!p.blocked && performance.now() - p.t0 < 4000) release(p); return 'idle'; },
    },
    'skill-aim': {
      move(p) { if (inCancel(p)) return 'skill-cancel'; },
      up(p) { release(p); return 'idle'; },
    },
    'skill-cancel': {
      move(p) { if (!inCancel(p)) return 'skill-aim'; },
      up: () => 'idle',
    },
  };
  function enter(p, state) {
    if (state === 'idle') { endPointer(p); return; }
    p.state = state;
  }
  function endPointer(p) {
    P.delete(p.id);
    if (p.ctl && p.ctl.kind === 'util') G.bus.emit('input:score', { down: false });
    if (p.ctl && p.ctl.kind === 'stick' && ctls.move.floating) { ctls.move.floating = false; dirty = true; }
  }
  function dispatch(p, ev) {
    const fn = STATES[p.state] && STATES[p.state][ev];
    const next = fn ? fn(p) : undefined;
    if (next) enter(p, next);
  }

  function startStick(e) {
    const r = rects.move, fx = fixed();
    const ox = fx ? r.cx : e.clientX, oy = fx ? r.cy : e.clientY;
    const p = { id: e.pointerId, state: 'stick', ctl: byId('move'), ox, oy, x: e.clientX, y: e.clientY, t0: performance.now(), fixed: fx };
    P.set(p.id, p);
    const v = ctls.move;
    v.floating = !fx;
    if (!fx) v.root.style.transform = `translate3d(${(ox - r.sz / 2).toFixed(1)}px,${(oy - r.sz / 2).toFixed(1)}px,0)`;
  }
  function startButton(e, c) {
    if (editing) return;
    e.preventDefault(); e.stopPropagation();
    const r = rects[c.id], u = lastU;
    const p = { id: e.pointerId, state: c.kind === 'fire' ? 'fire' : c.kind === 'skill' ? 'skill-press' : 'press', ctl: c, ox: r.cx, oy: r.cy, x: e.clientX, y: e.clientY, t0: performance.now(), blocked: false };
    if (c.kind === 'skill') p.blocked = !u || !u.alive || u.cd[SLOT_KEY[c.slot]] > 0;
    if (c.kind === 'heal') latch.heal = true;
    if (c.kind === 'util') G.bus.emit('input:score', { down: true });
    try { ctls[c.id].root.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    P.set(p.id, p);
  }

  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !touchOn || editing) return;
      if (e.target.closest && e.target.closest('button,input,select,textarea,a,[data-block]')) return;
      if (e.clientX >= innerWidth / 2 || [...P.values()].some((p) => p.state === 'stick')) return;
      startStick(e);
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') return;
      if (dragEd && dragEd.pid === e.pointerId) { dragEditor(e); return; }
      const p = P.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      dispatch(p, 'move');
    }, { passive: true });
    const end = (e) => {
      if (e.pointerType !== 'touch') return;
      if (dragEd && dragEd.pid === e.pointerId) { dragEd = null; return; }
      const p = P.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (e.type === 'pointercancel') enter(p, 'idle'); else dispatch(p, 'up');
    };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    addEventListener('resize', () => { dirty = true; });
    addEventListener('orientationchange', () => { dirty = true; });
  }

  /* ---- DOM ---- */
  const RING = '<svg class="tc-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="46"/><circle class="bar" cx="50" cy="50" r="46" pathLength="100" transform="rotate(-90 50 50)"/></svg>';
  function build() {
    probe = el('div', 'tc-probe');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    layer = el('div', 'tc');
    layer.id = 'touch';
    layer.appendChild(probe);
    ctls = {};
    for (const c of CONTROLS) {
      const root = el('div', `tc-ctl tc-${c.kind}`);
      root.dataset.id = c.id;
      root.dataset.block = '';
      if (c.kind === 'stick') root.innerHTML = '<i class="tc-base"></i><i class="tc-knob"></i>';
      else root.innerHTML = `<i class="tc-plate"></i><span class="tc-ic"></span><i class="tc-sweep"></i>${RING}<b class="tc-t"></b>`;
      layer.appendChild(root);
      ctls[c.id] = { root, c, ic: root.querySelector('.tc-ic'), t: root.querySelector('.tc-t'), bar: root.querySelector('.bar'), knob: root.querySelector('.tc-knob'), cache: {}, floating: false };
      if (c.kind !== 'stick') root.addEventListener('pointerdown', (e) => (editing ? beginEditDrag(e, c.id) : startButton(e, c)));
      else root.addEventListener('pointerdown', (e) => { if (editing) beginEditDrag(e, c.id); });
    }
    cancelEl = el('div', 'tc-cancel', '<span>✕</span><small>Hủy</small>');
    reachEl = el('i', 'tc-reach');
    dotEl = el('i', 'tc-dot');
    layer.append(cancelEl, reachEl, dotEl);
    document.body.appendChild(layer);
    ensureCss();
    wire();
    layoutAll();
  }
  // Another file normally links css/touch.css; link it from here only when nobody has.
  function ensureCss() {
    if ([...document.styleSheets].some((s) => s.href && s.href.includes('touch.css')) || document.querySelector('link[href*="touch.css"]')) return;
    const l = el('link'); l.rel = 'stylesheet'; l.href = new URL('../css/touch.css', import.meta.url).href;
    document.head.appendChild(l);
  }
  if (touchDevice) { document.documentElement.style.touchAction = 'none'; build(); }

  function setCache(v, key, val, fn) { if (v.cache[key] !== val) { v.cache[key] = val; fn(val); } }

  // Per-frame look of every control: cooldown sweep and number, ring fill, usable and pressed states.
  function paint(u) {
    const pressing = new Set();
    for (const p of P.values()) if (p.ctl) pressing.add(p.ctl.id);
    const color = u ? (u.color | 0) : 0;
    if (layer.dataset.team !== String(color)) layer.dataset.team = color;
    const usable = !!u && u.alive && u.stunT <= 0 && !u.cast && !u.dash;
    for (const c0 of CONTROLS) {
      const v = ctls[c0.id], c = v.c || c0;
      if (c.kind === 'stick') continue;
      let cls = '', cd = 0, txt = '', ring = 0, iconKey = '', rem = 0;
      if (c.kind === 'skill') {
        const s = u && u.def.skills[c.slot];
        iconKey = !s ? 'generic' : s.do === 'stance' && u.stance ? 'planted' : s.icon || 'generic';
        if (s) {
          rem = u.cd[SLOT_KEY[c.slot]]; cd = clamp01(rem / s.cd);
          if (c.slot === 2) ring = 1 - cd;
          if (s.do === 'stance' && u.stance) cls += ' planted';
        }
        if (rem > 0.05) cls += ' cd'; else if (usable) cls += ' ready';
        if (!usable) cls += ' off';
      } else if (c.kind === 'fire') {
        iconKey = 'weapon';
        const C = u && u.def.weapon.charge;
        if (C && u.charge > 0) { ring = clamp01((u.charge - C.min) / (C.max - C.min)); cls += ' charging'; }
        if (!u || !u.alive || u.stunT > 0) cls += ' off';
      } else if (c.kind === 'heal') {
        iconKey = 'medkit';
        rem = u ? u.cd.heal : 0; cd = clamp01(rem / RULES.healItem.cd);
        if (rem > 0.05) cls += ' cd'; else if (u && u.alive && u.hp < u.maxHp) cls += ' ready';
        if (!u || !u.alive || u.hp >= u.maxHp) cls += ' off';
      } else { iconKey = 'trophy'; }
      if (rem > 0.05) txt = rem >= 10 ? String(Math.ceil(rem)) : rem.toFixed(1).replace('.', ',');
      if (pressing.has(c.id)) cls += ' down';
      for (const p of P.values()) if (p.ctl === c && (p.state === 'skill-aim' || p.state === 'skill-cancel')) cls += ' aim';
      if (editing && selected === c.id) cls += ' sel';
      setCache(v, 'cls', cls, (x) => { v.root.className = `tc-ctl tc-${c.kind}${x}`; });
      setCache(v, 'icon', iconKey, (x) => { v.ic.innerHTML = icon(x); });
      setCache(v, 'cd', cd.toFixed(3), (x) => v.root.style.setProperty('--cd', x));
      setCache(v, 'txt', txt, (x) => { v.t.textContent = x; });
      setCache(v, 'ring', ring.toFixed(3), () => { v.bar.style.strokeDashoffset = (100 - ring * 100).toFixed(1); });
    }
    // stick knob
    const sv = ctls.move, sp = [...P.values()].find((p) => p.state === 'stick');
    const R = rects.move.sz / 2;
    let kx = 0, ky = 0;
    if (sp) { const dx = sp.x - sp.ox, dy = sp.y - sp.oy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / R); kx = dx / d * k * R; ky = dy / d * k * R; if (sp.fixed === false) sv.root.style.transform = `translate3d(${(sp.ox - R).toFixed(1)}px,${(sp.oy - R).toFixed(1)}px,0)`; }
    setCache(sv, 'knob', kx.toFixed(1) + ',' + ky.toFixed(1), () => { sv.knob.style.transform = `translate3d(${kx.toFixed(1)}px,${ky.toFixed(1)}px,0)`; });
    const scls = (sp || editing ? ' act' : '') + (editing && selected === 'move' ? ' sel' : '');
    setCache(sv, 'cls', scls, (x) => { sv.root.className = 'tc-ctl tc-stick' + x; });
    // aim drag overlay
    const ap = [...P.values()].find((p) => p.state === 'skill-aim' || p.state === 'skill-cancel');
    layer.classList.toggle('aiming', !!ap);
    if (ap) {
      const c = rects[ap.ctl.id], rr = reachOf(ap);
      reachEl.style.transform = `translate3d(${(c.cx - rr).toFixed(1)}px,${(c.cy - rr).toFixed(1)}px,0)`;
      reachEl.style.setProperty('--sz', rr * 2 + 'px');
      dotEl.style.transform = `translate3d(${(ap.x - 12).toFixed(1)}px,${(ap.y - 12).toFixed(1)}px,0)`;
      cancelEl.classList.toggle('hot', ap.state === 'skill-cancel');
    }
  }

  // World-space aim indicator for the renderer; null unless a skill is being dragged.
  function updateHint(u) {
    let ap = null;
    for (const p of P.values()) if (p.state === 'skill-aim' || p.state === 'skill-cancel') ap = p;
    if (!ap || !u || !u.alive) { api.hint = null; return; }
    const s = u.def.skills[ap.ctl.slot], sh = shapeOf(s), c = rects[ap.ctl.id];
    const a = Math.atan2(ap.y - c.cy, ap.x - c.cx), frac = clamp01((distOf(ap, c.cx, c.cy) - tapOf(ap)) / (reachOf(ap) - tapOf(ap)));
    const d = sh.mode === 'ground' ? sh.range * frac : sh.mode === 'dir' ? sh.range : 0;
    hint.slot = ap.ctl.slot; hint.kind = sh.kind; hint.x = u.x; hint.z = u.z;
    hint.tx = u.x + Math.cos(a) * d; hint.tz = u.z + Math.sin(a) * d;
    hint.range = sh.range; hint.radius = sh.radius; hint.width = sh.width; hint.cancel = ap.state === 'skill-cancel';
    api.hint = hint;
  }

  function frame() {
    if (!layer || !(touchOn || editing)) { if (api.hint) api.hint = null; return; }
    if (dirty) layoutAll();
    const m = G.match, u = m && m.units[G.me] || null;
    lastU = u;
    paint(u);
    updateHint(editing ? null : u);
  }
  if (typeof requestAnimationFrame === 'function') {
    const loop = () => { if (layer) frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  /* ---- what the sim tick reads ---- */
  const out = { move: null, fire: false, aim: null, tx: null, tz: null, s1: false, s2: false, ult: false, heal: false, mx: null, mz: null };
  function read(u) {
    if (!layer || !touchOn || editing) return null;
    lastU = u;
    out.move = null; out.fire = false; out.aim = null; out.tx = out.tz = null; out.mx = out.mz = null; out.s1 = out.s2 = out.ult = out.heal = false;
    const now = performance.now();
    let any = false;
    for (const p of P.values()) {
      any = true;
      if (p.state === 'stick') {
        const R = rects.move.sz / 2, dx = (p.x - p.ox) / R, dy = (p.y - p.oy) / R;
        if (Math.hypot(dx, dy) > STICK_DEAD) out.move = [dx, dy];
      } else if (p.state === 'fire' || p.state === 'fire-drag') {
        out.fire = true;
        if (p.state === 'fire-drag' && out.aim === null) { out.aim = Math.atan2(p.y - p.oy, p.x - p.ox); }
      } else if (p.state === 'press' && p.ctl.kind === 'heal') out.heal = true;
      else if (p.state === 'skill-aim' || p.state === 'skill-cancel') {
        const s = u.def.skills[p.ctl.slot], sh = shapeOf(s), c = rects[p.ctl.id];
        const a = Math.atan2(p.y - c.cy, p.x - c.cx);
        out.aim = a;
        const frac = clamp01((distOf(p, c.cx, c.cy) - tapOf(p)) / (reachOf(p) - tapOf(p)));
        const d = sh.mode === 'ground' ? sh.range * frac : sh.mode === 'dir' ? sh.range : AIM_REACH / 2;
        out.tx = u.x + Math.cos(a) * d; out.tz = u.z + Math.sin(a) * d;
      }
    }
    // A tap shorter than one tick still counts once.
    if (latch.heal) { out.heal = true; latch.heal = false; }
    if (pending) {
      const key = SLOT_KEY[pending.slot];
      // The flag stays up until a tick has seen it and the skill started its cooldown, or the grace period ends; the sim gates the rest.
      if ((pending.sent && u.cd[key] > 0.2) || now - pending.t0 > TAP_MS || pending.u !== u) pending = null;
      else {
        if (!pending.fixedAim) {
          const s = u.def.skills[pending.slot], sh = pending.shape, a = pending.aim === null ? lastAimOf() : pending.aim;
          const d = sh.mode === 'ground' ? sh.range * pending.frac : sh.mode === 'dir' ? sh.range : AIM_REACH / 2;
          pending.aim = a; pending.tx = u.x + Math.cos(a) * d; pending.tz = u.z + Math.sin(a) * d;
          // A blink goes where the move input points: make it the aim for the tick it fires.
          pending.mx = s.do === 'blink' ? Math.cos(a) : null; pending.mz = s.do === 'blink' ? Math.sin(a) : null;
          pending.fixedAim = true;
          hold = { aim: a, tx: pending.tx, tz: pending.tz, until: now + HOLD_MS };
        }
        out[key] = true; pending.sent = true;
        out.aim = pending.aim; out.tx = pending.tx; out.tz = pending.tz;
        if (pending.mx !== null) { out.mx = pending.mx; out.mz = pending.mz; }
        return out;
      }
    }
    if (hold && out.aim === null && now < hold.until) { out.aim = hold.aim; out.tx = hold.tx; out.tz = hold.tz; }
    else if (hold && now >= hold.until) hold = null;
    return any || out.aim !== null ? out : null;
  }
  let aimOf = () => 0;
  const lastAimOf = () => aimOf();

  function setVisible(on) {
    touchOn = !!on;
    if (!layer) return;
    layer.classList.toggle('on', touchOn || editing);
    if (!touchOn) { for (const p of [...P.values()]) endPointer(p); pending = null; hold = null; latch.heal = false; api.hint = null; }
  }

  /* ---- layout editor ---- */
  function setOverride(id, patch) {
    const s = store(), o = s ? s.o : fallback.o;
    o[id] = { ...(o[id] || {}), ...patch };
    dirty = true;
  }
  function beginEditDrag(e, id) {
    e.preventDefault(); e.stopPropagation();
    select(id);
    const r = rects[id];
    dragEd = { pid: e.pointerId, id, dx: e.clientX - r.cx, dy: e.clientY - r.cy };
    try { ctls[id].root.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function dragEditor(e) {
    const c = ctls[dragEd.id].c, S = env.S, half = c.size / 2;
    const cx = e.clientX - dragEd.dx, cy = e.clientY - dragEd.dy;
    const x = c.anchor === 'bl' ? (cx - env.l) / S : (env.W - env.r - cx) / S, y = (env.H - env.b - cy) / S;
    const wMax = (env.W - env.l - env.r) / S - half, hMax = (env.H - env.t - env.b) / S - half;
    setOverride(dragEd.id, { x: Math.round(clamp(x, half, wMax)), y: Math.round(clamp(y, half, hMax)) });
    layoutAll();
  }
  function select(id) {
    selected = id;
    if (!edit) return;
    const c = ctls[id].c;
    edit.sel.textContent = NAMES[id] || id;
    edit.size.value = c.size; edit.op.value = Math.round(c.opacity * 100);
  }
  function buildEditor() {
    const root = el('div', 'tc-edit');
    root.dataset.block = '';
    root.innerHTML = `
      <div class="tc-dim"></div>
      <div class="tc-panel">
        <div class="tc-head"><b>Bố cục nút điều khiển</b><span data-r="sel"></span></div>
        <label class="tc-fld"><span>Kích thước</span><input type="range" data-r="size" min="${MIN_PX}" max="${MAX_SIZE}" step="1"></label>
        <label class="tc-fld"><span>Độ mờ</span><input type="range" data-r="op" min="30" max="100" step="5"></label>
        <div class="tc-row">
          <label class="tc-chk"><input type="checkbox" data-r="fixed"><span>Cần gạt cố định</span></label>
          <button type="button" data-r="reset">Về mặc định</button><button type="button" data-r="done" class="pri">Xong</button>
        </div>
      </div>`;
    layer.appendChild(root);
    const q = (n) => root.querySelector(`[data-r="${n}"]`);
    edit = { root, sel: q('sel'), size: q('size'), op: q('op'), fixed: q('fixed') };
    edit.size.addEventListener('input', () => { setOverride(selected, { size: Number(edit.size.value) }); layoutAll(); });
    edit.op.addEventListener('input', () => { setOverride(selected, { opacity: Number(edit.op.value) / 100 }); layoutAll(); });
    edit.fixed.addEventListener('change', () => { setFixed(edit.fixed.checked); });
    q('reset').addEventListener('click', () => reset());
    q('done').addEventListener('click', () => close());
  }
  function setFixed(v) { const s = store(); if (s) s.fixedStick = !!v; else fallback.fixedStick = !!v; if (edit) edit.fixed.checked = !!v; persist(); }
  function openEditor(o) {
    if (!layer) { build(); wire(); }
    if (!edit) buildEditor();
    onClose = o && typeof o.onClose === 'function' ? o.onClose : null;
    editing = true;
    for (const p of [...P.values()]) endPointer(p);
    layer.classList.add('on', 'editing');
    edit.fixed.checked = fixed();
    dirty = true; layoutAll(); select(selected in ctls ? selected : 'fire');
  }
  function close() {
    if (!editing) return;
    editing = false; dragEd = null;
    layer.classList.remove('editing');
    layer.classList.toggle('on', touchOn);
    persist();
    const f = onClose; onClose = null;
    if (f) f();
  }
  function reset() {
    const s = store();
    if (s) { s.o = {}; s.fixedStick = false; } else { fallback.o = {}; fallback.fixedStick = false; }
    if (edit) edit.fixed.checked = false;
    dirty = true; if (layer) layoutAll(); if (edit) select(selected);
    persist();
  }
  function set(o = {}) {
    if (typeof o.fixedStick === 'boolean') setFixed(o.fixedStick);
    if (o.controls && typeof o.controls === 'object') {
      for (const [id, v] of Object.entries(o.controls)) {
        if (!byId(id) || !v) continue;
        const patch = {};
        for (const k of ['x', 'y', 'size', 'opacity']) if (Number.isFinite(v[k])) patch[k] = v[k];
        if (patch.size !== undefined) patch.size = clamp(patch.size, MIN_PX, MAX_SIZE);
        if (patch.opacity !== undefined) patch.opacity = clamp(patch.opacity, 0.2, 1);
        setOverride(id, patch);
      }
    }
    persist();
    if (layer) layoutAll();
  }
  function get() {
    if (layer) layoutAll(); else { /* no DOM on desktop: report the table only */ }
    return {
      v: 1, fixedStick: fixed(), scale: env.S, editing,
      controls: CONTROLS.map((c0) => { const c = merged(c0), r = rects[c.id]; return { ...c, rect: r ? { l: r.l, t: r.t, w: r.sz, h: r.sz } : null }; }),
    };
  }

  const layout = { edit: openEditor, close, reset, get, set };
  return { read, setVisible, layout, get hint() { return api.hint; }, bindAim: (fn) => { aimOf = fn; }, frame, get on() { return touchOn; } };
}
