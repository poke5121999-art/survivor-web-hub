// Looks, batch 3: Sói Lửa, Bạch Hạc, Ưng Nhãn, Thần Công, Cá Kiếm, Chuột Túi. Render only (see looks.js for the hooks).
// Each look's own shape carries it; bursts are only brief flashes where blows land.
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP.md):
//   鹰痕 p92 (Ưng Nhãn): a pink hawk spirit diving, a blue sky beam wound with rings, a violet vortex in a blue circle, magenta
//     arrow streaks.
//   海贼猎人 p63 (Cá Kiếm): lime-green blades: three blades thrust at once, a green whirlwind round him, a green X flash where
//     the big cut lands, green crescent waves.
//   Sói Lửa, Bạch Hạc, Thần Công, Chuột Túi: no part (蓝胖子 p58 is blue lightning, not a door or a robot); built from their
//     descriptions: a fire wolf's jaws and fangs, a white crane's feathers and wings, a siege cannon's struts and shells, a
//     kangaroo's magic doors, wind-up robot and pouch of stars.
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, crescent, sigil, shell, pillar, trail, strands, spikes, burst, gate } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: !add, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
const flash = (kit, x, z, c, c2) => { kit.glow(x, 1.3, z, c2, 0.12, 1.6, 1, kit.K.STAR, 1.3); kit.flash(x, 1.5, z, c, 25, 0.15); };

// a feather: a long leaf lying along +x from the quill at the origin
const featherGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.6, 0.32, 1.6, 0.06); s.lineTo(1.7, 0); s.lineTo(1.6, -0.06); s.quadraticCurveTo(0.6, -0.28, 0, 0); const g = new THREE.ShapeGeometry(s, 10).rotateX(-Math.PI / 2); g.userData.keep = true; return g; })();
// a fan of n feathers spread over `spread` radians, in one material
function wing(n, spread, c, op = 0.92) { const g = new THREE.Group(), m = basic(c, false, op); for (let i = 0; i < n; i++) { const f = new THREE.Mesh(featherGeo, m); f.rotation.y = -spread / 2 + spread * i / Math.max(1, n - 1); f.scale.setScalar(1 - 0.25 * Math.abs(i / Math.max(1, n - 1) - 0.5) * 2); g.add(f); } g.userData.mat = m; return g; }

// ---- Sói Lửa: fire wolf, orange flame and charcoal, jaws and fangs --------------------------------------------------
const WF_FIRE = C(2.6, 0.7, 0.05), WF_GOLD = C(2.6, 1.6, 0.3), WF_CHAR = C(0.18, 0.08, 0.04);
// jaws: two crescents facing each other snapping shut on (x, z) along a
function jaws(kit, x, z, a, r, life = 0.4) {
  crescent(kit, x - Math.cos(a) * r * 0.6, z - Math.sin(a) * r * 0.6, a, r, 1.2, 1, WF_FIRE, life, r * 0.45, 0.8, 0, 0.1, { edge: WF_GOLD, spark: WF_GOLD });
  crescent(kit, x + Math.cos(a) * r * 0.6, z + Math.sin(a) * r * 0.6, a + Math.PI, r, 1.2, -1, WF_FIRE, life, r * 0.45, 0.8, 0, 0.1, { edge: WF_GOLD, spark: WF_GOLD });
}
const soi = {
  // Rocket Chùm: three wolf-head comets with long flame manes; each bites shut in a pair of fiery jaws where it bursts
  wfRockets: {
    pal: [WF_CHAR, WF_FIRE], hitR: 1.8,
    skill(kit, e, u) { flash(kit, u.x + Math.cos(e.a) * 1.4, u.z + Math.sin(e.a) * 1.4, WF_FIRE, WF_GOLD); return true; },
    // three comets of wolf-fire corkscrew out, each a wide flame ribbon that snakes as it flies; they bite (fiery jaws) where they burst
    shotMake(kit, s, row) { const v = { x: s.x, z: s.z, live: true, a: Math.atan2(s.dz, s.dx), t: 0 }; trail(kit, () => (v.live ? [v.x, 1.3, v.z] : null), 1.5, WF_CHAR, 1.2, { c2: C(0.05, 0.03, 0.02), len: 26 }); v.head = shell(kit, s.x, 1.3, s.z, 0.75, WF_FIRE, { c2: WF_GOLD, inv: 1.3, core: 1, life: 1e9 }); return v; },

    shot(kit, v, s, x, y, z, dt) { v.t += dt; const w = Math.sin(v.t * 18 + s.id * 2) * 1.2; v.x = x - s.dz * w; v.z = z + s.dx * w; v.head.position.set(v.x, 1.3, v.z); if (Math.random() < 0.5) kit.puffs(v.x, 1.3, v.z, 1, WF_CHAR, 0.3, 0.8, 0.7, 0.8, 2.2, 0.5, 0.6, kit.K.SMOKE); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; stop(v.head); jaws(kit, x, z, v.a, 2.4); burst(kit, x, z, 2.4, WF_CHAR, WF_FIRE); kit.scorch(x, z, 1.6, 3, 1.5, WF_FIRE); },
  },
  // Tăng Áp: the wolf runs: two flame streaks pour off his flanks and a mane of flame spikes rides his back for four seconds
  wfHowl: {
    skill(kit, e, u, row) {
      const d = row.dur || 4, side = (k) => (t) => (t < d && u.alive ? [u.x - Math.sin(u.heading || u.aim) * k, 0.8, u.z + Math.cos(u.heading || u.aim) * k] : null);
      trail(kit, side(1.0), 1.4, WF_FIRE, d + 0.3, { c2: WF_CHAR, len: 18 }); trail(kit, side(-1.0), 1.4, WF_FIRE, d + 0.3, { c2: WF_CHAR, len: 18 });
      spikes(kit, u.x, u.z, 9, 1.1, 1.8, WF_FIRE, d, { follow: u, core: 0x2a0a02, up: 0.15 });
      sigil(kit, u.x, u.z, 3.6, WF_FIRE, { c2: WF_GOLD, n: 0, ticks: 12, inner: 0.6, life: 0.8, rev: 0.1, spin: 6, fill: 0.3, w: 0.08 });
      kit.flash(u.x, 2, u.z, WF_FIRE, 40, 0.3);
      return true;
    },
  },
  // Mưa Hỏa Tiễn: the wolf howls (a ring of flame spikes round him), then flaming bolts come down out of the sky in long
  // streaks over burning claw scratches; each lands as fiery jaws and a short pillar of fire on a burnt patch
  wfRain: {
    zones: ['strike'], ownDisc: true, pal: [WF_CHAR, WF_FIRE], hitR: 1.6,
    skill() { return true; },
    // the warning is a burning wolf-paw ring where each bolt will land
    zoneMake(kit, z) {
      const v = { y: 18, live: true };
      trail(kit, () => (v.live ? [z.x + v.y * 0.25, v.y, z.z - v.y * 0.3] : null), 1.8, WF_FIRE, 4, { c2: WF_GOLD, len: 10, up: true });
      // three burning claw scratches across the landing spot
      const a = Math.random() * 3.14, L = Math.max(2.4, z.r) * 2; v.s = null;
      for (const o of [-0.7, 0, 0.7]) { const b = kit.beam(z.x + Math.cos(a + 1.57) * o - Math.cos(a) * L / 2, z.z + Math.sin(a + 1.57) * o - Math.sin(a) * L / 2, z.x + Math.cos(a + 1.57) * o + Math.cos(a) * L / 2, z.z + Math.sin(a + 1.57) * o + Math.sin(a) * L / 2, 1.3, WF_FIRE, (z.delay || 0.9) + 0.1, 2, 0.2); b.fade = true; }
      return v;
    },
    zone(kit, v, z) { v.y = Math.max(0.3, 18 * (z.delay / (z.total || 1))); },
    zoneDrop(kit, v) { v.live = false; },
    land(kit, e) { jaws(kit, e.x, e.z, Math.random() * 6.283, 3.8); spikes(kit, e.x, e.z, 8, 1.7, 3, WF_FIRE, 0.9, { core: 0x2a0a02 }); pillar(kit, e.x, e.z, 1.8, WF_FIRE, { c2: WF_GOLD, h: 6, life: 0.5, grow: 0.06, narrow: true }); burst(kit, e.x, e.z, 2.6, WF_CHAR, WF_FIRE); kit.scorch(e.x, e.z, 2, 3, 1.6, WF_FIRE); kit.kick(e.x, e.z, 0.3); return true; },
  },
};

// ---- Bạch Hạc: white crane, jade and white feathers, a red crown -------------------------------------------------------
const HC_JADE = C(0.35, 1.9, 1.4), HC_WHITE = C(2.4, 2.4, 2.3), HC_CROWN = C(2.3, 0.2, 0.25), HC_MIST = C(0.6, 1.4, 1.8);
const bachhac = {
  // Suối Hồi Phục: a ring of white feathers lies open round the spring like a flower, turning slowly; jade drops rise from it
  hcSpring: {
    zoneMake(kit, z) {
      const g = new THREE.Group(); g.position.set(z.x, 0.25, z.z);
      for (let i = 0; i < 10; i++) { const f = wing(1, 0, i % 2 ? 0xffffff : 0xbff5e6, 0.9); f.rotation.y = i * 0.628; f.scale.setScalar(z.r * 0.55); g.add(f); }
      const s = sigil(kit, z.x, z.z, z.r, HC_JADE, { c2: HC_WHITE, n: 0, ticks: 20, inner: 0.35, life: 1e9, rev: 0.3, spin: 0.3, fill: 0.3 });
      return { g, h: held(kit, [g]), s, t: 0 };
    },
    zone(kit, v, z, dt) { v.t += dt; v.g.position.set(z.x, 0.25, z.z); v.g.rotation.y += dt * 0.6; v.g.scale.setScalar(Math.min(1, v.t / 0.3)); if (Math.random() < dt * 20) { const a = Math.random() * 6.283, r = Math.random() * z.r * 0.8; kit.glow(z.x + Math.cos(a) * r, 0.3, z.z + Math.sin(a) * r, HC_JADE, 1, 0.3, 1, kit.K.GLOW, 1, 0, R(1.5, 3), 0); } },
    zoneDrop(kit, v) { v.h.on = false; stop(v.s); },
  },
  // Trường Trì Trệ: three tilted rings of crane-mist turn slowly over the field, feathers drifting down through them
  hcSlow: {
    zoneMake(kit, z) {
      const g = new THREE.Group(); g.position.set(z.x, 0, z.z);
      const tor = new THREE.TorusGeometry(1, 0.06, 6, 48);
      [0.95, 0.7, 0.45].forEach((k, i) => { const m = new THREE.Mesh(tor, basic(i === 1 ? 0xffffff : 0x88d8e8, false, 0.85)); m.scale.setScalar(z.r * k); m.position.y = 0.6 + i * 0.7; m.rotation.x = Math.PI / 2 + (i - 1) * 0.9; m.rotation.y = i * 1.1; g.add(m); });
      const s = sigil(kit, z.x, z.z, z.r, HC_MIST, { c2: HC_WHITE, n: 0, ticks: 36, inner: 0.7, life: 1e9, rev: 0.3, spin: -0.15, fill: 0.25 });
      return { g, h: held(kit, [g]), s, tor };
    },
    zone(kit, v, z, dt) {
      v.g.children.forEach((m, i) => { m.rotation.z += dt * (i - 1 || 0.5) * 0.6; });
      if (Math.random() < dt * 6) { const a = Math.random() * 6.283, r = Math.random() * z.r, f = wing(1, 0, 0xffffff, 0.9); f.scale.setScalar(0.6); const x = z.x + Math.cos(a) * r, zz = z.z + Math.sin(a) * r; own(kit, [f], 1.4, (t) => { f.position.set(x + Math.sin(t * 3) * 0.4, 3 - t * 2, zz); f.rotation.set(Math.sin(t * 4) * 0.5, t * 2, 0); }); }
    },
    zoneDrop(kit, v) { v.h.on = false; stop(v.s); v.tor.dispose(); },
  },
  // Vòm Bảo Hộ: two great white wings close over the allies as a feathered dome, a red crown light at its peak
  hcDome: {
    zones: ['dome'],
    zoneMake(kit, z) {
      const d = sigil(kit, z.x, z.z, z.r, HC_JADE, { c2: HC_WHITE, n: 0, ticks: 30, inner: 0.85, life: 1e9, rev: 0.3, spin: 0.2, fill: 0.15 });
      const wings = [-1, 1].map((sd) => { const w = wing(13, 2.2, 0xffffff, 0.95); w.position.set(z.x, 0.4, z.z); w.rotation.y = sd > 0 ? 0 : Math.PI; w.scale.setScalar(z.r * 0.8); return w; });
      const crown = shell(kit, z.x, z.r * 0.95, z.z, 0.9, HC_CROWN, { c2: HC_CROWN, inv: 1.2, core: 1, life: 1e9 });
      return { d, wings, crown, h: held(kit, wings), t: 0 };
    },
    zone(kit, v, z, dt) { v.t += dt; const k = Math.min(1, v.t / 0.35); v.wings.forEach((w, i) => { w.rotation.x = (i ? -1 : 1) * (1 - k) * 1.2; w.position.set(z.x, 0.4 + k * 0.6, z.z); }); },
    zoneDrop(kit, v) { v.h.on = false; stop(v.d); stop(v.crown); },
  },
};

// ---- Ưng Nhãn: the hawk, pink-magenta feathers and sky-blue light ------------------------------------------------------
const UG_PINK = C(2.4, 0.35, 1.2), UG_SKY = C(0.35, 1.2, 2.6), UG_VIO = C(1.2, 0.3, 2.4);
// a reticle: a ring and four ticks pointing in
function reticle(kit, x, z, r, c, life) { sigil(kit, x, z, r, c, { n: 0, ticks: 4, inner: 0.35, life, rev: 0.08, spin: 1.5, fill: 0.08, w: 0.08 }); for (let i = 0; i < 4; i++) { const a = i * 1.571 + 0.785, b = kit.beam(x + Math.cos(a) * r * 1.3, z + Math.sin(a) * r * 1.3, x + Math.cos(a) * r * 0.55, z + Math.sin(a) * r * 0.55, 0.45, c, life, 2, 0.4); b.fade = true; } }
const ung = {
  // Mìn Xung Điện: a hawk's-eye reticle lies on the floor; it goes off as a blue sphere of lightning
  ugMine: {
    zones: ['mine'],
    skill() { return true; },
    zoneMake(kit, z, row, foe) { return { s: sigil(kit, z.x, z.z, 4.2, UG_PINK, { c2: UG_SKY, n: 4, m: 1, ticks: 8, inner: 0.4, life: 1e9, rev: 0.3, spin: 1, fill: 0.35, w: 0.1, alpha: foe ? 0.5 : 1 }) }; },
    zoneDrop(kit, v) { stop(v.s); },
    land(kit, e) { shell(kit, e.x, 1.2, e.z, 2.8, UG_SKY, { c2: C(2, 2.3, 2.6), p: 1.2, core: 0.25, bands: 3, life: 0.6, grow: 0.08 }); for (let i = 0; i < 6; i++) { const a = Math.random() * 6.283; const b = kit.beam(e.x, e.z, e.x + Math.cos(a) * 3, e.z + Math.sin(a) * 3, 0.4, UG_SKY, 0.25, 3, R(0.5, 2)); b.fade = true; } kit.flash(e.x, 1.6, e.z, UG_SKY, 50, 0.25); return true; },
  },
  // Lướt Bóng: the hawk spirit dives: a fan of pink feathers spreads where he was and fades, a magenta streak runs to where
  // he lands and he melts from sight in falling feathers
  ugBlink: {
    skill(kit, e, u) {
      const x0 = u.x, z0 = u.z, w = wing(17, 3.2, 0xff5fb0, 0.95); w.position.set(x0, 1.3, z0); w.rotation.y = -(e.a + Math.PI); w.scale.setScalar(5);
      own(kit, [w], 0.7, (t) => { w.userData.mat.opacity = 0.95 * (1 - t / 0.7); w.scale.setScalar(2.6 + t * 1.5); });
      trail(kit, (t) => (t < 0.3 && u.alive ? [u.x, 1.2, u.z] : null), 2.6, UG_PINK, 0.8, { c2: UG_VIO, len: 14 });
      kit.anims.push({ t: 0, step(dt) { this.t += dt; if (this.t < 0.28) return true; for (let i = 0; i < 8; i++) { const f = wing(1, 0, 0xff8fc8, 0.9), x = u.x + R(-1.5, 1.5), z = u.z + R(-1.5, 1.5), r0 = Math.random() * 6; f.scale.setScalar(0.9); own(kit, [f], 1.2, (t) => { f.position.set(x, 2.6 - t * 2, z); f.rotation.set(Math.sin(t * 5) * 0.6, r0 + t * 2, 0); }); } return false; }, drop() {} });
      return true;
    },
  },
  // Tia Xuyên Phá: a reticle locks on at the far end while the shot gathers; it fires as a sky-blue beam wound with rings, a
  // magenta arrow streak running its core
  ugBeam: {
    pal: [UG_SKY, UG_PINK], hitR: 1.8,
    skill() { return true; },
    castMake(kit, u, s) { return { t: 0 }; },
    cast(kit, v, u, s, k, dt) {
      v.t += dt; const a = u.cast.aim, L = Math.min(s.range, 14), x = u.x + Math.cos(a) * L, z = u.z + Math.sin(a) * L;
      if (v.t > 0.05 && !v.ret) { v.ret = true; reticle(kit, x, z, 2.2, UG_PINK, (s.windup || 0.9) + 0.2); }
      kit.glow(u.x + Math.cos(a) * 1.4, 1.4, u.z + Math.sin(a) * 1.4, UG_SKY, 0.1, 1 + 2 * k, 1, kit.K.STAR, 1.2);
    },
    beam(kit, e) {
      const dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz) || 1;
      const b1 = kit.beam(e.x0, e.z0, e.x1, e.z1, 4.4, UG_SKY, 0.6, 0, 1.4); b1.fade = true;
      const b2 = kit.beam(e.x0, e.z0, e.x1, e.z1, 0.9, UG_PINK, 0.5, 2, 1.45); b2.fade = true;
      for (let d = 3; d < L; d += 3.5) { const m = sigil(kit, e.x0 + dx / L * d, e.z0 + dz / L * d, 1.4, UG_SKY, { n: 0, ticks: 0, inner: 0.8, life: 0.6, rev: 0.05, fill: 0, y: 1.4, w: 0.12 }); m.rotation.z = Math.PI / 2; m.rotation.y = -Math.atan2(dz, dx); }
      pillar(kit, e.x1, e.z1, 1.6, UG_SKY, { c2: UG_PINK, h: 16, life: 0.7, grow: 0.08, drop: true, rings: 5 });
      kit.flash(e.x1, 1.6, e.z1, UG_SKY, 60, 0.3); kit.kick(e.x0, e.z0, 0.5);
      return true;
    },
  },
};

// ---- Thần Công: siege cannon, steel struts, brass rings, black powder smoke ----------------------------------------------
const TC_BRASS = C(2.2, 1.5, 0.45), TC_FIRE = C(2.6, 1.1, 0.2), TC_SMOKE = C(0.22, 0.2, 0.18), TC_STEEL = 0x7d8590;
const strutGeo = new THREE.BoxGeometry(0.35, 0.35, 2.6).translate(0, 0, 1.3); strutGeo.userData.keep = true;
const thancong = {
  // Cắm Chốt: four steel struts drive into the floor round him and stay while he is planted, a brass gear ring turning under
  tcAnchor: {
    skill() { return true; },
    stance(kit, e, u) {
      if (!e.on) { kit.puffs(e.x, 0.3, e.z, kit.N(6), TC_SMOKE, 1, 3, 0.8, 1, 2.2, 0.4, 0.5, kit.K.DUST, 3); return true; }
      const g = new THREE.Group(), m = basic(TC_STEEL, false), mg = basic(TC_BRASS, false);
      for (let i = 0; i < 4; i++) { const a = i * 1.571 + 0.785, s = new THREE.Mesh(strutGeo, i % 2 ? m : mg); s.rotation.set(0.5, -a + Math.PI / 2, 0); s.position.set(Math.cos(a) * 0.6, 1.4, Math.sin(a) * 0.6); g.add(s); }
      const ring = sigil(kit, u.x, u.z, 3.6, TC_BRASS, { c2: TC_FIRE, n: 0, ticks: 24, inner: 0.7, life: 1e9, rev: 0.2, spin: 0.4, fill: 0.35, w: 0.12, follow: u });
      own(kit, [g], 1e9, (t) => { if (!u.alive || !u.stance) { stop(ring); return false; } g.position.set(u.x, 0, u.z); g.scale.setScalar(Math.min(1, t / 0.15) * 2.1); });
      kit.puffs(e.x, 0.3, e.z, kit.N(10), TC_SMOKE, 1.3, 5, 0.9, 1.2, 2.4, 0.5, 0.6, kit.K.DUST, 3); kit.kick(e.x, e.z, 0.4);
      return true;
    },
  },
  // Đạn Xuyên: a cone of muzzle fire and black smoke, then shock rings left along the sabot's whole path
  tcSabot: {
    pal: [TC_SMOKE, TC_FIRE], hitR: 1.8,
    skill(kit, e, u) {
      crescent(kit, u.x, u.z, e.a, 6, 1.3, 1, TC_FIRE, 0.5, 4.4, 0.4, 0, 0.06, { edge: TC_BRASS, spark: TC_BRASS });
      kit.puffs(u.x + Math.cos(e.a) * 2.5, 1.2, u.z + Math.sin(e.a) * 2.5, kit.N(10), TC_SMOKE, 1.4, 3, 1.2, 1.4, 2.6, 0.6, 0.85, kit.K.SMOKE); kit.kick(u.x, u.z, 0.5);
      return true;
    },
    shotMake(kit, s) { return { n: 0, x: s.x, z: s.z }; },
    shot(kit, v, s, x, y, z) { if (Math.hypot(x - v.x, z - v.z) > 2.5) { v.x = x; v.z = z; const m = sigil(kit, x, z, 1.5, TC_BRASS, { n: 0, ticks: 0, inner: 0.75, life: 0.5, rev: 0.03, fill: 0.05, y: 1.3, w: 0.15 }); m.rotation.z = Math.PI / 2; m.rotation.y = -Math.atan2(s.dz, s.dx); } kit.str.emit(x, 1.3, z, s.dx * 20, 0, s.dz * 20, TC_BRASS, 0.12, 0.25, 0.1, 0, 0, 1); return true; },
    shotEnd(kit, v, s, x, z) { burst(kit, x, z, 2.2, TC_SMOKE, TC_FIRE); },
  },
  // Oanh Tạc: shells whistle down on smoke trails; each lands in a black mushroom of smoke with a ring of dust
  tcBombard: {
    zones: ['strike'], ownDisc: true, pal: [TC_SMOKE, TC_FIRE], hitR: 1.6,
    skill() { return true; },
    // the warning is a brass artillery crosshair; the shell falls on a black smoke trail
    zoneMake(kit, z) { const v = { y: 16, live: true }; v.shell = shell(kit, z.x, 16, z.z, 1.1, C(0.25, 0.22, 0.2), { c2: TC_BRASS, inv: 1, core: 1, life: 1e9 });
      // square range-finder brackets: four white corner marks round the landing spot
      v.s = null; { const R0 = Math.max(2.4, z.r) * 0.9, life = (z.delay || 1) + 0.05; for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const cx = z.x + sx * R0, cz = z.z + sz * R0; for (const [dx, dz] of [[-sx, 0], [0, -sz]]) { const b = kit.beam(cx, cz, cx + dx * R0 * 0.7, cz + dz * R0 * 0.7, 1.1, C(2.4, 2.4, 2.4), life, 2, 0.2); b.fade = true; } } }
      /* the brackets above replace the old cross lines */
      return v; },
    zone(kit, v, z) { const k = z.delay / (z.total || 1); v.y = Math.max(0.3, 16 * k); v.shell.position.set(z.x - 6 * k, v.y, z.z - 9 * k); if (Math.random() < 0.6) kit.puffs(v.shell.position.x, v.y, v.shell.position.z, 1, TC_SMOKE, 0.2, 0.3, 0.8, 0.8, 2, 0, 0.7, kit.K.SMOKE); },
    zoneDrop(kit, v) { v.live = false; stop(v.shell); },
    land(kit, e) {
      for (let i = 0; i < kit.N(12); i++) kit.ovr.emit(e.x + R(-0.8, 0.8), 0.6, e.z + R(-0.8, 0.8), R(-1.2, 1.2), R(4, 7), R(-1.2, 1.2), TC_SMOKE, R(1.2, 1.6), R(1.8, 2.6), 2.4, 2.5, -1, 0.9, kit.K.SMOKE);
      kit.ring(e.x, e.z, 3.4, TC_BRASS, 0.4); burst(kit, e.x, e.z, 2.8, TC_SMOKE, TC_FIRE); kit.scorch(e.x, e.z, 2.2, 3, 1.4, TC_FIRE); kit.chips(e.x, 0.4, e.z, kit.N(10), C(0.3, 0.27, 0.24), 7, 0.8, 0.16); kit.kick(e.x, e.z, 0.5);
      return true;
    },
  },
};

// ---- Cá Kiếm (Zoro): three lime-green blades ---------------------------------------------------------------------------
const CK_LIME = C(1.2, 2.5, 0.3), CK_WHITE = C(2.3, 2.5, 2.0), CK_DEEP = C(0.2, 0.9, 0.1);
function xflash(kit, x, z, r, life = 0.35) { for (const d of [0.785, -0.785]) { const b = kit.beam(x - Math.cos(d) * r, z - Math.sin(d) * r, x + Math.cos(d) * r, z + Math.sin(d) * r, 2, CK_LIME, life, 2, 1.4); b.fade = true; } kit.glow(x, 1.4, z, CK_WHITE, 0.15, 2, 1, kit.K.STAR, 1.4); }
const cakiem = {
  // Lướt Trảm: three green blade streaks run side by side along his dash and cross in an X where he stops
  ckDash: {
    pal: [CK_DEEP, CK_LIME], hitR: 1.8,
    skill(kit, e, u) {
      const a = e.a;
      // two blades cross along the dash in an X, the third straight down the middle
      for (const o of [-1, 0, 1]) trail(kit, (t) => (t < 0.35 && u.alive ? [u.x - Math.sin(a) * o * Math.cos(t * 9) * 1.6, 1.1 + 0.2 * Math.abs(o), u.z + Math.cos(a) * o * Math.cos(t * 9) * 1.6] : null), 1.9, CK_LIME, 0.8, { c2: CK_DEEP, len: 14 });
      kit.anims.push({ t: 0, step(dt) { this.t += dt; if (this.t < 0.32 && u.dash) return true; xflash(kit, u.x + Math.cos(a) * 1.2, u.z + Math.sin(a) * 1.2, 3.6, 0.5); return false; }, drop() {} });
      // three upright sword cuts stand along the path, one per blade
      for (let i = 0; i < 3; i++) { const d = 2 + i * 2.5; crescent(kit, u.x + Math.cos(a) * d, u.z + Math.sin(a) * d, a + 1.57, 2.2, 1.4, i % 2 ? 1 : -1, CK_LIME, 0.5, 0.9, 1.0, 0, 0.1, { edge: CK_WHITE, tilt: 1.3, sparks: false }); }
      return true;
    },
  },
  // Lốc Kiếm: each turn is a green whirlwind: two crescents chasing round him, tilted one way then the other
  ckSpin: {
    pal: [CK_DEEP, CK_LIME], hitR: 1.8,
    skill() { return true; },
    nova(kit, e, u, s) {
      const k = e.k || 0, r = (e.r || 3.8) * 1.05;
      for (const ph of [0, Math.PI]) crescent(kit, e.x, e.z, (e.a || 0) + ph + k, r * 1.3, 1 + k * 0.3, k % 2 ? -1 : 1, CK_LIME, 0.5, r * 0.7, 1.5, 0, 0.2, { edge: CK_WHITE, spark: CK_WHITE, tilt: (k % 2 ? -1 : 1) * 0.25 });
      for (let i = 0; i < kit.N(10); i++) { const a = Math.random() * 6.283; kit.str.emit(e.x + Math.cos(a) * r, R(0.4, 2.4), e.z + Math.sin(a) * r, -Math.sin(a) * 12, R(1, 3), Math.cos(a) * 12, CK_LIME, 0.25, 0.08, 0.05, 0, 0, 1); }
      return true;
    },
  },
  // Nhất Đao: three ghost swords fan out while he takes his stance; the single cut is one huge green crescent along the line
  // and a white-green X where it ends
  ckOne: {
    pal: [CK_DEEP, CK_LIME], hitR: 2,
    skill() { return true; },
    castMake(kit, u) {
      const blade = (sd) => { const g = new THREE.Group(), m = basic(CK_LIME, true, 0.9); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.02, 3, 4).rotateZ(-Math.PI / 2).translate(1.6, 0, 0).scale(1, 1, 0.35), m); g.add(b); g.userData.sd = sd; return g; };
      const bl = [-0.5, 0, 0.5].map(blade);
      return { bl, h: held(kit, bl) };
    },
    cast(kit, v, u, s, k) { const a = u.cast.aim; v.bl.forEach((g) => { g.position.set(u.x, 1.4 + 0.3 * Math.abs(g.userData.sd), u.z); g.rotation.set(0, -(a + g.userData.sd * (0.3 + 0.7 * k)), 0); g.scale.setScalar(1.2 + k * 0.8); }); },
    castDrop(kit, v) { v.h.on = false; },
    beam(kit, e) {
      const a = Math.atan2(e.z1 - e.z0, e.x1 - e.x0), L = Math.hypot(e.x1 - e.x0, e.z1 - e.z0);
      crescent(kit, e.x0, e.z0, a, L * 0.62, 1.2, 1, CK_LIME, 0.7, 7.5, 0.42, 0, 0.08, { edge: CK_WHITE, spark: CK_WHITE });
      const b = kit.beam(e.x0, e.z0, e.x1, e.z1, e.w * 3, CK_LIME, 0.5, 2, 1.3); b.fade = true;
      xflash(kit, e.x1, e.z1, 4.4, 0.55);
      for (const sd of [-1, 1]) crescent(kit, e.x1, e.z1, a + Math.PI / 2 * sd, 3.6, 1.3, sd, CK_LIME, 0.5, 1.6, 1.0, 0, 0.1, { edge: CK_WHITE, sparks: false }); kit.flash(e.x1, 1.6, e.z1, CK_LIME, 60, 0.3); kit.kick(e.x0, e.z0, 0.6);
      return true;
    },
  },
};

// ---- Chuột Túi: kangaroo of tricks, sunny yellow, sky blue and white stars ---------------------------------------------
const CT_SUN = C(2.6, 1.9, 0.2), CT_SKY = C(0.4, 1.4, 2.6), CT_PINK = C(2.4, 0.6, 1.3);
const doorFrame = new THREE.BoxGeometry(2.2, 3.2, 0.25), doorPane = new THREE.PlaneGeometry(1.7, 2.8); doorFrame.userData.keep = doorPane.userData.keep = true;
function door(kit, c) { const g = new THREE.Group(); const f = new THREE.Mesh(doorFrame, basic(0xff7fbf, false)); const p = new THREE.Mesh(doorPane, basic(c, true, 0.85)); p.position.z = 0.14; f.position.y = p.position.y = 1.6; g.add(f, p); g.rotation.x = -0.25; return g; }
const chuottui = {
  // Cửa Thần: a pink magic door stands open at each end for as long as the gate lasts, light pouring out of it
  ctDoor: {
    zones: ['portal'],
    skill() { return true; },
    zoneMake(kit, z) {
      const d1 = door(kit, 0x9fd8ff), d2 = door(kit, 0xfff0a0); d1.position.set(z.x, 0, z.z); d2.position.set(z.x2, 0, z.z2); d1.scale.setScalar(1.5); d2.scale.setScalar(1.5);
      const s1 = sigil(kit, z.x, z.z, z.r * 1.8, CT_SKY, { c2: CT_SUN, n: 0, ticks: 12, inner: 0.6, life: 1e9, rev: 0.2, spin: 1, fill: 0.3 });
      const s2 = sigil(kit, z.x2, z.z2, z.r * 1.8, CT_SUN, { c2: CT_SKY, n: 0, ticks: 12, inner: 0.6, life: 1e9, rev: 0.2, spin: -1, fill: 0.3 });
      return { d1, d2, s1, s2, h: held(kit, [d1, d2]), t: 0 };
    },
    zone(kit, v, z, dt) { v.t += dt; const k = Math.min(1, v.t / 0.2); v.d1.scale.set(1.5, 1.5 * k, 1.5); v.d2.scale.set(1.5, 1.5 * k, 1.5); if (Math.random() < dt * 8) kit.glow(z.x2, R(0.5, 3), z.z2, CT_SUN, 0.6, 0.4, 1, kit.K.STAR, 1, 0, 1, 0); },
    zoneDrop(kit, v) { v.h.on = false; stop(v.s1); stop(v.s2); },
  },
  // Robot Quấy: the robot drops in on a spring of stars: a sky-blue star ring under it while it works, a wind-up key turning
  ctBot: {
    zones: ['turret'], overlay: true,
    skill() { return true; },
    zoneMake(kit, z) {
      const key = new THREE.Group(), m = basic(0xffd040, false); key.add(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.2, 6, 16), m)); key.position.set(z.x, 2.6, z.z);
      const s = sigil(kit, z.x, z.z, 3.8, CT_SKY, { c2: CT_SUN, n: 5, m: 2, ticks: 10, inner: 0.5, life: 1e9, rev: 0.2, spin: 1.5, fill: 0.45, w: 0.12 });
      burst(kit, z.x, z.z, 2.6, CT_SKY, CT_SUN);
      for (let i = 0; i < kit.N(12); i++) { const a = Math.random() * 6.283; kit.glow(z.x, 1, z.z, i % 2 ? CT_SUN : CT_PINK, 0.7, 0.4, 1, kit.K.STAR, 1, Math.cos(a) * 4, R(3, 6), Math.sin(a) * 4); }
      return { key, s, h: held(kit, [key]) };
    },
    zone(kit, v, z, dt) { v.key.rotation.x += dt * 6; v.key.position.set(z.x, 2.6, z.z); },
    zoneDrop(kit, v) { v.h.on = false; stop(v.s); },
  },
  // Túi Đồ Nghề: a ring of gold stars and sky-blue spanners circles her for the five seconds, a sunny ring on the floor
  ctPouch: {
    zoneMake(kit, z) {
      const v0 = {};
      const stars = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => sigil(kit, z.x, z.z, 1.2, i % 2 ? CT_SKY : CT_SUN, { c2: i % 2 ? CT_SUN : CT_PINK, n: 5, m: 2, ticks: 0, inner: 0, life: 1e9, rev: 0.05, spin: 3, fill: 0.5, y: 1.6, w: 0.12 }));
      stars.forEach((m) => { m.rotation.x = 1.1; });
      const s = sigil(kit, z.x, z.z, z.r * 0.75, CT_SUN, { c2: CT_SKY, n: 0, ticks: 24, inner: 0.6, w: 0.08, life: 1e9, rev: 0.3, spin: 0.5, fill: 0.4 });
      // the magic pouch: a big sunny bag floating over her, stars fountaining out of its mouth
      v0.bag = shell(kit, z.x, 3.4, z.z, 2.6, CT_SUN, { c2: C(2.6, 1.2, 0.2), inv: 1.0, core: 1, squash: 1.2, life: 1e9 });
      return Object.assign(v0, { stars, s, t: 0 });
    },
    zone(kit, v, z, dt) { v.t += dt; v.s.position.set(z.x, 0.15, z.z); v.bag.position.set(z.x, 3.4, z.z); if (Math.random() < dt * 20) { const a = Math.random() * 6.283, sp = R(2, 5); kit.glow(z.x, 4.2, z.z, Math.random() < 0.5 ? CT_SUN : CT_SKY, 1, 0.5, 1, kit.K.STAR, 1, Math.cos(a) * sp, R(2, 5), Math.sin(a) * sp); } v.stars.forEach((m, i) => { const a = v.t * 1.6 + i * 0.785, r = z.r * 0.55; m.position.set(z.x + Math.cos(a) * r, 1.6 + 0.4 * Math.sin(v.t * 3 + i), z.z + Math.sin(a) * r); }); },
    zoneDrop(kit, v) { v.stars.forEach(stop); stop(v.s); stop(v.bag); },
  },
};

export const B3 = { ...soi, ...bachhac, ...ung, ...thancong, ...cakiem, ...chuottui };
