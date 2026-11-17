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

// Sprite multiplied by a colour, alpha kept (uGUI Image.color on a white sprite).
const tintCache = new Map();
function tinted(url, c) {
  const key = url + c.join(',');
  if (!tintCache.has(key)) {
    tintCache.set(key, new Promise(res => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = im.width; cv.height = im.height;
        const x = cv.getContext('2d');
        x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, cv.width, cv.height), a = d.data;
        for (let i = 0; i < a.length; i += 4) { a[i] *= c[0]; a[i + 1] *= c[1]; a[i + 2] *= c[2]; }
        x.putImageData(d, 0, 0);
        res(cv.toDataURL());
      };
      im.onerror = () => res(url);
      im.src = url;
    }));
  }
  return tintCache.get(key);
}

export class Hud {
  constructor({ layout, parent, spriteBase, version = '' }) {
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
    this.scale = 1;
    this.size = null;
  }

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
        const url = `${this.spriteBase}/${encodeURIComponent(im.sprite)}.webp${this.q}`;
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
        if (isWhite(im.color)) apply(url); else tinted(url, im.color).then(apply);
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
      d.textContent = VI[raw.trim()] ?? raw;
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
    let w = pw, h = ph, x = 0, y = 0;
    if (i > 0 && r) {
      const [[ax0, ay0], [ax1, ay1]] = this.sliderAnchors(i) || [r.anchorMin, r.anchorMax];
      w = (ax1 - ax0) * pw + r.sizeDelta[0];
      h = (ay1 - ay0) * ph + r.sizeDelta[1];
      let px = (ax0 + (ax1 - ax0) * r.pivot[0]) * pw + r.anchoredPosition[0];
      let py = (ay0 + (ay1 - ay0) * r.pivot[1]) * ph + r.anchoredPosition[1];
      if (slot) { px = slot.x + slot.w / 2 + (r.pivot[0] - 0.5) * w; py = slot.y + slot.h / 2 + (r.pivot[1] - 0.5) * h; }
      x = px - r.pivot[0] * w;
      y = ph - (py - r.pivot[1] * h) - h;
    }
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    this.abs[i] = { x: ax + x, y: ay + y, w, h };
    const kids = this.kids[i];
    const lay = n.layout && n.layout.type === 'horizontal' ? n.layout : null;
    const laid = lay ? kids.filter(k => this.L.nodes[k].active) : [];
    const [pl, pr, pt, pb] = lay ? lay.padding : [0, 0, 0, 0];
    const slotW = laid.length ? (w - pl - pr - lay.spacing * (laid.length - 1)) / laid.length : 0;
    for (const k of kids) {
      const at = laid.indexOf(k);
      const sl = at >= 0 ? { x: pl + at * (slotW + lay.spacing), y: pb, w: slotW, h: h - pt - pb } : null;
      this.place(k, ax + x, ay + y, w, h, sl);
    }
  }

  // TMP auto size: largest size in [min, max] that fits the rect.
  fit(d) {
    if (!d.dataset.max || !d.offsetParent) return;
    let lo = +d.dataset.min, hi = +d.dataset.max;
    d.style.fontSize = `${hi}px`;
    const fits = () => d.scrollWidth <= d.clientWidth + 1 && d.scrollHeight <= d.clientHeight + 1;
    if (fits()) return;
    for (let k = 0; k < 8; k++) {
      const mid = (lo + hi) / 2;
      d.style.fontSize = `${mid}px`;
      if (fits()) lo = mid; else hi = mid;
    }
    d.style.fontSize = `${lo}px`;
  }

  fitTexts(scope) {
    scope.querySelectorAll('.ugui-txt').forEach(d => this.fit(d));
  }
}
