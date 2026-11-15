// Combat sheet row 1 (cells 01-16): cleaver saw, pruning saw, sickle, knives, tenderiser, cleavers, throwing knives.
import { weapon } from '../js/weapon.js';
import { G, C, WOOD, knife, knifeOutline, slabHandle, roundHandle, wrap, edgeRuns, arc, teeth, roundPoly, mv } from './common.js';
import { thrower } from './traced.js';

export default [
  weapon('cleaver-saw', 'Cleaver saw', { rot: -55, blood: 0.15 }, (k) => {
    // rubberised handle + knuckle ring, heavy cleaver with a saw-toothed spine
    roundHandle(k, { hl: 11, r0: 1.25, r1: 1.35, mat: ['rubber'] });
    wrap(k, 1.5, 10, 1.3, 1.3, ['tape', C.black], { band: 1.5, tilt: 8 });
    k.add(G.cyl(1.55, 1.55, 1.2, 18, 0.2), 'steel_worn', { p: [0, -0.9, 0], wear: 0.4 });
    k.add(G.ringPoly(2.9, 1.7, 1.1, 10, 0.25, 0.3), 'steel_worn', { p: [-3.9, 11.6, 0], wear: 0.4 });
    k.add(G.box(7.6, 1.5, 2.2, 0.35), 'steel_worn', { p: [0, 11.4, 0], wear: 0.4 });
    const spine = teeth([-9.5, 46], [-9.5, 14.5], 14, 0.9, 0.3);
    const pts = [[-3.2, 12.2], [3.2, 12.2], [3.6, 15], [9.6, 17.5], [9.6, 40], [8.4, 44], [-9.5, 48], ...spine.slice(1), [-3.6, 14]];
    k.add(G.blade(pts, { d: 0.45, b: 0.05, edge: edgeRuns(pts, (p) => p[0] > 9 && p[1] < 41), grind: 3.2, thin: 0.12 }), 'steel', { blood: 0.15, wear: 0.15 });
    for (const y of [4, 8]) k.add(G.cyl(0.25, 0.25, 2.8, 10, 0.05), 'steel_satin', { p: [0, y, -1.4], r: [90, 0, 0] });
    k.grip([0, 5, 0]); k.tip([-9.5, 48, 0]); k.edge([9.6, 17.5, 0], [9.6, 40, 0]);
  }),

  weapon('pruning-saw', 'Pruning saw', { rot: -50 }, (k) => {
    // moulded pistol grip (blue rubber over black core), straight blade, impulse-hardened teeth
    const grip = roundPoly([[-2.4, 0], [2.8, 0], [3.4, 3.2], [2.4, 6], [3.2, 9.5], [2.2, 13.5], [0.6, 16], [-2.1, 15.2], [-2.8, 10], [-2.6, 4]], 1.0, 3);
    k.add(G.extrude(grip, 2.8, 0.9), ['rubber'], { col: [0.45, 0.6, 1.8] });
    k.add(G.extrude(mv(grip.map(([x, y]) => [x * 0.82, y * 0.96]), 0.2, 0.5), 3.0, 0.5), ['plastic', C.blue], {});
    k.add(G.box(2.6, 2.4, 1.6, 0.3), 'steel_dark', { p: [0.3, 16.4, 0], wear: 0.4 });
    for (const y of [11.5, 15]) k.add(G.cyl(0.32, 0.32, 3.2, 10, 0.06), 'steel_satin', { p: [0.4, y, -1.6], r: [90, 0, 0] });
    const pts = [[-1.4, 15], [1.1, 15], ...teeth([2.4, 17], [3.0, 45.5], 34, 0.55, 0.3).slice(1), [2.2, 47], [-1.0, 46.5]];
    k.add(G.blade(pts, { d: 0.12, b: 0.02 }), 'steel', { wear: 0.2 });
    k.add(G.blade(pts.slice(0, 2).concat([[2.6, 46], [-1, 46.5]]), { d: 0.13, b: 0.02 }), 'steel_dark', { p: [0, 0, 0] });
    k.grip([0.3, 7, 0]); k.tip([1, 46.5, 0]); k.edge([2.4, 17, 0], [3, 45.5, 0]);
  }),

  weapon('sickle', 'Sickle', { rot: 0 }, (k) => {
    k.add(G.lathe([[0, 0], [1.3, 0], [1.55, 0.6], [1.45, 3], [1.35, 9], [1.45, 13.5], [1.2, 14.2], [0, 14.2]], 18), 'wood', { col: WOOD.red, grain: 'y', wear: 0.05, grime: 0.3 });
    k.add(G.cyl(1.25, 1.1, 2.4, 16, 0.1), 'steel_rusty', { p: [0, 13.6, 0], wear: 0.4 });
    // thin crescent: concentric outer/inner arcs, 1.3 cm deep at the root tapering to a fine point; edge inside
    const cx = 0.9, cy = 22.4, R = 5.8, out = [], inn = [], n = 40;
    for (let i = 0; i <= n; i++) { const t = i / n, a = (262 - 245 * t) * Math.PI / 180; out.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
    for (let i = n; i >= 0; i--) { const t = i / n, a = (262 - 245 * t) * Math.PI / 180, w = 1.7 * Math.pow(1 - t, 0.7) * (0.75 + 0.25 * Math.sin(Math.min(1, t * 3) * Math.PI / 2)) + 0.06; inn.push([cx + Math.cos(a) * (R - w), cy + Math.sin(a) * (R - w)]); }
    const pts = [[0.55, 15.5], [-0.55, 15.5], ...out, ...inn.slice(1)];
    const tipI = 2 + n;
    k.add(G.box(0.9, 2.6, 0.3, 0.1), 'steel_rusty', { p: [0.25, 16.6, 0], r: [0, 0, -6], wear: 0.2 });
    k.add(G.blade(pts, { d: 0.22, b: 0.03, edge: [[tipI, pts.length - 1]], grind: 0.35, thin: 0.45 }), 'steel_rusty', { wear: 0.2, grain: 'x' });
    k.grip([0, 7, 0]); k.tip([pts[tipI][0], pts[tipI][1], 0]); k.edge([2, 17, 0], [9.5, 19, 0]);
  }),

  weapon('utility-knife-red', 'Red utility knife', { rot: 0 }, (k) => {
    // slim snap-off box cutter: ABS body 1.8 x 1.15 cm, steel slider channel, segmented 1.3 cm blade
    const body = roundPoly([[-0.85, 0], [0.85, 0], [0.92, 13.5], [-0.82, 13.5]], 0.4, 3);
    k.add(G.extrude(body, 1.15, 0.35), ['plastic', C.red], { wear: 0.1 });
    k.add(G.box(1.85, 1.3, 1.25, 0.3), ['rubber'], { p: [0, 0.45, 0] });
    k.add(G.box(0.3, 8, 1.2, 0.1), 'steel_satin', { p: [-0.78, 8, 0] });
    k.add(G.box(0.55, 1.2, 0.45, 0.15), ['plastic', C.black], { p: [-0.95, 9, 0] });
    const pts = [[-0.65, 13.4], [0.68, 13.4], [0.68, 17.2], [-0.65, 19.4]];
    k.add(G.blade(pts, { d: 0.05, b: 0.01, edge: [[1, 2]], grind: 0.5 }), 'steel', {});
    for (let i = 0; i < 4; i++) k.add(G.box(1.4, 0.03, 0.06, 0.01), 'steel_dark', { p: [0, 14.2 + i * 1.2, 0], r: [0, 0, -34] });
    k.grip([0, 6, 0]); k.tip([-0.65, 19.4, 0]); k.edge([0.68, 13.4, 0], [0.68, 17.2, 0]);
  }),

  weapon('kitchen-knife', 'Kitchen knife', { rot: 0 }, (k) => knife(k, { hl: 10.5, hw: 2.4, hd: 1.6, L: 17, W: 3.6, tip: 'drop', rivets: [2.5, 8.2], pommel: true, bands: [{ y: 5.2, h: 1.6, col: C.red }] })),

  weapon('dagger', 'Dagger', { rot: 0 }, (k) => {
    knife(k, { hl: 10, hw: 2.3, handle: 'round', L: 16, W: 2.8, bd: 0.5, tip: 'spear', guard: true, guardW: 2.8, pommel: true, grind: 1.25 });
    k.add(G.cyl(0.42, 0.42, 0.3, 5, 0.03), ['paint', C.red], { p: [0, 5.5, 1.08], r: [90, 0, 0] });
    k.add(G.box(0.18, 13, 0.55, 0.06), 'steel_satin', { p: [0, 10.6 + 7, 0] });
  }),

  weapon('knife-green', 'Green-wrapped knife', { rot: 0, blood: 0.06 }, (k) => knife(k, { hl: 9.5, hw: 2.3, hd: 1.7, L: 14, W: 3.2, tip: 'clip', swedge: true, guard: true, guardW: 1.2, rivets: [1.3, 8.4], wrap: { y0: 2, y1: 7.6, col: C.green, band: 1.2, mat: ['fabric', C.green] } })),

  weapon('meat-tenderiser', 'Meat tenderiser', { rot: 0 }, (k) => {
    // small kitchen tenderiser: 19 cm cast handle, 8.6 cm head with a chopping wedge and a 4x3 spiked face
    k.add(G.lathe([[0, 0], [0.95, 0], [1.05, 0.4], [0.8, 1.3], [0.72, 11], [0.58, 17.5], [0.55, 19], [0, 19]], 16), 'steel_satin', { grain: 'y', wear: 0.2 });
    k.add(G.pipe(0.38, 0.8, 0.14, 12), 'steel_satin', { p: [0, 1.4, -0.4], r: [90, 0, 0] });
    k.add(G.blade([[-1.0, 19.6], [-3.9, 19.0], [-4.4, 20.9], [-3.9, 22.8], [-1.0, 22.2]], { d: 2.2, b: 0.15, edge: [[1, 3]], grind: 2.2, thin: 0.15 }), 'steel_satin', { wear: 0.3, grain: 'x', blood: 0.08 });
    k.add(G.box(5.0, 2.8, 2.4, 0.35), 'steel_satin', { p: [1.3, 20.9, 0], wear: 0.3, grain: 'x', blood: 0.08 });
    k.add(G.box(2.0, 2.6, 2.1, 0.35), 'steel_satin', { p: [0, 19.4, 0], wear: 0.3 });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) k.add(G.cone(0.42, 0.55, 4), 'steel_satin', { p: [3.8, 20.05 + i * 0.85, -0.85 + j * 0.85], r: [45, 0, -90], blood: 0.12 });
    k.grip([0, 8, 0]); k.tip([0, 22.3, 0]);
  }),

  weapon('boning-knife-teal', 'Teal boning knife', { rot: 0 }, (k) => knife(k, { hl: 10, hw: 2.3, hd: 1.7, L: 14, W: 2.6, tip: 'point', hmat: ['polymer', C.teal], rivets: [2.6, 7.2] })),
  weapon('chef-knife', 'Chef knife', { rot: 0 }, (k) => knife(k, { hl: 11, hw: 2.4, hd: 1.7, L: 20, W: 4.4, tip: 'drop', rivets: [2.4, 5.5, 8.6], bd: 0.25 })),

  weapon('big-cleaver', 'Big cleaver', { rot: 0, blood: 0.05 }, (k) => {
    const pts = [[-6.4, 0.4], [-1.1, 0], [1.1, 0], [6.4, 0.4], [6.4, 20.6], [5.4, 22.4], [-6.4, 22.4]];
    knife(k, { hl: 11, hw: 2.6, hd: 1.8, pts, edge: [[3, 4]], tipPt: [6.4, 22.4], W: 12.8, bd: 0.55, rivets: [2.4, 5.6, 8.8], grind: 4.5, holes: [arc(-4.3, 19.6, 0.75, 360, 0, 14).slice(0, -1)] });
  }),

  weapon('fillet-knife', 'Fillet knife', { rot: 0 }, (k) => knife(k, { hl: 10, hw: 2.2, hd: 1.6, L: 21, W: 2.4, tip: 'point', bd: 0.18, rivets: [2.5, 7.4], bands: [{ y: 5, h: 1.2, mat: 'steel_satin' }] })),

  weapon('boning-knife-long', 'Long boning knife', { rot: 0 }, (k) => knife(k, { hl: 10, hw: 2.2, hd: 1.7, L: 25, W: 2.3, tip: 'clip', clip: 0.82, bd: 0.22, hmat: 'wood', hvcol: WOOD.walnut, bolster: false, guard: true, guardW: 0.6, rivets: [2.5, 7.4], bands: [{ y: 9.6, h: 1.3, col: C.black }] })),

  thrower('thrower-slim', 'Throwing knife (slim)'),
  thrower('thrower-slot', 'Throwing knife (slot)'),
  thrower('thrower-hex', 'Throwing knife (hex)'),
];
