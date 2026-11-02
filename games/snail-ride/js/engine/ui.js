// DOM renderer for Unity uGUI trees (data/scene.json nodes): RectTransform math, Image, Text,
// Button, layout groups, ContentSizeFitter, CanvasGroup, Mask, ScrollRect, Slider, SafeArea.
// Everything is laid out in canvas units inside one scaled div per Canvas root.
import { A, spriteURL, spriteCanvas, spriteInfo, spriteByName, tr } from './assets.js?v=20261102c';

const CSS_URL = new URL('../../css/ui.css', import.meta.url).href;
const FONT_URL = new URL('../../art/fonts/linotte-bold.ttf', import.meta.url).href;
export const UI_FONT = 'Linotte Bold';

const POINTER_DOWN_SCRIPTS = new Set(['PlayerController', 'AudioClick']);
const DRAG_SCRIPTS = new Set(['HorizontalScrollSnap']);
const SELECTABLES = ['Button', 'Toggle', 'Slider', 'Scrollbar', 'Dropdown', 'InputField'];
const BUTTON_STATES = ['Normal', 'Highlighted', 'Pressed', 'Disabled'];
const DRAG_THRESHOLD = 8; // CSS px

// ---------- small helpers ----------
const fmt = v => (Math.abs(v) < 1e-4 ? 0 : Math.round(v * 1000) / 1000);
const v2 = (d, dx = 0, dy = 0) => (d ? [d.x ?? dx, d.y ?? dy] : [dx, dy]);
const col = c => (Array.isArray(c) ? [c[0], c[1], c[2], c[3] ?? 1] : c ? [c.r ?? 1, c.g ?? 1, c.b ?? 1, c.a ?? 1] : [1, 1, 1, 1]);
const refOf = v => (v && typeof v === 'object' && '$' in v ? v.$ : (typeof v === 'string' ? v : null));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const AX = ['x', 'y', 'z', 'w'];
const rgbCss = (r, g, b) => `rgb(${Math.round(clamp(r, 0, 1) * 255)},${Math.round(clamp(g, 0, 1) * 255)},${Math.round(clamp(b, 0, 1) * 255)})`;
const rgbaCss = c => `rgba(${Math.round(clamp(c[0], 0, 1) * 255)},${Math.round(clamp(c[1], 0, 1) * 255)},${Math.round(clamp(c[2], 0, 1) * 255)},${fmt(clamp(c[3], 0, 1))})`;

function quatToEuler(q) { // Unity order (Z, X, Y): R = Ry * Rx * Rz, degrees
  const [x, y, z, w] = q;
  const sx = clamp(2 * (w * x - y * z), -1, 1);
  const D = 180 / Math.PI;
  return [Math.asin(sx) * D, Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y)) * D, Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z)) * D];
}

let cssPromise = null;
function ensureCss() {
  if (cssPromise) return cssPromise;
  const existing = [...document.querySelectorAll('link[rel=stylesheet]')].find(l => (l.href || '').split('?')[0].endsWith('/css/ui.css'));
  if (existing) return (cssPromise = existing.sheet ? Promise.resolve() : new Promise(r => { existing.addEventListener('load', r); existing.addEventListener('error', r); setTimeout(r, 3000); }));
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = CSS_URL;
  cssPromise = new Promise(r => { l.onload = r; l.onerror = () => { console.warn('ui.css failed to load'); r(); }; setTimeout(r, 3000); });
  document.head.appendChild(l);
  return cssPromise;
}

let fontPromise = null;
function ensureFont() {
  if (fontPromise) return fontPromise;
  if (!document.fonts || typeof FontFace === 'undefined') return (fontPromise = Promise.resolve());
  for (const f of document.fonts) if (f.family.replace(/["']/g, '') === UI_FONT && f.status === 'loaded') return (fontPromise = Promise.resolve());
  const ff = new FontFace(UI_FONT, `url("${FONT_URL}")`);
  document.fonts.add(ff);
  fontPromise = ff.load().then(() => {}, e => console.error('ui font failed to load', e));
  return fontPromise;
}

// Sprite tinting: multiply rgb into a cached canvas copy (alpha handled by opacity).
const tintQ = v => Math.round(clamp(v, 0, 1) * 127) / 127;
const isWhite = (r, g, b) => tintQ(r) === 1 && tintQ(g) === 1 && tintQ(b) === 1;
const tintCanvasCache = new Map(), tintCache = new Map(), tintReady = new Map();
const toBlobURL = c => new Promise(res => c.toBlob(bl => res(URL.createObjectURL(bl))));
const tintKey = (key, r, g, b) => `${key}|${tintQ(r)},${tintQ(g)},${tintQ(b)}`;
function tintedCanvas(key, r, g, b) {
  const k = tintKey(key, r, g, b);
  if (isWhite(r, g, b)) {
    if (!tintCanvasCache.has(k)) tintCanvasCache.set(k, spriteCanvas(key).then(c => { tintReady.set(k, c); return c; }));
    return tintCanvasCache.get(k);
  }
  const R = tintQ(r), G = tintQ(g), B = tintQ(b);
  if (!tintCanvasCache.has(k)) {
    tintCanvasCache.set(k, spriteCanvas(key).then(src => {
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const g2 = c.getContext('2d');
      g2.drawImage(src, 0, 0);
      g2.globalCompositeOperation = 'multiply';
      g2.fillStyle = rgbCss(R, G, B);
      g2.fillRect(0, 0, c.width, c.height);
      g2.globalCompositeOperation = 'destination-in';
      g2.drawImage(src, 0, 0);
      tintReady.set(k, c);
      return c;
    }));
  }
  return tintCanvasCache.get(k);
}
function tintedURL(key, r, g, b) {
  if (isWhite(r, g, b)) return spriteURL(key);
  const k = `${key}|${tintQ(r)},${tintQ(g)},${tintQ(b)}`;
  if (!tintCache.has(k)) tintCache.set(k, tintedCanvas(key, r, g, b).then(toBlobURL));
  return tintCache.get(k);
}
function resolveSpriteKey(v) {
  const k = refOf(v);
  if (!k) return null;
  if (A.art && A.art.sprites[k]) return k;
  return (A.art && spriteByName(k)) || k;
}

// ---------- rich text ----------
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NAMED = { aqua: '#00ffff', black: '#000000', blue: '#0000ff', brown: '#a52a2a', cyan: '#00ffff', darkblue: '#0000a0', fuchsia: '#ff00ff', green: '#008000', grey: '#808080', lightblue: '#add8e6', lime: '#00ff00', magenta: '#ff00ff', maroon: '#800000', navy: '#000080', olive: '#808000', orange: '#ffa500', purple: '#800080', red: '#ff0000', silver: '#c0c0c0', teal: '#008080', white: '#ffffff', yellow: '#ffff00' };
function cssColorOf(v) {
  v = (v || '').trim().replace(/^["']|["']$/g, '');
  if (NAMED[v.toLowerCase()]) return NAMED[v.toLowerCase()];
  const m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (!m) return null;
  const h = m[1];
  if (h.length === 8) return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${fmt(parseInt(h.slice(6, 8), 16) / 255)})`;
  return '#' + h;
}
export function richToHTML(s, rich = true) {
  s = String(s ?? '');
  if (!rich) return esc(s);
  const re = /<(\/?)(b|i|size|color|material|quad)(?:=([^>]*))?>/gi;
  let out = '', last = 0, m;
  const stack = [];
  while ((m = re.exec(s))) {
    out += esc(s.slice(last, m.index));
    last = re.lastIndex;
    const close = !!m[1], tag = m[2].toLowerCase(), val = m[3];
    if (tag === 'quad') continue;
    if (close) {
      const i = stack.lastIndexOf(tag);
      if (i < 0) { out += esc(m[0]); continue; }
      while (stack.length > i) { stack.pop(); out += '</span>'; }
      continue;
    }
    let style = '';
    if (tag === 'b') style = 'font-weight:bold';
    else if (tag === 'i') style = 'font-style:italic';
    else if (tag === 'size') { const n = parseFloat(val); if (!(n > 0)) { out += esc(m[0]); continue; } style = `font-size:${n}px`; }
    else if (tag === 'color') { const c = cssColorOf(val); if (!c) { out += esc(m[0]); continue; } style = `color:${c}`; }
    stack.push(tag);
    out += `<span style="${style}">`;
  }
  out += esc(s.slice(last));
  while (stack.length) { stack.pop(); out += '</span>'; }
  return out;
}

// ---------- global id -> type index for button call targets ----------
let globalIndex = null;
function globalTypeOf(id) {
  if (!globalIndex) {
    globalIndex = new Map();
    const walk = n => {
      globalIndex.set(n.id, 'GameObject');
      for (const c of n.c || []) globalIndex.set(c.id, c.type);
      for (const ch of n.ch || []) walk(ch);
    };
    if (A.scene) {
      for (const roots of Object.values(A.scene.scenes || {})) for (const r of roots) walk(r);
      for (const p of Object.values(A.scene.prefabs || {})) walk(p);
    }
  }
  if (globalIndex.has(id)) return globalIndex.get(id);
  const o = A.scene && A.scene.objects && A.scene.objects[id];
  return o ? o.type : null;
}

// ---------- text measurement ----------
class Measurer {
  constructor() {
    this.cache = new Map();
    this.el = document.createElement('div');
    this.el.className = 'ui-measure';
    this.el.style.cssText = `position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none;font-family:"${UI_FONT}";font-weight:normal;font-kerning:normal;text-rendering:geometricPrecision;contain:layout style;`;
    document.body.appendChild(this.el);
  }
  clear() { this.cache.clear(); }
  // width=null: unwrapped (preferred width); width=n: wrapped at n canvas units
  measure(html, size, ls, fstyle, width) {
    if (!html) return [0, 0];
    const key = `${size}|${ls}|${fstyle}|${width}|${html}`;
    let r = this.cache.get(key);
    if (r) return r;
    const e = this.el;
    e.style.fontSize = size + 'px';
    e.style.lineHeight = String(ls);
    e.style.fontWeight = fstyle & 1 ? 'bold' : 'normal';
    e.style.fontStyle = fstyle & 2 ? 'italic' : 'normal';
    if (width == null) { e.style.whiteSpace = 'pre'; e.style.width = 'max-content'; }
    else { e.style.whiteSpace = 'pre-wrap'; e.style.overflowWrap = 'break-word'; e.style.width = Math.max(0, width) + 'px'; }
    e.innerHTML = html;
    const b = e.getBoundingClientRect();
    let w = b.width;
    if (width != null) { // actual used width of wrapped text = widest line
      e.style.width = 'max-content'; e.style.maxWidth = Math.max(0, width) + 'px';
      w = e.getBoundingClientRect().width;
      e.style.maxWidth = '';
    }
    r = [Math.ceil(w * 64) / 64, Math.ceil(b.height * 64) / 64];
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, r);
    return r;
  }
}

// ---------- UINode ----------
let nodeSeq = 0;
export class UINode {
  constructor(ui, node, parent, tree) {
    this.ui = ui; this.node = node; this.name = node.name; this.id = node.id;
    this.parent = parent; this.children = []; this.tree = tree;
    this.uid = ++nodeSeq;
    this.compList = (node.c || []).map(c => ({ ...c })); // per-instance copies: game scripts attach state to components
    this.comps = {};
    for (const c of this.compList) if (!(c.type in this.comps)) this.comps[c.type] = c;
    this.active = node.active !== false && node.active !== 0;
    this.canvas = parent ? parent.canvas : this;
    const rt = this.comps.RectTransform || {};
    const q = rt.m_LocalRotation ? [rt.m_LocalRotation.x, rt.m_LocalRotation.y, rt.m_LocalRotation.z, rt.m_LocalRotation.w] : [0, 0, 0, 1];
    const s = rt.m_LocalScale;
    this.rt = {
      amin: v2(rt.m_AnchorMin, 0.5, 0.5), amax: v2(rt.m_AnchorMax, 0.5, 0.5), pivot: v2(rt.m_Pivot, 0.5, 0.5),
      apos: v2(rt.m_AnchoredPosition), sd: v2(rt.m_SizeDelta, 100, 100),
      scale: s ? [s.x, s.y, s.z ?? 1] : [1, 1, 1], euler: quatToEuler(q), quat: q,
      lz: rt.m_LocalPosition ? rt.m_LocalPosition.z || 0 : 0,
    };
    this.baseRt = null; // SafeArea keeps the authored values here
    this._s = [0, 0]; this._x = 0; this._y = 0;
    this._lg = [null, null];
    this.tint = [1, 1, 1, 1]; this.spriteOverride = undefined;
    this.state = 'Normal';
    this.onClick = null; this.onState = null;
    this.onBeginDrag = null; this.onDrag = null; this.onEndDrag = null; this.onScroll = null;

    const el = this.el = document.createElement('div');
    el.className = 'ui-n';
    el._ui = this;
    if (ui.debugNames) el.dataset.name = this.name;

    this.hasPointerScript = this.compList.some(c => POINTER_DOWN_SCRIPTS.has(c.type) || (tree.opts.pointerScripts && tree.opts.pointerScripts.includes(c.type)));
    this.hasDragScript = this.compList.some(c => DRAG_SCRIPTS.has(c.type));
    this.isSelectable = SELECTABLES.some(t => this.comps[t]);

    // Graphic
    const img = this.comps.Image, txt = this.comps.Text, claim = this.comps.RaycastClaim;
    if (img) {
      this.img = {
        sprite: resolveSpriteKey(img.m_Sprite), color: col(img.m_Color), type: img.m_Type | 0, preserve: !!img.m_PreserveAspect,
        fillMethod: img.m_FillMethod ?? 4, fillAmount: img.m_FillAmount ?? 1, fillOrigin: img.m_FillOrigin | 0,
        clockwise: img.m_FillClockwise !== 0, fillCenter: img.m_FillCenter !== 0, enabled: img.m_Enabled !== 0, ray: !!img.m_RaycastTarget,
      };
    } else if (txt) {
      const fd = txt.m_FontData || {};
      this.txt = {
        text: txt.m_Text ?? '', size: fd.m_FontSize ?? 14, fstyle: fd.m_FontStyle | 0, bestFit: !!fd.m_BestFit,
        min: fd.m_MinSize ?? 10, max: fd.m_MaxSize ?? 40, align: fd.m_Alignment | 0, rich: fd.m_RichText !== 0,
        ls: fd.m_LineSpacing ?? 1, wrap: !fd.m_HorizontalOverflow, vOverflow: !!fd.m_VerticalOverflow,
        color: col(txt.m_Color), enabled: txt.m_Enabled !== 0, ray: !!txt.m_RaycastTarget, html: null, curSize: 0,
      };
    } else if (claim) {
      this.claim = { enabled: claim.m_Enabled !== 0, ray: claim.m_RaycastTarget !== 0 };
    }
    if (this.img || this.txt || this.claim) {
      this.gfx = document.createElement('div');
      this.gfx.className = 'ui-g';
      el.appendChild(this.gfx);
      if (this.txt) {
        this.gfx.classList.add('ui-text');
        this.inner = document.createElement('div');
        this.inner.className = 'ui-tx';
        this.gfx.appendChild(this.inner);
      }
    }
    const mask = this.comps.Mask, rm = this.comps.RectMask2D;
    if ((mask && mask.m_Enabled !== 0) || (rm && rm.m_Enabled !== 0)) el.classList.add('ui-mask');
    const cg = this.comps.CanvasGroup;
    if (cg) this.cg = { alpha: cg.m_Alpha ?? 1, interactable: cg.m_Interactable !== false && cg.m_Interactable !== 0, blocks: cg.m_BlocksRaycasts !== false && cg.m_BlocksRaycasts !== 0, ignoreParent: !!cg.m_IgnoreParentGroups };
    const sl = this.comps.Slider;
    if (sl) this.slider = { value: sl.m_Value ?? 0, min: sl.m_MinValue ?? 0, max: sl.m_MaxValue ?? 1, dir: sl.m_Direction | 0, fill: refOf(sl.m_FillRect), whole: !!sl.m_WholeNumbers };
    if (this.comps.Button) this.btn = this.comps.Button;
    if (this.comps.ScrollRect) {
      const sr = this.comps.ScrollRect;
      this.scroll = {
        content: refOf(sr.m_Content), viewport: refOf(sr.m_Viewport), horizontal: !!sr.m_Horizontal, vertical: !!sr.m_Vertical,
        movement: sr.m_MovementType ?? 1, elasticity: sr.m_Elasticity ?? 0.1, inertia: !!sr.m_Inertia, decel: sr.m_DecelerationRate ?? 0.135,
        velocity: [0, 0], dragging: false, enabled: sr.m_Enabled !== 0,
      };
    }
    if (this.comps.SafeArea) this.safe = true;
  }

  // ----- tree queries -----
  find(path) {
    let n = this;
    for (const part of String(path).split('/')) {
      if (!part) continue;
      n = n.children.find(c => c.name === part);
      if (!n) return null;
    }
    return n;
  }
  findAll(name, out = []) {
    for (const c of this.children) { if (c.name === name) out.push(c); c.findAll(name, out); }
    return out;
  }
  findComp(typeName) {
    if (this.comps[typeName]) return this;
    for (const c of this.children) { const r = c.findComp(typeName); if (r) return r; }
    return null;
  }
  findAllComp(typeName, out = []) {
    if (this.comps[typeName]) out.push(this);
    for (const c of this.children) c.findAllComp(typeName, out);
    return out;
  }
  findById(id) { // node id or component id inside this instantiation (searches enclosing instantiations too)
    for (let t = this.tree; t; t = t.parentTree) { const n = t.byId.get(id); if (n) return n; }
    return null;
  }
  walk(fn) { fn(this); for (const c of this.children) c.walk(fn); }
  get path() { return this.parent ? (this.parent.parent ? this.parent.path + '/' : '') + this.name : this.name; }
  get activeInHierarchy() { for (let n = this; n; n = n.parent) if (!n.active) return false; return !this.destroyed; }

  // ----- state changes -----
  _layoutDirty() { this.ui._markLayout(this.canvas); }
  _gfxDirty() { this.ui._markGfx(this); }
  _posDirty() { if (this.parent) this.ui._markPos(this); else this._layoutDirty(); }

  setActive(b) {
    b = !!b;
    if (b === this.active) return;
    this.active = b;
    this.el.style.display = b ? '' : 'none';
    this._layoutDirty();
  }
  destroy() {
    if (this.destroyed) return;
    if (this.host) { const h = this.host; this.host = null; h.destroy(); return; }
    this.walk(n => { n.destroyed = true; if (n.scroll) this.ui._scrolls.delete(n); });
    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.el.remove();
      this._layoutDirty();
    } else {
      this.ui._removeCanvas(this);
    }
  }
  setSiblingIndex(i) {
    const p = this.parent;
    if (!p) return;
    const arr = p.children, cur = arr.indexOf(this);
    arr.splice(cur, 1);
    i = clamp(i < 0 ? arr.length + 1 + i : i, 0, arr.length);
    arr.splice(i, 0, this);
    const next = arr[i + 1];
    p.el.insertBefore(this.el, next ? next.el : null);
    this._layoutDirty();
  }
  setAsLastSibling() { this.setSiblingIndex(-1); }
  setAsFirstSibling() { this.setSiblingIndex(0); }

  _textNode() { return this.txt ? this : this.children.length ? this.findComp('Text') : null; }
  setText(str) {
    const n = this._textNode();
    if (!n) return;
    str = String(str ?? '');
    if (n.txt.text === str) return;
    n.txt.text = str; n.txt.html = null;
    n._gfxDirty(); n._layoutDirty();
  }
  getText() { const n = this._textNode(); return n ? n.txt.text : ''; }
  setSprite(spriteKey) {
    if (!this.img) return;
    const k = resolveSpriteKey(spriteKey);
    if (k === this.img.sprite) return;
    this.img.sprite = k;
    this._gfxDirty(); this._layoutDirty();
  }
  setColor(c) {
    const g = this.img || this.txt;
    if (!g) return;
    g.color = col(c);
    this._gfxDirty();
  }
  getColor() { const g = this.img || this.txt; return g ? g.color.slice() : null; }
  // CanvasGroup alpha if the node has one, otherwise the graphic's color alpha.
  setAlpha(a) {
    if (this.cg) { this.cg.alpha = a; this._applyGroup(); return; }
    const g = this.img || this.txt;
    if (!g) return;
    g.color[3] = a;
    this._gfxDirty();
  }
  setFill(amount) {
    if (this.img) { this.img.fillAmount = clamp(amount, 0, 1); this._gfxDirty(); }
    else if (this.slider) this.setSliderValue(lerp(this.slider.min, this.slider.max, amount));
  }
  setSliderValue(v) {
    if (!this.slider) return;
    const s = this.slider;
    v = clamp(v, Math.min(s.min, s.max), Math.max(s.min, s.max));
    if (s.whole) v = Math.round(v);
    s.value = v;
    this._layoutDirty();
  }
  setLocalScale(x, y, z) {
    const s = this.rt.scale;
    s[0] = x; s[1] = y ?? x; if (z != null) s[2] = z;
    this._posDirty();
  }
  setLocalEulerZ(deg) { this.rt.euler[2] = deg; this._posDirty(); }
  setLocalEuler(x, y, z) { this.rt.euler = [x, y, z]; this._posDirty(); }
  setAnchoredPos(x, y) {
    const p = this.rt.apos;
    if (x != null) p[0] = x;
    if (y != null) p[1] = y;
    this._posDirty();
  }
  getAnchoredPos() { return this.rt.apos.slice(); }
  setSizeDelta(x, y) {
    const s = this.rt.sd;
    if (x != null) s[0] = x;
    if (y != null) s[1] = y;
    this._layoutDirty();
  }
  setAnchors(minX, minY, maxX, maxY) { this.rt.amin = [minX, minY]; this.rt.amax = [maxX ?? minX, maxY ?? minY]; this._layoutDirty(); }
  setPivot(x, y) { this.rt.pivot = [x, y]; this._layoutDirty(); }
  setOffsetMin(x, y) { // Unity RectTransform.offsetMin setter
    const r = this.rt, o = [x - (r.apos[0] - r.sd[0] * r.pivot[0]), y - (r.apos[1] - r.sd[1] * r.pivot[1])];
    for (let i = 0; i < 2; i++) { r.sd[i] -= o[i]; r.apos[i] += o[i] * (1 - r.pivot[i]); }
    this._layoutDirty();
  }
  setOffsetMax(x, y) {
    const r = this.rt, o = [x - (r.apos[0] + r.sd[0] * (1 - r.pivot[0])), y - (r.apos[1] + r.sd[1] * (1 - r.pivot[1]))];
    for (let i = 0; i < 2; i++) { r.sd[i] += o[i]; r.apos[i] += o[i] * r.pivot[i]; }
    this._layoutDirty();
  }
  setInteractable(b) {
    b = !!b;
    const sel = this.btn || this.comps.Slider || this.comps.Toggle;
    if (sel) { sel.m_Interactable = b ? 1 : 0; this._setState(b ? 'Normal' : 'Disabled'); }
    else if (this.cg) this.cg.interactable = b;
  }
  get interactable() {
    const sel = this.btn || this.comps.Slider || this.comps.Toggle;
    if (sel && !sel.m_Interactable) return false;
    for (let n = this; n; n = n.parent) {
      if (n.cg) { if (!n.cg.interactable) return false; if (n.cg.ignoreParent) break; }
    }
    return true;
  }
  setSortingOrder(n) { if (this.layer) { this.sortingOrder = n; this.layer.style.zIndex = String(n); } }

  // Rect in canvas units, y down from the canvas top-left (axis aligned bounds after rotation/scale).
  rect() {
    this.ui.layout();
    const pts = [[0, 0], [this._s[0], 0], [0, this._s[1]], [this._s[0], this._s[1]]];
    for (let n = this; n && n.parent; n = n.parent) {
      const r = n.rt, ox = r.pivot[0] * n._s[0], oy = (1 - r.pivot[1]) * n._s[1];
      const a = -r.euler[2] * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      for (const p of pts) {
        const x = (p[0] - ox) * r.scale[0], y = (p[1] - oy) * r.scale[1];
        p[0] = n._x + ox + x * ca - y * sa; p[1] = n._y + oy + x * sa + y * ca;
      }
    }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  screenRect() { return this.el.getBoundingClientRect(); }

  // ----- ScrollRect API (on the node that has the ScrollRect) -----
  get scrollContent() { return this.scroll ? this.findById(this.scroll.content) : null; }
  getScrollOffset() { const c = this.scrollContent; return c ? c.rt.apos.slice() : [0, 0]; }
  setScrollOffset(x, y) { const c = this.scrollContent; if (c) { c.setAnchoredPos(x, y); this.ui._fireScroll(this); } }
  stopScroll() { if (this.scroll) this.scroll.velocity = [0, 0]; }
  getScrollNormalized() { return this.ui._scrollNormalized(this); }
  setScrollNormalized(nx, ny) { this.ui._setScrollNormalized(this, nx, ny); }

  // ----- generic property access for animation curves -----
  // setProp(type, 'm_LocalScale.x', v) or setProp(type, 'scale', v, compIndex)
  setProp(type, prop, value, comp) {
    if (typeof comp === 'number') prop = `${prop}.${AX[comp]}`;
    const [base, sub] = splitProp(prop);
    const i = sub ? AX.indexOf(sub) : -1;
    const r = this.rt;
    switch (type) {
      case 'GameObject':
        if (base === 'm_IsActive') this.setActive(!!value);
        return;
      case 'Transform': case 'RectTransform':
        switch (base) {
          case 'scale': case 'm_LocalScale': r.scale[i] = value; this._posDirty(); return;
          case 'euler': case 'localEulerAnglesRaw': case 'm_LocalEulerAnglesHint': case 'localEulerAngles': case 'localEulerAnglesBaked':
            r.euler[i] = value; this._posDirty(); return;
          case 'rotation': case 'm_LocalRotation': r.quat[i] = value; r.euler = quatToEuler(r.quat); this._posDirty(); return;
          case 'position': case 'm_LocalPosition': this._setLocalPos(i, value); return;
          case 'm_AnchoredPosition': r.apos[i] = value; this._posDirty(); return;
          case 'm_SizeDelta': r.sd[i] = value; this._layoutDirty(); return;
          case 'm_AnchorMin': r.amin[i] = value; this._layoutDirty(); return;
          case 'm_AnchorMax': r.amax[i] = value; this._layoutDirty(); return;
          case 'm_Pivot': r.pivot[i] = value; this._layoutDirty(); return;
        }
        break;
      case 'Image': case 'Text': {
        const g = type === 'Image' ? this.img : this.txt;
        if (!g) return;
        if (base === 'm_Color') { g.color['rgba'.indexOf(sub)] = value; this._gfxDirty(); return; }
        if (base === 'm_Enabled') { g.enabled = !!value; this._gfxDirty(); this._layoutDirty(); return; }
        if (base === 'm_Sprite' && this.img) { this.setSprite(value); return; }
        if (base === 'm_FillAmount' && this.img) { this.setFill(value); return; }
        if (base === 'm_Text' && this.txt) { this.setText(value); return; }
        if (base === 'm_FontData' && this.txt && sub) { /* m_FontData.m_FontSize */ }
        if ((base === 'm_FontSize' || prop === 'm_FontData.m_FontSize') && this.txt) { this.txt.size = value; this._gfxDirty(); this._layoutDirty(); return; }
        break;
      }
      case 'CanvasGroup':
        if (!this.cg) return;
        if (base === 'm_Alpha') this.cg.alpha = value;
        else if (base === 'm_Interactable') this.cg.interactable = !!value;
        else if (base === 'm_BlocksRaycasts') this.cg.blocksRaycasts = this.cg.blocks = !!value;
        this._applyGroup();
        return;
      case 'Button':
        if (base === 'm_Interactable') { this.setInteractable(!!value); return; }
        break;
      case 'Slider':
        if (base === 'm_Value') { this.setSliderValue(value); return; }
        break;
      case 'Mask': case 'RectMask2D':
        if (base === 'm_Enabled') { this.el.classList.toggle('ui-mask', !!value); return; }
        break;
    }
    const c = this.comps[type];
    if (c) { if (sub && c[base] && typeof c[base] === 'object') c[base][sub] = value; else c[base] = value; this._layoutDirty(); }
  }
  getProp(type, prop, comp) {
    if (typeof comp === 'number') prop = `${prop}.${AX[comp]}`;
    const [base, sub] = splitProp(prop);
    const i = sub ? AX.indexOf(sub) : -1;
    const r = this.rt;
    switch (type) {
      case 'GameObject': if (base === 'm_IsActive') return this.active ? 1 : 0; break;
      case 'Transform': case 'RectTransform':
        switch (base) {
          case 'scale': case 'm_LocalScale': return r.scale[i];
          case 'euler': case 'localEulerAnglesRaw': case 'm_LocalEulerAnglesHint': case 'localEulerAngles': case 'localEulerAnglesBaked': return r.euler[i];
          case 'rotation': case 'm_LocalRotation': return r.quat[i];
          case 'position': case 'm_LocalPosition': return this._getLocalPos(i);
          case 'm_AnchoredPosition': return r.apos[i];
          case 'm_SizeDelta': return r.sd[i];
          case 'm_AnchorMin': return r.amin[i];
          case 'm_AnchorMax': return r.amax[i];
          case 'm_Pivot': return r.pivot[i];
        }
        break;
      case 'Image': case 'Text': {
        const g = type === 'Image' ? this.img : this.txt;
        if (!g) return undefined;
        if (base === 'm_Color') return g.color['rgba'.indexOf(sub)];
        if (base === 'm_Enabled') return g.enabled ? 1 : 0;
        if (base === 'm_Sprite') return this.img ? this.img.sprite : undefined;
        if (base === 'm_FillAmount') return this.img ? this.img.fillAmount : undefined;
        if (base === 'm_Text') return this.txt ? this.txt.text : undefined;
        break;
      }
      case 'CanvasGroup': if (this.cg && base === 'm_Alpha') return this.cg.alpha; break;
      case 'Slider': if (this.slider && base === 'm_Value') return this.slider.value; break;
    }
    const c = this.comps[type];
    if (!c) return undefined;
    return sub && c[base] && typeof c[base] === 'object' ? c[base][sub] : c[base];
  }
  _anchorRefLocal(i) { // anchor reference point relative to the parent's pivot, in parent units
    const p = this.parent;
    if (!p) return 0;
    if (!p._s[0] && !p._s[1]) this.ui.layout();
    const r = this.rt, ps = p._s[i], pp = p.parent ? p.rt.pivot[i] : 0.5;
    return ps * lerp(r.amin[i], r.amax[i], r.pivot[i]) - ps * pp;
  }
  _setLocalPos(i, v) {
    if (i === 2) { this.rt.lz = v; return; }
    this.rt.apos[i] = v - this._anchorRefLocal(i);
    this._posDirty();
  }
  _getLocalPos(i) { return i === 2 ? this.rt.lz : this.rt.apos[i] + this._anchorRefLocal(i); }

  _applyGroup() {
    if (!this.cg) return;
    this.el.style.opacity = this.cg.alpha >= 1 ? '' : String(fmt(clamp(this.cg.alpha, 0, 1)));
    this.el.classList.toggle('ui-noray', !this.cg.blocks);
  }

  _setState(st) {
    if (this.state === st) return;
    this.state = st;
    const b = this.btn || this.comps.Slider || this.comps.Toggle;
    if (!b) return;
    const tr_ = b.m_Transition | 0;
    const tg = this.findById(refOf(b.m_TargetGraphic));
    if (tr_ === 1 && tg) {
      const cs = b.m_Colors || {};
      const c = col(cs[`m_${st}Color`] || cs.m_NormalColor);
      const m = cs.m_ColorMultiplier ?? 1;
      tg.tint = c.map(v => clamp(v * m, 0, 1));
      tg._gfxDirty();
    } else if (tr_ === 2 && tg && tg.img) {
      const ss = b.m_SpriteState || {};
      tg.spriteOverride = st === 'Normal' ? undefined : (resolveSpriteKey(ss[`m_${st}Sprite`]) || undefined);
      tg._gfxDirty();
    }
    const trig = (b.m_AnimationTriggers || {})[`m_${st}Trigger`] || st;
    if (this.onState) this.onState(st, trig, this);
    const o = this.tree.opts;
    if (o.onButtonState) o.onButtonState(this, st, trig);
  }

  // Persistent onClick calls resolved into plain objects.
  clickCalls() {
    if (!this.btn) return [];
    const calls = ((this.btn.m_OnClick || {}).m_PersistentCalls || {}).m_Calls || [];
    return calls.filter(c => c.m_CallState !== 0).map(c => {
      const targetId = refOf(c.m_Target);
      const tn = targetId ? this.findById(targetId) : null;
      let targetType = null;
      if (tn) targetType = tn.id === targetId ? 'GameObject' : (tn.compList.find(x => x.id === targetId) || {}).type;
      if (!targetType && targetId) targetType = globalTypeOf(targetId);
      const a = c.m_Arguments || {};
      const mode = c.m_Mode | 0;
      const arg = mode === 2 ? refOf(a.m_ObjectArgument) : mode === 3 ? a.m_IntArgument : mode === 4 ? a.m_FloatArgument : mode === 5 ? a.m_StringArgument : mode === 6 ? !!a.m_BoolArgument : undefined;
      return {
        targetId, targetType, targetNode: tn, method: c.m_MethodName, mode, arg,
        args: { string: a.m_StringArgument, int: a.m_IntArgument, float: a.m_FloatArgument, bool: !!a.m_BoolArgument, object: refOf(a.m_ObjectArgument) },
      };
    });
  }
  click() { this.ui._click(this); }
}

function splitProp(p) {
  const k = p.lastIndexOf('.');
  if (k < 0) return [p, null];
  const sub = p.slice(k + 1);
  if (/^[xyzwrgba]$/.test(sub)) return [p.slice(0, k), sub];
  return [p, null];
}

// ---------- UIRoot ----------
export class UIRoot {
  constructor(containerEl, { debugNames = false } = {}) {
    this.container = containerEl;
    this.debugNames = debugNames;
    const el = this.el = document.createElement('div');
    el.className = 'ui-root';
    el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none;';
    containerEl.appendChild(el);
    this.w = containerEl.clientWidth || 360;
    this.h = containerEl.clientHeight || 640;
    this.canvases = [];
    this._dirty = new Set(); this._gfx = new Set(); this._pos = new Set();
    this._raf = 0; this._ptrs = new Map(); this._scrolls = new Set(); this._scrollRaf = 0;
    this._pending = new Set();
    this.safeInsets = [0, 0, 0, 0]; // top right bottom left, CSS px
    this.meas = new Measurer();
    this._onDown = this._onDown.bind(this); this._onMove = this._onMove.bind(this); this._onUp = this._onUp.bind(this);
    el.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove, { passive: true });
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    this._readSafeArea();
    this.ready = Promise.all([ensureCss(), ensureFont()]).then(() => {
      this.meas.clear();
      for (const c of this.canvases) this._markLayout(c);
      this.layout();
    });
  }

  dispose() {
    for (const c of [...this.canvases]) c.destroy();
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this.el.remove(); this.meas.el.remove();
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this._readSafeArea();
    for (const c of this.canvases) { this._sizeCanvas(c); this._applySafeAreas(c); this._markLayout(c); }
    this.layout();
  }

  // Instantiate a scene/prefab node. parent=null -> new top-level canvas layer.
  instantiate(node, parent = null, opts = {}) {
    if (!node) throw new Error('instantiate: node missing');
    const ptree = parent ? parent.tree : null;
    const tree = { opts: { localize: true, ...(ptree ? ptree.opts : {}), ...opts }, byId: new Map(), parentTree: ptree };
    let n;
    if (!parent) {
      const isCanvas = (node.c || []).some(c => c.type === 'Canvas');
      if (isCanvas) {
        n = this._build(node, null, tree);
        this._setupCanvas(n);
      } else { // wrap in an implicit default canvas (reference 640x1136, match height)
        const host = this._build({ name: 'Canvas(auto)', id: '__auto' + nodeSeq, active: true, c: [{ type: 'Canvas', m_SortingOrder: opts.sortingOrder ?? 0 }], ch: [] }, null, tree);
        this._setupCanvas(host);
        n = this._build(node, host, tree);
        host.children.push(n); host.el.appendChild(n.el);
        n.host = host;
      }
    } else {
      n = this._build(node, parent, tree);
      const idx = opts.index;
      if (idx == null || idx >= parent.children.length) { parent.children.push(n); parent.el.appendChild(n.el); }
      else { parent.children.splice(idx, 0, n); parent.el.insertBefore(n.el, parent.children[idx + 1].el); }
    }
    if (opts.active != null) n.setActive(opts.active);
    // Localize: Text.text = tr(key)
    if (tree.opts.localize && A.lang) {
      n.walk(u => {
        if (u.tree !== tree) return;
        for (const c of u.compList) if (c.type === 'Localize' && c.m_key) {
          const t = u.findById(refOf(c.m_text)) || u;
          const s = tr(c.m_key);
          if (s !== c.m_key && t.txt) { t.txt.text = s; t.txt.html = null; }
        }
      });
    }
    // initial selectable states
    n.walk(u => { if (u.tree === tree && (u.btn || u.comps.Slider) && !u.interactable) { u.state = ''; u._setState('Disabled'); } });
    const cv = n.canvas;
    this._applySafeAreas(cv);
    this._markLayout(cv);
    this.layout();
    return n;
  }

  _build(node, parent, tree) {
    const u = new UINode(this, node, parent, tree);
    tree.byId.set(node.id, u);
    for (const c of u.compList) tree.byId.set(c.id, u);
    if (!u.active) u.el.style.display = 'none';
    u._applyGroup();
    if (u.gfx) this._markGfx(u);
    for (const ch of node.ch || []) {
      if (!ch.c || !ch.c.some(c => c.type === 'RectTransform')) continue; // UI only
      const cu = this._build(ch, u, tree);
      u.children.push(cu);
      u.el.appendChild(cu.el);
    }
    return u;
  }

  _setupCanvas(n) {
    const cv = n.comps.Canvas || {};
    n.isCanvas = true;
    n.sortingOrder = cv.m_SortingOrder | 0;
    const layer = n.layer = document.createElement('div');
    layer.className = 'ui-layer';
    layer.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:${n.sortingOrder}`;
    layer.appendChild(n.el);
    n.el.classList.add('ui-canvas');
    // keep DOM order = (sortingOrder, creation order) so equal orders stack by creation
    const after = this.canvases.find(c => c.sortingOrder > n.sortingOrder);
    this.el.insertBefore(layer, after ? after.layer : null);
    this.canvases.push(n);
    this._sizeCanvas(n);
  }
  _removeCanvas(n) {
    n.layer.remove();
    const i = this.canvases.indexOf(n);
    if (i >= 0) this.canvases.splice(i, 1);
    this._dirty.delete(n);
  }
  _canvasScale(n) {
    const sc = n.comps.CanvasScaler;
    const W = this.w, H = this.h;
    if (!sc) { const rr = [640, 1136]; return H / rr[1]; }
    const mode = sc.m_UiScaleMode | 0;
    if (mode === 0) return sc.m_ScaleFactor || 1;
    if (mode === 2) return 1;
    const ref = v2(sc.m_ReferenceResolution, 640, 1136);
    const mm = sc.m_ScreenMatchMode | 0;
    if (mm === 1) return Math.min(W / ref[0], H / ref[1]);
    if (mm === 2) return Math.max(W / ref[0], H / ref[1]);
    const m = sc.m_MatchWidthOrHeight ?? 0;
    return Math.pow(2, lerp(Math.log2(W / ref[0]), Math.log2(H / ref[1]), m));
  }
  _sizeCanvas(n) {
    const s = n.scale = this._canvasScale(n);
    n._s = [this.w / s, this.h / s];
    n.el.style.width = fmt(n._s[0]) + 'px';
    n.el.style.height = fmt(n._s[1]) + 'px';
    n.el.style.transform = `scale(${s})`;
    n.walk(u => { if (u._sliced) this._markGfx(u); });
  }
  _readSafeArea() {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(p);
    const cs = getComputedStyle(p);
    this.safeInsets = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(v => parseFloat(v) || 0);
    p.remove();
  }
  // SafeArea.cs: offsetMin = (left, 0), offsetMax = (-right, -max(0, top - 32)) in canvas units.
  _applySafeAreas(cv) {
    const s = cv.scale || 1;
    const [t, r, , l] = this.safeInsets.map(v => v / s);
    cv.walk(u => {
      if (!u.safe) return;
      if (!u.baseRt) u.baseRt = { apos: u.rt.apos.slice(), sd: u.rt.sd.slice() };
      u.rt.apos = u.baseRt.apos.slice(); u.rt.sd = u.baseRt.sd.slice();
      const r_ = u.rt;
      const setMin = (x, y) => { const o = [x - (r_.apos[0] - r_.sd[0] * r_.pivot[0]), y - (r_.apos[1] - r_.sd[1] * r_.pivot[1])]; for (let i = 0; i < 2; i++) { r_.sd[i] -= o[i]; r_.apos[i] += o[i] * (1 - r_.pivot[i]); } };
      const setMax = (x, y) => { const o = [x - (r_.apos[0] + r_.sd[0] * (1 - r_.pivot[0])), y - (r_.apos[1] + r_.sd[1] * (1 - r_.pivot[1]))]; for (let i = 0; i < 2; i++) { r_.sd[i] += o[i]; r_.apos[i] += o[i] * r_.pivot[i]; } };
      setMin(l, 0);
      setMax(-r, -Math.max(0, t - 32));
    });
  }

  // ----- dirty tracking -----
  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.layout(); });
  }
  _markLayout(cv) { if (cv && cv.isCanvas && !cv.destroyed) { this._dirty.add(cv); this._schedule(); } }
  _markGfx(u) { this._gfx.add(u); this._schedule(); }
  _markPos(u) { this._pos.add(u); this._schedule(); }

  // Flush pending layout / position / graphic updates synchronously.
  layout() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    if (this._dirty.size) {
      const list = [...this._dirty];
      this._dirty.clear();
      for (const cv of list) if (!cv.destroyed) this._layoutCanvas(cv);
    }
    if (this._pos.size) {
      const list = [...this._pos];
      this._pos.clear();
      for (const u of list) if (!u.destroyed && u.parent) this._place(u);
    }
    if (this._gfx.size) {
      const list = [...this._gfx];
      this._gfx.clear();
      for (const u of list) if (!u.destroyed) this._render(u);
    }
  }

  // Resolves once every requested sprite (including tinted copies) has been produced.
  async whenLoaded() {
    this.layout();
    while (this._pending.size) { await Promise.allSettled([...this._pending]); this.layout(); }
  }

  // ----- layout (Unity LayoutRebuilder order: calc H, set H, calc V, set V) -----
  _layoutCanvas(cv) {
    this._calc(cv, 0); this._setAxis(cv, 0);
    this._calc(cv, 1); this._setAxis(cv, 1);
    this._placeTree(cv);
  }
  _kids(u) { return u.children.filter(c => c.active && !c.destroyed && !ignoresLayout(c)); }
  _calc(u, axis) {
    for (const c of u.children) if (c.active) this._calc(c, axis);
    const g = layoutGroup(u);
    if (!g) { u._lg[axis] = null; return; }
    if (g.type === 'GridLayoutGroup') { u._lg[axis] = this._calcGrid(u, g, axis); return; }
    const isV = g.type === 'VerticalLayoutGroup';
    const pad = g.m_Padding || {};
    const combined = axis === 0 ? (pad.m_Left | 0) + (pad.m_Right | 0) : (pad.m_Top | 0) + (pad.m_Bottom | 0);
    const control = axis === 0 ? !!g.m_ChildControlWidth : !!g.m_ChildControlHeight;
    const force = axis === 0 ? !!g.m_ChildForceExpandWidth : !!g.m_ChildForceExpandHeight;
    const sp = g.m_Spacing || 0;
    let tMin = combined, tPref = combined, tFlex = 0;
    const other = isV !== (axis === 1);
    const kids = this._kids(u);
    for (const c of kids) {
      const [mn, pf, fx] = this._childSizes(c, axis, control, force);
      if (other) { tMin = Math.max(mn + combined, tMin); tPref = Math.max(pf + combined, tPref); tFlex = Math.max(fx, tFlex); }
      else { tMin += mn + sp; tPref += pf + sp; tFlex += fx; }
    }
    if (!other && kids.length) { tMin -= sp; tPref -= sp; }
    tPref = Math.max(tMin, tPref);
    u._lg[axis] = [tMin, tPref, tFlex];
  }
  _calcGrid(u, g, axis) {
    const pad = g.m_Padding || {};
    const cell = v2(g.m_CellSize, 100, 100), sp = v2(g.m_Spacing);
    const n = this._kids(u).length, cons = g.m_Constraint | 0, cc = Math.max(1, g.m_ConstraintCount | 0);
    if (axis === 0) {
      let minC, prefC;
      if (cons === 1) minC = prefC = cc;
      else if (cons === 2) minC = prefC = Math.ceil(n / cc - 0.001);
      else { minC = 1; prefC = Math.ceil(Math.sqrt(n)); }
      const ph = (pad.m_Left | 0) + (pad.m_Right | 0);
      return [ph + (cell[0] + sp[0]) * minC - sp[0], ph + (cell[0] + sp[0]) * prefC - sp[0], -1];
    }
    let minR;
    if (cons === 1) minR = Math.ceil(n / cc - 0.001);
    else if (cons === 2) minR = cc;
    else {
      const w = u._s[0];
      const cx = Math.max(1, Math.floor((w - (pad.m_Left | 0) - (pad.m_Right | 0) + sp[0] + 0.001) / (cell[0] + sp[0])));
      minR = Math.ceil(n / cx);
    }
    const m = (pad.m_Top | 0) + (pad.m_Bottom | 0) + (cell[1] + sp[1]) * minR - sp[1];
    return [m, m, -1];
  }
  _childSizes(c, axis, control, force) {
    let mn, pf, fx;
    if (!control) { mn = c.rt.sd[axis]; pf = mn; fx = 0; }
    else [mn, pf, fx] = this._props(c, axis);
    if (force) fx = Math.max(fx, 1);
    return [mn, pf, fx];
  }
  // LayoutUtility: min / preferred / flexible from all ILayoutElements by priority.
  _props(u, axis) {
    const vals = [0, 0, 0], pri = [-Infinity, -Infinity, -Infinity];
    const add = (prio, arr) => {
      for (let k = 0; k < 3; k++) {
        const v = arr[k];
        if (prio < pri[k] || v == null || v < 0) continue;
        if (prio > pri[k]) { vals[k] = v; pri[k] = prio; } else if (v > vals[k]) vals[k] = v;
      }
    };
    for (const c of u.compList) {
      if (c.type === 'LayoutElement' && c.m_Enabled !== 0) {
        add(c.m_LayoutPriority ?? 1, axis === 0 ? [c.m_MinWidth, c.m_PreferredWidth, c.m_FlexibleWidth] : [c.m_MinHeight, c.m_PreferredHeight, c.m_FlexibleHeight]);
      }
    }
    if (u._lg[axis]) add(0, u._lg[axis]);
    if (u.img && u.img.enabled) add(0, [0, this._imgPref(u, axis), -1]);
    if (u.txt && u.txt.enabled) add(0, [0, this._txtPref(u, axis), -1]);
    return [vals[0], Math.max(vals[0], vals[1]), vals[2]];
  }
  _imgPref(u, axis) {
    const k = u.spriteOverride || u.img.sprite;
    const s = k && spriteInfo(k);
    if (!s) return 0;
    const ppu = (s.ppu || 100) / 100;
    const hasBorder = s.border && s.border.some(b => b > 0);
    if ((u.img.type === 1 || u.img.type === 2) && hasBorder) return (axis === 0 ? s.border[0] + s.border[2] : s.border[1] + s.border[3]) / ppu;
    return (axis === 0 ? s.rw : s.rh) / ppu;
  }
  _txtHTML(u) {
    const t = u.txt;
    if (t.html == null) t.html = richToHTML(t.text, t.rich);
    return t.html;
  }
  _txtPref(u, axis) {
    const t = u.txt, html = this._txtHTML(u);
    if (!html) return 0;
    if (axis === 0) return this.meas.measure(html, t.size, t.ls, t.fstyle, null)[0];
    return this.meas.measure(html, t.size, t.ls, t.fstyle, t.wrap ? u._s[0] : null)[1];
  }
  _setAxis(u, axis) {
    if (u.parent) { const p = u.parent._s[axis], r = u.rt; u._s[axis] = p * (r.amax[axis] - r.amin[axis]) + r.sd[axis]; }
    if (axis === 0 && u.slider) this._driveSlider(u);
    // self controller (ContentSizeFitter) first, then layout group
    const f = u.comps.ContentSizeFitter;
    if (f && f.m_Enabled !== 0 && u.parent) {
      const fit = axis === 0 ? f.m_HorizontalFit | 0 : f.m_VerticalFit | 0;
      if (fit) {
        const pr = this._props(u, axis);
        const v = fit === 1 ? pr[0] : pr[1];
        const r = u.rt;
        r.sd[axis] = v - u.parent._s[axis] * (r.amax[axis] - r.amin[axis]);
        u._s[axis] = v;
      }
    }
    const g = layoutGroup(u);
    if (g) {
      if (g.type === 'GridLayoutGroup') this._setGrid(u, g, axis);
      else this._setHV(u, g, axis, g.type === 'VerticalLayoutGroup');
    }
    for (const c of u.children) if (c.active) this._setAxis(c, axis);
  }
  _setHV(u, g, axis, isV) {
    const size = u._s[axis];
    const pad = g.m_Padding || {};
    const combined = axis === 0 ? (pad.m_Left | 0) + (pad.m_Right | 0) : (pad.m_Top | 0) + (pad.m_Bottom | 0);
    const control = axis === 0 ? !!g.m_ChildControlWidth : !!g.m_ChildControlHeight;
    const force = axis === 0 ? !!g.m_ChildForceExpandWidth : !!g.m_ChildForceExpandHeight;
    const align = alignOnAxis(g.m_ChildAlignment | 0, axis);
    const sp = g.m_Spacing || 0;
    const other = isV !== (axis === 1);
    const kids = this._kids(u);
    if (other) {
      const inner = size - combined;
      for (const c of kids) {
        const [mn, pf, fx] = this._childSizes(c, axis, control, force);
        const req = clampU(inner, mn, fx > 0 ? size : pf);
        const start = startOffset(u, g, axis, req);
        if (control) setChildAlongAxis(c, axis, start, req);
        else setChildAlongAxis(c, axis, start + (req - c.rt.sd[axis]) * align);
      }
      return;
    }
    let pos = axis === 0 ? pad.m_Left | 0 : pad.m_Top | 0;
    const [tMin, tPref, tFlex] = u._lg[axis] || [0, 0, 0];
    if (tFlex === 0 && tPref < size) pos = startOffset(u, g, axis, tPref - combined);
    const t = tMin !== tPref ? clamp((size - tMin) / (tPref - tMin), 0, 1) : 0;
    const mult = size > tPref && tFlex > 0 ? (size - tPref) / tFlex : 0;
    for (const c of kids) {
      const [mn, pf, fx] = this._childSizes(c, axis, control, force);
      const cs = lerp(mn, pf, t) + fx * mult;
      if (control) setChildAlongAxis(c, axis, pos, cs);
      else setChildAlongAxis(c, axis, pos + (cs - c.rt.sd[axis]) * align);
      pos += cs + sp;
    }
  }
  _setGrid(u, g, axis) {
    const kids = this._kids(u);
    const cell = v2(g.m_CellSize, 100, 100), sp = v2(g.m_Spacing);
    if (axis === 0) {
      for (const c of kids) { c.rt.amin = [0, 1]; c.rt.amax = [0, 1]; c.rt.sd = cell.slice(); }
      return;
    }
    const pad = g.m_Padding || {};
    const n = kids.length, cons = g.m_Constraint | 0, cc = Math.max(1, g.m_ConstraintCount | 0);
    const [w, h] = u._s;
    let cx = 1, cy = 1;
    if (cons === 1) { cx = cc; if (n > cx) cy = Math.floor(n / cx) + (n % cx > 0 ? 1 : 0); }
    else if (cons === 2) { cy = cc; if (n > cy) cx = Math.floor(n / cy) + (n % cy > 0 ? 1 : 0); }
    else {
      cx = cell[0] + sp[0] <= 0 ? 1e9 : Math.max(1, Math.floor((w - (pad.m_Left | 0) - (pad.m_Right | 0) + sp[0] + 0.001) / (cell[0] + sp[0])));
      cy = cell[1] + sp[1] <= 0 ? 1e9 : Math.max(1, Math.floor((h - (pad.m_Top | 0) - (pad.m_Bottom | 0) + sp[1] + 0.001) / (cell[1] + sp[1])));
    }
    const corner = g.m_StartCorner | 0, cornerX = corner % 2, cornerY = Math.floor(corner / 2);
    let perMain, acx, acy;
    if ((g.m_StartAxis | 0) === 0) { perMain = cx; acx = clamp(cx, 1, n); acy = clamp(cy, 1, Math.ceil(n / perMain)); }
    else { perMain = cy; acy = clamp(cy, 1, n); acx = clamp(cx, 1, Math.ceil(n / perMain)); }
    const req = [acx * cell[0] + (acx - 1) * sp[0], acy * cell[1] + (acy - 1) * sp[1]];
    const st = [startOffset(u, g, 0, req[0]), startOffset(u, g, 1, req[1])];
    kids.forEach((c, i) => {
      let px, py;
      if ((g.m_StartAxis | 0) === 0) { px = i % perMain; py = Math.floor(i / perMain); }
      else { px = Math.floor(i / perMain); py = i % perMain; }
      if (cornerX === 1) px = acx - 1 - px;
      if (cornerY === 1) py = acy - 1 - py;
      setChildAlongAxis(c, 0, st[0] + (cell[0] + sp[0]) * px, cell[0]);
      setChildAlongAxis(c, 1, st[1] + (cell[1] + sp[1]) * py, cell[1]);
    });
  }
  _driveSlider(u) {
    const s = u.slider;
    const f = s.fill && u.findById(s.fill);
    if (!f) return;
    const nv = s.max !== s.min ? clamp((s.value - s.min) / (s.max - s.min), 0, 1) : 0;
    if (f.img && f.img.type === 3) { f.img.fillAmount = nv; this._markGfx(f); return; }
    const axis = s.dir >= 2 ? 1 : 0, rev = s.dir === 1 || s.dir === 3;
    f.rt.amin = [0, 0]; f.rt.amax = [1, 1];
    if (rev) f.rt.amin[axis] = 1 - nv; else f.rt.amax[axis] = nv;
  }
  _placeTree(u) {
    if (u.parent) this._place(u);
    for (const c of u.children) if (c.active) this._placeTree(c);
  }
  _place(u) {
    const p = u.parent, r = u.rt;
    const [pw, ph] = p._s;
    const w = u._s[0], h = u._s[1];
    const px = pw * lerp(r.amin[0], r.amax[0], r.pivot[0]) + r.apos[0];
    const left = px - w * r.pivot[0];
    const py = ph * lerp(r.amin[1], r.amax[1], r.pivot[1]) + r.apos[1];
    const top = ph - (py - h * r.pivot[1]) - h;
    u._x = left; u._y = top;
    const sk = fmt(w) + ',' + fmt(h);
    if (sk !== u._sk) {
      u._sk = sk;
      u.el.style.width = fmt(Math.max(0, w)) + 'px';
      u.el.style.height = fmt(Math.max(0, h)) + 'px';
      if ((u.txt && u.txt.bestFit) || u._sliced) this._markGfx(u);
    }
    let tf = `translate(${fmt(left)}px,${fmt(top)}px)`;
    const [ex, ey, ez] = r.euler, [sx, sy] = r.scale;
    const rotated = Math.abs(ex) > 1e-3 || Math.abs(ey) > 1e-3 || Math.abs(ez) > 1e-3;
    if (rotated || sx !== 1 || sy !== 1) {
      if (Math.abs(ey) > 1e-3) tf += ` rotateY(${fmt(-ey)}deg)`;
      if (Math.abs(ex) > 1e-3) tf += ` rotateX(${fmt(ex)}deg)`;
      if (Math.abs(ez) > 1e-3) tf += ` rotate(${fmt(-ez)}deg)`;
      if (sx !== 1 || sy !== 1) tf += ` scale(${fmt(sx)},${fmt(sy)})`;
      const org = `${fmt(r.pivot[0] * w)}px ${fmt((1 - r.pivot[1]) * h)}px`;
      if (org !== u._org) { u._org = org; u.el.style.transformOrigin = org; }
    }
    if (tf !== u._tf) { u._tf = tf; u.el.style.transform = tf; }
  }

  // ----- graphics -----
  _render(u) {
    if (u.img) this._renderImage(u);
    else if (u.txt) this._renderText(u);
    else if (u.claim) {
      u.gfx.classList.toggle('ray', u.claim.enabled && u.claim.ray);
    }
  }
  _renderImage(u) {
    const im = u.img, g = u.gfx, st = g.style;
    const mask = u.comps.Mask;
    const hidden = !im.enabled || (mask && mask.m_Enabled !== 0 && !mask.m_ShowMaskGraphic);
    g.classList.toggle('ray', im.enabled && im.ray);
    const c = im.color.map((v, i) => v * u.tint[i]);
    st.opacity = hidden ? '0' : (c[3] >= 1 ? '' : String(fmt(clamp(c[3], 0, 1))));
    const key = u.spriteOverride || im.sprite;
    const info = key && spriteInfo(key);
    // clip for filled images
    st.clipPath = im.type === 3 && info ? fillClip(im) : '';
    if (!info) {
      g.dataset.spr = key || '';
      if (key) g.dataset.err = 'missing';
      st.backgroundImage = '';
      if (u.cnv) { u.cnv.remove(); u.cnv = null; u._sliced = false; }
      st.backgroundColor = rgbCss(c[0], c[1], c[2]);
      return;
    }
    st.backgroundColor = '';
    const req = (u._req = (u._req || 0) + 1);
    g.dataset.spr = key;
    const ppu = (info.ppu || 100) / 100;
    const sliced = im.type === 1 && info.border && info.border.some(x => x > 0);
    if (sliced !== !!u._sliced) {
      u._sliced = sliced;
      if (sliced) { u.cnv = document.createElement('canvas'); u.cnv.className = 'ui-slice'; g.prepend(u.cnv); st.backgroundImage = ''; }
      else if (u.cnv) { u.cnv.remove(); u.cnv = null; }
    }
    if (sliced) {
      const tk = tintKey(key, c[0], c[1], c[2]);
      const ready = tintReady.get(tk);
      if (ready) { this._drawSliced(u, ready, info, ppu); g.dataset.ok = '1'; delete g.dataset.err; return; }
    }
    const pr = sliced ? tintedCanvas(key, c[0], c[1], c[2]) : tintedURL(key, c[0], c[1], c[2]);
    this._pending.add(pr);
    pr.then(url => {
      this._pending.delete(pr);
      if (req !== u._req || u.destroyed) return;
      if (sliced) this._drawSliced(u, url, info, ppu);
      else {
        st.backgroundImage = `url("${url}")`;
        if (im.type === 2) {
          st.backgroundRepeat = 'repeat';
          st.backgroundSize = `${fmt(info.rw / ppu)}px ${fmt(info.rh / ppu)}px`;
          st.backgroundPosition = 'left bottom';
        } else {
          st.backgroundRepeat = 'no-repeat';
          st.backgroundSize = im.preserve ? 'contain' : '100% 100%';
          st.backgroundPosition = 'center';
        }
      }
      g.dataset.ok = '1';
      delete g.dataset.err;
    }, err => {
      this._pending.delete(pr);
      g.dataset.err = String(err && err.message || err);
      console.error('ui sprite failed', key, err);
    });
  }
  // Unity sliced image drawn at device resolution with integer piece edges (no seams, no overlap).
  _drawSliced(u, src, info, ppu) {
    const cnv = u.cnv;
    if (!cnv) return;
    const k = (u.canvas.scale || 1) * (window.devicePixelRatio || 1);
    const [w, h] = u._s;
    const pw = clamp(Math.round(w * k), 0, 4096), ph = clamp(Math.round(h * k), 0, 4096);
    const sig = `${pw}x${ph}|${u.img.fillCenter}`;
    if (cnv._src === src && cnv._sig === sig) return;
    cnv._src = src; cnv._sig = sig;
    cnv.width = Math.max(1, pw); cnv.height = Math.max(1, ph);
    const g = cnv.getContext('2d');
    g.clearRect(0, 0, cnv.width, cnv.height);
    if (!pw || !ph) return;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const [bl, bb, br, bt] = info.border;
    let L = bl / ppu, B = bb / ppu, R = br / ppu, T = bt / ppu;
    if (L + R > w && L + R > 0) { const f = Math.max(0, w) / (L + R); L *= f; R *= f; }
    if (T + B > h && T + B > 0) { const f = Math.max(0, h) / (T + B); T *= f; B *= f; }
    const SW = src.width, SH = src.height;
    const sx = [0, bl, SW - br, SW], sy = [0, bt, SH - bb, SH];
    const dx = [0, Math.round(L * k), pw - Math.round(R * k), pw], dy = [0, Math.round(T * k), ph - Math.round(B * k), ph];
    for (let row = 0; row < 3; row++) for (let c = 0; c < 3; c++) {
      if (row === 1 && c === 1 && !u.img.fillCenter) continue;
      const sw = sx[c + 1] - sx[c], sh = sy[row + 1] - sy[row], dw = dx[c + 1] - dx[c], dh = dy[row + 1] - dy[row];
      if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) continue;
      g.drawImage(src, sx[c], sy[row], sw, sh, dx[c], dy[row], dw, dh);
    }
  }
  _renderText(u) {
    const t = u.txt, g = u.gfx, st = g.style, inner = u.inner;
    g.classList.toggle('ray', t.enabled && t.ray);
    st.display = t.enabled ? '' : 'none';
    const html = this._txtHTML(u);
    if (inner._html !== html) { inner._html = html; inner.innerHTML = html; }
    let size = t.size;
    if (t.bestFit) size = this._bestFit(u, html);
    t.curSize = size;
    const a = t.align;
    st.justifyContent = ['flex-start', 'center', 'flex-end'][Math.floor(a / 3)] || 'flex-start';
    st.alignItems = ['flex-start', 'center', 'flex-end'][a % 3];
    st.textAlign = ['left', 'center', 'right'][a % 3];
    st.color = rgbCss(t.color[0], t.color[1], t.color[2]);
    st.opacity = t.color[3] >= 1 ? '' : String(fmt(clamp(t.color[3], 0, 1)));
    st.fontWeight = t.fstyle & 1 ? 'bold' : '';
    st.fontStyle = t.fstyle & 2 ? 'italic' : '';
    inner.style.fontSize = fmt(size) + 'px';
    inner.style.lineHeight = String(t.ls);
    inner.style.whiteSpace = t.wrap ? 'pre-wrap' : 'pre';
    inner.style.maxWidth = t.wrap ? 'calc(100% + 0.5px)' : 'none'; // tolerance for measure/render rounding
    st.textShadow = textShadow(u);
  }
  _bestFit(u, html) {
    const t = u.txt, [w, h] = u._s;
    let lo = Math.max(1, t.min | 0), hi = Math.max(lo, t.max | 0);
    const fits = s => {
      const m = this.meas.measure(html, s, t.ls, t.fstyle, t.wrap ? w : null);
      return m[1] <= h + 0.5 && (t.wrap || m[0] <= w + 0.5);
    };
    if (fits(hi)) return hi;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (fits(mid)) lo = mid; else hi = mid - 1; }
    return lo;
  }

  // ----- input -----
  _nodeFromTarget(t) {
    for (let e = t; e && e !== this.el; e = e.parentElement) if (e._ui) return e._ui;
    return null;
  }
  _onDown(e) {
    const hit = this._nodeFromTarget(e.target);
    if (!hit) return;
    if (e.target.hasPointerCapture && e.target.hasPointerCapture(e.pointerId)) e.target.releasePointerCapture(e.pointerId);
    let downNode = null, clickNode = null, dragNode = null;
    for (let n = hit; n; n = n.parent) {
      if (!downNode && (n.isSelectable || n.hasPointerScript)) downNode = n;
      if (!clickNode && n.btn) clickNode = n;
      if (!dragNode && ((n.scroll && n.scroll.enabled) || n.hasDragScript)) dragNode = n;
    }
    const press = downNode ? (downNode.btn ? downNode : null) : clickNode;
    if (downNode && downNode.hasPointerScript) {
      const o = downNode.tree.opts;
      if (o.onPointerDown) o.onPointerDown(downNode, e);
    }
    const p = { id: e.pointerId, press: null, drag: dragNode, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), dragging: false };
    if (press && press.interactable) { p.press = press; press._setState('Pressed'); }
    if (dragNode && dragNode.scroll) dragNode.scroll.velocity = [0, 0];
    this._ptrs.set(e.pointerId, p);
  }
  _onMove(e) {
    const p = this._ptrs.get(e.pointerId);
    if (!p) return;
    if (p.press) p.press._setState(p.press.el.contains(e.target) ? 'Pressed' : 'Normal');
    if (p.drag && !p.dragging && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > DRAG_THRESHOLD) {
      p.dragging = true;
      if (p.press && p.press !== p.drag) { p.press._setState('Normal'); p.press = null; } // drag cancels the click
      this._dragEvent(p.drag, 'begin', p, e);
    }
    if (p.dragging) this._dragEvent(p.drag, 'drag', p, e);
    p.x = e.clientX; p.y = e.clientY; p.t = performance.now();
  }
  _onUp(e) {
    const p = this._ptrs.get(e.pointerId);
    if (!p) return;
    this._ptrs.delete(e.pointerId);
    if (p.dragging) this._dragEvent(p.drag, 'end', p, e);
    if (p.press) {
      const inside = e.type === 'pointerup' && p.press.el.contains(e.target);
      p.press._setState(p.press.interactable ? 'Normal' : 'Disabled');
      if (inside && p.press.interactable && p.press.activeInHierarchy) this._click(p.press);
    }
  }
  _click(u) {
    if (!u.btn) return;
    const calls = u.clickCalls();
    if (u.onClick) { u.onClick(u, calls); return; }
    const o = u.tree.opts;
    if (!o.onClick) return;
    if (!calls.length) o.onClick(u, null);
    for (const c of calls) o.onClick(u, c);
  }
  _dragEvent(u, phase, p, e) {
    const s = u.scroll;
    const scale = u.canvas.scale || 1;
    const info = { phase, dx: (e.clientX - p.x0) / scale, dy: -(e.clientY - p.y0) / scale, event: e };
    if (s && s.enabled) {
      const c = u.scrollContent;
      if (c) {
        if (phase === 'begin') { s.dragging = true; s.start = c.rt.apos.slice(); s.velocity = [0, 0]; s.prev = c.rt.apos.slice(); s.lastT = performance.now(); this._scrolls.add(u); this._runScroll(); }
        else if (phase === 'drag') {
          this.layout();
          const pos = [s.horizontal ? s.start[0] + info.dx : c.rt.apos[0], s.vertical ? s.start[1] + info.dy : c.rt.apos[1]];
          const off = this._scrollOffset(u, c, [pos[0] - c.rt.apos[0], pos[1] - c.rt.apos[1]]);
          const view = this._scrollView(u, c);
          for (let i = 0; i < 2; i++) {
            pos[i] += off[i];
            if (s.movement === 1 && off[i] !== 0) pos[i] -= rubber(off[i], view._s[i]);
          }
          c.rt.apos[0] = pos[0]; c.rt.apos[1] = pos[1];
          this._place(c);
          this._fireScroll(u);
        } else if (phase === 'end') { s.dragging = false; }
      }
    }
    const hook = phase === 'begin' ? u.onBeginDrag : phase === 'drag' ? u.onDrag : u.onEndDrag;
    if (hook) hook(u, info);
    const o = u.tree.opts;
    if (o.onDrag) o.onDrag(u, phase, info);
  }
  _scrollView(u, c) { return (u.scroll.viewport && u.findById(u.scroll.viewport)) || c.parent || u; }
  // Unity ScrollRect.CalculateOffset: delta that keeps content covering the viewport (Unity units, y up).
  _scrollOffset(u, c, delta) {
    const s = u.scroll, view = this._scrollView(u, c);
    const [vw, vh] = view._s;
    const w = c._s[0] * c.rt.scale[0], h = c._s[1] * c.rt.scale[1];
    const out = [0, 0];
    if (s.movement === 0) return out;
    if (s.horizontal) {
      const min = c._x + delta[0], max = min + w;
      if (w < vw) out[0] = (vw - w) * c.rt.pivot[0] - min;
      else if (min > 0.001) out[0] = -min;
      else if (max < vw - 0.001) out[0] = vw - max;
    }
    if (s.vertical) {
      const top = c._y - delta[1], bottom = top + h;
      let d = 0;
      if (h < vh) d = (vh - h) * (1 - c.rt.pivot[1]) - top;
      else if (top > 0.001) d = -top;
      else if (bottom < vh - 0.001) d = vh - bottom;
      out[1] = -d;
    }
    return out;
  }
  _runScroll() {
    if (this._scrollRaf) return;
    let last = performance.now();
    const tick = now => {
      this._scrollRaf = 0;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      this.layout();
      for (const u of [...this._scrolls]) {
        if (u.destroyed) { this._scrolls.delete(u); continue; }
        if (!this._stepScroll(u, dt)) this._scrolls.delete(u);
      }
      if (this._scrolls.size) this._scrollRaf = requestAnimationFrame(tick);
    };
    this._scrollRaf = requestAnimationFrame(tick);
  }
  // Unity ScrollRect.LateUpdate; returns true while still moving.
  _stepScroll(u, dt) {
    const s = u.scroll, c = u.scrollContent;
    if (!c) return false;
    if (s.dragging) {
      if (s.inertia) for (let i = 0; i < 2; i++) s.velocity[i] = lerp(s.velocity[i], (c.rt.apos[i] - s.prev[i]) / dt, Math.min(1, dt * 10));
      s.prev = c.rt.apos.slice();
      return true;
    }
    const off = this._scrollOffset(u, c, [0, 0]);
    if (!off[0] && !off[1] && Math.abs(s.velocity[0]) < 1 && Math.abs(s.velocity[1]) < 1) { s.velocity = [0, 0]; return false; }
    const pos = c.rt.apos.slice();
    for (let i = 0; i < 2; i++) {
      if (s.movement === 1 && off[i] !== 0) {
        const ref = { v: s.velocity[i] };
        pos[i] = smoothDamp(pos[i], pos[i] + off[i], ref, s.elasticity, dt);
        if (Math.abs(ref.v) < 1) ref.v = 0;
        s.velocity[i] = ref.v;
      } else if (s.inertia) {
        s.velocity[i] *= Math.pow(s.decel, dt);
        if (Math.abs(s.velocity[i]) < 1) s.velocity[i] = 0;
        pos[i] += s.velocity[i] * dt;
      } else s.velocity[i] = 0;
    }
    if (s.movement === 2) {
      const o2 = this._scrollOffset(u, c, [pos[0] - c.rt.apos[0], pos[1] - c.rt.apos[1]]);
      pos[0] += o2[0]; pos[1] += o2[1];
    }
    c.rt.apos = pos;
    this._place(c);
    this._fireScroll(u);
    return true;
  }
  _fireScroll(u) {
    if (u.onScroll) u.onScroll(u, u.getScrollOffset());
    const o = u.tree.opts;
    if (o.onScroll) o.onScroll(u, u.getScrollOffset());
  }
  _scrollNormalized(u) {
    this.layout();
    const c = u.scrollContent;
    if (!c) return [0, 0];
    const view = this._scrollView(u, c);
    const w = c._s[0] - view._s[0], h = c._s[1] - view._s[1];
    return [w > 0 ? -c._x / w : 0, h > 0 ? 1 - (-c._y / h) : 0];
  }
  _setScrollNormalized(u, nx, ny) {
    this.layout();
    const c = u.scrollContent;
    if (!c) return;
    const view = this._scrollView(u, c);
    if (nx != null) { const w = c._s[0] - view._s[0]; const target = -nx * w; c.rt.apos[0] += target - c._x; }
    if (ny != null) { const h = c._s[1] - view._s[1]; const target = -(1 - ny) * h; c.rt.apos[1] -= target - c._y; }
    this._place(c);
    this._fireScroll(u);
  }
}

// ---------- layout helpers ----------
function layoutGroup(u) {
  for (const t of ['HorizontalLayoutGroup', 'VerticalLayoutGroup', 'GridLayoutGroup']) {
    const g = u.comps[t];
    if (g && g.m_Enabled !== 0) return g;
  }
  return null;
}
function ignoresLayout(u) {
  for (const c of u.compList) if (c.type === 'LayoutElement' && c.m_Enabled !== 0 && c.m_IgnoreLayout) return true;
  return false;
}
function alignOnAxis(a, axis) { return axis === 0 ? (a % 3) * 0.5 : Math.floor(a / 3) * 0.5; }
function clampU(v, mn, mx) { return v < mn ? mn : v > mx ? mx : v; }
function startOffset(u, g, axis, reqNoPad) {
  const pad = g.m_Padding || {};
  const req = reqNoPad + (axis === 0 ? (pad.m_Left | 0) + (pad.m_Right | 0) : (pad.m_Top | 0) + (pad.m_Bottom | 0));
  const surplus = u._s[axis] - req;
  return (axis === 0 ? pad.m_Left | 0 : pad.m_Top | 0) + surplus * alignOnAxis(g.m_ChildAlignment | 0, axis);
}
// RectTransform.SetInsetAndSizeFromParentEdge(Left|Top, pos, size)
function setChildAlongAxis(c, axis, pos, size) {
  const r = c.rt;
  if (size != null) r.sd[axis] = size;
  const s = r.sd[axis];
  if (axis === 0) { r.amin[0] = 0; r.amax[0] = 0; r.apos[0] = pos + s * r.pivot[0]; }
  else { r.amin[1] = 1; r.amax[1] = 1; r.apos[1] = -pos - s * (1 - r.pivot[1]); }
}
function rubber(over, viewSize) { return (1 - 1 / (Math.abs(over) * 0.55 / viewSize + 1)) * viewSize * Math.sign(over); }
function smoothDamp(cur, target, ref, smoothTime, dt) {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime, x = omega * dt, ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target, temp = (ref.v + omega * change) * dt;
  ref.v = (ref.v - omega * temp) * ex;
  let out = target + (change + temp) * ex;
  if ((target - cur > 0) === (out > target)) { out = target; ref.v = 0; }
  return out;
}
function fillClip(im) {
  const a = clamp(im.fillAmount, 0, 1);
  const m = im.fillMethod, o = im.fillOrigin;
  const pc = v => fmt(v * 100) + '%';
  if (m === 0) return o === 1 ? `inset(0 0 0 ${pc(1 - a)})` : `inset(0 ${pc(1 - a)} 0 0)`;
  if (m === 1) return o === 1 ? `inset(0 0 ${pc(1 - a)} 0)` : `inset(${pc(1 - a)} 0 0 0)`;
  if (a >= 1) return '';
  if (a <= 0) return 'inset(50% 50% 50% 50%)';
  // radial: centre + start angle in normalized space (math angles, y up)
  let cx = 0.5, cy = 0.5, start, sweep;
  const cw = im.clockwise ? -1 : 1;
  if (m === 4) { start = [270, 0, 90, 180][o & 3]; sweep = 360; }
  else if (m === 3) {
    const normal = [90, 0, 270, 180][o & 3];
    [cx, cy] = [[0.5, 0], [0, 0.5], [0.5, 1], [1, 0.5]][o & 3];
    start = normal - cw * 90; sweep = 180;
  } else {
    const bis = [45, 315, 225, 135][o & 3];
    [cx, cy] = [[0, 0], [0, 1], [1, 1], [1, 0]][o & 3];
    start = bis - cw * 45; sweep = 90;
  }
  const R = 1.6, total = sweep * a, steps = Math.max(2, Math.ceil(total / 5));
  const pts = [`${pc(cx)} ${pc(1 - cy)}`];
  for (let i = 0; i <= steps; i++) {
    const ang = (start + cw * total * i / steps) * Math.PI / 180;
    pts.push(`${pc(cx + R * Math.cos(ang))} ${pc(1 - (cy + R * Math.sin(ang)))}`);
  }
  return `polygon(${pts.join(',')})`;
}
function textShadow(u) {
  const parts = [];
  for (const c of u.compList) {
    if ((c.type !== 'Outline' && c.type !== 'Shadow') || c.m_Enabled === 0) continue;
    const ec = col(c.m_EffectColor), d = v2(c.m_EffectDistance, 1, -1);
    if (c.m_UseGraphicAlpha !== 0) ec[3] *= 1; // graphic alpha already applied through opacity
    const cs = rgbaCss(ec);
    const dx = fmt(d[0]), dy = fmt(-d[1]);
    if (c.type === 'Shadow') parts.push(`${dx}px ${dy}px 0 ${cs}`);
    else parts.push(`${dx}px ${dy}px 0 ${cs}`, `${dx}px ${-dy}px 0 ${cs}`, `${-dx}px ${dy}px 0 ${cs}`, `${-dx}px ${-dy}px 0 ${cs}`);
  }
  return parts.join(',');
}
