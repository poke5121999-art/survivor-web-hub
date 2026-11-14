// Voxel Lab - concrete apartment block (chung cu be tong).
// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
// 5-8 storeys of 3.2 m, rc column grid + slabs, infill walls, repeated balconies, flat roof with stair core + tanks.
import { Canvas, M, rng } from './kit.js';

export default {
  id: 'apartment', name: 'Chung cư bê tông', variants: 4,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 4) + 4) % 4;
    const n = [6, 5, 8, 7][v] + (r.chance(0.3) && v === 0 ? 1 : 0);
    const H = 32, CW = 5, ZF = 11, NB = 4;
    const bay = r.int(22, 24);
    const W = CW + NB * (bay + CW), D = r.int(84, 92);
    const top = n * H;
    const infill = [M.concrete, M.plaster, M.plaster_pink, M.plaster_yellow][v];
    const accent = [M.plaster_blue, M.brick_buff, M.plaster_green, M.plaster_blue][v];
    const c = new Canvas(W, Math.min(300, top + 3 + 40), ZF + D);
    const ZB = ZF + D;
    const colX = []; for (let i = 0; i <= NB; i++) colX.push(i * (bay + CW));
    const zMid = ZF + ((D - CW) >> 1) - 2;
    const colZ = [ZF, zMid, ZB - CW];

    // slabs
    for (let k = 0; k <= n; k++) c.box(0, k * H, ZF, W, k * H + 3, ZB, M.rc);
    // columns
    for (const x of colX) for (const z of colZ) c.box(x, 0, z, x + CW, top, z + CW, M.rc);
    // core footprint (stairs) : x 46..74 centred
    const cx0 = (W >> 1) - 15, cx1 = cx0 + 30, cz0 = ZF + 32, cz1 = cz0 + 28;
    const inCore = (x, z) => x >= cx0 && x < cx1 && z >= cz0 && z < cz1;
    // stair hole through every slab (core interior)
    const sx0 = cx0 + 3, sx1 = cx1 - 3, sz0 = cz0 + 3, sz1 = cz1 - 3;
    for (let k = 1; k <= n; k++) c.box(sx0, k * H, sz0, sx1, k * H + 3, sz1, 0);

    // ---- perimeter infill walls (3 thick) between the columns ----
    c.box(0, 3, ZF, 3, top, ZB, infill); c.box(W - 3, 3, ZF, W, top, ZB, infill);
    c.box(0, 3, ZB - 3, W, top, ZB, infill);
    c.box(0, 3, ZF, W, top, ZF + 3, infill);
    // columns drawn again on the facade so the rc frame stays visible (flush, 1 voxel proud)
    for (const x of colX) c.box(x, 0, ZF - 1, x + CW, top + 3, ZF + 3, M.rc);
    for (let k = 1; k <= n; k++) c.box(0, k * H - 1, ZF - 1, W, k * H + 3, ZF + 3, M.rc); // spandrel beams / slab edge
    c.box(0, 0, ZF - 1, W, 3, ZF + 3, M.concrete); // plinth

    // window helper on a z-plane wall
    const win = (xa, xb, y0, y1, p0, p1, out, glass = M.glass, sill = true) => {
      const f0 = out < 0 ? p0 - 1 : p0, f1 = out < 0 ? p1 : p1 + 1;
      c.box(xa - 1, y0 - 1, f0, xb + 1, y1 + 1, f1, M.paint_white);
      c.box(xa, y0, f0, xb, y1, f1, 0);
      const g = out < 0 ? p0 + 1 : p1 - 2;
      c.box(xa, y0, g, xb, y1, g + 1, glass);
      c.box((xa + xb) >> 1, y0, g - 1, ((xa + xb) >> 1) + 1, y1, g + 2, M.paint_white);
      if (sill) c.box(xa - 2, y0 - 2, out < 0 ? p0 - 2 : p1 - 2, xb + 2, y0 - 1, out < 0 ? p0 + 2 : p1 + 2, M.ashlar);
    };
    const winSide = (za, zb, y0, y1, p0, p1, out) => { // wall plane normal to x
      const f0 = out < 0 ? p0 - 1 : p0, f1 = out < 0 ? p1 : p1 + 1;
      c.box(f0, y0 - 1, za - 1, f1, y1 + 1, zb + 1, M.paint_white);
      c.box(f0, y0, za, f1, y1, zb, 0);
      const g = out < 0 ? p0 + 1 : p1 - 2;
      c.box(g, y0, za, g + 1, y1, zb, M.glass);
      c.box(g - 1, y0, (za + zb) >> 1, g + 2, y1, ((za + zb) >> 1) + 1, M.paint_white);
      c.box(out < 0 ? p0 - 2 : p1 - 2, y0 - 2, za - 2, out < 0 ? p0 + 2 : p1 + 2, y0 - 1, zb + 2, M.ashlar);
    };

    // ---- ground floor: lobby in the two middle bays, windows elsewhere ----
    for (let i = 0; i < NB; i++) {
      const xa = colX[i] + CW, xb = colX[i + 1];
      if (i === 1 || i === 2) {
        c.box(xa, 3, ZF - 1, xb, 29, ZF + 3, 0);
        c.box(xa, 3, ZF + 1, xb, 29, ZF + 2, M.glass);
        for (let x = xa; x < xb; x += 8) c.box(x, 3, ZF, x + 1, 29, ZF + 3, M.steel);
        c.box(xa, 3, ZF, xb, 6, ZF + 3, M.ashlar); c.box(xa, 28, ZF, xb, 29, ZF + 3, M.steel);
        const dm = (xa + xb) >> 1; c.box(dm - 5, 3, ZF + 1, dm + 5, 28, ZF + 2, M.glass_tint); c.box(dm, 3, ZF, dm + 1, 28, ZF + 3, M.steel);
      } else {
        win(xa + 3, xb - 3, 10, 27, ZF, ZF + 3, -1, M.glass_tint);
        c.box(xa, 3, ZF - 1, xb, 9, ZF, accent); // painted dado
      }
    }
    // lobby canopy (rc, attached to the facade) + steps
    c.box(colX[1] + CW, 30, ZF - 10, colX[3], 33, ZF + 1, M.rc);
    c.box(colX[1] + CW, 33, ZF - 10, colX[3], 34, ZF - 9, M.concrete);
    c.box(colX[1] + CW + 2, 3, ZF - 8, colX[3] - 2, 4, ZF - 1, M.sidewalk);
    c.box(colX[1] + CW + 2, 0, ZF - 7, colX[3] - 2, 4, ZF - 4, M.concrete); c.box(colX[1] + CW + 2, 0, ZF - 4, colX[3] - 2, 3, ZF - 1, M.concrete);
    for (const x of [colX[1] + CW + 1, colX[3] - 4]) c.cylY(x + 1.5, ZF - 8, 1.6, 0, 30, M.rc);

    // ---- upper floors: windows + balconies on the front ----
    for (let k = 1; k < n; k++) {
      const f = k * H + 3; // floor surface
      for (let i = 0; i < NB; i++) {
        const xa = colX[i] + CW, xb = colX[i + 1];
        const balc = v === 2 ? (i % 3 === 0 && k % 2 === 1) : true;
        if (v === 2) {
          // ribbon window: wide, low spandrel
          win(xa + 2, xb - 2, f + 8, f + 26, ZF, ZF + 3, -1, M.glass, true);
          c.box(xa, f - 1, ZF - 1, xb, f + 7, ZF, accent);
        } else if (balc) {
          win(xa + 2, xa + 12, f + 8, f + 26, ZF, ZF + 3, -1, M.glass, true);
          // balcony door
          c.box(xb - 11, f, ZF - 1, xb - 2, f + 26, ZF + 3, 0);
          c.box(xb - 12, f - 1, ZF - 1, xb - 11, f + 27, ZF + 3, M.paint_white); c.box(xb - 2, f - 1, ZF - 1, xb - 1, f + 27, ZF + 3, M.paint_white);
          c.box(xb - 12, f + 26, ZF - 1, xb - 1, f + 27, ZF + 3, M.paint_white);
          c.box(xb - 11, f, ZF + 1, xb - 2, f + 26, ZF + 2, M.glass); c.box(xb - 7, f, ZF, xb - 6, f + 26, ZF + 3, M.paint_white);
        } else win(xa + 3, xb - 3, f + 8, f + 26, ZF, ZF + 3, -1);
        if (balc) {
          const bx0 = xa, bx1 = xb, bz0 = 0;
          c.box(bx0, f - 3, bz0, bx1, f, ZF, M.rc);
          const hh = 10;
          if (v === 1 && (i + k) % 2 === 0) {
            // solid parapet balcony, steel top rail
            c.box(bx0, f, bz0, bx1, f + 8, bz0 + 2, infill);
            c.box(bx0, f, bz0, bx0 + 2, f + 8, ZF, infill); c.box(bx1 - 2, f, bz0, bx1, f + 8, ZF, infill);
            c.box(bx0, f + 8, bz0, bx1, f + 9, ZF, M.steel);
          } else {
            for (let x = bx0; x < bx1; x += 4) c.box(x, f, bz0, x + 1, f + hh, bz0 + 1, M.iron);
            c.box(bx1 - 1, f, bz0, bx1, f + hh, bz0 + 1, M.iron);
            c.box(bx0, f + hh, bz0, bx1, f + hh + 1, bz0 + 1, M.iron); c.box(bx0, f + 5, bz0, bx1, f + 6, bz0 + 1, M.iron);
            for (const x of [bx0, bx1 - 1]) {
              for (let z = 0; z < ZF; z += 4) c.box(x, f, z, x + 1, f + hh, z + 1, M.iron);
              c.box(x, f + hh, 0, x + 1, f + hh + 1, ZF, M.iron); c.box(x, f + 5, 0, x + 1, f + 6, ZF, M.iron);
            }
          }
          // air conditioner box standing on the balcony + underside paint
          if ((i * 3 + k) % 3 === 0) { c.box(bx0 + 2, f, 2, bx0 + 9, f + 6, 6, M.paint_white); c.box(bx0 + 3, f + 1, 5, bx0 + 8, f + 5, 6, M.steel); }
          c.box(bx0, f - 4, bz0, bx1, f - 3, ZF, accent);
        }
      }
    }
    // back windows (small, one per bay) + laundry rail
    for (let k = 0; k < n; k++) {
      const f = k * H + 3;
      for (let i = 0; i < NB; i++) {
        const xa = colX[i] + CW, xb = colX[i + 1], m = (xa + xb) >> 1;
        win(m - 5, m + 5, f + 12, f + 25, ZB - 3, ZB, +1, M.glass, true);
      }
    }
    // side windows: two per floor at corridor ends and bedrooms
    for (let k = 0; k < n; k++) {
      const f = k * H + 3;
      for (const zc of [ZF + 17, ZB - 22]) for (const [a, b, o] of [[0, 3, -1], [W - 3, W, +1]]) winSide(zc, zc + 8, f + 10, f + 26, a, b, o);
      // corridor end slit
      const zq = cz0 + 4;
      for (const [a, b, o] of [[0, 3, -1], [W - 3, W, +1]]) winSide(zq, zq + 4, f + 12, f + 22, a, b, o);
    }
    // side wall accent stripes at slab lines
    for (let k = 1; k <= n; k++) { c.box(0, k * H, ZF, 1, k * H + 3, ZB, accent); c.box(W - 1, k * H, ZF, W, k * H + 3, ZB, accent); }

    // ---- interior: corridor walls, partitions, doors ----
    for (let k = 0; k < n; k++) {
      const f = k * H + 3, f1 = (k + 1) * H;
      // corridor walls (front z cz0..cz0+2 ; back wall z cz1-2..cz1) from x=3..W-3
      for (const zw of [ZF + 32, ZF + 46]) {
        for (let x = 3; x < W - 3; x++) {
          if (x >= cx0 && x < cx1) continue;
          let door = false;
          for (let i = 0; i < NB; i++) { const m = ((colX[i] + CW + colX[i + 1]) >> 1) + 2; if (x >= m - 4 && x < m + 4) door = true; }
          if (door) { c.box(x, f + 24, zw, x + 1, f1, zw + 2, M.concrete); }
          else c.box(x, f, zw, x + 1, f1, zw + 2, M.concrete);
        }
        for (let i = 0; i < NB; i++) { // door frames
          const m = ((colX[i] + CW + colX[i + 1]) >> 1) + 2;
          c.box(m - 5, f, zw, m - 4, f + 25, zw + 2, M.wood_dark); c.box(m + 4, f, zw, m + 5, f + 25, zw + 2, M.wood_dark); c.box(m - 5, f + 24, zw, m + 5, f + 25, zw + 2, M.wood_dark);
          c.box(m - 4, f, zw + 1, m + 4, f + 24, zw + 2, k % 2 ? M.wood : M.wood_green);
        }
      }
      // room partitions at bay centres (front rooms and back rooms)
      for (let i = 0; i < NB; i++) {
        const m = (colX[i] + CW + colX[i + 1]) >> 1;
        c.box(m - 1, f, ZF + 3, m + 1, f1, ZF + 32, M.plaster);
        c.box(m - 1, f, ZF + 46, m + 1, f1, ZB - 3, M.plaster);
        // doorway in each partition
        c.box(m - 1, f, ZF + 18, m + 1, f + 24, ZF + 26, 0);
        c.box(m - 1, f, ZF + 17, m + 1, f + 25, ZF + 18, M.wood); c.box(m - 1, f, ZF + 26, m + 1, f + 25, ZF + 27, M.wood); c.box(m - 1, f + 24, ZF + 17, m + 1, f + 25, ZF + 27, M.wood);
        // bathroom partition near the corridor
        c.box(m + 1, f, ZF + 24, m + 12, f1, ZF + 25, M.plaster);
      }
    }
    // tile floor skin (top layer of each slab inside the shell)
    for (let k = 0; k < n; k++) c.box(3, k * H + 2, ZF + 3, W - 3, k * H + 3, ZB - 3, 0), c.box(3, k * H + 2, ZF + 3, W - 3, k * H + 3, ZB - 3, M.tile_floor);
    for (let k = 1; k <= n; k++) c.box(sx0, k * H, sz0, sx1, k * H + 3, sz1, 0);

    // ---- stair core (rc walls, full height + above the roof) ----
    const coreTop = top + 3 + 24;
    c.walls(cx0, 0, cz0, cx1, coreTop, cz1, M.rc, 3);
    c.box(cx0, coreTop, cz0, cx1, coreTop + 3, cz1, M.rc); // core roof slab
    c.box(cx0 - 1, coreTop + 3, cz0 - 1, cx1 + 1, coreTop + 4, cz1 + 1, M.concrete); // coping
    c.box(sx0, 0, sz0, sx1, 3, sz1, M.tile_floor);
    // doors on the core front wall at each floor level
    for (let k = 0; k <= n; k++) {
      const f = k * H + 3;
      c.box(cx0 + 12, f, cz0, cx0 + 22, f + 24, cz0 + 3, 0);
      c.box(cx0 + 11, f, cz0, cx0 + 12, f + 25, cz0 + 3, M.paint_white); c.box(cx0 + 22, f, cz0, cx0 + 23, f + 25, cz0 + 3, M.paint_white); c.box(cx0 + 11, f + 24, cz0, cx0 + 23, f + 25, cz0 + 3, M.paint_white);
      if (k < n && false) c.box(0, 0, 0, 0, 0, 0, 0);
    }
    // stair flights (switchback), treads attached to the core walls
    for (let k = 0; k < n; k++) {
      const f = k * H + 3;
      for (let i = 0; i < 16; i++) {
        c.box(sx0, f + i, sz0 + i, sx0 + 10, f + i + 2, sz0 + i + 1, M.concrete); // flight A (top at f+17)
        c.box(sx1 - 10, f + 16 + i, sz0 + 15 - i, sx1, f + 18 + i, sz0 + 16 - i, M.concrete); // flight B going back
      }
      c.box(sx0, f + 14, sz0 + 16, sx1, f + 17, sz1, M.rc); // landing
      c.box(sx0 + 10, f + 17, sz1 - 1, sx1 - 10, f + 27, sz1, M.iron); // window rail bars hint
      c.box(sx1 - 11, f + 18, sz0 + 1, sx1 - 10, f + 28, sz0 + 14, M.iron); // handrail
    }
    // roof door at the top of the core is the top-level door loop above; core top vent window
    win(cx0 + 8, cx0 + 22, top + 3 + 8, top + 3 + 18, cz1 - 3, cz1, +1, M.glass, true);

    // ---- roof: parapet, tanks, AC units ----
    const ry = top + 3;
    c.box(0, ry, ZF - 1, W, ry + 8, ZF + 2, infill); c.box(0, ry, ZB - 2, W, ry + 8, ZB, infill);
    c.box(0, ry, ZF + 2, 2, ry + 8, ZB - 2, infill); c.box(W - 2, ry, ZF + 2, W, ry + 8, ZB - 2, infill);
    c.box(0, ry + 8, ZF - 2, W, ry + 10, ZF + 3, M.mortar); c.box(0, ry + 8, ZB - 3, W, ry + 10, ZB, M.mortar);
    c.box(0, ry + 8, ZF + 3, 3, ry + 10, ZB - 3, M.mortar); c.box(W - 3, ry + 8, ZF + 3, W, ry + 10, ZB - 3, M.mortar);
    // front parapet notches
    for (let x = 12; x < W - 12; x += 10) c.box(x, ry + 2, ZF - 1, x + 4, ry + 6, ZF + 2, 0);
    // tanks
    const tcol = [M.sheet_blue, M.sheet_zinc, M.sheet_green, M.sheet_red][v];
    const tanks = [[10, ZB - 24], [W - 14, ZB - 24], [W - 28, ZF + 12]];
    for (const [tx, tz] of tanks) {
      c.box(tx - 8, ry, tz - 8, tx + 8, ry + 2, tz + 8, M.concrete);
      for (const [dx, dz] of [[-6, -6], [4, -6], [-6, 4], [4, 4]]) c.box(tx + dx, ry + 2, tz + dz, tx + dx + 2, ry + 10, tz + dz + 2, M.steel);
      c.box(tx - 6, ry + 10, tz - 6, tx + 6, ry + 11, tz + 6, M.steel);
      c.cylY(tx, tz, 7, ry + 11, ry + 25, tcol); c.cylY(tx, tz, 5.5, ry + 25, ry + 26, tcol);
    }
    for (const x of [12, 26, 90]) { if (x + 8 < W - 4) { c.box(x, ry, ZF + 22, x + 8, ry + 6, ZF + 28, M.paint_white); c.box(x + 1, ry + 6, ZF + 23, x + 7, ry + 7, ZF + 27, M.steel); } }
    c.line(W - 8, ry, ZF + 30, W - 8, ry + 22, ZF + 30, M.steel, 1);
    return c;
  },
};
