// Looks, kit lane K6: Magneto, Sơn Tinh, Tào Tháo (kits ported from the owner's clips, see data.js). Render only (see looks.js for
// the hooks; `ev` draws a { t: 'kit', look } event of the sim's kit lane K6 blocks).
// Clip notes (bilibili BV1Kp4y1b7i6):
//   Magneto p86 (gameplay 17-40 s): Q two long steel girders crash in crossed like an X on a pale blue ring, a magenta-white blast
//     where they land; E a magenta magnetic burst with a pink orb inside a blue ring, the foes float, then the slam; R a pink orb
//     round him and a thin red range ring, foes all over the map lit up.
//   Sơn Tinh p14 (gameplay 30-56 s): Q a pale blue ring round him, then a dark cloud of rock dust and stones; R he vanishes and lands
//     as a stone giant with gold rims, thick dust; its boulders burst in a gold-orange ring of rock bits.
//   Tào Tháo p11 (gameplay 9-23 s): a thin magenta ring (R's reach) follows him, a purple vortex under him; E a purple claw; the
//     ult wraps him and his prey in purple-black smoke like demon wings.
// One main colour and one accent per tank: Magneto magenta + steel (pale blue rings), Sơn Tinh earth gold + pale curse blue,
// Tào Tháo violet + black smoke (the thin magenta ring).
import * as THREE from '../../vendor/three.module.min.js';
import { C, own, stop, sigil, shell, pillar, spikes, burst, slash, cut, trail } from './lookkit.js';

const R = (a, b) => a + Math.random() * (b - a);

// ---- Magneto ------------------------------------------------------------------------------------------------------
const MAG = C(2.3, 0.3, 1.25), MAGW = C(2.6, 1.5, 2.2), ICE = C(0.55, 1.2, 2.5), STEELC = C(0.62, 0.6, 0.66), RED = C(2.2, 0.25, 0.35);

// A steel girder: an I-beam profile extruded along +y (the beam stands on its foot at y 0), built once.
let beamGeo = null;
function girderGeo() {
  if (beamGeo) return beamGeo;
  const s = new THREE.Shape(), w = 0.55, f = 0.12, t = 0.09, h = 0.42;
  s.moveTo(-w, -h); s.lineTo(w, -h); s.lineTo(w, -h + f); s.lineTo(t, -h + f); s.lineTo(t, h - f); s.lineTo(w, h - f); s.lineTo(w, h);
  s.lineTo(-w, h); s.lineTo(-w, h - f); s.lineTo(-t, h - f); s.lineTo(-t, -h + f); s.lineTo(-w, -h + f); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 7.5, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2);   // extrude along +y
  g.userData.keep = true; beamGeo = g;
  return g;
}
function girder(len = 1) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x9a96a6, metalness: 0.85, roughness: 0.32, emissive: 0x3a0626, emissiveIntensity: 0.45, transparent: true, opacity: 1 });
  const glowM = new THREE.MeshBasicMaterial({ color: MAG.clone().multiplyScalar(0.55), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const body = new THREE.Mesh(girderGeo(), metal), sheath = new THREE.Mesh(girderGeo(), glowM);
  sheath.scale.set(1.18, 1.01, 1.18); body.castShadow = true;
  g.add(body, sheath); g.scale.set(1, len, 1);
  g.userData.mats = [metal, glowM];
  return g;
}
const fadeGirder = (g, k) => { g.userData.mats[0].opacity = k; g.userData.mats[1].opacity = 0.32 * k; };

// one girder falls from high on one side, tilted, and spears the ground at (x, z); k 0 / 1 lean opposite ways (the clip's X)
function dropGirder(kit, x, z, delay, k, big) {
  const g = girder(big ? 1.1 : 0.9), side = k ? -1 : 1, yaw = 0.7 + side * 0.8, lean = 0.62;
  const dx = Math.cos(yaw), dz = Math.sin(yaw), L = 7.5 * (big ? 1.1 : 0.9);
  g.rotation.order = 'YXZ'; g.rotation.y = -yaw + Math.PI / 2; g.rotation.x = 0; g.rotation.z = 0;
  const tilt = new THREE.Group(); tilt.add(g); g.rotation.set(0, 0, 0);
  tilt.rotation.order = 'YZX'; tilt.rotation.y = -yaw; tilt.rotation.z = lean * side;
  // the foot of the beam ends 1.2 m under the floor at the strike point once it lands
  const start = 14, sink = -1.2;
  tilt.position.set(x, start, z);
  own(kit, [tilt], delay + 0.9, (t) => {
    if (t < delay) {
      const f = t / delay;
      tilt.position.set(x - dx * 3 * (1 - f) * side, start + (sink - start) * f * f, z - dz * 3 * (1 - f) * side);
      if (Math.random() < 0.6) kit.glow(tilt.position.x, tilt.position.y + 2, tilt.position.z, MAG, 0.25, 0.9, 0.7, kit.K.GLOW, 1.2, 0, 6, 0);
      return;
    }
    if (!tilt.userData.hit) {
      tilt.userData.hit = true; tilt.position.set(x, sink, z);
      burst(kit, x, z, big ? 3.6 : 3.1, MAG, MAGW, { life: 0.35 });
      kit.ring(x, z, big ? 3 : 2.6, MAG, 0.4); kit.ring(x, z, 1.4, MAGW, 0.25, 0.8);
      kit.chips(x, 0.4, z, kit.N(10), STEELC, 7, 0.9, 0.16);
      kit.puffs(x, 0.4, z, kit.N(5), C(0.16, 0.1, 0.14), 1.2, 3, 0.9, 1.3, 2.2, 0.5, 0.6, kit.K.SMOKE, 2);
      kit.sparks(x, 0.8, z, kit.N(16), MAGW, 11, 0.45, 0.07, 0.8, 10);
      kit.flash(x, 1.6, z, MAG, big ? 60 : 45, 0.25); kit.kick(x, z, big ? 0.7 : 0.5);
    }
    const k2 = 1 - (t - delay) / 0.9;
    fadeGirder(g, Math.max(0, Math.min(1, k2 * 1.6)));
    tilt.position.y = sink - (1 - k2) * 1.2;
  });
  // the clip's girders are tall: a magenta light streak down the beam's line as it falls
  return tilt;
}

// a magenta thunder bolt from the sky onto (x, z): a thin pillar, a white core, a ground spark ring
function bolt(kit, x, z, s = 1) {
  pillar(kit, x, z, 0.38 * s, MAG, { c2: MAGW, h: 14, life: 0.8, grow: 0.05, narrow: true, add: true });
  pillar(kit, x, z, 0.14 * s, MAGW, { h: 14, life: 0.4, grow: 0.04, add: true });
  sigil(kit, x, z, 1.5 * s, MAG, { c2: ICE, n: 0, ticks: 8, inner: 0.6, fill: 0.08, w: 0.06, life: 0.8, rev: 0.06, spin: 2.5 });
  kit.glow(x, 1.1, z, MAGW, 0.18, 1.6 * s, 1, kit.K.STAR, 1.3);
  kit.glow(x, 1.0, z, MAG, 0.35, 2.4 * s, 0.8, kit.K.GLOW, 1.2);
  kit.sparks(x, 0.5, z, kit.N(8), MAG, 6, 0.35, 0.06, 0.6, 8);
  kit.ring(x, z, 1.4 * s, MAG, 0.35, 0.8);
}

// ---- Sơn Tinh -------------------------------------------------------------------------------------------------------
const EARTH = C(1.55, 0.95, 0.35), STGOLD = C(2.4, 1.65, 0.45), DUSTC = C(0.36, 0.3, 0.24), SOOT = C(0.13, 0.1, 0.08), CURSE = C(0.55, 1.15, 2.4), STONE = C(0.5, 0.46, 0.4);

function rockDust(kit, x, z, r, n, life = 1.3) {
  kit.puffs(x, 0.5, z, kit.N(n), DUSTC, r * 0.6, 2.5, life, r * 0.55, 2.2, 0.7, 0.75, kit.K.SMOKE, 2);
  kit.puffs(x, 0.4, z, kit.N(Math.ceil(n / 2)), SOOT, r * 0.4, 1.6, life * 0.9, r * 0.45, 2, 0.4, 0.6, kit.K.SMOKE, 2);
  kit.chips(x, 0.5, z, kit.N(n), STONE, 5 + r, 1.0, 0.22);
}
// a ring of dust rolling outward from radius r (a shock wave through the ground)
function dustRing(kit, x, z, r, n, c = DUSTC, speed = 3) {
  for (let i = 0, k = kit.N(n); i < k; i++) {
    const a = (i / k) * 6.283 + Math.random() * 0.3;
    kit.ovr.emit(x + Math.cos(a) * r, 0.4, z + Math.sin(a) * r, Math.cos(a) * speed, R(0.3, 0.9), Math.sin(a) * speed, c, R(0.7, 1.1), R(0.9, 1.4), 2, 2, 0, 0.75, kit.K.SMOKE);
  }
}
// a craggy boulder (an icosphere with its corners pushed in and out, flat shaded), built once
let rockGeo = null;
function boulder() {
  if (!rockGeo) {
    rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const P = rockGeo.attributes.position;
    for (let i = 0; i < P.count; i++) { const k = 0.8 + 0.35 * Math.abs(Math.sin(i * 12.9898) * 43758.5 % 1); P.setXYZ(i, P.getX(i) * k, P.getY(i) * k * 0.85, P.getZ(i) * k); }
    rockGeo = rockGeo.toNonIndexed(); rockGeo.computeVertexNormals(); rockGeo.userData.keep = true;
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a6448, roughness: 0.9, metalness: 0.05, flatShading: true, emissive: 0x3a2408, emissiveIntensity: 0.6, transparent: true, opacity: 1 });
  const m = new THREE.Mesh(rockGeo, mat); m.castShadow = true;
  return m;
}

// ---- Tào Tháo -------------------------------------------------------------------------------------------------------
const VIO = C(1.35, 0.3, 2.3), VIOW = C(2.2, 1.3, 2.6), RING = C(2.0, 0.3, 1.9), SMOKEV = C(0.13, 0.03, 0.17), BLOOD = C(2.3, 0.2, 0.45);

// demon wings: two fans of dark violet smoke swept back from a unit (a burst of puffs on each side, every frame a few)
function wings(kit, u, dt, k = 1) {
  const a = (u.heading ?? u.aim ?? 0) + Math.PI, n = Math.random() < dt * 40 * k ? 2 : 0;
  for (let i = 0; i < n; i++) {
    const side = i ? 1 : -1, sp = a + side * R(0.6, 1.4), d = R(0.6, 2.2);
    kit.ovr.emit(u.x + Math.cos(sp) * d, R(0.8, 2.4), u.z + Math.sin(sp) * d, Math.cos(sp) * 1.6, R(0.4, 1.4), Math.sin(sp) * 1.6, i % 2 ? SMOKEV : C(0.3, 0.06, 0.38), R(0.6, 1.0), R(0.9, 1.5), 1.8, 1.5, 0, 0.8, kit.K.SMOKE);
  }
  if (Math.random() < dt * 12 * k) kit.glow(u.x + R(-1, 1), R(0.5, 2), u.z + R(-1, 1), VIO, R(0.4, 0.7), 0.5, 0.9, kit.K.SPARK, 0.3, 0, R(1, 2.5), 0);
}

export const K6 = {
  // ===== Magneto =====
  // Kim Loại Oanh Tạc: a pale blue target ring, then two steel girders crash in from either side and stand crossed in an X, each
  // landing in a magenta-white blast; a foe under both gets a magenta X cut.
  mgBeams: {
    pal: [MAG, MAGW], hitR: 2.4,
    skill(kit, e, u) { kit.glow(u.x, 2.2, u.z, MAG, 0.25, 1.8, 0.9, kit.K.GLOW, 1.3); kit.flash(u.x, 2, u.z, MAG, 20, 0.15); return true; },
    strike(kit, e) {
      const d = e.delay ?? 0.45, k = e.k || 0;
      if (!k) {
        sigil(kit, e.x, e.z, 2.6, ICE, { c2: MAG, n: 0, ticks: 12, inner: 0.55, fill: 0.03, w: 0.05, life: d + 0.7, rev: 0.12, spin: 1.2 });
        kit.ring(e.x, e.z, 2.8, ICE, d, 0.6);
      }
      dropGirder(kit, e.x, e.z, d, k, k === 1);
      return true;
    },
    ev(kit, e) { if (e.k === 'both') { cut(kit, e.x, e.z, Math.random() * 3.14, 3.4, MAG, { edge: MAGW, sparks: 6, life: 0.2 }); kit.flash(e.x, 1.6, e.z, MAGW, 30, 0.2); } },
  },
  // Trọng Lực Phản Xung: a pale blue ring at the cursor; the lift bursts magenta with a pink orb rising in its middle and steel
  // shards circling up for the 1.5 s the foes float; the slam drops the orb in a white-pink shock ring with dust.
  mgLift: {
    pal: [MAG, MAGW], hitR: 2.6,
    skill(kit, e, u) { kit.glow(u.x, 2.2, u.z, ICE, 0.25, 1.6, 0.9, kit.K.GLOW, 1.3); return true; },
    strike(kit, e) {
      const d = e.delay ?? 0.3, x = e.x, z = e.z;
      if ((e.k || 0) === 0) {
        sigil(kit, x, z, 3.2, ICE, { c2: MAG, n: 6, m: 2, ticks: 0, inner: 0.82, fill: 0.04, w: 0.05, life: d + 1.5, rev: d, spin: 0.9, alpha: 0.9 });
        const zo = kit.match && kit.match.zones.find((q) => q.id === e.id), own = zo && kit.match.units[zo.owner];
        kit.anims.push({ t: 0, drop() {}, step(dt) {
          this.t += dt;
          if (this.t < d) return true;
          shell(kit, x, 0, z, 3.2, ICE, { c2: MAG, dome: true, p: 2.6, core: 0.06, bands: 1.4, life: 1.5, grow: 0.12, alpha: 0.75 });
          if (own) for (const o of kit.match.units) if (o.team !== own.team && o.alive && Math.hypot(o.x - x, o.z - z) < 3 + o.radius * 0.6) shell(kit, o.x, 1.4, o.z, 1.5, MAG, { c2: MAGW, p: 1.5, core: 0.15, life: 1.5, grow: 0.1, follow: o, pulse: 2, alpha: 0.9 });
          return false;
        } });
        const orb = shell(kit, x, 1.0, z, 1.0, MAG, { c2: MAGW, core: 0.35, p: 1.6, life: d + 1.5, grow: 0.15, alpha: 0.95,
          step: (t, mesh) => { if (t < d) { mesh.scale.setScalar(0.01); return; } mesh.position.y = 1.0 + Math.min(1, (t - d) / 0.4) * 1.6; mesh.scale.setScalar(1.15 + 0.1 * Math.sin(t * 9)); } });
        kit.anims.push({ t: 0, drop() {}, step(dt) {
          this.t += dt;
          if (this.t < d) return true;
          if (!this.go) { this.go = true; burst(kit, x, z, 3.4, MAG, MAGW, { life: 0.35 }); kit.ring(x, z, 3.2, MAG, 0.45); kit.flash(x, 1.8, z, MAG, 45, 0.25); }
          const a = this.t * 5;
          for (let i = 0; i < 3; i++) { const b = a + i * 2.09, rr = 2.2; kit.glow(x + Math.cos(b) * rr, 1.2 + (this.t - d) * 1.2, z + Math.sin(b) * rr, STEELC, 0.12, 0.45, 1, kit.K.STAR, 1); kit.str.emit(x + Math.cos(b) * rr, 1.2 + (this.t - d), z + Math.sin(b) * rr, -Math.sin(b) * 6, 1.5, Math.cos(b) * 6, MAG, 0.18, 0.08, 0.04, 0, 0, 1); }
          return this.t < d + 1.5;
        } });
        return true;
      }
      // the slam
      kit.anims.push({ t: 0, drop() {}, step(dt) {
        this.t += dt;
        if (this.t < d) return true;
        burst(kit, x, z, 4.2, MAG, MAGW, { life: 0.35 });
        kit.ring(x, z, e.r || 3.5, MAGW, 0.35); kit.ring(x, z, (e.r || 3.5) * 1.2, MAG, 0.55, 0.8);
        kit.puffs(x, 0.3, z, kit.N(10), DUSTC, 2.4, 5, 0.9, 1.2, 2.4, 0.3, 0.6, kit.K.DUST, 3);
        kit.chips(x, 0.4, z, kit.N(10), STEELC, 7, 0.8, 0.15); kit.kick(x, z, 0.8); kit.flash(x, 1.4, z, MAGW, 55, 0.25);
        return false;
      } });
      return true;
    },
  },
  // Từ Năng Phong Bạo: a pink magnetic orb round him and the thin red ring of the near bonus for the 6 s; every strike a magenta
  // bolt drops on each foe on the map, and a steel girder spears the one near him that takes the bonus.
  mgStorm: {
    pal: [MAG, MAGW], hitR: 2,
    skill(kit, e, u) { kit.flash(u.x, 2, u.z, MAG, 50, 0.3); kit.ring(u.x, u.z, 6, RED, 0.5, 0.8); return true; },
    zoneMake(kit, z) {
      const o = kit.match && kit.match.units[z.owner];
      const orb = shell(kit, z.x, 1.3, z.z, 2.5, MAG, { c2: MAGW, core: 0.12, p: 1.7, bands: 1.2, life: 1e9, grow: 0.2, pulse: 1.2, alpha: 0.9 });
      const ring = sigil(kit, z.x, z.z, z.r, RED, { c2: MAG, n: 0, ticks: 36, inner: 0.97, fill: 0.0, w: 0.025, life: 1e9, rev: 0.3, spin: 0.4, alpha: 0.9 });
      const field = sigil(kit, z.x, z.z, 3.2, MAG, { c2: ICE, n: 5, m: 2, ticks: 0, inner: 0.7, fill: 0.05, w: 0.05, life: 1e9, rev: 0.3, spin: -1.4, alpha: 0.85 });
      const dome = shell(kit, z.x, 0, z.z, z.r, MAG, { c2: RED, dome: true, p: 3.2, core: 0.02, bands: 0.9, life: 1e9, grow: 0.25, alpha: 0.75 });
      return { orb, ring, field, dome, o, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt;
      const x = v.o && v.o.alive ? v.o.x : z.x, zz = v.o && v.o.alive ? v.o.z : z.z;
      v.orb.position.set(x, 1.3, zz); v.dome.position.set(x, 0, zz); v.ring.position.set(x, 0.15, zz); v.field.position.set(x, 0.16, zz);
      if (Math.random() < dt * 30) { const a = Math.random() * 6.283; kit.str.emit(x + Math.cos(a) * 2.2, R(0.6, 2.2), zz + Math.sin(a) * 2.2, -Math.sin(a) * 7, 0, Math.cos(a) * 7, MAG, 0.25, 0.08, 0.05, 0, 0, 1); }
    },
    zoneDrop(kit, v) { stop(v.orb); stop(v.ring); stop(v.field); stop(v.dome); },
    ev(kit, e) {
      if (e.k === 'bolt') bolt(kit, e.x, e.z, 1);
      else if (e.k === 'near') { dropGirder(kit, e.x, e.z, 0.12, Math.random() < 0.5 ? 0 : 1, false); bolt(kit, e.x, e.z, 1.4); }
    },
  },

  // ===== Sơn Tinh =====
  // Đại Địa Trớ Chú: a pale blue ring closes round him over the wind-up; it lands as a curse ring and every foe inside wears a
  // shrinking blue ring with stone grit crawling up it for 3 s; when the curse runs out, a dark cloud of rock dust and stone spikes.
  stCurse: {
    pal: [CURSE, STGOLD], hitR: 2,
    skill() { return true; },
    castMake(kit, u, s) { return { g: sigil(kit, u.x, u.z, s.radius, CURSE, { c2: EARTH, n: 0, ticks: 16, inner: 0.9, fill: 0.03, w: 0.05, life: 1e9, rev: s.windup, spin: 1.6, alpha: 0.9 }) }; },
    cast(kit, v, u, s, k) { v.g.position.set(u.x, 0.15, u.z); v.g.scale.setScalar(s.radius * (1.25 - 0.25 * k)); },
    castDrop(kit, v) { stop(v.g); },
    nova(kit, e, u) {
      const r = e.r;
      sigil(kit, e.x, e.z, r, CURSE, { c2: EARTH, n: 6, m: 2, ticks: 24, inner: 0.86, fill: 0.08, w: 0.07, life: 1.1, rev: 0.12, spin: 0.8 });
      shell(kit, e.x, 0, e.z, r, CURSE, { c2: STONE, dome: true, p: 2.4, core: 0.04, bands: 1.1, life: 1.0, grow: 0.12, alpha: 0.85 });
      kit.ring(e.x, e.z, r, CURSE, 0.5); kit.flash(e.x, 1.4, e.z, CURSE, 35, 0.2);
      rockDust(kit, e.x, e.z, r * 0.6, 8, 1.0); dustRing(kit, e.x, e.z, r * 0.9, 18, DUSTC, 2);
      kit.puffs(e.x, 0.6, e.z, kit.N(22), SOOT, r * 0.85, 0.8, 1.3, 1.5, 1.8, 0.5, 0.7, kit.K.SMOKE, 1.5);
      kit.scorch(e.x, e.z, r * 0.75, 3, 0.2, CURSE);
      for (const o of kit.match.units) {
        if (o.team === u.team || !o.alive || Math.hypot(o.x - e.x, o.z - e.z) > r + 0.5) continue;
        const g = sigil(kit, o.x, o.z, 1.6, CURSE, { c2: STONE, n: 0, ticks: 8, inner: 0.7, fill: 0.08, w: 0.07, life: 3, rev: 0.1, spin: 2, follow: o, alpha: 0.95 });
        kit.follow(o, 3, (t, dt) => {
          g.scale.setScalar(1.6 - 0.7 * Math.min(1, t / 3));
          if (Math.random() < dt * (6 + t * 6)) kit.puffs(o.x, 0.3, o.z, 1, STONE, 0.6, 0.6, 0.8, 0.5, 1.6, 0.6, 0.7, kit.K.DUST, 2);
        });
      }
      return true;
    },
    ev(kit, e) {
      if (e.k !== 'burst') return;
      rockDust(kit, e.x, e.z, 3, 12, 1.5);
      spikes(kit, e.x, e.z, 7, 1.3, 1.6, EARTH, 1.1, { core: 0x2a1c0e });
      burst(kit, e.x, e.z, 2.6, EARTH, STGOLD, { life: 0.3 });
      kit.ring(e.x, e.z, 2.4, CURSE, 0.4, 0.8); kit.kick(e.x, e.z, 0.5);
    },
  },
  // Đại Địa Chi Nộ: a gold-rimmed earth ring under him, stone shards burst up round him, and for the 4 s rocks circle him with dust
  // at his tracks.
  stWrath: {
    pal: [EARTH, STGOLD], hitR: 1.8,
    skill(kit, e, u) {
      sigil(kit, u.x, u.z, 3.6, STGOLD, { c2: EARTH, n: 8, m: 3, ticks: 0, inner: 0.78, fill: 0.12, w: 0.08, life: 4, rev: 0.15, spin: 1.2, follow: u, alpha: 0.9 });
      spikes(kit, u.x, u.z, 12, 2.8, 2.6, EARTH, 1.3, { core: 0x2a1c0e });
      dustRing(kit, u.x, u.z, 3.2, 20, DUSTC, 3.5);
      kit.puffs(u.x, 0.5, u.z, kit.N(18), DUSTC, 3.2, 1.2, 1.2, 1.5, 1.8, 0.5, 0.75, kit.K.SMOKE, 1.5);
      kit.scorch(u.x, u.z, 3.4, 3, 0.5, EARTH);
      // a ring of rocks heaves up out of the ground round him and sinks back
      for (let i = 0; i < 8; i++) { const rk = boulder(), a = i * 0.785 + 0.2, rr = 2.6 + (i % 2) * 0.6, x = u.x + Math.cos(a) * rr, z = u.z + Math.sin(a) * rr; rk.rotation.set(i, i * 2, 0); own(kit, [rk], 1.1, (t) => { const k = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.6) / 0.5); rk.position.set(x, -0.3 + 0.6 * k, z); rk.scale.setScalar(0.75 * Math.max(0.05, k)); }); }
      for (let i = 0; i < 3; i++) { const rk = boulder(); rk.scale.setScalar(0.6); own(kit, [rk], 4, (t) => { if (!u.alive) return false; const a = t * 4 + i * 2.09; rk.position.set(u.x + Math.cos(a) * 1.9, 1.3 + 0.3 * Math.sin(t * 5 + i), u.z + Math.sin(a) * 1.9); rk.rotation.set(t * 3, t * 2 + i, 0); rk.material.opacity = Math.min(1, (4 - t) * 3); }); }
      rockDust(kit, u.x, u.z, 2.2, 6, 0.9); kit.flash(u.x, 1.4, u.z, STGOLD, 30, 0.2);
      kit.follow(u, 4, (t, dt) => {
        for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.09; kit.glow(u.x + Math.cos(a) * 1.7, 1.2 + 0.3 * Math.sin(t * 5 + i), u.z + Math.sin(a) * 1.7, STONE, 0.07, 0.55, 1, kit.K.GLOW, 1); kit.glow(u.x + Math.cos(a) * 1.7, 1.2, u.z + Math.sin(a) * 1.7, STGOLD, 0.06, 0.28, 1, kit.K.STAR, 1); }
        if (Math.random() < dt * 8) kit.puffs(u.x, 0.2, u.z, 1, DUSTC, 0.8, 1, 0.7, 0.7, 1.8, 0.3, 0.6, kit.K.DUST, 2);
      });
      return true;
    },
  },
  // Sơn Thần Giáng Lâm: he goes up in a column of rock dust; a gold-rimmed landing circle closes on the cursor for the second he is
  // gone, stones rain into it, then the god lands: a gold-orange shock ring, stone spires and a thick dust cloud. While the god
  // stands, dust at his feet and gold motes; at the end a grey stone puff (the petrify).
  stGod: {
    pal: [EARTH, STGOLD], hitR: 2.6,
    skill(kit, e, u) {
      const x = e.tx ?? u.x, z = e.tz ?? u.z, T = 1.0;
      pillar(kit, e.x, e.z, 1.3, DUSTC, { c2: STGOLD, h: 9, life: 0.8, grow: 0.15, narrow: true });
      rockDust(kit, e.x, e.z, 2.4, 10, 1.2);
      sigil(kit, x, z, 4, STGOLD, { c2: EARTH, n: 8, m: 3, ticks: 32, inner: 0.84, fill: 0.08, w: 0.06, life: T + 0.25, rev: 0.2, spin: 1.5 });
      const shade = sigil(kit, x, z, 3.2, C(0.06, 0.04, 0.02), { n: 0, ticks: 0, inner: 0, fill: 0.85, w: 0, life: T + 0.1, rev: 0.05, alpha: 0.55, grow: 2.5 });
      kit.anims.push({ t: 0, drop() {}, step(dt) { this.t += dt; if (Math.random() < dt * 14) { const a = Math.random() * 6.283, d = Math.random() * 3.6; kit.chips(x + Math.cos(a) * d, 7, z + Math.sin(a) * d, 1, STONE, 0.5, 0.9, 0.3, -1); } return this.t < T; } });
      const rk = boulder();
      own(kit, [rk], T + 0.05, (t) => { const f = Math.min(1, t / T); rk.position.set(x, 16 * (1 - f * f) + 1.2, z); rk.scale.setScalar(2.6); rk.rotation.set(t * 2, t * 1.3, 0); });
      pillar(kit, x, z, 2.4, STGOLD, { c2: EARTH, h: 12, life: T + 0.1, grow: 0.25, alpha: 0.45, rings: 0.6 });
      return !!shade;
    },
    nova(kit, e) {
      const r = e.r || 4;
      burst(kit, e.x, e.z, 4.6, EARTH, STGOLD, { life: 0.35 });
      kit.ring(e.x, e.z, r, STGOLD, 0.5); kit.ring(e.x, e.z, r * 1.3, EARTH, 0.7, 0.7);
      spikes(kit, e.x, e.z, 10, r * 0.75, 2.4, EARTH, 1.3, { core: 0x2a1c0e, up: 0.1 });
      rockDust(kit, e.x, e.z, r, 16, 1.6);
      kit.scorch(e.x, e.z, r * 0.8, 3, 0.6, EARTH); kit.kick(e.x, e.z, 1.1); kit.flash(e.x, 2, e.z, STGOLD, 70, 0.3);
      return true;
    },
    transform(kit, e, u) {
      if (!e.on) { rockDust(kit, e.x, e.z, 2.2, 10, 1.4); kit.ring(e.x, e.z, 2.4, STONE, 0.5); return true; }
      kit.follow(u, 13, (t, dt) => {
        if (Math.random() < dt * 6) kit.puffs(u.x + R(-1, 1), 0.2, u.z + R(-1, 1), 1, DUSTC, 0.6, 1, 0.8, 0.9, 1.8, 0.3, 0.55, kit.K.DUST, 2);
        if (Math.random() < dt * 10) kit.glow(u.x + R(-1.2, 1.2), R(0.6, 2.6), u.z + R(-1.2, 1.2), STGOLD, R(0.4, 0.8), 0.3, 0.9, kit.K.SPARK, 0.3, 0, R(0.6, 1.5), 0);
      });
      return true;
    },
  },

  // ===== Tào Tháo =====
  // Dục Huyết Kiêu Hùng: the thin magenta ring of its reach and a turning purple vortex under him for the 5 s, violet wisps
  // whipping round; each foe a pulse cuts flashes violet. The passive's blood rage: a blood-red ring and red motes rising for 3 s.
  ccAura: {
    pal: [VIO, VIOW], hitR: 1.8,
    skill(kit, e, u) { kit.flash(u.x, 1.6, u.z, VIO, 30, 0.2); return true; },
    zoneMake(kit, z) {
      const o = kit.match && kit.match.units[z.owner];
      const ring = sigil(kit, z.x, z.z, z.r, RING, { c2: VIO, n: 0, ticks: 0, inner: 0, fill: 0, w: 0.035, life: 1e9, rev: 0.2, spin: 0, alpha: 1 });
      const vortex = sigil(kit, z.x, z.z, 1.8, VIO, { c2: SMOKEV, n: 7, m: 3, ticks: 14, inner: 0.45, fill: 0.25, w: 0.08, life: 1e9, rev: 0.2, spin: -3, alpha: 0.95 });
      return { ring, vortex, o };
    },
    zone(kit, v, z, dt) {
      const x = v.o && v.o.alive ? v.o.x : z.x, zz = v.o && v.o.alive ? v.o.z : z.z;
      v.ring.position.set(x, 0.15, zz); v.vortex.position.set(x, 0.16, zz);
      if (v.o && v.o.alive) wings(kit, v.o, dt, 0.6);
      if (Math.random() < dt * 14) { const a = Math.random() * 6.283, rr = R(1, z.r); kit.str.emit(x + Math.cos(a) * rr, R(0.4, 1.4), zz + Math.sin(a) * rr, -Math.sin(a) * 9, 0, Math.cos(a) * 9, VIO, 0.25, 0.09, 0.05, 0, 0, 1); }
    },
    zoneDrop(kit, v) { stop(v.ring); stop(v.vortex); },
    ev(kit, e, u) {
      if (e.k !== 'blood' || !u) return;
      kit.ring(u.x, u.z, 2.4, BLOOD, 0.5);
      kit.follow(u, 3, (t, dt) => { if (Math.random() < dt * 16) kit.glow(u.x + R(-0.9, 0.9), R(0.4, 1.4), u.z + R(-0.9, 0.9), BLOOD, R(0.5, 0.8), 0.32, 1, kit.K.SPARK, 0.3, 0, R(1.5, 3), 0); });
    },
  },
  // Bá Đạo Chi Thủ: a purple claw: three violet claw strokes gather over the spot while dark smoke swirls in, then rake down
  // closing on the middle with a violet blast.
  ccHand: {
    pal: [VIO, VIOW], hitR: 2.4,
    zones: ['strike'],
    skill(kit, e, u) { kit.glow(u.x, 1.8, u.z, VIO, 0.2, 1.6, 0.9, kit.K.GLOW, 1.3); return true; },
    zoneMake(kit, z) {
      const r = Math.max(2.4, z.r);
      const g = sigil(kit, z.x, z.z, r, VIO, { c2: RING, n: 5, m: 2, ticks: 0, inner: 0.7, fill: 0.06, w: 0.05, life: 1e9, rev: 0.15, spin: 2 });
      kit.puffs(z.x, 0.6, z.z, kit.N(6), SMOKEV, r, -2.5, 0.6, 1.2, 1.4, 0.4, 0.75, kit.K.SMOKE, 1);
      return { g, r, t: 0 };
    },
    zone(kit, v, z, dt) {
      v.t += dt;
      if (Math.random() < dt * 20) { const a = Math.random() * 6.283; kit.str.emit(z.x + Math.cos(a) * v.r * 1.4, R(1, 3), z.z + Math.sin(a) * v.r * 1.4, -Math.cos(a) * 9, -2, -Math.sin(a) * 9, VIO, 0.2, 0.08, 0.05, 0, 0, 1); }
    },
    zoneDrop(kit, v) { stop(v.g); },
    land(kit, e) {
      const a0 = Math.random() * 6.283;
      // three claws rake in toward the middle from round the edge, a beat apart, each a thick violet stroke with a black wake
      for (let i = 0; i < 3; i++) {
        const a = a0 + i * 2.09;
        slash(kit, e.x + Math.cos(a) * 2.2, e.z + Math.sin(a) * 2.2, a + Math.PI, 3.8, VIO, { c2: SMOKEV, edge: VIOW, life: 0.6, span: 0.85, w: 0.95, sweep: 0.08, dir: i % 2 ? -1 : 1, arcs: 2, erode: 0.3 });
      }
      kit.scorch(e.x, e.z, 2.6, 3, 0.3, VIO);
      shell(kit, e.x, 0, e.z, 3, VIO, { c2: SMOKEV, dome: true, p: 2.2, core: 0.08, life: 0.55, grow: 0.08, alpha: 0.8 });
      burst(kit, e.x, e.z, 3.2, VIO, VIOW, { life: 0.3 });
      kit.ring(e.x, e.z, e.r || 3, RING, 0.4);
      kit.puffs(e.x, 0.6, e.z, kit.N(8), SMOKEV, 1.6, 2.5, 0.9, 1.3, 2.2, 0.5, 0.75, kit.K.SMOKE, 2);
      kit.kick(e.x, e.z, 0.5);
      return true;
    },
  },
  // Hiệp Thiên Tử Lệnh Chư Hầu: a violet-black streak to the prey, then both stand wrapped in purple-black demon wings for the hold,
  // a violet tether between them pulsing with each cut.
  ccHold: {
    pal: [VIO, VIOW], hitR: 1.6,
    skill(kit, e, u) { kit.flash(u.x, 1.8, u.z, VIO, 40, 0.25); return true; },
    leap(kit, e, u) {
      const b = kit.beam(e.x0, e.z0, e.x, e.z, 1.4, VIO, 0.45, 2, 1.2); b.fade = true;
      const dx = e.x - e.x0, dz = e.z - e.z0, L = Math.hypot(dx, dz) || 1;
      for (let i = 0; i < kit.N(16); i++) { const t = Math.random(); kit.ovr.emit(e.x0 + dx * t, R(0.6, 2), e.z0 + dz * t, dx / L * 3, R(0.2, 1), dz / L * 3, SMOKEV, R(0.5, 0.9), R(0.9, 1.5), 1.8, 1.5, 0, 0.8, kit.K.SMOKE); }
      sigil(kit, e.x, e.z, 3.6, VIO, { c2: SMOKEV, n: 7, m: 3, ticks: 14, inner: 0.45, fill: 0.25, w: 0.08, life: 1.2, rev: 0.12, spin: -3 });
      shell(kit, e.x, 0, e.z, 2.8, SMOKEV, { c2: VIO, dome: true, p: 1.6, core: 0.12, life: 0.9, grow: 0.12, alpha: 0.85 });
      kit.puffs(e.x, 1, e.z, kit.N(14), SMOKEV, 2.6, 2.5, 1.2, 1.7, 2.2, 0.6, 0.8, kit.K.SMOKE, 2);
      return true;
    },
    ev(kit, e, u) {
      if (e.k !== 'hold' || !u) return;
      const o = kit.match.units[e.o], dur = e.dur || 3;
      if (!o) return;
      const tie = kit.beam(u.x, u.z, o.x, o.z, 0.7, VIO, 99, 2, 1.2);
      const g1 = sigil(kit, u.x, u.z, 2, VIO, { c2: SMOKEV, n: 7, m: 3, ticks: 0, inner: 0.4, fill: 0.25, w: 0.07, life: dur, rev: 0.1, spin: -3, follow: u });
      const g2 = sigil(kit, o.x, o.z, 2, VIO, { c2: SMOKEV, n: 7, m: 3, ticks: 0, inner: 0.4, fill: 0.25, w: 0.07, life: dur, rev: 0.1, spin: 3, follow: o });
      kit.follow(u, dur, (t, dt) => {
        kit.aimBeam(tie, u.x, u.z, o.x, o.z, 1.2); tie.u.uA.value = 0.55 + 0.35 * Math.sin(t * 25);
        wings(kit, u, dt, 1.2); if (o.alive) wings(kit, o, dt, 1.2);
      }, () => kit.endBeam(tie));
      return g1 && g2;
    },
  },
};
