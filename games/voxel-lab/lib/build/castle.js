// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
// Castle: curtain wall segment with walkway + crenellations, a round / square tower (hollow, floors, arrow slits),
// optional conical tile roof, and a gate arch with a plank door in variant 0.
import { Canvas, M, rng } from './kit.js';

export default {
  id: 'castle',
  name: 'Tường thành và tháp',
  variants: 3,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 3) + 3) % 3;
    const round = v !== 1;
    const roofed = v === 2;
    const gate = v === 0;
    const Rt = round ? 33 : 31;
    const Ht = r.int(112, 132);
    const WT = r.int(12, 15);                    // wall thickness
    const WH = r.int(60, 68);                    // wall body height (walkway level)
    const WX = 150;                              // wall length to the tower centre
    const tcx = WX + 6, tcz = 38;
    const c = new Canvas(tcx + Rt + 8, Ht + (roofed ? 46 : 14), 2 * tcz);
    const wz0 = tcz - Math.floor(WT / 2), wz1 = wz0 + WT;
    const rad = (x, z) => round ? Math.hypot(x + 0.5 - tcx, z + 0.5 - tcz) : Math.max(Math.abs(x + 0.5 - tcx), Math.abs(z + 0.5 - tcz));
    const band = (ro, ri, y0, y1, m) => {
      for (let z = 0; z < c.sz; z++) for (let x = 0; x < c.sx; x++) { const d = rad(x, z); if (d <= ro && d >= ri) for (let y = y0; y < y1; y++) c.set(x, y, z, m); }
    };
    // ---- wall ----
    const wend = tcx - Rt + 7;
    c.box(0, 0, wz0, wend, WH, wz1, M.stone);
    c.box(0, 0, wz0 - 2, wend, 9, wz0, M.ashlar); c.box(0, 0, wz1, wend, 9, wz1 + 2, M.ashlar);           // plinth
    c.box(0, 9, wz0 - 1, wend, 10, wz0, M.ashlar); c.box(0, 9, wz1, wend, 10, wz1 + 1, M.ashlar);
    c.box(0, WH - 4, wz0 - 1, wend, WH - 2, wz0, M.ashlar); c.box(0, WH - 4, wz1, wend, WH - 2, wz1 + 1, M.ashlar); // string course
    // ashlar block pattern on the faces (alternate courses)
    for (let y = 12; y < WH - 6; y += 6) for (let x = (y / 6) % 2 ? 0 : 6; x < wend; x += 12) {
      c.box(x, y, wz0, x + 6, y + 1, wz0 + 1, M.ashlar); c.box(x, y, wz1 - 1, x + 6, y + 1, wz1, M.ashlar);
    }
    // end quoins
    for (let y = 0; y < WH; y += 4) c.box(0, y, wz0, (y / 4) % 2 ? 5 : 3, y + 2, wz1, M.ashlar);
    // buttresses on the outer (-z) face
    const gx = 62;
    for (const bx of gate ? [24, 108] : [30, 75, 118]) {
      c.box(bx, 0, wz0 - 6, bx + 7, 20, wz0, M.stone);
      c.box(bx + 1, 20, wz0 - 4, bx + 6, 38, wz0, M.stone);
      c.box(bx + 2, 38, wz0 - 2, bx + 5, 52, wz0, M.stone);
      c.box(bx, 20, wz0 - 6, bx + 7, 21, wz0 - 4, M.ashlar); c.box(bx + 1, 38, wz0 - 4, bx + 6, 39, wz0 - 2, M.ashlar);
      c.box(bx + 2, 52, wz0 - 2, bx + 5, 53, wz0, M.ashlar);
    }
    // parapets: outer crenellated, inner low kerb
    for (let x = 0; x < wend; x++) {
      c.box(x, WH, wz0, x + 1, WH + 4, wz0 + 3, M.stone);
      if ((x + 2) % 10 < 6) { c.box(x, WH + 4, wz0, x + 1, WH + 11, wz0 + 3, M.stone); c.box(x, WH + 11, wz0, x + 1, WH + 12, wz0 + 3, M.ashlar); }
      c.box(x, WH, wz1 - 1, x + 1, WH + 2, wz1, M.stone);
    }
    c.box(0, WH + 4, wz0 + 1, wend, WH + 5, wz0 + 3, M.ashlar);
    // inner ladder up to the walkway
    const lz = wz1;
    for (let y = 0; y < WH + 3; y++) { c.set(14, y, lz, M.wood_dark); c.set(19, y, lz, M.wood_dark); if (y % 3 === 1) c.box(14, y, lz, 20, y + 1, lz + 1, M.wood); }
    // ---- gate ----
    if (gate) {
      const gw = 13, gy = 22;
      const open = (x, y, g) => (Math.abs(x + 0.5 - gx) <= gw + g && y + 0.5 < gy) || Math.hypot(x + 0.5 - gx, y + 0.5 - gy) <= gw + g;
      for (let x = gx - gw - 6; x <= gx + gw + 6; x++) for (let y = 0; y < gy + gw + 6; y++) {
        const face = (z) => z < wz0 + 3 || z >= wz1 - 3;
        for (let z = wz0 - 6; z < wz1 + 3; z++) {
          if (open(x, y, 0)) c.set(x, y, z, 0);
          else if (open(x, y, 4) && c.get(x, y, z) && face(z)) c.set(x, y, z, M.ashlar);
        }
      }
      // plank double door set in the middle of the passage
      const dz = Math.floor((wz0 + wz1) / 2) - 1;
      for (let x = gx - gw; x <= gx + gw; x++) for (let y = 0; y < gy + gw; y++) if (open(x, y, 0)) {
        const m = (x === gx - 1 || x === gx) ? M.wood_dark : ((x - gx + gw) % 5 === 0 ? M.wood : M.plank);
        c.box(x, y, dz, x + 1, y + 1, dz + 2, (y % 11 === 4 || y % 11 === 5) && x !== gx && x !== gx - 1 ? M.iron : m);
      }
      c.box(gx - 3, 14, dz - 1, gx - 1, 17, dz, M.iron); c.box(gx + 1, 14, dz - 1, gx + 3, 17, dz, M.iron);   // ring handles
    }
    // ---- tower ----
    const wt = 6;
    band(Rt, 0, 0, Ht, M.stone);
    band(Rt - wt, 0, 1, Ht - 4, 0);                       // hollow
    band(Rt + 2, Rt - 1, 0, 9, M.ashlar);                 // plinth
    band(Rt + 1, Rt - 1, 9, 10, M.ashlar);
    const floors = [WH - 3, Math.round((WH + Ht) / 2) + 6];
    for (const fy of floors) {
      band(Rt - wt + 1, 0, fy, fy + 3, M.plank);
      band(Rt + 1, Rt - 2, fy, fy + 1, M.ashlar);         // string course at floor
      for (let b = -22; b <= 22; b += 9) for (let x = tcx - 28; x < tcx + 28; x++) for (let z = tcz + b; z < tcz + b + 2; z++) {
        if (rad(x, z) <= Rt - wt + 1 && !c.get(x, fy - 1, z)) { c.set(x, fy - 1, z, M.wood_dark); c.set(x, fy - 2, z, M.wood_dark); }
      }
      c.box(tcx - 4, fy, tcz - 4, tcx + 4, fy + 3, tcz + 4, 0);                                                   // hatch
    }
    // crown: corbel + crenellated parapet (or conical roof)
    band(Rt + 3, Rt - wt, Ht - 5, Ht - 1, M.ashlar);
    band(Rt + 3, 0, Ht - 4, Ht, M.stone);
    band(Rt + 3, Rt - wt, Ht - 1, Ht, M.ashlar);
    if (!roofed) {
      for (let z = 0; z < c.sz; z++) for (let x = 0; x < c.sx; x++) {
        const d = rad(x, z); if (d > Rt + 3 || d < Rt) continue;
        const dx = x + 0.5 - tcx, dz = z + 0.5 - tcz;
        let mer;
        if (round) mer = Math.floor((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI / 30)) % 2 === 0;
        else mer = Math.abs(dx) > Math.abs(dz) ? ((z >> 2) % 2 === 0) : ((x >> 2) % 2 === 0);
        for (let y = Ht; y < Ht + (mer ? 11 : 4); y++) c.set(x, y, z, M.stone);
        if (mer) c.set(x, Ht + 11, z, M.ashlar);
      }
      // flag pole with cloth
      c.box(tcx - 1, Ht, tcz - 1, tcx + 1, Ht + 14, tcz + 1, M.wood_dark);
      c.box(tcx + 1, Ht + 9, tcz - 1, tcx + 7, Ht + 14, tcz, M.cloth_red);
    } else {
      const ch = 40, base = Rt + 4;
      for (let k = 0; k < ch; k++) {
        const ro = base * (1 - k / ch);
        for (let z = 0; z < c.sz; z++) for (let x = 0; x < c.sx; x++) {
          const d = rad(x, z); if (d <= ro && d >= Math.max(0, ro - (k === 0 ? Rt + 4 - (Rt - wt) : 5))) c.set(x, Ht + k, z, M.rooftile);
        }
      }
      c.box(tcx - 1, Ht + ch, tcz - 1, tcx + 1, Ht + ch + 7, tcz + 1, M.iron);
      c.box(tcx - 1, Ht + ch + 7, tcz - 1, tcx + 1, Ht + ch + 8, tcz + 1, M.lamp);
    }
    // arrow slits (2 wide, 3 wide inside), axis aligned so they stay face-open
    const slit = (dirx, dirz, y) => {
      for (let t = Rt - wt - 1; t <= Rt + 1; t += 1) {
        const px = Math.round(tcx + dirx * t), pz = Math.round(tcz + dirz * t);
        const w = t < Rt - 3 ? 3 : 2;
        c.box(px - 1, y, pz - 1, px - 1 + w, y + 9, pz - 1 + w, 0);
      }
    };
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const ys = [18, 38, 74, 92, Ht - 24];
    ys.forEach((y, i) => {
      if (Math.abs(floors[0] - y) < 11 || Math.abs(floors[1] - y) < 11 || y + 10 > Ht - 6) return;
      for (let k = 0; k < 4; k++) if ((k + i) % 2 === 0 || k <= 1) { const [a, b] = dirs[k]; if (!(a === -1 && y >= floors[0] - 12)) slit(a, b, y); }
    });
    // wall-walk doorway into the tower, and a ground door on the courtyard (+z) side
    c.box(tcx - Rt - 1, WH, tcz - 4, tcx - Rt + 9, WH + 14, tcz + 4, 0);
    c.box(tcx - Rt - 1, WH + 14, tcz - 4, tcx - Rt + 9, WH + 15, tcz + 4, M.ashlar);
    const dzi = tcz + Rt;
    c.box(tcx - 5, 0, dzi - 9, tcx + 5, 22, dzi + 1, 0);
    for (let x = tcx - 5; x < tcx + 5; x++) for (let y = 0; y < 22; y++) c.box(x, y, dzi - 5, x + 1, y + 1, dzi - 3, (x === tcx - 1 || x === tcx) ? M.wood_dark : (y % 9 === 3 ? M.iron : M.plank));
    c.box(tcx - 6, 22, dzi - 8, tcx + 6, 24, dzi, M.ashlar);
    c.ground(0, 0, c.sx, c.sz, M.gravel);
    return c;
  },
};
