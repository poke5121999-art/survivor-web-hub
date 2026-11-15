// Combat sheet row 4 (cells 52-58): seven guns built the way Saltline builds the PAC-9 (weapon.md §1): metres, gun
// frame forward = -Z (helpers take forward as a positive number), side plates are bevelled 2D extrusions (sidePlate),
// rails are 10 mm-pitch tooth extrusions (railProfile), barrels/muzzles/screws are lathes and pins, magazines are
// curved extrusions with ribs, all vertex-painted with Saltline's edge wear. Materials: PAC-9 anodised / phosphate /
// polymer plus Saltline sets (wood, worn paint, tape, hazard stripes) and Saltline stencil labels as decals.
import { weapon } from '../js/weapon.js';
import { GUNMATS } from '../js/mats.js';
import { gbox, sidePlate, railProfile, glathe, gpin, gslot, chamferRect } from '../js/kit.js';
import { C } from './common.js';

const W1 = [1, 1, 1], BR = [5.5, 5.5, 5.7], DK = [0.4, 0.4, 0.42], MID = [1.6, 1.6, 1.65];
const M = (m) => (typeof m === 'string' ? (GUNMATS[m] ? { gun: m } : [m]) : m);
const A = (k, geo, m, o = {}) => k.add(geo, M(m), Object.assign({ keep: true, grain: 'z' }, o));
const off = (pts, df, dy) => pts.map(([f, y]) => [f + df, y + dy]);
const isSet = (m) => !(typeof m === 'string' && GUNMATS[m]);
const wearOf = (m, w) => (isSet(m) ? Math.min(w, 0.4) : w);

/** side plate: profile in (forward, y), half thickness hw */
function plate(k, m, prof, hw, o = {}) { A(k, sidePlate(prof, -hw + (o.x ?? 0), hw + (o.x ?? 0), o.bev ?? 0.0014, o.col ?? W1, wearOf(m, o.wear ?? 9), o.holes ?? null), m, { blood: o.blood }); }
/** box w x h x d centred at (x, y, fwd) */
function box(k, m, w, h, d, x, y, f, o = {}) { A(k, gbox(w, h, d, o.bev ?? Math.min(w, h, d) * 0.15, x, y, f, o.col ?? W1, wearOf(m, o.wear ?? 5), o.rot ?? null), m, { blood: o.blood }); }
/** lathe along forward at (x, y): prof [[r, fwd], ...] */
function lat(k, m, prof, o = {}) { A(k, glathe(prof, o.seg ?? 20, o.col ?? W1, wearOf(m, o.wear ?? 5), o.x ?? 0, o.y ?? 0), m, { blood: o.blood }); }
/** screw head on a side face (pin along X) */
function screw(k, x, y, f, r = 0.0024) { A(k, gpin(r, 0.0024, x, y, f, BR, 10), 'gun'); }
/** Picatinny rail from f0..f1 with its base at height y (PAC-9 profile, teeth every 10 mm, 4.8 mm wide) */
function rail(k, f0, f1, y, m = 'ano', w = 1) {
  const b = y - 0.0335;
  A(k, railProfile([[-0.0078 * w, 0.0335 + b], [0.0078 * w, 0.0335 + b], [0.0106 * w, 0.0402 + b], [-0.0106 * w, 0.0402 + b]], f0, f1, 5e-4, W1, 0), m);
  const tooth = [[-0.0102, 0.0398], [0.0102, 0.0398], [0.0106, 0.0408], [0.0084, 0.0435], [-0.0084, 0.0435], [-0.0106, 0.0408]].map(([x, yy]) => [x * w, yy + b]);
  for (let f = f0 + 0.002; f + 0.0048 < f1; f += 0.01) A(k, railProfile(tooth, f, f + 0.0048, 8e-4, W1, isSet(m) ? 0.3 : 9), m);
}
/** stepped barrel: steps [[r, fwd], ...] from breech to muzzle */
function barrel(k, steps, o = {}) { const p = [[0, steps[0][1]], ...steps, [steps[steps.length - 1][0] * 0.5, steps[steps.length - 1][1]]]; lat(k, o.m ?? 'gun', p, { col: o.col ?? W1, y: o.y ?? 0, wear: 5 }); }
/** PAC-9 style muzzle device at forward f (3 rings + crowned flash hider with dark bore) */
function muzzleDevice(k, f, r = 0.0116, y = 0) {
  lat(k, 'gun', [[0.005, f], [r * 0.93, f], [r, f + 0.0015], [r, f + 0.018], [0.0052, f + 0.019]], { y });
  for (const d of [0.027, 0.037, 0.047]) lat(k, 'gun', [[0.0052, f + d - 0.0019], [r * 0.95, f + d - 0.0019], [r, f + d - 0.0012], [r, f + d + 0.0012], [r * 0.95, f + d + 0.0019], [0.0052, f + d + 0.0019]], { y });
  lat(k, 'gun', [[0.0052, f + 0.018], [0.0052, f + 0.058]], { y, col: DK, seg: 12 });
  lat(k, 'gun', [[0.0052, f + 0.0555], [r * 0.95, f + 0.0555], [r, f + 0.0565], [r, f + 0.068], [r * 0.88, f + 0.0715], [0.0048, f + 0.0715], [0.0036, f + 0.067], [0.0036, f + 0.036]], { y });
  for (const s of [-1, 1]) box(k, 'gun', 0.0125 * r / 0.0116, 0.0042, 0.042, 0, y + s * 0.0096 * r / 0.0116, f + 0.037);
}
/** PAC-9 pistol grip (13-pt polygon + 9 ribs + 7 finger ribs), offset so its top front sits at (f, y) */
function pistolGrip(k, f, y, m = 'poly', o = {}) {
  const df = f + 0.038, dy = y + 0.05, hw = o.hw ?? 0.0165;
  const prof = off([[-0.038, -0.05], [-0.045, -0.074], [-0.049, -0.086], [-0.049, -0.1], [-0.054, -0.112], [-0.057, -0.13], [-0.064, -0.158], [-0.11, -0.152], [-0.102, -0.112], [-0.096, -0.082], [-0.095, -0.064], [-0.103, -0.046], [-0.08, -0.044]], df, dy);
  plate(k, m, prof, hw, { bev: 0.005, wear: 0.6, col: o.col });
  for (let i = 0; i < 9; i++) { const X = -0.078 - i * 0.0082; box(k, m, hw * 2.09, 0.0028, 0.03, 0, X + dy, -0.073 + (X + 0.078) * 0.26 + df, { rot: [-0.25, 0, 0], wear: 0.6, col: o.col }); }
  for (let i = 0; i < 7; i++) { const X = -0.078 - i * 0.01; box(k, m, hw * 1.33, 0.0045, 0.006, 0, X + dy, -0.098 + (X + 0.078) * 0.14 + df, { rot: [-0.14, 0, 0], wear: 0.6, col: o.col }); }
  box(k, m, hw * 2.12, 0.006, 0.05, 0, -0.157 + dy, -0.087 + df, { rot: [0.13, 0, 0], col: o.col });
  return { f: -0.08 + df, y: -0.1 + dy };
}
/** PAC-9 trigger + trigger guard (with window), front of the guard at forward f, top at y */
function triggerGroup(k, f, y, m = 'poly') {
  const df = f - 0.033, dy = y + 0.056;
  plate(k, m, off([[0.033, -0.056], [0.033, -0.093], [0.024, -0.1005], [-0.031, -0.1005], [-0.041, -0.09], [-0.041, -0.06]], df, dy), 0.0085, { bev: 8e-4, wear: 0.6, holes: [off([[0.028, -0.059], [0.028, -0.091], [0.022, -0.096], [-0.029, -0.096], [-0.036, -0.088], [-0.036, -0.061]], df, dy)] });
  plate(k, 'gun', off([[-0.006, -0.057], [0.004, -0.057], [0.003, -0.069], [0.0065, -0.079], [0.01, -0.086], [0.0065, -0.088], [0.001, -0.081], [-0.004, -0.07]], df, dy), 0.0032, { bev: 8e-4, col: BR, wear: 0 });
}
/** box/banana magazine. Top centre at (f, y); len along -Y, curve = forward sweep factor, w = fore-aft depth, t = half thickness */
function magazine(k, f, y, o = {}) {
  const N = o.len ?? 0.212, cu = o.curve ?? 1.5, w = (o.w ?? 0.0596) / 2, t = o.t ?? 0.0113, m = o.m === 'poly' || !o.m ? ['polymer', 0x34373c] : o.m, Q = 12;
  const D = (s) => cu * Math.pow(Math.max(0, s - 0.07 * N / 0.212), 2) * 0.212 / N;
  const prof = [];
  for (let i = 0; i <= Q; i++) { const s = -0.004 + (N + 0.004) * i / Q; prof.push([f + D(s) + w, y - s]); }
  for (let i = Q; i >= 0; i--) { const s = -0.004 + (N + 0.004) * i / Q; prof.push([f + D(s) - w, y - s]); }
  plate(k, m, prof, t, { bev: 0.002, wear: 0.25, col: o.col, blood: o.blood });
  const slope = (s) => Math.atan(2 * cu * Math.max(0, s - 0.07 * N / 0.212) * 0.212 / N);
  for (let i = 0; i < (o.ribs ?? 8); i++) { const s = N * (0.39 + i * 0.073); if (s > N - 0.01) break; box(k, m, t * 2.18, 0.0058, w * 1.68, 0, y - s, f + D(s), { rot: [slope(s), 0, 0], wear: 0.3, col: o.col }); }
  box(k, m, t * 2.4, 0.009, w * 2.28, 0, y - N - 0.003, f + D(N) + 0.001, { rot: [slope(N), 0, 0], wear: 0.3, col: o.col });
}
/** tape wrapped around the forward axis between f0..f1 at (x, y); rx, ry radii under the tape */
function tape(k, f0, f1, y, rx, ry, col, o = {}) {
  const band = o.band ?? 0.022, n = Math.max(1, Math.round((f1 - f0) / (band * (o.spiral ? 0.55 : 0.8)))), h = (f1 - f0) / n, mat = o.mat ?? ['tape', col];
  for (let i = 0; i < n; i++) {
    const f = f0 + h * (i + 0.5), t = 0.0007 * (1 + (i % 2) * 0.7);
    const g = glathe([[1, f - band / 2], [1 + t / Math.min(rx, ry), f - band / 2 + 0.002], [1 + t / Math.min(rx, ry), f + band / 2 - 0.002], [1, f + band / 2]], 22, W1, 0);
    g.translate(0, 0, f); g.scale(rx, ry, 1); if (o.spiral) { g.rotateX(o.spiral * (1 + (i % 3 - 1) * 0.12)); } else { g.rotateX((i % 2 ? 1 : -1) * 0.07); g.rotateY((i % 3 - 1) * 0.04); } g.translate(o.x ?? 0, y, -f);
    k.add(g, mat, { col: o.vcol, grain: 'z', grime: o.grime ?? 0.4, blood: o.blood });
  }
}
/** hazard-stripe plate on both sides of a part */
function hazard(k, f0, f1, y0, y1, x) { for (const s of [-1, 1]) box(k, 'hazard', 0.0012, y1 - y0, f1 - f0, s * x, (y0 + y1) / 2, (f0 + f1) / 2, { bev: 4e-4, wear: 0.2 }); }
/** front sight post on a block */
function frontSight(k, f, y, m = 'ano', h = 0.03) { box(k, m, 0.016, 0.01, 0.022, 0, y + 0.005, f); for (const s of [-1, 1]) box(k, m, 0.0035, h, 0.012, s * 0.007, y + h / 2, f); A(k, gpin(0.0016, 0.011, 0, y + h * 0.75, f, BR, 6), 'gun'); }
function rearSight(k, f, y, m = 'ano') { box(k, m, 0.021, 0.0075, 0.03, 0, y + 0.004, f); box(k, m, 0.018, 0.016, 0.006, 0, y + 0.014, f - 0.008); lat(k, 'gun', [[0.0018, 0], [0.0042, 0], [0.0042, 0.003], [0.0018, 0.003]], { y: y + 0.017, seg: 12 }); }
/** Saltline stencil label decal on the left (x<0) or right side */
function label(k, text, f, y, h, x, color = 'white', o = {}) {
  const d = k.mats.sl.label(text, { color, distress: o.distress ?? 0.5, font: o.font });
  k.decal(d, h, [x, y, -f], [0, x < 0 ? -Math.PI / 2 * 57.2958 : Math.PI / 2 * 57.2958, 0]);
}
const sock = (k, grip, grip2, muz) => { k.grip([0, grip[1], -grip[0]], [0, 0, -1], [0, 1, 0]); k.grip2([0, grip2[1], -grip2[0]], [0, 0, -1], [0, 1, 0]); k.muzzle([0, muz[1], -muz[0]], [0, 0, -1]); k.tip([0, muz[1], -muz[0]]); };

export default [
  // ---------------------------------------------------------------- 52: battle rifle, side-folding tube stock
  weapon('rifle-side-fold', 'Rifle, side-fold stock', { kind: 'gun', gun: true, hands: 2, blood: 0 }, (k) => {
    const RC = ['paint_worn', 0x5a2e22];                    // rust-brown painted receiver
    plate(k, RC, [[-0.13, -0.022], [0.12, -0.022], [0.125, 0.012], [0.12, 0.032], [-0.118, 0.032], [-0.13, 0.024]], 0.021, { holes: [chamferRect(-0.02, 0.0, 0.05, 0.016, 0.003)], wear: 0.4 });
    plate(k, 'ano', [[-0.12, -0.022], [0.07, -0.022], [0.075, -0.05], [0.0, -0.058], [-0.06, -0.058], [-0.12, -0.04]], 0.019, { wear: 9 });       // lower receiver
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) A(k, gpin(0.0032, 0.003, s * 0.0215, 0.016, -0.1 + i * 0.03, BR, 12), 'gun');           // rivet row
    box(k, 'gun', 0.004, 0.012, 0.07, -0.022, 0.006, 0.0, { col: BR });                                                                  // cocking tube slot
    A(k, gpin(0.004, 0.022, -0.033, 0.006, 0.045, MID, 10), 'gun');
    hazard(k, 0.03, 0.08, -0.05, -0.024, 0.0195);
    rail(k, -0.11, 0.1, 0.032);
    // handguard: octagonal free-float tube with slots, rail on top
    for (let i = 0; i < 8; i++) {
      const holes = []; if (i % 2 === 0) for (let j = 0; j < 5; j++) holes.push(gslot(0.15 + j * 0.04, 0, 0.026, 0.0065, 4));
      const g = sidePlate([[0.122, -0.009], [0.33, -0.009], [0.33, 0.009], [0.122, 0.009]], 0.0205, 0.0235, 9e-4, W1, 9, holes); g.rotateZ(i * Math.PI / 4); g.translate(0, 0.004, 0); A(k, g, 'ano');
    }
    rail(k, 0.125, 0.33, 0.028);
    barrel(k, [[0.0105, 0.12], [0.0092, 0.2], [0.0085, 0.33], [0.0085, 0.42], [0.008, 0.44]], { y: 0.004 });
    muzzleDevice(k, 0.44, 0.0112, 0.004);
    frontSight(k, 0.315, 0.035, 'ano', 0.034); rearSight(k, -0.085, 0.045);
    pistolGrip(k, -0.035, -0.035, 'poly');
    triggerGroup(k, 0.005, -0.04);
    magazine(k, 0.045, -0.04, { len: 0.2, curve: 1.3, m: 'poly' });
    // side-folding skeleton stock: welded tube frame + butt plate, painted to match the receiver
    const tube = (f0, y0, f1, y1, r = 0.0075) => { const L = Math.hypot(f1 - f0, y1 - y0); const g = glathe([[0, 0], [r, 0], [r, L], [0, L]], 12, W1, 0.3); g.rotateX(Math.atan2(y1 - y0, f1 - f0)); g.translate(0, y0, -f0); A(k, g, RC); };
    tube(-0.36, 0.012, -0.13, 0.012); tube(-0.36, -0.07, -0.2, -0.05); tube(-0.2, -0.05, -0.13, -0.01, 0.007);
    plate(k, RC, [[-0.385, -0.1], [-0.355, -0.1], [-0.355, 0.04], [-0.385, 0.04]], 0.019, { bev: 0.004, wear: 0.4 });
    plate(k, 'rubber', [[-0.397, -0.098], [-0.384, -0.098], [-0.384, 0.038], [-0.397, 0.038]], 0.02, { bev: 0.004, wear: 0.2 });
    box(k, 'gun', 0.03, 0.03, 0.02, 0, 0.0, -0.135, { col: MID });                                                                         // hinge
    A(k, gpin(0.006, 0.034, 0, 0.0, -0.135, BR, 14), 'gun');
    sock(k, [-0.07, -0.08], [0.24, -0.02], [0.512, 0.004]);
  }),

  // ---------------------------------------------------------------- 53: AK, taped handguard, painted stock
  weapon('ak-taped', 'AK rifle, taped stock', { kind: 'gun', gun: true, hands: 2, blood: 0.18 }, (k) => {
    // stamped receiver + ribbed dust cover + rivets, wood furniture (painted black, scratched), tape, decals
    plate(k, 'gun', [[-0.135, -0.03], [0.115, -0.03], [0.12, 0.018], [-0.13, 0.018]], 0.0205, { col: MID, wear: 6 });
    lat(k, 'gun', [[0, -0.12], [0.019, -0.12], [0.0205, -0.115], [0.0205, 0.1], [0, 0.1]], { y: 0.018, col: MID, seg: 24 });                  // dust cover
    for (let i = 0; i < 6; i++) box(k, 'gun', 0.042, 0.003, 0.004, 0, 0.037, -0.11 + i * 0.012, { col: MID });
    for (const [f, y] of [[-0.11, -0.02], [-0.06, -0.02], [0.03, -0.02], [0.09, -0.02], [0.105, 0.005]]) for (const s of [-1, 1]) A(k, gpin(0.0028, 0.0026, s * 0.0215, y, f, BR, 10), 'gun');
    box(k, 'gun', 0.006, 0.014, 0.03, 0.023, 0.026, -0.005, { col: BR });                                                                 // charging handle
    A(k, gpin(0.0055, 0.012, 0.03, 0.026, -0.005, BR, 12), 'gun');
    box(k, 'gun', 0.0025, 0.012, 0.05, 0.0218, 0.009, -0.085, { col: MID });                                                  // selector lever
    // rear sight leaf + block, gas block, front sight tower
    box(k, 'gun', 0.03, 0.02, 0.05, 0, 0.03, 0.14, { col: MID }); box(k, 'gun', 0.022, 0.006, 0.07, 0, 0.042, 0.15, { col: MID });
    lat(k, 'gun', [[0, 0.12], [0.009, 0.12], [0.009, 0.36], [0, 0.36]], { y: 0.03, col: [2.6, 3.2, 3.6], seg: 14 });                        // gas tube (blued, light)
    box(k, 'gun', 0.026, 0.05, 0.032, 0, 0.012, 0.37, { col: MID });
    barrel(k, [[0.0115, 0.115], [0.0095, 0.2], [0.009, 0.5], [0.0085, 0.53]], {});
    frontSight(k, 0.505, 0.012, 'gun', 0.05);
    lat(k, 'gun', [[0.004, 0.53], [0.011, 0.53], [0.012, 0.535], [0.012, 0.57], [0.004, 0.575]], { col: MID });                               // slant brake
    box(k, 'gun', 0.02, 0.006, 0.03, 0, 0.012, 0.56, { col: MID, rot: [0.35, 0, 0] });
    // handguard (wood) + upper over the gas tube; one bandage wrap around both, spiralled, overlapping
    plate(k, 'wood', [[0.125, -0.03], [0.33, -0.03], [0.34, -0.012], [0.33, 0.012], [0.125, 0.012]], 0.021, { bev: 0.006, wear: 0.3, col: [0.5, 0.36, 0.3] });
    lat(k, 'wood', [[0, 0.13], [0.014, 0.13], [0.016, 0.135], [0.016, 0.3], [0, 0.31]], { y: 0.03, col: [0.5, 0.36, 0.3], seg: 16 });
    tape(k, 0.165, 0.325, 0.006, 0.0235, 0.0405, 0xe6dcd2, { band: 0.016, spiral: 0.14, blood: 0.25 });
    // AK pistol grip: raked back ~18 degrees, finger swell, ribbed sides (PAC-9 grip helper, slimmer)
    pistolGrip(k, -0.028, -0.03, 'poly', { hw: 0.0145 });
    triggerGroup(k, 0.012, -0.03, 'gun');
    magazine(k, 0.068, -0.03, { len: 0.21, curve: 2.6, w: 0.062, m: 'poly', ribs: 7, col: [1.3, 1.2, 1.15] });
    // stock: thin wrist, deep butt, rounded edges (heavy bevel), black-painted wood; light red gouges as on the sheet
    plate(k, ['polymer', 0x1b1b1e], [[-0.132, 0.014], [-0.132, -0.032], [-0.19, -0.04], [-0.395, -0.112], [-0.405, -0.106], [-0.405, -0.002], [-0.395, 0.008], [-0.19, 0.004]], 0.0185, { bev: 0.0085, wear: 0.3 });
    plate(k, 'gun', [[-0.414, -0.11], [-0.404, -0.11], [-0.404, 0.006], [-0.414, 0.006]], 0.0175, { bev: 0.003, col: MID });
    for (const [f, y, a, L] of [[-0.3, -0.04, 0.5, 0.05], [-0.268, -0.03, 0.35, 0.036], [-0.335, -0.024, 0.55, 0.03]]) for (const sd of [-1, 1]) box(k, ['paint', 0xc4504a], 0.0012, 0.0035, L, sd * 0.0186, y, f, { rot: [a, 0, 0], bev: 3e-4, wear: 0.1 });
    tape(k, -0.215, -0.165, -0.014, 0.0195, 0.024, 0xe6dcd2, { band: 0.015, spiral: 0.14, blood: 0.2 });
    // red badge panel with a black star in a ring + our own red stencil word on the front of the receiver
    for (const sd of [-1, 1]) {
      box(k, ['paint', 0xa8261e], 0.0012, 0.022, 0.06, sd * 0.0212, -0.008, -0.04 + 0.0, { bev: 3e-4, wear: 0.1 });
      const star = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.0034 : 0.0082; star.push([-0.055 + Math.cos(a) * r, -0.008 + Math.sin(a) * r]); }
      A(k, sidePlate(star.map(([f, y]) => [f, y]), sd * 0.0218 - 0.0004, sd * 0.0218 + 0.0004, 1e-4, W1, 0), ['paint', 0x161616]);
      const ring = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; ring.push([-0.025 + Math.cos(a) * 0.0075, -0.008 + Math.sin(a) * 0.0075]); }
      const hole = ring.map(([f, y]) => [-0.025 + (f + 0.025) * 0.7, -0.008 + (y + 0.008) * 0.7]).reverse();
      A(k, sidePlate(ring, sd * 0.0218 - 0.0004, sd * 0.0218 + 0.0004, 1e-4, W1, 0, [hole]), ['paint', 0x161616]);
    }
    label(k, 'CHAY', 0.07, 0.004, 0.011, -0.0216, 'red'); label(k, 'CHAY', 0.07, 0.004, 0.011, 0.0216, 'red');
    sock(k, [-0.05, -0.08], [0.24, -0.01], [0.575, 0.0]);
  }),

  // ---------------------------------------------------------------- 54: carbine with a shovel D-handle stock
  weapon('shovel-rifle', 'Shovel-handle rifle', { kind: 'gun', gun: true, hands: 2, blood: 0.05 }, (k) => {
    plate(k, 'ano', [[-0.1, -0.02], [0.1, -0.02], [0.1, 0.027], [0.093, 0.034], [-0.088, 0.034], [-0.1, 0.024]], 0.0205, { holes: [chamferRect(-0.012, -0.01, 0.06, 0.012, 0.003)] });
    hazard(k, -0.08, 0.06, 0.004, 0.03, 0.0209);
    plate(k, ['paint_worn', 0x707a80], [[-0.1, -0.021], [0.099, -0.021], [0.101, -0.03], [0.098, -0.045], [0.04, -0.048], [-0.03, -0.042], [-0.1, -0.042]], 0.019, { wear: 0.4 });   // grey lower
    rail(k, -0.096, 0.1, 0.034);
    for (let i = 0; i < 8; i++) {
      const holes = []; if (i % 2 === 0) for (let j = 0; j < 5; j++) holes.push(gslot(0.135 + j * 0.04, 0, 0.028, 0.0065, 4));
      const g = sidePlate([[0.101, -0.009], [0.31, -0.009], [0.31, 0.009], [0.101, 0.009]], 0.0185, 0.0213, 9e-4, W1, 0.3, holes); g.rotateZ(i * Math.PI / 4); A(k, g, ['paint_worn', 0x5a3222]);
    }
    rail(k, 0.105, 0.31, 0.024, ['paint_worn', 0x5a3222]);
    barrel(k, [[0.0105, 0.1], [0.009, 0.25], [0.0085, 0.36]], {});
    lat(k, 'gun', [[0.004, 0.36], [0.0095, 0.36], [0.0095, 0.39], [0.004, 0.39]], {});
    pistolGrip(k, -0.03, -0.045, 'poly');
    tape(k, -0.11, -0.1, -0.14, 0.02, 0.012, C.blue, { band: 0.011, x: 0 });
    triggerGroup(k, 0.01, -0.045);
    magazine(k, 0.06, -0.05, { len: 0.17, curve: 0.6, m: 'poly' });
    tape(k, -0.02, 0.06, -0.058, 0.021, 0.016, 0xe8d8cc, { band: 0.02, blood: 0.15 });
    // D-handle: two curved wooden cheeks to a crossbar, ferrule onto the buffer tube
    lat(k, 'ano', [[0, -0.1], [0.014, -0.1], [0.0148, -0.105], [0.0148, -0.2], [0, -0.2]], {});
    lat(k, 'gun', [[0, -0.2], [0.017, -0.2], [0.017, -0.24], [0.012, -0.25], [0, -0.25]], { col: MID });
    const yoke = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; yoke.push([Math.sin(a) * 0.012, Math.cos(a)]); }
    for (const s of [-1, 1]) {
      const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([-0.25 - t * 0.14, s * (0.012 + 0.045 * Math.sin(t * Math.PI / 2))]); }
      for (let i = 0; i < 10; i++) { const [f0, y0] = pts[i], [f1, y1] = pts[i + 1], L = Math.hypot(f1 - f0, y1 - y0); const g = glathe([[0, 0], [0.0085, 0], [0.0085, L], [0, L]], 10, W1, 0.3); g.rotateX(Math.atan2(y1 - y0, f1 - f0)); g.translate(0, y0 - 0.01, -f0); A(k, g, 'wood', { grain: 'z' }); }
    }
    lat(k, 'wood', [[0, -0.05], [0.011, -0.05], [0.012, -0.045], [0.012, 0.045], [0, 0.05]].map(([r, f]) => [r, f]), {});
    { const g = glathe([[0, -0.05], [0.011, -0.05], [0.012, -0.045], [0.012, 0.045], [0, 0.05]], 14, W1, 0.3); g.rotateX(Math.PI / 2); g.translate(0, -0.01, 0.39); A(k, g, 'wood'); }
    tape(k, -0.39 - 0.012, -0.39 + 0.012, -0.01, 0.014, 0.05, 0xe8d8cc, { band: 0.024 });
    tape(k, -0.27, -0.25, -0.0, 0.016, 0.016, 0xe8d8cc, { band: 0.012 });
    sock(k, [-0.07, -0.09], [0.22, -0.02], [0.39, 0.0]);
  }),

  // ---------------------------------------------------------------- 55: pump shotgun, skeleton stock
  weapon('shotgun-pump-tape', 'Pump shotgun, taped', { kind: 'gun', gun: true, hands: 2, blood: 0.07 }, (k) => {
    plate(k, 'ano', [[-0.12, -0.035], [0.11, -0.035], [0.115, 0.02], [0.105, 0.03], [-0.1, 0.03], [-0.12, 0.012]], 0.021, { holes: [chamferRect(-0.02, -0.02, 0.06, 0.008, 0.003)] });
    rail(k, -0.08, 0.06, 0.03);
    { const g = glathe([[0, 0], [0.0065, 0], [0.0068, 0.002], [0, 0.0028]], 16, W1, 0.2); g.rotateY(Math.PI / 2); g.translate(-0.0212, 0.005, 0.07); A(k, g, ['paint', 0xd0352a]); }
    A(k, gpin(0.003, 0.046, 0, -0.01, 0.0, BR, 12), 'gun');
    // barrel over a magazine tube, pump with grip grooves
    lat(k, 'gun', [[0, 0.11], [0.0125, 0.11], [0.0125, 0.6], [0.0095, 0.603], [0.0095, 0.6], [0, 0.6]], { y: 0.004, seg: 24 });
    lat(k, 'gun', [[0, 0.11], [0.011, 0.11], [0.011, 0.55], [0.009, 0.555], [0, 0.555]], { y: -0.024, col: MID });
    plate(k, 'poly', [[0.2, -0.04], [0.4, -0.04], [0.405, -0.02], [0.4, 0.0], [0.2, 0.0], [0.195, -0.02]], 0.019, { bev: 0.004, wear: 0.6 });
    for (let i = 0; i < 9; i++) box(k, 'poly', 0.0395, 0.034, 0.004, 0, -0.02, 0.255 + i * 0.012, { wear: 0.6 });
    tape(k, 0.54, 0.585, 0.004, 0.0135, 0.0135, 0xa3261d, { band: 0.012, blood: 0.2 });
    box(k, 'gun', 0.004, 0.008, 0.012, 0, 0.02, 0.595, { col: BR });
    // grip: red-brown painted wood with a knuckle loop, trigger
    plate(k, ['paint_worn', 0x7a2a22], [[-0.07, -0.035], [-0.035, -0.035], [-0.05, -0.12], [-0.06, -0.135], [-0.1, -0.13], [-0.09, -0.06]], 0.016, { bev: 0.005, wear: 0.3 });
    { const pts = []; for (let i = 0; i <= 12; i++) { const a = -0.2 + i / 12 * 2.4; pts.push([0.0 + Math.cos(a) * 0.045, -0.08 - Math.sin(a) * 0.04]); } for (let i = 0; i < 12; i++) { const [f0, y0] = pts[i], [f1, y1] = pts[i + 1], L = Math.hypot(f1 - f0, y1 - y0); const g = glathe([[0, 0], [0.0045, 0], [0.0045, L], [0, L]], 8, W1, 0.3); g.rotateX(Math.atan2(y1 - y0, f1 - f0)); g.translate(0, y0, -f0); A(k, g, ['paint_worn', 0x8a8a8a]); } }
    plate(k, 'gun', [[-0.006, -0.037], [0.004, -0.037], [0.003, -0.049], [0.0065, -0.059], [0.01, -0.066], [0.0065, -0.068], [0.001, -0.061], [-0.004, -0.05]], 0.0032, { bev: 8e-4, col: BR, wear: 0 });
    // skeleton stock: plate with three lightening holes, tape wrap, steel butt plate
    const holes = [0, 1, 2].map((i) => { const c = []; for (let j = 0; j < 14; j++) { const a = -j / 14 * Math.PI * 2; c.push([-0.24 - i * 0.04 + Math.cos(a) * 0.011, -0.03 + Math.sin(a) * 0.011]); } return c; });
    plate(k, ['paint_worn', 0x4a4a52], [[-0.12, 0.01], [-0.12, -0.03], [-0.36, -0.05], [-0.36, -0.01]], 0.006, { bev: 0.0015, wear: 0.4, holes });
    tape(k, -0.18, -0.13, -0.012, 0.01, 0.025, 0xf0ece4, { band: 0.016 });
    plate(k, 'gun', [[-0.372, -0.09], [-0.36, -0.09], [-0.36, 0.03], [-0.372, 0.03]], 0.019, { bev: 0.003, col: [2.6, 2.6, 2.7] });
    box(k, 'rubber', 0.036, 0.11, 0.008, 0, -0.03, -0.378);
    sock(k, [-0.07, -0.08], [0.3, -0.02], [0.603, 0.004]);
  }),

  // ---------------------------------------------------------------- 56: SMG, folding frame stock with spikes
  weapon('smg-fold-stock', 'Compact SMG, folding stock', { kind: 'gun', gun: true, hands: 2, blood: 0.05 }, (k) => {
    plate(k, 'ano', [[-0.13, -0.025], [0.15, -0.025], [0.17, 0.0], [0.168, 0.03], [-0.12, 0.03], [-0.13, 0.02]], 0.022);
    plate(k, 'poly', [[-0.11, -0.025], [0.06, -0.025], [0.06, -0.05], [-0.06, -0.05], [-0.11, -0.04]], 0.02, { wear: 0.6 });
    rail(k, -0.09, 0.16, 0.03);
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) box(k, 'ano', 0.0012, 0.022, 0.0055, s * 0.0222, 0.002, 0.07 + i * 0.011, { col: DK, bev: 3e-4 });   // cooling slots
    for (const s of [-1, 1]) box(k, ['paint', 0x8a2a2c], 0.0012, 0.014, 0.04, s * 0.0222, 0.012, -0.06, { bev: 3e-4 });
    label(k, 'K-7', -0.06, 0.012, 0.009, -0.0232, 'white', { font: 'sans' });
    // three spare rounds clipped on the side (brass cases + copper tips)
    for (let i = 0; i < 3; i++) { const g = glathe([[0, 0], [0.0048, 0], [0.0048, 0.03], [0.0036, 0.034], [0.0034, 0.04], [0.002, 0.046], [0, 0.047]], 12, W1, 0); g.rotateY(-Math.PI / 2); g.translate(-0.026, 0.0 + i * 0.011, 0.07); A(k, g, i === 1 ? 'brass' : 'brass'); }
    box(k, 'ano', 0.006, 0.038, 0.012, -0.0235, 0.011, 0.09);
    barrel(k, [[0.011, 0.16], [0.011, 0.24], [0.0105, 0.245]], { m: 'ano' });
    lat(k, 'ano', [[0.004, 0.24], [0.0135, 0.24], [0.0145, 0.245], [0.0145, 0.29], [0.0125, 0.295], [0.004, 0.295]], {});
    pistolGrip(k, -0.04, -0.03, ['paint_worn', 0x6a2226]);
    triggerGroup(k, 0.0, -0.035);
    magazine(k, 0.05, -0.045, { len: 0.17, curve: 0.0, w: 0.034, t: 0.0105, m: 'poly', ribs: 6 });
    // folding frame stock: a welded rectangular loop, spikes and a chain
    const bar = (f0, y0, f1, y1, r = 0.0055) => { const L = Math.hypot(f1 - f0, y1 - y0); const g = glathe([[0, 0], [r, 0], [r, L], [0, L]], 10, W1, 0.3); g.rotateX(Math.atan2(y1 - y0, f1 - f0)); g.translate(0, y0, -f0); A(k, g, ['paint_worn', 0x3a3c40]); };
    bar(-0.33, 0.02, -0.13, 0.02); bar(-0.33, -0.05, -0.18, -0.06); bar(-0.18, -0.06, -0.13, -0.02); bar(-0.33, -0.055, -0.33, 0.025);
    plate(k, ['paint_worn', 0x3a3c40], [[-0.345, -0.08], [-0.325, -0.08], [-0.325, 0.03], [-0.345, 0.03]], 0.017, { bev: 0.003, wear: 0.4 });
    tape(k, -0.33, -0.29, 0.02, 0.009, 0.009, 0xa3261d, { band: 0.012 });
    for (let i = 0; i < 4; i++) { const g = glathe([[0, 0], [0.0018, 0], [0, 0.022]], 6, W1, 0.4); g.rotateX(Math.PI / 2 + 0.25); g.translate(0, -0.06, 0.2 + i * 0.03); A(k, g, 'steel_rusty'); }
    for (let i = 0; i < 6; i++) { const g = glathe([[0.003, 0], [0.0045, 0], [0.0045, 0.002], [0.003, 0.002]], 10, W1, 0.3); g.rotateZ(i % 2 ? Math.PI / 2 : 0); g.rotateX(0.6); g.translate(0, 0.02 - i * 0.008, 0.14 + i * 0.012); A(k, g, 'steel_rusty'); }
    sock(k, [-0.075, -0.075], [0.06, -0.12], [0.295, 0.0]);
  }),

  // ---------------------------------------------------------------- 57: machine pistol with taped foregrip
  weapon('machine-pistol-a', 'Machine pistol A', { kind: 'gun', gun: true, hands: 1, blood: 0 }, (k) => {
    plate(k, 'ano', [[-0.11, -0.025], [0.1, -0.025], [0.1, 0.024], [0.09, 0.032], [-0.1, 0.032], [-0.11, 0.02]], 0.02, { holes: [chamferRect(-0.03, -0.006, 0.02, 0.008, 0.002)] });
    rail(k, -0.06, 0.06, 0.032);
    frontSight(k, 0.08, 0.032, 'ano', 0.02); rearSight(k, -0.09, 0.032);
    box(k, 'ano', 0.042, 0.03, 0.05, 0, -0.005, 0.12);                                                                              // front block
    lat(k, 'ano', [[0, 0.14], [0.012, 0.14], [0.012, 0.19], [0.009, 0.195], [0, 0.195]], {});
    { const g = gbox(0.006, 0.02, 0.026, 0.002, 0.012, -0.008, 0.185, W1, 0.3, [0, 0, 0]); A(k, g, ['paint', 0xa3261d]); }
    // folded wire stock stub + rubber butt pad at the back
    box(k, 'gun', 0.034, 0.046, 0.022, 0, 0.0, -0.122, { col: MID });
    lat(k, 'rubber', [[0, -0.16], [0.022, -0.16], [0.024, -0.155], [0.024, -0.135], [0, -0.133]], { seg: 22 });
    for (let i = 0; i < 6; i++) lat(k, 'rubber', [[0.0242, -0.158 + i * 0.004], [0.0255, -0.157 + i * 0.004], [0.0242, -0.156 + i * 0.004]], { seg: 22 });
    // grip in the magazine well + magazine base, vertical foregrip wrapped in grey tape
    plate(k, 'poly', [[-0.035, -0.025], [0.005, -0.025], [0.0, -0.12], [-0.035, -0.12]], 0.016, { bev: 0.004, wear: 0.6 });
    box(k, 'poly', 0.036, 0.008, 0.042, 0, -0.124, -0.015);
    triggerGroup(k, 0.04, -0.025);
    { const g = glathe([[0, 0], [0.016, 0], [0.017, 0.005], [0.017, 0.085], [0, 0.088]], 18, W1, 0.5); g.rotateX(-Math.PI / 2); g.translate(0, -0.028, -0.1); A(k, g, 'poly'); }
    for (let i = 0; i < 5; i++) { const g = glathe([[1, -0.007], [1.08, -0.006], [1.08, 0.006], [1, 0.007]], 22, W1, 0); g.scale(0.0175, 0.0175, 1); g.rotateX(Math.PI / 2 + (i % 2 ? 0.08 : -0.08)); g.translate(0, -0.04 - i * 0.0125, -0.1); k.add(g, ['tape', 0x6c6c72], { grime: 0.5, grain: 'z' }); }
    sock(k, [-0.018, -0.07], [0.1, -0.07], [0.195, 0.0]);
  }),

  // ---------------------------------------------------------------- 58: machine pistol, slide + blue tape
  weapon('machine-pistol-b', 'Machine pistol B', { kind: 'gun', gun: true, hands: 1, blood: 0 }, (k) => {
    plate(k, 'gun', [[-0.075, -0.004], [0.12, -0.004], [0.125, 0.012], [0.12, 0.026], [-0.07, 0.026], [-0.077, 0.014]], 0.0145, { col: MID, holes: [chamferRect(0.0, 0.004, 0.035, 0.016, 0.002)] });
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) box(k, 'gun', 0.0012, 0.02, 0.0025, s * 0.0145, 0.012, -0.06 + i * 0.005, { col: DK });  // slide serrations
    rail(k, -0.04, 0.09, 0.026, 'gun', 0.7);
    plate(k, 'poly', [[-0.075, -0.035], [0.12, -0.035], [0.12, -0.004], [-0.075, -0.004]], 0.0135, { wear: 0.6 });
    tape(k, 0.085, 0.1, 0.008, 0.0165, 0.025, C.blue, { band: 0.012 });
    lat(k, 'gun', [[0, 0.12], [0.0075, 0.12], [0.0075, 0.135], [0, 0.135]], { y: 0.012 });
    // grip with a hand-wrapped blue tape sleeve, extended magazine base, trigger guard
    plate(k, 'poly', [[-0.075, -0.035], [-0.035, -0.035], [-0.045, -0.13], [-0.09, -0.135], [-0.09, -0.06]], 0.0155, { bev: 0.005, wear: 0.6 });
    for (let i = 0; i < 7; i++) { const g = glathe([[1, -0.0075], [1.07, -0.0065], [1.07, 0.0065], [1, 0.0075]], 22, W1, 0); g.scale(0.024, 0.0165, 1); g.rotateY(Math.PI / 2); g.rotateX(-1.42 + (i % 2 ? 0.07 : -0.07)); g.rotateZ(Math.PI / 2); g.translate(0, -0.05 - i * 0.011, 0.062 - i * 0.0015); k.add(g, ['tape', C.blue], { grime: 0.4, grain: 'z' }); }
    box(k, 'poly', 0.034, 0.012, 0.05, 0, -0.14, -0.066);
    triggerGroup(k, 0.0, -0.035);
    rearSight(k, -0.065, 0.026, 'gun'); frontSight(k, 0.11, 0.026, 'gun', 0.008);
    sock(k, [-0.06, -0.08], [-0.06, -0.08], [0.135, 0.012]);
  }),
];
