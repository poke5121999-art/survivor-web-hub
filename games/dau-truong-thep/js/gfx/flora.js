// Plants as geometry: every leaf is a bent strip with a colour gradient, merged per plant, drawn with instancing and swayed in the vertex shader.

import * as THREE from '../../vendor/three.module.min.js';
import { Builder } from './builder.js';

// One leaf growing from the origin toward +x. x = out*t, y = rise*t - droop*t^2. c0 at the stem, c1 at the tip.
export function leafStrip({ out, rise, droop, width, segs = 4, fold = 0.18, c0, c1 }) {
  const pos = [], col = [], idx = [];
  const a = new THREE.Color(...c0), b = new THREE.Color(...c1), c = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, x = out * t, y = rise * t - droop * t * t;
    const w = width * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.08)), 0.7);
    pos.push(x, y + w * fold, -w, x, y - w * fold * 0.5, 0, x, y + w * fold, w);
    c.copy(a).lerp(b, t);
    col.push(c.r, c.g, c.b, c.r * 0.72, c.g * 0.78, c.b * 0.72, c.r, c.g, c.b);
    if (i < segs) { const k = i * 3; idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ring(b, rng, n, make, yaw0 = 0) {
  for (let i = 0; i < n; i++) {
    const leaf = make(i);
    b.push().rotY(yaw0 + (i / n) * 6.283 + rng.range(-0.25, 0.25)).geo(leaf).pop();
    leaf.dispose();
  }
}

const G1 = [0.05, 0.2, 0.03], G2 = [0.36, 0.62, 0.12];

export function plantGeos(rng) {
  const out = {};
  let b = new Builder();
  ring(b, rng, 5, () => leafStrip({ out: rng.range(0.1, 0.3), rise: rng.range(0.36, 0.7), droop: 0.12, width: rng.range(0.07, 0.1), segs: 2, c0: G1, c1: G2 }));
  out.grass = b.build().main;

  b = new Builder();
  ring(b, rng, 9, () => leafStrip({ out: rng.range(0.85, 1.25), rise: rng.range(0.6, 0.85), droop: rng.range(0.5, 0.7), width: 0.3, segs: 4, c0: [0.03, 0.16, 0.04], c1: [0.2, 0.5, 0.1] }));
  ring(b, rng, 4, () => leafStrip({ out: 0.35, rise: 0.8, droop: 0.15, width: 0.2, segs: 3, c0: [0.04, 0.2, 0.04], c1: [0.3, 0.6, 0.14] }), 0.5);
  out.fern = b.build().main;

  b = new Builder();
  ring(b, rng, 6, () => leafStrip({ out: rng.range(1.3, 1.75), rise: rng.range(1.2, 1.5), droop: rng.range(0.9, 1.2), width: rng.range(0.65, 0.9), segs: 5, fold: 0.25, c0: [0.02, 0.14, 0.05], c1: [0.16, 0.5, 0.12] }));
  ring(b, rng, 3, () => leafStrip({ out: 0.5, rise: 1.7, droop: 0.3, width: 0.5, segs: 4, fold: 0.3, c0: [0.04, 0.2, 0.05], c1: [0.3, 0.62, 0.15] }), 1);
  out.broad = b.build().main;

  // Gameplay bush: a dome of lighter leaves with a few blossoms, so the hiding spots read apart from decoration.
  b = new Builder();
  for (let i = 0; i < 36; i++) {
    const yaw = rng() * 6.283, lift = rng.range(0.05, 1.25);
    const leaf = leafStrip({ out: rng.range(0.6, 0.85), rise: 0.2, droop: rng.range(0.15, 0.35), width: rng.range(0.38, 0.5), segs: 2, c0: [0.09, 0.3, 0.04], c1: [0.5, 0.74, 0.16] });
    b.push().rotY(yaw).rotZ(lift).move(0.3, 0, 0).geo(leaf).pop();
    leaf.dispose();
  }
  for (let i = 0; i < 7; i++) {
    const yaw = rng() * 6.283, lift = rng.range(0.5, 1.3);
    b.push().rotY(yaw).rotZ(lift).move(0.95, 0, 0).tint(i % 2 ? 0xffc9e0 : 0xfff0a0).ball(0.085, 0).pop();
  }
  out.bush = b.tint(0xffffff).build().main;

  b = new Builder();
  ring(b, rng, 9, () => leafStrip({ out: rng.range(2.0, 2.5), rise: rng.range(0.8, 1.1), droop: rng.range(1.4, 1.8), width: rng.range(0.7, 0.9), segs: 6, fold: 0.22, c0: [0.03, 0.17, 0.05], c1: [0.2, 0.52, 0.12] }));
  ring(b, rng, 4, () => leafStrip({ out: 0.8, rise: 1.6, droop: 0.5, width: 0.55, segs: 4, c0: [0.05, 0.22, 0.05], c1: [0.32, 0.62, 0.15] }), 0.6);
  out.crown = b.build().main;

  b = new Builder();
  for (let f = 0; f < 10; f++) {
    const yaw = (f / 10) * 6.283 + rng.range(-0.2, 0.2), o = rng.range(3.0, 3.8), rise = rng.range(0.9, 1.6), droop = rng.range(2.0, 2.8);
    b.push().rotY(yaw);
    const rib = leafStrip({ out: o, rise, droop, width: 0.1, segs: 5, c0: [0.1, 0.2, 0.04], c1: [0.2, 0.4, 0.08] });
    b.geo(rib); rib.dispose();
    for (let k = 1; k <= 8; k++) {
      const t = k / 9, x = o * t, y = rise * t - droop * t * t, slope = Math.atan2(rise - 2 * droop * t, o);
      for (const s of [-1, 1]) {
        const lf = leafStrip({ out: 0.95 * (1 - t * 0.45), rise: 0, droop: 0.3, width: 0.24, segs: 1, fold: 0, c0: [0.04, 0.2, 0.05], c1: [0.24, 0.55, 0.12] });
        b.push().move(x, y, 0).rotZ(slope).rotY(s * 1.15).geo(lf).pop();
        lf.dispose();
      }
    }
    b.pop();
  }
  out.palm = b.build().main;

  b = new Builder();
  for (let i = 0; i < 5; i++) {
    const g = 0.75 + i * 0.07;
    b.tint(new THREE.Color(0.1 * g, 0.3 * g, 0.2 * g)).push().move(0, 0.9 + i * 0.95, 0).rotY(i * 0.7).cyl(0.05, 1.9 - i * 0.36, 1.5, 7).pop();
    b.tint(new THREE.Color(0.8, 0.88, 0.95)).push().move(0, 1.35 + i * 0.95, 0).rotY(i * 0.7).cyl(0.02, 1.0 - i * 0.19, 0.62, 7).pop();
  }
  out.pine = b.tint(0xffffff).build().main;

  b = new Builder();
  b.tint(new THREE.Color(0.07, 0.055, 0.05));
  b.push().move(0, 2.0, 0).cyl(0.1, 0.3, 4.0, 6).pop();
  for (let i = 0; i < 5; i++) b.push().move(0, 1.6 + i * 0.5, 0).rotY(i * 2.3).rotZ(0.9).move(0, 0.6, 0).cyl(0.03, 0.09, 1.2 + (i % 2) * 0.5, 5).pop();
  out.dead = b.tint(0xffffff).build().main;
  return out;
}

// Standard material for foliage with wind sway. Geometry must have its base at y = 0: sway grows with height.
export function leafMaterial(wind, amp, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.62, metalness: 0, envMapIntensity: 0.45, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind.uTime;
    sh.uniforms.uAmp = { value: amp };
    sh.vertexShader = 'uniform float uTime; uniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 wOrigin = instanceMatrix[3].xyz;
      #else
        vec3 wOrigin = modelMatrix[3].xyz;
      #endif
      float wPhase = wOrigin.x * 0.31 + wOrigin.z * 0.23;
      float wBend = uAmp * position.y * (0.6 + 0.4 * sin(uTime * 0.7 + wPhase * 0.4));
      transformed.x += sin(uTime * 1.6 + wPhase + position.y * 0.8) * wBend;
      transformed.z += cos(uTime * 1.25 + wPhase * 1.3 + position.x) * wBend * 0.7;`);
  };
  m.customProgramCacheKey = () => 'leaf-wind';
  return m;
}

export function instanced(geo, mat, items, opts = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
  items.forEach((it, i) => {
    E.set(it.tx || 0, it.yaw || 0, it.tz || 0, 'YXZ'); Q.setFromEuler(E);
    S.set(it.s || 1, (it.s || 1) * (it.sy || 1), it.s || 1); P.set(it.x, it.y || 0, it.z);
    mesh.setMatrixAt(i, M.compose(P, Q, S));
    if (it.c) mesh.setColorAt(i, C.setRGB(it.c[0], it.c[1], it.c[2]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = !!opts.cast; mesh.receiveShadow = opts.receive !== false;
  mesh.frustumCulled = false;
  return mesh;
}
