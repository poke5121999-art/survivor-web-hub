import { SIDES, crewDims, rigBiped, legParts, armParts, torsoParts, hand, slimLeg, slimArm, claw, pauldron } from './parts.js';

const BASE = { d: 0x2a2c31, k: 0x8f959d, v: 0x0a0d10 };
const pal = (o) => ({ ...BASE, ...o });
const PI = Math.PI;

function gauntBody(B, D, o = {}) {
  rigBiped(B, D);
  // limbs read too thin at boss scale: thicken the shells (not the bone lengths)
  const DL = { ...D, t: D.t * 1.5, at: D.at * 1.45 };
  for (const [S, sg] of SIDES) { slimLeg(B, DL, S, sg, o.leg || {}); slimArm(B, DL, S, sg, o.arm || {}); if (!o.noPauldron) pauldron(B, 'sh' + S, sg, D.at * 0.85, o.pc || 'm', o.pc2 || 's'); }
  B.box('hips', 'paint', 0.22, 0.12, 0.15, { b: 0.035, k: 2, c: 's' });
  for (const [, sg] of SIDES) B.box('hips', 'paint', 0.05, 0.14, 0.13, { p: [sg * 0.12, -0.03, 0], b: 0.015, c: 'm' });
  B.cyl('torso', 'dark', 0.055, 0.06, D.abd + 0.02, { p: [0, D.abd / 2, -0.01] });
  for (let i = 0; i < 4; i++) B.torus('torso', 'metal', 0.068, 0.01, { ax: 'y', p: [0, 0.02 + i * (D.abd / 4), -0.01], ts: 20, rs: 5 });
  const W = D.chestW, H = D.chestH, Dp = D.chestD, k = H / 0.27, kz = Dp / 0.21;
  B.prof('chest', 'paint', [[-0.09, 0.02], [0.06, 0.0], [0.11, 0.08], [0.12, 0.18], [0.09, 0.255], [0.03, 0.28], [-0.07, 0.28], [-0.105, 0.2], [-0.1, 0.08]].map(([z, y]) => [z * kz, y * k]), W, { b: 0.04, bs: 3, tb: [0.6, 1], c: 'm' });
  for (let i = 0; i < 3; i++) for (const [, sg] of SIDES) B.box('chest', 'paint', W * 0.36, 0.022, 0.03, { p: [sg * W * 0.2, H * (0.3 + i * 0.16), 0.118 * kz], r: [0.1, -sg * 0.35, sg * (0.18 - i * 0.05)], b: 0.008, k: 2, c: 's' });
  B.box('chest', 'paint', 0.04, H * 0.7, 0.03, { p: [0, H * 0.55, 0.122 * kz], b: 0.012, k: 2, c: 's' });
  B.box('chest', 'paint', W * 0.75, 0.05, Dp * 0.85, { p: [0, H, -0.01], b: 0.02, k: 2, c: 's' });
  for (const [, sg] of SIDES) B.vent('chest', sg * (W / 2 - 0.004), H * 0.5, -0.01, 0.08, 0.07, 3, { ax: 'x', sgn: sg });
  B.cyl('neck', 'metal', 0.035, 0.04, 0.09, { p: [0, 0.02, 0] });
  B.vent('chest', 0, H * 0.55, -Dp / 2 - 0.005, 0.12, 0.12, 5, { sgn: -1 });
}

// ---------- vampire: tall cape of hinged panels, flared collar, long claws ----------
function vampire(B) {
  const D = crewDims({ ankle: 0.07, shin: 0.45, thigh: 0.43, legX: 0.09, waist: 0.1, abd: 0.18, chestW: 0.32, chestH: 0.3, chestD: 0.18, shX: 0.21, shY: 0.26, neckY: 0.3, neckH: 0.05, upper: 0.34, fore: 0.34, t: 0.9, at: 0.85, scale: 1.5 });
  gauntBody(B, D, { arm: { fingerL: 0.2, fingers: 4, clawC: 0xd8d2d0 } });
  for (const [S, sg] of SIDES) B.box('sh' + S, 'paint', 0.16, 0.06, 0.16, { p: [sg * 0.04, 0.05, 0], r: [0, 0, -sg * 0.35], b: 0.02, k: 2, c: 's' });
  const H = D.chestH;
  for (const [, sg] of SIDES) for (let i = 0; i < 3; i++) B.ext('chest', 'paint', [[0, 0], [0.1, 0.05], [0.2 + i * 0.03, 0.32 - i * 0.05], [0.08, 0.26], [0, 0.18]], 0.012, { p: [sg * (0.05 + i * 0.03), H - 0.02, -0.06 - i * 0.012], r: [-0.2, sg > 0 ? 0.3 : PI - 0.3, 0], c: i === 1 ? 'm' : 's', b: 0.004 });
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + (i / 6) * 1.8, j = 'cape' + i;
    B.joint(j, 'chest', Math.sin(a) * 0.17, H - 0.02, -0.08 - Math.cos(a) * 0.06);
    B.J[j].rotation.set(0.12, a * 0.6, 0);
    const L = 1.15 + 0.05 * Math.cos(a * 3);
    B.ext(j, 'paint', [[-0.075, 0], [0.075, 0], [0.09, -L * 0.6], [0.06, -L], [0, -L - 0.06], [-0.06, -L], [-0.09, -L * 0.6]], 0.014, { c: i % 2 ? 'm' : 0x3a1220, b: 0.004 });
    B.box(j, 'paint', 0.15, 0.02, 0.02, { p: [0, -0.03, 0.006], c: 'a', b: 0.004 });
    B.bolt(j, 0, -0.06, 0.008, 'z', 0.008, { c: 'a' });
  }
  const h = 'head';
  B.box(h, 'paint', 0.17, 0.24, 0.19, { p: [0, 0.12, 0], b: 0.04, k: 2, c: 's', taper: [0.9, 1], tb: [0.55, 0.8] });
  B.ext(h, 'paint', [[-0.08, 0], [0, -0.05], [0.08, 0], [0.09, 0.05], [-0.09, 0.05]], 0.04, { p: [0, 0.22, 0.08], r: [-PI / 2 + 0.25, 0, 0], c: 'm', b: 0.008 });
  B.box(h, 'dark', 0.15, 0.04, 0.04, { p: [0, 0.14, 0.088], b: 0.012, c: 0x0b0b0c });
  for (const [, sg] of SIDES) { B.box(h, 'glow', 0.04, 0.016, 0.01, { p: [sg * 0.04, 0.142, 0.106], r: [0, 0, sg * 0.35], b: 0.005, i: 3.4 }); B.ext(h, 'paint', [[0, 0], [0.09, 0.06], [0.05, -0.02]], 0.012, { p: [sg * 0.085, 0.2, -0.02], r: [0, sg * -1.3, 0.4], c: 'm' }); }
  for (const [, sg] of SIDES) B.lathe(h, 'metal', [[0, 0], [0.008, 0.003], [0, 0.03]], { seg: 5, p: [sg * 0.025, 0.04, 0.08], r: [PI, 0, 0], c: 0xe0dcd8 });
  B.box(h, 'paint', 0.1, 0.03, 0.08, { p: [0, 0.03, 0.06], b: 0.01, c: 'm' });
  for (let i = 0; i < 2; i++) for (const [, sg] of SIDES) B.ext('chest', 'paint', [[0, 0], [0.05, 0.03], [0.08, 0], [0.05, -0.02]], 0.01, { p: [sg * 0.12, H * 0.5 + i * 0.05, 0.1], r: [0, 0, sg * 0.3], c: 'a' });
  return {
    loco: 'biped', stride: 1.4, legAmp: 0.4, armAmp: 0.15, height: 2.62, atk: 'grab', downLift: 0.12,
    extra: ({ J, S }) => { for (let i = 0; i < 7; i++) J['cape' + i].rotation.x += 0.05 * Math.sin(S.t * 1.5 + i) + 0.35 * S.w + 0.3 * (S.a > 0 ? Math.sin(S.a * PI) : 0); },
  };
}

// ---------- pharaoh: striped headdress, broad collar, crook staff ----------
function pharaoh(B) {
  const D = crewDims({ chestW: 0.42, chestH: 0.32, chestD: 0.24, shX: 0.26, shY: 0.24, neckY: 0.33, t: 1.1, at: 1.0, scale: 1.52 });
  rigBiped(B, D);
  for (const [S, sg] of SIDES) { legParts(B, D, S, sg); armParts(B, D, S, sg, { noPauldron: true }); }
  torsoParts(B, D, { noPack: true, noNum: true });
  for (let i = 0; i < 9; i++) { const a = -1.1 + (i / 8) * 2.2; B.box('hips', 'paint', 0.07, 0.36, 0.02, { p: [Math.sin(a) * 0.17, -0.17, Math.cos(a) * 0.12], r: [0.12 * Math.cos(a), a, 0], c: i % 2 ? 'm' : 'a', b: 0.006, ro: 'YXZ' }); }
  B.box('hips', 'paint', 0.1, 0.4, 0.03, { p: [0, -0.18, 0.13], b: 0.008, c: 's', tb: [1.4, 1] });
  for (let i = 0; i < 4; i++) B.box('hips', 'paint', 0.104, 0.02, 0.034, { p: [0, -0.05 - i * 0.09, 0.13], c: 'm', b: 0.003 });
  const H = D.chestH;
  for (let r = 0; r < 4; r++) B.lathe('chest', 'paint', [[0.22 + r * 0.05, H - 0.03 - r * 0.015, 1], [0.17 + r * 0.05, H - 0.005 - r * 0.012]], { seg: 24, a0: -1.6, a1: 1.6, c: r % 2 ? 's' : 'm', s: [1, 1, 0.8] });
  for (let i = 0; i < 11; i++) { const a = -1.4 + (i / 10) * 2.8; B.sphere('chest', 'glow2', 0.008, { p: [Math.sin(a) * 0.36, H - 0.06, Math.cos(a) * 0.36 * 0.8], i: 2 }); }
  for (const [S, sg] of SIDES) { for (let i = 0; i < 3; i++) B.torus('el' + S, 'paint', 0.058, 0.01, { ax: 'y', p: [0, -0.06 - i * 0.03, 0], ts: 20, c: i % 2 ? 's' : 'm' }); }
  const h = 'head';
  B.box(h, 'paint', 0.17, 0.2, 0.19, { p: [0, 0.1, 0.01], b: 0.04, k: 2, c: 'm' });
  B.box(h, 'dark', 0.15, 0.06, 0.04, { p: [0, 0.11, 0.095], b: 0.014, c: 0x0b0b0c });
  for (const [, sg] of SIDES) B.box(h, 'glow', 0.04, 0.014, 0.01, { p: [sg * 0.037, 0.115, 0.115], r: [0, 0, sg * -0.1], b: 0.004, i: 3.2 });
  B.box(h, 'paint', 0.03, 0.08, 0.03, { p: [0, 0.0, 0.08], b: 0.01, c: 's', tb: [0.6, 1] });
  // nemes headdress: crown + striped lappets
  B.box(h, 'paint', 0.3, 0.1, 0.27, { p: [0, 0.2, -0.02], b: 0.045, k: 2, c: 'm', taper: [0.75, 0.85] });
  for (let i = 0; i < 6; i++) B.box(h, 'paint', 0.305 - i * 0.01, 0.012, 0.275, { p: [0, 0.165 + i * 0.012, -0.02], c: 's', b: 0.003 });
  for (const [, sg] of SIDES) for (let i = 0; i < 6; i++) B.box(h, 'paint', 0.06, 0.04, 0.03, { p: [sg * (0.13 + i * 0.012), 0.15 - i * 0.05, 0.05], r: [0, 0, sg * 0.15], c: i % 2 ? 's' : 'm', b: 0.008 });
  B.ext(h, 'paint', [[-0.04, 0], [0.04, 0], [0.015, 0.09], [-0.015, 0.09]], 0.02, { p: [0, 0.24, 0.1], r: [-0.2, 0, 0], c: 'm' });
  B.sphere(h, 'glow2', 0.012, { p: [0, 0.31, 0.11], i: 3 });
  B.box(h, 'paint', 0.16, 0.05, 0.25, { p: [0, 0.13, -0.15], r: [-0.4, 0, 0], b: 0.015, c: 'm' });
  // staff
  B.joint('staff', 'haR', 0, -0.11, 0.0);
  B.cyl('staff', 'paint', 0.016, 0.016, 1.55, { p: [0, 0.3, 0], seg: 10, c: 'm' });
  for (let i = 0; i < 7; i++) B.cyl('staff', 'paint', 0.019, 0.019, 0.03, { p: [0, -0.3 + i * 0.2, 0], seg: 10, c: 's' });
  B.torus('staff', 'paint', 0.08, 0.018, { arc: PI * 1.3, p: [0, 1.1, 0.07], r: [0, PI / 2, PI * 0.5], ts: 20, c: 'm' });
  B.sphere('staff', 'glow2', 0.045, { p: [0, 1.09, 0], i: 2.4 });
  B.torus('staff', 'metal', 0.05, 0.008, { p: [0, 1.09, 0], ax: 'x', ts: 20, c: 'm' });
  return {
    loco: 'biped', stride: 1.2, legAmp: 0.35, armAmp: 0.15, height: 2.86, atk: 'staff', downLift: 0.16, noCarry: true,
    extra: ({ J, S }) => { J.shR.rotation.x += -0.35; J.elR.rotation.x += -0.6; S.glowMul = 1 + 0.6 * (S.a > 0 ? Math.sin(S.a * PI) : 0); },
  };
}

// ---------- joker: jester horns, grin light, diamond chest, spring legs ----------
function joker(B) {
  const D = crewDims({ ankle: 0.07, shin: 0.42, thigh: 0.4, chestW: 0.34, chestH: 0.3, chestD: 0.2, shX: 0.22, neckY: 0.3, upper: 0.32, fore: 0.32, t: 0.85, at: 0.85, scale: 1.45 });
  gauntBody(B, D, { leg: { footL: 0.34 }, arm: { fingers: 3, fingerL: 0.1 } });
  const H = D.chestH;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) B.box('chest', 'paint', 0.06, 0.06, 0.012, { p: [-0.08 + c * 0.08, H * 0.2 + r * 0.06, D.chestD / 2 + 0.03], r: [0, 0, PI / 4], c: (r + c) % 2 ? 'm' : 's', b: 0.004 });
  for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2; B.ext('neck', 'paint', [[0, -0.04], [0.22, -0.07], [0.27, 0], [0.22, 0.07], [0, 0.04]], 0.02, { p: [Math.sin(a) * 0.05, -0.02, Math.cos(a) * 0.05], r: [0, a - PI / 2, 0.3], ro: 'YXZ', c: i % 2 ? 'm' : 's', b: 0.006 }); }
  const h = 'head';
  B.sphere(h, 'paint', 0.12, { p: [0, 0.11, 0], s: [1, 1.15, 1], c: 0xe8e4dc, seg: 20, rows: 14 });
  B.box(h, 'dark', 0.16, 0.06, 0.05, { p: [0, 0.07, 0.09], b: 0.025, c: 0x0b0b0c, k: 2 });
  B.torus(h, 'glow2', 0.065, 0.009, { arc: PI, p: [0, 0.09, 0.115], r: [0, 0, PI], ts: 20, i: 3 });
  for (let i = 0; i < 6; i++) B.box(h, 'paint', 0.006, 0.02, 0.008, { p: [-0.05 + i * 0.02, 0.055 + Math.abs(i - 2.5) * 0.008, 0.118], c: 0xe8e4dc, b: 0.001 });
  for (const [, sg] of SIDES) { B.box(h, 'glow', 0.035, 0.035, 0.01, { p: [sg * 0.045, 0.15, 0.108], r: [0, 0, PI / 4], b: 0.004, i: 3 }); B.box(h, 'paint', 0.012, 0.05, 0.006, { p: [sg * 0.045, 0.2, 0.105], c: 'm' }); }
  B.lathe(h, 'paint', [[0, 0], [0.125, 0.0, 1], [0.13, 0.03, 1], [0, 0.03]], { seg: 20, p: [0, 0.2, 0], c: 'a' });
  for (const [S, sg] of SIDES) {
    const pts = [[sg * 0.05, 0.22, 0], [sg * 0.15, 0.32, -0.02], [sg * 0.28, 0.33, -0.06], [sg * 0.34, 0.24, -0.1]];
    B.tube(h, 'paint', pts, 0.04, { c: sg > 0 ? 'm' : 's', ts: 20, rs: 10 });
    B.sphere(h, 'paint', 0.045, { p: [sg * 0.345, 0.205, -0.11], c: 'a' });
    B.sphere(h, 'glow2', 0.02, { p: [sg * 0.345, 0.17, -0.11], i: 2.2 });
  }
  for (const [S] of SIDES) { B.torus('el' + S, 'paint', 0.05, 0.02, { ax: 'y', p: [0, -0.04, 0], ts: 16, c: 'a' }); }
  for (const [S, sg] of SIDES) B.lathe('ft' + S, 'paint', [[0.045, 0], [0.03, 0.12], [0, 0.18]], { ax: 'z', seg: 10, p: [0, -0.04, 0.2], r: [0.5, 0, 0], c: 's' });
  for (const [S] of SIDES) for (let i = 0; i < 6; i++) B.torus('kn' + S, 'metal', 0.04, 0.008, { ax: 'y', p: [0, -0.08 - i * 0.045, 0], ts: 14, rs: 4, c: 0xd0c060 });
  return {
    loco: 'biped', stride: 1.4, legAmp: 0.55, armAmp: 0.7, height: 2.45, atk: 'swipe', downLift: 0.12,
    extra: ({ J, S }) => { J.head.rotation.z += 0.18 * Math.sin(S.t * 1.7); J.hips.position.y += 0.03 * Math.abs(Math.sin(S.ph * 2)) * S.w; },
  };
}

// ---------- alien: elongated cranium, ink tank, back tentacles, reverse knees ----------
function alien(B) {
  const D = crewDims({ ankle: 0.08, shin: 0.45, thigh: 0.38, legX: 0.1, waist: 0.1, abd: 0.2, chestW: 0.3, chestH: 0.28, chestD: 0.2, shX: 0.2, neckY: 0.28, neckH: 0.12, upper: 0.34, fore: 0.36, t: 0.9, at: 0.8, scale: 1.36 });
  gauntBody(B, D, { arm: { fingers: 3, fingerL: 0.22 }, noPauldron: true });
  B.J.knL.rotation.x = -0.45; B.J.knR.rotation.x = -0.45; B.J.thL.rotation.x = 0.35; B.J.thR.rotation.x = 0.35; B.J.ftL.rotation.x = 0.1; B.J.ftR.rotation.x = 0.1;
  B.J.neck.rotation.x = 0.2;
  const H = D.chestH;
  B.sphere('chest', 'clear', 0.09, { p: [0, H * 0.5, D.chestD / 2 + 0.06] });
  B.sphere('chest', 'glow2', 0.07, { p: [0, H * 0.45, D.chestD / 2 + 0.06], i: 1.4 });
  B.torus('chest', 'metal', 0.09, 0.012, { p: [0, H * 0.5, D.chestD / 2 + 0.06], ts: 24 });
  B.cyl('chest', 'metal', 0.02, 0.03, 0.1, { ax: 'z', p: [0, H * 0.5, D.chestD / 2 + 0.17], seg: 10 });
  const h = 'head';
  B.sphere(h, 'paint', 0.15, { p: [0, 0.18, -0.12], r: [-0.9, 0, 0], s: [0.85, 1.9, 0.95], seg: 24, rows: 18, c: 'm' });
  B.sphere(h, 'paint', 0.09, { p: [0, 0.06, 0.04], s: [0.85, 1, 1], c: 'm' });
  for (let i = 0; i < 5; i++) B.torus(h, 'paint', 0.125 - i * 0.008, 0.007, { p: [0, 0.2 + i * 0.03, -0.12 - i * 0.07], r: [-0.9 + PI / 2, 0, 0], ts: 24, rs: 4, c: 's' });
  for (const [, sg] of SIDES) { B.sphere(h, 'glass', 0.04, { p: [sg * 0.05, 0.1, 0.1], r: [0, 0, sg * 0.5], s: [1.6, 0.8, 0.5], c: 0x050608 }); B.sphere(h, 'glow', 0.026, { p: [sg * 0.05, 0.1, 0.112], r: [0, 0, sg * 0.5], s: [1.6, 0.6, 0.4], i: 2.6 }); }
  for (let i = 0; i < 4; i++) {
    const j = 'ten' + i, sg = i < 2 ? 1 : -1, up = i % 2;
    B.joint(j, 'chest', sg * 0.08, H * (0.5 + up * 0.3), -D.chestD / 2);
    const pts = [[0, 0, 0], [sg * 0.12, 0.05, -0.12], [sg * 0.26, -0.05 + up * 0.15, -0.2], [sg * 0.36, -0.25 + up * 0.2, -0.16], [sg * 0.4, -0.45 + up * 0.25, -0.05]];
    B.tube(j, 'paint', pts, 0.025, { c: i % 2 ? 's' : 'm', ts: 26, rs: 8 });
    for (let k = 1; k < 5; k++) B.torus(j, 'metal', 0.028, 0.006, { p: pts[k], ts: 12, rs: 4, r: [k, 0, 0] });
    B.sphere(j, 'glow2', 0.018, { p: pts[4], i: 2.6 });
  }
  return {
    loco: 'biped', stride: 1.3, legAmp: 0.4, height: 2.55, atk: 'shoot', atkSide: 'R', downLift: 0.12,
    extra: ({ J, S }) => { for (let i = 0; i < 4; i++) { J['ten' + i].rotation.y += 0.25 * Math.sin(S.t * 1.4 + i * 1.6); J['ten' + i].rotation.x += 0.2 * Math.cos(S.t * 1.1 + i); } J.chest.rotation.x -= (S.a > 0 ? 0.3 * Math.sin(S.a * PI) : 0); },
  };
}

// ---------- nurse: cap with cross light, speaker mouth, syringe launcher, apron ----------
function nurse(B) {
  const D = crewDims({ ankle: 0.07, shin: 0.42, thigh: 0.42, legX: 0.09, chestW: 0.3, chestH: 0.28, chestD: 0.18, shX: 0.2, neckY: 0.29, neckH: 0.08, upper: 0.32, fore: 0.32, t: 0.85, at: 0.8, scale: 1.38 });
  gauntBody(B, D, { arm: { fingers: 3, fingerL: 0.14 } });
  B.J.torso.rotation.x = 0.25; B.J.neck.rotation.x = 0.1; B.J.head.rotation.z = -0.3;
  B.box('chest', 'paint', 0.26, 0.24, 0.03, { p: [0, D.chestH * 0.5, D.chestD / 2 + 0.03], b: 0.01, c: 'm' });
  B.joint('apron', 'hips', 0, 0.02, 0.12);
  B.box('apron', 'paint', 0.3, 0.55, 0.02, { p: [0, -0.26, 0], b: 0.008, c: 'm', tb: [1.25, 1] });
  for (let i = 0; i < 4; i++) B.box('apron', 'paint', 0.004, 0.08 + (i % 2) * 0.1, 0.004, { p: [-0.1 + i * 0.065, -0.3 - (i % 3) * 0.05, 0.012], c: 0x5a2020, b: 0.001 });
  B.box('apron', 'paint', 0.06, 0.02, 0.022, { p: [0, -0.15, 0.002], c: 'a' }); B.box('apron', 'paint', 0.02, 0.06, 0.022, { p: [0, -0.15, 0.002], c: 'a' });
  const h = 'head';
  B.box(h, 'paint', 0.18, 0.22, 0.19, { p: [0, 0.11, 0], b: 0.06, k: 2, c: 'm' });
  B.box(h, 'dark', 0.12, 0.03, 0.03, { p: [0, 0.16, 0.088], b: 0.01, c: 0x0a0a0a });
  for (const [, sg] of SIDES) B.cyl(h, 'glow', 0.012, 0.012, 0.01, { ax: 'z', p: [sg * 0.035, 0.16, 0.103], seg: 10, i: 3 });
  B.cyl(h, 'dark', 0.055, 0.06, 0.04, { ax: 'z', p: [0, 0.06, 0.09], seg: 18, c: 0x111111 });
  for (const r of [0.02, 0.035, 0.05]) B.torus(h, 'metal', r, 0.004, { p: [0, 0.06, 0.112], ts: 18, rs: 4 });
  B.box(h, 'paint', 0.2, 0.08, 0.1, { p: [0, 0.24, 0.02], r: [-0.25, 0, 0], b: 0.02, k: 2, c: 'm', taper: [1.25, 1] });
  B.box(h, 'glow2', 0.05, 0.014, 0.01, { p: [0, 0.255, 0.074], r: [-0.25, 0, 0], i: 3 }); B.box(h, 'glow2', 0.014, 0.05, 0.01, { p: [0, 0.255, 0.074], r: [-0.25, 0, 0], i: 3 });
  for (const [, sg] of SIDES) B.box(h, 'paint', 0.004, 0.22, 0.005, { p: [sg * 0.04, 0.1, 0.095], r: [0, 0, sg * 0.3], c: 0x9a9a90 });
  // syringe launcher on the right forearm
  const E = 'elR';
  B.cyl(E, 'clear', 0.04, 0.04, 0.22, { p: [0, -0.2, 0.07], seg: 14 });
  B.cyl(E, 'glow2', 0.03, 0.03, 0.14, { p: [0, -0.23, 0.07], seg: 12, i: 1.6 });
  for (let i = 0; i < 5; i++) B.torus(E, 'metal', 0.041, 0.004, { ax: 'y', p: [0, -0.12 - i * 0.04, 0.07], ts: 16, rs: 3 });
  B.cyl(E, 'metal', 0.045, 0.04, 0.03, { p: [0, -0.09, 0.07], seg: 14 });
  B.rod(E, 'metal', [0, -0.09, 0.07], [0, 0.02, 0.07], 0.007);
  B.cyl(E, 'metal', 0.025, 0.025, 0.012, { p: [0, 0.02, 0.07], seg: 12 });
  B.cyl(E, 'metal', 0.012, 0.03, 0.025, { p: [0, -0.32, 0.07], seg: 10 });
  B.cyl(E, 'chrome', 0.003, 0.003, 0.12, { p: [0, -0.39, 0.07], seg: 6 });
  return { loco: 'biped', stride: 1.2, legAmp: 0.45, height: 2.42, atk: 'shoot', downLift: 0.12, extra: ({ J, S }) => { J.apron.rotation.x = -0.1 - 0.3 * S.w * Math.max(0, Math.sin(S.ph)); J.head.rotation.z += S.a > 0 ? 0.3 * Math.sin(S.t * 30) * Math.sin(S.a * PI) : 0.04 * Math.sin(S.t * 5); } };
}

export const BOSSES = {
  vampire: { pal: pal({ m: 0x2a1e26, s: 0x6e1424, a: 0xb89a5a, e: 0xff2030, g: 0xff2030 }), build: vampire },
  pharaoh: { pal: pal({ m: 0xc9a03a, s: 0x1f3f7a, a: 0x2a2520, e: 0x40ffd0, g: 0x40ffd0 }), build: pharaoh },
  joker: { pal: pal({ m: 0x6a2a8a, s: 0x2a9a4a, a: 0xe8d040, e: 0xff40ff, g: 0x40ff80 }), build: joker },
  alien: { pal: pal({ m: 0x5a6a7a, s: 0x2a2f3a, a: 0x8a3ac8, e: 0x80ff90, g: 0xb070ff }), build: alien },
  nurse: { pal: pal({ m: 0xd8dcd6, s: 0x6f7c78, a: 0xc02a3a, e: 0xff4060, g: 0xff3050 }), build: nurse },
};
