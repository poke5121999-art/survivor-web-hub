// Ornate batch 1 (dtt-restyle): Hỏa Long, Kim Quy, Hồ Ly, Gilgamesh, Lạc Long Quân, Cửu Vĩ Hồ, Kiếm Thần, Bọ Hung.
// Same construction as ornate.js: the chunky plated steel base (OKit) in polished finishes, then one or two big
// motif structures per tank (a dragon wing, a mane, a gate ring, a tail fan, a sword halo, a scarab carapace), each
// with its own form III aura ramp. Forms: I plain plates; II armour and the motif at mid size; III the full motif and
// the aura. Hồ Ly, Kim Quy and Hỏa Long have hand designs and no frame spec: they keep that design's muzzle, ride
// height, legs or hover and part names (STOCK below). Models face +x, +z is the right side, the ground is y = 0.
import * as THREE from '../../vendor/three.module.min.js';
import { LAMP } from './steel.js';
import { OKit, start, finish, fin, put, at, mix, C3, cannon, fireAura, tubeGeo, bladeGeo, WF, GOLD, GOLD_DEEP, CHROME, PEARL, DARKM } from './ornate.js';

const PI = Math.PI, TAU = PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (a, b, c) => [[0, new THREE.Color(...a)], [0.4, new THREE.Color(...b)], [1, new THREE.Color(...c)]];
// One aura ramp per tank of this batch (root, middle, tip), none shared with ornate.js or each other.
const AURA = {
  magma: ramp([0.95, 0.85, 0.25], [0.9, 0.3, 0.0], [0.32, 0.07, 0.0]),
  jade: ramp([0.75, 0.9, 0.6], [0.12, 0.7, 0.35], [0.0, 0.22, 0.12]),
  sakura: ramp([0.9, 0.8, 0.88], [0.85, 0.28, 0.6], [0.3, 0.04, 0.24]),
  gold: ramp([0.9, 0.88, 0.65], [0.85, 0.62, 0.1], [0.35, 0.18, 0.0]),
  tide: ramp([0.65, 0.9, 0.88], [0.04, 0.6, 0.62], [0.0, 0.14, 0.3]),
  foxfire: ramp([0.85, 0.8, 0.95], [0.5, 0.25, 0.9], [0.12, 0.04, 0.4]),
  blade: ramp([0.9, 0.9, 0.88], [0.55, 0.58, 0.62], [0.2, 0.22, 0.26]),
  lapis: ramp([0.85, 0.65, 0.15], [0.1, 0.16, 0.75], [0.04, 0.02, 0.3]),
};
// Sword blade plan: straight edges, then a short point (WF.spear tapers all the way and reads as a spike).
const SWORD_WF = (t) => (t < 0.74 ? 1 - 0.12 * t : (1 - t) / 0.26 * 0.91);

// Stock contract of the three hand designs (mechs.js / mechs-b.js) the ornate forms replace.
const STOCK = {
  hoalong: { muzzle: 3.04, muzzleY: 1.7, S: 1, height: 2.2 },
  kimquy: { muzzle: 1.02, muzzleY: 1.52, S: 1.02, height: 2.2, stride: 1.7 },
  holy: { muzzle: 1.34, muzzleY: 1.08, S: 0.95, height: 1.7, hover: true },
};
function startHand(key, b, form) {
  const f = Math.max(1, Math.min(3, form | 0 || 2));
  b.use('hull');
  return { F: { S: STOCK[key].S }, orn: true, f, stock: STOCK[key], g: { legs: [], parts: [] }, parts: [], top: 1.5 };
}

// ---------- shared pieces of this batch ----------
// Hover pod: an octagonal housing with a gold rim, a lit ring and a downward thruster flame; y = hull underside.
function hoverPod(h, k, b, x, y, z, r, rim = 'gunLite') {
  k.oct(x, y - 0.07, z, r * 1.1, 0.14, 'under', 0.03);
  k.oct(x, y - 0.01, z, r * 1.22, 0.04, rim, 0.012);
  h.lit(b, () => b.push().move(x, y - 0.15, z).cyl(r * 0.8, r * 0.8, 0.02, 10).pop());
  h.flame(b, () => b.push().move(x, y - 0.33, z).cyl(r * 0.85, r * 0.15, 0.3, 8).pop());
}
// Dorsal crest: n back-swept triangular plates along x from x0 to x1, heights from h0 to h1.
function crest(k, x0, x1, y, n, h0, h1, col, t = 0.035, wave = 0) {
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1), x = lerp(x0, x1, f), w = Math.abs(x1 - x0) / n * 1.25, hh = lerp(h0, h1, f) * (1 + wave * Math.sin(f * PI * 3));
    k.profile([[x + w * 0.5, y], [x - w * 0.5, y], [x - w * 0.62, y + hh], [x - w * 0.2, y + hh * 0.7]], -t, t, col, 0.012);
  }
}
// Dragon wing (bat-like, not feathered): an arm spar from the root to a wrist, finger spars fanning from the wrist,
// a membrane panel between each pair with a scalloped trailing edge. Right side for s = 1, mirrored for s = -1.
// span: reach out from the root, len: reach back. mem, spar: Kit colour names.
function dragonWing(k, b, s, o) {
  const { x0, z0, y, span, len, tilt = 0.3, n = 3, mem, spar, claw } = o;
  b.push().move(x0, y, s * z0).rotX(-s * tilt);
  const Z = (p) => [p[0], s * p[1]];
  const R = [0, 0], W = [-len * 0.12, span * 0.58], P = [-len * 0.78, 0.04];
  const T = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1), a = lerp(-0.2, 1.15, t), L = lerp(span * 0.48, len * 0.78, t); T.push([W[0] - Math.sin(a) * L, W[1] + Math.cos(a) * L * 0.9]); }
  const scal = (a, c) => { const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]; return [lerp(m[0], W[0], 0.3), lerp(m[1], W[1], 0.3)]; };
  const panels = [[R, W, T[0]]];
  for (let i = 0; i < n - 1; i++) panels.push([W, T[i], scal(T[i], T[i + 1]), T[i + 1]]);
  panels.push([W, T[n - 1], scal(T[n - 1], P), P, R]);
  panels.forEach((pp, i) => k.prism(pp.map(Z), -0.03 + i * 0.004, 0.012 + i * 0.004, i % 2 ? mem + 'B' : mem, 0.01));
  k.beam([R[0], 0.03, s * R[1]], [W[0], 0.05, s * W[1]], 0.1, 0.08, spar, 0.02);
  for (const t of T) k.beam([W[0], 0.04, s * W[1]], [t[0], 0.03, s * t[1]], 0.05, 0.05, spar, 0.012);
  k.oct(W[0], 0.06, s * W[1], 0.07, 0.09, spar, 0.02);
  if (claw) { k.use(claw); b.push().move(W[0] + 0.06, 0.08, s * W[1]).rotZ(-PI / 2).cyl(0, 0.04, 0.16, 4).pop(); }
  b.pop();
}
// Sword along +x from the origin: pommel, grip, cross-guard, a forged blade. Blade face up (thickness along y).
function sword(b, len, o = {}) {
  const gold = o.gold ?? GOLD, w = o.w ?? 0.13;
  fin(b, 'gold', gold); b.push().move(0, 0, 0).ball(w * 0.32, 1).pop();
  fin(b, 'dark', o.grip ?? DARKM); b.push().move(len * 0.09, 0, 0).rotZ(-PI / 2).cyl(w * 0.2, w * 0.2, len * 0.16, 6).pop();
  fin(b, 'gold', gold); b.push().move(len * 0.18, 0, 0).chamfer(w * 0.35, w * 0.3, w * 2.3, 0.015).pop();
  put(fin(b, 'chrome'), bladeGeo({ len: len * 0.8, w, th: w * 0.28, wf: SWORD_WF, ridge: 0, seg: 6, edge: CHROME, face: o.face ?? CHROME, face2: o.face2 ?? 0xaeb8c8, back: 0xaeb8c8 }).translate(len * 0.2, 0, 0));
}
// Fox tail: a faceted tube along a curve, fat in the middle, the tip in another colour.
function foxTail(b, pts, R, body, tip, tipAt = 0.72) {
  const P = new THREE.CatmullRomCurve3(pts).getPoints(14);
  put(fin(b, 'pearl'), tubeGeo(P, (t) => R * Math.pow(Math.sin(PI * (0.12 + 0.82 * t)), 0.7) + 0.015, { sides: 7, caps: true, tone: (t) => (t > tipAt ? C3(tip) : t > tipAt - 0.08 ? mix(body, tip, 0.5) : C3(body)) }));
}
// Pointed ear: a four-sided pyramid, flattened, with an inner plate in another colour.
function ear(b, s, p, hgt, r, out, outer, inner) {
  at(b, s, p, [out, 0, 0.18], () => {
    fin(b, 'enamel', outer); b.push().move(0, hgt / 2, 0).scale(1, 1, 0.55).rotY(PI / 4).cyl(0, r, hgt, 4).pop();
    fin(b, 'pearl', inner); b.push().move(0.06, hgt * 0.42, 0).scale(0.6, 0.8, 0.4).rotY(PI / 4).cyl(0, r, hgt, 4).pop();
  });
}

export const B1 = {
  // Hỏa Long, lancer: a long, low red fire drake on two track pods. The turret is the dragon's rearing head on a
  // plated neck, the lance runs out of its jaws, swept-back gold horns; a spine crest runs down the deck and bat-like
  // dragon wings (gold finger spars, red membrane) open from the shoulders. I: plain plates, horn stubs. II: crest,
  // half-open wings, skirts. III: full wings, long horns, magma aura.
  hoalong(h, b, st, paint, trim, deep, form) {
    const K = startHand('hoalong', b, form), { f } = K, red = C3(paint), gold = f === 1 ? mix(trim, 0x8a8070, 0.4) : C3(GOLD), dred = C3(deep);
    const k = new OKit(b, st, trim, form, { red: [red, 'enamel'], memb: [mix(red, 0xff6a20, 0.4), 'enamel'], membB: [mix(red, dred, 0.35), 'enamel'], gold: [gold, 'gold'], gun: [red, 'enamel'], gunLite: [gold, 'gold'], panel: [gold, 'gold'], under: [0x241414, 'dark'], steel: [GOLD_DEEP, 'gold'], chrome: [CHROME, 'chrome'], dark: [0x1a1012, 'dark'] });
    b.use('hull');
    for (const s of [-1, 1]) k.trackPod(-0.05, s * 0.74, 3.3, 0.44, 0.6, { coverCol: 'red', insert: 'gold', skirt: f >= 2, skirtH: 0.34, light: LAMP.amber });
    k.prism([[1.8, 0.3], [1.95, 0.12], [1.95, -0.12], [1.8, -0.3], [-1.6, -0.5], [-1.76, -0.34], [-1.76, 0.34], [-1.6, 0.5]], 0.28, 0.78, 'under', 0.05);
    k.plate(-0.45, 0.84, 0, 2.2, 0.12, 0.84, { col: 'red', insert: 'gold' });
    k.plate(1.25, 0.76, 0, 0.95, 0.1, 0.62, { col: 'red', insert: null, rz: -0.3 });
    k.blk(1.82, 0.62, 0, 0.12, 0.16, 0.5, 'gold', 0.03);
    for (const s of [-1, 1]) {
      k.light(1.96, 0.5, s * 0.16, 0.05, LAMP.amber, '+x');
      k.blk(-1.72, 0.66, s * 0.24, 0.2, 0.18, 0.2, 'chrome', 0.04);
      h.flame(b, () => b.push().move(-1.92, 0.66, s * 0.24).rotZ(PI / 2).cyl(0.08, 0.02, 0.3, 8).pop());
    }
    if (f >= 2) crest(k, -0.55, -1.6, 0.9, f === 2 ? 4 : 6, 0.32, 0.14, 'gold');
    if (f >= 2) {
      const W = f === 2 ? { span: 0.95, len: 1.1, n: 3, tilt: 0.4 } : { span: 1.3, len: 1.35, n: 4, tilt: 0.3 };
      for (const s of [-1, 1]) dragonWing(k, b, s, { x0: -0.15, z0: 0.5, y: 1.0, ...W, mem: 'memb', spar: 'gold', claw: 'chrome' });
    }
    if (f === 3) fireAura(b, -0.15, 2.0, 1.5, 18, 1.1, AURA.magma);
    // Turret: plated neck rising into the dragon head; the lance comes out between the jaws.
    b.use('turret');
    k.oct(0.0, 0.94, 0, 0.56, 0.1, 'under');
    k.oct(-0.02, 1.08, 0, 0.48, 0.2, 'red', 0.05, 1.15);
    k.plate(0.05, 1.32, 0, 0.56, 0.36, 0.5, { col: 'red', insert: null, rz: -0.25 });
    k.oct(0.08, 1.5, 0, 0.3, 0.06, 'gold', 0.02);
    k.prism([[0.98, 0.12], [1.04, 0], [0.98, -0.12], [0.2, -0.3], [-0.05, -0.24], [-0.05, 0.24], [0.2, 0.3]], 1.5, 1.62, 'red', 0.03);
    k.prism([[1.08, 0.1], [1.14, 0], [1.08, -0.1], [0.3, -0.3], [0.1, -0.32], [0.1, 0.32], [0.3, 0.3]], 1.78, 1.92, 'red', 0.03);
    k.prism([[0.42, 0.3], [0.1, 0.38], [-0.32, 0.3], [-0.44, 0], [-0.32, -0.3], [0.1, -0.38], [0.42, -0.3]], 1.55, 2.04, 'red', 0.05);
    k.blk(0.95, 1.94, 0, 0.22, 0.05, 0.16, 'gold', 0.015);
    fin(b, 'chrome', CHROME);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      b.push().move(0.85 - i * 0.18, 1.63, s * (0.1 + i * 0.05)).cyl(0.035, 0, 0.09, 4).pop();
      b.push().move(0.9 - i * 0.18, 1.77, s * (0.09 + i * 0.05)).rotZ(PI).cyl(0.035, 0, 0.09, 4).pop();
    }
    for (const s of [-1, 1]) {
      k.plate(0.28, 2.04, s * 0.2, 0.36, 0.06, 0.16, { col: 'gold', insert: null, ry: s * 0.35, rz: -0.25 });
      k.light(0.43, 1.95, s * 0.2, 0.04, LAMP.amber, '+x');
      const hl = [0.35, 0.7, 1.0][f - 1];
      const P = [V(-0.2, 1.98, s * 0.22), V(-0.2 - hl * 0.45, 2.04 + hl * 0.22, s * (0.26 + hl * 0.08)), V(-0.2 - hl * 0.85, 2.02 + hl * 0.3, s * (0.3 + hl * 0.12)), V(-0.2 - hl, 1.96 + hl * 0.42, s * (0.3 + hl * 0.1))];
      put(fin(b, 'gold'), tubeGeo(new THREE.CatmullRomCurve3(P).getPoints(10), (t) => 0.085 * (1 - 0.85 * t) + 0.008, { sides: 7, caps: true, tone: (t) => (t > 0.7 ? mix(GOLD, 0xfff0c0, 0.4) : C3(gold)) }));
      if (f >= 2) k.plate(-0.3, 1.72, s * 0.36, 0.42, 0.3, 0.06, { col: 'gold', insert: null, ry: s * -0.35, rx: s * 0.25 });
    }
    b.use('barrel');
    K.my = 1.7;
    cannon(b, 0.55, 1.7, 0, K.stock.muzzle - 0.55, 0.075, CHROME, gold);
    b.use('hull');
    K.parts.push(...k.parts); K.top = f === 3 ? 2.5 : 2.2;
    return finish(K, { recoil: 0.35 });
  },

  // Kim Quy, guardian: a golden turtle fortress on four stubby armoured legs. The carapace is stepped plates, not a
  // dome: a ring of marginal scutes, six tilted costal scutes with jade insets, a raised hexagonal crown scute, then a
  // jade hex cupola with three short barrels. Angular turtle head forward. I: plain scutes. II: spiked marginals,
  // jade brow shields, gold claws. III: the jade-hilted sword laid along the back, taller cupola, jade aura.
  kimquy(h, b, st, paint, trim, deep, form) {
    const K = startHand('kimquy', b, form), { f } = K, gold = f === 1 ? mix(paint, 0x9a9080, 0.35) : mix(paint, GOLD, 0.5), jade = C3(trim);
    const k = new OKit(b, st, trim, form, { gold: [gold, 'gold'], goldB: [mix(gold, GOLD_DEEP, 0.4), 'gold'], jade: [jade, 'enamel'], jadeL: [mix(jade, 0xc8fff0, 0.3), 'enamel'], gun: [gold, 'gold'], gunLite: [GOLD_DEEP, 'gold'], panel: [jade, 'enamel'], under: [0x1e2422, 'dark'], steel: [GOLD_DEEP, 'gold'], chrome: [CHROME, 'chrome'], dark: [0x141816, 'dark'] });
    // Legs: the hand design's four sweeping legs (same anchors, yaw and phases), plated.
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + i * PI / 2, sz = Math.sin(a) > 0 ? 1 : -1;
      b.use('leg' + i);
      k.blk(0.08, 0, 0, 0.3, 0.3, 0.34, 'under', 0.05);
      k.beam([0.05, -0.02, 0], [0.48, -0.12, 0], 0.36, 0.28, 'gold', 0.05);
      k.blk(0.42, 0.02, 0, 0.3, 0.06, 0.3, 'jade', 0.02);
      k.beam([0.48, -0.12, 0], [0.7, -0.46, 0], 0.28, 0.26, 'under', 0.04);
      k.oct(0.76, -0.52, 0, 0.24, 0.1, 'goldB', 0.03);
      if (f >= 2) { k.use('chrome'); for (const dz of [-0.13, 0, 0.13]) b.push().move(0.98, -0.53, dz).rotZ(-1.3).cyl(0, 0.05, 0.16, 4).pop(); }
      legs.push({ p: [Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8], yaw: -a, ph: (i % 2) * PI, kind: 'sweep', amp: 0.22 * sz, lift: 0.2 });
    }
    K.g.legs = legs;
    b.use('hull');
    const ngon = (r, n, ph = 0) => { const o = []; for (let i = 0; i < n; i++) { const a = ph + i / n * TAU; o.push([Math.cos(a) * r, Math.sin(a) * r]); } return o; };
    k.prism(ngon(1.1, 12, PI / 12), 0.45, 0.72, 'under', 0.05);
    for (let j = 0; j < 10; j++) {
      const a = (j + 0.5) / 10 * TAU;
      b.push().rotY(a);
      k.plate(0.98, 0.78, 0, 0.42, 0.1, 0.64, { col: j % 2 ? 'gold' : 'goldB', insert: null, rz: -0.42 });
      if (f >= 2) { k.use('chrome'); b.push().move(1.2, 0.68, 0).rotZ(-PI / 2 - 0.3).cyl(0, 0.06, 0.2, 4).pop(); }
      b.pop();
    }
    k.prism(ngon(0.88, 6, PI / 6), 0.78, 1.02, 'gold', 0.05);
    for (let j = 0; j < 6; j++) { b.push().rotY(j / 6 * TAU + PI / 6); k.plate(0.6, 1.05, 0, 0.42, 0.08, 0.5, { col: 'gold', insert: 'jade', rz: -0.32 }); b.pop(); }
    k.prism(ngon(0.44, 6, PI / 6), 1.04, 1.22, 'goldB', 0.04);
    // Head: neck block, angular head, jade crown plate, beak, lamp eyes.
    k.blk(1.12, 0.66, 0, 0.36, 0.26, 0.4, 'under', 0.05);
    k.prism([[1.78, 0], [1.68, 0.2], [1.32, 0.28], [1.12, 0.22], [1.12, -0.22], [1.32, -0.28], [1.68, -0.2]], 0.55, 0.88, 'gold', 0.05);
    k.prism([[1.62, 0], [1.52, 0.14], [1.25, 0.2], [1.2, 0], [1.25, -0.2], [1.52, -0.14]], 0.88, 0.95, 'jade', 0.02);
    k.blk(1.76, 0.6, 0, 0.12, 0.08, 0.26, 'goldB', 0.02);
    for (const s of [-1, 1]) {
      k.light(1.52, 0.8, s * 0.245, 0.04, st.glow, s > 0 ? '+z' : '-z');
      if (f >= 2) k.plate(1.36, 0.92, s * 0.2, 0.3, 0.05, 0.16, { col: 'jadeL', insert: null, ry: s * 0.3, rx: s * 0.4 });
    }
    k.prism([[-1.08, 0.14], [-1.38, 0], [-1.08, -0.14]], 0.52, 0.66, 'gold', 0.02);
    for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; k.light(Math.cos(a) * 1.13, 0.6, Math.sin(a) * 1.13, 0.035, st.glow, '+y'); }
    if (f === 3) {
      // The sword of the lake legend laid along the left side of the back, hilt aft.
      b.push().move(-0.95, 1.36, 0.46).rotY(0.1).rotX(-0.3);
      sword(b, 1.75, { w: 0.18, face: mix(trim, 0xffffff, 0.35), face2: trim, grip: 0x1a3a30 });
      b.pop();
      fireAura(b, 0, 1.55, 1.55, 18, 1.0, AURA.jade);
    }
    // Cupola and triple guns.
    b.use('turret');
    k.prism(ngon(0.4, 6, PI / 6), 1.22, f === 3 ? 1.66 : 1.6, 'jade', 0.05);
    k.prism(ngon(0.3, 6, PI / 6), f === 3 ? 1.66 : 1.6, f === 3 ? 1.74 : 1.66, 'gold', 0.02);
    if (f === 3) k.oct(0, 1.8, 0, 0.12, 0.1, 'goldB', 0.03);
    k.blk(0.38, 1.52, 0, 0.22, 0.24, 0.48, 'gold', 0.05);
    b.use('barrel');
    K.my = 1.52;
    for (const z of [-0.13, 0, 0.13]) cannon(b, 0.45, 1.52, z, K.stock.muzzle - 0.45, 0.05, CHROME, GOLD);
    b.use('hull');
    K.parts.push(...k.parts); K.top = f === 3 ? 2.0 : 1.8;
    return finish(K, { recoil: 0.2 });
  },

  // Hồ Ly, trickster: a sleek pink fox skiff on three hover pods. The turret is a fox head (white snout over twin
  // guns, tall pointed ears), one big faceted fox tail curls up and out to the right (asymmetric from above), and a
  // spirit orb in a gold ring floats over the back and spins ('dish', as on the hand design). I: short tail, no orb
  // ring. II: full tail, gold ear rims, cheek plates. III: longer tail, gold circlet, sakura aura.
  holy(h, b, st, paint, trim, deep, form) {
    const K = startHand('holy', b, form), { f } = K, pink = f === 1 ? mix(paint, 0x9a8a90, 0.35) : C3(paint), white = C3(PEARL), dpink = C3(deep);
    const k = new OKit(b, st, trim, form, { pink: [pink, 'enamel'], white: [white, 'pearl'], gold: [GOLD, 'gold'], gun: [pink, 'enamel'], gunLite: [GOLD, 'gold'], panel: [white, 'pearl'], under: [mix(dpink, pink, 0.25), 'enamel'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x1a1218, 'dark'] });
    b.use('hull');
    for (const [x, z] of [[0.7, 0.28], [0.7, -0.28], [-0.4, 0]]) hoverPod(h, k, b, x, 0.5, z, 0.2, f === 1 ? 'under' : 'gold');
    k.prism([[1.3, 0], [0.9, 0.3], [0.2, 0.46], [-0.7, 0.4], [-1.04, 0.2], [-1.04, -0.2], [-0.7, -0.4], [0.2, -0.46], [0.9, -0.3]], 0.5, 0.78, 'under', 0.05);
    k.prism([[1.12, 0], [0.8, 0.24], [0.15, 0.38], [-0.6, 0.32], [-0.9, 0.15], [-0.9, -0.15], [-0.6, -0.32], [0.15, -0.38], [0.8, -0.24]], 0.78, 0.92, 'pink', 0.04);
    k.plate(-0.3, 0.94, 0, 0.8, 0.05, 0.36, { col: 'white', insert: null });
    for (const s of [-1, 1]) {
      k.plate(0.05, 0.68, s * 0.44, 1.2, 0.18, 0.08, { col: 'white', insert: null, ry: s * 0.12 });
      k.blk(-0.98, 0.7, s * 0.2, 0.18, 0.16, 0.18, 'chrome', 0.04);
      h.flame(b, () => b.push().move(-1.18, 0.7, s * 0.2).rotZ(PI / 2).cyl(0.08, 0.02, 0.28, 8).pop());
      if (f >= 2) k.plate(0.75, 0.74, s * 0.36, 0.5, 0.06, 0.14, { col: 'gold', insert: null, ry: s * -0.35 });
    }
    // Tail: rises from the rump, sweeps up and out to the right, tip curling back in.
    const tl = [0.6, 0.85, 1.0][f - 1], tr = [0.15, 0.21, 0.25][f - 1];
    foxTail(b, [V(-0.8, 0.88, 0.05), V(-0.8 - 0.45 * tl, 1.0 + 0.1 * tl, 0.2 * tl), V(-0.8 - 0.75 * tl, 1.0 + 0.5 * tl, 0.48 * tl), V(-0.8 - 0.62 * tl, 1.0 + 0.95 * tl, 0.6 * tl), V(-0.8 - 0.35 * tl, 1.0 + 1.1 * tl, 0.42 * tl)], tr, pink, white, 0.8);
    if (f >= 2) k.oct(-0.8, 0.9, 0.05, 0.16, 0.08, 'gold', 0.02);
    if (f === 3) fireAura(b, -0.1, 1.5, 1.2, 14, 0.95, AURA.sakura);
    fin(b, 'gold', GOLD); b.push().move(-0.3, 1.1, 0).cyl(0.05, 0.08, 0.36, 8).pop();
    // Fox head turret.
    b.use('turret');
    k.oct(0.32, 0.96, 0, 0.26, 0.08, 'under');
    k.prism([[0.72, 0], [0.55, 0.2], [0.1, 0.27], [-0.06, 0.18], [-0.06, -0.18], [0.1, -0.27], [0.55, -0.2]], 1.0, 1.25, 'pink', 0.05);
    k.prism([[0.98, 0], [0.78, 0.1], [0.5, 0.15], [0.5, -0.15], [0.78, -0.1]], 1.12, 1.22, 'white', 0.03);
    k.blk(0.97, 1.18, 0, 0.06, 0.05, 0.08, 'dark', 0.015);
    for (const s of [-1, 1]) {
      k.light(0.6, 1.2, s * 0.14, 0.03, LAMP.amber, '+x');
      ear(b, s, [0.1, 1.22, 0.16], [0.32, 0.46, 0.54][f - 1], 0.17, 0.28, pink, f === 1 ? white : mix(white, 0xffc0dc, 0.3));
      if (f >= 2) { fin(b, 'gold', GOLD); b.push().move(0.1, 1.23, s * 0.16).cyl(0.11, 0.11, 0.03, 8).pop(); }
    }
    if (f === 3) { fin(b, 'gold', GOLD); b.push().move(0.38, 1.26, 0).scale(1, 0.4, 1).geo(new THREE.TorusGeometry(0.22, 0.03, 5, 18).rotateX(PI / 2)).pop(); k.light(0.52, 1.27, 0, 0.03, LAMP.red, '+y'); }
    b.use('barrel');
    K.my = 1.08;
    for (const z of [-0.09, 0.09]) cannon(b, 0.55, 1.08, z, K.stock.muzzle - 0.55, 0.04, CHROME, f === 1 ? CHROME : GOLD);
    // Spirit orb: pearl in a tilted gold ring with three beads, spinning over the back.
    b.use('dish');
    fin(b, 'pearl', mix(PEARL, paint, 0.25)); b.push().move(-0.3, 1.46, 0).ball(f === 1 ? 0.1 : 0.13, 2).pop();
    h.lit(b, () => b.push().move(-0.3, 1.46, 0).ball(f === 1 ? 0.06 : 0.08, 1).pop());
    if (f >= 2) {
      const R = f === 3 ? 0.36 : 0.3;
      fin(b, 'gold', GOLD); b.push().move(-0.3, 1.46, 0).rotZ(0.35).geo(new THREE.TorusGeometry(R, 0.022, 5, 24).rotateX(PI / 2)).pop();
      for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; b.push().move(-0.3, 1.46, 0).rotZ(0.35).move(Math.cos(a) * R, 0, Math.sin(a) * R).ball(0.045, 1).pop(); }
    }
    b.use('hull');
    K.parts.push(...k.parts, { name: 'dish', on: 'turret', kind: 'spin', axis: 'y', by: 'time', rate: 2.4, p: [-0.3, 1.14, 0], model: true });
    K.top = f === 3 ? 2.2 : 1.8;
    return finish(K, { recoil: 0.2 });
  },

  // Gilgamesh, tank: a wide golden throne-block on four hover pods. Gold plates with red enamel inserts, a square
  // gold helm with a crenellated crown, a lion mane of heavy gold plates round the turret, hoop earrings, and an
  // upright gold gate ring behind the helm with lit ripples. Quad cannon. I: plain helm, short collar. II: mane, crown,
  // earrings, gate ring. III: bigger gate with four small portals, longer mane, gold aura.
  gilgamesh(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, gold = f === 1 ? mix(paint, 0x9a9080, 0.35) : mix(paint, GOLD, 0.4), red = C3(trim);
    const k = new OKit(b, st, trim, form, { gold: [gold, 'gold'], goldB: [mix(gold, GOLD_DEEP, 0.45), 'gold'], red: [red, 'enamel'], gun: [gold, 'gold'], gunLite: [GOLD_DEEP, 'gold'], panel: [red, 'enamel'], under: [0x2a2214, 'dark'], steel: [GOLD_DEEP, 'gold'], chrome: [CHROME, 'chrome'], dark: [0x18140c, 'dark'] });
    b.use('hull');
    k.prism([[1.0, 0.8], [1.08, 0.6], [1.08, -0.6], [1.0, -0.8], [-0.9, -0.92], [-1.02, -0.78], [-1.02, 0.78], [-0.9, 0.92]], 0.55, 0.86, 'under', 0.05);
    k.plate(-0.05, 0.94, 0, 1.75, 0.16, 1.62, { col: 'gold', insert: 'red' });
    k.plate(0.98, 0.84, 0, 0.36, 0.1, 1.3, { col: 'gold', insert: null, rz: -0.55 });
    k.blk(-1.0, 0.9, 0, 0.1, 0.2, 1.2, 'goldB', 0.03);
    for (const s of [-1, 1]) {
      for (const x of [0.86, -0.86]) k.oct(x, 1.06, s * 0.78, 0.13, 0.08, 'goldB', 0.02);
      k.light(1.1, 0.74, s * 0.45, 0.05, LAMP.amber, '+x');
      if (f >= 2) k.plate(0, 0.74, s * 0.95, 1.6, 0.32, 0.08, { col: 'red', insert: null, rx: s * 0.12 });
    }
    if (orn && f === 3) fireAura(b, 0, 1.6, 1.6, 18, 1.0, AURA.gold);
    b.use('turret');
    k.oct(-0.05, 1.1, 0, 0.62, 0.1, 'under');
    k.plate(-0.05, 1.3, 0, 0.86, 0.32, 0.78, { col: 'gold', insert: 'red' });
    k.plate(0.42, 1.28, 0, 0.18, 0.26, 0.6, { col: 'goldB', insert: null, rz: -0.3 });
    for (const s of [-1, 1]) k.light(0.5, 1.36, s * 0.16, 0.04, LAMP.red, '+x');
    // Crown: a gold band on the helm, crenellated with jewel lamps from II.
    k.oct(-0.08, 1.52, 0, 0.36, 0.1, 'gold', 0.03);
    if (orn && f >= 2) for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU, x = -0.08 + Math.cos(a) * 0.33, z = Math.sin(a) * 0.33;
      k.blk(x, 1.62, z, 0.1, 0.14, 0.1, 'gold', 0.02);
      k.lamp(LAMP.red, () => b.push().move(x + Math.cos(a) * 0.05, 1.58, z + Math.sin(a) * 0.05).box(0.04, 0.04, 0.04).pop());
    }
    if (orn) {
      // Lion mane: two layers of heavy gold plates radiating from the helm base, drooping outward.
      const ml = [0.3, 0.5, 0.68][f - 1], n = [10, 12, 14][f - 1];
      for (let l = 0; l < (f === 1 ? 1 : 2); l++) for (let i = 0; i < n; i++) {
        const a = (i + l * 0.5) / n * TAU;
        if (Math.cos(a) > 0.82) continue; // keep the face clear
        const g = bladeGeo({ len: ml * (l ? 0.78 : 1), w: 0.26, th: 0.07, wf: WF.petal, seg: 5, lift: -0.15, edge: GOLD, face: l ? mix(GOLD, 0xc87a1a, 0.45) : gold, face2: mix(gold, GOLD_DEEP, 0.4), back: GOLD_DEEP });
        b.push().move(-0.05, 1.22 + l * 0.08, 0).rotY(-a).move(0.4, 0, 0).rotZ(-0.32 + l * 0.12); put(fin(b, 'gold'), g); b.pop();
      }
      if (f >= 2) for (const s of [-1, 1]) { fin(b, 'gold', GOLD); b.push().move(-0.02, 1.16, s * 0.44).rotZ(0.1).geo(new THREE.TorusGeometry(0.1, 0.022, 5, 14)).pop(); }
    }
    if (orn && f >= 2) {
      // Gate ring behind the helm, facing forward: gold ring, red enamel inner band, lit ripples, struts.
      const R = f === 2 ? 0.55 : 0.75, gx = -0.62, gy = 1.45 + R * 0.75;
      fin(b, 'gold', GOLD); b.push().move(gx, gy, 0).geo(new THREE.TorusGeometry(R, 0.07, 6, 28).rotateY(PI / 2)).pop();
      fin(b, 'enamel', red); b.push().move(gx + 0.01, gy, 0).geo(new THREE.TorusGeometry(R - 0.1, 0.035, 5, 28).rotateY(PI / 2)).pop();
      h.lit(b, () => { for (const r of [R * 0.62, R * 0.32]) b.push().move(gx + 0.02, gy, 0).geo(new THREE.TorusGeometry(r, 0.018, 4, 24).rotateY(PI / 2)).pop(); b.push().move(gx + 0.02, gy, 0).ball(0.06, 1).pop(); });
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; k.blk(gx, gy + Math.cos(a) * R, Math.sin(a) * R, 0.1, 0.1, 0.1, 'goldB', 0.02); }
      for (const s of [-1, 1]) k.beam([-0.3, 1.4, s * 0.22], [gx, gy - R * 0.7, s * R * 0.62], 0.08, 0.08, 'goldB', 0.02);
      if (f === 3) for (let i = 0; i < 4; i++) {
        const a = PI / 4 + i * PI / 2, py = gy + Math.cos(a) * (R + 0.32), pz = Math.sin(a) * (R + 0.32);
        fin(b, 'gold', GOLD); b.push().move(gx + 0.05, py, pz).geo(new THREE.TorusGeometry(0.14, 0.03, 5, 16).rotateY(PI / 2)).pop();
        h.lit(b, () => b.push().move(gx + 0.06, py, pz).rotZ(PI / 2).cyl(0.1, 0.1, 0.01, 12).pop());
        put(fin(b, 'chrome'), bladeGeo({ len: 0.32, w: 0.1, th: 0.03, wf: WF.spear, ridge: 0, seg: 4, edge: GOLD, face: CHROME, back: 0xb8c0cc }).translate(gx + 0.08, py, pz));
      }
    }
    b.use('barrel');
    K.my = 1.4;
    k.blk(0.45, 1.4, 0, 0.26, 0.36, 0.5, 'goldB', 0.05);
    for (const y of [-0.09, 0.09]) for (const z of [-0.12, 0.12]) cannon(b, 0.55, 1.4 + y, z, K.stock.muzzle - 0.55, 0.05, f === 1 ? CHROME : GOLD, f === 1 ? GOLD_DEEP : red);
    b.use('hull');
    K.parts.push(...k.parts); K.top = orn && f >= 2 ? 1.45 + (f === 2 ? 0.55 : 0.75) * 1.75 + 0.1 : 1.7;
    return finish(K, { recoil: 0.22 });
  },

  // Lạc Long Quân, tank: a long sea dragon on low track pods. The hull runs in three stepped teal segments with gold
  // collars, a low dragon head at the nose (whiskers sweeping back, gold brow crest, cyan eyes), a wavy gold crest
  // down the spine, breaking-wave fins over the skirts, and an octagonal turret carrying the glowing pearl in a gold
  // claw, long gun over the head. I: plain segments, small pearl. II: crest, whiskers, one wave each side. III: two
  // waves each side, big pearl with a gold halo, tide aura.
  laclong(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K, teal = f === 1 ? mix(paint, 0x8a9099, 0.35) : C3(paint), gold = C3(trim), dteal = C3(deep);
    const k = new OKit(b, st, trim, form, { teal: [teal, 'enamel'], tealD: [mix(teal, dteal, 0.45), 'enamel'], foam: [mix(PEARL, 0xbff6ff, 0.4), 'pearl'], gold: [gold, 'gold'], gun: [teal, 'enamel'], gunLite: [gold, 'gold'], panel: [mix(teal, 0x8ff0ff, 0.25), 'enamel'], under: [mix(dteal, 0x101418, 0.5), 'dark'], steel: [GOLD_DEEP, 'gold'], chrome: [CHROME, 'chrome'], dark: [0x0e1418, 'dark'] });
    b.use('hull');
    for (const s of [-1, 1]) k.trackPod(-0.1, s * 0.62, 3.0, 0.3, 0.55, { coverCol: 'tealD', insert: null, skirt: f >= 2, skirtH: 0.3, light: LAMP.blue });
    // Three segments, each a little narrower and lower toward the tail, gold collars at the joints.
    const SEG = [[0.35, 1.3, 0.5, 0.74], [-0.62, 0.3, 0.45, 0.7], [-1.58, -0.66, 0.38, 0.64]];
    SEG.forEach(([x0, x1, w, top], i) => {
      k.prism([[x1, w * 0.7], [x1 + 0.08, w * 0.4], [x1 + 0.08, -w * 0.4], [x1, -w * 0.7], [x0, -w], [x0 - 0.06, -w * 0.7], [x0 - 0.06, w * 0.7], [x0, w]], 0.25, top, 'under', 0.04);
      k.plate((x0 + x1) / 2, top + 0.04, 0, x1 - x0 - 0.1, 0.1, w * 1.6, { col: 'teal', insert: i === 1 ? 'tealD' : 'panel' });
      if (i) k.blk(x1 + 0.03, top, 0, 0.1, 0.16, w * 1.5, 'gold', 0.03);
    });
    // Dragon head at the nose: lower jaw, upper snout, brow, eyes.
    k.prism([[1.95, 0.1], [1.98, 0], [1.95, -0.1], [1.4, -0.36], [1.25, -0.3], [1.25, 0.3], [1.4, 0.36]], 0.3, 0.48, 'tealD', 0.03);
    k.prism([[2.02, 0.14], [2.08, 0], [2.02, -0.14], [1.5, -0.38], [1.25, -0.36], [1.25, 0.36], [1.5, 0.38]], 0.58, 0.84, 'teal', 0.05);
    k.prism([[1.75, 0.12], [1.8, 0], [1.75, -0.12], [1.4, -0.26], [1.3, 0], [1.4, 0.26]], 0.84, 0.92, 'gold', 0.02);
    k.blk(2.0, 0.86, 0, 0.14, 0.07, 0.24, 'gold', 0.02);
    fin(b, 'chrome', CHROME); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.push().move(1.85 - i * 0.14, 0.5, s * (0.14 + i * 0.05)).cyl(0.03, 0, 0.08, 4).pop();
    for (const s of [-1, 1]) {
      k.plate(1.55, 0.82, s * 0.2, 0.36, 0.06, 0.16, { col: 'gold', insert: null, ry: s * 0.35, rz: -0.2 });
      k.light(1.62, 0.7, s * 0.31, 0.04, st.glow, s > 0 ? '+z' : '-z');
    }
    if (orn && f >= 2) {
      for (const s of [-1, 1]) {
        const wl = f === 2 ? 0.75 : 1.0;
        const P = [V(1.9, 0.62, s * 0.2), V(1.75, 0.68, s * (0.2 + 0.3 * wl)), V(1.75 - 0.5 * wl, 0.8, s * (0.25 + 0.5 * wl)), V(1.75 - 0.95 * wl, 0.95, s * (0.2 + 0.42 * wl))];
        put(fin(b, 'gold'), tubeGeo(new THREE.CatmullRomCurve3(P).getPoints(12), (t) => 0.04 * (1 - 0.7 * t) + 0.01, { sides: 6, caps: true, tone: () => C3(GOLD) }));
      }
      crest(k, 1.5, 1.1, 0.84, 2, 0.4, 0.3, 'gold', 0.05);
      crest(k, 0.0, -1.6, 0.8, f === 2 ? 6 : 8, 0.46, 0.2, 'gold', 0.05, 0.3);
      // Breaking-wave fins over the skirts: foam crest curling forward.
      for (const s of [-1, 1]) for (const x of f === 2 ? [0.25] : [0.75, -0.55]) {
        const wv = [[x - 1.1, 0.5], [x + 0.35, 0.5], [x + 0.42, 0.68], [x + 0.32, 0.9], [x + 0.12, 0.96], [x - 0.04, 0.88], [x + 0.1, 0.8], [x + 0.16, 0.7], [x - 0.1, 0.66], [x - 0.55, 0.64]];
        k.profile(wv, s * 0.77, s * 0.83, 'foam', 0.015);
        k.profile(wv.slice(0, 2).concat([[x + 0.3, 0.6], [x - 0.6, 0.58]]), s * 0.78, s * 0.84, 'teal', 0.012);
      }
    }
    if (orn && f === 3) fireAura(b, -0.1, 2.0, 1.4, 18, 1.0, AURA.tide);
    // Turret: stepped octagon, pearl in a gold claw on top, long gun.
    b.use('turret');
    const tx = 0.3;
    k.oct(tx, 0.88, 0, 0.5, 0.1, 'under');
    k.oct(tx - 0.02, 1.02, 0, 0.44, 0.2, 'teal', 0.05, 1.2);
    k.oct(tx - 0.05, 1.16, 0, 0.32, 0.08, 'gold', 0.03, 1.2);
    for (const s of [-1, 1]) k.light(tx + 0.5, 1.02, s * 0.15, 0.04, LAMP.blue, '+x');
    if (orn) {
      const pr = [0.1, 0.14, 0.19][f - 1], py = 1.26 + pr;
      for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + PI / 6; k.beam([tx - 0.05 + Math.cos(a) * 0.12, 1.2, Math.sin(a) * 0.12], [tx - 0.05 + Math.cos(a) * pr * 1.05, py + pr * 0.4, Math.sin(a) * pr * 1.05], 0.05, 0.05, 'gold', 0.015); }
      fin(b, 'pearl', mix(PEARL, st.glow, 0.35)); b.push().move(tx - 0.05, py, 0).ball(pr, 2).pop();
      h.lit(b, () => b.push().move(tx - 0.05, py, 0).ball(pr * 0.65, 1).pop());
      if (f === 3) { fin(b, 'gold', GOLD); b.push().move(tx - 0.05, py, 0).geo(new THREE.TorusGeometry(pr + 0.1, 0.022, 5, 22).rotateX(PI / 2)).pop(); }
    }
    b.use('barrel');
    K.my = 1.08;
    k.blk(tx + 0.42, 1.06, 0, 0.24, 0.24, 0.32, 'tealD', 0.04);
    cannon(b, tx + 0.5, 1.08, 0, K.stock.muzzle - tx - 0.5, 0.07, CHROME, gold);
    b.use('hull');
    K.parts.push(...k.parts); K.top = f === 3 ? 1.9 : 1.6;
    return finish(K, { recoil: 0.28 });
  },

  // Cửu Vĩ Hồ, trickster: a compact white fox pod on hover pads, orange enamel saddle, a fox head turret with a gold
  // mask and red markings, and a fan of fox tails rising behind like a peacock's train (white with orange tips),
  // standing up so the fan reads from above as a crescent, not a mat. Unlike Hồ Ly (pink, one tail curled to one
  // side) the fan is symmetric and upright. I: three short tails. II: five. III: nine, long, foxfire aura.
  cuuvi(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, white = C3(PEARL), orange = f === 1 ? mix(trim, 0x9a9088, 0.4) : C3(trim), rust = C3(deep);
    const k = new OKit(b, st, trim, form, { white: [white, 'pearl'], orange: [orange, 'enamel'], gold: [GOLD, 'gold'], red: [0xc81e3a, 'enamel'], gun: [white, 'pearl'], gunLite: [GOLD, 'gold'], panel: [orange, 'enamel'], under: [mix(rust, 0x141012, 0.55), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x18100e, 'dark'] });
    b.use('hull');
    k.prism([[0.92, 0], [0.78, 0.34], [0.2, 0.48], [-0.6, 0.44], [-0.88, 0.24], [-0.88, -0.24], [-0.6, -0.44], [0.2, -0.48], [0.78, -0.34]], 0.55, 0.8, 'under', 0.05);
    k.prism([[0.84, 0], [0.7, 0.3], [0.15, 0.42], [-0.55, 0.38], [-0.8, 0.2], [-0.8, -0.2], [-0.55, -0.38], [0.15, -0.42], [0.7, -0.3]], 0.8, 0.94, 'white', 0.04);
    k.plate(-0.25, 0.97, 0, 0.75, 0.05, 0.42, { col: 'orange', insert: null });
    for (const s of [-1, 1]) {
      k.plate(0.6, 0.86, s * 0.3, 0.42, 0.05, 0.12, { col: 'orange', insert: null, ry: s * -0.45 });
      k.light(0.88, 0.68, s * 0.14, 0.04, LAMP.amber, '+x');
    }
    if (orn) {
      // Tail fan: tails root together on the rump, splay in a fan across the y-z plane, lean back and curl at the tip.
      const n = [3, 5, 9][f - 1], L = [0.6, 0.85, 1.12][f - 1], R = [0.12, 0.15, 0.16][f - 1], fan = [0.45, 0.62, 1.1][f - 1], lean = 0.4;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1) * 2 - 1, ph = t * fan, cz = Math.sin(ph), cy = Math.cos(ph), mid = 1 - 0.25 * Math.abs(t);
        const Lx = L * mid, dx = -Math.sin(lean), dy = Math.cos(lean);
        const P = [V(-0.72, 0.98, cz * 0.08), V(-0.72 + dx * Lx * 0.3 - 0.1, 0.98 + dy * cy * Lx * 0.35, cz * Lx * 0.3), V(-0.72 + dx * Lx * 0.7 - 0.12, 0.98 + dy * cy * Lx * 0.75, cz * Lx * 0.62), V(-0.72 + dx * Lx * 0.75 + 0.05, 0.98 + dy * cy * Lx * 1.05, cz * Lx * 0.78)];
        foxTail(b, P, R, white, orange, 0.68);
      }
      k.oct(-0.72, 1.0, 0, 0.18, 0.1, 'gold', 0.03);
      if (f === 3) fireAura(b, -0.1, 1.4, 1.2, 16, 0.95, AURA.foxfire);
    }
    b.use('turret');
    k.oct(0.3, 1.0, 0, 0.26, 0.08, 'under');
    k.prism([[0.7, 0], [0.58, 0.18], [0.12, 0.26], [-0.02, 0.16], [-0.02, -0.16], [0.12, -0.26], [0.58, -0.18]], 1.04, 1.3, 'white', 0.05);
    k.prism([[0.95, 0], [0.75, 0.09], [0.5, 0.13], [0.5, -0.13], [0.75, -0.09]], 1.18, 1.27, 'white', 0.03);
    k.blk(0.94, 1.24, 0, 0.05, 0.05, 0.07, 'dark', 0.015);
    if (f >= 2) k.plate(0.42, 1.31, 0, 0.32, 0.04, 0.42, { col: 'gold', insert: null, rz: -0.12 });
    for (const s of [-1, 1]) {
      k.light(0.6, 1.24, s * 0.13, 0.03, LAMP.red, '+x');
      k.blk(0.62, 1.16, s * 0.17, 0.16, 0.03, 0.04, 'red', 0.01);
      ear(b, s, [0.16, 1.28, 0.15], [0.34, 0.44, 0.5][f - 1], 0.13, 0.12, white, orange);
    }
    b.use('barrel');
    K.my = 1.12;
    for (const z of [-0.09, 0.09]) cannon(b, 0.55, 1.12, z, K.stock.muzzle - 0.55, 0.045, CHROME, f === 1 ? CHROME : GOLD);
    b.use('hull');
    K.parts.push(...k.parts); K.top = f === 3 ? 2.15 : 1.75;
    return finish(K, { recoil: 0.2 });
  },

  // Kiếm Thần, bruiser: a silver sword-saint walker on two legs. A diamond chest of silver plates with blue enamel, a
  // tall helm with a blade crest, a robe of hanging tabard plates front and back and flared sleeve plates at the
  // shoulders, and a halo of floating swords round the helm, tips out, that turns slowly ('swords'). Lance gun.
  // I: two swords crossed on the back, short tabards. II: six-sword halo, sleeves. III: eight swords on a lit ring,
  // long sleeves, blade aura.
  kiemthan(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, silver = f === 1 ? mix(paint, 0x8a9099, 0.35) : mix(paint, CHROME, 0.3), blue = C3(trim), slate = C3(deep);
    const k = new OKit(b, st, trim, form, { silver: [silver, 'pearl'], blue: [blue, 'enamel'], blueD: [mix(blue, slate, 0.5), 'enamel'], slate: [slate, 'dark'], gold: [GOLD, 'gold'], gun: [silver, 'pearl'], gunLite: [GOLD, 'gold'], panel: [blue, 'enamel'], under: [mix(slate, 0x101216, 0.4), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x101216, 'dark'] });
    b.use('hull');
    const y0 = K.g.y0, y1 = K.g.y1;
    k.prism([[0.78, 0], [0.35, 0.5], [-0.35, 0.5], [-0.72, 0], [-0.35, -0.5], [0.35, -0.5]], y0, y0 + 0.26, 'under', 0.04);
    k.prism([[0.7, 0], [0.3, 0.44], [-0.3, 0.44], [-0.64, 0], [-0.3, -0.44], [0.3, -0.44]], y0 + 0.24, y1, 'silver', 0.05);
    k.plate(0.05, y1 + 0.02, 0, 0.6, 0.05, 0.5, { col: 'blue', insert: null });
    // Robe: tabard plates hanging front and back between the legs.
    const tab = orn ? [0.42, 0.56, 0.66][f - 1] : 0.3;
    for (const sx of [1, -1]) {
      k.plate(sx * 0.62, y0 - tab / 2 + 0.06, 0, 0.07, tab, 0.42, { col: 'blue', insert: null, rz: sx * -0.18 });
      k.blk(sx * (0.62 + 0.05), y0 - tab + 0.1, 0, 0.06, 0.06, 0.44, 'gold', 0.015);
    }
    if (orn && f >= 2) {
      // Flared sleeves: a broad plate from each shoulder sweeping back and out, blue face, silver rim, gold cuff.
      const sl = f === 2 ? 0.7 : 0.95;
      for (const s of [-1, 1]) {
        b.push().move(0.15, y1 - 0.05, s * 0.48).rotX(-s * 0.5);
        k.prism([[0.1, 0], [0.1, s * 0.12], [-sl * 0.6, s * 0.34], [-sl, s * 0.26], [-sl * 0.9, s * 0.06], [-0.2, 0]], -0.025, 0.025, 'blue', 0.01);
        k.prism([[0.1, s * 0.12], [-sl * 0.6, s * 0.34], [-sl, s * 0.26], [-sl * 0.98, s * 0.32], [-sl * 0.6, s * 0.4], [0.12, s * 0.16]], -0.03, 0.03, 'silver', 0.01);
        k.blk(-sl * 0.95, 0, s * 0.22, 0.08, 0.07, 0.2, 'gold', 0.015);
        b.pop();
      }
    }
    if (orn && f === 3) fireAura(b, 0, 1.45, 1.35, 16, 1.0, AURA.blade);
    b.use('turret');
    const hy = y1 + 0.05;
    k.oct(0, hy + 0.05, 0, 0.3, 0.1, 'under');
    k.plate(0, hy + 0.3, 0, 0.46, 0.42, 0.44, { col: 'silver', insert: 'blue' });
    k.blk(0.22, hy + 0.36, 0, 0.06, 0.08, 0.34, 'dark', 0.015);
    k.strip(0.255, hy + 0.36, 0, 0.3, 'z', 'glow', 0.03);
    for (const s of [-1, 1]) k.plate(-0.02, hy + 0.26, s * 0.25, 0.4, 0.3, 0.06, { col: 'blueD', insert: null, ry: s * 0.15 });
    // Shoulder guards on the chest corners (hull batch so they stay square to the walk).
    b.use('hull');
    for (const s of [-1, 1]) {
      k.plate(0.0, y1 + 0.02, s * 0.44, 0.5, 0.12, 0.3, { col: 'silver', insert: 'blue', rx: s * -0.35 });
      if (orn && f >= 2) k.plate(-0.02, y1 - 0.06, s * 0.58, 0.44, 0.08, 0.22, { col: 'blueD', insert: null, rx: s * -0.6 });
    }
    b.use('turret');
    // Blade crest on the helm.
    fin(b, 'gold', GOLD); b.push().move(0, hy + 0.53, 0).chamfer(0.12, 0.05, 0.28, 0.015).pop();
    put(fin(b, 'chrome'), bladeGeo({ len: [0.22, 0.42, 0.55][f - 1], w: 0.16, th: 0.04, wf: WF.spear, ridge: 0, seg: 5, edge: CHROME, face: CHROME, face2: blue, back: 0xaeb8c8 }).rotateX(PI / 2).rotateZ(PI / 2 - 0.25).translate(0, hy + 0.55, 0));
    b.use('barrel');
    K.my = hy + 0.22;
    k.blk(0.3, K.my, 0, 0.18, 0.18, 0.22, 'slate', 0.03);
    cannon(b, 0.36, K.my, 0, K.stock.muzzle - 0.36, 0.05, CHROME, blue);
    // Sword halo, centred on the helm, tips out and a little raised; turns slowly.
    if (orn) {
      b.use('swords');
      const n = [2, 6, 8][f - 1], sl = [0.6, 0.66, 0.8][f - 1], r0 = 0.36, sy = hy + 0.42;
      for (let i = 0; i < n; i++) {
        const a = f === 1 ? PI + (i ? 0.5 : -0.5) : (i + 0.5) / n * TAU;
        b.push().move(0, sy, 0).rotY(a).move(r0, 0, 0).rotZ(0.18); sword(b, sl, { w: 0.22, face2: blue }); b.pop();
      }
      if (f >= 2) { fin(b, 'gold', GOLD); b.push().move(0, sy, 0).geo(new THREE.TorusGeometry(r0, 0.03, 5, 28).rotateX(PI / 2)).pop(); } if (f === 3) { h.lit(b, () => b.push().move(0, sy, 0).geo(new THREE.TorusGeometry(r0 + 0.08, 0.012, 4, 28).rotateX(PI / 2)).pop()); }
      K.parts.push({ name: 'swords', on: 'turret', kind: 'spin', axis: 'y', by: 'time', rate: f === 1 ? 0 : 0.9, p: [0, sy, 0], model: true });
    }
    b.use('hull');
    K.parts.push(...k.parts); K.top = hy + (f === 3 ? 1.1 : 0.9);
    return finish(K, { recoil: 0.3 });
  },

  // Bọ Hung, bruiser: a lapis scarab on six legs. Two elytra (wing cases) as stepped lapis plates with gold rims and a
  // gold suture line, a broad pronotum shield in front, a small head with a big forked horn curving up, short twin
  // cannons under the head. I: plain shells, short horn. II: gold rims, the thoracic horn, gold leg caps.
  // III: elytra lifted a little apart, a winged gold sun disc raised over the pronotum, lapis aura.
  bohung(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, lapis = f === 1 ? mix(paint, 0x8a9099, 0.35) : C3(paint), navy = C3(deep), gold = f === 1 ? mix(trim, 0x9a9080, 0.35) : C3(trim);
    const k = new OKit(b, st, trim, form, { lapis: [lapis, 'enamel'], lapisL: [mix(lapis, 0x7a8aff, 0.3), 'enamel'], navy: [navy, 'enamel'], gold: [gold, 'gold'], gun: [lapis, 'enamel'], gunLite: [gold, 'gold'], panel: [gold, 'gold'], under: [mix(navy, 0x0c0c12, 0.5), 'dark'], steel: [GOLD_DEEP, 'gold'], chrome: [CHROME, 'chrome'], dark: [0x0e0e16, 'dark'] });
    b.use('hull');
    const y0 = K.g.y0, y1 = K.g.y1;
    k.prism([[1.0, 0.3], [1.08, 0], [1.0, -0.3], [-1.05, -0.5], [-1.15, 0], [-1.05, 0.5]], y0 - 0.02, y0 + 0.24, 'under', 0.04);
    // Pronotum: broad shield, front notch, gold lip.
    const pro = [[0.95, 0.12], [0.88, 0.38], [0.66, 0.64], [0.32, 0.7], [0.22, 0], [0.32, -0.7], [0.66, -0.64], [0.88, -0.38], [0.95, -0.12]];
    if (f >= 2) k.prism(pro.map(([x, z]) => [x + 0.03, z * 1.05]), y0 + 0.18, y0 + 0.26, 'gold', 0.02);
    k.prism(pro, y0 + 0.22, y1 + 0.06, 'lapis', 0.06);
    // Elytra: one per side, lower plate and a raised inner plate, gold suture and rim.
    const ely = [[0.3, 0.03], [0.3, 0.62], [0.0, 0.76], [-0.6, 0.74], [-1.0, 0.56], [-1.2, 0.26], [-1.18, 0.03]];
    const open = orn && f === 3 ? 0.12 : 0;
    for (const s of [-1, 1]) {
      b.push().move(0.3, 0, 0).rotY(s * open).move(-0.3, 0, 0);
      const E = ely.map(([x, z]) => [x, s * z]);
      if (f >= 2) k.prism(ely.map(([x, z]) => [x - 0.03, s * (z * 1.04 + 0.01)]), y0 + 0.16, y0 + 0.24, 'gold', 0.02);
      k.prism(E, y0 + 0.2, y1 + 0.02, 'lapis', 0.06);
      k.prism(ely.map(([x, z]) => [x * 0.9 - 0.02, s * (z * 0.72 + 0.04)]), y1, y1 + 0.1, 'lapisL', 0.04);
      if (f >= 2) k.beam([0.28, y1 + 0.1, s * 0.06], [-1.1, y1 + 0.06, s * 0.06], 0.05, 0.04, 'gold', 0.012);
      b.pop();
    }
    // Head and horn.
    k.prism([[1.28, 0.1], [1.32, 0], [1.28, -0.1], [1.0, -0.28], [0.9, -0.2], [0.9, 0.2], [1.0, 0.28]], y0 + 0.1, y0 + 0.36, 'navy', 0.04);
    for (const s of [-1, 1]) k.light(1.2, y0 + 0.28, s * 0.2, 0.035, st.glow, s > 0 ? '+z' : '-z');
    const hl = [0.4, 0.7, 0.85][f - 1], hx = 1.1, hy0 = y0 + 0.32;
    const horn = [V(hx, hy0, 0), V(hx + hl * 0.35, hy0 + hl * 0.25, 0), V(hx + hl * 0.45, hy0 + hl * 0.7, 0), V(hx + hl * 0.3, hy0 + hl * 1.0, 0)];
    put(fin(b, 'enamel'), tubeGeo(new THREE.CatmullRomCurve3(horn).getPoints(12), (t) => 0.13 * Math.pow(1 - t, 0.8) + 0.012, { sides: 8, caps: true, up: V(0, 0, 1), tone: (t) => (t > 0.65 ? C3(gold) : mix(navy, lapis, t)) }));
    if (f >= 2) for (const s of [-1, 1]) {
      const P = [V(hx + hl * 0.42, hy0 + hl * 0.82, 0), V(hx + hl * 0.5, hy0 + hl * 0.92, s * 0.12), V(hx + hl * 0.58, hy0 + hl * 0.95, s * 0.18)];
      put(fin(b, 'gold'), tubeGeo(P, (t) => 0.05 * (1 - 0.8 * t) + 0.008, { sides: 6, caps: true, tone: () => C3(gold) }));
    }
    if (orn && f >= 2) {
      // Thoracic horn: from the pronotum forward over the head.
      const P = [V(0.55, y1 + 0.06, 0), V(0.85, y1 + 0.2, 0), V(1.1, y1 + 0.22, 0), V(1.25, y1 + 0.14, 0)];
      put(fin(b, 'enamel'), tubeGeo(new THREE.CatmullRomCurve3(P).getPoints(10), (t) => 0.1 * Math.pow(1 - t, 0.8) + 0.01, { sides: 7, caps: true, up: V(0, 0, 1), tone: (t) => (t > 0.7 ? C3(gold) : C3(lapis)) }));
    }
    if (orn && f === 3) {
      // Winged sun disc over the pronotum: a gold ring round a lit disc, two gold feather wings across z.
      const sx = 0.25, sy = y1 + 0.75;
      k.beam([0.4, y1 + 0.06, 0], [sx, sy - 0.2, 0], 0.08, 0.08, 'gold', 0.02);
      fin(b, 'gold', GOLD); b.push().move(sx, sy, 0).geo(new THREE.TorusGeometry(0.3, 0.055, 6, 24).rotateY(PI / 2)).pop();
      k.lamp(0xff8a2a, () => b.push().move(sx, sy, 0).rotZ(PI / 2).cyl(0.25, 0.25, 0.03, 16).pop());
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const g = bladeGeo({ len: 0.75 - i * 0.15, w: 0.17, th: 0.03, wf: WF.feather, seg: 5, edge: GOLD, face: i % 2 ? mix(GOLD, lapis, 0.5) : GOLD, back: GOLD_DEEP, mz: s < 0 });
        at(b, s, [sx - 0.02, sy - 0.04 - i * 0.09, 0.27], [PI / 2, -PI / 2, 0.12 - i * 0.12], () => put(b, g));
      }
      fireAura(b, -0.1, 1.6, 1.45, 16, 1.0, AURA.lapis);
    }
    b.use('barrel');
    // Mandible cannons flanking the head, ending at the stock muzzle.
    K.my = y0 + 0.3;
    for (const s of [-1, 1]) { k.blk(0.42, K.my, s * 0.5, 0.26, 0.2, 0.2, 'navy', 0.04); cannon(b, 0.45, K.my, s * 0.5, K.stock.muzzle - 0.45, 0.065, CHROME, gold); }
    b.use('hull');
    K.parts.push(...k.parts); K.top = orn && f === 3 ? y1 + 0.95 : y1 + 0.7;
    return finish(K, { recoil: 0.18 });
  },
};
