export function createSurface(width, height, bg = [0, 0, 0, 0]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(bg, i);
  return { width, height, data };
}

function sampleBilinear(img, u, v, out) {
  const x = u * img.width - 0.5, y = v * img.height - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const w = img.width, h = img.height, d = img.data;
  out[0] = out[1] = out[2] = out[3] = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const px = Math.min(w - 1, Math.max(0, x0 + i)), py = Math.min(h - 1, Math.max(0, y0 + j));
    const k = (i ? fx : 1 - fx) * (j ? fy : 1 - fy), o = (py * w + px) * 4, a = d[o + 3] * k;
    out[0] += d[o] * a; out[1] += d[o + 1] * a; out[2] += d[o + 2] * a; out[3] += a;
  }
}

const BLEND = {
  normal: (s, sa, d, da) => s * sa + d * (1 - sa),
  additive: (s, sa, d) => s * sa + d,
  multiply: (s, sa, d) => s * sa * d / 255 + d * (1 - sa),
  screen: (s, sa, d) => s * sa + d - s * sa * d / 255,
};

function sampleNearest(img, u, v, out) {
  const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width))), y = Math.min(img.height - 1, Math.max(0, Math.floor(v * img.height)));
  const o = (y * img.width + x) * 4, a = img.data[o + 3];
  out[0] = img.data[o] * a; out[1] = img.data[o + 1] * a; out[2] = img.data[o + 2] * a; out[3] = a;
}

export function drawTriangles(surf, img, verts, uvs, tris, color = [1, 1, 1, 1], blend = "normal", nearest = false) {
  const sample = nearest ? sampleNearest : sampleBilinear;
  const W = surf.width, H = surf.height, D = surf.data, fn = BLEND[blend] ?? BLEND.normal, s = [0, 0, 0, 0];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const x0 = verts[a * 2], y0 = verts[a * 2 + 1], x1 = verts[b * 2], y1 = verts[b * 2 + 1], x2 = verts[c * 2], y2 = verts[c * 2 + 1];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) continue;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      const cx = px + 0.5, cy = py + 0.5;
      const w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) / area;
      const w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const u = w0 * uvs[a * 2] + w1 * uvs[b * 2] + w2 * uvs[c * 2];
      const v = w0 * uvs[a * 2 + 1] + w1 * uvs[b * 2 + 1] + w2 * uvs[c * 2 + 1];
      sample(img, u, v, s);
      if (s[3] <= 0) continue;
      const sa = (s[3] / 255) * color[3];
      if (sa <= 0) continue;
      const o = (py * W + px) * 4, da = D[o + 3] / 255;
      for (let k = 0; k < 3; k++) D[o + k] = fn((s[k] / s[3]) * color[k], sa, D[o + k], da);
      D[o + 3] = blend === "additive" ? D[o + 3] : (sa + da * (1 - sa)) * 255;
    }
  }
}

export function drawLine(surf, x0, y0, x1, y1, rgba, width = 1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1, r = width / 2;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
    for (let py = Math.floor(y - r); py <= Math.ceil(y + r - 1); py++) for (let px = Math.floor(x - r); px <= Math.ceil(x + r - 1); px++) {
      if (px < 0 || py < 0 || px >= surf.width || py >= surf.height) continue;
      const o = (py * surf.width + px) * 4, a = rgba[3];
      for (let k = 0; k < 3; k++) surf.data[o + k] = rgba[k] * a + surf.data[o + k] * (1 - a);
      surf.data[o + 3] = Math.max(surf.data[o + 3], a * 255);
    }
  }
}
