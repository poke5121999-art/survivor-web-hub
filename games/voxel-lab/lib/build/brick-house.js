// Voxel Lab - two-storey brick house with a tiled pitched roof.
// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
// ~8 x 7 m, brick walls 3 thick, timber floor + rafters, plaster partitions, chimney, hip or gable roof.
import { Canvas, M, rng } from './kit.js';

export default {
  id: 'brick-house', name: 'Nhà gạch mái ngói', variants: 4,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 4) + 4) % 4;
    const W = r.int(76, 84), D = r.int(64, 72);
    const MX = 5, ZM = 16, BK = 5; // side margin, front garden depth, back margin
    const x0 = MX, x1 = MX + W, z0 = ZM, z1 = ZM + D;
    const wallM = [M.brick, M.brick_buff, M.brick, M.brick_dark][v];
    const roofKind = ['hip', 'gableX', 'hip', 'gableZ'][v];
    const T = 3, YF = 3, F1 = 36, FL = 40, TOP = 72;
    const c = new Canvas(W + 2 * MX, TOP + 52, z1 + BK);

    // ---- foundation + ground floor ----
    c.box(x0 - 1, 0, z0 - 1, x1 + 1, 2, z1 + 1, M.concrete);
    c.box(x0 + T, 2, z0 + T, x1 - T, YF, z1 - T, M.tile_floor);
    // ---- brick walls ----
    c.walls(x0, 0, z0, x1, TOP, z1, wallM, T);
    c.box(x0 - 1, 0, z0 - 1, x1 + 1, 6, z0, M.concrete); c.box(x0 - 1, 0, z1, x1 + 1, 6, z1 + 1, M.concrete);
    c.box(x0 - 1, 0, z0, x0, 6, z1, M.concrete); c.box(x1, 0, z0, x1 + 1, 6, z1, M.concrete);
    if (v === 2) { // upper storey rendered in yellow plaster (outer skin)
      c.box(x0, FL - 2, z0, x1, TOP, z0 + 1, M.plaster_yellow); c.box(x0, FL - 2, z1 - 1, x1, TOP, z1, M.plaster_yellow);
      c.box(x0, FL - 2, z0, x0 + 1, TOP, z1, M.plaster_yellow); c.box(x1 - 1, FL - 2, z0, x1, TOP, z1, M.plaster_yellow);
    }
    // belt course + eaves course in mortar
    c.box(x0 - 1, F1 + 1, z0 - 1, x1 + 1, F1 + 3, z0, M.mortar); c.box(x0 - 1, F1 + 1, z1, x1 + 1, F1 + 3, z1 + 1, M.mortar);
    c.box(x0 - 1, F1 + 1, z0, x0, F1 + 3, z1, M.mortar); c.box(x1, F1 + 1, z0, x1 + 1, F1 + 3, z1, M.mortar);
    // quoins at the four corners (alternating long/short blocks)
    for (let y = 6, i = 0; y < TOP; y += 4, i++) {
      const L = (i & 1) ? 6 : 4;
      for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        const sx = cx === x0 ? 1 : -1, sz = cz === z0 ? 1 : -1;
        const ax0 = sx > 0 ? cx - 1 : cx - L + 1, ax1 = sx > 0 ? cx + L - 1 : cx + 1;
        const az0 = sz > 0 ? cz - 1 : cz - L + 1, az1 = sz > 0 ? cz + L - 1 : cz + 1;
        // front/back face block (flush +1) and side face block
        c.box(ax0, y, sz > 0 ? cz - 1 : cz, ax1, y + 3, sz > 0 ? cz : cz + 1, M.ashlar);
        c.box(sx > 0 ? cx - 1 : cx, y, az0, sx > 0 ? cx : cx + 1, y + 3, az1, i & 1 ? M.mortar : M.ashlar);
      }
    }

    // ---- openings helper ----
    // ax 'z': wall plane normal to z (front/back), opening spans x in [a0,a1); ax 'x': side wall, spans z
    const B = (ax, a0, y0, p0, a1, y1, p1, m) => ax === 'z' ? c.box(a0, y0, p0, a1, y1, p1, m) : c.box(p0, y0, a0, p1, y1, a1, m);
    const win = (ax, a0, a1, y0, y1, pw0, pw1, out, glass = M.glass) => {
      // pw0..pw1 = wall thickness range along the normal; out = -1 outward is smaller coords, +1 larger
      const fo0 = out < 0 ? pw0 - 1 : pw0, fo1 = out < 0 ? pw1 : pw1 + 1;
      B(ax, a0 - 1, y0 - 1, fo0, a1 + 1, y1 + 1, fo1, M.paint_white);
      B(ax, a0, y0, fo0, a1, y1, fo1, 0);
      const g0 = out < 0 ? pw0 + 1 : pw1 - 2;
      B(ax, a0, y0, g0, a1, y1, g0 + 1, glass);
      const mid = (a0 + a1) >> 1;
      B(ax, mid, y0, g0 - 1, mid + 1, y1, g0 + 2, M.paint_white);
      B(ax, a0, (y0 + y1) >> 1, g0 - 1, a1, ((y0 + y1) >> 1) + 1, g0 + 2, M.paint_white);
      // lintel + sill
      const lo0 = out < 0 ? pw0 - 1 : pw0, lo1 = out < 0 ? pw0 + 2 : pw1 + 1;
      B(ax, a0 - 3, y1 + 1, out < 0 ? pw0 - 1 : pw1 - 2, a1 + 3, y1 + 3, out < 0 ? pw0 + 2 : pw1 + 1, M.mortar);
      B(ax, a0 - 2, y0 - 2, out < 0 ? pw0 - 2 : pw1 - 2, a1 + 2, y0 - 1, out < 0 ? pw0 + 2 : pw1 + 2, M.ashlar);
    };

    // ---- front + back + side windows ----
    const cxm = (x0 + x1) >> 1;
    const ww = 11, wh = 16;
    const gy0 = 13, uy0 = FL + 9;
    const fx = [x0 + 18, x1 - 18 - ww];
    for (const x of fx) win('z', x, x + ww, gy0, gy0 + wh, z0, z0 + T, -1);
    for (const x of [x0 + 14, cxm - (ww >> 1), x1 - 14 - ww]) win('z', x, x + ww, uy0, uy0 + wh, z0, z0 + T, -1);
    for (const x of [x0 + 18, cxm - (ww >> 1) + 6, x1 - 18 - ww]) {
      win('z', x, x + ww, gy0, gy0 + wh, z1 - T, z1, +1);
      win('z', x, x + ww, uy0, uy0 + wh, z1 - T, z1, +1);
    }
    for (const zc of [z0 + 22, z1 - 22 - ww]) {
      for (const [xa, xb, o] of [[x0, x0 + T, -1], [x1 - T, x1, +1]]) {
        win('x', zc, zc + ww, gy0, gy0 + wh, xa, xb, o);
        win('x', zc, zc + ww, uy0, uy0 + wh, xa, xb, o);
      }
    }
    // ---- front door + porch ----
    const dw = 12, dx0 = cxm - dw / 2;
    c.box(dx0 - 2, YF, z0 - 1, dx0 + dw + 2, YF + 28, z0 + T, M.paint_white);
    c.box(dx0, YF, z0 - 1, dx0 + dw, YF + 26, z0 + T, 0);
    c.box(dx0 + 1, YF, z0 + 1, dx0 + dw - 1, YF + 26, z0 + 2, M.wood_green);
    c.box(dx0 + 2, YF + 16, z0 + 1, dx0 + 5, YF + 22, z0 + 2, M.glass);
    c.box(dx0 + dw - 3, YF + 11, z0, dx0 + dw - 2, YF + 12, z0 + 1, M.steel_yellow);
    c.box(dx0 + 1, YF, z0 + 2, dx0 + dw - 1, YF + 1, z0 + T, M.ashlar); // threshold
    // canopy over the door (attached to the wall)
    c.box(dx0 - 4, YF + 28, z0 - 9, dx0 + dw + 4, YF + 30, z0 + 1, M.mortar);
    c.box(dx0 - 4, YF + 30, z0 - 9, dx0 + dw + 4, YF + 31, z0 - 8, M.ashlar);
    c.box(dx0 - 4, YF + 30, z0 - 9, dx0 - 3, YF + 31, z0, M.ashlar); c.box(dx0 + dw + 3, YF + 30, z0 - 9, dx0 + dw + 4, YF + 31, z0, M.ashlar);
    // brackets
    for (const xb of [dx0 - 4, dx0 + dw + 3]) c.box(xb, YF + 24, z0 - 1, xb + 1, YF + 28, z0, M.ashlar);
    // concrete steps + paving path
    c.box(dx0 - 3, 0, z0 - 4, dx0 + dw + 3, 2, z0 - 1, M.concrete);
    c.box(dx0 - 1, 2, z0 - 7, dx0 + dw + 1, 3, z0 - 4, M.concrete); c.box(dx0 - 1, 0, z0 - 7, dx0 + dw + 1, 2, z0 - 4, M.concrete);
    c.box(dx0 - 3, 0, z0 - 4, dx0 + dw + 3, 3, z0 - 1, M.concrete);
    c.ground(dx0 - 2, 0, dx0 + dw + 2, z0 - 4, M.sidewalk);

    // drainpipes (iron) at front corner inner side
    for (const px of [x0 + 7, x1 - 8]) { c.box(px, 3, z0 - 2, px + 2, TOP - 1, z0 - 1, M.iron); }
    c.box(x0 + 7, 0, z0 - 3, x0 + 9, 3, z0 - 1, M.iron); c.box(x1 - 8, 0, z0 - 3, x1 - 6, 3, z0 - 1, M.iron);

    // ---- low front garden wall with pillars and gate gap ----
    const gz0 = 0, gz1 = 4, gx0 = x0 - 3, gx1 = x1 + 3;
    c.box(gx0, 0, gz0, gx1, 9, gz1, wallM);
    c.box(gx0, 9, gz0, gx1, 11, gz1 + 1, M.mortar);
    c.box(dx0 - 4, 0, gz0, dx0 + dw + 4, 11, gz1 + 1, 0);
    for (const px of [gx0, dx0 - 8, dx0 + dw + 4, gx1 - 6]) { c.box(px, 0, gz0 - 1, px + 6, 13, gz1 + 2, wallM); c.box(px - 1, 13, gz0 - 2, px + 7, 15, gz1 + 3, M.ashlar); }
    // hedge on top of the wall inner side (leaf, sits on wall)
    c.box(gx0 + 6, 11, gz0 + 1, dx0 - 8, 16, gz1, M.leaf); c.box(dx0 + dw + 10, 11, gz0 + 1, gx1 - 6, 16, gz1, M.leaf);

    // ---- timber intermediate floor: joists + plank deck ----
    const ix0 = x0 + T, ix1 = x1 - T, iz0 = z0 + T, iz1 = z1 - T;
    for (let z = iz0 + 1; z < iz1 - 2; z += 7) c.box(ix0 - 1, F1, z, ix1 + 1, F1 + 3, z + 2, M.wood);
    c.box(ix0, F1, iz0, ix1, F1 + 3, iz0 + 2, M.wood); c.box(ix0, F1, iz1 - 2, ix1, F1 + 3, iz1, M.wood);
    c.box(ix0, F1 + 3, iz0, ix1, F1 + 4, iz1, M.plank);
    // ---- stairs (left wall) ----
    const zs = iz0 + 18, SL = 30;
    c.box(ix0, F1, zs, ix0 + 11, F1 + 4, zs + SL, 0);
    for (let i = 0; i < SL; i++) {
      const y = YF + Math.floor(i * (FL - YF + 1) / SL);
      c.box(ix0, y, zs + i, ix0 + 11, y + 2, zs + i + 1, M.wood_dark);
    }
    c.box(ix0 + 10, F1 + 4, zs, ix0 + 11, F1 + 12, zs + SL, 0);
    for (let i = 0; i < SL; i += 6) c.box(ix0 + 10, F1 + 4, zs + i, ix0 + 11, F1 + 14, zs + i + 1, M.wood_dark);
    c.box(ix0 + 10, F1 + 14, zs, ix0 + 11, F1 + 15, zs + SL, M.wood_dark);
    // ---- plaster partitions with doorways ----
    const pz = iz0 + 36;
    for (const [f0, f1] of [[YF, F1], [FL, TOP]]) {
      c.box(ix0 + 11, f0, pz, ix1, f1, pz + 2, M.plaster);
      const dx = cxm + 10; // doorway
      c.box(dx, f0, pz, dx + 10, f0 + 24, pz + 2, 0);
      c.box(dx - 1, f0, pz, dx, f0 + 25, pz + 2, M.wood); c.box(dx + 10, f0, pz, dx + 11, f0 + 25, pz + 2, M.wood); c.box(dx - 1, f0 + 24, pz, dx + 11, f0 + 25, pz + 2, M.wood);
      // second partition separating a rear room
      c.box(ix0 + 11, f0, iz1 - 22, ix0 + 11 + 26, f1, iz1 - 20, M.plaster);
      c.box(ix0 + 18, f0, iz1 - 22, ix0 + 26, f0 + 22, iz1 - 20, 0);
    }
    // ---- attic floor + roof ----
    c.box(ix0, TOP, iz0, ix1, TOP + 2, iz1, M.plank);
    for (let z = iz0; z < iz1; z += 8) c.box(ix0, TOP - 2, z, ix1, TOP, z + 2, M.wood);

    const ex0 = x0 - 4, ex1 = x1 + 4, ez0 = z0 - 4, ez1 = z1 + 4;
    const slope = 1.4, BAND = 5;
    // fascia / soffit board all round at eaves height
    c.box(ex0, TOP - 1, ez0, ex1, TOP + 0, ez1, 0);
    const tile = M.rooftile;
    let apex = TOP;
    if (roofKind === 'hip') {
      let j = 0;
      for (;; j++) {
        const a = Math.floor(j * slope);
        const ax0 = ex0 + a, ax1 = ex1 - a, az0 = ez0 + a, az1 = ez1 - a;
        if (ax1 - ax0 <= 0 || az1 - az0 <= 0) break;
        const y = TOP + j;
        if (ax1 - ax0 <= 2 * BAND || az1 - az0 <= 2 * BAND) { c.box(ax0, y, az0, ax1, y + 1, az1, tile); apex = y; break; }
        c.box(ax0, y, az0, ax1, y + 1, az0 + BAND, tile); c.box(ax0, y, az1 - BAND, ax1, y + 1, az1, tile);
        c.box(ax0, y, az0, ax0 + BAND, y + 1, az1, tile); c.box(ax1 - BAND, y, az0, ax1, y + 1, az1, tile);
      }
      // wood fascia under the eave edge
      c.box(ex0, TOP - 1, ez0, ex1, TOP, ez0 + 1, M.plank); c.box(ex0, TOP - 1, ez1 - 1, ex1, TOP, ez1, M.plank);
      c.box(ex0, TOP - 1, ez0, ex0 + 1, TOP, ez1, M.plank); c.box(ex1 - 1, TOP - 1, ez0, ex1, TOP, ez1, M.plank);
      // rafters (inside, along the slope) + ridge beam
      const half = (ez1 - ez0) / 2, ridgeY = apex - 7;
      const zc = (ez0 + ez1) / 2;
      const long = (ex1 - ex0) >= (ez1 - ez0);
      if (long) {
        for (let x = ix0 + 4; x < ix1 - 2; x += 14) {
          c.line(x, TOP + 1, iz0 + 1, x, ridgeY, zc - 1, M.wood, 2);
          c.line(x, TOP + 1, iz1 - 1, x, ridgeY, zc + 1, M.wood, 2);
        }
        c.box(ix0 + 20, ridgeY, zc - 2, ix1 - 20, ridgeY + 2, zc + 2, M.wood);
      }
    } else if (roofKind === 'gableX') { // ridge along x, gable walls at x ends
      let j = 0;
      for (;; j++) {
        const a = Math.floor(j * slope), y = TOP + j;
        const za0 = ez0 + a, za1 = ez1 - a;
        if (za1 - za0 <= 2 * BAND) { c.box(ex0 - 2, y, za0, ex1 + 2, y + 1, za1, tile); apex = y; break; }
        // gable end walls (brick) first
        const wz0 = z0 + Math.max(0, a - 4) + 1, wz1 = z1 - Math.max(0, a - 4) - 1;
        if (wz1 > wz0) { c.box(x0, y, wz0, x0 + T, y + 1, wz1, wallM); c.box(x1 - T, y, wz0, x1, y + 1, wz1, wallM); }
        c.box(ex0 - 2, y, za0, ex1 + 2, y + 1, za0 + BAND, tile); c.box(ex0 - 2, y, za1 - BAND, ex1 + 2, y + 1, za1, tile);
      }
      // gable end finishing: mortar coping + round attic window
      const zc = (z0 + z1) >> 1;
      for (const [xa, xb, o] of [[x0, x0 + T, -1], [x1 - T, x1, +1]]) {
        win('x', zc - 4, zc + 4, TOP + 6, TOP + 14, xa, xb, o);
      }
      const ridgeY = apex - 7;
      for (let x = ix0 + 6; x < ix1 - 2; x += 14) {
        c.line(x, TOP + 1, iz0 + 1, x, ridgeY, zc - 1, M.wood, 2); c.line(x, TOP + 1, iz1 - 1, x, ridgeY, zc + 1, M.wood, 2);
      }
      c.box(ix0, ridgeY, zc - 2, ix1, ridgeY + 2, zc + 2, M.wood);
    } else { // gableZ: gable faces the street
      let j = 0;
      for (;; j++) {
        const a = Math.floor(j * slope), y = TOP + j;
        const xa0 = ex0 + a, xa1 = ex1 - a;
        if (xa1 - xa0 <= 2 * BAND) { c.box(xa0, y, ez0 - 2, xa1, y + 1, ez1 + 2, tile); apex = y; break; }
        const wx0 = x0 + Math.max(0, a - 4) + 1, wx1 = x1 - Math.max(0, a - 4) - 1;
        if (wx1 > wx0) { c.box(wx0, y, z0, wx1, y + 1, z0 + T, wallM); c.box(wx0, y, z1 - T, wx1, y + 1, z1, wallM); }
        c.box(xa0, y, ez0 - 2, xa0 + BAND, y + 1, ez1 + 2, tile); c.box(xa1 - BAND, y, ez0 - 2, xa1, y + 1, ez1 + 2, tile);
      }
      win('z', cxm - 4, cxm + 4, TOP + 6, TOP + 14, z0, z0 + T, -1);
      win('z', cxm - 4, cxm + 4, TOP + 6, TOP + 14, z1 - T, z1, +1);
      const ridgeY = apex - 7;
      for (let z = iz0 + 6; z < iz1 - 2; z += 14) {
        c.line(ix0 + 1, TOP + 1, z, cxm - 1, ridgeY, z, M.wood, 2); c.line(ix1 - 1, TOP + 1, z, cxm + 1, ridgeY, z, M.wood, 2);
      }
      c.box(cxm - 2, ridgeY, iz0, cxm + 2, ridgeY + 2, iz1, M.wood);
    }
    // ridge cap
    {
      if (roofKind === 'gableX') c.box(ex0 - 2, apex + 1, (ez0 + ez1) / 2 - 2, ex1 + 2, apex + 3, (ez0 + ez1) / 2 + 2, M.rooftile);
      else if (roofKind === 'gableZ') c.box(cxm - 2, apex + 1, ez0 - 2, cxm + 2, apex + 3, ez1 + 2, M.rooftile);
    }

    // ---- chimney: interior breast on the left gable wall + stack through the roof ----
    const chx = roofKind === 'gableZ' ? x1 - T - 10 : x0 + T, chz = roofKind === 'gableZ' ? z1 - T - 18 : cxm - 38 + 36 + 0;
    const czz = roofKind === 'gableZ' ? chz : (z0 + z1) / 2 - 4;
    const cx0 = roofKind === 'gableZ' ? chx : x0 + T;
    c.box(cx0, YF, czz, cx0 + 10, TOP + 6, czz + 10, M.brick_dark === wallM ? M.brick : M.brick);
    c.box(cx0 + 1, YF, czz + 3, cx0 + 5, YF + 12, czz + 4, 0); // fireplace
    c.box(cx0 + 1, YF, czz + 1, cx0 + 4, YF + 10, czz + 9, 0);
    c.box(cx0, YF + 12, czz - 1, cx0 + 6, YF + 14, czz + 11, M.ashlar); // mantel
    const cTop = apex + 8;
    c.box(cx0 + 1, TOP + 6, czz + 1, cx0 + 9, cTop, czz + 9, M.brick);
    c.box(cx0, cTop, czz, cx0 + 10, cTop + 2, czz + 10, M.mortar);
    c.box(cx0 + 3, cTop + 2, czz + 3, cx0 + 7, cTop + 3, czz + 7, M.brick);
    c.box(cx0 + 1, cTop + 2, czz + 1, cx0 + 9, cTop + 3, czz + 2, M.brick_dark); // pots
    return c;
  },
};
