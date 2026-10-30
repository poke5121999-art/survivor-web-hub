// uGUI: RectTransform layout, CanvasScaler, layout groups, ContentSizeFitter, Image (simple/sliced/tiled/filled),
// TMP text, RectMask2D/Mask (scissor), CanvasGroup, Button colour/sprite transitions and pointer routing.
import { trs, mul, mat4, xform, invert } from './math.js';
import { buildText, preferredSize } from './text.js';
import { packColor } from './render.js';

export function canvasScale(scaler, sw, sh) {
  if (!scaler || !scaler.enabled) return 1;
  if (scaler.mode === 0) return scaler.scaleFactor || 1;
  if (scaler.mode !== 1) return 1;
  const [rw, rh] = scaler.refRes;
  if (scaler.screenMatch === 1) return Math.min(sw / rw, sh / rh);
  if (scaler.screenMatch === 2) return Math.max(sw / rw, sh / rh);
  const lw = Math.log2(sw / rw), lh = Math.log2(sh / rh);
  return Math.pow(2, lw + (lh - lw) * scaler.match);
}

// ------------------------------------------------------------------------------------------------- layout elements

function layoutProps(n, ui, axis) {
  // [min, preferred, flexible]; uGUI takes the max over ILayoutElement components by priority
  let min = 0, pref = 0, flex = 0;
  if (!n.activeSelf) return null;
  const le = n.get('LayoutElement');
  if (le && le.enabled && le.ignore) return null;
  const img = n.get('Image');
  if (img && img.enabled && img.sprite && (img.imgType === 0 || img.imgType === 3)) {
    const s = ui.assets.sprite(img.sprite);
    if (s) pref = (axis ? s.oh : s.ow) * (ui.refPpu / (s.ppu || 100));
  } else if (img && img.enabled && img.sprite && img.imgType === 1) {
    const s = ui.assets.sprite(img.sprite);
    if (s && s.border) min = pref = (axis ? s.border[1] + s.border[3] : s.border[0] + s.border[2]) * (ui.refPpu / (s.ppu || 100));
  }
  const tx = n.get('Text');
  if (tx && tx.enabled) {
    const f = ui.assets.fontSync(tx.font);
    if (f) {
      const ps = axis === 0 ? preferredSize(f, tx) : null;
      if (axis === 0) pref = Math.max(pref, ps[0]);
      else { const r = n.r || { w: 0 }; const b = buildText(f, tx, r.w || preferredSize(f, tx)[0], 1e6); pref = Math.max(pref, b.prefH); }
    }
  }
  const g = groupOf(n);
  if (g) { const gp = groupPreferred(n, g, ui, axis); min = Math.max(min, gp[0]); pref = Math.max(pref, gp[1]); flex = Math.max(flex, gp[2]); }
  if (le && le.enabled) {
    const mn = axis ? le.minH : le.minW, pf = axis ? le.prefH : le.prefW, fx = axis ? le.flexH : le.flexW;
    if (mn >= 0) min = mn;
    if (pf >= 0) pref = pf;
    if (fx >= 0) flex = fx;
  }
  return [min, Math.max(min, pref), flex];
}

function groupOf(n) {
  for (const c of n.comps) if (c.enabled && (c.type === 'HorizontalLayoutGroup' || c.type === 'VerticalLayoutGroup' || c.type === 'GridLayoutGroup')) return c;
  return null;
}

function groupChildren(n) { return n.children.filter((c) => c.activeSelf && c.rect && !(c.get('LayoutElement')?.ignore)); }

function groupPreferred(n, g, ui, axis) {
  const kids = groupChildren(n);
  const pad = g.padding;
  const padA = axis ? pad[2] + pad[3] : pad[0] + pad[1];
  if (g.type === 'GridLayoutGroup') {
    const cols = g.constraint === 1 ? g.count : Math.max(1, Math.ceil(Math.sqrt(kids.length)));
    const rows = Math.ceil(kids.length / cols);
    const k = axis ? rows : cols;
    const v = padA + k * g.cell[axis] + Math.max(0, k - 1) * g.spacing[axis];
    return [v, v, 0];
  }
  const along = (g.type === 'HorizontalLayoutGroup') === (axis === 0);
  const control = axis ? g.controlH : g.controlW;
  let mn = 0, pf = 0, fx = 0;
  for (const c of kids) {
    const p = control ? layoutProps(c, ui, axis) || [0, 0, 0] : [c.rect.size[axis], c.rect.size[axis], 0];
    const sz = control ? p : [sizeOf(c, axis), sizeOf(c, axis), 0];
    if (along) { mn += sz[0]; pf += sz[1]; fx += p[2]; } else { mn = Math.max(mn, sz[0]); pf = Math.max(pf, sz[1]); fx = Math.max(fx, p[2]); }
  }
  if (along && kids.length) { mn += g.spacing * (kids.length - 1); pf += g.spacing * (kids.length - 1); }
  return [mn + padA, pf + padA, fx];
}

function sizeOf(c, axis) { return c.r ? (axis ? c.r.h : c.r.w) : c.rect.size[axis]; }

function applyGroup(n, g, ui) {
  const kids = groupChildren(n);
  const W = n.r.w, H = n.r.h, pad = g.padding;
  const ca = g.childAlign; // 0 UL,1 UC,2 UR,3 ML,4 MC,5 MR,6 LL,7 LC,8 LR
  const ax = (ca % 3) / 2, ay = 1 - Math.floor(ca / 3) / 2;
  const place = (c, x, y, w, h) => {
    // x,y: child min corner measured from parent's left/top edge (uGUI SetChildAlongAxis), y down
    c.rect.amin = [0, 1]; c.rect.amax = [0, 1];
    c.rect.size = [w, h];
    c.rect.pos = [x + w * c.rect.pivot[0], -y - h * (1 - c.rect.pivot[1])];
  };
  if (g.type === 'GridLayoutGroup') {
    const cols = g.constraint === 1 ? g.count : Math.max(1, Math.floor((W - pad[0] - pad[1] + g.spacing[0]) / (g.cell[0] + g.spacing[0])));
    const rows = Math.ceil(kids.length / cols);
    const tw = cols * g.cell[0] + (cols - 1) * g.spacing[0], th = rows * g.cell[1] + (rows - 1) * g.spacing[1];
    const ox = pad[0] + (W - pad[0] - pad[1] - tw) * ax, oy = pad[2] + (H - pad[2] - pad[3] - th) * (1 - ay);
    kids.forEach((c, i) => place(c, ox + (i % cols) * (g.cell[0] + g.spacing[0]), oy + Math.floor(i / cols) * (g.cell[1] + g.spacing[1]), g.cell[0], g.cell[1]));
    return;
  }
  const horiz = g.type === 'HorizontalLayoutGroup';
  const list = g.reverse ? kids.slice().reverse() : kids;
  const mainAxis = horiz ? 0 : 1;
  const sizes = list.map((c) => {
    const sz = [0, 0];
    for (const a of [0, 1]) {
      const control = a ? g.controlH : g.controlW;
      const p = layoutProps(c, ui, a) || [0, 0, 0];
      const avail = a ? H - pad[2] - pad[3] : W - pad[0] - pad[1];
      if (a !== mainAxis) {
        const expand = a ? g.forceExpandH : g.forceExpandW;
        sz[a] = control ? (expand || p[2] > 0 ? Math.max(p[0], avail) : Math.min(avail, p[1]) || p[1]) : c.rect.size[a];
      } else sz[a] = control ? p[1] : c.rect.size[a];
      sz.p = sz.p || []; sz.p[a] = p;
    }
    return sz;
  });
  const availMain = (horiz ? W - pad[0] - pad[1] : H - pad[2] - pad[3]);
  let total = sizes.reduce((s, z) => s + z[mainAxis], 0) + g.spacing * Math.max(0, list.length - 1);
  const expand = horiz ? g.forceExpandW : g.forceExpandH;
  const control = horiz ? g.controlW : g.controlH;
  let extraEach = 0;
  if (total < availMain && list.length) {
    const flexSum = sizes.reduce((s, z) => s + Math.max(expand ? 1 : 0, z.p[mainAxis][2]), 0);
    if (flexSum > 0) {
      const extra = availMain - total;
      if (control) sizes.forEach((z) => { z[mainAxis] += extra * Math.max(expand ? 1 : 0, z.p[mainAxis][2]) / flexSum; });
      else extraEach = expand ? extra / list.length : 0;
      total = availMain;
    }
  }
  let pos = (horiz ? pad[0] : pad[2]) + Math.max(0, availMain - total) * (horiz ? ax : 1 - ay);
  list.forEach((c, i) => {
    const z = sizes[i];
    const crossAvail = horiz ? H - pad[2] - pad[3] : W - pad[0] - pad[1];
    const cross = horiz ? z[1] : z[0];
    const crossOff = (horiz ? pad[2] : pad[0]) + (crossAvail - cross) * (horiz ? 1 - ay : ax);
    const mainSize = z[mainAxis] + extraEach;
    const childMain = z[mainAxis];
    const mainOff = pos + (mainSize - childMain) * (horiz ? ax : 1 - ay);
    if (horiz) place(c, mainOff, crossOff, childMain, cross); else place(c, crossOff, mainOff, cross, childMain);
    pos += mainSize + g.spacing;
  });
}

// ------------------------------------------------------------------------------------------------- UI system

export class UISystem {
  constructor(engine) {
    this.engine = engine;
    this.assets = engine.assets;
    this.refPpu = 100;
    this.pressed = null;
    this.hover = null;
  }

  canvases() {
    return this.engine.canvases.filter((c) => c.enabled && c.node.activeInHierarchy && !c.node.parent?.closestCanvas?.());
  }

  layoutCanvas(cv, sw, sh) {
    const n = cv.node;
    const scaler = n.get('CanvasScaler');
    const s = cv.mode === 2 ? 1 : canvasScale(scaler, sw, sh);
    this.refPpu = scaler ? scaler.ppu || 100 : 100;
    cv.scale = s;
    if (cv.mode !== 2) {
      // overlay canvases drive their RectTransform: screen-sized, pivot at the centre
      n.r = { w: sw / s, h: sh / s, x: -sw / s / 2, y: -sh / s / 2 };
      n.rect.size = [n.r.w, n.r.h];
      n.rect.pivot = [0.5, 0.5];
      cv.world = mat4();
      trs(cv.world, [sw / 2, sh / 2, 0], [0, 0, 0, 1], [s, s, s]);
      n.world.set(cv.world);
    } else {
      n.r = { w: n.rect.size[0], h: n.rect.size[1] };
    }
    for (let pass = 0; pass < 2; pass++) for (const c of n.children) this.layoutNode(c, n, cv);
    for (const c of n.children) c.updateWorld(n.world);
  }

  layoutNode(n, parent, cv) {
    if (!n.activeSelf) return;
    if (n.rect && parent.r) {
      const R = n.rect, pw = parent.r.w, ph = parent.r.h, pp = parent.rect ? parent.rect.pivot : [0.5, 0.5];
      const fit = n.get('ContentSizeFitter');
      if (fit && fit.enabled) {
        for (const a of [0, 1]) {
          const mode = a ? fit.v : fit.h;
          if (mode) { const p = layoutProps(n, this, a); if (p) R.size[a] = (mode === 1 ? p[0] : p[1]) - (R.amax[a] - R.amin[a]) * (a ? ph : pw); }
        }
      }
      const w = (R.amax[0] - R.amin[0]) * pw + R.size[0];
      const h = (R.amax[1] - R.amin[1]) * ph + R.size[1];
      const ax = (R.amin[0] + (R.amax[0] - R.amin[0]) * R.pivot[0]) * pw - pp[0] * pw;
      const ay = (R.amin[1] + (R.amax[1] - R.amin[1]) * R.pivot[1]) * ph - pp[1] * ph;
      n.lp[0] = ax + R.pos[0];
      n.lp[1] = ay + R.pos[1];
      n.r = { w, h, x: -R.pivot[0] * w, y: -R.pivot[1] * h };
    } else if (!n.r) n.r = { w: 0, h: 0, x: 0, y: 0 };
    const g = groupOf(n);
    if (g) applyGroup(n, g, this);
    const sl = n.get('Slider');
    if (sl && sl.fillRect && n.scene) {
      // Slider drives its fill rect anchors from the normalized value (Direction 0 LeftToRight, 1 RightToLeft, 2 BottomToTop, 3 TopToBottom)
      const f = n.scene.ref(sl.fillRect);
      const fn = f && f.node ? f.node : f;
      if (fn && fn.rect) {
        const v = sl.max > sl.min ? (sl.value - sl.min) / (sl.max - sl.min) : 0;
        const d = sl.dir || 0;
        fn.rect.amin = d === 1 ? [1 - v, 0] : d === 3 ? [0, 1 - v] : [0, 0];
        fn.rect.amax = d === 0 ? [v, 1] : d === 2 ? [1, v] : [1, 1];
      }
    }
    for (const c of n.children) this.layoutNode(c, n, cv);
  }

  // ----------------------------------------------------------------------------------------------- drawing

  drawCanvas(cv, R) {
    const n = cv.node;
    R.vp = R.uiVP;
    this.clip = null;
    this.drawNode(n, R, 1, null);
    R.flush();
  }

  drawNode(n, R, alpha, clip) {
    if (!n.activeSelf) return;
    const cg = n.get('CanvasGroup');
    if (cg && cg.enabled) alpha = cg.ignoreParent ? cg.alpha : alpha * cg.alpha;
    n.uiAlpha = alpha;
    if (alpha <= 0.001 && !n.children.length) return;
    const rm = n.get('RectMask2D');
    const mk = n.get('Mask');
    let myClip = clip;
    if ((rm && rm.enabled) || (mk && mk.enabled)) {
      const r = this.screenRect(n);
      myClip = clip ? intersect(clip, r) : r;
    }
    // world sprites under a screen-space canvas: a SortingGroup draws its renderers sorted by layer/order
    const sg = n.get('SortingGroup');
    if (sg && sg.enabled) { this.drawSpriteGroup(n, R, alpha); return; }
    for (const c of n.comps) {
      if (!c.enabled) continue;
      if (c.type === 'SpriteRenderer') { this.drawSpriteRenderer(c, R, alpha); continue; }
      // a Mask's own graphic draws unclipped by itself; RectMask2D/Mask clip only the children
      if (c.type === 'Image') { if (!(mk && mk.enabled && !mk.showGraphic)) this.drawImage(n, c, R, alpha, clip); }
      else if (c.type === 'RawImage') this.drawImage(n, c, R, alpha, clip);
      else if (c.type === 'Text') this.drawText(n, c, R, alpha, clip);
    }
    for (const ch of n.children) this.drawNode(ch, R, alpha, myClip);
  }

  drawSpriteRenderer(sr, R, alpha) {
    if (!sr.enabled || !sr.spriteObj || !sr.node.activeInHierarchy || sr.alphaMul === 0) return;
    const keep = sr.alphaMul;
    sr.alphaMul = (keep ?? 1) * alpha;
    this.engine.drawSprite(sr, true);
    sr.alphaMul = keep;
  }

  drawSpriteGroup(n, R, alpha) {
    const L = (id) => this.assets.sortingIndex(id);
    const list = n.inChildren('SpriteRenderer', false).filter((sr) => sr.enabled && sr.node.activeInHierarchy);
    list.forEach((sr, i) => { sr._seq = i; });
    list.sort((a, b) => L(a.layer) - L(b.layer) || a.order - b.order || a._seq - b._seq);
    for (const sr of list) this.drawSpriteRenderer(sr, R, alpha);
  }

  screenRect(n) {
    const r = n.r, m = n.world;
    const p0 = xform(m, r.x, r.y, 0, [0, 0, 0]), p1 = xform(m, r.x + r.w, r.y + r.h, 0, [0, 0, 0]);
    return [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.abs(p1[0] - p0[0]), Math.abs(p1[1] - p0[1])];
  }

  colorOf(n, c, alpha) {
    let col = c.color;
    const btn = n.get('Button') || (n.parent && n.parent.get('Button'));
    let tint = null;
    if (btn && btn.transition === 1 && btn.target && btn.targetComp === c) tint = btn.curTint;
    const r = col[0] * (tint ? tint[0] : 1), g = col[1] * (tint ? tint[1] : 1), b = col[2] * (tint ? tint[2] : 1);
    return packColor(r, g, b, col[3] * alpha * (tint ? tint[3] : 1));
  }

  drawImage(n, c, R, alpha, clip) {
    const r = n.r;
    if (!r || r.w === 0 || r.h === 0) return;
    let s = null, tex = R.white;
    if (c.type === 'RawImage') { s = c.tex && c.tex.startsWith('sprite:') ? this.assets.sprite(c.tex) : null; }
    else s = c.spriteObj !== undefined ? c.spriteObj : (c.spriteObj = this.assets.sprite(c.sprite));
    const btn = n.get('Button');
    if (btn && btn.transition === 2 && btn.state && btn.spriteState[btn.state]) s = this.assets.sprite(btn.spriteState[btn.state]) || s;
    if (s) { tex = R.spriteTex(s); if (!tex) return; }
    const mat = c.mat ? this.assets.material(c.mat) : null;
    const src = mat ? mat.src : 5, dst = mat ? mat.dst : 10;
    R.setState(R.progSprite, tex, src, dst, false, clip ? this.scissorState(clip) : null);
    const col = this.colorOf(n, c, alpha);
    const flash = mat && mat.props && mat.props._FlashAmount ? packColor(...(mat.props._FlashColor || [1, 1, 1]).slice(0, 3), mat.props._FlashAmount) : 0;
    const m = n.world;
    const A = s ? this.assets.spriteData.atlases[s.a] : null;
    const uv = (px, py) => [(s.x + px) / A.w, (s.y + s.h - py) / A.h]; // px,py in trimmed-frame pixels from bottom-left
    let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
    if (c.type === 'RawImage' || !s) {
      const u = c.uv || [0, 0, 1, 1];
      let U0 = 0, V0 = 0, U1 = 1, V1 = 1;
      if (s) { U0 = s.x / A.w; U1 = (s.x + s.w) / A.w; V0 = s.y / A.h; V1 = (s.y + s.h) / A.h; }
      this.quad(R, m, x0, y0, x1, y1, U0 + (U1 - U0) * u[0], V1 - (V1 - V0) * u[1], U0 + (U1 - U0) * (u[0] + u[2]), V1 - (V1 - V0) * (u[1] + u[3]), col, flash);
      return;
    }
    const type = c.imgType || 0;
    if (type === 1 && s.border) return this.sliced(R, m, r, s, A, c, col, flash);
    if (type === 2 && s.border) return this.sliced(R, m, r, s, A, c, col, flash);
    // padding from trimmed transparent margins: the visible frame is a sub-rect of the sprite rect
    if (c.preserveAspect) {
      const ar = s.ow / s.oh, rr = r.w / r.h;
      if (ar > rr) { const nh = r.w / ar; y0 += (r.h - nh) * (n.rect ? n.rect.pivot[1] : 0.5); y1 = y0 + nh; }
      else { const nw = r.h * ar; x0 += (r.w - nw) * (n.rect ? n.rect.pivot[0] : 0.5); x1 = x0 + nw; }
    }
    const fx0 = x0 + (x1 - x0) * (s.ox / s.ow), fx1 = x0 + (x1 - x0) * ((s.ox + s.w) / s.ow);
    const fy0 = y0 + (y1 - y0) * (s.oy / s.oh), fy1 = y0 + (y1 - y0) * ((s.oy + s.h) / s.oh);
    if (type === 3) return this.filled(R, m, fx0, fy0, fx1, fy1, s, A, c, col, flash);
    const [u0, v0] = uv(0, 0), [u1, v1] = uv(s.w, s.h);
    this.quad(R, m, fx0, fy0, fx1, fy1, u0, v0, u1, v1, col, flash);
  }

  scissorState(clip) {
    const k = clip.join();
    if (!this._sc || this._sc.key !== k) this._sc = { scissor: clip.map(Math.round), key: k };
    return this._sc;
  }

  quad(R, m, x0, y0, x1, y1, u0, v0, u1, v1, col, flash) {
    R.reserve(4, 6);
    const p = [0, 0, 0];
    xform(m, x0, y0, 0, p); const a = R.vert(p[0], p[1], 0, u0, v0, col, flash);
    xform(m, x0, y1, 0, p); R.vert(p[0], p[1], 0, u0, v1, col, flash);
    xform(m, x1, y0, 0, p); R.vert(p[0], p[1], 0, u1, v0, col, flash);
    xform(m, x1, y1, 0, p); R.vert(p[0], p[1], 0, u1, v1, col, flash);
    R.quadIdx(a);
  }

  sliced(R, m, r, s, A, c, col, flash) {
    const k = (this.refPpu / (s.ppu || 100)) / (c.ppuMul || 1);
    let [bl, bb, br, bt] = s.border.map((b) => b * k);
    const sx = (bl + br) > r.w ? r.w / (bl + br) : 1, sy = (bb + bt) > r.h ? r.h / (bb + bt) : 1;
    bl *= sx; br *= sx; bb *= sy; bt *= sy;
    const xs = [r.x, r.x + bl, r.x + r.w - br, r.x + r.w], ys = [r.y, r.y + bb, r.y + r.h - bt, r.y + r.h];
    const [L, B, Rr, T] = s.border;
    const us = [s.x, s.x + L, s.x + s.w - Rr, s.x + s.w].map((v) => v / A.w);
    const vs = [s.y + s.h, s.y + s.h - B, s.y + T, s.y].map((v) => v / A.h);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      if (i === 1 && j === 1 && c.fillCenter === 0) continue;
      if (xs[i + 1] - xs[i] <= 0 || ys[j + 1] - ys[j] <= 0) continue;
      this.quad(R, m, xs[i], ys[j], xs[i + 1], ys[j + 1], us[i], vs[j], us[i + 1], vs[j + 1], col, flash);
    }
  }

  filled(R, m, x0, y0, x1, y1, s, A, c, col, flash) {
    const amt = Math.max(0, Math.min(1, c.fillAmount ?? 1));
    if (amt <= 0) return;
    const U0 = s.x / A.w, U1 = (s.x + s.w) / A.w, V0 = (s.y + s.h) / A.h, V1 = s.y / A.h;
    const pt = (fx, fy) => [x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy, U0 + (U1 - U0) * fx, V0 + (V1 - V0) * fy];
    const method = c.fillMethod ?? 4, origin = c.fillOrigin || 0;
    if (method === 0 || method === 1) {
      let a = 0, b = 1;
      if (method === 0) { if (origin === 0) b = amt; else a = 1 - amt; }
      else { if (origin === 0) b = amt; else a = 1 - amt; }
      const q = method === 0 ? [pt(a, 0), pt(b, 1)] : [pt(0, a), pt(1, b)];
      this.quad(R, m, q[0][0], q[0][1], q[1][0], q[1][1], q[0][2], q[0][3], q[1][2], q[1][3], col, flash);
      return;
    }
    // radial: polygon fan from the centre (360) or corner (90) / edge midpoint (180)
    const cw = c.fillClockwise !== 0;
    let cx, cy, start, span;
    if (method === 4) { cx = 0.5; cy = 0.5; span = Math.PI * 2; start = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][origin] ?? Math.PI / 2; }
    else if (method === 3) { const o = [[0.5, 0, 0], [0, 0.5, -Math.PI / 2], [0.5, 1, Math.PI], [1, 0.5, Math.PI / 2]][origin] || [0.5, 0, 0]; cx = o[0]; cy = o[1]; span = Math.PI; start = o[2] + (cw ? Math.PI : 0); }
    else { const o = [[0, 0, Math.PI / 2], [0, 1, 0], [1, 1, -Math.PI / 2], [1, 0, Math.PI]][origin] || [0, 0, Math.PI / 2]; cx = o[0]; cy = o[1]; span = Math.PI / 2; start = o[2]; }
    const steps = Math.max(4, Math.ceil(48 * amt * span / (Math.PI * 2)));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const ang = start + (cw ? -1 : 1) * span * amt * (i / steps);
      // project the ray from the centre onto the unit square
      const dx = Math.cos(ang), dy = Math.sin(ang);
      let t = Infinity;
      if (dx > 1e-6) t = Math.min(t, (1 - cx) / dx); else if (dx < -1e-6) t = Math.min(t, -cx / dx);
      if (dy > 1e-6) t = Math.min(t, (1 - cy) / dy); else if (dy < -1e-6) t = Math.min(t, -cy / dy);
      pts.push(pt(cx + dx * t, cy + dy * t));
    }
    const C = pt(cx, cy);
    R.reserve(pts.length + 1, pts.length * 3);
    const p = [0, 0, 0];
    xform(m, C[0], C[1], 0, p);
    const ci = R.vert(p[0], p[1], 0, C[2], C[3], col, flash);
    let prev = -1;
    for (const q of pts) {
      xform(m, q[0], q[1], 0, p);
      const vi = R.vert(p[0], p[1], 0, q[2], q[3], col, flash);
      if (prev >= 0) R.tri(ci, prev, vi);
      prev = vi;
    }
  }

  drawText(n, c, R, alpha, clip) {
    const f = this.assets.fontSync(c.font);
    if (!f || !n.r) return;
    if (!c._cache || c._cache.text !== c.text || c._cache.w !== n.r.w || c._cache.h !== n.r.h || c.dirty) {
      c._cache = { text: c.text, w: n.r.w, h: n.r.h, b: buildText(f, c, n.r.w, n.r.h) };
      c.dirty = false;
    }
    drawTextQuads(R, f, c, c._cache.b, n.world, n.r.x, n.r.y, alpha, clip ? this.scissorState(clip) : null, false);
  }

  // ----------------------------------------------------------------------------------------------- input

  // pointer in canvas pixels (y up). Returns the topmost raycast target node under the point.
  raycast(px, py) {
    let hit = null;
    const visit = (n, alpha) => {
      if (!n.activeSelf) return;
      const cg = n.get('CanvasGroup');
      if (cg && cg.enabled && !cg.blocks) return;
      for (const c of n.comps) {
        if (!c.enabled || !(c.type === 'Image' || c.type === 'Text' || c.type === 'RawImage') || !c.raycast) continue;
        if (!n.r) continue;
        const inv = invert(mat4(), n.world);
        const p = xform(inv, px, py, 0, [0, 0, 0]);
        if (p[0] >= n.r.x && p[0] <= n.r.x + n.r.w && p[1] >= n.r.y && p[1] <= n.r.y + n.r.h) hit = n;
      }
      for (const ch of n.children) visit(ch);
    };
    for (const cv of this.engine.canvases.slice().sort((a, b) => a.order - b.order)) if (cv.enabled && cv.node.activeInHierarchy && cv.mode !== 2) visit(cv.node);
    return hit;
  }

  handler(n, type) {
    for (let p = n; p; p = p.parent) for (const c of p.comps) if (c.enabled && c.type === type) return c;
    return null;
  }
}

export function drawTextQuads(R, f, c, b, m, ox, oy, alpha, scissor, depth) {
  const mat = (c.mat && R.assets.material(c.mat)) || f.material || { props: {} };
  const P = mat.props || {};
  const img = f.images[0];
  if (!img) return;
  const tex = R.imageTex('font:' + f.name, img, false);
  const aw = f.aw, ah = f.ah;
  const ratioA = P._ScaleRatioA ?? 1, ratioC = P._ScaleRatioC ?? 1, grad = P._GradientScale ?? 10;
  const ulOn = (mat.kw || []).includes('UNDERLAY_ON') ? 1 : 0;
  const extra = mat._sdfExtra || (mat._sdfExtra = {
    key: mat.key,
    uniforms(gl, u) {
      gl.uniform2f(u.uTexSize, aw, ah);
      gl.uniform1f(u.uGrad, grad);
      gl.uniform4fv(u.uFace, P._FaceColor || [1, 1, 1, 1]);
      gl.uniform4fv(u.uOutCol, P._OutlineColor || [0, 0, 0, 1]);
      gl.uniform1f(u.uOutW, (P._OutlineWidth || 0) * ratioA * 0.5);
      gl.uniform1f(u.uSoft, (P._OutlineSoftness || 0) * ratioA * 0.5);
      gl.uniform1f(u.uDilate, (P._FaceDilate || 0) * ratioA * 0.5);
      gl.uniform4fv(u.uUlCol, P._UnderlayColor || [0, 0, 0, 0.5]);
      gl.uniform2f(u.uUlOff, -(P._UnderlayOffsetX || 0) * ratioC * grad / aw, (P._UnderlayOffsetY || 0) * ratioC * grad / ah);
      gl.uniform1f(u.uUlDilate, (P._UnderlayDilate || 0) * ratioC * 0.5);
      gl.uniform1f(u.uUlSoft, (P._UnderlaySoftness || 0) * ratioC * 0.5);
      gl.uniform1f(u.uUlOn, ulOn);
    },
  });
  let ex = extra;
  if (scissor) {
    extra._sc = extra._sc || new Map();
    ex = extra._sc.get(scissor.key);
    if (!ex) { ex = Object.assign(Object.create(extra), { scissor: scissor.scissor, key: extra.key + scissor.key }); extra._sc.set(scissor.key, ex); }
  }
  R.setState(R.progSdf, tex, 1, 10, depth, ex);
  const col = c.color;
  const p = [0, 0, 0];
  const wb = (f.weights?.bold ?? 0.75);
  for (const q of b.quads) {
    const cc = q.color || col;
    const pc = packColor(cc[0], cc[1], cc[2], cc[3] * (q.color ? col[3] : 1) * alpha);
    const u0 = q.u0 / aw, u1 = q.u1 / aw, v0 = 1 - q.v0 / ah, v1 = 1 - q.v1 / ah;
    const e = q.bold ? wb : 0;
    R.reserve(4, 6);
    xform(m, ox + q.x0, oy + q.y0, 0, p); const a = R.vert(p[0], p[1], p[2], u0, v0, pc, 0, e);
    xform(m, ox + q.x0, oy + q.y1, 0, p); R.vert(p[0], p[1], p[2], u0, v1, pc, 0, e);
    xform(m, ox + q.x1, oy + q.y0, 0, p); R.vert(p[0], p[1], p[2], u1, v0, pc, 0, e);
    xform(m, ox + q.x1, oy + q.y1, 0, p); R.vert(p[0], p[1], p[2], u1, v1, pc, 0, e);
    R.quadIdx(a);
  }
}

function intersect(a, b) {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
}

export { mul };
