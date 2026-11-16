// Each mech's own look: a fixed palette (no team colours on the body; the ground ring, HP bar and minimap carry the team)
// and a motif of ornaments drawn over its chassis: swept gold-edged blades for wings, horns, crests, tails and flame fans.
// Ornaments are placed from the bounds of the hull and turret batches the design has already filled, so one motif row
// fits any chassis without hand-measured anchors.
import * as THREE from '../../vendor/three.module.min.js';

// body: main paint, deep: shadow panels, trim: second paint, gold: blade edges and studs, glow: lamps, gems, flames.
// motif: ornament name → options. Order matters only for overlap (later pieces draw on top).
export const STYLES = {
  trau:     { body: 0x7a4a2e, deep: 0x2b1c14, trim: 0xc9a050, gold: 0xf2c85a, glow: 0xff9a30,
    motif: { horns: { len: 1.15, curl: 0.55, spread: 0.55 }, fan: { n: 2, len: 0.75, rise: 0.55 }, gems: {} } },
  soi:      { body: 0xe2401c, deep: 0x5a1208, trim: 0xffa628, gold: 0xffd060, glow: 0xffa020,
    motif: { wings: { n: 2, span: 0.85, sweep: 0.9, lift: 0.55 }, ears: { h: 0.85 }, fan: { n: 3, len: 1.25, rise: 0.75 }, gems: {} } },
  ung:      { body: 0x6a3ad8, deep: 0x22104a, trim: 0xece8f6, gold: 0xf0c040, glow: 0xc080ff,
    motif: { wings: { n: 2, span: 1.3, sweep: 1.0, lift: 0.18 }, crest: { n: 1, h: 0.45, len: 0.7 }, gems: {} } },
  hac:      { body: 0xeef2f6, deep: 0x2e5c6a, trim: 0x2fc0a0, gold: 0xe8b840, glow: 0x60fff0,
    motif: { wings: { n: 3, span: 1.15, sweep: 1.1, lift: 0.3 }, plume: { h: 0.75 }, gems: {} } },
  loi:      { body: 0xf2c21a, deep: 0x1c1c22, trim: 0x2c2c36, gold: 0xfff4c0, glow: 0x80d8ff,
    motif: { bolts: { n: 3, len: 0.9 }, crest: { n: 3, h: 0.4, len: 0.5 }, gems: {} } },
  bocap:    { body: 0x45204f, deep: 0x14081c, trim: 0xd03a8a, gold: 0xe8c050, glow: 0xff40c0,
    motif: { tail: { len: 1.5, curl: 1 }, claws: { len: 0.9 }, gems: {} } },
  bang:     { body: 0x7cc8f0, deep: 0x1a3a6a, trim: 0xf0faff, gold: 0xd8f4ff, glow: 0x9ff0ff,
    motif: { crystals: { n: 9, h: 0.75 }, wings: { n: 2, span: 0.9, sweep: 0.7, lift: 0.4 }, gems: {} } },
  tho:      { body: 0xd8742a, deep: 0x3a2418, trim: 0x8a949e, gold: 0xf0c050, glow: 0xffb040,
    motif: { crest: { n: 3, h: 0.5, len: 0.6 }, horns: { len: 0.7, curl: 0.3, spread: 0.7 }, gems: {} } },
  thancong: { body: 0x3e7a3a, deep: 0x14280f, trim: 0xd8b040, gold: 0xf2d060, glow: 0x9cff60,
    motif: { crest: { n: 5, h: 0.5, len: 0.6 }, spikes: { n: 5, h: 0.35 }, fan: { n: 2, len: 0.7, rise: 0.5 }, gems: {} } },
  mangxa:   { body: 0x1f6a40, deep: 0x0a1a12, trim: 0x15181c, gold: 0xe8c040, glow: 0xb0ff40,
    motif: { hood: { n: 7, r: 1.0 }, tail: { len: 1.1, curl: 0.4 }, gems: {} } },
  kimquy:   { body: 0xd8a82a, deep: 0x5a3a10, trim: 0x2aa080, gold: 0xfff0a0, glow: 0x60ffd0,
    motif: { shell: { n: 10 }, spikes: { n: 4, h: 0.3 }, gems: {} } },
  hacho:    { body: 0x26272e, deep: 0x0a0a0e, trim: 0xff6a1a, gold: 0xff9a3a, glow: 0xff5a10,
    motif: { claws: { len: 1.0 }, ears: { h: 0.45 }, fan: { n: 3, len: 0.85, rise: 0.6 }, gems: {} } },
  holy:     { body: 0xf06aa8, deep: 0x5a1a3a, trim: 0xfff0f6, gold: 0xf0c050, glow: 0xff80d0,
    motif: { tails: { n: 5, len: 1.1 }, ears: { h: 0.4 }, gems: {} } },
  domdom:   { body: 0xf0e040, deep: 0x2a4a1a, trim: 0x60d040, gold: 0xffffff, glow: 0xd8ff60,
    motif: { wings: { n: 2, span: 1.1, sweep: 0.5, lift: 0.6, glass: true }, wings2: { n: 2, span: 0.8, sweep: 0.9, lift: 0.5, glass: true }, gems: {} } },
  tacke:    { body: 0x2ab0a0, deep: 0x0a3a3a, trim: 0xb0e040, gold: 0xf0d050, glow: 0x60ffe0,
    motif: { spikes: { n: 6, h: 0.6 }, tail: { len: 1.1, curl: 0.15 }, claws: { len: 0.7 }, gems: {} } },
  hoalong:  { body: 0xd8241a, deep: 0x4a0808, trim: 0xf0a020, gold: 0xffd050, glow: 0xff7020,
    motif: { horns: { len: 0.95, curl: 0.8, spread: 0.4 }, wings: { n: 3, span: 1.4, sweep: 1.0, lift: 0.25 }, fan: { n: 3, len: 0.9, rise: 0.7 }, gems: {} } },
  titan:    { body: 0x8a1414, deep: 0x1a0606, trim: 0x2a2a30, gold: 0xe8b040, glow: 0xff3010,
    motif: { horns: { len: 1.4, curl: 0.6, spread: 0.5 }, crest: { n: 5, h: 0.6, len: 0.8 }, fan: { n: 3, len: 1.1, rise: 0.6 }, gems: {} } },
  // The 38 tanks of the owner's skill sheet (dtt-kits-SCOPE.md): a chassis borrowed from an existing design plus their own ornaments.
  khiphao: { chassis: 'bocap', body: 0x7a3fb0, deep: 0x3a1d59, trim: 0x4fd16a, gold: 0xf0c050, glow: 0xffde3a,
    motif: { ears: { h: 0.6 }, tail: { len: 1.2, curl: 0.9 }, gems: {} } },
  quancong: { chassis: 'hacho', body: 0x2f7d4a, deep: 0x173d24, trim: 0xc9322b, gold: 0xf0c050, glow: 0xffd34a,
    motif: { crest: { n: 1, h: 0.95, len: 0.9 }, wings: { n: 1, span: 1.2, sweep: 0.5, lift: 0.2 }, gems: {} } },
  natra: { chassis: 'bocap', body: 0xe8562e, deep: 0x7a2414, trim: 0xf2c94c, gold: 0xf0c050, glow: 0xff8a3a,
    motif: { cog: { r: 0.6 }, fan: { n: 3, len: 1.0, rise: 0.8 }, wings: { n: 1, span: 1.1, sweep: 1.2, lift: 0.4 }, gems: {} } },
  duongtien: { chassis: 'soi', body: 0xc8ccd6, deep: 0x4a5060, trim: 0xd9a63a, gold: 0xf0c050, glow: 0x6fe3ff,
    motif: { ears: { h: 0.7 }, crest: { n: 1, h: 0.6, len: 0.4 }, gems: {} } },
  athena: { chassis: 'kimquy', body: 0xe9e4d4, deep: 0x8a7b52, trim: 0xd4a937, gold: 0xf0c050, glow: 0x7fd8ff,
    motif: { plume: { h: 0.85 }, wings: { n: 2, span: 1.0, sweep: 0.8, lift: 0.3 }, gems: {} } },
  hades: { chassis: 'bang', body: 0x2b2540, deep: 0x120f1e, trim: 0x7a5cff, gold: 0xf0c050, glow: 0x39ffb0,
    motif: { crest: { n: 5, h: 0.6, len: 0.5 }, spikes: { n: 5, h: 0.4 }, tail: { len: 1.0, curl: 0.2 }, gems: {} } },
  lubo: { chassis: 'hacho', body: 0xb3262b, deep: 0x4d0f12, trim: 0xe6b84a, gold: 0xf0c050, glow: 0xff6a3a,
    motif: { crest: { n: 2, h: 1.1, len: 1.3 }, horns: { len: 0.6, curl: 0.4, spread: 0.6 }, gems: {} } },
  mucma: { chassis: 'bocap', body: 0x1d1d24, deep: 0x0b0b10, trim: 0xc2273a, gold: 0xf0c050, glow: 0xff3355,
    motif: { tails: { n: 4, len: 1.3 }, gems: {} } },
  kynhong: { chassis: 'hacho', body: 0xe2401c, deep: 0x6b1608, trim: 0xffd166, gold: 0xf0c050, glow: 0xffb02e,
    motif: { hood: { n: 7, r: 0.9 }, spikes: { n: 5, h: 0.45 }, tail: { len: 1.1, curl: 0.2 }, gems: {} } },
  nguma: { chassis: 'trau', body: 0x5a1e1e, deep: 0x240b0b, trim: 0xd98a2b, gold: 0xf0c050, glow: 0xff4a1a,
    motif: { horns: { len: 1.4, curl: 0.7, spread: 0.6 }, fan: { n: 2, len: 0.9, rise: 0.6 }, gems: {} } },
  sontinh: { chassis: 'trau', body: 0x6b7a3a, deep: 0x2f3818, trim: 0xb89a63, gold: 0xf0c050, glow: 0x9cff6a,
    motif: { crystals: { n: 8, h: 0.8 }, spikes: { n: 3, h: 0.6 }, gems: {} } },
  enbac: { chassis: 'soi', body: 0x8a96a8, deep: 0x2b3240, trim: 0xc7472e, gold: 0xf0c050, glow: 0x5fd0ff,
    motif: { wings: { n: 2, span: 1.4, sweep: 1.4, lift: 0.2 }, fan: { n: 2, len: 0.7, rise: 0.4 }, gems: {} } },
  boica: { chassis: 'ung', body: 0x2f7fa6, deep: 0x133447, trim: 0xe8913a, gold: 0xf0c050, glow: 0xb8f2ff,
    motif: { plume: { h: 0.7 }, wings: { n: 2, span: 1.1, sweep: 0.9, lift: 0.25 }, gems: {} } },
  bohung: { chassis: 'trau', body: 0x3c3f8f, deep: 0x171940, trim: 0xc9a43a, gold: 0xf0c050, glow: 0x5ab8ff,
    motif: { horns: { len: 1.0, curl: 0.2, spread: 0.15 }, shell: { n: 8 }, gems: {} } },
  cakiem: { chassis: 'hacho', body: 0x2e6b4f, deep: 0x12301f, trim: 0xd8d8d8, gold: 0xf0c050, glow: 0x8affc8,
    motif: { crest: { n: 1, h: 0.85, len: 1.1 }, claws: { len: 1.1 }, gems: {} } },
  gilgamesh: { chassis: 'trau', body: 0xd9b23a, deep: 0x6b5110, trim: 0xc23a2a, gold: 0xf0c050, glow: 0xffe680,
    motif: { hood: { n: 9, r: 1.0 }, spikes: { n: 4, h: 0.35 }, gems: {} } },
  buomdem: { chassis: 'holy', body: 0x5a2a8a, deep: 0x241040, trim: 0xe07a2a, gold: 0xf0c050, glow: 0x7affd6,
    motif: { wings: { n: 1, span: 1.4, sweep: 0.4, lift: 0.5 }, wings2: { n: 1, span: 1.0, sweep: 1.0, lift: 0.4 }, ears: { h: 0.5 }, gems: {} } },
  laclong: { chassis: 'trau', body: 0x1f6f8f, deep: 0x0b2d3d, trim: 0xd9b23a, gold: 0xf0c050, glow: 0x6ff0ff,
    motif: { horns: { len: 1.0, curl: 1.0, spread: 0.45 }, wings: { n: 2, span: 1.0, sweep: 1.0, lift: 0.3 }, tail: { len: 1.2, curl: 0.3 }, gems: {} } },
  baogam: { chassis: 'bocap', body: 0x23262e, deep: 0x0c0d11, trim: 0x7b5cff, gold: 0xf0c050, glow: 0xb48cff,
    motif: { ears: { h: 0.5 }, claws: { len: 0.9 }, tail: { len: 1.2, curl: 0.5 }, gems: {} } },
  luondien: { chassis: 'soi', body: 0x1d4f6b, deep: 0x0a2030, trim: 0xf2e03a, gold: 0xf0c050, glow: 0x7af7ff,
    motif: { bolts: { n: 3, len: 0.9 }, crest: { n: 3, h: 0.45, len: 0.8 }, tail: { len: 1.1, curl: 0.2 }, gems: {} } },
  tegiac: { chassis: 'trau', body: 0xe8e2d0, deep: 0x8a2a22, trim: 0xf2c230, gold: 0xf0c050, glow: 0xfff3b0,
    motif: { horns: { len: 0.9, curl: 0.1, spread: 0.1 }, claws: { len: 0.8 }, gems: {} } },
  quaset: { chassis: 'bocap', body: 0x2a2350, deep: 0x100c22, trim: 0x8a6bff, gold: 0xf0c050, glow: 0x9fd8ff,
    motif: { wings: { n: 3, span: 1.3, sweep: 1.0, lift: 0.3 }, crest: { n: 1, h: 0.6, len: 0.9 }, gems: {} } },
  tumay: { chassis: 'bang', body: 0x3a3550, deep: 0x16131f, trim: 0x9aa3b8, gold: 0xf0c050, glow: 0xc07aff,
    motif: { hood: { n: 7, r: 0.85 }, plume: { h: 0.6 }, gems: {} } },
  dieuthuyen: { chassis: 'holy', body: 0xf0e6f2, deep: 0x6d5a8a, trim: 0xff8fb8, gold: 0xf0c050, glow: 0xa8e6ff,
    motif: { wings: { n: 2, span: 1.1, sweep: 0.6, lift: 0.5, glass: true }, plume: { h: 0.7 }, gems: {} } },
  thuytinh: { chassis: 'bang', body: 0x2a7fbf, deep: 0x0f3355, trim: 0xe6f2ff, gold: 0xf0c050, glow: 0x4ff0e0,
    motif: { fan: { n: 3, len: 1.1, rise: 0.9 }, crest: { n: 3, h: 0.5, len: 0.6 }, gems: {} } },
  samthep: { chassis: 'tho', body: 0x8a2a3a, deep: 0x3a0f18, trim: 0xb7bcc6, gold: 0xf0c050, glow: 0xc07aff,
    motif: { shell: { n: 8 }, tail: { len: 1.2, curl: 0.2 }, horns: { len: 0.7, curl: 0.9, spread: 0.3 }, gems: {} } },
  cuuvi: { chassis: 'holy', body: 0xf2f0ea, deep: 0x8a3a20, trim: 0xff7a2a, gold: 0xf0c050, glow: 0xff3b6b,
    motif: { tails: { n: 9, len: 1.15 }, gems: {} } },
  kiemthan: { chassis: 'hacho', body: 0xcfd6e0, deep: 0x3e4656, trim: 0x4fb6ff, gold: 0xf0c050, glow: 0xd8f4ff,
    motif: { shell: { n: 8 }, crest: { n: 1, h: 0.8, len: 0.5 }, gems: {} } },
  suatrang: { chassis: 'domdom', body: 0xf4f6f8, deep: 0x9aa6b4, trim: 0xe04a4a, gold: 0xf0c050, glow: 0x9ff2ff,
    motif: { tails: { n: 6, len: 0.9 }, gems: {} } },
  khidot: { chassis: 'trau', body: 0x3f7d2f, deep: 0x1a3a12, trim: 0x8a5a2a, gold: 0xf0c050, glow: 0xb0ff5a,
    motif: { spikes: { n: 4, h: 0.4 }, claws: { len: 1.0 }, gems: {} } },
  retdo: { chassis: 'hacho', body: 0xb0202a, deep: 0x2a0a0e, trim: 0x1e1e22, gold: 0xf0c050, glow: 0xff5a5a,
    motif: { tail: { len: 1.3, curl: 0.8 }, claws: { len: 0.9 }, spikes: { n: 6, h: 0.35 }, gems: {} } },
  nhenthep: { chassis: 'bocap', body: 0x4a4f58, deep: 0x1a1c21, trim: 0xc94a3a, gold: 0xf0c050, glow: 0xd0e4ff,
    motif: { claws: { len: 1.0 }, crest: { n: 1, h: 0.5, len: 0.7 }, gems: {} } },
  taothao: { chassis: 'hacho', body: 0x2a2a3a, deep: 0x101018, trim: 0xc9a23a, gold: 0xf0c050, glow: 0xff4a4a,
    motif: { crest: { n: 3, h: 0.6, len: 0.5 }, wings: { n: 2, span: 1.1, sweep: 1.2, lift: 0.4 }, fan: { n: 2, len: 0.7, rise: 0.5 }, gems: {} } },
  bongua: { chassis: 'bocap', body: 0x1e2a22, deep: 0x0b120d, trim: 0x7ad94a, gold: 0xf0c050, glow: 0xc8ff7a,
    motif: { claws: { len: 1.2 }, wings: { n: 1, span: 1.0, sweep: 1.1, lift: 0.4, glass: true }, gems: {} } },
  moclan: { chassis: 'soi', body: 0xc23a4a, deep: 0x4a1018, trim: 0xf2d06a, gold: 0xf0c050, glow: 0xff9ad0,
    motif: { plume: { h: 0.75 }, fan: { n: 2, len: 1.0, rise: 0.5 }, gems: {} } },
  anduong: { chassis: 'ung', body: 0x8a6a2a, deep: 0x3a2a10, trim: 0x3a8a5a, gold: 0xf0c050, glow: 0xffd84a,
    motif: { shell: { n: 10 }, crest: { n: 1, h: 0.5, len: 0.6 }, gems: {} } },
  chuottui: { chassis: 'hac', body: 0xc98a4a, deep: 0x6a3f1a, trim: 0xf2e6d0, gold: 0xf0c050, glow: 0x5fe0ff,
    motif: { ears: { h: 0.95 }, tail: { len: 1.2, curl: 0.1 }, gems: {} } },
  vesau: { chassis: 'hac', body: 0x3a1a2a, deep: 0x12060c, trim: 0xd93a4a, gold: 0xf0c050, glow: 0xffd06a,
    motif: { wings: { n: 1, span: 1.2, sweep: 1.0, lift: 0.4, glass: true }, wings2: { n: 1, span: 0.9, sweep: 1.3, lift: 0.3, glass: true }, crest: { n: 1, h: 0.4, len: 0.4 }, gems: {} } },
};

// A mech with no row (a new key) still gets a look of its own, built from its shop tint.
export function styleFor(key, tint) {
  if (STYLES[key]) return STYLES[key];
  const c = new THREE.Color(tint || 0x8899aa);
  return { body: c.getHex(), deep: c.clone().lerp(new THREE.Color(0x101014), 0.7).getHex(), trim: 0xdfe6ee, gold: 0xf0c050, glow: c.clone().lerp(new THREE.Color(1, 1, 1), 0.3).getHex(), motif: { fan: { n: 2, len: 0.7, rise: 0.6 }, gems: {} } };
}

// Bounds of a batch from vertex quantiles, so antennas, rods and lamps sticking out do not stretch the box.
function bounds(b, name) {
  const p = b.batches[name] && b.batches[name].p;
  if (!p || !p.length) return null;
  const xs = [], ys = [], zs = [];
  for (let i = 0; i < p.length; i += 3) { xs.push(p[i]); ys.push(p[i + 1]); zs.push(p[i + 2]); }
  const q = (a, t) => a[Math.min(a.length - 1, Math.floor(t * a.length))];
  xs.sort((a, c) => a - c); ys.sort((a, c) => a - c); zs.sort((a, c) => a - c);
  const r = { x0: q(xs, 0.03), x1: q(xs, 0.97), y0: q(ys, 0.03), y1: q(ys, 0.92), z0: q(zs, 0.03), z1: q(zs, 0.97) };
  r.zh = Math.max(-r.z0, r.z1); r.len = r.x1 - r.x0; r.cx = (r.x0 + r.x1) / 2;
  return r;
}

// Outline of a tapered blade along a quadratic curve p0 → p1 → p2 in a 2D plane: full width w at the root, sharp tip.
function bladeOutline(p0, p1, p2, w, n = 9) {
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), m = 2 * (1 - t) * t, c = t * t;
    const x = a * p0[0] + m * p1[0] + c * p2[0], y = a * p0[1] + m * p1[1] + c * p2[1];
    const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const d = Math.hypot(dx, dy) || 1, hw = w * 0.5 * Math.pow(1 - t, 0.85) * (1 + 0.35 * Math.sin(t * Math.PI));
    L.push([x - dy / d * hw, y + dx / d * hw]); R.push([x + dy / d * hw, y - dx / d * hw]);
  }
  return L.concat(R.reverse().slice(1));
}
const shrink = (p0, p1, p2) => [p0, [p1[0] * 0.97, p1[1] * 0.97], [p2[0] * 0.9, p2[1] * 0.9]];

export function adorn(h, b, key, P) {
  const { sk, lit, side } = h;
  const H = bounds(b, 'hull'), T = bounds(b, 'turret') || H;
  if (!H) return;
  const gold = new THREE.Color(P.gold), body = new THREE.Color(P.body), deep = new THREE.Color(P.deep), trim = new THREE.Color(P.trim);
  const gloss = (c) => { b.surface(0.35, 1.5); b.tint(c); };
  const S = Math.max(0.7, Math.min(1.4, H.len / 2.4));

  // Lying blade (XZ plane, seen from above): gold underlay, painted top inset from the edge.
  const flat = (p0, p1, p2, w, t, col) => {
    gloss(gold); b.prism(bladeOutline(p0, p1, p2, w), 0, t, t * 0.3);
    gloss(col); b.prism(bladeOutline(...shrink(p0, p1, p2), w * 0.62), t * 0.5, t * 1.7, t * 0.4);
  };
  // Standing blade (XY plane): gold core, painted cheeks on both faces leave a gold rim on the outline.
  const stand = (p0, p1, p2, w, t, col) => {
    gloss(gold); side(b, bladeOutline(p0, p1, p2, w), -t / 2, t / 2, t * 0.2);
    gloss(col); side(b, bladeOutline(...shrink(p0, p1, p2), w * 0.62), -t * 1.1, t * 1.1, t * 0.3);
  };

  const M = P.motif || {};
  b.use('hull');
  for (const wk of ['wings', 'wings2']) {
    const o = M[wk]; if (!o) continue;
    const at = wk === 'wings' ? 0.55 : 0.25;
    for (const s of [-1, 1]) for (let i = 0; i < o.n; i++) {
      const k = 1 - i * 0.22, span = o.span * S * k, sw = o.sweep * S * (0.8 + i * 0.25);
      b.push().move(H.x0 + H.len * (at - i * 0.12), H.y0 + (H.y1 - H.y0) * 0.62 + i * 0.03, s * H.zh * 0.55).rotX(-s * o.lift);
      const col = o.glass ? trim : i % 2 ? trim : body;
      if (o.glass) { gloss(gold); b.prism(bladeOutline([0, 0], [-sw * 0.2, s * span * 0.7], [-sw, s * span], 0.42 * S * k), 0, 0.03, 0.01); lit(b, () => b.prism(bladeOutline([0, 0], [-sw * 0.18, s * span * 0.64], [-sw * 0.85, s * span * 0.88], 0.24 * S * k), 0.02, 0.05, 0)); }
      else flat([0, 0], [-sw * 0.15, s * span * 0.8], [-sw, s * span], 0.95 * S * k, 0.07, col);
      b.pop();
    }
  }
  if (M.fan) {
    const o = M.fan;
    for (const s of [-1, 1]) for (let i = 0; i < o.n; i++) {
      const len = o.len * S * (1 - i * 0.2);
      b.push().move(H.x0 + 0.15 * S, H.y0 + (H.y1 - H.y0) * 0.75, s * H.zh * (0.5 - i * 0.12)).rotY(s * (0.35 + i * 0.32));
      stand([0, 0], [-len * 0.55, len * 0.12], [-len, len * o.rise], 0.62 * S * (1 - i * 0.15), 0.07, i % 2 ? trim : body);
      b.pop();
    }
  }
  if (M.claws) {
    const o = M.claws;
    for (const s of [-1, 1]) {
      b.push().move(H.x1 - 0.2 * S, H.y0 + (H.y1 - H.y0) * 0.5, s * H.zh * 0.85);
      flat([0, 0], [o.len * S * 0.6, s * 0.3 * S], [o.len * S, -s * o.len * S * 0.3], 0.6 * S, 0.08, trim);
      b.pop();
    }
  }
  if (M.tail) {
    const o = M.tail, L = o.len * S;
    b.push().move(H.x0 + 0.1 * S, H.y0 + (H.y1 - H.y0) * 0.8, 0);
    stand([0, 0], [-L * 0.7, L * 0.25 + L * 0.5 * o.curl], [-L * (1 - 0.65 * o.curl), L * (0.35 + 0.75 * o.curl)], 0.6 * S, 0.1, body);
    lit(b, () => b.push().move(-L * (1 - 0.65 * o.curl), L * (0.35 + 0.75 * o.curl), 0).ball(0.09 * S, 1).pop());
    b.pop();
  }
  if (M.tails) {
    const o = M.tails, L = o.len * S;
    for (let i = 0; i < o.n; i++) {
      const a = (i - (o.n - 1) / 2) * 0.32;
      b.push().move(H.x0 + 0.2 * S, H.y0 + (H.y1 - H.y0) * 0.8 + i * 0.02, 0).rotY(a).rotZ(-0.35);
      flat([0, 0], [-L * 0.6, Math.sign(a) * L * 0.12], [-L, -Math.sign(a) * L * 0.1], 0.55 * S, 0.06, i % 2 ? trim : body);
      b.pop();
    }
  }
  if (M.spikes) {
    const o = M.spikes;
    gloss(gold);
    for (let i = 0; i < o.n; i++) {
      const x = H.x0 + H.len * (0.15 + 0.7 * i / Math.max(1, o.n - 1)), hh = o.h * S * (0.7 + 0.3 * Math.sin(i / Math.max(1, o.n - 1) * Math.PI));
      b.push().move(x, H.y1 + hh * 0.35, 0).rotZ(0.45).cyl(0, 0.09 * S, hh, 4).pop();
    }
  }
  if (M.crystals) {
    const o = M.crystals;
    for (let i = 0; i < o.n; i++) {
      const a = i * 2.4, r = 0.35 + 0.55 * ((i * 37) % 10) / 10, hh = o.h * S * (0.5 + 0.5 * ((i * 53) % 10) / 10);
      const x = H.cx + Math.cos(a) * H.len * 0.38 * r, z = Math.sin(a) * H.zh * 0.85 * r;
      b.push().move(x, H.y1 * 0.85, z).rotZ(Math.cos(a) * -0.5).rotX(Math.sin(a) * 0.5);
      b.surface(0.15, 0.4); b.tint(i % 3 ? trim : body); b.cyl(0, 0.1 * S, hh, 6);
      b.pop();
    }
  }
  if (M.shell) {
    const o = M.shell;
    for (let i = 0; i < o.n; i++) {
      const a = i / o.n * Math.PI * 2;
      b.push().move(H.cx + Math.cos(a) * H.len * 0.42, H.y0 + (H.y1 - H.y0) * 0.55, Math.sin(a) * H.zh * 0.9).rotY(-a);
      flat([0, 0], [0.25 * S, 0.06 * S], [0.55 * S, 0], 0.6 * S, 0.08, i % 2 ? trim : body);
      b.pop();
    }
  }
  if (M.bolts) {
    const o = M.bolts;
    for (const s of [-1, 1]) for (let i = 0; i < o.n; i++) {
      const L = o.len * S * (1 - i * 0.2);
      b.push().move(H.x0 + H.len * (0.7 - i * 0.22), H.y0 + (H.y1 - H.y0) * 0.6, s * H.zh * 0.8);
      gloss(gold); b.prism([[0, 0], [-0.1 * S, s * L * 0.45], [0.08 * S, s * L * 0.42], [-0.12 * S, s * L], [0.14 * S, s * L * 0.38], [-0.03 * S, s * L * 0.42], [0.12, 0]].map((p) => [p[0], p[1]]), 0, 0.07, 0.015);
      b.pop();
    }
  }
  if (M.cog) {
    const o = M.cog, r = o.r * S;
    b.push().move(H.x0 + H.len * 0.3, H.y1 + 0.02, 0);
    gloss(gold); b.cyl(r, r, 0.06, 12);
    for (let i = 0; i < 10; i++) b.push().rotY(i / 10 * Math.PI * 2).move(r, 0, 0).box(0.16 * S, 0.06, 0.12 * S).pop();
    gloss(deep); b.push().move(0, 0.04, 0).cyl(r * 0.55, r * 0.55, 0.04, 10).pop();
    b.pop();
  }

  b.use('turret');
  const tTop = T.y1, tFront = T.x1;
  if (M.horns) {
    const o = M.horns, L = o.len * S;
    for (const s of [-1, 1]) {
      b.push().move(T.x0 + (T.x1 - T.x0) * 0.6, tTop - 0.08, s * T.zh * 0.6).rotY(-s * o.spread);
      stand([0, 0], [L * 0.15, L * 0.6], [L * (0.3 + o.curl * 0.5), L * 0.75], 0.5 * S, 0.09, trim);
      b.pop();
    }
  }
  if (M.ears) {
    const o = M.ears;
    for (const s of [-1, 1]) {
      b.push().move(T.x0 + (T.x1 - T.x0) * 0.4, tTop - 0.05, s * T.zh * 0.5).rotY(-s * 0.3).rotX(-s * 0.25);
      stand([0, 0], [-0.08 * S, o.h * S * 0.6], [-0.22 * S, o.h * S], 0.55 * S, 0.08, body);
      b.pop();
    }
  }
  if (M.crest) {
    const o = M.crest;
    for (let i = 0; i < o.n; i++) {
      const z = (i - (o.n - 1) / 2) * 0.12 * S, k = 1 - Math.abs(i - (o.n - 1) / 2) * 0.18;
      b.push().move(T.cx + (T.x1 - T.x0) * 0.05, tTop - 0.04, z).rotX(z * 1.6);
      stand([0, 0], [-o.len * S * 0.3, o.h * S * 0.8 * k], [-o.len * S * k, o.h * S * k], 0.48 * S, 0.07, i % 2 ? body : trim);
      b.pop();
    }
  }
  if (M.plume) {
    const o = M.plume;
    for (let i = 0; i < 3; i++) {
      b.push().move(T.cx, tTop - 0.04, 0).rotX((i - 1) * 0.35);
      stand([0, 0], [-0.25 * S, o.h * S * 0.9], [-0.7 * S, o.h * S * (1 - Math.abs(i - 1) * 0.25)], 0.36 * S, 0.06, i === 1 ? trim : body);
      b.pop();
    }
  }
  if (M.hood) {
    const o = M.hood, r = o.r * S;
    b.push().move(T.x0 + 0.05 * S, tTop - 0.15, 0).rotY(Math.PI / 2).rotX(0);
    for (let i = 0; i < o.n; i++) {
      const a = (i - (o.n - 1) / 2) / ((o.n - 1) / 2) * 1.25;
      b.push().rotZ(-a);
      stand([0, 0], [0.1 * S, r * 0.55], [0, r * (1 - Math.abs(a) * 0.2)], 0.46 * S, 0.07, i % 2 ? trim : body);
      b.pop();
    }
    b.pop();
  }
  if (M.gems) {
    lit(b, () => {
      for (const s of [-1, 1]) b.push().move(tFront - 0.12 * S, tTop - 0.06, s * Math.min(0.22, T.zh * 0.35)).ball(0.065 * S, 1).pop();
      b.push().move(T.cx - (T.x1 - T.x0) * 0.1, tTop + 0.02, 0).scale(1, 0.6, 1).ball(0.1 * S, 1).pop();
    });
    gloss(gold);
    for (const s of [-1, 1]) b.push().move(tFront - 0.12 * S, tTop - 0.09, s * Math.min(0.22, T.zh * 0.35)).cyl(0.09 * S, 0.1 * S, 0.04, 8).pop();
    b.push().move(T.cx - (T.x1 - T.x0) * 0.1, tTop - 0.01, 0).cyl(0.14 * S, 0.15 * S, 0.04, 10).pop();
  }
}
