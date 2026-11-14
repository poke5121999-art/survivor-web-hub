// First-person carbine and gloved hands, built from extruded profiles, lathes and chamfered boxes.
// Gun space: barrel along -Z, +Y up, +X right, metres. Origin near the magwell.
import * as THREE from '../vendor/three.module.min.js';
import { Kit, chamferBox, cylinder, lathe, extrude, roundRect } from './kit.js';
import { mat, noMask } from './mats.js';

// profile drawn in (forward, up); extruded across X with thickness t, centred at x0
function side(points, t, bevel, holes) {
  const s = new THREE.Shape(); s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else s.lineTo(p[0], p[1]);
  }
  if (holes) for (const h of holes) s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 12 });
  g.translate(0, 0, -t / 2);
  g.rotateY(Math.PI / 2); // shape +x (forward) -> -Z, extrusion -> X
  return g;
}
function slot(cx, cy, w, h) {
  const p = new THREE.Path(); const r = h / 2;
  p.moveTo(cx - w / 2 + r, cy - r); p.lineTo(cx + w / 2 - r, cy - r); p.absarc(cx + w / 2 - r, cy, r, -Math.PI / 2, Math.PI / 2, false);
  p.lineTo(cx - w / 2 + r, cy + r); p.absarc(cx - w / 2 + r, cy, r, Math.PI / 2, Math.PI * 1.5, false);
  return p;
}
const F = (z) => -z; // forward coordinate -> gun Z

export function gunMaterials() {
  const base = { space: 'object', drops: true, macro: 0.05, env: 0.35 };
  return {
    anod: mat({ ...base, surf: 'anodized', scale: 9, metalK: 0.3, roughK: 1.25, wetRough: 0.2 }),
    phos: mat({ ...base, surf: 'phosphate', scale: 10, metalK: 0.7, wetRough: 0.22 }),
    poly: mat({ ...base, surf: 'polymer', scale: 7, wetRough: 0.3 }),
    polyTan: mat({ ...base, surf: 'polymer', scale: 7, paint: 0xffffff, env: 0.8 }),
    steel: mat({ ...base, surf: 'steel', scale: 12, roughK: 0.6 }),
    glove: mat({ ...base, surf: 'fabric', scale: 3, color: 0x3b362e, drops: true, wetRough: 0.55, nscale: 0.5 }),
    leather: mat({ ...base, surf: 'leather', scale: 8, color: 0x2a2520, wetRough: 0.35 }),
    sleeve: mat({ ...base, surf: 'fabric', scale: 2, color: 0x1a2026, drops: true, roughK: 0.85, wetRough: 0.42, nscale: 0.5 }),
    lens: noMask(new THREE.MeshPhysicalMaterial({ color: 0x0a1a12, roughness: 0.02, metalness: 0.0, transmission: 0, envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.55, depthWrite: false })),
  };
}

export const MAG_PIVOT = new THREE.Vector3(0, -0.02, F(0.057));
export function buildMag() {
  const k = new Kit();
  const mag = [[0.026, -0.02], [0.088, -0.02], [0.098, -0.12, 0.122, -0.22], [0.068, -0.235], [0.05, -0.13, 0.03, -0.02]];
  k.add(side(mag, 0.026, 0.003), 'poly');
  for (let i = 0; i < 6; i++) { const t = i / 6; k.box(0.0275, 0.003, 0.004, 'poly', 0, -0.06 - t * 0.14, F(0.05 + t * t * 0.06 + 0.016), 0.001); }
  k.add(side([[0.066, -0.232], [0.126, -0.218], [0.13, -0.228], [0.07, -0.245]], 0.03, 0.002), 'poly');
  return k;
}

export function buildCarbine() {
  const k = new Kit();
  // ---- upper receiver
  k.add(side([[-0.12, 0.0], [0.135, 0.0], [0.135, 0.046], [0.11, 0.05], [-0.1, 0.05], [-0.125, 0.04], [-0.125, 0.0]], 0.036, 0.0025), 'anod');
  // top rail: base + teeth from receiver back to handguard end
  k.box(0.024, 0.008, 0.56, 'anod', 0, 0.056, F(0.15), 0.0015);
  for (let i = 0; i < 52; i++) k.box(0.022, 0.004, 0.0052, 'anod', 0, 0.0625, F(-0.11 + i * 0.0102), 0.0008);
  // ejection port, dust cover, forward assist, brass deflector
  k.box(0.004, 0.018, 0.05, 'phos', 0.0185, 0.026, F(0.02), 0.001);
  k.box(0.003, 0.02, 0.054, 'anod', 0.0205, 0.026, F(0.02), 0.0008);
  k.cyl(0.0065, 0.026, 'anod', 0.017, 0.032, F(-0.085), 14, 'z');
  k.box(0.012, 0.016, 0.02, 'anod', 0.019, 0.038, F(-0.035), 0.003);
  // charging handle
  k.box(0.014, 0.008, 0.03, 'anod', 0, 0.051, F(-0.14), 0.002);
  k.box(0.05, 0.008, 0.012, 'anod', 0, 0.051, F(-0.152), 0.003);
  // ---- lower receiver with magwell and trigger guard
  k.add(side([[-0.105, 0.0], [0.11, 0.0], [0.11, -0.012], [0.095, -0.02], [0.092, -0.078], [0.025, -0.078], [0.022, -0.03], [-0.04, -0.03], [-0.07, -0.02], [-0.105, -0.018]], 0.034, 0.0025), 'anod');
  k.add(side([[-0.055, -0.03], [0.03, -0.03], [0.03, -0.05], [0.022, -0.056], [-0.05, -0.056], [-0.055, -0.05]], 0.012, 0.0015, [slot(-0.012, -0.043, 0.07, 0.016)]), 'anod');
  // trigger, selector, mag release, bolt catch
  k.add(side([[-0.006, -0.028], [0.002, -0.028], [0.0, -0.042, -0.006, -0.05], [-0.01, -0.05], [-0.004, -0.04, -0.006, -0.028]], 0.006, 0.001), 'steel');
  k.box(0.004, 0.006, 0.022, 'steel', -0.019, -0.008, F(-0.07), 0.001);
  k.cyl(0.006, 0.004, 'steel', -0.019, -0.008, F(-0.06), 12, 'x');
  k.box(0.004, 0.01, 0.01, 'steel', 0.019, -0.018, F(0.03), 0.0015);
  k.box(0.004, 0.024, 0.008, 'steel', -0.019, -0.005, F(0.005), 0.0015);
  // ---- pistol grip (stippled polymer)
  k.add(side([[-0.045, -0.02], [-0.012, -0.02], [-0.022, -0.05], [-0.05, -0.135], [-0.058, -0.142], [-0.088, -0.14], [-0.092, -0.128], [-0.07, -0.06, -0.068, -0.03], [-0.06, -0.02]], 0.03, 0.004), 'poly');
  for (let i = 0; i < 3; i++) k.box(0.031, 0.004, 0.012, 'poly', 0, -0.06 - i * 0.022, F(-0.024 - i * 0.008), 0.0015);
  // ---- buffer tube and stock
  k.cyl(0.0165, 0.2, 'anod', 0, 0.026, F(-0.21), 20, 'z');
  for (let i = 0; i < 6; i++) k.box(0.006, 0.006, 0.008, 'anod', 0, 0.006, F(-0.16 - i * 0.022), 0.001);
  k.add(side([[-0.19, 0.045], [-0.34, 0.052], [-0.355, 0.05], [-0.36, -0.07], [-0.345, -0.078], [-0.3, -0.06], [-0.22, -0.01], [-0.19, 0.0]], 0.04, 0.005, [slot(-0.3, -0.02, 0.06, 0.03)]), 'poly');
  k.box(0.046, 0.13, 0.012, 'leather', 0, -0.012, F(-0.362), 0.004);
  // ---- handguard: four panels around the barrel, M-LOK slots, rail on top
  const HG0 = 0.135, HG1 = 0.43, len = HG1 - HG0;
  const holes = []; for (let i = 0; i < 6; i++) holes.push(slot(HG0 + 0.04 + i * 0.043, 0.024, 0.03, 0.008));
  for (const sx of [-1, 1]) {
    const pg = side([[HG0, 0.004], [HG1, 0.004], [HG1, 0.046], [HG0, 0.046]], 0.004, 0.0012, holes); pg.translate(sx * 0.026, 0, 0);
    k.add(pg, 'anod');
  }
  k.box(0.046, 0.004, len, 'anod', 0, 0.002, F((HG0 + HG1) / 2), 0.0012);
  for (const sx of [-1, 1]) for (const sy of [0, 1]) k.cyl(0.0045, len, 'anod', sx * 0.023, sy ? 0.047 : 0.004, F((HG0 + HG1) / 2), 10, 'z');
  k.box(0.05, 0.008, len, 'anod', 0, 0.05, F((HG0 + HG1) / 2), 0.0015);
  k.box(0.054, 0.056, 0.012, 'anod', 0, 0.026, F(HG0 + 0.003), 0.003);
  // inner barrel + gas tube visible through slots
  k.cyl(0.0095, 0.45, 'phos', 0, 0.026, F(0.35), 18, 'z');
  k.cyl(0.003, 0.25, 'steel', 0, 0.04, F(0.28), 8, 'z');
  // ---- muzzle brake with ports
  const mb = lathe([[0.0, 0.0], [0.0125, 0.0], [0.0135, 0.004], [0.0135, 0.058], [0.012, 0.062], [0.007, 0.062], [0.0, 0.062]], 20); mb.rotateX(-Math.PI / 2);
  k.push().at(0, 0.026, F(0.56)); k.add(mb, 'phos');
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) k.box(0.004, 0.007, 0.009, 'poly', sx * 0.0125, 0.0, -0.014 - i * 0.015, 0.001);
  k.pop();
  // ---- red dot sight on the rail
  k.box(0.026, 0.012, 0.05, 'anod', 0, 0.071, F(0.0), 0.002);
  k.box(0.034, 0.006, 0.012, 'steel', 0.0, 0.066, F(-0.012), 0.001);
  const hood = lathe([[0.0185, -0.03], [0.0195, -0.028], [0.0195, 0.028], [0.0185, 0.03], [0.0165, 0.03], [0.0165, -0.03]], 28); hood.rotateX(Math.PI / 2);
  k.push().at(0, 0.096, F(0.005)); k.add(hood, 'anod'); k.pop();
  k.cyl(0.0075, 0.012, 'anod', 0, 0.118, F(0.0), 14);
  k.cyl(0.0075, 0.012, 'anod', 0.022, 0.096, F(0.0), 14, 'x');
  k.box(0.03, 0.012, 0.044, 'anod', 0, 0.0815, F(0.005), 0.003);
  return k;
}

// Gloved hand from a palm and capsule finger chains. side: 1 right, -1 left.
// pose: { curl: [index, middle, ring, little] radians per joint, thumb: [yaw, curl] }
export function buildHand(k, sideSign, pose, opts = {}) {
  // hand space: palm faces -X for the right hand, fingers along -Z, back of hand +X
  const s = sideSign;
  k.box(0.026, 0.078, 0.086, 'glove', 0, 0, 0, 0.011);
  k.box(0.006, 0.07, 0.07, 'leather', s * 0.013, 0.0, 0.005, 0.003);
  const fingers = [
    { y: 0.028, len: [0.044, 0.027, 0.022], r: 0.0095 },
    { y: 0.009, len: [0.048, 0.03, 0.023], r: 0.0098 },
    { y: -0.01, len: [0.045, 0.028, 0.022], r: 0.0094 },
    { y: -0.028, len: [0.036, 0.022, 0.019], r: 0.0086 },
  ];
  fingers.forEach((f, i) => {
    const curl = pose.curl[i];
    k.push().at(0, f.y, -0.043);
    for (let j = 0; j < 3; j++) {
      k.at(0, 0, 0, 0, 0, 0);
      k.m.multiply(new THREE.Matrix4().makeRotationY(-s * curl[j]));
      const L = f.len[j];
      const g = new THREE.CapsuleGeometry(f.r * (1 - j * 0.07), L, 4, 10); g.rotateX(Math.PI / 2); g.translate(0, 0, -L / 2);
      k.add(g, 'glove');
      if (j === 0) { const pad = chamferBox(0.008, 0.016, 0.018, 0.003); pad.translate(s * 0.008, 0, -L * 0.45); k.add(pad, 'leather'); }
      k.at(0, 0, -L);
    }
    k.pop();
  });
  // thumb
  k.push().at(-s * 0.006, 0.03, -0.01);
  k.m.multiply(new THREE.Matrix4().makeRotationZ(s * pose.thumb[0])).multiply(new THREE.Matrix4().makeRotationY(-s * 0.9));
  for (let j = 0; j < 2; j++) {
    k.m.multiply(new THREE.Matrix4().makeRotationY(-s * pose.thumb[1]));
    const L = j === 0 ? 0.036 : 0.026;
    const g = new THREE.CapsuleGeometry(0.0105, L, 4, 10); g.rotateX(Math.PI / 2); g.translate(0, 0, -L / 2); k.add(g, 'glove');
    k.at(0, 0, -L);
  }
  k.pop();
  // cuff and sleeve going back toward the camera
  k.push().at(0, 0, opts.watch ? 0.07 : 0.05);
  const cuff = cylinder(0.042, 0.04, 20); cuff.rotateX(Math.PI / 2); cuff.scale(0.75, 1, 1); k.add(cuff, 'glove');
  if (opts.watch) { const band = cylinder(0.04, 0.018, 20); band.rotateX(Math.PI / 2); band.scale(0.78, 1, 1); band.translate(0, 0, 0.03); k.add(band, 'leather'); const face = cylinder(0.014, 0.008, 18); face.rotateZ(Math.PI / 2); face.translate(sideSign * 0.033, 0, 0.03); k.add(face, 'steel'); }
  const SL = opts.sleeve || 0.36;
  const prof = []; for (let i = 0; i <= 18; i++) { const t = i / 18; prof.push([0.046 + t * 0.024 + Math.sin(t * 23) * 0.0025, t * SL]); }
  const sl = lathe(prof, 22); sl.rotateX(Math.PI / 2);
  const p = sl.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(y, x); const fold = Math.sin(a * 3 + z * 40) * 0.004 + Math.sin(z * 70 + a) * 0.002;
    p.setXYZ(i, x * 0.82 + Math.cos(a) * fold, y + Math.sin(a) * fold, z + 0.012);
  }
  sl.computeVertexNormals();
  k.add(sl, 'sleeve');
  k.pop();
}

// hand frame from a position, the finger direction (local -Z) and the palm direction (local +X for the left hand)
function handBasis(pos, fingers, palm) {
  const z = fingers.clone().normalize().negate();
  const x = palm.clone().addScaledVector(z, -palm.dot(z)).normalize().negate();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(pos);
}

export function buildViewmodel() {
  const mats = gunMaterials();
  const gunKit = buildCarbine();
  const gun = gunKit.build(mats, { noShadow: true });
  // reticle: a glowing dot on the sight glass
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0165, 28), mats.lens);
  lens.position.set(0, 0.096, F(0.03)); lens.rotation.y = 0; gun.add(lens);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 12), noMask(new THREE.MeshBasicMaterial({ color: new THREE.Color(12, 0.4, 0.2), transparent: true, depthWrite: false })));
  dot.position.set(0, 0.096, F(0.0)); gun.add(dot);
  gun.userData.dot = dot;
  // magazine as its own piece so the reload can pull it out
  const mag = buildMag().build(mats, { noShadow: true });
  mag.children.forEach((m) => m.geometry.translate(-MAG_PIVOT.x, -MAG_PIVOT.y, -MAG_PIVOT.z));
  mag.position.copy(MAG_PIVOT); gun.add(mag);
  // right hand on the pistol grip
  const rk = new Kit();
  rk.push().at(0.0, -0.062, F(-0.06), 0, 0.3, 0);
  rk.m.multiply(new THREE.Matrix4().makeRotationZ(-0.18));
  buildHand(rk, 1, { curl: [[0.2, 0.25, 0.2], [1.25, 1.35, 0.9], [1.3, 1.4, 0.9], [1.3, 1.35, 0.9]], thumb: [0.6, 0.3] }, { sleeve: 0.4 });
  rk.pop();
  const rightHand = rk.build(mats, { noShadow: true });
  // left hand reaching under the handguard; built at its own origin so it can travel during reloads
  const lk = new Kit();
  buildHand(lk, -1, { curl: [[1.0, 1.1, 0.7], [1.05, 1.15, 0.7], [1.1, 1.15, 0.7], [1.1, 1.1, 0.7]], thumb: [0.2, 0.25] }, { watch: true, sleeve: 0.55 });
  const leftHand = lk.build(mats, { noShadow: true });
  const base = handBasis(new THREE.Vector3(-0.047, -0.012, F(0.285)), new THREE.Vector3(0.32, 0.5, -0.8), new THREE.Vector3(1, 0.35, 0));
  base.decompose(leftHand.position, leftHand.quaternion, leftHand.scale);
  leftHand.userData.basePos = leftHand.position.clone(); leftHand.userData.baseQ = leftHand.quaternion.clone();
  gun.add(leftHand); gun.add(rightHand);
  const hands = new THREE.Group();
  const root = new THREE.Group();
  root.add(gun); root.add(hands);
  root.userData = { gun, hands, mats, mag, leftHand, rightHand, muzzle: new THREE.Vector3(0, 0.026, F(0.63)), eject: new THREE.Vector3(0.022, 0.028, F(0.02)), sightY: 0.096 };
  root.traverse((o) => { o.castShadow = false; o.receiveShadow = true; });
  return root;
}
