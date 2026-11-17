// Tanks drawn in the steel style (steel.js). A key listed here opts in: buildModel (mechs.js) uses this design for
// every form instead of the hand design / frame / chassis plus role kit. Each design builds all three forms itself:
//   I  plain: hull, running gear, main weapon, a few lights, one antenna;
//   II added armour and a second weapon module: skirts with decals, stacked plates, a gatling or missile box;
//   III heavy sci-fi refit: extra weapon modules, lit strips, three or four antennas.
// Same contract as DESIGNS in mechs.js (batches hull, turret, barrel, tread and named parts; returns the info).
import { Kit, LAMP, PI, X, TAU } from './steel.js';

const done = (k, info) => Object.assign(info, { parts: k.parts.concat(info.parts || []) });

export const STEEL_DESIGNS = {
  // Trâu Sắt, tank: heavy double-track hull. The outer track pair juts forward past the short hull (the sheet's fork
  // shape from above), a fender with a panel top covers the inner pair, and a stepped octagonal turret carries one heavy
  // ribbed gun (two at form III). Form II adds skirts, side plates, cheek armour and a roof gatling.
  trau(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    b.use('hull');
    for (const s of [-1, 1]) {
      k.trackPod(-0.22, s * 0.6, 2.3, 0.34, 0.6, { cover: false });
      k.trackPod(0.5, s * 0.97, 2.1, 0.32, 0.56, { cover: false, skirt: F >= 2, decal: F >= 2 ? 'x' : null, light: LAMP.green });
      k.plate(-0.22, 0.66, s * 0.6, 2.2, 0.08, 0.46);
      k.plate(1.48, 0.55, s * 0.97, 0.34, 0.08, 0.36, { insert: null, rz: -0.6 });
      k.strip(-0.3, 0.6, s * 0.84, 1.7, 'x');
      if (F >= 2) {
        k.plate(-0.25, 0.62, s * 0.97, 1.0, 0.08, 0.38, { col: 'panel', insert: null });
        k.decal('chev', 0.75, 0.71, s * 0.6, 0.22, '+y');
      }
      if (F === 3) { k.plate(-0.3, 0.7, s * 0.97, 0.7, 0.07, 0.3, { col: 'gunLite', insert: 'panel' }); k.strip(-0.1, 0.34, s * 1.2, 1.2, 'x'); }
    }
    // Short hull between the inner tracks: sloped glacis, panel deck, rear grille.
    k.prism([[0.92, 0.3], [1.02, 0.12], [1.02, -0.12], [0.92, -0.3], [-1.24, -0.42], [-1.36, -0.3], [-1.36, 0.3], [-1.24, 0.42]], 0.2, 0.68, 'under', 0.05);
    k.plate(0.8, 0.62, 0, 0.5, 0.08, 0.8, { rz: -0.42 });
    k.plate(-0.35, 0.72, 0, 1.6, 0.08, 0.82);
    k.blk(-1.3, 0.6, 0, 0.12, 0.16, 0.6, 'dark', 0.02);
    for (const s of [-1, 1]) k.light(1.03, 0.42, s * 0.2, 0.06, F >= 2 ? LAMP.amber : LAMP.green, '+x');
    if (F === 3) { k.strip(-1.37, 0.5, 0, 0.5, 'z', LAMP.red); k.plate(1.12, 0.36, 0, 0.12, 0.3, 0.8, { insert: null, rz: -0.25 }); }

    // Stepped octagonal turret: ring, gunmetal body, panel step, gunmetal cap with a cupola.
    b.use('turret');
    k.oct(-0.12, 0.8, 0, 0.68, 0.1, 'dark');
    k.oct(-0.16, 0.96, 0, 0.6, 0.22, 'gun', 0.05, 1.28);
    k.oct(-0.22, 1.12, 0, 0.47, 0.12, 'panel', 0.04, 1.28);
    k.oct(-0.3, 1.22, 0, 0.3, 0.08, 'gun', 0.03, 1.2);
    k.plate(-1.02, 1.0, 0, 0.24, 0.24, 0.74);
    for (const s of [-1, 1]) k.light(0.33, 1.12, s * 0.1, 0.045, LAMP.green, '+x');
    k.strip(-0.2, 1.06, 0.0, 1.1, 'x', 'glow', 0.02);
    if (F >= 2) for (const s of [-1, 1]) {
      k.plate(-0.1, 1.0, s * 0.6, 0.9, 0.24, 0.12, { col: 'panel', insert: null, ry: s * 0.18 });
      if (F === 3) k.plate(-0.14, 1.06, s * 0.7, 0.66, 0.2, 0.08, { col: 'gunLite', insert: null, ry: s * 0.18 });
    }
    k.light(-0.1, 1.27, 0.0, 0.04, LAMP.blue, '+x');
    k.antenna(-0.8, 1.1, -0.38, 0.9);
    if (F >= 2) {
      k.antenna(-0.8, 1.1, 0.38, 0.75);
      k.gatling(-0.4, 1.36, 0.3, 0.42, 0.045, 6);
    }
    if (F === 3) { k.antenna(-0.92, 1.1, 0, 1.0); k.missileBox(-0.5, 1.42, -0.28, 2, 3, 0.11, { elev: 0.15 }); }

    b.use('barrel');
    k.blk(0.7, 1.03, 0, 0.32, 0.32, F === 3 ? 0.62 : 0.46, 'gun', 0.05);
    const len = [1.1, 1.2, 1.3][F - 1];
    let tip = 0;
    if (F === 3) for (const z of [-0.14, 0.14]) tip = k.cannon(0.82, 1.04, z, len, 0.085, { ribs: 6, stripe: 'glow' });
    else tip = k.cannon(0.82, 1.04, 0, len, F === 1 ? 0.1 : 0.11, { ribs: F === 1 ? 3 : 5, stripe: 'glow' });
    b.use('hull');
    return done(k, { muzzle: tip, muzzleY: 1.04, S: 1, height: 2.0, parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.32 }] });
  },

  // Quan Công, bruiser: a heavy mech torso on a tracked base. A wide hip block anchors it on the hull, a narrow waist
  // joint opens into a broad V chest leaning a little forward, the head sits in a collar between layered pauldrons
  // (three stacked plates, wider than the tracks), and two thick banded arms end in big gauntlets: the right one a
  // rotary cannon, the left one gripping a long guandao with a heavy crescent head and a lit edge. The left arm is the
  // 'slash' part (slash.js): it swings on every shot and skill. Form II adds skirts, hip plates and a shoulder missile
  // box; III a bigger box, a sensor pod and lit strips.
  quancong(b, st, trim, form) {
    // Hue nudged from green toward teal (the owner asked for teal over mint).
    const k = new Kit(b, st, trim, form, { hue: 0.04 }), F = k.F;
    b.use('hull');
    for (const s of [-1, 1]) {
      k.trackPod(0.1, s * 0.56, 2.5, 0.32, 0.55, { insert: null, skirt: F >= 2, decal: F >= 2 ? 'chev' : null, light: LAMP.green });
      k.strip(-0.2, 0.5, s * 0.73, 1.3, 'x');
    }
    k.prism([[0.88, 0.28], [0.98, 0.14], [0.98, -0.14], [0.88, -0.28], [-1.0, -0.42], [-1.1, -0.3], [-1.1, 0.3], [-1.0, 0.42]], 0.2, 0.62, 'under', 0.05);
    k.plate(0.75, 0.58, 0, 0.42, 0.08, 0.76, { rz: -0.45 });
    k.plate(-0.75, 0.66, 0, 0.5, 0.08, 0.76, { insert: 'panelDeep' });
    k.blk(-1.1, 0.5, 0, 0.1, 0.16, 0.56, 'dark', 0.02);
    for (const s of [-1, 1]) k.light(0.99, 0.42, s * 0.16, 0.05, LAMP.amber, '+x');
    k.oct(-0.2, 0.68, 0, 0.44, 0.1, 'dark');

    b.use('turret');
    const tx = -0.2, lean = -0.1, ly = 1.05;
    // Hip block sitting on the ring, then the narrow waist joint.
    k.blk(tx, 0.84, 0, 0.6, 0.28, 0.8, 'under', 0.07);
    k.plate(tx + 0.31, 0.84, 0, 0.06, 0.2, 0.6, { col: 'gun', insert: null });
    if (F >= 2) for (const s of [-1, 1]) k.plate(tx + 0.02, 0.82, s * 0.43, 0.46, 0.28, 0.08, { col: 'panel', insert: null, rx: s * 0.2 });
    k.oct(tx, 1.04, 0, 0.24, 0.2, 'dark', 0.03);
    // Upper body, leaning forward round the waist.
    b.push().move(tx, ly, 0).rotZ(lean).move(-tx, -ly, 0);
    k.blk(tx, 1.2, 0, 0.36, 0.18, 0.44, 'gun', 0.05);
    k.blk(tx + 0.17, 1.2, 0, 0.04, 0.05, 0.4, 'dark', 0.01);
    // V chest: a trapezoid in the side view, narrow at the waist and broad at the shoulders.
    b.push().move(tx, 0, 0).rotY(PI / 2);
    k.profile([[-0.3, 1.28], [0.3, 1.28], [0.6, 1.68], [0.54, 1.9], [-0.54, 1.9], [-0.6, 1.68]], -0.28, 0.28, 'gun', 0.06);
    b.pop();
    for (const s of [-1, 1]) k.plate(tx + 0.3, 1.66, s * 0.24, 0.08, 0.36, 0.42, { col: 'panel', insert: null, rz: -0.3, ry: -s * 0.3 });
    k.strip(tx + 0.31, 1.6, 0, 0.34, 'y');
    for (const s of [-1, 1]) k.light(tx + 0.27, 1.38, s * 0.1, 0.04, LAMP.green, '+x');
    k.plate(tx - 0.03, 1.92, 0, 0.44, 0.1, 0.66);
    // Head set into the collar: block, panel top, lit visor, red crest rising to the back.
    const hx = tx + 0.04;
    k.blk(hx, 2.06, 0, 0.3, 0.22, 0.28, 'gun', 0.05);
    k.plate(hx - 0.01, 2.18, 0, 0.32, 0.05, 0.3, { col: 'panel', insert: null });
    k.blk(hx + 0.15, 2.05, 0, 0.04, 0.08, 0.24, 'dark', 0.01);
    k.strip(hx + 0.175, 2.05, 0, 0.22, 'z');
    k.blk(hx - 0.04, 2.25, 0, 0.3, 0.09, 0.08, 'trim', 0.02);
    k.blk(hx - 0.2, 2.22, 0, 0.14, 0.18, 0.08, 'trim', 0.02);
    // Pauldrons: three stacked plates per side stepping down and out past the tracks.
    for (const s of [-1, 1]) {
      k.blk(tx, 1.76, s * 0.56, 0.34, 0.34, 0.32, 'under', 0.06);
      k.plate(tx - 0.02, 1.98, s * 0.62, 0.64, 0.16, 0.5, { col: 'gun', insert: null, rx: s * 0.28 });
      k.plate(tx - 0.02, 1.9, s * 0.8, 0.6, 0.14, 0.4, { col: 'panel', insert: null, rx: s * 0.45 });
      k.plate(tx - 0.02, 1.76, s * 0.95, 0.56, 0.18, 0.12, { col: 'gunLite', insert: null, rx: s * 0.62 });
      if (F >= 2) k.decal('x', tx - 0.02, 1.74, s * 1.005, 0.13, s > 0 ? '+z' : '-z');
      if (F === 3) k.strip(tx - 0.02, 1.97, s * 0.8, 0.5, 'x');
    }
    if (F >= 2) k.missileBox(tx - 0.32, 2.1, 0.42, 2, F === 3 ? 3 : 2, 0.11, { elev: 0.4, depth: 0.32 });
    if (F === 3) k.sensor(tx - 0.26, 2.06, -0.4, 0.2);
    k.antenna(tx - 0.3, 1.97, 0.16, 0.7);
    if (F >= 2) k.antenna(tx - 0.34, 1.97, -0.14, 0.6);
    if (F === 3) k.antenna(hx - 0.25, 2.28, 0, 0.5);
    b.pop();

    // Arms from the leaned shoulders: thick upper arm, elbow block, forearm in the panel colour with two armour bands,
    // a big gauntlet at the wrist.
    const sx = tx + 0.07, sy = 1.72, wy = 1.2;
    const arm = (s) => {
      const ex = sx + 0.04, ez = s * 0.84, wx = sx + 0.58;
      k.beam([sx, sy, s * 0.66], [ex, 1.3, ez], 0.3, 0.3, 'gun', 0.05);
      k.blk(ex, 1.3, ez, 0.34, 0.3, 0.34, 'under', 0.07);
      k.beam([ex, 1.28, ez], [wx, wy, ez], 0.36, 0.36, 'panel', 0.07);
      for (const t of [0.35, 0.72]) k.blk(ex + (wx - ex) * t, 1.28 + (wy - 1.28) * t, ez, 0.07, 0.42, 0.42, 'gun', 0.015);
      k.blk(wx + 0.06, wy, ez, 0.3, 0.32, 0.34, 'gun', 0.06);
      k.plate(wx + 0.06, wy + 0.17, ez, 0.24, 0.04, 0.26, { col: 'panel', insert: null });
      return [wx + 0.06, ez];
    };
    const [gx, gz] = arm(1);
    // Left arm and the guandao: its own part, pivoting at the shoulder.
    b.use('blade');
    const [fx, bz] = arm(-1), bl = [1.05, 1.15, 1.25][F - 1];
    k.use('steel'); b.rod([sx - 0.55, wy - 0.1, bz], [fx + bl, wy + 0.06, bz], 0.045, 6);
    k.use('steel'); b.push().move(sx - 0.62, wy - 0.11, bz).rotZ(PI / 2).cyl(0, 0.06, 0.18, 5).pop();
    const bx = fx + bl, yb = wy + 0.06, Bk = 1.8, bp = (x, z) => [bx + x * Bk, bz + z * Bk];
    k.blk(bx - 0.06, yb, bz, 0.14, 0.14, 0.16, 'trim', 0.02);
    k.prism([bp(0, 0.06), bp(0.62, 0.03), bp(0.5, -0.24), bp(0.24, -0.36), bp(0.02, -0.2)], yb - 0.05, yb + 0.05, 'steel', 0.02);
    k.prism([bp(0.06, 0.02), bp(0.3, 0.01), bp(0.2, -0.16), bp(0.06, -0.12)], yb + 0.045, yb + 0.075, 'trim', 0.01);
    const tA = bp(0.62, 0.04), tB = bp(0.5, -0.25), tC = bp(0.24, -0.37);
    k.lamp('glow', () => { b.rod([tA[0], yb, tA[1]], [tB[0], yb, tB[1]], 0.026, 4); b.rod([tB[0], yb, tB[1]], [tC[0], yb, tC[1]], 0.026, 4); });
    const pivot = [sx, sy, -0.66], tipP = bp(0.56, -0.1);

    // Right gauntlet: rotary cannon (spins while firing).
    b.use('drum');
    const gl = [0.5, 0.6, 0.7][F - 1];
    k.gatling(gx + 0.12, wy, gz, gl, F === 3 ? 0.09 : 0.08, 6);
    b.use('hull');
    return done(k, { muzzle: 1.2, muzzleY: wy, S: 1, height: 2.5,
      parts: [{ name: 'drum', on: 'turret', kind: 'spin', axis: 'x', by: 'fire', p: [gx + 0.12, wy, gz], model: true },
        { name: 'blade', on: 'turret', kind: 'slash', p: pivot, model: true, tip: [tipP[0] - pivot[0], yb - pivot[1], tipP[1] - pivot[2]], r0: 0.9 }] });
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
    k.strip(0.97, 0.24, 0, 0.5, 'z', LAMP.blue); for (const s of [-1, 1]) k.strip(-0.1, 0.22, s * 0.52, 1.6, 'x', LAMP.blue);
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
    if (F >= 2) { k.antenna(tx - 0.42, 0.95, 0.3, 0.8); k.sensor(tx - 0.3, 1.02, 0, 0.2, LAMP.green, 2); k.gatling(tx + 0.12, 0.98, 0.6, 0.42, 0.045, 6); }
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
    for (const s of [-1, 1]) { k.strip(0.0, 0.6, s * 0.38, 1.0, 'x'); if (F >= 2) k.missileBox(-0.35, 0.92, s * 0.34, 2, F === 3 ? 3 : 2, 0.1, { elev: 0.25, depth: 0.3 }); }
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

// Road wheel built at the origin for an instanced 'roll' part (axle along z): tyre, steel rim, dark hub.
function wheel(k, r, w) {
  const b = k.b;
  k.use('rubber'); b.push().rotX(X).cyl(r, r, w, 12).pop();
  k.use('steel'); b.push().rotX(X).cyl(r * 0.64, r * 0.64, w + 0.02, 8).pop();
  k.use('dark'); b.push().rotX(X).cyl(r * 0.26, r * 0.26, w + 0.05, 6).pop();
}
// Chamfered rectangle in the XZ plane for k.prism: front x0, back x1, half widths wf (front) and wr (back), corner cut c.
const rect = (x0, x1, wf, wr, c = 0.1) => [[x0, wf - c], [x0, -wf + c], [x0 - c, -wf], [x1 + c, -wr], [x1, -wr + c], [x1, wr - c], [x1 + c, wr], [x0 - c, wf]];

// The second steel batch: nine more tanks, each on its own running gear (wheels, half-track, articulated segments,
// splayed limbs, wide tracks) with a weapon module that tells its role at a glance.
Object.assign(STEEL_DESIGNS, {
  // Sói Lửa, assault: a fast six-wheeled armoured car. A wedge hull runs out into a wolf snout (brow lamps, a lower jaw
  // with two steel fangs), the low turret carries two tall ear plates and a boxy gun pod on each shoulder (rotary gun in its nose), and a wolf
  // tail of stacked plates trails off the back (longer each form). Form II adds rear exhaust stacks, fender armour and a
  // roof missile pod; III a second pod, lit strips and two more antennas.
  soi(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    b.use('hull');
    const WX = [-0.8, 0.82], WZ = 0.92, WR = 0.29;
    for (const s of [-1, 1]) {
      // One fender pod over each wheel, a sill beam between them.
      for (const fx of WX) {
        k.profile([[fx - 0.42, 0.44], [fx - 0.3, 0.64], [fx + 0.3, 0.64], [fx + 0.44, 0.46], [fx + 0.34, 0.38], [fx - 0.34, 0.38]], s * 0.62, s * 1.04, 'gun', 0.04);
        k.plate(fx, 0.665, s * 0.84, 0.56, 0.05, 0.3, { col: 'panel', insert: null });
      }
      k.beam([-0.4, 0.4, s * 0.66], [0.42, 0.4, s * 0.66], 0.14, 0.14, 'under', 0.03);
      k.light(1.25, 0.47, s * 0.84, 0.055, LAMP.amber, '+x');
      k.strip(0.0, 0.42, s * 0.735, 0.7, 'x');
      if (F >= 2) {
        k.plate(-0.8, 0.71, s * 0.86, 0.4, 0.06, 0.26, { col: 'gunLite', insert: null });
        k.decal('chev', 0.82, 0.69, s * 0.84, 0.2, '+y');
        k.blk(-1.0, 0.82, s * 0.62, 0.14, 0.34, 0.14, 'dark', 0.03);
        k.blk(-1.0, 1.0, s * 0.62, 0.17, 0.04, 0.17, 'gun', 0.01);
      }
    }
    // Wolf-snout hull: wedge to a pointed nose, a sloped snout plate, a brow block with lamp eyes, a lower jaw and fangs.
    k.prism([[1.5, 0.1], [1.5, -0.1], [0.72, -0.62], [-1.1, -0.64], [-1.24, -0.5], [-1.24, 0.5], [-1.1, 0.64], [0.72, 0.62]], 0.24, 0.6, 'under', 0.05);
    k.plate(1.06, 0.62, 0, 0.82, 0.08, 0.44, { rz: -0.3, split: 1, greeble: false });
    k.blk(0.64, 0.72, 0, 0.2, 0.18, 0.66, 'gun', 0.04);
    for (const s of [-1, 1]) k.light(0.745, 0.74, s * 0.2, 0.05, LAMP.amber, '+x');
    k.plate(1.22, 0.25, 0, 0.62, 0.08, 0.34, { col: 'gunLite', insert: null });
    k.use('steel'); for (const s of [-1, 1]) b.push().move(1.44, 0.17, s * 0.09).rotX(PI).cyl(0, 0.045, 0.16, 5).pop();
    k.plate(-0.55, 0.62, 0, 0.95, 0.07, 1.0, { insert: 'panelDeep', split: 2 });
    k.blk(-1.25, 0.44, 0, 0.06, 0.18, 0.7, 'dark', 0.02);
    for (const s of [-1, 1]) k.light(-1.27, 0.46, s * 0.42, 0.045, LAMP.red, '-x');

    // Wolf tail: tapering plates arching back and up from the rear deck, a lit tip.
    b.use('tail');
    const tail = [[-1.18, 0.62], [-1.42, 0.9], [-1.56, 1.2], [-1.54, 1.48], [-1.4, 1.66]].slice(0, F + 2);
    for (let i = 0; i < tail.length - 1; i++) {
      const w = 0.3 - i * 0.05, a = [tail[i][0], tail[i][1], 0], c = [tail[i + 1][0], tail[i + 1][1], 0];
      k.beam(a, c, w, 0.16, i % 2 ? 'panel' : 'gun', 0.05);
    }
    const tt = tail[tail.length - 1];
    k.blk(tt[0], tt[1], 0, 0.16, 0.12, 0.14, 'trim', 0.04);
    k.lamp('glow', () => b.push().move(tt[0] - 0.06, tt[1], 0).box(0.06, 0.08, 0.1).pop());

    // Low turret with ear plates and a rotary gun on each cheek.
    b.use('turret');
    const tx = -0.22;
    k.oct(tx, 0.7, 0, 0.5, 0.08, 'dark');
    k.prism([[tx + 0.6, 0.2], [tx + 0.68, 0], [tx + 0.6, -0.2], [tx - 0.4, -0.42], [tx - 0.55, -0.3], [tx - 0.55, 0.3], [tx - 0.4, 0.42]], 0.74, 1.02, 'gun', 0.05);
    k.prism([[tx + 0.44, 0.14], [tx - 0.3, 0.3], [tx - 0.42, 0.2], [tx - 0.42, -0.2], [tx - 0.3, -0.3], [tx + 0.44, -0.14]], 1.01, 1.07, 'panel', 0.02);
    for (const s of [-1, 1]) {
      k.profile([[tx - 0.48, 1.04], [tx - 0.04, 1.04], [tx - 0.36, 1.66]], s * 0.14, s * 0.26, 'gun', 0.02);
      k.profile([[tx - 0.4, 1.08], [tx - 0.12, 1.08], [tx - 0.33, 1.5]], s * 0.13, s * 0.14 + s * 0.012, 'panel', 0.005);
      k.light(tx + 0.66, 0.9, s * 0.1, 0.04, LAMP.amber, '+x');
      // Shoulder gun pod: a strut out from the turret, a boxy pod with a panel top, the rotary gun out of its nose.
      k.beam([tx, 0.9, s * 0.3], [tx, 1.0, s * 0.56], 0.2, 0.14, 'under', 0.03);
      k.plate(tx + 0.06, 1.02, s * 0.62, 0.66, 0.34, 0.32, { insert: null });
      k.plate(tx + 0.02, 1.2, s * 0.62, 0.5, 0.05, 0.26, { col: 'panel', insert: null });
      k.light(tx - 0.27, 1.02, s * 0.62, 0.05, LAMP.amber, '-x');
    }
    k.antenna(tx - 0.45, 1.02, 0.0, 0.8);
    if (F >= 2) k.missileBox(tx + 0.28, 1.13, 0, 2, 2, 0.1, { elev: 0.2, depth: 0.28 });
    if (F === 3) { k.antenna(tx - 0.5, 1.02, -0.3, 0.7); k.antenna(tx - 0.5, 1.02, 0.3, 0.7); for (const s of [-1, 1]) k.strip(tx, 1.02, s * 0.36, 0.7, 'x'); }
    const gl = [0.6, 0.7, 0.8][F - 1], gx = tx + 0.42, gy = 1.02;
    let tip = 0;
    const parts = [];
    for (const [s, nm] of [[-1, 'drumL'], [1, 'drumR']]) {
      b.use(nm);
      tip = k.gatling(gx, gy, s * 0.62, gl, F === 3 ? 0.08 : 0.07, 6);
      parts.push({ name: nm, on: 'turret', kind: 'spin', axis: 'x', by: 'fire', p: [gx, gy, s * 0.62], model: true });
    }
    b.use('wheel'); wheel(k, WR, 0.2);
    b.use('hull');
    parts.push({ name: 'wheel', on: 'hull', kind: 'roll', axis: 'z', r: WR, at: WX.flatMap((x) => [[x, WR, WZ], [x, WR, -WZ]]) },
      { name: 'tail', on: 'hull', kind: 'sway', p: [-1.18, 0.62, 0], model: true, amp: 0.18 });
    return done(k, { muzzle: tip, muzzleY: gy, S: 0.82, height: 1.7, parts });
  },

  // Ưng Nhãn, sniper: long narrow hull on two long tracks with rear stabiliser spades splayed out behind, a hawk-head
  // turret (hooked beak housing under a brow plate, lamp eyes) and a very long rail gun: two steel rails with a lit core
  // and coil rings. Form II folds a pair of armoured wings along the turret (root joint, leading-edge plate, three
  // overlapping feather plates) and adds a scope; III lengthens the wings with lit edges and adds a sensor and antennas.
  ung(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    b.use('hull');
    for (const s of [-1, 1]) {
      k.trackPod(-0.15, s * 0.5, 2.3, 0.26, 0.5, { insert: 'panel', skirt: F >= 2, decal: F >= 2 ? 'stripe' : null, light: LAMP.blue });
      // Stabiliser spade: a strut from the rear corner out and down to a pad.
      k.beam([-1.15, 0.42, s * 0.36], [-1.62, 0.16, s * 0.82], 0.12, 0.12, 'gun');
      k.plate(-1.66, 0.1, s * 0.86, 0.3, 0.06, 0.22, { col: 'panel', insert: null, ry: s * 0.5 });
      k.strip(-0.2, 0.26, s * 0.37, 1.8, 'x', LAMP.blue);
    }
    k.prism([[1.08, 0.2], [1.18, 0.0], [1.08, -0.2], [-1.18, -0.38], [-1.3, -0.26], [-1.3, 0.26], [-1.18, 0.38]], 0.22, 0.56, 'under', 0.05);
    k.plate(0.82, 0.55, 0, 0.5, 0.07, 0.4, { rz: -0.35, insert: null });
    k.plate(-0.75, 0.6, 0, 0.8, 0.07, 0.6, { insert: 'panelDeep', split: 1 });
    for (const s of [-1, 1]) k.light(1.12, 0.4, s * 0.12, 0.045, LAMP.green, '+x');

    // Hawk head: a diamond turret, a stepped panel cap, a brow plate over two lamp eyes and a hooked beak housing.
    b.use('turret');
    const tx = -0.32;
    k.oct(tx, 0.62, 0, 0.42, 0.08, 'dark');
    k.prism([[tx + 0.55, 0], [tx + 0.25, 0.3], [tx - 0.4, 0.3], [tx - 0.55, 0.16], [tx - 0.55, -0.16], [tx - 0.4, -0.3], [tx + 0.25, -0.3]], 0.66, 0.98, 'gun', 0.05);
    k.prism([[tx + 0.36, 0], [tx + 0.12, 0.2], [tx - 0.36, 0.2], [tx - 0.46, 0.1], [tx - 0.46, -0.1], [tx - 0.36, -0.2], [tx + 0.12, -0.2]], 0.97, 1.06, 'panel', 0.02);
    k.profile([[tx + 0.1, 1.04], [tx + 0.5, 1.02], [tx + 0.62, 0.94], [tx + 0.56, 0.9], [tx + 0.1, 0.98]], -0.16, 0.16, 'trim', 0.02);
    for (const s of [-1, 1]) k.light(tx + 0.36, 0.86, s * 0.16, 0.045, LAMP.red, '+x');
    k.profile([[tx + 0.5, 0.74], [tx + 0.74, 0.72], [tx + 0.66, 0.6], [tx + 0.5, 0.64]], -0.07, 0.07, 'gunLite', 0.02);
    k.antenna(tx - 0.42, 1.0, 0.18, 0.75);
    if (F >= 2) {
      // Folded wings: root joint, leading-edge plate, three overlapping feather plates sweeping back.
      const wl = [0, 0.9, 1.15][F - 1];
      for (const s of [-1, 1]) {
        k.blk(tx + 0.12, 0.9, s * 0.33, 0.2, 0.18, 0.12, 'under', 0.04);
        k.beam([tx + 0.16, 0.98, s * 0.36], [tx + 0.16 - wl, 0.9, s * 0.5], 0.08, 0.1, 'trim', 0.03);
        for (let i = 0; i < 3; i++) {
          const L = wl * (0.95 - i * 0.2);
          k.plate(tx + 0.1 - L / 2 - i * 0.06, 0.88 - i * 0.06, s * (0.43 + i * 0.035), L, 0.04, 0.14, { col: i % 2 ? 'gun' : 'panel', insert: null, rx: s * 0.35 });
        }
        if (F === 3) k.strip(tx + 0.16 - wl / 2, 1.0, s * 0.43, wl * 0.9, 'x');
      }
      k.blk(tx - 0.05, 1.12, -0.12, 0.36, 0.08, 0.08, 'gun', 0.02);
      k.light(tx + 0.13, 1.12, -0.12, 0.035, LAMP.blue, '+x');
      k.antenna(tx - 0.42, 1.0, -0.18, 0.6);
    }
    if (F === 3) { k.sensor(tx - 0.3, 1.14, 0.08, 0.16, LAMP.green, 2); k.antenna(tx - 0.5, 1.0, 0, 0.95); }

    // Rail gun: breech block, two rails with a lit core between, coil rings, a muzzle cap.
    b.use('barrel');
    const y = 0.84, x0 = tx + 0.5, len = [2.5, 2.65, 2.8][F - 1];
    k.blk(x0 + 0.05, y, 0, 0.3, 0.2, 0.26, 'gun', 0.04);
    for (const s of [-1, 1]) k.blk(x0 + 0.2 + len / 2, y, s * 0.06, len, 0.08, 0.05, 'steel', 0.015);
    k.strip(x0 + 0.2 + len / 2, y, 0, len - 0.1, 'x', 'glow', 0.035);
    const nc = F + 2;
    for (let i = 0; i < nc; i++) k.blk(x0 + 0.42 + i * (len * 0.55) / nc, y, 0, 0.06, 0.15, 0.2, i % 2 ? 'panel' : 'gun', 0.015);
    k.blk(x0 + 0.2 + len, y, 0, 0.1, 0.12, 0.2, 'dark', 0.02);
    b.use('hull');
    return done(k, { muzzle: x0 + 0.25 + len, muzzleY: y, S: 0.98, height: 1.8, parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.4 }] });
  },

  // Thợ Rèn, engineer: a half-track work truck. Steered wheels under a front fender, a squared cab with a lit windscreen
  // and a roof beacon, tracks under a flat bed at the back. A jib crane stands on the bed's left corner, its hook swinging
  // on a cable; the turret on the bed is a squat operator housing with a revolving nail gun. Form II adds toolboxes with
  // hazard stripes and skirts; III a second boom (welding arm), floodlights and more antennas.
  tho(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    b.use('hull');
    const WR = 0.27, WXF = 0.86, WZF = 0.66;
    for (const s of [-1, 1]) {
      k.trackPod(-0.55, s * 0.64, 1.4, 0.32, 0.52, { insert: 'panel', skirt: F >= 2, decal: F >= 2 ? 'x' : null });
      k.plate(WXF, 0.6, s * WZF, 0.64, 0.06, 0.3, { col: 'panel', insert: null });
      k.plate(WXF + 0.36, 0.48, s * WZF, 0.16, 0.06, 0.3, { insert: null, rz: -0.7 });
      k.strip(0.1, 0.34, s * 0.5, 0.7, 'x');
    }
    k.prism(rect(1.24, -1.26, 0.48, 0.5, 0.1), 0.24, 0.54, 'under', 0.05);
    // Cab: squared block, panel roof, dark windscreen with a lit sill, bull bar.
    k.blk(0.8, 0.78, 0, 0.62, 0.48, 0.86, 'gun', 0.06);
    k.plate(0.78, 1.04, 0, 0.6, 0.05, 0.84, { col: 'panel', insert: null });
    k.blk(1.105, 0.86, 0, 0.02, 0.18, 0.7, 'dark', 0.005);
    k.strip(1.115, 0.76, 0, 0.66, 'z');
    for (const s of [-1, 1]) k.light(1.12, 0.48, s * 0.36, 0.05, LAMP.amber, '+x');
    k.blk(1.3, 0.38, 0, 0.08, 0.1, 0.9, 'steel', 0.02);
    // Bed: a flat deck with a rim.
    k.plate(-0.55, 0.58, 0, 1.4, 0.06, 1.0, { insert: 'panelDeep', split: 2 });
    for (const s of [-1, 1]) k.blk(-0.55, 0.66, s * 0.5, 1.4, 0.1, 0.05, 'gunLite', 0.015);
    // Jib crane on the left rear corner: post, slewing collar, boom, cable.
    const cz = -0.42, top = [0.55, 2.25, cz];
    k.blk(-1.05, 0.95, cz, 0.18, 0.66, 0.18, 'gun', 0.03);
    k.oct(-1.05, 1.3, cz, 0.13, 0.08, 'dark');
    k.beam([-1.1, 1.32, cz], top, 0.14, 0.14, 'panel', 0.03);
    k.beam([-1.05, 0.7, cz], [-0.3, 1.75, cz], 0.07, 0.07, 'steel', 0.02);
    k.blk(-1.25, 1.36, cz, 0.18, 0.16, 0.16, 'dark', 0.03);
    for (let i = 0; i < 3; i++) { k.use(i % 2 ? 'dark' : 'haz'); b.push().move(-0.85 + i * 0.12, 1.45 + i * 0.07, cz).rotZ(0.55).box(0.1, 0.15, 0.15).pop(); }
    // Beacon on the cab roof.
    b.use('beacon');
    k.oct(0.62, 1.1, 0, 0.07, 0.06, 'dark');
    k.lamp(LAMP.amber, () => b.push().move(0.62, 1.17, 0).box(0.16, 0.07, 0.05).pop());
    // Hook on a cable under the boom tip.
    b.use('hook');
    k.use('dark'); b.rod(top, [top[0], 1.42, cz], 0.014, 4);
    k.blk(top[0], 1.4, cz, 0.16, 0.1, 0.12, 'haz', 0.02);
    k.use('steel'); b.push().move(top[0] + 0.04, 1.26, cz).rotX(X).cyl(0.08, 0.08, 0.05, 8).pop();
    k.blk(top[0] - 0.02, 1.2, cz, 0.06, 0.12, 0.05, 'steel', 0.01);
    if (F >= 2) for (const s of [-1, 1]) {
      k.blk(-0.4, 0.78, s * 0.33, 0.42, 0.24, 0.22, 'panel', 0.03);
      k.decal('stripe', -0.4, 0.78, s * 0.445, 0.18, s > 0 ? '+z' : '-z');
    }
    if (F === 3) {
      k.beam([-1.05, 1.2, cz], [-1.4, 1.5, cz + 0.2], 0.08, 0.08, 'gun', 0.02);
      k.light(-1.4, 1.55, cz + 0.2, 0.05, LAMP.white, '-x');
      for (const s of [-1, 1]) k.light(0.95, 1.1, s * 0.3, 0.05, LAMP.white, '+x');
      k.strip(-0.55, 0.64, 0, 1.2, 'x');
    }
    k.antenna(0.55, 1.06, 0.36, 0.6);
    if (F === 3) k.antenna(0.55, 1.06, -0.36, 0.5);

    // Operator housing on the bed with a revolving nail gun.
    b.use('turret');
    const tx = -0.35;
    k.oct(tx, 0.68, 0.1, 0.36, 0.08, 'dark');
    k.blk(tx, 0.88, 0.1, 0.56, 0.32, 0.5, 'gun', 0.05);
    k.plate(tx - 0.02, 1.06, 0.1, 0.5, 0.05, 0.44, { col: 'panel', insert: null });
    k.light(tx + 0.285, 0.94, 0.26, 0.04, LAMP.green, '+x');
    if (F >= 2) { k.sensor(tx - 0.15, 1.18, 0.1, 0.14, LAMP.green, 2); k.antenna(tx - 0.2, 1.08, 0.3, 0.5); }
    b.use('nail');
    const ny = 0.9, nx = tx + 0.3, nl = [0.6, 0.72, 0.82][F - 1];
    k.use('gun'); b.push().move(nx + 0.1, ny, 0.1).rotZ(X).cyl(0.13, 0.13, 0.2, 8).pop();
    k.use('steel'); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b.push().move(nx + 0.1, ny + Math.cos(a) * 0.08, 0.1 + Math.sin(a) * 0.08).rotZ(X).cyl(0.025, 0.025, 0.22, 5).pop(); }
    k.use('steel'); b.push().move(nx + 0.2 + nl / 2, ny, 0.1).rotZ(X).cyl(0.045, 0.06, nl, 8).pop();
    k.blk(nx + 0.2 + nl, ny, 0.1, 0.08, 0.12, 0.12, 'dark', 0.02);
    b.use('wheel'); wheel(k, WR, 0.2);
    b.use('hull');
    return done(k, { muzzle: nx + 0.25 + nl, muzzleY: ny, S: 0.96, height: 2.2,
      parts: [{ name: 'nail', on: 'turret', kind: 'spin', axis: 'x', by: 'fire', p: [nx, ny, 0.1], model: true, kick: 6 },
        { name: 'beacon', on: 'hull', kind: 'spin', axis: 'y', by: 'time', rate: 5, p: [0.62, 1.1, 0], model: true },
        { name: 'hook', on: 'hull', kind: 'sway', p: top, model: true, amp: 0.2, axis: 'z' },
        { name: 'wheel', on: 'hull', kind: 'roll', axis: 'z', r: WR, at: [[WXF, WR, WZF], [WXF, WR, -WZF]] }] });
  },

  // Thần Công, siege: the heaviest gun in the batch. Two very wide tracks, a dozer spade across the nose, a long hull
  // with a casemate at the back and a huge howitzer raised over the front: thick ribbed tube, breech counterweight,
  // heavy muzzle brake. Outrigger trail arms lie back along the tracks and swing out to brace in siege stance.
  // Form II adds a sensor, a gatling and skirts; III gold-banded armour, a radar and a second short gun.
  thancong(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    b.use('hull');
    for (const s of [-1, 1]) {
      k.trackPod(-0.1, s * 0.76, 2.6, 0.44, 0.62, { insert: 'panel', skirt: F >= 2, decal: F >= 2 ? 'chev' : null, light: LAMP.green });
      k.strip(-0.1, 0.62, s * 0.53, 2.0, 'x');
    }
    k.prism(rect(1.2, -1.34, 0.5, 0.56, 0.12), 0.24, 0.68, 'under', 0.05);
    k.plate(0.95, 0.64, 0, 0.5, 0.08, 0.98, { rz: -0.4, split: 1 });
    k.plate(-0.2, 0.72, 0, 0.9, 0.07, 1.0, { insert: 'panelDeep', split: 2 });
    // Dozer spade: a wide angled blade on two push arms.
    k.profile([[1.42, 0.12], [1.58, 0.14], [1.6, 0.46], [1.48, 0.56], [1.4, 0.5]], -1.02, 1.02, 'gunLite', 0.03);
    for (const s of [-1, 1]) { k.beam([1.0, 0.42, s * 0.42], [1.45, 0.34, s * 0.5], 0.12, 0.12, 'gun'); k.decal('stripe', 1.6, 0.32, s * 0.6, 0.2, '+x'); }
    for (const s of [-1, 1]) k.light(1.21, 0.48, s * 0.25, 0.05, LAMP.amber, '+x');
    k.blk(-1.35, 0.5, 0, 0.08, 0.2, 0.8, 'dark', 0.02);

    // Outriggers (built deployed): trail arms that lie back along the tracks and swing out to the ground in siege stance.
    const rig = (s, nm) => {
      b.use(nm);
      const p = [-0.7, 0.6, s * 1.1];
      k.blk(p[0], p[1], p[2], 0.2, 0.2, 0.16, 'dark', 0.03);
      k.beam(p, [p[0] - 0.12, 0.16, s * 1.62], 0.16, 0.14, 'panel', 0.03);
      k.plate(p[0] - 0.12, 0.06, s * 1.68, 0.34, 0.06, 0.3, { insert: null });
      k.decal('stripe', p[0] - 0.12, 0.095, s * 1.68, 0.2, '+y');
      return { name: nm, on: 'hull', kind: 'deploy', by: 'stance', p, model: true, axis: 'y', a0: -s * 1.3, a1: 0 };
    };
    const rigs = [rig(-1, 'rig0'), rig(1, 'rig1')];

    // Casemate turret.
    b.use('turret');
    const tx = -0.45;
    k.oct(tx, 0.78, 0, 0.62, 0.1, 'dark');
    k.prism([[tx + 0.55, 0.42], [tx + 0.62, 0.3], [tx + 0.62, -0.3], [tx + 0.55, -0.42], [tx - 0.6, -0.52], [tx - 0.72, -0.4], [tx - 0.72, 0.4], [tx - 0.6, 0.52]], 0.82, 1.26, 'gun', 0.06);
    k.prism(rect(tx + 0.45, tx - 0.6, 0.36, 0.42, 0.08), 1.25, 1.33, 'panel', 0.02);
    k.blk(tx - 0.76, 1.04, 0, 0.12, 0.3, 0.8, 'under', 0.03);
    for (const s of [-1, 1]) {
      k.plate(tx, 1.04, s * 0.56, 1.0, 0.36, 0.08, { col: 'panel', insert: null, rx: s * 0.15 });
      if (F === 3) k.blk(tx, 1.24, s * 0.6, 1.02, 0.06, 0.06, 'trim', 0.015);
      k.strip(tx - 0.1, 0.92, s * 0.6, 0.8, 'x');
    }
    k.antenna(tx - 0.55, 1.3, -0.3, 0.9);
    if (F >= 2) { k.sensor(tx - 0.25, 1.44, 0.22, 0.18); k.gatling(tx + 0.1, 1.45, -0.26, 0.4, 0.045, 6); k.antenna(tx - 0.55, 1.3, 0.3, 0.8); }
    const parts = rigs;
    if (F === 3) {
      k.cannon(tx + 0.5, 0.98, 0.42, 0.55, 0.05, { ribs: 2, brake: false });
      k.antenna(tx - 0.65, 1.3, 0, 1.0);
      b.use('radar');
      k.blk(tx - 0.45, 1.4, 0, 0.08, 0.14, 0.08, 'gun', 0.02);
      k.plate(tx - 0.45, 1.5, 0, 0.12, 0.05, 0.5, { col: 'steel', insert: null });
      k.light(tx - 0.39, 1.5, 0, 0.045, LAMP.red, '+x');
      parts.push({ name: 'radar', on: 'turret', kind: 'spin', axis: 'y', by: 'time', rate: 1.6, p: [tx - 0.45, 1.4, 0], model: true });
    }

    // Howitzer: trunnion block, raised tube with ribs, counterweight behind, heavy brake.
    b.use('barrel');
    const el = 0.16, cp = Math.cos(el), sp = Math.sin(el), px = tx + 0.45, py = 1.06, len = [2.5, 2.75, 3.0][F - 1], r = [0.14, 0.155, 0.17][F - 1];
    b.push().move(px, py, 0).rotZ(el);
    k.blk(0, 0, 0, 0.46, 0.38, 0.44, 'gun', 0.06);
    k.blk(-0.4, 0, 0, 0.36, 0.3, 0.34, 'under', 0.05);
    k.plate(-0.02, 0.2, 0, 0.4, 0.04, 0.38, { col: 'panel', insert: null });
    const tip = k.cannon(0.2, 0, 0, len, r, { ribs: F + 2, stripe: 'glow' });
    k.blk(tip - 0.1, 0, 0, 0.26, r * 2.6, r * 3.2, 'dark', 0.04);
    b.pop();
    parts.push({ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.5, dir: [-cp, -sp, 0] });
    b.use('hull');
    return done(k, { muzzle: px + cp * tip, muzzleY: py + sp * tip, S: 1.3, height: 2.4, parts });
  },

  // Mãng Xà, hooker: a serpent. Three articulated segments, each on its own short tracks, sit on an S curve and narrow to
  // a rattle at the back; joints between them are dark collars. The head segment has a wedge snout with steel fangs; its
  // turret rears a cobra hood (tilted back, eye-spot lamps on its front) over a long harpoon launcher with a barbed head
  // and a cable drum. Each segment has a hexagonal deck with a diamond scale plate; form II adds a missile box on the
  // middle segment and a rim on the scales; III a longer harpoon, a sensor and lit spines.
  mangxa(b, st, trim, form) {
    const k = new Kit(b, st, trim, form, { hue: -0.02 }), F = k.F;
    b.use('hull');
    const segs = [[0.78, 1.05, 0.72, 0], [-0.42, 0.95, 0.64, 0.3], [-1.42, 0.8, 0.54, -0.1]];
    segs.forEach(([x, l, w, z], i) => {
      for (const s of [-1, 1]) k.trackPod(x, z + s * (w - 0.12), l * 0.86, 0.24, 0.44, { insert: null, light: i === 0 ? LAMP.green : null });
      k.prism(rect(x + l / 2, x - l / 2, w - 0.26, w - 0.26, 0.1).map(([px, pz]) => [px, pz + z]), 0.22, 0.56, 'under', 0.04);
      const hw = w - 0.08;
      k.prism([[x + l / 2 + 0.1, z], [x + l * 0.3, z + hw], [x - l * 0.4, z + hw], [x - l / 2, z], [x - l * 0.4, z - hw], [x + l * 0.3, z - hw]], 0.54, 0.64, 'gun', 0.03);
      if (i > 0 || F >= 2) k.prism([[x + l * 0.36, z], [x, z + w * 0.52], [x - l * 0.36, z], [x, z - w * 0.52]], 0.63, 0.71, 'panel', 0.02);
      if (F >= 2 && i > 0) k.prism([[x + l * 0.2, z], [x, z + w * 0.28], [x - l * 0.2, z], [x, z - w * 0.28]], 0.7, 0.75, 'gunLite', 0.01);
      if (F === 3) k.strip(x, 0.72, z, l * 0.5, 'x');
      if (i > 0) {
        // Joint collar half way to the segment in front, a coupling beam through it.
        const [px, pl, , pz] = segs[i - 1], jx = (x + l / 2 + px - pl / 2) / 2, jz = (z + pz) / 2;
        k.beam([x, 0.42, z], [px, 0.42, pz], 0.22, 0.18, 'dark', 0.03);
        k.oct(jx, 0.44, jz, 0.2, 0.26, 'gun', 0.04);
        k.strip(jx, 0.58, jz, 0.22, 'z');
      }
      for (const s of [-1, 1]) k.strip(x, 0.3, z + s * (w - 0.23), l * 0.6, 'x');
    });
    // Snout: wedge, fangs, eyes.
    k.prism([[1.6, 0.1], [1.6, -0.1], [1.28, -0.42], [1.28, 0.42]], 0.24, 0.52, 'gun', 0.04);
    k.plate(1.4, 0.54, 0, 0.32, 0.06, 0.58, { rz: -0.4, insert: null, col: 'panel' });
    k.use('steel'); for (const s of [-1, 1]) b.push().move(1.5, 0.17, s * 0.14).rotX(PI).cyl(0, 0.06, 0.24, 5).pop();
    for (const s of [-1, 1]) k.light(1.45, 0.44, s * 0.26, 0.05, LAMP.green, '+x');
    if (F >= 2) k.missileBox(-0.5, 0.82, 0.3, 2, 2, 0.11, { elev: 0.3, depth: 0.32 });
    if (F === 3) { k.sensor(-1.45, 0.8, -0.1, 0.16); k.antenna(-0.75, 0.64, 0.5, 0.7); }
    k.antenna(-0.75, 0.64, 0.1, 0.8);

    // Rattle off the last segment.
    b.use('tail');
    const rx = -1.86, rz = -0.18;
    for (let i = 0; i < 3; i++) k.blk(rx - i * 0.14, 0.48 + i * 0.06, rz - i * 0.05, 0.14, 0.24 - i * 0.04, 0.28 - i * 0.05, i % 2 ? 'panel' : 'gun', 0.04);
    k.lamp('glow', () => b.push().move(rx - 0.42, 0.62, rz - 0.15).box(0.07, 0.09, 0.11).pop());

    // Turret on the head segment: a cobra hood reared back over the harpoon.
    b.use('turret');
    const tx = 0.6, y = 0.86;
    k.oct(tx, 0.66, 0, 0.42, 0.08, 'dark');
    k.prism([[tx + 0.44, 0.2], [tx + 0.5, 0], [tx + 0.44, -0.2], [tx - 0.3, -0.36], [tx - 0.44, -0.24], [tx - 0.44, 0.24], [tx - 0.3, 0.36]], 0.7, 1.0, 'gun', 0.05);
    for (const s of [-1, 1]) k.light(tx + 0.47, 0.9, s * 0.13, 0.035, LAMP.green, '+x');
    const hs = [0.8, 1.0, 1.1][F - 1];
    b.push().move(tx - 0.3, 0.98, 0).rotZ(PI - 1.15);
    const hood = [[0, 0.24], [0.3, 0.62], [0.62, 0.7], [0.88, 0.44], [0.98, 0], [0.88, -0.44], [0.62, -0.7], [0.3, -0.62], [0, -0.24]].map(([a, c]) => [a * hs, c * hs]);
    k.prism(hood, -0.05, 0.05, 'gun', 0.025);
    k.prism(hood.map(([a, c]) => [a * 0.8 + 0.06, c * 0.78]), -0.08, -0.04, 'panel', 0.015);
    k.prism([[0.15 * hs, 0], [0.55 * hs, 0.12 * hs], [0.85 * hs, 0], [0.55 * hs, -0.12 * hs]], -0.1, -0.07, 'gunLite', 0.01);
    for (const s of [-1, 1]) k.light(0.62 * hs, -0.09, s * 0.36 * hs, 0.07, 'glow', '-y');
    b.pop();
    // Cable drum on the right flank (spins when firing).
    b.use('drum');
    k.use('gun'); b.push().move(tx - 0.02, y, 0.46).rotX(X).cyl(0.18, 0.18, 0.16, 10).pop();
    k.use('haz'); b.push().move(tx - 0.02, y, 0.46).rotX(X).cyl(0.13, 0.13, 0.18, 10).pop();
    k.blk(tx + 0.1, y + 0.1, 0.46, 0.06, 0.06, 0.2, 'dark', 0.01);
    // Long launcher tube and harpoon.
    b.use('barrel');
    const hl = [0.95, 1.15, 1.35][F - 1], hx = tx + 0.3;
    k.use('gun'); b.push().move(hx + hl / 2, y, 0).rotZ(X).cyl(0.1, 0.13, hl, 10).pop();
    k.blk(hx + 0.12, y, 0, 0.16, 0.3, 0.3, 'panel', 0.03);
    k.blk(hx + hl * 0.6, y, 0, 0.08, 0.28, 0.28, 'gunLite', 0.02);
    k.use('steel'); b.push().move(hx + hl + 0.12, y, 0).rotZ(X).cyl(0.04, 0.04, 0.32, 6).pop();
    const ax = hx + hl + 0.28;
    k.prism([[ax + 0.36, 0], [ax, 0.16], [ax + 0.07, 0], [ax, -0.16]], y - 0.045, y + 0.045, 'steel', 0.015);
    k.prism([[ax + 0.14, 0], [ax - 0.12, 0.22], [ax - 0.05, 0], [ax - 0.12, -0.22]], y - 0.03, y + 0.03, 'panelDeep', 0.01);
    k.lamp('glow', () => b.push().move(ax + 0.1, y + 0.05, 0).box(0.16, 0.02, 0.03).pop());
    b.use('hull');
    return done(k, { muzzle: ax + 0.36, muzzleY: y, S: 1.05, height: 1.9,
      parts: [{ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.25 },
        { name: 'drum', on: 'turret', kind: 'spin', axis: 'z', by: 'fire', p: [tx - 0.02, y, 0.46], model: true, kick: 9 },
        { name: 'tail', on: 'hull', kind: 'sway', p: [rx + 0.08, 0.5, rz], model: true, amp: 0.25 }] });
  },

  // Tắc Kè, trickshot: a flat gecko crawler. Four limbs splay diagonally from a low body, each ending in a wheel with a
  // lit toe pad; the head is a broad wedge with big round-rimmed eyes on its sides; the tail coils up in a vertical spiral behind it.
  // The turret is a ricochet launcher: a disc on a spindle between two angled deflector plates. Form II adds limb
  // armour and a spare-disc magazine; III a second deflector pair, lit strips and antennas.
  tacke(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    b.use('hull');
    const WR = 0.25, feet = [[0.95, 0.92], [-0.75, 0.95]];
    for (const [fx, fz] of feet) for (const s of [-1, 1]) {
      const hip = [fx * 0.45, 0.42, s * 0.34], knee = [fx * 0.8, 0.62, s * (fz - 0.25)];
      k.beam(hip, knee, 0.16, 0.14, 'gun');
      k.beam(knee, [fx, 0.48, s * (fz - 0.14)], 0.13, 0.12, 'panel');
      k.blk(knee[0], knee[1], knee[2], 0.18, 0.16, 0.18, 'under', 0.04);
      k.lamp('glow', () => b.push().move(fx, WR, s * (fz + 0.12)).rotX(X).cyl(WR * 0.3, WR * 0.3, 0.02, 8).pop());
      if (F >= 2) k.plate((hip[0] + knee[0]) / 2, 0.64, s * ((hip[2] * s + knee[2] * s) / 2), 0.36, 0.05, 0.24, { col: 'panel', insert: null, ry: -s * Math.sign(fx) * 0.6 });
    }
    // Body: low flat lozenge with a panel back, a broad wedge head and side eyes.
    k.prism([[0.62, 0.36], [0.8, 0.2], [0.8, -0.2], [0.62, -0.36], [-0.7, -0.4], [-0.9, -0.24], [-0.9, 0.24], [-0.7, 0.4]], 0.26, 0.56, 'under', 0.05);
    k.plate(-0.1, 0.6, 0, 1.2, 0.07, 0.66, { insert: 'panel', split: 2 });
    k.prism([[1.36, 0.14], [1.36, -0.14], [1.12, -0.38], [0.74, -0.32], [0.74, 0.32], [1.12, 0.38]], 0.3, 0.58, 'gun', 0.05);
    k.plate(1.06, 0.6, 0, 0.5, 0.05, 0.56, { col: 'panel', insert: null });
    for (const s of [-1, 1]) {
      k.oct(0.98, 0.6, s * 0.34, 0.13, 0.12, 'steel', 0.02);
      k.light(0.98, 0.66, s * 0.34, 0.06, LAMP.amber, '+y');
      k.strip(-0.1, 0.32, s * 0.41, 1.0, 'x');
    }
    // Tail coiled up in a vertical spiral behind the body (chameleon), tighter and longer each form.
    b.use('tail');
    const n = [7, 9, 11][F - 1], tail = [[-0.86, 0.42]];
    for (let i = 0; i <= n; i++) {
      const t = i / 11, r = 0.46 * (1 - 0.62 * t), a = -PI / 2 - t * 1.75 * PI;
      tail.push([-1.42 + Math.cos(a) * r, 0.92 + Math.sin(a) * r]);
    }
    for (let i = 0; i < tail.length - 1; i++) {
      const w = 0.3 - i * 0.016;
      k.beam([tail[i][0], tail[i][1], 0], [tail[i + 1][0], tail[i + 1][1], 0], w * 0.9, w * 0.8, i % 2 ? 'panel' : 'gun', 0.04);
    }
    const te = tail[tail.length - 1];
    k.lamp('glow', () => b.push().move(te[0], te[1], 0).box(0.1, 0.1, 0.12).pop());

    // Ricochet launcher.
    b.use('turret');
    const tx = -0.05, y = 0.86;
    k.oct(tx, 0.68, 0, 0.36, 0.08, 'dark');
    k.blk(tx - 0.05, 0.78, 0, 0.6, 0.14, 0.5, 'gun', 0.05);
    for (const s of [-1, 1]) {
      // Deflector plates canted outwards, the bank shot's guides.
      k.plate(tx + 0.38, 0.88, s * 0.24, 0.62, 0.22, 0.05, { col: 'panel', insert: null, ry: -s * 0.45 });
      k.strip(tx + 0.38, 1.0, s * 0.24, 0.5, 'x');
      if (F === 3) k.plate(tx + 0.6, 0.86, s * 0.42, 0.4, 0.16, 0.04, { col: 'trim', insert: null, ry: -s * 0.75 });
    }
    k.light(tx - 0.2, 0.87, 0, 0.04, LAMP.green, '+y');
    if (F >= 2) { k.blk(tx - 0.42, 0.98, 0, 0.26, 0.36, 0.3, 'panel', 0.04); k.antenna(tx - 0.42, 1.16, 0.1, 0.6); }
    if (F === 3) k.antenna(tx - 0.42, 1.16, -0.1, 0.75);
    k.antenna(tx - 0.3, 0.86, -0.22, 0.6);
    b.use('disc');
    const dr = [0.2, 0.23, 0.26][F - 1], dx = tx + 0.3;
    k.use('steel'); b.push().move(dx, y, 0).cyl(dr, dr, 0.04, 12).pop();
    k.use('dark'); b.push().move(dx, y, 0).cyl(dr * 0.4, dr * 0.4, 0.06, 8).pop();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; k.blk(dx + Math.cos(a) * dr, y, Math.sin(a) * dr, 0.07, 0.03, 0.07, 'trim', 0.01); }
    k.lamp('glow', () => b.push().move(dx, y + 0.03, 0).cyl(dr * 0.75, dr * 0.75, 0.01, 12).pop());
    b.use('wheel'); wheel(k, WR, 0.18);
    b.use('hull');
    return done(k, { muzzle: dx + dr + 0.15, muzzleY: y, S: 1, height: 1.6,
      parts: [{ name: 'wheel', on: 'hull', kind: 'roll', axis: 'z', r: WR, at: feet.flatMap(([x, z]) => [[x, WR, z], [x, WR, -z]]) },
        { name: 'disc', on: 'turret', kind: 'spin', axis: 'y', by: 'time', rate: 9, p: [dx, y, 0], model: true },
        { name: 'tail', on: 'hull', kind: 'sway', p: [-0.86, 0.42, 0], model: true, amp: 0.12 }] });
  },

  // Hắc Hổ, bruiser: a black tiger. Low wide hull on broad tracks, orange tiger stripes across the skirts and deck, and
  // two heavy claw arms reaching forward from the front corners, three steel talons each (they snap on every shot).
  // The squat turret is a flamethrower: wide flat nozzle, fuel tanks on its back. Form II adds skirts, shoulder plates and
  // a third tank; III lit claws, a roof gatling and antennas.
  hacho(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    // Black paint: the panel colour is a charcoal, the orange trim does the talking.
    k.c.panel = k.c.under.clone().lerp(k.c.dark, 0.3); k.c.panelDeep = k.c.dark.clone();
    b.use('hull');
    for (const s of [-1, 1]) {
      k.trackPod(-0.35, s * 0.66, 1.9, 0.4, 0.56, { insert: null, skirt: F >= 2, light: LAMP.amber });
      for (let i = 0; i < 3; i++) k.plate(-0.85 + i * 0.45, 0.65, s * 0.66, 0.12, 0.04, 0.42, { col: 'trim', insert: null, ry: 0.45 });
      if (F >= 2) for (let i = 0; i < 2; i++) { k.use('trim'); b.push().move(-0.65 + i * 0.55, 0.36, s * 0.95).rotX(PI / 2).rotY(0.5).box(0.1, 0.012, 0.24).pop(); }
    }
    k.prism(rect(1.05, -1.2, 0.46, 0.52, 0.12), 0.22, 0.66, 'under', 0.05);
    k.plate(0.82, 0.64, 0, 0.5, 0.08, 0.9, { rz: -0.4, insert: 'trim', split: 1, greeble: false });
    k.plate(-0.45, 0.7, 0, 1.2, 0.07, 0.94, { insert: 'panel', split: 1, greeble: false });
    for (let i = 0; i < 3; i++) k.blk(-0.85 + i * 0.32, 0.745, 0, 0.1, 0.02, 0.8, 'trim', 0.005);
    for (const s of [-1, 1]) k.light(1.08, 0.46, s * 0.26, 0.05, LAMP.amber, '+x');
    k.blk(-1.22, 0.5, 0, 0.08, 0.2, 0.7, 'dark', 0.02);

    // Claw arms: shoulder block, forearm, palm, three talons.
    const parts = [];
    for (const [s, nm] of [[-1, 'clawL'], [1, 'clawR']]) {
      const sh = [0.5, 0.66, s * 0.66], wr = [1.5, 0.52, s * 1.1];
      k.blk(sh[0], sh[1], sh[2], 0.36, 0.3, 0.3, 'gun', 0.06);
      if (F >= 2) k.plate(sh[0], sh[1] + 0.18, sh[2], 0.42, 0.06, 0.34, { col: 'trim', insert: null });
      b.use(nm);
      k.beam(sh, wr, 0.34, 0.3, 'panel', 0.06);
      k.beam([sh[0] + 0.2, sh[1] + 0.12, sh[2] + s * 0.05], [wr[0] - 0.2, wr[1] + 0.12, wr[2] - s * 0.02], 0.2, 0.08, 'trim', 0.02);
      k.blk(wr[0], wr[1], wr[2], 0.34, 0.28, 0.42, 'gun', 0.06);
      for (let j = -1; j <= 1; j++) {
        const z0 = wr[2] + j * 0.14, tip = [wr[0] + 0.6 - Math.abs(j) * 0.08, 0.26, z0 - s * 0.14];
        k.beam([wr[0] + 0.12, wr[1], z0], [wr[0] + 0.4, 0.46, z0 - s * 0.05], 0.1, 0.11, 'steel', 0.025);
        k.beam([wr[0] + 0.4, 0.46, z0 - s * 0.05], tip, 0.07, 0.08, 'steel', 0.02);
        if (F === 3) k.lamp('glow', () => b.rod([wr[0] + 0.4, 0.51, z0 - s * 0.05], [tip[0], tip[1] + 0.04, tip[2]], 0.014, 4));
      }
      b.use('hull');
      parts.push({ name: nm, on: 'hull', kind: 'snap', axis: 'y', p: sh, model: true, a0: 0, amt: s * 0.3 });
    }

    b.use('turret');
    const tx = -0.3, y = 0.98;
    k.oct(tx, 0.78, 0, 0.5, 0.08, 'dark');
    k.prism([[tx + 0.5, 0.3], [tx + 0.58, 0.18], [tx + 0.58, -0.18], [tx + 0.5, -0.3], [tx - 0.4, -0.46], [tx - 0.52, -0.34], [tx - 0.52, 0.34], [tx - 0.4, 0.46]], 0.82, 1.14, 'gun', 0.06);
    k.prism(rect(tx + 0.4, tx - 0.4, 0.22, 0.34, 0.08), 1.13, 1.19, 'panel', 0.02);
    for (const s of [-1, 1]) k.blk(tx + 0.02, 1.195, s * 0.14, 0.42, 0.02, 0.08, 'trim', 0.005);
    for (const s of [-1, 1]) k.light(tx + 0.585, 1.04, s * 0.12, 0.04, LAMP.amber, '+x');
    // Fuel tanks on the back.
    const tanks = F >= 2 ? [-0.24, 0, 0.24] : [-0.14, 0.14];
    for (const z of tanks) {
      k.use('gunLite'); b.push().move(tx - 0.62, 1.02, z).cyl(0.1, 0.1, 0.4, 8).pop();
      k.use('trim'); b.push().move(tx - 0.62, 1.1, z).cyl(0.105, 0.105, 0.06, 8).pop();
    }
    k.antenna(tx - 0.3, 1.18, 0.3, 0.7);
    if (F === 3) { k.gatling(tx - 0.05, 1.32, -0.2, 0.4, 0.045, 6); k.antenna(tx - 0.3, 1.18, -0.3, 0.8); }
    b.use('barrel');
    const nl = [0.5, 0.6, 0.7][F - 1], nx = tx + 0.55;
    k.beam([nx, y, 0], [nx + nl, y, 0], 0.26, 0.14, 'gun', 0.03);
    k.blk(nx + nl, y, 0, 0.1, 0.12, 0.38, 'dark', 0.03);
    k.strip(nx + nl + 0.05, y, 0, 0.32, 'z');
    k.use('steel'); b.rod([nx + 0.05, y - 0.1, 0.08], [nx + nl - 0.05, y - 0.1, 0.08], 0.025, 5);
    b.use('hull');
    parts.push({ name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.15 });
    return done(k, { muzzle: nx + nl + 0.06, muzzleY: y, S: 1.32, height: 1.8, parts });
  },

  // Băng Nha, control (ice): an icebreaker on short wide tracks. An octagonal stepped hull with a split ram bow, two
  // long ivory tusks curving down from the bow (the walrus), frost emitter towers on the four corners (they pulse) and a
  // turret firing a cluster of lit ice spikes. Form II adds skirts and more crystals; III a ring of crystals on the
  // turret, lit strips and antennas.
  bang(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    b.use('hull');
    for (const s of [-1, 1]) k.trackPod(-0.05, s * 0.6, 1.8, 0.36, 0.5, { insert: 'panel', skirt: F >= 2, decal: F >= 2 ? 'x' : null });
    const oc = [[1.15, 0.3], [1.15, -0.3], [0.7, -0.78], [-0.7, -0.78], [-1.1, -0.4], [-1.1, 0.4], [-0.7, 0.78], [0.7, 0.78]];
    k.prism(oc, 0.32, 0.62, 'gun', 0.05);
    k.prism(oc.map(([x, z]) => [x * 0.82 - 0.05, z * 0.8]), 0.61, 0.7, 'panel', 0.03);
    k.blk(0.0, 0.26, 0, 1.6, 0.12, 0.8, 'under', 0.03);
    // Ram bow and tusks.
    k.prism([[1.42, 0], [1.12, 0.3], [1.0, 0.3], [1.0, -0.3], [1.12, -0.3]], 0.26, 0.5, 'gunLite', 0.04);
    for (const s of [-1, 1]) {
      const tk = [[1.1, 0.5, s * 0.3], [1.45, 0.44, s * 0.38], [1.75, 0.26, s * 0.42], [1.9, 0.06, s * 0.38]];
      for (let i = 0; i < 3; i++) k.beam(tk[i], tk[i + 1], 0.17 - i * 0.04, 0.17 - i * 0.04, 'trim', 0.04);
      k.blk(1.12, 0.5, s * 0.3, 0.12, 0.24, 0.24, 'steel', 0.03);
      k.blk(1.1, 0.48, s * 0.3, 0.14, 0.16, 0.14, 'gun', 0.04);
      k.light(1.155, 0.56, s * 0.12, 0.045, LAMP.blue, '+x');
    }
    if (F === 3) for (const s of [-1, 1]) k.strip(0, 0.66, s * 0.68, 1.2, 'x');
    // Frost emitter towers (instanced, pulsing).
    b.use('emit');
    const ch = [0.5, 0.62, 0.74][F - 1];
    k.oct(0, 0.1, 0, 0.19, 0.2, 'gun', 0.03);
    k.use('steel'); b.push().move(0, 0.22, 0).cyl(0.17, 0.17, 0.05, 8).pop();
    k.lamp('glow', () => {
      b.push().move(0, 0.24 + ch * 0.4, 0).cyl(0.09, 0.12, ch * 0.8, 6).pop();
      b.push().move(0, 0.24 + ch * 0.8 + 0.1, 0).cyl(0, 0.09, 0.2, 6).pop();
      for (const a of [0.4, 2.5, 4.6]) b.push().move(Math.cos(a) * 0.1, 0.3 + ch * 0.25, Math.sin(a) * 0.1).rotX(Math.sin(a) * 0.45).rotZ(-Math.cos(a) * 0.45).move(0, ch * 0.22, 0).cyl(0, 0.06, ch * 0.45, 5).pop();
    });
    const em = [[0.62, 0.62], [0.62, -0.62], [-0.72, 0.6], [-0.72, -0.6]];

    b.use('turret');
    const tx = -0.2, y = 1.0;
    k.oct(tx, 0.76, 0, 0.44, 0.08, 'dark');
    k.oct(tx, 0.9, 0, 0.4, 0.22, 'gun', 0.05, 1.1);
    k.oct(tx - 0.03, 1.04, 0, 0.3, 0.08, 'panel', 0.03, 1.1);
    for (const s of [-1, 1]) k.light(tx + 0.42, 0.92, s * 0.12, 0.04, LAMP.blue, '+x');
    k.antenna(tx - 0.36, 1.0, 0.2, 0.7);
    if (F >= 2) { k.sensor(tx - 0.2, 1.16, -0.18, 0.14, LAMP.blue, 2); k.antenna(tx - 0.36, 1.0, -0.2, 0.6); }
    if (F === 3) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.5; k.lamp('glow', () => b.push().move(tx + Math.cos(a) * 0.3, 1.14, Math.sin(a) * 0.3).rotZ(Math.cos(a) * -0.3).rotX(Math.sin(a) * 0.3).cyl(0, 0.05, 0.2, 5).pop()); }
    // Spike launcher: a short housing with lit crystal spikes in its mouth.
    b.use('barrel');
    const hx = tx + 0.38, hl = [0.42, 0.5, 0.58][F - 1];
    k.blk(hx + hl / 2, y, 0, hl, 0.26, 0.34, 'gun', 0.05);
    k.plate(hx + hl / 2, y + 0.14, 0, hl * 0.9, 0.04, 0.3, { col: 'panel', insert: null });
    const sp = F === 1 ? [[0, 0]] : F === 2 ? [[0.05, -0.08], [-0.05, 0.08]] : [[0.06, -0.09], [-0.06, 0.09], [0.06, 0.09]];
    for (const [dy, dz] of sp) k.lamp('glow', () => b.push().move(hx + hl + 0.16, y + dy, dz).rotZ(X).cyl(0, 0.08, 0.4, 5).pop());
    b.use('hull');
    return done(k, { muzzle: hx + hl + 0.36, muzzleY: y, S: 1, height: 1.8,
      parts: [{ name: 'emit', on: 'hull', kind: 'pulse', own: true, at: em.map(([x, z]) => [x, 0.64, z]) },
        { name: 'barrel', on: 'turret', kind: 'recoil', amt: 0.2 }] });
  },

  // Sam Thép, control (magnet): a horseshoe crab. A wide half-octagon carapace in stepped layers sits low over hidden
  // tracks, a hexagonal abdomen plate with blunt edge spines follows, and a long telson spike trails behind. The turret
  // is a horseshoe magnet lying flat with its steel poles forward and lit coils on both arms; a violet arc burns between
  // the poles. Form II adds coil pylons on the carapace; III a bigger magnet with a coil drum behind it.
  samthep(b, st, trim, form) {
    const k = new Kit(b, st, trim, form), F = k.F;
    b.use('hull');
    for (const s of [-1, 1]) k.trackPod(-0.1, s * 0.56, 1.6, 0.26, 0.4, { cover: false });
    // Carapace: three stepped layers, front edge rounded by many corners.
    const shell = (r, x0) => {
      const p = [];
      for (let i = 0; i <= 8; i++) { const a = -PI / 2 + i * PI / 8; p.push([x0 + Math.cos(a) * r * 0.9, Math.sin(a) * r]); }
      return p.concat([[x0 - 0.35, r * 0.95], [x0 - 0.35, -r * 0.95]]);
    };
    k.prism(shell(1.0, 0.25), 0.3, 0.46, 'gun', 0.04);
    k.prism(shell(0.82, 0.22), 0.45, 0.6, 'panel', 0.04);
    k.prism(shell(0.56, 0.18), 0.59, 0.7, 'gun', 0.03);
    for (const s of [-1, 1]) { k.light(0.62, 0.66, s * 0.3, 0.045, LAMP.red, '+y'); k.strip(0.3, 0.47, s * 0.86, 0.6, 'x'); }
    k.blk(0.0, 0.2, 0, 1.6, 0.14, 0.7, 'under', 0.03);
    // Abdomen plate with blunt edge spines.
    k.prism([[-0.12, 0.62], [-0.86, 0.46], [-1.12, 0.18], [-1.12, -0.18], [-0.86, -0.46], [-0.12, -0.62]], 0.3, 0.5, 'gun', 0.04);
    k.prism([[-0.18, 0.46], [-0.82, 0.34], [-1.0, 0.12], [-1.0, -0.12], [-0.82, -0.34], [-0.18, -0.46]], 0.49, 0.56, 'panelDeep', 0.02);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x = -0.35 - i * 0.24, z = s * (0.58 - i * 0.1);
      k.prism([[x + 0.07, z], [x - 0.02, z + s * 0.16], [x - 0.08, z]], 0.32, 0.42, 'trim', 0.01);
    }
    if (F >= 2) for (const s of [-1, 1]) {
      k.oct(0.0, 0.72, s * 0.62, 0.09, 0.2, 'gun', 0.02);
      k.lamp('glow', () => b.push().move(0.0, 0.86, s * 0.62).cyl(0.07, 0.07, 0.08, 8).pop());
    }
    k.antenna(-0.7, 0.55, 0.15, 0.7);
    if (F === 3) { k.antenna(-0.7, 0.55, -0.15, 0.8); k.antenna(-0.9, 0.55, 0, 0.6); }

    // Telson spike.
    b.use('tail');
    const tl = [0.8, 0.95, 1.1][F - 1];
    k.beam([-1.1, 0.4, 0], [-1.1 - tl * 0.55, 0.38, 0], 0.16, 0.12, 'gun', 0.04);
    k.beam([-1.1 - tl * 0.55, 0.38, 0], [-1.1 - tl, 0.32, 0], 0.09, 0.08, 'trim', 0.02);
    k.strip(-1.1 - tl * 0.3, 0.47, 0, tl * 0.4, 'x');

    // Horseshoe magnet: two arms, a curved back, steel pole shoes, lit coils, an arc between the poles.
    b.use('turret');
    const tx = 0.15, y = 0.92, R = [0.4, 0.44, 0.48][F - 1], al = [0.5, 0.6, 0.7][F - 1];
    k.oct(tx, 0.74, 0, 0.36, 0.08, 'dark');
    k.blk(tx - 0.1, 0.82, 0, 0.4, 0.12, 0.4, 'gun', 0.04);
    const arc = []; for (let i = 0; i <= 6; i++) { const a = PI / 2 + i * PI / 6; arc.push([tx + Math.cos(a) * R, y, Math.sin(a) * R]); }
    for (let i = 0; i < 6; i++) k.beam(arc[i], arc[i + 1], 0.2, 0.2, 'panel', 0.03);
    for (const s of [-1, 1]) {
      k.beam([tx, y, s * R], [tx + al, y, s * R], 0.2, 0.2, 'panel', 0.03);
      k.blk(tx + al + 0.09, y, s * R, 0.18, 0.22, 0.22, 'steel', 0.03);
      for (let i = 0; i < 2 + (F >= 2 ? 1 : 0); i++) k.lamp('glow', () => b.push().move(tx + 0.1 + i * 0.14, y, s * R).rotZ(X).cyl(0.125, 0.125, 0.05, 8).pop());
    }
    k.lamp('glow', () => b.rod([tx + al + 0.12, y, -R + 0.08], [tx + al + 0.12, y, R - 0.08], 0.02, 4));
    const parts = [{ name: 'tail', on: 'hull', kind: 'sway', p: [-1.1, 0.4, 0], model: true, amp: 0.14 }];
    if (F === 3) {
      // Field generator behind the magnet: a coil drum on the turret back.
      k.use('gun'); b.push().move(tx - 0.5, 0.95, 0).rotX(X).cyl(0.14, 0.14, 0.5, 8).pop();
      for (const z of [-0.15, 0, 0.15]) k.lamp('glow', () => b.push().move(tx - 0.5, 0.95, z).rotX(X).cyl(0.15, 0.15, 0.04, 8).pop());
    }
    b.use('hull');
    return done(k, { muzzle: tx + al + 0.2, muzzleY: y, S: 1.08, height: 1.6, parts });
  },
});
