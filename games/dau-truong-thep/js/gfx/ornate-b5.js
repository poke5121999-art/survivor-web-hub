// Ornate batch 5 (dtt-restyle): Hoa Mộc Lan, An Dương Vương, Chuột Túi, Ve Sầu, Bạch Hạc, Đom Đóm.
// Same construction as ornate.js and ornate-b1..b3: the chunky plated steel base (OKit) in polished finishes, then one
// or two big motif structures per tank (fish-scale skirts, hair ribbons and crossed sabers; a bronze drum hull under a
// great crossbow; a belly pouch with a lid, big ears and spring legs; long veined cicada panes with clock dials; broad
// crane wings with black-tipped primaries; firefly wing cases over a caged lantern abdomen), each with its own form III
// aura ramp. Forms: I plain plates; II armour and the motif at mid size; III the full motif and the aura. Running gear,
// ride height and muzzle come from each tank's frame spec; Bạch Hạc and Đom Đóm have hand designs and no frame spec,
// so they keep that design's muzzle, hover and part names (STOCK below). Models face +x, +z is the right side, the
// ground is y = 0.
import * as THREE from '../../vendor/three.module.min.js';
import { LAMP } from './steel.js';
import { OKit, start, finish, fin, put, mix, C3, cannon, fireAura, tubeGeo, bladeGeo, wingPanel, WF, GOLD, GOLD_DEEP, CHROME, PEARL, DARKM } from './ornate.js';

const PI = Math.PI, TAU = PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (a, b, c) => [[0, new THREE.Color(...a)], [0.4, new THREE.Color(...b)], [1, new THREE.Color(...c)]];
// One aura ramp per tank of this batch (root, middle, tip), none shared with ornate.js, batches 1-4 or each other.
const AURA = {
  plum: ramp([1.0, 0.97, 0.93], [1.0, 0.6, 0.66], [0.62, 0.05, 0.16]), // plum blossom: white, petal pink, crimson tips
  bronze: ramp([1.0, 0.86, 0.52], [0.78, 0.42, 0.16], [0.04, 0.3, 0.24]), // drum bronze: copper to verdigris
  gadget: ramp([1.0, 0.97, 0.62], [0.28, 0.9, 1.0], [0.55, 0.05, 0.14]), // toy pop: lemon root, aqua, cherry tips
  clock: ramp([1.0, 0.86, 0.46], [0.72, 0.2, 0.5], [0.1, 0.04, 0.42]), // sand-gold root, rose-violet, deep violet
  crane: ramp([1.0, 1.0, 0.98], [0.42, 0.88, 0.76], [0.52, 0.04, 0.08]), // white, celadon, crane-crown red tips
  firefly: ramp([1.0, 1.0, 0.76], [0.86, 1.0, 0.3], [0.08, 0.16, 0.45]), // lantern light into night blue
};

// Stock contract of the two hand designs (mechs.js hac, mechs-b.js domdom) the ornate forms replace. Đom Đóm drops
// the hand design's 3.4 m lantern mast (the lantern is now its abdomen), so its HP bar height comes down with it.
const STOCK = {
  hac: { muzzle: 0.98, muzzleY: 1.18, S: 1, height: 1.8, hover: true },
  domdom: { muzzle: 0.95, muzzleY: 1.26, S: 0.95, height: 2.0, hover: true },
};
function startHand(key, b, form) {
  const f = Math.max(1, Math.min(3, form | 0 || 2));
  b.use('hull');
  return { F: { S: STOCK[key].S }, orn: true, f, stock: STOCK[key], g: { legs: [], parts: [] }, parts: [], top: 1.5 };
}

const ngon = (r, n, ph = 0, rz = r, cx = 0) => { const o = []; for (let i = 0; i < n; i++) { const a = ph + i / n * TAU; o.push([cx + Math.cos(a) * r, Math.sin(a) * rz]); } return o; };
const scl = (P, k, c = [0, 0]) => P.map(([x, z]) => [c[0] + (x - c[0]) * k, c[1] + (z - c[1]) * k]);
const cen = (P) => P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length], [0, 0]);
const rrect = (l, w, c, cx = 0) => [[cx + l, w - c], [cx + l - c, w], [cx - l + c, w], [cx - l, w - c], [cx - l, -w + c], [cx - l + c, -w], [cx + l - c, -w], [cx + l, -w + c]];
const hexP = (l, w) => [[l, w * 0.28], [l * 0.45, w], [-l * 0.55, w], [-l, w * 0.55], [-l, -w * 0.55], [-l * 0.55, -w], [l * 0.45, -w], [l, -w * 0.28]];

// ---------- shared pieces of this batch ----------
// Hover pod: an octagonal housing with a rim, a lit ring and a downward thruster flame; y = hull underside.
function hoverPod(h, k, b, x, y, z, r, rim) {
  k.oct(x, y - 0.07, z, r * 1.1, 0.14, 'under', 0.03);
  k.oct(x, y - 0.01, z, r * 1.22, 0.04, rim, 0.012);
  h.lit(b, () => b.push().move(x, y - 0.15, z).cyl(r * 0.8, r * 0.8, 0.02, 10).pop());
  h.flame(b, () => b.push().move(x, y - 0.33, z).cyl(r * 0.85, r * 0.15, 0.3, 8).pop());
}
// Layered wing panel in the current frame (x back/forward, z outward for s = 1, y up): a rim outline with the pane
// stepped up inside it (and a third, lighter inner pane toward the root when deep = 3).
function layered(k, s, P, y, cols, deep = 2) {
  const Z = (Q) => Q.map(([x, z]) => [x, s * z]);
  k.prism(Z(P), y, y + 0.03, cols[0], 0.01);
  if (deep > 1) k.prism(Z(scl(P, 0.84, cen(P))), y + 0.022, y + 0.05, cols[1], 0.01);
  if (deep > 2) k.prism(Z(scl(P, 0.55, [cen(P)[0] * 0.65, cen(P)[1] * 0.65])), y + 0.045, y + 0.068, cols[2], 0.01);
}
// Plum blossom lying in the current frame's XZ plane, facing +y: five round petals, a gold heart and stamen dots.
function blossom(b, r, petal, heart = GOLD) {
  fin(b, 'enamel', petal);
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + PI / 2; b.push().move(Math.cos(a) * r * 0.55, 0, Math.sin(a) * r * 0.55).scale(1.05, 1, 1.05).cyl(r * 0.46, r * 0.46, 0.04, 8).pop(); }
  fin(b, 'gold', heart); b.push().move(0, 0.025, 0).cyl(r * 0.24, r * 0.28, 0.05, 8).pop();
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; b.push().move(Math.cos(a) * r * 0.3, 0.05, Math.sin(a) * r * 0.3).cyl(0.018, 0.018, 0.05, 4).pop(); }
}
// Clock dial lying in the current frame's XZ plane, facing +y: gold bezel, cream face, four hour bars, two hands
// (at angles a1, a2 from +x), a lit centre pin.
function clockFace(k, b, r, a1, a2) {
  fin(b, 'gold', GOLD); b.cyl(r, r, 0.03, 16);
  fin(b, 'pearl', 0xf6ecd4); b.push().move(0, 0.012, 0).cyl(r * 0.84, r * 0.84, 0.03, 16).pop();
  fin(b, 'dark', DARKM);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; b.push().move(Math.cos(a) * r * 0.66, 0.03, Math.sin(a) * r * 0.66).rotY(-a).box(r * 0.22, 0.012, r * 0.08).pop(); }
  for (const [a, l, w] of [[a1, 0.62, 0.09], [a2, 0.42, 0.13]]) b.push().rotY(-a).move(r * l / 2, 0.034, 0).box(r * l, 0.014, r * w).pop();
  k.lamp('glow', () => b.push().move(0, 0.04, 0).cyl(r * 0.1, r * 0.1, 0.02, 8).pop());
}
// Coil spring along +y from (x, y, z), height hh, coil radius R, wire radius w.
function coil(b, x, y, z, hh, R, w, turns = 3.5) {
  const P = [], n = Math.round(turns * 8);
  for (let i = 0; i <= n; i++) { const t = i / n, a = t * turns * TAU; P.push(V(x + Math.cos(a) * R, y + hh * t, z + Math.sin(a) * R)); }
  put(b, tubeGeo(P, () => w, { sides: 5, caps: true }));
}
// Sword along +x from the origin: pommel, grip, guard, a forged single-edged blade; blade face up.
function saber(b, len, o = {}) {
  const gold = o.gold ?? GOLD, w = o.w ?? 0.12;
  fin(b, 'gold', gold); b.ball(w * 0.32, 1);
  fin(b, 'enamel', o.grip ?? 0x4a1018); b.push().move(len * 0.09, 0, 0).rotZ(-PI / 2).cyl(w * 0.2, w * 0.2, len * 0.16, 6).pop();
  fin(b, 'gold', gold); b.push().move(len * 0.18, 0, 0).rotZ(-PI / 2).cyl(w * 0.9, w * 0.9, 0.04, 8).pop();
  put(fin(b, 'chrome'), bladeGeo({ len: len * 0.8, w, th: w * 0.26, wf: (t) => (t < 0.7 ? 1 - 0.1 * t : (1 - t) / 0.3 * 0.93), ridge: 0.4, sweep: 0.06, seg: 6, edge: CHROME, face: CHROME, face2: 0xaeb8c8, back: 0xaeb8c8 }).translate(len * 0.2, 0, 0));
}

export const B5 = {
  // Hoa Mộc Lan, bruiser: a crimson war chariot on four wheels. A hex hull of lacquered plates with a gold deck, fish-
  // scale skirts (rows of overlapping round scales, gold rows over crimson) on both flanks, a plum blossom on the
  // glacis, a stepped helmet turret with a gold visor and a crest plate, two long hair ribbons streaming back from the
  // helmet, and her two sabers crossed on the rear deck. I: plain plates, short ribbons. II: scales, blossom, crest,
  // sabers. III: a third scale row, blossoms on the helmet and rear corners, long ribbons, the plum aura.
  moclan(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, { paint, trim, F: { fenders: false } }), { f, orn } = K, red = C3(paint), gold = f === 1 ? mix(trim, 0x8a8a90, 0.4) : C3(trim), dred = C3(deep), pink = C3(st.glow);
    const k = new OKit(b, st, trim, form, { red: [red, 'enamel'], redL: [mix(red, 0xff8a8a, 0.25), 'enamel'], redD: [mix(red, dred, 0.5), 'enamel'], gold: [gold, 'gold'], gun: [red, 'enamel'], gunLite: [gold, 'gold'], panel: [gold, 'gold'], under: [mix(dred, 0x0a0406, 0.4), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x140608, 'dark'] });
    const y0 = K.g.y0, y1 = K.g.y1, petal = mix(PEARL, pink, 0.55);
    b.use('hull');
    k.prism(hexP(0.96, 0.44), y0, y0 + 0.2, 'under', 0.04);
    k.prism(hexP(1.0, 0.5), y0 + 0.16, y1, 'red', 0.06);
    k.prism(scl(hexP(1.0, 0.5), 0.76, [-0.05, 0]), y1 - 0.01, y1 + 0.05, f === 1 ? 'redD' : 'gold', 0.015);
    k.plate(0.8, y1 - 0.06, 0, 0.34, 0.08, 0.5, { col: 'redL', insert: null, rz: -0.5 });
    for (const s of [-1, 1]) {
      k.light(1.0, y0 + 0.24, s * 0.12, 0.04, LAMP.amber, '+x');
      k.blk(-0.98, y0 + 0.32, s * 0.2, 0.12, 0.14, 0.16, 'gold', 0.03);
      h.flame(b, () => b.push().move(-1.12, y0 + 0.32, s * 0.2).rotZ(PI / 2).cyl(0.06, 0.015, 0.22, 8).pop());
    }
    // Wheel arches: a lacquered plate over each wheel with a gold lip (the frame's own fenders are off).
    for (const s of [-1, 1]) for (const x of [-0.66, 0.66]) {
      k.plate(x, 0.8, s * 0.69, 0.84, 0.08, 0.38, { col: 'red', insert: null, rx: s * 0.12 });
      k.blk(x, 0.75, s * 0.89, 0.8, 0.05, 0.05, 'gold', 0.015);
    }
    if (orn && f >= 2) {
      // Fish-scale skirts hung outside the wheels: rows of round scales, each row stepped out over the one above,
      // gold rows over crimson.
      const rows = f === 2 ? 2 : 3;
      for (const s of [-1, 1]) for (let r = 0; r < rows; r++) {
        k.use(r % 2 ? 'redL' : 'gold');
        for (let i = 0; i < 7; i++) {
          const x = 0.78 - i * 0.26 + (r % 2) * 0.13;
          b.push().move(x, 0.68 - r * 0.15, s * (0.9 + r * 0.025)).rotX(PI / 2 + s * 0.12).cyl(0.15, 0.15, 0.035, 8).pop();
        }
      }
      b.push().move(0.8, y1 - 0.0, 0).rotZ(-0.5); blossom(b, f === 3 ? 0.22 : 0.18, petal); b.pop();
    }
    if (orn && f >= 2) {
      // Her two sabers crossed on the rear deck, hilts aft.
      const L = f === 2 ? 1.1 : 1.3;
      for (const s of [-1, 1]) { b.push().move(-0.66, y1 + 0.09 + (s > 0 ? 0.035 : 0), 0).rotY(s * 0.55).move(-L * 0.45, 0, 0); saber(b, L, { gold: GOLD, w: f === 3 ? 0.14 : 0.12 }); b.pop(); }
    }
    if (orn && f === 3) {
      for (const s of [-1, 1]) { b.push().move(-0.86, y1 + 0.07, s * 0.36); blossom(b, 0.16, petal); b.pop(); }
      fireAura(b, -0.1, 1.55, 1.2, 16, 0.95, AURA.plum);
    }
    // Helmet turret: stepped octagons, a gold visor, a crest plate, eyes; ribbons from the back of the helmet.
    b.use('turret');
    const tx = -0.05, ty = y1 + 0.06;
    k.oct(tx, ty, 0, 0.42, 0.08, 'under');
    k.oct(tx, ty + 0.15, 0, 0.38, 0.22, 'red', 0.05, 1.1);
    k.oct(tx, ty + 0.3, 0, 0.28, 0.1, f === 1 ? 'redD' : 'gold', 0.03, 1.1);
    k.oct(tx - 0.02, ty + 0.39, 0, 0.16, 0.08, 'red', 0.02);
    k.prism([[tx + 0.52, 0.16], [tx + 0.52, -0.16], [tx + 0.26, -0.34], [tx + 0.26, 0.34]], ty + 0.07, ty + 0.13, 'gold', 0.015);
    for (const s of [-1, 1]) k.light(tx + 0.38, ty + 0.2, s * 0.14, 0.035, 'glow', '+x');
    if (orn && f >= 2) {
      const ch = f === 2 ? 0.26 : 0.38;
      k.profile([[tx + 0.3, ty + 0.32], [tx + 0.06, ty + 0.32], [tx - 0.04, ty + 0.32 + ch], [tx + 0.18, ty + 0.32 + ch * 0.82], [tx + 0.36, ty + 0.32 + ch * 0.45]], -0.025, 0.025, 'gold', 0.012);
      if (f === 3) for (const s of [-1, 1]) { b.push().move(tx + 0.05, ty + 0.2, s * 0.4).rotX(s * 1.2); blossom(b, 0.13, petal); b.pop(); }
    }
    if (orn) {
      const rl = [0.45, 0.85, 1.2][f - 1];
      for (const s of [-1, 1]) {
        const P = [V(tx - 0.3, ty + 0.36, s * 0.08), V(tx - 0.5, ty + 0.3, s * 0.14), V(tx - 0.5 - 0.35 * rl, ty + 0.16, s * (0.17 + 0.12 * rl)), V(tx - 0.5 - 0.7 * rl, ty + 0.08, s * (0.12 + 0.3 * rl)), V(tx - 0.5 - rl, ty + 0.02, s * (0.24 + 0.36 * rl))];
        put(fin(b, 'enamel'), tubeGeo(new THREE.CatmullRomCurve3(P).getPoints(14), (t) => 0.1 * (1 - 0.25 * t) + 0.015, { sides: 4, flatN: 0.22, caps: true, tone: (t) => (t > 0.86 ? C3(gold) : t > 0.5 ? mix(red, pink, 0.35) : red) }));
      }
      k.oct(tx - 0.3, ty + 0.36, 0, 0.1, 0.08, 'gold', 0.02);
    }
    b.use('barrel');
    K.my = ty + 0.17;
    k.blk(tx + 0.44, K.my, 0, 0.16, 0.16, 0.22, 'gold', 0.03);
    cannon(b, tx + 0.48, K.my, 0, K.stock.muzzle - tx - 0.48, 0.06, CHROME, f === 1 ? GOLD_DEEP : GOLD);
    b.use('hull');
    K.parts.push(...k.parts); K.top = ty + (f === 3 ? 1.0 : 0.8);
    return finish(K, { recoil: 0.22 });
  },

  // An Dương Vương, sniper: a round Đông Sơn bronze drum on two track pods carrying a great crossbow. The drum face is
  // stepped rings round a gold sun star, with Lạc birds flying round the ring; the crossbow turret has a green-lacquered
  // stock with gold bands, recurved limbs spanning the hull, a lit bowstring, a golden turtle-claw lock gripping the
  // string and a bronze-headed bolt as the barrel. I: short limbs, plain star. II: birds, claw lock, turtle-shell butt.
  // III: widest limbs, a bolt magazine on the stock, bronze frogs on the drum rim, the bronze aura.
  anduong(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K, bronze = f === 1 ? mix(paint, 0x8a8a90, 0.35) : mix(paint, 0xc8963a, 0.35), green = C3(trim), dk = C3(deep);
    const k = new OKit(b, st, trim, form, { bronze: [bronze, 'gold'], bronzeL: [mix(bronze, 0xf2d08a, 0.3), 'gold'], bronzeD: [mix(bronze, dk, 0.45), 'gold'], green: [green, 'enamel'], greenD: [mix(green, dk, 0.5), 'enamel'], gold: [GOLD, 'gold'], gun: [green, 'enamel'], gunLite: [GOLD, 'gold'], panel: [bronze, 'gold'], under: [mix(dk, 0x080604, 0.4), 'dark'], steel: [GOLD_DEEP, 'gold'], chrome: [CHROME, 'chrome'], dark: [0x0e0a06, 'dark'] });
    b.use('hull');
    for (const s of [-1, 1]) k.trackPod(-0.05, s * 0.84, 1.55, 0.3, 0.55, { coverCol: 'green', insert: null, skirt: f >= 2, skirtH: 0.3, light: LAMP.amber });
    const D = (r) => ngon(r, 16, PI / 16);
    k.prism(D(0.84), 0.22, 0.52, 'under', 0.04);
    k.prism(D(0.92), 0.48, 0.8, 'bronze', 0.05);
    k.prism(D(0.95), 0.58, 0.66, 'bronzeD', 0.015);
    k.prism(D(0.88), 0.79, 0.84, 'bronzeL', 0.015);
    k.prism(D(0.72), 0.83, 0.86, 'bronzeD', 0.01);
    k.prism(D(0.6), 0.85, 0.88, 'bronzeL', 0.01);
    const star = []; const sn = f === 1 ? 8 : 12, so = f === 1 ? 0.38 : 0.5;
    for (let i = 0; i < sn * 2; i++) { const a = i / (sn * 2) * TAU, r = i % 2 ? 0.17 : so; star.push([Math.cos(a) * r, Math.sin(a) * r]); }
    k.prism(star, 0.87, 0.92, f === 1 ? 'bronzeD' : 'gold', 0.01);
    for (const s of [-1, 1]) k.light(0.93, 0.66, s * 0.22, 0.04, LAMP.amber, '+x');
    if (orn && f >= 2) {
      // Lạc birds flying round the ring (long beak, swept wings), heading anticlockwise.
      const bird = [[0.17, 0], [0.04, 0.025], [0.0, 0.11], [-0.05, 0.03], [-0.13, 0.055], [-0.1, 0], [-0.13, -0.055], [-0.05, -0.03], [0.0, -0.11], [0.04, -0.025]];
      const n = f === 2 ? 4 : 6;
      for (let i = 0; i < n; i++) {
        const a = (i + 0.5) / n * TAU, hd = a + PI / 2, c = Math.cos(hd), sn2 = Math.sin(hd), px = Math.cos(a) * 0.66, pz = Math.sin(a) * 0.66;
        k.prism(bird.map(([x, z]) => [px + x * c - z * sn2, pz + x * sn2 + z * c]), 0.875, 0.905, 'gold', 0.006);
      }
    }
    if (orn && f === 3) {
      // Bronze frogs squatting on the drum rim.
      for (let i = 0; i < 4; i++) {
        const a = PI / 4 + i * PI / 2, x = Math.cos(a) * 0.82, z = Math.sin(a) * 0.82;
        k.oct(x, 0.88, z, 0.085, 0.08, 'greenD', 0.025);
        k.oct(x + Math.cos(a) * 0.02, 0.94, z + Math.sin(a) * 0.02, 0.05, 0.06, 'bronzeL', 0.015);
      }
      fireAura(b, 0, 1.65, 1.6, 16, 0.95, AURA.bronze);
    }
    // Crossbow turret: post, stock, gold bands, recurved limbs, lit string, turtle-claw lock.
    b.use('turret');
    const sy = 1.16, sp = [0.75, 1.0, 1.2][f - 1];
    k.oct(-0.05, 0.93, 0, 0.24, 0.1, 'under');
    k.oct(-0.05, 1.02, 0, 0.19, 0.1, 'bronze', 0.03);
    k.beam([-0.72, sy, 0], [0.95, sy + 0.02, 0], 0.22, 0.14, 'green', 0.03);
    k.blk(-0.78, sy - 0.02, 0, 0.14, 0.2, 0.28, 'bronze', 0.03);
    for (const x of [-0.4, 0.45, 0.85]) k.blk(x, sy + 0.01, 0, 0.05, 0.17, 0.25, 'gold', 0.015);
    const tips = [];
    for (const s of [-1, 1]) {
      const P = [V(0.82, sy + 0.02, 0), V(0.78, sy + 0.04, s * sp * 0.45), V(0.62, sy + 0.06, s * sp * 0.8), V(0.42, sy + 0.08, s * sp * 0.98), V(0.48, sy + 0.1, s * sp * 1.08)];
      put(fin(b, 'enamel'), tubeGeo(new THREE.CatmullRomCurve3(P).getPoints(12), (t) => 0.075 * (1 - 0.55 * t) + 0.014, { sides: 6, caps: true, tone: (t) => (t < 0.1 || t > 0.88 ? C3(GOLD) : t > 0.4 && t < 0.46 ? C3(GOLD) : green) }));
      tips.push(P[4]);
    }
    const nut = [0.02, sy + 0.1, 0];
    k.lamp('glow', () => { for (const T of tips) b.rod([T.x, T.y, T.z], nut, 0.014, 4); });
    k.blk(-0.1, sy + 0.1, 0, 0.2, 0.08, 0.2, f === 1 ? 'bronzeD' : 'gold', 0.025);
    if (orn && f >= 2) {
      // Golden turtle claw: three talons hooked over the string at the nut.
      for (const dz of [-0.07, 0, 0.07]) put(fin(b, 'gold', GOLD), tubeGeo([V(-0.12, sy + 0.12, dz), V(-0.02, sy + 0.24, dz * 1.1), V(0.08, sy + 0.22, dz * 1.05), V(0.11, sy + 0.12, dz)], (t) => 0.034 * (1 - 0.75 * t) + 0.006, { sides: 6, caps: true }));
      // Turtle-shell plate on the butt: a gold hex with a green inset.
      k.prism(ngon(0.17, 6, 0, 0.15, -0.55), sy + 0.06, sy + 0.12, 'gold', 0.02);
      k.prism(ngon(0.09, 6, 0, 0.08, -0.55), sy + 0.11, sy + 0.14, 'greenD', 0.01);
    }
    if (orn && f === 3) {
      k.blk(0.38, sy + 0.18, 0, 0.42, 0.13, 0.22, 'bronze', 0.03);
      for (const dz of [-0.06, 0, 0.06]) k.lamp('glow', () => b.push().move(0.6, sy + 0.18, dz).rotZ(-PI / 2).cyl(0.012, 0.03, 0.06, 4).pop());
    }
    // Bolt: chrome shaft from the string to the muzzle, bronze head, gold fletching.
    b.use('barrel');
    K.my = sy + 0.1;
    const x0 = 0.04, x1 = K.stock.muzzle - 0.22;
    fin(b, 'chrome', CHROME); b.push().move((x0 + x1) / 2, K.my, 0).rotZ(-PI / 2).cyl(0.026, 0.026, x1 - x0, 6).pop();
    put(fin(b, 'gold'), bladeGeo({ len: 0.24, w: 0.13, th: 0.04, wf: WF.spear, ridge: 0, edge: GOLD, face: bronze, face2: mix(bronze, 0x000000, 0.25), back: bronze }).translate(x1 - 0.02, K.my, 0));
    for (const r of [0, PI / 2]) { b.push().move(x0 + 0.04, K.my, 0).rotX(r); put(fin(b, 'gold'), bladeGeo({ len: 0.18, w: 0.09, th: 0.015, wf: WF.petal, edge: GOLD, face: GOLD, back: GOLD_DEEP })); b.pop(); }
    b.use('hull');
    K.parts.push(...k.parts); K.top = f === 3 ? 1.9 : 1.6;
    return finish(K, { recoil: 0.3 });
  },

  // Chuột Túi, support: a tan roo-mouse buggy on four wheels. A rounded chunky body with a cream belly pouch bulging
  // at the front (lid hinged open from II, the inside lit with gadgets poking out), a round head turret with a cream
  // snout, big round ears splayed out, hind haunches on coil-spring legs with long feet, and a thick tail resting on
  // the ground. I: lid shut, small ears, no springs. II: open lid, gadgets, big ears, springs, tail.
  // III: bigger ears with gold rims, a tool satchel on the back, the gadget aura.
  chuottui(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, { paint, trim, F: { fenders: false } }), { f, orn } = K, tan = C3(paint), cream = C3(trim), brown = C3(deep), cyan = C3(st.glow);
    const k = new OKit(b, st, trim, form, { tan: [f === 1 ? mix(tan, 0x8a8a90, 0.35) : tan, 'enamel'], tanD: [mix(tan, brown, 0.5), 'enamel'], cream: [cream, 'pearl'], nose: [0xd0506a, 'enamel'], cherry: [0xd8283a, 'enamel'], gold: [GOLD, 'gold'], gun: [tan, 'enamel'], gunLite: [GOLD, 'gold'], panel: [cream, 'pearl'], under: [mix(brown, 0x0a0604, 0.45), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x120c08, 'dark'] });
    const y0 = K.g.y0, y1 = K.g.y1;
    b.use('hull');
    k.prism(rrect(0.88, 0.46, 0.16), y0, y0 + 0.2, 'under', 0.04);
    k.prism(rrect(0.92, 0.52, 0.22), y0 + 0.16, y1, 'tan', 0.08);
    k.prism(rrect(0.42, 0.3, 0.12, -0.45), y1 - 0.01, y1 + 0.04, 'tanD', 0.015);
    // Belly pouch: a cream bulge on the front with a brown lip; the lid hinged at its front edge.
    const pouch = [[0.72, 0.38], [0.98, 0.32], [1.1, 0.16], [1.13, 0], [1.1, -0.16], [0.98, -0.32], [0.72, -0.38]];
    k.prism(pouch, y0 + 0.08, y1 - 0.06, 'cream', 0.06);
    k.prism(scl(pouch, 1.03, [0.85, 0]), y1 - 0.08, y1 - 0.03, 'tanD', 0.015);
    for (const s of [-1, 1]) k.light(1.05, y0 + 0.24, s * 0.22, 0.035, LAMP.white, '+x');
    // Rounded wheel arches with a cream lip (the frame's own fenders are off).
    for (const s of [-1, 1]) for (const x of [-0.575, 0.575]) {
      k.plate(x, 0.84, s * 0.74, 0.86, 0.1, 0.38, { col: 'tan', insert: null, rx: s * 0.15 });
      k.blk(x, 0.79, s * 0.94, 0.8, 0.06, 0.05, 'cream', 0.02);
    }
    if (orn && f >= 2) {
      k.lamp('glow', () => b.push().move(0.93, y1 - 0.03, 0).scale(1, 1, 1.9).cyl(0.13, 0.13, 0.02, 10).pop());
      k.plate(1.04, y1 + 0.1, 0, 0.32, 0.05, 0.66, { col: 'cream', insert: null, rz: -1.0 });
      k.blk(1.1, y1 - 0.02, 0, 0.06, 0.05, 0.5, 'gold', 0.015);
      // Gadgets: an antenna bulb and a cherry ball, a spanner at III.
      k.use('dark'); b.rod([0.88, y1 - 0.04, 0.14], [0.86, y1 + 0.32, 0.18], 0.018, 5);
      k.lamp('glow', () => b.push().move(0.86, y1 + 0.34, 0.18).ball(0.05, 1).pop());
      k.use('cherry'); b.push().move(0.92, y1 + 0.04, -0.14).ball(0.08, 1).pop();
      if (f === 3) { k.beam([0.84, y1 - 0.02, -0.02], [0.82, y1 + 0.26, -0.04], 0.05, 0.03, 'chrome', 0.01); k.oct(0.82, y1 + 0.28, -0.04, 0.05, 0.04, 'chrome', 0.01); }
    } else k.plate(0.92, y1 - 0.02, 0, 0.34, 0.05, 0.62, { col: 'cream', insert: null });
    if (orn && f >= 2) {
      // Hind haunches on coil springs, long feet on the ground behind the rear wheels; a thick tail.
      for (const s of [-1, 1]) {
        k.plate(-0.72, y1 - 0.14, s * 0.55, 0.52, 0.34, 0.14, { col: 'tan', insert: null, rx: s * 0.18 });
        k.beam([-0.82, y1 - 0.18, s * 0.55], [-1.08, y0 + 0.36, s * 0.47], 0.15, 0.14, 'tanD', 0.03);
        fin(b, 'chrome', CHROME); coil(b, -1.1, 0.12, s * 0.47, y0 + 0.26 - 0.12, 0.085, 0.022);
        k.blk(-1.1, y0 + 0.32, s * 0.47, 0.18, 0.06, 0.18, 'gold', 0.02);
        k.blk(-0.98, 0.06, s * 0.47, 0.5, 0.08, 0.17, 'tanD', 0.03);
        k.blk(-0.74, 0.07, s * 0.47, 0.08, 0.09, 0.19, 'cream', 0.02);
      }
      const tl = f === 2 ? 0.55 : 0.68;
      const TP = new THREE.CatmullRomCurve3([V(-0.88, y0 + 0.36, 0), V(-1.1, y0 + 0.22, 0), V(-1.12 - 0.4 * tl, 0.24, 0), V(-1.12 - 0.78 * tl, 0.12, 0)]).getPoints(12);
      put(fin(b, 'enamel'), tubeGeo(TP, (t) => 0.15 * (1 - 0.75 * t) + 0.025, { sides: 7, caps: true, tone: (t) => (t > 0.82 ? mix(tan, brown, 0.6) : tan) }));
    }
    if (orn && f === 3) {
      k.plate(-0.66, y1 + 0.12, 0, 0.36, 0.2, 0.56, { col: 'tanD', insert: 'cream' });
      k.blk(-0.66, y1 + 0.24, 0, 0.08, 0.06, 0.4, 'gold', 0.015);
      fireAura(b, -0.1, 1.6, 1.25, 16, 0.95, AURA.gadget);
    }
    // Head turret: round head, cream snout and nose, lamp eyes, big round ears.
    b.use('turret');
    const hx = -0.15, hy = y1 + 0.04;
    k.oct(hx, hy, 0, 0.34, 0.08, 'under');
    k.prism(ngon(0.33, 10, PI / 10, 0.31, hx), hy + 0.04, hy + 0.36, 'tan', 0.08);
    k.prism(ngon(0.24, 10, PI / 10, 0.22, hx - 0.03), hy + 0.35, hy + 0.4, 'tanD', 0.02);
    k.prism([[hx + 0.52, 0.06], [hx + 0.47, 0.13], [hx + 0.2, 0.19], [hx + 0.2, -0.19], [hx + 0.47, -0.13], [hx + 0.52, -0.06]], hy + 0.08, hy + 0.27, 'cream', 0.05);
    k.blk(hx + 0.52, hy + 0.24, 0, 0.07, 0.07, 0.1, 'nose', 0.02);
    for (const s of [-1, 1]) k.light(hx + 0.27, hy + 0.31, s * 0.13, 0.035, 'glow', '+x');
    const er = orn ? [0.22, 0.32, 0.38][f - 1] : 0.24;
    for (const s of [-1, 1]) {
      b.push().move(hx - 0.12, hy + 0.36 + er * 0.35, s * (0.2 + er * 0.75)).rotX(s * 0.5).rotZ(0.4);
      k.use('tan'); b.cyl(er, er, 0.06, 14);
      k.use('cream'); b.push().move(0, 0.035, 0).cyl(er * 0.7, er * 0.7, 0.02, 14).pop();
      if (orn && f === 3) { fin(b, 'gold', GOLD); b.geo(new THREE.TorusGeometry(er, 0.022, 4, 20).rotateX(PI / 2)); }
      b.pop();
    }
    b.use('barrel');
    K.my = hy + 0.15;
    cannon(b, hx + 0.48, K.my, 0, K.stock.muzzle - hx - 0.48, 0.055, CHROME, f === 1 ? GOLD_DEEP : cyan);
    k.lamp('glow', () => b.push().move(K.stock.muzzle - 0.02, K.my, 0).rotZ(PI / 2).cyl(0.06, 0.06, 0.02, 10).pop());
    b.use('hull');
    K.parts.push(...k.parts); K.top = hy + (f === 3 ? 1.0 : 0.8);
    return finish(K, { recoil: 0.15 });
  },

  // Ve Sầu, support: a wine-dark cicada on six legs. A broad thorax with a crimson pronotum collar, an abdomen trailing
  // aft, a wide cicada head turret with big wide-set compound eyes and three ocelli, a lace ruff of crimson and cream
  // scallops round the neck, and per side a long forewing over a hindwing as clear veined panes (dark rim, glassy
  // pane, leading vein and cross veins) laid back like a roof, a clock dial set in each forewing.
  // I: short panes folded tight. II: longer panes, veins, clocks, ruff. III: panes opened out, hindwing clocks, the
  // clock aura.
  vesau(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, wine = C3(paint), crimson = f === 1 ? mix(trim, 0x8a8a90, 0.4) : C3(trim), dk = C3(deep);
    const pane = mix(0xd8f2f0, st.glow, 0.12);
    const k = new OKit(b, st, trim, form, { wine: [mix(wine, 0x6a3a50, 0.25), 'enamel'], wineD: [wine, 'enamel'], crimson: [crimson, 'enamel'], lace: [mix(PEARL, 0xf2d8d8, 0.3), 'pearl'], gold: [GOLD, 'gold'], vein: [mix(dk, 0x3a1020, 0.4), 'dark'], pane: [pane, 'pearl'], pane2: [mix(pane, 0xb8c8d8, 0.3), 'pearl'], gun: [wine, 'enamel'], gunLite: [GOLD, 'gold'], panel: [crimson, 'enamel'], under: [mix(dk, 0x050204, 0.3), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x0a0406, 'dark'] });
    const y0 = K.g.y0, y1 = K.g.y1;
    b.use('hull');
    k.prism(ngon(0.95, 12, 0, 0.42), y0, y0 + 0.16, 'under', 0.04);
    k.prism(ngon(0.42, 10, PI / 10, 0.46, 0.3), y0 + 0.12, y1, 'wine', 0.06);
    k.prism(ngon(0.62, 10, PI / 10, 0.34, -0.45), y0 + 0.1, y1 - 0.06, 'wineD', 0.05);
    k.prism(ngon(0.4, 10, PI / 10, 0.44, 0.36), y1 - 0.02, y1 + 0.02, 'gold', 0.01);
    k.prism(ngon(0.36, 10, PI / 10, 0.4, 0.36), y1 + 0.01, y1 + 0.06, 'crimson', 0.02);
    k.light(-1.08, y0 + 0.24, 0, 0.04, 'glow', '-x');
    if (orn && f >= 2) {
      // Lace ruff: scalloped plates round the back of the neck, tilted out.
      const n = 14, R = f === 2 ? 0.34 : 0.4;
      for (let i = 0; i < n; i++) {
        const a = lerp(PI * 0.32, PI * 1.68, i / (n - 1));
        b.push().move(0.45, y1 + 0.1, 0).rotY(-a).move(R, 0, 0).rotZ(-0.55);
        k.plate(0, 0, 0, 0.16, 0.035, 0.13, { col: i % 2 ? 'crimson' : 'lace', insert: null });
        b.pop();
      }
    }
    // Wings: forewing over hindwing per side, root at the shoulder, laid back like a roof (outer edge lower).
    const W = [{ sc: 0.72, yaw: 0.02, droop: 0.5 }, { sc: 0.92, yaw: 0.12, droop: 0.4 }, { sc: 1.08, yaw: 0.26, droop: 0.3 }][f - 1];
    const FORE = [[0.08, 0], [0.02, 0.14], [-0.45, 0.3], [-1.1, 0.36], [-1.55, 0.3], [-1.7, 0.18], [-1.6, 0.08], [-0.9, 0.0]];
    const HIND = [[-0.05, 0.02], [-0.35, 0.26], [-0.85, 0.36], [-1.12, 0.28], [-1.06, 0.12], [-0.6, 0.02]];
    for (const s of [-1, 1]) {
      b.push().move(0.22, y1 + 0.12, s * 0.12).rotY(s * W.yaw).rotX(s * W.droop);
      const F1 = scl(FORE, W.sc), H1 = scl(HIND, W.sc);
      layered(k, s, H1, -0.06, ['vein', 'pane2']);
      layered(k, s, F1, 0.0, ['vein', 'pane']);
      if (orn && f >= 2) {
        const v = (p, w = 0.035) => k.beam([p[0][0], 0.06, s * p[0][1]], [p[1][0], 0.06, s * p[1][1]], w, 0.025, 'vein', 0.008);
        v([F1[0], F1[3]], 0.05); v([F1[3], F1[5]], 0.04);
        v([[F1[2][0] * 0.95, F1[2][1] * 0.9], [F1[7][0], F1[7][1] + 0.04]]);
        v([[F1[3][0], F1[3][1] * 0.9], [F1[7][0] * 1.35, 0.05]]);
        b.push().move(-1.02 * W.sc, 0.055, s * 0.2 * W.sc); clockFace(k, b, 0.15 * W.sc, 0.5, 2.3); b.pop();
        if (f === 3) { b.push().move(-0.72 * W.sc, -0.005, s * 0.2 * W.sc); clockFace(k, b, 0.1 * W.sc, 1.6, 4.0); b.pop(); }
      }
      k.oct(0, 0.05, 0, 0.08, 0.1, 'gold', 0.02);
      b.pop();
    }
    if (orn && f === 3) fireAura(b, -0.25, 1.55, 1.2, 16, 0.95, AURA.clock);
    // Head turret: wide cicada head, crimson face, big compound eyes at the corners, three ocelli.
    b.use('turret');
    const hx = 0.62, hy = y1 - 0.02;
    k.oct(0.55, hy, 0, 0.24, 0.08, 'under');
    k.prism([[hx + 0.2, 0.2], [hx + 0.12, 0.34], [hx - 0.12, 0.36], [hx - 0.18, 0.2], [hx - 0.18, -0.2], [hx - 0.12, -0.36], [hx + 0.12, -0.34], [hx + 0.2, -0.2]], hy + 0.04, hy + 0.3, 'wine', 0.05);
    k.prism([[hx + 0.27, 0.12], [hx + 0.21, 0.2], [hx + 0.05, 0.22], [hx + 0.05, -0.22], [hx + 0.21, -0.2], [hx + 0.27, -0.12]], hy + 0.06, hy + 0.26, 'crimson', 0.03);
    for (const s of [-1, 1]) {
      fin(b, 'dark', DARKM); b.push().move(hx - 0.02, hy + 0.2, s * 0.37).scale(0.9, 0.85, 1).ball(0.12, 1).pop();
      k.lamp('glow', () => b.push().move(hx + 0.01, hy + 0.22, s * 0.41).scale(0.9, 0.85, 1).ball(0.075, 1).pop());
    }
    k.lamp(LAMP.red, () => { for (const [x, z] of [[0.02, 0], [-0.06, 0.06], [-0.06, -0.06]]) b.push().move(hx + x, hy + 0.31, z).box(0.04, 0.02, 0.04).pop(); });
    b.use('barrel');
    K.my = hy + 0.16;
    cannon(b, hx + 0.22, K.my, 0, K.stock.muzzle - hx - 0.22, 0.05, CHROME, f === 1 ? GOLD_DEEP : crimson);
    k.lamp('glow', () => b.push().move(K.stock.muzzle - 0.02, K.my, 0).rotZ(PI / 2).cyl(0.055, 0.055, 0.02, 10).pop());
    b.use('hull');
    K.parts.push(...k.parts); K.top = hy + (f === 3 ? 0.9 : 0.75);
    return finish(K, { recoil: 0.15 });
  },

  // Bạch Hạc, support: a white crane on three hover pods. A teardrop body of pearl plates with a celadon deck, broad
  // white wings spread out to the sides (a pearl panel with a celadon leading edge, then feather plates whose tips turn
  // black, longest at the wing tip), a black tail bustle, and the turret an S-necked crane head: black neck, red crown,
  // the gold beak is the gun. A ring of celadon cloud scrolls turns round it ('halo', as on the hand design).
  // I: wings half folded, four small clouds. II: wide wings, six clouds. III: widest wings, lit cloud ring, crane aura.
  hac(h, b, st, paint, trim, deep, form) {
    const K = startHand('hac', b, form), { f } = K, white = f === 1 ? mix(PEARL, 0x9aa0a8, 0.3) : C3(PEARL), teal = C3(trim), dteal = C3(deep), black = C3(0x16181c);
    const k = new OKit(b, st, trim, form, { white: [white, 'pearl'], whiteB: [mix(white, 0xc8d4dc, 0.4), 'pearl'], teal: [teal, 'enamel'], tealD: [mix(teal, dteal, 0.5), 'enamel'], red: [0xd8202a, 'enamel'], gold: [GOLD, 'gold'], gun: [white, 'pearl'], gunLite: [GOLD, 'gold'], panel: [teal, 'enamel'], under: [mix(dteal, 0x05080a, 0.45), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x101216, 'dark'] });
    const y0 = 0.55;
    b.use('hull');
    for (const [x, z] of [[0.42, 0.28], [0.42, -0.28], [-0.5, 0]]) hoverPod(h, k, b, x, y0, z, 0.17, f === 1 ? 'under' : 'gold');
    const body = [[0.78, 0], [0.56, 0.28], [0.1, 0.42], [-0.5, 0.36], [-0.86, 0.16], [-0.92, 0], [-0.86, -0.16], [-0.5, -0.36], [0.1, -0.42], [0.56, -0.28]];
    k.prism(scl(body, 0.94), y0 - 0.02, y0 + 0.2, 'under', 0.04);
    k.prism(body, y0 + 0.16, y0 + 0.46, 'white', 0.07);
    k.prism(scl(body, 0.58, [-0.12, 0]), y0 + 0.45, y0 + 0.5, f === 1 ? 'whiteB' : 'teal', 0.015);
    for (const s of [-1, 1]) k.light(0.66, y0 + 0.28, s * 0.14, 0.035, 'glow', '+x');
    // Tail bustle: black feather plates fanned aft.
    const tn = f === 1 ? 3 : 5;
    for (let i = 0; i < tn; i++) {
      const t = i / (tn - 1) * 2 - 1, L = [0.4, 0.55, 0.65][f - 1] * (1 - 0.18 * Math.abs(t));
      const g = bladeGeo({ len: L, w: 0.2, th: 0.035, seg: 6, wf: WF.feather, lift: 0.1, edge: dteal, face: black, face2: mix(black, 0x3a4048, 0.5), back: black });
      b.push().move(-0.78, y0 + 0.42 + i * 0.006, t * 0.1).rotY(PI - t * 0.35); put(fin(b, 'enamel'), g); b.pop();
    }
    // Wings: a pearl panel with a celadon leading edge, white feather plates turning black at the tips.
    const W = [{ len: 0.7, reach: 0.35, n: 4, fl0: 0.24, fl1: 0.3, tilt: 0.05 }, { len: 0.82, reach: 0.9, n: 6, fl0: 0.3, fl1: 0.46, tilt: 0.16 }, { len: 0.92, reach: 1.1, n: 8, fl0: 0.32, fl1: 0.58, tilt: 0.2 }][f - 1];
    const x0 = 0.28, z0 = 0.36, wy = y0 + 0.42;
    for (const s of [-1, 1]) {
      b.push().move(0, wy, s * z0).rotX(-s * W.tilt).move(0, -wy, -s * z0);
      wingPanel(b, s, { x0, z0, y: wy, ...W, col: { panel: white, edge: teal, face: white, face2: white } }, 'frame');
      const R1 = [x0 - W.len * 0.5, z0 - 0.02], T = [x0 - W.len, z0 + W.reach];
      for (let i = 0; i < W.n; i++) {
        const t = (i + 0.5) / W.n, px = lerp(R1[0], T[0], t), pz = lerp(R1[1], T[1], t), L = lerp(W.fl0, W.fl1, t), a = lerp(0.05, 0.85, t * t);
        const g = bladeGeo({ len: L, w: 0.22, th: 0.03, seg: 6, wf: WF.feather, lift: 0.02, edge: 0xdfe6ee, face: white, face2: mix(white, 0xc8d4dc, 0.4), back: mix(white, 0x9aa8b4, 0.5), band: (u) => (u > lerp(0.7, 0.42, t) ? black : white), mz: s < 0 });
        b.push().move(px, wy - 0.05 + i * 0.006, s * pz).rotY(s * (-PI + a)); put(fin(b, 'pearl'), g); b.pop();
      }
      b.pop();
    }
    if (f === 3) fireAura(b, -0.1, 1.5, 1.4, 16, 0.95, AURA.crane);
    // Crane head turret on an S neck; the beak is the gun.
    b.use('turret');
    k.oct(0.12, y0 + 0.5, 0, 0.2, 0.08, 'tealD');
    const NP = new THREE.CatmullRomCurve3([V(0.12, y0 + 0.5, 0), V(0.1, 1.38, 0), V(0.24, 1.66, 0), V(0.44, 1.6, 0), V(0.56, 1.34, 0)]).getPoints(14);
    put(fin(b, 'pearl'), tubeGeo(NP, (t) => 0.1 * (1 - 0.4 * t) + 0.01, { sides: 7, caps: true, tone: (t) => (t < 0.35 ? white : black) }));
    k.blk(0.6, 1.27, 0, 0.24, 0.16, 0.17, 'white', 0.05);
    k.blk(0.6, 1.36, 0, 0.13, 0.04, 0.11, 'red', 0.015);
    k.blk(0.68, 1.25, 0, 0.08, 0.1, 0.18, 'dark', 0.02);
    for (const s of [-1, 1]) k.light(0.66, 1.3, s * 0.09, 0.025, 'glow', s > 0 ? '+z' : '-z');
    b.use('barrel');
    K.my = 1.2;
    fin(b, 'gold', mix(GOLD, 0xe8dca0, 0.4)); b.push().move(0.84, 1.2, 0).rotZ(-PI / 2).cyl(0.014, 0.05, 0.3, 6).pop();
    h.lit(b, () => b.push().move(K.stock.muzzle - 0.01, 1.2, 0).ball(0.025, 0).pop());
    // Cloud ring: celadon scrolls (three overlapping discs and a gold curl) round the body, turning slowly.
    b.use('halo');
    const n = f === 1 ? 4 : 6, R = [0.95, 1.05, 1.15][f - 1], cy = y0 + 0.24;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * TAU;
      b.push().move(Math.cos(a) * R, cy, Math.sin(a) * R).rotY(-a - PI / 2);
      k.use('teal'); for (const [dx, dz, r] of [[0, 0, 0.11], [0.12, 0.04, 0.08], [-0.12, 0.04, 0.08]]) b.push().move(dx, 0, dz).cyl(r, r, 0.05, 10).pop();
      k.use('white'); b.push().move(0, 0.04, -0.02).cyl(0.06, 0.06, 0.04, 8).pop();
      b.pop();
    }
    if (f === 3) h.lit(b, () => b.push().move(0, cy, 0).geo(new THREE.TorusGeometry(R, 0.016, 4, 40).rotateX(PI / 2)).pop());
    b.use('hull');
    K.parts.push(...k.parts, { name: 'halo', on: 'hull', kind: 'spin', axis: 'y', by: 'time', rate: 0.9, p: [0, cy, 0], model: true });
    K.top = f === 3 ? 2.1 : 1.85;
    return finish(K, { recoil: 0.15 });
  },

  // Đom Đóm, medic: a firefly on three hover pods. A dark green thorax under a yellow pronotum shield with a lit medic
  // cross, a small dark head turret with feelers, two hard wing cases (green with a yellow rim) over the back, and
  // the big lantern abdomen trailing aft: dark segments ending in two lit ones between gold rings. Two little firefly
  // drones circle over it ('drones', as on the hand design). I: wing cases shut, small lantern. II: cases parted over
  // clear flight wings, bigger lantern. III: wide wings, a gold lantern cage with a handle, the firefly aura.
  domdom(h, b, st, paint, trim, deep, form) {
    const K = startHand('domdom', b, form), { f } = K, yellow = f === 1 ? mix(paint, 0x8a8a90, 0.35) : C3(paint), green = C3(trim), dg = C3(deep);
    const pane = mix(0xe0f4e0, st.glow, 0.15);
    const k = new OKit(b, st, trim, form, { yellow: [yellow, 'enamel'], green: [green, 'enamel'], deep: [mix(dg, 0x101a0c, 0.2), 'enamel'], deepL: [mix(dg, green, 0.35), 'enamel'], gold: [GOLD, 'gold'], vein: [mix(dg, 0x050805, 0.3), 'dark'], pane: [pane, 'glass'], gun: [dg, 'enamel'], gunLite: [GOLD, 'gold'], panel: [yellow, 'enamel'], under: [mix(dg, 0x040604, 0.5), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x080a06, 'dark'] });
    const y0 = 0.5;
    b.use('hull');
    for (const [x, z] of [[0.34, 0.26], [0.34, -0.26], [-0.45, 0]]) hoverPod(h, k, b, x, y0, z, 0.16, f === 1 ? 'under' : 'gold');
    k.prism(ngon(0.38, 10, PI / 10, 0.36, 0.15), y0 - 0.02, y0 + 0.32, 'deep', 0.05);
    k.prism(ngon(0.27, 10, PI / 10, 0.32, 0.42), y0 + 0.3, y0 + 0.38, 'yellow', 0.03);
    k.prism(ngon(0.11, 8, PI / 8, 0.13, 0.4), y0 + 0.37, y0 + 0.4, 'dark', 0.01);
    k.lamp('glow', () => { b.push().move(0.4, y0 + 0.41, 0).box(0.16, 0.02, 0.05).pop(); b.push().move(0.4, y0 + 0.41, 0).box(0.05, 0.02, 0.16).pop(); });
    // Lantern abdomen: dark segments, then two lit ones, gold rings between.
    const ls = [0.8, 1.0, 1.15][f - 1], ly = y0 + 0.2;
    const seg = [[-0.18, 0.3], [-0.42, 0.34], [-0.68, 0.33], [-0.92, 0.26]];
    seg.forEach(([x, r], i) => {
      const X = x * ls, R = r * ls, w = 0.24 * ls;
      if (i < 2) k.beam([X + w / 2, ly, 0], [X - w / 2, ly, 0], R * 2, R * 1.5, i % 2 ? 'deepL' : 'deep', 0.06);
      else k.lamp('glow', () => b.push().move(X, ly, 0).chamfer(w, R * 1.5, R * 2, 0.07).pop());
      if (i) k.beam([X + w / 2 + 0.02, ly, 0], [X + w / 2 - 0.02, ly, 0], R * 2.12, R * 1.6, 'gold', 0.015);
    });
    k.light(-0.92 * ls - 0.12 * ls, ly, 0, 0.04, LAMP.white, '-x');
    if (f === 3) {
      // Lantern cage: gold ribs along the lit segments and a ring handle on top.
      const xa = -0.55 * ls, xb = -1.08 * ls;
      for (const a of [-1.0, 0, 1.0]) {
        const P = []; for (let j = 0; j <= 8; j++) { const t = j / 8, x = lerp(xa, xb, t), bulge = Math.sin(PI * t); P.push(V(x, ly + Math.cos(a) * (0.34 * ls + 0.08 * bulge), Math.sin(a) * (0.42 * ls + 0.1 * bulge))); }
        put(fin(b, 'gold', GOLD), tubeGeo(P, () => 0.022, { sides: 5, caps: true }));
      }
      fin(b, 'gold', GOLD); b.push().move(-0.8 * ls, ly + 0.5 * ls, 0).geo(new THREE.TorusGeometry(0.12, 0.022, 4, 14)).pop();
      fireAura(b, -0.2, 1.4, 1.2, 14, 0.9, AURA.firefly);
    }
    // Flight wings under the cases (II-III), then the wing cases.
    const WING = [[0.05, 0], [-0.15, 0.3], [-0.55, 0.56], [-0.92, 0.52], [-0.9, 0.26], [-0.5, 0.05]];
    const CASE = [[0.1, 0], [0.05, 0.18], [-0.3, 0.3], [-0.72, 0.28], [-0.92, 0.15], [-0.88, 0.02]];
    const cy = [0.06, 0.28, 0.45][f - 1];
    for (const s of [-1, 1]) {
      if (f >= 2) {
        b.push().move(0.22, y0 + 0.4, s * 0.1).rotY(s * (f === 2 ? 0.55 : 0.75)).rotX(-s * 0.12);
        layered(k, s, scl(WING, f === 2 ? 0.95 : 1.2), -0.04, ['vein', 'pane']);
        b.pop();
      }
      b.push().move(0.24, y0 + 0.42, s * 0.05).rotY(s * cy).rotX(-s * 0.22);
      layered(k, s, scl(CASE, f === 1 ? 0.85 : 1.0), 0, ['yellow', 'deep', 'deepL'], f === 1 ? 2 : 3);
      b.pop();
    }
    // Head turret: dark head, lamp eyes, feelers; the medic lens.
    b.use('turret');
    k.oct(0.5, y0 + 0.08, 0, 0.18, 0.08, 'under');
    k.prism(ngon(0.18, 8, PI / 8, 0.2, 0.6), y0 + 0.04, y0 + 0.27, 'dark', 0.04);
    const al = [0.3, 0.45, 0.55][f - 1];
    for (const s of [-1, 1]) {
      k.lamp('glow', () => b.push().move(0.68, y0 + 0.18, s * 0.15).ball(0.05, 1).pop());
      put(fin(b, 'dark', DARKM), tubeGeo(new THREE.CatmullRomCurve3([V(0.7, y0 + 0.25, s * 0.06), V(0.72 + al * 0.4, y0 + 0.25 + al * 0.5, s * (0.1 + al * 0.2)), V(0.7 + al * 0.8, y0 + 0.3 + al * 0.55, s * (0.12 + al * 0.55))]).getPoints(8), (t) => 0.022 * (1 - 0.4 * t), { sides: 5, caps: true }));
      k.lamp('glow', () => b.push().move(0.7 + al * 0.8, y0 + 0.3 + al * 0.55, s * (0.12 + al * 0.55)).ball(0.03, 0).pop());
    }
    b.use('barrel');
    K.my = y0 + 0.14;
    cannon(b, 0.74, K.my, 0, K.stock.muzzle - 0.74, 0.05, CHROME, f === 1 ? GOLD_DEEP : green);
    k.lamp('glow', () => b.push().move(K.stock.muzzle - 0.02, K.my, 0).rotZ(PI / 2).cyl(0.055, 0.055, 0.02, 10).pop());
    // Firefly drones circling the lantern.
    b.use('drones');
    const ds = f === 1 ? 0.8 : 1;
    for (const s of [-1, 1]) {
      b.push().move(-0.35 + s * 0.78, 1.35, 0).rotY(s > 0 ? 0 : PI).scale(ds);
      k.use('deep'); b.push().move(0.06, 0, 0).scale(1.3, 0.8, 1).cyl(0.07, 0.07, 0.08, 8).pop();
      k.lamp('glow', () => b.push().move(-0.08, 0, 0).scale(1.3, 0.9, 1).ball(0.07, 1).pop());
      k.use('pane'); for (const z of [-1, 1]) b.push().move(0.02, 0.05, z * 0.1).rotY(z * 0.5).chamfer(0.16, 0.015, 0.1, 0.005).pop();
      b.pop();
    }
    b.use('hull');
    K.parts.push(...k.parts, { name: 'drones', on: 'hull', kind: 'spin', axis: 'y', by: 'time', rate: 2.4, p: [-0.35, 0, 0], model: true, bob: 0.08 });
    K.top = f === 3 ? 1.9 : 1.6;
    return finish(K, { recoil: 0.12 });
  },
};
