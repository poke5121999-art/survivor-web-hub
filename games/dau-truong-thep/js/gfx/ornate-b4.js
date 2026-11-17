// Ornate batch 4 (dtt-restyle): Sứa Trắng, Khỉ Đột, Rết Đỏ, Nhện Thép, Tào Tháo, Bọ Ngựa.
// Same construction as ornate.js, ornate-b1.js and ornate-b2.js: the chunky plated steel base (OKit) in polished
// finishes, then one or two big motif structures per tank (a stepped jellyfish bell with a scalloped margin, red cross
// marks and hanging tentacles; knuckle-walking gorilla arms with torn iron plates and a heavy brow; a segmented
// centipede with blade legs, tail prongs and two crossed swords on its back; a steel spider with grapple launchers and a
// red scarf; a black and gold warlord with a crown crest, a pleated cape and a sword barrel; a mantis with raised
// scythe arms, a triangular head and wing cases), each with its own form III aura ramp. Forms: I plain plates; II
// armour and the motif at mid size; III the full motif and the aura.
// A frame spec with no `sig` (the silhouette gate's bare frame) draws only hull, gear, turret, gun and the parts that
// are the tank's body (the gorilla's arms, the mantis's scythes, the jellyfish bell).
// Models face +x, +z is the right side, the ground is y = 0.
import * as THREE from '../../vendor/three.module.min.js';
import { LAMP } from './steel.js';
import { OKit, start, finish, fin, put, mix, C3, at, skin, cannon, fireAura, tubeGeo, bladeGeo, WF, GOLD, GOLD_DEEP, CHROME, PEARL } from './ornate.js';

const PI = Math.PI, TAU = PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const WHITE = new THREE.Color(1, 1, 1);
const ramp = (a, b, c) => [[0, new THREE.Color(...a)], [0.4, new THREE.Color(...b)], [1, new THREE.Color(...c)]];
// One aura ramp per tank of this batch (root, middle, tip), none shared with ornate.js, ornate-b1/b2/b3 or each other.
const AURA = {
  pearl: ramp([1.0, 1.0, 1.0], [0.82, 0.9, 1.0], [0.5, 0.6, 0.78]), // white jellyfish glow, pale ice tips
  quake: ramp([1.0, 0.9, 0.7], [0.58, 0.34, 0.14], [0.2, 0.1, 0.05]), // ground dust: cream to umber
  cinder: ramp([1.0, 0.95, 0.6], [0.95, 0.15, 0.35], [0.15, 0.0, 0.22]), // hot rose, purple-black tips
  frostred: ramp([0.95, 0.97, 1.0], [0.68, 0.76, 0.9], [0.6, 0.08, 0.1]), // steel-white silk, red scarf tips
  imperial: ramp([1.0, 0.88, 0.45], [0.58, 0.08, 0.06], [0.08, 0.05, 0.04]), // gold root, oxblood, black
  mantis: ramp([1.0, 1.0, 0.72], [0.72, 0.95, 0.1], [0.0, 0.3, 0.32]), // chartreuse, teal tips
};

// ---------- shared pieces of this batch ----------
// n-gon in the XZ plane round (cx, cz), radius r, stretched sx along x.
const ring = (cx, cz, r, n, ph = 0.5, sx = 1) => { const o = []; for (let i = 0; i < n; i++) { const a = (i + ph) / n * TAU; o.push([cx + Math.cos(a) * r * sx, cz + Math.sin(a) * r]); } return o; };
// Straight run of n points from a to c (for tubes).
const line = (a, c, n) => { const o = []; for (let i = 0; i < n; i++) o.push(a.clone().lerp(c, i / (n - 1))); return o; };
// Toned geometry kept for reuse (put() disposes).
const putK = (b, g) => { b.tint(WHITE); b.geo(g); return b; };
// Ribbon along a smooth path: a flat band whose faces look up, hemmed ends.
function ribbon(b, pts, w, col, hem) {
  const P = new THREE.CatmullRomCurve3(pts).getPoints(16);
  put(fin(b, 'enamel'), tubeGeo(P, (t) => w * (0.75 + 0.25 * Math.sin(PI * t)) * (t > 0.92 ? 0.7 : 1), { sides: 6, flatN: 0.2, caps: true, tone: (t) => (t > 0.9 || t < 0.04 ? C3(hem) : C3(col)) }));
}
// Torn armour plate: a flat chamfered slab (L along local x, W along z) with one ragged edge ('z': the -z side,
// 'x': the -x side), set at (x, y, z) and pitched by rz; s mirrors it across z.
function torn(k, x, y, z, L, W, rz, col, edge = 'z', s = 1, n = 5) {
  const P = [];
  if (edge === 'z') { P.push([L / 2, W / 2], [-L / 2, W / 2]); for (let i = 0; i <= n; i++) P.push([-L / 2 + i / n * L, -W / 2 + (i % 2 ? 0.24 : i === 0 || i === n ? 0 : 0.07) * W]); }
  else { P.push([L / 2, -W / 2], [L / 2, W / 2]); for (let i = 0; i <= n; i++) P.push([-L / 2 + (i % 2 ? 0.22 : i === 0 || i === n ? 0 : 0.06) * L, W / 2 - i / n * W]); }
  k.b.push().move(x, y, z).rotZ(rz); k.prism(P.map(([px, pz]) => [px, pz * s]), -0.035, 0.035, col, 0.015); k.b.pop();
}

export const B4 = {
  // Sứa Trắng, support: a white jellyfish hovering on four pads. The body is a stepped bell of pearl tiers with
  // grey-blue rims (plated, not a smooth dome), a scalloped margin of drooping lobes, red cross marks round its side and
  // on its cap, banded tentacles trailing back with glowing tips and two frilled oral arms; the lens emitter sits under
  // the margin. I: three tiers, two crosses, short tentacles. II: five tiers, four crosses, oral arms. III: the full
  // bell, six crosses, a lit cap cross and a halo, long tentacles, pearl aura.
  suatrang(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, y0 = K.g.y0;
    const pearl = f === 1 ? mix(PEARL, 0x9aa0a8, 0.3) : C3(PEARL), rim = mix(deep, 0x6a7a90, 0.3), red = f === 1 ? mix(trim, 0x9a8a8a, 0.3) : C3(trim), blush = mix(PEARL, 0xffa8b8, 0.4), cyan = C3(st.glow);
    const k = new OKit(b, st, trim, form, { pearl: [pearl, 'pearl'], rim: [rim, 'enamel'], red: [red, 'enamel'], blush: [blush, 'pearl'], gun: [pearl, 'pearl'], gunLite: [CHROME, 'chrome'], panel: [rim, 'enamel'], under: [0x262c34, 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x12161c, 'dark'] });
    b.use('hull');
    k.prism(ring(0, 0, 0.62, 12), y0 - 0.08, y0 + 0.12, 'under', 0.04);
    // Bell: stepped tiers, pearl with rim steps between them.
    const T = [[0.84, 0.17, 'pearl'], [0.74, 0.05, 'rim'], [0.7, 0.14, 'pearl'], [0.56, 0.05, 'rim'], [0.52, 0.13, 'pearl'], [0.38, 0.1, 'blush'], [0.22, 0.08, 'pearl']];
    const nt = [4, 5, 7][f - 1];
    let y = y0 + 0.1;
    for (let i = 0; i < nt; i++) { const [r, hh, c] = T[i]; k.prism(ring(0, 0, r, 12), y, y + hh, c, Math.min(0.04, hh * 0.3)); y += hh; }
    const top = y;
    // Margin: drooping scalloped lobes all round the rim.
    const lobe = bladeGeo({ len: [0.15, 0.2, 0.23][f - 1], w: 0.26, th: 0.04, wf: WF.petal, seg: 4, ridge: 0, edge: rim, face: pearl, face2: blush, back: mix(pearl, rim, 0.3) });
    fin(b, 'pearl');
    for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * TAU; b.push().move(0, y0 + 0.17, 0).rotY(-a).move(0.78, 0, 0).rotZ(-0.8); putK(b, lobe); b.pop(); }
    lobe.dispose();
    // Red cross marks on the side faces of the first tier (face centres every 30 degrees).
    const cross = (a, s) => { const r = 0.84 * Math.cos(PI / 12) + 0.012; b.push().move(Math.cos(a) * r, y0 + 0.185, Math.sin(a) * r).rotY(-a); k.use('red'); b.push().chamfer(0.03, s, s * 0.32, 0.008).pop(); b.push().chamfer(0.03, s * 0.32, s, 0.008).pop(); b.pop(); };
    for (const i of [[3, 9], [2, 4, 8, 10], [2, 4, 6, 8, 10]][f - 1]) cross(i * PI / 6, 0.19);
    if (f >= 2) { k.blk(0, top + 0.015, 0, 0.22, 0.03, 0.07, 'red', 0.01); k.blk(0, top + 0.015, 0, 0.07, 0.03, 0.22, 'red', 0.01); }
    if (orn) {
      // Tentacles: banded, trailing back and down from under the rear of the bell, glowing at the tips.
      const n = [4, 7, 9][f - 1], L = [0.5, 0.85, 1.1][f - 1];
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0.5 : i / (n - 1), a = PI * (0.6 + 0.8 * u), x0 = Math.cos(a) * 0.5, z0 = Math.sin(a) * 0.5, l = L * (0.82 + 0.22 * Math.abs(Math.sin(i * 2.3 + 1)));
        const P = []; for (let j = 0; j <= 5; j++) { const t = j / 5; P.push(V(x0 - l * t * 0.95, Math.max(0.14, y0 - 0.02 - 0.42 * Math.sqrt(t)), z0 * (1 + 0.75 * t) + 0.07 * Math.sin(t * 5 + i * 1.3))); }
        const C = new THREE.CatmullRomCurve3(P).getPoints(12);
        put(fin(b, 'pearl'), tubeGeo(C, (t) => 0.065 * (1 - 0.65 * t) + 0.014, { sides: 6, caps: true, tone: (t) => (t > 0.72 ? mix(rim, cyan, 0.7) : Math.sin(t * 18) > 0.55 ? rim : blush) }));
        const e = C[C.length - 1]; k.lamp('glow', () => b.push().move(e.x, e.y, e.z).ball(0.035, 1).pop());
      }
      if (f >= 2) for (const s of [-1, 1]) ribbon(b, [V(-0.05, y0 - 0.02, s * 0.08), V(-0.3, y0 - 0.12, s * 0.16), V(-0.3 - 0.45 * L, y0 - 0.22, s * 0.08), V(-0.3 - 0.75 * L, 0.3, s * 0.2)], 0.1, blush, rim);
      if (f === 3) {
        h.lit(b, () => b.push().move(0, top + 0.2, 0).geo(new THREE.TorusGeometry(0.28, 0.02, 4, 24).rotateX(PI / 2)).pop());
        k.lamp(LAMP.red, () => { b.push().move(0, top + 0.035, 0).box(0.16, 0.012, 0.045).pop(); b.push().move(0, top + 0.035, 0).box(0.045, 0.012, 0.16).pop(); });
        fireAura(b, -0.1, 1.45, 1.45, 12, 0.8, AURA.pearl);
      }
    }
    // Lens emitter under the front of the margin.
    b.use('turret');
    k.prism(ring(0.5, 0, 0.14, 8, 0.5, 1.4), y0 - 0.06, y0 + 0.1, 'rim', 0.03);
    b.use('barrel');
    const mx = K.stock.muzzle, gx = Math.min(0.6, mx - 0.2), gy = (K.my = y0 + 0.02);
    fin(b, 'chrome', CHROME); b.push().move((gx + mx) / 2, gy, 0).rotZ(-PI / 2).cyl(0.08, 0.1, mx - gx, 10).pop();
    fin(b, 'pearl', pearl); b.push().move(mx - 0.04, gy, 0).rotZ(-PI / 2).cyl(0.12, 0.12, 0.05, 12).pop();
    k.lamp('glow', () => b.push().move(mx, gy, 0).rotZ(-PI / 2).cyl(0.09, 0.09, 0.02, 12).pop());
    b.use('hull');
    K.parts.push(...k.parts); K.top = top + (f === 3 ? 0.3 : 0.1);
    return finish(K, { recoil: 0.12 });
  },

  // Khỉ Đột, tank: a hunched gorilla on two short track pods. A green torso high at the shoulders and low at the rump,
  // huge shoulders, and the two arms knuckle-walking: thick upper arms down to the elbows, massive forearms out and
  // forward to fists planted on the ground ahead of the tracks (they read from top-down as two diagonal limbs ending
  // in fists at the front corners). Iron armour plates with ragged torn edges over chest, back, shoulders and
  // forearms; a low head turret under a heavy iron brow, lime eyes and the short cannon as its muzzle.
  // I: plain plates, smaller arms. II: torn iron plates, bracers, skirts. III: big arms, knuckle spikes, crest, aura.
  khidot(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K;
    const green = f === 1 ? mix(paint, 0x7a8a70, 0.35) : mix(paint, 0x22381c, 0.4), hide = mix(paint, deep, 0.55), iron = C3(f === 3 ? 0x5c6168 : 0x4c5157), brown = C3(trim);
    const k = new OKit(b, st, trim, form, { green: [green, 'pearl'], hide: [hide, 'pearl'], iron: [iron, 'dark'], ironL: [mix(iron, 0xb8c0c8, 0.4), 'chrome'], brown: [brown, 'enamel'], gun: [iron, 'dark'], gunLite: [mix(iron, 0xb8c0c8, 0.4), 'chrome'], panel: [green, 'enamel'], under: [0x1a1e16, 'dark'], steel: [0x8a9098, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x101210, 'dark'] });
    b.use('hull');
    for (const s of [-1, 1]) k.trackPod(-0.2, s * 0.6, 1.5, 0.34, 0.56, { coverCol: 'iron', insert: null, skirt: f >= 2, skirtH: 0.3, light: LAMP.green });
    k.prism([[0.62, 0.42], [0.72, 0.28], [0.72, -0.28], [0.62, -0.42], [-0.85, -0.44], [-0.95, -0.3], [-0.95, 0.3], [-0.85, 0.44]], 0.2, 0.62, 'under', 0.05);
    // Torso: side profile high at the shoulders, low at the rump.
    k.profile([[-0.9, 0.55], [-0.9, 0.8], [-0.45, 0.96], [0.05, 1.2], [0.42, 1.18], [0.66, 0.92], [0.7, 0.55]], -0.46, 0.46, 'green', 0.07);
    k.blk(-0.1, 0.6, 0, 1.62, 0.07, 0.97, 'brown', 0.02);
    // Shoulders: big humps either side of the neck.
    for (const s of [-1, 1]) k.blk(0.1, 1.12, s * 0.48, 0.58, 0.32, 0.38, 'hide', 0.08);
    if (orn && f >= 2) {
      // Torn iron plates: rear deck, mid back, lower chest pair, shoulder caps.
      torn(k, -0.67, 0.93, 0, 0.42, 0.66, 0.34, 'iron', 'x');
      torn(k, -0.22, 1.13, 0, 0.44, 0.6, 0.45, 'iron', 'x');
      for (const s of [-1, 1]) {
        torn(k, 0.74, 0.74, s * 0.22, 0.32, 0.38, -1.47, 'iron', 'z', s);
        torn(k, 0.1, 1.3, s * 0.5, 0.5, 0.4, 0, f === 3 ? 'ironL' : 'iron', 'z', s);
        if (f === 3) for (const x of [-0.05, 0.25]) { k.use('chrome'); b.push().move(x, 1.36, s * 0.6).cyl(0, 0.045, 0.14, 5).pop(); }
      }
    } else {
      k.plate(0.73, 0.74, 0, 0.1, 0.3, 0.6, { col: 'iron', insert: null });
      for (const s of [-1, 1]) k.plate(0.1, 1.29, s * 0.48, 0.44, 0.04, 0.3, { col: 'hide', insert: null });
    }
    // Arms (the gorilla's body, drawn on the bare frame too): shoulder → elbow → wrist → fist on the ground.
    const sc = [0.85, 1, 1.14][f - 1];
    for (const s of [-1, 1]) {
      const S = V(0.12, 1.08, s * 0.6), E = V(0.36, 0.72, s * (0.88 + 0.06 * sc)), W = V(0.7 + 0.06 * sc, 0.36, s * (0.96 + 0.07 * sc));
      put(fin(b, 'enamel', hide), tubeGeo(line(S, E, 4), (t) => 0.13 * sc * (1 - 0.15 * t), { sides: 8, caps: true }));
      fin(b, 'enamel', hide); b.push().move(E.x, E.y, E.z).ball(0.125 * sc, 1).pop();
      put(fin(b, 'enamel', green), tubeGeo(line(E, W, 5), (t) => (0.13 + 0.08 * t) * sc, { sides: 9, caps: true }));
      if (orn && f >= 2) {
        put(fin(b, 'dark', iron), tubeGeo(line(E.clone().lerp(W, 0.35), E.clone().lerp(W, 0.78), 3), (t) => (0.17 + 0.035 * t) * sc, { sides: 9, caps: true }));
        put(fin(b, 'enamel', brown), tubeGeo(line(E.clone().lerp(W, 0.86), E.clone().lerp(W, 0.96), 2), () => 0.215 * sc, { sides: 9, caps: true }));
      }
      // Fist resting on its knuckles, knuckle plates across its top front.
      const fw = 0.36 * sc, fh = 0.3 * sc, fd = 0.36 * sc, fx = W.x + 0.12 * sc, fy = fh / 2 + 0.01;
      b.push().move(fx, fy, W.z).rotY(-s * 0.12);
      fin(b, 'enamel', hide); b.chamfer(fw, fh, fd, 0.06);
      for (let i = 0; i < 4; i++) {
        const z = (i - 1.5) * fd * 0.24;
        k.use(f === 1 ? 'hide' : 'iron'); b.push().move(fw * 0.42, fh * 0.28, z).rotZ(-0.6).chamfer(0.13 * sc, 0.07, 0.075 * sc, 0.015).pop();
        if (orn && f === 3) { k.use('chrome'); b.push().move(fw * 0.56, fh * 0.42, z).rotZ(-0.7).cyl(0, 0.035, 0.12, 5).pop(); }
      }
      b.pop();
    }
    if (orn && f === 3) fireAura(b, 0, 1.6, 1.65, 14, 1.0, AURA.quake);
    // Head turret: low and forward between the shoulders, heavy brow, lime eyes, a crest at III.
    b.use('turret');
    const hx = 0.42;
    k.oct(0.25, 1.05, 0, 0.3, 0.08, 'under');
    k.prism([[0.36, 0.17], [0.18, 0.25], [-0.16, 0.22], [-0.22, 0], [-0.16, -0.22], [0.18, -0.25], [0.36, -0.17]].map(([x, z]) => [hx + x, z]), 1.0, 1.3, 'hide', 0.06);
    k.prism([[0.46, 0.14], [0.46, -0.14], [0.2, -0.2], [0.2, 0.2]].map(([x, z]) => [hx + x, z]), 0.96, 1.12, 'green', 0.04);
    const bw = [0.27, 0.32, 0.34][f - 1];
    k.prism([[0.42, bw], [0.47, 0], [0.42, -bw], [0.12, -bw], [0.08, 0], [0.12, bw]].map(([x, z]) => [hx + x, z]), 1.24, 1.37, f === 1 ? 'hide' : 'iron', 0.04);
    for (const s of [-1, 1]) k.light(hx + 0.38, 1.18, s * 0.1, 0.035, 'glow', '+x');
    if (orn && f === 3) k.prism([[0.1, 0.06], [-0.2, 0.08], [-0.25, 0], [-0.2, -0.08], [0.1, -0.06]].map(([x, z]) => [hx + x, z]), 1.3, 1.42, 'iron', 0.02);
    b.use('barrel');
    const mx = K.stock.muzzle, gx = Math.min(hx + 0.4, mx - 0.25);
    K.my = 1.05;
    k.cannon(gx, K.my, 0, mx - gx - 0.04, 0.1, { col: 'iron', ribs: 2, stripe: 'glow' });
    b.use('hull');
    K.parts.push(...k.parts); K.top = 1.55;
    return finish(K, { recoil: 0.15 });
  },

  // Rết Đỏ, bruiser: a long red centipede on four legs. Five shingled red dorsal plates over black belly segments, a
  // pair of black blade legs at each segment, banded tail prongs trailing back, a flat head turret with forcipule fangs,
  // amber eyes and banded antennae, twin guns, and two katanas crossed on the mid-back. I: three blade pairs, short
  // antennae and prongs. II: four pairs, the crossed swords. III: five pairs with red faces, long swords and straps,
  // cinder aura.
  retdo(h, b, st, paint, trim, deep, form) {
    const blk = C3(0x1c1c20);
    const K = start(h, b, st, paint, trim, deep, form, { paint: mix(blk, 0x3a3a40, 0.3), trim: C3(paint) }), { f, orn } = K, y0 = K.g.y0, y1 = K.g.y1;
    const red = f === 1 ? mix(paint, 0x8a7a7a, 0.35) : C3(paint), redL = mix(paint, 0xff5a4a, 0.3);
    const k = new OKit(b, st, trim, form, { red: [red, 'enamel'], redL: [redL, 'enamel'], black: [blk, 'enamel'], gun: [blk, 'enamel'], gunLite: [CHROME, 'chrome'], panel: [red, 'enamel'], under: [0x0e0e10, 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x08080a, 'dark'] });
    b.use('hull');
    const NS = 5, segs = [];
    for (let i = 0; i < NS; i++) {
      const x = 0.55 - i * 0.48, L = 0.46, W = 0.92 - i * 0.07;
      segs.push([x, W]);
      const hex = [[L / 2, W * 0.36], [L * 0.15, W / 2], [-L / 2, W * 0.42], [-L / 2, -W * 0.42], [L * 0.15, -W / 2], [L / 2, -W * 0.36]];
      k.prism(hex.map(([a, c]) => [x + a, c * 0.9]), y0 - 0.02, y0 + 0.16, 'under', 0.03);
      b.push().move(x, (y0 + y1) / 2 + 0.04, 0).rotZ(0.08);
      k.prism(hex, -0.12, 0.12, 'red', 0.05);
      k.blk(-L / 2 + 0.03, 0.1, 0, 0.06, 0.06, W * 0.78, 'black', 0.015);
      b.pop();
    }
    if (orn) {
      // Blade legs: one pair per segment, out and down, swept back.
      const used = [[1, 2, 3], [1, 2, 3, 4], [0, 1, 2, 3, 4]][f - 1];
      for (const s of [-1, 1]) {
        const g = bladeGeo({ len: 0.44, w: 0.11, th: 0.03, wf: WF.spear, ridge: 0, seg: 4, lift: -0.25, edge: CHROME, face: f === 3 ? redL : blk, back: blk, mz: s < 0 });
        fin(b, 'enamel');
        for (const i of used) { const [x, W] = segs[i]; at(b, s, [x - 0.05, y0 + 0.1, W * 0.42], [0, -PI / 2 - 0.3 - 0.08 * i, -0.5], () => putK(b, g)); }
        g.dispose();
        // Tail prongs.
        const l = [0.5, 0.75, 0.95][f - 1], x0 = segs[NS - 1][0] - 0.2;
        const P = new THREE.CatmullRomCurve3([V(x0, y0 + 0.12, s * 0.14), V(x0 - 0.3 * l, y0 + 0.22, s * 0.22), V(x0 - 0.7 * l, y0 + 0.3, s * 0.36), V(x0 - l, y0 + 0.32, s * 0.5)]).getPoints(12);
        put(fin(b, 'enamel'), tubeGeo(P, (t) => 0.065 * (1 - 0.75 * t) + 0.012, { sides: 6, caps: true, tone: (t) => (t > 0.85 ? C3(CHROME) : Math.sin(t * 16) > 0.3 ? blk : red) }));
      }
      if (f >= 2) {
        // Two katanas crossed on the mid-back, hilts forward.
        const BL = f === 3 ? 1.05 : 0.88, xc = -0.42, yc = y1 + 0.12;
        if (f === 3) for (const s of [-1, 1]) { b.push().move(xc, yc - 0.06, 0).rotY(s * 0.55); k.blk(0, 0, 0, 0.08, 0.04, 0.8, 'black', 0.012); b.pop(); }
        for (const s of [-1, 1]) {
          b.push().move(xc, yc + (s > 0 ? 0.035 : 0), 0).rotY(s * 0.55).rotZ(0.1);
          fin(b, 'enamel', blk); b.push().move(0.42, 0, 0).rotZ(-PI / 2).cyl(0.04, 0.04, 0.26, 6).pop();
          fin(b, 'enamel', red); for (const x of [0.34, 0.42, 0.5]) b.push().move(x, 0, 0).rotZ(-PI / 2).cyl(0.045, 0.045, 0.02, 6).pop();
          fin(b, 'chrome', CHROME); b.push().move(0.57, 0, 0).ball(0.045, 1).pop();
          fin(b, 'dark', 0x2a2a30); b.push().move(0.28, 0, 0).rotZ(-PI / 2).cyl(0.085, 0.085, 0.025, 8).pop();
          b.push().move(0.27, 0, 0).rotY(PI);
          put(fin(b, 'chrome'), bladeGeo({ len: BL, w: 0.075, th: 0.02, seg: 6, wf: (t) => (t < 0.88 ? 1 - 0.15 * t : (1 - t) / 0.12 * 0.87), lift: 0.06, ridge: 0.35, edge: CHROME, face: 0xd8dde4, face2: 0xa8b0bc, back: 0xb8c0cc }));
          b.pop(); b.pop();
        }
      }
      if (f === 3) fireAura(b, -0.45, 2.0, 1.2, 18, 0.95, AURA.cinder);
    }
    // Head turret: flat red head, black crown plate, amber eyes, forcipule fangs, antennae.
    b.use('turret');
    k.oct(0.55, y1 - 0.02, 0, 0.3, 0.08, 'under');
    const head = [[1.12, 0.16], [0.98, 0.34], [0.4, 0.38], [0.22, 0.22], [0.22, -0.22], [0.4, -0.38], [0.98, -0.34], [1.12, -0.16]];
    k.prism(head, y1 - 0.04, y1 + 0.16, 'red', 0.05);
    k.prism(head.map(([x, z]) => [x * 0.9 + 0.06, z * 0.62]), y1 + 0.16, y1 + 0.22, 'black', 0.02);
    for (const s of [-1, 1]) {
      k.light(0.98, y1 + 0.165, s * 0.26, 0.032, LAMP.amber, '+y');
      const fg = bladeGeo({ len: [0.25, 0.32, 0.38][f - 1], w: 0.12, th: 0.04, wf: WF.spear, ridge: 0, seg: 5, sweep: -0.6, edge: CHROME, face: blk, back: blk, mz: s < 0 });
      at(b, s, [1.05, y1 - 0.02, 0.22], [0, 0.15, -0.1], () => put(fin(b, 'enamel'), fg));
      if (orn) {
        const l = [0.4, 0.6, 0.75][f - 1];
        const P = new THREE.CatmullRomCurve3([V(1.05, y1 + 0.18, s * 0.1), V(1.05 + 0.35 * l, y1 + 0.32, s * 0.2), V(1.05 + 0.7 * l, y1 + 0.38, s * 0.42), V(1.05 + 0.85 * l, y1 + 0.34, s * 0.6)]).getPoints(10);
        put(fin(b, 'enamel'), tubeGeo(P, (t) => 0.03 * (1 - 0.6 * t) + 0.008, { sides: 5, caps: true, tone: (t) => (Math.sin(t * 14) > 0.2 ? red : blk) }));
      }
    }
    b.use('barrel');
    const mx = K.stock.muzzle, gx = Math.min(1.0, mx - 0.3), gy = (K.my = y1 + 0.04);
    for (const s of [-1, 1]) cannon(b, gx, gy, s * 0.12, mx - gx, 0.045, mix(CHROME, 0x2a2a30, 0.4), red);
    b.use('hull');
    K.parts.push(...k.parts); K.top = y1 + 0.6;
    return finish(K, { recoil: 0.18 });
  },

  // Nhện Thép, flanker: a steel spider on eight legs. A plated thorax and a big faceted abdomen of stepped octagon
  // tiers with lit strips and a spinneret, a head turret with a cluster of red eyes, a grapple launcher on each side of
  // the head (tube, cable drum, three-pronged hook), and a red scarf knotted round the neck with its tails streaming
  // back over the abdomen. I: launcher tubes, a short scarf knot. II: hooks, scarf tails. III: long tails, lit cable
  // coils, side strips, frost-red aura.
  nhenthep(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, y0 = K.g.y0, y1 = K.g.y1;
    const iron = f === 1 ? mix(paint, 0x7a7f88, 0.3) : mix(paint, CHROME, 0.3), ironD = mix(paint, deep, 0.45), scarf = f === 1 ? mix(trim, 0x8a7a78, 0.35) : C3(trim), scarfD = mix(trim, 0x3a0808, 0.45);
    const k = new OKit(b, st, trim, form, { iron: [iron, 'enamel'], ironD: [ironD, 'dark'], scarf: [scarf, 'enamel'], gun: [ironD, 'dark'], gunLite: [CHROME, 'chrome'], panel: [iron, 'enamel'], under: [0x101216, 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x0a0b0e, 'dark'] });
    b.use('hull');
    k.prism(ring(0.2, 0, 0.4, 8, 0.5, 1.15), y0 - 0.02, y0 + 0.16, 'under', 0.04);
    k.prism(ring(0.2, 0, 0.36, 8, 0.5, 1.15), y0 + 0.12, y1, 'iron', 0.06);
    const ax = -0.55;
    k.prism(ring(ax, 0, 0.46, 8, 0.5, 1.3), y0, y0 + 0.2, 'under', 0.04);
    k.prism(ring(ax, 0, 0.5, 8, 0.5, 1.3), y0 + 0.16, y1 + 0.04, 'ironD', 0.07);
    k.prism(ring(ax - 0.04, 0, 0.38, 8, 0.5, 1.3), y1 + 0.04, y1 + 0.16, 'iron', 0.04);
    if (f >= 2) k.prism(ring(ax - 0.08, 0, 0.2, 8, 0.5, 1.3), y1 + 0.16, y1 + 0.22, 'ironD', 0.02);
    k.strip(ax - 0.06, y1 + (f >= 2 ? 0.225 : 0.165), 0, f >= 2 ? 0.3 : 0.45, 'x', 'glow', 0.03);
    if (f === 3) for (const s of [-1, 1]) k.strip(ax - 0.05, y1 + 0.165, s * 0.26, 0.45, 'x', 'glow', 0.025);
    fin(b, 'chrome', CHROME); b.push().move(ax - 0.66, y0 + 0.22, 0).rotZ(PI / 2).cyl(0.06, 0.1, 0.14, 8).pop();
    // Red scarf: a band round the neck, a knot at the back, tails streaming back over the abdomen.
    fin(b, 'enamel', scarf); b.push().move(0.25, y1 + 0.04, 0).scale(1.1, 1.8, 1).geo(new THREE.TorusGeometry(0.31, 0.05, 5, 18).rotateX(PI / 2)).pop();
    b.push().move(-0.06, y1 + 0.08, 0.1).scale(1, 0.8, 1).ball(0.08, 1).pop();
    if (orn && f >= 2) {
      const L = f === 3 ? 1.05 : 0.7;
      ribbon(b, [V(-0.08, y1 + 0.08, 0.12), V(-0.3, y1 + 0.24, 0.2), V(-0.3 - 0.45 * L, y1 + 0.26, 0.3), V(-0.3 - 0.8 * L, y1 + 0.34, 0.24), V(-0.3 - 1.05 * L, y1 + 0.28, 0.42)], 0.12, scarf, scarfD);
      ribbon(b, [V(-0.08, y1 + 0.08, 0.06), V(-0.28, y1 + 0.2, -0.06), V(-0.28 - 0.4 * L, y1 + 0.24, -0.12), V(-0.28 - 0.7 * L, y1 + 0.3, -0.04), V(-0.28 - 0.85 * L, y1 + 0.24, -0.22)], 0.1, scarf, scarfD);
      if (f === 3) fireAura(b, -0.3, 1.55, 1.45, 16, 0.95, AURA.frostred);
    }
    // Head turret: faceted head, red eye cluster, grapple launchers either side.
    b.use('turret');
    const tx = 0.38;
    k.oct(tx - 0.05, y1 + 0.05, 0, 0.26, 0.08, 'under');
    const hd = [[0.26, 0.12], [0.14, 0.22], [-0.14, 0.22], [-0.2, 0.1], [-0.2, -0.1], [-0.14, -0.22], [0.14, -0.22], [0.26, -0.12]];
    k.prism(hd.map(([x, z]) => [tx + x, z]), y1 + 0.08, y1 + 0.3, 'iron', 0.05);
    k.prism(hd.map(([x, z]) => [tx + x * 0.6 - 0.04, z * 0.6]), y1 + 0.3, y1 + 0.35, 'ironD', 0.02);
    for (const s of [-1, 1]) {
      k.light(tx + 0.262, y1 + 0.22, s * 0.055, 0.03, LAMP.red, '+x');
      k.light(tx + 0.262, y1 + 0.14, s * 0.08, 0.018, LAMP.red, '+x');
      k.light(tx + 0.12, y1 + 0.305, s * 0.09, 0.018, LAMP.red, '+y');
      k.light(tx + 0.0, y1 + 0.305, s * 0.15, 0.015, LAMP.red, '+y');
      const lz = s * 0.32, ly = y1 + 0.22;
      k.blk(tx - 0.08, ly - 0.06, s * 0.24, 0.2, 0.08, 0.12, 'ironD', 0.02);
      k.use('ironD'); b.push().move(tx + 0.06, ly, lz).rotZ(-PI / 2).cyl(0.07, 0.08, 0.46, 8).pop();
      k.use('chrome'); b.push().move(tx + 0.29, ly, lz).rotZ(-PI / 2).cyl(0.085, 0.085, 0.035, 8).pop();
      k.oct(tx - 0.24, ly, lz, 0.1, 0.12, 'iron', 0.02);
      if (orn && f >= 2) {
        // Three-pronged grapple hook at the tube mouth.
        fin(b, 'chrome', CHROME); b.push().move(tx + 0.36, ly, lz).rotZ(-PI / 2).cyl(0.025, 0.025, 0.12, 6).pop();
        const g = bladeGeo({ len: f === 3 ? 0.17 : 0.14, w: 0.06, th: 0.025, wf: WF.spear, ridge: 0, seg: 4, lift: 0.8, edge: CHROME, face: 0xb8c0cc, back: 0x8a909a });
        for (let i = 0; i < 3; i++) { b.push().move(tx + 0.4, ly, lz).rotX(i * TAU / 3 + 0.3).rotZ(PI / 2 - 0.45); putK(b, g); b.pop(); }
        g.dispose();
        if (f === 3) h.lit(b, () => b.push().move(tx - 0.24, ly + 0.07, lz).geo(new THREE.TorusGeometry(0.075, 0.014, 4, 14).rotateX(PI / 2)).pop());
      }
    }
    b.use('barrel');
    const mx = K.stock.muzzle, gx = Math.min(tx + 0.24, mx - 0.3);
    K.my = y1 + 0.16;
    k.cannon(gx, K.my, 0, mx - gx - 0.04, 0.055, { col: 'iron', ribs: 3, stripe: 'glow' });
    b.use('hull');
    K.parts.push(...k.parts); K.top = y1 + 0.55;
    return finish(K, { recoil: 0.2 });
  },

  // Tào Tháo, bruiser: a black-lacquer warlord tank on gold-trimmed track pods. Lacquer plates with gold rims, a tall
  // stepped octagonal helm turret with a red visor slit and layered shoulder lames, a gold crown crest of spear points
  // (tallest at the front, a red gem at III), a pleated black cape lined red with a gold hem falling back over the
  // rear deck, and the barrel as a straight sword (Ỷ Thiên Kiếm) with a gold guard and a lit fuller.
  // I: short cape, three crown points, one shoulder lame. II: skirts, five points, cape to the rear, lit fuller.
  // III: seven tall points, gem, tassel, long flared cape, three shoulder lames, imperial aura.
  taothao(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K;
    const lac = f === 1 ? mix(paint, 0x5a5a5a, 0.3) : mix(paint, 0x1a1816, 0.4), lacD = C3(deep), gold = f === 1 ? mix(trim, 0x8a8478, 0.4) : C3(GOLD), red = C3(0x8a1414);
    const k = new OKit(b, st, trim, form, { lac: [lac, 'dark'], lacD: [mix(lacD, lac, 0.4), 'dark'], gold: [gold, 'gold'], red: [red, 'enamel'], gun: [lac, 'enamel'], gunLite: [gold, 'gold'], panel: [mix(lacD, red, 0.35), 'enamel'], panelDeep: [GOLD_DEEP, 'gold'], under: [0x0c0c12, 'dark'], steel: [GOLD_DEEP, 'gold'], chrome: [CHROME, 'chrome'], dark: [0x08080c, 'dark'] });
    b.use('hull');
    // Four track bogies (front and rear pair) with a waist between them: the warlord's chariot stance.
    for (const s of [-1, 1]) for (const [x, l] of [[0.56, 0.95], [-0.78, 0.95]]) k.trackPod(x, s * 0.68, l, 0.38, 0.58, { coverCol: 'gun', insert: null, skirt: f >= 2, skirtH: 0.36, light: x > 0 ? LAMP.red : null });
    for (const s of [-1, 1]) k.blk(-0.11, 0.42, s * 0.56, 0.5, 0.16, 0.1, 'gold', 0.03);
    k.prism([[0.8, 0.46], [1.0, 0.3], [1.0, -0.3], [0.8, -0.46], [-1.1, -0.48], [-1.22, -0.34], [-1.22, 0.34], [-1.1, 0.48]], 0.2, 0.7, 'under', 0.05);
    k.plate(-0.2, 0.76, 0, 1.8, 0.12, 1.0, { col: 'lac', insert: 'lacD' });
    k.plate(0.86, 0.6, 0, 0.42, 0.1, 0.95, { col: 'lac', insert: f >= 2 ? 'gold' : null, rz: -0.55 });
    for (const s of [-1, 1]) { k.blk(-0.15, 0.83, s * 0.5, 1.9, 0.05, 0.04, 'gold', 0.012); k.light(1.05, 0.42, s * 0.22, 0.05, LAMP.red, s > 0 ? '+z' : '-z'); }
    k.blk(-1.22, 0.6, 0, 0.12, 0.2, 0.8, 'gold', 0.03);
    if (orn) {
      // Cape: a pleated sheet from behind the helm over the rear deck, black above, red lining, gold hem.
      const CL = [0.5, 1.15, 1.35][f - 1], CW = [0.72, 1.75, 1.9][f - 1], R = 8, M = 9, rings = [];
      for (let i = 0; i <= R; i++) {
        const t = i / R, x = -0.42 - CL * t, yb = 1.2 - 0.3 * t - (x < -1.15 ? (-1.15 - x) * 0.55 : 0), hw = CW / 2 * (0.45 + 0.75 * Math.pow(t, 0.8)), top = [], bot = [];
        for (let j = 0; j < M; j++) { const u = j / (M - 1) * 2 - 1, yy = yb + 0.05 * Math.cos(u * PI * 2) * t - 0.1 * u * u; top.push(V(x, yy, u * hw)); bot.push(V(x, yy - 0.035, u * hw)); }
        rings.push(top.concat(bot.reverse()));
      }
      const g = skin(rings, { tone: (i, j) => (i === R ? C3(gold) : j < M ? lac : red) });
      put(fin(b, 'pearl'), g);
      for (const s of [-1, 1]) { fin(b, 'gold', gold); b.push().move(-0.42, 1.2, s * CW * 0.2).rotX(PI / 2).cyl(0.07, 0.07, 0.04, 10).pop(); }
      if (f === 3) fireAura(b, -0.1, 1.85, 1.35, 18, 1.0, AURA.imperial);
    }
    // Helm turret: stepped lacquer octagons with a gold band, visor slit, shoulder lames, crown crest.
    b.use('turret');
    k.oct(-0.15, 0.86, 0, 0.56, 0.08, 'under');
    k.oct(-0.15, 1.02, 0, 0.5, 0.26, 'lac', 0.05, 1.15);
    k.oct(-0.15, 1.17, 0, 0.51, 0.05, 'gold', 0.02, 1.15);
    k.oct(-0.17, 1.28, 0, 0.38, 0.18, 'lac', 0.04, 1.15);
    k.plate(0.37, 1.06, 0, 0.16, 0.3, 0.56, { col: 'lacD', insert: null, rz: -0.3 });
    k.strip(0.45, 1.12, 0, 0.36, 'z', 'glow', 0.03);
    // Shoulder guards: stacked chamfered lames rolling down and out, each with a gold edge bar.
    const np = !orn || f === 1 ? 1 : f;
    for (const s of [-1, 1]) for (let l = np - 1; l >= 0; l--) {
      b.push().move(-0.14 - l * 0.02, 1.2 - l * 0.08, s * (0.5 + l * 0.08)).rotX(s * (0.5 + l * 0.22));
      k.blk(0, 0, 0, 0.5 - l * 0.05, 0.07, 0.26, l % 2 ? 'red' : 'lac', 0.025);
      k.blk(0, 0, s * 0.135, 0.5 - l * 0.05, 0.08, 0.03, 'gold', 0.01);
      b.pop();
    }
    const cy = 1.37, cr = 0.26;
    k.oct(-0.17, cy + 0.03, 0, cr, 0.07, 'gold', 0.02, 1.1);
    if (orn) {
      const n = [3, 5, 7][f - 1], span = [0.6, 1.1, 1.5][f - 1], hk = [0.7, 1, 1.3][f - 1];
      fin(b, 'gold');
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1) * 2 - 1, a = u * span, hgt = (0.2 + 0.25 * (1 - Math.abs(u))) * hk;
        const g = bladeGeo({ len: hgt, w: 0.12, th: 0.035, wf: WF.spear, ridge: 0, seg: 4, edge: mix(GOLD, 0xffffff, 0.3), face: GOLD, face2: mix(GOLD, GOLD_DEEP, 0.4), back: GOLD_DEEP });
        b.push().move(-0.17, cy + 0.05, 0).rotY(-a).move(cr * 1.02, 0, 0).rotZ(PI / 2 - 0.22); put(b, g); b.pop();
      }
      if (f >= 2) k.lamp(LAMP.red, () => b.push().move(-0.17 + cr * 1.12, cy + 0.04, 0).ball(0.05, 1).pop());
      if (f === 3) put(fin(b, 'enamel'), tubeGeo(new THREE.CatmullRomCurve3([V(-0.42, cy + 0.06, 0), V(-0.6, cy + 0.12, 0), V(-0.78, cy - 0.02, 0), V(-0.86, cy - 0.2, 0)]).getPoints(10), (t) => 0.06 * (1 - 0.5 * t) + 0.02, { sides: 7, caps: true, tone: (t) => (t < 0.12 ? C3(gold) : red) }));
    }
    // Sword barrel: grip, gold guard, a straight double-edged blade with a lit fuller.
    b.use('barrel');
    const mx = K.stock.muzzle, gx = Math.min(0.44, mx - 0.6), gy = (K.my = 1.06), BL = mx - gx - 0.17;
    k.blk(gx - 0.02, gy, 0, 0.16, 0.16, 0.2, 'under', 0.04);
    fin(b, 'enamel', lacD); b.push().move(gx + 0.07, gy, 0).rotZ(-PI / 2).cyl(0.045, 0.045, 0.12, 8).pop();
    fin(b, 'gold', gold); b.push().move(gx + 0.15, gy, 0).chamfer(0.06, 0.08, 0.44, 0.02).pop();
    put(fin(b, 'chrome'), bladeGeo({ len: BL, w: 0.24, th: 0.05, seg: 6, wf: (t) => (t < 0.82 ? 1 - 0.2 * t : (1 - t) / 0.18 * 0.84), ridge: 0, edge: CHROME, face: mix(CHROME, 0xb8c0cc, 0.3), face2: 0xb8c0cc, back: 0xb8c0cc }).translate(gx + 0.17, gy, 0));
    if (f >= 2) k.strip(gx + 0.17 + BL * 0.42, gy + 0.03, 0, BL * 0.62, 'x', 'glow', 0.022);
    b.use('hull');
    K.parts.push(...k.parts); K.top = f === 3 ? 2.0 : 1.75;
    return finish(K, { recoil: 0.15 });
  },

  // Bọ Ngựa, flanker: a mantis on four legs. A dark green abdomen under two leaf-shaped wing cases with lime veins; on
  // the turret a raised neck (pronotum), a triangular head with big lit compound eyes at its corners and antennae, and
  // two raptorial arms raised forward, each a spined femur and a big sickle blade curling inward (the scythes are its
  // body, drawn on the bare frame too); twin short guns under the head. I: small scythes and cases. II: full cases,
  // femur spines. III: big scythes, cases parted over pale hind wings, mantis aura.
  bongua(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, y0 = K.g.y0, y1 = K.g.y1;
    const green = f === 1 ? mix(paint, 0x5a6a5e, 0.3) : mix(paint, 0x2e6a3a, 0.4), lime = f === 1 ? mix(trim, 0x8a9a80, 0.4) : C3(trim), greenD = C3(deep), wingM = mix(trim, PEARL, 0.6);
    const k = new OKit(b, st, trim, form, { green: [green, 'enamel'], greenD: [mix(green, greenD, 0.5), 'enamel'], lime: [lime, 'enamel'], wing: [wingM, 'pearl'], gun: [green, 'enamel'], gunLite: [CHROME, 'chrome'], panel: [lime, 'enamel'], under: [0x0a120c, 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x060a07, 'dark'] });
    b.use('hull');
    const ab = [[0.3, 0.3], [-0.2, 0.42], [-0.75, 0.36], [-1.1, 0.12], [-1.1, -0.12], [-0.75, -0.36], [-0.2, -0.42], [0.3, -0.3]];
    k.prism(ab, y0 - 0.02, y0 + 0.16, 'under', 0.04);
    k.prism(ab.map(([x, z]) => [x * 0.95, z * 0.95]), y0 + 0.12, y1, 'green', 0.06);
    for (const s of [-1, 1]) k.blk(-0.4, y0 + 0.2, s * 0.36, 0.9, 0.04, 0.04, 'lime', 0.01);
    // Wing cases (and pale hind wings under them at III), hinged at the front of the abdomen.
    const ek = [0.8, 1, 1.06][f - 1], sp = f === 3 ? 0.16 : 0;
    for (const s of [-1, 1]) {
      if (orn && f === 3) {
        b.push().move(0.25, y1 + 0.02, 0).rotY(-s * 0.32);
        k.prism([[0, 0.02], [-0.25, 0.48], [-0.95, 0.6], [-1.5, 0.3], [-1.55, 0.02]].map(([x, z]) => [x, z * s]), -0.015, 0.015, 'wing', 0.008);
        k.beam([-0.1, 0.03, s * 0.06], [-1.3, 0.03, s * 0.36], 0.025, 0.012, 'lime', 0.006);
        b.pop();
      }
      b.push().move(0.3, y1 + 0.05, 0).rotY(-s * sp).rotX(s * 0.14);
      k.prism([[0, 0.02], [-0.15, 0.36], [-0.7, 0.44], [-1.25, 0.26], [-1.5, 0.02]].map(([x, z]) => [x * ek, z * ek * s]), -0.03, 0.03, 'green', 0.02);
      if (orn) k.beam([-0.15 * ek, 0.035, s * 0.12 * ek], [-1.25 * ek, 0.035, s * 0.18 * ek], 0.035, 0.02, 'lime', 0.008);
      b.pop();
    }
    if (orn && f === 3) fireAura(b, -0.3, 1.55, 1.25, 16, 0.95, AURA.mantis);
    // Turret: raised neck, triangular head with compound eyes and antennae, raptorial scythe arms.
    b.use('turret');
    k.oct(0.15, y1 + 0.02, 0, 0.24, 0.08, 'under');
    k.beam([0.05, y1 + 0.08, 0], [0.72, y1 + 0.26, 0], 0.22, 0.14, 'green', 0.04);
    k.beam([0.1, y1 + 0.16, 0], [0.7, y1 + 0.33, 0], 0.07, 0.03, 'lime', 0.01);
    const head = [[1.04, 0], [0.74, 0.3], [0.66, 0.24], [0.66, -0.24], [0.74, -0.3]];
    k.prism(head, y1 + 0.2, y1 + 0.4, 'green', 0.04);
    k.prism(head.map(([x, z]) => [0.85 + (x - 0.85) * 0.6, z * 0.55]), y1 + 0.4, y1 + 0.45, 'greenD', 0.015);
    for (const s of [-1, 1]) {
      fin(b, 'enamel', lime); b.push().move(0.73, y1 + 0.33, s * 0.28).scale(1, 0.9, 0.8).ball(0.1, 1).pop();
      k.lamp('glow', () => b.push().move(0.77, y1 + 0.35, s * 0.31).ball(0.065, 1).pop());
      k.use('dark'); b.rod([0.88, y1 + 0.42, s * 0.05], [0.7, y1 + 0.8, s * 0.24], 0.013, 4);
    }
    const sc = [0.72, 1, 1.25][f - 1];
    for (const s of [-1, 1]) {
      const C = [0.68, y1 + 0.12, s * 0.22], Kn = [0.9 + 0.08 * sc, y1 + 0.28 + 0.1 * sc, s * (0.3 + 0.04 * sc)];
      k.beam([0.55, y1 + 0.2, s * 0.08], C, 0.09, 0.09, 'greenD', 0.025);
      k.beam(C, Kn, 0.11 * sc, 0.13 * sc, 'green', 0.03);
      if (orn && f >= 2) for (let i = 1; i <= 3; i++) { const t = i / 4; k.use('chrome'); b.push().move(lerp(C[0], Kn[0], t), lerp(C[1], Kn[1], t) - 0.03, lerp(C[2], Kn[2], t) - s * 0.06 * sc).rotX(s * PI / 2).cyl(0, 0.025, 0.09 * sc, 4).pop(); }
      const g = bladeGeo({ len: 0.72 * sc, w: 0.2 * sc, th: 0.035, wf: WF.spar, ridge: -0.3, seg: 7, sweep: -0.55, lift: -0.12, edge: CHROME, face: mix(lime, 0xffffff, 0.3), face2: lime, back: greenD, mz: s < 0 });
      at(b, s, [Kn[0], Kn[1], Math.abs(Kn[2])], [0, -0.25, -0.2], () => put(fin(b, 'enamel'), g));
    }
    b.use('barrel');
    const mx = K.stock.muzzle, gx = Math.min(0.92, mx - 0.25), gy = (K.my = y1 + 0.22);
    for (const s of [-1, 1]) cannon(b, gx, gy, s * 0.07, mx - gx, 0.035, CHROME, lime);
    b.use('hull');
    K.parts.push(...k.parts); K.top = y1 + 0.8;
    return finish(K, { recoil: 0.15 });
  },
};
