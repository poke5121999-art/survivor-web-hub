// Helpers for composing new characters from the ported Lanternfall kit (hand-written adapter; lib/lf/ is generated).
// Everything here is a thin layer over the kit's own pieces: Geo primitives (loft/lathe/surf/tube/sphere/box), the
// HW wardrobe, makeRig/humanRig, Figure, and the anim data (stance, rdy, mkClip, DOWN_POSE).
import { C, mixC, mulberry, PI, TAU, lerp, clamp, smooth } from './lf/util.js';
import { Geo, Figure, jb, chainY, T_SKIN, T_CLOTH, T_QUILT, T_MAIL, T_LEATHER, T_PLATE, T_FUR, T_WOOD, T_STONE, T_PEAT, T_GLOW, T_BONE } from './lf/kit.js';
import { humanRig, COL, HW, stance, BASE_STANCE } from './lf/human.js';
import { mkClip } from './lf/anim.js';
import { rdy, RB, DOWN_POSE } from './lf/heroes.js';

export { C, mixC, mulberry, PI, TAU, lerp, clamp, smooth, Geo, Figure, jb, chainY, humanRig, COL, HW, stance, BASE_STANCE, mkClip, rdy, RB, DOWN_POSE };
export { T_SKIN, T_CLOTH, T_QUILT, T_MAIL, T_LEATHER, T_PLATE, T_FUR, T_WOOD, T_STONE, T_PEAT, T_GLOW, T_BONE };

// seeded variety: rnd(a) in [-a, a], tint a linear colour by up to +-k, pick from a list
export function variety(seed) {
  const r = mulberry((seed >>> 0) * 2654435761 + 7);
  const rnd = (a) => (r() - 0.5) * 2 * a;
  return { r, rnd, tint: (c, k = 0.12) => { const f = 1 + rnd(k); return c.map((v) => v * f * (1 + rnd(k * 0.35))); }, pick: (arr) => arr[Math.floor(r() * arr.length) % arr.length], chance: (p) => r() < p };
}
export const HEX = (h) => C(h);

export function start(P) { const rig = humanRig(P); return { rig, g: new Geo(rig), H: HW }; }
export function finish(g, rig, P, fx) {
  const fig = new Figure(g, rig); fig.P = P; fig.fx = {};
  for (const k in (fx || {})) fig.fx[k] = [rig.names[fx[k][0]], fx[k][1], fx[k][2], fx[k][3]];
  return fig;
}

// highest z (front surface) among vertices built so far near (x, y): for placing pockets, buttons, badges on cloth
export function frontZ(g, x, y, tol = 0.025, back = false) {
  let best = back ? 9 : -9; const P = g.P;
  for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i] - x) < tol && Math.abs(P[i + 1] - y) < tol) best = back ? Math.min(best, P[i + 2]) : Math.max(best, P[i + 2]);
  return Math.abs(best) === 9 ? (back ? -0.12 : 0.12) : best;
}
// outermost |x| at height y near z (for side pieces)
export function sideX(g, y, z = 0, tol = 0.03) {
  let best = 0; const P = g.P;
  for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - y) < tol && Math.abs(P[i + 2] - z) < tol * 2) best = Math.max(best, Math.abs(P[i]));
  return best;
}

// a flat patch facing +Z (pocket, badge, panel) with a sewn-on look: thin shell, slightly bowed
export function patch(g, x, y, z, w, h, opt = {}) {
  const bow = opt.bow || 0.006, flap = opt.flap;
  g.surf(4, 3, (u, v) => [x + (u - 0.5) * w, y + (0.5 - v) * h, z + Math.sin(u * PI) * bow * (0.6 + 0.4 * Math.sin(v * PI))], { thick: opt.thick || 0.004 });
  if (flap) g.surf(4, 1, (u, v) => [x + (u - 0.5) * (w + 0.006), y + h / 2 + 0.004 - v * h * 0.32, z + 0.004 + Math.sin(u * PI) * bow + v * 0.004], { thick: 0.004 });
}

// helmet shell: a cap whose rim rises at the front (yFront) and drops at the sides/back (yBack)
export function capShell(g, o) {
  const c = o.c || 1.7, rx = o.rx || 0.112, ry = o.ry || 0.145, rz = o.rz || 0.128, rb = o.rb || rz, yf = o.yFront || 1.745, yb = o.yBack || 1.665, z0 = o.z || -0.004;
  const bRim = (a) => { const s = Math.sin(a), yr = yb + (yf - yb) * Math.pow(Math.max(0, s), o.frontPow || 2); return Math.asin(clamp((yr - c) / ry, -0.95, 0.95)); };
  g.surf(o.seg || 22, o.nv || 9, (u, v) => {
    const a = u * TAU - PI / 2 + PI, b0 = bRim(a), b = lerp(b0, PI / 2, Math.pow(v, 0.85)), cb = Math.cos(b), s = Math.sin(a);
    const fl = (o.flare || 0) * (1 - v) * (1 - v);
    return [Math.cos(a) * (rx + fl) * cb, c + ry * Math.sin(b) - (o.drop || 0) * (1 - v) * Math.max(0, -s), z0 + (s >= 0 ? rz : rb) * s * cb + Math.sign(s) * fl * Math.abs(s) * cb];
  }, { closeU: true, thick: o.thick || 0.007 });
}

// cone / hat shell from a lathe profile, centred above the head
export function coneHat(g, y, r, h, o = {}) {
  g.tr(0, y, o.z || 0, o.tilt || 0, 0, o.roll || 0);
  const n = o.rings || 7, prof = [];
  for (let i = 0; i <= n; i++) { const t = i / n, rr = r * (1 - t), yy = h * Math.pow(t, o.pow || 1) + (o.droop || 0) * (1 - t) * (1 - t) * -1; prof.push([Math.max(0.001, rr), yy]); }
  g.lathe(prof.reverse().map(([rr, yy]) => [rr, yy]).reverse(), o.seg || 24, { thick: o.thick || 0.005 });
  g.pop();
}

// checkered cloth strip along a path (khan ran, tartan scarf): alternating colour segments of a tube
export function checkerTube(g, pts, rad, colA, colB, n, mat) {
  const m = mat || [0.95, 0, T_CLOTH, 0.4];
  const P = []; // resample along the polyline
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const at = (d) => { let i = 1; while (i < L.length - 1 && L[i] < d) i++; const t = (d - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]); return [lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t), lerp(pts[i - 1][2], pts[i][2], t)]; };
  const tot = L[L.length - 1];
  for (let k = 0; k < n; k++) {
    g.mat(k % 2 ? colB : colA, m[0], m[1], m[2], m[3]);
    const a = at(tot * k / n), b = at(tot * (k + 0.5) / n), c = at(tot * (k + 1) / n);
    g.tube([a, b, c], typeof rad === 'function' ? rad(k / n) : rad, { seg: 7, sub: 1, cap: false });
  }
}

// a checkered cloth panel (a hanging scarf end) as a grid of small quads in two colours
export function checkerPanel(g, fn, nu, nv, colA, colB, mat) {
  const m = mat || [0.95, 0, T_CLOTH, 0.4];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    g.mat(((i + j) % 2) ? colB : colA, m[0], m[1], m[2], m[3]);
    g.surf(1, 1, (u, v) => fn((i + u) / nu, (j + v) / nv), { thick: 0.003 });
  }
}

// hand-held item helper: enter the right/left hand's weapon frame (local +Y = forward, local +Z = down).
// Default frame = Lanternfall's: the item points along +Z from the hanging hand (a sword in a fist).
// aim = a for a pistol grip: the barrel points down the hanging forearm, tipped forward by a radians, so it
// points forward when the forearm does (a firearm held at 90 degrees to the forearm needs a broken wrist).
export function inHand(g, P, side, fn, aim) {
  const x = side * (P.sh + 0.03), y = 0.835;
  g.bone(side > 0 ? 'wL' : 'wR'); g.tr(x, y, 0, aim === undefined ? PI / 2 : PI - aim, 0, 0); fn(x, y); g.pop();
  return { x, y };
}
// rounded box in the current frame, centred on (x,y,z) with extents (w along X, l along local Y, d along local Z)
export function rbox(g, x, y, z, w, l, d, sq = 8) { g.tr(x, y - l / 2, z); g.box(w, l, d, sq); g.pop(); }

// standard hero-like style with sensible defaults
export function style(o) {
  return Object.assign({ swingL: 0.9, swingR: 0.9, strideAmp: 1, stride: 1, gait: { bounce: 1, sway: 1, lean: 1 }, downPose: DOWN_POSE, readyRoot: -0.03 }, o);
}
