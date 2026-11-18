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

};
