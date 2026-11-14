// Voxel Lab - Vietnamese tube house (nha ong) generator.
// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
// Frontage 4-5 m, depth 10-14 m, 3-5 storeys of 3.3 m, brick party walls, rc frame, sheet roof.
import { Canvas, M, rng } from './kit.js';

const FACADE = [M.plaster_yellow, M.plaster_blue, M.plaster_pink, M.plaster_green];

export default {
  id: 'tube-house', name: 'Nhà ống', variants: 4,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 4) + 4) % 4;
    const W = r.int(40, 50), D = r.int(100, 140), ZF = 8; // ZF = street-side balcony margin
    const n = [3, 4, 5, 4][v] + (r.chance(0.25) && v === 0 ? 1 : 0);
    const H = 33, top = n * H; // top slab starts at y = top
    const shop = v % 2 === 0 ? 'shutter' : 'glass';
    const roofStyle = [0, 1, 2, 1][v];
    const fac = FACADE[v];
    const c = new Canvas(W, top + 3 + 62, ZF + D);
    const ZB = ZF + D; // back plane
    const T = 3;

    // ---- slabs (rc 3 thick, tile skin) ----
    for (let k = 0; k <= n; k++) {
      const f = k * H;
      c.box(T, f, ZF, W - T, f + 3, ZB - T, M.rc);
      if (k < n) c.box(T + 1, f + 2, ZF + 3, W - T - 1, f + 3, ZB - T - 1, M.tile_floor);
    }
    // ---- side + back brick walls ----
    c.box(0, 0, ZF, T, top + 3, ZB, M.brick);
    c.box(W - T, 0, ZF, W, top + 3, ZB, M.brick);
    c.box(T, 0, ZB - T, W - T, top + 3, ZB, M.brick);
    // mortar/plaster skin bands on side walls at slab lines
    for (let k = 1; k <= n; k++) { c.box(0, k * H, ZF, T, k * H + 1, ZB, M.mortar); c.box(W - T, k * H, ZF, W, k * H + 1, ZB, M.mortar); }
    // ---- rc frame: columns at the facade + along the party walls ----
    const colZ = [ZF + 3];
    for (let z = ZF + 36; z < ZB - 12; z += 36) colZ.push(z);
    colZ.push(ZB - T - 4);
    for (const z of colZ) {
      c.box(T, 0, z, T + 4, top, z + 4, M.rc);
      c.box(W - T - 4, 0, z, W - T, top, z + 4, M.rc);
    }
    // rc beams under the slab between columns across the width (every storey)
    for (const z of colZ) for (let k = 1; k <= n; k++) c.box(T, k * H - 3, z, W - T, k * H, z + 3, M.rc);

    // ---- front facade (plaster, 3 thick) ----
    c.box(T, 0, ZF, W - T, top + 3, ZF + 3, fac);
    // corner pilasters
    c.box(0, 0, ZF - 1, 3, top + 3, ZF + 3, M.mortar);
    c.box(W - 3, 0, ZF - 1, W, top + 3, ZF + 3, M.mortar);
    // cornice bands at slab lines
    for (let k = 1; k <= n; k++) c.box(0, k * H - 1, ZF - 1, W, k * H + 2, ZF + 3, M.mortar);

    // opening helper: frame + glass
    const windowAt = (x0, x1, y0, y1, glass, sill = true) => {
      c.box(x0 - 1, y0 - 1, ZF - 1, x1 + 1, y1 + 1, ZF + 3, M.paint_white);
      c.box(x0, y0, ZF - 1, x1, y1, ZF + 3, 0);
      c.box(x0, y0, ZF + 1, x1, y1, ZF + 2, glass);
      const mid = (x0 + x1) >> 1;
      c.box(mid, y0, ZF + 1, mid + 1, y1, ZF + 2, M.paint_white); // mullion
      if (sill) c.box(x0 - 2, y0 - 2, ZF - 2, x1 + 2, y0 - 1, ZF + 3, M.ashlar);
    };

    // ---- ground floor ----
    const sx0 = T + 4, sx1 = W - T - 4; // between columns
    if (shop === 'shutter') {
      c.box(sx0, 3, ZF - 1, sx1, 29, ZF + 3, 0);
      for (let y = 3; y < 29; y++) c.box(sx0, y, ZF + 1, sx1, y + 1, ZF + 2, (y & 1) ? M.steel : M.sheet_zinc);
      c.box(sx0 - 1, 2, ZF - 1, sx1 + 1, 3, ZF + 3, M.ashlar); // threshold step
      c.box(sx0, 29, ZF - 1, sx1, 33, ZF + 3, M.paint_white); // shutter box
      c.box(sx0 + 1, 29, ZF - 2, sx0 + 3, 33, ZF - 1, M.steel); c.box(sx1 - 3, 29, ZF - 2, sx1 - 1, 33, ZF - 1, M.steel);
    } else {
      c.box(sx0, 7, ZF - 1, sx1, 29, ZF + 3, 0);
      c.box(sx0, 3, ZF - 1, sx1, 7, ZF + 3, M.ashlar); // kerb
      c.box(sx0, 7, ZF + 1, sx1, 29, ZF + 2, M.glass);
      for (let x = sx0; x <= sx1 - 1; x += 9) c.box(x, 7, ZF, Math.min(x + 1, sx1), 29, ZF + 3, M.steel);
      c.box(sx1 - 1, 7, ZF, sx1, 29, ZF + 3, M.steel);
      c.box(sx0, 29, ZF, sx1, 31, ZF + 3, M.steel); c.box(sx0, 7, ZF, sx1, 8, ZF + 3, M.steel);
      c.box(sx0 + 9, 3, ZF + 1, sx0 + 19, 29, ZF + 2, 0); // glass door gap
      c.box(sx0 + 9, 7, ZF + 1, sx0 + 19, 29, ZF + 2, M.glass_tint);
      c.box(sx0 + 14, 7, ZF + 1, sx0 + 15, 29, ZF + 2, M.steel);
    }
    // sign band above the shop and awning (cloth_red slope, attached to the facade)
    c.box(sx0, 31, ZF - 2, sx1, 33, ZF - 1, M.paint_red);
    const awnY = 33 - 9;
    for (let d = 1; d <= 7; d++) {
      const y = 31 - ((d * 3) >> 2) - 1;
      c.box(sx0 - 2, y, ZF - d, sx1 + 2, y + 2, ZF - d + 1, (d & 1) ? M.cloth_red : M.cloth_white);
    }
    c.box(sx0 - 2, 22, ZF - 8, sx1 + 2, 26, ZF - 7, M.cloth_red);

    // ---- upper floors: windows / balconies ----
    const openN = W < 46 ? 2 : 3;
    const span = (W - 2 * (T + 5)), ow = Math.floor((span - (openN - 1) * 4) / openN);
    for (let k = 1; k < n; k++) {
      const f = k * H, bal = v !== 1 || k % 2 === 1;
      for (let i = 0; i < openN; i++) {
        const x0 = T + 5 + i * (ow + 4), x1 = x0 + ow;
        const door = bal && i === Math.floor(openN / 2);
        if (door) windowAt(x0, x1, f + 3, f + 29, M.glass, false);
        else windowAt(x0, x1, f + 9, f + 27, i % 2 && v === 3 ? M.glass_tint : M.glass, true);
      }
      if (bal) {
        // balcony slab + iron railing
        c.box(2, f, 0, W - 2, f + 3, ZF, M.rc);
        c.box(2, f + 3, 0, W - 2, f + 4, 1, M.mortar);
        const hh = 10;
        for (let x = 2; x < W - 2; x += 5) c.box(x, f + 4, 0, x + 1, f + 4 + hh, 1, M.iron);
        c.box(W - 3, f + 4, 0, W - 2, f + 4 + hh, 1, M.iron);
        c.box(2, f + 4 + hh, 0, W - 2, f + 5 + hh, 1, M.iron);
        c.box(2, f + 4 + 5, 0, W - 2, f + 5 + 5, 1, M.iron);
        for (const x of [2, W - 3]) {
          for (let z = 0; z < ZF; z += 4) c.box(x, f + 4, z, x + 1, f + 4 + hh, z + 1, M.iron);
          c.box(x, f + 4 + hh, 0, x + 1, f + 5 + hh, ZF, M.iron); c.box(x, f + 9, 0, x + 1, f + 10, ZF, M.iron);
        }
        // plant pot / AC unit detail
        c.box(5, f + 4, 1, 12, f + 8, 5, M.concrete); c.box(6, f + 8, 2, 11, f + 9, 4, M.leaf);
      }
    }
    // top floor: big arched-ish window band + parapet balustrade
    {
      const f = (n - 1) * H;
      // already handled loop up to n-1; the loop covers k=1..n-1, the ground is shop
    }
    // ---- roof level ----
    const ry = top + 3;
    // front parapet with balusters (gaps of 3x3), cornice cap
    c.box(T, ry, ZF - 1, W - T, ry + 9, ZF + 3, fac);
    for (let x = T + 3; x < W - T - 3; x += 7) c.box(x, ry + 2, ZF - 1, x + 3, ry + 6, ZF + 3, 0);
    c.box(0, ry + 9, ZF - 2, W, ry + 11, ZF + 4, M.mortar);
    c.box(0, ry, ZF - 1, 3, ry + 9, ZF + 3, M.mortar); c.box(W - 3, ry, ZF - 1, W, ry + 9, ZF + 3, M.mortar);
    // side/back parapets (brick, 5 high)
    c.box(0, ry, ZF + 3, T, ry + 5, ZB, M.brick); c.box(W - T, ry, ZF + 3, W, ry + 5, ZB, M.brick);
    c.box(T, ry, ZB - T, W - T, ry + 5, ZB, M.brick);
    c.box(0, ry + 5, ZF + 3, T, ry + 6, ZB, M.mortar); c.box(W - T, ry + 5, ZF + 3, W, ry + 6, ZB, M.mortar);
    c.box(T, ry + 5, ZB - T, W - T, ry + 6, ZB, M.mortar);

    // stair/water turret at the back
    const tz1 = ZB - T - 2, tz0 = tz1 - 26, tx0 = T + 2, tx1 = tx0 + 24;
    const th = 27;
    c.walls(tx0, ry, tz0, tx1, ry + th, tz1, fac, 2);
    c.box(tx0 - 1, ry, tz0 - 1, tx1 + 1, ry + 1, tz1 + 1, M.mortar);
    c.box(tx0 + 8, ry, tz0, tx0 + 16, ry + 20, tz0 + 2, 0); // door gap (front of turret faces -z)
    c.box(tx0 + 8, ry, tz0, tx0 + 9, ry + 21, tz0 + 2, M.wood_dark); c.box(tx0 + 15, ry, tz0, tx0 + 16, ry + 21, tz0 + 2, M.wood_dark);
    c.box(tx0 + 8, ry + 20, tz0, tx0 + 16, ry + 21, tz0 + 2, M.wood_dark);
    c.box(tx0 + 9, ry, tz0 + 1, tx0 + 15, ry + 20, tz0 + 2, M.wood_green); // door leaf
    c.box(tx0 + 3, ry + 12, tz0, tx0 + 6, ry + 20, tz0 + 2, 0); c.box(tx0 + 3, ry + 12, tz0 + 1, tx0 + 6, ry + 20, tz0 + 2, M.glass); // slit window
    c.box(tx0 - 1, ry + th, tz0 - 1, tx1 + 1, ry + th + 3, tz1 + 1, M.rc); // turret roof slab
    // turret sheet roof (shed)
    const sheet = [M.sheet_red, M.sheet_blue, M.sheet_green, M.sheet_zinc][v];
    for (let z = tz0 - 2; z < tz1 + 2; z++) c.box(tx0 - 2, ry + th + 3 + ((z - tz0 + 2) >> 3), z, tx1 + 2, ry + th + 5 + ((z - tz0 + 2) >> 3), z + 1, sheet);

    // water tank on a steel stand, in front of the turret
    const cx = W / 2, cz = tz0 - 14;
    for (const [dx, dz] of [[-6, -6], [4, -6], [-6, 4], [4, 4]]) c.box(Math.round(cx + dx), ry, Math.round(cz + dz), Math.round(cx + dx) + 2, ry + 9, Math.round(cz + dz) + 2, M.steel);
    c.box(Math.round(cx - 6), ry + 9, Math.round(cz - 6), Math.round(cx + 6), ry + 10, Math.round(cz + 6), M.steel);
    c.cylY(cx, cz, 7, ry + 10, ry + 24, M.sheet_blue);
    c.cylY(cx, cz, 6, ry + 24, ry + 25, M.sheet_blue); c.cylY(cx, cz, 3, ry + 25, ry + 26, M.steel);

    // ---- corrugated roof styles on the front part ----
    const rz0 = ZF + 8, rz1 = tz0 - 30;
    if (roofStyle === 1 || roofStyle === 2) {
      // sloped mai ton on posts: low at front, rising to the back
      const base = ry + 14, rise = roofStyle === 1 ? 4 : 6;
      const L = rz1 - rz0;
      if (L > 20) {
        for (let z = rz0; z < rz1; z++) {
          const y = base + (((z - rz0) * rise / L) | 0);
          c.box(T + 1, y, z, W - T - 1, y + 2, z + 1, sheet);
          if ((z - rz0) % 4 === 0) c.box(T + 1, y + 2, z, W - T - 1, y + 3, z + 1, sheet); // corrugation ridges
        }
        for (const z of [rz0 + 1, (rz0 + rz1) >> 1, rz1 - 2]) {
          const y = base + (((z - rz0) * rise / L) | 0);
          for (const x of [T + 1, W - T - 3, (W >> 1) - 1]) c.box(x, ry, z, x + 2, y, z + 2, M.steel);
          c.box(T + 1, y - 1, z, W - T - 1, y, z + 2, M.steel); // purlin
        }
      }
    }
    // front roof drain spouts / AC
    c.box(W - 12, ry, ZF + 8, W - 5, ry + 5, ZF + 14, M.concrete);
    c.box(W - 11, ry + 5, ZF + 9, W - 6, ry + 6, ZF + 13, M.steel);

    // ---- interior: stair, partitions ----
    const zs = ZB - T - 36 - 22; // stair hole start
    const sxa = T, sxb = sxa + 10;
    for (let k = 1; k <= n; k++) c.box(sxa, k * H, zs, sxb, k * H + 3, zs + 22, 0);
    for (let k = 0; k < n; k++) {
      const f = k * H + 3;
      for (let i = 0; i < 22; i++) {
        const y = f + Math.floor(i * 31 / 22);
        c.box(sxa, y, zs + i, sxb, y + 2, zs + i + 1, M.concrete);
      }
      // stair rail
      c.box(sxb, f, zs, sxb + 1, f + 10, zs + 1, M.iron);
      // partitions: middle wall with a doorway, rear bath partition
      const pz = ZF + 3 + Math.floor((zs - ZF) * 0.55);
      c.box(T + 4, f, pz, W - T, f + 30, pz + 2, M.plaster);
      c.box(W - T - 14, f, pz, W - T - 4, f + 24, pz + 2, 0);
      c.box(W - T - 15, f, pz, W - T - 14, f + 25, pz + 2, M.wood); c.box(W - T - 4, f, pz, W - T - 3, f + 25, pz + 2, M.wood);
      c.box(W - T - 15, f + 24, pz, W - T - 3, f + 25, pz + 2, M.wood);
      c.box(sxb + 6, f, ZB - T - 24, W - T, f + 30, ZB - T - 23, M.plaster); // rear room partition
      // rear window
      c.box(W / 2 - 4, f + 10, ZB - T, W / 2 + 4, f + 24, ZB, 0);
      c.box(W / 2 - 4, f + 10, ZB - 2, W / 2 + 4, f + 24, ZB - 1, M.glass);
      c.box(W / 2 - 5, f + 9, ZB - 3, W / 2 + 5, f + 10, ZB, M.mortar);
    }
    // light-well windows in the brick side walls (glass 1 thick, white frame, ashlar sill)
    for (let k = 0; k < n; k++) {
      const f = k * H + 3;
      for (const [side, zz] of [[1, ZF + 24], [1, ZF + 58], [0, ZF + 42], [0, ZF + 74]]) {
        if (zz + 9 > zs - 2 || zz + 9 > ZB - 12) continue;
        const x0 = side ? W - T : 0;
        c.box(x0, f + 8, zz - 1, x0 + T, f + 26, zz + 9, M.paint_white);
        c.box(x0, f + 9, zz, x0 + T, f + 25, zz + 8, 0);
        c.box(x0 + 1, f + 9, zz, x0 + 2, f + 25, zz + 8, M.glass);
        c.box(x0 + 1, f + 9, zz + 3, x0 + 2, f + 25, zz + 4, M.paint_white);
        c.box(side ? x0 + T : x0 - 1, f + 7, zz - 2, side ? x0 + T + 1 : x0, f + 8, zz + 10, M.ashlar);
      }
    }
    return c;
  },
};
