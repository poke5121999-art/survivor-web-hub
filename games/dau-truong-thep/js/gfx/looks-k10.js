// Looks, kit lane K10: Bọ Cạp and Apocalypse (kits ported from the owner's clips, see data.js). Render only (see looks.js
// for the hooks). One main colour and one accent per tank.
// Bọ Cạp (bilibili BV1Kp4y1b7i6 p52 "49.毒蝎女王", gameplay 30-46 s): violet-magenta. Q sprays a violet poison stream into the cone
//   in front, a violet vortex turning round her; E wraps her in a dripping magenta aura; R bursts a violet poison dome out of her
//   and pink poison bubbles pop over every foe it reaches.
// Apocalypse (p55 "52.天启骑士", gameplay 42-58 s): pale cyan shells, a blue missile with a long trail; accent warm white-orange
//   blasts. Q fans five cyan shells behind a white shock arc; E slams a shock wave down a strip in front; R flies a blue missile
//   that bursts white-orange.
import { C, stop, sigil, shell, pillar, burst, slash, cut, trail } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);

// ---- Bọ Cạp -------------------------------------------------------------------------------------------------------
const BC_VIO = C(1.25, 0.25, 2.3), BC_MAG = C(2.4, 0.4, 1.9), BC_PALE = C(2.4, 1.6, 2.5), BC_DARK = C(0.35, 0.06, 0.5);
// poison bubbles welling up and popping over a point
function bubbles(kit, x, z, n, r, life = 0.9) {
  for (let i = 0; i < kit.N(n); i++) {
    const a = Math.random() * 6.283, q = R(0.1, r), y = R(0.5, 1.6);
    kit.glow(x + Math.cos(a) * q, y, z + Math.sin(a) * q, i % 3 ? BC_MAG : BC_PALE, R(0.5, life), R(0.22, 0.42), 0.95, kit.K.GLOW, 1.1, 0, R(0.8, 2.2), 0);
  }
}
const bocap = {
  // Tử Vong Thôn Phệ: each puff is a violet poison stream pouring into the cone in front (a filled fan front plus droplets
  // streaming out), a violet vortex turning round her
  bcSpray: {
    pal: [BC_VIO, BC_MAG], hitR: 1.6,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.1, 1.0, u.z + Math.sin(e.a) * 1.1, BC_PALE, 0.12, 1.3, 1, kit.K.STAR, 1.2); return true; },
    nova(kit, e, u, s) {
      const k = e.k || 0, r = e.r || 5.5, a = e.a || 0, half = (s && s.arc) || 0.55, x = u.alive ? u.x : e.x, z = u.alive ? u.z : e.z;
      slash(kit, x, z, a, r * 0.92, BC_VIO, { y: 0.8, dir: k % 2 ? -1 : 1, life: 0.36, w: r * 0.55, span: half * 1.05, sweep: 0.07, erode: 0.18, arcs: 2, c2: BC_DARK, edge: BC_MAG, wake: 1.7, sparks: false });
      slash(kit, x, z, a, r * 0.55, BC_MAG, { y: 0.9, dir: k % 2 ? 1 : -1, life: 0.3, w: r * 0.3, span: half * 0.9, sweep: 0.05, erode: 0.15, arcs: 0, c2: BC_VIO, edge: BC_PALE, wake: 1.5, sparks: false });
      for (let i = 0; i < kit.N(5); i++) { const b = a + R(-half, half) * 0.8, q = R(1.5, r * 0.9); kit.glow(x + Math.cos(b) * q, 0.9, z + Math.sin(b) * q, BC_VIO, 0.35, R(1.2, 1.9), 0.55, kit.K.GLOW, 1.1, Math.cos(b) * 4, 0, Math.sin(b) * 4); }
      for (let i = 0; i < kit.N(16); i++) {
        const b = a + R(-half, half) * 0.95, sp = R(10, 17);
        kit.str.emit(x + Math.cos(b) * 0.9, R(0.7, 1.1), z + Math.sin(b) * 0.9, Math.cos(b) * sp, R(-0.5, 0.6), Math.sin(b) * sp, i % 3 ? BC_MAG : BC_VIO, R(0.25, 0.35), 0.12, 0.08, 0, 1, 1);
      }
      sigil(kit, x, z, 2.0, BC_VIO, { c2: BC_MAG, n: 0, ticks: 6, inner: 0.55, fill: 0.35, w: 0.08, life: 0.36, rev: 0.06, spin: 6 * (k % 2 ? -1 : 1), follow: u });
      bubbles(kit, x + Math.cos(a) * r * 0.75, z + Math.sin(a) * r * 0.75, 4, 1.4, 0.6);
      return true;
    },
  },
  // Trí Mạng Ô Nhiễm: a magenta flare round her at the press, then for the 3 s a violet aura ring under her and magenta drops
  // dripping off her; the stings themselves fly as they do
  bcVenom: {
    skill(kit, e, u, row) {
      const d = (row && row.dur) || 3;
      shell(kit, u.x, 1.0, u.z, 2.6, BC_MAG, { c2: BC_PALE, p: 1.3, core: 0.35, life: 0.45, grow: 0.12 });
      shell(kit, u.x, 1.0, u.z, 2.2, BC_VIO, { c2: BC_MAG, p: 1.4, core: 0.16, bands: 0.6, life: d, grow: 0.15, follow: u, alpha: 0.9 });
      sigil(kit, u.x, u.z, 3.0, BC_VIO, { c2: BC_MAG, n: 0, ticks: 10, inner: 0.62, fill: 0.6, w: 0.08, life: d, rev: 0.15, spin: 2.2, follow: u });
      sigil(kit, u.x, u.z, 3.4, BC_DARK, { n: 0, ticks: 0, inner: 0, fill: 0.9, w: 0, life: d, rev: 0.1, follow: u, alpha: 0.55, y: 0.1 });
      kit.flash(u.x, 1.6, u.z, BC_MAG, 30, 0.2);
      kit.follow(u, d, (t, dt) => {
        if (Math.random() < dt * 18) { const a = Math.random() * 6.283, q = R(0.4, 1.0); kit.glow(u.x + Math.cos(a) * q, R(0.9, 1.5), u.z + Math.sin(a) * q, i2(), R(0.4, 0.7), R(0.16, 0.26), 1, kit.K.GLOW, 1, 0, -R(1.5, 3), 0); }
        kit.glow(u.x, 0.9, u.z, BC_VIO, 0.08, 1.6, 0.25, kit.K.GLOW, 1);
      });
      return true;
    },
    transform() { return true; },
  },
  // Độc Tố Bạo Phát: a violet poison dome swells out of her to the 7 m rim with a magenta rim ring, and pink poison bubbles pop
  // over every foe it reaches
  bcBurst: {
    pal: [BC_VIO, BC_MAG], hitR: 2,
    skill() { return true; },
    nova(kit, e, u) {
      const r = e.r || 7;
      shell(kit, e.x, 0.6, e.z, r, BC_VIO, { c2: BC_MAG, p: 1.6, core: 0.12, bands: 0.6, life: 0.55, grow: 0.16, alpha: 0.75 });
      sigil(kit, e.x, e.z, r, BC_VIO, { c2: BC_MAG, n: 0, ticks: 24, inner: 0.62, fill: 0.4, w: 0.06, life: 0.8, rev: 0.1, spin: 1.2 });
      sigil(kit, e.x, e.z, r * 0.45, BC_MAG, { c2: BC_PALE, n: 0, ticks: 12, inner: 0.5, fill: 0.3, w: 0.07, life: 0.6, rev: 0.06, spin: -2.4 });
      kit.ring(e.x, e.z, r, BC_MAG, 0.5, 0.9);
      burst(kit, e.x, e.z, 2.2, BC_MAG, BC_PALE, { life: 0.4 });
      for (const o of kit.match.units) {
        if (o.team === u.team || !o.alive || Math.hypot(o.x - e.x, o.z - e.z) > r + 0.6) continue;
        shell(kit, o.x, 1.3, o.z, 1.3, BC_MAG, { c2: BC_PALE, p: 1.4, core: 0.2, life: 0.55, grow: 0.08 });
        bubbles(kit, o.x, o.z, 10, 1.1, 1.1);
      }
      for (let i = 0; i < kit.N(26); i++) { const a = Math.random() * 6.283, sp = R(8, 14); kit.str.emit(e.x + Math.cos(a), 0.9, e.z + Math.sin(a), Math.cos(a) * sp, R(0, 1), Math.sin(a) * sp, i % 2 ? BC_MAG : BC_VIO, 0.4, 0.14, 0.08, 0, 1, 1); }
      kit.flash(e.x, 2, e.z, BC_MAG, 55, 0.3); kit.kick(e.x, e.z, 0.4);
      return true;
    },
  },
};
const i2 = () => (Math.random() < 0.6 ? BC_MAG : BC_VIO);

// ---- Apocalypse ---------------------------------------------------------------------------------------------------
const AP_CY = C(0.55, 1.6, 2.6), AP_BLUE = C(0.25, 0.7, 2.6), AP_WHITE = C(2.5, 2.4, 2.2), AP_FIRE = C(2.6, 1.3, 0.35), AP_DEEP = C(0.08, 0.2, 0.6);
const apocalypse = {
  // Đạn Vô Hư Phát: a white shock arc rolls out over the 4 m cone (the knock), five pale cyan shells with short trails fan out
  bhSpread: {
    pal: [AP_CY, AP_WHITE], hitR: 1.5,
    skill(kit, e, u) {
      if (e.then) return true;   // the knock cone that follows the volley draws in nova
      const mx = u.x + Math.cos(e.a) * 1.3, mz = u.z + Math.sin(e.a) * 1.3;
      kit.glow(mx, 1.2, mz, AP_WHITE, 0.12, 2.4, 1, kit.K.STAR, 1.3);
      kit.glow(mx, 1.2, mz, AP_CY, 0.25, 3.2, 0.8, kit.K.GLOW, 1.2);
      for (let i = -2; i <= 2; i++) { const b = e.a + i * 0.12; kit.str.emit(mx, 1.2, mz, Math.cos(b) * 26, 0, Math.sin(b) * 26, AP_CY, 0.2, 0.18, 0.1, 0, 1, 1); }
      kit.puffs(mx, 1, mz, kit.N(4), C(0.55, 0.58, 0.62), 0.5, 3, 0.8, 1.1, 2.4, 0.6, 0.55, kit.K.SMOKE);
      kit.flash(u.x, 1.5, u.z, AP_CY, 30, 0.18);
      return true;
    },
    nova(kit, e, u) {
      slash(kit, e.x, e.z, e.a || 0, (e.r || 4) * 1.05, AP_WHITE, { y: 0.9, life: 0.42, w: 2.4, span: 0.72, sweep: 0.06, arcs: 2, c2: AP_CY, edge: AP_CY, wake: 2, travel: 6 });
      slash(kit, e.x, e.z, e.a || 0, (e.r || 4) * 0.95, AP_BLUE, { y: 0.3, life: 0.5, w: 3.4, span: 0.66, sweep: 0.05, arcs: 0, c2: AP_DEEP, edge: AP_WHITE, wake: 1.2, sparks: false });
      for (let i = 0; i < kit.N(10); i++) { const b = (e.a || 0) + R(-0.6, 0.6); kit.puffs(e.x + Math.cos(b) * 2, 0.4, e.z + Math.sin(b) * 2, 1, C(0.5, 0.5, 0.55), 0.3, 3, 0.5, 0.7, 2, 0.4, 0.4, kit.K.DUST); }
      return true;
    },
    shotMake(kit, s) { const v = { x: s.x, z: s.z, live: true }; trail(kit, () => (v.live ? [v.x, 1.1, v.z] : null), 0.8, AP_CY, 0.3, { c2: AP_DEEP, len: 10 }); return v; },
    shot(kit, v, s, x, y, z) { v.x = x; v.z = z; kit.glow(x, 1.1, z, AP_WHITE, 0.06, 0.8, 1, kit.K.STAR, 1); kit.glow(x, 1.1, z, AP_CY, 0.1, 1.6, 0.8, kit.K.GLOW, 1.2); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; kit.sparks(x, 1.1, z, kit.N(6), AP_CY, 8, 0.3, 0.05, 0.5, 8); kit.glow(x, 1.1, z, AP_WHITE, 0.15, 1.3, 0.9, kit.K.STAR, 1.3); },
  },
  // Chấn Đãng Oanh Kích: the turret slams a shock wave down the 6 x 3 m strip: white-cyan shock fronts racing out, the floor
  // cracking open in dust and chips; a cyan speed wake trails him for the 2 s of haste
  bhQuake: {
    pal: [AP_CY, AP_WHITE], hitR: 1.8,
    skill() { return true; },
    beam(kit, e, u) {
      const dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz) || 1, a = Math.atan2(dz, dx), ux = dx / L, uz = dz / L, w = e.w || 3;
      const band = kit.beam(e.x0, e.z0, e.x1, e.z1, w, AP_BLUE, 0.5, 0, 0.25); band.fade = true;
      const sl = kit.beam(e.x0, e.z0, e.x1, e.z1, w * 0.45, AP_DEEP, 0.6, 0, 0.2); sl.fade = true;
      for (let k = 0; k < 3; k++) {
        const f = 0.25 + k * 0.3;
        slash(kit, e.x0 + ux * L * (f - 0.25), e.z0 + uz * L * (f - 0.25), a, w * 0.8, k ? AP_BLUE : AP_CY, { y: 0.5, life: 0.4 + k * 0.06, w: 1.5, span: 1.0, sweep: 0.05 + k * 0.05, arcs: 1, c2: AP_DEEP, edge: AP_WHITE, travel: 9, sparks: false });
      }
      for (let t = 0.2; t <= 1.001; t += 0.2) {
        const x = e.x0 + dx * t, z = e.z0 + dz * t;
        kit.scorch(x, z, w * 0.32, 3, 1.2);
        kit.chips(x, 0.3, z, kit.N(3), C(0.45, 0.42, 0.4), 6, 0.7, 0.14);
        kit.puffs(x, 0.4, z, 2, C(0.32, 0.3, 0.3), w * 0.45, 3, 0.9, 1.6, 2.4, 0.6, 0.6, kit.K.DUST);
      }
      for (const f of [0.3, 0.62, 0.92]) burst(kit, e.x0 + dx * f, e.z0 + dz * f, w * 0.7, AP_BLUE, AP_WHITE, { life: 0.4 + f * 0.1 });
      sigil(kit, e.x0, e.z0, 2.8, AP_BLUE, { c2: AP_WHITE, n: 0, ticks: 10, inner: 0.6, fill: 0.6, w: 0.08, life: 0.5, rev: 0.04 });
      kit.flash(e.x0 + ux * 3, 1.2, e.z0 + uz * 3, AP_CY, 40, 0.2); kit.kick(e.x0, e.z0, 0.5);
      kit.follow(u, 2, (t, dt) => { if (Math.random() < dt * 20) kit.str.emit(u.x - Math.cos(u.heading) * 0.8, 0.6, u.z - Math.sin(u.heading) * 0.8, -Math.cos(u.heading) * 4, 0, -Math.sin(u.heading) * 4, AP_CY, 0.25, 0.08, 0.05, 0, 1, 1); });
      return true;
    },
  },
  // Phi Đạn Bạo Phá: a blue missile with a white core and a long blue trail and smoke, over walls; it bursts white-orange in a
  // blue shock ring
  bhMissile: {
    pal: [AP_BLUE, AP_WHITE], hitR: 2.4,
    skill(kit, e, u) {
      kit.flash(u.x, 1.6, u.z, AP_BLUE, 40, 0.22);
      burst(kit, u.x - Math.cos(e.a) * 0.6, u.z - Math.sin(e.a) * 0.6, 2.6, AP_BLUE, AP_WHITE, { life: 0.45 });
      sigil(kit, u.x, u.z, 4.4, AP_BLUE, { c2: AP_WHITE, n: 0, ticks: 12, inner: 0.65, fill: 0.7, w: 0.08, life: 0.6, rev: 0.05, spin: 1.5 });
      sigil(kit, u.x, u.z, 4.8, AP_DEEP, { n: 0, ticks: 0, inner: 0, fill: 1, w: 0, life: 0.6, rev: 0.05, alpha: 0.5, y: 0.1 });
      kit.ring(u.x, u.z, 3.6, AP_BLUE, 0.45, 0.8);
      kit.puffs(u.x - Math.cos(e.a), 1, u.z - Math.sin(e.a), kit.N(8), C(0.5, 0.52, 0.6), 1.1, 3, 1.2, 1.6, 2.4, 0.8, 0.6, kit.K.SMOKE);
      return true;
    },
    shotMake(kit, s) {
      const v = { x: s.x, z: s.z, live: true };
      trail(kit, () => (v.live ? [v.x, 1.6, v.z] : null), 1.15, AP_BLUE, 0.9, { c2: AP_DEEP, len: 30 });
      trail(kit, () => (v.live ? [v.x, 1.4, v.z] : null), 0.5, AP_WHITE, 0.35, { c2: AP_CY, len: 14 });
      v.head = shell(kit, s.x, 1.6, s.z, 0.95, AP_BLUE, { c2: AP_WHITE, inv: 1.2, core: 1, life: 1e9 });
      return v;
    },
    shot(kit, v, s, x, y, z) {
      v.x = x; v.z = z; v.head.position.set(x, 1.6, z);
      kit.glow(x, 1.6, z, AP_WHITE, 0.08, 1.4, 1, kit.K.STAR, 1.3); kit.glow(x, 1.6, z, AP_BLUE, 0.12, 2.4, 0.6, kit.K.GLOW, 1.2);
      if (Math.random() < 0.6) kit.ovr.emit(x, 1.6, z, R(-0.4, 0.4), 0.5, R(-0.4, 0.4), C(0.45, 0.48, 0.55), 0.8, 0.5, 2.4, 1, -0.4, 0.35, kit.K.SMOKE);
      return true;
    },
    shotEnd(kit, v, s, x, z) {
      v.live = false; stop(v.head);
      const r = s.splash || 2.5;
      burst(kit, x, z, r * 1.1, AP_FIRE, AP_WHITE, { life: 0.55 });
      kit.ring(x, z, r * 1.5, AP_BLUE, 0.45, 0.8);
      sigil(kit, x, z, r * 1.3, AP_BLUE, { c2: AP_WHITE, n: 0, ticks: 16, inner: 0.6, fill: 0.25, w: 0.06, life: 0.6, rev: 0.05 });
      kit.sparks(x, 1.2, z, kit.N(16), AP_FIRE, 12, 0.5, 0.07, 0.8, 12);
      kit.puffs(x, 0.9, z, kit.N(5), C(0.25, 0.25, 0.28), r * 0.5, 2.5, 1.2, 1.4, 2.4, 1, 0.6, kit.K.SMOKE, 2);
      kit.flash(x, 2, z, AP_FIRE, 70, 0.3); kit.kick(x, z, 0.6);
    },
  },
};

export const K10 = { ...bocap, ...apocalypse };
