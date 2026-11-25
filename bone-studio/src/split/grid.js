// Coordinate grid overlay with digit labels, so a person or an agent can read exact source-pixel positions.
import { img, upscale } from "./pixels.js?v=20261125m";
const FONT = { 0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001", 5: "111100111001111", 6: "111100111101111", 7: "111001001001001", 8: "111101111101111", 9: "111101111001111" };
export function text(im, x, y, s, color, k = 2) {
  for (const ch of String(s)) {
    const g = FONT[ch];
    if (g) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === "1")
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) put(im, x + c * k + dx, y + r * k + dy, color);
    x += 4 * k;
  }
}
export function put(im, x, y, c) {
  if (x < 0 || y < 0 || x >= im.width || y >= im.height) return;
  const o = (y * im.width + x) * 4, a = c[3] ?? 1;
  for (let i = 0; i < 3; i++) im.data[o + i] = c[i] * a + im.data[o + i] * (1 - a);
  im.data[o + 3] = 255;
}
// zoom: output pixels per source pixel; step: grid spacing in source pixels; crop: [x, y, w, h] in source pixels
export function gridOverlay(src, { zoom = 2, step = 20, crop, joints } = {}) {
  const [cx, cy, cw, ch] = crop ?? [0, 0, src.width, src.height];
  const part = img(cw, ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const sx = cx + x, sy = cy + y, o = (y * cw + x) * 4;
    if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
    part.data.set(src.data.subarray((sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4), o);
  }
  const m = 28, up = upscale(part, zoom), out = img(up.width + m, up.height + m);
  for (let i = 0; i < out.data.length; i += 4) out.data.set([20, 20, 24, 255], i);
  for (let y = 0; y < up.height; y++) for (let x = 0; x < up.width; x++) {
    const i = (y * up.width + x) * 4, a = up.data[i + 3] / 255, o = ((y + m) * out.width + x + m) * 4;
    const bg = ((x >> 3) + (y >> 3)) & 1 ? 70 : 90;
    for (let k = 0; k < 3; k++) out.data[o + k] = up.data[i + k] * a + bg * (1 - a);
  }
  const first = (v) => Math.ceil(v / step) * step;
  for (let gx = first(cx); gx < cx + cw; gx += step) {
    const X = m + (gx - cx) * zoom, major = gx % (step * 5) === 0;
    for (let y = m; y < out.height; y++) put(out, X, y, [255, 60, 60, major ? 0.8 : 0.4]);
    if ((gx - first(cx)) % (step * Math.max(1, Math.ceil(28 / (step * zoom)))) === 0) text(out, X - 6, 4, gx, [255, 220, 120], 2);
  }
  for (let gy = first(cy); gy < cy + ch; gy += step) {
    const Y = m + (gy - cy) * zoom, major = gy % (step * 5) === 0;
    for (let x = m; x < out.width; x++) put(out, x, Y, [60, 160, 255, major ? 0.8 : 0.4]);
    text(out, 1, Y - 4, gy, [140, 200, 255], 1);
  }
  for (const [name, [jx, jy]] of Object.entries(joints ?? {})) {
    const X = Math.round(m + (jx - cx) * zoom), Y = Math.round(m + (jy - cy) * zoom);
    for (let d = -5; d <= 5; d++) { put(out, X + d, Y, [255, 255, 0]); put(out, X, Y + d, [255, 255, 0]); }
    void name;
  }
  return out;
}
