// Text-fit gate: UI text must never be covered, cut, lost or overlapped, on every screen and in the busy fights.
// The UI is three.js meshes, not DOM, so the audit measures the live page: it re-renders the UI alone on a grey
// clear colour and reads pixels back, and it reads the real ink of every text canvas. It never reuses the layout
// constants of the game code. Each state is one synchronous page.evaluate, so the game loop cannot run between renders.
//   T1 drawn share   a text drawn normally gives >= 85% of the paint it gives when forced on top (catches cut, covered)
//   T2 inside frame  the ink box lies inside 0..780 x 0..H design units
//   T3 raster        no ink on the first/last row/column of the text's own canvas (cut diacritics)
//   T4 no overlap    no two visible texts of one screen have ink boxes crossing by more than 2 units both ways
//   T5 buttons       every enabled target is inside the frame, owns its own centre point, and crosses no other target > 2 px
//   T7 in holder    a text's ink stays inside the panel or button that holds it (counters, labels, settings notes)
//   T8 off buttons  a text's ink never lies on an enabled button it is not part of
//   T6 world vs HUD  (battle) the pixels the HUD paints opaque are identical with the 3D world drawn and hidden
// Usage: timeout 900 node games/ai-sinh-ton/tools/text-fit-test.mjs [--selftest] [--only=substring]
// Env: PHONES=s22,xiaomi,desktop (default all three). Shots and the issue list go to .chk/textfit/.
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, open as openPage, checker, ROOT } from './pw.mjs';
// every case runs with the page's frame loop stopped: only __sim and __step move time, so each run measures the same moment
const open = (br, base, phone, q, o = {}) => openPage(br, base, phone, q, { ...o, freeze: true });
import { HERO } from '../js/data/heroes.js';

const OUT = path.join(ROOT, '.chk', process['env'].CHK_SUB || '', 'textfit'); fs.mkdirSync(OUT, { recursive: true });
const ARGS = process.argv.slice(2);
const SELFTEST = ARGS.includes('--selftest');
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').slice(7);
const PHONE_LIST = (process['env'].PHONES || 's22,xiaomi,desktop').split(',');
const SHARE_MIN = 0.85, OVERLAP = 2;

// ---------------------------------------------------------------------------------------------------------
// page side. `mut` is only used by --selftest: { kind: 'move'|'cover'|'onto', i, j, dx }
function AUDIT(opts) {
  const G = window.__G, ui = G.ui, THREE = ui.THREE, host = G.host, r = host.renderer, scene = ui.scene, cam = ui.camera;
  const cv = r.domElement, gl = r.getContext();
  if (opts.crowdOnly) { const h = G.screens.hud.dbg(); if (h.banners.length || h.bossShown || h.numbers < 2) return { skipped: true }; }
  const res = { texts: [], n: 0, exempt: { scrollOut: 0, scrollPart: 0, dimmed: 0, tiny: 0, nopaint: 0 }, T1: [], T2: [], T3: [], T4: [], T5: [], T6: [], T7: [], T8: [], t1min: 1, t1minStr: '', t5n: 0, t5ex: 0 };
  scene.updateMatrixWorld(true);
  const screens = scene.children.filter((c) => c.isScreen);
  // a modal screen and the guide's dim layer cover everything below them on purpose
  const modalZ = Math.max(-1, ...screens.filter((s) => s.visible && !s.hiding && (s.modal || s.screenName === 'guide')).map((s) => s.position.z));
  const V = new THREE.Vector3();
  const boxOf = (m, pts) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [px, py] of pts) { V.set(px, py, 0).applyMatrix4(m); x0 = Math.min(x0, V.x); x1 = Math.max(x1, V.x); y0 = Math.min(y0, -V.y); y1 = Math.max(y1, -V.y); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const cross = (a, b) => { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h); return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null; };

  // ---- the text nodes: a mesh whose parent kit node points back at it and owns a canvas
  const found = [];
  scene.traverse((o) => {
    const n = o.parent;
    if (!(o.isMesh && n && n.mesh === o && n.canvas)) return;
    let vis = false, scr = null; const scrolls = [];
    for (let a = o; a; a = a.parent) {
      if (!a.visible) { vis = false; break; }
      if (a.isScreen && !scr) scr = a;
      if (a.isScroll) scrolls.push(a);
      if (a === scene) { vis = true; break; }
    }
    if (!vis || o.material.opacity <= 0.05) return;
    if (scr && scr.hiding) return;
    found.push({ o, n, scr, scrolls });
  });

  // ---- selftest mutations (applied before measuring, undone at the end)
  const undo = [];
  const inkOf = (cnv) => {
    inkOf.c = inkOf.c || new Map(); let e = inkOf.c.get(cnv); if (e) return e;
    const cw = cnv.width, ch = cnv.height, d = cnv.getContext('2d').getImageData(0, 0, cw, ch).data;
    let x0 = cw, x1 = -1, y0 = ch, y1 = -1; const edge = { top: false, bottom: false, left: false, right: false };
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (d[(y * cw + x) * 4 + 3] <= 40) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (y === 0) edge.top = true; if (y === ch - 1) edge.bottom = true; if (x === 0) edge.left = true; if (x === cw - 1) edge.right = true;
    }
    e = { x0, x1, y0, y1, edge, cw, ch, any: x1 >= x0 }; inkOf.c.set(cnv, e); return e;
  };
  const inkBox = (t) => {
    const k = inkOf(t.n.canvas); if (!k.any) return null;
    const m = t.o.matrixWorld;
    return boxOf(m, [[k.x0 / k.cw - 0.5, 0.5 - k.y0 / k.ch], [(k.x1 + 1) / k.cw - 0.5, 0.5 - k.y0 / k.ch], [(k.x1 + 1) / k.cw - 0.5, 0.5 - (k.y1 + 1) / k.ch], [k.x0 / k.cw - 0.5, 0.5 - (k.y1 + 1) / k.ch]]);
  };
  if (opts.mut) {
    const m = opts.mut, A = found[m.i];
    if (A && A.n.str !== m.str) throw new Error('selftest: text ' + m.i + ' is "' + (A && A.n.str) + '", wanted "' + m.str + '"');
    if (m.kind === 'move') { const p = A.n.position.x; A.n.position.x += m.dx; undo.push(() => { A.n.position.x = p; }); }
    if (m.kind === 'onto') { const B = found[m.j]; scene.updateMatrixWorld(true); const a = inkBox(A), b = inkBox(B), px = A.n.position.x, py = A.n.position.y, pz = A.n.position.z; const za = new THREE.Vector3().setFromMatrixPosition(A.o.matrixWorld).z, zb = new THREE.Vector3().setFromMatrixPosition(B.o.matrixWorld).z; A.n.position.x += (b.x + b.w + a.w / 2 - 6) - (a.x + a.w / 2); A.n.position.y -= (b.y + b.h / 2) - (a.y + a.h / 2); A.n.position.z += zb - za + 0.5; undo.push(() => { A.n.position.x = px; A.n.position.y = py; A.n.position.z = pz; }); }
    if (m.kind === 'cover') {
      const a = inkBox(A), p = new THREE.Mesh(new THREE.PlaneGeometry(a.w + 2, a.h + 2), new THREE.MeshBasicMaterial({ color: 0xff00ff, toneMapped: false }));
      p.position.set(a.x + a.w / 2, -(a.y + a.h / 2), 900); scene.add(p); undo.push(() => { scene.remove(p); p.geometry.dispose(); p.material.dispose(); });
    }
    scene.updateMatrixWorld(true);
  }

  // ---- classify, measure ink and clipping
  const list = [];
  for (const t of found) {
    const sName = t.scr ? t.scr.screenName : 'overlay';
    if (t.scr && t.scr.position.z < modalZ) { res.exempt.dimmed++; continue; }
    const ink = inkBox(t); const info = { str: t.n.str, screen: sName, t };
    const k = inkOf(t.n.canvas);
    info.ink = ink; info.edge = k.edge; info.any = k.any;
    let clip = ink, partial = false;
    for (const s of t.scrolls) {
      if (!clip) break;
      const sb = boxOf(s.matrixWorld, [[0, 0], [s.w, 0], [s.w, -s.h], [0, -s.h]]); const c = cross(clip, sb);
      if (!c) { clip = null; break; } if (c.w * c.h < clip.w * clip.h * 0.999) partial = true; clip = c;
    }
    if (ink && !clip) { res.exempt.scrollOut++; continue; }
    if (partial) res.exempt.scrollPart++;
    info.clip = clip; info.partial = partial;
    if (ink && (ink.h < 2 || ink.w < 2)) { res.exempt.tiny++; info.tiny = true; }
    list.push(info);
  }
  res.n = list.length;
  res.texts = list.map((t) => ({ str: t.str, screen: t.screen, ink: t.ink, partial: t.partial, tiny: !!t.tiny, idx: found.indexOf(t.t), scroll: t.t.scrolls.length > 0 }));

  // ---- T3 raster and T2 frame (cheap, no rendering)
  const Hh = ui.H;
  for (const t of list) {
    const e = t.edge;
    if (e.top || e.bottom || e.left || e.right) res.T3.push({ str: t.str, screen: t.screen, edges: Object.keys(e).filter((k) => e[k]).join('+') });
    if (t.clip && !t.tiny) {
      const c = t.clip, tol = 1;
      if (c.x < -tol || c.y < -tol || c.x + c.w > 780 + tol || c.y + c.h > Hh + tol) res.T2.push({ str: t.str, screen: t.screen, box: [c.x, c.y, c.x + c.w, c.y + c.h].map((v) => Math.round(v * 10) / 10), frame: [780, Math.round(Hh * 10) / 10] });
    }
  }

  // ---- T1 drawn share
  const kx = cv.width / 780, ky = cv.height / Hh, CW = cv.width, CH = cv.height;
  const cc = new THREE.Color(); r.getClearColor(cc); const ca = r.getClearAlpha(), prevRT = r.getRenderTarget();
  r.setRenderTarget(null);
  const drawUI = () => { r.setClearColor(0x808080, 1); r.clear(); ui._dt = 1e-9; ui.render(); };
  const readAll = () => { const a = new Uint8Array(CW * CH * 4); gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, a); return a; };
  const energy = (a, b) => { let e = 0; for (let i = 0; i < a.length; i += 4) e += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return e; };
  try {
    drawUI(); const F0 = readAll();
    const sub = (full, p) => { const a = new Uint8Array(p.w * p.h * 4); for (let y = 0; y < p.h; y++) a.set(full.subarray(((p.y + y) * CW + p.x) * 4, ((p.y + y) * CW + p.x + p.w) * 4), y * p.w * 4); return a; };
    const readRect = (p) => { const a = new Uint8Array(p.w * p.h * 4); gl.readPixels(p.x, p.y, p.w, p.h, gl.RGBA, gl.UNSIGNED_BYTE, a); return a; };
    for (const t of list) {
      if (!t.ink || t.tiny || t.partial) { t.share = 1; continue; }
      const b = t.ink, x0 = Math.max(0, Math.floor(b.x * kx) - 2), x1 = Math.min(CW, Math.ceil((b.x + b.w) * kx) + 2), yt = Math.max(0, Math.floor(b.y * ky) - 2), yb = Math.min(CH, Math.ceil((b.y + b.h) * ky) + 2);
      if (x1 - x0 < 1 || yb - yt < 1) { t.share = 1; t.offcanvas = true; continue; }
      const p = { x: x0, y: CH - yb, w: x1 - x0, h: yb - yt };
      const m = t.t.o, vis = m.visible, dt = m.material.depthTest, ro = m.renderOrder;
      m.visible = false; drawUI(); const F1 = readRect(p);
      m.visible = true; m.material.depthTest = false; m.renderOrder = 1e6; drawUI(); const F2 = readRect(p);
      m.visible = vis; m.material.depthTest = dt; m.renderOrder = ro;
      const e01 = energy(sub(F0, p), F1), e21 = energy(F2, F1);
      if (e21 < 600) { t.share = 1; res.exempt.nopaint++; t.nopaint = true; continue; }
      t.share = e01 / e21;
      if (t.share < res.t1min) { res.t1min = t.share; res.t1minStr = t.str; }
      if (t.share < opts.shareMin) res.T1.push({ str: t.str, screen: t.screen, share: Math.round(t.share * 1000) / 1000, box: [b.x, b.y, b.x + b.w, b.y + b.h].map((v) => Math.round(v * 10) / 10) });
    }
    drawUI(); // leave the page showing the UI frame
  } finally { r.setClearColor(cc, ca); r.setRenderTarget(prevRT); }

  // ---- T4 overlap (only texts that really show)
  const by = new Map();
  for (const t of list) if (t.clip && !t.tiny && !t.nopaint && (t.share ?? 1) >= 0.5) { if (!by.has(t.screen)) by.set(t.screen, []); by.get(t.screen).push(t); }
  for (const [name, arr] of by) for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const a = arr[i].clip, b = arr[j].clip, c = cross(a, b);
    if (c && c.w > opts.overlap && c.h > opts.overlap) res.T4.push({ a: arr[i].str, b: arr[j].str, screen: name, by: [Math.round(c.w * 10) / 10, Math.round(c.h * 10) / 10] });
  }

  // ---- T7 a text stays inside the panel or button that holds it; T8 a text never lies on a button it is not part of
  const fr = document.getElementById('frame').getBoundingClientRect();
  {
    const shows = (t) => t.clip && !t.tiny && !t.nopaint && !t.partial && (t.share ?? 1) >= 0.5;
    const kf = fr.width / 780, tnodes = new Map();
    const tq = ui.targets(), tn = ui.targetNodes();
    tq.forEach((q, i) => { if (!q.enabled || /^(guide-block|guide-skip|reveal-tap)$/.test(q.id)) return; const n = tn[i] && tn[i].id === q.id ? tn[i].node : null; let drawn = false; if (n) n.traverse((o) => { if (o.isMesh && o.visible) drawn = true; }); if (n && drawn) tnodes.set(n, { id: q.id, box: { x: (q.vx - fr.left) / kf, y: (q.vy - fr.top) / kf, w: q.vw / kf, h: q.vh / kf } }); });
    const out = (a, b) => Math.max(b.x - a.x, a.x + a.w - (b.x + b.w), b.y - a.y, a.y + a.h - (b.y + b.h));
    // panels drawn on each screen, for texts that sit straight on a screen over a panel
    const panels = new Map();
    for (const sc of screens) { if (!sc.visible || sc.hiding) continue; const arr = []; sc.traverse((o) => { if (o.body && o.w > 0 && o.h > 0) { let v = true; for (let a = o; a && a !== sc; a = a.parent) if (!a.visible) v = false; if (v) arr.push(boxOf(o.matrixWorld, [[0, 0], [o.w, 0], [o.w, -o.h], [0, -o.h]])); } }); panels.set(sc.screenName, arr); }
    for (const t of list) {
      if (!shows(t)) continue;
      const anc = new Set(); let holder = null;
      for (let a = t.t.n.parent; a && a !== scene; a = a.parent) { anc.add(a); if (!holder && (a.body || a.target) && a.w > 0 && a.h > 0) holder = a; if (a.isScreen) break; }
      if (!holder) {
        const on = (panels.get(t.screen) || []).filter((b) => { const c = cross(t.clip, b); return c && c.w > 1.5 && c.h > 1.5; });
        const inside = on.some((b) => out(t.clip, b) <= 1.5);
        if (on.length && !inside) { const b = on.reduce((m, q) => (q.w * q.h > m.w * m.h ? q : m)); res.T7.push({ str: t.str, screen: t.screen, by: Math.round(out(t.clip, b) * 10) / 10, box: [t.clip.x, t.clip.y, t.clip.x + t.clip.w, t.clip.y + t.clip.h].map((v) => Math.round(v)), holder: [b.x, b.y, b.x + b.w, b.y + b.h].map((v) => Math.round(v)) }); }
      }
      if (holder) {
        const hb = boxOf(holder.matrixWorld, [[0, 0], [holder.w, 0], [holder.w, -holder.h], [0, -holder.h]]), by2 = out(t.clip, hb);
        if (by2 > 1.5) res.T7.push({ str: t.str, screen: t.screen, by: Math.round(by2 * 10) / 10, box: [t.clip.x, t.clip.y, t.clip.x + t.clip.w, t.clip.y + t.clip.h].map((v) => Math.round(v)), holder: [hb.x, hb.y, hb.x + hb.w, hb.y + hb.h].map((v) => Math.round(v)) });
      }
      // the guide's speech panel lies over the dimmed, blocked screen on purpose (O1 keeps it off the battle banners)
      if (t.screen !== 'guide') for (const [n, q] of tnodes) {
        if (anc.has(n)) continue; const c = cross(t.clip, q.box);
        if (c && c.w > 1.5 && c.h > 1.5) res.T8.push({ str: t.str, screen: t.screen, id: q.id, by: [Math.round(c.w * 10) / 10, Math.round(c.h * 10) / 10] });
      }
    }
  }

  // ---- T5 buttons, in CSS px. The kit grows every hit box to at least 48 px, so crossing and frame tests use the visible box
  const tg = ui.targets().filter((q) => q.enabled);
  res.t5n = tg.length;
  const vbox = (q) => ({ x: q.vx, y: q.vy, w: q.vw, h: q.vh });
  const inter = (a, b) => [Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)];
  const nested = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
  const blockerId = (id) => /^(guide-block|guide-skip|reveal-tap)$/.test(id);
  for (const t of tg) {
    if (blockerId(t.id)) continue;
    const v = vbox(t);
    if (v.x < fr.left - 1 || v.y < fr.top - 1 || v.x + v.w > fr.left + fr.width + 1 || v.y + v.h > fr.top + fr.height + 1) res.T5.push({ id: t.id, why: 'visible box outside the frame', box: [v.x, v.y, v.x + v.w, v.y + v.h].map(Math.round), frame: [fr.left, fr.top, fr.left + fr.width, fr.top + fr.height].map(Math.round) });
    const hit = ui.hitAt(t.x + t.w / 2, t.y + t.h / 2);
    if (hit !== t.id) { if (blockerId(hit || '')) res.t5ex++; else res.T5.push({ id: t.id, why: 'centre is owned by ' + hit }); }
  }
  for (let i = 0; i < tg.length; i++) for (let j = i + 1; j < tg.length; j++) {
    const a = tg[i], b = tg[j]; if (a.screen !== b.screen || blockerId(a.id) || blockerId(b.id)) continue;
    const va = vbox(a), vb = vbox(b), [w, h] = inter(va, vb); if (!(w > 2 && h > 2)) continue;
    // a badge much smaller than the button it sits on (the eye on a hero card) is deliberate when its own centre hits it
    const area = (v) => v.w * v.h;
    const inner = nested(va, vb) ? a : nested(vb, va) ? b : (area(va) <= 0.3 * area(vb) ? a : area(vb) <= 0.3 * area(va) ? b : null);
    const owner = inner ? ui.hitAt(inner.x + inner.w / 2, inner.y + inner.h / 2) : null;
    if (inner && (owner === inner.id || blockerId(owner || ''))) { res.t5ex++; continue; }
    res.T5.push({ id: a.id + ' x ' + b.id, why: 'visible boxes cross', by: [Math.round(w * 10) / 10, Math.round(h * 10) / 10] });
  }

  // ---- T6 the 3D world never changes a pixel the HUD paints opaque
  if (opts.battle) {
    const overlay = () => { ui._dt = 1e-9; ui.render(); }; // no portrait refresh between the two frames
    try {
      r.setRenderTarget(null);
      r.setClearColor(0x000000, 1); r.clear(); ui._dt = 1e-9; ui.render(); const blk = readAll();
      r.setClearColor(0xffffff, 1); r.clear(); ui._dt = 1e-9; ui.render(); const wht = readAll();
      host.render(overlay); const on = readAll();
      const was = host.scene.visible; host.scene.visible = false; host.render(overlay); const off = readAll(); host.scene.visible = was;
      host.render(overlay);
      const rects = [];
      const all = ui.targets(), pick = (re) => all.filter((q) => re.test(q.id));
      const bar = pick(/^(pause|speed)$/);
      const toPx = (x, y, w, h) => ({ x0: Math.max(0, Math.round((x - fr.left) / fr.width * CW)), x1: Math.min(CW, Math.round((x + w - fr.left) / fr.width * CW)), y0: Math.max(0, Math.round((y - fr.top) / fr.height * CH)), y1: Math.min(CH, Math.round((y + h - fr.top) / fr.height * CH)) });
      if (bar.length) { const y0 = Math.min(...bar.map((q) => q.y)), y1 = Math.max(...bar.map((q) => q.y + q.h)); rects.push({ name: 'top bar', ...toPx(fr.left, y0, fr.width, y1 - y0) }); }
      for (const q of pick(/^ult\d+$/)) rects.push({ name: q.id + ' card', ...toPx(q.x - 6, q.y - 34, q.w + 12, fr.top + fr.height - (q.y - 34)) });
      res.t6rects = rects.length;
      for (const rc of rects) {
        let opaque = 0, diff = 0;
        for (let y = rc.y0; y < rc.y1; y++) for (let x = rc.x0; x < rc.x1; x++) {
          const gy = CH - 1 - y, i = (gy * CW + x) * 4;
          if (Math.abs(blk[i] - wht[i]) > 3 || Math.abs(blk[i + 1] - wht[i + 1]) > 3 || Math.abs(blk[i + 2] - wht[i + 2]) > 3) continue;
          opaque++;
          if (Math.abs(on[i] - off[i]) > 6 || Math.abs(on[i + 1] - off[i + 1]) > 6 || Math.abs(on[i + 2] - off[i + 2]) > 6) diff++;
        }
        const frac = opaque ? diff / opaque : 0;
        res.T6.push({ name: rc.name, opaque, diff, frac: Math.round(frac * 100000) / 100000, bad: frac > 0.005 });
      }
    } finally { r.setClearColor(cc, ca); r.setRenderTarget(prevRT); }
  }
  if (opts.battle) { const h = G.screens.hud.dbg(); res.hud = { banners: h.banners, numbers: h.numbers, list: h.numberRects }; }
  for (const u of undo.reverse()) u();
  scene.updateMatrixWorld(true);
  return res;
}
const AUDIT_SRC = AUDIT.toString();
const audit = (page, o = {}) => page.evaluate(`(${AUDIT_SRC})(${JSON.stringify({ shareMin: SHARE_MIN, overlap: OVERLAP, ...o })})`);

// ---------------------------------------------------------------------------------------------------------
const { check, done } = checker();
const issues = [];
const issue = (line) => { issues.push(line); console.log('  issue: ' + line); };
const f1 = (v) => (Math.round(v * 10) / 10);
const step = (page, n) => page.evaluate((k) => __step(k), n);
const tap = async (page, id, n = 24) => { const ok = await page.evaluate((i) => __ui.tapId(i), id); await step(page, n); return ok; };
const ids = (page) => page.evaluate(() => __ui.targets().map((t) => t.id));
const shot = (page, phone, name) => page.screenshot({ path: path.join(OUT, `${phone}-${name}.png`) });

// run the six checks for one state: one PASS/FAIL line per check, every failure on an issue line
async function inspect(page, phone, name, o = {}) {
  if (ONLY && !(phone + '-' + name).includes(ONLY)) return null;
  if (!o.noshot) await shot(page, phone, name);
  const r = await audit(page, { battle: !!o.battle });
  const P = `${phone} ${name}`;
  const ex = r.exempt, exs = `${ex.scrollPart} scroll-clipped, ${ex.scrollOut} scrolled out, ${ex.dimmed} dimmed by a modal`;
  check(r.T1.length === 0, `${P} T1 drawn share: ${r.n} texts, lowest share ${r.t1min.toFixed(2)}${r.t1minStr ? ' ("' + r.t1minStr + '")' : ''}, ${r.T1.length} below ${SHARE_MIN} (${exs}, ${ex.nopaint} without paint)`);
  for (const f of r.T1) issue(`${P} T1 "${f.str}" on ${f.screen}: drawn share ${f.share}, box ${f.box.join(',')}`);
  check(r.T2.length === 0, `${P} T2 inside frame: ${r.n} texts, ${r.T2.length} outside 780x${f1(r.T2[0] ? r.T2[0].frame[1] : 0) || 'H'}`);
  for (const f of r.T2) issue(`${P} T2 "${f.str}" on ${f.screen}: ink box ${f.box.join(',')} leaves 0,0,${f.frame.join(',')}`);
  check(r.T3.length === 0, `${P} T3 raster: ${r.n} canvases, ${r.T3.length} with ink on their edge`);
  for (const f of r.T3) issue(`${P} T3 "${f.str}" on ${f.screen}: ink touches the canvas ${f.edges}`);
  check(r.T4.length === 0, `${P} T4 no overlap: ${r.n} texts, ${r.T4.length} pairs crossing by more than ${OVERLAP} units`);
  for (const f of r.T4) issue(`${P} T4 "${f.a}" x "${f.b}" on ${f.screen}: cross by ${f.by.join(' x ')} units`);
  check(r.T5.length === 0, `${P} T5 buttons: ${r.t5n} enabled targets, ${r.T5.length} faults (${r.t5ex} deliberately blocked by a guide)`);
  for (const f of r.T5) issue(`${P} T5 ${f.id}: ${f.why}${f.by ? ' by ' + f.by.join(' x ') + ' px' : ''}${f.box ? ' box ' + f.box.join(',') + ' frame ' + f.frame.join(',') : ''}`);
  check(r.T7.length === 0, `${P} T7 in holder: ${r.n} texts, ${r.T7.length} leave the panel or button that holds them`);
  for (const f of r.T7) issue(`${P} T7 "${f.str}" on ${f.screen}: ink ${f.box.join(',')} leaves its holder ${f.holder.join(',')} by ${f.by}`);
  check(r.T8.length === 0, `${P} T8 off buttons: ${r.n} texts, ${r.T8.length} lie on a button they are not part of`);
  for (const f of r.T8) issue(`${P} T8 "${f.str}" on ${f.screen} lies on ${f.id} by ${f.by.join(' x ')}`);
  if (o.battle) {
    const bad = r.T6.filter((q) => q.bad);
    check(bad.length === 0, `${P} T6 world vs HUD: ${r.T6.length ? r.T6.length + ' HUD rectangles' : 'no HUD up (a modal covers it)'}, ${r.T6.map((q) => q.name + ' ' + q.diff + '/' + q.opaque).join('; ')}`);
    for (const f of bad) issue(`${P} T6 ${f.name}: ${f.diff} of ${f.opaque} opaque HUD pixels change with the world (${(f.frac * 100).toFixed(2)}%)`);
  }
  return r;
}

const WAIT = async (page, n = 40) => step(page, n);
const BASE_Q = 'noaudio=1&q=low';

async function nonBattle(br, srv, phone) {
  const g = await open(br, srv.base, phone, BASE_Q); const { page, problems } = g;
  await step(page, 30);
  await page.evaluate(() => { __G.meta.ftueSkip(); for (const id of ['spectate', 'speed', 'daily', 'chapter', 'equip', 'merge']) __G.meta.ftueDone(id); });
  await step(page, 30);
  await inspect(page, phone, 'home');
  await page.evaluate(() => { __G.meta.acc.gold = 1234567; __G.meta.acc.gems = 987654; __G.meta.save(); }); await step(page, 90);
  await inspect(page, phone, 'home-big-counters');
  await tap(page, 'tab-heroes', 40); await inspect(page, phone, 'heroes');
  const hid = (await ids(page)).find((i) => /^hero-/.test(i));
  if (hid) { await tap(page, hid, 40); await inspect(page, phone, 'hero-page'); } else console.log('NOT REACHED: ' + phone + ' hero page (no hero-* target)');
  await page.evaluate(() => { __G.goto('home'); }); await step(page, 30);
  await tap(page, 'tab-gacha', 40); await inspect(page, phone, 'summon');
  if (await tap(page, 'rates', 40)) { await inspect(page, phone, 'summon-rates'); await tap(page, 'rates-close', 30); } else console.log('NOT REACHED: ' + phone + ' rates panel');
  await page.evaluate(() => { __G.meta.acc.gems = 5000; __G.meta.save(); }); await step(page, 5);
  // a ten-pull that shows every label: a new hero and a duplicate of each hero rarity, gold, and three items. The pull is
  // replaced by fixed results; the screen's own animation and result cards run unchanged. Each card is audited once settled.
  const byR = (r) => Object.keys(HERO).find((k) => HERO[k].rarity === r);
  const fixed = [];
  for (const r of ['R', 'SR', 'SSR']) { fixed.push({ row: 'x', kind: 'hero', rarity: r, hero: byR(r), n: 0, isNew: true, dupe: false, item: null }); }
  for (const r of ['R', 'SR', 'SSR']) { fixed.push({ row: 'x', kind: 'shard', rarity: r, hero: byR(r), n: 20 + 10 * ['R', 'SR', 'SSR'].indexOf(r), isNew: false, dupe: true, item: null }); }
  fixed.push({ row: 'x', kind: 'gold', rarity: null, hero: null, n: 500, isNew: false, dupe: false, item: null });
  for (const [it, tier] of [['w_cua', 0], ['a_lop', 2], ['n_rang', 4]]) fixed.push({ row: 'x', kind: 'item', rarity: null, hero: null, n: 0, isNew: false, dupe: false, item: { uid: 9000 + tier, item: it, tier, lv: 1 } });
  await page.evaluate((res) => { __G.meta.pull = () => ({ ok: true, results: res }); }, fixed);
  if (await tap(page, 'pull10', 10)) {
    for (let k = 0; k < 10; k++) {
      for (let g = 0; g < 400 && (await page.evaluate(() => __G.metaUi.gachaPhase())) !== 'reveal'; g++) await step(page, 2);
      await step(page, 6); await inspect(page, phone, `summon-10pull-card-${k + 1}-early`, { noshot: true });
      await step(page, 22); await inspect(page, phone, `summon-10pull-card-${k + 1}`);
      await step(page, 40);
    }
    for (let g = 0; g < 200 && (await page.evaluate(() => __G.metaUi.gachaPhase())) !== 'summary'; g++) await step(page, 4);
    await step(page, 40); await inspect(page, phone, 'summon-10pull-summary');
  } else console.log('NOT REACHED: ' + phone + ' 10-pull');
  await page.evaluate(() => { __G.goto('home'); }); await step(page, 30);
  // equipment: a bag with a stack of three identical items so the merge panel exists
  await page.evaluate(() => {
    const M = __G.meta; M.acc.level = Math.max(M.acc.level, 8); M.acc.gold = 99999; M.acc.mergeOpen = true;
    M.acc.bag = []; const mk = (item, tier, lv) => { const it = { uid: ++M.acc.uidSeq, item, tier, lv }; M.acc.bag.push(it); return it.uid; };
    mk('w_cua', 0, 4); mk('w_cua', 0, 1); mk('w_cua', 0, 1); mk('a_lop', 0, 1); mk('n_rang', 0, 1); mk('g_da', 0, 1); M.save();
  });
  await tap(page, 'tab-equip', 40); await inspect(page, phone, 'equip');
  const bag = (await ids(page)).find((i) => /^bag-/.test(i));
  if (bag) { await tap(page, bag, 40); await inspect(page, phone, 'equip-sheet'); await page.evaluate(() => { __G.goto('home'); __G.goto('equip'); }); await step(page, 30); } else console.log('NOT REACHED: ' + phone + ' item sheet');
  if (await tap(page, 'merge', 30)) { await inspect(page, phone, 'equip-merge'); await tap(page, 'merge-cancel', 20); } else console.log('NOT REACHED: ' + phone + ' merge panel (ids ' + (await ids(page)).join(',') + ')');
  await page.evaluate(() => { __G.goto('home'); }); await step(page, 30);
  await tap(page, 'tab-rewards', 40); await inspect(page, phone, 'rewards');
  await page.evaluate(() => { __G.goto('home'); }); await step(page, 30);
  if (await tap(page, 'gear', 40)) {
    await inspect(page, phone, 'settings');
    if (await tap(page, 'acct-delete', 40)) await inspect(page, phone, 'delete-account'); else console.log('NOT REACHED: ' + phone + ' delete-account (ids ' + (await ids(page)).join(',') + ')');
  } else console.log('NOT REACHED: ' + phone + ' settings');
  check(problems.length === 0, `${phone} non-battle states: no console errors (${problems.slice(0, 2).join(' | ') || 'none'})`);
  await g.ctx.close();
}

async function ftue(br, srv, phone) {
  const g = await open(br, srv.base, phone, BASE_Q, { fresh: true }); const { page } = g;
  await step(page, 30);
  const tapAt = async (x, y) => { if (phone === 'desktop') await page.mouse.click(x, y); else await page.touchscreen.tap(x, y); await step(page, 10); };
  const safe = () => page.evaluate(() => { const r = document.getElementById('frame').getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + r.height * 0.07]; });
  const seen = []; let last = '', audited = 0;
  for (let it = 0; it < 1500 && audited < 8; it++) {
    const st = await page.evaluate(() => ({ d: __G.guide.dbg(), screen: __G.screen, phase: __G.B && __G.B.phase, inB: !!__G.B, cleared: __G.meta.acc.cleared, session: __G.meta.acc.ftue.session }));
    const d = st.d;
    if (d.reveal) { await tap(page, 'reveal-tap', 6); continue; }
    if (d.active) {
      const key = d.id + ':' + (d.target || 'free');
      if (key !== last) {
        last = key; await step(page, 24); seen.push(key); audited++;
        await inspect(page, phone, `ftue-${String(audited).padStart(2, '0')}-${d.id}`, { battle: st.inB });
      }
      if (d.noTarget) { const [x, y] = await safe(); await tapAt(x, y); if (d.id === 'join') { await step(page, 200); await page.evaluate(() => __sim(0.1)); } continue; }
      if (!d.rect) { if (st.phase === 'fight' && !d.frozen) await page.evaluate(() => __sim(0.2)); await step(page, 8); continue; }
      await tap(page, d.target, 12); continue;
    }
    if (st.screen === 'home' && !st.session && st.cleared === 0 && !st.inB) { await tap(page, 'start', 12); continue; }
    if (st.inB && st.phase === 'fight') { await page.evaluate(() => __sim(0.4)); await step(page, 2); continue; }
    if (st.inB && st.phase === 'pick') { await page.evaluate(() => __G.autoPick()); await step(page, 10); continue; }
    await step(page, 20);
  }
  console.log(`${phone} FTUE steps audited: ${seen.join(' ')}`);
  check(audited >= 6, `${phone} FTUE: ${audited} guide steps reached (need 6)`);
  await g.ctx.close();
}

const flush = (page) => step(page, 130);
async function battle(br, srv, phone) {
  const g = await open(br, srv.base, phone, BASE_Q + '&autostart=1&stage=1&seed=7'); const { page, problems } = g;
  await step(page, 20);
  await inspect(page, phone, 'fight-start', { battle: true });
  await flush(page);
  const emit = (ev, d) => page.evaluate(([e, x]) => __G.events.emit(e, x), [ev, d]);
  const hudBanners = () => page.evaluate(() => __G.screens.hud.dbg().banners);
  // wave banner + skill banner together
  await emit('sim:wave', { n: 3 }); await emit('sim:ult', { name: 'Trảm Phong', hero: 'gio', slot: 3 }); await step(page, 25);
  console.log(`${phone} banners up (wave+ult): ${(await hudBanners()).join(',')}`);
  await inspect(page, phone, 'wave+ult', { battle: true });
  await flush(page);
  // two skill banners
  await emit('sim:ult', { name: 'Trảm Phong', hero: 'gio', slot: 3 }); await emit('sim:ult', { name: 'Lôi Điện Ẩn', hero: 'thep', slot: 1 }); await step(page, 25);
  console.log(`${phone} banners up (ult+ult): ${(await hudBanners()).join(',')}`);
  await inspect(page, phone, 'ult+ult', { battle: true });
  await flush(page);
  // boss + rage + skill, diacritics
  await emit('sim:wave', { n: 5, boss: true, name: 'Ỗ Ặc Vương' }); await emit('sim:enrage', {}); await emit('sim:ult', { name: 'Ẩn Thân Ễ', hero: 'gio', slot: 3 }); await step(page, 25);
  console.log(`${phone} banners up (boss+rage+ult): ${(await hudBanners()).join(',')}`);
  await inspect(page, phone, 'boss+rage+ult', { battle: true });
  await flush(page);
  // four at once (the HUD must still keep them apart)
  await emit('sim:wave', { n: 4 }); await emit('sim:enrage', {}); await emit('sim:ult', { name: 'Trảm Phong', hero: 'gio', slot: 3 }); await emit('sim:ult', { name: 'Hồi Sinh Ả', hero: 'thep', slot: 1 }); await step(page, 25);
  console.log(`${phone} banners up (wave+rage+ult+ult): ${(await hudBanners()).join(',')}`);
  await inspect(page, phone, 'four-banners', { battle: true });
  await flush(page);
  // a real ultimate cast: the card effect
  await emit('sim:ult', { name: 'Trảm Phong', hero: 'gio', slot: 0 }); await step(page, 8);
  await inspect(page, phone, 'ult-cast-effect', { battle: true });
  await flush(page);
  // card pick
  await page.evaluate(() => { const B = __G.B; let k = 0; while (B.phase === 'fight' && k++ < 200) __sim(2); });
  await step(page, 50);
  if ((await page.evaluate(() => __G.B.phase)) === 'pick') await inspect(page, phone, 'card-pick', { battle: true }); else console.log('NOT REACHED: ' + phone + ' card pick');
  await page.evaluate(() => __G.autoPick()); await step(page, 30);
  // pause, settings in battle
  if (await tap(page, 'pause', 40)) { await inspect(page, phone, 'pause', { battle: true }); await tap(page, 'resume', 30); } else console.log('NOT REACHED: ' + phone + ' pause');
  await page.evaluate(() => { __G.openSettings(); }); await step(page, 40); await inspect(page, phone, 'battle-settings', { battle: true });
  check(problems.length === 0, `${phone} battle states: no console errors (${problems.slice(0, 2).join(' | ') || 'none'})`);
  await g.ctx.close();

}
const SEEDS = (process['env'].CROWD_SEEDS || '3,7,11,15').split(',').map(Number);
async function crowded(br, srv, phone) {
  // crowded fight: stage 15, damage numbers, on fixed seeds. The page's own frame loop is stopped so that only __sim and
  // __step move the fight and the HUD clock: the same seed then gives the same numbers on every run.
  for (const seed of SEEDS) await crowdedSeed(br, srv, phone, seed);
}
async function crowdedSeed(br, srv, phone, seed) {
  const c = await open(br, srv.base, phone, BASE_Q + `&autostart=1&stage=15&seed=${seed}&autoult=1&autopick=1`);
  let nums = 0, tries = 0;
  while (tries++ < 14) { await c.page.evaluate(() => __sim(1.5)); nums = await c.page.evaluate(() => __G.screens.hud.dbg().numbers); if (nums >= 4) break; }
  console.log(`${phone} crowded fight seed ${seed}: ${nums} damage numbers up after ${tries} tries`);
  await inspect(c.page, phone, `crowded-fight-seed${seed}`, { battle: true });
  // many more moments of the same fight, in small slices so every banner is in its steady state. A banner that comes up over
  // numbers already flying is allowed (they are gone within a second and the HUD's own rule counts only numbers placed
  // after the banner), so samples with a banner up are skipped here and covered by the banner cases above.
  const want = +process['env'].CROWD_SAMPLES || 14; let audited = 0, skipped = 0, crowdMax = 0; const bad = [];
  for (let k = 0; k < 400 && audited < want; k++) {
    await c.page.evaluate(() => { const B = __G.B; if (B.phase === 'pick') __G.autoPick(); __sim(0.2); __step(12); });
    const ph = await c.page.evaluate(() => __G.B.phase);
    if (ph !== 'fight') { if (ph !== 'pick') break; continue; }
    const r = await audit(c.page, { battle: true, crowdOnly: true });
    if (r.skipped) { skipped++; continue; }
    audited++; crowdMax = Math.max(crowdMax, r.hud.numbers);
    for (const k2 of ['T1', 'T2', 'T3', 'T4']) for (const f of r[k2]) bad.push(`${k2} ${JSON.stringify(f).slice(0, 160)} numbers ${JSON.stringify(r.hud.list.map((q) => [q.x | 0, q.y | 0, q.w | 0, q.h | 0, +q.age.toFixed(2)]))}`);
  }
  check(audited >= 10 && bad.length === 0, `${phone} crowded-fight seed ${seed} samples: ${audited} moments with 2+ numbers and no banner audited (most numbers at once ${crowdMax}, ${skipped} skipped), ${bad.length} T1-T4 faults`);
  for (const b of bad.slice(0, 20)) issue(`${phone} crowded-fight seed ${seed} samples ${b}`);
  await c.ctx.close();
}
async function results(br, srv, phone) {

  // results: win (reward tab, stats tab, hero detail) and lose
  const w = await open(br, srv.base, phone, BASE_Q + '&autostart=1&stage=1&seed=7&autoult=1&autopick=1'); const wp = w.page;
  await wp.evaluate(() => { const B = __G.B; let k = 0; while ((B.phase === 'fight' || B.phase === 'pick') && k++ < 400) __sim(5); __sim(0); for (let i = 0; i < 200 && !__G.lastReward; i++) __step(1); __step(80); });
  await inspect(wp, phone, 'result-win', { battle: true });
  if (await tap(wp, 'tab-stats', 40)) {
    await inspect(wp, phone, 'result-stats', { battle: true });
    if (await tap(wp, 'stat-hero0', 40)) await inspect(wp, phone, 'result-hero-detail', { battle: true }); else console.log('NOT REACHED: ' + phone + ' hero detail');
  } else console.log('NOT REACHED: ' + phone + ' stats tab');
  await w.ctx.close();
  const l = await open(br, srv.base, phone, BASE_Q + '&autostart=1&stage=1&seed=7'); const lp = l.page;
  await lp.evaluate(() => { const B = __G.B; for (const u of B.heroes) { u.alive = false; u.hp = 0; } __sim(1); for (let i = 0; i < 200 && !__G.lastReward; i++) __step(1); __step(80); });
  await inspect(lp, phone, 'result-lose', { battle: true });
  await l.ctx.close();
}

// ---------------------------------------------------------------------------------------------------------
async function selftest(br, srv) {
  const phone = 's22';
  const g = await open(br, srv.base, phone, BASE_Q); const { page } = g; await step(page, 40);
  const key = (r) => [...r.T1.map((f) => 'T1|' + f.str), ...r.T2.map((f) => 'T2|' + f.str), ...r.T3.map((f) => 'T3|' + f.str), ...r.T4.map((f) => 'T4|' + [f.a, f.b].sort().join('|')), ...r.T5.map((f) => 'T5|' + f.id)].sort();
  const base = await audit(page, {}); const baseKeys = key(base);
  console.log(`selftest baseline on home: ${base.n} texts, ${baseKeys.length} faults already present`);
  const fresh = (r) => key(r).filter((k) => { const i = baseKeys.indexOf(k); if (i >= 0) { baseKeys.splice(i, 1); return false; } return true; });
  // an isolated text: no other text within 8 units of its ink box, outside scrolls, fully in the frame
  const free = base.texts.filter((t) => t.ink && !t.scroll && !t.tiny && t.str && t.ink.x > 4 && t.ink.x + t.ink.w < 776 && t.ink.y > 4 && t.ink.y + t.ink.h < 350 && base.texts.every((o) => o === t || !o.ink || o.screen !== t.screen || o.ink.x > t.ink.x + t.ink.w + 8 || o.ink.x + o.ink.w < t.ink.x - 8 || o.ink.y > t.ink.y + t.ink.h + 8 || o.ink.y + o.ink.h < t.ink.y - 8));
  if (free.length < 2) { check(false, 'selftest: found ' + free.length + ' isolated texts on home (need 2)'); await g.ctx.close(); return; }
  const pairScreen = free.map((t) => t.screen).find((sc, i, arr) => arr.indexOf(sc) !== arr.lastIndexOf(sc));
  const same = free.filter((t) => t.screen === pairScreen);
  if (same.length < 2) { check(false, 'selftest: no screen has two isolated texts'); await g.ctx.close(); return; }
  const A = same[0], B = same[same.length - 1];
  console.log(`selftest texts: A "${A.str}" (${A.screen}), B "${B.str}" (${B.screen})`);
  const wasKeys = () => baseKeys.slice();
  let r;
  r = await audit(page, { mut: { kind: 'move', i: A.idx, str: A.str, dx: 500 } });
  let f = (() => { const bk = wasKeys(); return key(r).filter((k) => { const i = bk.indexOf(k); if (i >= 0) { bk.splice(i, 1); return false; } return true; }); })();
  check(f.length === 1 && f[0] === 'T2|' + A.str, `selftest (a) text moved 500 units right: audit reports exactly [${f.join(', ')}] (want T2|${A.str})`);
  r = await audit(page, { mut: { kind: 'cover', i: A.idx, str: A.str } });
  f = (() => { const bk = wasKeys(); return key(r).filter((k) => { const i = bk.indexOf(k); if (i >= 0) { bk.splice(i, 1); return false; } return true; }); })();
  check(f.length === 1 && f[0] === 'T1|' + A.str, `selftest (b) opaque panel over a text: audit reports exactly [${f.join(', ')}] (want T1|${A.str})`);
  const share = r.T1.find((q) => q.str === A.str);
  console.log(`selftest (b) measured drawn share of "${A.str}": ${share ? share.share : 'n/a'}`);
  r = await audit(page, { mut: { kind: 'onto', i: A.idx, j: B.idx, str: A.str } });
  f = (() => { const bk = wasKeys(); return key(r).filter((k) => { const i = bk.indexOf(k); if (i >= 0) { bk.splice(i, 1); return false; } return true; }); })();
  const pair = 'T4|' + [A.str, B.str].sort().join('|');
  check(f.includes(pair) && f.every((k) => k === pair || k === 'T1|' + A.str || k === 'T1|' + B.str), `selftest (c) text moved 6 units onto another: audit reports [${f.join(', ')}] (want ${pair}, plus T1 on either text)`);
  const clean = await audit(page, {});
  check(JSON.stringify(key(clean)) === JSON.stringify(key(base)), `selftest: after the three mutations the page audits like the baseline again (${key(clean).length} faults, was ${key(base).length})`);
  await g.ctx.close();
}

// two moving overlays that must never sit on something the player needs, sampled frame by frame over their whole life:
//   O1 the tutorial speech panel never crosses a wave or boss banner of the battle HUD (every FTUE battle step)
//   O2 the toast never crosses an enabled button, from the tap that raises it until it is gone (home, locked tabs)
function OVERLAP_PROBE() {
  const fr = document.getElementById('frame').getBoundingClientRect(), k = fr.width / 780;
  const toD = (r) => r && { x: (r.x - fr.left) / k, y: (r.y - fr.top) / k, w: r.w / k, h: r.h / k };
  const cross = (a, b) => { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h); return x2 - x > 1 && y2 - y > 1 ? [Math.round(x2 - x), Math.round(y2 - y)] : null; };
  const out = { guide: null, toast: null };
  const G = window.__G, d = G.guide.dbg();
  if (d.active && d.panel && G.B && G.screens.hud.dbg().visible) {
    const p = toD(d.panel), h = G.screens.hud.dbg(), hits = [];
    h.bannerRects.forEach((b, i) => { const c = cross(p, b); if (c) hits.push(`${h.banners[i] || 'boss bar'} ${c.join('x')}`); });
    out.guide = { step: d.id, banners: h.bannerRects.length, hits };
  }
  const t = window.__ui.toastRect();
  if (t) {
    const hits = [];
    for (const q of window.__ui.targets()) { if (!q.enabled) continue; const c = cross(t, toD({ x: q.vx, y: q.vy, w: q.vw, h: q.vh })); if (c) hits.push(`${q.id} ${c.join('x')}`); }
    out.toast = { hits };
  }
  return out;
}
async function overlays(br, srv, phone) {
  const probe = (page) => page.evaluate(OVERLAP_PROBE);
  { // O2: the toast of each locked tab, every 3 frames over its 2.1 s life
    const g = await open(br, srv.base, phone, BASE_Q, { fresh: true }); const { page } = g; await step(page, 30);
    const locked = (await ids(page)).filter((i) => /^(tab-|team-)/.test(i)); // the rail tabs and the locked team slots beside BẮT ĐẦU
    let samples = 0; const bad = [];
    for (const id of locked) {
      await page.evaluate((i) => __ui.tapId(i), id);
      for (let f = 0; f < 140; f += 3) { await step(page, 3); const o = await probe(page); if (!o.toast) continue; samples++; if (o.toast.hits.length) bad.push(`${id} +${f} frames: ${o.toast.hits.join(', ')}`); }
      if (await page.evaluate(() => __G.screen !== 'home')) await page.evaluate(() => __G.goto('home'));
      await step(page, 20);
    }
    check(samples >= 10 && bad.length === 0, `${phone} O2 toast vs buttons: ${samples} frames with a toast up after tapping ${locked.join(', ')}, ${bad.length} on an enabled button${bad.length ? ': ' + [...new Set(bad.map((b) => b.replace(/ \+\d+ frames/, '')))].slice(0, 4).join(' | ') : ''}`);
    for (const b of bad.slice(0, 10)) issue(`${phone} O2 toast ${b}`);
    await g.ctx.close();
  }
  { // O1: the FTUE's first battle, the speech panel against the banners on every loop of the walk
    const g = await open(br, srv.base, phone, BASE_Q, { fresh: true }); const { page } = g; await step(page, 30);
    const safe = () => page.evaluate(() => { const r = document.getElementById('frame').getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + r.height * 0.07]; });
    const tapAt = async (x, y) => { if (phone === 'desktop') await page.mouse.click(x, y); else await page.touchscreen.tap(x, y); await step(page, 10); };
    let samples = 0, withBanner = 0; const bad = []; const steps = new Set(); let done1 = false;
    const look = async () => { const o = await probe(page); if (!o.guide) return; samples++; steps.add(o.guide.step); if (o.guide.banners) withBanner++; if (o.guide.hits.length) bad.push(`${o.guide.step}: ${o.guide.hits.join(', ')}`); };
    for (let it = 0; it < 1500 && !done1; it++) {
      const st = await page.evaluate(() => ({ d: __G.guide.dbg(), screen: __G.screen, phase: __G.B && __G.B.phase, inB: !!__G.B, cleared: __G.meta.acc.cleared, session: __G.meta.acc.ftue.session }));
      const d = st.d;
      if (st.cleared >= 1 && !st.inB) { done1 = true; break; }
      if (st.inB) { for (let f = 0; f < 4; f++) { await look(); await step(page, 3); } }
      if (d.reveal) { await tap(page, 'reveal-tap', 6); continue; }
      if (d.active) {
        if (d.noTarget) { const [x, y] = await safe(); await tapAt(x, y); if (d.id === 'join') { await step(page, 200); await page.evaluate(() => __sim(0.1)); } continue; }
        if (!d.rect) { if (st.phase === 'fight' && !d.frozen) await page.evaluate(() => __sim(0.2)); await step(page, 8); continue; }
        await tap(page, d.target, 12); continue;
      }
      if (st.screen === 'home' && !st.session && st.cleared === 0 && !st.inB) { await tap(page, 'start', 12); continue; }
      if (st.inB && st.phase === 'fight') { await page.evaluate(() => __sim(0.4)); await step(page, 2); continue; }
      if (st.inB && st.phase === 'pick') { await page.evaluate(() => __G.autoPick()); await step(page, 10); continue; }
      if (st.inB) { await step(page, 20); continue; }
      done1 = st.cleared >= 1; await step(page, 20);
    }
    check(samples >= 20 && withBanner >= 3 && bad.length === 0, `${phone} O1 speech panel vs banners: ${samples} battle frames with the guide up (${withBanner} with a banner, steps ${[...steps].join(' ')}), ${bad.length} with the panel on a banner${bad.length ? ': ' + [...new Set(bad)].slice(0, 4).join(' | ') : ''}`);
    for (const b of [...new Set(bad)].slice(0, 10)) issue(`${phone} O1 speech panel ${b}`);
    await g.ctx.close();
  }
}

// the boss entrance (js/view/bossintro.js) at the moment its name is up: the three longest boss names, driven through the real
// frame loop (window.__frame) on a clock this case advances, so the scene's hit-stop and slow motion run as in play
async function bossIntro(br, srv, phone) {
  for (const [kind, n] of [['pharaoh', 10], ['guardian', 15], ['dragon', 20]]) {
    if (ONLY && !(phone + '-bossintro-' + kind).includes(ONLY)) continue;
    const g = await open(br, srv.base, phone, BASE_Q + `&autostart=1&stage=${n}&wave=5&seed=${n}`); const { page, problems } = g;
    const st = await page.evaluate(() => {
      let vt = performance.now(); performance.now = () => vt; const fr = () => { vt += 1000 / 60; window.__frame(1 / 60); };
      const I = __G.intro; let k = 0;
      while (!I.active && k++ < 1500) fr();
      while (I.scene && I.scene.t < I.scene.def.L + 0.7 && k++ < 2500) fr();
      return { active: I.active, kind: I.scene && I.scene.kind };
    });
    check(st.active && st.kind === kind, `${phone} bossintro-${kind}: the entrance is up for the audit (${JSON.stringify(st)})`);
    await inspect(page, phone, 'bossintro-' + kind, { battle: true });
    check(problems.length === 0, `${phone} bossintro-${kind}: no console errors (${problems.slice(0, 2).join(' | ') || 'none'})`);
    await g.ctx.close();
  }
}

const srv = await serve(); const br = await launch();
try {
  if (SELFTEST) await selftest(br, srv);
  else for (const phone of PHONE_LIST) {
    console.log('=== ' + phone + ' ===');
    const FL = process['env'].FLOWS ? process['env'].FLOWS.split(',') : ['nonBattle', 'ftue', 'battle', 'crowded', 'results', 'overlays', 'bossIntro'];
    if (FL.includes('nonBattle')) await nonBattle(br, srv, phone);
    if (FL.includes('ftue')) await ftue(br, srv, phone);
    if (FL.includes('battle')) await battle(br, srv, phone);
    if (FL.includes('crowded')) await crowded(br, srv, phone);
    if (FL.includes('results')) await results(br, srv, phone);
    if (FL.includes('overlays')) await overlays(br, srv, phone);
    if (FL.includes('bossIntro')) await bossIntro(br, srv, phone);
  }
} finally { await br.close(); srv.close(); }
if (!SELFTEST) { fs.writeFileSync(path.join(OUT, 'issues.txt'), issues.join('\n') + (issues.length ? '\n' : '')); console.log(`${issues.length} issues written to .chk/textfit/issues.txt`); }
done();
