// Workshop props: bench, press, mat, vise, lamp, small bits, cabinets, chest, stove, wrench, casings.
import * as THREE from '../vendor/three.module.min.js';
import { Prop } from '../lib/prop.js';
import * as parts from '../lib/parts.js';

const PI = Math.PI;
function slim(p) { // flat (12-tri) boxes for thin parts, bevel only chunky ones: keeps triangle budget
  const ob = p.box.bind(p), oc = p.cyl.bind(p), pp = p.paint.bind(p);
  p.paint = (pr, o = {}) => { const r = pp(pr, o); if (o.rust === undefined) r.rust = Math.min(r.rust, 0.1 + 0.3 * Math.max(0, p.wear - 0.6)); return r; };
  p.box = (size, o = {}) => ob(size, { ...o, bevel: Math.min(...size) >= 0.05 ? o.bevel : 0 });
  p.cyl = (r, h, o = {}) => oc(r, h, { ...o, bevel: r >= 0.03 ? o.bevel : 0 });
}
const bolt = (p, at, rot, paint, r = 0.014) => p.cyl(r, 0.012, { at, rot, paint, seg: 6, bevel: 0.003 });

// ---- gunsmith_bench: opts.drawers 0..1 (open amount), opts.color
export function gunsmithBench(seed = 1, opts = {}) {
  const p = new Prop('gunsmith_bench', seed, opts); slim(p);
  const wood = p.paint('wood', { color: opts.color || '#a8553a', under: '#d09a6c', chip: 0.5, dirt: 0.5 });
  const dark = p.paint('wood', { color: '#6e3a2c', under: '#a06a48' });
  const steel = p.paint('steel', { color: '#5f7480', under: '#aab2b6', chip: 0.4, rust: 0.3 });
  const black = p.paint('paint', { color: '#1e1f22', chip: 0 });
  const W = 1.6, D = 0.76, TOP = 0.88;
  p.box([W + 0.06, 0.07, D + 0.06], { at: [0, TOP - 0.035, 0], paint: wood, bevel: 0.02, deform: { amp: 0.003, freq: 8 } });
  p.box([W + 0.06, 0.42, 0.05], { at: [0, TOP + 0.21, -D / 2], paint: wood, bevel: 0.015 });
  for (const sx of [-1, 1]) p.box([0.07, 0.5, 0.07], { at: [sx * (W / 2 + 0.01), TOP + 0.22, -D / 2], paint: dark, bevel: 0.015 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.box([0.12, TOP - 0.07, 0.12], { at: [sx * 0.72, (TOP - 0.07) / 2, sz * 0.3], paint: dark, bevel: 0.02 });
  }
  p.box([W - 0.1, 0.08, 0.05], { at: [0, TOP - 0.11, -0.3], paint: dark, bevel: 0.01 });
  p.box([0.05, 0.08, 0.6], { at: [-0.72, TOP - 0.11, 0], paint: dark, bevel: 0.01 });
  p.box([W - 0.1, 0.06, 0.05], { at: [0, 0.3, -0.3], paint: dark, bevel: 0.01 });
  p.box([W - 0.12, 0.04, D - 0.1], { at: [0, 0.27, 0], paint: wood, bevel: 0.012 });
  for (const sx of [-1, 1]) p.box([0.05, 0.07, 0.62], { at: [sx * 0.72, 0.3, 0], paint: steel, bevel: 0.01 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 0.72, z = sz * 0.3;
    if (sz > 0) {
      p.box([0.2, 0.2, 0.012], { at: [x, TOP - 0.17, z + 0.056], paint: steel, bevel: 0.006 });
      for (const [bx, by] of [[-0.06, -0.06], [0.06, 0.06], [-0.06, 0.06], [0.06, -0.06]])
        bolt(p, [x + bx, TOP - 0.17 + by, z + 0.065], [PI / 2, 0, 0], steel);
    }
    p.box([0.012, 0.2, 0.2], { at: [x + sx * 0.056, TOP - 0.17, z], paint: steel, bevel: 0.006 });
  }
  p.box([0.03, 0.46, 0.66], { at: [0.175, 0.63, 0.0], paint: dark, bevel: 0.008 });
  p.box([0.5, 0.45, 0.04], { at: [0.43, 0.63, -0.26], paint: black, bevel: 0.004 });
  p.box([0.5, 0.03, 0.62], { at: [0.43, 0.405, 0], paint: dark, bevel: 0.008 });
  const ds = [];
  const mk = (i, y) => {
    const n = p.node('drawer' + i, { at: [0.43, y, 0.33] }); ds.push(n);
    p.in(n, () => {
      p.box([0.5, 0.17, 0.03], { at: [0, 0, 0], paint: wood, bevel: 0.01 });
      p.box([0.03, 0.14, 0.5], { at: [-0.235, -0.01, -0.26], paint: dark, bevel: 0.006 });
      p.box([0.03, 0.14, 0.5], { at: [0.235, -0.01, -0.26], paint: dark, bevel: 0.006 });
      p.box([0.45, 0.025, 0.5], { at: [0, -0.07, -0.26], paint: dark, bevel: 0.006 });
      p.box([0.45, 0.14, 0.025], { at: [0, -0.01, -0.5], paint: dark, bevel: 0.006 });
      p.cyl(0.022, 0.03, { at: [0, 0, 0.03], rot: [PI / 2, 0, 0], paint: black, seg: 8, bevel: 0.005 });
      if (i === 0) {
        p.box([0.2, 0.03, 0.05], { at: [-0.08, -0.04, -0.2], rot: [0, 0.3, 0], paint: steel, bevel: 0.006 });
        p.cyl(0.02, 0.1, { at: [0.12, -0.04, -0.3], rot: [0, 0, PI / 2], paint: p.paint('paint', { color: '#d9b11d' }), seg: 8 });
      }
    });
  };
  mk(0, 0.74); mk(1, 0.55);
  p.param('drawers', opts.drawers ?? 0.5, (v) => { ds.forEach((n, i) => { n.position.z = 0.33 + v * (i ? 0.38 : 0.3); }); });
  return p.done();
}

// ---- reloading_press (red)
export function reloadingPress(seed = 1, opts = {}) {
  const p = new Prop('reloading_press', seed, opts); slim(p);
  const red = p.paint('paint', { color: opts.color || '#d1262c', under: '#8d9296', chip: 0.5, rust: 0.05 });
  const metal = p.paint('steel', { color: '#7b8389' });
  const dark = p.paint('metal', { color: '#3b4046' });
  p.box([0.3, 0.04, 0.28], { at: [0, 0.02, 0], paint: metal, bevel: 0.01 });
  p.box([0.1, 0.04, 0.12], { at: [0, 0.06, 0.02], paint: dark, bevel: 0.01 });
  p.box([0.1, 0.34, 0.1], { at: [-0.06, 0.21, -0.06], paint: red, bevel: 0.02 });
  p.box([0.14, 0.1, 0.12], { at: [-0.03, 0.4, -0.04], paint: red, bevel: 0.02 });
  p.cyl(0.026, 0.12, { at: [0.0, 0.34, 0.02], paint: metal, seg: 10 });
  p.cyl(0.016, 0.14, { at: [0.0, 0.14, 0.02], paint: metal, seg: 8 });
  p.box([0.04, 0.1, 0.05], { at: [0.0, 0.23, 0.02], paint: red, bevel: 0.01 });
  const lever = p.node('lever', { at: [0.02, 0.24, 0.0] });
  p.in(lever, () => {
    p.box([0.03, 0.03, 0.34], { at: [0, 0, 0.16], paint: red, bevel: 0.01 });
    p.cyl(0.02, 0.12, { at: [0, 0, 0.34], rot: [PI / 2, 0, 0], paint: dark, seg: 8 });
  });
  p.param('press', opts.press ?? 0, (v) => { lever.rotation.x = -0.5 + v * 0.7; });
  p.box([0.04, 0.05, 0.04], { at: [0.06, 0.07, 0.1], paint: p.paint('paint', { color: '#e8c61e' }), bevel: 0.01 });
  return p.done();
}

// ---- cutting_mat
export function cuttingMat(seed = 1, opts = {}) {
  const p = new Prop('cutting_mat', seed, opts); slim(p);
  const mat = p.paint('plastic', { color: opts.color || '#1fae7c', col2: opts.line || '#56dba8', pattern: 'grid', patW: 0.1, under: '#177a5a', chip: 0.0, dirt: 0.5, rough: 0.7 });
  const [w, d] = opts.size || [0.9, 0.5];
  p.box([w, 0.012, d], { at: [0, 0.006, 0], paint: mat, bevel: 0.004 });
  return p.done();
}

// ---- bench_vise: opts.jaw 0..1 (open)
export function benchVise(seed = 1, opts = {}) {
  const p = new Prop('bench_vise', seed, opts); slim(p);
  const lime = p.paint('paint', { color: opts.color || '#9ad22a', under: '#6b7075', chip: 0.45, rust: 0.04, dirt: 0.25 });
  const dark = p.paint('metal', { color: '#41464b' });
  const steel = p.paint('steel', { color: '#8a9298' });
  p.box([0.22, 0.04, 0.2], { at: [0, 0.02, 0], paint: lime, bevel: 0.01 });
  p.cyl(0.07, 0.03, { at: [0, 0.055, 0], paint: dark, seg: 12 });
  p.box([0.2, 0.1, 0.14], { at: [0, 0.12, -0.02], paint: lime, bevel: 0.02 });
  p.box([0.2, 0.09, 0.04], { at: [0, 0.17, 0.07], paint: lime, bevel: 0.015 });
  p.box([0.17, 0.05, 0.012], { at: [0, 0.18, 0.093], paint: steel, bevel: 0.004 });
  const jaw = p.node('jaw', { at: [0, 0.17, 0.12] });
  p.in(jaw, () => {
    p.box([0.2, 0.09, 0.05], { at: [0, 0, 0.0], paint: lime, bevel: 0.015 });
    p.box([0.17, 0.05, 0.012], { at: [0, 0.01, -0.03], paint: steel, bevel: 0.004 });
    p.box([0.06, 0.06, 0.18], { at: [0, -0.02, 0.1], paint: lime, bevel: 0.012 });
    p.cyl(0.014, 0.3, { at: [0, -0.02, 0.28], rot: [PI / 2, 0, 0], paint: steel, seg: 8 });
    p.cyl(0.012, 0.2, { at: [0, -0.02, 0.4], rot: [0, 0, PI / 2], paint: steel, seg: 8 });
    p.cyl(0.02, 0.02, { at: [0.1, -0.02, 0.4], rot: [0, 0, PI / 2], paint: dark, seg: 8 });
    p.cyl(0.02, 0.02, { at: [-0.1, -0.02, 0.4], rot: [0, 0, PI / 2], paint: dark, seg: 8 });
  });
  p.param('jaw', opts.jaw ?? 0.3, (v) => { jaw.position.z = 0.1 + v * 0.14; });
  return p.done();
}

// ---- desk_lamp: opts.arm 0..1 (raise), opts.light (SpotLight), opts.lit (default true)
export function deskLamp(seed = 1, opts = {}) {
  const p = new Prop('desk_lamp', seed, opts); slim(p);
  const body = p.paint('paint', { color: opts.color || '#2d3033', under: '#6c7176', chip: 0.35, rust: 0.2 });
  const metal = p.paint('chrome', { color: '#b7bcc0', dirt: 0.3 });
  const glow = p.paint('glow', { color: opts.lit === false ? '#9a9a8a' : '#fff0b0' });
  p.box([0.16, 0.05, 0.14], { at: [0, 0.025, 0], paint: body, bevel: 0.012 });
  p.box([0.05, 0.12, 0.1], { at: [0, 0.09, 0], paint: body, bevel: 0.01 });
  p.cyl(0.03, 0.05, { at: [0, 0.14, 0], rot: [0, 0, PI / 2], paint: metal, seg: 10 });
  const A1 = 0.55, A2 = 0.55;
  const j1 = p.node('arm1', { at: [0, 0.14, 0] });
  const j2 = p.node('arm2', { at: [0, A1, 0], parent: j1 });
  const hd = p.node('head', { at: [0, A2, 0], parent: j2 });
  p.in(j1, () => { p.tube([[0, 0, 0], [0, A1, 0]], 0.014, { paint: metal, seg: 6 }); p.cyl(0.026, 0.05, { at: [0, A1, 0], rot: [0, 0, PI / 2], paint: body, seg: 8 }); });
  p.in(j2, () => {
    p.tube([[0, 0, 0], [0, A2, 0]], 0.013, { paint: metal, seg: 6 });
    p.cyl(0.024, 0.05, { at: [0, A2, 0], rot: [0, 0, PI / 2], paint: body, seg: 8 });
  });
  p.in(hd, () => {
    p.box([0.12, 0.05, 0.44], { at: [0, 0.0, 0.14], paint: body, bevel: 0.02 });
    p.box([0.09, 0.012, 0.4], { at: [0, -0.028, 0.14], paint: glow, bevel: 0.004 });
  });
  const set = (v) => { j1.rotation.z = -0.35 + v * 0.3; j2.rotation.z = 1.2 - v * 0.5; hd.rotation.z = -0.9 + v * 0.1; };
  p.param('arm', opts.arm ?? 0.5, set);
  if (opts.light) {
    const l = new THREE.SpotLight(0xfff0c8, 3, 4, 0.8, 0.6, 1.5);
    l.position.set(0, -0.03, 0.1); l.target.position.set(0, -1, 0.1);
    hd.add(l, l.target); p.extra.push(l);
  }
  return p.done();
}

// ---- walkie_talkie
export function walkieTalkie(seed = 1, opts = {}) {
  const p = new Prop('walkie_talkie', seed, opts); slim(p);
  const blk = p.paint('rubber', { color: opts.color || '#2a2c30', under: '#55585e', chip: 0.2 });
  const gry = p.paint('plastic', { color: '#4a4e55', under: '#6a6e75', chip: 0.1 });
  const lcd = p.paint('plastic', { color: '#8fd1a0', chip: 0, dirt: 0.1 });
  p.box([0.055, 0.14, 0.035], { at: [0, 0.07, 0], paint: blk, bevel: 0.01 });
  p.box([0.04, 0.045, 0.01], { at: [0, 0.1, 0.019], paint: gry, bevel: 0.004 });
  p.box([0.026, 0.012, 0.004], { at: [0, 0.12, 0.022], paint: lcd, bevel: 0.002 });
  for (let i = 0; i < 3; i++) p.box([0.032, 0.004, 0.004], { at: [0, 0.075 + i * 0.01, 0.022], paint: gry, bevel: 0.001 });
  p.cyl(0.012, 0.03, { at: [0.016, 0.152, 0], paint: gry, seg: 8 });
  p.cyl(0.006, 0.12, { at: [-0.016, 0.2, 0], paint: blk, seg: 6, bevel: 0.002 });
  p.box([0.012, 0.05, 0.012], { at: [0.03, 0.1, 0.0], paint: p.paint('paint', { color: '#e55a1c' }), bevel: 0.003 });
  return p.done();
}

// ---- ashtray: opts.butts
export function ashtray(seed = 1, opts = {}) {
  const p = new Prop('ashtray', seed, opts); slim(p);
  const gl = p.paint('metal', { color: opts.color || '#6e7378', under: '#4a4f54', chip: 0.2, rust: 0.4, dirt: 0.6 });
  p.lathe([[0, 0], [0.05, 0], [0.065, 0.012], [0.07, 0.03], [0.062, 0.03], [0.055, 0.016], [0, 0.014]], { seg: 14, paint: gl });
  const ash = p.paint('rubber', { color: '#6a6663', chip: 0, dirt: 0.3 });
  p.cyl(0.05, 0.004, { at: [0, 0.016, 0], paint: ash, seg: 10, bevel: 0.001 });
  const wh = p.paint('paint', { color: '#efe9da', chip: 0.0, dirt: 0.5 }), br = p.paint('paint', { color: '#c9892f', chip: 0 });
  const n = opts.butts ?? 4;
  for (let i = 0; i < n; i++) {
    const a = p.r() * PI * 2, rr = p.range(0.01, 0.04), y = 0.025, ry = p.r() * PI * 2;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    p.cyl(0.0045, 0.03, { at: [x, y, z], rot: [0, ry, PI / 2], paint: wh, seg: 5, bevel: 0.001 });
    p.cyl(0.0046, 0.012, { at: [x + Math.cos(ry) * 0.02, y, z - Math.sin(ry) * 0.02], rot: [0, ry, PI / 2], paint: br, seg: 5, bevel: 0.001 });
  }
  return p.done();
}

// ---- bottles_oil: opts.count
export function bottlesOil(seed = 1, opts = {}) {
  const p = new Prop('bottles_oil', seed, opts); slim(p);
  const org = p.paint('plastic', { color: opts.color || '#e4571d', under: '#f0b07a', chip: 0.1, dirt: 0.5 });
  const wh = p.paint('plastic', { color: '#f2f0ea' });
  const n = opts.count ?? 2;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.1, h = 0.17 + (i % 2) * 0.03, z = (i % 2) * 0.02;
    p.lathe([[0, 0], [0.032, 0], [0.036, 0.012], [0.036, h * 0.65], [0.028, h * 0.85], [0.015, h], [0, h]], { seg: 10, paint: org, at: [x, 0, z] });
    p.cyl(0.017, 0.03, { at: [x, h + 0.012, z], paint: wh, seg: 8 });
    p.cyl(0.006, 0.05, { at: [x, h + 0.05, z], paint: wh, seg: 6, r2: 0.003 });
    p.box([0.05, 0.05, 0.004], { at: [x, h * 0.4, z + 0.034], paint: wh, bevel: 0.001 });
  }
  return p.done();
}

// ---- mug
export function mug(seed = 1, opts = {}) {
  const p = new Prop('mug', seed, opts); slim(p);
  const c = p.paint('plastic', { color: opts.color || '#c8ccc6', under: '#9a9d98', chip: 0.3, dirt: 0.7 });
  p.lathe([[0, 0], [0.032, 0], [0.036, 0.008], [0.04, 0.085], [0.036, 0.085], [0.033, 0.07], [0, 0.07]], { seg: 14, paint: c });
  p.torus(0.022, 0.005, { at: [0.045, 0.045, 0], paint: c, arc: PI * 1.3, seg: 10, tube: 5 });
  if (opts.coffee !== false) p.cyl(0.032, 0.003, { at: [0, 0.066, 0], paint: p.paint('rubber', { color: '#3a2418', chip: 0 }), seg: 12, bevel: 0.001 });
  return p.done();
}

// ---- dynamite_bundle: opts.sticks
export function dynamiteBundle(seed = 1, opts = {}) {
  const p = new Prop('dynamite_bundle', seed, opts); slim(p);
  const red = p.paint('paint', { color: opts.color || '#cf2a24', under: '#e0a07a', chip: 0.3, dirt: 0.4 });
  const tape = p.paint('paint', { color: '#1e1e20', chip: 0, dirt: 0.2 });
  const cap = p.paint('paint', { color: '#e8dcc0', chip: 0 });
  const n = opts.sticks ?? 5, L = 0.18;
  const pos = [[0, 0.02], [-0.04, 0.02], [0.04, 0.02], [-0.02, 0.055], [0.02, 0.055], [0, 0.088], [-0.06, 0.055]].slice(0, n);
  for (const [z, y] of pos) {
    p.cyl(0.02, L, { at: [0, y + 0.0, z], rot: [0, 0, PI / 2], paint: red, seg: 8, bevel: 0.004 });
    p.cyl(0.021, 0.004, { at: [L / 2 + 0.002, y, z], rot: [0, 0, PI / 2], paint: cap, seg: 8, bevel: 0.001 });
  }
  for (const t of [-0.045, 0.045]) p.box([0.035, 0.085, 0.115], { at: [t, 0.05, 0.0], paint: tape, bevel: 0.006 });
  p.tube([[L / 2, 0.05, 0.0], [L / 2 + 0.05, 0.08, 0.02], [L / 2 + 0.1, 0.05, 0.05], [L / 2 + 0.15, 0.015, 0.04]], 0.004, { paint: p.paint('rubber', { color: '#7a6a4a', chip: 0 }), seg: 4 });
  return p.done();
}

// ---- detonator_box: opts.color
export function detonatorBox(seed = 1, opts = {}) {
  const p = new Prop('detonator_box', seed, opts); slim(p);
  const red = p.paint('paint', { color: opts.color || '#cc2229', under: '#8a8e92', chip: 0.5, rust: 0.05 });
  const dk = p.paint('paint', { color: '#26282c', chip: 0.1 });
  const gy = p.paint('plastic', { color: '#8d939a', chip: 0 });
  p.box([0.3, 0.1, 0.2], { at: [0, 0.05, 0], paint: red, bevel: 0.015 });
  p.box([0.1, 0.012, 0.075], { at: [-0.08, 0.103, 0.0], paint: p.paint('plastic', { color: '#7ec8a6', chip: 0 }), bevel: 0.003 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++)
    p.box([0.03, 0.014, 0.03], { at: [c * 0.04 + 0.01, 0.106, -0.05 + r * 0.045], paint: r === 2 && c === 3 ? p.paint('paint', { color: '#e8c21e', chip: 0 }) : dk, bevel: 0.004 });
  p.cyl(0.02, 0.03, { at: [-0.1, 0.11, 0.06], paint: gy, seg: 8 });
  p.box([0.04, 0.02, 0.012], { at: [0, 0.075, 0.1], paint: dk, bevel: 0.003 });
  p.tube([[0.15, 0.06, 0.0], [0.2, 0.06, 0.05], [0.25, 0.02, 0.1], [0.3, 0.012, 0.12]], 0.005, { paint: dk, seg: 4 });
  p.cyl(0.006, 0.12, { at: [0.12, 0.16, -0.08], paint: dk, seg: 5, bevel: 0.001 });
  return p.done();
}

// ---- steel_cabinet_open: opts.doors 0..1
export function steelCabinetOpen(seed = 1, opts = {}) {
  const p = new Prop('steel_cabinet_open', seed, opts); slim(p);
  const gy = p.paint('paint', { color: opts.color || '#a9b0b8', under: '#6a7075', chip: 0.5, rust: 0.2 });
  const dk = p.paint('paint', { color: '#4a5056', chip: 0.0, dirt: 0.7 });
  const chrome = p.paint('steel', { color: '#8a9298' });
  const W = 0.8, H = 0.95, D = 0.5, y0 = 0.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box([0.05, y0, 0.05], { at: [sx * (W / 2 - 0.03), y0 / 2, sz * (D / 2 - 0.04)], paint: dk, bevel: 0.01 });
  p.box([W, 0.03, D], { at: [0, y0 + 0.015, 0], paint: gy, bevel: 0.01 });
  p.box([W, 0.04, D], { at: [0, y0 + H - 0.02, 0], paint: gy, bevel: 0.012 });
  p.box([0.03, H, D], { at: [-W / 2 + 0.015, y0 + H / 2, 0], paint: gy, bevel: 0.008 });
  p.box([0.03, H, D], { at: [W / 2 - 0.015, y0 + H / 2, 0], paint: gy, bevel: 0.008 });
  p.box([W - 0.04, H, 0.02], { at: [0, y0 + H / 2, -D / 2 + 0.01], paint: dk, bevel: 0.004 });
  p.box([W - 0.05, 0.025, D - 0.04], { at: [0, y0 + H * 0.52, 0], paint: gy, bevel: 0.008 });
  const yel = p.paint('paint', { color: '#c6d02c', under: '#8f9440', chip: 0.5, rust: 0.4 });
  const cx = -0.12, cy = y0 + H * 0.52 + 0.0125;
  p.box([0.26, 0.34, 0.12], { at: [cx, cy + 0.17, -0.02], paint: yel, bevel: 0.025 });
  p.box([0.1, 0.03, 0.04], { at: [cx - 0.04, cy + 0.355, -0.02], paint: yel, bevel: 0.01 });
  p.cyl(0.022, 0.07, { at: [cx + 0.09, cy + 0.38, -0.02], rot: [0, 0, -0.5], paint: p.paint('paint', { color: '#d83a22', chip: 0 }), seg: 8 });
  p.box([0.2, 0.14, 0.2], { at: [0.22, cy + 0.07, 0.0], paint: p.paint('paint', { color: '#5b6a52', chip: 0.4 }), bevel: 0.015 });
  const dws = [];
  const mkDoor = (side) => {
    const n = p.node('door' + (side < 0 ? 'L' : 'R'), { at: [side * (W / 2 - 0.005), y0 + 0.03, D / 2 + 0.01] });
    p.in(n, () => {
      const dw = W / 2 - 0.02, dh = H - 0.08;
      p.box([dw, dh, 0.025], { at: [-side * dw / 2, dh / 2, 0], paint: gy, bevel: 0.01, deform: { amp: 0.002, freq: 5 } });
      p.box([dw - 0.06, dh - 0.08, 0.012], { at: [-side * dw / 2, dh / 2, 0.016], paint: gy, bevel: 0.006 });
      p.box([0.03, 0.2, 0.03], { at: [-side * (dw - 0.04), dh / 2, 0.03], paint: chrome, bevel: 0.008 });
      for (let k = 0; k < 4; k++) p.box([dw * 0.5, 0.012, 0.01], { at: [-side * dw / 2, dh - 0.12 - k * 0.04, 0.02], paint: dk, bevel: 0.002 });
    });
    dws.push(n);
  };
  mkDoor(-1); mkDoor(1);
  p.param('doors', opts.doors ?? 0.8, (v) => { dws[0].rotation.y = -v * 1.9; dws[1].rotation.y = v * 1.9; });
  return p.done();
}

// ---- tool_chest_rolling: opts.drawers 0..1
export function toolChestRolling(seed = 1, opts = {}) {
  const p = new Prop('tool_chest_rolling', seed, opts); slim(p);
  const red = p.paint('paint', { color: opts.color || '#d6232a', under: '#8d9296', chip: 0.5, rust: 0.08 });
  const dk = p.paint('paint', { color: '#2a2b2f', chip: 0.0, dirt: 0.5 });
  const steel = p.paint('steel', { color: '#8b9399' });
  const chrome = p.paint('chrome');
  const W = 1.1, H = 0.82, D = 0.55, y0 = 0.14;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.cyl(0.04, 0.03, { at: [sx * (W / 2 - 0.08), 0.1, sz * (D / 2 - 0.08)], paint: steel, seg: 8 });
    p.cyl(0.05, 0.04, { at: [sx * (W / 2 - 0.08), 0.05, sz * (D / 2 - 0.08)], rot: [0, 0, PI / 2], paint: dk, seg: 10 });
  }
  p.box([W, 0.04, D], { at: [0, y0 + 0.02, 0], paint: dk, bevel: 0.01 });
  p.box([W + 0.02, 0.04, D + 0.02], { at: [0, y0 + H + 0.02, 0], paint: red, bevel: 0.015 });
  p.box([0.03, H, D], { at: [-W / 2 + 0.015, y0 + H / 2 + 0.02, 0], paint: red, bevel: 0.01 });
  p.box([0.03, H, D], { at: [W / 2 - 0.015, y0 + H / 2 + 0.02, 0], paint: red, bevel: 0.01 });
  p.box([W - 0.04, H, 0.03], { at: [0, y0 + H / 2 + 0.02, -D / 2 + 0.015], paint: red, bevel: 0.01 });
  p.box([W - 0.04, 0.03, D - 0.04], { at: [0, y0 + 0.055, 0], paint: red, bevel: 0.008 });
  p.box([W - 0.06, H - 0.06, 0.02], { at: [0, y0 + H / 2 + 0.02, D / 2 - 0.05], paint: dk, bevel: 0.004 });
  for (const sx of [-1, 1]) p.tube([[sx * (W / 2 + 0.01), y0 + H - 0.04, -0.15], [sx * (W / 2 + 0.06), y0 + H - 0.04, -0.15], [sx * (W / 2 + 0.06), y0 + H - 0.04, 0.15], [sx * (W / 2 + 0.01), y0 + H - 0.04, 0.15]], 0.015, { paint: chrome, seg: 6, smooth: false });
  const ds = [];
  const rows = [[0.7, 0.11], [0.56, 0.11], [0.4, 0.16], [0.24, 0.12]];
  const toolCol = ['#d9b11d', '#e5671d', '#2f6bd0'];
  rows.forEach(([cy, h], i) => {
    const n = p.node('drawer' + i, { at: [0, y0 + cy - 0.14, D / 2 - 0.02] });
    ds.push(n);
    p.in(n, () => {
      const w = W - 0.08;
      p.box([w, h, 0.03], { at: [0, 0, 0], paint: red, bevel: 0.01 });
      p.tube([[-0.2, 0.0, 0.03], [-0.2, 0.0, 0.05], [0.2, 0.0, 0.05], [0.2, 0.0, 0.03]], 0.012, { paint: chrome, seg: 5, smooth: false });
      p.box([0.03, h - 0.02, D - 0.1], { at: [-w / 2 + 0.015, -0.01, -D / 2 + 0.05], paint: dk, bevel: 0.005 });
      p.box([0.03, h - 0.02, D - 0.1], { at: [w / 2 - 0.015, -0.01, -D / 2 + 0.05], paint: dk, bevel: 0.005 });
      p.box([w, 0.02, D - 0.1], { at: [0, -h / 2 + 0.02, -D / 2 + 0.05], paint: dk, bevel: 0.005 });
      p.box([w, h - 0.02, 0.02], { at: [0, -0.01, -D + 0.1], paint: dk, bevel: 0.005 });
      if (i < 3) {
        const cnt = i === 2 ? 6 : 9;
        for (let k = 0; k < cnt; k++) {
          const x = -w / 2 + 0.1 + (k / (cnt - 1)) * (w - 0.2) + (p.r() - 0.5) * 0.02;
          const z = -0.15 - p.r() * 0.2, y = -h / 2 + 0.035;
          const kind = (k + i) % 3;
          if (kind === 0) {
            p.cyl(0.013, 0.1, { at: [x, y, z], rot: [PI / 2, 0, 0.0], paint: p.paint('plastic', { color: toolCol[(k + i) % 3], chip: 0 }), seg: 6, bevel: 0.003 });
            p.cyl(0.004, 0.1, { at: [x, y, z - 0.09], rot: [PI / 2, 0, 0], paint: steel, seg: 4, bevel: 0.001 });
          } else if (kind === 1) {
            p.box([0.025, 0.012, 0.2], { at: [x, y, z], rot: [0, (p.r() - 0.5) * 0.3, 0], paint: steel, bevel: 0.004 });
            p.cyl(0.022, 0.012, { at: [x, y, z - 0.1], paint: steel, seg: 6, bevel: 0.003 });
          } else {
            p.box([0.03, 0.02, 0.16], { at: [x, y + 0.004, z], rot: [0, (p.r() - 0.5) * 0.3, 0], paint: p.paint('plastic', { color: '#d9b11d', chip: 0 }), bevel: 0.006 });
            p.box([0.025, 0.015, 0.08], { at: [x, y, z - 0.12], paint: steel, bevel: 0.003 });
          }
        }
      } else p.box([0.4, 0.07, 0.22], { at: [0.1, -h / 2 + 0.055, -0.25], paint: p.paint('paint', { color: '#e5671d', chip: 0.4 }), bevel: 0.01 });
    });
  });
  p.param('drawers', opts.drawers ?? 0.7, (v) => { ds.forEach((n, i) => { n.position.z = D / 2 - 0.02 + v * (i === 3 ? 0.07 : 0.34 - i * 0.07); }); });
  return p.done();
}

// ---- kettle_stove
export function kettleStove(seed = 1, opts = {}) {
  const p = new Prop('kettle_stove', seed, opts); slim(p);
  const olive = p.paint('paint', { color: opts.color || '#7d8f2c', under: '#5a6070', chip: 0.5, rust: 0.05 });
  const dk = p.paint('paint', { color: '#262a2e', chip: 0.0 });
  const ket = p.paint('metal', { color: '#3c4650', under: '#6a7279', chip: 0.2, rust: 0.2, dirt: 0.5, rough: 0.5 });
  p.box([0.3, 0.1, 0.24], { at: [0, 0.05, 0], paint: olive, bevel: 0.025 });
  p.cyl(0.06, 0.02, { at: [0, 0.108, -0.01], paint: dk, seg: 12 });
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; p.box([0.012, 0.016, 0.03], { at: [Math.cos(a) * 0.075, 0.12, -0.01 + Math.sin(a) * 0.075], rot: [0, -a, 0], paint: dk, bevel: 0.003 }); }
  p.cyl(0.026, 0.02, { at: [0.095, 0.05, 0.12], rot: [PI / 2, 0, 0], paint: p.paint('chrome', { color: '#c5cacd' }), seg: 10 });
  p.cyl(0.012, 0.03, { at: [0.095, 0.05, 0.14], rot: [PI / 2, 0, 0], paint: dk, seg: 6 });
  parts.decal(p, { shape: 'triangle', at: [-0.07, 0.05, 0.122], size: 0.07 });
  p.lathe([[0, 0.12], [0.1, 0.12], [0.115, 0.14], [0.115, 0.17], [0.1, 0.24], [0.075, 0.27], [0.05, 0.275], [0.0, 0.275]], { seg: 14, paint: ket });
  p.cyl(0.05, 0.012, { at: [0, 0.285, 0], paint: ket, seg: 10 });
  p.cyl(0.014, 0.025, { at: [0, 0.3, 0], paint: dk, seg: 6 });
  p.tube([[0.1, 0.17, 0.0], [0.15, 0.22, 0.0], [0.19, 0.28, 0.0]], 0.014, { paint: ket, seg: 6 });
  p.tube([[-0.08, 0.25, 0], [-0.08, 0.34, 0.0], [0, 0.4, 0], [0.08, 0.34, 0], [0.08, 0.25, 0]], 0.009, { paint: dk, seg: 5 });
  return p.done();
}

// ---- lug_wrench (lies flat on floor)
export function lugWrench(seed = 1, opts = {}) {
  const p = new Prop('lug_wrench', seed, opts); slim(p);
  const m = p.paint('chrome', { color: '#8d9398', under: '#6a7075', chip: 0, rust: 0.6, dirt: 0.5 });
  const dk = p.paint('metal', { color: '#4e5358', rust: 0.5 });
  const y = 0.014;
  if (opts.shape === 'cross') { // 4-way cross wrench
    const L = 0.42;
    p.cyl(0.011, L, { at: [0, y, 0], rot: [0, 0, PI / 2], paint: m, seg: 7 });
    p.cyl(0.011, L * 0.8, { at: [0, y, 0], rot: [PI / 2, 0, 0], paint: m, seg: 7 });
    for (const [x, z] of [[-L / 2, 0], [L / 2, 0], [0, L * 0.4], [0, -L * 0.4]]) p.cyl(0.022, 0.03, { at: [x, y, z], paint: dk, seg: 6, bevel: 0.004 });
    return p.done();
  }
  // L-shaped tyre iron (as in the workshop scene): socket on the short bent leg, flat pry tip on the long one
  const r = 0.011;
  p.tube([[0.0, 0.06, -0.02], [0.0, 0.03, 0.0], [0.02, y, 0.0], [0.42, y, 0.0]], r, { paint: m, seg: 6, smooth: true });
  p.cyl(0.024, 0.05, { at: [0, 0.075, -0.024], rot: [-0.6, 0, 0], paint: dk, seg: 6, bevel: 0.004 });
  p.box([0.07, 0.008, 0.032], { at: [0.45, y - 0.002, 0], rot: [0, 0, -0.12], paint: m, bevel: 0.003 });
  return p.done();
}

// ---- shell_casings: opts.count, opts.radius
export function shellCasings(seed = 1, opts = {}) {
  const p = new Prop('shell_casings', seed, opts); slim(p);
  const br = p.paint('chrome', { color: '#d1a24a', under: '#a67c2e', chip: 0, rust: 0.1, dirt: 0.2, rough: 0.35, metal: 0.75 });
  const wh = p.paint('paint', { color: '#efe9da', chip: 0, dirt: 0.5 }), tip = p.paint('paint', { color: '#c9892f', chip: 0 });
  const n = opts.count ?? 14, R = opts.radius ?? 0.5;
  for (let i = 0; i < n; i++) {
    const a = p.r() * PI * 2, d = Math.sqrt(p.r()) * R, x = Math.cos(a) * d, z = Math.sin(a) * d, ry = p.r() * PI * 2;
    if (p.chance(0.25)) {
      p.cyl(0.0045, 0.03, { at: [x, 0.005, z], rot: [0, ry, PI / 2], paint: wh, seg: 5, bevel: 0.001 });
      p.cyl(0.0046, 0.01, { at: [x + Math.cos(ry) * 0.02, 0.005, z - Math.sin(ry) * 0.02], rot: [0, ry, PI / 2], paint: tip, seg: 5, bevel: 0.001 });
    } else if (p.chance(0.2)) {
      p.cyl(0.006, 0.04, { at: [x, 0.02, z], paint: br, seg: 6, r2: 0.0045, bevel: 0.001 });
    } else {
      p.cyl(0.006, 0.04, { at: [x, 0.006, z], rot: [0, ry, PI / 2], paint: br, seg: 6, r2: 0.0045, bevel: 0.001 });
    }
  }
  return p.done();
}

export const PROPS = [
  { id: 'gunsmith_bench', name: 'Bàn thợ súng', build: gunsmithBench, yaw: 0.35, sceneYaw: -0.85,
    variants: [{ label: 'ngăn mở', seed: 1, opts: { drawers: 0.6 } }, { label: 'đóng, cũ', seed: 2, opts: { drawers: 0, wear: 0.95 } }, { label: 'xanh', seed: 3, opts: { drawers: 1, color: '#4f7a6a', wear: 0.4 } }] },
  { id: 'reloading_press', name: 'Máy nạp đạn', build: reloadingPress, yaw: 0.3,
    variants: [{ label: 'đỏ', seed: 1, opts: {} }, { label: 'ép', seed: 2, opts: { press: 1, wear: 0.9 } }] },
  { id: 'cutting_mat', name: 'Tấm lót cắt', build: cuttingMat, yaw: 0,
    variants: [{ label: 'xanh', seed: 1, opts: {} }, { label: 'đen', seed: 2, opts: { color: '#2a3238', line: '#55616a', wear: 0.9 } }] },
  { id: 'bench_vise', name: 'Ê-tô', build: benchVise, yaw: 0.4,
    variants: [{ label: 'khép', seed: 1, opts: { jaw: 0 } }, { label: 'mở', seed: 2, opts: { jaw: 1, wear: 0.9 } }, { label: 'đỏ', seed: 3, opts: { color: '#cf2a24' } }] },
  { id: 'desk_lamp', name: 'Đèn bàn', build: deskLamp, yaw: 0.2,
    variants: [{ label: 'sáng', seed: 1, opts: {} }, { label: 'duỗi', seed: 2, opts: { arm: 1 } }, { label: 'gập', seed: 3, opts: { arm: 0, lit: false } }] },
  { id: 'walkie_talkie', name: 'Bộ đàm', build: walkieTalkie, yaw: 0.3,
    variants: [{ label: 'đen', seed: 1, opts: {} }, { label: 'xanh', seed: 2, opts: { color: '#2c4a2c', wear: 0.9 } }] },
  { id: 'ashtray', name: 'Gạt tàn', build: ashtray, yaw: 0,
    variants: [{ label: '4 mẩu', seed: 1, opts: {} }, { label: 'đầy', seed: 2, opts: { butts: 8, wear: 0.9 } }] },
  { id: 'bottles_oil', name: 'Chai keo dầu', build: bottlesOil, yaw: 0.2,
    variants: [{ label: '2 chai', seed: 1, opts: {} }, { label: '3 chai', seed: 2, opts: { count: 3, color: '#2f7fd0' } }] },
  { id: 'mug', name: 'Cốc', build: mug, yaw: 0.5,
    variants: [{ label: 'xám', seed: 1, opts: {} }, { label: 'đỏ', seed: 2, opts: { color: '#c4412f', coffee: false } }] },
  { id: 'dynamite_bundle', name: 'Bó thuốc nổ', build: dynamiteBundle, yaw: 0.3,
    variants: [{ label: '5 thanh', seed: 1, opts: {} }, { label: '3 thanh', seed: 2, opts: { sticks: 3 } }] },
  { id: 'detonator_box', name: 'Hộp kích nổ', build: detonatorBox, yaw: 0.2,
    variants: [{ label: 'đỏ', seed: 1, opts: {} }, { label: 'cam', seed: 2, opts: { color: '#e5671d', wear: 0.9 } }] },
  { id: 'steel_cabinet_open', name: 'Tủ thép mở', build: steelCabinetOpen, yaw: 0.35, sceneYaw: 0.25,
    variants: [{ label: 'mở', seed: 1, opts: {} }, { label: 'khép', seed: 2, opts: { doors: 0 } }, { label: 'xanh', seed: 3, opts: { doors: 1, color: '#6f8f9a', wear: 0.9 } }] },
  { id: 'tool_chest_rolling', name: 'Tủ đồ nghề đỏ', build: toolChestRolling, yaw: 0.35, sceneYaw: -1.35,
    variants: [{ label: 'mở', seed: 1, opts: {} }, { label: 'đóng', seed: 2, opts: { drawers: 0 } }, { label: 'xanh', seed: 3, opts: { drawers: 1, color: '#2a62c8', wear: 0.9 } }] },
  { id: 'kettle_stove', name: 'Ấm trên bếp ga', build: kettleStove, yaw: 0.2,
    variants: [{ label: 'olive', seed: 1, opts: {} }, { label: 'đỏ', seed: 2, opts: { color: '#c8322a', wear: 0.9 } }] },
  { id: 'lug_wrench', name: 'Tay vặn ốc', build: lugWrench, yaw: 0.6,
    variants: [{ label: 'cũ', seed: 1, opts: {} }, { label: 'gỉ', seed: 2, opts: { wear: 1 } }, { label: 'chữ thập', seed: 3, opts: { shape: 'cross' } }] },
  { id: 'shell_casings', name: 'Vỏ đạn vương sàn', build: shellCasings, yaw: 0,
    variants: [{ label: '14', seed: 1, opts: {} }, { label: '30 rộng', seed: 2, opts: { count: 30, radius: 0.9 } }] },
];
