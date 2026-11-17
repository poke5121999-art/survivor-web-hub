// Each mech's own look: a fixed palette (no team colours on the body; the ground ring, HP bar and minimap carry the team)
// and hard-surface hardware bolted onto its chassis that grows with its form, after the owner's form 1/2/3 concept:
// a clean tank, then add-on armour, then a heavy sci-fi refit with weapon pods and lit strips.
// Hardware is placed from the bounds of the hull and turret batches the design has already filled, so one kit fits
// any chassis without hand-measured anchors.
import * as THREE from '../../vendor/three.module.min.js';
import { UPGRADE, MECHS, BOSSES } from '../data.js';

// Three forms per mech, reached by total garage level at the second and third perk milestones (12 and 18 of 25).
export const FORM_AT = [UPGRADE.perkAt[1], UPGRADE.perkAt[2]];
// Whole-model scale per form; the sim radius does not change, only the look.
export const FORM_SCALE = [0.85, 1, 1.22];
// Body paint per form: I is a matte, greyed prototype coat, III a deeper, brighter one.
export function formPaint(hex, form) {
  const c = new THREE.Color(hex);
  if (form === 1) return c.lerp(new THREE.Color(0x8a9099), 0.35);
  if (form === 3) return c.offsetHSL(0, 0.08, 0.03);
  return c;
}
export function formOf(lv) {
  if (!Array.isArray(lv)) return 1;
  const n = lv.reduce((a, b) => a + (Number(b) || 0), 0);
  return n >= FORM_AT[1] ? 3 : n >= FORM_AT[0] ? 2 : 1;
}

// body: main paint, deep: shadow panels, trim: second paint, glow: lamps and lit strips.
// chassis: for keys with no design of their own, the design whose model they borrow.
// frame: a generated model of its own (frames.js), used instead of the chassis when present.
export const STYLES = {
  trau: { body: 0x7a4a2e, deep: 0x2b1c14, trim: 0xc9a050, glow: 0xff9a30 },
  soi: { body: 0xe2401c, deep: 0x5a1208, trim: 0xffa628, glow: 0xffa020 },
  ung: { body: 0x6a3ad8, deep: 0x22104a, trim: 0xece8f6, glow: 0xc080ff },
  hac: { body: 0xeef2f6, deep: 0x2e5c6a, trim: 0x2fc0a0, glow: 0x60fff0 },
  loi: { body: 0xf2c21a, deep: 0x1c1c22, trim: 0x2c2c36, glow: 0x80d8ff },
  bocap: { body: 0x45204f, deep: 0x14081c, trim: 0xd03a8a, glow: 0xff40c0 },
  bang: { body: 0x7cc8f0, deep: 0x1a3a6a, trim: 0xf0faff, glow: 0x9ff0ff },
  tho: { body: 0xd8742a, deep: 0x3a2418, trim: 0x8a949e, glow: 0xffb040 },
  thancong: { body: 0x3e7a3a, deep: 0x14280f, trim: 0xd8b040, glow: 0x9cff60 },
  mangxa: { body: 0x1f6a40, deep: 0x0a1a12, trim: 0x15181c, glow: 0xb0ff40 },
  kimquy: { body: 0xd8a82a, deep: 0x5a3a10, trim: 0x2aa080, glow: 0x60ffd0 },
  hacho: { body: 0x26272e, deep: 0x0a0a0e, trim: 0xff6a1a, glow: 0xff5a10 },
  holy: { body: 0xf06aa8, deep: 0x5a1a3a, trim: 0xfff0f6, glow: 0xff80d0 },
  domdom: { body: 0xf0e040, deep: 0x2a4a1a, trim: 0x60d040, glow: 0xd8ff60 },
  tacke: { body: 0x2ab0a0, deep: 0x0a3a3a, trim: 0xb0e040, glow: 0x60ffe0 },
  hoalong: { body: 0xd8241a, deep: 0x4a0808, trim: 0xf0a020, glow: 0xff7020 },
  titan: { body: 0x8a1414, deep: 0x1a0606, trim: 0x2a2a30, glow: 0xff3010 },
  // The 38 tanks of the owner's skill sheet (dtt-kits-SCOPE.md).
  khiphao: { chassis: 'bocap', frame: { hull: 'pod', hullL: 1.9, hullW: 1.15, hullH: 0.42, move: 'wheels4', wheelR: 0.34, turret: 'dome', turretS: 0.9, gun: 'launcher', gunL: 0.55, sig: ['monkey', 'crackers', ['tail', { len: 0.6, up: 0.6, curl: 0.4, r: 0.11 }]] },
    body: 0x7a3fb0, deep: 0x3a1d59, trim: 0x4fd16a, glow: 0xffde3a },
  quancong: { chassis: 'hacho', frame: { hull: 'long', hullL: 2.7, hullW: 1.0, hullH: 0.5, nose: 0.4, move: 'tracks', trackW: 0.3, turret: 'tower', turretS: 0.95, gun: 'twin', gunL: 1.0, sig: ['glaive', 'crest'] },
    body: 0x2f7d4a, deep: 0x173d24, trim: 0xc9322b, glow: 0xffd34a },
  natra: { chassis: 'bocap', frame: { hull: 'wedge', hullL: 1.8, hullW: 0.8, hullH: 0.36, nose: 0.3, move: 'wheels4', wheelR: 0.42, wheelSpan: 1.3, wheelRing: true, turret: 'none', gun: 'lance', gunL: 1.3, sig: ['ring'] },
    body: 0xe8562e, deep: 0x7a2414, trim: 0xf2c94c, glow: 0xff8a3a },
  duongtien: { chassis: 'soi', frame: { hull: 'block', hullL: 1.2, hullW: 0.8, hullH: 0.42, move: 'legs2', turret: 'wedge', turretS: 0.85, gun: 'trident', gunL: 1.1, sig: ['eye', 'ears'] },
    body: 0xc8ccd6, deep: 0x4a5060, trim: 0xd9a63a, glow: 0x6fe3ff },
  athena: { chassis: 'kimquy', frame: { hull: 'hex', hullL: 2.4, hullW: 1.3, hullH: 0.5, move: 'tracks', turret: 'dome', gun: 'lance', gunL: 1.4, sig: ['shield', 'owl'] },
    body: 0xe9e4d4, deep: 0x8a7b52, trim: 0xd4a937, glow: 0x7fd8ff },
  hades: { chassis: 'bang', frame: { hull: 'wide', hullL: 2.2, hullW: 1.7, hullH: 0.42, move: 'tracks', trackW: 0.3, turret: 'low', gun: 'lens', gunL: 0.8, sig: ['heads', 'vents'] },
    body: 0x2b2540, deep: 0x120f1e, trim: 0x7a5cff, glow: 0x39ffb0 },
  lubo: { chassis: 'hacho', frame: { hull: 'long', hullL: 2.5, hullW: 0.95, hullH: 0.48, nose: 0.3, move: 'wheels6', wheelR: 0.3, turret: 'wedge', gun: 'halberd', gunL: 1.3, sig: ['horse', 'plumes'] },
    body: 0xb3262b, deep: 0x4d0f12, trim: 0xe6b84a, glow: 0xff6a3a },
  mucma: { chassis: 'bocap', frame: { hull: 'pod', hullL: 1.8, hullW: 1.2, hullH: 0.5, move: 'hover', turret: 'dome', turretS: 0.8, gun: 'twin', gunL: 0.7, sig: ['beak', 'tentacles'] },
    body: 0x1d1d24, deep: 0x0b0b10, trim: 0xc2273a, glow: 0xff3355 },
  kynhong: { chassis: 'hacho', frame: { hull: 'long', hullL: 2.2, hullW: 0.9, hullH: 0.4, move: 'legs4', reach: 1.0, spread: 0.75, turret: 'box', turretS: 0.8, gun: 'flamer', gunL: 0.8, sig: ['frill', 'spine', ['tail', { len: 0.85, up: 0.05, r: 0.14 }]] },
    body: 0xe2401c, deep: 0x6b1608, trim: 0xffd166, glow: 0xffb02e },
  nguma: { chassis: 'trau', frame: { hull: 'wide', hullL: 2.5, hullW: 1.8, hullH: 0.55, move: 'tracks', trackW: 0.42, turret: 'box', turretS: 1.1, gun: 'twin', gunL: 0.8, sig: ['ram', 'horns', 'axe'] },
    body: 0x5a1e1e, deep: 0x240b0b, trim: 0xd98a2b, glow: 0xff4a1a },
  sontinh: { chassis: 'trau', frame: { hull: 'hex', hullL: 2.3, hullW: 1.5, hullH: 0.6, move: 'legs4', reach: 1.05, legT: 1.4, spread: 0.6, turret: 'tower', gun: 'mortar', gunL: 0.9, sig: ['peaks', 'slabs'] },
    body: 0x6b7a3a, deep: 0x2f3818, trim: 0xb89a63, glow: 0x9cff6a },
  enbac: { chassis: 'soi', frame: { hull: 'wedge', hullL: 2.0, hullW: 1.1, hullH: 0.38, nose: 0.25, move: 'hover', turret: 'wedge', turretS: 0.8, gun: 'twin', gunL: 1.0, sig: ['fork', 'visor'] },
    body: 0x8a96a8, deep: 0x2b3240, trim: 0xc7472e, glow: 0x5fd0ff },
  boica: { chassis: 'ung', frame: { hull: 'pod', hullL: 1.3, hullW: 0.75, hullH: 0.45, move: 'legs2', turret: 'box', turretS: 0.75, gun: 'long', gunL: 2.0, sig: ['plume'] },
    body: 0x2f7fa6, deep: 0x133447, trim: 0xe8913a, glow: 0xb8f2ff },
  bohung: { chassis: 'trau', frame: { hull: 'pod', hullL: 2.2, hullW: 1.5, hullH: 0.42, move: 'legs6', reach: 0.75, turret: 'none', gun: 'short', gunL: 0.5, sig: ['scarab', 'shell'] },
    body: 0x3c3f8f, deep: 0x171940, trim: 0xc9a43a, glow: 0x5ab8ff },
  cakiem: { chassis: 'hacho', frame: { hull: 'boat', hullL: 2.2, hullW: 0.85, hullH: 0.42, move: 'hover', turret: 'wedge', turretS: 0.75, gun: 'twin', gunL: 0.6, sig: ['sword', 'spine', 'blades'] },
    body: 0x2e6b4f, deep: 0x12301f, trim: 0xd8d8d8, glow: 0x8affc8 },
  gilgamesh: { chassis: 'trau', frame: { hull: 'block', hullL: 2.0, hullW: 1.9, hullH: 0.55, move: 'hover', padR: 0.26, turret: 'box', turretS: 1.05, gun: 'quad', gunL: 0.9, sig: ['gate', 'mane'] },
    body: 0xd9b23a, deep: 0x6b5110, trim: 0xc23a2a, glow: 0xffe680 },
  buomdem: { chassis: 'holy', frame: { hull: 'pod', hullL: 1.8, hullW: 1.4, hullH: 0.42, move: 'hover', turret: 'dome', turretS: 0.8, gun: 'lens', gunL: 0.6, sig: ['moth', 'amulet'] },
    body: 0x5a2a8a, deep: 0x241040, trim: 0xe07a2a, glow: 0x7affd6 },
  laclong: { chassis: 'trau', frame: { hull: 'segmented', segs: 4, hullL: 3.2, hullW: 1.25, hullH: 0.5, move: 'tracks', trackW: 0.28, turret: 'dome', turretS: 0.95, gun: 'long', gunL: 1.0, sig: ['pearl'] },
    body: 0x1f6f8f, deep: 0x0b2d3d, trim: 0xd9b23a, glow: 0x6ff0ff },
  baogam: { chassis: 'bocap', frame: { hull: 'wedge', hullL: 2.0, hullW: 0.85, hullH: 0.34, move: 'legs4', reach: 0.85, spread: 0.35, turret: 'wedge', turretS: 0.7, gun: 'twin', gunL: 0.7, sig: ['claws', ['tail', { len: 0.8, up: 0.4, curl: 0.3, r: 0.09 }], 'ears'] },
    body: 0x23262e, deep: 0x0c0d11, trim: 0x7b5cff, glow: 0xb48cff },
  luondien: { chassis: 'soi', frame: { hull: 'segmented', segs: 4, hullL: 3.0, hullW: 0.85, hullH: 0.38, move: 'hover', turret: 'none', gun: 'lens', gunL: 0.7, sig: ['coils', 'spine'] },
    body: 0x1d4f6b, deep: 0x0a2030, trim: 0xf2e03a, glow: 0x7af7ff },
  tegiac: { chassis: 'trau', frame: { hull: 'block', hullL: 2.0, hullW: 1.2, hullH: 0.6, move: 'legs4', reach: 0.8, legT: 1.4, spread: 0.3, turret: 'dome', gun: 'short', gunL: 0.6, sig: ['rhino', 'fists'] },
    body: 0xe8e2d0, deep: 0x8a2a22, trim: 0xf2c230, glow: 0xfff3b0 },
  quaset: { chassis: 'bocap', frame: { hull: 'diamond', hullL: 2.0, hullW: 1.2, hullH: 0.4, move: 'legs2', turret: 'wedge', turretS: 0.75, gun: 'long', gunL: 1.1, sig: ['crow', 'ribs'] },
    body: 0x2a2350, deep: 0x100c22, trim: 0x8a6bff, glow: 0x9fd8ff },
  tumay: { chassis: 'bang', frame: { hull: 'tri', hullL: 2.1, hullW: 1.4, hullH: 0.42, move: 'wheels6', wheelR: 0.28, wheelSpan: 1.2, turret: 'box', turretS: 0.85, gun: 'lens', gunL: 0.6, sig: ['fan', 'hat'] },
    body: 0x3a3550, deep: 0x16131f, trim: 0x9aa3b8, glow: 0xc07aff },
  dieuthuyen: { chassis: 'holy', frame: { hull: 'disc', hullL: 1.5, hullW: 1.5, hullH: 0.36, move: 'hover', pads: [[0.4, 0.4], [0.4, -0.4], [-0.45, 0]], turret: 'dome', turretS: 0.75, gun: 'lens', gunL: 0.5, sig: ['lotus', 'moon'] },
    body: 0xf0e6f2, deep: 0x6d5a8a, trim: 0xff8fb8, glow: 0xa8e6ff },
  thuytinh: { chassis: 'bang', frame: { hull: 'boat', hullL: 2.4, hullW: 1.2, hullH: 0.42, move: 'hover', turret: 'box', turretS: 0.85, gun: 'long', gunL: 0.9, sig: ['waves', 'conch'] },
    body: 0x2a7fbf, deep: 0x0f3355, trim: 0xe6f2ff, glow: 0x4ff0e0 },
  samthep: { chassis: 'tho', frame: { hull: 'shell', hullL: 2.0, hullW: 1.7, hullH: 0.42, move: 'tracks', trackW: 0.24, trackL: 1.6, turret: 'low', turretS: 0.8, gun: 'lens', gunL: 0.7, sig: ['magnet', ['tail', { len: 0.85, up: 0, r: 0.1, spike: true, amp: 0.1 }]] },
    body: 0x8a2a3a, deep: 0x3a0f18, trim: 0xb7bcc6, glow: 0xc07aff },
  cuuvi: { chassis: 'holy', frame: { hull: 'pod', hullL: 1.7, hullW: 0.9, hullH: 0.4, move: 'hover', turret: 'wedge', turretS: 0.75, gun: 'twin', gunL: 0.7, sig: ['tails', 'ears'] },
    body: 0xf2f0ea, deep: 0x8a3a20, trim: 0xff7a2a, glow: 0xff3b6b },
  kiemthan: { chassis: 'hacho', frame: { hull: 'diamond', hullL: 1.4, hullW: 1.1, hullH: 0.45, move: 'legs2', turret: 'tower', turretS: 0.8, gun: 'lance', gunL: 1.0, sig: ['swords', 'crest'] },
    body: 0xcfd6e0, deep: 0x3e4656, trim: 0x4fb6ff, glow: 0xd8f4ff },
  suatrang: { chassis: 'domdom', frame: { hull: 'disc', hullL: 1.6, hullW: 1.6, hullH: 0.3, move: 'hover', pads: [[0.35, 0.35], [0.35, -0.35], [-0.35, 0.35], [-0.35, -0.35]], turret: 'none', turretS: 0.8, gun: 'lens', gunL: 0.5, sig: ['bell'] },
    body: 0xf4f6f8, deep: 0x9aa6b4, trim: 0xe04a4a, glow: 0x9ff2ff },
  khidot: { chassis: 'trau', frame: { hull: 'block', hullL: 1.7, hullW: 1.3, hullH: 0.75, move: 'tracks', trackL: 1.5, trackW: 0.3, turret: 'box', turretS: 0.95, turretX: -0.1, gun: 'short', gunL: 0.5, sig: ['arms', 'brow'] },
    body: 0x3f7d2f, deep: 0x1a3a12, trim: 0x8a5a2a, glow: 0xb0ff5a },
  retdo: { chassis: 'hacho', frame: { hull: 'segmented', segs: 4, hullL: 3.1, hullW: 1.0, hullH: 0.36, move: 'legs4', reach: 0.7, turret: 'wedge', turretS: 0.75, gun: 'twin', gunL: 0.7, sig: ['prongs', 'cross'] },
    body: 0xb0202a, deep: 0x2a0a0e, trim: 0x1e1e22, glow: 0xff5a5a },
  nhenthep: { chassis: 'bocap', frame: { hull: 'pod', hullL: 1.3, hullW: 1.1, hullH: 0.42, move: 'legs8', reach: 1.15, spread: 0.9, legSpan: 0.9, legT: 0.8, turret: 'dome', turretS: 0.75, gun: 'long', gunL: 0.9, sig: ['grapples'] },
    body: 0x4a4f58, deep: 0x1a1c21, trim: 0xc94a3a, glow: 0xd0e4ff },
  taothao: { chassis: 'hacho', frame: { hull: 'block', hullL: 2.4, hullW: 1.15, hullH: 0.5, move: 'tracks', turret: 'tower', turretS: 0.9, gun: 'long', gunL: 1.3, sig: ['crown', 'cape'] },
    body: 0x2a2a3a, deep: 0x101018, trim: 0xc9a23a, glow: 0xff4a4a },
  bongua: { chassis: 'bocap', frame: { hull: 'tri', hullL: 1.8, hullW: 1.0, hullH: 0.36, move: 'legs4', reach: 0.95, spread: 0.6, legT: 0.75, turret: 'wedge', turretS: 0.7, gun: 'twin', gunL: 0.5, sig: ['scythes'] },
    body: 0x1e2a22, deep: 0x0b120d, trim: 0x7ad94a, glow: 0xc8ff7a },
  moclan: { chassis: 'soi', frame: { hull: 'hex', hullL: 2.0, hullW: 1.05, hullH: 0.45, move: 'wheels4', wheelR: 0.36, turret: 'dome', turretS: 0.85, gun: 'long', gunL: 1.2, sig: ['scales', 'flower', 'saber', 'ribbons'] },
    body: 0xe86aa6, deep: 0x24485a, trim: 0xf2d06a, glow: 0xff6ad8 },   // 花木兰II: pink lacquer, teal under-plates, gold
  anduong: { chassis: 'ung', frame: { hull: 'disc', hullL: 1.9, hullW: 1.9, hullH: 0.42, move: 'tracks', trackL: 1.4, trackW: 0.26, turret: 'tower', turretS: 0.85, gun: 'bow', gunL: 0.9, sig: ['drum', 'talon'] },
    body: 0x8a6a2a, deep: 0x3a2a10, trim: 0x3a8a5a, glow: 0xffd84a },
  chuottui: { chassis: 'hac', frame: { hull: 'block', hullL: 1.9, hullW: 1.15, hullH: 0.55, move: 'wheels4', wheelR: 0.38, wheelSpan: 1.15, turret: 'dome', turretS: 0.8, turretX: -0.15, gun: 'short', gunL: 0.5, sig: ['pouch', 'bigears', 'roo'] },
    body: 0xc98a4a, deep: 0x6a3f1a, trim: 0xf2e6d0, glow: 0x5fe0ff },
  vesau: { chassis: 'hac', frame: { hull: 'pod', hullL: 2.0, hullW: 0.95, hullH: 0.42, move: 'legs6', reach: 0.75, spread: 0.5, turret: 'dome', turretS: 0.75, gun: 'lens', gunL: 0.6, sig: ['clocks', 'lace'] },
    body: 0x3a1a2a, deep: 0x12060c, trim: 0xd93a4a, glow: 0xffd06a },
};

// A mech with no row (a new key) still gets a look of its own, built from its shop tint.
export function styleFor(key, tint) {
  if (STYLES[key]) return STYLES[key];
  const c = new THREE.Color(tint || 0x8899aa);
  return { body: c.getHex(), deep: c.clone().lerp(new THREE.Color(0x101014), 0.7).getHex(), trim: 0xdfe6ee, glow: c.clone().lerp(new THREE.Color(1, 1, 1), 0.3).getHex() };
}

// Which upgrade hardware a mech grows, by its role.
export const ROLE_KIT = {
  tank: 'armor', guardian: 'armor', boss: 'armor',
  assault: 'guns', bruiser: 'guns', flanker: 'guns', trickshot: 'guns', lancer: 'guns', hooker: 'guns',
  sniper: 'range', artillery: 'range', siege: 'range',
  support: 'aid', medic: 'aid', engineer: 'aid',
  control: 'field', trickster: 'field',
};
export const kitOf = (key) => ROLE_KIT[(MECHS[key] || BOSSES[key] || {}).roleKey] || 'guns';

// Bounds of a batch from vertex quantiles, so antennas, rods and lamps sticking out do not stretch the box.
function bounds(b, name) {
  const p = b.batches[name] && b.batches[name].p;
  if (!p || !p.length) return null;
  const xs = [], ys = [], zs = [];
  for (let i = 0; i < p.length; i += 3) { xs.push(p[i]); ys.push(p[i + 1]); zs.push(p[i + 2]); }
  const q = (a, t) => a[Math.min(a.length - 1, Math.floor(t * a.length))];
  xs.sort((a, c) => a - c); ys.sort((a, c) => a - c); zs.sort((a, c) => a - c);
  const r = { x0: q(xs, 0.03), x1: q(xs, 0.97), y0: q(ys, 0.03), y1: q(ys, 0.92), z0: q(zs, 0.03), z1: q(zs, 0.97) };
  r.zh = Math.max(-r.z0, r.z1); r.len = r.x1 - r.x0; r.cx = (r.x0 + r.x1) / 2; r.h = r.y1 - r.y0;
  return r;
}

const GUNMETAL = new THREE.Color(0x4a525c), DARKM = new THREE.Color(0x1e2227), STEELC = new THREE.Color(0x9aa4b0);
const torus = (r, t) => new THREE.TorusGeometry(r, t, 5, 20);

// Every mech: panel seams and bolt rows at form I; tracked and wheeled ones add segmented side skirts at II,
// fenders and a rear grille at III.
// On top of that each role kit adds its own hardware at II and more at III (see KITS).
export function adorn(h, b, key, P, form = 2, info = {}) {
  const H = bounds(b, 'hull'), T = bounds(b, 'turret') || H;
  if (!H) return;
  // Some designs (tho, mangxa, tacke) turn the builder's base matrix for a spinning part and leave it turned;
  // hardware is placed in model space, so start from a clean stack.
  b.stack.length = 1; b.stack[0].identity();
  const F = Math.max(1, Math.min(3, form | 0 || 2));
  const c = { body: formPaint(P.body, F), deep: new THREE.Color(P.deep), trim: new THREE.Color(P.trim) };
  const k = Math.max(0.7, Math.min(1.4, H.len / 2.4));
  const paint = (col) => { b.surface(0.85, 1.1); b.tint(col); };
  const metal = (col) => { b.surface(0.55, 1.7); b.tint(col); };
  const lit = (f) => h.lit(b, f);
  const blk = (x, y, z, w, hh, d, ch = 0.02) => b.push().move(x, y, z).chamfer(w, hh, d, Math.min(ch, w * 0.4, hh * 0.4, d * 0.4)).pop();
  const bolt = (x, y, z, r = 0.022) => b.push().move(x, y, z).cyl(r, r, 0.025, 6).pop();
  // Skirts and fenders cover running gear, so walkers and hover skiffs go without them.
  const ground = !info.hover && !(info.legs && info.legs.length);
  // A turret much smaller than the hull (walkers, skiffs) would hide hardware mounted on it: mount on a box at least
  // 60% of the hull long and 75% as wide, at the higher of the two tops.
  const M = T.len >= H.len * 0.6 ? T : { ...T, len: H.len * 0.6, x0: T.cx - H.len * 0.3, x1: T.cx + H.len * 0.3, zh: Math.max(T.zh, H.zh * 0.75), y1: Math.max(T.y1, H.y1), h: Math.max(T.y1, H.y1) - T.y0 };
  const K = { b, H, T: M, F, k, c, paint, metal, lit, blk, bolt };

  b.use('hull');
  metal(DARKM);
  for (let i = 1; i < 4; i++) blk(H.x0 + H.len * i / 4, H.y1 + 0.004, 0, 0.02, 0.012, H.zh * 1.5, 0.004);
  metal(STEELC);
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) bolt(H.x0 + H.len * (0.12 + i * 0.15), H.y1 + 0.01, s * H.zh * 0.82);
  if (F >= 2 && ground) {
    const n = F === 3 ? 4 : 3, pw = H.len * 0.82 / n;
    for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
      b.push().move(H.x0 + H.len * 0.1 + pw * (i + 0.5), H.y0 + H.h * 0.48, s * (H.zh + 0.05)).rotX(s * 0.12);
      paint(i % 2 ? c.body : c.deep); b.chamfer(pw * 0.94, H.h * 0.5, 0.06, 0.012);
      metal(STEELC); for (const dx of [-1, 1]) bolt(dx * pw * 0.36, H.h * 0.18, s * 0.035, 0.02);
      metal(DARKM); b.push().move(0, -H.h * 0.22, s * 0.01).box(pw * 0.94, 0.035, 0.07).pop();
      b.pop();
    }
  }
  if (F === 3 && ground) {
    for (const s of [-1, 1]) {
      metal(GUNMETAL); blk(H.cx, H.y1 - 0.02, s * (H.zh + 0.1), H.len * 0.94, 0.04, 0.2 * k, 0.015);
      lit(() => b.push().move(H.cx - H.len * 0.1, H.y1 - 0.02, s * (H.zh + 0.2 * k)).box(H.len * 0.5, 0.012, 0.012).pop());
    }
    metal(DARKM); blk(H.x0 + 0.04, H.y0 + H.h * 0.7, 0, 0.08, H.h * 0.3, H.zh * 0.9, 0.01);
    lit(() => { for (const s of [-1, 1]) b.push().move(H.x0, H.y0 + H.h * 0.7, s * H.zh * 0.25).box(0.02, H.h * 0.16, H.zh * 0.3).pop(); });
  }
  if (F >= 2) KITS[kitOf(key)](K);
}

// Role kits. Each draws into the hull batch first, then the turret batch (which turns with the aim).
const KITS = {
  // Tank / guardian: layered armour. II: reactive bricks on the glacis and turret cheeks, a spaced plate over the nose.
  // III: a dozer shield across the front, a second cheek layer and a shield emitter ring on the turret roof.
  armor({ b, H, T, F, k, c, paint, metal, lit, blk, bolt }) {
    b.use('hull');
    const bw = 0.2 * k, nz = Math.max(3, Math.round(H.zh * 1.6 / (bw * 1.1)));
    for (let r = 0; r < 2; r++) for (let i = 0; i < nz; i++) {
      b.push().move(H.x1 - (0.16 + r * 0.24) * k, H.y1 + 0.05 * k, (i - (nz - 1) / 2) * bw * 1.1).rotZ(-0.22);
      paint(i % 2 ? c.deep : c.body); b.chamfer(bw * 1.05, 0.09 * k, bw, 0.015);
      metal(STEELC); bolt(0, 0.05 * k, 0, 0.018);
      b.pop();
    }
    b.push().move(H.x1 + 0.02, H.y0 + H.h * 0.55, 0).rotZ(-0.5); paint(c.body); b.chamfer(0.08, H.h * 0.7, H.zh * 1.8, 0.02); b.pop();
    if (F === 3) {
      b.push().move(H.x1 + 0.22 * k, H.y0 + H.h * 0.35, 0).rotZ(-0.25);
      paint(c.trim); b.chamfer(0.1 * k, H.h * 0.85, H.zh * 2.3, 0.025);
      metal(STEELC); for (let i = -2; i <= 2; i++) bolt(0.055 * k, H.h * 0.3, i * H.zh * 0.42, 0.024);
      lit(() => b.push().move(0.055 * k, -H.h * 0.2, 0).box(0.012, 0.015, H.zh * 1.8).pop());
      b.pop();
    }
    b.use('turret');
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      b.push().move(T.x1 - T.len * (0.18 + i * 0.16), T.y0 + T.h * 0.62, s * (T.zh + 0.05)).rotX(s * 0.2);
      paint(i % 2 ? c.deep : c.body); b.chamfer(T.len * 0.15, T.h * 0.4, 0.08, 0.012);
      if (F === 3) { b.push().move(0, 0, s * 0.07); paint(c.trim); b.chamfer(T.len * 0.13, T.h * 0.32, 0.05, 0.01); b.pop(); }
      b.pop();
    }
    if (F === 3) {
      metal(GUNMETAL); blk(T.cx - T.len * 0.2, T.y1 + 0.03, 0, 0.3 * k, 0.06, 0.3 * k, 0.02);
      lit(() => b.push().move(T.cx - T.len * 0.2, T.y1 + 0.08, 0).geo(torus(0.16 * k, 0.018).rotateX(Math.PI / 2)).pop());
    }
  },

  // Damage dealers: more guns. II: an ammo box with a belt feed and a machine-gun pod on the left cheek, smoke tubes.
  // III: a six-barrel rotary pod on the left, missile pods on both flanks, a twin coaxial gun on the right.
  guns({ b, H, T, F, k, c, paint, metal, lit, blk }) {
    b.use('turret');
    const gy = T.y0 + T.h * 0.5, gz = -(T.zh + 0.12 * k);
    metal(GUNMETAL); blk(T.cx - T.len * 0.1, gy + 0.02, gz, T.len * 0.35, 0.16 * k, 0.16 * k, 0.02);
    paint(c.body); blk(T.cx - T.len * 0.1, gy + 0.11 * k, gz, T.len * 0.3, 0.02, 0.14 * k, 0.006);
    if (F === 2) { metal(DARKM); b.rod([T.cx + T.len * 0.05, gy, gz], [T.x1 + 0.35 * k, gy, gz], 0.03 * k, 8); }
    else {
      metal(DARKM);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.rod([T.cx + T.len * 0.05, gy + Math.cos(a) * 0.05 * k, gz + Math.sin(a) * 0.05 * k], [T.x1 + 0.5 * k, gy + Math.cos(a) * 0.05 * k, gz + Math.sin(a) * 0.05 * k], 0.018 * k, 6); }
      metal(STEELC); for (const x of [T.x1 + 0.1 * k, T.x1 + 0.45 * k]) b.push().move(x, gy, gz).rotZ(Math.PI / 2).cyl(0.085 * k, 0.085 * k, 0.04, 10).pop();
      for (const s of [-1, 1]) {
        const pz = s * (T.zh + 0.16 * k), py = T.y1 - T.h * 0.1 + (s < 0 ? 0.1 * k : 0), px = T.cx, pl = T.len * 0.4;
        metal(DARKM); blk(px, py, s * (T.zh + 0.03), pl * 0.6, 0.12 * k, 0.1 * k, 0.01);
        metal(GUNMETAL); blk(px, py, pz, pl, 0.2 * k, 0.22 * k, 0.025);
        paint(c.body); blk(px, py + 0.105 * k, pz, pl * 0.9, 0.022, 0.18 * k, 0.008);
        metal(DARKM); for (let r = 0; r < 2; r++) for (let j = 0; j < 3; j++) b.push().move(px + pl / 2 + 0.005, py + (r - 0.5) * 0.09 * k, pz + (j - 1) * 0.065 * k).rotZ(-Math.PI / 2).cyl(0.026 * k, 0.026 * k, 0.03, 8).pop();
      }
      metal(GUNMETAL); for (const dz of [0.05, -0.05]) b.rod([T.x1 - 0.05, T.y0 + T.h * 0.45, T.zh * 0.55 + dz * k], [T.x1 + 0.4 * k, T.y0 + T.h * 0.45, T.zh * 0.55 + dz * k], 0.026 * k, 8);
      lit(() => b.push().move(T.cx, T.y1 - 0.01, T.zh * 0.9).box(T.len * 0.5, 0.012, 0.012).pop());
    }
    metal(GUNMETAL);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.push().move(T.x0 + T.len * (0.25 + i * 0.08), T.y1 - 0.02, s * T.zh * 0.72).rotX(s * 0.7).cyl(0.035 * k, 0.04 * k, 0.14 * k, 8).pop();
  },

  // Snipers and artillery: optics and fire control. II: an optics box with a lit lens, outrigger legs folded on the
  // hull flanks, an ammo rack on the turret rear. III: a radar dish on a mast, a laser designator, vertical launch
  // cells on the rear deck and coil rings round the gun root.
  range({ b, H, T, F, k, c, paint, metal, lit, blk }) {
    b.use('hull');
    for (const s of [-1, 1]) { metal(GUNMETAL); b.rod([H.x0 + H.len * 0.15, H.y1 - 0.05, s * (H.zh + 0.08)], [H.x0 + H.len * 0.55, H.y1 + 0.02, s * (H.zh + 0.1)], 0.035 * k, 6); paint(c.deep); blk(H.x0 + H.len * 0.15, H.y1 - 0.08, s * (H.zh + 0.08), 0.14 * k, 0.05, 0.14 * k, 0.01); }
    if (F === 3) {
      const cx = H.x0 + H.len * 0.2;
      metal(GUNMETAL); blk(cx, H.y1 + 0.04, 0, H.len * 0.24, 0.08, H.zh * 1.0, 0.015);
      for (let r = 0; r < 2; r++) for (let j = 0; j < 4; j++) {
        paint(c.deep); blk(cx + (r - 0.5) * H.len * 0.1, H.y1 + 0.085, (j - 1.5) * H.zh * 0.24, H.len * 0.08, 0.012, H.zh * 0.2, 0.004);
        lit(() => b.push().move(cx + (r - 0.5) * H.len * 0.1, H.y1 + 0.093, (j - 1.5) * H.zh * 0.24).box(H.len * 0.05, 0.004, 0.01).pop());
      }
    }
    b.use('turret');
    metal(GUNMETAL); blk(T.x1 - T.len * 0.25, T.y1 + 0.06 * k, T.zh * 0.45, 0.24 * k, 0.12 * k, 0.14 * k, 0.02);
    lit(() => b.push().move(T.x1 - T.len * 0.25 + 0.125 * k, T.y1 + 0.06 * k, T.zh * 0.45).rotZ(-Math.PI / 2).cyl(0.045 * k, 0.045 * k, 0.012, 10).pop());
    paint(c.body); blk(T.x0 - 0.05, T.y0 + T.h * 0.5, 0, 0.14 * k, T.h * 0.55, T.zh * 1.4, 0.015);
    metal(STEELC); for (let j = 0; j < 4; j++) b.push().move(T.x0 - 0.13 * k, T.y0 + T.h * 0.5, (j - 1.5) * T.zh * 0.3).rotZ(Math.PI / 2).cyl(0.04 * k, 0.04 * k, 0.06, 8).pop();
    if (F === 3) {
      const mx = T.x0 + T.len * 0.3, mz = -T.zh * 0.4;
      metal(GUNMETAL); b.rod([mx, T.y1, mz], [mx, T.y1 + 0.45 * k, mz], 0.025, 6);
      b.push().move(mx, T.y1 + 0.48 * k, mz).rotZ(1.1); metal(STEELC); b.lathe([[0.02, 0], [0.18 * k, 0.05 * k], [0.24 * k, 0.1 * k], [0.22 * k, 0.11 * k], [0.02, 0.03]], 14); b.pop();
      lit(() => b.rod([T.x1 - T.len * 0.25 + 0.12 * k, T.y1 + 0.06 * k, T.zh * 0.45], [T.x1 + 2.2 * k, T.y1 + 0.06 * k, T.zh * 0.45], 0.006, 4));
      lit(() => { for (let i = 0; i < 3; i++) b.push().move(T.x1 + 0.02 + i * 0.09 * k, T.y0 + T.h * 0.5, 0).geo(torus(0.14 * k, 0.016).rotateY(Math.PI / 2)).pop(); });
    }
  },

  // Support, medic, engineer: field kit. II: an antenna array, a supply crate with a lit cross, a repair arm.
  // III: a drone pad with a parked drone on the rear deck, a shield-projector dome and a satellite dish on the turret.
  aid({ b, H, T, F, k, c, paint, metal, lit, blk }) {
    b.use('hull');
    const cx = H.x0 + H.len * 0.22;
    paint(c.trim); blk(cx, H.y1 + 0.08 * k, H.zh * 0.45, 0.28 * k, 0.16 * k, 0.24 * k, 0.02);
    lit(() => { b.push().move(cx, H.y1 + 0.165 * k, H.zh * 0.45).box(0.16 * k, 0.01, 0.045 * k).pop(); b.push().move(cx, H.y1 + 0.165 * k, H.zh * 0.45).box(0.045 * k, 0.01, 0.16 * k).pop(); });
    metal(GUNMETAL); b.rod([H.x0 + H.len * 0.6, H.y1, -H.zh * 0.7], [H.x0 + H.len * 0.45, H.y1 + 0.35 * k, -H.zh * 0.9], 0.03 * k, 6); b.rod([H.x0 + H.len * 0.45, H.y1 + 0.35 * k, -H.zh * 0.9], [H.x0 + H.len * 0.75, H.y1 + 0.3 * k, -H.zh * 1.0], 0.025 * k, 6);
    paint(c.deep); blk(H.x0 + H.len * 0.77, H.y1 + 0.27 * k, -H.zh * 1.0, 0.08 * k, 0.08 * k, 0.06 * k, 0.01);
    if (F === 3) {
      const px = H.x0 + H.len * 0.2, pz = -H.zh * 0.35;
      metal(GUNMETAL); b.push().move(px, H.y1 + 0.03, pz).cyl(0.24 * k, 0.26 * k, 0.05, 12).pop();
      lit(() => b.push().move(px, H.y1 + 0.06, pz).geo(torus(0.2 * k, 0.012).rotateX(Math.PI / 2)).pop());
      paint(c.body); blk(px, H.y1 + 0.14 * k, pz, 0.16 * k, 0.06 * k, 0.16 * k, 0.02);
      metal(DARKM); for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { b.rod([px, H.y1 + 0.14 * k, pz], [px + dx * 0.15 * k, H.y1 + 0.16 * k, pz + dz * 0.15 * k], 0.012, 4); b.push().move(px + dx * 0.15 * k, H.y1 + 0.17 * k, pz + dz * 0.15 * k).cyl(0.07 * k, 0.07 * k, 0.008, 10).pop(); }
    }
    b.use('turret');
    metal(GUNMETAL);
    for (let i = 0; i < 3; i++) { const z = (i - 1) * T.zh * 0.35; b.rod([T.x0 + T.len * 0.15, T.y1, z], [T.x0 + T.len * 0.05 - i * 0.04, T.y1 + (0.5 + i * 0.12) * k, z], 0.008, 4); }
    lit(() => { for (let i = 0; i < 3; i++) b.push().move(T.x0 + T.len * 0.05 - i * 0.04, T.y1 + (0.5 + i * 0.12) * k, (i - 1) * T.zh * 0.35).ball(0.018, 0).pop(); });
    if (F === 3) {
      b.push().move(T.cx, T.y1, 0); metal(STEELC); b.lathe([[0.2 * k, 0], [0.19 * k, 0.06 * k], [0.12 * k, 0.14 * k], [0.0, 0.17 * k]], 14); b.pop();
      lit(() => b.push().move(T.cx, T.y1 + 0.03, 0).geo(torus(0.205 * k, 0.014).rotateX(Math.PI / 2)).pop());
      b.push().move(T.x0 + T.len * 0.2, T.y1 + 0.2 * k, T.zh * 0.55).rotZ(0.9); metal(STEELC); b.lathe([[0.02, 0], [0.15 * k, 0.04 * k], [0.18 * k, 0.08 * k], [0.02, 0.03]], 12); b.pop();
      metal(GUNMETAL); b.rod([T.x0 + T.len * 0.2, T.y1, T.zh * 0.55], [T.x0 + T.len * 0.2, T.y1 + 0.2 * k, T.zh * 0.55], 0.02, 6);
    }
  },

  // Control and tricksters: field emitters. II: tesla rods with stacked rings and lit tips at the hull corners.
  // III: two lit emitter rings standing on the turret flanks and a lit core window in the deck.
  field({ b, H, T, F, k, c, paint, metal, lit, blk }) {
    b.use('hull');
    for (const [fx, s] of [[0.15, 1], [0.15, -1], [0.85, 1], [0.85, -1]]) {
      const x = H.x0 + H.len * fx, z = s * H.zh * 0.75;
      metal(GUNMETAL); b.rod([x, H.y1, z], [x, H.y1 + 0.32 * k, z], 0.022, 6);
      metal(STEELC); for (let i = 0; i < 3; i++) b.push().move(x, H.y1 + (0.08 + i * 0.07) * k, z).cyl(0.05 * k, 0.05 * k, 0.02, 10).pop();
      lit(() => b.push().move(x, H.y1 + 0.34 * k, z).ball(0.035 * k, 1).pop());
    }
    if (F === 3) {
      paint(c.deep); blk(H.cx, H.y1 + 0.02, 0, H.len * 0.3, 0.04, H.zh * 0.6, 0.015);
      lit(() => b.push().move(H.cx, H.y1 + 0.045, 0).box(H.len * 0.24, 0.01, H.zh * 0.45).pop());
    }
    b.use('turret');
    paint(c.trim); for (const s of [-1, 1]) blk(T.cx, T.y0 + T.h * 0.55, s * (T.zh + 0.04), T.len * 0.4, T.h * 0.35, 0.06, 0.012);
    if (F === 3) {
      for (const s of [-1, 1]) {
        metal(GUNMETAL); blk(T.cx, T.y0 + T.h * 0.55, s * (T.zh + 0.14 * k), 0.1 * k, 0.1 * k, 0.12 * k, 0.015);
        lit(() => b.push().move(T.cx, T.y0 + T.h * 0.55 + 0.22 * k, s * (T.zh + 0.16 * k)).geo(torus(0.2 * k, 0.02)).pop());
      }
    }
  },
};
