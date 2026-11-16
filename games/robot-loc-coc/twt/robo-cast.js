// Robot cast for twt (The Walking Trade, procedural): every human role becomes a worker robot and every zombie kind a
// broken hostile robot, in the style of the bot-crew kit (../js: rigid bevelled parts, joints with gaps, springy
// antennae, screen / lens faces drawn in the shader, chipped paint, screws, numbers). Original designs.
//
// A look is a plain spec (parts, palette, props, damage). buildProto(spec) merges the whole robot into ONE indexed
// geometry: every vertex carries aBone (rigid bone index, robo-rig.js B) and aReg (palette slot, RX below); positions
// stay in each bone's local frame, so the bone matrix places the part and the shader can paint the face / decal / wear
// in part space. One proto per look key; instances share it (robo-crowd.js draws each proto with one instanced call).
import * as THREE from '../vendor/three.module.min.js';
import { R, tag, place, merge, rbox, fillet, lathe, cyl, sph, tor, cone, caps, bcyl, screw, coil, setDetail } from './robo-geo.js';
import { torso as torsoPart, pelvis as pelvisPart, head as headPart, ears as earsPart, antenna as antPart, hand as handPart, foot as footPart, limbSeg, joint, crateGeo, TORSO_KEYS, HEAD_KEYS } from './robo-parts.js';
import { hatGeo, hatDef } from './robo-hats.js';
import { B, NB } from './robo-rig.js';

setDetail(0.55); // crowd detail: about half the segments of the crew page

// palette slots: robo-geo R (0..10) plus props, wires, hat colours and the work uniform
export const RX = Object.assign({}, R, { WOOD: 11, WOOD2: 12, HAZ: 13, WIRE: 14, WIRE2: 15, HA: 16, HB: 17, HC: 18, UNI: 19 });
export const NPAL = 20;
const P = Math.PI;
const prof = (pts, seg = 4) => fillet(pts, seg);

export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
export const mix32 = (a) => { a = Math.imul(a ^ (a >>> 16), 0x45d9f3b); a = Math.imul(a ^ (a >>> 16), 0x45d9f3b); return (a ^ (a >>> 16)) >>> 0; };
const pick = (r, a) => a[Math.floor(r() * a.length)];

// colour schemes (from ../js/crew.js): A main, B secondary, C accent, glow, eye, dark metal
export const SCHEMES = [
  { vi: 'Cà chua kem', A: 0xd9483b, B: 0xf1e3c6, C: 0x2f4858, glow: 0xffb347, eye: 0x9dffb0, dark: 0x30302f },
  { vi: 'Bạc hà than', A: 0x7fd1b9, B: 0x3a3f44, C: 0xff6f59, glow: 0x7cf7ff, eye: 0x8ff7ff, dark: 0x2c2f33 },
  { vi: 'Mù tạt xanh đêm', A: 0xe3b23c, B: 0x24366b, C: 0xffffff, glow: 0xffe08a, eye: 0xfff07a, dark: 0x2a2c33 },
  { vi: 'Trời trong', A: 0x7ab8e8, B: 0xf3f1ea, C: 0xf25c54, glow: 0x9fe3ff, eye: 0xbaf2ff, dark: 0x30343a },
  { vi: 'Tím bơ', A: 0xb69de0, B: 0xf8e79a, C: 0x463a6b, glow: 0xffd6ff, eye: 0xffc8ff, dark: 0x2e2a35 },
  { vi: 'Cam mòng két', A: 0xf28c38, B: 0x1f6f78, C: 0xfff3d6, glow: 0x6fffe9, eye: 0x7dffe1, dark: 0x2b2d30 },
  { vi: 'Hồng bạc hà', A: 0xf4a6b8, B: 0x9be3c8, C: 0x5a3d55, glow: 0xff9ecf, eye: 0xb2ffdf, dark: 0x332c31 },
  { vi: 'Rừng cát', A: 0x4f7d4a, B: 0xd9c49b, C: 0xffd23f, glow: 0xc7ff6b, eye: 0xd4ff8a, dark: 0x2a2d28 },
  { vi: 'Lửa', A: 0xcc2936, B: 0xf6c12c, C: 0x1b1b1e, glow: 0xffa62b, eye: 0xffd36b, dark: 0x2c2929 },
  { vi: 'Lam cô-ban', A: 0x2c5cc5, B: 0xf09a3e, C: 0xffffff, glow: 0x7ab6ff, eye: 0x9cd3ff, dark: 0x262a33 },
  { vi: 'Than chanh', A: 0x4a4e57, B: 0xb5e33b, C: 0xffffff, glow: 0xc9ff4a, eye: 0xd8ff5c, dark: 0x25272b },
  { vi: 'Ngà san hô', A: 0xefe7d6, B: 0xf2786b, C: 0x3b4a6b, glow: 0xffa38f, eye: 0x88f0ff, dark: 0x34322f },
  { vi: 'Gỉ sét xô thơm', A: 0xb5532f, B: 0xa7b89a, C: 0xf5e6c8, glow: 0xffb27a, eye: 0xffcf8a, dark: 0x2f2a27 },
  { vi: 'Đen vàng', A: 0x24252a, B: 0xd8a62c, C: 0xf2f2f2, glow: 0xffd75e, eye: 0xffe27a, dark: 0x1c1d20 },
  { vi: 'Kẹo bông', A: 0xff8fc7, B: 0x8fd3ff, C: 0xffffff, glow: 0xfff07a, eye: 0xfff3a1, dark: 0x302c33 },
  { vi: 'Ô liu gạch', A: 0x7d7a3a, B: 0xb8492f, C: 0xf2e3bc, glow: 0xffc06b, eye: 0xc8ff9a, dark: 0x2b2a24 },
];
const hx = (h) => new THREE.Color(h);
function mixHex(a, b, t, k = 1) { const c = hx(a).lerp(hx(b), t).multiplyScalar(k); return c.getHex(); }
// full 20-slot palette
function palette(sch, o = {}) {
  const A = o.A ?? sch.A, Bc = o.B ?? sch.B;
  return [A, Bc, o.dark ?? sch.dark, o.chrome ?? 0xc6cad0, 0x0a0f13, 0x04060a, o.glow ?? sch.glow, 0x1c1c1f, o.white ?? 0xece7db, A, o.C ?? sch.C,
    o.wood ?? 0xb07a45, o.wood2 ?? 0x7e5230, o.haz ?? 0xe8b923, o.wire ?? 0xc8352a, o.wire2 ?? 0x2f6fd0, o.ha ?? 0xd64545, o.hb ?? 0xf2e6d0, o.hc ?? 0x2b3a55, o.uni ?? 0x2f8f5b];
}

/* ------------------------------------------------------------------ geometry helpers */
const cl = (g) => g.clone();
const at = (g, p, r = [0, 0, 0], s = 1) => place(g.clone(), p, r, s);
function remap(g, map) { g = g.clone(); const a = g.attributes.aReg.array; for (let i = 0; i < a.length; i++) { const k = Math.round(a[i]); if (map[k] !== undefined) a[i] = map[k]; } g.attributes.aReg.needsUpdate = true; return g; }
function scaleG(g, s) { g = g.clone(); g.scale(...(typeof s === 'number' ? [s, s, s] : s)); return g; }
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), u), L(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), u), v),
    L(L(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), u), L(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), u), v), w);
}
// push vertices inward where a noise field peaks: dents and crumples (normals kept: the shading stays readable)
function dent(g, seed, amt, freq = 14) {
  g = g.clone(); const p = g.attributes.position, n = g.attributes.normal, o = seed * 3.17;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), v = vnoise(x * freq + o, y * freq + o * 0.7, z * freq);
    const d = Math.max(0, v - 0.58) * amt * 2.4;
    if (d > 0) p.setXYZ(i, x - n.getX(i) * d, y - n.getY(i) * d, z - n.getZ(i) * d);
  }
  return g;
}
// sagging cable between two points
function wire(a, b, sag, r, reg, seg = 10) {
  const m = new THREE.Vector3().addVectors(new THREE.Vector3(...a), new THREE.Vector3(...b)).multiplyScalar(0.5); m.y -= sag;
  const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a), m, new THREE.Vector3(...b));
  return tag(new THREE.TubeGeometry(c, seg, r, 5, false), reg);
}
function wirePath(pts, r, reg, seg = 12) { return tag(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 5, false), reg); }
// a ring band around a lathe torso (work uniform, hi-vis vest, tool belt)
function band(r, y0, y1, sx, sz, reg, t = 0.012) { return lathe(prof([[r - t, y0, 0, reg], [r, y0 + 0.004, 0.004, reg], [r, y1 - 0.004, 0.004, reg], [r - t, y1, 0, reg]], 2), 30, sx, sz); }

/* ------------------------------------------------------------------ props (bone-local; grip at the origin) */
const PROP = new Map();
const memo = (k, f) => { if (!PROP.has(k)) PROP.set(k, f()); return PROP.get(k); };
// red plastic hand basket hanging under the grip, two items inside
function basketGeo() {
  return memo('basket', () => {
    const W = 0.2, H = 0.11, Dp = 0.14, y = -0.14, g = [], K = RX.WIRE;
    g.push(place(rbox(W, 0.012, Dp, 0.005, K), [0, y - H / 2, 0]));
    for (const s of [-1, 1]) { g.push(place(rbox(0.01, H, Dp, 0.004, K), [s * W / 2, y, 0]), place(rbox(W, H, 0.01, 0.004, K), [0, y, s * Dp / 2])); }
    for (const s of [-1, 1]) g.push(place(rbox(W + 0.012, 0.014, 0.014, 0.005, RX.DARK), [0, y + H / 2, s * Dp / 2]), place(rbox(0.014, 0.014, Dp + 0.012, 0.005, RX.DARK), [s * W / 2, y + H / 2, 0]));
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) g.push(place(rbox(W * 0.8, 0.008, 0.004, 0.002, RX.DARK), [0, y - 0.03 + i * 0.025, s * (Dp / 2 + 0.004)]));
    // handle: a hoop from rim to rim through the grip
    g.push(place(tor(0.105, 0.007, RX.DARK, 6, 18, P), [0, y + H / 2 + 0.0, 0], [0, 0, 0], [0.8, 1.0, 1]));
    // goods: a tin and a box
    g.push(place(bcyl(0.028, 0.07, 0.006, RX.CHROME, 14), [-0.05, y - 0.04, 0.0]), place(bcyl(0.029, 0.03, 0.004, RX.HAZ, 14), [-0.05, y - 0.02, 0.0]));
    g.push(place(rbox(0.06, 0.09, 0.05, 0.008, RX.WOOD), [0.045, y + 0.0, 0.01], [0, 0.3, 0.1]));
    return merge(g);
  });
}
function crateProp(big) { return memo('crate' + big, () => remap(crateGeo(big ? 0.34 : 0.3, big ? 0.24 : 0.22, big ? 0.28 : 0.24), { [R.A]: RX.WOOD, [R.B]: RX.WOOD2 })); }
// wooden bat along +y from the grip
function batGeo() {
  return memo('bat', () => merge([
    lathe(prof([[0, -0.05, 0, RX.RUBBER], [0.017, -0.05, 0.006, RX.RUBBER], [0.016, -0.04, 0, RX.RUBBER], [0.012, -0.035, 0, RX.RUBBER], [0.012, 0.07, 0, RX.RUBBER], [0.012, 0.075, 0, RX.WOOD], [0.016, 0.16, 0, RX.WOOD], [0.03, 0.34, 0.03, RX.WOOD], [0.031, 0.4, 0.02, RX.WOOD], [0, 0.415, 0, RX.WOOD]]), 14),
    place(bcyl(0.031, 0.012, 0.003, RX.WIRE, 14), [0, 0.3, 0]),
  ]));
}
// claw hammer along +y from the grip
function hammerGeo() {
  return memo('hammer', () => merge([
    place(rbox(0.026, 0.24, 0.02, 0.008, RX.WOOD), [0, 0.07, 0]), place(rbox(0.03, 0.09, 0.026, 0.01, RX.RUBBER), [0, -0.01, 0]),
    place(rbox(0.13, 0.04, 0.04, 0.01, RX.DARK), [0.01, 0.2, 0]), place(bcyl(0.024, 0.03, 0.005, RX.CHROME, 12), [0.075, 0.2, 0], [0, 0, -P / 2]),
    place(rbox(0.07, 0.02, 0.03, 0.008, RX.CHROME), [-0.075, 0.19, 0], [0, 0, -0.35]),
  ]));
}
// clipboard held flat in the hand
function clipboardGeo() {
  return memo('clip', () => merge([place(rbox(0.11, 0.15, 0.012, 0.006, RX.WOOD2), [0, 0, 0]), place(rbox(0.09, 0.12, 0.004, 0.002, RX.WHITE), [0, -0.005, 0.008]),
    place(rbox(0.04, 0.02, 0.016, 0.005, RX.CHROME), [0, 0.07, 0.006]), ...[0, 1, 2, 3].map((i) => place(rbox(0.06 - (i % 2) * 0.02, 0.005, 0.003, 0.001, RX.DARK), [-0.01, 0.03 - i * 0.022, 0.011]))]));
}
// chunk of torn concrete with rebar (Brute throw)
function chunkGeo() {
  return memo('chunk', () => merge([dent(rbox(0.3, 0.2, 0.24, 0.05, RX.WHITE), 7, 0.06, 9), place(cyl(0.008, 0.008, 0.2, RX.RUST ?? RX.DARK, 6), [0.06, 0.1, 0.05], [0.4, 0, 0.3]), place(cyl(0.008, 0.008, 0.22, RX.DARK, 6), [-0.05, 0.1, -0.03], [-0.3, 0, -0.5])]));
}

/* ------------------------------------------------------------------ custom torsos (same contract as robo-parts torso) */
function bigTorso(k, key) {
  return memo('bt' + key, () => {
    const D = RX.DECAL, g = [];
    const W = 0.5 * k, Hh = 0.42 * k, Dd = 0.32 * k;
    g.push(place(rbox(W, Hh, Dd, 0.07 * k, D), [0, 0.13 * k + Hh / 2, 0]));
    g.push(place(rbox(W * 0.62, 0.16 * k, Dd * 0.8, 0.04 * k, RX.DARK), [0, 0.09 * k, 0]));
    g.push(place(rbox(W * 0.7, 0.03 * k, Dd * 0.85, 0.012 * k, RX.B), [0, 0.165 * k, 0]));
    // hazard chevrons over the belly and a vent grille on the chest
    g.push(place(rbox(W * 0.66, 0.07 * k, 0.012, 0.01, RX.HAZ), [0, 0.2 * k, Dd / 2 + 0.002]));
    for (let i = -2; i <= 2; i++) g.push(place(rbox(0.025 * k, 0.085 * k, 0.006, 0.003, RX.C), [i * 0.06 * k, 0.2 * k, Dd / 2 + 0.008], [0, 0, 0.6]));
    for (let i = 0; i < 4; i++) g.push(place(rbox(0.16 * k, 0.012 * k, 0.008, 0.004, RX.DARK), [W * 0.18, 0.42 * k + i * 0.026 * k, Dd / 2 + 0.002]));
    for (const s of [-1, 1]) {
      g.push(place(rbox(0.18 * k, 0.13 * k, 0.24 * k, 0.045 * k, RX.B), [s * (W / 2 + 0.03 * k), 0.5 * k, 0], [0, 0, -s * 0.28]));
      g.push(screw([s * (W / 2 - 0.035 * k), 0.17 * k + Hh * 0.92, Dd / 2], 0.01 * k), screw([s * (W / 2 - 0.035 * k), 0.17 * k + 0.03, Dd / 2], 0.01 * k));
    }
    g.push(place(bcyl(0.05 * k, 0.04 * k, 0.01, RX.DARK, 14), [0, 0.13 * k + Hh, 0]));
    const top = 0.13 * k + Hh;
    return { geo: merge(g), h: top, w: W / 2, d: Dd / 2, sh: [W / 2 + 0.04 * k, top - 0.08 * k, 0], neck: top + 0.02 * k, decal: [-W * 0.22, 0.33 * k, 0.16 * k], round: false };
  });
}
function birtherTorso() {
  return memo('birther', () => {
    const D = RX.DECAL, g = [];
    g.push(lathe(prof([[0, 0, 0, RX.DARK], [0.13, 0, 0.02, RX.DARK], [0.16, 0.05, 0, RX.DARK], [0.16, 0.055, 0, D], [0.25, 0.2, 0.15, D], [0.24, 0.34, 0.1, D], [0.17, 0.46, 0.06, D], [0.16, 0.465, 0, RX.B], [0.15, 0.52, 0.04, RX.B], [0, 0.53, 0, RX.B]]), 30, 1, 0.92));
    // incubator window on the belly: dark glass with glowing pods behind cage bars
    g.push(place(sph(0.17, RX.SCREEN, 22, 14), [0, 0.22, 0.09], [0, 0, 0], [1, 0.85, 0.75]));
    const pods = [[0.06, 0.27, 0.19, 0.045], [-0.07, 0.25, 0.19, 0.04], [0.0, 0.17, 0.205, 0.05], [0.1, 0.18, 0.17, 0.035], [-0.11, 0.16, 0.17, 0.036], [-0.02, 0.32, 0.17, 0.032]];
    for (const [x, y, z, r] of pods) g.push(place(sph(r, RX.GLOW, 12, 8), [x, y, z]));
    for (let i = -3; i <= 3; i++) g.push(place(cyl(0.006, 0.006, 0.27, RX.CHROME, 6), [i * 0.045, 0.22, 0.225 - Math.abs(i) * 0.012]));
    g.push(place(tor(0.165, 0.012, RX.CHROME, 6, 26), [0, 0.22, 0.12], [0, 0, 0], [1, 0.9, 1]));
    for (const s of [-1, 1]) g.push(place(bcyl(0.03, 0.05, 0.008, RX.DARK, 12), [s * 0.12, 0.46, -0.08], [0.3, 0, 0]));
    return { geo: merge(g), h: 0.53, w: 0.25, d: 0.22, sh: [0.17, 0.44, 0], neck: 0.52, decal: [0.16, 0.36, 0.1], round: true };
  });
}
function boilerTorso() {
  return memo('boiler', () => {
    const D = RX.DECAL, K = RX.DARK, g = [];
    g.push(lathe(prof([[0, 0, 0, K], [0.24, 0, 0.03, K], [0.29, 0.06, 0, K], [0.29, 0.07, 0, D], [0.33, 0.24, 0.16, D], [0.3, 0.42, 0, D], [0.29, 0.43, 0, K], [0.26, 0.5, 0.05, K], [0, 0.52, 0, K]]), 34, 1, 0.92));
    for (let i = 0; i < 11; i++) { const a = -1.3 + i * 0.26; for (const y of [0.1, 0.4]) g.push(screw([Math.sin(a) * 0.31, y, Math.cos(a) * 0.29], 0.008, [Math.sin(a), 0, Math.cos(a)])); }
    // pressure gauge, steam stacks, a leaking pipe loop
    g.push(place(bcyl(0.05, 0.02, 0.006, RX.CHROME, 18), [0.12, 0.33, 0.27], [P / 2 - 0.3, 0, 0]), place(bcyl(0.042, 0.004, 0.002, RX.WHITE, 18), [0.12, 0.33, 0.27], [P / 2 - 0.3, 0, 0]).translate(0, 0.006, 0.019));
    for (const [x, z, h] of [[-0.12, -0.12, 0.16], [0.02, -0.18, 0.11]]) g.push(place(bcyl(0.035, h, 0.008, K, 14), [x, 0.48, z]), place(bcyl(0.045, 0.02, 0.006, RX.CHROME, 14), [x, 0.48 + h, z]));
    g.push(wirePath([[0.25, 0.15, 0.12], [0.33, 0.12, 0.0], [0.3, 0.3, -0.12], [0.2, 0.45, -0.1]], 0.016, RX.CHROME, 14));
    return { geo: merge(g), h: 0.52, w: 0.33, d: 0.3, sh: [0.29, 0.38, 0], neck: 0.5, decal: [-0.1, 0.24, 0.15], round: true };
  });
}
function buffTorso() {
  return memo('buff', () => {
    const g = [];
    g.push(place(rbox(0.34, 0.24, 0.2, 0.06, RX.DECAL), [0, 0.38, 0]), place(rbox(0.22, 0.24, 0.16, 0.05, RX.B), [0, 0.16, 0]), place(rbox(0.26, 0.04, 0.17, 0.015, RX.DARK), [0, 0.03, 0]));
    for (const s of [-1, 1]) g.push(place(rbox(0.13, 0.1, 0.18, 0.04, RX.C), [s * 0.2, 0.46, 0], [0, 0, -s * 0.35]));
    for (let i = 0; i < 3; i++) g.push(place(rbox(0.14, 0.014, 0.01, 0.005, RX.DARK), [0, 0.12 + i * 0.04, 0.083]));
    return { geo: merge(g), h: 0.5, w: 0.17, d: 0.1, sh: [0.2, 0.42, 0], neck: 0.5, decal: [0, 0.39, 0.13], round: false };
  });
}
const CUSTOM_TORSO = { hulk: () => bigTorso(1, 'hulk'), brute: () => bigTorso(1.18, 'brute'), birther: birtherTorso, boiler: boilerTorso, buff: buffTorso };

// uniform band per torso key: [y0, y1, r, sx, sz] (lathe torsos) or ['box', w, h, d, y] (box torsos)
const BAND = { bean: [0.09, 0.24, 0.182, 1, 0.82], capsule: [0.13, 0.33, 0.124, 1, 0.9], tincan: [0.115, 0.25, 0.154, 1, 1], egg: [0.07, 0.2, 0.169, 1, 0.9], barrel: [0.085, 0.22, 0.199, 1, 0.92], tank: [0.06, 0.2, 0.174, 1.12, 0.86], cube: ['box', 0.335, 0.15, 0.275, 0.12], lanky: ['box', 0.215, 0.2, 0.155, 0.2] };
function uniformBand(tk, reg, stripe) {
  const b = BAND[tk]; if (!b) return null; const g = [];
  if (b[0] === 'box') { g.push(place(rbox(b[1], b[2], b[3], 0.03, reg), [0, b[4], 0])); if (stripe !== undefined) g.push(place(rbox(b[1] + 0.006, 0.02, b[3] + 0.006, 0.008, stripe), [0, b[4] - b[2] * 0.15, 0])); return { geo: merge(g), y: b[4], z: b[3] / 2 + 0.002, top: b[4] + b[2] / 2 }; }
  const [y0, y1, r, sx, sz] = b; g.push(band(r, y0, y1, sx, sz, reg));
  if (stripe !== undefined) g.push(band(r + 0.004, (y0 + y1) / 2 - 0.012, (y0 + y1) / 2 + 0.012, sx, sz, stripe, 0.008));
  return { geo: merge(g), y: (y0 + y1) / 2, z: r * sz + 0.004, top: y1 };
}

/* ------------------------------------------------------------------ decal (number + sticker) */
const STICKERS = ['star', 'heart', 'bolt', 'smile', 'warn', 'flower', 'stripes', 'dots', 'bag', 'cross', 'coin', 'wrench', 'question', 'shield'];
function decalCanvas(spec, pal) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const hex = (h) => '#' + h.toString(16).padStart(6, '0');
  const num = String(spec.num).padStart(2, '0');
  g.lineJoin = 'round'; g.font = 'bold 118px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = hex(pal[1] === pal[0] ? 0xffffff : pal[1]); g.strokeText(num, 112, 120); g.fillStyle = hex(pal[10]); g.fillText(num, 112, 120);
  const st = spec.sticker, dark = '#222';
  if (st) {
    g.save(); g.translate(196, 196); g.rotate(-0.25 + (spec.seed % 5) * 0.12); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3;
    if (st === 'star') { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 18 : 40; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fillStyle = '#ffd23f'; g.fill(); g.stroke(); }
    else if (st === 'heart') { g.beginPath(); g.moveTo(0, 30); g.bezierCurveTo(44, 0, 30, -36, 0, -14); g.bezierCurveTo(-30, -36, -44, 0, 0, 30); g.fillStyle = '#ff4d6d'; g.fill(); g.stroke(); }
    else if (st === 'bolt') { g.beginPath(); g.moveTo(8, -40); g.lineTo(-22, 6); g.lineTo(-2, 6); g.lineTo(-10, 40); g.lineTo(22, -8); g.lineTo(2, -8); g.closePath(); g.fillStyle = '#ffe14d'; g.fill(); g.stroke(); }
    else if (st === 'smile') { g.beginPath(); g.arc(0, 0, 36, 0, 7); g.fillStyle = '#ffd23f'; g.fill(); g.stroke(); g.fillStyle = dark; g.fillRect(-14, -14, 7, 12); g.fillRect(7, -14, 7, 12); g.beginPath(); g.lineWidth = 6; g.strokeStyle = dark; g.arc(0, 2, 20, 0.3, Math.PI - 0.3); g.stroke(); }
    else if (st === 'warn') { g.beginPath(); g.moveTo(0, -40); g.lineTo(40, 32); g.lineTo(-40, 32); g.closePath(); g.fillStyle = '#ffcc00'; g.fill(); g.lineWidth = 5; g.strokeStyle = dark; g.stroke(); g.fillStyle = dark; g.fillRect(-4, -16, 8, 28); g.fillRect(-4, 18, 8, 7); }
    else if (st === 'flower') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * 20, Math.sin(a) * 20, 15, 0, 7); g.fillStyle = '#fff'; g.fill(); } g.beginPath(); g.arc(0, 0, 13, 0, 7); g.fillStyle = '#ffb703'; g.fill(); }
    else if (st === 'stripes') { g.beginPath(); g.rect(-40, -20, 80, 40); g.clip(); g.fillStyle = '#ffcc00'; g.fillRect(-40, -20, 80, 40); g.fillStyle = dark; for (let i = -5; i < 5; i++) { g.beginPath(); g.moveTo(i * 20, -20); g.lineTo(i * 20 + 10, -20); g.lineTo(i * 20 + 30, 20); g.lineTo(i * 20 + 20, 20); g.fill(); } }
    else if (st === 'bag') { g.fillStyle = '#f7f3e8'; g.beginPath(); g.roundRect(-32, -18, 64, 54, 8); g.fill(); g.stroke(); g.lineWidth = 7; g.strokeStyle = '#2f8f5b'; g.beginPath(); g.arc(0, -18, 16, Math.PI, 0); g.stroke(); g.fillStyle = '#2f8f5b'; g.fillRect(-20, 4, 40, 9); }
    else if (st === 'cross') { g.fillStyle = '#f7f3e8'; g.beginPath(); g.arc(0, 0, 38, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#36c06a'; g.fillRect(-9, -26, 18, 52); g.fillRect(-26, -9, 52, 18); }
    else if (st === 'coin') { g.beginPath(); g.arc(0, 0, 36, 0, 7); g.fillStyle = '#f2c230'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#9a6a10'; g.stroke(); g.fillStyle = '#9a6a10'; g.font = 'bold 44px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 3); }
    else if (st === 'wrench') { g.rotate(0.8); g.fillStyle = '#c6cad0'; g.fillRect(-7, -30, 14, 50); g.beginPath(); g.arc(0, -30, 16, 0, 7); g.fill(); g.fillStyle = '#ffcc00'; g.fillRect(-6, -48, 12, 18); g.strokeStyle = dark; g.lineWidth = 3; g.strokeRect(-7, -30, 14, 50); }
    else if (st === 'question') { g.beginPath(); g.arc(0, 0, 36, 0, 7); g.fillStyle = '#7ab8e8'; g.fill(); g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 54px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, 4); }
    else if (st === 'shield') { g.beginPath(); g.moveTo(0, -38); g.lineTo(32, -26); g.lineTo(28, 10); g.quadraticCurveTo(18, 30, 0, 40); g.quadraticCurveTo(-18, 30, -28, 10); g.lineTo(-32, -26); g.closePath(); g.fillStyle = '#2c5cc5'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#f2f2f2'; g.stroke(); }
    else { g.beginPath(); g.arc(0, 0, 34, 0, 7); g.fillStyle = hex(pal[6]); g.fill(); g.stroke(); g.fillStyle = '#fff'; for (const [x, y] of [[-12, -10], [12, -6], [0, 14]]) { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); } }
    g.restore();
  }
  if (spec.scratched) { // zombie: scratched off, faded, a rust bloom
    const r = rng(spec.seed * 13 + 5);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) { g.lineWidth = 2 + r() * 7; g.beginPath(); const x = r() * 256, y = r() * 256, a = r() * 6.28, l = 30 + r() * 120; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    g.globalAlpha = 0.45; g.fillRect(0, 0, 256, 256); g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  return c;
}

/* ------------------------------------------------------------------ assembly */
const NECK = () => memo('neck', () => { const g = [cyl(0.05, 0.045, 0.012, R.CHROME, 18).translate(0, 0.006, 0)]; for (let i = 0; i < 3; i++) g.push(place(tor(0.032 - i * 0.002, 0.011, R.RUBBER, 8, 20), [0, 0.02 + i * 0.015, 0], [P / 2, 0, 0])); g.push(cyl(0.024, 0.024, 0.06, R.DARK, 10).translate(0, 0.03, 0)); return merge(g); });

function mergeBones(list) {
  let nv = 0, ni = 0; for (const [g] of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const Pp = new Float32Array(nv * 3), Nn = new Float32Array(nv * 3), Gg = new Float32Array(nv), Bb = new Float32Array(nv), I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let ov = 0, oi = 0;
  for (const [g, b] of list) {
    const n = g.attributes.position.count; Pp.set(g.attributes.position.array, ov * 3); Nn.set(g.attributes.normal.array, ov * 3); Gg.set(g.attributes.aReg.array, ov); Bb.fill(b, ov, ov + n);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) I[oi + i] = ix[i] + ov; ov += n; oi += ix.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Pp, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); g.setAttribute('aReg', new THREE.BufferAttribute(Gg, 1)); g.setAttribute('aBone', new THREE.BufferAttribute(Bb, 1));
  g.setIndex(new THREE.BufferAttribute(I, 1)); return g;
}
const HAT_MAP = { [R.A]: RX.HA, [R.B]: RX.HB, [R.C]: RX.HC, [R.DECAL]: RX.HA };

// spec -> proto data { geom, dims, face, pal, decal canvas, mat options }
export function buildProto(spec) {
  const parts = [], add = (g, b) => parts.push([g, b]);
  const T = spec.torsoDef ? CUSTOM_TORSO[spec.torsoDef]() : torsoPart(spec.torso);
  const PV = pelvisPart(T.w, T.round), Hd = headPart(spec.head), hs = spec.headScale;
  const footReg = spec.swapAB ? R.A : R.B, FT = footPart(spec.foot, footReg);
  const L = spec.legLen, l1 = L * 0.52, l2 = L * 0.52, fh = FT.fh * (spec.footScale || 1), H = L * 0.94 + fh;
  const gap = 0.028, torsoY = PV.top + gap, neckLen = 0.045;
  // arm length from the body: at rest (hand target 0.9 A below the shoulder) the wrist sits at 0.72 of hip height,
  // so the fingers hang about mid-thigh; zombies a bit longer (reaching, dangling)
  const shY = H + torsoY + T.sh[1], armAuto = (shY - 0.72 * H) / 0.9 * (spec.zombie ? 1.12 : 1);
  const top0 = shY + T.neck - T.sh[1] + neckLen + Hd.h * hs; // standing height (bot units)
  spec.armLen = Math.max(spec.armLen, Math.min(armAuto, top0 * (spec.zombie ? 0.6 : 0.46)));
  const a1 = spec.armLen * 0.5, a2 = spec.armLen * 0.5;
  const dims = { T: { h: T.h, w: T.w, d: T.d, sh: T.sh.slice(), neck: T.neck, round: T.round }, hipX: PV.hipX, hipY: -0.025, L, l1, l2, fh, H, a1, a2, gap, torsoY, neckLen, hs,
    head: { h: Hd.h, top: Hd.top, front: Hd.front, w: Hd.w }, ants: [], hat: null, dangle: null, props: {} };
  // body
  let torsoG = cl(T.geo); if (spec.dents) torsoG = dent(torsoG, spec.seed, spec.dents);
  add(PV.geo, B.PELVIS); add(torsoG, B.TORSO); add(at(NECK(), [0, T.neck - 0.004, 0]), B.TORSO);
  let headG = cl(Hd.geo); if (spec.dents) headG = dent(headG, spec.seed + 3, spec.dents * 0.8);
  add(headG, B.HEAD);
  const eg = earsPart(spec.ears, Hd); if (eg) add(eg, B.HEAD);
  // antennae: up to two springy rigs of up to two segments
  antPart(spec.ant).slice(0, 2).forEach((a, i) => {
    const mount = Hd.mounts[a.m] || Hd.mounts[0], b0 = i ? B.ANT1 : B.ANT0, b1 = i ? B.ANT1B : B.ANT0B;
    const segs = a.segs.slice(0, 2), lens = segs.map((s) => s[1]);
    add(segs[0][0], b0); if (segs[1]) add(segs[1][0], b1);
    if (a.tip) add(at(a.tip, [0, lens[lens.length - 1], 0]), segs[1] ? b1 : b0);
    dims.ants.push({ b: [b0, b1], n: segs.length, mount: mount.slice(), lean: (a.lean || 0) + (spec.antBend ? spec.antBend * (i ? -1 : 1) : 0), lens, k: a.k * (spec.zombie ? 0.6 : 1) });
  });
  // hats and accessories (their own colours through the HA/HB/HC slots)
  for (const id of [spec.hat, spec.acc, spec.face]) {
    if (!id) continue; const d = hatDef(id); if (!d) continue; let hg = remap(hatGeo(id).geo, HAT_MAP);
    if (d.slot === 'top') { const s = Hd.topR / 0.13; dims.hat = { pos: [0, Hd.top + (d.y || 0) - 0.006, 0], sway: d.anim === 'sway' }; add(scaleG(hg, s), B.HAT); }
    else if (d.slot === 'face') { const f = Hd.face, fy = f.mode === 1 ? f.scr[1] + f.scr[2] * 0.2 : f.lens0[1]; add(at(hg, [0, fy, Hd.front + 0.012], [0, 0, 0], f.mode === 2 && f.lens1[3] < 0 ? 1.2 : 1), B.HEAD); }
    else if (d.slot === 'neck') add(at(hg, [0, T.neck + 0.01, 0], [0, 0, 0], [T.w / 0.12 * 0.75, 1, T.d / 0.11 * 0.75]), B.TORSO);
    else add(at(hg, [0, T.h * 0.55, -T.d]), B.TORSO);
  }
  // limbs: rigid upper segments carry the joint balls
  const r = spec.limbR, lk = spec.limb;
  const upGeo = (len, top, bottom, rr) => merge([cl(limbSeg(lk, rr, len)), at(joint(top, R.CHROME), [0, 0, 0]), at(joint(bottom, R.DARK), [0, len, 0])]);
  const handReg = spec.swapAB ? R.A : (spec.seed % 3 === 0 ? R.WHITE : R.B);
  const armR = r * (spec.armK || 1);
  let hgeo = handPart(spec.hand, handReg); if (spec.handScale) hgeo = scaleG(hgeo, spec.handScale);
  const up = upGeo(a1, 0.026 * (spec.armK || 1), armR * 1.8, armR), lo = limbSeg(lk, armR * 0.9, a2);
  add(up, B.LUP); add(up, B.RUP); add(lo, B.LFORE); add(lo, B.RFORE); add(hgeo, B.LHAND); add(hgeo, B.RHAND);
  const legR = r * (spec.legK || 1), lup = upGeo(l1, 0.001, legR * 2, legR), llo = limbSeg(lk, legR, l2);
  let fgeo = FT.geo; if (spec.footScale) fgeo = scaleG(fgeo, spec.footScale);
  add(lup, B.LTHIGH); add(lup, B.RTHIGH); add(llo, B.LSHIN); add(llo, B.RSHIN); add(fgeo, B.LFOOT); add(fgeo, B.RFOOT);
  // work props
  const pr = spec.props || {};
  if (pr.basket) { add(basketGeo(), B.BASKET); dims.props.basket = true; }
  if (pr.crate) { add(crateProp(pr.crate === 'big'), B.CRATE); dims.props.crate = true; }
  if (pr.chunk) { add(chunkGeo(), B.CRATE); dims.props.crate = true; dims.props.chunk = true; }
  if (pr.weapon) { add(pr.weapon === 'hammer' ? hammerGeo() : batGeo(), B.WEAPON); dims.props.weapon = pr.weapon; dims.props.weaponAlways = !!pr.weaponAlways; }
  if (pr.clipboard) add(at(clipboardGeo(), [0, -0.075, 0.03], [0.2, 0, 0]), B.LHAND);
  if (pr.band) { // work uniform / hi-vis vest ring with a name badge
    const bd = uniformBand(spec.torso, pr.band.reg, pr.band.stripe);
    if (bd) { add(bd.geo, B.TORSO); add(at(rbox(0.05, 0.03, 0.008, 0.006, RX.WHITE), [-T.w * 0.4, bd.y + 0.015, bd.z]), B.TORSO); add(at(sph(0.007, RX.GLOW, 8, 6), [-T.w * 0.4 - 0.016, bd.y + 0.015, bd.z + 0.005]), B.TORSO); }
  }
  if (pr.toolbelt) { // belt on the pelvis with pouches and a tape measure
    add(band(T.w * 0.78, -0.02, 0.03, 1, 0.82, RX.WOOD2, 0.014), B.PELVIS);
    for (const s of [-1, 1]) add(at(rbox(0.05, 0.06, 0.035, 0.01, RX.WOOD2), [s * T.w * 0.62, -0.02, T.d * 0.45], [0, s * 0.5, 0]), B.PELVIS);
    add(at(rbox(0.04, 0.04, 0.03, 0.01, RX.HAZ), [-T.w * 0.75, -0.015, -0.02], [0, 0, 0]), B.PELVIS);
  }
  if (pr.backpack) { // scavenger sack / survivor pack
    const bp = [place(rbox(0.2, 0.22, 0.1, 0.04, pr.backpack), [0, 0, 0]), place(rbox(0.16, 0.08, 0.04, 0.02, pr.backpack), [0, -0.04, -0.06]), place(bcyl(0.035, 0.18, 0.01, RX.WOOD2, 12), [-0.09, 0.12, 0], [0, 0, P / 2])];
    for (const s of [-1, 1]) bp.push(place(rbox(0.02, 0.24, 0.02, 0.008, RX.DARK), [s * 0.07, 0.0, 0.055]));
    add(at(merge(bp), [0, T.h * 0.6, -T.d - 0.05]), B.TORSO);
  }
  if (pr.wares) { // merchant: a frame pack loaded with goods and a lantern
    const g = [place(rbox(0.3, 0.04, 0.16, 0.01, RX.WOOD2), [0, -0.12, 0]), place(rbox(0.28, 0.16, 0.13, 0.015, RX.WOOD), [0, -0.02, 0]), place(rbox(0.18, 0.14, 0.12, 0.015, RX.WOOD), [0.04, 0.13, 0.0], [0, 0.2, 0]), place(bcyl(0.04, 0.3, 0.01, RX.HC, 14), [0, 0.24, 0], [0, 0, P / 2])];
    for (const s of [-1, 1]) g.push(place(rbox(0.018, 0.5, 0.018, 0.006, RX.WOOD2), [s * 0.15, 0.08, -0.07]));
    g.push(place(tor(0.03, 0.005, RX.DARK, 5, 12), [-0.16, 0.24, -0.07], [0, P / 2, 0]), place(bcyl(0.028, 0.06, 0.008, RX.GLOW, 12), [-0.16, 0.16, -0.07]), place(bcyl(0.034, 0.012, 0.004, RX.DARK, 12), [-0.16, 0.22, -0.07]));
    add(at(merge(g), [0, T.h * 0.55, -T.d - 0.09]), B.TORSO);
  }
  // ---- damage and kind extras (zombies) ----
  const zx = spec.zx || {};
  if (zx.wires) { // loose cables from the neck ring and a shoulder
    const r0 = mix32(spec.seed + 99);
    add(wire([0.03, T.neck - 0.01, T.d * 0.3], [T.w * 0.6, T.neck - 0.07, T.d * 0.8], 0.06, 0.006, RX.WIRE), B.TORSO);
    add(wire([-0.02, T.neck - 0.02, T.d * 0.2], [-T.w * 0.3, T.neck - 0.11, T.d * 0.95], 0.05, 0.005, RX.WIRE2), B.TORSO);
    if (r0 % 2) add(wirePath([[T.sh[0] * 0.8, T.sh[1], T.d * 0.4], [T.sh[0] * 0.9, T.sh[1] - 0.08, T.d * 0.9], [T.sh[0] * 0.7, T.sh[1] - 0.15, T.d * 1.05]], 0.005, RX.HAZ), B.TORSO);
    // frayed ends at both elbows (show when a forearm is missing)
    for (const b of [B.LUP, B.RUP]) for (let i = 0; i < 3; i++) add(at(cyl(0.004, 0.003, 0.035, [RX.WIRE, RX.WIRE2, RX.HAZ][i], 5), [(i - 1) * 0.008, a1 + 0.012, (i % 2) * 0.006], [(i - 1) * 0.4, 0, 0.3]), b);
  }
  if (zx.hole) { // a torn-off panel: dark cavity, a board and wires inside
    const s = spec.seed % 2 ? 1 : -1, y = T.h * 0.55, z = T.round ? T.d * 0.96 : T.d + 0.004;
    add(at(rbox(0.09, 0.08, 0.012, 0.012, RX.DARK), [s * T.w * 0.35, y, z], [0, s * 0.35, 0]), B.TORSO);
    add(at(rbox(0.05, 0.04, 0.006, 0.003, RX.UNI), [s * T.w * 0.35, y + 0.01, z + 0.004], [0, s * 0.35, 0.2]), B.TORSO);
    add(wire([s * T.w * 0.33, y, z + 0.004], [s * T.w * 0.4, y - 0.08, z + 0.03], 0.02, 0.004, RX.WIRE), B.TORSO);
    add(at(sph(0.008, RX.GLOW, 8, 6), [s * T.w * 0.4, y - 0.08, z + 0.03]), B.TORSO);
  }
  if (zx.dangle) { // hanging panel on a hinge (springy bone)
    const s = spec.seed % 3 ? -1 : 1, pos = [s * T.w * 0.8, T.h * 0.8, T.round ? T.d * 0.55 : T.d * 0.9];
    dims.dangle = { pos, side: s };
    add(merge([place(rbox(0.07, 0.11, 0.012, 0.01, RX.DECAL), [0, -0.055, 0]), place(bcyl(0.007, 0.03, 0.002, RX.CHROME, 8), [-0.015, 0, 0], [0, 0, P / 2]), screw([0.02, -0.095, 0.006], 0.006)]), B.DANGLE);
  }
  if (zx.tumours) { // swollen glowing battery cells bolted on
    const spots = [[B.TORSO, T.sh[0] * 0.9, T.sh[1] + 0.03, -0.02, 0.055], [B.TORSO, -T.sh[0] * 0.85, T.sh[1] + 0.01, 0.02, 0.045], [B.TORSO, 0.04, T.h * 0.65, -T.d - 0.01, 0.065], [B.TORSO, -0.07, T.h * 0.35, -T.d, 0.05],
      [B.TORSO, T.w * 0.7, T.h * 0.3, T.d * 0.6, 0.075], [B.HEAD, Hd.w * 0.5, Hd.h * 0.85, -0.02, 0.045], [B.LUP, 0.02, a1 * 0.5, -0.01, 0.035]];
    for (const [b, x, y, z, rr] of spots.slice(0, zx.tumours)) {
      add(at(sph(rr, RX.GLOW, 14, 10), [x, y, z]), b);
      add(at(tor(rr * 0.98, rr * 0.13, RX.DARK, 5, 16), [x, y, z], [P / 2 + 0.3, 0.2, 0]), b);
      add(at(tor(rr * 0.8, rr * 0.11, RX.DARK, 5, 16), [x, y + rr * 0.45, z], [P / 2 + 0.3, 0.2, 0]), b);
    }
  }
  if (zx.spikes) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(at(cone(0.016, 0.16 - i * 0.03, i % 2 ? RX.CHROME : RX.DARK, 6), [s * (T.sh[0] + 0.02 - i * 0.03), T.sh[1] + 0.13 - i * 0.01, -0.04 + i * 0.05], [0.2 - i * 0.15, 0, -s * (0.35 + i * 0.12)]), B.TORSO);
  if (zx.plate) { // scrap plate riveted across the chest
    add(at(rbox(T.w * 1.25, T.h * 0.38, 0.02, 0.008, RX.CHROME), [0.02, T.h * 0.72, T.d + 0.012], [0, 0, 0.08]), B.TORSO);
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(screw([0.02 + x * T.w * 0.52, T.h * 0.72 + y * T.h * 0.14, T.d + 0.024], 0.012), B.TORSO);
  }
  if (zx.chain) for (let i = 0; i < 22; i++) { const a = i / 22 * P * 2; add(at(tor(0.022, 0.006, RX.CHROME, 5, 10), [Math.cos(a) * (T.w * 0.8 + 0.04), 0.0 + 0.012 * Math.sin(a * 3), Math.sin(a) * (T.d * 0.95 + 0.04)], [0, -a, i % 2 ? P / 2 : 0]), B.PELVIS); }
  if (zx.veins) for (const b of [B.LUP, B.RUP, B.LFORE, B.RFORE]) { const len = b === B.LUP || b === B.RUP ? a1 : a2; add(wirePath([[0.0, 0.01, armR * 1.4], [armR * 0.9, len * 0.35, armR * 1.2], [-armR * 0.6, len * 0.7, armR * 1.3], [0.0, len - 0.01, armR * 1.2]], 0.0045, RX.GLOW, 10), b); }
  if (zx.pods) for (const [x, y, z, rr] of [[0.06, T.h * 0.75, -T.d - 0.02, 0.04], [-0.07, T.h * 0.45, -T.d - 0.02, 0.05], [T.w * 0.85, T.h * 0.62, 0.0, 0.035]]) { add(at(sph(rr, RX.GLOW, 12, 8), [x, y, z]), B.TORSO); add(at(tor(rr, rr * 0.16, RX.CHROME, 5, 14), [x, y, z], [0, P / 2, 0]), B.TORSO); }
  if (zx.cross) { const z = T.round ? T.d * 0.98 : T.d + 0.004; add(at(rbox(0.035, 0.1, 0.012, 0.006, RX.GLOW), [0, T.h * 0.62, z]), B.TORSO); add(at(rbox(0.1, 0.035, 0.012, 0.006, RX.GLOW), [0, T.h * 0.62, z]), B.TORSO); }
  if (zx.brow) add(at(rbox(Hd.w * 1.6, 0.03, 0.05, 0.012, RX.DARK), [0, Hd.h * 0.82, Hd.front - 0.02], [0.25, 0, 0]), B.HEAD);
  if (zx.drips) for (let i = 0; i < 6; i++) { const a = -1 + i * 0.4; add(at(sph(0.012, RX.DARK, 6, 5), [Math.sin(a) * T.w * 0.95, T.h * (0.2 + (i % 3) * 0.12), Math.cos(a) * T.d * 0.95], [0, 0, 0], [1, 1.8, 1]), B.TORSO); }
  // rest-space bounds (for the instance cull sphere) and metres per bot unit
  const top = H + torsoY + T.neck + neckLen + Hd.h * hs;
  dims.top = top; dims.k = spec.heightM / top; dims.width = Math.max(T.w, T.sh[0] + 0.1) * 2;
  const geom = mergeBones(parts);
  const face = Hd.face;
  const pal = spec.pal.slice();
  return { key: spec.key, spec, geom, dims, face: { mode: face.mode, scr: face.scr ? face.scr.slice() : null, led: face.led || 0, mouth: face.mouth || 0, lens0: face.lens0 ? face.lens0.slice() : null, lens1: face.lens1 ? face.lens1.slice() : null },
    pal, decal: decalCanvas(spec, pal), decalR: T.decal.slice(), eye: spec.eye, wear: spec.wear, rust: spec.rust || 0, broken: spec.broken || 0, oily: spec.oily || 0, tris: geom.index.count / 3, verts: geom.attributes.position.count };
}

/* ------------------------------------------------------------------ looks: humans (worker robots) */
export const HUMAN_LOOKS = 16, ZOMBIE_LOOKS = 10;
const CIV_HATS = ['beanie', 'cap', 'bucket', 'beret', 'flower', 'headphones', 'sprout', 'bow', 'goggles', 'tophat', 'cowboy', 'glasses', 'umbrella', null, null, 'party'];
const CIV_ACC = ['scarf', 'bowtie', 'backpack', null, null, null];
const ROUND = ['bean', 'capsule', 'tincan', 'egg', 'barrel', 'tank'];
function baseSpec(r, seed, o) {
  return Object.assign({
    seed, torso: pick(r, TORSO_KEYS), head: pick(r, HEAD_KEYS), ears: r() < 0.5 ? 'none' : pick(r, ['bolts', 'cups', 'fins']), ant: r() < 0.3 ? 'none' : pick(r, ['whip', 'twin', 'coil', 'dish', 'bunny', 'bulb']),
    hand: pick(r, ['mitt', 'claw', 'ball', 'tri']), foot: pick(r, ['boot', 'pad', 'cup', 'flipper']), limb: r() < 0.5 ? 'rod' : r() < 0.6 ? 'coil' : 'piston',
    legLen: 0.31 + r() * 0.07, armLen: 0.29 + r() * 0.05, limbR: 0.012 + r() * 0.005, headScale: 1.0 + r() * 0.2, num: 1 + Math.floor(r() * 98), sticker: pick(r, ['star', 'heart', 'bolt', 'smile', 'flower', 'dots', null]),
    wear: 0.2 + r() * 0.35, swapAB: r() < 0.25, heightM: 1.66 + r() * 0.12, props: {},
  }, o);
}
// def for (seed, role): role customer | staff | candidate | survivor | scavenger | merchant | crew
export function robotDef(seed, role) {
  role = role || 'customer';
  const look = seed % HUMAN_LOOKS;
  let spec, key, scale = 1;
  if (role === 'survivor') {
    const r = rng(0x51a7); key = 'r:survivor';
    spec = baseSpec(r, 0x51a7, { torso: 'barrel', head: 'bino', ears: 'bolts', ant: 'whip', hand: 'mitt', foot: 'boot', limb: 'piston', hat: 'cap', acc: 'scarf', num: 7, sticker: 'warn', wear: 0.6, legLen: 0.35, heightM: 1.76,
      pal: palette(SCHEMES[15], { A: 0x5e6a3a, B: 0xc9b88a, C: 0xf2e3bc, ha: 0x4b5530, hb: 0x4b5530, hc: 0x2b2b20 }), props: { weapon: 'bat', weaponAlways: true, backpack: RX.WOOD2 } });
  } else if (role === 'scavenger') {
    const r = rng(0x0bad); key = 'r:scavenger';
    spec = baseSpec(r, 0x0bad, { torso: 'lanky', head: 'monocle', ears: 'fins', ant: 'twin', hand: 'claw', foot: 'pad', limb: 'rod', hat: 'goggles', acc: 'scarf', num: 13, sticker: 'stripes', wear: 0.55, legLen: 0.36, heightM: 1.72,
      pal: palette(SCHEMES[4], { A: 0x4a4258, B: 0x8a7f9a, C: 0xd8c8a8, ha: 0x6a5a4a, hb: 0x3a3048, hc: 0x9ad0ff }), props: { backpack: RX.HB } });
  } else if (role === 'merchant') {
    const r = rng(0x7e11); key = 'r:merchant';
    spec = baseSpec(r, 0x7e11, { torso: 'tank', head: 'crt', ears: 'cups', ant: 'bulb', hand: 'mitt', foot: 'boot', limb: 'piston', hat: 'tophat', num: 88, sticker: 'coin', wear: 0.35, legLen: 0.33, headScale: 1.12, heightM: 1.74,
      pal: palette(SCHEMES[13], { A: 0x6b3a26, B: 0xd8a62c, C: 0xf2e3bc, glow: 0xffc860 }), props: { wares: true } });
  } else if (role === 'crew') {
    const v = seed % 5, r = rng(2000 + v * 131); key = 'r:crew:' + v;
    const sch = SCHEMES[[13, 1, 9, 10, 15][v]];
    spec = baseSpec(r, 2000 + v, { torso: ['cube', 'tincan', 'barrel', 'tank', 'capsule'][v], hat: 'hardhat', acc: null, num: 20 + v * 7, sticker: 'wrench', limb: v % 2 ? 'piston' : 'rod', foot: 'boot', hand: v % 2 ? 'claw' : 'mitt', ant: v === 2 ? 'whip' : 'none',
      pal: palette(sch, { uni: 0xff7a1a, ha: [0xf2c12e, 0xf2c12e, 0xffffff, 0xff7a1a, 0xf2c12e][v], hb: 0xf2c12e }), props: { weapon: 'hammer', weaponAlways: true, band: { reg: RX.UNI, stripe: RX.WHITE }, toolbelt: true } });
  } else {
    const r = rng(1000 + look * 7919), sch = SCHEMES[(look * 5) % 16];
    if (role === 'staff') {
      key = 'r:staff:' + look;
      spec = baseSpec(r, 1000 + look, { torso: pick(r, ROUND.concat(['cube', 'lanky'])), hat: look % 3 === 0 ? null : look % 3 === 1 ? 'cap' : 'headphones', acc: null, sticker: 'bag', ant: look % 4 ? 'none' : 'whip',
        pal: palette(sch, { ha: 0x2f8f5b, hb: 0xf2e6d0, hc: 0x1e5a3a }), props: { weapon: 'bat', band: { reg: RX.UNI, stripe: RX.HAZ } } });
    } else {
      key = (role === 'candidate' ? 'r:cand:' : 'r:') + look;
      const hat = CIV_HATS[look], acc = pick(r, CIV_ACC);
      spec = baseSpec(r, 1000 + look, { hat, acc: hat === 'umbrella' ? null : acc, pal: palette(sch, { ha: SCHEMES[(look * 5 + 7) % 16].A, hb: SCHEMES[(look * 5 + 7) % 16].B, hc: SCHEMES[(look * 3 + 2) % 16].C }), props: role === 'candidate' ? { clipboard: true } : { basket: true } });
      if (role === 'candidate') spec.sticker = 'question';
    }
    scale = 0.94 + (mix32(seed * 7 + 3) % 13) * 0.01;
  }
  spec.props.crate = true; // cine CARRY ('lanB') on every human, hidden by default
  spec.key = key; spec.eye = spec.pal[6] === undefined ? 0x9dffb0 : (SCHEMES.find((s) => s.glow === spec.pal[6]) || { eye: 0x9dffb0 }).eye;
  return { key, spec, scale, kind: 'human', role, look, hidden: hiddenFor(spec) };
}
function hiddenFor(spec) { const h = []; const pr = spec.props || {}; if (pr.basket) h.push('lan'); if (pr.crate) h.push('lanB'); if (pr.weapon && !pr.weaponAlways) h.push('wR'); return h; }

/* ------------------------------------------------------------------ looks: zombies (broken hostile robots) */
const RUSTY = (h, k = 0.5, dim = 0.82) => mixHex(h, 0x6b5240, k, dim);
const EYE_RED = 0xff3020, EYE_AMBER = 0xffa020;
function zBase(seed, o) {
  const r = rng(seed), sch = SCHEMES[Math.floor(r() * 16)];
  const amber = r() < 0.35;
  return baseSpec(r, seed, Object.assign({
    zombie: true, hat: r() < 0.22 ? pick(r, ['hardhat', 'bandage', 'cap', 'beanie']) : null, acc: null, ant: r() < 0.35 ? 'none' : pick(r, ['whip', 'twin', 'coil', 'dish']), antBend: 0.4 + r() * 0.6,
    sticker: null, scratched: true, wear: 0.85, rust: 0.55 + r() * 0.35, broken: 1, dents: 0.02 + r() * 0.012, eye: amber ? EYE_AMBER : EYE_RED,
    pal: palette(sch, { A: RUSTY(sch.A, 0.45), B: RUSTY(sch.B, 0.55, 0.75), C: RUSTY(sch.C, 0.3), glow: amber ? 0xff9a30 : 0xff4020, chrome: 0x8a8580, white: 0xb8b0a0, ha: RUSTY(0xf2c12e, 0.5), hb: RUSTY(0xe8c39e, 0.4), hc: 0x55504a }),
    zx: { wires: true, hole: r() < 0.7, dangle: r() < 0.6 }, legLen: 0.3 + r() * 0.06, heightM: 1.7 + r() * 0.1,
  }, o));
}
// kind: Base Tumour Hulk Brute Birther Baby Sweaty TwinBuff TwinHeal; role 'helper' = Stompy, the chained friendly Hulk
export function zombieRobotDef(seed, kind, role) {
  const h = mix32(seed + 0x9e37), K = 1.78 / 1.81;
  let spec, key, scale = 1, big = false, aura = null, glowPulse = null;
  switch (kind) {
    case 'Tumour': { const v = h % 3; key = 'zr:tumour:' + v; spec = zBase(5003 + v * 7717, { zx: { wires: true, hole: false, dangle: v === 1, tumours: 7 }, eye: EYE_AMBER }); spec.pal[6] = 0xff8a2a; glowPulse = true; break; }
    case 'Hulk': {
      const v = role === 'helper' ? 2 : h % 2; key = 'zr:hulk:' + v; big = true; scale = 1.5 * K;
      const helper = v === 2;
      spec = zBase(7000 + v * 31, { torsoDef: 'hulk', head: v ? 'monocle' : 'bino', headScale: 0.9, ears: 'none', ant: helper ? 'bulb' : 'none', hat: null, hand: 'claw', handScale: 1.9, foot: 'pad', footScale: 1.5, limb: 'piston', limbR: 0.03, armK: 1.25, legK: 1.3,
        legLen: 0.27, armLen: 0.48, heightM: 1.78, dents: 0.025, rust: helper ? 0.35 : 0.6, eye: helper ? 0x8affc0 : EYE_AMBER,
        pal: palette(SCHEMES[2], { A: RUSTY(helper ? 0x4f8a9a : 0xe0a82c, 0.35), B: RUSTY(0x3a3d44, 0.2), C: 0x1b1b1e, glow: helper ? 0x8affc0 : 0xffa030, chrome: 0x8a8580, haz: RUSTY(0xe8b923, 0.3) }),
        zx: { wires: true, hole: true, dangle: !helper, brow: true } });
      if (helper) spec.num = 1;
      break;
    }
    case 'Brute': key = 'zr:brute'; big = true; scale = 2.0 * K;
      spec = zBase(9100, { torsoDef: 'brute', head: 'bino', headScale: 0.82, ears: 'none', ant: 'none', hat: null, hand: 'claw', handScale: 2.3, foot: 'pad', footScale: 1.7, limb: 'piston', limbR: 0.034, armK: 1.35, legK: 1.4,
        legLen: 0.27, armLen: 0.5, heightM: 1.78, dents: 0.03, rust: 0.8, eye: 0xff8030,
        pal: palette(SCHEMES[12], { A: 0x5a6250, B: 0x3a3a36, C: 0xc9b88a, glow: 0xff7a20, chrome: 0x7a7670, haz: 0x9a7a2a }), props: { chunk: true },
        zx: { wires: true, hole: true, spikes: true, plate: true, chain: true, brow: true } });
      break;
    case 'Birther': key = 'zr:birther'; scale = 1.7 * K; glowPulse = true;
      spec = zBase(9200, { torsoDef: 'birther', head: 'dome', headScale: 0.95, ears: 'cups', ant: 'twin', hand: 'tri', foot: 'cup', limb: 'coil', legLen: 0.3, armLen: 0.3, heightM: 1.78, rust: 0.5, eye: 0xff4060,
        pal: palette(SCHEMES[11], { A: RUSTY(0xd8d2c4, 0.35), B: RUSTY(0x3f8a8a, 0.3), C: 0x3b4a6b, glow: 0xff6aa0, chrome: 0x9a948c }), zx: { wires: true, hole: false, dangle: true } });
      break;
    case 'Baby': { const v = seed % 2; key = 'zr:baby:' + v; scale = 0.55 * K; // two clearly different broods: blue egg + lens orb, pink bean + monocle with bunny ears
      spec = zBase(9300 + v, { torso: v ? 'bean' : 'egg', head: v ? 'monocle' : 'orb', headScale: v ? 1.35 : 1.55, ears: v ? 'fins' : 'none', ant: v ? 'bunny' : 'whip', hat: null, hand: v ? 'tri' : 'claw', foot: v ? 'pad' : 'cup', limb: v ? 'coil' : 'rod', legLen: v ? 0.17 : 0.2, armLen: 0.22, heightM: 1.78, rust: v ? 0.3 : 0.5, eye: v ? 0xff5a8a : 0xffd040,
        pal: palette(SCHEMES[v ? 14 : 3], { A: RUSTY(v ? 0xff8fc7 : 0x4f8fd0, 0.3), B: RUSTY(v ? 0xf8e79a : 0xf3f1ea, 0.35), glow: v ? 0xff5a8a : 0xffc040, chrome: 0x9a948c }), zx: { wires: true, hole: !v, dangle: !!v } });
      break; }
    case 'Sweaty': key = 'zr:sweaty'; scale = 2.2 * K;
      spec = zBase(9400, { torsoDef: 'boiler', head: 'bucket', headScale: 0.9, ears: 'bolts', ant: 'none', hat: null, hand: 'ball', handScale: 1.6, foot: 'pad', footScale: 1.4, limb: 'piston', limbR: 0.028, armK: 1.2, legK: 1.35,
        legLen: 0.25, armLen: 0.36, heightM: 1.78, rust: 0.45, oily: 1, eye: 0xfff0a0, pal: palette(SCHEMES[11], { A: 0x9aa086, B: 0x5a5a4a, C: 0x2a2a24, glow: 0xffd070, chrome: 0x9a948c }), zx: { wires: true, hole: true, drips: true } });
      break;
    case 'TwinBuff': key = 'zr:twinbuff'; scale = 1.2 * K; aura = [1, 0.23, 0.16];
      spec = zBase(9500, { torsoDef: 'buff', head: 'crt', headScale: 0.95, ears: 'fins', ant: 'twin', antBend: 0.2, hat: null, hand: 'mitt', handScale: 1.25, foot: 'boot', limb: 'piston', limbR: 0.02, armK: 1.2, legK: 1.15, legLen: 0.36, armLen: 0.34, heightM: 1.8, rust: 0.4, eye: 0xff3a2a,
        pal: palette(SCHEMES[8], { A: 0x8a2622, B: 0x4a4838, C: 0x1b1b1e, glow: 0xff3a2a, chrome: 0x8a8580 }), zx: { wires: true, hole: false, veins: true } });
      break;
    case 'TwinHeal': key = 'zr:twinheal'; scale = 1.2 * K; aura = [0.29, 1, 0.54]; glowPulse = true;
      spec = zBase(9600, { torso: 'capsule', head: 'dome', headScale: 1.0, ears: 'cups', ant: 'twin', antBend: 0.2, hat: null, hand: 'tri', foot: 'cup', limb: 'coil', legLen: 0.36, armLen: 0.31, heightM: 1.8, rust: 0.35, eye: 0x8affb0,
        pal: palette(SCHEMES[1], { A: 0xc8d4c8, B: 0x3f6a52, C: 0x1e3a2a, glow: 0x5aff9a, chrome: 0x9a948c }), zx: { wires: true, hole: false, pods: true, cross: true } });
      break;
    default: { const v = h % ZOMBIE_LOOKS; kind = 'Base'; key = 'zr:base:' + v; spec = zBase(3001 + v * 4993); }
  }
  spec.key = key;
  return { key, spec, scale, kind, big, aura, glowPulse, zombie: true, role, hidden: hiddenFor(spec) };
}
