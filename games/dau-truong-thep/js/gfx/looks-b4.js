// Looks, batch 4: Quan Công, Điêu Thuyền, Na Tra, Cửu Vĩ Hồ, Dương Tiễn, Gilgamesh. Render only (see looks.js for the hooks).
// Each look's own shape carries it; bursts are only brief flashes where blows land.
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP.md):
//   关羽 p5 (Quan Công): jade-yellow crescent slashes, a wide green crescent where the blade lands, a dark crater bursting with
//     green-yellow shards.
//   貂蝉 p60 (Điêu Thuyền): pink folding fans flying in a row, a pink rose bloom, hearts; our tank is ice, so the fans and the
//     lotus are ice-blue with pink edges.
//   哪吒 p64 (Na Tra): golden fire wheels, a red silk sash, a golden spiky star where he lands.
//   妖狐 p64→p67 (Cửu Vĩ Hồ): crimson fox-fire, an orange crosshair over the decoy, a wave of red flame petals.
//   二郎神 p68 (Dương Tiễn): cyan crescent guards, a blue diamond third-eye mark over the hunted foe, a cyan bolt.
//   英雄王 p74 (Gilgamesh): golden ripples open in the air and blades fly out of them, a golden sphere locks the target.
import * as THREE from '../../vendor/three.module.min.js';
import { orbPos } from '../sim.js';
import { C, own, stop, slash, cut, sigil, shell, pillar, trail, spikes, weapon, burst, gate } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: !add, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
const keep = (g) => { g.userData.keep = true; return g; };

// ---- Quan Công: Thanh Long Yển Nguyệt Đao, jade and gold ---------------------------------------------------------------
const QC_JADE = C(0.45, 2.4, 0.55), QC_GOLD = C(2.5, 2.0, 0.35), QC_DARK = C(0.05, 0.2, 0.05);
const quancong = {
  // Xung Phong: one long thin jade stroke is drawn along his charge as he runs, a thin gold dragon ribbon coiling round his
  // path; where he stops the dragon rears as an upright jade stroke and an X cut
  qcCharge: {
    pal: [QC_DARK, QC_JADE], hitR: 1.8,
    skill(kit, e, u) {
      const a = e.a;
      trail(kit, (t) => { if (t > 0.4 || !u.alive) return null; const w = Math.sin(t * 22) * 1.6; return [u.x - Math.sin(a) * w, 1.2 + Math.cos(t * 22) * 0.6, u.z + Math.cos(a) * w]; }, 0.55, QC_GOLD, 0.45, { c2: QC_DARK, len: 20 });
      // the charge stroke: a shallow arc (radius R, half-angle sp) whose chord is the 9 m charge, its centre off to the right
      const L = 13, sp = 0.65, Rr = L / (2 * Math.sin(sp)), n = a - Math.PI / 2, mx = u.x + Math.cos(a) * L / 2, mz = u.z + Math.sin(a) * L / 2;
      slash(kit, mx - Math.cos(n) * Rr * Math.cos(sp), mz - Math.sin(n) * Rr * Math.cos(sp), n, Rr, QC_JADE, { y: 1.2, life: 0.6, w: 1.75, span: sp, sweep: 0.22, erode: 0.2, arcs: 3, edge: QC_GOLD });
      kit.anims.push({ t: 0, step(dt) { this.t += dt; if (this.t < 0.32 && u.dash) return true;
        slash(kit, u.x, u.z, a, 4.4, QC_JADE, { y: 1.4, life: 0.4, span: 1.2, edge: QC_GOLD, tilt: 1.2 }); cut(kit, u.x + Math.cos(a) * 2.6, u.z + Math.sin(a) * 2.6, a, 2.6, QC_JADE, { edge: QC_GOLD }); return false; }, drop() {} });
      return true;
    },
  },
  // Yển Nguyệt: five reclining jade moons fan out and fly, each a thin blade stroke with a gold rim line
  qcMoon: {
    pal: [QC_DARK, QC_JADE], hitR: 1.8,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.4, 1.3, u.z + Math.sin(e.a) * 1.4, QC_GOLD, 0.12, 2, 1, kit.K.STAR, 1.3); return true; },
    shotMake(kit, s, row) { const a = Math.atan2(s.dz, s.dx), life = (row.range || 6) / (row.speed || 26) + 0.08; slash(kit, s.x, s.z, a, 4.2, QC_JADE, { y: 1.1, life, w: 0.7, span: 1.3, travel: row.speed || 26, sweep: 0.05, erode: 0.12, arcs: 1, edge: QC_GOLD }); return {}; },
    shot() { return true; },
    shotEnd(kit, v, s, x, z) { kit.sparks(x, 1.1, z, kit.N(6), QC_GOLD, 6, 0.25, 0.05, 0.5, 8); },
  },
  // Trảm Tướng: the great blade falls from above as a standing thin jade stroke; the floor splits in a dark crater with jade cracks
  // running out and jade shards thrown up
  qcBehead: {
    pal: [QC_DARK, QC_JADE], hitR: 2.2,
    skill() { return true; },
    nova(kit, e, u, s) {
      const r = e.r || 5;
      slash(kit, e.x, e.z, (e.a || u.aim) + Math.PI / 2, r * 1.35, QC_JADE, { y: 3, life: 0.55, w: r * 0.2, span: 1.3, sweep: 0.08, erode: 0.25, arcs: 3, edge: QC_GOLD, tilt: 1.25 });
      sigil(kit, e.x, e.z, r * 1.0, QC_DARK, { n: 0, ticks: 0, inner: 0, fill: 1.2, life: 1.2, rev: 0.05, alpha: 0.9, w: 0, y: 0.11 });
      for (let i = 0; i < 10; i++) { const a = i * 0.628 + R(-0.2, 0.2), L = r * R(0.8, 1.15); const b = kit.beam(e.x, e.z, e.x + Math.cos(a) * L, e.z + Math.sin(a) * L, 1.0, i % 2 ? QC_JADE : QC_GOLD, 0.9, 2, 0.15); b.fade = true; }
      spikes(kit, e.x, e.z, 16, r * 0.85, 3.8, QC_JADE, 0.9, { core: 0x0a3010, up: 0.08 });
      kit.flash(e.x, 2, e.z, QC_JADE, 60, 0.3); kit.kick(e.x, e.z, 0.7);
      return true;
    },
  },
};

// ---- Điêu Thuyền: ice fans and an ice lotus, pale blue with pink edges ---------------------------------------------------
const DT_ICE = C(0.6, 1.7, 2.6), DT_PINK = C(2.5, 0.7, 1.6), DT_WHITE = C(2.3, 2.5, 2.6);
// an open folding fan lying flat: a half-disc leaf and seven ribs, the pivot at the origin, opening toward +x
const fanLeaf = keep(new THREE.RingGeometry(0.35, 1.0, 20, 1, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2));
const fanRib = keep(new THREE.BoxGeometry(1.0, 0.04, 0.05).translate(0.5, 0.02, 0));
function fan(leaf = 0xa8dcff, edge = 0xff8fc8) {
  const g = new THREE.Group(), ml = basic(leaf, false, 0.85), mr = basic(0xffffff, false, 0.95), me = basic(edge, false, 0.95);
  g.add(new THREE.Mesh(fanLeaf, ml));
  const rim = new THREE.Mesh(keep(new THREE.RingGeometry(0.92, 1.04, 20, 1, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2)), me); rim.position.y = 0.01; g.add(rim);
  for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(fanRib, mr); r.rotation.y = -Math.PI / 2 + i * Math.PI / 6; g.add(r); }
  g.userData.mats = [ml, mr, me];
  return g;
}
// a petal: a pointed leaf along +x from the base at the origin, lying flat
const petalGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.5, 0.45, 1.3, 0); s.quadraticCurveTo(0.5, -0.45, 0, 0); return keep(new THREE.ShapeGeometry(s, 10).rotateX(-Math.PI / 2)); })();
const dieuthuyen = {
  // Băng Lưu: a great ice fan spins along the line, frost trail behind it, snowflakes shed off its edge
  dtStream: {
    pal: [DT_ICE, DT_PINK], hitR: 1.8,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.3, 1.3, u.z + Math.sin(e.a) * 1.3, DT_WHITE, 0.12, 2, 1, kit.K.STAR, 1.3); return true; },
    shotMake(kit, s) { const f = fan(); f.scale.setScalar(3.6); const v = { f, h: held(kit, [f]), x: s.x, z: s.z, live: true }; trail(kit, () => (v.live ? [v.x, 1.2, v.z] : null), 2.4, DT_ICE, 0.6, { c2: DT_PINK, len: 14 }); return v; },
    shot(kit, v, s, x, y, z, dt) { v.x = x; v.z = z; v.f.position.set(x, 1.25, z); v.f.rotation.y += (dt || 0.016) * 14; if (Math.random() < 0.5) kit.glow(x + R(-1, 1), 1.2, z + R(-1, 1), DT_WHITE, 0.6, 0.35, 1, kit.K.STAR, 1, 0, -0.5, 0); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; v.h.on = false; kit.sparks(x, 1.2, z, kit.N(8), DT_WHITE, 7, 0.3, 0.05, 0.5, 8); },
  },
  // Băng Liên: a closed ice bud marks the spot; it blooms into a lotus of pale ice petals with pink tips and a ring of ice
  // shards round it
  dtLotus: {
    zones: ['strike'], ownDisc: true, pal: [DT_ICE, DT_PINK], hitR: 2,
    skill() { return true; },
    zoneMake(kit, z) { const s = sigil(kit, z.x, z.z, Math.max(2.4, z.r), DT_ICE, { c2: DT_PINK, n: 8, m: 3, ticks: 8, inner: 0.3, life: 1e9, rev: 0.2, spin: 1.2, fill: 0.3, w: 0.08 }); return { s }; },
    zoneDrop(kit, v) { stop(v.s); },
    land(kit, e) {
      const g = new THREE.Group(); g.position.set(e.x, 0.2, e.z);
      for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 8; i++) { const p = new THREE.Mesh(petalGeo, basic(ring ? 0xffa8d8 : 0xbfe8ff, false, 0.92)); p.rotation.y = i * 0.785 + ring * 0.39; p.userData.r = ring; g.add(p); }
      own(kit, [g], 1.3, (t) => { const k = Math.min(1, t / 0.25), f = Math.max(0, 1 - (t - 0.9) / 0.4); g.children.forEach((p) => { p.rotation.z = (p.userData.r ? 0.9 : 0.5) * (1 - k) + 0.25; p.scale.setScalar((p.userData.r ? 1.8 : 2.8) * k); p.material.opacity = 0.92 * f; }); });
      spikes(kit, e.x, e.z, 10, 3, 2.2, DT_ICE, 1, { core: 0xdff4ff, up: 0.08 });
      kit.flash(e.x, 1.6, e.z, DT_ICE, 50, 0.25);
      return true;
    },
  },
  // Phong Tuyết: six great fans dance round her in a ring, a six-armed snowflake turns on the floor, snow whirls
  dtBlizzard: {
    pal: [DT_ICE, DT_PINK], hitR: 1.6,
    zoneMake(kit, z) {
      const fans = [0, 1, 2, 3, 4, 5].map((i) => { const f = fan(i % 2 ? 0xffc0e0 : 0xa8dcff, i % 2 ? 0x8fd0ff : 0xff8fc8); f.scale.setScalar(3.3); return f; });
      const s = sigil(kit, z.x, z.z, z.r * 0.8, DT_ICE, { c2: DT_WHITE, n: 6, m: 1, ticks: 6, inner: 0.25, life: 1e9, rev: 0.3, spin: 0.4, fill: 0.35, w: 0.1 });
      return { fans, s, h: held(kit, fans), t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt; v.s.position.set(z.x, 0.15, z.z);
      v.fans.forEach((f, i) => { const a = v.t * 1.8 + i * 1.047, r = z.r * 0.62; f.position.set(z.x + Math.cos(a) * r, 1.4 + 0.4 * Math.sin(v.t * 4 + i), z.z + Math.sin(a) * r); f.rotation.set(0.5 * Math.sin(v.t * 3 + i), -a - Math.PI / 2, 0); });
      if (Math.random() < dt * 30) { const a = Math.random() * 6.283, r = Math.random() * z.r; kit.glow(z.x + Math.cos(a) * r, R(0.5, 3), z.z + Math.sin(a) * r, DT_WHITE, 0.8, 0.3, 1, kit.K.STAR, 1, -Math.sin(a) * 5, -0.5, Math.cos(a) * 5); }
    },
    zoneDrop(kit, v) { v.h.on = false; stop(v.s); },
  },
};

// ---- Na Tra: fire wheels, the golden ring, the red sash -------------------------------------------------------------
const NT_FIRE = C(2.6, 0.9, 0.1), NT_GOLD = C(2.6, 1.9, 0.4), NT_RED = C(2.5, 0.15, 0.2);
const wheelTor = keep(new THREE.TorusGeometry(1, 0.12, 6, 28)), wheelSpoke = keep(new THREE.BoxGeometry(2, 0.08, 0.08));
function wheel() { const g = new THREE.Group(), m = basic(0xffc040, false), ms = basic(0xff7020, false); g.add(new THREE.Mesh(wheelTor, m)); for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(wheelSpoke, ms); s.rotation.z = i * 1.047; g.add(s); } return g; }
const natra = {
  // Càn Khôn Quyển: the golden ring flies out flat and spinning, wrapped in fire, and comes back
  ntRing: {
    pal: [NT_FIRE, NT_GOLD], hitR: 1.8,
    skill() { return true; },
    shotMake(kit, s) { const w = wheel(); w.rotation.x = Math.PI / 2; w.scale.setScalar(3.2); const v = { w, h: held(kit, [w]), x: s.x, z: s.z, live: true }; for (const ph of [0, 2.094, 4.189]) trail(kit, (t) => (v.live ? [v.x + Math.cos(t * 14 + ph) * 2.6, 1.2, v.z + Math.sin(t * 14 + ph) * 2.6] : null), 1.1, NT_FIRE, 0.5, { c2: NT_RED, len: 10 }); return v; },
    shot(kit, v, s, x, y, z, dt) { v.x = x; v.z = z; v.w.position.set(x, 1.2, z); v.w.rotation.z += (dt || 0.016) * 18; return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; v.h.on = false; kit.sparks(x, 1.2, z, kit.N(8), NT_GOLD, 7, 0.3, 0.05, 0.5, 8); },
  },
  // Phong Hỏa Luân: a fire wheel stands at each side of him, spinning, and burns two tracks along the floor
  ntWheels: {
    pal: [NT_FIRE, NT_GOLD], hitR: 1.8,
    skill(kit, e, u) {
      const a = e.a, ws = [wheel(), wheel()];
      own(kit, ws, 0.6, (t) => { if (t > 0.45 || !u.alive) return false; ws.forEach((w, i) => { const sd = i ? 1 : -1; w.position.set(u.x - Math.sin(a) * sd * 1.3, 1.1, u.z + Math.cos(a) * sd * 1.3); w.rotation.set(0, -a, t * 30); w.scale.setScalar(1.25); }); if (Math.random() < 0.8) for (const sd of [-1, 1]) kit.scorch(u.x - Math.sin(a) * sd * 1.3, u.z + Math.cos(a) * sd * 1.3, 0.6, 3, 1.4, NT_FIRE); });
      for (const sd of [-1, 1]) trail(kit, (t) => (t < 0.45 && u.alive ? [u.x - Math.sin(a) * sd * 1.3, 0.5, u.z + Math.cos(a) * sd * 1.3] : null), 1.2, NT_FIRE, 0.8, { c2: NT_RED, len: 18 });
      return true;
    },
  },
  // Thiên Giáng: he falls from the sky with the red sash streaming in a spiral; he lands in a golden star of spikes
  ntDescend: {
    pal: [NT_FIRE, NT_GOLD], hitR: 2.2,
    skill() { return true; },
    leap(kit, e, u, row) {
      const dur = e.dur || 0.55, r = row.radius || 3.2;
      trail(kit, (t) => (t < dur && u.alive ? [u.x + Math.cos(t * 16) * 1.4, 1.5 + Math.sin(Math.min(1, t / dur) * Math.PI) * 3, u.z + Math.sin(t * 16) * 1.4] : null), 2.4, NT_RED, dur + 0.3, { c2: C(0.6, 0.02, 0.05), len: 22 });
      { const w = wheel(); w.rotation.x = Math.PI / 2; own(kit, [w], dur + 0.05, (t) => { if (!u.alive) return false; w.position.set(u.x, 0.3 + Math.sin(Math.min(1, t / dur) * Math.PI) * 2.6, u.z); w.rotation.z = t * 20; w.scale.setScalar(3.2); }); }
      sigil(kit, e.x, e.z, row.radius || 3.2, NT_GOLD, { c2: NT_FIRE, n: 8, m: 3, ticks: 0, inner: 0, life: dur + 0.1, rev: 0.1, spin: 3, fill: 0.3, w: 0.08 });
      kit.anims.push({ t: 0, step(dt) { this.t += dt; if (this.t < dur) return true;
        sigil(kit, u.x, u.z, r * 1.2, NT_GOLD, { c2: NT_FIRE, n: 8, m: 3, ticks: 0, inner: 0, life: 0.9, rev: 0.06, spin: 2, fill: 0.5, w: 0.1 });
        spikes(kit, u.x, u.z, 8, r * 0.35, 3.4, NT_GOLD, 0.8, { core: 0x5a3000, up: 0.06 });
        for (const w of [wheel(), wheel()]) { const k = w; k.rotation.x = Math.PI / 2; own(kit, [k], 0.6, (t) => { k.position.set(u.x, 0.4, u.z); k.scale.setScalar(1 + t * 8); k.children.forEach((c) => { c.material.opacity = 1 - t / 0.6; }); }); break; }
        kit.flash(u.x, 2, u.z, NT_GOLD, 60, 0.3); kit.kick(u.x, u.z, 0.7); return false; }, drop() {} });
      return true;
    },
  },
};

// a fox tail: a long flame leaf from the root at the origin out along +x, curling at the tip
const tailGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(0.8, 0.5, 1.6, 0.55, 2.2, 0.15); s.quadraticCurveTo(2.5, -0.05, 2.3, -0.25); s.bezierCurveTo(1.6, -0.1, 0.8, -0.25, 0, 0); return keep(new THREE.ShapeGeometry(s, 14).rotateX(-Math.PI / 2)); })();
// ---- Cửu Vĩ Hồ: crimson and violet fox-fire --------------------------------------------------------------------------
const CV_RED = C(2.6, 0.2, 0.25), CV_VIO = C(1.5, 0.3, 2.4), CV_ORG = C(2.6, 0.9, 0.2);
const cuuvi = {
  // Chùm Hồ Hỏa: three fox-fire wisps, a violet-white head with a crimson tail that curls behind it; each bursts as a five-
  // tongued flame
  cvFire: {
    pal: [CV_RED, CV_VIO], hitR: 1.8,
    skill() { return true; },
    shotMake(kit, s) { const v = { x: s.x, z: s.z, live: true, t: 0 }; trail(kit, () => (v.live ? [v.x, 1.3, v.z] : null), 2.2, CV_RED, 0.6, { c2: C(0.5, 0.02, 0.1), len: 14 }); v.head = shell(kit, s.x, 1.3, s.z, 1.2, CV_VIO, { c2: C(2.6, 2.4, 2.6), inv: 1.4, core: 1, life: 1e9 }); return v; },
    shot(kit, v, s, x, y, z, dt) { v.t += dt; const w = Math.sin(v.t * 30) * 0.5; v.x = x - s.dz * w; v.z = z + s.dx * w; v.head.position.set(x, 1.3, z); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; stop(v.head); spikes(kit, x, z, 5, 0.8, 2.2, CV_RED, 0.6, { core: 0x400010, up: 0.06 }); },
  },
  // Ảo Ảnh: she leaves a mirror image: a pink mirror stands where she was with an orange crosshair over it; she reappears in a
  // swirl of red petals. The image bursts as a wave of flame petals.
  cvMirage: {
    zones: ['decoy'], pal: [CV_RED, CV_VIO], hitR: 1.8,
    skill() { return true; },
    warp(kit, e) {
      for (let i = 0; i < kit.N(14); i++) { const a = Math.random() * 6.283; kit.glow(e.x + Math.cos(a) * 1.5, R(0.4, 2.4), e.z + Math.sin(a) * 1.5, CV_RED, 0.6, 0.5, 1, kit.K.FLAME, 1.2, -Math.sin(a) * 4, 1, Math.cos(a) * 4); }
      slash(kit, e.x, e.z, Math.atan2(e.z - e.z0, e.x - e.x0), 3.6, CV_RED, { y: 1.2, life: 0.45, w: 0.6, span: 1.6, edge: CV_VIO, sparks: false });
      return true;
    },
    zoneMake(kit, z) {
      const m = gate(kit, z.x, z.z, 1.6, CV_RED, { life: 1e9, pane: 0xff70a0, paneA: 0.45, grow: 0.15 });
      const s = sigil(kit, z.x, z.z, 2.6, CV_ORG, { n: 0, ticks: 4, inner: 0.35, life: 1e9, rev: 0.2, spin: 0.8, fill: 0.1, w: 0.09 });
      return { m, s };
    },
    zone(kit, v, z) { v.m.position.x = z.x; v.m.position.z = z.z; v.s.position.x = z.x; v.s.position.z = z.z; },
    zoneDrop(kit, v) { stop(v.m); stop(v.s); },
    land(kit, e) {
      for (let i = 0; i < 9; i++) slash(kit, e.x, e.z, i * 0.698, 3.6, CV_RED, { y: 1, life: 0.5, w: 0.5, span: 0.5, travel: 6, sweep: 0.08, wake: 1.8, arcs: 0, edge: CV_ORG, sparks: false });
      kit.flash(e.x, 1.6, e.z, CV_RED, 50, 0.25); return true;
    },
  },
  // Cửu Vĩ Hỏa: nine fox-fire orbs circle her, each dragging a long curling tail: nine tails fanned round her
  cvTails: {
    zones: ['orbit'], pal: [CV_RED, CV_VIO], hitR: 1.6,
    skill() { return true; },
    zoneMake(kit, z) {
      const v = { z, live: true, t: 0 };
      // nine flame tails fan out behind her and sway
      v.tails = new THREE.Group(); for (let i = 0; i < 9; i++) { const t = new THREE.Mesh(tailGeo, basic(i % 2 ? 0xff5030 : 0xff9a30, false, 0.85)); t.userData.i = i; v.tails.add(t); } v.th = held(kit, [v.tails]);
      v.heads = []; for (let i = 0; i < (z.n || 9); i++) {
        const h = shell(kit, 0, 1.4, 0, 0.7, i % 2 ? CV_VIO : CV_ORG, { c2: C(2.6, 2.4, 2.6), inv: 1.4, core: 1, life: 1e9 }); v.heads.push(h);
        trail(kit, () => (v.live && ((v.z.live >> i) & 1) ? [h.position.x, 1.4, h.position.z] : null), 1.2, CV_RED, 1e9, { c2: C(0.5, 0.02, 0.1), len: 14 });
      }
      return v;
    },
    zone(kit, v, z) {
      v.z = z; const o = kit.match.units[z.owner]; if (!o) return;
      v.t += 1 / 60; v.tails.position.set(o.x, 0.6, o.z); const back = (o.aim || 0) + Math.PI, k = Math.min(1, v.t / 0.3);
      v.tails.children.forEach((t) => { const i = t.userData.i; t.rotation.y = -(back + (i - 4) * 0.3 + Math.sin(v.t * 4 + i) * 0.08); t.rotation.z = 0.25; t.scale.setScalar(3.2 * k); });
      v.heads.forEach((h, i) => { const on = (z.live >> i) & 1; h.visible = !!on; if (!on) return; const [px, pz] = orbPos(z, o, i); h.position.set(px, 1.4, pz);
        // the tail curls back along the orbit behind the orb, thinning toward its tip: nine tails swirl round her
 });
    },
    zoneDrop(kit, v) { v.live = false; v.th.on = false; v.heads.forEach(stop); },
  },
};

// ---- Dương Tiễn: the third eye, cyan and white -------------------------------------------------------------------------
const DG_CYAN = C(0.3, 1.8, 2.6), DG_WHITE = C(2.2, 2.5, 2.6), DG_DEEP = C(0.1, 0.4, 1.8);
const tridentGeo = (() => { const parts = [new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5).rotateZ(Math.PI / 2).translate(-0.6, 0, 0), new THREE.ConeGeometry(0.16, 1.0, 4).rotateZ(-Math.PI / 2).translate(0.9, 0, 0), new THREE.BoxGeometry(0.1, 0.08, 0.9).translate(0.4, 0, 0)]; for (const sd of [-1, 1]) parts.push(new THREE.ConeGeometry(0.11, 0.7, 4).rotateZ(-Math.PI / 2).translate(0.7, 0, sd * 0.42)); return parts.map(keep); })();
function trident() { const g = new THREE.Group(), m = basic(0xe8fbff, false); for (const p of tridentGeo) g.add(new THREE.Mesh(p, m)); return g; }
// the third eye: an almond of two arcs round a glowing pupil, standing upright facing the camera
function eye(kit, x, y, z, r, life) {
  const s = sigil(kit, x, z, r, DG_CYAN, { c2: DG_WHITE, n: 4, m: 1, ticks: 0, inner: 0.4, life, rev: 0.1, fill: 0.35, y, w: 0.1 }); s.rotation.x = 1.2;
  const p = shell(kit, x, y, z, r * 0.35, DG_WHITE, { c2: DG_CYAN, inv: 1.2, core: 1, life });
  return [s, p];
}
const duongtien = {
  // Tam Tiêm Đao: the three-pointed blade itself flies, big and white, a cyan wake behind it
  dgBlade: {
    pal: [DG_DEEP, DG_CYAN], hitR: 1.8,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.4, 1.3, u.z + Math.sin(e.a) * 1.4, DG_WHITE, 0.12, 2, 1, kit.K.STAR, 1.3); return true; },
    shotMake(kit, s) { const g = trident(); g.scale.setScalar(4.6); const v = { g, h: held(kit, [g]), x: s.x, z: s.z, live: true, a: Math.atan2(s.dz, s.dx) }; trail(kit, () => (v.live ? [v.x, 1.25, v.z] : null), 2.8, DG_CYAN, 0.5, { c2: DG_DEEP, len: 14 }); return v; },
    shot(kit, v, s, x, y, z) { v.x = x; v.z = z; v.g.position.set(x, 1.25, z); v.g.rotation.set(0, -v.a, 0); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; v.h.on = false; kit.sparks(x, 1.2, z, kit.N(8), DG_WHITE, 7, 0.3, 0.05, 0.5, 8); },
  },
  // Hao Thiên Khuyển: the celestial hound runs as a cyan spirit with pricked ears, leaving glowing paw prints; it bites as
  // four cyan crescents snapping in
  dgHound: {
    zones: ['decoy'], pal: [DG_DEEP, DG_CYAN], hitR: 1.8,
    skill() { return true; },
    zoneMake(kit, z) {
      const body = shell(kit, z.x, 1.0, z.z, 3, DG_CYAN, { c2: DG_WHITE, inv: 1.1, core: 1, squash: 0.7, life: 1e9 });
      const ears = new THREE.Group(), m = basic(0xc8f4ff, false); for (const sd of [-1, 1]) { const c = new THREE.Mesh(keep(new THREE.ConeGeometry(0.45, 1.4, 4)), m); c.position.set(0, 0.9, sd * 0.7); ears.add(c); }
      const v0 = { x: z.x, z: z.z, live: true }; trail(kit, () => (v0.live ? [v0.x, 0.9, v0.z] : null), 2.4, DG_CYAN, 1e9, { c2: DG_DEEP, len: 18 });
      const halo = sigil(kit, z.x, z.z, 4, DG_CYAN, { c2: DG_WHITE, n: 0, ticks: 8, inner: 0.7, life: 1e9, rev: 0.2, spin: 2, fill: 0.4, w: 0.1 });
      return { v0, body, ears, halo, h: held(kit, [ears]), px: z.x, pz: z.z, step: 0 };
    },
    zone(kit, v, z) {
      v.body.position.set(z.x, 0.9, z.z); v.ears.position.set(z.x, 1.6, z.z); v.halo.position.x = z.x; v.halo.position.z = z.z; v.v0.x = z.x; v.v0.z = z.z;
      const d = Math.hypot(z.x - v.px, z.z - v.pz);
      if (d > 1.1) { const a = Math.atan2(z.z - v.pz, z.x - v.px), sd = v.step++ % 2 ? 1 : -1; const px = z.x - Math.sin(a) * sd * 0.6, pz = z.z + Math.cos(a) * sd * 0.6; sigil(kit, px, pz, 0.7, DG_CYAN, { n: 0, ticks: 0, inner: 0, fill: 1.2, life: 2.4, rev: 0.05, alpha: 0.9, w: 0, y: 0.11 }); for (const o of [-0.6, 0, 0.6]) sigil(kit, px + Math.cos(a + o) * 1.0, pz + Math.sin(a + o) * 1.0, 0.3, DG_CYAN, { n: 0, ticks: 0, inner: 0, fill: 1.2, life: 2.4, rev: 0.05, alpha: 0.9, w: 0, y: 0.11 }); v.px = z.x; v.pz = z.z; v.ears.rotation.y = -a; }
    },
    zoneDrop(kit, v) { v.h.on = false; v.v0.live = false; stop(v.body); stop(v.halo); },
    land(kit, e) { sigil(kit, e.x, e.z, 3.6, DG_CYAN, { c2: DG_WHITE, n: 0, ticks: 12, inner: 0.75, life: 1, rev: 0.06, fill: 0.3, w: 0.1 }); for (let i = 0; i < 4; i++) slash(kit, e.x - Math.cos(i * 1.571) * 1.2, e.z - Math.sin(i * 1.571) * 1.2, i * 1.571, 3.6, DG_CYAN, { y: 1.1, life: 0.6, w: 0.5, span: 0.9, sweep: 0.08, erode: 0.3, edge: DG_WHITE, sparks: false, arcs: 1 }); kit.flash(e.x, 1.6, e.z, DG_CYAN, 40, 0.2); return true; },
  },
  // Thần Nhãn Truy Kích: the third eye opens over the hunted foe while he aims; the shot is a cyan-white beam with eyes along it
  dgEye: {
    pal: [DG_DEEP, DG_CYAN], hitR: 2,
    skill() { return true; },
    castMake() { return { objs: null }; },
    cast(kit, v, u, s, k) {
      const a = u.cast.aim, L = Math.min(s.range || 24, 12), x = u.x + Math.cos(a) * L, z = u.z + Math.sin(a) * L;
      if (!v.objs) v.objs = eye(kit, x, 3.4, z, 2.4, (s.windup || 0.8) + 0.3);
      v.objs.forEach((o) => { o.position.x = x; o.position.z = z; });
      kit.glow(u.x + Math.cos(a) * 1.4, 1.4, u.z + Math.sin(a) * 1.4, DG_CYAN, 0.1, 1 + 2 * k, 1, kit.K.STAR, 1.2);
    },
    beam(kit, e) {
      const dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz) || 1;
      const b1 = kit.beam(e.x0, e.z0, e.x1, e.z1, 2.2, DG_CYAN, 0.55, 0, 1.4); b1.fade = true;
      const b2 = kit.beam(e.x0, e.z0, e.x1, e.z1, 1.0, DG_WHITE, 0.5, 2, 1.45); b2.fade = true;
      for (let d = 4; d < L; d += 6) eye(kit, e.x0 + dx / L * d, 2.4, e.z0 + dz / L * d, 1.3, 0.6);
      eye(kit, e.x1, 3, e.z1, 3.2, 0.7); const a0 = Math.atan2(dz, dx); for (const sd of [-1, 1]) slash(kit, e.x0, e.z0, a0 + sd * 1.3, 3.6, DG_CYAN, { y: 1.3, dir: sd, life: 0.5, w: 0.5, span: 1.1, edge: DG_WHITE, sparks: false, arcs: 1 });
      kit.flash(e.x1, 1.6, e.z1, DG_CYAN, 60, 0.3); kit.kick(e.x0, e.z0, 0.5);
      return true;
    },
  },
};

// ---- Gilgamesh: the Gate of Babylon, gold ------------------------------------------------------------------------------
const GG_GOLD = C(2.6, 1.9, 0.35), GG_WHITE = C(2.6, 2.4, 1.8), GG_DEEP = C(0.6, 0.35, 0.02);
// a golden ripple hanging in the air: concentric rings round a bright core, upright, facing the camera
function ripple(kit, x, y, z, r, life) { const s = sigil(kit, x, z, r, GG_GOLD, { c2: GG_WHITE, n: 0, ticks: 12, inner: 0.55, life, rev: 0.12, spin: 2, fill: 0.45, y, w: 0.1 }); s.rotation.x = 1.15; return s; }
const gilgamesh = {
  // Phóng Bảo Khí: a golden ripple opens in the air behind him for each blade, and a golden sword flies out of it
  ggVolley: {
    pal: [GG_DEEP, GG_GOLD], hitR: 1.8,
    skill(kit, e, u) { const b = e.a + Math.PI; ripple(kit, u.x + Math.cos(b) * 1.6, 2.6, u.z + Math.sin(b) * 1.6, 2.4, 0.7); return true; },
    shotMake(kit, s) { const g = weapon('sword', 0xffe9a0, GG_GOLD); g.scale.setScalar(3.4); const v = { g, h: held(kit, [g]), a: Math.atan2(s.dz, s.dx), x: s.x, z: s.z, live: true }; ripple(kit, s.x - s.dx * 1.5, 2.2, s.z - s.dz * 1.5, 1.6, 0.6); trail(kit, () => (v.live ? [v.x, 1.4, v.z] : null), 1.6, GG_GOLD, 0.4, { c2: GG_DEEP, len: 10 }); return v; },
    shot(kit, v, s, x, y, z) { v.x = x; v.z = z; v.g.position.set(x, 1.4, z); v.g.rotation.set(0, -v.a, 0); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; v.h.on = false; kit.sparks(x, 1.2, z, kit.N(8), GG_GOLD, 7, 0.3, 0.05, 0.5, 8); },
  },
  // Phong Tỏa: golden ripples open round the target and chains run from each to the centre, crossing over it
  ggChains: {
    pal: [GG_DEEP, GG_GOLD], hitR: 1.6,
    zoneMake(kit, z) {
      const rs = [], bs = [];
      // Enkidu: six golden chains shoot in from the rim and wrap the target, each a row of linked rings
      const links = new THREE.Group(), m = basic(0xffd860, false), tor = keep(new THREE.TorusGeometry(0.42, 0.12, 6, 12));
      for (let i = 0; i < 6; i++) { const a = i * 1.047; for (let d = 0; d < 14; d++) { const k = d / 13, r = z.r * (1.1 - k * 1.0), l = new THREE.Mesh(tor, m); l.position.set(z.x + Math.cos(a + k * 0.6) * r, 0.6 + k * 1.2, z.z + Math.sin(a + k * 0.6) * r); l.rotation.set(d % 2 ? Math.PI / 2 : 0, -a, 0); links.add(l); } }
      rs.push(links); own(kit, [links], 1e9, (t) => { links.scale.set(1, Math.min(1, t / 0.25), 1); });
      const s = sigil(kit, z.x, z.z, z.r * 0.55, GG_GOLD, { c2: GG_WHITE, n: 6, m: 2, ticks: 0, inner: 0, life: 1e9, rev: 0.2, fill: 0.5, w: 0.1 });
      return { rs, bs, s };
    },
    zoneDrop(kit, v) { v.rs.forEach(stop); stop(v.s); },
  },
  // Cổng Kho Báu: the sky fills with golden ripples; a sword drops out of each and stands planted in the floor
  ggGate: {
    zones: ['strike'], ownDisc: true, pal: [GG_DEEP, GG_GOLD], hitR: 1.6,
    skill() { return true; },
    zoneMake(kit, z) {
      const r = ripple(kit, z.x, 7, z.z, 1.8, 1e9); r.rotation.x = 0;
      const g = weapon('sword', 0xffe9a0, GG_GOLD); g.scale.setScalar(2.4); g.rotation.set(0, 0, -Math.PI / 2);
      const s = sigil(kit, z.x, z.z, 1.4, GG_GOLD, { n: 0, ticks: 4, inner: 0.5, life: 1e9, rev: 0.1, fill: 0.1, w: 0.06 });
      return { r, g, s, h: held(kit, [g]) };
    },
    zone(kit, v, z) { const k = z.delay / (z.total || 1); v.g.position.set(z.x, 1.4 + 5.6 * k, z.z); },
    zoneDrop(kit, v) { stop(v.r); stop(v.s); v.h.on = false; },
    land(kit, e) {
      const g = weapon('sword', 0xffe9a0, GG_GOLD); g.scale.setScalar(2.4); g.rotation.set(0, 0, -Math.PI / 2);
      own(kit, [g], 1.2, (t) => { g.position.set(e.x, 1.4 - Math.min(0.6, t * 6), e.z); });
      kit.ring(e.x, e.z, 2.6, GG_GOLD, 0.35); burst(kit, e.x, e.z, 2.2, GG_DEEP, GG_GOLD); kit.kick(e.x, e.z, 0.3);
      return true;
    },
  },
};

export const B4 = { ...quancong, ...dieuthuyen, ...natra, ...cuuvi, ...duongtien, ...gilgamesh };
