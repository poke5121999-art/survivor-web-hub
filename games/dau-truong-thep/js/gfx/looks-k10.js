// Looks, kit lane K10: Bọ Cạp (kits ported from the owner's clips, see data.js). Render only (see looks.js
// for the hooks). One main colour and one accent per tank.
// Bọ Cạp (bilibili BV1Kp4y1b7i6 p52 "49.毒蝎女王", gameplay 30-46 s): violet-magenta. Q sprays a violet poison stream into the cone
//   in front, a violet vortex turning round her; E wraps her in a dripping magenta aura; R bursts a violet poison dome out of her
//   and pink poison bubbles pop over every foe it reaches.
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

export const K10 = { ...bocap };
