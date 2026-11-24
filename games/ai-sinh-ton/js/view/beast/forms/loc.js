// Lộc Đèn (healer, wood): a spotted fawn with one little lantern, then branching antlers hung with lantern fruit, then a
// see-through spirit deer whose antlers are a festival lantern tree, or a dark-coated night stag with crimson lamps
// (SCOPE 3.1 #3).
import { quad, palette } from '../families.js?v=20261124b';

const P0 = palette(0xc8905a, { belly: 0xfaecd6, snout: 0xf2dcc0, dark: 0x4a2e1c, antler: 0xe8d4a8 });

// one antler: a beam from the crown with tines; returns the tine tips (model space) for lanterns
function antler(K, g, s, o) {
  const [, hy, hz] = g.head; const nm = s < 0 ? 'antR' : 'antL';
  const b = [s * g.hr * 0.42, hy + g.hr * 0.72, hz - g.hr * 0.12];
  if (!K.by[nm]) K.bone(nm, 'head', b);
  const L = o.len; const out = o.out ?? 0.55;
  const beam = [b, [b[0] + s * L * out * 0.4, b[1] + L * 0.45, b[2] - L * 0.08], [b[0] + s * L * out * 0.8, b[1] + L * 0.8, b[2] - L * 0.2], [b[0] + s * L * out, b[1] + L, b[2] - L * 0.1]];
  K.horn(nm, beam, o.r, { col: o.col, pow: 0.6 });
  const tips = [beam[3]];
  for (const [i, f, up, fw] of o.tines || []) {
    const p = beam[i]; const t = [p[0] + s * L * f * 0.3, p[1] + L * up, p[2] + L * fw];
    K.horn(nm, [p, [(p[0] + t[0]) / 2, (p[1] + t[1]) / 2 + L * 0.05, (p[2] + t[2]) / 2], t], o.r * 0.7, { col: o.col, pow: 0.7 });
    tips.push(t);
  }
  if (o.thorns) K.spikes(nm, beam[2], [L * 0.12, L * 0.3, L * 0.12], o.thorns, L * 0.12, { col: o.col, r: 0.012 });
  return { nm, tips };
}
function spots(K, g, col, n) {
  for (let i = 0; i < n; i++) {
    const z = -g.L * 0.38 + (i / (n - 1)) * g.L * 0.7; const s = i % 2 ? 1 : -1; const x = s * g.rx * (0.35 + 0.15 * ((i * 0.37) % 1));
    const y = g.hipY + g.ry * Math.sqrt(Math.max(0, 1 - (x / g.rx) ** 2)) * 0.98;
    K.blob('body', [x, y, z], [0.045, 0.012, 0.04], { col, steps: 3, seg: 8, rot: [0, 0, -x * 1.6] });
  }
}
function hoofGlow(K, g, col) {
  for (const [nm, s, f] of [['FL', 1, 1], ['FR', -1, 1], ['BL', 1, -1], ['BR', -1, -1]]) K.torus(`leg.${nm}.1`, [s * g.rx * 0.62, 0.07, f * g.cz], g.legR * 1.25, 0.022, { col, buf: 'glow' });
}

export default {
  'loc.1': {
    height: 1.1, move: 'walk', attack: 'shoot',
    build(K) {
      const P = P0;
      const g = quad(K, { pal: P, len: 0.62, rx: 0.25, ry: 0.24, leg: 0.34, legR: 0.06, hr: 0.33, neck: 0.12, headUp: 0.05, snout: [0.48, 0.36, 0.55], ears: 'pointy', earK: 1.05, eyeK: 0.29, iris: 0x5a3010, tail: { len: 0.12, r: 0.06, up: 0.8, segs: 2, taper: 0.6, col: 0xfff4e4 } });
      let tip = null;
      for (const s of [-1, 1]) tip = antler(K, g, s, { len: 0.17, r: 0.045, col: P.antler, out: 0.35 }).tips[0];
      K.dangle('lamp0', 'antL', tip, 0.07, 0.075, 0xffd060);
      spots(K, g, 0xfff8ec, 7);
      return { legLen: g.leg };
    },
  },
  'loc.2': {
    height: 1.25, move: 'gallop', attack: 'shoot',
    build(K) {
      const P = { ...P0, body: 0xb87a48 };
      const g = quad(K, { pal: P, len: 0.75, rx: 0.27, ry: 0.26, leg: 0.4, legR: 0.065, hr: 0.33, neck: 0.16, headUp: 0.06, snout: [0.5, 0.36, 0.6], ears: 'pointy', earK: 1.0, eyeK: 0.28, iris: 0x5a3010, hoof: 0x6a4020, tail: { len: 0.14, r: 0.06, up: 0.8, segs: 2, taper: 0.6, col: 0xfff4e4 } });
      let n = 0;
      for (const s of [-1, 1]) {
        const a = antler(K, g, s, { len: 0.4, r: 0.04, col: P.antler, tines: [[1, 0.9, 0.18, 0.12], [2, -0.6, 0.25, -0.05]] });
        for (const t of [a.tips[1], a.tips[2]]) K.dangle('lamp' + n++, a.nm, t, 0.07, 0.065, n % 2 ? 0xffc040 : 0xffe080);
      }
      spots(K, g, 0xfff4e4, 9); hoofGlow(K, g, 0xffd870);
      return { legLen: g.leg };
    },
  },
  'loc.3a': {
    height: 1.5, move: 'swimAir', attack: 'shoot', airH: 0.55, ghostOpacity: 0.55,
    build(K) {
      const P = palette(0xbfe6ff, { belly: 0xf4fbff, snout: 0xf0f8ff, dark: 0x5a8ab0 });
      K.defBuf = 'ghost';
      const g = quad(K, { pal: P, len: 0.78, rx: 0.27, ry: 0.26, leg: 0.4, legR: 0.06, hr: 0.34, neck: 0.18, headUp: 0.06, snout: [0.5, 0.36, 0.6], ears: 'pointy', earK: 1.1, eyeK: 0.28, iris: 0x2a7ad8, hoof: 0xa8e0ff, tail: { len: 0.4, r: 0.07, up: 0.5, segs: 4, taper: 0.2, col: 0xe8f6ff } });
      K.defBuf = null;
      // a warm heart light inside the see-through chest
      K.blob('chest', [0, g.hipY + 0.02, g.cz * 0.6], [0.11, 0.11, 0.11], { col: 0xffd890, buf: 'glow' });
      let n = 0;
      for (const s of [-1, 1]) {
        const a = antler(K, g, s, { len: 0.6, r: 0.045, col: 0xf0c870, out: 0.7, tines: [[1, 1.1, 0.3, 0.15], [2, -0.4, 0.38, -0.1], [2, 1.2, 0.2, 0.05]] });
        for (const t of a.tips) K.dangle('lamp' + n++, a.nm, t, 0.08, 0.07, [0xff8a40, 0xffd060, 0xff5a70, 0x9af0ff][n % 4]);
      }
      // a ring of light under the hooves
      K.bone('aura', 'root', [0, 0.02, 0]); K.roles.orbits.push({ bone: 'aura', speed: 0.8 });
      K.torus('aura', [0, 0.03, 0], 0.62, 0.025, { col: 0xa8f0ff, buf: 'glow', n: 2 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; K.crystal('aura', [Math.cos(a) * 0.62, 0.03, Math.sin(a) * 0.62], [0, 1, 0], 0.12, 0.035, 0xffe8a0, { sides: 4 }); }
      hoofGlow(K, g, 0xbff4ff);
      return { legLen: g.leg };
    },
  },
  'loc.3b': {
    height: 1.5, move: 'blink', ground: 'gallop', attack: 'shoot',
    build(K) {
      const P = palette(0x3e3450, { belly: 0x6a5a78, snout: 0x5a4a68, dark: 0x16101e });
      const g = quad(K, { pal: P, len: 0.8, rx: 0.3, ry: 0.28, leg: 0.4, legR: 0.07, hr: 0.33, neck: 0.16, headUp: 0.05, snout: [0.5, 0.36, 0.62], ears: 'pointy', earK: 1.0, eyeK: 0.27, iris: 0xff2840, hoof: 0x16101e, tail: { len: 0.22, r: 0.07, up: 0.6, segs: 3, taper: 0.4 } });
      // a thick ruff of fur round the neck and shoulders
      K.spikes('chest', [0, g.hipY + 0.1, g.cz + 0.05], [g.rx * 1.05, g.ry * 1.1, 0.24], K.hi ? 30 : 20, 0.14, { keep: (nn) => nn.z > -0.3, sweep: [0, -0.3, -0.8], col: 0x2a2236, tip: 0x7a6a90, r: 0.05 });
      let n = 0;
      for (const s of [-1, 1]) {
        const a = antler(K, g, s, { len: 0.55, r: 0.045, col: 0x1e1828, out: 0.75, tines: [[1, 1.2, 0.25, 0.2], [2, -0.5, 0.32, -0.15]], thorns: K.hi ? 8 : 5 });
        for (const t of [a.tips[0], a.tips[1]]) K.dangle('lamp' + n++, a.nm, t, 0.08, 0.065, 0xe02848, { cap: 0x1e1828 });
      }
      hoofGlow(K, g, 0xff3a5a);
      return { legLen: g.leg };
    },
  },
};
