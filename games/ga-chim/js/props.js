// Prop builders. Each builds at the kit's current matrix, in local metres (x right, y up, z length).
// They register colliders on the kit and light fixtures / decals on the returned info.
import * as THREE from '../vendor/three.module.min.js';
import { rng } from './rng.js';
import { chamferBox, cylinder, lathe, tubeBetween, extrude, roundRect } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function bogie(k, z, axles = 2) {
  k.push().at(0, 0, z);
  const span = axles === 3 ? 1.9 : 1.25;
  k.box(2.3, 0.32, axles === 3 ? 4.6 : 3.2, 'darkSteel', 0, 0.78, 0, 0.04);
  k.box(0.5, 0.5, 1.8, 'darkSteel', 0, 0.98, 0, 0.05);
  for (const sx of [-1, 1]) {
    k.box(0.16, 0.42, axles === 3 ? 4.4 : 3.0, 'darkSteel', sx * 1.0, 0.62, 0, 0.03);
    for (let a = 0; a < axles; a++) {
      const az = axles === 3 ? (a - 1) * span : (a - 0.5) * span * 2;
      k.cyl(0.46, 0.13, 'wheel', sx * 0.72, 0.46, az, 24, 'x');
      k.cyl(0.5, 0.03, 'wheel', sx * 0.66, 0.46, az, 24, 'x');
      k.box(0.26, 0.3, 0.34, 'darkSteel', sx * 1.0, 0.48, az, 0.04);
      for (let s = 0; s < 3; s++) k.cyl(0.07, 0.07, 'spring', sx * 1.0, 0.68 + s * 0.08, az + 0.0, 8);
    }
    for (let s = -1; s <= 1; s += 2) k.cyl(0.09, 0.26, 'spring', sx * 1.0, 0.9, s * 0.25, 10);
  }
  k.cyl(0.06, 1.7, 'darkSteel', 0, 0.46, -span * (axles === 3 ? 1 : 1), 8, 'x');
  k.cyl(0.06, 1.7, 'darkSteel', 0, 0.46, span * (axles === 3 ? 1 : 1), 8, 'x');
  k.pop();
}

function underframe(k, len, info) {
  k.box(0.5, 0.42, len, 'darkSteel', 0, 1.18, 0, 0.03);
  for (const sx of [-1, 1]) k.box(0.18, 0.36, len, 'darkSteel', sx * 1.42, 1.22, 0, 0.03);
  for (const sz of [-1, 1]) {
    const ez = sz * (len / 2);
    k.box(2.9, 0.42, 0.22, 'darkSteel', 0, 1.18, ez, 0.03);
    for (const sx of [-1, 1]) { k.cyl(0.19, 0.42, 'steelBright', sx * 0.88, 1.12, ez + sz * 0.26, 16, 'z'); k.cyl(0.24, 0.05, 'steelBright', sx * 0.88, 1.12, ez + sz * 0.48, 16, 'z'); }
    k.box(0.24, 0.24, 0.6, 'darkSteel', 0, 1.06, ez + sz * 0.3, 0.03);
    // steps and grab irons at corners
    for (const sx of [-1, 1]) {
      k.box(0.42, 0.04, 0.24, 'darkSteel', sx * 1.4, 0.62, ez - sz * 0.4, 0.01);
      k.tube(V(sx * 1.4, 0.62, ez - sz * 0.28), V(sx * 1.4, 1.0, ez - sz * 0.28), 0.018, 'darkSteel', 6);
    }
  }
  // brake cylinder, air reservoir, pipes
  k.cyl(0.22, 1.1, 'darkSteel', 0.6, 0.95, len * 0.12, 14, 'z');
  k.cyl(0.18, 0.5, 'darkSteel', -0.5, 0.95, -len * 0.08, 14, 'x');
  k.tube(V(-0.3, 0.98, -len / 2), V(-0.3, 0.98, len / 2), 0.03, 'darkSteel', 6);
  k.collide(3.0, 1.4, len, 0, 0.7, 0);
}

export function boxcar(k, opts, info) {
  const r = rng(opts.seed || 'boxcar');
  const len = opts.len || 15.2, bodyH = 3.25, y0 = 1.42;
  const paint = opts.paint || 'boxRed';
  underframe(k, len, info);
  bogie(k, -len / 2 + 2.6); bogie(k, len / 2 - 2.6);
  k.box(2.95, bodyH, len, paint, 0, y0 + bodyH / 2, 0, 0.06);
  // posts
  const posts = Math.floor(len / 1.25);
  for (let i = 0; i <= posts; i++) {
    const z = -len / 2 + 0.15 + i * ((len - 0.3) / posts);
    if (Math.abs(z) < 1.9) continue;
    for (const sx of [-1, 1]) k.box(0.08, bodyH - 0.1, 0.16, paint, sx * 1.5, y0 + bodyH / 2, z, 0.025);
  }
  // top & bottom chords
  for (const sx of [-1, 1]) {
    k.box(0.12, 0.16, len, paint, sx * 1.5, y0 + bodyH - 0.06, 0, 0.03);
    k.box(0.12, 0.2, len, paint, sx * 1.5, y0 + 0.08, 0, 0.03);
    // sliding door + rails
    const open = opts.open && sx === 1 ? 1.6 : 0;
    k.box(0.1, bodyH - 0.2, 3.3, paint, sx * 1.57, y0 + bodyH / 2, open, 0.03);
    for (let d = -1; d <= 1; d++) k.box(0.05, bodyH - 0.4, 0.08, paint, sx * 1.63, y0 + bodyH / 2, open + d * 1.1, 0.015);
    k.box(0.12, 0.1, 6.6, 'darkSteel', sx * 1.62, y0 + bodyH - 0.12, 0.8, 0.02);
    k.box(0.12, 0.1, 6.6, 'darkSteel', sx * 1.62, y0 + 0.12, 0.8, 0.02);
    k.box(0.06, 0.6, 0.06, 'darkSteel', sx * 1.66, y0 + 1.4, open + 1.5, 0.01);
  }
  // roof: arched panels + seams
  const roof = new THREE.Shape(); roof.moveTo(-1.55, 0); roof.quadraticCurveTo(0, 0.42, 1.55, 0); roof.lineTo(1.55, -0.05); roof.quadraticCurveTo(0, 0.36, -1.55, -0.05); roof.lineTo(-1.55, 0);
  k.push().at(0, y0 + bodyH, 0); k.add(extrude(roof, len + 0.1, 0.01, 1), paint); k.pop();
  for (let i = 0; i < Math.floor(len / 1.25); i++) {
    const z = -len / 2 + 0.6 + i * 1.25;
    const seam = new THREE.Shape(); seam.moveTo(-1.56, 0); seam.quadraticCurveTo(0, 0.45, 1.56, 0); seam.lineTo(1.56, 0.03); seam.quadraticCurveTo(0, 0.49, -1.56, 0.03);
    k.push().at(0, y0 + bodyH, z); k.add(extrude(seam, 0.06, 0, 0), paint); k.pop();
  }
  k.box(0.55, 0.05, len - 0.6, 'grating', 0, y0 + bodyH + 0.44, 0, 0.01);
  // end details: ladder, brake wheel
  for (const sz of [-1, 1]) {
    const ez = sz * (len / 2 + 0.03);
    for (const sx of [-1, 1]) k.tube(V(sx * 1.2, y0 + 0.2, ez + sz * 0.1), V(sx * 1.2, y0 + bodyH, ez + sz * 0.1), 0.02, 'darkSteel', 6);
    for (let i = 0; i < 7; i++) k.tube(V(-1.2, y0 + 0.4 + i * 0.42, ez + sz * 0.12), V(-0.75, y0 + 0.4 + i * 0.42, ez + sz * 0.12), 0.016, 'darkSteel', 5);
    for (let i = 0; i < 4; i++) k.box(2.9, 0.08, 0.06, paint, 0, y0 + 0.6 + i * 0.8, ez, 0.02);
  }
  k.push().at(0.7, y0 + 2.4, len / 2 + 0.2);
  const wheel = new THREE.TorusGeometry(0.28, 0.025, 6, 20); k.add(wheel, 'darkSteel');
  for (let s = 0; s < 3; s++) { k.push().at(0, 0, 0, 0, 0, s * Math.PI / 3); k.box(0.56, 0.03, 0.03, 'darkSteel'); k.pop(); }
  k.pop();
  k.collide(3.1, bodyH + 0.6, len, 0, y0 + bodyH / 2, 0);
  info.decals.push({ kind: 'wagon', side: 1, len, h: bodyH, y0, seed: opts.seed, mark: opts.mark });
  info.decals.push({ kind: 'wagon', side: -1, len, h: bodyH, y0, seed: opts.seed, mark: opts.mark });
}

export function tankcar(k, opts, info) {
  const len = 13.5; const R = 1.42;
  underframe(k, len, info);
  bogie(k, -len / 2 + 2.3); bogie(k, len / 2 - 2.3);
  const prof = [];
  const L = len / 2 - 0.4;
  prof.push([0, -L - 0.55]);
  for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; prof.push([Math.sin(a) * R, -L - Math.cos(a) * 0.55]); }
  prof.push([R, L]);
  for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; prof.push([Math.cos(a) * R, L + Math.sin(a) * 0.55]); }
  prof.push([0, L + 0.55]);
  const g = lathe(prof, 40); g.rotateX(Math.PI / 2);
  k.push().at(0, 1.42 + R + 0.15, 0); k.add(g, opts.paint || 'tankBlack');
  for (const zz of [-L + 0.6, -2, 2, L - 0.6]) { const band = new THREE.TorusGeometry(R + 0.015, 0.03, 6, 40); k.add(band, 'darkSteel', new THREE.Matrix4().makeTranslation(0, 0, zz)); }
  k.cyl(0.55, 0.5, opts.paint || 'tankBlack', 0, R + 0.2, 0, 24);
  k.cyl(0.6, 0.06, 'darkSteel', 0, R + 0.46, 0, 24);
  k.box(1.6, 0.05, 2.0, 'grating', 0, R + 0.02, 0, 0.01);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.tube(V(sx * 0.8, R + 0.05, sz * 1.0), V(sx * 0.8, R + 1.0, sz * 1.0), 0.02, 'paintYellow', 6);
  for (const sx of [-1, 1]) k.tube(V(sx * 0.8, R + 1.0, -1.0), V(sx * 0.8, R + 1.0, 1.0), 0.02, 'paintYellow', 6);
  k.pop();
  for (const sz of [-1, 1]) k.box(2.4, 0.5, 0.5, 'darkSteel', 0, 1.62, sz * (len / 2 - 2.3), 0.04);
  // side ladder
  for (let i = 0; i < 6; i++) k.tube(V(1.52, 1.5 + i * 0.4, -0.25), V(1.52, 1.5 + i * 0.4, 0.25), 0.016, 'paintYellow', 5);
  k.collide(3.0, 3.3, len + 1, 0, 1.6, 0);
  info.decals.push({ kind: 'tank', side: 1, len, R, y: 1.42 + R + 0.15, seed: opts.seed });
  info.decals.push({ kind: 'tank', side: -1, len, R, y: 1.42 + R + 0.15, seed: opts.seed });
}

export function container(k, l, paint, x, y, z, ry, info, seed) {
  k.push().at(x, y, z, ry);
  const w = 2.44, h = 2.59;
  k.box(w, h - 0.12, l - 0.16, paint, 0, h / 2, 0, 0.03);
  for (const sx of [-1, 1]) for (const sy of [0, 1]) k.box(0.16, 0.14, l, 'darkSteel', sx * (w / 2 - 0.08), sy * (h - 0.14) + 0.07, 0, 0.02);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.box(0.16, h, 0.16, 'darkSteel', sx * (w / 2 - 0.08), h / 2, sz * (l / 2 - 0.08), 0.02);
    for (const sy of [0, 1]) k.box(0.18, 0.12, 0.18, 'steel', sx * (w / 2 - 0.08), sy * (h - 0.12) + 0.06, sz * (l / 2 - 0.08), 0.015);
  }
  // door end: two leaves with locking bars
  const dz = l / 2 - 0.01;
  k.box(w - 0.3, h - 0.3, 0.05, paint, 0, h / 2, dz, 0.01);
  for (const bx of [-0.85, -0.45, 0.45, 0.85]) {
    k.tube(V(bx, 0.2, dz + 0.06), V(bx, h - 0.2, dz + 0.06), 0.022, 'steel', 6);
    k.box(0.08, 0.12, 0.06, 'steel', bx, h / 2, dz + 0.1, 0.01);
  }
  k.box(0.02, h - 0.3, 0.06, 'darkSteel', 0, h / 2, dz + 0.04, 0.005);
  k.collide(w, h, l, 0, h / 2, 0);
  info.decals.push({ kind: 'container', l, w, h, seed: seed || 'c' + x + z, m: k.m.clone() });
  k.pop();
}

export function flatcar(k, opts, info) {
  const len = 15;
  underframe(k, len, info);
  bogie(k, -len / 2 + 2.4); bogie(k, len / 2 - 2.4);
  k.box(2.9, 0.18, len, 'wood', 0, 1.48, 0, 0.02);
  for (let i = 0; i < 18; i++) k.box(2.92, 0.02, 0.06, 'darkSteel', 0, 1.58, -len / 2 + 0.4 + i * (len - 0.8) / 17, 0.005);
  const pal = ['boxBlue', 'boxGreen', 'boxGrey', 'boxOrange', 'boxRed'];
  const r = rng(opts.seed || 'flat');
  if (opts.load === 'containers') {
    container(k, 6.06, r.pick(pal), 0, 1.57, -3.4, 0, info, opts.seed + 'a');
    container(k, 6.06, r.pick(pal), 0, 1.57, 3.4, Math.PI, info, opts.seed + 'b');
  } else if (opts.load === 'rails') {
    for (let i = 0; i < 9; i++) for (let j = 0; j < 2; j++) k.box(0.15, 0.17, len - 1, 'rust', -1.0 + i * 0.25, 1.66 + j * 0.18, 0, 0.02);
    for (const z of [-5, 0, 5]) k.box(2.6, 0.12, 0.2, 'wood', 0, 1.62, z, 0.02);
  }
  k.collide(3.0, 4.2, len, 0, 2.1, 0);
}

export function hopper(k, opts, info) {
  const len = 14;
  underframe(k, len, info);
  bogie(k, -len / 2 + 2.3); bogie(k, len / 2 - 2.3);
  const s = new THREE.Shape(); s.moveTo(-1.5, 3.4); s.lineTo(1.5, 3.4); s.lineTo(1.5, 1.4); s.lineTo(0.4, 0.2); s.lineTo(-0.4, 0.2); s.lineTo(-1.5, 1.4);
  const paint = opts.paint || 'boxGrey';
  k.push().at(0, 1.0, 0); k.add(extrude(s, len - 0.6, 0.03, 1), paint); k.pop();
  for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) k.box(0.08, 2.0, 0.14, paint, sx * 1.53, 3.4, -len / 2 + 0.8 + i * (len - 1.6) / 8, 0.02);
  for (const z of [-4.5, -1.5, 1.5, 4.5]) k.box(0.9, 0.5, 0.9, 'darkSteel', 0, 1.15, z, 0.04);
  k.collide(3.1, 4.4, len, 0, 2.2, 0);
  info.decals.push({ kind: 'wagon', side: 1, len: len - 0.6, h: 2.0, y0: 2.4, seed: opts.seed, small: true });
  info.decals.push({ kind: 'wagon', side: -1, len: len - 0.6, h: 2.0, y0: 2.4, seed: opts.seed, small: true });
}

export function locomotive(k, opts, info) {
  const len = 19;
  underframe(k, len, info);
  bogie(k, -len / 2 + 3.4, 3); bogie(k, len / 2 - 3.4, 3);
  k.box(3.0, 0.25, len + 0.4, 'locoBody', 0, 1.5, 0, 0.04);
  // fuel tank
  const tank = roundRect(2.6, 1.0, 0.35); k.push().at(0, 0.98, 0); k.add(extrude(tank, 7, 0.03, 2), 'darkSteel'); k.pop();
  // long hood
  k.box(2.3, 2.5, 12.0, 'locoBody', 0, 2.9, -2.8, 0.18);
  for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) {
    k.box(0.04, 1.6, 1.0, 'grating', sx * 1.17, 2.95, -8 + i * 1.25, 0.01);
    k.box(0.05, 1.7, 0.06, 'locoBody', sx * 1.18, 2.95, -8.65 + i * 1.25, 0.01);
  }
  for (let i = 0; i < 3; i++) { k.cyl(0.55, 0.18, 'darkSteel', 0, 4.2, -7 + i * 2.2, 24); k.cyl(0.5, 0.05, 'grating', 0, 4.31, -7 + i * 2.2, 24); }
  k.box(0.6, 0.5, 0.9, 'darkSteel', 0, 4.35, -1.4, 0.06);
  // cab
  k.box(3.0, 2.9, 3.4, 'locoBody', 0, 3.1, 5.0, 0.12);
  k.box(3.1, 0.18, 3.6, 'locoBody', 0, 4.62, 5.0, 0.06);
  for (const sx of [-1, 1]) { k.box(0.06, 0.9, 1.2, 'glass', sx * 1.51, 3.7, 5.4, 0.02); k.box(0.06, 1.0, 1.4, 'locoTrim', sx * 1.5, 3.7, 5.4, 0.02); }
  k.box(1.1, 0.8, 0.06, 'glass', -0.65, 3.85, 6.72, 0.02); k.box(1.1, 0.8, 0.06, 'glass', 0.65, 3.85, 6.72, 0.02);
  // short hood
  k.box(2.3, 2.0, 2.4, 'locoBody', 0, 2.6, 7.9, 0.16);
  // headlights
  k.box(0.7, 0.3, 0.1, 'locoTrim', 0, 3.0, 9.12, 0.03);
  for (const sx of [-0.18, 0.18]) k.cyl(0.11, 0.06, opts.lit ? 'emitHead' : 'glass', sx, 3.0, 9.18, 16, 'z');
  for (const sx of [-1, 1]) k.cyl(0.1, 0.06, opts.lit ? 'emitHead' : 'glass', sx * 1.0, 1.75, 9.6, 16, 'z');
  // handrails along the walkway
  for (const sx of [-1, 1]) {
    k.tube(V(sx * 1.45, 2.45, -8.5), V(sx * 1.45, 2.45, 3.0), 0.025, 'paintYellow', 6);
    for (let i = 0; i < 8; i++) k.tube(V(sx * 1.45, 1.62, -8.5 + i * 1.6), V(sx * 1.45, 2.45, -8.5 + i * 1.6), 0.02, 'paintYellow', 6);
  }
  // nose stripes plate
  k.box(2.9, 0.5, 0.06, 'paintYellow', 0, 1.55, len / 2 + 0.24, 0.01);
  k.collide(3.1, 4.8, len + 1, 0, 2.4, 0);
  info.lamps.push({ pos: V(0, 3.0, 9.6), dir: V(0, -0.08, 1), color: 0xfff1d0, power: opts.lit ? 1 : 0, kind: 'head', id: 'loco', cone: true, coneLen: 34, angle: 0.32, range: 70 });
  info.decals.push({ kind: 'loco', len, seed: opts.seed });
}

export function catenaryPole(k, span, info) {
  // H-beam mast with cantilever arms over `span` metres of track (towards +x)
  k.box(0.32, 8.4, 0.26, 'paintGrey', 0, 4.2, 0, 0.02);
  k.box(0.06, 8.4, 0.26, 'paintGrey', 0.13, 4.2, 0, 0.01);
  k.box(0.7, 0.4, 0.7, 'concrete', 0, 0.2, 0, 0.05);
  // cross girder
  k.box(span, 0.24, 0.2, 'paintGrey', span / 2, 8.1, 0, 0.02);
  k.box(span, 0.12, 0.12, 'paintGrey', span / 2, 7.6, 0, 0.02);
  for (let i = 0; i < Math.floor(span / 1.2); i++) {
    const x0 = i * 1.2, x1 = x0 + 1.2;
    k.tube(V(x0, 7.6, 0), V(x1, 8.1, 0), 0.03, 'paintGrey', 5);
  }
  for (let t = 0; t < info.tracks; t++) {
    const x = info.trackX[t];
    if (x < 0.5 || x > span) continue;
    k.tube(V(x, 7.6, 0), V(x, 6.3, 0), 0.03, 'steel', 6);
    k.cyl(0.07, 0.28, 'insulator', x, 6.85, 0, 10);
    k.tube(V(x - 0.4, 6.3, 0), V(x + 0.25, 5.65, 0), 0.025, 'steel', 6);
  }
  k.collide(0.45, 8.4, 0.45, 0, 4.2, 0);
}

export function floodMast(k, opts, info) {
  const H = opts.h || 19;
  const leg = 1.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.tube(V(sx * leg, 0, sz * leg), V(sx * 0.35, H, sz * 0.35), 0.06, 'galv', 6);
    k.box(0.5, 0.3, 0.5, 'concrete', sx * leg, 0.15, sz * leg, 0.04);
  }
  const lvls = 8;
  for (let i = 0; i < lvls; i++) {
    const y0 = (i / lvls) * H, y1 = ((i + 1) / lvls) * H;
    const w0 = leg + (0.35 - leg) * (i / lvls), w1 = leg + (0.35 - leg) * ((i + 1) / lvls);
    for (let s = 0; s < 4; s++) {
      const a0 = [[1, 1], [1, -1], [-1, -1], [-1, 1]][s], a1 = [[1, -1], [-1, -1], [-1, 1], [1, 1]][s];
      k.tube(V(a0[0] * w0, y0, a0[1] * w0), V(a1[0] * w1, y1, a1[1] * w1), 0.025, 'galv', 4);
      k.tube(V(a0[0] * w1, y1, a0[1] * w1), V(a1[0] * w1, y1, a1[1] * w1), 0.025, 'galv', 4);
    }
  }
  // platform and light heads
  k.box(2.4, 0.08, 1.4, 'grating', 0, H, 0, 0.01);
  k.tube(V(-1.2, H + 0.9, 0.7), V(1.2, H + 0.9, 0.7), 0.025, 'galv', 5);
  const heads = opts.heads || 4;
  for (let i = 0; i < heads; i++) {
    const x = (i - (heads - 1) / 2) * 0.6;
    k.push().at(x, H + 0.55, 0.75, 0, -0.75 + (i % 2) * 0.15);
    k.box(0.5, 0.36, 0.22, 'darkSteel', 0, 0, 0, 0.04);
    k.box(0.44, 0.3, 0.03, 'emitSodium', 0, 0, 0.12, 0.01);
    k.pop();
  }
  k.collide(2.4, H, 2.4, 0, H / 2, 0);
  const aim = opts.aim || V(0, -1, 1.2);
  info.lamps.push({ pos: V(0, H + 0.55, 0.9), dir: aim.clone().normalize(), color: 0xffa040, power: 1, kind: 'flood', angle: 0.75, range: 60, cone: true, coneLen: H * 1.3 });
}

export function lampPost(k, opts, info) {
  k.cyl(0.09, 6.2, 'paintGrey', 0, 3.1, 0, 10);
  k.cyl(0.18, 0.4, 'concrete', 0, 0.2, 0, 12);
  k.tube(V(0, 6.1, 0), V(0, 6.35, 1.0), 0.05, 'paintGrey', 8);
  k.box(0.32, 0.12, 0.6, 'darkSteel', 0, 6.33, 1.25, 0.03);
  k.box(0.26, 0.02, 0.5, 'emitSodium', 0, 6.26, 1.25, 0.005);
  k.collide(0.3, 6, 0.3, 0, 3, 0);
  info.lamps.push({ pos: V(0, 6.2, 1.25), dir: V(0, -1, 0.05), color: 0xff9a3a, power: 0.6, kind: 'post', angle: 1.0, range: 22, cone: true, coneLen: 6.4 });
}

export function signalGantry(k, span, info) {
  for (const x of [0, span]) {
    for (const sz of [-0.5, 0.5]) k.box(0.2, 7.2, 0.2, 'paintGrey', x, 3.6, sz, 0.02);
    for (let i = 0; i < 6; i++) k.tube(V(x, i * 1.2, -0.5), V(x, (i + 1) * 1.2, 0.5), 0.025, 'paintGrey', 4);
    k.box(0.9, 0.3, 1.5, 'concrete', x, 0.15, 0, 0.04);
  }
  for (const sz of [-0.5, 0.5]) k.box(span, 0.18, 0.18, 'paintGrey', span / 2, 7.2, sz, 0.02);
  for (let i = 0; i < Math.floor(span / 1.0); i++) k.tube(V(i, 7.2, -0.5), V(i + 1, 7.2, 0.5), 0.022, 'paintGrey', 4);
  k.box(span, 0.06, 1.0, 'grating', span / 2, 7.32, 0, 0.01);
  for (let t = 0; t < info.tracks; t++) {
    const x = info.trackX[t];
    if (x < 1 || x > span - 1) continue;
    k.push().at(x, 6.2, 0.6);
    k.box(0.5, 1.5, 0.3, 'darkSteel', 0, 0, 0, 0.06);
    for (let j = 0; j < 3; j++) {
      k.cyl(0.13, 0.05, j === 0 ? 'emitRed' : 'glass', 0, 0.45 - j * 0.42, 0.17, 16, 'z');
      k.cyl(0.17, 0.2, 'darkSteel', 0, 0.5 - j * 0.42, 0.25, 16, 'z');
    }
    k.pop();
  }
}

export function signalBox(k, opts, info) {
  // two storey brick tower with glazed upper cabin, external stair
  const W = 6.4, D = 4.4;
  k.box(W, 3.2, D, 'brick', 0, 1.6, 0, 0.02);
  k.box(W + 0.2, 0.2, D + 0.2, 'concrete', 0, 3.25, 0, 0.03);
  // upper cabin frame and glass
  k.box(W, 0.9, D, 'boardsGreen', 0, 3.8, 0, 0.02);
  for (const sx of [-1, 1]) {
    k.box(0.05, 1.3, D - 0.4, 'glassLit', sx * (W / 2 - 0.02), 4.9, 0, 0.01);
    for (let i = 0; i < 5; i++) k.box(0.1, 1.4, 0.08, 'boardsGreen', sx * (W / 2), 4.9, -D / 2 + 0.2 + i * (D - 0.4) / 4, 0.01);
  }
  for (const sz of [-1, 1]) {
    k.box(W - 0.4, 1.3, 0.05, 'glassLit', 0, 4.9, sz * (D / 2 - 0.02), 0.01);
    for (let i = 0; i < 7; i++) k.box(0.08, 1.4, 0.1, 'boardsGreen', -W / 2 + 0.2 + i * (W - 0.4) / 6, 4.9, sz * (D / 2), 0.01);
  }
  k.box(W, 0.25, D, 'boardsGreen', 0, 5.7, 0, 0.02);
  // hipped roof
  const roof = new THREE.ConeGeometry(Math.hypot(W, D) / 2 + 0.6, 1.5, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1, 1, D / W);
  k.push().at(0, 6.55, 0); k.add(roof, 'roofSlate'); k.pop();
  k.cyl(0.25, 1.2, 'brick', 1.8, 7.0, 0.8, 10);
  // ground floor windows (boarded) and door
  for (const x of [-1.8, 1.8]) { k.box(1.0, 1.1, 0.08, 'boards', x, 1.7, D / 2 + 0.02, 0.01); k.box(1.2, 0.12, 0.2, 'concrete', x, 1.1, D / 2 + 0.08, 0.02); }
  k.box(1.0, 2.1, 0.08, 'doorSteel', 0, 1.05, D / 2 + 0.03, 0.02);
  // external stair to cabin
  for (let i = 0; i < 14; i++) k.box(1.0, 0.05, 0.3, 'grating', W / 2 + 0.6, 0.25 + i * 0.25, D / 2 - 0.2 - i * 0.27, 0.01);
  k.tube(V(W / 2 + 1.1, 1.2, D / 2 - 0.2), V(W / 2 + 1.1, 4.6, -D / 2 + 0.4), 0.025, 'paintGrey', 6);
  k.box(1.2, 0.08, 1.2, 'grating', W / 2 + 0.6, 3.6, -D / 2 + 0.2, 0.01);
  k.collide(W, 6.2, D, 0, 3.1, 0);
  k.collide(1.2, 3.6, D, W / 2 + 0.6, 1.8, 0);
  info.lamps.push({ pos: V(0, 4.9, 0), dir: V(0, -1, 0), color: 0xffd9a0, power: 0.0, kind: 'cabin', angle: 1.4, range: 10, id: opts.id });
  info.decals.push({ kind: 'sign', text: opts.name || 'GÁC GHI', w: 2.2, h: 0.5, m: k.m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 3.6, D / 2 + 0.05)) });
}

export function powerCabinet(k, opts, info) {
  k.box(1.4, 1.9, 0.6, 'paintGreyGreen', 0, 0.95 + 0.15, 0, 0.04);
  k.box(1.6, 0.15, 0.8, 'concrete', 0, 0.075, 0, 0.03);
  k.box(1.5, 0.08, 0.7, 'paintGreyGreen', 0, 2.1, 0, 0.02);
  for (const sx of [-0.35, 0.35]) k.box(0.62, 1.7, 0.03, 'paintGreyGreen', sx, 1.05, 0.31, 0.01);
  k.box(0.05, 0.2, 0.05, 'steel', 0.05, 1.2, 0.34, 0.01);
  k.tube(V(0.5, 0.15, 0), V(0.5, -0.3, 0), 0.06, 'rubber', 8);
  k.collide(1.5, 2.2, 0.8, 0, 1.1, 0);
  info.objectives.push({ id: opts.id, m: k.m.clone() });
}

export function shed(k, opts, info) {
  const W = opts.w || 26, L = opts.l || 44, H = 9;
  // walls with big door openings at the ends
  for (const sx of [-1, 1]) {
    k.box(0.15, H, L, 'shedWall', sx * W / 2, H / 2, 0, 0.02);
    for (let i = 0; i <= 11; i++) k.box(0.35, H, 0.3, 'paintGrey', sx * (W / 2 - 0.2), H / 2, -L / 2 + i * (L / 11), 0.02);
    for (let i = 0; i < 6; i++) k.box(0.06, 1.2, 3.0, 'glassLit', sx * (W / 2 + 0.02), H - 1.6, -L / 2 + 3.5 + i * 7.4, 0.01);
  }
  for (const sz of [-1, 1]) {
    k.box(W / 2 - 5, H, 0.15, 'shedWall', -W / 4 - 2.5, H / 2, sz * L / 2, 0.02);
    k.box(W / 2 - 5, H, 0.15, 'shedWall', W / 4 + 2.5, H / 2, sz * L / 2, 0.02);
    k.box(10, H - 6.5, 0.15, 'shedWall', 0, 6.5 + (H - 6.5) / 2, sz * L / 2, 0.02);
    k.box(10.4, 0.4, 0.4, 'paintYellow', 0, 6.3, sz * L / 2, 0.03);
    k.collide(W / 2 - 5, H, 0.5, -W / 4 - 2.5, H / 2, sz * L / 2);
    k.collide(W / 2 - 5, H, 0.5, W / 4 + 2.5, H / 2, sz * L / 2);
  }
  for (const sx of [-1, 1]) k.collide(0.5, H, L, sx * W / 2, H / 2, 0);
  // gable roof
  const rise = 3.0;
  for (const sx of [-1, 1]) {
    k.push().at(sx * W / 4, H + rise / 2, 0, 0, 0, -sx * Math.atan2(rise, W / 2));
    k.box(Math.hypot(W / 2, rise) + 0.6, 0.12, L + 0.8, 'shedRoof', 0, 0, 0, 0.02);
    k.pop();
  }
  for (let i = 0; i <= 11; i++) {
    const z = -L / 2 + i * (L / 11);
    k.tube(V(-W / 2, H, z), V(0, H + rise - 0.2, z), 0.12, 'paintGrey', 6);
    k.tube(V(W / 2, H, z), V(0, H + rise - 0.2, z), 0.12, 'paintGrey', 6);
    k.tube(V(-W / 2, H, z), V(W / 2, H, z), 0.08, 'paintGrey', 6);
  }
  // interior floor (dry, oily concrete) and hanging lamps
  k.box(W - 0.4, 0.1, L - 0.4, 'shedFloor', 0, 0.05, 0, 0.01);
  for (let i = 0; i < 4; i++) {
    const z = -L / 2 + 6 + i * ((L - 12) / 3);
    for (const x of [-W / 4, W / 4]) {
      k.tube(V(x, H, z), V(x, H - 2.5, z), 0.01, 'darkSteel', 4);
      const shade = new THREE.ConeGeometry(0.45, 0.35, 16, 1, true); k.add(shade, 'paintGreenDark', new THREE.Matrix4().makeTranslation(x, H - 2.65, z));
      k.cyl(0.12, 0.1, 'emitWarm', x, H - 2.8, z, 12);
      info.lamps.push({ pos: V(x, H - 2.9, z), dir: V(0, -1, 0), color: 0xffc27a, power: 0.8, kind: 'hang', angle: 1.1, range: 16, cone: true, coneLen: 6.2, inside: true });
    }
  }
  info.dryZones.push({ m: k.m.clone(), w: W, l: L, h: H + rise });
}

export function platform(k, opts, info) {
  const L = opts.l || 70, W = 6;
  k.box(W, 1.05, L, 'concrete', 0, 0.52, 0, 0.04);
  k.box(0.6, 0.08, L, 'paintYellow', -W / 2 + 0.35, 1.07, 0, 0.005);
  k.box(0.1, 0.1, L, 'concrete', -W / 2 + 0.05, 1.0, 0, 0.02);
  k.collide(W, 1.05, L, 0, 0.52, 0);
  // canopy
  const cl = opts.canopy || 40;
  for (let i = 0; i <= Math.floor(cl / 6); i++) {
    const z = -cl / 2 + i * 6;
    k.box(0.22, 4.2, 0.22, 'paintGreenDark', 0.6, 3.15, z, 0.02);
    k.box(5.2, 0.25, 0.18, 'paintGreenDark', 0.3, 5.2, z, 0.02);
    k.tube(V(0.6, 4.2, z), V(-2.0, 5.15, z), 0.05, 'paintGreenDark', 6);
    k.tube(V(0.6, 4.2, z), V(2.6, 5.15, z), 0.05, 'paintGreenDark', 6);
    k.collide(0.3, 4.2, 0.3, 0.6, 3.15, z);
  }
  k.push().at(0.3, 5.42, 0, 0, 0, 0.05); k.box(5.6, 0.1, cl + 0.6, 'shedRoof', 0, 0, 0, 0.02); k.pop();
  for (const sx of [-1, 1]) k.box(0.08, 0.35, cl + 0.6, 'paintGreenDark', 0.3 + sx * 2.8, 5.3 + sx * -0.14, 0, 0.01);
  // benches, signs, bins
  for (let i = 0; i < 4; i++) {
    const z = -cl / 2 + 5 + i * 9;
    k.push().at(1.6, 1.05, z);
    k.box(0.5, 0.06, 1.8, 'wood', 0, 0.45, 0, 0.01); k.box(0.06, 0.45, 1.8, 'wood', 0.25, 0.75, 0, 0.01);
    for (const s of [-0.75, 0.75]) k.box(0.45, 0.45, 0.06, 'darkSteel', 0, 0.22, s, 0.01);
    k.pop();
    k.cyl(0.25, 0.8, 'paintGreenDark', 2.4, 1.45, z + 3, 14);
  }
  info.dryZones.push({ m: k.m.clone().multiply(new THREE.Matrix4().makeTranslation(0.3, 0, 0)), w: 5.4, l: cl, h: 5.4 });
  info.decals.push({ kind: 'sign', text: opts.name || 'GA BẮC', w: 3.2, h: 0.6, m: k.m.clone().multiply(new THREE.Matrix4().makeTranslation(0.3, 4.75, -cl / 2 - 0.3).multiply(new THREE.Matrix4().makeRotationY(Math.PI))) });
}

export function jersey(k) {
  const s = new THREE.Shape(); s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.08); s.lineTo(0.13, 0.33); s.lineTo(0.1, 0.8); s.lineTo(-0.1, 0.8); s.lineTo(-0.13, 0.33); s.lineTo(-0.3, 0.08);
  const g = extrude(s, 3.0, 0.02, 1); k.add(g, 'concrete');
  k.collide(0.62, 0.8, 3.0, 0, 0.4, 0);
}
export function pallet(k, n = 1, load) {
  for (let j = 0; j < n; j++) {
    const y = j * 0.15;
    for (let i = 0; i < 5; i++) k.box(1.2, 0.022, 0.12, 'woodLight', 0, y + 0.135, -0.4 + i * 0.2, 0.004);
    for (const z of [-0.45, 0, 0.45]) k.box(1.2, 0.1, 0.1, 'woodLight', 0, y + 0.07, z, 0.006);
  }
  if (load === 'sacks') for (let i = 0; i < 6; i++) k.box(0.55, 0.22, 0.4, 'tarp', ((i % 2) - 0.5) * 0.58, n * 0.15 + 0.11 + Math.floor(i / 2) * 0.22, 0, 0.08);
  k.collide(1.2, n * 0.15 + (load ? 0.7 : 0), 1.0, 0, (n * 0.15 + (load ? 0.7 : 0)) / 2, 0);
}
export function barrel(k, paint) {
  const p = [[0, 0], [0.27, 0], [0.29, 0.03], [0.29, 0.3], [0.3, 0.32], [0.29, 0.34], [0.29, 0.56], [0.3, 0.58], [0.29, 0.6], [0.29, 0.86], [0.27, 0.89], [0, 0.89]];
  k.add(lathe(p, 22), paint || 'paintBlue');
  k.collide(0.6, 0.9, 0.6, 0, 0.45, 0);
}
export function cableDrum(k) {
  k.cyl(0.9, 0.08, 'woodLight', 0, 0.9, -0.5, 24, 'z'); k.cyl(0.9, 0.08, 'woodLight', 0, 0.9, 0.5, 24, 'z');
  k.cyl(0.62, 0.92, 'rubber', 0, 0.9, 0, 24, 'z');
  k.collide(1.8, 1.8, 1.1, 0, 0.9, 0);
}
export function sleeperStack(k, n) {
  for (let j = 0; j < n; j++) for (let i = 0; i < 6; i++) {
    if (j % 2 === 0) k.box(2.6, 0.16, 0.26, 'wood', 0, 0.08 + j * 0.16, -0.75 + i * 0.3, 0.02);
    else k.box(0.26, 0.16, 2.6, 'wood', -0.75 + i * 0.3, 0.08 + j * 0.16, 0, 0.02);
  }
  k.collide(2.6, n * 0.16, 2.6, 0, n * 0.08, 0);
}
export function cabin(k, paint) {
  k.box(2.5, 2.6, 6, paint || 'boxGrey', 0, 1.45, 0, 0.06);
  k.box(2.7, 0.15, 6.2, 'darkSteel', 0, 2.82, 0, 0.03);
  for (const z of [-1.6, 1.4]) k.box(0.05, 0.8, 1.0, 'glassLit', 1.26, 1.8, z, 0.01);
  k.box(0.05, 2.0, 0.9, 'doorSteel', 1.26, 1.15, -0.1, 0.01);
  for (const z of [-2.7, 2.7]) for (const x of [-1, 1]) k.box(0.3, 0.15, 0.3, 'concrete', x, 0.08, z, 0.02);
  k.collide(2.6, 2.9, 6.1, 0, 1.45, 0);
}
export function fence(k, len) {
  const n = Math.ceil(len / 2.5);
  for (let i = 0; i <= n; i++) {
    const z = -len / 2 + i * (len / n);
    k.cyl(0.035, 2.4, 'galv', 0, 1.2, z, 8);
    k.tube(V(0, 2.4, z), V(0.25, 2.65, z), 0.02, 'galv', 4);
  }
  k.tube(V(0, 2.35, -len / 2), V(0, 2.35, len / 2), 0.02, 'galv', 5);
  k.tube(V(0, 0.1, -len / 2), V(0, 0.1, len / 2), 0.015, 'galv', 5);
  const pl = new THREE.PlaneGeometry(len, 2.2); const uv = pl.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.1, uv.getY(i) * 2.2 / 0.1);
  pl.rotateY(Math.PI / 2); pl.translate(0, 1.2, 0); k.addLoose(pl, 'mesh');
  for (let i = 0; i < 3; i++) k.tube(V(0.08 + i * 0.07, 2.45 + i * 0.07, -len / 2), V(0.08 + i * 0.07, 2.45 + i * 0.07, len / 2), 0.006, 'galv', 3);
  k.collide(0.2, 2.6, len, 0, 1.3, 0);
}
