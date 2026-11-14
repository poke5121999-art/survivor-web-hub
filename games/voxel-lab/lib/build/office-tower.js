// Voxel Lab - glass-and-steel office tower.
// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
// 9-11 m square, 20-30 m tall: column grid, rc slabs every 33-36 voxels, curtain wall with steel mullions,
// rc core with stairs and lift shaft, rooftop plant. Mostly hollow.
import { Canvas, M, rng } from './kit.js';

export default {
  id: 'office-tower', name: 'Tháp văn phòng kính', variants: 4,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 4) + 4) % 4;
    const Lq = r.int(90, 96) & ~1;           // square footprint
    const nf = [7, 7, 7, 8][v];
    const hs = [36, 34, 36, 33][v] + (v === 0 && r.chance(0.5) ? -1 : 0);
    const ZF = 8;                             // street-side margin for the canopy
    const top = nf * hs;
    const SL = 2;                             // slab thickness (rc)
    const c = new Canvas(Lq, Math.min(300, top + 3 + 58), Lq + ZF);
    const spandrelM = [M.paint_white, M.glass_tint, M.concrete, M.iron][v];
    const glassM = [M.glass_tint, M.glass, M.glass, M.glass_tint][v];
    const finM = [M.paint_white, 0, M.concrete, M.steel][v];
    const colM = v === 1 ? M.steel : M.rc;
    const CS = 4;               // column section
    const SP = [10, 9, 11, 9][v];             // spandrel height (above slab top)

    const colU = (L) => { const a = []; for (let i = 0; i < 4; i++) a.push(2 + Math.round(i * (L - 4 - CS) / 3)); return a; };

    // tier builder: footprint square of side L at (X0, Z0) from storey ka to kb (roof slab at kb)
    const tier = (X0, Z0, L, ka, kb) => {
      const put = (face, u0, u1, y0, y1, d0, d1, m) => {
        if (face === 0) c.box(X0 + u0, y0, Z0 + d0, X0 + u1, y1, Z0 + d1, m);
        else if (face === 1) c.box(X0 + u0, y0, Z0 + L - d1, X0 + u1, y1, Z0 + L - d0, m);
        else if (face === 2) c.box(X0 + d0, y0, Z0 + u0, X0 + d1, y1, Z0 + u1, m);
        else c.box(X0 + L - d1, y0, Z0 + u0, X0 + L - d0, y1, Z0 + u1, m);
      };
      const cu = colU(L);
      // slabs
      for (let k = ka; k <= kb; k++) c.box(X0, k * hs, Z0, X0 + L, k * hs + SL, Z0 + L, M.rc);
      // columns (full tier height)
      for (const ux of cu) for (const uz of cu) c.box(X0 + ux, ka * hs, Z0 + uz, X0 + ux + CS, kb * hs, Z0 + uz + CS, colM);
      // curtain wall, storey by storey
      for (let k = ka; k < kb; k++) {
        const f = k * hs, ground = k === 0;
        for (let face = 0; face < 4; face++) {
          // spandrel panel (above slab) and head band
          if (!ground) put(face, 0, L, f + SL, f + SP, 0, 1, spandrelM);
          // glass band
          const g0 = ground ? f + SL : f + SP, g1 = f + hs;
          put(face, 0, L, g0, g1, 1, 2, glassM);
          // mullions every 7 voxels (steel, 1 wide, 3 deep)
          for (let u = 0; u < L; u += 8) put(face, u, u + 1, f + SL, g1, 0, 2, M.steel);
          put(face, L - 1, L, f + SL, g1, 0, 2, M.steel);
          // horizontal transom at mid-height of the glass band
          put(face, 0, L, (g0 + g1) >> 1, ((g0 + g1) >> 1) + 1, 0, 2, M.steel);
          // fins over the columns
          if (finM) for (const u of cu) put(face, u, u + CS, f + SL, g1, 0, 1, finM);
        }
        // corner posts
        for (const [ux, uz] of [[0, 0], [L - 3, 0], [0, L - 3], [L - 3, L - 3]]) c.box(X0 + ux, f + SL, Z0 + uz, X0 + ux + 3, f + hs, Z0 + uz + 3, M.steel);
      }
      // top parapet + coping
      const ty = kb * hs + SL;
      for (let face = 0; face < 4; face++) {
        put(face, 0, L, ty, ty + 5, 0, 2, spandrelM === M.glass_tint || spandrelM === M.iron ? M.concrete : spandrelM);
        put(face, 0, L, ty + 5, ty + 6, 0, 3, M.paint_white);
      }
    };

    // ---- tiers ----
    if (v === 3) {
      const ins = 12;
      tier(0, ZF, Lq, 0, nf - 2);
      tier(ins, ZF + ins, Lq - 2 * ins, nf - 2, nf);
      // terrace railing on the lower roof (iron, sits on the terrace slab / parapet)
      const ty = (nf - 2) * hs + SL;
      c.box(ins - 1, ty + 6, ZF + ins - 1, Lq - ins + 1, ty + 7, ZF + ins, M.iron);
    } else tier(0, ZF, Lq, 0, nf);
    const effTop = top; // roof slab bottom
    const roofL = v === 3 ? Lq - 24 : Lq, roofX = v === 3 ? 12 : 0, roofZ = v === 3 ? ZF + 12 : ZF;

    // ---- core (rc walls 2 thick, centred) with stairs + lift ----
    const CW = 36, CD = 28;
    const cx0 = ((Lq - CW) >> 1), cz0 = ZF + ((Lq - CD) >> 1), cx1 = cx0 + CW, cz1 = cz0 + CD;
    const ix0 = cx0 + 2, ix1 = cx1 - 2, iz0 = cz0 + 2, iz1 = cz1 - 2;
    c.walls(cx0, 0, cz0, cx1, top + 3 + 22, cz1, M.rc, 2);
    for (let k = 1; k <= nf; k++) c.box(ix0, k * hs, iz0, ix1, k * hs + SL, iz1, 0);
    c.box(ix0, 0, iz0, ix1, SL, iz1, M.tile_floor);
    // lift shaft divider + steel lift doors
    const lx = ix1 - 10;
    c.box(lx, 0, iz0, lx + 2, top, iz1, M.rc);
    for (let k = 0; k < nf; k++) {
      const f = k * hs + SL;
      // lift door (steel) at the front wall of the core
      c.box(lx + 2, f, cz0, ix1, f + 24, cz0 + 2, 0);
      c.box(lx + 2, f, cz0, ix1, f + 24, cz0 + 1, M.steel); c.box(lx + 5, f, cz0, lx + 6, f + 24, cz0 + 1, M.iron);
      // stair door
      c.box(ix0 + 4, f, cz0, ix0 + 14, f + 24, cz0 + 2, 0);
      c.box(ix0 + 3, f, cz0, ix0 + 4, f + 25, cz0 + 2, M.paint_white); c.box(ix0 + 14, f, cz0, ix0 + 15, f + 25, cz0 + 2, M.paint_white); c.box(ix0 + 3, f + 24, cz0, ix0 + 15, f + 25, cz0 + 2, M.paint_white);
      // stair flights: A along +z, B back along -z
      const half = hs >> 1;
      const sw = 9;
      const len = Math.min(half, iz1 - iz0 - 6);
      for (let i = 0; i < half; i++) {
        const zA = iz0 + Math.min(i, len - 1);
        c.box(ix0, f + i, zA, ix0 + sw, f + i + 2, zA + 1, M.concrete);
        const zB = iz0 + Math.min(half - 1 - i, len - 1);
        c.box(ix0 + sw + 1, f + half + i, zB, ix0 + 2 * sw + 1, f + half + i + 2, zB + 1, M.concrete);
      }
      c.box(ix0, f + half - 3, iz0 + len - 1, ix0 + 2 * sw + 1, f + half, iz1, M.rc); // landing
      // stair floor lines to the lift lobby
      c.box(ix0 + 2 * sw + 1, f, iz0, lx, f + 1, iz0 + 1, M.concrete);
    }

    // ---- open-plan floors: partitions + columns hints ----
    for (let k = 0; k < nf; k++) {
      const f = k * hs + SL, f1 = (k + 1) * hs;
      const L = (v === 3 && k >= nf - 2) ? Lq - 24 : Lq, X0 = (v === 3 && k >= nf - 2) ? 12 : 0, Z0 = (v === 3 && k >= nf - 2) ? ZF + 12 : ZF;
      // meeting rooms: plaster walls with doorways + glass fronts
      const mx0 = X0 + 8, mz1 = cz0 - 3;
      if (L > 70) {
        c.box(mx0, f, mz1 - 18, mx0 + 24, f1, mz1 - 17, M.plaster);
        c.box(mx0 + 24, f, mz1 - 18, mx0 + 25, f1, mz1, M.plaster);
        c.box(mx0 + 8, f, mz1 - 18, mx0 + 15, f + 22, mz1 - 17, 0);
        c.box(mx0 + 8, f + 22, mz1 - 18, mx0 + 15, f1, mz1 - 17, M.wood);
        // glass partition on the other side of the core
        c.box(X0 + L - 34, f, cz1 + 4, X0 + L - 8, f1, cz1 + 5, M.glass);
        c.box(X0 + L - 34, f, cz1 + 4, X0 + L - 33, f1, cz1 + 5, M.steel); c.box(X0 + L - 9, f, cz1 + 4, X0 + L - 8, f1, cz1 + 5, M.steel); c.box(X0 + L - 34, f + 22, cz1 + 4, X0 + L - 8, f + 23, cz1 + 5, M.steel);
        c.box(X0 + L - 21, f, cz1 + 4, X0 + L - 15, f + 22, cz1 + 5, 0);
        // desks (plank) for a hint of life
        for (let d = 0; d < 3; d++) { c.box(X0 + 10 + d * 9, f, cz1 + 12, X0 + 17 + d * 9, f + 7, cz1 + 14, M.plank); c.box(X0 + 10 + d * 9, f + 7, cz1 + 12, X0 + 17 + d * 9, f + 8, cz1 + 14, M.wood_dark); }
      }
    }
    // lobby: reception desk, sign band
    c.box(14, 2, ZF + 16, 40, 10, ZF + 20, M.wood_dark); c.box(14, 10, ZF + 16, 40, 11, ZF + 20, M.ashlar);
    c.box(0, 2, ZF, Lq, 3, ZF + 3, M.ashlar);
    // entrance: doors + canopy (steel frame, rc slab, attached to the front curtain wall)
    const dm = Lq >> 1;
    c.box(dm - 10, 2, ZF, dm + 10, 28, ZF + 3, 0);
    c.box(dm - 10, 2, ZF + 1, dm + 10, 28, ZF + 2, M.glass_tint);
    c.box(dm - 10, 2, ZF, dm - 9, 28, ZF + 3, M.steel); c.box(dm + 9, 2, ZF, dm + 10, 28, ZF + 3, M.steel); c.box(dm, 2, ZF, dm + 1, 28, ZF + 3, M.steel);
    c.box(dm - 10, 28, ZF, dm + 10, 29, ZF + 3, M.steel);
    c.box(dm - 16, 30, 0, dm + 16, 33, ZF, M.rc); c.box(dm - 16, 33, 0, dm + 16, 34, 1, M.steel);
    for (const x of [dm - 16, dm + 14]) c.box(x, 0, 0, x + 2, 30, 2, M.steel);
    c.box(dm - 14, 0, 1, dm + 14, 1, ZF, M.sidewalk);

    // ---- roof plant ----
    const ry = top + SL; // roof slab top
    const rl = roofL, rx = roofX, rz = roofZ;
    // plant room (louvred cladding) over the core
    const px0 = cx0 - 4, px1 = cx1 + 4, pz0 = cz0 - 4, pz1 = cz1 + 4;
    c.box(px0, ry, pz0, px1, ry + 22, pz1, M.paint_white);
    c.box(px0 + 2, ry, pz0 + 2, px1 - 2, ry + 22, pz1 - 2, 0);
    for (let y = ry + 6; y < ry + 18; y += 3) { c.box(px0, y, pz0 + 6, px0 + 1, y + 1, pz1 - 6, M.steel); c.box(px1 - 1, y, pz0 + 6, px1, y + 1, pz1 - 6, M.steel); c.box(px0 + 8, y, pz1 - 1, px1 - 8, y + 1, pz1, M.steel); }
    c.box(px0 + 14, ry, pz0, px0 + 24, ry + 18, pz0 + 2, 0); // door
    c.box(px0 + 13, ry, pz0, px0 + 14, ry + 19, pz0 + 2, M.steel_yellow); c.box(px0 + 24, ry, pz0, px0 + 25, ry + 19, pz0 + 2, M.steel_yellow); c.box(px0 + 13, ry + 18, pz0, px0 + 25, ry + 19, pz0 + 2, M.steel_yellow);
    c.box(px0 - 1, ry + 22, pz0 - 1, px1 + 1, ry + 25, pz1 + 1, M.rc); // plant roof slab
    // chiller / cooling units on the roof beside the plant
    const unit = (x, z, w, d, h) => { c.box(x, ry, z, x + w, ry + h, z + d, M.paint_white); c.box(x + 1, ry + h, z + 1, x + w - 1, ry + h + 1, z + d - 1, M.steel); for (let y = ry + 3; y < ry + h - 1; y += 3) c.box(x, y, z, x + w, y + 1, z + 1, M.steel); };
    unit(rx + 8, rz + 8, 14, 12, 12); unit(rx + rl - 24, rz + 8, 14, 12, 12);
    unit(rx + 8, rz + rl - 24, 12, 14, 10); unit(rx + rl - 24, rz + rl - 22, 14, 12, 14);
    // cooling tower (cylinder on a plinth)
    c.box(rx + rl - 26, ry, rz + rl - 52, rx + rl - 10, ry + 2, rz + rl - 36, M.concrete);
    c.cylY(rx + rl - 18, rz + rl - 44, 6, ry + 2, ry + 14, M.sheet_zinc); c.cylY(rx + rl - 18, rz + rl - 44, 4, ry + 14, ry + 15, M.steel);
    // mast with antennas
    const mx = ((px0 + px1) >> 1), mz = ((pz0 + pz1) >> 1);
    const my = ry + 25;
    c.box(mx - 1, my, mz - 1, mx + 1, Math.min(c.sy, my + 30), mz + 1, M.steel);
    c.box(mx - 5, my + 22, mz, mx + 5, my + 23, mz + 1, M.steel);
    // window cleaning davit
    c.box(rx + 20, ry + 6, rz + rl - 3, rx + 36, ry + 7, rz + rl - 2, M.iron); c.box(rx + 20, ry + 6, rz + rl - 4, rx + 21, ry + 7, rz + rl - 2, M.iron);
    return c;
  },
};
