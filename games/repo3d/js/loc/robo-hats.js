// Ported verbatim from games/robot-loc-coc/twt/robo-hats.js (origin/main, Xưởng Robot Lóc Cóc, same owner); only the three.js import path changed.
// Cosmetic hats and accessories. Built for a head top radius of 0.13 and scaled to the head. slot: top (on the head
// top), face (front of head), ear (both sides), neck (between torso and head), back (torso back). Each has its own
// palette (A, B, C main colours) so a traffic cone stays orange whatever the robot.
import * as THREE from '../../vendor/three.module.min.js';
import { R, place, merge, rbox, fillet, lathe, cyl, sph, tor, cone, caps, bcyl, extrude } from './robo-geo.js';

const P = Math.PI, prof = (p, s = 4) => fillet(p, s);
const lath = (pts, segs = 28, sx = 1, sz = 1) => lathe(pts, segs, sx, sz);
function domeG(r, h, reg, y0 = 0, segs = 28) { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10 * P / 2; pts.push([i === 10 ? 0 : Math.cos(t) * r, y0 + Math.sin(t) * h, reg]); } return lathe(pts, segs); }
function heartShape(s = 1) { const sh = new THREE.Shape(); sh.moveTo(0, -0.5 * s); sh.bezierCurveTo(0.55 * s, -0.05 * s, 0.5 * s, 0.45 * s, 0, 0.22 * s); sh.bezierCurveTo(-0.5 * s, 0.45 * s, -0.55 * s, -0.05 * s, 0, -0.5 * s); return sh; }
function starShape(r0, r1, n = 5) { const sh = new THREE.Shape(); for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * P * 2 + P / 2, r = i % 2 ? r1 : r0; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); } return sh; }

export const HATS = [
  { id: 'beanie', vi: 'Mũ len', slot: 'top', cols: [0xd64545, 0xf2e6d0, 0x2b3a55], build() {
    const g = [domeG(0.125, 0.11, R.A, 0.02, 30), lath(prof([[0.128, -0.01, 0, R.B], [0.138, -0.0, 0.01, R.B], [0.138, 0.035, 0.01, R.B], [0.122, 0.04, 0, R.B], [0, 0.04, 0, R.B]]), 30)];
    for (let i = 0; i < 12; i++) { const a = i / 12 * P * 2; g.push(place(rbox(0.012, 0.03, 0.006, 0.003, R.C), [Math.sin(a) * 0.138, 0.018, Math.cos(a) * 0.138], [0, a, 0])); }
    g.push(place(sph(0.035, R.B, 14, 10), [0, 0.14, 0])); return merge(g);
  } },
  { id: 'hardhat', vi: 'Mũ bảo hộ', slot: 'top', cols: [0xf2c12e, 0xf2c12e, 0x333333], build() {
    return merge([domeG(0.13, 0.11, R.A, 0.0, 32), lath(prof([[0, 0, 0, R.A], [0.16, 0, 0.004, R.A], [0.165, 0.008, 0.003, R.A], [0.13, 0.012, 0, R.A], [0, 0.012, 0, R.A]]), 32, 1, 1.15).translate(0, 0, 0.02),
      place(rbox(0.03, 0.03, 0.24, 0.012, R.A), [0, 0.105, 0]), place(rbox(0.06, 0.03, 0.01, 0.005, R.C), [0, 0.06, 0.124], [-0.4, 0, 0])]);
  } },
  { id: 'crown', vi: 'Vương miện', slot: 'top', cols: [0xf2b632, 0xd8344a, 0x3a7bd5], build() {
    const g = [lath(prof([[0.105, 0, 0, R.A], [0.112, 0, 0.004, R.A], [0.112, 0.04, 0.004, R.A], [0.1, 0.04, 0, R.A]]), 32)];
    for (let i = 0; i < 6; i++) { const a = i / 6 * P * 2; g.push(place(cone(0.024, 0.06, R.A, 4), [Math.sin(a) * 0.105, 0.065, Math.cos(a) * 0.105], [0, a + P / 4, 0]), place(sph(0.011, R.A, 8, 6), [Math.sin(a) * 0.105, 0.1, Math.cos(a) * 0.105])); g.push(place(sph(0.01, i % 2 ? R.B : R.C, 8, 6), [Math.sin(a + P / 6) * 0.113, 0.02, Math.cos(a + P / 6) * 0.113])); }
    return merge(g);
  }, y: 0.004 },
  { id: 'propeller', vi: 'Mũ chong chóng', slot: 'top', anim: 'prop', cols: [0x3fa7d6, 0xf25f5c, 0xffe066], build() {
    return merge([domeG(0.13, 0.08, R.A, 0, 28), place(rbox(0.03, 0.012, 0.165, 0.006, R.B), [0, 0.0, 0.1], [-0.15, 0, 0]), cyl(0.008, 0.008, 0.06, R.CHROME, 8).translate(0, 0.1, 0)]);
  }, rotor() { return merge([place(rbox(0.2, 0.006, 0.035, 0.003, R.C), [0.1, 0, 0], [0.25, 0, 0]), place(rbox(0.2, 0.006, 0.035, 0.003, R.B), [-0.1, 0, 0], [-0.25, 0, 0]), sph(0.014, R.CHROME, 10, 8)]); }, rotorY: 0.13 },
  { id: 'cone', vi: 'Cọc giao thông', slot: 'top', cols: [0xff6b1a, 0xf5f5f5, 0x222222], build() {
    const g = [place(rbox(0.22, 0.02, 0.22, 0.01, R.A), [0, 0.01, 0])];
    g.push(lath([[0.085, 0.02, R.A], [0.072, 0.07, R.A], [0.068, 0.08, R.B], [0.055, 0.12, R.B], [0.052, 0.128, R.A], [0.03, 0.19, R.A], [0.015, 0.215, R.A], [0, 0.22, R.A]], 28));
    return merge(g);
  } },
  { id: 'chef', vi: 'Mũ đầu bếp', slot: 'top', cols: [0xf7f7f2, 0xf7f7f2, 0xdddddd], build() {
    const g = [lath(prof([[0.11, 0, 0, R.A], [0.114, 0, 0.004, R.A], [0.114, 0.07, 0, R.A], [0.0, 0.07, 0, R.A]]), 30)];
    for (let i = 0; i < 6; i++) { const a = i / 6 * P * 2; g.push(place(sph(0.07, R.A, 14, 10), [Math.sin(a) * 0.07, 0.12, Math.cos(a) * 0.07])); }
    g.push(place(sph(0.08, R.A, 14, 10), [0, 0.15, 0])); return merge(g);
  } },
  { id: 'headphones', vi: 'Tai nghe', slot: 'top', cols: [0x2d2d34, 0xff4f79, 0x777777], build() {
    const g = [place(tor(0.165, 0.012, R.A, 8, 30, P), [0, -0.09, 0])];
    for (const s of [-1, 1]) g.push(place(bcyl(0.05, 0.045, 0.012, R.B, 22), [s * 0.165, -0.1, 0], [0, 0, -s * P / 2]).translate(-s * 0.02, 0, 0), place(bcyl(0.035, 0.012, 0.004, R.C, 18), [s * 0.19, -0.1, 0], [0, 0, -s * P / 2]));
    return merge(g);
  }, y: 0.0 },
  { id: 'flower', vi: 'Bông hoa', slot: 'top', anim: 'sway', cols: [0xff7eb6, 0xffd23f, 0x4caf50], build() {
    const g = [place(cyl(0.005, 0.005, 0.1, R.C, 6), [0.03, 0.05, 0])];
    for (let i = 0; i < 6; i++) { const a = i / 6 * P * 2; g.push(place(sph(0.022, R.A, 10, 8), [0.03 + Math.cos(a) * 0.026, 0.12, Math.sin(a) * 0.026], [0, 0, 0], [1, 0.45, 1])); }
    g.push(place(sph(0.016, R.B, 10, 8), [0.03, 0.125, 0]), place(rbox(0.04, 0.004, 0.018, 0.002, R.C), [0.05, 0.07, 0], [0, 0, 0.5])); return merge(g);
  } },
  { id: 'bandage', vi: 'Băng dán', slot: 'top', cols: [0xe8c39e, 0xd2a77d, 0xffffff], build() {
    return merge([place(rbox(0.18, 0.006, 0.045, 0.003, R.A), [0, 0.0, 0], [0, 0.7, 0.0]), place(rbox(0.18, 0.006, 0.045, 0.003, R.A), [0, 0.004, 0], [0, -0.7, 0]), place(rbox(0.05, 0.004, 0.035, 0.002, R.B), [0, 0.009, 0])]);
  }, y: 0.002 },
  { id: 'tophat', vi: 'Mũ chóp', slot: 'top', cols: [0x1d1d22, 0xb3262e, 0x777777], build() {
    return merge([lath(prof([[0, 0, 0, R.A], [0.17, 0, 0.006, R.A], [0.17, 0.012, 0.006, R.A], [0.1, 0.012, 0, R.A], [0.1, 0.03, 0, R.B], [0.098, 0.055, 0, R.B], [0.098, 0.058, 0, R.A], [0.105, 0.2, 0.01, R.A], [0, 0.2, 0, R.A]]), 32)]);
  } },
  { id: 'cowboy', vi: 'Mũ cao bồi', slot: 'top', cols: [0xa8743a, 0x5b3a1e, 0xe8d5b0], build() {
    return merge([place(lath(prof([[0, 0.03, 0, R.A], [0.12, 0.012, 0, R.A], [0.2, 0.03, 0.03, R.A], [0.215, 0.05, 0.004, R.A], [0.205, 0.05, 0, R.A], [0.12, 0.024, 0, R.A], [0, 0.04, 0, R.A]]), 34, 1, 0.85), [0, -0.012, 0]),
      lath(prof([[0.105, 0.01, 0, R.B], [0.105, 0.04, 0, R.B], [0.1, 0.042, 0, R.A], [0.09, 0.13, 0.04, R.A], [0.03, 0.12, 0.02, R.A], [0, 0.125, 0, R.A]]), 30, 1, 0.85)]);
  } },
  { id: 'party', vi: 'Mũ sinh nhật', slot: 'top', anim: 'sway', cols: [0x9b5de5, 0xf15bb5, 0xfee440], build() {
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0.08 * (1 - t), t * 0.2, i % 2 ? R.A : R.B]); }
    return merge([lath(pts, 26), place(sph(0.025, R.C, 12, 8), [0, 0.205, 0])]);
  } },
  { id: 'viking', vi: 'Mũ Viking', slot: 'top', cols: [0x9aa0a6, 0xf2e6c9, 0x7a5230], build() {
    const g = [domeG(0.135, 0.11, R.A, 0, 30), lath(prof([[0.138, -0.004, 0, R.C], [0.142, 0.0, 0.004, R.C], [0.142, 0.022, 0.004, R.C], [0.134, 0.024, 0, R.C]]), 30)];
    for (const s of [-1, 1]) { const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([s * (0.12 + t * 0.07), 0.05 + t * t * 0.12, 0]); } for (let i = 0; i < 6; i++) { const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]), r0 = 0.025 * (1 - i / 6) + 0.004, r1 = 0.025 * (1 - (i + 1) / 6) + 0.004; const c = cyl(r0, r1, a.distanceTo(b), R.B, 10); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); c.translate(0, a.distanceTo(b) / 2, 0); c.applyQuaternion(q); c.translate(a.x, a.y, a.z); g.push(c); } }
    return merge(g);
  } },
  { id: 'cap', vi: 'Mũ lưỡi trai', slot: 'top', cols: [0x2a6fdb, 0xffffff, 0xff4040], build() {
    return merge([domeG(0.128, 0.085, R.A, 0, 30), place(lath(prof([[0, 0, 0, R.B], [0.1, 0.0, 0.01, R.B], [0.1, 0.008, 0.004, R.B], [0, 0.008, 0, R.B]]), 24, 1, 0.9), [0, 0.006, 0.12], [-0.12, 0, 0], [1, 1, 1]), place(sph(0.014, R.C, 8, 6), [0, 0.085, 0])]);
  } },
  { id: 'bucket', vi: 'Mũ tai bèo', slot: 'top', anim: 'sway', cols: [0x7fb069, 0xe6aa68, 0x333333], build() {
    return merge([lath(prof([[0, 0.0, 0, R.A], [0.2, -0.03, 0.01, R.A], [0.2, -0.022, 0.006, R.A], [0.12, 0.008, 0, R.A], [0.115, 0.03, 0, R.B], [0.112, 0.05, 0, R.B], [0.11, 0.052, 0, R.A], [0.1, 0.1, 0.03, R.A], [0, 0.105, 0, R.A]]), 32)]);
  } },
  { id: 'beret', vi: 'Mũ nồi', slot: 'top', cols: [0xc0392b, 0x222222, 0x222222], build() {
    return merge([place(lath(prof([[0.11, 0, 0, R.A], [0.17, 0.03, 0.04, R.A], [0.14, 0.06, 0.04, R.A], [0, 0.065, 0, R.A]]), 30), [0.02, 0, 0], [0, 0, -0.18]), place(cyl(0.006, 0.004, 0.025, R.B, 6), [-0.0, 0.075, 0])]);
  } },
  { id: 'halo', vi: 'Vòng hào quang', slot: 'top', anim: 'float', cols: [0xffe680, 0xffe680, 0xffe680], build() { return merge([place(tor(0.1, 0.012, R.GLOW, 8, 36), [0, 0.08, 0], [P / 2, 0, 0])]); }, glow: 0xffe066 },
  { id: 'bow', vi: 'Nơ cài', slot: 'top', cols: [0xff5c8a, 0xff8fb1, 0xffffff], build() {
    const g = [place(sph(0.02, R.A, 10, 8), [0.06, 0.02, 0.04])];
    for (const s of [-1, 1]) g.push(place(cone(0.035, 0.07, R.A, 12), [0.06 + s * 0.035, 0.02, 0.04], [0, 0, s * P / 2], [1, 1, 0.5]));
    return merge(g);
  } },
  { id: 'goggles', vi: 'Kính bơi', slot: 'top', cols: [0x6b4f3a, 0x55c1ff, 0x999999], build() {
    const g = [place(tor(0.14, 0.012, R.A, 6, 34), [0, 0.0, 0], [P / 2, 0, 0], [1, 1, 0.9])];
    for (const s of [-1, 1]) g.push(place(bcyl(0.035, 0.025, 0.008, R.CHROME, 18), [s * 0.045, 0.02, 0.12], [P / 2 - 0.5, 0, 0]), place(bcyl(0.028, 0.004, 0.002, R.LENS, 18), [s * 0.045, 0.02, 0.12], [P / 2 - 0.5, 0, 0]).translate(0, 0.012, 0.02));
    return merge(g);
  }, y: -0.035 },
  { id: 'sprout', vi: 'Mầm cây', slot: 'top', anim: 'sway', cols: [0x5cb85c, 0x3d8b3d, 0x8b5a2b], build() {
    return merge([cyl(0.005, 0.004, 0.08, R.B, 6).translate(0, 0.04, 0), place(sph(0.035, R.A, 12, 8), [0.028, 0.085, 0], [0, 0, -0.6], [1, 0.3, 0.6]), place(sph(0.03, R.A, 12, 8), [-0.024, 0.09, 0], [0, 0, 0.7], [1, 0.3, 0.6])]);
  } },
  { id: 'umbrella', vi: 'Ô mini', slot: 'top', anim: 'sway', cols: [0x00b4d8, 0xffffff, 0x333333], build() {
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([i === 10 ? 0 : 0.17 * Math.cos(t * P / 2), 0.2 + 0.06 * Math.sin(t * P / 2), i < 3 ? R.A : i < 6 ? R.B : R.A]); }
    return merge([lath(pts, 8), cyl(0.004, 0.004, 0.21, R.C, 6).translate(0, 0.11, 0)]);
  } },
  { id: 'lamp', vi: 'Chụp đèn', slot: 'top', cols: [0xf4e3b5, 0xc89b3c, 0x333333], build() {
    return merge([lath([[0.15, 0, R.A], [0.15, 0.006, R.B], [0.09, 0.13, R.B], [0.09, 0.136, R.A], [0, 0.136, R.A]], 30)]).translate(0, 0.02, 0);
  } },
  // ---- face / neck / back ----
  { id: 'glasses', vi: 'Kính tròn', slot: 'face', cols: [0x222222, 0x222222, 0x222222], build() {
    const g = []; for (const s of [-1, 1]) g.push(place(tor(0.04, 0.005, R.A, 6, 24), [s * 0.055, 0, 0]));
    g.push(place(rbox(0.03, 0.006, 0.006, 0.003, R.A), [0, 0.01, 0])); return merge(g);
  } },
  { id: 'scarf', vi: 'Khăn quàng', slot: 'neck', anim: 'sway', cols: [0xe63946, 0xf1faee, 0x1d3557], build() {
    const g = [place(tor(0.085, 0.03, R.A, 10, 28), [0, 0, 0], [P / 2, 0, 0])];
    g.push(place(rbox(0.05, 0.13, 0.025, 0.012, R.A), [0.04, -0.06, 0.085], [0.2, 0, 0.15]), place(rbox(0.052, 0.02, 0.027, 0.008, R.B), [0.048, -0.11, 0.095], [0.2, 0, 0.15]));
    return merge(g);
  } },
  { id: 'bowtie', vi: 'Nơ cổ', slot: 'neck', cols: [0xd7263d, 0xd7263d, 0x111111], build() {
    const g = [place(sph(0.016, R.A, 10, 8), [0, 0, 0.09])];
    for (const s of [-1, 1]) g.push(place(cone(0.03, 0.06, R.A, 10), [s * 0.03, 0, 0.09], [0, 0, s * P / 2], [1, 1, 0.45]));
    return merge(g);
  } },
  { id: 'backpack', vi: 'Ba lô', slot: 'back', anim: 'sway', cols: [0xf4a259, 0x5b8e7d, 0x333333], build() {
    return merge([place(rbox(0.2, 0.22, 0.09, 0.035, R.A), [0, 0, -0.045]), place(rbox(0.16, 0.1, 0.03, 0.015, R.B), [0, -0.04, -0.095]), place(rbox(0.18, 0.06, 0.1, 0.03, R.B), [0, 0.09, -0.045]), place(rbox(0.03, 0.01, 0.01, 0.004, R.CHROME), [0, 0.06, -0.097])]);
  } },
  { id: 'windkey', vi: 'Chìa lên dây', slot: 'back', anim: 'spin', cols: [0xd9b44a, 0xd9b44a, 0x555555], build() {
    return merge([place(cyl(0.008, 0.008, 0.05, R.CHROME, 8), [0, 0, -0.025], [P / 2, 0, 0]), place(tor(0.03, 0.008, R.A, 8, 20), [0.032, 0, -0.055], [0, P / 2, 0]), place(tor(0.03, 0.008, R.A, 8, 20), [-0.032, 0, -0.055], [0, P / 2, 0])]);
  } },
  { id: 'cape', vi: 'Áo choàng', slot: 'back', anim: 'sway', cols: [0x8e2de2, 0xffd166, 0x222222], build() {
    const sh = new THREE.Shape(); sh.moveTo(-0.1, 0); sh.lineTo(0.1, 0); sh.lineTo(0.15, -0.3); sh.quadraticCurveTo(0, -0.33, -0.15, -0.3); sh.lineTo(-0.1, 0);
    return merge([place(extrude(sh, 0.006, 0.003, R.A), [0, 0, -0.02]), place(extrude(starShape(0.035, 0.015), 0.004, 0.002, R.B), [0, -0.15, -0.033], [0, P, 0])]);
  } },
];
export const HAT_TOP = HATS.filter((h) => h.slot === 'top' || h.slot === 'face').map((h) => h.id);
export const HAT_BODY = HATS.filter((h) => h.slot === 'neck' || h.slot === 'back').map((h) => h.id);
const hc = new Map();
export function hatGeo(id) { if (!hc.has(id)) { const h = HATS.find((x) => x.id === id); hc.set(id, { geo: h.build(), rotor: h.rotor ? h.rotor() : null }); } return hc.get(id); }
export const hatDef = (id) => HATS.find((x) => x.id === id);
export { heartShape, starShape };
