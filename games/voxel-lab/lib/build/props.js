// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
// Small props: car, tree, lamp-post, fence, fuel barrels. default export = ARRAY of generators.
import { Canvas, M, rng } from './kit.js';
import { drum } from './gas-station.js';

const BODY = [M.paint_red, M.paint_white, M.paint_yellow, M.sheet_red, M.sheet_blue, M.sheet_green, M.sheet_zinc];

const car = {
  id: 'car',
  name: 'Xe hơi',
  variants: 3,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 3) + 3) % 3;
    const L = v === 2 ? 46 : 42, W = 18;
    const c = new Canvas(L, 17, W);
    const body = r.pick(BODY);
    // chassis + lower body shell
    c.box(2, 3, 2, L - 2, 4, W - 2, M.steel);
    c.box(1, 4, 1, L - 1, 9, W - 1, body);
    c.box(2, 5, 2, L - 2, 9, W - 2, 0);                          // hollow interior
    c.box(3, 4, 3, L - 3, 5, W - 3, M.iron);
    // wheel arches + wheels (rubber tyres, steel hub)
    for (const wx of [8, L - 9]) for (const wz of [0, W - 3]) {
      for (let y = 0; y < 8; y++) for (let x = wx - 4; x < wx + 4; x++) {
        const d = Math.hypot(x + 0.5 - wx, y + 0.5 - 4);
        if (d <= 4) c.box(x, y, wz, x + 1, y + 1, wz + 3, d < 1.8 ? M.steel : M.rubber);
      }
      c.box(wx - 5, 8, wz > 0 ? W - 3 : 0, wx + 5, 9, wz > 0 ? W : 3, body);          // fender cap over the wheel
    }
    // cabin
    const cx0 = v === 1 ? 6 : 12, cx1 = v === 1 ? L - 4 : (v === 2 ? 22 : L - 12), top = v === 1 ? 17 : 15;
    // sedan (0) / van-wagon (1) / pickup (2)
    c.box(cx0, 9, 2, cx1, top, W - 2, body);
    c.box(cx0 + 1, 9, 3, cx1 - 1, top - 1, W - 3, 0);
    // glass: front/back screens and side windows
    c.box(cx0 - 1, 10, 3, cx0, top - 1, W - 3, M.glass_tint); c.box(cx1, 10, 3, cx1 + 1, top - 1, W - 3, M.glass_tint);
    c.box(cx0 + 2, 11, 2, cx1 - 2, top - 2, 3, M.glass); c.box(cx0 + 2, 11, W - 3, cx1 - 2, top - 2, W - 2, M.glass);
    for (const zz of [2, W - 3]) c.box((cx0 + cx1) / 2 | 0, 11, zz, ((cx0 + cx1) / 2 | 0) + 1, top - 2, zz + 1, body);   // B pillar
    // sloped screens: step the roof edge
    c.box(cx0 - 2, 9, 3, cx0 - 1, 11, W - 3, M.glass_tint); c.box(cx1 + 1, 9, 3, cx1 + 2, 11, W - 3, M.glass_tint);
    // seats
    c.box(cx0 + 3, 5, 4, cx0 + 6, 10, W - 4, M.cloth_brown); c.box(cx0 + 8, 5, 4, cx0 + 11, 9, W - 4, M.cloth_brown);
    // hood + trunk
    c.box(cx1 + 1, 8, 2, L - 2, 9, W - 2, body);
    if (v === 2) { c.box(2, 8, 2, cx0 - 1, 9, W - 2, body); c.box(2, 9, 2, 3, 12, W - 2, body); c.box(2, 9, 2, cx0 - 1, 12, 3, body); c.box(2, 9, W - 3, cx0 - 1, 12, W - 2, body); c.box(cx0 - 2, 9, 2, cx0 - 1, 12, W - 2, body); c.box(2, 5, 3, cx0 - 2, 8, W - 3, 0); }
    else if (v === 0) c.box(2, 8, 2, cx0 - 1, 9, W - 2, body); else c.box(2, 8, 2, 3, 9, W - 2, body);
    // lamps, grille, bumpers, plate
    for (const zz of [2, W - 5]) { c.box(L - 1, 6, zz, L, 8, zz + 3, M.lamp); c.box(0, 6, zz, 1, 8, zz + 3, M.paint_red); }
    c.box(L - 1, 5, 6, L, 7, W - 6, M.iron);
    c.box(L - 1, 3, 1, L, 5, W - 1, M.steel); c.box(0, 3, 1, 1, 5, W - 1, M.steel);
    c.box(0, 5, 7, 1, 7, W - 7, M.paint_white);
    // roof rack for the van
    if (v === 1) { c.box(8, top, 3, L - 8, top + 1, 4, M.iron); c.box(8, top, W - 4, L - 8, top + 1, W - 3, M.iron); for (let x = 10; x < L - 8; x += 8) c.box(x, top, 3, x + 1, top + 1, W - 3, M.iron); }
    return c;
  },
};

const tree = {
  id: 'tree',
  name: 'Cây',
  variants: 3,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 3) + 3) % 3;
    if (v === 0) {                                   // broadleaf tree
      const S = 52, H = r.int(34, 44), cx = 26, cz = 26;
      const c = new Canvas(S, H + 34, S);
      for (let y = 0; y < H; y++) { const w = y < 6 ? 6 : (y < H - 8 ? 4 : 3); c.box(cx - w / 2, y, cz - w / 2, cx + w / 2, y + 1, cz + w / 2, M.trunk); }
      c.box(cx - 4, 0, cz - 4, cx + 4, 2, cz + 4, M.trunk); c.box(cx - 3, 2, cz - 3, cx + 3, 4, cz + 3, M.trunk);
      // branches
      const bs = [[-10, 0], [10, 2], [2, -10], [-3, 10]];
      for (const [bx, bz] of bs) c.line(cx, H - 10, cz, cx + bx, H - 2, cz + bz, M.trunk, 2);
      const blobs = [[0, H + 6, 0, 16], [-11, H, -3, 11], [11, H + 1, 3, 11], [3, H + 2, -11, 10], [-2, H + 3, 11, 10], [0, H + 16, 0, 9]];
      for (const [bx, by, bz, br] of blobs) c.sphere(cx + bx, by, cz + bz, br, M.leaf, br * 0.8, br);
      for (let i = 0; i < 40; i++) { const x = r.int(8, 44), y = r.int(H - 4, H + 22), z = r.int(8, 44); if (c.get(x, y, z) === M.leaf) c.set(x, y, z, 0); }   // leaf holes
      return c;
    }
    if (v === 1) {                                   // palm
      const S = 56, H = r.int(46, 56), cx = 28, cz = 28;
      const c = new Canvas(S, H + 24, S);
      let x = cx, tx = 0;
      for (let y = 0; y < H; y++) { tx = Math.round(Math.sin(y / H * 1.3) * 5); const w = y < 5 ? 4 : 3; c.box(cx + tx - Math.floor(w / 2), y, cz - Math.floor(w / 2), cx + tx + Math.ceil(w / 2), y + 1, cz + Math.ceil(w / 2), y % 6 === 0 ? M.wood_dark : M.trunk); }
      const hx = cx + tx, hz = cz;
      c.box(hx - 2, H, hz - 2, hx + 3, H + 3, hz + 3, M.trunk);
      c.box(hx - 1, H + 3, hz - 1, hx + 2, H + 4, hz + 2, M.leaf);
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = i * 2 * Math.PI / n + r.range(-0.2, 0.2), len = r.range(17, 22);
        const mx = hx + Math.cos(a) * len * 0.55, mz = hz + Math.sin(a) * len * 0.55, my = H + 11;
        const ex = hx + Math.cos(a) * len, ez = hz + Math.sin(a) * len, ey = H + 3;
        c.line(hx, H + 3, hz, mx, my, mz, M.leaf, 3); c.line(mx, my, mz, ex, ey, ez, M.leaf, 3);
        c.line(mx, my - 2, mz, ex, ey - 2, ez, M.leaf, 3);
      }
      for (let i = 0; i < 3; i++) c.sphere(hx - 2 + i * 2, H - 1, hz + (i % 2 ? 2 : -2), 1.5, M.wood_dark);   // coconuts
      return c;
    }
    const S = 50, H = r.int(18, 24), cx = 25, cz = 25;       // banana
    const c = new Canvas(S, H + 24, S);
    c.cylY(cx, cz, 3.2, 0, H, M.leaf, 1.4); c.cylY(cx, cz, 3.2, 0, 3, M.trunk); c.cylY(cx, cz, 1.6, 0, H, M.leaf);
    for (let y = 3; y < H; y += 5) c.cylY(cx, cz, 3.4, y, y + 1, M.trunk, 1.4);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = i * 2 * Math.PI / n + r.range(-0.3, 0.3), len = r.range(14, 20);
      const mx = cx + Math.cos(a) * len * 0.5, mz = cz + Math.sin(a) * len * 0.5, my = H + 10 - (i % 2) * 2;
      const ex = cx + Math.cos(a) * len, ez = cz + Math.sin(a) * len, ey = H - 2 - (i % 3);
      c.line(cx, H - 1, cz, mx, my, mz, M.leaf, 3); c.line(mx, my, mz, ex, ey, ez, M.leaf, 3);
      c.line(mx, my, mz, ex, ey, ez, M.leaf, 5);
    }
    c.box(cx - 1, H - 6, cz + 3, cx + 1, H - 1, cz + 5, M.paint_yellow);
    c.sphere(cx, H - 8, cz + 4, 2.5, M.paint_yellow, 2.5, 2.5, 2);
    return c;
  },
};

const lamp = {
  id: 'lamp-post',
  name: 'Cột đèn',
  variants: 3,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 3) + 3) % 3;
    const H = r.int(42, 50), c = new Canvas(v === 1 ? 24 : 14, H + 8, 14);
    const px = v === 1 ? 6 : 6, pz = 6;
    c.box(px - 3, 0, pz - 3, px + 5, 3, pz + 5, M.concrete);
    c.box(px - 2, 3, pz - 2, px + 4, 8, pz + 4, M.iron);                 // fluted base
    c.box(px - 1, 8, pz - 1, px + 3, 12, pz + 3, M.iron);
    c.box(px, 12, pz, px + 2, H, pz + 2, M.iron);
    c.box(px - 1, 20, pz - 1, px + 3, 21, pz + 3, M.iron);               // collar ring
    if (v === 0) {                                                       // classic lantern on top
      c.box(px - 2, H, pz - 2, px + 4, H + 1, pz + 4, M.iron);
      c.box(px - 1, H + 1, pz - 1, px + 3, H + 6, pz + 3, M.lamp);
      for (const [a, b] of [[-1, -1], [2, -1], [-1, 2], [2, 2]]) c.box(px + a, H + 1, pz + b, px + a + 1, H + 6, pz + b + 1, M.iron);
      c.box(px - 2, H + 6, pz - 2, px + 4, H + 7, pz + 4, M.iron); c.box(px, H + 7, pz, px + 2, H + 8, pz + 2, M.iron);
    } else if (v === 1) {                                                // street arm, sodium head
      c.box(px, H - 2, pz, px + 16, H, pz + 2, M.iron);
      c.line(px + 1, H - 12, pz + 1, px + 10, H - 2, pz + 1, M.iron, 2);
      c.box(px + 12, H - 3, pz - 1, px + 20, H - 2, pz + 3, M.iron); c.box(px + 13, H - 4, pz, px + 19, H - 3, pz + 2, M.lamp);
      c.box(px + 12, H - 2, pz - 1, px + 20, H, pz + 3, M.steel);
    } else {                                                             // twin-globe garden post
      c.box(px - 3, H - 2, pz, px + 5, H - 1, pz + 2, M.iron);
      c.box(px - 3, H - 8, pz, px - 2, H - 2, pz + 2, M.iron); c.box(px + 4, H - 8, pz, px + 5, H - 2, pz + 2, M.iron);
      c.sphere(px - 2.5, H - 9, pz + 1, 2.6, M.lamp); c.sphere(px + 4.5, H - 9, pz + 1, 2.6, M.lamp);
      c.box(px, H - 1, pz, px + 2, H + 4, pz + 2, M.iron); c.sphere(px + 1, H + 5, pz + 1, 2.5, M.lamp);
    }
    return c;
  },
};

const fence = {
  id: 'fence',
  name: 'Hàng rào',
  variants: 3,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 3) + 3) % 3;
    const L = 64, c = new Canvas(L, 26, 6);
    if (v === 0) {                                                       // wooden picket
      const pm = r.chance(0.5) ? M.plank : M.wood;
      for (let x = 0; x < L; x += 16) c.box(x, 0, 1, x + 3, 17, 4, M.wood_dark);
      c.box(L - 3, 0, 1, L, 17, 4, M.wood_dark);
      for (const y of [4, 11]) c.box(0, y, 2, L, y + 2, 3, M.wood_dark);
      for (let x = 3; x < L - 3; x += 4) {
        const h = 14 + ((x / 4 | 0) % 3 === 1 ? 1 : 0);
        c.box(x, 1, 3, x + 3, h, 4, pm); c.box(x + 1, h, 3, x + 2, h + 2, 4, pm);
      }
    } else if (v === 1) {                                                // wrought-iron on a brick plinth
      c.box(0, 0, 0, L, 6, 6, M.brick_dark); c.box(0, 6, 0, L, 7, 6, M.ashlar);
      for (let x = 0; x < L; x += 16) { c.box(x, 0, 0, x + 5, 20, 6, M.brick); c.box(x - 1, 20, -0 + 0, x + 6, 21, 6, M.ashlar); c.box(x + 1, 21, 1, x + 4, 24, 5, M.ashlar); }
      c.box(L - 5, 0, 0, L, 20, 6, M.brick); c.box(L - 6, 20, 0, L, 21, 6, M.ashlar); c.box(L - 4, 21, 1, L - 1, 24, 5, M.ashlar);
      c.box(0, 9, 2, L, 11, 4, M.iron); c.box(0, 20, 2, L, 21, 4, M.iron);
      for (let x = 5; x < L - 5; x++) if (x % 16 > 5 && x % 3 === 0) { c.box(x, 7, 2, x + 1, 20, 3, M.iron); c.box(x, 20, 2, x + 1, 23, 3, M.iron); }
    } else {                                                             // low brick wall with pillars and coping
      c.box(0, 0, 0, L, 14, 4, M.brick_buff);
      for (let y = 3; y < 14; y += 4) c.box(0, y, 0, L, y + 1, 4, M.mortar);
      c.box(0, 14, 0, L, 15, 5, M.ashlar);
      for (let x = 0; x < L; x += 21) { c.box(x, 0, 0, x + 6, 18, 6, M.brick); c.box(x - 1, 18, 0, x + 7, 19, 6, M.ashlar); c.box(x + 1, 19, 1, x + 5, 21, 5, M.ashlar); }
      c.box(L - 6, 0, 0, L, 18, 6, M.brick); c.box(L - 7, 18, 0, L, 19, 6, M.ashlar); c.box(L - 5, 19, 1, L - 1, 21, 5, M.ashlar);
      for (let i = 0; i < 40; i++) { const x = r.int(0, L - 1), y = r.int(0, 13); if (c.get(x, y, 0) === M.brick_buff) c.set(x, y, 0, M.brick); }
    }
    return c;
  },
};

const barrels = {
  id: 'barrels',
  name: 'Thùng phuy xăng',
  variants: 3,
  build(seed) {
    const r = rng(seed);
    const v = ((seed % 3) + 3) % 3;
    const c = new Canvas(38, 30, 26);
    const sh = r.pick([M.paint_red, M.paint_red, M.paint_yellow, M.paint_white]);
    if (v === 0) {                                                       // 3 on the ground
      for (let i = 0; i < 3; i++) drum(c, 6 + i * 6, 6, 0, sh);
    } else if (v === 1) {                                                // pyramid 3 + 1 + extra on a pallet
      c.box(0, 0, 0, 38, 2, 14, M.plank); for (let x = 1; x < 38; x += 8) c.box(x, 2, 0, x + 3, 3, 14, M.wood_dark);
      for (let i = 0; i < 4; i++) drum(c, 4 + i * 6, 5, 3, sh);
      for (let i = 0; i < 3; i++) drum(c, 7 + i * 6, 5, 12, i === 1 ? M.paint_white : sh);
      drum(c, 13, 5, 21, sh);
      drum(c, 29, 18, 0, sh);
    } else {                                                             // 5-6: two rows + stacked ones
      const n = r.int(5, 6);
      for (let i = 0; i < 3; i++) { drum(c, 6 + i * 6, 6, 0, sh); drum(c, 6 + i * 6, 12, 0, i % 2 ? M.paint_white : sh); }
      drum(c, 9, 9, 9, sh); if (n > 5) drum(c, 15, 9, 9, M.paint_yellow);
      drum(c, 28, 20, 0, sh); if (n > 4) drum(c, 28, 20, 9, sh);
    }
    return c;
  },
};

export default [car, tree, lamp, fence, barrels];
