// Looks, batch 4: Quan Công, Điêu Thuyền, Na Tra, Cửu Vĩ Hồ, Gilgamesh (Dương Tiễn: looks-k13.js). Render only (see looks.js for the hooks).
// Each look's own shape carries it; bursts are only brief flashes where blows land.
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP.md):
//   关羽 p5 (Quan Công): jade-yellow crescent slashes, a wide green crescent where the blade lands, a dark crater bursting with
//     green-yellow shards.
//   貂蝉 p60 (Điêu Thuyền): pink folding fans flying in a row, a pink rose bloom, hearts; our tank is ice, so the fans and the
//     lotus are ice-blue with pink edges.
//   哪吒 p64 (Na Tra): golden fire wheels, a red silk sash, a golden spiky star where he lands.
//   妖狐 p64→p67 (Cửu Vĩ Hồ): crimson fox-fire, an orange crosshair over the decoy, a wave of red flame petals.
//   英雄王 p74 (Gilgamesh): his looks moved to looks-k14.js with his ported kit (kit lane k14).
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

// Điêu Thuyền: her looks moved to looks-k12.js with the kit ported from the clip (lane k12).

// ---- Na Tra moved to looks-k17.js with the kit ported from clip p64 -------------------------------------------------

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


export const B4 = { ...quancong, ...cuuvi };   // Dương Tiễn moved to looks-k13.js (kit lane K13), Điêu Thuyền to looks-k12.js (kit lane k12), Na Tra to looks-k17.js (kit lane k17), Gilgamesh to looks-k14.js (kit lane k14)
