// Drums, barrels, cylinders, cans, buckets, tyres.
import { Prop } from '../lib/prop.js';
import * as parts from '../lib/parts.js';
import { makeFire } from '../lib/fire.js';
import { THREE, lathe as geoLathe, bevelBox, noise3 } from '../lib/geo.js';

// cheaper bevelled box (1 bevel segment: 108 tris instead of 300)
const bx = (p, size, o = {}) => p.geom(bevelBox(size[0], size[1], size[2], Math.min(o.bevel ?? 0.012, Math.min(...size) * 0.3), 1), o);

// ---------------------------------------------------------------- local helpers
const GREY_IN = '#6d7276', RIM = '#b9bfc2';

// Steel / plastic drum body as one lathe with per-point colour bands.
// o: r,h,at,rot,center,color,bands:[{to,color}],open,ribs[],rib,seg,bend,dent,paint,bungs,node,plastic
function barrel(p, o = {}) {
  const r = o.r ?? 0.29, h = o.h ?? 0.88, seg = o.seg ?? 14, rib = o.rib ?? 0.012;
  const ofs = o.center ? -h / 2 : 0;
  const base = o.color || '#2350c8';
  const bands = o.bands || [{ to: 1, color: base }];
  const bc = (f) => { for (const b of bands) if (f <= b.to + 1e-6) return b.color; return bands[bands.length - 1].color; };
  const out = [];
  const add = (rad, y, c) => out.push([rad, y, c ?? bc(y / h)]);
  add(0, 0.025); add(r - 0.02, 0.025); add(r + 0.012, 0); add(r + 0.016, 0.02); add(r, 0.04);
  for (const f of (o.ribs ?? [0.3, 0.7])) { const y = f * h; add(r, y - 0.02); add(r + rib, y); add(r, y + 0.02); }
  add(r, h - 0.04); add(r + 0.016, h - 0.02);
  // band boundaries: split the outer wall with a hard colour step
  const sorted = [];
  for (let i = 0; i < out.length; i++) {
    sorted.push(out[i]);
    const a = out[i], b = out[i + 1];
    if (!b) break;
    for (const bd of bands.slice(0, -1)) {
      const y = bd.to * h;
      if (a[1] < y && b[1] > y) {
        const t = (y - a[1]) / (b[1] - a[1]), rad = a[0] + (b[0] - a[0]) * t;
        sorted.push([rad, y - 0.002, bd.color], [rad, y + 0.002, bands[bands.indexOf(bd) + 1].color]);
      }
    }
  }
  const pts = sorted;
  if (o.open) {
    pts.push([r + 0.012, h, o.rimColor || RIM], [r - 0.012, h, o.rimColor || RIM], [r - 0.014, h - 0.025, GREY_IN], [r - 0.014, 0.06, GREY_IN], [0, 0.06, '#55595c']);
  } else {
    const top = o.lidColor || bc(1);
    pts.push([r + 0.012, h, top], [r - 0.02, h - 0.004, top], [r * 0.6, h + (o.dome ?? 0), top], [0, h + (o.dome ?? 0), top]);
  }
  const g = geoLathe(pts.map((q) => [q[0], q[1] + ofs]), seg, pts.map((q) => q[2]));
  g.userData.yc = ofs + h / 2; // keep shader-local y centred on the body
  const bend = o.bend || 0;
  if (bend) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const s = Math.max(0, Math.min(1, ((pos.getY(i) - ofs) / h - 0.3) / 0.7));
      pos.setX(i, pos.getX(i) + bend * h * s * s);
    }
  }
  const paint = o.paint || p.paint('paint', { color: base, under: '#9aa0a6' });
  p.geom(g, { at: o.at, rot: o.rot, paint, node: o.node, deform: o.dent ? { amp: o.dent, freq: 3.2 } : undefined });
  if (!o.open && o.bungs !== false) {
    const cap = p.paint('metal', { color: o.bungColor || '#aeb4b8', chip: 0, rust: 0.1 });
    const M = new THREE.Matrix4().compose(new THREE.Vector3(...(o.at || [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
    const topY = h + ofs + (o.dome ?? 0) - 0.004;
    for (const [x, z, rr] of (o.bungList || [[r * 0.5, 0.02, 0.04], [-r * 0.45, r * 0.22, 0.026]])) {
      const v = new THREE.Vector3(x + bend * h, topY, z).applyMatrix4(M);
      p.cyl(rr, 0.02, { at: v.toArray(), rot: o.rot, paint: cap, seg: 8, node: o.node, bevel: 0.006 });
    }
  }
  return g;
}

const SIDE = (ang) => [Math.sin(ang), Math.cos(ang)];

// punched holes with nut rings on a drum wall
function holes(p, { r, ys, n = 7, ringColor = '#d8dcde', y0 = 0, a0 = 0, size = 0.03 }) {
  const dark = p.paint('paint', { color: '#262221', chip: 0, rust: 0.2, dirt: 0 });
  const ring = p.paint('paint', { color: ringColor, chip: 0.1, rust: 0, dirt: 0.2 });
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2, y = y0 + ys[i % ys.length], [sx, cz] = SIDE(a);
    p.cyl(size * 1.45, 0.014, { at: [sx * (r + 0.002), y, cz * (r + 0.002)], rot: [Math.PI / 2, a, 0], order: 'YXZ', paint: ring, bevel: 0.004, seg: 6 });
    p.cyl(size * 0.8, 0.02, { at: [sx * (r + 0.008), y, cz * (r + 0.008)], rot: [Math.PI / 2, a, 0], order: 'YXZ', paint: dark, bevel: 0.003, seg: 8 });
  }
}

// ---------------------------------------------------------------- drums
// Steel / plastic blue drum. opts: color, dent (0..0.03), open
export function drumBlue(seed = 1, opts = {}) {
  const p = new Prop('drum_blue', seed, opts);
  barrel(p, { color: opts.color || '#2350c8', dent: opts.dent ?? 0, open: opts.open,
    paint: p.paint('paint', { color: opts.color || '#2350c8', under: '#a9aeb3', pattern: 'stains', col2: '#1a3a98', patW: 0.4, rust: 0.12 }), bungList: [[0.15, 0.02, 0.04], [-0.14, 0.07, 0.025]] });
  return p.done();
}

const STRAP = '#34363a';
export function drumsBlueStrapped(seed = 1, opts = {}) {
  const p = new Prop('drums_blue_strapped', seed, opts);
  const c = opts.color || '#2350c8', d = 0.285, r = 0.28, h = 0.86;
  const mk = (x, z, s) => barrel(p, { r, h, at: [x, 0, z], color: c, ribs: [0.3, 0.7], bungList: [[0.15, 0.02, 0.04], [-0.13, 0.08, 0.025]],
    paint: p.paint('paint', { color: c, under: '#a9aeb3', pattern: 'stains', col2: '#1a3a98', patW: 0.4 }), dent: opts.dent ?? 0.006 });
  mk(-d, 0.02); mk(d, -0.02);
  const sp = p.paint('fabric', { color: STRAP, chip: 0, rust: 0, dirt: 0.3 });
  const loop = (y, tw) => {
    const pts = [];
    const R = r + 0.012;
    for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI; pts.push([d + Math.cos(a) * R, 0, Math.sin(a) * R - 0.02 + 0.02]); }
    for (let i = 0; i <= 12; i++) { const a = Math.PI / 2 + (i / 12) * Math.PI; pts.push([-d + Math.cos(a) * R, 0, Math.sin(a) * R]); }
    p.tube(pts, 0.007, { at: [0, y, 0], scale: [1, 5.5, 1], paint: sp, closed: true, seg: 4, steps: 30 });
    p.box([0.07, 0.065, 0.03], { at: [0, y, R + 0.012], paint: p.paint('metal', { color: '#9aa0a5' }), bevel: 0.008 });
  };
  loop(0.24); loop(0.62);
  return p.done();
}

// local pallet (boxes)
function pallet(p, o = {}) {
  const [W, D] = o.size || [1.2, 0.95];
  const w = p.paint('plywood', { color: o.color || '#eaa968', under: '#b98350' });
  const y0 = o.y0 ?? 0;
  for (let i = 0; i < 3; i++) bx(p, [0.12, 0.09, D], { at: [-W / 2 + 0.06 + i * (W - 0.12) / 2, y0 + 0.06, 0], paint: w, bevel: 0.012 });
  for (let i = 0; i < 3; i++) bx(p, [W, 0.03, 0.14], { at: [0, y0 + 0.015, -D / 2 + 0.07 + i * (D - 0.14) / 2], paint: w, bevel: 0.01 });
  for (let i = 0; i < 6; i++) bx(p, [W, 0.034, 0.15], { at: [0, y0 + 0.117, -D / 2 + 0.075 + i * (D - 0.15) / 5], paint: w, bevel: 0.01 });
}

export function drumsOnPallet(seed = 1, opts = {}) {
  const p = new Prop('drums_on_pallet', seed, opts);
  pallet(p, { size: [1.0, 1.2], color: '#f2b27c' });
  // drums lie along X, open end caps face -X; the front drum (+Z) carries the white band + flame
  const r = 0.265, L = 0.84, py = 0.134 + r, dz = 0.27;
  const cols = opts.colors || ['#b8262b', '#2a8a58', '#c42a2f'];
  const mk = (z, y, col, bands) => barrel(p, { r, h: L, center: true, at: [0, y, z], rot: [0, 0, Math.PI / 2], color: col, bands, open: true, ribs: [0.3, 0.7], seg: 12,
    paint: p.paint('paint', { color: col, under: '#8f9498', rust: 0.03, chip: 0.4 }) });
  mk(-dz, py, cols[0]);
  mk(dz, py, cols[2], [{ to: 0.2, color: cols[2] }, { to: 0.8, color: '#f2f0e8' }, { to: 1, color: cols[2] }]);
  mk(0, py + r * 1.73, cols[1]);
  const fl = p.paint('paint', { color: '#f4881b', chip: 0.2, rust: 0, dirt: 0.2 });
  const fy = p.paint('paint', { color: '#ffd23a', chip: 0.2, rust: 0, dirt: 0.1 });
  const zf = dz + r * 0.97;
  p.extrude([[0, 0.12], [0.05, 0.05], [0.075, -0.02], [0.04, -0.1], [-0.04, -0.1], [-0.075, -0.02], [-0.04, 0.05]], 0.012, { at: [0.02, py + 0.02, zf], paint: fl, bevel: 0.002 });
  p.extrude([[0, 0.05], [0.03, -0.01], [0.02, -0.07], [-0.02, -0.07], [-0.035, -0.02]], 0.012, { at: [0.02, py, zf + 0.004], paint: fy, bevel: 0.002 });
  const sp = p.paint('fabric', { color: STRAP, chip: 0, rust: 0, dirt: 0.3 });
  const R = r + 0.016, C = [[-dz, py], [dz, py], [0, py + r * 1.73]];
  const pts = [], d2r = Math.PI / 180;
  const arc = (c, a0, a1) => { for (let i = 0; i <= 5; i++) { const a = a0 + (a1 - a0) * i / 5; pts.push([0, c[1] + Math.sin(a) * R, c[0] + Math.cos(a) * R]); } };
  arc(C[0], 150 * d2r, 270 * d2r); arc(C[1], -90 * d2r, 30 * d2r); arc(C[2], 30 * d2r, 150 * d2r);
  for (const x of [-0.27, 0.27]) {
    p.tube(pts, 0.007, { at: [x, 0, 0], scale: [6, 1, 1], paint: sp, closed: true, seg: 4, steps: 30 });
    p.box([0.07, 0.07, 0.04], { at: [x, py + r * 1.05, -r * 0.9], paint: p.paint('metal', { color: '#9aa0a5' }) });
  }
  return p.done();
}

export function drumRedRusty(seed = 1, opts = {}) {
  const p = new Prop('drum_red_rusty', seed, opts);
  const c = opts.color || '#e0575c';
  barrel(p, { color: c, open: true, dent: opts.dent ?? 0.004, paint: p.paint('paint', { color: c, under: '#8d9296', pattern: 'stains', col2: '#a8353a', patW: 0.3, rust: 0.18, chip: 0.5 }) });
  return p.done();
}

export function drumRedDented(seed = 1, opts = {}) {
  const p = new Prop('drum_red_dented', seed, opts);
  const c = opts.color || '#d8232c';
  barrel(p, { color: c, open: true, bend: opts.bend ?? 0.2, dent: opts.dent ?? 0.008,
    paint: p.paint('paint', { color: c, under: '#8d9296', rust: 0.3, chip: 0.5 }) });
  return p.done();
}

export function drumOrangeWhite(seed = 1, opts = {}) {
  const p = new Prop('drum_orange_white', seed, opts);
  const o = '#f5961a', w = '#eceae2';
  barrel(p, { color: o, r: 0.28, h: 0.94, bands: [{ to: 0.2, color: o }, { to: 0.72, color: w }, { to: 1, color: o }], ribs: [0.2, 0.72], bungList: [[0.05, 0.12, 0.04], [-0.12, -0.1, 0.025]],
    paint: p.paint('paint', { color: o, under: '#8d9296', chip: 0.65, rust: 0.3, pattern: 'stains', col2: '#6d5f53', patW: 0.25 }) });
  const strap = p.paint('rubber', { color: '#2b2c30', chip: 0 });
  for (const f of [0.2, 0.72]) p.cyl(0.285, 0.022, { at: [0, f * 0.88, 0], paint: strap, seg: 14, bevel: 0.006 });
  return p.done();
}

// jug-shaped plastic drum with tap
export function drumBlueB(seed = 1, opts = {}) {
  const p = new Prop('drum_blue_b', seed, opts);
  const c = opts.color || '#2349e0', r = 0.27;
  const pts = [[0, 0.02, c], [r - 0.03, 0.02, c], [r + 0.01, 0, c], [r + 0.015, 0.03, c], [r - 0.005, 0.07, c], [r, 0.12, c],
    [r + 0.01, 0.16, c], [r, 0.2, c], [r, 0.5, c], [r - 0.07, 0.62, c], [0.15, 0.76, c], [0.14, 0.82, c], [0.165, 0.845, '#2d5df0'],
    [0.14, 0.845, '#f0f0f0'], [0.125, 0.83, GREY_IN], [0.125, 0.7, '#4a4e52'], [0, 0.7, '#3a3d40']];
  const g = geoLathe(pts.map((q) => [q[0], q[1]]), 14, pts.map((q) => q[2]));
  p.geom(g, { paint: p.paint('paint', { color: c, under: '#aeb3b8', pattern: 'stains', col2: '#1b2f95', patW: 0.35, chip: 0.45, rust: 0.05 }), deform: { amp: opts.dent ?? 0.004, freq: 3 } });
  const org = p.paint('paint', { color: '#f08a1c', chip: 0, rust: 0, dirt: 0 }), gry = p.paint('metal', { color: '#c0c5c8', chip: 0 });
  p.box([0.05, 0.05, 0.07], { at: [0.03, 0.1, r + 0.04], paint: gry, bevel: 0.01 });
  p.box([0.04, 0.06, 0.04], { at: [0.03, 0.065, r + 0.075], paint: org, bevel: 0.01 });
  return p.done();
}

export function drumRusty(seed = 1, opts = {}) {
  const p = new Prop('drum_rusty', seed, opts);
  const c = opts.color || '#93625a';
  barrel(p, { color: c, open: true, h: 0.8, ribs: [0.33, 0.7], rimColor: '#cfd2d3', dent: 0.004,
    paint: p.paint('paint', { color: c, under: '#aeb2b4', rust: 0.7, chip: 0.65, pattern: 'stains', col2: '#6d4038', patW: 0.3 }) });
  holes(p, { r: 0.29, ys: [0.52, 0.6], n: 4, a0: 0.4 });
  return p.done();
}

export function drumRedWhite(seed = 1, opts = {}) {
  const p = new Prop('drum_red_white', seed, opts);
  const rd = opts.color || '#d8232c', w = '#eeece4';
  barrel(p, { color: rd, bands: [{ to: 0.2, color: rd }, { to: 0.74, color: w }, { to: 1, color: rd }], ribs: [0.2, 0.74], bungList: [[0.1, 0.12, 0.035], [-0.12, -0.12, 0.028]],
    paint: p.paint('paint', { color: rd, under: '#8d9296', chip: 0.55, rust: 0.2 }) });
  const dark = p.paint('rubber', { color: '#2b2c30', chip: 0 });
  for (const f of [0.2, 0.74]) p.cyl(0.285, 0.016, { at: [0, f * 0.88, 0], paint: dark, seg: 14, bevel: 0.005 });
  const o = p.paint('paint', { color: '#f4781a', chip: 0.25, rust: 0, dirt: 0.2 }), y = p.paint('paint', { color: '#ffd23a', chip: 0.2, rust: 0, dirt: 0.1 });
  const fy = 0.5, z = 0.288;
  p.extrude([[0.0, 0.14], [0.05, 0.07], [0.075, -0.01], [0.04, -0.1], [-0.04, -0.1], [-0.075, -0.01], [-0.04, 0.05]], 0.01, { at: [0, fy, z], paint: o, bevel: 0.002 });
  p.extrude([[0.0, 0.05], [0.03, -0.01], [0.02, -0.07], [-0.02, -0.07], [-0.035, -0.02]], 0.01, { at: [0, fy - 0.01, z + 0.004], paint: y, bevel: 0.002 });
  return p.done();
}

// HDPE plastic drum: slightly barrel-shaped, black lid with rim
export function drumBluePlastic(seed = 1, opts = {}) {
  const p = new Prop('drum_blue_plastic', seed, opts);
  const c = opts.color || '#2349e0', r = 0.265, h = 0.86;
  const pts = [[0, 0.02, c], [r - 0.04, 0.02, c], [r - 0.01, 0, c], [r, 0.04, c], [r + 0.012, 0.1, c], [r + 0.014, 0.16, '#1d3dc0'], [r, 0.2, c],
    [r + 0.006, 0.38, c], [r + 0.016, 0.45, '#1d3dc0'], [r + 0.006, 0.52, c], [r + 0.012, 0.7, c], [r + 0.01, 0.78, '#1d3dc0'], [r - 0.012, 0.82, c],
    [r - 0.02, h - 0.025, '#23252a'], [r + 0.02, h - 0.02, '#23252a'], [r + 0.022, h + 0.02, '#23252a'], [r - 0.02, h + 0.03, '#2b2d33'], [r - 0.04, h + 0.012, '#2b2d33'], [0, h + 0.012, '#2b2d33']];
  p.geom(geoLathe(pts.map((q) => [q[0], q[1]]), 14, pts.map((q) => q[2])), { paint: p.paint('paint', { color: c, under: '#c8ccd0', pattern: 'stains', col2: '#1b2f95', patW: 0.35, chip: 0.4, rust: 0, dirt: 0.5 }), deform: { amp: opts.dent ?? 0.005, freq: 3 } });
  const dk = p.paint('rubber', { color: '#1c1d21', chip: 0 });
  p.cyl(0.04, 0.02, { at: [0.12, h + 0.035, 0.05], paint: dk, seg: 8, bevel: 0.006 });
  return p.done();
}

// Burning barrel with holes and firewood. opts: fire (bool), light (bool)
export function burnBarrel(seed = 1, opts = {}) {
  const p = new Prop('burn_barrel', seed, opts);
  const o = '#e2561d';
  barrel(p, { color: o, open: true, h: 0.82, ribs: [0.32, 0.7], rimColor: '#cfd2d3', seg: 12,
    paint: p.paint('paint', { color: o, under: '#8a8f93', rust: 0.7, chip: 0.7, pattern: 'stains', col2: '#7a2f1a', patW: 0.3 }) });
  holes(p, { r: 0.29, ys: [0.5, 0.58], n: 6, a0: 0.2, ringColor: '#e4e7e8' });
  const wood = p.paint('wood', { color: '#7a4a33' });
  for (let i = 0; i < 5; i++) {
    const a = p.r() * Math.PI * 2;
    bx(p, [0.06, 0.5, 0.06], { at: [Math.cos(a) * 0.1, 0.78, Math.sin(a) * 0.1], rot: [Math.sin(a) * 0.5, a, Math.cos(a) * 0.5], paint: wood, bevel: 0.012 });
  }
  p.cyl(0.24, 0.05, { at: [0, 0.7, 0], paint: p.paint('paint', { color: '#2a2422', chip: 0, rust: 0.3 }), seg: 10 });
  if (opts.fire !== false) {
    const f = p.attach(makeFire({ radius: 0.26, height: 0.55, count: 7, light: !!opts.light, seed }));
    f.position.y = 0.8;
    p.param('fire', 1, (v) => { f.visible = v > 0.01; f.scale.setScalar(Math.max(0.01, v)); });
    p.onUpdate((dt, t) => f.userData.update(t));
  }
  return p.done();
}

export function burnBucket(seed = 1, opts = {}) {
  const p = new Prop('burn_bucket', seed, opts);
  const c = opts.color || '#a85a45';
  barrel(p, { color: c, open: true, h: 0.36, r: 0.3, ribs: [0.5], rimColor: '#d4d7d8', rib: 0.014, seg: 12,
    paint: p.paint('paint', { color: c, under: '#aeb2b4', rust: 0.5, chip: 0.5, pattern: 'stains', col2: '#6a3226', patW: 0.3 }) });
  const wood = p.paint('wood', { color: '#7d4b36' });
  const ash = p.paint('rubber', { color: '#3a2c28', chip: 0 });
  p.cyl(0.26, 0.05, { at: [0, 0.31, 0], paint: ash, seg: 10 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + p.r(), tilt = 0.3 + p.r() * 0.5;
    bx(p, [0.05, 0.42, 0.05], { at: [Math.cos(a) * 0.1, 0.5, Math.sin(a) * 0.1], rot: [Math.sin(a) * tilt, a, -Math.cos(a) * tilt], paint: wood, bevel: 0.01 });
  }
  if (opts.fire) {
    const f = p.attach(makeFire({ radius: 0.24, height: 0.45, count: 6, light: false, seed }));
    f.position.y = 0.36;
    p.param('fire', 1, (v) => { f.visible = v > 0.01; f.scale.setScalar(Math.max(0.01, v)); });
    p.onUpdate((dt, t) => f.userData.update(t));
  }
  return p.done();
}

export function barrelTable(seed = 1, opts = {}) {
  const p = new Prop('barrel_table', seed, opts);
  const c = opts.color || '#6f7367';
  barrel(p, { color: c, h: 0.8, r: 0.28, ribs: [0.3, 0.68], bungs: false, dent: 0.004,
    paint: p.paint('paint', { color: c, under: '#8d9296', rust: 0.6, chip: 0.6, pattern: 'stains', col2: '#8a8250', patW: 0.4, dirt: 0.8 }) });
  const wd = p.paint('wood', { color: '#9c5a3d', under: '#c28a60' });
  const yaw = 0.25;
  const pl = [[-0.38, 0.9], [-0.19, 1.0], [0, 0.92], [0.19, 1.0], [0.38, 0.88]];
  for (const [x, L] of pl) bx(p, [0.185, 0.04, L], { at: [x * Math.cos(yaw), 0.82, 0.04 + x * Math.sin(yaw) * 0.4], rot: [0, yaw, 0], paint: wd, bevel: 0.008 });
  bx(p, [0.1, 0.03, 0.9], { at: [0.0, 0.795, 0], rot: [0, yaw + 1.57, 0], paint: wd, bevel: 0.008 });
  const tarp = p.paint('tarp', { color: '#2f73e8', under: '#2557b5', chip: 0, dirt: 0.3, rust: 0 });
  const N = 16, g = new THREE.PlaneGeometry(1.5, 1.4, N, N);
  g.rotateX(-Math.PI / 2);
  const ps = g.attributes.position, top = 0.862;
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  for (let i = 0; i < ps.count; i++) {
    const x = ps.getX(i), z = ps.getZ(i);
    const cx = cl(x, -0.3, 0.42), cz = cl(z, -0.36, 0.36), dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
    const k = 1 + (x > 0.3 && z > 0.2 ? 0.5 : 0) + (z < -0.2 ? 0.2 : 0);
    const w = noise3(x * 5 + seed, 1, z * 5) * 0.012 + Math.sin(d * 14 + x * 3) * 0.008 * Math.min(1, d * 6);
    ps.setXYZ(i, cx + dx * 0.3, top + noise3(x * 4, 2 + seed, z * 4) * 0.012 - d * 0.5 * k + w, cz + dz * 0.3);
  }
  const ix = g.index.array, keep = [];
  for (let t = 0; t < ix.length; t += 3) {
    let cx = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += ps.getX(ix[t + k]) / 3; cz += ps.getZ(ix[t + k]) / 3; }
    if (Math.hypot(cx + 0.08, cz - 0.1) > 0.09) keep.push(ix[t], ix[t + 1], ix[t + 2]);
  }
  g.setIndex(keep); g.deleteAttribute('uv'); g.computeVertexNormals();
  g.userData = { kind: 2, edgeZero: true };
  p.geom(g, { paint: tarp });
  return p.done();
}

export function trashCan(seed = 1, opts = {}) {
  const p = new Prop('trash_can', seed, opts);
  const gal = p.paint('metal', { color: '#c2c8cc', under: '#8a9196', rough: 0.55, chip: 0.2, rust: 0.02, dirt: 0.25 });
  const r = 0.26, h = 0.7, n = 16, pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, k = i % 2 ? 1 : 0.8; pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k]); }
  p.extrude(pts.reverse(), h, { bevel: 0.006, at: [0, h / 2, 0], rot: [-Math.PI / 2, 0, 0], paint: gal });
  p.cyl(r + 0.012, 0.035, { at: [0, h - 0.018, 0], paint: gal, seg: 16, bevel: 0.01 });
  p.cyl(r + 0.01, 0.03, { at: [0, 0.02, 0], paint: gal, seg: 16, bevel: 0.01 });
  p.cyl(r - 0.01, 0.01, { at: [0, h - 0.04, 0], paint: p.paint('rubber', { color: '#2e3033', chip: 0 }), seg: 14 });
  for (const s of [-1, 1]) p.box([0.03, 0.07, 0.05], { at: [s * (r + 0.02), h * 0.82, 0], paint: gal, bevel: 0.01 });
  const lid = p.node('lid', { at: [0, h, -r + 0.02] });
  p.in(lid, () => {
    const lp = p.paint('metal', { color: '#b3b9bd', under: '#6f767b', chip: 0.2, rust: 0.15, dirt: 0.4 });
    p.lathe([[0, -0.01], [r + 0.01, -0.01], [r + 0.022, 0.002], [r + 0.012, 0.022], [r * 0.75, 0.045], [0.08, 0.072], [0, 0.074]],
      { seg: 16, paint: lp, at: [0, 0.01, r - 0.02] });
    p.tube([[-0.07, 0.072, 0], [-0.06, 0.115, 0], [0.06, 0.115, 0], [0.07, 0.072, 0]], 0.012, { at: [0, 0, r - 0.02], paint: lp, seg: 5 });
  });
  p.param('lid', opts.lid ?? 0.12, (v) => { lid.rotation.x = -v * 0.75; lid.position.y = h + v * 0.02; });
  return p.done();
}

// ---------------------------------------------------------------- gas / extinguisher
export function gasCylinderTall(seed = 1, opts = {}) {
  const p = new Prop('gas_cylinder_tall', seed, opts);
  const c = opts.color || '#585757', r = 0.16;
  const pts = [[0, 0.03, c], [r - 0.04, 0.03, c], [r - 0.02, 0.0, c], [r, 0.03, c], [r + 0.004, 0.08, c], [r + 0.004, 0.62, c], [r - 0.01, 0.74, c],
    [0.11, 0.82, c], [0.06, 0.87, c], [0.043, 0.88, c], [0.043, 1.0, c], [0.047, 1.01, '#6a6969'], [0.035, 1.01, '#1a1b1d'], [0.035, 0.96, '#1a1b1d']];
  p.geom(geoLathe(pts.map((q) => [q[0], q[1]]), 12, pts.map((q) => q[2])), { paint: p.paint('paint', { color: c, under: '#8d9296', chip: 0.45, rust: 0.08, dirt: 0.15 }) });
  const panel = p.paint('paint', { color: '#2c2f33', chip: 0.2, rust: 0, dirt: 0.3 });
  bx(p, [0.14, 0.15, 0.012], { at: [0, 0.45, r + 0.002], paint: panel, bevel: 0.004 });
  bx(p, [0.06, 0.012, 0.014], { at: [0.03, 0.5, r + 0.006], paint: p.paint('paint', { color: '#8d9296', chip: 0 }), bevel: 0.002 });
  bx(p, [0.1, 0.06, 0.012], { at: [0, 0.28, r + 0.002], paint: panel, bevel: 0.004 });
  const dk = p.paint('rubber', { color: '#15161a', chip: 0, dirt: 0 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4, [sx, cz] = SIDE(a); p.cyl(0.018, 0.01, { at: [sx * (r + 0.003), 0.025, cz * (r + 0.003)], rot: [Math.PI / 2, a, 0], order: 'YXZ', paint: dk, seg: 6, bevel: 0.002 }); }
  return p.done();
}

function redBottle(p, r, h, o = {}) {
  const c = o.color || '#e03038';
  const hd = h;
  const pts = [[0, 0.025, c], [r * 0.7, 0.025, c], [r * 0.8, 0.0, c], [r * 0.95, 0.03, c], [r, 0.1 * hd, c], [r * 0.9, 0.17 * hd, c], [r * 0.96, 0.22 * hd, '#b9222a'], [r, 0.3 * hd, c], [r * 1.02, 0.5 * hd, c],
    [r * 0.97, 0.62 * hd, '#b9222a'], [r, 0.7 * hd, c], [r * 0.9, 0.84 * hd, c], [r * 0.6, 0.93 * hd, c], [r * 0.3, 0.97 * hd, c], [r * 0.16, 0.98 * hd, '#9aa0a5'], [0, 0.98 * hd, '#9aa0a5']];
  p.geom(geoLathe(pts.map((q) => [q[0], q[1]]), 14, pts.map((q) => q[2])), { paint: p.paint('paint', { color: c, under: '#8d9296', chip: 0.45, rust: 0.05, dirt: 0.2 }), deform: { amp: 0.003, freq: 4 } });
  // foot ring
  p.cyl(r * 0.8, 0.04, { at: [0, 0.02, 0], paint: p.paint('paint', { color: '#8e1f27', chip: 0.2 }), seg: 12, bevel: 0.008 });
  // valve
  const yv = p.paint('paint', { color: '#f2c71e', chip: 0.2, rust: 0, dirt: 0.2 });
  p.cyl(0.03, 0.05, { at: [0, 0.98 * hd + 0.025, 0], paint: p.paint('metal', { color: '#9aa0a5', chip: 0 }), seg: 8 });
  p.cyl(0.06, 0.04, { at: [0, 0.98 * hd + 0.07, 0], paint: yv, seg: 6, bevel: 0.01 });
  bx(p, [0.035, 0.035, 0.1], { at: [0.05, 0.98 * hd + 0.05, 0.06], paint: yv, bevel: 0.004 });
}

export function gasCylinderSmall(seed = 1, opts = {}) {
  const p = new Prop('gas_cylinder_small', seed, opts);
  redBottle(p, 0.15, 0.4, opts);
  return p.done();
}

export function gasBottleRed(seed = 1, opts = {}) {
  const p = new Prop('gas_bottle_red', seed, opts);
  redBottle(p, 0.17, 0.55, opts);
  const r = 0.17, hd = 0.55, top = 0.98 * hd + 0.03;
  const gp = p.paint('paint', { color: opts.color || '#e03038', under: '#8d9296', chip: 0.4, rust: 0.15 });
  p.tube([[-0.11, top - 0.1, 0.04], [-0.12, top + 0.04, 0.02], [-0.07, top + 0.1, 0], [0.07, top + 0.1, 0], [0.12, top + 0.04, 0.02], [0.11, top - 0.1, 0.04]], 0.014, { paint: gp, seg: 6 });
  return p.done();
}

export function fireExtinguisher(seed = 1, opts = {}) {
  const p = new Prop('fire_extinguisher', seed, opts);
  const c = opts.color || '#d6252b', r = 0.075;
  const pts = [[0, 0.02, '#2a2b2f'], [r * 0.8, 0.02, '#2a2b2f'], [r * 0.9, 0.0, '#2a2b2f'], [r + 0.004, 0.03, '#2a2b2f'], [r + 0.004, 0.07, '#2a2b2f'], [r + 0.002, 0.075, c], [r + 0.004, 0.34, c],
    [r * 0.92, 0.39, c], [r * 0.6, 0.42, c], [r * 0.4, 0.435, '#9aa0a5'], [0, 0.435, '#9aa0a5']];
  p.geom(geoLathe(pts.map((q) => [q[0], q[1]]), 12, pts.map((q) => q[2])), { paint: p.paint('paint', { color: c, under: '#8d9296', chip: 0.5, rust: 0.05, dirt: 0.1, pattern: 'stains', col2: '#b8383c', patW: 0.2 }) });
  const wh = p.paint('paint', { color: '#eeeae0', chip: 0.2, rust: 0, dirt: 0.3 }), bk = p.paint('rubber', { color: '#202125', chip: 0 });
  bx(p, [0.105, 0.17, 0.012], { at: [0, 0.2, r - 0.003], paint: bk, bevel: 0.003 });
  bx(p, [0.09, 0.15, 0.012], { at: [0, 0.2, r + 0.0005], paint: wh, bevel: 0.003 });
  const gr = p.paint('metal', { color: '#9aa0a5', under: '#6a7075', chip: 0.2, rust: 0.1 });
  p.cyl(0.04, 0.05, { at: [0, 0.455, 0], paint: gr, seg: 8, bevel: 0.01 });
  bx(p, [0.04, 0.03, 0.17], { at: [0, 0.495, 0.0], rot: [0.0, 0, 0], paint: bk, bevel: 0.008 });
  bx(p, [0.03, 0.02, 0.1], { at: [0, 0.465, -0.03], paint: gr, bevel: 0.006 });
  p.tube([[0.03, 0.44, 0], [0.09, 0.42, 0.02], [0.11, 0.33, 0.04], [0.1, 0.27, 0.05]], 0.012, { paint: bk, seg: 6 });
  p.cyl(0.03, 0.01, { at: [0, 0.42, r * 0.9], rot: [Math.PI / 2, 0, 0], paint: bk, seg: 8 });
  return p.done();
}

// ---------------------------------------------------------------- jerry cans
function jerryCan(p, { W = 0.32, H = 0.42, D = 0.19, color = '#e5232a', cap = '#3a3b3f', capSide = 1, cornerWhite = false }) {
  const hw = W / 2, hh = H / 2, ch = 0.04;
  const prof = [[-hw + ch, 0], [hw - ch, 0], [hw, ch], [hw, H - 0.12], [hw - 0.05, H - 0.1], [hw * 0.2, H - 0.06], [-hw * 0.1, H], [-hw + 0.08, H], [-hw, H - 0.06], [-hw, ch]];
  const paint = p.paint('paint', { color, under: '#8f9498', chip: 0.5, rust: 0.1, dirt: 0.45, rough: 0.5 });
  p.extrude(prof.map(([x, y]) => [x * capSide, y]).sort(() => 0).slice(), D, { bevel: 0.03, paint });
  const dk = p.paint('paint', { color: cap, chip: 0.1, rust: 0, dirt: 0.2 });
  const rs = p.paint('paint', { color, under: '#8f9498', chip: 0.5, rust: 0.05, dirt: 0.4 });
  // spout + cap
  p.cyl(0.04, 0.05, { at: [-hw * 0.35 * capSide, H + 0.015, 0], paint: dk, seg: 8, bevel: 0.01 });
  // handle: 3 bars (two posts + grip) as one arch of dark tube segments
  const hx = hw * 0.1 * capSide, hx2 = hw * 0.8 * capSide;
  p.tube([[hx, H - 0.02, 0], [hx + 0.02 * capSide, H + 0.06, 0], [(hx + hx2) / 2, H + 0.075, 0], [hx2 - 0.02 * capSide, H + 0.06, 0], [hx2, H - 0.02, 0]], 0.02, { paint: dk, seg: 5, smooth: false });
  bx(p, [0.035, 0.05, D * 0.5], { at: [(hx + hx2) / 2, H + 0.01, 0], paint: dk, bevel: 0.01 });
  // raised X stamp + square, both faces (flat boxes: 12 tris each)
  for (const s of [1, -1]) {
    const z = s * (D / 2 + 0.003);
    p.box([W * 0.62, 0.018, 0.012], { at: [0, H * 0.6, z], rot: [0, 0, 0.62], paint: rs, bevel: 0 });
    p.box([W * 0.62, 0.018, 0.012], { at: [0, H * 0.6, z], rot: [0, 0, -0.62], paint: rs, bevel: 0 });
    p.box([W * 0.36, H * 0.2, 0.01], { at: [0, H * 0.24, z], paint: rs, bevel: 0 });
    p.box([W * 0.8, 0.014, 0.01], { at: [0, H * 0.84, z], paint: rs, bevel: 0 });
  }
  if (cornerWhite) bx(p, [0.06, 0.04, D + 0.01], { at: [(-hw + 0.045) * capSide, 0.02, 0], paint: p.paint('paint', { color: '#e8e8e2', chip: 0, rust: 0 }), bevel: 0.01 });
}

export function jerryCanRed(seed = 1, opts = {}) {
  const p = new Prop('jerry_can_red', seed, opts);
  jerryCan(p, { color: opts.color || '#e5232a' });
  return p.done();
}
export function jerryCanRedSmall(seed = 1, opts = {}) {
  const p = new Prop('jerry_can_red_small', seed, opts);
  jerryCan(p, { W: 0.28, H: 0.33, D: 0.17, color: opts.color || '#e5232a', capSide: -1 });
  return p.done();
}
export function jerryCanYellow(seed = 1, opts = {}) {
  const p = new Prop('jerry_can_yellow', seed, opts);
  jerryCan(p, { W: 0.3, H: 0.4, D: 0.19, color: opts.color || '#d2e035', cap: '#9aa0a5', cornerWhite: true });
  return p.done();
}

// ---------------------------------------------------------------- buckets
function bucketBody(p, { rb = 0.12, rt = 0.17, h = 0.27, color = '#86b6c8' }) {
  const c = color, ins = '#4d7d92';
  const pts = [[0, 0.01, c], [rb - 0.01, 0.01, c], [rb, 0.0, c], [rb + 0.005, 0.03, c], [rb + (rt - rb) * 0.3, h * 0.35, c], [rb + (rt - rb) * 0.35 + 0.012, h * 0.4, '#6aa0b8'],
    [rb + (rt - rb) * 0.4, h * 0.45, c], [rb + (rt - rb) * 0.8, h * 0.85, c], [rt, h - 0.02, c], [rt + 0.014, h - 0.015, '#8fc0d6'], [rt + 0.014, h, '#8fc0d6'], [rt - 0.008, h, '#8fc0d6'],
    [rt - 0.012, h - 0.03, ins], [rb - 0.012, 0.045, ins], [0, 0.045, '#3d6578']];
  p.geom(geoLathe(pts.map((q) => [q[0], q[1]]), 14, pts.map((q) => q[2])), { paint: p.paint('paint', { color: c, under: '#aab4b8', chip: 0.3, rust: 0, dirt: 0.15 }), deform: { amp: 0.004, freq: 3 } });
}
export function bucket(seed = 1, opts = {}) {
  const p = new Prop('bucket', seed, opts);
  bucketBody(p, { color: opts.color || '#7bb3cb' });
  const gp = p.paint('metal', { color: '#8c9499', chip: 0, rust: 0.2 });
  for (const s of [-1, 1]) p.box([0.02, 0.04, 0.05], { at: [s * 0.172, 0.235, 0], paint: gp, bevel: 0.006 });
  p.tube([[-0.172, 0.24, 0], [-0.17, 0.3, 0], [-0.12, 0.31, 0.0]], 0.006, { paint: gp, seg: 5 });
  p.tube([[0.172, 0.24, 0], [0.17, 0.3, 0], [0.12, 0.31, 0.0]], 0.006, { paint: gp, seg: 5 });
  return p.done();
}
export function bucketHandle(seed = 1, opts = {}) {
  const p = new Prop('bucket_handle', seed, opts);
  bucketBody(p, { rb: 0.115, rt: 0.16, h: 0.28, color: opts.color || '#74a9c1' });
  const gp = p.paint('chrome', { color: '#b8bfc4', chip: 0, rust: 0.1 });
  const pts = []; for (let i = 0; i <= 12; i++) { const a = Math.PI - (i / 12) * Math.PI; pts.push([Math.cos(a) * 0.168, 0.255 + Math.sin(a) * 0.19 * (opts.handleUp === false ? 0.2 : 1), 0]); }
  p.tube(pts, 0.007, { paint: gp, seg: 5 });
  return p.done();
}

// ---------------------------------------------------------------- tyres & can
export function tyre(seed = 1, opts = {}) {
  const p = new Prop('tyre', seed, opts);
  parts.tyre(p, { R: 0.34, w: 0.2, ri: 0.17, at: [0, 0.1, 0], paint: p.paint('rubber', { color: '#5a585c', under: '#6a686d', chip: 0, dirt: 0.15 }), flat: true, seg: 18 });
  return p.done();
}
export function tyreFlat(seed = 1, opts = {}) {
  const p = new Prop('tyre_flat', seed, opts);
  const rub = p.paint('rubber', { color: '#5a585c', under: '#6a686d', chip: 0, dirt: 0.15 });
  p.torus(0.3, 0.07, { at: [0, 0.06, 0], paint: rub, seg: 14, tube: 6, scale: [1, 0.8, 1], deform: { amp: 0.012, freq: 3 } });
  return p.done();
}
export function tyreBig(seed = 1, opts = {}) {
  const p = new Prop('tyre_big', seed, opts);
  parts.tyre(p, { R: 0.42, w: 0.3, ri: 0.25, at: [0, 0.15, 0], rim: true, seg: 18, paint: p.paint('rubber', { color: '#5a5256', under: '#6a686d', chip: 0, dirt: 0.15 }),
    rimPaint: p.paint('steel', { color: '#aab2b6', under: '#7f878b', chip: 0.2, rust: 0.2 }) });
  return p.done();
}

export function sodaCan(seed = 1, opts = {}) {
  const p = new Prop('soda_can', seed, opts);
  const c = opts.color || '#ee4a38', r = 0.033, h = 0.122;
  const pts = [[0, 0.003, '#c8cdd0'], [r - 0.004, 0.003, '#c8cdd0'], [r, 0.012, c], [r, h - 0.014, c], [r - 0.006, h - 0.006, '#d8dcde'], [r - 0.006, h, '#e6e9ea'], [r - 0.012, h - 0.003, '#b5babd'], [0, h - 0.003, '#a0a5a8']];
  p.geom(geoLathe(pts.map((q) => [q[0], q[1]]), 12, pts.map((q) => q[2])), { paint: p.paint('paint', { color: c, under: '#c8cdd0', chip: 0.2, rust: 0, dirt: 0.2, metal: 0.4, rough: 0.4 }) });
  p.box([0.02, 0.003, 0.012], { at: [0, h - 0.002, 0.004], paint: p.paint('metal', { color: '#d0d4d6', chip: 0 }), bevel: 0.001 });
  return p.done();
}

// ---------------------------------------------------------------- registry
const V = (label, seed, opts = {}) => ({ label, seed, opts });
export const PROPS = [
  { id: 'drum_blue', name: 'Phuy xanh', build: drumBlue, yaw: 0, variants: [V('mới', 1, { wear: 0.1 }), V('móp', 2, { wear: 0.9, dent: 0.02 }), V('đỏ', 3, { color: '#d6262c' })] },
  { id: 'drums_blue_strapped', name: 'Cặp phuy xanh buộc dây', build: drumsBlueStrapped, yaw: 0.2, variants: [V('mới', 1, { wear: 0.3 }), V('cũ', 2, { wear: 0.9, dent: 0.012 })] },
  { id: 'drums_on_pallet', name: 'Phuy trên pallet', build: drumsOnPallet, yaw: 1.1, variants: [V('đỏ-xanh', 1), V('cũ', 2, { wear: 1, colors: ['#9a2a22', '#2f7a5a', '#b92a2a'] })] },
  { id: 'drum_red_rusty', name: 'Phuy đỏ gỉ', build: drumRedRusty, yaw: 0, variants: [V('gỉ', 1), V('rất gỉ', 2, { wear: 1 })] },
  { id: 'drum_red_dented', name: 'Phuy đỏ móp', build: drumRedDented, yaw: 0, variants: [V('móp', 1), V('móp nặng', 2, { bend: 0.3, wear: 0.9 })] },
  { id: 'drum_orange_white', name: 'Phuy cam trắng', build: drumOrangeWhite, yaw: 0.3, variants: [V('cũ', 1), V('mới', 2, { wear: 0.15 })] },
  { id: 'drum_blue_b', name: 'Phuy xanh có vòi', build: drumBlueB, yaw: 0.4, variants: [V('cũ', 1), V('mới', 2, { wear: 0.15 }), V('móp', 3, { wear: 0.9, dent: 0.012 })] },
  { id: 'drum_rusty', name: 'Phuy gỉ', build: drumRusty, yaw: 0.2, variants: [V('gỉ', 1), V('rất gỉ', 2, { wear: 1 })] },
  { id: 'drum_red_white', name: 'Phuy đỏ trắng lửa', build: drumRedWhite, yaw: 0.2, variants: [V('cũ', 1), V('mới', 2, { wear: 0.15 })] },
  { id: 'drum_blue_plastic', name: 'Phuy nhựa xanh', build: drumBluePlastic, yaw: 0.3, variants: [V('cũ', 1), V('mới', 2, { wear: 0.15 })] },
  { id: 'burn_barrel', name: 'Phuy đốt lửa', build: burnBarrel, yaw: 0.4, variants: [V('cháy', 1), V('tắt', 2, { fire: false })] },
  { id: 'burn_bucket', name: 'Thùng đốt thấp', build: burnBucket, yaw: 0, variants: [V('củi', 1), V('cháy', 2, { fire: true })] },
  { id: 'barrel_table', name: 'Bàn phuy', build: barrelTable, yaw: 0.2, variants: [V('bạt xanh', 1), V('cũ', 2, { wear: 1 })] },
  { id: 'trash_can', name: 'Thùng rác', build: trashCan, yaw: 0, variants: [V('nắp lệch', 1), V('đóng', 2, { lid: 0 }), V('mở', 3, { lid: 0.9 })] },
  { id: 'gas_cylinder_tall', name: 'Bình gas cao', build: gasCylinderTall, yaw: 0.3, variants: [V('cũ', 1), V('mới', 2, { wear: 0.15 })] },
  { id: 'gas_cylinder_small', name: 'Bình gas mini', build: gasCylinderSmall, yaw: 0, variants: [V('đỏ', 1), V('cũ', 2, { wear: 1 })] },
  { id: 'gas_bottle_red', name: 'Bình gas đỏ', build: gasBottleRed, yaw: 0, variants: [V('đỏ', 1), V('cũ', 2, { wear: 1 })] },
  { id: 'fire_extinguisher', name: 'Bình chữa cháy', build: fireExtinguisher, yaw: 0, variants: [V('cũ', 1), V('mới', 2, { wear: 0.1 })] },
  { id: 'jerry_can_red', name: 'Can xăng đỏ', build: jerryCanRed, yaw: -0.5, variants: [V('cũ', 1), V('mới', 2, { wear: 0.1 })] },
  { id: 'jerry_can_red_small', name: 'Can xăng đỏ nhỏ', build: jerryCanRedSmall, yaw: 0.5, variants: [V('cũ', 1), V('mới', 2, { wear: 0.1 })] },
  { id: 'jerry_can_yellow', name: 'Can xăng vàng', build: jerryCanYellow, yaw: -0.5, variants: [V('cũ', 1), V('mới', 2, { wear: 0.1 })] },
  { id: 'bucket', name: 'Xô', build: bucket, yaw: 0, variants: [V('cũ', 1), V('mới', 2, { wear: 0.1 })] },
  { id: 'bucket_handle', name: 'Xô có quai', build: bucketHandle, yaw: 0, variants: [V('cũ', 1), V('mới', 2, { wear: 0.1 })] },
  { id: 'tyre', name: 'Lốp xe', build: tyre, yaw: 0, variants: [V('cũ', 1), V('bẩn', 2, { wear: 1 })] },
  { id: 'tyre_flat', name: 'Lốp xẹp', build: tyreFlat, yaw: 0, variants: [V('xẹp', 1), V('bẩn', 2, { wear: 1 })] },
  { id: 'tyre_big', name: 'Lốp to', build: tyreBig, yaw: 0, variants: [V('có mâm', 1), V('cũ', 2, { wear: 1 })] },
  { id: 'soda_can', name: 'Lon nước', build: sodaCan, yaw: 0, variants: [V('đỏ', 1), V('xanh', 2, { color: '#2e7fe0' })] },
];
