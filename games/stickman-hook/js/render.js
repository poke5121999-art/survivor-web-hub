// Canvas 2D renderer. World units are Unity units (y up); the camera is orthographic like the original
// (CameraConfig: defaultZoom 5 = half the visible height, endGameZoom 15).

function curve(keys, t) {
  if (!keys.length) return 1;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0 || 1);
    }
  }
  return keys[keys.length - 1][1];
}

function gradient(keys, t) {
  if (!keys.length) return [1, 1, 1];
  let i = 1;
  while (i < keys.length && keys[i][0] < t) i++;
  if (i >= keys.length) return keys[keys.length - 1].slice(1);
  const a = keys[i - 1], b = keys[i], k = (t - a[0]) / (b[0] - a[0] || 1);
  return [1, 2, 3].map((j) => a[j] + (b[j] - a[j]) * Math.max(0, Math.min(1, k)));
}

// Level theme (theme.levelColors): camera clear colour and the ShadowMaterial colour. ShadowMaterial uses the
// Sprites/SolidCol shader, so shadows are flat silhouettes in that colour, not a multiply.
const DEFAULT_THEME = { bg: '#00b4fc', effect: [0, 0.431, 0.906], shadow: [0.22, 0.345, 0.522, 1] };
const css = (c) => `rgb(${c.slice(0, 3).map((v) => Math.round(v * 255)).join(',')})`;

export class Renderer {
  constructor(canvas, atlasImg, atlas, fontImg, font) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = atlasImg;
    this.rects = atlas.rects;
    this.fontImg = fontImg;
    this.font = font;
    this.cache = new Map();
    this.variants = new WeakMap();
    this.theme = DEFAULT_THEME;
    this.dpr = 1;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.cv.clientWidth * this.dpr), h = Math.round(this.cv.clientHeight * this.dpr);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
  }

  // Sprite cut out of a sheet, optionally tinted (multiply) or turned into a silhouette.
  variant(name, tint, silhouette, img = this.img, r = this.rects[name]) {
    if (!tint && !silhouette) return null;
    // one cache per source image: skin frames can be canvases (baked effects), which have no stable string key
    let cache = this.variants.get(img);
    if (!cache) this.variants.set(img, (cache = new Map()));
    const key = name + (silhouette ? '#s' + this.theme.shadow : '#' + tint.join(','));
    let c = cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = r[2]; c.height = r[3];
    const g = c.getContext('2d');
    g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    g.globalCompositeOperation = silhouette ? 'source-in' : 'multiply';
    g.fillStyle = css(silhouette ? this.theme.shadow : tint);
    g.fillRect(0, 0, r[2], r[3]);
    if (!silhouette) {
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    }
    cache.set(key, c);
    return c;
  }

  begin(cam) {
    const { ctx, cv } = this;
    this.k = cv.height / (2 * cam.zoom);
    this.cam = cam;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.theme.bg;
    ctx.fillRect(0, 0, cv.width, cv.height);
    this.drawBackgroundGradient();
  }

  // BackgroundGradient: GradientVertical (white, alpha 0 at the top to 1 at the bottom) tinted with the theme's effect
  // colour (effectBackgroundColor), stretched across the view, following the camera (GradientBackgroundMover).
  // The bottom of every clip's background is that colour (docs/PARITY.md: #006EE7 / #FF7D79 / #F3D248 / #577DE9).
  drawBackgroundGradient() {
    const r = this.rects.GradientVertical;
    if (!r) return;
    const { ctx, cv, cam } = this;
    const src = this.variant('GradientVertical', this.theme.effect || DEFAULT_THEME.effect, false);
    const sy = 0.5434 * (cam.zoom / 5);
    const hWorld = (r[3] / r[7]) * sy;
    const topWorld = cam.y - 0.05 + (r[5] / r[7]) * sy;
    const k = this.k;
    const top = cv.height / 2 - (topWorld - cam.y) * k;
    // only the centre column: the sprite's side columns fade out and would show as stripes when stretched
    ctx.drawImage(src, r[2] >> 1, 0, 1, r[3], 0, top, cv.width, hWorld * k);
  }

  viewMatrix() {
    const k = this.k, { cv, cam } = this;
    return [k, 0, 0, -k, cv.width / 2 - cam.x * k, cv.height / 2 + cam.y * k];
  }

  setWorld(m) {
    const v = this.viewMatrix();
    this.ctx.setTransform(
      v[0] * m[0], v[3] * m[1], v[0] * m[2], v[3] * m[3],
      v[0] * m[4] + v[4], v[3] * m[5] + v[5],
    );
  }

  sprite(name, m, opts = {}) {
    const r = this.rects[name];
    if (r) this.spriteFrom(this.img, name, r, m, opts);
  }

  // r = [x, y, w, h, pivotX, pivotY, ppu, ppuY?] in the sheet `img`
  spriteFrom(img, name, r, m, opts = {}) {
    const { ctx } = this;
    this.setWorld(m);
    ctx.globalAlpha = (opts.alpha ?? 1) * (opts.shadow ? this.theme.shadow[3] : 1);
    ctx.globalCompositeOperation = 'source-over';
    const src = this.variant(name, opts.tint, opts.shadow, img, r);
    ctx.transform(1 / r[6], 0, 0, -1 / (r[7] || r[6]), 0, 0);
    if (src) ctx.drawImage(src, -r[4], -r[5]);
    else ctx.drawImage(img, r[0], r[1], r[2], r[3], -r[4], -r[5], r[2], r[3]);
  }

  // RopeVisual: the rope texture repeated along the rope, `width` world units wide, one tile every `period` units.
  rope(img, r, x0, y0, x1, y1, width, period) {
    const key = img.src + '#rope' + r.join(',');
    let pat = this.cache.get(key);
    if (!pat) {
      const c = document.createElement('canvas'); c.width = r[2]; c.height = r[3];
      c.getContext('2d').drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
      pat = this.ctx.createPattern(c, 'repeat');
      this.cache.set(key, pat);
    }
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-4) return;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const { ctx } = this;
    // local frame: x across the rope, y along it from (x0,y0)
    this.setWorld([uy, -ux, ux, uy, x0, y0]);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const sx = width / r[2], sy = period / r[3];
    pat.setTransform(new DOMMatrix([sx, 0, 0, sy, -width / 2, 0]));
    ctx.fillStyle = pat;
    ctx.fillRect(-width / 2, 0, width, len);
  }

  // TrailRenderer: points [{x,y,t}], newest last; width and colour keyed by age / time.
  trail(points, now, def) {
    if (points.length < 2) return;
    const { ctx } = this;
    this.setWorld([1, 0, 0, 1, 0, 0]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt'; // round caps overlap at every joint and bead a translucent trail
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const age = Math.min(1, (now - b.t) / def.time);
      const w = curve(def.width, age), al = curve(def.alphas, age);
      if (w <= 0 || al <= 0) continue;
      const c = gradient(def.colors, age);
      ctx.strokeStyle = `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${al})`;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  // drawMode Tiled (finish line checker): repeat the sprite over `size` world units centred on the pivot.
  tiled(name, m, size, shadow) {
    const r = this.rects[name];
    const key = name + '#tile' + (shadow ? 's' + this.theme.shadow : '');
    let pat = this.cache.get(key);
    if (!pat) {
      const src = this.variant(name, null, shadow);
      const c = src || (() => {
        const t = document.createElement('canvas'); t.width = r[2]; t.height = r[3];
        t.getContext('2d').drawImage(this.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]); return t;
      })();
      pat = this.ctx.createPattern(c, 'repeat');
      this.cache.set(key, pat);
    }
    const { ctx } = this;
    this.setWorld(m);
    ctx.globalAlpha = shadow ? this.theme.shadow[3] : 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.transform(1 / r[6], 0, 0, -1 / r[7], 0, 0);
    const w = size[0] * r[6], h = size[1] * r[7];
    pat.setTransform(new DOMMatrix([1, 0, 0, 1, -w / 2, -h / 2]));
    ctx.fillStyle = pat;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }

  line(x0, y0, x1, y1, width, color) {
    const { ctx } = this;
    this.setWorld([1, 0, 0, 1, 0, 0]);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // Bitmap text in the game's Junegull font; (x, y) in CSS pixels, align 0 left / 0.5 centre / 1 right.
  // CSS px width of `str` drawn at `px`
  measure(str, px) {
    let w = 0;
    for (const ch of str.toUpperCase()) w += (this.font.glyphs[ch] || this.font.glyphs[' '])[6];
    return (w * px) / this.font.size;
  }

  // The baked font is white with a dark outline; `color` multiplies the fill (TMP <color=...>), the outline stays dark.
  fontIn(color) {
    if (!color) return this.fontImg;
    const key = 'font#' + color;
    let c = this.cache.get(key);
    if (!c) {
      const f = this.fontImg;
      c = document.createElement('canvas'); c.width = f.width; c.height = f.height;
      const g = c.getContext('2d');
      g.drawImage(f, 0, 0);
      g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(f, 0, 0);
      this.cache.set(key, c);
    }
    return c;
  }

  // Screen-space rectangle in CSS px.
  rect(x, y, w, h, color, alpha = 1) {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color;
    ctx.fillRect(x * dpr, y * dpr, w * dpr, h * dpr);
    ctx.globalAlpha = 1;
  }

  text(str, x, y, px, align = 0.5, alpha = 1, color = null) {
    const { ctx, font, dpr } = this;
    const img = this.fontIn(color);
    const s = (px * dpr) / font.size;
    const up = str.toUpperCase();
    let w = 0;
    for (const ch of up) w += (font.glyphs[ch] || font.glyphs[' '])[6];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'source-over';
    let cx = x * dpr - w * s * align;
    const base = y * dpr + font.ascent * s * 0.5;
    for (const ch of up) {
      const g = font.glyphs[ch] || font.glyphs[' '];
      if (g[2] > 1) ctx.drawImage(img, g[0], g[1], g[2], g[3], cx + g[4] * s, base - g[5] * s, g[2] * s, g[3] * s);
      cx += g[6] * s;
    }
    ctx.globalAlpha = 1;
    return w * s / dpr;
  }
}
