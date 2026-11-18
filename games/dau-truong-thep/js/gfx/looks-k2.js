// Looks, kit lane K2: Athena (kit ported from the owner's clip, see data.js). Render only (see looks.js for the hooks).
// Clip notes (bilibili BV1Kp4y1b7i6 p69 "66.雅典娜", gameplay 23-56 s):
//   every cast: a thin gold circle round her (the 6 m heal reach) and a gold ring with four small charms turning round her
//     while her own heal runs; the healed ally sparkles green-gold.
//   Q 战争艺术: an orange lock-on circle with crosshair marks rides the nearest foe; after 1 s a gold column of light drops on
//     it, a white-gold flash, a gold ring on the floor and gold lightning crackling out.
//   E 圣盾庇佑: a pale blue-white bubble round the ally with a short gold shaft of light.
//   R 英雄不朽: a gold column of light lands on the ally; the blessing is a gold ring with charms round it.
// One main colour (gold) and one accent (pale sky blue, the shield); the lock-on is a deeper orange gold.
import { C, stop, sigil, shell, pillar, burst } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);
const GOLD = C(2.4, 1.35, 0.25), WHITE = C(2.6, 2.25, 1.5), LOCK = C(2.5, 0.75, 0.08), SKY = C(0.45, 1.25, 2.7), LEAF = C(1.3, 2.2, 0.5);

// The passive at every press: the thin 6 m gold circle sweeps round her, a gold ring with four charms turns round her for the
// 2 s of her own heal, a brief gold thread to the ally it healed (the most hurt one in reach, as the sim picks it).
function castHeal(kit, u) {
  const P = u.def.passive, r = (P && P.r) || 6, d = (P && P.selfDur) || 2;
  kit.ring(u.x, u.z, r, GOLD, 0.7, 0.55);
  sigil(kit, u.x, u.z, 1.55, GOLD, { c2: WHITE, n: 0, ticks: 0, inner: 0.78, fill: 0.04, w: 0.05, life: d, rev: 0.2, follow: u, alpha: 0.85 });
  kit.follow(u, d, (t) => {
    for (let i = 0; i < 4; i++) {
      const a = t * 2.4 + i * 1.571, x = u.x + Math.cos(a) * 1.5, z = u.z + Math.sin(a) * 1.5;
      kit.glow(x, 0.9, z, GOLD, 0.06, 0.55, 0.9, kit.K.GLOW, 1);
      kit.glow(x, 0.9, z, WHITE, 0.05, 0.22, 1, kit.K.STAR, 1);
    }
  });
  let best = null, bf = 2;
  for (const o of kit.match.units) {
    if (o === u || o.team !== u.team || !o.alive || Math.hypot(o.x - u.x, o.z - u.z) > r) continue;
    const f = o.hp / o.maxHp;
    if (f < 1 && f < bf) { bf = f; best = o; }
  }
  if (best) {
    const b = kit.beam(u.x, u.z, best.x, best.z, 0.3, GOLD, 0.35, 2, 1.3); b.fade = true;
    for (let i = 0; i < kit.N(8); i++) { const a = Math.random() * 6.283, q = R(0.2, 1); kit.glow(best.x + Math.cos(a) * q, R(0.3, 1.2), best.z + Math.sin(a) * q, i % 2 ? LEAF : GOLD, R(0.6, 0.9), 0.26, 1, kit.K.STAR, 1, 0, R(1.5, 2.6), 0); }
  }
}

// gold lightning: a few short jagged segments crackling out from a point along the floor
function crackle(kit, x, z, n, len) {
  for (let i = 0; i < n; i++) {
    let a = Math.random() * 6.283, px = x, pz = z;
    for (let k = 0; k < 3; k++) {
      a += R(-0.7, 0.7); const l = len * R(0.25, 0.45), qx = px + Math.cos(a) * l, qz = pz + Math.sin(a) * l;
      const b = kit.beam(px, pz, qx, qz, 0.2, k ? GOLD : WHITE, R(0.3, 0.5), 3, R(0.4, 1.4)); b.fade = true;
      px = qx; pz = qz;
    }
  }
}

export const K2 = {
  // Chiến Tranh Nghệ Thuật: an orange-gold lock circle with four crosshair marks rides the locked foe and closes in over the
  // second; then a gold column of light drops on it, a white-gold flash, a gold floor ring and gold lightning.
  atLock: {
    pal: [GOLD, WHITE], hitR: 2.2,
    zones: ['strike'],
    skill(kit, e, u) {
      castHeal(kit, u);
      const x = u.x + Math.cos(e.a) * 1.4, z = u.z + Math.sin(e.a) * 1.4;
      kit.glow(x, 1.4, z, WHITE, 0.12, 1.4, 1, kit.K.STAR, 1.3); kit.flash(x, 1.6, z, GOLD, 22, 0.15);
      return true;
    },
    zoneMake(kit, z) {
      const T = z.total || z.delay || 1, r = Math.max(2.2, z.r);
      const ring = sigil(kit, z.x, z.z, r, LOCK, { c2: GOLD, n: 0, ticks: 4, inner: 0.3, fill: 0.03, w: 0.05, life: 1e9, rev: 0.15, spin: 1.4 });
      const core = sigil(kit, z.x, z.z, r * 0.42, LOCK, { c2: WHITE, n: 4, m: 1, ticks: 0, inner: 0, fill: 0, w: 0.09, life: 1e9, rev: 0.1, spin: -2.2 });
      return { ring, core, T, r, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; const k = Math.min(1, v.t / v.T);
      const s = v.r * (1.45 - 0.45 * k);
      v.ring.position.set(z.x, 0.15, z.z); v.ring.scale.setScalar(s);
      v.core.position.set(z.x, 0.16, z.z); v.core.scale.setScalar(v.r * 0.42 * (1.2 - 0.2 * k));
      // four crosshair marks on the circle, turning with it
      for (let i = 0; i < 4; i++) { const a = v.t * 1.4 + i * 1.571; kit.glow(z.x + Math.cos(a) * s, 0.4, z.z + Math.sin(a) * s, LOCK, 0.05, 0.5, 0.9, kit.K.STAR, 1); }
      // the light gathering above it in the last half second
      if (k > 0.5 && Math.random() < dt * 30) kit.glow(z.x + R(-0.3, 0.3), R(4, 9), z.z + R(-0.3, 0.3), GOLD, 0.25, 0.7, 0.8, kit.K.GLOW, 1.2, 0, -14, 0);
    },
    zoneDrop(kit, v) { stop(v.ring); stop(v.core); },
    land(kit, e) {
      pillar(kit, e.x, e.z, 1.6, GOLD, { c2: WHITE, h: 15, life: 1.0, grow: 0.08, drop: true, rings: 1.5, narrow: true });
      pillar(kit, e.x, e.z, 0.55, WHITE, { c2: WHITE, h: 15, life: 0.6, grow: 0.06, drop: true });
      sigil(kit, e.x, e.z, 3.2, GOLD, { c2: WHITE, n: 0, ticks: 16, inner: 0.62, fill: 0.3, w: 0.07, life: 1.0, rev: 0.08, spin: 1.0 });
      kit.glow(e.x, 1.2, e.z, WHITE, 0.2, 3.4, 1, kit.K.STAR, 1.4);
      burst(kit, e.x, e.z, 3.2, GOLD, WHITE, { life: 0.5 });
      kit.ring(e.x, e.z, 2.8, GOLD, 0.6, 0.9);
      crackle(kit, e.x, e.z, kit.N(6), 4.6);
      kit.sparks(e.x, 1.2, e.z, kit.N(14), GOLD, 9, 0.45, 0.06, 0.8, 10);
      kit.flash(e.x, 2.5, e.z, GOLD, 45, 0.25); kit.kick(e.x, e.z, 0.5);
      return true;
    },
  },
  // Thánh Thuẫn Tí Hựu: a short gold shaft of light on the ally, then a pale blue-white bubble with a gold rim holds round it
  // for the shield's 2 s; whatever held it (stun, slow, root) lifts off as white motes.
  atAegis: {
    pal: [SKY, WHITE],
    skill(kit, e, u) { castHeal(kit, u); return true; },
    bless(kit, e, u, row) {
      const o = kit.match.units[e.to]; if (!o) return true;
      const d = row.dur || 2;
      pillar(kit, o.x, o.z, 0.9, GOLD, { c2: WHITE, h: 12, life: 1.0, grow: 0.08, drop: true, rings: 1 });
      shell(kit, o.x, 1.0, o.z, 2.75, SKY, { c2: C(0.3, 0.9, 2.4), p: 1.1, core: 0.42, bands: 0.8, follow: o, life: d, grow: 0.16, alpha: 1 });
      shell(kit, o.x, 1.0, o.z, 2.85, GOLD, { c2: GOLD, p: 5, core: 0, follow: o, life: d, grow: 0.16, alpha: 0.9 });
      sigil(kit, o.x, o.z, 3.0, GOLD, { c2: SKY, n: 0, ticks: 12, inner: 0.84, fill: 0.2, w: 0.06, life: d, rev: 0.2, follow: o, spin: 0.8 });
      kit.glow(o.x, 1.2, o.z, WHITE, 0.25, 2.6, 0.9, kit.K.GLOW, 1.3);
      for (let i = 0; i < kit.N(12); i++) { const a = Math.random() * 6.283, q = R(0.4, 1.4); kit.glow(o.x + Math.cos(a) * q, R(0.3, 1.5), o.z + Math.sin(a) * q, i % 3 ? WHITE : SKY, R(0.6, 1), 0.28, 1, kit.K.STAR, 1, 0, R(2, 3.5), 0); }
      kit.flash(o.x, 2.5, o.z, SKY, 30, 0.25);
      if (u !== o) { const b = kit.beam(u.x, u.z, o.x, o.z, 0.35, SKY, 0.3, 2, 1.4); b.fade = true; }
      return true;
    },
  },
  // Anh Hùng Bất Hủ: a wide gold column of light lands on the ally, a gold seal with an eight-point star opens under it, and
  // for the 3 s blessing a gold ring with four charms turns round it, light rising; when it ends the heal blooms green-gold.
  atHero: {
    pal: [GOLD, WHITE],
    skill(kit, e, u) { castHeal(kit, u); return true; },
    bless(kit, e, u, row) {
      const o = kit.match.units[e.to]; if (!o) return true;
      const d = row.undying || row.dur || 3;
      pillar(kit, o.x, o.z, 1.7, GOLD, { c2: WHITE, h: 16, life: 1.1, grow: 0.12, drop: true, rings: 2 });
      pillar(kit, o.x, o.z, 0.6, WHITE, { c2: WHITE, h: 16, life: 0.7, grow: 0.1, drop: true });
      sigil(kit, o.x, o.z, 3.4, GOLD, { c2: WHITE, n: 8, m: 3, ticks: 24, inner: 0.5, fill: 0.12, w: 0.05, life: 1.6, rev: 0.25, spin: 0.5, alpha: 0.95 });
      kit.ring(o.x, o.z, 3.6, GOLD, 0.7, 0.8);
      kit.flash(o.x, 3, o.z, GOLD, 45, 0.3);
      sigil(kit, o.x, o.z, 1.7, GOLD, { c2: WHITE, n: 0, ticks: 8, inner: 0.8, fill: 0.05, w: 0.06, life: d, rev: 0.2, follow: o, spin: 1.2 });
      kit.follow(o, d, (t, dt) => {
        for (let i = 0; i < 4; i++) { const a = -t * 2 + i * 1.571, x = o.x + Math.cos(a) * 1.7, z = o.z + Math.sin(a) * 1.7; kit.glow(x, 1.1, z, GOLD, 0.06, 0.7, 0.95, kit.K.GLOW, 1); kit.glow(x, 1.1, z, WHITE, 0.05, 0.28, 1, kit.K.STAR, 1); }
        if (Math.random() < dt * 14) { const a = Math.random() * 6.283, q = R(0.3, 1.5); kit.glow(o.x + Math.cos(a) * q, 0.3, o.z + Math.sin(a) * q, GOLD, 0.9, 0.28, 1, kit.K.STAR, 1, 0, R(2, 3.5), 0); }
      }, () => {
        if (!o.alive) return;
        burst(kit, o.x, o.z, 2.6, LEAF, GOLD, { life: 0.5 });
        for (let i = 0; i < kit.N(14); i++) { const a = Math.random() * 6.283, q = R(0.3, 1.4); kit.glow(o.x + Math.cos(a) * q, R(0.3, 1.4), o.z + Math.sin(a) * q, i % 2 ? LEAF : GOLD, R(0.7, 1), 0.3, 1, kit.K.STAR, 1, 0, R(2, 3.5), 0); }
      });
      if (u !== o) { const b = kit.beam(u.x, u.z, o.x, o.z, 0.4, GOLD, 0.35, 2, 1.6); b.fade = true; }
      return true;
    },
  },
};
