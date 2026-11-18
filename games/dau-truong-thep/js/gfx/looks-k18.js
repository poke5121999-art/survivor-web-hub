// Looks, kit lane K18: Ngưu Ma Vương and Mikasa (kits ported from the owner's clips, see data.js). Render only (see looks.js for
// the hooks; the passives' k18 events come through fx.js). One main colour and one accent per tank.
// Ngưu Ma Vương (bilibili BV1Kp4y1b7i6 p85 "82.牛魔王", gameplay 18-66 s): lime green, accent warm gold. Chiến Tiêu is a ring of
//   lime crescents whirling round the bull with a faint lime bubble on him; Q stamps a lime shock ring with stone spikes bursting
//   up; E lowers a lime horn crescent and charges inside a lime shield bubble; R draws the two long lime lines of the strip, then
//   the axe comes down along it in a lime band with gold blasts.
// Mikasa (p56 "53.米卡莎", gameplay 35-61 s): steel blue-grey, accent cyan. The grapple is a thin cyan cable with a steel hook
//   head, a cyan anchor flash where it bites; Q wraps her in a dark slate bubble swirling with cyan; R is a ring of steel blade
//   shards and two blue-white arcs spinning round her, a white X where it crits.
import { C, stop, sigil, shell, burst, slash, cut, trail, spikes } from './lookkit.js';

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

// ---- Mikasa -------------------------------------------------------------------------------------------------------
const MK_STEEL = C(1.3, 1.7, 2.3), MK_CY = C(0.35, 2.1, 2.6), MK_WHITE = C(2.3, 2.5, 2.6), MK_SLATE = C(0.1, 0.14, 0.26);
// the grapple now in flight or reeling, per mech (render side): the passive's latch event pins its head
const hooks = new Map();
// a thin cyan cable from her to (x, z), drawn this frame
// the manoeuvre gear's gas: a soft cyan-white jet blown out along a from (x, z)
function gas(kit, x, z, a, n) {
  for (let i = 0; i < kit.N(n); i++) {
    const b = a + R(-0.45, 0.45), sp = R(4, 9);
    kit.puffs(x + Math.cos(b) * 0.6, R(0.8, 1.4), z + Math.sin(b) * 0.6, 1, i % 2 ? C(0.75, 0.9, 1.0) : C(0.55, 0.75, 0.9), 0.3, sp, 0.6, 1.1, 2.6, 0.2, 0.6, kit.K.SMOKE, 3);
  }
  kit.glow(x + Math.cos(a) * 1.2, 1.2, z + Math.sin(a) * 1.2, MK_CY, 0.18, 2.6, 0.6, kit.K.GLOW, 1.2, Math.cos(a) * 4, 0, Math.sin(a) * 4);
}
const cable = (kit, u, x, z) => { const b = kit.beam(u.x, u.z, x, z, 0.24, MK_CY, 0.05, 0, 1.3); b.fade = true; kit.glow(x, 1.3, z, MK_WHITE, 0.05, 0.7, 1, kit.K.STAR, 1); };
const mikasa = {
  // Thiết Bị Cơ Động (passive): the anchor biting the wall (a cyan flash, a ring, chips) and the cable while she reels;
  // a white X where the spin crits
  nhGear: {
    k18(kit, e, u) {
      if (e.kind === 'latch') {
        const h = hooks.get(u.id) || {};
        h.done = true; h.x = e.x; h.z = e.z; hooks.set(u.id, h);
        kit.glow(e.x, 1.3, e.z, MK_WHITE, 0.15, 2.2, 1, kit.K.STAR, 1.3);
        kit.ring(e.x, e.z, 1.6, MK_CY, 0.35, 0.9);
        kit.sparks(e.x, 1.3, e.z, kit.N(8), MK_CY, 7, 0.3, 0.05, 0.5, 8);
        kit.chips(e.x, 1, e.z, kit.N(5), C(0.5, 0.5, 0.55), 5, 0.5, 0.1);
        trail(kit, (t) => (t < 0.6 && u.alive ? [u.x, 1.0, u.z] : null), 1.0, MK_STEEL, 0.4, { c2: MK_SLATE, len: 14 });
        kit.follow(u, 0.6, () => { if (u.dash || kit.time - (h.at || 0) < 0.1) cable(kit, u, e.x, e.z); });
        h.at = kit.time;
      } else if (e.kind === 'crit') {
        cut(kit, u.x, u.z, Math.random() * 3.14, 3.6, MK_CY, { edge: MK_WHITE, sparks: 5, life: 0.18 });
        kit.flash(u.x, 1.6, u.z, MK_WHITE, 40, 0.18);
      }
    },
  },
  // Cực Tốc Điền Sung: a cyan glint for the wind-up, a slate streak along the dash, then her dark slate bubble swirling with cyan
  // for as long as the shield lasts; a puff of dark smoke when it goes
  nhRefill: {
    skill(kit, e, u, row) {
      const w = (row && row.windup) || 0.15, T = w + ((row && row.dist) || 5) / ((row && row.speed) || 30) + 0.05;
      kit.flash(u.x, 1.4, u.z, MK_CY, 30, 0.18);
      sigil(kit, u.x, u.z, 3.2, MK_CY, { c2: MK_WHITE, n: 0, ticks: 10, inner: 0.6, fill: 0.55, w: 0.08, life: 0.6, rev: 0.05, spin: 5 });
      gas(kit, u.x, u.z, e.a + Math.PI, 8);
      trail(kit, (t) => (t > w * 0.5 && t < T && u.alive ? [u.x, 0.9, u.z] : null), 1.8, MK_SLATE, 0.5, { c2: MK_STEEL, len: 16 });
      trail(kit, (t) => (t > w * 0.5 && t < T && u.alive ? [u.x, 1.6, u.z] : null), 0.9, MK_CY, 0.35, { c2: MK_STEEL, len: 12, up: true });
      const sh = shell(kit, u.x, 1.0, u.z, 2.0, MK_SLATE, { c2: C(0.22, 0.32, 0.6), p: 1.1, core: 0.55, bands: 1.4, life: 4.1, grow: 0.08, follow: u, alpha: 0.95, pulse: 1.5 });
      const ring = sigil(kit, u.x, u.z, 2.0, MK_CY, { c2: MK_STEEL, n: 0, ticks: 12, inner: 0.8, fill: 0.15, w: 0.06, life: 4.1, rev: 0.1, spin: 3, follow: u, alpha: 0.7 });
      let gone = false;
      kit.follow(u, 4.1, (t) => {
        if (gone || t < 0.1 || u.shield > 1) { if (!gone && Math.random() < 0.35) { const b = Math.random() * 6.283; kit.glow(u.x + Math.cos(b) * 1.3, R(0.5, 1.6), u.z + Math.sin(b) * 1.3, MK_CY, 0.3, 0.35, 0.9, kit.K.SPARK, 1, -Math.sin(b) * 3, 0, Math.cos(b) * 3); } return; }
        gone = true; stop(sh); stop(ring);
        kit.puffs(u.x, 1, u.z, kit.N(6), C(0.18, 0.2, 0.26), 1, 2, 0.8, 1.4, 2.4, 0.5, 0.65, kit.K.SMOKE);
      }, () => { stop(sh); stop(ring); });
      return true;
    },
  },
  // Đạn Xạ Câu Trảo: the steel hook head flies out on its cyan cable (it passes through mechs); the passive draws the bite and the reel
  nhGrapple: {
    pal: [MK_STEEL, MK_WHITE], hitR: 1.5,
    skill(kit, e, u, row) {
      const sp = (row && row.speed) || 36, L = (row && row.range) || 13, a = e.a, ca = Math.cos(a), sa = Math.sin(a), x0 = u.x, z0 = u.z;
      const h = { done: false, at: 0 };
      hooks.set(u.id, h);
      kit.flash(u.x, 1.3, u.z, MK_CY, 30, 0.18);
      kit.glow(u.x + ca, 1.3, u.z + sa, MK_WHITE, 0.15, 2.2, 1, kit.K.STAR, 1.3);
      // the gear fires its gas: a cyan-white jet blown out behind her, a cyan ring at her feet
      gas(kit, u.x, u.z, a + Math.PI, 14);
      sigil(kit, u.x, u.z, 3.3, MK_CY, { c2: MK_WHITE, n: 0, ticks: 12, inner: 0.65, fill: 0.6, w: 0.08, life: 0.5, rev: 0.04, spin: -6 });
      const head = { x: x0, z: z0 };
      trail(kit, (t) => (!h.done && t < L / sp ? [head.x, 1.3, head.z] : null), 1.1, MK_CY, 0.35, { c2: MK_STEEL, len: 18 });
      trail(kit, (t) => (!h.done && t < L / sp ? [head.x, 1.3, head.z] : null), 1.2, MK_WHITE, 0.3, { c2: MK_CY, len: 12, up: true });
      kit.follow(u, L / sp + 0.15, (t) => {
        if (h.done || hooks.get(u.id) !== h) return;
        const d = Math.min(L, t * sp);
        head.x = x0 + ca * d; head.z = z0 + sa * d;
        cable(kit, u, head.x, head.z);
        cut(kit, head.x, head.z, a, 0.9, MK_STEEL, { edge: MK_CY, sparks: 0, life: 0.05 });
        kit.glow(head.x, 1.3, head.z, MK_CY, 0.08, 2.4, 0.8, kit.K.GLOW, 1);
      });
      return true;
    },
  },
  // Hồi Toàn Trảm Kích: she spins: a ring of steel blade shards whirling out round her, two blue-white arcs chasing each other,
  // a pale steel ring on the ground
  nhSpin: {
    pal: [MK_STEEL, MK_WHITE], hitR: 1.6,
    skill() { return true; },
    nova(kit, e, u) {
      const r = e.r || 3.5, x = e.x, z = e.z, a0 = Math.random() * 6.283;
      // three blade arcs at once (no slow sweep: the spin is all round her in the first frames), a wind wake beyond the blades
      for (let i = 0; i < 3; i++) slash(kit, x, z, a0 + i * 2.094, r * (1.0 - 0.1 * i), i === 1 ? MK_CY : MK_STEEL, { y: 0.9 + 0.2 * i, dir: 1, life: 0.38, w: r * 0.3, span: 1.25, sweep: 0.04, arcs: 2, c2: MK_SLATE, edge: MK_WHITE, wake: 1.7, sparks: i === 0 });
      slash(kit, x, z, a0 + 1.0, r * 1.6, MK_STEEL, { y: 0.4, dir: 1, life: 0.42, w: r * 0.45, span: 1.6, sweep: 0.05, arcs: 1, c2: MK_SLATE, edge: MK_CY, sparks: false, wake: 1.3 });
      sigil(kit, x, z, r * 1.55, MK_STEEL, { c2: MK_CY, n: 0, ticks: 18, inner: 0.65, fill: 0.6, w: 0.08, life: 0.5, rev: 0.02, spin: 9 });
      shell(kit, x, 0, z, r * 1.25, MK_STEEL, { c2: MK_CY, dome: true, p: 1.3, core: 0.12, bands: 1.6, life: 0.45, grow: 0.03, squash: 0.45, alpha: 0.8, follow: u });
      // steel blade shards flung round and outward (the grey ring of the clip)
      for (let i = 0, n = kit.N(30); i < n; i++) {
        const b = a0 + i / n * 6.283, q = r * R(0.7, 1.05), v = R(7, 12);
        kit.str.emit(x + Math.cos(b) * q, R(0.6, 1.4), z + Math.sin(b) * q, -Math.sin(b) * v + Math.cos(b) * 5, R(-0.3, 0.5), Math.cos(b) * v + Math.sin(b) * 5, i % 3 ? MK_STEEL : MK_WHITE, R(0.3, 0.45), 0.2, 0.14, 0, 1, 1);
      }
      kit.chips(x, 1, z, kit.N(10), C(0.5, 0.55, 0.62), 9, 0.6, 0.12);
      kit.flash(x, 1.5, z, MK_CY, 30, 0.18);
      return true;
    },
  },
};

export const K18 = { ...nguma, ...mikasa };
