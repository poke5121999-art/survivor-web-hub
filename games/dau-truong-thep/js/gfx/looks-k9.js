// Looks, kit lane k9: An Dương Vương (后羿 p6), Băng Nha (冰雪女王 p81), Black Panther (黑豹 p89), kits ported from the owner's
// clips (see data.js). Render only (see looks.js for the hooks).
// An Dương Vương, clip gameplay 12-59 s: an orange flame ring round the archer, fire arrows trailing flame with a spiral ring of fire
//   round each, an arcing orange fan of arrows for 箭无虚发; the frenzy keeps a burning bow-ring turning round him.
//   One main colour (fire orange) and one accent (pale gold); the arrows' cores are white-gold.
// Băng Nha, clip gameplay 11-60 s: a pale ring of frost opening on the floor, then ice crystals bursting up round its rim; a white
//   frost breath fanning out in front of her; the blizzard a big ice-blue dome of whirling snow where ice falls; frozen foes stand
//   in a block of ice. One main colour (ice blue) and one accent (frost white).
// Black Panther, clip gameplay 12-60 s: three white claw slashes where he strikes, dark ink swirls and violet kinetic rings; the
//   hunt is a run of claw flashes from one foe to the next. One main colour (vibranium violet) and one accent (white); ink is dark.
import { C, stop, sigil, pillar, trail, burst, slash, shell, spikes } from './lookkit.js';

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

const BN_ICE = C(0.45, 1.35, 2.6), BN_WHITE = C(2.3, 2.5, 2.75), BN_DEEP = C(0.12, 0.4, 1.4), BN_CORE = 0x0a2a5a;
// a frozen foe: an ice block (a squat bubble and a ring of short crystals) stands round it while it is held
const ICED = new WeakMap();   // unit -> drawn time its ice block lasts to (render side, never on the sim unit)
function iceBlock(kit, o) {
  if (!o || !o.alive || (ICED.get(o) || 0) > kit.time) return;
  const d = Math.min(1.6, Math.max(0.4, o.stunT || 0.5));
  ICED.set(o, kit.time + d);
  shell(kit, o.x, 0, o.z, 1.5, BN_ICE, { c2: BN_WHITE, dome: true, p: 1.3, core: 0.25, follow: o, life: d, grow: 0.06, alpha: 0.9 });
  spikes(kit, o.x, o.z, 7, 1.05, 1.5, BN_ICE, d, { core: BN_CORE, follow: o, up: 0.08 });
}
function frostHit(kit, e) {
  burst(kit, e.x, e.z, 1.8, BN_ICE, BN_WHITE, { life: 0.35 });
  const o = kit.match.units[e.id];
  if (o) kit.follow(o, 0.15, () => {}, () => { if (o.stunT > 0.3) iceBlock(kit, o); });
}

const BG_VIO = C(1.3, 0.35, 2.6), BG_WHITE = C(2.5, 2.4, 2.7), BG_INK = C(0.12, 0.05, 0.22), BG_GOLD = C(2.5, 1.85, 0.45);
// three white claw slashes side by side across direction a, violet inside
function claws(kit, x, z, a, size, life = 0.35) {
  const px = -Math.sin(a), pz = Math.cos(a);
  for (let k = -1; k <= 1; k++) {
    const o = k * size * 0.22, cx = x + px * o - Math.cos(a) * size * 0.9, cz = z + pz * o - Math.sin(a) * size * 0.9;
    slash(kit, cx, cz, a, size, BG_WHITE, { c2: BG_VIO, edge: BG_WHITE, span: 0.42, w: size * 0.16, life, sweep: 0.05 + 0.02 * (k + 1), y: 1.0, sparks: k === 0, spark: BG_VIO });
  }
}
// a kinetic ring: a violet ring and a dark ink swirl on the floor, sparks out
function kinetic(kit, x, z, r) {
  sigil(kit, x, z, r, BG_VIO, { c2: BG_WHITE, n: 0, ticks: 12, inner: 0.7, fill: 0.2, w: 0.08, life: 0.5, rev: 0.04, spin: 3 });
  sigil(kit, x, z, r * 0.8, BG_INK, { c2: BG_INK, n: 5, m: 2, ticks: 0, inner: 0, fill: 0.6, w: 0.1, life: 0.55, rev: 0.05, spin: -4, alpha: 0.8 });
  kit.ring(x, z, r * 1.1, BG_VIO, 0.35, 0.9);
  kit.sparks(x, 1.0, z, kit.N(10), BG_VIO, 8, 0.3, 0.05, 0.5, 8);
}
// where a pounce leaves the ground: a violet kinetic seal with a dark ink swirl and a fan of claw marks behind the launch
function launch(kit, x, z, a, r) {
  sigil(kit, x, z, r, BG_VIO, { c2: BG_WHITE, n: 0, ticks: 12, inner: 0.62, fill: 0.45, w: 0.09, life: 0.7, rev: 0.04, spin: 2.5 });
  sigil(kit, x, z, r * 0.75, BG_INK, { c2: BG_INK, n: 5, m: 2, ticks: 0, inner: 0, fill: 0.7, w: 0.1, life: 0.7, rev: 0.05, spin: -3, alpha: 0.85 });
  slash(kit, x, z, a + Math.PI, r * 1.1, BG_VIO, { c2: BG_INK, edge: BG_WHITE, sparks: false, span: 0.9, w: r * 0.5, life: 0.5, sweep: 0.05, y: 0.4 });
  kit.flash(x, 1.4, z, BG_VIO, 30, 0.2);
}
// the dark violet streak of a pounce: a flat ribbon and an upright one behind him while the dash runs
function streak(kit, u, T, w = 1.2) {
  trail(kit, (t) => (t < T && u.alive ? [u.x, 0.6, u.z] : null), w, BG_VIO, 0.7, { c2: BG_INK, len: 16 });
  trail(kit, (t) => (t < T && u.alive ? [u.x, 1.0, u.z] : null), w * 0.85, BG_VIO, 0.7, { c2: BG_INK, len: 12, up: true });
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

  // Băng Sương Chi Hoàn: a pale frost ring draws itself on the floor at the spot through the delay; then it goes off in a white
  // flash, a ring of tall ice crystals bursts up round the rim (the band that freezes) and frost mist rolls out
  bnRing: {
    pal: [BN_ICE, BN_WHITE], hitR: 1.8,
    zones: ['strike'],
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.2, 1.4, u.z + Math.sin(e.a) * 1.2, BN_WHITE, 0.12, 1.4, 1, kit.K.STAR, 1.2); return true; },
    zoneMake(kit, z) {
      const ring = sigil(kit, z.x, z.z, z.r, BN_ICE, { c2: BN_WHITE, n: 6, m: 1, ticks: 18, inner: 0.55, fill: 0.18, w: 0.07, life: 1e9, rev: z.total || 0.5, spin: 0.8 });
      return { ring, t: 0 };
    },
    zone(kit, v, z, dt) { v.t += dt; if (Math.random() < dt * 30) { const a = Math.random() * 6.283; kit.glow(z.x + Math.cos(a) * z.r, 0.3, z.z + Math.sin(a) * z.r, BN_WHITE, 0.4, 0.35, 1, kit.K.STAR, 1, 0, R(0.5, 1.5), 0); } },
    zoneDrop(kit, v) { stop(v.ring); },
    land(kit, e) {
      const r = e.r || 3.2;
      spikes(kit, e.x, e.z, 14, r * 0.82, 2.6, BN_ICE, 1.4, { core: BN_CORE, up: 0.1 });
      sigil(kit, e.x, e.z, r, BN_ICE, { c2: BN_WHITE, n: 0, ticks: 24, inner: 0.55, fill: 0.5, w: 0.08, life: 1.2, rev: 0.05, spin: 0.4 });
      burst(kit, e.x, e.z, r * 0.9, BN_ICE, BN_WHITE, { life: 0.45 });
      kit.puffs(e.x, 0.6, e.z, kit.N(8), C(0.7, 0.85, 1), r * 0.7, 2.5, 0.9, 1.4, 2.4, 0.5, 0.5, kit.K.SMOKE, 1);
      kit.flash(e.x, 2, e.z, BN_ICE, 40, 0.22);
      return true;
    },
    hit(kit, e) { frostHit(kit, e); },
  },
  // Băng Đống Chi Tức: frost gathers at her front through the 0.3 s breath, then a white-blue fan of frost rolls out over the cone,
  // ice shards and mist driven along it
  bnBreath: {
    pal: [BN_ICE, BN_WHITE], hitR: 1.8,
    skill(kit, e, u, row) {
      kit.follow(u, row.windup || 0.3, () => { const a = u.aim, x = u.x + Math.cos(a) * 1.3, z = u.z + Math.sin(a) * 1.3; kit.glow(x, 1.2, z, BN_WHITE, 0.08, 1.2, 1, kit.K.STAR, 1.1); const b = Math.random() * 6.283, d = R(1.2, 2.2); kit.str.emit(x + Math.cos(b) * d, 1.2, z + Math.sin(b) * d, -Math.cos(b) * 8, 0, -Math.sin(b) * 8, BN_ICE, 0.18, 0.08, 0.05, 0, 1, 1); });
      return true;
    },
    nova(kit, e, u, row) {
      const a = e.a ?? u.aim, r = row.radius || 5.5, span = row.arc || 0.6;
      slash(kit, u.x, u.z, a, r, BN_ICE, { c2: BN_DEEP, edge: BN_WHITE, span: span + 0.08, w: r * 0.95, life: 0.65, sweep: 0.04, y: 0.45 });
      slash(kit, u.x, u.z, a, r * 0.72, BN_WHITE, { c2: BN_ICE, edge: BN_WHITE, sparks: false, span, w: r * 0.6, life: 0.55, sweep: 0.04, y: 0.6, dir: -1 });
      sigil(kit, u.x, u.z, 1.8, BN_ICE, { c2: BN_WHITE, n: 0, ticks: 10, inner: 0.6, fill: 0.4, w: 0.07, life: 0.6, rev: 0.05 });
      for (let i = 0; i < kit.N(26); i++) {
        const b = a + R(-span, span), sp = R(9, 15);
        kit.glow(u.x + Math.cos(b) * 1.2, R(0.6, 1.6), u.z + Math.sin(b) * 1.2, i % 3 ? BN_WHITE : BN_ICE, R(0.35, 0.5), R(0.3, 0.6), 1, kit.K.STAR, 1, Math.cos(b) * sp, R(-0.5, 0.5), Math.sin(b) * sp);
      }
      kit.puffs(u.x + Math.cos(a) * 2.5, 0.6, u.z + Math.sin(a) * 2.5, kit.N(6), C(0.7, 0.85, 1), 1.5, 2.5, 0.8, 1.4, 2.4, 0.5, 0.5, kit.K.SMOKE, 1);
      return true;
    },
    hit(kit, e) { frostHit(kit, e); },
  },
  // Băng Thiên Tuyết Địa: while she channels a wide frost seal turns under her and snow whirls up round her; each strike drops a
  // column of ice light on the spot, a dome of whirling snow over it, and ice crystals burst up where it lands
  bnBlizzard: {
    pal: [BN_ICE, BN_WHITE], hitR: 2,
    zones: ['strike'],
    skill(kit, e, u) { kit.flash(u.x, 2.5, u.z, BN_ICE, 40, 0.3); return true; },
    castMake(kit, u, s) {
      const seal = sigil(kit, u.x, u.z, 5.2, BN_DEEP, { c2: BN_WHITE, n: 6, m: 1, ticks: 24, inner: 0.5, fill: 0.6, w: 0.09, life: 1e9, rev: 0.15, spin: 0.7, follow: u });
      const dome = shell(kit, u.x, 0, u.z, 3.6, BN_ICE, { c2: BN_WHITE, dome: true, p: 1.6, core: 0.15, alpha: 0.85, life: 1e9, grow: 0.2, follow: u, squash: 0.75 });
      const ring = spikes(kit, u.x, u.z, 14, 3.8, 3.0, BN_ICE, 3.4, { core: BN_CORE, follow: u, up: 0.15 });
      const col = pillar(kit, u.x, u.z, 1.3, BN_WHITE, { c2: BN_ICE, h: 9, life: 1e9, grow: 0.15, rings: 1.5, follow: u, alpha: 0.8 });
      return { seal, dome, ring, col };
    },
    cast(kit, v, u, s, k, dt) {
      for (let i = 0; i < 4; i++) { const b = Math.random() * 6.283, d = R(1, 4.2), sp = R(5, 9); kit.str.emit(u.x + Math.cos(b) * d, R(0.3, 3.5), u.z + Math.sin(b) * d, -Math.sin(b) * sp, R(-0.5, 0.5), Math.cos(b) * sp, i % 2 ? BN_WHITE : BN_ICE, 0.35, 0.07, 0.04, 0, 1, 1); }
    },
    castDrop(kit, v) { stop(v.seal); stop(v.dome); stop(v.col); },
    zoneMake(kit, z) {
      const dome = shell(kit, z.x, 0, z.z, z.r, BN_ICE, { c2: BN_DEEP, dome: true, p: 2.2, core: 0.04, alpha: 0.45, life: (z.total || 0.3) + 0.6, grow: 0.2, squash: 0.55 });
      pillar(kit, z.x, z.z, 1.1, BN_ICE, { c2: BN_WHITE, h: 12, life: (z.total || 0.3) + 0.3, grow: z.total || 0.3, drop: true, rings: 1 });
      return { dome };
    },
    zone(kit, v, z) { for (let i = 0; i < 3; i++) { const b = Math.random() * 6.283, d = z.r * R(0.2, 0.9); kit.str.emit(z.x + Math.cos(b) * d, R(0.4, 3), z.z + Math.sin(b) * d, -Math.sin(b) * 8, -1, Math.cos(b) * 8, BN_WHITE, 0.3, 0.07, 0.04, 0, 1, 1); } },
    land(kit, e) {
      const r = e.r || 3.5;
      spikes(kit, e.x, e.z, 10, r * 0.6, 2.2, BN_ICE, 1.0, { core: BN_CORE, up: 0.08, twist: Math.random() * 3 });
      burst(kit, e.x, e.z, r, BN_ICE, BN_WHITE, { life: 0.45 });
      kit.flash(e.x, 2, e.z, BN_WHITE, 35, 0.2); kit.kick(e.x, e.z, 0.4);
      return true;
    },
    hit(kit, e) { frostHit(kit, e); },
  },

  // Nguyên Thủy Cuồng Nộ: a violet streak along the pounce, three claw slashes and a kinetic ring on the foe it stops on
  bgPounce: {
    pal: [BG_VIO, BG_WHITE], hitR: 1.8,
    skill(kit, e, u, row) {
      const T = (row.dist || 7) / (row.speed || 34) + 0.05;
      streak(kit, u, T, 1.7);
      launch(kit, e.x, e.z, e.a, 2.8);
      kit.follow(u, T + 0.1, () => {}, () => { if (u.alive) { const a = u.heading; claws(kit, u.x + Math.cos(a) * 1.4, u.z + Math.sin(a) * 1.4, a, 3.2); kinetic(kit, u.x + Math.cos(a) * 1.4, u.z + Math.sin(a) * 1.4, 2.2); } });
      kit.flash(u.x, 1.4, u.z, BG_VIO, 25, 0.2);
      return true;
    },
  },
  // the back-flip: a violet arc over the floor where he flips back, ink puffs where he lands
  bgFlip: {
    skill(kit, e, u, row) {
      const T = (row.dist || 4) / (row.speed || 22) + 0.05;
      trail(kit, (t) => (t < T && u.alive ? [u.x, 1.2 + Math.sin(Math.min(1, t / T) * Math.PI) * 1.4, u.z] : null), 0.9, BG_VIO, 0.6, { c2: BG_WHITE, len: 12, up: true });
      slash(kit, u.x, u.z, e.a + Math.PI, 2.4, BG_VIO, { c2: BG_INK, edge: BG_WHITE, sparks: false, span: 1.3, w: 0.6, life: 0.4, sweep: 0.12, tilt: 1.571, y: 1.2 });
      return true;
    },
    nova() { return true; },
  },
  // the bombs (gold in the clip, 25 s and 40 s): a gold throw flash; each bomb bursts in a gold ring round a white core
  bgBombs: {
    pal: [BG_VIO, BG_WHITE], hitR: 1.8,
    skill(kit, e, u) {
      const x = u.x + Math.cos(e.a) * 1.3, z = u.z + Math.sin(e.a) * 1.3;
      kit.glow(x, 1.4, z, BG_WHITE, 0.12, 1.6, 1, kit.K.STAR, 1.2); kit.glow(x, 1.4, z, BG_GOLD, 0.2, 2.6, 0.9, kit.K.GLOW, 1.2);
      slash(kit, u.x, u.z, e.a, 3.0, BG_GOLD, { c2: BG_VIO, edge: BG_WHITE, sparks: false, span: 0.5, w: 1.6, life: 0.35, sweep: 0.05, y: 0.6 });
      return true;
    },
    hit(kit, e) {
      sigil(kit, e.x, e.z, 1.7, BG_GOLD, { c2: BG_WHITE, n: 0, ticks: 0, inner: 0.72, fill: 0.15, w: 0.1, life: 0.45, rev: 0.03 });
      kit.ring(e.x, e.z, 2.0, BG_GOLD, 0.35, 0.9); burst(kit, e.x, e.z, 1.4, BG_GOLD, BG_WHITE, { life: 0.3 });
    },
  },
  // Dã Tính Huyết Tập: the first lunge: a violet streak, claws where it lands
  bgLunge: {
    pal: [BG_VIO, BG_WHITE], hitR: 1.8,
    skill(kit, e, u, row) {
      const T = (row.dist || 7) / (row.speed || 34) + 0.05;
      streak(kit, u, T, 1.5);
      launch(kit, e.x, e.z, e.a, 2.4);
      kit.follow(u, T + 0.1, () => {}, () => { if (u.alive) { const a = u.heading; claws(kit, u.x + Math.cos(a) * 1.3, u.z + Math.sin(a) * 1.3, a, 2.6); } });
      return true;
    },
  },
  // the second charge: a wide ink-and-violet streak with kinetic rings pulsing off him while he carries them
  bgDrag: {
    pal: [BG_VIO, BG_WHITE], hitR: 2,
    skill(kit, e, u, row) {
      const T = (row.dist || 6) / (row.speed || 34) + 0.05;
      streak(kit, u, T, 1.6);
      let acc = 0;
      kit.follow(u, T, (t, dt) => { acc += dt; if (acc > 0.06) { acc = 0; kit.ring(u.x + Math.cos(u.heading) * 1.2, u.z + Math.sin(u.heading) * 1.2, 1.8, BG_VIO, 0.3, 0.9); } },
        () => { if (u.alive) { claws(kit, u.x + Math.cos(u.heading) * 1.4, u.z + Math.sin(u.heading) * 1.4, u.heading, 3.4); kinetic(kit, u.x, u.z, 2.6); } });
      kit.flash(u.x, 1.4, u.z, BG_VIO, 30, 0.2);
      return true;
    },
  },
  // Vương Chi Thú Liệp: he vanishes into ink; every cut is three claw slashes across the foe and a kinetic ring, the last one
  // huge with a white flash and an ink burst
  bgHunt: {
    pal: [BG_VIO, BG_WHITE], hitR: 2,
    skill(kit, e, u) {
      sigil(kit, u.x, u.z, 4.6, BG_INK, { c2: BG_VIO, n: 5, m: 2, ticks: 10, inner: 0.5, fill: 0.75, w: 0.12, life: 1.0, rev: 0.06, spin: -2.5, alpha: 0.95 });
      sigil(kit, u.x, u.z, 5.0, BG_VIO, { c2: BG_WHITE, n: 0, ticks: 20, inner: 0.88, fill: 0.15, w: 0.09, life: 0.9, rev: 0.05, spin: 1.5 });
      for (let i = 0; i < 4; i++) { const b = e.a + i * 1.571 + 0.785; claws(kit, u.x + Math.cos(b) * 3.2, u.z + Math.sin(b) * 3.2, b, 2.6, 0.6); }   // he is gone: claw marks rake out all round
      kit.puffs(u.x, 0.8, u.z, kit.N(8), BG_INK, 1.2, 2.5, 0.9, 1.5, 2.4, 0.5, 0.6, kit.K.SMOKE, 1);
      kit.flash(u.x, 2, u.z, BG_VIO, 40, 0.25);
      return true;
    },
    flurry(kit, e, u, row) {
      const last = e.step >= (row.n || 7), a = Math.atan2(e.z - u.z, e.x - u.x);
      claws(kit, e.x, e.z, a, last ? 4.6 : 3.2, last ? 0.5 : 0.35);
      kinetic(kit, e.x, e.z, last ? 3.4 : 2.0);
      if (last) { burst(kit, e.x, e.z, 3.2, BG_VIO, BG_WHITE, { life: 0.5 }); kit.flash(e.x, 2, e.z, BG_WHITE, 50, 0.3); kit.kick(e.x, e.z, 0.6); }
      trail(kit, (t) => (t < 0.12 && u.alive ? [u.x, 0.8, u.z] : null), 1.0, BG_VIO, 0.45, { c2: BG_INK, len: 10 });
      return true;
    },
  },
};
