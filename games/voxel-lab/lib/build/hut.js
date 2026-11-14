// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
// Vietnamese bamboo / thatch hut: bamboo posts, woven walls 1 voxel thick, steep stepped thatch roof with overhang,
// veranda, optional stilts (variant 1) and hip roof (variant 2), jar and small props. Highly flammable by design.
import { Canvas, M, rng } from './kit.js';

export default {
  id: 'hut',
  name: 'Nhà tranh tre',
  variants: 3,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 3) + 3) % 3;
    const stilts = v === 1, hip = v === 2;
    const F = stilts ? r.int(18, 22) : 4;           // floor level
    const wh = r.int(23, 25);                       // wall height
    const ytop = F + wh + 2;                        // underside of the roof at the wall line
    const T = 5;                                    // thatch thickness (vertical)
    const s = stilts ? 1.25 : (hip ? 1.1 : 1.2);    // roof slope (rise per voxel)
    const zc = 44, xc = 39;
    const bx0 = 9, bx1 = 69, bz0 = 22, bz1 = 66, vz0 = 14;
    const peak = Math.ceil(ytop + T - 1 + 21.5 * s);
    const c = new Canvas(78, peak + 14, 78);
    const rh = hip ? 8 : 1000;                      // half ridge length (hip roof)
    const hf = (x, z) => {
      const dz = Math.abs(z + 0.5 - zc) * s, dx = Math.max(0, Math.abs(x + 0.5 - xc) - rh) * s;
      return Math.floor(peak - Math.max(dz, dx));
    };
    const inRoof = (x, z) => x >= 3 && x < 75 && z >= 14 && z < 74;
    const rb = (x, z) => hf(x, z) - (T - 1);
    const weave = (x, y) => (((x >> 1) + (y >> 1)) % 2 ? M.bamboo : M.plank);
    // ---- floor frame ----
    const joistX = [10, 22, 34, 46, 58, 66];
    for (const jx of joistX) c.box(jx, F - 3, vz0, jx + 2, F - 1, bz1, M.bamboo);
    for (const jz of [vz0, bz0, 43, bz1 - 2]) c.box(bx0 - 1, F - 3, jz, bx1 + 1, F - 1, jz + 2, M.bamboo);
    c.box(bx0 - 1, F - 1, vz0, bx1 + 1, F, bz1, M.plank);                 // floor deck
    // ---- posts (3x3 bamboo) from the ground up into the thatch ----
    const PX = [8, 38, 66], PZ = [14, 21, 63];
    for (const px of PX) for (const pz of PZ) {
      if (pz === 14 && px === 38 && !stilts) { /* centre porch post only on stilts */ }
      const top = rb(px + 1, pz + 1) + 2;
      c.box(px, 0, pz, px + 3, top, pz + 3, M.bamboo);
      for (let y = 6; y < top; y += 9) c.box(px, y, pz, px + 3, y + 1, pz + 3, M.wood_dark); // lashing bands
    }
    // under-floor braces for stilts
    if (stilts) {
      for (const pz of [14, 21, 63]) for (let i = 0; i < 2; i++) {
        const a = PX[i] + 3, b = PX[i + 1];
        c.line(a, 3, pz + 1, b, F - 3, pz + 1, M.bamboo, 2); c.line(a, F - 3, pz + 1, b, 3, pz + 1, M.bamboo, 2);
      }
      for (const px of PX) { c.line(px + 1, 3, 17, px + 1, F - 3, 22, M.bamboo, 2); c.line(px + 1, 3, 25, px + 1, F - 3, 21, M.bamboo, 2); }
      for (const px of PX) for (const jz of [18]) c.box(px, 8, jz, px + 3, 10, jz + 1, M.bamboo);
    }
    // ---- walls (1 voxel woven) ----
    const wall = (x0, z0, x1, z1) => { // fills box with weave pattern between y=F and ytop-2
      for (let y = F; y < F + wh; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) c.set(x, y, z, weave(x + z, y));
    };
    wall(bx0, bz0, bx1, bz0 + 1); wall(bx0, bz1 - 1, bx1, bz1); wall(bx0, bz0, bx0 + 1, bz1); wall(bx1 - 1, bz0, bx1, bz1);
    // wall plate beams (top) and sill beam (bottom)
    c.walls(bx0 - 1, F + wh, bz0 - 1, bx1 + 1, F + wh + 2, bz1 + 1, M.wood_dark, 2);
    c.walls(bx0, F, bz0, bx1, F + 2, bz1, M.wood_dark, 1);
    // horizontal bamboo girts at mid height
    c.walls(bx0, F + 12, bz0, bx1, F + 13, bz1, M.bamboo, 1);
    // ---- door and windows ----
    const frame = M.wood_dark;
    const carve = (x0, y0, z0, x1, y1, z1) => c.box(x0, y0, z0, x1, y1, z1, 0);
    carve(33, F + 2, bz0, 45, F + 20, bz0 + 1);
    c.box(31, F + 20, bz0 - 1, 47, F + 22, bz0 + 1, frame); c.box(31, F, bz0 - 1, 33, F + 22, bz0 + 1, frame); c.box(45, F, bz0 - 1, 47, F + 22, bz0 + 1, frame);
    carve(33, F, bz0, 45, F + 2, bz0 + 1);
    // interior bed platform (bamboo) so the room is not empty
    c.box(12, F, bz1 - 16, 36, F + 4, bz1 - 1, M.bamboo); c.box(13, F + 4, bz1 - 15, 35, F + 5, bz1 - 2, M.plank);
    c.box(52, F, bz1 - 10, 62, F + 7, bz1 - 1, M.plank); c.box(52, F + 7, bz1 - 10, 62, F + 8, bz1 - 1, M.wood_dark); // chest
    const win = (x0, z0, axis) => {
      const w = 8, y0 = F + 9, y1 = F + 16;
      if (axis === 'z') {
        carve(x0, y0, z0, x0 + w, y1, z0 + 1);
        c.box(x0 - 1, y0 - 1, z0, x0 + w + 1, y0, z0 + 1, frame); c.box(x0 - 1, y1, z0, x0 + w + 1, y1 + 1, z0 + 1, frame);
        c.box(x0 - 1, y0, z0, x0, y1, z0 + 1, frame); c.box(x0 + w, y0, z0, x0 + w + 1, y1, z0 + 1, frame);
        const out = z0 < zc ? -1 : 1, zo = out < 0 ? z0 - 1 : z0 + 1;
        c.box(x0 - 2, y1 + 1, Math.min(z0, zo), x0 + w + 2, y1 + 2, Math.max(z0, zo) + 1, M.plank);   // little awning board
        c.box(x0 - 2, y0 - 2, Math.min(z0, zo), x0 + w + 2, y0 - 1, Math.max(z0, zo) + 1, M.plank);   // sill board
      } else {
        carve(x0, y0, z0, x0 + 1, y1, z0 + w);
        c.box(x0, y0 - 1, z0 - 1, x0 + 1, y0, z0 + w + 1, frame); c.box(x0, y1, z0 - 1, x0 + 1, y1 + 1, z0 + w + 1, frame);
        c.box(x0, y0, z0 - 1, x0 + 1, y1, z0, frame); c.box(x0, y0, z0 + w, x0 + 1, y1, z0 + w + 1, frame);
        const out = x0 < xc ? -1 : 1, xo = out < 0 ? x0 - 1 : x0 + 1;
        c.box(Math.min(x0, xo), y1 + 1, z0 - 2, Math.max(x0, xo) + 1, y1 + 2, z0 + w + 2, M.plank);
        c.box(Math.min(x0, xo), y0 - 2, z0 - 2, Math.max(x0, xo) + 1, y0 - 1, z0 + w + 2, M.plank);
      }
    };
    win(16, bz0, 'z'); win(55, bz0, 'z'); win(20, bz1 - 1, 'z'); win(52, bz1 - 1, 'z');
    win(bx0, 38, 'x'); win(bx1 - 1, 38, 'x');
    // ---- roof (stepped thatch, thick) ----
    for (let z = 14; z < 74; z++) for (let x = 3; x < 75; x++) {
      if (!inRoof(x, z)) continue;
      const top = hf(x, z), bot = rb(x, z);
      for (let y = bot; y <= top; y++) c.set(x, y, z, M.thatch);
      // bamboo battens on the surface every 7 rows
      const d = Math.max(Math.abs(z + 0.5 - zc), hip ? Math.max(0, Math.abs(x + 0.5 - xc) - rh) : 0);
      if (Math.floor(d) % 7 === 3) c.set(x, top, z, M.bamboo);
      // ragged eave: trim every third column slightly
      if ((x * 7 + z * 3) % 5 === 0 && z < 17 || (x * 7 + z * 3) % 5 === 0 && z > 70) c.set(x, bot, z, 0);
    }
    // ridge cap + ridge pole + crossed finials
    const ry = hf(xc, zc);
    if (!hip) {
      c.box(3, ry - 1, zc - 2, 75, ry + 2, zc + 2, M.bamboo);
      c.box(6, ry - 4, zc - 1, 72, ry - 1, zc + 1, M.wood_dark);               // ridge beam under the thatch
      for (const fx of [4, 73]) { c.line(fx, ry + 1, zc - 4, fx, ry + 8, zc + 3, M.bamboo, 2); c.line(fx, ry + 1, zc + 3, fx, ry + 8, zc - 4, M.bamboo, 2); }
    } else {
      c.box(xc - rh - 2, ry - 1, zc - 2, xc + rh + 2, ry + 2, zc + 2, M.bamboo);
      c.box(xc - 1, ry + 2, zc - 1, xc + 1, ry + 9, zc + 1, M.bamboo); c.box(xc - 2, ry + 9, zc - 2, xc + 2, ry + 10, zc + 2, M.thatch);
    }
    // eave beams under the thatch front and back
    c.box(3, rb(3, 14) - 1, 14, 75, rb(3, 14), 15, M.bamboo); c.box(3, rb(3, 73) - 1, 73, 75, rb(3, 73), 74, M.bamboo);
    // fill gable / hip gaps between the wall plate and the roof with woven wall
    for (let y = ytop; y < peak; y++) {
      for (let x = bx0; x < bx1; x++) for (const z of [bz0, bz1 - 1]) if (!c.get(x, y, z) && c.get(x, y + 1, z) !== 0 || (!c.get(x, y, z) && y < rb(x, z))) if (y < rb(x, z)) c.set(x, y, z, weave(x + z, y));
      for (let z = bz0; z < bz1; z++) for (const x of [bx0, bx1 - 1]) if (!c.get(x, y, z) && y < rb(x, z)) c.set(x, y, z, weave(x + z, y));
    }
    // ---- veranda: front railing + steps ----
    for (let x = bx0 - 1; x <= bx1; x += 6) {
      if (x > 27 && x < 49) continue;
      c.box(x, F, vz0, x + 1, F + 10, vz0 + 1, M.bamboo);
    }
    c.box(bx0 - 1, F + 9, vz0, 28, F + 10, vz0 + 1, M.bamboo); c.box(48, F + 9, vz0, bx1 + 1, F + 10, vz0 + 1, M.bamboo);
    c.box(bx0 - 1, F + 5, vz0, 28, F + 6, vz0 + 1, M.bamboo); c.box(48, F + 5, vz0, bx1 + 1, F + 6, vz0 + 1, M.bamboo);
    c.box(bx0 - 1, F, vz0, bx0, F + 10, bz0, M.bamboo); c.box(bx1, F, vz0, bx1 + 1, F + 10, bz0, M.bamboo);       // side rails
    c.box(bx0 - 1, F + 9, vz0, bx0, F + 10, bz0, M.bamboo);
    const steps = stilts ? 4 : 1;
    for (let i = 1; i <= steps; i++) c.box(34, 0, vz0 - 2 * i, 44, Math.max(2, F - 4 * i + (stilts ? 0 : 2)), vz0 - 2 * i + 2, M.bamboo);
    // ---- yard props ----
    const jar = (cx, cz) => {
      const prof = [2.4, 3.2, 3.8, 4, 4, 3.8, 3.2, 2.6, 2.8];
      prof.forEach((rr, i) => c.cylY(cx, cz, rr, i, i + 1, M.rooftile, i < 2 ? 0 : Math.max(0, rr - 1.4)));
      c.cylY(cx, cz, 3.1, 9, 10, M.wood, 0);
    };
    jar(64, 8); if (r.chance(0.7)) jar(71, 12);
    for (let i = 0; i < 3; i++) c.box(3 + i * 0, i * 3, 6, 3 + 11, i * 3 + 3, 12 - i, i % 2 ? M.wood : M.wood_dark);   // woodpile
    c.cylY(26, 8, 3.4, 0, 6, M.bamboo, 2.2); c.cylY(26, 8, 3.4, 0, 1, M.bamboo, 0);                                     // basket
    for (let i = 0; i < 4; i++) { c.box(2 + i * 2, 0, 24 + i, 3 + i * 2, 44 - i * 2, 25 + i, M.bamboo); }               // leaning bamboo poles
    c.ground(26, 0, 52, 14, M.gravel);
    return c;
  },
};
