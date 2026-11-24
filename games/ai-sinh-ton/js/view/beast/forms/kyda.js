// Kỳ Đà Lửa (melee, brawler, fire): a red monitor-lizard hatchling with a forked tongue, then a ridge of flame fins
// and a burning tail, then either a lava dragon of glowing-seamed basalt or a winged fire lizard (SCOPE 3.1 #8).
import { quad, palette } from '../families.js?v=20261124a';
import { shade } from '../kit.js?v=20261124a';

const P0 = palette(0xd8502a, { belly: 0xf4c890, snout: 0xe87a4a, dark: 0x4a1a10, tongue: 0xff5a8a, scale: 0xa83a1a, ear: 0xd8502a });

// the lizard body plan: a low body raised at the shoulders, a flat wedge head with big side eyes, legs splayed out
// sideways with clawed feet, a long tapering tail. o: { len, rx, hr, tail, tailR, legK }
function lizard(K, P, o = {}) {
  const L = o.len ?? 1; const rx = o.rx ?? 0.24; const hr = o.hr ?? 1; const y = 0.24; const yc = 0.3;
  K.bone('body', 'root', [0, y, 0]); K.bone('chest', 'body', [0, yc, 0.24 * L]); K.bone('hip', 'body', [0, y - 0.02, -0.22 * L]);
  K.bone('neck', 'chest', [0, yc + 0.08, 0.42 * L]); const hd = [0, yc + 0.16, 0.58 * L]; K.bone('head', 'neck', hd);
  K.tube([
    { p: [0, y - 0.03, -0.4 * L], rx: rx * 0.7, ry: 0.12, bone: 'hip' }, { p: [0, y - 0.01, -0.2 * L], rx: rx * 0.98, ry: 0.16, bone: 'hip' },
    { p: [0, y + 0.02, 0.04 * L], rx, ry: 0.17, bone: 'body' }, { p: [0, yc + 0.01, 0.27 * L], rx: rx * 0.95, ry: 0.17, bone: 'chest' },
    { p: [0, yc + 0.08, 0.44 * L], rx: rx * 0.66, ry: 0.13, bone: 'neck' },
  ], { col: P.body, belly: P.belly, n: 2.4 });
  K.blob('head', hd, [0.2 * hr, 0.15 * hr, 0.22 * hr], { col: P.body, belly: P.belly, n: 2.5 });
  K.blob('head', [0, hd[1] - 0.04 * hr, hd[2] + 0.17 * hr], [0.14 * hr, 0.09 * hr, 0.14 * hr], { col: P.snout, belly: P.belly, n: 2.4 });
  for (const s of [-1, 1]) K.blob('head', [s * 0.04 * hr, hd[1] + 0.03 * hr, hd[2] + 0.29 * hr], [0.012, 0.01, 0.01], { col: P.dark, steps: 3, seg: 6 });
  K.eyes('head', [0.12 * hr, hd[1] + 0.08 * hr, hd[2] + 0.08 * hr], 0.095 * hr, { yaw: 0.75, iris: o.iris ?? 0xffc020 });
  for (const s of [-1, 1]) K.blob('head', [s * 0.12 * hr, hd[1] + 0.12 * hr, hd[2] + 0.04 * hr], [0.06 * hr, 0.025, 0.07 * hr], { col: shade(P.body, 0.8), rot: [0, 0, s * 0.3], steps: 4 });
  K.torus('head', [0, hd[1] - 0.07 * hr, hd[2] + 0.04 * hr], 0.15 * hr, 0.01, { arc: 0.5, col: P.dark });
  K.mouth = [0, hd[1] - 0.06 * hr, hd[2] + 0.3 * hr];
  const lk = o.legK ?? 1;
  for (const [nm, s, f] of [['FL', 1, 1], ['FR', -1, 1], ['BL', 1, -1], ['BR', -1, -1]]) {
    const z = f > 0 ? 0.26 * L : -0.2 * L; const yy = f > 0 ? yc - 0.04 : y - 0.04; const par = f > 0 ? 'chest' : 'hip';
    const a = [s * rx * 0.75, yy, z]; const b = [s * (rx + 0.13 * lk), yy - 0.02, z + 0.03 * f]; const c = [s * (rx + 0.17 * lk), 0.035, z + 0.08 * f];
    K.bone(`leg.${nm}.0`, par, a); K.bone(`leg.${nm}.1`, `leg.${nm}.0`, b);
    K.tube([{ p: a, rx: 0.075 * lk, bone: `leg.${nm}.0` }, { p: b, rx: 0.055 * lk, bone: `leg.${nm}.1` }, { p: c, rx: 0.045 * lk, bone: `leg.${nm}.1` }], { col: P.body, n: 2.2 });
    for (const t of [-0.6, 0, 0.6]) K.horn(`leg.${nm}.1`, [[c[0], 0.03, c[2]], [c[0] + s * Math.sin(t) * 0.05 + s * 0.02, 0.02, c[2] + Math.cos(t) * 0.06], [c[0] + s * Math.sin(t) * 0.08 + s * 0.03, 0.01, c[2] + Math.cos(t) * 0.1]], 0.02, { col: P.body, tip: P.dark });
    K.roles.legs.push({ up: `leg.${nm}.0`, low: `leg.${nm}.1`, front: f > 0, side: s });
  }
  const tl = o.tail ?? 0.85; const tr = o.tailR ?? 0.12; const tp = [];
  for (let i = 0; i < 5; i++) { const k = i / 5; tp.push([0, y - 0.03 - k * (y - 0.08), -0.4 * L - k * tl]); }
  const tail = K.chain('tail', 'hip', tp, 'tail', 1.2); const end = [0, 0.06, -0.4 * L - tl];
  K.tube([...tp.map((p, i) => ({ p, rx: tr * (1 - i * 0.17), ry: tr * 0.85 * (1 - i * 0.17), bone: tail[i], col: o.tailCol })), { p: end, rx: 0.015, bone: tail[4], col: o.tailTip ?? o.tailCol }], { col: P.body, belly: P.belly });
  tail.end = end; tail.pts = tp;
  return { y, yc, hd, hr, L, rx, tail, legLen: 0.2 };
}
function tongue(K, len = 0.16) {
  const [x, y, z] = K.mouth;
  K.horn('head', [[x, y - 0.02, z - 0.04], [x, y - 0.03, z + len * 0.5], [x, y - 0.02, z + len * 0.7]], 0.018, { col: 0xff5a8a });
  for (const s of [-1, 1]) K.horn('head', [[x, y - 0.02, z + len * 0.68], [x + s * 0.02, y - 0.015, z + len * 0.85], [x + s * 0.04, y - 0.01, z + len]], 0.012, { col: 0xff5a8a });
}

// bumps along the spine from the neck to the tail root, on the bones they sit over
function ridge(K, g, n, r, col, o = {}) {
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1); const z = 0.42 * g.L - k * 0.84 * g.L; const y = (z > 0.15 ? g.yc + 0.2 : g.y + 0.17) - (z > 0.4 ? -0.02 : 0);
    const bone = z > 0.3 ? 'neck' : z > 0.1 ? 'chest' : z > -0.15 ? 'body' : 'hip';
    if (o.fin) o.fin(bone, [0, y, z], i); else K.blob(bone, [0, y, z], [r, r * 0.9, r * 1.4], { col, steps: 3, seg: 6 });
  }
}

export default {
  'kyda.1': {
    height: 0.85, move: 'slither', attack: 'bite',
    build(K) {
      const P = P0;
      const g = lizard(K, P);
      tongue(K);
      // a row of scale bumps down the spine and a band pattern of dark scales across the back
      ridge(K, g, 7, 0.035, P.belly);
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const z = 0.28 - i * 0.24; K.blob(i < 1 ? 'chest' : i < 2 ? 'body' : 'hip', [s * g.rx * 0.5, g.y + (i < 1 ? 0.2 : 0.15), z], [0.06, 0.02, 0.05], { col: P.scale, rot: [0, 0, s * 0.5], steps: 3, seg: 6 }); }
      return { legLen: g.leg };
    },
  },
  'kyda.2': {
    height: 1.0, move: 'slither', attack: 'bite',
    build(K) {
      const P = { ...P0, body: 0xc83a1e, belly: 0xf8d090, snout: 0xe0603a, scale: 0x8a2210, flame: 0xffb030, flame2: 0xff5a10 };
      const g = lizard(K, P, { len: 1.12, rx: 0.26, hr: 1.08, tail: 0.95, tailR: 0.13 });
      tongue(K, 0.2);
      // a sail of flame fins down the back: each a curved glowing blade, tallest over the shoulders
      ridge(K, g, 7, 0, 0, { fin: (bone, p, i) => {
        const h = [0.16, 0.26, 0.3, 0.26, 0.22, 0.18, 0.14][i];
        K.fin(bone, [p[0], p[1] - 0.02, p[2]], [0, 0, -1], [0, 1, 0], [[-0.06, 0], [0.08, 0], [0.12, h * 0.6], [0.04, h], [0.0, h * 0.5]], 0.025, i % 2 ? P.flame : P.flame2, { buf: 'glow', edge: 0xfff0a0 });
      } });
      // the tail burns: flame tongues round the last two tail bones
      const tp = g.tail.pts; const e = g.tail.end;
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const b = g.tail[4]; const c = [e[0] + Math.cos(a) * 0.04, e[1] + 0.02 + Math.sin(a) * 0.04, e[2] + 0.06]; K.horn(b, [c, [c[0] + Math.cos(a) * 0.05, c[1] + 0.1, c[2] - 0.04], [c[0] + Math.cos(a) * 0.03, c[1] + 0.22 + (i % 2) * 0.06, c[2] - 0.1]], 0.04, { col: i % 2 ? P.flame : P.flame2, buf: 'glow', pow: 0.7 }); }
      K.blob(g.tail[3], [tp[3][0], tp[3][1] + 0.06, tp[3][2]], [0.05, 0.08, 0.06], { col: P.flame, buf: 'glow', steps: 4 });
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) K.blob(i < 1 ? 'chest' : i < 2 ? 'body' : 'hip', [s * g.rx * 0.6, g.y + (i < 1 ? 0.18 : 0.13), 0.3 - i * 0.26], [0.07, 0.02, 0.06], { col: P.scale, rot: [0, 0, s * 0.5], steps: 3, seg: 6 });
      return { legLen: g.legLen };
    },
  },
  'kyda.3a': {
    height: 1.3, move: 'burrow', ground: 'slither', attack: 'bite',
    build(K) {
      const P = { ...P0, body: 0x3e3434, belly: 0x6a5048, snout: 0x4a3c3a, dark: 0x140c0c, lava: 0xff6a1a, lava2: 0xffb040, horn: 0x8a7a70 };
      const g = lizard(K, P, { len: 1.15, rx: 0.32, hr: 1.25, tail: 0.8, tailR: 0.16, legK: 1.4, iris: 0xff7a1a });
      // basalt plates over the back with glowing seams between them
      for (let i = 0; i < 5; i++) for (const s of [-1, 0, 1]) {
        const z = 0.36 - i * 0.2; const bone = z > 0.2 ? 'chest' : z > -0.1 ? 'body' : 'hip'; const y = (z > 0.15 ? g.yc : g.y) + 0.14 - Math.abs(s) * 0.05;
        K.blob(bone, [s * 0.15, y, z], [0.12, 0.07, 0.1], { col: s ? shade(P.body, 1.15) : P.body, n: 3.2, rot: [0.1, 0, s * 0.5], steps: 4 });
      }
      for (let i = 0; i < 5; i++) { const z = 0.36 - i * 0.2; const bone = z > 0.2 ? 'chest' : z > -0.1 ? 'body' : 'hip'; K.torus(bone, [0, (z > 0.15 ? g.yc : g.y) + 0.02, z - 0.1], g.rx * 1.02, 0.014, { col: P.lava, buf: 'glow', rot: [Math.PI / 2, 0, 0], arc: 0.5, n: 2 }); }
      // stone horns swept back from the brow, a lava glow in the jaw
      const [, hy, hz] = g.hd; const hr = g.hr;
      for (const s of [-1, 1]) {
        K.horn('head', [[s * 0.1 * hr, hy + 0.1 * hr, hz - 0.02], [s * 0.16 * hr, hy + 0.22 * hr, hz - 0.14 * hr], [s * 0.2 * hr, hy + 0.3 * hr, hz - 0.3 * hr]], 0.05, { col: P.horn, pow: 0.8 });
        K.horn('head', [[s * 0.17 * hr, hy, hz - 0.06 * hr], [s * 0.26 * hr, hy + 0.04, hz - 0.14 * hr], [s * 0.32 * hr, hy + 0.08, hz - 0.22 * hr]], 0.03, { col: P.horn });
      }
      K.torus('head', [0, hy - 0.07 * hr, hz + 0.04 * hr], 0.15 * hr, 0.016, { arc: 0.5, col: P.lava, buf: 'glow' });
      for (let i = 1; i < 5; i++) { const p = g.tail.pts[i]; K.blob(g.tail[i], [p[0], p[1] + 0.1 - i * 0.012, p[2]], [0.07 - i * 0.008, 0.05, 0.06], { col: shade(P.body, 1.15), n: 3, steps: 4 }); K.torus(g.tail[i], [p[0], p[1], p[2] + 0.08], 0.15 - i * 0.022, 0.012, { col: P.lava, buf: 'glow', rot: [Math.PI / 2, 0, 0], arc: 0.5 }); }
      return { legLen: g.legLen };
    },
  },
  'kyda.3b': {
    height: 1.3, move: 'fly', attack: 'bite', airH: 1.2,
    build(K) {
      const P = { ...P0, body: 0xe0582a, belly: 0xffe0a0, snout: 0xf07a4a, scale: 0xa83010, flame: 0xffc040, flame2: 0xff6a18, mem: 0xff8a30 };
      const g = lizard(K, P, { len: 0.95, rx: 0.23, hr: 1.05, tail: 0.9, tailR: 0.1 });
      tongue(K, 0.18);
      // membrane wings of fire on the shoulders: a finger bone frame, glowing membrane, flame tips
      for (const s of [-1, 1]) {
        const nm = s < 0 ? 'wingR' : 'wingL'; const o0 = [s * g.rx * 0.7, g.yc + 0.14, 0.22]; K.bone(nm, 'chest', o0);
        const u = [s * 0.94, 0.34, 0]; const v = [0, 0, 1];
        K.fin(nm, o0, u, v, [[0, -0.36], [0.3, -0.5], [0.62, -0.52], [0.86, -0.26], [0.9, 0.1], [0.4, 0.1], [0, 0.08]], 0.03, P.mem, { buf: 'glow', edge: P.flame2 });
        for (const [a, l] of [[-0.45, 0.95], [-0.2, 0.92], [0.05, 0.92]]) { const t = [o0[0] + u[0] * l * Math.cos(a), o0[1] + u[1] * l * Math.cos(a), o0[2] + Math.sin(a) * l * 0.6]; K.horn(nm, [o0, [(o0[0] + t[0]) / 2, (o0[1] + t[1]) / 2 + 0.03, (o0[2] + t[2]) / 2], t], 0.025, { col: P.scale }); }
        K.roles.wings.push({ bone: nm, side: s, rest: 0, open: -0.1 });
      }
      // the tail ends in a broom of flame
      const e = g.tail.end; const b = g.tail[4];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; K.horn(b, [[e[0], e[1] + 0.02, e[2] + 0.06], [e[0] + Math.cos(a) * 0.08, e[1] + 0.04 + Math.sin(a) * 0.08, e[2] - 0.1], [e[0] + Math.cos(a) * 0.12, e[1] + 0.06 + Math.sin(a) * 0.12, e[2] - 0.28]], 0.045, { col: i % 2 ? P.flame : P.flame2, buf: 'glow', pow: 0.8 }); }
      ridge(K, g, 6, 0.035, P.flame);
      return { legLen: g.legLen };
    },
  },
};
