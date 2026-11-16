// Part library: torso shells, pelvis, heads, ears/antennae, hands, feet, limb segments. Each builder returns a merged
// geometry in part space plus the sockets the assembler needs. Designs are original: tin cans, eggs, barrels, CRT and
// lens heads; every part is a distinct bevelled piece so the robot reads as assembled from blocks.
import * as THREE from '../vendor/three.module.min.js';
import { R, tag, place, merge, rbox, fillet, lathe, cyl, sph, tor, cone, caps, bcyl, screw, coil } from './robo-geo.js';

const P = Math.PI;
const prof = (pts, seg = 4) => fillet(pts, seg);
const facing = (g) => place(g, [0, 0, 0], [P / 2, 0, 0]); // turn a +y axis primitive to face +z
const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

// ---------------- torso shells ----------------
// origin: bottom centre. Returns { geo, h, w, d, sh:[x,y,z] shoulder (+x side), neck y, decal [cx,cy,size], round }
const TORSO = {
  bean() {
    const D = R.DECAL, B = R.B, K = R.DARK;
    const g = [lathe(prof([[0, 0, 0, B], [0.13, 0, 0.04, B], [0.165, 0.06, 0, B], [0.168, 0.065, 0, K], [0.17, 0.075, 0, D], [0.178, 0.17, 0.08, D], [0.172, 0.25, 0, D], [0.168, 0.256, 0, K], [0.164, 0.262, 0, D],
      [0.15, 0.33, 0.06, D], [0.09, 0.38, 0.03, D], [0, 0.385, 0, D]]), 36, 1, 0.82)];
    for (const s of [-1, 1]) g.push(place(rbox(0.012, 0.05, 0.05, 0.005, K), [s * 0.172, 0.17, -0.02]), place(rbox(0.01, 0.035, 0.035, 0.004, K), [s * 0.168, 0.11, 0.03]));
    g.push(place(bcyl(0.018, 0.012, 0.004, R.GLOW, 14), [0, 0.3, 0.115], [P / 2 - 0.5, 0, 0]));
    return { geo: merge(g), h: 0.385, w: 0.178, d: 0.146, sh: [0.16, 0.25, 0], neck: 0.382, decal: [0, 0.17, 0.15], round: true };
  },
  capsule() {
    const D = R.DECAL, B = R.B;
    const g = [lathe(prof([[0, 0, 0, B], [0.11, 0, 0.04, B], [0.12, 0.03, 0, B], [0.12, 0.07, 0, B], [0.12, 0.072, 0, D], [0.12, 0.43, 0, D], [0.12, 0.432, 0, B], [0.12, 0.5, 0.1, B], [0, 0.5, 0, B]]), 32, 1, 0.9)];
    for (let i = 0; i < 3; i++) g.push(place(rbox(0.07, 0.011, 0.02, 0.005, R.DARK), [0, 0.11 + i * 0.022, 0.1]));
    for (const s of [-1, 1]) g.push(screw([s * 0.07, 0.4, 0.096], 0.007, [s * 0.4, 0, 1]));
    g.push(place(bcyl(0.012, 0.01, 0.004, R.GLOW, 12), [0.06, 0.46, 0.085], [P / 2 - 0.6, 0, 0]));
    return { geo: merge(g), h: 0.5, w: 0.12, d: 0.108, sh: [0.11, 0.38, 0], neck: 0.5, decal: [0, 0.27, 0.13], round: true };
  },
  tincan() {
    const D = R.DECAL, C = R.CHROME;
    const g = [lathe(prof([[0, 0.004, 0, C], [0.14, 0.004, 0.01, C], [0.156, 0.014, 0.008, C], [0.15, 0.032, 0, C], [0.15, 0.04, 0, D], [0.15, 0.1, 0, D], [0.146, 0.106, 0, R.DARK], [0.15, 0.112, 0, D],
      [0.15, 0.25, 0, D], [0.146, 0.256, 0, R.DARK], [0.15, 0.262, 0, D], [0.15, 0.3, 0, D], [0.15, 0.308, 0, C], [0.156, 0.326, 0.008, C], [0.144, 0.335, 0.004, C], [0.13, 0.33, 0, C], [0, 0.33, 0, C]]), 40)];
    const tab = merge([place(tor(0.018, 0.004, C, 6, 16), [0, 0, 0], [P / 2, 0, 0]), place(rbox(0.02, 0.004, 0.02, 0.002, C), [0, 0, -0.022])]);
    g.push(place(tab, [0.06, 0.336, 0.04], [0, 0.6, 0]));
    return { geo: merge(g), h: 0.336, w: 0.156, d: 0.156, sh: [0.15, 0.22, 0], neck: 0.33, decal: [0, 0.175, 0.17], round: true };
  },
  egg() {
    const D = R.DECAL, B = R.B;
    const g = [lathe(prof([[0, 0, 0, B], [0.1, 0, 0.05, B], [0.15, 0.06, 0, B], [0.152, 0.065, 0, D], [0.165, 0.13, 0.12, D], [0.158, 0.2, 0, D], [0.155, 0.204, 0, R.DARK], [0.153, 0.21, 0, D], [0.12, 0.34, 0.08, D], [0, 0.43, 0, D]]), 36, 1, 0.9)];
    g.push(place(rbox(0.09, 0.075, 0.016, 0.012, B), [0, 0.12, 0.142], [-0.12, 0, 0]));
    for (const [x, y] of [[-0.034, 0.145], [0.034, 0.145], [-0.034, 0.093], [0.034, 0.093]]) g.push(screw([x, y, 0.152], 0.006, [0, 0.1, 1]));
    return { geo: merge(g), h: 0.43, w: 0.165, d: 0.148, sh: [0.15, 0.25, 0], neck: 0.415, decal: [0, 0.26, 0.11], round: true };
  },
  barrel() {
    const D = R.DECAL, K = R.DARK;
    const g = [lathe(prof([[0, 0, 0, K], [0.16, 0, 0.02, K], [0.18, 0.035, 0, K], [0.186, 0.05, 0, K], [0.186, 0.075, 0, K], [0.184, 0.08, 0, D], [0.195, 0.15, 0.1, D], [0.186, 0.22, 0, D],
      [0.19, 0.225, 0, K], [0.19, 0.25, 0, K], [0.18, 0.26, 0, K], [0.16, 0.3, 0.02, K], [0, 0.3, 0, K]]), 40, 1, 0.92)];
    g.push(place(bcyl(0.022, 0.012, 0.004, R.CHROME, 14), [0.07, 0.3, 0.06]));
    return { geo: merge(g), h: 0.3, w: 0.195, d: 0.18, sh: [0.18, 0.2, 0], neck: 0.3, decal: [0, 0.15, 0.13], round: true };
  },
  lanky() {
    const g = [place(rbox(0.2, 0.46, 0.14, 0.045, R.DECAL), [0, 0.26, 0]), place(rbox(0.215, 0.05, 0.155, 0.02, R.DARK), [0, 0.05, 0]),
      place(rbox(0.15, 0.1, 0.018, 0.02, R.B), [0, 0.39, 0.07]), place(rbox(0.006, 0.12, 0.006, 0.003, R.DARK), [0, 0.15, 0.071])];
    for (let i = 0; i < 3; i++) g.push(place(sph(0.008, R.GLOW, 10, 8), [0.05, 0.38 + i * 0.0, 0.079]).translate(-0.05 + i * 0.03 - 0.02, 0, 0));
    g.push(place(rbox(0.04, 0.022, 0.01, 0.006, R.CHROME), [0, 0.05, 0.08]));
    return { geo: merge(g), h: 0.49, w: 0.108, d: 0.078, sh: [0.1, 0.4, 0], neck: 0.49, decal: [0, 0.24, 0.12], round: false };
  },
  cube() {
    const g = [place(rbox(0.32, 0.3, 0.26, 0.05, R.DECAL), [0, 0.15, 0]), place(rbox(0.28, 0.26, 0.015, 0.035, R.B), [0, 0.155, 0.127])];
    g.push(place(rbox(0.24, 0.22, 0.01, 0.03, R.DECAL), [0, 0.155, 0.133]));
    g.push(facing(bcyl(0.026, 0.014, 0.005, R.CHROME, 18)).translate(0.075, 0.09, 0.135), place(rbox(0.004, 0.02, 0.006, 0.002, R.DARK), [0.075, 0.1, 0.152]));
    for (let i = 0; i < 4; i++) g.push(place(rbox(0.06, 0.007, 0.006, 0.003, R.DARK), [-0.06, 0.07 + i * 0.016, 0.139]));
    for (const [x, y] of [[-0.125, 0.04], [0.125, 0.04], [-0.125, 0.27], [0.125, 0.27]]) g.push(screw([x, y, 0.136], 0.007));
    return { geo: merge(g), h: 0.3, w: 0.16, d: 0.13, sh: [0.155, 0.22, 0], neck: 0.3, decal: [-0.02, 0.19, 0.13], round: false };
  },
  tank() { // wide flat-topped boiler with a chimney-ish vent and rivet rows
    const D = R.DECAL, B = R.B;
    const g = [lathe(prof([[0, 0, 0, B], [0.15, 0, 0.03, B], [0.17, 0.05, 0, B], [0.17, 0.055, 0, D], [0.17, 0.2, 0, D], [0.17, 0.205, 0, B], [0.17, 0.26, 0.05, B], [0.12, 0.29, 0.02, B], [0, 0.29, 0, B]]), 36, 1.12, 0.86)];
    for (let i = 0; i < 9; i++) { const a = -1 + i * 0.25; g.push(screw([Math.sin(a) * 0.19, 0.035, Math.cos(a) * 0.146], 0.006, [Math.sin(a), 0, Math.cos(a)]), screw([Math.sin(a) * 0.19, 0.225, Math.cos(a) * 0.146], 0.006, [Math.sin(a), 0, Math.cos(a)])); }
    g.push(place(bcyl(0.025, 0.05, 0.008, R.DARK, 14), [-0.09, 0.27, -0.05]));
    return { geo: merge(g), h: 0.29, w: 0.19, d: 0.146, sh: [0.18, 0.2, 0], neck: 0.29, decal: [0, 0.13, 0.13], round: true };
  },
};
export const TORSO_KEYS = Object.keys(TORSO);
export const torso = (k) => memo('t' + k, () => TORSO[k]());

// pelvis: origin at hip-joint height. Returns { geo, top, hipX }
export function pelvis(w, round) {
  return memo('p' + w.toFixed(3) + round, () => {
    const hipX = Math.max(0.05, w * 0.55), g = [];
    if (round) g.push(lathe(prof([[0, -0.035, 0, R.DARK], [w * 0.72, -0.035, 0.015, R.DARK], [w * 0.75, 0.0, 0, R.DARK], [w * 0.75, 0.004, 0, R.B], [w * 0.7, 0.03, 0.01, R.B], [0, 0.035, 0, R.B]]), 28, 1, 0.8));
    else g.push(rbox(w * 1.45, 0.07, w * 0.95, 0.02, R.DARK), place(rbox(w * 1.3, 0.012, w * 0.9, 0.005, R.B), [0, 0.035, 0]));
    for (const s of [-1, 1]) g.push(place(sph(0.03, R.CHROME, 14, 10), [s * hipX, -0.025, 0]));
    g.push(place(sph(0.034, R.DARK, 14, 10), [0, 0.05, 0])); // waist ball (visible through the gap)
    return { geo: merge(g), top: 0.035, hipX };
  });
}

// ---------------- heads ----------------
// origin: neck pivot (head bottom). face: { mode 1 screen | 2 lens, scr [cx,cy,halfH,sep], led, mouth, lens0 [x,y,z,r], lens1 }
const HEAD = {
  crt() {
    const g = [place(rbox(0.34, 0.25, 0.24, 0.05, R.A), [0, 0.135, 0]), place(rbox(0.3, 0.21, 0.02, 0.035, R.B), [0, 0.135, 0.115]), place(rbox(0.25, 0.165, 0.02, 0.03, R.SCREEN), [0, 0.135, 0.122])];
    g.push(place(bcyl(0.02, 0.02, 0.006, R.CHROME, 14), [0.17, 0.09, 0.04], [0, 0, -P / 2]), place(bcyl(0.016, 0.02, 0.006, R.CHROME, 14), [0.17, 0.17, 0.04], [0, 0, -P / 2]));
    for (let i = 0; i < 4; i++) g.push(place(rbox(0.012, 0.13, 0.008, 0.004, R.DARK), [-0.045 + i * 0.03, 0.135, -0.12]));
    g.push(place(rbox(0.12, 0.03, 0.12, 0.01, R.DARK), [0, 0.01, 0]));
    return { geo: merge(g), h: 0.26, w: 0.17, top: 0.26, topR: 0.15, front: 0.132, face: { mode: 1, scr: [0, 0.135, 0.082, 0.48], led: 1, mouth: 1 }, mounts: [[0, 0.26, -0.02], [-0.12, 0.25, -0.02], [0.12, 0.25, -0.02]], ear: [0.17, 0.14, 0] };
  },
  orb() {
    const g = [lathe(prof([[0, 0.01, 0, R.A], [0.1, 0.03, 0.06, R.A], [0.15, 0.13, 0, R.A], [0.15, 0.135, 0, R.B], [0.15, 0.16, 0, R.B], [0.15, 0.165, 0, R.A], [0.1, 0.28, 0.06, R.A], [0, 0.3, 0, R.A]], 6), 36, 1, 0.95)];
    for (const s of [-1, 1]) {
      g.push(facing(bcyl(0.06, 0.05, 0.01, R.CHROME, 24)).translate(s * 0.068, 0.17, 0.105));
      g.push(facing(bcyl(0.049, 0.004, 0.002, R.LENS, 30)).translate(s * 0.068, 0.17, 0.155));
    }
    for (let i = 0; i < 3; i++) g.push(place(rbox(0.05, 0.006, 0.01, 0.003, R.DARK), [0, 0.08 + i * 0.013, 0.135 - i * 0.002]));
    g.push(place(cyl(0.05, 0.05, 0.025, R.DARK, 18), [0, 0.012, 0]));
    return { geo: merge(g), h: 0.3, w: 0.15, top: 0.3, topR: 0.12, front: 0.16, face: { mode: 2, lens0: [0.068, 0.17, 0.16, 0.049], lens1: [-0.068, 0.17, 0.16, 0.049] }, mounts: [[0, 0.3, 0], [-0.08, 0.27, 0], [0.08, 0.27, 0]], ear: [0.15, 0.15, 0] };
  },
  monocle() {
    const g = [lathe(prof([[0, 0, 0, R.B], [0.12, 0, 0.02, R.B], [0.13, 0.03, 0, R.B], [0.13, 0.035, 0, R.A], [0.13, 0.2, 0.04, R.A], [0.1, 0.23, 0.02, R.A], [0, 0.23, 0, R.A]]), 34)];
    g.push(facing(bcyl(0.078, 0.06, 0.012, R.CHROME, 30)).translate(0, 0.125, 0.085), facing(bcyl(0.064, 0.004, 0.002, R.LENS, 36)).translate(0, 0.125, 0.145));
    g.push(place(tor(0.071, 0.006, R.DARK, 6, 30), [0, 0.125, 0.14]));
    g.push(place(rbox(0.12, 0.022, 0.03, 0.01, R.DARK), [0, 0.215, 0.11], [0.3, 0, 0]));
    return { geo: merge(g), h: 0.23, w: 0.13, top: 0.23, topR: 0.13, front: 0.149, face: { mode: 2, lens0: [0, 0.125, 0.149, 0.064], lens1: [0, 0, 0, -1] }, mounts: [[0, 0.23, -0.04], [-0.08, 0.23, -0.04], [0.08, 0.23, -0.04]], ear: [0.13, 0.12, 0] };
  },
  pill() {
    const g = [place(caps(0.1, 0.17, R.A, 8, 24), [0, 0.11, 0], [0, 0, P / 2])];
    g.push(place(rbox(0.25, 0.1, 0.04, 0.035, R.SCREEN), [0, 0.11, 0.087]));
    for (const s of [-1, 1]) g.push(place(cyl(0.102, 0.102, 0.022, R.B, 26), [s * 0.15, 0.11, 0], [0, 0, P / 2]), place(bcyl(0.03, 0.012, 0.004, R.CHROME, 14), [s * 0.185, 0.11, 0], [0, 0, -s * P / 2]));
    g.push(place(cyl(0.045, 0.05, 0.03, R.DARK, 16), [0, 0.012, 0]));
    return { geo: merge(g), h: 0.21, w: 0.2, top: 0.21, topR: 0.1, front: 0.107, face: { mode: 1, scr: [0, 0.112, 0.045, 0.55], led: 0, mouth: 0 }, mounts: [[0, 0.21, 0], [-0.08, 0.2, 0], [0.08, 0.2, 0]], ear: [0.2, 0.11, 0] };
  },
  bucket() {
    const g = [lathe(prof([[0, 0, 0, R.B], [0.14, 0, 0.005, R.B], [0.155, 0.006, 0.004, R.B], [0.15, 0.03, 0, R.B], [0.148, 0.033, 0, R.A], [0.115, 0.22, 0.03, R.A], [0, 0.22, 0, R.A]]), 34)];
    for (const s of [-1, 1]) {
      g.push(place(bcyl(0.05, 0.05, 0.008, R.CHROME, 22), [s * 0.06, 0.11, 0.1], [P / 2, 0, 0]));
      g.push(place(bcyl(0.041, 0.004, 0.002, R.LENS, 26), [s * 0.06, 0.11, 0.1], [P / 2, 0, 0]).translate(0, 0, 0.05));
      g.push(screw([s * 0.135, 0.06, 0.03], 0.008, [s, 0.2, 0.2]));
    }
    return { geo: merge(g), h: 0.22, w: 0.155, top: 0.22, topR: 0.115, front: 0.15, face: { mode: 2, lens0: [0.06, 0.11, 0.154, 0.041], lens1: [-0.06, 0.11, 0.154, 0.041] }, mounts: [[0, 0.22, 0], [-0.07, 0.21, 0], [0.07, 0.21, 0]], ear: [0.14, 0.1, 0] };
  },
  dome() {
    const arc = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * P / 2; arc.push([Math.cos(a) * 0.15, 0.1 + Math.sin(a) * 0.15, 0, R.A]); }
    const g = [lathe([[0, 0, R.B], [0.14, 0, R.B], [0.16, 0.02, R.B], [0.16, 0.06, R.B], [0.152, 0.07, R.DARK], [0.15, 0.08, R.A], ...arc.map((p) => [p[0], p[1], p[3]])], 36)];
    g.push(facing(bcyl(0.105, 0.03, 0.006, R.SCREEN, 36)).translate(0, 0.14, 0.12), place(tor(0.106, 0.009, R.CHROME, 8, 36), [0, 0.14, 0.15]));
    return { geo: merge(g), h: 0.25, w: 0.16, top: 0.25, topR: 0.13, front: 0.15, face: { mode: 1, scr: [0, 0.14, 0.09, 0.42], led: 0, mouth: 1 }, mounts: [[0, 0.25, 0], [-0.09, 0.22, 0], [0.09, 0.22, 0]], ear: [0.16, 0.1, 0] };
  },
  bino() {
    const g = [place(rbox(0.26, 0.16, 0.2, 0.04, R.A), [0, 0.095, 0]), place(rbox(0.28, 0.03, 0.07, 0.012, R.B), [0, 0.175, 0.07], [0.15, 0, 0])];
    for (const s of [-1, 1]) {
      g.push(facing(bcyl(0.05, 0.08, 0.008, R.DARK, 22)).translate(s * 0.064, 0.095, 0.08), facing(bcyl(0.056, 0.012, 0.004, R.CHROME, 24)).translate(s * 0.064, 0.095, 0.15));
      g.push(facing(bcyl(0.046, 0.004, 0.002, R.LENS, 28)).translate(s * 0.064, 0.095, 0.16));
    }
    g.push(place(cyl(0.045, 0.05, 0.03, R.DARK, 16), [0, 0.012, 0]));
    return { geo: merge(g), h: 0.19, w: 0.14, top: 0.19, topR: 0.13, front: 0.165, face: { mode: 2, lens0: [0.064, 0.095, 0.164, 0.046], lens1: [-0.064, 0.095, 0.164, 0.046] }, mounts: [[0, 0.19, -0.04], [-0.09, 0.18, -0.04], [0.09, 0.18, -0.04]], ear: [0.13, 0.1, 0] };
  },
};
export const HEAD_KEYS = Object.keys(HEAD);
export const head = (k) => memo('h' + k, () => HEAD[k]());

// ---------------- ears (static, merged into the head mesh) and antennae (springy) ----------------
export const EAR_KEYS = ['none', 'bolts', 'cups', 'fins'];
export function ears(k, hd) {
  if (k === 'none') return null;
  return memo('e' + k + hd.w, () => {
    const g = [], [x, y] = hd.ear;
    for (const s of [-1, 1]) {
      if (k === 'bolts') g.push(place(bcyl(0.026, 0.025, 0.006, R.CHROME, 6), [s * x, y, 0], [0, 0, -s * P / 2]), place(bcyl(0.012, 0.045, 0.004, R.DARK, 10), [s * x, y, 0], [0, 0, -s * P / 2]));
      if (k === 'cups') g.push(place(bcyl(0.045, 0.03, 0.012, R.B, 22), [s * (x - 0.01), y, 0], [0, 0, -s * P / 2]), place(bcyl(0.025, 0.035, 0.006, R.GLOW, 14), [s * (x - 0.01), y, 0], [0, 0, -s * P / 2]));
      if (k === 'fins') for (let i = 0; i < 3; i++) g.push(place(rbox(0.012, 0.05 - i * 0.01, 0.05, 0.005, R.B), [s * (x + 0.006), y + 0.03 - i * 0.025, -0.02 + i * 0.012]));
    }
    return merge(g);
  });
}
// antenna: list of springy rigs { mount index, segs: [geo, length], tip geo }
export const ANT_KEYS = ['none', 'whip', 'twin', 'coil', 'dish', 'bunny', 'bulb'];
export function antenna(k) {
  return memo('a' + k, () => {
    const rod = (len, r = 0.006, reg = R.DARK) => bcyl(r, len, r * 0.6, reg, 8);
    switch (k) {
      case 'none': return [];
      case 'whip': return [{ m: 0, segs: [[rod(0.09), 0.09], [rod(0.08, 0.004, R.CHROME), 0.08]], tip: sph(0.018, R.GLOW, 12, 8), k: 60 }];
      case 'twin': return [1, 2].map((m, i) => ({ m, lean: i ? -0.35 : 0.35, segs: [[rod(0.06), 0.06], [rod(0.05, 0.004, R.CHROME), 0.05]], tip: sph(0.014, R.GLOW, 10, 8), k: 80 }));
      case 'coil': return [{ m: 0, segs: [[coil(0.012, 0.0028, 5, R.CHROME, 0.08), 0.08], [rod(0.04, 0.004, R.CHROME), 0.04]], tip: merge([sph(0.022, R.B, 14, 10)]), k: 30, coilLen: 0.08 }];
      case 'dish': return [{ m: 2, segs: [[rod(0.07), 0.07], [rod(0.02), 0.02]], tip: merge([place(lathe(prof([[0, 0, 0, R.WHITE], [0.05, 0.03, 0, R.WHITE], [0.048, 0.033, 0, R.WHITE], [0, 0.006, 0, R.WHITE]]), 20), [0, 0, 0], [0.9, 0, 0]), place(rod(0.03, 0.003), [0, 0, 0], [0.9, 0, 0])]), k: 70 }];
      case 'bunny': return [1, 2].map((m, i) => ({ m, lean: i ? -0.25 : 0.25, segs: [[place(rbox(0.035, 0.08, 0.015, 0.007, R.B), [0, 0.04, 0]), 0.08], [place(rbox(0.035, 0.08, 0.015, 0.012, R.B), [0, 0.04, 0]), 0.08]], tip: null, k: 22 }));
      case 'bulb': return [{ m: 0, segs: [[rod(0.03, 0.012), 0.03]], tip: merge([place(sph(0.03, R.GLOW, 16, 12), [0, 0.025, 0]), place(cyl(0.018, 0.018, 0.016, R.CHROME, 12), [0, 0.0, 0])]), k: 120 }];
    }
    return [];
  });
}

// ---------------- hands (origin wrist, fingers toward -y) ----------------
export const HAND_KEYS = ['mitt', 'claw', 'ball', 'tri'];
export function hand(k, reg) {
  return memo('hd' + k + reg, () => {
    switch (k) {
      case 'mitt': return merge([place(rbox(0.05, 0.055, 0.032, 0.014, reg), [0, -0.03, 0]), place(caps(0.009, 0.02, reg, 4, 8), [0.026, -0.022, 0.006], [0, 0, 0.6]), place(sph(0.014, R.DARK, 10, 8), [0, 0, 0])]);
      case 'claw': return merge([place(sph(0.017, R.DARK, 12, 8), [0, 0, 0]), ...[-1, 1].map((s) => merge([place(rbox(0.012, 0.045, 0.014, 0.005, reg), [s * 0.014, -0.026, 0], [0, 0, s * 0.3]), place(rbox(0.011, 0.025, 0.013, 0.005, reg), [s * 0.016, -0.055, 0], [0, 0, -s * 0.5])]))]);
      case 'ball': return merge([place(sph(0.03, reg, 16, 12), [0, -0.026, 0]), place(sph(0.012, R.DARK, 10, 8), [0, 0, 0])]);
      case 'tri': return merge([place(sph(0.022, reg, 14, 10), [0, -0.02, 0]), ...[-1, 0, 1].map((s) => place(caps(0.007, 0.022, R.DARK, 4, 8), [s * 0.013, -0.045, s === 0 ? 0.008 : 0], [0, 0, s * 0.3]))]);
    }
  });
}
// ---------------- feet (origin ankle, sole at y = -fh) ----------------
export const FOOT_KEYS = ['boot', 'pad', 'cup', 'flipper'];
export function foot(k, reg) {
  return memo('ft' + k + reg, () => {
    switch (k) {
      case 'boot': return { geo: merge([place(lathe(prof([[0, 0, 0, R.RUBBER], [0.042, 0, 0.006, R.RUBBER], [0.044, 0.012, 0, R.RUBBER], [0.044, 0.015, 0, reg], [0.04, 0.035, 0.02, reg], [0, 0.05, 0, reg]]), 20, 1, 1.45), [0, -0.05, 0.02]), place(sph(0.016, R.DARK, 10, 8), [0, 0, 0])]), fh: 0.05 };
      case 'pad': return { geo: merge([place(rbox(0.07, 0.03, 0.1, 0.012, reg), [0, -0.025, 0.018]), place(rbox(0.074, 0.01, 0.104, 0.004, R.RUBBER), [0, -0.04, 0.018]), place(sph(0.016, R.DARK, 10, 8), [0, 0, 0])]), fh: 0.045 };
      case 'cup': return { geo: merge([lathe(prof([[0, -0.045, 0, R.RUBBER], [0.045, -0.045, 0.006, R.RUBBER], [0.046, -0.035, 0, R.RUBBER], [0.046, -0.032, 0, reg], [0.034, -0.005, 0.01, reg], [0, 0, 0, reg]]), 22), place(sph(0.016, R.DARK, 10, 8), [0, 0, 0])]), fh: 0.045 };
      case 'flipper': return { geo: merge([place(rbox(0.06, 0.02, 0.13, 0.009, reg), [0, -0.036, 0.035]), place(rbox(0.05, 0.03, 0.05, 0.01, R.DARK), [0, -0.02, 0]), place(sph(0.016, R.DARK, 10, 8), [0, 0, 0])]), fh: 0.046 };
    }
  });
}
// ---------------- limb segments (unit length along +y, scaled at runtime) ----------------
export const LIMB_KEYS = ['rod', 'coil', 'piston'];
export function limbSeg(k, r, len) {
  return memo('l' + k + r.toFixed(4) + len.toFixed(3), () => {
    switch (k) {
      case 'rod': return bcyl(r, len, r * 0.5, R.DARK, 10);
      case 'coil': return merge([coil(r * 1.15, r * 0.34, Math.max(4, Math.round(len / 0.018)), R.CHROME, len), bcyl(r * 0.35, len, 0.001, R.DARK, 6)]);
      case 'piston': return merge([bcyl(r * 1.3, len * 0.55, r * 0.5, R.B, 12), bcyl(r * 0.7, len, r * 0.3, R.CHROME, 10)]);
    }
  });
}
export const joint = (r, reg) => memo('j' + r.toFixed(4) + reg, () => sph(r, reg, 14, 10));
export function crateGeo(w = 0.42, h = 0.3, d = 0.32) {
  return memo('crate' + w + h + d, () => {
    const g = [rbox(w, h, d, 0.012, R.A)];
    for (const s of [-1, 1]) {
      g.push(place(rbox(w + 0.01, 0.035, 0.02, 0.008, R.B), [0, s * (h / 2 - 0.02), d / 2]), place(rbox(w + 0.01, 0.035, 0.02, 0.008, R.B), [0, s * (h / 2 - 0.02), -d / 2]));
      g.push(place(rbox(0.035, h, 0.02, 0.008, R.B), [s * (w / 2 - 0.02), 0, d / 2]), place(rbox(0.035, h, 0.02, 0.008, R.B), [s * (w / 2 - 0.02), 0, -d / 2]));
      g.push(place(rbox(0.02, 0.04, 0.12, 0.01, R.DARK), [s * (w / 2 + 0.008), h * 0.15, 0]));
    }
    g.push(place(rbox(Math.hypot(w, h) * 0.9, 0.03, 0.016, 0.006, R.B), [0, 0, d / 2 + 0.004], [0, 0, Math.atan2(h, w)]));
    return merge(g);
  });
}
