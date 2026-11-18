// Looks, batch 2: Sam Thép, Bọ Hung, Kỳ Nhông, Bướm Đêm, Hắc Hổ (Kaneki: looks-k13.js). Render only (see looks.js for the hooks).
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP.md):
//   万磁之王 p86 (Sam Thép): magenta-red magnetic loops round the targets with a blue sphere inside, a pink orb round himself, a
//     thin red range ring, steel girders crashing in with a red-white flash.
//   赛亚 p31 (Bọ Hung): gold flame aura, yellow-white ki blasts, a gold ring on the target, a blue-white sphere crackling.
//   炎龙王 p78 (Kỳ Nhông = Natsu): its looks moved to looks-k16.js with the kit ported from the clip (kit lane k16).
//   至尊法师 p66 (Bướm Đêm): pink dimension bubbles with a blue rim, orange rune mandalas, a pink bolt.
//   Mực Ma, Hắc Hổ: no part (梦魇 p83 is shadow clones and a clock, 钢爪 p29 a blue claw streak); built from the descriptions:
//     a ghost squid of ink and teal light; a black tiger of amber flame, claw marks and blood red.
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, slash, sigil, shell, pillar, trail, strands, spikes, burst, gate } from './lookkit.js';
// a muzzle flash only: the caster gets no blob, the look's own shape carries it
const muz = (kit, u, a, r, c, c2) => { const x = u.x + Math.cos(a) * 1.4, z = u.z + Math.sin(a) * 1.4; kit.glow(x, 1.3, z, c2, 0.12, 1.6, 1, kit.K.STAR, 1.3); kit.flash(x, 1.5, z, c, 25, 0.15); };

const R = (a, b) => a + Math.random() * (b - a);
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: !add, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });

// ---- Sam Thép (Magneto, recoloured steel and electric): steel girders, blue-white field loops and arcs, an indigo core ---------------------------------------------
// steel horseshoe crab: electric blue arcs (MG_RED), blue-white sparks (MG_PINK), a deep indigo core (MG_BLUE)
const MG_RED = C(0.3, 0.8, 2.6), MG_PINK = C(1.9, 2.3, 2.6), MG_BLUE = C(0.25, 0.3, 2.2);
const girderGeo = new THREE.BoxGeometry(1.7, 0.22, 0.3), glowGeo = new THREE.BoxGeometry(1.85, 0.34, 0.42), postGeo2 = new THREE.BoxGeometry(0.26, 3.2, 0.26).translate(0, 1.6, 0), postGlow = new THREE.BoxGeometry(0.4, 3.3, 0.4).translate(0, 1.6, 0);
for (const g of [girderGeo, glowGeo, postGeo2, postGlow]) g.userData.keep = true;
function girder() { const g = new THREE.Group(); g.add(new THREE.Mesh(girderGeo, basic(0x8f98a3, false)), new THREE.Mesh(glowGeo, basic(MG_RED, true, 0.55))); return g; }
// magnetic field loops: thin ellipses standing round a centre, turning slowly
const loopGeo = new THREE.TorusGeometry(1, 0.035, 4, 48); loopGeo.userData.keep = true;
function loops(n, r, h, c) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(loopGeo, basic(c, true, 0.85)); m.scale.set(r * (0.55 + 0.45 * (i % 3) / 2), h, 1); m.rotation.y = (i / n) * Math.PI; m.position.y = h * 0.55; g.add(m); }
  return g;
}
const samthep = {
};

// Bướm Đêm (Doctor Strange): his looks moved to looks-k12.js with the kit ported from the clip (lane k12).

// ---- Hắc Hổ (black tiger): amber flame, claw marks, blood red ---------------------------------------------------------------
const HH_AMB = C(2.6, 1.05, 0.12), HH_RED = C(2.3, 0.12, 0.08), HH_SOOT = C(0.06, 0.03, 0.02), HH_DARK = C(0.3, 0.1, 0.02);
// three parallel claw slashes across (x, z) along angle a
function claws(kit, x, z, a, len, c, life, y = 0.2) {
  for (const o of [-0.55, 0, 0.55]) { const ox = Math.cos(a + 1.57) * o, oz = Math.sin(a + 1.57) * o, b = kit.beam(x + ox - Math.cos(a) * len / 2, z + oz - Math.sin(a) * len / 2, x + ox + Math.cos(a) * len / 2, z + oz + Math.sin(a) * len / 2, 1.5, c, life, 2, y); b.fade = true; }
}
const hacho = {
  // Vồ: an amber-and-soot streak through the air; he lands roaring: a shock ring and three claw marks torn into the floor
  hhPounce: {
    pal: [HH_DARK, HH_AMB], hitR: 1.8,
    skill() { return true; },
    leap(kit, e, u) {
      const a = Math.atan2(e.z - e.z0, e.x - e.x0), dur = e.dur || 0.4;
      claws(kit, (e.x0 + e.x) / 2, (e.z0 + e.z) / 2, a + 1.2, 6.5, HH_RED, 0.8, 1.6);
      slash(kit, e.x0, e.z0, a, 6.5, HH_AMB, { y: 1.4, life: 0.6, w: 1.0, span: 1.1, travel: (Math.hypot(e.x - e.x0, e.z - e.z0) || 4) / dur * 0.8, sweep: 0.15, edge: HH_RED });
      trail(kit, (t) => (t < dur && u.alive ? [u.x, 1.6, u.z] : null), 3.2, HH_RED, dur + 0.4, { c2: HH_AMB, len: 14 });
      sigil(kit, e.x, e.z, 3.2, HH_AMB, { c2: HH_RED, n: 3, m: 1, ticks: 9, inner: 0, life: dur + 0.3, rev: dur, fill: 0.12, w: 0.05 });
      kit.anims.push({ t: 0, step(dt) { this.t += dt; if (this.t < dur) return true;
        claws(kit, e.x, e.z, a + 0.5, 6, HH_RED, 0.9, 0.18); for (const o of [-0.55, 0, 0.55]) kit.scorch(e.x + Math.cos(a + 2.07) * o, e.z + Math.sin(a + 2.07) * o, 0.7, 3, 1.4, HH_AMB);
        burst(kit, e.x, e.z, 4.2, HH_DARK, HH_RED, { life: 0.6 });
        kit.ring(e.x, e.z, 3.4, HH_AMB, 0.4); kit.ring(e.x, e.z, 2.2, HH_RED, 0.3, 0.7); kit.puffs(e.x, 0.3, e.z, kit.N(8), HH_SOOT, 1, 4, 0.8, 1, 2.2, 0.4, 0.6, kit.K.SMOKE, 3);
        kit.flash(e.x, 1.6, e.z, HH_AMB, 50, 0.25); kit.kick(e.x, e.z, 0.5); return false; }, drop() {} });
      return true;
    },
  },
  // Cuồng Nộ: blood rage for four seconds: a red-amber haze round him, drops of blood drawn in, two amber eyes burning above
  hhRage: {
    pal: [HH_RED, HH_AMB], hitR: 1.8,
    skill(kit, e, u, row) {
      const d = row.dur || 4;
      shell(kit, u.x, 1.1, u.z, 3, HH_RED, { c2: HH_AMB, p: 1.0, core: 0.4, bands: 2.5, follow: u, life: d, grow: 0.15, pulse: 2.5 });

      kit.ring(u.x, u.z, 2.6, HH_RED, 0.4); kit.flash(u.x, 2, u.z, HH_RED, 40, 0.3);
      sigil(kit, u.x, u.z, 3.4, HH_RED, { c2: HH_AMB, n: 3, m: 1, ticks: 6, inner: 0, life: d, rev: 0.2, follow: u, spin: 1, fill: 0.35, alpha: 0.8 });
      kit.follow(u, d, () => {
        if (Math.random() < 0.6) { const a = Math.random() * 6.283, r = R(2, 3); kit.str.emit(u.x + Math.cos(a) * r, R(0.4, 1.8), u.z + Math.sin(a) * r, -Math.cos(a) * r * 3, 0, -Math.sin(a) * r * 3, HH_RED, 0.3, 0.07, 0.05, 0, 0, 1); }
        const ax = Math.cos(u.aim), az = Math.sin(u.aim);
        for (const s of [-0.3, 0.3]) kit.glow(u.x + ax * 0.6 - az * s, 2.3, u.z + az * 0.6 + ax * s, HH_AMB, 0.05, 0.45, 1, kit.K.STAR, 1);
      });
      return true;
    },
  },
  // Dấu Tử: a red claw sigil hangs over the marked one for five seconds: three slashes and a ring of tiger stripes under it
  hhMark: {
    pal: [HH_RED, HH_AMB],
    skill() { return true; },
    mark(kit, e, u, row) {
      const o = kit.match.units[e.target]; if (!o) return true;
      burst(kit, o.x, o.z, 4.2, HH_RED, HH_AMB, { life: 0.8 });
      const d = row.dur || 5;
      sigil(kit, o.x, o.z, 7, HH_RED, { c2: HH_AMB, n: 3, m: 1, ticks: 9, inner: 0, life: d, rev: 0.15, spin: 0.5, follow: o, fill: 0.35, w: 0.06 });
      claws(kit, o.x, o.z, 0.6, 4.2, HH_RED, 0.8, 2.4);
      kit.follow(o, d, (t) => { if (Math.random() < 0.08) claws(kit, o.x, o.z, 0.6, 1.6, HH_RED, 0.25, 2.6); if (Math.random() < 0.3) kit.glow(o.x, 2.6, o.z, HH_RED, 0.2, 0.9, 0.7, kit.K.GLOW, 1.2); });
      kit.flash(o.x, 2, o.z, HH_RED, 50, 0.25);
      return true;
    },
  },
};

export const B2 = { ...samthep, ...hacho };   // Mực Ma (Kaneki) moved to looks-k13.js (kit lane K13)
