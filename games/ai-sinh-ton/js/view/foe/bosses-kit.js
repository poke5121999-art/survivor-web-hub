// Shells for the six kit bosses (js/bz/boss-<kind>.js): parts hung on the nodes of each kit rig's node table ('n.torso',
// 'n.arms.0.sh', ...), written in the rig's own units (before T.scale). `keep` lists the rig nodes that carry skill effects
// (glow sprites, muzzles, beams' anchors) so they stay on screen under the new body.
// ph: 1 shows only in phase 2 (under half life), ph: 2 only in phase 1.
const THREE = window.THREE;

// a flat three-cornered sheet (cape hem, wing membrane, fin, ear) as three stacked slabs of thickness t, widest on the
// base from b1 to b2 and stepping in toward the apex
function tri(g, apex, b1, b2, t, o) {
  const A = new THREE.Vector3(...apex); const B1 = new THREE.Vector3(...b1); const B2 = new THREE.Vector3(...b2);
  const M = B1.clone().add(B2).multiplyScalar(0.5);
  const Y = A.clone().sub(M); const len = Y.length(); Y.normalize();
  const X = B2.clone().sub(B1); const w = X.length(); X.addScaledVector(Y, -X.dot(Y)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  for (let i = 0; i < 3; i++) {
    const c = M.clone().lerp(A, (i + 0.5) / 3);
    g.put('box', [w * (1 - i / 3) * 0.92, len / 3 * 1.02, t], [c.x, c.y, c.z], [e.x, e.y, e.z], o);
  }
  return g;
}
// a flat strap of width w and thickness t from a to b, its flat side facing `up` (default +z)
function strap(g, a, b, w, t, o, up = [0, 0, 1]) {
  const A = new THREE.Vector3(...a); const B = new THREE.Vector3(...b);
  const Y = B.clone().sub(A); const len = Y.length(); Y.normalize();
  const Z = new THREE.Vector3(...up); Z.addScaledVector(Y, -Z.dot(Y)).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  const c = A.clone().add(B).multiplyScalar(0.5);
  return g.put('box', [w, len, t], [c.x, c.y, c.z], [e.x, e.y, e.z], o);
}
const P2 = (col, glow = 1) => ({ col, glow, ph: 1 });

// ---------------- Bá Tước Máu: a caped noble ----------------
const VA = { coat: 0x2c2232, coat2: 0x40304a, crim: 0x9a1a32, crimL: 0xbc2c46, skin: 0xd8cfda, hair: 0x1c1622, gold: 0xd4a43c,
  lace: 0xece2e4, boot: 0x1a141c, pants: 0x241d2a, blood: 0xff2a48 };
const CAPE_LEN = [1.10, 1.333, 1.333, 1.10];
function capePanel(g, i) {
  const L = CAPE_LEN[i]; const u = (i - 1.5) / 1.5;
  g.box(0.3, L * 0.8, 0.035, [0, -L * 0.4, -0.012], { col: VA.coat });
  g.box(0.27, L * 0.78, 0.02, [0, -L * 0.39, 0.014], { col: VA.crim });
  // phase 1: a clean hem with a point; phase 2: torn into rags that drip blood
  g.box(0.3, L * 0.14, 0.035, [0, -L * 0.87, -0.012], { col: VA.coat, ph: 2 });
  tri(g, [u * 0.04, -L - 0.16, -0.012], [-0.15, -L * 0.92, -0.012], [0.15, -L * 0.92, -0.012], 0.035, { col: VA.coat, ph: 2 });
  g.box(0.3, 0.05, 0.045, [0, -L * 0.93, -0.012], { col: VA.crimL, ph: 2 });
  for (const [x, d] of [[-0.1, 0.34], [0.0, 0.18], [0.1, 0.42]]) tri(g, [x * 1.2, -L * 0.8 - d, -0.012], [x - 0.06, -L * 0.79, -0.012], [x + 0.06, -L * 0.79, -0.012], 0.035, { col: VA.coat, ph: 1 });
  g.spike([0.04, -L * 0.78, 0.02], [0.05, -L * 0.98, 0.02], 0.02, P2(VA.blood));
  strap(g, [-0.08, -L * 0.1, 0.03], [-0.04, -L * 0.6, 0.03], 0.018, 0.01, P2(VA.blood));
}
const vampire = {
  burst: 0xff2040,
  keep: ['n.aura', 'n.eyeGlow', 'n.handGlow'],
  parts: {
    'n.torso': (g) => {
      // waist, belt, a tailcoat: rounded chest, crimson waistcoat, lapels, a lace jabot and gold buttons
      g.ball(0.25, 0.16, 0.17, [0, 0.04, 0], { col: VA.pants });
      g.ball(0.27, 0.05, 0.185, [0, 0.11, 0], { col: VA.crim });
      g.gem(0.05, 0.045, 0.03, [0, 0.11, 0.18], { col: VA.gold });
      g.ball(0.28, 0.31, 0.18, [0, 0.39, -0.01], { col: VA.coat });
      g.ball(0.17, 0.26, 0.08, [0, 0.35, 0.1], { col: VA.crim });
      g.pair((s) => strap(g, [s * 0.07, 0.15, 0.17], [s * 0.17, 0.6, 0.15], 0.09, 0.03, { col: VA.coat2 }));
      for (let i = 0; i < 3; i++) g.gem(0.07 - i * 0.012, 0.05, 0.035, [0, 0.6 - i * 0.065, 0.175], { col: VA.lace });
      for (let i = 0; i < 3; i++) g.ball(0.022, 0.022, 0.015, [0, 0.2 + i * 0.08, 0.18], { col: VA.gold, lo: true });
      g.gem(0.045, 0.045, 0.025, [0, 0.66, 0.17], { col: VA.blood, glow: 0.7 });
      // coat tails at the sides
      g.pair((s) => tri(g, [s * 0.24, -0.62, -0.08], [s * 0.2, 0.08, 0.06], [s * 0.2, 0.08, -0.16], 0.03, { col: VA.coat }));
      // a capelet over the shoulders, pauldrons with gold trim
      g.ball(0.37, 0.11, 0.22, [0, 0.66, -0.04], { col: VA.coat2 });
      g.pair((s) => {
        g.ball(0.13, 0.1, 0.14, [s * 0.33, 0.64, -0.01], { col: VA.coat2 });
        g.ball(0.135, 0.03, 0.145, [s * 0.33, 0.6, -0.01], { col: VA.gold });
        g.spike([s * 0.38, 0.7, -0.02], [s * 0.46, 0.84, -0.05], 0.035, { col: VA.gold });
      });
      // the tall collar flaring behind the head: dark outside, crimson inside, pointed tips
      g.pair((s) => {
        strap(g, [s * 0.2, 0.68, -0.06], [s * 0.34, 1.12, -0.12], 0.3, 0.035, { col: VA.coat }, [s, 0, 0.3]);
        strap(g, [s * 0.19, 0.7, -0.04], [s * 0.31, 1.08, -0.1], 0.24, 0.02, { col: VA.crim }, [s, 0, 0.3]);
        g.spike([s * 0.33, 1.08, -0.12], [s * 0.42, 1.28, -0.16], 0.05, { col: VA.coat });
      });
      strap(g, [0, 0.66, -0.17], [0, 1.1, -0.27], 0.6, 0.035, { col: VA.coat });
      strap(g, [0, 0.68, -0.15], [0, 1.06, -0.24], 0.5, 0.02, { col: VA.crim });
      // phase 2: blood veins across the chest, the brooch flares, the collar grows thorns
      for (const [x, y, rz] of [[-0.12, 0.42, 0.5], [0.1, 0.36, -0.6], [-0.05, 0.26, -0.3], [0.14, 0.5, 0.4]]) g.box(0.02, 0.16, 0.02, [x, y, 0.185], P2(VA.blood), [0, 0, rz]);
      g.gem(0.075, 0.075, 0.04, [0, 0.66, 0.18], P2(VA.blood));
      g.pair((s) => { for (let k = 0; k < 3; k++) g.spike([s * 0.28, 0.82 + k * 0.12, -0.1], [s * 0.47, 0.88 + k * 0.13, -0.14], 0.035, P2(VA.crimL, 0.6)); });
    },
    'n.head': (g) => {
      g.ball(0.15, 0.19, 0.16, [0, 0.17, 0], { col: VA.skin });
      g.gem(0.08, 0.08, 0.08, [0, 0.03, 0.07], { col: VA.skin });
      g.spike([0, 0.17, 0.14], [0, 0.1, 0.2], 0.025, { col: VA.skin });
      // slicked-back hair with a widow's peak, swept points behind
      g.ball(0.165, 0.12, 0.17, [0, 0.27, -0.02], { col: VA.hair });
      g.ball(0.15, 0.18, 0.1, [0, 0.18, -0.1], { col: VA.hair });
      tri(g, [0, 0.22, 0.165], [-0.09, 0.33, 0.14], [0.09, 0.33, 0.14], 0.04, { col: VA.hair });
      for (const x of [-0.08, 0, 0.08]) g.spike([x, 0.3, -0.06], [x * 1.5, 0.26 - Math.abs(x), -0.34], 0.06, { col: VA.hair });
      g.pair((s) => {
        tri(g, [s * 0.28, 0.3, -0.08], [s * 0.13, 0.22, 0.02], [s * 0.13, 0.12, -0.02], 0.03, { col: VA.skin });
        g.box(0.09, 0.022, 0.03, [s * 0.06, 0.235, 0.14], { col: VA.hair }, [0, 0, s * 0.35]);
        g.ball(0.032, 0.02, 0.015, [s * 0.058, 0.195, 0.148], { col: VA.blood, glow: 1, lo: true });
        g.spike([s * 0.035, 0.075, 0.13], [s * 0.035, 0.01, 0.14], 0.016, { col: 0xffffff });
      });
      g.box(0.09, 0.016, 0.02, [0, 0.075, 0.145], { col: 0x3a1020 });
      // phase 1: a thin gold circlet; phase 2: it gives way to horns and the eyes burn
      g.limb([0, 0.25, -0.01], [0, 0.285, -0.01], 0.17, 0.17, { col: VA.gold, ph: 2 });
      g.gem(0.03, 0.035, 0.02, [0, 0.27, 0.165], { col: VA.blood, glow: 0.8, ph: 2 });
      g.pair((s) => {
        g.limb([s * 0.08, 0.3, 0.02], [s * 0.17, 0.42, -0.06], 0.035, 0.03, { col: 0x4a1020, ph: 1 });
        g.spike([s * 0.17, 0.42, -0.06], [s * 0.15, 0.56, -0.2], 0.03, { col: 0x4a1020, ph: 1 });
        g.ball(0.042, 0.03, 0.02, [s * 0.058, 0.195, 0.15], { col: 0xff5060, glow: 1, ph: 1, lo: true });
        g.box(0.012, 0.07, 0.01, [s * 0.06, 0.15, 0.152], P2(VA.blood));
      });
    },
    'n.arms.0.sh': (g) => vArm(g), 'n.arms.1.sh': (g) => vArm(g),
    'n.arms.0.el': (g) => vFore(g), 'n.arms.1.el': (g) => vFore(g),
    'n.arms.0.hand': (g) => vHand(g), 'n.arms.1.hand': (g) => vHand(g),
    'n.legs.0.hip': (g) => vThigh(g), 'n.legs.1.hip': (g) => vThigh(g),
    'n.legs.0.knee': (g) => vShin(g), 'n.legs.1.knee': (g) => vShin(g),
    'n.cape.0': (g) => capePanel(g, 0), 'n.cape.2': (g) => capePanel(g, 1), 'n.cape.4': (g) => capePanel(g, 2), 'n.cape.6': (g) => capePanel(g, 3),
  },
};
function vArm(g) { g.ball(0.1, 0.1, 0.1, [0, 0, 0], { col: VA.coat2 }); g.limb([0, 0, 0], [0, -0.5, 0], 0.075, 0.065, { col: VA.coat }); }
function vFore(g) {
  g.limb([0, 0.02, 0], [0, -0.4, 0], 0.065, 0.085, { col: VA.coat });
  g.limb([0, -0.34, 0], [0, -0.45, 0], 0.095, 0.1, { col: VA.crim });
  g.limb([0, -0.45, 0], [0, -0.5, 0], 0.09, 0.07, { col: VA.lace });
}
function vHand(g) {
  g.ball(0.055, 0.07, 0.04, [0, -0.05, 0], { col: VA.skin });
  g.ball(0.02, 0.02, 0.02, [0.04, -0.07, 0.03], { col: VA.gold, lo: true });
  for (let f = -1.5; f <= 1.5; f++) {
    g.spike([f * 0.022, -0.1, 0.01], [f * 0.032, -0.27, 0.06], 0.013, { col: 0x1a1018, ph: 2 });
    g.spike([f * 0.022, -0.1, 0.01], [f * 0.04, -0.36, 0.08], 0.016, P2(VA.blood, 0.7));
  }
}
function vThigh(g) { g.limb([0, 0.02, 0], [0, -0.5, 0], 0.085, 0.068, { col: VA.pants }); }
function vShin(g) {
  g.limb([0, 0, 0], [0, -0.3, 0], 0.065, 0.06, { col: VA.pants });
  g.limb([0, -0.22, 0], [0, -0.28, 0], 0.085, 0.085, { col: VA.crim });
  g.limb([0, -0.27, 0], [0, -0.5, 0.01], 0.075, 0.07, { col: VA.boot });
  g.spike([0, -0.49, -0.02], [0, -0.47, 0.28], 0.07, { col: VA.boot });
  g.box(0.1, 0.04, 0.1, [0, -0.52, -0.04], { col: VA.boot });
}

// ---------------- Chiến Tướng Ngoài Hành Tinh: grey-green warlord with an arm cannon ----------------
const AL = { skin: 0x82a084, skin2: 0x6a8a70, arm: 0x34423f, arm2: 0x4c5e58, trim: 0xb0a878, ink: 0x0e1612, plasma: 0x60ff80, teal: 0x40e8c8 };
const alien = {
  burst: 0x60ff80,
  keep: ['n.aura', 'n.coreGlow', 'n.muzzle', 'n.orbPoint'],
  parts: {
    'n.body': (g) => {
      g.ball(0.22, 0.13, 0.16, [0, 0.02, 0], { col: AL.arm });
      g.ball(0.25, 0.05, 0.18, [0, 0.1, 0], { col: AL.arm2 });
      g.gem(0.05, 0.05, 0.03, [0, 0.1, 0.18], { col: AL.teal, glow: 0.8 });
      strap(g, [0, 0.06, 0.16], [0, -0.22, 0.2], 0.2, 0.03, { col: AL.arm2 });
      strap(g, [0, 0.06, -0.16], [0, -0.2, -0.2], 0.22, 0.03, { col: AL.arm2 });
      g.pair((s) => strap(g, [s * 0.2, 0.06, 0], [s * 0.26, -0.18, 0], 0.18, 0.03, { col: AL.arm }, [1, 0, 0]));
    },
    'n.spine': (g) => {
      g.limb([0, 0, 0], [0, 0.22, 0], 0.11, 0.15, { col: AL.skin2 });
      for (const y of [0.06, 0.14]) g.limb([0, y, 0], [0, y + 0.03, 0], 0.13, 0.15, { col: AL.arm });
      // chest armour: a rounded shell, a front plate with glowing seams around the core
      g.ball(0.3, 0.24, 0.2, [0, 0.33, 0], { col: AL.arm });
      g.ball(0.23, 0.19, 0.08, [0, 0.34, 0.13], { col: AL.arm2 });
      g.pair((s) => { strap(g, [s * 0.1, 0.2, 0.205], [s * 0.15, 0.46, 0.19], 0.025, 0.02, { col: AL.plasma, glow: 1 }); g.ball(0.03, 0.03, 0.02, [s * 0.17, 0.48, 0.18], { col: AL.trim, lo: true }); });
      g.gem(0.065, 0.085, 0.05, [0, 0.34, 0.215], { col: 0xc8ffe0, glow: 1 });
      // gorget and big layered pauldrons with a horn
      g.limb([0, 0.5, 0], [0, 0.66, 0.02], 0.17, 0.11, { col: AL.arm });
      g.pair((s) => {
        g.ball(0.17, 0.12, 0.19, [s * 0.36, 0.55, 0], { col: AL.arm2 });
        g.ball(0.13, 0.08, 0.15, [s * 0.42, 0.5, 0], { col: AL.arm });
        strap(g, [s * 0.5, 0.48, -0.15], [s * 0.5, 0.48, 0.15], 0.03, 0.03, { col: AL.plasma, glow: 0.9 });
        g.spike([s * 0.4, 0.62, 0], [s * 0.5, 0.86, -0.06], 0.06, { col: AL.trim });
      });
      // power pack on the back: vents and two exhaust stacks
      g.ball(0.2, 0.22, 0.1, [0, 0.36, -0.22], { col: AL.arm2 });
      for (let i = 0; i < 3; i++) g.box(0.16, 0.025, 0.02, [0, 0.26 + i * 0.08, -0.32], { col: AL.plasma, glow: 1 });
      g.pair((s) => { g.limb([s * 0.13, 0.46, -0.26], [s * 0.17, 0.74, -0.32], 0.045, 0.055, { col: AL.arm }); g.ball(0.04, 0.03, 0.04, [s * 0.17, 0.76, -0.32], { col: AL.plasma, glow: 1, lo: true }); });
      // phase 2: the armour cracks over a green fire, the stacks blaze, more horns
      for (const [x, y, rz] of [[-0.18, 0.3, 0.6], [0.2, 0.26, -0.5], [-0.08, 0.46, -0.3], [0.12, 0.42, 0.9]]) g.box(0.025, 0.14, 0.02, [x, y, 0.2], P2(AL.plasma), [0, 0, rz]);
      g.pair((s) => {
        g.spike([s * 0.17, 0.74, -0.32], [s * 0.2, 1.02, -0.38], 0.05, P2(AL.plasma));
        g.spike([s * 0.32, 0.6, -0.08], [s * 0.36, 0.8, -0.2], 0.045, P2(AL.teal, 0.7));
      });
    },
    'n.head': (g) => {
      // elongated grey-green cranium swept back, a narrow jaw, almond eyes
      g.ball(0.26, 0.27, 0.28, [0, 0.33, -0.04], { col: AL.skin });
      g.ball(0.2, 0.2, 0.25, [0, 0.42, -0.36], { col: AL.skin });
      g.ball(0.12, 0.12, 0.15, [0, 0.46, -0.6], { col: AL.skin2 });
      g.ball(0.16, 0.15, 0.14, [0, 0.12, 0.12], { col: AL.skin });
      g.ball(0.07, 0.07, 0.07, [0, -0.01, 0.2], { col: AL.skin2 });
      g.box(0.08, 0.012, 0.02, [0, 0.06, 0.255], { col: AL.ink });
      g.pair((s) => {
        g.ball(0.09, 0.045, 0.04, [s * 0.11, 0.22, 0.22], { col: AL.ink }, [0, s * 0.3, -s * 0.4]);
        g.ball(0.028, 0.018, 0.015, [s * 0.11, 0.225, 0.255], { col: AL.plasma, glow: 1, lo: true });
        // feelers from the back of the skull
        g.limb([s * 0.1, 0.3, -0.42], [s * 0.22, 0.12, -0.82], 0.03, 0.015, { col: AL.skin2 });
        g.ball(0.03, 0.03, 0.03, [s * 0.22, 0.12, -0.83], { col: AL.plasma, glow: 1, lo: true });
      });
      // a warlord's war-crest: band, three fins, two swept horns
      g.ball(0.27, 0.05, 0.27, [0, 0.42, -0.03], { col: AL.arm });
      g.gem(0.04, 0.05, 0.02, [0, 0.42, 0.25], { col: AL.teal, glow: 1 });
      for (let i = 0; i < 3; i++) tri(g, [0, 0.74 - i * 0.04, -0.12 - i * 0.24], [0, 0.55 - i * 0.02, 0.06 - i * 0.24], [0, 0.55 - i * 0.03, -0.18 - i * 0.24], 0.04, { col: AL.arm2 });
      g.pair((s) => g.spike([s * 0.22, 0.42, -0.04], [s * 0.38, 0.6, -0.34], 0.055, { col: AL.trim }));
      // phase 2: a third eye opens, the fins burn
      g.gem(0.035, 0.05, 0.02, [0, 0.33, 0.255], P2(0xff6a40));
      g.pair((s) => g.ball(0.04, 0.026, 0.02, [s * 0.11, 0.225, 0.258], { col: 0x9aff60, glow: 1, ph: 1, lo: true }));
      for (let i = 0; i < 3; i++) g.spike([0, 0.62 - i * 0.03, -0.06 - i * 0.24], [0, 0.82 - i * 0.05, -0.14 - i * 0.24], 0.03, P2(AL.plasma));
    },
    'n.cannon': (g) => {
      g.ball(0.17, 0.17, 0.32, [0, 0, -0.02], { col: AL.arm });
      g.box(0.12, 0.06, 0.48, [0, 0.17, 0.02], { col: AL.arm2 });
      g.limb([0, 0, 0.2], [0, 0, 0.72], 0.09, 0.075, { col: AL.arm2 });
      g.limb([0, 0, 0.66], [0, 0, 0.79], 0.1, 0.1, { col: AL.arm });
      for (const z of [0.3, 0.42, 0.54]) g.limb([0, 0, z], [0, 0, z + 0.04], 0.1, 0.1, { col: AL.plasma, glow: 0.9 });
      g.pair((s) => {
        g.box(0.035, 0.12, 0.3, [s * 0.17, 0, -0.02], { col: AL.teal, glow: 0.8 });
        g.spike([s * 0.07, 0, 0.66], [s * 0.05, 0, 0.9], 0.025, { col: AL.trim });
        g.spike([s * 0.15, 0.06, 0.2], [s * 0.34, 0.04, 0.5], 0.04, P2(AL.plasma));
      });
      g.spike([0, 0.18, 0.3], [0, 0.3, 0.6], 0.04, P2(AL.plasma));
      g.ball(0.06, 0.05, 0.06, [0, 0.2, -0.12], { col: AL.plasma, glow: 1, lo: true });
    },
    'n.arms.0.sh': (g) => aUp(g), 'n.arms.1.sh': (g) => aUp(g),
    'n.arms.0.el': (g) => aFore(g), 'n.arms.1.el': (g) => aFore(g),
    'n.low.0.sh': (g) => aLowUp(g), 'n.low.1.sh': (g) => aLowUp(g),
    'n.low.0.el': (g) => aLowFore(g), 'n.low.1.el': (g) => aLowFore(g),
    'n.legs.0.hip': (g) => aThigh(g), 'n.legs.1.hip': (g) => aThigh(g),
    'n.legs.0.knee': (g) => aShin(g), 'n.legs.1.knee': (g) => aShin(g),
    'n.legs.0.foot': (g) => aFoot(g), 'n.legs.1.foot': (g) => aFoot(g),
  },
};
function aUp(g) { g.ball(0.09, 0.09, 0.09, [0, 0, 0], { col: AL.skin }); g.limb([0, 0, 0], [0, -0.42, 0], 0.065, 0.055, { col: AL.skin }); g.limb([0, -0.1, 0], [0, -0.22, 0], 0.078, 0.075, { col: AL.arm }); }
function aFore(g) {
  g.ball(0.065, 0.065, 0.065, [0, 0, 0], { col: AL.skin2 });
  g.limb([0, 0, 0], [0, -0.46, 0], 0.055, 0.045, { col: AL.skin });
  g.limb([0, -0.2, 0], [0, -0.42, 0], 0.07, 0.075, { col: AL.arm2 });
  strap(g, [0, -0.22, 0.075], [0, -0.4, 0.08], 0.02, 0.015, { col: AL.plasma, glow: 1 });
  g.ball(0.06, 0.06, 0.07, [0, -0.5, 0], { col: AL.skin2 });
}
function aLowUp(g) { g.ball(0.06, 0.06, 0.06, [0, 0, 0], { col: AL.skin2 }); g.limb([0, 0, 0], [0, -0.5, 0], 0.045, 0.038, { col: AL.skin }); }
function aLowFore(g) {
  g.limb([0, 0, 0], [0, -0.56, 0], 0.04, 0.03, { col: AL.skin });
  g.limb([0, -0.46, 0], [0, -0.52, 0], 0.048, 0.048, { col: AL.teal, glow: 0.8 });
  g.ball(0.045, 0.05, 0.03, [0, -0.6, 0], { col: AL.skin2 });
  for (let i = -1; i <= 1; i++) { g.limb([i * 0.03, -0.63, 0], [i * 0.05, -0.92, 0.04], 0.014, 0.01, { col: AL.skin }); g.ball(0.02, 0.02, 0.02, [i * 0.05, -0.93, 0.04], { col: AL.plasma, glow: 1, lo: true }); }
}
function aThigh(g) { g.ball(0.11, 0.09, 0.12, [0, -0.04, 0], { col: AL.arm2 }); g.limb([0, 0, 0], [0, -0.45, 0], 0.085, 0.06, { col: AL.skin }); }
function aShin(g) { g.gem(0.08, 0.08, 0.06, [0, 0, 0.06], { col: AL.arm }); g.ball(0.03, 0.03, 0.02, [0, 0, 0.11], { col: AL.plasma, glow: 1, lo: true }); g.limb([0, 0, 0], [0, -0.45, 0], 0.06, 0.045, { col: AL.skin }); }
function aFoot(g) {
  g.limb([0, 0, 0], [0, -0.3, 0], 0.045, 0.04, { col: AL.arm });
  for (const x of [-0.045, 0, 0.045]) g.spike([x, -0.3, 0], [x * 1.4, -0.3, 0.22], 0.028, { col: AL.skin2 });
  g.spike([0, -0.28, -0.02], [0, -0.3, -0.14], 0.025, { col: AL.trim });
}

// ---------------- Pharaoh: a floating mummy king with a staff ----------------
const PH = { wrap: 0xcdb894, wrap2: 0xa08c68, gold: 0xe0b040, gold2: 0xb88a2c, lapis: 0x2c5a8a, dark: 0x3a2a1c, glow: 0xffe080, curse: 0x60f0c0 };
function phStrip(g, i) {
  const a = (i / 9) * Math.PI * 2; const len = 0.7 + ((i * 7) % 4) * 0.12;
  g.put('box', [0.12, len, 0.025], [0, -len / 2, 0], [0, a, 0], { col: PH.wrap2 });
  const d = [Math.sin(a), 0, Math.cos(a)];
  tri(g, [0, -len - 0.14, 0], [-Math.cos(a) * 0.06, -len + 0.02, Math.sin(a) * 0.06], [Math.cos(a) * 0.06, -len + 0.02, -Math.sin(a) * 0.06], 0.025, { col: PH.wrap2 });
  g.put('box', [0.13, 0.04, 0.03], [d[0] * 0.005, -len * 0.3, d[2] * 0.005], [0, a, 0], { col: PH.gold });
  g.put('box', [0.03, len * 0.6, 0.03], [d[0] * 0.01, -len * 0.55, d[2] * 0.01], [0, a, 0], P2(PH.curse));
}
const pharaoh = {
  burst: 0xffc23a,
  keep: ['n.aura', 'n.eyeGlow', 'n.gem', 'n.shards.0', 'n.shards.1', 'n.shards.2', 'n.shards.3', 'n.shards.4', 'n.shards.5'],
  parts: {
    'n.hover': (g) => {
      // the bandaged lower body tapering into tatters (he floats; there are no legs)
      g.limb([0, 1.08, 0], [0, 0.28, 0], 0.31, 0.24, { col: PH.wrap });
      for (const [y, tz] of [[0.95, 0.04], [0.75, -0.05], [0.55, 0.05], [0.4, -0.04]]) g.limb([0, y - 0.025, tz], [0, y + 0.025, -tz], 0.33 - (1.08 - y) * 0.08, 0.33 - (1.08 - y) * 0.08, { col: PH.wrap2 });
      for (let i = 0; i < 8; i++) { const a = (i + 0.3) / 8 * 6.283; g.spike([Math.sin(a) * 0.22, 0.34, Math.cos(a) * 0.22], [Math.sin(a) * 0.26, 0.0 - (i % 3) * 0.06, Math.cos(a) * 0.26], 0.07, { col: i % 2 ? PH.wrap : PH.wrap2 }); }
      // a gold kilt (shendyt) with a lapis-striped apron
      g.limb([0, 1.1, 0], [0, 0.78, 0], 0.34, 0.4, { col: 0xe8dcc0 });
      g.limb([0, 1.0, 0], [0, 1.12, 0], 0.345, 0.345, { col: PH.gold });
      strap(g, [0, 1.0, 0.36], [0, 0.6, 0.42], 0.22, 0.03, { col: PH.gold });
      for (const t of [0.25, 0.5, 0.75]) strap(g, [0, 1.0 - t * 0.4, 0.38 + t * 0.06], [0, 0.97 - t * 0.4, 0.38 + t * 0.06], 0.23, 0.035, { col: PH.lapis });
      tri(g, [0, 0.48, 0.43], [-0.11, 0.6, 0.42], [0.11, 0.6, 0.42], 0.03, { col: PH.gold });
      g.gem(0.05, 0.06, 0.03, [0, 1.06, 0.35], { col: PH.lapis });
      // phase 2: green curse fire licks out under the wraps
      for (let i = 0; i < 7; i++) { const a = (i + 0.8) / 7 * 6.283; g.spike([Math.sin(a) * 0.22, 0.42, Math.cos(a) * 0.22], [Math.sin(a) * 0.32, 0.05, Math.cos(a) * 0.32], 0.06, P2(PH.curse)); }
      for (const [x, y, rz] of [[-0.2, 0.68, 0.5], [0.22, 0.5, -0.4], [0.12, 0.88, 0.8]]) g.box(0.03, 0.14, 0.02, [x, y, Math.sqrt(Math.max(0, 0.112 - x * x)) + 0.02], P2(PH.curse), [0, Math.atan2(x, 0.3), rz]);
    },
    'n.torso': (g) => {
      g.ball(0.27, 0.3, 0.19, [0, 0.27, 0], { col: PH.wrap });
      for (const [y, rz] of [[0.12, 0.25], [0.22, -0.2], [0.33, 0.18]]) g.box(0.46, 0.035, 0.03, [0, y, 0.165], { col: PH.wrap2 }, [0, 0, rz]);
      // the broad collar (wesekh): gold, lapis, gold
      g.ball(0.37, 0.1, 0.26, [0, 0.52, 0.0], { col: PH.gold });
      g.ball(0.34, 0.08, 0.24, [0, 0.48, 0.03], { col: PH.lapis });
      g.ball(0.3, 0.07, 0.21, [0, 0.44, 0.06], { col: PH.gold });
      for (let i = -3; i <= 3; i++) g.gem(0.025, 0.035, 0.02, [i * 0.07, 0.39 + Math.abs(i) * 0.012, 0.22 - Math.abs(i) * 0.025], { col: PH.lapis });
      // a scarab on the chest with gold wings, belt
      g.gem(0.06, 0.08, 0.03, [0, 0.27, 0.19], { col: PH.lapis });
      g.pair((s) => strap(g, [s * 0.04, 0.3, 0.19], [s * 0.17, 0.33, 0.165], 0.06, 0.02, { col: PH.gold }));
      g.ball(0.29, 0.05, 0.2, [0, 0.03, 0], { col: PH.gold });
      // phase 2: the scarab burns green, cracks open in the wraps
      g.gem(0.08, 0.1, 0.04, [0, 0.27, 0.2], P2(PH.curse));
      for (const [x, y, rz] of [[-0.14, 0.18, 0.6], [0.15, 0.12, -0.5], [0.1, 0.36, 0.3]]) g.box(0.025, 0.1, 0.02, [x, y, 0.17], P2(PH.curse), [0, 0, rz]);
    },
    'n.head': (g) => {
      // bandaged face in shadow, burning eyes, a false beard
      g.ball(0.15, 0.17, 0.15, [0, 0.14, 0.02], { col: PH.wrap });
      g.ball(0.11, 0.09, 0.06, [0, 0.15, 0.115], { col: PH.dark });
      g.pair((s) => g.ball(0.032, 0.02, 0.02, [s * 0.05, 0.165, 0.16], { col: PH.glow, glow: 1, lo: true }));
      g.box(0.26, 0.03, 0.04, [0, 0.235, 0.12], { col: PH.wrap2 }, [0, 0, 0.15]);
      g.box(0.24, 0.03, 0.04, [0, 0.07, 0.13], { col: PH.wrap2 }, [0, 0, -0.2]);
      g.limb([0, 0.03, 0.12], [0, -0.17, 0.16], 0.04, 0.03, { col: PH.gold });
      for (const y of [-0.03, -0.1]) g.limb([0, y, 0.135], [0, y - 0.02, 0.14], 0.042, 0.04, { col: PH.lapis });
      // nemes headdress: striped dome, lappets, a tail behind, the cobra on the brow
      g.ball(0.2, 0.16, 0.2, [0, 0.31, -0.02], { col: PH.gold });
      for (const [y, r] of [[0.25, 0.196], [0.31, 0.212], [0.37, 0.196]]) g.ball(r, 0.022, r, [0, y, -0.02], { col: PH.lapis });
      g.limb([0, 0.21, -0.01], [0, 0.25, -0.01], 0.17, 0.17, { col: PH.gold });
      g.pair((s) => {
        const th = s * 0.15; const c = [s * 0.2, 0.04, 0.02];
        g.box(0.1, 0.42, 0.15, c, { col: PH.gold }, [0, 0, th]);
        for (const t of [-0.14, -0.03, 0.08]) g.box(0.105, 0.04, 0.155, [c[0] - Math.sin(th) * t, c[1] + Math.cos(th) * t, c[2]], { col: PH.lapis }, [0, 0, th]);
      });
      g.limb([0, 0.22, -0.12], [0, -0.12, -0.24], 0.11, 0.06, { col: PH.gold });
      g.limb([0, 0.26, 0.18], [0, 0.36, 0.21], 0.022, 0.028, { col: PH.gold });
      g.ball(0.035, 0.04, 0.025, [0, 0.38, 0.21], { col: PH.gold, ph: 2 });
      // phase 2: the cobra rears with a burning hood, a tall white crown rises, ram horns curl
      tri(g, [0, 0.5, 0.21], [-0.08, 0.34, 0.21], [0.08, 0.34, 0.21], 0.03, P2(PH.curse));
      g.ball(0.035, 0.04, 0.025, [0, 0.42, 0.22], { col: PH.gold, ph: 1 });
      g.spike([0, 0.4, -0.04], [0, 0.82, -0.08], 0.12, { col: 0xeae2cc, ph: 1 });
      g.ball(0.06, 0.07, 0.06, [0, 0.8, -0.08], { col: 0xeae2cc, ph: 1, lo: true });
      g.limb([0, 0.44, -0.04], [0, 0.48, -0.04], 0.12, 0.11, { col: PH.gold, ph: 1 });
      g.gem(0.04, 0.05, 0.025, [0, 0.5, 0.06], P2(PH.curse));
      g.pair((s) => { g.limb([s * 0.17, 0.32, -0.02], [s * 0.3, 0.38, -0.08], 0.04, 0.035, { col: PH.gold2, ph: 1 }); g.spike([s * 0.3, 0.38, -0.08], [s * 0.34, 0.24, 0.02], 0.035, P2(PH.curse, 0.7)); });
    },
    'n.staff': (g) => {
      g.limb([0, -0.5, 0], [0, 1.55, 0], 0.035, 0.035, { col: PH.gold2 });
      g.spike([0, -0.5, 0], [0, -0.7, 0], 0.035, { col: PH.gold });
      for (const y of [-0.3, 0.3, 0.9, 1.3]) g.limb([0, y - 0.03, 0], [0, y + 0.03, 0], 0.05, 0.05, { col: PH.lapis });
      g.ball(0.08, 0.05, 0.08, [0, 1.56, 0], { col: PH.gold });
      for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283; g.limb([Math.cos(a) * 0.05, 1.58, Math.sin(a) * 0.05], [Math.cos(a) * 0.14, 1.86, Math.sin(a) * 0.14], 0.022, 0.012, { col: PH.gold }); }
      for (let i = 0; i < 3; i++) { const a = (i + 0.5) / 3 * 6.283; g.spike([Math.cos(a) * 0.08, 1.6, Math.sin(a) * 0.08], [Math.cos(a) * 0.24, 1.98, Math.sin(a) * 0.24], 0.022, P2(PH.curse)); }
      for (const y of [0.0, 0.6, 1.1]) g.box(0.08, 0.025, 0.08, [0, y, 0], P2(PH.curse));
    },
    'n.arms.0.sh': (g) => phArm(g), 'n.arms.1.sh': (g) => phArm(g),
    'n.arms.0.el': (g) => phFore(g), 'n.arms.1.el': (g) => phFore(g),
    'n.arms.0.hand': (g) => phHand(g), 'n.arms.1.hand': (g) => phHand(g),
    'n.strips.0': (g) => phStrip(g, 0), 'n.strips.3': (g) => phStrip(g, 3), 'n.strips.6': (g) => phStrip(g, 6),
  },
};
function phArm(g) {
  g.ball(0.11, 0.1, 0.11, [0, 0.02, 0], { col: PH.gold });
  g.limb([0, 0, 0], [0, -0.4, 0], 0.075, 0.065, { col: PH.wrap });
  g.limb([0, -0.08, 0], [0, -0.13, 0], 0.085, 0.085, { col: PH.gold });
  g.limb([0, -0.25, 0.01], [0, -0.28, -0.01], 0.078, 0.078, { col: PH.wrap2 });
}
function phFore(g) {
  g.limb([0, 0, 0], [0, -0.4, 0], 0.065, 0.055, { col: PH.wrap });
  g.limb([0, -0.22, 0], [0, -0.38, 0], 0.072, 0.07, { col: PH.gold });
  g.limb([0, -0.29, 0], [0, -0.31, 0], 0.075, 0.075, { col: PH.lapis });
  strap(g, [0.05, -0.12, -0.04], [0.09, -0.4, -0.06], 0.035, 0.012, { col: PH.wrap2 }, [1, 0, 0]);
}
function phHand(g) {
  g.ball(0.06, 0.07, 0.045, [0, -0.05, 0], { col: PH.wrap });
  for (const f of [-1, 0, 1]) g.spike([f * 0.03, -0.1, 0.02], [f * 0.04, -0.2, 0.04], 0.018, { col: PH.wrap2 });
}

// ---------------- UFO: a saucer with a pilot under the dome ----------------
const UF = { hull: 0x9ca2b8, hull2: 0xbcc0d0, dark: 0x464a5c, dark2: 0x2e3240, skin: 0x8aa88a, ink: 0x101418, cyan: 0x50d8f0, mag: 0xf060c0, yel: 0xf0d050, red: 0xff4040 };
const saucer = (g, rx, ry, at, col) => { g.box(rx * 1.7, ry * 2, rx * 1.7, at, { col }); g.box(rx * 1.7, ry * 2, rx * 1.7, at, { col }, [0, Math.PI / 4, 0]); };
const ufo = {
  burst: 0x40e0ff,
  keep: ['n.aura', 'n.bGlow', 'n.rings.0', 'n.rings.1'],
  parts: {
    'n.tilt': (g) => {
      // an eight-sided two-tone saucer: dark underside, light upper hull, a raised deck, a gold collar round the cockpit
      saucer(g, 1.5, 0.19, [0, -0.13, 0], UF.dark);
      saucer(g, 1.56, 0.07, [0, -0.03, 0], UF.dark2);
      saucer(g, 1.46, 0.22, [0, 0.03, 0], UF.hull);
      saucer(g, 0.88, 0.14, [0, 0.2, 0], UF.hull2);
      g.ball(0.64, 0.06, 0.64, [0, 0.3, 0], { col: 0xc8a050 });
      // the cockpit: four glass posts and a lit cap over the pilot, open between so the pilot shows
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; g.box(0.08, 0.5, 0.08, [Math.sin(a) * 0.46, 0.58, Math.cos(a) * 0.46], { col: UF.cyan, glow: 0.5 }); }
      g.box(0.78, 0.07, 0.78, [0, 0.85, 0], { col: UF.cyan, glow: 0.45 }); g.box(0.42, 0.08, 0.42, [0, 0.92, 0], { col: UF.cyan, glow: 0.7 });
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + 0.2; const c = Math.sin(a); const s = Math.cos(a);
        g.put('box', [0.07, 0.07, 0.5], [c * 1.08, 0.19, s * 1.08], [0, a, 0], { col: UF.dark });
        // portholes between the ribs: cyan in phase 1, red warning lights in phase 2
        const b = a + Math.PI / 8;
        g.ball(0.07, 0.04, 0.07, [Math.sin(b) * 1.22, 0.15, Math.cos(b) * 1.22], { col: UF.cyan, glow: 1, ph: 2, lo: true });
        g.ball(0.08, 0.05, 0.08, [Math.sin(b) * 1.22, 0.15, Math.cos(b) * 1.22], { col: UF.red, glow: 1, ph: 1, lo: true });
      }
      // four turrets on the deck edge
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + Math.PI / 4; const c = Math.sin(a); const s = Math.cos(a);
        g.ball(0.15, 0.11, 0.15, [c * 0.86, 0.3, s * 0.86], { col: UF.dark });
        g.limb([c * 0.9, 0.34, s * 0.9], [c * 1.18, 0.38, s * 1.18], 0.035, 0.03, { col: UF.dark2 });
        g.ball(0.03, 0.03, 0.03, [c * 1.19, 0.38, s * 1.19], { col: UF.mag, glow: 1, lo: true });
      }
      // tail fin and side fins
      tri(g, [0, 0.62, -1.3], [0, 0.18, -0.9], [0, 0.18, -1.45], 0.05, { col: UF.hull2 });
      g.pair((s) => tri(g, [s * 1.8, 0.12, -0.5], [s * 1.2, 0.12, -0.2], [s * 1.25, 0.12, -0.85], 0.04, { col: UF.hull2 }));
      g.box(0.03, 0.03, 0.4, [0, 0.4, -1.18], { col: UF.cyan, glow: 1 }, [0.75, 0, 0]);
      // antennas behind the dome: two in phase 1, one snapped and sparking in phase 2
      g.limb([0.12, 0.3, -0.62], [0.14, 0.95, -0.68], 0.022, 0.014, { col: UF.dark });
      g.ball(0.04, 0.04, 0.04, [0.14, 0.97, -0.68], { col: UF.mag, glow: 1, lo: true });
      g.limb([-0.14, 0.3, -0.6], [-0.18, 0.8, -0.64], 0.022, 0.014, { col: UF.dark, ph: 2 });
      g.ball(0.04, 0.04, 0.04, [-0.18, 0.82, -0.64], { col: UF.yel, glow: 1, ph: 2, lo: true });
      g.limb([-0.14, 0.3, -0.6], [-0.3, 0.5, -0.72], 0.022, 0.016, { col: UF.dark, ph: 1 });
      // phase 2: the hull splits along glowing seams, plates buckle up
      for (const [x, z, ry] of [[0.6, 0.7, 0.4], [-0.8, 0.3, -0.9], [0.2, -0.95, 1.4], [-0.5, -0.7, 0.2], [0.95, -0.2, 2.0]]) g.box(0.36, 0.04, 0.04, [x, 0.21, z], P2(UF.mag), [0, ry, 0]);
      for (const [x, z, ry] of [[0.75, 0.6, 0.4], [-0.6, -0.85, 0.2]]) g.box(0.26, 0.04, 0.2, [x, 0.27, z], { col: UF.hull, ph: 1 }, [0.35, ry, 0.2]);
      g.pair((s) => g.spike([s * 1.3, 0.05, 0.4], [s * 1.75, 0.05, 0.65], 0.06, P2(UF.mag, 0.6)));
      g.spike([-0.3, 0.5, -0.72], [-0.36, 0.6, -0.76], 0.03, P2(UF.yel));
    },
    'n.rim': (g) => {
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2; const c = Math.sin(a); const s = Math.cos(a);
        g.gem(0.08, 0.06, 0.08, [c * 1.62, 0, s * 1.62], { col: [UF.cyan, UF.mag, UF.yel][i % 3], glow: 1 }, [0, a, 0]);
      }
    },
    'n.pilot': (g) => {
      g.ball(0.1, 0.12, 0.08, [0, 0.11, -0.02], { col: UF.skin });
      g.ball(0.11, 0.04, 0.09, [0, 0.2, -0.02], { col: UF.dark });
      g.box(0.34, 0.09, 0.14, [0, 0.04, 0.2], { col: UF.dark2 });
      for (const [x, c] of [[-0.1, UF.cyan], [0, UF.yel], [0.1, UF.mag]]) g.ball(0.025, 0.015, 0.025, [x, 0.095, 0.2], { col: c, glow: 1, lo: true });
      g.pair((s) => g.limb([s * 0.11, 0.17, 0], [s * 0.12, 0.1, 0.18], 0.025, 0.02, { col: UF.skin }));
    },
    'n.head': (g) => {
      g.ball(0.15, 0.17, 0.15, [0, 0.04, 0], { col: UF.skin });
      g.ball(0.12, 0.12, 0.13, [0, 0.08, -0.12], { col: UF.skin });
      g.ball(0.06, 0.05, 0.06, [0, -0.1, 0.06], { col: UF.skin });
      g.pair((s) => {
        g.ball(0.055, 0.03, 0.025, [s * 0.065, 0.04, 0.135], { col: UF.ink }, [0, s * 0.3, -s * 0.45]);
        g.ball(0.016, 0.012, 0.01, [s * 0.065, 0.045, 0.158], { col: UF.mag, glow: 1, ph: 2, lo: true });
        g.ball(0.026, 0.016, 0.012, [s * 0.065, 0.045, 0.158], { col: UF.red, glow: 1, ph: 1, lo: true });
        g.box(0.06, 0.012, 0.02, [s * 0.06, 0.09, 0.14], { col: UF.ink, ph: 1 }, [0, 0, s * 0.45]);
        g.limb([s * 0.05, 0.18, -0.02], [s * 0.12, 0.32, -0.04], 0.012, 0.01, { col: UF.skin });
        g.ball(0.025, 0.025, 0.025, [s * 0.12, 0.33, -0.04], { col: UF.cyan, glow: 1, lo: true });
      });
    },
    'n.belly': (g) => {
      g.ball(0.42, 0.12, 0.42, [0, 0.03, 0], { col: UF.dark2 });
      g.ball(0.25, 0.1, 0.25, [0, -0.05, 0], { col: UF.cyan, glow: 0.8 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.gem(0.05, 0.04, 0.05, [Math.sin(a) * 0.36, -0.03, Math.cos(a) * 0.36], { col: UF.cyan, glow: 1 }); }
      for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6 * Math.PI * 2; g.spike([Math.sin(a) * 0.32, -0.02, Math.cos(a) * 0.32], [Math.sin(a) * 0.46, -0.3, Math.cos(a) * 0.46], 0.04, P2(UF.mag, 0.8)); }
    },
    'n.struts.0': (g) => ufStrut(g), 'n.struts.1': (g) => ufStrut(g), 'n.struts.2': (g) => ufStrut(g),
  },
};
function ufStrut(g) {
  g.limb([0, 0, 0], [0, -0.7, 0], 0.045, 0.035, { col: UF.dark });
  g.limb([0, -0.05, 0.05], [0, -0.45, 0.04], 0.025, 0.025, { col: UF.hull2 });
  g.ball(0.14, 0.045, 0.14, [0, -0.72, 0], { col: UF.hull2 });
  g.ball(0.03, 0.03, 0.03, [0, -0.66, 0.1], { col: UF.yel, glow: 1, lo: true });
}

// ---------------- Guardian: an ancient stone golem with a rune wheel ----------------
const GU = { stone: 0x8e8c80, stone2: 0x74736a, stone3: 0xa8a494, dark: 0x4c4c48, moss: 0x5a7a34, moss2: 0x46642a, rune: 0x40e0f0, pale: 0xc0ffff };
const guardian = {
  burst: 0x40f0ff,
  keep: ['n.aura', 'n.eye', 'n.stones.0.gl', 'n.stones.1.gl', 'n.stones.2.gl', 'n.stones.3.gl', 'n.stones.4.gl'],
  parts: {
    'n.torso': (g) => {
      g.ball(0.52, 0.24, 0.38, [0, 0.14, 0], { col: GU.stone2 });
      for (let i = -2; i <= 2; i++) g.gem(0.12, 0.1, 0.08, [i * 0.2, 0.2, 0.36 - Math.abs(i) * 0.04], { col: GU.dark });
      // the chest: a great boulder with a plated front and a rune sigil
      g.ball(0.72, 0.5, 0.48, [0, 0.74, -0.02], { col: GU.stone });
      g.ball(0.3, 0.32, 0.13, [-0.27, 0.8, 0.36], { col: GU.stone3, ph: 2 });
      g.ball(0.3, 0.32, 0.13, [0.27, 0.8, 0.36], { col: GU.stone3 });
      g.ball(0.32, 0.18, 0.12, [0, 0.42, 0.36], { col: GU.stone2 });
      g.box(0.06, 0.46, 0.03, [0, 0.78, 0.49], { col: GU.rune, glow: 1 });
      g.box(0.3, 0.05, 0.03, [0, 0.9, 0.49], { col: GU.rune, glow: 1 });
      g.pair((s) => g.box(0.05, 0.22, 0.03, [s * 0.15, 0.72, 0.49], { col: GU.rune, glow: 1 }, [0, 0, s * 0.4]));
      // standing stones of a broken collar, moss on the shoulders, the arm that holds the wheel
      for (const [x, h, r] of [[-0.36, 0.26, 0.2], [0, 0.32, 0], [0.34, 0.22, -0.2]]) g.gem(0.14, h, 0.1, [x, 1.2, -0.32], { col: GU.stone2 }, [0.2, 0, r]);
      g.ball(0.34, 0.09, 0.26, [-0.3, 1.16, 0.02], { col: GU.moss });
      g.ball(0.22, 0.07, 0.2, [0.32, 1.16, -0.14], { col: GU.moss2 });
      g.limb([0, 1.0, -0.4], [0, 1.0, -0.9], 0.1, 0.07, { col: GU.dark });
      // phase 2: the left plate is gone and the core shows, cracks glow, crystals erupt from the back
      g.ball(0.24, 0.26, 0.1, [-0.27, 0.8, 0.34], { col: GU.dark, ph: 1 });
      g.gem(0.13, 0.16, 0.1, [-0.27, 0.8, 0.42], P2(GU.rune, 0.7));
      for (const [x, y, rz] of [[0.36, 0.6, 0.5], [0.15, 1.0, -0.6], [-0.5, 0.5, -0.3], [0.5, 0.95, 0.9], [-0.12, 0.38, 0.2]]) g.box(0.045, 0.22, 0.03, [x, y, Math.sqrt(Math.max(0, 1 - (x / 0.72) ** 2 - ((y - 0.74) / 0.5) ** 2)) * 0.48 + 0.01], P2(GU.rune), [0, Math.atan2(x, 0.5), rz]);
      for (const [x, z, h] of [[-0.3, -0.2, 0.5], [0.05, -0.3, 0.65], [0.36, -0.15, 0.45], [-0.55, 0.05, 0.3]]) g.gem(0.09, h * 0.5, 0.09, [x, 1.2 + h * 0.3, z], P2(GU.rune, 0.8), [0.2, 0, -x * 0.6]);
    },
    'n.head': (g) => {
      // a squat stone head round the cyclops eye (the eye itself is the rig's, kept for the eye beam)
      g.ball(0.27, 0.23, 0.25, [0, 0.02, -0.02], { col: GU.stone });
      g.put('box', [0.52, 0.1, 0.16], [0, 0.16, 0.2], [0.25, 0, 0], { col: GU.dark });
      g.box(0.34, 0.12, 0.14, [0, -0.17, 0.18], { col: GU.stone2 });
      g.pair((s) => { g.gem(0.1, 0.12, 0.1, [s * 0.22, -0.06, 0.16], { col: GU.stone2 }); g.ball(0.02, 0.06, 0.02, [s * 0.21, 0.0, 0.27], { col: GU.rune, glow: 1, lo: true }); });
      // a crown of three standing stones; moss in phase 1, burning crystal points in phase 2
      for (const [x, h] of [[-0.18, 0.14], [0, 0.2], [0.18, 0.14]]) g.gem(0.07, h, 0.07, [x, 0.26 + h * 0.4, -0.04], { col: GU.stone2 });
      g.ball(0.2, 0.06, 0.18, [0.04, 0.24, -0.08], { col: GU.moss, ph: 2 });
      for (const [x, h] of [[-0.2, 0.3], [0, 0.42], [0.2, 0.3]]) g.spike([x, 0.3, -0.04], [x * 1.4, 0.3 + h, -0.1], 0.05, P2(GU.rune));
    },
    'n.wheel': (g) => {
      // a ring of twelve dark blocks, five runestones on it, spokes to a crystal hub
      for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * Math.PI * 2; g.box(0.46, 0.12, 0.14, [Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0], { col: GU.dark }, [0, 0, a + Math.PI / 2]); }
      for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * Math.PI * 2; g.box(0.4, 0.035, 0.03, [Math.cos(a) * 0.84, Math.sin(a) * 0.84, 0.06], { col: GU.rune, glow: 0.7 }, [0, 0, a + Math.PI / 2]); }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2; const x = Math.cos(a) * 0.95; const y = Math.sin(a) * 0.95;
        g.gem(0.18, 0.24, 0.15, [x, y, 0], { col: GU.stone }, [0, 0, a - Math.PI / 2]);
        for (const z of [0.15, -0.15]) g.box(0.05, 0.16, 0.03, [x, y, z], { col: GU.rune, glow: 1 }, [0, 0, a]);
        g.limb([Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0], [Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0], 0.035, 0.03, { col: GU.dark });
        g.spike([Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0], [Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0], 0.08, P2(GU.rune));
      }
      g.gem(0.16, 0.16, 0.16, [0, 0, 0], { col: GU.rune, glow: 1 });
      g.gem(0.24, 0.24, 0.24, [0, 0, 0], P2(GU.rune, 0.6));
    },
    'n.arms.0.arm': (g) => gShoulder(g, -1), 'n.arms.1.arm': (g) => gShoulder(g, 1),
    'n.arms.0.elbow': (g) => gFore(g), 'n.arms.1.elbow': (g) => gFore(g),
    'n.arms.0.fist': (g) => gFist(g), 'n.arms.1.fist': (g) => gFist(g),
    'n.legs.0.hip': (g) => gThigh(g, -1), 'n.legs.1.hip': (g) => gThigh(g, 1),
    'n.legs.0.knee': (g) => gShin(g), 'n.legs.1.knee': (g) => gShin(g),
    'n.legs.0.foot': (g) => gFoot(g), 'n.legs.1.foot': (g) => gFoot(g),
  },
};
function gShoulder(g, s) {
  g.ball(0.42, 0.32, 0.42, [s * 0.05, 0.12, 0], { col: GU.stone });
  g.gem(0.3, 0.2, 0.3, [s * 0.1, 0.38, 0], { col: GU.stone2 });
  g.box(0.05, 0.3, 0.03, [s * 0.16, 0.1, 0.42], { col: GU.rune, glow: 1 });
  g.ball(0.24, 0.07, 0.22, [s * 0.0, 0.42, -0.08], { col: GU.moss, ph: 2 });
  g.limb([0, -0.1, 0], [0, -0.62, 0], 0.24, 0.22, { col: GU.stone2 });
  g.spike([s * 0.2, 0.3, 0.05], [s * 0.52, 0.78, -0.05], 0.1, P2(GU.rune));
  g.spike([s * 0.05, 0.36, -0.15], [s * 0.2, 0.86, -0.35], 0.08, P2(GU.rune));
  g.box(0.04, 0.24, 0.03, [s * 0.2, -0.35, 0.22], P2(GU.rune), [0, 0, 0.4]);
}
function gFore(g) {
  g.ball(0.27, 0.2, 0.27, [0, 0, 0], { col: GU.dark });
  g.limb([0, 0, 0], [0, -0.62, 0], 0.26, 0.3, { col: GU.stone });
  g.limb([0, -0.4, 0], [0, -0.46, 0], 0.31, 0.315, { col: GU.rune, glow: 0.8 });
  for (const x of [-0.12, 0.12]) g.box(0.04, 0.2, 0.03, [x, -0.25, 0.27], P2(GU.rune), [0, 0, x * 3]);
}
function gFist(g) {
  g.ball(0.4, 0.33, 0.38, [0, -0.04, 0.04], { col: GU.stone });
  for (let i = 0; i < 4; i++) g.ball(0.1, 0.09, 0.09, [(i - 1.5) * 0.18, -0.1, 0.36], { col: GU.stone3, lo: true });
  for (let i = 0; i < 3; i++) g.box(0.1, 0.05, 0.03, [(i - 1) * 0.2, 0.08, 0.4], { col: GU.rune, glow: 1 });
  g.ball(0.41, 0.07, 0.39, [0, 0.24, 0.04], { col: GU.dark });
  for (const [x, rz] of [[-0.2, 0.6], [0.15, -0.4]]) g.box(0.04, 0.26, 0.03, [x, -0.1, 0.41], P2(GU.rune), [0, 0, rz]);
}
function gThigh(g, s) { g.ball(0.3, 0.27, 0.32, [0, -0.2, 0], { col: GU.stone2 }); g.box(0.03, 0.26, 0.05, [s * 0.3, -0.2, 0.1], { col: GU.rune, glow: 1 }); }
function gShin(g) {
  g.ball(0.27, 0.25, 0.28, [0, -0.2, 0.02], { col: GU.stone });
  g.gem(0.16, 0.13, 0.1, [0, 0.0, 0.26], { col: GU.stone3 });
  g.box(0.04, 0.2, 0.03, [0, -0.22, 0.3], { col: GU.rune, glow: 1 });
}
function gFoot(g) {
  g.ball(0.33, 0.13, 0.44, [0, -0.06, 0.1], { col: GU.dark });
  for (const x of [-0.18, 0, 0.18]) g.gem(0.1, 0.08, 0.1, [x, -0.06, 0.5], { col: GU.stone2 });
}

// ---------------- Void dragon ----------------
const DR = { scale: 0x2e2448, scale2: 0x40325e, belly: 0x6a5a8a, bone: 0xd8d0e8, horn: 0x1e1830, memb: 0x4a2c6c, memb2: 0x341e50, vio: 0xb050ff, pale: 0xe0c0ff };
// a neck or tail piece along -z or +z with a lighter belly underneath and back spines
function link(g, z0, z1, r0, r1, spines, dir = 1) {
  g.limb([0, 0, z0], [0, 0, z1], r0, r1, { col: DR.scale });
  g.limb([0, -r0 * 0.45, z0], [0, -r1 * 0.45, z1], r0 * 0.7, r1 * 0.7, { col: DR.belly });
  for (let i = 0; i < spines; i++) {
    const t = (i + 0.5) / spines; const z = z0 + (z1 - z0) * t; const r = r0 + (r1 - r0) * t;
    g.spike([0, r * 0.85, z], [0, r + 0.2, z - dir * 0.16], 0.05, { col: DR.horn, ph: 2 });
    g.spike([0, r * 0.85, z], [0, r + 0.3, z - dir * 0.2], 0.06, P2(DR.vio));
  }
}
const dragon = {
  burst: 0xb040ff,
  keep: ['n.aura', 'n.mouth'],
  parts: {
    'n.body': (g) => {
      g.ball(0.52, 0.42, 0.72, [0, 0.0, 0.18], { col: DR.scale });
      g.ball(0.44, 0.36, 0.62, [0, -0.02, -0.82], { col: DR.scale });
      g.ball(0.38, 0.2, 0.62, [0, -0.26, 0.12], { col: DR.belly });
      g.ball(0.3, 0.16, 0.5, [0, -0.24, -0.8], { col: DR.belly });
      for (let i = 0; i < 5; i++) g.ball(0.33 - Math.abs(i - 2) * 0.03, 0.05, 0.09, [0, -0.43 + Math.abs(i - 2) * 0.02, 0.5 - i * 0.22], { col: DR.bone });
      // shoulder and hip armour, glowing void seams on the flanks
      g.pair((s) => {
        g.gem(0.2, 0.15, 0.32, [s * 0.46, 0.2, 0.42], { col: DR.scale2 });
        g.gem(0.18, 0.14, 0.28, [s * 0.38, 0.14, -0.86], { col: DR.scale2 });
        for (let i = 0; i < 3; i++) strap(g, [s * 0.5, 0.12 - i * 0.12, 0.34 - i * 0.2], [s * 0.48, 0.02 - i * 0.12, 0.08 - i * 0.2], 0.03, 0.02, { col: DR.vio, glow: 0.8 }, [s, 0, 0]);
      });
      // spines down the back
      for (let i = 0; i < 7; i++) {
        const z = 0.62 - i * 0.28; const top = (z > -0.3 ? 0.4 : 0.32);
        g.spike([0, top, z], [0, top + 0.3 - Math.abs(i - 2) * 0.02, z - 0.2], 0.08, { col: DR.horn, ph: 2 });
        g.spike([0, top, z], [0, top + 0.44, z - 0.24], 0.09, P2(DR.vio));
      }
      // the first neck and tail links (the rig never bends them)
      g.ball(0.26, 0.26, 0.26, [0, 0.2, 0.7], { col: DR.scale });
      g.limb([0, 0.2, 0.68], [0, 0.2, 1.22], 0.24, 0.215, { col: DR.scale });
      g.limb([0, 0.08, 0.68], [0, 0.1, 1.22], 0.17, 0.15, { col: DR.belly });
      g.limb([0, 0, -1.2], [0, 0, -1.85], 0.25, 0.22, { col: DR.scale });
      g.spike([0, 0.4, 0.95], [0, 0.62, 0.78], 0.06, { col: DR.horn });
      g.spike([0, 0.2, -1.55], [0, 0.44, -1.75], 0.07, { col: DR.horn });
      // phase 2: void crystals break out of the back and flanks
      for (const [x, y, z, h] of [[0.22, 0.32, 0.1, 0.34], [-0.25, 0.3, -0.25, 0.4], [0.2, 0.26, -0.75, 0.3], [-0.18, 0.34, 0.45, 0.28]]) g.gem(0.08, h * 0.5, 0.08, [x, y + h * 0.3, z], P2(DR.vio), [0.2, 0, -x * 2]);
      g.pair((s) => strap(g, [s * 0.5, 0.2, -0.3], [s * 0.42, -0.1, -0.7], 0.04, 0.02, P2(DR.pale), [s, 0, 0]));
    },
    'n.neck.1': (g) => { g.ball(0.215, 0.215, 0.215, [0, 0, 0], { col: DR.scale }); link(g, -0.02, 0.5, 0.215, 0.2, 1, -1); },
    'n.neck.2': (g) => { g.ball(0.2, 0.2, 0.2, [0, 0, 0], { col: DR.scale }); link(g, -0.02, 0.5, 0.2, 0.185, 1, -1); },
    'n.neck.3': (g) => { g.ball(0.185, 0.185, 0.185, [0, 0, 0], { col: DR.scale }); link(g, -0.02, 0.52, 0.185, 0.17, 1, -1); },
    'n.head': (g) => {
      g.ball(0.3, 0.24, 0.32, [0, 0.02, 0.14], { col: DR.scale });
      g.limb([0, -0.04, 0.3], [0, -0.07, 1.0], 0.2, 0.12, { col: DR.scale });
      g.ball(0.13, 0.09, 0.12, [0, -0.06, 0.98], { col: DR.scale2 });
      g.pair((s) => {
        // brow ridge over a slit eye, nostril, cheek frill, teeth
        g.put('box', [0.2, 0.06, 0.3], [s * 0.17, 0.18, 0.38], [0.15, s * 0.3, s * 0.2], { col: DR.horn });
        g.gem(0.07, 0.035, 0.04, [s * 0.19, 0.1, 0.44], { col: DR.vio, glow: 1 }, [0, s * 0.4, 0]);
        g.ball(0.025, 0.02, 0.02, [s * 0.07, 0.0, 1.06], { col: DR.vio, glow: 1, lo: true });
        tri(g, [s * 0.5, 0.0, -0.3], [s * 0.26, 0.1, 0.12], [s * 0.26, -0.12, 0.02], 0.03, { col: DR.memb });
        for (let i = 0; i < 4; i++) g.spike([s * (0.1 + i * 0.012), -0.14, 0.92 - i * 0.14], [s * (0.1 + i * 0.012), -0.24, 0.93 - i * 0.14], 0.018, { col: DR.bone });
        // swept horns, a smaller pair under them
        g.limb([s * 0.16, 0.18, 0.02], [s * 0.3, 0.36, -0.36], 0.075, 0.055, { col: DR.horn });
        g.spike([s * 0.3, 0.36, -0.36], [s * 0.32, 0.44, -0.86], 0.055, { col: DR.horn });
        g.spike([s * 0.24, 0.06, -0.06], [s * 0.4, 0.1, -0.44], 0.04, { col: DR.bone });
        g.spike([s * 0.08, 0.04, 1.0], [s * 0.1, 0.16, 0.86], 0.03, { col: DR.bone });
        // phase 2: horns split with violet light, a crown of crystals, burning eyes
        g.box(0.03, 0.03, 0.4, [s * 0.25, 0.32, -0.22], P2(DR.vio), [0.45, 0, 0]);
        g.gem(0.09, 0.05, 0.05, [s * 0.19, 0.1, 0.445], { col: 0xd070ff, glow: 0.8, ph: 1 }, [0, s * 0.4, 0]);
      });
      for (const [x, h] of [[-0.1, 0.3], [0, 0.42], [0.1, 0.3]]) g.spike([x, 0.2, 0.06], [x * 1.6, 0.2 + h, -0.12], 0.05, P2(DR.vio));
    },
    'n.jaw': (g) => {
      g.limb([0, -0.04, -0.05], [0, -0.06, 0.66], 0.15, 0.09, { col: DR.scale });
      g.limb([0, -0.09, 0.0], [0, -0.09, 0.6], 0.1, 0.06, { col: DR.belly });
      g.spike([0, -0.12, 0.2], [0, -0.3, 0.05], 0.05, { col: DR.horn });
      g.pair((s) => { for (let i = 0; i < 4; i++) g.spike([s * (0.065 + i * 0.012), 0.02, 0.6 - i * 0.13], [s * (0.065 + i * 0.012), 0.11, 0.6 - i * 0.13], 0.016, { col: DR.bone }); });
    },
    'n.tail.1': (g) => { g.ball(0.22, 0.22, 0.22, [0, 0, 0], { col: DR.scale }); link(g, 0.05, -1.0, 0.22, 0.17, 2); },
    'n.tail.3': (g) => { g.ball(0.16, 0.16, 0.16, [0, 0, 0], { col: DR.scale }); link(g, 0.05, -1.0, 0.155, 0.11, 2); },
    'n.tail.5': (g) => {
      g.ball(0.1, 0.1, 0.1, [0, 0, 0], { col: DR.scale });
      link(g, 0.05, -0.55, 0.095, 0.06, 1);
      // a fin of void crystal at the tip
      g.pair((s) => tri(g, [s * 0.4, 0.1, -0.9], [s * 0.04, 0.02, -0.45], [s * 0.04, -0.02, -0.75], 0.04, { col: DR.vio, glow: 0.8 }));
      g.spike([0, 0, -0.5], [0, 0, -1.05], 0.06, { col: DR.vio, glow: 0.8 });
      g.gem(0.12, 0.12, 0.2, [0, 0, -0.75], P2(0xd070ff, 0.8));
    },
    'n.wings.0.wing': (g) => dWing(g, -1), 'n.wings.1.wing': (g) => dWing(g, 1),
    'n.wings.0.fore': (g) => dFore(g, -1), 'n.wings.1.fore': (g) => dFore(g, 1),
    'n.legs.0.hip': (g) => dThigh(g, 1), 'n.legs.1.hip': (g) => dThigh(g, 1), 'n.legs.2.hip': (g) => dThigh(g, 1.2), 'n.legs.3.hip': (g) => dThigh(g, 1.2),
    'n.legs.0.knee': (g) => dShin(g, 1), 'n.legs.1.knee': (g) => dShin(g, 1), 'n.legs.2.knee': (g) => dShin(g, 1.2), 'n.legs.3.knee': (g) => dShin(g, 1.2),
  },
};
function dWing(g, s) {
  g.ball(0.12, 0.12, 0.12, [0, 0, 0], { col: DR.scale });
  g.limb([0, 0, 0], [s * 1.58, 0, 0], 0.09, 0.065, { col: DR.scale });
  g.ball(0.08, 0.08, 0.08, [s * 1.55, 0, 0], { col: DR.scale2 });
  g.spike([s * 0.6, 0.06, 0], [s * 0.66, 0.22, -0.08], 0.04, { col: DR.horn });
  // membrane, with a scalloped trailing edge; in phase 2 the outer scallops are torn away and veins glow
  g.box(1.5, 0.03, 0.98, [s * 0.78, -0.03, -0.43], { col: DR.memb });
  tri(g, [s * 0.4, -0.03, -1.22], [s * 0.02, -0.03, -0.88], [s * 0.8, -0.03, -0.88], 0.03, { col: DR.memb2 });
  tri(g, [s * 1.2, -0.03, -1.28], [s * 0.78, -0.03, -0.88], [s * 1.54, -0.03, -0.88], 0.03, { col: DR.memb2, ph: 2 });
  tri(g, [s * 1.1, -0.03, -1.05], [s * 0.86, -0.03, -0.9], [s * 1.2, -0.03, -0.9], 0.03, { col: DR.memb2, ph: 1 });
  g.limb([s * 0.4, -0.01, 0.0], [s * 0.4, -0.01, -1.0], 0.018, 0.012, { col: DR.scale2 });
  g.limb([s * 1.0, -0.01, 0.0], [s * 1.1, -0.01, -0.95], 0.018, 0.012, { col: DR.scale2 });
  for (const [x0, x1] of [[0.2, 0.7], [0.9, 1.3]]) strap(g, [s * x0, 0.0, -0.1], [s * x1, 0.0, -0.8], 0.03, 0.03, P2(DR.vio), [0, 1, 0]);
}
function dFore(g, s) {
  const F = [[1.5, 0.25], [1.85, -0.55], [1.3, -1.35]];
  g.limb([0, 0, 0.05], [s * 1.4, 0, 0.05], 0.07, 0.05, { col: DR.scale });
  for (const [u, v] of F) g.limb([0, 0.01, 0], [s * u, 0.01, v], 0.04, 0.018, { col: DR.scale2 });
  g.spike([s * 0.2, 0.02, 0.1], [s * 0.3, 0.02, 0.5], 0.05, { col: DR.bone });
  const O = [s * 0.05, -0.02, 0];
  tri(g, O, [s * 1.5, -0.02, 0.25], [s * 1.85, -0.02, -0.55], 0.03, { col: DR.memb });
  tri(g, O, [s * 1.85, -0.02, -0.55], [s * 1.3, -0.02, -1.35], 0.03, { col: DR.memb, ph: 2 });
  tri(g, O, [s * 1.3, -0.02, -1.35], [s * 0, -0.02, -1.0], 0.03, { col: DR.memb });
  // phase 2: the middle panel hangs in tatters with burning edges
  tri(g, O, [s * 1.2, -0.02, -0.45], [s * 0.95, -0.02, -0.85], 0.03, { col: DR.memb2, ph: 1 });
  for (const [u, v] of [[1.6, -0.6], [1.3, -0.95], [1.4, -0.8]]) g.spike([s * u * 0.72, 0.0, v * 0.72], [s * u, 0.0, v], 0.03, P2(DR.vio));
  for (const [u, v] of F) g.spike([s * u * 0.95, 0.01, v * 0.95], [s * u * 1.12, 0.01, v * 1.12], 0.03, { col: DR.bone });
}
function dThigh(g, k) {
  g.limb([0, 0.05, 0], [0, -0.58, 0], 0.17 * k, 0.12 * k, { col: DR.scale });
  g.gem(0.12 * k, 0.16, 0.14 * k, [0, -0.12, 0.08], { col: DR.scale2 });
}
function dShin(g, k) {
  g.ball(0.11 * k, 0.11 * k, 0.11 * k, [0, 0, 0], { col: DR.scale });
  g.limb([0, 0, 0], [0, -0.5, -0.03], 0.11 * k, 0.08 * k, { col: DR.scale });
  g.ball(0.14 * k, 0.07, 0.2, [0, -0.53, 0.08], { col: DR.scale2 });
  for (const cx of [-0.09, 0, 0.09]) g.spike([cx * k, -0.55, 0.2], [cx * k * 1.3, -0.6, 0.42], 0.03, { col: DR.bone });
}

export const KIT_SHELLS = { vampire, alien, pharaoh, ufo, guardian, dragon };
