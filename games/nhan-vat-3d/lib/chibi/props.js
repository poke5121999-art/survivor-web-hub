// Held props for the chibi body (hand-written). A prop builder (c, o) builds geometry on the hand bone frame and
// returns metadata: { pose, grip } where pose names an entry in poses.js and grip is the support-hand IK target
// (lib/arm-ik.js format). Hand frames (model units): the fist centre is at (side*(sh+0.05), J.grip, 0).
//   mode 'blade': item points forward out of the fist (Lanternfall's sword frame): local +Y forward, +Z down
//   mode 'gun'  : pistol grip; barrel along local +Y, pointing forward when the forearm is raised (aim 0.35)
//   mode 'hang' : no rotation; local +Y up, +Z forward (buckets, lanterns, cases hang below the fist)
import { PI, TAU, lerp } from '../lf/util.js';
import { J, EYE_Y, headFrontZ } from './body.js';
import { S_CLOTH, S_METAL, S_PLASTIC, S_RUBBER, S_WOOD, S_GLOW, S_LEATHER, S_GLASS, S_CHECK } from './mat.js';
import { mat } from './wear.js';

export const AIM = 0.35, PROP_K = 1.3; // props are modelled at real size; the chibi hand is ~1.3x bigger
const MODE = { blade: PI / 2, gun: PI - AIM, hang: 0, up: 0 };
export function handFrame(P, side) { return [side * (P.sh + 0.05), J.grip, 0]; }
export function inHand(c, side, mode, fn) {
  const { g, P } = c, [x, y] = handFrame(P, side);
  g.bone(side > 0 ? 'wL' : 'wR'); g.tr(x, y, 0, MODE[mode] || 0, 0, 0, PROP_K, PROP_K, PROP_K); fn(); g.pop();
}
// rest-space point of a local offset in a hand frame (for grip IK targets)
export function handPoint(P, side, mode, local) {
  const [x, y] = handFrame(P, side), a = MODE[mode] || 0, ca = Math.cos(a), sa = Math.sin(a);
  const l = local.map((v) => v * PROP_K); return [x + l[0], y + ca * l[1] - sa * l[2], sa * l[1] + ca * l[2]];
}
const rbox = (g, x, y, z, w, l, d, sq = 6) => { g.tr(x, y - l / 2, z); g.box(w, l, d, sq); g.pop(); };
const cyl = (g, y0, y1, r, seg = 10) => g.lathe([[r, y0], [r, y1]], seg, { cap0: true, cap1: true });
const twoGrip = (c, along, pole, mode = 'blade', sideOff = 0) => ({ side: 1, bone: 'wR', point: handPoint(c.P, -1, mode, [sideOff, along, 0]), pole: pole || [0.6, -1, -0.2] });
const P_ = {};

/* ---------- firearms ---------- */
function gunBody(c, o, k) {
  const { g } = c, body = o.col || [0.04, 0.04, 0.045], wood = o.wood;
  mat(c, body, S_METAL, 0); rbox(g, 0, 0.0 + 0.16 * k, -0.06, 0.045, 0.34 * k, 0.07);       // receiver
  g.tube([[0, 0.3 * k, -0.075], [0, (0.62 + (o.long || 0)) * k, -0.075]], 0.012, { seg: 8, sub: 1 });
  mat(c, wood || body.map((v) => v * 1.4), wood ? S_WOOD : S_PLASTIC, 0);
  rbox(g, 0, 0.3 * k + 0.12, -0.07, 0.05, 0.2 * k, 0.055);                                   // handguard
  g.tr(0, -0.16, -0.04, -0.15, 0, 0); g.box(0.042, 0.22, 0.075, 6); g.pop();                // stock
  mat(c, body, S_PLASTIC, 0); g.tr(0, 0.0, -0.035, PI / 2 + 0.35, 0, 0); g.box(0.032, 0.1, 0.04, 6); g.pop(); // grip
}
P_.rifle = (c, o) => { // AK / carbine, two hands. o.ak: curved mag + wood
  const k = o.len || 1; inHand(c, -1, 'gun', () => {
    const { g } = c; gunBody(c, Object.assign({ wood: o.ak ? [0.45, 0.22, 0.1] : null }, o), k);
    mat(c, o.col || [0.04, 0.04, 0.045], S_METAL, 0); g.tr(0, 0.14, -0.02, PI / 2 - (o.ak ? 0.0 : 0.2), 0, 0); if (o.ak) g.tube([[0, 0, 0], [0, 0.08, 0.02], [0, 0.15, 0.07]], 0.02, { seg: 6, sub: 2, flatten: 0.6 }); else g.box(0.03, 0.15, 0.07, 6); g.pop();
    if (o.optic !== false && !o.ak) { mat(c, [0.08, 0.08, 0.09], S_METAL, 0); rbox(g, 0, 0.22, -0.125, 0.035, 0.12, 0.04); }
    if (o.light) { mat(c, [1, 0.95, 0.7], S_GLOW, 1.5); rbox(g, 0.03, 0.52 * k, -0.07, 0.02, 0.01, 0.02); }
  });
  return { pose: o.pose || 'rifle', grip: twoGrip(c, 0.36 * k, [0.5, -1, -0.35], 'gun', 0) };
};
P_.shotgun = (c, o) => { const r = P_.rifle(c, Object.assign({ optic: false, wood: [0.4, 0.2, 0.09], long: 0.06 }, o)); return r; };
P_.smg = (c, o) => {
  inHand(c, -1, 'gun', () => { const { g } = c; mat(c, o.col || [0.05, 0.05, 0.055], S_METAL, 0); rbox(g, 0, 0.16, -0.06, 0.042, 0.26, 0.07); g.tube([[0, 0.25, -0.07], [0, 0.36, -0.07]], 0.011, { seg: 8, sub: 1 }); g.tr(0, 0.0, -0.035, PI / 2 + 0.35, 0, 0); g.box(0.03, 0.09, 0.04, 6); g.pop(); g.tr(0, 0.1, -0.02, PI / 2, 0, 0); g.box(0.028, 0.16, 0.035, 6); g.pop(); });
  return { pose: 'pistol' };
};
P_.pistol = (c, o) => {
  const side = o.side || -1; inHand(c, side, 'gun', () => { const { g } = c; mat(c, o.col || [0.06, 0.06, 0.065], S_METAL, 0); rbox(g, 0, 0.13, -0.06, 0.032, 0.17, 0.045); g.tr(0, 0.0, -0.03, PI / 2 + 0.3, 0, 0); g.box(0.028, 0.09, 0.04, 6); g.pop(); });
  return { pose: side < 0 ? 'pistol' : 'idle' };
};
P_.flamer = (c, o) => { inHand(c, -1, 'gun', () => { const { g } = c; mat(c, [0.15, 0.15, 0.16], S_METAL, 0); g.tube([[0, -0.05, -0.05], [0, 0.5, -0.06]], 0.025, { seg: 10, sub: 1 }); mat(c, [1, 0.5, 0.1], S_GLOW, 1.5); g.tr(0, 0.52, -0.06); g.sphere(0.02, 0.02, 0.02, 6, 4); g.pop(); }); return { pose: 'rifle', grip: twoGrip(c, 0.3, [0.5, -1, -0.35], 'gun') }; };

/* ---------- melee ---------- */
function shaft(c, y0, y1, r, col, t = S_WOOD) { mat(c, col, t, 0); c.g.tube([[0, y0, 0], [0, y1, 0]], r, { seg: 8, sub: 1 }); }
P_.bat = (c, o) => { // o.spiked, o.nails
  const side = o.side || -1; inHand(c, side, 'blade', () => { const { g } = c; mat(c, o.col || [0.55, 0.33, 0.16], S_WOOD, 0); g.lathe([[0.018, -0.12], [0.02, 0.1], [0.035, 0.45], [0.042, 0.68], [0.0, 0.7]], 10);
    if (o.spiked || o.nails) { mat(c, [0.6, 0.6, 0.62], S_METAL, 0); for (let i = 0; i < 10; i++) { const a = i * 2.4, y = 0.42 + (i % 5) * 0.055; g.tube([[Math.cos(a) * 0.03, y, Math.sin(a) * 0.03], [Math.cos(a) * 0.08, y + 0.01, Math.sin(a) * 0.08]], 0.005, { seg: 4, sub: 1 }); } }
    if (o.tape) { mat(c, o.tape, S_CLOTH, 0); g.lathe([[0.024, -0.1], [0.024, 0.06]], 10); }
    if (o.saw) { mat(c, [0.7, 0.7, 0.72], S_METAL, 0); g.tr(0, 0.6, 0, 0, 0, PI / 2); g.lathe([[0.16, -0.004], [0.16, 0.004], [0.0, 0.004]], 18); g.pop(); }
  });
  return { pose: o.pose || 'onehand' };
};
P_.machete = (c, o) => { const side = o.side || -1; inHand(c, side, 'blade', () => { const { g } = c; mat(c, [0.08, 0.06, 0.05], S_RUBBER, 0); cyl(g, -0.08, 0.06, 0.02); mat(c, [0.75, 0.77, 0.8], S_METAL, 0); g.loft([{ y: 0.06, rx: 0.004, rz: 0.03 }, { y: 0.3, rx: 0.004, rz: 0.04 }, { y: (o.len || 0.48), rx: 0.002, rz: 0.012 }].map((r) => Object.assign(r, { z: -0.01 })), { seg: 6, sub: 2, cap1: true }); }); return { pose: 'onehand' }; };
P_.cleaver = (c, o) => { const side = o.side || -1; inHand(c, side, 'blade', () => { const { g } = c; mat(c, [0.25, 0.15, 0.08], S_WOOD, 0); cyl(g, -0.06, 0.07, 0.018); mat(c, [0.78, 0.8, 0.82], S_METAL, 0); rbox(g, 0, 0.24, 0.04, 0.008, 0.17, 0.12, 3); }); return { pose: 'onehand' }; };
P_.knife = (c, o) => { const side = o.side || -1; inHand(c, side, 'blade', () => { const { g } = c; mat(c, [0.05, 0.05, 0.05], S_RUBBER, 0); cyl(g, -0.05, 0.05, 0.016); mat(c, [0.8, 0.8, 0.82], S_METAL, 0); g.loft([{ y: 0.05, rx: 0.004, rz: 0.02 }, { y: 0.2, rx: 0.002, rz: 0.004 }], { seg: 6, sub: 1, cap1: true }); }); return { pose: 'onehand' }; };
P_.sword = (c, o) => { const side = o.side || -1, L = o.len || 0.75; inHand(c, side, 'blade', () => { const { g } = c; mat(c, o.wrap || [0.1, 0.08, 0.1], S_CLOTH, 0); cyl(g, -0.14, 0.08, 0.017); mat(c, [0.3, 0.25, 0.15], S_METAL, 0); g.tr(0, 0.08, 0); cyl(g, 0, 0.012, 0.045); g.pop(); mat(c, [0.82, 0.84, 0.88], S_METAL, 0); g.loft([{ y: 0.09, rx: 0.005, rz: 0.022 }, { y: L * 0.85, rx: 0.004, rz: 0.02 }, { y: L, rx: 0.001, rz: 0.003 }], { seg: 6, sub: 2, cap1: true }); }); return { pose: o.pose || 'onehand' }; };
P_.axe = (c, o) => { // o.two: long two-handed axe
  const side = o.side || -1, L = o.two ? 0.8 : 0.5; inHand(c, side, 'blade', () => { const { g } = c; shaft(c, -0.12, L, 0.02, o.handle || [0.55, 0.35, 0.18]); mat(c, o.head || [0.65, 0.66, 0.7], S_METAL, 0);
    g.tr(0, L - 0.04, 0); g.loft([{ y: -0.05, rx: 0.025, rz: 0.03 }, { y: 0.0, rx: 0.02, rz: 0.03 }, { y: 0.06, rx: 0.006, rz: 0.075 }, { y: 0.1, rx: 0.002, rz: 0.08 }].map((r) => Object.assign(r, { z: 0 })), { seg: 6, sub: 1 }); g.pop();
    g.tr(0, L - 0.04, 0, 0, 0, 0); g.tr(0, 0, 0, PI / 2, 0, 0); g.lathe([[0.03, -0.05], [0.028, 0.04], [0.0, 0.045]], 6); g.pop(); g.pop();
    if (o.headCol) { mat(c, o.headCol, S_PLASTIC, 0); g.lathe([[0.024, -0.1], [0.024, 0.08]], 8); }
  });
  return { pose: o.two ? 'twohand' : 'onehand', grip: o.two ? twoGrip(c, 0.3, [0.6, -1, -0.2]) : null };
};
P_.crowbar = (c, o) => { const side = o.side || -1; inHand(c, side, 'blade', () => { const { g } = c; mat(c, o.col || [0.75, 0.1, 0.08], S_METAL, 0); g.tube([[0, -0.1, 0], [0, 0.45, 0], [0, 0.52, -0.02], [0, 0.54, -0.07]], 0.013, { seg: 7, sub: 3 }); }); return { pose: 'onehand' }; };
P_.wrench = (c, o) => { const side = o.side || -1; inHand(c, side, 'blade', () => { const { g } = c; mat(c, o.col || [0.75, 0.1, 0.08], S_PLASTIC, 0); rbox(g, 0, 0.12, 0, 0.03, 0.22, 0.02); mat(c, [0.6, 0.6, 0.62], S_METAL, 0); rbox(g, 0, 0.36, 0, 0.035, 0.18, 0.025); rbox(g, 0, 0.42, -0.025, 0.06, 0.07, 0.03); }); return { pose: 'onehand' }; };
P_.pipe = (c, o) => { const side = o.side || -1; inHand(c, side, 'blade', () => { const { g } = c; mat(c, o.col || [0.45, 0.45, 0.48], S_METAL, 0); cyl(g, -0.1, 0.5, 0.02, 8); }); return { pose: 'onehand' }; };
P_.shovel = (c, o) => { inHand(c, -1, 'blade', () => { const { g } = c; shaft(c, -0.25, 0.75, 0.02, [0.5, 0.32, 0.16]); mat(c, [0.15, 0.15, 0.15], S_PLASTIC, 0); g.tr(0, -0.27, 0, 0, 0, PI / 2); g.tube([[0, -0.06, 0], [0, 0.06, 0]], 0.018, { seg: 6, sub: 1 }); g.pop(); mat(c, [0.6, 0.6, 0.63], S_METAL, 0); g.tr(0, 0.75, 0); g.loft([{ y: 0, rx: 0.06, rz: 0.012 }, { y: 0.22, rx: 0.09, rz: 0.012 }, { y: 0.3, rx: 0.002, rz: 0.006 }], { seg: 8, sub: 2, cap0: true, cap1: true }); g.pop(); }); return { pose: o.pose || 'twohand', grip: twoGrip(c, 0.35, [0.6, -1, -0.2]) }; };
P_.sledge = (c, o) => { inHand(c, -1, 'blade', () => { const { g } = c; shaft(c, -0.1, 0.8, 0.022, o.handle || [0.85, 0.85, 0.8], S_PLASTIC); mat(c, o.head || [0.2, 0.2, 0.22], S_METAL, 0); g.tr(0, 0.8, 0, 0, 0, PI / 2); g.loft([{ y: -0.12, rx: 0.05 }, { y: 0.12, rx: 0.05 }], { seg: 8, sub: 1, cap0: true, cap1: true }); g.pop(); }); return { pose: 'twohand', grip: twoGrip(c, 0.3, [0.6, -1, -0.2]) }; };
P_.pickaxe = (c, o) => { inHand(c, -1, 'blade', () => { const { g } = c; shaft(c, -0.1, 0.62, 0.02, [0.5, 0.32, 0.16]); mat(c, [0.4, 0.4, 0.42], S_METAL, 0); g.tube([[0, 0.55, 0.22], [0, 0.63, 0.08], [0, 0.65, 0], [0, 0.63, -0.08], [0, 0.55, -0.22]], (t) => 0.022 * (1 - Math.abs(t - 0.5)), { seg: 6, sub: 3 }); }); return { pose: 'onehand' }; };
P_.chainsaw = (c, o) => {
  inHand(c, -1, 'blade', () => { const { g } = c; mat(c, o.col || [0.95, 0.45, 0.05], S_PLASTIC, 0); rbox(g, 0, 0.12, -0.04, 0.12, 0.26, 0.15); mat(c, [0.1, 0.1, 0.1], S_RUBBER, 0); g.tube([[0, -0.02, -0.02], [0, 0.0, -0.13], [0, 0.14, -0.14]], 0.014, { seg: 6, sub: 2 });
    mat(c, [0.7, 0.72, 0.75], S_METAL, 0); g.loft([{ y: 0.24, rx: 0.008, rz: 0.06 }, { y: 0.7, rx: 0.008, rz: 0.05 }, { y: 0.74, rx: 0.008, rz: 0.001 }].map((r) => Object.assign(r, { z: -0.02 })), { seg: 6, sub: 2 }); });
  return { pose: o.pose || 'twohandLow', grip: twoGrip(c, 0.06, [0.6, -1, -0.2], 'blade', 0) };
};
P_.torch = (c, o) => { const side = o.side || 1; inHand(c, side, 'up', () => { const { g } = c; mat(c, o.col || [0.85, 0.12, 0.1], S_PLASTIC, 0); cyl(g, -0.06, 0.14, 0.02); mat(c, o.flame || [1, 0.35, 0.15], S_GLOW, 3); g.tr(0, 0.18, 0); g.lathe([[0.025, -0.04], [0.03, 0.0], [0.0, 0.08]], 8); g.pop(); }); return { pose: side > 0 ? 'idle' : 'onehand' }; };
P_.flare = (c, o) => P_.torch(c, Object.assign({ col: [0.9, 0.1, 0.1], flame: [1, 0.3, 0.3] }, o));
P_.cig = (c, o) => { const side = o.side || -1; inHand(c, side, 'blade', () => { const { g } = c; mat(c, [0.95, 0.93, 0.88], S_CLOTH, 0); g.tr(0.03, 0.02, -0.03, 0, 0, PI / 2); cyl(g, -0.04, 0.05, 0.006, 6); g.pop(); mat(c, [1, 0.35, 0.1], S_GLOW, 2.5); g.tr(0.082, 0.02, -0.03); g.sphere(0.007, 0.007, 0.007, 5, 3); g.pop(); }); return {}; };
P_.sickle = (c, o) => { const side = o.side || -1; inHand(c, side, 'blade', () => { const { g } = c; shaft(c, -0.08, 0.1, 0.018, [0.5, 0.32, 0.16]); mat(c, [0.7, 0.72, 0.75], S_METAL, 0); g.tube(Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * PI * 1.1; return [0, 0.1 + Math.sin(a) * 0.14, -Math.cos(a) * 0.14 + 0.14]; }), (t) => 0.012 * (1 - t * 0.8), { seg: 5, sub: 2, flatten: 0.3 }); }); return { pose: 'onehand' }; };
P_.dynamite = (c, o) => { const side = o.side || 1; inHand(c, side, 'hang', () => { const { g } = c; mat(c, [0.85, 0.12, 0.1], S_PLASTIC, 0); for (const [x, z] of [[-0.022, 0.05], [0.022, 0.05], [0, 0.088]]) { g.tr(x, -0.05, z); cyl(g, 0, 0.17, 0.02, 8); g.pop(); } mat(c, [0.15, 0.15, 0.15], S_RUBBER, 0); g.tr(0, 0.03, 0.065); g.lathe([[0.05, -0.012], [0.05, 0.012]], 10); g.pop(); mat(c, [1, 0.7, 0.2], S_GLOW, 2); g.tr(0, 0.14, 0.07); g.sphere(0.008, 0.008, 0.008, 5, 3); g.pop(); }); return { pose: 'carry' }; };
P_.blowtorch = (c, o) => P_.torch(c, Object.assign({ col: [0.85, 0.12, 0.1], flame: [0.3, 0.5, 1] }, o));

/* ---------- carried / hanging ---------- */
const handle = (g, w, h) => g.tube([[-w / 2, -h, 0], [-w / 2, 0.0, 0], [w / 2, 0.0, 0], [w / 2, -h, 0]], 0.012, { seg: 5, sub: 2 });
P_.toolbox = (c, o) => { const side = o.side || 1, k = o.k || 1; inHand(c, side, 'hang', () => { const { g } = c; mat(c, [0.1, 0.1, 0.1], S_PLASTIC, 0); g.tr(0, 0, 0, 0, PI / 2, 0, k, k, k); handle(g, 0.1, 0.04); mat(c, o.col || [0.75, 0.1, 0.08], S_METAL, 0); rbox(g, 0, -0.04, 0, 0.36, 0.17, 0.17); mat(c, [0.85, 0.7, 0.2], S_METAL, 0); rbox(g, 0, -0.1, 0.087, 0.06, 0.03, 0.01); g.pop(); }); return { pose: 'carry' }; };
P_.medkit = (c, o) => { const side = o.side || 1; inHand(c, side, 'hang', () => { const { g } = c; mat(c, [0.1, 0.1, 0.1], S_PLASTIC, 0); g.tr(0, 0, 0, 0, PI / 2, 0); handle(g, 0.1, 0.04); mat(c, o.col || [0.85, 0.1, 0.1], S_PLASTIC, 0); rbox(g, 0, -0.04, 0, 0.32, 0.22, 0.12); mat(c, [0.98, 0.98, 0.98], S_PLASTIC, 0); rbox(g, 0, -0.1, 0.062, 0.1, 0.03, 0.006, 3); rbox(g, 0, -0.065, 0.062, 0.03, 0.1, 0.006, 3); g.pop(); }); return { pose: 'carry' }; };
P_.bucket = (c, o) => { const side = o.side || 1; inHand(c, side, 'hang', () => { const { g } = c; mat(c, [0.4, 0.4, 0.42], S_METAL, 0); g.tube([[-0.1, -0.12, 0], [-0.06, 0.0, 0], [0.06, 0.0, 0], [0.1, -0.12, 0]], 0.006, { seg: 4, sub: 3 }); mat(c, o.col || [0.55, 0.65, 0.68], S_METAL, 0); g.tr(0, -0.32, 0); g.lathe([[0.08, 0], [0.11, 0.2], [0.115, 0.205]], 14, { cap0: true, thick: 0.006 }); g.pop(); }); return { pose: 'carry' }; };
P_.lantern = (c, o) => { const side = o.side || 1; inHand(c, side, 'hang', () => { const { g } = c; mat(c, o.col || [0.75, 0.75, 0.2], S_PLASTIC, 0); g.tr(0, -0.24, 0); g.lathe([[0.06, 0], [0.07, 0.03], [0.04, 0.035]], 10, { cap0: true }); mat(c, [1, 0.85, 0.4], S_GLOW, 2.5); g.lathe([[0.04, 0.035], [0.045, 0.13], [0.04, 0.15]], 10); mat(c, o.col || [0.75, 0.75, 0.2], S_PLASTIC, 0); g.lathe([[0.05, 0.15], [0.06, 0.17], [0.02, 0.21], [0.0, 0.21]], 10); g.pop(); handle(g, 0.06, 0.03); }); return { pose: 'carry' }; };
P_.can = (c, o) => { const side = o.side || 1; inHand(c, side, 'hang', () => { const { g } = c; mat(c, o.col || [0.85, 0.12, 0.1], S_METAL, 0); g.tr(0, 0.02, 0.075); g.lathe([[0.034, 0], [0.037, 0.012], [0.037, 0.13], [0.028, 0.145], [0.0, 0.145]], 12, { cap0: true }); g.pop(); mat(c, [0.85, 0.85, 0.88], S_METAL, 0); g.tr(0, 0.165, 0.075); g.lathe([[0.028, 0], [0.0, 0.004]], 12); g.pop(); }); return { pose: 'drink' }; };
P_.mug = (c, o) => { const side = o.side || 1; inHand(c, side, 'hang', () => { const { g } = c; mat(c, o.col || [0.35, 0.65, 0.2], S_PLASTIC, 0); g.tr(0, -0.03, 0.04); g.lathe([[0.04, 0], [0.042, 0.1]], 12, { cap0: true, thick: 0.006 }); g.pop(); }); return { pose: 'drink' }; };
P_.radio = (c, o) => { const side = o.side || 1; inHand(c, side, 'hang', () => { const { g } = c; mat(c, [0.08, 0.08, 0.09], S_PLASTIC, 0); rbox(g, 0, 0.06, 0.03, 0.05, 0.13, 0.03); g.tube([[0.015, 0.06, 0.03], [0.015, 0.16, 0.03]], 0.005, { seg: 4, sub: 1 }); }); return { pose: 'radio' }; };
P_.syringe = (c, o) => { const side = o.side || -1; inHand(c, side, 'up', () => { const { g } = c; mat(c, [0.85, 0.9, 0.95], S_GLASS, 0); cyl(g, -0.02, 0.12, 0.016); mat(c, [0.7, 0.7, 0.72], S_METAL, 0); g.tube([[0, 0.12, 0], [0, 0.18, 0]], 0.003, { seg: 4, sub: 1 }); }); return { pose: 'syringe' }; };
P_.binoculars = (c, o) => { // held up to the eyes: built on the head bone in front of the face; the pose brings both fists to its sides
  const { g } = c, hk = (c.spec.body && c.spec.body.head) || 1, z0 = headFrontZ(0, EYE_Y) + 0.01;
  g.bone('head'); g.tr(0, J.head, 0, 0, 0, 0, hk, hk, hk); g.tr(0, -J.head, 0);
  for (const s of [1, -1]) { mat(c, [0.1, 0.1, 0.11], S_RUBBER, 0); g.tr(s * 0.07, EYE_Y, z0, PI / 2, 0, 0); g.lathe([[0.042, 0], [0.04, 0.09], [0.05, 0.1], [0.05, 0.15]], 12, { cap0: true, cap1: true }); g.pop();
    mat(c, [0.25, 0.4, 0.55], S_GLASS, 0); g.tr(s * 0.07, EYE_Y, z0 + 0.152, PI / 2, 0, 0); g.lathe([[0.04, 0], [0.0, 0.004]], 12); g.pop(); }
  mat(c, [0.1, 0.1, 0.11], S_RUBBER, 0); g.tr(0, EYE_Y, z0 + 0.05); g.box(0.08, 0.03, 0.05, 4); g.pop();
  g.pop(); g.pop(); return { pose: 'binoculars' };
};
const MAP_RX = 1.4; // the map pose lifts the forearms ~1.6 rad: tip the sheet back up so it faces forward
P_.map = (c, o) => { inHand(c, -1, 'hang', () => { const { g } = c; mat(c, [0.07, 0.3, 0.11], S_CLOTH, 0); g.tr(0, 0, 0.04, MAP_RX, 0, 0); g.surf(6, 4, (u, v) => [-0.06 + u * 0.56, 0.2 - v * 0.42, 0.07 + Math.sin(u * PI) * 0.03], { thick: 0.004 }); mat(c, [0.85, 0.9, 0.95], S_CLOTH, 0); g.tube([[0.04, 0.1, 0.11], [0.18, -0.02, 0.105], [0.3, 0.04, 0.105], [0.42, -0.1, 0.09]], 0.007, { seg: 4, sub: 2 }); g.pop(); }); return { pose: 'map' }; };
P_.guitar = (c, o) => { inHand(c, -1, 'blade', () => { const { g } = c; mat(c, o.col || [0.55, 0.32, 0.15], S_WOOD, 0); g.tr(0.06, 0.05, 0.1, 0, 0, 0, 1.45, 1.45, 1.45); g.loft([{ y: -0.04, rx: 0.12, rz: 0.04 }, { y: 0.1, rx: 0.14, rz: 0.05 }, { y: 0.2, rx: 0.1, rz: 0.05 }, { y: 0.3, rx: 0.12, rz: 0.05 }, { y: 0.38, rx: 0.05, rz: 0.04 }], { seg: 14, sub: 2, cap0: true, cap1: true }); mat(c, [0.2, 0.12, 0.06], S_WOOD, 0); g.tr(0, -0.04, 0); rbox(g, 0, 0, 0, 0.04, 0.4, 0.02); g.pop(); g.pop(); }); return { pose: 'guitar' }; };
P_.extinguisher = (c, o) => { inHand(c, 1, 'hang', () => { const { g } = c; mat(c, o.col || [0.85, 0.1, 0.08], S_PLASTIC, 0); g.tr(0, -0.42, 0); g.lathe([[0.06, 0], [0.065, 0.02], [0.065, 0.34], [0.03, 0.39], [0.0, 0.39]], 12, { cap0: true }); g.pop(); mat(c, [0.1, 0.1, 0.1], S_PLASTIC, 0); rbox(g, 0, 0.0, 0, 0.03, 0.06, 0.06); }); return { pose: 'carry' }; };
P_.crutch = (c, o) => { const side = o.side || 1; inHand(c, side, 'hang', () => { const { g } = c; mat(c, o.col || [0.4, 0.45, 0.5], S_METAL, 0); g.tube([[0, 0.1, -0.02], [0, -0.85, 0.02]], 0.012, { seg: 6, sub: 1 }); mat(c, [0.1, 0.1, 0.1], S_RUBBER, 0); g.tr(0, -0.85, 0.02); cyl(g, -0.03, 0.0, 0.016); g.pop(); g.tr(0, 0.1, -0.02, 0, 0, PI / 2); cyl(g, -0.05, 0.05, 0.018); g.pop(); }); return { pose: 'crutch' }; };
P_.sign = (c, o) => { inHand(c, 1, 'hang', () => { const { g } = c; mat(c, [0.6, 0.6, 0.62], S_METAL, 0); g.tube([[0, 0.1, 0.0], [0, -0.75, 0.0]], 0.012, { seg: 6, sub: 1 }); mat(c, [0.95, 0.95, 0.95], S_PLASTIC, 0); g.tr(0, 0.32, 0.0); g.lathe([[0.0, 0], [0.2, 0.0], [0.2, 0.01], [0, 0.01]].map(([r, y]) => [r, y]), 3); g.pop(); g.tr(0, 0.28, 0.02, PI / 2, 0, 0); g.loft([{ y: 0, rx: 0.2, rz: 0.17, sq: 1 }, { y: 0.012, rx: 0.2, rz: 0.17, sq: 1 }], { seg: 3, sub: 1, cap0: true, cap1: true }); g.pop(); mat(c, o.col || [0.2, 0.4, 0.9], S_PLASTIC, 0); g.tr(0, 0.28, 0.035, PI / 2, 0, 0); g.loft([{ y: 0, rx: 0.15, rz: 0.13, sq: 1 }, { y: 0.004, rx: 0.15, rz: 0.13, sq: 1 }], { seg: 3, sub: 1, cap1: true }); g.pop(); }); return { pose: 'carry' }; };
P_.camera = (c, o) => { const { g } = c; g.bone('chest'); mat(c, [0.15, 0.15, 0.17], S_PLASTIC, 0); g.tr(0, 1.36, 0.2); g.box(0.13, 0.08, 0.06, 6); g.pop(); mat(c, [0.1, 0.1, 0.1], S_GLASS, 0); g.tr(0, 1.32, 0.235, PI / 2, 0, 0); cyl(g, 0, 0.03, 0.03); g.pop(); return {}; };

/* ---------- shields and big carried items (left arm) ---------- */
// shields are strapped across the forearm: the board's long side is turned off the forearm axis so it stands upright
// when the 'shield' pose holds the forearm level across the body
const SH_RX = PI / 2, SH_RZ = PI / 2;
P_.riotshield = (c, o) => { inHand(c, 1, 'hang', () => { const { g } = c; g.tr(0, 0, 0, 0, 0, SH_RZ); g.tr(0, 0, 0, SH_RX, 0, 0); mat(c, o.col || [0.75, 0.78, 0.8], S_METAL, 0.1); g.tr(-0.02, -0.45, 0.12); g.box(0.04, 1.0, 0.55, 12); g.pop(); if (o.hazard) { mat(c, [0.95, 0.8, 0.05], S_PLASTIC, 0); for (const y of [-0.38, -0.12, 0.14, 0.4]) for (let k = -2; k <= 2; k++) { g.tr(-0.044, y + k * 0.0, 0.12 + k * 0.11, 0.7, 0, 0); g.box(0.008, 0.11, 0.045, 4); g.pop(); } } if (o.window !== false) { mat(c, [0.1, 0.12, 0.15], S_GLASS, 0); g.tr(-0.045, 0.32, 0.12); g.box(0.01, 0.1, 0.3, 6); g.pop(); } g.pop(); g.pop(); }); return { pose: 'shield' }; };
P_.scrapshield = (c, o) => { inHand(c, 1, 'hang', () => { const { g } = c; g.tr(0, 0, 0, 0, 0, SH_RZ); g.tr(0, 0, 0, SH_RX, 0, 0); mat(c, o.col || [0.4, 0.25, 0.18], S_METAL, 0.3); g.tr(-0.02, -0.4, 0.14); g.box(0.05, 0.85, 0.6, 3); g.pop(); mat(c, [0.6, 0.6, 0.6], S_METAL, 0); for (let i = 0; i < 8; i++) { g.tr(-0.055, -0.32 + (i % 4) * 0.23, 0.14 + (i < 4 ? -0.22 : 0.22) + 0.03); g.sphere(0.018, 0.018, 0.018, 5, 3); g.pop(); } g.pop(); g.pop(); }); return { pose: 'shield' }; };
P_.board = (c, o) => P_.scrapshield(c, Object.assign({ col: [0.75, 0.75, 0.78] }, o));
P_.log = (c, o) => { // spiked log across both shoulders
  const { g, P } = c; g.bone('chest'); mat(c, o.col || [0.35, 0.36, 0.38], S_METAL, 0); g.tr(0, 1.68, -0.05, 0, 0, PI / 2); g.loft([{ y: -0.6, rx: 0.07 }, { y: 0.6, rx: 0.07 }], { seg: 10, sub: 1, cap0: true, cap1: true });
  mat(c, [0.8, 0.8, 0.82], S_METAL, 0); for (let i = 0; i < 12; i++) { const a = i * 2.1, y = -0.5 + i * 0.09; g.tube([[Math.cos(a) * 0.06, y, Math.sin(a) * 0.06], [Math.cos(a) * 0.14, y, Math.sin(a) * 0.14]], 0.008, { seg: 4, sub: 1 }); } g.pop(); return { pose: 'yoke' };
};
P_.shoulderSword = (c, o) => { const r = P_.sword(c, Object.assign({ len: 0.9 }, o)); return { pose: 'shoulder' }; };

export const PROPS = P_;
