// Animal robots ("thú máy") in the same kit as the crowd robots: rigid bevelled parts, chrome joints, coil springs,
// chipped paint and screws (robo-geo primitives), the robot heads with screen / lens faces and shader emotes
// (robo-parts heads + robo-mat). Each species has its own skeleton (up to 40 rigid bones, FK with spring chains on
// tails, ears, antennae and tentacles) and its own gait and actions. One look = one merged geometry = one draw call
// for every animal wearing it (Crowd with a wider texture row: 40 bones, root, 2 param texels).
import * as THREE from '../vendor/three.module.min.js';
import { R, place, merge, rbox, lathe, fillet, cyl, sph, tor, cone, caps, bcyl, screw, coil, setDetail } from './robo-geo.js';
import { head as robotHead } from './robo-parts.js';
import { SCHEMES, NPAL, RX, rng } from './robo-cast.js';
import { Crowd } from './robo-crowd.js';
import { EMO } from './robo-rig.js';

export const NBB = 40, B_ROOT = 120, B_PAR = 123, B_TW = 128;
const P = Math.PI, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t;
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const bump = (u, a, b, c, d) => sst(a, b, u) * (1 - sst(c, d, u));
const prof = (pts, seg = 3) => fillet(pts, seg);

/* ------------------------------------------------------------------ looks: palette, parts, merge */
function palette(sch, o = {}) {
  const A = o.A ?? sch.A, Bc = o.B ?? sch.B;
  return [A, Bc, o.dark ?? sch.dark, 0xc6cad0, 0x0a0f13, 0x04060a, o.glow ?? sch.glow, 0x1c1c1f, o.white ?? 0xece7db, A, o.C ?? sch.C,
    0xb07a45, 0x7e5230, o.haz ?? 0xe8b923, 0xc8352a, 0x2f6fd0, o.ha ?? 0xf08aa0, 0xf2e6d0, 0x2b3a55, 0x2f8f5b];
}
// robot head scaled for an animal (the face rectangle / lens circles scale with it); never rotate it: the face
// shader reads the screen in head-bone xy
function headPart(k, s) {
  const h = robotHead(k), g = h.geo.clone(); g.scale(s, s, s);
  const f = h.face, face = { mode: f.mode, led: f.led || 0, mouth: f.mouth || 0, scr: f.scr ? [f.scr[0] * s, f.scr[1] * s, f.scr[2] * s, f.scr[3]] : null,
    lens0: f.lens0 ? [f.lens0[0] * s, f.lens0[1] * s, f.lens0[2] * s, f.lens0[3] * s] : null, lens1: f.lens1 && f.lens1[3] > 0 ? [f.lens1[0] * s, f.lens1[1] * s, f.lens1[2] * s, f.lens1[3] * s] : [0, 0, 0, -1] };
  return { geo: g, face, h: h.h * s, w: h.w * s, front: h.front * s, top: h.top * s };
}
const at = (g, p, r = [0, 0, 0], s = 1) => place(g, p, r, s);
const zc = (r0, r1, len, reg, seg = 12) => place(cyl(r0, r1, len, reg, seg), [0, 0, len / 2], [P / 2, 0, 0]); // along +z, r0 at z=0
const zcn = (r0, r1, len, reg, seg = 12) => place(zc(r0, r1, len, reg, seg), [0, 0, 0], [0, P, 0]); // along -z
const ycu = (r0, r1, len, reg, seg = 12) => place(yc(r0, r1, len, reg, seg), [0, 0, 0], [P, 0, 0]); // along +y
const yc = (r0, r1, len, reg, seg = 12) => place(cyl(r0, r1, len, reg, seg), [0, -len / 2, 0], [P, 0, 0]); // along -y, r0 at y=0
const xc = (r0, r1, len, s, reg, seg = 12) => place(cyl(r0, r1, len, reg, seg), [s * len / 2, 0, 0], [0, 0, -s * P / 2]); // along s*x
const ball = (r, reg = R.CHROME) => sph(r, reg, 12, 9);
const coilY = (rc, rw, len, turns = 5) => place(coil(rc, rw, turns, R.CHROME, len), [0, -len, 0]);
const coilZ = (rc, rw, len, turns = 5) => place(coil(rc, rw, turns, R.CHROME, len), [0, 0, 0], [P / 2, 0, 0]);
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
// bones: [name, parent, [ox,oy,oz], euler order]; returns { defs, idx(name) }
function skel(list) { const defs = list.map(([n, p, o, ord]) => ({ n, p: p === null ? -1 : list.findIndex((x) => x[0] === p), o, ord: ord || 'XYZ' })); return defs; }
function protoOf(look) {
  setDetail(0.6);
  const geom = mergeBones(look.parts);
  return { key: look.key, spec: { seed: look.seed }, geom, dims: {}, face: look.face, pal: look.pal, decal: null, decalR: [0, 0, 1], eye: look.eye, wear: look.wear ?? 0.5, rust: look.rust || 0, broken: 0, oily: 0, tris: geom.index.count / 3 };
}
function pickScheme(r) { return SCHEMES[Math.floor(r() * SCHEMES.length) % SCHEMES.length]; }

/* ------------------------------------------------------------------ species looks */
// quadruped (dog / cat). Bones: 0 hips, 1 chest, 2 head, 3 neck, legs FL FR BL BR (upper, lower, paw), tail, ears, ball
function quadLook(seed, cat) {
  const r = rng(seed * 7919 + (cat ? 131 : 57)), sch = pickScheme(r), pal = palette(sch);
  const bl = cat ? 0.34 + r() * 0.05 : 0.3 + r() * 0.1, bw = cat ? 0.14 : 0.17 + r() * 0.05, bh = cat ? 0.12 : 0.15 + r() * 0.03;
  const ul = cat ? 0.13 : 0.14 + r() * 0.03, ll = cat ? 0.13 : 0.13 + r() * 0.02, hipH = ul + ll + 0.03;
  const hk = cat ? ['pill', 'bucket', 'orb', 'bino'][Math.floor(r() * 4)] : ['crt', 'bino', 'dome', 'pill'][Math.floor(r() * 4)];
  const hd = headPart(hk, cat ? 0.58 : 0.68 + r() * 0.08);
  const nt = cat ? 6 : 4, tl = cat ? 0.055 : 0.05 + r() * 0.02, earK = cat ? 'point' : ['flop', 'point', 'bolt', 'flop'][Math.floor(r() * 4)];
  const L = [['hips', null, [0, hipH, -bl / 2]], ['chest', 'hips', [0, 0.01, bl]], ['head', 'neck', [0, cat ? 0.06 : 0.07, 0.02]], ['neck', 'chest', [0, bh * 0.35, bl * 0.18]]];
  const legs = [['FL', 'chest', 1, 0.02], ['FR', 'chest', -1, 0.02], ['BL', 'hips', 1, 0], ['BR', 'hips', -1, 0]];
  for (const [n, par, s, z] of legs) L.push([n + 'u', par, [s * bw * 0.36, -bh * 0.25, z]], [n + 'l', n + 'u', [0, -ul, 0]], [n + 'p', n + 'l', [0, -ll, 0]]);
  for (let i = 0; i < nt; i++) L.push(['t' + i, i ? 't' + (i - 1) : 'hips', i ? [0, 0, -tl] : [0, bh * 0.25, -0.09]]);
  L.push(['earL', 'head', [hd.w * 0.62, hd.h * 0.82, -0.01]], ['earR', 'head', [-hd.w * 0.62, hd.h * 0.82, -0.01]], ['ball', 'head', [0, 0.025, hd.front + 0.06]]);
  const defs = skel(L), I = (n) => defs.findIndex((d) => d.n === n), parts = [];
  const body = (len, z, reg) => rbox(bw, bh, len, cat ? 0.05 : 0.04, reg);
  parts.push([at(body(bl * 0.62, 0, R.A), [0, 0, bl * 0.12]), 0], [at(rbox(bw + 0.006, bh * 0.22, bl * 0.4, 0.01, R.B), [0, bh * 0.18, bl * 0.06]), 0]);
  parts.push([at(rbox(bw * 0.7, 0.012, bl * 0.4, 0.005, R.CHROME), [0, -bh / 2 - 0.004, bl * 0.1]), 0]);
  for (const s of [-1, 1]) parts.push([screw([s * (bw / 2 + 0.001), bh * 0.15, -0.03], 0.008, [s, 0, 0]), 0], [screw([s * (bw / 2 + 0.001), -bh * 0.15, 0.06], 0.008, [s, 0, 0]), 0]);
  parts.push([at(body(bl * 0.55, 0, R.A), [0, 0, -bl * 0.12]), 1], [at(rbox(bw * 0.86, bh * 0.5, 0.02, 0.008, R.B), [0, 0, bl * 0.16]), 1]);
  parts.push([at(tor(bw * 0.4, 0.012, cat ? R.GLOW : RX.HAZ, 6, 20), [0, bh * 0.36, bl * 0.12], [P / 2 + 0.3, 0, 0]), 1], [at(bcyl(0.018, 0.006, 0.002, R.CHROME, 10), [0, bh * 0.05, bl * 0.18], [P / 2, 0, 0]), 1]);
  for (let i = 0; i < 3; i++) parts.push([at(rbox(0.008, bh * 0.4, 0.04, 0.003, R.DARK), [bw / 2 + 0.002, 0, -bl * 0.05 + i * 0.03]), 1]);
  parts.push([coilY(0.03, 0.005, 0.07, 4).translate(0, 0.07, 0), 3], [at(ball(0.033), [0, 0, 0]), 3]);
  parts.push([hd.geo, 2]);
  if (cat) { parts.push([at(rbox(0.07, 0.035, 0.05, 0.015, R.B), [0, 0.03, hd.front + 0.01]), 2], [at(sph(0.012, R.DARK, 8, 6), [0, 0.045, hd.front + 0.036]), 2]); for (const s of [-1, 1]) for (let k = 0; k < 2; k++) parts.push([at(xc(0.002, 0.001, 0.08, s, R.CHROME, 4), [s * 0.03, 0.03 + k * 0.012, hd.front + 0.03], [0, 0, s * (k - 0.5) * 0.3]), 2]); }
  else { parts.push([at(rbox(0.11, 0.07, 0.1, 0.025, R.B), [0, 0.02, hd.front + 0.025]), 2], [at(sph(0.02, R.DARK, 10, 8), [0, 0.04, hd.front + 0.08]), 2], [at(rbox(0.07, 0.01, 0.06, 0.004, R.DARK), [0, -0.012, hd.front + 0.04]), 2]); }
  for (const [n, , s] of legs) {
    const fr = n[0] === 'F', rr = fr ? 0.022 : 0.026;
    parts.push([ball(rr + 0.008), I(n + 'u')], [yc(rr, rr * 0.8, ul, R.A), I(n + 'u')], [at(rbox(rr * 2.3, ul * 0.45, rr * 2.3, 0.012, R.B), [0, -ul * 0.4, 0]), I(n + 'u')]);
    parts.push([ball(rr * 0.85), I(n + 'l')], [r() < 0.5 || cat ? yc(rr * 0.45, rr * 0.45, ll, R.CHROME, 8) : coilY(rr * 0.7, 0.004, ll, 5), I(n + 'l')]);
    parts.push([at(rbox(rr * 2.4, 0.03, rr * 3, 0.012, R.RUBBER), [0, -0.012, rr * 0.6]), I(n + 'p')], [at(rbox(rr * 2.2, 0.012, rr * 1.2, 0.004, R.DARK), [0, -0.005, rr * 1.9]), I(n + 'p')]);
  }
  for (let i = 0; i < nt; i++) { const rr = (cat ? 0.016 : 0.02) * (1 - i / nt * 0.45); parts.push([ball(rr * 1.15), I('t' + i)], [zcn(rr, rr * 0.9, tl, R.A, 8), I('t' + i)]); if (i === nt - 1) parts.push([at(sph(rr * 1.4, cat ? R.B : R.GLOW, 10, 8), [0, 0, -tl]), I('t' + i)]); }
  for (const [n, s] of [['earL', 1], ['earR', -1]]) {
    if (earK === 'flop') parts.push([at(rbox(0.02, 0.11, 0.06, 0.009, R.B), [s * 0.008, -0.05, 0]), I(n)], [ball(0.016), I(n)]);
    else if (earK === 'point') parts.push([at(cone(0.035, 0.08, R.A, 4), [0, 0.035, 0], [0, P / 4, 0]), I(n)], [at(cone(0.02, 0.05, R.B, 4), [0, 0.03, 0.012], [0, P / 4, 0]), I(n)]);
    else parts.push([at(bcyl(0.028, 0.04, 0.008, R.CHROME, 6), [0, 0, 0], [0, 0, 0]), I(n)], [at(sph(0.014, R.GLOW, 8, 6), [0, 0.045, 0]), I(n)]);
  }
  parts.push([sph(0.04, RX.HAZ, 12, 9), I('ball')], [at(tor(0.04, 0.005, R.C, 5, 16), [0, 0, 0], [0, 0, 0]), I('ball')]);
  return { key: (cat ? 'cat:' : 'dog:') + seed, seed, defs, parts, face: hd.face, pal, eye: sch.eye, d: { bl, bw, bh, ul, ll, hipH, nt, cat, flop: earK === 'flop', hd }, hidden: [I('ball')] };
}

// bird. Bones: 0 root, 1 body, 2 head, 3 neck, wings L (inner, outer) R, legs L (shin, foot) R, tail fan + tip, crest x2
function birdLook(seed) {
  const r = rng(seed * 4241 + 9), big = seed % 3 === 2, parrot = big && seed % 2 === 0, sch = pickScheme(r);
  const pal = palette(sch, parrot ? { A: [0x2fb36b, 0xd9332b, 0x2c6fd6][seed % 3], B: 0xf2c230, C: 0x2c6fd6 } : big ? { A: 0x30333a, B: 0x55606e, C: 0xd8a62c } : {});
  const hk = ['orb', 'monocle', 'bucket', 'bino'][Math.floor(r() * 4)], hd = headPart(hk, 0.42);
  const legH = 0.08, br = 0.075;
  const defs = skel([['root', null, [0, legH + 0.06, 0]], ['body', 'root', [0, 0, 0]], ['head', 'neck', [0, 0.03, 0.0]], ['neck', 'body', [0, 0.05, 0.065]],
    ['wL', 'body', [br * 0.85, 0.03, 0.0], 'YZX'], ['wL2', 'wL', [0.1, 0, 0], 'YZX'], ['wR', 'body', [-br * 0.85, 0.03, 0.0], 'YZX'], ['wR2', 'wR', [-0.1, 0, 0], 'YZX'],
    ['lL', 'root', [0.03, -0.035, 0]], ['fL', 'lL', [0, -legH, 0]], ['lR', 'root', [-0.03, -0.035, 0]], ['fR', 'lR', [0, -legH, 0]],
    ['tail', 'body', [0, 0.02, -0.085]], ['tail2', 'tail', [0, 0, -0.06]], ['c0', 'head', [0, hd.top - 0.004, -0.01]], ['c1', 'c0', [0, 0.03, 0]]]);
  const I = (n) => defs.findIndex((d) => d.n === n), parts = [];
  parts.push([lathe(prof([[0, -0.1, 0, R.A], [0.05, -0.085, 0.03, R.A], [br, -0.02, 0.04, R.A], [br, 0.0, 0, R.B], [br, 0.02, 0, R.B], [br * 0.96, 0.03, 0, R.A], [0.055, 0.08, 0.03, R.A], [0, 0.095, 0, R.A]]), 22, 1, 0.92).rotateX(P / 2).translate(0, 0.0, 0), 1]);
  parts.push([at(lathe(prof([[0, 0, 0, R.WHITE], [br * 0.8, 0.0, 0.02, R.WHITE], [br * 0.82, 0.02, 0, R.WHITE], [0, 0.03, 0, R.WHITE]]), 18, 1, 1.1), [0, -br * 0.78, 0.01]), 1]);
  for (const s of [-1, 1]) parts.push([screw([s * br * 0.98, -0.01, -0.03], 0.007, [s, 0, 0]), 1]);
  parts.push([coilY(0.022, 0.004, 0.045, 4).translate(0, 0.045, 0), 3], [ball(0.024), 3]);
  parts.push([hd.geo, 2]);
  const bk = parrot ? [at(cone(0.03, 0.07, RX.HAZ, 10), [0, hd.h * 0.38, hd.front + 0.02], [P / 2 + 0.6, 0, 0]), at(cone(0.02, 0.03, R.DARK, 8), [0, hd.h * 0.25, hd.front + 0.015], [P / 2 + 1.4, 0, 0])]
    : big ? [at(cone(0.026, 0.09, R.DARK, 8), [0, hd.h * 0.4, hd.front + 0.035], [P / 2 + 0.12, 0, 0])] : [at(cone(0.018, 0.05, RX.HAZ, 8), [0, hd.h * 0.4, hd.front + 0.02], [P / 2 + 0.1, 0, 0])];
  for (const g of bk) parts.push([g, 2]);
  for (const [a, b2, s] of [['wL', 'wL2', 1], ['wR', 'wR2', -1]]) {
    parts.push([ball(0.02), I(a)], [at(rbox(0.1, 0.014, 0.075, 0.006, R.A), [s * 0.05, 0, -0.01]), I(a)], [at(rbox(0.1, 0.016, 0.02, 0.005, R.B), [s * 0.05, 0.002, 0.025]), I(a)]);
    for (let k = 0; k < 4; k++) parts.push([at(rbox(0.11 - k * 0.012, 0.01, 0.032, 0.005, k % 2 ? R.B : R.A), [s * 0.05, -0.002, -0.045 - k * 0.0], [0, s * (0.15 + k * 0.28), 0]), I(b2)]);
    parts.push([ball(0.014), I(b2)]);
  }
  for (const [l, f, s] of [['lL', 'fL', 1], ['lR', 'fR', -1]]) {
    parts.push([ball(0.016, R.DARK), I(l)], [yc(0.007, 0.006, legH, R.CHROME, 6), I(l)]);
    for (const a of [-0.45, 0, 0.45]) parts.push([at(rbox(0.009, 0.008, 0.04, 0.003, RX.HAZ), [Math.sin(a) * 0.016, -0.004, Math.cos(a) * 0.018], [0, a, 0]), I(f)]);
    parts.push([at(rbox(0.008, 0.008, 0.022, 0.003, RX.HAZ), [0, -0.004, -0.012]), I(f)], [ball(0.01), I(f)]);
  }
  for (let k = -2; k <= 2; k++) parts.push([at(rbox(0.026, 0.008, 0.07, 0.004, k % 2 ? R.B : R.A), [k * 0.012, 0, -0.03], [0, k * 0.18, 0]), I('tail')]);
  parts.push([at(rbox(0.03, 0.008, 0.05, 0.004, R.C), [0, 0, -0.02]), I('tail2')]);
  if (parrot || r() < 0.5) for (const n of ['c0', 'c1']) parts.push([at(rbox(0.012, 0.04, 0.03, 0.005, parrot ? RX.HAZ : R.B), [0, 0.018, 0], [-0.3, 0, 0]), I(n)]);
  return { key: 'bird:' + seed, seed, defs, parts, face: hd.face, pal, eye: sch.eye, scale: big ? 1.8 : 1.15, d: { legH, big, parrot }, hidden: [] };
}

// octopus. Bones: 0 root, 1 base, 2 mantle (face), tentacles 8 x 4 from 3, juggling balls 35..37
function octoLook(seed) {
  const r = rng(seed * 1531 + 3), sch = pickScheme(r), pal = palette(sch);
  const hk = ['dome', 'orb', 'crt', 'monocle'][Math.floor(r() * 4)], hd = headPart(hk, hk === 'crt' ? 0.8 : 1.0);
  const L = [['root', null, [0, 0.17, 0]], ['base', 'root', [0, 0, 0]], ['head', 'base', [0, 0.035, 0]]];
  const segL = [0.1, 0.09, 0.08, 0.07];
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * P * 2; for (let j = 0; j < 4; j++) L.push(['t' + i + j, j ? 't' + i + (j - 1) : 'base', j ? [0, 0, segL[j - 1]] : [Math.sin(a) * 0.1, -0.012, Math.cos(a) * 0.1], 'YXZ']); }
  for (let k = 0; k < 3; k++) L.push(['jb' + k, 'root', [0, 0, 0]]);
  const defs = skel(L), I = (n) => defs.findIndex((d) => d.n === n), parts = [];
  parts.push([lathe(prof([[0, -0.03, 0, R.DARK], [0.12, -0.03, 0.02, R.DARK], [0.135, 0.0, 0, R.DARK], [0.135, 0.004, 0, R.B], [0.125, 0.03, 0.01, R.B], [0, 0.035, 0, R.B]]), 26), 1]);
  for (let i = 0; i < 8; i++) { const a = i / 8 * P * 2; parts.push([screw([Math.sin(a) * 0.128, 0.012, Math.cos(a) * 0.128], 0.007, [Math.sin(a), 0.3, Math.cos(a)]), 1]); }
  parts.push([hd.geo, 2]);
  for (const s of [-1, 1]) parts.push([at(rbox(0.012, 0.08, 0.07, 0.006, R.B), [s * hd.w * 0.95, hd.h * 0.5, -0.03], [0, 0, s * 0.2]), 2]);
  for (let k = 0; k < 5; k++) { const a = r() * P * 2, y = hd.h * (0.35 + r() * 0.5); parts.push([at(sph(0.014 + r() * 0.01, R.C, 8, 6), [Math.sin(a) * hd.w * 0.95, y, -Math.abs(Math.cos(a)) * hd.w * 0.9]), 2]); }
  for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
    const r0 = 0.034 * (1 - j * 0.2), r1 = 0.034 * (1 - (j + 1) * 0.2), b = I('t' + i + j), len = segL[j];
    parts.push([ball(r0 * 1.05), b], [zc(r0 * 0.95, r1, len, R.A, 10), b]);
    parts.push([at(bcyl(r0 * 0.5, 0.006, 0.002, R.B, 8), [0, -r0 * 0.85, len * 0.5]).rotateX(0), b]);
    if (j === 3) parts.push([at(sph(r1 * 1.3, R.GLOW, 8, 6), [0, 0, len]), b]);
  }
  for (let k = 0; k < 3; k++) parts.push([sph(0.035, [RX.HAZ, R.C, R.GLOW][k], 12, 9), I('jb' + k)]);
  return { key: 'octo:' + seed, seed, defs, parts, face: hd.face, pal, eye: sch.eye, scale: 1.1, d: { segL }, hidden: [I('jb0'), I('jb1'), I('jb2')] };
}

// crab: no head, one wide flat carapace. Bones: 0 root, 1 carapace, 2 eyestalk pair (lens eyes, springy), legs (3 per
// side: coxa, tibia), claws (arm, claw, jaw) x2, antennae x2
function crabLook(seed) {
  const r = rng(seed * 2711 + 5), sch = pickScheme(r), pal = palette(sch, { A: [0xd9483b, 0xf28c38, 0x2c5cc5, 0x7d7a3a][seed % 4] });
  const ex = 0.042, ey = 0.06, er = 0.017; // eye lens centre (x, y above the stalk root) and radius
  const L = [['root', null, [0, 0.1, 0]], ['shell', 'root', [0, 0, 0]], ['head', 'shell', [0, 0.038, 0.06]]];
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) for (let k = 0; k < 3; k++) L.push(['c' + n + k, 'shell', [s * 0.1, -0.005, 0.04 - k * 0.05], 'YZX'], ['b' + n + k, 'c' + n + k, [s * 0.08, 0, 0], 'YZX']);
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) L.push(['arm' + n, 'shell', [s * 0.13, 0.0, 0.075], 'YXZ'], ['claw' + n, 'arm' + n, [0, 0, 0.09], 'YXZ'], ['jaw' + n, 'claw' + n, [0, 0.018, 0.03]]);
  L.push(['aL', 'head', [0.012, 0.03, 0.012]], ['aR', 'head', [-0.012, 0.03, 0.012]]);
  const defs = skel(L), I = (n) => defs.findIndex((d) => d.n === n), parts = [];
  // carapace: wide, flat, bevelled; rim band, side spikes, front teeth, mouth plate, screws, a hazard stripe
  parts.push([lathe(prof([[0, -0.035, 0, R.B], [0.11, -0.035, 0.03, R.B], [0.14, -0.008, 0, R.B], [0.14, -0.002, 0, R.DARK], [0.138, 0.004, 0, R.A], [0.12, 0.03, 0.035, R.A], [0.05, 0.045, 0.03, R.A], [0, 0.046, 0, R.A]]), 30, 1.32, 0.8), 1]);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) parts.push([at(cone(0.011, 0.034, R.A, 5), [s * (0.18 - k * 0.012), 0.0, 0.03 - k * 0.035], [0, 0, -s * P / 2]), 1]);
  for (let k = -2; k <= 2; k++) parts.push([at(cone(0.01, 0.026, R.A, 5), [k * 0.028, 0.004, 0.108 - Math.abs(k) * 0.006], [P / 2, 0, 0]), 1]);
  parts.push([at(rbox(0.09, 0.03, 0.014, 0.006, R.DARK), [0, -0.012, 0.106]), 1], [at(rbox(0.07, 0.004, 0.004, 0.001, R.CHROME), [0, -0.006, 0.114]), 1], [at(rbox(0.07, 0.004, 0.004, 0.001, R.CHROME), [0, -0.016, 0.114]), 1]);
  for (const s of [-1, 1]) parts.push([at(rbox(0.022, 0.026, 0.01, 0.004, R.B), [s * 0.028, -0.026, 0.11], [0.3, 0, s * 0.2]), 1]);
  for (const s of [-1, 1]) parts.push([screw([s * 0.1, 0.03, 0.0], 0.008, [s * 0.4, 1, 0]), 1], [screw([s * 0.06, 0.04, -0.06], 0.007, [s * 0.3, 1, -0.3]), 1]);
  parts.push([at(rbox(0.16, 0.006, 0.02, 0.003, RX.HAZ), [0, 0.045, -0.03]), 1], [at(bcyl(0.024, 0.006, 0.002, R.GLOW, 12), [0, 0.044, 0.01]), 1]);
  // eyestalks on top of the shell: two coil stalks, eye housings with lens eyes facing forward (the face shader reads
  // these lenses on bone 2 like a robot head)
  for (const s of [-1, 1]) {
    parts.push([at(ball(0.014, R.DARK), [s * ex * 0.6, 0, 0]), 2], [place(coil(0.008, 0.0028, 4, R.CHROME, ey - 0.015), [s * ex * 0.6, 0, 0], [0, 0, -s * 0.35]), 2]);
    parts.push([at(sph(0.025, R.A, 14, 10), [s * ex, ey, -0.006]), 2], [place(bcyl(er + 0.005, 0.012, 0.003, R.CHROME, 18), [s * ex, ey, 0.004], [P / 2, 0, 0]), 2], [place(bcyl(er, 0.004, 0.0015, R.LENS, 22), [s * ex, ey, 0.016], [P / 2, 0, 0]), 2]);
    parts.push([at(rbox(0.03, 0.008, 0.02, 0.004, R.B), [s * ex, ey + 0.024, 0.0], [0.2, 0, 0]), 2]);
  }
  const face = { mode: 2, led: 0, mouth: 0, lens0: [ex, ey, 0.02, er], lens1: [-ex, ey, 0.02, er] };
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) for (let k = 0; k < 3; k++) {
    parts.push([ball(0.016), I('c' + n + k)], [xc(0.012, 0.01, 0.08, s, R.A, 8), I('c' + n + k)]);
    parts.push([ball(0.012), I('b' + n + k)], [xc(0.009, 0.003, 0.1, s, R.B, 8), I('b' + n + k)]);
  }
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    parts.push([ball(0.02), I('arm' + n)], [zc(0.016, 0.014, 0.09, R.A, 10), I('arm' + n)]);
    parts.push([ball(0.019), I('claw' + n)], [at(rbox(0.05, 0.035, 0.07, 0.015, R.A), [0, -0.005, 0.035]), I('claw' + n)], [at(cone(0.016, 0.05, R.A, 6), [0, -0.012, 0.09], [P / 2, 0, 0]), I('claw' + n)]);
    parts.push([at(rbox(0.03, 0.016, 0.07, 0.007, R.B), [0, 0, 0.04]), I('jaw' + n)], [at(cone(0.01, 0.03, R.B, 5), [0, 0, 0.085], [P / 2, 0, 0]), I('jaw' + n)]);
  }
  for (const n of ['aL', 'aR']) parts.push([ycu(0.003, 0.002, 0.08, R.CHROME, 4), I(n)], [at(sph(0.008, R.GLOW, 6, 5), [0, 0.08, 0]), I(n)]);
  return { key: 'crab:' + seed, seed, defs, parts, face, pal, eye: sch.eye, scale: 1.3, d: {}, hidden: [] };
}

// snake. Bones placed absolutely along a trail: 0 anchor, 1 neck, 2 head, 3..18 body, 19 rattle, 20 tongue
const SN = 16, SN_SP = 0.07;
function snakeLook(seed) {
  const r = rng(seed * 6007 + 11), sch = pickScheme(r), pal = palette(sch);
  const hk = ['pill', 'bino', 'bucket'][Math.floor(r() * 3)], hd = headPart(hk, 0.52);
  const L = [['anchor', null, [0, 0, 0]], ['neck', null, [0, 0, 0]], ['head', null, [0, 0, 0]]];
  for (let i = 0; i < SN; i++) L.push(['s' + i, null, [0, 0, 0]]);
  L.push(['rattle', null, [0, 0, 0]], ['tongue', 'head', [0, 0.03, hd.front + 0.005]]);
  const defs = skel(L), I = (n) => defs.findIndex((d) => d.n === n), parts = [];
  const rad = (i) => 0.046 * (1 - Math.pow(i / (SN + 1), 1.4) * 0.65);
  parts.push([zcn(0.044, 0.042, SN_SP, R.A, 12), 1], [ball(0.046), 1]);
  parts.push([hd.geo, 2], [at(rbox(hd.w * 1.5, 0.012, 0.06, 0.005, R.DARK), [0, 0.01, hd.front - 0.02]), 2]);
  for (const s of [-1, 1]) parts.push([at(cone(0.008, 0.03, R.WHITE, 5), [s * 0.025, 0.0, hd.front - 0.0], [P, 0, 0]), 2]);
  for (let i = 0; i < SN; i++) {
    const rr = rad(i + 1), b = I('s' + i), stripe = i % 3 === 1;
    parts.push([zcn(rr, rad(i + 2), SN_SP * 0.86, stripe ? R.B : R.A, 12), b], [at(tor(rr * 0.96, 0.005, R.CHROME, 4, 14), [0, 0, -0.004]), b]);
    if (i % 2 === 0) parts.push([at(rbox(rr * 0.9, 0.008, SN_SP * 0.5, 0.003, R.C), [0, rr * 0.92, -SN_SP * 0.45]), b]);
  }
  for (let k = 0; k < 3; k++) parts.push([at(bcyl(0.018 - k * 0.003, 0.016, 0.004, k % 2 ? R.B : RX.HAZ, 10), [0, 0, -k * 0.016], [-P / 2, 0, 0]), I('rattle')]);
  parts.push([at(rbox(0.008, 0.004, 0.04, 0.002, RX.HA), [0, 0, 0.02]), I('tongue')], [at(rbox(0.016, 0.004, 0.012, 0.002, RX.HA), [0, 0, 0.042]), I('tongue')]);
  return { key: 'snake:' + seed, seed, defs, parts, face: hd.face, pal, eye: sch.eye, scale: 1.25, d: { rad }, hidden: [] };
}

// frog. Bones: 0 root, 1 body, 2 head, back legs (thigh, shin, foot) x2, front legs (arm, hand) x2, throat, tongue
function frogLook(seed) {
  const r = rng(seed * 3301 + 7), sch = pickScheme(r), pal = palette(sch, { A: [0x4f9d4a, 0x7fd1b9, 0xe3b23c, 0x2c5cc5][seed % 4] });
  const hk = ['bino', 'orb', 'bucket'][Math.floor(r() * 3)], hd = headPart(hk, 0.58);
  const defs = skel([['root', null, [0, 0.07, 0]], ['body', 'root', [0, 0, 0]], ['head', 'body', [0, 0.04, 0.06]],
    ['thL', 'body', [0.07, -0.01, -0.06], 'YZX'], ['shL', 'thL', [0.1, 0, 0], 'YZX'], ['ftL', 'shL', [0.1, 0, 0], 'YZX'],
    ['thR', 'body', [-0.07, -0.01, -0.06], 'YZX'], ['shR', 'thR', [-0.1, 0, 0], 'YZX'], ['ftR', 'shR', [-0.1, 0, 0], 'YZX'],
    ['arL', 'body', [0.06, -0.01, 0.06]], ['haL', 'arL', [0, -0.06, 0]], ['arR', 'body', [-0.06, -0.01, 0.06]], ['haR', 'arR', [0, -0.06, 0]],
    ['throat', 'body', [0, -0.03, 0.08]], ['tongue', 'head', [0, 0.02, hd.front - 0.01]]]);
  const I = (n) => defs.findIndex((d) => d.n === n), parts = [];
  parts.push([at(rbox(0.17, 0.09, 0.19, 0.04, R.A), [0, 0, 0]), 1], [at(rbox(0.175, 0.03, 0.15, 0.012, R.WHITE), [0, -0.035, 0.01]), 1], [at(rbox(0.16, 0.012, 0.012, 0.005, R.DARK), [0, 0.0, 0.096]), 1]);
  for (let k = 0; k < 4; k++) parts.push([at(sph(0.014 + r() * 0.01, R.C, 8, 6), [(r() - 0.5) * 0.12, 0.045, (r() - 0.5) * 0.14]), 1]);
  for (const s of [-1, 1]) parts.push([screw([s * 0.086, 0.01, -0.04], 0.008, [s, 0, 0]), 1]);
  parts.push([hd.geo, 2]);
  for (const [t, sh, f, s] of [['thL', 'shL', 'ftL', 1], ['thR', 'shR', 'ftR', -1]]) {
    parts.push([ball(0.03), I(t)], [xc(0.026, 0.02, 0.1, s, R.A, 10), I(t)]);
    parts.push([ball(0.02), I(sh)], [xc(0.016, 0.012, 0.1, s, R.B, 8), I(sh)]);
    parts.push([ball(0.014), I(f)], [at(rbox(0.06, 0.012, 0.05, 0.005, R.RUBBER), [s * 0.03, -0.004, 0])]);
    parts[parts.length - 1].push(I(f));
  }
  for (const [a, h, s] of [['arL', 'haL', 1], ['arR', 'haR', -1]]) {
    parts.push([ball(0.018), I(a)], [yc(0.012, 0.01, 0.06, R.A, 8), I(a)]);
    parts.push([ball(0.012), I(h)], [at(rbox(0.04, 0.01, 0.035, 0.004, R.RUBBER), [s * 0.005, -0.004, 0.012])]);
    parts[parts.length - 1].push(I(h));
  }
  parts.push([at(sph(0.04, R.B, 12, 9), [0, -0.005, 0], [0, 0, 0], [1, 0.6, 0.9]), I('throat')]);
  parts.push([at(rbox(0.024, 0.008, 0.03, 0.004, RX.HA), [0, 0, 0.015]), I('tongue')], [at(sph(0.016, RX.HA, 8, 6), [0, 0, 0.032]), I('tongue')]);
  return { key: 'frog:' + seed, seed, defs, parts, face: hd.face, pal, eye: sch.eye, scale: 1.3, d: {}, hidden: [] };
}

// turtle. Bones: 0 root, 1 shell, 2 head, 3 neck, 4..7 legs, 8 tail
function turtleLook(seed) {
  const r = rng(seed * 5009 + 13), sch = pickScheme(r), pal = palette(sch, { A: [0x4f7d4a, 0x7d7a3a, 0x3a6f78, 0xb5532f][seed % 4] });
  const hk = ['pill', 'bucket', 'orb'][Math.floor(r() * 3)], hd = headPart(hk, 0.5);
  const defs = skel([['root', null, [0, 0.085, 0]], ['shell', 'root', [0, 0, 0]], ['head', 'neck', [0, 0.0, 0.075]], ['neck', 'shell', [0, 0.01, 0.17]],
    ['FL', 'shell', [0.11, -0.02, 0.08]], ['FR', 'shell', [-0.11, -0.02, 0.08]], ['BL', 'shell', [0.11, -0.02, -0.09]], ['BR', 'shell', [-0.11, -0.02, -0.09]], ['tail', 'shell', [0, -0.01, -0.17]]]);
  const I = (n) => defs.findIndex((d) => d.n === n), parts = [];
  parts.push([lathe(prof([[0, -0.03, 0, R.B], [0.17, -0.03, 0.02, R.B], [0.19, 0.0, 0, R.B], [0.19, 0.008, 0, R.DARK], [0.185, 0.02, 0, R.A], [0.14, 0.09, 0.05, R.A], [0, 0.12, 0, R.A]]), 30, 1, 1.12), 1]);
  for (let k = 0; k < 6; k++) { const a = k / 6 * P * 2; parts.push([at(rbox(0.07, 0.012, 0.07, 0.01, R.C), [Math.sin(a) * 0.1, 0.075, Math.cos(a) * 0.11], [-Math.cos(a) * 0.5, a, 0]), 1], [screw([Math.sin(a) * 0.165, 0.03, Math.cos(a) * 0.18], 0.008, [Math.sin(a), 0.6, Math.cos(a)]), 1]); }
  parts.push([at(rbox(0.08, 0.014, 0.08, 0.012, R.C), [0, 0.118, 0], [0, P / 4, 0]), 1]);
  parts.push([coilZ(0.028, 0.005, 0.07, 4), 3], [ball(0.03), 3], [hd.geo, 2]);
  for (const n of ['FL', 'FR', 'BL', 'BR']) parts.push([ball(0.03), I(n)], [yc(0.028, 0.03, 0.05, R.B, 10), I(n)], [at(rbox(0.07, 0.022, 0.07, 0.012, R.RUBBER), [0, -0.055, 0.01]), I(n)]);
  parts.push([at(cone(0.02, 0.06, R.B, 8), [0, 0, -0.03], [-P / 2, 0, 0]), I('tail')]);
  return { key: 'turtle:' + seed, seed, defs, parts, face: hd.face, pal, eye: sch.eye, scale: 1.25, d: {}, hidden: [] };
}

// bee drone. Bones: 0 root, 1 thorax, 2 head, 3 abdomen, wings (L, L2, R, R2), 8 stinger, antennae L (2) R (2), 6 legs
function beeLook(seed) {
  const r = rng(seed * 8803 + 17), sch = pickScheme(r), pal = palette(sch, { A: 0xe8b923, B: 0x24252a, C: 0xffffff });
  const hd = headPart(['orb', 'bino', 'monocle'][seed % 3], 0.42);
  const L = [['root', null, [0, 0.55, 0]], ['thorax', 'root', [0, 0, 0]], ['head', 'thorax', [0, 0.0, 0.06]], ['abd', 'thorax', [0, 0.0, -0.05]],
    ['wL', 'thorax', [0.03, 0.045, 0.0], 'YZX'], ['wL2', 'thorax', [0.03, 0.04, -0.03], 'YZX'], ['wR', 'thorax', [-0.03, 0.045, 0.0], 'YZX'], ['wR2', 'thorax', [-0.03, 0.04, -0.03], 'YZX'],
    ['sting', 'abd', [0, -0.01, -0.15]], ['aL0', 'head', [0.03, hd.top - 0.01, 0.0]], ['aL1', 'aL0', [0, 0.045, 0]], ['aR0', 'head', [-0.03, hd.top - 0.01, 0.0]], ['aR1', 'aR0', [0, 0.045, 0]]];
  for (let k = 0; k < 6; k++) L.push(['g' + k, 'thorax', [(k % 2 ? -1 : 1) * 0.035, -0.04, 0.03 - Math.floor(k / 2) * 0.03]]);
  const defs = skel(L), I = (n) => defs.findIndex((d) => d.n === n), parts = [];
  parts.push([sph(0.06, R.A, 16, 12), 1], [at(tor(0.058, 0.008, R.B, 6, 20), [0, 0, 0], [0, 0, 0]), 1], [screw([0, 0.06, 0], 0.008, [0, 1, 0]), 1]);
  parts.push([hd.geo, 2]);
  parts.push([lathe(prof([[0, 0, 0, R.B], [0.05, 0.01, 0.02, R.B], [0.062, 0.03, 0, RX.HAZ], [0.062, 0.05, 0, RX.HAZ], [0.06, 0.055, 0, R.B], [0.058, 0.075, 0, R.B], [0.052, 0.08, 0, RX.HAZ], [0.045, 0.1, 0, RX.HAZ], [0.035, 0.105, 0, R.B], [0, 0.15, 0, R.B]]), 18).rotateX(-P / 2), 3]);
  parts.push([at(cone(0.01, 0.04, R.CHROME, 6), [0, 0, -0.015], [-P / 2, 0, 0]), I('sting')]);
  for (const [n, s, big] of [['wL', 1, 1], ['wL2', 1, 0], ['wR', -1, 1], ['wR2', -1, 0]]) parts.push([at(rbox(big ? 0.13 : 0.09, 0.004, big ? 0.05 : 0.035, 0.004, R.SCREEN), [s * (big ? 0.065 : 0.045), 0, 0]), I(n)], [at(rbox(big ? 0.13 : 0.09, 0.006, 0.006, 0.002, R.CHROME), [s * (big ? 0.065 : 0.045), 0.002, big ? 0.022 : 0.015]), I(n)]);
  for (const n of ['aL0', 'aL1', 'aR0', 'aR1']) parts.push([ycu(0.003, 0.003, 0.045, R.DARK, 4), I(n)]);
  for (const n of ['aL1', 'aR1']) parts.push([at(sph(0.01, R.GLOW, 6, 5), [0, 0.045, 0]), I(n)]);
  for (let k = 0; k < 6; k++) parts.push([yc(0.005, 0.004, 0.06, R.DARK, 5), I('g' + k)], [ball(0.008, R.DARK), I('g' + k)]);
  return { key: 'bee:' + seed, seed, defs, parts, face: hd.face, pal, eye: sch.eye, scale: 1.3, d: {}, hidden: [] };
}

/* ------------------------------------------------------------------ springs and the per-instance skeleton */
class Spr { constructor() { this.x = 0; this.v = 0; } step(t, k, z, dt) { const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n; for (let i = 0; i < n; i++) { this.v += (k * (t - this.x) - z * this.v) * h; this.x += this.v * h; } return this.x; } }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = V(), _s = V();
class Skel {
  constructor(defs) {
    this.defs = defs; this.n = defs.length; this.M = defs.map(() => new THREE.Matrix4());
    this.r = defs.map(() => [0, 0, 0]); this.d = defs.map(() => [0, 0, 0]); this.s = defs.map(() => [1, 1, 1]); this.abs = new Array(this.n).fill(null); this.hide = new Uint8Array(this.n);
    this.order = []; const seen = new Set(); const visit = (i) => { if (seen.has(i)) return; const p = defs[i].p; if (p >= 0) visit(p); seen.add(i); this.order.push(i); }; for (let i = 0; i < this.n; i++) visit(i);
  }
  reset() { for (let i = 0; i < this.n; i++) { const r = this.r[i], d = this.d[i], s = this.s[i]; r[0] = r[1] = r[2] = 0; d[0] = d[1] = d[2] = 0; s[0] = s[1] = s[2] = 1; this.abs[i] = null; } }
  compute() {
    for (const i of this.order) {
      const df = this.defs[i], M = this.M[i];
      if (this.abs[i]) { M.copy(this.abs[i]); continue; }
      const r = this.r[i], d = this.d[i], s = this.s[i];
      _q.setFromEuler(_e.set(r[0], r[1], r[2], df.ord)); M.compose(_v.set(df.o[0] + d[0], df.o[1] + d[1], df.o[2] + d[2]), _q, _s.set(s[0], s[1], s[2]));
      if (df.p >= 0) M.premultiply(this.M[df.p]);
    }
  }
}

/* ------------------------------------------------------------------ species table: look builders, actions, poses */
const COMMON = { hit: { vi: 'Trúng đòn', dur: 0.8 }, fall: { vi: 'Ngã rồi dậy', dur: 3.2 }, happy: { vi: 'Vui', dur: 3 }, sad: { vi: 'Buồn', dur: 3 }, scared: { vi: 'Sợ', dur: 3 } };
export const SPECIES = {
  dog: { vi: 'Chó', look: (s) => quadLook(s, false), acts: { sit: { vi: 'Ngồi', dur: 3.2 }, bark: { vi: 'Sủa', dur: 1.8 }, fetch: { vi: 'Nhặt bóng', dur: 3.2 }, tilt: { vi: 'Nghiêng đầu', dur: 2.4 } } },
  cat: { vi: 'Mèo', look: (s) => quadLook(s, true), acts: { pounce: { vi: 'Vồ', dur: 2.2 }, stretch: { vi: 'Vươn vai', dur: 2.8 }, sit: { vi: 'Ngồi', dur: 3.2 } } },
  bird: { vi: 'Chim', look: birdLook, acts: { peck: { vi: 'Mổ', dur: 2 }, flap: { vi: 'Vỗ cánh', dur: 1.8 }, takeoff: { vi: 'Cất cánh, lượn, đáp', dur: 6 } } },
  octo: { vi: 'Bạch tuộc', look: octoLook, acts: { reach: { vi: 'Tò mò với', dur: 3 }, ink: { vi: 'Phun mực', dur: 2.2 }, juggle: { vi: 'Tung hứng', dur: 4.5 } } },
  crab: { vi: 'Cua', look: crabLook, acts: { snap: { vi: 'Kẹp càng', dur: 1.8 }, wave: { vi: 'Vẫy càng', dur: 2.4 }, dig: { vi: 'Đào cát', dur: 2.6 } } },
  snake: { vi: 'Rắn', look: snakeLook, acts: { strike: { vi: 'Mổ chớp nhoáng', dur: 1.8 }, coil: { vi: 'Cuộn tròn', dur: 3.5 }, rattle: { vi: 'Lắc đuôi', dur: 2.2 } } },
  frog: { vi: 'Ếch', look: frogLook, acts: { jump: { vi: 'Nhảy xa', dur: 1.6 }, croak: { vi: 'Ộp ộp', dur: 2.2 }, tongue: { vi: 'Phóng lưỡi', dur: 1.4 } } },
  turtle: { vi: 'Rùa', look: turtleLook, acts: { hide: { vi: 'Rụt vào mai', dur: 3.6 }, spin: { vi: 'Lật ngửa xoay', dur: 3.6 }, sleep: { vi: 'Ngủ gật', dur: 3.5 } } },
  bee: { vi: 'Ong máy', look: beeLook, acts: { buzz: { vi: 'Bay số 8', dur: 3 }, sting: { vi: 'Chích', dur: 1.6 }, pollen: { vi: 'Hút mật', dur: 3 } } },
};
export const SPECIES_IDS = Object.keys(SPECIES);
for (const id of SPECIES_IDS) SPECIES[id].acts = Object.assign({}, SPECIES[id].acts, COMMON);

/* ------------------------------------------------------------------ one animal */
export class Beast {
  constructor(sys, sp, seed, o = {}) {
    this.sys = sys; this.sp = sp; this.S = SPECIES[sp]; this.seed = seed; this.look = sys.look(sp, seed); this.pr = sys.crowd.protoRaw(this.look.key, sys.protoData(this.look));
    this.slot = sys.crowd.alloc(); this.k = (this.look.scale || 1) * (o.scale || 1);
    this.skel = new Skel(this.look.defs); this.x = o.x || 0; this.z = o.z || 0; this.y = 0; this.yaw = o.yaw || 0; this.speed = 0; this.t = Math.random() * 10; this.ph = Math.random() * 6;
    this.act = null; this.mood = null; this.moodK = 0; this.emo = 'neutral'; this.blink = 0; this.blinkT = 1 + Math.random() * 3; this.look2 = [0, 0]; this.lookT = 0; this.flash = 0;
    this.spr = {}; this.fid = null; this.fidT = 2 + Math.random() * 3; this.prevYaw = this.yaw; this.yawRate = 0; this.ev = []; this.carry = false; this.fly = 0; this.params = new Float32Array(8);
    this.trail = null; this.label = SPECIES[sp].vi; this.home = [this.x, this.z]; this.hidden = new Set(this.look.hidden);
  }
  s(name) { return this.spr[name] || (this.spr[name] = new Spr()); }
  do(name) { const a = this.S.acts[name]; if (!a) return false; this.act = { name, t: 0, dur: a.dur }; if (name === 'hit') { this.flash = 1; this.s('jolt').v += 14; this.s('joltz').v += (Math.random() - 0.5) * 18; } if (name === 'happy' || name === 'sad' || name === 'scared') this.mood = name; return true; }
  get u() { return this.act ? Math.min(1, this.act.t / this.act.dur) : 0; }
  is(n) { return this.act && this.act.name === n; }
  update(dt) {
    this.t += dt; if (this.act) { this.act.t += dt; if (this.act.t >= this.act.dur) { if (this.act.name === this.mood) this.mood = null; this.act = null; } }
    this.moodK += ((this.mood ? 1 : 0) - this.moodK) * (1 - Math.exp(-dt * 4));
    let dy = this.yaw - this.prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yawRate = dt > 0 ? dy / dt : 0; this.prevYaw = this.yaw;
    this.blinkT -= dt; if (this.blinkT <= 0) { this.blink = 1; this.blinkT = 2 + Math.random() * 3; } this.blink = Math.max(0, this.blink - dt * 7);
    this.lookT -= dt; if (this.lookT <= 0) { this.lookT = 1.2 + Math.random() * 2.5; this.lookTo = Math.random() < 0.4 ? [0, 0] : [(Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.6]; }
    const lt = this.lookTo || [0, 0]; this.look2[0] += (lt[0] - this.look2[0]) * (1 - Math.exp(-dt * 5)); this.look2[1] += (lt[1] - this.look2[1]) * (1 - Math.exp(-dt * 5));
    this.fidT -= dt; if (this.fidT <= 0 && !this.act && this.speed < 0.05) { this.fid = { t: 0, n: Math.floor(Math.random() * 3) }; this.fidT = 3 + Math.random() * 4; } if (this.fid) { this.fid.t += dt; if (this.fid.t > 1.6) this.fid = null; }
    this.flash = Math.max(0, this.flash - dt * 4);
    this.emo = this.mood === 'happy' ? 'happy' : this.mood === 'sad' ? 'sad' : this.mood === 'scared' ? 'scared' : 'neutral';
    const S = this.skel; S.reset(); for (let i = 0; i < S.n; i++) S.hide[i] = this.hidden.has(i) ? 1 : 0;
    POSE[this.sp](this, dt, S);
    // hit jolt and the fall roll act on the root bone for every species but the snake (it rolls its segments)
    const jo = this.s('jolt').step(0, 160, 9, dt), jz = this.s('joltz').step(0, 160, 9, dt);
    if (this.sp !== 'snake') { S.r[0][0] -= jo * 0.06; S.r[0][2] += jz * 0.05; }
    if (this.is('hit')) this.emo = 'scared';
    S.compute();
  }
  write(crowd) {
    const D = crowd.data, o = crowd.row(this.slot), S = this.skel;
    for (let b = 0; b < S.n; b++) {
      const q = o + b * 12; if (S.hide[b]) { D.fill(0, q, q + 12); continue; }
      const e = S.M[b].elements; D[q] = e[0]; D[q + 1] = e[4]; D[q + 2] = e[8]; D[q + 3] = e[12]; D[q + 4] = e[1]; D[q + 5] = e[5]; D[q + 6] = e[9]; D[q + 7] = e[13]; D[q + 8] = e[2]; D[q + 9] = e[6]; D[q + 10] = e[10]; D[q + 11] = e[14];
    }
    const k = this.k; _m.compose(_v.set(this.x, this.y, this.z), _q.setFromAxisAngle(V(0, 1, 0), this.yaw), _s.set(k, k, k)); const e = _m.elements, q = o + B_ROOT * 4;
    D[q] = e[0]; D[q + 1] = e[4]; D[q + 2] = e[8]; D[q + 3] = e[12]; D[q + 4] = e[1]; D[q + 5] = e[5]; D[q + 6] = e[9]; D[q + 7] = e[13]; D[q + 8] = e[2]; D[q + 9] = e[6]; D[q + 10] = e[10]; D[q + 11] = e[14];
    const p = this.params; p[0] = EMO[this.emo] ?? 0; p[1] = this.blink > 0 ? Math.sin(this.blink * P) : 0; p[2] = this.look2[0]; p[3] = this.look2[1]; p[4] = this.flash; p[5] = 1; p[6] = 1; p[7] = (this.seed % 97) / 97;
    D.set(p, o + B_PAR * 4);
  }
  // world point of a bone-local point
  bpoint(name, x = 0, y = 0, z = 0) { const i = this.look.defs.findIndex((d) => d.n === name); const k = this.k; return V(x, y, z).applyMatrix4(this.skel.M[Math.max(0, i)]).multiplyScalar(k).applyAxisAngle(V(0, 1, 0), this.yaw).add(V(this.x, this.y, this.z)); }
}

/* ------------------------------------------------------------------ poses */
const fallK = (b) => b.is('fall') ? (b.u < 0.22 ? sst(0, 0.22, b.u) : b.u < 0.68 ? 1 : 1 - sst(0.68, 0.92, b.u)) : 0;
const happyBounce = (b) => b.moodK * (b.mood === 'happy' ? Math.abs(Math.sin(b.t * 9)) : 0);
function chainSpring(b, name, n, tx, ty, k0, dt, inX = 0, inY = 0) { // follow-through chain: returns arrays of x / y angles
  const ox = [], oy = [];
  for (let i = 0; i < n; i++) { const kx = k0 * (1 - i / (n + 1) * 0.6); ox.push(b.s(name + 'x' + i).step(tx[i] + inX * (i + 1), kx, Math.sqrt(kx) * 0.9, dt)); oy.push(b.s(name + 'y' + i).step(ty[i] + inY * (i + 1), kx, Math.sqrt(kx) * 0.9, dt)); }
  return [ox, oy];
}
const POSE = {};
POSE.dog = POSE.cat = function (b, dt, S) {
  const L = b.look.d, I = (n) => b.look.defs.findIndex((d) => d.n === n), cat = L.cat, t = b.t;
  const run = b.speed > (cat ? 1.0 : 1.2), stride = run ? 0.75 : 0.38;
  b.ph += dt * (b.speed / stride) * P * 2; const gk = sst(0.02, 0.25, b.speed), rk = sst(0.9, 1.6, b.speed);
  const fk = fallK(b), mh = happyBounce(b), sad = b.mood === 'sad' ? b.moodK : 0, scared = b.mood === 'scared' ? b.moodK : 0;
  let hipY = L.hipH - 0.02, hipP = 0, chestP = 0, headP = 0, headY = b.look2[0] * 0.5, headR = 0, tailUp = cat ? 0.75 : 0.55, wag = 0, wagF = 9, earBack = 0;
  const legA = { FL: [0.08, -0.12, 0.04], FR: [0.08, -0.12, 0.04], BL: [-0.32, 0.6, -0.28], BR: [-0.32, 0.6, -0.28] };
  // gait: trot (diagonal pairs), gallop when running (pairs, spine flex)
  const off = run ? { FL: 0, FR: 0.5, BL: P + 0.3, BR: P + 0.8 } : { FL: 0, BR: 0, FR: P, BL: P };
  for (const n of ['FL', 'FR', 'BL', 'BR']) {
    const ph = b.ph + off[n], A = (run ? 0.75 : 0.42) * gk, sw = Math.sin(ph) * A, lift = Math.max(0, Math.cos(ph)) * gk, front = n[0] === 'F';
    legA[n][0] -= sw; legA[n][1] += (front ? 0.9 : 0.5) * lift * (run ? 1.2 : 1); legA[n][2] += front ? -0.4 * lift : -0.3 * lift; if (!front) legA[n][0] -= 0.25 * lift;
  }
  hipY += -Math.abs(Math.cos(b.ph)) * 0.012 * gk - 0.02 * rk; chestP += Math.sin(b.ph) * 0.12 * rk; hipP -= Math.sin(b.ph) * 0.1 * rk;
  wag = (b.speed > 0.05 ? 0.25 : 0.12) + mh * 0.5; headP += 0.08 * rk;
  // idle breathing and fidgets: sniff the ground, shake, look back
  hipY += 0.004 * Math.sin(t * 2.2);
  if (b.fid && gk < 0.5) { const f = b.fid, k = bump(f.t, 0, 0.3, 1.2, 1.6); if (f.n === 0) { headP += 0.7 * k; chestP += 0.12 * k; } else if (f.n === 1) { S.r[1][2] += Math.sin(f.t * 30) * 0.12 * k; S.r[0][2] -= Math.sin(f.t * 30) * 0.06 * k; earBack += k; } else { headY += 1.0 * k * (b.seed % 2 ? 1 : -1); S.r[1][1] += 0.25 * k * (b.seed % 2 ? 1 : -1); } }
  // actions
  const u = b.u;
  if (b.is('sit')) { const k = bump(u, 0, 0.18, 0.85, 1); hipP -= 0.75 * k; hipY -= 0.11 * k; legA.BL = [lerp(legA.BL[0], -1.5, k), lerp(legA.BL[1], 2.35, k), lerp(legA.BL[2], -0.4, k)]; legA.BR = legA.BL.slice(); for (const n of ['FL', 'FR']) legA[n][0] += 0.72 * k; tailUp -= 0.9 * k; wag += 0.2 * k; if (u > 0.4 && u < 0.8) b.emo = 'happy'; }
  if (b.is('bark')) { const n = Math.floor(u * 4), f = (u * 4) % 1, k = bump(u, 0, 0.08, 0.9, 1), j = n < 3 ? bump(f, 0, 0.15, 0.35, 0.7) : 0; headP += -0.25 * k + 0.35 * j; chestP += 0.06 * j; hipY -= 0.02 * k; for (const L2 of ['FL', 'FR']) legA[L2][0] -= 0.15 * k; b.emo = j > 0.2 ? 'angry' : 'neutral'; earBack += 0.5 * j; if (j > 0.9 && !b._bk) { b._bk = 1; b.ev.push({ e: 'bark', n }); } if (j < 0.5) b._bk = 0; wag += 0.3 * k; }
  if (b.is('fetch')) { const dn = bump(u, 0.1, 0.32, 0.42, 0.6); headP += 1.0 * dn; chestP += 0.25 * dn; for (const L2 of ['FL', 'FR']) { legA[L2][0] -= 0.2 * dn; legA[L2][1] += 0.3 * dn; } if (u > 0.36 && u < 0.92) S.hide[I('ball')] = 0; if (u > 0.5) { b.emo = 'happy'; wag += 0.6; tailUp += 0.2; } }
  if (b.carry) S.hide[I('ball')] = 0;
  if (b.is('tilt')) { const k = bump(u, 0, 0.15, 0.85, 1), side = u < 0.5 ? 1 : -1; headR += 0.5 * side * k; headP -= 0.1 * k; earBack -= 0.4 * k; b.emo = 'love'; b.look2[0] = 0; }
  if (b.is('pounce')) {
    const crouch = bump(u, 0, 0.25, 0.4, 0.45), air = bump(u, 0.4, 0.5, 0.58, 0.68), land = bump(u, 0.6, 0.68, 0.8, 1), back = sst(0.8, 1, u);
    hipY -= 0.08 * crouch; chestP += 0.2 * crouch; S.r[0][2] += Math.sin(t * 22) * 0.1 * bump(u, 0.12, 0.2, 0.35, 0.4); headP -= 0.15 * crouch;
    const arc = Math.sin(clamp((u - 0.4) / 0.28, 0, 1) * P); hipY += 0.18 * arc; S.d[0][2] += lerp(0.35 * sst(0.4, 0.68, u), 0, back);
    for (const n of ['FL', 'FR']) { legA[n][0] -= 0.9 * air - 0.2 * crouch; legA[n][1] -= 0.2 * air; } for (const n of ['BL', 'BR']) { legA[n][0] += 0.6 * air; legA[n][1] -= 0.4 * air; legA[n][0] -= 0.3 * crouch; legA[n][1] += 0.5 * crouch; }
    hipP += 0.2 * air; hipY -= 0.05 * land; b.emo = air > 0.2 ? 'angry' : crouch > 0.3 ? 'strain' : 'happy'; tailUp += 0.3 * crouch;
  }
  if (b.is('stretch')) { const k = bump(u, 0, 0.25, 0.75, 1); chestP += 0.0; hipP += 0.38 * k; S.d[1][1] -= 0.0; for (const n of ['FL', 'FR']) { legA[n][0] -= 1.0 * k; legA[n][1] += 0.4 * k; legA[n][2] += 0.6 * k; } for (const n of ['BL', 'BR']) { legA[n][0] -= 0.35 * k; legA[n][1] -= 0.25 * k; } headP -= 0.25 * k; tailUp += 0.5 * k; S.r[I('t' + (L.nt - 1))][1] = Math.sin(t * 20) * 0.3 * k; b.emo = u < 0.6 ? 'sleepy' : 'happy'; }
  // moods
  if (sad) { headP += 0.45 * sad; tailUp -= 1.1 * sad; wag *= 1 - sad; earBack += 0.6 * sad; hipY -= 0.02 * sad; }
  if (scared) { hipY -= 0.06 * scared; tailUp -= 1.5 * scared; earBack += 1.2 * scared; S.r[0][2] += Math.sin(t * 40) * 0.025 * scared; headP += 0.2 * scared; hipP += 0.12 * scared; }
  if (mh) { hipY += 0.04 * mh; wagF = 16; }
  // fall: roll onto the side, legs paddle, get back up
  if (fk) { S.r[0][2] += 1.45 * fk; hipY = lerp(hipY, L.bw * 0.55, fk); for (const n of ['FL', 'FR', 'BL', 'BR']) legA[n][0] += Math.sin(t * 13 + n.charCodeAt(1)) * 0.5 * fk * (b.u > 0.25 && b.u < 0.65 ? 1 : 0.3); b.emo = b.u < 0.7 ? 'dizzy' : 'neutral'; }
  S.d[0][1] = hipY - L.hipH; S.r[0][0] += hipP; S.r[1][0] += chestP - hipP * 0.4;
  S.r[3][0] = -0.25 + headP * 0.5; S.r[2][0] = headP * 0.5; S.r[2][1] = headY; S.r[2][2] = headR; S.r[3][1] = headY * 0.3;
  for (const n of ['FL', 'FR', 'BL', 'BR']) { const a = legA[n], hipComp = n[0] === 'B' ? -hipP : -(hipP + chestP - hipP * 0.4); S.r[I(n + 'u')][0] = a[0] + hipComp; S.r[I(n + 'l')][0] = a[1]; S.r[I(n + 'p')][0] = a[2]; }
  // tail chain (springs: wag on y, curl on x, inertia from turning and bobbing)
  const nt = L.nt, tx = [], ty = [];
  for (let i = 0; i < nt; i++) { tx.push(i ? (cat ? 0.12 + 0.1 * Math.sin(t * 1.3 + i) : -0.12) : tailUp); ty.push(Math.sin(t * wagF - i * 0.6) * wag * (i ? 0.7 : 1)); }
  const [cx, cy] = chainSpring(b, 'tail', nt, tx, ty, 220, dt, 0, -b.yawRate * 0.04);
  for (let i = 0; i < nt; i++) { S.r[I('t' + i)][0] = cx[i]; S.r[I('t' + i)][1] = cy[i]; }
  // ears: floppy ones hang and swing with the head, pointed ones fold back
  for (const [n, s] of [['earL', 1], ['earR', -1]]) { const i = I(n); if (L.flop) { const sx = b.s(n + 'x').step(-headP * 0.6 + earBack * 0.4, 70, 5, dt), sz = b.s(n + 'z').step(s * (0.15 + 0.3 * earBack) - headR * 0.8, 70, 5, dt); S.r[i][0] = sx; S.r[i][2] = sz; } else { S.r[i][0] = -0.5 * earBack; S.r[i][2] = s * (0.1 + 0.3 * earBack) + Math.sin(t * 0.7 + s) * 0.05; } }
};
POSE.bird = function (b, dt, S) {
  const I = (n) => b.look.defs.findIndex((d) => d.n === n), t = b.t, u = b.u, L = b.look.d;
  let rootY = 0, bodyP = -0.1, neckP = -0.2, headP = 0.1, headY = 0, fold = 1, flap = 0, flapR = 0, legBend = 0, tailP = 0.1, dz = 0, dx = 0, yawO = 0, bank = 0;
  // perched idle: jerky head turns (snap to a new angle every ~0.6 s), feather ruffle
  const snap = Math.floor(t / 0.6 + b.seed), hr = Math.sin(snap * 12.9898) * 0.9; headY = b.s('hy').step(hr, 400, 30, dt);
  // hop locomotion
  const hopK = sst(0.02, 0.2, b.speed) * (1 - b.fly);
  if (hopK > 0) { b.ph += dt * 5.5; const f = (b.ph / (P * 2)) % 1, air = Math.sin(clamp(f / 0.6, 0, 1) * P); rootY += 0.05 * air * hopK; legBend += (1 - air) * 0.6 * hopK * bump(f, 0.55, 0.65, 0.9, 1); fold -= 0.25 * air * hopK; bodyP -= 0.1 * air * hopK; }
  if (b.fid && !b.act && hopK < 0.1) { const k = bump(b.fid.t, 0, 0.2, 1.2, 1.6); if (b.fid.n === 0) { fold -= 0.5 * k; flap = Math.sin(b.fid.t * 30) * 0.4 * k; } else if (b.fid.n === 1) { bodyP += 0.5 * k; neckP += 0.5 * k; headP += 0.4 * k * Math.abs(Math.sin(b.fid.t * 12)); } else { S.r[1][2] = Math.sin(b.fid.t * 40) * 0.08 * k; S.s[1][0] = S.s[1][2] = 1 + 0.06 * k; } }
  if (b.is('peck')) { const k = bump(u, 0, 0.12, 0.85, 1), j = Math.max(0, Math.sin(u * P * 2 * 4)) ; bodyP += 0.55 * k; neckP += 0.4 * k + 0.5 * j * k; headP += 0.5 * j * k; tailP -= 0.4 * k; if (j > 0.95 && !b._pk) { b._pk = 1; b.ev.push({ e: 'peck' }); } if (j < 0.5) b._pk = 0; }
  if (b.is('flap')) { const k = bump(u, 0, 0.1, 0.85, 1); fold -= k; flap = Math.sin(t * 26) * 0.9 * k; rootY += 0.02 * k * Math.abs(Math.sin(t * 13)); b.emo = 'happy'; tailP -= 0.3 * k; }
  // take off, glide a circle, land (also driven from outside through b.fly / b.flyFlap)
  let fly = b.fly;
  if (b.is('takeoff')) {
    const crouch = bump(u, 0, 0.05, 0.07, 0.1), up = sst(0.08, 0.3, u), down = sst(0.72, 0.93, u), circ = sst(0.3, 0.72, u) * P * 2;
    fly = Math.max(fly, sst(0.07, 0.12, u) * (1 - sst(0.9, 0.96, u)));
    const R2 = 0.55, a = circ, cx = Math.sin(a) * R2, cz = (1 - Math.cos(a)) * R2 * 0.8;
    rootY += 1.0 * up * (1 - down) - 0.03 * crouch + 0.25 * Math.sin(circ) * (up - down) * 0.3; dx = cx * (1 - down); dz = 0.25 * up * (1 - down) + cz * (1 - down);
    yawO = (u > 0.3 && u < 0.75) ? a : 0; bank = -0.45 * bump(u, 0.3, 0.38, 0.65, 0.72);
    b.flyFlap = u < 0.3 ? 1 : u < 0.72 ? 0.25 : u < 0.93 ? 0.9 : 0; legBend += 0.6 * crouch;
    if (u > 0.72 && u < 0.93) bodyP -= 0.5 * bump(u, 0.75, 0.82, 0.88, 0.93); // flare to land
    if (u > 0.93) { rootY -= 0.02 * bump(u, 0.93, 0.95, 0.97, 1); legBend += 0.5 * bump(u, 0.93, 0.95, 0.97, 1); }
  }
  if (fly > 0.01) {
    const fr = b.flyFlap ?? 1; fold -= fly; const w = t * (14 + 10 * fr); flap += (Math.sin(w) * (0.25 + 0.75 * fr) + 0.15) * fly; flapR = Math.sin(w - 0.7) * 0.5 * fr * fly;
    bodyP += 0.15 * fly; legBend += 0.9 * fly; tailP -= 0.2 * fly;
  }
  const fk = fallK(b), sad = b.mood === 'sad' ? b.moodK : 0, scared = b.mood === 'scared' ? b.moodK : 0, mh = happyBounce(b);
  if (sad) { neckP += 0.5 * sad; fold = Math.max(fold, 1); tailP -= 0.5 * sad; }
  if (scared) { fold -= 0.3 * scared; flap += Math.sin(t * 40) * 0.15 * scared; legBend += 0.4 * scared; S.s[1][0] = S.s[1][2] = 1 + 0.08 * scared; }
  if (mh) { rootY += 0.04 * mh; }
  if (fk) { S.r[0][2] += 1.4 * fk; rootY -= 0.08 * fk; fold -= 0.6 * fk * Math.abs(Math.sin(t * 8)); b.emo = b.u < 0.7 ? 'dizzy' : 'neutral'; }
  fold = clamp(fold, 0, 1);
  S.d[0][0] = dx; S.d[0][1] = rootY; S.d[0][2] = dz; S.r[0][1] = yawO; S.r[0][2] += bank; S.r[1][0] = bodyP; S.r[3][0] = neckP; S.r[2][0] = headP; S.r[2][1] = headY;
  // wings: fold sweeps them back along the body, flap rotates about the body axis
  S.r[I('wL')] = [0, 1.45 * fold, -0.15 * fold + flap]; S.r[I('wR')] = [0, -1.45 * fold, 0.15 * fold - flap];
  S.r[I('wL2')] = [0, 0.25 * fold, flapR]; S.r[I('wR2')] = [0, -0.25 * fold, -flapR];
  if (fold > 0.5) { S.d[I('wL')][0] -= 0.01; S.d[I('wR')][0] += 0.01; }
  S.r[I('lL')][0] = legBend * 0.9 - bodyP * 0 + 0.0; S.r[I('lR')][0] = legBend * 0.9; S.r[I('fL')][0] = -legBend * 0.4; S.r[I('fR')][0] = -legBend * 0.4;
  const tp = b.s('tp').step(tailP + 0.4 * Math.abs(b.yawRate) * 0.05, 150, 10, dt); S.r[I('tail')][0] = tp; S.r[I('tail2')][0] = b.s('tp2').step(tp * 0.5 + Math.sin(t * 3) * 0.05, 90, 6, dt);
  const cr = b.s('crest').step(-headP * 0.5 - rootY * 0.0, 80, 4, dt); S.r[I('c0')][0] = -0.2 + cr; S.r[I('c1')][0] = cr * 1.4;
};
POSE.octo = function (b, dt, S) {
  const I = (n) => b.look.defs.findIndex((d) => d.n === n), t = b.t, u = b.u, segL = b.look.d.segL;
  let rootY = 0, mantP = 0, mantS = 1, crawl = sst(0.02, 0.2, b.speed), swim = b.is('swim') ? 1 : 0;
  b.ph += dt * (2 + b.speed * 11);
  const swimK = b.speed > 0.7 ? sst(0.7, 1.0, b.speed) : 0; swim = Math.max(swim, swimK);
  const reachK = b.is('reach') ? bump(u, 0, 0.2, 0.8, 1) : 0, inkK = b.is('ink') ? bump(u, 0, 0.15, 0.4, 0.8) : 0, jugK = b.is('juggle') ? bump(u, 0, 0.1, 0.9, 1) : (b.juggling ? 1 : 0);
  const fk = fallK(b), mh = happyBounce(b), sad = b.mood === 'sad' ? b.moodK : 0, scared = b.mood === 'scared' ? b.moodK : 0;
  const pulse = 0.5 + 0.5 * Math.sin(t * 7);
  rootY += 0.008 * Math.sin(t * 2) + 0.022 * Math.sin(b.ph * 2) * crawl + 0.35 * swim + 0.06 * swim * pulse + 0.04 * mh - 0.05 * sad - 0.05 * scared;
  mantP += 0.25 * swim - 0.2 * reachK + 0.3 * sad + 0.06 * Math.sin(b.ph * 2 + 1) * crawl; mantS = 1 - 0.12 * inkK - 0.08 * swim * (1 - pulse);
  const vfwd = b.speed;
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * P * 2, fwd = Math.cos(a), ph = b.ph + i * (P / 4) * 3;
    const tg = [0.85, 0.35, -0.25, -0.45];
    for (let j = 0; j < 4; j++) tg[j] += 0.12 * Math.sin(t * 1.7 + i * 0.8 + j * 0.9);
    if (crawl > 0) { const lift = Math.max(0, Math.sin(ph)); tg[0] -= 0.75 * lift * crawl; tg[1] += 0.45 * lift * crawl; tg[2] -= 0.4 * Math.cos(ph) * crawl; tg[3] += 0.3 * Math.sin(ph - 1) * crawl; }
    if (swim > 0) { tg[0] = lerp(tg[0], 1.25 - 0.55 * (1 - pulse), swim); tg[1] = lerp(tg[1], 0.15 + 0.4 * (1 - pulse), swim); tg[2] = lerp(tg[2], 0.1, swim); tg[3] = lerp(tg[3], 0.1, swim); }
    if (reachK && i === 0) { tg[0] = lerp(tg[0], -0.25, reachK); tg[1] = lerp(tg[1], 0.05, reachK); tg[2] = lerp(tg[2], 0.15 + 0.5 * Math.sin(t * 6), reachK); tg[3] = lerp(tg[3], 0.6 * Math.sin(t * 6 - 1), reachK); }
    if (jugK && (i === 0 || i === 7 || i === 1 || i === 6)) { const side = i === 0 || i === 1 ? 0 : 1, k = Math.sin(t * 6 + side * P); tg[0] = lerp(tg[0], -0.55 + 0.25 * k, jugK); tg[1] = lerp(tg[1], -0.45, jugK); tg[2] = lerp(tg[2], -0.35, jugK); tg[3] = lerp(tg[3], -0.3 + 0.3 * k, jugK); }
    if (inkK) { tg[0] += 0.4 * inkK; tg[1] += 0.3 * inkK; }
    if (scared) { tg[0] += 0.35 * scared; tg[1] += 0.4 * scared; tg[2] += 0.5 * scared; tg[3] += 0.5 * scared; }
    if (fk) { tg[0] -= 0.8 * fk; tg[1] += Math.sin(t * 9 + i) * 0.6 * fk; }
    tg[0] += -fwd * vfwd * 0.5; // trailing when moving
    for (let j = 0; j < 4; j++) { const k = 160 - j * 30, n = 't' + i + j; const x = b.s(n).step(tg[j] - b.yawRate * 0.03 * Math.sin(a) * (j + 1), k, Math.sqrt(k) * 0.8, dt); S.r[I(n)][0] = x; if (j === 0) S.r[I(n)][1] = a; S.r[I(n)][2] = 0.15 * Math.sin(t * 2 + i + j) * (j / 3); }
  }
  if (fk) { S.r[0][2] += 1.2 * fk; rootY = lerp(rootY, 0.0, fk); b.emo = b.u < 0.7 ? 'dizzy' : 'neutral'; }
  if (inkK > 0.5 && !b._ink) { b._ink = 1; b.ev.push({ e: 'ink' }); b.emo = 'scared'; } if (!b.is('ink')) b._ink = 0; if (b.is('ink') && u > 0.5) b.emo = 'happy';
  if (reachK) b.emo = 'love'; if (jugK) b.emo = 'happy';
  S.d[0][1] = rootY; S.r[2][0] = mantP + 0.03 * Math.sin(t * 1.3); S.r[2][2] = 0.04 * Math.sin(t * 1.1); S.s[2] = [mantS, 2 - mantS, mantS];
  // juggling balls: three on arcs between the two front tentacle tips
  if (jugK > 0.05) {
    for (let k = 0; k < 3; k++) { const i = I('jb' + k); S.hide[i] = 0; const ph = (t * 1.0 + k / 3) % 1, side = Math.floor(t * 1.0 + k / 3) % 2 ? 1 : -1, x = lerp(-0.16, 0.16, ph) * side, y = 0.42 + 0.4 * Math.sin(ph * P); S.d[i] = [x, y - 0.17, 0.3]; }
  }
};
POSE.crab = function (b, dt, S) {
  const I = (n) => b.look.defs.findIndex((d) => d.n === n), t = b.t, u = b.u;
  const walk = sst(0.02, 0.2, Math.abs(b.speed)); b.ph += dt * (b.speed >= 0 ? 1 : -1) * Math.abs(b.speed) / 0.18 * P * 2;
  let rootY = 0.004 * Math.sin(t * 2.5), shellZ = 0, armUp = 0, armOut = 0, jawO = 0.15, digK = 0;
  const fk = fallK(b), mh = happyBounce(b), scared = b.mood === 'scared' ? b.moodK : 0, sad = b.mood === 'sad' ? b.moodK : 0;
  if (b.is('snap')) { const k = bump(u, 0, 0.12, 0.85, 1); armUp += 0.5 * k; armOut += 0.2 * k; jawO = 0.15 + 0.5 * Math.max(0, Math.sin(u * P * 2 * 4)) * k; b.emo = 'angry'; if (Math.sin(u * P * 8) < -0.9 && !b._sn) { b._sn = 1; b.ev.push({ e: 'snap' }); } if (Math.sin(u * P * 8) > 0) b._sn = 0; }
  if (b.is('wave')) { const k = bump(u, 0, 0.15, 0.85, 1); armUp += 1.1 * k; armOut += 0.3 * k; b.emo = 'happy'; jawO = 0.3 + 0.2 * Math.sin(t * 8); }
  if (b.is('dig')) { digK = bump(u, 0, 0.15, 0.85, 1); rootY -= 0.05 * digK; shellZ += Math.sin(t * 18) * 0.08 * digK; if (Math.random() < 0.3 * digK) b.ev.push({ e: 'dig' }); }
  if (scared) { armUp += 0.6 * scared; rootY -= 0.03 * scared; shellZ += Math.sin(t * 40) * 0.03 * scared; }
  if (sad) { armUp -= 0.3 * sad; rootY -= 0.03 * sad; }
  rootY += 0.03 * mh;
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) for (let k = 0; k < 3; k++) {
    const grp = (k + (s > 0 ? 0 : 1)) % 2, ph = b.ph + grp * P, lift = Math.max(0, Math.sin(ph)) * walk, sw = Math.cos(ph) * walk;
    const splay = (k - 1) * 0.5 * s;
    let cz = 0.45 + 0.35 * lift + 0.15 * digK * Math.sin(t * 20 + k), bz = -1.55 + 0.2 * lift;
    if (fk) { cz += Math.sin(t * 14 + k + s) * 0.5 * fk; }
    S.r[I('c' + n + k)] = [0, splay + sw * 0.3 * (s), s * cz]; S.r[I('b' + n + k)] = [0, 0, s * bz];
  }
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    const w = b.is('wave') ? Math.sin(t * 7 + (s > 0 ? 0 : P)) * 0.4 : 0;
    S.r[I('arm' + n)] = [0.25 - armUp - w, s * (0.5 + armOut), 0]; S.r[I('claw' + n)] = [0.35 - armUp * 0.5, -s * 0.6, 0]; S.r[I('jaw' + n)] = [-jawO, 0, 0];
  }
  for (const n of ['aL', 'aR']) { const i = I(n); S.r[i][0] = b.s(n + 'x').step(-0.3 - armUp * 0.1, 60, 3, dt); S.r[i][2] = b.s(n + 'z').step((n === 'aL' ? -0.25 : 0.25) - b.yawRate * 0.04 - b.speed * 0.4, 60, 3, dt); }
  if (fk) { S.r[0][2] += P * fk; rootY = lerp(rootY, 0.03, fk); b.emo = b.u < 0.7 ? 'dizzy' : 'neutral'; }
  S.d[0][1] = rootY; S.r[1][2] = shellZ;
  // eyestalks: springy wobble with walking / turning, pop up when scared, droop when sad
  S.r[2][0] = b.s('eyx').step(-0.15 * Math.abs(b.speed) - 0.3 * scared + 0.35 * sad + 0.06 * Math.sin(t * 9) * walk, 120, 6, dt); S.r[2][2] = b.s('eyz').step(-b.yawRate * 0.05 + 0.08 * Math.sin(t * 7) * walk - b.speed * 0.2, 120, 6, dt);
  S.r[2][1] = b.look2[0] * 0.25; S.d[2][1] = 0.02 * scared - 0.015 * sad; S.s[2][1] = 1 + 0.2 * scared;
};
POSE.snake = function (b, dt, S) {
  const I = (n) => b.look.defs.findIndex((d) => d.n === n), t = b.t, u = b.u, rad = b.look.d.rad;
  const k = b.k, cy = Math.cos(b.yaw), sy = Math.sin(b.yaw);
  const toW = (lx, lz) => [b.x + (lx * cy + lz * sy) * k, b.z + (-lx * sy + lz * cy) * k], toL = (wx, wz) => { const dx = (wx - b.x) / k, dz = (wz - b.z) / k; return [dx * cy - dz * sy, dx * sy + dz * cy]; };
  // head path: slither = moving head with a lateral wave; in place (line-up) the head runs a slow loop
  const moving = b.speed > 0.02 || b.loop;
  if (b.loop) { b.lp = (b.lp || 0) + dt * 0.45 * (b.speed > 0.6 ? 1.8 : 1); }
  b.ph += dt * (moving ? 7 : 0);
  if (b.loop || !b.hl0) b.hl0 = b.loop ? [Math.sin(b.lp) * 0.48, 0.1 + Math.cos(b.lp) * 0.32] : [0, 0.0];
  let hl = b.hl0.slice();
  const lat = moving ? Math.sin(b.ph) * 0.07 : 0; const dirL = b.loop ? [Math.cos(b.lp), -Math.sin(b.lp)] : [0, 1];
  hl = [hl[0] + dirL[1] * lat, hl[1] - dirL[0] * lat];
  const hw = toW(hl[0], hl[1]);
  if (!b.trail) { b.trail = []; for (let i = 0; i <= 90; i++) b.trail.push(toW(hl[0] + Math.sin(i * 0.11) * 0.1 * Math.min(1, i / 12), hl[1] - i * 0.016)); }
  const last = b.trail[0]; if (Math.hypot(hw[0] - last[0], hw[1] - last[1]) > 0.01 * k) { b.trail.unshift(hw); if (b.trail.length > 160) b.trail.pop(); } else b.trail[0] = hw;
  // sample segment points along the trail by arc length
  const pts = [], sp = SN_SP * k; let acc = 0, i = 0, cur = b.trail[0].slice(); pts.push(cur);
  while (pts.length < SN + 3 && i < b.trail.length - 1) { const c = b.trail[i + 1], d = Math.hypot(c[0] - cur[0], c[1] - cur[1]); if (acc + d >= sp && d > 1e-9) { const f = (sp - acc) / d; cur = [cur[0] + (c[0] - cur[0]) * f, cur[1] + (c[1] - cur[1]) * f]; pts.push(cur); acc = 0; } else { acc += d; cur = c.slice(); i++; } }
  while (pts.length < SN + 3) pts.push(pts[pts.length - 1]);
  let L = pts.map((p) => toL(p[0], p[1]));
  // coil: blend toward a spiral; strike: S-pull then lunge; rattle: tail up and buzzing
  const coilK = b.is('coil') ? bump(u, 0, 0.25, 0.8, 1) : 0, strK = b.is('strike') ? 1 : 0, ratK = b.is('rattle') ? bump(u, 0, 0.12, 0.85, 1) : 0;
  if (coilK) L = L.map((p, j) => { const a = j * 0.62 + 0.4, r = 0.05 + j * 0.011; return [lerp(p[0], Math.sin(a) * r, coilK), lerp(p[1], Math.cos(a) * r - 0.05, coilK)]; });
  const fk = fallK(b), scared = b.mood === 'scared' ? b.moodK : 0, sad = b.mood === 'sad' ? b.moodK : 0, mh = happyBounce(b);
  let raise = 0.06 + 0.05 * Math.sin(t * 1.4) + 0.12 * coilK + 0.08 * ratK + 0.05 * mh - 0.05 * sad, lunge = 0;
  if (strK) { const back = bump(u, 0, 0.35, 0.42, 0.5), go = bump(u, 0.45, 0.52, 0.6, 0.85); raise += 0.12 * back + 0.04 * go; lunge = -0.12 * back + 0.25 * go; b.emo = 'angry'; }
  if (ratK) b.emo = 'angry'; if (scared) raise += 0.1 * scared;
  const ys = L.map((_, j) => { const r0 = rad(j); return r0 + (j < 5 ? raise * Math.pow(1 - j / 5, 1.5) : 0) + (j > SN - 3 ? 0.08 * ratK : 0) + (coilK ? j * 0.004 * coilK : 0); });
  const roll = fk * P;
  const mk = (p, q, y0, y1, extraRoll = 0) => { const f = V(p[0] - q[0], y0 - y1, p[1] - q[1]); if (f.lengthSq() < 1e-9) f.set(0, 0, 1); f.normalize(); const m = new THREE.Matrix4(); const z = f, x = V().crossVectors(V(0, 1, 0), z).normalize(), y = V().crossVectors(z, x); m.makeBasis(x, y, z); if (roll || extraRoll) m.multiply(new THREE.Matrix4().makeRotationZ(roll + extraRoll)); m.setPosition(p[0], y0, p[1]); return m; };
  // head forward of the first point, with lunge
  const fwd0 = V(L[0][0] - L[1][0], 0, L[0][1] - L[1][1]).normalize(); const hp = [L[0][0] + fwd0.x * lunge, L[0][1] + fwd0.z * lunge];
  const hm = mk(hp, L[1], ys[0] + 0.02, ys[1]); const tilt = new THREE.Matrix4().makeRotationX(-0.15 + (strK ? -0.2 * bump(u, 0.45, 0.5, 0.6, 0.8) : 0) + (sad ? 0.4 * sad : 0)); hm.multiply(tilt); hm.multiply(new THREE.Matrix4().makeTranslation(0, -0.03, -0.02));
  S.abs[I('head')] = hm; S.abs[I('neck')] = mk(L[0], L[1], ys[0], ys[1]); S.abs[0] = new THREE.Matrix4();
  for (let j = 0; j < SN; j++) S.abs[I('s' + j)] = mk(L[j + 1], L[j + 2], ys[j + 1], ys[j + 2]);
  const tl = SN + 1, rm = mk(L[tl], L[tl + 1] || L[tl], ys[tl], ys[tl + 1] || ys[tl]); if (ratK) rm.multiply(new THREE.Matrix4().makeRotationY(Math.sin(t * 60) * 0.5 * ratK)); S.abs[I('rattle')] = rm;
  const tf = (Math.sin(t * 2.2 + b.seed) > 0.85 || strK || ratK) ? 1 : 0; S.s[I('tongue')] = [1, 1, b.s('tg').step(tf ? 1.5 + Math.sin(t * 40) * 0.5 : 0.05, 300, 25, dt)];
  if (fk) b.emo = b.u < 0.7 ? 'dizzy' : 'neutral';
};
POSE.frog = function (b, dt, S) {
  const I = (n) => b.look.defs.findIndex((d) => d.n === n), t = b.t, u = b.u;
  let rootY = 0, bodyP = -0.15, ext = 0, sq = 1, dz = 0, headP = 0.0, sac = 1, tongue = 0.05, arm = 0;
  const hop = (f, dist, h) => { const crouch = bump(f, 0, 0.18, 0.22, 0.3), air = clamp((f - 0.25) / 0.45, 0, 1), land = bump(f, 0.68, 0.74, 0.8, 1); ext = Math.max(ext, Math.sin(air * P) * 1.0); rootY += Math.sin(air * P) * h - 0.03 * crouch; dz += dist * sst(0, 1, air); sq += -0.25 * crouch + 0.2 * Math.sin(air * P) * (air < 1 ? 1 : 0) - 0.25 * land; bodyP += -0.4 * Math.sin(air * P) + 0.15 * land; arm += 0.8 * Math.sin(air * P); };
  if (b.speed > 0.02 && !b.act) { b.ph += dt * 1.4; const f = b.ph % 1; hop(f, 0, 0.1); }
  if (b.is('jump')) hop(u, 0, 0.35);
  if (b.is('croak')) { const n = (u * 3) % 1, k = bump(u, 0, 0.08, 0.9, 1); sac = 1 + 1.6 * bump(n, 0, 0.35, 0.55, 0.9) * k; sq -= 0.06 * bump(n, 0.4, 0.5, 0.6, 0.9) * k; headP -= 0.15 * k; b.emo = 'happy'; if (n > 0.4 && n < 0.45 && !b._cr) { b._cr = 1; b.ev.push({ e: 'croak' }); } if (n > 0.6) b._cr = 0; }
  if (b.is('tongue')) { const out = bump(u, 0.15, 0.3, 0.38, 0.55); tongue = 0.05 + 11 * out; headP -= 0.35 * bump(u, 0, 0.15, 0.55, 0.8); if (u > 0.6) b.emo = 'happy'; }
  if (b.fid && !b.act) { const k = bump(b.fid.t, 0, 0.2, 1.2, 1.6); if (b.fid.n === 0) sac = 1 + 0.5 * k * Math.abs(Math.sin(b.fid.t * 8)); else if (b.fid.n === 1) headP -= 0.2 * k; }
  const fk = fallK(b), mh = happyBounce(b), scared = b.mood === 'scared' ? b.moodK : 0, sad = b.mood === 'sad' ? b.moodK : 0;
  sq += 0.004 * Math.sin(t * 3); rootY += 0.05 * mh; if (scared) { sq -= 0.15 * scared; rootY -= 0.02 * scared; S.r[1][2] = Math.sin(t * 40) * 0.03 * scared; } if (sad) { headP += 0.3 * sad; sq -= 0.08 * sad; }
  if (fk) { S.r[0][2] += P * fk; rootY = lerp(rootY, 0.04, fk); ext = Math.abs(Math.sin(t * 9)) * fk; b.emo = b.u < 0.7 ? 'dizzy' : 'neutral'; }
  S.d[0][1] = rootY; S.d[0][2] = dz; S.r[1][0] = bodyP; S.s[1] = [1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.3]; S.r[2][0] = headP; S.r[2][1] = b.look2[0] * 0.2;
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    S.r[I('th' + n)] = [lerp(0, 0.0, ext), s * lerp(-0.9, 0.35, ext), s * lerp(-0.25, -0.3, ext)];
    S.r[I('sh' + n)] = [0, s * lerp(2.5, 0.1, ext), s * lerp(0.0, -0.1, ext)]; S.r[I('ft' + n)] = [0, s * lerp(-2.0, 0.2, ext), s * lerp(0.3, 0, ext)];
    S.r[I('ar' + n)] = [-0.3 - arm, 0, s * 0.25]; S.r[I('ha' + n)] = [0.3 + arm * 0.5, 0, 0];
  }
  S.s[I('throat')] = [sac, sac, sac]; S.s[I('tongue')] = [1, 1, tongue]; S.r[I('tongue')][0] = 0.1;
};
POSE.turtle = function (b, dt, S) {
  const I = (n) => b.look.defs.findIndex((d) => d.n === n), t = b.t, u = b.u;
  const walk = sst(0.01, 0.12, b.speed); b.ph += dt * b.speed / 0.12 * P * 2;
  let rootY = 0.003 * Math.sin(t * 1.6), shellZ = Math.sin(b.ph) * 0.05 * walk, neckZ = 0, headP = 0, hideK = 0, flip = 0, spinY = 0, legIn = 0;
  if (b.is('hide')) { hideK = bump(u, 0, 0.12, 0.62, 0.9); b.emo = u < 0.7 ? 'scared' : 'neutral'; if (u > 0.62) b.look2[0] = Math.sin(t * 3) * 0.8; }
  if (b.is('spin')) { flip = bump(u, 0, 0.12, 0.82, 0.95); spinY = sst(0.15, 0.8, u) * P * 4; b.emo = u < 0.85 ? 'dizzy' : 'happy'; }
  if (b.is('sleep')) { const k = bump(u, 0, 0.2, 0.85, 1); headP += 0.45 * k; neckZ -= 0.04 * k; b.emo = 'sleepy'; rootY -= 0.01 * k * (0.5 + 0.5 * Math.sin(t * 2)); }
  const fk = fallK(b), mh = happyBounce(b), scared = b.mood === 'scared' ? b.moodK : 0, sad = b.mood === 'sad' ? b.moodK : 0;
  hideK = Math.max(hideK, scared * 0.8); rootY += 0.03 * mh; if (sad) { headP += 0.35 * sad; neckZ -= 0.03 * sad; }
  flip = Math.max(flip, fk);
  neckZ -= 0.14 * hideK; legIn = hideK;
  if (b.fid && !b.act) { const k = bump(b.fid.t, 0, 0.3, 1.1, 1.6); if (b.fid.n === 0) { neckZ += 0.04 * k; headP -= 0.2 * k; } }
  S.d[0][1] = rootY + 0.09 * flip; S.r[0][2] = flip * P; S.r[0][1] = spinY; S.r[1][2] = shellZ;
  S.d[I('neck')][2] = neckZ; S.r[I('neck')][0] = headP * 0.5 - 0.1 + 0.1 * Math.sin(t * 0.9); S.r[2][0] = headP * 0.5; S.r[2][1] = b.look2[0] * 0.5;
  for (const [n, s, f] of [['FL', 1, 1], ['FR', -1, 1], ['BL', 1, -1], ['BR', -1, -1]]) {
    const grp = (n === 'FL' || n === 'BR') ? 0 : P, sw = Math.sin(b.ph + grp) * 0.45 * walk, flail = flip * Math.sin(t * 14 + s + f) * 0.6;
    S.r[I(n)] = [-sw + flail, 0, s * (0.15 + 0.6 * legIn)]; S.d[I(n)] = [-s * 0.05 * legIn, 0.04 * legIn, -f * 0.02 * legIn];
  }
  S.d[I('tail')][2] = 0.04 * hideK; S.r[I('tail')][1] = Math.sin(t * 3) * 0.2;
  if (fk) b.emo = b.u < 0.7 ? 'dizzy' : 'neutral';
};
POSE.bee = function (b, dt, S) {
  const I = (n) => b.look.defs.findIndex((d) => d.n === n), t = b.t, u = b.u;
  let rootY = 0.03 * Math.sin(t * 3.1) + 0.015 * Math.sin(t * 7.3), pitch = 0.15 * b.speed, dx = 0, dz = 0, roll = 0, abd = 0, flapA = 1, yawO = 0;
  if (b.is('buzz')) { const a = u * P * 2 * 1.5; dx = Math.sin(a) * 0.45; dz = Math.sin(a * 2) * 0.22; yawO = Math.cos(a) * 0.9; roll = -Math.cos(a) * 0.4; b.emo = 'happy'; }
  if (b.is('sting')) { const back = bump(u, 0, 0.3, 0.38, 0.45), go = bump(u, 0.4, 0.5, 0.55, 0.8); pitch += -0.4 * back + 0.9 * go; dz += -0.15 * back + 0.4 * go; rootY += 0.1 * back - 0.3 * go; abd += 0.7 * go; b.emo = 'angry'; }
  if (b.is('pollen')) { const k = bump(u, 0, 0.2, 0.8, 1); rootY -= 0.35 * k; abd += Math.sin(t * 16) * 0.3 * k; pitch += 0.3 * k; if (Math.random() < 0.25 * k) b.ev.push({ e: 'pollen' }); b.emo = 'love'; }
  const fk = fallK(b), mh = happyBounce(b), scared = b.mood === 'scared' ? b.moodK : 0, sad = b.mood === 'sad' ? b.moodK : 0;
  if (scared) { dx += Math.sin(t * 23) * 0.04 * scared; rootY += 0.15 * scared; } if (sad) { rootY -= 0.2 * sad; flapA = 1 - 0.4 * sad; pitch += 0.3 * sad; } rootY += 0.05 * mh;
  if (fk) { flapA *= 1 - fk; rootY = lerp(rootY, -0.5, fk); S.r[0][2] = P * fk; b.emo = b.u < 0.7 ? 'dizzy' : 'neutral'; }
  S.d[0] = [dx, rootY, dz]; S.r[0][0] = pitch; S.r[0][1] = yawO; S.r[0][2] += roll - b.yawRate * 0.08;
  const w = t * 55; for (const [n, s, o] of [['wL', 1, 0], ['wL2', 1, 0.4], ['wR', -1, 0], ['wR2', -1, 0.4]]) S.r[I(n)] = [0, s * (0.3 + o * 0.6), s * (0.15 + Math.sin(w + o) * 0.6 * flapA)];
  S.r[I('abd')][0] = b.s('abd').step(-0.2 + abd - pitch * 0.4, 90, 6, dt); S.r[I('abd')][1] = b.s('abdy').step(-b.yawRate * 0.1, 90, 6, dt);
  for (const [a0, a1, s] of [['aL0', 'aL1', 1], ['aR0', 'aR1', -1]]) { const x = b.s(a0).step(-0.4 - pitch * 0.5 - rootY * 0.0, 70, 3, dt), z = b.s(a0 + 'z').step(s * -0.3 - b.yawRate * 0.05, 70, 3, dt); S.r[I(a0)] = [x, 0, z]; S.r[I(a1)] = [x * 0.6, 0, z * 0.5]; }
  for (let k = 0; k < 6; k++) S.r[I('g' + k)] = [0.4 + 0.1 * Math.sin(t * 3 + k), 0, (k % 2 ? -1 : 1) * 0.3];
};

/* ------------------------------------------------------------------ the system: crowd, looks cache, spawn, frame */
export class BeastSys {
  constructor(scene) {
    this.crowd = new Crowd(scene, { texW: B_TW, layout: { root: B_ROOT, par: B_PAR }, cap: 64 }); this.list = []; this.looks = new Map(); this.data = new Map(); this.t = 0;
  }
  look(sp, seed) { const k = sp + ':' + seed; let L = this.looks.get(k); if (!L) { L = SPECIES[sp].look(seed); this.looks.set(k, L); } return L; }
  protoData(look) { let P2 = this.data.get(look.key); if (!P2) { P2 = protoOf(look); this.data.set(look.key, P2); } return P2; }
  spawn(sp, seed, o) { const b = new Beast(this, sp, seed, o); this.list.push(b); return b; }
  despawn(b) { const i = this.list.indexOf(b); if (i >= 0) this.list.splice(i, 1); this.crowd.release(b.slot); }
  clear() { for (const b of this.list.slice()) this.despawn(b); this.frame(0, null); }
  frame(dt, cam) {
    this.t += dt; const c = this.crowd; c.beginFrame();
    for (const b of this.list) { b.update(dt); b.write(c); c.show(b.pr, b.slot); }
    c.endFrame(this.t, dt, cam); return { calls: c.lastCalls, tris: c.lastTris };
  }
}
