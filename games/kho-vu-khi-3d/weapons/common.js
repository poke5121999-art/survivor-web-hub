// Shared melee/tool builders (cm, +Y toward the tip, +X toward the edge, flat faces +/-Z).
// Real proportions: knife scales 1.1-1.4 cm thick on a 0.25-0.4 cm tang, blades 0.18-0.6 cm at the spine with a
// flat grind to a ~0.03 cm edge, bat barrels 6.6 cm, axe handles 3.2x2.4 cm ovals, tape 0.06 cm per layer.
import { G, arc, teeth, roundPoly, rgb } from '../js/kit.js';

export const C = {
  black: 0x1b1c1f, dark: 0x2a2c31, red: 0xa3201b, blue: 0x1f4fb0, teal: 0x2a7f86, green: 0x2c6e3a, orange: 0xc9561a,
  yellow: 0xd99a1c, tape: 0xcfc6b0, tapeDirty: 0xa99f88, purple: 0x6a2f9a, white: 0xd8d6cf,
};
// wood stains as vertex multipliers over Saltline's natural wood bake
export const WOOD = { raw: [1, 1, 1], red: [1.15, 0.62, 0.45], dark: [0.55, 0.42, 0.34], walnut: [0.72, 0.5, 0.36], ash: [1.12, 1.0, 0.85], black: [0.3, 0.28, 0.27] };

/** contiguous runs of outline indices where pred(point, index) holds -> [[i0,i1],...] (for G.blade edge) */
export function edgeRuns(pts, pred) {
  const n = pts.length, on = pts.map((p, i) => !!pred(p, i)), runs = [];
  if (on.every(Boolean)) return [[0, n - 1]];
  let s = on.findIndex((v, i) => v && !on[(i + n - 1) % n]);
  if (s < 0) return runs;
  for (let c = 0, i = s; c < n; c++, i = (i + 1) % n) {
    if (on[i] && !on[(i + n - 1) % n]) s = i;
    if (on[i] && !on[(i + 1) % n]) runs.push([s, i]);
  }
  return runs;
}

/** Knife blade outline from y=0 (heel) to the tip. Returns {pts, edge, tip:[x,y]} */
export function knifeOutline(L, W, tip = 'drop', o = {}) {
  const w = W / 2, pts = [], n = 14;
  const tipX = { drop: -w * 0.35, clip: -w * 0.15, point: -w * 0.55, spear: 0, straight: -w, tanto: -w * 0.2 }[tip] ?? -w * 0.3;
  const bellyStart = o.belly ?? (tip === 'point' ? 0.35 : 0.5);
  // heel + choil
  pts.push([-w, 0], [w * 0.55, 0], [w * 0.62, 0.35], [w, 0.55]);
  const e0 = pts.length - 1;
  for (let i = 1; i <= n; i++) {
    const t = i / n, y = 0.55 + (L - 0.55) * t;
    const b = Math.max(0, (t - bellyStart) / (1 - bellyStart));
    const x = tip === 'straight' ? w : w - (w - tipX) * Math.pow(b, tip === 'point' ? 1.5 : 2.2);
    pts.push([i === n ? tipX : x, y]);
  }
  const tipI = pts.length - 1;
  // spine back down
  const clipAt = o.clip ?? 0.72;
  for (let i = n - 1; i >= 1; i--) {
    const t = i / n, y = L * t;
    let x;
    if (tip === 'clip') x = t > clipAt ? -w + (tipX + w) * Math.pow((t - clipAt) / (1 - clipAt), 0.9) + (t > clipAt ? -0.0 : 0) : -w;
    else if (tip === 'spear') x = -w + (w - 0) * Math.pow(Math.max(0, (t - bellyStart) / (1 - bellyStart)), 2.2);
    else if (tip === 'drop') x = t > 0.7 ? -w + (tipX + w) * Math.pow((t - 0.7) / 0.3, 1.6) : -w;
    else if (tip === 'point') x = t > 0.6 ? -w + (tipX + w) * Math.pow((t - 0.6) / 0.4, 1.3) : -w;
    else x = -w;
    pts.push([x, y]);
  }
  const edge = [[e0, tipI]];
  if (tip === 'spear') edge.push([tipI, pts.length - 1]);
  if (tip === 'clip' && o.swedge) edge.push([tipI, tipI + Math.round(n * (1 - clipAt))]);
  return { pts, edge, tip: [tipX, L] };
}

const mv = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

/** slab handle (scales on a full tang) along +Y from 0..hl */
export function slabHandle(k, o) {
  const hl = o.hl, hw = o.hw ?? 2.4, hd = o.hd ?? 1.6, tang = o.tang ?? 0.3;
  const out = roundPoly([[-hw * 0.47, 0], [hw * 0.45, 0], [hw * 0.52, hl * 0.32], [hw * 0.47, hl], [-hw * 0.5, hl], [-hw * 0.52, hl * 0.45]], Math.min(0.9, hw * 0.3), 3);
  const sc = (hd - tang) / 2;
  const mat = o.mat ?? ['polymer', o.col ?? C.black];
  for (const s of [-1, 1]) k.add(G.extrude(out, sc, Math.min(0.42, sc * 0.48)), mat, { p: [0, 0, s * (tang / 2 + sc / 2)], col: o.vcol, wear: 0.15, grain: 'y', blood: o.blood });
  if (o.showTang !== false) k.add(G.extrude(out.map(([x, y]) => [x * 0.985, y]), tang + 0.02, 0.05), 'steel_satin', { grain: 'y' });
  for (const y of o.rivets ?? [hl * 0.25, hl * 0.62]) k.add(G.cyl(0.26, 0.26, hd + 0.05, 10, 0.06), o.rivetMat ?? 'steel_satin', { p: [0, y, -(hd + 0.05) / 2], r: [90, 0, 0], col: o.rivetCol });
  if (o.lanyard) k.add(G.pipe(0.32, hd + 0.05, 0.08, 12), 'steel_satin', { p: [-hw * 0.05, hl * 0.08, -(hd + 0.05) / 2], r: [90, 0, 0] });
  return out;
}

/** round (wrapped / turned) handle along +Y */
export function roundHandle(k, o) {
  const hl = o.hl, r0 = o.r0 ?? 1.2, r1 = o.r1 ?? r0 * 1.05, mat = o.mat ?? ['polymer', o.col ?? C.black];
  k.add(G.lathe([[0, 0], [r0 * 0.8, 0], [r0, 0.35], [r0 * 1.04, hl * 0.4], [r1, hl - 0.3], [r1 * 0.9, hl], [0, hl]], 18), mat, { col: o.vcol, wear: 0.1 });
}

/** tape / cloth wrap around a Y-axis cylinder between y0..y1. rx/rz = radius under the wrap */
export function wrap(k, y0, y1, rx, rz, mat, o = {}) {
  const band = o.band ?? 1.9, t = o.t ?? 0.06, tilt = (o.tilt ?? 7) * 0.5, over = Math.max(o.over ?? 0.3, 0.3);
  const n = Math.max(1, Math.round((y1 - y0) / (band * (1 - over))));
  const h = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const y = y0 + h * (i + 0.5), lay = t * (1 + (i % 2) * 0.6);
    const r = 1, prof = [[r - 0.02, -band / 2], [r + lay, -band / 2 + 0.05], [r + lay, band / 2 - 0.05], [r - 0.02, band / 2]];
    const g = G.lathe(prof, o.seg ?? 22);
    g.scale(rx + 0.0, 1, rz);
    // lathe radius 1 scaled to rx/rz; the band thickness is scaled too, so add it back as an offset look
    k.add(g, mat, { p: [0, y, 0], r: [(i % 2 ? 1 : -1) * tilt * (o.cross ? 3.2 : 1), (i * 47) % 360, 0], col: o.col, wear: 0, blood: o.blood, grime: o.grime ?? 0.25 });
  }
  if (o.tail) k.add(G.box(band * 0.9, band * 1.6, t * 2, 0.02), mat, { p: [rx + 0.1, y1 - band * 0.6, 0], r: [0, 0, 8], col: o.col, grime: 0.3 });
}

/** nails driven radially into a Y-axis body, heads inside, points out */
export function nails(k, n, y0, y1, r, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = k.rnd() * Math.PI * 2, y = y0 + (y1 - y0) * k.rnd(), L = (o.len ?? 6) * (0.8 + 0.4 * k.rnd());
    const bend = (k.rnd() - 0.5) * 22;
    // nail: point at its origin, head at +Y. Turn +Y inward so the point sticks out of the body by `out`
    const out = L * (o.out ?? 0.55);
    k.add(G.nail(L, o.r ?? 0.22), o.mat ?? 'steel_rusty', { p: [Math.cos(a) * (r + out), y, Math.sin(a) * (r + out)], r: [0, -a * 180 / Math.PI, 90 + bend], blood: o.blood, wear: 0.2 });
  }
}

/** barbed wire spiral around a Y-axis body */
export function barbedWire(k, y0, y1, rFn, o = {}) {
  const turns = o.turns ?? 6, pts = [], N = turns * 16;
  for (let i = 0; i <= N; i++) { const t = i / N, a = t * turns * Math.PI * 2, r = rFn(t) + 0.12; pts.push([Math.cos(a) * r, y0 + (y1 - y0) * t, Math.sin(a) * r]); }
  // two twisted strands
  for (const ph of [0, Math.PI]) k.add(G.tube(pts.map(([x, y, z], i) => { const a = i * 1.3 + ph; return [x * (1 + 0.04 * Math.cos(a)), y + 0.1 * Math.sin(a), z * (1 + 0.04 * Math.cos(a))]; }), o.th ?? 0.12, 6), o.mat ?? 'steel_rusty', { wear: 0.2, blood: o.blood });
  if (o.barbs !== false) for (let i = 8; i < N; i += 9) {
    const [x, y, z] = pts[i], a = Math.atan2(z, x);
    for (const s of [-1, 1]) k.add(G.cyl(0.07, 0.03, 1.4, 5, 0.01), o.mat ?? 'steel_rusty', { p: [x, y, z], r: [s * 40, -a * 180 / Math.PI, -90 + s * 35] });
  }
}

/** Baseball bat profile (r, y) - real 33" bat scaled to len */
export function batProfile(len = 84) {
  const s = len / 84;
  return [[0, 0], [2.2, 0], [2.45, 0.5], [2.3, 1.4], [1.35, 2.6], [1.25, 6 * s], [1.3, 24 * s], [1.6, 36 * s], [2.4, 50 * s], [3.1, 62 * s], [3.35, 72 * s], [3.35, 79 * s], [3.15, len - 2], [2.6, len - 0.8], [1.2, len - 0.1], [0, len]];
}
export function bat(k, o = {}) {
  const len = o.len ?? 84;
  k.add(G.lathe(batProfile(len), 24), o.mat ?? 'wood', { col: o.stain ?? WOOD.red, wear: 0.1, grain: 'y', blood: o.blood, grime: o.grime ?? 0.15 });
  if (o.grip !== false) wrap(k, 2.8, o.gripTo ?? 22, 1.27, 1.27, ['tape', o.gripCol ?? C.black], { band: 1.6, tilt: 9 });
  k.grip([0, 11, 0]); k.grip2([0, 19, 0]); k.tip([0, len, 0]); k.edge([3.3, 50, 0], [3.3, 80, 0]);
}

/** oval wooden shaft (axe/hammer handle) along +Y, rx across the edge, rz flat */
export function shaft(k, len, rx, rz, o = {}) {
  const prof = [[0, 0], [rx * 1.15, 0], [rx * 1.25, 0.6], [rx * 1.1, 2.5], [rx * 0.92, 8], [rx * 0.95, len * 0.6], [rx, len - 0.6], [rx * 0.9, len], [0, len]];
  const g = G.lathe(prof, 20); g.scale(1, 1, rz / rx);
  k.add(g, o.mat ?? 'wood', { col: o.stain ?? WOOD.raw, wear: 0.05, grain: 'y', blood: o.blood, grime: o.grime ?? 0.2 });
}

/** steel pipe along +Y */
export function pipe(k, len, r, o = {}) {
  k.add(G.pipe(r, len, o.wall ?? 0.32, 20, 0.06), o.mat ?? 'galv', { col: o.col, wear: 0.3, blood: o.blood, grime: o.grime ?? 0.3, p: o.p, r: o.r });
}

/** curved katana blade outline (edge +X), length L from y=0 */
export function katanaOutline(L, W, curve) {
  const sp = [], ed = [], n = 18;
  for (let i = 0; i <= n; i++) { const t = i / n, c = curve * t * t, w = W * (1 - 0.22 * t); sp.push([c - w / 2, L * t]); ed.push([c + w / 2, L * t]); }
  const kissaki = [[curve + W * 0.36, L * 0.975], [curve + W * 0.15, L * 1.0], [curve - W * 0.25, L * 1.02]];
  const pts = [sp[0], ed[0], ...ed.slice(1, n - 1), ...kissaki, ...sp.slice(1, n - 1).reverse()];
  return { pts, edge: [[1, n - 2 + 2]], tip: kissaki[2] };
}

/** wedge axe head: outline in XY, thick at the eye, ground to the edge on +X */
export function axeHead(k, pts, o = {}) {
  const g = G.blade(pts, { d: o.d ?? 2.6, b: 0.2, edge: o.edge ?? edgeRuns(pts, (p) => p[0] > (o.edgeX ?? 6)), grind: o.grind ?? 6, thin: 0.07 });
  k.add(g, o.mat ?? 'steel_worn', { p: o.p, col: o.col, wear: 0.25, blood: o.blood, grime: 0.2 });
}

export { G, arc, teeth, roundPoly, rgb, mv };

/** Generic knife: handle (slab or round) + bolster/guard + ground blade. Sockets set. Returns blade info. */
export function knife(k, o) {
  const hl = o.hl ?? 10, hw = o.hw ?? 2.4, hd = o.hd ?? 1.6, L = o.L ?? 16, W = o.W ?? 3.6, bd = o.bd ?? 0.25;
  const B = o.blood ?? k.defBlood ?? 0;
  if (o.handle === 'round') roundHandle(k, { hl, r0: hw / 2 * 0.95, r1: hw / 2, mat: o.hmat ?? ['polymer', o.hcol ?? C.black], vcol: o.hvcol });
  else slabHandle(k, { hl, hw, hd, mat: o.hmat ?? ['polymer', o.hcol ?? C.black], vcol: o.hvcol, rivets: o.rivets, showTang: o.tang !== false, lanyard: o.lanyard, rivetMat: o.rivetMat });
  for (const b of o.bands || []) {
    const g = o.handle === 'round' ? G.cyl(hw / 2 + 0.08, hw / 2 + 0.08, b.h, 18, 0.05) : G.box(hw * 1.04, b.h, hd + 0.08, 0.12);
    k.add(g, b.mat ?? ['plastic', b.col], { p: o.handle === 'round' ? [0, b.y - b.h / 2, 0] : [0, b.y, 0], grime: 0.2 });
  }
  if (o.wrap) wrap(k, o.wrap.y0, o.wrap.y1, hw / 2 + 0.02, (o.handle === 'round' ? hw : hd) / 2 + 0.02, o.wrap.mat ?? ['fabric', o.wrap.col], { band: o.wrap.band ?? 1.3, tilt: o.wrap.tilt ?? 10, cross: o.wrap.cross });
  if (o.pommel) k.add(G.box(hw * 1.08, 0.9, hd * 1.08, 0.3), o.pommelMat ?? 'steel_satin', { p: [0, -0.35, 0], wear: 0.3 });
  let y0 = hl;
  if (o.bolster !== false && !o.guard) {
    const bw = Math.max(hw, W) * 0.98, bh = o.bolsterH ?? 1.1;
    k.add(G.extrude(roundPoly([[-bw * 0.5, 0], [bw * 0.5, 0], [W * 0.52, bh], [-W * 0.5, bh]], 0.25, 2), hd * 0.92, 0.22), o.bolsterMat ?? 'steel_satin', { p: [0, hl - 0.15, 0], wear: 0.3 });
    y0 = hl + bh * 0.6;
  }
  if (o.guard) {
    const gw = W + (o.guardW ?? 2.4);
    k.add(G.box(gw, 0.7, Math.max(hd, 1.2) * 0.95, 0.25), o.guardMat ?? 'steel_satin', { p: [0, hl + 0.3, 0], wear: 0.3 });
    y0 = hl + 0.6;
  }
  const K = o.pts ? { pts: o.pts, edge: o.edge, tip: o.tipPt } : knifeOutline(L, W, o.tip ?? 'drop', o);
  const pts = mv(K.pts, 0, y0);
  k.add(G.blade(pts, { d: bd, b: 0.04, edge: K.edge, grind: o.grind ?? W * 0.7, thin: 0.12, holes: o.holes }), o.bmat ?? 'steel', { col: o.bcol, wear: 0.15, blood: B, grain: 'y' });
  if (o.fuller) k.add(G.box(0.35, L * o.fuller, bd * 1.2, 0.1), 'steel_dark', { p: [-W * 0.18, y0 + L * 0.35, 0] });
  k.grip([0, hl * 0.45, 0], [0, 1, 0], [1, 0, 0]);
  k.tip([K.tip[0], K.tip[1] + y0, 0]);
  k.edge([W / 2, y0 + 0.5, 0], [W / 2 * 0.6, y0 + L * 0.85, 0]);
  return { y0, pts };
}

/** circular saw disc outline (XY), n teeth of height h, with gullets; returns {pts, edge} */
export function sawDisc(R, n, h, o = {}) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = a0 + (a1 - a0) * 0.18;
    const g = R - (o.gullet ?? h * 0.35);
    pts.push([Math.cos(a0) * g, Math.sin(a0) * g]);
    pts.push([Math.cos(am) * (R + h), Math.sin(am) * (R + h)]);
    pts.push([Math.cos(a0 + (a1 - a0) * 0.55) * R, Math.sin(a0 + (a1 - a0) * 0.55) * R]);
  }
  return { pts, edge: [[0, pts.length - 1]] };
}
/** spur gear outline */
export function gearOutline(R, n, h) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, s = Math.PI / n;
    pts.push([Math.cos(a - s * 0.5) * R, Math.sin(a - s * 0.5) * R], [Math.cos(a - s * 0.28) * (R + h), Math.sin(a - s * 0.28) * (R + h)], [Math.cos(a + s * 0.28) * (R + h), Math.sin(a + s * 0.28) * (R + h)], [Math.cos(a + s * 0.5) * R, Math.sin(a + s * 0.5) * R]);
  }
  return pts;
}
export const circle = (cx, cy, r, n = 20, rev = false) => { const o = arc(cx, cy, r, 0, 360, n).slice(0, -1); return rev ? o.reverse() : o; };

/** bolt: hex head + washer, axis along Z (head toward +Z) */
export function bolt(k, x, y, z, o = {}) {
  const r = o.r ?? 0.55;
  k.add(G.cyl(r * 1.25, r * 1.25, 0.12, 16, 0.03), o.mat ?? 'steel_worn', { p: [x, y, z], r: [90, 0, 0] });
  k.add(G.cyl(r, r, o.h ?? 0.4, 6, 0.06), o.mat ?? 'steel_worn', { p: [x, y, z - 0.1], r: [-90, 0, 0], wear: 0.4 });
}

/** valve hand-wheel in the XZ plane (axis +Y) */
export function valveWheel(k, R, o = {}) {
  const mat = o.mat ?? ['paint_worn', C.red];
  k.add(G.torus(R, o.rim ?? 0.45, 28, 10), mat, { p: o.p, r: [90, 0, 0], wear: 0.3, blood: o.blood });
  for (let i = 0; i < (o.spokes ?? 4); i++) k.add(G.cyl(0.32, 0.32, R * 2, 8, 0.05).translate(0, -R, 0), mat, { p: o.p, r: [0, i * 180 / (o.spokes ?? 4), 90] });
  k.add(G.cyl(R * 0.22, R * 0.22, 1.2, 12, 0.15), mat, { p: [o.p[0], o.p[1] - 0.6, o.p[2]] });
}
