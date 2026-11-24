// Bọ Sét (ranged, magic, lightning): a round beetle whose feelers spark, then a stag beetle with open wing cases and
// buzzing wings, then either a storm king with tesla-coil horns or a quartz-armoured burrower (SCOPE 3.1 #11).
import { palette } from '../families.js?v=20261124a';
import { shade } from '../kit.js?v=20261124a';

const THREE = window.THREE;
const P0 = palette(0x3a5ad0, { belly: 0x2a2a48, dark: 0x16182c, bolt: 0xffe040, head: 0x22264a });

// a point on an ellipsoid surface along a direction (for decals that follow a curved shell)
const onShell = (c, r, d, out = 0) => { const v = new THREE.Vector3(d[0], d[1], d[2]).normalize(); const k = 1 / Math.hypot(v.x / r[0], v.y / r[1], v.z / r[2]); return [c[0] + v.x * (k + out), c[1] + v.y * (k + out), c[2] + v.z * (k + out)]; };

// the beetle body plan: a domed shell, an underbody, a head with chibi eyes, six legs. o: { pal, sh: [rx, ry, rz], y }
function beetle(K, o) {
  const P = o.pal; const y = o.y ?? 0.3; const sh = o.sh ?? [0.34, 0.28, 0.4]; const legR = o.legR ?? 0.035; const legK = o.legK ?? 1;
  K.bone('body', 'root', [0, y, 0]); K.bone('chest', 'body', [0, y + 0.02, 0.18]); K.bone('hip', 'body', [0, y, -0.18]);
  K.bone('neck', 'chest', [0, y + 0.02, 0.32]); const hd = [0, y + 0.05, sh[2] * 0.95]; K.bone('head', 'neck', hd);
  const sc = [0, y + 0.06, -0.06];
  K.blob('body', [0, y - 0.03, -0.02], [sh[0] * 0.85, 0.12, sh[2] * 0.9], { col: P.belly });
  if (!o.open) K.blob('hip', sc, sh, { col: P.body, n: 2.1 });
  else K.blob('hip', [0, y + 0.02, -0.06], [sh[0] * 0.8, sh[1] * 0.7, sh[2] * 0.95], { col: P.belly, n: 2.1 });
  const seam = []; for (let i = 0; i <= 6; i++) { const t = -0.95 + (i / 6) * 1.9; seam.push(onShell(sc, sh, [0, Math.sqrt(1 - t * t), t], 0.004)); }
  if (!o.open) K.tube(seam.map((p) => ({ p, rx: 0.014, bone: 'hip' })), { col: P.dark, seg: 5 });
  const hr = o.hr ?? 0.21;
  K.blob('head', hd, [hr, hr * 0.88, hr * 0.78], { col: P.head });
  K.eyes('head', [hr * 0.48, hd[1] + hr * 0.18, hd[2] + hr * 0.6], hr * 0.36, { yaw: 0.4, iris: o.iris ?? 0x4ad8ff });
  K.mouth = [0, hd[1] - hr * 0.3, hd[2] + hr * 0.75];
  for (const s of [-1, 1]) K.horn('head', [[s * hr * 0.35, hd[1] - hr * 0.45, hd[2] + hr * 0.6], [s * hr * 0.4, hd[1] - hr * 0.55, hd[2] + hr * 0.95], [s * hr * 0.12, hd[1] - hr * 0.58, hd[2] + hr * 1.15]], 0.025, { col: P.dark });
  const ids = [['FL', 1, 0.22], ['FR', -1, 0.22], ['BL', 1, -0.22], ['BR', -1, -0.22], ['ML', 1, 0.0], ['MR', -1, 0.0]];
  for (const [nm, s, z] of ids) {
    const a = [s * sh[0] * 0.55, y - 0.02, z]; const b = [s * sh[0] * 1.12 * legK, y + 0.06, z * 1.3]; const c = [s * sh[0] * 1.3 * legK, 0.02, z * 1.6];
    K.bone(`leg.${nm}.0`, 'body', a); K.bone(`leg.${nm}.1`, `leg.${nm}.0`, b);
    K.horn([`leg.${nm}.0`, `leg.${nm}.1`, `leg.${nm}.1`], [a, b, c], legR * (o.legThick ?? 1), { col: P.dark, pow: 0.25 });
    K.roles.legs.push({ up: `leg.${nm}.0`, low: `leg.${nm}.1`, front: nm[0] !== 'B', side: s });
  }
  return { y, sh, sc, hd, hr, pal: P, onShell: (d, out) => onShell(sc, sh, d, out), legLen: y };
}
// a zigzag lightning stripe running down a curved surface: glow tube through surface points
function bolt(K, g, s, col, w = 0.022) {
  const zz = [[0.6, 0.5, 0.75], [0.85, 0.32, 0.3], [0.7, 0.5, 0.05], [0.9, 0.2, -0.45], [0.75, 0.35, -0.75]];
  K.tube(zz.map(([x, y, z]) => ({ p: g.onShell([s * x, y, z], 0.006), rx: w, bone: 'hip' })), { col, buf: 'glow', seg: 5, sub: 1 });
}
// sparking feelers: spring chains with a glowing bulb and a crystal spark at the tip
function feelers(K, g, len, col) {
  const [, hy, hz] = g.hd;
  for (const s of [-1, 1]) {
    const b0 = [s * 0.07, hy + g.hr * 0.6, hz + 0.04]; const b1 = [s * 0.13, hy + g.hr * 0.6 + len * 0.55, hz + len * 0.25]; const tip = [s * 0.2, hy + g.hr * 0.6 + len, hz + len * 0.45];
    const ch = K.chain(s < 0 ? 'antR' : 'antL', 'head', [b0, b1], 'ear', 0.8);
    K.horn([ch[0], ch[1], ch[1]], [b0, b1, tip], 0.02, { col: g.pal?.dark ?? 0x16182c });
    K.blob(ch[1], tip, [0.045, 0.045, 0.045], { col, buf: 'glow', steps: 5 });
    K.crystal(ch[1], tip, [s * 0.4, 1, 0.3], 0.1, 0.02, 0xffffff, { sides: 4 });
  }
}

// opened wing cases: two half-shells lifted and spread on their own bones, buzzing membrane wings under them
function openShell(K, g, col, edge, mem, o = {}) {
  const [rx, ry, rz] = g.sh; const y = g.y + ry * 0.55;
  for (const s of [-1, 1]) {
    const nm = s < 0 ? 'caseR' : 'caseL'; const pv = [s * 0.06, y, 0.12]; K.bone(nm, 'hip', pv);
    K.blob(nm, [s * rx * 0.55, y + 0.1, -0.1], [rx * 0.55, ry * 0.32, rz * 0.95], { col, rot: [-0.35, s * 0.35, s * 0.75], n: 2.1, belly: shade(col, 0.6) });
    K.roles.fins.push({ bone: nm, axis: 'z', f: 3, amp: 0.04, side: s });
    const wn = s < 0 ? 'memR' : 'memL'; K.bone(wn, 'hip', [s * 0.05, y, 0.0]);
    K.fin(wn, [s * 0.05, y, 0.0], [s * 0.6, 0.3, -0.74], [s * 0.6, -0.3, 0.2], [[0, -0.04], [0.2, -0.1], [o.wing ?? 0.7, -0.04], [(o.wing ?? 0.7) * 0.9, 0.08], [0.2, 0.08]], 0.015, mem, { buf: 'ghost', edge });
    K.roles.fins.push({ bone: wn, axis: 'y', f: 38, amp: 0.25, side: s });
  }
}
// stag horns: a pair of forked mandible horns forward from the head
function stagHorns(K, g, len, col, tip) {
  const [, hy, hz] = g.hd;
  for (const s of [-1, 1]) {
    const a = [s * g.hr * 0.4, hy, hz + g.hr * 0.5]; const b = [s * g.hr * 0.75, hy + len * 0.35, hz + len * 0.6]; const c = [s * g.hr * 0.35, hy + len * 0.7, hz + len * 1.0];
    K.horn('head', [a, b, c], 0.05, { col, tip });
    K.horn('head', [b, [b[0] + s * 0.06, b[1] + len * 0.3, b[2] + 0.02], [b[0] + s * 0.08, b[1] + len * 0.5, b[2] - 0.04]], 0.03, { col, tip });
  }
}

export default {
  'bosat.1': {
    height: 0.85, move: 'walk', attack: 'shoot',
    build(K) {
      const P = P0;
      const g = beetle(K, { pal: P });
      for (const s of [-1, 1]) bolt(K, g, s, P.bolt);
      feelers(K, g, 0.32, P.bolt);
      return { legLen: 0.2 };
    },
  },
  'bosat.2': {
    height: 1.15, move: 'fly', attack: 'shoot', airH: 0.9,
    build(K) {
      const P = { ...P0, body: 0x2e4ab8, bolt: 0xfff060, horn: 0x1e2050 };
      const g = beetle(K, { pal: P, open: true, sh: [0.32, 0.26, 0.42], hr: 0.22, legK: 0.9 });
      openShell(K, g, P.body, 0xffe880, 0xd8ecff);
      for (const s of [-1, 1]) K.tube([[0.45, 0.85, 0.3], [0.6, 0.6, 0.0], [0.5, 0.75, -0.4]].map(([x, y, z]) => ({ p: [s * g.sh[0] * x * 1.2, g.y + 0.2 + y * 0.12, -0.1 + z * 0.4], rx: 0.02, bone: s < 0 ? 'caseR' : 'caseL' })), { col: P.bolt, buf: 'glow', seg: 5, sub: 1 });
      stagHorns(K, g, 0.36, P.horn, P.bolt);
      feelers(K, g, 0.26, P.bolt);
      return { legLen: 0.2 };
    },
  },
  'bosat.3a': {
    height: 1.45, move: 'fly', attack: 'shoot', airH: 1.1,
    build(K) {
      const P = { ...P0, body: 0x6a3ac8, belly: 0x2a1a48, dark: 0x1a1030, head: 0x3a2068, bolt: 0x8af0ff, gold: 0xf0c050, copper: 0xd8804a };
      const g = beetle(K, { pal: P, open: true, sh: [0.34, 0.27, 0.44], hr: 0.23, legK: 0.9, iris: 0x8af0ff });
      openShell(K, g, P.body, P.gold, 0xc8f4ff, { wing: 0.85 });
      // tesla-coil horns: copper coils wound up a gold rod, a glowing sphere on top, arcs between them
      const [, hy, hz] = g.hd; const tops = [];
      for (const s of [-1, 0, 1]) {
        const b = [s * 0.1, hy + g.hr * 0.6, hz - 0.02 + (s ? 0 : 0.06)]; const h = s ? 0.34 : 0.44; const lean = s * 0.12;
        K.horn('head', [b, [b[0] + lean * 0.5, b[1] + h * 0.5, b[2] + 0.04], [b[0] + lean, b[1] + h, b[2] + 0.06]], 0.025, { col: P.gold, pow: 0 });
        for (let i = 0; i < 4; i++) { const k = 0.2 + i * 0.18; K.torus('head', [b[0] + lean * k, b[1] + h * k, b[2] + 0.02 + 0.04 * k], 0.05 - i * 0.006, 0.014, { col: P.copper }); }
        const t = [b[0] + lean, b[1] + h + 0.04, b[2] + 0.06]; tops.push(t);
        K.blob('head', t, [0.06, 0.06, 0.06], { col: P.bolt, buf: 'glow', steps: 5 });
      }
      K.torus('head', [0, tops[1][1] - 0.08, tops[1][2]], 0.2, 0.012, { col: P.bolt, buf: 'glow', rot: [0.3, 0, 0], arc: 0.5 });
      // a ring of storm round the body on an orbit bone
      K.bone('storm', 'body', [0, g.y + 0.1, -0.06]); K.roles.orbits.push({ bone: 'storm', speed: 3, axis: 'y' });
      K.torus('storm', [0, g.y + 0.1, -0.06], 0.58, 0.016, { col: P.bolt, buf: 'glow', arc: 0.7, rot: [0.15, 0, 0.1] });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; K.crystal('storm', [Math.cos(a) * 0.58, g.y + 0.1, -0.06 + Math.sin(a) * 0.58], [0, 1, 0], 0.12, 0.03, P.bolt, { sides: 4 }); }
      for (const s of [-1, 1]) K.tube([[0.6, 0.9, 0.3], [0.8, 0.6, -0.1], [0.6, 0.8, -0.5]].map(([x, y, z]) => ({ p: [s * g.sh[0] * x * 1.1, g.y + 0.22 + y * 0.12, -0.1 + z * 0.4], rx: 0.02, bone: s < 0 ? 'caseR' : 'caseL' })), { col: P.gold, seg: 5, sub: 1 });
      return { legLen: 0.2 };
    },
  },
  'bosat.3b': {
    height: 1.25, move: 'burrow', ground: 'walk', attack: 'shoot',
    build(K) {
      const P = { ...P0, body: 0x5a5a6e, belly: 0x2a2a34, dark: 0x1a1a22, head: 0x3a3a4a, quartz: 0xe8e0ff, quartz2: 0xb8a8f0, bolt: 0xffe040 };
      const g = beetle(K, { pal: P, y: 0.34, sh: [0.44, 0.3, 0.46], hr: 0.24, legThick: 1.6, legK: 1.05 });
      // quartz clusters through the stone shell, a glowing vein between them
      const clusters = [[0, 1, 0.1, 0.52], [0.45, 0.85, -0.25, 0.42], [-0.45, 0.85, -0.25, 0.42], [0.3, 0.9, 0.45, 0.3], [-0.3, 0.9, 0.45, 0.3], [0, 0.8, -0.7, 0.36], [0.8, 0.5, 0.2, 0.2], [-0.8, 0.5, 0.2, 0.2]];
      for (const [x, y, z, h] of clusters) {
        const p = g.onShell([x, y, z], -0.03); const n = new THREE.Vector3(x, y * 1.4, z).normalize();
        K.crystal('hip', p, [n.x, n.y, n.z], h, h * 0.24, P.quartz, { sides: 6, buf: 'toon' });
        K.crystal('hip', p, [n.x + 0.4, n.y, n.z - 0.3], h * 0.6, h * 0.16, P.quartz2, { sides: 5, buf: 'toon' });
      }
      bolt(K, g, 1, P.bolt, 0.018); bolt(K, g, -1, P.bolt, 0.018);
      // big pincers on the front legs
      for (const s of [-1, 1]) {
        const b = s > 0 ? 'leg.FL.1' : 'leg.FR.1'; const w = [s * g.sh[0] * 1.2, 0.2, 0.42];
        K.blob(b, w, [0.1, 0.08, 0.12], { col: P.body, n: 2.4 });
        for (const t of [-1, 1]) K.horn(b, [[w[0], w[1] + t * 0.03, w[2] + 0.08], [w[0] - s * 0.04, w[1] + t * 0.07, w[2] + 0.2], [w[0] - s * 0.1, w[1] + t * 0.03, w[2] + 0.28]], 0.045, { col: P.body, tip: P.quartz });
      }
      feelers(K, g, 0.2, P.bolt);
      return { legLen: 0.25 };
    },
  },
};
