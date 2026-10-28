// Effect-variant skins (skin.alien_hologram_travelers, ...) reuse the base skin's sheet. Their AllIn1SpriteShader
// material is reduced by tools/build_meta.py to a list of ops, baked once per frame here. Approximations [ĐỀ XUẤT]:
// animated passes (glitch, flicker, shake, wave, fade dissolve, colour ramp textures) are left out.

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

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

// Per-pixel ops: f(rgb, u, v, op) -> rgb, with u, v in 0..1 across the frame (v = 0 at the top).
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
  // _GlowColor * _Glow without the glow mask texture: a weak additive wash [ĐỀ XUẤT] 1/10 of the shader's strength
  glow: (c, u, v, [, col, k]) => c.map((x, i) => clamp(x + col[i] * Math.min(1, k / 10))),
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
      const p = i >> 2, u = (p % w) / w, v = Math.floor(p / w) / h;
      let col = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
      for (const o of px) col = PIXEL[o[0]](col, u, v, o);
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
