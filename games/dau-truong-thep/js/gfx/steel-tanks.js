// Tanks drawn in the steel style (steel.js). A key listed here opts in: buildModel (mechs.js) uses this design for
// every form instead of the hand design / frame / chassis plus role kit. Each design builds all three forms itself:
//   I  plain: hull, running gear, main weapon, a few lights, one antenna;
//   II added armour: skirts with decals, stacked cheek plates, a second antenna, more lights;
//   III heavy sci-fi refit: extra weapon modules, lit strips, three or four antennas.
// Same contract as DESIGNS in mechs.js (batches hull, turret, barrel, tread and named parts; returns the info).
import { Kit, LAMP, PI } from './steel.js';

const done = (k, info) => Object.assign(info, { parts: k.parts.concat(info.parts || []) });

export const STEEL_DESIGNS = {
  // Trâu Sắt, tank: heavy double-track hull (two tracks a side, the outer pair jutting forward), wide fenders over both,
  // low sloped hull, octagonal turret ring under a big faceted turret. One heavy ribbed gun, two at form III.
  trau(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    b.use('hull');
    for (const s of [-1, 1]) {
      k.trackPod(-0.1, s * 0.6, 2.5, 0.34, 0.6, { cover: false });
      k.trackPod(0.34, s * 0.97, 2.16, 0.32, 0.56, { cover: false, skirt: F >= 2, decal: F >= 2 ? 'x' : null, light: LAMP.green });
      // Fender spanning both tracks, panel insert on top; sloped nose plate over the outer pod.
      // Fender over the inner track only; the outer track shows its tread from above.
      k.plate(-0.02, 0.66, s * 0.6, 2.3, 0.08, 0.46, { inset: 0.1 });
      k.plate(1.38, 0.55, s * 0.97, 0.36, 0.08, 0.36, { insert: null, rz: -0.6 });
      if (F >= 2) k.decal('chev', 0.95, 0.71, s * 0.6, 0.22, '+y');
      if (F === 3) { k.plate(-0.55, 0.62, s * 0.97, 0.9, 0.08, 0.36, { col: 'panelDeep', insert: null }); k.strip(-0.35, 0.36, s * 1.2, 1.1, 'x'); }
    }
    // Hull between the inner tracks: low gunmetal body, sloped glacis with a panel insert, rear grille.
    k.prism([[1.36, 0.3], [1.46, 0.12], [1.46, -0.12], [1.36, -0.3], [-1.24, -0.42], [-1.36, -0.3], [-1.36, 0.3], [-1.24, 0.42]], 0.2, 0.68, 'under', 0.05);
    k.plate(1.18, 0.62, 0, 0.6, 0.08, 0.8, { rz: -0.42 });
    k.plate(-0.25, 0.72, 0, 1.6, 0.08, 0.82, { insert: 'panelDeep', inset: 0.1 });
    k.blk(-1.3, 0.6, 0, 0.12, 0.16, 0.6, 'dark', 0.02);
    for (const s of [-1, 1]) k.light(1.47, 0.42, s * 0.2, 0.08, F >= 2 ? LAMP.amber : LAMP.green, '+x');
    if (F >= 2) for (const s of [-1, 1]) k.light(1.47, 0.42, s * 0.06, 0.06, LAMP.red, '+x');
    if (F === 3) { k.strip(-1.37, 0.5, 0, 0.5, 'z', LAMP.red); k.plate(1.55, 0.36, 0, 0.12, 0.3, 1.0, { insert: null, rz: -0.25 }); }

    b.use('turret');
    k.oct(-0.12, 0.8, 0, 0.66, 0.1, 'dark');
    const T = [[0.62, 0.3], [0.8, 0.16], [0.8, -0.16], [0.62, -0.3], [-0.5, -0.58], [-0.86, -0.44], [-0.86, 0.44], [-0.5, 0.58]];
    k.prism(T, 0.85, 1.2, 'gun', 0.07);
    k.prism(T.map(([x, z]) => [x * 0.55 - 0.12, z * 0.6]), 1.18, 1.25, 'panel', 0.02);
    k.plate(-0.98, 1.0, 0, 0.26, 0.26, 0.8, { insert: 'panelDeep' });
    for (const s of [-1, 1]) k.light(0.72, 1.06, s * 0.28, 0.06, LAMP.green, '+x');
    if (F >= 2) for (const s of [-1, 1]) {
      k.plate(-0.06, 1.0, s * 0.62, 0.86, 0.24, 0.12, { col: 'panel', insert: null, ry: s * 0.2 });
      if (F === 3) k.plate(-0.1, 1.06, s * 0.72, 0.66, 0.2, 0.08, { col: 'gunLite', insert: null, ry: s * 0.2 });
    }
    k.oct(-0.4, 1.3, 0.26, 0.16, 0.1, 'gun'); k.light(-0.27, 1.3, 0.26, 0.05, LAMP.blue, '+x');
    k.antenna(-0.78, 1.2, -0.38, 0.9);
    if (F >= 2) k.antenna(-0.78, 1.2, 0.38, 0.75);
    if (F === 3) {
      k.antenna(-0.9, 1.15, 0, 1.0);
      k.missileBox(-0.45, 1.42, -0.28, 2, 3, 0.11, { elev: 0.15 });
      k.strip(-0.05, 1.27, 0, 0.9, 'x');
    }

    b.use('barrel');
    k.blk(0.8, 1.03, 0, 0.3, 0.32, F === 3 ? 0.62 : 0.46, 'gun', 0.05);
    const len = [1.0, 1.15, 1.25][F - 1];
    let tip = 0;
    if (F === 3) for (const z of [-0.14, 0.14]) tip = k.cannon(0.9, 1.04, z, len, 0.085, { ribs: 6, stripe: 'glow' });
    else tip = k.cannon(0.9, 1.04, 0, len, F === 1 ? 0.1 : 0.11, { ribs: F === 1 ? 3 : 5, stripe: F >= 2 ? 'glow' : null });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 1.04, S: 1, height: 2.0, parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.32 }] });
  },

  // Quan Công, bruiser: an armoured torso on a tracked base. The torso is the turret: chest, shoulder blocks, a helmet
  // with a lit visor and a chunky red crest, a rotary cannon on the right forearm and a guandao blade on the left.
  quancong(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    b.use('hull');
    for (const s of [-1, 1]) {
      k.trackPod(-0.1, s * 0.56, 2.6, 0.32, 0.6, { insert: 'panel', skirt: F >= 2, decal: F >= 2 ? 'chev' : null, light: LAMP.green });
      if (F === 3) k.strip(-0.3, 0.6, s * 0.79, 1.2, 'x');
    }
    k.prism([[1.0, 0.3], [1.1, 0.15], [1.1, -0.15], [1.0, -0.3], [-1.0, -0.44], [-1.12, -0.3], [-1.12, 0.3], [-1.0, 0.44]], 0.2, 0.66, 'under', 0.05);
    k.plate(0.85, 0.6, 0, 0.5, 0.08, 0.84, { rz: -0.45 });
    k.plate(-0.7, 0.7, 0, 0.6, 0.08, 0.8, { insert: 'panelDeep' });
    k.blk(-1.12, 0.52, 0, 0.1, 0.16, 0.6, 'dark', 0.02);
    for (const s of [-1, 1]) k.light(1.1, 0.42, s * 0.18, 0.07, LAMP.amber, '+x');
    k.oct(-0.15, 0.72, 0, 0.44, 0.1, 'dark');

    b.use('turret');
    const tx = -0.15;
    k.blk(tx, 0.92, 0, 0.5, 0.3, 0.62, 'under', 0.06);
    // Chest: gunmetal block, two sloped panel-coloured breast plates, a dark grille below.
    k.blk(tx, 1.36, 0, 0.66, 0.6, 0.86, 'gun', 0.08);
    for (const s of [-1, 1]) k.plate(tx + 0.3, 1.44, s * 0.2, 0.14, 0.4, 0.34, { col: 'panel', insert: null, rz: -0.3 });
    k.blk(tx + 0.3, 1.13, 0, 0.1, 0.16, 0.42, 'dark', 0.02);
    for (const s of [-1, 1]) k.light(tx + 0.36, 1.13, s * 0.11, 0.055, LAMP.green, '+x');
    k.plate(tx - 0.05, 1.68, 0, 0.5, 0.06, 0.7, { col: 'gun', insert: 'panel' });
    // Helmet: block, panel top, wide visor strip with two light squares, a chunky red crest running back.
    const hx = tx + 0.08;
    k.blk(hx, 1.84, 0, 0.34, 0.24, 0.34, 'gun', 0.05);
    k.plate(hx - 0.02, 1.97, 0, 0.36, 0.05, 0.36, { col: 'panel', insert: null });
    k.blk(hx + 0.17, 1.84, 0, 0.04, 0.07, 0.3, 'dark', 0.01);
    k.strip(hx + 0.195, 1.84, 0, 0.26, 'z');
    k.blk(hx - 0.06, 2.04, 0, 0.36, 0.1, 0.09, 'trim', 0.02);
    k.blk(hx - 0.24, 2.0, 0, 0.14, 0.18, 0.08, 'trim', 0.02);
    // Shoulders and arms.
    for (const s of [-1, 1]) {
      const sz = s * 0.64;
      k.plate(tx - 0.04, 1.62, sz, 0.56, 0.32, 0.42, { col: 'gun', insert: 'panel' });
      k.blk(tx - 0.04, 1.3, sz, 0.22, 0.4, 0.22, 'under', 0.04);
      k.blk(tx + 0.22, 1.1, sz, 0.6, 0.26, 0.28, 'gun', 0.05);
      k.plate(tx + 0.22, 1.24, sz, 0.48, 0.04, 0.24, { col: 'panel', insert: null });
      if (F >= 2) {
        k.plate(tx - 0.04, 1.54, s * 0.9, 0.5, 0.36, 0.1, { col: 'panel', insert: null, rx: s * -0.15 });
        k.decal('x', tx - 0.02, 1.52, s * 0.955, 0.18, s > 0 ? '+z' : '-z');
      }
      if (F === 3) { k.plate(tx - 0.04, 1.82, sz, 0.42, 0.08, 0.34, { col: 'gunLite', insert: null }); k.strip(tx - 0.04, 1.71, s * 0.86, 0.5, 'x'); }
    }
    // Left forearm: guandao pole and a flat crescent blade pointing forward, lit along its edge.
    const bz = -0.7, by = 1.1, bl = [0.9, 1.05, 1.15][F - 1];
    k.use('steel'); b.rod([tx + 0.5, by, bz], [tx + 0.5 + bl, by, bz], 0.04, 6);
    const bx = tx + 0.45 + bl;
    k.prism([[bx - 0.05, bz + 0.04], [bx + 0.5, bz + 0.02], [bx + 0.36, bz - 0.2], [bx + 0.04, bz - 0.2]], by - 0.035, by + 0.035, 'steel', 0.015);
    k.blk(bx - 0.06, by, bz, 0.1, 0.12, 0.14, 'trim', 0.02);
    k.lamp('glow', () => b.rod([bx + 0.02, by, bz + 0.05], [bx + 0.5, by, bz + 0.03], 0.016, 4));
    if (F === 3) { k.missileBox(tx - 0.42, 1.92, -0.38, 2, 3, 0.11, { elev: 0.4 }); k.sensor(tx - 0.3, 1.86, 0.4, 0.2); }
    k.antenna(tx - 0.3, 1.75, 0.22, 0.8);
    if (F >= 2) k.antenna(tx - 0.34, 1.75, -0.12, 0.65);
    if (F === 3) k.antenna(hx - 0.3, 2.06, 0, 0.55);

    // Right forearm: rotary cannon (spins while firing).
    b.use('drum');
    const gz = 0.7, gl = [0.45, 0.6, 0.7][F - 1];
    const tip = k.gatling(tx + 0.55, by, gz, gl, F === 3 ? 0.085 : 0.07, 6);
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: by, S: 1, height: 2.3,
      parts: [{ name: 'drum', on: 'turret', kind: 'spin', axis: 'x', by: 'fire', p: [tx + 0.55, by, gz], model: true }] });
  },

  // Lôi Công, artillery: wide tracked launcher. Long tracks with separate nose pods jutting forward, under-hull blue
  // light, a yoke on an octagonal ring holding an elevated missile box (2x2, 2x3, then 3x4 with a radar).
  loi(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    b.use('hull');
    for (const s of [-1, 1]) {
      k.trackPod(-0.38, s * 0.66, 1.9, 0.32, 0.56, { insert: 'panel', skirt: F >= 2, decal: F >= 2 ? 'stripe' : null });
      k.trackPod(1.02, s * 0.74, 0.62, 0.28, 0.46, { insert: null, light: LAMP.blue });
      k.beam([0.5, 0.3, s * 0.55], [0.8, 0.3, s * 0.68], 0.16, 0.14, 'under');
      if (F >= 2) k.decal('x', 1.0, 0.47, s * 0.74, 0.18, '+y');
    }
    k.prism([[0.82, 0.38], [0.96, 0.2], [0.96, -0.2], [0.82, -0.38], [-1.02, -0.56], [-1.12, -0.44], [-1.12, 0.44], [-1.02, 0.56]], 0.22, 0.66, 'under', 0.05);
    k.plate(0.72, 0.6, 0, 0.42, 0.08, 0.74, { rz: -0.5 });
    k.plate(-0.75, 0.7, 0, 0.6, 0.08, 1.0, { insert: 'panelDeep' });
    k.blk(-1.12, 0.5, 0, 0.1, 0.16, 0.7, 'dark', 0.02);
    for (const s of [-1, 1]) k.light(0.97, 0.44, s * 0.14, 0.07, LAMP.green, '+x');
    if (F >= 2) { k.strip(0.97, 0.24, 0, 0.5, 'z', LAMP.blue); for (const s of [-1, 1]) k.strip(-0.1, 0.22, s * 0.52, 1.6, 'x', LAMP.blue); }
    if (F === 3) for (const s of [-1, 1]) k.plate(-0.2, 0.68, s * 0.5, 1.2, 0.1, 0.18, { col: 'panelDeep', insert: null });

    b.use('turret');
    const tx = -0.2;
    k.oct(tx, 0.74, 0, 0.5, 0.1, 'dark');
    k.blk(tx, 0.86, 0, 0.7, 0.16, 0.72, 'gun', 0.05);
    for (const s of [-1, 1]) {
      k.plate(tx + 0.02, 1.08, s * 0.44, 0.56, 0.42, 0.08, { col: 'gun', insert: null });
      k.plate(tx + 0.02, 1.12, s * 0.49, 0.4, 0.28, 0.03, { col: 'panel', insert: null });
      k.strip(tx + 0.02, 0.96, s * 0.51, 0.4, 'x');
    }
    k.antenna(tx - 0.42, 0.95, -0.3, 0.8);
    if (F >= 2) { k.antenna(tx - 0.42, 0.95, 0.3, 0.8); k.sensor(tx - 0.3, 1.02, 0, 0.2, LAMP.green, 2); }
    if (F === 3) { k.antenna(tx - 0.46, 0.95, -0.12, 0.95); k.antenna(tx - 0.46, 0.95, 0.12, 0.95); }

    b.use('barrel');
    const [rows, cols, cell] = [[2, 2, 0.18], [2, 3, 0.17], [3, 4, 0.15]][F - 1], el = 0.5;
    const tip = k.missileBox(tx + 0.06, 1.22, 0, rows, cols, cell, { elev: el, depth: 0.5 });
    if (F >= 2) k.strip(tx - 0.1, 1.15 + rows * cell * 0.5, 0, cols * cell * 0.7, 'z');
    let parts = [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.3, dir: [-Math.cos(el), -Math.sin(el), 0] }];
    if (F === 3) {
      b.use('radar');
      k.blk(tx - 0.42, 1.06, 0, 0.08, 0.12, 0.08, 'gun', 0.02);
      k.plate(tx - 0.42, 1.16, 0, 0.1, 0.05, 0.42, { col: 'steel', insert: null });
      k.light(tx - 0.37, 1.16, 0, 0.045, LAMP.red, '+x');
      parts.push({ name: 'radar', on: 'turret', kind: 'spin', axis: 'y', by: 'time', rate: 2.2, p: [tx - 0.42, 1.06, 0], model: true });
    }
    b.use('hull');
    return done(k, { muzzle: tip[0], muzzleY: tip[1], S: 1, height: 2.2, parts });
  },

  // Bọ Cạp, flanker: compact armoured core on four track pods held out on struts (the front pair jutting forward and
  // growing pincer jaws at form II), a low twin-gun turret, and a segmented scorpion tail arching over the back.
  bocap(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    b.use('hull');
    const pods = [[0.9, 0.86, 0.82], [-0.82, 0.86, 0.76]];
    for (const [px, pz, pl] of pods) for (const s of [-1, 1]) {
      const front = px > 0;
      k.trackPod(px, s * pz, pl, 0.3, 0.46, { insert: front ? 'panel' : null, light: front ? LAMP.green : null });
      k.beam([px * 0.55, 0.62, s * 0.36], [px, 0.5, s * (pz - 0.12)], 0.14, 0.12, 'gun');
      k.use('steel'); b.rod([px * 0.5, 0.42, s * 0.36], [px * 0.95, 0.36, s * (pz - 0.14)], 0.03, 5);
      if (F >= 2) k.decal(front ? 'chev' : 'x', px, 0.53, s * pz, 0.18, '+y');
      if (F >= 2 && front) {
        // Pincer jaws ahead of the front pods.
        for (const j of [-1, 1]) k.prism([[px + 0.38, s * pz + j * 0.1], [px + 0.72, s * pz + j * 0.03], [px + 0.62, s * pz + j * 0.16], [px + 0.4, s * pz + j * 0.2]], 0.2, 0.36, j === s ? 'gun' : 'panel', 0.02);
      }
    }
    k.prism([[0.8, 0.22], [0.9, 0.08], [0.9, -0.08], [0.8, -0.22], [-0.62, -0.4], [-0.75, -0.28], [-0.75, 0.28], [-0.62, 0.4]], 0.38, 0.78, 'gun', 0.06);
    k.blk(0.05, 0.32, 0, 1.2, 0.12, 0.5, 'under', 0.03);
    k.plate(-0.25, 0.8, 0, 0.7, 0.06, 0.62, { insert: 'panel' });
    k.plate(0.72, 0.72, 0, 0.32, 0.07, 0.4, { rz: -0.5 });
    for (const s of [-1, 1]) k.light(0.91, 0.56, s * 0.08, 0.05, LAMP.red, '+x');
    if (F === 3) for (const s of [-1, 1]) { k.strip(0.0, 0.6, s * 0.38, 1.0, 'x'); k.missileBox(-0.35, 0.92, s * 0.34, 2, 2, 0.1, { elev: 0.25, depth: 0.3 }); }
    k.antenna(-0.55, 0.8, 0.18, 0.75);
    if (F >= 2) k.antenna(-0.55, 0.8, -0.18, 0.6);

    // Tail: chunky segments rising from the back and arching forward, gunmetal with panel tops, a lit stinger.
    b.use('tail');
    // Arc back and up from the rear deck, then curling forward over the body; form I stops short of the curl.
    const n = F + 3, curve = [[-0.6, 0.72], [-1.0, 0.9], [-1.18, 1.25], [-1.06, 1.58], [-0.76, 1.72], [-0.48, 1.6]], pts = [];
    const reach = [0.78, 0.9, 1][F - 1];
    for (let i = 0; i <= n; i++) {
      const u = i / n * reach * (curve.length - 1), j = Math.min(curve.length - 2, Math.floor(u)), f = u - j;
      pts.push([curve[j][0] + (curve[j + 1][0] - curve[j][0]) * f, curve[j][1] + (curve[j + 1][1] - curve[j][1]) * f, 0]);
    }
    for (let i = 0; i < n; i++) {
      const w = 0.26 - i * 0.018, a = pts[i], c = pts[i + 1];
      k.beam(a, c, w, w * 0.85, 'gun', 0.04);
      k.beam([a[0], a[1] + w * 0.42, 0], [c[0], c[1] + w * 0.42, 0], w * 0.7, 0.04, 'panel', 0.01);
    }
    // Stinger bulb and a steel barb pointing forward and down.
    const tip = pts[n];
    k.blk(tip[0], tip[1], 0, 0.24, 0.18, 0.2, 'gun', 0.05);
    k.use('steel'); b.push().move(tip[0] + 0.2, tip[1] - 0.1, 0).rotZ(-PI / 2 - 0.7).cyl(0, 0.07, 0.28, 6).pop();
    k.lamp('glow', () => b.push().move(tip[0] + 0.1, tip[1] + 0.02, 0).box(0.06, 0.06, 0.14).pop());
    if (F === 3) k.lamp('glow', () => b.push().move(tip[0] - 0.02, tip[1], 0).rotZ(PI / 2).cyl(0.13, 0.13, 0.03, 10).pop());

    b.use('turret');
    k.oct(0.15, 0.84, 0, 0.36, 0.08, 'dark');
    k.prism([[0.5, 0.16], [0.55, 0.0], [0.5, -0.16], [-0.25, -0.32], [-0.38, -0.2], [-0.38, 0.2], [-0.25, 0.32]], 0.87, 1.08, 'gun', 0.05);
    k.prism([[0.36, 0.1], [-0.2, 0.22], [-0.3, 0.14], [-0.3, -0.14], [-0.2, -0.22], [0.36, -0.1]], 1.07, 1.12, 'panel', 0.015);
    for (const s of [-1, 1]) k.light(0.52, 0.97, s * 0.1, 0.045, LAMP.green, '+x');
    if (F === 3) k.sensor(-0.15, 1.2, 0, 0.16);
    b.use('barrel');
    const len = [0.5, 0.6, 0.72][F - 1];
    let mx = 0;
    for (const z of [-0.1, 0.1]) mx = k.cannon(0.5, 0.97, z, len, 0.055, { ribs: F + 1, stripe: F >= 2 ? 'glow' : null, brake: F >= 2 });
    b.use('hull');
    return done(k, { muzzle: mx, muzzleY: 0.97, S: 1, height: 1.8,
      parts: [{ name: 'tail', on: 'hull', kind: 'sway', p: [-0.6, 0.72, 0], model: true, amp: 0.14 }, { name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.18 }] });
  },
};
