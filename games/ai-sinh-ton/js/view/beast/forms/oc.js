// Ốc Độc (melee, plague, wood): a snail with a green coiled shell and eyes on stalks, then a bigger snail whose shell
// grows dripping venom spikes, then a crystal snail whose shell is a violet gem full of swirling poison (SCOPE 3.1 #9).
import { palette } from '../families.js?v=20261124b';
import { shade } from '../kit.js?v=20261124b';

const THREE = window.THREE;

const P0 = palette(0xe8dcae, { belly: 0xf4eed0, dark: 0x3a3a20, shellA: 0x6ac84a, shellB: 0x3e9a3a, lip: 0xd8f08a, spot: 0xc8b480 });

// a flat coiled shell (axis x): a tube spiralling inwards, outer whorl at the bottom over the foot. Returns the
// spiral points so forms can hang spikes or glow on them. o: { c, R, r, turns, k, colAt, buf, wide }
function shell(K, bone, o) {
  const [cx, cy, cz] = o.c; const R0 = o.R ?? 0.3; const k = o.k ?? 0.28; const turns = o.turns ?? 2.2; const rk = o.r ?? 0.66;
  const pts = []; const N = Math.round(turns * 9);
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * turns * Math.PI * 2; const R = R0 * Math.exp(-k * th);
    pts.push({ p: [cx, cy - Math.cos(th) * R, cz - Math.sin(th) * R], rx: R * rk, ry: R * rk * (o.wide ?? 1.2), bone, col: o.colAt ? o.colAt(i, N) : (i % 3 ? P0.shellA : P0.shellB) });
  }
  K.tube(pts, { up: [1, 0, 0], buf: o.buf, sub: K.hi ? 4 : 2 });
  return pts;
}
// a turreted spire (whelk) shell: a helix climbing a tilted axis, its radius shrinking to a point. Returns the points.
function spire(K, bone, o) {
  const [cx, cy, cz] = o.c; const H = o.h ?? 0.7; const R0 = o.R ?? 0.26; const turns = o.turns ?? 3.2; const tilt = o.tilt ?? 0.55;
  const ax = new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt)); const ux = new THREE.Vector3(1, 0, 0); const uz = new THREE.Vector3().crossVectors(ux, ax);
  const pts = []; const N = Math.round(turns * 8);
  for (let i = 0; i <= N; i++) {
    const t = i / N; const th = t * turns * Math.PI * 2; const R = R0 * (1 - t * 0.92); const h = H * (1 - Math.pow(1 - t, 1.4));
    const p = new THREE.Vector3(cx, cy, cz).addScaledVector(ax, h).addScaledVector(ux, Math.cos(th) * R).addScaledVector(uz, Math.sin(th) * R);
    pts.push({ p: [p.x, p.y, p.z], rx: R * 0.62, ry: R * 0.62, bone, col: o.colAt ? o.colAt(i, N) : P0.shellA, th, R });
  }
  K.tube(pts, { sub: K.hi ? 3 : 2 });
  return pts;
}
// an eye on a soft stalk (spring chain): stalk tube, white ball, pupil looking forward, shine
function stalkEye(K, s, base, tip, r, col, opts = {}) {
  const mid = [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2 + 0.02, (base[2] + tip[2]) / 2];
  const ch = K.chain(s < 0 ? 'stalkR' : 'stalkL', 'head', [base, mid], 'ear', 0.6);
  K.horn([ch[0], ch[1], ch[1]], [base, mid, tip], 0.035, { col, pow: 0.3 });
  const nm = ch[1] + '.eye'; K.bone(nm, ch[1], tip); K.roles.eyes.push(nm);
  K.blob(nm, tip, [r, r * 1.1, r], { col: 0xfafaf2 });
  K.blob(nm, [tip[0] + s * r * 0.15, tip[1], tip[2] + r * 0.6], [r * 0.62, r * 0.76, r * 0.45], { col: opts.pupil ?? 0x1a1420 });
  K.blob(nm, [tip[0] + s * r * 0.05, tip[1] + r * 0.35, tip[2] + r * 0.95], [r * 0.22, r * 0.22, r * 0.1], { col: 0xffffff, buf: 'glow', steps: 4, seg: 6 });
}
// the soft foot and head: a slug body from the tail to a raised front, two short feelers, a smile
function foot(K, P, o = {}) {
  const L = o.len ?? 1; const hY = o.headY ?? 0.36;
  K.bone('body', 'root', [0, 0.15, 0]); K.bone('chest', 'body', [0, 0.17, 0.2 * L]); K.bone('hip', 'body', [0, 0.12, -0.2 * L]);
  K.bone('neck', 'chest', [0, hY - 0.1, 0.38 * L]); K.bone('head', 'neck', [0, hY, 0.46 * L]);
  K.tube([
    { p: [0, 0.05, -0.56 * L], rx: 0.09, ry: 0.045, bone: 'hip' }, { p: [0, 0.09, -0.24 * L], rx: 0.2, ry: 0.1, bone: 'hip' },
    { p: [0, 0.12, 0.1 * L], rx: 0.23, ry: 0.12, bone: 'body' }, { p: [0, hY - 0.12, 0.38 * L], rx: 0.2, ry: 0.19, bone: 'neck' },
    { p: [0, hY, 0.46 * L], rx: 0.18, ry: 0.17, bone: 'head' },
  ], { col: P.body, belly: P.belly, n: 2.2 });
  for (const s of [-1, 1]) K.horn('head', [[s * 0.1, hY - 0.04, 0.54 * L], [s * 0.15, hY - 0.06, 0.62 * L], [s * 0.18, hY - 0.04, 0.66 * L]], 0.03, { col: P.body });
  K.torus('head', [0, hY - 0.06, 0.46 * L], 0.135, 0.012, { arc: 0.5, col: P.dark, rot: [0, 0.0, 0] });
  for (const s of [-1, 1]) K.blob('head', [s * 0.12, hY - 0.01, 0.58 * L], [0.04, 0.025, 0.02], { col: 0xff8a8a, steps: 4, seg: 8 });
  K.mouth = [0, hY - 0.06, 0.62 * L];
  return { hY, L };
}

export default {
  'oc.1': {
    height: 0.85, move: 'slither', attack: 'bite',
    build(K) {
      const P = P0;
      const f = foot(K, P);
      K.bone('shell', 'body', [0, 0.5, -0.08]);
      shell(K, 'shell', { c: [0, 0.52, -0.1], R: 0.3 });
      for (const s of [-1, 1]) stalkEye(K, s, [s * 0.07, f.hY + 0.12, 0.46], [s * 0.13, f.hY + 0.38, 0.53], 0.07, P.body);
      for (const [x, z] of [[0.12, -0.36], [-0.14, -0.1], [0.15, 0.16]]) K.blob('body', [x, 0.12, z], [0.04, 0.03, 0.05], { col: P.spot, steps: 3, seg: 6 });
      return { legLen: 0.2 };
    },
  },
  'oc.2': {
    height: 1.1, move: 'slither', attack: 'bite',
    build(K) {
      const P = { ...P0, body: 0xb8c890, belly: 0xe8f0c0, dark: 0x2a2a18, venom: 0xa8ff40, spike: 0x5a3a6a };
      const f = foot(K, P, { len: 1.2, headY: 0.42 });
      K.bone('shell', 'body', [0, 0.3, -0.12]);
      // a tall spire shell, green with purple bands, venom spikes on every turn dripping
      const pts = spire(K, 'shell', { c: [0, 0.3, -0.16], h: 0.9, R: 0.34, turns: 3, tilt: 0.5, colAt: (i, N) => (Math.floor(i / 2) % 2 ? 0x4e9a3a : 0xc8e870) });
      K.horn('shell', [pts[pts.length - 3].p, pts[pts.length - 1].p, [0, pts[pts.length - 1].p[1] + 0.12, pts[pts.length - 1].p[2] - 0.06]], 0.05, { col: 0x4e9a3a, tip: P.spike });
      for (let i = 2; i < pts.length - 4; i += 3) {
        const q = pts[i]; const out = [Math.cos(q.th), 0, Math.sin(q.th)];
        const b = [q.p[0] + Math.cos(q.th) * q.R * 0.7, q.p[1] + 0.02, q.p[2] - Math.sin(q.th) * q.R * 0.3];
        const tip = [b[0] + out[0] * 0.14, b[1] + 0.08, b[2] - Math.abs(out[2]) * 0.04 + 0.0];
        K.horn('shell', [b, [(b[0] + tip[0]) / 2, (b[1] + tip[1]) / 2 + 0.01, (b[2] + tip[2]) / 2], tip], 0.035, { col: P.spike, tip: P.venom });
        if (i % 2) K.blob('shell', [tip[0], tip[1] - 0.06, tip[2]], [0.022, 0.035, 0.022], { col: P.venom, buf: 'glow', steps: 4 });
      }
      for (const s of [-1, 1]) stalkEye(K, s, [s * 0.08, f.hY + 0.14, 0.55], [s * 0.15, f.hY + 0.42, 0.62], 0.075, P.body, { pupil: 0x3a1a4a });
      for (const [x, z] of [[0.15, -0.4], [-0.16, -0.16], [0.17, 0.1], [-0.12, 0.3]]) K.blob('body', [x, 0.12, z], [0.05, 0.035, 0.06], { col: P.venom, steps: 3, seg: 6 });
      return { legLen: 0.2 };
    },
  },
  'oc.3': {
    height: 1.25, move: 'roll', attack: 'bite', ball: true, ballR: 0.5,
    build(K) {
      const P = { ...P0, body: 0xd8c8e8, belly: 0xf4ecff, gem: 0x9a5ae0, gem2: 0xc890ff, mist: 0x9aff6a };
      // the snail is drawn round the ball centre, so the roll gait spins it in place: a violet crystal shell of stepped
      // blocks (a big block, a smaller one stepped up and back, a cap), a square spiral of glowing poison pixels on both
      // flanks, a crown of crystal points, the soft head peeking out low at the front
      const C = [0, 0.5, 0];
      K.bone('body', 'root', C); K.bone('chest', 'body', [0, 0.45, 0.2]); K.bone('hip', 'body', [0, 0.5, -0.2]);
      K.bone('neck', 'chest', [0, 0.32, 0.42]); K.bone('head', 'neck', [0, 0.34, 0.5]);
      const shell = P.gem;
      K.blob('body', [0, 0.47, -0.02], [0.47, 0.4, 0.46], { col: shell, n: 3 });
      K.blob('body', [0, 0.8, -0.1], [0.36, 0.16, 0.36], { col: shell, n: 3 });
      K.blob('body', [0, 0.98, -0.16], [0.2, 0.08, 0.2], { col: P.gem2, n: 3 });
      K.blob('body', [0, 0.14, -0.02], [0.4, 0.06, 0.4], { col: shade(P.gem, 0.6), n: 3 });
      // the spiral: a square spiral path in the flank plane, one thin glowing bar per leg
      const sp = [[0, 0], [0.08, 0], [0.08, 0.08], [-0.08, 0.08], [-0.08, -0.08], [0.16, -0.08], [0.16, 0.16], [-0.16, 0.16], [-0.16, -0.16], [0.24, -0.16], [0.24, 0.24], [-0.24, 0.24]];
      for (const sx of [-1, 1]) for (let i = 0; i < sp.length - 1; i++) {
        const P0x = [sx * 0.445, 0.47 + sp[i][1], -0.02 + sp[i][0]]; const P1x = [sx * 0.445, 0.47 + sp[i + 1][1], -0.02 + sp[i + 1][0]];
        K.beam(P0x, P1x, 0.022, 0.022, { buf: 'glow', col: i % 2 ? P.mist : 0xd0ff9a, bone: K.bi('body'), up: [1, 0, 0], ext: 0.022 });
      }
      const tips = [[0, 1, -0.3, 0.3], [0.5, 0.8, -0.4, 0.22], [-0.5, 0.8, -0.4, 0.22], [0, 0.6, -1, 0.2]];
      tips.forEach(([x, y, z, l], i) => { const v = new THREE.Vector3(x, y, z).normalize(); K.crystal('body', [v.x * 0.3, 0.75 + v.y * 0.25, -0.1 + v.z * 0.3], [v.x, v.y, v.z], l, 0.07, i % 2 ? P.gem2 : 0xe8c8ff, { buf: 'toon' }); });
      K.tube([{ p: [0, 0.2, 0.18], rx: 0.2, ry: 0.13, bone: 'chest' }, { p: [0, 0.28, 0.44], rx: 0.18, ry: 0.16, bone: 'neck' }, { p: [0, 0.34, 0.52], rx: 0.16, ry: 0.15, bone: 'head' }], { col: P.body, belly: P.belly });
      K.torus('head', [0, 0.3, 0.52], 0.12, 0.011, { arc: 0.5, col: 0x3a2a4a });
      for (const s of [-1, 1]) stalkEye(K, s, [s * 0.07, 0.44, 0.52], [s * 0.15, 0.66, 0.6], 0.07, P.body, { pupil: 0x3a1a4a });
      K.mouth = [0, 0.3, 0.68];
      return { legLen: 0.15 };
    },
  },
};
