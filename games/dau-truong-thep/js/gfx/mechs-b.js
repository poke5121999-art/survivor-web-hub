// Designs for Hồ Ly, Đom Đóm, Tắc Kè and Hỏa Long. Same contract as DESIGNS in mechs.js: each function fills the
// builder's batches and returns the info row. `h` is the helper bag mechs.js passes in.
import * as THREE from '../../vendor/three.module.min.js';

export function designsB(h) {
  const { sk, lit, flame, side, limb, vent, bolts, hazard, line, DARK, GUN, STEEL, PALE, HAZ, BLACK, RUB, X, TAU } = h;
  const ring = (r, t, seg = 24) => new THREE.TorusGeometry(r, t, 4, seg);

  return {
    // Slim hover skiff: pointed hull, canted tail fins, spinning holo dish on a pylon, three hover pads blowing flame.
    holy(b, paint, trim, deep) {
      sk(b, 'dark', DARK).prism([[1.32, 0], [0.9, 0.3], [0.2, 0.44], [-0.7, 0.38], [-1.04, 0.2], [-1.04, -0.2], [-0.7, -0.38], [0.2, -0.44], [0.9, -0.3]], 0.5, 0.8, 0.06);
      sk(b, 'paint', paint).prism([[1.12, 0], [0.8, 0.22], [0.15, 0.34], [-0.6, 0.3], [-0.9, 0.14], [-0.9, -0.14], [-0.6, -0.3], [0.15, -0.34], [0.8, -0.22]], 0.8, 0.92, 0.05);
      sk(b, 'paint', deep).push().move(0.15, 0.93, 0).chamfer(0.8, 0.05, 0.22, 0.02).pop();
      sk(b, 'glass', trim).push().move(0.55, 0.96, 0).scale(1.5, 0.6, 0.8).ball(0.2, 1).pop();
      lit(b, () => { for (const sz of [-1, 1]) b.push().move(0.1, 0.65, sz * 0.435).box(1.5, 0.03, 0.02).pop(); b.push().move(1.36, 0.65, 0).box(0.03, 0.03, 0.18).pop(); });
      for (const x of [-0.2, -0.55]) line(b, x, 0.925, 0, 0.02, 0.5);
      b.push().move(-0.62, 0.935, 0); vent(b, 0.4, 0.42, 4); b.pop();
      bolts(b, [[0.4, 0.93, 0.18], [0.4, 0.93, -0.18], [-0.35, 0.93, 0.24], [-0.35, 0.93, -0.24]], 0.02);
      for (const sz of [-1, 1]) {
        b.push().move(0, 0, sz * 0.3).rotX(sz * 0.3);
        sk(b, 'paint', deep); side(b, [[-0.45, 0.8], [-1.0, 1.55], [-1.32, 1.5], [-1.12, 0.86]], -0.025, 0.025, 0.01);
        lit(b, () => b.push().move(-1.18, 1.0, sz * 0.001).rotZ(1.0).box(0.5, 0.025, 0.06).pop());
        b.pop();
        sk(b, 'dark', GUN).push().move(-1.02, 0.66, sz * 0.2).rotZ(X).lathe([[0.1, 0], [0.12, 0.1], [0.09, 0.2]], 8).pop();
        flame(b, () => b.push().move(-1.2, 0.66, sz * 0.2).rotZ(X).cyl(0.09, 0.01, 0.3, 6).pop());
        sk(b, 'paint', trim).push().move(0.7, 0.62, sz * 0.36).rotY(sz * -0.35).chamfer(0.5, 0.05, 0.14, 0.02).pop();
      }
      for (const [x, z] of [[0.7, 0.28], [0.7, -0.28], [-0.4, 0]]) {
        sk(b, 'dark', GUN).push().move(x, 0.44, z).cyl(0.2, 0.26, 0.1, 10).pop();
        sk(b, 'steel', STEEL).push().move(x, 0.385, z).cyl(0.18, 0.18, 0.02, 10).pop();
        flame(b, () => b.push().move(x, 0.25, z).cyl(0.2, 0.03, 0.34, 8).pop());
      }
      lit(b, () => { for (const [x, z] of [[0.7, 0.28], [0.7, -0.28], [-0.4, 0]]) b.push().move(x, 0.5, z).geo(ring(0.255, 0.014, 14).rotateX(Math.PI / 2)).pop(); });
      sk(b, 'dark', GUN).push().move(-0.3, 0.92, 0).cyl(0.1, 0.14, 0.4, 8).pop();
      b.use('turret');
      sk(b, 'dark', GUN).push().move(0.35, 0.96, 0).cyl(0.2, 0.24, 0.1, 10).pop();
      sk(b, 'paint', paint).push().move(0.42, 1.08, 0).chamfer(0.5, 0.2, 0.34, 0.05).pop();
      for (const sz of [-1, 1]) {
        sk(b, 'steel', STEEL).push().move(0.9, 1.08, sz * 0.09).rotZ(X).cyl(0.035, 0.045, 0.62, 6).pop();
        lit(b, () => b.push().move(1.22, 1.08, sz * 0.09).rotZ(X).cyl(0.05, 0.05, 0.02, 6).pop());
      }
      lit(b, () => b.push().move(0.42, 1.19, 0).box(0.36, 0.02, 0.06).pop());
      sk(b, 'dark', GUN).rod([0.3, 1.18, 0.12], [0.1, 1.5, 0.12], 0.012, 4);
      lit(b, () => b.push().move(0.1, 1.51, 0.12).ball(0.03, 0).pop());
      b.use('dish');
      sk(b, 'steel', STEEL).push().move(-0.3, 1.14, 0).scale(1.3, 1, 1.3).lathe([[0.03, 0], [0.3, 0.1], [0.38, 0.17], [0.36, 0.18], [0.28, 0.12], [0.03, 0.05]], 14).pop();
      sk(b, 'dark', GUN).push().move(-0.3, 1.14, 0).cyl(0.05, 0.05, 0.3, 6).pop();
      lit(b, () => {
        b.push().move(-0.3, 1.31, 0).geo(ring(0.46, 0.022, 24).rotateX(Math.PI / 2)).pop();
        b.push().move(-0.3, 1.5, 0).ball(0.06, 1).pop();
      });
      sk(b, 'steel', STEEL);
      for (let k = 0; k < 3; k++) { const a = k * TAU / 3; b.rod([-0.3, 1.3, 0], [-0.3 + Math.cos(a) * 0.4, 1.46, Math.sin(a) * 0.4], 0.012, 4); }
      return { muzzle: 1.34, muzzleY: 1.08, S: 0.95, height: 1.7, hover: true,
        parts: [{ name: 'dish', on: 'turret', kind: 'spin', axis: 'y', by: 'time', rate: 3.2, p: [-0.3, 1.14, 0], model: true }] };
    },

    // Small egg-shaped medic pod: lit cross on the flanks, tall mast with a lantern, two drones circling the mast.
    domdom(b, paint, trim, deep) {
      sk(b, 'dark', DARK).lathe([[0, 0.42], [0.34, 0.44], [0.62, 0.56], [0.68, 0.72]], 16);
      sk(b, 'paint', paint).lathe([[0.68, 0.72], [0.7, 0.84], [0.6, 1.0], [0.34, 1.12], [0, 1.16]], 16);
      sk(b, 'paint', deep).lathe([[0.64, 0.64], [0.69, 0.72], [0.69, 0.76], [0.64, 0.7]], 16);
      lit(b, () => {
        b.push().move(0, 0.8, 0).geo(ring(0.705, 0.022, 28).rotateX(Math.PI / 2)).pop();
        b.push().move(0, 0.43, 0).cyl(0.36, 0.38, 0.03, 12).pop();
        for (const sz of [-1, 1]) {
          b.push().move(0.05, 0.96, sz * 0.5).rotY(sz * -0.3).box(0.28, 0.07, 0.02).pop();
          b.push().move(0.05, 0.96, sz * 0.5).rotY(sz * -0.3).box(0.07, 0.28, 0.02).pop();
        }
      });
      for (const sz of [-1, 1]) {
        sk(b, 'paint', trim).push().move(-0.15, 0.9, sz * 0.74).rotX(sz * 0.7).chamfer(0.55, 0.05, 0.24, 0.02).pop();
        sk(b, 'dark', GUN).push().move(-0.62, 0.76, sz * 0.3).rotZ(X).lathe([[0.1, 0], [0.12, 0.12], [0.09, 0.2]], 8).pop();
        flame(b, () => b.push().move(-0.8, 0.76, sz * 0.3).rotZ(X).cyl(0.09, 0.012, 0.3, 6).pop());
        lit(b, () => b.push().move(-0.15, 1.0, sz * 0.84).rotX(sz * 0.7).box(0.5, 0.012, 0.03).pop());
      }
      for (let i = 0; i < 3; i++) {
        const a = i * TAU / 3 + 0.5, x = Math.cos(a) * 0.33, z = Math.sin(a) * 0.33;
        sk(b, 'dark', GUN).push().move(x, 0.4, z).cyl(0.13, 0.16, 0.08, 8).pop();
        flame(b, () => b.push().move(x, 0.22, z).cyl(0.14, 0.02, 0.32, 6).pop());
      }
      line(b, 0.2, 1.165, 0, 0.5, 0.02); line(b, -0.45, 1.16, 0, 0.02, 0.6);
      sk(b, 'steel', STEEL).push().move(-0.35, 1.16, 0).cyl(0.14, 0.18, 0.1, 8).pop();
      sk(b, 'steel', STEEL).rod([-0.35, 1.2, 0], [-0.35, 3.0, 0], 0.035, 6, 0.05);
      for (const y of [1.6, 2.2, 2.7]) sk(b, 'dark', GUN).push().move(-0.35, y, 0).cyl(0.06, 0.06, 0.07, 6).pop();
      lit(b, () => { for (const y of [1.6, 2.2]) b.push().move(-0.35, y, 0).cyl(0.062, 0.062, 0.02, 6).pop(); });
      sk(b, 'steel', STEEL).push().move(-0.35, 3.0, 0).cyl(0.2, 0.08, 0.06, 8).pop();
      sk(b, 'glass', trim).push().move(-0.35, 3.18, 0).ball(0.2, 1, 1.25).pop();
      lit(b, () => b.push().move(-0.35, 3.18, 0).ball(0.12, 1).pop().push().move(-0.35, 3.0, 0).geo(ring(0.15, 0.015, 12).rotateX(Math.PI / 2)).pop());
      sk(b, 'steel', STEEL).push().move(-0.35, 3.4, 0).cyl(0.02, 0.1, 0.08, 6).pop();
      for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + 0.78; b.rod([-0.35 + Math.cos(a) * 0.17, 3.02, Math.sin(a) * 0.17], [-0.35 + Math.cos(a) * 0.05, 3.38, Math.sin(a) * 0.05], 0.01, 4); }
      b.use('turret');
      sk(b, 'dark', GUN).push().move(0.3, 1.14, 0).cyl(0.26, 0.3, 0.08, 10).pop();
      sk(b, 'paint', paint).push().move(0.3, 1.26, 0).scale(1.2, 0.8, 1).ball(0.24, 1).pop();
      lit(b, () => b.push().move(0.3, 1.34, 0).box(0.3, 0.025, 0.05).pop());
      sk(b, 'dark', DARK).push().move(0.62, 1.26, 0).rotZ(X).lathe([[0.1, -0.12], [0.1, 0.1], [0.15, 0.14], [0.15, 0.24], [0.1, 0.26]], 10).pop();
      lit(b, () => { b.push().move(0.74, 1.26, 0).rotZ(X).cyl(0.145, 0.145, 0.03, 10).pop(); b.push().move(0.88, 1.26, 0).rotZ(X).cyl(0.09, 0.09, 0.02, 10).pop(); });
      sk(b, 'steel', STEEL).push().move(0.9, 1.26, 0).rotZ(X).cyl(0.05, 0.08, 0.1, 6).pop();
      b.use('drones');
      for (const s of [-1, 1]) {
        b.push().move(-0.35 + s * 0.72, 2.05, 0).rotY(s > 0 ? 0 : Math.PI).scale(1.5);
        sk(b, 'paint', paint).push().scale(1.2, 0.8, 1).ball(0.12, 1).pop();
        sk(b, 'dark', GUN).push().move(0, 0.1, 0).cyl(0.035, 0.035, 0.06, 6).pop();
        sk(b, 'steel', STEEL).push().move(0, 0.13, 0).geo(ring(0.14, 0.012, 12).rotateX(Math.PI / 2)).pop();
        lit(b, () => b.push().move(0.1, 0, 0).ball(0.04, 0).pop().push().move(0, -0.09, 0).cyl(0.05, 0.05, 0.02, 6).pop());
        flame(b, () => b.push().move(0, -0.2, 0).cyl(0.04, 0.005, 0.18, 5).pop());
        b.pop();
      }
      return { muzzle: 0.95, muzzleY: 1.26, S: 0.95, height: 3.5, hover: true,
        parts: [{ name: 'drones', on: 'hull', kind: 'spin', axis: 'y', by: 'time', rate: 2.4, p: [-0.35, 0, 0], model: true, bob: 0.08 }] };
    },

    // Six-wheeled buggy: roll cage, swing-arm wheels, a tilted rail rack feeding a spinning saw-disc, spare discs in a rear tube.
    tacke(b, paint, trim, deep) {
      sk(b, 'dark', DARK).prism([[1.1, 0.4], [1.28, 0.22], [1.28, -0.22], [1.1, -0.4], [-1.1, -0.46], [-1.3, -0.3], [-1.3, 0.3], [-1.1, 0.46]], 0.4, 0.74, 0.06);
      for (const sz of [-1, 1]) {
        sk(b, 'paint', paint).push().move(0.1, 0.78, sz * 0.5).chamfer(2.1, 0.1, 0.3, 0.03).pop();
        sk(b, 'paint', deep).push().move(0.1, 0.62, sz * 0.5).chamfer(2.1, 0.1, 0.06, 0.02).pop();
        lit(b, () => b.push().move(0.1, 0.57, sz * 0.5).box(1.9, 0.025, 0.02).pop());
        line(b, 0.1, 0.835, sz * 0.5, 1.7, 0.02);
        for (const x of [-0.85, 0, 0.85]) {
          sk(b, 'steel', STEEL).rod([x, 0.55, sz * 0.38], [x, 0.36, sz * 0.7], 0.035, 6);
          sk(b, 'paint', trim).push().move(x, 0.78, sz * 0.82).rotX(sz * 0.2).chamfer(0.56, 0.05, 0.3, 0.02).pop();
        }
        sk(b, 'steel', STEEL).rod([0.7, 0.82, sz * 0.52], [0.3, 1.5, sz * 0.4], 0.03, 6);
        sk(b, 'steel', STEEL).rod([-0.9, 0.82, sz * 0.5], [-0.8, 1.5, sz * 0.4], 0.03, 6);
        sk(b, 'steel', STEEL).rod([0.3, 1.5, sz * 0.4], [-0.8, 1.5, sz * 0.4], 0.028, 6);
        lit(b, () => b.push().move(1.31, 0.58, sz * 0.14).box(0.04, 0.08, 0.14).pop());
      }
      sk(b, 'steel', STEEL).rod([0.3, 1.5, 0.4], [0.3, 1.5, -0.4], 0.028, 6);
      sk(b, 'steel', STEEL).rod([-0.8, 1.5, 0.4], [-0.8, 1.5, -0.4], 0.028, 6);
      sk(b, 'paint', HAZ).push().move(1.31, 0.45, 0).box(0.07, 0.1, 0.8).pop();
      sk(b, 'paint', paint).prism([[1.0, 0.3], [1.1, 0], [1.0, -0.3], [0.2, -0.3], [0.2, 0.3]], 0.74, 0.86, 0.04);
      line(b, 0.7, 0.865, 0, 0.5, 0.02);
      b.push().move(-0.85, 0.755, 0); vent(b, 0.6, 0.6, 5); b.pop();
      sk(b, 'steel', STEEL).push().move(-1.42, 0.62, 0).rotZ(X).cyl(0.2, 0.2, 0.36, 10).pop();
      sk(b, 'dark', GUN).push().move(-1.42, 0.62, 0).rotZ(X).cyl(0.14, 0.14, 0.4, 8).pop();
      lit(b, () => { b.push().move(-1.6, 0.62, 0).rotZ(X).cyl(0.12, 0.12, 0.02, 8).pop(); b.push().move(-1.3, 0.62, 0).rotZ(X).geo(ring(0.2, 0.014, 12).rotateX(Math.PI / 2)).pop(); });
      for (const z of [-0.14, 0.14]) {
        sk(b, 'dark', GUN).push().move(-1.15, 0.86, z).rotZ(0.4).cyl(0.05, 0.06, 0.22, 6).pop();
        flame(b, () => b.push().move(-1.2, 0.98, z).rotZ(0.4).cyl(0.01, 0.06, 0.18, 6).pop());
      }
      bolts(b, [[1.0, 0.87, 0.2], [1.0, 0.87, -0.2], [0.3, 0.87, 0.2], [0.3, 0.87, -0.2]], 0.02);
      b.use('wheel');
      sk(b, 'rubber', RUB).push().rotX(X).cyl(0.34, 0.34, 0.3, 14).pop();
      sk(b, 'rubber', BLACK);
      for (let k = 0; k < 10; k++) b.push().rotZ(k * TAU / 10).move(0.335, 0, 0).box(0.07, 0.12, 0.32).pop();
      sk(b, 'paint', trim).push().rotX(X).cyl(0.2, 0.2, 0.32, 10).pop();
      sk(b, 'dark', GUN);
      for (const sz of [-1, 1]) {
        b.push().move(0, 0, sz * 0.165).rotX(X).cyl(0.09, 0.11, 0.03, 6).pop();
        for (let k = 0; k < 5; k++) b.push().rotZ(k * TAU / 5).move(0.14, 0, sz * 0.165).rotX(X).cyl(0.022, 0.022, 0.025, 5).pop();
      }
      lit(b, () => { for (const sz of [-1, 1]) b.push().move(0, 0, sz * 0.18).rotX(X).cyl(0.05, 0.05, 0.02, 6).pop(); });
      b.use('turret');
      const T = 0.38;
      sk(b, 'dark', GUN).push().move(-0.1, 0.9, 0).cyl(0.5, 0.56, 0.08, 14).pop();
      sk(b, 'paint', paint).push().move(-0.2, 1.04, 0).chamfer(0.8, 0.22, 0.7, 0.05).pop();
      lit(b, () => b.push().move(-0.2, 1.16, 0).box(0.5, 0.02, 0.05).pop());
      b.push().move(-0.2, 1.17, 0.22); vent(b, 0.26, 0.2, 3); b.pop();
      for (const sz of [-1, 1]) {
        b.push().move(-0.1, 1.2, sz * 0.26).rotZ(T);
        sk(b, 'steel', STEEL).box(2.0, 0.05, 0.05);
        sk(b, 'paint', trim).push().move(0.3, -0.07, 0).chamfer(1.2, 0.05, 0.08, 0.015).pop();
        sk(b, 'dark', GUN).push().move(-0.9, 0.1, 0).chamfer(0.1, 0.34, 0.1, 0.02).pop();
        sk(b, 'dark', GUN).push().move(0.9, 0.1, 0).chamfer(0.1, 0.34, 0.1, 0.02).pop();
        b.pop();
      }
      b.push().move(-0.1, 1.2, 0).rotZ(T);
      sk(b, 'steel', STEEL);
      for (let k = 0; k < 5; k++) {
        b.push().move(-0.75 + k * 0.2, 0.19, 0).rotX(X).cyl(0.19, 0.19, 0.05, 14).pop();
        lit(b, () => b.push().move(-0.75 + k * 0.2, 0.19, 0).rotX(X).cyl(0.08, 0.08, 0.055, 8).pop());
      }
      b.pop();
      b.push().move(-0.1, 1.2, 0).rotZ(T).move(-0.05, 0.1, 0).rotY(0.0);
      sk(b, 'dark', DARK).push().move(-0.82, -0.04, 0).chamfer(0.14, 0.2, 0.4, 0.03).pop();
      b.pop();
      b.use('feed');
      sk(b, 'dark', DARK).push().move(0, 0, 0).chamfer(0.12, 0.2, 0.34, 0.03).pop();
      lit(b, () => b.push().move(0.07, 0, 0).box(0.02, 0.06, 0.2).pop());
      b.use('disc');
      sk(b, 'steel', STEEL).rotX(X).cyl(0.3, 0.3, 0.05, 16);
      sk(b, 'paint', trim);
      for (let k = 0; k < 8; k++) b.push().rotZ(k * TAU / 8).move(0.31, 0, 0).rotZ(0.5).box(0.09, 0.07, 0.05).pop();
      sk(b, 'dark', GUN).push().rotX(X).cyl(0.14, 0.14, 0.07, 10).pop();
      lit(b, () => { b.push().rotX(X).cyl(0.08, 0.08, 0.08, 8).pop(); b.push().rotX(X).geo(ring(0.22, 0.012, 16)).pop(); });
      const dx = Math.cos(T), dy = Math.sin(T), at = [-0.1 + dx * 1.15, 1.2 + dy * 1.15, 0];
      return { muzzle: at[0] + 0.25, muzzleY: at[1], S: 1, height: 1.9,
        parts: [
          { name: 'wheel', on: 'hull', kind: 'roll', axis: 'z', r: 0.34, at: [-0.85, 0, 0.85].flatMap((x) => [[x, 0.34, 0.82], [x, 0.34, -0.82]]) },
          { name: 'disc', on: 'turret', kind: 'spin', axis: 'z', by: 'time', rate: 9, p: at },
          { name: 'feed', on: 'turret', kind: 'recoil', amt: 0.3, p: [-0.1 - dx * 0.85, 1.2 - dy * 0.85 + 0.08, 0], dir: [-dx, -dy, 0] },
        ] };
    },

    // Long low lancer on two tracks: a lens array on the back (spinning focus rings), lit heat-sink fins, a long recoiling lance.
    hoalong(b, paint, trim, deep) {
      for (const sz of [-1, 1]) {
        const zi = sz * 0.5, zo = sz * 0.98;
        sk(b, 'rubber', RUB); side(b, [[-1.7, 0.3], [-1.5, 0.04], [1.5, 0.04], [1.72, 0.32], [1.5, 0.58], [-1.5, 0.58]], Math.min(zi, zo), Math.max(zi, zo), 0.03);
        for (let i = 0; i < 6; i++) {
          const x = -1.25 + i * 0.5;
          sk(b, 'steel', STEEL).push().move(x, 0.28, sz * 0.99).rotX(X).cyl(0.17, 0.17, 0.04, 10).pop();
          sk(b, 'dark', GUN).push().move(x, 0.28, sz * 1.01).rotX(X).cyl(0.06, 0.08, 0.04, 6).pop();
        }
        sk(b, 'paint', paint).push().move(0, 0.64, sz * 0.74).chamfer(3.1, 0.08, 0.5, 0.025).pop();
        sk(b, 'paint', deep).push().move(0, 0.46, sz * 1.0).chamfer(2.8, 0.2, 0.05, 0.02).pop();
        lit(b, () => b.push().move(0, 0.46, sz * 1.03).box(2.3, 0.03, 0.02).pop());
        bolts(b, [-1.0, -0.4, 0.2, 0.8].map((x) => [x, 0.69, sz * 0.9]), 0.02);
        b.use('tread'); sk(b, 'dark', GUN);
        for (let x = -1.0; x <= 1.01; x += 0.2) b.push().move(x, 0.585, sz * 0.74).box(0.08, 0.04, 0.42).pop();
        b.use('hull');
      }
      sk(b, 'dark', DARK).prism([[1.8, 0.3], [1.95, 0.12], [1.95, -0.12], [1.8, -0.3], [-1.6, -0.52], [-1.78, -0.36], [-1.78, 0.36], [-1.6, 0.52]], 0.3, 0.8, 0.06);
      sk(b, 'paint', paint).prism([[1.55, 0.26], [1.7, 0.1], [1.7, -0.1], [1.55, -0.26], [0.5, -0.46], [0.5, 0.46]], 0.8, 0.94, 0.05);
      sk(b, 'paint', deep).push().move(1.3, 0.96, 0).chamfer(0.5, 0.04, 0.3, 0.015).pop();
      lit(b, () => { b.push().move(1.95, 0.55, 0).box(0.03, 0.05, 0.2).pop(); b.push().move(1.1, 0.95, 0).box(0.7, 0.025, 0.03).pop(); });
      sk(b, 'steel', STEEL).push().move(1.1, 0.96, 0.18).cyl(0.07, 0.07, 0.04, 6).pop();
      bolts(b, [[1.5, 0.95, 0.2], [1.5, 0.95, -0.2], [0.7, 0.95, 0.35], [0.7, 0.95, -0.35]], 0.02);
      for (let i = 0; i < 7; i++) {
        const x = -0.2 - i * 0.2;
        for (const sz of [-1, 1]) {
          sk(b, 'steel', STEEL).push().move(x, 1.02, sz * 0.5).chamfer(0.05, 0.4, 0.2, 0.01).pop();
          lit(b, () => b.push().move(x, 1.17, sz * 0.5).box(0.054, 0.025, 0.2).pop());
        }
      }
      sk(b, 'dark', GUN); for (const sz of [-1, 1]) b.push().move(-0.8, 0.9, sz * 0.5).box(1.6, 0.05, 0.24).pop();
      sk(b, 'dark', GUN).push().move(-1.75, 0.58, 0).chamfer(0.2, 0.26, 0.7, 0.03).pop();
      for (const sz of [-1, 1]) {
        sk(b, 'dark', GUN).push().move(-1.86, 0.58, sz * 0.22).rotZ(X).lathe([[0.1, 0], [0.12, 0.1], [0.09, 0.2]], 8).pop();
        flame(b, () => b.push().move(-2.04, 0.58, sz * 0.22).rotZ(X).cyl(0.09, 0.012, 0.3, 6).pop());
      }
      b.use('turret');
      sk(b, 'dark', GUN).push().move(-0.2, 0.96, 0).cyl(0.62, 0.68, 0.1, 14).pop();
      sk(b, 'paint', paint).prism([[0.7, 0.2], [0.5, 0.45], [-0.3, 0.5], [-0.9, 0.36], [-0.9, -0.36], [-0.3, -0.5], [0.5, -0.45], [0.7, -0.2]], 1.0, 1.28, 0.07);
      lit(b, () => { for (const sz of [-1, 1]) b.push().move(0.0, 1.285, sz * 0.38).box(0.8, 0.02, 0.04).pop(); });
      for (const sz of [-1, 1]) {
        sk(b, 'paint', deep); side(b, [[-0.9, 1.0], [-0.2, 1.0], [-0.4, 1.7], [-0.86, 1.75]], sz * 0.4 - 0.05, sz * 0.4 + 0.05, 0.02);
        sk(b, 'steel', STEEL).rod([-0.1, 1.22, sz * 0.4], [-0.38, 1.6, sz * 0.4], 0.03, 6);
        bolts(b, [[-0.5, 1.6, sz * 0.46], [-0.7, 1.55, sz * 0.46]], 0.02);
      }
      sk(b, 'dark', DARK).push().move(0.25, 1.6, 0).chamfer(0.3, 0.34, 0.36, 0.04).pop();
      sk(b, 'dark', GUN).push().move(0.28, 1.28, 0).chamfer(0.34, 0.2, 0.5, 0.03).pop();
      lit(b, () => b.push().move(0.1, 1.6, 0).box(0.02, 0.18, 0.22).pop());
      b.push().move(-0.5, 1.29, 0); vent(b, 0.3, 0.4, 4); b.pop();
      b.use('prism');
      const cx = -0.62, cy = 1.7;
      sk(b, 'steel', STEEL).push().move(cx, cy, 0).rotZ(X).cyl(0.1, 0.1, 0.8, 8).pop();
      sk(b, 'glass', trim).push().move(-0.6, cy, 0).scale(1.7, 0.9, 0.9).ball(0.2, 0).pop();
      lit(b, () => b.push().move(-0.6, cy, 0).scale(1.7, 0.9, 0.9).ball(0.12, 0).pop());
      for (const [x, r] of [[-0.82, 0.62], [-0.6, 0.52], [-0.38, 0.42]]) {
        sk(b, 'steel', STEEL).push().move(x, cy, 0).geo(ring(r, 0.035, 20).rotateY(Math.PI / 2)).pop();
        sk(b, 'glass', trim).push().move(x, cy, 0).rotZ(X).cyl(r - 0.03, r - 0.03, 0.03, 18).pop();
        lit(b, () => b.push().move(x + 0.02, cy, 0).geo(ring(r - 0.05, 0.016, 20).rotateY(Math.PI / 2)).pop());
      }
      sk(b, 'paint', trim);
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6; b.push().move(-0.6, cy, 0).rotX(a).move(0, 0.5, 0).chamfer(0.5, 0.06, 0.04, 0.01).pop(); }
      lit(b, () => b.push().move(-0.2, cy, 0).rotZ(X).cyl(0.07, 0.07, 0.04, 8).pop());
      b.use('lance');
      const bx = 0.4;
      sk(b, 'steel', STEEL).push().move(bx, cy, 0).rotZ(X).lathe([[0.17, 0], [0.17, 0.2], [0.12, 0.26], [0.1, 0.4], [0.1, 2.2], [0.14, 2.24], [0.14, 2.4], [0.1, 2.44], [0.07, 2.6]], 10).pop();
      for (const x of [0.9, 1.4, 1.9, 2.4]) {
        sk(b, 'paint', trim).push().move(bx + x - 0.3, cy, 0).rotZ(X).cyl(0.16, 0.16, 0.06, 10).pop();
        lit(b, () => b.push().move(bx + x - 0.3, cy, 0).geo(ring(0.165, 0.012, 14).rotateY(Math.PI / 2)).pop());
      }
      sk(b, 'dark', DARK).push().move(bx + 1.3, cy - 0.16, 0).box(1.9, 0.04, 0.1).pop();
      lit(b, () => { b.push().move(bx + 2.62, cy, 0).rotZ(X).cyl(0.06, 0.06, 0.02, 8).pop(); b.push().move(bx + 1.3, cy + 0.11, 0).box(1.9, 0.015, 0.025).pop(); });
      return { muzzle: bx + 2.64, muzzleY: cy, S: 1, height: 2.2,
        parts: [
          { name: 'tread', on: 'hull', kind: 'tread', step: 0.2 },
          { name: 'prism', on: 'turret', kind: 'spin', axis: 'x', by: 'time', rate: 1.6, p: [-0.6, cy, 0], model: true },
          { name: 'lance', on: 'turret', kind: 'recoil', amt: 0.35 },
        ] };
    },
  };
}
