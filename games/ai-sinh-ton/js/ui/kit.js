// 3D UI kit: every panel, button, tile and HUD piece is a lit three.js mesh drawn over the battle by its own
// orthographic scene. Design units are CSS px of a 360 wide frame (x right, y DOWN, origin top-left). A node's
// own origin is its top-left corner; world y is the negative of design y.
import { makeGeo } from './kit-geo.js?v=20261120b';
import { makeText } from './kit-text.js?v=20261120b';
import { makeIcons } from './icons.js?v=20261120b';

export const PAL = {
  gold: 0xffc21f, orange: 0xff8a1f, red: 0xff3b52, green: 0x35d65a, blue: 0x2f7bff, purple: 0x8f4dff, teal: 0x20c7c0, pink: 0xff5fa8,
  ink: 0x1a1420, cream: 0xfff1cf, panel: 0x4a3a86, panelDark: 0x2a2150, disabled: 0x7d7a93,
  rarity: { common: 0x98a6c4, good: 0x3fcf5f, rare: 0x2f86ff, epic: 0xa955ff, legend: 0xffa31f, myth: 0xff4056 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutBack = (t) => { t = clamp(t, 0, 1); const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const spring = () => ({ x: 0, v: 0, t: 0 });
function stepSpring(s, dt, k = 300, c = 19) {
  const n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
  for (let i = 0; i < n; i++) { s.v += ((s.t - s.x) * k - s.v * c) * h; s.x += s.v * h; }
}

export function createUI({ THREE, renderer, frame }) {
  const geo = makeGeo(THREE);
  const ui = { THREE, PAL, W: 360, H: 780, u: 1, dpr: 1, t: 0, drawCalls: 0 };
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 360, 0, -780, 0.1, 2400); camera.position.z = 1200;
  const lights = [];
  { // one key light from the top-left, a fill from the lower right, a soft ambient; lights reach every layer
    const key = new THREE.DirectionalLight(0xfff3e0, 2.5); key.position.set(-0.5, 0.75, 1);
    const fill = new THREE.DirectionalLight(0xbcd0ff, 0.75); fill.position.set(0.7, -0.6, 0.8);
    const amb = new THREE.AmbientLight(0xffffff, 0.95);
    for (const l of [key, fill, amb]) { l.layers.enableAll(); scene.add(l); lights.push(l); }
  }

  const anims = new Set(); const targets = new Set(); const scrolls = new Set(); const viewports = new Set(); const anchored = new Set(); const screens = new Map(); const timers = [];
  const anim = (node, fn) => { const a = { node, fn }; anims.add(a); return a; };
  const inScene = (n) => { for (let a = n; a; a = a.parent) if (a === scene) return true; return false; };
  const shown = (n) => { for (let a = n; a; a = a.parent) { if (!a.visible) return false; if (a === scene) return true; } return false; };
  const screenOf = (n) => { for (let a = n; a; a = a.parent) if (a.isScreen) return a; return null; };

  // ---------- nodes ----------
  function mkNode(w = 0, h = 0) {
    const g = new THREE.Group();
    Object.assign(g, { w, h, ux: 0, uy: 0, top: 0, hiddenByUser: false });
    g.pos = (x, y, z) => { g.ux = x; g.uy = y; g.position.set(x, -y, z === undefined ? g.position.z : z); return g; };
    g.setVisible = (b) => { g.hiddenByUser = !b; g.visible = !!b; return g; };
    g.put = (c, x = 0, y = 0, z = 0) => { (g.slot || g).add(c); if (c.pos) c.pos(x, y, g.top + z); else c.position.set(x, -y, g.top + z); return c; };
    g.anchor = (x, mode, dy = 0) => { g.anch = { x, mode, dy }; anchored.add(g); placeAnchored(g); return g; };
    g.dispose = () => {
      for (const a of [...anims]) if (a.node === g) anims.delete(a);
      for (const t of [...targets]) if (t.node === g) targets.delete(t);
      scrolls.delete(g); anchored.delete(g);
      g.traverse((o) => { if (o.dispose && o !== g) o.dispose(); });
      g.parent && g.parent.remove(g);
    };
    return g;
  }
  function placeAnchored(g) {
    const { x, mode, dy } = g.anch; g.pos(x, mode === 'bottom' ? ui.H + dy : mode === 'center' ? ui.H / 2 + dy : dy);
  }
  ui.group = (o = {}) => mkNode(o.w || 0, o.h || 0);

  // ---------- text ----------
  const txt = makeText(THREE, { scale: () => ui.dpr * ui.u, mkNode });
  ui.text = (str, o) => txt.text(str, o);
  const icons = makeIcons(THREE, geo);
  ui.iconNames = icons.names;

  // ---------- panel ----------
  const shadowMats = new Map();
  function addShadow(g, w, h, r, offY = 4, strength = 0.42) {
    const tex = geo.shadow(w, h, r, 7); let m = shadowMats.get(tex);
    if (!m) { m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: strength, depthWrite: false, toneMapped: false }); shadowMats.set(tex, m); }
    const pad = tex.userData.pad, mesh = new THREE.Mesh(geo.quad(w + pad * 2, h + pad * 2), m);
    mesh.position.set(w / 2, -h / 2 - offY, -14); g.add(mesh); return mesh;
  }
  // outline ring (behind the slab) and top gloss (in front of it) share one vertex-coloured transparent mesh
  const decalCache = new Map(), decalMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
  function decal(w, h, r, bevel, depth, ow, outline, gloss) {
    const key = [w, h, r, bevel, depth, ow, outline, gloss].join('|'); let g = decalCache.get(key);
    if (!g) {
      const parts = [];
      if (outline != null) parts.push([geo.plate(w + ow * 2, h + ow * 2, r + ow), -ow, ow, -bevel - 0.6, new THREE.Color(outline), 1]);
      if (gloss) { const ins = bevel + 2.5, gw = w - ins * 2, gh = Math.max(5, (h - ins * 2) * 0.4); parts.push([geo.plate(gw, gh, Math.max(2, r - ins)), ins, -ins, depth + bevel + 0.15, new THREE.Color(0xffffff), 0.2]); }
      let n = 0; for (const p of parts) n += p[0].toNonIndexed().attributes.position.count;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 4); let o = 0;
      for (const [pg, dx, dy, dz, c, a] of parts) { const t = pg.toNonIndexed(), p = t.attributes.position; for (let i = 0; i < p.count; i++, o++) { pos.set([p.getX(i) + dx, p.getY(i) + dy, dz], o * 3); col.set([c.r, c.g, c.b, a], o * 4); } }
      g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4)); decalCache.set(key, g);
    }
    return new THREE.Mesh(g, decalMat);
  }
  ui.panel = (o = {}) => {
    const w = o.w ?? 100, h = o.h ?? 60, r = o.r ?? 14, depth = o.depth ?? 6, color = o.color ?? PAL.panel;
    const bevel = Math.min(o.bevel ?? 3, Math.max(1, r - 1)), ow = o.ow ?? 3, outline = o.outline === undefined ? PAL.ink : o.outline;
    const g = mkNode(w, h); g.top = depth + bevel + 0.3;
    if (o.shadow !== false) addShadow(g, w, h, r, o.shadowY ?? 5);
    const body = new THREE.Mesh(geo.slab(w, h, r, depth, bevel), geo.std(color)); g.add(body); g.body = body;
    const gl = o.gloss !== false && h >= 14;
    if (outline != null || gl) g.add(decal(w, h, r, bevel, depth, ow, outline, gl));
    g.setColor = (c) => { body.material = geo.std(c); return g; };
    return g;
  };

  // ---------- icons ----------
  ui.icon = (name, o = {}) => {
    const size = o.size ?? 32, g = mkNode(size, size), inner = icons.make(name, o.color);
    inner.scale.setScalar(size); inner.position.set(size / 2, -size / 2, size * 0.2); g.add(inner); g.top = size * 0.2;
    const a = inner.userData.anim, ph = Math.random() * 6;
    if (a || o.sway !== false) anim(g, (dt, t) => { if (a) a(t); if (o.sway !== false) { inner.rotation.y = Math.sin(t * 1.7 + ph) * 0.22; inner.rotation.x = Math.sin(t * 1.3 + ph) * 0.08; } });
    return g;
  };

  // ---------- interaction ----------
  function addTarget(g, o) {
    if (!o.id) throw new Error('ui target created without an id');
    const t = { id: o.id, node: g, enabled: true, onTap: o.onTap, press: o.press || (() => {}), h: o.h || (() => g.h), sp: null };
    targets.add(t); g.target = t; return t;
  }
  const _v = new THREE.Vector3();
  function rawBox(g, w, h) {
    g.updateWorldMatrix(true, false); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [cx, cy] of [[0, 0], [w, 0], [w, -h], [0, -h]]) { _v.set(cx, cy, 0).applyMatrix4(g.matrixWorld); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, -_v.y); y1 = Math.max(y1, -_v.y); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const inter = (a, b) => { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h); return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null; };
  function visualBox(t) {
    if (!shown(t.node)) return null; const s = screenOf(t.node); if (!s || s.hiding) return null;
    let b = rawBox(t.node, t.node.w, t.h());
    for (let a = t.node.parent; a; a = a.parent) if (a.isScroll) { b = inter(b, rawBox(a, a.w, a.h)); if (!b) return null; }
    return b;
  }
  function hitBox(b) { const w = Math.max(48, b.w), h = Math.max(48, b.h); return { x: b.x - (w - b.w) / 2, y: b.y - (h - b.h) / 2, w, h }; }
  function liveTargets() {
    scene.updateMatrixWorld(); const out = [];
    const modalZ = Math.max(-1, ...[...screens.values()].filter((s) => s.visible && !s.hiding && s.modal).map((s) => s.position.z));
    for (const t of targets) {
      const vb = visualBox(t); if (!vb) continue; const s = screenOf(t.node); if (s.position.z < modalZ) continue;
      _v.setFromMatrixPosition(t.node.matrixWorld); out.push({ t, vb, hb: hitBox(vb), z: _v.z, s });
    }
    return out;
  }
  const rectHas = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  function pick(dx, dy, list = liveTargets()) {
    const vis = list.filter((e) => rectHas(e.vb, dx, dy)).sort((a, b) => b.z - a.z);
    if (vis.length) return vis[0];
    const near = list.filter((e) => rectHas(e.hb, dx, dy));
    near.sort((a, b) => Math.hypot(dx - a.hb.x - a.hb.w / 2, dy - a.hb.y - a.hb.h / 2) - Math.hypot(dx - b.hb.x - b.hb.w / 2, dy - b.hb.y - b.hb.h / 2));
    return near[0] || null;
  }
  const toDesign = (cx, cy) => { const r = frame.getBoundingClientRect(); return [(cx - r.left) / (r.width / 360), (cy - r.top) / (r.width / 360)]; };
  ui.hitAt = (cx, cy) => { const [dx, dy] = toDesign(cx, cy); const e = pick(dx, dy); return e ? e.t.id : null; };
  ui.targets = () => {
    const r = frame.getBoundingClientRect(), k = r.width / 360;
    return liveTargets().map((e) => ({ id: e.t.id, x: r.left + e.hb.x * k, y: r.top + e.hb.y * k, w: e.hb.w * k, h: e.hb.h * k, enabled: e.t.enabled, screen: e.s.screenName }));
  };
  ui.node = (id) => { for (const t of targets) if (t.id === id) return t.node; return null; };
  function fire(t) { if (t.enabled && t.onTap) t.onTap(); }
  ui.tapId = (id) => {
    const e = liveTargets().find((q) => q.t.id === id); if (!e) return false;
    e.t.press(true); timers.push({ at: ui.t + 0.11, fn: () => e.t.press(false) }); fire(e.t); return true;
  };

  let down = null;
  frame.style.touchAction = 'none';
  const scrollAt = (dx, dy) => { let best = null; for (const s of scrolls) if (shown(s) && rectHas(rawBox(s, s.w, s.h), dx, dy)) best = s; return best; };
  frame.addEventListener('pointerdown', (e) => {
    if (down) return; scene.updateMatrixWorld();
    const [dx, dy] = toDesign(e.clientX, e.clientY), hit = pick(dx, dy);
    down = { id: e.pointerId, x0: e.clientX, y0: e.clientY, hit, scroll: scrollAt(dx, dy), drag: false, lastY: e.clientY, lastT: performance.now(), v: 0, dead: false };
    if (hit) hit.t.press(true);
    if (down.scroll) down.scroll.vy = 0;
    try { frame.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
  });
  frame.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dist = Math.hypot(e.clientX - down.x0, e.clientY - down.y0);
    if (!down.drag && dist > 10) { down.drag = true; if (down.hit) { down.hit.t.press(false); } down.dead = true; }
    if (down.drag && down.scroll) {
      const k = frame.getBoundingClientRect().width / 360, now = performance.now(), dyp = (e.clientY - down.lastY) / k;
      down.scroll.drag(-dyp); const dtm = Math.max(1, now - down.lastT); down.v = down.v * 0.6 + (-dyp / dtm * 1000) * 0.4; down.lastY = e.clientY; down.lastT = now;
    }
  });
  const end = (e, cancel) => {
    if (!down || e.pointerId !== down.id) return; const d = down; down = null;
    if (d.hit) d.hit.t.press(false);
    if (d.drag && d.scroll) { d.scroll.fling(performance.now() - d.lastT > 90 ? 0 : d.v); return; }
    if (cancel || d.dead || !d.hit) return;
    const [dx, dy] = toDesign(e.clientX, e.clientY), now = pick(dx, dy);
    if (now && now.t === d.hit.t) fire(d.hit.t);
  };
  frame.addEventListener('pointerup', (e) => end(e, false));
  frame.addEventListener('pointercancel', (e) => end(e, true));
  frame.addEventListener('wheel', (e) => { const [dx, dy] = toDesign(e.clientX, e.clientY), s = scrollAt(dx, dy); if (s) { s.scrollBy(e.deltaY / (frame.getBoundingClientRect().width / 360)); e.preventDefault(); } }, { passive: false });

  // squash-and-spring press response shared by every pressable node
  function pressable(g, sp, onUpdate) {
    const t = addTarget; return (opt) => {
      const tg = t(g, opt); tg.sp = sp; tg.press = (on) => { sp.t = on ? 1 : 0; }; anim(g, (dt, tm) => { stepSpring(sp, dt); onUpdate(sp.x, tm); }); return tg;
    };
  }
  function centred(w, h) {
    const root = mkNode(w, h), pivot = new THREE.Group(), holder = new THREE.Group();
    pivot.position.set(w / 2, -h / 2, 0); holder.position.set(-w / 2, h / 2, 0); root.add(pivot); pivot.add(holder); root.slot = holder;
    return { root, pivot, holder };
  }

  // ---------- badge ----------
  function makeBadge(parent, x, y, z) {
    const b = mkNode(16, 16); b.visible = false; let box = null, label = null;
    b.setN = (n) => {
      if (!n) { b.visible = false; return; }
      b.visible = true; if (box) { box.dispose(); label && label.dispose(); box = label = null; }
      const s = n === true ? '' : String(n), tw = s ? Math.max(14, s.length * 7 + 7) : 12;
      box = ui.panel({ w: tw, h: s ? 16 : 12, r: 8, color: PAL.red, depth: 2, bevel: 1.4, ow: 1.8, shadow: false }); b.add(box);
      if (s) { label = ui.text(s, { size: 10, align: 'center', outlineW: 1.2, valign: 'mid' }); box.put(label, tw / 2, 8.5); }
    };
    parent.add(b); b.pos(x, y, z); return b;
  }

  // ---------- button ----------
  ui.button = (o) => {
    const w = o.w ?? 120, h = o.h ?? 44, color = o.color ?? PAL.orange, lip = Math.max(3, Math.round(h * 0.11)), r = Math.min(o.r ?? h * 0.3, h / 2);
    const { root: g, pivot, holder } = centred(w, h); g.top = 6 + 3 + 0.3;
    if (o.shadow !== false) addShadow(g, w, h + lip, r, 4, 0.5);
    const out = new THREE.Mesh(geo.plate(w + 6, h + lip + 6, r + 3), geo.basic(PAL.ink)); out.position.set(-3, 3, -4); g.add(out);
    const base = new THREE.Mesh(geo.slab(w, h, r, 3, 2), geo.std(geo.shade(color, -0.45))); base.position.set(0, -lip, 0); g.add(base);
    const body = new THREE.Mesh(geo.slab(w, h, r, 6, 3), geo.std(color)); holder.add(body);
    { const ins = 5.5, gw = w - ins * 2, gh = Math.max(5, (h - ins) * 0.4); const gl = new THREE.Mesh(geo.plate(gw, gh, Math.max(3, r - 4)), geo.basic(0xffffff, 0.24)); gl.position.set(ins, -3.6, 9.4); holder.add(gl); }
    pivot.position.z = 3;
    const size = o.size ?? clamp(Math.round(h * 0.4), 12, 26);
    let label = null, sub = null, ic = null, enabled = true, badge = null;
    const iconSize = o.icon ? (o.stack ? Math.min(h * 0.56, 40) : Math.min(h * 0.64, size * 1.6)) : 0;
    function layout() {
      if (o.stack) {
        const is = iconSize || 0; if (ic) ic.pos((w - is) / 2, h * 0.08, 11);
        if (label) { label.scale.setScalar(1); if (label.w > w - 6) label.scale.setScalar((w - 6) / label.w); label.pos(w / 2, h - size * 0.95, 11); }
        return;
      }
      const avail = w - 18 - (ic ? iconSize + 5 : 0);
      if (label) { label.scale.setScalar(1); if (label.w > avail) label.scale.setScalar(avail / label.w); }
      const lw = label ? label.w * label.scale.x : 0, total = (ic ? iconSize + (label ? 5 : 0) : 0) + lw, x0 = (w - total) / 2;
      const ly = sub ? h * 0.37 : h * 0.5;
      if (ic) ic.pos(x0, (h - iconSize) / 2 - 1, 11);
      if (label) label.pos(x0 + (ic ? iconSize + 5 : 0), ly + 1, 11);
      if (sub) sub.pos(w / 2, h * 0.72, 11);
    }
    if (o.label != null) { label = ui.text(o.label, { size, valign: 'mid', upper: o.upper, align: o.stack ? 'center' : 'left' }); holder.add(label); }
    if (o.sub) { sub = ui.text(o.sub, { size: Math.max(9, size * 0.58), align: 'center', color: 0xfff1b0, valign: 'mid' }); holder.add(sub); }
    if (o.icon) { ic = ui.icon(o.icon, { size: iconSize }); holder.add(ic); }
    layout();
    g.setLabel = (s) => { if (!label) { label = ui.text(s, { size, valign: 'mid' }); holder.add(label); } else label.set(s); layout(); return g; };
    g.setSub = (s) => { if (sub) sub.set(s); layout(); return g; };
    g.setBadge = (n) => { if (!badge) badge = makeBadge(holder, w - (o.stack ? 14 : 7), -1, 12); badge.setN(n); return g; };
    g.setEnabled = (b) => {
      enabled = !!b; if (g.target) g.target.enabled = enabled;
      body.material = geo.std(enabled ? color : PAL.disabled); base.material = geo.std(geo.shade(enabled ? color : PAL.disabled, -0.45));
      label && label.setColor(enabled ? 0xffffff : 0xd4d0e4);
      return g;
    };
    const sp = spring();
    pressable(g, sp, (x, tm) => {
      const br = o.pulse && enabled ? Math.sin(tm * 3.6) * 0.022 + 0.022 : 0;
      pivot.position.y = -h / 2 - x * lip * 0.85; pivot.scale.set(1 + 0.035 * x + br, 1 - 0.07 * x + br, 1);
    })({ id: o.id, onTap: o.onTap, h: () => h + lip });
    if (o.enabled === false) g.setEnabled(false);
    return g;
  };

  // ---------- bar ----------
  function clipMat(color, plane, rough) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough ?? 0.4, clippingPlanes: [plane] }); return m;
  }
  ui.bar = (o = {}) => {
    const w = o.w ?? 120, h = o.h ?? 14, r = o.r ?? h / 2, color = o.color ?? PAL.green, back = o.back ?? 0x2a2240;
    const g = ui.panel({ w, h, r, color: back, depth: 2, bevel: 1.4, gloss: false, shadow: false, ow: o.ow ?? 2 }); g.top = 5;
    const ins = Math.max(1.6, h * 0.14), iw = w - ins * 2, ih = h - ins * 2, ir = ih / 2;
    const plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), gplane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    const ghost = new THREE.Mesh(geo.slab(iw, ih, ir, 1.5, 1), clipMat(o.ghostColor ?? 0xfff0a0, gplane)); ghost.position.set(ins, -ins, 2.2); g.add(ghost);
    const fmat = clipMat(color, plane, 0.32), fill = new THREE.Mesh(geo.slab(iw, ih, ir, 1.5, 1), fmat); fill.position.set(ins, -ins, 3.2); g.add(fill);
    const sh = new THREE.Mesh(geo.plate(iw - 2, Math.max(2, ih * 0.34), Math.max(1, ir * 0.5)), (() => { const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, clippingPlanes: [plane], toneMapped: false }); return m; })());
    sh.position.set(ins + 1, -ins - ih * 0.1, 5.6); g.add(sh);
    let target = o.value ?? 1, cur = target, gTarget = target, gCur = target, hold = 0; const auto = !!o.ghost;
    g.set = (f, instant) => { f = clamp(f, 0, 1); if (auto && f < target) { hold = 0.35; } target = f; if (instant) cur = f, gCur = Math.max(gCur, f); if (auto) gTarget = f; return g; };
    g.setGhost = (f) => { gCur = clamp(f, 0, 1); gTarget = target; hold = 0.35; return g; };
    g.setColor2 = (c) => { fmat.color.set(c); return g; };
    anim(g, (dt) => {
      cur += (target - cur) * (1 - Math.exp(-dt * 11)); if (Math.abs(target - cur) < 0.0004) cur = target;
      if (hold > 0) hold -= dt; else gCur += (Math.max(gTarget, cur) - gCur) * (1 - Math.exp(-dt * 3.2));
      if (gCur < cur) gCur = cur;
      g.updateWorldMatrix(true, false);
      const lx = ins + Math.max(cur * iw, cur > 0 ? ir * 0.6 : 0), gx = ins + Math.max(gCur * iw, 0);
      fill.visible = sh.visible = cur > 0.002; ghost.visible = gCur > cur + 0.004;
      plane.set(new THREE.Vector3(-1, 0, 0), lx).applyMatrix4(g.matrixWorld); gplane.set(new THREE.Vector3(-1, 0, 0), gx).applyMatrix4(g.matrixWorld);
    });
    return g;
  };

  // ---------- ring ----------
  ui.ring = (o = {}) => {
    const r = o.r ?? 20, width = o.width ?? 7, color = o.color ?? PAL.purple, ow = 2.4;
    const g = mkNode(r * 2, r * 2), c = new THREE.Group(); c.position.set(r, -r, 0); g.add(c); g.top = 6;
    const outer = new THREE.Mesh(geo.arcTube(r, width + ow * 2), geo.basic(PAL.ink)); outer.scale.z = 0.01; outer.position.z = -1; c.add(outer);
    const track = new THREE.Mesh(geo.arcTube(r, width), geo.std(0x2a2240, { rough: 0.5 })); track.scale.z = 0.5; c.add(track);
    const fg = geo.arcTube(r, width * 0.8).clone(), fm = geo.std(color, { rough: 0.3 });
    const arc = new THREE.Mesh(fg, fm); arc.position.z = 1.6; c.add(arc);
    let target = 0, cur = 0, ready = false; const N = fg.userData.N, per = fg.userData.perSeg;
    g.set = (f, instant) => { target = clamp(f, 0, 1); if (instant) cur = target; return g; };
    g.setReady = (b) => { ready = !!b; return g; };
    g.setColor = (col) => { arc.material = geo.std(col, { rough: 0.3 }); return g; };
    anim(g, (dt, t) => {
      cur += (target - cur) * (1 - Math.exp(-dt * 9)); const n = Math.ceil(cur * N - 0.001);
      fg.setDrawRange(0, Math.max(0, n) * per); arc.visible = n > 0;
      const p = ready ? 1 + Math.sin(t * 7) * 0.05 : 1; c.scale.set(p, p, p);
    });
    return g;
  };

  // ---------- tile ----------
  ui.tile = (o = {}) => {
    const size = o.size ?? 56, col = typeof o.color === 'string' ? PAL.rarity[o.color] ?? PAL.rarity.common : o.color ?? PAL.rarity.common;
    const { root: g, pivot, holder } = centred(size, size);
    const frameP = ui.panel({ w: size, h: size, r: size * 0.2, color: col, depth: 4, bevel: 2.4, shadow: o.shadow !== false, shadowY: 3, ow: 2.4 }); holder.add(frameP); g.top = 8;
    const ins = Math.max(4, size * 0.085), iw = size - ins * 2, plate = new THREE.Mesh(geo.slab(iw, iw, size * 0.14, 1.2, 1.2), geo.std(geo.mix(col, 0x20153a, 0.7), { rough: 0.6 })); plate.position.set(ins, -ins, 4.2); holder.add(plate);
    const cz = 8;
    let content = null;
    if (o.node) { content = o.node; holder.add(content); content.pos((size - (content.w || 0)) / 2, (size - (content.h || 0)) / 2, cz); }
    else if (o.icon) { const is = size * 0.6; content = ui.icon(o.icon, { size: is, sway: o.sway }); holder.add(content); content.pos((size - is) / 2, (size - is) / 2 + 1, cz); }
    const parts = {};
    if (o.level != null) { parts.lv = ui.text('Lv.' + o.level, { size: Math.max(8, size * 0.18), outlineW: 1.5 }); holder.add(parts.lv); parts.lv.pos(ins + 1.5, ins - 0.5, 26); }
    if (o.plus) { parts.plus = ui.text('+' + o.plus, { size: Math.max(9, size * 0.22), align: 'right', color: 0xfff08a, outlineW: 1.6 }); holder.add(parts.plus); parts.plus.pos(size - ins - 1, size - ins - size * 0.24, 26); }
    if (o.up) { parts.up = ui.icon('up', { size: size * 0.3 }); holder.add(parts.up); parts.up.pos(size - ins - size * 0.3 + 1, ins - 1, 27); }
    let badge = null;
    g.setBadge = (n) => { if (!badge) badge = makeBadge(holder, size - 9, -3, 28); badge.setN(n); return g; };
    g.setLevel = (n) => { parts.lv && parts.lv.set('Lv.' + n); return g; };
    g.setColor = (c) => { const cc = typeof c === 'string' ? PAL.rarity[c] : c; frameP.setColor(cc); plate.material = geo.std(geo.mix(cc, 0x20153a, 0.7), { rough: 0.6 }); return g; };
    if (o.badge) g.setBadge(o.badge);
    if (o.id) { const sp = spring(); pressable(g, sp, (x) => { const s = 1 - 0.07 * x; pivot.scale.set(s, s, 1); })({ id: o.id, onTap: o.onTap }); }
    g.content = content;
    return g;
  };

  // ---------- viewport and portrait ----------
  ui.viewport = (obj, o = {}) => {
    const w = o.w ?? 80, h = o.h ?? 80, r = o.r ?? 10, vs = new THREE.Scene();
    vs.add(obj);
    const key = new THREE.DirectionalLight(0xffffff, o.key ?? 2.6); key.position.set(-1, 1.4, 1.6); vs.add(key, new THREE.AmbientLight(0xffffff, o.amb ?? 1.5));
    const fill = new THREE.DirectionalLight(0xb8c8ff, 0.9); fill.position.set(1.2, 0.2, 0.8); vs.add(fill);
    let cam = o.camera;
    if (!cam) {
      cam = new THREE.PerspectiveCamera(o.fov ?? 28, w / h, 0.1, 100);
      const box = new THREE.Box3().setFromObject(obj), s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const t = Math.tan(cam.fov * Math.PI / 360), d = Math.max(s.y / (2 * t), s.x / (2 * t * (w / h))) * 1.2 + s.z / 2;
      cam.position.set(c.x, c.y, c.z + d); cam.lookAt(c);
    }
    const px = Math.min(512, Math.round(w * ui.u * ui.dpr)), py = Math.min(512, Math.round(h * ui.u * ui.dpr));
    const rt = new THREE.WebGLRenderTarget(px, py, { samples: 4 });
    const g = mkNode(w, h), mesh = new THREE.Mesh(geo.plateUV(w, h, r), new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false })); g.add(mesh);
    const v = { node: g, scene: vs, cam, rt, bg: o.bg ?? 0x2a2150, period: 1 / (o.fps ?? 14), acc: 1, onRefresh: o.update || null, dt: 0 };
    viewports.add(v); g.vp = v; g.scene3 = vs; g.camera = cam; g.object = obj;
    const dis = g.dispose; g.dispose = () => { viewports.delete(v); rt.dispose(); dis(); };
    return g;
  };
  function refreshViewports(dt) {
    const r = renderer; let any = false;
    for (const v of viewports) {
      v.acc += dt; v.dt += dt; if (v.acc < v.period || !shown(v.node)) continue; v.acc = 0;
      if (!any) { any = true; v.keep = [r.getClearColor(new THREE.Color()).getHex(), r.getClearAlpha(), r.toneMapping, r.autoClear]; vp.keep = v.keep; }
      if (v.onRefresh) { try { v.onRefresh(v.dt); } catch (e) { v.onRefresh = null; console.warn('[ui] viewport update failed: ' + e.message); } } v.dt = 0;
      r.toneMapping = THREE.NoToneMapping; r.autoClear = true; r.setClearColor(v.bg, 1); r.setRenderTarget(v.rt); r.render(v.scene, v.cam); r.setRenderTarget(null);
    }
    if (any) { const k = vp.keep; r.setClearColor(k[0], k[1]); r.toneMapping = k[2]; r.autoClear = k[3]; }
  }
  const vp = { keep: null };

  const PORTRAIT_ST = () => ({ speed: 0, air: 0, vy: 0, swing: -1, mode: 'none', draw: 1, pitch: 0, kick: 0, kickL: 0, sprint: false, crouch: 0, hurt: 0 });
  ui.portrait = (heroId, o = {}) => {
    const size = o.size ?? 56, col = o.color ?? PAL.rarity.rare, ins = Math.max(4, size * 0.085), vw = size - ins * 2;
    const { root: g, pivot, holder } = centred(size, size);
    const frameP = ui.panel({ w: size, h: size, r: size * 0.2, color: col, depth: 4, bevel: 2.4, shadow: o.shadow !== false, shadowY: 3, ow: 2.4 }); holder.add(frameP); g.top = 8;
    let view;
    const BZ = typeof window !== 'undefined' ? window.BZ : null;
    let m = null;
    if (BZ && BZ.heroModel) { try { m = BZ.heroModel(heroId); } catch (e) { console.warn('[ui] hero model failed: ' + e.message); } }
    if (m) {
      const root = new THREE.Group(); root.add(m.root); const bb = new THREE.Box3().setFromObject(m.root), sz = bb.getSize(new THREE.Vector3());
      const st = PORTRAIT_ST(); let tt = Math.random() * 5;
      const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 60), vh = sz.y * (o.bust ?? 0.5), d = vh / 2 / Math.tan(cam.fov * Math.PI / 360) + sz.z * 0.4;
      cam.position.set(0, bb.max.y - vh / 2 + sz.y * 0.03, d); cam.lookAt(0, bb.max.y - vh / 2 + sz.y * 0.03, 0);
      view = ui.viewport(root, { w: vw, h: vw, r: size * 0.12, camera: cam, bg: geo.mix(col, 0x1b1236, 0.55), fps: o.fps ?? 14, update: (dt) => { tt += dt; m.root.rotation.y = 0.35 + Math.sin(tt * 0.9) * 0.3; BZ.animHero(m, st, dt); } });
    } else {
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
      const grd = x.createLinearGradient(0, 0, 0, 128); const hx = (n) => '#' + n.toString(16).padStart(6, '0'); grd.addColorStop(0, hx(geo.mix(col, 0x1b1236, 0.35))); grd.addColorStop(1, hx(geo.mix(col, 0x1b1236, 0.7)));
      x.fillStyle = grd; x.fillRect(0, 0, 128, 128); x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.arc(64, 52, 24, 0, 7); x.fill(); x.beginPath(); x.ellipse(64, 124, 46, 40, 0, Math.PI, 0); x.fill();
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      view = mkNode(vw, vw); view.add(new THREE.Mesh(geo.plateUV(vw, vw, size * 0.12), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })));
    }
    holder.add(view); view.pos(ins, ins, 7.4);
    g.view = view;
    if (o.id) { const sp = spring(); pressable(g, sp, (x) => { const s = 1 - 0.07 * x; pivot.scale.set(s, s, 1); })({ id: o.id, onTap: o.onTap }); }
    return g;
  };

  // ---------- scroll ----------
  ui.scroll = (o = {}) => {
    const g = mkNode(o.w ?? 340, o.h ?? 400), content = new THREE.Group(); g.add(content); g.slot = content; g.isScroll = true;
    let y = 0, maxY = 0; g.vy = 0; g.dragging = false; g.contentH = o.contentH ?? g.h;
    const setMax = () => { maxY = Math.max(0, g.contentH - g.h); };
    g.setContentH = (v) => { g.contentH = v; setMax(); return g; };
    g.scrollTo = (v) => { y = clamp(v, 0, maxY); g.vy = 0; return g; };
    g.scrollBy = (d) => { y = clamp(y + d, 0, maxY); g.vy = 0; return g; };
    g.drag = (d) => { g.dragging = true; const over = y < 0 || y > maxY; y += over ? d * 0.4 : d; };
    g.fling = (v) => { g.dragging = false; g.vy = clamp(v, -2500, 2500); };
    g.getScroll = () => y;
    setMax(); scrolls.add(g);
    anim(g, (dt) => {
      setMax();
      if (!g.dragging) {
        if (y < 0) { y += (0 - y) * Math.min(1, dt * 14); g.vy = 0; } else if (y > maxY) { y += (maxY - y) * Math.min(1, dt * 14); g.vy = 0; }
        else if (Math.abs(g.vy) > 4) { y += g.vy * dt; g.vy *= Math.exp(-dt * 4.2); if (y < 0 || y > maxY) g.vy *= 0.3; }
      }
      content.position.y = y;
      for (const c of content.children) { if (c.h === undefined || c.hiddenByUser) continue; c.visible = c.uy + c.h > y - 40 && c.uy < y + g.h + 40; }
    });
    // pointerup clears dragging through fling; a plain release must clear it too
    return g;
  };
  frame.addEventListener('pointerup', () => { for (const s of scrolls) s.dragging = false; });

  // ---------- screens ----------
  let seq = 0;
  function layoutScreen(s) { s.pivot.position.set(180, -ui.H / 2, 0); s.holder.position.set(-180, ui.H / 2, 0); s.h = ui.H; }
  ui.screen = (name, o = {}) => {
    if (screens.has(name)) return screens.get(name);
    const root = new THREE.Group(), pivot = new THREE.Group(), holder = new THREE.Group(); root.add(pivot); pivot.add(holder);
    Object.assign(root, { isScreen: true, screenName: name, modal: !!o.modal, pivot, holder, w: 360, h: ui.H, seq: 0, hiding: false, ax: null });
    root.visible = false; root.put = (c, x = 0, y = 0, z = 0) => { holder.add(c); c.pos ? c.pos(x, y, z) : c.position.set(x, -y, z); return c; };
    root.slot = holder; scene.add(root); screens.set(name, root); layoutScreen(root); return root;
  };
  function restack() {
    const vis = [...screens.values()].filter((s) => s.visible).sort((a, b) => a.seq - b.seq);
    vis.forEach((s, i) => { s.position.z = 20 + i * 100; });
  }
  function applyTransition(s, e) {
    const kind = s.ax.kind, p = s.pivot;
    if (kind === 'pop') { const k = 0.8 + 0.2 * easeOutBack(e); p.scale.set(k, k, 1); p.position.y = -ui.H / 2; }
    else if (kind === 'slide') { p.position.y = -ui.H / 2 - (1 - easeOut(e)) * ui.H * 0.5; p.scale.set(1, 1, 1); }
    else { p.scale.set(1, 1, 1); p.position.y = -ui.H / 2; }
  }
  ui.show = (name, o = {}) => {
    const s = screens.get(name); if (!s) throw new Error('screen not found: ' + name);
    const kind = o.transition ?? 'pop'; s.seq = ++seq; s.visible = true; s.hiding = false; restack();
    s.ax = kind === 'none' ? null : { kind, t: 0, dur: kind === 'slide' ? 0.34 : 0.3, dir: 1 };
    if (s.ax) applyTransition(s, 0); else layoutScreen(s);
    return s;
  };
  ui.hide = (name, o = {}) => {
    const s = screens.get(name); if (!s || !s.visible) return;
    const kind = o.transition ?? 'pop';
    if (kind === 'none') { s.visible = false; s.ax = null; layoutScreen(s); restack(); return; }
    s.hiding = true; s.ax = { kind, t: 0, dur: 0.2, dir: -1 };
  };
  ui.isShown = (name) => { const s = screens.get(name); return !!(s && s.visible && !s.hiding); };

  // ---------- toast and floating numbers ----------
  const overlay = mkNode(); overlay.position.z = 1000; scene.add(overlay);
  let toast = null;
  ui.toast = (str) => {
    if (toast) { toast.g.dispose(); toast = null; }
    const t = ui.text(str, { size: 13, valign: 'mid', align: 'center' }), w = Math.min(330, t.w + 34), h = 34, g = new THREE.Group(), holder = new THREE.Group();
    const p = ui.panel({ w, h, r: 17, color: 0x3a2a70, depth: 4, bevel: 2.4, ow: 2.4 }); holder.add(p); holder.add(t); t.pos(w / 2, h / 2 + 1, 10); holder.position.set(-w / 2, h / 2, 0); g.add(holder);
    g.position.set(180, -(ui.H - 176), 0); g.dispose = () => { p.dispose(); t.dispose(); g.parent && g.parent.remove(g); }; overlay.add(g); toast = { g, t: 0, w };
    g.scale.setScalar(0.01);
  };
  const flies = [];
  ui.fly = (str, x, y, o = {}) => {
    const t = ui.text(str, { size: o.size ?? 20, color: o.color ?? PAL.gold, align: 'center', valign: 'mid', outlineW: 2.6 }); overlay.add(t); t.pos(x, y, 0); flies.push({ n: t, x, y, t: 0 });
  };

  // ---------- frame ----------
  ui.resize = () => {
    const w = frame.clientWidth || 360, h = frame.clientHeight || 780, dpr = renderer.getPixelRatio();
    const same = Math.abs(ui.u - w / 360) < 1e-4 && ui.dpr === dpr;
    ui.u = w / 360; ui.dpr = dpr; ui.H = h / ui.u;
    camera.left = 0; camera.right = 360; camera.top = 0; camera.bottom = -ui.H; camera.updateProjectionMatrix();
    for (const s of screens.values()) layoutScreen(s);
    for (const g of anchored) placeAnchored(g);
    if (!same) txt.reraster();
  };

  ui.update = (dt) => {
    dt = clamp(dt, 0, 0.05); ui.t += dt;
    for (let i = timers.length - 1; i >= 0; i--) if (ui.t >= timers[i].at) { const f = timers[i].fn; timers.splice(i, 1); f(); }
    for (const a of anims) { if (a.node && !shown(a.node) && !(a.node.target && a.node.target.sp && Math.abs(a.node.target.sp.x) > 0.001)) continue; a.fn(dt, ui.t); }
    for (const s of screens.values()) {
      if (!s.ax) continue; const a = s.ax; a.t += dt; const e = clamp(a.t / a.dur, 0, 1);
      if (a.dir > 0) { applyTransition(s, e); if (e >= 1) { s.ax = null; layoutScreen(s); } }
      else { applyTransition(s, 1 - e); if (e >= 1) { s.visible = false; s.hiding = false; s.ax = null; layoutScreen(s); restack(); } }
    }
    if (toast) {
      const T = toast; T.t += dt; const k = T.t < 0.25 ? easeOutBack(T.t / 0.25) : T.t > 1.9 ? Math.max(0.01, 1 - (T.t - 1.9) / 0.2) : 1;
      T.g.scale.setScalar(Math.max(0.01, k)); if (T.t > 2.1) { T.g.dispose(); toast = null; }
    }
    for (let i = flies.length - 1; i >= 0; i--) {
      const f = flies[i]; f.t += dt; const k = f.t / 0.95;
      f.n.pos(f.x, f.y - easeOut(k) * 46, 0); f.n.scale.setScalar(k < 0.15 ? 0.6 + easeOutBack(k / 0.15) * 0.5 : 1.1 - 0.1 * Math.min(1, (k - 0.15) * 4)); f.n.setOpacity(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
      if (k >= 1) { f.n.dispose(); flies.splice(i, 1); }
    }
    ui._dt = dt;
  };

  ui.render = () => {
    const r = renderer, prev = { ac: r.autoClear, tm: r.toneMapping, lc: r.localClippingEnabled, ar: r.info.autoReset, st: r.getScissorTest() };
    r.autoClear = false; r.toneMapping = THREE.NoToneMapping; r.localClippingEnabled = true; r.info.autoReset = false;
    const c0 = r.info.render.calls; r.clearDepth(); scene.updateMatrixWorld();
    const live = [...scrolls].filter((s) => shown(s)).slice(0, 28);
    live.forEach((s, i) => s.slot.traverse((o) => o.layers.set(i + 1)));
    camera.layers.set(0); r.render(scene, camera);
    if (live.length) {
      r.setScissorTest(true); const k = ui.u, fh = ui.H * k;
      live.forEach((s, i) => { const b = rawBox(s, s.w, s.h); camera.layers.set(i + 1); r.setScissor(b.x * k, fh - (b.y + b.h) * k, b.w * k, b.h * k); r.render(scene, camera); });
    }
    camera.layers.set(0);
    ui.drawCalls = r.info.render.calls - c0;
    r.setScissorTest(prev.st); r.autoClear = prev.ac; r.toneMapping = prev.tm; r.localClippingEnabled = prev.lc; r.info.autoReset = prev.ar;
    refreshViewports(ui._dt || 0.016); ui._dt = 0;
  };

  ui.textStats = () => txt.stats();
  ui.resize();
  return ui;
}
