// Stylized dog companion (hand-written): one skinned Figure (one mesh, one material, one draw) on a small
// quadruped rig, with a simple procedural idle / trot / sit and tail wag. Options: col, col2 (muzzle/belly),
// ears 'flop' | 'up', goggles, collar, size.
import { PI, TAU, lerp } from '../lf/util.js';
import { Geo, Figure, makeRig, jb } from '../lf/kit.js';
import { S_CLOTH, S_HAIR, S_SKIN, S_EYE, S_GLOW, S_GLASS, S_RUBBER, S_METAL, S_LEATHER } from './mat.js';
import { toonify } from './mat.js';

const LEGS = [['fl', 0.1, 0.27], ['fr', -0.1, 0.27], ['bl', 0.1, -0.27], ['br', -0.1, -0.27]];
function dogRig() {
  const d = [['root', null, 0, 0, 0], ['body', 'root', 0, 0.5, -0.05], ['chest', 'body', 0, 0.52, 0.2], ['neck', 'chest', 0, 0.6, 0.33], ['head', 'neck', 0, 0.74, 0.42], ['tail1', 'body', 0, 0.56, -0.36], ['tail2', 'tail1', 0, 0.66, -0.5]];
  for (const [n, x, z] of LEGS) { const p = n[0] === 'f' ? 'chest' : 'body'; d.push([n + 'U', p, x, 0.46, z], [n + 'L', n + 'U', x, 0.24, z + (n[0] === 'f' ? 0.0 : -0.03)]); }
  return makeRig(d);
}
export function buildDog(o = {}) {
  const rig = dogRig(), g = new Geo(rig), col = o.col || [0.5, 0.3, 0.12], col2 = o.col2 || col.map((v) => Math.min(1, v * 1.8 + 0.1)), dark = o.dark || [0.03, 0.025, 0.02];
  const m = (c, t = S_HAIR, r = 0.75) => g.mat(c, r, 0, t, 0);
  // body: loft along z
  g.bone((x, y, z) => ['body', 'chest', z > 0.15 ? 1 : z < -0.05 ? 0 : (z + 0.05) / 0.2]); m(col);
  g.tr(0, 0.5, -0.36, PI / 2, 0, 0);
  g.loft([{ y: 0, rx: 0.06, rz: 0.06 }, { y: 0.06, rx: 0.12, rz: 0.12 }, { y: 0.25, rx: 0.135, rz: 0.13 }, { y: 0.48, rx: 0.15, rz: 0.15 }, { y: 0.66, rx: 0.14, rz: 0.15 }, { y: 0.74, rx: 0.08, rz: 0.1 }], { seg: 16, sub: 3, cap0: true, cap1: true });
  g.pop();
  m(col2); g.tr(0, 0.42, 0.18); g.sphere(0.1, 0.08, 0.12, 10, 6); g.pop();
  // neck + head
  g.bone((x, y, z) => ['neck', 'head', y > 0.72 ? 1 : 0]); m(col);
  g.tube([[0, 0.55, 0.28], [0, 0.66, 0.36], [0, 0.74, 0.41]], 0.085, { seg: 12, sub: 2 });
  g.bone('head'); m(col); g.tr(0, 0.79, 0.43); g.sphere(0.13, 0.12, 0.13, 14, 9); g.pop();
  m(col2); g.tr(0, 0.75, 0.54, 0.15, 0, 0); g.loft([{ y: -0.08, rx: 0.075, rz: 0.07 }, { y: 0.05, rx: 0.065, rz: 0.06 }, { y: 0.1, rx: 0.045, rz: 0.04 }].map((r) => r), { seg: 12, sub: 2, cap1: true }); g.pop();
  m(dark, S_SKIN, 0.3); g.tr(0, 0.78, 0.65); g.sphere(0.03, 0.025, 0.025, 8, 5); g.pop();
  m(dark, S_SKIN, 0.6); g.tube([[-0.04, 0.71, 0.6], [0, 0.705, 0.62], [0.04, 0.71, 0.6]], 0.006, { seg: 4, sub: 2 });
  for (const s of [1, -1]) {
    m([0.9, 0.88, 0.85], S_EYE, 0.3); g.tr(s * 0.06, 0.84, 0.53); g.sphere(0.022, 0.024, 0.014, 8, 5); g.pop();
    m(dark, S_EYE, 0.2); g.tr(s * 0.062, 0.84, 0.542); g.sphere(0.016, 0.018, 0.01, 8, 5); g.pop();
    m(col.map((v) => v * 0.7));
    if (o.ears === 'up') { g.tr(s * 0.08, 0.9, 0.42, 0, 0, -s * 0.25); g.lathe([[0.045, 0], [0.03, 0.06], [0.002, 0.12]], 7); g.pop(); }
    else g.tube([[s * 0.1, 0.89, 0.42], [s * 0.15, 0.84, 0.42], [s * 0.15, 0.74, 0.43]], (t) => 0.035 * (1 - 0.4 * t), { seg: 7, sub: 2, flatten: 0.45 });
  }
  if (o.goggles) { g.mat([0.08, 0.08, 0.08], 0.6, 0, S_RUBBER, 0); g.loft([{ y: 0.83, rx: 0.14, rz: 0.14, z: 0.44 }, { y: 0.86, rx: 0.14, rz: 0.14, z: 0.44 }], { seg: 16, sub: 1 }); g.mat(o.goggles, 0.1, 0, S_GLASS, 0); for (const s of [1, -1]) { g.tr(s * 0.06, 0.845, 0.555, PI / 2, 0, 0); g.lathe([[0.04, 0], [0.04, 0.02], [0, 0.022]], 12); g.pop(); } }
  if (o.collar) { g.bone('neck'); g.mat(o.collar, 0.6, 0, S_LEATHER, 0); g.tube(Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * TAU; return [Math.cos(a) * 0.09, 0.64 + Math.sin(a) * 0.035, 0.34 + Math.sin(a) * 0.075]; }), 0.016, { seg: 5, sub: 2 }); }
  if (o.vest) { g.bone((x, y, z) => ['body', 'chest', z > 0.15 ? 1 : 0]); g.mat(o.vest, 0.7, 0, S_CLOTH, 0); g.tr(0, 0.5, -0.12, PI / 2, 0, 0); g.loft([{ y: 0, rx: 0.16, rz: 0.16 }, { y: 0.3, rx: 0.165, rz: 0.165 }], { seg: 16, sub: 1, arc: [PI * 1.1, PI * 1.9], thick: 0.01 }); g.pop(); }
  // legs and paws
  for (const [n, x, z] of LEGS) {
    g.bone(jb(n + 'U', n + 'L', 0.24, 0.05)); m(col);
    g.tube([[x, 0.5, z], [x, 0.24, z], [x, 0.05, z + 0.01]], (t) => 0.055 - 0.02 * t, { seg: 10, sub: 2 });
    g.bone(n + 'L'); m(o.socks || col2); g.tr(x, 0.035, z + 0.03); g.sphere(0.045, 0.035, 0.06, 8, 5); g.pop();
  }
  g.bone((x, y, z) => ['tail1', 'tail2', z < -0.48 ? 1 : 0]); m(col);
  g.tube([[0, 0.56, -0.36], [0, 0.62, -0.44], [0, 0.7, -0.52]], (t) => 0.035 * (1 - 0.6 * t), { seg: 8, sub: 3 });
  const fig = toonify(new Figure(g, rig)); fig.mesh.scale.setScalar(o.size || 0.85);
  return fig;
}
export class DogAnim {
  constructor(fig) { this.f = fig; this.t = Math.random() * 9; this.ph = 0; this.mw = 0; const n = fig.rig.names; this.ix = {}; for (const k in n) this.ix[k] = n[k] * 3; this.sit = false; }
  update(dt, speed) {
    const f = this.f, E = f.euler, T = f.trans, ix = this.ix; E.fill(0); T.fill(0); this.t += dt; const t = this.t;
    this.mw = lerp(this.mw, Math.abs(speed) > 0.05 ? 1 : 0, 1 - Math.exp(-dt * 6)); const w = this.mw;
    this.ph += Math.abs(speed) * dt / 0.5 * PI; const ph = this.ph;
    E[ix.tail1] += -0.5; E[ix.tail1 + 1] += 0.5 * Math.sin(t * (6 + 4 * w)); E[ix.tail2 + 1] += 0.4 * Math.sin(t * (6 + 4 * w) - 0.8);
    E[ix.head + 1] += 0.25 * Math.sin(t * 0.5) * (1 - w); E[ix.head] += 0.05 * Math.sin(t * 1.7); E[ix.chest] += 0.02 * Math.sin(t * 3.2);
    for (const [n, x, z] of LEGS) { const s = (n === 'fl' || n === 'br') ? 1 : -1, a = Math.sin(ph + (n[0] === 'f' ? 0 : 0.3)) * s; E[ix[n + 'U']] += 0.55 * a * w; E[ix[n + 'L']] += (n[0] === 'f' ? -1 : 1) * 0.5 * Math.max(0, -a) * w; }
    T[ix.body + 1] += 0.02 * Math.abs(Math.sin(ph)) * w;
    if (this.sit && w < 0.5) { E[ix.body] += -0.55; T[ix.body + 1] -= 0.14; E[ix.blU] += -1.0; E[ix.brU] += -1.0; E[ix.blL] += 1.6; E[ix.brL] += 1.6; E[ix.flU] += 0.5; E[ix.frU] += 0.5; E[ix.neck] += 0.1; E[ix.tail1] += 0.6; }
    f.solve(); f.skin();
  }
}
