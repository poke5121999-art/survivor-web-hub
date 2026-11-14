// Voxel Lab - steel portal-frame warehouse.
// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
// ~10 x 12-13 m, steel columns + rafters (3 voxel sections), 1-voxel sheet cladding and roof, brick/concrete plinth,
// big door, crates and steel racks inside, optional mezzanine and lean-to canopy.
import { Canvas, M, rng } from './kit.js';

export default {
  id: 'warehouse', name: 'Nhà kho khung thép', variants: 4,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 4) + 4) % 4;
    const SX = r.int(96, 108), SZ = r.int(120, 132), EH = r.int(56, 62);
    const MX = 5, ZF = 12, OH = 4;
    const lean = v === 3 ? 26 : 0;
    const mono = v === 2;
    const rise = mono ? 14 : 12;
    const wallM = [M.sheet_zinc, M.sheet_blue, M.sheet_green, M.sheet_red][v];
    const trimM = [M.sheet_red, M.sheet_zinc, M.sheet_zinc, M.sheet_zinc][v];
    const roofM = [M.sheet_zinc, M.sheet_blue, M.sheet_green, M.sheet_zinc][v];
    const plinthM = [M.concrete, M.brick, M.concrete, M.brick_dark][v];
    const x0 = MX, z0 = ZF, zE = ZF + SZ, x1 = x0 + SX;
    const half = SX / 2;
    const hAt = (xr) => mono ? EH + Math.floor(xr * rise / SX) : EH + Math.floor(Math.min(xr, SX - xr) * rise / half);
    const c = new Canvas(SX + 2 * MX + lean, EH + rise + 20, zE + OH + 2);

    const nb = Math.round(SZ / 22);
    const fz = []; for (let i = 0; i <= nb; i++) fz.push(z0 + 1 + Math.round(i * (SZ - 5) / nb));

    // ---- floor slab + plinth ----
    c.box(x0, 0, z0, x1, 2, zE, M.concrete);
    c.walls(x0, 0, z0, x1, 12, zE, plinthM, 3);
    c.box(x0 - 1, 12, z0 - 1, x0, 13, zE + 1, M.mortar); // plinth cap ledge hint (touches plinth top)
    c.box(x1, 12, z0 - 1, x1 + 1, 13, zE + 1, M.mortar); c.box(x0 - 1, 12, z0 - 1, x1 + 1, 13, z0, M.mortar); c.box(x0 - 1, 12, zE, x1 + 1, 13, zE + 1, M.mortar);
    c.box(x0 - 1, 0, z0 - 1, x0, 12, zE + 1, plinthM); c.box(x1, 0, z0 - 1, x1 + 1, 12, zE + 1, plinthM);
    c.box(x0 - 1, 0, z0 - 1, x1 + 1, 12, z0, plinthM); c.box(x0 - 1, 0, zE, x1 + 1, 12, zE + 1, plinthM);

    // ---- side wall cladding (sheet 1 thick) with accent band ----
    c.box(x0, 12, z0, x0 + 1, EH + 3, zE, wallM); c.box(x1 - 1, 12, z0, x1, EH + 3, zE, wallM);
    c.box(x0, EH - 6, z0, x0 + 1, EH + 3, zE, trimM); c.box(x1 - 1, EH - 6, z0, x1, EH + 3, zE, trimM);
    for (let z = z0; z < zE; z += 4) { c.box(x0, 12, z, x0 + 1, EH - 6, z + 1, M.steel); c.box(x1 - 1, 12, z, x1, EH - 6, z + 1, M.steel); } // corrugation ribs
    // gable / end walls
    for (const [zp, zq] of [[z0, z0 + 1], [zE - 1, zE]]) {
      for (let xr = 0; xr < SX; xr++) {
        c.box(x0 + xr, 12, zp, x0 + xr + 1, hAt(xr) + 3, zq, wallM);
        if ((xr & 3) === 0) c.box(x0 + xr, 12, zp, x0 + xr + 1, hAt(xr) + 3, zq, M.steel);
      }
    }

    // ---- portal frames ----
    for (const f of fz) {
      c.box(x0 + 1, 0, f, x0 + 4, EH, f + 3, M.steel);
      c.box(x1 - 4, 0, f, x1 - 1, EH, f + 3, M.steel);
      for (let xr = 1; xr < SX - 1; xr++) c.box(x0 + xr, hAt(xr), f, x0 + xr + 1, hAt(xr) + 3, f + 3, M.steel);
      // knee haunches
      for (let t = 0; t < 8; t++) { c.box(x0 + 4 + t, EH - 8 + t, f, x0 + 5 + t, EH, f + 3, M.steel); c.box(x1 - 5 - t, EH - 8 + t, f, x1 - 4 - t, EH, f + 3, M.steel); }
      // base plates
      c.box(x0, 0, f - 1, x0 + 5, 2, f + 4, M.concrete); c.box(x1 - 5, 0, f - 1, x1, 2, f + 4, M.concrete);
    }
    // eaves beams and wall girts along z
    c.box(x0 + 1, EH, z0 + 1, x0 + 4, EH + 3, zE - 1, M.steel); c.box(x1 - 4, EH, z0 + 1, x1 - 1, EH + 3, zE - 1, M.steel);
    for (const y of [20, 34, 48]) { c.box(x0 + 4, y, z0 + 1, x0 + 6, y + 2, zE - 1, M.steel); c.box(x1 - 6, y, z0 + 1, x1 - 4, y + 2, zE - 1, M.steel); }
    // gable end posts (wind posts) every ~25
    for (const [zp] of [[z0 + 1], [zE - 4]]) {
      for (let xr = 22; xr < SX - 10; xr += 24) { const top = hAt(xr); c.box(x0 + xr, 0, zp, x0 + xr + 3, top, zp + 3, M.steel); }
    }
    // purlins along z, sheet roof 2 thick on top with ribs
    const pur = [];
    if (mono) { for (let xr = 4; xr < SX; xr += 12) pur.push(xr); }
    else { for (let xr = 6; xr < half; xr += 12) { pur.push(xr); pur.push(SX - xr - 2); } pur.push(half - 1); }
    for (const xr of pur) { const h = hAt(xr); c.box(x0 + xr, h + 3, z0 + 1, x0 + xr + 2, h + 5, zE - 1, M.steel); }
    const sheetY = (xr) => hAt(Math.max(-OH, Math.min(SX + OH, xr))) + 5;
    for (let xr = -OH; xr < SX + OH; xr++) {
      const y = sheetY(xr), xx = x0 + xr;
      const yy = mono ? EH + Math.floor(xr * rise / SX) + 5 : EH + Math.floor(Math.min(xr, SX - xr) * rise / half) + 5;
      c.box(xx, yy, z0 - OH, xx + 1, yy + 2, zE + OH, roofM);
      void y;
    }
    // roof ribs (corrugation) along the slope
    for (let z = z0 - OH; z < zE + OH; z += 4) for (let xr = -OH; xr < SX + OH; xr++) {
      const yy = mono ? EH + Math.floor(xr * rise / SX) + 5 : EH + Math.floor(Math.min(xr, SX - xr) * rise / half) + 5;
      c.box(x0 + xr, yy + 2, z, x0 + xr + 1, yy + 3, z + 1, roofM);
    }
    // rooflight strips (glass) replacing two bands of sheet
    for (const zc of [z0 + 34, zE - 56]) for (let xr = 14; xr < SX - 14; xr++) {
      if (!mono && Math.abs(xr - half) < 3) continue;
      const yy = mono ? EH + Math.floor(xr * rise / SX) + 5 : EH + Math.floor(Math.min(xr, SX - xr) * rise / half) + 5;
      c.box(x0 + xr, yy, zc, x0 + xr + 1, yy + 2, zc + 14, M.glass);
      c.box(x0 + xr, yy + 2, zc, x0 + xr + 1, yy + 3, zc + 14, 0);
    }
    // ridge cap / high-side flashing
    if (mono) c.box(x1 - 3, EH + rise + 5, z0 - OH, x1 + OH, EH + rise + 8, zE + OH, trimM);
    else c.box(x0 + (SX >> 1) - 3, EH + rise + 5, z0 - OH, x0 + (SX >> 1) + 3, EH + rise + 8, zE + OH, trimM);
    // gutters
    c.box(x0 - OH, EH + 1, z0 - OH, x0 - OH + 2, EH + 4, zE + OH, M.sheet_zinc);
    // window strip in side walls (glass, clerestory)
    for (let i = 0; i < nb; i++) {
      const za = fz[i] + 6, zb = fz[i + 1] - 3;
      if (zb - za < 6) continue;
      for (const xp of [x0, x1 - 1]) { c.box(xp, 38, za, xp + 1, 50, zb, M.glass); c.box(xp, 43, za, xp + 1, 44, zb, M.steel); c.box(xp, 38, za, xp + 1, 39, zb, M.paint_white); c.box(xp, 50, za, xp + 1, 51, zb, M.paint_white); c.box(xp, 38, (za + zb) >> 1, xp + 1, 51, ((za + zb) >> 1) + 1, M.paint_white); }
    }

    // ---- big door (front) ----
    const dw = 46, dh = 46, dxa = x0 + ((SX - dw) >> 1), dxb = dxa + dw;
    c.box(dxa, 2, z0, dxb, dh, z0 + 3, 0);
    c.box(dxa, 0, z0, dxb, 2, z0 + 3, M.concrete);
    c.box(dxa - 3, 0, z0, dxa, dh + 3, z0 + 4, M.steel_yellow); c.box(dxb, 0, z0, dxb + 3, dh + 3, z0 + 4, M.steel_yellow);
    c.box(dxa - 3, dh, z0, dxb + 3, dh + 3, z0 + 4, M.steel_yellow);
    if (v === 1) for (let y = 24; y < dh; y++) c.box(dxa, y, z0 + 1, dxb, y + 1, z0 + 2, (y & 1) ? M.sheet_blue : M.sheet_zinc);
    if (v === 2) { c.box(dxa, 2, z0 + 1, dxa + 18, dh, z0 + 2, M.sheet_green); c.box(dxb - 18, 2, z0 + 1, dxb, dh, z0 + 2, M.sheet_green); for (let x = dxa + 3; x < dxa + 18; x += 4) { c.box(x, 2, z0 + 2, x + 1, dh, z0 + 3, M.steel); c.box(dxb - 18 + (x - dxa - 3), 2, z0 + 2, dxb - 17 + (x - dxa - 3), dh, z0 + 3, M.steel); } c.box(dxa, dh - 3, z0 + 3, dxb, dh - 1, z0 + 4, M.steel); }
    if (v === 0 || v === 3) c.box(dxa, dh - 4, z0 + 1, dxb, dh, z0 + 2, M.sheet_zinc); // roller coil box
    // apron + steps
    c.box(dxa - 8, 0, 0, dxb + 8, 2, z0, M.concrete);
    c.box(dxa - 10, 0, 4, dxa - 3, 6, z0, M.concrete); c.box(dxb + 3, 0, 4, dxb + 10, 6, z0, M.concrete); // loading kerbs
    c.ground(dxa - 12, 0, dxb + 12, z0, M.asphalt);
    // personnel door
    const pdx = x0 + 12;
    c.box(pdx, 2, z0, pdx + 9, 26, z0 + 3, 0);
    c.box(pdx - 1, 0, z0, pdx, 27, z0 + 3, M.paint_white); c.box(pdx + 9, 0, z0, pdx + 10, 27, z0 + 3, M.paint_white); c.box(pdx - 1, 26, z0, pdx + 10, 27, z0 + 3, M.paint_white);
    c.box(pdx, 2, z0 + 1, pdx + 9, 26, z0 + 2, M.wood_green); c.box(pdx + 2, 16, z0 + 1, pdx + 7, 22, z0 + 2, M.glass);
    c.box(pdx, 0, z0, pdx + 9, 2, z0 + 3, M.concrete);
    // front sign board (attached to the wall)
    c.box(x1 - 34, 30, z0 - 2, x1 - 6, 40, z0, M.paint_white); c.box(x1 - 32, 33, z0 - 2, x1 - 8, 37, z0 - 1, trimM);
    // wall light
    c.box(dxa - 6, 34, z0 - 2, dxa - 3, 37, z0, M.steel); c.box(dxa - 6, 33, z0 - 3, dxa - 3, 34, z0 - 1, M.lamp);

    // ---- interior: racks along the left wall, crates, optional mezzanine ----
    const rackZ0 = z0 + 20, rackZ1 = zE - 18;
    for (const [rx0, rx1] of [[x0 + 8, x0 + 20], [x0 + 22, x0 + 34]]) {
      if (v === 2 && rx0 > x0 + 10) continue;
      for (let z = rackZ0; z <= rackZ1; z += 16) for (const xr of [rx0, rx1 - 2]) c.box(xr, 2, z, xr + 2, 52, z + 2, M.steel);
      for (const y of [14, 30, 46]) {
        for (const xr of [rx0, rx1 - 2]) c.box(xr, y, rackZ0, xr + 2, y + 2, rackZ1 + 2, M.steel_yellow);
        c.box(rx0 + 2, y + 2, rackZ0, rx1 - 2, y + 3, rackZ1 + 2, M.plank);
        // goods on the deck: stretch-wrapped pallets / boxes
        for (let z = rackZ0 + 1; z + 12 < rackZ1; z += 15) {
          if (r() < 0.25) continue;
          const hgt = r.int(7, 11);
          c.box(rx0 + 3, y + 3, z, rx1 - 3, y + 3 + hgt, z + 12, r() < 0.5 ? M.cloth_white : M.plank);
          c.box(rx0 + 3, y + 3 + hgt, z, rx1 - 3, y + 4 + hgt, z + 12, M.wood);
        }
      }
      // rack top tie rails
      c.box(rx0, 52, rackZ0, rx0 + 2, 54, rackZ1 + 2, M.steel); c.box(rx1 - 2, 52, rackZ0, rx1, 54, rackZ1 + 2, M.steel);
    }
    // crates: hollow plank boxes with wood corner posts
    const crate = (x, z, s, y) => {
      c.box(x, y, z, x + s, y + s, z + s, M.plank);
      c.box(x + 1, y + 1, z + 1, x + s - 1, y + s - 1, z + s - 1, 0);
      c.box(x, y, z, x + 1, y + s, z + 1, M.wood); c.box(x + s - 1, y, z, x + s, y + s, z + 1, M.wood);
      c.box(x, y, z + s - 1, x + 1, y + s, z + s, M.wood); c.box(x + s - 1, y, z + s - 1, x + s, y + s, z + s, M.wood);
      c.box(x, y + s - 1, z, x + s, y + s, z + 1, M.wood); c.box(x, y + s - 1, z + s - 1, x + s, y + s, z + s, M.wood);
    };
    const ncr = r.int(8, 12);
    for (let i = 0; i < ncr; i++) {
      const s = r.int(8, 12);
      const cx = x1 - 8 - s - r.int(0, 36), cz = r.int(z0 + 20, zE - 20 - s);
      if (cx < x0 + 40) continue;
      crate(cx, cz, s, 2);
      if (r() < 0.5) crate(cx + 1, cz + 1, s - 3, 2 + s);
    }
    // pallets (low wooden decks) with wrapped goods near the door
    for (const [px, pz] of [[x0 + 46, z0 + 8], [x0 + 62, z0 + 10]]) {
      c.box(px, 2, pz, px + 12, 4, pz + 12, M.wood);
      c.box(px + 1, 4, pz + 1, px + 11, 14, pz + 11, M.cloth_white);
    }
    // mezzanine office in back-right corner (variants 1 and 3)
    if (v === 1 || v === 3) {
      const mx0 = x1 - 44, mx1 = x1 - 4, mz0 = zE - 40, mz1 = zE - 4, my = 30;
      for (const [px, pz] of [[mx0, mz0], [mx1 - 3, mz0], [mx0, mz1 - 3], [mx1 - 3, mz1 - 3], [(mx0 + mx1) >> 1, mz0], [(mx0 + mx1) >> 1, mz1 - 3]]) c.box(px, 2, pz, px + 3, my, pz + 3, M.steel);
      for (let z = mz0; z < mz1; z += 8) c.box(mx0, my - 3, z, mx1, my, z + 2, M.steel);
      c.box(mx0, my - 3, mz0, mx1, my, mz0 + 2, M.steel); c.box(mx0, my - 3, mz1 - 3, mx1, my, mz1, M.steel);
      c.box(mx0, my, mz0, mx1, my + 2, mz1, M.plank);
      // office walls (plaster, 1 thick) with windows + door
      c.walls(mx0 + 2, my + 2, mz0 + 2, mx1 - 14, my + 24, mz1 - 2, M.plaster, 1);
      c.box(mx0 + 8, my + 8, mz0 + 2, mx0 + 22, my + 20, mz0 + 3, M.glass);
      c.box(mx1 - 14 - 1 - 4, my + 2, mz0 + 2, mx1 - 14 - 1 + 0, my + 20, mz0 + 3, 0);
      c.box(mx0 + 2, my + 24, mz0 + 2, mx1 - 14, my + 25, mz1 - 2, M.plank);
      // railing around the open part of the platform
      for (let x = mx1 - 14; x < mx1; x += 4) c.box(x, my + 2, mz0, x + 1, my + 12, mz0 + 1, M.iron);
      for (let z = mz0; z < mz1; z += 4) c.box(mx1 - 1, my + 2, z, mx1, my + 12, z + 1, M.iron);
      c.box(mx1 - 14, my + 12, mz0, mx1, my + 13, mz0 + 1, M.iron); c.box(mx1 - 1, my + 12, mz0, mx1, my + 13, mz1, M.iron);
      c.box(mx1 - 14, my + 7, mz0, mx1, my + 8, mz0 + 1, M.iron); c.box(mx1 - 1, my + 7, mz0, mx1, my + 8, mz1, M.iron);
      // stairs up the left face of the platform, attached to the platform edge
      for (let i = 0; i < 30; i++) c.box(mx0 - 10, 2 + i, mz0 + 2 + i, mx0, 4 + i, mz0 + 3 + i, M.steel_yellow);
      c.box(mx0 - 10, my, mz0 + 30, mx0, my + 2, mz0 + 33, M.plank);
      c.box(mx0 - 10, my, mz0 + 30, mx0 - 9, my + 8, mz0 + 33, M.iron);
    }
    // lean-to canopy on the right side (variant 3): posts + sloped sheet attached to the wall
    if (v === 3) {
      const cx0 = x1, cx1 = x1 + lean;
      for (let z = z0 + 6; z < zE - 6; z += 28) {
        c.box(cx1 - 3, 0, z, cx1, 40, z + 3, M.steel);
        for (let xr = 0; xr < lean; xr++) c.box(cx0 + xr, 44 - Math.floor(xr * 8 / lean), z, cx0 + xr + 1, 47 - Math.floor(xr * 8 / lean), z + 3, M.steel);
      }
      for (let xr = 0; xr < lean; xr++) { const y = 47 - Math.floor(xr * 8 / lean); c.box(cx0 + xr, y, z0 + 2, cx0 + xr + 1, y + 2, zE - 2, roofM); }
      for (let z = z0 + 2; z < zE - 2; z += 4) for (let xr = 0; xr < lean; xr++) c.box(cx0 + xr, 49 - Math.floor(xr * 8 / lean), z, cx0 + xr + 1, 50 - Math.floor(xr * 8 / lean), z + 1, roofM);
      c.box(cx0 + 1, 0, z0 + 2, cx1 - 3, 1, zE - 2, M.concrete); // slab under the canopy
      // stacked pallets under the canopy
      for (const zz of [z0 + 14, z0 + 44, z0 + 78]) { c.box(cx0 + 3, 1, zz, cx0 + 15, 3, zz + 12, M.wood); c.box(cx0 + 4, 3, zz + 1, cx0 + 14, 15, zz + 11, M.cloth_white); }
    }
    return c;
  },
};
