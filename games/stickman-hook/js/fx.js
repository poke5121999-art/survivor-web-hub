// Effect-variant skins (skin.alien_hologram_travelers, ...) reuse the base skin's sheet. Their AllIn1SpriteShader
// material is reduced by tools/build_meta.py to static pixel ops (meta.json fx), baked once per frame by bake(), plus, for
// 35 of the 51 materials, animated ops (art/fx/anim.json, keyed by item id; formulas in build_meta.py SKIN_TEX notes)
// redrawn by Live below at most 30 times a second, only for the frames a caller asks for.
// Approximations [ĐỀ XUẤT]: the sprite's atlas position is unknown here, so texture-UV patterns (glitch cells, hologram
// stripes, distortion noise, outline texture) start at the sprite's bottom-left corner; the outline test is "first opaque
// pixel along each of the 8 (4) sample directions is within the radius" instead of one sample at exactly the radius;
// with greyscale, the glitched green sample is mixed after the grey tint instead of before it.

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fract = (x) => x - Math.floor(x);

function hsvShift(r, g, b, shift, sat, bright) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + shift) % 360) + 360) % 360;
  const s = clamp((mx ? d / mx : 0) * sat), v = clamp(mx * bright);
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const k = Math.floor(h / 60);
  const [R, G, B] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
  return [R + m, G + m, B + m];
}

// Per-pixel ops: f(rgb, u, v, op, alpha) -> rgb, with u, v in 0..1 across the frame (v = 0 at the top).
const PIXEL = {
  chg(c, u, v, [, t, n, tol]) {
    if (Math.hypot(c[0] - t[0], c[1] - t[1], c[2] - t[2]) > Math.max(tol, 0.08)) return c;
    const k = lum(...c) / Math.max(0.05, lum(...t));
    return [clamp(n[0] * k), clamp(n[1] * k), clamp(n[2] * k)];
  },
  hsv: (c, u, v, [, sh, sa, br]) => hsvShift(c[0], c[1], c[2], sh, sa, br),
  swap: (c, u, v, [, R, G, B]) => [0, 1, 2].map((i) => clamp(c[0] * R[i] + c[1] * G[i] + c[2] * B[i])),
  grey(c, u, v, [, tint, l]) { const y = clamp(lum(...c) + l); return [y * tint[0], y * tint[1], y * tint[2]].map(clamp); },
  neg: (c, u, v, [, a]) => c.map((x) => x + (1 - 2 * x) * a),
  post: (c, u, v, [, n]) => c.map((x) => Math.floor(x * n) / n),
  // GLOW_ON (no glow texture), every program: rgb += rgb * a^2 * _Glow * _GlowColor, clamped by the 8-bit target
  glow: (c, u, v, [, col, k], a) => c.map((x, i) => clamp(x * (1 + a * a * k * col[i]))),
  grad(c, u, v, [, tl, tr, bl, br, k]) {
    return [0, 1, 2].map((i) => {
      const top = tl[i] + (tr[i] - tl[i]) * u, bot = bl[i] + (br[i] - bl[i]) * u;
      return c[i] + ((top + (bot - top) * v) - c[i]) * k;
    });
  },
};

function pixelate(ctx, w, h, size) {
  const block = Math.max(2, Math.round((Math.max(w, h) / size) * 4)); // [ĐỀ XUẤT] _PixelateSize is in texture UV steps
  const t = document.createElement('canvas');
  t.width = Math.ceil(w / block); t.height = Math.ceil(h / block);
  const g = t.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(ctx.canvas, 0, 0, t.width, t.height);
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(t, 0, 0, w, h);
}

// Bakes `ops` onto the sprite rect [x, y, w, h] of `img`. Returns {canvas, pad}: the outline pass grows the canvas
// by `pad` pixels on every side, so the caller shifts the pivot by `pad`.
export function bake(img, r, ops) {
  const [sx, sy, w, h] = r;
  const out = ops.find((o) => o[0] === 'out');
  const pad = out ? Math.max(1, Math.round(out[3] * Math.max(w, h))) : 0;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  const px = ops.filter((o) => PIXEL[o[0]]);
  if (px.length) {
    const id = g.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const p = i >> 2, u = (p % w) / w, v = Math.floor(p / w) / h, a = d[i + 3] / 255;
      let col = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
      for (const o of px) col = PIXEL[o[0]](col, u, v, o, a);
      d[i] = col[0] * 255; d[i + 1] = col[1] * 255; d[i + 2] = col[2] * 255;
    }
    g.putImageData(id, 0, 0);
  }
  const pix = ops.find((o) => o[0] === 'pix');
  if (pix) pixelate(g, w, h, pix[1]);
  const holo = ops.find((o) => o[0] === 'holo');
  if (holo) {
    // hologram stripes: alternate rows between the material's min and max alpha
    g.globalCompositeOperation = 'destination-out';
    for (let y = 0; y < h; y += 6) { g.fillStyle = `rgba(0,0,0,${1 - holo[1]})`; g.fillRect(0, y, w, 3); }
    g.fillStyle = `rgba(0,0,0,${1 - holo[2]})`;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }
  if (!pad) return { canvas: c, pad: 0 };
  const o = document.createElement('canvas');
  o.width = w + 2 * pad; o.height = h + 2 * pad;
  const og = o.getContext('2d');
  const sil = document.createElement('canvas');
  sil.width = w; sil.height = h;
  const sg = sil.getContext('2d');
  sg.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = `rgb(${out[1].map((v) => Math.round(v * 255)).join(',')})`;
  sg.fillRect(0, 0, w, h);
  og.globalAlpha = out[2];
  for (let a = 0; a < 16; a++) og.drawImage(sil, pad + Math.cos(a * Math.PI / 8) * pad, pad + Math.sin(a * Math.PI / 8) * pad);
  og.globalAlpha = 1;
  og.drawImage(c, pad, pad);
  return { canvas: o, pad };
}

// ---- animated variants ---------------------------------------------------------------------------------------------
const NOISE = 64; // art/fx/noise.webp: 64 x 64 tiles side by side; art/fx/outline.webp: 256 x 8 per texture
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const FPS = 30;

// GLITCH's hash: fract(sin(dot(p, (127.1, 311.7))) * 43758.5469)
const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5469);

function pixels(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
}

class Live {
  constructor(img, ops, A, tex) {
    this.img = img; this.A = A; this.tex = tex;
    [, this.Tw, this.Th, this.atlas] = A.t;
    // the static passes this redraws itself, as the shader does: outline (ol) and hologram stripes (hs)
    this.ops = ops.filter((o) => !(o[0] === 'out' && A.ol) && !(o[0] === 'holo' && A.hs));
    this.grey = ops.some((o) => o[0] === 'grey');
    this.perPixel = !!(A.gl || A.ca || A.fl || A.hs || A.rw || A.ol); // shake alone only moves the pivot
    this.st = new Map();
    this.buf = null;
    this.renders = 0;
  }

  setup(r) {
    const { A } = this;
    const { canvas: base, pad: bp } = bake(this.img, r, this.ops);
    if (!this.perPixel) {
      const rect = [0, 0, base.width, base.height, r[4] + bp, r[5] + bp, r[6]];
      return { c: base, rect, piv: rect.slice(4, 6), out: [base, rect] };
    }
    // room for the widest outline: width + 0.1 * amount of the texture (noise at 0 or 1), in sheet pixels (texels / 2)
    const P = A.ol ? Math.ceil((A.ol[3] + 0.1 * (A.od ? A.od[3] : 0) * this.Tw) / 2) + 1 : 0;
    const W = base.width + 2 * P, H = base.height + 2 * P;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(base, P, P);
    const src = g.getImageData(0, 0, W, H).data;
    const rect = [0, 0, W, H, r[4] + bp + P, r[5] + bp + P, r[6]];
    const s = { c, g, src, W, H, ox: P + bp, oy: P + bp, sw: r[2], sh: r[3], rect, piv: rect.slice(4, 6), out: [c, rect], t: null };
    if (A.ol) {
      // D: distance in sheet pixels to the first opaque pixel (alpha > 0.05) along the sample directions, 255 = none
      const D = new Uint8Array(W * H).fill(255), dirs = DIRS.slice(0, A.ol[5]);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (src[(y * W + x) * 4 + 3] === 255) continue;
          find: for (let k = 1; k <= P; k++) {
            for (const [dx, dy] of dirs) {
              const X = x + dx * k, Y = y + dy * k;
              if (X >= 0 && Y >= 0 && X < W && Y < H && src[(Y * W + X) * 4 + 3] > 12) { D[y * W + x] = k; break find; }
            }
          }
        }
      }
      s.D = D;
    }
    return s;
  }

  state(name, r) {
    let s = this.st.get(name);
    if (!s) this.st.set(name, (s = this.setup(r)));
    return s;
  }

  get(name, r, t, force) {
    const s = this.state(name, r), { A } = this;
    if (this.perPixel && (force || s.t === null || Math.abs(t - s.t) >= 1 / FPS)) { this.render(s, t); s.t = t; }
    if (A.sh) {
      // SHAKEUV: the sample moves by 0.01 uv, so the picture moves the other way: pivot + offset (y flipped)
      const ph = (t / 20) * A.sh[1] * 500;
      s.rect[4] = s.piv[0] + 0.01 * Math.sin(ph * A.sh[2]) * this.Tw / 2;
      s.rect[5] = s.piv[1] - 0.01 * Math.sin(ph * A.sh[3]) * this.Th / 2;
    }
    return s.out;
  }

  render(s, t) {
    this.renders++;
    const { A, Tw, Th, atlas, tex } = this, { W, H, src, ox, oy, sw, sh, D } = s;
    if (!this.buf || this.buf.width < W || this.buf.height < H) {
      this.buf = new ImageData(Math.max(W, this.buf ? this.buf.width : 0), Math.max(H, this.buf ? this.buf.height : 0));
    }
    const out = this.buf.data, BW = this.buf.width;
    const kx = 2 / Tw, ky = 2 / Th; // sheet pixel -> texture uv (sheets are half size)
    const ru = sw * kx, rv = sh * ky; // the sprite's extent in texture uv (ATLAS_ON divides by it)
    const at = (x, y) => {
      const X = Math.round(x), Y = Math.round(y);
      return X < 0 || Y < 0 || X >= W || Y >= H ? -1 : (Y * W + X) * 4;
    };
    // per-frame constants
    const fl = A.fl && (fract(3 * t * A.fl[1] + 0.05) <= 1 - A.fl[2] ? 1 : 0), flA = A.fl ? A.fl[3] : 0;
    const hs = A.hs, hsH = hs ? hs[1] + hs[2] : 1, hsU = hs ? hs[2] / hsH : 0, hsS = hs ? fract(t / 20) * hs[3] : 0;
    const hsK = hs ? clamp(hs[5]) - hs[4] : 0;
    const gl = A.gl, GS = gl ? gl[2] : 0;
    const tq0 = Math.floor(fract(t / 20) * 12 + 50), tq1 = Math.floor(fract(t) * 12 + 50);
    const gk = gl ? 0.02 * gl[1] * hash(tq0 * 2, tq1) * Tw / 2 : 0;
    const split = !!(gl || A.ca), caPx = A.ca ? A.ca[1] * 0.1 * Tw / 2 : 0, caA = A.ca ? A.ca[2] : 0;
    const rw = A.rw, rwPh = rw ? t * rw[2] * 0.1 : 0, rwK = rw ? rw[1] * 0.1 : 0, asp = document.body.clientWidth / Math.max(1, document.body.clientHeight);
    const ol = A.ol, od = A.od, ot = A.ot;
    const ow = ol ? ol[3] : 0, oa = ol ? ol[2] : 0, om = ol ? ol[4] : 0;
    const oc = ol ? ol[1].map((v) => clamp(v * om) * 255) : null;
    const scroll = (sp) => [fract((t / 20) * sp[0]) / (atlas ? ru : 1), fract((t / 20) * sp[1]) / (atlas ? rv : 1)];
    const odS = od && scroll(od[4]), otS = ot && scroll(ot[3]);
    const noise = od && tex.noise, nx0 = od ? od[1] * NOISE : 0, oamt = od ? 0.2 * od[3] * Tw : 0;
    const otex = ot && tex.outline;
    for (let Y = 0; Y < H; Y++) {
      const y = Y - oy, v = (sh - y) * ky, lv = (sh - y) / sh, V = atlas ? lv : v;
      const ha = hs ? (() => { const q = fract((V + hsS) / hsH); return q < hsU ? 1 : hs[4] + clamp(q - hsU) * hsK; })() : 1;
      for (let X = 0; X < W; X++) {
        const x = X - ox, u = x * kx, lu = x / sw;
        let sx = X, sy = Y;
        if (rw) {
          const dx = 0.5 - lu, dy = (0.5 - lv) * asp;
          const o = Math.sin((rwPh - Math.sqrt(dx * dx + dy * dy)) * 66.6667) * rwK;
          sx += (o * Tw) / 2; sy -= (o * Th) / 2;
        }
        let r, g, b, a;
        if (split) {
          let gdx = 0;
          if (gl) {
            const c0 = Math.floor(24 * GS * u) * 4 * tq0, c1 = Math.floor(19 * GS * (v - 0.5)) * 4 * tq1;
            const d0 = Math.floor(38 * GS * u) * 4 * tq0, d1 = Math.floor(14 * GS * (v - 0.5)) * 4 * tq1;
            const r1 = hash(c0, c1), r2 = hash(d0, d1);
            gdx = r1 * r1 * r1 * r2 * r2 * r2 * gk;
          }
          const iG = at(sx + gdx, sy), iR = at(sx + caPx, sy), iB = at(sx - caPx, sy);
          const aG = iG < 0 ? 0 : src[iG + 3] / 255, aR = iR < 0 ? 0 : src[iR + 3] / 255, aB = iB < 0 ? 0 : src[iB + 3] / 255;
          a = Math.max(aG, Math.max(aR, aB) * caA);
          if (this.grey) {
            const wR = 0.3 * aR, wG = 0.59 * aG, wB = 0.11 * aB, sum = wR + wG + wB || 1;
            r = ((iR < 0 ? 0 : src[iR] * wR) + (iG < 0 ? 0 : src[iG] * wG) + (iB < 0 ? 0 : src[iB] * wB)) / sum;
            g = ((iR < 0 ? 0 : src[iR + 1] * wR) + (iG < 0 ? 0 : src[iG + 1] * wG) + (iB < 0 ? 0 : src[iB + 1] * wB)) / sum;
            b = ((iR < 0 ? 0 : src[iR + 2] * wR) + (iG < 0 ? 0 : src[iG + 2] * wG) + (iB < 0 ? 0 : src[iB + 2] * wB)) / sum;
          } else {
            r = iR < 0 ? 0 : src[iR]; g = iG < 0 ? 0 : src[iG + 1]; b = iB < 0 ? 0 : src[iB + 2];
          }
        } else {
          const i = rw ? at(sx, sy) : (Y * W + X) * 4;
          if (i < 0) { r = g = b = a = 0; } else { r = src[i]; g = src[i + 1]; b = src[i + 2]; a = src[i + 3] / 255; }
        }
        if (ol && a < 1) {
          const d = D[Y * W + X];
          if (d !== 255) {
            let rad = ow;
            if (od) {
              // bilinear sample of the noise tile (texture v = 0 is the image's bottom row), wrapping
              const nu = (atlas ? lu : u) * od[2][0] + odS[0], nv = (atlas ? lv : v) * od[2][1] + odS[1];
              const fx = fract(nu) * NOISE - 0.5, fy = fract(1 - nv) * NOISE - 0.5;
              const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
              const X0 = (x0 + NOISE) % NOISE, X1 = (x0 + 1) % NOISE, Y0 = (y0 + NOISE) % NOISE, Y1 = (y0 + 1) % NOISE;
              const n00 = noise.d[(Y0 * noise.w + nx0 + X0) * 4], n10 = noise.d[(Y0 * noise.w + nx0 + X1) * 4];
              const n01 = noise.d[(Y1 * noise.w + nx0 + X0) * 4], n11 = noise.d[(Y1 * noise.w + nx0 + X1) * 4];
              const n = ((n00 * (1 - tx) + n10 * tx) * (1 - ty) + (n01 * (1 - tx) + n11 * tx) * ty) / 255;
              rad += (n - 0.5) * oamt;
            }
            if (d <= Math.abs(rad) / 2) {
              let cr = oc[0], cg = oc[1], cb = oc[2], k = oa * (1 - a);
              if (ot) {
                const tu = (atlas ? lu : u) * ot[2][0] + otS[0], tv = (atlas ? lv : v) * ot[2][1] + otS[1];
                // linear along u like the GPU's bilinear fetch: the glow multiplies texel noise (0 / 2 of 255) into stripes
                const fu = fract(tu) * otex.w - 0.5, c0 = Math.floor(fu), w1 = fu - c0, row = (ot[1] * 8 + Math.floor(fract(1 - tv) * 8)) * otex.w;
                const j = (row + ((c0 + otex.w) % otex.w)) * 4, j1 = (row + ((c0 + 1) % otex.w)) * 4, td = otex.d;
                const tc = (q) => (td[j + q] * (1 - w1) + td[j1 + q] * w1) / 255;
                cr = clamp(tc(0) * ol[1][0] * om) * 255;
                cg = clamp(tc(1) * ol[1][1] * om) * 255;
                cb = clamp(tc(2) * ol[1][2] * om) * 255;
                k *= tc(3);
              }
              const A2 = a + k;
              if (A2 > 0) { r = (r * a + cr * k) / A2; g = (g * a + cg * k) / A2; b = (b * a + cb * k) / A2; a = A2; }
            }
          }
        }
        a *= ha;
        if (A.fl) a = clamp(a * fl + flA) * a;
        const o = (Y * BW + X) * 4;
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a * 255;
      }
    }
    s.g.putImageData(this.buf, 0, 0, 0, 0, W, H);
  }
}

// frames {spriteName: [img, rect]} of an effect skin. With animated ops (art/fx/anim.json) each frame is a getter that
// redraws its canvas for performance.now() at most FPS times a second, only when read; static ones are baked here once.
// `fx` describes it for tests: {animated, ops, anim, render(name, t) -> [canvas, rect] at t seconds, renders}.
export async function skinFrames(img, sheet, ops, anim, image) {
  const frames = {};
  if (!anim) {
    for (const [name, r] of Object.entries(sheet)) {
      const { canvas, pad } = bake(img, r, ops);
      frames[name] = [canvas, [0, 0, canvas.width, canvas.height, r[4] + pad, r[5] + pad, r[6]]];
    }
    return { frames, fx: { animated: false, ops, anim: null } };
  }
  const A = Object.fromEntries(anim.map((o) => [o[0], o]));
  const tex = {};
  const [noise, outline] = await Promise.all([A.od && image('./art/fx/noise.webp'), A.ot && image('./art/fx/outline.webp')]);
  if (noise) tex.noise = pixels(noise);
  if (outline) tex.outline = pixels(outline);
  const live = new Live(img, ops, A, tex);
  for (const [name, r] of Object.entries(sheet)) {
    Object.defineProperty(frames, name, { enumerable: true, get: () => live.get(name, r, performance.now() / 1000) });
  }
  const fx = {
    animated: true, ops, anim, perPixel: live.perPixel,
    get renders() { return live.renders; },
    render: (name, t) => live.get(name, sheet[name], t, true),
    // [r, g, b, a] (0..255) of frame `name` at t seconds, at (u, v) in 0..1 of its canvas from the top left
    sample(name, t, u, v) {
      const [c] = live.get(name, sheet[name], t, true);
      const g = c.getContext('2d', { willReadFrequently: true });
      return Array.from(g.getImageData(Math.min(c.width - 1, Math.floor(u * c.width)), Math.min(c.height - 1, Math.floor(v * c.height)), 1, 1).data);
    },
  };
  return { frames, fx };
}
