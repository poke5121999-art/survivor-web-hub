// Looks, batch 1: Lữ Bố, Tào Tháo, Tư Mã Ý, Athena, Hades, Sứa Trắng. Render only (see looks.js for the hooks).
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP.md):
//   吕布 p9: a halberd thrust with a red crescent trail, a red fire sphere round him, a ring of red flame spikes, a red hexagram
//     circle with a blue rim and a gold star in the middle.
//   曹操 p11: dark violet smoke wings, a thin magenta ring round him, a violet vortex at his feet, a violet claw-slash and violet
//     crescent sword-qi.
//   司马懿 p12: small black orbs with violet rims circling him, black void orbs with lightning inside on his targets, a violet
//     comet, a straight violet beam.
//   雅典娜 p69: a gold column of light dropped on an ally, green-gold sparkles, a thin gold ring, an orange reticle.
//   冥王 p72: an ice-blue scythe sweep, a blue column of light with rings, a big blue energy sphere on the targets.
//   Sứa Trắng: no part; a pale jellyfish healer (pearl-white bell, glowing tentacles, bubbles, pink stings).
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, crescent, sigil, shell, pillar, trail, strands, weapon, fadeWeapon, spikes, burst } from './lookkit.js';
const muz = (kit, u, a, r, c, c2, life = 0.5) => burst(kit, u.x + Math.cos(a) * 1.4, u.z + Math.sin(a) * 1.4, r, c, c2, { life });

const R = (a, b) => a + Math.random() * (b - a);
// a group owned until done() is called (a shot's or a zone's lifetime is decided by the sim, not by a timer)
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }

// ---- Lữ Bố: crimson and gold, a blue-rimmed hexagram ---------------------------------------------------------------
const LB_CRIM = C(0.85, 0.02, 0.06), LB_RED = C(2.3, 0.22, 0.1), LB_GOLD = C(2.5, 1.5, 0.35), LB_DARK = C(0.6, 0.04, 0.02), LB_BLUE = C(0.45, 1.0, 2.2);
const lubo = {
  // Đột Kích: the halberd held out ahead, a crimson streak behind, a red crescent where the thrust ends
  lbDash: {
    pal: [LB_CRIM, LB_RED], hitR: 2.8,
    skill(kit, e, u) {
      const g = weapon('halberd', 0xd8d0c0, LB_RED.clone().multiplyScalar(0.8)); g.scale.setScalar(0.9);
      let a = e.a, lx = u.x, lz = u.z;
      own(kit, [g], 0.55, (t) => {
        if (!u.alive) return false;
        if (u.dash) a = Math.atan2(u.z - lz, u.x - lx) || a;
        lx = u.x; lz = u.z;
        const k = Math.min(1, t / 0.12), fwd = 0.6 + 1.4 * k;
        g.position.set(u.x + Math.cos(a) * fwd, 1.3, u.z + Math.sin(a) * fwd); g.rotation.set(0, -a, 0);
        fadeWeapon(g, Math.min(1, (0.55 - t) / 0.2));
        if (Math.random() < 0.7) kit.str.emit(u.x + Math.cos(a) * 3, 1.3, u.z + Math.sin(a) * 3, Math.cos(a) * 14, 0, Math.sin(a) * 14, Math.random() < 0.5 ? LB_RED : LB_GOLD, 0.12, 0.1, 0.05, 0, 0, 1);
      });
      trail(kit, (t) => (t < 0.4 && u.alive ? [u.x, 0.9, u.z] : null), 0.9, LB_RED, 0.8, { c2: LB_GOLD, len: 14 });
      kit.glow(u.x, 1.2, u.z, LB_RED, 0.25, 2.4, 0.8, kit.K.GLOW, 1.3);
      muz(kit, u, e.a, 3.0, LB_CRIM, LB_RED);
      kit.anims.push({ t: 0, step(dt) { this.t += dt; if (this.t < 0.3 && u.dash) return true;
        const fx = u.x + Math.cos(a) * 1.6, fz = u.z + Math.sin(a) * 1.6;
        crescent(kit, u.x, u.z, a, 2.4, 1.2, 1, LB_RED, 0.4, 0.9, 1.1, 0, 0.12, { edge: LB_GOLD, spark: LB_GOLD });
        sigil(kit, fx, fz, 2.6, LB_BLUE, { c2: LB_RED, n: 6, m: 2, life: 0.7, rev: 0.12, spin: 1.5, fill: 0.12 });
        burst(kit, fx, fz, 3, LB_CRIM, LB_RED, { life: 0.55 });
        kit.sparks(fx, 1.2, fz, kit.N(10), LB_GOLD, 10, 0.35, 0.06, 0.5, 10, Math.cos(a), Math.sin(a), 0.6); kit.flash(fx, 1.5, fz, LB_RED, 30, 0.18);
        return false; }, drop() {} });
      return true;
    },
  },
  // Kích Chấn: a broad crimson crescent wave rolls forward with the halberd's moon blade at its heart; flame flecks on the floor
  lbWave: {
    pal: [LB_CRIM, LB_RED], hitR: 2.6,
    skill(kit, e, u) { kit.ring(u.x, u.z, 2.2, LB_RED, 0.3); kit.flash(u.x, 1.6, u.z, LB_RED, 30, 0.2); muz(kit, u, e.a, 3.0, LB_CRIM, LB_RED); return true; },
    shotMake(kit, s, row) {
      const a = Math.atan2(s.dz, s.dx), life = (row.range || 7) / (row.speed || 22) + 0.15;
      crescent(kit, s.x, s.z, a, 3.6, 1.0, 1, LB_RED, life, 1.9, 1.0, row.speed || 22, 0.06, { edge: LB_GOLD, spark: LB_GOLD });
      crescent(kit, s.x, s.z, a, 1.7, 1.1, -1, LB_GOLD, life * 0.9, 0.45, 0.8, row.speed || 22, 0.06, { additive: true, sparks: false });
      return {};
    },
    shot(kit, v, s, x, y, z, dt) {
      if (Math.random() < 0.8) { const o = R(-1.6, 1.6); kit.glow(x - s.dz * o, 0.2, z + s.dx * o, LB_GOLD, 0.4, 0.35, 0.9, kit.K.FLAME, 1.4, 0, R(1, 2.5), 0); }
      if (Math.random() < 0.5) kit.puffs(x, 0.4, z, 1, LB_DARK, 0.6, 1, 0.6, 0.8, 2, 0.4, 0.35, kit.K.SMOKE);
      return true;
    },
    shotEnd(kit, v, s, x, z) { kit.sparks(x, 1, z, kit.N(8), LB_RED, 8, 0.3, 0.05, 0.6, 10); },
  },
  // Chiến Thần: a ring of crimson flame spikes and the blue-rimmed hexagram on the press; for the 6 s a red fire sphere rides him,
  // embers stream up, and the hexagram flares under him every second
  lbGod: {
    pal: [LB_CRIM, LB_RED], hitR: 2.6,
    skill(kit, e, u, row) {
      spikes(kit, u.x, u.z, 12, 1.7, 2.4, LB_RED, 0.9, { core: 0x3a0804 });
      burst(kit, u.x, u.z, 5.5, LB_CRIM, LB_RED, { life: 0.9 }); sigil(kit, u.x, u.z, 4.6, LB_RED, { c2: LB_GOLD, n: 6, m: 2, life: 1.4, rev: 0.2, spin: 1, fill: 0.45, alpha: 0.8 });
      sigil(kit, u.x, u.z, 3.4, LB_BLUE, { c2: LB_GOLD, n: 6, m: 2, life: 1.3, rev: 0.25, spin: 0.8, fill: 0.08 });
      kit.glow(u.x, 1.5, u.z, LB_GOLD, 0.25, 4, 1, kit.K.STAR, 1.4); kit.flash(u.x, 2, u.z, LB_RED, 60, 0.35); kit.kick(u.x, u.z, 0.5);
      shell(kit, u.x, 1.1, u.z, 2.4, LB_RED, { c2: LB_GOLD, p: 1.0, core: 0.4, bands: 2.2, follow: u, life: row.dur || 6, grow: 0.25, pulse: 1.2 });
      let acc = 0;
      kit.follow(u, row.dur || 6, (t, dt) => {
        if (t > 0.5 && !(u.tfT > 0)) return;
        if (Math.random() < 0.7) { const a = Math.random() * 6.283; kit.glow(u.x + Math.cos(a) * 1.2, R(0.2, 1), u.z + Math.sin(a) * 1.2, Math.random() < 0.6 ? LB_RED : LB_GOLD, 0.6, 0.3, 1, kit.K.FLAME, 1.2, 0, R(2, 4), 0); }
        acc += dt; if (acc > 1) { acc = 0; sigil(kit, u.x, u.z, 2.4, LB_RED, { c2: LB_GOLD, n: 6, m: 2, life: 0.6, rev: 0.1, inner: 0, alpha: 0.7, follow: u }); }
      });
      return true;
    },
    transform(kit, e) { if (!e.on) kit.ring(e.x, e.z, 2.2, LB_RED, 0.3, 0.6); return true; },
  },
};

// ---- Tào Tháo: violet smoke and magenta, a gold-hilted sword ---------------------------------------------------------
const TT_VIO = C(1.25, 0.2, 2.1), TT_MAG = C(2.2, 0.3, 1.5), TT_SMOKE = C(0.16, 0.04, 0.22), TT_GOLD = C(2.2, 1.6, 0.6);
const taothao = {
  // Kiếm Khí: a violet sword-qi crescent with the Ỷ Thiên sword at its heart, trailing dark smoke
  ttQi: {
    pal: [TT_VIO, TT_MAG], hitR: 2.4,
    skill(kit, e, u) { kit.glow(u.x, 1.4, u.z, TT_VIO, 0.2, 2, 0.8, kit.K.GLOW, 1.3); muz(kit, u, e.a, 3.0, TT_VIO, TT_MAG); return true; },
    shotMake(kit, s, row) {
      const a = Math.atan2(s.dz, s.dx), life = (row.range || 12) / (row.speed || 30) + 0.1;
      crescent(kit, s.x, s.z, a, 3.2, 1.3, 1, TT_VIO, life, 1.4, 1.35, row.speed || 30, 0.05, { edge: TT_MAG, spark: TT_MAG });
      const g = weapon('sword', 0xe8d27a, TT_MAG); g.scale.setScalar(0.8);
      return { g, h: held(kit, [g]), a };
    },
    shot(kit, v, s, x, y, z) {
      v.g.position.set(x - s.dx * 0.6, 1.3, z - s.dz * 0.6); v.g.rotation.set(0, -v.a, 0);
      if (Math.random() < 0.7) kit.puffs(x - s.dx, 1.1, z - s.dz, 1, TT_SMOKE, 0.3, 0.6, 0.7, 0.7, 2.2, 0.3, 0.55, kit.K.SMOKE);
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.h.on = false; kit.sparks(x, 1.2, z, kit.N(8), TT_MAG, 7, 0.3, 0.05, 0.5, 8); },
  },
  // Liên Trảm: each pass leaves a violet X of claw-slashes on the victim and a smoke puff; his path is a dark violet streak
  ttFlurry: {
    pal: [TT_VIO, TT_MAG], hit() {},
    skill(kit, e, u) {
      kit.puffs(u.x, 0.8, u.z, kit.N(6), TT_SMOKE, 0.8, 2, 0.8, 1.2, 2.2, 0.6, 0.7, kit.K.SMOKE);
      burst(kit, u.x, u.z, 2.4, TT_SMOKE.clone().multiplyScalar(3), TT_VIO, { life: 0.5 });
      trail(kit, (t) => (t < 1.2 && u.alive ? [u.x, 1.0, u.z] : null), 0.7, TT_VIO, 1.6, { c2: TT_MAG, len: 20 });
      return true;
    },
    flurry(kit, e) {
      const a = Math.random() * 3.14;
      for (const d of [0.7, -0.7]) { const b = kit.beam(e.x - Math.cos(a + d) * 2.2, e.z - Math.sin(a + d) * 2.2, e.x + Math.cos(a + d) * 2.2, e.z + Math.sin(a + d) * 2.2, 0.55, d > 0 ? TT_VIO : TT_MAG, 0.3, 2, 1.3); b.fade = true; }
      kit.glow(e.x, 1.3, e.z, TT_MAG, 0.15, 2.2, 1, kit.K.STAR, 1.4); kit.puffs(e.x, 1, e.z, kit.N(3), TT_SMOKE, 0.5, 1.5, 0.6, 1, 2, 0.5, 0.6, kit.K.SMOKE);
      burst(kit, e.x, e.z, 2.8, TT_MAG, C(2.5, 1.6, 2.2), { life: 0.45 });
      kit.sparks(e.x, 1.3, e.z, kit.N(8), TT_VIO, 9, 0.3, 0.05, 0.5, 10);
      return true;
    },
  },
  // Bá Vương: dark violet smoke wings stream off him, a thin magenta ring of 5 m rides with him and a violet vortex turns at his feet
  ttDemon: {
    pal: [TT_VIO, TT_MAG], hitR: 2.2,
    skill(kit, e, u, row) {
      const d = row.dur || 6;
      sigil(kit, u.x, u.z, 5, TT_MAG, { n: 0, ticks: 0, inner: 0, fill: 0.03, w: 0.016, life: d, rev: 0.3, follow: u, spin: 0 });
      burst(kit, u.x, u.z, 5, TT_VIO, TT_MAG, { life: 0.9 }); sigil(kit, u.x, u.z, 4.4, TT_SMOKE.clone().multiplyScalar(4), { c2: TT_VIO, n: 5, m: 2, life: d, rev: 0.3, follow: u, spin: 1.2, fill: 0.35, alpha: 0.7 });
      sigil(kit, u.x, u.z, 1.6, TT_VIO, { c2: TT_MAG, n: 5, m: 2, ticks: 10, life: d, rev: 0.2, follow: u, spin: 3, fill: 0.2, y: 0.18 });
      kit.puffs(u.x, 1, u.z, kit.N(10), TT_SMOKE, 1.2, 3, 1, 1.4, 2.4, 1, 0.8, kit.K.SMOKE); kit.flash(u.x, 2, u.z, TT_VIO, 40, 0.3);
      kit.follow(u, d, (t) => {
        if (t > 0.5 && !(u.tfT > 0)) return;
        // two smoke wings: puffs thrown sideways and back from the turret line
        for (const side of [1, -1]) if (Math.random() < 0.55) {
          const a = u.aim + Math.PI + side * 0.9, s = R(1.5, 3);
          kit.ovr.emit(u.x + Math.cos(a) * 0.8, R(1.2, 2.2), u.z + Math.sin(a) * 0.8, Math.cos(a) * s, R(0.6, 1.5), Math.sin(a) * s, TT_SMOKE, R(0.6, 0.9), R(0.6, 1), 2.4, 1.5, -0.6, 0.7, kit.K.SMOKE);
          if (Math.random() < 0.4) kit.glow(u.x + Math.cos(a) * 1.2, 1.7, u.z + Math.sin(a) * 1.2, TT_VIO, 0.5, 0.5, 0.8, kit.K.FLAME, 1.4, Math.cos(a) * s, 1, Math.sin(a) * s);
        }
      });
      return true;
    },
    transform(kit, e) { if (!e.on) kit.puffs(e.x, 1, e.z, kit.N(6), TT_SMOKE, 1, 2, 0.8, 1.2, 2, 0.6, 0.6, kit.K.SMOKE); return true; },
  },
};

// ---- Tư Mã Ý: black void orbs with indigo rims and white-violet lightning ---------------------------------------------
const SM_IND = C(0.6, 0.15, 2.4), SM_ARC = C(1.6, 1.3, 2.6), SM_AMBER = C(2.4, 1.4, 0.35), SM_VOID = 0x07020d;
function voidOrb(r) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: SM_VOID, toneMapped: false });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m));
  g.userData.mats = [m];
  return g;
}
function crackle(kit, x, y, z, r, c, n = 2) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, b = R(-1, 1); kit.str.emit(x + Math.cos(a) * r, y + b * r * 0.6, z + Math.sin(a) * r, -Math.sin(a) * 3, R(-1, 1), Math.cos(a) * 3, c, 0.08, 0.05, 0.08, 0, 0, 1); } }
const tumay = {
  // Ám Cầu: a black orb in an indigo halo crackling with lightning; it caves in on itself where it lands
  smOrb: {
    pal: [SM_IND, SM_ARC], hitR: 2.6,
    skill(kit, e, u) { kit.glow(u.x, 1.4, u.z, SM_IND, 0.2, 1.6, 0.7, kit.K.GLOW, 1.2); muz(kit, u, e.a, 3.0, SM_IND, SM_ARC); return true; },
    shotMake(kit, s) {
      const g = voidOrb(0.85), halo = shell(kit, s.x, 1.4, s.z, 1.35, SM_IND, { c2: SM_ARC, p: 1.2, core: 0.1, life: 1e9 });
      const h = held(kit, [g]);
      return { g, halo, h };
    },
    shot(kit, v, s, x, y, z) {
      v.g.position.set(x, 1.4, z); v.halo.position.set(x, 1.4, z);
      crackle(kit, x, 1.4, z, 0.55, SM_ARC, 2);
      if (Math.random() < 0.6) kit.str.emit(x, 1.4, z, -s.dx * 6, 0, -s.dz * 6, SM_IND, 0.25, 0.25, 0.1, 0, 0, 0.8);
      return true;
    },
    shotEnd(kit, v, s, x, z) {
      v.h.on = false; stop(v.halo);
      shell(kit, x, 1.2, z, 2, SM_IND, { c2: SM_ARC, p: 1.2, life: 0.35, step: (t, m) => m.scale.setScalar(2 * (1 - t / 0.35) + 0.05) });
      sigil(kit, x, z, 1.8, SM_IND, { c2: SM_ARC, n: 7, m: 3, life: 0.6, rev: 0.12, spin: -2 });
      crackle(kit, x, 1.2, z, 1.2, SM_ARC, 8); kit.flash(x, 1.5, z, SM_IND, 30, 0.2);
      burst(kit, x, z, 3, SM_IND, SM_ARC, { life: 0.5 });
    },
  },
  // Kim Thiền Thoát Xác: the amber husk he sheds stays behind (a cicada's shell) wrapped in two circling void orbs; he steps out
  // of an indigo rift at the far end. The husk caves in with amber shards when it goes off.
  smWarp: {
    pal: [SM_IND, SM_AMBER],
    zones: ['decoy'],
    skill() { return true; },
    warp(kit, e) {
      shell(kit, e.x0, 1.1, e.z0, 1.3, SM_AMBER, { c2: C(0.6, 0.25, 0.05), p: 2.4, life: 0.5, grow: 0.08 });
      kit.puffs(e.x0, 0.9, e.z0, kit.N(8), C(0.12, 0.05, 0.18), 0.9, 2, 0.8, 1.1, 2.2, 0.6, 0.7, kit.K.SMOKE);
      sigil(kit, e.x, e.z, 2.2, SM_IND, { c2: SM_ARC, n: 7, m: 3, life: 0.7, rev: 0.1, spin: 3 });
      shell(kit, e.x, 1.2, e.z, 1.4, SM_IND, { c2: SM_ARC, p: 1.4, life: 0.4, step: (t, m) => m.scale.setScalar(1.4 * (1 - t / 0.4) + 0.05) });
      crackle(kit, e.x, 1.2, e.z, 1, SM_ARC, 6); kit.flash(e.x, 1.6, e.z, SM_IND, 30, 0.2);
      burst(kit, e.x0, e.z0, 2.6, SM_AMBER, C(2.4, 2, 1.2), { life: 0.55 }); burst(kit, e.x, e.z, 2.8, SM_IND, SM_ARC, { life: 0.55 });
      return true;
    },
    zoneMake(kit, z) {
      const husk = shell(kit, z.x, 1.1, z.z, 1.15, SM_AMBER, { c2: C(0.5, 0.2, 0.04), p: 2.6, core: 0.02, life: 1e9, alpha: 0.6, bands: 3 });
      const o1 = voidOrb(0.22), o2 = voidOrb(0.22), h = held(kit, [o1, o2]);
      return { husk, o1, o2, h, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; v.husk.position.set(z.x, 1.1, z.z);
      for (const [o, ph] of [[v.o1, 0], [v.o2, Math.PI]]) { const a = v.t * 3 + ph; o.position.set(z.x + Math.cos(a) * 1.3, 1.5 + 0.3 * Math.sin(a * 2), z.z + Math.sin(a) * 1.3); if (Math.random() < 0.3) kit.glow(o.position.x, o.position.y, o.position.z, SM_IND, 0.25, 0.6, 0.8, kit.K.GLOW, 1.2); }
      if (Math.random() < dt * 6) crackle(kit, z.x, 1.1, z.z, 1.1, SM_AMBER, 1);
    },
    zoneDrop(kit, v) { v.h.on = false; stop(v.husk); },
    land(kit, e) {
      shell(kit, e.x, 1.1, e.z, 2.6, SM_IND, { c2: SM_ARC, p: 1.3, life: 0.35, step: (t, m) => m.scale.setScalar(2.6 * (1 - t / 0.35) + 0.05) });
      kit.chips(e.x, 1, e.z, kit.N(12), SM_AMBER, 7, 0.8, 0.16); crackle(kit, e.x, 1.2, e.z, 1.5, SM_ARC, 10);
      kit.flash(e.x, 1.8, e.z, SM_AMBER, 40, 0.25); kit.kick(e.x, e.z, 0.3);
      return true;
    },
  },
  // Màn Đêm: a dark dome of night over the area, a slow indigo seven-point sigil on the floor, four void orbs circling inside
  // and lightning snapping between them
  smNight: {
    pal: [SM_IND, SM_ARC], hitR: 1.8,
    zoneMake(kit, z) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x0a0418, transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat); dome.renderOrder = 7;
      dome.position.set(z.x, 0, z.z); dome.scale.set(z.r, z.r * 0.45, z.r);
      const rim = shell(kit, z.x, 0, z.z, z.r, SM_IND, { c2: C(0.05, 0, 0.12), p: 3.2, core: 0, dome: true, squash: 0.45, life: 1e9, alpha: 0.7 });
      const sg = sigil(kit, z.x, z.z, z.r, SM_IND, { c2: SM_ARC, n: 7, m: 3, ticks: 28, life: 1e9, rev: 0.4, spin: 0.25, fill: 0.1 });
      const orbs = [voidOrb(0.3), voidOrb(0.3), voidOrb(0.3), voidOrb(0.3)];
      const h = held(kit, [dome, ...orbs]);
      return { dome, mat, rim, sg, orbs, h, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; const k = Math.min(1, v.t / 0.4, (z.dur - z.age) * 2);
      v.mat.opacity = 0.42 * k;
      v.orbs.forEach((o, i) => { const a = v.t * 0.8 + i * 1.571, rr = z.r * 0.55; o.position.set(z.x + Math.cos(a) * rr, 1.6 + 0.3 * Math.sin(v.t * 2 + i), z.z + Math.sin(a) * rr); });
      if (Math.random() < dt * 4) { const i = Math.floor(Math.random() * 4), j = (i + 1) % 4, p = v.orbs[i].position, q = v.orbs[j].position; const b = kit.beam(p.x, p.z, q.x, q.z, 0.35, SM_ARC, 0.15, 3, 1.6); b.fade = true; }
      for (const o of v.orbs) if (Math.random() < 0.3) kit.glow(o.position.x, o.position.y, o.position.z, SM_IND, 0.3, 0.8, 0.8, kit.K.GLOW, 1.2);
      if (Math.random() < dt * 10) { const a = Math.random() * 6.283, d = Math.random() * z.r; kit.ovr.emit(z.x + Math.cos(a) * d, 0.4, z.z + Math.sin(a) * d, 0, 0.3, 0, C(0.05, 0.02, 0.1), 1.4, 1.4, 2, 0.8, 0, 0.5, kit.K.SMOKE); }
    },
    zoneDrop(kit, v) { v.h.on = false; stop(v.rim); stop(v.sg); },
  },
};

// ---- Athena: gold and white light, green-gold sparkles ----------------------------------------------------------------
const AT_GOLD = C(2.4, 1.15, 0.05), AT_WHITE = C(2.5, 1.9, 0.5), AT_LEAF = C(0.9, 2.1, 0.55), AT_SKY = C(0.6, 1.3, 2.4);
const athena = {
  // Khiên Bay: the aegis, a gold round shield spinning flat, leaves a gold ribbon there and back
  atShield: {
    pal: [AT_SKY, AT_GOLD], hitR: 2.6,
    skill(kit, e, u) { kit.glow(u.x, 1.4, u.z, AT_GOLD, 0.2, 1.8, 0.8, kit.K.STAR, 1.3); muz(kit, u, e.a, 3.0, AT_SKY, AT_GOLD); return true; },
    shotMake(kit, s) {
      const g = weapon('shield', 0xd9b04a, AT_GOLD); g.scale.setScalar(2);
      const v = { g, h: held(kit, [g]), x: s.x, z: s.z, live: true };
      trail(kit, () => (v.live ? [v.x, 1.25, v.z] : null), 1.6, AT_SKY, 3, { c2: AT_WHITE, len: 12 });
      return v;
    },
    shot(kit, v, s, x, y, z, dt) {
      v.x = x; v.z = z; v.g.position.set(x, 1.3, z); v.g.rotation.y += dt * 14;
      if (Math.random() < 0.4) kit.glow(x, 1.3, z, AT_WHITE, 0.2, 0.7, 0.8, kit.K.STAR, 1.2);
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.live = false; v.h.on = false; kit.sparks(x, 1.3, z, kit.N(8), AT_GOLD, 7, 0.3, 0.05, 0.5, 8); },
  },
  // Khiên Thần: a gold column of light drops on the ally, green-gold sparkles climb, a faint gold shell holds for the shield's time
  atBless: {
    pal: [AT_GOLD, AT_WHITE],
    skill() { return true; },
    bless(kit, e, u, row) {
      const o = kit.match.units[e.to]; if (!o) return true;
      pillar(kit, o.x, o.z, 1.0, AT_GOLD, { c2: AT_WHITE, h: 12, life: 0.75, grow: 0.12, drop: true, rings: 2 });
      burst(kit, o.x, o.z, 3.2, AT_SKY, AT_GOLD, { life: 0.7 }); pillar(kit, o.x, o.z, 1.8, AT_GOLD, { c2: AT_WHITE, h: 12, life: 0.9, grow: 0.1, drop: true, rings: 2 });
      kit.ring(o.x, o.z, 2.2, AT_GOLD, 0.4); kit.ring(o.x, o.z, 1.3, AT_LEAF, 0.5, 0.8);
      for (let i = 0; i < kit.N(14); i++) { const a = Math.random() * 6.283, d = R(0.3, 1.3); kit.glow(o.x + Math.cos(a) * d, R(0.2, 1.4), o.z + Math.sin(a) * d, i % 2 ? AT_LEAF : AT_GOLD, R(0.6, 1), 0.3, 1, kit.K.STAR, 1, 0, R(1.5, 3), 0); }
      shell(kit, o.x, 1.0, o.z, 1.45, AT_GOLD, { c2: AT_SKY, p: 2.8, core: 0.03, bands: 1.5, follow: o, life: row.dur || 4, grow: 0.2, alpha: 0.75 });
      kit.flash(o.x, 3, o.z, AT_GOLD, 40, 0.3);
      if (u !== o) { const b = kit.beam(u.x, u.z, o.x, o.z, 0.4, AT_GOLD, 0.3, 2, 1.6); b.fade = true; }
      return true;
    },
  },
  // Kết Giới: a gold-white dome banded with light, an eight-point gold star on the floor, motes of light rising inside
  atAegis: {
    pal: [AT_GOLD, AT_WHITE],
    zones: ['dome'],
    skill(kit, e, u) { pillar(kit, u.x, u.z, 1.4, AT_GOLD, { c2: AT_WHITE, h: 14, life: 0.7, grow: 0.12, drop: true }); kit.flash(u.x, 3, u.z, AT_GOLD, 50, 0.35); return true; },
    zoneMake(kit, z) {
      const d = shell(kit, z.x, 0, z.z, z.r, AT_GOLD, { c2: AT_SKY, p: 1.3, core: 0.32, bands: 0.6, dome: true, life: 1e9, grow: 0.25, alpha: 0.85 });
      const s = sigil(kit, z.x, z.z, z.r, AT_SKY, { c2: AT_GOLD, n: 8, m: 3, ticks: 32, life: 1e9, rev: 0.35, spin: 0.2, fill: 0.55 });
      return { d, s, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt;
      if (Math.random() < dt * 14) { const a = Math.random() * 6.283, r = Math.random() * z.r * 0.9; kit.glow(z.x + Math.cos(a) * r, 0.2, z.z + Math.sin(a) * r, Math.random() < 0.3 ? AT_LEAF : AT_GOLD, 1.2, 0.25, 1, kit.K.STAR, 1, 0, R(1.5, 3), 0); }
    },
    zoneDrop(kit, v) { stop(v.d); stop(v.s); },
  },
};

// ---- Hades: ice-blue soul fire, a scythe, a rune circle, a column of rings ------------------------------------------
const HD_ICE = C(0.45, 1.25, 2.6), HD_SOUL = C(0.6, 2.2, 2.3), HD_DEEP = C(0.08, 0.25, 1.1), HD_BONE = 0xcfe2ff;
const hades = {
  // Ám Lưu: a ghostly scythe sweeps out of him and a cold soul wisp flies off, a skull-white core in a wavering blue tail
  hdSouls: {
    pal: [HD_ICE, HD_SOUL], hitR: 2.6,
    skill(kit, e, u) {
      crescent(kit, u.x, u.z, e.a, 3.0, 1.4, 1, HD_ICE, 0.45, 1.1, 1.25, 0, 0.12, { edge: HD_SOUL, spark: HD_SOUL });
      muz(kit, u, e.a, 3.0, HD_ICE, HD_SOUL);
      const g = weapon('scythe', HD_BONE, HD_ICE, { opacity: 0.85 }); g.scale.setScalar(0.75);
      own(kit, [g], 0.35, (t) => { const a = e.a + 1.2 - t * 6; g.position.set(u.x, 1.6, u.z); g.rotation.set(0, -a, 0); fadeWeapon(g, Math.min(1, (0.35 - t) / 0.15)); });
      return true;
    },
    shotMake(kit, s) {
      const v = { x: s.x, z: s.z, live: true, t: 0 };
      trail(kit, () => (v.live ? [v.x, 1.3 + 0.15 * Math.sin(v.t * 30), v.z] : null), 0.7, HD_ICE, 2, { c2: HD_DEEP, len: 18 });
      shell(kit, s.x, 1.35, s.z, 0.95, HD_SOUL, { c2: HD_ICE, p: 1.2, core: 0.3, life: 1e9, step: (t, m) => (v.live ? (m.position.set(v.x, 1.35, v.z), true) : false) });
      return v;
    },
    shot(kit, v, s, x, y, z, dt) {
      v.t += dt; const w = Math.sin(v.t * 22) * 0.35; v.x = x - s.dz * w; v.z = z + s.dx * w;
      kit.glow(v.x, 1.35, v.z, HD_SOUL, 0.08, 0.9, 1, kit.K.STAR, 1);
      kit.glow(v.x, 1.35, v.z, HD_ICE, 0.12, 1.4, 0.7, kit.K.GLOW, 1.2);
      if (Math.random() < 0.6) kit.glow(v.x, 1.35, v.z, HD_ICE, 0.4, 0.45, 0.8, kit.K.FLAME, 1.4, 0, 1.2, 0);
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.live = false; kit.sparks(x, 1.3, z, kit.N(10), HD_SOUL, 7, 0.35, 0.05, 0.6, 6); kit.ring(x, z, 1.5, HD_ICE, 0.3); },
  },
  // Bàn Tay Âm Giới: a blue five-point rune circle spreads where the hand will come; a skeletal hand bursts up out of it and
  // clenches round whoever stands there
  hdHand: {
    pal: [HD_ICE, HD_SOUL],
    zones: ['strike'],
    skill() { return true; },
    zoneMake(kit, z) { return { s: sigil(kit, z.x, z.z, Math.max(2.2, z.r), HD_ICE, { c2: HD_SOUL, n: 5, m: 2, alpha: 1, w: 0.08, life: (z.delay || 0.6) + 1.6, rev: z.delay || 0.6, spin: 1.2, fill: 0.12 }) }; },
    zone(kit, v, z, dt) { if (Math.random() < dt * 20) { const a = Math.random() * 6.283, d = Math.random() * z.r; kit.glow(z.x + Math.cos(a) * d, 0.2, z.z + Math.sin(a) * d, HD_ICE, 0.5, 0.3, 1, kit.K.SPARK, 1, 0, R(1, 2.5), 0); } },
    land(kit, e) {
      const g = weapon('hand', HD_BONE, HD_ICE, { opacity: 0.95 }); g.scale.setScalar(2);
      g.position.set(e.x, -2, e.z); g.rotation.y = Math.random() * 6.283;
      own(kit, [g], 1.7, (t) => {
        const up = Math.min(1, t / 0.18), down = t > 1.35 ? (t - 1.35) / 0.35 : 0;
        g.position.y = -2.4 + 2.6 * up - 2.6 * down;
        g.scale.set(2, 2 * (t > 0.3 && t < 1.35 ? 0.82 : 1), 2 * (t > 0.3 && t < 1.35 ? 0.7 : 1));
        if (Math.random() < 0.3) kit.glow(e.x, 1.4, e.z, HD_SOUL, 0.3, 0.8, 0.8, kit.K.FLAME, 1.3, 0, 1.5, 0);
      });
      kit.ring(e.x, e.z, 3, HD_ICE, 0.35); kit.chips(e.x, 0.3, e.z, kit.N(10), C(0.25, 0.3, 0.4), 6, 0.8, 0.16);
      burst(kit, e.x, e.z, 3.4, HD_ICE, HD_SOUL, { life: 0.6 }); sigil(kit, e.x, e.z, 3.4, HD_DEEP.clone().multiplyScalar(2), { c2: HD_ICE, n: 5, m: 2, life: 1.6, rev: 0.05, fill: 0.5, alpha: 0.8 });
      kit.puffs(e.x, 0.4, e.z, kit.N(6), C(0.5, 0.75, 1), 1.2, 2.5, 0.9, 1, 2.2, 0.4, 0.45, kit.K.DUST);
      kit.flash(e.x, 1.5, e.z, HD_ICE, 40, 0.25); kit.kick(e.x, e.z, 0.4);
      return true;
    },
  },
  // Cửa Âm Phủ: a dark gate on the floor, a fast nine-point blue spiral, a column of rings at the centre and a sphere of blue
  // light; soul streaks are drawn in toward the middle
  hdGate: {
    pal: [HD_ICE, HD_SOUL], hitR: 1.8,
    zoneMake(kit, z) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x02040c, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), mat); disc.position.set(z.x, 0.11, z.z); disc.scale.setScalar(z.r * 0.95); disc.renderOrder = 3;
      const h = held(kit, [disc]);
      const s = sigil(kit, z.x, z.z, z.r, HD_ICE, { c2: HD_SOUL, n: 9, m: 4, ticks: 36, life: 1e9, rev: 0.3, spin: -2.2, fill: 0.08 });
      const p = pillar(kit, z.x, z.z, 1.3, HD_ICE, { c2: HD_SOUL, h: 9, life: 1e9, rings: 3, grow: 0.2 });
      const b = shell(kit, z.x, 1.3, z.z, z.r * 0.42, HD_ICE, { c2: HD_DEEP, p: 1.8, core: 0.05, bands: 1.2, life: 1e9, grow: 0.3, alpha: 0.8 });
      return { mat, h, s, p, b, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; v.mat.opacity = 0.6 * Math.min(1, v.t / 0.3, (z.dur - z.age) * 3);
      for (let i = 0; i < 2; i++) if (Math.random() < 0.8) { const a = Math.random() * 6.283; kit.str.emit(z.x + Math.cos(a) * z.r, R(0.3, 1.6), z.z + Math.sin(a) * z.r, -Math.cos(a) * 9 - Math.sin(a) * 6, 0, -Math.sin(a) * 9 + Math.cos(a) * 6, i ? HD_ICE : HD_SOUL, 0.35, 0.07, 0.06, 0, 0, 1); }
    },
    zoneDrop(kit, v, z, ended) {
      v.h.on = false; stop(v.s); stop(v.p); stop(v.b);
      if (ended && z) { kit.flash(z.x, 2, z.z, HD_ICE, 50, 0.3); kit.ring(z.x, z.z, z.r, HD_SOUL, 0.35); }
    },
  },
};

// ---- Sứa Trắng: pearl-white jellyfish, glowing tentacles, bubbles, pink stings -------------------------------------
const SJ_PEARL = C(1.9, 2.15, 2.4), SJ_JELLY = C(0.15, 0.85, 2.2), SJ_PINK = C(2.3, 0.35, 1.4);
// a jellyfish bell over (x, y, z): a squashed dome of light with n tentacle ribbons hanging and swaying
function bell(kit, at, r, life, n = 6) {
  const d = shell(kit, 0, 0, 0, r, SJ_JELLY, { c2: SJ_PINK, p: 1.0, core: 0.6, bands: 1.6, dome: true, squash: 0.7, life, grow: 0.15, alpha: 1,
    step: (t, m) => { const p = at(t); if (!p) return false; m.position.set(p[0], p[1], p[2]); } });
  strands(kit, (t) => { const p = at(t); return p && [p[0], p[1] + 0.1, p[2]]; }, r * 0.7, n, Math.min(3.2, p0y(at) - 0.1), SJ_JELLY, life, { c2: SJ_PINK, w: 0.09, sway: 0.4 });
  return d;
}
const p0y = (at) => { const p = at(0); return p ? p[1] : 2; };
const bubbles = (kit, x, z, n, c = SJ_PEARL) => { for (let i = 0; i < kit.N(n); i++) { const a = Math.random() * 6.283, d = R(0.2, 1.4); kit.glow(x + Math.cos(a) * d, R(0.2, 1), z + Math.sin(a) * d, c, R(0.8, 1.4), R(0.15, 0.35), 0.9, kit.K.GLOW, 1, R(-0.3, 0.3), R(0.8, 1.8), R(-0.3, 0.3)); } };
const suatrang = {
  // Bong Bóng Hồi: a pearl bubble closes round the ally and stays for the heal's time, little bubbles rising off it
  sjBubble: {
    pal: [SJ_JELLY, SJ_PINK],
    skill() { return true; },
    bless(kit, e, u, row) {
      const o = kit.match.units[e.to]; if (!o) return true;
      const dur = (row.hot && row.hot.dur) || 4;
      burst(kit, o.x, o.z, 3, SJ_JELLY, SJ_PINK, { life: 0.7 });
      shell(kit, o.x, 1.2, o.z, 2.3, SJ_JELLY, { c2: SJ_PINK, p: 0.9, core: 0.8, bands: 2.5, follow: o, life: dur, grow: 0.2, pulse: 0.8, alpha: 1 });
      sigil(kit, o.x, o.z, 2.8, SJ_PINK, { c2: SJ_JELLY, n: 0, ticks: 12, inner: 0.6, life: dur, rev: 0.2, spin: 0.8, fill: 0.25, follow: o, w: 0.05 });
      kit.follow(o, dur, () => { if (Math.random() < 0.35) bubbles(kit, o.x, o.z, 1); });
      if (u !== o) trail(kit, (t) => (t < 0.25 ? [u.x + (o.x - u.x) * t / 0.25, 1.2, u.z + (o.z - u.z) * t / 0.25] : null), 0.35, SJ_PINK, 0.6, { c2: SJ_PEARL, len: 10 });
      bubbles(kit, o.x, o.z, 10);
      return true;
    },
  },
  // Bay Đỡ: she floats over as a jellyfish bell trailing tentacles; on landing a pearl ring pulses and every ally there gets a
  // bubble for the shield's time
  sjFloat: {
    pal: [SJ_JELLY, SJ_PINK],
    skill() { return true; },
    leap(kit, e, u, row) {
      const dur = e.dur || 0.5;
      bell(kit, (t) => (t < dur + 0.15 && u.alive ? [u.x, 2.2 + Math.sin(Math.min(1, t / dur) * Math.PI) * 1.2, u.z] : null), 2.4, dur + 0.5, 7); burst(kit, u.x, u.z, 2.8, SJ_JELLY, SJ_PINK, { life: 0.6 });
      kit.anims.push({ t: 0, step(dt) { this.t += dt; if (this.t < dur) return true;
        kit.ring(u.x, u.z, row.radius || 4, SJ_PEARL, 0.45); kit.ring(u.x, u.z, (row.radius || 4) * 0.6, SJ_PINK, 0.35, 0.7);
        for (const o of kit.match.units) if (o.alive && o.team === u.team && Math.hypot(o.x - u.x, o.z - u.z) < (row.radius || 4)) shell(kit, o.x, 1.0, o.z, 1.35, SJ_JELLY, { c2: SJ_PINK, p: 2.6, core: 0.03, follow: o, life: row.shieldDur || 3, grow: 0.15, alpha: 0.75 });
        bubbles(kit, u.x, u.z, 16); kit.flash(u.x, 2, u.z, SJ_PEARL, 30, 0.25);
        return false; }, drop() {} });
      return true;
    },
  },
  // Cấp Cứu: a great jellyfish canopy hangs over her for the field's time, tentacles glowing down to the floor, a pearl ring
  // on the ground and bubbles drifting up
  sjCare: {
    pal: [SJ_JELLY, SJ_PINK],
    zoneMake(kit, z) {
      const v = { x: z.x, z: z.z, live: true };
      bell(kit, () => (v.live ? [v.x, 3.2, v.z] : null), z.r * 0.42, 1e9, 10);
      const s = sigil(kit, z.x, z.z, z.r, SJ_JELLY, { c2: SJ_PINK, n: 0, ticks: 20, inner: 0.7, life: 1e9, rev: 0.3, spin: 0.3, fill: 0.4, alpha: 0.85 }); burst(kit, z.x, z.z, 4.5, SJ_JELLY, SJ_PINK, { life: 1.0 });
      v.s = s;
      return v;
    },
    zone(kit, v, z, dt) {
      v.x = z.x; v.z = z.z; v.s.position.x = z.x; v.s.position.z = z.z;
      if (Math.random() < dt * 10) bubbles(kit, z.x + R(-z.r, z.r) * 0.6, z.z + R(-z.r, z.r) * 0.6, 1, Math.random() < 0.3 ? SJ_PINK : SJ_PEARL);
    },
    zoneDrop(kit, v) { v.live = false; stop(v.s); },
  },
};

export const B1 = { ...lubo, ...taothao, ...tumay, ...athena, ...hades, ...suatrang };
