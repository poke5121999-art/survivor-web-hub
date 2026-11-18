// Looks, batch 1: Lữ Bố, Tào Tháo, Tư Mã Ý (Athena moved to looks-k2.js, Hades to looks-k15.js, Sứa Trắng / Baymax to looks-k14.js with their ported kits). Render only (see looks.js for the hooks).
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP.md):
//   吕布 p9: a thrown halberd with a red trident head, a red fire orb round him after every cast, flame spikes and a gold flare
//     where he blinks in, a thin fiery orange-gold sweep, a red hexagram in a thin blue ring with a gold star at the ult's landing.
//   曹操 p11: dark violet smoke wings, a thin magenta ring round him, a violet vortex at his feet, a violet claw-slash and violet
//     crescent sword-qi.
//   司马懿 p12: Tư Mã Ý's looks moved to looks-k4.js with his ported kit (kit lane K4).
//   冥王 p72: Hades' looks moved to looks-k15.js with his ported kit (kit lane k15).
//   Sứa Trắng: Baymax's looks moved to looks-k14.js with his ported kit (kit lane k14).
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, slash, cut, sigil, shell, pillar, trail, strands, weapon, fadeWeapon, spikes, burst, gate } from './lookkit.js';
// a muzzle flash only: the caster gets no blob, the look's own shape carries it
const muz = (kit, u, a, r, c, c2) => { const x = u.x + Math.cos(a) * 1.4, z = u.z + Math.sin(a) * 1.4; kit.glow(x, 1.3, z, c2, 0.12, 1.6, 1, kit.K.STAR, 1.3); kit.flash(x, 1.5, z, c, 25, 0.15); };

const R = (a, b) => a + Math.random() * (b - a);
// a group owned until done() is called (a shot's or a zone's lifetime is decided by the sim, not by a timer)
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }

// ---- Lữ Bố: crimson and fire-gold, a blue-rimmed hexagram (clip p9 "6.吕布", kit ported in feat/dtt-kits) ---------------
// The clip: every cast wraps him in a red fire orb (the Vô Song shield); the thrown halberd flies point first with a red
// trident head and a white-hot core; Bạo Nộ lands in a burst of flame spikes and a gold flare; the recast sweep is a thin
// fiery orange-to-gold crescent with a bright edge and sparks; the ult marks its landing with a red hexagram in a thin blue
// ring and a gold star at the centre while he winds up, then he comes down in a white-gold blast.
const LB_CRIM = C(0.85, 0.02, 0.06), LB_RED = C(2.3, 0.22, 0.1), LB_GOLD = C(2.5, 1.5, 0.35), LB_DARK = C(0.6, 0.04, 0.02), LB_BLUE = C(0.45, 1.0, 2.2);
const LB_ORANGE = C(2.6, 0.75, 0.08), LB_WHITE = C(2.6, 2.2, 1.5), LB_SOOT = C(0.1, 0.03, 0.02);

// the Vô Song shield: a red fire orb riding him for the 1.5 s it lasts, embers lifting off it
function lbOrb(kit, u) {
  shell(kit, u.x, 1.1, u.z, 1.95, LB_RED, { c2: LB_ORANGE, p: 1.5, core: 0.18, bands: 1.6, follow: u, life: 1.5, grow: 0.1, pulse: 2.2, alpha: 0.8 });
  kit.follow(u, 1.4, () => { if (Math.random() < 0.35) { const a = Math.random() * 6.283; kit.glow(u.x + Math.cos(a) * 1.4, R(0.4, 1.8), u.z + Math.sin(a) * 1.4, Math.random() < 0.5 ? LB_ORANGE : LB_GOLD, 0.45, 0.28, 1, kit.K.FLAME, 1.2, 0, R(1.5, 3), 0); } });
}

// The thrown halberd: a pale shaft, a trident head (a long centre point, two short swept prongs, a cross guard) with a red
// glow shell round the head. Lies along +x, the point at +x. Built once.
let lbTri = null;
function lbTrident() {
  if (!lbTri) {
    const shaft = new THREE.CylinderGeometry(0.05, 0.065, 2.0, 6).rotateZ(Math.PI / 2).translate(-0.85, 0, 0);
    const point = new THREE.ConeGeometry(0.15, 1.15, 4).rotateZ(-Math.PI / 2).scale(1, 0.45, 1).translate(0.78, 0, 0);
    const prong = (s) => new THREE.ConeGeometry(0.09, 0.75, 4).rotateZ(-Math.PI / 2).scale(1, 0.45, 1).rotateY(-0.42 * s).translate(0.34, 0, 0.3 * s);
    const guard = new THREE.BoxGeometry(0.14, 0.07, 0.8).translate(0.05, 0, 0);
    const tassel = new THREE.ConeGeometry(0.14, 0.45, 6).rotateZ(Math.PI / 2).translate(-0.3, 0, 0);
    const glow = new THREE.ConeGeometry(0.62, 2.4, 10).rotateZ(-Math.PI / 2).scale(1, 0.4, 1).translate(0.5, 0, 0);
    lbTri = { metal: [shaft, point, prong(1), prong(-1), guard], red: [tassel], glow: [glow] };
  }
  const g = new THREE.Group();
  const m1 = new THREE.MeshBasicMaterial({ color: 0xf6ece4, toneMapped: false, transparent: true });
  const m2 = new THREE.MeshBasicMaterial({ color: 0xc8141a, toneMapped: false, transparent: true });
  const m3 = new THREE.MeshBasicMaterial({ color: LB_RED, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  for (const p of lbTri.metal) g.add(new THREE.Mesh(p, m1));
  for (const p of lbTri.red) g.add(new THREE.Mesh(p, m2));
  for (const p of lbTri.glow) g.add(new THREE.Mesh(p, m3));
  g.traverse((o) => { o.frustumCulled = false; o.renderOrder = 7; });
  g.userData.mats = [m1, m2, m3];
  return g;
}

const lubo = {
  // Tuy Viễn Tất Tru: the halberd thrown point first, a red trident head round a white-hot core, a crimson ribbon behind it;
  // each victim it passes is pinned under a small red ring (rooted)
  lbThrow: {
    pal: [LB_CRIM, LB_RED], hitR: 1.8,
    skill(kit, e, u, row) {
      lbOrb(kit, u); muz(kit, u, e.a, 3.0, LB_CRIM, LB_RED);
      return true;
    },
    shotMake(kit, s) {
      const a = Math.atan2(s.dz, s.dx), g = lbTrident(); g.scale.setScalar(2.6);
      const h = held(kit, [g]), v = { g, h, a, x: s.x, z: s.z, on: true };
      trail(kit, () => (v.on ? [v.x - Math.cos(a) * 1.6, 1.3, v.z - Math.sin(a) * 1.6] : null), 1.2, LB_RED, 2, { c2: LB_GOLD, len: 22 }); trail(kit, () => (v.on ? [v.x - Math.cos(a) * 1.6, 1.4, v.z - Math.sin(a) * 1.6] : null), 1.45, LB_CRIM, 2, { c2: LB_ORANGE, len: 22, up: true });
      return v;
    },
    shot(kit, v, s, x, y, z) {
      v.x = x; v.z = z;
      v.g.position.set(x, 1.3, z); v.g.rotation.set(0, -v.a, 0);
      const hx = x + Math.cos(v.a) * 1.9, hz = z + Math.sin(v.a) * 1.9;
      kit.glow(hx, 1.3, hz, LB_WHITE, 0.06, 1.3, 0.85, kit.K.STAR, 1); kit.glow(x + Math.cos(v.a) * 1.2, 1.3, z + Math.sin(v.a) * 1.2, LB_RED, 0.1, 3.2, 0.6, kit.K.GLOW, 1);
      kit.glow(x, 0.2, z, LB_CRIM, 0.3, 2.0, 0.45, kit.K.GLOW, 1.2);   // its red light left on the floor along the path
      if (Math.random() < 0.7) kit.str.emit(x - s.dx * 0.5, 1.3, z - s.dz * 0.5, -s.dx * 6 + R(-1, 1), R(-0.3, 0.6), -s.dz * 6 + R(-1, 1), Math.random() < 0.5 ? LB_RED : LB_GOLD, 0.2, 0.08, 0.04, 0, 0, 1);
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.on = false; v.h.on = false; kit.sparks(x, 1.2, z, kit.N(10), LB_RED, 9, 0.3, 0.05, 0.5, 10, s.dx, s.dz, 0.6); kit.glow(x, 1.2, z, LB_GOLD, 0.15, 1.6, 0.8, kit.K.STAR, 1.3); },
    hit(kit, e) { kit.ring(e.x, e.z, 1.5, LB_RED, 0.5); kit.ring(e.x, e.z, 1.0, LB_GOLD, 0.35, 0.7); kit.glow(e.x, 1.2, e.z, LB_RED, 0.2, 2.0, 0.9, kit.K.GLOW, 1.3); kit.sparks(e.x, 1.1, e.z, kit.N(8), LB_GOLD, 7, 0.3, 0.05, 0.5, 8); },
  },
  // Bạo Nộ Đả Kích: he vanishes in a crimson swirl and comes down at the point in a ring of flame spikes, a gold flare and an
  // orange burst under a white-gold flare; the knocked-up foes throw sparks up
  lbBlink: {
    pal: [LB_RED, LB_ORANGE], hitR: 1.8,
    skill(kit, e, u) { lbOrb(kit, u); return true; },
    warp(kit, e, u, row) {
      const R0 = (row.land && row.land.radius) || 3, dx = e.x - e.x0, dz = e.z - e.z0, L = Math.hypot(dx, dz) || 1;
      for (let i = 0, n = kit.N(16); i < n; i++) { const b = i / n * 6.283; kit.str.emit(e.x0 + Math.cos(b) * 0.9, R(0.3, 1.6), e.z0 + Math.sin(b) * 0.9, -Math.sin(b) * 7, R(2, 5), Math.cos(b) * 7, i % 2 ? LB_CRIM : LB_RED, 0.3, 0.1, 0.05, 0, 0, 1); }
      kit.ring(e.x0, e.z0, 1.4, LB_CRIM, 0.3, 0.8);
      const st = kit.beam(e.x0, e.z0, e.x, e.z, 0.9, LB_RED, 0.18, 2, 1.2); st.fade = true;
      for (let i = 0, n = kit.N(10); i < n; i++) { const t = Math.random(); kit.str.emit(e.x0 + dx * t, R(0.6, 1.6), e.z0 + dz * t, dx / L * 20, 0, dz / L * 20, LB_ORANGE, 0.16, 0.08, 0.05, 0, 1, 1); }
      spikes(kit, e.x, e.z, 14, R0 * 0.8, 3.0, LB_ORANGE, 0.8, { core: 0x5a1004 });
      kit.glow(e.x, 1.6, e.z, LB_WHITE, 0.2, 3.4, 0.9, kit.K.STAR, 1.4);
      burst(kit, e.x, e.z, R0 * 1.05, LB_ORANGE, LB_GOLD, { life: 0.55 });
      kit.ring(e.x, e.z, R0, LB_RED, 0.45); kit.scorch(e.x, e.z, R0 * 0.55, 3, 1.2, LB_ORANGE);
      kit.puffs(e.x, 0.6, e.z, kit.N(6), LB_SOOT, R0 * 0.5, 2.2, 0.9, 1.3, 2.2, 0.8, 0.6, kit.K.SMOKE, 2);
      kit.flash(e.x, 1.8, e.z, LB_ORANGE, 40, 0.22); kit.kick(e.x, e.z, 0.5);
      return true;
    },
    nova() { return true; },   // the landing is drawn with the warp
    hit(kit, e) { kit.sparks(e.x, 0.8, e.z, kit.N(10), LB_GOLD, 6, 0.45, 0.05, 2.5, 6); kit.glow(e.x, 1.6, e.z, LB_ORANGE, 0.25, 1.8, 0.8, kit.K.GLOW, 1.3); },
  },
  // Hoành Tảo Thiên Quân: the halberd swung round through the fan in front, drawn as a thin fiery orange-to-gold stroke with a
  // white-gold rim and gold sparks off its head (lookkit.slash: orange rim turning gold inward)
  lbSweep: {
    pal: [LB_ORANGE, LB_GOLD], hitR: 1.8,
    skill(kit, e, u) { lbOrb(kit, u); return true; },
    nova(kit, e, u, s) {
      const r = (e.r || 4.5) * 1.05, span = (s.arc || 1.05) + 0.12, dir = 1;
      slash(kit, e.x, e.z, e.a, r, LB_ORANGE, { c2: LB_GOLD, edge: LB_GOLD, spark: LB_GOLD, dir, span, life: 0.5, sweep: 0.14, w: r * 0.2 });
      kit.kick(e.x, e.z, 0.25);
      return true;
    },
    hit(kit, e) { kit.glow(e.x, 1.2, e.z, LB_WHITE, 0.12, 1.6, 0.9, kit.K.STAR, 1.3); kit.sparks(e.x, 1.1, e.z, kit.N(8), LB_ORANGE, 8, 0.3, 0.05, 0.5, 8); },
  },
  // Quỷ Thần Giáng Lâm: while he winds up a crimson vortex turns round him and the landing spot burns a red hexagram inside a
  // thin blue ring with a gold star at its heart; he flies over in a crimson arc and lands in a white-gold blast, a ring of
  // flame spikes and dark smoke
  lbSlam: {
    pal: [LB_RED, LB_ORANGE], hitR: 2,
    skill(kit, e, u, row) {
      lbOrb(kit, u);
      const x = e.tx ?? u.x, z = e.tz ?? u.z, Rr = row.radius || 4, life = (row.windup || 1) + (row.flight || 0.45) + 0.15;
      sigil(kit, x, z, Rr, LB_RED, { c2: LB_GOLD, n: 6, m: 2, inner: 0.42, fill: 0.14, spin: 0.6, life, rev: 0.25, alpha: 0.95 });
      sigil(kit, x, z, Rr * 1.08, LB_BLUE, { n: 0, ticks: 0, inner: 0, fill: 0.03, life, rev: 0.2, alpha: 0.85 });
      kit.follow(u, life, (t) => { const p = 0.6 + 0.4 * Math.sin(t * 14); kit.glow(x, 0.5, z, LB_GOLD, 0.06, 1.3 * p, 0.8, kit.K.STAR, 1); });
      return true;
    },
    castMake() { return { spin: 0 }; },
    cast(kit, v, u, s, k, dt) {
      v.spin += dt * (6 + 10 * k);
      for (let i = 0; i < 3; i++) {
        const b = v.spin + i * 2.094, rr = 1.5 - 0.6 * k;
        kit.str.emit(u.x + Math.cos(b) * rr, 0.4 + 1.6 * k + 0.3 * i, u.z + Math.sin(b) * rr, -Math.sin(b) * 8, 2.5, Math.cos(b) * 8, i ? LB_RED : LB_CRIM, 0.22, 0.1, 0.05, 0, 0, 1);
      }
      kit.glow(u.x, 1.2, u.z, LB_CRIM, 0.08, 2.2 + 1.2 * k, 0.35 + 0.3 * k, kit.K.GLOW, 1);
    },
    leap(kit, e, u) {
      const dur = e.dur || 0.45;
      trail(kit, (t) => (t < dur + 0.05 && u.alive ? [u.x, 1.2 + Math.sin(Math.min(1, t / dur) * Math.PI) * 2.6, u.z] : null), 1.6, LB_RED, dur + 0.4, { c2: LB_GOLD, len: 14, up: true });
      return true;
    },
    nova(kit, e, u, row) {
      const Rr = e.r || 4;
      burst(kit, e.x, e.z, Rr * 1.3, LB_ORANGE, LB_WHITE, { life: 0.8 });
            spikes(kit, e.x, e.z, 18, Rr * 0.8, 3.6, LB_RED, 0.9, { core: 0x3a0804 });
      sigil(kit, e.x, e.z, Rr * 1.1, LB_RED, { c2: LB_GOLD, n: 6, m: 2, inner: 0.42, life: 0.7, rev: 0.05, spin: 1.2, fill: 0.3, w: 0.08, alpha: 0.95 });
      kit.ring(e.x, e.z, Rr * 1.15, LB_ORANGE, 0.5); kit.scorch(e.x, e.z, Rr * 0.7, 3, 1.3, LB_ORANGE);
      kit.sparks(e.x, 1.2, e.z, kit.N(20), LB_GOLD, 13, 0.5, 0.06, 1.2, 10);
      kit.puffs(e.x, 0.7, e.z, kit.N(8), LB_SOOT, Rr * 0.5, 2.6, 1.0, 1.6, 2.4, 0.9, 0.65, kit.K.SMOKE, 2);
      kit.flash(e.x, 2, e.z, LB_WHITE, 60, 0.3); kit.kick(e.x, e.z, 0.9);
      return true;
    },
    hit(kit, e) { kit.sparks(e.x, 0.8, e.z, kit.N(12), LB_GOLD, 7, 0.5, 0.05, 3, 6); },
  },
};

// ---- Tào Tháo: violet smoke and magenta, a gold-hilted sword ---------------------------------------------------------
const TT_VIO = C(1.25, 0.2, 2.1), TT_MAG = C(2.2, 0.3, 1.5), TT_SMOKE = C(0.16, 0.04, 0.22), TT_GOLD = C(2.2, 1.6, 0.6);
const taothao = {
};

export const B1 = { ...lubo, ...taothao };
