// The thirteen zombie kinds as code: one FoeGeo each, built once and drawn by instancing (horde.js).
// KINDS[id] = { gait, sw, cloth, s, top, build(g) }: gait feeds the shader (kit.js foeMaterials), sw is how fast the gait
// cycles per metre, cloth the tints an instance may wear on its cloth parts, s the scale the body is drawn at, top its height.
import { FoeGeo } from './kit.js?v=20261124a';

const DARK = 0x1c1418;
const EYE = 0xfff27a;

// A shambling body: legs, pelvis, chest, arms, head. P overrides proportions and colours; returns the joints for extras.
function human(g, P) {
  const hip = P.hip ?? 0.8; const hx = P.hx ?? 0.12; const leg = P.leg ?? 0.085; const [tw, th, td] = P.torso || [0.46, 0.6, 0.3];
  const skin = P.skin; const shirt = P.shirt; const pants = P.pants; const sx = P.sx ?? tw / 2 + 0.05; const arm = P.arm ?? 0.66; const ar = P.armR ?? 0.07;
  const sy = hip + th * 0.9; const ny = hip + th; const hr = P.head ?? 0.17; const hy = ny + (P.neck ?? 0.07) + hr * 0.9; const hz = P.headZ ?? 0.03;
  g.pair((s) => {
    const b = s < 0 ? 'legA' : 'legB'; const j = [s * hx, hip, 0]; const k = [s * hx * 1.08, hip * 0.5, 0.05];
    g.limb(j, k, leg, leg * 0.85, { col: pants, bone: b, piv: j, cloth: !!P.pantsCloth });
    g.limb(k, [s * hx * 1.08, 0.08, 0], leg * 0.8, leg * 0.65, { col: P.shin ?? skin, bone: b, piv: j });
    g.box(leg * 2.1, 0.1, leg * 3.4, [s * hx * 1.08, 0.05, 0.06], { col: P.shoe ?? 0x3a302a, bone: b, piv: j });
  });
  g.box(tw * 0.86, 0.2, td * 0.95, [0, hip + 0.02, 0], { col: pants, bone: 'hips', cloth: !!P.pantsCloth });
  g.box(tw, th, td, [0, hip + th / 2 + 0.04, 0], { col: shirt, cloth: true });
  g.pair((s) => {
    const b = s < 0 ? 'armL' : 'armR'; const j = [s * sx, sy, 0]; const e = [s * (sx + 0.02), sy - arm * 0.5, 0.02]; const h = [s * (sx + 0.02), sy - arm, 0.04];
    g.ball(ar * 1.5, ar * 1.4, ar * 1.5, j, { col: P.sleeve ?? shirt, bone: b, piv: j, cloth: P.sleeve === undefined, lo: true });
    g.limb(j, e, ar, ar * 0.9, { col: P.sleeve ?? shirt, bone: b, piv: j, cloth: P.sleeve === undefined });
    g.limb(e, h, ar * 0.85, ar * 0.7, { col: skin, bone: b, piv: j });
    g.ball(ar * 1.15, ar * 1.3, ar * 1.1, h, { col: skin, bone: b, piv: j, lo: true });
    if (P.claws) for (let i = -1; i <= 1; i++) g.spike([h[0] + i * ar * 0.6, h[1] - ar * 0.6, h[2] + 0.02], [h[0] + i * ar * 0.8, h[1] - ar * 0.6 - P.claws, h[2] + 0.06], ar * 0.3, { col: 0xe8e0c8, bone: b, piv: j });
  });
  const hb = { bone: 'head', piv: [0, ny, 0] };
  g.box(0.11, P.neck ?? 0.07, 0.1, [0, ny + (P.neck ?? 0.07) / 2, 0], { col: skin, ...hb });
  g.ball(hr, hr * 1.05, hr * 0.98, [0, hy, hz], { col: skin, ...hb });
  if (!P.noFace) {
    g.pair((s) => g.ball(hr * 0.2, hr * 0.17, hr * 0.12, [s * hr * 0.38, hy + hr * 0.12, hz + hr * 0.86], { col: P.eye ?? EYE, glow: 1, ...hb, lo: true }));
    g.box(hr * 0.9, hr * 0.32, hr * 0.5, [0, hy - hr * 0.62, hz + hr * 0.55], { col: P.jaw ?? skin, ...hb }, [0.25, 0, 0]);
    g.box(hr * 0.7, hr * 0.12, hr * 0.2, [0, hy - hr * 0.42, hz + hr * 0.82], { col: 0x2a0c0c, ...hb });
  }
  return { hip, sy, sx, ny, hy, hz, hr, hb, arm, tw, th, td };
}
const armOf = (s) => (s < 0 ? 'armL' : 'armR');

export const KINDS = {
  walker: {
    s: 1, sw: 1, cloth: [0xc8b8a0, 0x8a9ab8, 0xd0906a, 0x9ab89a],
    gait: { mode: 0, amp: 0.65, arm: -1.25, swingArm: 0, lean: 0.14, hip: 0.8, atk: 0, burst: 0x8fb070 },
    build(g) {
      const J = human(g, { skin: 0x8fae78, shirt: 0xe8e0d0, pants: 0x4a5878 });
      // torn shirt hanging off one side, ribs showing through the hole, a tuft of hair, one arm cut short
      g.box(0.16, 0.22, 0.04, [0.12, J.hip + 0.12, J.td / 2 + 0.01], { col: 0xe8e0d0, cloth: true }, [0.2, 0, 0.3]);
      for (let i = 0; i < 3; i++) g.box(0.14, 0.025, 0.03, [-0.1, J.hip + 0.36 + i * 0.07, J.td / 2 + 0.01], { col: 0xf0e8d8 });
      g.box(0.16, 0.2, 0.03, [-0.1, J.hip + 0.43, J.td / 2 - 0.005], { col: 0x5a2420 });
      for (let i = 0; i < 4; i++) g.spike([-0.08 + i * 0.05, J.hy + J.hr * 0.7, J.hz - 0.04], [-0.1 + i * 0.07, J.hy + J.hr * 1.35, J.hz - 0.1], 0.035, { col: 0x3a3028, ...J.hb });
    },
  },
  runner: {
    s: 0.95, sw: 1.6, cloth: [0xe83a2a, 0xf0b020, 0x30a0e0],
    gait: { mode: 0, amp: 1.0, arm: -0.2, swingArm: 1.0, lean: 0.48, hip: 0.95, atk: 0, burst: 0xc8d050 },
    build(g) {
      const J = human(g, { hip: 0.95, hx: 0.1, leg: 0.065, torso: [0.36, 0.52, 0.24], skin: 0xd0d070, shirt: 0xf0f0f0, pants: 0x2c2a34, arm: 0.74, armR: 0.055, head: 0.15, claws: 0.14, jaw: 0x8a8a40 });
      // the hood of a track jacket behind the head, two stripes down the sleeves' colour
      g.ball(0.2, 0.2, 0.17, [0, J.hy + 0.02, J.hz - 0.08], { col: 0xf0f0f0, cloth: true, ...J.hb });
      g.box(0.04, 0.5, 0.25, [0, J.hip + 0.3, 0], { col: 0xffffff }, [0, 0, 0]);
      g.pair((s) => g.box(0.03, 0.44, 0.03, [s * 0.17, J.hip + 0.3, J.td / 2], { col: 0xffffff }));
    },
  },
  spider: {
    s: 1, sw: 2.2, cloth: [0xb070e0, 0x60d060],
    gait: { mode: 2, amp: 0.42, arm: 0, lean: 0, hip: 0.5, atk: 3, bob: 0.04, burst: 0x8a4ab0 },
    build(g) {
      // swollen abdomen with glowing spots, a small body, a zombie face up front with fangs, eight jointed legs
      g.ball(0.42, 0.36, 0.48, [0, 0.62, -0.5], { col: 0x3a2850 });
      for (const [x, y, z] of [[0.18, 0.86, -0.42], [-0.2, 0.8, -0.62], [0.05, 0.95, -0.66], [-0.12, 0.88, -0.3], [0.26, 0.66, -0.75]]) g.ball(0.07, 0.06, 0.07, [x, y, z], { col: 0xa0ff60, glow: 1, lo: true });
      g.ball(0.11, 0.1, 0.11, [0, 0.55, -0.98], { col: 0x6a3a8a, cloth: true, lo: true });
      g.ball(0.26, 0.2, 0.3, [0, 0.52, 0.05], { col: 0x4a3460, cloth: true });
      const hb = { bone: 'head', piv: [0, 0.55, 0.25] };
      g.ball(0.17, 0.16, 0.16, [0, 0.6, 0.36], { col: 0x9a8aa8, ...hb });
      g.pair((s) => { g.ball(0.035, 0.035, 0.03, [s * 0.06, 0.64, 0.5], { col: 0xff4040, glow: 1, ...hb, lo: true }); g.spike([s * 0.05, 0.5, 0.45], [s * 0.03, 0.36, 0.52], 0.03, { col: 0xf0f0e0, ...hb }); });
      g.pair((s) => {
        for (let i = 0; i < 4; i++) {
          const z = 0.22 - i * 0.14; const j = [s * 0.16, 0.52, z]; const b = (i + (s > 0 ? 1 : 0)) % 2 ? 'legA' : 'legB';
          const k = [s * 0.55, 0.82, z + (1.5 - i) * 0.12]; const f = [s * 0.82, 0.02, z + (1.5 - i) * 0.3];
          g.limb(j, k, 0.04, 0.035, { col: 0x2e2040, bone: b, piv: j }); g.limb(k, f, 0.035, 0.015, { col: 0x2e2040, bone: b, piv: j });
          g.ball(0.04, 0.04, 0.04, k, { col: 0xa0ff60, glow: 0.6, bone: b, piv: j, lo: true });
        }
      });
    },
  },
  flyer: {
    s: 1, sw: 1, cloth: [0x6a3a8a, 0x8a2a4a],
    gait: { mode: 3, amp: 0.4, arm: 0, lean: 0.3, hip: 0.5, atk: 3, burst: 0xc060f0 },
    build(g) {
      // a bat body hanging between two wide membranes; big ears, red eyes, little dangling feet
      g.ball(0.2, 0.28, 0.2, [0, 0.55, 0], { col: 0x4a3a5a });
      g.ball(0.17, 0.12, 0.15, [0, 0.42, 0.06], { col: 0x7a6a8a });
      const hb = { bone: 'head', piv: [0, 0.78, 0] };
      g.ball(0.16, 0.15, 0.15, [0, 0.9, 0.04], { col: 0x5a4a6a, ...hb });
      g.pair((s) => {
        g.spike([s * 0.08, 0.98, 0.02], [s * 0.2, 1.24, -0.02], 0.06, { col: 0x5a4a6a, ...hb });
        g.ball(0.035, 0.03, 0.02, [s * 0.06, 0.93, 0.18], { col: 0xff3a3a, glow: 1, ...hb, lo: true });
        g.spike([s * 0.04, 0.82, 0.15], [s * 0.04, 0.74, 0.17], 0.018, { col: 0xf0f0e0, ...hb });
        const w = s < 0 ? 'wingL' : 'wingR'; const j = [s * 0.14, 0.7, -0.02];
        g.limb(j, [s * 0.55, 0.92, -0.05], 0.035, 0.03, { col: 0x3a2a4a, bone: w, piv: j });
        g.limb([s * 0.55, 0.92, -0.05], [s * 1.05, 0.7, -0.08], 0.03, 0.012, { col: 0x3a2a4a, bone: w, piv: j });
        for (let i = 0; i < 3; i++) g.box(0.34, 0.012, 0.3, [s * (0.36 + i * 0.25), 0.68 - i * 0.04, -0.08], { col: 0x6a3a8a, cloth: true, bone: w, piv: j }, [0, 0, s * (0.25 - i * 0.18)]);
        g.limb([s * 0.5, 0.9, -0.06], [s * 0.5, 0.42, -0.08], 0.012, 0.01, { col: 0xc070ff, glow: 0.8, bone: w, piv: j });
        const b = s < 0 ? 'legA' : 'legB'; const lj = [s * 0.08, 0.32, 0];
        g.limb(lj, [s * 0.09, 0.08, -0.04], 0.03, 0.02, { col: 0x3a2a4a, bone: b, piv: lj });
      });
    },
  },
  hound: {
    s: 1, sw: 2.1, cloth: [0x8a5a34, 0x6a4a3a, 0x9a8a7a],
    gait: { mode: 1, amp: 0.85, arm: 0, lean: 0, hip: 0.62, atk: 3, burst: 0xb07c46 },
    build(g) {
      // a lean dog on four legs: ribs bare along the flank, a ridge of bone spikes, a long snout with teeth, a stiff tail
      g.ball(0.2, 0.22, 0.48, [0, 0.66, -0.02], { col: 0x9a6a3e, cloth: true });
      g.ball(0.22, 0.24, 0.24, [0, 0.7, 0.26], { col: 0x9a6a3e, cloth: true });
      g.pair((s) => { for (let i = 0; i < 4; i++) g.box(0.02, 0.2, 0.04, [s * 0.19, 0.62, 0.12 - i * 0.1], { col: 0xf0e8d8 }, [0, 0, s * 0.2]); });
      for (let i = 0; i < 5; i++) g.spike([0, 0.86, 0.3 - i * 0.15], [0, 1.02 - i * 0.015, 0.24 - i * 0.15], 0.04, { col: 0xe8e0c8 });
      const hb = { bone: 'head', piv: [0, 0.78, 0.4] };
      g.ball(0.14, 0.14, 0.15, [0, 0.84, 0.52], { col: 0xa87a4a, ...hb });
      g.box(0.13, 0.1, 0.26, [0, 0.8, 0.7], { col: 0x8a5a34, ...hb });
      g.box(0.12, 0.05, 0.22, [0, 0.71, 0.66], { col: 0x6a3a2a, ...hb }, [0.3, 0, 0]);
      g.pair((s) => {
        g.spike([s * 0.07, 0.94, 0.48], [s * 0.12, 1.08, 0.42], 0.04, { col: 0x6a4a2a, ...hb });
        g.ball(0.03, 0.025, 0.02, [s * 0.07, 0.88, 0.64], { col: EYE, glow: 1, ...hb, lo: true });
        for (let i = 0; i < 2; i++) g.spike([s * 0.05, 0.77, 0.76 - i * 0.07], [s * 0.05, 0.72, 0.77 - i * 0.07], 0.012, { col: 0xf0f0e0, ...hb });
        const fa = armOf(s); const fj = [s * 0.13, 0.62, 0.3];
        g.limb(fj, [s * 0.14, 0.3, 0.33], 0.055, 0.04, { col: 0x8a5a34, bone: fa, piv: fj }); g.limb([s * 0.14, 0.3, 0.33], [s * 0.14, 0.03, 0.36], 0.04, 0.03, { col: 0x5a3a24, bone: fa, piv: fj });
        const hl = s < 0 ? 'legA' : 'legB'; const hj = [s * 0.13, 0.62, -0.32];
        g.limb(hj, [s * 0.14, 0.34, -0.42], 0.07, 0.045, { col: 0x8a5a34, bone: hl, piv: hj }); g.limb([s * 0.14, 0.34, -0.42], [s * 0.14, 0.03, -0.36], 0.04, 0.03, { col: 0x5a3a24, bone: hl, piv: hj });
      });
      const tj = [0, 0.72, -0.48]; g.limb(tj, [0, 0.95, -0.85], 0.04, 0.012, { col: 0x8a5a34, bone: 'tail', piv: tj });
    },
  },
  spitter: {
    s: 1, sw: 0.9, cloth: [0x4a7a20, 0x6a5a30],
    gait: { mode: 0, amp: 0.55, arm: -0.7, swingArm: 0, lean: 0.32, hip: 0.75, atk: 2, burst: 0x9aff40 },
    build(g) {
      const J = human(g, { hip: 0.75, torso: [0.44, 0.56, 0.32], skin: 0x7ec03a, shirt: 0x5a6a3a, pants: 0x3a4a20, arm: 0.55, head: 0.16, jaw: 0x5a9a2a });
      // a swollen glowing throat sac under the jaw, pustules on the back, acid running from the mouth
      g.ball(0.2, 0.17, 0.2, [0, J.hy - 0.2, J.hz + 0.14], { col: 0xa8ff50, glow: 0.7, ...J.hb });
      g.limb([0, J.hy - 0.18, J.hz + 0.2], [0, J.hy - 0.42, J.hz + 0.26], 0.025, 0.012, { col: 0xc0ff60, glow: 1, ...J.hb });
      for (const [x, y] of [[0.12, 0.2], [-0.1, 0.32], [0.06, 0.44], [-0.14, 0.12]]) g.ball(0.07, 0.07, 0.06, [x, J.hip + y, -J.td / 2 - 0.02], { col: 0x9aff40, glow: 0.6, lo: true });
      g.limb([0.1, J.hip + 0.5, -0.12], [0.02, J.hy + 0.05, -0.1], 0.03, 0.03, { col: 0x5a8a2a });
    },
  },
  bloater: {
    s: 1, sw: 0.7, cloth: [0xc8a030, 0xb08a50],
    gait: { mode: 0, amp: 0.42, arm: -0.45, swingArm: 0, lean: -0.06, hip: 0.6, atk: 0, burst: 0xdcc84a },
    build(g) {
      const J = human(g, { hip: 0.6, hx: 0.2, leg: 0.11, torso: [0.6, 0.6, 0.45], sx: 0.42, skin: 0xdcc85a, shirt: 0xc8b070, pants: 0x6a5a30, arm: 0.5, armR: 0.085, head: 0.15, neck: 0.02 });
      // a belly twice the body's width, stitched, with glowing pustules about to pop
      g.ball(0.52, 0.5, 0.5, [0, J.hip + 0.36, 0.1], { col: 0xe0d070 });
      for (let i = 0; i < 4; i++) g.box(0.03, 0.42, 0.02, [-0.18 + i * 0.12, J.hip + 0.36, 0.6], { col: 0x5a3a2a }, [0, 0, 0.1 * (i - 1.5)]);
      for (const [x, y, z] of [[0.3, 0.55, 0.44], [-0.32, 0.3, 0.42], [0.1, 0.08, 0.52], [-0.12, 0.66, 0.4], [0.42, 0.2, 0.3]]) g.ball(0.09, 0.09, 0.08, [x, J.hip + y, z], { col: 0xfff060, glow: 0.9, lo: true });
    },
  },
  shielder: {
    s: 1.05, sw: 0.8, cloth: [0x3a68c0, 0x2a4a80],
    gait: { mode: 0, amp: 0.55, arm: -1.15, swingArm: 0, lean: 0.06, hip: 0.82, atk: 4, burst: 0x6aa0f0 },
    build(g) {
      const J = human(g, { skin: 0x9ab08a, shirt: 0x3a5a90, pants: 0x2a3050, sleeve: 0x2a3a60, torso: [0.5, 0.62, 0.32] });
      // a riot helmet with a visor, and a door-sized shield on the left arm that the reach holds out in front
      g.ball(0.2, 0.16, 0.2, [0, J.hy + 0.06, J.hz - 0.01], { col: 0x2a3040, ...J.hb });
      g.box(0.3, 0.1, 0.06, [0, J.hy + 0.02, J.hz + 0.17], { col: 0x8ad0ff, glow: 0.4, ...J.hb });
      const j = [-J.sx, J.sy, 0];
      g.box(0.62, 0.06, 0.9, [-J.sx - 0.04, J.sy - J.arm * 0.7, 0.18], { col: 0x8a7050, bone: 'armL', piv: j });
      g.box(0.5, 0.04, 0.12, [-J.sx - 0.04, J.sy - J.arm * 0.7 - 0.04, -0.12], { col: 0x5a4a3a, bone: 'armL', piv: j });
      g.box(0.5, 0.04, 0.12, [-J.sx - 0.04, J.sy - J.arm * 0.7 - 0.04, 0.46], { col: 0x5a4a3a, bone: 'armL', piv: j });
      g.box(0.08, 0.08, 0.08, [-J.sx - 0.04, J.sy - J.arm * 0.7 - 0.06, 0.18], { col: 0xc0c8d0, bone: 'armL', piv: j });
      g.pair((s) => g.box(0.12, 0.1, 0.12, [s * 0.12, 0.42, 0.11], { col: 0x2a3040, bone: s < 0 ? 'legA' : 'legB', piv: [s * 0.12, 0.8, 0] }));
    },
  },
  brute: {
    s: 1.35, sw: 0.6, cloth: [0xd8d0c0, 0xc0b8a8],
    gait: { mode: 0, amp: 0.48, arm: -0.35, swingArm: 0, lean: 0.2, hip: 0.75, atk: 1, burst: 0x5d7f4f },
    build(g) {
      const J = human(g, { hip: 0.75, hx: 0.17, leg: 0.12, torso: [0.8, 0.66, 0.46], sx: 0.5, skin: 0x5d8a4f, shirt: 0x5d8a4f, sleeve: 0x5d8a4f, pants: 0x3a3030, arm: 0.72, armR: 0.12, head: 0.14, neck: 0.01, headZ: 0.12 });
      // shoulders like boulders, a butcher's apron, a cleaver in the right hand, a head sunk into the chest
      g.pair((s) => g.ball(0.22, 0.2, 0.22, [s * 0.4, J.sy + 0.04, 0], { col: 0x4f7a42, bone: armOf(s), piv: [s * J.sx, J.sy, 0] }));
      g.box(0.6, 0.62, 0.03, [0, J.hip + 0.24, J.td / 2 + 0.02], { col: 0xe0d8c8, cloth: true });
      g.box(0.42, 0.18, 0.031, [0.08, J.hip + 0.14, J.td / 2 + 0.03], { col: 0x8a1a14 });
      const j = [J.sx, J.sy, 0]; const hy = J.sy - J.arm - 0.04;
      g.box(0.05, 0.22, 0.05, [J.sx + 0.02, hy - 0.06, 0.06], { col: 0x4a3020, bone: 'armR', piv: j });
      g.box(0.04, 0.4, 0.34, [J.sx + 0.02, hy - 0.34, 0.16], { col: 0xc8d0d8, bone: 'armR', piv: j });
      g.box(0.045, 0.06, 0.34, [J.sx + 0.02, hy - 0.52, 0.16], { col: 0x8a2a20, bone: 'armR', piv: j });
      g.limb([0.08, J.hip + 0.6, -0.2], [0.24, J.hip + 0.75, -0.24], 0.03, 0.015, { col: 0x8a8a90 });
    },
  },
  shrieker: {
    s: 1.08, sw: 1, cloth: [0xc8588a, 0x8a58c8],
    gait: { mode: 0, amp: 0.6, arm: -1.55, swingArm: 0, lean: 0.22, hip: 0.92, atk: 5, burst: 0xf0e0ff },
    build(g) {
      const J = human(g, { hip: 0.92, hx: 0.09, leg: 0.06, torso: [0.34, 0.66, 0.22], skin: 0xece4f4, shirt: 0xc8588a, pants: 0xc8588a, pantsCloth: true, arm: 0.78, armR: 0.05, head: 0.16, neck: 0.12, claws: 0.1, noFace: true });
      // a mouth stretched open past the chin, white eyes, long black hair down the back, a torn dress
      g.ball(0.1, 0.14, 0.05, [0, J.hy - 0.06, J.hz + 0.15], { col: 0x1a0812, ...J.hb });
      g.pair((s) => g.ball(0.035, 0.03, 0.02, [s * 0.07, J.hy + 0.07, J.hz + 0.15], { col: 0xffffff, glow: 1, ...J.hb, lo: true }));
      for (let i = 0; i < 5; i++) g.box(0.05, 0.62, 0.03, [-0.12 + i * 0.06, J.hy - 0.2, J.hz - 0.15 - Math.abs(i - 2) * 0.01], { col: 0x14101a, ...J.hb }, [0.15, 0, 0]);
      g.limb([0, J.hip + 0.06, 0], [0, J.hip - 0.4, 0], 0.2, 0.3, { col: 0xc8588a, bone: 'hips', cloth: true }, 'cone');
    },
  },
  armored: {
    s: 1.2, sw: 0.65, cloth: [0xc8d0e0, 0xb0a890],
    gait: { mode: 0, amp: 0.5, arm: -0.55, swingArm: 0, lean: 0.12, hip: 0.82, atk: 0, burst: 0xc8d0e0 },
    build(g) {
      const J = human(g, { skin: 0x7a8a78, shirt: 0x8a96a8, pants: 0x5a6070, sleeve: 0x8a96a8, torso: [0.56, 0.64, 0.36], sx: 0.33, armR: 0.085, leg: 0.1, shin: 0x9aa4b4, noFace: true });
      // plate over chest and belly, round pauldrons, a bucket helm with a burning slit, greaves
      g.box(0.6, 0.36, 0.06, [0, J.hip + 0.48, J.td / 2 + 0.02], { col: 0xd0d8e4, cloth: true }, [-0.08, 0, 0]);
      g.box(0.5, 0.22, 0.05, [0, J.hip + 0.2, J.td / 2 + 0.02], { col: 0xb0b8c8, cloth: true });
      g.pair((s) => { const j = [s * J.sx, J.sy, 0]; g.ball(0.17, 0.12, 0.17, [s * (J.sx + 0.02), J.sy + 0.06, 0], { col: 0xd0d8e4, bone: armOf(s), piv: j }); g.spike([s * (J.sx + 0.06), J.sy + 0.14, 0], [s * (J.sx + 0.12), J.sy + 0.32, -0.02], 0.04, { col: 0xe8ecf0, bone: armOf(s), piv: j }); });
      g.box(0.3, 0.32, 0.3, [0, J.hy + 0.02, J.hz], { col: 0xc0c8d4, ...J.hb });
      g.box(0.24, 0.035, 0.02, [0, J.hy + 0.04, J.hz + 0.155], { col: 0xff5030, glow: 1, ...J.hb });
      g.spike([0, J.hy + 0.18, J.hz - 0.02], [0, J.hy + 0.34, J.hz - 0.12], 0.05, { col: 0x9a2020, ...J.hb });
    },
  },
  burner: {
    s: 1.02, sw: 1, cloth: [0x3a2018, 0x4a2a1a],
    gait: { mode: 0, amp: 0.7, arm: -0.75, swingArm: 0, lean: 0.14, hip: 0.8, atk: 0, burst: 0xffa030 },
    build(g) {
      const J = human(g, { skin: 0x2e1e18, shirt: 0x3a2018, pants: 0x241612, sleeve: 0x2e1e18, eye: 0xffd040 });
      // charred black skin split by glowing seams, flames licking off the head and shoulders
      for (const [x, y, r] of [[0.08, 0.2, 0.5], [-0.1, 0.38, -0.4], [0.02, 0.5, 0.2], [0.14, 0.08, -0.6]]) g.box(0.2, 0.025, 0.02, [x, J.hip + y, J.td / 2 + 0.012], { col: 0xff8a20, glow: 1 }, [0, 0, r]);
      g.pair((s) => { g.box(0.02, 0.3, 0.02, [s * (J.sx + 0.07), J.sy - 0.3, 0.04], { col: 0xff8a20, glow: 1, bone: armOf(s), piv: [s * J.sx, J.sy, 0] }); g.spike([s * J.sx, J.sy + 0.04, 0], [s * (J.sx - 0.02), J.sy + 0.3, -0.04], 0.07, { col: 0xff7010, glow: 1, bone: armOf(s), piv: [s * J.sx, J.sy, 0] }); });
      g.spike([0, J.hy + 0.08, J.hz - 0.02], [0, J.hy + 0.5, J.hz - 0.1], 0.13, { col: 0xff6a10, glow: 1, ...J.hb });
      g.spike([0.06, J.hy + 0.1, J.hz], [0.1, J.hy + 0.36, J.hz - 0.04], 0.08, { col: 0xffd040, glow: 1, ...J.hb });
      g.spike([-0.06, J.hy + 0.1, J.hz], [-0.11, J.hy + 0.32, J.hz - 0.05], 0.08, { col: 0xffc030, glow: 1, ...J.hb });
    },
  },
  frost: {
    s: 1.08, sw: 0.85, cloth: [0x78b8f0, 0x5a8ac8],
    gait: { mode: 0, amp: 0.6, arm: -0.85, swingArm: 0, lean: 0.1, hip: 0.82, atk: 0, burst: 0xc8f0ff },
    build(g) {
      const J = human(g, { skin: 0xa8d4f0, shirt: 0x6a9ad0, pants: 0x3a5a90, torso: [0.5, 0.62, 0.32], eye: 0xe0ffff });
      // ice crystals out of the shoulders and spine, icicles off the jaw, a frosted crown
      g.pair((s) => { const j = [s * J.sx, J.sy, 0]; g.gem(0.07, 0.2, 0.07, [s * (J.sx - 0.02), J.sy + 0.16, -0.02], { col: 0xdaf4ff, glow: 0.5, bone: armOf(s), piv: j }, [0, 0, -s * 0.4]); g.gem(0.05, 0.14, 0.05, [s * (J.sx + 0.08), J.sy + 0.1, 0.04], { col: 0xb8e8ff, glow: 0.5, bone: armOf(s), piv: j }, [0, 0, -s * 0.9]); });
      for (let i = 0; i < 4; i++) g.gem(0.06, 0.16 - i * 0.02, 0.06, [0, J.hip + 0.56 - i * 0.14, -J.td / 2 - 0.05], { col: 0xdaf4ff, glow: 0.5 }, [-0.8, 0, 0]);
      for (let i = -1; i <= 1; i++) g.spike([i * 0.05, J.hy - J.hr * 0.7, J.hz + 0.08], [i * 0.05, J.hy - J.hr * 1.4, J.hz + 0.1], 0.025, { col: 0xe8faff, glow: 0.4, ...J.hb });
      for (let i = 0; i < 5; i++) g.gem(0.035, 0.09, 0.035, [Math.cos(i * 1.256) * 0.13, J.hy + J.hr * 0.9, J.hz + Math.sin(i * 1.256) * 0.13], { col: 0xe8faff, glow: 0.6, ...J.hb });
    },
  },
};

// build every kind once: { geo, top } (top = height in metres before the kind's scale)
let built = null;
export function zombieGeos() {
  if (built) return built;
  built = {};
  for (const [id, K] of Object.entries(KINDS)) { const g = new FoeGeo(); K.build(g); built[id] = { geo: g.geometry(), top: g.top }; }
  return built;
}
void DARK;
