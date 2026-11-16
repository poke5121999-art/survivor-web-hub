// Anime face drawn in code on a canvas laid over the front of the SH head (planar UVs, see lib/char.js face patch).
// Every feature is drawn to numbers measured from the hero's original face decals (tools/char-color.mjs measureFace):
// lash ink bands (x, yTop, yBot), iris / sclera / blush boxes, mouth band, fang box, colours. opts.closed draws a blink.
export function drawFace(ctx, size, f, opts = {}) {
  const P = f.plane, X = (x) => ((x - P.x0) / P.w) * size, Y = (y) => (1 - (y - P.y0) / P.h) * size, SX = (s) => (s / P.w) * size, SY = (s) => (s / P.h) * size;
  const rgb = (c, k = 1, add = 0, a = 1) => `rgba(${c.map((x) => Math.round(Math.min(1, Math.max(0, x * k + add)) * 255)).join(',')},${a})`;
  ctx.clearRect(0, 0, size, size);
  const hair = f.hair || [0.3, 0.2, 0.2], skin = f.skin || [0.95, 0.8, 0.7];
  const midX = P.x0 + P.w / 2;
  // smooth closed path through points (Catmull-Rom as cubic Beziers)
  const smooth = (pts, close) => { if (pts.length < 2) return; ctx.moveTo(pts[0][0], pts[0][1]); const n = pts.length;
    for (let i = 0; i < n - (close ? 0 : 1); i++) { const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const a = close || i > 0 ? p0 : p1, d = close || i < n - 2 ? p3 : p2;
      ctx.bezierCurveTo(p1[0] + (p2[0] - a[0]) / 6, p1[1] + (p2[1] - a[1]) / 6, p2[0] - (d[0] - p1[0]) / 6, p2[1] - (d[1] - p1[1]) / 6, p2[0], p2[1]); } };
  for (const e of f.eyes) {
    const lb = e.lashBox, ir = e.iris; if (!lb && !ir) continue;
    const ink = e.inkCol || [0.12, 0.06, 0.05], iris = e.irisCol || f.iris || [0.3, 0.3, 0.6];
    const band = e.lash || [[lb.c[0] - lb.w / 2, lb.c[1] + lb.h / 2, lb.c[1]], [lb.c[0] + lb.w / 2, lb.c[1] + lb.h / 2, lb.c[1]]];
    const lbh = lb ? lb.h : 0.02; // the lash line is at most a third of the eye-line box tall (corner liner runs are cut)
    const top = band.map(([x, t]) => [X(x), Y(t)]), bot = band.map(([x, t, b], i) => { const e = Math.abs((i / Math.max(1, band.length - 1)) * 2 - 1); return [X(x), Y(Math.max(b, t - lbh * (0.16 - 0.1 * e * e)))]; }); // thinner toward the corners
    const irX = X(ir.c[0]), irY = Y(ir.c[1]), irW = Math.max(SX(ir.w), SY(ir.h) * 0.62), irH = SY(ir.h);
    const lowY = Math.max(e.lower ? Math.max(...e.lower.map(([, t, b]) => Y((t + b) / 2))) : 0, irY + irH * 0.46); // bottom of the eye opening
    const x0 = bot[0][0], x1 = bot[bot.length - 1][0];
    if (opts.closed) {
      // blink: the lash line drops to the middle of the eye as a soft arc
      const cy = (bot.reduce((s, p) => s + p[1], 0) / bot.length + lowY) / 2;
      ctx.beginPath(); ctx.moveTo(x0, cy - irH * 0.05); ctx.quadraticCurveTo((x0 + x1) / 2, cy + irH * 0.22, x1, cy - irH * 0.05);
      ctx.lineWidth = Math.max(2, SY(lb.h) * 0.22); ctx.lineCap = 'round'; ctx.strokeStyle = rgb(ink); ctx.stroke();
    } else {
      // eye opening: under the lash ink, down to an arc through the iris bottom
      ctx.save(); ctx.beginPath();
      ctx.moveTo(x0, bot[0][1]); for (const p of bot) ctx.lineTo(p[0], p[1]);
      ctx.quadraticCurveTo((x0 + x1) / 2 + (x1 - x0) * 0.05, lowY + irH * 0.18, x0, bot[0][1]); ctx.closePath();
      ctx.fillStyle = '#fbf7f4'; ctx.fill(); ctx.clip();
      const g = ctx.createLinearGradient(0, irY - irH / 2, 0, irY + irH / 2);
      g.addColorStop(0, rgb(iris, 0.3)); g.addColorStop(0.5, rgb(iris, 0.9)); g.addColorStop(1, rgb(iris, 1.2, 0.18));
      ctx.beginPath(); ctx.ellipse(irX, irY, irW / 2, irH / 2, 0, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.ellipse(irX, irY + irH * 0.04, irW * 0.22, irH * 0.26, 0, 0, Math.PI * 2); ctx.fillStyle = rgb(iris, 0.15); ctx.fill();
      const out = Math.sign(ir.c[0] - midX) || 1;
      ctx.beginPath(); ctx.ellipse(irX - out * irW * 0.16, irY - irH * 0.2, irW * 0.17, irH * 0.12, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(irX + out * irW * 0.15, irY + irH * 0.2, irW * 0.07, irH * 0.05, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
      const sh = ctx.createLinearGradient(0, irY - irH * 0.6, 0, irY - irH * 0.05); sh.addColorStop(0, rgb(ink, 1, 0, 0.35)); sh.addColorStop(1, rgb(ink, 1, 0, 0));
      ctx.fillStyle = sh; ctx.fillRect(x0 - 4, irY - irH, x1 - x0 + 8, irH);
      ctx.restore();
      // lash ink: the measured upper band as a filled shape, the lower lid as a thin line
      ctx.beginPath(); smooth(top.concat(bot.slice().reverse()), true); ctx.closePath(); ctx.fillStyle = rgb(ink); ctx.fill();
      if (e.lower) { const lw = e.lower.map(([x, t, b]) => [X(x), Y((t + b) / 2)]); ctx.beginPath(); smooth(lw, false); ctx.lineWidth = Math.max(1.2, SY(lb.h) * 0.05); ctx.strokeStyle = rgb(ink, 1, 0, 0.8); ctx.lineCap = 'round'; ctx.stroke(); }
    }
  }
  // brows: measured when painted on the face, else a thin stroke above the lash
  f.eyes.forEach((e, k) => {
    const b = f.brows && f.brows[k], lb = e.lashBox; if (!lb) return;
    const bc = f.browCol || hair.map((x) => x * 0.55); ctx.fillStyle = rgb(bc); ctx.strokeStyle = rgb(bc); ctx.lineCap = 'round';
    if (b && b.length >= 3) { ctx.beginPath(); smooth(b.map(([x, t]) => [X(x), Y(t)]).concat(b.slice().reverse().map(([x, , bt]) => [X(x), Y(bt)])), true); ctx.fill(); return; }
    const out = Math.sign(lb.c[0] - midX) || 1, cx = X(lb.c[0]), cy = Y(lb.c[1] + lb.h * 0.5 + lb.h * 0.55), w = SX(lb.w);
    ctx.lineWidth = Math.max(2, SY(lb.h) * 0.1); ctx.beginPath(); ctx.moveTo(cx - out * w * 0.42, cy + w * 0.06); ctx.quadraticCurveTo(cx + out * w * 0.02, cy - w * 0.09, cx + out * w * 0.48, cy + w * 0.02); ctx.stroke();
  });
  // blush: soft ellipses, no hatching
  for (const e of f.eyes) {
    const bl = e.blush; if (!bl) continue; const c = e.blushCol || [1, 0.55, 0.6];
    const bx = X(bl.c[0]), by = Y(bl.c[1]), rw = SX(bl.w) * 0.5, rh = SY(bl.h) * 0.5;
    ctx.save(); ctx.translate(bx, by); ctx.scale(1, rh / Math.max(rw, 1e-3));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rw); g.addColorStop(0, rgb(c, 1, 0, 0.55)); g.addColorStop(0.6, rgb(c, 1, 0, 0.3)); g.addColorStop(1, rgb(c, 1, 0, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rw, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  // nose and mouth from the face-texture ink
  let m = f.mouth;
  if (!m || !m.box || m.box.w <= 0.004) { // not measurable: a small default mouth a third of the way from chin to eyes
    const ey = f.eyeY || (f.chinY + P.h * 0.5), my = f.chinY + (ey - f.chinY) * 0.3; m = { box: { c: [midX, my], w: P.w * 0.06, h: 0.002 }, col: [0.5, 0.25, 0.25] }; }
  if (m && m.box) {
    if (m.nose) { const nx = X(m.nose.c[0]), ny = Y(m.nose.c[1]); ctx.fillStyle = rgb(skin, 0.7); ctx.beginPath(); ctx.ellipse(nx, ny, Math.max(1.5, SX(0.0025)), Math.max(1.5, SY(0.0018)), 0, 0, Math.PI * 2); ctx.fill(); }
    const line = m.line && m.line.length >= 3 ? m.line : [[m.box.c[0] - m.box.w / 2, m.box.c[1], m.box.c[1]], [m.box.c[0], m.box.c[1] - m.box.h * 0.3, m.box.c[1] - m.box.h * 0.3], [m.box.c[0] + m.box.w / 2, m.box.c[1], m.box.c[1]]];
    const mid = line.map(([x, t, b]) => [X(x), Y((t + b) / 2)]); const th = line.reduce((s, [, t, b]) => s + (t - b), 0) / line.length;
    ctx.strokeStyle = rgb(m.col || [0.45, 0.2, 0.2], 0.9); ctx.lineWidth = Math.max(1.4, Math.min(SY(th) * 0.35, SY(0.0022))); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); smooth(mid, false); ctx.stroke();
    if (f.fang) { // small fang hanging from the mouth line, on the right of the viewer
      const fx = X(f.fang.c[0]), fy = Y(m.box.c[1]) + ctx.lineWidth * 0.3, fs = Math.max(4, SY(Math.min(f.fang.h, 0.006)) * 1.2);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = rgb(m.col || [0.45, 0.2, 0.2], 0.9); ctx.lineWidth = Math.max(1, fs * 0.12);
      ctx.beginPath(); ctx.moveTo(fx - fs * 0.45, fy); ctx.lineTo(fx + fs * 0.45, fy); ctx.lineTo(fx + fs * 0.05, fy + fs); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
}
