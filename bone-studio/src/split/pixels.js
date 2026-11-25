// Pixel-level steps of "split one image into parts". Images are { width, height, data: Uint8ClampedArray RGBA }.
export const img = (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
const dist2 = (d, o, c) => (d[o] - c[0]) ** 2 + (d[o + 1] - c[1]) ** 2 + (d[o + 2] - c[2]) ** 2;

// Background → alpha: flood fill from the border through pixels close to the border colour.
export function removeBackground(src, { tolerance } = {}) {
  const { width: w, height: h, data: d } = src;
  const out = img(w, h);
  out.data.set(d);
  const border = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const already = border.filter((i) => d[i * 4 + 3] < 8).length;
  if (already > border.length * 0.6) return { image: out, background: null, removed: 0 };
  const med = (k) => { const v = border.map((i) => d[i * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [med(0), med(1), med(2)];
  const spread = Math.sqrt(border.reduce((s, i) => s + dist2(d, i * 4, bg), 0) / border.length);
  const tol2 = (tolerance ?? Math.max(14, spread * 3 + 8)) ** 2;
  const seen = new Uint8Array(w * h), stack = [];
  for (const i of border) if (dist2(d, i * 4, bg) <= tol2) { seen[i] = 1; stack.push(i); }
  let removed = 0;
  while (stack.length) {
    const i = stack.pop();
    out.data[i * 4 + 3] = 0;
    removed++;
    const x = i % w, y = (i / w) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !seen[j] && dist2(d, j * 4, bg) <= tol2) { seen[j] = 1; stack.push(j); }
    }
  }
  return { image: out, background: bg, removed };
}

// Native pixel size of upscaled pixel art. Colour edges repeat every `scale` pixels, so the autocorrelation of the
// per-column (per-row) edge energy peaks at multiples of it. Picks the smallest period whose multiples all peak.
export function detectScale(src) {
  const { width: w, height: h, data: d } = src;
  const gx = new Float64Array(w), gy = new Float64Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (x + 1 < w) gx[x + 1] += Math.abs(d[o] - d[o + 4]) + Math.abs(d[o + 1] - d[o + 5]) + Math.abs(d[o + 2] - d[o + 6]) + Math.abs(d[o + 3] - d[o + 7]);
    if (y + 1 < h) { const q = o + w * 4; gy[y + 1] += Math.abs(d[o] - d[q]) + Math.abs(d[o + 1] - d[q + 1]) + Math.abs(d[o + 2] - d[q + 2]) + Math.abs(d[o + 3] - d[q + 3]); }
  }
  const autocorr = (g) => {
    const n = g.length, mean = g.reduce((a, b) => a + b, 0) / n;
    let v0 = 0;
    for (let x = 0; x < n; x++) v0 += (g[x] - mean) ** 2;
    const ac = new Float64Array(Math.min(n, 80));
    for (let lag = 1; lag < ac.length; lag++) { let s = 0; for (let x = 0; x + lag < n; x++) s += (g[x] - mean) * (g[x + lag] - mean); ac[lag] = s / (v0 || 1); }
    return ac;
  };
  const ax = autocorr(gx), ay = autocorr(gy);
  const at = (ac, t) => { const i = Math.floor(t), f = t - i; return i + 1 < ac.length ? ac[i] * (1 - f) + ac[i + 1] * f : 0; };
  const score = (p) => {
    let s = 0, n = 0;
    for (let k = 1; k * p < 70; k++) { s += at(ax, k * p) + at(ay, k * p); n += 2; }
    // half-way points should be low for a real period
    let off = 0;
    for (let k = 0; (k + 0.5) * p < 70; k++) off += at(ax, (k + 0.5) * p) + at(ay, (k + 0.5) * p);
    return n ? (s - off * (n / Math.max(1, 2 * Math.floor(70 / p + 0.5)))) / n : 0;
  };
  const cands = [];
  for (let p = 2; p <= 24; p += 0.05) cands.push({ p, s: score(p) });
  const max = Math.max(...cands.map((c) => c.s));
  const best = cands.find((c) => c.s >= max * 0.85 && isLocalMax(cands, c)) ?? cands.find((c) => c.s === max);
  // refine on the whole image: grid lines over hundreds of pixels pin the period to ~0.01 px
  const align = (g, p) => {
    let bp = 0, bs = -1;
    for (let ph = 0; ph < p; ph += 0.1) { let s = 0, n = 0; for (let x = ph; x < g.length - 1; x += p) { s += Math.max(g[Math.floor(x)], g[Math.ceil(x)]); n++; } s /= n; if (s > bs) { bs = s; bp = ph; } }
    return { phase: bp, s: bs };
  };
  let scale = best.p, top = -1;
  for (let p = best.p * 0.9; p <= best.p * 1.1; p += 0.01) {
    const s2 = align(gx, p).s + align(gy, p).s;
    if (s2 > top) { top = s2; scale = p; }
  }
  scale = Math.round(scale * 100) / 100;
  return { scale, phaseX: align(gx, scale).phase, phaseY: align(gy, scale).phase, confidence: Math.round(best.s * 100) / 100, pixelArt: scale >= 2 && best.s > 0.15 };
}
function isLocalMax(cands, c) {
  const i = cands.indexOf(c);
  return (!cands[i - 1] || cands[i - 1].s <= c.s) && (!cands[i + 1] || cands[i + 1].s <= c.s);
}

// Resample onto the native grid: each cell takes the most common colour of its inner pixels.
export function toNative(src, { scale, phaseX = 0, phaseY = 0 }) {
  const cols = Math.floor((src.width - phaseX) / scale), rows = Math.floor((src.height - phaseY) / scale);
  const out = img(cols, rows), d = src.data, w = src.width;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = phaseX + c * scale, y0 = phaseY + r * scale, m = scale * 0.2;
    const counts = new Map();
    let alpha = 0, n = 0;
    for (let y = Math.ceil(y0 + m); y < y0 + scale - m; y++) for (let x = Math.ceil(x0 + m); x < x0 + scale - m; x++) {
      const o = (y * w + x) * 4;
      n++;
      if (d[o + 3] < 128) continue;
      alpha++;
      const k = ((d[o] >> 3) << 10) | ((d[o + 1] >> 3) << 5) | (d[o + 2] >> 3);
      const e = counts.get(k);
      if (e) { e.n++; e.r += d[o]; e.g += d[o + 1]; e.b += d[o + 2]; } else counts.set(k, { n: 1, r: d[o], g: d[o + 1], b: d[o + 2] });
    }
    const o = (r * cols + c) * 4;
    if (!n || alpha * 2 < n) continue;
    let best = null;
    for (const e of counts.values()) if (!best || e.n > best.n) best = e;
    out.data[o] = best.r / best.n; out.data[o + 1] = best.g / best.n; out.data[o + 2] = best.b / best.n; out.data[o + 3] = 255;
  }
  return out;
}

// Nearest-neighbour upscale (for previews and comparing against the original).
export function upscale(src, s) {
  const out = img(Math.round(src.width * s), Math.round(src.height * s));
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const o = (y * out.width + x) * 4, i = (Math.min(src.height - 1, Math.floor(y / s)) * src.width + Math.min(src.width - 1, Math.floor(x / s))) * 4;
    out.data[o] = src.data[i]; out.data[o + 1] = src.data[i + 1]; out.data[o + 2] = src.data[i + 2]; out.data[o + 3] = src.data[i + 3];
  }
  return out;
}

export function opaqueBounds(src) {
  let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (src.data[(y * src.width + x) * 4 + 3] > 0) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
