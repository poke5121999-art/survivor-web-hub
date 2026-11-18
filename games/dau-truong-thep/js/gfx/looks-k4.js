// Looks, kit lane K4: Tư Mã Ý and Star Lord, remade with the kits ported from the owner's clips. Render only (see looks.js).
// One main colour and one accent per tank, one strong shape per skill, soft halos.
//   司马懿 p12 (Tư Mã Ý): small black orbs with violet rims circling him; a blue-rimmed circle where the Chaos Orb drops, then a
//     big void orb with a violet swirl sitting there; violet feathered claw streaks fanning forward for U Minh Khu Hổ; a
//     straight violet ray to the devoured target, a void maw with lilac lightning on it; a violet bubble when an orb bursts.
//   飞翼 p18 (Star Lord): ice-cyan tracer bolts, an orange lock ring with brackets round the target, small missiles on cyan
//     contrails, a white-orange ball where they burst, an orange fire ring on the third hit.
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, slash, sigil, shell, trail, burst } from './lookkit.js';
import { orbPos } from '../sim.js';

const R = (a, b) => a + Math.random() * (b - a);
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
// The foe a press most likely aimed at: the visible enemy nearest the aim line within reach and cone (render-only guess; the
// sim picks by the cursor, which the press event does not carry).
function aimed(kit, u, a, reach, cone) {
  let best = null, bs = 1e9;
  for (const o of kit.match.units) {
    if (!o.alive || o.team === u.team) continue;
    const dx = o.x - u.x, dz = o.z - u.z, d = Math.hypot(dx, dz), da = Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - a), Math.cos(Math.atan2(dz, dx) - a)));
    if (d > reach || da > cone) continue;
    const sc = d * Math.sin(da) + d * 0.1;
    if (sc < bs) { bs = sc; best = o; }
  }
  return best;
}

// ---- Tư Mã Ý: black void orbs, violet rims, lilac lightning ----------------------------------------------------------
const TM_VIO = C(1.3, 0.28, 2.5), TM_LIL = C(2.1, 1.7, 2.6), TM_DEEP = C(0.3, 0.04, 0.6), TM_RIM = C(0.5, 0.85, 2.5);
const voidGeo = new THREE.SphereGeometry(1, 20, 14); voidGeo.userData.keep = true;
function voidBall(r) {
  const me = new THREE.Mesh(voidGeo, new THREE.MeshBasicMaterial({ color: 0x0b0314, toneMapped: false, transparent: true }));
  me.scale.setScalar(r); me.renderOrder = 8; return me;
}
// a void orb: black core and a violet fresnel rim, both owned until h.on is cleared
function chaosOrb(kit, r, life = 1e9) {
  const core = voidBall(r), h = held(kit, [core]);
  const rim = shell(kit, 0, 0, 0, r * 1.75, TM_VIO, { c2: TM_LIL, p: 1.6, core: 0.12, life, bands: 2.2 });
  return { core, rim, h, r, set(x, y, z, k = 1) { core.position.set(x, y, z); core.scale.setScalar(r * k); rim.position.set(x, y, z); rim.scale.setScalar(r * 1.75 * k); }, end() { h.on = false; stop(rim); } };
}
function crackle(kit, x, y, z, r, n = 2) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283; kit.str.emit(x + Math.cos(a) * r, y + R(-0.4, 0.4) * r, z + Math.sin(a) * r, -Math.sin(a) * 4, R(-1, 1), Math.cos(a) * 4, TM_LIL, 0.08, 0.05, 0.08, 0, 0, 1); }
}
// the void maw on the devoured foe: a swelling black orb in a violet rim, a seven-point sigil turning under it, lightning
function maw(kit, x, z, life) {
  const o = chaosOrb(kit, 1.5, life);
  own(kit, [new THREE.Group()], life, (t) => {
    const k = Math.min(1, t / 0.15) * (1 - 0.6 * Math.max(0, (t - life + 0.35) / 0.35));
    o.set(x, 1.4, z, 1 + 0.15 * Math.sin(t * 14) * k);
    o.core.scale.setScalar(1.5 * k); o.rim.scale.setScalar(2.9 * k);
    if (Math.random() < 0.7) crackle(kit, x, 1.4, z, 1.3, 2);
    if (t >= life - 0.02) o.end();
  });
  sigil(kit, x, z, 4.6, TM_VIO, { c2: TM_LIL, n: 7, m: 3, ticks: 14, inner: 0.55, fill: 0.3, life, rev: 0.15, spin: -2.2, w: 0.1 });
  kit.puffs(x, 0.8, z, kit.N(10), TM_DEEP, 2.2, 1.5, 1.0, 1.6, 2.2, 0.6, 0.6, kit.K.SMOKE, 2);
}

const tumay = {
  // Hắc Cầu (weapon): plain bolts stay the generic pulse; a chaos orb in flight (knocked by Khu Hổ, or sent by the ult) is a
  // void orb on a violet ribbon, longer for the ult (its straight ray)
  tmBolt: {
    shotMake(kit, s) {
      if (!(s.r > 0.35)) return {};
      const o = chaosOrb(kit, 0.48), v = { o, x: s.x, z: s.z, live: true };
      trail(kit, () => (v.live ? [v.x, 1.35, v.z] : null), 0.95, TM_VIO, 1e9, { c2: TM_DEEP, len: s.speed > 24 ? 22 : 12 });
      return v;
    },
    shot(kit, v, s, x, y, z) {
      if (!v.o) return false;
      v.x = x; v.z = z; v.o.set(x, 1.35, z);
      if (Math.random() < 0.5) crackle(kit, x, 1.35, z, 0.6, 1);
      return true;
    },
    shotEnd(kit, v, s, x, z) {
      if (!v.o) return;
      v.live = false; v.o.end();
      burst(kit, x, z, 2.6, TM_VIO, TM_LIL, { life: 0.4 }); crackle(kit, x, 1.3, z, 1, 6);
    },
  },
  // U Minh Khu Hổ: three violet claw strokes rake the cone, feathered streaks fly out along it
  tmTiger: {
    pal: [TM_VIO, TM_LIL], hitR: 2.2,
    skill() { return true; },
    nova(kit, e, u, s) {
      const a = e.a ?? u.aim, r = s.radius, span = s.arc || 0.7;
      [0.62, 0.84, 1.06].forEach((f, i) => slash(kit, e.x, e.z, a + (i - 1) * 0.06, r * f, TM_VIO, { c2: TM_DEEP, edge: TM_LIL, span, life: 0.55, w: r * 0.17, sweep: 0.07 + i * 0.03, arcs: 2, dir: i % 2 ? -1 : 1 }));
      slash(kit, e.x, e.z, a, r * 0.58, TM_VIO, { c2: TM_DEEP, edge: TM_LIL, span, life: 0.55, w: r * 0.46, sweep: 0.05, arcs: 0, sparks: false });
      shell(kit, e.x, 1.1, e.z, 1.6, TM_VIO, { c2: TM_LIL, p: 1.6, core: 0.1, squash: 0.5, life: 0.4, grow: 0.06 });
      kit.puffs(e.x + Math.cos(a) * r * 0.6, 1.0, e.z + Math.sin(a) * r * 0.6, kit.N(8), TM_DEEP, r * 0.35, 3, 0.7, 1.3, 2.4, 0.4, 0.55, kit.K.SMOKE, 2);
      for (let i = 0, n = kit.N(26); i < n; i++) {
        const b = a + R(-span, span), sp = R(12, 22), d = R(0.8, 2.2);
        kit.str.emit(e.x + Math.cos(b) * d, R(0.6, 1.6), e.z + Math.sin(b) * d, Math.cos(b) * sp, 0, Math.sin(b) * sp, i % 3 ? TM_VIO : TM_LIL, 0.35, 0.22, 0.16, 0, 0, 1);
      }
      kit.flash(e.x + Math.cos(a) * 2, 1.4, e.z + Math.sin(a) * 2, TM_VIO, 35, 0.2); kit.kick(e.x, e.z, 0.3);
      return true;
    },
  },
  // Hỗn Độn Pháp Cầu: a thin blue-rimmed circle where it drops with the orb gathering in it; it lands in a violet burst. The
  // orb it leaves is drawn by tmDevour (an orbit zone); when that orb's time runs out it swells into a violet bubble and pops.
  tmOrb: {
    zones: ['strike'], ownDisc: true, pal: [TM_VIO, TM_LIL], hitR: 2,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.3, 1.4, u.z + Math.sin(e.a) * 1.3, TM_VIO, 0.15, 1.4, 0.8, kit.K.STAR, 1.2); return true; },
    zoneMake(kit, z) {
      const ring = sigil(kit, z.x, z.z, z.r, TM_RIM, { c2: TM_VIO, n: 0, ticks: 0, inner: 0.92, fill: 0.14, w: 0.05, life: 1e9, rev: 0.08, spin: 0 });
      const o = chaosOrb(kit, 0.75);
      return { ring, o, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt;
      const k = Math.min(1, v.t / Math.max(0.1, (z.total || 0.5)));
      v.o.set(z.x, 1.1 + 2.5 * (1 - k), z.z, 0.3 + 0.7 * k);
      if (Math.random() < dt * 30) { const a = Math.random() * 6.283; kit.str.emit(z.x + Math.cos(a) * z.r, 0.4, z.z + Math.sin(a) * z.r, -Math.cos(a) * 6, 1.5, -Math.sin(a) * 6, TM_VIO, 0.3, 0.1, 0.08, 0, 0, 1); }
    },
    zoneDrop(kit, v) { stop(v.ring); v.o.end(); },
    land(kit, e) {
      burst(kit, e.x, e.z, 4, TM_VIO, TM_LIL, { life: 0.45 });
      sigil(kit, e.x, e.z, 3, TM_VIO, { c2: TM_LIL, n: 7, m: 3, ticks: 0, inner: 0.5, fill: 0.25, life: 0.7, rev: 0.08, spin: 3 });
      crackle(kit, e.x, 1.2, e.z, 1.6, 10); kit.kick(e.x, e.z, 0.3);
      return true;
    },
    nova(kit, e) {
      if (!e.orb) return false;
      shell(kit, e.x, 1.2, e.z, e.r, TM_VIO, { c2: TM_LIL, p: 1.4, core: 0.25, life: 0.45, step: (t, m) => { m.scale.setScalar(e.r * (0.3 + 0.9 * Math.min(1, t / 0.18))); } });
      burst(kit, e.x, e.z, 3, TM_LIL, C(2.6, 2.4, 2.6), { life: 0.35 }); crackle(kit, e.x, 1.2, e.z, e.r * 0.7, 10);
      kit.flash(e.x, 1.6, e.z, TM_VIO, 40, 0.25);
      return true;
    },
  },
  // Hỗn Độn Chi Phệ: a straight violet ray to the foe and a void maw on it; the orbs (tmBolt) pour in along the ray.
  // Also draws every chaos orb: the ones circling him (pool) and the big ones sitting on the ground.
  tmDevour: {
    zones: ['orbit'], pal: [TM_VIO, TM_LIL], hitR: 2.4,
    skill(kit, e, u) {
      const o = aimed(kit, u, e.a, 15, 0.6), x = o ? o.x : u.x + Math.cos(e.a) * 9, z = o ? o.z : u.z + Math.sin(e.a) * 9;
      const b = kit.beam(u.x, u.z, x, z, 1.5, TM_VIO, 1.1, 0, 1.35); b.fade = true;
      const b2 = kit.beam(u.x, u.z, x, z, 0.4, TM_LIL, 0.9, 0, 1.35); b2.fade = true;
      maw(kit, x, z, 1.5);
      sigil(kit, u.x, u.z, 2.6, TM_VIO, { c2: TM_LIL, n: 5, m: 2, ticks: 0, inner: 0.6, fill: 0.25, life: 1.0, rev: 0.1, spin: 2.5, w: 0.08 });
      kit.flash(u.x, 1.6, u.z, TM_VIO, 35, 0.25);
      return true;
    },
    zoneMake(kit, z) {
      if (z.mode === 'chaosG') {
        const o = chaosOrb(kit, 0.78);
        const sg = sigil(kit, z.x, z.z, 1.7, TM_VIO, { c2: TM_LIL, n: 5, m: 2, ticks: 0, inner: 0.7, fill: 0.18, w: 0.06, life: 1e9, rev: 0.2, spin: 1.6, alpha: 0.8 });
        return { g: true, o, sg, t: 0 };
      }
      return { orbs: [] };
    },
    zone(kit, v, z, dt) {
      if (v.g) {
        v.t += dt;
        v.o.set(z.x, 1.15 + 0.12 * Math.sin(v.t * 3), z.z, Math.min(1, v.t * 5) * (1 + 0.06 * Math.sin(v.t * 9)));
        if (Math.random() < dt * 8) crackle(kit, z.x, 1.15, z.z, 0.9, 1);
        return;
      }
      const o = kit.match.units[z.owner];
      if (!o) return;
      for (let i = 0; i < z.n; i++) {
        const on = (z.live >> i) & 1;
        if (on && !v.orbs[i]) v.orbs[i] = chaosOrb(kit, 0.3);
        if (!on && v.orbs[i]) { v.orbs[i].end(); v.orbs[i] = null; }
        if (!on || !o.alive) continue;
        const [px, pz] = orbPos(z, o, i);
        v.orbs[i].set(px, 1.25 + 0.1 * Math.sin(z.age * 4 + i), pz);
      }
    },
    zoneDrop(kit, v) {
      if (v.g) { v.o.end(); stop(v.sg); return; }
      for (const o of v.orbs) if (o) o.end();
    },
  },
};

// ---- Star Lord: ice-cyan light, orange accent --------------------------------------------------------------------------
const SL_CY = C(0.45, 1.65, 2.6), SL_ORG = C(2.6, 0.95, 0.2), SL_HOT = C(2.6, 2.3, 1.7), SL_DEEP = C(0.04, 0.22, 0.5);
const missileGeo = (() => {
  const body = new THREE.CylinderGeometry(0.09, 0.11, 0.8, 8).rotateZ(Math.PI / 2);
  const nose = new THREE.ConeGeometry(0.09, 0.3, 8).rotateZ(-Math.PI / 2).translate(0.55, 0, 0);
  const fins = new THREE.BoxGeometry(0.22, 0.02, 0.42).translate(-0.32, 0, 0);
  for (const g of [body, nose, fins]) g.userData.keep = true;
  return [body, nose, fins];
})();
function missile() {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xe8eef6, toneMapped: false, transparent: true });
  for (const geo of missileGeo) g.add(new THREE.Mesh(geo, m));
  g.traverse((o) => { o.frustumCulled = false; o.renderOrder = 8; });
  return g;
}
// the lock: an orange ring with four bracket ticks closing in, an inner one turning the other way
function lock(kit, x, z, r, life) {
  sigil(kit, x, z, r, SL_ORG, { c2: SL_HOT, n: 0, ticks: 4, inner: 0.74, fill: 0.16, w: 0.12, life, rev: 0.06, spin: 2.6, grow: 6 });
  sigil(kit, x, z, r * 0.62, SL_ORG, { c2: SL_ORG, n: 0, ticks: 4, inner: 0, fill: 0.04, w: 0.07, life, rev: 0.1, spin: -3.2, rot: 0.785 });
}

const enbac = {
  // Tật Tốc (passive): the third hit in a row lands an orange fire ring in a lock bracket
  ebMark: {
    stacks(kit, e) {
      lock(kit, e.x, e.z, 1.9, 0.45);
      sigil(kit, e.x, e.z, 2.4, SL_ORG, { c2: SL_HOT, n: 0, ticks: 0, inner: 0.8, fill: 0.3, w: 0.08, life: 0.4, rev: 0.04, grow: 10 });
      kit.sparks(e.x, 1.2, e.z, kit.N(12), SL_ORG, 9, 0.35, 0.06, 0.6, 10); kit.flash(e.x, 1.6, e.z, SL_ORG, 30, 0.18);
      return true;
    },
  },
  // Tật Tốc Triệt Thoái: one long ice-cyan tracer forward while the jets throw him back (two contrails, orange thrust glow)
  ebRetreat: {
    pal: [SL_CY, SL_HOT], hitR: 1.8,
    skill(kit, e, u) {
      const a = e.a, ca = Math.cos(a), sa = Math.sin(a);
      const b = kit.beam(u.x + ca * 1.2, u.z + sa * 1.2, u.x + ca * 14, u.z + sa * 14, 0.9, SL_CY, 0.5, 0, 1.4); b.fade = true;
      const b2 = kit.beam(u.x + ca * 1.2, u.z + sa * 1.2, u.x + ca * 14, u.z + sa * 14, 0.25, SL_HOT, 0.4, 0, 1.45); b2.fade = true;
      kit.glow(u.x + ca * 1.4, 1.4, u.z + sa * 1.4, SL_HOT, 0.12, 2.0, 1, kit.K.STAR, 1.3);
      shell(kit, u.x + ca * 0.8, 1.0, u.z + sa * 0.8, 4.0, SL_CY, { c2: SL_HOT, p: 1.6, core: 0.16, squash: 0.35, life: 0.5, grow: 0.08 });
      sigil(kit, u.x, u.z, 3.4, SL_CY, { c2: SL_HOT, n: 0, ticks: 0, inner: 0.7, fill: 0.25, w: 0.08, life: 0.5, rev: 0.04, grow: 8 });
      kit.puffs(u.x + ca * 1.2, 0.8, u.z + sa * 1.2, kit.N(14), C(0.75, 0.85, 0.95), 1.2, 4, 0.6, 1.1, 2.2, 0.3, 0.5, kit.K.SMOKE, 2.5);
      for (const sd of [-1, 1]) trail(kit, (t) => (t < 0.32 && u.alive ? [u.x + ca * 0.9 - sa * sd * 0.7, 1.0, u.z + sa * 0.9 + ca * sd * 0.7] : null), 0.9, SL_CY, 0.8, { c2: SL_DEEP, len: 18 });
      kit.follow(u, 0.3, () => { kit.glow(u.x + ca * 1.0, 0.9, u.z + sa * 1.0, SL_ORG, 0.1, 1.2, 0.9, kit.K.FLAME, 1.2, ca * 3, 0, sa * 3); });
      kit.flash(u.x, 1.5, u.z, SL_CY, 30, 0.2);
      return true;
    },
  },
  // Cân Tung Đạo Đạn: the lock ring on the foe, then four little missiles curling in on cyan contrails, white-orange bursts
  ebMissile: {
    pal: [SL_ORG, SL_HOT], hitR: 1.6,
    skill(kit, e, u) {
      const o = aimed(kit, u, e.a, 17, 0.9);
      if (o) { lock(kit, o.x, o.z, 3.4, 1.2); const b = kit.beam(u.x, u.z, o.x, o.z, 0.5, SL_ORG, 0.6, 0, 1.3); b.fade = true; }
      kit.puffs(u.x + Math.cos(e.a) * 1.3, 1.0, u.z + Math.sin(e.a) * 1.3, kit.N(6), C(0.75, 0.85, 0.95), 1.0, 3, 0.6, 1.0, 2, 0.3, 0.5, kit.K.SMOKE, 2.5);
      kit.glow(u.x + Math.cos(e.a) * 1.2, 1.4, u.z + Math.sin(e.a) * 1.2, SL_CY, 0.12, 1.6, 0.9, kit.K.STAR, 1.2);
      return true;
    },
    shotMake(kit, s) {
      const g = missile(), v = { g, h: held(kit, [g]), x: s.x, z: s.z, live: true };
      trail(kit, () => (v.live ? [v.x, 1.3, v.z] : null), 1.05, SL_CY, 1e9, { c2: SL_DEEP, len: 22 });
      return v;
    },
    shot(kit, v, s, x, y, z) {
      v.x = x; v.z = z; v.g.position.set(x, 1.3, z); v.g.rotation.y = -Math.atan2(s.dz, s.dx); v.g.scale.setScalar(2.3);
      if (Math.random() < 0.5) kit.puffs(x - s.dx * 1.2, 1.2, z - s.dz * 1.2, 1, C(0.75, 0.85, 0.95), 0.2, 0.5, 0.5, 0.7, 2, 0.2, 0.45, kit.K.SMOKE, 2);
      kit.glow(x - s.dx * 0.9, 1.3, z - s.dz * 0.9, SL_ORG, 0.08, 1.1, 0.9, kit.K.FLAME, 1.2);
      return true;
    },
    shotEnd(kit, v, s, x, z) {
      v.live = false; v.h.on = false;
      burst(kit, x, z, 2.4, SL_ORG, SL_HOT, { life: 0.35 });
    },
  },
  // Lôi Xạ Đại Pháo: a cyan charge gathers at the muzzle on a thin aim line, then a wide ice-cyan laser with a white core
  // and orange shock rings at both ends
  ebCannon: {
    pal: [SL_CY, SL_HOT], hitR: 2.2,
    skill() { return true; },
    castMake(kit, u, s) { return { b: kit.beam(u.x, u.z, u.x + 1, u.z, 0.25, SL_ORG, 99, 2, 1.4) }; },
    cast(kit, v, u, s, k) {
      const a = u.cast.aim, ca = Math.cos(a), sa = Math.sin(a);
      kit.aimBeam(v.b, u.x + ca * 1.2, u.z + sa * 1.2, u.x + ca * s.range, u.z + sa * s.range, 1.4);
      v.b.u.uA.value = 0.4 + 0.6 * k;
      kit.glow(u.x + ca * 1.4, 1.4, u.z + sa * 1.4, SL_CY, 0.06, 0.8 + 1.8 * k, 0.9, kit.K.GLOW, 1.2);
      if (Math.random() < 0.8) { const b = Math.random() * 6.283; kit.str.emit(u.x + ca * 1.4 + Math.cos(b) * 2, 1.4, u.z + sa * 1.4 + Math.sin(b) * 2, -Math.cos(b) * 7, 0, -Math.sin(b) * 7, SL_CY, 0.25, 0.06, 0.05, 0, 0, 1); }
    },
    castDrop(kit, v) { kit.endBeam(v.b); },
    beam(kit, e) {
      const dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
      const b = kit.beam(e.x0, e.z0, e.x1, e.z1, e.w * 2.4, SL_CY, 0.55, 0, 1.4); b.fade = true;
      const c = kit.beam(e.x0, e.z0, e.x1, e.z1, e.w * 0.7, SL_HOT, 0.4, 0, 1.45); c.fade = true;
      for (let i = 0, n = kit.N(24); i < n; i++) { const t = Math.random(); kit.str.emit(e.x0 + dx * t, R(1, 1.9), e.z0 + dz * t, ux * 24, 0, uz * 24, i % 4 ? SL_CY : SL_ORG, 0.25, 0.1, 0.06, 0, 1, 1); }
      for (const [x, z, r] of [[e.x0, e.z0, 2.2], [e.x1, e.z1, 3]]) sigil(kit, x, z, r, SL_ORG, { c2: SL_HOT, n: 0, ticks: 0, inner: 0.8, fill: 0.25, w: 0.08, life: 0.45, rev: 0.04, grow: 9 });
      kit.flash(e.x0, 1.6, e.z0, SL_CY, 45, 0.25); kit.kick(e.x0, e.z0, 0.6);
      return true;
    },
  },
};

export const K4 = { ...tumay, ...enbac };
