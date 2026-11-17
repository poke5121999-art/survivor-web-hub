// DOM HUD rebuilt from the GamePlay uGUI tree (art/ui/level2.json): every RectTransform at its original anchors,
// pivot and size in canvas units, real sprites from art/ui/sprites, TMP text, Button colour tints. The canvas is scaled
// by the original CanvasScaler (ScaleWithScreenSize, reference 1920x1080, screenMatchMode from the export) and sized
// against the stage, never the window. Only Canvas/InGame is shown for now; hud.show(path) opens other panels.
const VI = {
  Helath: 'Máu',
  'reward in:': 'Thưởng sau:',
  'save your memrot': 'Bảo vệ brainrot của bạn',
  'You are  died': 'Bạn đã bị hạ',
  'Revive me': 'Hồi sinh',
  'No thanks': 'Không, cảm ơn',
  'Steal it': 'Trộm nó',
  'Get seeds from shop to grow': 'Mua hạt giống ở cửa hàng để trồng',
  objective: 'Nhiệm vụ',
  Sell: 'Bán',
  'Pick up': 'Nhặt',
  lock: 'Khoá',
  '3mints\n lock': 'Khoá\n3 phút',
  Unlock: 'Mở khoá',
  Buy: 'Mua',
  Pause: 'Tạm dừng',
  Settings: 'Cài đặt',
  // Drop 2 panels (shop, bat shop, shoes shop, weapon pedestals, settings, pause, ads break)
  sHOP: 'Cửa hàng',
  'Get Weapon': 'Nhận vũ khí',
  Free: 'Miễn phí',
  free: 'Miễn phí',
  Pick: 'Chọn',
  Restart: 'Chơi lại',
  Resume: 'Tiếp tục',
  Sound: 'Âm thanh',
  Music: 'Âm nhạc',
  Sensitivity: 'Độ nhạy',
  Save: 'Lưu',
  bronze: 'Đồng',
  gold: 'Vàng',
  dimond: 'Kim cương',
  bat: 'Gậy',
  axe: 'Rìu',
  'power chair': 'Ghế sắt',
  'chain saw': 'Cưa máy',
  hammer: 'Búa',
  'magic hand': 'Bàn tay thần',
  Soward: 'Kiếm',
  spear: 'Giáo',
  Bonus: 'Thưởng',
  'Ad loading :': 'Đang tải quảng cáo:',
  'Get it': 'Nhận',
  'Git it': 'Nhận',
  'Get health': 'Hồi máu',
  'Do you like  ads?': 'Bạn có thích quảng cáo?',
  'Buy ads': 'Mua gói bỏ quảng cáo',
  'Buy Ads': 'Mua gói bỏ quảng cáo',
};
// Patterned labels: "speed:  10" (shoes shop), "power:  2" (bat shop).
const VI_RE = [[/^speed:\s+(\d+)$/, 'Tốc độ: $1'], [/^power:\s+(\d+)$/, 'Sức mạnh: $1']];
export const viText = raw => {
  const k = String(raw).trim();
  if (VI[k] != null) return VI[k];
  for (const [re, out] of VI_RE) if (re.test(k)) return k.replace(re, out);
  return raw;
};
// TMP font assets -> the TTFs extracted from the APK (css/game.css). Insaniburger has Latin glyphs only: Vietnamese
// marks fall through to the next family of the stack.
const FALLBACK = '"Baloo 2", "Arial Rounded MT Bold", "Arial Black", "Trebuchet MS", sans-serif';
const FONTS = {
  'Insanibc SDF': `"Insanibc", ${FALLBACK}`,
  'Insanibu SDF': `"Insanibu", ${FALLBACK}`,
  'Roboto-Bold SDF': `"Roboto Bold", ${FALLBACK}`,
  'Bangers SDF': `"Bangers", "Luckiest Guy", Impact, ${FALLBACK}`,
  default: `"Insanibu", ${FALLBACK}`,
};
export const fontFor = name => FONTS[name] || FONTS.default;
const SHOWN_ROOTS = ['Canvas/InGame'];

const rgba = c => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;
const isWhite = c => c[0] > 0.99 && c[1] > 0.99 && c[2] > 0.99;

// Unity CanvasScaler.HandleScaleWithScreenSize.
export function canvasScale(w, h, scaler) {
  const [rw, rh] = scaler.referenceResolution;
  if (scaler.screenMatchMode === 'Expand') return Math.min(w / rw, h / rh);
  if (scaler.screenMatchMode === 'Shrink') return Math.max(w / rw, h / rh);
  const lw = Math.log2(w / rw), lh = Math.log2(h / rh);
  return 2 ** (lw + (lh - lw) * scaler.match);
}

// Sprite multiplied by a colour, alpha kept (uGUI Image.color on a white sprite). Computed once per sprite + colour on a
// CPU-backed canvas (willReadFrequently: no GPU readback, which cost seconds under SwiftShader) and handed out as a blob
// URL (no PNG data-URL encoding on the main thread).
const tintCache = new Map();
function tinted(url, c) {
  const key = url + c.join(',');
  if (!tintCache.has(key)) {
    tintCache.set(key, new Promise(res => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = im.width; cv.height = im.height;
        const x = cv.getContext('2d', { willReadFrequently: true });
        x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, cv.width, cv.height), a = d.data;
        for (let i = 0; i < a.length; i += 4) { a[i] *= c[0]; a[i + 1] *= c[1]; a[i + 2] *= c[2]; }
        x.putImageData(d, 0, 0);
        cv.toBlob(b => res(b ? URL.createObjectURL(b) : url), 'image/png');
      };
      im.onerror = () => res(url);
      im.src = url;
    }));
  }
  return tintCache.get(key);
}

export class Hud {
  constructor({ layout, parent, spriteBase, version = '', tweens = {} }) {
    this.L = layout;
    this.spriteBase = spriteBase;
    this.q = version ? `?v=${version}` : '';
    this.root = document.createElement('div');
    this.root.className = 'ugui-root';
    parent.appendChild(this.root);
    this.kids = layout.nodes.map(() => []);
    layout.nodes.forEach((n, i) => { if (n.parent >= 0) this.kids[n.parent].push(i); });
    this.els = layout.nodes.map((n, i) => this.make(n, i));
    this.els.forEach((el, i) => { const p = layout.nodes[i].parent; (p >= 0 ? this.els[p] : this.root).appendChild(el); });
    this.byPath = new Map(layout.nodes.map((n, i) => [n.path, i]));
    this.kids[0].forEach(i => { if (!SHOWN_ROOTS.includes(layout.nodes[i].path)) this.els[i].classList.add('ugui-off'); });
    this.abs = layout.nodes.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
    this.sliders = new Map();
    this.sizeOverride = new Map();          // node index -> [w, h] in canvas units (content grown by code, e.g. inventory)
    this.placeArgs = [];
    this.scrolls = new Map();               // content index -> { view, axis, off }
    layout.nodes.forEach((n, i) => { if (n.scrollrect) this.initScroll(i); });
    this.initTweens(tweens);
    this.scale = 1;
    this.size = null;
  }

  // Fetch and decode the sprites of the nodes whose path passes `want`, so a panel shown later (display:none until then,
  // so the browser has not fetched its background yet) paints its sprite in the same frame as its text. Resolves with
  // the count; images stay referenced so the decoded copies remain in the memory cache.
  preloadSprites(want = () => true, { allTints = false } = {}) {
    const urls = new Set();
    for (const n of this.L.nodes) {
      const im = n.image;
      if (im && im.enabled !== false && im.sprite && this.L.sprites[im.sprite] && want(n.path)) urls.add(this.spriteUrl(im.sprite));
    }
    this.preloaded = this.preloaded || new Map();
    const tints = (this.tints || []).filter(([p]) => allTints || want(p)).map(([, pr]) => pr.then(() => true));
    return Promise.all([...tints, ...[...urls].map(u => {
      if (!this.preloaded.has(u)) {
        const img = new Image();
        img.src = u;
        this.preloaded.set(u, img.decode().then(() => img.naturalWidth > 0, () => false));
      }
      return this.preloaded.get(u);
    })]).then(ok => ({ total: ok.length, loaded: ok.filter(Boolean).length }));
  }

  spriteUrl(name) { return `${this.spriteBase}/${encodeURIComponent(name)}.webp${this.q}`; }

  index(path) {
    const i = this.byPath.get(path.startsWith('Canvas') ? path : `Canvas/${path}`);
    return i == null ? -1 : i;
  }

  node(path) {
    const i = this.index(path);
    return i < 0 ? null : this.els[i];
  }

  // Rect of a node in stage CSS pixels (top-left origin), from the last layout pass.
  rect(path) {
    const a = this.abs[this.index(path)], s = this.scale;
    return { x: a.x * s, y: a.y * s, w: a.w * s, h: a.h * s, cx: (a.x + a.w / 2) * s, cy: (a.y + a.h / 2) * s };
  }

  show(path, on = true) {
    const el = this.node(path);
    if (el) { el.classList.toggle('ugui-off', !on); el.classList.toggle('ugui-hid', false); this.fitTexts(el); }
  }

  setText(path, text) {
    const el = this.node(path);
    const t = el && el.querySelector(':scope > .ugui-txt');
    if (!t || t.textContent === String(text)) return;
    t.textContent = String(text);
    this.fit(t);
  }

  set coins(v) { this.setText('InGame/TopPanel/Coins/Text (TMP)', v); }

  // uGUI Slider: the fill rect's anchorMax.x (and the handle's anchors) follow the normalized value.
  setSlider(path, value) {
    const i = this.index(path);
    if (i < 0) return;
    const sl = this.L.nodes[i].slider;
    this.sliders.set(i, Math.max(0, Math.min(1, (value - sl.MinValue) / ((sl.MaxValue - sl.MinValue) || 1))));
    if (this.size) this.resize(...this.size);
  }

  // PlayerHealth slider: Value = current health of playerTotalHealth (5).
  setHealth(hp, max = 5) {
    const i = this.index('InGame/TopPanel/PlayerHealth');
    const sl = this.L.nodes[i].slider;
    this.setSlider('InGame/TopPanel/PlayerHealth', sl.MinValue + (sl.MaxValue - sl.MinValue) * hp / max);
  }

  sliderAnchors(i) {
    const n = this.L.nodes[i];
    const area = this.L.nodes[n.parent], owner = area && area.parent >= 0 ? area.parent : -1;
    if (owner < 0 || !this.L.nodes[owner].slider) return null;
    const v = this.sliders.has(owner) ? this.sliders.get(owner)
      : (s => (s.Value - s.MinValue) / ((s.MaxValue - s.MinValue) || 1))(this.L.nodes[owner].slider);
    if (area.name === 'Fill Area' && n.name === 'Fill') return [[0, 0], [v, 1]];
    if (area.name === 'Handle Slide Area' && n.name === 'Handle') return [[v, 0], [v, 1]];
    return null;
  }

  make(n, i) {
    const el = document.createElement('div');
    el.className = 'ugui';
    el.dataset.path = n.path;
    if (!n.active) el.classList.add('ugui-hid');
    const r = n.rect;
    if (i > 0 && r) {
      el.style.transformOrigin = `${r.pivot[0] * 100}% ${(1 - r.pivot[1]) * 100}%`;
      const t = [];
      if (r.scale[0] !== 1 || r.scale[1] !== 1) t.push(`scale(${r.scale[0]},${r.scale[1]})`);
      if (r.rotZ) t.push(`rotate(${-r.rotZ}deg)`);
      if (t.length) el.style.transform = t.join(' ');
    }
    if (n.mask) el.style.overflow = 'hidden';
    const im = n.image;
    if (im && im.enabled !== false) {
      const layer = document.createElement('div');
      layer.className = 'ugui-img';
      if (im.color[3] < 1) layer.style.opacity = im.color[3];
      const sp = im.sprite && this.L.sprites[im.sprite];
      if (sp) {
        const url = this.spriteUrl(im.sprite);
        const apply = u => {
          if (im.type === 'sliced' && sp.border.some(v => v > 0)) {
            const k = (im.ppuMultiplier ? 1 / im.ppuMultiplier : 1) * 100 / sp.ppu, b = sp.border, sh = sp.shrunk || 1;
            layer.style.borderStyle = 'solid';
            layer.style.borderColor = 'transparent';
            layer.style.borderWidth = `${b[3] * k}px ${b[2] * k}px ${b[1] * k}px ${b[0] * k}px`;
            layer.style.borderImage = `url("${u}") ${b[3] * sh} ${b[2] * sh} ${b[1] * sh} ${b[0] * sh} fill / ${b[3] * k}px ${b[2] * k}px ${b[1] * k}px ${b[0] * k}px stretch`;
          } else {
            layer.style.backgroundImage = `url("${u}")`;
            layer.style.backgroundSize = im.preserveAspect ? 'contain' : '100% 100%';
          }
        };
        // an alpha-0 Image only catches rays: nothing to draw, nothing to tint
        if (im.color[3] <= 0) layer.style.opacity = 0;
        else if (isWhite(im.color)) apply(url);
        else (this.tints = this.tints || []).push([n.path, tinted(url, im.color).then(apply)]);
      } else {
        layer.style.background = rgba([im.color[0], im.color[1], im.color[2], 1]);
      }
      if (im.type === 'filled' && im.fillMethod === 'horizontal') layer.style.clipPath = `inset(0 ${(1 - im.fillAmount) * 100}% 0 0)`;
      el.appendChild(layer);
      if (im.raycast) el.classList.add('ugui-hit');
    }
    if (n.button) {
      el.classList.add('ugui-btn');
      const press = on => el.classList.toggle('ugui-pressed', on);
      el.addEventListener('pointerdown', () => press(true));
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => press(false));
    }
    const t = n.text;
    if (t) {
      const d = document.createElement('div');
      d.className = 'ugui-txt';
      d.style.fontFamily = FONTS[t.font] || FONTS.default;
      // Insaniburger has capitals only: Vietnamese letters it lacks come from the fallback font, upper-cased to match
      if (/Insanib/.test(d.style.fontFamily.split(',')[0])) d.style.textTransform = 'uppercase';
      d.style.color = rgba(t.color);
      const [ha, va] = t.alignment;
      d.style.justifyContent = ha === 'center' ? 'center' : ha === 'right' ? 'flex-end' : 'flex-start';
      d.style.alignItems = va === 'bottom' ? 'flex-end' : va === 'top' ? 'flex-start' : 'center';
      d.style.textAlign = ha;
      if (!t.wrap) d.style.whiteSpace = 'nowrap';
      const raw = String(t.text || '').replace(/<[^>]+>/g, '');
      d.textContent = viText(raw);
      d.dataset.size = t.fontSize;
      if (t.autoSize) { d.dataset.min = t.autoMin; d.dataset.max = t.autoMax; }
      d.style.fontSize = `${t.fontSize}px`;
      const fx = t.fx;
      if (fx && fx._OutlineWidth) {
        // TMP outline width is a fraction of the SDF range around the glyph edge; about half the font size per unit.
        d.style.webkitTextStroke = `${Math.max(1, t.fontSize * fx._OutlineWidth * 0.5)}px ${fx._OutlineColor ? rgba(fx._OutlineColor) : '#000'}`;
      }
      el.appendChild(d);
    }
    return el;
  }

  // Layout pass: RectTransform -> left/top/width/height in canvas units, HorizontalLayoutGroup approximated with equal
  // slots (childForceExpand, children keep their own size, centred).
  resize(stageW, stageH) {
    this.size = [stageW, stageH];
    const s = this.scale = canvasScale(stageW, stageH, this.L.scaler);
    const cw = stageW / s, ch = stageH / s;
    Object.assign(this.root.style, { width: `${cw}px`, height: `${ch}px`, transform: `scale(${s})` });
    this.place(0, 0, 0, cw, ch, null);
    this.fitTexts(this.root);
  }

  place(i, ax, ay, pw, ph, slot) {
    const n = this.L.nodes[i], r = n.rect, el = this.els[i];
    this.placeArgs[i] = [ax, ay, pw, ph, slot];
    let w = pw, h = ph, x = 0, y = 0;
    if (i > 0 && r) {
      const [[ax0, ay0], [ax1, ay1]] = this.sliderAnchors(i) || [r.anchorMin, r.anchorMax];
      w = (ax1 - ax0) * pw + r.sizeDelta[0];
      h = (ay1 - ay0) * ph + r.sizeDelta[1];
      let px = (ax0 + (ax1 - ax0) * r.pivot[0]) * pw + r.anchoredPosition[0];
      let py = (ay0 + (ay1 - ay0) * r.pivot[1]) * ph + r.anchoredPosition[1];
      if (slot) { px = slot.x + slot.w / 2 + (r.pivot[0] - 0.5) * w; py = slot.y + slot.h / 2 + (r.pivot[1] - 0.5) * h; }
      const ov = this.sizeOverride.get(i);
      if (ov) { if (ov[0] != null) w = ov[0]; if (ov[1] != null) h = ov[1]; }
      x = px - r.pivot[0] * w;
      y = ph - (py - r.pivot[1] * h) - h;
      const sc = this.scrolls.get(i);
      if (sc) { if (sc.axis === 'v') y -= sc.off; else x -= sc.off; }
    }
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    this.abs[i] = { x: ax + x, y: ay + y, w, h };
    const kids = this.kids[i];
    const lay = n.layout && n.layout.type === 'horizontal' ? n.layout : null;
    const slots = lay ? this.hSlots(lay, kids.filter(k => this.L.nodes[k].active), w, h) : new Map();
    for (const k of kids) this.place(k, ax + x, ay + y, w, h, slots.get(k) || null);
  }

  // HorizontalLayoutGroup with childControlSize off (every layout group of this canvas): children keep their size;
  // with childForceExpandWidth the spare width is shared equally between the slots, else the row is aligned by
  // childAlignment; each child sits in its slot by childAlignment. Returns child index -> rect (x from the left,
  // y from the bottom, canvas units).
  hSlots(lay, laid, w, h) {
    const out = new Map();
    if (!laid.length) return out;
    const [pl, pr, pt, pb] = lay.padding, al = lay.childAlignment || 'MiddleCenter';
    const ax = /Left/.test(al) ? 0 : /Right/.test(al) ? 1 : 0.5, ay = /Upper/.test(al) ? 1 : /Lower/.test(al) ? 0 : 0.5;
    const sizes = laid.map(k => this.L.nodes[k].rect.sizeDelta);
    const used = sizes.reduce((a, s) => a + s[0], 0) + lay.spacing * (laid.length - 1);
    const spare = w - pl - pr - used, expand = lay.forceExpand && lay.forceExpand[0] && spare > 0;
    let cx = pl + (expand ? 0 : spare * ax);
    laid.forEach((k, i) => {
      const [cw, chh] = sizes[i], slotW = cw + (expand ? spare / laid.length : 0);
      out.set(k, { x: cx + (slotW - cw) * ax, w: cw, y: pb + (h - pt - pb - chh) * ay, h: chh });
      cx += slotW + lay.spacing;
    });
    return out;
  }

  // uGUI ScrollRect (one axis): drag or wheel moves the content inside its masked viewport, clamped to the content size
  // (inertia and elastic overshoot are not reproduced). A drag longer than 8 canvas units swallows the click that ends it.
  initScroll(i) {
    const n = this.L.nodes[i], vp = this.kids[i].find(k => this.L.nodes[k].name === 'Viewport');
    if (vp == null) return;
    const content = this.kids[vp].find(k => this.L.nodes[k].name !== 'Text (TMP)');
    if (content == null) return;
    const axis = n.scrollrect.Vertical ? 'v' : 'h', sc = { view: vp, axis, off: 0 };
    this.scrolls.set(content, sc);
    const el = this.els[i];
    el.classList.add('ugui-hit');
    let start = null;
    const along = e => {
      const s = this.scale, rot = window.__game && window.__game.stage && window.__game.stage.rotated;
      const sx = rot ? e.clientY : e.clientX, sy = rot ? -e.clientX : e.clientY;
      return (axis === 'v' ? sy : sx) / s;
    };
    el.addEventListener('pointerdown', e => { start = { p: along(e), off: sc.off, moved: false }; this.swallow = false; });
    el.addEventListener('pointermove', e => {
      if (!start) return;
      const d = along(e) - start.p;
      if (Math.abs(d) > 8) start.moved = true;
      if (start.moved) this.scrollTo(content, start.off + (axis === 'v' ? -d : -d));
    });
    const end = () => { if (start && start.moved) this.swallow = true; start = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('click', e => { if (this.swallow) { e.stopPropagation(); e.preventDefault(); this.swallow = false; } }, true);
    el.addEventListener('wheel', e => { this.scrollTo(content, sc.off + (axis === 'v' ? e.deltaY : e.deltaY || e.deltaX) / this.scale); e.preventDefault(); }, { passive: false });
  }

  // Scroll a content node (index or path) to offset `off` canvas units from its start; returns the clamped offset.
  scrollTo(content, off) {
    const i = typeof content === 'number' ? content : this.index(content), sc = this.scrolls.get(i);
    if (!sc) return 0;
    const v = this.abs[sc.view], c = this.abs[i];
    const max = Math.max(0, sc.axis === 'v' ? c.h - v.h : c.w - v.w);
    sc.off = Math.max(0, Math.min(max, off));
    if (this.placeArgs[i]) { this.place(i, ...this.placeArgs[i]); }
    return sc.off;
  }

  // Bring a node inside a scroll view into its viewport (tests and keyboard users tap what they can see).
  scrollIntoView(path) {
    let i = this.index(path);
    const target = i;
    while (i > 0 && !this.scrolls.has(i)) i = this.L.nodes[i].parent;
    const sc = this.scrolls.get(i);
    if (!sc) return;
    const t = this.abs[target], v = this.abs[sc.view];
    const d = sc.axis === 'v' ? (t.y + t.h / 2) - (v.y + v.h / 2) : (t.x + t.w / 2) - (v.x + v.w / 2);
    this.scrollTo(i, sc.off + d);
  }

  // Re-run the layout of one subtree (after a size override or a scroll).
  relayout(path) {
    const i = typeof path === 'number' ? path : this.index(path);
    if (i >= 0 && this.placeArgs[i]) this.place(i, ...this.placeArgs[i]);
  }

  // DOTweenAnimation loops of the original (art/ui/tweens.json): Scale yoyo loops (animationType 5, loops -1, loopType 1)
  // become CSS animations of the node's own scale. Ease: 1 Linear, 6 OutQuad.
  initTweens(tweens) {
    const ease = { 1: 'linear', 6: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', 4: 'ease-in-out' };
    let css = '';
    Object.entries(tweens).forEach(([path, tw], k) => {
      if (tw.animationType !== 5 || tw.loops !== -1 || tw.loopType !== 1) return;
      const el = this.byPath && this.els[this.byPath.get(path)];
      if (!el) return;
      const name = `ugui-pulse-${k}`;
      css += `@keyframes ${name} { from { scale: 1; } to { scale: ${tw.endValueFloat}; } }\n`;
      el.style.animation = `${name} ${tw.duration}s ${ease[tw.easeType] || 'linear'} ${tw.delay || 0}s infinite alternate`;
    });
    if (css) { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }
  }

  // TMP auto size: largest size in [min, max] that fits the rect.
  fit(d) {
    if (!d.dataset.max || !d.offsetParent) return;
    let lo = +d.dataset.min, hi = +d.dataset.max;
    // centre / bottom aligned overflow spills to the negative side, which scrollWidth/scrollHeight do not count:
    // measure top-left aligned
    const ai = d.style.alignItems, jc = d.style.justifyContent;
    d.style.alignItems = 'flex-start'; d.style.justifyContent = 'flex-start';
    d.style.fontSize = `${hi}px`;
    const fits = () => d.scrollWidth <= d.clientWidth + 1 && d.scrollHeight <= d.clientHeight + 1;
    if (!fits()) {
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        d.style.fontSize = `${mid}px`;
        if (fits()) lo = mid; else hi = mid;
      }
      d.style.fontSize = `${lo}px`;
    }
    d.style.alignItems = ai; d.style.justifyContent = jc;
  }

  fitTexts(scope) {
    scope.querySelectorAll('.ugui-txt').forEach(d => this.fit(d));
  }
}
