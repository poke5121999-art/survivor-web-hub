// Looks, kit lane k17: Razor (kits ported from the owner's clips, see data.js). Render only (see looks.js for
// the hooks). One main colour and one accent per tank.
// Razor (bilibili BV1Kp4y1b7i6 p51 "48.电魂", gameplay 33-59 s): electric cyan-blue, accent violet. The lightning orbs are white-blue
//   plasma balls in a violet ring with a spark inside, lying about the floor; the channel wraps him in a crackling cyan bubble;
//   the trap is a dark navy storm cloud that drops lightning on the spot; the ult is a violet ring of electricity rolling out
//   twice, the second wider and brighter.
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, sigil, shell, burst, slash, pillar } from './lookkit.js';
import { zap, forks, ribbonMesh, fillRibbon } from './looks-b5.js';

const R = (a, b) => a + Math.random() * (b - a);
const keep = (g) => { g.userData.keep = true; return g; };
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
function fadeAll(g, k) { g.traverse((m) => { if (m.material) { if (m.userData.op === undefined) m.userData.op = m.material.opacity; m.material.opacity = m.userData.op * k; } }); }

// ---- Razor ----------------------------------------------------------------------------------------------------------
const LD_CY = C(0.4, 1.6, 2.6), LD_VIO = C(1.5, 0.5, 2.6), LD_WHITE = C(2.2, 2.5, 2.6), LD_NAVY = C(0.05, 0.1, 0.28), LD_DEEP = C(0.25, 0.1, 0.7);
// a burst of plasma where an orb is taken
function orbPop(kit, x, z, foe) {
  const c = foe ? LD_VIO : LD_CY;
  shell(kit, x, 1.0, z, 1.2, c, { c2: LD_WHITE, p: 1.4, core: 0.4, life: 0.35, grow: 0.08 });
  forks(kit, x, 1.0, z, 5, 2.2, 0.22, c, 0.25, { y1: 0.2 });
  kit.flash(x, 1.4, z, c, 26, 0.2);
}
const razor = {
  // the lightning orb on the floor (a field of vis 'ldOrb'): a white-blue plasma ball over a violet ring, sparks crawling inside
  ldOrb: {
    zoneMake(kit, z) {
      const ball = shell(kit, z.x, 1.0, z.z, 0.62, LD_CY, { c2: LD_WHITE, p: 1.6, core: 0.55, life: 1e9, grow: 0.15, pulse: 1.4 });
      const rim = shell(kit, z.x, 1.0, z.z, 0.85, LD_VIO, { c2: LD_VIO, p: 3, core: 0, life: 1e9, alpha: 0.9, grow: 0.15 });
      const ring = sigil(kit, z.x, z.z, 1.1, LD_VIO, { c2: LD_CY, n: 0, ticks: 8, inner: 0.7, fill: 0.25, life: 1e9, rev: 0.2, spin: 2.5, w: 0.08, alpha: 0.85 });
      return { ball, rim, ring, acc: 0 };
    },
    zone(kit, v, z, dt) {
      v.acc += dt;
      if (v.acc > 0.12) {
        v.acc = 0; const a = Math.random() * 6.283, b = a + R(1.5, 3);
        zap(kit, [z.x + Math.cos(a) * 0.5, 1.0 + R(-0.3, 0.3), z.z + Math.sin(a) * 0.5], [z.x + Math.cos(b) * 0.5, 1.0 + R(-0.3, 0.3), z.z + Math.sin(b) * 0.5], 0.09, LD_WHITE, 0.08, { segs: 4, jit: 0.15 });
      }
      kit.glow(z.x, 1.0, z.z, LD_CY, 0.06, 1.3, 0.25, kit.K.GLOW, 1);
    },
    zoneDrop(kit, v) { stop(v.ball); stop(v.rim); stop(v.ring); },
  },
  // the passive's events: an orb taken bursts (violet when an enemy took it), the channel breaking spits sparks
  ldOrbs: {
    k17(kit, e) {
      if (e.kind === 'orb') orbPop(kit, e.x, e.z, !!e.foe);
      else if (e.kind === 'chanEnd') { kit.sparks(e.x, 1.1, e.z, kit.N(10), LD_CY, 6, 0.35, 0.05, 0.6, 6); kit.ring(e.x, e.z, 1.8, LD_CY, 0.25, 0.6); }
    },
  },
  // Điện Năng Chuyển Hoán: a crackling cyan bubble round him while he stands channelling, a violet ring under him, energy drawn
  // up into him
  ldChannel: {
    skill(kit, e, u, row) {
      const d = (row && row.dur) || 4, on = () => u.tfT > 0;
      shell(kit, u.x, 1.0, u.z, 2.9, LD_CY, { c2: LD_WHITE, p: 1.3, core: 0.55, bands: 1.2, life: d, grow: 0.12, follow: u, alpha: 1, step: () => on() });
      pillar(kit, u.x, u.z, 1.4, LD_CY, { c2: LD_WHITE, h: 4, life: d, rings: 1.5, follow: u, alpha: 0.7 });
      shell(kit, u.x, 1.0, u.z, 2.0, LD_DEEP, { c2: LD_CY, p: 1.0, core: 0.5, life: d, grow: 0.15, follow: u, alpha: 0.75, step: () => on() });
      sigil(kit, u.x, u.z, 3.8, LD_VIO, { c2: LD_CY, n: 0, ticks: 12, inner: 0.65, fill: 0.8, w: 0.12, life: d, rev: 0.15, spin: 2.4, follow: u });
      kit.flash(u.x, 1.4, u.z, LD_CY, 30, 0.2);
      let acc = 0;
      kit.follow(u, d, (t, dt) => {
        if (!on()) return;
        acc += dt;
        if (acc > 0.09) {
          acc = 0; const a = Math.random() * 6.283, b = a + R(0.8, 2);
          zap(kit, [u.x + Math.cos(a) * 2.5, R(0.4, 2.2), u.z + Math.sin(a) * 2.5], [u.x + Math.cos(b) * 2.5, R(0.4, 2.2), u.z + Math.sin(b) * 2.5], 0.22, Math.random() < 0.5 ? LD_WHITE : LD_VIO, 0.16, { segs: 7, jit: 0.35 });
        }
        if (Math.random() < dt * 20) { const a = Math.random() * 6.283; kit.str.emit(u.x + Math.cos(a) * 2.4, 0.2, u.z + Math.sin(a) * 2.4, -Math.cos(a) * 4, 2.5, -Math.sin(a) * 4, LD_CY, 0.45, 0.08, 0.05, 0, 0, 1); }
      });
      return true;
    },
    transform() { return true; },
  },
  // Lôi Vân Hãm Tịnh: a dark navy storm cloud swells over the spot with lightning flickering inside it, then bolts drop onto the
  // spot and a cyan ring of sparks marks the trap
  ldCloud: {
    zones: ['strike'], ownDisc: true, pal: [LD_CY, LD_WHITE], hitR: 1.8,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.2, 1.3, u.z + Math.sin(e.a) * 1.2, LD_CY, 0.15, 1.8, 1, kit.K.STAR, 1.2); return true; },
    zoneMake(kit, z) {
      const r = Math.max(2, z.r);
      const cloud = shell(kit, z.x, 3.2, z.z, r * 0.95, LD_NAVY, { c2: LD_DEEP, p: 0.8, core: 0.7, life: 1e9, grow: 0.2, squash: 0.45, alpha: 0.92 });
      const halo = shell(kit, z.x, 3.2, z.z, r * 1.15, LD_CY, { c2: LD_VIO, p: 3, core: 0.02, life: 1e9, grow: 0.2, squash: 0.5, alpha: 0.7 });
      const disc = sigil(kit, z.x, z.z, r, LD_CY, { c2: LD_VIO, n: 0, ticks: 10, inner: 0.72, fill: 0.3, life: 1e9, rev: 0.2, spin: 2, w: 0.08, alpha: 0.9 });
      return { cloud, halo, disc, acc: 0, r };
    },
    zone(kit, v, z, dt) {
      v.acc += dt;
      if (v.acc > 0.07) {
        v.acc = 0; const a = Math.random() * 6.283, b = a + R(0.8, 2), q = v.r * 0.7;
        zap(kit, [z.x + Math.cos(a) * q, 3.1, z.z + Math.sin(a) * q], [z.x + Math.cos(b) * q, 3.3, z.z + Math.sin(b) * q], 0.16, Math.random() < 0.5 ? LD_WHITE : LD_CY, 0.08, { segs: 6, jit: 0.3 });
      }
      kit.glow(z.x, 3.2, z.z, LD_VIO, 0.06, v.r * 1.4, 0.18, kit.K.GLOW, 1);
    },
    zoneDrop(kit, v) { stop(v.cloud); stop(v.halo); stop(v.disc); },
    land(kit, e) {
      for (let i = 0; i < 4; i++) { const a = Math.random() * 6.283, q = R(0, 0.8); zap(kit, [e.x + R(-1, 1), 3.2, e.z + R(-1, 1)], [e.x + Math.cos(a) * q, 0.1, e.z + Math.sin(a) * q], 0.4, i % 2 ? LD_WHITE : LD_CY, 0.55, { segs: 9, jit: 0.45 }); }
      shell(kit, e.x, 3.0, e.z, e.r * 1.05, LD_NAVY, { c2: LD_DEEP, p: 0.8, core: 0.6, life: 0.7, squash: 0.45, alpha: 0.85 });
      forks(kit, e.x, 0.3, e.z, 7, e.r * 1.1, 0.26, LD_CY, 0.35, { y1: 0.1 });
      sigil(kit, e.x, e.z, e.r * 1.15, LD_CY, { c2: LD_WHITE, n: 0, ticks: 16, inner: 0.8, fill: 0.7, w: 0.12, life: 1.0, rev: 0.06, spin: -3 });
      burst(kit, e.x, e.z, 2.4, LD_CY, LD_WHITE, { life: 0.3 });
      kit.scorch(e.x, e.z, 1.5, 3, 1.2, LD_CY); kit.kick(e.x, e.z, 0.4);
      return true;
    },
  },
  // Điện Từ Can Nhiễu: a violet ring of electricity rolls out of him to the rim, forks crawling along it, a flattened violet dome;
  // the second pulse is wider and brighter (white-cyan rim)
  ldPulse: {
    pal: [LD_VIO, LD_WHITE], hitR: 1.8,
    skill(kit, e, u) { kit.ring(u.x, u.z, 2.2, LD_VIO, 0.3); return true; },
    nova(kit, e, u) {
      const k = e.k || 0, r = e.r || 5.5, x = u.alive ? u.x : e.x, z = u.alive ? u.z : e.z, rim = k ? LD_WHITE : LD_VIO, body = k ? LD_CY : LD_VIO;
      shell(kit, x, 0.4, z, r, body, { c2: LD_DEEP, p: 2.6, core: 0.1, bands: 0.8, life: 0.55, grow: 0.18, squash: 0.35, alpha: 0.85 });
      sigil(kit, x, z, r, rim, { c2: body, n: 0, ticks: 28, inner: 0.82, fill: 0.35, w: 0.1, life: 0.7, rev: 0.12, spin: k ? -2 : 2 });
      sigil(kit, x, z, r * 0.55, body, { c2: LD_WHITE, n: 0, ticks: 12, inner: 0.6, fill: 0.25, w: 0.07, life: 0.5, rev: 0.08, spin: k ? 3 : -3 });
      for (let i = 0, n = kit.N(k ? 14 : 10); i < n; i++) {
        const a = (i / n) * 6.283 + R(-0.2, 0.2), b = a + R(0.25, 0.5);
        zap(kit, [x + Math.cos(a) * r, 0.5, z + Math.sin(a) * r], [x + Math.cos(b) * r, 0.5, z + Math.sin(b) * r], 0.2, rim, 0.3, { segs: 6, jit: 0.35 });
      }
      forks(kit, x, 1.0, z, k ? 9 : 7, r * 0.9, 0.24, body, 0.3, { y1: 0.3 });
      kit.flash(x, 2, z, body, k ? 60 : 45, 0.3); kit.kick(x, z, k ? 0.6 : 0.4);
      return true;
    },
  },
};



export const K17 = { ...razor };
