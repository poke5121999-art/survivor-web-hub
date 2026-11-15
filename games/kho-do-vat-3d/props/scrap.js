// Scrap buggy (welded grey/white hull on a red-white chassis) and tall wooden fence panel, from the campfire scene.
import { Prop } from '../lib/prop.js';
import * as parts from '../lib/parts.js';

const PI = Math.PI;

// Welded scrap cart. Long axis X (handle at -X, nose at +X), wheels roll about X-axis axles.
// opts: wheels (4|2), handle ('rail'|'long'), spikes (count of rebar clusters), load ('none'|'drum'|'tyre'), roll (0..1 wheel spin), R (wheel radius)
export function scrapCart(seed = 1, opts = {}) {
  const p = new Prop('scrap_cart', seed, opts);
  const wheelsN = opts.wheels ?? 4, spikes = opts.spikes ?? 6;
  const hull = p.paint('paint', { color: '#cfd1d1', under: '#8a8f93', pattern: 'mottle', col2: '#9a9ea2', patW: 0.45, chip: 0.55, rust: 0.05, dirt: 0.4, splat: 0.1, splatScale: 0.5 });
  const hullDk = p.paint('paint', { color: '#8d9296', under: '#6b7075', chip: 0.5, rust: 0.2, dirt: 0.5 });
  const red = p.paint('paint', { color: '#d8262a', col2: '#f2f2ee', pattern: 'stripes', patW: 0.16, chip: 0.5, under: '#9a9ea2', rust: 0.1, dirt: 0.5 });
  const steel = p.paint('steel', { color: '#4d5257', under: '#8a8f93', chip: 0.3, rust: 0.35 });
  const W = 0.78;

  // red chassis: two side beams + cross members, wedge-nosed
  for (const s of [-1, 1]) p.extrude([[-0.85, 0.3], [0.95, 0.3], [1.05, 0.44], [0.95, 0.56], [-0.85, 0.56]], 0.1, { at: [0, 0, s * (W / 2 - 0.05)], paint: red, bevel: 0.02 });
  for (const x of [-0.6, 0.0, 0.62]) p.box([0.12, 0.1, W - 0.05], { at: [x, 0.36, 0], paint: red, bevel: 0.015 });
  const axles = wheelsN === 2 ? [0.25] : [-0.55, 0.62];
  const R = opts.R ?? 0.38;
  for (const x of axles) p.cyl(0.035, W + 0.34, { at: [x, R, 0], rot: [0, 0, PI / 2], paint: steel, seg: 8 });

  // hull: angular hood block (side profile extruded across the width) + roof plate + nose block
  const side = [[-0.78, 0.5], [0.88, 0.5], [0.88, 0.66], [0.55, 0.98], [-0.2, 1.06], [-0.62, 0.9], [-0.78, 0.74]];
  p.extrude(side, W - 0.12, { paint: hull, bevel: 0.035 });
  p.extrude([[-0.2, 1.06], [0.55, 0.98], [0.5, 1.12], [-0.12, 1.16]], W - 0.3, { paint: hullDk, bevel: 0.02 });
  p.box([0.5, 0.2, W + 0.02], { at: [0.62, 0.62, 0], paint: hullDk, bevel: 0.025, rot: [0, 0, -0.06] });
  for (const s of [-1, 1]) { // proud patch panels: welded patchwork read
    p.box([0.62, 0.34, 0.03], { at: [0.18, 0.78, s * (W / 2 - 0.045)], paint: hull, bevel: 0.012, rot: [0, 0, 0.1 * s] });
    p.box([0.36, 0.22, 0.03], { at: [-0.42, 0.7, s * (W / 2 - 0.045)], paint: hullDk, bevel: 0.01, rot: [0, 0, -0.08] });
  }
  parts.loop(p, { at: [0.18, 1.14, 0], w: 0.4, h: 0.26, r: 0.03, paint: p.paint('steel', { color: '#3d4146', chip: 0, rust: 0.2 }) });

  const load = opts.load ?? 'none';
  if (load === 'drum') parts.drum(p, { at: [-0.4, 1.3, 0], r: 0.22, h: 0.55, paint: p.paint('paint', { color: '#e06a2c', rust: 0.5, chip: 0.5 }), seg: 14 });
  else if (load === 'tyre') parts.tyre(p, { at: [-0.35, 1.22, 0], R: 0.3, w: 0.2, ri: 0.16 });

  // pushing handle (rear) + cross brace, grey grab rail along each flank
  const hl = opts.handle === 'long' ? 1.55 : 1.25;
  p.tube([[-0.7, 0.62, -0.3], [-hl, 1.0, -0.3], [-hl, 1.0, 0.3], [-0.7, 0.62, 0.3]], 0.03, { paint: steel, seg: 6, smooth: false });
  p.tube([[-0.95, 0.9, -0.3], [-0.95, 0.9, 0.3]], 0.022, { paint: steel, seg: 6 });
  for (const s of [-1, 1]) p.tube([[-0.5, 0.78, s * (W / 2 + 0.03)], [-0.3, 1.0, s * (W / 2 + 0.05)], [0.3, 1.0, s * (W / 2 + 0.05)], [0.55, 0.8, s * (W / 2 + 0.03)]], 0.024, { paint: p.paint('metal', { color: '#9aa0a5', chip: 0.3, rust: 0.2 }), seg: 6, smooth: true });

  // rebar spike clusters stuck into the hull + welded crosses on the hood
  const cl = [[-0.5, 1.0, -0.2, [0, 1, -0.5]], [0.05, 1.12, 0.25, [0.4, 1, 0.3]], [0.35, 1.02, -0.28, [0.5, 0.7, -0.9]], [0.7, 0.9, 0.2, [1, 0.5, 0.2]],
    [-0.75, 0.7, 0.3, [-1, 0.4, 0.3]], [0.1, 0.9, 0.4, [0, 0.3, 1]], [-0.1, 0.95, -0.4, [0, 0.3, -1]], [0.85, 0.7, -0.15, [1, 0.3, -0.5]]];
  for (let i = 0; i < Math.min(spikes, cl.length); i++) { const c = cl[i]; parts.rebar(p, { at: [c[0], c[1], c[2]], dir: c[3], count: 2 + (i % 2), len: 0.18 + (i % 3) * 0.04, spread: 0.1 }); }
  const bar = p.paint('rusty', { color: '#4a4540', rust: 0.5 });
  for (const [x, z] of [[0.3, 0.2], [-0.25, -0.18]]) {
    p.tube([[x - 0.14, 1.07, z], [x + 0.14, 1.09, z]], 0.012, { paint: bar, seg: 5, smooth: false });
    p.tube([[x, 1.08, z - 0.1], [x + 0.02, 1.1, z + 0.1]], 0.012, { paint: bar, seg: 5, smooth: false });
  }

  // big wheels: black tyre with a large grey hub disc
  const nodes = [];
  const hub = p.paint('steel', { color: '#8e9296', chip: 0.3, rust: 0.2, dirt: 0.5 });
  for (const x of axles) for (const s of [-1, 1]) nodes.push(parts.wheel(p, { name: 'wheel', at: [x, R, s * (W / 2 + 0.1)], R, w: 0.24, ri: R * 0.62, rimPaint: hub }));
  p.param('roll', opts.roll ?? 0, (v) => { for (const n of nodes) n.rotation.x = v * PI * 2; });
  return p.done();
}

// Tall wooden fence panel: wide uneven planks (jagged / broken tops) on two rails. Length along X, planks face +Z.
// opts: width, planks, height, lean (rad), gaps (missing planks)
export function fencePanel(seed = 1, opts = {}) {
  const p = new Prop('fence_panel', seed, opts);
  const W = opts.width ?? 1.5, n = opts.planks ?? 8, H = opts.height ?? 1.35, pw = W / n;
  const woods = ['#a4553f', '#b3644c', '#8f4a38', '#bb6f54', '#9c5440'];
  const rail = p.paint('wood', { color: '#b26b50', dirt: 0.5, chip: 0.2 });
  const root = p.node('panel', { rot: [0, 0, opts.lean ?? 0] });
  p.in(root, () => {
    for (const y of [0.3, H * 0.62]) p.box([W + 0.06, 0.11, 0.035], { at: [0, y, -0.03], paint: rail, bevel: 0.01, rot: [0, 0, (p.r() - 0.5) * 0.03] });
    for (let i = 0; i < n; i++) {
      if (opts.gaps && i % 4 === 2) continue;
      const x = -W / 2 + pw * (i + 0.5);
      const tall = p.chance(0.55), h = (tall ? H : H * (0.55 + p.r() * 0.3)) * (0.92 + p.r() * 0.12), w = pw * (0.82 + p.r() * 0.14);
      const top = p.chance(0.6)
        ? [[w / 2, h - 0.25 - p.r() * 0.2], [w * 0.15, h - 0.05], [w * 0.05, h - 0.16 - p.r() * 0.1], [-w * 0.1, h + 0.02], [-w / 2, h - 0.18 - p.r() * 0.1]]
        : [[w / 2, h - 0.03], [-w / 2, h - 0.03 - p.r() * 0.06]];
      p.extrude([[-w / 2, 0], [w / 2, 0], ...top], 0.03, { at: [x, p.r() * 0.05, (p.r() - 0.5) * 0.04], rot: [(p.r() - 0.5) * 0.06, 0, (p.r() - 0.5) * 0.1],
        paint: p.paint('wood', { color: woods[(p.r() * woods.length) | 0], dirt: 0.55, chip: 0.3 }), bevel: 0.006 });
    }
  });
  return p.done();
}

export const PROPS = [
  { id: 'scrap_cart', name: 'Xe đẩy phế liệu hàn', build: scrapCart, yaw: -0.55,
    variants: [{ label: '4 bánh', seed: 1, opts: {} }, { label: 'gỉ, tay dài', seed: 2, opts: { wear: 1, handle: 'long', load: 'drum' } }, { label: '2 bánh', seed: 3, opts: { wheels: 2, spikes: 5, load: 'tyre' } }] },
  { id: 'fence_panel', name: 'Tấm rào ván cao', build: fencePanel, yaw: 0.2,
    variants: [{ label: 'cao', seed: 1, opts: {} }, { label: 'thấp thưa', seed: 2, opts: { height: 1.0, gaps: true, wear: 1 } }, { label: 'nghiêng', seed: 3, opts: { lean: 0.12, planks: 7 } }] },
];
