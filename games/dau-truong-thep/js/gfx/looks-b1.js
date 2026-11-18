// Looks, batch 1: Lữ Bố, Tào Tháo, Tư Mã Ý, Hades, Sứa Trắng (Athena moved to looks-k2.js with her ported kit). Render only (see looks.js for the hooks).
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP.md):
//   吕布 p9: a thrown halberd with a red trident head, a red fire orb round him after every cast, flame spikes and a gold flare
//     where he blinks in, a thin fiery orange-gold sweep, a red hexagram in a thin blue ring with a gold star at the ult's landing.
//   曹操 p11: dark violet smoke wings, a thin magenta ring round him, a violet vortex at his feet, a violet claw-slash and violet
//     crescent sword-qi.
//   司马懿 p12: Tư Mã Ý's looks moved to looks-k4.js with his ported kit (kit lane K4).
//   冥王 p72: an ice-blue scythe sweep, a blue column of light with rings, a big blue energy sphere on the targets.
//   Sứa Trắng: no part; a pale jellyfish healer (pearl-white bell, glowing tentacles, bubbles, pink stings).
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

// ---- Hades: ice-blue soul fire, a scythe, a rune circle, a column of rings ------------------------------------------
const HD_ICE = C(0.45, 1.25, 2.6), HD_SOUL = C(0.6, 2.2, 2.3), HD_DEEP = C(0.08, 0.25, 1.1), HD_BONE = 0xcfe2ff;
const hades = {
  // Ám Lưu: a ghostly scythe sweeps out of him and a cold soul wisp flies off, a skull-white core in a wavering blue tail
  hdSouls: {
    pal: [HD_ICE, HD_SOUL], hitR: 1.8,
    skill(kit, e, u) {
      slash(kit, u.x, u.z, e.a, 8.5, HD_ICE, { y: 1.4, life: 0.45, span: 1.45, w: 1.4, sweep: 0.1, edge: HD_SOUL });
      muz(kit, u, e.a, 3.0, HD_ICE, HD_SOUL);
      const g = weapon('scythe', HD_BONE, HD_ICE, { opacity: 0.9 }); g.scale.setScalar(3);
      own(kit, [g], 0.35, (t) => { const a = e.a + 1.2 - t * 6; g.position.set(u.x, 1.6, u.z); g.rotation.set(0, -a, 0); fadeWeapon(g, Math.min(1, (0.35 - t) / 0.15)); });
      return true;
    },
    shotMake(kit, s) {
      const v = { x: s.x, z: s.z, live: true, t: 0 };
      trail(kit, () => (v.live ? [v.x, 1.3 + 0.15 * Math.sin(v.t * 30), v.z] : null), 2.6, HD_ICE, 2, { c2: HD_DEEP, len: 18 });
      shell(kit, s.x, 1.35, s.z, 2.6, HD_SOUL, { c2: HD_ICE, p: 1.2, core: 0.3, life: 1e9, step: (t, m) => (v.live ? (m.position.set(v.x, 1.35, v.z), true) : false) });
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
      const g = weapon('hand', HD_BONE, HD_ICE, { opacity: 0.95 }); g.scale.setScalar(2.8);
      g.position.set(e.x, -2, e.z); g.rotation.y = Math.random() * 6.283;
      own(kit, [g], 1.7, (t) => {
        const up = Math.min(1, t / 0.18), down = t > 1.35 ? (t - 1.35) / 0.35 : 0;
        g.position.y = -2.4 + 2.6 * up - 2.6 * down;
        g.scale.set(2.8, 2.8 * (t > 0.3 && t < 1.35 ? 0.82 : 1), 2.8 * (t > 0.3 && t < 1.35 ? 0.7 : 1));
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
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), mat); disc.position.set(z.x, 0.11, z.z); disc.scale.setScalar(z.r * 0.6); disc.renderOrder = 3;
      const h = held(kit, [disc]);
      const s = sigil(kit, z.x, z.z, z.r, HD_ICE, { c2: HD_SOUL, n: 0, ticks: 18, inner: 0.55, life: 1e9, rev: 0.3, spin: -2.2, fill: 0.03, w: 0.08 });
      const p = pillar(kit, z.x, z.z, 2.2, HD_ICE, { c2: HD_SOUL, h: 11, life: 1e9, rings: 4, grow: 0.2 });
      const posts = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => pillar(kit, z.x + Math.cos(i * 0.785) * z.r * 0.92, z.z + Math.sin(i * 0.785) * z.r * 0.92, 0.5, HD_SOUL, { c2: HD_ICE, h: 6, life: 1e9, rings: 2, grow: 0.25 }));
      const b = gate(kit, z.x, z.z, z.r * 0.7, HD_ICE, { life: 1e9, grow: 0.3 });
      return { mat, h, s, p, b, posts, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; v.mat.opacity = 0.3 * Math.min(1, v.t / 0.3, (z.dur - z.age) * 3);
      for (let i = 0; i < 2; i++) if (Math.random() < 0.8) { const a = Math.random() * 6.283; kit.str.emit(z.x + Math.cos(a) * z.r, R(0.3, 1.6), z.z + Math.sin(a) * z.r, -Math.cos(a) * 9 - Math.sin(a) * 6, 0, -Math.sin(a) * 9 + Math.cos(a) * 6, i ? HD_ICE : HD_SOUL, 0.35, 0.07, 0.06, 0, 0, 1); }
    },
    zoneDrop(kit, v, z, ended) {
      v.h.on = false; stop(v.s); stop(v.p); stop(v.b); v.posts.forEach(stop);
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
      bell(kit, (t) => (t < dur + 0.15 && u.alive ? [u.x, 2.2 + Math.sin(Math.min(1, t / dur) * Math.PI) * 1.2, u.z] : null), 3, dur + 0.5, 7); burst(kit, u.x, u.z, 2.8, SJ_JELLY, SJ_PINK, { life: 0.6 });
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

export const B1 = { ...lubo, ...taothao, ...hades, ...suatrang };
