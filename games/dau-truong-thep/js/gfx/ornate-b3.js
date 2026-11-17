// Ornate batch 3 (dtt-restyle): Bướm Đêm, Báo Gấm, Lươn Điện, Quạ Sét, Tư Mã Ý, Điêu Thuyền, Thủy Tinh.
// Same construction as ornate.js and ornate-b1.js: the chunky plated steel base (OKit) in polished finishes, then one
// or two big motif structures per tank (layered moth wings, a panther tail and claws, a coiled eel body, crow wings
// and a rib cage, a scholar's hat and feather fan, lotus petals and sleeve ribbons, a wave crest and a conch), each
// with its own form III aura ramp. Forms: I plain plates; II armour and the motif at mid size; III the full motif and
// the aura. Running gear, ride height and muzzle come from each tank's frame spec. Models face +x, +z is the right
// side, the ground is y = 0.
import * as THREE from '../../vendor/three.module.min.js';
import { LAMP } from './steel.js';
import { OKit, start, finish, fin, put, at, mix, C3, cannon, fireAura, tubeGeo, bladeGeo, kuduHorn, wingPanel, WF, GOLD, GOLD_DEEP, CHROME, PEARL, DARKM } from './ornate.js';

// Hover tanks draw their own pods (start(..., false)) at the stock ride height of a hover frame.
const HOVER_Y = 0.55;
// Hover pod: an octagonal housing with a rim, a lit ring and a downward thruster flame; y = hull underside.
function hoverPod(h, k, b, x, y, z, r, rim) {
  k.oct(x, y - 0.07, z, r * 1.1, 0.14, 'under', 0.03);
  k.oct(x, y - 0.01, z, r * 1.22, 0.04, rim, 0.012);
  h.lit(b, () => b.push().move(x, y - 0.15, z).cyl(r * 0.8, r * 0.8, 0.02, 10).pop());
  h.flame(b, () => b.push().move(x, y - 0.33, z).cyl(r * 0.85, r * 0.15, 0.3, 8).pop());
}

const PI = Math.PI, TAU = PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (a, b, c) => [[0, new THREE.Color(...a)], [0.4, new THREE.Color(...b)], [1, new THREE.Color(...c)]];
// One aura ramp per tank of this batch (root, middle, tip), none shared with ornate.js, batch 1 or each other.
const AURA = {
  dust: ramp([1.0, 0.9, 0.7], [0.9, 0.5, 0.15], [0.35, 0.04, 0.45]), // moth dust: amber to violet
  vibra: ramp([1.0, 0.85, 0.98], [0.85, 0.18, 0.95], [0.25, 0.0, 0.32]), // panther: hot magenta
  volt: ramp([1.0, 1.0, 0.8], [0.95, 0.88, 0.08], [0.06, 0.3, 0.55]), // eel: yellow to teal
  storm: ramp([0.95, 0.98, 1.0], [0.42, 0.78, 1.0], [0.05, 0.18, 0.55]), // crow: sky-blue lightning
  night: ramp([0.8, 0.75, 0.95], [0.36, 0.2, 0.66], [0.06, 0.02, 0.18]), // strategist: dim indigo
  moon: ramp([0.55, 0.68, 0.95], [0.5, 0.45, 0.95], [0.6, 0.15, 0.55]), // lotus frost: ice to periwinkle, magenta tips
  deep: ramp([0.8, 1.0, 0.95], [0.08, 0.85, 0.66], [0.0, 0.16, 0.42]), // water god: sea green to deep blue
};
const ngon = (r, n, ph = 0, rz = r, cx = 0) => { const o = []; for (let i = 0; i < n; i++) { const a = ph + i / n * TAU; o.push([cx + Math.cos(a) * r, Math.sin(a) * rz]); } return o; };
// Scale a polygon about a point.
const scl = (P, k, c = [0, 0]) => P.map(([x, z]) => [c[0] + (x - c[0]) * k, c[1] + (z - c[1]) * k]);
const cen = (P) => P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length], [0, 0]);

// ---------- shared pieces of this batch ----------
// Layered wing panel in the current frame (x back/forward, z outward for s = 1, y up): an outline drawn three deep
// (rim colour, membrane, a lighter inner panel toward the root), so the edge reads as a stepped rim, not a board.
function layered(k, s, P, y, cols, root = [0, 0], deep = 3) {
  const Z = (Q) => Q.map(([x, z]) => [x, s * z]);
  k.prism(Z(P), y, y + 0.03, cols[0], 0.01);
  if (deep > 1) k.prism(Z(scl(P, 0.86, cen(P))), y + 0.022, y + 0.05, cols[1], 0.01);
  if (deep > 2) k.prism(Z(scl(P, 0.58, [lerp(cen(P)[0], root[0], 0.35), lerp(cen(P)[1], root[1], 0.35)])), y + 0.045, y + 0.068, cols[2], 0.01);
}
// Eye spot: concentric discs lying on the wing (rim, dark ring, lit pupil).
function eyeSpot(k, b, s, x, y, z, r, rim, pupil) {
  k.use(rim); b.push().move(x, y, s * z).cyl(r, r, 0.02, 16).pop();
  k.use('dark'); b.push().move(x, y + 0.012, s * z).cyl(r * 0.68, r * 0.68, 0.02, 14).pop();
  k.lamp(pupil, () => b.push().move(x, y + 0.024, s * z).cyl(r * 0.36, r * 0.36, 0.02, 12).pop());
}
// Feather fan of bladeGeo feathers in the current frame: from roots along a line, angles a (0 = straight back,
// PI/2 = straight out for s = 1), lengths L. Each overlaps the one inside it.
function feathers(b, s, list, o) {
  list.forEach(({ x, z, a, L, w }, i) => {
    const g = bladeGeo({ len: L, w: w ?? o.w, th: o.th ?? 0.035, seg: 6, wf: o.wf || WF.feather, lift: o.lift ?? 0.04, sweep: o.sweep ?? 0, edge: o.edge, face: i % 2 && o.face2 ? o.face2 : o.face, face2: o.faceB, back: o.back, mz: s < 0 });
    at(b, s, [x, (o.y ?? 0) + i * 0.006, z], [o.roll ?? 0, -PI + a, 0], () => put(fin(b, 'enamel'), g));
  });
}
// Pointed cat ear: a flattened four-sided pyramid with an inner plate.
function catEar(b, s, p, hgt, r, out, outer, inner) {
  at(b, s, p, [out, 0, -0.15], () => {
    fin(b, 'enamel', outer); b.push().move(0, hgt / 2, 0).scale(1, 1, 0.5).rotY(PI / 4).cyl(0, r, hgt, 4).pop();
    fin(b, 'enamel', inner); b.push().move(0.05, hgt * 0.42, 0).scale(0.6, 0.78, 0.4).rotY(PI / 4).cyl(0, r, hgt, 4).pop();
  });
}

export const B3 = {
  // Bướm Đêm, trickster: a night moth sorcerer on hover pads. A compact purple thorax with a stepped, banded abdomen
  // trailing aft, a gold amulet with a lit eye on the chest, a moth head turret with big lit compound eyes and two
  // feathered antennae. Each side carries a forewing and a hindwing as layered panels (orange rim, purple membrane,
  // a lighter inner panel, gold veins and an eye spot), raised at a dihedral. A high collar and a cloak of overlapping
  // plates drape over the abdomen. I: small wings folded back, no spots. II: open wings with eye spots, collar.
  // III: big wings, the cloak, a rune ring turning round the hull and the dust aura.
  buomdem(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K, purple = C3(paint), orange = f === 1 ? mix(trim, 0x8a8a90, 0.4) : C3(trim), dpur = C3(deep), mint = C3(st.glow);
    const k = new OKit(b, st, trim, form, { purple: [purple, 'enamel'], purpleL: [mix(purple, 0xd8b0ff, 0.35), 'enamel'], purpleD: [mix(purple, dpur, 0.5), 'enamel'], orange: [orange, 'enamel'], gold: [f === 1 ? mix(GOLD, 0x8a8a90, 0.4) : C3(GOLD), 'gold'], gun: [purple, 'enamel'], gunLite: [GOLD, 'gold'], panel: [orange, 'enamel'], under: [mix(dpur, 0x0c0a12, 0.4), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x120c1a, 'dark'] });
    const y0 = HOVER_Y;
    b.use('hull');
    for (const [x, z] of [[0.45, 0.3], [0.45, -0.3], [-0.6, 0]]) hoverPod(h, k, b, x, y0, z, 0.19, f === 1 ? 'under' : 'gold');
    // Thorax: belly, purple body, orange-trimmed deck; abdomen: three stepped bands tapering aft.
    k.prism(ngon(0.62, 10, PI / 10, 0.56, 0.15), y0 - 0.02, y0 + 0.22, 'under', 0.04);
    k.prism(ngon(0.55, 10, PI / 10, 0.5, 0.15), y0 + 0.18, y0 + 0.44, 'purple', 0.05);
    k.prism(ngon(0.4, 10, PI / 10, 0.36, 0.12), y0 + 0.42, y0 + 0.5, 'orange', 0.02);
    [[-0.5, 0.36, 0.4], [-0.8, 0.28, 0.34], [-1.04, 0.19, 0.28]].forEach(([x, r, t], i) => {
      k.prism(ngon(r, 8, PI / 8, r * 0.95, x), y0 + 0.06, y0 + t, i % 2 ? 'purpleD' : 'purple', 0.04);
      k.prism(ngon(r * 0.82, 8, PI / 8, r * 0.78, x + 0.04), y0 + t - 0.01, y0 + t + 0.04, i === 2 ? 'orange' : 'purpleL', 0.015);
    });
    k.light(-1.2, y0 + 0.18, 0, 0.05, 'glow', '-x');
    // Amulet on the chest: gold ring, lit eye.
    if (f >= 2) {
      fin(b, 'gold', GOLD); b.push().move(0.66, y0 + 0.32, 0).rotZ(PI / 2).cyl(0.13, 0.13, 0.05, 14).pop();
      k.lamp('glow', () => b.push().move(0.69, y0 + 0.32, 0).rotZ(PI / 2).scale(1, 1, 1.4).cyl(0.06, 0.06, 0.03, 10).pop());
    }
    // Wings: forewing over hindwing, root at the shoulder, dihedral up and out.
    const W = [{ sc: 0.62, yaw: -0.85, tilt: 0.25 }, { sc: 0.88, yaw: 0.05, tilt: 0.32 }, { sc: 1.1, yaw: 0.12, tilt: 0.38 }][f - 1];
    const FORE = [[0.12, 0], [0.34, 0.36], [0.34, 0.78], [0.14, 1.1], [-0.14, 1.16], [-0.36, 0.94], [-0.34, 0.42], [-0.14, 0.04]];
    const HIND = [[-0.12, 0.02], [-0.3, 0.38], [-0.42, 0.7], [-0.64, 0.84], [-0.9, 0.7], [-0.94, 0.4], [-0.72, 0.1]];
    const veins = [[0.3, 0.7], [0.1, 1.05], [-0.3, 0.85]];
    for (const s of [-1, 1]) {
      b.push().move(0.12, y0 + 0.42, s * 0.36).rotY(s * W.yaw).rotX(-s * W.tilt);
      const F1 = scl(FORE, W.sc), H1 = scl(HIND, W.sc);
      layered(k, s, H1, -0.06, ['orange', 'purpleD', 'purple'], [0, 0], orn && f >= 2 ? 3 : 2);
      layered(k, s, F1, 0.0, ['orange', 'purple', 'purpleL'], [0, 0], orn && f >= 2 ? 3 : 2);
      if (orn && f >= 2) {
        for (const v of veins) k.beam([0, 0.075, 0], [v[0] * W.sc, 0.075, s * v[1] * W.sc], 0.035, 0.025, 'gold', 0.008);
        k.beam([0.02, 0.08, 0], [0.14 * W.sc, 0.08, s * 1.1 * W.sc], 0.07, 0.05, 'gold', 0.015);
        const e = cen(F1), eh = cen(H1);
        eyeSpot(k, b, s, e[0] - 0.02, 0.07, e[1] + 0.12 * W.sc, 0.17 * W.sc, 'orange', mint);
        eyeSpot(k, b, s, eh[0] - 0.05, 0.0, eh[1] + 0.05, 0.11 * W.sc, 'orange', mint);
      }
      k.oct(0, 0.05, 0, 0.1, 0.12, 'gold', 0.02);
      b.pop();
    }
    if (orn && f >= 2) {
      // High collar: two flared plates behind the head, orange face, gold rim.
      for (const s of [-1, 1]) {
        k.plate(0.05, y0 + 0.68, s * 0.24, 0.1, 0.42, 0.34, { col: 'orange', insert: null, ry: s * 0.5, rx: s * -0.35 });
        k.blk(0.05, y0 + 0.9, s * 0.3, 0.06, 0.05, 0.36, 'gold', 0.015);
      }
    }
    if (orn && f === 3) {
      // Cloak: three overlapping plates each side draping down over the abdomen from the collar.
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        const x = -0.15 - i * 0.32;
        k.plate(x, y0 + 0.5 - i * 0.06, s * (0.3 + i * 0.02), 0.42, 0.05, 0.4, { col: i % 2 ? 'purpleD' : 'purple', insert: null, rx: s * -0.75, ry: s * 0.1 });
        k.blk(x, y0 + 0.36 - i * 0.06, s * (0.47 + i * 0.02), 0.42, 0.04, 0.06, 'orange', 0.012);
      }
      fireAura(b, -0.2, 1.55, 1.5, 16, 0.95, AURA.dust);
    }
    // Moth head turret: stepped octagon, compound eyes, antennae.
    b.use('turret');
    k.oct(0.22, y0 + 0.55, 0, 0.28, 0.1, 'under');
    k.oct(0.24, y0 + 0.68, 0, 0.26, 0.18, 'purple', 0.05, 1.15);
    k.oct(0.22, y0 + 0.8, 0, 0.18, 0.06, 'orange', 0.02, 1.15);
    for (const s of [-1, 1]) {
      fin(b, 'dark', DARKM); b.push().move(0.42, y0 + 0.7, s * 0.17).scale(1, 0.9, 0.8).ball(0.11, 1).pop();
      k.lamp('glow', () => b.push().move(0.47, y0 + 0.71, s * 0.19).scale(1, 0.9, 0.8).ball(0.075, 1).pop());
      const al = [0.35, 0.55, 0.7][f - 1];
      const P = [V(0.34, y0 + 0.8, s * 0.08), V(0.3, y0 + 0.8 + al * 0.5, s * (0.12 + al * 0.15)), V(0.1, y0 + 0.8 + al * 0.85, s * (0.16 + al * 0.35)), V(-0.1, y0 + 0.8 + al * 0.8, s * (0.2 + al * 0.5))];
      put(fin(b, 'gold'), tubeGeo(new THREE.CatmullRomCurve3(P).getPoints(10), (t) => 0.025 + 0.045 * Math.sin(PI * Math.min(1, t * 1.15)), { sides: 6, caps: true, flat: 0.45, tone: (t) => (t > 0.3 ? mix(GOLD, orange, 0.4) : C3(GOLD)) }));
    }
    b.use('barrel');
    K.my = y0 + 0.5;
    k.blk(0.5, K.my, 0, 0.2, 0.16, 0.22, 'under', 0.03);
    cannon(b, 0.56, K.my, 0, K.stock.muzzle - 0.56, 0.055, CHROME, f === 1 ? GOLD_DEEP : orange);
    k.lamp('glow', () => b.push().move(K.stock.muzzle - 0.02, K.my, 0).rotZ(PI / 2).cyl(0.06, 0.06, 0.02, 10).pop());
    if (orn && f === 3) {
      // Rune ring: a gold ring round the hull with lit rune tablets, turning slowly.
      b.use('runes');
      const R = 1.0, ry = y0 + 0.3;
      fin(b, 'gold', GOLD); b.push().move(-0.1, ry, 0).geo(new THREE.TorusGeometry(R, 0.03, 4, 40).rotateX(PI / 2)).pop();
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; k.lamp('glow', () => b.push().move(-0.1 + Math.cos(a) * R, ry + 0.05, Math.sin(a) * R).rotY(-a).box(0.05, 0.03, 0.14).pop()); }
      K.parts.push({ name: 'runes', on: 'hull', kind: 'spin', axis: 'y', by: 'time', rate: 0.8, p: [-0.1, ry, 0], model: true });
    }
    b.use('hull');
    K.parts.push(...k.parts); K.top = y0 + (f === 3 ? 1.7 : 1.3);
    return finish(K, { recoil: 0.18 });
  },

  // Báo Gấm, flanker: a low black panther on four legs. Long, low gunmetal-black plates with violet enamel cloud-spot
  // rosettes on the flanks, an angular cat head turret (ears, lit violet eyes, a chrome fang collar), forward claw
  // blades at the front shoulders (three curved blades per side) and a long segmented tail curling up behind.
  // I: plain plates, short tail, short claws. II: rosettes, claws, full tail. III: longer claws, a violet spine
  // stripe of shoulder plates, the vibra aura.
  baogam(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, black = C3(paint), violet = f === 1 ? mix(trim, 0x8a8a90, 0.45) : C3(trim), dk = C3(deep);
    const k = new OKit(b, st, trim, form, { black: [black, 'enamel'], blackL: [mix(black, 0x6a6a7a, 0.3), 'enamel'], violet: [violet, 'enamel'], violetD: [mix(violet, dk, 0.5), 'enamel'], silver: [mix(CHROME, 0x8a8aa0, 0.3), 'chrome'], gun: [black, 'enamel'], gunLite: [mix(CHROME, 0x8a8aa0, 0.3), 'chrome'], panel: [violet, 'enamel'], under: [mix(dk, 0x050508, 0.3), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x08080c, 'dark'] });
    const y0 = K.g.y0, y1 = K.g.y1;
    b.use('hull');
    // Long low body: chest wider than the waist, a raised haunch at the back.
    const body = [[1.02, 0.18], [0.9, 0.4], [0.4, 0.46], [-0.2, 0.36], [-0.7, 0.44], [-1.0, 0.34], [-1.08, 0.12], [-1.08, -0.12], [-1.0, -0.34], [-0.7, -0.44], [-0.2, -0.36], [0.4, -0.46], [0.9, -0.4], [1.02, -0.18]];
    k.prism(scl(body, 0.94), y0 - 0.14, y0 + 0.16, 'under', 0.04);
    k.prism(body, y0 + 0.12, y1, 'black', 0.06);
    // Shoulder and haunch armour over the leg roots: heavy angled plates so the legs come out of real joints.
    for (const s of [-1, 1]) for (const [x, w] of [[0.5, 0.55], [-0.7, 0.6]]) {
      k.plate(x, y0 + 0.02, s * 0.44, w, 0.34, 0.14, { col: 'blackL', insert: null, rx: s * 0.22 });
      if (orn && f >= 2) k.blk(x, y0 + 0.2, s * 0.5, w * 0.9, 0.04, 0.1, 'violet', 0.012);
    }
    k.plate(0.45, y1 + 0.02, 0, 0.7, 0.06, 0.62, { col: 'blackL', insert: null });
    k.plate(-0.78, y1 + 0.02, 0, 0.5, 0.08, 0.64, { col: 'blackL', insert: null });
    k.blk(-0.18, y1, 0, 0.5, 0.05, 0.44, 'black', 0.02);
    for (const s of [-1, 1]) k.light(1.02, y0 + 0.2, s * 0.24, 0.04, LAMP.white, '+x');
    if (orn && f >= 2) {
      // Cloud-spot rosettes: violet plates broken into a ring of three petals round a dark centre, on the flanks and back.
      // Rosettes on the back either side of the spine: a ring of four violet petals round a dark centre.
      const spots = f === 2 ? [[0.0, 0.22, 0.17]] : [[0.05, 0.22, 0.18], [-0.55, 0.2, 0.16]];
      for (const s of [-1, 1]) for (const [x, z, r] of spots) {
        const yy = y1 + 0.005, zz = s * z;
        for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; k.prism(ngon(r * 0.4, 6, a, r * 0.32, 0).map(([px, pz]) => [x + Math.cos(a) * r * 0.62 + px, zz + Math.sin(a) * r * 0.62 + pz]), yy, yy + 0.035, 'violet', 0.01); }
      }
    }
    if (orn && f === 3) for (let i = 0; i < 4; i++) k.prism([[0.7 - i * 0.42, 0.06], [0.48 - i * 0.42, 0.1], [0.36 - i * 0.42, 0], [0.48 - i * 0.42, -0.1], [0.7 - i * 0.42, -0.06]], y1 + 0.06, y1 + 0.12, 'violet', 0.015);
    // Claw blades: three curved blades each side from the front shoulders, reaching forward past the nose.
    const cl = [0.4, 0.7, 0.9][f - 1];
    for (const s of [-1, 1]) {
      // Claw gauntlet on the front shoulder, three blades fanned flat and curving inward past the nose.
      k.plate(0.85, y0 + 0.16, s * 0.5, 0.42, 0.24, 0.2, { col: 'silver', insert: null, ry: s * 0.25 });
      for (let i = 0; i < 3; i++) {
        const g = bladeGeo({ len: cl * (1 - 0.15 * Math.abs(i - 1)), w: 0.15, th: 0.045, wf: WF.spear, sweep: -0.3, lift: -0.08, ridge: 0, seg: 6, edge: CHROME, face: f === 1 ? CHROME : violet, face2: CHROME, back: 0x5a5a6a, mz: s < 0 });
        at(b, s, [1.0, y0 + 0.14, 0.5 + (i - 1) * 0.1], [0, 0.18 - 0.14 * (i - 1), -0.1], () => put(fin(b, 'chrome'), g));
      }
    }
    // Tail: a long plated tail rising from the rump, curling up and over with a lit violet tip.
    const tl = orn ? [0.6, 0.95, 1.15][f - 1] : 0.5;
    const TP = new THREE.CatmullRomCurve3([V(-1.0, y1 - 0.04, 0), V(-1.0 - 0.4 * tl, y1 + 0.05, 0.06 * tl), V(-1.0 - 0.75 * tl, y1 + 0.4 * tl, 0.14 * tl), V(-1.0 - 0.72 * tl, y1 + 0.85 * tl, 0.12 * tl), V(-1.0 - 0.42 * tl, y1 + 1.0 * tl, 0.05 * tl)]).getPoints(14);
    put(fin(b, 'enamel'), tubeGeo(TP, (t) => 0.1 * (1 - 0.6 * t) + 0.02, { sides: 7, caps: true, tone: (t) => (t > 0.85 ? violet : Math.floor(t * 9) % 2 ? mix(black, 0x50506a, 0.3) : black) }));
    k.lamp('glow', () => b.push().move(TP[14].x, TP[14].y, TP[14].z).ball(0.05, 1).pop());
    if (orn && f === 3) fireAura(b, -0.1, 1.6, 1.25, 16, 0.95, AURA.vibra);
    // Cat head turret: angular head, muzzle, ears, eyes, fang collar.
    b.use('turret');
    const hx = 0.45, hy = y1 + 0.06;
    k.oct(hx - 0.05, hy, 0, 0.3, 0.08, 'under');
    k.prism([[hx + 0.42, 0.12], [hx + 0.28, 0.24], [hx - 0.1, 0.27], [hx - 0.22, 0.14], [hx - 0.22, -0.14], [hx - 0.1, -0.27], [hx + 0.28, -0.24], [hx + 0.42, -0.12]], hy + 0.04, hy + 0.3, 'black', 0.05);
    k.prism([[hx + 0.56, 0.08], [hx + 0.5, 0.14], [hx + 0.3, 0.16], [hx + 0.3, -0.16], [hx + 0.5, -0.14], [hx + 0.56, -0.08]], hy + 0.06, hy + 0.2, 'blackL', 0.03);
    k.blk(hx + 0.55, hy + 0.2, 0, 0.06, 0.04, 0.08, 'dark', 0.01);
    if (f >= 2) k.prism([[hx + 0.3, 0.05], [hx - 0.15, 0.08], [hx - 0.15, -0.08], [hx + 0.3, -0.05]], hy + 0.29, hy + 0.33, 'violet', 0.01);
    for (const s of [-1, 1]) {
      k.blk(hx + 0.34, hy + 0.24, s * 0.14, 0.1, 0.035, 0.1, 'dark', 0.01);
      k.lamp('glow', () => b.push().move(hx + 0.36, hy + 0.26, s * 0.14).box(0.08, 0.02, 0.07).pop());
      catEar(b, s, [hx - 0.08, hy + 0.28, 0.17], [0.2, 0.3, 0.34][f - 1], 0.13, 0.3, black, violet);
    }
    if (orn && f >= 2) {
      fin(b, 'chrome', CHROME);
      for (let i = 0; i < 7; i++) { const a = -PI * 0.42 + i / 6 * PI * 0.84; b.push().move(hx + 0.1 + Math.cos(a) * 0.3, hy + 0.02, Math.sin(a) * 0.3).rotZ(PI).cyl(0.035, 0, 0.12, 4).pop(); }
    }
    b.use('barrel');
    K.my = hy + 0.12;
    for (const s of [-1, 1]) cannon(b, hx + 0.4, K.my, s * 0.1, K.stock.muzzle - hx - 0.4, 0.04, CHROME, f === 1 ? CHROME : violet);
    b.use('hull');
    K.parts.push(...k.parts); K.top = y1 + (f === 3 ? 1.3 : 1.0);
    return finish(K, { recoil: 0.2 });
  },

  // Lươn Điện, assault: an electric eel on hover pads. A plated eel head (jaws round a lens gun, cyan eyes, a gold brow)
  // leads a body of chamfered plated segments with gold collars that snakes in an S from above and coils up into a
  // loop at the tail. A continuous yellow fin crest runs along the spine, and two capacitor cans with yellow coil bands
  // stand on the neck. The body sways ('seg'). I: short straight body, no crest. II: S body, crest, capacitors.
  // III: longer body, tail coil, coil ring round the neck, the volt aura.
  luondien(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K, blue = C3(paint), yellow = f === 1 ? mix(trim, 0x8a8a90, 0.4) : C3(trim), navy = C3(deep);
    const k = new OKit(b, st, trim, form, { blue: [blue, 'enamel'], blueD: [mix(blue, navy, 0.5), 'enamel'], blueL: [mix(blue, 0x7ad8ff, 0.3), 'enamel'], yellow: [yellow, 'enamel'], gold: [GOLD, 'gold'], gun: [blue, 'enamel'], gunLite: [GOLD, 'gold'], panel: [yellow, 'enamel'], under: [mix(navy, 0x05080c, 0.4), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x060a10, 'dark'], copper: [0xc8743a, 'gold'] });
    const y0 = HOVER_Y;
    b.use('hull');
    for (const [x, z] of [[1.0, 0.24], [1.0, -0.24], [0.45, 0]]) hoverPod(h, k, b, x, y0, z, 0.18, f === 1 ? 'under' : 'yellow');
    // Head: lower jaw, upper skull, brow, eyes.
    k.prism([[1.5, 0.12], [1.55, 0], [1.5, -0.12], [0.9, -0.36], [0.35, -0.34], [0.3, 0], [0.35, 0.34], [0.9, 0.36]], y0 - 0.02, y0 + 0.2, 'under', 0.04);
    k.prism([[1.42, 0.16], [1.48, 0], [1.42, -0.16], [0.9, -0.38], [0.4, -0.36], [0.3, 0], [0.4, 0.36], [0.9, 0.38]], y0 + 0.22, y0 + 0.44, 'blue', 0.05);
    k.plate(0.7, y0 + 0.47, 0, 0.6, 0.06, 0.46, { col: 'blueL', insert: null });
    k.prism([[1.3, 0.1], [1.34, 0], [1.3, -0.1], [1.0, -0.22], [0.95, 0], [1.0, 0.22]], y0 + 0.44, y0 + 0.5, 'yellow', 0.015);
    for (const s of [-1, 1]) {
      k.light(1.12, y0 + 0.36, s * 0.3, 0.045, 'glow', s > 0 ? '+z' : '-z');
      k.plate(0.6, y0 + 0.3, s * 0.4, 0.55, 0.18, 0.06, { col: 'yellow', insert: null, ry: s * 0.06 });
    }
    fin(b, 'chrome', CHROME); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) b.push().move(1.38 - i * 0.14, y0 + 0.2, s * (0.1 + i * 0.06)).cyl(0.028, 0, 0.07, 4).pop();
    if (orn && f >= 2) {
      // Capacitor cans on the neck: dark cans, copper coil bands, lit caps.
      for (const s of [-1, 1]) {
        const cx = 0.42, cz = s * 0.2, ch = f === 3 ? 0.42 : 0.32, cb = y0 + 0.48;
        k.oct(cx, cb + 0.02, cz, 0.12, 0.04, 'gold', 0.01);
        k.use('dark'); b.push().move(cx, cb + ch / 2, cz).cyl(0.085, 0.085, ch, 10).pop();
        k.use('copper'); for (let i = 0; i < 3; i++) b.push().move(cx, cb + ch * (0.25 + i * 0.25), cz).geo(new THREE.TorusGeometry(0.095, 0.022, 4, 14).rotateX(PI / 2)).pop();
        k.lamp('glow', () => b.push().move(cx, cb + ch + 0.02, cz).cyl(0.07, 0.07, 0.04, 10).pop());
      }
    }
    if (orn && f === 3) {
      k.use('copper'); for (let i = 0; i < 4; i++) b.push().move(0.22 - i * 0.07, y0 + 0.28, 0).geo(new THREE.TorusGeometry(0.36, 0.035, 4, 18).rotateY(PI / 2)).pop();
      fireAura(b, -0.3, 1.9, 1.3, 18, 1.0, AURA.volt);
    }
    // Body: plated segments along a curve, gold collars, fin crest; drawn in the sway batch.
    b.use('seg');
    const BODY = f === 1 || !orn
      ? [V(0.4, y0 + 0.24, 0), V(-0.3, y0 + 0.22, 0.06), V(-0.95, y0 + 0.2, -0.04), V(-1.45, y0 + 0.2, 0.02)]
      : f === 2
        ? [V(0.4, y0 + 0.24, 0), V(-0.25, y0 + 0.22, 0.26), V(-0.9, y0 + 0.2, -0.12), V(-1.45, y0 + 0.2, -0.28), V(-1.75, y0 + 0.26, 0.0)]
        : [V(0.4, y0 + 0.24, 0), V(-0.25, y0 + 0.22, 0.3), V(-0.9, y0 + 0.2, -0.14), V(-1.45, y0 + 0.22, -0.3), V(-1.78, y0 + 0.4, 0.0), V(-1.6, y0 + 0.82, 0.1), V(-1.3, y0 + 0.86, 0.04), V(-1.22, y0 + 0.6, -0.04), V(-1.42, y0 + 0.5, -0.08)];
    const n = f === 3 ? 16 : 10, P = new THREE.CatmullRomCurve3(BODY).getPoints(n);
    for (let i = 0; i < n; i++) {
      const t = i / n, w = lerp(0.6, 0.2, t), hh = w * 0.72;
      k.beam([P[i].x, P[i].y, P[i].z], [P[i + 1].x, P[i + 1].y, P[i + 1].z], w, hh, i % 2 ? 'blueD' : 'blue', 0.04);
      if (i % 2 === 0 && i) {
        const d = P[i + 1].clone().sub(P[i]).normalize().multiplyScalar(0.04);
        k.beam([P[i].x - d.x, P[i].y - d.y, P[i].z - d.z], [P[i].x + d.x, P[i].y + d.y, P[i].z + d.z], w * 1.12, hh * 1.12, 'gold', 0.015);
      }
      if (orn && f >= 2 && i < n - 1) {
        // Fin crest: an upright yellow plate along the segment top, overlapping the next.
        const a = P[i], c = P[i + 1], l = a.distanceTo(c) * 1.3, fh = lerp(0.3, 0.12, t), up = hh / 2 - 0.01;
        b.push().move((a.x + c.x) / 2, (a.y + c.y) / 2 + up, (a.z + c.z) / 2).rotY(Math.atan2(-(c.z - a.z), c.x - a.x)).rotZ(Math.atan2(c.y - a.y, Math.hypot(c.x - a.x, c.z - a.z)));
        k.profile([[l / 2, 0], [-l / 2, 0], [-l * 0.62, fh], [l * 0.1, fh * 0.75]], -0.02, 0.02, 'yellow', 0.01);
        b.pop();
      }
    }
    k.lamp('glow', () => b.push().move(P[n].x, P[n].y, P[n].z).ball(0.08, 1).pop());
    K.parts.push({ name: 'seg', on: 'hull', kind: 'sway', p: [0.35, y0 + 0.24, 0], model: true, amp: 0.14 });
    b.use('turret');
    k.oct(0.75, y0 + 0.52, 0, 0.18, 0.06, 'under');
    b.use('barrel');
    K.my = y0 + 0.3;
    cannon(b, 1.25, K.my, 0, K.stock.muzzle - 1.25, 0.06, CHROME, f === 1 ? GOLD_DEEP : yellow);
    k.lamp('glow', () => b.push().move(K.stock.muzzle - 0.02, K.my, 0).rotZ(PI / 2).cyl(0.065, 0.065, 0.02, 10).pop());
    b.use('hull');
    K.parts.push(...k.parts); K.top = y0 + (f === 3 ? 1.3 : 1.0);
    return finish(K, { recoil: 0.15 });
  },

  // Quạ Sét, flanker: a storm crow on two legs. A diamond torso of dark indigo plates, an angular crow head turret with a
  // long beak round the gun and one tall crest feather, a crow wing each side (arm spar, covert plates, secondaries
  // along the trailing edge and splayed primaries at the tip), a fanned tail, and from II a carapace of violet rib
  // arcs over the back. I: wings folded along the body. II: half-open wings, ribs. III: wide wings, lit ribs, storm aura.
  quaset(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, ind = C3(paint), violet = f === 1 ? mix(trim, 0x8a8a90, 0.45) : C3(trim), dk = C3(deep), sky = C3(st.glow);
    const k = new OKit(b, st, trim, form, { ind: [ind, 'enamel'], indL: [mix(ind, 0x6a6aa0, 0.3), 'enamel'], indD: [mix(ind, dk, 0.5), 'enamel'], violet: [violet, 'enamel'], feather: [mix(dk, 0x202040, 0.4), 'enamel'], gold: [GOLD, 'gold'], gun: [ind, 'enamel'], gunLite: [CHROME, 'chrome'], panel: [violet, 'enamel'], under: [mix(dk, 0x050508, 0.3), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x07060e, 'dark'] });
    const y0 = K.g.y0, y1 = K.g.y1;
    b.use('hull');
    const dia = [[0.95, 0], [0.4, 0.5], [-0.3, 0.52], [-0.72, 0.26], [-0.8, 0], [-0.72, -0.26], [-0.3, -0.52], [0.4, -0.5]];
    k.prism(scl(dia, 0.92), y0 - 0.06, y0 + 0.16, 'under', 0.04);
    k.prism(dia, y0 + 0.12, y1, 'ind', 0.06);
    k.prism(scl(dia, 0.7, [0.1, 0]), y1 - 0.01, y1 + 0.06, 'indL', 0.02);
    for (const s of [-1, 1]) k.light(0.8, y0 + 0.24, s * 0.14, 0.04, 'glow', '+x');
    // Wings.
    // Wings: a solid swept panel (violet leading edge, overlapping feather plates along the trailing edge) raised at a
    // dihedral, plus long primary feathers splayed at the tip like a crow's fingers from II.
    const W = [{ len: 1.0, reach: 0.22, n: 4, fl0: 0.22, fl1: 0.28, tilt: 0.1 }, { len: 0.75, reach: 0.88, n: 5, fl0: 0.3, fl1: 0.42, tilt: 0.24 }, { len: 0.85, reach: 1.2, n: 6, fl0: 0.34, fl1: 0.5, tilt: 0.3 }][f - 1];
    const wcol = { panel: mix(ind, dk, 0.35), edge: violet, face: mix(dk, 0x2a2a48, 0.5), face2: mix(ind, dk, 0.2) };
    for (const s of [-1, 1]) {
      const z0 = 0.4, x0 = 0.3, wy = y1 - 0.02;
      b.push().move(0, wy, s * z0).rotX(-s * W.tilt).move(0, -wy, -s * z0);
      wingPanel(b, s, { x0, z0, y: wy, ...W, col: wcol }, orn ? 'all' : 'frame');
      if (orn && f >= 2) {
        const T = [x0 - W.len, z0 + W.reach], np = f === 2 ? 3 : 4, fl = [];
        for (let i = 0; i < np; i++) { const t = i / (np - 1); fl.push({ x: T[0] + 0.12 + 0.1 * t, z: T[1] - 0.18 * (1 - t), a: lerp(0.35, 1.1, t), L: (f === 2 ? 0.45 : 0.62) * (1 - 0.15 * t), w: 0.16 }); }
        feathers(b, s, fl, { y: wy - 0.05, th: 0.03, edge: violet, face: mix(dk, 0x2a2a48, 0.5), face2: mix(ind, dk, 0.3), back: dk, lift: 0.0 });
      }
      b.pop();
    }
    // Tail fan.
    const tf = [];
    const tn = f === 1 ? 3 : 5;
    for (let i = 0; i < tn; i++) { const t = tn === 1 ? 0 : i / (tn - 1) * 2 - 1; tf.push({ x: -0.7, z: t * 0.08, a: t * 0.35, L: [0.5, 0.65, 0.8][f - 1] * (1 - 0.15 * Math.abs(t)), w: 0.2 }); }
    feathers(b, 1, tf, { y: y0 + 0.3, th: 0.03, edge: violet, face: mix(dk, 0x2a2a48, 0.5), face2: mix(ind, dk, 0.4), back: dk, lift: 0.15, roll: 0 });
    if (orn && f >= 2) {
      // Rib carapace: violet arcs from the spine over the back down to the flanks.
      const ribs = f === 2 ? [0.15, -0.2] : [0.3, 0.0, -0.3, -0.58];
      ribs.forEach((x, i) => {
        const rr = (f === 3 ? 0.68 : 0.58) * (1 - 0.1 * i), top = y1 + (f === 3 ? 0.5 : 0.38) - 0.05 * i;
        const P = []; for (let j = 0; j <= 12; j++) { const a = -PI / 2 + j / 12 * PI; P.push(V(x - 0.12 * Math.abs(Math.sin(a)), lerp(y1 - 0.05, top, Math.cos(a)), Math.sin(a) * rr)); }
        put(fin(b, 'enamel'), tubeGeo(P, (t) => 0.045 + 0.02 * Math.sin(PI * t), { sides: 6, caps: true, tone: () => violet }));
        if (f === 3) h.lit(b, () => b.push().move(x, top + 0.04, 0).box(0.06, 0.03, 0.12).pop());
      });
      k.beam([0.4, y1 + (f === 3 ? 0.5 : 0.38), 0], [-0.62, y1 + 0.3, 0], 0.08, 0.06, 'violet', 0.02);
    }
    if (orn && f === 3) fireAura(b, -0.1, 1.5, 1.4, 16, 1.0, AURA.storm);
    // Crow head turret.
    b.use('turret');
    const hx = 0.45, hy = y1 + 0.06;
    k.oct(hx - 0.08, hy, 0, 0.28, 0.08, 'under');
    k.prism([[hx + 0.3, 0.14], [hx + 0.1, 0.24], [hx - 0.25, 0.2], [hx - 0.34, 0], [hx - 0.25, -0.2], [hx + 0.1, -0.24], [hx + 0.3, -0.14]], hy + 0.04, hy + 0.36, 'ind', 0.05);
    k.prism([[hx + 0.2, 0.08], [hx - 0.25, 0.12], [hx - 0.25, -0.12], [hx + 0.2, -0.08]], hy + 0.35, hy + 0.4, 'indL', 0.015);
    for (const s of [-1, 1]) { k.light(hx + 0.18, hy + 0.26, s * 0.2, 0.04, 'glow', s > 0 ? '+z' : '-z'); k.blk(hx + 0.12, hy + 0.32, s * 0.16, 0.2, 0.04, 0.08, 'violet', 0.01); }
    // Beak: upper and lower plates wrapping the barrel root.
    k.prism([[hx + 0.75, 0], [hx + 0.3, 0.13], [hx + 0.28, -0.13]], hy + 0.2, hy + 0.3, 'dark', 0.02);
    k.prism([[hx + 0.62, 0], [hx + 0.3, 0.11], [hx + 0.28, -0.11]], hy + 0.04, hy + 0.12, 'dark', 0.02);
    if (orn) {
      const cl = [0.45, 0.8, 1.05][f - 1];
      const g = bladeGeo({ len: cl, w: 0.16, th: 0.035, wf: WF.plume, sweep: 0, lift: 0.45, seg: 9, edge: violet, face: mix(dk, 0x2a2a48, 0.5), back: dk, band: f === 3 ? (t) => (t > 0.7 ? sky : mix(dk, 0x2a2a48, 0.5)) : undefined });
      b.push().move(hx - 0.05, hy + 0.38, 0).rotY(PI).rotX(PI / 2).rotZ(0.25); put(fin(b, 'enamel'), g); b.pop();
    }
    b.use('barrel');
    K.my = hy + 0.17;
    cannon(b, hx + 0.3, K.my, 0, K.stock.muzzle - hx - 0.3, 0.05, CHROME, f === 1 ? CHROME : violet);
    b.use('hull');
    K.parts.push(...k.parts); K.top = hy + (f === 3 ? 1.1 : 0.9);
    return finish(K, { recoil: 0.25 });
  },

  // Tư Mã Ý, control: a strategist's war carriage on six wheels. A wedge plan of slate plates with silver trim and
  // violet lamps, the turret a scholar-official's hat (a stepped crown, a raised back lobe and two long flat flaps
  // standing out left and right), a crane-feather fan held up at the right rear, and from II shadow tendrils curling
  // out from under the carriage. I: short hat flaps, no fan. II: fan, two tendrils a side. III: wide flaps, big fan,
  // three tendrils a side with lit tips, the night aura.
  tumay(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form), { f, orn } = K, slate = C3(paint), silver = f === 1 ? mix(trim, 0x7a7a80, 0.3) : C3(trim), ink = C3(deep), vio = C3(st.glow);
    const k = new OKit(b, st, trim, form, { slate: [slate, 'enamel'], slateL: [mix(slate, 0x9a96b8, 0.3), 'enamel'], ink: [ink, 'enamel'], silver: [silver, 'chrome'], gold: [GOLD, 'gold'], violet: [mix(vio, ink, 0.3), 'enamel'], gun: [slate, 'enamel'], gunLite: [silver, 'chrome'], panel: [ink, 'enamel'], under: [mix(ink, 0x050508, 0.3), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x08070c, 'dark'], pearl: [PEARL, 'pearl'] });
    const y0 = K.g.y0, y1 = K.g.y1;
    b.use('hull');
    const tri = [[1.08, 0.12], [1.08, -0.12], [-0.55, -0.72], [-1.05, -0.62], [-1.12, -0.3], [-1.12, 0.3], [-1.05, 0.62], [-0.55, 0.72]];
    k.prism(scl(tri, 0.94), y0, y0 + 0.2, 'under', 0.04);
    k.prism(tri, y0 + 0.16, y1, 'slate', 0.06);
    k.prism(scl(tri, 0.8, [-0.1, 0]), y1 - 0.01, y1 + 0.05, 'silver', 0.015);
    k.prism(scl(tri, 0.68, [-0.1, 0]), y1 + 0.03, y1 + 0.08, 'slateL', 0.015);
    k.strip(-1.13, y0 + 0.3, 0, 0.9, 'z', 'glow', 0.03);
    for (const s of [-1, 1]) {
      k.light(1.0, y0 + 0.24, s * 0.1, 0.045, 'glow', '+x');
      if (f === 1 || !orn) { k.plate(-0.2, y0 + 0.3, s * 0.66, 1.0, 0.24, 0.08, { col: 'slateL', insert: null, ry: s * 0.35, rx: s * 0.12 }); continue; }
      // Strategy scrolls along the flanks: a parchment roll with gold end knobs and an ink cord.
      const sl = f === 2 ? 0.9 : 1.1, sz = s * 0.66, sy = y0 + 0.32;
      b.push().move(-0.25, sy, sz).rotY(s * 0.33);
      k.use('pearl'); b.push().rotZ(PI / 2).cyl(0.13, 0.13, sl, 12).pop();
      k.use('ink'); for (const x of [-sl * 0.2, sl * 0.2]) b.push().move(x, 0, 0).rotZ(PI / 2).cyl(0.14, 0.14, 0.05, 12).pop();
      k.use('gold'); for (const x of [-1, 1]) b.push().move(x * (sl / 2 + 0.05), 0, 0).rotZ(PI / 2).cyl(0.08, 0.1, 0.1, 8).pop();
      b.pop();
    }
    if (orn && f >= 2) {
      // Shadow tendrils: dark tapering curls from under the carriage, out over the ground, lit tips at III.
      const tn = f === 2 ? 2 : 3;
      for (const s of [-1, 1]) for (let i = 0; i < tn; i++) {
        const x = -0.4 - i * 0.32, L = (f === 2 ? 0.6 : 0.85) * (1 - 0.12 * i);
        const P = [V(x, y0 + 0.1, s * 0.45), V(x - 0.2 * L, 0.12, s * (0.6 + 0.45 * L)), V(x - 0.55 * L, 0.25, s * (0.65 + 0.85 * L)), V(x - 0.85 * L, 0.32 + 0.2 * L, s * (0.55 + 0.9 * L))];
        put(fin(b, 'enamel'), tubeGeo(new THREE.CatmullRomCurve3(P).getPoints(12), (t) => 0.085 * Math.pow(1 - t, 0.8) + 0.012, { sides: 6, caps: true, tone: (t) => mix(ink, vio, Math.max(0, t - 0.55) * (f === 3 ? 1.6 : 0.6)) }));
        if (f === 3) h.lit(b, () => b.push().move(P[3].x, P[3].y, P[3].z).ball(0.04, 1).pop());
      }
    }
    if (orn && f >= 2) {
      // Crane-feather fan held up at the right rear: handle, gold cap, a half-round fan of white feathers.
      // The fan lies in its local XY plane (feathers fanning up from the handle), then the whole fan is raised and
      // turned so its face shows from above and from the front.
      const fr = f === 2 ? 0.6 : 0.85, fn = f === 2 ? 9 : 11;
      b.push().move(-0.72, y1 + 0.06, 0.28).rotY(0.3).rotZ(0.75).rotY(PI / 2);
      k.use('ink'); b.push().move(0, 0.16, 0).cyl(0.04, 0.045, 0.32, 6).pop();
      fin(b, 'gold', GOLD); b.push().move(0, 0.34, 0).cyl(0.08, 0.06, 0.08, 8).pop();
      // Backing: a half-round pearl plate with a dark rim, so the fan is one closed shape.
      const half = []; for (let i = 0; i <= 12; i++) { const a = -PI * 0.42 + i / 12 * PI * 0.84; half.push([Math.sin(a) * fr * 0.9, 0.36 + Math.cos(a) * fr * 0.9]); }
      half.push([0, 0.36]);
      k.profile(half, -0.012, 0.012, 'pearl', 0.008);
      for (let i = 0; i < fn; i++) {
        const a = -PI * 0.44 + i / (fn - 1) * PI * 0.88;
        const g = bladeGeo({ len: fr, w: 0.26, th: 0.03, seg: 6, wf: WF.feather, edge: 0xdcdce4, face: i % 2 ? PEARL : 0xe8e6f0, face2: 0xc8c6d4, back: 0xb0aec0, band: (t) => (t > 0.8 ? 0x3a3650 : i % 2 ? PEARL : 0xe8e6f0) });
        // Blade runs along +x; turn it to point up (+y) and fan it about z.
        b.push().move(0, 0.36, 0.02).rotZ(PI / 2 - a).rotX(PI / 2); put(fin(b, 'pearl'), g); b.pop();
      }
      b.pop();
    }
    if (orn && f === 3) fireAura(b, -0.15, 1.55, 1.45, 16, 0.95, AURA.night);
    // Hat turret: crown block, raised back lobe, silver band, two long flat flaps out to the sides.
    b.use('turret');
    const tx = 0.05, ty = y1 + 0.08;
    k.oct(tx, ty, 0, 0.36, 0.08, 'under');
    k.plate(tx + 0.05, ty + 0.18, 0, 0.62, 0.26, 0.56, { col: 'ink', insert: null });
    k.blk(tx + 0.05, ty + 0.1, 0, 0.66, 0.06, 0.6, 'silver', 0.02);
    k.plate(tx - 0.12, ty + 0.4, 0, 0.32, 0.22, 0.46, { col: 'ink', insert: null });
    if (f >= 2) k.blk(tx + 0.3, ty + 0.2, 0, 0.06, 0.1, 0.18, 'gold', 0.015);
    k.light(tx + 0.36, ty + 0.2, 0, 0.04, 'glow', '+x');
    const fl = orn ? [0.32, 0.55, 0.78][f - 1] : 0.25;
    for (const s of [-1, 1]) {
      // Hat flap: a silver stalk out of the back lobe ending in a broad oval paddle, tilted up a little.
      const fz = 0.22 + fl * 0.3, pr = 0.12 + fl * 0.14, pz = 0.22 + fl * 0.72;
      k.beam([tx - 0.12, ty + 0.42, s * 0.2], [tx - 0.14, ty + 0.46, s * fz], 0.06, 0.04, 'silver', 0.01);
      b.push().move(tx - 0.14, ty + 0.47, s * pz).rotX(-s * 0.22);
      k.prism(ngon(pr, 12, 0, fl * 0.4), -0.025, 0.025, 'ink', 0.012);
      k.prism(ngon(pr * 0.78, 12, 0, fl * 0.4 * 0.78), 0.015, 0.04, f >= 2 ? 'violet' : 'slateL', 0.008);
      b.pop();
    }
    b.use('barrel');
    K.my = ty + 0.12;
    k.blk(tx + 0.42, K.my, 0, 0.2, 0.18, 0.24, 'slate', 0.03);
    cannon(b, tx + 0.48, K.my, 0, K.stock.muzzle - tx - 0.48, 0.06, CHROME, f === 1 ? CHROME : silver);
    k.lamp('glow', () => b.push().move(K.stock.muzzle - 0.02, K.my, 0).rotZ(PI / 2).cyl(0.07, 0.07, 0.02, 10).pop());
    b.use('hull');
    K.parts.push(...k.parts); K.top = ty + (f === 3 ? 1.1 : 0.8);
    return finish(K, { recoil: 0.18 });
  },

  // Điêu Thuyền, control: a lotus palanquin on hover pads. A round pearl base with a ring of pink-tipped lotus petals
  // round its rim (a second, upright inner ring from II), a stepped turret carrying a hair bun with a gold hairpin and
  // bead tassel, a crescent moon standing behind the head, lotus wings of long layered petals fanning up and back, and
  // two sleeve ribbons trailing in S curves behind. I: one petal ring, no wings. II: inner ring, short wings, moon,
  // ribbons. III: full wings, long ribbons, the moon lit, the moon aura.
  dieuthuyen(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K, pearl = C3(paint), pink = f === 1 ? mix(trim, 0x9a9098, 0.45) : C3(trim), lilac = C3(deep), ice = C3(st.glow);
    const k = new OKit(b, st, trim, form, { pearl: [pearl, 'pearl'], pink: [pink, 'enamel'], pinkL: [mix(pink, PEARL, 0.5), 'pearl'], lilac: [lilac, 'enamel'], gold: [GOLD, 'gold'], gun: [pearl, 'pearl'], gunLite: [GOLD, 'gold'], panel: [pink, 'enamel'], under: [mix(lilac, 0x2a2238, 0.2), 'enamel'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x18121e, 'dark'], moon: [0xf6eccc, 'pearl'] });
    const y0 = HOVER_Y, y1 = y0 + 0.36;
    b.use('hull');
    for (const [x, z] of [[0.4, 0.4], [0.4, -0.4], [-0.45, 0]]) hoverPod(h, k, b, x, y0, z, 0.18, f === 1 ? 'under' : 'gold');
    k.prism(ngon(0.74, 12, PI / 12), y0 - 0.02, y0 + 0.16, 'under', 0.04);
    k.prism(ngon(0.68, 12, PI / 12), y0 + 0.12, y1, 'pearl', 0.06);
    k.prism(ngon(0.5, 12, 0), y1 - 0.01, y1 + 0.05, 'pinkL', 0.015);
    k.prism(ngon(0.44, 12, PI / 12), y1 + 0.03, y1 + 0.06, 'gold', 0.01);
        // Lotus petal ring round the rim, tilted out; inner upright ring from II.
    const petal = (len, w, face) => bladeGeo({ len, w, th: 0.04, seg: 6, wf: WF.petal, lift: 0.25, ridge: 0, edge: mix(pink, PEARL, 0.3), face, face2: mix(face, pink, 0.4), back: mix(pearl, lilac, 0.2), band: (t) => mix(face, pink, Math.min(1, Math.max(0, (t - 0.45) * 2.2))) });
    const pr = [0.32, 0.4, 0.46][f - 1];
    for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * TAU; b.push().move(0, y0 + 0.36, 0).rotY(-a).move(0.6, 0, 0).rotZ(0.75); put(fin(b, 'pearl'), petal(pr, 0.26, C3(PEARL))); b.pop(); }
    if (orn && f >= 2) {
      // Lotus wings: long broad petals fanning out and back from a gold hub behind the turret, overlapping, each
      // pearl at the root deepening to pink at the tip, raised a little and rolled so their faces show from above.
      const wl = f === 2 ? 0.66 : 1.15, wn = 3;
      for (const s of [-1, 1]) {
        k.oct(-0.32, y1 + 0.1, s * 0.28, 0.11, 0.1, 'gold', 0.02);
        for (let i = 0; i < wn; i++) {
          const t = i / (wn - 1), L = wl * (1 - 0.2 * t);
          const g = bladeGeo({ len: L, w: 0.5 - 0.08 * t, th: 0.05, seg: 8, wf: WF.petal, lift: 0.12, sweep: 0.05, ridge: 0, edge: mix(pink, 0xffffff, 0.35), face: mix(PEARL, pink, 0.1), face2: mix(pink, PEARL, 0.45), back: mix(pink, lilac, 0.4), band: (u) => mix(mix(PEARL, pink, 0.08 + 0.15 * t), pink, Math.min(1, Math.max(0, (u - 0.45) * 2.0))), mz: s < 0 });
          at(b, s, [-0.32, y1 + 0.14 - i * 0.03, 0.3], [0.12, -PI / 2 + 0.1 - t * 0.75, 0.2 - 0.05 * t], () => put(fin(b, 'pearl'), g));
        }
      }
      // Sleeve ribbons: flat ribbons from the shoulders, out and back in an S, gold weights at the ends.
      const rl = f === 2 ? 0.6 : 1.15;
      for (const s of [-1, 1]) {
        const P = [V(0.0, y1 + 0.02, s * 0.5), V(-0.3, y1 - 0.05, s * (0.72 + 0.1 * rl)), V(-0.65 * rl, y1 + 0.05, s * (0.62 + 0.2 * rl)), V(-0.95 * rl, y1 - 0.1, s * (0.78 + 0.25 * rl)), V(-1.2 * rl, y1 - 0.02, s * (0.6 + 0.3 * rl))];
        put(fin(b, 'enamel'), tubeGeo(new THREE.CatmullRomCurve3(P).getPoints(16), (t) => 0.1 * (1 - 0.3 * t), { sides: 6, flat: 0.18, up: V(0, 1, 0), caps: true, tone: (t) => mix(pink, lilac, t * 0.8) }));
        fin(b, 'gold', GOLD); b.push().move(P[4].x, P[4].y, P[4].z).ball(0.05, 1).pop();
      }
    }
    if (orn && f === 3) fireAura(b, -0.1, 1.4, 1.4, 16, 0.75, AURA.moon);
    // Turret: stepped octagon head, lit visor band, bun with hairpin and tassel, crescent moon behind.
    b.use('turret');
    const tx = 0.15, ty = y1 + 0.1;
    k.oct(tx, ty, 0, 0.3, 0.08, 'under');
    k.oct(tx, ty + 0.14, 0, 0.28, 0.22, 'pearl', 0.05, 1.1);
    k.oct(tx, ty + 0.27, 0, 0.22, 0.06, 'gold', 0.02, 1.1);
    k.strip(tx + 0.3, ty + 0.16, 0, 0.26, 'z', 'glow', 0.03);
    // Bun: two stacked lilac octagons.
    k.oct(tx - 0.06, ty + 0.36, 0, 0.16, 0.12, 'lilac', 0.04);
    k.oct(tx - 0.06, ty + 0.46, 0, 0.1, 0.08, 'lilac', 0.03);
    if (orn && f >= 2) {
      fin(b, 'gold', GOLD); b.push().move(tx - 0.06, ty + 0.42, 0).rotX(PI / 2).rotZ(0.35).cyl(0.018, 0.018, 0.62, 6).pop();
      for (const s of [-1, 1]) { b.push().move(tx - 0.06 - s * 0.1, ty + 0.42 + s * 0.04, s * 0.29).ball(0.04, 1).pop(); }
      // Tassel: three gold beads hanging from the pin's right end with a pink drop.
      for (let i = 0; i < 3; i++) { fin(b, 'gold', GOLD); b.push().move(tx - 0.16, ty + 0.36 - i * 0.08, 0.32).ball(0.025, 0).pop(); }
      k.lamp(pink, () => b.push().move(tx - 0.16, ty + 0.1, 0.32).scale(1, 1.6, 1).ball(0.035, 1).pop());
      // Crescent moon crest: a pale arc standing behind the bun, horns up, its inner edge lit at III.
      const R = f === 2 ? 0.24 : 0.3, mx = tx - 0.2, my = ty + 0.46 + R * 0.25;
      k.use('moon'); b.push().move(mx, my, 0).rotY(PI / 2).rotZ(PI * 0.875).scale(1, 1, 1.5).geo(new THREE.TorusGeometry(R, 0.06, 6, 24, PI * 1.25)).pop();
      if (f === 3) h.lit(b, () => b.push().move(mx + 0.05, my, 0).rotY(PI / 2).rotZ(PI * 0.875).geo(new THREE.TorusGeometry(R - 0.055, 0.018, 4, 24, PI * 1.25)).pop());
    }
    b.use('barrel');
    K.my = ty + 0.1;
    cannon(b, tx + 0.3, K.my, 0, K.stock.muzzle - tx - 0.3, 0.05, CHROME, f === 1 ? GOLD_DEEP : pink);
    k.lamp('glow', () => b.push().move(K.stock.muzzle - 0.02, K.my, 0).rotZ(PI / 2).cyl(0.06, 0.06, 0.02, 10).pop());
    b.use('hull');
    K.parts.push(...k.parts); K.top = ty + (f === 3 ? 1.15 : 0.9);
    return finish(K, { recoil: 0.15 });
  },

  // Thủy Tinh, control: the water god's warship on hover pads. A blue boat hull with a white foam rail, a bow that
  // splits two foam spray plates outward, ribbed pectoral fins each side, a forked tail fluke aft, a tall curling wave
  // crest standing behind the turret, a spiral conch horn on the turret and from II a rain cloud of faceted puffs over
  // the stern with lit drops falling. I: plain hull, small fins, horn stub. II: wave crest, conch, small cloud.
  // III: tall double crest, big cloud, the deep aura.
  thuytinh(h, b, st, paint, trim, deep, form) {
    const K = start(h, b, st, paint, trim, deep, form, false), { f, orn } = K, blue = C3(paint), foam = f === 1 ? mix(trim, 0x8a9099, 0.35) : C3(trim), navy = C3(deep), aqua = C3(st.glow);
    const k = new OKit(b, st, trim, form, { blue: [blue, 'enamel'], blueL: [mix(blue, aqua, 0.3), 'enamel'], navy: [navy, 'enamel'], foam: [foam, 'pearl'], aqua: [mix(aqua, blue, 0.3), 'enamel'], gold: [GOLD, 'gold'], gun: [blue, 'enamel'], gunLite: [GOLD, 'gold'], panel: [foam, 'pearl'], under: [mix(navy, 0x04080c, 0.4), 'dark'], steel: [CHROME, 'chrome'], chrome: [CHROME, 'chrome'], dark: [0x050a12, 'dark'], cloud: [0xb8c2d0, 'pearl'], cloudD: [0x7a8698, 'pearl'] });
    const y0 = HOVER_Y, y1 = y0 + 0.42;
    b.use('hull');
    for (const [x, z] of [[0.6, 0.3], [0.6, -0.3], [-0.6, 0.3], [-0.6, -0.3]]) hoverPod(h, k, b, x, y0, z, 0.18, f === 1 ? 'under' : 'gold');
    const boat =[[1.25, 0], [0.5, 0.52], [-0.4, 0.6], [-1.1, 0.48], [-1.18, 0.2], [-1.18, -0.2], [-1.1, -0.48], [-0.4, -0.6], [0.5, -0.52]];
    k.prism(scl(boat, 0.9, [0.05, 0]), y0 - 0.04, y0 + 0.16, 'under', 0.04);
    k.prism(scl(boat, 1.04, [0.05, 0]), y0 + 0.12, y0 + 0.2, 'foam', 0.02);
    k.prism(boat, y0 + 0.18, y1, 'blue', 0.06);
    k.plate(-0.3, y1 + 0.02, 0, 1.2, 0.06, 0.7, { col: 'navy', insert: null });
    k.prism([[1.12, 0], [0.55, 0.26], [0.3, 0.2], [0.3, -0.2], [0.55, -0.26]], y1 - 0.01, y1 + 0.05, 'blueL', 0.015);
    for (const s of [-1, 1]) k.light(1.0, y0 + 0.3, s * 0.18, 0.045, 'glow', '+x');
    // Bow spray: two foam plates curling out from the stem.
    if (orn && f >= 2) for (const s of [-1, 1]) {
      const sp = [[1.3, 0.02], [1.0, 0.32], [0.62, 0.62], [0.42, 0.72], [0.5, 0.6], [0.7, 0.42], [0.95, 0.2]];
      k.prism(sp.map(([x, z]) => [x, s * z]), y0 + 0.2, y0 + 0.27, 'foam', 0.015);
    }
    // Pectoral fins: a fan of gold rays with a membrane, angled down and out.
    const fs = orn ? [0.6, 0.85, 1.0][f - 1] : 0.55;
    for (const s of [-1, 1]) {
      b.push().move(0.15, y0 + 0.32, s * 0.55).rotX(s * 0.35);
      const mem = [[0.05, 0], [-0.1 * fs, 0.5 * fs], [-0.45 * fs, 0.62 * fs], [-0.6 * fs, 0.4 * fs], [-0.4, 0]];
      k.prism(mem.map(([x, z]) => [x, s * z]), -0.02, 0.02, 'aqua', 0.008);
      for (const p of mem.slice(1, 4)) k.beam([0, 0.03, 0], [p[0], 0.03, s * p[1]], 0.04, 0.03, 'gold', 0.008);
      b.pop();
    }
    // Tail fluke: two swept lobes aft.
    const tf = orn ? [0.4, 0.6, 0.75][f - 1] : 0.35;
    k.blk(-1.22, y0 + 0.36, 0, 0.18, 0.14, 0.2, 'navy', 0.03);
    for (const s of [-1, 1]) k.prism([[-1.2, 0], [-1.3 - 0.4 * tf, s * 0.45 * tf], [-1.3 - 0.75 * tf, s * 0.62 * tf], [-1.3 - 0.5 * tf, s * 0.25 * tf], [-1.36, 0]], y0 + 0.32, y0 + 0.38, f === 1 ? 'blue' : 'aqua', 0.012);
    if (orn && f >= 2) {
      // Wave crest behind the turret: a tall curl of blue water with a foam lip, standing on the centreline.
      const crest = (x0, sc, z0) => {
        const wv = [[x0 - 0.75 * sc, 0], [x0 + 0.35 * sc, 0], [x0 + 0.45 * sc, 0.3 * sc], [x0 + 0.36 * sc, 0.62 * sc], [x0 + 0.12 * sc, 0.8 * sc], [x0 - 0.1 * sc, 0.74 * sc], [x0 + 0.04 * sc, 0.6 * sc], [x0 + 0.12 * sc, 0.42 * sc], [x0 - 0.15 * sc, 0.3 * sc], [x0 - 0.5 * sc, 0.16 * sc]];
        k.profile(wv.map(([x, y]) => [x, y1 + y]), z0 - 0.06, z0 + 0.06, 'blueL', 0.02);
        k.profile(wv.slice(2, 8).map(([x, y]) => [x + 0.03, y1 + y + 0.03]), z0 - 0.075, z0 + 0.075, 'foam', 0.02);
      };
      if (f === 2) crest(-0.55, 0.9, 0);
      else { crest(-0.5, 1.2, 0.16); crest(-0.75, 0.9, -0.18); }
    }
    if (orn && f >= 2) {
      // Rain cloud over the stern: faceted puffs, lit drops below.
      const cs = f === 2 ? 0.7 : 1.0, cx = -0.85, cy = y1 + 0.95 * cs + 0.2;
      const puffs = [[0, 0, 0, 0.24], [0.22, -0.04, 0.12, 0.18], [-0.22, -0.03, -0.1, 0.2], [0.05, 0.12, -0.08, 0.17], [-0.1, -0.02, 0.2, 0.16], [0.12, -0.05, -0.22, 0.15]];
      puffs.forEach(([x, y, z, r], i) => { k.use(i % 3 === 2 ? 'cloudD' : 'cloud'); b.push().move(cx + x * cs, cy + y * cs, z * cs).scale(1.2, 0.8, 1).ball(r * cs, 1).pop(); });
      h.lit(b, () => { for (let i = 0; i < (f === 3 ? 7 : 4); i++) { const a = i * 2.4; b.push().move(cx + Math.cos(a) * 0.2 * cs, cy - 0.32 * cs - (i % 3) * 0.12, Math.sin(a) * 0.22 * cs).box(0.018, 0.12, 0.018).pop(); } });
    }
    if (orn && f === 3) fireAura(b, -0.15, 1.7, 1.35, 18, 1.0, AURA.deep);
    // Turret: stepped octagon, conch horn on top.
    b.use('turret');
    const tx = 0.3, ty = y1 + 0.08;
    k.oct(tx, ty, 0, 0.36, 0.08, 'under');
    k.oct(tx, ty + 0.14, 0, 0.32, 0.22, 'blue', 0.05, 1.2);
    k.oct(tx - 0.02, ty + 0.28, 0, 0.22, 0.06, 'foam', 0.02, 1.2);
    for (const s of [-1, 1]) k.light(tx + 0.36, ty + 0.16, s * 0.14, 0.04, 'glow', '+x');
    const R = orn ? [{ H: 0.25, turns: 1.2, rho: 0.03, r0: 0.1, rings: 4 }, { H: 0.5, turns: 2.4, rho: 0.05, r0: 0.17, rings: 8 }, { H: 0.62, turns: 3.0, rho: 0.06, r0: 0.21, rings: 10 }][f - 1] : { H: 0.22, turns: 1, rho: 0.02, r0: 0.08, rings: 3 };
    put(fin(b, 'pearl'), kuduHorn([tx - 0.05, ty + 0.3, 0], V(-0.65, 0.75, 0), { ...R, a: PEARL, c: f === 1 ? 0xc8c0b8 : 0xf0a890 }));
    b.use('barrel');
    K.my = ty + 0.12;
    k.blk(tx + 0.45, K.my, 0, 0.22, 0.2, 0.26, 'navy', 0.03);
    cannon(b, tx + 0.5, K.my, 0, K.stock.muzzle - tx - 0.5, 0.065, CHROME, f === 1 ? GOLD_DEEP : foam);
    b.use('hull');
    K.parts.push(...k.parts); K.top = orn && f >= 2 ? y1 + (f === 3 ? 1.4 : 1.1) : y1 + 0.7;
    return finish(K, { recoil: 0.22 });
  },
};
