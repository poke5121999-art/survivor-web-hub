// Looks, kit lane k16: Natsu, Lạc Long Quân and Lôi Công (kits ported from the owner's clips, see data.js). Render only (see looks.js
// for the hooks). One main colour and one accent per tank.
// Natsu (bilibili BV1Kp4y1b7i6 p78 "75.炎龙王", gameplay 25-45 s): flame orange, accent gold. Q leaps on a fire trail and spins
//   gold-orange crescents round the landing; E pours a long orange stream of dragon fire with a fireball head (in Lôi Viêm a wide
//   fan of fire); R lights a thick whirling ring of fire round him for the 8 s, the dragon coiling along its rim.
import { C, stop, sigil, shell, slash, trail } from './lookkit.js';

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

export const K16 = { ...natsu };
