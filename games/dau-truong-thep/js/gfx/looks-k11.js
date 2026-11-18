// Looks, kit lane K11: Iron Man, remade with the kits ported from the owner's clips. Render only (see looks.js).
// One main colour and one accent per tank, one strong shape per skill, soft halos.
//   钢铁 p73 (Iron Man): a white-cyan particle shell that bursts into a crackling blue sphere; a cyan circle with a red cross-hair,
//     missiles dropping into it on smoke trails and going off in orange blasts; a thick orange-gold disintegration ray from the chest,
//     gold shock hoops running out along it, a reactor ring under him and a gold dome where it bites.
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, sigil, shell, trail, burst } from './lookkit.js';
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

export const K11 = { ...tho };
