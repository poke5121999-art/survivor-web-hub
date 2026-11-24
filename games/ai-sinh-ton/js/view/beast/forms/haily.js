// Hải Ly Thợ (ranged, summoner, earth): a beaver kit with big front teeth and a flat paddle tail, then a master builder
// with a tool belt, a wooden hard hat and a mallet tail, then a beaver riding a wood-and-brass mech (SCOPE 3.1 #10).
import { quad, palette } from '../families.js?v=20261124b';
import { shade } from '../kit.js?v=20261124b';

const P0 = palette(0x9a6a40, { belly: 0xe0c49a, snout: 0xd8b88a, dark: 0x3a2414, tooth: 0xfff8e0, paddle: 0x4a3a30, nose: 0x2a1a10 });

function beaver(K, P, o = {}) {
  const g = quad(K, { pal: P, len: o.len ?? 0.62, rx: o.rx ?? 0.36, ry: o.ry ?? 0.31, n: 2.3, leg: o.leg ?? 0.13, legR: o.legR ?? 0.085, hr: o.hr ?? 0.36, neck: -0.04,
    snout: [0.62, 0.48, 0.55], ears: 'round', earK: 0.4, chestK: 1.0, hoof: P.dark });
  teeth(K, g.head, g.hr, P.tooth);
  return g;
}
function teeth(K, [, hy, hz], hr, col) {
  const sny = hy - hr * 0.3; const snz = hz + hr * 0.7;
  for (const s of [-1, 1]) K.blob('head', [s * 0.034, sny - hr * 0.36, snz + hr * 0.42], [0.032, 0.055, 0.02], { col, n: 3, steps: 4 });
}
// a wooden hard hat: a dome sunk into the crown, a brim, a ridge
function hardHat(K, [, hy, hz], hr, col) {
  K.blob('head', [0, hy + hr * 0.5, hz - 0.02], [hr * 0.92, hr * 0.55, hr * 0.94], { col, n: 2.2 });
  K.blob('head', [0, hy + hr * 0.48, hz + 0.02], [hr * 1.12, 0.03, hr * 1.16], { col: shade(col, 0.85), n: 2.4, steps: 4 });
  K.blob('head', [0, hy + hr * 0.98, hz - 0.02], [0.035, 0.05, hr * 0.8], { col: shade(col, 0.75), steps: 4 });
}
// the flat paddle tail on a two-bone chain lying behind on the ground, cross-hatched
function paddle(K, g, P, k = 1, mallet = null) {
  const z0 = -g.L * 0.5; const y0 = g.hipY - g.ry * 0.3;
  const tb = K.chain('tail', 'hip', [[0, y0, z0], [0, y0 - 0.1, z0 - 0.16 * k]], 'tail', 1.4);
  const c = [0, Math.max(0.05, y0 - 0.16), z0 - 0.32 * k];
  if (mallet) {
    K.blob(tb[1], [0, c[1] + 0.08, c[2]], [0.13, 0.12, 0.2], { col: mallet, n: 3.2, rot: [0, Math.PI / 2, 0] });
    for (const x of [-0.13, 0.13]) K.torus(tb[1], [x, c[1] + 0.08, c[2]], 0.12, 0.022, { col: 0xc89a40, rot: [0, 0, Math.PI / 2] });
  } else K.blob(tb[1], c, [0.17 * k, 0.035, 0.25 * k], { col: P.paddle, n: 2.4, colAt: (t) => (Math.floor((t + 1) * 4) % 2 ? P.paddle : shade(P.paddle, 0.8)) });
  K.tube([{ p: [0, y0, z0], rx: 0.1, ry: 0.07, bone: tb[0] }, { p: [0, c[1] + 0.02, c[2] + 0.2 * k], rx: 0.07, ry: 0.04, bone: tb[1] }], { col: P.body });
  return { tb, c };
}

export default {
  'haily.1': {
    height: 0.9, move: 'walk', attack: 'shoot',
    build(K) {
      const P = P0;
      const g = beaver(K, P);
      paddle(K, g, P);
      // a twig carried in the mouth
      const [, hy, hz] = g.head; const y = hy - g.hr * 0.5; const z = hz + g.hr * 0.95;
      K.horn('head', [[-0.3, y, z - 0.02], [0, y + 0.01, z], [0.3, y + 0.03, z - 0.04]], 0.02, { col: 0x8a5a2a, pow: 0.2 });
      K.blob('head', [0.28, y + 0.05, z - 0.04], [0.05, 0.03, 0.025], { col: 0x7ac84a, steps: 4, rot: [0, 0, 0.6] });
      return { legLen: g.leg };
    },
  },
  'haily.2': {
    height: 1.15, move: 'glide', attack: 'shoot', airH: 0.22,
    build(K) {
      const P = { ...P0, body: 0x8a5a34, wood: 0xe0a848, belt: 0x5a3018, metal: 0xc0c4cc };
      const g = beaver(K, P, { len: 0.7, rx: 0.37, ry: 0.33, leg: 0.15, hr: 0.37 });
      hardHat(K, g.head, g.hr, P.wood);
      // tool belt: a strap round the middle, pouches, a hammer and a wrench hanging off it
      K.torus('body', [0, g.hipY - 0.02, 0], g.rx * 1.02, 0.04, { col: P.belt, rot: [0, 0, 0], n: 2 });
      for (const s of [-1, 1]) K.blob('body', [s * g.rx * 0.95, g.hipY - 0.06, 0.06], [0.05, 0.08, 0.09], { col: 0x7a4a22, n: 3, steps: 4 });
      K.horn('body', [[g.rx * 1.05, g.hipY - 0.04, -0.08], [g.rx * 1.08, g.hipY - 0.14, -0.1], [g.rx * 1.08, g.hipY - 0.26, -0.12]], 0.022, { col: 0x8a5a2a, pow: 0 });
      K.blob('body', [g.rx * 1.08, g.hipY - 0.27, -0.12], [0.04, 0.04, 0.09], { col: P.metal, n: 3, steps: 4 });
      K.horn('body', [[-g.rx * 1.05, g.hipY - 0.04, -0.06], [-g.rx * 1.08, g.hipY - 0.14, -0.06], [-g.rx * 1.08, g.hipY - 0.24, -0.06]], 0.018, { col: P.metal, pow: 0 });
      K.torus('body', [-g.rx * 1.08, g.hipY - 0.26, -0.06], 0.035, 0.014, { col: P.metal, rot: [0, 0, Math.PI / 2] });
      paddle(K, g, P, 1, 0x9a6a3a);
      // the board it glides on: a plank with grain and an upturned nose
      K.blob('root', [0, 0.02, -0.02], [0.32, 0.028, 0.6], { col: 0xb88448, n: 3.2, colAt: (t) => (Math.floor((t + 1) * 5) % 2 ? 0xb88448 : 0xa47038) });
      K.horn('root', [[0, 0.03, 0.5], [0, 0.07, 0.62], [0, 0.14, 0.68]], 0.12, { col: 0xb88448, ry: 0.025, pow: 0.4 });
      return { legLen: g.leg };
    },
  },
  'haily.3': {
    height: 1.55, move: 'stomp', attack: 'shoot',
    build(K) {
      const P = { ...P0, wood: 0xb07a3e, wood2: 0x8a5a2e, brass: 0xd8a848, iron: 0x5a5a62, glow: 0xffd060 };
      // the mech: a wooden barrel torso banded in brass on two iron legs, two arms (a claw and a hammer), a smokestack
      K.bone('body', 'root', [0, 0.78, 0]); K.bone('chest', 'body', [0, 0.82, 0.08]); K.bone('hip', 'body', [0, 0.72, -0.08]);
      K.bone('neck', 'chest', [0, 1.06, 0.06]); const hd = [0, 1.2, 0.1]; K.bone('head', 'neck', hd);
      K.blob('body', [0, 0.8, 0], [0.42, 0.34, 0.38], { col: P.wood, n: 2.6, rot: [-Math.PI / 2, 0, 0], colAt: (t) => (Math.floor((t + 1) * 4) % 2 ? P.wood : P.wood2) });
      for (const y of [0.62, 0.98]) K.torus('body', [0, y, 0], 0.4, 0.03, { col: P.brass });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; K.blob('body', [Math.cos(a) * 0.42, 0.8, Math.sin(a) * 0.38], [0.025, 0.025, 0.025], { col: P.brass, steps: 3, seg: 6 }); }
      K.blob('chest', [0, 0.84, 0.36], [0.16, 0.1, 0.04], { col: 0x2a3a4a, n: 3, steps: 3 });
      K.blob('chest', [0, 0.84, 0.385], [0.11, 0.06, 0.02], { col: P.glow, buf: 'glow', n: 3, steps: 3 });
      // the beaver in the cockpit: head and shoulders out of the top, goggles up on its hard hat
      K.blob('chest', [0, 1.02, 0.04], [0.26, 0.12, 0.22], { col: P.body });
      K.blob('head', hd, [0.27, 0.24, 0.25], { col: P.body, n: 2.4 });
      K.blob('head', [0, hd[1] - 0.08, hd[2] + 0.18], [0.16, 0.12, 0.12], { col: P.snout, n: 2.2 });
      K.blob('head', [0, hd[1] - 0.02, hd[2] + 0.29], [0.05, 0.035, 0.03], { col: P.nose });
      K.eyes('head', [0.12, hd[1] + 0.04, hd[2] + 0.18], 0.075, { yaw: 0.42 });
      for (const s of [-1, 1]) { K.blob('head', [s * 0.035, hd[1] - 0.17, hd[2] + 0.24], [0.03, 0.05, 0.02], { col: P.tooth, n: 3, steps: 4 }); K.blob('head', [s * 0.21, hd[1] + 0.16, hd[2] - 0.04], [0.06, 0.06, 0.03], { col: P.body, steps: 4 }); }
      hardHat(K, hd, 0.27, 0xe0a848);
      for (const s of [-1, 1]) K.torus('head', [s * 0.1, hd[1] + 0.22, hd[2] + 0.16], 0.06, 0.018, { col: P.brass, rot: [Math.PI / 2 - 0.6, 0, 0] });
      K.mouth = [0, hd[1] - 0.1, hd[2] + 0.3];
      for (const s of [-1, 1]) {
        const nm = s < 0 ? 'FR' : 'FL'; const x = s * 0.24;
        K.bone(`leg.${nm}.0`, 'hip', [x, 0.52, 0]); K.bone(`leg.${nm}.1`, `leg.${nm}.0`, [x * 1.15, 0.3, 0.06]);
        K.tube([{ p: [x, 0.56, 0], rx: 0.11, bone: `leg.${nm}.0` }, { p: [x * 1.15, 0.3, 0.06], rx: 0.085, bone: `leg.${nm}.1` }, { p: [x * 1.15, 0.1, 0.02], rx: 0.08, bone: `leg.${nm}.1` }], { col: P.iron });
        K.blob(`leg.${nm}.0`, [x, 0.56, 0], [0.12, 0.12, 0.12], { col: P.brass, steps: 4 });
        K.blob(`leg.${nm}.1`, [x * 1.15, 0.3, 0.06], [0.09, 0.09, 0.09], { col: P.brass, steps: 4 });
        K.blob(`leg.${nm}.1`, [x * 1.15, 0.06, 0.08], [0.15, 0.07, 0.22], { col: P.wood2, n: 3.2, steps: 4 });
        K.roles.legs.push({ up: `leg.${nm}.0`, low: `leg.${nm}.1`, front: true, side: s });
        // arms off the shoulders
        const sh = [s * 0.44, 0.9, 0.04]; const el = [s * 0.56, 0.68, 0.16]; const wr = [s * 0.54, 0.5, 0.34];
        const arm = K.chain(s < 0 ? 'armR' : 'armL', 'chest', [sh, el], 'ear', 2.5);
        K.blob('chest', sh, [0.11, 0.11, 0.11], { col: P.brass, steps: 4 });
        K.tube([{ p: sh, rx: 0.07, bone: arm[0] }, { p: el, rx: 0.06, bone: arm[1] }, { p: wr, rx: 0.055, bone: arm[1] }], { col: P.iron });
        if (s > 0) { for (const t of [-1, 1]) K.horn(arm[1], [wr, [wr[0] + t * 0.06, wr[1] - 0.04, wr[2] + 0.1], [wr[0] + t * 0.02, wr[1] - 0.06, wr[2] + 0.18]], 0.035, { col: P.brass }); }
        else { K.horn(arm[1], [wr, [wr[0], wr[1] - 0.05, wr[2] + 0.06], [wr[0], wr[1] - 0.1, wr[2] + 0.1]], 0.03, { col: P.wood2, pow: 0 }); K.blob(arm[1], [wr[0], wr[1] - 0.12, wr[2] + 0.12], [0.16, 0.08, 0.08], { col: P.wood, n: 3, steps: 4 }); }
      }
      const top = [0.2, 1.08, -0.26];
      K.tube([{ p: [0.2, 0.9, -0.26], rx: 0.07, bone: 'body' }, { p: top, rx: 0.06, bone: 'body' }, { p: [0.2, 1.2, -0.28], rx: 0.075, bone: 'body' }], { col: P.iron, cap: 'flat' });
      K.blob('body', [0.2, 1.205, -0.28], [0.055, 0.015, 0.055], { col: 0xff8a30, buf: 'glow', steps: 3 });
      // its paddle tail sticks out of the back of the barrel
      K.blob('hip', [0, 0.52, -0.5], [0.15, 0.035, 0.2], { col: P.paddle, n: 2.4, rot: [0.4, 0, 0] });
      return { legLen: 0.5 };
    },
  },
};
