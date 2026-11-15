// Combat sheet row 3 (cells 33-51): throwing/hunting knives, hatchets, karambit, kukri, machete, steel, kunai, pans, shields.
import { weapon } from '../js/weapon.js';
import { G, C, WOOD, knife, wrap, shaft, axeHead, edgeRuns, circle, roundPoly, arc, mv, bolt, nails } from './common.js';
import { thrower, kunai, karambit, kukri } from './traced.js';

function hatchet(k, o) {
  const len = o.len ?? 38;
  // slightly curved hickory handle with a swelled butt
  const prof = [[0, 0], [1.75, 0], [1.9, 0.8], [1.6, 3], [1.35, 9], [1.45, len * 0.6], [1.6, len - 0.6], [1.45, len], [0, len]];
  const g = G.lathe(prof, 18); g.scale(1, 1, 0.78);
  k.add(g, 'wood', { col: o.stain ?? WOOD.dark, grain: 'y', grime: 0.3 });
  if (o.tape) wrap(k, o.tape[0], o.tape[1], 1.5, 1.2, ['tape', o.tapeCol], { band: 2.0, tilt: 10, tail: o.tail });
  if (o.tape2) wrap(k, o.tape2[0], o.tape2[1], 1.5, 1.2, ['tape', o.tape2Col], { band: 2.0, tilt: -10 });
  const y = len - 5;
  const head = [[-3.2, y], [1.6, y], [4, y - 2.2], [9.6, y - 4.6], [11.2, y - 4.0], [11.8, y + 4.5], [11.0, y + 12.6], [9.4, y + 13.2], [4, y + 11], [1.6, y + 9.4], [-3.2, y + 9.4]];
  axeHead(k, head, { d: 2.3, edgeX: 10.6, grind: 4.5, mat: o.headMat ?? 'steel_worn', blood: o.blood });
  k.add(G.box(3.6, 9.2, 2.6, 0.4), o.poll ?? 'steel_dark', { p: [-2.2, y + 4.7, 0], wear: 0.4 });
  if (o.red) k.add(G.box(7.5, 3.4, 2.5, 0.4), ['paint_worn', o.red], { p: [1.4, y + 7.2, 0], wear: 0.3 });
  k.add(G.box(1.6, 1.2, 2.5, 0.2), 'steel_satin', { p: [-0.2, y + 9.6, 0] });               // wedge
  k.grip([0, 12, 0]); k.tip([11.8, y + 4.5, 0]); k.edge([11.2, y - 4, 0], [11, y + 12.6, 0]);
}

function pan(k, o) {
  // cast-iron skillet: lathe body with a thick rolled rim, pour lips, cast handle, wooden/painted grip
  const R = o.R ?? 13, D = o.D ?? 4;
  const prof = [[0, 0], [R - 2.4, 0], [R - 0.6, D * 0.55], [R, D], [R + 0.35, D + 0.2], [R + 0.25, D + 0.55], [R - 0.45, D + 0.35], [R - 1.0, D * 0.6], [R - 2.7, 0.45], [0, 0.45]];
  k.add(G.lathe(prof, 40), o.mat ?? 'steel_dark', { r: [90, 0, 0], col: o.col, wear: 0.3, blood: o.blood, grime: 0.5 });
  k.add(G.box(2.6, 10, 1.2, 0.4), o.mat ?? 'steel_dark', { p: [0, -R - 3.6, D * 0.55], r: [-8, 0, 0], col: o.col, wear: 0.3 });
  const grip = G.lathe([[0, 0], [1.3, 0], [1.5, 0.6], [1.35, 6], [1.5, 10], [1.2, 10.8], [0, 10.8]], 16); grip.scale(1, 1, 0.75);
  k.add(grip, o.gripMat ?? 'wood', { p: [0, -R - 7.8, 1.2], r: [180, 0, 0], col: o.gripCol, grain: 'y' });
  if (!o.noRing) k.add(G.torus(1.1, 0.32, 18, 8), o.gripMat ?? 'wood', { p: [0, -R - 20, 1.2], col: o.gripCol });
  k.grip([0, -R - 13, 1.2]); k.tip([0, R, D * 0.5]);
}

function signShield(k) {
  // reflective aluminium no-entry sign on a broom-handle pole; rolled edge, rivets, back strap
  k.add(G.lathe([[0, 0], [1.3, 0], [1.45, 0.4], [1.3, 2], [1.3, 30], [0, 30]], 16), 'wood', { col: WOOD.red, grain: 'y' });
  wrap(k, 2, 12, 1.32, 1.32, ['tape', 0x3a2c26], { band: 2.0, tilt: 9 });
  const R = 15.5, cy = 42;
  k.add(G.extrude(circle(0, 0, R + 0.5, 48), 0.35, 0.12), 'alu', { p: [0, cy, -0.2], wear: 0.3 });
  k.add(G.torus(R + 0.4, 0.28, 48, 6), 'alu', { p: [0, cy, -0.2] });
  k.add(G.extrude(circle(0, 0, R, 48), 0.12, 0.03), ['paint', 0xb01e1a], { p: [0, cy, 0.05], wear: 0.1, blood: 0.35 });
  k.add(G.extrude(roundPoly([[-11, -2.1], [11, -2.1], [11, 2.1], [-11, 2.1]], 0.4, 2), 0.12, 0.03), ['paint', 0xe4e2dc], { p: [0, cy, 0.1], blood: 0.3 });
  k.add(G.ringPoly(R * 0.73, R * 0.71, 0.13, 48, 0.02), ['paint', 0xe4e2dc], { p: [0, cy, 0.09] });
  for (const y of [cy - 9, cy - 3]) k.add(G.box(3.4, 1.4, 0.6, 0.2), 'steel_worn', { p: [0, y, -0.8] });
  k.add(G.cyl(1.4, 1.4, 1.0, 14, 0.2), 'steel_dark', { p: [0, cy - 13.2, -1.0], r: [90, 0, 0] });
  for (const a of [0, 120, 240]) { const r = a * Math.PI / 180; k.add(G.cyl(0.32, 0.32, 0.25, 10, 0.06), 'steel_satin', { p: [Math.sin(r) * 13.2, cy + Math.cos(r) * 13.2, 0.0], r: [90, 0, 0] }); }
  k.grip([0, 10, 0]); k.tip([0, cy + R, 0]);
}

function trayShield(k) {
  // stamped steel serving tray: dished oval with a beaded rim, a bite torn out of it, wire handle
  const pts = [], rim = [], n = 40;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2; const d = Math.abs(((a * 180 / Math.PI) - 160 + 540) % 360 - 180);
    const bite = d < 14 ? (1 - d / 14) * 0.2 * (1 + 0.3 * Math.sin(i * 7)) : 0;
    pts.push([Math.cos(a) * 12 * (1 - bite), 15 + Math.sin(a) * 15.5 * (1 - bite)]);
    rim.push([Math.cos(a) * 10.4 * (1 - bite * 0.6), 15 + Math.sin(a) * 13.6 * (1 - bite * 0.6)]);
  }
  k.add(G.extrude(pts, 0.2, 0.05, [rim.slice().reverse()]), 'steel_worn', { p: [0, 0, 0.9], wear: 0.3, blood: 0.15 });
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; k.add(G.tube([[a[0], a[1], 0.9], [b[0], b[1], 0.9]], 0.3, 6), 'steel_worn', {}); }
  const dish = G.extrude(rim, 0.15, 0.03); const p = dish.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / 10.4, y = (p.getY(i) - 15) / 13.6, r2 = x * x + y * y; p.setZ(i, p.getZ(i) - (1 - r2) * 0.9 + 0.9 + Math.sin(x * 7 + y * 5) * 0.08); }
  dish.deleteAttribute('normal'); dish.computeVertexNormals();
  k.add(dish, 'steel_worn', { wear: 0.2, blood: 0.25 });
  k.add(G.tube([[-3, -0.8, 0.9], [-3.2, -3, 0.9], [0, -4.2, 0.9], [3.2, -3, 0.9], [3, -0.8, 0.9]], 0.35, 8), 'steel_worn', {});
  k.add(G.box(2.4, 9, 1.2, 0.4), 'steel_dark', { p: [0, 15, -0.4] });
  k.add(G.box(3.4, 1.4, 1.6, 0.3), ['rubber'], { p: [0, 15, -1.2] });
  k.grip([0, 15, -1.6]); k.tip([0, 30.5, 0]);
}

export default [
  thrower('thrower-teal-hex', 'Throwing knife (hex pommel)'),
  thrower('thrower-teal-slim', 'Throwing knife (slim ring)'),
  weapon('knife-brown-wrap', 'Hunting knife (brown wrap)', { rot: 0 }, (k) => knife(k, { hl: 10, hw: 2.2, handle: 'round', L: 14, W: 2.6, tip: 'clip', guard: true, guardW: 1.0, wrap: { y0: 0.8, y1: 9.4, col: 0x5a3a26, mat: ['leather', 0x6a4630], band: 1.0, tilt: 3 } })),
  weapon('knife-red-bands', 'Knife (red bands)', { rot: 0 }, (k) => knife(k, { hl: 10, hw: 2.2, handle: 'round', hmat: ['leather', 0x3a2b26], L: 13, W: 2.5, tip: 'clip', guard: true, guardW: 0.6, bands: [{ y: 2.6, h: 0.9, mat: ['paint', C.red] }, { y: 5, h: 0.9, mat: ['paint', C.red] }, { y: 7.4, h: 0.9, mat: ['paint', C.red] }] })),
  weapon('knife-orange-wrap', 'Long knife (orange wrap)', { rot: 0 }, (k) => knife(k, { hl: 12, hw: 2.3, handle: 'round', hmat: ['leather', 0x4a4038], L: 24, W: 2.7, tip: 'point', bd: 0.35, guard: true, guardW: 0.4, wrap: { y0: 0.8, y1: 8, col: C.orange, mat: ['fabric', C.orange], band: 1.2, tilt: 14, cross: true }, bands: [{ y: 9.6, h: 1.2, col: 0x24262c }] })),
  weapon('hatchet-red', 'Hatchet (red)', { blood: 0.12 }, (k) => hatchet(k, { stain: WOOD.dark, tape: [3, 16], tapeCol: 0x1d1c20, red: C.red, poll: ['paint_worn', C.red], blood: 0.15 })),
  weapon('hatchet-orange', 'Hatchet (orange tape)', { blood: 0.06 }, (k) => hatchet(k, { stain: WOOD.walnut, tape: [5, 28], tapeCol: C.orange, poll: 'steel_dark', len: 40, tail: true })),
  karambit(),
  weapon('knife-small-blue', 'Small knife', { rot: 0 }, (k) => knife(k, { hl: 8, hw: 2.1, hd: 1.4, L: 11, W: 2.6, tip: 'drop', hmat: ['polymer', 0x587a92], rivets: [2.2, 6] })),
  kukri(),
  weapon('machete', 'Machete', { blood: 0.05 }, (k) => knife(k, { hl: 13, hw: 2.8, hd: 2.0, L: 42, W: 6.4, tip: 'clip', clip: 0.86, bd: 0.32, grind: 3.0, hmat: ['polymer', 0x7a645c], pommel: true, pommelMat: ['rubber'], rivets: [3, 7.5, 11], bands: [{ y: 4, h: 1.2, mat: ['rubber'] }], bmat: 'steel_worn' })),

  weapon('sharpening-steel', 'Sharpening steel', { rot: 0 }, (k) => {
    k.add(G.lathe([[0, 0], [1.6, 0], [1.9, 0.6], [1.7, 2], [1.75, 11], [2.0, 12.6], [0, 12.6]], 18), ['polymer', 0x232528], {});
    k.add(G.torus(1.25, 0.28, 18, 8), 'steel_satin', { p: [0, -1.4, 0], r: [90, 0, 0] });
    k.add(G.cyl(0.4, 0.4, 1.4, 10, 0.1), 'steel_satin', { p: [0, -0.9, 0] });
    k.add(G.extrude(roundPoly([[-3.2, -0.4], [3.2, -0.4], [3.2, 0.4], [-3.2, 0.4]], 0.4, 2), 1.8, 0.3), 'steel_satin', { p: [0, 13.1, 0] });
    // honing rod: fine longitudinal ridges (12 flutes)
    const flutes = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? 0.62 : 0.68; flutes.push([Math.cos(a) * r, Math.sin(a) * r]); }
    k.add(G.extrude(flutes, 31, 0.02).rotateX(-Math.PI / 2).translate(0, 13.5 + 15.5, 0), 'steel_satin', { grain: 'y', wear: 0.1 });
    k.add(G.lathe([[0, 0], [0.62, 0], [0.3, 0.8], [0, 1.0]], 12), 'steel_satin', { p: [0, 44.5, 0] });
    k.grip([0, 6, 0]); k.tip([0, 45.5, 0]);
  }),

  weapon('knife-teal-thin', 'Slim utility knife', { rot: 0 }, (k) => knife(k, { hl: 7, hw: 1.9, hd: 1.3, L: 12, W: 2.2, tip: 'point', hmat: ['polymer', 0x4f7d90], rivets: [2, 5] })),

  weapon('multitool-red', 'Red multitool', { rot: 0 }, (k) => {
    // swiss-army style: two red cellulose scales over steel liners, folded tools showing, one blade open
    const out = roundPoly([[-1.3, 0], [1.3, 0], [1.3, 9.2], [-1.3, 9.2]], 1.25, 5);
    k.add(G.extrude(out, 1.4, 0.05), 'steel_satin', {});
    for (const s of [-1, 1]) k.add(G.extrude(out.map(([x, y]) => [x * 1.02, y]), 0.35, 0.16), ['plastic', 0xc0201a], { p: [0, 0, s * 0.86] });
    k.add(G.box(0.9, 0.3, 0.06, 0.02), ['paint', 0xeeeeee], { p: [0, 6, 1.06] });
    k.add(G.box(0.3, 0.9, 0.06, 0.02), ['paint', 0xeeeeee], { p: [0, 6, 1.06] });
    for (const y of [1.2, 8]) k.add(G.cyl(0.3, 0.3, 2.2, 10, 0.06), 'steel_satin', { p: [0, y, -1.1], r: [90, 0, 0] });
    k.add(G.torus(0.6, 0.12, 12, 6), 'steel_satin', { p: [-0.2, -0.7, 0], r: [0, 90, 0] });
    const K = { pts: [[-1, 0], [0.9, 0], [1.05, 4], [0.2, 6.8], [-1, 6.4]], edge: [[1, 3]] };
    k.add(G.blade(mv(K.pts, 0, 8.6), { d: 0.22, b: 0.03, edge: K.edge, grind: 1.1 }), 'steel', { grain: 'y' });
    k.grip([0, 4.5, 0]); k.tip([0.2, 15.4, 0]); k.edge([1, 8.8, 0], [0.4, 15, 0]);
  }),

  kunai('kunai-green', 'Kunai (green)', 0x6f9a2e),
  kunai('kunai-purple', 'Kunai (purple)', 0x7a3fb0),

  weapon('frying-pan-nails', 'Frying pan with nails', { blood: 0.4 }, (k) => {
    pan(k, { mat: 'steel_dark', gripMat: ['paint_worn', C.red], blood: 0.45 });
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + 0.2; k.add(G.nail(5.5, 0.15), 'steel_rusty', { p: [Math.cos(a) * 16.4, Math.sin(a) * 16.4, 2.6], r: [0, 0, a * 180 / Math.PI + 90], blood: 0.3 }); }
  }),
  weapon('stop-sign-shield', 'No-entry sign shield', { kind: 'shield', blood: 0.3 }, (k) => signShield(k)),
  weapon('tray-shield', 'Dented tray shield', { kind: 'shield', blood: 0.2 }, (k) => trayShield(k)),
];
