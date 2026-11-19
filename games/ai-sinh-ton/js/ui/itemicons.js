// The 18 equipment icons. They are plain entries of the kit's ICONS table (same part format: [commands, colour, layer,
// holes], drawn in a 100 x 100 box with y down, extruded, bevelled, outlined by the kit), registered as 'it_<item id>'
// when this module loads. The kit's own path helpers are not exported, so the few builders used here are local.
import { ICONS } from './icons.js?v=20261119c';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const E = (cx, cy, rx, ry = rx, rot = 0) => [['E', cx, cy, rx, ry, rot]];
const PO = (...f) => { const o = []; for (let i = 0; i < f.length; i += 2) o.push([i ? 'L' : 'M', f[i], f[i + 1]]); o.push(['Z']); return o; };
// polygon with rounded corners
function RP(r, ...f) {
  const p = []; for (let i = 0; i < f.length; i += 2) p.push([f[i], f[i + 1]]);
  const n = p.length, out = [];
  for (let i = 0; i < n; i++) {
    const c = p[i], a = p[(i + n - 1) % n], b = p[(i + 1) % n], da = dist(c, a), db = dist(c, b), ra = Math.min(r, da / 2.2), rb = Math.min(r, db / 2.2);
    out.push([i ? 'L' : 'M', c[0] + (a[0] - c[0]) * ra / da, c[1] + (a[1] - c[1]) * ra / da], ['Q', c[0], c[1], c[0] + (b[0] - c[0]) * rb / db, c[1] + (b[1] - c[1]) * rb / db]);
  }
  out.push(['Z']); return out;
}
const RR = (x, y, w, h, r = 3) => RP(r, x, y, x + w, y, x + w, y + h, x, y + h);
function rot(cmds, deg, cx = 50, cy = 50) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const m = (x, y) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  return cmds.map((k) => {
    if (k[0] === 'E') { const [x, y] = m(k[1], k[2]); return ['E', x, y, k[3], k[4], (k[5] || 0) + deg]; }
    const o = [k[0]]; for (let i = 1; i < k.length; i += 2) o.push(...m(k[i], k[i + 1])); return o;
  });
}
const OCT = (cx, cy, r) => { const f = []; for (let i = 0; i < 8; i++) { const a = (22.5 + i * 45) * Math.PI / 180; f.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } return f; };
const P = (cmds, color, layer = 0, holes) => [cmds, color, layer, holes];
const ST = (cx, cy, R, r, n) => { const f = []; for (let i = 0; i < n * 2; i++) { const a = (-90 + (180 / n) * i) * Math.PI / 180, q = i % 2 ? r : R; f.push(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } return f; };

// a glove: four fingers, a thumb, the back of the hand, a cuff; `deco` adds parts on the back of the hand
const glove = (skin, back, cuff, tip, deco = []) => [
  P(RR(18, 14, 14, 44, 7), skin, 0), P(RR(34, 6, 14, 50, 7), skin, 0), P(RR(50, 8, 14, 48, 7), skin, 0), P(RR(66, 16, 13, 42, 6.5), skin, 0),
  P(E(86, 58, 7.5, 17, -32), skin, 0),
  P(RR(16, 40, 66, 42, 15), back, 1),
  P(RR(20, 76, 58, 20, 7), cuff, 2), P(RR(24, 82, 50, 5, 2), tip, 3),
  ...deco,
];
const spike = (x) => P(PO(x, 38, x + 8, 38, x + 4, 14), 0xe9f0fa, 3);
const ring = (cx, cy, rx, ry, col, layer = 0) => P(E(cx, cy, rx, ry), col, layer, [E(cx, cy, rx - 7, ry - 7)]);
const bolt = (c, layer = 3) => P(RP(2, 56, 44, 36, 70, 49, 70, 43, 94, 66, 62, 52, 62), c, layer);

const SHOE_BODY = 'M10 72 L12 32 Q12 22 24 22 L42 24 Q48 36 62 40 L88 52 Q96 58 96 72 Z';
const shoe = (d) => { const t = d.match(/-?\d*\.?\d+|[MLQZ]/g), o = []; let i = 0; while (i < t.length) { const c = t[i++]; if (c === 'Z') o.push(['Z']); else if (c === 'Q') { o.push(['Q', +t[i], +t[i + 1], +t[i + 2], +t[i + 3]]); i += 4; } else { o.push([c, +t[i], +t[i + 1]]); i += 2; } } return o; };

const DEFS = {
  // ---- weapons
  w_cua: () => [
    ring(24, 30, 17, 14, 0x2b2b3a, 0), P(RR(38, 42, 58, 20, 9), 0xaeb8cc, 0), P(PO(46, 42, 52, 42, 49, 34), 0x5b6680, 0), P(PO(60, 42, 66, 42, 63, 34), 0x5b6680, 0), P(PO(74, 42, 80, 42, 77, 34), 0x5b6680, 0), P(PO(88, 42, 94, 42, 91, 34), 0x5b6680, 0),
    P(PO(46, 62, 52, 62, 49, 70), 0x5b6680, 0), P(PO(60, 62, 66, 62, 63, 70), 0x5b6680, 0), P(PO(74, 62, 80, 62, 77, 70), 0x5b6680, 0), P(PO(88, 62, 94, 62, 91, 70), 0x5b6680, 0),
    P(RR(4, 36, 46, 42, 12), 0xff7a1a, 1), P(RR(9, 41, 30, 9, 4), 0xffb066, 2), P(RR(54, 49, 36, 6, 3), 0x55607b, 2), P(E(30, 66, 7), 0xffd21f, 2), P(E(14, 62, 4), 0x3a2e58, 2),
  ],
  w_no: () => [
    P(RP(6, 4, 30, 22, 14, 50, 10, 78, 14, 96, 30, 90, 44, 50, 26, 10, 44), 0xe0a640, 0),
    P(RR(44, 24, 12, 70, 5), 0x9a5424, 1), P(RR(38, 76, 24, 16, 6), 0x7e3f14, 1),
    P(PO(8, 38, 50, 64, 92, 38, 92, 44, 50, 72, 8, 44), 0xf4efe0, 2),
    P(RR(47, 8, 6, 58, 3), 0x8793ad, 3), P(PO(50, 0, 60, 16, 40, 16), 0xe0242e, 3),
  ],
  w_bua: () => [
    P(rot(RR(43, 34, 14, 62, 6), 32), 0xc27a35, 0), P(rot(RR(41, 70, 18, 14, 5), 32), 0xffc21f, 1),
    P(rot(RR(10, 6, 80, 36, 9), 32), 0x7d8fb2, 1), P(rot(RR(10, 6, 20, 36, 8), 32), 0xc9d6ec, 2), P(rot(RR(70, 6, 20, 36, 8), 32), 0xc9d6ec, 2),
    P(rot(RR(40, 12, 8, 24, 2), 32), 0xffc21f, 2), P(rot(RR(52, 12, 8, 24, 2), 32), 0xffc21f, 2),
  ],
  // ---- necklaces
  n_rang: () => [
    ring(50, 32, 36, 28, 0xb5702f, 0),
    P(RP(6, 30, 52, 70, 52, 62, 74, 50, 98, 38, 74), 0xfff1cf, 1), P(RP(4, 42, 56, 52, 56, 52, 76, 50, 88), 0xe8d6a8, 2),
    P(RR(28, 46, 44, 12, 5), 0xe0242e, 3), P(E(36, 58, 3), 0xffd21f, 3),
    P(RP(3, 18, 56, 32, 54, 30, 76, 26, 84), 0xfff1cf, 0), P(RP(3, 82, 56, 68, 54, 70, 76, 74, 84), 0xfff1cf, 0),
  ],
  n_pin: () => [
    ring(50, 24, 30, 22, 0xb5702f, 0),
    P(RR(42, 36, 16, 8, 3), 0x8793ad, 0), P(RR(26, 42, 48, 54, 10), 0x35d65a, 1), P(RR(26, 42, 48, 14, 8), 0x1b8a3a, 2),
    bolt(0xffd81f), P(RR(32, 62, 6, 20, 3), 0x8cfba0, 2),
  ],
  n_bua: () => [
    P(E(50, 16, 12, 11), 0xffc21f, 0, [E(50, 16, 6, 5)]), P(PO(42, 82, 58, 82, 64, 100, 36, 100), 0xffc21f, 0),
    P(RR(24, 24, 52, 64, 11), 0xffc21f, 1), P(RR(30, 30, 40, 52, 8), 0xe0242e, 2), P(RP(2, ...ST(50, 56, 17, 7, 5)), 0xffe96a, 3),
    P(E(38, 38, 4, 2.4, -30), 0xff9a8a, 3),
  ],
  // ---- gloves
  g_da: () => glove(0xc98a47, 0xb5702f, 0x5a3a1c, 0xe8b86a, [P(RR(18, 52, 62, 7, 3), 0xe8b86a, 2), P(E(48, 68, 4), 0xe8b86a, 2)]),
  g_dien: () => glove(0x7ac8ff, 0x2f7bff, 0x1b3a8a, 0x9af3ff, [bolt(0xffd81f, 3)]),
  g_gai: () => glove(0xd8283c, 0x8c1a2e, 0x2b2b3a, 0xdfe8f5, [spike(20), spike(36), spike(52), spike(67)]),
  // ---- armour
  a_lop: () => [
    P(RR(22, 4, 14, 36, 5), 0xffc21f, 0), P(RR(64, 4, 14, 36, 5), 0xffc21f, 0),
    ring(50, 56, 42, 40, 0x2b2b3a, 1),
    P(E(50, 56, 21), 0xaeb8cc, 1), P(E(50, 56, 9), 0x3a2e58, 2), P(E(34, 36, 11, 5, -40), 0x6b7690, 2),
    P(RR(46, 7, 8, 12, 3), 0x6b7690, 2), P(RR(46, 82, 8, 11, 3), 0x6b7690, 2), P(RR(6, 52, 11, 8, 3), 0x6b7690, 2), P(RR(83, 52, 11, 8, 3), 0x6b7690, 2),
  ],
  a_bien: () => [
    P(RR(20, 2, 12, 34, 5), 0x8793ad, 0), P(RR(68, 2, 12, 34, 5), 0x8793ad, 0),
    P(PO(...OCT(50, 56, 44)), 0xf4f1ff, 1), P(PO(...OCT(50, 56, 37)), 0xe0242e, 2), P(RR(26, 49, 48, 14, 4), 0xf4f1ff, 3),
    P(E(30, 36, 5, 3, -35), 0xff8c8c, 3),
  ],
  a_kevlar: () => [
    P(SPVEST, 0x23866a, 0), P(RR(24, 36, 52, 50, 9), 0x3fbf8e, 1),
    P(RR(28, 60, 14, 22, 4), 0x1f5a45, 2), P(RR(46, 60, 14, 22, 4), 0x1f5a45, 2), P(RR(64, 52, 8, 30, 3), 0x1f5a45, 2),
    P(RR(30, 40, 34, 8, 3), 0xffc21f, 2),
    P(RR(18, 8, 18, 8, 3), 0x1f5a45, 1), P(RR(64, 8, 18, 8, 3), 0x1f5a45, 1),
  ],
  // ---- belts
  b_dan: () => [
    ...[10, 28, 46, 64, 82].flatMap((x) => [P(RR(x - 5, 30, 12, 40, 3), 0xffc21f, 1), P(RP(3, x - 5, 30, x + 7, 30, x + 5, 12, x - 3, 12), 0xd8732a, 1), P(RR(x - 3, 34, 3, 20, 1), 0xfff0a0, 2)]),
    P(RR(2, 54, 96, 32, 9), 0x8a4a22, 3), P(RR(2, 54, 96, 9, 5), 0xc07a3e, 4), P(RR(40, 60, 20, 20, 5), 0xffc21f, 4, [RR(46, 66, 8, 8, 2)]),
  ],
  b_cuu: () => [
    ring(50, 30, 26, 18, 0x5a2a2a, 0),
    P(RR(10, 34, 80, 58, 15), 0xff4056, 1), P(RP(8, 10, 34, 90, 34, 90, 54, 10, 54), 0xc9283c, 2),
    P(PO(42, 58, 58, 58, 58, 66, 66, 66, 66, 78, 58, 78, 58, 86, 42, 86, 42, 78, 34, 78, 34, 66, 42, 66), 0xf4f1ff, 3),
  ],
  b_xich: () => [
    ring(12, 52, 13, 9, 0xcfd8e6, 0), ring(30, 52, 9, 13, 0x9fb0cc, 1), ring(70, 52, 9, 13, 0x9fb0cc, 1), ring(88, 52, 13, 9, 0xcfd8e6, 0),
    P(RR(34, 24, 32, 56, 9), 0xffc21f, 2, [RR(43, 36, 14, 32, 4)]), P(RR(38, 28, 24, 8, 3), 0xfff0a0, 3),
  ],
  // ---- boots
  f_chay: () => [
    P(RR(4, 68, 92, 20, 10), 0xf4f1ff, 0), P(shoe(SHOE_BODY), 0x2fc3ff, 1), P(PO(28, 64, 72, 54, 76, 62, 32, 72), 0xff8a1f, 2),
    P(RR(24, 30, 6, 4, 2), 0xf4f1ff, 2), P(RR(34, 34, 6, 4, 2), 0xf4f1ff, 2), P(RR(44, 40, 6, 4, 2), 0xf4f1ff, 2), P(E(20, 48, 5, 7), 0x9af3ff, 2),
  ],
  f_thep: () => [
    P(RP(6, 24, 4, 64, 4, 64, 46, 68, 52, 88, 56, 98, 66, 98, 90, 24, 90), 0xd68a3a, 0),
    P(RP(5, 66, 56, 90, 60, 98, 68, 98, 90, 66, 90), 0xcfd8e6, 1), P(RR(20, 82, 82, 14, 5), 0x2b2b3a, 1),
    P(RR(22, 2, 44, 14, 6), 0x8a4a22, 1), P(RR(32, 24, 24, 6, 3), 0xfff1cf, 2), P(RR(32, 38, 24, 6, 3), 0xfff1cf, 2), P(RR(32, 52, 24, 6, 3), 0xfff1cf, 2),
  ],
  f_lo: () => [
    P(E(50, 92, 33, 7), 0xffa31f, 0), P(E(50, 80, 33, 7), 0xffd21f, 1), P(E(50, 68, 33, 7), 0xffa31f, 2),
    P(RR(8, 56, 86, 12, 6), 0xf4f1ff, 3), P(RP(5, 12, 58, 14, 24, 24, 14, 42, 16, 48, 28, 62, 32, 86, 44, 94, 52, 94, 58), 0xff5fa8, 4),
    P(PO(30, 52, 72, 44, 76, 50, 34, 58), 0xffd21f, 5), P(E(22, 40, 4, 6), 0xffc4e0, 5),
  ],
};
const SPVEST = [['M', 18, 8], ['L', 40, 4], ['L', 50, 24], ['L', 60, 4], ['L', 82, 8], ['L', 92, 36], ['L', 82, 94], ['L', 18, 94], ['L', 8, 36], ['Z']];

export const ITEM_ICON = (id) => 'it_' + id;
for (const [id, fn] of Object.entries(DEFS)) ICONS[ITEM_ICON(id)] = fn;
