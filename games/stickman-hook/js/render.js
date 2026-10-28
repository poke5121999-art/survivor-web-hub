// Canvas 2D renderer. World units are Unity units (y up); the camera is orthographic like the original
// (CameraConfig: defaultZoom 5 = half the visible height, endGameZoom 15).

const SHADOW_RGB = [0.502, 0.576, 0.447]; // ShadowMaterial._Color, drawn with multiply
const BG = '#008ec5'; // game camera clear colour

export class Renderer {
  constructor(canvas, atlasImg, atlas, fontImg, font) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = atlasImg;
    this.rects = atlas.rects;
    this.fontImg = fontImg;
    this.font = font;
    this.cache = new Map();
    this.dpr = 1;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.cv.clientWidth * this.dpr), h = Math.round(this.cv.clientHeight * this.dpr);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
  }

  // Sprite cut out of the atlas, optionally tinted (multiply) or turned into a silhouette.
  variant(name, tint, silhouette) {
    if (!tint && !silhouette) return null;
    const key = name + (silhouette ? '#s' : '#' + tint.join(','));
    let c = this.cache.get(key);
    if (c) return c;
    const r = this.rects[name];
    c = document.createElement('canvas');
    c.width = r[2]; c.height = r[3];
    const g = c.getContext('2d');
    g.drawImage(this.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    const rgb = silhouette ? SHADOW_RGB : tint;
    g.globalCompositeOperation = silhouette ? 'source-in' : 'multiply';
    g.fillStyle = `rgb(${rgb.map((v) => Math.round(v * 255)).join(',')})`;
    g.fillRect(0, 0, r[2], r[3]);
    if (!silhouette) {
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(this.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    }
    this.cache.set(key, c);
    return c;
  }

  begin(cam) {
    const { ctx, cv } = this;
    this.k = cv.height / (2 * cam.zoom);
    this.cam = cam;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cv.width, cv.height);
    this.drawBackgroundGradient();
  }

  // BackgroundGradient: GradientVertical stretched across the view, following the camera (GradientBackgroundMover).
  drawBackgroundGradient() {
    const r = this.rects.GradientVertical;
    if (!r) return;
    const { ctx, cv, cam } = this;
    const sy = 0.5434 * (cam.zoom / 5);
    const hWorld = (r[3] / r[7]) * sy;
    const topWorld = cam.y - 0.05 + (r[5] / r[7]) * sy;
    const k = this.k;
    const top = cv.height / 2 - (topWorld - cam.y) * k;
    // only the centre column: the sprite's side columns fade out and would show as stripes when stretched
    ctx.drawImage(this.img, r[0] + (r[2] >> 1), r[1], 1, r[3], 0, top, cv.width, hWorld * k);
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
    if (!r) return;
    const { ctx } = this;
    this.setWorld(m);
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.globalCompositeOperation = opts.shadow ? 'multiply' : 'source-over';
    const src = this.variant(name, opts.tint, opts.shadow);
    ctx.transform(1 / r[6], 0, 0, -1 / r[7], 0, 0);
    if (src) ctx.drawImage(src, -r[4], -r[5]);
    else ctx.drawImage(this.img, r[0], r[1], r[2], r[3], -r[4], -r[5], r[2], r[3]);
  }

  // drawMode Tiled (finish line checker): repeat the sprite over `size` world units centred on the pivot.
  tiled(name, m, size, shadow) {
    const r = this.rects[name];
    const key = name + '#tile' + (shadow ? 's' : '');
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
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = shadow ? 'multiply' : 'source-over';
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
  text(str, x, y, px, align = 0.5, alpha = 1) {
    const { ctx, font, dpr } = this;
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
      if (g[2] > 1) ctx.drawImage(this.fontImg, g[0], g[1], g[2], g[3], cx + g[4] * s, base - g[5] * s, g[2] * s, g[3] * s);
      cx += g[6] * s;
    }
    ctx.globalAlpha = 1;
    return w * s / dpr;
  }
}
