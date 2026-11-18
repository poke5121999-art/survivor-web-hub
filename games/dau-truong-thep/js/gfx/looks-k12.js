// Looks, kit lane k12: Doctor Strange and Zoro, remade with the kit ported from the owner's clip. Render only (see looks.js).
// One main colour and one accent per tank, one strong shape per skill, soft halos.
//   至尊法师 p66 (Doctor Strange): magenta dimension bubbles, orange sling-ring rune circles; a pink energy orb; the banished
//     foe sealed in a pink bubble ringed by orange runes; portals of orange sparks at both ends of the warp; the domain a pink
//     dome on an orange mandala, a pink blast when he draws on it.
//   海贼猎人 p63 (Zoro): lime-green blades: a whirl round him while he parries, an X where a bullet meets them, crescent waves
//     flying back; three streaks and a big X for the iai dash; three blades stabbing at once and a great crescent for the ult.
import { C, own, stop, slash, cut, sigil, shell, trail, burst, gate, weapon, fadeWeapon } from './lookkit.js';
import * as THREE from '../../vendor/three.module.min.js';

const R = (a, b) => a + Math.random() * (b - a);

// ---- Doctor Strange: magenta, orange runes ---------------------------------------------------------------------------
const BD_PINK = C(2.3, 0.3, 1.6), BD_GOLD = C(2.7, 1.0, 0.05), BD_HOT = C(2.6, 1.9, 2.3), BD_DEEP = C(0.55, 0.04, 0.45), BD_SPARK = C(2.7, 2.0, 0.6);
// a sling ring: a ring of orange sparks standing across the aim, spun from its rim
function slingRing(kit, x, z, a, r, life) {
  own(kit, [new THREE.Group()], life, (t) => {
    const k = Math.min(1, t / 0.15);
    for (let i = 0, n = kit.N(9); i < n; i++) {
      const b = Math.random() * 6.283, ox = Math.cos(b) * r * k, oy = Math.sin(b) * r * k;
      kit.str.emit(x - Math.sin(a) * ox, 1.4 + oy, z + Math.cos(a) * ox, -Math.sin(a) * Math.cos(b + 1.57) * 4, Math.sin(b + 1.57) * 4, Math.cos(a) * Math.cos(b + 1.57) * 4, i % 3 ? BD_GOLD : BD_SPARK, 0.18, 0.05, 0.06, 4, 0, 1);
    }
  });
}
// the ward: one thin magenta shell per mech, its time renewed by every grant
const wards = new Map();
function ward(kit, u, dur) {
  const w = wards.get(u.id);
  if (w && w.on) { w.until = kit.time + dur; return; }
  const h = { on: true, until: kit.time + dur };
  wards.set(u.id, h);
  shell(kit, u.x, 1.0, u.z, 1.7, BD_PINK, { c2: BD_GOLD, p: 2.4, core: 0.04, life: 1e9, bands: 2.5, alpha: 0.75, follow: u, step: () => { if (kit.time > h.until || !u.alive) { h.on = false; return false; } } });
  sigil(kit, u.x, u.z, 2.0, BD_GOLD, { c2: BD_PINK, n: 0, ticks: 16, inner: 0.82, fill: 0.08, w: 0.05, life: dur + 0.2, rev: 0.12, spin: 1.5, follow: u, alpha: 0.8 });
}

const buomdem = {
  // Thời Không Phóng Trục: an orange rune circle opens at the muzzle and a pink energy orb flies out on a magenta ribbon; the
  // foe it banishes is sealed in a pink bubble with orange runes turning round it. Also the ward (the passive): a thin pink
  // shell round him while it holds, and an orange rune ring with pink shards when it bursts.
  bdBanish: {
    pal: [BD_PINK, BD_HOT], hitR: 1.8,
    skill(kit, e, u) {
      const a = e.a, x = u.x + Math.cos(a) * 1.6, z = u.z + Math.sin(a) * 1.6;
      sigil(kit, x, z, 3.4, BD_GOLD, { c2: BD_PINK, n: 8, m: 3, ticks: 20, inner: 0.55, fill: 0.3, life: 0.6, rev: 0.08, spin: 5, y: 1.0 });
      shell(kit, x, 1.3, z, 1.5, BD_PINK, { c2: BD_HOT, p: 1.6, core: 0.12, life: 0.3, grow: 0.05 });
      slingRing(kit, x, z, a, 1.6, 0.35);
      kit.flash(x, 1.5, z, BD_PINK, 30, 0.18);
      return true;
    },
    shotMake(kit, s) {
      if (!(s.r > 0.35)) return {};
      const v = { x: s.x, z: s.z, live: true };
      v.sh = shell(kit, s.x, 1.35, s.z, 1.0, BD_PINK, { c2: BD_HOT, p: 1.4, core: 0.45, life: 1e9, bands: 3 });
      trail(kit, () => (v.live ? [v.x, 1.35, v.z] : null), 1.9, BD_PINK, 1e9, { c2: BD_DEEP, len: 16 });
      return v;
    },
    shot(kit, v, s, x, y, z) {
      if (!v.sh) return false;
      v.x = x; v.z = z; v.sh.position.set(x, 1.35, z);
      kit.glow(x, 1.35, z, BD_HOT, 0.06, 1.1, 1, kit.K.STAR, 1);
      if (Math.random() < 0.6) kit.str.emit(x + R(-0.5, 0.5), 1.35 + R(-0.4, 0.4), z + R(-0.5, 0.5), -s.dx * 3, R(-1, 1), -s.dz * 3, BD_GOLD, 0.2, 0.06, 0.05, 0, 0, 1);
      return true;
    },
    shotEnd(kit, v, s, x, z) {
      if (!v.sh) return;
      v.live = false; stop(v.sh);
      burst(kit, x, z, 2.2, BD_PINK, BD_HOT, { life: 0.3 });
    },
    hit(kit, e) {
      const o = kit.match.units[e.id];
      if (!o || !(o.locT > 0)) { burst(kit, e.x, e.z, 1.8, BD_PINK, BD_HOT, { life: 0.3 }); return; }
      shell(kit, o.x, 1.2, o.z, 2.1, BD_PINK, { c2: BD_DEEP, p: 1.3, core: 0.22, life: 1.0, grow: 0.12, follow: o, bands: 1.4 });
      sigil(kit, o.x, o.z, 2.8, BD_GOLD, { c2: BD_PINK, n: 6, m: 2, ticks: 18, inner: 0.62, fill: 0.16, life: 1.0, rev: 0.1, spin: 2.2, follow: o });
      kit.flash(o.x, 1.6, o.z, BD_PINK, 35, 0.2);
    },
    nova(kit, e, u) {
      if (e.wardUp) { ward(kit, u, u.def.passive.bdWard.dur); return true; }
      if (!e.ward) return false;
      const w = wards.get(u.id); if (w) w.until = 0;
      sigil(kit, e.x, e.z, e.r, BD_GOLD, { c2: BD_PINK, n: 8, m: 3, ticks: 24, inner: 0.7, fill: 0.2, w: 0.07, life: 0.45, rev: 0.05, spin: 4, grow: 9 });
      shell(kit, e.x, 1.0, e.z, e.r * 0.8, BD_PINK, { c2: BD_HOT, p: 1.8, core: 0.08, squash: 0.6, life: 0.35, grow: 0.06 });
      for (let i = 0, n = kit.N(16); i < n; i++) { const b = Math.random() * 6.283, sp = R(8, 14); kit.str.emit(e.x + Math.cos(b) * 0.8, R(0.6, 1.6), e.z + Math.sin(b) * 0.8, Math.cos(b) * sp, 0, Math.sin(b) * sp, i % 3 ? BD_PINK : BD_GOLD, 0.22, 0.12, 0.08, 0, 0, 1); }
      return true;
    },
  },
  // Thời Không Nữu Khúc / Truyền Tống: a sling-ring portal of orange sparks with a pink pane where he stands and where he comes
  // out; the arrival blast is an orange rune circle under a pink bubble, the pulses after it pink rings rolling off him.
  bdPortal: {
    pal: [BD_PINK, BD_HOT], hitR: 1.8,
    skill() { return true; },
    warp(kit, e) {
      const a = Math.atan2(e.z - e.z0, e.x - e.x0);
      for (const [x, z, sp] of [[e.x0, e.z0, 0.25], [e.x, e.z, -0.25]]) {
        slingRing(kit, x, z, a, 2.0, 0.55);
        gate(kit, x, z, 1.9, BD_GOLD, { life: 0.7, pane: 0x2a0818, paneA: 0.55, spin: sp });
      }
      const b = kit.beam(e.x0, e.z0, e.x, e.z, 0.5, BD_PINK, 0.3, 2, 1.2); b.fade = true;
      kit.flash(e.x, 1.8, e.z, BD_PINK, 35, 0.22);
      return true;
    },
    nova(kit, e) {
      if (e.k) {
        shell(kit, e.x, 0.8, e.z, e.r, BD_PINK, { c2: BD_GOLD, p: 2.2, core: 0.03, squash: 0.35, life: 0.35, grow: 0.12, alpha: 0.9 });
        sigil(kit, e.x, e.z, e.r, BD_GOLD, { c2: BD_PINK, n: 0, ticks: 12, inner: 0.85, fill: 0.1, w: 0.05, life: 0.35, rev: 0.05, spin: 3 });
        return true;
      }
      sigil(kit, e.x, e.z, e.r * 1.15, BD_GOLD, { c2: BD_PINK, n: 10, m: 3, ticks: 30, inner: 0.5, fill: 0.28, life: 0.75, rev: 0.1, spin: -3, w: 0.07 });
      shell(kit, e.x, 1, e.z, e.r, BD_PINK, { c2: BD_HOT, p: 1.6, core: 0.1, life: 0.45, grow: 0.08 });
      burst(kit, e.x, e.z, 3.0, BD_PINK, BD_HOT, { life: 0.45 });
      return true;
    },
  },
  // Ma Pháp Lĩnh Vực: an orange mandala draws itself at the cursor while a pink bubble gathers over it; it falls in a pink
  // blast, then the domain stands: a low pink dome rimmed in magenta over a turning orange ring; when he steps in, a pink
  // shock bubble and orange runes burst off him.
  bdRealm: {
    zones: ['strike'], ownDisc: true, pal: [BD_PINK, BD_HOT], hitR: 2.2,
    skill(kit, e, u) { kit.glow(u.x + Math.cos(e.a) * 1.3, 1.4, u.z + Math.sin(e.a) * 1.3, BD_GOLD, 0.15, 1.4, 0.8, kit.K.STAR, 1.2); return true; },
    zoneMake(kit, z) {
      if (z.kind === 'strike') {
        const sg = sigil(kit, z.x, z.z, z.r, BD_GOLD, { c2: BD_PINK, n: 10, m: 3, ticks: 36, inner: 0.6, fill: 0.2, w: 0.07, life: 1e9, rev: Math.max(0.2, z.total || 1), spin: 1.2 });
        const sh = shell(kit, z.x, 0, z.z, z.r, BD_PINK, { c2: BD_DEEP, p: 2.0, core: 0.02, dome: true, squash: 0.6, life: 1e9, alpha: 0.5, grow: Math.max(0.2, z.total || 1) / 2 });
        return { strike: true, sg, sh, t: 0 };
      }
      const dome = shell(kit, z.x, 0, z.z, z.r, BD_PINK, { c2: BD_DEEP, p: 2.4, core: 0.05, dome: true, life: 1e9, bands: 1.2, alpha: 0.8 });
      const ring = sigil(kit, z.x, z.z, z.r, BD_GOLD, { c2: BD_PINK, n: 8, m: 3, ticks: 32, inner: 0.72, fill: 0.12, w: 0.06, life: 1e9, rev: 0.25, spin: 0.7 });
      const disc = sigil(kit, z.x, z.z, z.r * 0.95, BD_PINK, { n: 0, ticks: 0, inner: 0, fill: 0.5, life: 1e9, rev: 0.2, alpha: 0.45, y: 0.1 });
      return { dome, ring, disc, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt;
      if (v.strike) return;
      if (Math.random() < dt * 14) { const a = Math.random() * 6.283, r = Math.random() * z.r * 0.85; kit.glow(z.x + Math.cos(a) * r, R(0.4, 2.4), z.z + Math.sin(a) * r, Math.random() < 0.6 ? BD_PINK : BD_GOLD, 0.8, 0.35, 0.9, kit.K.SPARK, 1, 0, 0.7, 0); }
    },
    zoneDrop(kit, v) { if (v.strike) { stop(v.sg); stop(v.sh); return; } stop(v.dome); stop(v.ring); stop(v.disc); },
    land(kit, e) {
      burst(kit, e.x, e.z, 4.2, BD_PINK, BD_HOT, { life: 0.5 });
      shell(kit, e.x, 0, e.z, e.r, BD_PINK, { c2: BD_HOT, p: 1.5, core: 0.2, dome: true, life: 0.45, grow: 0.06 });
      sigil(kit, e.x, e.z, e.r * 1.1, BD_GOLD, { c2: BD_PINK, n: 10, m: 3, ticks: 0, inner: 0.5, fill: 0.3, life: 0.6, rev: 0.05, spin: 3, grow: 10 });
      kit.flash(e.x, 2, e.z, BD_PINK, 45, 0.25); kit.kick(e.x, e.z, 0.5);
      return true;
    },
    nova(kit, e) {
      if (!e.step) return false;
      shell(kit, e.x, 1.0, e.z, e.r, BD_PINK, { c2: BD_HOT, p: 1.5, core: 0.15, life: 0.45, grow: 0.07 });
      sigil(kit, e.x, e.z, e.r * 1.2, BD_GOLD, { c2: BD_PINK, n: 8, m: 3, ticks: 24, inner: 0.6, fill: 0.25, life: 0.55, rev: 0.06, spin: -4, grow: 12 });
      for (let i = 0, n = kit.N(20); i < n; i++) { const b = Math.random() * 6.283, sp = R(10, 18); kit.str.emit(e.x + Math.cos(b), R(0.6, 2), e.z + Math.sin(b), Math.cos(b) * sp, R(0, 3), Math.sin(b) * sp, i % 3 ? BD_PINK : BD_GOLD, 0.3, 0.14, 0.09, 0, 0, 1); }
      kit.flash(e.x, 1.8, e.z, BD_PINK, 45, 0.25);
      return true;
    },
  },
};

// ---- Zoro: lime-green blades, a pale jade edge ------------------------------------------------------------------------
const CK_LIME = C(0.95, 2.6, 0.3), CK_PALE = C(2.0, 2.6, 1.7), CK_DEEP = C(0.05, 0.55, 0.12);
// a crescent riding a shot: the arc passes through the shot's point, its belly toward the way it flies
function crescent(kit, s, r, w, y, o = {}) {
  const a = Math.atan2(s.dz, s.dx), p = slash(kit, s.x - Math.cos(a) * r, s.z - Math.sin(a) * r, a, r, CK_LIME, { c2: CK_DEEP, edge: CK_PALE, y, w, span: o.span ?? 0.9, life: 1e9, sweep: 0.06, arcs: o.arcs ?? 1, sparks: false });
  return { p, a, r, y };
}
function ride(v, x, z) { v.p.position.set(x - Math.cos(v.a) * v.r, v.y, z - Math.sin(v.a) * v.r); }
// sword pressure: a long thin wedge of light lying on the ground from the caster along the aim, 1 m long before scaling
const wedgeGeo = (() => { const w = new THREE.Shape(); w.moveTo(0, 0); w.lineTo(1, -0.13); w.quadraticCurveTo(1.08, 0, 1, 0.13); w.lineTo(0, 0); const g = new THREE.ShapeGeometry(w, 6).rotateX(-Math.PI / 2); g.userData.keep = true; return g; })();
function wedge(kit, x, z, a, len, life) {
  const g = new THREE.Group(), m1 = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.85, 0.2), toneMapped: false, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
  const m2 = new THREE.MeshBasicMaterial({ color: CK_LIME, toneMapped: false, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const a1 = new THREE.Mesh(wedgeGeo, m1), a2 = new THREE.Mesh(wedgeGeo, m2); a2.scale.set(1, 1, 0.45); a2.position.y = 0.02; g.add(a1, a2);
  g.traverse((o) => { o.frustumCulled = false; o.renderOrder = 5; });
  g.position.set(x, 0.15, z); g.rotation.y = -a;
  own(kit, [g], life, (t) => { const k = Math.min(1, t / 0.07); g.scale.set(len * k, 1, len * 0.9); const f = Math.min(1, (life - t) / (life * 0.6)); m1.opacity = 0.7 * f; m2.opacity = 0.6 * f; });
}

const cakiem = {
  // Tam Đao (weapon): small lime crescents; the waves the parry sends back are bigger, with a pale ribbon behind
  ckBlade: {
    shotMake(kit, s) {
      const big = s.src && s.src !== 'w', v = crescent(kit, s, big ? 2.2 : 1.3, big ? 0.55 : 0.32, 1.1, { arcs: big ? 2 : 0 });
      v.live = true; v.x = s.x; v.z = s.z;
      if (big) trail(kit, () => (v.live ? [v.x, 1.1, v.z] : null), 1.2, CK_LIME, 1e9, { c2: CK_DEEP, len: 12 });
      return v;
    },
    shot(kit, v, s, x, y, z) { v.x = x; v.z = z; ride(v, x, z); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; stop(v.p); cut(kit, x, z, v.a, v.r > 2 ? 2.6 : 1.6, CK_LIME, { edge: CK_PALE, life: 0.12, sparks: 3 }); },
  },
  // Không Thủ Bạch Nhận: a lime whirl closes round him (two blade strokes chasing round, a thin jade shell) and keeps turning
  // while he parries; every bullet turned away flashes a pale X where it met the blades
  ckParry: {
    pal: [CK_LIME, CK_PALE], hitR: 1.6,
    skill(kit, e, u, row) {
      const dur = row.dur || 2;
      for (const ph of [0, 1.57, 3.14, 4.71]) slash(kit, u.x, u.z, e.a + ph, 3.0, CK_LIME, { c2: CK_DEEP, edge: CK_PALE, y: 1.1, life: 0.75, span: 1.2, w: 1.1, sweep: 0.12, erode: 0.25, arcs: 2, tilt: ph % 3.14 ? 0.3 : -0.3 });
      sigil(kit, u.x, u.z, 3.4, CK_DEEP, { c2: CK_LIME, n: 0, ticks: 0, inner: 0, fill: 1.1, life: dur, rev: 0.15, alpha: 0.75, y: 0.1, follow: u });
      shell(kit, u.x, 1.0, u.z, 2.4, CK_LIME, { c2: CK_PALE, p: 2.0, core: 0.08, life: dur, bands: 3, alpha: 0.8, follow: u, squash: 0.8 });
      sigil(kit, u.x, u.z, 3.2, CK_LIME, { c2: CK_PALE, n: 3, m: 1, ticks: 9, inner: 0.7, fill: 0.22, w: 0.07, life: dur, rev: 0.12, spin: 6, follow: u });
      kit.follow(u, dur, (t) => { if (Math.random() < 0.6) { const b = t * 9 + Math.random() * 0.4; kit.str.emit(u.x + Math.cos(b) * 2, R(0.7, 1.6), u.z + Math.sin(b) * 2, -Math.sin(b) * 10, 0, Math.cos(b) * 10, CK_LIME, 0.22, 0.08, 0.05, 0, 0, 1); } });
      return true;
    },
    nova(kit, e, u) {
      if (!e.parry) return false;
      const o = kit.match.units[e.by], a = o ? Math.atan2(o.z - u.z, o.x - u.x) : 0, x = u.x + Math.cos(a) * 1.5, z = u.z + Math.sin(a) * 1.5;
      cut(kit, x, z, a + 1.57, 2.4, CK_PALE, { edge: CK_LIME, life: 0.14, sparks: 5 });
      kit.flash(x, 1.4, z, CK_LIME, 25, 0.12);
      return true;
    },
  },
  // Cư Hợp Trảm: he is simply gone: three thin lime streaks lie along the path, upright after-cuts stand on it, and a big
  // pale-green X opens where he comes out
  ckIai: {
    pal: [CK_LIME, CK_PALE], hitR: 1.8,
    skill(kit, e, u, row) {
      const a = e.a, d = row.dist || 8, ca = Math.cos(a), sa = Math.sin(a);
      for (const o of [-0.8, 0, 0.8]) { const b = kit.beam(u.x - sa * o, u.z + ca * o, u.x + ca * d - sa * o, u.z + sa * d + ca * o, o ? 0.7 : 1.1, o ? CK_LIME : CK_PALE, 0.4, 2, 1.1); b.fade = true; }
      const fl = kit.beam(u.x, u.z, u.x + ca * d, u.z + sa * d, 2.6, CK_LIME, 0.4, 2, 0.15); fl.fade = true;
      for (let i = 0; i < 3; i++) { const k = 1.8 + i * 2.6; slash(kit, u.x + ca * k, u.z + sa * k, a + 1.57, 4.2, CK_LIME, { c2: CK_DEEP, y: 1.3, dir: i % 2 ? 1 : -1, life: 0.45, w: 1.0, span: 1.1, sweep: 0.05 + i * 0.03, edge: CK_PALE, tilt: 1.0, sparks: false, arcs: 2 }); }
      const ex = u.x + ca * d, ez = u.z + sa * d;
      cut(kit, ex, ez, a, 7, CK_LIME, { edge: CK_PALE, life: 0.35, sparks: 6 });
      burst(kit, ex, ez, 3.2, CK_LIME, CK_PALE, { life: 0.35 });
      kit.flash(ex, 1.5, ez, CK_LIME, 35, 0.18);
      return true;
    },
  },
  // Tam Thiên Thế Giới: three blades stab out at once from his front, then one great lime crescent runs down the line with a
  // pale ribbon; it ends in a wide X
  ckWorld: {
    pal: [CK_LIME, CK_PALE], hitR: 2.2,
    skill(kit, e, u) {
      const a = e.a;
      for (const sd of [-0.32, 0, 0.32]) {
        const g = weapon('sword', 0xdfeee0, CK_LIME), h = { on: true }, b = a + sd;
        own(kit, [g], 0.45, (t) => { const k = Math.min(1, t / 0.08); g.position.set(u.x + Math.cos(b) * (1.2 + 2.4 * k), 1.3, u.z + Math.sin(b) * (1.2 + 2.4 * k)); g.rotation.set(0, -b, 0); g.scale.setScalar(2.6); fadeWeapon(g, Math.min(1, (0.45 - t) / 0.15)); return h.on; });
      }
      slash(kit, u.x, u.z, a, 4.2, CK_LIME, { c2: CK_DEEP, edge: CK_PALE, y: 1.2, life: 0.45, span: 1.0, w: 1.6, sweep: 0.06, arcs: 3 });
      wedge(kit, u.x, u.z, a, 14, 0.45);
      sigil(kit, u.x, u.z, 5.2, CK_LIME, { c2: CK_PALE, n: 3, m: 1, ticks: 3, inner: 0.55, fill: 0.5, w: 0.08, life: 0.45, rev: 0.05, spin: 5 });
      shell(kit, u.x + Math.cos(a) * 1.6, 1.1, u.z + Math.sin(a) * 1.6, 3.6, CK_LIME, { c2: CK_PALE, p: 1.6, core: 0.12, squash: 0.5, life: 0.35, grow: 0.05 });
      cut(kit, u.x + Math.cos(a) * 2.2, u.z + Math.sin(a) * 2.2, a, 6, CK_LIME, { edge: CK_PALE, life: 0.3, sparks: 6 });
      const ln = kit.beam(u.x, u.z, u.x + Math.cos(a) * 14, u.z + Math.sin(a) * 14, 1.6, CK_LIME, 0.4, 2, 1.1); ln.fade = true;
      kit.flash(u.x + Math.cos(a) * 2, 1.5, u.z + Math.sin(a) * 2, CK_LIME, 40, 0.2);
      return true;
    },
    shotMake(kit, s) {
      const v = crescent(kit, s, 4.0, 1.6, 1.15, { arcs: 3, span: 1.0 });
      v.live = true; v.x = s.x; v.z = s.z;
      trail(kit, () => (v.live ? [v.x, 1.1, v.z] : null), 4.0, CK_LIME, 1e9, { c2: CK_DEEP, len: 18 });
      return v;
    },
    shot(kit, v, s, x, y, z) { v.x = x; v.z = z; ride(v, x, z); if (Math.random() < 0.6) kit.str.emit(x + R(-1, 1), R(0.6, 1.6), z + R(-1, 1), s.dx * 20, 0, s.dz * 20, CK_PALE, 0.2, 0.08, 0.05, 0, 0, 1); return true; },
    shotEnd(kit, v, s, x, z) { v.live = false; stop(v.p); cut(kit, x, z, v.a, 4.5, CK_LIME, { edge: CK_PALE, life: 0.22, sparks: 6 }); },
  },
};

export const K12 = { ...buomdem, ...cakiem };
