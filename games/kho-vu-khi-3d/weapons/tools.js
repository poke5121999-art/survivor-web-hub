// Tools sheet (cells 59-72): road sign, shears, bat, crowbar, tonfa, pipe, hoe, pan, pickaxe, wrenches, rake, shovel, saw.
// The owner's sheet draws these clean; here they are real used tools: painted handles with chips, forged steel.
import { weapon } from '../js/weapon.js';
import { G, C, WOOD, bat, wrap, shaft, pipe, edgeRuns, circle, roundPoly, arc, teeth, mv, bolt } from './common.js';

const Y = 0xd99a1c, OR = 0xd0661c, RD = 0xb8343e;
const T = (extra = {}) => ({ kind: 'tool', ...extra });

function wrenchHead(cy, r, gap) {
  const a2 = 90 - gap, nx = r * Math.cos(a2 * Math.PI / 180) * 0.8, yt = cy + r * Math.sin(a2 * Math.PI / 180);
  return [...arc(0, cy, r, 270, 360 + a2, 12), [nx, yt], [nx, cy + 0.4], [-nx, cy + 0.4], [-nx, yt], ...arc(0, cy, r, 180 - a2, 270, 10)];
}
/** painted handle with a turned end knob */
function paintedHandle(k, y0, len, r, col, o = {}) {
  k.add(G.lathe([[0, 0], [r * 0.9, 0], [r, 0.4], [r, len - 0.4], [r * 0.9, len], [0, len]], 18), o.mat ?? ['paint_worn', col], { p: [0, y0, 0], wear: 0.2, grime: 0.3 });
  if (o.knob) k.add(G.lathe([[0, 0], [r * 1.1, 0], [r * 1.35, 1.2], [r * 1.25, 2.6], [r * 0.8, 3.4], [0, 3.5]], 18), o.mat ?? ['paint_worn', col], { p: [0, y0 + len - 0.2, 0], wear: 0.2 });
}

export default [
  weapon('warning-sign', 'Warning sign on pole', T({ hands: 2, rot: 17 }), (k) => {
    pipe(k, 150, 2.4, { mat: 'galv', grime: 0.4 });
    k.add(G.cyl(2.5, 2.5, 3, 18, 0.2), ['rubber'], { p: [0, 0, 0] });
    const tri = [[-30, 92], [30, 92], [0, 144]];
    const outer = roundPoly(tri, 6, 5), inner = roundPoly(tri.map(([x, y]) => [x * 0.72, 109 + (y - 109) * 0.72]), 3, 4);
    k.add(G.extrude(outer, 0.3, 0.08), 'alu', { p: [0, 0, 2.6], wear: 0.3 });
    k.add(G.extrude(outer.map(([x, y]) => [x * 0.985, 109 + (y - 109) * 0.985]), 0.12, 0.03, [inner.slice().reverse()]), ['paint', 0xc8303a], { p: [0, 0, 2.8] });
    k.add(G.extrude(inner, 0.1, 0.02), ['paint', 0xe6e4de], { p: [0, 0, 2.78] });
    k.add(G.box(2.2, 13, 0.12, 0.05), ['paint', 0x1c1c1e], { p: [0, 113, 2.86] });
    k.add(G.cyl(1.3, 1.3, 0.12, 16, 0.04), ['paint', 0x1c1c1e], { p: [0, 103, 2.86], r: [90, 0, 0] });
    for (const y of [100, 124]) { k.add(G.box(7, 2.4, 1.6, 0.3), 'steel_worn', { p: [0, y, 1.4] }); bolt(k, -2.5, y, 2.4, { r: 0.4 }); bolt(k, 2.5, y, 2.4, { r: 0.4 }); }
    k.grip([0, 40, 0]); k.grip2([0, 12, 0]); k.tip([0, 150, 0]);
  }),

  weapon('hedge-shears', 'Hedge shears', T({ hands: 2, rot: 8 }), (k) => {
    for (const s of [-1, 1]) k.xf({ r: [0, 0, s * 13], p: [0, 42, s * 0.25] }, () => {
      pipe(k, 34, 1.3, { mat: ['paint_worn', Y], p: [0, 2, 0] });
      k.add(G.lathe([[0, 0], [1.6, 0], [1.75, 0.6], [1.7, 11], [1.55, 11.6], [0, 11.6]], 16), ['rubber'], { p: [0, 26, 0], col: [3.5, 1.7, 1.1] });
      k.add(G.lathe([[0, 0], [1.8, 0], [2.2, 1.2], [2.0, 2.4], [0, 2.6]], 16), ['plastic', OR], { p: [0, 37.4, 0] });
      const bl = [[-1.6, 2], [1.6, 2], [2.6, -4], [2.0, -38], [-0.4, -42], [-2.6, -5]].map(([x, y]) => [x * s, y]);
      k.add(G.blade(bl, { d: 0.38, b: 0.04, edge: edgeRuns(bl, (p) => p[0] * s < 0 && p[1] < -3), grind: 1.6, thin: 0.15 }), 'steel_satin', { wear: 0.2, grain: 'y' });
      k.add(G.box(3.2, 4.5, 0.9, 0.3), 'steel_dark', { p: [0, 0.5, 0] });
    });
    bolt(k, 0, 42, 1.0, { r: 0.7, h: 0.5 });
    k.grip([-3, 62, 0]); k.grip2([3, 62, 0]); k.tip([0, 4, 0]);
  }),

  weapon('bat-yellow', 'Yellow bat, black tape', T({ kind: 'melee', rot: -85 }), (k) => {
    bat(k, { mat: ['paint_worn', Y], stain: [1, 1, 1], gripCol: 0x202124, gripTo: 9 });
    wrap(k, 14, 19, 1.3, 1.3, ['tape', 0x202124], { band: 1.7 });
    wrap(k, 24, 28, 1.45, 1.45, ['tape', 0x202124], { band: 1.7 });
  }),

  weapon('crowbar-red', 'Crowbar, red grip', T({ kind: 'melee', rot: -62 }), (k) => {
    // hexagonal bar stock, goose-neck claw, flattened pry end, red dipped grip
    const hex = circle(0, 0, 1.25, 6);
    k.add(G.extrude(hex, 62, 0.08).rotateX(-Math.PI / 2).translate(0, 31 + 2, 0), 'steel_dark', { grain: 'y', wear: 0.3 });
    const neck = []; for (let i = 0; i <= 14; i++) { const a = Math.PI - i / 14 * Math.PI * 1.15; neck.push([5 + Math.cos(a) * 5, 64 + Math.sin(a) * 5.2, 0]); }
    k.add(G.tube([[0, 62, 0], [0, 64, 0], ...neck.slice(1)], 1.2, 8), 'steel_dark', { wear: 0.3 });
    const claw = [[-1.2, 0], [1.2, 0], [1.4, 3], [0.5, 4.2], [0.2, 2.4], [-0.2, 2.4], [-0.5, 4.2], [-1.4, 3]];
    k.add(G.extrude(claw, 1.0, 0.12), 'steel_satin', { p: [neck[14][0], neck[14][1], 0], r: [0, 0, 145], wear: 0.3 });
    k.add(G.blade([[-1.25, 0], [1.25, 0], [1.6, -7], [-1.1, -7.6]], { d: 1.2, b: 0.1, edge: [[2, 3]], grind: 4, thin: 0.25 }), 'steel_satin', { p: [0, 2.2, 0] });
    k.add(G.lathe([[0, 0], [1.75, 0], [1.9, 0.5], [1.75, 22], [1.4, 24], [0, 24]], 18), ['plastic', RD], { p: [0, 10, 0], col: [1, 1, 1] });
    k.grip([0, 30, 0]); k.grip2([0, 14, 0]); k.tip([neck[14][0], neck[14][1], 0]);
  }),

  weapon('tonfa', 'Tonfa baton', T({ kind: 'melee', rot: 45 }), (k) => {
    k.add(G.lathe([[0, 0], [1.9, 0], [2.1, 0.6], [2.1, 55.4], [1.9, 56], [0, 56]], 20), ['polymer', 0x26282c], { wear: 0.1 });
    k.add(G.lathe([[0, 0], [1.6, 0], [1.6, 11], [1.9, 11.6], [2.1, 13], [1.6, 14], [0, 14]], 18), ['polymer', 0x26282c], { p: [0, 36, 0], r: [0, 0, -90] });
    for (let i = 0; i < 8; i++) k.add(G.torus(1.62, 0.12, 16, 5), ['polymer', 0x1b1c1f], { p: [3 + i * 1.1, 36, 0], r: [0, 90, 0] });
    k.grip([8, 36, 0], [0, 1, 0], [1, 0, 0]); k.tip([0, 56, 0]);
  }),

  weapon('bent-pipe', 'Bent pipe', T({ kind: 'melee', rot: 70 }), (k) => {
    pipe(k, 58, 2.2, { mat: 'steel_rusty' });
    const el = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI / 2; el.push([-4.5 + Math.cos(a) * 4.5, 58 + Math.sin(a) * 4.5, 0]); }
    k.add(G.tube(el, 2.2, 18), 'steel_rusty', { wear: 0.3 });
    k.add(G.cyl(2.65, 2.65, 2.6, 20, 0.2), 'steel_dark', { p: [0, 45, 0] }); k.add(G.cyl(2.65, 2.65, 2.6, 20, 0.2), 'steel_dark', { p: [0, 5, 0] });
    k.add(G.cyl(2.5, 2.5, 3.2, 20, 0.2), 'steel_dark', { p: [-4.5, 62.5, 0], r: [0, 0, 90] });
    k.grip([0, 24, 0]); k.tip([-7.7, 62.5, 0]);
  }),

  weapon('garden-hoe', 'Garden hoe', T({ hands: 2, rot: -62 }), (k) => {
    paintedHandle(k, 22, 62, 1.6, OR, { knob: true });
    k.add(G.cyl(1.9, 1.75, 7, 18, 0.3), 'steel_dark', { p: [0, 21, 0], wear: 0.4 });
    k.add(G.cyl(0.7, 0.7, 19, 10, 0.1), 'steel_dark', { p: [0, 3, 0] });
    const bl = [[-9, -19], [13, -2.5], [12.6, -1.6], [-9, -1.6]];
    k.add(G.blade(bl, { d: 0.35, b: 0.05, edge: [[0, 1]], grind: 1.8, thin: 0.2 }), 'steel_worn', { p: [0, 4, 0], wear: 0.3, grime: 0.4 });
    k.grip([0, 66, 0]); k.grip2([0, 40, 0]); k.tip([-9, -15, 0]); k.edge([-9, -15, 0], [13, 1.5, 0]);
  }),

  weapon('frying-pan-clean', 'Frying pan', T({ kind: 'melee', rot: 175 }), (k) => {
    const R = 13, D = 4;
    k.add(G.lathe([[0, 0], [R - 2.4, 0], [R - 0.6, D * 0.55], [R, D], [R + 0.35, D + 0.2], [R + 0.25, D + 0.55], [R - 0.45, D + 0.35], [R - 1.0, D * 0.6], [R - 2.7, 0.45], [0, 0.45]], 40), 'steel_dark', { r: [90, 0, 0], wear: 0.3 });
    k.add(G.cyl(R - 2.7, R - 2.7, 0.06, 40, 0.02), ['polymer', 0x8c99a8], { p: [0, 0, 0.47], r: [90, 0, 0] });
    k.add(G.box(2.4, 6, 1.0, 0.3), 'steel_dark', { p: [0, -R - 2, D * 0.6] });
    k.add(G.lathe([[0, 0], [1.2, 0], [1.45, 0.8], [1.35, 12], [0.9, 13], [0, 13]], 16).scale(1, 1, 0.7), 'wood', { p: [0, -R - 4.5, D * 0.6], r: [180, 0, 0], col: WOOD.red, grain: 'y' });
    k.grip([0, -R - 11, D * 0.6]); k.tip([0, R, 2]);
  }),

  weapon('pickaxe-yellow', 'Pickaxe, yellow handle', T({ hands: 2, rot: -76 }), (k) => {
    shaft(k, 80, 2.0, 1.55, { mat: ['paint_worn', Y], stain: [1, 1, 1] });
    const top = [], low = [], n = 16;
    for (let i = 0; i <= n; i++) { const x = -32 + 64 * i / n, a = Math.abs(x) / 32; top.push([x, 79 - 8 * a * a]); low.push([x, 79 - 8 * a * a - (5 * (1 - Math.pow(a, 1.2)) + 0.5)]); }
    const pts = [...top, ...low.reverse()];
    k.add(G.blade(pts, { d: 3.2, b: 0.3, edge: edgeRuns(pts, (p) => Math.abs(p[0]) > 25), grind: 8, thin: 0.15 }), 'steel_worn', { wear: 0.35, grain: 'x' });
    k.add(G.box(7.2, 10, 5.4, 0.8), 'steel_worn', { p: [0, 76, 0], wear: 0.45 });
    k.grip([0, 12, 0]); k.grip2([0, 46, 0]); k.tip([-32, 71, 0]);
  }),

  weapon('wrench-open', 'Open-end wrench', T({ kind: 'melee', rot: 22 }), (k) => {
    const hand = roundPoly([[-2.6, 4], [2.6, 4], [3.0, 56], [-3.0, 56]], 0.8, 2);
    k.add(G.extrude(hand, 1.0, 0.3), 'steel_brushed', { wear: 0.2, grain: 'y' });
    k.add(G.extrude(hand.map(([x, y]) => [x * 0.5, y]), 1.2, 0.2), 'steel_brushed', { grain: 'y' });
    k.add(G.extrude(wrenchHead(60, 7.6, 24), 1.3, 0.35), 'steel_brushed', { wear: 0.3, grain: 'y' });
    k.add(G.extrude(wrenchHead(0, 6.4, 24).map(([x, y]) => [x, -y]).reverse(), 1.3, 0.35), 'steel_brushed', { wear: 0.3, grain: 'y' });
    k.add(G.box(1.2, 8, 0.06, 0.02), 'steel_dark', { p: [0, 30, 0.62] });
    k.grip([0, 30, 0]); k.tip([0, 67, 0]);
  }),

  weapon('rake', 'Garden rake', T({ hands: 2, rot: -125 }), (k) => {
    k.add(G.lathe([[0, 0], [1.4, 0], [1.6, 0.5], [1.6, 148], [0, 148]], 16), 'wood', { col: [0.85, 0.5, 0.38], grain: 'y', grime: 0.3 });
    k.xf({ p: [0, 148, 0] }, () => {
      k.add(G.cyl(1.9, 1.7, 8, 16, 0.3), 'steel_dark', { p: [0, -6, 0], wear: 0.4 });
      k.add(G.box(44, 2.6, 2.0, 0.5), 'steel_worn', { p: [0, 2.6, 0], wear: 0.4 });
      for (let i = 0; i < 14; i++) { const x = -20.5 + i * 41 / 13; k.add(G.lathe([[0, 0], [0.42, 0], [0.42, 7], [0.2, 9.5], [0, 9.6]], 6), 'steel_worn', { p: [x, 3.6, 0], r: [8, 0, 0], wear: 0.3 }); }
    });
    k.grip([0, 60, 0]); k.grip2([0, 110, 0]); k.tip([0, 160, 0]);
  }),

  weapon('pipe-wrench-red', 'Red pipe wrench', T({ kind: 'melee', rot: -112 }), (k) => {
    const hand = roundPoly([[-2.0, 0], [2.0, 0], [2.6, 42], [-2.6, 42]], 0.9, 2);
    k.add(G.extrude(hand, 2.2, 0.55, [circle(0, 3.4, 0.9, 12, true)]), ['paint_worn', RD], { wear: 0.4 });
    k.add(G.extrude([[-4.2, 39], [3, 39], [4.2, 49], [8.2, 55], [9.6, 61], [7, 67], [3.2, 61], [1, 53], [-4.2, 51]], 3.0, 0.5), 'steel_dark', { wear: 0.4 });
    for (let i = 0; i < 7; i++) k.add(G.box(0.25, 0.9, 3.05, 0.05), 'steel_satin', { p: [4.4 + i * 0.6, 58.2 + i * 0.4, 0], r: [0, 0, 35] });
    k.add(G.box(6, 7.6, 3.8, 0.8), 'steel_satin', { p: [0, 46, 0], wear: 0.3 });
    k.add(G.cyl(2.3, 2.3, 4.2, 20, 0.3), 'steel_satin', { p: [0, 46, -2.1], r: [90, 0, 0] });
    for (let i = 0; i < 10; i++) k.add(G.box(4.7, 0.18, 0.2, 0.05), 'steel_dark', { p: [0, 46, -2 + i * 0.44], r: [0, 0, i * 18] });
    k.grip([0, 20, 0]); k.grip2([0, 6, 0]); k.tip([8, 62, 0]);
  }),

  weapon('shovel-small', 'Small shovel', T({ kind: 'melee', rot: 34 }), (k) => {
    paintedHandle(k, 3, 37, 1.5, OR, { knob: true });
    k.add(G.cyl(1.8, 1.65, 5, 18, 0.3), ['paint_worn', 0x3d8a3e], { p: [0, 0, 0] });
    const bl = roundPoly([[-2.8, 1.5], [2.8, 1.5], [8, -4], [8, -17], [0, -23.5], [-8, -17], [-8, -4]], 1.5, 3);
    const g = G.blade(bl, { d: 0.25, b: 0.05, edge: edgeRuns(bl, (p) => p[1] < -15), grind: 2, thin: 0.3 });
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, p.getZ(i) + x * x * 0.025); }
    g.deleteAttribute('normal'); g.computeVertexNormals();
    k.add(g, ['paint_worn', 0x3d8a3e], { p: [0, 1, 0], wear: 0.3, grime: 0.5 });
    k.add(G.box(1.4, 12, 1.0, 0.4), ['paint_worn', 0x2f6e31], { p: [0, -7, -0.4] });
    k.grip([0, 30, 0]); k.tip([0, -22, 0]); k.edge([-7, -17, 0], [7, -17, 0]);
  }),

  weapon('hand-saw', 'Hand saw', T({ kind: 'melee', rot: 122 }), (k) => {
    const grip = roundPoly([[-5, 0], [5, 0], [5.6, 9], [3.4, 15], [-3.4, 15], [-5.6, 9]], 1.5, 3);
    k.add(G.extrude(grip, 2.8, 0.9, [roundPoly([[-2.4, 3.2], [2.6, 3.2], [2.6, 10], [-2.4, 10]], 1.2, 3).reverse()]), ['plastic', OR], { wear: 0.2 });
    for (const [x, y] of [[-2.6, 12.6], [2.6, 12.6], [0, 13.8]]) bolt(k, x, y, 1.45, { r: 0.45, mat: 'brass' });
    const blade = [[-4.6, 13.5], [-1.4, 58], ...teeth([1.6, 58], [4.8, 13.5], 34, 0.65, 0.5)];
    k.add(G.blade(blade, { d: 0.09, b: 0.02 }), 'steel_brushed', { wear: 0.15, grain: 'y' });
    k.grip([0, 7, 0]); k.tip([0, 58, 0]); k.edge([4.8, 14, 0], [1.6, 58, 0]);
  }),
];
