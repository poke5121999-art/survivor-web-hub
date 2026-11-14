// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
// Water tower: steel / concrete / spherical tank on slender braced legs, platform ring, railing and ladder.
import { Canvas, M, rng } from './kit.js';

export default {
  id: 'water-tower',
  name: 'Tháp nước',
  variants: 3,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 3) + 3) % 3;
    const S = 60, cx = 30, cz = 30;
    const H = r.int(84, 100);                 // leg height = underside of the tank
    const nLeg = v === 1 ? 6 : 4;
    const R = v === 1 ? 19 : (v === 2 ? 18 : 17);
    const tankH = v === 2 ? 0 : (v === 1 ? 34 : 30);
    const c = new Canvas(S, H + 78, S);
    const shell = v === 1 ? M.concrete : (v === 2 ? M.paint_white : M.steel);
    const legM = v === 1 ? M.rc : M.steel;
    const legT = v === 1 ? 4 : 3;
    const rl = R - 3.5, splay = 4 + r.int(0, 2);
    const ang0 = v === 1 ? 0 : Math.PI / 4;
    const lp = (i, y) => {
      const a = ang0 + i * 2 * Math.PI / nLeg, rr = rl + splay * (1 - y / H);
      return [Math.round(cx + Math.cos(a) * rr), Math.round(cz + Math.sin(a) * rr)];
    };
    // footings + legs
    const top = v === 2 ? H + 7 : H + 1;      // sphere: legs enter the lower shell
    for (let i = 0; i < nLeg; i++) {
      const [bx, bz] = lp(i, 0), [tx, tz] = lp(i, H);
      c.box(bx - 3, 0, bz - 3, bx + 4, 3, bz + 4, M.concrete);
      c.line(bx, 2, bz, tx, top, tz, legM, legT);
    }
    // bracing: two rings of X braces + a horizontal strut ring
    const lv = [0.28, 0.56, 0.84];
    for (let k = 0; k < 2; k++) {
      const y1 = Math.round(H * lv[k]), y2 = Math.round(H * lv[k + 1]);
      for (let i = 0; i < nLeg; i++) {
        const j = (i + 1) % nLeg, [ax, az] = lp(i, y1), [bx, bz] = lp(j, y2), [dx, dz] = lp(j, y1), [ex, ez] = lp(i, y2);
        c.line(ax, y1, az, bx, y2, bz, M.steel, 2);
        c.line(dx, y1, dz, ex, y2, ez, M.steel, 2);
      }
    }
    for (const yy of [Math.round(H * lv[0]), Math.round(H * lv[1]), Math.round(H * lv[2])]) {
      for (let i = 0; i < nLeg; i++) { const j = (i + 1) % nLeg, [ax, az] = lp(i, yy), [bx, bz] = lp(j, yy); c.line(ax, yy, az, bx, yy, bz, M.steel, 2); }
    }
    // tank
    let ty1;
    if (v === 2) {
      const cy = H + 20;
      c.sphere(cx, cy, cz, R, shell);
      c.sphere(cx, cy, cz, R - 2, 0);          // hollow
      // equator girth band and pole spike
      for (let y = cy - 1; y <= cy; y++) c.cylY(cx, cz, R + 0.5, y, y + 1, M.steel, R - 1.5);
      c.box(cx - 1, cy + R - 1, cz - 1, cx + 1, cy + R + 8, cz + 1, M.steel);
      c.set(cx - 1, cy + R + 8, cz - 1, M.lamp); c.set(cx, cy + R + 8, cz - 1, M.lamp); c.set(cx - 1, cy + R + 8, cz, M.lamp); c.set(cx, cy + R + 8, cz, M.lamp);
      ty1 = cy + R + 9;
    } else {
      const wt = v === 1 ? 3 : 2;
      c.cylY(cx, cz, R, H, H + tankH, shell);
      c.cylY(cx, cz, R - wt, H + 3, H + tankH, 0);   // hollow, 3 voxel floor
      // roof cone (stepped shell)
      const cone = v === 1 ? 7 : 11;
      for (let k = 0; k < cone; k++) {
        const rr = R - (R - 3) * k / cone;
        c.cylY(cx, cz, rr, H + tankH + k, H + tankH + k + 1, v === 1 ? M.concrete : M.sheet_zinc, Math.max(0, rr - 2.6));
      }
      c.cylY(cx, cz, 3, H + tankH + cone, H + tankH + cone + 1, M.steel);
      c.box(cx - 1, H + tankH + cone + 1, cz - 1, cx + 1, H + tankH + cone + 6, cz + 1, M.steel);
      c.box(cx - 1, H + tankH + cone + 6, cz - 1, cx + 1, H + tankH + cone + 7, cz + 1, M.lamp);
      // rivet bands
      const bandM = v === 1 ? M.paint_white : M.steel_yellow;
      c.cylY(cx, cz, R + 0.6, H + tankH - 3, H + tankH - 1, bandM, R - 0.5);
      c.cylY(cx, cz, R + 0.6, H + 6, H + 7, bandM, R - 0.5);
      ty1 = H + tankH + cone + 7;
      if (v === 1) for (let a = 0; a < 16; a++) { // vertical ribs
        const an = a * Math.PI / 8; c.box(Math.round(cx + Math.cos(an) * (R + 0.5) - 0.5), H + 3, Math.round(cz + Math.sin(an) * (R + 0.5) - 0.5), Math.round(cx + Math.cos(an) * (R + 0.5) + 0.5), H + tankH - 1, Math.round(cz + Math.sin(an) * (R + 0.5) + 0.5), M.concrete);
      }
    }
    // platform ring below the tank (sphere: ring around equator-low) with railing
    const py = v === 2 ? H + 4 : H - 2;
    const PR = R + 4;
    c.cylY(cx, cz, PR, py, py + 2, M.steel_yellow, v === 2 ? 14 : 0);
    // brackets to legs
    for (let i = 0; i < nLeg; i++) { const [x, z] = lp(i, py); c.line(x, py, z, Math.round(cx + (x - cx) * (PR - 1) / rl), py, Math.round(cz + (z - cz) * (PR - 1) / rl), M.steel_yellow, 2); }
    // ring touching tank wall for sphere is via legs; grating stiffeners
    const railY = py + 2;
    const ring = [];
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) { const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); if (d <= PR && d >= PR - 1.7) ring.push([x, z]); }
    for (const [x, z] of ring) {
      c.set(x, railY + 7, z, M.steel_yellow); c.set(x, railY + 3, z, M.steel_yellow);
      if ((x * 5 + z * 3) % 6 === 0) for (let y = railY; y < railY + 7; y++) c.set(x, y, z, M.steel_yellow);
    }
    // ladder at front (-z) between legs, rails touch the ground
    const lx = cx, lz = cz - Math.round(PR) - 1, lt = py + 2 + 7;
    // ladder passes through gap in railing: clear rail near ladder
    for (const [x, z] of ring) if (Math.abs(x - lx) <= 3 && z < cz) for (let y = railY; y < railY + 8; y++) c.set(x, y, z, 0);
    for (let y = 0; y < lt; y++) { c.set(lx - 2, y, lz, M.steel); c.set(lx + 2, y, lz, M.steel); if (y % 3 === 1) c.box(lx - 1, y, lz, lx + 2, y + 1, lz + 1, M.steel); }
    // safety cage hoops on the upper ladder
    for (let y = 28; y < lt; y += 7) { c.box(lx - 3, y, lz - 2, lx + 4, y + 1, lz - 1, M.steel); c.box(lx - 3, y, lz - 2, lx - 2, y + 1, lz + 1, M.steel); c.box(lx + 3, y, lz - 2, lx + 4, y + 1, lz + 1, M.steel); }
    for (let y = 28; y < lt; y++) { c.set(lx - 3, y, lz - 2, M.steel); c.set(lx + 3, y, lz - 2, M.steel); }
    // landing: ring covers z up to cz-PR, ladder at cz-PR-1 touches ring edge; connect with a short step plate
    c.box(lx - 3, py, lz, lx + 4, py + 2, lz + 1, M.steel_yellow);
    // pipe from tank bottom to ground inlet is omitted so that cutting legs topples it
    c.ground(cx - 12, cz - 12, cx + 12, cz + 12, M.concrete);
    return c;
  },
};
