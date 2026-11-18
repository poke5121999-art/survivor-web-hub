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

export const K15 = { ...hades };
