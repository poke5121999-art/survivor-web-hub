// Looks, kit lane k14: Gilgamesh, Baymax and Doraemon, remade with the kits ported from the owner's clips. Render only (see looks.js).
// One main colour and one accent per tank, one strong shape per skill, soft halos.
//   英雄王 p74 (Gilgamesh): a golden lattice sphere round him (Thiên Chi Tỏa); a huge pale-gold sword plunged into a thin sky-blue
//     ring with orange flashes where it tears (Quai Ly); golden ripples opening in a fan behind him, gold blades pouring out of
//     them (Vương Chi Tài Bảo); golden chains closing round a bound foe (the passive).
//   小白 p59 (Baymax): a bright mint-green chain between him and the ally; a white bomb lobbed into a pale-blue flash; an ice-blue
//     comet with rings when he flies, golden-white shields on both, ice-crystal wings and a cold ring while he is the warrior.
//   蓝胖子 p58 (Doraemon): a sky-blue door frame standing on the floor with violet lightning in it; a cyan diamond tile for the
//     trap, crackling; an aiming ring, then a white-blue cloud whirling inward with lightning for the vortex.
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

// ---- Baymax: ice-blue light, mint-green accent -------------------------------------------------------------------------
const BM_ICE = C(1.2, 2.1, 2.6), BM_WHITE = C(2.5, 2.6, 2.6), BM_DEEP = C(0.08, 0.3, 0.6), BM_MINT = C(0.35, 2.6, 1.2);
const featherGeo = keep(new THREE.ConeGeometry(0.16, 1, 4).rotateZ(-Math.PI / 2).translate(0.5, 0, 0));
// a pair of ice-crystal wings: feathers fanned out on both sides of the mech, folding with a slow beat
function wings(kit, u, life) {
  const g = new THREE.Group(), m = basic(0xa8e4ff, true, 0.9), list = [];
  for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(featherGeo, m); g.add(f); list.push([f, sd, i]); }
  own(kit, [g], life, (t) => {
    if (!u.alive || (t > 0.3 && !(u.tfT > 0))) return false;
    const h = u.heading ?? u.aim, beat = 0.25 * Math.sin(t * 5);
    g.position.set(u.x, 1.5, u.z); g.rotation.y = -h;
    for (const [f, sd, i] of list) { const a = sd * (1.45 + i * 0.16 + beat) + Math.PI; f.position.set(-0.4, 0.15 * i, 0); f.rotation.set(0, -a, sd * (0.15 + i * 0.05)); f.scale.set(2.4 + 0.45 * i, 1.6, 1.6); }
    m.opacity = 0.9 * Math.min(1, t / 0.2, t < 0.3 ? 1 : u.tfT / 0.3);
  });
}
const suatrang = {
  // Siêu Năng Trị Dũ: a bright mint-green chain from him to the ally for as long as it holds, little green crosses rising off both
  bmTether: {
    bless(kit, e, u) {
      const o = kit.match.units[e.to]; if (!o) return true;
      const b = kit.beam(u.x, u.z, o.x, o.z, 1.3, BM_MINT, 99, 0, 1.5), c = kit.beam(u.x, u.z, o.x, o.z, 0.4, BM_WHITE, 99, 0, 1.5), t0 = kit.time;
      const tied = () => u.alive && o.alive && (kit.time - t0 < 0.3 || u.stTie === o.id + 1);
      for (const p of [u, o]) {
        shell(kit, p.x, 1.2, p.z, 2.6, BM_MINT, { c2: C(0.05, 1.0, 0.35), p: 1.0, core: 0.3, bands: 2, follow: p, life: 60, grow: 0.15, step: () => tied() });
        const sg = sigil(kit, p.x, p.z, 3.0, C(0.1, 1.8, 0.6), { c2: BM_WHITE, n: 4, m: 1, ticks: 8, inner: 0.6, fill: 0.5, life: 60, rev: 0.15, spin: 1.5, follow: p, w: 0.09 });
        kit.anims.push({ step() { if (tied()) return true; stop(sg); return false; }, drop() {} });
      }
      // the chain itself: mint links strung along the beam, sagging a little
      const lm = basic(0x3cff9a, false, 0.95), links = new THREE.Group();
      for (let i = 0; i < 16; i++) { const l = new THREE.Mesh(linkGeo, lm); l.scale.setScalar(1.25); links.add(l); }
      own(kit, [links], 60, () => tied());
      let t = 0;
      kit.anims.push({ step(dt) {
        t += dt;
        if (!tied()) return false;
        kit.aimBeam(b, u.x, u.z, o.x, o.z, 1.5); kit.aimBeam(c, u.x, u.z, o.x, o.z, 1.5);
        const a = Math.atan2(o.z - u.z, o.x - u.x), n = links.children.length;
        links.children.forEach((l, i) => { const f = (i + 0.5) / n; l.position.set(u.x + (o.x - u.x) * f, 1.5 - 0.5 * Math.sin(f * Math.PI), u.z + (o.z - u.z) * f); l.rotation.set(i % 2 ? Math.PI / 2 : 0, -a + Math.PI / 2, 0); });
        b.u.uA.value = 0.75 + 0.25 * Math.sin(t * 9);
        if (Math.random() < dt * 10) for (const p of [u, o]) kit.glow(p.x + R(-0.6, 0.6), 1.2, p.z + R(-0.6, 0.6), BM_MINT, 0.6, 0.35, 1, kit.K.STAR, 1, 0, R(1, 2), 0);
        return true;
      }, drop() { kit.endBeam(b); kit.endBeam(c); } });
      return true;
    },
  },
  // Siêu Năng Tạc Đạn: a white bomb lobbed from him to the spot inside a thin pale-blue ring; it goes off in a pale-blue flash
  // with a shock ring
  bmBomb: {
    zones: ['strike'], ownDisc: true, pal: [BM_ICE, BM_WHITE], hitR: 2.2,
    skill() { return true; },
    zoneMake(kit, z) {
      const o = kit.match.units[z.owner], x0 = o ? o.x : z.x, z0 = o ? o.z : z.z;
      const ring = sigil(kit, z.x, z.z, z.r, BM_ICE, { c2: BM_WHITE, n: 0, ticks: 8, inner: 0.85, fill: 0.1, w: 0.06, life: 1e9, rev: 0.1, spin: 1.5 });
      const ball = shell(kit, x0, 1.2, z0, 0.45, BM_WHITE, { c2: BM_ICE, p: 1.2, core: 0.7, life: 1e9 });
      return { ring, ball, x0, z0, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt;
      const k = Math.min(1, v.t / Math.max(0.1, z.total || 0.5));
      v.ball.position.set(v.x0 + (z.x - v.x0) * k, 1.2 + 3.2 * Math.sin(k * Math.PI), v.z0 + (z.z - v.z0) * k);
    },
    zoneDrop(kit, v) { stop(v.ring); stop(v.ball); },
    land(kit, e) {
      burst(kit, e.x, e.z, 4.5, BM_ICE, BM_WHITE, { life: 0.4 });
      shell(kit, e.x, 1.0, e.z, e.r * 1.05, BM_WHITE, { c2: BM_ICE, inv: 1.4, core: 0.8, life: 0.7, step: (t, m) => { m.scale.setScalar(e.r * (0.4 + 0.75 * Math.min(1, t / 0.15))); } });
      sigil(kit, e.x, e.z, e.r * 1.25, BM_ICE, { c2: BM_WHITE, n: 8, m: 3, ticks: 0, inner: 0.82, fill: 0.35, life: 0.8, rev: 0.05, spin: 2, w: 0.1 });
      kit.ring(e.x, e.z, e.r * 1.4, BM_ICE, 0.5); kit.ring(e.x, e.z, e.r * 0.8, BM_WHITE, 0.35, 0.7);
      kit.puffs(e.x, 0.6, e.z, kit.N(8), C(0.8, 0.9, 1.0), 1.2, 3, 0.7, 1.0, 2.2, 0.4, 0.45, kit.K.SMOKE, 2.5);
      kit.kick(e.x, e.z, 0.35);
      return true;
    },
  },
  // Siêu Năng Chiến Sĩ: light gathers on him while he winds up; he flies as an ice-blue comet with rings left in the air; on
  // landing a cold ring, white-gold shields on him and the ally, then ice-crystal wings and a turning ring for the warrior's 10 s
  bmWarrior: {
    pal: [BM_ICE, BM_WHITE], hitR: 2,
    skill() { return true; },
    castMake(kit, u) { return { s: sigil(kit, u.x, u.z, 2.6, BM_ICE, { c2: BM_WHITE, n: 6, m: 2, ticks: 12, inner: 0.6, fill: 0.2, life: 1e9, rev: 0.3, spin: 3, follow: u, w: 0.08 }) }; },
    cast(kit, v, u, s, k) { if (Math.random() < 0.7) { const b = Math.random() * 6.283; kit.str.emit(u.x + Math.cos(b) * 2.2, 1.4, u.z + Math.sin(b) * 2.2, -Math.cos(b) * 6, 0, -Math.sin(b) * 6, BM_ICE, 0.3, 0.08, 0.06, 0, 0, 1); } kit.glow(u.x, 1.6, u.z, BM_WHITE, 0.05, 0.8 + 1.5 * k, 0.9, kit.K.GLOW, 1.2); },
    castDrop(kit, v) { stop(v.s); },
    leap(kit, e, u, row) {
      const dur = e.dur || 0.6, dx = e.x - e.x0, dz = e.z - e.z0;
      trail(kit, (t) => (t < dur + 0.05 && u.alive ? [u.x, 1.8, u.z] : null), 1.6, BM_ICE, dur + 0.6, { c2: BM_DEEP, len: 20 });
      trail(kit, (t) => (t < dur + 0.05 && u.alive ? [u.x, 1.8, u.z] : null), 0.5, BM_WHITE, dur + 0.5, { len: 12, up: true });
      for (let i = 1; i <= 3; i++) { const f = i / 4; const s = sigil(kit, e.x0 + dx * f, e.z0 + dz * f, 1.6, BM_ICE, { c2: BM_WHITE, n: 0, ticks: 0, inner: 0.82, fill: 0.05, w: 0.08, life: 0.7, rev: 0.05, y: 1.8, grow: 6 }); s.rotation.x = 0; s.rotation.z = Math.PI / 2; s.rotation.y = -Math.atan2(dz, dx); }
      kit.anims.push({ t: 0, step(dt) {
        this.t += dt; if (this.t < dur) return true;
        const rr = row.radius || 3.5;
        burst(kit, u.x, u.z, 4.5, BM_ICE, BM_WHITE, { life: 0.4 });
        shell(kit, u.x, 0, u.z, rr * 1.15, BM_ICE, { c2: BM_WHITE, p: 1.2, core: 0.25, dome: true, life: 0.9, grow: 0.12 });
        sigil(kit, u.x, u.z, rr * 1.35, BM_ICE, { c2: BM_WHITE, n: 8, m: 3, ticks: 16, inner: 0.7, fill: 0.35, life: 1.2, rev: 0.06, spin: 2, w: 0.1 });
        kit.ring(u.x, u.z, rr * 1.5, BM_ICE, 0.55);
        for (const o of kit.match.units) if (o.alive && o.team === u.team && Math.hypot(o.x - u.x, o.z - u.z) < (row.radius || 3.5) + 0.5) shell(kit, o.x, 1.1, o.z, 1.5, C(2.6, 2.2, 1.2), { c2: BM_WHITE, p: 2.4, core: 0.04, follow: o, life: row.shieldDur || 5, grow: 0.15, alpha: 0.8 });
        wings(kit, u, 10.5);
        sigil(kit, u.x, u.z, 3, BM_ICE, { c2: BM_WHITE, n: 0, ticks: 18, inner: 0.75, fill: 0.12, w: 0.06, life: 10.3, rev: 0.2, spin: 1.2, follow: u, alpha: 0.85 });
        kit.flash(u.x, 2, u.z, BM_WHITE, 50, 0.3); kit.kick(u.x, u.z, 0.4);
        return false; }, drop() {} });
      return true;
    },
  },
};

// ---- Doraemon: sky blue, violet-white lightning accent -----------------------------------------------------------------
const DR_BLUE = C(0.3, 1.2, 2.6), DR_CYAN = C(0.3, 2.2, 2.6), DR_VIO = C(1.6, 1.0, 2.6), DR_WHITE = C(2.4, 2.5, 2.6), DR_DEEP = C(0.04, 0.15, 0.5);
const frameGeo = keep(new THREE.BoxGeometry(0.22, 1, 0.22)), paneGeo = keep(new THREE.PlaneGeometry(1, 1));
// the Anywhere Door: a glowing blue frame standing on the floor with a violet pane, turned toward the camera a little
function door(kit, x, z) {
  const g = new THREE.Group(), fm = basic(0x6fc4ff, true, 1), pm = basic(0x7a4dff, true, 0.6), W = 2.6, H = 4.0;
  const parts = [[-W / 2, H / 2, 0.36, H], [W / 2, H / 2, 0.36, H], [0, H, W + 0.36, 0.36], [0, 0.05, W + 0.36, 0.36]];
  for (const [px, py, sx, sy] of parts) { const b = new THREE.Mesh(frameGeo, fm); b.position.set(px, py, 0); b.scale.set(sx / 0.22, sy, 1); g.add(b); }
  const p = new THREE.Mesh(paneGeo, pm); p.position.set(0, H / 2, 0); p.scale.set(W, H, 1); g.add(p);
  g.position.set(x, 0, z); g.rotation.x = -0.3;
  g.traverse((o) => { o.renderOrder = 7; });
  return { g, fm, pm, H };
}
const chuottui = {
  // Nhậm Ý Môn: the door stands at its spot while it waits, violet lightning crawling in the pane; whoever goes through comes
  // out in a violet star by Doraemon
  ctDoor: {
    zones: ['portal'],
    skill() { return true; },
    zoneMake(kit, z) {
      const d = door(kit, z.x, z.z), h = held(kit, [d.g]);
      const s = sigil(kit, z.x, z.z, (z.r || 1.4) * 2, DR_BLUE, { c2: DR_VIO, n: 0, ticks: 12, inner: 0.7, fill: 0.4, life: 1e9, rev: 0.2, spin: 1, w: 0.1 });
      const sh = shell(kit, z.x, 2, z.z, 2.4, DR_BLUE, { c2: DR_VIO, p: 2.2, core: 0.04, life: 1e9, squash: 1.1, alpha: 0.7 });
      kit.flash(z.x, 1.8, z.z, DR_BLUE, 40, 0.25);
      return { d, h, s, sh, t: 0, z };
    },
    zone(kit, v, z, dt) {
      v.t += dt;
      const k = Math.min(1, v.t / 0.2), H = v.d.H;
      v.d.g.scale.set(1, k, 1);
      v.d.pm.opacity = 0.5 + 0.15 * Math.sin(v.t * 8);
      if (Math.random() < dt * 14) bolt(kit, z.x + R(-0.7, 0.7), H * k * 0.95, z.z, z.x + R(-0.7, 0.7), 0.2, z.z, DR_VIO, 4);
    },
    zoneDrop(kit, v, z) {
      v.h.on = false; stop(v.s); stop(v.sh);
      if (!(v.t < (v.z.dur || 4) - 0.1)) return;   // it was used: a violet star where the traveller came out (by Doraemon)
      const o = kit.match.units[v.z.owner];
      for (const [x, zz] of [[v.z.x, v.z.z], ...(o ? [[o.x, o.z]] : [])]) {
        burst(kit, x, zz, 3, DR_VIO, DR_WHITE, { life: 0.4 });
        sigil(kit, x, zz, 2.4, DR_VIO, { c2: DR_WHITE, n: 5, m: 2, ticks: 0, inner: 0.5, fill: 0.2, life: 0.6, rev: 0.05, spin: 3, w: 0.08 });
        for (let i = 0; i < 5; i++) { const a = Math.random() * 6.283; bolt(kit, x, 2.2, zz, x + Math.cos(a) * 2, 0.3, zz + Math.sin(a) * 2, DR_VIO, 4); }
      }
    },
  },
  // Ác Tác Kịch Hãm Tỉnh: a cyan diamond tile unfolds on the floor in the half second it takes to set, then crackles with blue
  // sparks while it holds
  ctTrap: {
    zoneMake(kit, z) {
      const R0 = z.r * 1.05;
      const tile = sigil(kit, z.x, z.z, R0, DR_CYAN, { c2: DR_WHITE, n: 4, m: 1, ticks: 0, inner: 0, fill: 0.0, w: 0.09, life: 1e9, rev: 0.45, spin: 0, rot: 0 });
      const glowT = sigil(kit, z.x, z.z, R0 * 0.72, DR_CYAN, { c2: DR_BLUE, n: 4, m: 1, ticks: 0, inner: 0, fill: 0.0, w: 0.22, life: 1e9, rev: 0.45, spin: 0, alpha: 0.6 });
      const pane = new THREE.Mesh(paneGeo, basic(0x40d8ff, true, 0.0)); pane.rotation.set(-Math.PI / 2, 0, Math.PI / 4); pane.position.set(z.x, 0.14, z.z); pane.scale.setScalar(R0 * 1.41);
      const wm = basic(0x40e0ff, true, 0), walls = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2, w = new THREE.Mesh(paneGeo, wm);
        w.scale.set(R0 * 1.41, 1.3, 1);
        w.position.set((Math.cos(a) + Math.cos(a + Math.PI / 2)) * R0 * 0.5, 0.65, (Math.sin(a) + Math.sin(a + Math.PI / 2)) * R0 * 0.5);
        w.rotation.y = -(a + Math.PI * 0.75); walls.add(w);
      }
      walls.position.set(z.x, 0, z.z);
      const h = held(kit, [pane, walls]);
      return { tile, glowT, pane, walls, wm, h, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt;
      const k = Math.min(1, v.t / 0.5);
      v.pane.material.opacity = 0.4 * k * (0.85 + 0.15 * Math.sin(v.t * 7)); v.wm.opacity = 0.35 * k; v.walls.scale.y = Math.max(0.01, k);
      if (k >= 1 && Math.random() < dt * 16) { const a = Math.random() * 6.283, d = R(0.2, z.r * 0.8); bolt(kit, z.x + Math.cos(a) * d, 0.3, z.z + Math.sin(a) * d, z.x + Math.cos(a + 1) * d * 0.5, R(0.8, 1.6), z.z + Math.sin(a + 1) * d * 0.5, Math.random() < 0.5 ? DR_CYAN : DR_VIO, 3); }
    },
    zoneDrop(kit, v) { stop(v.tile); stop(v.glowT); v.h.on = false; },
  },
  // Toàn Qua Chế Tạo Cơ: an aiming ring with four brackets where it falls, the little machine lobbed into it; then a white-blue
  // cloud whirls inward with three blue strokes turning round it and lightning snapping
  ctVortex: {
    zones: ['strike'], ownDisc: true, pal: [DR_BLUE, DR_WHITE], hitR: 2.2,
    skill() { return true; },
    zoneMake(kit, z) {
      const o = kit.match.units[z.owner], x0 = o ? o.x : z.x, z0 = o ? o.z : z.z;
      const ring = sigil(kit, z.x, z.z, z.r, DR_BLUE, { c2: DR_WHITE, n: 0, ticks: 4, inner: 0.78, fill: 0.12, w: 0.1, life: 1e9, rev: 0.1, spin: 2.4 });
      const cap = shell(kit, x0, 1.2, z0, 0.5, DR_WHITE, { c2: DR_BLUE, p: 1.2, core: 0.6, life: 1e9 });
      return { ring, cap, x0, z0, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt;
      const k = Math.min(1, v.t / Math.max(0.1, z.total || 0.6));
      v.cap.position.set(v.x0 + (z.x - v.x0) * k, 1.2 + 3.5 * Math.sin(k * Math.PI), v.z0 + (z.z - v.z0) * k);
    },
    zoneDrop(kit, v) { stop(v.ring); stop(v.cap); },
    land(kit, e) {
      const r = e.r || 4.5;
      for (let i = 0; i < 3; i++) slash(kit, e.x, e.z, i * 2.094, r * (0.95 - i * 0.12), DR_BLUE, { c2: DR_DEEP, edge: DR_WHITE, span: 1.7, life: 0.8, w: r * 0.2, sweep: 0.25, arcs: 2, dir: -1, sparks: false });
      shell(kit, e.x, 1.3, e.z, r * 0.9, DR_WHITE, { c2: DR_BLUE, inv: 1.4, core: 0.8, life: 0.8, step: (t, m) => { m.scale.setScalar(r * 0.9 * (1 - 0.55 * Math.min(1, t / 0.8))); } });
      sigil(kit, e.x, e.z, r * 1.1, DR_BLUE, { c2: DR_WHITE, n: 0, ticks: 12, inner: 0.6, fill: 0.35, life: 0.9, rev: 0.05, spin: -4, w: 0.1 });
      kit.puffs(e.x, 1.0, e.z, kit.N(16), C(0.85, 0.92, 1.0), r * 0.8, -4, 0.8, 1.4, 1.5, 0.5, 0.6, kit.K.SMOKE, 3);
      for (let i = 0; i < 7; i++) { const a = Math.random() * 6.283, d = R(1, r); bolt(kit, e.x + Math.cos(a) * d, R(0.4, 2.2), e.z + Math.sin(a) * d, e.x, 1.3, e.z, Math.random() < 0.5 ? DR_VIO : DR_WHITE, 5); }
      kit.flash(e.x, 1.8, e.z, DR_BLUE, 60, 0.3); kit.kick(e.x, e.z, 0.45);
      return true;
    },
  },
};

export const K14 = { ...gilgamesh, ...suatrang, ...chuottui };
