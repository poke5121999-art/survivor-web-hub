// Looks, batch 6: Bọ Cạp, Lươn Điện, Nhện Thép, Băng Nha (Ve Sầu moved to looks-k8.js, Kiếm Thần to looks-k15.js with his ported kit). Render only (see looks.js for the hooks).
// Each look's own shape carries it; bursts are only brief flashes where blows land.
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP.md):
//   毒蝎女王 p52 (Bọ Cạp): magenta-violet sting streaks, a violet swirl round her when she spins, magenta poison bubbles on
//     the foes she hits.
//   电魂 p51 (Lươn Điện): violet-white plasma orbs crackling, a cyan electric bubble round the caster, a blue storm cloud.
//   米卡莎 p56 (Nhện Thép = Mikasa): its looks moved to looks-k18.js with the kit ported from the clip (kit lane K18).
//   冰雪女王 p81 (Băng Nha): white frost arcs flying out, a big ice-blue frost dome with snow swirling, an ice prison.
//   李白 p65 (Kiếm Thần): red flame swords falling in fire columns, white blades ringing the caster, a red flying sword.
import * as THREE from '../../vendor/three.module.min.js';
import { orbPos } from '../sim.js';
import { C, own, stop, sigil, shell, pillar, trail, burst } from './lookkit.js';
import { zap, forks, ribbonMesh, fillRibbon } from './looks-b5.js';

const R = (a, b) => a + Math.random() * (b - a);
const keep = (g) => { g.userData.keep = true; return g; };
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
function fadeAll(g, k) { g.traverse((m) => { if (m.material) { if (m.userData.op === undefined) m.userData.op = m.material.opacity; m.material.opacity = m.userData.op * k; } }); }
function order(g, n) { g.traverse((m) => { m.frustumCulled = false; if (m.material) m.renderOrder = n + (m.material.blending === THREE.AdditiveBlending ? 0 : 1); }); return g; }
const WHITE = C(2.4, 2.4, 2.5);
const discGeo = keep(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)), annGeo = keep(new THREE.RingGeometry(0.88, 1, 56).rotateX(-Math.PI / 2));
const ballGeo = keep(new THREE.SphereGeometry(0.4, 12, 8));
const flatShape = (P) => { const s = new THREE.Shape(); s.moveTo(P[0][0], P[0][1]); for (const p of P.slice(1)) s.lineTo(p[0], p[1]); return keep(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)); };

// ---- Lươn Điện: electric eels, navy bodies with cyan light, violet plasma --------------------------------------------
const LD_CY = C(0.4, 1.6, 2.6), LD_VIO = C(1.5, 0.5, 2.6), LD_NAVY = 0x0a2238, LD_WHITE = C(2.2, 2.5, 2.6);
const eelHead = keep(new THREE.SphereGeometry(0.5, 14, 10).scale(1.5, 0.45, 0.85)), eyeGeo = keep(new THREE.SphereGeometry(0.1, 6, 4));
const taper = (f) => Math.min(1, 0.6 + f * 4) * (1 - f * 0.8);
function eel(n) {
  const glow = ribbonMesh(n, LD_CY, true, 0.7), body = ribbonMesh(n, LD_NAVY, false, 0.97), stripe = ribbonMesh(n, LD_WHITE, true, 0.95);
  body.renderOrder = 9; stripe.renderOrder = 10;
  const head = new THREE.Group(), hg = new THREE.Mesh(eelHead, basic(LD_CY, true, 0.7)), hb = new THREE.Mesh(eelHead, basic(LD_NAVY, false, 1));
  hg.scale.setScalar(1.4); head.add(hg, hb);
  for (const sd of [-1, 1]) { const ey = new THREE.Mesh(eyeGeo, basic(C(2.6, 2.4, 0.5), true, 1)); ey.position.set(0.4, 0.2, sd * 0.22); head.add(ey); }
  order(head, 9);
  return { glow, body, stripe, head, all: [glow, body, stripe, head] };
}
function setEel(E, pts, w) {
  fillRibbon(E.glow, pts, (f) => w * 1.7 * taper(f)); fillRibbon(E.body, pts, (f) => w * taper(f)); fillRibbon(E.stripe, pts, (f) => w * 0.22 * taper(f));
  const p0 = pts[0], p1 = pts[1]; E.head.position.set(p0[0], p0[1] + 0.05, p0[2]); E.head.rotation.y = -Math.atan2(p0[2] - p1[2], p0[0] - p1[0]); E.head.scale.setScalar(w * 1.4);
}
const luondien = {
  // Luồng Điện: an eel of lightning swims down the lane, its body crackling to the floor; it bursts in forks where it ends
  ldEel: {
    pal: [LD_VIO, LD_WHITE], hitR: 1.8,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.4, 1.2, u.z + Math.sin(e.a) * 1.4, LD_CY, 0.15, 2.2, 1, kit.K.STAR, 1.3); return true; },
    shotMake(kit, s) { const E = eel(20); return { E, hold: held(kit, E.all), a: Math.atan2(s.dz, s.dx), t: 0 }; },
    shot(kit, v, s, x, y, z, dt) {
      v.t += dt; const ca = Math.cos(v.a), sa = Math.sin(v.a), pts = [];
      for (let i = 0; i < 20; i++) { const f = i / 19, d = f * 7.5, w = Math.sin(f * 5 - v.t * 20) * 1.8 * Math.min(1, f * 3); pts.push([x - ca * d - sa * w, 1.1, z - sa * d + ca * w]); }
      setEel(v.E, pts, 1.25);
      if (Math.random() < dt * 14) { const p = pts[2 + Math.floor(Math.random() * 15)]; zap(kit, p, [p[0] + R(-1.6, 1.6), 0.1, p[2] + R(-1.6, 1.6)], 0.2, LD_CY, 0.09, { segs: 5, jit: 0.3 }); }
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.hold.on = false; forks(kit, x, 1.1, z, 6, 2.8, 0.3, LD_CY, 0.3, { y1: 0.2 }); kit.flash(x, 1.4, z, LD_CY, 30, 0.2); },
  },
  // Vùng Điện: two eels circle him at the rim of the field, head chasing tail, sparks jumping from their bodies to the rim
  ldCoil: {
    pal: [LD_VIO, LD_WHITE], hitR: 1.5,
    skill() { return true; },
    zoneMake(kit, z) {
      const E = [eel(24), eel(24)], disc = sigil(kit, z.x, z.z, z.r, LD_CY, { n: 0, ticks: 0, inner: 0, fill: 0, life: 1e9, rev: 0.15, alpha: 0.8, w: 0.05, y: 0.11 });
      return { E, hold: held(kit, [...E[0].all, ...E[1].all]), disc, t: 0, acc: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; v.acc += dt; v.disc.position.x = z.x; v.disc.position.z = z.z;
      const grow = Math.min(1, v.t / 0.25), all = [];
      v.E.forEach((E, j) => {
        const pts = [], base = v.t * 3.2 + j * Math.PI;
        for (let i = 0; i < 24; i++) { const f = i / 23, ang = base - f * 2.7, rr = z.r * (0.6 + 0.4 * f) * grow + Math.sin(f * 9 - v.t * 16) * 0.6; pts.push([z.x + Math.cos(ang) * rr, 1.0, z.z + Math.sin(ang) * rr]); }
        setEel(E, pts, 0.62); all.push(pts);
      });
      if (v.acc > 0.14) {
        v.acc = 0; const p = all[Math.random() < 0.5 ? 0 : 1][3 + Math.floor(Math.random() * 18)], b = Math.atan2(p[2] - z.z, p[0] - z.x) + R(-0.4, 0.4);
        zap(kit, p, [z.x + Math.cos(b) * z.r, 0.15, z.z + Math.sin(b) * z.r], 0.28, Math.random() < 0.5 ? LD_VIO : LD_CY, 0.12, { segs: 6, jit: 0.35 });
      }
    },
    zoneDrop(kit, v) { v.hold.on = false; stop(v.disc); },
  },
  // Sấm Sét: a crackling ring marks each spot; a lightning eel dives out of the sky in an arc onto it and bursts in forks
  ldStorm: {
    zones: ['strike'], ownDisc: true, pal: [LD_VIO, LD_WHITE], hitR: 1.8,
    skill() { return true; },
    zoneMake(kit, z) {
      const s = sigil(kit, z.x, z.z, Math.max(1.8, z.r), LD_CY, { c2: LD_VIO, n: 0, ticks: 10, inner: 0.7, fill: 0.2, life: 1e9, rev: 0.1, spin: 3, w: 0.07, alpha: 0.8 });
      return { s, acc: 0 };
    },
    zone(kit, v, z, dt) {
      v.acc += dt; const r = Math.max(1.8, z.r);
      if (v.acc > 0.08) { v.acc = 0; const b = Math.random() * 6.283, c = b + R(0.6, 1.2); zap(kit, [z.x + Math.cos(b) * r, 0.2, z.z + Math.sin(b) * r], [z.x + Math.cos(c) * r, 0.2, z.z + Math.sin(c) * r], 0.2, LD_VIO, 0.08, { segs: 5, jit: 0.3 }); }
    },
    zoneDrop(kit, v) { stop(v.s); },
    land(kit, e) {
      // the eel's path: a curve from high up off to one side down onto the spot; its body trails 60% of the curve behind the head
      const E = eel(18), b = Math.random() * 6.283, P0 = [e.x + Math.cos(b) * 5, 8, e.z + Math.sin(b) * 5], P1 = [e.x + Math.cos(b) * 1.5, 7, e.z + Math.sin(b) * 1.5], P2 = [e.x, 0.4, e.z];
      const at = (f) => { const g = 1 - f; return [g * g * P0[0] + 2 * g * f * P1[0] + f * f * P2[0], g * g * P0[1] + 2 * g * f * P1[1] + f * f * P2[1], g * g * P0[2] + 2 * g * f * P1[2] + f * f * P2[2]]; };
      own(kit, E.all, 0.45, (t) => {
        const h = Math.min(1, t / 0.12), pts = []; for (let i = 0; i < 18; i++) pts.push(at(Math.max(0, h - 0.6 * i / 17)));
        setEel(E, pts, 0.8); const k = Math.min(1, (0.45 - t) / 0.2); E.glow.material.opacity = 0.7 * k; E.body.material.opacity = 0.97 * k; E.stripe.material.opacity = 0.95 * k; fadeAll(E.head, k);
      });
      forks(kit, e.x, 0.4, e.z, 6, 3.2, 0.4, LD_CY, 0.4, { y1: 0.15 });
      kit.scorch(e.x, e.z, 1.2, 3, 1.2, LD_CY); kit.kick(e.x, e.z, 0.3);
      return true;
    },
  },
};

// ---- Nhện Thép (Mikasa) moved to looks-k18.js with the kit ported from clip p56 (kit lane K18) ---------------------

// ---- Băng Nha moved to looks-k9.js with the kit ported from clip p81; Kiếm Thần still borrows BN_WHITE -------------------------
const BN_WHITE = C(2.3, 2.5, 2.6);

export const B6 = { ...luondien };   // vesau, bang and bocap moved to looks-k8.js / looks-k9.js / looks-k10.js with their ported kits
