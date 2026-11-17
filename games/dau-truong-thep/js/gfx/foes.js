// Phó bản monsters (PVE_FOES in data.js): Ong Sắt, Ụ Pháo, Xe Bộ Binh, Pháo Cối, Khiên Vệ. Same contract as DESIGNS in mechs.js:
// each fills the builder's batches and returns the info row; `h` is the helper bag mechs.js passes in. Built at their own size
// (model units ~ 1.45 x the unit radius), no role hardware added: a monster reads by its silhouette from the match camera.
import * as THREE from '../../vendor/three.module.min.js';

export function foeDesigns(h) {
  const { sk, lit, flame, side, vent, bolts, hazard, DARK, GUN, STEEL, BLACK, RUB, X, TAU } = h;
  const ring = (r, t, seg = 20) => new THREE.TorusGeometry(r, t, 4, seg);
  const oct = (r) => Array.from({ length: 8 }, (_, i) => { const a = i * TAU / 8 + TAU / 16; return [Math.cos(a) * r, Math.sin(a) * r]; });

  return {
    // Hornet drone: a hex body with two hazard bands, four rotor pods on short arms, a stinger gun under the nose, one red eye.
    ong(b, paint, trim, deep) {
      sk(b, 'dark', DARK).prism([[0.62, 0], [0.32, 0.3], [-0.42, 0.3], [-0.7, 0], [-0.42, -0.3], [0.32, -0.3]], 0.62, 0.86, 0.05);
      sk(b, 'paint', paint).prism([[0.56, 0], [0.28, 0.25], [-0.38, 0.25], [-0.62, 0], [-0.38, -0.25], [0.28, -0.25]], 0.86, 1.0, 0.04);
      for (const x of [-0.12, -0.36]) sk(b, 'paint', BLACK).push().move(x, 1.005, 0).box(0.09, 0.02, 0.46).pop();
      sk(b, 'paint', deep).push().move(-0.78, 0.8, 0).rotZ(-0.4).cyl(0.02, 0.13, 0.36, 6).pop();
      for (const [x, z] of [[0.3, 0.55], [0.3, -0.55], [-0.4, 0.55], [-0.4, -0.55]]) {
        sk(b, 'dark', GUN).rod([x * 0.6, 0.86, z * 0.35], [x, 0.92, z], 0.045, 6);
        sk(b, 'dark', DARK).push().move(x, 0.9, z).cyl(0.13, 0.15, 0.14, 8).pop();
        lit(b, () => b.push().move(x, 0.85, z).cyl(0.09, 0.09, 0.02, 8).pop());
      }
      b.use('rotor');
      sk(b, 'steel', STEEL);
      for (let k = 0; k < 2; k++) b.push().rotY(k * Math.PI / 2).box(0.5, 0.015, 0.06).pop();
      b.use('turret');
      sk(b, 'dark', GUN).push().move(0.3, 0.55, 0).ball(0.14, 1).pop();
      sk(b, 'steel', STEEL).push().move(0.55, 0.52, 0).rotZ(X).cyl(0.02, 0.06, 0.42, 6).pop();
      lit(b, () => b.push().move(0.5, 0.9, 0).ball(0.075, 1).pop());
      return { muzzle: 0.78, muzzleY: 0.52, S: 1, height: 1.15, hover: true,
        parts: [{ name: 'rotor', on: 'hull', kind: 'spin', axis: 'y', by: 'time', rate: 22, at: [[0.3, 1.0, 0.55], [0.3, 1.0, -0.55], [-0.4, 1.0, 0.55], [-0.4, 1.0, -0.55]] }] };
    },

    // Emplacement: an octagonal plinth with sandbag blocks and hazard skirt, an armoured gun house with one long barrel and a small radar.
    uphao(b, paint, trim, deep) {
      sk(b, 'dark', DARK).prism(oct(1.6), 0, 0.42, 0.06);
      sk(b, 'paint', deep).prism(oct(1.42), 0.42, 0.56, 0.04);
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + TAU / 16;
        sk(b, 'paint', 0x8a7a58).push().rotY(-a).move(1.5, 0.22, 0).chamfer(0.34, 0.3, 0.95, 0.1).pop();
      }
      b.push().move(0, 0.43, 1.42).rotY(0); hazard(b, 1.4, 0.1, 0.04, 6); b.pop();
      b.push().move(0, 0.43, -1.42); hazard(b, 1.4, 0.1, 0.04, 6); b.pop();
      bolts(b, oct(1.2).map((p) => [p[0], 0.57, p[1]]), 0.04);
      b.use('turret');
      sk(b, 'dark', GUN).push().move(0, 0.62, 0).cyl(0.95, 1.05, 0.14, 16).pop();
      sk(b, 'paint', paint).prism([[0.85, 0.48], [0.95, 0], [0.85, -0.48], [-0.6, -0.7], [-0.85, -0.45], [-0.85, 0.45], [-0.6, 0.7]], 0.69, 1.4, 0.08);
      sk(b, 'dark', DARK).push().move(-0.2, 1.5, 0).chamfer(0.8, 0.2, 0.9, 0.06).pop();
      lit(b, () => { for (const sz of [-1, 1]) b.push().move(0.2, 1.05, sz * 0.62).box(0.7, 0.05, 0.02).pop(); b.push().move(0.92, 1.12, 0).box(0.02, 0.08, 0.5).pop(); });
      sk(b, 'dark', GUN).push().move(-0.55, 1.62, 0.35).cyl(0.04, 0.05, 0.3, 6).pop();
      sk(b, 'steel', STEEL).push().move(-0.55, 1.82, 0.35).rotZ(0.6).lathe([[0.02, -0.04], [0.22, 0], [0.3, 0.08]], 10).pop();
      b.use('barrel');
      sk(b, 'steel', STEEL).push().move(0.95, 1.08, 0).rotZ(X).lathe([[0.17, 0], [0.17, 0.25], [0.13, 0.35], [0.12, 1.45], [0.16, 1.5], [0.16, 1.7]], 10).pop();
      sk(b, 'dark', DARK).push().move(2.55, 1.08, 0).chamfer(0.22, 0.3, 0.3, 0.04).pop();
      return { muzzle: 2.7, muzzleY: 1.08, S: 1, height: 2.0,
        parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.35 }] };
    },

    // Infantry tank: low tracked hull with a dozer blade, a small square turret, one short gun and a commander lamp.
    xebb(b, paint, trim, deep) {
      for (const sz of [-1, 1]) {
        const zi = sz * 0.45, zo = sz * 0.82;
        sk(b, 'rubber', RUB); side(b, [[-1.05, 0.22], [-0.9, 0.03], [0.9, 0.03], [1.08, 0.26], [0.95, 0.46], [-0.95, 0.46]], Math.min(zi, zo), Math.max(zi, zo), 0.03);
        for (let i = 0; i < 4; i++) sk(b, 'steel', STEEL).push().move(-0.66 + i * 0.44, 0.24, sz * 0.83).rotX(X).cyl(0.14, 0.14, 0.04, 10).pop();
        sk(b, 'paint', deep).push().move(0, 0.47, sz * 0.66).chamfer(2.0, 0.08, 0.36, 0.03).pop();
      }
      sk(b, 'paint', paint).prism([[1.0, 0.45], [1.15, 0.2], [1.15, -0.2], [1.0, -0.45], [-0.95, -0.45], [-0.95, 0.45]], 0.3, 0.72, 0.06);
      sk(b, 'dark', GUN).push().move(1.32, 0.3, 0).rotZ(0.35).chamfer(0.12, 0.42, 1.7, 0.03).pop();
      sk(b, 'dark', DARK); for (const sz of [-1, 1]) b.rod([1.0, 0.36, sz * 0.5], [1.25, 0.3, sz * 0.6], 0.05, 6);
      b.push().move(-0.6, 0.73, 0); vent(b, 0.5, 0.6, 4); b.pop();
      b.use('turret');
      sk(b, 'dark', GUN).push().move(0.05, 0.76, 0).cyl(0.42, 0.46, 0.08, 12).pop();
      sk(b, 'paint', paint).prism([[0.42, 0.3], [0.52, 0], [0.42, -0.3], [-0.4, -0.38], [-0.5, 0], [-0.4, 0.38]], 0.8, 1.12, 0.05);
      sk(b, 'paint', trim).push().move(-0.25, 1.15, 0.12).cyl(0.13, 0.15, 0.08, 8).pop();
      lit(b, () => b.push().move(-0.25, 1.21, 0.12).cyl(0.07, 0.07, 0.03, 8).pop());
      b.use('barrel');
      sk(b, 'steel', STEEL).push().move(0.5, 0.96, 0).rotZ(X).lathe([[0.1, 0], [0.09, 0.6], [0.12, 0.65], [0.12, 0.8]], 10).pop();
      return { muzzle: 1.32, muzzleY: 0.96, S: 1, height: 1.3,
        parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.25 }] };
    },

    // Mortar carrier: a six-wheeled flatbed with outriggers, ammo crates, and a fat mortar tube raised at 50 degrees on a ring mount.
    phaocoi(b, paint, trim, deep) {
      for (const sz of [-1, 1]) {
        for (const x of [-0.7, 0, 0.7]) {
          sk(b, 'rubber', RUB).push().move(x, 0.28, sz * 0.72).rotX(X).cyl(0.28, 0.28, 0.22, 12).pop();
          sk(b, 'steel', STEEL).push().move(x, 0.28, sz * 0.84).rotX(X).cyl(0.12, 0.12, 0.03, 8).pop();
        }
        sk(b, 'dark', GUN).rod([-0.9, 0.42, sz * 0.5], [-1.25, 0.06, sz * 1.0], 0.06, 6);
        sk(b, 'dark', DARK).push().move(-1.27, 0.04, sz * 1.02).cyl(0.16, 0.18, 0.06, 8).pop();
      }
      sk(b, 'paint', paint).prism([[1.0, 0.5], [1.15, 0.25], [1.15, -0.25], [1.0, -0.5], [-1.05, -0.5], [-1.05, 0.5]], 0.38, 0.66, 0.05);
      sk(b, 'paint', deep).push().move(0.82, 0.8, 0).chamfer(0.5, 0.3, 0.9, 0.05).pop();
      lit(b, () => b.push().move(1.08, 0.82, 0).box(0.02, 0.06, 0.6).pop());
      for (const z of [-0.28, 0.28]) sk(b, 'paint', 0x6a5a3a).push().move(-0.8, 0.78, z).chamfer(0.36, 0.24, 0.24, 0.03).pop();
      b.use('turret');
      sk(b, 'dark', GUN).push().move(-0.1, 0.7, 0).cyl(0.5, 0.55, 0.1, 14).pop();
      sk(b, 'paint', trim).push().move(-0.1, 0.85, 0).chamfer(0.5, 0.22, 0.7, 0.05).pop();
      b.use('barrel');
      sk(b, 'steel', STEEL).push().move(-0.1, 1.0, 0).rotX(X).cyl(0.26, 0.26, 0.5, 12).pop();
      sk(b, 'dark', DARK).rod([-0.25, 0.85, 0], [0.75, 2.05, 0], 0.24, 12);
      sk(b, 'steel', STEEL).rod([0.66, 1.94, 0], [0.8, 2.11, 0], 0.29, 12);
      lit(b, () => b.push().move(-0.1, 1.0, 0.27).rotX(X).cyl(0.12, 0.12, 0.02, 10).pop());
      return { muzzle: 0.75, muzzleY: 1.75, S: 1, height: 1.9,
        parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.2 }] };
    },

    // Shield guard: a heavy tracked body behind a tall curved tower shield with a lamp slit; three short barrels poke over its rim.
    khienve(b, paint, trim, deep) {
      for (const sz of [-1, 1]) {
        const zi = sz * 0.65, zo = sz * 1.15;
        sk(b, 'rubber', RUB); side(b, [[-1.3, 0.3], [-1.12, 0.04], [1.1, 0.04], [1.3, 0.32], [1.15, 0.6], [-1.15, 0.6]], Math.min(zi, zo), Math.max(zi, zo), 0.03);
        sk(b, 'paint', deep).push().move(0, 0.62, sz * 0.9).chamfer(2.4, 0.1, 0.52, 0.03).pop();
      }
      sk(b, 'paint', paint).prism([[0.9, 0.62], [1.05, 0.3], [1.05, -0.3], [0.9, -0.62], [-1.1, -0.62], [-1.1, 0.62]], 0.4, 1.05, 0.08);
      b.push().move(-0.65, 1.06, 0); vent(b, 0.6, 0.8, 4); b.pop();
      b.use('turret');
      sk(b, 'dark', GUN).push().move(-0.1, 1.08, 0).cyl(0.6, 0.66, 0.1, 14).pop();
      sk(b, 'paint', paint).prism([[0.4, 0.5], [0.5, 0], [0.4, -0.5], [-0.6, -0.55], [-0.75, 0], [-0.6, 0.55]], 1.13, 1.6, 0.06);
      // the shield: a curved slab in front of the gun house, segments of a ring
      const segs = 7, R = 1.25, span = 1.5;
      for (let i = 0; i < segs; i++) {
        const a = -span / 2 + (i + 0.5) * span / segs;
        sk(b, 'paint', i % 3 === 1 ? trim : paint).push().rotY(-a).move(R - 0.35, 1.15, 0).chamfer(0.16, 1.45, 2 * R * Math.sin(span / segs / 2) + 0.02, 0.04).pop();
      }
      sk(b, 'dark', DARK).push().move(0.92, 1.9, 0).chamfer(0.22, 0.12, 1.65, 0.04).pop();
      lit(b, () => b.push().move(1.0, 1.45, 0).box(0.03, 0.08, 1.1).pop());
      b.use('barrel');
      for (const z of [-0.32, 0, 0.32]) sk(b, 'steel', STEEL).push().move(0.4, 2.0, z).rotZ(X).lathe([[0.08, 0], [0.08, 0.7], [0.11, 0.74], [0.11, 0.86]], 8).pop();
      return { muzzle: 1.26, muzzleY: 2.0, S: 1, height: 2.45,
        parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.18 }] };
    },
  };
}
