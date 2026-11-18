// Looks, kit lane k8: Kurumi (vesau), kit ported from the owner's clip (see data.js). Render only (see looks.js for the hooks).
// Clip notes (bilibili BV1Kp4y1b7i6 p61 "58.时光女神", gameplay 12-68 s):
//   Q 时光守护: an amber glass sphere stands where she put it (a summoned post with its own name plate), a pale gold glow round it.
//   E 时间干扰: a crimson bolt; the foe it hits wears a red clock face with ticking hands over it while it sleeps.
//   R 时光回溯: a gold time spiral winds round every ally in reach; when it ends the hp snaps back.
// One main colour (amber gold) and one accent (crimson, the sleep clock).
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, sigil, shell, trail, burst } from './lookkit.js';
import { ribbonMesh, fillRibbon } from './looks-b5.js';

const R = (a, b) => a + Math.random() * (b - a);
const keep = (g) => { g.userData.keep = true; return g; };
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
function fadeAll(g, k) { g.traverse((m) => { if (m.material) { if (m.userData.op === undefined) m.userData.op = m.material.opacity; m.material.opacity = m.userData.op * k; } }); }
function order(g, n) { g.traverse((m) => { m.frustumCulled = false; if (m.material) m.renderOrder = n + (m.material.blending === THREE.AdditiveBlending ? 0 : 1); }); return g; }
const flatShape = (P) => { const s = new THREE.Shape(); s.moveTo(P[0][0], P[0][1]); for (const p of P.slice(1)) s.lineTo(p[0], p[1]); return keep(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)); };

const KR_GOLD = C(2.6, 1.75, 0.4), KR_AMB = C(2.6, 1.3, 0.25), KR_RED = C(2.6, 0.22, 0.32), KR_WHITE = C(2.6, 2.35, 1.8), KR_LEAF = C(1.2, 2.3, 0.6);
const discGeo = keep(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)), annGeo = keep(new THREE.RingGeometry(0.88, 1, 56).rotateX(-Math.PI / 2));
const tickGeo = keep(new THREE.CircleGeometry(0.045, 12).rotateX(-Math.PI / 2)), longTick = flatShape([[-0.16, 0], [0, 0.07], [0.16, 0], [0, -0.07]]);
const hourGeo = flatShape([[-0.1, 0], [0, 0.07], [0.5, 0], [0, -0.07]]), minGeo = flatShape([[-0.12, 0], [0, 0.05], [0.82, 0], [0, -0.05]]);
// a clock face lying flat: dial, rim, twelve ticks, two hands (userData.hour / min); moved here from looks-b6 with the old kit
function clock(face, ink, faceA = 0.8) {
  const g = new THREE.Group(), im = basic(ink, false, 1);
  g.add(new THREE.Mesh(discGeo, basic(face, false, faceA)));
  const rim = new THREE.Mesh(annGeo, im); rim.position.y = 0.01; g.add(rim);
  for (let i = 0; i < 12; i++) { const b = i / 12 * 6.283, t = new THREE.Mesh(i % 3 ? tickGeo : longTick, im); t.position.set(Math.cos(b) * (i % 3 ? 0.76 : 0.72), 0.02, Math.sin(b) * (i % 3 ? 0.76 : 0.72)); t.rotation.y = -b; g.add(t); }
  const hour = new THREE.Mesh(hourGeo, im), min = new THREE.Mesh(minGeo, im), cap = new THREE.Mesh(discGeo, im); hour.position.y = 0.03; min.position.y = 0.04; cap.scale.setScalar(0.09); cap.position.y = 0.05;
  g.add(hour, min, cap); g.userData = { hour, min };
  return order(g, 5);
}
function tickClock(g, t, speed) { g.userData.min.rotation.y = -t * speed; g.userData.hour.rotation.y = -t * speed / 12 - 1; }
// a gold time spiral winding up round a unit, turning backwards, for `life` s (it rises in over 0.25 s)
const helixN = 44;
function spiral(kit, u, life, c) {
  const glow = ribbonMesh(helixN, c, true, 0.7), core = ribbonMesh(helixN, KR_WHITE, true, 1);
  own(kit, [glow, core], life, (t) => {
    if (!u.alive) return false;
    const pts = [], k = Math.min(1, t / 0.25);
    for (let i = 0; i < helixN; i++) { const f = i / (helixN - 1), b = t * 7 + f * 6.283 * 2.5, rr = 1.45 - 0.35 * f; pts.push([u.x + Math.cos(b) * rr, 0.15 + 2.9 * f * k, u.z + Math.sin(b) * rr]); }
    fillRibbon(glow, pts, 0.36); fillRibbon(core, pts, 0.1);
    const a = Math.min(1, (life - t) / 0.3); glow.material.opacity = 0.75 * a; core.material.opacity = a;
  });
}

export const K8 = {
  // Thời Quang Thủ Hộ: an amber glass sphere stands on a gold clock dial the size of its heal reach; the hands tick, the dial and
  // sphere fade as the post loses its hp; every half second a soft gold pulse runs out to the edge.
  krGuard: {
    pal: [KR_GOLD, KR_AMB], zones: ['totem'],
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.3, 1.3, u.z + Math.sin(e.a) * 1.3, KR_GOLD, 0.12, 1.6, 1, kit.K.STAR, 1.2); return true; },
    zoneMake(kit, z) {
      const r = z.area || 5;
      const dial = clock(0x3a2006, 0xffc860, 0.45); dial.position.set(z.x, 0.12, z.z);
      own(kit, [dial], 1e9);
      const ring = sigil(kit, z.x, z.z, r, KR_GOLD, { c2: KR_WHITE, n: 0, ticks: 12, inner: 0.9, fill: 0.04, w: 0.05, life: 1e9, rev: 0.25, spin: -0.3, alpha: 0.85 });
      const orb = shell(kit, z.x, 1.25, z.z, 1.25, KR_AMB, { c2: KR_WHITE, p: 1.6, core: 0.5, bands: 0.6, life: 1e9, grow: 0.2, alpha: 0.95 });
      kit.flash(z.x, 2, z.z, KR_GOLD, 30, 0.25);
      burst(kit, z.x, z.z, 2.2, KR_GOLD, KR_WHITE, { life: 0.4 });
      return { dial, ring, orb, r, t: 0, p: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; v.p += dt;
      const life = z.maxHp ? Math.max(0.25, z.hp / z.maxHp) : 1, k = Math.min(1, v.t / 0.25);
      v.dial.scale.setScalar(v.r * k); tickClock(v.dial, v.t, 3); fadeAll(v.dial, 0.4 + 0.6 * life);
      v.orb.scale.setScalar(0.75 + 0.25 * life);
      if (v.p >= 0.5) { v.p -= 0.5; kit.ring(z.x, z.z, v.r, KR_GOLD, 0.45, 0.5); }
      if (Math.random() < dt * 14) { const b = Math.random() * 6.283, d = v.r * Math.sqrt(Math.random()); kit.glow(z.x + Math.cos(b) * d, 0.3, z.z + Math.sin(b) * d, Math.random() < 0.3 ? KR_LEAF : KR_GOLD, 0.8, 0.3, 1, kit.K.STAR, 1, 0, R(1.5, 2.8), 0); }
    },
    zoneDrop(kit, v) { stop(v.dial); stop(v.ring); stop(v.orb); },
    hit() {},   // her own shots while the post stands stay plain
  },
  // Thời Gian Can Nhiễu: a crimson bolt with a gold wake; the foe it hits wears a red clock face, hands racing, while it sleeps.
  krSleep: {
    pal: [KR_RED, KR_GOLD], hitR: 1.6,
    // the press: a red clock dial opens upright in front of her muzzle, hands racing, and fades in half a second
    skill(kit, e, u) {
      const x = u.x + Math.cos(e.a) * 2.2, z = u.z + Math.sin(e.a) * 2.2, c = clock(0x5a0610, 0xffb0b8, 0.85);
      c.rotation.x = 0.45; c.rotation.y = -e.a + Math.PI / 2;
      own(kit, [c], 0.55, (t) => { c.position.set(x, 1.4, z); c.scale.setScalar(2.4 * Math.min(1, t / 0.08)); tickClock(c, t, 24); fadeAll(c, Math.min(1, (0.55 - t) / 0.25)); });
      kit.glow(x, 1.4, z, KR_RED, 0.15, 2.4, 1, kit.K.GLOW, 1.3); kit.flash(x, 1.6, z, KR_RED, 22, 0.15);
      return true;
    },
    shotMake(kit, s) {
      const c = clock(0x5a0610, 0xffc0c8, 0.9), v = { x: s.x, z: s.z, live: true, c, t: 0 };
      own(kit, [c], 1e9, () => v.live);
      trail(kit, () => (v.live ? [v.x, 1.3, v.z] : null), 1.0, KR_RED, 0.5, { c2: KR_GOLD, len: 16 });
      trail(kit, () => (v.live ? [v.x, 1.3, v.z] : null), 0.7, KR_GOLD, 0.4, { c2: KR_RED, len: 12, up: true });
      return v;
    },
    shot(kit, v, s, x, y, z, dt) {
      v.x = x; v.z = z; v.t += dt;
      v.c.position.set(x, 1.3, z); v.c.scale.setScalar(1.0); tickClock(v.c, v.t, 30);
      kit.glow(x, 1.3, z, KR_RED, 0.05, 1.1, 1, kit.K.GLOW, 1.1); kit.glow(x, 1.3, z, KR_WHITE, 0.04, 0.45, 1, kit.K.STAR, 1);
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.live = false; kit.sparks(x, 1.3, z, kit.N(8), KR_RED, 7, 0.3, 0.05, 0.5, 8); },
    hit(kit, e) {
      const o = kit.match && kit.match.units[e.id];
      if (!o || !(o.locT > 0)) return;   // only the blow that put it to sleep (her shots right after are plain hits)
      const c = clock(0x5a0610, 0xffb0b8, 0.9); c.rotation.x = 0.35;
      kit.flash(e.x, 2, e.z, KR_RED, 25, 0.2);
      own(kit, [c], 4.2, (t) => {
        const x = o ? o.x : e.x, z = o ? o.z : e.z;
        c.position.set(x, 3.0, z); c.scale.setScalar(2.6 * Math.min(1, t / 0.1)); tickClock(c, t, 10);
        if (t > 0.3 && o && !(o.locT > 0)) return false;   // woken: the dial goes at once
        fadeAll(c, Math.min(1, (4.2 - t) / 0.3));
      });
      return true;
    },
  },
  // Thời Quang Hồi Tố: a gold clock opens at her feet and runs backwards; a gold time spiral winds round every ally marked; when the
  // mark ends (2 s) each one flashes gold as its hp snaps back.
  krRewind: {
    pal: [KR_GOLD, KR_AMB],
    skill() { return true; },
    hit() {},
    rewind(kit, e, u, row) {
      const m = kit.match, r = e.r || 8, d = (row && row.fwd) || 2;
      const c = clock(0x3a1a06, 0xffc850, 0.7); c.position.set(e.x, 0.13, e.z);
      own(kit, [c], 1.5, (t) => { c.scale.setScalar(4.2 * Math.min(1, t / 0.15)); tickClock(c, -t, 18); fadeAll(c, Math.min(1, (1.5 - t) / 0.35)); });
      sigil(kit, e.x, e.z, r, KR_GOLD, { c2: KR_WHITE, n: 0, ticks: 24, inner: 0.94, fill: 0.03, w: 0.05, life: 0.9, rev: 0.2, spin: -1.2, alpha: 0.8 });
      kit.flash(e.x, 1.6, e.z, KR_GOLD, 30, 0.3);
      if (m) for (const a of m.units) {
        if (!a.alive || a.team !== u.team || Math.hypot(a.x - e.x, a.z - e.z) > r) continue;
        spiral(kit, a, d, KR_AMB);
        kit.follow(a, d, () => {}, () => {
          if (!a.alive) return;
          burst(kit, a.x, a.z, 1.8, KR_GOLD, KR_WHITE, { life: 0.4 });
          kit.flash(a.x, 1.5, a.z, KR_GOLD, 20, 0.2);
          for (let i = 0; i < kit.N(10); i++) { const b = Math.random() * 6.283, q = R(0.3, 1.3); kit.glow(a.x + Math.cos(b) * q, R(0.3, 1.4), a.z + Math.sin(b) * q, i % 3 ? KR_GOLD : KR_LEAF, R(0.6, 0.9), 0.28, 1, kit.K.STAR, 1, 0, R(1.5, 3), 0); }
        });
      }
      return true;
    },
  },
};
