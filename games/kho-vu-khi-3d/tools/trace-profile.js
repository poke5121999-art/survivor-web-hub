// Trace silhouettes of the reference guns (and any other cell listed in tools/trace-config.json) into outline data.
//   node tools/trace-profile.js            -> lib/guns/<id>.json, lib/guns/data.js, ref/trace/<id>.png (debug overlay)
// Pipeline per cell image: background plane fit from the border ring -> threshold -> close -> fill holes -> largest
// component -> Moore contour trace -> Douglas-Peucker (40-120 points). Parts are the same pipeline run on
// (mask AND rect) for the hand-picked rects in the config, so every part is a clean closed outline.
// Coordinates are written in centimetres: origin at the grip pixel, +x toward the muzzle (config.dir), +y up.
const fs = require('fs'), path = require('path');
const { createRequire } = require('module');
const req = createRequire(__filename);
const { chromium } = req('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core');
const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/trace-config.json'), 'utf8'));

// ---- runs inside the page ----
function pageTrace(dataUrl, opt) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const Z = opt.zoom || 4;                       // upsample for smoother contours
      const W = img.width * Z, H = img.height * Z;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const cx = cv.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
      cx.drawImage(img, 0, 0, W, H);
      const px = cx.getImageData(0, 0, W, H).data;
      // background plane fit (per channel) on the border ring, two passes to drop outliers
      const ring = [];
      for (let x = 0; x < W; x += 3) { ring.push([x, 0], [x, H - 1]); }
      for (let y = 0; y < H; y += 3) { ring.push([0, y], [W - 1, y]); }
      const fit = (pts) => {
        const out = [];
        for (let c = 0; c < 3; c++) {
          // solve a + b x + c y by normal equations
          let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, sv = 0, sxv = 0, syv = 0;
          for (const [x, y] of pts) { const v = px[(y * W + x) * 4 + c]; n++; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; sv += v; sxv += x * v; syv += y * v; }
          const A = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], B = [sv, sxv, syv];
          const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
          const D = det(A), sol = [];
          for (let k = 0; k < 3; k++) { const M = A.map((r, i) => r.map((v, j) => (j === k ? B[i] : v))); sol.push(det(M) / D); }
          out.push(sol);
        }
        return out;
      };
      const bgAt = (f, x, y, c) => f[c][0] + f[c][1] * x + f[c][2] * y;
      let f = fit(ring);
      const good = ring.filter(([x, y]) => { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(px[(y * W + x) * 4 + c] - bgAt(f, x, y, c))); return d < 14; });
      if (good.length > 20) f = fit(good);
      const thr = opt.thr || 13;
      let mask = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let d = 0; const i = (y * W + x) * 4;
        for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(px[i + c] - bgAt(f, x, y, c)));
        mask[y * W + x] = d > thr ? 1 : 0;
      }
      const dil = (m, r) => { const o = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!m[y * W + x]) continue; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) o[yy * W + xx] = 1; } } return o; };
      const ero = (m, r) => { const o = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let ok = 1; for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || !m[yy * W + xx]) { ok = 0; break; } } o[y * W + x] = ok; } return o; };
      const close = (m, r) => ero(dil(m, r), r);
      const fill = (m) => { // fill holes: flood from border over zeros
        const seen = new Uint8Array(W * H), st = [];
        const push = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (seen[i] || m[i]) return; seen[i] = 1; st.push(i); };
        for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); } for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
        while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
        const o = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) o[i] = (m[i] || !seen[i]) ? 1 : 0; return o;
      };
      const largest = (m) => {
        const lab = new Int32Array(W * H); let best = 0, bestN = 0, id = 0;
        for (let s = 0; s < W * H; s++) { if (!m[s] || lab[s]) continue; id++; let n = 0; const st = [s]; lab[s] = id; while (st.length) { const i = st.pop(); n++; const x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (m[j] && !lab[j]) { lab[j] = id; st.push(j); } } } if (n > bestN) { bestN = n; best = id; } }
        const o = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) o[i] = lab[i] === best ? 1 : 0; return o;
      };
      const contour = (m) => { // Moore neighbour tracing
        let sx = -1, sy = -1;
        for (let y = 0; y < H && sx < 0; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { sx = x; sy = y; break; }
        if (sx < 0) return [];
        const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
        const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x];
        const pts = [[sx, sy]]; let cxp = sx, cyp = sy, d = 6, guard = 0;
        do {
          let found = false;
          for (let k = 0; k < 8; k++) { const nd = (d + 6 + k) % 8, nx = cxp + dirs[nd][0], ny = cyp + dirs[nd][1]; if (at(nx, ny)) { cxp = nx; cyp = ny; d = nd; found = true; break; } }
          if (!found) break; pts.push([cxp, cyp]);
        } while ((cxp !== sx || cyp !== sy) && ++guard < 400000);
        return pts;
      };
      const dp1 = (pts, eps) => {
        const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
        const st = [[0, pts.length - 1]];
        while (st.length) {
          const [a, b] = st.pop(); let md = 0, mi = -1; const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
          for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > md) { md = d; mi = i; } }
          if (md > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
        }
        return pts.filter((_, i) => keep[i]);
      };
      const dp = (pts, eps) => { // closed loop: split at the point farthest from the start
        let fi = 0, fd = 0; for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; fi = i; } }
        const A = dp1(pts.slice(0, fi + 1), eps), B = dp1(pts.slice(fi), eps);
        return A.concat(B.slice(1, -1));
      };
      const simplify = (pts, lo, hi) => { // choose eps so count lands in [lo,hi]
        let e0 = 0.3, e1 = 30, best = dp(pts, 1);
        for (let it = 0; it < 18; it++) { const e = (e0 + e1) / 2, r = dp(pts, e); best = r; if (r.length > hi) e0 = e; else if (r.length < lo) e1 = e; else break; }
        return best;
      };
      const avgColor = (m) => { const v = [[], [], []]; for (let i = 0; i < W * H; i += 5) if (m[i]) for (let c = 0; c < 3; c++) v[c].push(px[i * 4 + c]); return v.map((a) => { a.sort((p, q) => p - q); return a.length ? a[(a.length * 0.6) | 0] : 0; }); };
      const core = close(mask, Z);
      const base = largest(fill(core));
      const shapeOf = (m, lo, hi) => { // m unfilled part mask -> outline + enclosed holes
        const cm = largest(close(m, Z / 2 | 0 || 1)), fl = fill(cm);
        const hm = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) hm[i] = fl[i] && !cm[i] ? 1 : 0;
        const holes = [];
        const lab = new Int32Array(W * H);
        for (let s0 = 0; s0 < W * H; s0++) {
          if (!hm[s0] || lab[s0]) continue; const comp = new Uint8Array(W * H); let n = 0; const st = [s0]; lab[s0] = 1; comp[s0] = 1;
          while (st.length) { const i = st.pop(); n++; const x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (hm[j] && !lab[j]) { lab[j] = 1; comp[j] = 1; st.push(j); } } }
          if (n / (Z * Z) >= (opt.holeMin || 30)) { const hc = contour(comp); if (hc.length > 8) holes.push(simplify(hc, 6, 24)); }
        }
        const oc = contour(fl);
        return { outline: oc.length > 8 ? simplify(oc, lo, hi) : [], holes, mask: cm };
      };
      const result = { Z, W, H, outline: simplify(contour(base), opt.minPts || 40, opt.maxPts || 120), parts: [], color: avgColor(base) };
      const claimed = new Uint8Array(W * H);
      for (const p of opt.parts || []) {
        const m = new Uint8Array(W * H);
        const [x0, y0, x1, y1] = p.rect.map((v) => v * Z);
        for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1); x++) { const i = y * W + x; if (core[i] && !claimed[i]) m[i] = 1; }
        const sh = shapeOf(m, p.minPts || 20, p.maxPts || 70);
        for (let i = 0; i < W * H; i++) if (sh.mask[i]) claimed[i] = 1;
        result.parts.push({ name: p.name, outline: sh.outline, holes: sh.holes, color: avgColor(sh.mask), area: sh.mask.reduce((a, b) => a + b, 0) / (Z * Z) });
      }
      // debug overlay
      const dv = document.createElement('canvas'); dv.width = W; dv.height = H; const dx = dv.getContext('2d'); dx.drawImage(img, 0, 0, W, H);
      dx.lineWidth = 2; dx.strokeStyle = '#ff00ff'; dx.beginPath(); result.outline.forEach(([x, y], i) => (i ? dx.lineTo(x, y) : dx.moveTo(x, y))); dx.closePath(); dx.stroke();
      const cols = ['#00ff88', '#ffdd00', '#00ccff', '#ff8800', '#ff4466', '#aa88ff', '#88ff00'];
      result.parts.forEach((p, k) => { dx.strokeStyle = cols[k % cols.length]; dx.beginPath(); p.outline.forEach(([x, y], i) => (i ? dx.lineTo(x, y) : dx.moveTo(x, y))); dx.closePath(); dx.stroke(); dx.strokeStyle = '#ffffff'; for (const h of p.holes) { dx.beginPath(); h.forEach(([x, y], i) => (i ? dx.lineTo(x, y) : dx.moveTo(x, y))); dx.closePath(); dx.stroke(); } });
      result.debug = dv.toDataURL('image/png');
      resolve(result);
    };
    img.src = dataUrl;
  });
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  fs.mkdirSync(path.join(ROOT, 'lib/guns'), { recursive: true }); fs.mkdirSync(path.join(ROOT, 'ref/trace'), { recursive: true });
  const all = {};
  const only = process.argv[2];
  for (const g of cfg.guns) {
    if (only && g.id !== only) continue;
    const png = fs.readFileSync(path.join(ROOT, 'ref/cells', String(g.cell).padStart(2, '0') + '.png')).toString('base64');
    const r = await page.evaluate(`(${pageTrace.toString()})('data:image/png;base64,${png}', ${JSON.stringify({ parts: g.parts, thr: g.thr, zoom: g.zoom })})`);
    fs.writeFileSync(path.join(ROOT, 'ref/trace', g.id + '.png'), Buffer.from(r.debug.split(',')[1], 'base64'));
    // pixel -> cm: scale from the muzzle-to-butt extent of the outline
    const xs = r.outline.map((p) => p[0]), ys = r.outline.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const s = g.lengthCm / (g.axis === 'y' ? (maxY - minY) : (maxX - minX));           // cm per (zoomed) pixel
    const gx = g.grip === 'auto' ? (minX + maxX) / 2 : g.grip[0] * r.Z, gy = g.grip === 'auto' ? maxY : g.grip[1] * r.Z;
    const T = (pts) => pts.map(([x, y]) => [+(((x - gx) * s)).toFixed(2), +(((gy - y) * s)).toFixed(2)]);
    const data = {
      id: g.id, cell: g.cell, lengthCm: g.lengthCm, cmPerPx: +(s * r.Z).toFixed(4), bboxPx: [minX / r.Z, minY / r.Z, maxX / r.Z, maxY / r.Z],
      color: r.color, gripPx: g.grip === 'auto' ? [(minX + maxX) / 2 / r.Z, maxY / r.Z] : g.grip, outline: T(r.outline),
      parts: r.parts.map((p, i) => ({ name: p.name, color: p.color, area: p.area, outline: T(p.outline), holes: p.holes.map(T), ...(g.parts[i].extra || {}) })),
    };
    fs.writeFileSync(path.join(ROOT, 'lib/guns', g.id + '.json'), JSON.stringify(data));
    all[g.id] = data;
    console.log(g.id, 'outline pts', data.outline.length, 'parts', data.parts.map((p) => p.name + ':' + p.outline.length).join(' '));
  }
  if (!only) fs.writeFileSync(path.join(ROOT, 'lib/guns/data.js'), '// generated by tools/trace-profile.js - do not edit\nexport default ' + JSON.stringify(all) + ';\n');
  await browser.close();
})();
