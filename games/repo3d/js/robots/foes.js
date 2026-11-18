import { SIDES, crewDims, rigBiped, legParts, armParts, torsoParts, hand, slimLeg, slimArm, claw } from './parts.js';
import { buildImpostor } from './crew.js';

const BASE = { d: 0x2a2c31, k: 0x8f959d, v: 0x0a0d10 };
const pal = (o) => ({ ...BASE, ...o });
const PI = Math.PI;

// ---------- gunner: tall hunched sniper, periscope head with one lens, rifle forearm ----------
function gunner(B) {
  const D = crewDims({ thigh: 0.42, shin: 0.42, chestW: 0.3, chestH: 0.26, chestD: 0.19, shX: 0.2, upper: 0.29, fore: 0.27, t: 0.68, at: 0.66, neckY: 0.27 });   // gaunt (menace pass)
  rigBiped(B, D);
  B.J.torso.rotation.x = 0.28; B.J.neck.rotation.x = -0.25;
  for (const [S, sg] of SIDES) legParts(B, D, S, sg);
  armParts(B, D, 'L', 1);
  armParts(B, D, 'R', -1, { noFore: true, noHand: true });
  torsoParts(B, D, { noPack: true });
  // periscope head
  const h = 'head';
  B.box(h, 'paint', 0.13, 0.3, 0.16, { p: [0, 0.14, 0], b: 0.03, k: 2, taper: [0.8, 0.9], c: 'm' });
  B.box(h, 'paint', 0.15, 0.06, 0.2, { p: [0, 0.24, 0.03], b: 0.018, k: 2, c: 's' });
  B.cyl(h, 'dark', 0.055, 0.06, 0.07, { ax: 'z', p: [0, 0.24, 0.13], seg: 18, c: 0x16171a });
  B.cyl(h, 'glass', 0.045, 0.045, 0.012, { ax: 'z', p: [0, 0.24, 0.165], seg: 18 });
  B.cyl(h, 'glow', 0.02, 0.02, 0.006, { ax: 'z', p: [0, 0.24, 0.172], seg: 12, i: 3.5 });
  B.torus(h, 'glow', 0.036, 0.003, { p: [0, 0.24, 0.17], ts: 20, rs: 3, i: 2 });
  for (const [, sg] of SIDES) { B.cyl(h, 'metal', 0.02, 0.02, 0.05, { ax: 'z', p: [sg * 0.06, 0.2, 0.1], seg: 10 }); B.vent(h, sg * 0.066, 0.1, 0, 0.08, 0.1, 4, { ax: 'x', sgn: sg }); }
  B.rod(h, 'metal', [0.04, 0.27, -0.05], [0.05, 0.45, -0.08], 0.006); B.rod(h, 'metal', [-0.03, 0.27, -0.05], [-0.035, 0.38, -0.07], 0.005);
  B.sphere(h, 'glow2', 0.01, { p: [0.05, 0.455, -0.08], i: 3 });
  // rifle forearm
  const E = 'elR';
  B.cyl(E, 'metal', 0.044, 0.044, 0.1, { ax: 'x' });
  B.box(E, 'paint', 0.09, 0.2, 0.11, { p: [0, -0.1, 0], b: 0.025, k: 2, c: 'm' });
  B.box(E, 'dark', 0.06, 0.08, 0.1, { p: [0, -0.18, -0.02], b: 0.012 });
  B.cyl(E, 'paint', 0.032, 0.036, 0.26, { p: [0, -0.32, 0.01], seg: 12, c: 's' });
  for (let i = 0; i < 4; i++) B.box(E, 'dark', 0.075, 0.012, 0.075, { p: [0, -0.24 - i * 0.04, 0.01], b: 0.004 });
  B.cyl(E, 'metal', 0.014, 0.014, 0.3, { p: [0, -0.58, 0.01], seg: 10, c: 0x5a5f66 });
  B.cyl(E, 'metal', 0.024, 0.022, 0.07, { p: [0, -0.74, 0.01], seg: 10 });
  for (const zz of [-0.012, 0.012]) B.box(E, 'dark', 0.05, 0.012, 0.006, { p: [0, -0.75, 0.01 + zz * 2.2], c: 0x0c0c0e, b: 0.001 });
  B.box(E, 'glow', 0.01, 0.01, 0.01, { p: [0, -0.4, 0.05], i: 3 });
  B.cyl(E, 'paint', 0.06, 0.06, 0.05, { ax: 'x', p: [-0.07, -0.18, 0], seg: 18, c: 'a' });
  // backpack ammo drum + feed
  const Hh = D.chestH, z = -D.chestD / 2 - 0.09;
  B.cyl('chest', 'paint', 0.11, 0.11, 0.12, { ax: 'z', p: [0, Hh * 0.55, z], seg: 22, c: 's' });
  B.cyl('chest', 'metal', 0.06, 0.06, 0.13, { ax: 'z', p: [0, Hh * 0.55, z], seg: 16 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; B.bolt('chest', Math.sin(a) * 0.09, Hh * 0.55 + Math.cos(a) * 0.09, z - 0.061, '-z', 0.007); }
  B.tube('chest', 'dark', [[-0.08, Hh * 0.5, z + 0.03], [-0.2, Hh * 0.6, -0.02], [-0.24, Hh * 0.2, 0.04], [-0.22, -0.1, 0.06]], 0.016, { c: 0x2a2620 });
  return { loco: 'biped', stride: 1.3, atk: 'shoot', height: 1.82, downLift: 0.14 };
}

// ---------- rook: quadruped battering ram ----------
function rook(B) {
  B.joint('sc', 'root'); B.joint('base', 'sc');
  B.joint('body', 'base', 0, 0.72, 0);
  const b = 'body';
  B.box(b, 'paint', 0.62, 0.42, 0.95, { p: [0, 0.02, -0.05], b: 0.06, k: 2, taper: [0.82, 0.9], c: 'm' });
  B.box(b, 'dark', 0.5, 0.3, 0.9, { p: [0, -0.12, -0.05], b: 0.03 });
  for (const [, sg] of SIDES) {
    B.box(b, 'paint', 0.05, 0.3, 0.7, { p: [sg * 0.31, 0.0, -0.08], b: 0.018, k: 2, c: 's' });
    for (let i = 0; i < 5; i++) B.bolt(b, sg * 0.338, 0.1, -0.38 + i * 0.15, sg > 0 ? 'x' : '-x', 0.01);
    B.vent(b, sg * 0.34, -0.05, -0.1, 0.25, 0.12, 4, { ax: 'x', sgn: sg });
  }
  for (let i = 0; i < 4; i++) B.box(b, 'paint', 0.5, 0.03, 0.1, { p: [0, 0.24, 0.25 - i * 0.2], b: 0.01, k: 1, c: i % 2 ? 'd' : 's' });
  for (const [, sg] of SIDES) {
    B.cyl(b, 'metal', 0.05, 0.06, 0.32, { p: [sg * 0.17, 0.38, -0.38], seg: 14, c: 0x56595e });
    B.cyl(b, 'glow2', 0.042, 0.042, 0.01, { p: [sg * 0.17, 0.545, -0.38], seg: 14, i: 2.2 });
    B.torus(b, 'metal', 0.06, 0.008, { ax: 'y', p: [sg * 0.17, 0.52, -0.38], ts: 18 });
  }
  // ram plate + prongs
  B.joint('head', 'body', 0, -0.05, 0.45);
  const h = 'head';
  B.ext(h, 'paint', [[-0.38, -0.25], [0.38, -0.25], [0.42, 0.05], [0.28, 0.28], [-0.28, 0.28], [-0.42, 0.05]], 0.16, { p: [0, 0, 0.08], b: 0.025, c: 's' });
  for (let i = -3; i <= 3; i++) B.box(h, 'dark', 0.06, 0.48, 0.02, { p: [i * 0.11, 0.01, 0.165], r: [0, 0, 0.6], b: 0.004, c: i % 2 ? 0x1b1c1e : 0x2b2b26 });
  B.box(h, 'dark', 0.4, 0.07, 0.04, { p: [0, 0.08, 0.17], b: 0.012, c: 0x101113 });
  for (const [, sg] of SIDES) {
    B.box(h, 'glow', 0.07, 0.025, 0.01, { p: [sg * 0.09, 0.08, 0.19], r: [0, 0, sg * -0.25], b: 0.006, i: 3 });
    B.lathe(h, 'metal', [[0, 0], [0.065, 0.02, 1], [0.05, 0.12], [0, 0.32]], { seg: 10, p: [sg * 0.3, 0.12, 0.17], r: [PI / 2 - 0.25, 0, -sg * 0.5], c: 0xc0c4c8 });
    B.torus(h, 'paint', 0.066, 0.012, { p: [sg * 0.3, 0.12, 0.17], r: [-0.25, -sg * 0.5, 0], ts: 18, c: 'a' });
  }
  for (const [x, y] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.2], [0.3, 0.2]]) B.bolt(h, x, y, 0.165, 'z', 0.014);
  // legs
  const legs = [];
  for (const [name, x, z, front] of [['FL', 0.26, 0.28, 1], ['FR', -0.26, 0.28, 1], ['BL', 0.26, -0.42, 0], ['BR', -0.26, -0.42, 0]]) {
    const H = 'h' + name, K = 'k' + name, sg = Math.sign(x);
    B.joint(H, 'body', x, -0.1, z); B.joint(K, H, 0, -0.32, 0);
    B.sphere(H, 'metal', 0.09, { seg: 12, rows: 8 });
    B.box(H, 'paint', 0.16, 0.32, 0.2, { p: [sg * 0.02, -0.16, 0], b: 0.04, k: 2, tb: [0.8, 0.85], c: 'm' });
    B.rod(H, 'metal', [0, -0.05, front ? -0.1 : 0.1], [0, -0.3, front ? -0.08 : 0.08], 0.018);
    B.cyl(K, 'metal', 0.06, 0.06, 0.16, { ax: 'x' });
    B.box(K, 'paint', 0.13, 0.22, 0.15, { p: [0, -0.13, 0], b: 0.03, k: 2, tb: [0.85, 0.9], c: 's' });
    B.cyl(K, 'dark', 0.09, 0.1, 0.08, { p: [0, -0.27, 0.01], seg: 14, c: 0x1b1c1f });
    B.box(K, 'paint', 0.17, 0.035, 0.19, { p: [0, -0.3, 0.02], b: 0.01, c: 'd' });
    legs.push([H, K, (name === 'FL' || name === 'BR') ? 0 : PI, front ? 1 : -1]);
  }
  B.tube(b, 'dark', [[0.2, 0.2, 0.3], [0.32, 0.3, 0.42], [0.25, 0.15, 0.5]], 0.018, { c: 0x1a1b1d });
  B.tube(b, 'dark', [[-0.2, 0.2, 0.3], [-0.32, 0.3, 0.42], [-0.25, 0.15, 0.5]], 0.018, { c: 0x1a1b1d });
  return {
    loco: 'quad', stride: 1.4, legs, legAmp: 0.4, height: 1.25, down: 'side', downLift: 0.2,
    extra: ({ J, S, atkCurve }) => {
      const [wd, st] = atkCurve(S.a, 0.5, 0.62);
      const stomp = wd > 0 ? Math.max(0, Math.sin(S.a * PI * 12)) : 0;
      J.hFL.rotation.x -= stomp * 0.5 * wd; J.body.rotation.x += 0.22 * (wd + st) ; J.base.position.z += 0.45 * st;
      J.head.rotation.x += 0.15 * wd;
    },
  };
}

// ---------- banger: small round bomb on stubby legs with a fuse ----------
function banger(B) {
  B.joint('sc', 'root'); B.joint('base', 'sc');
  B.joint('hips', 'base', 0, 0.2, 0); B.joint('torso', 'hips', 0, 0, 0);
  for (const [S, sg] of SIDES) { B.joint('th' + S, 'hips', sg * 0.1, -0.02, 0); B.joint('kn' + S, 'th' + S, 0, -0.09, 0); B.joint('ft' + S, 'kn' + S, 0, -0.07, 0); }
  B.joint('body', 'torso', 0, 0.2, 0);
  const b = 'body';
  B.sphere(b, 'paint', 0.21, { seg: 24, rows: 16, c: 'm', wear: 0.6 });
  for (const y of [-0.08, 0.08]) B.torus(b, 'paint', Math.sqrt(0.21 * 0.21 - y * y) + 0.004, 0.014, { ax: 'y', p: [0, y, 0], ts: 32, rs: 6, c: 's' });
  B.torus(b, 'metal', 0.215, 0.012, { p: [0, 0, 0], ax: 'x', ts: 32, rs: 6 });
  for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; B.bolt(b, Math.sin(a) * 0.222, Math.cos(a) * 0.222, 0, 'z', 0.007); }
  B.box(b, 'dark', 0.2, 0.06, 0.06, { p: [0, 0.03, 0.18], b: 0.02, c: 0x121315 });
  B.box(b, 'glow', 0.15, 0.018, 0.01, { p: [0, 0.03, 0.212], b: 0.005, i: 2.6 });
  B.box(b, 'paint', 0.07, 0.07, 0.02, { p: [0, -0.08, 0.195], b: 0.008, c: 'a', r: [0.4, 0, PI / 4] });
  B.cyl(b, 'metal', 0.05, 0.06, 0.05, { p: [0, 0.21, 0], seg: 14 });
  B.joint('fuse', 'body', 0, 0.24, 0);
  B.tube('fuse', 'dark', [[0, 0, 0], [0.01, 0.06, 0], [0.04, 0.11, 0.01], [0.07, 0.13, 0.02]], 0.009, { c: 0x3a2e22 });
  B.sphere('fuse', 'glow2', 0.022, { p: [0.072, 0.134, 0.02], seg: 10, rows: 8, i: 3.5 });
  for (const [S, sg] of SIDES) {
    B.sphere('th' + S, 'metal', 0.04); B.rod('th' + S, 'dark', [0, 0, 0], [0, -0.09, 0], 0.022);
    B.cyl('kn' + S, 'metal', 0.03, 0.03, 0.06, { ax: 'x' }); B.box('kn' + S, 'paint', 0.06, 0.07, 0.07, { p: [0, -0.04, 0], b: 0.015, c: 's' });
    B.box('ft' + S, 'paint', 0.09, 0.05, 0.13, { p: [0, -0.035, 0.02], b: 0.018, k: 2, c: 'm' });
    B.box('ft' + S, 'dark', 0.095, 0.015, 0.14, { p: [0, -0.055, 0.02], b: 0.004, c: 0x141416 });
  }
  return {
    loco: 'biped', stride: 0.5, legAmp: 0.7, height: 0.6, down: 'side', downLift: 0.2, atk: 'none',
    extra: ({ J, S }) => {
      const lit = S.a > 0 ? 1 : 0;
      J.body.rotation.z = 0.08 * Math.sin(S.ph) * S.w;
      J.body.position.y += 0.02 * Math.abs(Math.sin(S.ph)) * S.w;
      const sw = 1 + lit * 0.08 * (0.5 + 0.5 * Math.sin(S.t * (10 + 30 * S.a)));
      J.body.scale.setScalar(sw);
      J.fuse.rotation.z = 0.15 * Math.sin(S.t * 6);
      S.glowMul = 1 + lit * (0.6 + 0.6 * Math.sin(S.t * (14 + 40 * S.a)));
    },
  };
}

// ---------- gnome: tiny sprinter, spire sensor, oversized machete ----------
function gnome(B) {
  const D = crewDims({ ankle: 0.04, shin: 0.11, thigh: 0.11, legX: 0.06, waist: 0.03, abd: 0.05, chestW: 0.18, chestH: 0.12, chestD: 0.13, shX: 0.11, shY: 0.09, neckY: 0.12, neckH: 0.02, upper: 0.11, fore: 0.1, t: 0.6, at: 0.55, ht: 0.6 });
  rigBiped(B, D);
  for (const [S, sg] of SIDES) {
    const T = 'th' + S, K = 'kn' + S, F = 'ft' + S;
    B.sphere(T, 'metal', 0.03); B.box(T, 'paint', 0.06, 0.1, 0.07, { p: [0, -0.06, 0], b: 0.016, k: 2, c: 'm' });
    B.cyl(K, 'metal', 0.025, 0.025, 0.06, { ax: 'x' }); B.box(K, 'paint', 0.055, 0.1, 0.06, { p: [0, -0.055, 0], b: 0.015, k: 2, c: 's', tb: [0.8, 0.8] });
    B.box(F, 'paint', 0.07, 0.04, 0.12, { p: [0, -0.02, 0.025], b: 0.015, k: 2, c: 'm' }); B.box(F, 'dark', 0.075, 0.012, 0.13, { p: [0, -0.034, 0.025], b: 0.004, c: 0x141416 });
  }
  B.box('hips', 'dark', 0.13, 0.06, 0.1, { b: 0.015 });
  B.cyl('torso', 'dark', 0.04, 0.045, 0.06, { p: [0, 0.02, 0] });
  B.box('chest', 'paint', 0.19, 0.14, 0.14, { p: [0, 0.06, 0], b: 0.035, k: 2, c: 'm', tb: [0.85, 0.9] });
  B.box('chest', 'paint', 0.12, 0.05, 0.02, { p: [0, 0.07, 0.07], b: 0.008, c: 'a' });
  B.vent('chest', 0, 0.07, -0.072, 0.08, 0.06, 3, { sgn: -1 });
  for (const [S, sg] of SIDES) {
    B.sphere('sh' + S, 'metal', 0.028);
    B.box('sh' + S, 'paint', 0.05, 0.1, 0.05, { p: [0, -0.05, 0], b: 0.014, k: 2, c: 's' });
    B.box('el' + S, 'paint', 0.045, 0.09, 0.05, { p: [0, -0.045, 0], b: 0.012, k: 2, c: 'm' });
  }
  claw(B, 'haL', 1, 0.05, 2, 'k', 0.6);
  // machete
  const j = 'haR';
  B.cyl(j, 'dark', 0.016, 0.016, 0.07, { ax: 'z', p: [0, -0.02, 0.0], c: 0x3a2a20 });
  B.ext(j, 'metal', [[0, -0.018], [0.32, -0.03], [0.4, 0.0], [0.36, 0.035], [0, 0.018]], 0.008, { p: [0, -0.02, 0.03], r: [0, -PI / 2, -PI / 2 + 0.5], b: 0.002, c: 0xc6cbd2, wear: 0.8 });
  B.ext(j, 'metal', [[0.06, 0.012], [0.38, 0.026], [0.36, 0.032], [0.06, 0.018]], 0.009, { p: [0, -0.02, 0.03], r: [0, -PI / 2, -PI / 2 + 0.5], b: 0, c: 0xeef2f6 });
  // head: wide visor dome + tall spire
  const h = 'head';
  B.sphere(h, 'paint', 0.11, { p: [0, 0.07, 0], s: [1.1, 0.85, 1], seg: 18, rows: 12, c: 'm' });
  B.box(h, 'dark', 0.15, 0.05, 0.06, { p: [0, 0.07, 0.085], b: 0.02, c: 0x111214 });
  B.cyl(h, 'glow', 0.026, 0.026, 0.01, { ax: 'z', p: [0, 0.07, 0.117], seg: 14, i: 3.2 });
  B.lathe(h, 'paint', [[0, 0], [0.085, 0.0, 1], [0.07, 0.06], [0.04, 0.2], [0.012, 0.34], [0, 0.36]], { seg: 14, p: [0, 0.13, -0.02], r: [-0.3, 0, 0], c: 's' });
  for (const y of [0.05, 0.13, 0.21]) B.torus(h, 'metal', 0.075 - y * 0.18, 0.006, { ax: 'y', p: [0, 0.13 + y * 0.95, -0.02 - y * 0.3], r: [-0.3, 0, 0], ts: 18, rs: 4 });
  B.sphere(h, 'glow2', 0.012, { p: [0, 0.465, -0.13], i: 3 });
  return { loco: 'biped', stride: 0.55, legAmp: 0.75, armAmp: 0.7, height: 0.62, atk: 'swipe', downLift: 0.08 };
}

// ---------- mimic: riveted strongbox on four spider legs, toothed lid ----------
function mimic(B) {
  B.joint('sc', 'root'); B.joint('base', 'sc');
  B.joint('body', 'base', 0, 0.3, 0);
  const b = 'body', W = 0.72, H = 0.3, Dp = 0.46;
  B.box(b, 'paint', W, H, Dp, { p: [0, 0, 0], b: 0.02, k: 1, c: 'm' });
  for (let i = 0; i < 6; i++) B.box(b, 'paint', 0.005, H * 0.9, Dp + 0.004, { p: [-W / 2 + (W * (i + 0.5)) / 6, 0, 0], c: 0x3a2716, b: 0.001 });
  for (const x of [-0.25, 0.25]) B.box(b, 'metal', 0.06, H + 0.012, Dp + 0.012, { p: [x, 0, 0], b: 0.008, c: 's' });
  for (const x of [-0.25, 0.25]) for (const y of [-0.1, 0.08]) { B.bolt(b, x, y, Dp / 2 + 0.006, 'z', 0.01, { c: 's' }); B.bolt(b, x, y, -Dp / 2 - 0.006, '-z', 0.01, { c: 's' }); }
  for (const [, sg] of SIDES) { B.box(b, 'metal', 0.012, 0.05, 0.16, { p: [sg * (W / 2 + 0.006), 0.02, 0], b: 0.004, c: 's' }); }
  B.box(b, 'dark', W - 0.04, 0.02, Dp - 0.04, { p: [0, H / 2 - 0.005, 0], c: 0x1a0606 });
  for (let i = 0; i < 9; i++) for (const zz of [Dp / 2 - 0.03]) B.lathe(b, 'metal', [[0, 0], [0.016, 0.004], [0, 0.05]], { seg: 5, p: [-W / 2 + 0.05 + i * ((W - 0.1) / 8), H / 2, zz], c: 0xddd6c4 });
  B.joint('lid', 'body', 0, H / 2, -Dp / 2);
  const l = 'lid';
  B.box(l, 'paint', W, 0.06, Dp, { p: [0, 0.03, Dp / 2], b: 0.02, c: 'm' });
  B.prof(l, 'paint', [[0, 0.0], [Dp, 0.0], [Dp, 0.06], [Dp * 0.85, 0.11], [Dp * 0.5, 0.14], [Dp * 0.15, 0.11], [0, 0.06]], W - 0.01, { b: 0.02, bs: 2, p: [0, 0.005, 0], c: 'm' });
  for (let i = 0; i < 5; i++) B.box(l, 'paint', 0.005, 0.005, Dp, { p: [-W / 2 + (W * (i + 1)) / 6, 0.148, Dp / 2], c: 0x3a2716, b: 0 });
  for (const x of [-0.25, 0.25]) B.prof(l, 'metal', [[0, 0.0], [Dp, 0.0], [Dp, 0.06], [Dp * 0.85, 0.11], [Dp * 0.5, 0.14], [Dp * 0.15, 0.11], [0, 0.06]].map(([z, y]) => [z * 1.02 - 0.004, y * 1.06]), 0.062, { b: 0.008, p: [x, 0.002, 0], c: 's' });
  B.box(l, 'metal', 0.08, 0.08, 0.02, { p: [0, 0.03, Dp + 0.01], b: 0.01, c: 's' });
  B.cyl(l, 'dark', 0.014, 0.014, 0.03, { ax: 'z', p: [0, 0.03, Dp + 0.02], c: 0x0c0c0d });
  for (let i = 0; i < 9; i++) B.lathe(l, 'metal', [[0, 0], [0.017, 0.004], [0, 0.06]], { seg: 5, p: [-W / 2 + 0.05 + i * ((W - 0.1) / 8), 0.0, Dp - 0.035], r: [PI, 0, 0], c: 0xddd6c4 });
  B.joint('eyes', 'body', 0, H / 2 - 0.03, 0.05);
  for (const [, sg] of SIDES) B.sphere('eyes', 'glow', 0.028, { p: [sg * 0.12, 0, 0], s: [1.4, 0.8, 1], i: 3 });
  B.tube('eyes', 'dark', [[0, -0.01, -0.05], [0, 0.03, 0.05], [0.02, 0.0, 0.16], [0.05, -0.04, 0.22]], 0.02, { c: 0x5a1a20 });
  const legs = [];
  let i = 0;
  for (const [x, z] of [[0.3, 0.18], [-0.3, 0.18], [0.3, -0.18], [-0.3, -0.18]]) {
    const sg = Math.sign(x), H2 = 'lg' + i, K = 'lk' + i;
    B.joint(H2, 'body', x, -0.1, z); B.J[H2].rotation.y = sg > 0 ? (z > 0 ? -0.6 : 0.6) : (z > 0 ? 0.6 : -0.6);
    B.joint(K, H2, sg * 0.24, 0.12, 0);
    B.sphere(H2, 'metal', 0.04);
    B.beam(H2, 'paint', [0, 0, 0], [sg * 0.24, 0.12, 0], 0.05, 0.05, { b: 0.014, c: 's' });
    B.sphere(K, 'metal', 0.032);
    B.beam(K, 'metal', [0, 0, 0], [sg * 0.08, -0.4, 0], 0.035, 0.035, { b: 0.01, taper: [0.5, 0.5], c: 'k' });
    B.lathe(K, 'metal', [[0, 0], [0.02, 0.01], [0, 0.07]], { seg: 6, p: [sg * 0.08, -0.4, 0], r: [PI, 0, 0], c: 0x3a3a3c });
    legs.push([H2, K, i === 0 || i === 3 ? 0 : PI, sg]);
    i++;
  }
  return {
    loco: 'spider', stride: 0.8, legs, legAmp: 0.4, height: 0.7, down: 'slump', downLift: 0.15,
    extra: ({ J, S }) => {
      const bite = S.a > 0 ? Math.abs(Math.sin(S.a * PI * 3)) : 0;
      J.lid.rotation.x = -(0.08 + 0.05 * Math.sin(S.t * 2.2)) * (1 - S.d) - 0.9 * bite - 0.15 * S.w;
      J.eyes.position.y += 0.01 * Math.sin(S.t * 3);
      J.body.rotation.x -= 0.15 * bite;
    },
  };
}

// ---------- ghost: hovering drone wearing a cracked porcelain mask; slack cable arms, four ducted rotors ----------
function ghost(B) {
  B.joint('sc', 'root'); B.joint('base', 'sc', 0, 0.35, 0);
  B.joint('body', 'base', 0, 1.0, 0);
  const b = 'body';
  // core: dark segmented pod, slightly egg shaped
  B.lathe(b, 'paint', [[0, -0.26], [0.12, -0.24], [0.2, -0.16], [0.235, -0.02], [0.225, 0.1], [0.17, 0.2], [0.08, 0.255], [0, 0.26]], { seg: 22, hard: 40, c: 's' });
  for (const y of [-0.12, 0.02, 0.14]) B.torus(b, 'metal', 0.215 - Math.abs(y) * 0.35, 0.01, { ax: 'y', p: [0, y, 0], ts: 30, c: 0x4a505a });
  B.cyl(b, 'dark', 0.05, 0.08, 0.08, { p: [0, -0.29, 0], seg: 14 });
  B.sphere(b, 'glow2', 0.035, { p: [0, -0.34, 0], i: 2.2 });
  // the mask: pale shell on the front, eyes of different size, a crack, no mouth
  B.joint('head', 'body', 0, 0.02, 0.2);
  const h = 'head';
  B.lathe(h, 'paint', [[0, -0.205], [0.04, -0.2], [0.1, -0.17], [0.15, -0.11], [0.17, -0.02], [0.165, 0.06], [0.13, 0.13], [0.07, 0.165], [0, 0.17]], { seg: 22, hard: 40, c: 'm', ax: 'z', p: [0, 0, 0.0], s: [1.15, 1.25, 0.6] });
  B.sphere(h, 'dark', 0.05, { p: [0.068, 0.04, 0.09], s: [1, 0.8, 0.5], c: 0x050608 });
  B.sphere(h, 'dark', 0.034, { p: [-0.066, 0.05, 0.094], s: [1, 0.9, 0.5], c: 0x050608 });
  B.sphere(h, 'glow', 0.012, { p: [0.064, 0.035, 0.112], i: 4 });
  B.sphere(h, 'glow', 0.009, { p: [-0.064, 0.048, 0.112], i: 4 });
  B.box(h, 'dark', 0.007, 0.13, 0.008, { p: [0.015, 0.1, 0.098], r: [0, 0, 0.35], c: 0x1a1612, b: 0 });
  B.box(h, 'dark', 0.006, 0.08, 0.008, { p: [0.04, -0.04, 0.1], r: [0, 0, -0.5], c: 0x1a1612, b: 0 });
  B.box(h, 'dark', 0.06, 0.005, 0.008, { p: [0, -0.12, 0.085], c: 0x3a3430, b: 0 });
  // four rotors on struts, a ring each
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + i * PI / 2, x = Math.sin(a) * 0.36, z = Math.cos(a) * 0.36;
    B.rod(b, 'metal', [Math.sin(a) * 0.18, 0.12, Math.cos(a) * 0.18], [x, 0.16, z], 0.014, { c: 0x5a606a });
    B.torus(b, 'paint', 0.11, 0.018, { ax: 'y', p: [x, 0.16, z], ts: 24, c: 'a' });
    B.cyl(b, 'dark', 0.02, 0.02, 0.04, { p: [x, 0.16, z], seg: 10 });
    const r = 'rt' + i; B.joint(r, 'body', x, 0.17, z);
    B.box(r, 'dark', 0.2, 0.006, 0.03, { c: 0x0e0f12, b: 0 }); B.box(r, 'dark', 0.03, 0.006, 0.2, { c: 0x0e0f12, b: 0 });
  }
  // three slack cable arms ending in hooks
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 0.5, j = 'tn' + i;
    B.joint(j, 'body', Math.sin(a) * 0.12, -0.24, Math.cos(a) * 0.12);
    const L = 0.3 + 0.07 * i;
    B.tube(j, 'dark', [[0, 0, 0], [Math.sin(a) * 0.1, -L * 0.35, Math.cos(a) * 0.1], [Math.sin(a) * 0.12, -L * 0.75, Math.cos(a) * 0.12], [Math.sin(a) * 0.08, -L, Math.cos(a) * 0.08]], 0.012, { c: 0x16181c, ts: 14, rs: 5 });
    const ex = Math.sin(a) * 0.08, ez = Math.cos(a) * 0.08;
    B.rod(j, 'metal', [ex, -L, ez], [ex + Math.cos(a) * 0.05, -L - 0.07, ez - Math.sin(a) * 0.05], 0.008, { c: 0x8a8f96 });
    B.rod(j, 'metal', [ex, -L, ez], [ex - Math.cos(a) * 0.05, -L - 0.07, ez + Math.sin(a) * 0.05], 0.008, { c: 0x8a8f96 });
  }
  return {
    loco: 'hover', hoverY: 0.35, down: 'drop', height: 1.55, lean: 0.25, bobHz: 0.9,
    extra: ({ J, S }) => {
      for (let i = 0; i < 4; i++) J['rt' + i].rotation.y += S.t * (38 + i * 3);
      for (let i = 0; i < 3; i++) { const t = J['tn' + i]; t.rotation.x += 0.18 * Math.sin(S.t * 1.3 + i * 2) - 0.35 * S.w + 0.6 * (S.a > 0 ? Math.sin(S.a * PI) : 0); t.rotation.z += 0.12 * Math.cos(S.t * 0.9 + i); }
      // the mask twitches: small sudden head jerks, then stares
      const jerk = Math.sin(S.t * 0.7) > 0.93 ? Math.sin(S.t * 40) * 0.25 : 0;
      J.head.rotation.z += jerk + 0.12 * Math.sin(S.t * 0.4);
      J.head.rotation.y += S.look * 0.8;
      J.body.rotation.y += 0.08 * Math.sin(S.t * 0.5);
      S.glowMul = 0.85 + 0.2 * Math.sin(S.t * 2.3) * Math.sin(S.t * 0.37);
    },
  };
}

// ---------- wallhand: breach plate in a wall (z = 0 plane), segmented arm, claw with an eye in the palm ----------
function wallhand(B) {
  B.joint('sc', 'root'); B.joint('base', 'sc', 0, 1.15, 0);
  const w = 'base';
  // breach in the wall plane z = 0: dark hole, torn metal petals bent outward, bolted collar ring
  B.cyl(w, 'dark', 0.36, 0.36, 0.02, { ax: 'z', p: [0, 0, 0.0], seg: 28, c: 0x050506 });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * PI * 2 + 0.2, L = 0.18 + (i % 3) * 0.07;
    B.ext(w, 'paint', [[-0.07, 0], [0.07, 0], [0.03, L * 0.7], [0.0, L], [-0.04, L * 0.6]], 0.012, { p: [Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.02], r: [0, 0, a - PI / 2], b: 0.004, c: 'a', wear: 1 });
    B.ext(w, 'paint', [[-0.07, 0], [0.07, 0], [0.03, L * 0.7], [0.0, L], [-0.04, L * 0.6]], 0.012, { m: null, p: [Math.cos(a) * 0.37, Math.sin(a) * 0.37, 0.045 + (i % 2) * 0.02], r: [0.5 + (i % 3) * 0.2, 0, a - PI / 2], ro: 'ZXY', b: 0.004, c: 0x4a4440, wear: 1 });
  }
  B.torus(w, 'paint', 0.3, 0.045, { ts: 36, rs: 10, p: [0, 0, 0.04], c: 's' });
  for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; B.bolt(w, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.088, 'z', 0.014); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2 + 0.4; B.tube(w, 'dark', [[Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.01], [Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.12], [Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.22]], 0.016, { c: 0x1b1a1c }); }
  const segs = 3; let parent = 'base';
  const lens = [0.3, 0.28, 0.26];
  for (let i = 0; i < segs; i++) {
    const j = 'a' + i, L = lens[i], th = 0.16 - i * 0.02;
    B.joint(j, parent, 0, 0, i === 0 ? 0.06 : lens[i - 1]);
    B.sphere(j, 'metal', th * 0.55, { seg: 14, rows: 10 });
    B.cyl(j, 'dark', th * 0.32, th * 0.32, L, { ax: 'z', p: [0, 0, L / 2], seg: 12, c: 0x1d1c1e });
    B.prof(j, 'paint', [[0.03, -th * 0.4], [L - 0.04, -th * 0.35], [L - 0.02, 0], [L - 0.04, th * 0.4], [0.05, th * 0.5], [0.02, 0]], th * 1.05, { b: 0.025, c: i % 2 ? 's' : 'm' });
    for (const [, sg] of SIDES) B.rod(j, 'metal', [sg * th * 0.55, -th * 0.2, 0.05], [sg * th * 0.5, -th * 0.15, L - 0.05], 0.012);
    B.box(j, 'paint', th * 0.4, 0.02, L * 0.5, { p: [0, th * 0.48, L * 0.5], b: 0.008, k: 2, c: 'a' });
    B.bolt(j, 0, th * 0.5, L * 0.25, 'y', 0.01); B.bolt(j, 0, th * 0.5, L * 0.75, 'y', 0.01);
    parent = j;
  }
  B.joint('hand', parent, 0, 0, lens[segs - 1]);
  const h = 'hand';
  B.cyl(h, 'metal', 0.07, 0.08, 0.06, { ax: 'z', p: [0, 0, 0.02], seg: 16 });
  B.prof(h, 'paint', [[0.03, -0.05], [0.22, -0.04], [0.25, 0.0], [0.2, 0.05], [0.04, 0.06]], 0.26, { b: 0.03, c: 'm' });
  B.cyl(h, 'dark', 0.06, 0.06, 0.02, { p: [0, -0.045, 0.14], seg: 20, c: 0x0b0b0c });
  B.sphere(h, 'glow', 0.045, { p: [0, -0.05, 0.14], s: [1, 0.45, 1], i: 3.4 });
  B.torus(h, 'metal', 0.065, 0.009, { ax: 'y', p: [0, -0.05, 0.14], ts: 24 });
  for (let f = 0; f < 4; f++) {
    const thumb = f === 3, x = thumb ? 0.13 : -0.085 + f * 0.085, z = thumb ? 0.08 : 0.24;
    const j1 = 'f' + f, j2 = 'g' + f;
    B.joint(j1, h, x, 0, z); if (thumb) B.J[j1].rotation.y = 1.1;
    B.sphere(j1, 'metal', 0.03);
    B.beam(j1, 'paint', [0, 0, 0.01], [0, 0, 0.17], 0.042, 0.04, { b: 0.012, k: 2, c: 's' });
    B.joint(j2, j1, 0, 0, 0.18); B.J[j2].rotation.x = 0.55;
    B.sphere(j2, 'metal', 0.025);
    B.beam(j2, 'paint', [0, 0, 0.0], [0, 0, 0.13], 0.034, 0.032, { b: 0.01, k: 2, taper: [0.65, 0.65], c: 'm' });
    B.lathe(j2, 'metal', [[0, 0], [0.016, 0.006], [0, 0.08]], { seg: 6, p: [0, -0.004, 0.13], r: [PI / 2 + 0.45, 0, 0], c: 0xd8dce0 });
  }
  return {
    loco: 'wall', height: 1.6, down: 'slump', downLift: 0,
    extra: ({ J, S, atkCurve }) => {
      const [wd, st] = atkCurve(S.a, 0.3, 0.5);
      const reach = Math.max(S.carry, st);
      const idle = 1 - reach;
      J.a0.rotation.x += 0.5 * idle - 0.35 * wd - 0.1 * st + 0.08 * Math.sin(S.t * 1.1);
      J.a1.rotation.x += 0.35 * idle + 0.3 * wd + 0.15 * Math.sin(S.t * 1.3 + 1);
      J.a2.rotation.x += 0.25 * idle + 0.3 * wd + 0.12 * Math.sin(S.t * 1.7 + 2);
      J.a0.rotation.y += 0.35 * Math.sin(S.t * 0.7) * idle + S.look * 0.4;
      J.a1.rotation.y += 0.25 * Math.sin(S.t * 0.9 + 1) * idle;
      J.a0.position.z -= 0.12 * idle;
      for (let f = 0; f < 4; f++) { J['f' + f].rotation.x += 0.25 - 0.55 * wd + 0.8 * st; J['g' + f].rotation.x += 0.15 - 0.3 * wd + 0.8 * st; }
      J.hand.rotation.z += 0.2 * Math.sin(S.t * 0.8) * idle;
      S.glowMul = 1 + 0.8 * wd;
    },
  };
}

// ---------- mummy: tracked tank wrapped in cable, tether launcher ----------
function mummy(B) {
  B.joint('sc', 'root'); B.joint('base', 'sc');
  B.joint('body', 'base', 0, 0, 0);
  const b = 'body';
  const wheels = [];
  for (const [S, sg] of SIDES) {
    B.box(b, 'dark', 0.2, 0.3, 0.95, { p: [sg * 0.33, 0.17, 0], b: 0.09, k: 2, c: 0x1e1f22 });
    for (let i = 0; i < 12; i++) B.box(b, 'dark', 0.21, 0.025, 0.05, { p: [sg * 0.33, 0.015, -0.4 + i * 0.073], b: 0.006, c: 0x2a2a2c });
    for (let i = 0; i < 12; i++) B.box(b, 'dark', 0.21, 0.025, 0.05, { p: [sg * 0.33, 0.325, -0.4 + i * 0.073], b: 0.006, c: 0x2a2a2c });
    for (let i = 0; i < 4; i++) {
      const j = 'w' + S + i; B.joint(j, b, sg * 0.43, 0.17, -0.33 + i * 0.22); wheels.push(j);
      B.cyl(j, 'metal', 0.1, 0.1, 0.03, { ax: 'x', seg: 18, c: 0x5a5d62 });
      for (let k = 0; k < 5; k++) { const a = (k / 5) * PI * 2; B.bolt(j, sg * 0.017, Math.sin(a) * 0.06, Math.cos(a) * 0.06, sg > 0 ? 'x' : '-x', 0.008); }
      B.box(j, 'dark', 0.035, 0.03, 0.03, { p: [sg * 0.017, 0, 0.0], c: 0x111111 });
    }
    B.box(b, 'paint', 0.24, 0.05, 1.0, { p: [sg * 0.34, 0.37, 0], b: 0.015, c: 's' });
  }
  B.box(b, 'paint', 0.5, 0.18, 0.75, { p: [0, 0.4, 0], b: 0.04, k: 2, c: 's' });
  B.joint('hips', b, 0, 0.55, -0.02); B.joint('torso', 'hips', 0, 0.02, 0); B.joint('chest', 'torso', 0, 0.12, 0);
  B.J.torso.rotation.x = 0.25;
  B.cyl('hips', 'metal', 0.18, 0.2, 0.08, { seg: 20 });
  B.cyl('torso', 'dark', 0.14, 0.16, 0.16, { p: [0, 0.06, 0], seg: 16 });
  const c = 'chest';
  B.box(c, 'paint', 0.56, 0.42, 0.42, { p: [0, 0.2, 0], b: 0.08, k: 2, c: 'm', taper: [1.05, 1], tb: [0.85, 0.9] });
  for (let i = 0; i < 9; i++) {
    const y = 0.02 + i * 0.045, tw = (i % 2 ? 0.1 : -0.1);
    const pts = []; for (let k = 0; k <= 16; k++) { const a = (k / 16) * PI * 2; pts.push([Math.sin(a) * 0.305, y + Math.sin(a * 2 + i) * 0.01 + tw * Math.cos(a) * 0.1, Math.cos(a) * 0.24]); }
    B.tube(c, 'paint', pts, 0.016, { closed: true, ts: 40, rs: 5, c: i % 3 ? 'a' : 0x8e8676, wear: 0.4 });
  }
  B.box(c, 'dark', 0.2, 0.12, 0.05, { p: [0, 0.22, 0.22], b: 0.02, c: 0x16171a });
  B.vent(c, 0, 0.22, 0.25, 0.14, 0.07, 4, {});
  B.joint('neck', c, 0, 0.42, 0.06); B.joint('head', 'neck', 0, 0.0, 0);
  B.sphere('head', 'paint', 0.11, { p: [0, 0.05, 0.02], s: [1, 0.75, 1], c: 's', t1: PI * 0.6 });
  B.cyl('head', 'dark', 0.112, 0.112, 0.04, { p: [0, 0.03, 0.02], seg: 20 });
  B.cyl('head', 'glow', 0.03, 0.03, 0.01, { ax: 'z', p: [0, 0.035, 0.13], seg: 14, i: 3.2 });
  for (const [S, sg] of SIDES) {
    B.joint('sh' + S, c, sg * 0.33, 0.33, 0); B.joint('el' + S, 'sh' + S, 0, -0.3, 0); B.joint('ha' + S, 'el' + S, 0, -0.3, 0);
    B.sphere('sh' + S, 'metal', 0.09);
    B.box('sh' + S, 'paint', 0.2, 0.16, 0.22, { p: [sg * 0.04, 0.05, 0], b: 0.05, k: 2, c: 'm' });
    B.box('sh' + S, 'paint', 0.13, 0.28, 0.14, { p: [0, -0.16, 0], b: 0.035, k: 2, c: 'm' });
    B.cyl('el' + S, 'metal', 0.06, 0.06, 0.15, { ax: 'x' });
    B.box('el' + S, 'paint', 0.14, 0.26, 0.15, { p: [0, -0.15, 0], b: 0.035, k: 2, c: 's', tb: [0.85, 0.85] });
    for (let i = 0; i < 5; i++) B.torus('sh' + S, 'paint', 0.08, 0.012, { ax: 'y', p: [0, -0.06 - i * 0.045, 0], r: [0.15 * (i % 2 ? 1 : -1), 0, 0.2], ts: 20, rs: 5, c: 'a' });
    for (let i = 0; i < 4; i++) B.torus('el' + S, 'paint', 0.085, 0.012, { ax: 'y', p: [0, -0.06 - i * 0.05, 0], r: [0.2 * (i % 2 ? 1 : -1), 0, -0.15], ts: 20, rs: 5, c: 0x8e8676 });
  }
  hand(B, 'haL', 1, 1.4, 'k', 'm');
  const j = 'haR';
  B.cyl(j, 'metal', 0.06, 0.06, 0.06, { p: [0, -0.02, 0] });
  B.cyl(j, 'paint', 0.07, 0.07, 0.14, { ax: 'x', p: [0, -0.1, 0], seg: 18, c: 'm' });
  for (let i = 0; i < 5; i++) B.torus(j, 'paint', 0.072, 0.006, { ax: 'x', p: [-0.05 + i * 0.025, -0.1, 0], ts: 20, rs: 4, c: 'a' });
  B.cyl(j, 'metal', 0.025, 0.035, 0.12, { p: [0, -0.2, 0.0], seg: 10 });
  B.lathe(j, 'metal', [[0, 0], [0.045, 0.02, 1], [0.012, 0.04], [0, 0.1]], { seg: 8, p: [0, -0.26, 0], r: [PI, 0, 0], c: 0xc8ccd0 });
  B.tube('chest', 'paint', [[-0.2, 0.3, -0.2], [-0.4, 0.15, -0.15], [-0.42, -0.2, 0.05], [-0.34, -0.55, 0.06]], 0.014, { c: 'a' });
  return { loco: 'tread', wheels, height: 1.45, atk: 'throw', down: 'slump', downLift: 0.05 };
}

// ---------- brat: raccoon-like thief, masked face, ringed tail, loot sack ----------
function brat(B) {
  const D = crewDims({ ankle: 0.06, shin: 0.2, thigh: 0.2, legX: 0.09, waist: 0.05, abd: 0.09, chestW: 0.28, chestH: 0.2, chestD: 0.2, shX: 0.17, shY: 0.15, neckY: 0.2, neckH: 0.03, upper: 0.22, fore: 0.22, t: 0.85, at: 0.75, ht: 0.85 });
  rigBiped(B, D);
  B.J.torso.rotation.x = 0.45; B.J.neck.rotation.x = -0.45;
  B.J.knL.rotation.x = 0.35; B.J.knR.rotation.x = 0.35; B.J.thL.rotation.x = -0.35; B.J.thR.rotation.x = -0.35;
  for (const [S, sg] of SIDES) {
    const T = 'th' + S, K = 'kn' + S, F = 'ft' + S;
    B.sphere(T, 'metal', 0.05); B.box(T, 'paint', 0.12, 0.2, 0.15, { p: [0, -0.1, 0.01], b: 0.04, k: 2, c: 'm' });
    B.cyl(K, 'metal', 0.04, 0.04, 0.1, { ax: 'x' }); B.box(K, 'paint', 0.08, 0.2, 0.09, { p: [0, -0.1, 0], b: 0.025, k: 2, c: 's', tb: [0.8, 0.8] });
    B.box(F, 'paint', 0.1, 0.05, 0.17, { p: [0, -0.03, 0.04], b: 0.02, k: 2, c: 's' });
    for (const x of [-0.03, 0, 0.03]) B.box(F, 'metal', 0.022, 0.02, 0.04, { p: [x, -0.04, 0.13], b: 0.006, c: 'a' });
    B.sphere('sh' + S, 'metal', 0.045); B.box('sh' + S, 'paint', 0.08, 0.2, 0.08, { p: [0, -0.1, 0], b: 0.025, k: 2, c: 'm' });
    B.cyl('el' + S, 'metal', 0.032, 0.032, 0.08, { ax: 'x' }); B.box('el' + S, 'paint', 0.065, 0.2, 0.07, { p: [0, -0.1, 0], b: 0.02, k: 2, c: 's' });
    for (let i = 0; i < 2; i++) B.box('el' + S, 'paint', 0.068, 0.02, 0.073, { p: [0, -0.05 - i * 0.06, 0], c: 'a', b: 0.004 });
    claw(B, 'ha' + S, sg, 0.07, 3, 'k', 0.85);
  }
  B.box('hips', 'paint', 0.24, 0.12, 0.18, { b: 0.04, k: 2, c: 'm' });
  B.cyl('torso', 'dark', 0.08, 0.09, 0.12, { p: [0, 0.04, 0] });
  B.box('chest', 'paint', 0.3, 0.24, 0.24, { p: [0, 0.1, 0], b: 0.07, k: 2, c: 'm', tb: [0.85, 0.9] });
  B.box('chest', 'paint', 0.2, 0.16, 0.04, { p: [0, 0.09, 0.115], b: 0.03, k: 2, c: 'a' });
  B.vent('chest', 0, 0.09, 0.14, 0.1, 0.07, 3, {});
  // sack
  B.lathe('chest', 'paint', [[0, -0.12], [0.1, -0.1], [0.15, 0.0], [0.13, 0.1], [0.05, 0.16], [0.03, 0.2], [0.05, 0.23], [0, 0.24]], { seg: 14, p: [0.04, 0.12, -0.2], r: [-0.4, 0, 0.3], c: 0x6f5a3a, wear: 0.1 });
  B.tube('chest', 'dark', [[0.12, 0.2, 0.1], [0.05, 0.24, -0.05], [0.04, 0.27, -0.2]], 0.01, { c: 0x4a3a24 });
  // head: wide round head, ear discs, mask band, snout
  const h = 'head';
  B.sphere(h, 'paint', 0.15, { p: [0, 0.1, 0], s: [1.2, 0.9, 1], seg: 20, rows: 14, c: 'm' });
  B.box(h, 'dark', 0.34, 0.07, 0.12, { p: [0, 0.12, 0.08], b: 0.03, k: 2, c: 0x101114 });
  for (const [, sg] of SIDES) {
    B.sphere(h, 'glow', 0.026, { p: [sg * 0.07, 0.125, 0.145], s: [1.2, 0.8, 0.5], i: 3 });
    B.cyl(h, 'paint', 0.07, 0.07, 0.025, { ax: 'z', p: [sg * 0.13, 0.24, -0.02], r: [0, 0, sg * -0.4], seg: 18, c: 's' });
    B.cyl(h, 'dark', 0.045, 0.045, 0.028, { ax: 'z', p: [sg * 0.13, 0.24, -0.016], r: [0, 0, sg * -0.4], seg: 14, c: 0x161619 });
    B.ext(h, 'paint', [[0, 0], [0.06, 0.01], [0.04, -0.03]], 0.01, { p: [sg * 0.17, 0.08, 0.06], r: [0, sg * 0.4, 0], c: 'a' });
  }
  B.box(h, 'paint', 0.11, 0.08, 0.12, { p: [0, 0.05, 0.15], b: 0.035, k: 2, c: 'a', tb: [0.9, 1] });
  B.sphere(h, 'dark', 0.025, { p: [0, 0.07, 0.215], c: 0x0e0e10 });
  for (const [, sg] of SIDES) for (let i = 0; i < 2; i++) B.box(h, 'metal', 0.05, 0.003, 0.003, { p: [sg * 0.075, 0.05 - i * 0.015, 0.2], r: [0, sg * 0.3, sg * (0.1 + i * 0.15)] });
  // tail
  let parent = 'hips';
  for (let i = 0; i < 7; i++) {
    const j = 'tail' + i; B.joint(j, parent, 0, i === 0 ? 0.02 : 0, i === 0 ? -0.1 : -0.08);
    if (i === 0) B.J[j].rotation.x = -0.6;
    const r = 0.055 + Math.sin((i / 6) * PI) * 0.035;
    B.cyl(j, 'paint', r, r, 0.07, { ax: 'z', p: [0, 0, -0.04], seg: 14, c: i % 2 ? 's' : 'a', b: 0.012 });
    parent = j;
  }
  B.lathe(parent, 'paint', [[0, -0.07], [0.03, -0.05], [0.05, 0]], { ax: 'z', seg: 12, p: [0, 0, -0.08], c: 's' });
  return {
    loco: 'biped', stride: 0.85, legAmp: 0.6, armAmp: 0.6, height: 0.95, atk: 'grab', downLift: 0.12,
    extra: ({ J, S }) => { for (let i = 0; i < 7; i++) { J['tail' + i].rotation.y += 0.18 * Math.sin(S.t * 3 - i * 0.6); J['tail' + i].rotation.x += -0.05 + 0.05 * Math.sin(S.t * 2 - i * 0.5) + 0.06 * S.w; } },
  };
}

// ---------- headthrower: headless, blue fire neck, bandolier of spare heads ----------
function sparehead(B, j, p, r = 0.075, s = 1) {
  B.sphere(j, 'paint', r, { p, seg: 14, rows: 10, c: 'a' });
  B.box(j, 'dark', r * 1.4, r * 0.35, r * 0.5, { p: [p[0], p[1] + r * 0.1, p[2] + r * 0.72], b: r * 0.15, c: 0x101114 });
  for (const sg of [1, -1]) B.sphere(j, 'glow2', r * 0.16, { p: [p[0] + sg * r * 0.35, p[1] + r * 0.1, p[2] + r * 0.95], i: 3 * s });
  B.torus(j, 'metal', r * 0.98, r * 0.08, { ax: 'y', p: [p[0], p[1] - r * 0.25, p[2]], ts: 20 });
}
function headthrower(B) {
  const D = crewDims({ chestW: 0.34, chestH: 0.3, t: 0.76, at: 0.72, upper: 0.31, fore: 0.29 });   // gaunt, long arms (menace pass)
  rigBiped(B, D);
  for (const [S, sg] of SIDES) { legParts(B, D, S, sg); armParts(B, D, S, sg, { noHand: S === 'R' }); }
  torsoParts(B, D, { noPack: true });
  const h = 'head';
  B.lathe('neck', 'metal', [[0.07, -0.02], [0.1, 0.03, 1], [0.09, 0.06, 1], [0.06, 0.06]], { seg: 18 });
  B.joint('fire', 'neck', 0, 0.05, 0);
  B.lathe('fire', 'glow2', [[0.06, 0], [0.065, 0.06], [0.03, 0.16], [0, 0.24]], { seg: 12, i: 2.4 });
  B.lathe('fire', 'glow', [[0.035, 0], [0.035, 0.05], [0, 0.13]], { seg: 10, i: 3 });
  B.box('chest', 'paint', 0.42, 0.08, 0.26, { p: [0, D.chestH - 0.01, -0.01], b: 0.025, k: 2, c: 's' });
  for (const [, sg] of SIDES) B.box('chest', 'paint', 0.06, 0.1, 0.22, { p: [sg * 0.17, D.chestH + 0.05, -0.01], b: 0.015, c: 's', r: [0, 0, sg * -0.3] });
  B.beam('chest', 'dark', [0.17, D.chestH, 0.12], [-0.15, 0.0, 0.13], 0.05, 0.02, { c: 0x3a2a1e });
  for (let i = 0; i < 3; i++) { const t = 0.2 + i * 0.3; sparehead(B, 'chest', [0.17 - 0.32 * t, D.chestH - D.chestH * t, 0.18], 0.05, 0.7); }
  sparehead(B, 'haR', [0, -0.11, 0.02], 0.085);
  B.joint('headR', 'haR', 0, -0.11, 0.02);
  for (const z of [-0.035, 0.035]) B.beam('haR', 'metal', [0, -0.02, z], [0.0, -0.2, z * 1.5], 0.016, 0.016, {});
  B.vent('chest', 0, D.chestH * 0.5, -D.chestD / 2 - 0.006, 0.14, 0.12, 5, { sgn: -1 });
  return {
    loco: 'biped', stride: 1.1, height: 1.55, atk: 'throw', downLift: 0.15,
    extra: ({ J, S }) => { J.fire.scale.set(1 + 0.12 * Math.sin(S.t * 17), 1 + 0.3 * Math.sin(S.t * 11) + 0.4 * (S.a > 0 ? 1 : 0), 1 + 0.12 * Math.cos(S.t * 13)); J.fire.rotation.y = S.t * 2; S.glowMul = 0.85 + 0.2 * Math.sin(S.t * 23); },
  };
}

// ---------- minelayer: low six-legged beetle with a stack of disc mines ----------
function minelayer(B) {
  B.joint('sc', 'root'); B.joint('base', 'sc');
  B.joint('body', 'base', 0, 0.32, 0);
  const b = 'body';
  const shell = [[0, -0.06], [0.3, -0.06, 1], [0.34, 0.0, 1], [0.3, 0.08], [0.18, 0.15], [0, 0.17]];
  B.lathe(b, 'paint', shell, { seg: 26, s: [1, 1, 1.35], c: 'm' });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; B.box(b, 'dark', 0.004, 0.06, 0.2, { p: [Math.sin(a) * 0.24, 0.1, Math.cos(a) * 0.32], r: [0, a, 0.5 * Math.sin(a)], c: 0x161616, b: 0.001 }); }
  B.box(b, 'paint', 0.06, 0.012, 0.8, { p: [0, 0.165, 0], c: 's', b: 0.004 });
  B.cyl(b, 'dark', 0.29, 0.3, 0.05, { p: [0, -0.07, 0], s: [1, 1, 1.35], seg: 24, c: 0x1c1d20 });
  // mine stack
  for (let i = 0; i < 4; i++) {
    B.cyl(b, 'paint', 0.11, 0.11, 0.035, { p: [0, 0.2 + i * 0.042, -0.08], seg: 18, c: i % 2 ? 's' : 0x3a3d40, b: 0.008 });
    B.box(b, 'glow', 0.016, 0.01, 0.01, { p: [0.0, 0.2 + i * 0.042, 0.031], i: 3 });
  }
  for (const [, sg] of SIDES) B.rod(b, 'metal', [sg * 0.12, 0.17, -0.08], [sg * 0.12, 0.38, -0.08], 0.01);
  B.box(b, 'dark', 0.14, 0.08, 0.14, { p: [0, 0.0, -0.42], b: 0.03, c: 0x1a1a1c });
  B.box(b, 'paint', 0.16, 0.02, 0.16, { p: [0, 0.045, -0.42], b: 0.006, c: 'a' });
  B.joint('head', b, 0, 0.02, 0.42);
  B.box('head', 'paint', 0.22, 0.1, 0.12, { p: [0, 0, 0.03], b: 0.04, k: 2, c: 's' });
  for (const [x, y, r] of [[0.05, 0.02, 0.016], [-0.05, 0.02, 0.016], [0.085, -0.01, 0.01], [-0.085, -0.01, 0.01]]) B.sphere('head', 'glow', r, { p: [x, y, 0.09], i: 3 });
  for (const [, sg] of SIDES) { B.rod('head', 'metal', [sg * 0.06, 0.04, 0.05], [sg * 0.14, 0.14, 0.18], 0.005); B.sphere('head', 'metal', 0.01, { p: [sg * 0.14, 0.14, 0.18] }); }
  const legs = [];
  let i = 0;
  for (const z of [0.25, 0, -0.25]) for (const [, sg] of SIDES) {
    const H = 'lg' + i, K = 'lk' + i;
    B.joint(H, b, sg * 0.27, -0.02, z); B.J[H].rotation.y = sg * (z > 0 ? -0.4 : z < 0 ? 0.4 : 0) ;
    B.joint(K, H, sg * 0.2, 0.08, 0);
    B.sphere(H, 'metal', 0.035);
    B.beam(H, 'paint', [0, 0, 0], [sg * 0.2, 0.08, 0], 0.04, 0.035, { b: 0.01, c: 's' });
    B.sphere(K, 'metal', 0.026);
    B.beam(K, 'metal', [0, 0, 0], [sg * 0.1, -0.38, 0], 0.028, 0.028, { b: 0.008, taper: [0.4, 0.4], c: 'k' });
    legs.push([H, K, (i % 2 === 0) === (Math.round(z / 0.25) % 2 === 0) ? 0 : PI, sg]);
    i++;
  }
  return {
    loco: 'spider', stride: 0.6, legs, legAmp: 0.35, height: 0.55, down: 'slump', downLift: 0.15, idleLegs: true,
    extra: ({ J, S }) => { J.head.rotation.y += 0.35 * Math.sin(S.t * 2.7) * (1 - S.w * 0.5); J.head.rotation.x += 0.1 * Math.sin(S.t * 4.1); if (S.a > 0) J.body.position.y -= 0.06 * Math.sin(S.a * PI); },
  };
}

// ---------- gacha: unicycle clown with a capsule-machine head ----------
function gacha(B) {
  B.joint('sc', 'root'); B.joint('base', 'sc');
  B.joint('wheel', 'base', 0, 0.28, 0);
  B.torus('wheel', 'dark', 0.24, 0.04, { ax: 'x', ts: 36, rs: 10, c: 0x161618 });
  B.cyl('wheel', 'paint', 0.2, 0.2, 0.03, { ax: 'x', seg: 28, c: 's' });
  for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; B.box('wheel', 'paint', 0.035, 0.05, 0.04, { p: [0, Math.sin(a) * 0.205, Math.cos(a) * 0.205], r: [-a, 0, 0], c: i % 2 ? 'a' : 'm', b: 0.008 }); }
  B.cyl('wheel', 'metal', 0.05, 0.05, 0.12, { ax: 'x', seg: 16 });
  for (const [, sg] of SIDES) for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; B.bolt('wheel', sg * 0.062, Math.sin(a) * 0.032, Math.cos(a) * 0.032, sg > 0 ? 'x' : '-x', 0.006); }
  B.joint('hips', 'base', 0, 0.28, 0);
  for (const [, sg] of SIDES) { B.beam('hips', 'metal', [sg * 0.08, 0, 0], [sg * 0.06, 0.42, 0], 0.025, 0.035, {}); B.cyl('hips', 'metal', 0.025, 0.025, 0.03, { ax: 'x', p: [sg * 0.08, 0, 0] }); }
  B.joint('torso', 'hips', 0, 0.42, 0);
  B.lathe('torso', 'paint', [[0, 0], [0.1, 0.0, 1], [0.17, 0.08], [0.2, 0.22], [0.17, 0.38], [0.1, 0.46], [0, 0.47]], { seg: 22, c: 'm' });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; B.box('torso', 'paint', 0.035, 0.035, 0.012, { p: [Math.sin(a) * 0.2, 0.22, Math.cos(a) * 0.2], r: [0, a, PI / 4], c: i % 2 ? 'a' : 's', b: 0.004 }); }
  for (const y of [0.12, 0.3]) B.sphere('torso', 'paint', 0.03, { p: [0, y, 0.19], c: y > 0.2 ? 's' : 'a' });
  B.joint('chest', 'torso', 0, 0.46, 0);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; B.ext('chest', 'paint', [[0, -0.04], [0.16, -0.06], [0.2, 0], [0.16, 0.06], [0, 0.04]], 0.02, { p: [Math.sin(a) * 0.06, 0.0, Math.cos(a) * 0.06], r: [0, a - PI / 2, 0.25], c: i % 2 ? 's' : 0xf2efe6, b: 0.006, ro: 'YXZ' }); }
  for (const [S, sg] of SIDES) {
    B.joint('sh' + S, 'chest', sg * 0.16, 0.0, 0); B.joint('el' + S, 'sh' + S, 0, -0.3, 0); B.joint('ha' + S, 'el' + S, 0, -0.3, 0);
    B.sphere('sh' + S, 'metal', 0.04);
    for (let i = 0; i < 6; i++) B.torus('sh' + S, i % 2 ? 'paint' : 'metal', 0.028, 0.01, { ax: 'y', p: [0, -0.03 - i * 0.045, 0], ts: 14, rs: 5, c: i % 2 ? 's' : 'k' });
    for (let i = 0; i < 6; i++) B.torus('el' + S, i % 2 ? 'paint' : 'metal', 0.026, 0.01, { ax: 'y', p: [0, -0.02 - i * 0.045, 0], ts: 14, rs: 5, c: i % 2 ? 'a' : 'k' });
    B.sphere('ha' + S, 'paint', 0.06, { p: [0, -0.04, 0], s: [0.9, 1, 1.1], c: 0xf4f2ec });
    B.torus('ha' + S, 'paint', 0.05, 0.015, { ax: 'y', p: [0, 0.0, 0], ts: 16, c: 's' });
    for (const z of [-0.03, 0, 0.03]) B.sphere('ha' + S, 'paint', 0.02, { p: [-sg * 0.02, -0.095, z], s: [1, 1.5, 1], c: 0xf4f2ec });
  }
  B.joint('neck', 'chest', 0, 0.04, 0); B.joint('head', 'neck', 0, 0.02, 0);
  const h = 'head';
  B.box(h, 'paint', 0.3, 0.22, 0.26, { p: [0, 0.11, 0], b: 0.04, k: 2, c: 's' });
  B.box(h, 'paint', 0.31, 0.04, 0.27, { p: [0, 0.2, 0], b: 0.015, c: 'm' });
  B.box(h, 'dark', 0.12, 0.08, 0.03, { p: [0.0, 0.05, 0.13], b: 0.015, c: 0x111111 });
  B.box(h, 'paint', 0.1, 0.06, 0.04, { p: [0.0, 0.04, 0.135], r: [0.5, 0, 0], b: 0.012, c: 'a' });
  B.box(h, 'metal', 0.004, 0.035, 0.01, { p: [0.09, 0.15, 0.132], c: 0x222222 });
  for (const [, sg] of SIDES) { B.cyl(h, 'dark', 0.035, 0.035, 0.012, { ax: 'z', p: [sg * 0.08, 0.14, 0.13], seg: 16, c: 0x0c0c0c }); B.cyl(h, 'glow', 0.024, 0.024, 0.01, { ax: 'z', p: [sg * 0.08, 0.14, 0.137], seg: 16, i: 3 }); }
  B.torus(h, 'glow2', 0.08, 0.008, { arc: PI * 0.8, p: [0, 0.12, 0.134], r: [0, 0, PI * 1.1], ts: 20, i: 2.4 });
  B.joint('crank', h, -0.16, 0.1, 0);
  B.cyl('crank', 'metal', 0.03, 0.03, 0.03, { ax: 'x' });
  B.beam('crank', 'metal', [-0.015, 0, 0], [-0.015, 0.09, 0], 0.02, 0.012, {});
  B.cyl('crank', 'paint', 0.014, 0.014, 0.05, { ax: 'x', p: [-0.04, 0.09, 0], c: 's' });
  B.sphere(h, 'clear', 0.17, { p: [0, 0.22, 0], seg: 24, rows: 14, t1: PI / 2 });
  B.torus(h, 'metal', 0.168, 0.012, { ax: 'y', p: [0, 0.22, 0], ts: 32 });
  const caps = [0xe03030, 0x3070e0, 0xf0d030, 0x40c060, 0xe070d0, 0xf08a30, 0xffffff];
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.06 + (i % 3) * 0.03; B.sphere(h, 'paint', 0.035, { p: [Math.sin(a) * r, 0.26 + (i % 2) * 0.04 - (i > 6 ? 0.02 : 0), Math.cos(a) * r], seg: 10, rows: 8, c: caps[i % caps.length], wear: 0.1 }); }
  B.lathe(h, 'paint', [[0, 0], [0.04, 0.0], [0.03, 0.06], [0.015, 0.13], [0, 0.14]], { seg: 12, p: [0.04, 0.39, 0], r: [0, 0, -0.2], c: 's' });
  B.sphere(h, 'paint', 0.025, { p: [0.072, 0.53, 0], c: 'a' });
  return {
    loco: 'wheel', wheelR: 0.27, height: 1.72, atk: 'grab', down: 'side', downLift: 0.25,
    extra: ({ J, S }) => { J.crank.rotation.x = S.a > 0 ? S.a * PI * 8 : 0.4 * Math.sin(S.t); J.head.rotation.z += 0.08 * Math.sin(S.t * 2.6); },
  };
}

// ---------- hunter: hunched gorilla frame, huge fists ringed with thrusters ----------
function hunter(B) {
  const D = crewDims({ ankle: 0.1, shin: 0.36, thigh: 0.36, legX: 0.17, waist: 0.1, abd: 0.18, chestW: 0.62, chestH: 0.44, chestD: 0.36, shX: 0.4, shY: 0.36, neckY: 0.36, neckH: 0.0, upper: 0.42, fore: 0.4, t: 1.45, at: 1.6, ht: 1.0, scale: 1.2 });
  rigBiped(B, D);
  B.J.torso.rotation.x = 0.4; B.J.neck.rotation.x = -0.35;
  B.J.shL.rotation.x = -0.35; B.J.shR.rotation.x = -0.35;
  for (const [S, sg] of SIDES) { legParts(B, D, S, sg); armParts(B, D, S, sg, { noHand: true }); }
  torsoParts(B, D, { noPack: true });
  B.box('chest', 'paint', 0.66, 0.2, 0.42, { p: [0, D.chestH * 0.85, -0.02], b: 0.06, k: 2, c: 'm' });
  for (let i = 0; i < 4; i++) B.box('chest', 'paint', 0.05, 0.12, 0.05, { p: [-0.15 + i * 0.1, D.chestH + 0.03, -0.1], b: 0.012, c: 's' });
  B.vent('chest', 0, D.chestH * 0.5, -D.chestD / 2 - 0.006, 0.3, 0.16, 6, { sgn: -1 });
  const h = 'head';
  B.box(h, 'paint', 0.2, 0.13, 0.2, { p: [0, 0.03, 0.12], b: 0.04, k: 2, c: 's' });
  B.box(h, 'dark', 0.19, 0.035, 0.03, { p: [0, 0.04, 0.22], b: 0.01, c: 0x0c0c0d });
  B.box(h, 'glow', 0.16, 0.012, 0.01, { p: [0, 0.04, 0.237], b: 0.004, i: 3.4 });
  for (const [S, sg] of SIDES) {
    const j = 'ha' + S;
    B.cyl(j, 'metal', 0.08, 0.09, 0.08, { p: [0, -0.02, 0] });
    B.box(j, 'paint', 0.26, 0.26, 0.28, { p: [0, -0.18, 0.02], b: 0.06, k: 2, c: 'm' });
    B.box(j, 'paint', 0.27, 0.1, 0.1, { p: [0, -0.27, 0.13], b: 0.03, k: 2, c: 's' });
    for (const x of [-0.09, -0.03, 0.03, 0.09]) B.box(j, 'metal', 0.05, 0.05, 0.04, { p: [x, -0.28, 0.185], b: 0.01 });
    B.torus(j, 'glow2', 0.18, 0.01, { ax: 'y', p: [0, -0.14, 0.02], ts: 32, i: 2.2 });
    B.torus(j, 'metal', 0.18, 0.02, { ax: 'y', p: [0, -0.12, 0.02], ts: 32, s: [1, 0.6, 1] });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2 + PI / 4; B.cyl(j, 'dark', 0.03, 0.035, 0.05, { p: [Math.sin(a) * 0.18, -0.16, 0.02 + Math.cos(a) * 0.18], seg: 10 }); }
    B.box(j, 'paint', 0.272, 0.03, 0.29, { p: [0, -0.08, 0.02], c: 'a', b: 0.006 });
  }
  return { loco: 'biped', stride: 1.4, legAmp: 0.4, armAmp: 0.25, height: 2.05, atk: 'slam', downLift: 0.25, noCarry: true };
}

// ---------- angel: hooded stone sentinel, folded wing slabs, slit face ----------
function angel(B) {
  B.joint('sc', 'root'); B.joint('base', 'sc', 0, 0.05, 0);
  B.joint('hips', 'base', 0, 0.92, 0);
  // fluted robe: overlapping tapered pleats around a core
  B.lathe('hips', 'stone', [[0, -0.9], [0.27, -0.9, 1], [0.3, -0.86], [0.24, -0.4], [0.17, 0.0], [0.15, 0.1], [0, 0.1]], { seg: 20, hard: 50, c: 's' });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * PI * 2;
    const g = B.prof('hips', 'stone', [[-0.03, 0.08], [0.03, 0.08], [0.055, -0.4], [0.07, -0.9], [-0.07, -0.9], [-0.05, -0.4]], 0.07, { b: 0.012, bs: 2, c: i % 2 ? 'm' : 's', p: [Math.sin(a) * 0.17, 0, Math.cos(a) * 0.17], r: [-0.1, a, 0], ro: 'YXZ' });
  }
  B.lathe('hips', 'stone', [[0.2, 0.06], [0.22, 0.1, 1], [0.2, 0.14, 1], [0.16, 0.14]], { seg: 22, c: 'a' });
  B.joint('torso', 'hips', 0, 0.12, 0); B.joint('chest', 'torso', 0, 0.06, 0);
  B.prof('chest', 'stone', [[-0.09, 0.0], [0.06, 0.0], [0.11, 0.1], [0.12, 0.22], [0.09, 0.33], [0.02, 0.38], [-0.08, 0.38], [-0.11, 0.25], [-0.1, 0.1]], 0.36, { b: 0.04, bs: 3, tb: [0.6, 1], c: 'm' });
  for (let i = 0; i < 4; i++) B.box('chest', 'stone', 0.003, 0.05 + (i % 2) * 0.04, 0.004, { p: [-0.07 + i * 0.045, 0.14 + (i % 3) * 0.06, 0.125], r: [0, 0, 0.6 * (i % 2 ? 1 : -1)], c: 0x23211e, b: 0 });
  B.lathe('chest', 'stone', [[0.2, 0.33], [0.17, 0.4, 1], [0.08, 0.43], [0.06, 0.43]], { seg: 22, c: 's', s: [1, 1, 0.8] });
  // folded wings hanging down the back
  for (const [S, sg] of SIDES) {
    const j = 'wing' + S;
    B.joint(j, 'chest', sg * 0.1, 0.34, -0.12);
    B.J[j].rotation.set(0.12, 0, sg * 0.12);
    B.ext(j, 'stone', [[0, 0.06], [0.12, 0.2], [0.24, 0.14], [0.2, -0.1], [0.06, -0.3], [-0.02, -0.15]], 0.06, { p: [0, 0, -0.03], r: [0, sg > 0 ? -PI / 2 : PI / 2, 0], b: 0.02, bs: 2, c: 'm' });
    for (let i = 0; i < 7; i++) {
      const L = 0.95 - i * 0.07, w = 0.07;
      B.ext(j, 'stone', [[-w / 2, 0], [w / 2, 0], [w * 0.55, -L * 0.7], [0, -L], [-w * 0.4, -L * 0.75]], 0.022, { p: [sg * (0.02 + i * 0.012), 0.05 - i * 0.015, -0.07 - i * 0.04], r: [0.05 + i * 0.02, sg > 0 ? -PI / 2 + 0.25 : PI / 2 - 0.25, sg * (0.05 + i * 0.035)], ro: 'YXZ', b: 0.008, bs: 1, c: i % 2 ? 's' : 'm' });
    }
  }
  // arms resting on a sword planted in front
  for (const [S, sg] of SIDES) {
    B.joint('sh' + S, 'chest', sg * 0.2, 0.33, 0); B.joint('el' + S, 'sh' + S, 0, -0.3, 0); B.joint('ha' + S, 'el' + S, 0, -0.27, 0);
    B.J['sh' + S].rotation.set(-0.28, 0, -sg * 0.3); B.J['el' + S].rotation.set(-0.75, 0, -sg * 0.35);
    B.shell('sh' + S, 'stone', [[0.0, 0.09], [0.06, 0.085], [0.095, 0.05], [0.105, 0.0], [0.1, -0.04]], { p: [sg * 0.02, 0.02, 0], r: [0, 0, -sg * 0.5], seg: 16, c: 's', inC: 0x55524a });
    B.prof('sh' + S, 'stone', [[-0.045, -0.03], [0.045, -0.03], [0.05, -0.15], [0.035, -0.28], [-0.035, -0.28], [-0.05, -0.15]], 0.085, { b: 0.025, c: 'm' });
    B.prof('el' + S, 'stone', [[-0.04, 0.02], [0.04, 0.02], [0.05, -0.12], [0.035, -0.25], [-0.03, -0.25], [-0.05, -0.1]], 0.075, { b: 0.022, c: 's' });
    B.lathe('el' + S, 'stone', [[0.05, -0.27], [0.06, -0.22, 1], [0.045, -0.18], [0.045, -0.27]], { seg: 14, c: 'a' });
    B.box('ha' + S, 'stone', 0.05, 0.1, 0.08, { p: [0, -0.05, 0], b: 0.02, k: 2, c: 'm' });
  }
  B.joint('sword', 'hips', 0, 0.02, 0.3);
  B.ext('sword', 'stone', [[-0.035, 0], [0.035, 0], [0.03, -0.75], [0, -0.88], [-0.03, -0.75]], 0.016, { b: 0.005, c: 's' });
  B.box('sword', 'stone', 0.004, 0.7, 0.018, { p: [0, -0.38, 0], c: 0x3a3832, b: 0 });
  B.box('sword', 'stone', 0.22, 0.04, 0.05, { p: [0, 0.02, 0], b: 0.015, k: 2, c: 'm', taper: [1.2, 1] });
  B.cyl('sword', 'stone', 0.018, 0.02, 0.14, { p: [0, 0.11, 0], c: 'a' });
  B.sphere('sword', 'stone', 0.032, { p: [0, 0.2, 0], c: 's' });
  // hooded faceless head with a glowing slit
  B.joint('neck', 'chest', 0, 0.42, 0); B.joint('head', 'neck', 0, 0.02, 0);
  const h = 'head';
  B.sphere(h, 'stone', 0.1, { p: [0, 0.12, 0.01], s: [0.85, 1.25, 0.95], seg: 18, rows: 14, c: 'm' });
  B.shell(h, 'stone', [[0.24, -0.1], [0.2, -0.05], [0.165, 0.06], [0.155, 0.18], [0.11, 0.29], [0, 0.32]], { seg: 20, a0: 0.95, a1: PI * 2 - 0.95, hard: 60, c: 's', inC: 0x3a3832, p: [0, 0, -0.02] });
  B.box(h, 'dark', 0.012, 0.15, 0.02, { p: [0, 0.13, 0.098], c: 0x070707, b: 0 });
  B.box(h, 'glow', 0.005, 0.13, 0.01, { p: [0, 0.13, 0.105], i: 2.2 });
  for (const y of [0.19, 0.06]) B.box(h, 'stone', 0.003, 0.05, 0.003, { p: [0.04, y, 0.09], r: [0, 0, 0.5], c: 0x23211e, b: 0 });
  return {
    loco: 'hover', height: 1.95, down: 'slump', bobHz: 0.3, lean: 0.04, noCarry: true,
    extra: ({ J, S, atkCurve }) => {
      J.base.position.y -= 0.05 * Math.sin(S.t * 0.3);
      const [wd, st] = atkCurve(S.a, 0.4, 0.5);
      J.shR.rotation.x += -2.0 * wd + 0.6 * st; J.shR.rotation.z -= 0.9 * st; J.elR.rotation.x += 0.6 * wd;
      J.shL.rotation.z += 0.6 * (wd + st);
      J.wingL.rotation.y -= 1.0 * (wd + st); J.wingR.rotation.y += 1.0 * (wd + st);
      J.wingL.rotation.z += 0.5 * (wd + st); J.wingR.rotation.z -= 0.5 * (wd + st);
      J.head.rotation.x += 0.25 * wd - 0.3 * st;
      S.glowMul = 0.6 + 2.4 * Math.max(wd, st);
    },
  };
}

// ---------- mirror: gaunt chrome stalker ----------
function mirror(B) {
  const D = crewDims({ ankle: 0.06, shin: 0.5, thigh: 0.48, legX: 0.09, waist: 0.12, abd: 0.2, chestW: 0.26, chestH: 0.26, chestD: 0.15, shX: 0.17, shY: 0.24, neckY: 0.27, neckH: 0.06, upper: 0.38, fore: 0.38, t: 0.8, at: 0.8, ht: 1, cA: 'm', cB: 's' });
  rigBiped(B, D);
  B.J.torso.rotation.x = 0.35; B.J.neck.rotation.x = -0.1; B.J.head.rotation.z = 0.25;
  for (const [S, sg] of SIDES) { slimLeg(B, D, S, sg, { strut: 's' }); slimArm(B, D, S, sg, { fingerL: 0.2, fingers: 4, strut: 's', clawC: 's' }); }
  B.box('hips', 'chrome', 0.18, 0.1, 0.12, { b: 0.04, k: 2, c: 'm' });
  for (let i = 0; i < 6; i++) B.cyl('torso', 'chrome', 0.035, 0.04, 0.03, { p: [0, i * 0.035, -0.02], seg: 10, c: 's' });
  for (let i = 0; i < 5; i++) for (const [, sg] of SIDES) B.tube('chest', 'chrome', [[0, 0.05 + i * 0.045, -0.07], [sg * 0.11, 0.04 + i * 0.045, -0.02], [sg * 0.11, 0.035 + i * 0.045, 0.05], [sg * 0.02, 0.03 + i * 0.045, 0.075]], 0.009, { c: 'm', ts: 14, rs: 5 });
  B.cyl('chest', 'chrome', 0.025, 0.025, 0.3, { p: [0, 0.12, -0.07], c: 's' });
  B.box('chest', 'chrome', 0.32, 0.05, 0.12, { p: [0, 0.25, -0.01], b: 0.02, k: 2, c: 'm' });
  const h = 'head';
  B.sphere(h, 'chrome', 0.1, { p: [0, 0.11, 0.0], s: [0.8, 1.35, 0.95], seg: 22, rows: 16, c: 'm' });
  B.box(h, 'dark', 0.004, 0.13, 0.03, { p: [0.02, 0.12, 0.092], r: [0, 0, 0.15], c: 0x050505 });
  B.box(h, 'glow', 0.003, 0.11, 0.01, { p: [0.02, 0.12, 0.1], r: [0, 0, 0.15], i: 2.6 });
  return { loco: 'biped', stride: 1.2, legAmp: 0.45, armAmp: 0.2, height: 1.88, atk: 'grab', downLift: 0.1 };
}

export const FOES = {
  gunner: { pal: pal({ m: 0x4b5560, s: 0x8a3b2a, a: 0xd9a520, e: 0xff3020, g: 0xff5030 }), build: gunner },
  rook: { pal: pal({ m: 0x3a3f44, s: 0xc9a227, a: 0x7a1d1a, e: 0xff5a1a, g: 0xff8a30 }), build: rook },
  banger: { pal: pal({ m: 0x2d3136, s: 0xc23b22, a: 0xf0d040, e: 0xffd040, g: 0xffa020 }), build: banger },
  gnome: { pal: pal({ m: 0x50565e, s: 0xa83232, a: 0xd8c070, e: 0x9dff50, g: 0x9dff50 }), build: gnome },
  mimic: { pal: pal({ m: 0x6b4a2a, s: 0xa8823a, a: 0x2a1a10, e: 0xffb020, g: 0xff9020 }), build: mimic },
  ghost: { pal: pal({ m: 0xdcd6c8, s: 0x23272e, a: 0x3a4048, e: 0xff3a2a, g: 0x6fb0ff }), build: ghost },
  wallhand: { pal: pal({ m: 0x3c3236, s: 0x6b2626, a: 0x6a625a, e: 0xff2a40, g: 0xff2a40 }), build: wallhand },
  mummy: { pal: pal({ m: 0x7a7464, s: 0x3d4a3a, a: 0xb8ae92, e: 0x9dff70, g: 0x9dff70 }), build: mummy },
  brat: { pal: pal({ m: 0x7d7f86, s: 0x2a2b2f, a: 0xd8d6cc, e: 0xfff060, g: 0xfff060 }), build: brat },
  headthrower: { pal: pal({ m: 0x5b4d6e, s: 0x2f2a36, a: 0xb8b0a0, e: 0x40a0ff, g: 0x3a90ff }), build: headthrower },
  minelayer: { pal: pal({ m: 0xb08a2a, s: 0x2c2f33, a: 0xc23030, e: 0xff4040, g: 0xff4040 }), build: minelayer },
  impostor: { pal: pal({ m: 0x6f8a9a, s: 0x30343a, a: 0xe0e0d0, e: 0x9fe8ff, g: 0x9fe8ff }), build: buildImpostor },
  gacha: { pal: pal({ m: 0xe0d8c4, s: 0xc8323a, a: 0x2f62c8, e: 0xffe040, g: 0xff4050 }), build: gacha },
  hunter: { pal: pal({ m: 0x2c3a2e, s: 0x6a6f76, a: 0xc8402a, e: 0xff2020, g: 0xff5020 }), build: hunter },
  angel: { pal: pal({ m: 0xa9a59c, s: 0x8c887f, a: 0x5b5850, e: 0xd8f0ff, g: 0xd8f0ff }), build: angel },
  mirror: { pal: pal({ m: 0xd8dde4, s: 0x9aa3ae, a: 0x5a6470, e: 0xbfe0ff, g: 0xbfe0ff }), build: mirror },
};
