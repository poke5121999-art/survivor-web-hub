// Ếch Pháo (ranged, fire): a frog pup with a puffed throat sac, then a cannon throat and a chimney back, then either
// a volcano toad or a jet frog with goggles (SCOPE 3.1 #5).
import { palette } from '../families.js?v=20261122a';
import { shade } from '../kit.js?v=20261122a';

const THREE = window.THREE;
const P0 = palette(0x6cc04a, { belly: 0xf4eaa0, dark: 0x2a4a1a, sac: 0xf8d890, spot: 0x3e8a2e, foot: 0x8ad860 });

// flat bumps on an ellipsoid surface, golden-spiral spread, kept where keep(normal) is true
function spots(K, bone, c, r, n, size, col, keep = () => true, o = {}) {
  let made = 0;
  for (let i = 0; i < n * 4 && made < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / (n * 4); const rad = Math.sqrt(1 - y * y); const th = i * 2.39996;
    const nm = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad); if (!keep(nm)) continue;
    const d = new THREE.Vector3(nm.x / r[0], nm.y / r[1], nm.z / r[2]).normalize();
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d));
    const k = 0.75 + 0.5 * ((i * 0.618) % 1);
    K.blob(bone, [c[0] + nm.x * r[0], c[1] + nm.y * r[1], c[2] + nm.z * r[2]], [size * k, size * k * 0.8, size * 0.32], { col, rot: [e.x, e.y, e.z], steps: 4, seg: 8, buf: o.buf });
    made++;
  }
}

// a glowing zigzag seam over an ellipsoid surface (lava cracks): pts are directions from the centre
function seam(K, bone, c, r, dirs, w, col) {
  const pts = dirs.map((d) => { const v = new THREE.Vector3(...d).normalize(); const k = 1.01 / Math.hypot(v.x / r[0], v.y / r[1], v.z / r[2]); return { p: [c[0] + v.x * k, c[1] + v.y * k, c[2] + v.z * k], rx: w, bone }; });
  K.tube(pts, { col, buf: 'glow', seg: 5, sub: 2 });
}
// a cone standing on the back with a glowing crater (volcanoes, chimneys); returns the top point
function cone(K, bone, base, h, r0, r1, col, rim, glow) {
  const top = [base[0], base[1] + h, base[2]];
  K.tube([{ p: [base[0], base[1] - 0.04, base[2]], rx: r0, bone }, { p: [base[0], base[1] + h * 0.55, base[2]], rx: (r0 + r1) / 2 * 0.9, bone }, { p: top, rx: r1, bone }], { col, cap: 'flat' });
  K.torus(bone, top, r1 * 0.92, r1 * 0.22, { col: rim });
  if (glow) K.blob(bone, [top[0], top[1] - 0.005, top[2]], [r1 * 0.8, 0.02, r1 * 0.8], { col: glow, buf: 'glow', steps: 3 });
  return top;
}

// the frog body plan: a pear body sitting tail-down, a wide flat head with eye bumps on top, short front legs and
// folded hind legs. o: { pal, bw, bh, bl, hr, sac, lift, hind }
function frog(K, o) {
  const P = o.pal; const bw = o.bw ?? 0.36; const bh = o.bh ?? 0.26; const bl = o.bl ?? 0.32; const hr = o.hr ?? 0.36; const y = 0.3 + (o.lift ?? 0);
  K.bone('body', 'root', [0, y, 0]); K.bone('chest', 'body', [0, y + 0.04, 0.14]); K.bone('hip', 'body', [0, y - 0.02, -0.16]);
  K.bone('neck', 'chest', [0, y + 0.1, 0.24]);
  const hd = [0, y + 0.12 + hr * 0.1, 0.3]; K.bone('head', 'neck', hd);
  K.blob('body', [0, y, -0.06], [bw, bh, bl], { col: P.body, belly: P.belly, rot: [-0.35, 0, 0] });
  K.blob('head', hd, [hr * 1.05, hr * 0.62, hr * 0.84], { col: P.body, belly: P.belly, n: 2.2 });
  for (const s of [-1, 1]) K.blob('head', [s * hr * 0.55, hd[1] + hr * 0.46, hd[2] + hr * 0.12], [hr * 0.32, hr * 0.3, hr * 0.3], { col: P.body });
  K.eyes('head', [hr * 0.55, hd[1] + hr * 0.56, hd[2] + hr * 0.3], hr * 0.27, { yaw: 0.65, iris: o.iris });
  K.torus('head', [0, hd[1] - hr * 0.12, hd[2]], hr * 0.86, 0.014, { arc: 0.5, col: P.dark });
  for (const s of [-1, 1]) K.blob('head', [s * hr * 0.7, hd[1] + hr * 0.02, hd[2] + hr * 0.5], [hr * 0.14, hr * 0.08, hr * 0.06], { col: 0xff8a8a, steps: 4, seg: 8 });
  const sac = o.sac ?? 1;
  if (sac) K.blob('head', [0, hd[1] - hr * 0.5, hd[2] + hr * 0.3], [hr * sac * 0.62, hr * sac * 0.46, hr * sac * 0.52], { col: P.sac });
  K.mouth = [0, hd[1] - hr * 0.1, hd[2] + hr * 0.9];
  const hk = o.hind ?? 1;
  for (const [nm, s] of [['FL', 1], ['FR', -1]]) {
    const a = [s * bw * 0.55, y - 0.02, 0.16]; const b = [s * bw * 0.72, 0.13, 0.22];
    K.bone(`leg.${nm}.0`, 'chest', a); K.bone(`leg.${nm}.1`, `leg.${nm}.0`, b);
    K.tube([{ p: a, rx: 0.065, bone: `leg.${nm}.0` }, { p: b, rx: 0.05, bone: `leg.${nm}.1` }, { p: [s * bw * 0.74, 0.03, 0.26], rx: 0.05, bone: `leg.${nm}.1` }], { col: P.body });
    K.blob(`leg.${nm}.1`, [s * bw * 0.76, 0.02, 0.3], [0.07, 0.022, 0.07], { col: P.foot, steps: 4 });
    K.roles.legs.push({ up: `leg.${nm}.0`, low: `leg.${nm}.1`, front: true, side: s });
  }
  // hind legs folded under (sitting) or, with o.stretch, kicked straight back (flying)
  for (const [nm, s] of [['BL', 1], ['BR', -1]]) {
    const a = [s * bw * 0.7, y - 0.04, -0.18]; const b = o.stretch ? [s * bw * 0.85, y - 0.08, -0.42] : [s * bw * 1.08, 0.16 * hk, -0.0];
    K.bone(`leg.${nm}.0`, 'hip', a); K.bone(`leg.${nm}.1`, `leg.${nm}.0`, b);
    const ft = o.stretch ? [s * bw * 0.8, y - 0.1, -0.68] : [s * bw * 0.98, 0.05, -0.26];
    K.tube([{ p: a, rx: 0.12 * hk, bone: `leg.${nm}.0` }, { p: b, rx: 0.085 * hk, bone: `leg.${nm}.1` }, { p: ft, rx: 0.055, bone: `leg.${nm}.1` }], { col: P.body, belly: P.belly });
    if (o.stretch) K.fin(`leg.${nm}.1`, ft, [s, 0, 0], [0, 0, -1], [[-0.08, -0.02], [0.08, -0.02], [0.1, 0.12], [0, 0.16], [-0.1, 0.12]], 0.02, P.foot);
    else K.blob(`leg.${nm}.1`, [s * bw * 0.98, 0.025, -0.16], [0.085, 0.025, 0.13], { col: P.foot, steps: 4 });
    K.roles.legs.push({ up: `leg.${nm}.0`, low: `leg.${nm}.1`, front: false, side: s });
  }
  return { y, hd, hr, bw, bh, bl, legLen: 0.2 };
}

export default {
  'ech.1': {
    height: 0.9, move: 'hop', attack: 'shoot',
    build(K) {
      const P = P0;
      const g = frog(K, { pal: P, sac: 1.15 });
      spots(K, 'body', [0, g.y, -0.06], [g.bw, g.bh, g.bl], 7, 0.07, P.spot, (n) => n.y > 0.1);
      spots(K, 'head', g.hd, [g.hr * 1.05, g.hr * 0.62, g.hr * 0.84], 3, 0.05, P.spot, (n) => n.y > 0.55 && Math.abs(n.x) < 0.3);
      return { legLen: g.legLen };
    },
  },
  'ech.2': {
    height: 1.15, move: 'leap', ground: 'hop', attack: 'shoot',
    build(K) {
      const P = { ...P0, body: 0x5a9a3a, belly: 0xe8dc98, spot: 0x3a6a2a, foot: 0x7ab850, brass: 0xd8a040, iron: 0x4a4a52 };
      const g = frog(K, { pal: P, sac: 0, bw: 0.38, bl: 0.36, hind: 1.25 });
      const [, hy, hz] = g.hd; const hr = g.hr;
      // the throat sac is a cannon now: a brass-banded barrel under the jaw with a dark bore
      const by = hy - hr * 0.5; const z0 = hz - hr * 0.1; const z1 = hz + hr * 1.45;
      K.tube([{ p: [0, by, z0], rx: 0.15, bone: 'head' }, { p: [0, by, (z0 + z1) / 2], rx: 0.11, bone: 'head' }, { p: [0, by, z1], rx: 0.12, bone: 'head' }], { col: P.iron, cap: 'flat' });
      for (const z of [z0 + 0.12, z1 - 0.02]) K.torus('head', [0, by, z], 0.125, 0.025, { col: P.brass, rot: [Math.PI / 2, 0, 0] });
      K.blob('head', [0, by, z1 + 0.005], [0.075, 0.075, 0.015], { col: 0x120a08, steps: 3 });
      K.mouth = [0, by, z1 + 0.04];
      // a smokestack on the back with a soot rim and an ember inside
      cone(K, 'body', [0, g.y + g.bh * 0.85, -0.14], 0.36, 0.09, 0.075, P.iron, P.brass, 0xff8a30);
      K.torus('body', [0, g.y + 0.02, -0.06], g.bw * 0.98, 0.03, { col: P.brass, rot: [0.35, 0, 0] });
      spots(K, 'body', [0, g.y, -0.06], [g.bw, g.bh, g.bl], 5, 0.07, P.spot, (n) => n.y > 0.1 && n.y < 0.8);
      for (const s of [-1, 1]) K.blob('body', [s * g.bw * 0.95, g.y + 0.05, 0.02], [0.03, 0.03, 0.03], { col: P.brass, steps: 3, seg: 6 });
      return { legLen: g.legLen };
    },
  },
  'ech.3a': {
    height: 1.35, move: 'leap', ground: 'hop', attack: 'shoot',
    build(K) {
      const P = { ...P0, body: 0x4a3a3c, belly: 0x8a6a5a, dark: 0x1a1010, foot: 0x5a4442, sac: 0xc86a3a, lava: 0xff7a20, rock: 0x6a5450 };
      const g = frog(K, { pal: P, sac: 0.9, bw: 0.44, bh: 0.28, bl: 0.36, hr: 0.38, hind: 1.3, iris: 0xff9a20 });
      const c = [0, g.y, -0.06]; const r = [g.bw, g.bh, g.bl];
      // warts of cooled rock and glowing cracks between them
      spots(K, 'body', c, r, 9, 0.065, P.rock, (n) => n.y > -0.1);
      seam(K, 'body', c, r, [[0.9, 0.2, 0.6], [0.7, 0.45, 0.2], [0.85, 0.3, -0.3], [0.6, 0.6, -0.7]], 0.018, P.lava);
      seam(K, 'body', c, r, [[-0.9, 0.2, 0.6], [-0.7, 0.45, 0.2], [-0.85, 0.3, -0.3], [-0.6, 0.6, -0.7]], 0.018, P.lava);
      seam(K, 'head', g.hd, [g.hr * 1.05, g.hr * 0.62, g.hr * 0.84], [[0.2, 1, 0.7], [0, 0.9, 0.2], [-0.25, 1, -0.3]], 0.014, P.lava);
      // two volcano cones on the back, craters glowing, lava running down their flanks
      for (const s of [-1, 1]) {
        const b = [s * 0.17, g.y + g.bh * 0.75, -0.12 - (s > 0 ? 0.04 : -0.02)]; const h = s > 0 ? 0.34 : 0.26;
        const top = cone(K, 'body', b, h, 0.14, 0.07, P.rock, shade(P.rock, 0.7), P.lava);
        K.horn('body', [[top[0] + s * 0.05, top[1] - 0.01, top[2] + 0.04], [top[0] + s * 0.09, top[1] - h * 0.45, top[2] + 0.07], [top[0] + s * 0.13, top[1] - h * 0.85, top[2] + 0.06]], 0.024, { col: P.lava, buf: 'glow', pow: 0.4 });
        for (let i = 0; i < 2; i++) K.blob('body', [top[0] + s * 0.02 * i, top[1] + 0.08 + i * 0.1, top[2] - 0.03 * i], [0.06 + i * 0.02, 0.05 + i * 0.015, 0.06 + i * 0.02], { col: i ? 0x8a8086 : 0x6a6066, steps: 4 });
      }
      return { legLen: g.legLen };
    },
  },
  'ech.3b': {
    height: 1.2, move: 'fly', attack: 'shoot', airH: 1.1,
    build(K) {
      const P = { ...P0, body: 0x3ab89a, belly: 0xe8f4c8, foot: 0x58d0b0, metal: 0xc8ccd8, metal2: 0x7a8090, flame: 0x8ae8ff, strap: 0x8a4a2a, lens: 0xff9a30 };
      const g = frog(K, { pal: P, sac: 0.7, bw: 0.32, bh: 0.24, bl: 0.4, hr: 0.35, hind: 1.1, iris: 0x2a6aa0, stretch: true });
      const [, hy, hz] = g.hd; const hr = g.hr;
      // flight goggles over the eye bumps and a strap round the head
      for (const s of [-1, 1]) {
        const e = [s * hr * 0.55, hy + hr * 0.56, hz + hr * 0.36];
        K.torus('head', e, hr * 0.3, 0.03, { col: P.metal, rot: [Math.PI / 2 - 0.3, s * 0.6, 0] });
        K.blob('head', [e[0] + s * 0.01, e[1] + 0.01, e[2] + 0.03], [hr * 0.27, hr * 0.27, 0.02], { col: P.lens, buf: 'glow', rot: [-0.3, s * 0.6, 0], steps: 3 });
      }
      K.torus('head', [0, hy + hr * 0.42, hz - 0.02], hr * 0.98, 0.025, { col: P.strap, rot: [0.2, 0, 0] });
      // a jet pack on the back and a thruster strapped to each hind leg, nozzles glowing
      const jet = (bone, c, len, r) => {
        K.tube([{ p: [c[0], c[1], c[2] + len * 0.5], rx: r * 0.8, bone }, { p: [c[0], c[1], c[2]], rx: r, bone }, { p: [c[0], c[1], c[2] - len * 0.5], rx: r * 0.85, bone }], { col: P.metal, cap: 'flat' });
        K.torus(bone, [c[0], c[1], c[2] - len * 0.5], r * 0.85, 0.02, { col: P.metal2, rot: [Math.PI / 2, 0, 0] });
        K.horn(bone, [[c[0], c[1], c[2] - len * 0.5], [c[0], c[1], c[2] - len * 0.5 - 0.12], [c[0], c[1], c[2] - len * 0.5 - 0.24]], r * 0.7, { col: P.flame, buf: 'glow', pow: 0.8 });
      };
      for (const s of [-1, 1]) { jet('body', [s * 0.13, g.y + g.bh * 0.85, -0.12], 0.3, 0.08); jet(s > 0 ? 'leg.BL.1' : 'leg.BR.1', [s * g.bw * 0.95, g.y - 0.02, -0.5], 0.2, 0.055); }
      K.blob('body', [0, g.y + g.bh * 0.75, -0.1], [0.2, 0.06, 0.16], { col: P.metal2, n: 3 });
      K.torus('body', [0, g.y + 0.02, -0.04], g.bw * 0.98, 0.025, { col: P.strap, rot: [0.35, 0, 0] });
      return { legLen: g.legLen };
    },
  },
};
