// Nhện Tơ Ngọc (ranged, trapper, wood): a spiderling with eight short legs and a jade abdomen, then long legs with jade
// joints and a patterned back, then a balloon spider hanging under a silk canopy with a glowing abdomen (SCOPE 3.1 #13).
import { palette } from '../families.js?v=20261124a';
import { shade } from '../kit.js?v=20261124a';

const P0 = palette(0xb8743a, { belly: 0xe8c08a, dark: 0x3a2214, jade: 0x3ad0a0, jade2: 0x1e9a78, fang: 0xf0d8a0 });

// the spider body plan: a cephalothorax with a chibi face, a round abdomen behind, eight legs whose knees arch above
// the body. o: { pal, y, ab: [rx, ry, rz], reach, knee, legR, legCol, joint }
function spider(K, o) {
  const P = o.pal; const y = o.y ?? 0.32; const ab = o.ab ?? [0.3, 0.27, 0.32]; const reach = o.reach ?? 0.36; const knee = o.knee ?? 0.42;
  K.bone('body', 'root', [0, y, 0]); K.bone('chest', 'body', [0, y + 0.02, 0.12]); K.bone('hip', 'body', [0, y + 0.06, -0.16]);
  K.bone('neck', 'chest', [0, y + 0.04, 0.24]); const hd = [0, y + 0.07, 0.3]; K.bone('head', 'neck', hd);
  K.blob('chest', [0, y + 0.02, 0.1], [0.2, 0.15, 0.2], { col: P.body, belly: P.belly });
  K.blob('head', hd, [0.21, 0.18, 0.15], { col: P.body, belly: P.belly, n: 2.3 });
  K.eyes('head', [0.09, hd[1] + 0.04, hd[2] + 0.1], 0.065, { yaw: 0.35, iris: o.iris ?? 0x3ad0a0 });
  for (const [x, yy] of [[0.04, 0.13], [-0.04, 0.13], [0.11, 0.11], [-0.11, 0.11]]) K.blob('head', [x, hd[1] + yy, hd[2] + 0.07], [0.022, 0.022, 0.02], { col: 0x1a1420, steps: 3, seg: 6 });
  for (const s of [-1, 1]) K.horn('head', [[s * 0.05, hd[1] - 0.09, hd[2] + 0.1], [s * 0.055, hd[1] - 0.15, hd[2] + 0.13], [s * 0.03, hd[1] - 0.2, hd[2] + 0.12]], 0.03, { col: P.fang, tip: P.dark });
  K.mouth = [0, hd[1] - 0.08, hd[2] + 0.16];
  const ac = [0, y + ab[1] * 0.55, -0.16 - ab[2] * 0.85];
  // legs radiate from the thorax, two forward, two back, at these angles from straight ahead
  const legs = [['FL', 1, 0.6], ['FR', -1, 0.6], ['BL', 1, 2.55], ['BR', -1, 2.55], ['L2', 1, 1.25], ['R2', -1, 1.25], ['L3', 1, 1.9], ['R3', -1, 1.9]];
  for (const [nm, s, th] of legs) {
    const d = [s * Math.sin(th), 0, Math.cos(th)]; const cz = 0.1;
    const a = [d[0] * 0.13, y + 0.02, cz + d[2] * 0.13]; const b = [d[0] * (0.13 + reach * 0.5), y + knee * 0.55, cz + d[2] * (0.13 + reach * 0.5)]; const c = [d[0] * (0.13 + reach), 0.02, cz + d[2] * (0.13 + reach)];
    K.bone(`leg.${nm}.0`, 'chest', a); K.bone(`leg.${nm}.1`, `leg.${nm}.0`, b);
    K.horn([`leg.${nm}.0`, `leg.${nm}.1`, `leg.${nm}.1`], [a, b, c], o.legR ?? 0.05, { col: o.legCol ?? P.body, tip: P.dark, pow: 0.35 });
    if (o.joint) K.blob(`leg.${nm}.1`, b, [0.05, 0.05, 0.05], { col: o.joint, steps: 4, buf: o.jointBuf });
    K.roles.legs.push({ up: `leg.${nm}.0`, low: `leg.${nm}.1`, front: th < 1.5, side: s });
  }
  return { y, ab, ac, hd, legLen: 0.3 };
}

export default {
  'nhen.1': {
    height: 0.85, move: 'walk', attack: 'shoot',
    build(K) {
      const P = P0;
      const g = spider(K, { pal: P });
      // the jade abdomen: banded green with a pale shine
      K.blob('hip', g.ac, g.ab, { col: P.jade, colAt: (t) => (Math.floor((t + 1) * 3) % 2 ? P.jade : P.jade2) });
      K.blob('hip', [0.08, g.ac[1] + g.ab[1] * 0.6, g.ac[2] + 0.04], [0.06, 0.04, 0.08], { col: 0xc8fff0, buf: 'glow', steps: 4 });
      K.horn('hip', [[0, g.ac[1] - 0.05, g.ac[2] - g.ab[2] * 0.9], [0, g.ac[1] - 0.09, g.ac[2] - g.ab[2] * 1.05], [0, g.ac[1] - 0.12, g.ac[2] - g.ab[2] * 1.1]], 0.04, { col: P.dark });
      return { legLen: g.legLen };
    },
  },
  'nhen.2': {
    height: 1.15, move: 'leap', ground: 'walk', attack: 'shoot',
    build(K) {
      const P = { ...P0, body: 0x2e7a5a, belly: 0x9ad8b8, dark: 0x103a2a, jade: 0x48e0b0, jade2: 0x1a8a6a, gold: 0xf0c860 };
      // long legs with glowing jade knuckles, a bigger abdomen carrying a gold lattice pattern
      const g = spider(K, { pal: P, y: 0.4, ab: [0.32, 0.28, 0.36], reach: 0.62, knee: 0.78, legR: 0.045, joint: P.jade, jointBuf: 'glow', iris: 0xf0c860 });
      K.blob('hip', g.ac, g.ab, { col: P.jade2 });
      const lat = (a0) => { const pts = []; for (let i = 0; i <= 6; i++) { const t = -0.9 + i * 0.3; const a = a0 + t * 0.9; pts.push([g.ac[0] + Math.sin(a) * g.ab[0] * Math.cos(t * 1.2) * 1.01, g.ac[1] + Math.cos(t * 1.2) * g.ab[1] * 1.01, g.ac[2] + Math.sin(t * 1.2) * g.ab[2] * 1.0]); } return pts; };
      for (const a0 of [-0.5, 0, 0.5]) K.tube(lat(a0).map((p) => ({ p, rx: 0.018, bone: 'hip' })), { col: P.gold, seg: 5, sub: 2 });
      for (const [x, z] of [[0, 0.15], [0.16, -0.05], [-0.16, -0.05], [0, -0.28]]) K.crystal('hip', [g.ac[0] + x, g.ac[1] + g.ab[1] * 0.92, g.ac[2] + z], [x, 1, z], 0.1, 0.04, P.jade, { sides: 4 });
      K.horn('hip', [[0, g.ac[1] - 0.05, g.ac[2] - g.ab[2] * 0.9], [0, g.ac[1] - 0.1, g.ac[2] - g.ab[2] * 1.05], [0, g.ac[1] - 0.14, g.ac[2] - g.ab[2] * 1.1]], 0.045, { col: P.gold });
      return { legLen: g.legLen };
    },
  },
  'nhen.3': {
    height: 1.55, move: 'glide', attack: 'shoot', airH: 0.5,
    build(K) {
      const P = { ...P0, body: 0x7a5aa8, belly: 0xd8c8f0, dark: 0x2a1a48, glow: 0x9affd8, silk: 0xf4f0ff };
      // the spider hangs under a silk balloon: a see-through canopy with glowing seams, threads down to its back, its
      // legs dangling, its abdomen a lantern
      const g = spider(K, { pal: P, y: 0.34, reach: 0.34, knee: 0.3, legR: 0.04, ab: [0.26, 0.24, 0.28] });
      K.blob('hip', g.ac, g.ab, { col: P.glow, buf: 'glow' });
      K.blob('hip', [g.ac[0], g.ac[1] + g.ab[1] * 0.5, g.ac[2] + 0.05], [g.ab[0] * 0.9, g.ab[1] * 0.6, g.ab[2] * 0.85], { col: P.body, n: 2 });
      const top = [0, 1.32, -0.1];
      K.bone('canopy', 'body', [0, 1.0, -0.1]); K.roles.fins.push({ bone: 'canopy', axis: 'z', f: 1.3, amp: 0.06, side: 1 });
      K.blob('canopy', [0, 1.18, -0.1], [0.55, 0.3, 0.55], { col: P.silk, buf: 'ghost', steps: K.hi ? 12 : 8 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2; const rim = [Math.cos(a) * 0.53, 1.06, -0.1 + Math.sin(a) * 0.53];
        const arc = []; for (let k = 0; k <= 4; k++) { const t = k / 4; const r = Math.sin(t * Math.PI * 0.5 + Math.PI * 0.5) * 0.555; arc.push([Math.cos(a) * r, 1.18 + Math.sin(t * Math.PI * 0.5) * 0.305, -0.1 + Math.sin(a) * r]); }
        K.tube(arc.map((p) => ({ p, rx: 0.012, bone: 'canopy' })), { col: P.glow, buf: 'glow', seg: 4, sub: 2 });
        K.horn(['canopy', 'canopy', 'hip'], [rim, [rim[0] * 0.5, 0.82, -0.1 + (rim[2] + 0.1) * 0.5], [Math.cos(a) * 0.06, g.ac[1] + g.ab[1] * 0.9, g.ac[2] + Math.sin(a) * 0.06]], 0.008, { col: P.silk, pow: 0, seg: 4 });
      }
      K.blob('canopy', top, [0.08, 0.05, 0.08], { col: P.glow, buf: 'glow', steps: 4 });
      return { legLen: g.legLen };
    },
  },
};
