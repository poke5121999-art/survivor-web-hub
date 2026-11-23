// Mực Sao (ranged, magic, wood): a teardrop squid pup with six short arms and star-speckled skin, then a finned squid
// with long glowing arms swimming through the air, then an astronomer squid whose skin is a moving star map with a
// small planet ring round it (SCOPE 3.1 #14).
import { palette } from '../families.js?v=20261122a';
import { shade } from '../kit.js?v=20261122a';

const THREE = window.THREE;
const P0 = palette(0x5a4ac8, { belly: 0xd0c4f4, dark: 0x1e1848, star: 0xfff0a8, arm: 0x7a6ae0, sucker: 0xf0d8ff });

// glowing star dots over an ellipsoid (centre c, radii r, turned by euler rot), golden-spiral spread
function speckle(K, bone, c, r, rot, n, size, col, keep = () => true) {
  let made = 0; const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
  for (let i = 0; i < n * 4 && made < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / (n * 4); const rad = Math.sqrt(1 - y * y); const th = i * 2.39996;
    const nm = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad); if (!keep(nm)) continue;
    const k = 0.6 + 0.8 * ((i * 0.618) % 1); const p = new THREE.Vector3(nm.x * r[0], nm.y * r[1], nm.z * r[2]).applyQuaternion(q);
    K.blob(bone, [c[0] + p.x, c[1] + p.y, c[2] + p.z], [size * k, size * k, size * k], { col, buf: 'glow', steps: 3, seg: 5 });
    made++;
  }
}
// the squid body plan: a head with big eyes, a mantle rising up and back from it (rot tips it), arms spreading out
// from under the head. o: { pal, y, mantle: [rx, ry, len], tilt, arms, armLen, armR }
function squid(K, o) {
  const P = o.pal; const y = o.y ?? 0.34; const M = o.mantle ?? [0.22, 0.22, 0.34]; const tilt = o.tilt ?? 0.55;
  K.bone('body', 'root', [0, y + 0.06, 0]); K.bone('chest', 'body', [0, y, 0.08]); K.bone('hip', 'body', [0, y + 0.16, -0.1]);
  K.bone('neck', 'chest', [0, y, 0.14]); const hd = [0, y + 0.02, 0.16]; K.bone('head', 'neck', hd);
  K.blob('head', hd, [0.25, 0.2, 0.21], { col: P.body, belly: P.belly });
  K.eyes('head', [0.15, hd[1] + 0.05, hd[2] + 0.15], 0.1, { yaw: 0.5, iris: o.iris ?? 0xffd040 });
  K.mouth = [0, hd[1] - 0.06, hd[2] + 0.2];
  // the mantle's axis leans back by `tilt` from vertical; it narrows to its tip
  const ax = [0, Math.cos(tilt), -Math.sin(tilt)]; const base = [0, hd[1] + 0.06, hd[2] - 0.08];
  const mc = [base[0], base[1] + ax[1] * M[2], base[2] + ax[2] * M[2]];
  const rot = [-Math.PI / 2 - tilt, 0, 0];
  K.blob('hip', mc, M, { col: P.body, rot, taper: -0.32, belly: P.belly });
  const tip = [0, base[1] + ax[1] * M[2] * 2.0, base[2] + ax[2] * M[2] * 2.0];
  const n = o.arms ?? 6; const L = o.armLen ?? 0.34; const r = o.armR ?? 0.055; const arms = []; const hang = o.hang ?? 0;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * 0.85 + (i / (n - 1)) * Math.PI * 1.7; const dx = Math.sin(a) * (1 - hang * 0.6); const dz = Math.cos(a) * (1 - hang * 0.6);
    const yb = hd[1] - 0.12; const dn = (t) => (hang ? yb - t * L * hang : null);
    const p0 = [dx * 0.12, yb, hd[2] + dz * 0.1]; const p1 = [dx * (0.12 + L * 0.45), dn(0.45) ?? 0.07, hd[2] + dz * (0.1 + L * 0.45)];
    const p2 = [dx * (0.12 + L * 0.85), dn(0.85) ?? 0.04, hd[2] + dz * (0.1 + L * 0.85)]; const p3 = [dx * (0.12 + L * 1.05), dn(1.05) ?? 0.1, hd[2] + dz * (0.1 + L * 1.0)];
    const ch = K.chain(`arm${i}`, 'head', [p0, p1, p2], 'tail', 1.2);
    K.tube([{ p: p0, rx: r, bone: ch[0] }, { p: p1, rx: r * 0.8, bone: ch[1] }, { p: p2, rx: r * 0.55, bone: ch[2] }, { p: p3, rx: r * 0.3, bone: ch[2], col: o.armTip }], { col: o.armCol ?? P.arm, belly: P.sucker });
    arms.push({ ch, pts: [p0, p1, p2, p3] });
  }
  return { y, hd, M, mc, rot, tip, ax, tilt, arms, legLen: 0.2 };
}

export default {
  'muc.1': {
    height: 0.9, move: 'slither', attack: 'shoot',
    build(K) {
      const P = P0;
      const g = squid(K, { pal: P });
      speckle(K, 'hip', g.mc, [g.M[0] * 1.0, g.M[1] * 1.0, g.M[2] * 0.7], g.rot, 12, 0.024, P.star, (n) => n.y > -0.2);
      for (const s of [-1, 1]) K.fin('hip', [s * 0.1, g.tip[1] - 0.12, g.tip[2] + 0.06], [s, 0.2, 0], [0, 0.6, -0.8], [[0, -0.08], [0.12, 0.0], [0.02, 0.1]], 0.04, shade(P.body, 0.85));
      return { legLen: g.legLen };
    },
  },
  'muc.2': {
    height: 1.15, move: 'swimAir', attack: 'shoot', airH: 0.6,
    build(K) {
      const P = { ...P0, body: 0x4a3ab8, belly: 0xc8bcf4, arm: 0x6a5ad8, glow: 0x7af0ff };
      // a long mantle lying back almost level, a wide fin round its tip, arms trailing down with glowing tips, two long
      // feeding tentacles ending in glowing clubs
      const g = squid(K, { pal: P, y: 0.5, mantle: [0.2, 0.2, 0.46], tilt: 1.15, arms: 6, armLen: 0.4, hang: 0.9, armTip: P.glow });
      const tip = g.tip; const fc = [0, tip[1] - 0.02, tip[2] + 0.18];
      for (const s of [-1, 1]) K.fin('hip', [s * 0.08, fc[1], fc[2]], [s, 0.15, 0], [0, 0.4, -0.92], [[0, -0.22], [0.2, -0.12], [0.32, 0.06], [0.14, 0.2], [0, 0.16]], 0.035, 0x8a7af0, { edge: P.glow });
      speckle(K, 'hip', g.mc, [g.M[0], g.M[1], g.M[2] * 0.8], g.rot, 14, 0.022, P.star, (n) => n.y > -0.3);
      for (const s of [-1, 1]) {
        const pts = [[s * 0.08, g.hd[1] - 0.12, g.hd[2] + 0.12], [s * 0.18, g.hd[1] - 0.22, g.hd[2] + 0.3], [s * 0.24, g.hd[1] - 0.36, g.hd[2] + 0.42], [s * 0.26, g.hd[1] - 0.46, g.hd[2] + 0.48]];
        const ch = K.chain(s < 0 ? 'feedR' : 'feedL', 'head', pts.slice(0, 3), 'tail', 0.6);
        K.tube(pts.map((p, i) => ({ p, rx: 0.03, bone: ch[Math.min(i, 2)] })), { col: P.arm });
        K.blob(ch[2], pts[3], [0.06, 0.08, 0.06], { col: P.glow, buf: 'glow', steps: 5 });
      }
      return { legLen: g.legLen };
    },
  },
  'muc.3': {
    height: 1.45, move: 'blink', ground: 'swimAir', attack: 'shoot', hover: 0.3,
    build(K) {
      const P = { ...P0, body: 0x161a48, belly: 0x2a2a6a, arm: 0x24286a, sucker: 0x5a5ab0, star: 0xfff4c0, line: 0x8ab8ff, ring: 0xf0c870, planet: 0xff9a6a };
      // the skin is a star map: dark navy, many stars and constellation lines in the glow mesh; a small planet on a
      // tilted ring circles it; a tall mantle crowned by a glowing comet tip
      const g = squid(K, { pal: P, y: 0.42, mantle: [0.26, 0.26, 0.44], tilt: 0.2, arms: 8, armLen: 0.42, hang: 0.6, armTip: P.line, iris: 0xbfe8ff });
      speckle(K, 'hip', g.mc, [g.M[0] * 1.0, g.M[1] * 1.0, g.M[2] * 0.8], g.rot, 26, 0.022, P.star);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...g.rot));
      const on = (x, y, z) => { const v = new THREE.Vector3(x, y, z).normalize(); const k = 1.01 / Math.hypot(v.x, v.y, v.z * 0.95); const p = new THREE.Vector3(v.x * g.M[0] * k, v.y * g.M[1] * k, v.z * g.M[2] * k * 0.95).applyQuaternion(q); return [g.mc[0] + p.x, g.mc[1] + p.y, g.mc[2] + p.z]; };
      for (const line of [[[0.2, 1, -0.3], [0.5, 0.8, 0.1], [0.3, 0.9, 0.5], [0.7, 0.6, 0.6]], [[-0.3, 1, -0.5], [-0.6, 0.7, -0.1], [-0.4, 0.9, 0.4]], [[0.1, -1, 0.2], [0.6, -0.7, 0.0], [0.4, -0.9, -0.4]]]) {
        const pts = line.map((d) => on(...d));
        K.tube(pts.map((p) => ({ p, rx: 0.008, bone: 'hip' })), { col: P.line, buf: 'glow', seg: 4, sub: 1 });
        for (const p of pts) K.crystal('hip', p, [0, 1, 0], 0.07, 0.03, P.star, { sides: 4, waist: 0.5 });
      }
      K.blob('hip', g.tip, [0.07, 0.07, 0.07], { col: 0xffffff, buf: 'glow', steps: 4 });
      K.crystal('hip', g.tip, [0, 1, -0.2], 0.24, 0.05, 0xbfe8ff, { sides: 4 });
      const c = [0, g.mc[1] - 0.05, g.mc[2]];
      K.bone('orbit', 'body', c); K.roles.orbits.push({ bone: 'orbit', speed: 1.4, axis: 'y', bob: 0.03 });
      K.torus('orbit', c, 0.62, 0.014, { col: P.ring, buf: 'glow', rot: [0.35, 0, 0.15] });
      K.blob('orbit', [0.62, c[1] - 0.12, c[2]], [0.09, 0.09, 0.09], { col: P.planet });
      K.torus('orbit', [0.62, c[1] - 0.12, c[2]], 0.14, 0.012, { col: P.ring, buf: 'glow', rot: [0.5, 0, 0.3] });
      K.blob('orbit', [-0.6, c[1] + 0.1, c[2] + 0.1], [0.055, 0.055, 0.055], { col: 0x8ad8ff });
      return { legLen: g.legLen };
    },
  },
};
