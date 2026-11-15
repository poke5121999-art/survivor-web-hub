// Combat sheet row 2 (cells 17-32): bats, hammers, pipe clubs, katanas, axes, pickaxe, wrench, chainsaw sword, frame saw.
import { weapon } from '../js/weapon.js';
import {
  G, C, WOOD, bat, wrap, nails, barbedWire, shaft, pipe, katanaOutline, axeHead, edgeRuns, sawDisc, gearOutline, circle,
  bolt, valveWheel, roundPoly, arc, mv,
} from './common.js';
import { ladderSaw } from './traced.js';

/** katana: oval tsuka with crossed ito wrap, tsuba, habaki, curved blade with a shinogi grind */
function katana(k, o) {
  const tl = o.tl ?? 26, L = o.L ?? 70, W = o.W ?? 3.1, curve = o.curve ?? 2.4, B = o.blood ?? 0;
  const tsuka = G.lathe([[0, 0], [1.25, 0], [1.4, 0.4], [1.45, 4], [1.38, tl * 0.5], [1.48, tl - 1], [1.4, tl], [0, tl]], 18); tsuka.scale(1, 1, 0.78);
  k.add(tsuka, ['leather', 0xd8d0c0], { col: [0.9, 0.86, 0.8] });                         // same (ray-skin) core
  wrap(k, 1.2, tl - 1.2, 1.48, 1.18, ['fabric', o.wrap ?? C.black], { band: 1.3, tilt: 24, cross: false, t: 0.11, over: 0.0, blood: B * 0.4 });
  wrap(k, 1.6, tl - 1.6, 1.5, 1.2, ['fabric', o.wrap ?? C.black], { band: 1.3, tilt: -24, t: 0.11, over: 0.0 });
  k.add(G.cyl(1.5, 1.4, 1.3, 18, 0.25), o.fittings ?? 'steel_dark', { p: [0, -0.9, 0], s: [1, 1, 0.8], wear: 0.3 });   // kashira
  k.add(G.cyl(1.55, 1.55, 1.0, 18, 0.15), o.fittings ?? 'steel_dark', { p: [0, tl - 0.6, 0], s: [1, 1, 0.8], wear: 0.3 }); // fuchi
  const tsubaR = o.tsubaR ?? 3.6;
  const ts = G.extrude(roundPoly([[-tsubaR, -tsubaR * 0.85], [tsubaR, -tsubaR * 0.85], [tsubaR, tsubaR * 0.85], [-tsubaR, tsubaR * 0.85]], tsubaR * 0.7, 5), 0.55, 0.12, [circle(0, 0, 0.75, 14, true).map(([x, y]) => [x * 1.6, y * 0.6])]);
  k.add(ts, o.tsubaMat ?? 'steel_dark', { p: [0, tl + 0.5, 0], r: [90, 0, 0], wear: 0.35 });
  k.add(G.box(3.4, 2.4, 0.85, 0.12), 'brass', { p: [0.2, tl + 2, 0], wear: 0.3 });           // habaki
  const K = katanaOutline(L, W, curve);
  const pts = mv(K.pts, 0, tl + 0.8);
  k.add(G.blade(pts, { d: 0.68, b: 0.04, edge: K.edge, grind: W * 0.62, thin: 0.08 }), 'steel', { wear: 0.12, blood: B, grain: 'y' });
  // hamon: a slightly brighter, polished strip along the edge (separate thin skin on both faces)
  if (o.hook) {
    const hk = []; for (let i = 0; i <= 14; i++) { const a = (-70 + 250 * i / 14) * Math.PI / 180; hk.push([3.2 + Math.cos(a) * 2.4, tl + 6 + Math.sin(a) * 4.5]); }
    k.add(G.tube(hk.map(([x, y]) => [x, y, 0]), 0.32, 8), 'steel_dark', { wear: 0.4 });
    k.add(G.tube([[0.6, tl + 0.6, 0], [2.2, tl + 1.4, 0], [3.9, tl + 2.0, 0]], 0.36, 8), 'steel_dark', {});
    k.add(G.box(1.1, 3, 1.2, 0.3), ['paint', C.red], { p: [0, tl - 3, 0] });
  }
  k.grip([0, tl * 0.3, 0], [0, 1, 0], [1, 0, 0]); k.grip2([0, tl * 0.8, 0], [0, 1, 0], [1, 0, 0]);
  k.tip([K.tip[0], K.tip[1] + tl + 0.8, 0]); k.edge([W / 2, tl + 3, 0], [curve + W / 2, tl + L * 0.95, 0]);
}

export default [
  weapon('bat-nails-tape', 'Nail bat, blue tape', { blood: 0.25 }, (k) => {
    bat(k, { stain: WOOD.red, blood: 0.2, gripCol: C.black });
    wrap(k, 52, 58, 3.05, 3.05, ['tape', C.blue], { band: 2.4, tilt: 12, blood: 0.15 });
    wrap(k, 66, 73, 3.38, 3.38, ['tape', C.blue], { band: 2.4, tilt: -10, tail: true });
    nails(k, 26, 44, 82, 3.1, { len: 9, blood: 0.3 });
  }),

  weapon('bat-saw-blade', 'Bat with saw blade', { blood: 0.2 }, (k) => {
    bat(k, { stain: WOOD.red, blood: 0.15, grip: false });
    wrap(k, 4, 24, 1.3, 1.3, ['tape', C.tape], { band: 2.2, tilt: 8, grime: 0.5 });
    const D = sawDisc(11.4, 28, 1.3);
    k.add(G.blade(D.pts, { d: 0.2, b: 0.02, edge: D.edge, grind: 1.2, thin: 0.3, holes: [circle(0, 0, 1.6, 16, true)] }), 'steel_rusty', { p: [-7.2, 61, -2.2], r: [0, 0, 7], wear: 0.25, blood: 0.3, grain: 'x' });
    k.add(G.cyl(3.4, 3.4, 0.35, 24, 0.08), 'steel_dark', { p: [-7.2, 61, -2.0], r: [90, 0, 0] });
    bolt(k, -7.2, 61, -1.5, { r: 0.75 });
    for (const y of [55, 67]) k.add(G.box(10.5, 1.8, 0.4, 0.1), 'steel_worn', { p: [-2.6, y, 2.6], wear: 0.4 });
    for (const y of [55, 67]) for (const x of [-4.2, 2.6]) bolt(k, x, y, 2.95, { r: 0.45 });
    nails(k, 14, 44, 82, 3.1, { len: 7, blood: 0.2 });
  }),

  weapon('bat-wire', 'Wire-wrapped bat', { blood: 0.1 }, (k) => {
    bat(k, { stain: [1.05, 0.6, 0.45], gripCol: 0x24252a });
    barbedWire(k, 52, 81, (t) => 2.7 + 0.65 * Math.sin(Math.min(1, t * 1.4) * Math.PI / 2), { turns: 8, blood: 0.15 });
  }),

  weapon('sledgehammer-tape', 'Taped sledgehammer', { hands: 2, blood: 0.12 }, (k) => {
    shaft(k, 70, 1.75, 1.35, { stain: WOOD.walnut });
    for (const [a, b] of [[4, 18], [24, 40]]) wrap(k, a, b, 1.72, 1.35, ['tape', C.tape], { band: 2.4, tilt: 9, grime: 0.6, blood: 0.15 });
    const head = G.box(18, 9.2, 8.2, 1.0); k.add(head, 'steel_dark', { p: [0, 73.5, 0], wear: 0.6, grain: 'x', blood: 0.1 });
    for (const s of [-1, 1]) k.add(G.box(1.4, 9.6, 8.6, 0.5), 'steel_worn', { p: [s * 8.6, 73.5, 0], wear: 0.5 });
    k.add(G.box(3.8, 2.2, 3.0, 0.3), 'steel_worn', { p: [0, 79.2, 0] });                     // wedge end of the handle
    wrap(k, 70.5, 76.5, 4.0, 4.6, ['tape', C.blue], { band: 2.6, tilt: 70, t: 0.08, tail: true });
    nails(k, 6, 70, 77, 4.2, { len: 6, out: 0.5 });
    k.grip([0, 12, 0]); k.grip2([0, 40, 0]); k.tip([0, 78, 0]);
  }),

  weapon('gear-hammer', 'Welded gear hammer', { hands: 2, blood: 0.12 }, (k) => {
    shaft(k, 70, 1.8, 1.4, { stain: WOOD.dark });
    wrap(k, 18, 50, 1.78, 1.4, ['tape', C.tape], { band: 2.4, tilt: 9, grime: 0.6, blood: 0.2 });
    k.add(G.box(20, 15, 8, 0.8), 'steel_rusty', { p: [0, 77, 0], wear: 0.5, blood: 0.1 });
    k.add(G.box(20.6, 2.6, 8.6, 0.5), 'steel_dark', { p: [0, 85.5, 0], wear: 0.4 });
    k.add(G.box(4.2, 9, 4, 0.5), 'steel_dark', { p: [0, 67, 0], wear: 0.4 });
    k.add(G.extrude(gearOutline(3.6, 12, 0.9), 0.9, 0.12, [circle(0, 0, 1.0, 12, true)]), 'steel_worn', { p: [-4, 77, 4.3], wear: 0.4 });
    k.add(G.box(7.5, 9, 0.8, 0.2), ['paint_worn', 0x7a2e22], { p: [5, 77.5, 4.2], wear: 0.3, blood: 0.25 });
    for (const [x, y] of [[2.2, 81], [8, 81], [2.2, 74], [8, 74]]) bolt(k, x, y, 4.75, { r: 0.4 });
    k.add(G.box(2.2, 13, 2.2, 0.3), 'steel_worn', { p: [10.6, 77, 0], wear: 0.4 });            // welded side lug
    k.add(G.box(2.2, 2.2, 6, 0.3), 'steel_worn', { p: [11.5, 82.5, 0] });
    k.grip([0, 10, 0]); k.grip2([0, 40, 0]); k.tip([0, 87, 0]);
  }),

  weapon('pipe-wrench-club', 'Pipe elbow club', { blood: 0.06 }, (k) => {
    pipe(k, 60, 1.7, { mat: ['paint_worn', 0x5d7482] });
    k.add(G.cyl(2.1, 2.1, 2.6, 20, 0.2), 'steel_dark', { p: [0, 57.5, 0], wear: 0.4 });          // coupling
    const el = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI / 2; el.push([-3.6 + Math.cos(a) * 3.6, 60 + Math.sin(a) * 3.6, 0]); }
    k.add(G.tube(el, 1.75, 16), ['paint_worn', 0xb8bec4], { wear: 0.3 });
    pipe(k, 3.5, 1.7, { mat: ['paint_worn', 0xb8bec4], p: [-3.6, 63.6, 0], r: [0, 0, 90] });
    k.add(G.cyl(2.0, 2.0, 1.4, 20, 0.2), 'steel_dark', { p: [-7.2, 63.6, 0], r: [0, 0, 90] });
    wrap(k, 14, 34, 1.72, 1.72, ['rope'], { band: 0.7, tilt: 4, t: 0.18, over: 0.0, col: [0.75, 0.58, 0.42] });
    k.add(G.cyl(0.55, 0.55, 6, 10, 0.1), ['paint_worn', C.red], { p: [1.6, 50, 0], r: [0, 0, -100] });
    k.add(G.box(1.2, 4.5, 1.0, 0.3), ['paint_worn', C.red], { p: [7.8, 48.6, 0], r: [0, 0, -15] });
    k.grip([0, 24, 0]); k.grip2([0, 8, 0]); k.tip([-8, 63.6, 0]);
  }),

  weapon('valve-mace', 'Valve-wheel pipe mace', { blood: 0.15 }, (k) => {
    pipe(k, 54, 1.7, { mat: ['paint_worn', 0x5d7482] });
    wrap(k, 4, 30, 1.72, 1.72, ['tape', C.tape], { band: 2.3, tilt: 9, grime: 0.6, blood: 0.2 });
    k.add(G.cyl(2.6, 2.6, 7, 20, 0.3), 'steel_dark', { p: [0, 51, 0], wear: 0.4 });                // tee body
    k.add(G.cyl(2.3, 2.3, 14, 20, 0.3), 'steel_worn', { p: [7, 55, 0], r: [0, 0, 90], wear: 0.4, blood: 0.15 });
    for (const s of [-1, 1]) k.add(G.cyl(2.7, 2.7, 1.6, 6, 0.2), 'steel_dark', { p: [s * 7.8, 55, 0], r: [0, 0, s * 90] });
    k.add(G.cyl(2.5, 2.5, 1.6, 20, 0.3), ['paint_worn', C.orange], { p: [7.5, 55, 0], r: [0, 0, 90] });
    k.add(G.cyl(1.0, 1.0, 5, 12, 0.1), 'steel_satin', { p: [0, 58, 0] });
    valveWheel(k, 4.2, { p: [0, 63, 0], blood: 0.2 });
    k.add(G.cyl(0.6, 0.6, 12, 10, 0.1), ['paint_worn', C.red], { p: [2.2, 47, 0], r: [0, 0, -150] });
    k.add(G.box(1.4, 3.4, 1.2, 0.4), ['paint_worn', C.red], { p: [6.6, 37.5, 0] });
    k.grip([0, 16, 0]); k.grip2([0, 5, 0]); k.tip([0, 64, 0]);
  }),

  weapon('katana-red', 'Katana (red wrap, bloody)', { hands: 2, blood: 0.45 }, (k) => katana(k, { wrap: C.red, curve: 2.6, L: 70, W: 3.2, blood: 0.45 })),
  weapon('katana-dark', 'Katana (dark)', { hands: 2, blood: 0.08 }, (k) => katana(k, { wrap: 0x2a2c33, curve: 1.0, L: 72, W: 3.0, blood: 0.08 })),
  weapon('katana-hook', 'Katana (hook guard)', { hands: 2, blood: 0.35 }, (k) => katana(k, { wrap: 0x30323a, curve: 2.0, L: 80, W: 2.8, hook: true, tsubaR: 2.4, blood: 0.35 })),

  weapon('saw-axe', 'Saw-blade axe', { hands: 2, blood: 0.12 }, (k) => {
    shaft(k, 66, 1.75, 1.35, { stain: WOOD.dark });
    wrap(k, 14, 30, 1.72, 1.35, ['tape', C.tape], { band: 2.4, tilt: 9, grime: 0.6 });
    wrap(k, 34, 52, 1.72, 1.35, ['fabric', 0x26272b], { band: 2.0, tilt: 12 });
    const D = sawDisc(10.5, 22, 1.6);
    k.add(G.blade(D.pts, { d: 0.32, b: 0.03, edge: D.edge, grind: 1.6, thin: 0.3, holes: [circle(0, 0, 4.2, 20, true), circle(5.6, 3.2, 1.3, 10, true), circle(-5.6, 3.2, 1.3, 10, true)] }), 'steel_rusty', { p: [3, 69, 0], wear: 0.3, blood: 0.3, grain: 'x' });
    k.add(G.box(5, 8, 3.4, 0.5), 'steel_dark', { p: [0, 64, 0], wear: 0.4 });
    barbedWire(k, 56, 74, () => 2.1, { turns: 5 });
    for (const [x, y] of [[0, 61], [0, 67]]) bolt(k, x, y, 1.9, { r: 0.45 });
    k.grip([0, 10, 0]); k.grip2([0, 34, 0]); k.tip([3, 81, 0]);
  }),

  weapon('fire-axe', 'Fire axe', { hands: 2, blood: 0.1 }, (k) => {
    shaft(k, 74, 1.75, 1.3, { stain: WOOD.dark });
    for (const [a, b] of [[14, 22], [38, 48]]) wrap(k, a, b, 1.72, 1.3, ['tape', C.green], { band: 2.2, tilt: 10 });
    // head: blade on +X with a flared bit, pick-shaped poll painted red
    const blade = [[-2.6, 64], [2, 63.5], [5, 61], [9.5, 57.5], [12.8, 58.5], [13.4, 70], [12.6, 82], [9.2, 83.5], [5, 80.5], [2, 78.5], [-2.6, 78]];
    axeHead(k, blade, { d: 2.4, edgeX: 12, grind: 5.5, blood: 0.2 });
    const poll = [[-2.4, 66], [-6, 69.5], [-11, 71.5], [-11.6, 72.6], [-6, 74], [-2.4, 76.5]];
    k.add(G.blade(poll, { d: 2.0, b: 0.25, edge: [[2, 3]], grind: 3, thin: 0.25 }), ['paint_worn', 0xa3251d], { wear: 0.3 });
    k.add(G.box(5.4, 15.6, 3.2, 0.6), ['paint_worn', 0xa3251d], { p: [0, 71, 0], wear: 0.3 });
    k.grip([0, 12, 0]); k.grip2([0, 42, 0]); k.tip([13.4, 70, 0]); k.edge([12.8, 58.5, 0], [12.6, 82, 0]);
  }),

  weapon('pickaxe-rust', 'Pickaxe', { hands: 2, blood: 0.06 }, (k) => {
    shaft(k, 80, 2.1, 1.6, { stain: WOOD.black, grime: 0.4 });
    k.add(G.lathe([[0, 0], [2.6, 0], [2.9, 1.2], [2.5, 3.5], [2.15, 6], [0, 6]], 18), ['rubber'], { s: [1, 1, 0.78] });
    k.add(G.lathe([[0, 0], [2.4, 0], [2.6, 1], [2.3, 4.5], [0, 4.5]], 18), 'wood', { col: [1.1, 0.55, 0.35], s: [1, 1, 0.8] });
    // pick head: curved bar tapering to a point on one end and a chisel on the other
    const top = [], low = [], n = 16;
    for (let i = 0; i <= n; i++) { const x = -34 + 68 * i / n, a = Math.abs(x) / 34; top.push([x, 78 - 9 * a * a]); low.push([x, 78 - 9 * a * a - (4.4 * (1 - Math.pow(a, 1.15)) + 0.4)]); }
    const pts = [...top, ...low.reverse()];
    const g = G.blade(pts, { d: 3.0, b: 0.3, edge: edgeRuns(pts, (p) => Math.abs(p[0]) > 26), grind: 9, thin: 0.15 });
    k.add(g, 'steel_rusty', { wear: 0.4, grain: 'x', blood: 0.08 });
    k.add(G.box(7.6, 9, 5.2, 0.8), 'steel_rusty', { p: [0, 75, 0], wear: 0.5 });
    k.grip([0, 10, 0]); k.grip2([0, 45, 0]); k.tip([-34, 69, 0]);
  }),

  weapon('wrench-giant', 'Giant adjustable wrench', { hands: 2, blood: 0.1 }, (k) => {
    // forged I-beam handle, ring end, worm screw, fixed + sliding jaw (red-painted tips)
    const hand = roundPoly([[-2.2, 6], [2.2, 6], [2.7, 52], [-2.7, 52]], 0.8, 2);
    k.add(G.extrude(hand, 2.2, 0.5), 'steel_satin', { wear: 0.4 });
    k.add(G.extrude(hand.map(([x, y]) => [x * 0.55, y]), 2.5, 0.2), 'steel_satin', { wear: 0.3 });
    k.add(G.ringPoly(4.6, 2.0, 2.2, 28, 0.5), 'steel_satin', { p: [0, 3.4, 0], wear: 0.4 });
    k.add(G.extrude(circle(0, 0, 1.7, 6, true).map(([x, y]) => [x, y]), 2.3, 0.1), 'steel_dark', { p: [0, 3.4, 0] });
    wrap(k, 16, 40, 2.75, 1.25, ['tape', C.blue], { band: 2.4, tilt: 10, blood: 0.1 });
    const jaw = [[-5.4, 52], [5.4, 52], [6.8, 57], [7.2, 63], [8.8, 72], [6.4, 80], [3.4, 82.5], [2.6, 77], [2.6, 66], [-2.6, 66], [-2.6, 77], [-3.4, 82.5], [-6.4, 80], [-8.8, 72], [-7.2, 63], [-6.8, 57]];
    k.add(G.extrude(roundPoly(jaw, 0.6, 2), 2.6, 0.45), 'steel_satin', { wear: 0.4, blood: 0.15 });
    k.add(G.cyl(2.2, 2.2, 3.0, 16, 0.2), 'steel_dark', { p: [0, 57.2, -1.5], r: [90, 0, 0] });
    for (let i = 0; i < 7; i++) k.add(G.torus(2.25, 0.18, 16, 5), 'steel_dark', { p: [0, 57.2, -1.2 + i * 0.4], r: [0, 0, 0] });
    for (const s of [-1, 1]) k.add(G.box(2.6, 4.4, 2.75, 0.35), ['paint_worn', C.red], { p: [s * 5.2, 79.8, 0], r: [0, 0, -s * 14], wear: 0.3 });
    k.grip([0, 28, 0]); k.grip2([0, 12, 0]); k.tip([0, 82.5, 0]);
  }),

  weapon('chainsaw-sword', 'Chainsaw sword', { hands: 2, blood: 0.12 }, (k) => {
    // rubber grip at the bottom, bar with a rounded nose, cutter chain round it, painted motor housing on top (as drawn)
    k.add(G.lathe([[0, 0], [2.1, 0], [2.3, 0.6], [2.0, 2.5], [2.2, 14], [2.4, 18.5], [0, 18.5]], 18), ['rubber'], {});
    k.add(G.cyl(2.6, 2.6, 3.4, 18, 0.3), 'steel_dark', { p: [0, 18, 0], wear: 0.4 });
    const bar = roundPoly([[-3.0, 20], [3.0, 20], [3.0, 80], [-3.0, 80]], 2.9, 6);
    k.add(G.extrude(bar, 0.5, 0.1), 'steel_dark', { wear: 0.4, blood: 0.1 });
    k.add(G.extrude(bar.map(([x, y]) => [x * 0.72, 20 + (y - 20) * 0.99 + 0.3]), 0.56, 0.05), 'steel_satin', {});
    const tooth = [[-0.15, -0.5], [0.85, -0.3], [0.9, 0.35], [-0.15, 0.55]];
    for (let y = 23; y < 79; y += 1.25) for (const x of [3.3, -3.3]) k.add(G.extrude(tooth, 0.62, 0.05), 'steel_worn', { p: [x, y, 0], r: [0, x < 0 ? 180 : 0, 0], wear: 0.3, blood: 0.25 });
    for (let i = 0; i <= 6; i++) { const a = Math.PI + i / 6 * Math.PI; k.add(G.box(0.9, 0.9, 0.62, 0.1), 'steel_worn', { p: [Math.cos(a) * 3.3, 23 + Math.sin(a) * 3.3, 0], r: [0, 0, a * 57.3] }); }
    const house = roundPoly([[-6.2, 0], [5.4, 0], [6.6, 4], [6.6, 20], [3.8, 23], [-5.0, 23], [-6.8, 18], [-6.8, 4]], 2.2, 4);
    k.add(G.extrude(house, 7.4, 1.6), ['paint_worn', 0x2c7a52], { p: [0, 76, 0], wear: 0.4, blood: 0.25 });
    for (let i = 0; i < 5; i++) k.add(G.box(0.4, 7, 7.6, 0.15), ['plastic', 0x1c1d20], { p: [-2.5 + i * 1.3, 88, 0] });
    k.add(G.box(2.2, 2.2, 8, 0.5), ['plastic', C.blue], { p: [-6.6, 80, 0], wear: 0.3 });
    k.add(G.cyl(1.2, 1.2, 2.2, 12, 0.2), ['rubber'], { p: [0, 99, 0] });
    k.grip([0, 8, 0]); k.grip2([0, 15, 0]); k.tip([0, 99, 0]); k.edge([3.3, 24, 0], [3.3, 78, 0]);
  }),

  ladderSaw(),
];
