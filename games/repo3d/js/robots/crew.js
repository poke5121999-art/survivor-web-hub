import * as THREE from '../../vendor/three.module.min.js';
import { SIDES, crewDims, rigBiped, legParts, armParts, torsoParts, hand } from './parts.js';

const BASE = { d: 0x2a2c31, k: 0x9aa0a8, v: 0x0a1015 };
export const CREW_PAL = {
  bao: { m: 0xe07a1f, s: 0x30343a, a: 0xf2c230, e: 0xffd27a, g: 0xffb040 },
  hue: { m: 0xe6e9ec, s: 0x23897d, a: 0x9fe3d8, e: 0x7dfff0, g: 0x7dfff0 },
  tam: { m: 0x2b4a7a, s: 0xd9a521, a: 0xe8e2d0, e: 0xa8d8ff, g: 0xffc040 },
  ky: { m: 0x5e7d3a, s: 0x6b4a2e, a: 0xe0b040, e: 0xc8ff80, g: 0xffd060 },
  linh: { m: 0x2c2836, s: 0x4a3b66, a: 0x9a6bd6, e: 0xc890ff, g: 0xb070ff },
  dung: { m: 0xb3332b, s: 0x4a4d52, a: 0xf0c040, e: 0xff8a50, g: 0xff6030 },
  mai: { m: 0xe58aa8, s: 0xefe3cf, a: 0x7a3550, e: 0xffa0d0, g: 0xff80c0 },
  phuc: { m: 0x2f6fb5, s: 0xe8892b, a: 0xf5f0e0, e: 0x9fd4ff, g: 0xffa040 },
  son: { m: 0x6f7a46, s: 0xb8a27a, a: 0x3a3d2a, e: 0xffe08a, g: 0xffd060 },
  nga: { m: 0x6a4fc2, s: 0xc9ccd4, a: 0x37e0ff, e: 0x80e8ff, g: 0x40e8ff },
  khoi: { m: 0x1f7f84, s: 0xc9a54a, a: 0x153b3e, e: 0x9effe0, g: 0x60ffd0 },
  van: { m: 0x9cc8e6, s: 0xf2f5f8, a: 0x3b6e99, e: 0xbff4ff, g: 0x90f0ff },
  hai: { m: 0xc43a3a, s: 0xbfc4ca, a: 0x2b2d33, e: 0xffd0a0, g: 0x80c0ff },
  tuyet: { m: 0xf1efe8, s: 0xcfa94a, a: 0x8fb7d8, e: 0xfff1b0, g: 0xffe080 },
};
export const CREW_IDS = Object.keys(CREW_PAL);
export const crewPal = (id) => ({ ...BASE, ...CREW_PAL[id] });

// The worker helmet: sloped shell, recessed visor band with two eye lights, brow, jaw grille, ear pods, crest.
export function crewHead(B, o = {}) {
  const h = 'head';
  B.prof(h, 'paint', [[-0.12, 0.0], [0.07, 0.0], [0.12, 0.03], [0.145, 0.08], [0.145, 0.13], [0.12, 0.19], [0.05, 0.235], [-0.06, 0.235], [-0.125, 0.18]], 0.26, { b: 0.045, bs: 3, taper: [0.88, 1], c: 'm' });
  B.box(h, 'dark', 0.214, 0.088, 0.05, { p: [0, 0.105, 0.125], b: 0.02, k: 2, c: 0x151618 });
  B.box(h, 'glass', 0.19, 0.062, 0.03, { p: [0, 0.106, 0.142], b: 0.014, k: 2, c: 'v' });
  for (const [, sg] of SIDES) B.box(h, 'glow', 0.052, 0.022, 0.008, { p: [sg * 0.047, 0.108, 0.157], r: [0, 0, sg * 0.12], b: 0.007, k: 1, i: 2.2 });
  B.box(h, 'paint', 0.235, 0.03, 0.06, { p: [0, 0.162, 0.13], r: [-0.3, 0, 0], b: 0.012, k: 2, c: 's' });
  B.box(h, 'paint', 0.17, 0.05, 0.07, { p: [0, 0.03, 0.115], b: 0.02, k: 2, tb: [0.8, 0.9], c: 's' });
  for (let i = 0; i < 3; i++) B.box(h, 'dark', 0.1, 0.006, 0.01, { p: [0, 0.018 + i * 0.012, 0.15], c: 0x101113, b: 0 });
  B.box(h, 'dark', 0.262, 0.005, 0.2, { p: [0, 0.19, -0.02], c: 0x121315, b: 0 });
  for (const [, sg] of SIDES) {
    B.vent(h, sg * 0.131, 0.07, 0.05, 0.05, 0.04, 3, { ax: 'x', sgn: sg });
    B.cyl(h, 'metal', 0.045, 0.048, 0.035, { ax: 'x', p: [sg * 0.135, 0.115, -0.03], seg: 16 });
    B.cyl(h, 'paint', 0.028, 0.03, 0.014, { ax: 'x', p: [sg * 0.155, 0.115, -0.03], c: 'a' });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.6; B.bolt(h, sg * 0.154, 0.115 + Math.sin(a) * 0.037, -0.03 + Math.cos(a) * 0.037, sg > 0 ? 'x' : '-x', 0.005); }
  }
  B.box(h, 'paint', 0.03, 0.03, 0.17, { p: [0, 0.245, -0.02], b: 0.012, k: 2, c: 's' });
  B.vent(h, 0, 0.11, -0.143, 0.12, 0.05, 3, { sgn: -1 });
  if (!o.noAntenna) { B.rod(h, 'metal', [0.12, 0.17, -0.06], [0.125, 0.32, -0.075], 0.0055); B.sphere(h, 'glow2', 0.011, { p: [0.125, 0.325, -0.075], seg: 8, rows: 6, i: 2.5 }); }
}

export function crewBody(B, D, o = {}) {
  rigBiped(B, D);
  D.cA = o.cA || 'm'; D.cB = o.cB || 's';
  for (const [S, sg] of SIDES) { legParts(B, D, S, sg); armParts(B, D, S, sg, { noHand: o.noHands, noPauldron: o.noPauldron }); }
  torsoParts(B, D, o);
  crewHead(B, o);
  return D;
}

const ACC = {
  bao(B, D) { // chest lamp
    const H = D.chestH, z = D.chestD / 2 + 0.035;
    B.box('chest', 'paint', 0.14, 0.13, 0.05, { p: [0, H * 0.58, z], b: 0.025, k: 2, c: 's' });
    B.lathe('chest', 'chrome', [[0.064, 0.03, 1], [0.06, 0.03, 1], [0.055, 0.025], [0.015, -0.01]], { ax: 'z', p: [0, H * 0.58, z + 0.012], seg: 18 });
    B.cyl('chest', 'glow2', 0.048, 0.048, 0.008, { ax: 'z', p: [0, H * 0.58, z + 0.037], seg: 18, i: 3.2 });
    B.torus('chest', 'paint', 0.061, 0.009, { p: [0, H * 0.58, z + 0.042], ts: 24, rs: 6, c: 'a' });
    for (const a of [0, Math.PI / 2]) B.box('chest', 'metal', 0.12, 0.007, 0.007, { p: [0, H * 0.58, z + 0.05], r: [0, 0, a + 0.785], b: 0.002 });
    for (const [, sg] of SIDES) B.bolt('chest', sg * 0.055, H * 0.58 + 0.05, z + 0.026, 'z', 0.006);
    for (const [S, sg] of SIDES) for (let i = 0; i < 3; i++) B.box('sh' + S, 'paint', 0.03, 0.012, 0.172, { p: [sg * (0.0 + i * 0.035), 0.098 - i * 0.012, 0], r: [0, 0, -sg * 0.3], c: i % 2 ? 's' : 'a', b: 0.003 });
    B.box('head', 'paint', 0.05, 0.03, 0.03, { p: [-0.06, 0.18, 0.11], b: 0.008, c: 's' });
    B.cyl('head', 'glow2', 0.012, 0.012, 0.006, { ax: 'z', p: [-0.06, 0.18, 0.127], seg: 10, i: 3 });
  },
  hue(B) { // halo ring
    B.joint('halo', 'head', 0, 0.31, -0.02);
    B.torus('halo', 'glow2', 0.155, 0.009, { ax: 'y', ts: 40, rs: 6, i: 2.6 });
    B.torus('halo', 'metal', 0.155, 0.016, { ax: 'y', ts: 40, rs: 8, p: [0, -0.012, 0], s: [1, 0.6, 1], c: 's' });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; B.box('halo', 'paint', 0.03, 0.022, 0.04, { p: [Math.sin(a) * 0.155, -0.006, Math.cos(a) * 0.155], r: [0, a, 0], b: 0.007, c: 'm' }); }
    B.rod('head', 'metal', [0, 0.215, -0.04], [0, 0.3, -0.02], 0.007);
    for (const [S, sg] of SIDES) { B.box('sh' + S, 'paint', 0.05, 0.014, 0.012, { p: [sg * 0.09, 0.06, 0.08], r: [0, 0, -sg * 0.3], c: 's', b: 0.003 }); B.box('sh' + S, 'paint', 0.014, 0.05, 0.012, { p: [sg * 0.09, 0.06, 0.08], r: [0, 0, -sg * 0.3], c: 's', b: 0.003 }); }
  },
  tam(B, D) { // big shoulders
    for (const [S, sg] of SIDES) {
      B.box('sh' + S, 'paint', 0.24, 0.13, 0.25, { p: [sg * 0.06, 0.09, 0], r: [0, 0, -sg * 0.22], b: 0.05, k: 2, c: 'm' });
      B.box('sh' + S, 'paint', 0.2, 0.05, 0.255, { p: [sg * 0.1, 0.02, 0], r: [0, 0, -sg * 0.5], b: 0.02, k: 2, c: 's' });
      for (const z of [-0.08, 0, 0.08]) B.bolt('sh' + S, sg * 0.04, 0.158, z, 'y', 0.008);
      B.box('sh' + S, 'paint', 0.02, 0.03, 0.2, { p: [sg * 0.13, 0.13, 0], r: [0, 0, -sg * 0.22], c: 'a', b: 0.005 });
    }
    const H = D.chestH, z = -D.chestD / 2 - 0.11;
    B.beam('chest', 'metal', [-0.21, H + 0.04, z + 0.02], [0.21, H + 0.04, z + 0.02], 0.045, 0.045, { b: 0.01 });
    for (const [, sg] of SIDES) { B.rod('chest', 'dark', [sg * 0.18, H + 0.04, z + 0.02], [sg * 0.12, H * 0.3, z + 0.03], 0.016); B.rod('chest', 'metal', [sg * 0.15, H * 0.7, z + 0.025], [sg * 0.125, H * 0.32, z + 0.03], 0.009); }
  },
  ky(B, D) { // tool arm over the right shoulder
    const H = D.chestH, z = -D.chestD / 2 - 0.08;
    B.joint('tool', 'chest', -0.13, H * 0.95, z);
    B.cyl('tool', 'metal', 0.04, 0.04, 0.06, { ax: 'x' });
    B.beam('tool', 'paint', [0, 0, 0], [-0.04, 0.22, 0.03], 0.05, 0.05, { b: 0.014, c: 's' });
    B.joint('tool2', 'tool', -0.04, 0.22, 0.03);
    B.J.tool2.rotation.x = 0.9;
    B.sphere('tool2', 'metal', 0.035);
    B.beam('tool2', 'paint', [0, 0, 0], [0, 0.26, 0.02], 0.045, 0.045, { b: 0.012, c: 'm' });
    B.rod('tool2', 'metal', [0.03, 0.03, 0], [0.03, 0.22, 0.01], 0.008);
    B.box('tool2', 'dark', 0.06, 0.05, 0.06, { p: [0, 0.27, 0.02], b: 0.012 });
    B.ext('tool2', 'metal', [[-0.11, 0], [-0.02, 0.025], [0.02, 0.025], [0.13, 0.005], [0.02, -0.01], [-0.02, -0.01]], 0.03, { p: [0, 0.31, 0.02], r: [0, Math.PI / 2, 0], b: 0.004, c: 0xb8bcc2 });
    B.lathe('tool2', 'metal', [[0, -0.02], [0.02, -0.02], [0.018, 0.0, 1], [0, 0.09]], { p: [0, 0.27, 0.07], ax: 'z', seg: 10, c: 0x8a8e94 });
    B.tube('chest', 'dark', [[-0.09, H * 0.7, z - 0.05], [-0.14, H * 0.95, z - 0.06], [-0.15, H * 1.15, z]], 0.01, { c: 0x1a1b1d });
  },
  linh(B) { // hood + scarf
    const prof = [[0.0, 0.29], [0.09, 0.285], [0.155, 0.245], [0.18, 0.15], [0.178, 0.05], [0.19, -0.04], [0.22, -0.09]];
    const a0 = 0.95, a1 = Math.PI * 2 - 0.95;
    B.shell('head', 'paint', prof, { a0, a1, seg: 20, hard: 60, c: 's', wear: 0.2, p: [0, 0, -0.02], inC: 0x1c1826 });
    B.torus('neck', 'paint', 0.085, 0.032, { ax: 'y', p: [0, 0.02, 0], ts: 20, rs: 8, c: 's', wear: 0.1 });
    B.tube('chest', 'paint', [[0.05, 0.3, -0.09], [0.07, 0.2, -0.15], [0.09, 0.05, -0.17], [0.1, -0.05, -0.16]], 0.022, { c: 's', wear: 0.1, s: [1, 1, 0.5] });
    for (const [, sg] of SIDES) B.box('head', 'paint', 0.012, 0.16, 0.006, { p: [sg * 0.17, 0.08, 0.09], r: [0, sg * 0.6, 0], c: 'a', b: 0.002 });
  },
  quake(B, D) { // heavy fists (built in place of hands)
    for (const [S, sg] of SIDES) {
      const j = 'ha' + S;
      B.cyl(j, 'metal', 0.05, 0.055, 0.05, { p: [0, -0.015, 0] });
      B.box(j, 'paint', 0.15, 0.15, 0.17, { p: [0, -0.1, 0.01], b: 0.035, k: 2, c: 'm' });
      B.box(j, 'paint', 0.155, 0.06, 0.06, { p: [0, -0.15, 0.08], b: 0.02, k: 2, c: 's' });
      for (const x of [-0.05, 0, 0.05]) B.box(j, 'metal', 0.038, 0.035, 0.03, { p: [x, -0.155, 0.112], b: 0.008 });
      for (const z of [-0.04, 0.04]) B.rod(j, 'metal', [sg * 0.075, -0.03, z], [sg * 0.082, -0.15, z], 0.009);
      B.vent(j, sg * 0.076, -0.09, -0.03, 0.06, 0.05, 3, { ax: 'x', sgn: sg });
      B.box(j, 'paint', 0.157, 0.016, 0.172, { p: [0, -0.05, 0.01], c: 'a', b: 0.004 });
      B.box('el' + S, 'paint', 0.13, 0.12, 0.13, { p: [0, -D.fore * 0.6, 0], b: 0.03, k: 2, c: 's' });
    }
  },
  mai(B, D) { // shoulder loudspeaker + chest grille
    B.joint('horn', 'shL', 0.06, 0.13, 0.02);
    B.box('horn', 'dark', 0.07, 0.05, 0.08, { p: [0, -0.02, 0], b: 0.012 });
    B.lathe('horn', 'paint', [[0.025, -0.06], [0.03, 0.0], [0.055, 0.08], [0.095, 0.13, 1], [0.1, 0.135, 1]], { ax: 'z', p: [0, 0.035, 0.02], seg: 20, c: 's' });
    B.lathe('horn', 'dark', [[0.098, 0.133], [0.055, 0.082], [0.03, 0.0], [0, 0]], { ax: 'z', p: [0, 0.035, 0.02], seg: 20, c: 0x1a1416 });
    B.torus('horn', 'paint', 0.1, 0.008, { p: [0, 0.035, 0.155], ts: 28, c: 'a' });
    const H = D.chestH, z = D.chestD / 2 + 0.03;
    B.cyl('chest', 'dark', 0.06, 0.06, 0.02, { ax: 'z', p: [0, H * 0.55, z], seg: 20, c: 0x1c1b1e });
    for (const r of [0.025, 0.045, 0.063]) B.torus('chest', 'paint', r, 0.006, { p: [0, H * 0.55, z + 0.012], ts: 24, rs: 5, c: 'a' });
    B.sphere('chest', 'metal', 0.015, { p: [0, H * 0.55, z + 0.012] });
  },
  phuc(B, D) { // winch drum on the back, cable to a hook
    const H = D.chestH, z = -D.chestD / 2 - 0.15;
    B.joint('winch', 'chest', 0, H * 0.55, z);
    B.cyl('winch', 'metal', 0.06, 0.06, 0.2, { ax: 'x', seg: 18, c: 0x6f747b });
    for (let i = 0; i < 7; i++) B.torus('winch', 'metal', 0.064, 0.007, { ax: 'x', p: [-0.075 + i * 0.025, 0, 0], ts: 20, rs: 4, c: 0xc4b98f });
    for (const [, sg] of SIDES) { B.cyl('winch', 'paint', 0.085, 0.085, 0.02, { ax: 'x', p: [sg * 0.11, 0, 0], seg: 20, c: 's' }); B.box('winch', 'paint', 0.02, 0.06, 0.12, { p: [sg * 0.11, -0.06, 0.05], c: 's' }); B.bolt('winch', sg * 0.121, 0, 0, sg > 0 ? 'x' : '-x', 0.01); }
    B.tube('chest', 'metal', [[-0.08, H * 0.6, z + 0.02], [-0.2, H * 1.05, z + 0.12], [-0.3, H * 0.95, 0.0], [-0.32, H * 0.2, 0.06]], 0.005, { c: 0xc4b98f, ts: 30, rs: 4 });
    B.ext('haR', 'metal', [[0, 0], [0.012, 0], [0.012, -0.05], [0.04, -0.08], [0.06, -0.06], [0.05, -0.045], [0.04, -0.06], [0.02, -0.06], [0.0, -0.05]], 0.018, { p: [-0.02, -0.13, 0.05], r: [0, Math.PI / 2, 0], c: 0xd0a040, b: 0.004 });
  },
  son(B, D) { // shield plates
    const j = 'elL';
    B.box(j, 'paint', 0.03, 0.3, 0.24, { p: [0.08, -D.fore * 0.55, 0.02], b: 0.012, k: 2, c: 's' });
    B.box(j, 'paint', 0.032, 0.26, 0.2, { p: [0.095, -D.fore * 0.55, 0.02], b: 0.01, c: 'm' });
    for (const y of [-0.04, -0.27]) for (const zz of [-0.07, 0.11]) B.bolt(j, 0.112, y, zz, 'x', 0.008);
    B.box(j, 'paint', 0.034, 0.03, 0.205, { p: [0.097, -D.fore * 0.55, 0.02], c: 'a', b: 0.004 });
    const H = D.chestH, z = D.chestD / 2 + 0.03;
    for (let i = 0; i < 3; i++) B.box('chest', 'paint', 0.3 - i * 0.04, 0.05, 0.03, { p: [0, H * (0.72 - i * 0.2), z + 0.012], r: [0.15, 0, 0], b: 0.01, k: 2, c: i % 2 ? 'm' : 's' });
    for (const [S, sg] of SIDES) B.box('sh' + S, 'paint', 0.16, 0.04, 0.19, { p: [sg * 0.05, 0.1, 0], r: [0, 0, -sg * 0.3], b: 0.012, c: 's' });
  },
  nga(B, D) { // swept fins on the head and the back
    for (const [, sg] of SIDES) {
      B.ext('head', 'paint', [[0, 0], [0.14, 0.06], [0.2, 0.1], [0.08, 0.02], [0.02, -0.04]], 0.012, { p: [sg * 0.13, 0.14, -0.04], r: [0, -sg * Math.PI / 2 + sg * 0.25, 0.3], c: 's', b: 0.004, s: [1, 1, 1] });
      B.ext('head', 'glow2', [[0.08, 0.02], [0.2, 0.1], [0.19, 0.093], [0.08, 0.012]], 0.014, { p: [sg * 0.13, 0.14, -0.04], r: [0, -sg * Math.PI / 2 + sg * 0.25, 0.3], b: 0.0, i: 2.2 });
      const H = D.chestH, z = -D.chestD / 2 - 0.09;
      B.ext('chest', 'paint', [[0, 0], [0.2, 0.18], [0.28, 0.32], [0.12, 0.12], [0.0, 0.1]], 0.016, { p: [sg * 0.06, H * 0.45, z], r: [0, sg > 0 ? -0.5 : Math.PI + 0.5, 0], c: 'm', b: 0.005 });
      B.ext('chest', 'glow2', [[0.12, 0.12], [0.28, 0.32], [0.27, 0.3], [0.12, 0.105]], 0.018, { p: [sg * 0.06, H * 0.45, z], r: [0, sg > 0 ? -0.5 : Math.PI + 0.5, 0], b: 0, i: 2.4 });
    }
  },
  khoi(B, D) { // antenna dish on a mast
    const H = D.chestH, z = -D.chestD / 2 - 0.08;
    B.rod('chest', 'metal', [0.1, H * 0.8, z], [0.13, H + 0.28, z - 0.02], 0.012);
    B.joint('dish', 'chest', 0.13, H + 0.3, z - 0.02);
    const prof = [[0, -0.01], [0.04, -0.005], [0.08, 0.012], [0.11, 0.035, 1], [0.115, 0.04, 1]];
    B.shell('dish', 'paint', prof, { ax: 'z', seg: 22, c: 's', r: [-0.35, 0, 0], inC: 0xe8e4d8, inK: 0.97 });
    B.rod('dish', 'metal', [0, 0, 0], [0, 0.04, 0.09], 0.004);
    B.sphere('dish', 'glow2', 0.012, { p: [0, 0.04, 0.09], i: 3 });
    B.torus('head', 'glow2', 0.022, 0.004, { p: [-0.047, 0.092, 0.152], ts: 16, rs: 4, i: 2.4 });
    B.cyl('head', 'paint', 0.03, 0.03, 0.02, { ax: 'z', p: [-0.047, 0.092, 0.142], c: 's', seg: 14 });
  },
  van(B, D) { // frost vents + ice crystals
    for (const [S, sg] of SIDES) {
      B.box('sh' + S, 'dark', 0.1, 0.05, 0.12, { p: [sg * 0.04, 0.115, -0.02], r: [0, 0, -sg * 0.3], b: 0.012, c: 0x2a3440 });
      for (let i = 0; i < 4; i++) B.box('sh' + S, 'glow2', 0.08, 0.006, 0.008, { p: [sg * 0.04, 0.142, -0.06 + i * 0.026], r: [0, 0, -sg * 0.3], i: 1.8 });
      for (let i = 0; i < 3; i++) B.lathe('sh' + S, 'glass', [[0, 0], [0.014, 0.01], [0, 0.07 + i * 0.02]], { seg: 5, p: [sg * (0.0 + i * 0.03), 0.12, -0.04 + i * 0.03], r: [0.3 - i * 0.2, 0, -sg * (0.4 + i * 0.25)], c: 0xbfe8ff });
    }
    const H = D.chestH, z = -D.chestD / 2 - 0.1;
    for (let i = 0; i < 5; i++) B.box('chest', 'glow2', 0.12, 0.007, 0.006, { p: [0, H * (0.3 + i * 0.1), z - 0.004], i: 1.6 });
    for (const [, sg] of SIDES) B.tube('chest', 'paint', [[sg * 0.1, H * 0.2, z + 0.03], [sg * 0.2, H * 0.1, -0.02], [sg * 0.17, H * 0.0, 0.08]], 0.012, { c: 'a' });
    B.lathe('head', 'glass', [[0, 0], [0.012, 0.01], [0, 0.08]], { seg: 5, p: [0, 0.22, -0.06], r: [-0.5, 0, 0], c: 0xbfe8ff });
  },
  hai(B, D) { // horseshoe magnet on the back
    const H = D.chestH, z = -D.chestD / 2 - 0.14;
    B.joint('mag', 'chest', 0, H * 0.72, z);
    B.torus('mag', 'paint', 0.11, 0.04, { arc: Math.PI, ts: 18, rs: 10, c: 'm', r: [0, 0, 0] });
    for (const [, sg] of SIDES) {
      B.cyl('mag', 'paint', 0.04, 0.04, 0.12, { p: [sg * 0.11, -0.06, 0], c: 'm', seg: 14 });
      B.cyl('mag', 'metal', 0.041, 0.041, 0.06, { p: [sg * 0.11, -0.15, 0], c: 's', seg: 14 });
    }
    B.box('mag', 'dark', 0.18, 0.04, 0.05, { p: [0, -0.02, 0.05], b: 0.01 });
    for (let i = 0; i < 5; i++) B.torus('elR', 'metal', 0.056, 0.006, { ax: 'y', p: [0, -0.08 - i * 0.022, 0], ts: 18, rs: 4, c: 0xc98a4a });
  },
  tuyet(B, D) { // wing panels
    const H = D.chestH, z = -D.chestD / 2 - 0.1;
    for (const [S, sg] of SIDES) {
      const j = 'wing' + S;
      B.joint(j, 'chest', sg * 0.08, H * 0.75, z);
      B.J[j].rotation.set(0.15, sg * 0.35, sg * -0.25);
      B.cyl(j, 'metal', 0.03, 0.03, 0.05, { ax: 'z' });
      for (let i = 0; i < 4; i++) {
        const L = 0.42 - i * 0.07, ang = 0.75 - i * 0.38;
        const pts = [[0, -0.022], [L * 0.8, -0.03], [L, 0], [L * 0.8, 0.032], [0, 0.022]];
        B.ext(j, 'paint', pts, 0.016, { p: [0, 0, -0.012 - i * 0.004], r: [0, sg > 0 ? 0 : Math.PI, sg > 0 ? ang : ang], c: i % 2 ? 'm' : 0xe4e1d8, b: 0.005 });
        B.ext(j, 'glow2', [[L * 0.55, 0.03], [L * 0.97, 0.004], [L * 0.95, 0.011], [L * 0.55, 0.036]], 0.018, { p: [0, 0, -0.012 - i * 0.004], r: [0, sg > 0 ? 0 : Math.PI, ang], b: 0, i: 1.8 });
      }
      B.box(j, 'paint', 0.06, 0.05, 0.03, { b: 0.01, c: 's' });
    }
  },
};
ACC.dung = ACC.quake;

const EXTRA = {
  hue: ({ J, S }) => { J.halo.rotation.y = S.t * 0.8; J.halo.position.y += 0.01 * Math.sin(S.t * 2); },
  ky: ({ J, S }) => { J.tool.rotation.z = 0.15 * Math.sin(S.t * 0.9); J.tool2.rotation.x = 0.9 + 0.12 * Math.sin(S.t * 1.3) + 0.6 * S.carry; },
  khoi: ({ J, S }) => { J.dish.rotation.y = 0.8 * Math.sin(S.t * 0.5); },
  tuyet: ({ J, S }) => { const f = 0.08 * Math.sin(S.t * 1.6) + 0.25 * S.w; J.wingL.rotation.y += f; J.wingR.rotation.y -= f; },
  mai: ({ J, S }) => { J.horn.rotation.y = 0.2 * Math.sin(S.t * 0.7); },
  phuc: ({ J, S }) => { J.winch.rotation.x = S.t * 0.6 * (S.carry > 0.5 ? 3 : 0.2); },
  hai: ({ J, S }) => { J.mag.position.y += 0.006 * Math.sin(S.t * 3); },
};

export function buildCrew(B, id) {
  const D = crewDims({ ht: 1 });
  const heavy = id === 'dung';
  if (id === 'tam') Object.assign(D, { chestW: 0.4, t: 1.05, at: 1.1 });
  if (id === 'dung') Object.assign(D, { chestW: 0.39, at: 1.12, t: 1.05 });
  if (id === 'linh') Object.assign(D, { chestW: 0.33, t: 0.95, at: 0.95 });
  crewBody(B, D, { noHands: heavy, noAntenna: id === 'linh' || id === 'hue' || id === 'khoi', num: String(CREW_IDS.indexOf(id) + 1).padStart(2, '0') });
  ACC[id](B, D);
  return { loco: 'biped', stride: 1.15, atk: heavy ? 'slam' : 'punch', extra: EXTRA[id], height: 1.62, downLift: 0.16 };
}

const RED = new THREE.Color(1.0, 0.08, 0.05);
// Impostor reuses the crew chassis and hides a jaw and claws that open with state.reveal / attack.
export function buildImpostor(B) {
  const D = crewDims({});
  crewBody(B, D, {});
  B.joint('jaw', 'head', 0, 0.03, 0.06);
  B.box('jaw', 'dark', 0.15, 0.012, 0.07, { p: [0, -0.002, 0.03], c: 0x200808 });
  for (let i = 0; i < 7; i++) {
    const x = -0.06 + i * 0.02;
    B.lathe('jaw', 'metal', [[0, 0], [0.007, 0.002], [0, 0.03]], { seg: 4, p: [x, -0.005, 0.06], r: [Math.PI, 0, 0], c: 0xd8d0c0 });
    B.lathe('head', 'metal', [[0, 0], [0.007, 0.002], [0, 0.03]], { seg: 4, p: [x, 0.03, 0.12], c: 0xd8d0c0 });
  }
  B.box('head', 'glow2', 0.13, 0.012, 0.01, { p: [0, 0.035, 0.12], i: 2.4 });
  for (const [S, sg] of SIDES) {
    B.joint('claw' + S, 'ha' + S, 0, -0.08, 0);
    for (const z of [-0.025, 0, 0.025]) B.lathe('claw' + S, 'metal', [[0, 0], [0.008, 0.003], [0, 0.11]], { seg: 4, p: [0, 0, z], r: [Math.PI, 0, 0], c: 0xd0d4da });
  }
  return {
    loco: 'biped', stride: 1.15, atk: 'swipe', height: 1.62, downLift: 0.16,
    extra: ({ J, S }) => {
      const r = Math.max(S.reveal, S.a > 0 ? 1 : 0);
      J.jaw.rotation.x = 0.55 * r * (0.8 + 0.2 * Math.sin(S.t * 20));
      J.jaw.position.y -= 0.035 * r;
      for (const s of ['L', 'R']) { J['claw' + s].scale.setScalar(0.05 + 0.95 * r); J['claw' + s].visible = r > 0.02; }
      J.head.rotation.z += 0.12 * r * Math.sin(S.t * 7);
      if (r > 0.4) S.glowTint = RED;
    },
  };
}
