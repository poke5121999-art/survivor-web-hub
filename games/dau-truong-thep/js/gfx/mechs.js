// Mech models built from primitives, one design per MECHS key, each in its own palette with ornaments from styles.js.
// A mech is a root group holding a ground ring, a shield bubble and a body (scaled up from the sim radius) with a hull
// (turns toward movement), a turret (turns toward aim), legs and animated parts (wheels, drums, rotors, recoiling barrels).
// Models face +x, +z is the mech's right. Sim angle a maps to rotation.y = -a.

import * as THREE from '../../vendor/three.module.min.js';
import { Builder } from './builder.js';
import { TEAMS, MECHS, PAINTS, BOSSES, GLOWS, DECALS } from '../data.js';
import { visibleTo, hidden } from '../sim.js';
import { designsB } from './mechs-b.js';
import { frameDesign } from './frames.js';
import { ORNATE, ornateModel } from './ornate.js';
import { STEEL_DESIGNS } from './steel-tanks.js';
import { slashTrail, slashPose, slashStart, slashHit } from './slash.js';
import { styleFor, adorn, formOf, formPaint, FORM_SCALE } from './styles.js';

const DARK = 0x2a2f37, GUN = 0x434b56, STEEL = 0xa3adba, PALE = 0xdfe6ee, HAZ = 0xe8b021, BLACK = 0x15181c, RUB = 0x1d1f23, ICE = 0xbfe6ff, LINE = 0x0e1114;
const X = -Math.PI / 2, TAU = Math.PI * 2;
// Roughness and metalness multipliers on the baked metal set (rough 0.4..0.8, metal 0.25..0.6).
const SURF = { paint: [0.75, 1.4], dark: [0.9, 1.2], steel: [0.5, 1.8], rubber: [1.6, 0], glass: [0.2, 0.5], ice: [0.3, 0.1] };

function sk(b, kind, color) { b.surface(SURF[kind][0], SURF[kind][1]); if (color !== undefined) b.tint(color); return b; }
// Team-colour lights share the mesh they sit on (surf.x < 0 marks them emissive). Flames get their own additive batch.
function lit(b, f) { const s = b.surf; b.surface(-1, 0); f(); b.surf = s; return b; }
function flame(b, f) { const m = b.mat; b.use('flame'); f(); b.use(m); return b; }
// The same additive flame material, but riding the turret instead of the hull.
function tflame(b, f) { const m = b.mat; b.use('tflame'); f(); b.use(m); return b; }
// Polygon in the XY plane (points as [x, y]) extruded along z from z0 to z1.
function side(b, pts, z0, z1, bevel = 0) { return b.push().rotX(Math.PI / 2).prism(pts.map((p) => [p[0], -p[1]]), z0, z1, bevel).pop(); }
// Chamfered bar between two points of the XY plane, at the current z.
function limb(b, a, c, w, d, ch = 0.03) {
  const dx = c[0] - a[0], dy = c[1] - a[1];
  return b.push().move((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0).rotZ(Math.atan2(dy, dx)).chamfer(Math.hypot(dx, dy) + w * 0.4, w, d, ch).pop();
}
// Slatted grille lying on a top face, centred at the current origin.
function vent(b, w, d, n) {
  sk(b, 'dark', BLACK).box(w, 0.03, d); sk(b, 'dark', GUN);
  for (let i = 0; i < n; i++) b.push().move(-w / 2 + (i + 0.5) * w / n, 0.025, 0).rotZ(0.55).box(w / n * 0.75, 0.02, d * 0.88).pop();
  return b;
}
function bolts(b, pts, r = 0.026) { sk(b, 'steel', STEEL); for (const p of pts) b.push().move(p[0], p[1], p[2]).cyl(r, r, 0.03, 6).pop(); return b; }
function hazard(b, len, h, d, n) {
  for (let i = 0; i < n; i++) sk(b, 'paint', i % 2 ? BLACK : HAZ).push().move(-len / 2 + (i + 0.5) * len / n, 0, 0).rotY(0.35).box(len / n * 0.94, h, d).pop();
  return b;
}
function line(b, x, y, z, w, d) { return sk(b, 'dark', LINE).push().move(x, y, z).box(w, 0.012, d).pop(); }

// Each design fills batches: hull, turret, flame (flickering thrusters),
// leg0..legN (built with the hip at the origin, foot toward +x for sweeping legs, hanging down for swinging legs),
// and named parts. paint = team colour, deep = its shadow tone, trim = the mech's own accent.
// Returned info: muzzle / muzzleY (barrel tip in model units), S (visual scale), legs [{p, yaw, ph, kind, amp, lift}],
// stride (metres per gait cycle), parts [{name, on, kind, p | at, axis, rate, by, dir, amt}].
const DESIGNS = {
  trau(b, paint, trim, deep) {
    for (const sz of [-1, 1]) {
      const zi = sz * 0.58, zo = sz * 1.06;
      sk(b, 'rubber', RUB); side(b, [[-1.34, 0.3], [-1.12, 0.04], [1.14, 0.04], [1.4, 0.34], [1.24, 0.62], [-1.24, 0.62]], Math.min(zi, zo), Math.max(zi, zo), 0.03);
      for (let i = 0; i < 5; i++) {
        const x = -0.9 + i * 0.45;
        sk(b, 'steel', STEEL).push().move(x, 0.3, sz * 1.075).rotX(X).cyl(0.19, 0.19, 0.04, 10).pop();
        sk(b, 'dark', GUN).push().move(x, 0.3, sz * 1.1).rotX(X).cyl(0.07, 0.09, 0.04, 6).pop();
      }
      sk(b, 'dark', GUN).push().move(1.2, 0.36, sz * 1.08).rotX(X).cyl(0.2, 0.2, 0.06, 8).pop();
      for (const fx of [-1, 1]) {
        sk(b, 'paint', paint).push().move(fx * 1.0, 0.68, sz * 0.82).rotZ(fx * -0.14).chamfer(0.66, 0.08, 0.58, 0.025).pop();
        b.push().move(fx * 1.0, 0.73, sz * 1.08).rotZ(fx * -0.14).box(0.6, 0.012, 0.03).pop();
      }
      sk(b, 'paint', deep).push().move(0, 0.5, sz * 1.115).chamfer(1.25, 0.2, 0.05, 0.02).pop();
      lit(b, () => b.push().move(-0.1, 0.9, sz * 0.578).box(1.9, 0.03, 0.02).pop());
      bolts(b, [-0.5, 0, 0.5].map((x) => [x, 0.5, sz * 1.14]), 0.022);
      b.use('tread'); sk(b, 'dark', GUN);
      for (let x = -0.8; x <= 0.81; x += 0.2) b.push().move(x, 0.625, sz * 0.82).box(0.08, 0.04, 0.46).pop();
      b.use('hull');
    }
    sk(b, 'dark', DARK).prism([[1.3, 0.56], [1.46, 0.28], [1.46, -0.28], [1.3, -0.56], [-1.22, -0.6], [-1.36, -0.42], [-1.36, 0.42], [-1.22, 0.6]], 0.28, 0.8, 0.06);
    sk(b, 'paint', paint).prism([[0.98, 0.54], [1.1, 0.3], [1.1, -0.3], [0.98, -0.54], [-1.18, -0.57], [-1.3, -0.38], [-1.3, 0.38], [-1.18, 0.57]], 0.8, 0.98, 0.05);
    b.push().move(1.26, 0.84, 0).rotZ(-0.62).chamfer(0.44, 0.1, 1.04, 0.03).pop();
    for (const x of [-0.55, 0.3]) line(b, x, 0.985, 0, 0.025, 1.0);
    line(b, -0.15, 0.985, 0.4, 0.8, 0.025); line(b, -0.15, 0.985, -0.4, 0.8, 0.025);
    b.push().move(-0.86, 0.99, 0); vent(b, 0.5, 0.78, 6); b.pop();
    for (const sz of [-1, 1]) {
      b.push().move(-1.2, 0.92, sz * 0.42).rotZ(0.9);
      sk(b, 'steel', STEEL).lathe([[0.08, 0], [0.09, 0.28], [0.12, 0.3], [0.12, 0.42], [0.1, 0.42], [0.1, 0.38]], 8);
      flame(b, () => b.push().move(0, 0.52, 0).cyl(0.015, 0.09, 0.24, 6).pop());
      b.pop();
      lit(b, () => b.push().move(1.44, 0.68, sz * 0.4).box(0.05, 0.08, 0.18).pop());
      b.push().move(1.6, 0.42, sz * 0.43).rotY(sz * 0.4);
      sk(b, 'paint', trim).chamfer(0.12, 0.56, 0.98, 0.03);
      b.push().move(0.0, 0.3, 0); hazard(b, 0.9, 0.05, 0.13, 7); b.pop();
      sk(b, 'steel', STEEL);
      for (let k = 0; k < 4; k++) b.push().move(0.08, -0.25, (k - 1.5) * 0.24).rotZ(X).cyl(0, 0.05, 0.16, 4).pop();
      b.pop();
      sk(b, 'steel', STEEL).rod([1.18, 0.6, sz * 0.3], [1.55, 0.5, sz * 0.36], 0.035, 6);
      sk(b, 'dark', GUN).rod([1.18, 0.6, sz * 0.3], [1.36, 0.55, sz * 0.33], 0.055, 6);
      sk(b, 'dark', GUN).push().move(-0.2, 1.06, sz * 0.62).chamfer(0.7, 0.16, 0.12, 0.03).pop();
    }
    b.use('turret');
    sk(b, 'dark', GUN).push().move(-0.1, 1.0, 0).cyl(0.72, 0.78, 0.08, 16).pop();
    sk(b, 'paint', paint).prism([[0.62, 0.36], [0.82, 0.2], [0.82, -0.2], [0.62, -0.36], [-0.45, -0.66], [-0.82, -0.5], [-0.82, 0.5], [-0.45, 0.66]], 1.02, 1.46, 0.08);
    sk(b, 'paint', trim);
    for (const sz of [-1, 1]) b.push().move(-0.12, 1.462, sz * 0.2).box(1.1, 0.02, 0.07).pop();
    for (const sz of [-1, 1]) {
      sk(b, 'paint', deep).push().move(0.02, 1.22, sz * 0.68).rotY(sz * 0.2).chamfer(0.92, 0.38, 0.1, 0.03).pop();
      sk(b, 'paint', paint).push().move(0.66, 1.34, sz * 0.4).rotY(sz * 0.5).prism([[0.3, 0], [-0.05, 0.1], [-0.12, -0.08]], -0.08, 0.1, 0.02).pop();
      bolts(b, [[-0.25, 1.36, sz * 0.75], [0.12, 1.36, sz * 0.72], [0.38, 1.36, sz * 0.67]], 0.02);
      for (let k = 0; k < 3; k++) sk(b, 'dark', GUN).push().move(0.36 - k * 0.12, 1.47, sz * (0.48 + k * 0.03)).rotZ(-0.6).cyl(0.045, 0.05, 0.22, 6).pop();
      lit(b, () => b.push().move(0.02, 1.42, sz * 0.73).rotY(sz * 0.2).box(0.8, 0.035, 0.035).pop());
      sk(b, 'dark', GUN).rod([-0.72, 1.46, sz * 0.42], [-0.78, 2.25, sz * 0.46], 0.012, 4);
      lit(b, () => b.push().move(-0.78, 2.26, sz * 0.46).ball(0.035, 0).pop());
    }
    sk(b, 'dark', GUN).push().move(-0.3, 1.46, 0.28).lathe([[0.24, 0], [0.24, 0.1], [0.2, 0.15], [0.05, 0.17], [0, 0.17]], 10).pop();
    lit(b, () => b.push().move(-0.3, 1.53, 0.28).cyl(0.245, 0.245, 0.03, 10).pop());
    sk(b, 'dark', GUN).push().move(-0.3, 1.475, -0.3).cyl(0.17, 0.18, 0.04, 8).pop();
    sk(b, 'steel', STEEL).push().move(-0.3, 1.51, -0.3).box(0.2, 0.025, 0.03).pop();
    sk(b, 'dark', DARK).push().move(-0.98, 1.2, 0).chamfer(0.3, 0.32, 1.0, 0.03).pop();
    sk(b, 'paint', deep).push().move(-1.0, 1.38, 0.24).chamfer(0.26, 0.1, 0.36, 0.02).pop().push().move(-1.0, 1.38, -0.24).chamfer(0.26, 0.1, 0.36, 0.02).pop();
    lit(b, () => b.push().move(-1.135, 1.2, 0).box(0.02, 0.06, 0.7).pop());
    sk(b, 'dark', DARK).push().move(0.86, 1.22, 0).chamfer(0.28, 0.4, 0.52, 0.06).pop();
    lit(b, () => b.push().move(0.9, 1.44, 0.18).box(0.12, 0.04, 0.1).pop());
    b.use('barrel');
    sk(b, 'steel', STEEL).push().move(0.96, 1.22, 0).rotZ(X).lathe([[0.15, 0], [0.15, 0.24], [0.125, 0.3], [0.125, 0.5], [0.17, 0.55], [0.17, 0.8], [0.125, 0.86], [0.11, 1.08], [0.13, 1.1]], 12).pop();
    sk(b, 'dark', DARK).push().move(2.16, 1.22, 0).chamfer(0.22, 0.2, 0.32, 0.03).pop();
    for (const sz of [-1, 1]) sk(b, 'dark', LINE).push().move(2.16, 1.22, sz * 0.165).box(0.04, 0.12, 0.012).pop();
    lit(b, () => b.push().move(2.275, 1.22, 0).rotZ(X).cyl(0.08, 0.08, 0.02, 10).pop());
    return { muzzle: 2.28, muzzleY: 1.22, S: 1, height: 2.0,
      parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.32 }, { name: 'tread', on: 'hull', kind: 'tread', step: 0.2 }] };
  },

  soi(b, paint, trim, deep) {
    const legs = [];
    for (let i = 0; i < 2; i++) {
      const sz = i ? 1 : -1;
      b.use('leg' + i);
      sk(b, 'dark', GUN).push().rotX(X).cyl(0.17, 0.17, 0.2, 10).pop();
      b.push().move(0, 0, sz * 0.02); sk(b, 'dark', DARK); limb(b, [0, 0], [0.34, -0.42], 0.2, 0.2); b.pop();
      b.push().move(0, 0, sz * 0.1); sk(b, 'paint', paint); limb(b, [0.0, 0.04], [0.3, -0.34], 0.26, 0.08); b.pop();
      sk(b, 'steel', STEEL).push().move(0.34, -0.42, 0).rotX(X).cyl(0.11, 0.11, 0.26, 8).pop();
      sk(b, 'dark', DARK); limb(b, [0.34, -0.42], [-0.12, -0.8], 0.15, 0.16);
      b.push().move(0, 0, sz * 0.1); sk(b, 'paint', deep); limb(b, [0.3, -0.46], [-0.04, -0.74], 0.2, 0.05); b.pop();
      lit(b, () => b.push().move(0.13, -0.6, sz * 0.13).rotZ(0.7).box(0.24, 0.025, 0.01).pop());
      sk(b, 'steel', STEEL).rod([0.12, -0.12, -sz * 0.1], [0.06, -0.62, -sz * 0.1], 0.03, 6);
      sk(b, 'dark', GUN).rod([0.12, -0.12, -sz * 0.1], [0.09, -0.36, -sz * 0.1], 0.05, 6);
      sk(b, 'steel', STEEL).push().move(-0.12, -0.8, 0).rotX(X).cyl(0.08, 0.08, 0.2, 8).pop();
      sk(b, 'dark', DARK); limb(b, [-0.12, -0.8], [0.0, -0.98], 0.12, 0.14);
      sk(b, 'paint', trim);
      for (const a of [-0.45, 0, 0.45]) b.push().move(0.0, -1.0, 0).rotY(a).move(0.2, 0, 0).rotZ(-0.12).chamfer(0.42, 0.08, 0.12, 0.025).pop();
      sk(b, 'dark', GUN).push().move(-0.18, -1.0, 0).rotZ(0.3).chamfer(0.24, 0.07, 0.1, 0.02).pop();
      legs.push({ p: [0, 1.06, sz * 0.46], yaw: 0, ph: i * Math.PI, kind: 'swing', amp: 0.34, lift: 0.1 });
    }
    b.use('hull');
    sk(b, 'dark', DARK).push().move(0, 1.08, 0).chamfer(0.55, 0.3, 0.66, 0.06).pop();
    for (const sz of [-1, 1]) {
      b.push().move(-0.32, 1.1, sz * 0.2).rotZ(-1.0);
      sk(b, 'steel', STEEL).lathe([[0.08, 0], [0.1, 0.12], [0.07, 0.24]], 8);
      flame(b, () => b.push().move(0, 0.34, 0).cyl(0.06, 0.012, 0.22, 6).pop());
      b.pop();
    }
    b.use('turret');
    sk(b, 'dark', GUN).push().move(0, 1.24, 0).cyl(0.3, 0.32, 0.1, 12).pop();
    sk(b, 'paint', paint).prism([[0.62, 0], [0.42, 0.3], [-0.1, 0.4], [-0.52, 0.32], [-0.6, 0], [-0.52, -0.32], [-0.1, -0.4], [0.42, -0.3]], 1.28, 1.72, 0.07);
    sk(b, 'glass', BLACK).prism([[0.56, 0], [0.38, 0.17], [0.08, 0.21], [0.08, -0.21], [0.38, -0.17]], 1.72, 1.8, 0.03);
    sk(b, 'paint', deep); side(b, [[-0.6, 1.74], [0.05, 1.78], [-0.2, 1.84], [-0.55, 1.98]], -0.03, 0.03, 0.01);
    lit(b, () => b.push().move(-0.32, 1.865, 0).rotZ(0.33).box(0.42, 0.02, 0.07).pop());
    line(b, -0.15, 1.725, 0, 0.02, 0.62); line(b, -0.38, 1.725, 0.22, 0.25, 0.02); line(b, -0.38, 1.725, -0.22, 0.25, 0.02);
    b.push().move(-0.42, 1.73, 0); vent(b, 0.18, 0.3, 3); b.pop();
    for (const sz of [-1, 1]) {
      lit(b, () => b.push().move(0.47, 1.6, sz * 0.13).rotY(sz * 0.62).box(0.2, 0.05, 0.03).pop());
      sk(b, 'dark', DARK).push().move(0.0, 1.55, sz * 0.43).chamfer(0.24, 0.18, 0.2, 0.03).pop();
      sk(b, 'paint', paint).push().move(0.04, 1.6, sz * 0.66).chamfer(0.74, 0.4, 0.34, 0.05).pop();
      sk(b, 'paint', deep).push().move(-0.02, 1.81, sz * 0.66).chamfer(0.6, 0.04, 0.3, 0.015).pop();
      sk(b, 'paint', trim).push().move(-0.02, 1.835, sz * 0.66).box(0.5, 0.012, 0.06).pop();
      sk(b, 'paint', trim).push().move(0.0, 1.6, sz * 0.835).box(0.5, 0.08, 0.02).pop();
      for (const dy of [-0.09, 0.09]) for (const dz of [-0.08, 0.08]) {
        sk(b, 'dark', BLACK).push().move(0.41, 1.6 + dy, sz * 0.66 + dz).rotZ(X).cyl(0.06, 0.06, 0.04, 8).pop();
        lit(b, () => b.push().move(0.43, 1.6 + dy, sz * 0.66 + dz).rotZ(X).cyl(0.035, 0.035, 0.01, 6).pop());
      }
      sk(b, 'dark', DARK).push().move(0.42, 1.2, sz * 0.32).chamfer(0.42, 0.22, 0.2, 0.04).pop();
      sk(b, 'dark', GUN).tube([[0.25, 1.15, sz * 0.32], [0.0, 1.1, sz * 0.4], [-0.35, 1.3, sz * 0.36], [-0.5, 1.45, sz * 0.2]], 0.035, 5, 6);
    }
    sk(b, 'dark', GUN).rod([-0.45, 1.7, 0.12], [-0.55, 2.3, 0.14], 0.012, 4);
    lit(b, () => b.push().move(-0.55, 2.31, 0.14).ball(0.03, 0).pop());
    b.use('drum');
    sk(b, 'steel', STEEL);
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6; b.rod([0, Math.cos(a) * 0.065, Math.sin(a) * 0.065], [0.62, Math.cos(a) * 0.065, Math.sin(a) * 0.065], 0.024, 5); }
    sk(b, 'dark', GUN).push().move(0.12, 0, 0).rotZ(X).cyl(0.11, 0.11, 0.06, 8).pop().push().move(0.48, 0, 0).rotZ(X).cyl(0.1, 0.1, 0.05, 8).pop();
    return { muzzle: 1.34, muzzleY: 1.2, S: 1, height: 2.1, legs, stride: 2.08,
      parts: [{ name: 'drum', on: 'turret', kind: 'spin', axis: 'x', by: 'fire', at: [[0.72, 1.2, 0.336], [0.72, 1.2, -0.336]] }] };
  },

  ung(b, paint, trim, deep) {
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, sz = Math.sin(a) > 0 ? 1 : -1;
      b.use('leg' + i);
      sk(b, 'dark', GUN).push().rotX(X).cyl(0.1, 0.1, 0.18, 8).pop();
      sk(b, 'dark', DARK); limb(b, [0, 0], [0.55, 0.42], 0.12, 0.14);
      b.push().move(0, 0.06, 0); sk(b, 'paint', paint); limb(b, [0.06, 0.06], [0.5, 0.4], 0.16, 0.2, 0.05); b.pop();
      sk(b, 'paint', trim).push().move(0.3, 0.33, 0).rotZ(0.65).box(0.2, 0.012, 0.21).pop();
      sk(b, 'steel', STEEL).push().move(0.57, 0.44, 0).ball(0.09, 1).pop();
      sk(b, 'dark', GUN).push().move(0.6, 0.55, 0).cyl(0, 0.05, 0.2, 5).pop();
      sk(b, 'steel', STEEL).rod([0.57, 0.44, 0], [1.12, -1.06, 0], 0.035, 6, 0.06);
      sk(b, 'dark', DARK).rod([0.62, 0.3, 0], [0.82, -0.25, 0], 0.07, 6);
      sk(b, 'steel', STEEL).rod([0.12, 0.18, 0.06], [0.5, 0.3, 0.06], 0.022, 5);
      sk(b, 'dark', GUN).push().move(1.15, -1.06, 0).rotZ(0.35).cyl(0, 0.06, 0.18, 5).pop();
      lit(b, () => b.push().move(0.85, -0.35, 0).ball(0.035, 0).pop());
      const c = Math.cos(a), s = Math.sin(a);
      legs.push({ p: [c * 0.3, 1.1, s * 0.3], yaw: -a, ph: (i % 2) * Math.PI, kind: 'sweep', amp: 0.26 * sz, lift: 0.22 });
    }
    b.use('hull');
    sk(b, 'dark', DARK).lathe([[0, 0.82], [0.3, 0.86], [0.38, 0.98], [0.38, 1.14], [0.28, 1.22], [0, 1.22]], 10);
    sk(b, 'paint', paint).push().move(-0.62, 1.05, 0).scale(1.4, 1, 0.95).ball(0.38, 1, 0.62).pop();
    for (const [x, w] of [[-0.35, 0.5], [-0.6, 0.6], [-0.86, 0.48]]) sk(b, 'paint', deep).push().move(x, 1.22, 0).rotZ(0.25).chamfer(0.18, 0.08, w, 0.03).pop();
    lit(b, () => { for (const x of [-0.47, -0.73]) b.push().move(x, 1.2, 0).box(0.04, 0.03, 0.46).pop(); });
    sk(b, 'dark', GUN).push().move(-1.08, 1.0, 0).rotZ(X).cyl(0.1, 0.16, 0.14, 8).pop();
    lit(b, () => b.push().move(-1.16, 1.0, 0).rotZ(X).cyl(0.07, 0.07, 0.02, 8).pop());
    b.use('turret');
    sk(b, 'dark', GUN).push().move(0, 1.2, 0).cyl(0.26, 0.3, 0.1, 10).pop();
    sk(b, 'dark', DARK).push().move(0.0, 1.31, 0).chamfer(0.62, 0.26, 0.34, 0.05).pop();
    for (const sz of [-1, 1]) {
      sk(b, 'paint', paint).push().move(-0.05, 1.3, sz * 0.26).rotZ(X).lathe([[0, -0.36], [0.09, -0.33], [0.1, 0.3], [0, 0.36]], 8).pop();
      lit(b, () => b.push().move(-0.05, 1.36, sz * 0.27).box(0.5, 0.03, 0.05).pop());
      sk(b, 'dark', GUN).tube([[-0.3, 1.32, sz * 0.24], [-0.45, 1.25, sz * 0.18], [-0.52, 1.3, sz * 0.05]], 0.025, 5, 5);
    }
    sk(b, 'paint', paint).push().move(-0.5, 1.33, 0).chamfer(0.42, 0.28, 0.42, 0.05).pop();
    b.push().move(-0.5, 1.475, 0); vent(b, 0.3, 0.3, 4); b.pop();
    lit(b, () => b.push().move(-0.715, 1.33, 0).box(0.02, 0.05, 0.3).pop());
    sk(b, 'dark', GUN).rod([-0.62, 1.46, -0.14], [-0.7, 2.1, -0.16], 0.01, 4);
    lit(b, () => b.push().move(-0.7, 2.11, -0.16).ball(0.028, 0).pop());
    sk(b, 'dark', DARK).push().move(0.2, 1.48, 0).box(0.08, 0.1, 0.06).pop();
    sk(b, 'dark', GUN).push().move(0.22, 1.56, 0).rotZ(X).lathe([[0.06, -0.26], [0.065, 0.18], [0.08, 0.22], [0.08, 0.3]], 8).pop();
    lit(b, () => b.push().move(0.53, 1.56, 0).rotZ(X).cyl(0.06, 0.06, 0.01, 8).pop());
    b.use('barrel');
    for (const sz of [-1, 1]) sk(b, 'steel', STEEL).push().move(1.25, 1.3, sz * 0.075).chamfer(2.1, 0.12, 0.06, 0.02).pop();
    sk(b, 'dark', DARK).push().move(1.25, 1.235, 0).box(2.0, 0.03, 0.1).pop();
    for (const x of [0.55, 0.95, 1.35, 1.75]) {
      sk(b, 'paint', trim).push().move(x, 1.3, 0).rotZ(X).lathe([[0.13, -0.05], [0.17, -0.03], [0.17, 0.0], [0.13, 0.02]], 10).pop();
      lit(b, () => b.push().move(x + 0.035, 1.3, 0).rotZ(X).cyl(0.15, 0.17, 0.03, 10).pop());
    }
    for (const sz of [-1, 1]) sk(b, 'steel', STEEL).push().move(2.36, 1.3, sz * 0.085).rotY(sz * 0.18).chamfer(0.18, 0.1, 0.04, 0.015).pop();
    lit(b, () => b.push().move(1.25, 1.31, 0).box(2.04, 0.05, 0.06).pop().push().move(2.32, 1.3, 0).ball(0.06, 0).pop());
    return { muzzle: 2.36, muzzleY: 1.3, S: 1, height: 2.0, legs, stride: 1.76,
      parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.4 }] };
  },

  hac(b, paint, trim, deep) {
    sk(b, 'dark', DARK).lathe([[0, 0.55], [0.5, 0.6], [0.88, 0.74], [1.0, 0.84]], 18);
    sk(b, 'paint', paint).lathe([[1.0, 0.84], [1.0, 0.9], [0.84, 1.0], [0.5, 1.07], [0, 1.09]], 18);
    lit(b, () => {
      b.push().move(0, 0.87, 0).geo(new THREE.TorusGeometry(1.005, 0.025, 4, 36).rotateX(Math.PI / 2)).pop();
      b.push().move(0, 0.56, 0).cyl(0.26, 0.3, 0.03, 12).pop();
    });
    sk(b, 'paint', deep).lathe([[0.82, 1.0], [0.78, 1.05], [0.6, 1.08], [0.58, 1.04]], 18);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.26; b.push().rotY(a); line(b, 0.72, 1.03, 0, 0.36, 0.02); b.pop(); }
    lit(b, () => { for (let i = 0; i < 3; i++) b.push().rotY(i * TAU / 3).move(0.7, 1.075, 0).rotZ(-0.2).box(0.24, 0.02, 0.035).pop(); });
    for (let i = 0; i < 3; i++) {
      const a = Math.PI + (i - 1) * TAU / 3;
      b.push().rotY(a);
      sk(b, 'paint', paint).push().move(0.98, 0.8, 0).scale(1.5, 1, 1).ball(0.17, 1, 0.75).pop();
      sk(b, 'paint', trim).push().move(1.2, 0.8, 0).rotZ(X).cyl(0.06, 0.1, 0.08, 8).pop();
      sk(b, 'dark', GUN).push().move(0.98, 0.66, 0).cyl(0.1, 0.13, 0.12, 8).pop();
      flame(b, () => b.push().move(0.98, 0.45, 0).cyl(0.1, 0.01, 0.32, 6).pop());
      lit(b, () => b.push().move(1.22, 0.8, 0).box(0.03, 0.05, 0.14).pop());
      b.push().move(0.6, 1.035, 0); vent(b, 0.2, 0.26, 3); b.pop();
      b.pop();
    }
    b.use('halo');
    sk(b, 'steel', STEEL).geo(new THREE.TorusGeometry(1.16, 0.03, 4, 40).rotateX(Math.PI / 2));
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      b.push().rotY(a);
      sk(b, 'paint', paint).push().move(1.16, 0, 0).chamfer(0.1, 0.08, 0.22, 0.02).pop();
      lit(b, () => b.push().move(1.22, 0, 0).box(0.02, 0.05, 0.14).pop());
      b.pop();
    }
    b.use('turret');
    sk(b, 'glass', trim).lathe([[0.44, 1.08], [0.43, 1.2], [0.35, 1.34], [0.2, 1.43], [0, 1.46]], 14);
    lit(b, () => b.push().move(0, 1.2, 0).cyl(0.438, 0.44, 0.03, 14).pop());
    sk(b, 'paint', paint).push().move(0.48, 1.18, 0).chamfer(0.5, 0.18, 0.3, 0.05).pop();
    sk(b, 'steel', STEEL).push().move(0.76, 1.18, 0).rotZ(X).cyl(0.07, 0.09, 0.28, 8).pop();
    lit(b, () => {
      for (const x of [0.8, 0.93]) b.push().move(x, 1.18, 0).geo(new THREE.TorusGeometry(x > 0.85 ? 0.1 : 0.13, 0.022, 4, 14).rotateY(Math.PI / 2)).pop();
      b.push().move(0.96, 1.18, 0).ball(0.045, 0).pop();
    });
    sk(b, 'dark', GUN).push().move(-0.12, 1.47, 0).cyl(0.05, 0.06, 0.08, 6).pop();
    sk(b, 'steel', STEEL).push().move(-0.12, 1.54, 0).lathe([[0.03, 0], [0.2, 0.06], [0.24, 0.09]], 10).pop();
    lit(b, () => b.push().move(-0.12, 1.6, 0).ball(0.05, 0).pop());
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; b.push().move(-0.12, 1.55, 0).rotY(a); sk(b, 'dark', GUN).rod([0.2, 0.08, 0], [0.04, 0.24, 0], 0.012, 4); b.pop(); }
    return { muzzle: 0.98, muzzleY: 1.18, S: 1, height: 1.8, hover: true,
      parts: [{ name: 'halo', on: 'hull', kind: 'spin', axis: 'y', by: 'time', rate: 0.9, p: [0, 0.96, 0] }] };
  },

  loi(b, paint, trim, deep) {
    sk(b, 'dark', DARK).prism([[1.25, 0.5], [1.36, 0.3], [1.36, -0.3], [1.25, -0.5], [-1.25, -0.55], [-1.32, -0.4], [-1.32, 0.4], [-1.25, 0.55]], 0.3, 0.72, 0.05);
    for (const sz of [-1, 1]) {
      sk(b, 'paint', paint).push().move(0, 0.75, sz * 0.8).chamfer(2.36, 0.07, 0.42, 0.025).pop();
      sk(b, 'paint', deep).push().move(0, 0.66, sz * 1.0).rotX(sz * -0.55).chamfer(2.3, 0.05, 0.18, 0.015).pop();
      for (const x of [-0.41, 0.41]) line(b, x, 0.788, sz * 0.8, 0.02, 0.4);
      lit(b, () => b.push().move(0, 0.75, sz * 1.012).box(2.1, 0.025, 0.02).pop());
      bolts(b, [-1.0, -0.6, 0.6, 1.0].map((x) => [x, 0.79, sz * 0.66]), 0.02);
      for (const x of [1.12, -1.12]) {
        b.push().move(x, 0.55, sz * 0.42).rotY(Math.atan2(-sz * 0.85, Math.sign(x) * 0.55));
        sk(b, 'dark', GUN).cyl(0.1, 0.1, 0.2, 8);
        sk(b, 'paint', trim); limb(b, [0, 0], [0.95, -0.38], 0.12, 0.16, 0.03);
        b.push().move(0.45, -0.08, 0).rotZ(-0.38); hazard(b, 0.6, 0.03, 0.17, 6); b.pop();
        sk(b, 'steel', STEEL).rod([0.05, 0.14, 0], [0.7, -0.2, 0], 0.03, 6);
        sk(b, 'dark', GUN).rod([1.0, -0.4, 0], [1.0, -0.5, 0], 0.05, 6).push().move(1.0, -0.52, 0).cyl(0.2, 0.26, 0.06, 8).pop();
        b.pop();
      }
    }
    sk(b, 'paint', paint); side(b, [[0.62, 0.72], [1.42, 0.72], [1.44, 0.9], [1.18, 1.16], [0.62, 1.18]], -0.5, 0.5, 0.05);
    sk(b, 'paint', deep).push().move(0.9, 1.19, 0).chamfer(0.5, 0.04, 0.8, 0.015).pop();
    lit(b, () => {
      b.push().move(1.32, 1.04, 0).rotZ(-0.78).box(0.03, 0.12, 0.84).pop();
      for (const sz of [-1, 1]) b.push().move(1.42, 0.8, sz * 0.38).box(0.04, 0.07, 0.12).pop();
      for (const z of [-0.3, 0.3]) b.push().move(1.08, 1.2, z).box(0.07, 0.04, 0.1).pop();
    });
    b.push().move(0.84, 1.21, 0); vent(b, 0.3, 0.5, 4); b.pop();
    sk(b, 'paint', deep).prism([[0.62, 0.55], [0.62, -0.55], [-1.25, -0.55], [-1.32, -0.4], [-1.32, 0.4], [-1.25, 0.55]], 0.72, 0.84, 0.03);
    for (const sz of [-1, 1]) sk(b, 'paint', paint).push().move(-0.38, 0.86, sz * 0.47).chamfer(1.7, 0.05, 0.14, 0.015).pop();
    line(b, 0.3, 0.845, 0, 0.02, 0.8); line(b, -1.0, 0.845, 0, 0.02, 0.8);
    for (const z of [-0.25, 0.25]) { sk(b, 'dark', GUN).push().move(-1.07, 0.92, z).chamfer(0.2, 0.14, 0.26, 0.02).pop(); sk(b, 'paint', HAZ).push().move(-1.07, 0.995, z).box(0.14, 0.012, 0.04).pop(); }
    sk(b, 'paint', HAZ).push().move(1.39, 0.5, 0).box(0.06, 0.12, 0.9).pop();
    for (const sz of [-1, 1]) {
      sk(b, 'dark', GUN).push().move(-0.95, 0.94, sz * 0.38).chamfer(0.4, 0.2, 0.22, 0.03).pop();
      sk(b, 'steel', STEEL).push().move(-1.15, 0.92, sz * 0.2).rotZ(1.1).lathe([[0.06, 0], [0.07, 0.3], [0.09, 0.32]], 8).pop();
      flame(b, () => b.push().move(-1.15, 0.92, sz * 0.2).rotZ(1.1).move(0, 0.42, 0).cyl(0.012, 0.08, 0.2, 6).pop());
    }
    b.use('wheel');
    sk(b, 'rubber', RUB).push().rotX(X).cyl(0.34, 0.34, 0.28, 14).pop();
    sk(b, 'rubber', BLACK);
    for (let k = 0; k < 10; k++) b.push().rotZ(k * TAU / 10).move(0.335, 0, 0).box(0.06, 0.11, 0.3).pop();
    sk(b, 'steel', STEEL).push().rotX(X).cyl(0.19, 0.19, 0.3, 10).pop();
    sk(b, 'dark', GUN);
    for (const sz of [-1, 1]) {
      b.push().move(0, 0, sz * 0.155).rotX(X).cyl(0.08, 0.1, 0.03, 6).pop();
      for (let k = 0; k < 5; k++) b.push().rotZ(k * TAU / 5).move(0.13, 0, sz * 0.155).rotX(X).cyl(0.022, 0.022, 0.025, 5).pop();
    }
    b.use('turret');
    sk(b, 'dark', GUN).push().move(-0.2, 0.84, 0).cyl(0.56, 0.6, 0.1, 14).pop();
    for (const sz of [-1, 1]) {
      sk(b, 'paint', paint); side(b, [[-0.66, 0.88], [0.26, 0.88], [0.14, 1.45], [-0.12, 1.66], [-0.5, 1.6]], sz > 0 ? 0.3 : -0.44, sz > 0 ? 0.44 : -0.3, 0.03);
      bolts(b, [[-0.1, 1.67, sz * 0.37], [-0.45, 1.61, sz * 0.37]], 0.02);
      sk(b, 'steel', STEEL).rod([-0.42, 1.0, sz * 0.24], [0.18, 1.6, sz * 0.24], 0.03, 6);
      sk(b, 'dark', GUN).rod([-0.42, 1.0, sz * 0.24], [-0.15, 1.27, sz * 0.24], 0.05, 6);
      for (let k = 0; k < 3; k++) {
        sk(b, 'paint', HAZ).push().move(-0.5 + k * 0.17, 0.98, sz * 0.52).lathe([[0.065, 0], [0.065, 0.2], [0.03, 0.28], [0, 0.29]], 8).pop();
        lit(b, () => b.push().move(-0.5 + k * 0.17, 1.1, sz * 0.52).cyl(0.067, 0.067, 0.03, 8).pop());
      }
    }
    sk(b, 'steel', STEEL).push().move(-0.2, 1.3, 0).rotX(X).cyl(0.1, 0.1, 0.92, 10).pop();
    sk(b, 'dark', GUN).push().move(-0.75, 1.0, 0).chamfer(0.3, 0.28, 0.5, 0.04).pop();
    sk(b, 'dark', GUN).rod([-0.75, 1.1, 0], [-0.78, 1.72, 0], 0.025, 5);
    b.use('barrel');
    b.push().move(-0.2, 1.3, 0).rotZ(X + 0.8);
    sk(b, 'dark', DARK).lathe([[0.2, -0.42], [0.25, -0.38], [0.25, 0.1], [0.21, 0.15], [0.21, 0.72], [0.26, 0.77], [0.26, 0.95], [0.22, 0.95], [0.2, 0.9]], 12);
    sk(b, 'paint', trim);
    for (const y of [-0.15, 0.4]) b.push().move(0, y, 0).cyl(0.235, 0.235, 0.06, 12).pop();
    sk(b, 'steel', STEEL).push().move(0, 0.86, 0).cyl(0.265, 0.265, 0.04, 12).pop();
    lit(b, () => b.push().move(0, 0.86, 0).cyl(0.19, 0.19, 0.02, 10).pop().push().move(0, 0.958, 0).geo(new THREE.TorusGeometry(0.24, 0.018, 4, 16).rotateX(Math.PI / 2)).pop());
    b.pop();
    b.use('radar');
    sk(b, 'dark', GUN).cyl(0.04, 0.05, 0.1, 6);
    sk(b, 'steel', STEEL).push().move(0, 0.12, 0).rotZ(X).lathe([[0.02, -0.04], [0.16, 0.0], [0.24, 0.06]], 10).pop();
    lit(b, () => b.push().move(0.06, 0.12, 0).ball(0.03, 0).pop());
    const dir = [Math.cos(0.8), Math.sin(0.8), 0];
    return { muzzle: -0.2 + dir[0] * 0.95, muzzleY: 1.3 + dir[1] * 0.95, S: 1, height: 2.3,
      parts: [{ name: 'wheel', on: 'hull', kind: 'roll', axis: 'z', r: 0.34, at: [-0.82, 0, 0.82].flatMap((x) => [[x, 0.34, 0.78], [x, 0.34, -0.78]]) },
        { name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.35, dir: [-dir[0], -dir[1], 0] },
        { name: 'radar', on: 'turret', kind: 'spin', axis: 'y', by: 'time', rate: 2.2, p: [-0.78, 1.74, 0] }] };
  },

  bocap(b, paint, trim, deep) {
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const sz = i % 2 ? 1 : -1, front = i < 2, hx = front ? 0.25 : -0.28;
      const a = sz * (Math.PI / 2 + (front ? -0.5 : 0.45));
      b.use('leg' + i);
      sk(b, 'dark', GUN).ball(0.09, 0);
      b.push().move(0, 0, 0); sk(b, 'paint', paint); limb(b, [0.02, 0.02], [0.46, 0.34], 0.16, 0.16, 0.04); b.pop();
      sk(b, 'paint', trim).push().move(0.5, 0.42, 0).rotZ(-0.6).cyl(0, 0.06, 0.2, 5).pop();
      sk(b, 'dark', DARK).rod([0.48, 0.34, 0], [0.92, -0.56, 0], 0.03, 6, 0.06);
      sk(b, 'steel', STEEL).push().move(0.48, 0.34, 0).ball(0.065, 0).pop();
      sk(b, 'steel', STEEL).push().move(0.95, -0.6, 0).rotZ(0.45).cyl(0, 0.04, 0.12, 4).pop();
      legs.push({ p: [hx, 0.56, sz * 0.36], yaw: -a, ph: (front === (sz > 0) ? 0 : Math.PI), kind: 'sweep', amp: 0.3 * sz, lift: 0.25 });
    }
    b.use('hull');
    b.push().scale(1.22, 1, 1.22);
    sk(b, 'dark', DARK).prism([[0.56, 0], [0.44, 0.3], [-0.2, 0.36], [-0.56, 0.24], [-0.66, 0], [-0.56, -0.24], [-0.2, -0.36], [0.44, -0.3]], 0.3, 0.46, 0.04);
    sk(b, 'paint', deep).prism([[0.66, 0], [0.5, 0.36], [-0.2, 0.44], [-0.62, 0.3], [-0.76, 0], [-0.62, -0.3], [-0.2, -0.44], [0.5, -0.36]], 0.44, 0.7, 0.07);
    for (const [x, w] of [[0.28, 0.66], [-0.08, 0.78], [-0.44, 0.62]]) {
      sk(b, 'paint', paint).push().move(x, 0.73, 0).rotZ(0.18).chamfer(0.34, 0.08, w, 0.035).pop();
      sk(b, 'paint', trim).push().move(x - 0.15, 0.71, 0).rotZ(0.18).box(0.04, 0.05, w * 0.92).pop();
      sk(b, 'paint', trim).push().move(x + 0.02, 0.8, 0).rotZ(-0.5).cyl(0, 0.04, 0.14, 4).pop();
    }
    lit(b, () => { for (const x of [0.11, -0.26]) for (const sz of [-1, 1]) b.push().move(x, 0.72, sz * 0.2).box(0.03, 0.03, 0.16).pop(); });
    lit(b, () => { for (const sz of [-1, 1]) b.push().move(0.0, 0.58, sz * 0.43).rotY(sz * 0.12).box(0.7, 0.03, 0.02).pop(); });
    b.pop();
    b.use('tail');
    const seg = [[-0.84, 0.66], [-1.04, 0.88], [-1.1, 1.14], [-1.0, 1.4], [-0.8, 1.6], [-0.5, 1.7], [-0.2, 1.66]];
    for (let k = 0; k < seg.length - 1; k++) {
      const s = 1 - k * 0.08;
      sk(b, 'paint', k % 2 ? deep : paint); limb(b, seg[k], seg[k + 1], 0.24 * s, 0.3 * s, 0.06);
      sk(b, 'dark', GUN).push().move(seg[k + 1][0], seg[k + 1][1], 0).rotX(X).cyl(0.08 * s, 0.08 * s, 0.22 * s, 8).pop();
      sk(b, 'paint', trim).push().move(seg[k][0] * 0.5 + seg[k + 1][0] * 0.5, seg[k][1] * 0.5 + seg[k + 1][1] * 0.5, 0).rotZ(Math.atan2(seg[k + 1][1] - seg[k][1], seg[k + 1][0] - seg[k][0]) + Math.PI / 2).move(0.12 * s, 0, 0).rotZ(X).cyl(0, 0.04, 0.14, 4).pop();
    }
    sk(b, 'paint', trim).push().move(-0.1, 1.6, 0).scale(1.4, 1, 1).ball(0.15, 1).pop();
    lit(b, () => {
      b.push().move(0.06, 1.48, 0).rotZ(-2.2).cyl(0, 0.07, 0.4, 6).pop();
      b.push().move(-0.1, 1.68, 0).scale(1.2, 1, 1).ball(0.08, 0).pop();
    });
    b.use('turret');
    sk(b, 'dark', DARK).push().move(0.52, 0.74, 0).chamfer(0.42, 0.24, 0.48, 0.06).pop();
    sk(b, 'paint', paint).push().move(0.5, 0.88, 0).chamfer(0.36, 0.06, 0.4, 0.025).pop();
    lit(b, () => { for (const [y, z] of [[0.8, 0.09], [0.8, -0.09], [0.72, 0.17], [0.72, -0.17]]) b.push().move(0.735, y, z).box(0.02, 0.05, 0.05).pop(); });
    for (const sz of [-1, 1]) {
      sk(b, 'dark', GUN).rod([0.55, 0.68, sz * 0.22], [0.98, 0.66, sz * 0.5], 0.05, 6);
      sk(b, 'steel', STEEL).push().move(0.98, 0.66, sz * 0.5).ball(0.08, 0).pop();
      sk(b, 'paint', paint).push().move(1.0, 0.0, sz * 0.48).scale(1.35, 1, 1.35).prism([[0, sz * 0.12], [0.36, sz * 0.18], [0.66, sz * 0.02], [0.58, -sz * 0.04], [0.3, sz * 0.02], [0, -sz * 0.1]], 0.58, 0.76, 0.03).pop();
      sk(b, 'paint', deep).push().move(1.0, 0.0, sz * 0.48).scale(1.35, 1, 1.35).prism([[0.05, -sz * 0.08], [0.32, -sz * 0.06], [0.5, -sz * 0.14], [0.36, -sz * 0.2], [0.05, -sz * 0.18]], 0.6, 0.72, 0.02).pop();
      lit(b, () => b.push().move(1.25, 0.77, sz * 0.66).rotY(-sz * 0.1).box(0.34, 0.012, 0.035).pop());
    }
    b.use('barrel');
    for (const sz of [-1, 1]) {
      sk(b, 'steel', STEEL).push().move(0.88, 0.98, sz * 0.07).rotZ(X).lathe([[0.07, -0.32], [0.07, 0.2], [0.085, 0.24], [0.085, 0.32]], 8).pop();
      lit(b, () => b.push().move(1.205, 0.98, sz * 0.07).rotZ(X).cyl(0.055, 0.055, 0.01, 8).pop());
    }
    sk(b, 'dark', GUN).push().move(0.62, 0.98, 0).chamfer(0.36, 0.16, 0.3, 0.04).pop();
    return { muzzle: 1.2, muzzleY: 0.98, S: 1, height: 1.7, legs, stride: 1.6,
      parts: [{ name: 'tail', on: 'hull', kind: 'sway', p: [-0.84, 0.66, 0], model: true, amp: 0.14 }, { name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.18 }] };
  },

  bang(b, paint, trim, deep) {
    sk(b, 'rubber', RUB).prism([[0.95, 0.36], [0.95, -0.36], [0.32, -0.74], [-0.9, -0.66], [-1.12, 0], [-0.9, 0.66], [0.32, 0.74]], 0.14, 0.46, 0.05);
    sk(b, 'paint', deep).prism([[0.9, 0.3], [0.9, -0.3], [0.3, -0.68], [-0.85, -0.6], [-1.05, 0], [-0.85, 0.6], [0.3, 0.68]], 0.44, 0.86, 0.07);
    sk(b, 'paint', paint).prism([[0.84, 0.26], [0.84, -0.26], [0.28, -0.6], [-0.8, -0.54], [-0.98, 0], [-0.8, 0.54], [0.28, 0.6]], 0.84, 0.94, 0.04);
    line(b, 0.3, 0.945, 0, 0.02, 1.0); line(b, -0.5, 0.945, 0, 0.02, 0.9);
    lit(b, () => { for (const sz of [-1, 1]) b.push().move(-0.25, 0.7, sz * 0.645).rotY(sz * 0.06).box(0.9, 0.04, 0.02).pop(); });
    for (const sz of [-1, 1]) {
      b.push().move(-0.62, 0.945, sz * 0.36); vent(b, 0.32, 0.22, 4); b.pop();
      b.push().move(0, 0, sz * 0.66); sk(b, 'paint', trim); limb(b, [0.7, 0.7], [1.2, 0.36], 0.14, 0.12, 0.03); b.pop();
      sk(b, 'steel', STEEL).rod([0.6, 0.84, sz * 0.55], [1.05, 0.5, sz * 0.72], 0.025, 6);
      sk(b, 'steel', STEEL).push().move(-1.02, 0.62, sz * 0.36).rotZ(1.2).lathe([[0.1, 0], [0.12, 0.12], [0.15, 0.2]], 8).pop();
      flame(b, () => b.push().move(-1.02, 0.62, sz * 0.36).rotZ(1.2).move(0, 0.32, 0).cyl(0.02, 0.13, 0.26, 6).pop());
      for (const [x, z, a, h] of [[-0.3, 0.52, 0.5, 0.5], [0.1, 0.6, 0.4, 0.36], [-0.65, 0.45, 0.6, 0.38]]) {
        b.push().move(x, 0.85, sz * z).rotX(sz * a).rotZ(0.25);
        sk(b, 'ice', ICE).push().move(0, h * 0.45, 0).geo(new THREE.OctahedronGeometry(0.09).scale(1, h * 5, 1)).pop();
        lit(b, () => b.push().move(0, h * 0.3, 0).geo(new THREE.OctahedronGeometry(0.05).scale(1, h * 5, 1)).pop());
        b.pop();
      }
    }
    sk(b, 'paint', HAZ).push().move(0.92, 0.6, 0).box(0.05, 0.12, 1.0).pop();
    b.use('drum');
    sk(b, 'dark', GUN).push().rotX(X).cyl(0.28, 0.28, 1.5, 14).pop();
    sk(b, 'paint', trim);
    for (const z of [-0.78, 0.78]) b.push().move(0, 0, z).rotX(X).cyl(0.22, 0.3, 0.08, 10).pop();
    sk(b, 'ice', ICE);
    for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) {
      const a = k * TAU / 7 + r * 0.45;
      b.push().move(0, 0, -0.6 + r * 0.3).rotZ(a).move(0.3, 0, 0).rotZ(X).cyl(0, 0.055, 0.14, 4).pop();
    }
    lit(b, () => { for (const z of [-0.45, 0, 0.45]) b.push().move(0, 0, z).rotX(X).cyl(0.285, 0.285, 0.03, 14).pop(); });
    b.use('turret');
    sk(b, 'dark', GUN).push().move(0, 0.96, 0).cyl(0.5, 0.54, 0.08, 12).pop();
    sk(b, 'paint', paint).prism([[0.55, 0.25], [0.7, 0], [0.55, -0.25], [-0.3, -0.46], [-0.55, -0.3], [-0.55, 0.3], [-0.3, 0.46]], 1.0, 1.36, 0.06);
    line(b, 0.05, 1.365, 0, 0.02, 0.8);
    for (const sz of [-1, 1]) {
      sk(b, 'steel', STEEL).push().move(-0.05, 1.2, sz * 0.48).rotZ(X).lathe([[0, -0.32], [0.1, -0.28], [0.12, -0.2], [0.12, 0.2], [0.1, 0.28], [0, 0.32]], 10).pop();
      lit(b, () => b.push().move(-0.05, 1.2, sz * 0.48).box(0.36, 0.05, 0.25).pop());
      sk(b, 'ice', ICE).push().move(0.55, 1.02, sz * 0.26).rotY(sz * 0.3).rotZ(X - 0.35).cyl(0, 0.07, 0.42, 5).pop();
    }
    sk(b, 'steel', STEEL).push().move(0.55, 1.18, 0).rotZ(X).lathe([[0.11, 0], [0.1, 0.55], [0.13, 0.6], [0.13, 0.7], [0.09, 0.74]], 10).pop();
    sk(b, 'ice', ICE);
    for (let k = 0; k < 3; k++) b.push().move(0.95, 1.18, 0).rotX(k * TAU / 3).move(0, 0.13, 0).chamfer(0.36, 0.12, 0.02, 0.008).pop();
    lit(b, () => b.push().move(1.36, 1.18, 0).rotZ(X).geo(new THREE.OctahedronGeometry(0.08).scale(1, 2.2, 1)).pop());
    sk(b, 'dark', GUN).push().move(-0.25, 1.4, 0).cyl(0.12, 0.16, 0.1, 6).pop();
    b.use('spire');
    sk(b, 'ice', ICE).geo(new THREE.OctahedronGeometry(0.17).scale(1, 2.6, 1));
    lit(b, () => {
      b.geo(new THREE.OctahedronGeometry(0.1).scale(1, 2.8, 1));
      for (let k = 0; k < 3; k++) b.push().rotY(k * TAU / 3).move(0.32, -0.1, 0).geo(new THREE.OctahedronGeometry(0.05).scale(1, 2.2, 1)).pop();
    });
    return { muzzle: 1.45, muzzleY: 1.18, S: 1, height: 2.3,
      parts: [{ name: 'drum', on: 'hull', kind: 'roll', axis: 'z', r: 0.3, p: [1.22, 0.32, 0] },
        { name: 'spire', on: 'turret', kind: 'spin', axis: 'y', by: 'time', rate: 1.2, p: [-0.25, 1.95, 0], bob: 0.06 }] };
  },

  tho(b, paint, trim, deep) {
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const sz = i % 2 ? 1 : -1, front = i < 2;
      b.use(front === (sz > 0) ? 'leg0' : 'leg1').push().move(front ? 0.6 : -0.6, 0.76, sz * 0.7);
      sk(b, 'dark', GUN).push().rotX(X).cyl(0.16, 0.16, 0.24, 8).pop();
      b.push().move(0, 0, sz * 0.06); sk(b, 'paint', paint); limb(b, [0, 0.02], [0.06, -0.34], 0.3, 0.26, 0.06); b.pop();
      sk(b, 'paint', trim).push().move(0.06, -0.04, sz * 0.2).chamfer(0.22, 0.12, 0.02, 0.01).pop();
      sk(b, 'steel', STEEL).push().move(0.06, -0.36, 0).rotX(X).cyl(0.11, 0.11, 0.3, 8).pop();
      sk(b, 'dark', DARK).push().move(0.04, -0.52, 0).cyl(0.13, 0.16, 0.3, 8).pop();
      sk(b, 'dark', GUN).push().move(0.04, -0.7, 0).cyl(0.22, 0.24, 0.08, 10).pop();
      sk(b, 'steel', STEEL).rod([-0.12, -0.08, sz * 0.12], [-0.08, -0.5, sz * 0.12], 0.025, 5);
      b.pop();
    }
    for (let i = 0; i < 2; i++) legs.push({ p: [0, 0, 0], ph: i * Math.PI, kind: 'slide', amp: 0.2, lift: 0.1 });
    b.use('hull');
    sk(b, 'dark', DARK).prism([[0.75, 0.45], [0.85, 0.3], [0.85, -0.3], [0.75, -0.45], [-0.8, -0.5], [-0.9, -0.36], [-0.9, 0.36], [-0.8, 0.5]], 0.55, 0.72, 0.04);
    sk(b, 'paint', deep).prism([[0.8, 0.5], [0.92, 0.34], [0.92, -0.34], [0.8, -0.5], [-0.85, -0.55], [-0.95, -0.4], [-0.95, 0.4], [-0.85, 0.55]], 0.7, 1.04, 0.07);
    sk(b, 'paint', paint).prism([[0.76, 0.46], [0.86, 0.3], [0.86, -0.3], [0.76, -0.46], [-0.8, -0.5], [-0.9, -0.36], [-0.9, 0.36], [-0.8, 0.5]], 1.02, 1.12, 0.04);
    lit(b, () => { for (const sz of [-1, 1]) b.push().move(0, 0.92, sz * 0.555).box(1.3, 0.035, 0.02).pop(); });
    line(b, 0.2, 1.125, 0, 0.02, 1.0); line(b, 0.55, 1.125, 0, 0.02, 0.9);
    for (const sz of [-1, 1]) for (let k = 0; k < 5; k++) sk(b, 'paint', k % 2 ? BLACK : HAZ).push().move(0.95, 0.85, sz * 0.1 + (k - 2) * 0.18).rotX(0.6).box(0.07, 0.2, 0.07).pop();
    lit(b, () => { for (const sz of [-1, 1]) b.push().move(0.94, 1.0, sz * 0.32).box(0.03, 0.08, 0.14).pop(); });
    sk(b, 'dark', DARK).push().move(-0.6, 1.32, -0.22).chamfer(0.5, 0.4, 0.5, 0.05).pop();
    lit(b, () => { b.push().move(-0.34, 1.28, -0.22).box(0.02, 0.18, 0.32).pop(); b.push().move(-0.6, 1.525, -0.22).box(0.34, 0.012, 0.34).pop(); });
    sk(b, 'dark', LINE); for (let k = 0; k < 4; k++) b.push().move(-0.335, 1.28, -0.34 + k * 0.08).box(0.03, 0.2, 0.02).pop();
    sk(b, 'steel', STEEL).push().move(-0.7, 1.5, -0.32).lathe([[0.12, 0], [0.12, 0.6], [0.16, 0.64], [0.16, 0.72], [0.13, 0.72]], 10).pop();
    flame(b, () => b.push().move(-0.7, 2.36, -0.32).cyl(0.02, 0.12, 0.3, 6).pop());
    sk(b, 'steel', STEEL);
    for (const z of [0.05, 0.22]) b.push().move(-0.82, 1.12, z).lathe([[0.08, 0], [0.08, 0.36], [0.05, 0.42], [0.02, 0.46]], 8).pop();
    b.push().move(-0.55, 1.12, 0.38);
    sk(b, 'dark', GUN).cyl(0.14, 0.16, 0.12, 8);
    for (const dz of [-0.08, 0.08]) { b.push().move(0, 0, dz); sk(b, 'paint', HAZ); limb(b, [0, 0.08], [1.5, 0.8], 0.08, 0.05, 0.015); b.pop(); }
    sk(b, 'dark', GUN); for (let k = 1; k < 8; k++) b.push().move(k * 0.185, 0.08 + k * 0.096, 0).rotY(k % 2 ? 0.5 : -0.5).box(0.03, 0.04, 0.2).pop();
    sk(b, 'steel', STEEL).rod([0.1, 0.0, 0], [0.75, 0.42, 0], 0.035, 6);
    sk(b, 'dark', GUN).rod([0.1, 0.0, 0], [0.4, 0.2, 0], 0.06, 6);
    sk(b, 'dark', GUN).push().move(1.5, 0.8, 0).rotX(X).cyl(0.07, 0.07, 0.22, 8).pop();
    b.pop();
    b.use('hook');
    sk(b, 'dark', GUN).rod([0, 0, 0], [0, -0.55, 0], 0.012, 4);
    sk(b, 'paint', HAZ).push().move(0, -0.6, 0).chamfer(0.12, 0.1, 0.1, 0.02).pop();
    sk(b, 'steel', STEEL).push().move(0, -0.72, 0).geo(new THREE.TorusGeometry(0.07, 0.018, 4, 10, Math.PI * 1.4).rotateZ(Math.PI * 0.8)).pop();
    lit(b, () => b.push().move(0, -0.6, 0.06).box(0.05, 0.04, 0.01).pop());
    b.use('turret');
    sk(b, 'dark', GUN).push().move(0, 1.15, 0).cyl(0.36, 0.4, 0.08, 10).pop();
    sk(b, 'paint', paint).push().move(0.22, 1.32, 0).chamfer(0.64, 0.32, 0.46, 0.06).pop();
    sk(b, 'paint', trim).push().move(0.22, 1.49, 0).chamfer(0.5, 0.03, 0.3, 0.01).pop();
    sk(b, 'dark', DARK).push().move(0.68, 1.32, 0).chamfer(0.3, 0.3, 0.3, 0.04).pop();
    sk(b, 'dark', DARK).push().move(-0.12, 1.32, 0.3).chamfer(0.36, 0.22, 0.16, 0.03).pop();
    sk(b, 'dark', GUN).tube([[-0.05, 1.35, 0.38], [0.2, 1.28, 0.33], [0.45, 1.3, 0.25]], 0.035, 5, 6);
    lit(b, () => { b.push().move(0.3, 1.4, 0.235).box(0.3, 0.04, 0.01).pop(); b.push().move(0.3, 1.4, -0.235).box(0.3, 0.04, 0.01).pop(); });
    sk(b, 'dark', GUN).push().move(-0.1, 1.5, 0).cyl(0.04, 0.05, 0.1, 6).pop();
    sk(b, 'steel', STEEL);
    for (const dy of [-0.06, 0.06]) for (const dz of [-0.06, 0.06]) b.push().move(1.0, 1.32 + dy, dz).rotZ(X).cyl(0.035, 0.035, 0.4, 6).pop();
    sk(b, 'dark', DARK).push().move(1.08, 1.32, 0).chamfer(0.12, 0.26, 0.26, 0.03).pop();
    lit(b, () => b.push().move(1.145, 1.32, 0).box(0.01, 0.14, 0.14).pop());
    b.use('nail');
    sk(b, 'dark', GUN).rotZ(X).cyl(0.17, 0.17, 0.26, 8);
    sk(b, 'steel', STEEL);
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8; b.push().move(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12).cyl(0.03, 0.03, 0.28, 5).pop(); }
    b.use('beacon');
    sk(b, 'paint', trim).cyl(0.08, 0.08, 0.06, 8);
    lit(b, () => b.push().move(0.06, 0.07, 0).box(0.12, 0.06, 0.05).pop().push().move(-0.06, 0.07, 0).box(0.12, 0.06, 0.05).pop());
    return { muzzle: 1.15, muzzleY: 1.32, S: 0.98, height: 2.1, legs, stride: 1.44,
      parts: [{ name: 'nail', on: 'turret', kind: 'spin', axis: 'x', by: 'fire', p: [0.6, 1.32, 0], kick: 6 },
        { name: 'beacon', on: 'turret', kind: 'spin', axis: 'y', by: 'time', rate: 5, p: [-0.1, 1.58, 0] },
        { name: 'hook', on: 'hull', kind: 'sway', p: [0.95, 1.88, 0.38], amp: 0.2, axis: 'z' }] };
  },

  titan(b, paint, trim, deep) {
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, sz = Math.sin(a) > 0 ? 1 : -1;
      b.use('leg' + i);
      sk(b, 'dark', GUN).ball(0.42, 1);
      sk(b, 'dark', DARK); limb(b, [0, 0], [0.9, 1.25], 0.5, 0.55, 0.08);
      b.push().move(0, 0.2, 0); sk(b, 'paint', paint); limb(b, [0.05, 0.1], [0.85, 1.15], 0.42, 0.78, 0.1); b.pop();
      sk(b, 'paint', trim).push().move(0.45, 1.25, 0).rotZ(-0.35).cyl(0, 0.17, 0.95, 4).pop();
      sk(b, 'paint', deep).push().move(0.45, 0.9, 0).rotZ(-0.95).chamfer(0.5, 0.08, 0.82, 0.03).pop();
      sk(b, 'steel', STEEL).push().move(0.92, 1.27, 0).rotX(X).cyl(0.3, 0.3, 0.72, 10).pop();
      sk(b, 'dark', DARK); limb(b, [0.92, 1.27], [2.0, -1.45], 0.36, 0.46, 0.08);
      sk(b, 'paint', deep); limb(b, [1.1, 0.95], [1.88, -0.98], 0.22, 0.64, 0.06);
      sk(b, 'paint', trim).push().move(1.35, 0.55, 0).rotZ(-0.3).cyl(0, 0.12, 0.6, 4).pop();
      sk(b, 'steel', STEEL).rod([0.3, -0.2, 0.3], [1.55, -0.45, 0.3], 0.07, 6).rod([0.3, -0.2, -0.3], [1.55, -0.45, -0.3], 0.07, 6);
      sk(b, 'dark', GUN).rod([0.3, -0.2, 0.3], [0.95, -0.33, 0.3], 0.11, 6).rod([0.3, -0.2, -0.3], [0.95, -0.33, -0.3], 0.11, 6);
      sk(b, 'dark', GUN).push().move(2.02, -1.52, 0).cyl(0.55, 0.7, 0.3, 8).pop();
      sk(b, 'paint', trim);
      for (const c of [-0.7, 0, 0.7]) b.push().move(2.02, -1.6, 0).rotY(c).move(0.7, 0, 0).rotZ(X).cyl(0, 0.13, 0.55, 4).pop();
      lit(b, () => { b.push().move(1.55, -0.25, 0).rotZ(-1.2).box(0.9, 0.06, 0.66).pop(); b.push().move(0.5, 0.7, 0).rotZ(0.95).box(0.7, 0.05, 0.8).pop(); });
      const c = Math.cos(a), s = Math.sin(a);
      legs.push({ p: [c * 1.35, 1.65, s * 1.35], yaw: -a, ph: (i % 2) * Math.PI, kind: 'sweep', amp: 0.16 * sz, lift: 0.12 });
    }
    b.use('hull');
    sk(b, 'dark', DARK).lathe([[0, 1.0], [1.5, 1.1], [2.0, 1.4], [2.1, 1.85], [1.95, 2.1]], 8);
    sk(b, 'paint', paint).lathe([[1.95, 2.1], [2.08, 2.25], [2.05, 2.45], [1.7, 2.65], [1.2, 2.78], [0, 2.8]], 8);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + Math.PI / 8;
      b.push().rotY(a);
      lit(b, () => b.push().move(2.08, 1.7, 0).box(0.06, 0.3, 0.5).pop());
      sk(b, 'paint', trim).push().move(2.25, 2.35, 0).rotZ(-1.1).cyl(0, 0.26, 1.4, 4).pop();
      sk(b, 'dark', LINE).push().move(1.4, 2.73, 0).rotZ(0.25).box(0.9, 0.02, 0.04).pop();
      b.pop();
      b.push().rotY(a + Math.PI / 8); b.push().move(1.75, 2.58, 0).rotZ(0.5); vent(b, 0.4, 0.5, 4); b.pop(); b.pop();
    }
    b.use('turret');
    sk(b, 'dark', GUN).push().move(0, 2.86, 0).cyl(1.3, 1.4, 0.16, 16).pop();
    sk(b, 'paint', paint).prism([[1.25, 0.6], [1.55, 0], [1.25, -0.6], [-0.6, -1.1], [-1.2, -0.7], [-1.2, 0.7], [-0.6, 1.1]], 2.9, 3.62, 0.1);
    sk(b, 'dark', DARK).push().move(1.2, 3.22, 0).chamfer(0.6, 0.72, 2.2, 0.1).pop();
    line(b, 0.1, 3.625, 0, 0.03, 1.8); line(b, -0.6, 3.625, 0, 0.03, 1.6);
    for (const sz of [-1, 1]) {
      sk(b, 'paint', trim).push().move(-0.2, 3.3, sz * 1.38).chamfer(1.3, 0.8, 0.5, 0.08).pop();
      for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
        sk(b, 'dark', BLACK).push().move(0.46, 3.15 + r * 0.3, sz * 1.38 + (k - 1) * 0.14).rotZ(X).cyl(0.06, 0.06, 0.04, 6).pop();
        lit(b, () => b.push().move(0.48, 3.15 + r * 0.3, sz * 1.38 + (k - 1) * 0.14).rotZ(X).cyl(0.04, 0.04, 0.01, 6).pop());
      }
      sk(b, 'paint', trim).push().move(-0.9, 4.2, sz * 0.45).rotZ(1.0).rotX(sz * -0.4).cyl(0, 0.16, 1.1, 5).pop();
    }
    sk(b, 'dark', DARK).push().move(-0.5, 3.95, 0).chamfer(1.0, 0.65, 0.95, 0.12).pop();
    lit(b, () => {
      b.push().move(0.0, 4.02, 0).box(0.04, 0.12, 0.7).pop();
      b.push().move(-1.15, 3.6, 0).ball(0.42, 1).pop();
    });
    sk(b, 'dark', GUN);
    for (let k = 0; k < 5; k++) b.push().move(-1.15, 3.6, 0).rotX(k * Math.PI / 5).geo(new THREE.TorusGeometry(0.48, 0.035, 4, 16)).pop();
    b.use('barrel');
    for (const sz of [-0.8, 0, 0.8]) {
      sk(b, 'steel', STEEL).push().move(1.5, 3.2, sz).rotZ(X).lathe([[0.26, 0], [0.26, 0.4], [0.21, 0.5], [0.2, 1.4], [0.24, 1.45]], 12).pop();
      sk(b, 'dark', DARK).push().move(3.05, 3.2, sz).chamfer(0.36, 0.44, 0.5, 0.05).pop();
      lit(b, () => b.push().move(3.24, 3.2, sz).rotZ(X).cyl(0.14, 0.14, 0.02, 10).pop());
    }
    b.use('radar');
    sk(b, 'dark', GUN).cyl(0.06, 0.08, 0.3, 6);
    sk(b, 'steel', STEEL).push().move(0, 0.3, 0).rotZ(X).lathe([[0.04, -0.08], [0.35, 0], [0.5, 0.12]], 12).pop();
    lit(b, () => b.push().move(0.12, 0.3, 0).ball(0.06, 0).pop());
    return { muzzle: 3.26, muzzleY: 3.2, S: 1.12, height: 4.6, legs, stride: 4.5,
      parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.5 }, { name: 'radar', on: 'turret', kind: 'spin', axis: 'y', by: 'time', rate: 1.6, p: [-0.5, 4.28, 0] }] };
  },

  thancong(b, paint, trim, deep) {
    const PITCH = 0.3, cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    for (const sz of [-1, 1]) {
      const zi = sz * 0.62, zo = sz * 1.2;
      sk(b, 'rubber', RUB); side(b, [[-1.5, 0.3], [-1.3, 0.04], [1.3, 0.04], [1.56, 0.36], [1.4, 0.64], [-1.4, 0.64]], Math.min(zi, zo), Math.max(zi, zo), 0.03);
      for (let i = 0; i < 6; i++) {
        const x = -1.05 + i * 0.42;
        sk(b, 'steel', STEEL).push().move(x, 0.3, sz * 1.19).rotX(X).cyl(0.18, 0.18, 0.04, 10).pop();
        sk(b, 'dark', GUN).push().move(x, 0.3, sz * 1.215).rotX(X).cyl(0.07, 0.09, 0.04, 6).pop();
      }
      sk(b, 'dark', GUN).push().move(1.32, 0.36, sz * 1.2).rotX(X).cyl(0.22, 0.22, 0.06, 8).pop().push().move(-1.36, 0.36, sz * 1.2).rotX(X).cyl(0.22, 0.22, 0.06, 8).pop();
      sk(b, 'paint', paint).push().move(0, 0.6, sz * 1.24).chamfer(2.7, 0.3, 0.06, 0.025).pop();
      sk(b, 'paint', deep).push().move(0.1, 0.42, sz * 1.25).chamfer(2.0, 0.12, 0.04, 0.015).pop();
      lit(b, () => b.push().move(0, 0.6, sz * 1.275).box(2.3, 0.03, 0.02).pop());
      bolts(b, [-1.0, -0.4, 0.2, 0.8].map((x) => [x, 0.72, sz * 1.27]), 0.022);
      b.use('tread'); sk(b, 'dark', GUN);
      for (let x = -0.8; x <= 0.81; x += 0.2) b.push().move(x, 0.625, sz * 0.9).box(0.08, 0.04, 0.56).pop();
      b.use('hull');
    }
    sk(b, 'dark', DARK).prism([[1.3, 0.6], [1.5, 0.3], [1.5, -0.3], [1.3, -0.6], [-1.2, -0.66], [-1.42, -0.4], [-1.42, 0.4], [-1.2, 0.66]], 0.3, 0.8, 0.06);
    sk(b, 'paint', paint).prism([[1.1, 0.58], [1.3, 0.3], [1.3, -0.3], [1.1, -0.58], [-1.15, -0.62], [-1.34, -0.38], [-1.34, 0.38], [-1.15, 0.62]], 0.8, 0.92, 0.04);
    b.push().move(1.4, 0.76, 0).rotZ(-0.6).chamfer(0.5, 0.1, 1.1, 0.03).pop();
    lit(b, () => { for (const sz of [-1, 1]) b.push().move(1.5, 0.6, sz * 0.42).box(0.04, 0.07, 0.2).pop(); });
    for (const x of [-0.7, 0.4]) line(b, x, 0.925, 0, 0.025, 1.0);
    b.push().move(-0.95, 0.93, 0); vent(b, 0.4, 0.8, 6); b.pop();
    sk(b, 'dark', GUN).push().move(-1.5, 0.58, 0).rotZ(-0.12).chamfer(0.12, 0.55, 1.1, 0.025).pop();
    sk(b, 'paint', HAZ).push().move(-1.57, 0.78, 0).box(0.02, 0.06, 1.0).pop();
    for (const sz of [-1, 1]) {
      sk(b, 'steel', STEEL).push().move(-1.2, 0.95, sz * 0.5).rotZ(0.5).lathe([[0.07, 0], [0.09, 0.2], [0.07, 0.3]], 8).pop();
      flame(b, () => b.push().move(-1.2, 0.95, sz * 0.5).rotZ(0.5).move(0, 0.42, 0).cyl(0.012, 0.07, 0.2, 6).pop());
    }
    for (let i = 0; i < 2; i++) {
      const sz = i ? 1 : -1;
      b.use('rig' + i);
      sk(b, 'dark', GUN).push().rotZ(X).cyl(0.15, 0.15, 0.34, 8).pop();
      sk(b, 'paint', paint).rod([0, 0.02, 0], [0, -0.62, sz * 0.82], 0.13, 6);
      sk(b, 'dark', DARK).rod([0.17, 0, sz * 0.04], [0.17, -0.6, sz * 0.8], 0.045, 6).rod([-0.17, 0, sz * 0.04], [-0.17, -0.6, sz * 0.8], 0.045, 6);
      sk(b, 'steel', STEEL).rod([0, 0.3, sz * 0.12], [0, -0.28, sz * 0.52], 0.035, 6);
      b.push().move(0, -0.64, sz * 0.9);
      sk(b, 'dark', GUN).cyl(0.3, 0.34, 0.1, 8);
      sk(b, 'paint', trim).push().move(0, 0.06, 0).cyl(0.26, 0.26, 0.03, 8).pop();
      lit(b, () => b.push().move(0, 0.08, 0).cyl(0.17, 0.17, 0.012, 8).pop());
      sk(b, 'steel', STEEL).push().move(0, -0.09, 0).cyl(0.07, 0, 0.12, 5).pop();
      b.pop();
    }
    b.use('turret');
    sk(b, 'dark', GUN).push().move(-0.3, 0.94, 0).cyl(0.84, 0.9, 0.1, 16).pop();
    sk(b, 'paint', paint).prism([[0.5, 0.5], [0.64, 0.3], [0.64, -0.3], [0.5, -0.5], [-0.85, -0.72], [-1.1, -0.5], [-1.1, 0.5], [-0.85, 0.72]], 0.98, 1.6, 0.07);
    sk(b, 'paint', deep).push().move(-0.25, 1.62, 0).chamfer(1.5, 0.06, 1.0, 0.02).pop();
    sk(b, 'paint', trim); for (const sz of [-1, 1]) b.push().move(-0.2, 1.655, sz * 0.4).box(1.2, 0.02, 0.07).pop();
    sk(b, 'dark', GUN).push().move(-0.62, 1.66, 0.36).cyl(0.2, 0.22, 0.06, 10).pop();
    lit(b, () => b.push().move(-0.62, 1.7, 0.36).cyl(0.13, 0.13, 0.01, 10).pop());
    b.push().move(-0.5, 1.66, -0.36); vent(b, 0.4, 0.34, 4); b.pop();
    lit(b, () => { for (const sz of [-1, 1]) b.push().move(-0.3, 1.3, sz * 0.745).rotY(sz * 0.2).box(0.9, 0.04, 0.02).pop(); b.push().move(-1.135, 1.3, 0).box(0.02, 0.06, 0.7).pop(); });
    sk(b, 'dark', DARK).push().move(-1.05, 1.28, 0).chamfer(0.3, 0.5, 1.0, 0.04).pop();
    sk(b, 'dark', GUN).push().move(0.56, 1.3, 0).chamfer(0.5, 0.62, 0.84, 0.05).pop();
    for (const sz of [-1, 1]) {
      const o = [-sp * 0.3, cp * 0.3];
      sk(b, 'steel', STEEL).rod([0.4 + cp * 0.3 + o[0], 1.3 + sp * 0.3 + o[1], sz * 0.18], [0.4 + cp * 1.5 + o[0], 1.3 + sp * 1.5 + o[1], sz * 0.18], 0.035, 6);
      sk(b, 'dark', GUN).rod([0.4 + cp * 0.3 + o[0], 1.3 + sp * 0.3 + o[1], sz * 0.18], [0.4 + cp * 0.95 + o[0], 1.3 + sp * 0.95 + o[1], sz * 0.18], 0.06, 6);
    }
    sk(b, 'dark', GUN).rod([-0.9, 1.62, -0.5], [-0.95, 2.4, -0.5], 0.012, 4);
    lit(b, () => b.push().move(-0.95, 2.41, -0.5).ball(0.035, 0).pop());
    b.use('barrel');
    b.push().move(0.4, 1.3, 0).rotZ(X + PITCH);
    sk(b, 'dark', DARK).lathe([[0.17, -0.4], [0.24, -0.34], [0.25, 0.5], [0.21, 0.56], [0.21, 1.2], [0.16, 1.26]], 12);
    sk(b, 'steel', STEEL).lathe([[0.14, 1.2], [0.14, 2.8], [0.18, 2.86], [0.18, 3.1], [0.15, 3.14], [0.13, 3.3]], 12);
    sk(b, 'dark', GUN).push().move(0, 1.9, 0).cyl(0.2, 0.2, 0.5, 10).pop();
    sk(b, 'paint', trim);
    for (const y of [0.1, 0.9]) b.push().move(0, y, 0).cyl(0.25, 0.25, 0.06, 12).pop();
    sk(b, 'paint', HAZ).push().move(0, 3.0, 0).cyl(0.145, 0.145, 0.12, 12).pop();
    sk(b, 'dark', BLACK); for (let k = 0; k < 3; k++) b.push().move(0, 3.0 + k * 0.1, 0).cyl(0.186, 0.186, 0.025, 12).pop();
    lit(b, () => { b.push().move(0, 1.0, 0).geo(new THREE.TorusGeometry(0.215, 0.018, 4, 16).rotateX(Math.PI / 2)).pop(); b.push().move(0, 3.33, 0).cyl(0.1, 0.1, 0.02, 10).pop(); });
    b.pop();
    return { muzzle: 0.4 + cp * 3.3, muzzleY: 1.3 + sp * 3.3, S: 1.06, height: 2.6,
      parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.5, dir: [-cp, -sp, 0] }, { name: 'tread', on: 'hull', kind: 'tread', step: 0.2 },
        { name: 'rig0', on: 'hull', kind: 'deploy', by: 'stance', p: [-0.75, 0.72, -1.12], axis: 'x', a0: 0.75 * Math.PI, a1: 0 },
        { name: 'rig1', on: 'hull', kind: 'deploy', by: 'stance', p: [-0.75, 0.72, 1.12], axis: 'x', a0: -0.75 * Math.PI, a1: 0 }] };
  },

  mangxa(b, paint, trim, deep) {
    sk(b, 'dark', DARK).prism([[1.65, 0], [1.42, 0.32], [0.5, 0.5], [-0.7, 0.46], [-1.15, 0.3], [-1.2, 0], [-1.15, -0.3], [-0.7, -0.46], [0.5, -0.5], [1.42, -0.32]], 0.28, 0.64, 0.05);
    for (const sz of [-1, 1]) {
      sk(b, 'paint', deep).push().move(0.05, 0.42, sz * 0.5).rotX(sz * -0.25).chamfer(2.2, 0.26, 0.12, 0.03).pop();
      lit(b, () => b.push().move(0.05, 0.4, sz * 0.545).box(1.9, 0.03, 0.02).pop());
      for (let k = 0; k < 4; k++) sk(b, 'steel', STEEL).push().move(1.52 - k * 0.12, 0.6, sz * (0.12 + k * 0.05)).rotZ(-0.3).cyl(0, 0.035, 0.12, 4).pop();
    }
    for (const [i, x] of [1.12, 0.5, -0.1, -0.7].entries()) {
      const w = 0.62 - i * 0.07;
      sk(b, 'paint', i % 2 ? deep : paint).push().move(x, 0.7, 0).rotZ(0.12).chamfer(0.55, 0.12, w * 1.6, 0.035).pop();
      sk(b, 'paint', trim).push().move(x - 0.2, 0.74, 0).box(0.04, 0.05, w * 1.35).pop();
    }
    lit(b, () => { b.push().move(0.2, 0.775, 0).box(1.9, 0.02, 0.05).pop(); for (const sz of [-1, 1]) b.push().move(1.5, 0.5, sz * 0.2).rotY(sz * 0.3).box(0.22, 0.05, 0.05).pop(); });
    sk(b, 'dark', GUN).push().move(1.66, 0.4, 0).chamfer(0.1, 0.18, 0.5, 0.02).pop();
    sk(b, 'paint', HAZ).push().move(-1.22, 0.47, 0).box(0.05, 0.12, 0.5).pop();
    for (const sz of [-1, 1]) {
      sk(b, 'steel', STEEL).push().move(-1.05, 0.62, sz * 0.22).rotZ(1.2).lathe([[0.06, 0], [0.08, 0.14], [0.1, 0.2]], 8).pop();
      flame(b, () => b.push().move(-1.05, 0.62, sz * 0.22).rotZ(1.2).move(0, 0.3, 0).cyl(0.02, 0.09, 0.22, 6).pop());
    }
    b.use('wheel');
    sk(b, 'rubber', RUB).push().rotX(X).cyl(0.27, 0.27, 0.24, 12).pop();
    sk(b, 'rubber', BLACK);
    for (let k = 0; k < 8; k++) b.push().rotZ(k * TAU / 8).move(0.26, 0, 0).box(0.05, 0.1, 0.26).pop();
    sk(b, 'steel', STEEL).push().rotX(X).cyl(0.15, 0.15, 0.26, 8).pop();
    lit(b, () => { for (const sz of [-1, 1]) b.push().move(0, 0, sz * 0.125).rotX(X).cyl(0.06, 0.06, 0.02, 6).pop(); });
    b.use('tail');
    const seg = [[0, 0], [-0.3, -0.03], [-0.6, -0.08], [-0.85, -0.02]];
    for (let k = 0; k < seg.length - 1; k++) {
      const s = 1 - k * 0.22;
      sk(b, 'paint', k % 2 ? deep : paint); limb(b, seg[k], seg[k + 1], 0.3 * s, 0.34 * s, 0.05);
      sk(b, 'dark', GUN).push().move(seg[k + 1][0], seg[k + 1][1], 0).rotX(X).cyl(0.1 * s, 0.1 * s, 0.28 * s, 8).pop();
    }
    sk(b, 'steel', STEEL).push().move(-1.05, 0.0, 0).rotZ(1.57).cyl(0, 0.09, 0.4, 5).pop();
    lit(b, () => b.push().move(-1.27, 0.0, 0).ball(0.05, 0).pop());
    b.use('turret');
    sk(b, 'dark', GUN).push().move(0, 0.68, 0).cyl(0.62, 0.68, 0.1, 14).pop();
    sk(b, 'paint', paint).prism([[0.5, 0.0], [0.34, -0.26], [-0.2, -0.42], [-0.66, -0.34], [-0.7, -0.02], [-0.25, -0.0], [0.2, 0.0]], 0.72, 1.12, 0.06);
    sk(b, 'glass', BLACK).prism([[0.42, -0.04], [0.28, -0.22], [0.0, -0.3], [0.0, -0.04]], 1.12, 1.17, 0.02);
    sk(b, 'paint', trim).push().move(-0.2, 1.14, -0.2).box(0.7, 0.02, 0.06).pop();
    lit(b, () => b.push().move(-0.7, 0.95, -0.18).box(0.02, 0.07, 0.3).pop());
    b.push().move(-0.35, 1.13, -0.2); vent(b, 0.3, 0.2, 3); b.pop();
    sk(b, 'dark', GUN).push().move(0.1, 0.8, 0.62).chamfer(1.0, 0.16, 0.34, 0.03).pop();
    sk(b, 'paint', deep).push().move(0.1, 0.9, 0.62).chamfer(0.8, 0.06, 0.28, 0.02).pop();
    sk(b, 'dark', DARK).rod([-0.1, 0.92, 0.5], [0.5, 1.12, 0.5], 0.07, 6).rod([0.5, 1.12, 0.5], [1.15, 1.0, 0.5], 0.06, 6);
    sk(b, 'steel', STEEL).push().move(0.5, 1.12, 0.5).ball(0.1, 0).pop().push().move(-0.1, 0.92, 0.5).ball(0.09, 0).pop();
    sk(b, 'steel', STEEL).rod([0.05, 0.9, 0.7], [0.6, 1.08, 0.7], 0.025, 5);
    sk(b, 'dark', GUN).tube([[-0.2, 1.38, 0.62], [0.2, 1.34, 0.6], [0.7, 1.2, 0.54], [1.2, 1.1, 0.5]], 0.028, 5, 10);
    lit(b, () => b.push().move(1.2, 1.1, 0.5).ball(0.04, 0).pop());
    sk(b, 'dark', GUN).push().move(0.3, 0.98, -0.2).chamfer(0.5, 0.34, 0.4, 0.05).pop();
    b.use('barrel');
    sk(b, 'steel', STEEL).push().move(0.55, 0.98, -0.2).rotZ(X).lathe([[0.1, -0.3], [0.1, 0.7], [0.14, 0.76], [0.14, 0.92], [0.1, 0.96]], 10).pop();
    for (const sz of [-1, 1]) sk(b, 'steel', STEEL).push().move(1.5, 0.98, -0.2 + sz * 0.1).rotY(sz * -0.3).cyl(0, 0.04, 0.2, 4).pop();
    lit(b, () => b.push().move(1.53, 0.98, -0.2).rotZ(X).cyl(0.06, 0.06, 0.02, 8).pop());
    b.use('drum');
    sk(b, 'steel', STEEL).rotX(X).cyl(0.36, 0.36, 0.36, 14);
    sk(b, 'dark', GUN);
    for (const sz of [-1, 1]) b.push().move(0, 0, sz * 0.2).rotX(X).cyl(0.44, 0.44, 0.06, 14).pop();
    sk(b, 'dark', DARK);
    for (let k = 0; k < 10; k++) b.push().rotZ(k * TAU / 10).move(0.4, 0, 0).box(0.1, 0.1, 0.4).pop();
    sk(b, 'paint', trim);
    for (let k = 0; k < 10; k++) b.push().rotZ(k * TAU / 10 + TAU / 20).move(0.36, 0, 0).box(0.08, 0.06, 0.3).pop();
    lit(b, () => { b.push().rotX(X).cyl(0.1, 0.1, 0.5, 8).pop(); for (const sz of [-1, 1]) b.push().move(0, 0, sz * 0.231).rotX(X).cyl(0.34, 0.34, 0.01, 14).pop(); });
    for (const [n, sz] of [['clawL', -1], ['clawR', 1]]) {
      b.use(n);
      sk(b, 'steel', STEEL).ball(0.09, 0);
      sk(b, 'paint', paint).push().move(0, 0, sz * 0.02).prism([[0, sz * 0.09], [0.3, sz * 0.1], [0.55, sz * 0.02], [0.68, -sz * 0.14], [0.52, -sz * 0.06], [0.28, -sz * 0.0], [0, -sz * 0.08]], -0.07, 0.07, 0.025).pop();
      sk(b, 'steel', STEEL).push().move(0.62, 0, -sz * 0.08).rotY(sz * -0.9).rotZ(X).cyl(0, 0.05, 0.2, 4).pop();
      lit(b, () => b.push().move(0.25, 0.075, sz * 0.05).box(0.2, 0.012, 0.025).pop());
    }
    return { muzzle: 1.6, muzzleY: 0.98, S: 1.04, height: 1.6,
      parts: [{ name: 'wheel', on: 'hull', kind: 'roll', axis: 'z', r: 0.27, at: [-0.85, -0.1, 0.65, 1.2].flatMap((x) => [[x, 0.27, 0.58], [x, 0.27, -0.58]]) },
        { name: 'tail', on: 'hull', kind: 'sway', p: [-1.15, 0.5, 0], amp: 0.2 },
        { name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.2 },
        { name: 'drum', on: 'turret', kind: 'spin', axis: 'z', by: 'fire', p: [-0.1, 1.1, 0.5], kick: 9 },
        { name: 'clawL', on: 'turret', kind: 'snap', axis: 'y', p: [1.2, 1.0, 0.5], a0: 0.5, amt: -0.5 },
        { name: 'clawR', on: 'turret', kind: 'snap', axis: 'y', p: [1.2, 1.0, 0.5], a0: -0.5, amt: 0.5 }] };
  },

  kimquy(b, paint, trim, deep) {
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, sz = Math.sin(a) > 0 ? 1 : -1;
      b.use('leg' + i);
      sk(b, 'dark', GUN).ball(0.14, 0);
      sk(b, 'dark', DARK); limb(b, [0, 0], [0.5, -0.12], 0.26, 0.26, 0.05);
      sk(b, 'paint', deep); limb(b, [0.04, 0.05], [0.46, -0.08], 0.2, 0.3, 0.04);
      sk(b, 'dark', DARK); limb(b, [0.5, -0.12], [0.72, -0.5], 0.2, 0.22, 0.04);
      sk(b, 'dark', GUN).push().move(0.78, -0.55, 0).cyl(0.28, 0.32, 0.1, 8).pop();
      sk(b, 'paint', trim); for (const dz of [-0.14, 0, 0.14]) b.push().move(0.98, -0.52, dz).rotZ(-1.2).cyl(0, 0.05, 0.16, 4).pop();
      lit(b, () => b.push().move(0.62, -0.34, sz * 0.08).box(0.14, 0.03, 0.01).pop());
      const c = Math.cos(a), s = Math.sin(a);
      legs.push({ p: [c * 0.8, 0.6, s * 0.8], yaw: -a, ph: (i % 2) * Math.PI, kind: 'sweep', amp: 0.22 * sz, lift: 0.2 });
    }
    b.use('hull');
    sk(b, 'dark', DARK).lathe([[0, 0.45], [0.9, 0.5], [1.12, 0.6], [1.2, 0.72]], 18);
    sk(b, 'paint', paint).lathe([[1.2, 0.72], [1.24, 0.82], [1.12, 1.04], [0.82, 1.22], [0.42, 1.32], [0, 1.35]], 18);
    sk(b, 'paint', deep).lathe([[1.05, 1.0], [1.0, 1.08], [0.9, 1.1], [0.88, 1.04]], 18);
    lit(b, () => { b.push().move(0, 0.8, 0).geo(new THREE.TorusGeometry(1.225, 0.025, 4, 40).rotateX(Math.PI / 2)).pop(); b.push().move(0, 0.5, 0).cyl(0.3, 0.34, 0.03, 12).pop(); });
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + TAU / 16;
      b.push().rotY(a).move(0.78, 1.18, 0).rotZ(-0.55);
      sk(b, 'paint', i % 2 ? paint : deep).chamfer(0.46, 0.07, 0.34, 0.02);
      sk(b, 'paint', trim).push().move(0, 0.045, 0).box(0.34, 0.012, 0.05).pop();
      b.pop();
    }
    for (let i = 0; i < 4; i++) {
      b.push().rotY(i * TAU / 4).move(0.52, 1.3, 0).rotZ(-0.2);
      line(b, 0, 0.03, 0, 0.5, 0.03);
      lit(b, () => b.push().move(0, 0.035, 0).box(0.34, 0.012, 0.025).pop());
      b.pop();
    }
    sk(b, 'dark', DARK).push().move(1.2, 0.68, 0).rotZ(-0.2).cyl(0.3, 0.36, 0.5, 10).pop();
    sk(b, 'paint', paint).push().move(1.42, 0.72, 0).scale(1.4, 0.9, 1).ball(0.3, 1, 0.8).pop();
    sk(b, 'glass', BLACK).push().move(1.6, 0.78, 0).box(0.1, 0.1, 0.38).pop();
    lit(b, () => { for (const sz of [-1, 1]) b.push().move(1.66, 0.78, sz * 0.12).box(0.04, 0.05, 0.1).pop(); });
    for (const sz of [-1, 1]) sk(b, 'paint', trim).push().move(1.48, 0.95, sz * 0.12).rotZ(-0.4).cyl(0, 0.05, 0.18, 4).pop();
    sk(b, 'dark', GUN).push().move(-1.18, 0.62, 0).rotZ(1.6).cyl(0, 0.16, 0.3, 6).pop();
    for (const sz of [-1, 1]) {
      sk(b, 'steel', STEEL).push().move(-1.0, 0.7, sz * 0.4).rotZ(0.9).lathe([[0.06, 0], [0.08, 0.16], [0.06, 0.24]], 8).pop();
      flame(b, () => b.push().move(-1.0, 0.7, sz * 0.4).rotZ(0.9).move(0, 0.34, 0).cyl(0.012, 0.07, 0.18, 6).pop());
    }
    b.use('emit');
    sk(b, 'dark', GUN).push().move(0, 0.0, 0).cyl(0.2, 0.26, 0.12, 8).pop();
    sk(b, 'steel', STEEL).lathe([[0.1, 0.05], [0.07, 0.3], [0.1, 0.5]], 8);
    sk(b, 'paint', trim).push().move(0, 0.2, 0).cyl(0.14, 0.14, 0.05, 8).pop();
    sk(b, 'ice', ICE).push().move(0, 0.72, 0).geo(new THREE.OctahedronGeometry(0.17).scale(1, 1.8, 1)).pop();
    lit(b, () => {
      b.push().move(0, 0.72, 0).geo(new THREE.OctahedronGeometry(0.11).scale(1, 1.8, 1)).pop();
      b.push().move(0, 0.3, 0).geo(new THREE.TorusGeometry(0.15, 0.02, 4, 12).rotateX(Math.PI / 2)).pop();
      b.push().move(0, 0.06, 0).cyl(0.17, 0.17, 0.02, 8).pop();
    });
    b.use('turret');
    sk(b, 'dark', GUN).push().move(0, 1.34, 0).cyl(0.5, 0.56, 0.1, 12).pop();
    sk(b, 'paint', paint).prism([[0.46, 0], [0.34, 0.3], [-0.2, 0.38], [-0.42, 0.22], [-0.42, -0.22], [-0.2, -0.38], [0.34, -0.3]], 1.38, 1.7, 0.07);
    sk(b, 'glass', BLACK).prism([[0.38, 0], [0.26, 0.16], [0.06, 0.2], [0.06, -0.2], [0.26, -0.16]], 1.7, 1.75, 0.02);
    sk(b, 'paint', trim).push().move(-0.18, 1.715, 0).box(0.4, 0.02, 0.08).pop();
    lit(b, () => { b.push().move(-0.425, 1.55, 0).box(0.02, 0.06, 0.3).pop(); for (const sz of [-1, 1]) b.push().move(0.0, 1.52, sz * 0.375).rotY(sz * 0.2).box(0.4, 0.04, 0.02).pop(); });
    b.push().move(-0.2, 1.7, 0); vent(b, 0.22, 0.26, 3); b.pop();
    sk(b, 'dark', GUN).push().move(0.46, 1.52, 0).chamfer(0.18, 0.3, 0.46, 0.03).pop();
    sk(b, 'dark', GUN).rod([-0.28, 1.7, 0.2], [-0.34, 2.2, 0.22], 0.01, 4);
    lit(b, () => b.push().move(-0.34, 2.21, 0.22).ball(0.03, 0).pop());
    b.use('barrel');
    for (const dz of [-0.13, 0, 0.13]) {
      b.push().move(0.5, 1.52, dz).rotY(dz * -1.0);
      sk(b, 'steel', STEEL).rotZ(X).push().move(0, 0.2, 0).lathe([[0.065, -0.2], [0.065, 0.3], [0.085, 0.34], [0.085, 0.46]], 8).pop();
      b.pop();
    }
    lit(b, () => b.push().move(1.0, 1.52, 0).box(0.02, 0.06, 0.36).pop());
    return { muzzle: 1.02, muzzleY: 1.52, S: 1.02, height: 2.2, legs, stride: 1.7,
      parts: [{ name: 'emit', on: 'hull', kind: 'pulse', own: true, at: [0, 1, 2, 3].map((i) => [Math.cos(Math.PI / 4 + i * Math.PI / 2) * 1.1, 0.78, Math.sin(Math.PI / 4 + i * Math.PI / 2) * 1.1]) },
        { name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.2 }] };
  },

  hacho(b, paint, trim, deep) {
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const sz = i % 2 ? 1 : -1, front = i < 2, hx = front ? 0.62 : -0.8, hy = front ? 0.95 : 0.82;
      const a = sz * (Math.PI / 2 + (front ? -0.35 : 0.3));
      b.use('leg' + i);
      sk(b, 'dark', GUN).ball(0.18, 0);
      sk(b, 'dark', DARK); limb(b, [0, 0], [0.42, 0.18], 0.3, 0.3, 0.05);
      sk(b, 'paint', front ? paint : deep); limb(b, [0.02, 0.07], [0.4, 0.2], 0.24, 0.38, 0.05);
      sk(b, 'steel', STEEL).push().move(0.44, 0.18, 0).ball(0.12, 0).pop();
      sk(b, 'dark', DARK); limb(b, [0.44, 0.18], [0.9, -hy + 0.1], 0.24, 0.26, 0.05);
      sk(b, 'dark', GUN).push().move(0.95, -hy + 0.06, 0).cyl(0.18, 0.2, 0.14, 8).pop();
      sk(b, 'paint', trim); for (const dz of [-0.1, 0, 0.1]) b.push().move(1.12, -hy + 0.04, dz).rotZ(-1.35).cyl(0, 0.05, 0.22, 4).pop();
      lit(b, () => b.push().move(0.7, 0.04, sz * 0.14).box(0.2, 0.025, 0.01).pop());
      legs.push({ p: [hx, hy, sz * 0.55], yaw: -a, ph: (front === (sz > 0) ? 0 : Math.PI), kind: 'sweep', amp: 0.28 * sz, lift: 0.22 });
    }
    b.use('hull');
    sk(b, 'dark', DARK).prism([[1.0, 0.42], [1.1, 0.2], [1.1, -0.2], [1.0, -0.42], [-0.8, -0.5], [-1.25, -0.28], [-1.3, 0], [-1.25, 0.28], [-0.8, 0.5]], 0.62, 1.0, 0.06);
    sk(b, 'paint', paint).push().move(0.38, 1.12, 0).rotZ(-0.22).chamfer(1.2, 0.5, 1.12, 0.1).pop();
    sk(b, 'paint', deep).push().move(-0.72, 1.08, 0).rotZ(0.16).chamfer(1.3, 0.3, 0.98, 0.07).pop();
    for (const sz of [-1, 1]) {
      sk(b, 'paint', trim).push().move(0.4, 1.22, sz * 0.5).rotZ(-0.22).rotX(sz * -0.4).chamfer(0.9, 0.1, 0.1, 0.02).pop();
    }
    lit(b, () => { for (let k = 0; k < 4; k++) b.push().move(0.25 - k * 0.4, 1.4 - k * 0.09 - (k > 1 ? 0.04 : 0), 0).rotZ(k < 2 ? -0.22 : 0.16).box(0.08, 0.03, 0.9 - k * 0.1).pop(); });
    b.push().move(-0.95, 1.25, 0); vent(b, 0.5, 0.5, 5); b.pop();
    for (const sz of [-1, 1]) {
      sk(b, 'dark', GUN).push().move(0.85, 0.95, sz * 0.52).rotZ(0.4).cyl(0.17, 0.17, 0.14, 8).pop();
      lit(b, () => b.push().move(1.12, 1.0, sz * 0.4).box(0.03, 0.07, 0.14).pop());
      sk(b, 'steel', STEEL).push().move(-1.1, 1.18, sz * 0.3).rotZ(1.0).lathe([[0.07, 0], [0.09, 0.16], [0.06, 0.26]], 8).pop();
      flame(b, () => b.push().move(-1.1, 1.18, sz * 0.3).rotZ(1.0).move(0, 0.36, 0).cyl(0.012, 0.08, 0.2, 6).pop());
      sk(b, 'dark', GUN).push().move(0.62, 1.0, sz * 0.55).ball(0.2, 1).pop();
      sk(b, 'paint', paint).rod([0.62, 1.0, sz * 0.55], [0.98, 0.98, sz * 0.92], 0.15, 6);
      sk(b, 'steel', STEEL).push().move(0.98, 0.98, sz * 0.92).ball(0.13, 0).pop();
      sk(b, 'dark', DARK).rod([0.98, 0.98, sz * 0.92], [1.4, 0.92, sz * 1.18], 0.12, 6);
      sk(b, 'paint', trim).rod([1.06, 0.98, sz * 0.97], [1.3, 0.95, sz * 1.12], 0.075, 6, 0.1);
      sk(b, 'dark', GUN).push().move(1.4, 0.9, sz * 1.18).cyl(0.2, 0.22, 0.16, 8).pop();
      sk(b, 'steel', STEEL).rod([1.4, 0.9, sz * 1.18], [1.4, 0.74, sz * 1.18], 0.05, 6);
      lit(b, () => b.push().move(1.4, 0.985, sz * 1.18).cyl(0.17, 0.17, 0.01, 8).pop());
    }
    b.use('saw');
    sk(b, 'steel', STEEL).lathe([[0.0, -0.025], [0.48, -0.02], [0.5, 0.0], [0.48, 0.02], [0, 0.03]], 24);
    sk(b, 'steel', STEEL);
    for (let k = 0; k < 14; k++) b.push().rotY(k * TAU / 14).move(0.5, 0, 0).rotY(0.5).prism([[0.1, 0.0], [-0.05, 0.1], [-0.05, -0.06]], -0.02, 0.02, 0.005).pop();
    sk(b, 'dark', GUN);
    for (let k = 0; k < 7; k++) b.push().rotY(k * TAU / 7).move(0.32, 0.028, 0).box(0.26, 0.012, 0.05).pop();
    sk(b, 'dark', DARK).push().move(0, 0.03, 0).cyl(0.14, 0.14, 0.05, 10).pop();
    lit(b, () => { b.push().move(0, 0.03, 0).geo(new THREE.TorusGeometry(0.22, 0.016, 4, 20).rotateX(Math.PI / 2)).pop(); b.push().move(0, 0.06, 0).cyl(0.06, 0.06, 0.02, 6).pop(); });
    b.use('tail');
    sk(b, 'paint', deep); limb(b, [0, 0], [-0.4, 0.12], 0.2, 0.2, 0.04); limb(b, [-0.4, 0.12], [-0.8, 0.0], 0.15, 0.15, 0.04);
    lit(b, () => b.push().move(-0.82, 0.0, 0).ball(0.06, 0).pop());
    b.use('turret');
    sk(b, 'dark', GUN).push().move(0.45, 1.5, 0).cyl(0.34, 0.38, 0.08, 10).pop();
    sk(b, 'paint', paint).prism([[0.7, 0.0], [0.5, 0.3], [0.0, 0.38], [-0.34, 0.26], [-0.34, -0.26], [0.0, -0.38], [0.5, -0.3]], 1.54, 1.82, 0.07);
    sk(b, 'dark', DARK).push().move(0.78, 1.64, 0).chamfer(0.32, 0.22, 0.44, 0.04).pop();
    sk(b, 'glass', BLACK).push().move(0.45, 1.835, 0).box(0.26, 0.02, 0.36).pop();
    lit(b, () => { for (const sz of [-1, 1]) b.push().move(0.9, 1.7, sz * 0.14).rotY(sz * 0.3).box(0.06, 0.04, 0.1).pop(); b.push().move(0.1, 1.84, 0).box(0.3, 0.015, 0.05).pop(); });
    sk(b, 'paint', HAZ);
    for (const sz of [-1, 1]) b.push().move(0.0, 1.78, sz * 0.2).rotZ(X).cyl(0.11, 0.11, 0.5, 10).pop();
    sk(b, 'dark', GUN).tube([[0.0, 1.8, 0.2], [0.3, 1.72, 0.14], [0.9, 1.66, 0.06]], 0.025, 5, 8);
    sk(b, 'steel', STEEL).push().move(1.0, 1.64, 0).rotZ(X).lathe([[0.1, 0.0], [0.1, 0.5], [0.13, 0.54], [0.13, 0.6], [0.09, 0.64]], 10).pop();
    sk(b, 'dark', DARK).push().move(1.08, 1.64, 0).rotZ(X).cyl(0.14, 0.14, 0.05, 10).pop();
    lit(b, () => b.push().move(1.34, 1.64, 0).geo(new THREE.TorusGeometry(0.1, 0.02, 4, 12).rotateY(Math.PI / 2)).pop());
    tflame(b, () => b.push().move(1.68, 1.64, 0).rotZ(X).cyl(0.0, 0.04, 0.13, 5).pop());
    return { muzzle: 1.66, muzzleY: 1.64, S: 1.04, height: 2.0, legs, stride: 1.9,
      parts: [{ name: 'saw', on: 'hull', kind: 'spin', axis: 'y', by: 'time', rate: 9, rage: 2.6, at: [[1.4, 0.74, 1.18], [1.4, 0.74, -1.18]] },
        { name: 'tail', on: 'hull', kind: 'sway', p: [-1.3, 1.0, 0], amp: 0.16 }] };
  },
};

// Four more designs live in mechs-b.js and draw with the same helpers.
const HELP = { sk, lit, flame, tflame, side, limb, vent, bolts, hazard, line, DARK, GUN, STEEL, PALE, HAZ, BLACK, RUB, ICE, LINE, X, TAU };
Object.assign(DESIGNS, designsB(HELP));
// Keys with a hand-made design of their own.
export const DESIGN_KEYS = Object.keys(DESIGNS);

// The model of one mech as builder batches: its own design, else the frame spec of its style row (frames.js),
// else the design of the chassis it borrows; then the role hardware of its form. Shared by the game and the tools.
export function buildModel(key, st, paint, trim, deep, form = 2) {
  const b = new Builder(0.85);
  b.use('hull').surface(1, 1);
  // Ornate tanks (ornate.js) build all three forms themselves, no role hardware.
  if (ORNATE[key]) return { b, info: ornateModel(HELP, b, key, st, paint, trim, deep, form) };
  // Steel-style tanks (steel.js) build all three forms themselves, role hardware included.
  if (STEEL_DESIGNS[key]) return { b, info: STEEL_DESIGNS[key](b, st, trim, form) };
  const design = DESIGNS[key] || (st.frame && frameDesign(HELP, st.frame)) || DESIGNS[st.chassis] || DESIGNS.soi;
  const info = design(b, paint, trim, deep);
  adorn(HELP, b, key, st, form, info);
  return { b, info };
}

const SHIELD_VERT = 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }';

function shieldMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uHit: { value: 0 } },
    vertexShader: SHIELD_VERT,
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uHit; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float hexEdge(vec2 p) {
        const vec2 s = vec2(1.0, 1.7320508);
        vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
        vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
        vec2 g = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
        vec2 q = abs(g);
        return 0.5 - max(dot(q, s * 0.5), q.x);
      }
      void main() {
        vec3 p = normalize(vP);
        float f = pow(1.0 - max(0.0, dot(vN, vV)), 2.4);
        vec2 uv = vec2(atan(p.z, p.x) * 2.6, p.y * 5.0);
        float edge = 1.0 - smoothstep(0.0, 0.07, hexEdge(uv));
        float scan = smoothstep(0.9, 1.0, sin(p.y * 7.0 - uTime * 3.0)) * 0.6;
        float a = f * 0.95 + edge * (0.12 + f * 0.5 + scan) + 0.04 + uHit * (0.3 + edge * 0.9);
        gl_FragColor = vec4(uColor * (1.3 + uHit * 2.2) * a, a);
      }`,
  });
}

function ringMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uAim: { value: 0 }, uMine: { value: 0 }, uFade: { value: 1 } },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uAim, uMine, uFade; varying vec2 vP;
      void main() {
        float r = length(vP), a = atan(vP.y, vP.x);
        float band = smoothstep(0.80, 0.83, r) * (1.0 - smoothstep(0.93, 0.96, r));
        float fill = smoothstep(0.25, 0.82, r) * (1.0 - smoothstep(0.8, 0.83, r)) * 0.22;
        float dash = smoothstep(0.99, 1.01, r) * (1.0 - smoothstep(1.05, 1.07, r)) * step(0.45, fract(a * 3.8197 + uTime * 0.12));
        float da = abs(atan(sin(a - uAim), cos(a - uAim)));
        float notch = (1.0 - smoothstep(0.1, 0.2, da)) * smoothstep(0.94, 0.97, r) * (1.0 - smoothstep(1.1, 1.14, r - da * 0.6)) * uMine;
        float al = (band * 0.85 + fill + dash * 0.55 + notch) * uFade;
        gl_FragColor = vec4(uColor * (1.0 + band * 0.7 + notch * 1.5), min(al, 1.0));
      }`,
  });
}

// The baked metal set worn by every mech, with per-vertex roughness/metalness (the builder's `surf`),
// a darker underside and a team-colour rim so the team still reads in the dark or at distance.
function mechMaterial(base, rim, glow, low) {
  const m = base.clone();
  if (low) m.normalMap = null;
  m.userData.rim = { value: rim }; m.userData.glow = { value: glow };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = m.userData.rim; sh.uniforms.uGlow = m.userData.glow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 surf; varying vec2 vSurf; varying float vWY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSurf = surf; vec4 wy = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nwy = instanceMatrix * wy;\n#endif\nvWY = (modelMatrix * wy).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim, uGlow; varying vec2 vSurf; varying float vWY;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat lamp = step(vSurf.x, -0.5);\ndiffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.0, 1.1, vWY)) * (1.0 - lamp);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * abs(vSurf.x), 0.06, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = clamp(metalnessFactor * vSurf.y, 0.0, 1.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += mix(uGlow, vColor * 3.2 * min(max(uGlow.r, max(uGlow.g, uGlow.b)) / 3.0, 1.4), step(0.5, vSurf.y)) * lamp + uRim * (1.0 - lamp) * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);');
  };
  m.customProgramCacheKey = () => 'mech' + (low ? 'L' : '');
  return m;
}

const AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const Q = new THREE.Quaternion(), M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), V3S = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
const ARMOR_RIM = new THREE.Color(0.5, 0.7, 1.0), HOLO = new THREE.Color(0.35, 0.95, 1.0);
const toward = (a, b, d) => (a < b ? Math.min(b, a + d) : Math.max(b, a - d));
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Decals are painted as flat quads draped over the model's upward-facing surfaces: the hull and turret triangles are
// rasterised into a height grid, every grid cell inside the pattern becomes a quad, and each quad rides on whichever
// of the two groups owns the surface under it. One geometry pair per mech and decal, shared by every view.
const DECAL_CELL = 0.05;
const DECAL_PAINT = { soc: [0.93, 0.93, 0.86], vuot: [0.03, 0.03, 0.04], sao: [1, 0.8, 0.14], caro: [0.95, 0.95, 0.95], caroDark: [0.04, 0.04, 0.05] };
function decalPattern(kind, hl, hw) {
  const R = Math.min(hl, hw * 1.15) * 0.95;
  if (kind === 'soc') return (x, z) => (Math.abs(x) < hl * 0.92 && Math.abs(z) > 0.12 * hw && Math.abs(z) < 0.34 * hw ? DECAL_PAINT.soc : null);
  if (kind === 'vuot') {
    const th = 0.55, ct = Math.cos(th), st = Math.sin(th), L = Math.min(hl, hw * 1.7) * 0.82;
    return (x, z) => {
      const t = x * ct + z * st, d = -x * st + z * ct;
      for (let k = -1; k <= 1; k++) { const lim = 0.075 * (1 - (t / L) * (t / L)) + 0.012; if (Math.abs(t) < L && Math.abs(d - k * hw * 0.42) < lim) return DECAL_PAINT.vuot; }
      return null;
    };
  }
  if (kind === 'sao') {
    const pts = []; for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? R * 0.42 : R; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return (x, z) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if ((pts[i][1] > z) !== (pts[j][1] > z) && x < (pts[j][0] - pts[i][0]) * (z - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]) inside = !inside;
      return inside ? DECAL_PAINT.sao : null;
    };
  }
  if (kind === 'caro') {
    const c = 0.1;
    return (x, z) => (Math.abs(x) < hl * 0.9 && Math.abs(z) < c * 2 ? ((Math.floor(x / c) + Math.floor(z / c)) & 1 ? DECAL_PAINT.caroDark : DECAL_PAINT.caro) : null);
  }
  return null;
}

const decalCache = new Map();
function decalGeos(key, kind, geos) {
  const id = key + '|' + kind;
  if (decalCache.has(id)) return decalCache.get(id);
  const srcs = [[geos.hull, 1], [geos.turret, 2]].filter((s) => s[0]);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [g] of srcs) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { x0 = Math.min(x0, p.getX(i)); x1 = Math.max(x1, p.getX(i)); z0 = Math.min(z0, p.getZ(i)); z1 = Math.max(z1, p.getZ(i)); } }
  const cs = DECAL_CELL, nx = Math.ceil((x1 - x0) / cs) + 1, nz = Math.ceil((z1 - z0) / cs) + 1;
  const H = new Float32Array(nx * nz).fill(-1), O = new Uint8Array(nx * nz);
  for (const [g, own] of srcs) {
    const p = g.attributes.position;
    for (let i = 0; i + 2 < p.count; i += 3) {
      const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i), bx = p.getX(i + 1), by = p.getY(i + 1), bz = p.getZ(i + 1), cx = p.getX(i + 2), cy = p.getY(i + 2), cz = p.getZ(i + 2);
      const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      if (area >= -1e-7) continue;
      const gx0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cs)), gx1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / cs));
      const gz0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / cs)), gz1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - z0) / cs));
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
        const px = x0 + gx * cs, pz = z0 + gz * cs;
        const w0 = ((bx - px) * (cz - pz) - (cx - px) * (bz - pz)) / area, w1 = ((cx - px) * (az - pz) - (ax - px) * (cz - pz)) / area, w2 = 1 - w0 - w1;
        if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
        const y = w0 * ay + w1 * by + w2 * cy, k = gz * nx + gx;
        if (y > H[k]) { H[k] = y; O[k] = own; }
      }
    }
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, pat = decalPattern(kind, (x1 - x0) / 2, (z1 - z0) / 2);
  const out = { 1: { p: [], c: [] }, 2: { p: [], c: [] } };
  for (let gz = 0; gz < nz - 1; gz++) for (let gx = 0; gx < nx - 1; gx++) {
    const col = pat(x0 + (gx + 0.5) * cs - cx, z0 + (gz + 0.5) * cs - cz);
    if (!col) continue;
    const k = gz * nx + gx, ks = [k, k + 1, k + nx, k + nx + 1];
    if (ks.some((q) => H[q] < 0 || O[q] !== O[k])) continue;
    const ys = ks.map((q) => H[q]);
    if (Math.max(...ys) - Math.min(...ys) > 0.09) continue;
    const X0 = x0 + gx * cs, Z0 = z0 + gz * cs, X1 = X0 + cs, Z1 = Z0 + cs, e = 0.012, o = out[O[k]];
    const v = [[X0, ys[0] + e, Z0], [X0, ys[2] + e, Z1], [X1, ys[1] + e, Z0], [X1, ys[1] + e, Z0], [X0, ys[2] + e, Z1], [X1, ys[3] + e, Z1]];
    for (const q of v) { o.p.push(q[0], q[1], q[2]); o.c.push(col[0], col[1], col[2]); }
  }
  const mk = (o) => {
    if (!o.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
    const n = new Float32Array(o.p.length); for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    g.computeBoundingSphere();
    return g;
  };
  const res = { hull: mk(out[1]), turret: mk(out[2]) };
  decalCache.set(id, res);
  return res;
}

export function makeMechs(G, tex) {
  const group = new THREE.Group();
  const low = G.quality.name === 'low';
  const baseMat = tex.material('metal', { reflect: 1.1 });
  const decalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const ringGeo = new THREE.PlaneGeometry(2.3, 2.3).rotateX(-Math.PI / 2);
  const aimGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([1.15, 0, -0.09, 1.15, 0, 0.09, 4.2, 0, 0], 3));
  const bubbleGeo = new THREE.IcosahedronGeometry(1, 4);
  const markMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.12, 0.08), toneMapped: false, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const markRing = new THREE.RingGeometry(0.84, 1, 40).rotateX(-Math.PI / 2), markTick = new THREE.BoxGeometry(0.36, 0.02, 0.08), markDot = new THREE.CircleGeometry(0.1, 10).rotateX(-Math.PI / 2);
  const views = new Map(), zviews = new Map(), pool = [];

  function makeMark() {
    const g = new THREE.Group(), ring = new THREE.Mesh(markRing, markMat);
    g.add(ring, new THREE.Mesh(markDot, markMat));
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(markTick, markMat); t.rotation.y = i * Math.PI / 2; t.position.set(Math.cos(i * Math.PI / 2) * 0.66, 0, -Math.sin(i * Math.PI / 2) * 0.66); g.add(t); }
    g.traverse((o) => { o.renderOrder = 9; });
    return g;
  }

  function build(key, team, paintKey, glowKey, decalKey, form = 2) {
    const def = MECHS[key] || BOSSES[key];
    const st = styleFor(key, def.tint);
    const trimHex = PAINTS[paintKey] && PAINTS[paintKey].color !== null ? PAINTS[paintKey].color : st.trim;
    const gc = GLOWS[glowKey] && GLOWS[glowKey].color != null ? new THREE.Color(GLOWS[glowKey].color) : new THREE.Color(st.glow);
    const paint = formPaint(st.body, form), deep = new THREE.Color(st.deep);
    const { b, info } = buildModel(key, st, paint, new THREE.Color(trimHex), deep, form);
    const geos = b.build();
    const glowBase = gc.clone().multiplyScalar(3.3).addScalar(0.55);
    // Rim light in the lamp colour, strong at form III so an upgraded mech reads from the match camera.
    // Steel-style tanks keep it low: their matte two-tone paint is what reads, a strong rim turns them back into toys.
    const rimBase = gc.clone().multiplyScalar([0.12, 0.22, 0.6][Math.max(1, Math.min(3, form)) - 1] * (STEEL_DESIGNS[key] ? 0.4 : 1)), rim = rimBase.clone();
    const mat = mechMaterial(baseMat, rim, glowBase.clone(), low), mats = [mat];
    const flame = new THREE.MeshBasicMaterial({ color: gc.clone().multiplyScalar(1.9).addScalar(0.5), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    // Flames that carry their own colour ramp in vertex colours (ornate.js aura); flickers with the flame batch.
    const ember = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const root = new THREE.Group(), body = new THREE.Group(), hull = new THREE.Group(), turret = new THREE.Group();
    hull.rotation.order = 'YZX';
    const S = (info.S || 1) * FORM_SCALE[Math.max(1, Math.min(3, form)) - 1];
    body.scale.setScalar(S);
    const add = (parent, g, m, cast) => {
      if (!g) return null;
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = cast; mesh.receiveShadow = cast && !low;
      parent.add(mesh); return mesh;
    };
    add(hull, geos.hull, mat, true); add(hull, geos.flame, flame, false); add(hull, geos.ember, ember, false);
    add(turret, geos.turret, mat, true); add(turret, geos.tflame, flame, false);
    const legs = [];
    for (const [i, L] of (info.legs || []).entries()) {
      const g = geos['leg' + i]; if (!g) continue;
      const pivot = new THREE.Group(); pivot.position.fromArray(L.p); pivot.rotation.y = L.yaw || 0;
      const leg = add(pivot, g, mat, !low);
      hull.add(pivot); legs.push({ spec: L, pivot, mesh: leg });
    }
    const parts = [];
    for (const P of info.parts || []) {
      const parent = P.on === 'turret' ? turret : hull, g = geos[P.name];
      if (!g) continue;
      const pm = P.own ? mechMaterial(baseMat, rim, glowBase.clone(), low) : mat;
      if (P.own) mats.push(pm);
      const part = { spec: P, angle: 0, spinV: 0, mat: P.own ? pm : null };
      if (P.at) {
        const im = new THREE.InstancedMesh(g, pm, P.at.length);
        im.castShadow = !low; im.frustumCulled = false;
        parent.add(im); part.inst = [im];
      } else {
        const pivot = new THREE.Group();
        if (P.p) { pivot.position.fromArray(P.p); if (P.model) g.translate(-P.p[0], -P.p[1], -P.p[2]); }
        add(pivot, g, pm, !low && P.kind !== 'spin');
        parent.add(pivot); part.pivot = pivot; part.base = pivot.position.clone();
        if (P.kind === 'slash') { part.trail = slashTrail(P, gc); parent.add(part.trail); }
      }
      parts.push(part);
    }
    const decals = [];
    if (decalKey && DECALS[decalKey] && decalKey !== 'goc') {
      const dg = decalGeos(key, decalKey, geos);
      for (const [g, parent] of [[dg.hull, hull], [dg.turret, turret]]) if (g) { const m = new THREE.Mesh(g, decalMat); m.frustumCulled = false; parent.add(m); decals.push(m); }
    }
    body.add(hull, turret); root.add(body);
    return { root, body, hull, turret, legs, parts, mat, mats, rim, rimBase, glow: mat.userData.glow.value, flame, ember, glowBase, gcol: gc.clone().multiplyScalar(1 / Math.max(gc.r, gc.g, gc.b, 1e-3)), info, def, S, geos, decals,
      dStance: 0, dCharge: 0, dArmor: 0, dRage: 0 };
  }

  function disposeView(v) {
    v.root.parent && v.root.parent.remove(v.root);
    for (const g of Object.values(v.geos)) g.dispose();
    for (const m of v.mats) m.dispose();
    for (const p of v.parts) { if (p.inst) for (const im of p.inst) im.dispose(); if (p.trail) { p.trail.geometry.dispose(); p.trail.material.dispose(); } }
    v.flame.dispose(); v.ember.dispose();
    if (v.ring) v.ring.material.dispose();
    if (v.aura) { v.auraMat.dispose(); for (const g of v.auraGeos) g.dispose(); }
    if (v.bubble) v.bubble.material.dispose();
    if (v.aim) v.aim.material.dispose();
  }

  // A mech view with its ground ring and shield bubble. `mine` gives the white own-mech ring and the aim line.
  function makeView(key, team, paint, glow, decal, radius, mine, form) {
    const v = build(key, team, paint, glow, decal, form);
    v.mech = key; v.team = team; v.paint = paint; v.glowKey = glow; v.decalKey = decal; v.form = form;
    v.ring = new THREE.Mesh(ringGeo, ringMaterial());
    v.ring.material.uniforms.uColor.value.copy(mine ? new THREE.Color(1.5, 1.5, 1.5) : new THREE.Color(TEAMS[team].color).multiplyScalar(1.6));
    v.ring.material.uniforms.uMine.value = mine ? 1 : 0;
    v.ring.scale.setScalar(radius * 1.28); v.ring.position.y = 0.06; v.ring.renderOrder = 2;
    v.root.add(v.ring);
    // Form aura on the ground in the lamp colour: one thin ring at II, a thicker ring with six turning ticks at III.
    if (form >= 2) {
      const col = v.gcol.clone().multiplyScalar(form === 3 ? 2.2 : 1.4);
      const am = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: form === 3 ? 0.85 : 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      v.aura = new THREE.Group(); v.auraMat = am; v.auraGeos = [];
      const addA = (g) => { v.auraGeos.push(g); const me = new THREE.Mesh(g, am); me.renderOrder = 2; v.aura.add(me); };
      addA(new THREE.RingGeometry(1.0, form === 3 ? 1.09 : 1.04, 56).rotateX(-Math.PI / 2));
      if (form === 3) {
        addA(new THREE.RingGeometry(1.16, 1.19, 56).rotateX(-Math.PI / 2));
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; addA(new THREE.PlaneGeometry(0.22, 0.07).rotateX(-Math.PI / 2).rotateY(-a).translate(Math.cos(a) * 1.13, 0, Math.sin(a) * 1.13)); }
      }
      // Wider than the hull (about 1.5 model units from the centre to the nose), so it shows round the body from above.
      v.aura.scale.setScalar(Math.max(radius * 1.5, 1.6 * v.S)); v.aura.position.y = 0.065;
      v.root.add(v.aura);
    }
    if (mine) {
      v.aim = new THREE.Mesh(aimGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
      v.aim.position.y = 0.07; v.aim.renderOrder = 2; v.aim.scale.setScalar(Math.max(1, radius * 1.1)); v.root.add(v.aim);
    }
    v.bubble = new THREE.Mesh(bubbleGeo, shieldMaterial());
    v.bubble.scale.setScalar(radius * 1.62); v.bubble.position.y = radius * 0.95; v.bubble.visible = false; v.bubble.renderOrder = 5;
    v.root.add(v.bubble);
    v.kick = 0; v.flash = 0; v.walk = 0; v.spawn = 1; v.wasAlive = false;
    v.move = 0; v.speedS = 0; v.accel = 0; v.bank = 0; v.die = 0; v.shown = false; v.ghostOn = false;
    return v;
  }

  function view(u) {
    let v = views.get(u.id);
    const form = BOSSES[u.mech] ? 3 : formOf(u.lv);
    if (v && v.mech === u.mech && v.team === u.color && v.paint === u.paint && v.glowKey === u.glow && v.decalKey === u.decal && v.form === form) return v;
    if (v) disposeView(v);
    v = makeView(u.mech, u.color, u.paint, u.glow, u.decal, u.radius, u.id === G.me, form);
    v.headingV = u.heading; v.lastX = u.x; v.lastZ = u.z;
    group.add(v.root); views.set(u.id, v);
    return v;
  }

  function resetLook(v) {
    for (const m of v.mats) m.color.setScalar(1);
    v.flame.visible = true; v.ember.visible = true;
    v.body.position.set(0, 0, 0); v.body.rotation.set(0, 0, 0); v.turret.rotation.set(0, 0, 0);
  }

  function setEmissive(v, r, g, b) { for (const m of v.mats) m.emissive.setRGB(r, g, b); }

  function setGhost(v, on, opacity) {
    if (v.ghostOn === on && v.opacity === opacity) return;
    v.ghostOn = on; v.opacity = opacity;
    for (const m of v.mats) { m.opacity = opacity; m.transparent = opacity < 1; m.depthWrite = !on; m.needsUpdate = true; }
    for (const d of v.decals) d.visible = !on && opacity === 1;
  }

  // Own-material parts (pulsing emitters) follow the model's glow, times a per-design factor.
  function ownGlow(v, time) {
    for (const p of v.parts) {
      if (!p.mat) continue;
      const g = p.mat.userData.glow.value;
      g.copy(v.glow);
      if (p.spec.kind === 'pulse') g.multiplyScalar((0.7 + 0.4 * Math.sin(time * 3.2)) * (1 + v.dArmor * 2.4));
    }
  }

  function drives(v, u, dt) {
    v.dStance = toward(v.dStance, u.stance ? 1 : 0, dt / 0.3);
    v.dArmor = toward(v.dArmor, u.armorT > 0 ? 1 : 0, dt / 0.2);
    v.dRage = toward(v.dRage, u.rageT > 0 ? 1 : 0, dt / 0.25);
    const cm = u.def && u.def.weapon && u.def.weapon.charge ? u.def.weapon.charge.max : 0;
    v.dCharge = cm ? clamp01(u.charge / cm) : 0;
  }

  function animate(v, u, dt, time, moved) {
    const info = v.info, speed = moved / Math.max(dt, 1e-3);
    const prev = v.speedS;
    drives(v, u, dt);
    v.speedS += (speed - v.speedS) * Math.min(1, dt * 8);
    v.accel += ((v.speedS - prev) / Math.max(dt, 1e-3) - v.accel) * Math.min(1, dt * 6);
    v.move += (Math.min(1, speed / 2.5) - v.move) * Math.min(1, dt * 6);
    let dh = u.heading - v.headingV; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
    const turn = dh * Math.min(1, dt * 12);
    v.headingV += turn;
    v.bank += (Math.max(-0.12, Math.min(0.12, turn / Math.max(dt, 1e-3) * v.speedS * 0.012)) - v.bank) * Math.min(1, dt * 5);
    v.hull.rotation.y = -v.headingV;
    const legsN = v.legs.length, cyc = TAU / (info.stride || 2.4);
    let bob;
    if (info.hover) bob = Math.sin(time * 2.6 + u.id) * 0.06 + 0.1;
    else if (legsN) bob = Math.abs(Math.sin(v.walk * cyc * (legsN === 2 ? 1 : 2))) * 0.05 * v.move + Math.sin(time * 1.7 + u.id) * 0.012 * (1 - v.move);
    else bob = Math.sin(time * 30 + u.id) * 0.006 * v.move + Math.sin(time * 1.4 + u.id) * 0.008;
    v.hull.position.y = bob;
    v.hull.rotation.z = Math.max(-0.07, Math.min(0.07, v.accel * (info.hover ? 0.012 : 0.006)));
    v.hull.rotation.x = v.bank * (info.hover ? 2.2 : legsN ? 0.6 : 0.35);
    v.turret.rotation.y = -u.aim;
    v.kick = Math.max(0, v.kick - dt * 7);
    const k = v.kick * v.kick * 0.12;
    v.turret.position.set(-Math.cos(u.aim) * k, bob, -Math.sin(u.aim) * k);
    for (const L of v.legs) {
      const s = L.spec, ph = v.walk * cyc + s.ph, sn = Math.sin(ph), cs = Math.cos(ph);
      if (s.kind === 'swing') { L.mesh.rotation.z = -sn * s.amp * v.move; L.mesh.position.y = Math.max(0, cs) * s.lift * v.move; }
      else if (s.kind === 'slide') { L.mesh.position.x = sn * s.amp * v.move; L.mesh.position.y = Math.max(0, cs) * s.lift * v.move; }
      else { L.pivot.rotation.y = s.yaw + sn * s.amp * v.move; L.mesh.rotation.z = Math.max(0, cs) * s.lift * v.move; }
    }
    for (const p of v.parts) {
      const s = p.spec;
      if (s.kind === 'spin' || s.kind === 'roll') {
        if (s.kind === 'roll') p.angle = -v.walk / s.r;
        else if (s.by === 'fire') { p.spinV = Math.max(0, p.spinV - dt * 30); p.angle += p.spinV * dt; }
        else p.angle += s.rate * (1 + ((s.rage || 1) - 1) * v.dRage) * dt;
      }
      if (p.inst) {
        Q.setFromAxisAngle(AXIS[s.axis || 'y'], p.angle);
        for (const im of p.inst) {
          for (let i = 0; i < s.at.length; i++) {
            const sc = s.kind === 'pulse' ? 1 + 0.1 * Math.sin(time * 3.2 + i * 1.57) + v.dArmor * 0.32 : 1;
            im.setMatrixAt(i, M4.compose(V3.fromArray(s.at[i]), Q, V3S.set(sc, sc, sc)));
          }
          im.instanceMatrix.needsUpdate = true;
        }
        continue;
      }
      const pv = p.pivot;
      if (s.kind === 'spin' || s.kind === 'roll') { pv.rotation[s.axis] = p.angle; if (s.bob) pv.position.y = p.base.y + Math.sin(time * 2 + u.id) * s.bob; }
      else if (s.kind === 'recoil') { const d = s.dir || [-1, 0, 0], r = v.kick * v.kick * s.amt; pv.position.set(p.base.x + d[0] * r, p.base.y + d[1] * r, p.base.z + d[2] * r); }
      else if (s.kind === 'tread') pv.position.x = (v.walk % s.step);
      else if (s.kind === 'slash') slashPose(p, pv, dt);
      else if (s.kind === 'deploy') {
        const d = s.by === 'charge' ? v.dCharge : s.by === 'armor' ? v.dArmor : v.dStance, e = d * d * (3 - 2 * d);
        pv.rotation[s.axis] = s.a0 + (s.a1 - s.a0) * e;
        if (s.d0) pv.position.set(p.base.x + s.d0[0] + (s.d1[0] - s.d0[0]) * e, p.base.y + s.d0[1] + (s.d1[1] - s.d0[1]) * e, p.base.z + s.d0[2] + (s.d1[2] - s.d0[2]) * e);
      } else if (s.kind === 'snap') pv.rotation[s.axis] = s.a0 + s.amt * clamp01(v.kick * 1.6) + Math.sin(time * 1.7 + u.id) * 0.05;
      else if (s.kind === 'sway') {
        const sw = Math.sin(time * 1.3 + u.id) * s.amp * (1 - v.move * 0.5) + Math.sin(v.walk * 3) * s.amp * 0.5 * v.move;
        if (s.axis === 'z') { pv.rotation.z = sw * 0.6 + v.accel * -0.02; pv.rotation.x = Math.sin(time * 1.1 + u.id) * s.amp * 0.5; }
        else { pv.rotation.y = sw; pv.rotation.z = -v.kick * 0.35; }
      }
    }
    const fl = 0.75 + Math.random() * 0.35 + v.move * 0.4;
    v.flame.color.copy(v.glowBase).multiplyScalar(0.55 * fl); v.ember.color.setScalar(0.7 + fl * 0.4);
  }

  function sync(m, alpha, dt, time) {
    const myTeam = m.units[G.me] ? m.units[G.me].team : 0;
    const seen = new Set();
    for (const u of m.units) {
      const v = view(u); seen.add(u.id);
      if (!u.alive && v.die > 0 && v.shown) {
        v.die = Math.max(0, v.die - dt);
        const t = 1 - v.die / 0.9;
        v.root.visible = v.die > 0;
        v.body.position.y = -t * t * 0.9 * v.S;
        v.body.rotation.z = t * 0.22; v.body.rotation.x = t * 0.12 * (u.id % 2 ? 1 : -1);
        v.turret.position.y = Math.sin(Math.min(1, t * 1.6) * Math.PI) * 0.7;
        v.turret.rotation.z = t * 0.7;
        for (const mt of v.mats) mt.color.setScalar(1 - t * 0.8);
        setEmissive(v, 1.2 * (1 - t), 0.35 * (1 - t), 0.05 * (1 - t));
        v.glow.copy(v.glowBase).multiplyScalar(Math.max(0, 1 - t * 4)); ownGlow(v, time); v.flame.visible = false; v.ember.visible = false; v.bubble.visible = false;
        if (v.mark) v.mark.visible = false;
        v.ring.material.uniforms.uFade.value = 1 - t;
        if (v.aura) v.aura.visible = false;
        if (!v.root.visible) v.shown = false;
        v.wasAlive = false;
        continue;
      }
      const show = u.alive && visibleTo(m, u, myTeam);
      v.root.visible = show; v.shown = show;
      if (!show) { v.wasAlive = u.alive; continue; }
      if (!v.wasAlive) { v.spawn = 0; v.wasAlive = true; v.lastX = u.x; v.lastZ = u.z; v.die = 0; resetLook(v); v.ring.material.uniforms.uFade.value = 1; if (v.aura) v.aura.visible = true; }
      const x = u.px + (u.x - u.px) * alpha, z = u.pz + (u.z - u.pz) * alpha;
      const moved = Math.hypot(x - v.lastX, z - v.lastZ); v.lastX = x; v.lastZ = z;
      v.walk += moved;
      v.spawn = Math.min(1, v.spawn + dt * 2.5);
      v.root.position.set(x, 0, z);
      v.root.scale.setScalar(0.4 + 0.6 * (1 - (1 - v.spawn) * (1 - v.spawn)));
      // A transform that grows the hitbox (transform.size) grows the model with it, eased over a few frames.
      const grow = u.def && u.def.radius ? u.radius / u.def.radius : 1;
      v.grow = (v.grow || 1) + (grow - (v.grow || 1)) * Math.min(1, dt * 6);
      v.body.scale.setScalar(v.S * v.grow);
      animate(v, u, dt, time, moved);
      v.flash = Math.max(0, v.flash - dt * 6);
      const stun = u.stunT > 0 ? 0.25 + 0.2 * Math.sin(time * 30) : 0;
      const fl = v.flash * v.flash, ch = v.dCharge, ar = v.dArmor;
      const cp = ch > 0.98 ? 0.75 + 0.25 * Math.sin(time * 18) : 1;
      setEmissive(v, fl * 1.1 + stun + v.gcol.r * 0.3 * ch * cp + ar * 0.04, fl * 0.95 + stun + v.gcol.g * 0.3 * ch * cp + ar * 0.07, fl * 0.8 + stun * 0.4 + v.gcol.b * 0.3 * ch * cp + ar * 0.12);
      v.rim.copy(v.rimBase).lerp(ARMOR_RIM, ar);
      const boost = 1 + fl * 1.5 + (1 - v.spawn) * 2.5 + ch * 2.2 * cp + v.dRage * 0.6 + ar * 0.5;
      v.glow.copy(v.glowBase).multiplyScalar(boost);
      ownGlow(v, time);
      const ghost = hidden(u);
      setGhost(v, ghost, ghost ? 0.45 : 1);
      const sh = u.shield > 0 || u.invulnT > 0;
      v.bubble.visible = sh;
      if (sh) {
        const un = v.bubble.material.uniforms;
        un.uTime.value = time; un.uHit.value = Math.max(0, un.uHit.value - dt * 5);
        if (u.invulnT > 0 && u.shield <= 0) un.uColor.value.setRGB(1, 1, 1); else un.uColor.value.set(TEAMS[u.color].color).lerp(new THREE.Color(1, 0.9, 0.4), 0.3);
      }
      if (u.markT > 0) {
        if (!v.mark) { v.mark = makeMark(); v.root.add(v.mark); }
        const pulse = 1 + 0.08 * Math.sin(time * 9);
        v.mark.visible = true; v.mark.rotation.y = time * 1.8;
        v.mark.scale.setScalar(Math.max(0.9, u.radius * 1.15) * pulse);
        v.mark.position.y = v.info.height * v.S + 0.35;
      } else if (v.mark) v.mark.visible = false;
      if (v.aim) v.aim.rotation.y = -u.aim;
      const ru = v.ring.material.uniforms;
      ru.uTime.value = time; ru.uAim.value = u.aim;
      if (v.aura) v.aura.rotation.y = time * (v.form === 3 ? 0.9 : 0.4);
    }
    for (const [id, v] of views) if (!seen.has(id)) { disposeView(v); views.delete(id); }
    syncDecoys(m, dt, time, myTeam);
  }

  // A decoy is a copy of its owner's model. Its own team sees a hologram, the enemy sees a real-looking mech.
  function decoyView(z, o) {
    const sig = [o.mech, z.color, o.paint || '', o.glow || '', o.decal || ''].join('|');
    let i = pool.findIndex((p) => p.sig === sig), v;
    if (i >= 0) { v = pool.splice(i, 1)[0]; resetLook(v); } else {
      v = makeView(o.mech, z.color, o.paint, o.glow, o.decal, o.radius, false);
      v.sig = sig; v.proxy = { id: 100000 + z.id, heading: z.aim, aim: z.aim };
      group.add(v.root);
    }
    v.proxy.id = 100000 + z.id;
    v.headingV = z.aim; v.sx = z.x; v.sz = z.z; v.lastX = z.x; v.lastZ = z.z; v.walk = 0; v.spawn = 0; v.speedS = 0; v.move = 0; v.kick = 0; v.ghostOn = false; v.opacity = 1;
    v.dStance = v.dCharge = v.dArmor = v.dRage = 0;
    setGhost(v, false, 1);
    v.root.visible = true;
    return v;
  }

  function releaseDecoy(v) {
    v.root.visible = false;
    if (pool.length < 4) pool.push(v); else disposeView(v);
  }

  function syncDecoys(m, dt, time, myTeam) {
    const seen = new Set();
    for (const z of m.zones || []) {
      if (z.kind !== 'decoy') continue;
      const o = m.units[z.owner];
      if (!o) continue;
      seen.add(z.id);
      let v = zviews.get(z.id);
      if (!v) { v = decoyView(z, o); zviews.set(z.id, v); }
      const ghost = z.team === myTeam, f = Math.min(1, dt * 22);
      v.sx += (z.x - v.sx) * f; v.sz += (z.z - v.sz) * f;
      const moved = Math.hypot(v.sx - v.lastX, v.sz - v.lastZ); v.lastX = v.sx; v.lastZ = v.sz;
      v.walk += moved;
      v.spawn = Math.min(1, v.spawn + dt * 2.5);
      v.root.position.set(v.sx, 0, v.sz);
      v.root.scale.setScalar(0.4 + 0.6 * (1 - (1 - v.spawn) * (1 - v.spawn)));
      v.proxy.heading = v.proxy.aim = z.aim;
      animate(v, v.proxy, dt, time, moved);
      setGhost(v, ghost, ghost ? 0.4 : 1);
      v.ring.visible = !ghost;
      if (v.aura) v.aura.visible = !ghost;
      if (ghost) {
        const hp = 0.85 + 0.15 * Math.sin(time * 6);
        setEmissive(v, 0.02, 0.2 * hp, 0.3 * hp);
        v.rim.copy(HOLO).multiplyScalar(0.9);
        v.glow.copy(HOLO).multiplyScalar(2.2);
      } else {
        setEmissive(v, 0, 0, 0);
        v.rim.copy(v.rimBase);
        v.glow.copy(v.glowBase).multiplyScalar(1 + (1 - v.spawn) * 2.5);
      }
      ownGlow(v, time);
      const ru = v.ring.material.uniforms;
      ru.uTime.value = time; ru.uAim.value = z.aim;
    }
    for (const [id, v] of zviews) if (!seen.has(id)) { zviews.delete(id); releaseDecoy(v); }
  }

  function event(e) {
    if (e.t === 'hit') { const a = views.get(e.by); if (a) slashHit(a, e, G.gfx && G.gfx.fx, a.gcol); }
    const v = views.get(e.id);
    if (!v) return;
    if (e.t === 'fire' || e.t === 'skill') slashStart(v, e);
    if (e.t === 'fire') {
      v.kick = 1;
      for (const p of v.parts) if (p.spec.by === 'fire') p.spinV = Math.min(40, p.spinV + (p.spec.kick || 22));
    } else if (e.t === 'hit') { v.flash = Math.min(1, 0.45 + e.amt / 500); if (e.absorbed) v.bubble.material.uniforms.uHit.value = 1; }
    else if (e.t === 'death') v.die = 0.9;
  }

  // Muzzle position in world space, for flashes: the barrel tip of the model, scaled like the model.
  function muzzle(u, side, out) {
    const v = views.get(u.id), S = v ? v.S : 1, len = v ? v.info.muzzle * S : u.radius;
    const c = Math.cos(u.aim), s = Math.sin(u.aim);
    return out.set(u.x + c * len - s * side, v ? (v.info.muzzleY + v.hull.position.y) * S : 1.55, u.z + s * len + c * side);
  }

  function clear() {
    for (const v of views.values()) disposeView(v);
    for (const v of zviews.values()) disposeView(v);
    for (const v of pool) disposeView(v);
    views.clear(); zviews.clear(); pool.length = 0;
  }

  // Renders one mech alone into a square data URL, for menus and the HUD. Fourth argument: a size, or { glow, decal, size }.
  const shots = {};
  // A still pose for menus: turret a little off the hull, deployable parts folded, instanced parts at their rest spots.
  function pose(v) {
    v.turret.rotation.y = -0.5; v.hull.rotation.y = -0.15;
    for (const p of v.parts) {
      const s = p.spec;
      if (p.inst) for (const im of p.inst) { for (let i = 0; i < s.at.length; i++) im.setMatrixAt(i, M4.makeTranslation(s.at[i][0], s.at[i][1], s.at[i][2])); }
      else if (s.kind === 'deploy') p.pivot.rotation[s.axis] = s.a0;
      else if (s.kind === 'snap') p.pivot.rotation[s.axis] = s.a0;
    }
  }
  function portrait(key, team, paintKey, opt) {
    const o = typeof opt === 'number' ? { size: opt } : opt || {}, size = o.size || 128;
    const form = o.form || 2, id = [key, team, paintKey || '', o.glow || '', o.decal || '', size, form].join('|');
    if (shots[id]) return shots[id];
    const r = G.renderer, v = build(key, team, paintKey, o.glow, o.decal, form), scene = new THREE.Scene();
    scene.environment = G.scene.environment;
    scene.add(v.root, new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(-2, 5, 3); scene.add(sun);
    pose(v);
    const box = new THREE.Box3().setFromObject(v.root), c = box.getCenter(new THREE.Vector3()), rad = box.getSize(new THREE.Vector3()).length() * 0.5;
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 80), dir = new THREE.Vector3(4.6, 5.0, 5.6).normalize();
    cam.position.copy(c).addScaledVector(dir, rad / Math.sin(15 * Math.PI / 180) * 0.8); cam.lookAt(c);
    const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
    const prev = r.getRenderTarget(), col = new THREE.Color(), a = r.getClearAlpha();
    r.getClearColor(col); r.setClearColor(0x000000, 0);
    r.setRenderTarget(rt); r.clear(); r.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    r.readRenderTargetPixels(rt, 0, 0, size, size, px);
    r.setRenderTarget(prev); r.setClearColor(col, a);
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    rt.dispose(); disposeView(v);
    return (shots[id] = cv.toDataURL());
  }

  // The tank select screen's turning model on its lit pedestal. It is drawn by the main renderer into the rectangle of the canvas under
  // the stage element (no second GL context: the baked textures and the environment live in the main one). One mech, a handful of draws.
  function showcase() {
    const scene = new THREE.Scene();
    scene.environment = G.scene.environment;
    scene.add(new THREE.HemisphereLight(0xdceaff, 0x1a2a55, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6); sun.position.set(-3, 6, 5); scene.add(sun);
    const back = new THREE.DirectionalLight(0x6fc8ff, 1.6); back.position.set(3, 3, -5); scene.add(back);
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(120,210,255,1)'); grd.addColorStop(0.45, 'rgba(60,150,255,.45)'); grd.addColorStop(1, 'rgba(30,90,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    // The menu's CSS background (css/ui.css, #ui .menu), painted on the whole canvas while the menu itself is transparent.
    const bg = new THREE.Scene();
    bg.background = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      g.setTransform(0.75 * 256, 0, 0, 0.85 * 256, 128, 0.38 * 256);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      grd.addColorStop(0, '#17428c'); grd.addColorStop(0.58, '#0b2353'); grd.addColorStop(1, '#061430');
      g.fillStyle = grd; g.fillRect(-2, -2, 4, 4);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const own = [bg.background];
    const keep = (x) => { own.push(x); return x; };
    const ped = new THREE.Group();
    const steel = keep(new THREE.MeshStandardMaterial({ color: 0x1b2d52, metalness: 0.7, roughness: 0.38 }));
    const top = keep(new THREE.MeshStandardMaterial({ color: 0x24406f, metalness: 0.55, roughness: 0.5 }));
    const lit = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.85, 1.25), toneMapped: false }));
    const halo = keep(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.55 }));
    const add = (g, m, y) => { const mesh = new THREE.Mesh(keep(g), m); mesh.position.y = y; ped.add(mesh); return mesh; };
    add(new THREE.CylinderGeometry(1.08, 1.18, 0.22, 48), steel, -0.13);
    add(new THREE.CylinderGeometry(1.0, 1.04, 0.06, 48), top, -0.0);
    add(new THREE.TorusGeometry(1.07, 0.022, 6, 64).rotateX(Math.PI / 2), lit, 0.0);
    add(new THREE.TorusGeometry(1.15, 0.016, 6, 64).rotateX(Math.PI / 2), lit, -0.2);
    add(new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2), halo, -0.235);
    const wall = new THREE.Mesh(keep(new THREE.PlaneGeometry(4.4, 3.2)), keep(halo.clone()));
    wall.material.opacity = 0.22; wall.position.set(0, 1.0, -1.6); ped.add(wall);
    scene.add(ped);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
    let v = null, id = '', ang = 0.55, hold = 0, acc = 0, fit = { r: 1, y: 0.8 };
    function set(key, paint, glow, decal, form) {
      const nid = [key, paint || '', glow || '', decal || '', form].join('|');
      if (nid === id || !(MECHS[key] || BOSSES[key])) return;
      if (v) disposeView(v);
      id = nid; v = build(key, 0, paint, glow, decal, form);
      pose(v);
      // Fit to the model's form II size, so form III reads bigger on the pedestal and form I smaller.
      const box = new THREE.Box3().setFromObject(v.root), sz = box.getSize(new THREE.Vector3()), k = FORM_SCALE[1] / FORM_SCALE[Math.max(1, Math.min(3, form)) - 1];
      const foot = Math.max(sz.x, sz.z) * 0.5 * k;
      fit = { r: Math.max(foot * 1.12, sz.y * 0.62 * k, 1.1), y: Math.max(0.6, sz.y * 0.42 * k), foot };
      ped.scale.setScalar(Math.max(1.05, foot * 1.18));
      scene.add(v.root);
      acc = 1;
    }
    function turn(dx) { ang += dx; hold = 2; acc = 1; }
    // rect: the stage in CSS pixels relative to the canvas; w, h: the canvas in CSS pixels.
    function draw(r, rect, w, h, dt, fps) {
      ang += hold > 0 ? 0 : dt * 0.45; hold -= dt; acc += dt;
      if (acc < 1 / (hold > 0 ? 60 : fps || 30)) return false;
      acc = 0;
      const col = new THREE.Color(), a = r.getClearAlpha();
      r.getClearColor(col);
      r.setRenderTarget(null); r.setScissorTest(false); r.setViewport(0, 0, w, h);
      r.setClearColor(0x0b2353, 1); r.clear(); r.render(bg, cam);
      const rw = Math.max(1, Math.round(rect.width)), rh = Math.max(1, Math.round(rect.height)), x = Math.round(rect.left), y = Math.round(h - rect.bottom);
      if (v && rw > 8 && rh > 8) {
        v.root.rotation.y = ang;
        cam.aspect = rw / rh;
        const half = THREE.MathUtils.degToRad(cam.fov / 2), dist = fit.r / Math.min(Math.tan(half), Math.tan(half) * cam.aspect) * 1.5;
        cam.position.set(0, fit.y + dist * 0.36, dist); cam.lookAt(0, fit.y * 0.72, 0); cam.updateProjectionMatrix();
        r.setViewport(x, y, rw, rh); r.setScissor(x, y, rw, rh); r.setScissorTest(true);
        // keep the gradient under the stage: no clear of the viewport, only of depth
        const ac = r.autoClear; r.autoClear = false; r.clearDepth();
        r.render(scene, cam);
        r.autoClear = ac;
        r.setScissorTest(false); r.setViewport(0, 0, w, h);
      }
      r.setClearColor(col, a);
      return true;
    }
    function dispose() {
      if (v) disposeView(v);
      v = null; id = '';
      for (const x of own) x.dispose();
      glowTex.dispose();
    }
    return { set, turn, draw, dispose };
  }

  return { group, sync, event, muzzle, clear, portrait, showcase, views };
}
