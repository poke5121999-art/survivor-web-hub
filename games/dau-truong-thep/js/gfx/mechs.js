// Mech models built from primitives, one design per MECHS key, painted in the team colour.
// A mech is a root group holding a ground ring, a shield bubble and a body (scaled up from the sim radius) with a hull
// (turns toward movement), a turret (turns toward aim), legs and animated parts (wheels, drums, rotors, recoiling barrels).
// Models face +x, +z is the mech's right. Sim angle a maps to rotation.y = -a.

import * as THREE from '../../vendor/three.module.min.js';
import { Builder } from './builder.js';
import { TEAMS, MECHS, PAINTS, BOSSES } from '../data.js';
import { visibleTo, hidden } from '../sim.js';

const DARK = 0x2a2f37, GUN = 0x434b56, STEEL = 0xa3adba, PALE = 0xdfe6ee, HAZ = 0xe8b021, BLACK = 0x15181c, RUB = 0x1d1f23, ICE = 0xbfe6ff, LINE = 0x0e1114;
const X = -Math.PI / 2, TAU = Math.PI * 2;
// Roughness and metalness multipliers on the baked metal set (rough 0.4..0.8, metal 0.25..0.6).
const SURF = { paint: [0.75, 1.4], dark: [0.9, 1.2], steel: [0.5, 1.8], rubber: [1.6, 0], glass: [0.2, 0.5], ice: [0.3, 0.1] };

function sk(b, kind, color) { b.surface(SURF[kind][0], SURF[kind][1]); if (color !== undefined) b.tint(color); return b; }
// Team-colour lights share the mesh they sit on (surf.x < 0 marks them emissive). Flames get their own additive batch.
function lit(b, f) { const s = b.surf; b.surface(-1, 0); f(); b.surf = s; return b; }
function flame(b, f) { const m = b.mat; b.use('flame'); f(); b.use(m); return b; }
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
    return { muzzle: 2.28, muzzleY: 1.22, S: 1.25, height: 2.0,
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
    return { muzzle: 1.34, muzzleY: 1.2, S: 1.25, height: 2.1, legs, stride: 2.6,
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
    return { muzzle: 2.36, muzzleY: 1.3, S: 1.25, height: 2.0, legs, stride: 2.2,
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
    return { muzzle: 0.98, muzzleY: 1.18, S: 1.25, height: 1.8, hover: true,
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
    return { muzzle: -0.2 + dir[0] * 0.95, muzzleY: 1.3 + dir[1] * 0.95, S: 1.25, height: 2.3,
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
    return { muzzle: 1.2, muzzleY: 0.98, S: 1.25, height: 1.7, legs, stride: 2.0,
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
    return { muzzle: 1.45, muzzleY: 1.18, S: 1.25, height: 2.3,
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
    return { muzzle: 1.15, muzzleY: 1.32, S: 1.22, height: 2.1, legs, stride: 1.8,
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
};

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
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlow * lamp + uRim * (1.0 - lamp) * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);');
  };
  m.customProgramCacheKey = () => 'mech' + (low ? 'L' : '');
  return m;
}

const AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const Q = new THREE.Quaternion(), M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);

export function makeMechs(G, tex) {
  const group = new THREE.Group();
  const low = G.quality.name === 'low';
  const baseMat = tex.material('metal', { reflect: 1.1 });
  const ringGeo = new THREE.PlaneGeometry(2.3, 2.3).rotateX(-Math.PI / 2);
  const aimGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([1.15, 0, -0.09, 1.15, 0, 0.09, 4.2, 0, 0], 3));
  const bubbleGeo = new THREE.IcosahedronGeometry(1, 4);
  const views = new Map();

  function build(key, team, paintKey) {
    const def = MECHS[key] || BOSSES[key], b = new Builder(0.85);
    const trimHex = PAINTS[paintKey] && PAINTS[paintKey].color !== null ? PAINTS[paintKey].color : def.tint;
    const tc = new THREE.Color(TEAMS[team].color);
    const paint = tc.clone().multiplyScalar(0.8), deep = tc.clone().lerp(new THREE.Color(DARK), 0.62);
    b.use('hull').surface(1, 1);
    const info = DESIGNS[key](b, paint, new THREE.Color(trimHex), deep);
    const geos = b.build();
    const glowBase = tc.clone().multiplyScalar(4.2).addScalar(0.55);
    const mat = mechMaterial(baseMat, tc.clone().multiplyScalar(0.28), glowBase.clone(), low);
    const flame = new THREE.MeshBasicMaterial({ color: tc.clone().multiplyScalar(2.2).addScalar(0.5), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const root = new THREE.Group(), body = new THREE.Group(), hull = new THREE.Group(), turret = new THREE.Group();
    hull.rotation.order = 'YZX';
    const S = info.S || 1;
    body.scale.setScalar(S);
    const add = (parent, g, m, cast) => {
      if (!g) return null;
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = cast; mesh.receiveShadow = cast && !low;
      parent.add(mesh); return mesh;
    };
    add(hull, geos.hull, mat, true); add(hull, geos.flame, flame, false);
    add(turret, geos.turret, mat, true);
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
      const part = { spec: P, angle: 0, spinV: 0 };
      if (P.at) {
        const im = new THREE.InstancedMesh(g, mat, P.at.length);
        im.castShadow = !low; im.frustumCulled = false;
        parent.add(im); part.inst = [im];
      } else {
        const pivot = new THREE.Group();
        if (P.p) { pivot.position.fromArray(P.p); if (P.model) g.translate(-P.p[0], -P.p[1], -P.p[2]); }
        add(pivot, g, mat, !low && P.kind !== 'spin');
        parent.add(pivot); part.pivot = pivot; part.base = pivot.position.clone();
      }
      parts.push(part);
    }
    body.add(hull, turret); root.add(body);
    return { root, body, hull, turret, legs, parts, mat, glow: mat.userData.glow.value, flame, glowBase, info, def, S };
  }

  function view(u) {
    let v = views.get(u.id);
    if (v && v.mech === u.mech && v.team === u.color && v.paint === u.paint) return v;
    if (v) group.remove(v.root);
    v = build(u.mech, u.color, u.paint);
    v.mech = u.mech; v.team = u.color; v.paint = u.paint;
    const mine = u.id === G.me;
    v.ring = new THREE.Mesh(ringGeo, ringMaterial());
    v.ring.material.uniforms.uColor.value.copy(mine ? new THREE.Color(1.5, 1.5, 1.5) : new THREE.Color(TEAMS[u.color].color).multiplyScalar(1.6));
    v.ring.material.uniforms.uMine.value = mine ? 1 : 0;
    v.ring.scale.setScalar(u.radius * 1.28); v.ring.position.y = 0.06; v.ring.renderOrder = 2;
    v.root.add(v.ring);
    if (mine) {
      v.aim = new THREE.Mesh(aimGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
      v.aim.position.y = 0.07; v.aim.renderOrder = 2; v.aim.scale.setScalar(Math.max(1, u.radius * 1.1)); v.root.add(v.aim);
    }
    v.bubble = new THREE.Mesh(bubbleGeo, shieldMaterial());
    v.bubble.scale.setScalar(u.radius * 1.62); v.bubble.position.y = u.radius * 0.95; v.bubble.visible = false; v.bubble.renderOrder = 5;
    v.root.add(v.bubble);
    v.kick = 0; v.flash = 0; v.walk = 0; v.spawn = 1; v.headingV = u.heading; v.lastX = u.x; v.lastZ = u.z; v.wasAlive = false;
    v.move = 0; v.speedS = 0; v.accel = 0; v.bank = 0; v.die = 0; v.shown = false;
    group.add(v.root); views.set(u.id, v);
    return v;
  }

  function resetLook(v) {
    v.mat.color.setScalar(1); v.flame.visible = true;
    v.body.position.set(0, 0, 0); v.body.rotation.set(0, 0, 0); v.turret.rotation.set(0, 0, 0);
  }

  function animate(v, u, dt, time, moved) {
    const info = v.info, speed = moved / Math.max(dt, 1e-3);
    const prev = v.speedS;
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
        else p.angle += s.rate * dt;
      }
      if (p.inst) {
        Q.setFromAxisAngle(AXIS[s.axis], p.angle);
        for (const im of p.inst) { for (let i = 0; i < s.at.length; i++) im.setMatrixAt(i, M4.compose(V3.fromArray(s.at[i]), Q, ONE)); im.instanceMatrix.needsUpdate = true; }
        continue;
      }
      const pv = p.pivot;
      if (s.kind === 'spin' || s.kind === 'roll') { pv.rotation[s.axis] = p.angle; if (s.bob) pv.position.y = p.base.y + Math.sin(time * 2 + u.id) * s.bob; }
      else if (s.kind === 'recoil') { const d = s.dir || [-1, 0, 0], r = v.kick * v.kick * s.amt; pv.position.set(p.base.x + d[0] * r, p.base.y + d[1] * r, p.base.z + d[2] * r); }
      else if (s.kind === 'tread') pv.position.x = (v.walk % s.step);
      else if (s.kind === 'sway') {
        const sw = Math.sin(time * 1.3 + u.id) * s.amp * (1 - v.move * 0.5) + Math.sin(v.walk * 3) * s.amp * 0.5 * v.move;
        if (s.axis === 'z') { pv.rotation.z = sw * 0.6 + v.accel * -0.02; pv.rotation.x = Math.sin(time * 1.1 + u.id) * s.amp * 0.5; }
        else { pv.rotation.y = sw; pv.rotation.z = -v.kick * 0.35; }
      }
    }
    const fl = 0.75 + Math.random() * 0.35 + v.move * 0.4;
    v.flame.color.copy(v.glowBase).multiplyScalar(0.55 * fl);
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
        v.mat.color.setScalar(1 - t * 0.8); v.mat.emissive.setRGB(1.2 * (1 - t), 0.35 * (1 - t), 0.05 * (1 - t));
        v.glow.copy(v.glowBase).multiplyScalar(Math.max(0, 1 - t * 4)); v.flame.visible = false; v.bubble.visible = false;
        v.ring.material.uniforms.uFade.value = 1 - t;
        if (!v.root.visible) v.shown = false;
        v.wasAlive = false;
        continue;
      }
      const show = u.alive && visibleTo(m, u, myTeam);
      v.root.visible = show; v.shown = show;
      if (!show) { v.wasAlive = u.alive; continue; }
      if (!v.wasAlive) { v.spawn = 0; v.wasAlive = true; v.lastX = u.x; v.lastZ = u.z; v.die = 0; resetLook(v); v.ring.material.uniforms.uFade.value = 1; }
      const x = u.px + (u.x - u.px) * alpha, z = u.pz + (u.z - u.pz) * alpha;
      const moved = Math.hypot(x - v.lastX, z - v.lastZ); v.lastX = x; v.lastZ = z;
      v.walk += moved;
      v.spawn = Math.min(1, v.spawn + dt * 2.5);
      v.root.position.set(x, 0, z);
      v.root.scale.setScalar(0.4 + 0.6 * (1 - (1 - v.spawn) * (1 - v.spawn)));
      animate(v, u, dt, time, moved);
      v.flash = Math.max(0, v.flash - dt * 6);
      const stun = u.stunT > 0 ? 0.25 + 0.2 * Math.sin(time * 30) : 0;
      const fl = v.flash * v.flash;
      v.mat.emissive.setRGB(fl * 1.1 + stun, fl * 0.95 + stun, fl * 0.8 + stun * 0.4);
      const boost = 1 + fl * 1.5 + (1 - v.spawn) * 2.5;
      v.glow.copy(v.glowBase).multiplyScalar(boost);
      const ghost = hidden(u);
      const op = ghost ? 0.45 : 1;
      if (v.mat.opacity !== op) {
        v.mat.opacity = op; v.mat.transparent = op < 1; v.mat.needsUpdate = true;
      }
      const sh = u.shield > 0 || u.invulnT > 0;
      v.bubble.visible = sh;
      if (sh) {
        const un = v.bubble.material.uniforms;
        un.uTime.value = time; un.uHit.value = Math.max(0, un.uHit.value - dt * 5);
        if (u.invulnT > 0 && u.shield <= 0) un.uColor.value.setRGB(1, 1, 1); else un.uColor.value.set(TEAMS[u.color].color).lerp(new THREE.Color(1, 0.9, 0.4), 0.3);
      }
      if (v.aim) v.aim.rotation.y = -u.aim;
      const ru = v.ring.material.uniforms;
      ru.uTime.value = time; ru.uAim.value = u.aim;
    }
    for (const [id, v] of views) if (!seen.has(id)) { group.remove(v.root); views.delete(id); }
  }

  function event(e) {
    const v = views.get(e.id);
    if (!v) return;
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

  function clear() { for (const v of views.values()) group.remove(v.root); views.clear(); }

  // Renders one mech alone into a square data URL, for menus and the HUD.
  const shots = {};
  function portrait(key, team, paintKey, size = 128) {
    const id = key + team + (paintKey || '') + size;
    if (shots[id]) return shots[id];
    const r = G.renderer, v = build(key, team, paintKey), scene = new THREE.Scene();
    scene.environment = G.scene.environment;
    scene.add(v.root, new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(-2, 5, 3); scene.add(sun);
    v.turret.rotation.y = -0.5; v.hull.rotation.y = -0.15;
    for (const p of v.parts) if (p.inst) for (const im of p.inst) { for (let i = 0; i < p.spec.at.length; i++) im.setMatrixAt(i, M4.makeTranslation(p.spec.at[i][0], p.spec.at[i][1], p.spec.at[i][2])); }
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
    rt.dispose(); v.mat.dispose(); v.flame.dispose();
    v.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    return (shots[id] = cv.toDataURL());
  }

  return { group, sync, event, muzzle, clear, portrait, views };
}
