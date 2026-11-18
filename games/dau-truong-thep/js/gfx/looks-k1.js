// Looks, kit lane K1: Hulk, Captain America, Tư Mã Ý, Star Lord, remade with their kits from the owner's clips (bilibili
// BV1Kp4y1b7i6; kit notes in ~/handoff/dtt-ref/kits/AUDIT-*.md). Render only (see looks.js for the hooks). One main colour and one
// accent per tank, one strong shape per skill, "giống clip + đẹp mắt, đừng phô": bursts are only brief flashes where blows land.
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, slash, cut, sigil, shell, pillar, trail, spikes, burst } from './lookkit.js';
import { zap, forks, ribbonMesh, fillRibbon } from './looks-b5.js';

const R = (a, b) => a + Math.random() * (b - a);
const keep = (g) => { g.userData.keep = true; return g; };
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
function fadeAll(g, k) { g.traverse((m) => { const t = m.material; if (t) { if (t.userData.op === undefined) t.userData.op = t.opacity; t.opacity = t.userData.op * k; } }); }
const muz = (kit, u, a, c, c2) => { const x = u.x + Math.cos(a) * 1.4, z = u.z + Math.sin(a) * 1.4; kit.glow(x, 1.3, z, c2, 0.12, 1.6, 1, kit.K.STAR, 1.3); kit.flash(x, 1.5, z, c, 25, 0.15); };

// ---- Hulk: jade green, lime lightning (clip p23 "20.巨人") ----------------------------------------------------------------
// The clip: the roar is a green sphere round him wrapped in crawling lime lightning; the stomp shows a pale ring on the floor
// where he comes down; the rage starts with a green flame column swallowing him and a giant green spectral fist overhead.
const HK_GREEN = C(0.3, 1.7, 0.4), HK_JADE = C(0.08, 0.95, 0.22), HK_LIME = C(1.9, 2.6, 0.35), HK_DEEP = C(0.05, 0.45, 0.12), HK_PALE = C(1.4, 2.4, 1.3), HK_SOOT = C(0.12, 0.1, 0.06);

// a giant fist seen as green light: four knuckle lumps, a thumb, a wrist; drawn twice (a solid deep-green body, a lime glow skin)
const FIST = (() => {
  const s = (sx, sy, sz, x, y, z) => keep(new THREE.SphereGeometry(1, 14, 10).scale(sx, sy, sz).translate(x, y, z));
  const parts = [s(0.62, 0.55, 0.7, 0, 0, 0)];
  for (let i = 0; i < 4; i++) parts.push(s(0.2, 0.22, 0.18, 0.55, 0.12 - i * 0.02, -0.42 + i * 0.28));
  parts.push(s(0.36, 0.2, 0.2, 0.25, -0.28, 0.6));
  parts.push(keep(new THREE.CylinderGeometry(0.42, 0.5, 1.4, 12).rotateZ(Math.PI / 2).translate(-1.05, 0, 0)));
  return parts;
})();
function hkFist() {
  const g = new THREE.Group(), body = basic(0x2a8a2c, false, 0.95), skin = basic(HK_GREEN, true, 0.22);
  for (const p of FIST) { g.add(new THREE.Mesh(p, body)); const q = new THREE.Mesh(p, skin); q.scale.setScalar(1.12); g.add(q); }
  g.traverse((q) => { q.frustumCulled = false; q.renderOrder = 8; });
  return g;
}
// cracks in the floor: dark jagged lines out from the centre with a green glow in them
function hkCracks(kit, x, z, r, n, life) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + R(-0.25, 0.25), L = r * R(0.7, 1.05);
    zap(kit, [x + Math.cos(a) * 0.6, 0.06, z + Math.sin(a) * 0.6], [x + Math.cos(a) * L, 0.06, z + Math.sin(a) * L], 0.16, HK_DEEP, life, { segs: 7, jit: 0.35, core: HK_GREEN });
  }
}

const khidot = {
  // Chấn Không Nộ Hống: he draws breath (green light gathers on him), then roars: a green sphere bursts out to the full radius,
  // lime lightning crawling over its skin, a pale shock ring running along the floor
  hkRoar: {
    pal: [HK_GREEN, HK_LIME], hitR: 1.8,
    skill() { return true; },
    castMake() { return { t: 0 }; },
    cast(kit, v, u, s, k) {
      kit.glow(u.x, 1.4, u.z, HK_GREEN, 0.08, 1.6 + 1.6 * k, 0.35 + 0.35 * k, kit.K.GLOW, 1);
      if (Math.random() < 0.6) { const a = Math.random() * 6.283, rr = 2.6 * (1 - k) + 0.8; kit.str.emit(u.x + Math.cos(a) * rr, R(0.4, 2), u.z + Math.sin(a) * rr, -Math.cos(a) * 9, 0, -Math.sin(a) * 9, HK_LIME, 0.18, 0.08, 0.05, 0, 0, 1); }
    },
    nova(kit, e, u) {
      const r = e.r || 5;
      shell(kit, e.x, 0, e.z, r * 0.95, HK_JADE, { c2: HK_GREEN, p: 1.4, core: 0.3, bands: 0.8, life: 0.75, grow: 0.12, dome: true, alpha: 1, fade: 0.35 });
      sigil(kit, e.x, e.z, r, HK_JADE, { c2: HK_LIME, n: 0, ticks: 24, inner: 0.35, fill: 0.45, life: 0.7, rev: 0.06, alpha: 0.95, fade: 0.35 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * 6.283 + R(-0.3, 0.3), b = a + R(0.7, 1.3), h1 = R(0.6, 2.6), h2 = R(0.3, 2.2);
        const p = (ang, h) => { const rr = Math.sqrt(Math.max(0.1, r * r * 0.9 - h * h)); return [e.x + Math.cos(ang) * rr, h, e.z + Math.sin(ang) * rr]; };
        zap(kit, p(a, h1), p(b, h2), 0.24, HK_LIME, R(0.35, 0.6), { segs: 9, jit: 0.45 });
      }
      kit.ring(e.x, e.z, r * 1.05, HK_PALE, 0.45, 0.9); kit.ring(e.x, e.z, r * 0.6, HK_LIME, 0.3, 0.7);
      kit.glow(e.x, 1.4, e.z, HK_LIME, 0.15, 2.6, 0.9, kit.K.STAR, 1.3);
      kit.puffs(e.x, 0.4, e.z, kit.N(6), HK_SOOT, r * 0.6, 3.2, 0.8, 1.3, 2.4, 0.5, 0.45, kit.K.DUST, 3);
      kit.flash(e.x, 2, e.z, HK_GREEN, 55, 0.3); kit.kick(e.x, e.z, 0.6);
      return true;
    },
    hit(kit, e) { zap(kit, [e.x, 2.4, e.z], [e.x + R(-0.6, 0.6), 0.4, e.z + R(-0.6, 0.6)], 0.1, HK_LIME, 0.2, { segs: 6, jit: 0.4 }); kit.glow(e.x, 1.2, e.z, HK_GREEN, 0.2, 1.6, 0.8, kit.K.GLOW, 1.3); },
  },
  // Tử Vong Tiễn Đạp: while he crouches, a pale ring marks where he will land; he arcs over trailing green, and comes down
  // feet first: the floor cracks in a star of green-lit fissures, a pale shock ring and thrown earth
  hkStomp: {
    pal: [HK_GREEN, HK_PALE], hitR: 1.8,
    skill(kit, e, u, row) {
      const x = e.tx ?? u.x, z = e.tz ?? u.z, Rr = row.radius || 3.5, life = (row.windup || 0.25) + (row.flight || 0.55) + 0.1;
      sigil(kit, x, z, Rr, HK_PALE, { n: 0, ticks: 0, inner: 0.55, fill: 0.12, life, rev: 0.15, alpha: 0.85 });
      kit.follow(u, life, (t) => { const p = 0.6 + 0.4 * Math.sin(t * 16); kit.glow(x, 0.3, z, HK_GREEN, 0.06, Rr * 0.7 * p, 0.35, kit.K.GLOW, 1); });
      return true;
    },
    castMake() { return {}; },
    cast(kit, v, u, s, k) { kit.glow(u.x, 0.4, u.z, HK_GREEN, 0.08, 1.5 + 1.5 * k, 0.5, kit.K.GLOW, 1); if (Math.random() < 0.5) kit.chips(u.x, 0.2, u.z, 1, C(0.3, 0.25, 0.18), 3, 0.5, 0.12); },
    leap(kit, e, u) {
      const dur = e.dur || 0.55;
      trail(kit, (t) => (t < dur + 0.05 && u.alive ? [u.x, 1.2 + Math.sin(Math.min(1, t / dur) * Math.PI) * 3, u.z] : null), 1.4, HK_GREEN, dur + 0.35, { c2: HK_LIME, len: 14, up: true });
      return true;
    },
    nova(kit, e) {
      const r = e.r || 3.5;
      hkCracks(kit, e.x, e.z, r * 1.25, 10, 1.0);
      sigil(kit, e.x, e.z, r * 1.1, HK_JADE, { c2: HK_PALE, n: 0, ticks: 0, inner: 0.5, fill: 0.55, life: 0.6, rev: 0.04, alpha: 0.95, fade: 0.4 });
      shell(kit, e.x, 0, e.z, r * 0.8, HK_JADE, { c2: HK_PALE, p: 1.6, core: 0.2, life: 0.45, grow: 0.08, dome: true, squash: 0.55, alpha: 0.9, fade: 0.3 });
      kit.ring(e.x, e.z, r * 1.1, HK_PALE, 0.4, 1); kit.ring(e.x, e.z, r * 0.55, HK_LIME, 0.25, 0.8);
      kit.glow(e.x, 0.8, e.z, HK_GREEN, 0.3, r * 1.4, 0.7, kit.K.GLOW, 1.2); kit.glow(e.x, 1.2, e.z, HK_PALE, 0.12, 2.4, 1, kit.K.STAR, 1.3);
      kit.chips(e.x, 0.4, e.z, kit.N(14), C(0.32, 0.25, 0.16), 9, 0.9, 0.24);
      kit.puffs(e.x, 0.4, e.z, kit.N(7), HK_SOOT, r * 0.5, 3.4, 0.8, 1.4, 2.4, 0.5, 0.55, kit.K.DUST, 3);
      kit.scorch(e.x, e.z, r * 0.5, 3, 1.4, HK_GREEN);
      kit.flash(e.x, 2, e.z, HK_GREEN, 50, 0.3); kit.kick(e.x, e.z, 0.8);
      return true;
    },
    hit(kit, e) { kit.sparks(e.x, 0.8, e.z, kit.N(10), HK_LIME, 6, 0.45, 0.05, 2.5, 6); },
  },
  // Dã Man Chi Nộ: a green flame column swallows him and a giant spectral fist comes down on him from above; for the whole rage
  // a low green aura licks round him with lime sparks
  hkRage: {
    pal: [HK_GREEN, HK_LIME], hitR: 1.6,
    skill(kit, e, u, row) {
      const dur = row.dur || 8;
      pillar(kit, u.x, u.z, 1.9, HK_JADE, { c2: HK_JADE, h: 10, rings: 0.6, life: 1.0, grow: 0.08, follow: u, alpha: 0.9, fade: 0.4 });
      sigil(kit, u.x, u.z, 4.2, HK_JADE, { c2: HK_LIME, n: 0, ticks: 18, inner: 0.6, fill: 0.5, life: 1.0, rev: 0.08, follow: u, alpha: 0.95, fade: 0.4 });
      shell(kit, u.x, 0, u.z, 3.2, HK_JADE, { c2: HK_GREEN, p: 1.5, core: 0.25, life: 0.9, grow: 0.15, dome: true, follow: u, alpha: 0.9, fade: 0.4 });
      const f = hkFist();
      own(kit, [f], 0.9, (t) => {
        const k = Math.min(1, t / 0.25);
        f.position.set(u.x, 9 - 5.6 * k * k, u.z); f.rotation.set(0, Math.PI / 2, -1.0); f.scale.setScalar(2.6);
        fadeAll(f, Math.min(1, (0.9 - t) / 0.3));
        if (k >= 1 && !f.userData.hit) { f.userData.hit = true; kit.ring(u.x, u.z, 3.6, HK_LIME, 0.4); kit.kick(u.x, u.z, 0.6); }
      });
      kit.follow(u, dur, () => {
        if (u.tfT !== undefined && u.tfT <= 0) return;
        kit.glow(u.x, 0.6, u.z, HK_DEEP, 0.08, 3.0, 0.35, kit.K.GLOW, 1);
        if (Math.random() < 0.4) { const a = Math.random() * 6.283; kit.glow(u.x + Math.cos(a) * 1.3, R(0.3, 1.2), u.z + Math.sin(a) * 1.3, Math.random() < 0.6 ? HK_GREEN : HK_LIME, 0.4, 0.4, 0.9, kit.K.FLAME, 1.2, 0, R(1.5, 3.5), 0); }
        if (Math.random() < 0.05) zap(kit, [u.x + R(-1, 1), 2.2, u.z + R(-1, 1)], [u.x + R(-1.4, 1.4), 0.3, u.z + R(-1.4, 1.4)], 0.08, HK_LIME, 0.12, { segs: 5, jit: 0.4 });
      });
      kit.flash(u.x, 2, u.z, HK_GREEN, 60, 0.35);
      return true;
    },
    transform(kit, e) { if (!e.on) kit.puffs(e.x, 1, e.z, kit.N(5), C(0.2, 0.4, 0.2), 0.8, 2, 0.8, 1.1, 2, 0.6, 0.5, kit.K.SMOKE, 2); return true; },
  },
};

// ---- Captain America: shield red and white round a blue star, pale cyan accent (clip p21 "18.上尉") ---------------------------
// The clip: Vinh Diệu stands a big round shield (red and white rings, a white star on a blue centre) over the ally and over him,
// each inside a pale bubble; the thrown shield is the same emblem spinning flat; the ult draws a wide thin cyan ring with ticks
// round him and a white flare at his heart.
const CA_RED = C(2.1, 0.18, 0.2), CA_WHITE = C(2.4, 2.3, 2.2), CA_BLUE = C(0.25, 0.45, 2.2), CA_CYAN = C(0.6, 2.0, 2.3);
const ringG = (r0, r1) => keep(new THREE.RingGeometry(r0, r1, 48));
const CA_RINGS = [[ringG(0.82, 1.0), 0xd8202c], [ringG(0.64, 0.82), 0xf4f0ea], [ringG(0.46, 0.64), 0xd8202c], [keep(new THREE.CircleGeometry(0.46, 40)), 0x1f3fb0]];
const CA_STAR = (() => { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.17 : 0.42, a = Math.PI / 2 + i * Math.PI / 5; if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return keep(new THREE.ShapeGeometry(sh)); })();
const CA_RIM = keep(new THREE.RingGeometry(1.0, 1.12, 48));
// the emblem in its own xy plane, facing +z; a soft cyan rim glow round it
function caEmblem() {
  const g = new THREE.Group();
  CA_RINGS.forEach(([geo, c], i) => { const q = new THREE.Mesh(geo, basic(c, false, 0.97)); q.position.z = i * 0.01; g.add(q); });
  const st = new THREE.Mesh(CA_STAR, basic(0xffffff, false, 1)); st.position.z = 0.05; g.add(st);
  const rim = new THREE.Mesh(CA_RIM, basic(CA_CYAN, true, 0.55)); g.add(rim);
  g.traverse((q) => { q.frustumCulled = false; q.renderOrder = 9; });
  return g;
}
// the standing glory shield over unit o for dur s: the emblem tilted toward the camera above it, a pale bubble round it
function caGloryOn(kit, o, dur) {
  const g = caEmblem();
  shell(kit, o.x, 1.0, o.z, 1.7, CA_CYAN, { c2: CA_WHITE, p: 2.4, core: 0.04, follow: o, life: dur, grow: 0.12, alpha: 0.7 });
  own(kit, [g], dur, (t) => {
    if (!o.alive) return false;
    const k = Math.min(1, t / 0.12), out = Math.min(1, (dur - t) / 0.2);
    g.position.set(o.x, 2.2, o.z + 0.4); g.rotation.set(-0.85, 0, 0); g.scale.setScalar(1.55 * k * (0.9 + 0.1 * out));
    fadeAll(g, out);
  });
}
const tacke = {
  // Vinh Diệu Chi Thuẫn: the round shield stands over the ally and over him inside a pale bubble; a cyan line joins them
  caGlory: {
    pal: [CA_CYAN, CA_WHITE], hitR: 1.4,
    skill() { return true; },
    bless(kit, e, u, row) {
      const o = kit.match.units[e.to]; if (!o) return true;
      const dur = row.bubble || 1.25;
      caGloryOn(kit, o, dur); if (u && u !== o) { caGloryOn(kit, u, dur); const b = kit.beam(u.x, u.z, o.x, o.z, 0.35, CA_CYAN, 0.3, 2, 1.4); b.fade = true; }
      kit.ring(o.x, o.z, 2.0, CA_CYAN, 0.4); kit.glow(o.x, 2.2, o.z, CA_WHITE, 0.15, 2.4, 0.9, kit.K.STAR, 1.3); kit.flash(o.x, 2.4, o.z, CA_WHITE, 30, 0.25);
      return true;
    },
    impact(kit, e) { if (e.on !== 'dome') return false; kit.glow(e.x, 1.2, e.z, CA_WHITE, 0.1, 1.2, 1, kit.K.STAR, 1.2); kit.sparks(e.x, 1.1, e.z, kit.N(6), CA_CYAN, 6, 0.25, 0.04, 0.4, 8); return true; },
  },
  // Chính Nghĩa Chi Thuẫn: the shield thrown flat and spinning, a red-white ribbon behind; turning home it leaves a cyan ribbon
  caJustice: {
    pal: [CA_RED, CA_WHITE], hitR: 1.4,
    // the throw: two red crescents whipped round him (the clip's wind-up arcs) and a muzzle flash
    skill(kit, e, u) {
      muz(kit, u, e.a, CA_RED, CA_WHITE);
      slash(kit, u.x, u.z, e.a, 3.8, CA_RED, { c2: CA_WHITE, edge: CA_WHITE, spark: CA_WHITE, span: 1.6, life: 0.45, sweep: 0.1, w: 1.1 });
      slash(kit, u.x, u.z, e.a + 0.5, 2.8, CA_RED, { c2: CA_RED, edge: CA_WHITE, sparks: false, dir: -1, span: 1.3, life: 0.4, sweep: 0.12, w: 0.75 });
      kit.ring(u.x, u.z, 2.4, CA_RED, 0.35, 0.9);
      return true;
    },
    shotMake(kit, s) {
      const g = caEmblem(), h = held(kit, [g]), v = { g, h, x: s.x, z: s.z, on: true, spin: 0 };
      trail(kit, () => (v.on ? [v.x, 1.2, v.z] : null), 1.3, CA_RED, 2, { c2: CA_WHITE, len: 16 });
      trail(kit, () => (v.on && !s.back ? [v.x, 1.3, v.z] : null), 1.1, CA_RED, 2, { c2: CA_WHITE, len: 16, up: true });
      trail(kit, () => (v.on && s.back ? [v.x, 1.25, v.z] : null), 1.1, CA_CYAN, 2, { c2: CA_WHITE, len: 14 });
      return v;
    },
    shot(kit, v, s, x, y, z, dt) {
      v.x = x; v.z = z; v.spin += dt * 16;
      v.g.position.set(x, 1.2, z); v.g.rotation.set(-Math.PI / 2 + 0.35, 0, v.spin); v.g.scale.setScalar(1.5);
      kit.glow(x, 1.2, z, s.back ? CA_CYAN : CA_RED, 0.1, 2.4, 0.5, kit.K.GLOW, 1);
      return true;
    },
    shotEnd(kit, v, s, x, z) { v.on = false; v.h.on = false; kit.glow(x, 1.2, z, CA_WHITE, 0.12, 1.6, 0.9, kit.K.STAR, 1.2); },
    hit(kit, e) { kit.ring(e.x, e.z, 1.5, CA_WHITE, 0.3); kit.glow(e.x, 1.4, e.z, CA_CYAN, 0.2, 1.8, 0.9, kit.K.STAR, 1.3); kit.sparks(e.x, 1.4, e.z, kit.N(8), CA_WHITE, 7, 0.3, 0.05, 0.5, 8); },
  },
  // Dũng Khí Chi Thuẫn: a wide thin cyan ring with ticks spreads round him, a white flare at his heart, and the round shield rises
  // over every ally inside it while a pale shield shell (fading with the shield) wraps each
  caCourage: {
    pal: [CA_CYAN, CA_WHITE], hitR: 1.4,
    skill() { return true; },
    rally(kit, e, u, row) {
      const r = e.r || row.radius || 7, dur = row.shieldDur || 5;
      sigil(kit, e.x, e.z, r, CA_CYAN, { c2: CA_WHITE, n: 0, ticks: 36, inner: 0.9, fill: 0.08, life: 1.2, rev: 0.25, spin: 0.4, alpha: 0.95, fade: 0.5 });
      sigil(kit, e.x, e.z, r * 0.55, CA_RED, { c2: CA_WHITE, n: 5, m: 2, inner: 0, fill: 0.2, life: 1.0, rev: 0.15, spin: -0.6, alpha: 0.9, fade: 0.4 });
      kit.glow(e.x, 1.6, e.z, CA_WHITE, 0.3, 4.2, 1, kit.K.STAR, 1.4); kit.flash(e.x, 2.4, e.z, CA_WHITE, 55, 0.3);
      for (const o of kit.match.units) {
        if (!o.alive || o.team !== u.team || (o.x - e.x) ** 2 + (o.z - e.z) ** 2 > r * r) continue;
        caGloryOn(kit, o, 0.9);
        shell(kit, o.x, 1.0, o.z, 1.6, CA_CYAN, { c2: CA_BLUE, p: 2.2, core: 0.05, follow: o, life: dur, grow: 0.2, alpha: 0.55, fade: dur * 0.9 });
      }
      return true;
    },
  },
};

export const K1 = { ...khidot, ...tacke };
