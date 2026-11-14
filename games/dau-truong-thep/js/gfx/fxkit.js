// Pooled effect primitives for fx.js and towers.js: point sprites (glow, spark, flame, smoke, fireball), velocity-stretched streaks,
// and tumbling 3D debris. Every pool is a fixed-size ring buffer; emitting never allocates.

import * as THREE from '../../vendor/three.module.min.js';

// Premultiplied "over": rgb adds light, alpha hides what is behind. One material can then glow (alpha 0) and occlude (alpha 1).
export function premul(mat) {
  mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  return mat;
}
export function additive(mat) {
  mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor;
  return mat;
}

const NOISE = `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`;

// Point kinds. Glow pool: GLOW soft light, SPARK hard dot, STAR 4-point muzzle star, FLAME noisy lick.
// Over pool: DUST soft, SMOKE shaded puff, FIREBALL hot core that cools into smoke over its life, CHIP hard flake.
export const K = { GLOW: 0, SPARK: 1, STAR: 2, FLAME: 3, DUST: 0, SMOKE: 1, FIREBALL: 2, CHIP: 3 };

export function makePoints(max, over, lowDetail) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max), info = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3), life = new Float32Array(max), span = new Float32Array(max), base = new Float32Array(max * 2), phys = new Float32Array(max * 2), alpha0 = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  const attr = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr(pos, 3)); geo.setAttribute('aColor', attr(col, 4)); geo.setAttribute('aSize', attr(size, 1)); geo.setAttribute('aInfo', attr(info, 3));
  const frag = over ? `
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
      float kind = vI.x, seed = vI.y, age = vI.z, cs = cos(seed * 6.28), sn = sin(seed * 6.28);
      vec2 q = mat2(cs, -sn, sn, cs) * p;
      ${lowDetail ? 'float n = vnoise(q * 2.4 + seed * 17.0);' : 'float n = vnoise(q * 2.2 + seed * 17.0) * 0.62 + vnoise(q * 5.0 - seed * 9.0 + age * 1.5) * 0.38;'}
      float lit = 0.72 + 0.42 * (1.0 - gl_PointCoord.y) - 0.18 * r;
      vec3 rgb; float a;
      if (kind < 0.5) { a = 1.0 - smoothstep(0.15, 1.0, r + (n - 0.5) * 0.4); rgb = vC.rgb * lit; }
      else if (kind < 1.5) { a = 1.0 - smoothstep(0.3, 1.0, r + (n - 0.5) * 0.75); a *= 0.75 + 0.25 * n; rgb = vC.rgb * lit; }
      else if (kind < 2.5) {
        float t = clamp(age * 0.95 + (n - 0.5) * 0.3 + r * 0.25, 0.0, 1.0);
        a = 1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.8);
        vec3 hot = mix(vec3(3.4, 2.7, 1.4), vec3(3.0, 1.15, 0.2), smoothstep(0.05, 0.3, t));
        hot = mix(hot, vec3(1.1, 0.22, 0.04), smoothstep(0.35, 0.6, t));
        rgb = mix(hot, vC.rgb * lit, smoothstep(0.55, 0.8, t));
        a *= 0.8 + 0.2 * n;
        gl_FragColor = vec4(rgb * a * vC.a, a * vC.a * smoothstep(0.3, 0.7, t)); return;
      }
      else { a = 1.0 - smoothstep(0.6, 0.9, r); rgb = vC.rgb * (0.55 + 0.6 * (1.0 - gl_PointCoord.y)); }
      a *= vC.a;
      gl_FragColor = vec4(rgb * a, a);
    }` : `
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
      float kind = vI.x, seed = vI.y, a;
      vec3 c = vC.rgb, hot = c + vec3(0.9);
      if (kind < 0.5) { float s = 1.0 - r; a = s * s; c = mix(c, hot, smoothstep(0.55, 1.0, s) * 0.7); }
      else if (kind < 1.5) { a = 1.0 - smoothstep(0.25, 0.85, r); c = mix(c, hot, 1.0 - smoothstep(0.0, 0.5, r)); }
      else if (kind < 2.5) {
        float ang = atan(p.y, p.x) + seed * 6.28, ray = pow(abs(cos(ang * 2.0)), 18.0) * (1.0 - r);
        float core = 1.0 - smoothstep(0.0, 0.32, r);
        a = ray * 1.4 + core + (1.0 - r) * 0.25; c = mix(c, hot * 1.3, core);
      } else {
        float n = vnoise(p * 2.5 + vec2(seed * 13.0, -vI.z * 3.0));
        a = (1.0 - smoothstep(0.2, 1.0, r + (n - 0.5) * 0.9)); c = mix(c, hot, (1.0 - r) * 0.6);
      }
      gl_FragColor = vec4(c * a * vC.a * 0.6, 0.0);
    }`;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 600 } },
    vertexShader: 'attribute vec4 aColor; attribute float aSize; attribute vec3 aInfo; uniform float uScale; varying vec4 vC; varying vec3 vI; void main() { vC = aColor; vI = aInfo; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec4 vC; varying vec3 vI;' + NOISE + frag,
  });
  if (over) premul(mat); else additive(mat);
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = over ? 6 : 8;
  let head = 0;
  // c: colour; life (s); size (m); grow: size multiplier at death; drag: 1/s; grav: m/s² down (negative rises); a: alpha; k: kind.
  function emit(x, y, z, vx, vy, vz, c, lifeS, sz, grow, drag, grav, a, k) {
    const i = head; head = (head + 1) % max;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    col[i * 4] = c.r; col[i * 4 + 1] = c.g; col[i * 4 + 2] = c.b; col[i * 4 + 3] = a; alpha0[i] = a;
    life[i] = span[i] = lifeS; base[i * 2] = sz; base[i * 2 + 1] = grow; phys[i * 2] = drag; phys[i * 2 + 1] = grav;
    info[i * 3] = k; info[i * 3 + 1] = Math.random(); info[i * 3 + 2] = 0;
    size[i] = sz;
  }
  function update(dt) {
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) { if (size[i] !== 0) size[i] = 0; continue; }
      life[i] -= dt;
      const k = Math.max(0, life[i] / span[i]), d = Math.max(0, 1 - phys[i * 2] * dt), g = phys[i * 2 + 1];
      vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - g * dt; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.05 && g > 0) { pos[i * 3 + 1] = 0.05; vel[i * 3 + 1] *= -0.35; vel[i * 3] *= 0.6; vel[i * 3 + 2] *= 0.6; }
      size[i] = base[i * 2] * (1 + (base[i * 2 + 1] - 1) * (1 - k));
      col[i * 4 + 3] = alpha0[i] * Math.min(1, k * 2.2);
      info[i * 3 + 2] = 1 - k;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.aColor.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aInfo.needsUpdate = true;
  }
  return { pts, emit, update, mat };
}

// Streaks: camera-facing quads stretched along velocity (sparks, shards, falling shells) or along a fixed vector (trails, arcs).
export function makeStreaks(max) {
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const A = new Float32Array(max * 4), B = new Float32Array(max * 4), Cc = new Float32Array(max * 4);
  const ia = (arr) => new THREE.InstancedBufferAttribute(arr, 4).setUsage(THREE.DynamicDrawUsage);
  quad.setAttribute('iA', ia(A)); quad.setAttribute('iB', ia(B)); quad.setAttribute('iC', ia(Cc));
  quad.instanceCount = max;
  const mat = additive(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 iA, iB, iC; varying vec2 vU; varying vec4 vC;
      void main() {
        vec4 h = modelViewMatrix * vec4(iA.xyz, 1.0), t = modelViewMatrix * vec4(iA.xyz - iB.xyz, 1.0);
        vec2 d = t.xy - h.xy; float L = length(d); vec2 dir = L > 1e-5 ? d / L : vec2(1.0, 0.0), n = vec2(-dir.y, dir.x);
        vec4 p = mix(h, t, position.x); p.xy += n * position.y * iA.w + dir * (position.x * 2.0 - 1.0) * iA.w;
        vU = position.xy; vC = iC; gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: `varying vec2 vU; varying vec4 vC;
      void main() { float y = abs(vU.y), a = (1.0 - y) * (1.0 - y) * (1.0 - vU.x * 0.85); float core = 1.0 - smoothstep(0.0, 0.45, y);
        gl_FragColor = vec4(mix(vC.rgb, vC.rgb + vec3(1.2), core * (1.0 - vU.x)) * a * vC.a, 0.0); }`,
  }));
  const mesh = new THREE.Mesh(quad, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 9;
  const vel = new Float32Array(max * 3), life = new Float32Array(max), span = new Float32Array(max), ph = new Float32Array(max * 4);
  let head = 0;
  // stretch > 0: tail = velocity × stretch seconds. stretch = 0: (vx, vy, vz) is a fixed tail vector and the streak does not move.
  function emit(x, y, z, vx, vy, vz, c, lifeS, width, stretch, grav, drag, a) {
    const i = head; head = (head + 1) % max;
    A[i * 4] = x; A[i * 4 + 1] = y; A[i * 4 + 2] = z; A[i * 4 + 3] = width;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    Cc[i * 4] = c.r; Cc[i * 4 + 1] = c.g; Cc[i * 4 + 2] = c.b; Cc[i * 4 + 3] = a;
    life[i] = span[i] = lifeS; ph[i * 4] = stretch; ph[i * 4 + 1] = grav; ph[i * 4 + 2] = drag; ph[i * 4 + 3] = a;
    B[i * 4] = stretch ? vx * stretch : vx; B[i * 4 + 1] = stretch ? vy * stretch : vy; B[i * 4 + 2] = stretch ? vz * stretch : vz;
  }
  function update(dt) {
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) { if (Cc[i * 4 + 3] !== 0) { Cc[i * 4 + 3] = 0; A[i * 4 + 3] = 0; } continue; }
      life[i] -= dt;
      const k = Math.max(0, life[i] / span[i]), st = ph[i * 4];
      Cc[i * 4 + 3] = ph[i * 4 + 3] * Math.min(1, k * 2);
      if (!st) continue;
      const d = Math.max(0, 1 - ph[i * 4 + 2] * dt);
      vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - ph[i * 4 + 1] * dt; vel[i * 3 + 2] *= d;
      A[i * 4] += vel[i * 3] * dt; A[i * 4 + 1] += vel[i * 3 + 1] * dt; A[i * 4 + 2] += vel[i * 3 + 2] * dt;
      if (A[i * 4 + 1] < 0.04) { A[i * 4 + 1] = 0.04; vel[i * 3 + 1] *= -0.3; vel[i * 3] *= 0.5; vel[i * 3 + 2] *= 0.5; }
      B[i * 4] = vel[i * 3] * st; B[i * 4 + 1] = vel[i * 3 + 1] * st; B[i * 4 + 2] = vel[i * 3 + 2] * st;
    }
    quad.attributes.iA.needsUpdate = true; quad.attributes.iB.needsUpdate = true; quad.attributes.iC.needsUpdate = true;
  }
  return { mesh, emit, update };
}

// Debris: lit, shadowed chunks that tumble, bounce, settle, then sink away. onSmoke(x, y, z) is called for smoking chunks.
export function makeDebris(max, material, castShadow, onSmoke) {
  const geo = new THREE.DodecahedronGeometry(0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, material, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = castShadow; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.count = max;
  const p = new Float32Array(max * 3), v = new Float32Array(max * 3), r = new Float32Array(max * 3), w = new Float32Array(max * 3), s = new Float32Array(max * 3);
  const life = new Float32Array(max), smoke = new Float32Array(max), acc = new Float32Array(max);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) { mesh.setMatrixAt(i, ZERO); mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
  let head = 0, live = 0;
  function emit(x, y, z, vx, vy, vz, color, sx, sy, sz, lifeS, smokes) {
    const i = head; head = (head + 1) % max;
    p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; v[i * 3] = vx; v[i * 3 + 1] = vy; v[i * 3 + 2] = vz;
    r[i * 3] = Math.random() * 6; r[i * 3 + 1] = Math.random() * 6; r[i * 3 + 2] = Math.random() * 6;
    w[i * 3] = (Math.random() - 0.5) * 16; w[i * 3 + 1] = (Math.random() - 0.5) * 16; w[i * 3 + 2] = (Math.random() - 0.5) * 16;
    s[i * 3] = sx; s[i * 3 + 1] = sy; s[i * 3 + 2] = sz; life[i] = lifeS; smoke[i] = smokes || 0; acc[i] = 0;
    mesh.setColorAt(i, color); mesh.instanceColor.needsUpdate = true;
    live = 1;
  }
  function update(dt) {
    if (!live) return;
    let any = 0;
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt; any = 1;
      if (life[i] <= 0) { mesh.setMatrixAt(i, ZERO); continue; }
      const half = s[i * 3 + 1] * 0.5;
      v[i * 3 + 1] -= 22 * dt;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < half) {
        p[i * 3 + 1] = half;
        if (v[i * 3 + 1] < -2) { v[i * 3 + 1] *= -0.32; v[i * 3] *= 0.55; v[i * 3 + 2] *= 0.55; for (let k = 0; k < 3; k++) w[i * 3 + k] *= 0.5; }
        else { v[i * 3 + 1] = 0; v[i * 3] *= 1 - Math.min(1, dt * 8); v[i * 3 + 2] *= 1 - Math.min(1, dt * 8); for (let k = 0; k < 3; k++) w[i * 3 + k] *= 1 - Math.min(1, dt * 10); }
      }
      for (let k = 0; k < 3; k++) r[i * 3 + k] += w[i * 3 + k] * dt;
      const sink = Math.min(1, life[i] / 0.8);
      P.set(p[i * 3], p[i * 3 + 1] - (1 - sink) * half * 2, p[i * 3 + 2]);
      S.set(s[i * 3], s[i * 3 + 1], s[i * 3 + 2]);
      M.compose(P, Q.setFromEuler(E.set(r[i * 3], r[i * 3 + 1], r[i * 3 + 2])), S);
      mesh.setMatrixAt(i, M);
      if (smoke[i] > 0) { smoke[i] -= dt; acc[i] += dt; if (acc[i] > 0.07) { acc[i] = 0; onSmoke(P.x, P.y, P.z, smoke[i]); } }
    }
    mesh.instanceMatrix.needsUpdate = true;
    live = any;
  }
  function clear() { for (let i = 0; i < max; i++) { life[i] = 0; mesh.setMatrixAt(i, ZERO); } mesh.instanceMatrix.needsUpdate = true; }
  return { mesh, emit, update, clear };
}
