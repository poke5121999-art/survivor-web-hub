// Garment builders for the chibi body (hand-written). Each builder is (c, o) where c is the build context
// { g, P, B, skin, dirt } and o the options from the character spec; all of them are shells over the body tables in
// body.js (torso / arm / leg rings pushed out by `grow`), so they follow the same skin weights.
import { PI, TAU, lerp, smooth } from '../lf/util.js';
import { jb, chainY } from '../lf/kit.js';
import { J, TW, torso, torsoRing, arm, leg, armRings, legRings, headFrontZ, HZ, bump } from './body.js';
import { S_SKIN, S_CLOTH, S_CHECK, S_CAMO, S_METAL, S_PLASTIC, S_RUBBER, S_LEATHER, S_GLOW, S_FLORAL, S_DENIM, S_KNIT } from './mat.js';

export const PAT = { check: S_CHECK, camo: S_CAMO, floral: S_FLORAL, denim: S_DENIM, knit: S_KNIT, leather: S_LEATHER, plastic: S_PLASTIC, rubber: S_RUBBER };
const both = (fn) => { fn(1); fn(-1); };
export const ty = (o, def = S_CLOTH) => (o && o.pat && PAT[o.pat] !== undefined ? PAT[o.pat] : def);
const rough = (t) => (t === S_PLASTIC ? 0.35 : t === S_RUBBER ? 0.55 : t === S_LEATHER ? 0.5 : 0.85);
export function mat(c, col, t = S_CLOTH, dirt) { c.g.mat(col, rough(t), t === S_METAL ? 1 : 0, t, dirt === undefined ? c.dirt : dirt); }
const front = (gap) => [PI / 2 + gap, PI / 2 + TAU - gap];        // open at the front
const panel = (half, at = PI / 2) => [at - half, at + half];        // a panel centred at angle `at`

// horizontal bands of alternating colours over a shell builder fn(y0, y1)
export function bands(c, y0, y1, n, cols, t, fn) {
  for (let i = 0; i < n; i++) { mat(c, cols[i % cols.length], t); fn(lerp(y0, y1, i / n), lerp(y0, y1, (i + 1) / n), i); }
}

/* ---------- core: top / bottom / skin ---------- */
// top: { kind: tee|long|rolled|tank|bare|crop|suit, col, sleeve (colour), pat, stripes: [colA, colB, n], y0, puff }
export function top(c, o) {
  const { g, P, B } = c, k = o.kind || 'tee', t = ty(o), gr = 0.012 + (o.puff || 0);
  const y0 = o.y0 || (k === 'crop' ? 1.24 : 0.95);
  if (k === 'bare') return;
  if (o.stripes) bands(c, y0, 1.7, o.stripes[2] || 8, [o.stripes[0], o.stripes[1]], t, (a, b) => torso(g, B, { y0: a, y1: b, grow: gr, thick: 0.004 }));
  else { mat(c, o.col, t); torso(g, B, { y0, y1: 1.7, grow: gr, thick: 0.008 }); }
  const sl = k === 'tank' || k === 'vestonly' ? 0 : k === 'tee' || k === 'crop' ? 1.42 : k === 'rolled' ? 1.2 : 1.0;
  if (sl) both((s) => {
    if (o.stripes && o.sleeveStripes !== false) bands(c, sl, 1.69, Math.max(2, Math.round((1.69 - sl) / 0.09)), [o.stripes[0], o.stripes[1]], t, (a, b) => arm(g, P, s, { y0: a, y1: b, grow: gr + 0.004, cap1: b > 1.68, thick: 0.004 }));
    else { mat(c, o.sleeve || o.col, t); arm(g, P, s, { y0: sl, y1: 1.69, grow: gr + 0.006, k: o.puff ? 1.08 : 1.04, thick: 0.007 }); }
    if (o.cuff || k === 'rolled' || k === 'tee' || k === 'crop') { // rolled cuff / sewn hem: a fatter band at the sleeve end
      const st = o.stripes && o.sleeveStripes !== false; mat(c, o.cuff || (st ? o.stripes[0] : (o.sleeve || o.col)), t);
      arm(g, P, s, { y0: sl, y1: sl + (k === 'rolled' ? 0.06 : 0.03), grow: gr + (k === 'rolled' ? 0.022 : 0.012), k: 1.04, cap1: false, thick: 0.006 });
    }
  });
  if (o.collar) collar(c, { col: o.collarCol || o.col, open: o.collar === 'open' });
}
// bottom: { kind: pants|shorts|capri|skirt|dress, col, pat, stripes, cuff, y1 (top) }
export function bottom(c, o) {
  const { g, P, B } = c, k = o.kind || 'pants', t = ty(o, o.pat === 'denim' ? S_DENIM : S_CLOTH);
  const end = o.end || (k === 'shorts' ? 0.6 : k === 'capri' ? 0.36 : 0.15), gr = 0.012 + (o.puff || 0);
  if (k === 'skirt' || k === 'dress') {
    mat(c, o.col, t); g.bone(chainY([['hips', 9], ['hips', 0.5]], 0.05));
    const yl = o.end || 0.5;
    g.loft([torsoRing(B, 1.08, 0.016), torsoRing(B, 0.95, 0.03), { y: (0.95 + yl) / 2, rx: 0.25, rz: 0.2, rb: 0.2 }, { y: yl, rx: 0.29, rz: 0.24, rb: 0.24 }], { seg: 22, sub: 3, thick: 0.008 });
    if (k === 'dress') { torso(g, B, { y0: 1.04, y1: 1.7, grow: 0.014, thick: 0.006 }); }
    return;
  }
  const leg1 = (s, col, a, b) => { mat(c, col, t); leg(g, P, s, { y0: a, y1: b, grow: gr, k: o.k || 1.04, thick: 0.007 }); };
  if (o.stripes) {
    bands(c, 0.86, 1.08, 2, [o.stripes[0], o.stripes[1]], t, (a, b) => torso(g, B, { y0: a, y1: b, grow: gr + 0.004, thick: 0.004 }));
    both((s) => bands(c, end, 0.99, o.stripes[2] || 7, [o.stripes[1], o.stripes[0]], t, (a, b) => leg(g, P, s, { y0: a, y1: b, grow: gr, k: 1.04, thick: 0.004 })));
  } else {
    mat(c, o.col, t); torso(g, B, { y0: 0.86, y1: o.y1 || 1.08, grow: gr + 0.004, cap0: true, thick: 0.006 });
    both((s) => { const col = o.legs ? o.legs[s > 0 ? 0 : 1] : o.col; leg1(s, col, end, 0.99); });
  }
  if (o.cuff) both((s) => { mat(c, o.cuff, S_CLOTH); leg(g, P, s, { y0: end, y1: end + 0.05, grow: gr + 0.01, k: 1.04, thick: 0.004 }); });
  if (o.rip) both((s) => { if (s === o.rip || o.rip === 2) { mat(c, c.skin, S_SKIN, 0); g.bone(jb(s > 0 ? 'lThigh' : 'rThigh', s > 0 ? 'lShin' : 'rShin', J.knee, 0.06)); g.tr(s * (P.hp + 0.005), 0.52, 0.075); g.sphere(0.045, 0.035, 0.022, 8, 5); g.pop(); } });
}
// exposed skin: arms below the sleeve, legs below the trousers, a bare torso
export function skinBody(c, sp) {
  const { g, P, B, skin } = c, k = (sp.top && sp.top.kind) || 'tee', bk = (sp.bottom && sp.bottom.kind) || 'pants';
  mat(c, skin, S_SKIN, 0);
  const sl = k === 'bare' || k === 'tank' ? 1.69 : k === 'tee' || k === 'crop' ? 1.42 : k === 'rolled' ? 1.2 : 1.0;
  if (k === 'bare' || k === 'crop' || k === 'tank') torso(g, B, { y0: k === 'bare' ? 0.9 : 0.9, y1: 1.7, grow: 0 });
  both((s) => { if (sl > 1.0) arm(g, P, s, { y0: 0.985, y1: Math.min(1.69, sl + 0.03), cap1: sl >= 1.68 }); else arm(g, P, s, { y0: 0.985, y1: 1.06, cap1: false }); });
  const end = bk === 'shorts' ? 0.6 : bk === 'capri' ? 0.36 : bk === 'skirt' || bk === 'dress' ? 0.99 : 0.2;
  const shTop = (sp.shoes && sp.shoes.kind === 'boot') ? 0.24 : (sp.shoes && sp.shoes.kind === 'welly') ? 0.33 : 0.14;
  both((s) => { if (end > shTop + 0.02) leg(g, P, s, { y0: shTop - 0.02, y1: Math.min(0.99, end + 0.03) }); });
  if (sp.socks) both((s) => { mat(c, sp.socks, S_KNIT, 0); leg(g, P, s, { y0: shTop - 0.02, y1: sp.socksY || 0.3, grow: 0.006, cap1: false, thick: 0.004 }); });
}

/* ---------- layers ---------- */
const W = {};
W.collar = (c, o) => collar(c, o);
function collar(c, o) {
  const { g } = c; mat(c, o.col, S_CLOTH); g.bone(chainY([['neck', 9], ['chest', 1.66]], 0.03));
  const a = o.open ? front(0.35) : undefined;
  g.loft([{ y: 1.66, rx: 0.13, rz: 0.11, rb: 0.105, sq: 2 }, { y: 1.71, rx: 0.1, rz: 0.1, rb: 0.095, sq: 2 }, { y: 1.75, rx: 0.095, rz: 0.098, rb: 0.096, sq: 2 }], { seg: 18, sub: 2, arc: a, thick: 0.008 });
}
// vest / jacket body. o: col, pat, open (gap rad), y0, y1, grow, sleeves (y), puff (quilted), stripes [col, y...]
W.vest = (c, o) => {
  const { g, P, B } = c, t = ty(o), gr = o.grow || 0.03, y0 = o.y0 || 0.98, y1 = o.y1 || 1.66;
  mat(c, o.col, t);
  if (o.puff) { const n = 5; for (let i = 0; i < n; i++) { const a = lerp(y0, y1, i / n), b = lerp(y0, y1, (i + 1) / n); g.bone(TW); const rs = [a, (a + b) / 2, b].map((y, j) => torsoRing(B, y, gr + (j === 1 ? 0.022 : 0.004))); g.loft(rs, { seg: 22, sub: 2, arc: o.open ? front(o.open) : undefined, thick: 0.006 }); } }
  else torso(g, B, { y0, y1, grow: gr, arc: o.open ? front(o.open) : undefined, thick: 0.012, flare: o.flare, seg: 24 });
  if (o.sleeves) both((s) => { mat(c, o.sleeveCol || o.col, t); arm(g, P, s, { y0: o.sleeves, y1: 1.69, grow: gr * 0.8 + 0.01, k: 1.06, thick: 0.008 }); });
  if (o.stripes) for (const y of o.stripes.ys) { mat(c, o.stripes.col, S_PLASTIC, 0); torso(g, B, { y0: y, y1: y + 0.04, grow: gr + 0.006, arc: o.open ? front(o.open) : undefined, thick: 0.004 }); if (o.sleeves && o.stripes.arms) both((s) => arm(g, P, s, { y0: y - 0.12, y1: y - 0.08, grow: gr * 0.8 + 0.02, k: 1.06, cap1: false, thick: 0.004 })); }
  if (o.buttons) { mat(c, o.buttons, S_PLASTIC, 0); g.bone(TW); for (let i = 0; i < 4; i++) { const y = lerp(1.08, 1.5, i / 3), z = torsoRing(B, y, gr).rz + 0.006; for (const x of (o.double ? [-0.06, 0.06] : [0])) { g.tr(x, y, z); g.sphere(0.012, 0.012, 0.006, 6, 4); g.pop(); } } }
  if (o.pocket) { mat(c, o.pocket, t); g.bone(TW); for (const x of [-0.11, 0.11]) { const z = torsoRing(B, 1.42, gr).rz; g.tr(x, 1.42, z - 0.005, -0.12, x > 0 ? 0.3 : -0.3, 0); g.box(0.08, 0.07, 0.016, 6); g.pop(); } }
};
// long coat / lab coat: vest down to the knees with a flared skirt and long sleeves
W.coat = (c, o) => {
  const { g, P, B } = c, t = ty(o), gr = o.grow || 0.032, end = o.end || 0.52;
  W.vest(c, Object.assign({ y0: 0.98, sleeves: o.sleeves === undefined ? 1.0 : o.sleeves }, o, { grow: gr }));
  mat(c, o.col, t); g.bone(chainY([['hips', 9], ['hips', 0.5]], 0.05));
  const r0 = torsoRing(B, 1.0, gr + 0.004);
  g.loft([r0, { y: 0.8, rx: r0.rx + 0.03, rz: r0.rz + 0.03, rb: r0.rb + 0.04 }, { y: end, rx: r0.rx + 0.07, rz: r0.rz + 0.06, rb: r0.rb + 0.08 }], { seg: 22, sub: 3, arc: front(o.open || 0.3), thick: 0.008 });
};
// apron: a front panel from chest (y1) to below the knee (end); bib with neck strap
W.apron = (c, o) => {
  const { g, B } = c, end = o.end || 0.5, y1 = o.y1 || 1.5, t = ty(o);
  mat(c, o.col, t, o.dirt === undefined ? c.dirt * 1.1 : o.dirt);
  g.bone(TW); torso(g, B, { y0: 0.98, y1, grow: 0.03, arc: panel(o.w || 1.05), thick: 0.006 });
  g.bone(chainY([['hips', 9], ['hips', 0.5]], 0.05));
  const r0 = torsoRing(B, 1.0, 0.034);
  g.loft([r0, { y: 0.75, rx: r0.rx + 0.03, rz: r0.rz + 0.04, rb: r0.rb }, { y: end, rx: r0.rx + 0.05, rz: r0.rz + 0.05, rb: r0.rb }], { seg: 18, sub: 3, arc: panel((o.w || 1.05) + 0.1), thick: 0.006 });
  g.bone(TW); mat(c, o.strap || o.col, S_CLOTH);
  for (const s of [1, -1]) g.tube([[s * 0.1, y1 - 0.01, torsoRing(B, y1, 0.03).rz], [s * 0.09, 1.66, 0.07], [s * 0.04, 1.7, -0.04]], 0.012, { seg: 5, sub: 3, flatten: 0.4, cap: false });
  g.tube([[-0.24, 1.06, 0.04], [0, 1.06, -torsoRing(B, 1.06, 0.035).rb], [0.24, 1.06, 0.04]], 0.01, { seg: 5, sub: 3, flatten: 0.4, cap: false });
};
// overalls: bib + straps over the trousers (call with the same colour as bottom)
W.overalls = (c, o) => {
  const { g, B } = c; mat(c, o.col, ty(o));
  torso(g, B, { y0: 1.0, y1: 1.4, grow: 0.026, arc: panel(0.85), thick: 0.008 });
  torso(g, B, { y0: 0.98, y1: 1.14, grow: 0.024, thick: 0.008 });
  g.bone(TW); for (const s of [1, -1]) g.tube([[s * 0.11, 1.39, torsoRing(B, 1.39, 0.026).rz - 0.005], [s * 0.15, 1.6, 0.08], [s * 0.14, 1.63, -0.06], [s * 0.08, 1.3, -torsoRing(B, 1.3, 0.03).rb]], 0.02, { seg: 5, sub: 3, flatten: 0.35, cap: false });
  mat(c, o.button || [0.8, 0.7, 0.3], S_METAL, 0); for (const s of [1, -1]) { g.tr(s * 0.11, 1.37, torsoRing(B, 1.37, 0.03).rz); g.sphere(0.015, 0.015, 0.008, 6, 4); g.pop(); }
  if (o.pocket) { mat(c, o.pocket, ty(o)); g.tr(0, 1.27, torsoRing(B, 1.27, 0.03).rz - 0.002); g.box(0.12, 0.09, 0.012, 6); g.pop(); }
};
W.belt = (c, o) => {
  const { g, B } = c, y = o.y || 1.0; mat(c, o.col || [0.03, 0.025, 0.02], S_LEATHER, 0);
  torso(g, B, { y0: y - 0.025, y1: y + 0.025, grow: o.grow || 0.044, thick: 0.006, sq: 2.4 });
  if (o.buckle !== false) { mat(c, o.buckle || [0.75, 0.55, 0.12], S_METAL, 0); g.tr(0, y - 0.022, torsoRing(c.B, y, o.grow || 0.044).rz + 0.004); g.box(0.06, 0.044, 0.012, 4); g.pop(); }
  if (o.pouches) { mat(c, o.pouches, S_CLOTH); for (const a of o.pouchAt || [-0.7, 0.7, PI + 0.4]) { const r = torsoRing(c.B, y, 0.05); g.tr(Math.cos(PI / 2 - a) * r.rx, y - 0.04, Math.sin(PI / 2 - a) * (Math.cos(a) > 0 ? r.rz : r.rb), 0, -a, 0); g.box(0.075, 0.09, 0.05, 6); g.pop(); } }
};
// a strap across the chest (bandolier / sling / satchel strap), with optional shells
W.strap = (c, o) => {
  const { g, B } = c, s = o.side || 1, gr = o.grow || 0.035; mat(c, o.col || [0.05, 0.035, 0.02], S_LEATHER, 0); g.bone(TW);
  const pts = [], n = 10;
  for (let i = 0; i <= n; i++) { const t = i / n, a = lerp(-PI / 2 - 0.2, PI * 1.5 + 0.2, t), y = lerp(1.66, 1.02, (Math.sin(a) + 1) / 2) ; const yy = s > 0 ? y : y; const xx = Math.cos(a), r = torsoRing(B, yy, gr); pts.push([s * xx * r.rx * 0.95, Math.max(1.0, Math.min(1.64, lerp(1.64, 1.02, t < 0.5 ? t * 2 : 2 - t * 2))) , (Math.sin(a) > 0 ? r.rz : r.rb) * Math.sin(a)]); }
  // simple: front diagonal from one shoulder to the opposite hip and back across the back
  const f = [], b = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, y = lerp(1.62, 1.02, t), x = s * lerp(0.14, -0.2, t), r = torsoRing(B, y, gr), zx = Math.sqrt(Math.max(0, 1 - (x / r.rx) ** 2)); f.push([x, y, r.rz * Math.max(0.35, zx)]); b.push([x, y, -r.rb * Math.max(0.35, zx)]); }
  g.tube(f, o.w || 0.02, { seg: 5, sub: 2, flatten: 0.35, cap: false }); g.tube(b, o.w || 0.02, { seg: 5, sub: 2, flatten: 0.35, cap: false });
  if (o.shells) { mat(c, o.shells, S_PLASTIC, 0); for (let i = 1; i < 8; i += 1) { const p = f[i]; g.tr(p[0], p[1], p[2] + 0.012, 0, 0, s * 0.6); g.lathe([[0.012, -0.025], [0.012, 0.025], [0.008, 0.032]], 6); g.pop(); } }
  if (o.pouch) { mat(c, o.pouch, S_LEATHER); const p = f[7]; g.tr(p[0], p[1] - 0.04, p[2] + 0.02); g.box(0.1, 0.1, 0.05, 6); g.pop(); }
};
W.tie = (c, o) => {
  const { g, B } = c; mat(c, o.col, S_CLOTH, 0); g.bone(TW); const z = (y) => torsoRing(B, y, 0.02).rz;
  g.tr(0, 1.64, z(1.64) - 0.01); g.sphere(0.025, 0.022, 0.015, 6, 4); g.pop();
  g.loft([{ y: 1.62, rx: 0.018, rz: 0.006 }, { y: 1.45, rx: 0.03, rz: 0.006 }, { y: 1.3, rx: 0.034, rz: 0.006 }, { y: 1.27, rx: 0.002, rz: 0.006 }].map((r) => Object.assign(r, { z: z(r.y) + 0.004 })), { seg: 6, sub: 2, cap0: true });
};
W.bowtie = (c, o) => {
  const { g, B } = c; mat(c, o.col || [0.02, 0.02, 0.02], S_CLOTH, 0); g.bone(TW); const z = torsoRing(B, 1.66, 0.02).rz - 0.02;
  for (const s of [1, -1]) { g.tr(s * 0.03, 1.665, z, 0, 0, s * PI / 2); g.lathe([[0.004, 0], [0.026, 0.02], [0.03, 0.04], [0.0, 0.042]], 6); g.pop(); }
  g.tr(0, 1.665, z + 0.004); g.sphere(0.013, 0.013, 0.01, 6, 4); g.pop();
};
W.scarf = (c, o) => {
  const { g } = c; mat(c, o.col, ty(o)); g.bone(chainY([['neck', 9], ['chest', 1.66]], 0.03));
  g.loft([{ y: 1.6, rx: 0.17, rz: 0.15, rb: 0.13 }, { y: 1.67, rx: 0.13, rz: 0.13, rb: 0.12 }, { y: 1.74, rx: 0.1, rz: 0.11, rb: 0.1 }], { seg: 18, sub: 2, thick: 0.01 });
  if (o.tail !== false) { g.bone(TW); g.surf(3, 4, (u, v) => [0.05 + (u - 0.5) * 0.08, 1.64 - v * 0.2, 0.16 + v * 0.02], { thick: 0.008 }); }
};
// knee pad / elbow pad / bandage / armband
W.kneepad = (c, o) => {
  const { g, P } = c; both((s) => { if (o.side && o.side !== s) return; mat(c, o.col || [0.06, 0.06, 0.07], S_RUBBER, 0);
    g.bone(jb(s > 0 ? 'lThigh' : 'rThigh', s > 0 ? 'lShin' : 'rShin', J.knee, 0.06)); g.tr(s * (P.hp + 0.005), 0.5, 0.06);
    g.surf(10, 5, (u, v) => { const a = u * TAU, b = v * 1.3; return [Math.cos(a) * Math.sin(b) * 0.07, Math.sin(a) * Math.sin(b) * 0.08, Math.cos(b) * 0.045]; }, { closeU: true, thick: 0.012 }); g.pop();
    if (o.strap) { mat(c, o.strap, S_CLOTH, 0); leg(g, P, s, { y0: 0.43, y1: 0.46, grow: 0.022, cap1: false }); leg(g, P, s, { y0: 0.56, y1: 0.59, grow: 0.022, cap1: false }); } });
};
W.bandage = (c, o) => {
  const { g, P } = c, s = o.side || 1; mat(c, o.col || [0.86, 0.84, 0.78], S_CLOTH, 0.25);
  if (o.on === 'arm') arm(g, P, s, { y0: o.y0 || 1.08, y1: o.y1 || 1.18, grow: o.grow || 0.016, cap1: false, thick: 0.004 });
  else leg(g, P, s, { y0: o.y0 || 0.42, y1: o.y1 || 0.58, grow: o.grow || 0.02, cap1: false, thick: 0.004 });
};
W.armband = (c, o) => { const { g, P } = c; mat(c, o.col, S_CLOTH, 0); arm(g, P, o.side || 1, { y0: o.y0 || 1.4, y1: (o.y0 || 1.4) + 0.06, grow: o.grow || 0.022, cap1: false, thick: 0.004 }); };
W.gloves = (c, o) => { c.glove = o.col; c.gloveCuff = o.cuff; };
W.legband = (c, o) => { const { g, P } = c; mat(c, o.col, ty(o), 0); leg(g, P, o.side || 1, { y0: o.y0 || 0.3, y1: o.y1 || 0.36, grow: o.grow || 0.022, cap1: false, thick: 0.004 }); };
// back items
W.backpack = (c, o) => {
  const { g, B } = c, k = o.k || 1, z0 = -torsoRing(B, 1.35, 0).rb - 0.02;
  g.bone('back'); mat(c, o.col, ty(o));
  g.tr(0, 1.1, z0 - 0.09 * k);
  g.loft([{ y: 0, rx: 0.17 * k, rz: 0.08 * k, sq: 3 }, { y: 0.22 * k, rx: 0.19 * k, rz: 0.1 * k, sq: 3 }, { y: 0.42 * k, rx: 0.17 * k, rz: 0.09 * k, sq: 3 }, { y: 0.47 * k, rx: 0.1 * k, rz: 0.05 * k, sq: 2.5 }], { seg: 14, sub: 3, cap0: true, cap1: true });
  mat(c, o.col2 || o.col.map((v) => v * 0.6), ty(o)); g.tr(0, 0.13 * k, -0.09 * k); g.box(0.24 * k, 0.15 * k, 0.07 * k, 5); g.pop();
  if (o.roll) { mat(c, o.roll, S_CLOTH); g.tr(0, 0.5 * k, 0, 0, 0, PI / 2); g.loft([{ y: -0.2 * k, rx: 0.055 }, { y: 0.2 * k, rx: 0.055 }], { seg: 10, sub: 1, cap0: true, cap1: true }); g.pop(); }
  g.pop();
  g.bone(TW); mat(c, o.strap || [0.06, 0.05, 0.04], S_CLOTH, 0);
  for (const s of [1, -1]) g.tube([[s * 0.12, 1.12, torsoRing(B, 1.12, 0.03).rz * 0.5 + 0.06], [s * 0.15, 1.45, torsoRing(B, 1.45, 0.03).rz], [s * 0.15, 1.64, 0.05], [s * 0.14, 1.6, -0.12]], 0.018, { seg: 5, sub: 3, flatten: 0.4, cap: false });
};
W.tank = (c, o) => { // air / gas tank(s) on the back
  const { g, B } = c, z0 = -torsoRing(B, 1.35, 0).rb - 0.07; g.bone('back');
  for (const x of (o.twin ? [-0.075, 0.075] : [0])) { mat(c, o.col, S_PLASTIC, 0); g.tr(x, 1.0, z0 - 0.02); g.lathe([[0.065, 0], [0.075, 0.03], [0.075, 0.45], [0.05, 0.5], [0.02, 0.53], [0.0, 0.53]], 14); g.pop(); mat(c, [0.15, 0.15, 0.16], S_METAL, 0); g.tr(x, 1.53, z0 - 0.02); g.lathe([[0.02, 0], [0.02, 0.04], [0.0, 0.045]], 8); g.pop(); }
  g.bone(TW); mat(c, [0.05, 0.05, 0.05], S_RUBBER, 0); for (const s of [1, -1]) g.tube([[s * 0.13, 1.1, 0.13], [s * 0.15, 1.6, 0.06], [s * 0.13, 1.6, -0.13]], 0.016, { seg: 5, sub: 3, flatten: 0.4, cap: false });
};
// plate carrier: front + back plates and magazine pouches
W.carrier = (c, o) => {
  const { g, B } = c, gr = o.grow || 0.05; mat(c, o.col, ty(o));
  torso(g, B, { y0: 1.06, y1: 1.56, grow: gr, arc: panel(1.15), thick: 0.025, seg: 14 });
  torso(g, B, { y0: 1.06, y1: 1.56, grow: gr, arc: panel(1.15, -PI / 2), thick: 0.025, seg: 14 });
  torso(g, B, { y0: 1.06, y1: 1.18, grow: gr - 0.012, thick: 0.01 });
  g.bone(TW); for (const s of [1, -1]) g.tube([[s * 0.13, 1.56, torsoRing(B, 1.56, gr).rz - 0.02], [s * 0.15, 1.65, 0.05], [s * 0.15, 1.65, -0.05], [s * 0.13, 1.56, -torsoRing(B, 1.56, gr).rb + 0.02]], 0.024, { seg: 5, sub: 3, flatten: 0.4, cap: false });
  if (o.pouches !== false) { mat(c, o.pouch || o.col.map((v) => v * 0.8), ty(o)); for (let k = -1; k <= 1; k++) { const z = torsoRing(B, 1.17, gr).rz + 0.02; g.tr(k * 0.085, 1.12, z); g.box(0.075, 0.13, 0.05, 6); g.pop(); } }
  if (o.patch) { mat(c, o.patch, S_CLOTH, 0); g.tr(0.09, 1.42, torsoRing(B, 1.42, gr).rz + 0.025); g.box(0.08, 0.05, 0.008, 4); g.pop(); }
};
W.badge = (c, o) => { const { g, B } = c; mat(c, o.col || [0.85, 0.65, 0.15], o.metal === false ? S_CLOTH : S_METAL, 0); g.bone(TW); const x = o.x === undefined ? 0.11 : o.x, y = o.y || 1.44, z = torsoRing(B, y, o.grow || 0.03).rz * Math.sqrt(Math.max(0.2, 1 - (x / torsoRing(B, y, 0).rx) ** 2)); g.tr(x, y, z + 0.004, -0.1, x * 1.8, 0); g.box(o.w || 0.05, o.h || 0.05, 0.01, 4); g.pop(); };
W.number = (c, o) => { W.badge(c, { col: [0.95, 0.95, 0.95], metal: false, x: 0, y: o.y || 1.15, w: 0.14, h: 0.1, grow: o.grow || 0.02 }); };
W.braces = (c, o) => {
  const { g, B } = c; mat(c, o.col, S_CLOTH, 0); g.bone(TW);
  for (const s of [1, -1]) g.tube([[s * 0.1, 1.04, torsoRing(B, 1.04, 0.025).rz], [s * 0.12, 1.4, torsoRing(B, 1.4, 0.025).rz], [s * 0.13, 1.64, 0.04], [s * 0.04, 1.3, -torsoRing(B, 1.3, 0.025).rb], [s * 0.02, 1.04, -torsoRing(B, 1.04, 0.025).rb]], 0.014, { seg: 5, sub: 3, flatten: 0.35, cap: false });
};
W.stethoscope = (c, o) => {
  const { g, B } = c; mat(c, o.col || [0.1, 0.1, 0.12], S_RUBBER, 0); g.bone(TW);
  g.tube([[-0.05, 1.3, torsoRing(B, 1.3, 0.03).rz], [-0.09, 1.55, torsoRing(B, 1.55, 0.03).rz], [-0.08, 1.68, 0.02], [0.08, 1.68, 0.02], [0.09, 1.55, torsoRing(B, 1.55, 0.03).rz], [0.06, 1.42, torsoRing(B, 1.42, 0.03).rz]], 0.009, { seg: 5, sub: 3 });
  mat(c, [0.7, 0.72, 0.75], S_METAL, 0); g.tr(-0.05, 1.29, torsoRing(B, 1.29, 0.03).rz + 0.005); g.sphere(0.02, 0.02, 0.01, 8, 4); g.pop();
};
W.holster = (c, o) => { const { g, P } = c, s = o.side || -1; g.bone(s > 0 ? 'lThigh' : 'rThigh'); mat(c, o.col || [0.04, 0.035, 0.03], S_LEATHER, 0); g.tr(s * (P.hp + 0.1), 0.8, 0.0, 0, 0, 0); g.box(0.05, 0.16, 0.09, 6); g.pop(); mat(c, [0.08, 0.08, 0.09], S_METAL, 0); g.tr(s * (P.hp + 0.1), 0.9, 0.0); g.box(0.03, 0.06, 0.06, 4); g.pop(); };
W.pouch = (c, o) => { const { g, P } = c, s = o.side || 1; g.bone(s > 0 ? 'lThigh' : 'rThigh'); mat(c, o.col, ty(o)); g.tr(s * (P.hp + 0.1), o.y || 0.72, 0.0, 0, s * 0.2, 0); g.box(0.05, 0.12, 0.11, 6); g.pop(); };
W.cigarette = (c, o) => { const { g } = c; g.bone('head'); mat(c, [0.95, 0.93, 0.88], S_CLOTH, 0); g.tr(o.side === -1 ? -0.17 : 0.17, 1.965, 0.03, 0, PI / 2, 0); g.lathe([[0.006, -0.045], [0.006, 0.045], [0.0, 0.046]], 6); g.pop(); };

// torn hem: a ring of ragged flaps hanging below a hem. ring(y) -> { rx, rz, rb, x?, z? }; n flaps of random length
export function tatters(c, ring, y, col, o = {}) {
  const { g } = c, n = o.n || 14, len = o.len || 0.06, seed = o.seed || 1; let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  mat(c, col, o.type || S_CLOTH, c.dirt + 0.3); if (o.bone) g.bone(o.bone);
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.3) continue;
    const a0 = (i / n) * TAU + PI / 2, a1 = ((i + 0.8) / n) * TAU + PI / 2, L = len * (0.35 + rnd()), r = ring(y);
    g.surf(3, 2, (u, v) => { const a = lerp(a0, a1, u), sn = Math.sin(a), tip = 1 - Math.abs(u - 0.5) * 2 * v * 0.8, k = 1 + 0.06 * v;
      return [(r.x || 0) + Math.cos(a) * r.rx * k, y - L * v * tip, (r.z || 0) + sn * (sn >= 0 ? r.rz : r.rb) * k]; }, { thick: 0.004 });
  }
}
export const WEAR = W;
