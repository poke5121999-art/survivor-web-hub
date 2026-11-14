// Human raiders: a jointed skeleton of lofted parts (rain jacket, plate carrier, cargo pants, boots,
// gas mask with hood) carrying a rifle. Procedural clips: idle, run (any direction), aim, fire recoil,
// hit flinch, death fall. Built per seed so silhouettes vary.
import * as THREE from '../vendor/three.module.min.js';
import { Kit, chamferBox, cylinder, lathe } from './kit.js';
import { mat, noMask } from './mats.js';
import { rng, clamp, damp, lerp } from './rng.js';

let HM = null;
function hmats() {
  if (HM) return HM;
  const b = { space: 'object', macro: 0.08, wetK: 1, env: 0.6 };
  HM = {
    jacketA: mat({ ...b, surf: 'fabric', scale: 3, color: 0x2d3a2c, wetRough: 0.4, nscale: 0.6 }),
    jacketB: mat({ ...b, surf: 'fabric', scale: 3, color: 0x3a3228, wetRough: 0.4, nscale: 0.6 }),
    jacketC: mat({ ...b, surf: 'fabric', scale: 3, color: 0x23272d, wetRough: 0.35, nscale: 0.6 }),
    pants: mat({ ...b, surf: 'fabric', scale: 3, color: 0x2a2c2a, wetRough: 0.5, nscale: 0.6 }),
    vest: mat({ ...b, surf: 'fabric', scale: 4, color: 0x3b3a2c, wetRough: 0.5 }),
    boot: mat({ ...b, surf: 'leather', scale: 6, color: 0x1c1915, wetRough: 0.3 }),
    rubber: mat({ ...b, surf: 'polymer', scale: 5, wetRough: 0.25 }),
    metal: mat({ ...b, surf: 'steel', scale: 6, roughK: 0.8 }),
    gun: mat({ ...b, surf: 'anodized', scale: 8, metalK: 0.3, roughK: 1.2 }),
    glove: mat({ ...b, surf: 'leather', scale: 8, color: 0x2a2620 }),
    lens: noMask(new THREE.MeshStandardMaterial({ color: 0x0b0f10, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.5 })),
    lensHot: noMask(new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.6, 0.2) })),
  };
  return HM;
}

// limb segment: lathe profile along -Y from the joint, slightly flattened
function limb(r0, r1, len, flat = 0.85, bulge = 0.08) {
  const p = []; const n = 10;
  for (let i = 0; i <= n; i++) { const t = i / n; const r = lerp(r0, r1, t) * (1 + Math.sin(t * Math.PI) * bulge); p.push([r, -t * len]); }
  p.unshift([0, 0.0001]); p.push([0, -len - 0.0001]);
  const g = lathe(p.map(([r, y]) => [r, y]), 14); g.scale(1, 1, flat);
  return g;
}
function part(geo, m) { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

export function buildRaider(seed) {
  const r = rng('raider' + seed); const M = hmats();
  const jacket = r.pick([M.jacketA, M.jacketB, M.jacketC]);
  const H = r.range(0.95, 1.06); // height scale
  const bulk = r.range(0.95, 1.12);
  const J = (name, parent, x, y, z) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
  const root = new THREE.Group();
  const hips = J('hips', root, 0, 0.98 * H, 0);
  const spine = J('spine', hips, 0, 0.1, 0);
  const chest = J('chest', spine, 0, 0.22 * H, 0);
  const neck = J('neck', chest, 0, 0.24 * H, 0.01);
  const head = J('head', neck, 0, 0.09, 0);
  // pelvis + torso
  hips.add(part(chamferBox(0.34 * bulk, 0.2, 0.22 * bulk, 0.06), M.pants));
  const torso = lathe([[0.0, -0.02], [0.17, 0.0], [0.19, 0.12], [0.215, 0.3], [0.2, 0.42], [0.12, 0.47], [0.0, 0.48]].map(([a, b]) => [a * bulk, b * H]), 18);
  torso.scale(1, 1, 0.7); spine.add(part(torso, jacket));
  // plate carrier with pouches
  const vest = chamferBox(0.38 * bulk, 0.34 * H, 0.3 * bulk, 0.04); vest.translate(0, 0.27 * H, 0.0); spine.add(part(vest, M.vest));
  for (let i = 0; i < 3; i++) { const p = chamferBox(0.09, 0.12, 0.06, 0.015); p.translate((i - 1) * 0.11, 0.18 * H, -0.17 * bulk); spine.add(part(p, M.vest)); }
  const radio = chamferBox(0.06, 0.14, 0.05, 0.01); radio.translate(0.16, 0.38 * H, -0.12); spine.add(part(radio, M.rubber));
  if (r() < 0.6) { const pack = chamferBox(0.3, 0.4, 0.16, 0.05); pack.translate(0, 0.28 * H, 0.22 * bulk); spine.add(part(pack, M.vest)); }
  // hood + gas mask (faces stay hidden, like the reference soldiers)
  const skull = new THREE.SphereGeometry(0.115, 18, 14); skull.scale(0.95, 1.08, 1.05); head.add(part(skull, jacket));
  const hood = new THREE.SphereGeometry(0.135, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62); hood.scale(1, 1.05, 1.12); hood.translate(0, 0.015, 0.02); head.add(part(hood, jacket));
  const mask = lathe([[0.0, 0.0], [0.09, 0.0], [0.105, 0.05], [0.095, 0.11], [0.0, 0.12]], 16); mask.rotateX(-Math.PI / 2 - 0.15); mask.scale(1, 1, 0.8); mask.translate(0, -0.03, -0.06); head.add(part(mask, M.rubber));
  for (const sx of [-1, 1]) { const lens = cylinder(0.032, 0.02, 14); lens.rotateX(Math.PI / 2 - 0.25); lens.translate(sx * 0.045, 0.02, -0.105); head.add(part(lens, M.lens)); }
  const filt = cylinder(0.045, 0.06, 14); filt.rotateX(Math.PI / 2 + 0.5); filt.translate(r.sign() * 0.05, -0.07, -0.15); head.add(part(filt, M.metal));
  const eyeGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.025), M.lensHot); eyeGlow.position.set(0, 0.02, -0.118); eyeGlow.visible = false; head.add(eyeGlow);
  // arms
  const arm = (sx) => {
    const sh = J('shoulder', chest, sx * 0.2 * bulk, 0.2 * H, 0);
    sh.add(part(new THREE.SphereGeometry(0.075 * bulk, 12, 10), jacket));
    const up = J('upper', sh, 0, 0, 0); up.add(part(limb(0.06 * bulk, 0.05, 0.29 * H), jacket));
    const el = J('elbow', up, 0, -0.29 * H, 0); el.add(part(limb(0.05, 0.04, 0.26 * H, 0.9, 0.05), jacket));
    const cuff = cylinder(0.046, 0.04, 12); cuff.translate(0, -0.24 * H, 0); el.add(part(cuff, M.vest));
    const wr = J('wrist', el, 0, -0.27 * H, 0);
    const hand = chamferBox(0.05, 0.09, 0.09, 0.02); hand.translate(0, -0.05, -0.01); wr.add(part(hand, M.glove));
    return { sh, up, el, wr };
  };
  const L = arm(-1), R = arm(1);
  // legs
  const leg = (sx) => {
    const th = J('thigh', hips, sx * 0.1 * bulk, -0.06, 0); th.add(part(limb(0.085 * bulk, 0.06, 0.42 * H, 0.9, 0.1), M.pants));
    const pocket = chamferBox(0.04, 0.14, 0.12, 0.02); pocket.translate(sx * 0.08, -0.22 * H, -0.01); th.add(part(pocket, M.pants));
    const kn = J('knee', th, 0, -0.42 * H, 0); kn.add(part(limb(0.06, 0.045, 0.42 * H, 0.9, 0.08), M.pants));
    const pad = chamferBox(0.08, 0.1, 0.04, 0.02); pad.translate(0, -0.02, -0.055); kn.add(part(pad, M.rubber));
    const an = J('ankle', kn, 0, -0.42 * H, 0);
    const boot = chamferBox(0.1, 0.11, 0.26, 0.035); boot.translate(0, -0.03, -0.05); an.add(part(boot, M.boot));
    const sole = chamferBox(0.11, 0.03, 0.28, 0.01); sole.translate(0, -0.09, -0.05); an.add(part(sole, M.rubber));
    return { th, kn, an };
  };
  const LL = leg(-1), RL = leg(1);
  // rifle held across the chest
  const gun = new THREE.Group(); chest.add(gun); gun.position.set(0.08, 0.02, -0.28); gun.rotation.set(0, 0.0, 0);
  const gk = new Kit();
  gk.box(0.05, 0.07, 0.3, 'gun', 0, 0, 0, 0.008); gk.box(0.045, 0.05, 0.34, 'gun', 0, 0.005, -0.3, 0.006);
  gk.cyl(0.01, 0.2, 'metal', 0, 0.01, -0.55, 8, 'z'); gk.box(0.04, 0.16, 0.05, 'gun', 0, -0.1, -0.08, 0.008);
  gk.box(0.035, 0.12, 0.04, 'gun', 0, -0.08, 0.06, 0.008); gk.box(0.05, 0.08, 0.22, 'gun', 0, -0.01, 0.24, 0.01);
  gk.box(0.03, 0.035, 0.08, 'gun', 0, 0.06, -0.05, 0.006);
  gun.add(gk.build({ gun: M.gun, metal: M.metal }));
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.01, -0.66); gun.add(muzzle);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, j: { hips, spine, chest, neck, head }, L, R, LL, RL, gun, muzzle, eyeGlow, H };
}

// Procedural animation. st: { speed, dirLocal(Vector2: x right, y forward), aim(0..1), fire(0..1 recoil), hit(0..1), dead(0..1), t }
export function animateRaider(m, st, dt) {
  const t = st.t; const sp = clamp(st.speed / 4.5, 0, 1.4);
  const ph = st.phase;
  const fwd = st.dirLocal ? st.dirLocal.y : 1, side = st.dirLocal ? st.dirLocal.x : 0;
  const sw = Math.sin(ph) * sp, sw2 = Math.sin(ph + Math.PI) * sp;
  const lift = (s) => Math.max(0, s);
  // legs: thigh swing along the travel direction, knees bend on the forward swing
  const legAnim = (Lg, s) => {
    Lg.th.rotation.x = -s * 0.7 * fwd; Lg.th.rotation.z = s * 0.35 * side;
    Lg.kn.rotation.x = -((0.15 + lift(s) * 1.1) * sp + 0.05);
    Lg.an.rotation.x = 0.2 * lift(s) * sp;
  };
  legAnim(m.LL, sw); legAnim(m.RL, sw2);
  // crouch slightly while aiming, bob while running
  const bob = Math.abs(Math.cos(ph)) * 0.045 * sp;
  m.j.hips.position.y = 0.98 * m.H - 0.04 * st.aim - bob + 0.02 * sp;
  m.j.hips.rotation.y = Math.sin(ph) * 0.12 * sp;
  m.j.spine.rotation.x = -(0.12 * sp + 0.05 * st.aim); m.j.spine.rotation.y = -m.j.hips.rotation.y * 1.2;
  m.j.chest.rotation.x = 0.03 + st.fire * 0.08;
  m.j.head.rotation.x = 0.1 * sp; m.j.head.rotation.y = 0;
  // arms hold the rifle: right hand on the grip, left on the handguard; low ready while running
  const ready = 1 - st.aim;
  m.R.up.rotation.set(0.75 + 0.35 * st.aim - ready * 0.3, 0, -0.3); m.R.el.rotation.set(1.35 - ready * 0.2, 0, 0);
  m.L.up.rotation.set(1.15 + 0.25 * st.aim - ready * 0.35, 0, 0.5); m.L.el.rotation.set(0.75, 0, -0.25);
  m.gun.rotation.set(ready * 0.55 + st.fire * 0.15, ready * 0.25, ready * 0.3);
  m.gun.position.set(0.06 + ready * 0.04, 0.02 - ready * 0.1, -0.3 + st.fire * 0.04);
  // hit flinch
  if (st.hit > 0) { m.j.spine.rotation.x += st.hit * 0.4; m.j.head.rotation.x -= st.hit * 0.3; }
  // death: fold at the knees, then fall backwards onto the ground
  if (st.dead > 0) {
    const d = st.dead;
    const k = clamp(d * 2.2, 0, 1), f = clamp((d - 0.3) * 2, 0, 1);
    m.LL.kn.rotation.x = lerp(m.LL.kn.rotation.x, -1.6, k); m.RL.kn.rotation.x = lerp(m.RL.kn.rotation.x, -1.2, k);
    m.LL.th.rotation.x = lerp(m.LL.th.rotation.x, 1.0, k); m.RL.th.rotation.x = lerp(m.RL.th.rotation.x, 0.6, k);
    m.j.hips.position.y = lerp(m.j.hips.position.y, 0.22, f);
    m.j.hips.rotation.x = lerp(0, 1.45, f); m.j.spine.rotation.x = lerp(m.j.spine.rotation.x, 0.2, f);
    m.R.up.rotation.x = lerp(m.R.up.rotation.x, 2.4, f); m.L.up.rotation.x = lerp(m.L.up.rotation.x, 0.3, f);
    m.gun.visible = d < 0.35;
  }
}
