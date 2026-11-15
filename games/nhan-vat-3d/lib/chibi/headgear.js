// Headgear and face gear for the chibi head (hand-written). All pieces sit on the 'head' bone and are built from
// headShell (a shell that follows the head rings over a rim) plus Geo primitives. Builder signature: (c, o).
import { PI, TAU, lerp } from '../lf/util.js';
import { headShell, rimFn, headFrontZ, headPt, headRing, HZ, HEAD_TOP, EYE_Y } from './body.js';
import { S_CLOTH, S_PLASTIC, S_METAL, S_GLASS, S_RUBBER, S_GLOW, S_KNIT, S_CAMO, S_LEATHER, S_CHECK } from './mat.js';
import { mat, ty } from './wear.js';

const HG = {};
const disc = (g, y, r0, r1, o = {}) => g.loft([{ y, rx: r0, rz: r0 * (o.kz || 1) + (o.fz || 0), rb: r0 * (o.kb || o.kz || 1), z: HZ + (o.z || 0) }, { y: y - (o.drop || 0), rx: r1, rz: r1 * (o.kz || 1) + (o.fz || 0) * 1.5, rb: r1 * (o.kb || o.kz || 1), z: HZ + (o.z || 0) }], { seg: o.seg || 28, sub: 1, thick: o.thick || 0.01 });

// baseball cap: crown + front brim (o.back: worn backwards)
HG.cap = (c, o) => {
  const { g } = c; g.bone('head'); mat(c, o.col, ty(o));
  if (o.back) g.tr(0, 0, HZ * 2, 0, PI, 0);
  headShell(g, { rim: rimFn(2.02, 1.99, 1.96), grow: 0.022, nu: 26, nv: 7, thick: 0.008 });
  mat(c, o.brim || o.col, ty(o));
  const zf = headFrontZ(0, 2.02, 0.02);
  g.surf(10, 4, (u, v) => { const a = lerp(0.35, PI - 0.35, u), r = 0.16 + 0.11 * v; return [Math.cos(a) * r * (1 - 0.15 * v), 2.025 - 0.03 * v * v, zf - 0.09 + Math.sin(a) * r * 0.8]; }, { thick: 0.012 });
  if (o.logo) { mat(c, o.logo, S_CLOTH, 0); g.tr(0, 2.08, headFrontZ(0, 2.08, 0.026), -0.5, 0, 0); g.box(0.06, 0.04, 0.008, 4); g.pop(); }
  if (o.back) g.pop();
};
HG.beanie = (c, o) => {
  const { g } = c; g.bone('head'); mat(c, o.col, S_KNIT);
  headShell(g, { rim: rimFn(2.03, 1.98, 1.92), grow: 0.026, nu: 26, nv: 8, lift: 0, top: () => HEAD_TOP + (o.tall || 0.02), thick: 0.006 });
  mat(c, o.band || o.col, S_KNIT); headShell(g, { rim: rimFn(2.0, 1.95, 1.89), top: (a) => rimFn(2.07, 2.02, 1.96)(a), grow: 0.04, nu: 26, nv: 2, thick: 0.006 });
  if (o.pom) { mat(c, o.pom, S_KNIT); g.tr(0, HEAD_TOP + 0.05, HZ); g.sphere(0.05, 0.045, 0.05, 10, 6); g.pop(); }
};
HG.beret = (c, o) => {
  const { g } = c; g.bone('head'); mat(c, o.col, S_CLOTH);
  g.tr(o.side ? 0.04 : 0, 2.08, HZ - 0.01, -0.12, 0, o.side ? -0.25 : 0);
  g.loft([{ y: -0.04, rx: 0.165, rz: 0.17 }, { y: 0.0, rx: 0.2, rz: 0.2 }, { y: 0.06, rx: 0.2, rz: 0.19 }, { y: 0.1, rx: 0.12, rz: 0.12 }, { y: 0.11, rx: 0.0, rz: 0.0 }], { seg: 22, sub: 2 });
  g.pop();
};
// helmet family: o.kind = army | hard | fire | riot | bike | police | football | miner | ballistic
HG.helmet = (c, o) => {
  const { g } = c, k = o.kind || 'army'; g.bone('head'); mat(c, o.col, ty(o, S_PLASTIC));
  const gr = k === 'hard' ? 0.04 : k === 'fire' ? 0.045 : 0.036;
  const rim = k === 'hard' || k === 'police' ? rimFn(2.02, 1.99, 1.97) : k === 'army' ? rimFn(2.03, 1.94, 1.9) : k === 'football' || k === 'bike' || k === 'riot' ? rimFn(2.06, 1.82, 1.8) : rimFn(2.04, 1.92, 1.86);
  headShell(g, { rim, grow: gr, nu: 28, nv: 9, thick: 0.014, flare: k === 'army' ? 0.02 : 0.006, top: () => HEAD_TOP + gr + (k === 'hard' ? 0.03 : 0.01) });
  if (k === 'hard') { disc(g, 1.995, 0.2, 0.235, { kz: 1.08, fz: 0.04, thick: 0.012 }); g.tr(0, HEAD_TOP + 0.03, HZ); g.sphere(0.03, 0.05, 0.2, 8, 6); g.pop(); }
  if (k === 'fire') { g.surf(14, 4, (u, v) => { const a = lerp(-0.25, -PI + 0.25, u) , r = 0.2 + 0.1 * v; return [Math.cos(a) * r, 1.9 - 0.06 * v, HZ + Math.sin(a) * r * 1.1]; }, { thick: 0.012 }); disc(g, 1.995, 0.2, 0.22, { kz: 1.05, fz: 0.02 }); mat(c, o.badge || [0.9, 0.75, 0.2], S_METAL, 0); g.tr(0, 2.13, headFrontZ(0, 2.05, 0.06), -0.3, 0, 0); g.box(0.07, 0.09, 0.02, 4); g.pop(); }
  if (k === 'police') { mat(c, o.col, ty(o)); g.loft([{ y: 2.02, rx: 0.19, rz: 0.2, z: HZ }, { y: 2.14, rx: 0.215, rz: 0.23, z: HZ + 0.015 }, { y: 2.17, rx: 0.2, rz: 0.21, z: HZ + 0.015 }], { seg: 24, sub: 1, cap1: true, thick: 0.01 }); mat(c, o.brim || [0.02, 0.02, 0.025], S_PLASTIC, 0); g.surf(10, 3, (u, v) => { const a = lerp(0.4, PI - 0.4, u), r = 0.17 + 0.09 * v; return [Math.cos(a) * r, 2.02 - 0.03 * v, HZ + Math.sin(a) * r * 1.02]; }, { thick: 0.01 }); mat(c, o.badge || [0.9, 0.7, 0.2], S_METAL, 0); g.tr(0, 2.09, headFrontZ(0, 2.0, 0.07)); g.sphere(0.025, 0.03, 0.012, 8, 4); g.pop(); }
  if (k === 'riot' || k === 'bike' || k === 'ballistic') { mat(c, o.visor || [0.05, 0.06, 0.08], S_GLASS, 0); headShell(g, { arc: [0.45, PI - 0.45], rim: () => k === 'bike' ? 1.8 : 1.86, top: () => k === 'bike' ? 2.06 : 1.995, grow: gr + 0.03, nu: 14, nv: 4, thick: 0.006 }); }
  if (k === 'football') { mat(c, o.mask || [0.9, 0.9, 0.9], S_PLASTIC, 0); for (const y of [1.8, 1.86]) g.tube([-0.16, -0.08, 0, 0.08, 0.16].map((x) => [x, y, headFrontZ(x * 0.9, y, 0.07)]), 0.01, { seg: 5, sub: 3 }); for (const x of [-0.05, 0.05]) g.tube([[x, 1.78, headFrontZ(x, 1.78, 0.07)], [x, 1.92, headFrontZ(x, 1.92, 0.06)]], 0.01, { seg: 5, sub: 1 }); }
  if (k === 'miner') { mat(c, [0.15, 0.15, 0.16], S_METAL, 0); g.tr(0, 2.08, headFrontZ(0, 2.08, 0.05)); g.lathe([[0.04, -0.01], [0.04, 0.03], [0.0, 0.031]], 10); g.pop(); mat(c, [1, 0.9, 0.5], S_GLOW, 2); g.tr(0, 2.08, headFrontZ(0, 2.08, 0.05) + 0.032, PI / 2, 0, 0); g.sphere(0.03, 0.006, 0.03, 8, 4); g.pop(); }
  if (o.strap) { mat(c, [0.05, 0.05, 0.05], S_CLOTH, 0); for (const s of [1, -1]) g.tube([[s * 0.17, 1.95, HZ], [s * 0.15, 1.8, HZ + 0.06], [s * 0.06, 1.74, HZ + 0.1]], 0.008, { seg: 5, sub: 2 }); }
};
HG.chef = (c, o) => {
  const { g } = c; g.bone('head'); mat(c, o.col || [0.92, 0.92, 0.9], S_CLOTH, 0.05);
  g.loft([{ y: 1.99, rx: 0.185, rz: 0.19, z: HZ }, { y: 2.12, rx: 0.19, rz: 0.195, z: HZ }, { y: 2.16, rx: 0.2, rz: 0.2, z: HZ }], { seg: 24, sub: 1, thick: 0.008 });
  g.tr(0, 2.16 + (o.tall || 0.1), HZ); g.sphere(0.25, (o.tall || 0.1) + 0.05, 0.25, 18, 10); g.pop();
};
// brimmed hats: o.kind = bucket | bush | straw | fedora | cowboy
HG.hat = (c, o) => {
  const { g } = c, k = o.kind || 'bucket'; g.bone('head'); mat(c, o.col, ty(o, k === 'straw' ? S_KNIT : S_CLOTH));
  const crownH = k === 'fedora' ? 0.13 : k === 'bucket' ? 0.1 : 0.11, r0 = 0.19;
  g.loft([{ y: 1.99, rx: r0, rz: r0 + 0.01, z: HZ }, { y: 1.99 + crownH, rx: r0 * 0.9, rz: r0 * 0.92, z: HZ }, { y: 2.0 + crownH + 0.02, rx: r0 * 0.6, rz: r0 * 0.62, z: HZ, }, { y: 2.0 + crownH + 0.03, rx: 0.001, rz: 0.001, z: HZ }], { seg: 24, sub: 2, thick: 0.008 });
  const R = k === 'straw' || k === 'cowboy' ? 0.36 : k === 'bush' ? 0.31 : k === 'fedora' ? 0.29 : 0.27, drop = k === 'bucket' ? 0.07 : k === 'bush' ? 0.03 : k === 'fedora' ? -0.01 : 0.02;
  g.surf(30, 3, (u, v) => { const a = u * TAU, r = lerp(r0 - 0.005, R, v), up = k === 'cowboy' ? Math.abs(Math.cos(a)) * 0.07 * v * v : 0; return [Math.cos(a) * r, 1.995 - drop * v * v + up, HZ + Math.sin(a) * r]; }, { closeU: true, thick: 0.01 });
  if (o.band) { mat(c, o.band, S_CLOTH, 0); g.loft([{ y: 2.0, rx: r0 + 0.006, z: HZ }, { y: 2.04, rx: r0 * 0.98 + 0.004, z: HZ }], { seg: 24, sub: 1, thick: 0.004 }); }
};
HG.hood = (c, o) => { // hazmat / raincoat hood: covers head and neck, leaves the face (o.visor: glass plate over the face)
  const { g } = c; g.bone('head'); mat(c, o.col, ty(o, S_PLASTIC));
  headShell(g, { rim: rimFn(1.98, 1.72, 1.7, 1.2), grow: 0.04, nu: 28, nv: 9, thick: 0.012, puff: 0.012 });
  g.loft([{ y: 1.62, rx: 0.2, rz: 0.17, rb: 0.17, z: HZ - 0.02 }, { y: 1.76, rx: 0.19, rz: 0.17, rb: 0.2, z: HZ - 0.01 }], { seg: 20, sub: 1, thick: 0.01 });
  mat(c, o.rimCol || o.col.map((v) => v * 0.7), ty(o, S_PLASTIC)); g.tube(Array.from({ length: 17 }, (_, i) => { const a = lerp(0.15, PI - 0.15, i / 16), y = lerp(1.74, 1.98, Math.pow(Math.sin(a), 2)); return headPt(a, Math.min(y, 2.05), 0.045); }), 0.016, { seg: 6, sub: 2 });
  if (o.visor) { mat(c, o.visor, S_GLASS, 0); headShell(g, { arc: [0.25, PI - 0.25], rim: () => 1.76, top: () => 1.98, grow: 0.05, nu: 14, nv: 5, thick: 0.004 }); }
};
// respirator / gas mask on the face (o.kind: full | half). Filters: o.filters 1 (front) | 2 (sides)
HG.gasmask = (c, o) => {
  const { g } = c, k = o.kind || 'full'; g.bone('head'); mat(c, o.col || [0.12, 0.12, 0.13], S_RUBBER, 0);
  headShell(g, { arc: [0.2, PI - 0.2], rim: () => 1.75, top: () => k === 'full' ? 2.03 : 1.9, grow: 0.018, nu: 16, nv: 6, thick: 0.008 });
  const z = headFrontZ(0, 1.82, 0.02);
  g.tr(0, 1.82, z - 0.02, PI / 2 - 0.3, 0, 0); g.lathe([[0.08, 0], [0.075, 0.04], [0.05, 0.075], [0.0, 0.08]], 14); g.pop();
  mat(c, o.filter || [0.3, 0.3, 0.3], S_PLASTIC, 0);
  if ((o.filters || 1) === 1) { g.tr(0, 1.78, z + 0.06, PI / 2 - 0.5, 0, 0); g.lathe([[0.05, 0], [0.055, 0.02], [0.055, 0.07], [0.0, 0.072]], 14); g.pop(); }
  else for (const s of [1, -1]) { g.tr(s * 0.08, 1.8, z + 0.02, PI / 2 - 0.4, s * 0.8, 0); g.lathe([[0.045, 0], [0.05, 0.02], [0.05, 0.06], [0.0, 0.062]], 12); g.pop(); }
  if (k === 'full') { mat(c, o.lens || [0.12, 0.2, 0.22], S_GLASS, 0); for (const s of [1, -1]) { const zz = headFrontZ(s * 0.064, EYE_Y, 0.03); g.tr(s * 0.064, EYE_Y, zz - 0.012, PI / 2, s * 0.3, 0); g.lathe([[0.045, 0], [0.045, 0.02], [0.0, 0.022]], 14); g.pop(); } }
  if (o.redEyes) { mat(c, [1, 0.15, 0.1], S_GLOW, 1.2); for (const s of [1, -1]) { const zz = headFrontZ(s * 0.064, EYE_Y, 0.03); g.tr(s * 0.064, EYE_Y, zz + 0.012); g.sphere(0.02, 0.02, 0.004, 8, 4); g.pop(); } }
  mat(c, [0.05, 0.05, 0.05], S_RUBBER, 0); headShell(g, { rim: () => 1.97, top: () => 2.01, grow: 0.022, nu: 24, nv: 1, thick: 0.004 });
};
HG.mask = (c, o) => { // surgical / dust mask / bandana over mouth
  const { g } = c; g.bone('head'); mat(c, o.col || [0.55, 0.8, 0.85], S_CLOTH, 0);
  headShell(g, { arc: [0.35, PI - 0.35], rim: () => 1.77, top: () => 1.905, grow: 0.014, nu: 14, nv: 4, thick: 0.004, puff: 0.01 });
};
HG.bandana = (c, o) => { // tied round the forehead (o.full: covers the scalp)
  const { g } = c; g.bone('head'); mat(c, o.col, ty(o));
  if (o.full) headShell(g, { rim: rimFn(2.04, 1.98, 1.88), grow: 0.02, nu: 26, nv: 8, thick: 0.006 });
  else headShell(g, { rim: rimFn(2.02, 2.0, 1.97), top: (a) => rimFn(2.08, 2.05, 2.03)(a), grow: 0.02, nu: 26, nv: 2, thick: 0.006 });
  g.tr(0, 2.0, -0.2); g.sphere(0.04, 0.03, 0.03, 8, 5); g.pop(); g.tube([[0, 1.99, -0.2], [0.04, 1.9, -0.23]], 0.016, { seg: 5, sub: 1, flatten: 0.4 });
};
HG.headband = (c, o) => HG.bandana(c, o);
HG.goggles = (c, o) => { // o.up: pushed up on the forehead
  const { g } = c; g.bone('head'); const y = o.up ? 2.06 : EYE_Y + 0.004, gr = o.up ? 0.03 : 0.025;
  mat(c, o.strap || [0.05, 0.05, 0.05], S_RUBBER, 0); headShell(g, { rim: () => y - 0.02, top: () => y + 0.02, grow: gr - 0.006, nu: 24, nv: 1, thick: 0.004 });
  for (const s of [1, -1]) {
    const x = s * 0.066, z = headFrontZ(x, y, gr); mat(c, o.frame || [0.1, 0.1, 0.11], S_METAL, 0);
    g.tr(x, y, z - 0.01, PI / 2 - (o.up ? 0.6 : 0), s * 0.3, 0); g.lathe([[0.045, 0], [0.047, 0.028], [0.036, 0.034], [0.0, 0.034]], 14); g.pop();
    mat(c, o.lens || [0.25, 0.75, 0.9], S_GLASS, 0); g.tr(x, y, z - 0.01, PI / 2 - (o.up ? 0.6 : 0), s * 0.3, 0); g.tr(0, 0.035, 0); g.sphere(0.035, 0.006, 0.035, 12, 4); g.pop(); g.pop();
  }
};
HG.glasses = (c, o) => { // o.shades: dark lenses
  const { g } = c; g.bone('head'); const y = EYE_Y + 0.002;
  for (const s of [1, -1]) {
    const x = s * 0.066, z = headFrontZ(x, y, 0.016);
    mat(c, o.lens || (o.shades ? [0.04, 0.05, 0.08] : [0.75, 0.85, 0.9]), S_GLASS, 0); g.tr(x, y, z, 0, s * 0.3, 0); g.sphere(o.round ? 0.04 : 0.046, o.round ? 0.04 : 0.032, 0.006, 12, 4); g.pop();
    mat(c, o.frame || [0.08, 0.08, 0.09], S_PLASTIC, 0); g.tube([[x - s * 0.045, y + 0.01, z - 0.004], [s * 0.17, y + 0.01, HZ + 0.03], [s * 0.17, y - 0.02, HZ - 0.07]], 0.006, { seg: 4, sub: 2 });
  }
  mat(c, o.frame || [0.08, 0.08, 0.09], S_PLASTIC, 0); g.tube([[-0.02, y + 0.008, headFrontZ(0, y, 0.02)], [0.02, y + 0.008, headFrontZ(0, y, 0.02)]], 0.006, { seg: 4, sub: 1 });
};
HG.eyepatch = (c, o) => { const { g } = c; g.bone('head'); mat(c, [0.03, 0.03, 0.03], S_LEATHER, 0); const s = o.side || 1; g.tr(s * 0.064, EYE_Y, headFrontZ(s * 0.064, EYE_Y, 0.008), 0, s * 0.35, 0); g.sphere(0.04, 0.036, 0.008, 10, 4); g.pop(); headShell(g, { rim: rimFn(1.99, 1.96, 1.98), top: (a) => rimFn(2.0, 1.97, 1.99)(a), grow: 0.008, nu: 24, nv: 1 }); };
HG.welding = (c, o) => { // welding helmet: shield over the whole face, dark slot (o.glow: lit visor)
  const { g } = c; g.bone('head'); mat(c, o.col || [0.15, 0.15, 0.17], S_PLASTIC, 0);
  headShell(g, { rim: rimFn(1.74, 1.85, 2.0), grow: 0.05, nu: 26, nv: 9, thick: 0.012 });
  g.surf(10, 8, (u, v) => { const a = lerp(0.25, PI - 0.25, u), y = lerp(1.72, 2.12, v); const p = headPt(a, Math.min(y, 2.1), 0.07); p[2] += 0.02 * Math.sin(v * PI); return p; }, { thick: 0.012 });
  mat(c, o.visor || [0.08, 0.05, 0.12], o.glow ? S_GLOW : S_GLASS, o.glow ? 0.6 : 0); g.surf(6, 2, (u, v) => { const a = lerp(1.05, PI - 1.05, u), y = lerp(1.9, 1.97, v); return headPt(a, y, 0.088); }, { thick: 0.004 });
};
HG.balaclava = (c, o) => {
  const { g } = c; g.bone('head'); mat(c, o.col, S_KNIT);
  headShell(g, { rim: () => 1.75, grow: 0.016, nu: 28, nv: 10, thick: 0.006, arc: [PI / 2 + 0.55, PI / 2 + TAU - 0.55] });
  headShell(g, { arc: [0.3, PI - 0.3], rim: () => 1.75, top: () => 1.9, grow: 0.016, nu: 12, nv: 3 });
  headShell(g, { arc: [0.3, PI - 0.3], rim: () => 1.985, top: () => 2.17, grow: 0.016, nu: 12, nv: 4 });
};
HG.earmuffs = (c, o) => {
  const { g } = c; g.bone('head'); mat(c, o.col || [0.9, 0.45, 0.1], S_PLASTIC, 0);
  for (const s of [1, -1]) { g.tr(s * 0.185, 1.92, HZ - 0.01, 0, 0, s * PI / 2); g.lathe([[0.065, 0], [0.068, 0.03], [0.05, 0.055], [0.0, 0.058]], 14); g.pop(); }
  mat(c, o.band || [0.1, 0.1, 0.1], S_PLASTIC, 0); g.tube(Array.from({ length: 9 }, (_, i) => { const a = lerp(0.05, PI - 0.05, i / 8); return [Math.cos(a) * 0.2, 1.95 + Math.sin(a) * 0.24, HZ - 0.01]; }), 0.016, { seg: 6, sub: 2 });
};
HG.santa = (c, o) => {
  const { g } = c; g.bone('head'); mat(c, o.col || [0.75, 0.04, 0.04], S_CLOTH, 0);
  g.tube([[0, 2.03, HZ], [0, 2.2, HZ - 0.02], [0.05, 2.3, HZ - 0.08], [0.14, 2.26, HZ - 0.14]], (t) => 0.19 * (1 - t) + 0.01, { seg: 16, sub: 4 });
  mat(c, [0.95, 0.95, 0.95], S_KNIT, 0); headShell(g, { rim: rimFn(2.0, 1.97, 1.95), top: (a) => rimFn(2.07, 2.04, 2.02)(a), grow: 0.045, nu: 24, nv: 2, thick: 0.01 });
  g.tr(0.15, 2.24, HZ - 0.16); g.sphere(0.045, 0.045, 0.045, 8, 6); g.pop();
};
export const HEADGEAR = HG;
