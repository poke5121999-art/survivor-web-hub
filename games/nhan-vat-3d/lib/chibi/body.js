// "chibi-survivor" body preset (hand-written; lib/lf/ is generated, never edited).
// Proportions follow the owner's sheet: head ~1/5.3 of height, broad rounded torso, hands at crotch level, short
// legs, chunky shoes. The legs keep Lanternfall's exact joint heights (hips 0.98, knee 0.5, ankle 0.085, leg 0.845)
// so HumanAnim's gait, foot IK and down pose stay correct; the torso, arms and head are longer and bigger, and the
// whole figure is drawn at SCALE (0.8) so it stands ~1.75 m. Bones keep humanRig's 28 names and order, so every
// Lanternfall pose / clip (stance, rdy, mkClip) drives it unchanged.
import { PI, TAU, lerp, clamp, smooth } from '../lf/util.js';
import { makeRig, jb, chainY } from '../lf/kit.js';
import { S_SKIN, S_CLOTH, S_HAIR, S_EYE, S_RUBBER, S_GLOW } from './mat.js';

export const SCALE = 0.8;
// joint heights (model units)
export const J = { hips: 0.98, spine: 1.18, chest: 1.4, neck: 1.66, head: 1.75, sh: 1.6, el: 1.27, wr: 0.99, grip: 0.915, thigh: 0.93, knee: 0.5, ankle: 0.085 };

export function chibiRig(P) {
  const sh = P.sh, hp = P.hp;
  return makeRig([
    ['root', null, 0, 0, 0], ['hips', 'root', 0, J.hips, 0], ['spine', 'hips', 0, J.spine, 0], ['chest', 'spine', 0, J.chest, 0], ['neck', 'chest', 0, J.neck, 0], ['head', 'neck', 0, J.head, 0.01],
    ['lUp', 'chest', sh, J.sh, 0], ['lFore', 'lUp', sh + 0.03, J.el, 0], ['lHand', 'lFore', sh + 0.05, J.wr, 0],
    ['rUp', 'chest', -sh, J.sh, 0], ['rFore', 'rUp', -sh - 0.03, J.el, 0], ['rHand', 'rFore', -sh - 0.05, J.wr, 0],
    ['lThigh', 'hips', hp, J.thigh, 0], ['lShin', 'lThigh', hp + 0.005, J.knee, 0], ['lFoot', 'lShin', hp + 0.005, J.ankle, 0],
    ['rThigh', 'hips', -hp, J.thigh, 0], ['rShin', 'rThigh', -hp - 0.005, J.knee, 0], ['rFoot', 'rShin', -hp - 0.005, J.ankle, 0],
    ['cloakA', 'chest', 0, 1.62, -0.16], ['cloakB', 'cloakA', 0, 1.2, -0.2], ['cloakC', 'cloakB', 0, 0.8, -0.22],
    ['wR', 'rHand', -sh - 0.05, J.grip, 0], ['wL', 'lHand', sh + 0.05, J.grip, 0],
    ['str', 'wL', sh + 0.05, J.grip, 0], ['arw', 'str', sh + 0.05, J.grip, 0], ['lan', 'wL', sh + 0.05, J.grip, 0, 1], ['back', 'chest', 0, 1.4, -0.2], ['lanB', 'back', -0.14, 2.4, 0.07, 1],
  ]);
}

// ---- profile tables (ascending y) ----
// torso: [y, rx, rzFront, rzBack, sq]
const TP = [[0.86, 0.17, 0.12, 0.13, 2.2], [0.94, 0.205, 0.135, 0.15, 2.2], [1.02, 0.212, 0.142, 0.15, 2.2], [1.12, 0.2, 0.138, 0.136, 2.15], [1.24, 0.212, 0.15, 0.138, 2.2],
  [1.36, 0.232, 0.16, 0.142, 2.25], [1.48, 0.248, 0.16, 0.148, 2.3], [1.565, 0.25, 0.148, 0.138, 2.25], [1.625, 0.222, 0.125, 0.12, 2.1], [1.665, 0.14, 0.095, 0.095, 2.05], [1.7, 0.08, 0.072, 0.078, 2.0], [1.78, 0.074, 0.068, 0.074, 2.0]];
// arm: [y, r, xoff, zoff]
const AP = [[0.985, 0.054, 0.05, 0.02], [1.06, 0.062, 0.045, 0.02], [1.16, 0.07, 0.038, 0.015], [1.27, 0.073, 0.03, 0.01], [1.38, 0.086, 0.02, 0.005], [1.5, 0.097, 0.01, 0], [1.6, 0.102, 0, 0], [1.66, 0.09, -0.012, 0], [1.705, 0.045, -0.024, 0]];
// leg: [y, rx, rzFront, rzBack, xoff]
const LP = [[0.1, 0.06, 0.062, 0.064, 0.005], [0.22, 0.067, 0.067, 0.074, 0.005], [0.36, 0.076, 0.074, 0.085, 0.005], [0.5, 0.082, 0.084, 0.082, 0.004], [0.64, 0.095, 0.099, 0.097, 0.003],
  [0.78, 0.106, 0.108, 0.11, 0], [0.9, 0.112, 0.114, 0.12, -0.004], [0.99, 0.11, 0.11, 0.12, -0.01]];
// head: [y, rx, rzFront, rzBack]  (ellipse rings, centre z = HZ)
const HT = [[1.742, 0.02, 0.02, 0.02], [1.76, 0.085, 0.095, 0.075], [1.795, 0.132, 0.148, 0.118], [1.855, 0.16, 0.172, 0.152], [1.93, 0.171, 0.178, 0.17], [2.0, 0.169, 0.172, 0.177],
  [2.06, 0.155, 0.152, 0.165], [2.11, 0.12, 0.113, 0.128], [2.145, 0.066, 0.06, 0.07], [2.162, 0.004, 0.004, 0.004]];
export const HZ = 0.012, HEAD_TOP = 2.162, EYE_Y = 1.935;

function samp(T, y) {
  if (y <= T[0][0]) return T[0].slice(); const n = T.length; if (y >= T[n - 1][0]) return T[n - 1].slice();
  for (let i = 0; i < n - 1; i++) { const a = T[i], b = T[i + 1]; if (y <= b[0]) { const t = (y - a[0]) / (b[0] - a[0]); return a.map((v, k) => lerp(v, b[k], t)); } }
  return T[n - 1].slice();
}
function span(T, y0, y1) {
  const out = [samp(T, y0)]; for (const r of T) if (r[0] > y0 + 0.01 && r[0] < y1 - 0.01) out.push(r.slice()); out.push(samp(T, y1));
  out[0][0] = y0; out[out.length - 1][0] = y1; return out;
}
export const bump = (y, c, w) => Math.max(0, 1 - ((y - c) / w) ** 2);

// body shape options: k (width), belly (m), bust (m), kz (depth)
export function torsoRing(B, y, grow = 0) {
  const r = samp(TP, y), k = (B.k || 1) * 1.07, kz = (B.kz || 1) * 1.05, bl = (B.belly || 0) * bump(y, 1.13, 0.3), bu = (B.bust || 0) * bump(y, 1.4, 0.1);
  const nk = smooth(1.66, 1.62, y); // shoulders and chest get the width factor, the neck does not
  return { y, rx: r[1] * lerp(1, k, nk) + bl * 0.75 + grow, rz: r[2] * lerp(1, kz, nk) + bl + bu + grow, rb: r[3] * lerp(1, kz, nk) + bl * 0.25 + grow, sq: r[4] };
}
export const TW = chainY([['neck', 9], ['chest', 1.62], ['spine', 1.34], ['hips', 1.1]], 0.06);
export function torso(g, B, o = {}) {
  const y0 = o.y0 === undefined ? 0.86 : o.y0, y1 = o.y1 === undefined ? 1.7 : o.y1, ys = [];
  for (const r of TP) if (r[0] > y0 + 0.01 && r[0] < y1 - 0.01) ys.push(r[0]);
  ys.unshift(y0); ys.push(y1); if (B.belly) { for (const y of [1.0, 1.13, 1.26]) if (y > y0 + 0.02 && y < y1 - 0.02 && !ys.includes(y)) ys.push(y); ys.sort((a, b) => a - b); }
  const gr = o.grow || 0, rings = ys.map((y) => { const r = torsoRing(B, y, gr + (o.flare ? o.flare * smooth(o.flareY || y1, y0, y) : 0)); if (o.sq) r.sq = o.sq; return r; });
  g.bone(o.bone || TW);
  return g.loft(rings, { seg: o.seg || 22, sub: 3, arc: o.arc, thick: o.thick, cap0: o.cap0, cap1: o.cap1 });
}
export function armRings(P, side, y0, y1, grow = 0, k = 1) {
  return span(AP, y0, y1).map((r) => ({ y: r[0], rx: r[1] * k + grow, rz: r[1] * k * 1.04 + grow, x: side * (P.sh + r[2]), z: r[3] }));
}
export function arm(g, P, side, o = {}) {
  const U = side > 0 ? 'lUp' : 'rUp', F = side > 0 ? 'lFore' : 'rFore';
  g.bone(o.bone || jb(U, F, J.el, 0.06));
  const y0 = o.y0 === undefined ? 0.985 : o.y0, y1 = o.y1 === undefined ? 1.69 : o.y1;
  return g.loft(armRings(P, side, y0, y1, o.grow || 0, o.k || 1), { seg: o.seg || 12, sub: 3, thick: o.thick, cap0: o.cap0, cap1: o.cap1 === undefined ? y1 >= 1.68 : o.cap1 });
}
export function legRings(P, side, y0, y1, grow = 0, k = 1) {
  return span(LP, y0, y1).map((r) => ({ y: r[0], rx: r[1] * k + grow, rz: r[2] * k + grow, rb: r[3] * k + grow, x: side * (P.hp + r[4]) }));
}
export function leg(g, P, side, o = {}) {
  const T = side > 0 ? 'lThigh' : 'rThigh', S = side > 0 ? 'lShin' : 'rShin';
  g.bone(o.bone || jb(T, S, J.knee, 0.06));
  const y0 = o.y0 === undefined ? 0.1 : o.y0, y1 = o.y1 === undefined ? 0.99 : o.y1;
  return g.loft(legRings(P, side, y0, y1, o.grow || 0, o.k || 1), { seg: o.seg || 14, sub: 3, thick: o.thick, cap0: o.cap0, cap1: o.cap1, arc: o.arc });
}

// chunky shoe / boot. o: top (boot shaft height), kind: 'sneaker' | 'boot' | 'welly' | 'shoe', col, sole, lace
export function shoe(g, P, side, o = {}) {
  const x = side * (P.hp + 0.005), S = side > 0 ? 'lShin' : 'rShin', F = side > 0 ? 'lFoot' : 'rFoot', top = o.top || (o.kind === 'boot' ? 0.27 : o.kind === 'welly' ? 0.36 : 0.14);
  const w = (o.w || 1) * 0.074;
  g.bone(jb(S, F, 0.15, 0.04));
  g.mat(o.col, o.rough || 0.7, 0, o.type || S_CLOTH, o.dirt || 0);
  // upper: rings rise from the sole; front extends into a round toe
  g.loft([
    { y: 0.03, x, rx: w * 1.08, rz: 0.19, rb: 0.085, z: 0.0, sq: 2.3 },
    { y: 0.075, x, rx: w * 1.1, rz: 0.185, rb: 0.088, z: 0.0, sq: 2.4 },
    { y: 0.12, x, rx: w * 1.02, rz: 0.13, rb: 0.084, z: 0.0, sq: 2.3 },
    { y: 0.16, x, rx: w * 0.92, rz: 0.08, rb: 0.078, z: 0, sq: 2.1 },
    { y: Math.max(0.2, top), x, rx: w * 0.9 + (top > 0.2 ? 0.006 : 0), rz: 0.074, rb: 0.076, z: 0, sq: 2 },
  ], { seg: 16, sub: 3, cap0: true, cap1: top < 0.19 });
  // sole: a slightly wider rounded slab
  g.bone(F); g.mat(o.sole || [0.85, 0.85, 0.82], 0.85, 0, S_RUBBER, 0);
  g.loft([{ y: 0.0, x, rx: w * 1.12, rz: 0.2, rb: 0.092, sq: 2.6 }, { y: 0.038, x, rx: w * 1.16, rz: 0.205, rb: 0.095, sq: 2.6 }], { seg: 16, sub: 1, cap0: true, cap1: true });
  if (o.toe) { g.mat(o.toe, 0.7, 0, S_CLOTH, 0); g.tr(x, 0.075, 0.12); g.sphere(w * 0.98, 0.05, 0.075, 10, 6); g.pop(); }
  if (o.lace) { g.mat(o.lace, 0.8, 0, S_CLOTH, 0); g.bone(jb(S, F, 0.15, 0.04)); for (let i = 0; i < 3; i++) { const yy = 0.1 + i * 0.03, zz = 0.13 - i * 0.025; g.tube([[x - w * 0.5, yy, zz], [x, yy + 0.008, zz + 0.012], [x + w * 0.5, yy, zz]], 0.007, { seg: 5, sub: 2 }); } }
}

// mitten fist at the hand frame; palm faces the body, thumb on the front
export function fist(g, P, side, col, o = {}) {
  const H = side > 0 ? 'lHand' : 'rHand', x = side * (P.sh + 0.05), y = J.grip + 0.01, k = o.k || 1.36;
  g.bone(H); g.mat(col, o.rough || 0.6, 0, o.type === undefined ? S_SKIN : o.type, 0);
  g.tr(x, y, 0.005); g.sphere(0.05 * k, 0.07 * k, 0.064 * k, 12, 8); g.pop();
  g.tr(x - side * 0.022 * k, y + 0.02, 0.05 * k, 0.5, 0, side * 0.3); g.sphere(0.024 * k, 0.034 * k, 0.024 * k, 8, 5); g.pop();
  if (o.cuff) { g.mat(o.cuff, 0.7, 0, S_CLOTH, 0); g.bone(jb(side > 0 ? 'lFore' : 'rFore', H, J.wr, 0.02)); g.loft(armRings(P, side, 0.97, 1.04, 0.012), { seg: 12, sub: 1, thick: 0.006 }); }
}

// ---- head ----
export function headRing(y, grow = 0) { const r = samp(HT, y); return { rx: Math.max(0, r[1]) + grow, rz: Math.max(0, r[2]) + grow, rb: Math.max(0, r[3]) + grow }; }
// point on the head surface (ellipse rings) at angle a (0 = +X, PI/2 = front) and height y, pushed out by grow
export function headPt(a, y, grow = 0) {
  const r = headRing(y, grow), s = Math.sin(a);
  return [Math.cos(a) * r.rx, y, HZ + s * (s >= 0 ? r.rz : r.rb)];
}
export function headFrontZ(x, y, grow = 0) { const r = headRing(y, grow); const t = clamp(x / Math.max(1e-4, r.rx), -0.999, 0.999); return HZ + r.rz * Math.sqrt(1 - t * t); }

// a shell that follows the head over a rim: rim(a) -> y at angle a; covers from the rim up to the crown
// (or to `top(a)`), pushed out by grow (+flare at the rim). Used for hair, caps, helmets, hoods.
export function headShell(g, o) {
  const grow = o.grow || 0.012, nu = o.nu || 26, nv = o.nv || 10, top = HEAD_TOP + grow;
  const a0 = o.arc ? o.arc[0] : 0, a1 = o.arc ? o.arc[1] : TAU;
  g.surf(nu, nv, (u, v) => {
    const a = a0 + (a1 - a0) * u + (o.arc ? 0 : PI / 2), yr = o.rim(a), yt = o.top ? o.top(a) : top;
    const vv = o.pow ? Math.pow(v, o.pow) : v, y = lerp(yr, yt, vv);
    const fl = (o.flare || 0) * (1 - v) * (1 - v), ex = (o.puff || 0) * Math.sin(v * PI);
    const yy = Math.min(y, HEAD_TOP + grow * 0.6);
    let p = headPt(a, Math.min(yy, HEAD_TOP - 0.001), grow + fl + ex);
    if (y >= HEAD_TOP - 0.004) p = [p[0] * 0.2, HEAD_TOP + grow, HZ];
    if (o.lift) p[1] += o.lift * (1 - v);
    return p;
  }, { closeU: !o.arc, thick: o.thick || 0, cap1: false });
}
export const rimFn = (yF, yS, yB, pw = 1.5) => (a) => { const s = Math.sin(a); return s >= 0 ? lerp(yS, yF, Math.pow(s, pw)) : lerp(yS, yB, Math.pow(-s, pw)); };

const NEUT = [0.04, 0.03, 0.025];
// skull, neck, ears, face. f: { skin, eye, brow, mouth, browY, eyeK, nose, lash }
export function head(g, f) {
  const skin = f.skin;
  g.bone(chainY([['head', 9], ['neck', 1.77]], 0.04)); g.mat(skin, 0.62, 0, S_SKIN, 0);
  g.loft(span(TP, 1.62, 1.8).map((r) => ({ y: r[0], rx: r[1] * 0.92, rz: r[2] * 0.92, rb: r[3] * 0.95, sq: 2 })), { seg: 14, sub: 2 });
  g.bone('head');
  g.loft(HT.map((r) => ({ y: r[0], rx: r[1], rz: r[2], rb: r[3], z: HZ, sq: 2 })), { seg: 28, sub: 3, cap0: true });
  // ears
  for (const s of [1, -1]) { g.tr(s * 0.168, 1.915, HZ - 0.01, 0, s * 0.35, 0); g.sphere(0.024, 0.042, 0.034, 10, 6); g.pop(); }
  // nose nub
  g.mat(skin.map((c) => c * 0.93), 0.6, 0, S_SKIN, 0);
  const nz = headFrontZ(0, 1.885); g.tr(0, 1.885, nz - 0.004); g.sphere(0.026 * (f.nose || 1), 0.025 * (f.nose || 1), 0.026, 10, 6); g.pop();
  // eyes: small white, big dark iris, highlight
  const ey = EYE_Y + (f.eyeY || 0), ex = 0.064, ek = f.eyeK || 1;
  for (const s of [1, -1]) {
    const z = headFrontZ(s * ex, ey);
    g.mat([0.9, 0.88, 0.85], 0.3, 0, S_EYE, 0); g.tr(s * ex, ey, z - 0.006, 0, s * 0.36, 0); g.sphere(0.026 * ek, 0.03 * ek, 0.012, 10, 6); g.pop();
    g.mat(f.eye || [0.035, 0.022, 0.016], 0.2, 0, S_EYE, 0); g.tr(s * (ex - 0.002), ey - 0.002, z - 0.001, 0, s * 0.36, 0); g.sphere(0.019 * ek, 0.024 * ek, 0.008, 10, 6); g.pop();
    g.mat([1, 1, 1], 0.2, 0, S_GLOW, 0.6); g.tr(s * (ex - 0.008) , ey + 0.01, z + 0.006); g.sphere(0.005, 0.005, 0.003, 5, 3); g.pop();
    // brow
    const by = ey + 0.05 + (f.browY || 0), bz = headFrontZ(s * 0.065, by) + 0.002;
    g.mat(f.brow || NEUT, 0.8, 0, S_HAIR, 0);
    g.tube([[s * 0.028, by - 0.004 + (f.browTilt || 0) * 0.5, bz - 0.004], [s * 0.065, by + 0.006, bz], [s * 0.1, by - 0.004 - (f.browTilt || 0), bz - 0.012]], (f.browW || 1) * 0.009, { seg: 6, sub: 2, flatten: 0.6 });
  }
  // mouth
  const my = 1.828, mz = headFrontZ(0, my) + 0.001, sm = f.smile === undefined ? 0.006 : f.smile;
  g.mat(f.mouth || [0.22, 0.06, 0.05], 0.6, 0, S_SKIN, 0);
  g.tube([[-0.04, my + sm, mz - 0.01], [0, my, mz], [0.04, my + sm, mz - 0.01]], 0.0065, { seg: 6, sub: 3, flatten: 0.7 });
}

// hair styles over the head (o.col, o.style)
export function hair(g, o) {
  if (!o || o.style === 'bald') return;
  g.bone('head'); const col = o.col, st = o.style;
  g.mat(col, 0.65, 0, S_HAIR, 0);
  const shell = (yF, yS, yB, grow, extra) => headShell(g, Object.assign({ rim: rimFn(yF, yS, yB), grow, nu: 28, nv: 9, thick: 0.006 }, extra || {}));
  if (st === 'buzz') { shell(2.03, 1.97, 1.86, 0.004); return; }
  if (st === 'short' || st === 'quiff' || st === 'flattop' || st === 'mohawk' || st === 'bun' || st === 'pony' || st === 'spiky') {
    shell(2.035, 1.97, 1.78, 0.014, { flare: 0.006 });
    if (st === 'quiff') { g.tr(0, 2.11, 0.1, -0.5, 0, 0); g.sphere(0.12, 0.06, 0.09, 12, 7); g.pop(); g.tr(0.02, 2.14, 0.0, -0.2, 0, 0.1); g.sphere(0.12, 0.05, 0.12, 12, 6); g.pop(); }
    if (st === 'flattop') { g.loft([{ y: 2.06, rx: 0.15, rz: 0.15, z: HZ }, { y: 2.2, rx: 0.15, rz: 0.15, z: HZ }, { y: 2.24, rx: 0.135, rz: 0.135, z: HZ }], { seg: 18, sub: 1, cap1: true }); }
    if (st === 'mohawk') { g.tr(0, 2.12, HZ); g.sphere(0.035, 0.1, 0.17, 8, 8); g.pop(); }
    if (st === 'bun') { g.tr(0, 2.15, -0.1); g.sphere(0.07, 0.065, 0.07, 10, 7); g.pop(); }
    if (st === 'pony') { g.tube([[0, 2.03, -0.16], [0, 1.95, -0.21], [0, 1.82, -0.21], [0, 1.72, -0.19]], (t) => 0.045 * (1 - 0.6 * t), { seg: 9, sub: 3 }); }
    if (st === 'spiky') for (let i = 0; i < 7; i++) { const a = PI / 2 + (i - 3) * 0.5; g.tr(Math.cos(a) * 0.08, 2.14, HZ + Math.sin(a) * 0.08, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.lathe([[0.045, 0], [0.025, 0.04], [0.001, 0.08]], 7); g.pop(); }
    return;
  }
  if (st === 'bob' || st === 'long') {
    shell(1.995, st === 'long' ? 1.8 : 1.84, st === 'long' ? 1.66 : 1.78, 0.022, { flare: 0.03 });
    return;
  }
  if (st === 'afro') { shell(2.02, 1.93, 1.84, 0.02); g.tr(0, 2.08, HZ - 0.01); g.sphere(0.22, 0.17, 0.22, 16, 10); g.pop(); return; }
  if (st === 'side') { shell(2.02, 1.96, 1.84, 0.016, { flare: 0.004 }); g.tr(0.05, 2.1, 0.11, -0.4, 0, -0.4); g.sphere(0.11, 0.05, 0.08, 10, 6); g.pop(); return; }
  shell(2.035, 1.97, 1.84, 0.014);
}

// beard / moustache (o.col, o.style: 'full' | 'short' | 'goatee' | 'stubble' | 'stache')
export function beard(g, o) {
  if (!o) return; g.bone('head'); const st = o.style || 'full', col = o.col;
  g.mat(col, 0.8, 0, S_HAIR, 0);
  if (st !== 'stache') {
    const grow = st === 'stubble' ? 0.003 : st === 'short' ? 0.012 : 0.024, yTop = st === 'goatee' ? 1.81 : 1.95, drop = st === 'full' ? 0.04 : 0.012;
    const span0 = st === 'goatee' ? 1.1 : 0.15;
    g.surf(18, 7, (u, v) => {
      const a = lerp(span0, PI - span0, u), s = Math.sin(a), side = Math.abs(Math.cos(a));
      const yt = lerp(1.8, yTop, Math.pow(side, 0.6)), yb = 1.748 - drop * s;
      const y = lerp(yb, yt, v), gr = grow * Math.sin(Math.min(1, v * 1.2 + 0.15) * PI * 0.5 + 0.2);
      const p = headPt(a, Math.max(1.746, Math.min(y, 1.99)), gr + 0.002);
      if (y < 1.75) { p[1] = y; p[2] = HZ + s * (0.06 + 0.05 * (1 - side)); p[0] = Math.cos(a) * 0.06; }
      return p;
    }, { thick: 0.004 });
  }
  if (st === 'full' || st === 'short' || st === 'stache' || st === 'goatee') {
    const my = 1.852, z = headFrontZ(0, my) + 0.008;
    g.tube([[-0.07, my - 0.022, z - 0.03], [-0.03, my + 0.002, z - 0.002], [0.03, my + 0.002, z - 0.002], [0.07, my - 0.022, z - 0.03]], (t) => 0.013 * (0.6 + 0.4 * Math.sin(t * PI)), { seg: 7, sub: 3, flatten: 0.6 });
  }
}
