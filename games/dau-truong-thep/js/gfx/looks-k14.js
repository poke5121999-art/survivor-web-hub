// Looks, kit lane k14: Gilgamesh, remade with the kits ported from the owner's clips. Render only (see looks.js).
// One main colour and one accent per tank, one strong shape per skill, soft halos.
//   英雄王 p74 (Gilgamesh): a golden lattice sphere round him (Thiên Chi Tỏa); a huge pale-gold sword plunged into a thin sky-blue
//     ring with orange flashes where it tears (Quai Ly); golden ripples opening in a fan behind him, gold blades pouring out of
//     them (Vương Chi Tài Bảo); golden chains closing round a bound foe (the passive).
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, slash, sigil, shell, trail, weapon, burst } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
const keep = (g) => { g.userData.keep = true; return g; };
const basic = (color, add, opacity = 1) => new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity, depthWrite: !add, ...(add ? { blending: THREE.AdditiveBlending } : {}), side: THREE.DoubleSide });
// a jagged bolt of light between two points (a few short streaks), for lightning and crackle
function bolt(kit, x0, y0, z0, x1, y1, z1, c, n = 4) {
  let px = x0, py = y0, pz = z0;
  for (let i = 1; i <= n; i++) {
    const f = i / n, j = i < n ? 0.35 : 0, x = x0 + (x1 - x0) * f + R(-j, j), y = y0 + (y1 - y0) * f + R(-j, j), z = z0 + (z1 - z0) * f + R(-j, j);
    kit.str.emit(px, py, pz, (x - px) * 30, (y - py) * 30, (z - pz) * 30, c, 0.07, 0.05, 0.06, 0, 0, 1);
    px = x; py = y; pz = z;
  }
}

// ---- Gilgamesh: the King of Heroes, gold with a sky-blue accent ------------------------------------------------------
const GG_GOLD = C(2.6, 1.85, 0.35), GG_WHITE = C(2.6, 2.4, 1.8), GG_DEEP = C(0.6, 0.35, 0.02), GG_SKY = C(0.45, 1.3, 2.6), GG_EMBER = C(2.6, 0.95, 0.2);
// a golden ripple hanging in the air: concentric rings round a bright core, upright, facing the camera
function ripple(kit, x, y, z, r, life, opts = {}) {
  const s = sigil(kit, x, z, r, GG_GOLD, { c2: GG_WHITE, n: 0, ticks: 12, inner: 0.55, life, rev: 0.12, spin: 2, fill: 0.45, y, w: 0.1, ...opts });
  s.rotation.x = 1.15; return s;
}
const ggBlade = (s = 3.2) => { const g = weapon('sword', 0xffe9a0, GG_GOLD); g.scale.setScalar(s); return g; };
const linkGeo = keep(new THREE.TorusGeometry(0.34, 0.1, 6, 12));
// Enkidu: a loop of golden links closing round (x, z) at height y, shrinking onto the foe
function chainLoop(kit, x, y, z, r, life, follow) {
  const g = new THREE.Group(), m = basic(0xffd860, false);
  const n = 18;
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.283, l = new THREE.Mesh(linkGeo, m); l.position.set(Math.cos(a), 0, Math.sin(a)); l.rotation.set(i % 2 ? Math.PI / 2 : 0, -a, 0); g.add(l); }
  g.position.set(x, y, z);
  own(kit, [g], life, (t) => {
    if (follow) { if (!follow.alive) return false; g.position.x = follow.x; g.position.z = follow.z; }
    const k = Math.min(1, t / 0.18), rr = r * (1.8 - 0.8 * k);
    g.scale.set(rr, 1, rr); g.rotation.y += 0.04; m.opacity = Math.min(1, (life - t) / 0.3);
  });
  return g;
}

const gilgamesh = {
  // Phược Thần Chi Tỏa (passive): the bound foe: two golden chain loops close round it from four ripples in the air
  ggBind: {
    stacks(kit, e) {
      const o = kit.match.units[e.id];
      chainLoop(kit, e.x, 0.8, e.z, 1.5, 1.5, o); chainLoop(kit, e.x, 1.6, e.z, 1.2, 1.5, o);
      for (let i = 0; i < 4; i++) { const a = i * 1.571 + 0.785; ripple(kit, e.x + Math.cos(a) * 3.2, 2.8, e.z + Math.sin(a) * 3.2, 1.1, 0.8); kit.beam(e.x + Math.cos(a) * 3.2, e.z + Math.sin(a) * 3.2, e.x, e.z, 0.25, GG_GOLD, 0.45, 0, 1.6).fade = true; }
      sigil(kit, e.x, e.z, 2.4, GG_GOLD, { c2: GG_WHITE, n: 4, m: 1, ticks: 8, inner: 0.6, fill: 0.2, life: 1.2, rev: 0.06, spin: -1.5, w: 0.08 });
      kit.flash(e.x, 1.6, e.z, GG_GOLD, 40, 0.25);
      return true;
    },
  },
  // Thiên Chi Tỏa: a golden lattice sphere wraps him for 4 s, two little ripples turning round it
  ggVault: {
    pal: [GG_DEEP, GG_GOLD],
    skill() { return true; },
    transform(kit, e, u, row) {
      const dur = row.dur || 4;
      shell(kit, u.x, 1.3, u.z, 3.0, GG_GOLD, { c2: GG_WHITE, p: 1.1, core: 0.1, bands: 1.8, follow: u, life: dur, grow: 0.15, alpha: 1 });
      shell(kit, u.x, 1.3, u.z, 2.6, GG_DEEP, { c2: GG_GOLD, p: 2.5, core: 0.05, follow: u, life: dur, grow: 0.15, alpha: 0.6 });
      [0.5, 1.4, 2.3].forEach((y, i) => chainLoop(kit, u.x, y, u.z, 2.6 - i * 0.35, dur, u));
      sigil(kit, u.x, u.z, 3.4, GG_GOLD, { c2: GG_WHITE, n: 6, m: 2, ticks: 12, inner: 0.7, fill: 0.3, life: dur, rev: 0.15, spin: 1.2, follow: u, w: 0.1 });
      kit.follow(u, dur, () => {
        const a = kit.time * 2.2;
        for (const sd of [0, Math.PI]) kit.glow(u.x + Math.cos(a + sd) * 2.4, 1.5, u.z + Math.sin(a + sd) * 2.4, GG_GOLD, 0.1, 0.9, 0.9, kit.K.STAR, 1.2);
      });
      kit.flash(u.x, 1.6, u.z, GG_GOLD, 40, 0.25);
      return true;
    },
  },
  // Thiên Địa Quai Ly: the first strike draws the whole skill: a thin sky-blue ring and a huge pale-gold sword plunging into its
  // centre, standing there for the three seconds; every strike tears an orange flash round the blade
  ggEa: {
    zones: ['strike'], ownDisc: true, pal: [GG_EMBER, GG_WHITE], hitR: 1.8,
    skill() { return true; },
    zoneMake(kit, z) {
      if (!(z.total < 0.35)) return {};
      const life = 3.3, ring = sigil(kit, z.x, z.z, z.r, GG_SKY, { c2: GG_WHITE, n: 0, ticks: 16, inner: 0.9, fill: 0.3, w: 0.09, life, rev: 0.12, spin: 0.4 });
      const g = ggBlade(8); g.rotation.set(0, 0, -Math.PI / 2);
      let next = 0;
      own(kit, [g], life, (t) => {
        const k = Math.min(1, t / 0.3); g.position.set(z.x, 10 - 7.6 * k * k, z.z); g.rotation.y = t * 0.6;
        if (t >= next && t < life - 0.4) { next = t + 0.3; slash(kit, z.x, z.z, t * 5, z.r * 0.85, GG_SKY, { c2: GG_DEEP, edge: GG_WHITE, span: 2.4, life: 0.6, w: z.r * 0.3, sweep: 0.2, arcs: 2, dir: -1, sparks: false }); }
      });
      shell(kit, z.x, 0.8, z.z, z.r * 0.8, GG_SKY, { c2: GG_WHITE, p: 2, core: 0.05, dome: true, life, grow: 0.3, alpha: 0.55 });
      return { ring };
    },
    land(kit, e) {
      const a = Math.random() * 6.283;
      slash(kit, e.x, e.z, a, 3.2, GG_EMBER, { c2: GG_DEEP, edge: GG_WHITE, span: 1.8, life: 0.4, w: 0.9, sweep: 0.05, arcs: 1, sparks: false });
      kit.sparks(e.x, 1.2, e.z, kit.N(8), GG_EMBER, 8, 0.35, 0.06, 0.6, 8); kit.flash(e.x, 1.4, e.z, GG_EMBER, 30, 0.15); kit.kick(e.x, e.z, 0.15);
      return true;
    },
  },
  // Vương Chi Tài Bảo: golden ripples open one by one in a fan behind him while he winds up and pours; each weapon flies out of
  // a ripple, a gold blade on a short golden streak
  ggTreasury: {
    pal: [GG_DEEP, GG_GOLD], hitR: 1.6,
    skill(kit, e, u) { kit.flash(u.x, 2.2, u.z, GG_GOLD, 45, 0.3); return true; },
    castMake(kit, u) {
      const rs = [];
      for (let i = 0; i < 11; i++) rs.push(ripple(kit, u.x, 2.4, u.z, i < 7 ? 1.9 : 1.5, 1e9, { rev: 0.15 + i * 0.03, fill: 0.6 }));
      const halo = sigil(kit, u.x, u.z, 4.2, GG_GOLD, { c2: GG_WHITE, n: 8, m: 3, ticks: 16, inner: 0.65, fill: 0.2, life: 1e9, rev: 0.25, spin: 0.8, follow: u, w: 0.08 });
      return { rs, halo };
    },
    cast(kit, v, u) {
      const a = u.aim, b = a + Math.PI;
      v.rs.forEach((r, i) => {
        const top = i >= 7, f = top ? (i - 9) / 2 : (i - 3) / 3, side = b + f * (top ? 0.8 : 1.3), d = top ? 2.2 : 3.2 + 0.4 * Math.abs(f);
        r.position.set(u.x + Math.cos(side) * d, (top ? 4.4 : 2.4) + 0.8 * (1 - Math.abs(f)) + 0.15 * Math.sin(kit.time * 5 + i), u.z + Math.sin(side) * d);
        r.rotation.set(1.15, 0, 0); r.rotation.y = -a;
      });
      if (Math.random() < 0.5) kit.glow(u.x + Math.cos(b) * 2.4, 2.6, u.z + Math.sin(b) * 2.4, GG_GOLD, 0.12, 0.6, 0.9, kit.K.STAR, 1.2, R(-1, 1), R(0, 1), R(-1, 1));
    },
    castDrop(kit, v) { v.rs.forEach(stop); stop(v.halo); },
    shotMake(kit, s) {
      const g = ggBlade(3.4), v = { g, h: held(kit, [g]), a: Math.atan2(s.dz, s.dx), x: s.x, z: s.z, live: true };
      trail(kit, () => (v.live ? [v.x, 1.5, v.z] : null), 1.1, GG_GOLD, 1e9, { c2: GG_DEEP, len: 10 });
      kit.glow(s.x, 1.6, s.z, GG_WHITE, 0.1, 1.1, 1, kit.K.STAR, 1.2);
      return v;
    },
    shot(kit, v, s, x, y, z) { v.x = x; v.z = z; v.g.position.set(x, 1.5, z); v.g.rotation.set(0, -v.a, 0); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; v.h.on = false; kit.sparks(x, 1.3, z, kit.N(6), GG_GOLD, 7, 0.3, 0.05, 0.5, 8); },
  },
};

export const K14 = { ...gilgamesh };
