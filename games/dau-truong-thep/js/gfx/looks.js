// Per-skill looks, render only. A skill row (or a passive row) may carry `look: '<name>'`; fx.js then asks LOOKS[name] to draw
// that skill instead of the generic picture for its `do` kind. Every hook is driven by what both ends of an online match see:
// events (nova/beam/warp carry `skill` when the row has a look), u.cast (synced) and zones (a field's `vis` names its look).
//   hooks, all optional:
//     skill(kit, e, u, row)      the `skill` event (the press); return true to skip the generic burst
//     strike(kit, e, u, row)     a `zone` event of a strike zone whose vis is the look (something is coming down there)
//     nova / beam / warp(kit, e, u, row)   the matching event of that skill; return true to skip the generic picture
//     stacks(kit, e, by, P)      the stacks passive of `by` went off on e.id
//     castMake(kit, u, s) -> v, cast(kit, v, u, s, k, dt), castDrop(kit, v)   per frame while u.cast runs this skill (k: 0..1)
//     zoneMake(kit, z) -> v, zone(kit, v, z, dt), zoneDrop(kit, v)          per frame while a field with this vis lives
// The first tank with its own looks is Hoa Mộc Lan (moclan), after the owner's clip (~/handoff/dtt-ref/bili/mulan/NOTES.md):
// magenta sword light, a cyan ring round the planted sword, pink petals, white-gold flashes where the big blows land.
import * as THREE from '../../vendor/three.module.min.js';
import { B1 } from './looks-b1.js';
import { burst, slash, cut } from './lookkit.js';
import { B2 } from './looks-b2.js';
import { B3 } from './looks-b3.js';
import { B4 } from './looks-b4.js';
import { B5 } from './looks-b5.js';
import { B6 } from './looks-b6.js';
import { B9 } from './looks-b9.js';
import { B8 } from './looks-b8.js';
import { B7 } from './looks-b7.js';
import { K1 } from './looks-k1.js';
import { K2 } from './looks-k2.js';
import { K4 } from './looks-k4.js';
import { K8 } from './looks-k8.js';
import { K9 } from './looks-k9.js';
import { K7 } from './looks-k7.js';
import { K10 } from './looks-k10.js';
import { K6 } from './looks-k6.js';
import { K13 } from './looks-k13.js';
import { K14 } from './looks-k14.js';
import { K15 } from './looks-k15.js';
import { K18 } from './looks-k18.js';
import { K16 } from './looks-k16.js';
import { K11 } from './looks-k11.js';
import { K12 } from './looks-k12.js';
import { K17 } from './looks-k17.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
const PINK = C(2.4, 0.45, 1.7), HOT = C(2.6, 1.3, 2.2), DEEP = C(1.3, 0.15, 1.1), PETAL = C(1.0, 0.42, 0.62), CYAN = C(0.35, 1.0, 2.0), GOLDW = C(2.6, 2.1, 1.2), SOOT = C(0.08, 0.05, 0.07);

// ---- shared pieces ----------------------------------------------------------------------------------------------

// The giant sword of Liệt Không Trảm: a long diamond blade (point down), a swept guard, a grip and a pommel gem. Built once.
let swordGeo = null;
function swordParts() {
  if (swordGeo) return swordGeo;
  const blade = new THREE.CylinderGeometry(0.6, 0.02, 3.6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.3).translate(0, 1.8, 0);
  const edge = new THREE.CylinderGeometry(0.85, 0.05, 3.9, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.12).translate(0, 1.85, 0);
  const guard = new THREE.BoxGeometry(1.7, 0.2, 0.34).translate(0, 3.7, 0);
  const wing = new THREE.ConeGeometry(0.16, 0.7, 4).rotateZ(Math.PI / 2.6).translate(0.95, 3.85, 0);
  const wing2 = wing.clone().scale(-1, 1, 1);
  const grip = new THREE.CylinderGeometry(0.1, 0.12, 0.9, 6).translate(0, 4.25, 0);
  const gem = new THREE.OctahedronGeometry(0.22).translate(0, 4.85, 0);
  swordGeo = { blade, edge, guard, wing, wing2, grip, gem };
  return swordGeo;
}
function makeSword() {
  const P = swordParts(), g = new THREE.Group();
  const glowMat = new THREE.MeshBasicMaterial({ color: C(1.6, 0.25, 1.2), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const core = new THREE.MeshBasicMaterial({ color: C(1.35, 0.12, 0.85), toneMapped: false });
  const metal = new THREE.MeshStandardMaterial({ color: 0xe070c0, metalness: 0.7, roughness: 0.3, emissive: 0xa01070, emissiveIntensity: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c060, metalness: 0.9, roughness: 0.3, emissive: 0x402000, emissiveIntensity: 0.4 });
  const add = (geo, mat) => { const me = new THREE.Mesh(geo, mat); me.frustumCulled = false; g.add(me); return me; };
  add(P.blade, core); add(P.edge, glowMat); add(P.guard, metal); add(P.wing, gold); add(P.wing2, gold); add(P.grip, metal); add(P.gem, core);
  g.userData.mats = [glowMat, core, metal, gold];
  return g;
}
function dropSword(g) { g.parent && g.parent.remove(g); for (const m of g.userData.mats) m.dispose(); }

// Pink petals drifting up and out of a point.
function petals(kit, x, y, z, n, spread, speed) {
  for (let i = 0; i < kit.N(n); i++) {
    const a = Math.random() * 6.283, s = speed * kit.rnd(0.3, 1);
    kit.ovr.emit(x + Math.cos(a) * spread * Math.random(), y, z + Math.sin(a) * spread * Math.random(), Math.cos(a) * s, kit.rnd(0.6, 2.2), Math.sin(a) * s, PETAL, kit.rnd(0.7, 1.2), kit.rnd(0.18, 0.3), 1, 1.4, -0.6, 0.95, kit.K.CHIP);
  }
}

// A bright hit: white-gold star, pink sparks, a dark smoke puff (the clip's big blows all land like this).
function bigHit(kit, x, z, s = 1) {
  kit.glow(x, 1.3, z, GOLDW, 0.18, 3.2 * s, 1, kit.K.STAR, 1.4);
  kit.glow(x, 1.3, z, PINK, 0.3, 3.6 * s, 0.9, kit.K.GLOW, 1.3);
  kit.sparks(x, 1.2, z, kit.N(14), PINK, 10 * s, 0.4, 0.06, 0.7, 10);
  kit.puffs(x, 0.9, z, kit.N(4), SOOT, 0.5 * s, 2, 0.9, 1.2 * s, 2.2, 0.6, 0.7, kit.K.SMOKE, 2);
  kit.flash(x, 1.8, z, PINK, 40 * s, 0.22);
}

// ---- Hoa Mộc Lan --------------------------------------------------------------------------------------------------

export const LOOKS = {
  // Liệt Không Trảm: the sword falls point first at the cursor, lands in a white-gold flash with a dark burst, then stands
  // planted (the field) in a cyan ring, shedding magenta sparks and petals until the field ends.
  mlSword: {
    pal: [PINK, HOT], hitR: 2.4,
    skill(kit, e, u) { kit.glow(u.x, 1.6, u.z, PINK, 0.25, 2.4, 0.8, kit.K.GLOW, 1.3); return true; },
    strike(kit, e, u) {
      const g = makeSword(), delay = e.delay ?? 0.35;
      g.position.set(e.x, 9, e.z); g.rotation.y = Math.random() * 6.283; g.scale.setScalar(2.3); kit.group.add(g);
      kit.ring(e.x, e.z, 2.6, CYAN, delay + 0.05, 0.7);
      kit.anims.push({ t: 0, step(dt) {
        this.t += dt;
        const f = Math.min(1, this.t / delay);
        g.position.y = 9 * (1 - f * f) - 0.6 * f;
        if (Math.random() < 0.8) kit.str.emit(e.x, g.position.y + 2.5, e.z, 0, 6, 0, PINK, 0.18, 0.18, 0.05, 0, 0, 0.8);
        if (f < 1) return true;
        bigHit(kit, e.x, e.z, 1.3); burst(kit, e.x, e.z, 3.4, PINK, GOLDW, { life: 0.7 }); kit.ring(e.x, e.z, 3.2, PINK, 0.4); kit.ring(e.x, e.z, 1.6, GOLDW, 0.25, 0.8);
        kit.chips(e.x, 0.3, e.z, kit.N(8), C(0.35, 0.3, 0.3), 6, 0.8, 0.16); kit.kick(e.x, e.z, 0.6);
        petals(kit, e.x, 0.6, e.z, 10, 1.5, 3);
        return false;
      }, drop() { dropSword(g); } });
      return true;
    },
    zoneMake(kit, z) {
      const g = makeSword();
      g.position.set(z.x, -0.6, z.z); g.rotation.y = (z.id * 2.399) % 6.283; g.scale.setScalar(2.3); kit.group.add(g);
      const edge = kit.ground(0, z.x, z.z, z.r, CYAN, { alpha: 1 }); edge.u.uT.value = 1;   // a ring held at the end of its sweep
      return { g, rim: kit.ground(2, z.x, z.z, z.r, CYAN, { alpha: 1 }), edge };
    },
    zone(kit, v, z, dt) {
      const end = Math.min(1, (z.dur - z.age) * 2.5), pulse = 0.75 + 0.25 * Math.sin(z.age * 9);
      v.g.userData.mats[0].opacity = 0.8 * pulse * end;
      v.g.scale.setScalar(2.3 * (0.85 + 0.15 * end));
      kit.glow(z.x, 3.2, z.z, DEEP, 0.08, 2.6, 0.22 * pulse * end, kit.K.GLOW, 1);
      kit.glow(z.x, 1.0, z.z, CYAN, 0.08, 1.6, 0.15 * end, kit.K.GLOW, 1);
      if (Math.random() < dt * 40) { const a = Math.random() * 6.283, d = Math.random() * z.r; kit.glow(z.x + Math.cos(a) * d, 0.3, z.z + Math.sin(a) * d, PINK, 0.5, 0.28, 1, kit.K.SPARK, 0.3, 0, kit.rnd(1, 3), 0); }
      if (Math.random() < dt * 4) petals(kit, z.x, 2.5, z.z, 1, 0.6, 1);
      if (Math.random() < dt * 3) kit.glow(z.x, 2.2, z.z, PINK, 0.4, 2.6, 0.6, kit.K.GLOW, 1.2);
    },
    zoneDrop(kit, v) { dropSword(v.g); kit.release(v.rim); kit.release(v.edge); },
  },
  // Phá Không Trảm: a pink streak from where she was to the far side of the sword's victim.
  mlDash: {
    skill() { return true; },
    warp(kit, e) {
      const dx = e.x - e.x0, dz = e.z - e.z0, L = Math.hypot(dx, dz) || 1;
      const b = kit.beam(e.x0, e.z0, e.x, e.z, 0.8, PINK, 0.25, 2, 1.1); b.fade = true;
      for (let i = 0, n = kit.N(18); i < n; i++) { const t = Math.random(); kit.str.emit(e.x0 + dx * t, kit.rnd(0.5, 1.6), e.z0 + dz * t, dx / L * 18, 0, dz / L * 18, i % 3 ? PINK : HOT, 0.22, 0.09, 0.06, 0, 1, 1); }
      cut(kit, e.x, e.z, Math.atan2(dz, dx), 3, PINK, { edge: GOLDW, sparks: 5 });
      petals(kit, e.x0, 0.8, e.z0, 5, 0.8, 2); kit.flash(e.x, 1.6, e.z, PINK, 30, 0.2);
      return true;
    },
  },
  // Kinh Hồng Tam Thức: three thin magenta strokes in front, each sweeping back the other way; the third is bigger and lands
  // in a white-gold X cut (its raw max-hp cut).
  mlSweep: {
    pal: [PINK, HOT], hitR: 2.2,
    skill() { return true; },
    nova(kit, e, u, s) {
      const k = e.k || 0, big = k === (s.repeat || 1) - 1, r = e.r * (big ? 1.2 : 1.05);
      slash(kit, e.x, e.z, e.a, r * 1.75, big ? HOT : PINK, { dir: k % 2 ? -1 : 1, life: big ? 0.5 : 0.45, span: 1.65, w: r * 1.75 * 0.18, arcs: 3, edge: GOLDW, sweep: 0.08 });
      const fx = e.x + Math.cos(e.a) * r * 0.8, fz = e.z + Math.sin(e.a) * r * 0.8;
      if (big) { cut(kit, fx, fz, e.a, 3.8, PINK, { edge: GOLDW, sparks: 5 }); petals(kit, fx, 1, fz, 4, 1, 2); kit.flash(fx, 1.6, fz, PINK, 30, 0.15); kit.kick(e.x, e.z, 0.5); }
      else { cut(kit, fx, fz, e.a + (k % 2 ? 0.4 : -0.4), 3.4, PINK, { sparks: 3, life: 0.16 }); kit.kick(e.x, e.z, 0.2); }
      return true;
    },
  },
  // Không Bạo Liên Thành Trảm: while held a magenta orb swirls round her and two pink guide lines mark the blade's reach and
  // width, both growing with the charge; let go, one giant blade stroke and a long sword-light wave run down the lane.
  mlBlade: {
    pal: [PINK, HOT], hitR: 2.6,
    skill(kit, e, u) { kit.ring(u.x, u.z, 2.2, PINK, 0.4); return true; },
    castMake(kit, u, s) {
      const L0 = kit.beam(u.x, u.z, u.x + 1, u.z, 0.4, PINK, 99, 2, 0.15), L1 = kit.beam(u.x, u.z, u.x + 1, u.z, 0.4, PINK, 99, 2, 0.15);
      return { L0, L1, spin: 0 };
    },
    cast(kit, v, u, s, k, dt) {
      const C2 = s.charge, f = Math.min(1, k), a = u.cast.aim, ca = Math.cos(a), sa = Math.sin(a);
      const len = C2 ? C2.range[0] + (C2.range[1] - C2.range[0]) * f : s.range, w = C2 ? C2.width[0] + (C2.width[1] - C2.width[0]) * f : s.width;
      for (const [b, side] of [[v.L0, 1], [v.L1, -1]]) {
        const ox = -sa * w * 0.5 * side, oz = ca * w * 0.5 * side;
        kit.aimBeam(b, u.x + ox, u.z + oz, u.x + ox + ca * len, u.z + oz + sa * len, 0.15);
        b.u.uA.value = 0.5 + 0.7 * f;
      }
      v.spin += dt * (5 + 8 * f);
      const R = 1.6 + 0.4 * Math.sin(v.spin * 0.7);
      kit.glow(u.x, 1.2, u.z, DEEP, 0.08, 1.8 + 1.2 * f, 0.3 + 0.25 * f, kit.K.GLOW, 1);
      kit.glow(u.x, 1.2, u.z, PINK, 0.06, 0.8 + 0.6 * f, 0.4, kit.K.STAR, 1);
      for (let i = 0; i < 2; i++) {
        const b = v.spin + i * Math.PI;
        kit.str.emit(u.x + Math.cos(b) * R, 1.2 + 0.4 * Math.sin(b * 1.7), u.z + Math.sin(b) * R, -Math.sin(b) * 9, 0, Math.cos(b) * 9, i ? PINK : DEEP, 0.16, 0.1, 0.05, 0, 0, 1);
      }
      if (Math.random() < dt * 10) petals(kit, u.x + ca * len * Math.random(), 0.5, u.z + sa * len * Math.random(), 1, w * 0.4, 0.6);
    },
    castDrop(kit, v) { kit.endBeam(v.L0); kit.endBeam(v.L1); },
    beam(kit, e, u) {
      const dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz) || 1, a = Math.atan2(dz, dx), ux = dx / L, uz = dz / L;
      slash(kit, e.x0 + ux * 1.2, e.z0 + uz * 1.2, a, 8, HOT, { life: 0.55, span: 1.45, w: 1.2, arcs: 2, edge: GOLDW, sweep: 0.1, erode: 0.25 });
      const b = kit.beam(e.x0, e.z0, e.x1, e.z1, e.w * 1.6, PINK, 0.45, 0, 1.2); b.fade = true;
      for (let i = 0, n = kit.N(26); i < n; i++) { const t = Math.random(); kit.str.emit(e.x0 + dx * t - uz * kit.rnd(-1, 1) * e.w * 0.5, kit.rnd(0.6, 1.8), e.z0 + dz * t + ux * kit.rnd(-1, 1) * e.w * 0.5, ux * 26, 0, uz * 26, i % 3 ? PINK : GOLDW, 0.25, 0.1, 0.07, 0, 1, 1); }
      for (let t = 0.25; t <= 1.001; t += 0.25) kit.scorch(e.x0 + dx * t, e.z0 + dz * t, e.w * 0.45, 3, 1.1, PINK);
      cut(kit, e.x1, e.z1, a, 4.4, PINK, { edge: GOLDW, sparks: 5, life: 0.16 }); petals(kit, e.x1, 1, e.z1, 6, 1.2, 2.5);
      kit.flash(e.x0, 1.6, e.z0, HOT, 40, 0.25); kit.kick(e.x0, e.z0, 0.9);
      return true;
    },
  },
  // Cân Quắc Anh Hùng (passive): the fifth mark bursts into petals with a white-gold flash on the victim.
  mlBloom: {
    stacks(kit, e) { bigHit(kit, e.x, e.z, 0.8); petals(kit, e.x, 1.2, e.z, 16, 1, 3.5); kit.ring(e.x, e.z, 2, PINK, 0.35); return true; },
  },
};

Object.assign(LOOKS, B1, B2, B3, B4, B5, B6, B7, B8, B9);
Object.assign(LOOKS, K1, K2, K4, K8, K9, K7, K10, K6, K13, K14, K15, K18, K16, K11, K12, K17);   // kit lanes (bộ chiêu gốc)

// The row of unit u that a look-carrying event names (skills, their second stages, the passive).
export function lookRow(u, id) {
  if (!u || !u.def) return null;
  for (const s of u.def.skills) {
    if (s.id === id) return s;
    for (let n = s.next; n; n = n.row.next) if (n.row.id === id) return n.row;   // kit lane K13: every stage of a next chain
    for (let t = s.then; t; t = t.then) if (t.id === id) return t;   // kit lanes k9, K10: follow-up rows (G3 then) with a look
    if (s.bgRe && s.bgRe.id === id) return s.bgRe;   // kit lane k9: Black Panther's second charge
    for (let t = s.next && s.next.row.aoqBig && s.next.row.aoqBig.row; t; t = t.then) if (t.id === id) return t;   // kit lane k16: Lạc Long Quân's big recast
  }
  return null;
}
export const lookOf = (row) => (row && row.look && LOOKS[row.look]) || null;
