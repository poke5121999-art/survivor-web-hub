// Procedural 3D icons. Each icon is a list of flat parts [commands, colour, layer, holes?] drawn in a 100 x 100
// box with y DOWN. Every part is extruded and bevelled (layers stack toward the viewer), all parts of an icon are
// merged into one vertex-coloured mesh, and the thick dark outline is a canvas silhouette quad behind it.
// So an icon costs two draw calls and shares its geometry and texture between every instance.

const K = 0x1a1420;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// command builders: ['M',x,y] ['L',x,y] ['Q',cx,cy,x,y] ['C',..6] ['E',cx,cy,rx,ry,rotDeg] ['Z']
const E = (cx, cy, rx, ry = rx, rot = 0) => [['E', cx, cy, rx, ry, rot]];
const PO = (...f) => { const o = []; for (let i = 0; i < f.length; i += 2) o.push([i ? 'L' : 'M', f[i], f[i + 1]]); o.push(['Z']); return o; };
function RP(r, ...f) {
  const p = []; for (let i = 0; i < f.length; i += 2) p.push([f[i], f[i + 1]]);
  const n = p.length, out = [];
  for (let i = 0; i < n; i++) {
    const c = p[i], a = p[(i + n - 1) % n], b = p[(i + 1) % n], da = dist(c, a), db = dist(c, b), ra = Math.min(r, da / 2.2), rb = Math.min(r, db / 2.2);
    out.push([i ? 'L' : 'M', c[0] + (a[0] - c[0]) * ra / da, c[1] + (a[1] - c[1]) * ra / da], ['Q', c[0], c[1], c[0] + (b[0] - c[0]) * rb / db, c[1] + (b[1] - c[1]) * rb / db]);
  }
  out.push(['Z']); return out;
}
const RR = (x, y, w, h, r = 0) => RP(r || 0.01, x, y, x + w, y, x + w, y + h, x, y + h);
function SP(d) {
  const t = d.match(/[MLHVCQZ]|-?\d*\.?\d+/g), out = []; let i = 0, cx = 0, cy = 0;
  const num = () => +t[i++];
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M' || c === 'L') { cx = num(); cy = num(); out.push([c, cx, cy]); }
    else if (c === 'H') { cx = num(); out.push(['L', cx, cy]); }
    else if (c === 'V') { cy = num(); out.push(['L', cx, cy]); }
    else if (c === 'C') { const a = [num(), num(), num(), num(), num(), num()]; cx = a[4]; cy = a[5]; out.push(['C', ...a]); }
    else if (c === 'Q') { const a = [num(), num(), num(), num()]; cx = a[2]; cy = a[3]; out.push(['Q', ...a]); }
    else if (c === 'Z') out.push(['Z']);
  }
  return out;
}
const ST = (cx, cy, R, r, n, rot = -90) => { const f = []; for (let i = 0; i < n * 2; i++) { const a = (rot + (180 / n) * i) * Math.PI / 180, q = i % 2 ? r : R; f.push(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } return f; };
function GEAR(cx, cy, Ro, Ri, n) {
  const f = [], s = Math.PI * 2 / n;
  for (let i = 0; i < n; i++) for (const [da, q] of [[-0.44, Ri], [-0.25, Ro], [0.25, Ro], [0.44, Ri]]) f.push(cx + Math.cos(i * s + da * s) * q, cy + Math.sin(i * s + da * s) * q);
  return f;
}
// rotate (and scale) a command list about a point
function rot(cmds, deg, cx = 50, cy = 50, sc = 1) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const m = (x, y) => [cx + ((x - cx) * c - (y - cy) * s) * sc, cy + ((x - cx) * s + (y - cy) * c) * sc];
  return cmds.map((k) => {
    if (k[0] === 'E') { const [x, y] = m(k[1], k[2]); return ['E', x, y, k[3] * sc, k[4] * sc, (k[5] || 0) + deg]; }
    const o = [k[0]]; for (let i = 1; i < k.length; i += 2) o.push(...m(k[i], k[i + 1])); return o;
  });
}
const P = (cmds, color, layer = 0, holes) => [cmds, color, layer, holes];
const heartD = 'M50 90 C20 66 6 48 6 32 C6 16 18 8 30 8 C40 8 47 14 50 22 C53 14 60 8 70 8 C82 8 94 16 94 32 C94 48 80 66 50 90 Z';
const flameOut = 'M50 3 C58 24 84 38 84 62 C84 82 69 97 50 97 C31 97 16 82 16 62 C16 46 27 38 33 26 C36 38 42 43 45 43 C44 30 46 16 50 3 Z';
const flameIn = 'M50 42 C57 56 70 62 70 77 C70 89 61 95 50 95 C39 95 30 89 30 77 C30 66 39 60 43 51 C46 57 48 57 50 42 Z';
const dropD = 'M50 6 C60 28 78 44 78 64 C78 82 66 94 50 94 C34 94 22 82 22 64 C22 44 40 28 50 6 Z';

const W = 0xf4f1ff;
export const ICONS = {
  gold: () => [P(E(50, 50, 44), 0xc97a00, 0), P(E(50, 50, 37), 0xffd21f, 1), P(E(50, 50, 29), 0xf0a000, 2, [E(50, 50, 24)]), P(RP(2, ...ST(50, 52, 17, 8, 5)), 0xf0a000, 2), P(E(35, 33, 9, 4.5, -35), 0xfff4b0, 3)],
  gem: () => [P(PO(50, 94, 6, 38, 26, 8, 74, 8, 94, 38), 0x1596e0, 0), P(PO(26, 8, 74, 8, 64, 38, 36, 38), 0x9af3ff, 1), P(PO(6, 38, 26, 8, 36, 38, 50, 94), 0x37c8ff, 1), P(PO(94, 38, 74, 8, 64, 38, 50, 94), 0x1b7fd1, 1), P(PO(36, 38, 64, 38, 50, 94), 0x2fb4f5, 1), P(PO(24, 22, 33, 14, 36, 24), 0xffffff, 2)],
  shard: () => [P(PO(50, 4, 80, 30, 70, 80, 50, 96, 30, 80, 20, 30), 0x7d3ce0, 0), P(PO(50, 4, 20, 30, 30, 80, 50, 96), 0xc58bff, 1), P(PO(50, 4, 80, 30, 70, 80, 50, 96), 0x9b55f2, 1), P(PO(50, 4, 50, 96, 38, 40), 0xe2c4ff, 2), P(PO(34, 30, 40, 24, 42, 44), 0xffffff, 2)],
  flame: (c) => [P(SP(flameOut), c ?? 0xff5a1a, 0), P(SP(flameIn), 0xffb52e, 1), P(SP('M50 62 C55 70 62 74 62 83 C62 90 57 94 50 94 C43 94 38 90 38 83 C38 76 44 72 46 66 C47 69 49 69 50 62 Z'), 0xfff3a0, 2)],
  eye: () => [P(SP('M4 50 C22 22 78 22 96 50 C78 78 22 78 4 50 Z'), W, 0), P(E(50, 50, 22), 0x2f7bff, 1), P(E(50, 50, 11), 0x141a3a, 2), P(E(57, 43, 5), 0xffffff, 3)],
  pause: (c) => [P(RR(22, 14, 20, 72, 7), c ?? W, 0), P(RR(58, 14, 20, 72, 7), c ?? W, 0)],
  play: (c) => [P(RP(8, 24, 10, 90, 50, 24, 90), c ?? W, 0)],
  speed: (c) => [P(RP(5, 6, 18, 46, 50, 6, 82), c ?? W, 0), P(RP(5, 46, 18, 90, 50, 46, 82), c ?? W, 0)],
  left: (c) => [P(RP(6, 68, 8, 26, 50, 68, 92, 82, 78, 54, 50, 82, 22), c ?? W, 0)],
  right: (c) => [P(RP(6, 32, 8, 74, 50, 32, 92, 18, 78, 46, 50, 18, 22), c ?? W, 0)],
  back: (c) => [P(RP(6, 90, 34, 42, 34, 42, 14, 6, 50, 42, 86, 42, 66, 90, 66), c ?? W, 0)],
  close: (c) => [P(RP(4, 50, 36, 76, 8, 92, 24, 64, 50, 92, 76, 76, 92, 50, 64, 24, 92, 8, 76, 36, 50, 8, 24, 24, 8), c ?? 0xff5a5a, 0)],
  check: (c) => [P(RP(4, 6, 54, 22, 38, 40, 56, 78, 16, 94, 32, 40, 88), c ?? 0x3ddc5a, 0)],
  lock: () => [P(SP('M24 50 V32 C24 6 76 6 76 32 V50 Z'), 0xcfd8e6, 0, [SP('M39 50 V33 C39 23 61 23 61 33 V50 Z')]), P(RR(14, 42, 72, 50, 12), 0xffb62e, 1), P(RR(14, 42, 72, 14, 8), 0xffd45e, 2), P(E(50, 66, 7), 0x6b4300, 3), P(RR(47, 68, 6, 14, 2), 0x6b4300, 3)],
  up: (c) => [P(RP(5, 50, 4, 90, 46, 66, 46, 66, 94, 34, 94, 34, 46, 10, 46), c ?? 0x35e05a, 0), P(RP(3, 50, 18, 72, 40, 58, 40, 58, 84, 42, 84, 42, 40, 28, 40), 0x8cfba0, 1)],
  star: (c) => [P(RP(7, ...ST(50, 54, 47, 21, 5)), c ?? 0xffc91f, 0), P(RP(5, ...ST(50, 54, 31, 14, 5)), 0xffe96a, 1), P(E(40, 32, 5, 3, -30), 0xffffff, 2)],
  skull: () => [P(E(50, 44, 36, 34), W, 0), P(RR(30, 58, 40, 32, 9), W, 0), P(E(35, 46, 10, 12), 0x2b2340, 1), P(E(65, 46, 10, 12), 0x2b2340, 1), P(PO(50, 56, 44, 68, 56, 68), 0x2b2340, 1), P(RR(37, 78, 6, 12, 2), 0xb5adcc, 1), P(RR(47, 78, 6, 12, 2), 0xb5adcc, 1), P(RR(57, 78, 6, 12, 2), 0xb5adcc, 1)],
  sword: () => {
    const t = (c) => rot(c, 40, 50, 52, 0.95);
    return [P(t(RP(4, 50, 2, 62, 16, 62, 66, 38, 66, 38, 16)), 0xdfe8f5, 0), P(t(RR(46, 14, 8, 48, 3)), 0x9bb0d0, 1), P(t(RR(24, 64, 52, 12, 5)), 0xffc21f, 1), P(t(RR(43, 74, 14, 18, 5)), 0x9a5424, 1), P(t(E(50, 94, 7)), 0xffc21f, 1)];
  },
  heart: (c) => [P(SP(heartD), c ?? 0xff3b52, 0), P(E(29, 28, 10, 6, -35), 0xffb0ba, 1)],
  shield: (c) => [P(SP('M50 4 L90 16 V48 C90 74 72 88 50 97 C28 88 10 74 10 48 V16 Z'), c ?? 0x3b82ff, 0), P(SP('M50 15 L79 24 V48 C79 66 66 77 50 85 C34 77 21 66 21 48 V24 Z'), 0x7db8ff, 1), P(SP('M50 15 L79 24 V48 C79 66 66 77 50 85 Z'), 0x4f97ff, 1), P(RP(2, ...ST(50, 50, 15, 7, 5)), 0xffffff, 2)],
  bolt: (c) => [P(RP(3, 62, 2, 18, 56, 46, 56, 34, 98, 84, 38, 54, 38, 74, 2), c ?? 0xffd81f, 0), P(RP(2, 58, 14, 34, 50, 52, 50, 46, 76, 70, 42, 50, 42), 0xfff29a, 1)],
  chest: () => [P(RR(10, 42, 80, 48, 8), 0xa95a22, 0), P(SP('M10 46 V40 C10 20 28 10 50 10 C72 10 90 20 90 40 V46 Z'), 0xe39040, 1), P(RR(10, 66, 80, 6, 2), 0x7e3f14, 1), P(RR(41, 10, 18, 80, 3), 0xffcf3f, 2), P(RR(43, 42, 14, 20, 4), 0xfff0a0, 3), P(E(50, 52, 3), 0x7e5200, 4)],
  capsule: () => [P(SP('M8 50 C8 26 27 8 50 8 C73 8 92 26 92 50 Z'), 0xff4b5c, 0), P(SP('M8 50 H92 C92 74 73 92 50 92 C27 92 8 74 8 50 Z'), W, 0), P(RR(6, 45, 88, 10, 4), 0x3a2e58, 1), P(E(50, 50, 11), W, 2), P(E(50, 50, 5), 0xb5adcc, 3), P(E(30, 28, 10, 5, -40), 0xffc0c8, 2)],
  bag: () => [P(SP('M30 36 V26 C30 4 70 4 70 26 V36 Z'), 0x7a4220, 0, [SP('M40 36 V27 C40 18 60 18 60 27 V36 Z')]), P(RR(12, 32, 76, 60, 13), 0xe0883a, 1), P(SP('M12 46 C12 34 24 32 50 32 C76 32 88 34 88 46 V58 C88 58 72 68 50 68 C28 68 12 58 12 58 Z'), 0xffb35a, 2), P(E(50, 66, 9), 0xffd45e, 3), P(E(50, 66, 4), 0x7e5200, 4)],
  gear: () => [P(RP(2.5, ...GEAR(50, 50, 46, 34, 8)), 0x9fb2d8, 0, [E(50, 50, 14)]), P(E(50, 50, 28), 0xc5d3f0, 1, [E(50, 50, 14)]), P(E(36, 34, 6, 3, -40), 0xffffff, 2)],
  wave: () => [P(SP('M4 48 C20 24 32 24 48 46 C62 66 76 64 96 38 V62 C76 90 62 90 48 70 C32 48 20 48 4 72 Z'), 0x23a8e8, 0), P(SP('M4 38 C20 14 32 14 48 36 C62 56 76 54 96 28 V46 C76 74 62 74 48 54 C32 34 20 34 4 56 Z'), 0x6fe0ff, 1)],
  weapon: () => [P(rot(RP(3, 8, 36, 70, 36, 70, 52, 8, 52), -10, 50, 50), 0x8793ad, 0), P(rot(RP(4, 44, 36, 80, 36, 80, 58, 44, 58), -10, 50, 50), 0xbfcbe2, 1), P(rot(RP(4, 50, 54, 68, 54, 62, 92, 46, 92), -10, 50, 50), 0xa8602a, 1), P(rot(RR(8, 30, 14, 8, 2), -10, 50, 50), 0xffd21f, 2)],
  necklace: () => [P(E(50, 42, 40), 0xffc21f, 0, [E(50, 42, 31)]), P(RP(5, 50, 98, 32, 76, 40, 62, 60, 62, 68, 76), 0x2fc3ff, 1), P(RP(3, 50, 90, 40, 76, 44, 68, 56, 68, 60, 76), 0x9af3ff, 2), P(E(50, 6, 7), 0xffe27a, 1)],
  gloves: () => [P(E(28, 32, 10), 0xff9e2f, 0), P(E(44, 27, 10), 0xff9e2f, 0), P(E(60, 27, 10), 0xff9e2f, 0), P(E(75, 33, 10), 0xff9e2f, 0), P(E(18, 62, 10, 15, 20), 0xff9e2f, 0), P(RR(22, 32, 60, 52, 18), 0xffb44a, 1), P(RR(26, 78, 52, 16, 6), 0x3b4aa8, 2), P(RR(36, 36, 4, 22, 2), 0xe07f12, 2), P(RR(50, 36, 4, 22, 2), 0xe07f12, 2), P(RR(64, 36, 4, 22, 2), 0xe07f12, 2)],
  armor: () => [P(SP('M20 10 L38 4 C42 16 58 16 62 4 L80 10 L96 34 L78 44 V92 H22 V44 L4 34 Z'), 0x8ea3cc, 0), P(SP('M30 22 C40 28 60 28 70 22 L70 84 H30 Z'), 0xb9c9ea, 1), P(RP(2, ...ST(50, 56, 15, 7, 5)), 0xffc21f, 2), P(RR(22, 80, 56, 8, 3), 0x5d7099, 1)],
  belt: () => [P(RR(2, 34, 96, 32, 9), 0x9b5a2a, 0), P(RR(2, 34, 96, 9, 5), 0xc07a3e, 1), P(RR(34, 24, 32, 52, 9), 0xffc21f, 1, [RR(43, 36, 14, 28, 3)]), P(RR(8, 54, 14, 5, 2), 0x6e3d18, 1), P(RR(78, 54, 14, 5, 2), 0x6e3d18, 1)],
  boots: () => [P(RP(5, 30, 6, 66, 6, 66, 50, 96, 64, 96, 92, 10, 92, 10, 76, 30, 52), 0xb26ee8, 0), P(RR(26, 6, 44, 16, 6), 0xe3c2ff, 1), P(RR(6, 78, 92, 14, 6), 0x3a2e58, 1), P(RP(3, 40, 30, 62, 30, 62, 50, 40, 50), 0xcd95f6, 1)],
  atk: () => ICONS.sword(), hp: () => ICONS.heart(), dr: () => ICONS.shield(0x35c77a), burn: () => ICONS.flame(0xff3b1a),
  aspd: () => [P(RR(40, 4, 20, 12, 4), 0x8793ad, 0), P(E(50, 56, 38), W, 0), P(E(50, 56, 38), 0x3aa0ff, 1, [E(50, 56, 29)]), P(rot(RR(46, 30, 8, 30, 4), 40, 50, 56), 0xff6a2a, 2), P(E(50, 56, 6), 0x2b2340, 3), P(rot(RR(80, 14, 12, 8, 3), 40, 50, 56), 0x8793ad, 0)],
  crit: () => [P(RP(3, ...ST(50, 50, 48, 26, 8)), 0xff3b3b, 0), P(RP(3, ...ST(50, 50, 36, 20, 8, -67.5)), 0xff8a3a, 1), P(RP(2, ...ST(50, 50, 20, 9, 4)), 0xfff29a, 2)],
  cdr: () => [P(RR(14, 4, 72, 12, 5), 0xc9902e, 1), P(RR(14, 84, 72, 12, 5), 0xc9902e, 1), P(PO(22, 16, 78, 16, 56, 50, 78, 84, 22, 84, 44, 50), 0xaee6ff, 0), P(PO(30, 20, 70, 20, 54, 42, 46, 42), 0xffc933, 1), P(PO(34, 82, 66, 82, 50, 58), 0xffc933, 1), P(PO(46, 50, 54, 50, 52, 62, 48, 62), 0xffc933, 1)],
  ult: () => [P(E(50, 50, 44), 0x7f33e8, 0), P(E(50, 50, 36), 0xb15cff, 1), P(RP(2, 58, 12, 26, 54, 46, 54, 38, 90, 74, 42, 54, 42, 66, 12), 0xffd81f, 2), P(E(32, 30, 9, 5, -40), 0xe6c8ff, 2)],
  lifesteal: () => [P(SP(heartD), 0xd8203a, 0), P(E(29, 28, 10, 6, -35), 0xff8c9a, 1), P(rot(SP(dropD), 0, 50, 50, 0.5).map((k) => k.map((v, i) => (i && i % 2 === 0 ? v + 14 : v))), W, 2)],
  regen: () => [P(SP(heartD), 0x2fcf6a, 0), P(E(29, 28, 10, 6, -35), 0xa8f5c4, 1), P(RP(2, 40, 28, 60, 28, 60, 42, 74, 42, 74, 60, 60, 60, 60, 74, 40, 74, 40, 60, 26, 60, 26, 42, 40, 42), W, 2)],
  poison: () => [P(SP(dropD), 0x5fd02a, 0), P(SP('M50 14 C58 32 70 46 70 62 C70 76 62 84 50 84 Z'), 0x8cf04a, 1), P(E(40, 66, 7), 0xe6ffc4, 2), P(E(58, 52, 4), 0xe6ffc4, 2), P(E(36, 46, 5, 3, -50), 0xffffff, 2)],
  slow: () => [P(RR(45, 4, 10, 92, 4), 0x9fe8ff, 0), P(rot(RR(45, 4, 10, 92, 4), 60), 0x9fe8ff, 0), P(rot(RR(45, 4, 10, 92, 4), 120), 0x9fe8ff, 0), P(E(50, 50, 14), 0xdaf6ff, 1), P(E(50, 50, 6), 0x3aa0ff, 2)],
  aoe: () => [P(E(50, 50, 46), 0xff7a1a, 0, [E(50, 50, 33)]), P(E(50, 50, 24), 0xffd23f, 1, [E(50, 50, 12)]), P(E(50, 50, 6), 0xff7a1a, 2)],
  chain: () => [P(E(34, 66, 30, 15, -45), 0xaebbd6, 0, [E(34, 66, 21, 6, -45)]), P(E(66, 34, 30, 15, -45), 0xdfe8f5, 1, [E(66, 34, 21, 6, -45)])],
  boom: () => [P(RP(2, ...ST(50, 50, 48, 28, 10)), 0xff5a1a, 0), P(RP(2, ...ST(50, 50, 36, 20, 10, -72)), 0xffb52e, 1), P(E(50, 50, 14), 0xfff3a0, 2)],
  exec: () => [P(rot(RR(45, 4, 10, 92, 4), 25), 0x9a5424, 0), P(rot(SP('M56 12 C90 4 100 32 92 58 C80 48 68 46 56 54 Z'), 25), 0xdfe8f5, 1), P(rot(SP('M60 18 C82 14 90 30 86 44 C78 38 70 36 60 40 Z'), 25), 0x9bb0d0, 2)],
  s1: () => [P(RP(4, ...ST(50, 50, 48, 12, 4)), 0x3ad6ff, 0), P(E(50, 50, 10), W, 1)],
  s2: () => [P(RP(3, ...ST(34, 38, 34, 9, 4)), 0xff8a3a, 0), P(RP(3, ...ST(66, 64, 30, 8, 4)), 0xffd23f, 1), P(E(34, 38, 7), W, 2)],
};
export const ICON_NAMES = Object.keys(ICONS);
const ANIM = new Set(['flame', 'burn']);
const FALLBACK = 'star';

function toPath(THREE, cmds, Path) {
  const p = new Path(), X = (x) => (x - 50) / 100, Y = (y) => (50 - y) / 100;
  for (const k of cmds) {
    if (k[0] === 'M') p.moveTo(X(k[1]), Y(k[2])); else if (k[0] === 'L') p.lineTo(X(k[1]), Y(k[2]));
    else if (k[0] === 'Q') p.quadraticCurveTo(X(k[1]), Y(k[2]), X(k[3]), Y(k[4]));
    else if (k[0] === 'C') p.bezierCurveTo(X(k[1]), Y(k[2]), X(k[3]), Y(k[4]), X(k[5]), Y(k[6]));
    else if (k[0] === 'E') p.absellipse(X(k[1]), Y(k[2]), k[3] / 100, k[4] / 100, 0, Math.PI * 2, false, -(k[5] || 0) * Math.PI / 180);
  }
  return p;
}
function canvasPath(g, cmds) {
  g.beginPath();
  for (const k of cmds) {
    if (k[0] === 'M') g.moveTo(k[1], k[2]); else if (k[0] === 'L') g.lineTo(k[1], k[2]);
    else if (k[0] === 'Q') g.quadraticCurveTo(k[1], k[2], k[3], k[4]); else if (k[0] === 'C') g.bezierCurveTo(k[1], k[2], k[3], k[4], k[5], k[6]);
    else if (k[0] === 'E') { g.moveTo(k[1] + k[3], k[2]); g.ellipse(k[1], k[2], k[3], k[4], (k[5] || 0) * Math.PI / 180, 0, Math.PI * 2); }
    else if (k[0] === 'Z') g.closePath();
  }
}

export function makeIcons(THREE, geo) {
  const built = new Map(), warned = new Set();
  const vcMat = geo.std(0xffffff, { vc: true, rough: 0.34 });
  const plane = new THREE.PlaneGeometry(1, 1);
  const SC = 2.2, MARGIN = 14, OW = 5, CS = Math.ceil((100 + MARGIN * 2) * SC);

  function build(name, color) {
    const parts = ICONS[name](color);
    const list = [];
    for (const [cmds, col, layer, holes] of parts) {
      const sh = toPath(THREE, cmds, THREE.Shape);
      for (const h of holes || []) { const hp = toPath(THREE, h, THREE.Path); sh.holes.push(hp); }
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.018, bevelOffset: -0.018, bevelSegments: 2, curveSegments: 10, steps: 1 });
      g.translate(0, 0, layer * 0.052);
      list.push({ g, color: col });
    }
    const geom = geo.merge(list); list.forEach((l) => l.g.dispose());
    const c = document.createElement('canvas'); c.width = c.height = CS; const g = c.getContext('2d');
    g.setTransform(SC, 0, 0, SC, MARGIN * SC, MARGIN * SC); g.lineJoin = 'round'; g.lineCap = 'round';
    const dark = '#' + K.toString(16).padStart(6, '0');
    for (const [cmds, , , holes] of parts) {
      g.globalCompositeOperation = 'source-over'; g.fillStyle = dark; g.strokeStyle = dark; g.lineWidth = OW * 2;
      canvasPath(g, cmds); g.stroke(); g.fill();
      for (const h of holes || []) {
        g.globalCompositeOperation = 'destination-out'; canvasPath(g, h); g.fill();
        g.globalCompositeOperation = 'source-over'; g.lineWidth = OW * 2; canvasPath(g, h); g.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const olMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    return { geom, olMat };
  }

  // unit-size icon centred on the origin; `size` is applied by the caller through scale
  function make(name, color) {
    if (!ICONS[name]) { if (!warned.has(name)) { warned.add(name); console.warn('[ui] icon not found: ' + name); } name = FALLBACK; }
    const key = name + '|' + (color ?? ''); let b = built.get(key); if (!b) { b = build(name, color); built.set(key, b); }
    const g = new THREE.Group(), body = new THREE.Mesh(b.geom, vcMat), ol = new THREE.Mesh(plane, b.olMat);
    ol.scale.set(1 + MARGIN * 2 / 100, 1 + MARGIN * 2 / 100, 1); ol.position.z = -0.03;
    g.add(ol, body); g.userData.name = name;
    if (ANIM.has(name)) {
      const full = 1 + MARGIN * 2 / 100;
      g.userData.anim = (t) => {
        const sx = 1 + Math.sin(t * 9) * 0.03, sy = 1 + Math.sin(t * 7.3) * 0.045 + Math.sin(t * 13) * 0.02, lift = (sy - 1) * 0.47;
        body.scale.set(sx, sy, 1); body.position.y = lift; ol.scale.set(full * sx, full * sy, 1); ol.position.y = lift;
      };
    }
    return g;
  }
  return { make, names: ICON_NAMES, has: (n) => !!ICONS[n] };
}
