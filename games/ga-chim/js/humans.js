// Human raiders, built like a game character sheet: a jointed skeleton dressed in layered gear.
// Archetypes vary head, camo, carrier, belt kit and weapon parts per seed. Procedural clips:
// idle, run (any direction), aim, fire recoil, hit flinch, death fall.
import * as THREE from '../vendor/three.module.min.js';
import { Kit, chamferBox, cylinder, lathe } from './kit.js';
import { mat, noMask } from './mats.js';
import { rng, clamp, lerp } from './rng.js';
import { buildRifleParts } from './guns3p.js';

let HM = null;
function hmats() {
  if (HM) return HM;
  const b = { space: 'object', macro: 0.06, wetK: 1, env: 0.55 };
  HM = {
    camoWood: mat({ ...b, surf: 'camoWood', scale: 2.4, wetRough: 0.55, nscale: 0.5 }),
    camoDesert: mat({ ...b, surf: 'camoDesert', scale: 2.4, wetRough: 0.55, nscale: 0.5 }),
    black: mat({ ...b, surf: 'fabric', scale: 3, color: 0x1e2124, wetRough: 0.45, nscale: 0.6 }),
    olive: mat({ ...b, surf: 'fabric', scale: 3, color: 0x3a3d2a, wetRough: 0.45, nscale: 0.6 }),
    grey: mat({ ...b, surf: 'fabric', scale: 3, color: 0x3f4347, wetRough: 0.45, nscale: 0.6 }),
    tee: mat({ ...b, surf: 'fabric', scale: 3, color: 0x8c8c86, wetRough: 0.5, nscale: 0.4 }),
    denim: mat({ ...b, surf: 'denim', scale: 2.2, wetRough: 0.5, nscale: 0.5 }),
    coyote: mat({ ...b, surf: 'fabric', scale: 4, color: 0x6e5c40, wetRough: 0.5 }),
    ranger: mat({ ...b, surf: 'fabric', scale: 4, color: 0x3c4232, wetRough: 0.5 }),
    nylonBlack: mat({ ...b, surf: 'fabric', scale: 4, color: 0x18191a, wetRough: 0.45 }),
    webbing: mat({ ...b, surf: 'fabric', scale: 9, color: 0x2a2a24, wetRough: 0.5 }),
    boot: mat({ ...b, surf: 'leather', scale: 6, color: 0x24201a, wetRough: 0.3 }),
    rubber: mat({ ...b, surf: 'polymer', scale: 5, wetRough: 0.25 }),
    metal: mat({ ...b, surf: 'steel', scale: 6, roughK: 0.8 }),
    poly: mat({ ...b, surf: 'polymer', scale: 6, wetRough: 0.3 }),
    helmet: mat({ ...b, surf: 'paintedMetal', paint: 0x3b4034, scale: 4, roughK: 1.1 }),
    skin: mat({ ...b, surf: 'skin', scale: 5, paint: 0xd9b49a, wetRough: 0.35 }),
    hair: mat({ ...b, surf: 'fabric', scale: 14, color: 0x1a1410, roughK: 0.7, nscale: 1.5 }),
    glove: mat({ ...b, surf: 'leather', scale: 8, color: 0x2a2620 }),
    gloveTan: mat({ ...b, surf: 'leather', scale: 8, color: 0x7a6a4c }),
    red: mat({ ...b, surf: 'paintedMetal', paint: 0x7a1c14, scale: 6 }),
    gun: mat({ ...b, surf: 'anodized', scale: 8, metalK: 0.3, roughK: 1.2 }),
    lens: noMask(new THREE.MeshStandardMaterial({ color: 0x07090a, roughness: 0.04, metalness: 0.7, envMapIntensity: 1.6 })),
    lensHot: noMask(new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.6, 0.2) })),
  };
  return HM;
}

// Limb: lathe along -Y with per-vertex folds (cloth wrinkles) and an optional flattening.
function limb(r0, r1, len, flat = 0.88, bulge = 0.08, folds = 0, seed = 1) {
  const p = [[0, 0.0001]]; const n = 14;
  for (let i = 0; i <= n; i++) { const t = i / n; p.push([lerp(r0, r1, t) * (1 + Math.sin(t * Math.PI) * bulge), -t * len]); }
  p.push([0, -len - 0.0001]);
  const g = lathe(p, 16); g.scale(1, 1, flat);
  if (folds > 0) {
    const pa = g.getAttribute('position');
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const a = Math.atan2(z, x); const r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const w = (Math.sin(y * 70 + a * 2 + seed) * 0.5 + Math.sin(y * 31 - a * 3 + seed * 2) * 0.5) * folds;
      pa.setXYZ(i, x * (1 + w), y, z * (1 + w));
    }
    g.computeVertexNormals();
  }
  return g;
}
function part(geo, m, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
const band = (r, w, flat = 1) => { const g = new THREE.CylinderGeometry(r, r, w, 18, 1, true); g.scale(1, 1, flat); return g; };
const box = (w, h, d, e) => chamferBox(w, h, d, e);

const ARCH = [
  { name: 'operator', top: 'camoWood', pants: 'camoWood', carrier: 'ranger', head: 'helmet', gloves: 'glove' },
  { name: 'desert', top: 'grey', pants: 'camoDesert', carrier: 'coyote', head: 'boonie', gloves: 'gloveTan' },
  { name: 'masked', top: 'black', pants: 'camoDesert', carrier: 'nylonBlack', head: 'balaclava', gloves: 'glove' },
  { name: 'beret', top: 'black', pants: 'camoWood', carrier: 'ranger', head: 'beret', gloves: 'glove' },
  { name: 'scav', top: 'tee', pants: 'denim', carrier: 'coyote', head: 'bare', gloves: 'gloveTan' },
  { name: 'hood', top: 'olive', pants: 'black', carrier: 'nylonBlack', head: 'gasmask', gloves: 'glove' },
];

function buildHead(head, M, A, r) {
  const skin = M.skin;
  // skull and face planes: brow, nose, cheeks, jaw, ears
  const skull = new THREE.SphereGeometry(0.1, 20, 16); skull.scale(0.92, 1.1, 1.05); part(skull, skin, head, 0, 0.02, 0);
  const jaw = box(0.13, 0.07, 0.12, 0.03); part(jaw, skin, head, 0, -0.065, -0.02);
  part(box(0.12, 0.022, 0.03, 0.01), skin, head, 0, 0.045, -0.098);
  const nose = new THREE.ConeGeometry(0.018, 0.05, 6); nose.rotateX(-Math.PI / 2 + 0.35); part(nose, skin, head, 0, 0.0, -0.115);
  for (const sx of [-1, 1]) {
    part(box(0.02, 0.05, 0.035, 0.01), skin, head, sx * 0.093, 0.0, 0.0);
    part(new THREE.SphereGeometry(0.012, 8, 6), M.lens, head, sx * 0.034, 0.022, -0.095);
  }
  const beard = () => { const g = new THREE.SphereGeometry(0.075, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55); g.scale(1, 1.1, 1.0); part(g, M.hair, head, 0, -0.04, -0.035); part(box(0.06, 0.015, 0.02, 0.006), M.hair, head, 0, -0.025, -0.105); };
  const hairCap = (h = 0.6) => { const g = new THREE.SphereGeometry(0.106, 18, 12, 0, Math.PI * 2, 0, Math.PI * h); g.scale(0.95, 1.12, 1.1); part(g, M.hair, head, 0, 0.025, 0.004); };
  const headset = () => { for (const sx of [-1, 1]) { const cup = cylinder(0.04, 0.035, 14); cup.rotateZ(Math.PI / 2); part(cup, M.poly, head, sx * 0.108, 0.0, 0.0); } part(band(0.112, 0.015), M.poly, head, 0, 0.075, 0, Math.PI / 2, 0, Math.PI / 2); const mic = new THREE.CylinderGeometry(0.004, 0.004, 0.1, 6); mic.rotateX(Math.PI / 2); part(mic, M.poly, head, -0.09, -0.04, -0.06, 0, 0.5, 0); };
  let eyeGlow = null;
  if (head === 'helmet') {
    const shell = new THREE.SphereGeometry(0.135, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5); shell.scale(1, 0.9, 1.08); part(shell, M.helmet, head, 0, 0.035, 0.01);
    part(band(0.137, 0.025, 1.08), M.helmet, head, 0, 0.03, 0.01);
    for (const sx of [-1, 1]) part(box(0.012, 0.02, 0.1, 0.004), M.poly, head, sx * 0.13, 0.05, 0.0);
    part(box(0.05, 0.035, 0.02, 0.006), M.poly, head, 0, 0.11, -0.13);
    if (r() < 0.6) { const nvg = box(0.09, 0.03, 0.045, 0.008); part(nvg, M.poly, head, 0, 0.13, -0.15); for (const sx of [-1, 1]) { const t = cylinder(0.016, 0.06, 12); t.rotateX(Math.PI / 2); part(t, M.poly, head, sx * 0.022, 0.13, -0.19); } }
    headset();
    part(box(0.15, 0.04, 0.03, 0.01), M.lens, head, 0, 0.022, -0.103); // glasses
    if (r() < 0.5) beard(); else { part(box(0.14, 0.09, 0.12, 0.03), M.black, head, 0, -0.06, -0.03); }
  } else if (head === 'boonie') {
    const brim = new THREE.CylinderGeometry(0.19, 0.2, 0.012, 24); part(brim, M.coyote, head, 0, 0.075, 0.005);
    const crown = new THREE.CylinderGeometry(0.105, 0.118, 0.08, 20); part(crown, M.coyote, head, 0, 0.115, 0.005);
    part(band(0.119, 0.02), M.olive, head, 0, 0.09, 0.005);
    beard(); hairCap(0.5);
    const scarf = new THREE.TorusGeometry(0.08, 0.035, 8, 18); scarf.rotateX(Math.PI / 2); part(scarf, M.camoDesert, head, 0, -0.12, 0.0);
  } else if (head === 'balaclava') {
    const sk = new THREE.SphereGeometry(0.108, 20, 14); sk.scale(0.95, 1.12, 1.08); part(sk, M.black, head, 0, 0.015, 0);
    part(box(0.13, 0.03, 0.02, 0.01), M.lens, head, 0, 0.022, -0.103);
    // face print: a pale lower mask plate
    part(box(0.11, 0.07, 0.03, 0.012), M.tee, head, 0, -0.04, -0.095);
    headset();
  } else if (head === 'beret') {
    hairCap(0.55);
    const b = new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.35); b.scale(1.05, 0.55, 1.05); part(b, M.red, head, 0.02, 0.085, 0.0, 0, 0, -0.25);
    part(band(0.108, 0.02, 1.08), M.nylonBlack, head, 0, 0.07, 0.0);
  } else if (head === 'bare') {
    hairCap(0.62); if (r() < 0.7) beard();
    if (r() < 0.5) headset();
  } else {
    // gas mask with hood
    const hood = new THREE.SphereGeometry(0.135, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62); hood.scale(1, 1.08, 1.12); part(hood, M.olive, head, 0, 0.015, 0.02);
    const mask = lathe([[0.0, 0.0], [0.09, 0.0], [0.105, 0.05], [0.095, 0.11], [0.0, 0.12]], 16); mask.rotateX(-Math.PI / 2 - 0.15); mask.scale(1, 1, 0.8); part(mask, M.rubber, head, 0, -0.03, -0.06);
    for (const sx of [-1, 1]) { const lens = cylinder(0.032, 0.02, 14); lens.rotateX(Math.PI / 2 - 0.25); part(lens, M.lens, head, sx * 0.045, 0.02, -0.105); }
    const filt = cylinder(0.045, 0.06, 14); filt.rotateX(Math.PI / 2 + 0.5); part(filt, M.metal, head, 0.05, -0.07, -0.15);
    eyeGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.025), M.lensHot); eyeGlow.position.set(0, 0.02, -0.118); head.add(eyeGlow);
  }
  if (!eyeGlow) { eyeGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.012), M.lensHot); eyeGlow.position.set(-0.07, -0.04, -0.12); head.add(eyeGlow); }
  eyeGlow.visible = false;
  return eyeGlow;
}

function buildCarrier(spine, M, A, r, H, bulk) {
  const c = M[A.carrier];
  const front = box(0.3 * bulk, 0.3 * H, 0.05, 0.015); part(front, c, spine, 0, 0.28 * H, -0.135 * bulk);
  const back = box(0.3 * bulk, 0.32 * H, 0.05, 0.015); part(back, c, spine, 0, 0.29 * H, 0.13 * bulk);
  for (const sx of [-1, 1]) {
    part(box(0.05, 0.14, 0.27 * bulk, 0.012), c, spine, sx * 0.19 * bulk, 0.2 * H, 0); // cummerbund
    part(box(0.06, 0.03, 0.27 * bulk, 0.01), c, spine, sx * 0.1, 0.45 * H, 0); // shoulder straps
  }
  // MOLLE rows
  for (let i = 0; i < 4; i++) part(box(0.29 * bulk, 0.008, 0.01, 0.002), M.webbing, spine, 0, 0.17 * H + i * 0.05, -0.163 * bulk);
  // magazine pouches with mags poking out, or a chest rig
  const n = r() < 0.5 ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.075;
    part(box(0.065, 0.12, 0.05, 0.012), c, spine, x, 0.17 * H, -0.18 * bulk);
    part(box(0.067, 0.03, 0.055, 0.008), c, spine, x, 0.235 * H, -0.18 * bulk);
    if (r() < 0.6) part(box(0.045, 0.03, 0.022, 0.004), M.poly, spine, x, 0.255 * H, -0.18 * bulk);
  }
  // admin pouch, radio with antenna, grenades, tourniquet
  part(box(0.12, 0.08, 0.03, 0.01), c, spine, -0.04, 0.34 * H, -0.168 * bulk);
  part(box(0.06, 0.13, 0.05, 0.01), M.poly, spine, 0.16 * bulk, 0.33 * H, -0.13 * bulk);
  const ant = new THREE.CylinderGeometry(0.004, 0.004, 0.32, 5); part(ant, M.poly, spine, 0.16 * bulk, 0.52 * H, -0.12 * bulk, 0.1, 0, -0.1);
  for (let i = 0; i < 2; i++) { const g = cylinder(0.022, 0.08, 12); part(g, i ? M.red : M.olive, spine, -0.15 * bulk + i * 0.05, 0.12 * H, -0.19 * bulk); }
  part(box(0.03, 0.09, 0.03, 0.01), M.red, spine, 0.06, 0.4 * H, -0.168 * bulk);
  // hydration pack or backpack
  if (r() < 0.5) part(box(0.24, 0.32, 0.12, 0.04), c, spine, 0, 0.3 * H, 0.21 * bulk);
}

export function buildRaider(seed) {
  const r = rng('raider' + seed); const M = hmats();
  const A = ARCH[Math.floor(r() * ARCH.length) % ARCH.length];
  const H = r.range(0.95, 1.06), bulk = r.range(0.95, 1.12);
  const top = M[A.top], pants = M[A.pants], gloves = M[A.gloves];
  const J = (name, parent, x, y, z) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
  const root = new THREE.Group();
  const hips = J('hips', root, 0, 0.98 * H, 0);
  const spine = J('spine', hips, 0, 0.1, 0);
  const chest = J('chest', spine, 0, 0.22 * H, 0);
  const neck = J('neck', chest, 0, 0.24 * H, 0.01);
  const head = J('head', neck, 0, 0.1, 0);
  // pelvis, belt kit
  part(box(0.34 * bulk, 0.2, 0.22 * bulk, 0.06), pants, hips);
  part(band(0.18 * bulk, 0.05, 0.68), M.webbing, hips, 0, 0.06, 0);
  part(box(0.06, 0.05, 0.02, 0.008), M.metal, hips, 0, 0.06, -0.125 * bulk);
  for (const sx of [-1, 1]) part(box(0.07, 0.09, 0.05, 0.012), M[A.carrier], hips, sx * 0.15 * bulk, 0.02, 0.08);
  // torso (jacket or tee) with collar
  const torso = lathe([[0.0, -0.02], [0.17, 0.0], [0.19, 0.12], [0.215, 0.3], [0.2, 0.42], [0.12, 0.47], [0.0, 0.48]].map(([a, b]) => [a * bulk, b * H]), 18);
  torso.scale(1, 1, 0.7); part(torso, top, spine);
  const collar = new THREE.TorusGeometry(0.075, 0.025, 8, 16); collar.rotateX(Math.PI / 2); part(collar, top, chest, 0, 0.22 * H, 0.0);
  buildCarrier(spine, M, A, r, H, bulk);
  const eyeGlow = buildHead(head, M, A, r);
  part(cylinder(0.05, 0.08, 12), A.head === 'gasmask' || A.head === 'balaclava' ? M.black : M.skin, neck, 0, 0.03, 0);
  // arms with sleeves (rolled for tees), elbow pads sometimes, gloves with knuckle pads
  const arm = (sx) => {
    const sh = J('shoulder', chest, sx * 0.2 * bulk, 0.2 * H, 0);
    part(new THREE.SphereGeometry(0.075 * bulk, 12, 10), top, sh);
    const up = J('upper', sh, 0, 0, 0);
    part(limb(0.065 * bulk, 0.052, 0.29 * H, 0.9, 0.06, A.top === 'tee' ? 0 : 0.03, sx + seed.length), A.top === 'tee' ? M.skin : top, up);
    if (A.top === 'tee') part(band(0.07 * bulk, 0.1), top, up, 0, -0.04, 0);
    const el = J('elbow', up, 0, -0.29 * H, 0);
    part(limb(0.05, 0.04, 0.26 * H, 0.9, 0.05, A.top === 'tee' ? 0 : 0.025, sx * 3), A.top === 'tee' ? M.skin : top, el);
    if (r() < 0.4) part(box(0.08, 0.07, 0.07, 0.025), M.rubber, el, 0, 0.0, 0.02);
    const wr = J('wrist', el, 0, -0.27 * H, 0);
    part(band(0.045, 0.04), gloves, wr, 0, 0.0, 0);
    part(box(0.05, 0.085, 0.09, 0.022), gloves, wr, 0, -0.05, -0.01);
    part(box(0.02, 0.05, 0.07, 0.008), M.rubber, wr, sx * 0.028, -0.05, -0.01);
    for (let f = 0; f < 4; f++) { const fg = new THREE.CapsuleGeometry(0.009, 0.035, 3, 6); part(fg, gloves, wr, -0.015 + f * 0.012, -0.11, -0.03, 0.5, 0, 0); }
    return { sh, up, el, wr };
  };
  const L = arm(-1), R = arm(1);
  // legs: cargo pockets, knee pads, leg straps, drop-leg holster, bloused boots with laces
  const leg = (sx) => {
    const th = J('thigh', hips, sx * 0.1 * bulk, -0.06, 0);
    part(limb(0.088 * bulk, 0.062, 0.42 * H, 0.9, 0.1, 0.035, sx * 7), pants, th);
    part(box(0.04, 0.13, 0.13, 0.02), pants, th, sx * 0.082, -0.22 * H, -0.01);
    part(box(0.042, 0.03, 0.135, 0.01), pants, th, sx * 0.083, -0.16 * H, -0.01);
    if (sx === 1) { part(band(0.083, 0.025), M.webbing, th, 0, -0.12, 0); part(band(0.075, 0.025), M.webbing, th, 0, -0.26, 0); part(box(0.05, 0.2, 0.09, 0.015), M[A.carrier], th, 0.09, -0.18, 0.0); part(box(0.035, 0.06, 0.05, 0.01), M.poly, th, 0.09, -0.06, 0.02); }
    const kn = J('knee', th, 0, -0.42 * H, 0);
    part(limb(0.062, 0.05, 0.4 * H, 0.9, 0.08, 0.03, sx * 11), pants, kn);
    const pad = new THREE.SphereGeometry(0.07, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5); pad.rotateX(-Math.PI / 2); pad.scale(0.9, 1.1, 0.55); part(pad, M.rubber, kn, 0, -0.02, -0.035);
    part(band(0.066, 0.02), M.webbing, kn, 0, -0.08, 0);
    const an = J('ankle', kn, 0, -0.42 * H, 0);
    part(limb(0.062, 0.058, 0.13, 0.95, 0, 0), M.boot, an, 0, 0.12, 0);
    const foot = box(0.1, 0.09, 0.27, 0.035); part(foot, M.boot, an, 0, -0.035, -0.05);
    part(box(0.115, 0.035, 0.29, 0.012), M.rubber, an, 0, -0.09, -0.05);
    for (let i = 0; i < 4; i++) part(box(0.05, 0.006, 0.012, 0.002), M.webbing, an, 0, 0.0 + i * 0.03, -0.065);
    return { th, kn, an };
  };
  const LL = leg(-1), RL = leg(1);
  // rifle from interchangeable parts
  const gun = new THREE.Group(); chest.add(gun); gun.position.set(0.08, 0.02, -0.28);
  const { group: rifle, muzzleZ } = buildRifleParts(r, { gun: M.gun, metal: M.metal, poly: M.poly });
  gun.add(rifle);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.01, muzzleZ); gun.add(muzzle);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, j: { hips, spine, chest, neck, head }, L, R, LL, RL, gun, muzzle, eyeGlow, H, arch: A.name };
}

// Procedural animation. st: { speed, phase, dirLocal(Vector2 x right, y forward), aim, fire, hit, dead, t }
export function animateRaider(m, st, dt) {
  const sp = clamp(st.speed / 4.5, 0, 1.4);
  const ph = st.phase;
  const fwd = st.dirLocal ? st.dirLocal.y : 1, side = st.dirLocal ? st.dirLocal.x : 0;
  const sw = Math.sin(ph) * sp, sw2 = Math.sin(ph + Math.PI) * sp;
  const lift = (s) => Math.max(0, s);
  const idle = Math.sin(st.t * 1.6) * (1 - Math.min(1, sp * 3));
  const legAnim = (Lg, s) => {
    Lg.th.rotation.x = s * 0.7 * fwd; Lg.th.rotation.z = s * 0.35 * side;
    Lg.kn.rotation.x = -((0.12 + lift(s) * 1.1) * sp + 0.06);
    Lg.an.rotation.x = 0.2 * lift(s) * sp;
  };
  legAnim(m.LL, sw); legAnim(m.RL, sw2);
  const bob = Math.abs(Math.cos(ph)) * 0.045 * sp;
  m.j.hips.position.y = 0.98 * m.H - 0.04 * st.aim - bob + 0.02 * sp + idle * 0.004;
  m.j.hips.rotation.y = Math.sin(ph) * 0.12 * sp;
  m.j.spine.rotation.x = -(0.12 * sp + 0.05 * st.aim); m.j.spine.rotation.y = -m.j.hips.rotation.y * 1.2;
  m.j.chest.rotation.x = 0.03 + st.fire * 0.08 + idle * 0.01;
  m.j.head.rotation.x = 0.1 * sp; m.j.head.rotation.y = 0;
  const ready = 1 - st.aim;
  m.R.up.rotation.set(0.75 + 0.35 * st.aim - ready * 0.3, 0, -0.3); m.R.el.rotation.set(1.35 - ready * 0.2, 0, 0);
  m.L.up.rotation.set(1.15 + 0.25 * st.aim - ready * 0.35, 0, 0.5); m.L.el.rotation.set(0.75, 0, -0.25);
  m.gun.rotation.set(ready * 0.55 + st.fire * 0.15, ready * 0.25, ready * 0.3);
  m.gun.position.set(0.06 + ready * 0.04, 0.02 - ready * 0.1, -0.3 + st.fire * 0.04);
  if (st.hit > 0) { m.j.spine.rotation.x += st.hit * 0.4; m.j.head.rotation.x -= st.hit * 0.3; }
  if (st.dead > 0) {
    const d = st.dead; const k = clamp(d * 2.2, 0, 1), f = clamp((d - 0.3) * 2, 0, 1);
    m.LL.kn.rotation.x = lerp(m.LL.kn.rotation.x, -1.6, k); m.RL.kn.rotation.x = lerp(m.RL.kn.rotation.x, -1.2, k);
    m.LL.th.rotation.x = lerp(m.LL.th.rotation.x, 1.0, k); m.RL.th.rotation.x = lerp(m.RL.th.rotation.x, 0.6, k);
    m.j.hips.position.y = lerp(m.j.hips.position.y, 0.22, f);
    m.j.hips.rotation.x = lerp(0, 1.45, f); m.j.spine.rotation.x = lerp(m.j.spine.rotation.x, 0.2, f);
    m.R.up.rotation.x = lerp(m.R.up.rotation.x, 2.4, f); m.L.up.rotation.x = lerp(m.L.up.rotation.x, 0.3, f);
    m.gun.visible = d < 0.35;
  }
}
