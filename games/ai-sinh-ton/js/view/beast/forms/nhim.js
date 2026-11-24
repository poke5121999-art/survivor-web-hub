// Nhím Gai (ranged, ice): a round hedgehog pup, then fire-tipped quills with a quill pouch, then a floating body inside
// a spinning ring of steel needles (SCOPE 3.1 #2).
import { quad, palette } from '../families.js?v=20261124a';

const P0 = palette(0x8a6248, { belly: 0xf4dcb8, snout: 0xf0d2aa, dark: 0x3a2418, quill: 0xe8d2a8, ear: 0xe8a890 });
// quills over the back half of the body ellipsoid, swept backwards
function quills(K, g, count, len, col, tip, opts = {}) {
  const c = [0, g.hipY + 0.04, -0.02]; const r = [g.rx * 1.02, g.ry * 1.05, g.L * 0.55];
  K.spikes('body', c, r, count, len, { keep: (n) => n.y > -0.35 && n.z < 0.55, sweep: [0, 0.35, -1.1], col, tip, r: opts.r ?? len * 0.2, vary: 0.35 });
  // the head's crown
  const [hx, hy, hz] = g.head;
  K.spikes('head', [hx, hy + 0.02, hz - 0.04], [g.hr * 0.95, g.hr * 0.9, g.hr * 0.85], Math.round(count / 4), len * 0.75, { keep: (n) => n.y > 0.35 && n.z < 0.1, sweep: [0, 0.3, -1.4], col, tip, r: opts.r ?? len * 0.2 });
}

export default {
  'nhim.1': {
    height: 1.0, move: 'hop', attack: 'shoot',
    build(K) {
      const P = P0;
      const g = quad(K, { pal: P, len: 0.5, rx: 0.38, ry: 0.33, n: 2.1, leg: 0.12, legR: 0.07, hr: 0.32, neck: -0.08, headUp: -0.02, snout: [0.5, 0.38, 0.75], ears: 'round', earK: 0.55, chestK: 1 });
      quills(K, g, K.hi ? 46 : 30, 0.15, P.quill, 0x9a7a58);
      return { legLen: g.leg };
    },
  },
  'nhim.2': {
    height: 1.1, move: 'walk', attack: 'shoot',
    build(K) {
      const P = { ...P0, body: 0x7a4a3a };
      const g = quad(K, { pal: P, len: 0.6, rx: 0.4, ry: 0.35, n: 2.1, leg: 0.17, legR: 0.08, hr: 0.33, neck: -0.06, snout: [0.5, 0.38, 0.75], ears: 'round', earK: 0.55 });
      quills(K, g, K.hi ? 52 : 34, 0.3, 0xf4e0c0, 0xff4a5a, { r: 0.045 });
      // the quill pouch slung on the back, a bundle of long red quills sticking out of it
      const y = g.top + 0.12;
      K.blob('body', [0.12, y, -0.12], [0.16, 0.19, 0.14], { col: 0xa8642c, n: 2.6, rot: [0.5, 0, -0.3] });
      K.blob('body', [0.13, y + 0.16, -0.1], [0.13, 0.04, 0.11], { col: 0x6a3a1a, rot: [0.5, 0, -0.3], steps: 4 });
      K.torus('body', [0, g.hipY + 0.05, 0.05], g.rx * 1.02, 0.025, { rot: [0, 0, 0.6], col: 0x5a3a1a, arc: 0.5 });
      for (let i = 0; i < 5; i++) { const a = -0.5 + i * 0.25; K.horn('body', [[0.12 + a * 0.15, y + 0.1, -0.12], [0.14 + a * 0.3, y + 0.32, -0.22], [0.16 + a * 0.4, y + 0.46, -0.28]], 0.035, { col: 0xf4e0c0, tip: 0xff3048 }); }
      return { legLen: g.leg };
    },
  },
  'nhim.3': {
    height: 1.4, move: 'glide', attack: 'shoot', hover: 0.35, airH: 0.5,
    build(K) {
      const P = { ...P0, body: 0x5a6a8a, belly: 0xdce8f4, snout: 0xe8eef8, dark: 0x202838 };
      const g = quad(K, { pal: P, len: 0.55, rx: 0.38, ry: 0.34, n: 2.1, leg: 0.12, legR: 0.07, hr: 0.33, neck: -0.06, snout: [0.5, 0.38, 0.75], ears: 'round', earK: 0.5, iris: 0x3aa8ff });
      quills(K, g, K.hi ? 50 : 32, 0.24, 0xc8d8f0, 0x7ae0ff, { r: 0.04 });
      // the halo: two rings of needles on orbit bones, a steel band and glowing tips
      const c = [0, g.hipY + 0.05, -0.02];
      const ring = (name, R, n, tilt, speed, col) => {
        K.bone(name, 'body', c); K.roles.orbits.push({ bone: name, speed, axis: 'y' });
        K.torus(name, c, R, 0.025, { col: 0x9aa8c0, rot: [tilt, 0, 0] });
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2; const ca = Math.cos(a); const sa = Math.sin(a);
          const p = (r) => [c[0] + ca * r, c[1], c[2] + sa * r];
          K.horn(name, [p(R - 0.02), p(R + 0.12), p(R + 0.24)], 0.03, { col: 0xd8e4f4, pow: 0.8 });
          K.crystal(name, p(R + 0.22), [ca, 0, sa], 0.09, 0.025, col, { sides: 4 });
        }
      };
      ring('halo0', 0.62, 10, 0, 1.6, 0x7ae0ff);
      K.bone('halo1', 'body', c); K.roles.orbits.push({ bone: 'halo1', speed: -2.4, axis: 'y' });
      K.torus('halo1', c, 0.48, 0.02, { col: 0x7ae0ff, buf: 'glow', rot: [0.35, 0, 0.2] });
      // a glowing core under the belly that holds it up
      K.blob('body', [0, g.hipY - g.ry * 0.9, 0], [0.12, 0.05, 0.12], { col: 0x9af0ff, buf: 'glow' });
      return { legLen: g.leg };
    },
  },
};
