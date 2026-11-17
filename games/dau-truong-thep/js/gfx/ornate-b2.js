// Ornate batch 2 (dtt-restyle): Na Tra, Dương Tiễn, Athena, Hades, Mực Ma, Kỳ Nhông, Sơn Tinh, Bói Cá.
// Same construction as ornate.js and ornate-b1.js: the chunky plated steel base (OKit) in polished finishes, then one
// or two big motif structures per tank (wind-fire wheel rings and a silk sash, a trident and hound ears, a round
// shield and an owl-crested helm, a skull with soul-flame hair and three hound heads on a chain, four kagune
// tentacles, a salamander frill and tail, mountain peaks, a kingfisher's beak barrel and crest), each with its own
// form III aura ramp. Forms: I plain plates; II armour and the motif at mid size; III the full motif and the aura.
// A frame spec with no `sig` (the silhouette gate's bare frame) draws only hull, gear, turret and gun.
// Models face +x, +z is the right side, the ground is y = 0.
import * as THREE from '../../vendor/three.module.min.js';
import { LAMP } from './steel.js';
import { OKit, start, finish, fin, put, mix, C3, cannon, fireAura, tubeGeo, bladeGeo, wingPanel, WF, GOLD, GOLD_DEEP, CHROME, PEARL, DARKM, skinAuraRamp } from './ornate.js';

const PI = Math.PI, TAU = PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const WHITE = new THREE.Color(1, 1, 1);
const ramp = (a, b, c) => [[0, new THREE.Color(...a)], [0.4, new THREE.Color(...b)], [1, new THREE.Color(...c)]];
// One aura ramp per tank of this batch (root, middle, tip), none shared with ornate.js, ornate-b1.js or each other.
const AURA = {
  lotus: ramp([1.0, 0.92, 0.7], [1.0, 0.42, 0.36], [0.5, 0.04, 0.24]), // coral to crimson-pink
  thunder: ramp([0.92, 0.96, 1.0], [0.45, 0.85, 1.0], [0.26, 0.06, 0.5]), // white, electric cyan, violet tips
  olive: ramp([0.96, 0.95, 0.85], [0.68, 0.72, 0.42], [0.22, 0.28, 0.1]), // ivory to silver olive
  soul: ramp([0.78, 1.0, 0.88], [0.1, 0.9, 0.55], [0.18, 0.04, 0.36]), // mint ghost fire, purple tips
  ink: ramp([0.95, 0.42, 0.56], [0.5, 0.04, 0.38], [0.1, 0.0, 0.14]), // pink to magenta-black ink
  salamander: ramp([0.7, 0.86, 1.0], [1.0, 0.5, 0.08], [0.55, 0.06, 0.0]), // blue-hot root, orange, ember red
  moss: ramp([0.95, 1.0, 0.7], [0.55, 0.95, 0.3], [0.24, 0.34, 0.05]), // pale lime to olive
  kingfisher: ramp([1.0, 0.72, 0.36], [0.2, 0.75, 0.95], [0.0, 0.2, 0.4]), // orange root, kingfisher blue
};

// ---------- shared pieces of this batch ----------
// Flame cards in the ember batch (additive, flickers at runtime) with a tank's own ramp: crossed pairs, each
// [x, y, z, yaw, tilt (rotZ, 0 = tip up), width, height].
const flameShape = (() => {
  const s = new THREE.Shape(); s.moveTo(0, 0);
  s.bezierCurveTo(0.5, 0.05, 0.42, 0.45, 0.12, 0.7); s.bezierCurveTo(0.2, 0.85, 0.05, 0.95, 0, 1);
  s.bezierCurveTo(-0.08, 0.85, -0.3, 0.75, -0.18, 0.55); s.bezierCurveTo(-0.45, 0.4, -0.45, 0.05, 0, 0);
  return s;
})();
function flames(b, pal, cards) {
  pal = skinAuraRamp() || pal;
  const m = b.mat; b.use('ember'); b.tint(WHITE);
  const g = new THREE.ShapeGeometry(flameShape, 4), p = g.attributes.position, c = [];
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getY(i))), k = t < pal[1][0] ? 0 : 1, u = (t - pal[k][0]) / (pal[k + 1][0] - pal[k][0]);
    const col = pal[k][1].clone().lerp(pal[k + 1][1], u); c.push(col.r, col.g, col.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  for (const [x, y, z, ry, rz, w, hh] of cards) for (const r of [0, PI / 2]) { b.push().move(x, y, z).rotY(ry).rotZ(rz).rotY(r).scale(w, hh, 1); b.geo(g); b.pop(); }
  g.dispose(); b.use(m);
}
// Toned geometry kept for reuse (put() disposes).
const putK = (b, g) => { b.tint(WHITE); b.geo(g); return b; };
// Ribbon along a smooth path: a flat band whose faces look up, with gold-hemmed ends.
function ribbon(b, pts, w, col, hem) {
  const P = new THREE.CatmullRomCurve3(pts).getPoints(18);
  put(fin(b, 'enamel'), tubeGeo(P, (t) => w * (0.75 + 0.25 * Math.sin(PI * t)) * (t > 0.92 ? 0.7 : 1), { sides: 6, flatN: 0.2, caps: true, tone: (t) => (t > 0.9 || t < 0.04 ? C3(hem) : C3(col)) }));
}
// Ring of n petals round (x, y, z), each rising at `tilt` from the horizontal: a lotus cup.
function lotus(b, x, y, z, n, len, w, tilt, face, ph = 0) {
  const g = bladeGeo({ len, w, th: w * 0.2, wf: WF.petal, seg: 5, ridge: 0, lift: 0.2, edge: mix(GOLD, 0xffffff, 0.3), face, face2: mix(face, 0xff5a7a, 0.4), back: mix(face, 0xb03050, 0.45) });
  fin(b, 'pearl');
  for (let i = 0; i < n; i++) { const a = (i + ph) / n * TAU; b.push().move(x, y, z).rotY(a).move(0.14, 0, 0).rotZ(tilt); putK(b, g); b.pop(); }
  g.dispose();
}
// Heavy chain from a to c sagging by `sag`: interlocked oval links, every other one turned a quarter.
function chain(b, a, c, r, sag, col) {
  const D = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), n = Math.max(2, Math.round(D / (r * 2.3)));
  const link = new THREE.TorusGeometry(r, r * 0.3, 4, 8); link.scale(1.45, 1, 1);
  fin(b, 'chrome', col);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, p = [lerp(a[0], c[0], t), lerp(a[1], c[1], t) - sag * 4 * t * (1 - t), lerp(a[2], c[2], t)];
    const dx = c[0] - a[0], dz = c[2] - a[2], dy = (c[1] - a[1]) - sag * 4 * (1 - 2 * t), hz = Math.hypot(dx, dz);
    b.push().move(p[0], p[1], p[2]).rotY(Math.atan2(-dz, dx)).rotZ(Math.atan2(dy, hz)).rotX(i % 2 ? PI / 2 : 0).geo(link).pop();
  }
  link.dispose();
}
// Hound head facing +x at the current origin (unit size ~0.45 long): cranium, snout, open lower jaw with fangs,
// brow plate, lamp eyes, swept ears. cols: Kit colour names { skull, snout, jaw, brow }.
function houndHead(k, b, eye, cols, ears = true) {
  k.prism([[0.12, 0.17], [-0.16, 0.19], [-0.24, 0], [-0.16, -0.19], [0.12, -0.17]], -0.1, 0.15, cols.skull, 0.04);
  k.prism([[0.44, 0.07], [0.44, -0.07], [0.1, -0.13], [0.1, 0.13]], -0.06, 0.08, cols.snout, 0.03);
  k.prism([[0.38, 0.06], [0.38, -0.06], [0.06, -0.11], [0.06, 0.11]], -0.2, -0.11, cols.jaw, 0.025);
  k.prism([[0.2, 0.15], [0.02, 0.2], [0.02, -0.2], [0.2, -0.15]], 0.14, 0.2, cols.brow, 0.02);
  fin(b, 'chrome', CHROME);
  for (const s of [-1, 1]) {
    b.push().move(0.36, -0.08, s * 0.05).rotZ(PI).cyl(0, 0.022, 0.07, 4).pop();
    b.push().move(0.32, -0.12, s * 0.05).cyl(0, 0.02, 0.06, 4).pop();
  }
  for (const s of [-1, 1]) k.light(0.16, 0.09, s * 0.16, 0.03, eye, s > 0 ? '+z' : '-z');
  if (ears) for (const s of [-1, 1]) { k.use(cols.skull); b.push().move(-0.12, 0.2, s * 0.12).rotX(s * 0.35).rotZ(0.55).scale(1, 1, 0.5).rotY(PI / 4).cyl(0, 0.09, 0.22, 4).pop(); }
}

export const B2 = {
  // Na Tra, flanker: a low red wedge chariot on four wheels. Wind-fire wheels (Phong Hỏa Luân): gold rings round the
  // wheels with flame tongues; a lotus cup of pink petals round the head turret; twin hair buns; the red silk sash
  // (Hỗn Thiên Lăng) streaming back, longer on the right; the gold ring (Càn Khôn Quyển) round the fire-tipped spear.
  // I: plain plates, small buns. II: lotus, rear fire wheels, short sash, ring. III: all four fire wheels, double
  // lotus, long sash, two rings, lotus aura.
  natra(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, { paint: C3(deep), trim: C3(trim), F: { fenders: false } }), { f, orn } = K, y0 = K.g.y0, y1 = K.g.y1;
    const red = f === 1 ? mix(paint, 0x9a8a80, 0.35) : C3(paint), gold = f === 1 ? mix(trim, 0x9a9080, 0.35) : C3(GOLD), dred = C3(deep), silk = mix(paint, 0xff1f3a, 0.55), pink = mix(PEARL, 0xff8fa8, 0.45);
    const k = new OKit(b, st, trim, form, { red: [red, 'enamel'], redD: [mix(red, dred, 0.5), 'enamel'], gold: [gold, 'gold'], gun: [red, 'enamel'], gunLite: [gold, 'gold'], panel: [gold, 'gold'], under: [0x24140f, 'dark'], steel: [GOLD_DEEP, 'gold'], chrome: [CHROME, 'chrome'], dark: [0x160c0a, 'dark'] });
    b.use('hull');
    k.prism([[1.02, 0.1], [0.8, 0.36], [-0.75, 0.44], [-0.94, 0.3], [-0.94, -0.3], [-0.75, -0.44], [0.8, -0.36], [1.02, -0.1]], y0 - 0.06, y0 + 0.22, 'under', 0.05);
    k.prism([[0.98, 0.08], [0.74, 0.32], [-0.7, 0.4], [-0.88, 0.26], [-0.88, -0.26], [-0.7, -0.4], [0.74, -0.32], [0.98, -0.08]], y0 + 0.18, y1, 'red', 0.05);
    k.plate(-0.2, y1 + 0.03, 0, 1.0, 0.06, 0.36, { col: 'redD', insert: 'gold' });
    k.prism([[1.06, 0], [0.74, 0.24], [0.6, 0.24], [0.88, 0], [0.6, -0.24], [0.74, -0.24]], y1 - 0.06, y1 + 0.03, 'gold', 0.02);
    for (const s of [-1, 1]) {
      k.light(1.0, y0 + 0.08, s * 0.14, 0.04, LAMP.amber, '+x');
      k.blk(-0.9, y0 + 0.2, s * 0.2, 0.16, 0.14, 0.16, 'chrome', 0.03);
      h.flame(b, () => b.push().move(-1.06, y0 + 0.2, s * 0.2).rotZ(PI / 2).cyl(0.07, 0.02, 0.24, 8).pop());
      // Wheel arches: red plates over each wheel with a gold lip.
      for (const x of [0.65, -0.65]) { k.plate(x, 0.93, s * 0.56, 0.95, 0.07, 0.34, { col: 'red', insert: null, rx: s * 0.12 }); k.blk(x, 0.95, s * 0.73, 0.9, 0.05, 0.04, 'gold', 0.012); }
    }
    if (orn && f >= 2) {
      // Wind-fire wheels: a gold ring round each (rear only at II) with flame tongues licking outward over the top.
      for (const x of f === 3 ? [0.65, -0.65] : [-0.65]) for (const s of [-1, 1]) {
        const R = f === 3 ? 0.47 : 0.45, z = s * 0.74, cy = 0.44;
        fin(b, 'gold', GOLD); b.push().move(x, cy, z).geo(new THREE.TorusGeometry(R, 0.05, 5, 22)).pop();
        h.lit(b, () => b.push().move(x, cy, z + s * 0.03).geo(new THREE.TorusGeometry(R - 0.09, 0.016, 4, 18)).pop());
        const cards = [];
        for (let i = 0; i < 7; i++) { const a = -0.15 + i / 6 * (PI + 0.3); cards.push([x + Math.cos(a) * (R + 0.02), cy + Math.sin(a) * (R + 0.02), z, 0, a - PI / 2 + 0.35, 0.16, f === 3 ? 0.32 : 0.24]); }
        flames(b, AURA.lotus, cards);
      }
      // Silk sash: two streamers from the hull shoulders, waving back; the right one longer and curling out.
      const L = f === 3 ? 1 : 0.62;
      for (const s of [-1, 1]) {
        const e = s > 0 ? 1.25 : 1;
        ribbon(b, [V(-0.2, y1 + 0.08, s * 0.38), V(-0.6, y1 + 0.28, s * 0.52), V(-0.6 - 0.5 * L * e, y1 + 0.12, s * (0.4 + 0.1 * e)), V(-0.6 - 0.95 * L * e, y1 + 0.3, s * (0.55 + 0.25 * e * L)), V(-0.6 - 1.3 * L * e, y1 + 0.16, s * (0.42 + 0.45 * e * L))], 0.13, silk, GOLD);
      }
      if (f === 3) fireAura(b, -0.1, 1.6, 1.25, 16, 1.0, AURA.lotus);
    }
    // Head turret on a lotus cup: helmet block, visor strip, twin hair buns with gold rings.
    b.use('turret');
    k.oct(0, y1 + 0.08, 0, 0.3, 0.08, 'under');
    if (orn && f >= 2) {
      lotus(b, 0, y1 + 0.06, 0, 8, f === 3 ? 0.42 : 0.34, 0.26, 0.55, pink);
      if (f === 3) lotus(b, 0, y1 + 0.1, 0, 8, 0.3, 0.22, 0.95, mix(pink, 0xffffff, 0.3), 0.5);
    }
    k.plate(0, y1 + 0.24, 0, 0.5, 0.26, 0.44, { col: 'red', insert: 'gold' });
    k.plate(0.28, y1 + 0.22, 0, 0.16, 0.22, 0.38, { col: 'redD', insert: null, rz: -0.4 });
    k.strip(0.36, y1 + 0.27, 0, 0.26, 'z', 'glow', 0.03);
    if (orn) for (const s of [-1, 1]) {
      const r = [0.08, 0.11, 0.12][f - 1], by = y1 + 0.42;
      fin(b, 'enamel', mix(red, dred, 0.3)); b.push().move(-0.08, by, s * 0.15).ball(r, 1).pop();
      fin(b, 'gold', GOLD); b.push().move(-0.08, by - r * 0.55, s * 0.15).geo(new THREE.TorusGeometry(r * 0.85, 0.022, 4, 12).rotateX(PI / 2)).pop();
      if (f >= 2) ribbon(b, [V(-0.12, by, s * 0.17), V(-0.32, by - 0.02, s * 0.24), V(-0.5, by - 0.12, s * 0.2), V(-0.62, by - 0.2, s * 0.26)], 0.045, silk, GOLD);
    }
    // Fire-tipped spear: chrome shaft, gold collar, leaf head, a red tassel and the gold ring round the shaft.
    b.use('barrel');
    const gx = 0.3, gy = (K.my = y1 + 0.22), mx = K.stock.muzzle, sh = mx - 0.42 - gx;
    k.blk(gx, gy, 0, 0.18, 0.16, 0.2, 'under', 0.04);
    fin(b, 'chrome', CHROME); b.push().move(gx + sh / 2, gy, 0).rotZ(-PI / 2).cyl(0.035, 0.04, sh, 8).pop();
    fin(b, 'gold', GOLD); b.push().move(gx + sh, gy, 0).rotZ(-PI / 2).cyl(0.06, 0.06, 0.07, 10).pop();
    put(fin(b, 'chrome'), bladeGeo({ len: 0.42, w: 0.15, th: 0.05, wf: WF.spear, ridge: 0, seg: 5, edge: mix(GOLD, 0xffffff, 0.3), face: CHROME, face2: 0xffb060, back: 0xb8c0cc }).translate(gx + sh, gy, 0));
    k.lamp(LAMP.amber, () => b.push().move(gx + sh + 0.08, gy, 0).ball(0.045, 1).pop());
    put(fin(b, 'enamel'), tubeGeo([V(gx + sh - 0.02, gy - 0.04, 0), V(gx + sh - 0.07, gy - 0.16, 0), V(gx + sh - 0.17, gy - 0.25, 0)], (t) => 0.045 * (1 - 0.7 * t) + 0.02, { sides: 6, caps: true, tone: () => C3(silk) }));
    if (orn && f >= 2) {
      const R = f === 3 ? 0.2 : 0.16, rx = gx + 0.4;
      fin(b, 'gold', GOLD); b.push().move(rx, gy, 0).geo(new THREE.TorusGeometry(R, 0.04, 5, 18).rotateY(PI / 2)).pop();
      if (f === 3) { b.push().move(rx + 0.32, gy, 0).geo(new THREE.TorusGeometry(R * 0.8, 0.03, 5, 16).rotateY(PI / 2)).pop(); h.lit(b, () => b.push().move(rx, gy, 0).geo(new THREE.TorusGeometry(R - 0.05, 0.012, 4, 16).rotateY(PI / 2)).pop()); }
    }
    b.use('hull');
    K.parts.push(...k.parts); K.top = y1 + (f === 3 ? 0.9 : 0.65);
    return finish(K, { recoil: 0.2 });
  },

  // Dương Tiễn, bruiser: a silver war-god walker on two legs. A pointed breastplate, layered pauldrons, a cape of
  // stepped slate plates behind, a pointed helm with hound ears (Hao Thiên Khuyển) and the vertical third eye lit on
  // the sloped brow; the three-pointed double-edged trident (Tam Tiêm Đao) as the gun. I: one pauldron plate, ear
  // stubs. II: two plates, cape, gold brow. III: three plates, long flared cape, tall ears, eye rays, thunder aura.
  duongtien(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, y0 = K.g.y0, y1 = K.g.y1;
    const silver = f === 1 ? mix(paint, 0x8a9099, 0.35) : mix(paint, CHROME, 0.35), slate = C3(deep), gold = f === 1 ? mix(trim, 0x9a9080, 0.35) : C3(trim), cape = mix(deep, 0x1a2440, 0.5);
    const k = new OKit(b, st, trim, form, { silver: [silver, 'pearl'], slate: [slate, 'enamel'], cape: [cape, 'enamel'], gold: [gold, 'gold'], gun: [silver, 'pearl'], gunLite: [gold, 'gold'], panel: [slate, 'enamel'], under: [mix(slate, 0x101216, 0.5), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x101216, 'dark'] });
    b.use('hull');
    k.prism([[0.6, 0.2], [0.45, 0.42], [-0.45, 0.42], [-0.6, 0.2], [-0.6, -0.2], [-0.45, -0.42], [0.45, -0.42], [0.6, -0.2]], y0 - 0.04, y0 + 0.2, 'under', 0.04);
    k.prism([[0.66, 0], [0.5, 0.36], [-0.4, 0.4], [-0.56, 0.2], [-0.56, -0.2], [-0.4, -0.4], [0.5, -0.36]], y0 + 0.16, y1, 'silver', 0.06);
    k.prism([[0.6, 0], [0.44, 0.2], [0.1, 0.24], [0.1, -0.24], [0.44, -0.2]], y1 - 0.02, y1 + 0.05, 'slate', 0.02);
    k.blk(0.0, y0 + 0.17, 0, 1.0, 0.06, 0.82, 'gold', 0.02);
    k.light(0.6, y1 - 0.12, 0, 0.045, st.glow, '+x');
    const sc = [0.8, 1.0, 1.15][f - 1];
    // Pauldrons: stacked chamfered shoulder plates stepping down and out, slate over gold over silver.
    const nl = !orn || f === 1 ? 1 : f === 2 ? 2 : 3;
    for (const s of [-1, 1]) for (let l = nl - 1; l >= 0; l--) k.plate(0.02 - l * 0.03, y1 + 0.06 - l * 0.1, s * (0.44 + l * 0.08), 0.5 * sc - l * 0.04, 0.08, 0.3 * sc, { col: ['slate', 'gold', 'silver'][l], insert: l ? null : 'silver', rx: s * -(0.45 + l * 0.2), ch: 0.03 });
    if (orn && f >= 2) {
      // Cape: stepped slate plates from the shoulders falling back, wider toward the hem, gold hem bar.
      // Broad panels sloping back and down, each overlapping the one below, so the cape reads from above.
      const n = f === 2 ? 2 : 3, pl = 0.42;
      let cx = -0.55, cy = y1 - 0.02, w = 0.8;
      for (let i = 0; i < n; i++) {
        const a = 0.75 + i * 0.12;
        k.plate(cx, cy, 0, pl, 0.05, w, { col: i % 2 ? 'slate' : 'cape', insert: null, rz: a });
        cx -= Math.cos(a) * pl * 0.8; cy -= Math.sin(a) * pl * 0.8; w += f === 3 ? 0.14 : 0.08;
      }
      k.blk(cx + Math.cos(0.75 + n * 0.12) * pl * 0.42, cy + Math.sin(0.75 + n * 0.12) * pl * 0.42, 0, 0.07, 0.06, w - 0.06, 'gold', 0.015);
      if (f === 3) fireAura(b, 0, 1.45, 1.35, 16, 1.0, AURA.thunder);
    }
    // Helm: pointed silver helm, gold brow slope with the third eye, hound ears.
    b.use('turret');
    const hy = y1 + 0.05;
    k.oct(0, hy + 0.04, 0, 0.28, 0.08, 'under');
    k.prism([[0.42, 0], [0.26, 0.24], [-0.24, 0.26], [-0.34, 0.12], [-0.34, -0.12], [-0.24, -0.26], [0.26, -0.24]], hy + 0.08, hy + 0.4, 'silver', 0.05);
    k.prism([[0.3, 0], [0.18, 0.17], [-0.2, 0.19], [-0.28, 0], [-0.2, -0.19], [0.18, -0.17]], hy + 0.4, hy + 0.47, 'slate', 0.02);
    for (const s of [-1, 1]) k.plate(0.05, hy + 0.2, s * 0.27, 0.36, 0.22, 0.05, { col: 'slate', insert: null, ry: s * 0.12 });
    k.blk(0.38, hy + 0.2, 0, 0.06, 0.05, 0.3, 'dark', 0.015);
    k.strip(0.415, hy + 0.2, 0, 0.24, 'z', 'glow', 0.025);
    // Third eye on the sloped brow: gold almond, lit iris (rays from III).
    b.push().move(0.3, hy + 0.36, 0).rotZ(-0.75);
    const es = [1.1, 1.35, 1.55][f - 1];
    fin(b, 'gold', GOLD); b.push().scale(1, 1, 0.45).geo(new THREE.TorusGeometry(0.075 * es, 0.022, 4, 12).rotateX(PI / 2)).pop();
    k.lamp(st.glow, () => b.push().move(0, 0.01, 0).scale(1, 0.3, 0.42).ball(0.07 * es, 1).pop());
    if (orn && f === 3) h.lit(b, () => { for (const a of [-0.5, 0, 0.5]) b.push().move(0.13 * Math.cos(a), 0.012, 0.13 * Math.sin(a)).rotY(-a).box(0.09, 0.01, 0.018).pop(); });
    b.pop();
    if (orn) for (const s of [-1, 1]) {
      const eh = [0.14, 0.26, 0.34][f - 1];
      b.push().move(-0.14, hy + 0.42, s * 0.21).rotX(s * 0.55).rotZ(0.5);
      fin(b, 'enamel', slate); b.push().move(0, eh / 2, 0).scale(1.25, 1, 0.5).rotY(PI / 4).cyl(0, 0.13, eh, 4).pop();
      fin(b, 'pearl', silver); b.push().move(0.04, eh * 0.42, 0).scale(0.9, 0.8, 0.36).rotY(PI / 4).cyl(0, 0.1, eh, 4).pop();
      b.pop();
    }
    // Trident: shaft, gold crossbar, a long centre blade and two shorter prongs curving forward.
    b.use('barrel');
    const gx = 0.32, gy = (K.my = hy + 0.2), mx = K.stock.muzzle, hl = 0.44, sh = mx - hl - gx;
    k.blk(gx, gy, 0, 0.18, 0.18, 0.22, 'under', 0.04);
    fin(b, 'chrome', CHROME); b.push().move(gx + sh / 2, gy, 0).rotZ(-PI / 2).cyl(0.035, 0.04, sh, 8).pop();
    k.blk(gx + sh, gy, 0, 0.06, 0.06, 0.3, 'gold', 0.015);
    put(fin(b, 'chrome'), bladeGeo({ len: hl, w: 0.13, th: 0.04, wf: WF.spear, ridge: 0, seg: 5, edge: CHROME, face: CHROME, face2: mix(st.glow, CHROME, 0.4), back: 0xb8c0cc }).translate(gx + sh, gy, 0));
    for (const s of [-1, 1]) {
      const P = [V(gx + sh, gy, s * 0.14), V(gx + sh + 0.12, gy, s * 0.15), V(gx + sh + 0.26, gy, s * 0.1)];
      put(fin(b, 'chrome'), tubeGeo(P, (t) => 0.035 * (1 - 0.9 * t) + 0.004, { sides: 5, flat: 0.45, caps: true, tone: (t) => (t > 0.6 ? C3(CHROME) : C3(gold)) }));
    }
    b.use('hull');
    K.parts.push(...k.parts); K.top = hy + (f === 3 ? 1.0 : 0.8);
    return finish(K, { recoil: 0.28 });
  },

  // Athena, guardian: an ivory temple tank on bronze-skirted track pods. A big round bronze shield with gold rings
  // and boss stands tilted at the nose; the turret is a crested helm: an owl on the brow (gold ring eyes, ear tufts),
  // a blue horsehair crest of plume feathers front to back, and at III small gold owl wings on the helm. Long spear.
  // I: small plain shield, owl head only. II: full shield, crest, skirts. III: big shield with studs, tall crest,
  // helm wings, olive aura.
  athena(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K;
    const ivory = f === 1 ? mix(paint, 0x9a9890, 0.3) : mix(paint, PEARL, 0.4), bronze = C3(deep), gold = f === 1 ? mix(trim, 0x9a9080, 0.35) : C3(trim), blue = C3(0x2f5fd0);
    const k = new OKit(b, st, trim, form, { ivory: [ivory, 'pearl'], bronze: [bronze, 'gold'], bronzeD: [mix(bronze, 0x2a1e0e, 0.4), 'enamel'], gold: [gold, 'gold'], blue: [blue, 'enamel'], gun: [ivory, 'pearl'], gunLite: [gold, 'gold'], panel: [bronze, 'enamel'], under: [0x26241e, 'dark'], steel: [GOLD_DEEP, 'gold'], chrome: [CHROME, 'chrome'], dark: [0x14140f, 'dark'] });
    b.use('hull');
    for (const s of [-1, 1]) k.trackPod(-0.2, s * 0.8, 1.95, 0.42, 0.56, { coverCol: 'ivory', insert: 'bronze', skirt: f >= 2, skirtH: 0.36, light: LAMP.blue });
    k.prism([[1.12, 0.3], [1.22, 0.15], [1.22, -0.15], [1.12, -0.3], [-1.1, -0.5], [-1.22, -0.36], [-1.22, 0.36], [-1.1, 0.5]], 0.2, 0.68, 'under', 0.05);
    k.plate(-0.3, 0.73, 0, 1.5, 0.12, 1.0, { col: 'ivory', insert: 'bronzeD' });
    k.plate(0.75, 0.66, 0, 0.6, 0.1, 0.9, { col: 'ivory', insert: null, rz: -0.35 });
    k.blk(-1.18, 0.62, 0, 0.1, 0.2, 0.86, 'gold', 0.03);
    for (const s of [-1, 1]) k.blk(-0.3, 0.8, s * 0.48, 1.4, 0.05, 0.06, 'gold', 0.015);
    // The shield (Aegis) at the nose, leaning back so its face shows from above.
    const SR = orn ? [0.36, 0.58, 0.64][f - 1] : 0.32, sx = 1.32, sy = 0.62;
    b.push().move(sx, sy, 0).rotZ(0.42).rotZ(-PI / 2);
    fin(b, 'enamel', bronze); b.cyl(SR, SR, 0.08, 20);
    fin(b, 'gold', gold); b.push().move(0, 0.05, 0).geo(new THREE.TorusGeometry(SR - 0.03, 0.035, 5, 24).rotateX(PI / 2)).pop();
    if (orn && f >= 2) {
      fin(b, 'pearl', ivory); b.push().move(0, 0.05, 0).cyl(SR * 0.66, SR * 0.66, 0.02, 18).pop();
      fin(b, 'gold', gold); b.push().move(0, 0.065, 0).geo(new THREE.TorusGeometry(SR * 0.62, 0.022, 4, 20).rotateX(PI / 2)).pop();
      if (f === 3) for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; b.push().move(Math.cos(a) * SR * 0.82, 0.07, Math.sin(a) * SR * 0.82).ball(0.03, 0).pop(); }
    }
    fin(b, 'gold', GOLD); b.push().move(0, 0.06, 0).scale(1, 0.5, 1).ball(SR * 0.28, 1).pop();
    h.lit(b, () => b.push().move(0, 0.06 + SR * 0.14, 0).cyl(SR * 0.09, SR * 0.09, 0.012, 8).pop());
    b.pop();
    if (orn && f === 3) fireAura(b, 0, 1.75, 1.45, 18, 1.0, AURA.olive);
    // Helm turret.
    b.use('turret');
    const tx = -0.2;
    k.oct(tx, 0.82, 0, 0.5, 0.08, 'under');
    k.oct(tx, 0.98, 0, 0.44, 0.24, 'ivory', 0.06, 1.15);
    k.oct(tx - 0.03, 1.15, 0, 0.34, 0.12, 'ivory', 0.04, 1.15);
    k.plate(tx + 0.45, 1.0, 0, 0.14, 0.24, 0.46, { col: 'bronze', insert: null, rz: -0.25 });
    k.blk(tx + 0.53, 1.02, 0, 0.04, 0.05, 0.3, 'dark', 0.01);
    k.strip(tx + 0.555, 1.02, 0, 0.22, 'z', 'glow', 0.025);
    for (const s of [-1, 1]) k.plate(tx + 0.2, 0.98, s * 0.44, 0.34, 0.2, 0.05, { col: 'bronze', insert: null, ry: s * -0.25 });
    if (orn) {
      // Owl on the brow: gold head block, ring eyes with lamps, ear tufts, a small beak.
      const ox = tx + 0.3, oy = 1.24, os = [1.0, 1.3, 1.45][f - 1];
      b.push().move(ox, oy, 0).scale(os, os, os);
      k.prism([[0.12, 0.14], [-0.1, 0.16], [-0.14, 0], [-0.1, -0.16], [0.12, -0.14], [0.16, 0]], -0.08, 0.1, 'gold', 0.03);
      for (const s of [-1, 1]) {
        fin(b, 'gold', GOLD); b.push().move(0.15, 0.03, s * 0.07).geo(new THREE.TorusGeometry(0.055, 0.016, 4, 12).rotateY(PI / 2)).pop();
        k.lamp(st.glow, () => b.push().move(0.155, 0.03, s * 0.07).rotZ(PI / 2).cyl(0.04, 0.04, 0.01, 10).pop());
        k.use('gold'); b.push().move(-0.02, 0.13, s * 0.11).rotX(s * 0.4).rotZ(-0.3).cyl(0, 0.04, 0.12, 4).pop();
      }
      k.use('bronzeD'); b.push().move(0.17, -0.04, 0).rotZ(PI).cyl(0, 0.025, 0.07, 4).pop();
      b.pop();
    }
    if (orn && f >= 2) {
      // Horsehair crest: plume feathers standing in an arc from the owl back over the helm.
      const n = f === 2 ? 6 : 8, cl = f === 2 ? 0.4 : 0.56;
      k.blk(tx - 0.08, 1.24, 0, 0.6, 0.06, 0.1, 'gold', 0.02);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), a = lerp(1.25, 2.75, t), L = cl * (0.8 + 0.4 * Math.sin(PI * t));
        const g = bladeGeo({ len: L, w: 0.22, th: 0.04, wf: WF.plume, seg: 6, lift: -0.15, edge: GOLD, face: blue, face2: mix(blue, 0xffffff, 0.25), back: mix(blue, 0x0a1430, 0.5) });
        b.push().move(tx + 0.2 - t * 0.55, 1.26, 0).rotZ(a).rotX(PI / 2); put(fin(b, 'enamel'), g); b.pop();
      }
    }
    if (orn && f === 3) for (const s of [-1, 1]) wingPanel(b, s, { x0: tx + 0.12, z0: 0.4, y: 1.1, len: 0.62, reach: 0.3, n: 4, fl0: 0.18, fl1: 0.26, col: { panel: gold, edge: ivory, face: gold, face2: mix(GOLD, PEARL, 0.5) } });
    // Spear: chrome shaft, gold collars, broad leaf blade.
    b.use('barrel');
    const gx = tx + 0.5, gy = (K.my = 1.16), mx = K.stock.muzzle, sh = mx - 0.46 - gx;
    k.blk(gx, gy, 0, 0.16, 0.16, 0.2, 'bronzeD', 0.04);
    fin(b, 'chrome', CHROME); b.push().move(gx + sh / 2, gy, 0).rotZ(-PI / 2).cyl(0.035, 0.04, sh, 8).pop();
    fin(b, 'gold', GOLD); for (const x of [gx + 0.2, gx + sh]) b.push().move(x, gy, 0).rotZ(-PI / 2).cyl(0.055, 0.055, 0.06, 10).pop();
    put(fin(b, 'chrome'), bladeGeo({ len: 0.46, w: 0.2, th: 0.05, wf: WF.spear, ridge: 0, seg: 5, edge: GOLD, face: CHROME, face2: mix(st.glow, CHROME, 0.5), back: 0xb8c0cc }).translate(gx + sh, gy, 0));
    b.use('hull');
    K.parts.push(...k.parts); K.top = f === 3 ? 2.0 : 1.7;
    return finish(K, { recoil: 0.25 });
  },

  // Hades, control: a wide, low dark-violet fortress on broad track pods. A spiked collar round the turret ring and
  // three hound heads at the nose (Cerberus) with chains running back to the hull corners; the turret is a black helm
  // with a bone skull for a face and a bone ridge crest, and a fan of vents behind it streaming green soul fire like
  // hair; a soul-lantern lens gun. I: collar ring, two vents. II: three heads, chains, five vents. III: bigger heads,
  // seven tall vents, soul aura.
  hades(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K;
    const purple = f === 1 ? mix(paint, 0x5a5a66, 0.3) : C3(paint), violet = f === 1 ? mix(trim, 0x7a7a88, 0.4) : C3(trim), bone = mix(PEARL, 0xb8ae94, 0.4), green = C3(st.glow);
    const k = new OKit(b, st, trim, form, { purple: [purple, 'enamel'], purpleD: [mix(purple, 0x000000, 0.35), 'enamel'], violet: [violet, 'enamel'], bone: [bone, 'pearl'], gun: [purple, 'enamel'], gunLite: [violet, 'enamel'], panel: [violet, 'enamel'], under: [0x120f1a, 'dark'], steel: [0x4a4458, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x0c0a12, 'dark'] });
    b.use('hull');
    for (const s of [-1, 1]) k.trackPod(-0.4, s * 0.84, 1.5, 0.36, 0.5, { coverCol: 'purple', insert: 'violet', skirt: f >= 2, skirtH: 0.32, light: LAMP.green });
    k.prism([[1.05, 0.72], [1.14, 0.5], [1.14, -0.5], [1.05, -0.72], [-0.9, -0.55], [-1.1, -0.35], [-1.1, 0.35], [-0.9, 0.55]], 0.2, 0.64, 'under', 0.05);
    k.prism([[0.85, 0.66], [0.85, -0.66], [-0.85, -0.5], [-1.0, -0.3], [-1.0, 0.3], [-0.85, 0.5]], 0.62, 0.74, 'purple', 0.04);
    k.plate(-0.2, 0.76, 0, 1.0, 0.05, 0.8, { col: 'purpleD', insert: null });
    k.plate(0.82, 0.62, 0, 0.5, 0.1, 1.1, { col: 'purple', insert: null, rz: -0.45 });
    k.blk(-1.08, 0.6, 0, 0.1, 0.2, 1.1, 'violet', 0.03);
    for (const s of [-1, 1]) { k.light(1.12, 0.42, s * 0.42, 0.05, LAMP.green, '+x'); k.oct(-0.9, 0.8, s * 0.62, 0.08, 0.2, 'violet', 0.02); }
    // Spiked collar round the turret ring.
    fin(b, 'enamel', violet); b.push().move(-0.1, 0.8, 0).geo(new THREE.TorusGeometry(0.62, 0.07, 5, 24).rotateX(PI / 2)).pop();
    if (orn && f >= 2) { fin(b, 'chrome', CHROME); for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * TAU; b.push().move(-0.1 + Math.cos(a) * 0.68, 0.8, Math.sin(a) * 0.68).rotY(-a).rotZ(-PI / 2).cyl(0, 0.045, 0.14, 4).pop(); } }
    if (orn && f >= 2) {
      // Cerberus: three hound heads at the nose, the outer two turned out, chains back to the hull corners.
      const hs = f === 2 ? 1.05 : 1.3;
      const heads = [[1.32, 0, 0], [1.08, 0.66, 0.8], [1.08, -0.66, -0.8]];
      for (const [x, z, yaw] of heads) {
        b.push().move(x, 0.72, z).rotY(-yaw).scale(hs, hs, hs);
        k.blk(-0.18, -0.04, 0, 0.24, 0.24, 0.36, 'under', 0.04);
        houndHead(k, b, LAMP.green, { skull: 'violet', snout: 'purple', jaw: 'under', brow: 'violet' });
        fin(b, 'enamel', violet); b.push().move(-0.16, -0.02, 0).geo(new THREE.TorusGeometry(0.17, 0.035, 4, 12).rotateY(PI / 2)).pop();
        b.pop();
      }
      for (const s of [-1, 1]) chain(b, [0.95, 0.74, s * 0.62], [-0.9, 0.82, s * 0.5], 0.05, 0.12, 0x9a94a8);
      chain(b, [1.04, 0.74, 0], [0.55, 0.8, 0], 0.045, 0.06, 0x9a94a8);
    }
    if (orn && f === 3) fireAura(b, 0, 1.7, 1.6, 18, 1.0, AURA.soul);
    // Turret: black helm with a bone skull face and bone ridge crest; soul-fire vents behind.
    b.use('turret');
    const tx = -0.1;
    k.oct(tx, 0.82, 0, 0.52, 0.08, 'under');
    k.oct(tx - 0.06, 1.0, 0, 0.44, 0.28, 'bone', 0.06, 1.1);
    k.oct(tx - 0.1, 1.16, 0, 0.34, 0.08, 'bone', 0.04, 1.1);
    for (const s of [-1, 1]) { k.blk(tx + 0.18, 1.19, s * 0.13, 0.16, 0.04, 0.13, 'dark', 0.02); k.lamp(LAMP.green, () => b.push().move(tx + 0.18, 1.215, s * 0.13).box(0.07, 0.01, 0.06).pop()); }
    // Skull face on the helm's front.
    k.prism([[0.42, 0.22], [0.5, 0.1], [0.5, -0.1], [0.42, -0.22], [0.12, -0.3], [0.08, 0], [0.12, 0.3]].map(([x, z]) => [tx + x, z]), 0.92, 1.2, 'bone', 0.06);
    k.prism([[0.36, 0.16], [0.42, 0], [0.36, -0.16], [0.2, -0.18], [0.2, 0.18]].map(([x, z]) => [tx + x, z]), 0.84, 0.94, 'bone', 0.03);
    for (const s of [-1, 1]) {
      k.blk(tx + 0.44, 1.1, s * 0.11, 0.12, 0.09, 0.12, 'dark', 0.02);
      k.lamp(LAMP.green, () => b.push().move(tx + 0.5, 1.1, s * 0.11).box(0.02, 0.05, 0.06).pop());
    }
    k.prism([[tx + 0.53, 0], [tx + 0.47, 0.04], [tx + 0.47, -0.04]], 0.98, 1.04, 'dark', 0.005);
    fin(b, 'pearl', bone); for (let i = 0; i < 5; i++) b.push().move(tx + 0.46, 0.9, (i - 2) * 0.05).chamfer(0.04, 0.06, 0.035, 0.008).pop();
    if (orn) {
      // Bone ridge crest: vertebra plates down the crown.
      const n = [2, 4, 5][f - 1];
      for (let i = 0; i < n; i++) { const x = tx + 0.25 - i * 0.14, hh = (f === 3 ? 0.24 : 0.18) * (1 - i * 0.12); k.profile([[x + 0.06, 1.18], [x - 0.08, 1.18], [x - 0.1, 1.18 + hh], [x + 0.0, 1.18 + hh * 0.8]], -0.03, 0.03, 'bone', 0.012); }
      // Soul-fire hair: vents fanned behind the helm, each streaming green flame up and back.
      const nv = [2, 5, 7][f - 1], fl = [0.22, 0.4, 0.62][f - 1], cards = [];
      for (let i = 0; i < nv; i++) {
        const u = nv === 1 ? 0 : i / (nv - 1) * 2 - 1, a = PI + u * 1.0, vx = tx - 0.06 + Math.cos(a) * 0.4, vz = Math.sin(a) * 0.4;
        b.push().move(vx, 1.12, vz).rotY(-a).rotZ(-0.6);
        k.use('dark'); b.cyl(0.06, 0.075, 0.18, 6); k.use('violet'); b.push().move(0, 0.09, 0).cyl(0.075, 0.075, 0.03, 6).pop();
        h.lit(b, () => b.push().move(0, 0.1, 0).cyl(0.045, 0.045, 0.01, 6).pop());
        b.pop();
        cards.push([vx + Math.cos(a) * 0.07, 1.2, vz + Math.sin(a) * 0.07, -a, -0.75, 0.2, fl * (1 - 0.25 * Math.abs(u))]);
      }
      flames(b, AURA.soul, cards);
    }
    // Soul lantern: a short barrel ending in a lit green lens.
    b.use('barrel');
    const gx = tx + 0.5, gy = (K.my = 1.02), mx = K.stock.muzzle;
    k.blk(gx, gy, 0, 0.18, 0.2, 0.26, 'under', 0.04);
    cannon(b, gx + 0.04, gy, 0, mx - gx - 0.12, 0.07, mix(CHROME, 0x6a5a9a, 0.5), violet);
    k.lamp(green, () => b.push().move(mx - 0.04, gy, 0).rotZ(PI / 2).cyl(0.09, 0.09, 0.03, 12).pop());
    b.use('hull');
    K.parts.push(...k.parts); K.top = f === 3 ? 2.0 : 1.6;
    return finish(K, { recoil: 0.2 });
  },

  // Mực Ma, flanker: a black squid-mantle skiff on hover pads. A layered black mantle with a red lateral stripe and
  // two red rear fins; the head turret wears a pearl half mask over its left side (dark eye slot, stitched mouth)
  // and shows one glowing red eye on the right; a chitin squid beak under the face between the twin guns; four red
  // kagune tentacles rise from the back, banded and hooked. I: two short tentacles. II: four. III: four long ones
  // with blade tips, ink aura.
  mucma(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, y0 = K.g.y0, y1 = K.g.y1;
    const ink = C3(paint), red = f === 1 ? mix(trim, 0x7a6a70, 0.35) : C3(trim), redL = mix(trim, 0xff5a6a, 0.35), mask = mix(PEARL, 0xd8d4cc, 0.3);
    const k = new OKit(b, st, trim, form, { ink: [ink, 'enamel'], inkL: [mix(ink, 0x4a4a5a, 0.4), 'enamel'], red: [red, 'enamel'], mask: [mask, 'pearl'], gun: [ink, 'enamel'], gunLite: [red, 'enamel'], panel: [red, 'enamel'], under: [0x0a0a0e, 'dark'], steel: [0x3a3a44, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x060608, 'dark'] });
    b.use('hull');
    const man = [[0.88, 0.3], [0.94, 0], [0.88, -0.3], [0.5, -0.56], [-0.3, -0.52], [-0.85, -0.26], [-1.08, 0], [-0.85, 0.26], [-0.3, 0.52], [0.5, 0.56]];
    k.prism(man, y0 - 0.04, y0 + 0.22, 'under', 0.05);
    k.prism(man.map(([x, z]) => [x * 0.94 - 0.02, z * 0.9]), y0 + 0.18, y1, 'ink', 0.06);
    k.prism(man.map(([x, z]) => [x * 0.72 - 0.1, z * 0.62]), y1 - 0.02, y1 + 0.07, 'inkL', 0.03);
    k.blk(-0.2, y1 + 0.08, 0, 1.0, 0.03, 0.08, 'red', 0.01);
    for (const s of [-1, 1]) k.blk(0.0, y0 + 0.32, s * 0.5, 0.9, 0.05, 0.03, 'red', 0.01);
    if (orn && f >= 2) for (const s of [-1, 1]) {
      k.prism([[-0.5, s * 0.3], [-0.72, s * 0.66], [-1.06, s * 0.42], [-1.08, s * 0.1]], y1 - 0.12, y1 - 0.06, 'red', 0.015);
      k.prism([[-0.55, s * 0.32], [-0.72, s * 0.58], [-0.98, s * 0.4], [-1.0, s * 0.14]], y1 - 0.06, y1 - 0.03, 'ink', 0.01);
    }
    if (orn) {
      // Kagune: banded red tentacles rising from the back, hooking out and forward at the tips.
      const L = [0.6, 0.85, 1.1][f - 1], set = f === 1 ? [[0.12, 0.6, 1]] : [[0.12, 0.6, 1], [0.3, 0.35, 0.85]];
      for (const [z0, up, len] of set) for (const s of [-1, 1]) {
        const l = L * len, x0 = -0.5 - (z0 > 0.2 ? 0.2 : 0), q = f === 3 ? 1 : 0.4;
        const P = [V(x0, y1 + 0.04, s * z0), V(x0 - 0.35 * l, y1 + 0.55 * l * up + 0.1, s * (z0 + 0.2 * l * q)), V(x0 - 0.7 * l, y1 + (0.75 + 0.3 * (1 - q)) * l * up + 0.1, s * (z0 + 0.6 * l * q)), V(x0 - 0.55 * l, y1 + (0.8 + 0.45 * (1 - q)) * l * up + 0.05, s * (z0 + 0.95 * l * q)), V(x0 - 0.25 * l, y1 + (0.6 + 0.5 * (1 - q)) * l * up, s * (z0 + 1.05 * l * q))];
        const C = new THREE.CatmullRomCurve3(P).getPoints(16);
        fin(b, 'enamel'); put(b, tubeGeo(C, (t) => 0.11 * Math.pow(1 - t, 0.75) * (1 + 0.15 * Math.pow(Math.max(0, Math.sin(t * 7 * PI)), 4)) + 0.012, { sides: 7, caps: true, tone: (t) => (Math.sin(t * 7 * PI) > 0.55 ? mix(red, 0x200008, 0.55) : t > 0.85 ? redL : red) }));
        k.oct(x0, y1 + 0.04, s * z0, 0.1, 0.08, 'inkL', 0.02);
        if (f === 3) { const e = C[C.length - 1], d = e.clone().sub(C[C.length - 3]).normalize(); b.push().move(e.x, e.y, e.z).rotY(Math.atan2(-d.z, d.x)).rotZ(Math.asin(Math.max(-1, Math.min(1, d.y)))); put(fin(b, 'chrome'), bladeGeo({ len: 0.24, w: 0.1, th: 0.03, wf: WF.spear, ridge: 0, seg: 4, edge: redL, face: red, back: mix(red, 0x000000, 0.4) })); b.pop(); }
      }
      if (f === 3) fireAura(b, -0.15, 1.5, 1.25, 16, 1.0, AURA.ink);
    }
    // Head turret: faceted black head, pearl half mask on the left, one red eye on the right, beak below.
    b.use('turret');
    const tx = 0.2;
    k.oct(tx, y1 + 0.08, 0, 0.32, 0.08, 'under');
    k.prism([[0.45, 0], [0.34, 0.22], [-0.1, 0.28], [-0.26, 0.15], [-0.26, -0.15], [-0.1, -0.28], [0.34, -0.22]].map(([x, z]) => [tx + x, z]), y1 + 0.1, y1 + 0.4, 'ink', 0.06);
    k.prism([[0.2, 0.16], [-0.1, 0.2], [-0.2, 0], [-0.1, -0.2], [0.2, -0.16]].map(([x, z]) => [tx + x, z]), y1 + 0.4, y1 + 0.46, 'inkL', 0.02);
    k.light(tx + 0.4, y1 + 0.3, 0.12, 0.045, LAMP.red, '+x');
    if (orn) {
      k.prism([[0.5, 0.01], [0.38, -0.25], [-0.02, -0.31], [-0.02, 0.01]].map(([x, z]) => [tx + x, z]), y1 + 0.12, y1 + 0.43, 'mask', 0.04);
      k.blk(tx + 0.47, y1 + 0.31, -0.12, 0.06, 0.05, 0.12, 'dark', 0.01);
      if (f >= 2) { k.blk(tx + 0.5, y1 + 0.19, -0.1, 0.03, 0.03, 0.2, 'dark', 0.008); fin(b, 'pearl', mask); for (let i = 0; i < 4; i++) b.push().move(tx + 0.515, y1 + 0.19, -0.03 - i * 0.05).box(0.012, 0.06, 0.012).pop(); }
      // Beak: upper and lower chitin hooks under the face.
      const bt = (pts, r) => put(fin(b, 'enamel'), tubeGeo(new THREE.CatmullRomCurve3(pts).getPoints(8), (t) => r * (1 - 0.92 * t) + 0.004, { sides: 6, caps: true, flat: 0.7, tone: (t) => mix(0x2a0a10, red, t * 0.6) }));
      const bs = [0.7, 1, 1.15][f - 1];
      bt([V(tx + 0.38, y1 + 0.12, 0), V(tx + 0.38 + 0.2 * bs, y1 + 0.1, 0), V(tx + 0.38 + 0.3 * bs, y1 - 0.02 * bs, 0)], 0.09 * bs);
      bt([V(tx + 0.36, y1 + 0.04, 0), V(tx + 0.36 + 0.14 * bs, y1 + 0.0, 0), V(tx + 0.36 + 0.18 * bs, y1 + 0.08, 0)], 0.065 * bs);
    }
    b.use('barrel');
    const gy = (K.my = y1 + 0.16), mx = K.stock.muzzle;
    for (const s of [-1, 1]) { k.blk(tx + 0.3, gy, s * 0.25, 0.2, 0.14, 0.12, 'inkL', 0.03); cannon(b, tx + 0.34, gy, s * 0.25, mx - tx - 0.34, 0.045, mix(CHROME, 0x3a3a44, 0.4), red); }
    b.use('hull');
    K.parts.push(...k.parts); K.top = y1 + (f === 3 ? 1.1 : 0.8);
    return finish(K, { recoil: 0.18 });
  },

  // Kỳ Nhông, bruiser: a long red-orange salamander on four legs. A low body with yellow spots, a row of shingled
  // scale plates down the spine, a flat salamander head turret with bulging amber eyes and the flamer in its mouth, a
  // frill of gold ribs and orange webbing standing round the neck, a segmented tail curling to the right with fire at
  // its tip, and at III a fan of fire rising behind. I: collar, scale stubs, short tail. II: frill, spine, tail fire.
  // III: big frill, long tail, fire fan, salamander aura.
  kynhong(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, y0 = K.g.y0, y1 = K.g.y1;
    const red = f === 1 ? mix(paint, 0x9a8a80, 0.35) : C3(paint), dred = C3(deep), yel = f === 1 ? mix(trim, 0x9a9080, 0.35) : C3(trim), orange = mix(paint, 0xffa020, 0.5);
    const k = new OKit(b, st, trim, form, { red: [red, 'enamel'], redD: [mix(red, dred, 0.55), 'enamel'], yel: [yel, 'enamel'], gold: [GOLD, 'gold'], orange: [orange, 'enamel'], gun: [red, 'enamel'], gunLite: [GOLD, 'gold'], panel: [yel, 'enamel'], under: [mix(dred, 0x100806, 0.5), 'dark'], steel: [GOLD_DEEP, 'gold'], chrome: [CHROME, 'chrome'], dark: [0x140806, 'dark'] });
    b.use('hull');
    k.prism([[1.1, 0.2], [1.0, 0.4], [-0.9, 0.42], [-1.1, 0.25], [-1.1, -0.25], [-0.9, -0.42], [1.0, -0.4], [1.1, -0.2]], y0 - 0.04, y0 + 0.2, 'under', 0.04);
    k.prism([[1.0, 0.18], [0.9, 0.36], [-0.85, 0.38], [-1.04, 0.22], [-1.04, -0.22], [-0.85, -0.38], [0.9, -0.36], [1.0, -0.18]], y0 + 0.16, y1, 'red', 0.07);
    k.blk(0, y0 + 0.18, 0, 1.9, 0.05, 0.8, 'yel', 0.015);
    for (const [x, z] of [[0.55, 0.24], [0.05, -0.26], [-0.45, 0.25], [-0.75, -0.2]]) { fin(b, 'enamel', yel); b.push().move(x, y1 + 0.005, z).cyl(0.08, 0.09, 0.03, 10).pop(); }
    if (orn) {
      // Scale plates shingled down the spine, the biggest mid-back.
      const n = [3, 6, 8][f - 1];
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1), x = lerp(0.25, -1.0, t), s = (f === 1 ? 0.7 : 1) * (0.7 + 0.5 * Math.sin(PI * (0.2 + 0.7 * t)));
        b.push().move(x, y1 + 0.04 + 0.03 * s, 0).rotZ(0.28);
        k.prism([[0.12 * s, 0], [0.0, 0.12 * s], [-0.16 * s, 0.08 * s], [-0.2 * s, 0], [-0.16 * s, -0.08 * s], [0.0, -0.12 * s]], 0, 0.06 * s + 0.03, i % 2 ? 'redD' : 'orange', 0.02);
        k.use('gold'); b.push().move(-0.2 * s, 0.03, 0).cyl(0, 0.03, 0.06 + 0.05 * s, 4).pop();
        b.pop();
      }
      // Tail: chamfered segments curving to the right, gold rings, fire at the tip.
      const tl = [0.55, 0.95, 1.3][f - 1], ns = 5, pts = [[-1.02, y0 + 0.3, 0]];
      let a = 0;
      for (let i = 1; i <= ns; i++) { a += 0.22; const p = pts[i - 1]; pts.push([p[0] - Math.cos(a) * tl / ns, p[1] - 0.04, p[2] + Math.sin(a) * tl / ns]); }
      for (let i = 0; i < ns; i++) { const w = 0.22 * (1 - i / ns * 0.75); k.beam(pts[i], pts[i + 1], w, w * 0.8, i % 2 ? 'redD' : 'red', 0.03); if (f >= 2 && i < ns - 1) k.oct(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2], w * 0.55, w * 0.85, 'gold', 0.015); }
      if (f >= 2) { const e = pts[ns]; flames(b, AURA.salamander, [[e[0], e[1], e[2], 0, 0.9, 0.2, 0.36], [e[0] + 0.05, e[1] + 0.02, e[2], 0.5, 0.4, 0.16, 0.3]]); }
      if (f === 3) {
        // Fire fan rising behind the back.
        const cards = [];
        for (let i = 0; i < 7; i++) { const u = i / 6 * 2 - 1; cards.push([-0.75, y1 + 0.05, u * 0.3, PI / 2, u * 0.9, 0.3, 0.75 * (1 - 0.3 * Math.abs(u))]); }
        flames(b, AURA.salamander, cards);
        fireAura(b, -0.2, 1.75, 1.3, 16, 1.0, AURA.salamander);
      }
    }
    // Head turret: flat salamander head forward of the neck, bulging eyes, gold mouth ring; frill round the neck.
    b.use('turret');
    k.oct(0, y1 + 0.08, 0, 0.32, 0.1, 'under');
    k.prism([[0.98, 0], [0.88, 0.22], [0.4, 0.32], [0.05, 0.26], [0.05, -0.26], [0.4, -0.32], [0.88, -0.22]], y1 + 0.1, y1 + 0.32, 'red', 0.06);
    k.prism([[0.86, 0.14], [0.86, -0.14], [0.4, -0.22], [0.2, 0], [0.4, 0.22]], y1 + 0.32, y1 + 0.37, 'redD', 0.02);
    for (const s of [-1, 1]) {
      fin(b, 'enamel', red); b.push().move(0.55, y1 + 0.34, s * 0.22).scale(1, 0.75, 1).ball(0.1, 1).pop();
      k.lamp(LAMP.amber, () => b.push().move(0.6, y1 + 0.38, s * 0.24).ball(0.06, 1).pop());
    }
    if (orn) {
      // Frill: gold ribs fanned across the neck in a half disc behind the head, orange webbing between.
      const n = [5, 9, 11][f - 1], R = [0.34, 0.58, 0.78][f - 1], span = [1.0, 1.35, 1.5][f - 1];
      const g = bladeGeo({ len: R, w: R * 0.55, th: 0.035, wf: WF.petal, seg: 5, ridge: 0, edge: GOLD, face: orange, face2: mix(orange, yel, 0.5), back: mix(orange, dred, 0.4) });
      fin(b, 'enamel');
      for (let i = 0; i < n; i++) { const th = (i / (n - 1) * 2 - 1) * span; b.push().move(0.12, y1 + 0.26, 0).rotX(th).rotZ(PI / 2 + 0.85).move(0.1, 0, 0); putK(b, g); b.pop(); }
      g.dispose();
      k.oct(0.12, y1 + 0.24, 0, 0.18, 0.12, 'gold', 0.02);
    }
    b.use('barrel');
    const gy = (K.my = y1 + 0.18), mx = K.stock.muzzle;
    k.blk(0.95, gy, 0, 0.12, 0.14, 0.24, 'redD', 0.03);
    fin(b, 'gold', GOLD); b.push().move((0.98 + mx) / 2, gy, 0).rotZ(-PI / 2).cyl(0.1, 0.07, mx - 0.98, 10).pop();
    k.lamp(LAMP.amber, () => b.push().move(mx, gy, 0).rotZ(PI / 2).cyl(0.075, 0.075, 0.02, 10).pop());
    b.use('hull');
    K.parts.push(...k.parts); K.top = y1 + (f === 3 ? 1.0 : 0.8);
    return finish(K, { recoil: 0.15 });
  },

  // Sơn Tinh, tank: a walking mountain on four heavy legs. A body of big stone slabs set a little askew with moss
  // tops, a mountain range on each shoulder (faceted peaks, stone with moss skirts and pale tips), a stone shrine tower
  // turret with a moss crest of leaf plates and lime spirit lamps, and a stout banded stone mortar. I: one small peak
  // each side. II: two peaks, crest. III: three tall peaks, big crest, moss aura.
  sontinh(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, y0 = K.g.y0, y1 = K.g.y1;
    const stone = f === 1 ? C3(0x7a776c) : C3(0x8c8676), moss = f === 1 ? mix(paint, 0x8a9080, 0.3) : mix(paint, st.glow, 0.25), sand = C3(trim), olive = C3(deep);
    const k = new OKit(b, st, trim, form, { stone: [stone, 'pearl'], stoneD: [mix(stone, 0x2a2822, 0.4), 'pearl'], moss: [moss, 'enamel'], mossD: [mix(moss, olive, 0.5), 'enamel'], sand: [sand, 'pearl'], gun: [stone, 'pearl'], gunLite: [sand, 'pearl'], panel: [moss, 'enamel'], under: [mix(olive, 0x141410, 0.5), 'dark'], steel: [0x5a5a50, 'dark'], chrome: [CHROME, 'chrome'], dark: [0x12120e, 'dark'] });
    b.use('hull');
    k.prism([[1.15, 0.2], [0.5, 0.72], [-0.5, 0.72], [-1.15, 0.2], [-1.15, -0.2], [-0.5, -0.72], [0.5, -0.72]], y0 - 0.04, y0 + 0.26, 'under', 0.05);
    k.plate(0.42, y0 + 0.42, 0, 0.95, 0.36, 1.25, { col: 'stone', insert: null, ry: 0.04, ch: 0.08 });
    k.plate(-0.5, y0 + 0.4, 0, 1.0, 0.34, 1.35, { col: 'stoneD', insert: null, ry: -0.05, ch: 0.08 });
    k.plate(-0.05, y1 - 0.02, 0, 1.4, 0.16, 1.05, { col: 'stone', insert: 'moss', rz: 0.02, ch: 0.06 });
    k.plate(0.98, y0 + 0.36, 0, 0.36, 0.14, 0.95, { col: 'stone', insert: 'mossD', rz: -0.55, ch: 0.05 });
    for (const s of [-1, 1]) k.light(1.12, y0 + 0.2, s * 0.3, 0.05, st.glow, '+x');
    if (orn) {
      // Mountain ranges on the shoulders: faceted peaks, moss skirt, pale summit.
      const R = [[[0, 0.3, 0.32]], [[0.15, 0.55, 0.34], [-0.3, 0.38, 0.27]], [[0.1, 0.82, 0.38], [-0.38, 0.55, 0.3], [0.5, 0.42, 0.24]]][f - 1];
      for (const s of [-1, 1]) for (const [dx, H, r] of R) {
        const px = dx - 0.05, pz = s * 0.6, py = y1 + 0.02;
        k.use('mossD'); b.push().move(px, py + 0.05, pz).rotY(0.4 + dx).cyl(r * 1.08, r * 1.15, 0.1, 6).pop();
        k.use('stone'); b.push().move(px, py + H * 0.4, pz).rotY(0.4 + dx).cyl(r * 0.42, r, H * 0.8, 5).pop();
        k.use('sand'); b.push().move(px, py + H * 0.9, pz).rotY(0.4 + dx).cyl(0, r * 0.42, H * 0.2, 5).pop();
      }
      if (f === 3) fireAura(b, 0, 1.8, 1.65, 18, 1.0, AURA.moss);
    }
    // Shrine tower turret.
    b.use('turret');
    const ty = y1 + 0.1;
    k.oct(0, ty + 0.04, 0, 0.5, 0.1, 'under');
    k.plate(0, ty + 0.27, 0, 0.72, 0.36, 0.66, { col: 'stone', insert: null, ch: 0.07 });
    k.oct(0, ty + 0.5, 0, 0.42, 0.1, 'sand', 0.03, 1.1);
    k.oct(0, ty + 0.6, 0, 0.3, 0.1, 'stoneD', 0.03, 1.1);
    for (const s of [-1, 1]) k.light(0.37, ty + 0.3, s * 0.16, 0.05, st.glow, '+x');
    if (orn && f >= 2) {
      // Moss crest: leaf plates standing front to back over the roof.
      const n = f === 2 ? 5 : 7, cl = f === 2 ? 0.3 : 0.45;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), L = cl * (0.7 + 0.5 * Math.sin(PI * t));
        const g = bladeGeo({ len: L, w: 0.2, th: 0.04, wf: WF.petal, seg: 5, ridge: 0, edge: mix(moss, 0xe8ff9a, 0.4), face: moss, face2: mix(moss, olive, 0.4), back: olive });
        b.push().move(0.22 - t * 0.44, ty + 0.64, 0).rotZ(lerp(1.15, 2.0, t)).rotX(PI / 2); put(fin(b, 'enamel'), g); b.pop();
      }
    }
    // Stone mortar: stout barrel with sand bands.
    b.use('barrel');
    const gx = 0.34, gy = (K.my = ty + 0.25), mx = K.stock.muzzle;
    k.blk(gx, gy, 0, 0.2, 0.3, 0.34, 'stoneD', 0.05);
    cannon(b, gx + 0.06, gy, 0, mx - gx - 0.06, 0.12, mix(stone, 0x4a4a40, 0.3), sand);
    b.use('hull');
    K.parts.push(...k.parts); K.top = f === 3 ? y1 + 1.0 : y1 + 0.85;
    return finish(K, { recoil: 0.3 });
  },

  // Bói Cá, sniper: a kingfisher on two legs. A short plated bird body, bright blue back and orange chest, wings
  // folded along the sides (spread a little at III), a short tail fan; the head turret with a white throat, orange
  // cheek stripe and a scope, and the long dark beak as the barrel; a feather crest sweeping back. I: plain body, short
  // beak band. II: folded wings, crest, tail. III: half-open wings, long crest, kingfisher aura.
  boica(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, y0 = K.g.y0, y1 = K.g.y1;
    const blue = f === 1 ? mix(paint, 0x8a9099, 0.3) : mix(paint, 0x2fb8ff, 0.35), navy = C3(deep), orange = f === 1 ? mix(trim, 0x9a9080, 0.35) : C3(trim), cyan = mix(0x5ae0ff, PEARL, 0.2);
    const k = new OKit(b, st, trim, form, { blue: [blue, 'enamel'], navy: [navy, 'enamel'], orange: [orange, 'enamel'], white: [PEARL, 'pearl'], cyan: [cyan, 'enamel'], gun: [blue, 'enamel'], gunLite: [orange, 'enamel'], panel: [cyan, 'enamel'], under: [mix(navy, 0x0a0c10, 0.5), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x0a0c10, 'dark'] });
    b.use('hull');
    k.prism([[0.6, 0.18], [0.45, 0.36], [-0.35, 0.36], [-0.62, 0.18], [-0.62, -0.18], [-0.35, -0.36], [0.45, -0.36], [0.6, -0.18]], y0 - 0.04, y0 + 0.2, 'navy', 0.04);
    k.prism([[0.7, 0], [0.56, 0.3], [0.1, 0.38], [0.1, -0.38], [0.56, -0.3]], y0 + 0.14, y1 - 0.04, 'orange', 0.06);
    k.prism([[0.14, 0.38], [0.14, -0.38], [-0.45, -0.34], [-0.68, -0.15], [-0.68, 0.15], [-0.45, 0.34]], y0 + 0.16, y1, 'blue', 0.06);
    k.plate(-0.2, y1 + 0.02, 0, 0.6, 0.05, 0.44, { col: 'blue', insert: 'cyan' });
    k.light(0.68, y0 + 0.3, 0, 0.045, st.glow, '+x');
    if (orn && f >= 2) {
      const W = f === 2 ? { len: 0.85, reach: 0.16, n: 3, fl0: 0.26, fl1: 0.32 } : { len: 1.0, reach: 0.4, n: 4, fl0: 0.3, fl1: 0.4 };
      for (const s of [-1, 1]) wingPanel(b, s, { x0: 0.25, z0: 0.3, y: y1 + 0.03, ...W, col: { panel: blue, edge: cyan, face: mix(blue, navy, 0.3), face2: navy } });
      // Tail fan: short feathers spread behind and down.
      for (let i = 0; i < 5; i++) {
        const u = i / 4 * 2 - 1, g = bladeGeo({ len: f === 3 ? 0.5 : 0.4, w: 0.13, th: 0.03, wf: WF.feather, seg: 5, edge: cyan, face: i % 2 ? navy : blue, back: navy });
        b.push().move(-0.6, y1 - 0.08, u * 0.06).rotY(PI + u * 0.45).rotZ(-0.3); put(fin(b, 'enamel'), g); b.pop();
      }
      if (f === 3) fireAura(b, -0.1, 1.4, 1.3, 16, 1.0, AURA.kingfisher);
    }
    // Head turret: rounded faceted head, white throat, orange cheek stripe, scope; crest sweeping back.
    b.use('turret');
    const hy = y1 + 0.04;
    k.oct(0.05, hy + 0.04, 0, 0.26, 0.08, 'under');
    k.prism([[0.42, 0], [0.32, 0.2], [-0.05, 0.25], [-0.26, 0.12], [-0.26, -0.12], [-0.05, -0.25], [0.32, -0.2]], hy + 0.08, hy + 0.4, 'blue', 0.07);
    k.prism([[0.44, 0], [0.34, 0.16], [0.14, 0.2], [0.14, -0.2], [0.34, -0.16]], hy + 0.06, hy + 0.2, 'white', 0.04);
    for (const s of [-1, 1]) { k.blk(0.18, hy + 0.27, s * 0.235, 0.34, 0.06, 0.04, 'orange', 0.012); k.light(0.3, hy + 0.32, s * 0.2, 0.035, LAMP.white, s > 0 ? '+z' : '-z'); }
    k.blk(-0.02, hy + 0.47, 0.1, 0.34, 0.08, 0.08, 'navy', 0.02);
    k.lamp(st.glow, () => b.push().move(0.16, hy + 0.47, 0.1).rotZ(PI / 2).cyl(0.03, 0.03, 0.02, 8).pop());
    if (orn && f >= 2) {
      const n = f === 2 ? 3 : 4, cl = f === 2 ? 0.5 : 0.7;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), L = cl * (1 - 0.35 * t);
        const g = bladeGeo({ len: L, w: 0.2, th: 0.04, wf: WF.plume, seg: 6, lift: 0.3, edge: cyan, face: blue, face2: mix(blue, cyan, 0.4), back: navy, band: (q) => (q > 0.6 && Math.floor(q * 10) % 2 ? cyan : blue) });
        b.push().move(-0.1 - t * 0.08, hy + 0.36 + t * 0.02, 0).rotZ(PI - 0.35 - t * 0.22).rotX(PI / 2); put(fin(b, 'enamel'), g); b.pop();
      }
    }
    // Beak barrel: a long tapered dark beak with an orange root band and a lit rail; muzzle at the tip.
    b.use('barrel');
    const gx = 0.36, gy = (K.my = hy + 0.2), mx = K.stock.muzzle, L = mx - gx;
    b.push().move(gx, gy, 0).rotZ(-PI / 2);
    fin(b, 'enamel', 0x1a1c22).lathe([[0.15, 0], [0.13, L * 0.12], [0.085, L * 0.4], [0.05, L * 0.85], [0.04, L * 0.97], [0.0, L]], 10);
    fin(b, 'enamel', orange); b.push().move(0, L * 0.06, 0).cyl(0.15, 0.155, 0.06, 10).pop();
    if (f >= 2) { fin(b, 'chrome', CHROME); b.push().move(0, L * 0.5, 0).cyl(0.075, 0.075, 0.04, 10).pop(); }
    b.pop();
    k.strip(gx + L * 0.4, gy + 0.075, 0, L * 0.5, 'x', 'glow', 0.02);
    b.use('hull');
    K.parts.push(...k.parts); K.top = hy + (f === 3 ? 0.95 : 0.8);
    return finish(K, { recoil: 0.3 });
  },
};
