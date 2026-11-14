// New character themes composed from the ported Lanternfall kit (hand-written adapter). Each theme has 3 variants
// that differ in silhouette; make(i, seed) returns a Lanternfall-shaped def: { build, style, scale, death, ... }.
// Bodies, garments and gear are HW pieces and Geo primitives; animation is HumanAnim driven by stance/rdy poses and
// mkClip clips (some reused from the Lanternfall heroes); materials are the kit's surface types.
import {
  C, mixC, PI, TAU, lerp, clamp, Geo, jb, chainY, humanRig, COL, HW, stance, mkClip, rdy, DOWN_POSE,
  T_SKIN, T_CLOTH, T_QUILT, T_MAIL, T_LEATHER, T_PLATE, T_FUR, T_WOOD, T_STONE, T_PEAT, T_GLOW, T_BONE,
  variety, start, finish, frontZ, patch, capShell, coneHat, checkerTube, checkerPanel, inHand, rbox, style,
} from './theme-kit.js';
import { HEROES } from './lf/heroes.js';
import { M_GLOW, rockAt } from './lf/monsters.js';
import { handPoint } from './arm-ik.js';

const HC = HEROES; // reuse a few Lanternfall clips where the motion fits (sword + shield, two-hander, staff, throw)
const SKIN = { light: C(0x8a6450), mid: C(0x6e5040), tan: C(0x7a5236), dark: C(0x4a3226), deep: C(0x3a2a22) };
const both = (fn) => { fn(1); fn(-1); };
const AIM = 0.35; // pistol-grip tilt for firearms (see inHand)
// two-handed holds: support hand on the handguard / shaft (lib/arm-ik.js)
const rifleGrip = (P, k = 1, fwd = 0.27) => ({ side: 1, bone: 'wR', point: handPoint(P, -1, [0, fwd * k, -0.03], AIM), pole: [0.5, -1, -0.35] });
const shaftGrip = (P, along, pole) => ({ side: 1, bone: 'wR', point: handPoint(P, -1, [0, along, 0]), pole: pole || [0.6, -1, -0.2] });
const RIFLE_CARRY = stance({ chest: [0.04, -0.12, -0.02], rUp: [-0.2, 0.5, -0.1], rFore: [-1.3, 0, 0], rHand: [0.25, 0, 0], lUp: [-0.75, -0.6, 0], lFore: [-1.1, 0, 0], lHand: [0, 0, 0] });
const RIFLE_READY = rdy({ hips: [0.05, -0.55, 0], chest: [0.02, -0.1, 0], neck: [0.06, 0.25, 0], head: [0.08, 0.4, 0.05], rUp: [-0.75, 1.0, -0.4], rFore: [-2.0, 0, 0], rHand: [0.8, 0, 0], lUp: [-1.2, -0.5, 0.1], lFore: [-0.6, 0, 0] });
const RIFLE_FIRE = mkClip(0.3, [
  { t: 0.22, e: 'out', b: {}, root: [0, -0.02, 0] },
  { t: 0.3, e: 'snap', b: { chest: [-0.06, -0.1, 0], rUp: [-0.86, 1.0, -0.4], rHand: [0.64, 0, 0], head: [0.02, 0.4, 0.05] }, root: [0, -0.02, -0.035] },
  { t: 0.42, e: 'out', b: { chest: [0.02, -0.1, 0], rUp: [-0.75, 1.0, -0.4], rHand: [0.8, 0, 0] }, root: [0, -0.02, 0] },
  { t: 0.5, e: 'snap', b: { chest: [-0.06, -0.1, 0], rUp: [-0.86, 1.0, -0.4], rHand: [0.64, 0, 0] }, root: [0, -0.02, -0.035] },
  { t: 0.62, e: 'out', b: { chest: [0.02, -0.1, 0], rUp: [-0.75, 1.0, -0.4], rHand: [0.8, 0, 0] }, root: [0, -0.02, 0] },
  { t: 0.85, b: {} }], RIFLE_READY);

/* ---------- shared gear ---------- */
// carbine in the right hand: stock behind the grip, receiver above it, handguard + barrel forward, magazine down
function carbine(g, P, o = {}) {
  const k = o.len || 1, body = o.col || C(0x1d1e20), acc = o.acc || C(0x3a3b36);
  inHand(g, P, -1, () => {
    g.mat(body, 0.5, 0.35, T_PLATE, 0.3);
    rbox(g, 0, -0.04, -0.062, 0.046, 0.32 * k, 0.07);           // receiver
    rbox(g, 0, 0.27 * k, -0.07, 0.05, 0.3 * k, 0.058, 5);        // handguard
    g.tube([[0, 0.41 * k, -0.075], [0, 0.56 * k + (o.long || 0), -0.075]], 0.0095, { seg: 7, sub: 1 });
    rbox(g, 0, 0.58 * k + (o.long || 0), -0.075, 0.03, 0.05, 0.03);  // muzzle device
    g.mat(acc, 0.7, 0, T_PLATE, 0.3);
    if (!o.noStock) { g.tr(0, -0.31, -0.02, -0.12, 0, 0); g.box(0.04, 0.2, 0.07, 6); g.pop(); g.tube([[0, -0.2, -0.065], [0, -0.1, -0.065]], 0.012, { seg: 6, sub: 1 }); }
    g.tr(0, 0.0, -0.04, PI / 2 + 0.35, 0, 0); g.box(0.03, 0.095, 0.036, 6); g.pop();                         // pistol grip
    if (!o.noMag) { g.tr(0, 0.1, -0.04, PI / 2 - 0.2, 0, 0); g.box(0.026, o.drum ? 0.12 : 0.17, 0.07, 6); g.pop(); }
    if (o.optic !== false) { g.mat(C(0x161718), 0.4, 0.5, T_PLATE, 0.2); rbox(g, 0, 0.04, -0.13, 0.034, 0.12, 0.042, 5); g.mat(o.lens || C(0x8fd0ff), 0.2, 0, T_GLOW, o.lensGlow || 0.25); rbox(g, 0, 0.1, -0.13, 0.024, 0.006, 0.026, 4); }
    if (o.glow) { g.mat(o.glow, 0.3, 0, T_GLOW, 1.0); rbox(g, 0.026, 0.27 * k, -0.07, 0.004, 0.24 * k, 0.012, 3); rbox(g, -0.026, 0.27 * k, -0.07, 0.004, 0.24 * k, 0.012, 3); }
  }, AIM);
}
// curved single-edged blade along local +Y of the hand frame (katana, sabre); returns tip
function katana(g, P, side, o = {}) {
  const len = o.len || 0.72, grip = o.grip || 0.24, curve = o.curve === undefined ? 0.03 : o.curve;
  inHand(g, P, side, () => {
    g.mat(o.wrap || C(0x17141a), 0.8, 0, T_QUILT, 0.2); g.lathe([[0.014, -grip * 0.72], [0.0155, -grip * 0.3], [0.015, grip * 0.28]], 8);
    g.mat(C(0x2b2620), 0.4, 0.9, T_PLATE, 0.2); g.tr(0, -grip * 0.72 - 0.008, 0); g.sphere(0.017, 0.012, 0.017, 8, 4); g.pop();
    g.mat(o.tsuba || C(0x3a3022), 0.45, 0.9, T_PLATE, 0.3); g.tr(0, grip * 0.28, 0); g.lathe([[0.0, 0], [0.04, 0], [0.042, 0.006], [0.0, 0.008]], 12); g.pop();
    g.mat(o.col || C(0xb6babf), 0.22, 1, T_PLATE, 0.1);
    const y0 = grip * 0.28 + 0.008, rings = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6, w = (o.w || 0.016) * (1 - 0.25 * t) * (t > 0.92 ? (1 - t) / 0.08 * 0.8 + 0.2 : 1); rings.push({ y: y0 + len * t, rx: 0.0035 * (1 - 0.6 * t), rz: w, rb: w * 0.35, z: -curve * t * t, sq: 1.4 }); }
    g.loft(rings, { seg: 6, sub: 2, flat: true, cap1: true });
  });
}
// pole arm in a hand: H.staff shaft plus a head built here (spear blade, yari, glaive)
function spear(g, P, side, o = {}) {
  const z1 = o.z1 || 1.35, x = side * (P.sh + 0.03), y = 0.835;
  H_staff(g, P, side, { z0: o.z0 || -1.0, z1, col: o.col || COL.wood });
  g.bone(side > 0 ? 'wL' : 'wR'); g.mat(o.metal || C(0x9a9ea2), 0.3, 1, T_PLATE, 0.3);
  g.tr(x, y, z1, PI / 2, 0, 0); g.loft([{ y: -0.01, rx: 0.014, rz: 0.014 }, { y: 0.05, rx: 0.006, rz: o.wide || 0.03, sq: 1 }, { y: (o.blade || 0.26) * 0.7, rx: 0.004, rz: (o.wide || 0.03) * 0.8, sq: 1 }, { y: o.blade || 0.26, rx: 0.0008, rz: 0.002, sq: 1 }], { seg: 4, sub: 1, flat: true });
  if (o.tassel) { g.mat(o.tassel, 0.95, 0, T_FUR, 0.2); g.tr(0, -0.02, 0); g.lathe([[0.012, 0], [0.03, -0.03], [0.04, -0.09], [0.0, -0.1]], 8); g.pop(); }
  g.pop();
  return [x, y, z1 + (o.blade || 0.26)];
}
function H_staff(g, P, side, o) { return HW.staff(g, P, side, o); }

// face extras built on the kit head
function eyesGlow(g, col, k = 0.9, y = 1.699, z = 0.09, dx = 0.031) { g.bone('head'); g.mat(col, 0.4, 0, T_GLOW, k); for (const s of [-1, 1]) { g.tr(s * dx, y, z); g.sphere(0.013, 0.008, 0.008, 6, 4); g.pop(); } }

/* ===================== MODERN OPERATOR ===================== */
function operator(i, seed) {
  const V = variety(seed), sh = 0.205 + V.rnd(0.008), P = { sh, hp: 0.1 + V.rnd(0.004) };
  const camo = V.pick([[C(0x58593f), C(0x4a4a36)], [C(0x3c4433), C(0x30362a)], [C(0x6b604a), C(0x564c3a)], [C(0x2c2f33), C(0x232528)]]);
  const gear = V.tint(i === 2 ? C(0x26282a) : C(0x5a563f)), skin = V.pick([SKIN.light, SKIN.mid, SKIN.tan, SKIN.dark]);
  function build() {
    const { rig, g, H } = start(P);
    both((s) => {
      g.mat(V.tint(camo[0]), 0.95, 0, T_CLOTH, 1.3); H.leg(g, P, s, { y0: 0.3, y1: 0.99, k: 1.1, wr: 0.06, wra: 3, wry: 30 });
      g.mat(V.tint(C(0x6e5a3e)), 0.8, 0, T_LEATHER, 1.1); H.boot(g, P, s, { top: 0.33 });
      // cargo pocket on the thigh, knee pad
      const Tn = s > 0 ? 'lThigh' : 'rThigh'; g.bone(Tn); g.mat(V.tint(camo[1]), 0.95, 0, T_CLOTH, 1.0);
      g.tr(s * (P.hp + 0.07), 0.66, 0.01, 0, s * 1.35, 0); patch(g, 0, 0, 0, 0.1, 0.12, { bow: 0.012, flap: true, thick: 0.006 }); g.pop();
      g.bone(() => [Tn, s > 0 ? 'lShin' : 'rShin', 0.5]); g.mat(C(0x1c1d1e), 0.6, 0, T_LEATHER, 0.8);
      g.tr(s * (P.hp + 0.005), 0.5, 0.045); g.surf(8, 5, (u, v) => { const a = u * TAU, b = v * 1.35; return [Math.cos(a) * Math.sin(b) * 0.06, Math.sin(a) * Math.sin(b) * 0.07, Math.cos(b) * 0.04]; }, { closeU: true, thick: 0.01 }); g.pop();
    });
    g.mat(V.tint(camo[0]), 0.95, 0, T_CLOTH, 0.9); H.torso(g, { grow: 0.012, y0: 0.9, y1: 1.5, blouse: 0.01, wr: 0.03 });
    both((s) => {
      g.mat(V.tint(camo[0]), 0.95, 0, T_CLOTH, 0.6); H.arm(g, P, s, { grow: 0.016, k: 1.08, wr: 0.07, y0: i === 1 ? 1.06 : 0.92 });
      if (i === 1) { g.mat(skin, 0.62, 0, T_SKIN, 0.3); H.arm(g, P, s, { y0: 0.9, y1: 1.08, grow: 0.0, cap1: false }); }
      g.mat(C(0x1e1f20), 0.7, 0, T_LEATHER, 0.5); H.fist(g, P, s);
    });
    if (i === 0 || i === 2) { // plate carrier: front + back plates, cummerbund, shoulder straps, magazine pouches
      g.mat(gear, 0.92, 0, T_QUILT, 0.8);
      H.torso(g, { grow: i === 2 ? 0.06 : 0.045, y0: 1.04, y1: 1.43, arc: [PI / 2 - 1.18, PI / 2 + 1.18], seg: 12, thick: 0.02, k: 1.02 });
      H.torso(g, { grow: i === 2 ? 0.06 : 0.045, y0: 1.04, y1: 1.44, arc: [-PI / 2 - 1.15, -PI / 2 + 1.15], seg: 12, thick: 0.02, k: 1.02 });
      g.mat(V.tint(gear, 0.05), 0.92, 0, T_CLOTH, 0.8); H.torso(g, { grow: 0.04, y0: 1.04, y1: 1.17, thick: 0.01, seg: 18 });
      g.bone(H.TW); g.mat(gear, 0.92, 0, T_QUILT, 0.6);
      for (const s of [-1, 1]) g.tube([[s * 0.1, 1.43, 0.14], [s * 0.11, 1.5, 0.05], [s * 0.11, 1.5, -0.04], [s * 0.1, 1.43, -0.13]], 0.016, { seg: 6, sub: 3, cap: false, flatten: 0.45 });
      const z = frontZ(g, 0, 1.14, 0.03) + 0.004;
      g.mat(V.tint(gear, 0.06), 0.92, 0, T_QUILT, 0.9);
      for (let k = -1; k <= 1; k++) { g.tr(k * 0.07, 1.09, z + 0.02); g.box(0.062, 0.12, 0.045, 6); g.pop(); }
      g.mat(C(0x6a6a5c), 0.85, 0, T_CLOTH, 0.4); g.tr(0.07, 1.33, z + 0.012); patch(g, 0, 0, 0, 0.07, 0.045, { bow: 0.003 }); g.pop(); // patch
      if (i === 2) { // heavy: neck collar, shoulder pads, groin flap
        g.mat(gear, 0.9, 0, T_QUILT, 0.6); g.bone(chainY([['neck', 9], ['chest', 1.5]], 0.04));
        g.loft([{ y: 1.43, rx: 0.15, rz: 0.15, rb: 0.13 }, { y: 1.49, rx: 0.12, rz: 0.12, rb: 0.115 }, { y: 1.55, rx: 0.1, rz: 0.11, rb: 0.1 }], { seg: 16, sub: 2, thick: 0.014, arc: [-PI * 0.75, PI * 0.2 + PI / 2] });
        both((s) => HW.spaulder(g, P, s, { s: 1.15, col: gear }));
        g.bone(H.skirtW(1.04)); g.mat(gear, 0.92, 0, T_QUILT, 1.0); g.surf(4, 3, (u, v) => [(u - 0.5) * 0.17, 1.05 - v * 0.2, frontZ(g, 0, 1.05, 0.04) + 0.01 + 0.02 * Math.sin(u * PI)], { thick: 0.012 });
      }
    } else { // chest rig + backpack with radio
      g.mat(gear, 0.92, 0, T_QUILT, 0.8); H.torso(g, { grow: 0.035, y0: 1.06, y1: 1.24, arc: [PI / 2 - 1.1, PI / 2 + 1.1], seg: 10, thick: 0.03 });
      g.bone(H.TW); for (const s of [-1, 1]) g.tube([[s * 0.09, 1.24, 0.14], [s * 0.12, 1.46, 0.08], [s * 0.1, 1.5, -0.03], [-s * 0.02, 1.32, -0.15]], 0.015, { seg: 6, sub: 3, cap: false, flatten: 0.45 });
      const z = frontZ(g, 0, 1.15, 0.03); g.mat(V.tint(gear, 0.06), 0.92, 0, T_QUILT, 0.9);
      for (let k = -1; k <= 1; k++) { g.tr(k * 0.075, 1.1, z + 0.02); g.box(0.064, 0.14, 0.05, 6); g.pop(); }
      g.bone('back'); g.mat(V.tint(camo[1]), 0.9, 0, T_QUILT, 1.0); g.tr(0, 1.06, -0.19);
      g.loft([{ y: 0, rx: 0.14, rz: 0.06, rb: 0.08, sq: 3.5 }, { y: 0.2, rx: 0.15, rz: 0.06, rb: 0.1, sq: 3.5 }, { y: 0.38, rx: 0.13, rz: 0.06, rb: 0.08, sq: 3.2 }, { y: 0.42, rx: 0.08, rz: 0.04, rb: 0.05, sq: 3 }], { seg: 12, sub: 3, cap0: true, cap1: true, wr: 0.05, wra: 2, wry: 12 });
      g.mat(C(0x1a1b1c), 0.6, 0.3, T_PLATE, 0.4); g.tr(0.09, 0.3, -0.06); g.box(0.07, 0.16, 0.05, 6); g.tube([[0.02, 0.16, 0], [0.04, 0.6, -0.02], [0.05, 0.78, -0.05]], 0.003, { seg: 4, sub: 2 }); g.pop();
      g.pop();
    }
    g.mat(C(0x2a2620), 0.7, 0, T_LEATHER, 0.6); H.belt(g, { grow: 0.036, w: 0.024, col: C(0x2a2620) });
    H.pouch(g, -0.17, 1.0, 0.05, 0.8, gear); H.pouch(g, 0.18, 1.0, -0.02, 0.8, gear);
    // holster on the right thigh
    g.bone(H.skirtW(1.02)); g.mat(C(0x1e1f20), 0.6, 0, T_LEATHER, 0.6); g.tr(-(P.hp + 0.085), 0.86, 0.02, 0, -1.4, 0); g.box(0.05, 0.16, 0.08, 6); g.pop();
    // head
    H.head(g, { skin, beard: V.chance(0.5) ? 0.35 : 0, hair: COL.hair });
    if (i === 0) { // helmet, headset, eye pro, NVG mount
      g.bone('head'); g.mat(V.tint(C(0x5d5a45)), 0.78, 0, T_PLATE, 0.5);
      capShell(g, { c: 1.70, rx: 0.114, ry: 0.15, rz: 0.13, rb: 0.135, yFront: 1.748, yBack: 1.66, thick: 0.009 });
      g.mat(C(0x1c1d1e), 0.6, 0.1, T_PLATE, 0.3); for (const s of [-1, 1]) { g.tr(s * 0.098, 1.69, 0.0, 0, 0, 0); g.sphere(0.03, 0.042, 0.04, 10, 6); g.pop(); }
      rbox(g, 0, 1.84, 0.118, 0.04, 0.045, 0.02);
      g.mat(C(0x0d0e10), 0.18, 0.6, T_PLATE, 0.1); g.loft([{ y: 1.688, rx: 0.084, rz: 0.106, rb: 0.07 }, { y: 1.712, rx: 0.084, rz: 0.106, rb: 0.07 }], { seg: 14, sub: 1, arc: [0.25, PI - 0.25], thick: 0.004 });
    } else if (i === 1) { // boonie hat + shemagh round the neck
      g.bone('head'); g.mat(V.tint(camo[0]), 0.95, 0, T_CLOTH, 0.6);
      g.loft([{ y: 1.735, rx: 0.096, rz: 0.114, rb: 0.112 }, { y: 1.8, rx: 0.088, rz: 0.104, rb: 0.104 }, { y: 1.83, rx: 0.06, rz: 0.07, rb: 0.07 }, { y: 1.836, rx: 0.002, rz: 0.002, rb: 0.002 }], { seg: 16, sub: 2, thick: 0.004, wr: 0.04 });
      g.surf(22, 3, (u, v) => { const a = u * TAU, r = lerp(0.098, 0.17, v); return [Math.cos(a) * r, 1.738 - v * 0.035 - 0.012 * v * Math.sin(a * 3), Math.sin(a) * r * 1.12]; }, { closeU: true, thick: 0.004 });
      HW.cowl(g, P, { col: V.tint(C(0x8a8064)), r: 0.036, y: 1.49, wide: 0.01 });
    } else { // balaclava + bump helmet + goggles
      g.bone('head'); HW.veil(g, { col: C(0x1c1d1f), top: 1.69 });
      g.mat(C(0x232527), 0.7, 0, T_PLATE, 0.4); capShell(g, { c: 1.70, rx: 0.112, ry: 0.15, rz: 0.13, rb: 0.135, yFront: 1.76, yBack: 1.7, thick: 0.009 });
      g.mat(C(0x0e1012), 0.2, 0.5, T_PLATE, 0.1); g.loft([{ y: 1.684, rx: 0.088, rz: 0.11, rb: 0.08 }, { y: 1.722, rx: 0.088, rz: 0.11, rb: 0.08 }], { seg: 14, sub: 1, arc: [0.2, PI - 0.2], thick: 0.006 });
      g.mat(C(0x6f8a96), 0.15, 0, T_GLOW, 0.06); g.loft([{ y: 1.69, rx: 0.08, rz: 0.113, rb: 0.07 }, { y: 1.716, rx: 0.08, rz: 0.113, rb: 0.07 }], { seg: 12, sub: 1, arc: [0.45, PI - 0.45] });
    }
    if (i === 2) { // riot shield on the left arm + pistol in the right hand
      HW.shield(g, P, 1, { hw: 0.26, h: 0.95, colA: C(0x202224), colB: C(0x202224) });
      inHand(g, P, -1, () => { g.mat(C(0x1b1c1e), 0.45, 0.4, T_PLATE, 0.2); rbox(g, 0, 0.06, -0.05, 0.032, 0.19, 0.045, 6); g.tr(0, 0, -0.03, PI / 2 + 0.3, 0, 0); g.box(0.028, 0.09, 0.034, 6); g.pop(); }, AIM);
    } else carbine(g, P, i === 1 ? { len: 0.82, noStock: false, long: -0.04, optic: true } : {});
    return finish(g, rig, P, { tip: ['wR', -(P.sh + 0.03), 0.835 - 0.075, 0.6] });
  }
  const carry = i === 2
    ? stance({ lUp: [-0.18, 0, 0.16], lFore: [-0.95, 0.25, 0], rUp: [0.05, 0, -0.12], rFore: [-0.5, 0, 0], rHand: [0.6, 0, 0] })
    : RIFLE_CARRY;
  const ready = i === 2 ? HC.warden.style.ready : RIFLE_READY;
  const fire = RIFLE_FIRE;
  return { build, style: style({ carry, ready, clips: { attack: i === 2 ? HC.warden.style.clips.bash : fire }, swingL: i === 2 ? 0.15 : 0.1, swingR: 0.12, gait: { bounce: 0.8, sway: 1.0, lean: 1.3, lift: 1.1 } }), death: 'down', mat: 'metal', grip: i === 2 ? null : rifleGrip(P, i === 1 ? 0.82 : 1) };
}

/* ===================== SCI-FI TROOPER ===================== */
function trooper(i, seed) {
  const V = variety(seed), heavy = i === 1, scout = i === 2;
  const P = { sh: heavy ? 0.235 : scout ? 0.195 : 0.21, hp: heavy ? 0.11 : 0.098 };
  const shell = V.tint(V.pick([C(0xb9bdc2), C(0xc8c2b4), C(0x8f979e), C(0xa9a59a)]), 0.05), under = V.tint(C(0x26292d)), trim = V.pick([C(0x9a3a2a), C(0x2f5a8a), C(0xc08a2a), C(0x3a6a4a)]);
  const visor = scout ? C(0xff5a3a) : V.pick([C(0x6ad8ff), C(0x7affc8), C(0xffc060)]);
  function build() {
    const { rig, g, H } = start(P), K = heavy ? 1.18 : scout ? 0.96 : 1.04;
    both((s) => {
      g.mat(under, 0.8, 0, T_QUILT, 0.8); H.leg(g, P, s, { y0: 0.3, y1: 0.99, k: K });
      g.mat(shell, 0.42, 0.15, T_PLATE, 0.7); H.boot(g, P, s, { top: heavy ? 0.42 : 0.36 });
      // thigh + shin plates and knee cup
      const Tn = s > 0 ? 'lThigh' : 'rThigh', S = s > 0 ? 'lShin' : 'rShin';
      H.leg(g, P, s, { y0: 0.6, y1: 0.9, grow: 0.016, k: K, arc: [-0.2, PI + 0.2], thick: 0.006, bone: Tn });
      H.leg(g, P, s, { y0: 0.2, y1: 0.44, grow: 0.014, k: K, arc: [-0.35, PI + 0.35], thick: 0.006, bone: S });
      HW.poleyn(g, P, s, { col: shell });
    });
    g.mat(under, 0.8, 0, T_QUILT, 0.9); H.torso(g, { grow: 0.01, y0: 0.9, y1: 1.5, k: K, kz: K });
    // chest + back plate (rounded box sections), abdomen bands
    g.mat(shell, 0.4, 0.15, T_PLATE, 0.5); H.torso(g, { grow: heavy ? 0.06 : 0.035, y0: 1.18, y1: 1.47, k: K * 1.03, kz: K * 1.05, thick: 0.012, bone: 'chest', cap1: false });
    for (let b = 0; b < 3; b++) H.torso(g, { grow: 0.026 - b * 0.002, y0: 1.02 + b * 0.055, y1: 1.065 + b * 0.055, k: K, kz: K, thick: 0.006 });
    g.mat(trim, 0.5, 0.1, T_PLATE, 0.4); H.torso(g, { grow: heavy ? 0.064 : 0.04, y0: 1.36, y1: 1.385, k: K * 1.03, kz: K * 1.05, thick: 0.006, bone: 'chest', arc: [PI / 2 - 0.9, PI / 2 + 0.9] });
    g.mat(visor, 0.3, 0, T_GLOW, 0.6); g.bone('chest'); g.tr(0.0, 1.29, frontZ(g, 0, 1.29, 0.03) + 0.004); rbox(g, 0, 0, 0, 0.05, 0.012, 0.006, 4); g.pop();
    both((s) => {
      const U = s > 0 ? 'lUp' : 'rUp', F = s > 0 ? 'lFore' : 'rFore';
      g.mat(under, 0.8, 0, T_QUILT, 0.6); H.arm(g, P, s, { grow: 0.01, k: K });
      g.mat(shell, 0.42, 0.15, T_PLATE, 0.5);
      H.arm(g, P, s, { y0: 1.2, y1: 1.4, grow: 0.018, k: K, thick: 0.005, bone: U, cap1: false });
      HW.vambrace(g, P, s, { col: shell, metal: 0.15, rough: 0.42 }); HW.couter(g, P, s, { col: shell });
      HW.spaulder(g, P, s, { s: heavy ? 1.55 : scout ? 0.95 : 1.15, col: shell });
      g.mat(under, 0.7, 0, T_LEATHER, 0.4); H.fist(g, P, s);
    });
    g.mat(C(0x1f2124), 0.6, 0.3, T_PLATE, 0.5); H.belt(g, { grow: 0.034, w: 0.026, col: C(0x1f2124) });
    H.pouch(g, -0.17, 1.0, 0.04, 0.8, under); H.pouch(g, 0.17, 1.0, 0.04, 0.8, under);
    // backpack: power cell with glowing vents
    g.bone('back'); g.mat(shell, 0.45, 0.15, T_PLATE, 0.5); g.tr(0, 1.1, -0.17);
    g.loft([{ y: 0, rx: 0.13, rz: 0.04, rb: 0.07, sq: 5 }, { y: 0.32, rx: heavy ? 0.17 : 0.13, rz: 0.04, rb: heavy ? 0.12 : 0.08, sq: 5 }, { y: 0.36, rx: 0.1, rz: 0.04, rb: 0.05, sq: 4 }], { seg: 12, sub: 2, cap0: true, cap1: true });
    g.mat(visor, 0.3, 0, T_GLOW, 0.8); for (const s of [-1, 1]) { g.tr(s * 0.07, 0.08, -0.075); rbox(g, 0, 0.1, 0, 0.03, 0.2, 0.01, 4); g.pop(); }
    if (heavy) { g.mat(under, 0.6, 0.4, T_PLATE, 0.5); for (const s of [-1, 1]) { g.tr(s * 0.14, 0.0, -0.08); g.lathe([[0.04, -0.06], [0.05, 0.0], [0.04, 0.3], [0.03, 0.32]], 10, { cap0: true }); g.pop(); } }
    g.pop();
    // helmet: closed shell with a visor band
    H.head(g, { skin: SKIN.mid });
    g.bone('head'); g.mat(shell, 0.38, 0.15, T_PLATE, 0.4);
    g.loft([{ y: 1.52, rx: 0.07, rz: 0.1, rb: 0.08 }, { y: 1.57, rx: 0.098, rz: 0.13, rb: 0.112 }, { y: 1.64, rx: 0.11, rz: 0.138, rb: 0.124 }, { y: 1.72, rx: 0.114, rz: 0.136, rb: 0.13 }, { y: 1.79, rx: 0.102, rz: 0.118, rb: 0.12 }, { y: 1.84, rx: 0.07, rz: 0.08, rb: 0.085 }, { y: 1.858, rx: 0.01, rz: 0.01, rb: 0.01 }], { seg: 20, sub: 3, cap1: true, thick: 0.008 });
    g.mat(C(0x0a0c0e), 0.12, 0.7, T_PLATE, 0.1); g.loft([{ y: 1.665, rx: 0.112, rz: 0.142, rb: 0.1 }, { y: 1.715, rx: 0.114, rz: 0.142, rb: 0.1 }], { seg: 16, sub: 1, arc: [0.15, PI - 0.15], thick: 0.006 });
    g.mat(visor, 0.2, 0, T_GLOW, 0.55); g.loft([{ y: 1.683, rx: 0.113, rz: 0.144, rb: 0.1 }, { y: 1.697, rx: 0.113, rz: 0.144, rb: 0.1 }], { seg: 16, sub: 1, arc: [0.35, PI - 0.35] });
    g.mat(trim, 0.45, 0.1, T_PLATE, 0.3); g.loft([{ y: 1.75, rx: 0.006, rz: 0.14, rb: 0.135 }, { y: 1.85, rx: 0.006, rz: 0.08, rb: 0.085 }], { seg: 6, sub: 1, cap1: true });
    g.mat(under, 0.5, 0.5, T_PLATE, 0.3); for (const s of [-1, 1]) { g.tr(s * 0.112, 1.64, -0.01, 0, 0, s * PI / 2); g.lathe([[0.03, -0.012], [0.032, 0], [0.03, 0.014], [0.0, 0.016]], 10); g.pop(); }
    if (scout) { // cape + energy blade
      H.cloak(g, P, { hem: 0.5, wrap: 0.35, col: V.tint(C(0x3a2a2a)), flare: 0.08, clasp: false });
      inHand(g, P, -1, () => { g.mat(C(0x2a2c30), 0.4, 0.8, T_PLATE, 0.2); g.lathe([[0.016, -0.12], [0.018, 0.0], [0.024, 0.04], [0.016, 0.06]], 10); g.mat(visor, 0.2, 0, T_GLOW, 2.2); g.loft([{ y: 0.06, rx: 0.006, rz: 0.012 }, { y: 0.8, rx: 0.005, rz: 0.01 }, { y: 0.86, rx: 0.001, rz: 0.001 }], { seg: 6, sub: 1 }); });
    } else if (heavy) { // shoulder cannon held at the hip: long barrel cluster
      inHand(g, P, -1, () => { g.mat(under, 0.45, 0.6, T_PLATE, 0.3); rbox(g, 0, 0.05, -0.08, 0.1, 0.5, 0.12, 6); g.mat(shell, 0.4, 0.2, T_PLATE, 0.3); for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; g.tube([[Math.cos(a) * 0.03, 0.25, -0.09 + Math.sin(a) * 0.03], [Math.cos(a) * 0.03, 0.72, -0.09 + Math.sin(a) * 0.03]], 0.014, { seg: 6, sub: 1 }); } g.mat(visor, 0.3, 0, T_GLOW, 1.0); rbox(g, 0.052, 0.05, -0.08, 0.004, 0.36, 0.03, 3); g.tr(0, 0, -0.03, PI / 2 + 0.3, 0, 0); g.box(0.03, 0.09, 0.036, 6); g.pop(); }, AIM);
    } else carbine(g, P, { col: shell, acc: under, glow: visor, optic: true, lens: visor, lensGlow: 0.8 });
    return finish(g, rig, P, { tip: ['wR', -(P.sh + 0.03), 0.835, 0.7] });
  }
  const carry = scout ? stance({ rUp: [0.0, 0, -0.14], rFore: [-0.5, 0, 0], rHand: [-0.3, 0, 0], lUp: [0.05, 0, 0.14], lFore: [-0.3, 0, 0] })
    : RIFLE_CARRY;
  const ready = scout ? HC.reaver.style.ready : RIFLE_READY;
  const opc = RIFLE_FIRE;
  return { build, style: style({ carry, ready, clips: { attack: scout ? HC.reaver.style.clips.attack : opc }, swingL: scout ? 0.9 : 0.1, swingR: scout ? 0.3 : 0.12, stride: heavy ? 1.05 : 1, gait: heavy ? { bounce: 1.3, sway: 1.6, lean: 0.8, lift: 0.8 } : { bounce: 0.9, sway: 0.9, lean: 1.2, lift: 1.2 } }), death: 'down', mat: 'metal', disCol: [visor[0] * 3, visor[1] * 3, visor[2] * 3], scale: heavy ? 1.06 : 1, grip: scout ? null : heavy ? rifleGrip(P, 1, 0.24) : rifleGrip(P) };
}

/* ===================== POST-APOC SURVIVOR ===================== */
function survivor(i, seed) {
  const V = variety(seed), P = { sh: 0.2 + V.rnd(0.01), hp: 0.097 };
  const jacket = V.tint(V.pick([C(0x4a3a2a), C(0x3d3a30), C(0x50402e), C(0x37332c)])), denim = V.tint(V.pick([C(0x2e3540), C(0x3a3a34), C(0x33302a)])), rag = V.tint(C(0x5a5040));
  const skin = V.pick([SKIN.light, SKIN.mid, SKIN.tan]);
  function build() {
    const { rig, g, H } = start(P);
    both((s) => {
      g.mat(denim, 0.95, 0, T_CLOTH, 2.0); H.leg(g, P, s, { y0: 0.3, y1: 0.99, k: 1.06, wr: 0.07 });
      g.mat(V.tint(COL.leatherDk), 0.8, 0, T_LEATHER, 2.4); H.boot(g, P, s, { top: 0.4 });
      // knee patch + shin wraps
      g.bone(s > 0 ? 'lShin' : 'rShin'); g.mat(rag, 0.95, 0, T_CLOTH, 1.0);
      for (let k = 0; k < 3; k++) { g.tr(s * (P.hp + 0.005), 0.38 + k * 0.035, 0); g.lathe([[0.06, -0.012], [0.064, 0], [0.06, 0.012]], 10, { thick: 0.004 }); g.pop(); }
    });
    g.mat(V.tint(C(0x4d4a40)), 0.95, 0, T_CLOTH, 1.2); H.torso(g, { grow: 0.012, y0: 0.9, y1: 1.5, blouse: 0.01, wr: 0.05 });
    if (i === 1) { // raider: leather vest open, bare arms with wraps, one tyre-rubber pauldron, spiked bat
      g.mat(jacket, 0.7, 0, T_LEATHER, 1.2); H.torso(g, { grow: 0.03, y0: 1.0, y1: 1.48, arc: [PI / 2 + 0.3, PI / 2 - 0.3 + TAU], thick: 0.006, wr: 0.04 });
      both((s) => { g.mat(skin, 0.6, 0, T_SKIN, 0.6); H.arm(g, P, s, { k: 1.12 }); g.mat(rag, 0.95, 0, T_CLOTH, 1.0); H.arm(g, P, s, { y0: 0.9, y1: 1.02, grow: 0.008, k: 1.12, cap1: false, wr: 0.1 }); g.mat(C(0x2a2420), 0.7, 0, T_LEATHER, 0.6); H.fist(g, P, s); });
      g.mat(C(0x161616), 0.85, 0, T_LEATHER, 0.9); HW.spaulder(g, P, 1, { s: 1.45, col: C(0x1a1a1a) });
      g.bone('lUp'); g.mat(C(0x6a5a40), 0.5, 0.9, T_PLATE, 1.2); for (let k = 0; k < 4; k++) { g.tr(P.sh + 0.06, 1.43 - k * 0.02, -0.06 + k * 0.04); g.sphere(0.008, 0.008, 0.008, 5, 3); g.pop(); }
      H.strap(g, { side: -1, grow: 0.05, col: C(0x2a2018) });
      inHand(g, P, -1, () => { g.mat(V.tint(COL.wood), 0.8, 0, T_WOOD, 0.8); g.lathe([[0.016, -0.12], [0.018, 0.0], [0.03, 0.4], [0.038, 0.62], [0.034, 0.66], [0.0, 0.67]], 10); g.mat(C(0x8a8a86), 0.4, 1, T_PLATE, 1.4); for (let k = 0; k < 10; k++) { const a = k * 2.4, y = 0.38 + (k % 5) * 0.06; g.tube([[Math.cos(a) * 0.03, y, Math.sin(a) * 0.03], [Math.cos(a) * 0.075, y + 0.01, Math.sin(a) * 0.075]], 0.004, { seg: 4, sub: 1 }); } });
    } else { // long patched coat
      g.mat(jacket, 0.75, 0, T_LEATHER, 1.2); H.torso(g, { grow: 0.026, y0: 1.0, y1: 1.5, arc: [PI / 2 + 0.16, PI / 2 - 0.16 + TAU], thick: 0.006, wr: 0.05, wra: 4, wry: 16 });
      g.mat(jacket, 0.75, 0, T_LEATHER, 2.0); H.skirt(g, { y0: 1.04, y1: i === 2 ? 0.5 : 0.36, grow: 0.03, flare: 0.1, arc: [PI / 2 + 0.28, PI / 2 - 0.28 + TAU], seg: 26, thick: 0.007, wave: 0.055, folds: 6 });
      // ragged hem patches
      g.bone(H.skirtW(1.04)); g.mat(V.tint(C(0x5c4a34)), 0.8, 0, T_LEATHER, 1.6);
      for (const [x, y] of [[-0.12, 0.62], [0.16, 0.75], [-0.18, 0.9]]) { const z = frontZ(g, x, y, 0.04); g.tr(x, y, z + 0.006, 0, Math.atan2(x, 0.2), 0); patch(g, 0, 0, 0, 0.09, 0.1, { bow: 0.004 }); g.pop(); }
      both((s) => { g.mat(jacket, 0.75, 0, T_LEATHER, 0.9); H.arm(g, P, s, { grow: 0.02, k: 1.1, wr: 0.08, cap1: true }); g.mat(C(0x2a2420), 0.8, 0, T_LEATHER, 0.6); H.fist(g, P, s); });
      g.mat(rag, 0.95, 0, T_CLOTH, 0.9); g.bone(jb('lUp', 'lFore', 1.14, 0.05)); for (let k = 0; k < 2; k++) { g.tr(P.sh + 0.012, 1.25 + k * 0.04, 0); g.lathe([[0.062, -0.014], [0.066, 0], [0.062, 0.014]], 10, { thick: 0.004 }); g.pop(); }
      H.belt(g, { grow: 0.044, w: 0.028 }); H.strap(g, { side: 1, grow: 0.046, w: 0.022 });
      H.satchel(g, -0.16, 1.02, -0.08, -2.1, 0.95, V.tint(C(0x4a4232)));
      if (i === 0) {
        H.pack(g);
        // pipe rifle: wood stock, pipe barrel, taped grip
        inHand(g, P, -1, () => { g.mat(V.tint(COL.woodDk), 0.8, 0, T_WOOD, 0.8); g.tr(0, -0.3, -0.03, -0.12, 0, 0); g.box(0.04, 0.3, 0.075, 4); g.pop(); g.mat(C(0x4a4642), 0.5, 0.9, T_PLATE, 1.6); g.tube([[0, -0.04, -0.06], [0, 0.66, -0.06]], 0.013, { seg: 7, sub: 1 }); rbox(g, 0, 0.04, -0.06, 0.04, 0.16, 0.05, 6); g.mat(C(0x6a6658), 0.95, 0, T_CLOTH, 0.6); g.tube([[0, 0.25, -0.06], [0, 0.4, -0.06]], 0.019, { seg: 7, sub: 1 }); g.tr(0, 0, -0.03, PI / 2 + 0.35, 0, 0); g.mat(V.tint(COL.woodDk), 0.8, 0, T_WOOD, 0.8); g.box(0.03, 0.09, 0.036, 4); g.pop(); }, AIM);
      } else {
        H.cloak(g, P, { hem: 0.7, wrap: 0.9, col: V.tint(C(0x4a4436)), flare: 0.12, fold: 0.12, clasp: false });
        spear(g, P, -1, { z0: -1.0, z1: 1.2, blade: 0.22, col: COL.woodDk, metal: C(0x6a6660) });
      }
    }
    // head gear
    if (i === 0) { // gas mask + hood
      H.head(g, { skin });
      g.bone('head'); g.mat(C(0x1e1f1c), 0.7, 0, T_LEATHER, 0.5);
      g.loft([{ y: 1.58, rx: 0.07, rz: 0.1, rb: 0.07 }, { y: 1.63, rx: 0.084, rz: 0.115, rb: 0.08 }, { y: 1.69, rx: 0.088, rz: 0.11, rb: 0.085 }, { y: 1.73, rx: 0.084, rz: 0.104, rb: 0.088 }], { seg: 16, sub: 2, thick: 0.006, arc: [-0.4, PI + 0.4] });
      g.mat(C(0x8a9a90), 0.1, 0.2, T_GLOW, 0.03); for (const s of [-1, 1]) { g.tr(s * 0.036, 1.7, 0.1, -0.1, s * 0.25, 0); g.lathe([[0.0, 0.0], [0.024, 0.0], [0.024, 0.01], [0.0, 0.012]], 12); g.pop(); }
      g.mat(C(0x26271f), 0.6, 0.3, T_PLATE, 0.6); g.tr(0, 1.615, 0.12, 0.35, 0, 0); g.lathe([[0.03, -0.01], [0.036, 0.02], [0.034, 0.06], [0.026, 0.07]], 12, { cap1: true }); g.pop();
      for (const s of [-1, 1]) { g.tr(s * 0.07, 1.6, 0.075, 0.3, 0, s * 0.9); g.lathe([[0.03, -0.02], [0.034, 0.0], [0.034, 0.06], [0.03, 0.065]], 10, { cap0: true, cap1: true }); g.pop(); }
      H.hood(g, P, { col: V.tint(C(0x3a3a30)), open: 0.66, peak: 0.04 });
    } else if (i === 1) { // mohawk + goggles on the forehead + face paint
      H.head(g, { skin, beard: 0.6, hair: COL.hair });
      g.bone('head'); g.mat(V.pick([C(0x8a2a1a), C(0x2a2a2a), C(0x6a5a20)]), 0.9, 0, T_FUR, 0.3);
      for (let k = 0; k < 9; k++) { const t = k / 8, a = lerp(-0.4, 1.0, t), y = 1.7 + Math.sin(a + 0.4) * 0.11, z = -0.08 + Math.cos(a + 0.4) * 0.0 + t * 0.17 - 0.06; g.tube([[0, 1.73 + t * 0.06 - 0.02, lerp(-0.09, 0.07, t)], [0, 1.84 + Math.sin(t * PI) * 0.05, lerp(-0.13, 0.06, t)]], (u) => 0.013 * (1 - u * 0.85), { seg: 5, sub: 1 }); }
      g.mat(C(0x2a2622), 0.6, 0.2, T_LEATHER, 0.4); g.loft([{ y: 1.745, rx: 0.09, rz: 0.11, rb: 0.105 }, { y: 1.765, rx: 0.09, rz: 0.11, rb: 0.105 }], { seg: 16, sub: 1, thick: 0.004 });
      g.mat(C(0xa07a3a), 0.2, 0.3, T_GLOW, 0.05); for (const s of [-1, 1]) { g.tr(s * 0.04, 1.765, 0.105, -0.5, 0, 0); g.lathe([[0, 0], [0.022, 0], [0.024, 0.018], [0, 0.02]], 10); g.pop(); }
      g.mat(C(0x101010), 0.9, 0, T_SKIN, 0.2); g.tr(0, 1.7, 0.094); g.sphere(0.07, 0.01, 0.012, 10, 4); g.pop();
    } else { // scavenger: wide hat, face wrap, goggles
      H.head(g, { skin }); HW.veil(g, { col: V.tint(C(0x6a5e48)), top: 1.69 });
      g.bone('head'); g.mat(C(0x1e1c18), 0.3, 0.4, T_PLATE, 0.3); g.loft([{ y: 1.69, rx: 0.088, rz: 0.11, rb: 0.08 }, { y: 1.722, rx: 0.088, rz: 0.11, rb: 0.08 }], { seg: 14, sub: 1, arc: [0.2, PI - 0.2], thick: 0.006 });
      g.mat(C(0xd0a050), 0.15, 0, T_GLOW, 0.06); for (const s of [-1, 1]) { g.tr(s * 0.038, 1.705, 0.108); g.sphere(0.022, 0.016, 0.006, 10, 4); g.pop(); }
      HW.hat(g, { col: V.tint(C(0x3a3226)) });
    }
    return finish(g, rig, P, { tip: ['wR', -(P.sh + 0.03), 0.835, 0.6] });
  }
  const opStyle = operator(0, 1).style;
  const carry = i === 0 ? opStyle.carry : i === 1 ? HC.reaver.style.carry : HC.rimebinder.style.carry;
  const ready = i === 0 ? opStyle.ready : i === 1 ? HC.reaver.style.ready : HC.rimebinder.style.ready;
  const attack = i === 0 ? opStyle.clips.attack : i === 1 ? HC.reaver.style.clips.cleave : HC.rimebinder.style.clips.attack;
  return { build, style: style({ carry, ready, clips: { attack }, swingL: i === 1 ? 0.9 : 0.4, swingR: i === 0 ? 0.12 : 0.2, gait: { bounce: 1.0, sway: 1.3, lean: 1.4, lift: 1.0 } }), death: 'down', grip: i === 0 ? rifleGrip(P, 1, 0.3) : null };
}

/* ===================== VIETNAMESE FARMER ===================== */
// ao ba ba (no collar, side slits, two lower pockets, front buttons), loose black quan, khan ran (black and white
// checked scarf), non la (conical leaf hat), bare feet in sandals; tools: hoe, carrying pole with baskets, sickle
function farmer(i, seed) {
  const V = variety(seed), woman = i === 1, old = i === 2;
  const P = { sh: woman ? 0.188 : 0.198 + V.rnd(0.006), hp: woman ? 0.098 : 0.094 };
  const aoCol = V.tint(woman ? V.pick([C(0x2c3448), C(0x553a2c), C(0x3a4436), C(0x5e5244)]) : V.pick([C(0x8a7a5c), C(0x4a3a2c), C(0x5c5040), C(0x2a2c30)]), 0.06);
  const quan = V.tint(C(0x151517), 0.05), skin = V.pick([SKIN.tan, SKIN.mid, C(0x7e5638)]), straw = V.tint(C(0x9a8456), 0.06);
  const kA = C(0x121214), kB = C(0xcfc8b4);
  function build() {
    const { rig, g, H } = start(P);
    both((s) => {
      // loose black trousers to the ankle, rolled at the shin for the old farmer
      g.mat(quan, 0.97, 0, T_CLOTH, 1.6); H.leg(g, P, s, { y0: old ? 0.3 : 0.15, y1: 0.99, k: 1.3, wr: 0.08, wra: 3, wry: 22 });
      if (old) { g.mat(skin, 0.6, 0, T_SKIN, 1.0); H.leg(g, P, s, { y0: 0.12, y1: 0.32, k: 1.0 }); g.mat(quan, 0.97, 0, T_CLOTH, 1.4); g.bone(s > 0 ? 'lShin' : 'rShin'); g.tr(s * (P.hp + 0.005), 0.31, 0); g.lathe([[0.072, -0.02], [0.078, 0], [0.072, 0.022]], 12, { thick: 0.006 }); g.pop(); }
      else { g.mat(skin, 0.6, 0, T_SKIN, 1.0); H.leg(g, P, s, { y0: 0.1, y1: 0.17, k: 1.0 }); }
      // bare foot in a sandal (H.boot gives the leather sole; foot is skin)
      g.mat(skin, 0.62, 0, T_SKIN, 1.0); H.boot(g, P, s, { top: 0.12 });
      g.bone(s > 0 ? 'lFoot' : 'rFoot'); g.mat(C(0x2a2018), 0.7, 0, T_LEATHER, 1.6); g.tr(s * (P.hp + 0.005), 0.035, 0.07, 0, 0, 0); g.lathe([[0.05, -0.006], [0.052, 0.0], [0.05, 0.006]], 10, { thick: 0.004 }); g.pop();
    });
    // ao ba ba: closed body, no collar, long sleeves, hem split at both sides into front and back panels
    g.mat(aoCol, 0.95, 0, T_CLOTH, 0.7); H.torso(g, { grow: 0.02, y0: 0.99, y1: 1.49, blouse: 0.014, wr: 0.035, wra: 4, wry: 16, k: woman ? 0.96 : 1 });
    const slit = 0.3, hem = woman ? 0.74 : 0.8;
    g.mat(aoCol, 0.95, 0, T_CLOTH, 1.1);
    H.skirt(g, { y0: 1.04, y1: hem, grow: 0.026, flare: 0.035, arc: [slit, PI - slit], seg: 14, thick: 0.005, wave: 0.012, folds: 5 });
    H.skirt(g, { y0: 1.04, y1: hem + 0.01, grow: 0.026, flare: 0.04, arc: [PI + slit, TAU - slit], seg: 14, thick: 0.005, wave: 0.012, folds: 5 });
    // two lower pockets on the front panel, and the button line
    g.bone(H.skirtW(1.04)); g.mat(V.tint(aoCol, 0.04), 0.95, 0, T_CLOTH, 1.0);
    for (const s of [-1, 1]) { const x = s * 0.1, y = hem + 0.1, z = frontZ(g, x, y, 0.03); g.tr(x, y, z + 0.003, 0, Math.atan2(x, 0.25) * 0.9, 0); patch(g, 0, 0, 0, 0.1, 0.1, { bow: 0.004, thick: 0.003 }); g.pop(); }
    g.bone(H.TW); g.mat(C(0x2a2622), 0.4, 0.2, T_PLATE, 0.2);
    for (let k = 0; k < 5; k++) { const y = 1.43 - k * 0.085, z = frontZ(g, 0, y, 0.02); g.tr(0, y, z + 0.002); g.sphere(0.0065, 0.0065, 0.004, 6, 4); g.pop(); }
    both((s) => { g.mat(aoCol, 0.95, 0, T_CLOTH, 0.7); H.arm(g, P, s, { grow: 0.022, k: 1.18, wr: 0.07, y0: old ? 1.0 : 0.91, cap1: true }); if (old) { g.mat(skin, 0.6, 0, T_SKIN, 0.6); H.arm(g, P, s, { y0: 0.9, y1: 1.02, cap1: false }); g.mat(aoCol, 0.95, 0, T_CLOTH, 0.7); g.bone(s > 0 ? 'lFore' : 'rFore'); g.tr(s * (P.sh + 0.024), 1.0, 0); g.lathe([[0.062, -0.018], [0.068, 0], [0.062, 0.02]], 12, { thick: 0.005 }); g.pop(); } g.mat(skin, 0.6, 0, T_SKIN, 0.7); H.fist(g, P, s); });
    // head
    H.head(g, { skin, beard: old ? 0.7 : 0, hair: old ? COL.hairGrey : COL.hair, hairCap: !woman && !old });
    if (woman) { g.bone('head'); g.mat(COL.hair, 0.9, 0, T_FUR, 0.2); g.loft([{ y: 1.62, rx: 0.074, rz: 0.03, rb: 0.094, z: -0.004 }, { y: 1.7, rx: 0.084, rz: 0.08, rb: 0.104 }, { y: 1.76, rx: 0.082, rz: 0.098, rb: 0.104 }, { y: 1.8, rx: 0.06, rz: 0.075, rb: 0.08 }, { y: 1.815, rx: 0.01, rz: 0.012, rb: 0.012 }], { seg: 14, sub: 3, cap1: true }); g.tr(0, 1.66, -0.105); g.sphere(0.045, 0.04, 0.035, 10, 6); g.pop(); }
    // khan ran: checked scarf round the neck with ends at the front (man, woman), or wrapped round the head (old farmer)
    g.bone(chainY([['neck', 9], ['chest', 1.52]], 0.04));
    if (!old) {
      const ring = []; for (let k = 0; k <= 16; k++) { const a = k / 16 * TAU + PI / 2, c = Math.cos(a), s = Math.sin(a); ring.push([c * 0.112, 1.49 + (s > 0 ? -0.03 * s : -0.01 * s), s * (s > 0 ? 0.11 : 0.116)]); }
      checkerTube(g, ring, 0.026, kA, kB, 16);
      g.bone(H.TW); const zf = frontZ(g, 0.05, 1.38, 0.04) + 0.012;
      checkerPanel(g, (u, v) => [0.035 + (u - 0.5) * 0.07 + v * 0.02, lerp(1.47, 1.2, v), lerp(0.12, zf, Math.min(1, v * 2.5)) + 0.004 * Math.sin(u * PI)], 3, 6, kA, kB);
      checkerPanel(g, (u, v) => [-0.03 + (u - 0.5) * 0.065 - v * 0.01, lerp(1.47, 1.26, v), lerp(0.12, zf, Math.min(1, v * 2.5)) + 0.006 + 0.004 * Math.sin(u * PI)], 3, 5, kB, kA);
    } else {
      g.bone('head'); const ring = []; for (let k = 0; k <= 18; k++) { const a = k / 18 * TAU + PI / 2, c = Math.cos(a), s = Math.sin(a); ring.push([c * 0.09, 1.745 + 0.012 * Math.sin(a * 2), s * (s > 0 ? 0.108 : 0.112) - 0.004]); }
      checkerTube(g, ring, 0.024, kA, kB, 18);
      const ring2 = ring.map(([x, y, z]) => [x * 0.86, y + 0.035, z * 0.86]); checkerTube(g, ring2, 0.022, kB, kA, 14);
      g.mat(kA, 0.95, 0, T_CLOTH, 0.4); g.tr(-0.07, 1.76, -0.08); g.sphere(0.03, 0.025, 0.03, 8, 5); g.pop();
      checkerPanel(g, (u, v) => [-0.075 + (u - 0.5) * 0.05, lerp(1.75, 1.6, v), -0.095 - v * 0.02], 2, 4, kA, kB);
      // a small towel of khan ran also round the neck
      g.bone(chainY([['neck', 9], ['chest', 1.52]], 0.04)); const rn = []; for (let k = 0; k <= 14; k++) { const a = k / 14 * TAU + PI / 2, c = Math.cos(a), s = Math.sin(a); rn.push([c * 0.11, 1.495 + (s > 0 ? -0.025 * s : 0), s * 0.112]); } checkerTube(g, rn, 0.02, kB, kA, 14);
    }
    // non la: conical leaf hat with a chin strap
    if (!old) {
      g.bone('head'); g.mat(straw, 0.85, 0, T_WOOD, 0.4);
      g.tr(0, 1.745, -0.005, woman ? -0.12 : -0.08, 0, 0);
      g.lathe([[0.3, 0.0], [0.24, 0.042], [0.16, 0.092], [0.08, 0.142], [0.02, 0.178], [0.0, 0.186]], 30, { thick: 0.005 });
      g.mat(mixC(straw, [0, 0, 0], 0.25), 0.85, 0, T_WOOD, 0.4); for (const r of [0.115, 0.19, 0.25]) { const y = 0.186 * (1 - r / 0.3) * 0.97; g.lathe([[r + 0.004, y - 0.002], [r + 0.006, y + 0.001], [r + 0.002, y + 0.004]], 30); }
      g.pop();
      g.mat(V.pick([C(0x7a2a3a), C(0xd8d0c0), C(0x2a4a7a)]), 0.9, 0, T_CLOTH, 0.2);
      for (const s of [-1, 1]) g.tube([[s * 0.11, 1.75, 0.0], [s * 0.078, 1.62, 0.04], [s * 0.04, 1.555, 0.07]], 0.004, { seg: 4, sub: 3, cap: false });
      g.tube([[0.04, 1.555, 0.07], [0, 1.545, 0.075], [-0.04, 1.555, 0.07]], 0.004, { seg: 4, sub: 2, cap: false });
    }
    // tools
    if (i === 0) { // hoe (cuoc): long handle, iron blade turned down at the far end
      const x = -(P.sh + 0.03), y = 0.835; g.bone('wR'); g.mat(V.tint(C(0x6a5232)), 0.8, 0, T_WOOD, 0.6);
      g.tube([[x, y, -0.55], [x, y, 0.5], [x, y, 0.95]], 0.017, { seg: 7, sub: 1 });
      g.mat(C(0x3a3a38), 0.6, 0.9, T_PLATE, 1.6); g.tr(x, y - 0.02, 0.97, 0.15, 0, 0); g.tr(0, -0.15, 0); g.box(0.16, 0.2, 0.012, 10); g.pop(); g.pop();
      g.mat(C(0x3a3a38), 0.6, 0.9, T_PLATE, 1.2); g.tube([[x, y + 0.03, 0.95], [x, y - 0.03, 0.99]], 0.024, { seg: 7, sub: 1 });
    } else if (i === 1) { // don ganh: bamboo pole on the right shoulder with two baskets on ropes
      g.bone('chest'); g.mat(V.tint(C(0x9a8650)), 0.6, 0, T_WOOD, 0.4);
      const sx = -0.16, sy = 1.5;
      g.tube([[sx, sy, -0.72], [sx, sy + 0.02, 0.0], [sx, sy, 0.72]], 0.019, { seg: 7, sub: 2 });
      for (const zz of [-0.66, 0.66]) {
        g.mat(V.tint(C(0x7a6640)), 0.95, 0, T_CLOTH, 0.6); for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; g.tube([[sx, sy, zz], [sx + Math.cos(a) * 0.17, sy - 0.62, zz + Math.sin(a) * 0.17]], 0.004, { seg: 4, sub: 1, cap: false }); }
        g.mat(straw, 0.9, 0, T_WOOD, 0.8); g.tr(sx, sy - 0.86, zz); g.lathe([[0.0, 0.0], [0.14, 0.01], [0.19, 0.08], [0.2, 0.22], [0.21, 0.24], [0.19, 0.24]], 18, { thick: 0.008 }); g.pop();
        g.mat(V.pick([C(0x3a5226), C(0x6a5228), C(0x5a3426)]), 0.8, 0, T_PEAT, 0.2); g.tr(sx, sy - 0.66, zz); g.sphere(0.17, 0.06, 0.17, 12, 6); g.pop();
      }
    } else { // sickle (liem) in the right hand, a basket (gio) at the hip
      inHand(g, P, -1, () => { g.mat(V.tint(C(0x5a4228)), 0.8, 0, T_WOOD, 0.4); g.lathe([[0.014, -0.08], [0.016, 0.0], [0.014, 0.08]], 8); g.mat(C(0x4a4a48), 0.35, 1, T_PLATE, 0.8); const pts = []; for (let k = 0; k <= 10; k++) { const a = k / 10 * PI * 1.15; pts.push([0, 0.08 + Math.sin(a) * 0.12, -0.12 + Math.cos(a) * 0.12 + 0.12]); } g.tube(pts, (t) => 0.012 * (1 - t * 0.8), { seg: 4, sub: 1, flatten: 0.25 }); });
      g.bone(H.skirtW(1.04)); g.mat(straw, 0.9, 0, T_WOOD, 0.8); g.tr(0.24, 0.84, -0.02, 0, 0, 0.1); g.lathe([[0.0, 0.0], [0.08, 0.005], [0.11, 0.06], [0.1, 0.16], [0.06, 0.2], [0.07, 0.21]], 14, { thick: 0.006 }); g.pop();
      g.mat(C(0x5a4a30), 0.9, 0, T_CLOTH, 0.4); g.tube([[0.18, 1.04, 0.1], [0.23, 1.03, 0.0], [0.3, 1.03, -0.03]], 0.005, { seg: 4, sub: 2, cap: false });
    }
    return finish(g, rig, P, { tip: ['wR', -(P.sh + 0.03), 0.835, 0.9] });
  }
  const carry = i === 0 ? stance({ rUp: [-0.3, 0.25, -0.15], rFore: [-1.95, 0, 0], rHand: [-0.2, 0, 0], lUp: [-0.5, -0.3, 0.1], lFore: [-1.0, 0, 0], spine: [0.06, 0, 0] })
    : i === 1 ? stance({ rUp: [-0.2, 0.3, -1.25], rFore: [-1.95, 0, 0], rHand: [0, 0, 0], lUp: [0.0, 0, 0.18], lFore: [-0.45, 0, 0], spine: [0.08, 0, -0.04], chest: [0.05, 0, -0.04] })
    : stance({ rUp: [0.05, 0, -0.12], rFore: [-0.6, 0, 0], rHand: [-0.2, 0, 0], lUp: [0.05, 0, 0.14], lFore: [-0.3, 0, 0], spine: [0.12, 0, 0], neck: [0.2, 0, 0] });
  const hoe = mkClip(0.55, [
    { t: 0.32, e: 'out', b: { spine: [-0.15, 0, 0], chest: [-0.2, 0, 0], rUp: [-2.7, 0, -0.2], rFore: [-0.6, 0, 0], rHand: [-0.4, 0, 0], lUp: [-2.4, 0, 0.25], lFore: [-0.9, 0, 0] }, root: [0, 0.02, -0.04] },
    { t: 0.55, e: 'in', b: { spine: [0.45, 0, 0], chest: [0.35, 0, 0], rUp: [-1.2, 0, -0.1], rFore: [-0.3, 0, 0], rHand: [0.5, 0, 0], lUp: [-1.0, 0, 0.2], lFore: [-0.6, 0, 0], lThigh: [-0.6, 0, 0.1], lShin: [0.6, 0, 0], rThigh: [0.2, 0, -0.1], rShin: [0.4, 0, 0] }, root: [0, -0.1, 0.1] },
    { t: 0.8, b: {}, root: [0, -0.1, 0.1] }], carry);
  const steady = mkClip(0.5, [
    { t: 0.3, e: 'out', b: { chest: [-0.1, 0.25, 0], spine: [0.1, 0.1, 0], lUp: [-1.0, 0, 0.3], lFore: [-0.8, 0, 0] }, root: [0, -0.05, 0] },
    { t: 0.5, e: 'in', b: { chest: [0.15, -0.3, 0], spine: [0.15, -0.15, 0], lUp: [-1.4, 0, 0.1], lFore: [-0.2, 0, 0], lThigh: [-0.6, 0, 0.1], lShin: [0.6, 0, 0] }, root: [0, -0.08, 0.15] },
    { t: 0.75, b: {}, root: [0, -0.08, 0.15] }], carry);
  const reap = mkClip(0.45, [
    { t: 0.28, e: 'out', b: { spine: [0.35, 0, 0], chest: [0.1, -0.5, 0], rUp: [-0.8, 0, -0.9], rFore: [-0.9, 0, 0], rHand: [0.3, 0.6, 0] }, root: [0, -0.12, 0] },
    { t: 0.45, e: 'in', b: { spine: [0.4, 0, 0], chest: [0.15, 0.6, 0], rUp: [-1.0, 0, 0.3], rFore: [-0.5, 0, 0], rHand: [0.2, -0.4, 0], lThigh: [-0.7, 0, 0.1], lShin: [0.8, 0, 0], rShin: [0.5, 0, 0] }, root: [0, -0.16, 0.1] },
    { t: 0.7, b: {}, root: [0, -0.16, 0.1] }], carry);
  const ready = rdy({ hips: [0.05, -0.2, 0], head: [0, 0.2, 0] });
  return { grip: i === 0 ? { side: 1, bone: 'wR', point: [-(P.sh + 0.03), 0.835, -0.42], pole: [0.6, -1, -0.1] } : null, build, style: style({ carry, ready: Object.assign({}, ready, carry), readyRoot: -0.02, clips: { attack: [hoe, steady, reap][i] }, swingL: i === 1 ? 0.6 : 0.8, swingR: i === 1 ? 0.0 : 0.3, stride: woman ? 0.92 : old ? 0.86 : 1, strideAmp: old ? 0.85 : 1, gait: old ? { bounce: 0.7, sway: 1.3, lean: 1.8, lift: 0.8 } : { bounce: woman ? 1.3 : 1.0, sway: woman ? 1.6 : 1.1, lean: 1.0, lift: 1.0 } }), death: 'down' };
}

/* ===================== SAMURAI ===================== */
function samurai(i, seed) {
  const V = variety(seed), P = { sh: 0.205 + V.rnd(0.008), hp: 0.1 };
  const lac = V.tint(V.pick([C(0x1a1414), C(0x4a1418), C(0x1a2030), C(0x3a2a14)]), 0.05), lace = V.pick([C(0x7a2a22), C(0x2a3a6a), C(0x9a8450)]), cloth = V.tint(V.pick([C(0x2a2a3a), C(0x3a2a24), C(0x26302a), C(0x4a4038)]));
  const skin = V.pick([SKIN.light, SKIN.mid, SKIN.tan]);
  // a row of lacquered lames (kozane) as stacked thin bands with lacing colour between
  const lames = (rows, fn) => { for (let k = 0; k < rows; k++) { g_.mat(k % 2 ? lac : mixC(lac, lace, 0.25), 0.35, 0.3, T_PLATE, 0.6); fn(k); } };
  let g_ = null;
  function build() {
    const { rig, g, H } = start(P); g_ = g;
    both((s) => {
      // hakama: very wide legs to the ankle
      g.mat(cloth, 0.95, 0, T_CLOTH, 1.5); H.leg(g, P, s, { y0: 0.14, y1: 0.99, k: 1.55, wr: 0.08, wra: 6, wry: 10 });
      g.mat(C(0xd8d2c4), 0.95, 0, T_CLOTH, 0.8); H.leg(g, P, s, { y0: 0.08, y1: 0.16, k: 1.0 });
      g.mat(V.tint(C(0x8a7650)), 0.9, 0, T_WOOD, 0.9); H.boot(g, P, s, { top: 0.1 }); // straw waraji
      if (i !== 1) { g.mat(lac, 0.4, 0.3, T_PLATE, 1.0); HW.greave(g, P, s, { col: lac }); }
    });
    g.mat(cloth, 0.95, 0, T_CLOTH, 1.4); H.skirt(g, { y0: 1.04, y1: 0.2, grow: 0.03, flare: 0.16, arc: [PI / 2 - 0.9, PI / 2 + 0.9], seg: 12, thick: 0.006, wave: 0.06, folds: 5 });
    H.skirt(g, { y0: 1.04, y1: 0.22, grow: 0.03, flare: 0.16, arc: [-PI / 2 - 0.9, -PI / 2 + 0.9], seg: 12, thick: 0.006, wave: 0.06, folds: 5 });
    // kimono body with crossed collar (left over right)
    g.mat(V.tint(C(0xcfc6b0)), 0.95, 0, T_CLOTH, 0.6); H.torso(g, { grow: 0.016, y0: 0.99, y1: 1.5, blouse: 0.012 });
    g.mat(cloth, 0.95, 0, T_CLOTH, 0.8); H.torso(g, { grow: 0.024, y0: 1.0, y1: 1.48, arc: [PI / 2 + 0.12, PI / 2 - 0.12 + TAU], thick: 0.005, wr: 0.03 });
    g.bone(H.TW); g.mat(V.tint(C(0xd8d0c0)), 0.95, 0, T_CLOTH, 0.4);
    for (const s of [1, -1]) g.tube([[s * 0.075, 1.5, 0.06], [s * 0.035, 1.38, frontZ(g, s * 0.03, 1.38, 0.03) + 0.004], [-s * 0.02, 1.22, frontZ(g, 0, 1.22, 0.03) + 0.006]], 0.012, { seg: 5, sub: 3, flatten: 0.35, cap: false });
    both((s) => { g.mat(cloth, 0.95, 0, T_CLOTH, 0.7); H.arm(g, P, s, { grow: 0.026, k: 1.28, wr: 0.09, cap1: true }); g.mat(i === 1 ? skin : lac, 0.6, 0, i === 1 ? T_SKIN : T_LEATHER, 0.5); H.fist(g, P, s); });
    g.mat(V.tint(C(0x2a2420)), 0.9, 0, T_CLOTH, 0.6); H.belt(g, { grow: 0.04, w: 0.04, col: V.tint(lace, 0.05) });
    if (i === 0) { // o-yoroi: do, kusazuri, sode, kote, kabuto with kuwagata, menpo
      lames(5, (k) => H.torso(g, { grow: 0.04 + k * 0.002, y0: 1.06 + k * 0.075, y1: 1.13 + k * 0.075, k: 1.04, kz: 1.08, thick: 0.007, bone: k > 2 ? 'chest' : H.TW, cap1: false }));
      g.mat(lac, 0.35, 0.3, T_PLATE, 0.5); H.torso(g, { grow: 0.044, y0: 1.36, y1: 1.46, k: 1.04, kz: 1.08, thick: 0.008, bone: 'chest', arc: [PI / 2 - 0.9, PI / 2 + 0.9] });
      for (let q = 0; q < 4; q++) { const a = PI / 2 + q * PI / 2, w = 0.62; for (let k = 0; k < 4; k++) { g.mat(k % 2 ? lac : mixC(lac, lace, 0.3), 0.35, 0.3, T_PLATE, 0.9); H.skirt(g, { y0: 1.02 - k * 0.07, y1: 0.95 - k * 0.075, grow: 0.06 + k * 0.006, flare: 0.012, arc: [a - w, a + w], seg: 6, thick: 0.006, wTop: 1.04 }); } }
      both((s) => { // sode: large rectangular shoulder guards of 5 lames, hanging from the shoulder
        const U = s > 0 ? 'lUp' : 'rUp';
        for (let k = 0; k < 5; k++) { g.mat(k % 2 ? lac : mixC(lac, lace, 0.3), 0.35, 0.3, T_PLATE, 0.7); g.bone(() => ['chest', U, 0.6 + k * 0.08]); const y = 1.46 - k * 0.055; g.surf(6, 1, (u, v) => { const a = (u - 0.5) * 1.3; return [s * (P.sh + 0.08 + 0.01 * k + Math.cos(a) * 0.012), y - v * 0.06, Math.sin(a) * 0.13]; }, { thick: 0.006, flip: s < 0 }); }
        g.mat(lac, 0.4, 0.3, T_PLATE, 0.5); HW.vambrace(g, P, s, { col: lac, metal: 0.3, rough: 0.4 });
        g.mat(V.tint(lace), 0.9, 0, T_CLOTH, 0.4); g.bone(s > 0 ? 'lUp' : 'rUp'); g.tube([[s * (P.sh + 0.08), 1.46, 0.0], [s * (P.sh + 0.06), 1.5, 0.0], [s * 0.12, 1.5, 0]], 0.006, { seg: 4, sub: 2, cap: false });
      });
      H.head(g, { skin, beard: 0.3, hair: COL.hair });
      g.bone('head'); g.mat(lac, 0.3, 0.4, T_PLATE, 0.4);
      g.loft([{ y: 1.72, rx: 0.1, rz: 0.118, rb: 0.12 }, { y: 1.78, rx: 0.098, rz: 0.114, rb: 0.118 }, { y: 1.83, rx: 0.078, rz: 0.092, rb: 0.096 }, { y: 1.862, rx: 0.03, rz: 0.035, rb: 0.035 }, { y: 1.868, rx: 0.002, rz: 0.002, rb: 0.002 }], { seg: 20, sub: 3, thick: 0.006 });
      g.mat(C(0x8a6a34), 0.4, 0.9, T_PLATE, 0.3); for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; g.tube([[Math.cos(a) * 0.1, 1.73, Math.sin(a) * 0.118], [Math.cos(a) * 0.035, 1.86, Math.sin(a) * 0.04]], 0.003, { seg: 4, sub: 1 }); }
      for (let k = 0; k < 4; k++) { g.mat(k % 2 ? lac : mixC(lac, lace, 0.3), 0.35, 0.35, T_PLATE, 0.5); const r = 0.12 + k * 0.022, y = 1.72 - k * 0.04; g.loft([{ y, rx: r, rz: r * 1.12, rb: r * 1.16 }, { y: y - 0.04, rx: r + 0.022, rz: (r + 0.022) * 1.12, rb: (r + 0.022) * 1.16 }], { seg: 18, sub: 1, arc: [PI * 0.72 + PI, PI * 0.28 + TAU + PI], thick: 0.006 }); }
      for (const s of [-1, 1]) { g.mat(lac, 0.35, 0.35, T_PLATE, 0.4); g.surf(3, 3, (u, v) => [s * (0.12 + u * 0.06), 1.735 - v * 0.08 + u * 0.02, 0.07 - u * 0.07], { thick: 0.005, flip: s < 0 }); }
      g.mat(C(0xb08a40), 0.3, 1, T_PLATE, 0.2); // kuwagata crest
      for (const s of [-1, 1]) g.tube([[s * 0.02, 1.78, 0.115], [s * 0.07, 1.86, 0.14], [s * 0.11, 1.97, 0.12], [s * 0.12, 2.05, 0.09]], (t) => 0.008 * (1 - t * 0.6), { seg: 4, sub: 3, flatten: 0.3 });
      g.tr(0, 1.785, 0.122); g.sphere(0.02, 0.016, 0.008, 8, 5); g.pop();
      g.mat(C(0x6a1a1a), 0.35, 0.3, T_PLATE, 0.4); g.loft([{ y: 1.555, rx: 0.06, rz: 0.08, rb: 0.03 }, { y: 1.6, rx: 0.08, rz: 0.11, rb: 0.04 }, { y: 1.655, rx: 0.084, rz: 0.12, rb: 0.04 }, { y: 1.68, rx: 0.08, rz: 0.115, rb: 0.04 }], { seg: 14, sub: 2, arc: [-0.2, PI + 0.2], thick: 0.006 });
      g.mat(C(0xd8d0c0), 0.9, 0, T_FUR, 0.2); g.tr(0, 1.63, 0.118); g.sphere(0.04, 0.008, 0.012, 8, 4); g.pop();
      katana(g, P, -1, { len: 0.74 });
      g.bone(H.skirtW(1.02)); g.mat(lac, 0.4, 0.2, T_PLATE, 0.6); g.tr(0.18, 1.02, 0.06, -1.25 + PI, 0.25, 0.25); g.loft([{ y: 0, rx: 0.012, rz: 0.026 }, { y: 0.55, rx: 0.01, rz: 0.022 }], { seg: 8, sub: 1, cap1: true }); g.pop();
    } else if (i === 1) { // ronin: kasa straw hat, bare forearms, two swords in the sash
      H.head(g, { skin, beard: 0.55, hair: COL.hair, hairCap: true });
      g.bone('head'); g.mat(COL.hair, 0.9, 0, T_FUR, 0.2); g.tr(0, 1.8, -0.06, -0.6, 0, 0); g.lathe([[0.018, -0.03], [0.02, 0.0], [0.016, 0.06], [0.006, 0.07]], 8, { cap0: true }); g.pop();
      g.mat(V.tint(C(0xa89060)), 0.88, 0, T_WOOD, 0.5); g.tr(0, 1.76, 0, -0.1, 0, 0);
      g.lathe([[0.34, -0.02], [0.3, 0.0], [0.2, 0.04], [0.1, 0.075], [0.03, 0.095], [0.0, 0.1]], 30, { thick: 0.006 }); g.pop();
      g.bone(H.skirtW(1.02)); g.mat(lac, 0.4, 0.2, T_PLATE, 0.6);
      for (const [l, d] of [[0.82, 0], [0.55, 0.05]]) { g.tr(0.17, 1.02 + d * 0.3, 0.07 - d, -1.3 + PI, 0.25, 0.3); g.loft([{ y: 0, rx: 0.012, rz: 0.026 }, { y: l, rx: 0.01, rz: 0.022 }], { seg: 8, sub: 1, cap1: true }); g.mat(C(0x17141a), 0.8, 0, T_QUILT, 0.2); g.tr(0, -0.02, 0); g.lathe([[0.014, -0.2 * l / 0.82], [0.015, 0]], 8, { cap0: true }); g.pop(); g.mat(lac, 0.4, 0.2, T_PLATE, 0.6); g.pop(); }
      katana(g, P, -1, { len: 0.72, curve: 0.035 });
    } else { // ashigaru: jingasa, simple do, yari, sashimono banner
      lames(3, (k) => H.torso(g, { grow: 0.038, y0: 1.08 + k * 0.11, y1: 1.18 + k * 0.11, k: 1.02, kz: 1.06, thick: 0.007, bone: k ? 'chest' : H.TW, cap1: false }));
      for (let q = 0; q < 3; q++) { const a = PI / 2 + (q - 1) * 1.1; g.mat(lac, 0.4, 0.3, T_PLATE, 1.0); H.skirt(g, { y0: 1.02, y1: 0.82, grow: 0.06, flare: 0.02, arc: [a - 0.45, a + 0.45], seg: 5, thick: 0.006, wTop: 1.04 }); }
      H.head(g, { skin, hair: COL.hair });
      g.bone('head'); g.mat(lac, 0.35, 0.4, T_PLATE, 0.6); g.tr(0, 1.735, 0); g.lathe([[0.25, -0.0], [0.2, 0.03], [0.1, 0.075], [0.02, 0.1], [0.0, 0.102]], 26, { thick: 0.005 }); g.pop();
      g.mat(V.tint(C(0xc9a050)), 0.4, 0.9, T_PLATE, 0.4); g.tr(0, 1.8, 0.11, -0.7, 0, 0); g.lathe([[0.0, 0], [0.022, 0], [0.022, 0.004], [0.0, 0.006]], 12); g.pop();
      g.bone('back'); g.mat(COL.woodDk, 0.8, 0, T_WOOD, 0.4); g.tube([[0, 1.15, -0.16], [0, 2.3, -0.17]], 0.01, { seg: 6, sub: 1 }); g.tube([[0, 2.26, -0.17], [-0.0, 2.26, -0.17]], 0.01, { seg: 5, sub: 1 });
      const fi = Math.floor(V.r() * 3), flag = [C(0xd8d0c0), C(0x8a2a22), C(0x2a3a6a)][fi]; g.mat(flag, 0.95, 0, T_CLOTH, 0.3); g.surf(6, 8, (u, v) => [0.01, lerp(2.27, 1.72, v), -0.17 - u * 0.2 * (1 - 0.15 * v) - 0.01 * Math.sin(v * 6 + u * 2)], { thick: 0.003 });
      g.mat(fi === 0 ? C(0x8a2a22) : C(0xd8d0c0), 0.95, 0, T_CLOTH, 0.3); g.tr(0.016, 2.02, -0.27); g.sphere(0.055, 0.055, 0.004, 12, 4); g.pop();
      spear(g, P, -1, { z0: -1.2, z1: 1.55, blade: 0.3, wide: 0.022, col: lac, tassel: C(0x8a2a22) });
    }
    return finish(g, rig, P, { tip: ['wR', -(P.sh + 0.03), 0.835, 0.95] });
  }
  const kcarry = stance({ rUp: [-0.35, 0, -0.2], rFore: [-1.6, 0, 0], rHand: [-0.2, 0, 0], lUp: [-0.15, 0, 0.12], lFore: [-0.5, 0, 0] });
  const kready = rdy({ hips: [0.06, -0.4, 0], spine: [0.08, -0.05, 0], head: [0, 0.4, 0], rUp: [-0.85, 0, -0.35], rFore: [-1.2, 0.4, 0], rHand: [-0.6, 0, 0], lUp: [-0.85, 0, 0.45], lFore: [-1.2, 1.1, 0] });
  const kiri = mkClip(0.42, [
    { t: 0.3, e: 'out', b: { hips: [0.0, -0.3, 0], chest: [-0.2, -0.1, 0], rUp: [-2.9, 0, -0.3], rFore: [-0.7, 0, 0], rHand: [-0.6, 0, 0], lUp: [-2.7, 0, 0.35], lFore: [-0.9, 0.6, 0] }, root: [0, 0.02, -0.06] },
    { t: 0.42, e: 'in', b: { hips: [0.15, 0.0, 0], spine: [0.25, 0, 0], chest: [0.35, 0.1, 0], rUp: [-1.2, 0, -0.2], rFore: [-0.3, 0, 0], rHand: [0.4, 0, 0], lUp: [-1.1, 0, 0.3], lFore: [-0.5, 0.6, 0], lThigh: [-0.9, 0, 0.08], lShin: [0.8, 0, 0], rThigh: [0.45, 0, -0.1], rShin: [0.3, 0, 0] }, root: [0, -0.12, 0.35] },
    { t: 0.68, b: {}, root: [0, -0.12, 0.35] }], kready);
  const yari = mkClip(0.4, [
    { t: 0.26, e: 'out', b: { hips: [0.05, -0.7, 0], chest: [0, -0.3, 0], rUp: [0.2, 0, -0.3], rFore: [-1.5, 0, 0], lUp: [-0.9, 0, 0.3], lFore: [-0.9, 0.9, 0] }, root: [0, -0.04, -0.12] },
    { t: 0.4, e: 'snap', b: { hips: [0.1, -0.2, 0], chest: [0.15, 0.2, 0], rUp: [-1.1, 0, -0.1], rFore: [-0.3, 0, 0], lUp: [-1.4, 0, 0.1], lFore: [-0.3, 0.6, 0], lThigh: [-0.9, 0, 0.08], lShin: [0.8, 0, 0], rThigh: [0.4, 0, -0.1] }, root: [0, -0.1, 0.42] },
    { t: 0.65, b: {}, root: [0, -0.1, 0.4] }], HC.lamplighter.style.ready);
  const carry = i === 2 ? HC.lamplighter.style.carry : kcarry;
  return { build, style: style({ carry, ready: i === 2 ? HC.lamplighter.style.ready : kready, clips: { attack: i === 2 ? yari : kiri }, swingL: 0.6, swingR: 0.2, gait: { bounce: 0.75, sway: 0.9, lean: 1.1, lift: 0.9 } }), death: 'down', mat: 'metal', grip: i === 2 ? null : shaftGrip(P, -0.12) };
}

/* ===================== FANTASY MAGE ===================== */
function mage(i, seed) {
  const V = variety(seed), P = { sh: i === 2 ? 0.205 : 0.188, hp: 0.093 };
  const robe = V.tint(V.pick([C(0x2a2a52), C(0x4a1e2a), C(0x1e3a34), C(0x3a3020), C(0x2c2c30)])), robe2 = mixC(robe, [0.02, 0.02, 0.02], 0.4), magic = V.pick([C(0x8ab8ff), C(0xff9a4a), C(0x9aff8a), C(0xd88aff)]);
  const trimC = V.tint(C(0x9a7a3a));
  function build() {
    const { rig, g, H } = start(P);
    both((s) => { g.mat(C(0x26262a), 0.95, 0, T_CLOTH, 1.4); H.leg(g, P, s, { y0: 0.3, y1: 0.99, k: 0.98 }); g.mat(COL.leatherDk, 0.76, 0, T_LEATHER, 1.8); H.boot(g, P, s, { top: 0.32 }); });
    g.mat(robe, 0.95, 0, T_CLOTH, 0.8); H.torso(g, { grow: 0.016, y0: 0.99, y1: 1.5, blouse: 0.014, k: 0.98 });
    g.mat(robe, 0.95, 0, T_CLOTH, 1.8); H.skirt(g, { y0: 1.04, y1: i === 2 ? 0.5 : 0.1, grow: 0.018, flare: i === 2 ? 0.08 : 0.15, seg: 30, thick: 0.007, wave: 0.055, folds: 9 });
    // trim band at the hem and an over-robe open at the front
    g.mat(robe2, 0.95, 0, T_CLOTH, 1.0); H.torso(g, { grow: 0.028, y0: 1.0, y1: 1.5, arc: [PI / 2 + 0.3, PI / 2 - 0.3 + TAU], thick: 0.007, wr: 0.035, wra: 4, wry: 16 });
    if (i !== 2) { g.mat(robe2, 0.95, 0, T_CLOTH, 1.6); H.skirt(g, { y0: 1.04, y1: 0.3, grow: 0.034, flare: 0.13, arc: [PI / 2 + 0.45, PI / 2 - 0.45 + TAU], seg: 26, thick: 0.009, wave: 0.05, folds: 7 }); }
    g.mat(trimC, 0.5, 0.6, T_PLATE, 0.6); g.bone(H.skirtW(1.04));
    { const yH = i === 2 ? 0.51 : 0.11, fl = i === 2 ? 0.08 : 0.15, N = 30, pts = []; for (let k = 0; k <= N; k++) { const a = k / N * TAU, c = Math.cos(a), s = Math.sin(a); pts.push([c * (0.153 + 0.018 + fl) * (1 + 0.035 * Math.sin(a * 9)), yH + 0.012, s * (s > 0 ? 0.103 + 0.018 + fl * 0.9 : 0.102 + 0.018 + fl * 1.1) * (1 + 0.035 * Math.sin(a * 9))]); } g.tube(pts, 0.011, { seg: 5, sub: 1, cap: false }); }
    both((s) => { g.mat(robe2, 0.95, 0, T_CLOTH, 0.7); HW.bellSleeve(g, P, s); g.mat(C(0x6e5040), 0.6, 0, T_SKIN, 0.4); H.fist(g, P, s); });
    g.mat(V.tint(C(0x8a7040)), 0.9, 0, T_CLOTH, 0.6); H.belt(g, { grow: 0.04, w: 0.018, col: V.tint(C(0x6a5432)) });
    g.bone(H.skirtW(1.04)); g.mat(COL.rope, 0.9, 0, T_CLOTH, 0.6); g.tube([[0.05, 1.03, 0.15], [0.06, 0.85, 0.17], [0.04, 0.7, 0.16]], 0.006, { seg: 4, sub: 2 });
    H.flask(g, -0.18, 0.95, 0.05, 1.0, magic, 0.6, H.skirtW(1.04), 0, 0.1);
    if (i === 2) { // battle mage: spaulders, book at the hip, short robe, shard staff
      both((s) => HW.spaulder(g, P, s, { s: 1.15, col: C(0x6a6a70) }));
      g.mat(C(0x4a2a1a), 0.7, 0, T_LEATHER, 0.6); g.bone(H.skirtW(1.02)); g.tr(0.2, 0.92, 0.0, 0, 0.3, 0); g.box(0.04, 0.17, 0.13, 10); g.pop();
      g.mat(C(0xd8cfb8), 0.9, 0, T_CLOTH, 0.3); g.tr(0.205, 0.925, 0.0, 0, 0.3, 0); g.box(0.042, 0.155, 0.12, 10); g.pop();
    }
    H.head(g, { skin: V.pick([SKIN.light, SKIN.mid]), beard: i === 0 ? 1.0 : i === 2 ? 0.5 : 0, hair: i === 0 ? COL.hairGrey : COL.hair });
    if (i === 0) { // long beard below the default one, pointed hat with a bent tip and wide brim
      g.bone('head'); g.mat(COL.hairGrey, 0.95, 0, T_FUR, 0.3); g.loft([{ y: 1.36, rx: 0.01, rz: 0.012, z: 0.1 }, { y: 1.42, rx: 0.04, rz: 0.03, z: 0.1 }, { y: 1.5, rx: 0.06, rz: 0.04, z: 0.085 }, { y: 1.56, rx: 0.06, rz: 0.04, z: 0.07 }], { seg: 10, sub: 3, cap0: true, wr: 0.15, wra: 4, wry: 30 });
      g.mat(V.tint(robe, 0.05), 0.95, 0, T_CLOTH, 0.4);
      g.surf(30, 3, (u, v) => { const a = u * TAU, r = lerp(0.102, 0.25, v); return [Math.cos(a) * r, 1.745 - v * 0.02 - 0.03 * v * v * (1 + Math.sin(a * 2 + 1)), Math.sin(a) * r * 1.08]; }, { closeU: true, thick: 0.005 });
      const pts = [[0, 1.74, 0], [0, 1.86, -0.01], [0, 1.98, -0.04], [0, 2.08, -0.1], [0, 2.12, -0.19]];
      g.tube(pts, (t) => lerp(0.104, 0.006, Math.pow(t, 0.8)), { seg: 16, sub: 4, cap: true });
      g.mat(trimC, 0.5, 0.6, T_PLATE, 0.3); g.lathe([[0.106, 1.755], [0.11, 1.775], [0.104, 1.795]], 20);
      const tip = HW.staff(g, P, -1, { z0: -1.1, z1: 1.0, head: 'crook', col: COL.woodDk });
      g.bone('wR'); g.mat(magic, 0.2, 0, T_GLOW, 1.6); g.tr(tip[0], tip[1] + 0.08, tip[2] + 0.02); g.sphere(0.04, 0.04, 0.04, 10, 7); g.pop();
    } else if (i === 1) { // sorceress: deep hood, circlet, glowing orb held in the left hand
      g.bone('head'); g.mat(COL.hair, 0.9, 0, T_FUR, 0.2); g.loft([{ y: 1.62, rx: 0.076, rz: 0.03, rb: 0.096, z: -0.004 }, { y: 1.7, rx: 0.086, rz: 0.08, rb: 0.106 }, { y: 1.76, rx: 0.084, rz: 0.098, rb: 0.106 }, { y: 1.8, rx: 0.06, rz: 0.075, rb: 0.08 }], { seg: 14, sub: 3, cap1: true });
      g.loft([{ y: 1.36, rx: 0.06, rz: 0.03, rb: 0.03, z: -0.08 }, { y: 1.5, rx: 0.07, rz: 0.03, rb: 0.04, z: -0.1 }, { y: 1.64, rx: 0.08, rz: 0.04, rb: 0.05, z: -0.06 }], { seg: 10, sub: 3, cap0: true, wr: 0.1 });
      g.mat(trimC, 0.35, 0.9, T_PLATE, 0.2); g.loft([{ y: 1.738, rx: 0.088, rz: 0.104, rb: 0.106 }, { y: 1.75, rx: 0.088, rz: 0.104, rb: 0.106 }], { seg: 18, sub: 1, thick: 0.003 });
      g.mat(magic, 0.2, 0, T_GLOW, 1.2); g.tr(0, 1.745, 0.105); g.sphere(0.01, 0.012, 0.006, 6, 4); g.pop();
      H.hood(g, P, { col: V.tint(robe2, 0.05), open: 0.72, peak: 0.1 });
      H.cloak(g, P, { hem: 0.2, wrap: 0.4, col: V.tint(robe2, 0.05), flare: 0.14, fold: 0.11, clasp: true });
      g.bone('wL'); g.mat(magic, 0.2, 0, T_GLOW, 1.8); g.tr(P.sh + 0.03, 0.79, 0.07); g.sphere(0.055, 0.055, 0.055, 12, 8); g.pop();
      g.mat(C(0x3a3020), 0.5, 0.8, T_PLATE, 0.3); for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; g.tube([[P.sh + 0.03, 0.8, 0.04], [P.sh + 0.03 + Math.cos(a) * 0.05, 0.79 + Math.sin(a) * 0.05, 0.08]], 0.004, { seg: 4, sub: 1 }); }
    } else {
      g.bone('head'); HW.skullcap(g, { col: C(0x6a6a70) });
      const tip = HW.staff(g, P, -1, { z0: -1.1, z1: 0.98, head: 'shard', col: COL.woodDk });
    }
    return finish(g, rig, P, { tip: ['wR', -(P.sh + 0.03), 0.835, 1.0], hand: ['lHand', P.sh + 0.03, 0.82, 0.03] });
  }
  const st = i === 1 ? HC.apothecary.style : i === 0 ? HC.lamplighter.style : HC.rimebinder.style;
  const cast = mkClip(0.5, [
    { t: 0.3, e: 'out', b: { chest: [-0.15, 0.2, 0], lUp: [-1.2, 0, 0.6], lFore: [-1.2, 0.4, 0], rUp: [-0.3, 0, -0.3], rFore: [-0.8, 0, 0], head: [-0.15, 0.1, 0] }, root: [0, 0.02, -0.05] },
    { t: 0.5, e: 'snap', b: { chest: [0.15, -0.15, 0], spine: [0.1, 0, 0], lUp: [-1.55, 0, 0.15], lFore: [-0.15, 0.4, 0], lHand: [0.6, 0, 0], rUp: [0.1, 0, -0.3], lThigh: [-0.6, 0, 0.1], lShin: [0.6, 0, 0] }, root: [0, -0.06, 0.2] },
    { t: 0.78, b: {}, root: [0, -0.06, 0.2] }], st.ready);
  const carry = i === 1 ? stance({ lUp: [-0.35, 0, 0.18], lFore: [-1.35, 0.3, 0], rUp: [0.03, 0, -0.1], rFore: [-0.35, 0, 0] }) : HC.rimebinder.style.carry;
  return { build, style: style({ carry, ready: st.ready, clips: { attack: i === 1 ? cast : i === 0 ? HC.rimebinder.style.clips.hoar : HC.rimebinder.style.clips.attack }, swingL: 0.6, swingR: 0.05, stride: 0.9, gait: { bounce: 0.7, sway: 0.8, lean: 0.9 } }), death: 'down', disCol: magic.map((c) => c * 2) };
}

/* ===================== ZOMBIE ===================== */
function zombie(i, seed) {
  const V = variety(seed), bloat = i === 1, knight = i === 2;
  const P = { sh: bloat ? 0.22 : 0.198 + V.rnd(0.008), hp: bloat ? 0.108 : 0.096 };
  const skin = V.tint(V.pick([C(0x5a6a50), C(0x6a6a58), C(0x4a5a4a), C(0x707a62)]), 0.08), rot = mixC(skin, [0.08, 0.02, 0.02], 0.5), shirt = V.tint(V.pick([C(0x5a5448), C(0x4a3a3a), C(0x3a4048)])), pants = V.tint(C(0x2e2c2a));
  function build() {
    const { rig, g, H } = start(P);
    both((s) => {
      g.mat(pants, 0.97, 0, T_CLOTH, 2.2); H.leg(g, P, s, { y0: s > 0 ? 0.42 : 0.3, y1: 0.99, k: bloat ? 1.2 : 1.04, wr: 0.09, wra: 5, wry: 20 });
      g.mat(skin, 0.7, 0, T_SKIN, 1.0); H.leg(g, P, s, { y0: 0.1, y1: s > 0 ? 0.44 : 0.32, k: 0.92, wr: 0.04 });
      if (knight) { g.mat(C(0x4a4038), 0.55, 0.9, T_PLATE, 2.6); HW.greave(g, P, s, { col: C(0x4a4038) }); g.mat(C(0x4a4038), 0.55, 0.9, T_PLATE, 2.6); H.boot(g, P, s, { top: 0.2 }); }
      else { g.mat(skin, 0.7, 0, T_SKIN, 1.0); H.boot(g, P, s, { top: 0.1 }); }
    });
    g.mat(skin, 0.7, 0, T_SKIN, 0.9); H.torso(g, { grow: 0.0, y0: 0.9, y1: 1.5, belly: bloat ? 0.09 : 0, k: bloat ? 1.12 : 0.95, kz: bloat ? 1.2 : 0.95 });
    // exposed ribs on one side
    g.bone('chest'); g.mat(C(0x9a9078), 0.8, 0, T_BONE, 0.8); for (let k = 0; k < 4; k++) { const y = 1.36 - k * 0.055, z = frontZ(g, 0.08, y, 0.03); g.tube([[0.02, y + 0.01, z + 0.004], [0.08, y, z + 0.002], [0.135, y - 0.02, z - 0.04]], 0.007, { seg: 5, sub: 2 }); }
    g.mat(rot, 0.6, 0, T_PEAT, 0.6); g.tr(0.08, 1.24, frontZ(g, 0.08, 1.24, 0.03) - 0.006); g.sphere(0.055, 0.12, 0.012, 8, 6); g.pop();
    // torn shirt: three arcs that leave gaps, ragged hem
    if (!knight) {
      g.mat(shirt, 0.97, 0, T_CLOTH, 1.6);
      for (const [a0, a1, y1] of [[PI / 2 + 0.5, PI + 0.9, 1.5], [PI + 1.1, TAU + 0.2, 1.48], [-0.1, 0.25, 1.45]]) H.torso(g, { grow: 0.016, y0: 0.98, y1, arc: [a0, a1], thick: 0.004, k: bloat ? 1.12 : 0.95, kz: bloat ? 1.2 : 0.95, belly: bloat ? 0.09 : 0, wr: 0.08, wra: 6, wry: 20 });
      H.skirt(g, { y0: 1.02, y1: 0.86, grow: 0.022 + (bloat ? 0.05 : 0), flare: 0.03, arc: [PI / 2 + 0.6, TAU + 0.1], seg: 16, thick: 0.004, wave: 0.12, folds: 13 });
      if (bloat) { g.mat(V.tint(C(0x6a6050)), 0.8, 0, T_LEATHER, 2.0); H.torso(g, { grow: 0.11, y0: 1.0, y1: 1.3, arc: [PI / 2 - 0.9, PI / 2 + 0.9], seg: 10, thick: 0.005, belly: 0.09, k: 1.12, kz: 1.2 }); H.skirt(g, { y0: 1.04, y1: 0.55, grow: 0.12, flare: 0.05, arc: [PI / 2 - 0.85, PI / 2 + 0.85], seg: 10, thick: 0.005, wave: 0.06, folds: 6 }); }
    } else { // dead knight: rusted mail shirt in rags, broken cuirass, dented kettle hat
      g.mat(C(0x4a4844), 0.6, 0.7, T_MAIL, 1.4); H.torso(g, { grow: 0.014, y0: 0.99, y1: 1.5, wr: 0.04, arc: [PI / 2 - 2.6, PI / 2 + 2.3] }); H.skirt(g, { y0: 1.03, y1: 0.7, grow: 0.022, flare: 0.05, thick: 0.007, wave: 0.06, folds: 9, arc: [PI / 2 - 2.2, PI / 2 + 1.9] });
      g.mat(C(0x4a4038), 0.55, 0.9, T_PLATE, 2.0); H.torso(g, { grow: 0.04, y0: 1.12, y1: 1.45, thick: 0.006, bone: 'chest', arc: [PI / 2 - 1.1, PI / 2 + 0.7], wr: 0.03 });
      HW.spaulder(g, P, -1, { s: 1.15, col: C(0x4a4038) });
      g.mat(C(0x2e2620), 0.97, 0, T_CLOTH, 2.0); H.skirt(g, { y0: 1.0, y1: 0.48, grow: 0.06, flare: 0.05, arc: [PI / 2 - 0.5, PI / 2 + 0.5], seg: 8, thick: 0.004, wave: 0.09, folds: 11 });
    }
    both((s) => {
      const torn = knight ? false : (s > 0 ? 1.2 : 1.32);
      g.mat(skin, 0.7, 0, T_SKIN, 0.8); H.arm(g, P, s, { k: bloat ? 1.15 : 0.9, wr: 0.05 });
      if (torn) { g.mat(shirt, 0.97, 0, T_CLOTH, 1.0); H.arm(g, P, s, { y0: torn, y1: 1.5, grow: 0.012, k: 1.0, cap1: false, wr: 0.12, wra: 5 }); }
      if (knight) { g.mat(C(0x4a4844), 0.6, 0.7, T_MAIL, 1.0); H.arm(g, P, s, { y0: 1.12, y1: 1.5, grow: 0.014, k: 1.05, wr: 0.05 }); }
      g.mat(skin, 0.7, 0, T_SKIN, 0.8); H.fist(g, P, s);
      // long nails
      g.bone(s > 0 ? 'lHand' : 'rHand'); g.mat(C(0x3a3428), 0.6, 0, T_BONE, 0.6); for (let k = 0; k < 4; k++) g.tube([[s * (P.sh + 0.03) - s * 0.027 + s * k * 0.018, 0.8, 0.055], [s * (P.sh + 0.03) - s * 0.027 + s * k * 0.018, 0.78, 0.075]], (t) => 0.004 * (1 - t), { seg: 4, sub: 1 });
    });
    if (!knight) { g.mat(C(0x2a2018), 0.8, 0, T_LEATHER, 1.4); H.belt(g, { grow: 0.026 + (bloat ? 0.05 : 0), w: 0.02 }); }
    // head: sunken, pale eyes, hanging jaw, patchy hair
    H.head(g, { skin });
    g.bone('head'); g.mat(rot, 0.8, 0, T_SKIN, 0.4); for (const s of [-1, 1]) { g.tr(s * 0.031, 1.699, 0.08); g.sphere(0.024, 0.018, 0.016, 8, 5); g.pop(); }
    eyesGlow(g, V.pick([C(0xd8e0a0), C(0xe0e8e0), C(0xff7a4a)]), 0.6, 1.7, 0.092);
    g.mat(C(0x200e0c), 0.9, 0, T_SKIN, 0.2); g.tr(0, 1.6, 0.084); g.sphere(0.03, 0.022, 0.014, 8, 5); g.pop();
    g.mat(C(0x8a8470), 0.7, 0, T_BONE, 0.3); for (let k = 0; k < 5; k++) { g.tr(-0.02 + k * 0.01, 1.616, 0.094); g.sphere(0.004, 0.006, 0.003, 4, 3); g.pop(); }
    if (knight) { HW.kettle(g, { col: C(0x4a4038) }); }
    else { g.mat(C(0x2a2622), 0.95, 0, T_FUR, 0.3); g.loft([{ y: 1.66, rx: 0.08, rz: 0.03, rb: 0.096, z: -0.004 }, { y: 1.72, rx: 0.084, rz: 0.06, rb: 0.104 }, { y: 1.77, rx: 0.08, rz: 0.09, rb: 0.1 }, { y: 1.8, rx: 0.05, rz: 0.06, rb: 0.07 }], { seg: 14, sub: 2, arc: [PI * 0.8, TAU + 0.1], wr: 0.2, wra: 6, wry: 30 }); }
    if (knight) { inHand(g, P, -1, () => { g.mat(COL.leatherDk, 0.7, 0, T_LEATHER, 0.6); g.lathe([[0.013, -0.06], [0.016, -0.02], [0.015, 0.0], [0.013, 0.05]], 8); g.mat(C(0x5a5048), 0.5, 0.9, T_PLATE, 2.2); g.loft([{ y: 0.05, rx: 0.012, rz: 0.1, sq: 3 }, { y: 0.066, rx: 0.011, rz: 0.096, sq: 3 }], { seg: 8, sub: 1, cap0: true, cap1: true }); g.loft([{ y: 0.066, rx: 0.0045, rz: 0.026, sq: 1 }, { y: 0.32, rx: 0.004, rz: 0.024, sq: 1 }, { y: 0.4, rx: 0.003, rz: 0.012, sq: 1 }], { seg: 4, sub: 1, flat: true }); }); }
    return finish(g, rig, P, { tip: ['rHand', -(P.sh + 0.03), 0.8, 0.08], head: ['head', 0, 1.7, 0.1] });
  }
  const carry = { hips: [0.06, 0.1, 0.06], spine: [0.22, 0.05, 0.06], chest: [0.12, -0.08, 0.05], neck: [0.25, 0.1, 0.1], head: [-0.15, 0.25, 0.22],
    lUp: [-1.25, 0.1, 0.12], lFore: [-0.35, 0, 0], lHand: [0.2, 0, 0], rUp: [knight ? 0.05 : -0.95, 0, -0.18], rFore: [knight ? -0.3 : -0.55, 0, 0], rHand: [0.25, 0, 0],
    lThigh: [-0.12, 0.25, 0.08], lShin: [0.22, 0, 0], lFoot: [-0.1, 0, 0], rThigh: [-0.02, -0.3, -0.05], rShin: [0.18, 0, 0], rFoot: [-0.06, 0, 0.1] };
  const lunge = mkClip(0.5, [
    { t: 0.3, e: 'out', b: { spine: [0.0, 0, 0], chest: [-0.2, -0.2, 0], lUp: [-2.0, 0, 0.5], rUp: [-2.0, 0, -0.5], lFore: [-0.6, 0, 0], rFore: [-0.6, 0, 0], head: [-0.3, 0, 0] }, root: [0, 0.02, -0.08] },
    { t: 0.5, e: 'in', b: { spine: [0.55, 0, 0], chest: [0.4, 0.2, 0], lUp: [-1.4, 0, 0.05], rUp: [-1.4, 0, -0.05], lFore: [-0.2, 0, 0], rFore: [-0.2, 0, 0], head: [0.2, 0, 0], lThigh: [-0.7, 0, 0.1], lShin: [0.7, 0, 0] }, root: [0, -0.1, 0.32] },
    { t: 0.78, b: {}, root: [0, -0.1, 0.3] }], carry);
  return { build, style: { carry, clips: { attack: knight ? HC.warden.style.clips.attack : lunge }, swingL: 0.25, swingR: 0.35, strideAmp: 0.7, stride: 0.75, speedK: 0.6, gait: { bounce: 1.5, sway: 2.6, lean: 0.4, lift: 0.6 }, downPose: DOWN_POSE }, death: 'burn', disCol: [0.9, 0.55, 0.2], glow: 2.2, scale: bloat ? 1.04 : 1 };
}

/* ===================== GOBLIN ===================== */
function goblin(i, seed) {
  const V = variety(seed), P = { sh: 0.18, hp: 0.088 };
  const skin = V.tint(V.pick([C(0x4c5e30), C(0x56663a), C(0x445432), C(0x5e5e36)]), 0.07), cloth = V.tint(V.pick([C(0x4a3a2a), C(0x3a3424), C(0x5a4030)])), eye = V.pick([C(0xffd040), C(0xff6030), C(0xd0ff60)]);
  function build() {
    const { rig, g, H } = start(P);
    both((s) => { g.mat(skin, 0.6, 0, T_SKIN, 1.0); H.leg(g, P, s, { y0: 0.1, y1: 0.99, k: 0.72, wr: 0.04 }); g.mat(skin, 0.6, 0, T_SKIN, 1.0); H.boot(g, P, s, { top: 0.12 }); g.bone(s > 0 ? 'lShin' : 'rShin'); g.mat(cloth, 0.95, 0, T_CLOTH, 1.6); for (let k = 0; k < 3; k++) { g.tr(s * (P.hp + 0.005), 0.18 + k * 0.035, 0); g.lathe([[0.042, -0.012], [0.046, 0], [0.042, 0.012]], 9, { thick: 0.003 }); g.pop(); } });
    g.mat(skin, 0.6, 0, T_SKIN, 0.8); H.torso(g, { y0: 0.9, y1: 1.5, k: 0.82, kz: 0.86, belly: 0.03 });
    g.mat(cloth, 0.95, 0, T_CLOTH, 1.4); H.skirt(g, { y0: 1.02, y1: 0.78, grow: 0.02, flare: 0.04, arc: [PI / 2 - 0.7, PI / 2 + 0.7], seg: 8, thick: 0.004, wave: 0.07, folds: 5 }); H.skirt(g, { y0: 1.02, y1: 0.8, grow: 0.02, flare: 0.04, arc: [-PI / 2 - 0.8, -PI / 2 + 0.8], seg: 8, thick: 0.004, wave: 0.07, folds: 5 });
    g.mat(C(0x2a2018), 0.8, 0, T_LEATHER, 0.8); H.belt(g, { grow: 0.02, w: 0.02, col: C(0x2a2018) });
    both((s) => { g.mat(skin, 0.6, 0, T_SKIN, 0.8); H.arm(g, P, s, { k: 0.75 }); H.fist(g, P, s); });
    // big head: the kit head scaled about the neck, long ears, long nose, underbite fangs
    g.tr(0, 1.585, 0.0); g.tr(0, 0, 0, 0, 0, 0, 1.38); g.tr(0, -1.585, 0);
    H.head(g, { skin });
    g.bone('head'); g.mat(skin, 0.6, 0, T_SKIN, 0.3);
    g.loft([{ y: 1.648, rx: 0.016, rz: 0.03, rb: 0.01, z: 0.096 }, { y: 1.67, rx: 0.016, rz: 0.06, rb: 0.01, z: 0.096 }, { y: 1.695, rx: 0.01, rz: 0.03, rb: 0.01, z: 0.095 }], { seg: 8, sub: 2, cap0: true });
    for (const s of [-1, 1]) { g.surf(4, 6, (u, v) => { const w = 0.03 * Math.sin(u * PI) * (1 - v * 0.85); return [s * (0.075 + v * 0.13), 1.71 + v * 0.05 + (u - 0.5) * 0.05 * (1 - v), -0.01 - v * 0.04 + w * 0.6]; }, { thick: 0.008, flip: s < 0 }); }
    g.mat(C(0xd8d0b0), 0.6, 0, T_BONE, 0.2); for (const s of [-1, 1]) g.tube([[s * 0.028, 1.6, 0.088], [s * 0.032, 1.635, 0.094]], (t) => 0.007 * (1 - t), { seg: 4, sub: 1 });
    eyesGlow(g, eye, 1.0, 1.7, 0.092, 0.032);
    g.pop(); g.pop(); g.pop();
    if (i === 0) { // scout: hood + short cape, dagger
      g.tr(0, 1.585, 0.0); g.tr(0, 0, 0, 0, 0, 0, 1.38); g.tr(0, -1.585, 0); H.hood(g, P, { col: V.tint(C(0x3a3a24)), open: 0.75, peak: 0.12 }); g.pop(); g.pop(); g.pop();
      H.cloak(g, P, { hem: 0.85, wrap: 0.4, col: V.tint(C(0x3a3a24)), flare: 0.06, fold: 0.12, clasp: false });
      HW.sword(g, P, -1, { len: 0.28, w: 0.02, grip: 0.08, guard: 0.04, col: C(0x7a7470) });
    } else if (i === 1) { // warrior: pot helm, round wooden shield, spear
      g.tr(0, 1.585, 0.0); g.tr(0, 0, 0, 0, 0, 0, 1.38); g.tr(0, -1.585, 0); g.bone('head'); g.mat(C(0x4a4a46), 0.5, 0.8, T_PLATE, 1.0); capShell(g, { c: 1.7, rx: 0.1, ry: 0.13, rz: 0.12, yFront: 1.745, yBack: 1.7, thick: 0.007, flare: 0.012 }); g.pop(); g.pop(); g.pop();
      g.bone('lFore'); g.mat(V.tint(COL.wood), 0.8, 0, T_WOOD, 0.8); g.tr(P.sh + 0.1, 1.02, 0.0, 0, 0, PI / 2); g.lathe([[0.0, -0.012], [0.22, -0.012], [0.23, 0.0], [0.22, 0.012], [0.0, 0.015]], 18); g.mat(C(0x4a4a46), 0.5, 0.9, T_PLATE, 0.8); g.tr(0, 0.02, 0); g.sphere(0.05, 0.03, 0.05, 10, 5); g.pop(); g.pop();
      spear(g, P, -1, { z0: -0.7, z1: 0.95, blade: 0.18, col: COL.woodDk, metal: C(0x6a6460) });
    } else { // shaman: bone necklace, feather crown, staff topped with a glowing skull
      g.bone(chainY([['neck', 9], ['chest', 1.5]], 0.04)); g.mat(C(0xc8c0a0), 0.7, 0, T_BONE, 0.3);
      for (let k = 0; k < 11; k++) { const a = PI / 2 + (k - 5) * 0.22, r = 0.12; g.tr(Math.cos(a) * r, 1.43 - Math.abs(k - 5) * -0.006, Math.sin(a) * r * 1.05); g.sphere(0.012, 0.022, 0.01, 5, 4); g.pop(); }
      g.tr(0, 1.585, 0.0); g.tr(0, 0, 0, 0, 0, 0, 1.38); g.tr(0, -1.585, 0); g.bone('head');
      for (let k = 0; k < 7; k++) { const a = -PI / 2 + (k - 3) * 0.32; g.mat(k % 2 ? C(0x8a2a1a) : C(0x2a2a2a), 0.9, 0, T_FUR, 0.2); g.surf(2, 5, (u, v) => [Math.cos(a) * 0.09 + (u - 0.5) * 0.025 * (1 - v), 1.74 + v * 0.16, Math.sin(a) * 0.1 - v * 0.03], { thick: 0.003 }); }
      g.mat(C(0x6a5030), 0.8, 0, T_LEATHER, 0.4); g.loft([{ y: 1.73, rx: 0.088, rz: 0.104, rb: 0.106 }, { y: 1.755, rx: 0.088, rz: 0.104, rb: 0.106 }], { seg: 16, sub: 1, thick: 0.004 });
      g.pop(); g.pop(); g.pop();
      const tip = HW.staff(g, P, -1, { z0: -0.6, z1: 0.9, col: COL.woodDk });
      g.bone('wR'); g.mat(C(0xc8c0a0), 0.7, 0, T_BONE, 0.3); g.tr(tip[0], tip[1] + 0.02, tip[2] + 0.06); g.sphere(0.055, 0.06, 0.065, 10, 7); g.mat(eye, 0.3, 0, T_GLOW, 1.5); for (const s of [-1, 1]) { g.tr(s * 0.02, 0.01, 0.055); g.sphere(0.012, 0.012, 0.008, 6, 4); g.pop(); } g.pop();
    }
    return finish(g, rig, P, { tip: ['wR', -(P.sh + 0.03), 0.8, 0.3], head: ['head', 0, 1.7, 0.1] });
  }
  const carry = { hips: [0.08, 0.1, 0.04], spine: [0.32, 0, 0.02], chest: [0.22, 0, 0], neck: [-0.15, 0, 0], head: [-0.2, 0.15, 0.06], lUp: [-0.5, 0, 0.35], rUp: [-0.45, 0, -0.32], lFore: [-0.85, 0, 0], rFore: [-0.8, 0, 0], rHand: [0.3, 0, 0],
    lThigh: [-0.55, 0.25, 0.14], rThigh: [-0.5, -0.25, -0.14], lShin: [0.85, 0, 0], rShin: [0.85, 0, 0], lFoot: [-0.3, 0, 0], rFoot: [-0.3, 0, 0] };
  const stab = mkClip(0.38, [
    { t: 0.24, e: 'out', b: { spine: [0.2, 0, 0], chest: [0.0, -0.5, 0], rUp: [-0.6, 0, -0.6], rFore: [-1.6, 0, 0], lUp: [-1.1, 0, 0.6], lFore: [-1.0, 0, 0] }, root: [0, 0.06, -0.08] },
    { t: 0.38, e: 'snap', b: { spine: [0.6, 0, 0], chest: [0.3, 0.4, 0], rUp: [-1.3, 0, -0.1], rFore: [-0.2, 0, 0], rHand: [0.3, 0, 0], lUp: [-0.4, 0, 0.4] }, root: [0, -0.05, 0.4] },
    { t: 0.65, b: {}, root: [0, -0.05, 0.3] }], carry);
  return { build, style: { carry, clips: { attack: stab }, swingL: 0.9, swingR: 0.6, strideAmp: 1.1, stride: 0.66, gait: { bounce: 1.8, sway: 1.5, lift: 1.6 }, downPose: DOWN_POSE }, scale: 0.66, death: 'burst', disCol: [0.6, 1, 0.5], glow: 2.2 };
}

/* ===================== BRUTE ===================== */
function brute(i, seed) {
  const V = variety(seed), troll = i === 2, ogre = i === 1;
  const P = { sh: troll ? 0.26 : 0.28, hp: 0.12 };
  const skin = V.tint(troll ? V.pick([C(0x46524e), C(0x4e584c)]) : ogre ? V.pick([C(0x6e5a46), C(0x665844)]) : V.pick([C(0x4a5a38), C(0x52583a), C(0x42523a)]), 0.06);
  function build() {
    const { rig, g, H } = start(P);
    const KL = troll ? 1.25 : 1.55, KA = troll ? 1.45 : 1.75, KT = ogre ? 1.42 : 1.36;
    both((s) => {
      g.mat(skin, 0.65, 0, T_SKIN, 1.0); H.leg(g, P, s, { y0: 0.1, y1: 0.99, k: KL, wr: 0.04 });
      g.mat(skin, 0.65, 0, T_SKIN, 1.0); H.boot(g, P, s, { top: 0.12 });
      if (!troll) { g.mat(V.tint(C(0x4a3a28)), 0.85, 0, T_LEATHER, 2.0); H.leg(g, P, s, { y0: 0.14, y1: 0.36, grow: 0.014, k: KL, thick: 0.006, wr: 0.08, bone: s > 0 ? 'lShin' : 'rShin' }); }
    });
    g.mat(skin, 0.65, 0, T_SKIN, 0.9); H.torso(g, { y0: 0.9, y1: 1.5, k: KT, kz: KT * (ogre ? 1.18 : 1.05), belly: ogre ? 0.14 : 0.05, wr: 0.02 });
    // shoulder hump + traps
    g.bone(chainY([['neck', 9], ['chest', 1.5]], 0.05)); g.mat(skin, 0.65, 0, T_SKIN, 0.6);
    g.loft([{ y: 1.4, rx: 0.2, rz: 0.12, rb: 0.16 }, { y: 1.5, rx: 0.17, rz: 0.1, rb: 0.16 }, { y: 1.57, rx: 0.1, rz: 0.08, rb: 0.12 }, { y: 1.6, rx: 0.06, rz: 0.06, rb: 0.07 }], { seg: 16, sub: 2, cap1: true });
    g.mat(V.tint(C(0x3a2e20)), 0.9, 0, troll ? T_FUR : T_LEATHER, 1.5);
    H.skirt(g, { y0: 1.04, y1: 0.66, grow: 0.06 + (ogre ? 0.08 : 0), flare: 0.06, arc: [PI / 2 - 0.85, PI / 2 + 0.85], seg: 10, thick: 0.006, wave: 0.06, folds: 6 });
    H.skirt(g, { y0: 1.04, y1: 0.7, grow: 0.06, flare: 0.06, arc: [-PI / 2 - 0.9, -PI / 2 + 0.9], seg: 10, thick: 0.006, wave: 0.06, folds: 6 });
    g.mat(C(0x2a2018), 0.8, 0, T_LEATHER, 0.8); H.belt(g, { grow: 0.07 + (ogre ? 0.1 : 0), w: 0.04, col: C(0x2a2018) });
    both((s) => {
      g.mat(skin, 0.65, 0, T_SKIN, 0.8); H.arm(g, P, s, { k: KA, wr: 0.03, y0: troll ? 0.905 : 0.905 });
      g.tr(s * (P.sh + 0.03), 0.84, 0); g.tr(0, 0, 0, 0, 0, 0, troll ? 1.55 : 1.45); g.tr(-s * (P.sh + 0.03), -0.84, 0); H.fist(g, P, s); g.pop(); g.pop(); g.pop();
      if (!troll) { g.mat(C(0x3a2e22), 0.8, 0, T_LEATHER, 0.8); g.bone(s > 0 ? 'lFore' : 'rFore'); g.tr(s * (P.sh + 0.025), 0.98, 0); g.lathe([[0.075, -0.06], [0.082, 0.0], [0.078, 0.06]], 12, { thick: 0.006 }); g.pop(); }
    });
    if (i === 0) { // orc warrior: iron plates on a harness, spiked pauldron, big cleaver-axe
      g.mat(C(0x3a3836), 0.55, 0.9, T_PLATE, 1.4); HW.spaulder(g, P, 1, { s: 1.75, col: C(0x3a3836) });
      g.bone('lUp'); g.mat(C(0x6a6660), 0.45, 0.9, T_PLATE, 1.2); for (let k = 0; k < 3; k++) g.tube([[P.sh + 0.07, 1.47 - k * 0.04, -0.03 + k * 0.05], [P.sh + 0.12, 1.56 - k * 0.04, -0.04 + k * 0.05]], (t) => 0.014 * (1 - t), { seg: 5, sub: 1 });
      g.mat(C(0x3a3836), 0.55, 0.9, T_PLATE, 1.2); H.torso(g, { grow: 0.03, y0: 1.18, y1: 1.44, k: KT, kz: KT * 1.05, thick: 0.007, bone: 'chest', arc: [PI / 2 - 0.85, PI / 2 + 0.85], wr: 0.02 });
      H.strap(g, { side: 1, grow: 0.07, w: 0.03, col: C(0x2a2018) });
      inHand(g, P, -1, () => { g.mat(COL.woodDk, 0.8, 0, T_WOOD, 0.6); g.lathe([[0.022, -0.3], [0.026, 0.0], [0.024, 0.75], [0.0, 0.77]], 8); g.mat(C(0x5a5650), 0.4, 0.9, T_PLATE, 1.4); g.tr(0, 0.62, 0.0); g.surf(6, 6, (u, v) => [((u - 0.5) * 0.012), (v - 0.5) * 0.24 + 0.0, 0.03 + u * 0 + v * 0 + 0.24 * Math.sin(v * PI) * 0.8 * (0.5 + 0.5 * u)], { thick: 0.012 }); g.pop(); });
    } else if (i === 1) { // ogre: big belly, rope belt, tree-trunk club
      g.mat(COL.rope, 0.9, 0, T_CLOTH, 0.8); g.bone('chest'); g.tube([[0.25, 1.46, 0.0], [0.05, 1.3, frontZ(g, 0.05, 1.3, 0.04)], [-0.2, 1.1, frontZ(g, -0.2, 1.1, 0.05)], [-0.28, 1.0, 0.0]], 0.014, { seg: 5, sub: 3, cap: false });
      inHand(g, P, -1, () => { g.mat(V.tint(C(0x4a3a26)), 0.95, 0, T_WOOD, 0.8); g.lathe([[0.03, -0.2], [0.035, 0.0], [0.06, 0.4], [0.1, 0.8], [0.11, 0.92], [0.06, 0.98], [0.0, 1.0]], 10); g.mat(C(0x3a3020), 0.95, 0, T_PEAT, 0.6); for (let k = 0; k < 4; k++) { const a = k * 1.6; g.tube([[Math.cos(a) * 0.09, 0.7 + k * 0.05, Math.sin(a) * 0.09], [Math.cos(a) * 0.15, 0.78 + k * 0.05, Math.sin(a) * 0.15]], (t) => 0.02 * (1 - t), { seg: 5, sub: 1 }); } });
    } else { // troll: mossy fur mantle, stone in hand
      H.furMantle(g, P, { col: V.tint(C(0x3a4a2a)), back: 0.3 });
      g.bone('wR'); rockAt(g, [-(P.sh + 0.03), 0.79, 0.1], [0.12, 0.11, 0.12], 900 + (seed % 50));
    }
    // head: small for the body, heavy brow, tusks
    g.tr(0, 1.56, 0.04); g.tr(0, 0, 0, 0.1, 0, 0, 1.12); g.tr(0, -1.585, 0);
    H.head(g, { skin, beard: troll ? 0.6 : 0, hair: troll ? C(0x2a3a2a) : COL.hair });
    g.bone('head'); g.mat(skin, 0.65, 0, T_SKIN, 0.3); g.loft([{ y: 1.71, rx: 0.08, rz: 0.1, rb: 0.03, z: 0.0 }, { y: 1.725, rx: 0.085, rz: 0.112, rb: 0.03 }, { y: 1.745, rx: 0.08, rz: 0.1, rb: 0.03 }], { seg: 12, sub: 1, arc: [0.0, PI], thick: 0.01 });
    g.loft([{ y: 1.59, rx: 0.07, rz: 0.098, rb: 0.03 }, { y: 1.62, rx: 0.075, rz: 0.104, rb: 0.03 }, { y: 1.64, rx: 0.07, rz: 0.098, rb: 0.03 }], { seg: 12, sub: 1, arc: [0.05, PI - 0.05], thick: 0.012 });
    g.mat(C(0xd8d0b0), 0.6, 0, T_BONE, 0.3); for (const s of [-1, 1]) g.tube([[s * 0.04, 1.6, 0.09], [s * 0.05, 1.65, 0.1], [s * 0.042, 1.69, 0.088]], (t) => 0.012 * (1 - t * 0.8), { seg: 5, sub: 2 });
    eyesGlow(g, troll ? C(0xd0ff80) : C(0xffb040), 0.5, 1.7, 0.091);
    if (i === 0) { g.mat(C(0x1a1a1a), 0.9, 0, T_FUR, 0.3); for (let k = 0; k < 6; k++) g.tube([[0, 1.79, -0.06 + k * 0.025], [0, 1.82, -0.13 - k * 0.03], [0, 1.7, -0.22 - k * 0.02]], (t) => 0.012 * (1 - t * 0.7), { seg: 4, sub: 2 }); }
    g.pop(); g.pop(); g.pop();
    return finish(g, rig, P, { tip: ['wR', -(P.sh + 0.03), 0.835, 0.8], head: ['head', 0, 1.7, 0.1] });
  }
  const carry = troll
    ? { spine: [0.3, 0, 0], chest: [0.25, 0, 0], neck: [-0.3, 0, 0], head: [-0.2, 0, 0], lUp: [-0.25, 0, 0.18], rUp: [-0.25, 0, -0.18], lFore: [-0.3, 0, 0], rFore: [-0.3, 0, 0], lThigh: [-0.2, 0.15, 0.12], rThigh: [-0.2, -0.15, -0.12], lShin: [0.35, 0, 0], rShin: [0.35, 0, 0], lFoot: [-0.15, 0, 0], rFoot: [-0.15, 0, 0] }
    : stance({ spine: [0.12, 0, 0], chest: [0.1, 0, 0], neck: [-0.1, 0, 0], lUp: [-0.05, 0, 0.32], rUp: [-0.2, 0, -0.32], lFore: [-0.45, 0, 0], rFore: [-0.75, 0, 0], rHand: [0.4, 0, 0], lThigh: [-0.2, 0.32, 0.16], rThigh: [0.0, -0.3, -0.16] });
  const smash = mkClip(0.55, [
    { t: 0.36, e: 'out', b: { spine: [-0.15, 0, 0], chest: [-0.25, -0.2, 0], rUp: [-2.9, 0, -0.3], rFore: [-0.6, 0, 0], lUp: [-2.4, 0, 0.4], lFore: [-0.8, 0, 0], head: [-0.3, 0, 0] }, root: [0, 0.05, -0.08] },
    { t: 0.55, e: 'in', b: { spine: [0.6, 0, 0], chest: [0.45, 0.2, 0], rUp: [-1.0, 0, 0.0], rFore: [-0.2, 0, 0], lUp: [-0.8, 0, 0.3], lFore: [-0.3, 0, 0], lShin: [0.7, 0, 0], rShin: [0.6, 0, 0], lThigh: [-0.7, 0.15, 0.1], rThigh: [-0.3, -0.15, -0.1] }, root: [0, -0.16, 0.24] },
    { t: 0.8, b: {}, root: [0, -0.16, 0.22] }], carry);
  return { build, style: { carry, ready: carry, clips: { attack: smash }, swingL: 0.7, swingR: 0.3, strideAmp: 0.75, stride: 1.15, gait: { bounce: 1.5, sway: 2.2, lean: 0.6, lift: 0.9 }, downPose: DOWN_POSE }, scale: troll ? 1.45 : 1.35, death: 'shatter', disCol: [0.8, 0.9, 0.7], glow: 2.2, grip: troll ? null : shaftGrip(P, -0.2, [0.7, -1, -0.1]) };
}
export const THEMES = {
  operator: { label: 'Modern operator', variants: ['Rifleman', 'Recon', 'Breacher'], make: operator },
  trooper: { label: 'Sci-fi trooper', variants: ['Line trooper', 'Heavy', 'Scout'], make: trooper },
  survivor: { label: 'Post-apoc survivor', variants: ['Gas mask', 'Raider', 'Scavenger'], make: survivor },
  farmer: { label: 'Vietnamese farmer', variants: ['Hoe (cuốc)', 'Carrying pole (đòn gánh)', 'Old farmer, sickle (liềm)'], make: farmer },
  samurai: { label: 'Samurai', variants: ['O-yoroi', 'Ronin', 'Ashigaru'], make: samurai },
  mage: { label: 'Fantasy mage', variants: ['Wizard', 'Sorceress', 'Battle mage'], make: mage },
  zombie: { label: 'Zombie', variants: ['Shambler', 'Bloated', 'Dead knight'], make: zombie },
  goblin: { label: 'Goblin', variants: ['Scout', 'Spearman', 'Shaman'], make: goblin },
  brute: { label: 'Brute', variants: ['Orc warrior', 'Ogre', 'Troll'], make: brute },
};
export const THEME_ORDER = ['operator', 'trooper', 'survivor', 'farmer', 'samurai', 'mage', 'zombie', 'goblin', 'brute'];
