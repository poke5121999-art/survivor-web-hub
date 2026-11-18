// Looks, kit lane k17: Razor and Medusa (kits ported from the owner's clips, see data.js). Render only (see looks.js for
// the hooks). One main colour and one accent per tank.
// Razor (bilibili BV1Kp4y1b7i6 p51 "48.电魂", gameplay 33-59 s): electric cyan-blue, accent violet. The lightning orbs are white-blue
//   plasma balls in a violet ring with a spark inside, lying about the floor; the channel wraps him in a crackling cyan bubble;
//   the trap is a dark navy storm cloud that drops lightning on the spot; the ult is a violet ring of electricity rolling out
//   twice, the second wider and brighter.
// Medusa (p42 "39.美杜莎", gameplay 18-30 s): venom lime green, accent pale cyan. Green serpents with dark scales; the gaze is a lime
//   fan that turns what it catches to grey-green stone; the snake hops from foe to foe; the ult raises three tilted green rings
//   turning round her like a gyroscope (the ward) and pours small green snakes forward.
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

// ---- Medusa ---------------------------------------------------------------------------------------------------------
const MD_GR = C(0.5, 2.6, 0.5), MD_CY = C(0.45, 1.6, 2.4), MD_YEL = C(2.4, 2.3, 0.3), MD_SCALE = 0x1f5a2a, MD_STONE = C(0.55, 0.62, 0.5), MD_DEEP = C(0.1, 0.45, 0.12);
const sHead = keep(new THREE.SphereGeometry(0.5, 12, 8).scale(1.3, 0.45, 0.85)), sJaw = keep(new THREE.ConeGeometry(0.4, 1.1, 4).rotateZ(-Math.PI / 2).scale(1, 0.35, 1).translate(0.55, 0, 0)), sEye = keep(new THREE.SphereGeometry(0.1, 6, 4));
function snakeHead() {
  const g = new THREE.Group(), m = basic(MD_SCALE, false, 1), up = new THREE.Mesh(sJaw, m), lo = new THREE.Mesh(sJaw, basic(0x8a1020, false, 1)), glow = new THREE.Mesh(sHead, basic(MD_GR, true, 0.7));
  up.position.set(0.25, 0.12, 0); up.rotation.z = 0.35; lo.position.set(0.25, -0.08, 0); lo.rotation.z = -0.35; glow.scale.setScalar(1.5);
  g.add(glow, new THREE.Mesh(sHead, m), up, lo);
  for (const sd of [-1, 1]) { const e = new THREE.Mesh(sEye, basic(MD_YEL, true, 1)); e.position.set(0.25, 0.2, sd * 0.25); g.add(e); }
  g.traverse((o) => { o.frustumCulled = false; o.renderOrder = 9; });
  return g;
}
// a serpent from tail p0 to head p1 ([x, y, z]), wiggling side to side, thickest in the middle
function serpentPts(p0, p1, t, amp, n = 18, ph = 0) {
  const dx = p1[0] - p0[0], dz = p1[2] - p0[2], L = Math.hypot(dx, dz) || 1, sx = -dz / L, sz = dx / L, pts = [];
  for (let i = 0; i < n; i++) { const f = i / (n - 1), w = Math.sin(f * L * 1.1 - t * 18 + ph) * amp * Math.sin(f * Math.PI); pts.push([p0[0] + dx * f + sx * w, p0[1] + (p1[1] - p0[1]) * f, p0[2] + dz * f + sz * w]); }
  return pts;
}
function serpent(n) { const body = ribbonMesh(n, MD_SCALE, false, 0.95), glow = ribbonMesh(n, MD_GR, true, 0.85); return { body, glow, n }; }
function setSerpent(S, pts, w, k = 1) {
  fillRibbon(S.glow, pts, (f) => w * (0.35 + 0.9 * Math.sin(Math.min(1, f * 1.15) * Math.PI * 0.5)));
  fillRibbon(S.body, pts.map((p) => [p[0], p[1] + 0.03, p[2]]), (f) => w * (0.2 + 0.5 * Math.sin(Math.min(1, f * 1.15) * Math.PI * 0.5)));
  S.glow.material.opacity = 0.85 * k; S.body.material.opacity = 0.95 * k;
}
// what turns to stone: a grey-green crust over the mech with green cracks and grit
function stone(kit, x, z, life = 0.9) {
  shell(kit, x, 1.0, z, 1.35, MD_STONE, { c2: MD_DEEP, p: 0.9, core: 0.55, life, grow: 0.06, alpha: 0.85 });
  sigil(kit, x, z, 1.6, MD_GR, { c2: MD_STONE, n: 5, m: 2, ticks: 0, inner: 0.5, fill: 0.2, w: 0.08, life, rev: 0.1, spin: 0 });
  kit.chips(x, 1.2, z, kit.N(6), MD_STONE, 4, 0.7, 0.14);
}
const medusa = {
  // the fifth curse mark: the foe turns to stone
  mdCurse: {
    stacks(kit, e) { stone(kit, e.x, e.z, 0.6); kit.flash(e.x, 1.4, e.z, MD_GR, 26, 0.2); return true; },
  },
  // Tử Vong Ngưng Thị: her eyes flare yellow while she stares; then a lime fan of light sweeps the cone and everything in it turns
  // to stone
  mdGaze: {
    pal: [MD_GR, MD_YEL], hitR: 1.6,
    skill(kit, e, u, row) {
      const w = (row && row.windup) || 0.5;
      kit.follow(u, w, (t) => {
        const a = u.aim, ca = Math.cos(a), sa = Math.sin(a);
        for (const sd of [-1, 1]) kit.glow(u.x + ca * 0.7 - sa * sd * 0.25, 1.5, u.z + sa * 0.7 + ca * sd * 0.25, MD_YEL, 0.06, 0.7 + t, 1, kit.K.STAR, 1.2);
        kit.glow(u.x + ca * 2.5, 0.8, u.z + sa * 2.5, MD_GR, 0.06, 2 + 3 * t / w, 0.18, kit.K.GLOW, 1);
      });
      return true;
    },
    nova(kit, e, u, s) {
      const r = e.r || 7, a = e.a ?? u.aim, half = (s && s.arc) || 0.6, x = u.alive ? u.x : e.x, z = u.alive ? u.z : e.z;
      slash(kit, x, z, a, r * 0.95, MD_GR, { y: 0.7, life: 0.5, w: r * 0.7, span: half, sweep: 0.06, erode: 0.2, arcs: 2, c2: MD_DEEP, edge: MD_YEL, wake: 1.6, sparks: false });
      slash(kit, x, z, a, r * 0.6, MD_CY, { y: 0.8, life: 0.4, w: r * 0.3, span: half * 0.85, sweep: 0.05, erode: 0.15, arcs: 0, c2: MD_GR, edge: MD_YEL, wake: 1.4, sparks: false });
      for (const o of kit.match.units) {
        if (o.team === u.team || !o.alive) continue;
        const d = Math.hypot(o.x - x, o.z - z), da = Math.atan2(o.z - z, o.x - x) - a;
        if (d <= r + 0.6 && Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) <= half + 0.2) stone(kit, o.x, o.z, 1.1);
      }
      kit.flash(x + Math.cos(a) * 3, 1.5, z + Math.sin(a) * 3, MD_GR, 45, 0.25);
      return true;
    },
  },
  // Bí Thuật Dị Xà: a green serpent swims along the shot, jaws first; it hops on from foe to foe (the chain)
  mdSnake: {
    pal: [MD_GR, MD_YEL], hitR: 1.6,
    skill(kit, e, u) {
      kit.glow(u.x + Math.cos(e.a) * 1.2, 1.2, u.z + Math.sin(e.a) * 1.2, MD_GR, 0.15, 1.8, 1, kit.K.STAR, 1.2);
      sigil(kit, u.x, u.z, 3, MD_GR, { c2: MD_YEL, n: 0, ticks: 10, inner: 0.6, fill: 0.7, w: 0.12, life: 0.5, rev: 0.06, spin: 4 });
      shell(kit, u.x, 1.1, u.z, 1.6, MD_GR, { c2: MD_YEL, p: 1.4, core: 0.3, life: 0.35, grow: 0.06 });
      return true;
    },
    shotMake(kit, s) { const v = { S: serpent(18), h: snakeHead(), t: 0, done: false }; own(kit, [v.S.body, v.S.glow, v.h], 1e9, () => !v.done); return v; },
    shot(kit, v, s, x, y, z, dt) {
      v.t += dt; const a = Math.atan2(s.dz, s.dx), ca = Math.cos(a), sa = Math.sin(a);
      setSerpent(v.S, serpentPts([x - ca * 5.5, 1.0, z - sa * 5.5], [x - ca * 0.4, 1.1, z - sa * 0.4], v.t, 0.8), 1.5);
      v.h.position.set(x, 1.15, z); v.h.rotation.y = -a; v.h.scale.setScalar(1.9);
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.done = true; burst(kit, x, z, 2, MD_GR, MD_YEL, { life: 0.3 }); },
    // each hop: the serpent arcs from one foe to the next and bites
    chain(kit, e) {
      for (let i = 0; i + 1 < e.pts.length; i++) {
        const p = e.pts[i], q = e.pts[i + 1], S = serpent(16), h = snakeHead(), d0 = i * 0.12, a = Math.atan2(q[1] - p[1], q[0] - p[0]);
        own(kit, [S.body, S.glow, h], d0 + 0.5, (t) => {
          const f = Math.max(0, Math.min(1, (t - d0) / 0.22)), k = f > 0 ? Math.min(1, (d0 + 0.5 - t) / 0.2) : 0, hop = Math.sin(f * Math.PI) * 1.2;
          const hx = p[0] + (q[0] - p[0]) * f, hz = p[1] + (q[1] - p[1]) * f;
          setSerpent(S, serpentPts([p[0], 1.0, p[1]], [hx, 1.2 + hop, hz], t, 0.4, 16), 0.45, k);
          h.position.set(hx, 1.25 + hop, hz); h.rotation.y = -a; h.scale.setScalar(1.6 * Math.max(0.001, k)); fadeAll(h, k);
        });
        kit.glow(q[0], 1.2, q[1], MD_GR, 0.3, 2, 0.8, kit.K.GLOW, 1.3);
      }
      return true;
    },
  },
  // Ma Xà Chi Xúc: three tilted green rings turn round her like a gyroscope while the ward is up; small serpents pour forward
  mdSwarm: {
    pal: [MD_GR, MD_CY], hitR: 1.4,
    skill(kit, e, u) {
      const g = new THREE.Group(), rings = [], tor = new THREE.TorusGeometry(3.0, 0.12, 6, 64), torG = new THREE.TorusGeometry(3.0, 0.46, 6, 64);
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Group(), q = new THREE.Group();
        q.add(new THREE.Mesh(torG, basic(MD_GR, true, 0.75)), new THREE.Mesh(tor, basic(MD_CY, true, 1)));
        q.rotation.x = Math.PI / 2; p.add(q); p.rotation.set(i === 0 ? 0.25 : 0.95, i * 2.094, i === 0 ? 0 : 0.35); g.add(p); rings.push(q);
      }
      g.traverse((o) => { o.frustumCulled = false; o.renderOrder = 8; });
      g.position.set(u.x, 1.3, u.z);
      const ring = sigil(kit, u.x, u.z, 3.6, MD_GR, { c2: MD_CY, n: 0, ticks: 16, inner: 0.72, fill: 0.75, w: 0.12, life: 5, rev: 0.2, spin: 2, follow: u });
      const dome = shell(kit, u.x, 1.2, u.z, 2.8, MD_GR, { c2: MD_CY, p: 2.6, core: 0.05, life: 5, grow: 0.15, follow: u, alpha: 0.5, step: () => u.mdWT > 0 });
      let off = -1;
      own(kit, [g], 6, (t, dt) => {
        if (!u.alive) return false;
        g.position.set(u.x, 1.3, u.z);
        g.scale.setScalar(Math.min(1, t / 0.2));
        rings.forEach((q, i) => { q.rotation.z += dt * (2.2 + i * 0.7) * (i % 2 ? -1 : 1); });
        if (!(u.mdWT > 0) && t > 0.3) { if (off < 0) { off = t; stop(ring); stop(dome); } const f = 1 - (t - off) / 0.3; fadeAll(g, Math.max(0, f)); if (f <= 0) return false; }
      });
      kit.flash(u.x, 1.6, u.z, MD_GR, 30, 0.2);
      return true;
    },
    shotMake(kit, s) { const v = { S: serpent(10), t: Math.random() * 3, done: false }; own(kit, [v.S.body, v.S.glow], 1e9, () => !v.done); return v; },
    shot(kit, v, s, x, y, z, dt) {
      v.t += dt; const a = Math.atan2(s.dz, s.dx), ca = Math.cos(a), sa = Math.sin(a);
      setSerpent(v.S, serpentPts([x - ca * 3.0, 1.0, z - sa * 3.0], [x, 1.05, z], v.t, 0.45, 10), 0.6);
      kit.glow(x, 1.05, z, MD_GR, 0.05, 0.7, 0.8, kit.K.GLOW, 1);
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.done = true; kit.sparks(x, 1.1, z, kit.N(5), MD_GR, 5, 0.3, 0.05, 0.5, 6); },
  },
};


export const K17 = { ...razor, ...medusa };
