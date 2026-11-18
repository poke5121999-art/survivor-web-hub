// Looks, batch 5: Quạ Sét, Ngưu Ma Vương, Báo Gấm, Lôi Công, Mãng Xà. Render only (see looks.js for the hooks).
// Each look's own shape carries it; bursts are only brief flashes where blows land.
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP.md):
//   佐助 p75 (Quạ Sét): a cyan-white Chidori streak, a violet flame Susanoo round the mech, cyan lances.
//   琦玉 p77 (Saitama, tegiac): its looks moved to looks-k7.js with the kit ported from the clip (kit lane K7).
//   牛魔王 p85 (Ngưu Ma Vương): lime-green swirling arcs and rings round the bull; ours keeps the bull's dark red hide.
//   黑豹 p89 (Báo Gấm): three white claw slashes, a dark ink swirl of kinetic rings.
//   雷神 p28 (Lôi Công): the golden hammer wrapped in lightning, an orange blast disc with cracks and a blue rim.
//   美杜莎 p42 (Mãng Xà): green serpents, a cage of tilted green rings like a gyroscope.
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, sigil, shell, trail, burst } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);
const keep = (g) => { g.userData.keep = true; return g; };
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
const WHITE = C(2.4, 2.4, 2.5);

// ---- ribbons and bolts -----------------------------------------------------------------------------------------
// A strip through n points; fillRibbon lays it across the path (flat on the floor for a level path, upright for a steep one).
function ribbonMesh(n, c, add, op) {
  const g = new THREE.BufferGeometry(), P = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, basic(c, add, op)); m.renderOrder = add ? 8 : 7; return m;
}
function fillRibbon(m, pts, w) {
  const P = m.geometry.attributes.position.array, n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], hl = Math.hypot(dx, dz);
    let sx = 1, sz = 0; if (hl > 0.3 * Math.hypot(dx, dy, dz) && hl > 1e-4) { sx = -dz / hl; sz = dx / hl; }
    const ww = typeof w === 'function' ? w(i / (n - 1)) : w, p = pts[i];
    P[i * 6] = p[0] - sx * ww; P[i * 6 + 1] = p[1]; P[i * 6 + 2] = p[2] - sz * ww; P[i * 6 + 3] = p[0] + sx * ww; P[i * 6 + 4] = p[1]; P[i * 6 + 5] = p[2] + sz * ww;
  }
  m.geometry.attributes.position.needsUpdate = true;
}
function boltPts(a, b, segs, jit) {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, sx = -dz / L, sz = dx / L, pts = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs, j = i === 0 || i === segs ? 0 : jit * (Math.random() * 2 - 1), jy = i === 0 || i === segs ? 0 : jit * 0.6 * (Math.random() * 2 - 1);
    pts.push([a[0] + dx * f + sx * j + (L < 0.5 ? j : 0), a[1] + (b[1] - a[1]) * f + jy, a[2] + dz * f + sz * j]);
  }
  return pts;
}
// A crackling bolt from A to B ([x, y, z] or t -> [x, y, z] | null; null freezes it and it fades): a wide glow and a white core,
// re-jagged every `every` s.
function zap(kit, A, B, w, c, life, o = {}) {
  const segs = o.segs || 10, glow = ribbonMesh(segs + 1, c, true, 0.7), core = ribbonMesh(segs + 1, o.core || WHITE, true, 1);
  let acc = 9, a0 = null, b0 = null, dead = -1;
  own(kit, [glow, core], life, (t, dt) => {
    acc += dt;
    if (dead < 0) { const a = typeof A === 'function' ? A(t) : A, b = typeof B === 'function' ? B(t) : B; if (a && b) { a0 = a; b0 = b; } else dead = t; }
    if (!a0) return false;
    if (acc >= (o.every ?? 0.05)) { acc = 0; const p = boltPts(a0, b0, segs, o.jit ?? 0.6); fillRibbon(glow, p, w); fillRibbon(core, p, w * 0.3); }
    const k = Math.min(1, (life - t) / Math.min(0.15, life * 0.5), dead < 0 ? 1 : 1 - (t - dead) / 0.25);
    if (k <= 0) return false;
    glow.material.opacity = 0.7 * k * (o.flicker ? 0.55 + 0.45 * Math.random() : 1); core.material.opacity = k;
  });
}
// forks: n bolts out from (x, y, z) to radius r
function forks(kit, x, y, z, n, r, w, c, life, o = {}) { for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + R(-0.3, 0.3), L = r * R(0.7, 1.1); zap(kit, [x, y, z], [x + Math.cos(a) * L, o.y1 ?? y * 0.4, z + Math.sin(a) * L], w, c, life, { segs: 7, jit: L * 0.12, ...o }); } }

// ---- Quạ Sét: Chidori cyan, crows and the red eye, violet Susanoo --------------------------------------------------
const QS_CY = C(0.45, 1.5, 2.6), QS_VIO = C(1.5, 0.35, 2.6), QS_DEEP = C(0.35, 0.05, 0.7);
const crowGeo = (() => {
  const s = new THREE.Shape(), pts = [[0.75, 0], [0.42, 0.12], [0.25, 0.3], [0.05, 1.05], [-0.25, 1.2], [-0.15, 0.75], [-0.35, 0.4], [-0.55, 0.22], [-0.9, 0.3], [-0.8, 0]];
  s.moveTo(...pts[0]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); for (const p of pts.slice(0, -1).reverse()) s.lineTo(p[0], -p[1]);
  return keep(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2));
})();
function crow() { const g = new THREE.Group(), halo = new THREE.Mesh(crowGeo, basic(QS_VIO, true, 0.8)), body = new THREE.Mesh(crowGeo, basic(0x07040c, false, 0.95)); halo.scale.setScalar(1.3); halo.position.y = -0.02; g.add(halo, body); return g; }
const tomoeGeo = (() => { const s = new THREE.Shape(); s.absarc(0, 0, 0.2, 0, Math.PI * 2, false); const t = new THREE.Shape(); t.moveTo(0.2, 0); t.quadraticCurveTo(0.22, -0.4, -0.25, -0.5); t.quadraticCurveTo(0.0, -0.3, -0.2, 0.02); t.lineTo(0.2, 0); return keep(new THREE.ShapeGeometry([s, t], 10).rotateX(-Math.PI / 2)); })();
const discGeo = keep(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)), annGeo = keep(new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2));
// the red eye: a red disc, a black rim and an inner black ring, three black tomoe turning
function sharingan(kit, x, z, r, life) {
  const g = new THREE.Group(); g.position.set(x, 0.16, z);
  const disc = new THREE.Mesh(discGeo, basic(0xd01024, false, 0.92)), rim = new THREE.Mesh(annGeo, basic(0x0a0206, false, 0.95)), inner = new THREE.Mesh(annGeo, basic(0x30040a, false, 0.8)), pupil = new THREE.Mesh(discGeo, basic(0x0a0206, false, 0.95));
  inner.scale.setScalar(0.62); pupil.scale.setScalar(0.18); pupil.position.y = 0.01; g.add(disc, rim, inner, pupil);
  const tom = new THREE.Group(); for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(tomoeGeo, basic(0x0a0206, false, 0.95)); const a = i * 2.094; t.position.set(Math.cos(a) * 0.6, 0.02, Math.sin(a) * 0.6); t.rotation.y = -a; tom.add(t); }
  g.add(tom);
  own(kit, [g], life, (t) => { const k = Math.min(1, t / 0.12); g.scale.setScalar(r * (0.4 + 0.6 * k)); tom.rotation.y = -t * 9; const f = Math.min(1, (life - t) / 0.25); g.children.forEach((m) => { if (m.material) m.material.opacity = 0.92 * f; }); tom.children.forEach((m) => { m.material.opacity = 0.95 * f; }); });
}
// Susanoo's ribcage: arcs round the front at five heights on a spine, a skull with yellow eyes
const ribGeo = keep(new THREE.TorusGeometry(1, 0.17, 5, 20, 4.2).rotateZ(-2.1).rotateX(Math.PI / 2)), spineGeo = keep(new THREE.CylinderGeometry(0.16, 0.2, 3, 6).translate(0, 1.9, 0)), skullGeo = keep(new THREE.SphereGeometry(0.7, 14, 10).scale(1, 0.9, 1.05));
const bowGeo = keep(new THREE.TorusGeometry(3.2, 0.34, 5, 28, 2.4).rotateZ(-1.2).rotateX(Math.PI / 2).translate(-1.6, 0, 0)), strGeo = keep(new THREE.BoxGeometry(0.1, 0.1, 5.9).translate(-0.44, 0, 0)), arrowGeo = keep(new THREE.ConeGeometry(0.42, 6.4, 5).rotateZ(-Math.PI / 2).translate(2.6, 0, 0));
function ribcage() {
  const g = new THREE.Group(), m = basic(QS_VIO, true, 0.45), d = basic(0x1a0630, false, 0.55), solid = basic(0x7418c8, false, 0.9);
  for (let i = 0; i < 5; i++) { const y = 0.7 + i * 0.55, s = (1.9 - Math.abs(i - 2) * 0.18) * 1.6; for (const mm of [solid, m]) { const r = new THREE.Mesh(ribGeo, mm); r.position.set(-0.4, y, 0); r.scale.setScalar(s); g.add(r); } }
  const sp = new THREE.Mesh(spineGeo, d); sp.position.x = -1.2; g.add(sp);
  const sk = new THREE.Mesh(skullGeo, solid); sk.position.set(-0.6, 3.9, 0); sk.scale.setScalar(1.3); g.add(sk);
  for (const sd of [-1, 1]) { const e = new THREE.Mesh(skullGeo, basic(C(2.6, 2.2, 0.4), true, 1)); e.scale.setScalar(0.18); e.position.set(0.1, 4.0, sd * 0.32); g.add(e); }
  return g;
}
const quaset = {
  // Lôi Thiết (Chidori): a cyan bolt crackles along his path, forks spit off the hand in front; where he stops it bursts in forks
  qsChidori: {
    pal: [QS_CY, WHITE], hitR: 2,
    skill(kit, e, u) {
      const x0 = u.x, z0 = u.z, a = e.a, ca = Math.cos(a), sa = Math.sin(a);
      zap(kit, [x0, 1.0, z0], (t) => (t < 0.45 && u.alive ? [u.x + ca, 1.1, u.z + sa] : null), 0.75, QS_CY, 0.8, { segs: 14, jit: 0.8, flicker: 1 });
      zap(kit, [x0, 1.5, z0], (t) => (t < 0.45 && u.alive ? [u.x, 1.4, u.z] : null), 0.45, QS_CY, 0.8, { segs: 10, jit: 1.5 });
      let done = false;
      kit.anims.push({ t: 0, step(dt) {
        this.t += dt;
        const hx = u.x + ca * 1.3, hz = u.z + sa * 1.3;
        kit.glow(hx, 1.2, hz, WHITE, 0.06, 1.6, 1, kit.K.STAR, 1.3); kit.glow(hx, 1.2, hz, QS_CY, 0.08, 2.6, 0.9, kit.K.GLOW, 1.2);
        if (Math.random() < 0.7) { const b = a + R(-1.4, 1.4), L = R(1.2, 2.4); zap(kit, [hx, 1.2, hz], [hx + Math.cos(b) * L, R(0.6, 1.8), hz + Math.sin(b) * L], 0.22, QS_CY, 0.1, { segs: 5, jit: 0.35 }); }
        if ((this.t > 0.06 && !u.dash) || this.t > 0.5 || !u.alive) {
          if (!done && u.alive) { done = true; forks(kit, u.x + ca, 1.2, u.z + sa, 9, 4, 0.35, QS_CY, 0.45, { y1: 0.3 }); burst(kit, u.x + ca * 1.5, u.z + sa * 1.5, 2, QS_CY, WHITE); kit.flash(u.x, 1.6, u.z, QS_CY, 50, 0.25); }
          return false;
        }
        return true;
      }, drop() {} });
      return true;
    },
  },
  // Ảnh Hoán: he bursts into a flock of crows that fly to the new spot; the red three-tomoe eye opens where he comes out
  qsCrow: {
    pal: [QS_VIO, QS_CY], hitR: 1.6,
    skill() { return true; },
    warp(kit, e) {
      const dx = e.x - e.x0, dz = e.z - e.z0, a = Math.atan2(dz, dx);
      for (let i = 0; i < 11; i++) {
        const c = crow(), off = R(-3.4, 3.4), lag = R(0, 0.12), sc = R(1.6, 2.4), hy = R(1.2, 2.8), ph = R(0, 6);
        own(kit, [c], 0.75, (t) => {
          const f = Math.min(1, Math.max(0, (t - lag) / 0.45)), s = Math.sin(f * Math.PI);
          c.position.set(e.x0 + dx * f - Math.sin(a) * off * s * 1.4, 0.5 + hy * s + 0.4, e.z0 + dz * f + Math.cos(a) * off * s * 1.4);
          c.rotation.y = -a; c.scale.set(sc, 1, sc * (0.45 + 0.55 * Math.abs(Math.sin(t * 22 + ph))));
          const k = Math.min(1, (0.75 - t) / 0.2); c.children[0].material.opacity = 0.8 * k; c.children[1].material.opacity = 0.95 * k;
        });
      }
      kit.puffs(e.x0, 1, e.z0, kit.N(6), C(0.05, 0.03, 0.08), 0.8, 2.5, 0.8, 1.3, 2.4, 0.5, 0.7, kit.K.SMOKE, 2);
      for (let i = 0; i < kit.N(12); i++) { const b = Math.random() * 6.283, s = R(2, 5); kit.ovr.emit(e.x0, 1.2, e.z0, Math.cos(b) * s, R(1, 3), Math.sin(b) * s, C(0.06, 0.03, 0.1), R(0.6, 1), R(0.2, 0.32), 1, 1.4, -0.6, 0.95, kit.K.CHIP); }
      sharingan(kit, e.x, e.z, 2.6, 0.9);
      kit.flash(e.x, 1.6, e.z, C(2.4, 0.2, 0.3), 30, 0.25);
      return true;
    },
  },
  // Giáp Hộ Mệnh (Susanoo): a violet flame giant stands round him, ribcage and skull, flames licking up, for the whole form
  qsSusanoo: {
    pal: [QS_VIO, WHITE], hitR: 2,
    skill(kit, e, u, row) {
      const dur = row.dur || 6, live = () => u.alive && (kit.time - t0 < 0.5 || u.tfT > 0), t0 = kit.time;
      const rc = ribcage();
      own(kit, [rc], dur + 0.3, (t) => { if (!live()) return false; const k = Math.min(1, t / 0.3); rc.position.set(u.x, 0, u.z); rc.rotation.y = -u.aim; rc.scale.set(1, k, 1); });
            shell(kit, u.x, 1.8, u.z, 2.0, QS_VIO, { c2: QS_DEEP, p: 1.6, core: 0.05, alpha: 0.6, squash: 1.35, follow: u, life: dur, grow: 0.3, pulse: 1.4, step: () => live() });
      { const bow = new THREE.Group(), arc = new THREE.Mesh(bowGeo, basic(QS_VIO, true, 0.4)), str = new THREE.Mesh(strGeo, basic(QS_CY, true, 0.9)), ar = new THREE.Mesh(arrowGeo, basic(QS_CY, true, 1)), arc2 = new THREE.Mesh(bowGeo, basic(0x7418c8, false, 0.92)); bow.add(arc2, arc, str, ar);
        own(kit, [bow], dur + 0.3, (t) => { if (!live()) return false; const k = Math.min(1, t / 0.3); bow.position.set(u.x + Math.cos(u.aim) * 2.6, 2.2, u.z + Math.sin(u.aim) * 2.6); bow.rotation.y = -u.aim; bow.scale.setScalar(1.45 * k); }); }
      kit.flash(u.x, 2, u.z, QS_VIO, 60, 0.35); kit.kick(u.x, u.z, 0.4);
      kit.follow(u, dur, () => {
        if (!live()) return;
        for (let i = 0; i < 2; i++) { const b = Math.random() * 6.283, d = R(1.4, 2.6); kit.glow(u.x + Math.cos(b) * d, R(0.4, 3), u.z + Math.sin(b) * d, Math.random() < 0.75 ? QS_VIO : QS_CY, 0.5, R(0.6, 1.1), 1, kit.K.FLAME, 1.2, 0, R(3, 5), 0); }
      });
      return true;
    },
    transform(kit, e) { if (!e.on) { kit.ring(e.x, e.z, 2.6, QS_VIO, 0.35); kit.puffs(e.x, 1.5, e.z, kit.N(5), QS_DEEP, 0.9, 2, 0.8, 1.2, 2.4, 0.5, 0.6, kit.K.SMOKE, 2); } return true; },
  },
};

// fade every material in a group to k of its own opacity (used by the looks below)
function fadeAll(g, k) { g.traverse((m) => { if (m.material) { if (m.userData.op === undefined) m.userData.op = m.material.opacity; m.material.opacity = m.userData.op * k; } }); }

// ---- Ngưu Ma Vương: dark red bull, iron axe, lime demon fire ---------------------------------------------------------
const NM_LIME = C(1.1, 2.6, 0.25), NM_RED = C(2.2, 0.25, 0.12), NM_DARK = C(0.12, 0.3, 0.02);
const axeGeo = (() => { const s = new THREE.Shape(); s.moveTo(-0.2, -0.22); s.lineTo(0.45, -0.3); s.quadraticCurveTo(0.9, -0.8, 1.25, -1.15); s.quadraticCurveTo(1.75, 0, 1.25, 1.15); s.quadraticCurveTo(0.9, 0.8, 0.45, 0.3); s.lineTo(-0.2, 0.22); s.lineTo(-0.2, -0.22); return keep(new THREE.ShapeGeometry(s, 12).rotateX(-Math.PI / 2)); })();
const haftGeo = keep(new THREE.BoxGeometry(2.2, 0.12, 0.2).translate(-1.2, 0, 0));
function axe() { const g = new THREE.Group(), h = new THREE.Mesh(axeGeo, basic(NM_LIME, true, 0.85)), b = new THREE.Mesh(axeGeo, basic(0x2a1410, false, 0.95)), hf = new THREE.Mesh(haftGeo, basic(0x3a1a12, false, 1)); h.scale.setScalar(1.3); h.position.set(-0.15, -0.02, 0); g.add(h, b, hf); return g; }
const hornGeo = (() => { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.5, 0.15, 0.55), new THREE.Vector3(1.2, 0.55, 0.75), new THREE.Vector3(1.75, 1.2, 0.45)]); return keep(new THREE.TubeGeometry(c, 14, 0.2, 6)); })();
const hornTip = keep(new THREE.ConeGeometry(0.2, 0.6, 6).rotateZ(-0.6).translate(1.9, 1.45, 0.4));
function horns(glowOp = 0.7) {
  const g = new THREE.Group(), m = basic(0xe8dcc0, false, 1), gl = basic(NM_LIME, true, glowOp);
  for (const sd of [-1, 1]) { const h = new THREE.Group(); h.add(new THREE.Mesh(hornGeo, m), new THREE.Mesh(hornTip, m)); const hg = new THREE.Mesh(hornGeo, gl); hg.scale.setScalar(1.15); h.add(hg); h.scale.z = sd; h.position.z = sd * 0.35; g.add(h); }
  return g;
}
const nguma = {
  // Sóng Rìu: three iron axe heads wrapped in lime fire fly out, blade first, each leaving a lime wake
  nmAxe: {
    pal: [NM_DARK, NM_LIME], hitR: 1.8,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.5, 1.3, u.z + Math.sin(e.a) * 1.5, NM_LIME, 0.15, 2.4, 1, kit.K.STAR, 1.3); return true; },
    shotMake(kit, s) { const g = axe(); g.scale.setScalar(2.6); const v = { g, h: held(kit, [g]), a: Math.atan2(s.dz, s.dx), x: s.x, z: s.z, live: true }; trail(kit, () => (v.live ? [v.x, 1.0, v.z] : null), 2.0, NM_LIME, 0.45, { c2: NM_DARK, len: 12 }); return v; },
    shot(kit, v, s, x, y, z) { v.x = x; v.z = z; v.g.position.set(x, 1.1, z); v.g.rotation.set(0, -v.a, 0); if (Math.random() < 0.5) kit.glow(x, 1.1, z, NM_LIME, 0.3, 0.6, 1, kit.K.FLAME, 1.1, 0, R(1, 3), 0); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; v.h.on = false; kit.sparks(x, 1.1, z, kit.N(8), NM_LIME, 7, 0.3, 0.05, 0.5, 8); },
  },
  // Húc Ma: great horns lower in front of him, two hoof tracks burn behind and dust boils up; where he stops, a lime blow
  nmCharge: {
    pal: [NM_RED, NM_LIME], hitR: 2,
    skill(kit, e, u) {
      const a = e.a, ca = Math.cos(a), sa = Math.sin(a), h = horns(); let done = false;
      own(kit, [h], 0.75, (t) => {
        if (!u.alive) return false;
        const go = !done; if (go && t > 0.06 && !u.dash) { done = true; burst(kit, u.x + ca * 2, u.z + sa * 2, 2.4, NM_RED, NM_LIME); kit.kick(u.x, u.z, 0.5); }
        h.position.set(u.x + ca * 0.9, 0.7, u.z + sa * 0.9); h.rotation.y = -a; h.scale.setScalar(2.2); fadeAll(h, done ? Math.max(0, 1 - (t - 0.35) / 0.3) : 1);
        if (!done) { for (const sd of [-1, 1]) kit.scorch(u.x + sa * sd * 0.7, u.z - ca * sd * 0.7, 0.45, 3, 1.2, NM_LIME); if (Math.random() < 0.6) kit.puffs(u.x - ca, 0.4, u.z - sa, 1, C(0.45, 0.32, 0.22), 0.6, 2, 0.8, 1.2, 2.2, 0.6, 0.5, kit.K.DUST, 3); }
      });
      for (const sd of [-1, 1]) trail(kit, (t) => (t < 0.4 && u.alive && (t < 0.06 || u.dash) ? [u.x + ca * 2.4 - sa * sd * 1.6, 1.8, u.z + sa * 2.4 + ca * sd * 1.6] : null), 0.7, NM_LIME, 0.6, { c2: NM_DARK, len: 14 });
      return true;
    },
  },
  // Pháp Tướng: a giant pair of lime demon horns rises over him, lime arcs swirl round him; after the wind-up the ground
  // quakes in a ring of lime fire with red cracks
  nmAvatar: {
    pal: [NM_RED, NM_LIME], hitR: 2.4,
    skill(kit, e, u, row) {
      const dur = row.dur || 6, t0 = kit.time, live = () => u.alive && (kit.time - t0 < 0.6 || u.tfT > 0), wind = (row.nova && row.nova.windup) || 0.3, R6 = (row.nova && row.nova.radius) || 6;
      const h = horns(0.9);
      own(kit, [h], dur + 0.3, (t) => { if (!live()) return false; const k = Math.min(1, t / 0.3); h.position.set(u.x - Math.cos(u.aim) * 0.6, 2.2 + 0.6 * k, u.z - Math.sin(u.aim) * 0.6); h.rotation.set(0, -u.aim, 1.15); h.scale.setScalar(2.4 * k); });
      sigil(kit, u.x, u.z, 4.2, NM_LIME, { c2: NM_RED, n: 0, ticks: 9, inner: 0.82, fill: 0.14, w: 0.12, spin: 2.5, follow: u, life: dur, rev: 0.2, alpha: 0.9 });
      sigil(kit, u.x, u.z, 3.0, NM_LIME, { n: 0, ticks: 6, inner: 0.7, fill: 0, w: 0.1, spin: -3.5, follow: u, life: dur, rev: 0.2, alpha: 0.8 });
      kit.anims.push({ t: 0, step(dt) { this.t += dt; if (this.t < wind) return true; if (!u.alive) return false;
        const x = u.x, z = u.z;
        sigil(kit, x, z, R6, NM_LIME, { c2: NM_RED, n: 0, ticks: 0, inner: 0.72, fill: 0.55, life: 0.6, rev: 0.12, w: 0.1 });
        shell(kit, x, 1.2, z, R6 * 0.6, NM_LIME, { c2: C(2.2, 2.6, 1.2), p: 1.1, core: 0.3, life: 0.7, grow: 0.1 });
        for (const [rr, sp] of [[0.95, 4], [0.75, -5], [0.55, 6]]) sigil(kit, x, z, R6 * rr, NM_RED, { c2: NM_LIME, n: 0, ticks: 5, inner: 0.86, fill: 0, w: 0.16, spin: sp, life: 0.8, rev: 0.1 });
        for (let i = 0; i < kit.N(20); i++) { const b = Math.random() * 6.283, d = R6 * R(0.6, 1); kit.glow(x + Math.cos(b) * d, 0.3, z + Math.sin(b) * d, NM_LIME, 0.6, R(0.7, 1.2), 1, kit.K.FLAME, 1.2, 0, R(3, 6), 0); }
        kit.flash(x, 2, z, NM_LIME, 70, 0.35); kit.kick(x, z, 0.9);
        return false; }, drop() {} });
      kit.follow(u, dur, () => { if (live() && Math.random() < 0.5) { const b = Math.random() * 6.283; kit.glow(u.x + Math.cos(b) * 1.4, R(0.3, 1.5), u.z + Math.sin(b) * 1.4, NM_LIME, 0.5, 0.6, 1, kit.K.FLAME, 1.2, 0, R(2, 4), 0); } });
      return true;
    },
    transform(kit, e) { if (!e.on) kit.ring(e.x, e.z, 3, NM_LIME, 0.35); return true; },
  },
};

// ---- Black Panther (Báo Gấm) moved to looks-k9.js with the kit ported from clip p89 ----------------------------------

// ---- Lôi Công: the golden hammer, gold lightning, an orange blast disc with a blue rim, storm cloud ---------------------
const LC_GOLD = C(2.6, 1.9, 0.45), LC_ORG = C(2.6, 0.8, 0.12), LC_BLUE = C(0.35, 1.1, 2.5);
const hamHead = keep(new THREE.BoxGeometry(1.5, 0.95, 0.95)), hamRim = keep(new THREE.BoxGeometry(1.62, 1.05, 1.05)), hamHaft = keep(new THREE.CylinderGeometry(0.11, 0.13, 1.6, 6).translate(0, 1.25, 0)), hamPom = keep(new THREE.SphereGeometry(0.17, 8, 6).translate(0, 2.1, 0));
function hammer() { const g = new THREE.Group(), m = basic(0xb8bcc8, false, 1), w = basic(0x5a3018, false, 1), gl = basic(LC_GOLD, true, 0.75); g.add(new THREE.Mesh(hamRim, gl), new THREE.Mesh(hamHead, m), new THREE.Mesh(hamHaft, w), new THREE.Mesh(hamPom, m)); return g; }
// the blast where the hammer lands: an orange disc with a blue rim, gold cracks running out
function hammerBlast(kit, x, z, r, life = 0.55) {
  sigil(kit, x, z, r, LC_ORG, { c2: LC_GOLD, n: 0, ticks: 0, inner: 0, fill: 0.9, life, rev: 0.05, alpha: 0.85, w: 0 });
  sigil(kit, x, z, r * 1.08, LC_BLUE, { n: 0, ticks: 0, inner: 0.9, fill: 0.5, life: life + 0.05, rev: 0.06, w: 0.1 });
  for (let i = 0; i < 7; i++) { const b = i * 0.9 + R(-0.2, 0.2), L = r * R(0.8, 1.1); zap(kit, [x, 0.3, z], [x + Math.cos(b) * L, 0.3, z + Math.sin(b) * L], 0.3, LC_GOLD, life * 0.75, { segs: 6, jit: 0.4, every: 9 }); }
  kit.flash(x, 2, z, LC_GOLD, 60, 0.3); kit.kick(x, z, 0.6);
}
const loi = {
  // Màn Khói: a storm cloud settles on the spot, dark blue-grey billows, gold lightning flickering inside
  lcCloud: {
    skill() { return true; },
    zoneMake(kit, z) {
      const blobs = [];
      for (let i = 0; i < 16; i++) { const b = i * 2.4 + (z.id || 0), d = z.r * Math.sqrt((i + 0.5) / 16) * 0.8; blobs.push(shell(kit, z.x + Math.cos(b) * d, 1.4 + (i % 3) * 0.35, z.z + Math.sin(b) * d, z.r * R(0.32, 0.42), C(0.24, 0.26, 0.34), { c2: C(0.07, 0.08, 0.12), inv: 0.9, core: 1.1, squash: 0.6, life: 1e9, grow: 0.35, alpha: 0.95 })); }
      const disc = sigil(kit, z.x, z.z, z.r, C(0.06, 0.07, 0.1), { n: 0, ticks: 0, inner: 0, fill: 1, life: 1e9, rev: 0.2, alpha: 0.6, w: 0, y: 0.11 });
      return { blobs, disc, acc: 0 };
    },
    zone(kit, v, z, dt) {
      v.acc += dt; const end = z.dur - z.age;
      v.blobs.forEach((b, i) => { b.position.y = 1.4 + (i % 3) * 0.35 + Math.sin(z.age * 1.5 + i) * 0.2; });
      if (v.acc > 0.22 && end > 0.3) { v.acc = 0; const b = Math.random() * 6.283, d = z.r * R(0.1, 0.6), c = Math.random() * 6.283, x0 = z.x + Math.cos(b) * d, z0 = z.z + Math.sin(b) * d; zap(kit, [x0, 2.4, z0], [x0 + Math.cos(c) * R(2, 3.5), 1.2, z0 + Math.sin(c) * R(2, 3.5)], 0.35, LC_GOLD, 0.14, { segs: 7, jit: 0.5 }); kit.glow(x0, 2.2, z0, LC_GOLD, 0.15, 3, 0.7, kit.K.GLOW, 1.2); }
    },
    zoneDrop(kit, v) { v.blobs.forEach(stop); stop(v.disc); },
  },
  // Giật Lùi: the hammer slams down at his feet in an orange blast with gold cracks; gold lightning follows him as he flies back
  lcRecoil: {
    pal: [LC_ORG, LC_GOLD], hitR: 1.8,
    skill(kit, e, u, row) {
      const x = e.x, z = e.z, r = row.radius || 3.5, h = hammer(); h.scale.setScalar(2.4);
      own(kit, [h], 0.95, (t) => { h.position.set(x, Math.max(1.1, 6 - t * 60), z); h.rotation.set(0, -e.a, 0.3); fadeAll(h, Math.min(1, (0.95 - t) / 0.25)); });
      hammerBlast(kit, x, z, r, 0.95);
      zap(kit, [x, 1.2, z], (t) => (t < 0.35 && u.alive ? [u.x, 1.2, u.z] : null), 0.7, LC_GOLD, 0.95, { segs: 10, jit: 0.7 });
      trail(kit, (t) => (t < 0.35 && u.alive ? [u.x, 0.6, u.z] : null), 1.6, LC_ORG, 0.95, { c2: C(0.5, 0.1, 0.02), len: 12 });
      return true;
    },
  },
  // Thiên Lôi: a hammer drops out of the sky on each spot, riding a gold bolt; each lands in the orange blast
  lcHammer: {
    zones: ['strike'], ownDisc: true, pal: [LC_ORG, LC_GOLD], hitR: 1.8,
    skill() { return true; },
    zoneMake(kit, z) {
      const h = hammer(); h.scale.setScalar(1.7);
      const v = { h, hold: held(kit, [h]), y: 9, live: true };
      zap(kit, () => (v.live ? [z.x + 0.4, 18, z.z] : null), () => [z.x, v.y + 2.2, z.z], 0.5, LC_GOLD, 1e9, { segs: 10, jit: 0.6 });
      v.s = sigil(kit, z.x, z.z, 1.8, LC_BLUE, { c2: LC_GOLD, n: 0, ticks: 4, inner: 0.6, life: 1e9, rev: 0.1, fill: 0.15, w: 0.08 });
      return v;
    },
    zone(kit, v, z) { const k = z.delay / (z.total || 1); v.y = 0.5 + 8.5 * k; v.h.position.set(z.x, v.y, z.z); v.h.rotation.y = z.age * 3; },
    zoneDrop(kit, v) { v.live = false; v.hold.on = false; stop(v.s); },
    land(kit, e) {
      const h = hammer(); h.scale.setScalar(1.7);
      own(kit, [h], 0.7, (t) => { h.position.set(e.x, 0.8, e.z); fadeAll(h, Math.min(1, (0.7 - t) / 0.25)); });
      zap(kit, [e.x, 18, e.z], [e.x, 0.6, e.z], 1.0, LC_GOLD, 0.25, { segs: 12, jit: 0.8 });
      hammerBlast(kit, e.x, e.z, 2.8);
      return true;
    },
  },
};

// ---- Mãng Xà: a green python, dark scales, lime light, yellow eyes ---------------------------------------------------
const MX_LIME = C(0.5, 2.6, 0.5), MX_YEL = C(2.4, 2.3, 0.3), MX_SCALE = 0x1f5a2a;
const sHead = keep(new THREE.SphereGeometry(0.5, 12, 8).scale(1.3, 0.45, 0.85)), sJaw = keep(new THREE.ConeGeometry(0.4, 1.1, 4).rotateZ(-Math.PI / 2).scale(1, 0.35, 1).translate(0.55, 0, 0)), sEye = keep(new THREE.SphereGeometry(0.1, 6, 4));
function snakeHead() {
  const g = new THREE.Group(), m = basic(MX_SCALE, false, 1), gl = basic(MX_LIME, true, 0.7), up = new THREE.Mesh(sJaw, m), lo = new THREE.Mesh(sJaw, basic(0x8a1020, false, 1)), glow = new THREE.Mesh(sHead, gl);
  up.position.set(0.25, 0.12, 0); up.rotation.z = 0.35; lo.position.set(0.25, -0.08, 0); lo.rotation.z = -0.35; glow.scale.setScalar(1.5);
  g.add(glow, new THREE.Mesh(sHead, m), up, lo);
  for (const sd of [-1, 1]) { const e = new THREE.Mesh(sEye, basic(MX_YEL, true, 1)); e.position.set(0.25, 0.2, sd * 0.25); g.add(e); }
  g.userData.jaws = [up, lo];
  return g;
}
// a serpent body from p0 to p1 ([x, y, z]), wiggling, thick at the middle, a lime stripe down its back
function serpentPts(p0, p1, t, amp, n = 20, ph = 0) {
  const dx = p1[0] - p0[0], dz = p1[2] - p0[2], L = Math.hypot(dx, dz) || 1, sx = -dz / L, sz = dx / L, pts = [];
  for (let i = 0; i < n; i++) { const f = i / (n - 1), w = Math.sin(f * L * 0.9 - t * 18 + ph) * amp * Math.sin(f * Math.PI); pts.push([p0[0] + dx * f + sx * w, p0[1] + (p1[1] - p0[1]) * f, p0[2] + dz * f + sz * w]); }
  return pts;
}
const mangxa = {
  // Móc Xích: a python lunges along the hook, jaws open, its body uncoiling from him; it snaps shut on what it catches
  mxBite: {
    pal: [MX_LIME, MX_YEL], hitR: 1.8,
    skill(kit, e, u) {
      const h = snakeHead(), body = ribbonMesh(22, MX_SCALE, false, 0.95), stripe = ribbonMesh(22, MX_LIME, true, 0.9);
      let sid = -1, hx = u.x, hz = u.z, back = -1;
      own(kit, [h, body, stripe], 2, (t, dt) => {
        if (!u.alive) return false;
        const m = kit.match, s = m && (sid >= 0 ? m.shots.find((q) => q.id === sid) : m.shots.find((q) => q.owner === u.id && q.vis === 'hook'));
        if (s) { sid = s.id; hx = s.x; hz = s.z; } else if (t > 0.1 || sid >= 0) { if (back < 0) back = t; const f = Math.min(1, dt * 10); hx += (u.x - hx) * f; hz += (u.z - hz) * f; }
        else { hx = u.x + Math.cos(e.a) * 1.5; hz = u.z + Math.sin(e.a) * 1.5; }
        if (back >= 0 && (t - back > 0.35 || Math.hypot(hx - u.x, hz - u.z) < 1)) return false;
        const a = Math.atan2(hz - u.z, hx - u.x), pts = serpentPts([u.x, 1.0, u.z], [hx - Math.cos(a) * 0.4, 1.15, hz - Math.sin(a) * 0.4], t, 0.7);
        fillRibbon(body, pts, (f) => 0.4 + 0.6 * Math.sin(Math.min(1, f * 1.3) * Math.PI * 0.5 + 0.3)); fillRibbon(stripe, pts.map((p) => [p[0], p[1] + 0.03, p[2]]), (f) => 0.1 + 0.18 * f);
        h.position.set(hx, 1.2, hz); h.rotation.y = -a; h.scale.setScalar(3);
        const [up, lo] = h.userData.jaws, o = back >= 0 ? 0.05 : 0.45 + 0.15 * Math.sin(t * 20); up.rotation.z = o; lo.rotation.z = -o;
      });
      return true;
    },
    hook(kit, e) { kit.sparks(e.x, 1.2, e.z, kit.N(12), MX_LIME, 7, 0.35, 0.06, 0.6, 8); burst(kit, e.x, e.z, 2, MX_LIME, MX_YEL); return true; },
  },
  // Hoán Vị: two serpents, green and gold, coil round each other from both ends of the swap; a green coil ring at each end
  mxSwap: {
    pal: [MX_LIME, MX_YEL], hitR: 1.6,
    skill() { return true; },
    swap(kit, e) {
      const A = [e.x0, 1.1, e.z0], B = [e.x1, 1.1, e.z1];
      for (const [p0, p1, c, ph] of [[A, B, MX_LIME, 0], [B, A, MX_YEL, Math.PI]]) {
        const body = ribbonMesh(24, MX_SCALE, false, 0.95), glow = ribbonMesh(24, c, true, 0.85), h = snakeHead();
        own(kit, [body, glow, h], 0.8, (t) => {
          const k = Math.min(1, t / 0.3), f = Math.min(1, (0.8 - t) / 0.3), q = [p0[0] + (p1[0] - p0[0]) * k, 1.1, p0[2] + (p1[2] - p0[2]) * k];
          const pts = serpentPts(p0, q, t * 0.3, 1.1, 24, ph);
          fillRibbon(body, pts, (g) => 0.15 + 0.3 * Math.sin(g * Math.PI * 0.9 + 0.2)); fillRibbon(glow, pts.map((p) => [p[0], p[1] + 0.03, p[2]]), (g) => 0.06 + 0.12 * g);
          const a = Math.atan2(p1[2] - p0[2], p1[0] - p0[0]); h.position.set(q[0], 1.25, q[2]); h.rotation.y = -a; h.scale.setScalar(1.8);
          body.material.opacity = 0.95 * f; glow.material.opacity = 0.85 * f; fadeAll(h, f);
        });
      }
      for (const p of [A, B]) sigil(kit, p[0], p[2], 2, MX_LIME, { c2: MX_YEL, n: 0, ticks: 14, inner: 0.72, fill: 0.3, w: 0.12, spin: 5, life: 0.8, rev: 0.1 });
      kit.flash(e.x1, 1.6, e.z1, MX_LIME, 35, 0.25);
      return true;
    },
  },
  // Lồng Xích: three tilted serpent rings turn round the field like a gyroscope, heads chasing tails, venom mist on the floor
  mxCage: {
    pal: [MX_LIME, MX_YEL], hitR: 1.6,
    zoneMake(kit, z) {
      const g = new THREE.Group(), r = z.r * 0.92, rings = [];
      const tor = new THREE.TorusGeometry(r, 0.45, 6, 56), torG = new THREE.TorusGeometry(r, 0.2, 4, 56);
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Group(), q = new THREE.Group();
        q.add(new THREE.Mesh(tor, basic(MX_SCALE, false, 0.95)), new THREE.Mesh(torG, basic(MX_LIME, true, 0.9)));
        const h = snakeHead(); h.position.set(r, 0, 0); h.rotation.set(Math.PI / 2, 0, Math.PI / 2); h.scale.setScalar(2.2); q.add(h);
        q.rotation.x = Math.PI / 2; p.add(q); p.rotation.set(i === 0 ? 0 : 0.42, i * 2.094, i === 0 ? 0 : 0.2); g.add(p); rings.push(q);
      }
      g.position.set(z.x, 1.5, z.z);
      const hold = held(kit, [g]);
      const rim = sigil(kit, z.x, z.z, z.r, MX_LIME, { c2: MX_YEL, n: 0, ticks: 0, inner: 0.9, fill: 0.35, life: 1e9, rev: 0.3, w: 0.08 });
      return { g, rings, hold, rim, tor, torG };
    },
    zone(kit, v, z, dt) {
      const end = Math.min(1, (z.dur - z.age) * 2.5), k = Math.min(1, z.age / 0.3);
      v.g.scale.set(k, k, k); v.rings.forEach((q, i) => { q.rotation.z += dt * (1.6 + i * 0.5) * (i % 2 ? -1 : 1); });
      if (end < 1) fadeAll(v.g, end);
      if (Math.random() < dt * 14) { const b = Math.random() * 6.283, d = Math.random() * z.r; kit.glow(z.x + Math.cos(b) * d, 0.3, z.z + Math.sin(b) * d, MX_LIME, 0.6, R(0.6, 1.1), 0.6, kit.K.GLOW, 1, 0, R(0.5, 1.5), 0); }
    },
    zoneDrop(kit, v) { v.hold.on = false; stop(v.rim); v.tor.dispose(); v.torG.dispose(); },
  },
};

export const B5 = { ...quaset, ...nguma, ...loi, ...mangxa };
export { zap, forks, ribbonMesh, fillRibbon };
