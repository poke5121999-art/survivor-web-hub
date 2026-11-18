// Looks, kit lane k16: Natsu, Lạc Long Quân and Lôi Công (kits ported from the owner's clips, see data.js). Render only (see looks.js
// for the hooks). One main colour and one accent per tank.
// Natsu (bilibili BV1Kp4y1b7i6 p78 "75.炎龙王", gameplay 25-45 s): flame orange, accent gold. Q leaps on a fire trail and spins
//   gold-orange crescents round the landing; E pours a long orange stream of dragon fire with a fireball head (in Lôi Viêm a wide
//   fan of fire); R lights a thick whirling ring of fire round him for the 8 s, the dragon coiling along its rim.
// Lạc Long Quân (p71 "68.敖广", gameplay 15-60 s): azure sea water, accent white foam. The passive and Q wrap him in a blue water
//   shell; Q lands the greatsword in a crown of sea water; E charges on a foaming wake behind a blue crescent; R sends the water
//   dragon (head and body from looks-b7.js) swimming round him in a water bubble for the 8 s; its recast slams a column of sea
//   water down on a churning vortex.
// Lôi Công (p28 "25.雷神", gameplay 12-37 s): gold lightning, accent electric blue. Q: a blue target ring, then a gold bolt from the
//   sky; E: a crackling ball of lightning; R: the golden hammer spinning in gold lightning, bursting into an orange disc with a blue rim.
import { C, own, stop, sigil, shell, slash, cut, pillar, trail } from './lookkit.js';
import { dragonHead, dragonBody, fadeAll } from './looks-b7.js';
import { zap, hammer, hammerBlast } from './looks-b5.js';

const R = (a, b) => a + Math.random() * (b - a);

// ---- Natsu --------------------------------------------------------------------------------------------------------
const NT_FIRE = C(2.7, 0.72, 0.08), NT_GOLD = C(2.7, 1.85, 0.42), NT_DARK = C(0.55, 0.15, 0.02), NT_DEEP = C(1.5, 0.3, 0.02), NT_AMBER = C(1.7, 0.95, 0.15);
const ntFlame = () => (Math.random() < 0.65 ? NT_FIRE : NT_GOLD);
const natsu = {
  // Viêm Long Ma Lực: the third stack spent: a gold flare round him and flames streaming off him for the 1.5 s burst
  ntMana: {
    k16(kit, e, u) {
      if (e.kind !== 'ntsBurst') return;
      shell(kit, u.x, 1.0, u.z, 2.0, NT_FIRE, { c2: NT_GOLD, p: 1.3, core: 0.3, life: 0.4, grow: 0.15 });
      kit.follow(u, 1.5, (t) => {
        const k = 1 - t / 1.5;
        if (Math.random() < 0.8) { const a = Math.random() * 6.283; kit.glow(u.x + Math.cos(a) * 0.9, 0.5, u.z + Math.sin(a) * 0.9, ntFlame(), 0.35, 0.5 + 0.5 * k, 0.9, kit.K.FLAME, 1.3, 0, 2.5, 0); }
      });
      kit.flash(u.x, 1.5, u.z, NT_GOLD, 35, 0.2);
    },
  },
  // Hồng Liên Bạo Nhận: a fire trail behind the leap, then three gold-orange crescents whirl round the landing over a fire disc
  ntBlade: {
    pal: [NT_FIRE, NT_GOLD], hitR: 1.8,
    skill(kit, e, u) { kit.glow(u.x, 1.0, u.z, NT_GOLD, 0.15, 2.0, 0.9, kit.K.FLAME, 1.2); return true; },
    leap(kit, e, u) {
      const d = e.dur || 0.3;
      trail(kit, (t) => (t < d + 0.05 && u.alive ? [u.x, 1.0, u.z] : null), 2.0, NT_FIRE, d + 0.45, { c2: NT_DARK, len: 12 });
      return true;
    },
    nova(kit, e) {
      const r = e.r || 3, x = e.x, z = e.z, a0 = Math.random() * 6.283;
      for (let k = 0; k < 3; k++) slash(kit, x, z, a0 + k * 2.094, r * 0.95, k === 1 ? NT_GOLD : NT_FIRE, { y: 0.9, life: 0.5, w: 1.2, span: 1.7, sweep: 0.14, erode: 0.25, arcs: 1, c2: NT_DARK, edge: NT_GOLD, wake: 2 });
      sigil(kit, x, z, r, NT_FIRE, { c2: NT_GOLD, n: 0, ticks: 8, inner: 0.72, fill: 0.55, w: 0.08, life: 0.55, rev: 0.08, spin: 7 });
      sigil(kit, x, z, r * 0.7, NT_DARK, { n: 0, ticks: 0, inner: 0, fill: 0.8, w: 0, life: 0.6, rev: 0.1, alpha: 0.55, y: 0.1 });
      for (let i = 0; i < kit.N(18); i++) { const a = Math.random() * 6.283, sp = R(7, 12); kit.str.emit(x + Math.cos(a) * r * 0.5, 1.0, z + Math.sin(a) * r * 0.5, -Math.sin(a) * sp, R(0, 1), Math.cos(a) * sp, ntFlame(), 0.3, 0.12, 0.08, 0, 1, 1); }
      kit.scorch(x, z, r * 0.6, 3, 1.4, NT_FIRE); kit.flash(x, 1.6, z, NT_GOLD, 50, 0.25); kit.kick(x, z, 0.5);
      return true;
    },
  },
  // Long Thần Hoàng Viêm: a long stream of dragon fire, orange with a gold core, flames rolling down it and a fireball at its head;
  // in Lôi Viêm the same fire fans out wide
  ntBreath: {
    pal: [NT_FIRE, NT_GOLD], hitR: 1.8,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.2, 1.2, u.z + Math.sin(e.a) * 1.2, NT_GOLD, 0.4, 1.6, 1, kit.K.FLAME, 1.2); return true; },
    beam(kit, e) {
      const dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, w = e.w || 2;
      const b = kit.beam(e.x0, e.z0, e.x1, e.z1, w * 1.5, NT_DEEP, 0.9, 0, 0.5); b.fade = true;
      const c = kit.beam(e.x0, e.z0, e.x1, e.z1, w * 0.5, NT_AMBER, 0.8, 0, 0.4); c.fade = true;
      trail(kit, (t) => (t < 0.3 ? [e.x0 + dx * Math.min(1, t / 0.12), 1.1, e.z0 + dz * Math.min(1, t / 0.12)] : null), w * 0.9, NT_FIRE, 0.55, { c2: NT_DARK, len: 10 });
      for (let i = 0, n = kit.N(34); i < n; i++) {
        const t = Math.random(), j = R(-0.5, 0.5) * w * (0.5 + t * 0.6);
        kit.glow(e.x0 + dx * t - uz * j, R(0.8, 1.3), e.z0 + dz * t + ux * j, Math.random() < 0.7 ? NT_DEEP : NT_AMBER, R(0.35, 0.55), R(1.1, 1.9) * (0.6 + t * 0.6), 0.85, kit.K.FLAME, 1.3, ux * R(5, 10), R(0.4, 1.4), uz * R(5, 10));
      }
      shell(kit, e.x1, 1.1, e.z1, 1.9, NT_FIRE, { c2: NT_GOLD, p: 1.3, core: 0.5, life: 0.45, grow: 0.15 });
      kit.scorch(e.x1, e.z1, 1.2, 3, 1.2, NT_FIRE); kit.flash(e.x0, 1.5, e.z0, NT_FIRE, 40, 0.2);
      return true;
    },
    nova(kit, e, u, s) {
      const r = e.r || 8, a = e.a || 0, half = (s && s.arc) || 0.45;
      slash(kit, e.x, e.z, a, r * 0.92, NT_FIRE, { y: 0.8, life: 0.45, w: r * 0.55, span: half * 1.05, sweep: 0.06, erode: 0.2, arcs: 2, c2: NT_DARK, edge: NT_GOLD, wake: 1.8, sparks: false });
      for (let i = 0, n = kit.N(22); i < n; i++) {
        const b = a + R(-half, half), sp = R(9, 15);
        kit.glow(e.x + Math.cos(b), 1.0, e.z + Math.sin(b), ntFlame(), R(0.35, 0.55), R(0.8, 1.4), 0.9, kit.K.FLAME, 1.3, Math.cos(b) * sp, R(0.3, 1), Math.sin(b) * sp);
      }
      kit.flash(e.x, 1.5, e.z, NT_GOLD, 45, 0.25);
      return true;
    },
  },
  // Lôi Viêm Cuồng Long: a flare as it lights, then a thick ring of fire turns round him for the 8 s, the fire dragon coiling round
  // its rim (two flame ribbons) with gold sparks crackling off it
  ntDragon: {
    pal: [NT_FIRE, NT_GOLD], hitR: 1.8,
    skill(kit, e, u) { shell(kit, u.x, 1.0, u.z, 3.0, NT_FIRE, { c2: NT_GOLD, p: 1.4, core: 0.25, life: 0.5, grow: 0.2 }); kit.flash(u.x, 2, u.z, NT_GOLD, 60, 0.3); return true; },
    transform(kit, e) { if (!e.on) kit.ring(e.x, e.z, 3.5, NT_FIRE, 0.3, 0.6); return true; },
    zoneMake(kit, z) {
      const u = kit.match.units[z.owner], r = z.r, v = { live: true, acc: 0 };
      v.band = sigil(kit, z.x, z.z, r, NT_DEEP, { c2: NT_FIRE, n: 0, ticks: 12, inner: 0.55, fill: 0.9, w: 0.12, life: 1e9, rev: 0.2, spin: 3, follow: u });
      v.rim = sigil(kit, z.x, z.z, r * 1.08, NT_GOLD, { n: 0, ticks: 0, inner: 0.9, fill: 0.6, w: 0.08, life: 1e9, rev: 0.2, spin: -2, follow: u });
      v.heat = sigil(kit, z.x, z.z, r * 1.45, NT_DEEP, { c2: NT_DARK, n: 0, ticks: 16, inner: 0.72, fill: 0.4, w: 0.05, life: 1e9, rev: 0.25, spin: 1.2, follow: u, alpha: 0.7, y: 0.09 });
      v.core = sigil(kit, z.x, z.z, r * 0.55, NT_DARK, { n: 0, ticks: 0, inner: 0, fill: 0.4, w: 0, life: 1e9, rev: 0.2, follow: u, alpha: 0.45, y: 0.1 });
      for (const ph of [0, Math.PI]) trail(kit, (t) => (v.live ? [z.x + Math.cos(t * 5 + ph) * r * 0.86, 0.9 + 0.35 * Math.sin(t * 9 + ph), z.z + Math.sin(t * 5 + ph) * r * 0.86] : null), 2.0, NT_FIRE, 1e9, { c2: NT_DEEP, len: 30 });
      return v;
    },
    zone(kit, v, z, dt) {
      v.acc += dt;
      for (let i = 0; i < kit.N(9); i++) { const a = Math.random() * 6.283, q = z.r * R(0.62, 1.3); kit.glow(z.x + Math.cos(a) * q, R(0.3, 1.0), z.z + Math.sin(a) * q, Math.random() < 0.6 ? NT_DEEP : NT_AMBER, R(0.3, 0.5), R(0.8, 1.4), 0.9, kit.K.FLAME, 1.3, -Math.sin(a) * 3, 1.5, Math.cos(a) * 3); }
      if (v.acc > 0.18) { v.acc = 0; const a = Math.random() * 6.283; kit.sparks(z.x + Math.cos(a) * z.r, 0.8, z.z + Math.sin(a) * z.r, kit.N(5), NT_GOLD, 7, 0.25, 0.05, 0.6, 6); }
    },
    zoneDrop(kit, v) { v.live = false; stop(v.band); stop(v.rim); stop(v.heat); stop(v.core); },
  },
};


// ---- Lạc Long Quân ------------------------------------------------------------------------------------------------
const LL_BLUE = C(0.3, 0.95, 2.6), LL_DEEP = C(0.03, 0.16, 0.55), LL_FOAM = C(2.0, 2.4, 2.6);
const llDrop = () => (Math.random() < 0.6 ? LL_BLUE : LL_FOAM);
// a crown of sea water bursting up round (x, z): a foam ring, a blue dome, droplets thrown out and up
function waterCrown(kit, x, z, r, big = 1) {
  shell(kit, x, 0.4, z, r * 0.8, LL_BLUE, { c2: LL_FOAM, p: 1.5, core: 0.15, bands: 1.4, life: 0.6, grow: 0.12, dome: true, alpha: 0.85 });
  sigil(kit, x, z, r, LL_BLUE, { c2: LL_FOAM, n: 0, ticks: 18, inner: 0.7, fill: 0.55, w: 0.07, life: 0.7, rev: 0.1, spin: 1.5 });
  sigil(kit, x, z, r * 0.62, LL_DEEP, { n: 0, ticks: 0, inner: 0, fill: 0.7, w: 0, life: 0.7, rev: 0.1, alpha: 0.6, y: 0.1 });
  for (let i = 0; i < kit.N(Math.round(22 * big)); i++) { const a = Math.random() * 6.283, sp = R(5, 10) * big; kit.str.emit(x + Math.cos(a) * r * 0.4, 0.6, z + Math.sin(a) * r * 0.4, Math.cos(a) * sp, R(3, 7), Math.sin(a) * sp, llDrop(), R(0.4, 0.6), 0.14, 0.09, -14, 1, 1); }
  kit.ring(x, z, r * 1.05, LL_FOAM, 0.4, 0.9); kit.flash(x, 2, z, LL_BLUE, 50, 0.25); kit.kick(x, z, 0.5 * big);
}
const laclong = {
  // Lôi Long Chi Tức: a water shell wraps him (the 2 s shield), he leaps on a spray of water and brings the greatsword down: a
  // blue blade cut and a crown of sea water where he lands
  aoqSlam: {
    pal: [LL_BLUE, LL_FOAM], hitR: 2,
    skill(kit, e, u) { shell(kit, u.x, 1.0, u.z, 1.8, LL_BLUE, { c2: LL_FOAM, p: 1.6, core: 0.1, bands: 0.8, life: 2, follow: u, alpha: 0.7 }); return true; },
    leap(kit, e, u) { const d = e.dur || 0.25; trail(kit, (t) => (t < d + 0.05 && u.alive ? [u.x, 1.4, u.z] : null), 2.4, LL_BLUE, d + 0.5, { c2: LL_DEEP, len: 12 }); sigil(kit, e.x, e.z, 3.5, LL_BLUE, { c2: LL_FOAM, n: 0, ticks: 12, inner: 0.82, fill: 0.3, w: 0.06, life: d + 0.5, rev: 0.1, spin: 2 }); return true; },
    nova(kit, e, u) {
      const r = e.r || 3.5, a = u ? u.aim : 0;
      cut(kit, e.x, e.z, a, r * 1.1, LL_BLUE, { edge: LL_FOAM, sparks: 6, life: 0.3 });
      slash(kit, e.x, e.z, a, r * 0.9, LL_BLUE, { y: 1.0, life: 0.4, w: 1.4, span: 1.2, sweep: 0.08, arcs: 1, c2: LL_DEEP, edge: LL_FOAM, wake: 1.6, tilt: 1.2 });
      waterCrown(kit, e.x, e.z, r);
      return true;
    },
  },
  // Cuồng Long Xung Phong / Du Long Xuất Kích: a foaming wake behind him and a blue crescent riding in front of the charge
  aoqCharge: {
    pal: [LL_BLUE, LL_FOAM], hitR: 1.8,
    skill(kit, e, u, row) {
      const a = e.a, big = row && row.stun ? 1.3 : 1.15, L = (row && row.dist) || 6;
      { const b = kit.beam(u.x, u.z, u.x + Math.cos(a) * L, u.z + Math.sin(a) * L, 3.4 * big, LL_BLUE, 0.85, 0, 0.6); b.fade = true; }
      { const b = kit.beam(u.x, u.z, u.x + Math.cos(a) * L, u.z + Math.sin(a) * L, 0.9 * big, LL_FOAM, 0.8, 0, 0.4); b.fade = true; }
      trail(kit, (t) => (t < 0.3 && u.alive ? [u.x, 0.5, u.z] : null), 2.4 * big, LL_BLUE, 0.7, { c2: LL_DEEP, len: 14 });
      trail(kit, (t) => (t < 0.3 && u.alive ? [u.x, 0.6, u.z] : null), 0.9 * big, LL_FOAM, 0.55, { len: 10 });
      slash(kit, u.x, u.z, a, 3.8 * big, LL_BLUE, { y: 1.0, life: 0.6, w: 2.6, span: 1.1, sweep: 0.06, arcs: 1, c2: LL_DEEP, edge: LL_FOAM, wake: 1.8, travel: 18 });
      kit.follow(u, 0.3, () => { if (Math.random() < 0.8) kit.glow(u.x + R(-0.8, 0.8), R(0.3, 1.2), u.z + R(-0.8, 0.8), llDrop(), 0.4, R(0.3, 0.6), 1, kit.K.SPARK, 0.6, -Math.cos(a) * 5, R(1, 3), -Math.sin(a) * 5); });
      kit.flash(u.x, 1.4, u.z, LL_BLUE, 35, 0.2);
      return true;
    },
  },
  // Giao Long Xuất Hải: the water dragon rises round him and swims circles about him in a water bubble for the 8 s
  aoqDragon: {
    pal: [LL_BLUE, LL_FOAM], hitR: 1.8,
    skill(kit, e, u, row) {
      const d = (row && row.dur) || 8, live = (t) => u.alive && (t < 0.5 || u.tfT > 0), R0 = 2.7;
      const at = (t, lag) => { const a = t * 2.6 - lag; return [u.x + Math.cos(a) * R0, 1.5 + 0.3 * Math.sin(t * 3 - lag), u.z + Math.sin(a) * R0]; };
      dragonBody(kit, (t) => (live(t) ? [at(t, 1.7), at(t, 0)] : null), 1.5, d + 0.6, 0.35);
      const h = dragonHead(); h.scale.setScalar(2.1);
      own(kit, [h], d + 0.6, (t) => { if (!live(t)) { fadeAll(h, 0); return false; } const p = at(t, 0), q = at(t + 0.05, 0); h.position.set(p[0], p[1] + 0.15, p[2]); h.rotation.y = -Math.atan2(q[2] - p[2], q[0] - p[0]); return true; });
      shell(kit, u.x, 1.1, u.z, 2.3, LL_BLUE, { c2: LL_FOAM, p: 1.7, core: 0.08, bands: 0.8, life: d, follow: u, alpha: 0.65 });
      sigil(kit, u.x, u.z, R0 + 1.6, LL_BLUE, { c2: LL_FOAM, n: 0, ticks: 14, inner: 0.62, fill: 0.55, w: 0.06, life: d, rev: 0.2, spin: 1.6, follow: u, alpha: 0.8 });
      waterCrown(kit, u.x, u.z, 3.2, 1.2);
      sigil(kit, u.x, u.z, R0 + 2.4, LL_DEEP, { c2: LL_BLUE, n: 0, ticks: 20, inner: 0.7, fill: 0.35, w: 0.04, life: d, rev: 0.3, spin: -0.8, follow: u, alpha: 0.6, y: 0.09 });
      return true;
    },
    transform(kit, e) { if (!e.on) kit.ring(e.x, e.z, 2.6, LL_BLUE, 0.3, 0.6); return true; },
  },
  // Bào Hao Nộ Đào: a churning vortex of sea water marks the spot, then a column of sea water slams down into a crown of spray
  aoqWave: {
    zones: ['strike'], ownDisc: true, pal: [LL_BLUE, LL_FOAM], hitR: 2,
    skill() { return true; },
    zoneMake(kit, z) {
      const v = {};
      v.s = sigil(kit, z.x, z.z, z.r, LL_BLUE, { c2: LL_FOAM, n: 0, ticks: 10, inner: 0.25, fill: 0.35, w: 0.07, life: 1e9, rev: 0.25, spin: 5 });
      v.d = sigil(kit, z.x, z.z, z.r * 0.9, LL_DEEP, { n: 0, ticks: 0, inner: 0, fill: 0.6, w: 0, life: 1e9, rev: 0.3, alpha: 0.55, y: 0.1 });
      return v;
    },
    zone(kit, v, z) { if (Math.random() < 0.6) { const a = Math.random() * 6.283, q = z.r * R(0.3, 1); kit.glow(z.x + Math.cos(a) * q, 0.4, z.z + Math.sin(a) * q, llDrop(), 0.4, R(0.3, 0.5), 1, kit.K.SPARK, 0.6, -Math.sin(a) * 4, R(1, 3), Math.cos(a) * 4); } },
    zoneDrop(kit, v) { stop(v.s); stop(v.d); },
    land(kit, e) {
      const r = e.r || 3.5;
      pillar(kit, e.x, e.z, r * 0.55, LL_BLUE, { c2: LL_FOAM, h: 7, life: 0.5, drop: true, grow: 0.12, narrow: true, rings: 3 });
      waterCrown(kit, e.x, e.z, r, 1.3);
      return true;
    },
  },
};


// ---- Lôi Công ------------------------------------------------------------------------------------------------------
// Thor: gold lightning and the golden hammer (from looks-b5.js), accent the electric blue of the clip's target rings.
const LC_GOLD = C(2.6, 1.9, 0.45), LC_BLUE = C(0.35, 1.1, 2.5), LC_WHITE = C(2.3, 2.4, 2.6), LC_DEEP = C(0.05, 0.14, 0.45);
const loi = {
  // Điện Hà Ấn Ký: the third mark: a gold bolt crashes onto the victim in a blue ring
  torMark: {
    stacks(kit, e) {
      zap(kit, [e.x + 0.3, 14, e.z], [e.x, 0.8, e.z], 0.8, LC_GOLD, 0.25, { segs: 10, jit: 0.6 });
      sigil(kit, e.x, e.z, 2.2, LC_BLUE, { c2: LC_WHITE, n: 0, ticks: 8, inner: 0.7, fill: 0.4, w: 0.08, life: 0.5, rev: 0.06, spin: 4 });
      kit.flash(e.x, 1.5, e.z, LC_GOLD, 40, 0.2);
      return true;
    },
  },
  // Lôi Bạo Đả Kích: a blue target ring with crackling arcs marks the spot, then a gold bolt falls into a blue-white blast
  torStrike: {
    zones: ['strike'], ownDisc: true, pal: [LC_BLUE, LC_GOLD], hitR: 1.8,
    skill() { return true; },
    zoneMake(kit, z) {
      const v = { acc: 0 };
      v.s = sigil(kit, z.x, z.z, z.r, LC_BLUE, { c2: LC_WHITE, n: 0, ticks: 12, inner: 0.82, fill: 0.25, w: 0.08, life: 1e9, rev: 0.12, spin: 3 });
      v.d = sigil(kit, z.x, z.z, z.r * 0.95, LC_DEEP, { n: 0, ticks: 0, inner: 0, fill: 0.5, w: 0, life: 1e9, rev: 0.15, alpha: 0.5, y: 0.1 });
      return v;
    },
    zone(kit, v, z, dt) {
      v.acc += dt;
      if (v.acc > 0.1) { v.acc = 0; const a = Math.random() * 6.283, b = a + R(1, 2); zap(kit, [z.x + Math.cos(a) * z.r, 0.3, z.z + Math.sin(a) * z.r], [z.x + Math.cos(b) * z.r * 0.4, 0.5, z.z + Math.sin(b) * z.r * 0.4], 0.25, LC_BLUE, 0.1, { segs: 6, jit: 0.4 }); }
    },
    zoneDrop(kit, v) { stop(v.s); stop(v.d); },
    land(kit, e) {
      const r = e.r || 2.5;
      zap(kit, [e.x + 0.5, 18, e.z], [e.x, 0.5, e.z], 1.3, LC_GOLD, 0.3, { segs: 12, jit: 0.8 });
      zap(kit, [e.x - 0.6, 16, e.z + 0.4], [e.x, 0.5, e.z], 0.6, LC_WHITE, 0.2, { segs: 10, jit: 0.9 });
      shell(kit, e.x, 0.5, e.z, r * 0.9, LC_BLUE, { c2: LC_WHITE, p: 1.4, core: 0.3, life: 0.45, grow: 0.1, dome: true });
      sigil(kit, e.x, e.z, r * 1.2, LC_GOLD, { c2: LC_BLUE, n: 0, ticks: 10, inner: 0.6, fill: 0.5, w: 0.07, life: 0.5, rev: 0.06, spin: 3 });
      for (let i = 0; i < 6; i++) { const b = i * 1.05 + R(-0.2, 0.2), L = r * R(0.9, 1.3); zap(kit, [e.x, 0.3, e.z], [e.x + Math.cos(b) * L, 0.3, e.z + Math.sin(b) * L], 0.3, LC_GOLD, 0.35, { segs: 6, jit: 0.4 }); }
      kit.flash(e.x, 2, e.z, LC_WHITE, 60, 0.25); kit.kick(e.x, e.z, 0.5);
      return true;
    },
  },
  // Thiểm Điện Đạn Xạ: a crackling blue-white ball of lightning, arcs licking off it
  torBall: {
    pal: [LC_BLUE, LC_WHITE], hitR: 1.6,
    skill(kit, e, u) {
      const mx = u.x + Math.cos(e.a) * 1.2, mz = u.z + Math.sin(e.a) * 1.2;
      kit.glow(mx, 1.2, mz, LC_WHITE, 0.12, 1.8, 1, kit.K.STAR, 1.2);
      sigil(kit, u.x, u.z, 3.0, LC_BLUE, { c2: LC_WHITE, n: 0, ticks: 10, inner: 0.6, fill: 0.55, w: 0.08, life: 0.5, rev: 0.06, spin: 5 });
      shell(kit, mx, 1.2, mz, 1.5, LC_BLUE, { c2: LC_WHITE, p: 1.3, core: 0.4, life: 0.35, grow: 0.08 });
      for (let i = 0; i < 4; i++) { const b = e.a + R(-0.7, 0.7), L = R(2.5, 4); zap(kit, [mx, 1.2, mz], [mx + Math.cos(b) * L, R(0.4, 1.6), mz + Math.sin(b) * L], 0.3, i % 2 ? LC_WHITE : LC_BLUE, 0.3, { segs: 6, jit: 0.4 }); }
      return true;
    },
    shotMake(kit, s) {
      const v = { x: s.x, z: s.z, live: true, acc: 0 };
      v.ball = shell(kit, s.x, 1.2, s.z, 1.0, LC_BLUE, { c2: LC_WHITE, p: 1.3, core: 0.6, life: 1e9, pulse: 3 });
      trail(kit, () => (v.live ? [v.x, 1.2, v.z] : null), 1.4, LC_BLUE, 0.5, { c2: LC_DEEP, len: 12 });
      return v;
    },
    shot(kit, v, s, x, y, z, dt) {
      v.x = x; v.z = z; v.ball.position.set(x, 1.2, z); v.acc += dt || 0.016;
      if (v.acc > 0.05) { v.acc = 0; const a = Math.random() * 6.283; zap(kit, [x, 1.2, z], [x + Math.cos(a) * 1.4, R(0.4, 2), z + Math.sin(a) * 1.4], 0.18, LC_WHITE, 0.08, { segs: 4, jit: 0.3 }); }
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.live = false; stop(v.ball); shell(kit, x, 1.1, z, 1.6, LC_BLUE, { c2: LC_WHITE, p: 1.3, core: 0.4, life: 0.3, grow: 0.08 }); kit.flash(x, 1.4, z, LC_BLUE, 35, 0.2); },
  },
  // Lôi Thần Chi Chùy: the golden hammer spins through the air wrapped in gold lightning; where it bursts an orange-gold disc with
  // cracks and a blue rim crackles for the 4 s of the field
  torHammer: {
    pal: [LC_GOLD, LC_WHITE], hitR: 2,
    skill(kit, e, u) {
      // he calls the hammer down: gold bolts from the sky onto him, a gold ring with a blue rim at his feet
      for (let i = 0; i < 3; i++) zap(kit, [u.x + R(-1, 1), 16, u.z + R(-1, 1)], [u.x, 1.4, u.z], i ? 0.5 : 1.1, i ? LC_WHITE : LC_GOLD, 0.45, { segs: 12, jit: 0.8 });
      sigil(kit, u.x, u.z, 4, C(2.0, 0.6, 0.1), { c2: LC_GOLD, n: 0, ticks: 0, inner: 0.35, fill: 0.5, w: 0, life: 0.7, rev: 0.08, alpha: 0.75, y: 0.11 });
      sigil(kit, u.x, u.z, 4.2, LC_BLUE, { c2: LC_WHITE, n: 0, ticks: 16, inner: 0.86, fill: 0.5, w: 0.07, life: 0.7, rev: 0.08, spin: 2 });
      for (let i = 0; i < 7; i++) { const b = i * 0.9 + R(-0.2, 0.2), L = R(2.8, 4); zap(kit, [u.x, 0.3, u.z], [u.x + Math.cos(b) * L, 0.3, u.z + Math.sin(b) * L], 0.3, LC_GOLD, 0.5, { segs: 6, jit: 0.4 }); }
      kit.flash(u.x, 2, u.z, LC_GOLD, 60, 0.3);
      return true;
    },
    shotMake(kit, s) {
      const h = hammer(); h.scale.setScalar(2.2);
      const v = { h, x: s.x, z: s.z, live: true, t: 0 };
      own(kit, [h], 1e9, () => v.live);
      trail(kit, () => (v.live ? [v.x, 1.5, v.z] : null), 2.4, LC_GOLD, 0.6, { c2: C(0.5, 0.25, 0.03), len: 12 });
      return v;
    },
    shot(kit, v, s, x, y, z, dt) {
      v.x = x; v.z = z; v.t += dt || 0.016; v.h.position.set(x, 1.5, z); v.h.rotation.set(0, -Math.atan2(s.dz, s.dx), v.t * 14);
      if (Math.random() < 0.5) { const a = Math.random() * 6.283; zap(kit, [x, 1.5, z], [x + Math.cos(a) * 1.8, R(0.5, 2.5), z + Math.sin(a) * 1.8], 0.25, LC_GOLD, 0.08, { segs: 5, jit: 0.4 }); }
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.live = false; hammerBlast(kit, x, z, 3); },
    zoneMake(kit, z) {
      const v = { acc: 0 };
      v.disc = sigil(kit, z.x, z.z, z.r, C(2.0, 0.6, 0.1), { c2: LC_GOLD, n: 0, ticks: 0, inner: 0, fill: 0.55, w: 0, life: 1e9, rev: 0.15, alpha: 0.75, y: 0.11 });
      v.rim = sigil(kit, z.x, z.z, z.r, LC_BLUE, { c2: LC_WHITE, n: 0, ticks: 16, inner: 0.86, fill: 0.5, w: 0.07, life: 1e9, rev: 0.15, spin: 1.5 });
      return v;
    },
    zone(kit, v, z, dt) {
      v.acc += dt;
      if (v.acc > 0.12) { v.acc = 0; const a = Math.random() * 6.283, b = a + R(2, 3.5); zap(kit, [z.x + Math.cos(a) * z.r * 0.9, 0.3, z.z + Math.sin(a) * z.r * 0.9], [z.x + Math.cos(b) * z.r * 0.9, 0.3, z.z + Math.sin(b) * z.r * 0.9], 0.3, Math.random() < 0.5 ? LC_GOLD : LC_BLUE, 0.14, { segs: 8, jit: 0.5 }); }
    },
    zoneDrop(kit, v) { stop(v.disc); stop(v.rim); },
  },
};

export const K16 = { ...natsu, ...laclong, ...loi };
