// Looks, kit lane k9: An Dương Vương (后羿 p6), Băng Nha (冰雪女王 p81), Black Panther (黑豹 p89), kits ported from the owner's
// clips (see data.js). Render only (see looks.js for the hooks).
// An Dương Vương, clip gameplay 12-59 s: an orange flame ring round the archer, fire arrows trailing flame with a spiral ring of fire
//   round each, an arcing orange fan of arrows for 箭无虚发; the frenzy keeps a burning bow-ring turning round him.
//   One main colour (fire orange) and one accent (pale gold); the arrows' cores are white-gold.
import { C, sigil, pillar, trail, burst, slash, shell } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);
const AD_FIRE = C(2.6, 0.75, 0.12), AD_GOLD = C(2.4, 1.7, 0.55), AD_WHITE = C(2.6, 2.2, 1.6), AD_EMBER = C(1.2, 0.22, 0.04);

// a fire arrow: a white-gold head, a flame ribbon behind it (flat + upright), and every few metres a small spiral ring of fire
function fireArrow(kit, s, big) {
  const a = Math.atan2(s.dz, s.dx), v = { a, x: s.x, z: s.z, on: true, acc: 0 };
  const w = big ? 0.6 : 0.5;
  trail(kit, () => (v.on ? [v.x, 1.25, v.z] : null), w, AD_FIRE, 1.6, { c2: AD_GOLD, len: big ? 20 : 14 });
  trail(kit, () => (v.on ? [v.x, 1.3, v.z] : null), w * 0.8, AD_FIRE, 1.6, { c2: AD_EMBER, len: big ? 16 : 10, up: true });
  return v;
}
function arrowStep(kit, v, s, x, z, dt, big) {
  v.x = x; v.z = z; v.acc += dt;
  kit.glow(x, 1.28, z, AD_WHITE, 0.05, big ? 1.0 : 0.7, 1, kit.K.STAR, 1);
  kit.glow(x - s.dx * 0.4, 1.28, z - s.dz * 0.4, AD_FIRE, 0.08, big ? 1.8 : 1.2, 0.7, kit.K.GLOW, 1);
  if (v.acc > (big ? 0.07 : 0.1)) { v.acc = 0; kit.ring(x, z, big ? 0.9 : 0.6, AD_FIRE, 0.25, 0.7); }
  if (Math.random() < 0.6) kit.glow(x + R(-0.15, 0.15), 1.3, z + R(-0.15, 0.15), AD_FIRE, R(0.2, 0.35), R(0.4, 0.7), 0.9, kit.K.FLAME, 1.1, 0, R(0.8, 1.8), 0);
}
function arrowEnd(kit, x, z) {
  kit.glow(x, 1.2, z, AD_GOLD, 0.12, 1.4, 0.9, kit.K.STAR, 1.2);
  for (let i = 0; i < kit.N(5); i++) kit.glow(x + R(-0.4, 0.4), R(0.6, 1.3), z + R(-0.4, 0.4), AD_FIRE, R(0.3, 0.5), R(0.5, 0.8), 1, kit.K.FLAME, 1.2, 0, R(1, 2), 0);
}
// the flame bow: an upright gold-orange arc in front of him, drawn back and loosed
function bow(kit, u, a, size) {
  const x = u.x + Math.cos(a) * 1.0, z = u.z + Math.sin(a) * 1.0;
  slash(kit, x, z, a + Math.PI, size, AD_FIRE, { c2: AD_GOLD, edge: AD_WHITE, sparks: false, span: 1.05, life: 0.42, sweep: 0.05, w: 0.35, tilt: 1.571, y: 1.4 });
  kit.glow(x, 1.4, z, AD_GOLD, 0.12, 1.6, 1, kit.K.STAR, 1.2);
  kit.flash(x, 1.6, z, AD_FIRE, 26, 0.16);
}

export const K9 = {
  // Súc Thế Đãi Phát: he rolls forward in a streak of flame; a ring of fire flares where he left and embers fly as he lands
  adRoll: {
    pal: [AD_FIRE, AD_GOLD],
    skill(kit, e, u, row) {
      const T = (row.dist || 4) / (row.speed || 26) + 0.08;
      sigil(kit, e.x, e.z, 3.4, AD_FIRE, { c2: AD_GOLD, n: 6, m: 2, ticks: 12, inner: 0.62, fill: 0.45, w: 0.09, life: 0.8, rev: 0.06, spin: 2 });
      trail(kit, (t) => (t < T && u.alive ? [u.x, 0.5, u.z] : null), 1.15, AD_FIRE, 0.9, { c2: AD_GOLD, len: 16 });
      trail(kit, (t) => (t < T && u.alive ? [u.x, 1.0, u.z] : null), 1.1, AD_FIRE, 0.9, { c2: AD_EMBER, len: 14, up: true });
      shell(kit, u.x, 1.0, u.z, 1.7, AD_FIRE, { c2: AD_GOLD, p: 1.6, core: 0.35, follow: u, life: T + 0.25, grow: 0.05, alpha: 0.95 });
      kit.follow(u, T + 0.3, (t) => { if (Math.random() < 0.8) kit.glow(u.x + R(-0.5, 0.5), R(0.3, 1.2), u.z + R(-0.5, 0.5), AD_FIRE, R(0.25, 0.45), R(0.5, 0.9), 1, kit.K.FLAME, 1.1, 0, R(1, 2.5), 0); },
        () => { if (u.alive) { kit.ring(u.x, u.z, 2.0, AD_GOLD, 0.4, 0.9); kit.sparks(u.x, 0.8, u.z, kit.N(10), AD_FIRE, 7, 0.35, 0.05, 0.6, 6); } });
      kit.flash(e.x, 1.4, e.z, AD_FIRE, 30, 0.2);
      return true;
    },
  },
  // Tiễn Vô Hư Phát: the flame bow draws and looses; a wide arc of fire fans out over the floor and five fire arrows fly out,
  // each with its spiral fire ring; where one lands it bursts in flame
  adFan: {
    pal: [AD_FIRE, AD_GOLD], hitR: 1.7,
    skill(kit, e, u, row) {
      bow(kit, u, e.a, 1.7);
      const span = ((row.fan || 0.12) * ((row.n || 5) - 1)) / 2 + 0.12;
      slash(kit, u.x, u.z, e.a, 5.4, AD_FIRE, { c2: AD_GOLD, edge: AD_WHITE, span, w: 4.2, life: 0.55, sweep: 0.08, y: 0.4 });
      slash(kit, u.x, u.z, e.a, 3.6, AD_GOLD, { c2: AD_FIRE, edge: AD_WHITE, sparks: false, span: span * 0.9, w: 2.0, life: 0.5, sweep: 0.07, y: 0.5, dir: -1 });
      kit.ring(u.x, u.z, 2.2, AD_FIRE, 0.4, 0.9);
      return true;
    },
    shotMake(kit, s) { return fireArrow(kit, s, false); },
    shot(kit, v, s, x, y, z, dt) { arrowStep(kit, v, s, x, z, dt || 0.016, false); return true; },
    shotEnd(kit, v, s, x, z) { v.on = false; arrowEnd(kit, x, z); },
    hit(kit, e) { burst(kit, e.x, e.z, 1.7, AD_FIRE, AD_GOLD, { life: 0.35 }); },
  },
  // Bách Bộ Xuyên Dương: a column of fire bursts up round him, a burning seal opens under him and the heal blooms gold; for the
  // frenzy a ring of fire with a flame bow-arc turns round him and his arrows become long piercing fire bolts
  adFrenzy: {
    pal: [AD_FIRE, AD_GOLD], hitR: 1.8,
    skill() { return true; },
    transform(kit, e, u, row) {
      if (!e.on) { kit.puffs(e.x, 1, e.z, kit.N(5), AD_EMBER, 0.8, 2, 0.8, 1.1, 2, 0.6, 0.5, kit.K.SMOKE, 2); return true; }
      const d = row.dur || 10;
      pillar(kit, u.x, u.z, 2.2, AD_FIRE, { c2: AD_GOLD, h: 10, life: 1.0, grow: 0.06, rings: 2 });
      shell(kit, u.x, 0, u.z, 3.4, AD_FIRE, { c2: AD_GOLD, p: 1.4, core: 0.3, dome: true, life: 0.9, grow: 0.12, alpha: 0.9 });
      sigil(kit, u.x, u.z, 4.6, AD_FIRE, { c2: AD_GOLD, n: 8, m: 3, ticks: 16, inner: 0.55, fill: 0.3, w: 0.07, life: 1.2, rev: 0.12, spin: 1.2 });
      burst(kit, u.x, u.z, 4.0, AD_FIRE, AD_GOLD, { life: 0.6 });
      kit.flash(u.x, 2.5, u.z, AD_FIRE, 50, 0.3);
      sigil(kit, u.x, u.z, 1.7, AD_FIRE, { c2: AD_GOLD, n: 0, ticks: 12, inner: 0.82, fill: 0.08, w: 0.06, life: d, rev: 0.2, follow: u, spin: 1.6, alpha: 0.9 });
      kit.follow(u, d, (t, dt) => {
        if (!(u.tfT > 0)) return;
        const a = t * 3;
        for (let i = 0; i < 2; i++) { const b = a + i * Math.PI; kit.glow(u.x + Math.cos(b) * 1.7, 1.0, u.z + Math.sin(b) * 1.7, AD_FIRE, 0.12, 0.8, 0.9, kit.K.FLAME, 1.1, 0, 1.2, 0); }
        if (Math.random() < dt * 10) kit.glow(u.x + R(-0.6, 0.6), 0.4, u.z + R(-0.6, 0.6), AD_GOLD, 0.7, 0.3, 1, kit.K.STAR, 1, 0, R(2, 3), 0);
      });
      return true;
    },
  },
};
