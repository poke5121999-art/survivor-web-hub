// Looks, batch 2: Sam Thép, Bọ Hung, Kỳ Nhông, Bướm Đêm, Hắc Hổ (Kaneki: looks-k13.js). Render only (see looks.js for the hooks).
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP.md):
//   万磁之王 p86 (Sam Thép): magenta-red magnetic loops round the targets with a blue sphere inside, a pink orb round himself, a
//     thin red range ring, steel girders crashing in with a red-white flash.
//   赛亚 p31 (Bọ Hung): gold flame aura, yellow-white ki blasts, a gold ring on the target, a blue-white sphere crackling.
//   炎龙王 p78 (Kỳ Nhông): a whirling ring of fire round him, a fan of five fire jets, an orange reticle.
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

// ---- Kỳ Nhông (fire dragon king): a whirling ring of fire, jets of flame, a fist of fire -----------------------------------
const KY_FIRE = C(2.7, 0.75, 0.08), KY_GOLD = C(2.7, 1.8, 0.35), KY_DARK = C(0.5, 0.24, 0.0);
// a flat ring of flame round (x, z) turning: flame glows along an arc that sweeps round, thicker on one side (a spiral)
function fireRing(kit, at, r, life, spin = 7) {
  let a0 = Math.random() * 6.283;
  kit.anims.push({ t: 0, step(dt) { this.t += dt; const p = at(this.t); if (!p) return false; a0 += dt * spin;
    for (let i = 0; i < kit.N(6); i++) { const f = Math.random(), a = a0 + f * 4.4, rr = r * (0.75 + 0.3 * f); kit.glow(p[0] + Math.cos(a) * rr, 0.5 + f * 0.9, p[2] + Math.sin(a) * rr, f > 0.5 ? KY_FIRE : KY_GOLD, 0.25, 0.4 + 0.5 * f, 0.9, kit.K.FLAME, 1.3, -Math.sin(a) * spin * rr * 0.4, 0.8, Math.cos(a) * spin * rr * 0.4); }
    return this.t < life; }, drop() {} });
}
const kynhong = {
  // Hỏa Long Khiếu: five jets of fire fan out, each a roaring flame ribbon
  kyBreath: {
    pal: [KY_DARK, KY_GOLD], hitR: 1.8,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.2, 1.3, u.z + Math.sin(e.a) * 1.2, KY_GOLD, 0.15, 2.4, 1, kit.K.STAR, 1.3); kit.flash(u.x, 1.6, u.z, KY_FIRE, 40, 0.2); muz(kit, u, e.a, 2.0, KY_DARK, KY_GOLD); slash(kit, u.x, u.z, e.a, 7, KY_FIRE, { y: 1.0, life: 0.4, w: 1.6, span: 0.6, wake: 2.4, arcs: 1, edge: KY_GOLD }); return true; },
    shotMake(kit, s) { const v = { x: s.x, z: s.z, live: true }; trail(kit, () => (v.live ? [v.x, 1.2, v.z] : null), 3.4, KY_FIRE, 0.7, { c2: KY_DARK, len: 14 }); v.head = shell(kit, s.x, 1.2, s.z, 1.1, KY_FIRE, { c2: KY_GOLD, inv: 1.2, core: 1, life: 1e9 }); return v; },
    shot(kit, v, s, x, y, z) {
      v.x = x; v.z = z; v.head.position.set(x, 1.2, z);
      kit.glow(x, 1.2, z, KY_FIRE, 0.18, R(0.6, 0.9), 0.5, kit.K.FLAME, 1.4, R(-0.6, 0.6), R(0.3, 1.2), R(-0.6, 0.6));
      if (Math.random() < 0.4) kit.ovr.emit(x, 1.4, z, R(-0.4, 0.4), 0.8, R(-0.4, 0.4), C(0.18, 0.08, 0.05), 0.7, 0.6, 2.6, 1, -0.6, 0.3, kit.K.SMOKE);
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.live = false; stop(v.head); kit.glow(x, 1.1, z, KY_GOLD, 0.25, 1.4, 0.9, kit.K.FLAME, 1.6); },
  },
  // Hỏa Quyền Đột: a fist of fire ahead of him as he charges; where it stops, a fire burst and three claw marks burnt in the floor
  kyPunch: {
    pal: [KY_FIRE, KY_GOLD], hit() {},
    skill(kit, e, u, row) {
      let a = e.a, done = false, fist = null;
      // the road of fire the fist burns along its whole charge
      { const L = (row && row.dist) || 7, b = kit.beam(u.x, u.z, u.x + Math.cos(a) * L, u.z + Math.sin(a) * L, 3.4, KY_FIRE, 0.9, 0, 0.35); b.fade = true; }
      trail(kit, (t) => (t < 0.45 && u.alive ? [u.x, 1.0, u.z] : null), 3.6, KY_FIRE, 1.0, { c2: KY_GOLD, len: 14 });
      kit.follow(u, 0.6, (t) => {
        if (done) return;
        kit.glow(u.x + Math.cos(a) * 1.3, 1.2, u.z + Math.sin(a) * 1.3, KY_GOLD, 0.12, 1.6, 1, kit.K.FLAME, 1.2);
        if (!fist) fist = shell(kit, u.x, 1.2, u.z, 2, KY_FIRE, { c2: KY_GOLD, inv: 1.2, core: 1, life: 0.45, step: () => { fist.position.set(u.x + Math.cos(a) * 1.8, 1.2, u.z + Math.sin(a) * 1.8); } });
        kit.glow(u.x + Math.cos(a) * 1.3, 1.2, u.z + Math.sin(a) * 1.3, KY_FIRE, 0.2, 2.2, 0.8, kit.K.FLAME, 1.4);
        if (t > 0.08 && !u.dash) {
          done = true; const x = u.x + Math.cos(a) * 1.6, z = u.z + Math.sin(a) * 1.6;
          burst(kit, x, z, 3.6, KY_DARK, KY_GOLD, { life: 0.6 });
          for (const o of [-0.6, 0, 0.6]) kit.scorch(x + Math.cos(a + 1.57) * o, z + Math.sin(a + 1.57) * o, 0.9, 3, 1.6, KY_FIRE);
          kit.sparks(x, 1.2, z, kit.N(16), KY_GOLD, 12, 0.4, 0.07, 0.6, 10, Math.cos(a), Math.sin(a), 0.7); kit.flash(x, 1.6, z, KY_FIRE, 60, 0.25); kit.kick(x, z, 0.6);
        }
      });
      return true;
    },
  },
  // Long Hóa: a whirling spiral ring of fire turns round him for the five seconds, embers rising off it
  kyRing: {
    pal: [KY_FIRE, KY_GOLD], hitR: 1.8,
    skill(kit, e, u, row) {
      const d = row.dur || 5;
      // a fire dragon coils up round him: a thick flame ribbon spiralling from the floor to above his head, and a second one
      // chasing it; fire ring at the floor
      const live = (t) => u.alive && (t < 0.5 || u.tfT > 0);
      for (const ph of [0, Math.PI]) trail(kit, (t) => { if (!live(t)) return null; const a = t * 7 + ph, h = 0.4 + ((t * 1.6) % 3.2); return [u.x + Math.cos(a) * 3, h, u.z + Math.sin(a) * 3]; }, 2.6, KY_FIRE, d, { c2: KY_GOLD, len: 22 });
      // two great wings of fire spread from his back and beat for the five seconds
      for (const sd of [1, -1]) { const at = () => u.aim + Math.PI + sd * 1.3; kit.follow(u, d, (t) => { if (!live(t)) return; if (Math.random() < 0.5) { const a = at() + Math.sin(t * 6) * 0.25; for (let k = 1; k <= 4; k++) kit.glow(u.x + Math.cos(a) * k * 1.1, 1.4 + k * 0.35, u.z + Math.sin(a) * k * 1.1, k % 2 ? KY_FIRE : KY_GOLD, 0.25, 1.1 - k * 0.12, 0.9, kit.K.FLAME, 1.3); } }); slash(kit, u.x, u.z, u.aim + Math.PI + sd * 1.2, 7.5, KY_FIRE, { y: 1.6, dir: sd, life: 0.9, w: 1.5, span: 0.9, sweep: 0.25, erode: 0.35, wake: 2, edge: KY_GOLD, tilt: sd * 0.5 }); }
      kit.ring(u.x, u.z, 3.4, KY_GOLD, 0.45); kit.flash(u.x, 2, u.z, KY_FIRE, 60, 0.35); kit.scorch(u.x, u.z, 2.6, 3, 1.6, KY_FIRE);
      return true;
    },
    transform(kit, e) { if (!e.on) kit.ring(e.x, e.z, 2.6, KY_FIRE, 0.3, 0.6); return true; },
  },
};

// ---- Bướm Đêm (Doctor Strange): pink dimensions, orange rune mandalas, a pink bolt ---------------------------------------
const DS_PINK = C(2.3, 0.3, 1.6), DS_ORANGE = C(2.7, 1.0, 0.05), DS_BLUE = C(0.45, 0.95, 2.3);
// a sling-ring portal: a ring of orange sparks standing upright, facing a
function slingRing(kit, x, z, a, r, life) {
  kit.anims.push({ t: 0, step(dt) { this.t += dt; const k = Math.min(1, this.t / 0.15);
    for (let i = 0; i < kit.N(10); i++) { const b = Math.random() * 6.283, ox = Math.cos(b) * r * k, oy = Math.sin(b) * r * k; const px = x - Math.sin(a) * ox, pz = z + Math.cos(a) * ox, py = 1.4 + oy;
      kit.str.emit(px, py, pz, -Math.sin(a) * Math.cos(b + 1.57) * 4, Math.sin(b + 1.57) * 4, Math.cos(a) * Math.cos(b + 1.57) * 4, i % 3 ? DS_ORANGE : C(2.7, 2.2, 0.8), 0.18, 0.05, 0.06, 4, 0, 1); }
    return this.t < life; }, drop() {} });
}
const buomdem = {
  // Tia Bùa: an orange mandala opens at the muzzle and a pink bolt shoots through, a ribbon of pink light behind it
  dsBolt: {
    pal: [DS_PINK, DS_ORANGE], hitR: 1.8,
    skill(kit, e, u) { sigil(kit, u.x + Math.cos(e.a) * 1.2, u.z + Math.sin(e.a) * 1.2, 2.6, DS_ORANGE, { c2: DS_PINK, n: 8, m: 3, ticks: 16, life: 0.5, rev: 0.1, spin: 4, y: 1.3 }); muz(kit, u, e.a, 3.0, DS_ORANGE, C(2.7, 2.0, 0.6)); return true; },
    shotMake(kit, s) { const v = { x: s.x, z: s.z, live: true }; trail(kit, () => (v.live ? [v.x, 1.4, v.z] : null), 2.0, DS_PINK, 0.5, { c2: DS_ORANGE, len: 16 }); return v; },
    shot(kit, v, s, x, y, z) { v.x = x; v.z = z; kit.glow(x, 1.4, z, DS_PINK, 0.08, 1.2, 1, kit.K.STAR, 1); kit.glow(x, 1.4, z, DS_PINK, 0.15, 1.8, 0.6, kit.K.GLOW, 1.2); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; kit.sparks(x, 1.4, z, kit.N(8), DS_PINK, 8, 0.3, 0.05, 0.5, 8); },
  },
  // Cổng Ảo: a sling-ring portal of orange sparks opens where he stands and another where he lands; the landing blast is a pink
  // rune circle
  dsPortal: {
    pal: [DS_PINK, DS_ORANGE],
    skill() { return true; },
    warp(kit, e, u, row) {
      const a = Math.atan2(e.z - e.z0, e.x - e.x0);
      slingRing(kit, e.x0, e.z0, a, 2.2, 0.6); slingRing(kit, e.x, e.z, a, 2.2, 0.6);
      gate(kit, e.x0, e.z0, 1.9, DS_ORANGE, { life: 0.7, pane: 0x2a0818, paneA: 0.5, spin: 0.2 }); gate(kit, e.x, e.z, 1.9, DS_ORANGE, { life: 0.7, pane: 0x2a0818, paneA: 0.5, spin: -0.2 });
      for (const [px, pz] of [[e.x, e.z]]) sigil(kit, px, pz, 4.6, DS_ORANGE, { c2: C(2.7, 2.0, 0.4), n: 10, m: 3, ticks: 30, life: 0.8, rev: 0.1, spin: 5, fill: 0.25, w: 0.07 });
      burst(kit, e.x0, e.z0, 2.8, C(2.7, 1.8, 0.2), C(2.7, 2.4, 1.2), { life: 0.5 }); burst(kit, e.x, e.z, 3.4, C(2.7, 1.8, 0.2), C(2.7, 2.4, 1.2), { life: 0.6 });
      const r = (row.land && row.land.radius) || 3;
      sigil(kit, e.x, e.z, r, DS_ORANGE, { c2: C(2.7, 1.8, 0.2), n: 8, m: 3, ticks: 24, life: 0.8, rev: 0.12, spin: -3, fill: 0.3 });
      shell(kit, e.x, 1, e.z, r, DS_BLUE, { c2: DS_ORANGE, p: 1.8, core: 0.05, life: 0.4, grow: 0.08 });
      kit.flash(e.x, 1.8, e.z, DS_PINK, 40, 0.25);
      return true;
    },
  },
  // Kết Giới Đa Chiều: a pink dimension bubble with a blue rim closes over the area, an orange ten-point mandala turning inside,
  // shards of pink light drifting
  dsRealm: {
    pal: [DS_PINK, DS_ORANGE], hitR: 1.8,
    zoneMake(kit, z) {
      const d = sigil(kit, z.x, z.z, z.r * 0.8, DS_PINK, { c2: DS_BLUE, n: 0, ticks: 0, inner: 0, fill: 1.0, life: 1e9, rev: 0.3, alpha: 0.6, y: 0.1 });
      const s1 = sigil(kit, z.x, z.z, z.r * 0.6, DS_ORANGE, { c2: DS_ORANGE, n: 0, ticks: 40, inner: 0, life: 1e9, rev: 0.4, spin: 0.8, fill: 0.15, w: 0.03, alpha: 0.6 });
      const s2 = sigil(kit, z.x, z.z, z.r * 0.45, DS_PINK, { c2: DS_ORANGE, n: 0, ticks: 30, inner: 0.7, life: 1e9, rev: 0.3, spin: -1.6, y: 0.2, w: 0.08 });
      // two mandalas standing in the air at the sides of the realm, facing the camera
      // diamond shards of a broken dimension drift round inside the bubble
      const st = [0, 1, 2, 3, 4, 5].map((i) => { const m = sigil(kit, z.x, z.z, 1.3, DS_ORANGE, { c2: DS_PINK, n: 4, m: 1, ticks: 0, inner: 0, life: 1e9, rev: 0.1, spin: 3, y: 1.8 + (i % 3) * 0.7, fill: 0.4, w: 0.08 }); m.userData.i = i; return m; });
      // the mirror dimension cracks: bright fault lines run out from the centre to the rim
      const cracks = []; for (let i = 0; i < 9; i++) { const a = i * 0.698 + 0.2 * Math.sin(i * 7), r1 = z.r * (0.75 + 0.2 * ((i * 5) % 3) / 2); const b = kit.beam(z.x, z.z, z.x + Math.cos(a) * r1, z.z + Math.sin(a) * r1, 0.5, i % 2 ? DS_ORANGE : C(2.6, 2.2, 2.4), 1e9, 2, 0.15); cracks.push(b); }
      return { d, s1, s2, st, cracks };
    },
    zone(kit, v, z, dt) { v.t = (v.t || 0) + dt; v.st.forEach((m) => { const i = m.userData.i, a = v.t * 0.9 + i * 1.047, r = z.r * (0.35 + 0.15 * (i % 2)); m.position.x = z.x + Math.cos(a) * r; m.position.z = z.z + Math.sin(a) * r; m.position.y = 0.3; });
      if (Math.random() < dt * 12) { const a = Math.random() * 6.283, r = Math.random() * z.r * 0.8; kit.glow(z.x + Math.cos(a) * r, R(0.5, 3), z.z + Math.sin(a) * r, Math.random() < 0.5 ? DS_PINK : DS_ORANGE, 0.8, 0.35, 0.9, kit.K.SPARK, 1, 0, 0.6, 0); } },
    zoneDrop(kit, v) { stop(v.d); stop(v.s1); stop(v.s2); v.st.forEach(stop); v.cracks.forEach((b) => kit.endBeam(b)); },
  },
};

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

export const B2 = { ...samthep, ...kynhong, ...buomdem, ...hacho };   // Mực Ma (Kaneki) moved to looks-k13.js (kit lane K13)
