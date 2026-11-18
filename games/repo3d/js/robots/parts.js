// Shared humanoid rig and detailed limb/torso parts. Front is +Z, robot's left is +X (side sg = +1).
export const SIDES = [['L', 1], ['R', -1]];

export function crewDims(o = {}) {
  return Object.assign({
    ankle: 0.085, shin: 0.36, thigh: 0.36, legX: 0.11, waist: 0.08, abd: 0.16,
    chestW: 0.36, chestH: 0.27, chestD: 0.21, shX: 0.225, shY: 0.2, neckY: 0.27, neckH: 0.06,
    upper: 0.27, fore: 0.26, t: 1, at: 1, ht: 1, cA: 'm', cB: 's', scale: 1,
  }, o);
}

// joints: sc > base > hips > (thL>knL>ftL, thR..) , torso > chest > (shL>elL>haL, shR.., neck>head)
export function rigBiped(B, D) {
  B.joint('sc', 'root'); B.J.sc.scale.setScalar(D.scale);
  B.joint('base', 'sc');
  const hipY = D.ankle + D.shin + D.thigh + 0.02;
  B.joint('hips', 'base', 0, hipY, 0);
  for (const [S, sg] of SIDES) {
    B.joint('th' + S, 'hips', sg * D.legX, -0.02, 0);
    B.joint('kn' + S, 'th' + S, 0, -D.thigh, 0);
    B.joint('ft' + S, 'kn' + S, 0, -D.shin, 0);
  }
  B.joint('torso', 'hips', 0, D.waist, 0);
  B.joint('chest', 'torso', 0, D.abd, 0);
  for (const [S, sg] of SIDES) {
    B.joint('sh' + S, 'chest', sg * D.shX, D.shY, 0);
    B.joint('el' + S, 'sh' + S, 0, -D.upper, 0);
    B.joint('ha' + S, 'el' + S, 0, -D.fore, 0);
  }
  B.joint('neck', 'chest', 0, D.neckY, 0);
  B.joint('head', 'neck', 0, D.neckH, 0);
  D.hipY = hipY;
  D.headY = hipY + D.waist + D.abd + D.neckY + D.neckH;
  return D;
}

export function legParts(B, D, S, sg) {
  const t = D.t, th = D.thigh, sh = D.shin, A = D.cA, Bc = D.cB;
  const T = 'th' + S, K = 'kn' + S, F = 'ft' + S;
  B.sphere(T, 'metal', 0.062 * t, { seg: 12, rows: 8 });
  B.prof(T, 'paint', [[-0.06, -0.01], [0.05, -0.02], [0.075, -0.1], [0.07, -th * 0.7], [0.045, -th + 0.045], [-0.045, -th + 0.05], [-0.07, -th * 0.55], [-0.075, -0.1]].map(([z, y]) => [z * t, y]), 0.14 * t, { b: 0.028, c: Bc });
  B.box(T, 'paint', 0.085 * t, th * 0.42, 0.024, { p: [0, -th * 0.45, 0.074 * t], b: 0.009, k: 2, c: A, tb: [0.8, 1] });
  for (const [bx, by] of [[-0.03, -0.27], [0.03, -0.27], [-0.03, -0.62], [0.03, -0.62]]) B.bolt(T, bx * t, by * th, 0.087 * t, 'z', 0.006);
  B.box(T, 'dark', 0.004, th * 0.5, 0.11 * t, { p: [sg * 0.071 * t, -th * 0.5, 0], c: 0x141518 });
  B.cyl(K, 'metal', 0.05 * t, 0.05 * t, 0.13 * t, { ax: 'x', seg: 14 });
  B.cyl(K, 'dark', 0.035 * t, 0.035 * t, 0.15 * t, { ax: 'x', seg: 10 });
  B.box(K, 'paint', 0.1 * t, 0.11, 0.06, { p: [0, 0.0, 0.07 * t], r: [0.18, 0, 0], b: 0.026, k: 2, c: Bc });
  B.prof(K, 'paint', [[0.06, -0.03], [0.075, -0.1], [0.068, -sh * 0.75], [0.05, -sh + 0.04], [-0.04, -sh + 0.04], [-0.06, -sh * 0.6], [-0.085, -0.17], [-0.065, -0.05]].map(([z, y]) => [z * t, y]), 0.13 * t, { b: 0.026, c: A });
  B.box(K, 'paint', 0.04 * t, sh * 0.5, 0.016, { p: [0, -sh * 0.42, 0.074 * t], c: Bc, b: 0.006, k: 2 });
  B.box(K, 'dark', 0.132 * t, 0.006, 0.12 * t, { p: [0, -sh * 0.68, 0.0], c: 0x141518 });
  B.rod(K, 'dark', [0, -0.08, -0.088 * t], [0, -sh * 0.45, -0.08 * t], 0.016 * t);
  B.rod(K, 'metal', [0, -sh * 0.4, -0.08 * t], [0, -sh + 0.07, -0.062 * t], 0.009 * t);
  B.vent(K, sg * 0.066 * t, -sh * 0.42, -0.005, 0.07 * t, 0.08, 3, { ax: 'x', sgn: sg });
  B.cyl(F, 'metal', 0.04 * t, 0.04 * t, 0.11 * t, { ax: 'x' });
  B.torus(F, 'dark', 0.05 * t, 0.012, { ax: 'y', p: [0, 0.03, 0], ts: 18, rs: 5, c: 0x1c1d20 });
  const k = D.ankle / 0.085;
  const boot = [[-0.075, -0.085], [0.16, -0.085], [0.175, -0.06], [0.16, -0.035], [0.08, -0.012], [0.05, 0.03], [-0.055, 0.03], [-0.08, -0.02]];
  B.prof(F, 'paint', boot.map(([z, y]) => [z * t, y * k]), 0.15 * t, { b: 0.022, c: Bc });
  B.prof(F, 'paint', [[0.07, -0.072], [0.172, -0.072], [0.178, -0.058], [0.16, -0.036], [0.085, -0.016]].map(([z, y]) => [z * t, y * k]), 0.156 * t, { b: 0.01, c: A });
  B.prof(F, 'dark', [[-0.082, -0.085], [0.175, -0.085], [0.185, -0.072], [-0.088, -0.072]].map(([z, y]) => [z * t, y * k]), 0.158 * t, { b: 0.005, bs: 1, c: 0x18181a });
  for (let i = 0; i < 4; i++) B.box(F, 'dark', 0.16 * t, 0.01, 0.018, { p: [0, -D.ankle + 0.005, (-0.05 + i * 0.065) * t], c: 0x111113 });
}

export function hand(B, j, sg, s = 1, c = 'k', knuckle = 'm') {
  B.cyl(j, 'metal', 0.034 * s, 0.036 * s, 0.04 * s, { p: [0, -0.012 * s, 0], c });
  B.box(j, 'dark', 0.05 * s, 0.075 * s, 0.075 * s, { p: [0, -0.06 * s, 0], b: 0.012 * s, c: 0x2a2c30 });
  B.box(j, 'paint', 0.018 * s, 0.06 * s, 0.07 * s, { p: [sg * 0.03 * s, -0.058 * s, 0], b: 0.007 * s, c: knuckle });
  for (const z of [-0.024, 0, 0.024]) {
    B.box(j, 'metal', 0.021 * s, 0.042 * s, 0.02 * s, { p: [-sg * 0.004 * s, -0.115 * s, z * s], r: [0, 0, -sg * 0.18], b: 0.006 * s, c });
    B.box(j, 'metal', 0.019 * s, 0.036 * s, 0.018 * s, { p: [-sg * 0.016 * s, -0.152 * s, z * s], r: [0, 0, -sg * 0.55], b: 0.006 * s, c });
  }
  B.box(j, 'metal', 0.02 * s, 0.045 * s, 0.02 * s, { p: [-sg * 0.012 * s, -0.075 * s, 0.048 * s], r: [0.5, 0, -sg * 0.3], b: 0.006 * s, c });
}

export function pauldron(B, H, sg, t, c = 'm', c2 = 's') {
  const prof = [[0.0, 0.1], [0.06, 0.096], [0.1, 0.064], [0.118, 0.01], [0.112, -0.035, 1], [0.1, -0.042, 1]];
  const o = { p: [sg * 0.03 * t, 0.025 * t, 0], r: [0, 0, -sg * 0.55], s: [t, t, t * 1.12], seg: 18 };
  B.shell(H, 'paint', prof, { ...o, c, inMat: 'dark', inK: 0.94 });
  const a = -sg * 0.55, dy = -0.038;
  B.torus(H, 'paint', 0.106, 0.011, { ax: 'y', p: [(sg * 0.03 - Math.sin(a) * dy) * t, (0.025 + Math.cos(a) * dy) * t, 0], r: [0, 0, a], s: [t, t, t * 1.12], ts: 28, rs: 6, c: c2 });
  B.bolt(H, sg * 0.075 * t, 0.115 * t, 0.045 * t, 'y', 0.007); B.bolt(H, sg * 0.075 * t, 0.115 * t, -0.045 * t, 'y', 0.007);
}

export function armParts(B, D, S, sg, o = {}) {
  const t = D.at, up = D.upper, fo = D.fore, A = D.cA, Bc = D.cB;
  const H = 'sh' + S, E = 'el' + S, W = 'ha' + S;
  B.sphere(H, 'metal', 0.06 * t, { seg: 12, rows: 8 });
  if (!o.noPauldron) pauldron(B, H, sg, t, A, Bc);
  B.cyl(H, 'dark', 0.03 * t, 0.03 * t, up * 0.8, { p: [0, -up * 0.5, 0] });
  B.box(H, 'paint', 0.085 * t, up * 0.56, 0.09 * t, { p: [sg * 0.008, -up * 0.55, 0], b: 0.03 * t, k: 2, tb: [0.9, 0.9], c: Bc });
  B.cyl(E, 'metal', 0.044 * t, 0.044 * t, 0.1 * t, { ax: 'x' });
  B.box(E, 'paint', 0.07 * t, 0.06, 0.05 * t, { p: [0, 0.005, -0.045 * t], b: 0.018, k: 2, c: Bc });
  if (!o.noFore) {
    B.prof(E, 'paint', [[0.045, -0.03], [0.06, -0.1], [0.05, -fo + 0.035], [-0.045, -fo + 0.035], [-0.062, -0.12], [-0.05, -0.03]].map(([z, y]) => [z * t, y]), 0.105 * t, { b: 0.024, c: A });
    B.box(E, 'paint', 0.1 * t, 0.02, 0.1 * t, { p: [0, -fo + 0.05, 0], c: 'a', b: 0.006, k: 2 });
    B.rod(E, 'metal', [0, -0.04, -0.06 * t], [0, -fo + 0.06, -0.05 * t], 0.008 * t);
    B.vent(E, sg * 0.053 * t, -fo * 0.48, 0, 0.06 * t, 0.06, 3, { ax: 'x', sgn: sg });
  }
  if (!o.noHand) hand(B, W, sg, D.ht);
}

// 7-segment stencil digits on a plane facing +z, rotated by r
const SEG7 = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd' };
export function digits(B, j, str, x, y, z, h, c, r = [0, 0, 0]) {
  const w = h * 0.5, th = h * 0.13;
  const segs = { a: [0, h / 2, w, th], d: [0, -h / 2, w, th], g: [0, 0, w, th], f: [-w / 2, h / 4, th, h / 2], b: [w / 2, h / 4, th, h / 2], e: [-w / 2, -h / 4, th, h / 2], c: [w / 2, -h / 4, th, h / 2] };
  const ca = Math.cos(r[1]), sa = Math.sin(r[1]);
  [...str].forEach((ch, i) => {
    const ox = (i - (str.length - 1) / 2) * w * 1.6;
    for (const sgm of SEG7[ch] || '') {
      const [sx, sy, ww, hh] = segs[sgm];
      const lx = ox + sx;
      B.box(j, 'paint', ww, hh, 0.003, { p: [x + lx * ca, y + sy, z - lx * sa], r, c, wear: 0.9, b: 0 });
    }
  });
}

export function torsoParts(B, D, o = {}) {
  const A = D.cA, Bc = D.cB, W = D.chestW, H = D.chestH, Dp = D.chestD;
  // pelvis
  B.ext('hips', 'paint', [[-0.14, 0.035], [0.14, 0.035], [0.125, -0.04], [0.05, -0.085], [-0.05, -0.085], [-0.125, -0.04]], 0.19, { b: 0.025, bs: 2, crease: 55, c: Bc });
  B.box('hips', 'dark', 0.29, 0.035, 0.2, { p: [0, 0.055, 0], b: 0.012, k: 2, c: 0x222326 });
  B.box('hips', 'paint', 0.07, 0.04, 0.02, { p: [0, 0.055, 0.1], b: 0.008, c: 'a' });
  B.box('hips', 'glow2', 0.018, 0.01, 0.006, { p: [0.07, 0.055, 0.103], i: 2.5 });
  for (const x of [-0.11, 0.11]) B.bolt('hips', x, 0.055, 0.101, 'z', 0.006);
  // abdomen
  B.cyl('torso', 'dark', 0.07, 0.075, 0.2, { p: [0, 0.07, 0], c: 0x222428 });
  for (const y of [0.02, 0.065, 0.11]) B.torus('torso', 'metal', 0.083, 0.011, { ax: 'y', p: [0, y, 0], ts: 24, rs: 6 });
  for (let i = 0; i < 2; i++) B.box('torso', 'paint', 0.12 - i * 0.01, 0.042, 0.045, { p: [0, 0.035 + i * 0.05, 0.068], b: 0.016, k: 2, c: Bc });
  for (const [, sg] of SIDES) B.tube('torso', 'dark', [[sg * 0.09, -0.02, -0.03], [sg * 0.11, 0.06, -0.05], [sg * 0.09, 0.15, -0.07]], 0.011, { c: 0x1d1e21 });
  // chest shell: sculpted side profile, narrower at the waist
  const k = H / 0.27, kz = Dp / 0.21;
  const shell = [[-0.1, 0.0], [0.08, 0.0], [0.125, 0.07], [0.135, 0.17], [0.11, 0.25], [0.05, 0.285], [-0.08, 0.285], [-0.115, 0.22], [-0.115, 0.07]].map(([z, y]) => [z * kz, y * k]);
  if (!o.noChestPlates) {
    B.prof('chest', 'paint', shell, W, { b: 0.05, bs: 3, tb: [0.78, 1], c: A });
    const zf = 0.137 * kz;
    for (const [, sg] of SIDES) {
      B.box('chest', 'dark', 0.005, 0.15 * k, 0.012, { p: [sg * 0.075, 0.15 * k, zf - 0.003], r: [0.12, 0, 0], c: 0x111214, b: 0 });
      B.bolt('chest', sg * 0.13, 0.23 * k, 0.118 * kz, 'z', 0.007);
      B.bolt('chest', sg * 0.045, 0.235 * k, 0.122 * kz, 'z', 0.006);
    }
    B.box('chest', 'dark', W * 0.7, 0.005, 0.012, { p: [0, 0.075 * k, 0.126 * kz], r: [-0.5, 0, 0], c: 0x111214, b: 0 });
    if (!o.noNum) digits(B, 'chest', o.num || '07', -0.115, 0.19 * k, 0.137 * kz, 0.04, o.numC || 'a', [-0.12, 0, 0]);
  }
  for (const [, sg] of SIDES) B.vent('chest', sg * (W / 2 + 0.002), 0.13 * k, -0.01, 0.1, 0.07, 4, { ax: 'x', sgn: sg });
  B.box('chest', 'paint', W * 0.62, 0.04, Dp * 0.78, { p: [0, H, -0.012], b: 0.018, k: 2, c: Bc });
  if (!o.noPack) {
    const pk = [[-0.105, 0.03], [-0.105, 0.255], [-0.15, 0.27], [-0.205, 0.245], [-0.222, 0.06], [-0.19, 0.02]].map(([z, y]) => [z * kz, y * k]);
    B.prof('chest', 'paint', pk, W * 0.72, { b: 0.03, bs: 2, c: Bc });
    const z = -0.22 * kz;
    for (const [, sg] of SIDES) {
      B.cyl('chest', 'metal', 0.032, 0.032, H * 0.6, { p: [sg * 0.075, H * 0.5, z - 0.02], c: 'k' });
      B.cyl('chest', 'paint', 0.035, 0.035, 0.026, { p: [sg * 0.075, H * 0.8, z - 0.02], c: 'a' });
      B.cyl('chest', 'paint', 0.035, 0.035, 0.026, { p: [sg * 0.075, H * 0.2, z - 0.02], c: 'a' });
    }
    B.vent('chest', 0, H * 0.5, z - 0.004, 0.05, 0.12, 5, { sgn: -1 });
    B.box('chest', 'glow2', 0.03, 0.008, 0.006, { p: [0.0, H * 0.86, z + 0.002], i: 2.2 });
    B.tube('chest', 'dark', [[0.1, H * 0.85, z + 0.03], [0.1, H + 0.06, -0.06], [0.05, H + 0.1, -0.04]], 0.012, { c: 0x1b1c20 });
  }
  // neck
  B.cyl('neck', 'metal', 0.042, 0.048, 0.085, { p: [0, 0.02, 0], seg: 12 });
  for (const y of [-0.005, 0.03]) B.torus('neck', 'dark', 0.046, 0.008, { ax: 'y', p: [0, y, 0], ts: 18, rs: 5, c: 0x1b1c1f });
}

// Gaunt limbs: exposed struts and joint balls with sculpted narrow plates (stalkers, bosses).
export function slimLeg(B, D, S, sg, o = {}) {
  const T = 'th' + S, K = 'kn' + S, F = 'ft' + S, t = D.t, th = D.thigh, sh = D.shin;
  B.sphere(T, 'metal', 0.05 * t, { seg: 10, rows: 8 });
  B.rod(T, 'metal', [0, 0, 0], [0, -th, 0], 0.024 * t, { c: o.strut ?? 'k' });
  B.prof(T, 'paint', [[-0.045, -0.03], [0.04, -0.03], [0.06, -0.12], [0.05, -th * 0.75], [0.025, -th + 0.06], [-0.03, -th + 0.07], [-0.05, -th * 0.5]].map(([z, y]) => [z * t, y]), 0.085 * t, { b: 0.02, c: D.cA });
  B.rod(T, 'dark', [sg * 0.04 * t, -0.05, -0.035], [sg * 0.035 * t, -th * 0.8, -0.03], 0.009 * t);
  B.sphere(K, 'metal', 0.042 * t, { seg: 10, rows: 8 });
  B.box(K, 'paint', 0.065 * t, 0.08, 0.045, { p: [0, 0.0, 0.04 * t], r: [0.2, 0, 0], b: 0.018, k: 2, c: D.cB });
  B.rod(K, 'metal', [0, 0, 0], [0, -sh, 0], 0.02 * t, { c: o.strut ?? 'k' });
  B.prof(K, 'paint', [[0.045, -0.04], [0.055, -0.12], [0.04, -sh * 0.8], [0.02, -sh + 0.05], [-0.025, -sh + 0.06], [-0.04, -sh * 0.55], [-0.065, -0.16], [-0.04, -0.05]].map(([z, y]) => [z * t, y]), 0.08 * t, { b: 0.02, c: D.cA });
  B.box(K, 'dark', 0.082 * t, 0.005, 0.1 * t, { p: [0, -sh * 0.62, 0], c: 0x121315, b: 0 });
  B.sphere(F, 'metal', 0.035 * t, { seg: 10, rows: 8 });
  const fl = o.footL ?? 0.2, k = D.ankle / 0.085;
  B.prof(F, 'paint', [[-0.05, -0.085], [fl * 0.95, -0.085], [fl, -0.06], [fl * 0.6, -0.03], [0.03, 0.02], [-0.04, 0.02], [-0.06, -0.04]].map(([z, y]) => [z * t, y * k]), 0.09 * t, { b: 0.016, c: D.cB });
  B.prof(F, 'dark', [[-0.055, -0.085], [fl, -0.085], [fl + 0.01, -0.074], [-0.06, -0.074]].map(([z, y]) => [z * t, y * k]), 0.094 * t, { b: 0.004, bs: 1, c: 0x161618 });
}

export function slimArm(B, D, S, sg, o = {}) {
  const H = 'sh' + S, E = 'el' + S, W = 'ha' + S, t = D.at, up = D.upper, fo = D.fore;
  B.sphere(H, 'metal', 0.05 * t, { seg: 10, rows: 8 });
  B.box(H, 'paint', 0.1 * t, 0.07 * t, 0.11 * t, { p: [sg * 0.02 * t, 0.035 * t, 0], r: [0, 0, -sg * 0.4], b: 0.03 * t, k: 2, c: D.cB });
  B.rod(H, 'metal', [0, 0, 0], [0, -up, 0], 0.02 * t, { c: o.strut ?? 'k' });
  B.prof(H, 'paint', [[-0.035, -0.05], [0.035, -0.05], [0.045, -0.12], [0.03, -up * 0.85], [-0.03, -up * 0.85], [-0.045, -up * 0.4]].map(([z, y]) => [z * t, y]), 0.07 * t, { b: 0.018, c: D.cA });
  B.sphere(E, 'metal', 0.036 * t, { seg: 10, rows: 8 });
  B.rod(E, 'metal', [0, 0, 0], [0, -fo, 0], 0.017 * t, { c: o.strut ?? 'k' });
  B.prof(E, 'paint', [[0.035, -0.03], [0.05, -0.1], [0.035, -fo * 0.8], [-0.03, -fo * 0.8], [-0.05, -0.12], [-0.035, -0.03]].map(([z, y]) => [z * t, y]), 0.068 * t, { b: 0.016, c: D.cA });
  B.box(E, 'paint', 0.072 * t, 0.016, 0.075 * t, { p: [0, -fo * 0.7, 0], c: D.cB, b: 0.005, k: 2 });
  if (o.noHand) return;
  claw(B, W, sg, o.fingerL ?? 0.12, o.fingers ?? 3, o.clawC ?? 'k', D.ht ?? 1);
}

// long-fingered claw hand, fingers hang down (-y), curl toward -sg
export function claw(B, j, sg, L = 0.12, n = 3, c = 'k', s = 1) {
  B.box(j, 'dark', 0.04 * s, 0.06 * s, 0.06 * s, { p: [0, -0.035 * s, 0], b: 0.01 * s, c: 0x26272b });
  for (let i = 0; i < n; i++) {
    const z = (n === 1 ? 0 : -0.024 + (0.048 * i) / (n - 1)) * s;
    B.beam(j, 'metal', [0, -0.06 * s, z], [-sg * 0.01 * s, -(0.06 + L * 0.5) * s, z * 1.15], 0.014 * s, 0.014 * s, { c });
    B.lathe(j, 'metal', [[0, 0], [0.008 * s, 0.004 * s], [0, L * 0.55 * s]], { seg: 5, p: [-sg * 0.01 * s, -(0.06 + L * 0.5) * s, z * 1.15], r: [Math.PI, 0, sg * 0.35], c });
  }
  B.beam(j, 'metal', [0, -0.05 * s, 0.03 * s], [-sg * 0.02 * s, -0.1 * s, 0.06 * s], 0.013 * s, 0.013 * s, { c });
}

// ---------- horror kit (foes and bosses only) ----------
const PI = Math.PI;
export const h01 = (n) => { const x = Math.sin(n * 91.345 + 47.853) * 43758.5453; return x - Math.floor(x); };

// row of uneven metal teeth from x0 to x1 at (y, z); dir -1 hangs down, +1 points up. o: fang, r, c, rx, curve (z arc)
export function teeth(B, j, x0, x1, y, z, n, L, o = {}) {
  const dir = o.dir ?? -1, c = o.c ?? 0xcfc4a8;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1), x = x0 + (x1 - x0) * t;
    const fang = o.fang && (i === 1 || i === n - 2) ? 1.7 : 1;
    const l = L * (0.6 + 0.45 * h01(i * 3.7 + n + (o.s || 0))) * fang;
    const r = (o.r ?? L * 0.3) * (fang > 1 ? 1.2 : 1);
    const zz = z - (o.curve ?? 0) * (2 * t - 1) * (2 * t - 1);
    B.lathe(j, 'metal', [[0, 0], [r, 0.002, 1], [r * 0.55, l * 0.5], [0, l]], { seg: 5, p: [x, y, zz], r: [(dir < 0 ? PI : 0) + (o.rx ?? 0) * -dir, 0, (h01(i * 5.1 + n) - 0.5) * 0.35], c, wear: 0.4, rust: 0.25, oil: o.oil ?? 0.5 });
  }
}

// cone spike from p pointing along euler r (default +y)
export function spike(B, j, p, r0, L, r = [0, 0, 0], o = {}) {
  return B.lathe(j, o.mat || 'metal', [[0, 0], [r0, 0.002, 1], [r0 * 0.6, L * 0.45], [0, L]], { seg: o.seg ?? 6, p, r, c: o.c ?? 0xb8b4ac, wear: 0.5 });
}

// eye: dark socket, glass lens, glowing iris, additive halo
export function eye(B, j, p, r, o = {}) {
  const key = o.key || 'glow', ax = o.ax ?? 'z', rot = o.r || [0, 0, 0];
  const d = ax === 'z' ? [0, 0, 1] : ax === 'x' ? [1, 0, 0] : [0, 1, 0];
  const off = (k) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
  if (!o.noSocket) B.cyl(j, 'dark', r * 1.35, r * 1.5, r * 0.9, { ax, p: off(-r * 0.25), r: rot, seg: o.seg ?? 14, c: 0x0a0a0b, b: r * 0.15 });
  B.cyl(j, 'glass', r, r, r * 0.3, { ax, p: off(r * 0.2), r: rot, seg: o.seg ?? 14, c: 0x060708 });
  B.cyl(j, key, r * (o.iris ?? 0.55), r * (o.iris ?? 0.55), r * 0.12, { ax, p: off(r * 0.38), r: rot, seg: 10, i: o.i ?? 3.6 });
  if (o.pupil) B.box(j, 'dark', r * 0.16, r * 0.95, r * 0.05, { p: off(r * 0.45), r: rot, c: 0x050505, b: 0 });
  B.halo(j, off(r * 0.6), o.halo ?? r * 7, key);
}

// exposed rib cage on a chest joint: n ribs from the spine (back) curving round to a cracked sternum
export function ribs(B, j, y0, n, w, d, gap, o = {}) {
  for (let i = 0; i < n; i++) {
    const y = y0 + i * gap, k = 1 - Math.abs(i - (n - 1) * 0.45) / n * 0.5;
    for (const sg of [1, -1]) {
      if (o.broken && i === o.broken && sg < 0) continue;
      const W = w * k, D = d * k;
      B.tube(j, o.mat || 'metal', [[sg * 0.02, y + 0.01, -D * 0.5], [sg * W * 0.45, y + 0.004, -D * 0.4], [sg * W * 0.52, y - 0.012, 0], [sg * W * 0.38, y - 0.03, D * 0.42], [sg * 0.03, y - 0.045, D * 0.52]], o.r ?? 0.011, { c: o.c ?? 0xb0aaa0, ts: 14, rs: 5 });
    }
  }
  B.box(j, 'metal', 0.03, gap * n, 0.02, { p: [0, y0 + gap * (n - 1) / 2 - 0.04, d * 0.53], b: 0.006, c: o.c ?? 0xb0aaa0 });
  for (let i = 0; i < n; i++) B.box(j, 'dark', 0.045, 0.022, 0.035, { p: [0, y0 + i * gap, -d * 0.5], b: 0.006, c: 0x2a2624 });
}

// hydraulic piston: dark sleeve from a, chrome rod into b, collars both ends
export function piston(B, j, a, b, r, o = {}) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  B.rod(j, 'dark', a, m, r, { c: o.c ?? 0x2a2b2e, seg: 10 });
  B.rod(j, 'chrome', m, b, r * 0.55, { c: 0xc8ccd0, seg: 8 });
  B.sphere(j, 'metal', r * 1.25, { p: a, seg: 8, rows: 6 }); B.sphere(j, 'metal', r * 1.0, { p: b, seg: 8, rows: 6 });
}

// cable bundle along pts with clamp clips
export function cable(B, j, pts, r, o = {}) {
  B.tube(j, 'dark', pts, r, { c: o.c ?? 0x18181a, ts: o.ts ?? pts.length * 7, rs: 6 });
  if (o.twin) B.tube(j, 'dark', pts.map(([x, y, z]) => [x + r * 1.8, y + r * 0.6, z]), r * 0.7, { c: o.twin, ts: pts.length * 6, rs: 5 });
  for (let i = 1; i < pts.length - 1; i += o.every ?? 1) B.box(j, 'metal', r * 3.2, r * 1.6, r * 3.2, { p: pts[i], b: r * 0.4, c: 0x6a6660 });
}

// a ragged plate: outline of n points around an ellipse with a broken (jagged) arc between a0..a1
export function jagged(w, h, n = 14, a0 = 3.6, a1 = 5.6, s = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    const bite = a > a0 && a < a1 ? 0.55 + 0.4 * h01(i * 7.3 + s) : 1;
    pts.push([Math.cos(a) * w * 0.5 * bite, Math.sin(a) * h * 0.5 * bite]);
  }
  return pts;
}

// serrated blade outline along +x: length L, height H, n saw teeth on the lower edge
export function sawBlade(L, H, n = 7, hook = 0.3) {
  const pts = [[0, H * 0.4]];
  pts.push([L * 0.7, H * 0.55], [L, H * (0.2 + hook)], [L * 1.04, -H * 0.1]);
  for (let i = n; i >= 0; i--) { const x = (L * 0.95 * i) / n; pts.push([x, -H * 0.5], [x - L * 0.5 / n, -H * 0.28]); }
  pts.push([0, -H * 0.3]);
  return pts;
}

// hanging hook on a cable end at p (hook opens to +z)
export function hook(B, j, p, s = 1, c = 0x9a9690) {
  B.torus(j, 'metal', 0.035 * s, 0.008 * s, { arc: PI * 1.25, p: [p[0], p[1] - 0.035 * s, p[2]], r: [0, PI / 2, PI * 0.35], ts: 14, rs: 5, c });
  spike(B, j, [p[0], p[1] - 0.015 * s, p[2] + 0.03 * s], 0.008 * s, 0.03 * s, [0.4, 0, 0], { c });
  B.cyl(j, 'metal', 0.01 * s, 0.01 * s, 0.03 * s, { p: [p[0], p[1] + 0.005, p[2]], c, seg: 8 });
}

// gaunt torso for stalkers: pelvis, spine stack, rib cage, collar plate, back pistons
export function gauntTorso(B, D, o = {}) {
  const W = D.chestW, H = D.chestH, Dp = D.chestD;
  B.ext('hips', 'paint', [[-0.12, 0.03], [0.12, 0.03], [0.1, -0.05], [0.04, -0.09], [-0.04, -0.09], [-0.1, -0.05]], 0.15, { b: 0.02, bs: 2, c: o.pc || 'm' });
  B.cyl('hips', 'dark', 0.05, 0.05, 0.2, { ax: 'x', p: [0, -0.01, 0], seg: 10 });
  const nv = 5;
  for (let i = 0; i < nv; i++) B.cyl('torso', 'metal', 0.034, 0.04, (D.abd + D.waist) / nv * 0.62, { p: [0, -D.waist + (i + 0.5) * (D.abd + D.waist) / nv, -0.02], seg: 10, c: o.spineC ?? 'k' });
  cable(B, 'torso', [[0.04, -D.waist, 0.02], [0.06, D.abd * 0.5, 0.04], [0.03, D.abd + 0.02, 0.03]], 0.008, { c: 0x2a1614 });
  cable(B, 'torso', [[-0.05, -D.waist, -0.01], [-0.07, D.abd * 0.4, 0.02], [-0.04, D.abd + 0.02, 0.0]], 0.007, {});
  ribs(B, 'chest', H * 0.2, o.ribs ?? 5, W * 0.85, Dp * 0.95, H * 0.13, { broken: o.broken ?? 2, c: o.ribC });
  // cracked collar plate and a shoulder yoke
  B.prof('chest', 'paint', [[-Dp * 0.5, H * 0.78], [Dp * 0.45, H * 0.74], [Dp * 0.55, H * 0.9], [Dp * 0.2, H * 1.04], [-Dp * 0.45, H * 1.04]], W * 0.9, { b: 0.02, bs: 2, tb: [0.8, 1], c: o.pc || 'm' });
  B.box('chest', 'dark', 0.004, 0.08, 0.02, { p: [0.04, H * 0.92, Dp * 0.5], r: [0.3, 0, 0.5], c: 0x080808, b: 0 });
  B.cyl('chest', 'paint', 0.04, 0.04, W * 1.05, { ax: 'x', p: [0, H * 0.92, -0.01], seg: 10, c: o.sc || 's' });
  for (const sg of [1, -1]) piston(B, 'chest', [sg * 0.06, H * 0.95, -Dp * 0.55], [sg * 0.04, -0.02, -Dp * 0.5], 0.014);
  // a glowing core behind the ribs
  if (!o.noCore) { B.sphere('chest', 'glow2', 0.035, { p: [0.0, H * 0.48, 0.0], i: 1.6 }); B.halo('chest', [0, H * 0.48, Dp * 0.3], 0.3, 'glow2'); }
  B.cyl('neck', 'metal', 0.026, 0.034, 0.1, { p: [0, 0.02, 0], seg: 10 });
  cable(B, 'neck', [[0.03, -0.04, -0.02], [0.04, 0.03, -0.03], [0.02, 0.08, -0.02]], 0.007, {});
}
