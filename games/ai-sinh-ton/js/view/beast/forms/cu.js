// Cú Bóng (ranged, assassin, wind): a round fluffy owlet, then a night owl with long violet-edged wings and ear tufts,
// then an eclipse owl with a crescent moon behind it and a tail of stars (SCOPE 3.1 #6).
import { palette } from '../families.js?v=20261124b';
import { shade } from '../kit.js?v=20261124b';

const P0 = palette(0x9a86b8, { belly: 0xeee4f4, disc: 0xf6f0fa, beak: 0xf0b030, iris: 0xffc830, dark: 0x3a2a4a, foot: 0xf0a030 });

// the owl body plan: an upright egg body with the chest towards the front, a big round head with a facial disc, folded
// wings that open sideways, two short legs. o: { pal, bw, bh, hr, by }
function owl(K, o) {
  const P = o.pal; const bw = o.bw ?? 0.36; const bh = o.bh ?? 0.37; const hr = o.hr ?? 0.36; const by = o.by ?? 0.42;
  K.bone('body', 'root', [0, by, 0]); K.bone('chest', 'body', [0, by + 0.04, 0.06]); K.bone('hip', 'body', [0, by - 0.06, -0.06]);
  const hy = by + bh * 0.9; K.bone('neck', 'chest', [0, hy - 0.14, 0.04]); const hd = [0, hy, 0.04]; K.bone('head', 'neck', hd);
  K.blob('body', [0, by, 0], [bw, bw * 0.95, bh], { col: P.body, belly: P.belly, n: 2.1, rot: [-Math.PI / 2, 0, 0] });
  K.blob('head', hd, [hr * 1.03, hr * 0.84, hr * 0.9], { col: P.body, n: 2.4 });
  for (const s of [-1, 1]) K.blob('head', [s * hr * 0.4, hd[1] + hr * 0.02, hd[2] + hr * 0.66], [hr * 0.42, hr * 0.46, hr * 0.2], { col: P.disc, rot: [0, s * 0.35, 0] });
  K.eyes('head', [hr * 0.4, hd[1] + hr * 0.05, hd[2] + hr * 0.78], hr * 0.3, { iris: P.iris, yaw: 0.3 });
  K.horn('head', [[0, hd[1] - hr * 0.1, hd[2] + hr * 0.86], [0, hd[1] - hr * 0.22, hd[2] + hr * 1.0], [0, hd[1] - hr * 0.36, hd[2] + hr * 0.98]], hr * 0.12, { col: P.beak, ry: hr * 0.09 });
  K.mouth = [0, hd[1] - hr * 0.2, hd[2] + hr * 1.0];
  for (const s of [-1, 1]) {
    const nm = s < 0 ? 'wingR' : 'wingL'; const o0 = [s * bw * 0.95, by + bh * 0.35, 0.0]; K.bone(nm, 'chest', o0);
    K.fin(nm, o0, [0, 0, -1], [0, -1, 0], o.wing || [[-0.12, 0], [0.12, -0.02], [0.3, 0.2], [0.26, 0.42], [0.04, 0.36]], 0.05, shade(P.body, 0.85), { edge: o.wingEdge ?? shade(P.body, 0.7) });
    K.roles.wings.push({ bone: nm, side: s, rest: 0.05, open: 1.25 });
    const lg = s < 0 ? 'leg.FR' : 'leg.FL'; const lx = s * bw * 0.36;
    K.bone(lg + '.0', 'hip', [lx, by - bh * 0.72, 0.04]); K.bone(lg + '.1', lg + '.0', [lx, 0.07, 0.05]);
    K.tube([{ p: [lx, by - bh * 0.7, 0.04], rx: 0.06, bone: lg + '.0' }, { p: [lx, 0.07, 0.05], rx: 0.04, bone: lg + '.1' }], { col: P.foot });
    for (const a of [-0.45, 0, 0.45]) K.horn(lg + '.1', [[lx, 0.05, 0.06], [lx + Math.sin(a) * 0.06, 0.03, 0.06 + Math.cos(a) * 0.08], [lx + Math.sin(a) * 0.1, 0.01, 0.06 + Math.cos(a) * 0.12]], 0.024, { col: P.foot, tip: P.dark });
    K.roles.legs.push({ up: lg + '.0', low: lg + '.1', front: true, side: s });
  }
  return { by, bw, bh, hr, hd, legLen: by - bh * 0.7 };
}

export default {
  'cu.1': {
    height: 0.9, move: 'hop', attack: 'shoot',
    build(K) {
      const P = P0;
      const g = owl(K, { pal: P });
      // fluff: soft tufts round the lower body and a little crest
      K.spikes('body', [0, g.by, 0], [g.bw, g.bw * 0.95, g.bh], 16, 0.09, { keep: (n) => n.y < 0.15 && n.z > -0.7, sweep: [0, -0.8, 0], col: P.belly, r: 0.05, vary: 0.5 });
      K.spikes('head', g.hd, [g.hr * 1.03, g.hr * 0.84, g.hr * 0.9], 5, 0.12, { keep: (n) => n.y > 0.8, sweep: [0, 0.4, -0.6], col: P.body, r: 0.04 });
      // chest chevrons
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) K.blob('body', [s * 0.08 * (i % 2 ? 1.6 : 1), g.by - 0.04 - i * 0.09, g.bw * 0.94 - i * 0.03], [0.04, 0.022, 0.02], { col: shade(P.body, 0.75), rot: [0, 0, s * 0.5], steps: 3, seg: 6 });
      K.fin('hip', [0, g.by - 0.05, -g.bw * 0.85], [0, 0, -1], [0, -1, 0.3], [[-0.02, -0.1], [0.16, -0.06], [0.2, 0.06], [0.16, 0.12], [0, 0.1]], 0.04, shade(P.body, 0.75));
      return { legLen: g.legLen };
    },
  },
  'cu.2': {
    height: 1.2, move: 'glide', attack: 'shoot', airH: 0.9,
    build(K) {
      const P = { ...P0, body: 0x4e3e86, belly: 0xa898d8, disc: 0xd4c8f4, dark: 0x1e1638, edge: 0xc46aff, iris: 0xffa820 };
      // a taller, slimmer owl: long wings with violet edges reaching past the tail, ear tufts, a long tail fan
      const wing = [[-0.16, -0.02], [0.14, -0.04], [0.42, 0.1], [0.62, 0.3], [0.5, 0.42], [0.22, 0.4], [0.0, 0.32]];
      const g = owl(K, { pal: P, bw: 0.3, bh: 0.44, hr: 0.33, by: 0.5, wing, wingEdge: P.edge });
      const [, hy, hz] = g.hd;
      for (const s of [-1, 1]) {
        const ch = K.chain(s < 0 ? 'tuftR' : 'tuftL', 'head', [[s * g.hr * 0.6, hy + g.hr * 0.6, hz - 0.02]], 'ear', 0.9);
        K.horn(ch[0], [[s * g.hr * 0.55, hy + g.hr * 0.55, hz], [s * g.hr * 0.85, hy + g.hr * 1.05, hz - 0.04], [s * g.hr * 1.05, hy + g.hr * 1.45, hz - 0.1]], 0.07, { col: P.body, tip: P.edge, ry: 0.035, pow: 0.8 });
        K.blob('head', [s * g.hr * 0.42, hy + g.hr * 0.36, hz + g.hr * 0.66], [g.hr * 0.3, 0.025, 0.04], { col: P.dark, rot: [0, 0, s * -0.4], steps: 3 });
      }
      for (let i = -2; i <= 2; i++) K.horn('hip', [[i * 0.03, g.by - 0.08, -g.bw * 0.7], [i * 0.07, g.by - 0.2, -g.bw * 1.2], [i * 0.1, g.by - 0.3, -g.bw * 1.6]], 0.05, { col: P.body, tip: P.edge, ry: 0.015 });
      K.spikes('body', [0, g.by, 0], [g.bw, g.bw * 0.95, g.bh], 8, 0.07, { keep: (n) => n.y < -0.2 && n.z > 0, sweep: [0, -0.9, 0], col: P.belly, r: 0.04 });
      return { legLen: g.legLen };
    },
  },
  'cu.3': {
    height: 1.5, move: 'fly', attack: 'shoot', airH: 1.2,
    build(K) {
      const P = { ...P0, body: 0x1e2454, belly: 0x3a4280, disc: 0x5a64a8, dark: 0x0e1028, beak: 0xf0c040, iris: 0xfff0a0, gold: 0xf4c850, star: 0xfff4c0 };
      const wing = [[-0.16, -0.02], [0.12, -0.08], [0.46, 0.04], [0.74, 0.24], [0.6, 0.36], [0.62, 0.48], [0.4, 0.46], [0.36, 0.58], [0.14, 0.5], [0.0, 0.36]];
      const g = owl(K, { pal: P, bw: 0.3, bh: 0.4, hr: 0.34, by: 0.52, wing, wingEdge: P.gold });
      const [, hy, hz] = g.hd;
      // a gold circlet with a moon jewel, gold rims round the facial disc
      K.torus('head', [0, hy + g.hr * 0.5, hz - 0.02], g.hr * 0.78, 0.025, { col: P.gold, rot: [0.25, 0, 0] });
      K.crystal('head', [0, hy + g.hr * 0.72, hz + g.hr * 0.6], [0, 1, 0.5], 0.14, 0.04, 0xbfe8ff, { sides: 4 });
      // the eclipse: a crescent moon ring behind the head on an orbit-free bone, a dark disc biting it
      K.bone('moon', 'chest', [0, hy + 0.05, hz - g.hr * 1.2]);
      const mc = [0, hy + 0.05, hz - g.hr * 1.25];
      K.torus('moon', mc, 0.52, 0.06, { col: 0xfff0b0, buf: 'glow', rot: [Math.PI / 2, 0, 0], arc: 0.62, colAt: (t) => (t < 0.1 || t > 0.52 ? 0xffd860 : 0xfff6c8) });
      K.torus('moon', mc, 0.62, 0.015, { col: 0x8ab8ff, buf: 'glow', rot: [Math.PI / 2, 0, 0.4], arc: 0.35 });
      // a tail of stars: two ribbon chains trailing behind, star crystals along them
      for (const s of [-1, 1]) {
        const pts = [[s * 0.06, g.by - 0.12, -g.bw * 0.8], [s * 0.14, g.by - 0.2, -g.bw * 1.5], [s * 0.2, g.by - 0.32, -g.bw * 2.2], [s * 0.22, g.by - 0.38, -g.bw * 2.9]];
        const ch = K.chain(s < 0 ? 'starR' : 'starL', 'hip', pts.slice(0, 3), 'scarf', 0.7);
        K.tube(pts.map((p, i) => ({ p, rx: 0.06 - i * 0.012, ry: 0.015, bone: ch[Math.min(i, 2)] })), { col: P.body, up: [0, 1, 0] });
        pts.slice(1).forEach((p, i) => K.crystal(ch[Math.min(i + 1, 2)], [p[0], p[1] + 0.03, p[2]], [0, 1, 0], 0.09 - i * 0.015, 0.035, P.star, { sides: 4, waist: 0.5 }));
      }
      K.spikes('body', [0, g.by, 0], [g.bw, g.bw * 0.95, g.bh], 7, 0.04, { keep: (n) => n.z > 0.3 && n.y < 0.3, col: P.star, r: 0.014, buf: 'glow' });
      return { legLen: g.legLen };
    },
  },
};
