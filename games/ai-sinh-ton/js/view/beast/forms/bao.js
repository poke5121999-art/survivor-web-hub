// Báo Mây (melee, hunter, lightning): a clouded-leopard cub with cloud blotches and a long tail, then a cloud mane and
// glowing stripes, then a ghost leopard whose back half is cloud and who leaves after-images (SCOPE 3.1 #12).
import { quad, palette } from '../families.js?v=20261122a';
import { shade } from '../kit.js?v=20261122a';

const THREE = window.THREE;

const P0 = palette(0xd8c49a, { belly: 0xfaf2e0, snout: 0xfaf0dc, dark: 0x3a3440, cloud: 0x6a6878, rim: 0x3e3c4a, iris: 0x8ad04a });

// flat blotches on the body tube: a = angle round the body (0 = side, pi/2 = top), z along it, s = size
function blotches(K, g, list, col, rim) {
  for (const [a, z, s] of list) for (const side of (a > 1.5 ? [1] : [-1, 1])) {
    const x = side * Math.cos(a) * g.rx; const y = g.hipY + Math.sin(a) * g.ry + 0.01;
    const bone = z > g.cz * 0.5 ? 'chest' : z < -g.cz * 0.5 ? 'hip' : 'body';
    const n = new THREE.Vector3(side * Math.cos(a) / g.rx, Math.sin(a) / g.ry, 0).normalize();
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)); const rot = [e.x, e.y, e.z];
    if (rim) K.blob(bone, [x, y, z], [s * 1.25, s * 0.95, 0.018], { col: rim, rot, steps: 3, seg: 8 });
    K.blob(bone, [x + n.x * 0.006, y + n.y * 0.006, z], [s, s * 0.7, 0.02], { col, rot, steps: 3, seg: 8 });
  }
}
function cat(K, P, o = {}) {
  return quad(K, { pal: P, len: o.len ?? 0.85, rx: o.rx ?? 0.24, ry: o.ry ?? 0.23, n: 2.3, leg: o.leg ?? 0.24, legR: o.legR ?? 0.07, hr: o.hr ?? 0.32, neck: o.neck ?? 0.04, headUp: 0.03,
    snout: [0.55, 0.36, 0.55], ears: o.ears ?? 'round', earK: o.earK ?? 0.62, eyeK: 0.27, iris: P.iris, earTip: P.dark, hoof: o.hoof,
    tail: o.tail === null ? null : { len: o.tailLen ?? 0.8, r: o.tailR ?? 0.085, up: o.tailUp ?? 0.35, segs: 5, taper: 0.7, col: o.tailCol } });
}
// a ring of cloud puffs (manes, cloud bodies): count lumps on a circle of radius R round an axis
function puffs(K, bone, c, R, n, r, col, o = {}) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0])));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2; const p = new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R).applyMatrix4(m);
    const k = 0.8 + 0.4 * ((i * 0.618) % 1);
    K.blob(bone, [c[0] + p.x, c[1] + p.y, c[2] + p.z], [r * k, r * k * 0.9, r * k], { col, buf: o.buf, steps: 5 });
  }
}

export default {
  'bao.1': {
    height: 0.95, move: 'gallop', attack: 'bite', stride: 1.15,
    build(K) {
      const P = P0;
      const g = cat(K, P);
      blotches(K, g, [[0.3, 0.2, 0.075], [0.6, -0.12, 0.08], [0.15, -0.28, 0.07], [Math.PI / 2, 0.05, 0.07], [0.9, 0.34, 0.05]], P.cloud, P.rim);
      const [, hy, hz] = g.head;
      for (const s of [-1, 1]) K.blob('head', [s * 0.08, hy + g.hr * 0.7, hz - 0.02], [0.03, 0.02, 0.04], { col: P.cloud, steps: 3, seg: 6 });
      for (let i = 1; i < 5; i += 1) { const b = g.tail[i]; const p = K.at(b); K.torus(b, [p.x, p.y, p.z], 0.085 * (1 - i * 0.12) * 1.02, 0.02, { col: P.rim, rot: [Math.PI / 2 - 0.4, 0, 0] }); }
      return { legLen: g.leg };
    },
  },
  'bao.2': {
    height: 1.2, move: 'leap', ground: 'gallop', attack: 'bite', stride: 1.25,
    build(K) {
      const P = { ...P0, body: 0xc8b48a, cloud: 0x5a5a70, rim: 0x2e2c3a, mane: 0xf4f6ff, stripe: 0x9ae0ff, iris: 0x6ad8ff };
      const g = cat(K, P, { len: 0.95, rx: 0.25, ry: 0.24, leg: 0.42, legR: 0.075, hr: 0.33, earK: 0.75, ears: 'pointy', tailLen: 0.95, tailUp: 0.85, neck: 0.1 });
      blotches(K, g, [[0.3, 0.2, 0.08], [0.6, -0.12, 0.085], [0.15, -0.3, 0.075], [Math.PI / 2, 0.0, 0.08]], P.cloud, P.rim);
      // glowing stripes over the shoulders and haunches
      for (const [z, bone] of [[0.36, 'chest'], [0.22, 'chest'], [-0.24, 'hip'], [-0.36, 'hip']]) K.torus(bone, [0, g.hipY + 0.02, z], g.rx * 1.03, 0.016, { col: P.stripe, buf: 'glow', rot: [Math.PI / 2, 0, 0], arc: 0.36, n: 2, colAt: () => P.stripe });
      // the cloud mane round the neck
      const nk = [0, g.hipY + g.ry * 0.7, g.L * 0.44];
      puffs(K, 'chest', nk, 0.24, 9, 0.11, P.mane, { rot: [Math.PI / 2 - 0.4, 0, 0] });
      puffs(K, 'chest', [0, nk[1] + 0.05, nk[2] - 0.04], 0.16, 6, 0.09, 0xe0e8f8, { rot: [Math.PI / 2 - 0.4, 0, 0] });
      for (let i = 1; i < 5; i++) { const b = g.tail[i]; const p = K.at(b); K.torus(b, [p.x, p.y, p.z], 0.08 * (1 - i * 0.12) * 1.04, 0.018, { col: P.stripe, buf: 'glow', rot: [Math.PI / 2 - 0.4, 0, 0] }); }
      K.blob(g.tail[4], g.tail.end, [0.08, 0.07, 0.09], { col: P.mane, steps: 5 });
      return { legLen: g.leg };
    },
  },
  'bao.3': {
    height: 1.45, move: 'swimAir', attack: 'bite', airH: 0.6, stride: 1.3,
    build(K) {
      const P = { ...P0, body: 0xe8eef8, belly: 0xffffff, snout: 0xffffff, dark: 0x3a4a7a, cloud: 0x8a9ad8, rim: 0x5a6aa8, iris: 0xa0f0ff, mist: 0xcad8ff };
      // the front half solid (pale with blue cloud marks), the back half dissolving into cloud: hips and back legs in
      // the see-through mesh, a cloud tail, and two after-images trailing behind
      const g = cat(K, P, { len: 1.0, rx: 0.25, ry: 0.24, leg: 0.32, legR: 0.075, hr: 0.34, earK: 0.85, ears: 'long', neck: 0.1, tail: null, hoof: 0x8ae0ff });
      blotches(K, g, [[0.4, 0.28, 0.07], [Math.PI / 2, 0.24, 0.06]], P.cloud, P.rim);
      const hz = -g.cz;
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; K.blob('hip', [Math.cos(a) * 0.2, g.hipY + Math.sin(a) * 0.2, hz - 0.1], [0.17, 0.15, 0.17], { col: P.mist, buf: 'ghost', steps: 5 }); }
      const tp = [[0, g.hipY + 0.06, -g.L * 0.55], [0, g.hipY + 0.2, -g.L * 0.85], [0, g.hipY + 0.42, -g.L * 1.0], [0, g.hipY + 0.6, -g.L * 0.95]];
      const tb = K.chain('tail', 'hip', tp, 'tail', 0.8);
      tp.forEach((p, i) => K.blob(tb[i], p, [0.15 - i * 0.02, 0.13 - i * 0.02, 0.15 - i * 0.02], { col: i % 2 ? P.mist : 0xe8eeff, buf: 'ghost', steps: 5 }));
      for (const k of [1, 2]) {
        const z = -g.L * 0.5 - k * 0.42; const y = g.hipY + 0.05 + k * 0.03;
        K.blob('hip', [0, y, z], [g.rx * (1 - k * 0.15), g.ry * (1 - k * 0.15), 0.3], { col: P.cloud, buf: 'ghost', steps: 5 });
        K.blob('hip', [0, y + 0.22, z + 0.28], [g.hr * (1 - k * 0.2), g.hr * 0.85 * (1 - k * 0.2), g.hr * 0.8], { col: P.cloud, buf: 'ghost', steps: 5 });
      }
      // a crown of cloud on the head and a glowing ring on the brow
      const [, hy, hzz] = g.head;
      puffs(K, 'head', [0, hy + g.hr * 0.75, hzz - 0.05], 0.12, 5, 0.07, 0xffffff);
      K.crystal('head', [0, hy + g.hr * 0.55, hzz + g.hr * 0.6], [0, 1, 0.7], 0.12, 0.035, 0x8ae0ff, { sides: 4 });
      for (const [nm, s, f] of [['FL', 1, 1], ['FR', -1, 1]]) K.torus(`leg.${nm}.1`, [s * g.rx * 0.62, 0.05, f * g.cz], 0.1, 0.016, { col: 0x8ae0ff, buf: 'glow' });
      return { legLen: g.leg };
    },
  },
};
