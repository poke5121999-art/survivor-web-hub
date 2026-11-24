// Chồn Gió (melee, wind): a long weasel kit with a brush tail, then twin sickle tails and a wind scarf, then three
// blade tails, a whirlwind mane and paws that never touch the ground (SCOPE 3.1 #4).
import { quad, palette } from '../families.js?v=20261124b';

const P0 = palette(0xd8964e, { belly: 0xfff4e4, snout: 0xfff0dc, dark: 0x3a2214, wind: 0x6ad8ff });

// a tail on its own spring chain from the rump, fanned by `yaw`; returns bone names and the end point
function tail(K, g, name, yaw, len, r, up, col, tipCol) {
  const z0 = -g.L * 0.5; const y0 = g.hipY + g.ry * 0.25; const pts = []; const segs = 4;
  for (let i = 0; i <= segs; i++) { const k = i / segs; const d = k * len; pts.push([Math.sin(yaw) * d, y0 + Math.sin(k * 1.6) * len * up, z0 - Math.cos(yaw) * d * (1 - up * 0.3)]); }
  const bones = K.chain(name, 'hip', pts.slice(0, segs), 'tail', 0.8);
  K.tube(pts.map((p, i) => ({ p, rx: r * (0.7 + Math.sin(Math.min(1, i / segs) * Math.PI) * 0.6) * (i === segs ? 0.4 : 1), bone: bones[Math.min(i, segs - 1)], col: i >= segs - 1 && tipCol ? tipCol : col })), { n: 2 });
  return { bones, end: pts[segs], dir: [pts[segs][0] - pts[segs - 1][0], pts[segs][1] - pts[segs - 1][1], pts[segs][2] - pts[segs - 1][2]] };
}
// a sickle blade at a tail tip: a thick crescent in the tail's vertical plane, bright edge
function sickle(K, t, size, col) {
  const b = t.bones[t.bones.length - 1]; const [x, y, z] = t.end; const d = Math.hypot(t.dir[0], t.dir[2]) || 1;
  const u = [t.dir[0] / d, 0, t.dir[2] / d];
  const pts = []; for (let i = 0; i <= 8; i++) { const a = -0.2 + (i / 8) * 2.6; pts.push([Math.cos(a) * size, Math.sin(a) * size * 1.1]); }
  for (let i = 8; i >= 0; i--) { const a = 0.1 + (i / 8) * 2.1; pts.push([Math.cos(a) * size * 0.62 + size * 0.22, Math.sin(a) * size * 0.75]); }
  K.fin(b, [x - u[0] * size * 0.2, y, z - u[2] * size * 0.2], u, [0, 1, 0], pts, 0.035, col, { edge: 0xffffff });
}
function scarf(K, g, col) {
  K.torus('chest', [0, g.hipY + g.ry * 0.55, g.L * 0.45], g.rx * 0.78, 0.05, { col, rot: [0.5, 0, 0] });
  const s = [g.rx * 0.4, g.hipY + g.ry * 1.05, g.L * 0.38];
  const pts = [s, [s[0] + 0.1, s[1] + 0.06, s[2] - 0.22], [s[0] + 0.16, s[1] + 0.1, s[2] - 0.46], [s[0] + 0.2, s[1] + 0.12, s[2] - 0.7]];
  const bones = K.chain('scarf', 'chest', pts.slice(0, 3), 'scarf', 0.6);
  K.tube(pts.map((p, i) => ({ p, rx: 0.1 - i * 0.012, ry: 0.02, bone: bones[Math.min(i, 2)] })), { col, up: [0, 1, 0] });
}

export default {
  'chon.1': {
    height: 1.0, move: 'gallop', attack: 'bite', stride: 1.2,
    build(K) {
      const P = P0;
      const g = quad(K, { pal: P, len: 0.95, rx: 0.21, ry: 0.21, leg: 0.2, legR: 0.06, hr: 0.3, neck: 0.02, headUp: 0.02, snout: [0.55, 0.36, 0.7], ears: 'round', earK: 0.85, eyeK: 0.27, chestK: 1.02 });
      tail(K, g, 'tail', 0, 0.55, 0.11, 0.55, P.body, P.belly);
      return { legLen: g.leg };
    },
  },
  'chon.2': {
    height: 1.05, move: 'gallop', attack: 'bite', stride: 1.35,
    build(K) {
      const P = { ...P0, body: 0xc8823e };
      const g = quad(K, { pal: P, len: 1.05, rx: 0.22, ry: 0.22, leg: 0.24, legR: 0.062, hr: 0.3, neck: 0.04, headUp: 0.02, snout: [0.55, 0.36, 0.72], ears: 'pointy', earK: 0.95, eyeK: 0.26, iris: 0x2a8ac8 });
      for (const s of [-1, 1]) { const t = tail(K, g, s < 0 ? 'tailR' : 'tailL', s * 0.4, 0.5, 0.08, 0.6, P.body, P.belly); sickle(K, t, 0.3, 0xcfeeff); }
      scarf(K, g, P.wind);
      return { legLen: g.leg };
    },
  },
  'chon.3': {
    height: 1.35, move: 'blink', ground: 'gallop', attack: 'bite', hover: 0.18, stride: 1.4,
    build(K) {
      const P = { ...P0, body: 0xdfe6f0, belly: 0xffffff, snout: 0xffffff, dark: 0x2a4a68 };
      const g = quad(K, { pal: P, len: 1.1, rx: 0.22, ry: 0.22, leg: 0.24, legR: 0.06, hr: 0.31, neck: 0.05, headUp: 0.03, snout: [0.55, 0.36, 0.72], ears: 'long', earK: 0.8, eyeK: 0.26, iris: 0x18b8ff, earTip: P.wind, hoof: P.wind });
      for (const [k, yaw] of [[0, -0.55], [1, 0], [2, 0.55]]) { const t = tail(K, g, 'tail' + k, yaw, 0.6, 0.08, 0.75 - Math.abs(yaw) * 0.4, P.body, P.wind); sickle(K, t, 0.3, 0xc8f4ff); }
      // wind marks: three swept stripes down the back
      for (let i = 0; i < 3; i++) K.blob('body', [0, g.top - 0.005, -0.3 + i * 0.25], [0.15, 0.02, 0.05], { col: P.wind, rot: [0.15, 0, 0], steps: 4 });
      // whirlwind mane: three glowing bands spiralling round the neck on an orbit bone
      const c = [0, g.hipY + g.ry * 0.6, g.L * 0.42];
      K.bone('mane', 'chest', c); K.roles.orbits.push({ bone: 'mane', speed: 5, axis: 'z' });
      for (let i = 0; i < 3; i++) K.torus('mane', c, 0.27 + i * 0.05, 0.018, { col: i === 1 ? 0xbff4ff : P.wind, buf: 'glow', rot: [Math.PI / 2 + 0.2, (i - 1) * 0.5, 0], arc: 0.75 });
      // wind rings round each paw
      for (const [nm, s, f] of [['FL', 1, 1], ['FR', -1, 1], ['BL', 1, -1], ['BR', -1, -1]]) K.torus(`leg.${nm}.1`, [s * g.rx * 0.62, 0.04, f * g.cz], 0.1, 0.016, { col: P.wind, buf: 'glow' });
      return { legLen: g.leg };
    },
  },
};
