// How the map's hazards (rooms.js plan.hazards, ruled by maprules.js) look on their pads. Each is one mesh of its own in its
// room's section, drawn over the floor without writing depth, its shader fed the hazard's state every frame:
//   poison    a blocky pool of toxic sludge (cells of the floor grid, ragged edge), bubbling
//   wind      streaks of air low over the pad; faint at rest, drawing together in the warning, racing across in the gust
//   current   a band of shallow water across the pad, flow lines running downstream
//   collapse  cracks in the floor; they glow and the ground shakes in the warning, then the spot is a dark hole
// Nothing here is a flat disc: pools and holes follow the 0.5 m cells, wind and water are lines.
import { hazardState } from '../../sim/maprules.js?v=20261124b';
const THREE = window.THREE;
const CELL = 0.5;

const FLOOR_V = `attribute float aR; attribute float aP; varying float vR; varying float vP; varying vec2 vW;
void main() { vR = aR; vP = aP; vec4 w = modelMatrix * vec4(position, 1.0); vW = position.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const POISON_F = `uniform float uTime; varying float vR; varying float vP; varying vec2 vW;
void main() {
  float b = 0.5 + 0.5 * sin(uTime * 2.6 + vP * 6.283); float edge = smoothstep(0.62, 1.0, vR);
  vec2 q = fract(vW * 2.0) - 0.5; float bub = step(0.36, max(abs(q.x), abs(q.y))) * 0.18;
  vec3 c = mix(vec3(0.18, 0.62, 0.12), vec3(0.55, 1.0, 0.22), b * (1.0 - edge)) * (1.0 - bub);
  c = mix(c, vec3(0.06, 0.16, 0.04), edge);
  gl_FragColor = vec4(c, 0.86);
  #include <colorspace_fragment>
}`;
const CRACK_F = `uniform float uTime; uniform float uS; uniform float uK; varying float vR; varying float vP; varying vec2 vW;
void main() {
  vec2 g = vW * 2.0; vec2 f = fract(g); float line = 1.0 - smoothstep(0.0, 0.11, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  float crack = line * step(0.35, fract(sin(dot(floor(g), vec2(12.9898, 78.233))) * 43758.5453));
  float rim = smoothstep(0.72, 0.95, vR);
  if (uS > 2.5) { vec3 h = mix(vec3(0.01), vec3(0.12, 0.07, 0.05), rim); gl_FragColor = vec4(h, 0.97); }
  else if (uS > 0.5) {
    // the warning: the whole spot darkens, its ragged rim and the cracks burn orange, pulsing faster as the fall nears
    float pulse = 0.6 + 0.4 * sin(uTime * (7.0 + 12.0 * uK));
    vec3 hot = vec3(1.9, 0.75, 0.15) * pulse * (0.7 + 0.5 * uK);
    float a = max(0.38, max(crack, rim) * 0.95);
    gl_FragColor = vec4(mix(vec3(0.06, 0.03, 0.02), hot, max(crack, rim)), a);
  } else gl_FragColor = vec4(vec3(0.05, 0.035, 0.025), crack * 0.5);
  #include <colorspace_fragment>
}`;
const WATER_F = `uniform float uTime; varying float vR; varying float vP; varying vec2 vW;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 c = floor(vec2(vW.x * 2.0 - uTime * 2.4, vW.y * 6.0)); float streak = step(0.8, h(c)) * step(0.3, fract(vW.x * 2.0 - uTime * 2.4));
  float ripple = 0.5 + 0.5 * sin(vW.x * 3.1 - uTime * 4.0 + vW.y * 5.0);
  float edge = smoothstep(0.6, 1.0, vR);
  vec3 c0 = mix(vec3(0.08, 0.26, 0.34), vec3(0.16, 0.42, 0.5), ripple);
  vec3 col = mix(c0, vec3(0.8, 0.95, 1.0), streak * 0.85);
  gl_FragColor = vec4(col, mix(0.6, 0.15, edge) + streak * 0.25);
  #include <colorspace_fragment>
}`;
const WIND_V = `attribute vec4 aS; uniform float uTime; uniform float uK; uniform vec2 uDir; uniform float uSpan; varying float vA; varying vec2 vUv;
void main() {
  vUv = uv; float sp = 4.0 + 10.0 * uK; float t = fract(aS.x + uTime * sp / uSpan);
  vec2 side = vec2(-uDir.y, uDir.x); vec2 c = uDir * (t - 0.5) * uSpan + side * aS.y;
  float len = 0.8 + 2.4 * uK; vec2 p = c + uDir * position.x * len + side * position.y * 0.16;
  vA = sin(t * 3.14159) * (0.12 + 0.88 * uK);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p.x, aS.z, p.y, 1.0);
}`;
const WIND_F = `varying float vA; varying vec2 vUv;
void main() { float a = vA * (1.0 - abs(vUv.y - 0.5) * 2.0) * smoothstep(0.0, 0.4, vUv.x) * (1.0 - smoothstep(0.6, 1.0, vUv.x)); gl_FragColor = vec4(vec3(0.95, 1.0, 1.05), min(1.0, a * 1.3));
  #include <colorspace_fragment>
}`;

function mat(frag, extra = {}, vert = FLOOR_V, blend = 'alpha') {
  const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { uTime: { value: 0 }, uS: { value: 0 }, uK: { value: 0 }, ...extra }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  // the streaks are laid flat from an XY quad: seen from above that is their back face
  if (blend === 'add') { m.blending = THREE.AdditiveBlending; m.side = THREE.DoubleSide; }
  return m;
}
// floor cells of a ragged blob around (cx, cz) of radius r: one quad per 0.5 m cell, aR = how far out (0 centre, 1 edge)
function blob(cx, cz, r, seed, y = 0.025) {
  const pos = []; const aR = []; const aP = []; const idx = []; const h = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return v - Math.floor(v); };
  const n = Math.ceil(r / CELL) + 1;
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const x = Math.floor(cx / CELL + i) * CELL; const z = Math.floor(cz / CELL + j) * CELL; const d = Math.hypot(x + CELL / 2 - cx, z + CELL / 2 - cz);
    const lim = r * (0.82 + 0.3 * h(Math.round(x / CELL), Math.round(z / CELL))); if (d > lim) continue;
    const b = pos.length / 3; const k = d / lim; const p = h(i + 7, j + 3);
    for (const [u, v] of [[0, 0], [CELL, 0], [CELL, CELL], [0, CELL]]) { pos.push(x + u - cx, y, z + v - cz); aR.push(k); aP.push(p); }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aR', new THREE.Float32BufferAttribute(aR, 1)); g.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 1)); g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
// a band across the pad: half width r around z, from x0 to x1, in strips so the rim of the band (aR) can fade
function band(z, r, x0, x1) {
  const pos = []; const aR = []; const aP = []; const idx = []; const nx = Math.ceil((x1 - x0) / 1); const rows = [-1, -0.5, 0, 0.5, 1];
  for (let i = 0; i <= nx; i++) for (const v of rows) { pos.push(x0 + ((x1 - x0) * i) / nx, 0.03, z + v * r); aR.push(Math.max(Math.abs(v), Math.abs((i / nx) * 2 - 1) ** 6)); aP.push(0); }
  for (let i = 0; i < nx; i++) for (let k = 0; k < rows.length - 1; k++) { const a = i * rows.length + k; const b = a + rows.length; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aR', new THREE.Float32BufferAttribute(aR, 1)); g.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 1)); g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
// n streak quads in one plain geometry: each vertex carries its streak's seed (aS: phase, offset across, height, spare)
function streaks(n, r, seed) {
  const pos = []; const uv = []; const S = []; const idx = []; let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < n; i++) {
    const a = [rnd(), (rnd() * 2 - 1) * r * 0.5, 0.3 + rnd() * 1.9, rnd()]; const b = pos.length / 3;
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) { pos.push(x, y, 0); uv.push(x + 0.5, y + 0.5); S.push(...a); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 4)); g.setIndex(idx);
  return g;
}

export function createHazards(H, curB) {
  const built = {}; let time = 0; let lastB = null; const seenFall = new Set();
  return {
    // the meshes of room i's hazards, in the room's frame
    build(i, th, plan) {
      const out = [];
      plan.hazards.forEach((h, k) => {
        if (h.room !== i) return; let m = null;
        if (h.kind === 'poison') m = new THREE.Mesh(blob(h.x, h.z, h.r, k + 1), mat(POISON_F));
        else if (h.kind === 'collapse') m = new THREE.Mesh(blob(h.x, h.z, h.r, k + 5, 0.03), mat(CRACK_F));
        else if (h.kind === 'current') { m = new THREE.Mesh(band(h.z, h.r, -10.2, 10.2), mat(WATER_F)); m.position.set(0, 0, 0); }
        else if (h.kind === 'wind') { m = new THREE.Mesh(streaks(40, 9, k * 97 + 11), mat(WIND_F, { uDir: { value: new THREE.Vector2(Math.cos(h.ang), Math.sin(h.ang)) }, uSpan: { value: h.r * 2 } }, WIND_V, 'add')); m.frustumCulled = false; }
        if (!m) return;
        if (h.kind === 'poison' || h.kind === 'collapse') m.position.set(h.x, 0, h.z);
        m.name = 'hazard'; m.userData.ownMat = true; m.userData.h = h; m.userData.k = k; m.renderOrder = 2; m.matrixAutoUpdate = true;
        out.push(m);
      });
      built[i] = out; return out;
    },
    drop(i) { delete built[i]; },
    update(dt, B, room, onFall) {
      time = (time + dt) % 4000;
      if (B !== lastB) { lastB = B; seenFall.clear(); }
      for (const i in built) for (const m of built[i]) {
        const U = m.material.uniforms; U.uTime.value = time; const h = m.userData.h;
        const st = B && B.plan && B.plan.hazards[m.userData.k] === h ? hazardState(B, h, m.userData.k) : { s: 'idle', k: 0 };
        const here = +i === room && B && B.phase === 'fight';
        if (h.kind === 'wind') U.uK.value = here ? (st.s === 'on' ? 1 : st.s === 'warn' ? 0.25 + 0.2 * st.k : 0.06) : 0.04;
        if (h.kind === 'collapse') {
          U.uS.value = st.s === 'gone' ? 3 : st.s === 'warn' && here ? 1 : 0; U.uK.value = st.k;
          m.position.y = st.s === 'warn' && here ? Math.sin(time * 70) * 0.012 : 0;
          if (st.s === 'gone' && !seenFall.has(m.userData.k)) { seenFall.add(m.userData.k); if (onFall) onFall(+i, h); }
        }
      }
    },
  };
}
