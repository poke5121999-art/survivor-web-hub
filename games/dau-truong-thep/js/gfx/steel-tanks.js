// Tanks drawn in the steel style (steel.js). A key listed here opts in: buildModel (mechs.js) uses this design for
// every form instead of the hand design / frame / chassis plus role kit. Each design builds all three forms itself:
//   I  plain: hull, running gear, main weapon, a few lights, one antenna;
//   II added armour and a second weapon module: skirts with decals, stacked plates, a gatling or missile box;
//   III heavy sci-fi refit: extra weapon modules, lit strips, three or four antennas.
// Same contract as DESIGNS in mechs.js (batches hull, turret, barrel, tread and named parts; returns the info).
import { Kit, LAMP, PI } from './steel.js';

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
