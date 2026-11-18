// Looks, kit lane K18: Ngưu Ma Vương (kit ported from the owner's clips, see data.js). Render only (see looks.js for
// the hooks; the passives' k18 events come through fx.js). One main colour and one accent.
// Ngưu Ma Vương (bilibili BV1Kp4y1b7i6 p85 "82.牛魔王", gameplay 18-66 s): lime green, accent warm gold. Chiến Tiêu is a ring of
//   lime crescents whirling round the bull with a faint lime bubble on him; Q stamps a lime shock ring with stone spikes bursting
//   up; E lowers a lime horn crescent and charges inside a lime shield bubble; R draws the two long lime lines of the strip, then
//   the axe comes down along it in a lime band with gold blasts.
import { C, sigil, shell, burst, slash, trail, spikes } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);

// ---- Ngưu Ma Vương ------------------------------------------------------------------------------------------------
const NG_LIME = C(1.1, 2.6, 0.25), NG_PALE = C(1.9, 2.6, 1.0), NG_DEEP = C(0.12, 0.32, 0.03), NG_GOLD = C(2.6, 1.8, 0.35);
const NG_DUST = C(0.42, 0.36, 0.24);
// the whirl: three lime crescents chasing each other round him, a lime ring under him
function whirl(kit, u, r, k = 1) {
  const a0 = Math.random() * 6.283;
  for (let i = 0; i < 3; i++) slash(kit, u.x, u.z, a0 + i * 2.094, r * (0.85 + 0.1 * i), i ? NG_LIME : NG_PALE, { y: 0.7 + 0.25 * i, dir: 1, life: 0.42, w: r * 0.2 * k, span: 1.0, sweep: 0.12, arcs: 1, c2: NG_DEEP, edge: NG_PALE, sparks: false, wake: 1.4 });
  sigil(kit, u.x, u.z, r, NG_LIME, { c2: NG_PALE, n: 0, ticks: 8, inner: 0.78, fill: 0.25, w: 0.08, life: 0.45, rev: 0.06, spin: 7, follow: u });
}
const nguma = {
  // Chiến Tiêu (passive): the whirl, and his lime bubble, brighter the more stacks he carries
  nmGale: {
    k18(kit, e, u) {
      if (e.kind !== 'gale') return;
      whirl(kit, u, e.r || 3.5, 0.8);
      shell(kit, u.x, 1.0, u.z, 1.6, NG_LIME, { c2: NG_PALE, p: 1.6, core: 0.12, life: 0.5, grow: 0.08, follow: u, alpha: 0.35 + 0.05 * Math.min(10, e.n || 0) });
      for (let i = 0; i < kit.N(8); i++) { const b = Math.random() * 6.283, q = R(1, 3); kit.puffs(u.x + Math.cos(b) * q, 0.3, u.z + Math.sin(b) * q, 1, NG_DUST, 0.3, 3, 0.5, 0.7, 2, 0.3, 0.4, kit.K.DUST); }
    },
  },
  // Bạo Lệ Tiễn Đạp: lime glow gathers under his hooves for the wind-up, then the stamp: a lime shock ring, stone spikes
  // bursting up round it, dust thrown outward
  nmStomp: {
    pal: [NG_LIME, NG_PALE], hitR: 1.8,
    skill(kit, e, u, row) {
      const w = (row && row.windup) || 0.3;
      kit.follow(u, w, () => { kit.glow(u.x, 0.4, u.z, NG_LIME, 0.12, 2.6, 0.5, kit.K.GLOW, 1.1); if (Math.random() < 0.5) kit.puffs(u.x, 0.2, u.z, 1, NG_DUST, 1, 2, 0.5, 0.8, 2, 0.3, 0.4, kit.K.DUST); });
      sigil(kit, u.x, u.z, 2.2, NG_LIME, { c2: NG_PALE, n: 0, ticks: 6, inner: 0.5, fill: 0.5, w: 0.08, life: w + 0.05, rev: w, follow: u });
      return true;
    },
    nova(kit, e) {
      const r = e.r || 4;
      sigil(kit, e.x, e.z, r, NG_LIME, { c2: NG_PALE, n: 0, ticks: 12, inner: 0.72, fill: 0.6, w: 0.1, life: 0.55, rev: 0.08 });
      sigil(kit, e.x, e.z, r * 0.5, NG_PALE, { c2: NG_LIME, n: 0, ticks: 0, inner: 0, fill: 0.8, w: 0, life: 0.3, rev: 0.04, alpha: 0.7 });
      sigil(kit, e.x, e.z, r * 0.95, NG_DEEP, { n: 0, ticks: 0, inner: 0, fill: 1, w: 0, life: 0.55, rev: 0.06, alpha: 0.55, y: 0.1 });
      spikes(kit, e.x, e.z, 10, r * 0.8, 1.4, NG_LIME, 0.6, { up: 0.08, core: 0x0c1c04 });
      kit.ring(e.x, e.z, r * 1.05, NG_LIME, 0.45, 0.9);
      for (let i = 0; i < kit.N(14); i++) { const b = Math.random() * 6.283, sp = R(6, 11); kit.puffs(e.x + Math.cos(b) * 1.2, 0.3, e.z + Math.sin(b) * 1.2, 1, NG_DUST, 0.4, sp, 0.7, 1, 2.4, 0.4, 0.55, kit.K.DUST, 3); }
      kit.chips(e.x, 0.3, e.z, kit.N(10), C(0.4, 0.34, 0.26), 8, 0.7, 0.16);
      kit.flash(e.x, 1.5, e.z, NG_LIME, 45, 0.25); kit.kick(e.x, e.z, 0.6);
      return true;
    },
  },
  // Cuồng Dã Giác Tập: he paws the ground in a lime glow, then charges behind a big lime horn crescent, two lime ribbons off his
  // horns; the shield is a lime bubble on him that thins as it turns into hp
  nmHorn: {
    pal: [NG_LIME, NG_GOLD], hitR: 2,
    skill(kit, e, u, row) {
      const w = (row && row.windup) || 0.3, T = w + ((row && row.dist) || 8) / ((row && row.speed) || 26) + 0.1, a = e.a;
      sigil(kit, u.x, u.z, 3.6, NG_DEEP, { n: 0, ticks: 0, inner: 0, fill: 1, w: 0, life: w + 0.15, rev: w * 0.5, alpha: 0.5, y: 0.1, follow: u });
      sigil(kit, u.x, u.z, 3.4, NG_LIME, { c2: NG_GOLD, n: 0, ticks: 8, inner: 0.6, fill: 0.7, w: 0.1, life: w + 0.15, rev: w * 0.6, spin: -4, follow: u });
      slash(kit, u.x + Math.cos(a) * 0.4, u.z + Math.sin(a) * 0.4, a, 2.6, NG_LIME, { y: 1.1, life: w + 0.1, w: 1.1, span: 1.0, sweep: w * 0.6, erode: 0.08, arcs: 1, c2: NG_DEEP, edge: NG_GOLD, sparks: false, tilt: 0.5, wake: 1.3 });
      kit.follow(u, w, () => { kit.glow(u.x + Math.cos(a) * 1.1, 1.0, u.z + Math.sin(a) * 1.1, NG_LIME, 0.12, 2.4, 0.7, kit.K.GLOW, 1.1); if (Math.random() < 0.6) kit.puffs(u.x - Math.cos(a), 0.3, u.z - Math.sin(a), 1, NG_DUST, 0.5, 3, 0.6, 0.9, 2.2, 0.4, 0.5, kit.K.DUST, 3); });
      let n = 0;
      kit.follow(u, T, (t) => {
        if (t < w) return;
        if (t > w + n * 0.07) { n++; slash(kit, u.x + Math.cos(a) * 0.6, u.z + Math.sin(a) * 0.6, a, 2.2, NG_LIME, { y: 1.0, life: 0.24, w: 0.9, span: 1.1, sweep: 0.04, arcs: 1, c2: NG_DEEP, edge: NG_GOLD, sparks: false, wake: 1.4 }); }
        kit.str.emit(u.x, R(0.4, 1.3), u.z, -Math.cos(a) * 10, 0, -Math.sin(a) * 10, NG_LIME, 0.25, 0.14, 0.08, 0, 1, 1);
      });
      for (const sd of [-1, 1]) trail(kit, (t) => (t > w && t < T && u.alive ? [u.x + Math.cos(a) * 0.9 - Math.sin(a) * sd * 0.8, 1.4, u.z + Math.sin(a) * 0.9 + Math.cos(a) * sd * 0.8] : null), 0.6, NG_LIME, 0.5, { c2: NG_DEEP, len: 14 });
      const S0 = Math.max(1, u.shield || 1);
      shell(kit, u.x, 1.0, u.z, 1.9, NG_LIME, { c2: NG_PALE, p: 1.5, core: 0.1, bands: 0.8, life: 4.2, grow: 0.1, follow: u, alpha: 0.9, core: 0.22,
        step: (t, m, mat) => { if (t > 0.2 && !(u.shield > 1)) return false; mat.uniforms.uA.value *= 0.4 + 0.6 * Math.min(1, (u.shield || 0) / S0); } });
      return true;
    },
  },
  // Tàn Phong Đoạn Dã: two long lime lines mark the 10 x 4 m strip for the wind-up; then the axe comes down along it, a lime band
  // with a pale core, gold blasts along it, dust and chips thrown up
  nmRend: {
    pal: [NG_LIME, NG_GOLD], hitR: 2.4,
    skill(kit, e, u, row) {
      const w = (row && row.windup) || 0.5, L = (row && row.range) || 10, W = ((row && row.width) || 4) / 2, a = e.a, ca = Math.cos(a), sa = Math.sin(a);
      for (const sd of [-1, 1]) {
        const x0 = u.x - sa * sd * W, z0 = u.z + ca * sd * W;
        const b = kit.beam(x0, z0, x0 + ca * L, z0 + sa * L, 0.3, NG_LIME, w + 0.45, 0, 0.3); b.fade = true;
      }
      const f = kit.beam(u.x, u.z, u.x + ca * L, u.z + sa * L, W * 2, NG_DEEP, w + 0.1, 0, 0.12); f.fade = true;
      kit.follow(u, w, () => kit.glow(u.x + ca * 1.2, 1.6, u.z + sa * 1.2, NG_GOLD, 0.1, 2.2, 0.8, kit.K.GLOW, 1.1));
      return true;
    },
    beam(kit, e) {
      const dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz) || 1, a = Math.atan2(dz, dx), w = e.w || 4;
      const band = kit.beam(e.x0, e.z0, e.x1, e.z1, w * 1.2, NG_LIME, 0.6, 0, 0.3); band.fade = true;
      const core = kit.beam(e.x0, e.z0, e.x1, e.z1, w * 0.35, NG_PALE, 0.4, 0, 0.35); core.fade = true;
      slash(kit, e.x0 + dx * 0.5, e.z0 + dz * 0.5, a + Math.PI / 2, L * 0.55, NG_LIME, { y: 1.2, life: 0.45, w: 2.0, span: 0.95, sweep: 0.06, arcs: 2, c2: NG_DEEP, edge: NG_GOLD, tilt: 1.2 });
      for (const t of [0.2, 0.45, 0.7, 0.95]) {
        const x = e.x0 + dx * t, z = e.z0 + dz * t;
        burst(kit, x, z, w * 0.7, NG_GOLD, NG_PALE, { life: 0.45 + t * 0.12 });
        kit.chips(x, 0.3, z, kit.N(4), C(0.4, 0.34, 0.26), 7, 0.7, 0.15);
        kit.puffs(x, 0.4, z, 2, NG_DUST, w * 0.4, 3, 0.9, 1.4, 2.4, 0.6, 0.6, kit.K.DUST);
        kit.scorch(x, z, w * 0.3, 3, 1.2, NG_LIME);
        sigil(kit, x, z, w * 0.75, NG_LIME, { c2: NG_DEEP, n: 0, ticks: 6, inner: 0.5, fill: 0.75, w: 0.08, life: 0.7, rev: 0.05, spin: 0, rot: a });
        spikes(kit, x, z, 5, w * 0.5, 1.5, NG_LIME, 0.7, { up: 0.06, core: 0x0c1c04, twist: t * 3 });
      }
      for (let k = 0; k < 3; k++) slash(kit, e.x0 + dx * (0.1 + k * 0.25), e.z0 + dz * (0.1 + k * 0.25), a, w * 0.85, k ? NG_LIME : NG_PALE, { y: 0.5, life: 0.42 + k * 0.06, w: 1.6, span: 1.0, sweep: 0.04, arcs: 1, c2: NG_DEEP, edge: NG_GOLD, travel: 9, sparks: false });
      for (const sd of [-1, 1]) { const ox = -dz / L * sd * w * 0.5, oz = dx / L * sd * w * 0.5, b = kit.beam(e.x0 + ox, e.z0 + oz, e.x1 + ox, e.z1 + oz, 0.35, NG_LIME, 0.6, 0, 0.3); b.fade = true; }
      kit.flash(e.x0 + dx * 0.5, 2, e.z0 + dz * 0.5, NG_GOLD, 65, 0.3); kit.kick(e.x0 + dx * 0.4, e.z0 + dz * 0.4, 0.8);
      return true;
    },
  },
};

export const K18 = { ...nguma };
