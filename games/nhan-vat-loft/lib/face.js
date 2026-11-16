// Anime face drawn in code on a canvas laid over the front of the SH head (planar UVs, see lib/char.js face patch).
// Numbers come from the table's face block: eye card boxes, blush boxes, iris / hair / skin colours.
export function drawFace(ctx, size, f) {
  const P = f.plane, X = (x) => ((x - P.x0) / P.w) * size, Y = (y) => (1 - (y - P.y0) / P.h) * size, SX = (s) => (s / P.w) * size, SY = (s) => (s / P.h) * size;
  const rgb = (c, k = 1, add = 0) => `rgb(${c.map((x) => Math.round(Math.min(1, Math.max(0, x * k + add)) * 255)).join(',')})`;
  ctx.clearRect(0, 0, size, size);
  const hair = f.hair || [0.3, 0.2, 0.2], iris = f.iris || [0.3, 0.3, 0.6], skin = f.skin || [0.95, 0.8, 0.7];
  const lash = hair.map((x) => x * 0.25 + 0.04);
  const midX = P.x0 + P.w / 2;
  let eyeY = 0, n = 0;
  for (const e of f.eyes) {
    const ir = e.iris || e.line; if (!ir) continue; const ln = e.line || ir;
    const out = Math.sign(ir.c[0] - midX) || 1; // outer corner direction on the canvas
    const cx = X(ir.c[0]), cy = Y(ir.c[1]), ew = Math.max(SX(ln.w), SX(ir.w)) * 1.05, eh = SY(ir.h) * 1.15;
    eyeY += ir.c[1]; n++;
    // sclera: almond, flatter at the bottom
    ctx.save(); ctx.beginPath();
    ctx.moveTo(cx - out * ew * 0.5, cy + eh * 0.05);
    ctx.bezierCurveTo(cx - out * ew * 0.35, cy - eh * 0.62, cx + out * ew * 0.3, cy - eh * 0.66, cx + out * ew * 0.52, cy - eh * 0.18);
    ctx.bezierCurveTo(cx + out * ew * 0.45, cy + eh * 0.45, cx - out * ew * 0.2, cy + eh * 0.55, cx - out * ew * 0.5, cy + eh * 0.05);
    ctx.closePath(); ctx.fillStyle = '#fbf8f6'; ctx.fill(); ctx.clip();
    // iris with a vertical gradient, pupil, rim
    const rx = ew * 0.3, ry = eh * 0.5, icy = cy + eh * 0.02;
    const g = ctx.createLinearGradient(0, icy - ry, 0, icy + ry);
    g.addColorStop(0, rgb(iris, 0.35)); g.addColorStop(0.45, rgb(iris, 0.85)); g.addColorStop(1, rgb(iris, 1.25, 0.15));
    ctx.beginPath(); ctx.ellipse(cx, icy, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1, ew * 0.025); ctx.strokeStyle = rgb(iris, 0.3); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, icy + ry * 0.05, rx * 0.42, ry * 0.5, 0, 0, Math.PI * 2); ctx.fillStyle = rgb(iris, 0.18); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + out * rx * 0.35, icy - ry * 0.42, rx * 0.36, ry * 0.24, -0.4 * out, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - out * rx * 0.3, icy + ry * 0.45, rx * 0.15, ry * 0.1, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    // upper-lid shadow
    const sh = ctx.createLinearGradient(0, cy - eh * 0.6, 0, cy - eh * 0.1); sh.addColorStop(0, 'rgba(60,30,40,0.35)'); sh.addColorStop(1, 'rgba(60,30,40,0)');
    ctx.fillStyle = sh; ctx.fillRect(cx - ew, cy - eh, ew * 2, eh * 0.9);
    ctx.restore();
    // upper lash line with an outer flick, lower lash
    ctx.beginPath();
    ctx.moveTo(cx - out * ew * 0.55, cy + eh * 0.08);
    ctx.bezierCurveTo(cx - out * ew * 0.36, cy - eh * 0.7, cx + out * ew * 0.32, cy - eh * 0.76, cx + out * ew * 0.62, cy - eh * 0.28);
    ctx.lineTo(cx + out * ew * 0.74, cy - eh * 0.4);
    ctx.lineTo(cx + out * ew * 0.6, cy - eh * 0.12);
    ctx.bezierCurveTo(cx + out * ew * 0.3, cy - eh * 0.6, cx - out * ew * 0.3, cy - eh * 0.56, cx - out * ew * 0.55, cy + eh * 0.08);
    ctx.fillStyle = rgb(lash); ctx.fill();
    ctx.lineWidth = Math.max(1.5, eh * 0.09); ctx.lineCap = 'round'; ctx.strokeStyle = rgb(lash);
    ctx.beginPath(); ctx.moveTo(cx - out * ew * 0.55, cy + eh * 0.08); ctx.bezierCurveTo(cx - out * ew * 0.36, cy - eh * 0.66, cx + out * ew * 0.32, cy - eh * 0.72, cx + out * ew * 0.62, cy - eh * 0.28); ctx.stroke();
    ctx.lineWidth = Math.max(1, eh * 0.04);
    ctx.beginPath(); ctx.moveTo(cx + out * ew * 0.48, cy + eh * 0.2); ctx.quadraticCurveTo(cx + out * ew * 0.1, cy + eh * 0.56, cx - out * ew * 0.15, cy + eh * 0.5); ctx.stroke();
    // brow
    ctx.lineWidth = Math.max(1.5, eh * 0.07); ctx.strokeStyle = rgb(hair, 0.55);
    ctx.beginPath(); ctx.moveTo(cx - out * ew * 0.45, cy - eh * 0.95); ctx.quadraticCurveTo(cx + out * ew * 0.05, cy - eh * 1.22, cx + out * ew * 0.55, cy - eh * 0.98); ctx.stroke();
    // blush
    const bl = e.blush; const bx = bl ? X(bl.c[0]) : cx + out * ew * 0.1, by = bl ? Y(bl.c[1]) : cy + eh * 0.95, bw = bl ? SX(bl.w) * 0.55 : ew * 0.55;
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, bw);
    bg.addColorStop(0, 'rgba(255,120,140,0.45)'); bg.addColorStop(1, 'rgba(255,120,140,0)'); ctx.fillStyle = bg;
    ctx.beginPath(); ctx.ellipse(bx, by, bw, bw * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(230,90,110,0.55)'; ctx.lineWidth = Math.max(1, bw * 0.06);
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(bx + k * bw * 0.32 - bw * 0.08, by + bw * 0.12); ctx.lineTo(bx + k * bw * 0.32 + bw * 0.08, by - bw * 0.12); ctx.stroke(); }
  }
  if (!n) return;
  eyeY /= n;
  // nose tick and mouth
  const chin = f.chinY, mx = X(midX), noseY = Y(chin + (eyeY - chin) * 0.52), mouthY = Y(chin + (eyeY - chin) * 0.3), mw = SX(P.w * 0.07);
  ctx.strokeStyle = rgb(skin, 0.62); ctx.lineWidth = Math.max(1, mw * 0.12); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(mx + mw * 0.05, noseY - mw * 0.15); ctx.lineTo(mx - mw * 0.06, noseY + mw * 0.1); ctx.stroke();
  ctx.strokeStyle = 'rgb(140,60,60)'; ctx.lineWidth = Math.max(1.2, mw * 0.13);
  ctx.beginPath(); ctx.moveTo(mx - mw * 0.5, mouthY - mw * 0.05); ctx.quadraticCurveTo(mx, mouthY + mw * 0.3, mx + mw * 0.5, mouthY - mw * 0.05); ctx.stroke();
}
