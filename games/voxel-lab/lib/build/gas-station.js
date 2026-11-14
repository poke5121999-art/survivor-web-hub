// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
// Gas station: canopy on 4 steel columns, pump islands on a concrete kerb, brick + glass kiosk, price pylon,
// FUEL DRUMS (red shell, M.fuel core) and an above-ground horizontal fuel tank. The fuel voxels explode.
import { Canvas, M, rng } from './kit.js';

/** a 6 x 9 voxel drum: 1 voxel shell, steel hoops, M.fuel inside. (cx, cz) is the grid-corner centre. */
export function drum(c, cx, cz, y0, shell = M.paint_red) {
  c.cylY(cx, cz, 3, y0, y0 + 9, shell);
  c.cylY(cx, cz, 1.9, y0 + 1, y0 + 8, M.fuel);
  c.cylY(cx, cz, 3, y0 + 2, y0 + 3, M.steel, 2.2);
  c.cylY(cx, cz, 3, y0 + 6, y0 + 7, M.steel, 2.2);
  c.cylY(cx, cz, 1.2, y0 + 8, y0 + 9, M.steel);       // bung
}

export default {
  id: 'gas-station',
  name: 'Trạm xăng',
  variants: 3,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 3) + 3) % 3;
    const SX = 160, SZ = 112, SY = 82;
    const c = new Canvas(SX, SY, SZ);
    const main = v === 1 ? M.paint_yellow : M.paint_red;
    const kioskM = [M.brick, M.brick_buff, M.brick_dark][v];
    c.ground(0, 0, SX, SZ, M.asphalt);
    // painted forecourt apron strip
    // ---- canopy ----
    const cx0 = 20, cx1 = 140, cz0 = 20, cz1 = 72, cy = 50;
    const colX = [32, cx1 - 38], colZ = [28, 62];
    for (const px of colX) for (const pz of colZ) {
      c.box(px - 5, 0, pz - 5, px + 5, 3, pz + 5, M.concrete);                       // plinth
      c.box(px - 3, 3, pz - 3, px + 3, cy, pz + 3, M.paint_white);                  // painted steel column
      c.box(px - 2, 3, pz - 2, px + 2, cy, pz + 2, M.steel);
      c.box(px - 3, 3, pz - 3, px + 3, 8, pz + 3, M.paint_yellow);                  // bollard stripe
      c.box(px - 4, 3, pz - 4, px + 4, 5, pz + 4, M.concrete);
    }
    c.box(cx0, cy, cz0, cx1, cy + 3, cz1, M.steel);                                  // slab
    c.box(cx0, cy + 3, cz0, cx1, cy + 4, cz1, M.sheet_zinc);                         // sheet roof skin
    // fascia (ring, 2 thick): white lower band, colour upper band, ends accent
    for (const [x0, z0, x1, z1] of [[cx0, cz0, cx1, cz0 + 2], [cx0, cz1 - 2, cx1, cz1], [cx0, cz0, cx0 + 2, cz1], [cx1 - 2, cz0, cx1, cz1]]) {
      c.box(x0, cy - 5, z0, x1, cy, z1, M.paint_white);
      c.box(x0, cy, z0, x1, cy + 7, z1, main);
    }
    c.box(cx0 + 20, cy, cz0, cx1 - 20, cy + 7, cz0 + 2, main); c.box(cx0 + 30, cy + 1, cz0 - 1, cx1 - 30, cy + 6, cz0, M.paint_white);
    c.box(cx0 + 36, cy + 2, cz0 - 1, cx0 + 40, cy + 5, cz0, main); c.box(cx0 + 44, cy + 2, cz0 - 1, cx0 + 52, cy + 5, cz0, main); c.box(cx1 - 52, cy + 2, cz0 - 1, cx1 - 44, cy + 5, cz0, main); c.box(cx1 - 40, cy + 2, cz0 - 1, cx1 - 36, cy + 5, cz0, main);
    // lamps under the slab (3x3 emissive panels)
    for (let x = cx0 + 14; x < cx1 - 10; x += 22) for (const z of [30, 54]) c.box(x, cy - 1, z, x + 4, cy, z + 4, M.lamp);
    // ---- pump islands ----
    const nIsl = v === 1 ? 3 : 2;
    const islX = nIsl === 3 ? [48, 76, 104] : [62, 98];
    for (const ix of islX) {
      c.box(ix - 5, 0, 26, ix + 5, 3, 66, M.concrete);
      c.box(ix - 5, 3, 26, ix + 5, 4, 28, M.paint_yellow); c.box(ix - 5, 3, 64, ix + 5, 4, 66, M.paint_yellow);   // yellow curb ends
      c.box(ix - 5, 3, 26, ix - 4, 4, 66, M.paint_yellow); c.box(ix + 4, 3, 26, ix + 5, 4, 66, M.paint_yellow);
      for (const pz of [33, 55]) {
        c.box(ix - 3, 3, pz, ix + 3, 20, pz + 7, main);                                // pump body
        c.box(ix - 3, 3, pz, ix + 3, 6, pz + 7, M.steel);
        for (const side of [-1, 1]) {
          const fx = side < 0 ? ix - 3 : ix + 2;
          c.box(fx, 10, pz + 1, fx + 1, 17, pz + 6, M.glass_tint);                       // display window
          c.box(fx, 13, pz + 2, fx + 1, 14, pz + 5, M.lamp);                             // digits glow
          c.box(side < 0 ? ix - 4 : ix + 3, 7, pz + 3, side < 0 ? ix - 3 : ix + 4, 12, pz + 4, M.iron);   // hose + nozzle holder
          c.box(side < 0 ? ix - 4 : ix + 3, 6, pz + 2, side < 0 ? ix - 3 : ix + 4, 7, pz + 5, M.iron);
        }
        c.box(ix - 4, 20, pz - 1, ix + 4, 22, pz + 8, M.paint_white);                  // pump cap
        c.box(ix - 3, 22, pz, ix + 3, 23, pz + 7, main);
        c.box(ix - 1, 23, pz + 2, ix + 1, 25, pz + 5, M.lamp);                         // brand light
        c.box(ix - 3, 3, pz + 7, ix + 3, 12, pz + 8, M.paint_white);                   // splash guard stripe (z+)
      }
      // bollards at island ends
      for (const bz of [24, 66]) c.box(ix - 1, 0, bz, ix + 1, 10, bz + 2, M.paint_yellow);
    }
    // painted lane marks (ground patches would be flat; use thin rc/paint voxels flush on the ground)
    // ---- kiosk ----
    const kx0 = 58, kx1 = 108, kz0 = 82, kz1 = 106, kh = 32;
    c.box(kx0 - 2, 0, kz0 - 2, kx1 + 2, 2, kz1 + 2, M.concrete);                     // slab / apron
    c.walls(kx0, 2, kz0, kx1, kh, kz1, kioskM, 2);
    for (let y = 8; y < kh; y += 8) c.box(kx0, y, kz0 - 1, kx1, y + 1, kz0, M.mortar);
    c.box(kx0, kh - 6, kz0 - 1, kx1, kh - 4, kz0, M.paint_white);                    // front string band
    // glass shopfront
    c.box(kx0 + 10, 10, kz0, kx0 + 34, 26, kz0 + 2, M.glass); c.box(kx0 + 10, 10, kz0, kx0 + 34, 11, kz0 + 2, M.steel); c.box(kx0 + 10, 25, kz0, kx0 + 34, 26, kz0 + 2, M.steel);
    for (const x of [kx0 + 16, kx0 + 22, kx0 + 28]) c.box(x, 10, kz0, x + 1, 26, kz0 + 2, M.steel);
    // door
    c.box(kx0 + 38, 2, kz0, kx0 + 46, 24, kz0 + 2, M.glass_tint); c.box(kx0 + 37, 2, kz0, kx0 + 38, 25, kz0 + 2, M.steel); c.box(kx0 + 46, 2, kz0, kx0 + 47, 25, kz0 + 2, M.steel); c.box(kx0 + 37, 24, kz0, kx0 + 47, 25, kz0 + 2, M.steel);
    c.box(kx0 + 44, 12, kz0 - 1, kx0 + 45, 16, kz0, M.iron);
    // side window
    c.box(kx0, 12, kz0 + 8, kx0 + 2, 24, kz0 + 18, M.glass); c.box(kx1 - 2, 12, kz0 + 8, kx1, 24, kz0 + 18, M.glass);
    // flat roof with overhang + parapet + sign
    c.box(kx0 - 3, kh, kz0 - 4, kx1 + 3, kh + 3, kz1 + 3, M.rc);
    c.box(kx0 - 3, kh + 3, kz0 - 4, kx1 + 3, kh + 5, kz0 - 2, main);
    c.box(kx0 - 3, kh + 3, kz1 + 1, kx1 + 3, kh + 5, kz1 + 3, M.rc);
    c.box(kx0 + 6, kh + 5, kz0 - 3, kx1 - 6, kh + 11, kz0 - 1, M.paint_white);       // roof-top sign board
    c.box(kx0 + 8, kh + 7, kz0 - 4, kx1 - 8, kh + 9, kz0 - 3, main);
    for (let x = kx0 + 10; x < kx1 - 10; x += 5) c.box(x, kh + 7, kz0 - 5, x + 3, kh + 9, kz0 - 4, M.lamp);
    c.box(kx0 + 10, kh + 3, kz0 + 6, kx0 + 16, kh + 7, kz0 + 10, M.steel);            // AC unit
    // interior: counter + shelf + lamp
    c.box(kx0 + 6, 2, kz0 + 8, kx0 + 36, 12, kz0 + 11, M.plank); c.box(kx0 + 6, 12, kz0 + 8, kx0 + 36, 13, kz0 + 11, M.wood_dark);
    c.box(kx0 + 8, 2, kz1 - 6, kx1 - 8, 22, kz1 - 2, M.wood); for (let y = 8; y < 22; y += 5) c.box(kx0 + 8, y, kz1 - 7, kx1 - 8, y + 1, kz1 - 6, M.plank);
    c.box(kx0 + 20, kh - 1, kz0 + 14, kx0 + 28, kh, kz0 + 18, M.lamp);
    // ---- price pylon ----
    c.box(150, 0, 8, 156, 3, 14, M.concrete);
    c.box(152, 3, 10, 154, 62, 12, M.steel);
    c.box(143, 52, 9, 163 > SX ? SX : 160, 53, 13, M.steel);
    c.box(144, 53, 9, 160, 78, 13, M.paint_white);
    c.box(144, 70, 8, 160, 78, 9, main);
    for (let i = 0; i < 3; i++) { c.box(146, 55 + i * 5, 8, 150, 58 + i * 5, 9, M.lamp); c.box(152, 55 + i * 5, 8, 158, 58 + i * 5, 9, M.lamp); }
    // ---- fuel storage ----
    const drumShell = v === 1 ? M.paint_red : (v === 0 ? M.paint_red : M.paint_yellow);
    if (v !== 1) {
      // horizontal above-ground tank on two concrete saddles
      const tx0 = 8, tx1 = 50, tcy = 12, tcz = 96, rr = 9;
      c.box(tx0 + 7, 0, tcz - 11, tx0 + 13, 5, tcz + 11, M.concrete); c.box(tx1 - 13, 0, tcz - 11, tx1 - 7, 5, tcz + 11, M.concrete);
      for (let x = tx0; x < tx1; x++) for (let y = 2; y <= 2 * tcy - 3; y++) for (let z = tcz - rr; z <= tcz + rr; z++) {
        const d = Math.hypot(y + 0.5 - tcy, z + 0.5 - tcz); if (d > rr) continue;
        const cap = x < tx0 + 2 || x >= tx1 - 2;
        c.set(x, y, z, (cap || d >= rr - 2) ? ((x % 14 === 0 || x % 14 === 1) ? M.steel_yellow : M.steel) : M.fuel);
      }
      c.box(tx0 + 18, 2 * tcy - 3, tcz - 2, tx0 + 24, 2 * tcy + 1, tcz + 2, M.steel); c.box(tx0 + 19, 2 * tcy + 1, tcz - 1, tx0 + 23, 2 * tcy + 2, tcz + 1, main);   // manhole
      c.box(tx1 - 4, 0, tcz - 1, tx1 - 2, tcy - 2, tcz + 1, M.iron); c.box(tx1 - 4, tcy - 2, tcz - 1, tx1 - 1, tcy - 1, tcz + 1, M.iron);                    // fill pipe
      c.box(tx0 + 2, 0, tcz - 3, tx0 + 3, tcy + 2, tcz - 2, M.steel);                                                                                      // gauge stand
    }
    const rows = v === 0 ? 6 : 0;
    for (let i = 0; i < rows; i++) {
      drum(c, 120 + i * 6, 90, 0, drumShell);
      drum(c, 120 + i * 6, 97, 0, i % 2 ? M.paint_white : drumShell);
    }
    if (v === 0) { drum(c, 123, 90, 9, drumShell); drum(c, 129, 90, 9, M.paint_yellow); drum(c, 126, 97, 9, drumShell); } // stacked second tier
    if (v !== 0) {
      // pyramid of drums: 4 + 3 + 2 on the ground, upper layers offset half a drum so they touch face to face
      const bx = v === 1 ? 118 : 120, bz = v === 1 ? 92 : 100;
      for (let i = 0; i < 4; i++) drum(c, bx + 3 + i * 6, bz, 0, drumShell);
      for (let i = 0; i < 3; i++) drum(c, bx + 6 + i * 6, bz, 9, i % 2 ? M.paint_white : drumShell);
      for (let i = 0; i < 2; i++) drum(c, bx + 9 + i * 6, bz, 18, drumShell);
      drum(c, bx + 12, bz, 27, M.paint_yellow);
    }
    if (v === 1) for (let i = 0; i < 4; i++) drum(c, 124 + i * 6, 106, 0, M.paint_white);
    // low brick/concrete barrier wall around the drum yard
    c.box(112, 0, 80, 158, 6, 82, M.concrete); c.box(112, 0, 80, 114, 6, 110, M.concrete); c.box(156, 0, 80, 158, 6, 110, M.concrete);
    c.box(112, 6, 80, 158, 7, 82, M.paint_yellow);
    // fence along the street front of the kiosk side (bollards chain)
    for (let x = 6; x < SX - 4; x += 12) c.box(x, 0, 3, x + 2, 6, 5, M.concrete);
    // air-pump / oil can stack by the kiosk
    c.box(110, 0, 84, 116, 10, 90, M.paint_white); c.box(111, 10, 85, 115, 12, 89, main);
    return c;
  },
};
