// Looks, kit lane k15: Hades (p72 "69.冥王"), Hỏa Long (p4 "1.燎"), Kiếm Thần (p65 "62.李白"), drawn for their ported kits.
// Render only (see looks.js for the hooks). Clip notes (bilibili BV1Kp4y1b7i6, ~/handoff/dtt-ref/bili/clips/pNNN/sheet-*.png):
//   冥王 p72: an ice-blue scythe crescent sweeping round him (21-25 s), a thin blue ring on the floor for the domain (19-22 s),
//     a blue column dropping on the target (27 s) and a big pale-blue energy sphere where he comes down (31 s).
//   燎 p4 and 李白 p65: see their sections below.
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, slash, cut, sigil, shell, pillar, trail, weapon, fadeWeapon, spikes, burst } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);

// ---- Hades: ice blue (one colour) with a deep violet accent ----------------------------------------------------------
const HD_ICE = C(0.42, 1.2, 2.6), HD_PALE = C(1.5, 2.1, 2.6), HD_VIO = C(0.75, 0.3, 2.2), HD_DEEP = C(0.05, 0.12, 0.6), HD_BONE = 0xd8e8ff;
// the scythe itself, swinging once round (x, z) from angle a0 through `turn` rad in `life` s
function scythe(kit, u, a0, turn, life, scale = 2.6) {
  const g = weapon('scythe', HD_BONE, HD_ICE, { opacity: 0.95 }); g.scale.setScalar(scale);
  own(kit, [g], life, (t) => { const k = t / life, a = a0 + turn * (1 - (1 - k) * (1 - k)); g.position.set(u.x, 1.5, u.z); g.rotation.set(0, -a, 0); fadeWeapon(g, Math.min(1, (life - t) / 0.12)); });
}
const hades = {
  // Hình Thái Chuyển Hoán: to Thu Cát the scythe spins out round him once in a violet-edged blue ring; back to Chế Tài the
  // blade folds into a cold soul flame over his head
  hdForm: {
    skill(kit, e, u) {
      if (u.form === 0) {
        scythe(kit, u, e.a, 6.283, 0.6, 3.6);
        slash(kit, u.x, u.z, e.a, 4.4, HD_ICE, { y: 1.4, life: 0.65, span: 3.1, w: 1.6, sweep: 0.35, edge: HD_PALE, c2: HD_VIO, arcs: 3 });
        sigil(kit, u.x, u.z, 4.2, HD_ICE, { c2: HD_VIO, n: 0, ticks: 12, inner: 0.72, life: 0.9, rev: 0.2, spin: 3, fill: 0.14, w: 0.09, follow: u });
      } else {
        shell(kit, u.x, 2.4, u.z, 1.8, HD_ICE, { c2: HD_PALE, p: 1.2, core: 0.35, life: 0.8, grow: 0.15, follow: u, alpha: 0.9 });
        pillar(kit, u.x, u.z, 2, HD_ICE, { c2: HD_VIO, h: 6, life: 0.8, rings: 3, follow: u, alpha: 0.8 });
        sigil(kit, u.x, u.z, 3.8, HD_VIO, { c2: HD_ICE, n: 5, m: 2, life: 0.8, rev: 0.15, spin: -2, fill: 0.06, follow: u });
      }
      kit.flash(u.x, 1.6, u.z, HD_ICE, 25, 0.2);
      return true;
    },
  },
  // Minh Vương Lợi Nhận: Chế Tài throws one wide ice crescent over the fan in front; Thu Cát spins the scythe a full turn
  // round him in two pale strokes
  hdBlade: {
    pal: [HD_ICE, HD_PALE], hitR: 2.2,
    skill() { return true; },
    nova(kit, e, u) {
      if (u.form === 0) {
        slash(kit, e.x, e.z, e.a, e.r * 0.95, HD_ICE, { y: 1.2, life: 0.55, span: 0.75, w: e.r * 0.5, sweep: 0.08, edge: HD_PALE, c2: HD_VIO, arcs: 3, travel: 4 });
        slash(kit, e.x, e.z, e.a, e.r * 0.6, HD_VIO, { y: 0.9, dir: -1, life: 0.45, span: 0.7, w: e.r * 0.3, sweep: 0.1, edge: HD_ICE, arcs: 2 });
        scythe(kit, u, e.a + 0.9, -1.8, 0.3, 2.6);
        cut(kit, e.x + Math.cos(e.a) * e.r * 0.7, e.z + Math.sin(e.a) * e.r * 0.7, e.a + 1.57, 3.4, HD_ICE, { edge: HD_VIO, sparks: 4 });
      } else {
        for (const [k, d] of [[0, 1], [1, -1]]) slash(kit, e.x, e.z, e.a + k * 3.14, e.r * 1.15, k ? HD_VIO : HD_ICE, { y: 1.2, dir: d, life: 0.55, span: 1.6, w: e.r * 0.45, sweep: 0.12, edge: HD_PALE, arcs: 2 });
        scythe(kit, u, e.a, 6.283, 0.35, 2.4);
        sigil(kit, e.x, e.z, e.r, HD_ICE, { c2: HD_VIO, n: 0, ticks: 16, inner: 0.8, life: 0.5, rev: 0.08, spin: 4, fill: 0.1 });
      }
      kit.kick(e.x, e.z, 0.3);
      return true;
    },
  },
  // Minh Vương Giáng Lâm: a lock ring under the foe and a column of blue light dropping on it while he is gone (a cold puff
  // where he stood); he comes down inside a big pale-blue sphere of light that bursts outward
  hdDescend: {
    pal: [HD_ICE, HD_PALE], hitR: 2.6,
    skill() { return true; },
    leap(kit, e) {
      const T = e.dur || 1;
      kit.puffs(e.x0, 0.8, e.z0, kit.N(10), HD_DEEP, 1.4, 2.6, 0.9, 1.8, 2.4, 0.6, 0.8, kit.K.SMOKE, 2);
      shell(kit, e.x0, 1.2, e.z0, 2.4, HD_ICE, { c2: HD_VIO, p: 1.4, core: 0.3, life: 0.5, grow: 0.08, alpha: 0.9 });
      sigil(kit, e.x, e.z, 4.6, HD_ICE, { c2: HD_VIO, n: 6, m: 2, life: T + 0.2, rev: T * 0.5, spin: 1.5, fill: 0.16, w: 0.09 });
      pillar(kit, e.x, e.z, 2.6, HD_ICE, { c2: HD_PALE, h: 12, life: T + 0.1, rings: 4, grow: T * 0.9, drop: true, alpha: 0.85 });
      return true;
    },
    nova(kit, e) {
      shell(kit, e.x, 1.6, e.z, e.r * 1.05, HD_PALE, { c2: HD_ICE, p: 1.6, core: 0.25, life: 0.6, grow: 0.12, alpha: 0.95 });
      shell(kit, e.x, 1.6, e.z, e.r * 0.5, HD_PALE, { inv: 1.4, core: 1, life: 0.3 });
      burst(kit, e.x, e.z, e.r * 1.1, HD_ICE, HD_PALE, { life: 0.35 });
      kit.sparks(e.x, 1.2, e.z, kit.N(18), HD_PALE, 12, 0.5, 0.06, 0.8, 4);
      kit.flash(e.x, 2, e.z, HD_ICE, 60, 0.3); kit.kick(e.x, e.z, 0.8);
      return true;
    },
  },
  // Minh Vương Lĩnh Vực: a thin blue ring of the domain on the floor with a violet six-point seal turning inside, cold motes
  // rising, and a ring of short ice posts; it flashes once when it ends
  hdDomain: {
    zoneMake(kit, z) {
      const s = sigil(kit, z.x, z.z, z.r, HD_ICE, { c2: HD_VIO, n: 6, m: 2, ticks: 30, inner: 0.92, life: 1e9, rev: 0.3, spin: 0.8, fill: 0.05, w: 0.05 });
      const posts = [0, 1, 2, 3, 4, 5].map((i) => pillar(kit, z.x + Math.cos(i * 1.047) * z.r, z.z + Math.sin(i * 1.047) * z.r, 0.35, HD_ICE, { c2: HD_PALE, h: 3.2, life: 1e9, rings: 2, grow: 0.25, alpha: 0.8 }));
      return { s, posts };
    },
    zone(kit, v, z, dt) {
      if (Math.random() < dt * 30) { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * z.r; kit.glow(z.x + Math.cos(a) * d, 0.2, z.z + Math.sin(a) * d, Math.random() < 0.3 ? HD_VIO : HD_ICE, 0.7, 0.28, 1, kit.K.SPARK, 0.6, 0, R(1, 2.5), 0); }
    },
    zoneDrop(kit, v, z, ended) { stop(v.s); v.posts.forEach(stop); if (ended && z) { kit.flash(z.x, 1.5, z.z, HD_ICE, 35, 0.25); kit.ring(z.x, z.z, z.r, HD_ICE, 0.3); } },
  },
};

// ---- Hỏa Long (燎 p4): molten lava red with an orange-gold glow in dark basalt ---------------------------------------
//   燎 p4: a ring of pale light round him with the armour (9 s), dark lava rocks with glowing cracks and a red fire swirl where
//   he comes down and where the heat bursts (10-12 s), red lava left on the ground behind him (10-14 s).
const HL_RED = C(2.4, 0.35, 0.06), HL_GOLD = C(2.6, 1.3, 0.25), HL_ROCK = 0x1a0b08, HL_SOOT = C(0.12, 0.04, 0.02), HL_PALE = C(2.4, 1.9, 1.3);
const hoalong = {
  // Phá Ngục Viêm Nhận: a dome of molten light round him for the 3 s, a pale ring at his feet, embers lifting off it
  hlArmor: {
    skill(kit, e, u) {
      shell(kit, u.x, 0, u.z, 2.9, HL_RED, { c2: HL_RED, p: 1.1, core: 0.4, dome: true, bands: 1.2, follow: u, life: 3, grow: 0.12, pulse: 1.6, alpha: 0.85 });
      sigil(kit, u.x, u.z, 3.4, HL_PALE, { c2: HL_GOLD, n: 0, ticks: 20, inner: 0.8, life: 3, rev: 0.12, spin: 1.2, fill: 0.1, follow: u, w: 0.09 });
      spikes(kit, u.x, u.z, 9, 3.1, 1.9, HL_RED, 0.9, { core: HL_ROCK, up: 0.1 });
      pillar(kit, u.x, u.z, 2.4, HL_GOLD, { c2: HL_RED, h: 4, life: 0.8, rings: 3, follow: u, alpha: 0.75 });
      kit.follow(u, 3, () => { if (Math.random() < 0.4) { const a = Math.random() * 6.283; kit.glow(u.x + Math.cos(a) * 1.8, R(0.3, 1.6), u.z + Math.sin(a) * 1.8, Math.random() < 0.5 ? HL_RED : HL_GOLD, 0.45, 0.3, 1, kit.K.FLAME, 1.2, 0, R(1.5, 3), 0); } });
      kit.chips(u.x, 0.4, u.z, kit.N(8), C(0.2, 0.08, 0.05), 5, 0.7, 0.18);
      kit.flash(u.x, 1.5, u.z, HL_GOLD, 30, 0.2);
      return true;
    },
  },
  // Viêm Lưu Trụy Tinh: a red target ring while he crouches, a molten rock falling with him, and a crown of black lava spikes
  // with glowing cracks bursting up where he lands
  hlMeteor: {
    pal: [HL_RED, HL_GOLD], hitR: 2.6,
    skill(kit, e) { if (e.tx !== undefined) sigil(kit, e.tx, e.tz, 3, HL_RED, { c2: HL_GOLD, n: 0, ticks: 16, inner: 0.6, life: 0.9, rev: 0.25, spin: 2, fill: 0.15 }); return true; },
    leap(kit, e) {
      const T = e.dur || 0.45;
      shell(kit, e.x, 6, e.z, 1.1, HL_GOLD, { c2: HL_RED, inv: 1.3, core: 1, life: T, step: (t, mm) => { mm.position.y = 6 * (1 - t / T) + 1; } });
      return true;
    },
    nova(kit, e) {
      spikes(kit, e.x, e.z, 9, e.r * 0.7, 2.2, HL_RED, 0.9, { core: HL_ROCK, up: 0.1 });
      burst(kit, e.x, e.z, e.r * 1.1, HL_RED, HL_GOLD, { life: 0.35 });
      slash(kit, e.x, e.z, Math.random() * 6.28, e.r * 1.1, HL_RED, { y: 0.6, life: 0.5, span: 3.1, w: e.r * 0.35, sweep: 0.25, edge: HL_GOLD, c2: HL_GOLD });
      kit.puffs(e.x, 0.5, e.z, kit.N(8), HL_SOOT, 1.2, 2.5, 0.9, 1.4, 2.4, 0.6, 0.7, kit.K.SMOKE, 2);
      kit.scorch(e.x, e.z, e.r * 0.8, 3, 1.4, HL_RED); kit.kick(e.x, e.z, 0.7);
      return true;
    },
  },
  // Viêm Chi Thẩm Phán: 2 s of heat (a red-hot shell that grows and throbs round him, a heat column, embers pulled in), then
  // the vent: a wide ring of lava spikes and a fire swirl over the blast
  hlJudge: {
    skill() { return true; },
    castMake(kit, u) {
      const s = shell(kit, u.x, 1.2, u.z, 3, HL_RED, { c2: HL_GOLD, p: 1.2, core: 0.25, bands: 2, follow: u, life: 1e9, grow: 0.5, alpha: 0.85 });
      const g = sigil(kit, u.x, u.z, 5, HL_RED, { c2: HL_GOLD, n: 0, ticks: 24, inner: 0.5, life: 1e9, rev: 0.35, spin: -1.5, fill: 0.32, w: 0.12, follow: u });
      const p = pillar(kit, u.x, u.z, 2.2, HL_RED, { c2: HL_GOLD, h: 6, life: 1e9, rings: 3, follow: u, alpha: 0.6 });
      return { s, g, p, k: 0, x: u.x, z: u.z };
    },
    cast(kit, v, u, s, k, dt) {
      v.k = k; v.x = u.x; v.z = u.z;
      if (Math.random() < dt * 40) { const a = Math.random() * 6.283, d = 4; kit.glow(u.x + Math.cos(a) * d, R(0.3, 1.5), u.z + Math.sin(a) * d, HL_GOLD, 0.4, 0.3, 1, kit.K.SPARK, 0.4, -Math.cos(a) * 9, 0, -Math.sin(a) * 9); }
      if (Math.random() < dt * 6) kit.glow(u.x, 1.2, u.z, HL_RED, 0.3, 2.5 + 2 * k, 0.5, kit.K.GLOW, 1.2);
    },
    castDrop(kit, v) {
      stop(v.s); stop(v.g); stop(v.p);
      if (v.k < 0.85) return;
      const r = 5;
      spikes(kit, v.x, v.z, 14, r * 0.75, 2.6, HL_RED, 1.0, { core: HL_ROCK, up: 0.12 });
      for (const d of [1, -1]) slash(kit, v.x, v.z, d * 1.2, r * 1.05, HL_RED, { y: 0.8, dir: d, life: 0.6, span: 3.1, w: r * 0.3, sweep: 0.3, edge: HL_GOLD, c2: HL_GOLD });
      burst(kit, v.x, v.z, 3.2, HL_GOLD, HL_PALE, { life: 0.35 });
      kit.puffs(v.x, 0.6, v.z, kit.N(12), HL_SOOT, 2.5, 3, 1, 1.6, 2.6, 0.6, 0.8, kit.K.SMOKE, 3);
      kit.flash(v.x, 2, v.z, HL_RED, 70, 0.35); kit.kick(v.x, v.z, 1);
    },
  },
  // Hỏa Diễm Chi Tức: a pool of dark red lava with a molten rim and embers
  hlLava: {
    zoneMake(kit, z) { return { s: sigil(kit, z.x, z.z, z.r, HL_RED, { c2: HL_GOLD, n: 0, ticks: 0, inner: 0.55, life: 1e9, rev: 0.15, spin: 0.3, fill: 0.55, w: 0.1, alpha: 0.9 }) }; },
    zone(kit, v, z, dt) { if (Math.random() < dt * 6) kit.glow(z.x + R(-0.6, 0.6), 0.2, z.z + R(-0.6, 0.6), HL_GOLD, 0.6, 0.25, 1, kit.K.FLAME, 1, 0, R(1, 2), 0); },
    zoneDrop(kit, v) { stop(v.s); },
  },
};

// ---- Kiếm Thần = Lý Bạch (李白 p65): moon-white swords with a crimson fire accent ------------------------------------
//   李白 p65: a gold-white flash of the wine (23 s), white swords round him, a red flying sword, red fire swords dropping inside
//   columns of fire on the foes (MAP).
const KT_WHITE = C(2.2, 2.3, 2.6), KT_MOON = C(0.9, 1.3, 2.4), KT_RED = C(2.5, 0.3, 0.12), KT_GOLD = C(2.6, 2.0, 0.8), KT_STEEL = 0xe8eef8;
function swordAt(kit, life, place) {
  const g = weapon('sword', KT_STEEL, KT_RED, { opacity: 0.95 }); g.scale.setScalar(2.2);
  own(kit, [g], life, (t) => place(g, t));
  return g;
}
const kiemthan = {
  // Vạn Cổ Tiêu Sầu: a gold-white splash of wine, a white ring of six swords flashing out round him as the push goes off
  ktDrink: {
    pal: [KT_WHITE, KT_GOLD], hitR: 2,
    skill(kit, e, u) { shell(kit, u.x, 1.4, u.z, 1.3, KT_GOLD, { c2: KT_WHITE, inv: 1.2, core: 1, life: 0.3 }); shell(kit, u.x, 1.2, u.z, 3, KT_GOLD, { c2: KT_WHITE, p: 1.5, core: 0.15, life: 0.5, grow: 0.1, alpha: 0.8 }); kit.flash(u.x, 1.6, u.z, KT_GOLD, 40, 0.25); return true; },
    nova(kit, e) {
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047;
        swordAt(kit, 0.45, (g, t) => { const d = 1 + e.r * Math.min(1, t / 0.18); g.position.set(e.x + Math.cos(a) * d, 1.3, e.z + Math.sin(a) * d); g.rotation.set(0, -a, 0); fadeWeapon(g, Math.min(1, (0.45 - t) / 0.15)); });
      }
      slash(kit, e.x, e.z, 0, e.r * 1.15, KT_MOON, { y: 1, life: 0.5, span: 3.1, w: e.r * 0.4, sweep: 0.12, edge: KT_WHITE, c2: KT_GOLD, arcs: 2 });
      kit.sparks(e.x, 1.2, e.z, kit.N(14), KT_GOLD, 8, 0.4, 0.05, 0.6, 3);
      return true;
    },
  },
  // Long Tuyền Xuất Hạp: the sword itself flies point first in a red-edged white streak; it ends in a crimson X cut
  ktFly: {
    skill(kit, e, u) {
      kit.glow(u.x + Math.cos(e.a) * 1.3, 1.3, u.z + Math.sin(e.a) * 1.3, KT_WHITE, 0.12, 1.6, 1, kit.K.STAR, 1.3);
      slash(kit, u.x, u.z, e.a, 5.2, KT_RED, { y: 1.3, life: 0.4, span: 1.4, w: 2.3, sweep: 0.06, edge: KT_WHITE, c2: KT_RED, arcs: 3 });
      sigil(kit, u.x, u.z, 2.8, KT_MOON, { c2: KT_RED, n: 0, ticks: 10, inner: 0.7, life: 0.5, rev: 0.06, spin: 3, fill: 0.15, w: 0.08 });
      return true;
    },
    shotMake(kit, s) {
      const v = { x: s.x, z: s.z, live: true, a: Math.atan2(s.dz, s.dx) };
      swordAt(kit, 1e9, (g) => { if (!v.live) return false; g.position.set(v.x, 1.3, v.z); g.rotation.set(0, -v.a, 0); });
      trail(kit, () => (v.live ? [v.x, 1.3, v.z] : null), 1.1, KT_WHITE, 2, { c2: KT_RED, len: 18 });
      trail(kit, () => (v.live ? [v.x, 1.35, v.z] : null), 1.4, KT_RED, 2, { c2: KT_MOON, len: 14, up: true });
      return v;
    },
    shot(kit, v, s, x, y, z) { v.x = x; v.z = z; v.a = Math.atan2(s.dz, s.dx); kit.glow(x, 1.3, z, KT_WHITE, 0.06, 0.9, 1, kit.K.STAR, 1); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; cut(kit, x, z, v.a, 3, KT_RED, { edge: KT_WHITE, sparks: 5 }); kit.flash(x, 1.5, z, KT_RED, 25, 0.15); },
  },
  // Cửu Thiên Thần Kiếm: white swords ring him at the press; over each locked foe a red fire sword hangs point down in a lock
  // ring, and after 1.5 s it drops inside a column of fire
  ktHeaven: {
    pal: [KT_RED, KT_GOLD], hitR: 2.2,
    zones: ['strike'],
    skill(kit, e, u) {
      for (let i = 0; i < 8; i++) { const a = i * 0.785; swordAt(kit, 0.8, (g, t) => { const b = a + t * 3; g.position.set(u.x + Math.cos(b) * 2.2, 1.6, u.z + Math.sin(b) * 2.2); g.rotation.set(0, -b - 1.57, 0); fadeWeapon(g, Math.min(1, (0.8 - t) / 0.2)); }); }
      return true;
    },
    zoneMake(kit, z) {
      const v = { on: true };
      v.s = sigil(kit, z.x, z.z, Math.max(1.8, z.r), KT_RED, { c2: KT_GOLD, n: 0, ticks: 12, inner: 0.6, life: 1e9, rev: 0.3, spin: 2.5, fill: 0.08 });
      v.zz = z;
      swordAt(kit, 1e9, (g) => { if (!v.on) return false; g.position.set(v.zz.x, 5.5, v.zz.z); g.rotation.set(0, 0, -Math.PI / 2); g.scale.setScalar(2.4); });
      return v;
    },
    zone(kit, v, z) { v.zz = z; v.s.position.x = z.x; v.s.position.z = z.z; },
    zoneDrop(kit, v) { v.on = false; stop(v.s); },
    land(kit, e) {
      swordAt(kit, 0.5, (g, t) => { g.scale.setScalar(2.4); g.rotation.set(0, 0, -Math.PI / 2); g.position.set(e.x, Math.max(0.6, 5.5 - t * 40), e.z); fadeWeapon(g, Math.min(1, (0.5 - t) / 0.2)); });
      pillar(kit, e.x, e.z, 2.2, KT_RED, { c2: KT_GOLD, h: 9, life: 0.7, rings: 4, alpha: 0.95 });
      burst(kit, e.x, e.z, 3.6, KT_RED, KT_GOLD, { life: 0.35 });
      cut(kit, e.x, e.z, 0.6, 4.4, KT_RED, { edge: KT_WHITE, sparks: 6, life: 0.2 });
      sigil(kit, e.x, e.z, 3.2, KT_RED, { c2: KT_GOLD, n: 8, m: 3, life: 0.7, rev: 0.06, spin: 2, fill: 0.2 });
      kit.flash(e.x, 2, e.z, KT_RED, 45, 0.25); kit.kick(e.x, e.z, 0.4);
      return true;
    },
  },
};

export const K15 = { ...hades, ...hoalong, ...kiemthan };
