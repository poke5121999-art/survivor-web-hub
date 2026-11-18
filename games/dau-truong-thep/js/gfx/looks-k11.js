// Looks, kit lane K11: Iron Man and Optimus Prime, remade with the kits ported from the owner's clips. Render only (see looks.js).
// One main colour and one accent per tank, one strong shape per skill, soft halos.
//   钢铁 p73 (Iron Man): a white-cyan particle shell that bursts into a crackling blue sphere; a cyan circle with a red cross-hair,
//     missiles dropping into it on smoke trails and going off in orange blasts; a thick orange-gold disintegration ray from the chest,
//     gold shock hoops running out along it, a reactor ring under him and a gold dome where it bites.
//   擎天 p45 (Optimus Prime): a red-hilted silver sword thrown down point first, standing in a wide steel-blue ring over an orange
//     floor; a blue slash band and a blue comet streak to the sword; an orange light pillar crashing down when the Knight forms,
//     then a blue glow on him while it lasts (his sword swings are the blue crescents of the 'wave' shot).
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, sigil, shell, trail, burst, pillar, slash } from './lookkit.js';
import { castStatic } from '../maps.js';

const R = (a, b) => a + Math.random() * (b - a);
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
const keep = (g) => { g.userData.keep = true; return g; };

// ---- Iron Man: orange-gold repulsor light, arc-reactor cyan accent ---------------------------------------------------------
const IM_GOLD = C(2.6, 1.35, 0.3), IM_HOT = C(2.6, 2.25, 1.5), IM_ARC = C(0.55, 1.7, 2.6), IM_ICE = C(1.9, 2.4, 2.6), IM_RED = C(2.3, 0.3, 0.12);
const IM_SMOKE = C(0.55, 0.52, 0.5), IM_SOOT = C(0.1, 0.08, 0.07);
// a small missile pointing down its +x axis: grey body, red nose ring, fins
const imMissileGeo = (() => {
  const body = keep(new THREE.CylinderGeometry(0.11, 0.12, 0.9, 10).rotateZ(Math.PI / 2));
  const nose = keep(new THREE.ConeGeometry(0.11, 0.32, 10).rotateZ(-Math.PI / 2).translate(0.6, 0, 0));
  const fin = keep(new THREE.BoxGeometry(0.24, 0.02, 0.46).translate(-0.36, 0, 0)), fin2 = keep(fin.clone().rotateX(Math.PI / 2));
  return { body, nose, fin, fin2 };
})();
function imMissile() {
  const g = new THREE.Group(), steel = new THREE.MeshBasicMaterial({ color: 0xd8dde4, toneMapped: false, transparent: true }), red = new THREE.MeshBasicMaterial({ color: 0xc8281c, toneMapped: false, transparent: true });
  g.add(new THREE.Mesh(imMissileGeo.body, steel), new THREE.Mesh(imMissileGeo.nose, red), new THREE.Mesh(imMissileGeo.fin, steel), new THREE.Mesh(imMissileGeo.fin2, steel));
  g.traverse((o) => { o.frustumCulled = false; o.renderOrder = 8; });
  return g;
}
// thin blue-white arcs jumping off a sphere of radius r
function imArcs(kit, x, y, z, r, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, e = R(-0.6, 0.6), cx = Math.cos(a) * Math.cos(e), cz = Math.sin(a) * Math.cos(e), cy = Math.sin(e);
    kit.str.emit(x + cx * r, y + cy * r, z + cz * r, -cz * 6 + cx * 2, R(-1, 1), cx * 6 + cz * 2, i % 3 ? IM_ARC : IM_ICE, 0.12, 0.05, 0.1, 0, 0, 1);
  }
}

// the ray's shock rings: gold hoops standing across the beam, running out along it
const imHoopGeo = keep(new THREE.TorusGeometry(1, 0.12, 8, 40));
function imHoops(kit, n) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.16), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const hoops = [];
  for (let i = 0; i < n; i++) { const me = new THREE.Mesh(imHoopGeo, mat); me.renderOrder = 8; hoops.push(me); }
  return { hoops, h: held(kit, hoops), mat };
}

const tho = {
  // Lạp Tử Năng Lượng: a white-cyan particle shell on a short cyan tail; on the first foe it blows into a crackling blue sphere
  // the size of the splash, a cyan ring on the floor
  imParticle: {
    skill(kit, e, u) {
      const ca = Math.cos(e.a), sa = Math.sin(e.a);
      kit.glow(u.x + ca * 1.3, 1.4, u.z + sa * 1.3, IM_ICE, 0.12, 1.8, 1, kit.K.STAR, 1.3);
      kit.glow(u.x + ca * 1.3, 1.4, u.z + sa * 1.3, IM_ARC, 0.25, 2.4, 0.8, kit.K.GLOW, 1.3);
      shell(kit, u.x + ca * 1.4, 1.3, u.z + sa * 1.4, 1.5, IM_ARC, { c2: IM_ICE, p: 1.4, core: 0.2, squash: 0.6, life: 0.4, grow: 0.06 });
      sigil(kit, u.x, u.z, 2.6, IM_ARC, { c2: IM_ICE, n: 0, ticks: 12, inner: 0.78, fill: 0.22, w: 0.08, life: 0.45, rev: 0.04, spin: 3, grow: 12 });
      return true;
    },
    shotMake(kit, s) {
      const v = { x: s.x, z: s.z, live: true };
      v.core = shell(kit, s.x, 1.35, s.z, 0.5, IM_ARC, { c2: IM_ICE, p: 1.2, core: 0.6, life: 1e9, add: true });
      v.halo = shell(kit, s.x, 1.35, s.z, 1.3, IM_ARC, { c2: IM_ARC, p: 1.8, core: 0.1, life: 1e9, pulse: 6 });
      trail(kit, () => (v.live ? [v.x, 1.35, v.z] : null), 1.1, IM_ARC, 1e9, { c2: C(0.08, 0.3, 0.7), len: 14 });
      return v;
    },
    shot(kit, v, s, x, y, z) {
      v.x = x; v.z = z; v.core.position.set(x, 1.35, z); v.halo.position.set(x, 1.35, z);
      if (Math.random() < 0.6) imArcs(kit, x, 1.35, z, 0.6, 1);
      return true;
    },
    shotEnd(kit, v, s, x, z) {
      v.live = false; stop(v.core); stop(v.halo);
      const r = s.splash || 2.5;
      shell(kit, x, 1.1, z, r, IM_ARC, { c2: IM_ICE, p: 1.5, core: 0.18, bands: 1.6, life: 0.55, grow: 0.12 });
      shell(kit, x, 1.1, z, r * 0.45, IM_ARC, { c2: IM_ICE, inv: 1.4, core: 0.8, life: 0.3 });
      sigil(kit, x, z, r * 1.1, IM_ARC, { c2: IM_ICE, n: 0, ticks: 18, inner: 0.82, fill: 0.2, w: 0.07, life: 0.6, rev: 0.05, spin: 2.4, grow: 9 });
      imArcs(kit, x, 1.1, z, r * 0.8, kit.N(16));
      kit.sparks(x, 1.2, z, kit.N(14), IM_ICE, 9, 0.4, 0.05, 0.6, 6);
      kit.flash(x, 1.6, z, IM_ARC, 45, 0.25); kit.kick(x, z, 0.3);
    },
  },
  // Phi Đạn Không Tập: a cyan circle with a red cross-hair over the area for the whole raid; each wave is a missile dropping on a smoke trail
  // somewhere in the circle and going off in an orange blast
  imMissiles: {
    zones: ['strike'], ownDisc: true,
    skill(kit, e, u) {
      for (let i = 0, n = kit.N(8); i < n; i++) kit.str.emit(u.x + R(-0.6, 0.6), 1.6, u.z + R(-0.6, 0.6), R(-1, 1), R(14, 22), R(-1, 1), i % 2 ? IM_GOLD : IM_HOT, 0.3, 0.12, 0.08, 0, 0, 1);
      kit.puffs(u.x, 1.2, u.z, kit.N(6), IM_SMOKE, 0.8, 3, 0.7, 1.0, 2.2, 1.5, 0.5, kit.K.SMOKE, 2.5);
      sigil(kit, u.x, u.z, 2.2, IM_GOLD, { c2: IM_HOT, n: 0, ticks: 8, inner: 0.7, fill: 0.2, w: 0.08, life: 0.6, rev: 0.05, spin: 2, grow: 10 });
      return true;
    },
    zoneMake(kit, z, row) {
      const first = !row || z.total <= (row.delay ?? 0) + 1e-3;
      if (first) {
        const life = (row ? row.span + row.delay : 3) + 0.35, rr = row ? row.blast : z.r;
        sigil(kit, z.x, z.z, rr, IM_ARC, { c2: IM_ICE, n: 0, ticks: 12, inner: 0.86, fill: 0.22, w: 0.09, life, rev: 0.15, spin: 0.8, pulse: 7 });
        sigil(kit, z.x, z.z, rr * 0.35, IM_RED, { c2: IM_GOLD, n: 0, ticks: 4, inner: 0, fill: 0.05, w: 0.08, life, rev: 0.1, spin: -1.6, rot: 0.785 });
      }
      const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * z.r * 0.75, x = z.x + Math.cos(a) * d, zz = z.z + Math.sin(a) * d;
      const g = imMissile(), v = { g, h: held(kit, [g]), x, z: zz, t: 0, total: Math.max(0.12, z.total || 0.25), live: true, lean: R(-0.5, 0.5) };
      g.visible = false;
      trail(kit, () => (v.live && g.visible ? [g.position.x, g.position.y, g.position.z] : null), 0.32, IM_SMOKE, 1e9, { c2: IM_SOOT, len: 10, up: true, fade: 0.5 });
      return v;
    },
    zone(kit, v, z, dt) {
      v.t += dt;
      const lead = Math.min(v.total, 0.45), f = (v.t - (v.total - lead)) / lead;   // each missile falls during the last 0.45 s of its wait
      if (f < 0) return;
      v.g.visible = true;
      const k = Math.min(1, f), h = 11 * (1 - k);
      v.g.position.set(v.x + v.lean * h * 0.3, 0.4 + h, v.z - h * 0.25);
      v.g.rotation.set(0, 0, -Math.PI / 2 + v.lean * 0.3); v.g.scale.setScalar(1.6);
      kit.glow(v.g.position.x, v.g.position.y + 0.8, v.g.position.z, IM_GOLD, 0.08, 0.9, 0.9, kit.K.FLAME, 1.2);
    },
    zoneDrop(kit, v) { v.live = false; v.h.on = false; },
    land(kit, e, v) {
      const x = v ? v.x : e.x, z = v ? v.z : e.z;
      if (v) { v.live = false; v.h.on = false; }
      burst(kit, x, z, 3, IM_GOLD, IM_HOT, { life: 0.35 });
      shell(kit, x, 0.4, z, 2.1, IM_GOLD, { c2: IM_HOT, p: 1.4, core: 0.25, dome: true, life: 0.55, grow: 0.08 });
      sigil(kit, x, z, 2.4, IM_GOLD, { c2: IM_RED, n: 0, ticks: 0, inner: 0.8, fill: 0.3, w: 0.08, life: 0.5, rev: 0.04, grow: 10 });
      kit.puffs(x, 0.8, z, kit.N(6), IM_SOOT, 1.0, 2.2, 0.9, 1.3, 2.2, 0.8, 0.6, kit.K.SMOKE, 2);
      kit.chips(x, 0.3, z, kit.N(5), C(0.3, 0.27, 0.25), 6, 0.7, 0.14);
      kit.scorch(x, z, 1.2); kit.kick(x, z, 0.35);
      return true;
    },
  },
  // Ngõa Giải Xạ Tuyến: a thin gold line while the reactor charges, then a thick orange-gold ray with a white core from the
  // chest, a white flare at the muzzle and a burning point where it ends
  imRay: {
    skill() { return true; },
    castMake(kit, u, s) {
      // the reactor ring on the floor round him and a gold dome where the ray bites, both held for the whole channel
      const ring = sigil(kit, u.x, u.z, 3.4, IM_GOLD, { c2: IM_RED, n: 0, ticks: 16, inner: 0.7, fill: 0.3, w: 0.09, life: 1e9, rev: 0.2, spin: 2, follow: u });
      const bite = shell(kit, u.x, 0.3, u.z, 2.5, IM_GOLD, { c2: IM_RED, p: 1.3, core: 0.22, dome: true, life: 1e9, pulse: 5 });
      bite.visible = false;
      const hp = imHoops(kit, 6); for (const me of hp.hoops) me.visible = false;
      return { glow: kit.beam(u.x, u.z, u.x + 1, u.z, s.width * 3.4, IM_GOLD, 1e9, 0, 1.45), core: kit.beam(u.x, u.z, u.x + 1, u.z, s.width * 0.55, C(2.6, 1.7, 0.6), 1e9, 0, 1.5), ring, bite, hp, on: false };
    },
    cast(kit, v, u, s) {
      const a = u.aim, ca = Math.cos(a), sa = Math.sin(a), x0 = u.x + ca * 1.1, z0 = u.z + sa * 1.1;
      const map = kit.match && kit.match.map, t = map ? Math.min(1, castStatic(map, u.x, u.z, u.x + ca * s.range, u.z + sa * s.range, 0.2)) : 1;
      const len = s.range * t, x1 = u.x + ca * len, z1 = u.z + sa * len, live = u.cast.t <= s.dur;
      kit.aimBeam(v.glow, x0, z0, x1, z1, 1.45); kit.aimBeam(v.core, x0, z0, x1, z1, 1.5);
      v.glow.u.uA.value = live ? 0.9 + 0.1 * Math.sin(kit.time * 53) : 0.25; v.core.u.uA.value = live ? 1 : 0.35;
      v.glow.mesh.scale.z = s.width * (live ? 3.4 * (0.94 + 0.06 * Math.sin(kit.time * 41)) : 0.6); v.core.mesh.scale.z = s.width * (live ? 0.9 : 0.25);
      kit.glow(x0, 1.45, z0, IM_HOT, 0.06, live ? 2.2 : 1.2, 1, kit.K.STAR, 1.1);
      kit.glow(x0, 1.45, z0, IM_GOLD, 0.08, live ? 3 : 1.6, 0.7, kit.K.GLOW, 1.2);
      v.bite.visible = live; v.bite.position.set(x1, 0.3, z1);
      v.hp.hoops.forEach((me, i) => {
        const f = (kit.time * 1.6 + i / v.hp.hoops.length) % 1, d = 1.2 + (len - 1.2) * f;
        me.visible = live; me.position.set(u.x + ca * d, 1.45, u.z + sa * d); me.rotation.set(0, Math.atan2(ca, sa), 0); me.scale.setScalar(1.2 + 1.3 * f);
      });
      v.hp.mat.opacity = 0.9;
      if (!live) return;
      if (!v.on) { v.on = true; sigil(kit, u.x, u.z, 2.4, IM_GOLD, { c2: IM_HOT, n: 0, ticks: 0, inner: 0.8, fill: 0.25, w: 0.08, life: 0.45, rev: 0.04, grow: 9 }); kit.flash(x0, 1.6, z0, IM_GOLD, 50, 0.3); }
      kit.glow(x1, 1.4, z1, IM_HOT, 0.06, 2.4, 0.9, kit.K.STAR, 1);
      kit.glow(x1, 1.3, z1, IM_GOLD, 0.12, 3.2, 0.6, kit.K.GLOW, 1.2);
      for (let i = 0, n = kit.N(2); i < n; i++) { const f = Math.random(); kit.str.emit(x0 + (x1 - x0) * f, R(1.2, 1.8), z0 + (z1 - z0) * f, ca * 20, 0, sa * 20, i % 2 ? IM_GOLD : IM_HOT, 0.2, 0.08, 0.05, 0, 1, 1); }
      if (Math.random() < 0.35) kit.puffs(x1, 0.6, z1, 1, IM_SOOT, 0.4, 1.5, 0.8, 0.8, 2.4, 0.8, 0.4, kit.K.SMOKE, 1.6);
    },
    castDrop(kit, v) { kit.endBeam(v.glow); kit.endBeam(v.core); stop(v.ring); stop(v.bite); v.hp.h.on = false; },
  },
};

// ---- Optimus Prime: steel-blue light, warm orange accent ---------------------------------------------------------------------
const OP_BLUE = C(0.4, 1.15, 2.6), OP_ICE = C(1.7, 2.2, 2.6), OP_ORG = C(2.6, 1.05, 0.25), OP_DEEP = C(0.05, 0.18, 0.55);
// the Sword of Judgment, point down, about 1 m long before scaling: a diamond silver blade with a blue fuller glow, a red
// swept crossguard, a dark grip and a red pommel
const opSwordGeo = (() => {
  const blade = keep(new THREE.CylinderGeometry(0.17, 0.0, 1.5, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.28).translate(0, 0.75, 0));
  const glow = keep(new THREE.CylinderGeometry(0.26, 0.02, 1.62, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.14).translate(0, 0.78, 0));
  const s = new THREE.Shape();
  s.moveTo(-0.55, 0.06); s.quadraticCurveTo(-0.3, -0.02, 0, 0.02); s.quadraticCurveTo(0.3, -0.02, 0.55, 0.06); s.lineTo(0.42, 0.16);
  s.quadraticCurveTo(0.2, 0.1, 0, 0.13); s.quadraticCurveTo(-0.2, 0.1, -0.42, 0.16); s.lineTo(-0.55, 0.06);
  const guard = keep(new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }).translate(0, 1.47, -0.05));
  const grip = keep(new THREE.CylinderGeometry(0.045, 0.05, 0.32, 8).translate(0, 1.78, 0));
  const pommel = keep(new THREE.OctahedronGeometry(0.075).translate(0, 1.97, 0));
  return { blade, glow, guard, grip, pommel };
})();
function opSwordMesh() {
  const g = new THREE.Group(), P = opSwordGeo;
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.85, roughness: 0.22, emissive: 0x24406a, emissiveIntensity: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc0281e, metalness: 0.6, roughness: 0.35, emissive: 0x500806, emissiveIntensity: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262c, metalness: 0.5, roughness: 0.5 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.75, 1.6), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  for (const [geo, mat] of [[P.blade, steel], [P.glow, glow], [P.guard, red], [P.grip, dark], [P.pommel, red]]) { const me = new THREE.Mesh(geo, mat); me.frustumCulled = false; g.add(me); }
  g.userData.glow = glow;
  return g;
}
const trau = {
  // Thẩm Phán Chi Kiếm: the sword drops point first at the cursor and lands in a blue-white blow; planted, it stands in a wide
  // steel-blue ring with an orange floor (the clip's picture) while the field lasts
  opSword: {
    pal: [OP_BLUE, OP_ICE], hitR: 2.4,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.2, 1.6, u.z + Math.sin(e.a) * 1.2, OP_BLUE, 0.2, 2, 0.8, kit.K.GLOW, 1.3); return true; },
    strike(kit, e) {
      const g = opSwordMesh(), delay = Math.max(0.1, e.delay ?? 0.3), h = held(kit, [g]);
      g.position.set(e.x, 9, e.z); g.rotation.y = 0.6; g.scale.setScalar(2.6);
      trail(kit, () => (h.on && g.position.y > 0 ? [e.x, g.position.y + 3.5, e.z] : null), 0.5, OP_BLUE, 1.2, { c2: OP_DEEP, len: 10, up: true });
      kit.anims.push({ t: 0, step(dt) {
        this.t += dt;
        const f = Math.min(1, this.t / delay);
        g.position.y = 9 * (1 - f * f) - 0.9 * f;
        if (f < 1) return true;
        h.on = false;
        burst(kit, e.x, e.z, 3.4, OP_BLUE, OP_ICE, { life: 0.4 });
        sigil(kit, e.x, e.z, 3.2, OP_BLUE, { c2: OP_ICE, n: 0, ticks: 0, inner: 0.84, fill: 0.2, w: 0.08, life: 0.5, rev: 0.04, grow: 10 });
        kit.chips(e.x, 0.3, e.z, kit.N(8), C(0.32, 0.3, 0.3), 6, 0.8, 0.15); kit.kick(e.x, e.z, 0.5);
        return false;
      }, drop() {} });
      return true;
    },
    zoneMake(kit, z) {
      const g = opSwordMesh(), h = held(kit, [g]);
      g.position.set(z.x, -0.9, z.z); g.rotation.y = 0.6; g.scale.setScalar(2.6);
      const rim = sigil(kit, z.x, z.z, z.r, OP_BLUE, { c2: OP_ICE, n: 0, ticks: 0, inner: 0.9, fill: 0.04, w: 0.09, life: 1e9, rev: 0.12, spin: 0 });
      const floor = sigil(kit, z.x, z.z, z.r * 0.92, OP_ORG, { c2: OP_ORG, n: 0, ticks: 0, inner: 0, fill: 0.34, w: 0, life: 1e9, rev: 0.2, alpha: 0.75 });
      return { g, h, rim, floor };
    },
    zone(kit, v, z, dt) {
      const end = Math.min(1, Math.max(0, (z.dur - z.age) * 3)), pulse = 0.75 + 0.25 * Math.sin(z.age * 7);
      v.g.userData.glow.opacity = 0.55 * pulse * end;
      kit.glow(z.x, 2.6, z.z, OP_BLUE, 0.08, 2.0, 0.2 * pulse * end, kit.K.GLOW, 1);
      if (Math.random() < dt * 25) { const a = Math.random() * 6.283; kit.glow(z.x + Math.cos(a) * z.r, 0.3, z.z + Math.sin(a) * z.r, OP_BLUE, 0.5, 0.3, 1, kit.K.SPARK, 0.3, 0, kit.rnd(1, 2.5), 0); }
      if (Math.random() < dt * 10) { const a = Math.random() * 6.283, d = Math.random() * z.r * 0.8; kit.glow(z.x + Math.cos(a) * d, 0.25, z.z + Math.sin(a) * d, OP_ORG, 0.6, 0.35, 0.8, kit.K.SPARK, 0.3, 0, kit.rnd(0.8, 1.8), 0); }
    },
    zoneDrop(kit, v) { v.h.on = false; stop(v.rim); stop(v.floor); },
  },
  // Hãn Vệ Tự Do: a wide blue slash band across the rectangle; the charge to the sword is a blue comet streak with an ice core
  opCharge: {
    pal: [OP_BLUE, OP_ICE], hitR: 2.2,
    skill() { return true; },
    beam(kit, e) {
      const dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz) || 1, a = Math.atan2(dz, dx);
      const b = kit.beam(e.x0, e.z0, e.x1, e.z1, e.w * 1.6, OP_BLUE, 0.4, 0, 1.0); b.fade = true;
      shell(kit, e.x0 + dx * 0.25, 0.9, e.z0 + dz * 0.25, e.w * 0.9, OP_BLUE, { c2: OP_ICE, p: 1.5, core: 0.18, squash: 0.4, life: 0.4, grow: 0.06 });
      sigil(kit, e.x0, e.z0, 2.4, OP_BLUE, { c2: OP_ICE, n: 0, ticks: 0, inner: 0.8, fill: 0.25, w: 0.08, life: 0.4, rev: 0.04, grow: 10 });
      slash(kit, e.x0 + dx * 0.15, e.z0 + dz * 0.15, a, L * 0.7, OP_BLUE, { c2: OP_DEEP, edge: OP_ICE, span: 0.55, life: 0.4, w: e.w * 0.55, sweep: 0.08 });
      for (let i = 0, n = kit.N(14); i < n; i++) { const t = Math.random(), s = (Math.random() - 0.5) * e.w; kit.str.emit(e.x0 + dx * t - dz / L * s, R(0.6, 1.4), e.z0 + dz * t + dx / L * s, dx / L * 18, 0, dz / L * 18, i % 3 ? OP_BLUE : OP_ICE, 0.25, 0.1, 0.06, 0, 0, 1); }
      kit.flash(e.x0 + dx * 0.5, 1.4, e.z0 + dz * 0.5, OP_BLUE, 30, 0.2);
      return true;
    },
    warp(kit, e, u) {
      const d = Math.hypot(e.x - e.x0, e.z - e.z0), dur = d / 30 + 0.05;
      trail(kit, (t) => (t < dur && u.alive ? [u.x, 1.1, u.z] : null), 2.2, OP_BLUE, dur + 0.5, { c2: OP_DEEP, len: 18 });
      trail(kit, (t) => (t < dur && u.alive ? [u.x, 1.2, u.z] : null), 0.7, OP_ICE, dur + 0.4, { c2: OP_BLUE, len: 14, add: true });
      kit.follow(u, dur, () => { kit.glow(u.x, 1.2, u.z, OP_ICE, 0.08, 2.4, 0.9, kit.K.STAR, 1.1); }, () => { burst(kit, u.x, u.z, 3, OP_BLUE, OP_ICE, { life: 0.35 }); });
      return true;
    },
  },
  // Thẩm Phán Kỵ Sĩ: an orange pillar of light crashes down on him, an orange shock ring rolls out to the nova's edge; then a
  // blue aura rides him while the Knight lasts
  opKnight: {
    pal: [OP_ORG, OP_ICE], hitR: 2.4,
    skill() { return true; },
    transform(kit, e, u, s) {
      if (!e.on) return true;
      const r = (s.nova && s.nova.radius) || 5, dur = s.dur || 8;
      pillar(kit, e.x, e.z, 2.8, OP_ORG, { c2: C(2.6, 2.2, 1.4), h: 14, rings: 1.2, life: 0.95, grow: 0.15, drop: true });
      sigil(kit, u.x, u.z, 2.6, OP_BLUE, { c2: OP_ICE, n: 0, ticks: 12, inner: 0.78, fill: 0.2, w: 0.08, life: dur, rev: 0.2, spin: 1.5, follow: u, alpha: 0.85 });
      kit.anims.push({ t: 0, done: false, step(dt) {
        this.t += dt;
        if (this.t < 0.2) return true;
        burst(kit, u.x, u.z, 4, OP_ORG, C(2.6, 2.2, 1.4), { life: 0.35 });
        sigil(kit, u.x, u.z, r, OP_ORG, { c2: C(2.6, 2.2, 1.4), n: 0, ticks: 0, inner: 0.84, fill: 0.34, w: 0.1, life: 0.9, rev: 0.04, grow: 8 });
        shell(kit, u.x, 0.2, u.z, r * 0.9, OP_ORG, { c2: C(2.6, 2.2, 1.4), p: 1.6, core: 0.16, dome: true, life: 0.7, grow: 0.1, squash: 0.45 });
        kit.puffs(u.x, 0.6, u.z, kit.N(10), C(0.3, 0.22, 0.18), r * 0.6, 3, 0.9, 1.5, 2.4, 0.5, 0.55, kit.K.SMOKE, 2);
        kit.flash(u.x, 2, u.z, OP_ORG, 55, 0.3); kit.kick(u.x, u.z, 0.9);
        return false;
      }, drop() {} });
      kit.follow(u, dur, (t) => {
        kit.glow(u.x, 1.3, u.z, OP_BLUE, 0.12, 3.2, 0.35 + 0.1 * Math.sin(t * 8), kit.K.GLOW, 1);
        if (Math.random() < 0.5) { const a = Math.random() * 6.283; kit.glow(u.x + Math.cos(a) * 1.1, R(0.4, 1.8), u.z + Math.sin(a) * 1.1, OP_ICE, 0.45, 0.3, 1, kit.K.SPARK, 0.3, 0, R(1.5, 3), 0); }
      });
      return true;
    },
  },
};

export const K11 = { ...tho, ...trau };
