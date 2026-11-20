// Fog outside the fight. The arena ellipse (ARENA) is r = 1 in "ellipse norm"; the floor is fully clear inside r = 1.05 and
// sinks into fog over a long ramp, so nothing on screen is cut. One GLSL chunk (fogK: how much, fogCol: what colour, darker
// and cooler with distance and never one flat tone) is shared by the floor shader, the props and the mist layers:
//   1. mist: two or three large drifting noise planes at different heights, only outside the fight area,
//   2. props: dim box-built silhouettes (wrecks, lamp posts, crates, pillars, dead trees) standing between r = 1.3 and 2.2,
//      merged into one mesh plus one mesh of soft blob shadows, placed deterministically from the stage number and only
//      where the fixed overview camera can see them (camera.js calls layout() once per frame size and per stage).
import { ARENA } from '../sim/battle.js?v=20261120e';
const THREE = window.THREE;
const BZ = window.BZ;

export const GLSL_NOISE = `
float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < FLOOR_OCT; i++) { s += vn(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return s / (1.0 - 2.0 * a); }
`;
// needs uFogC, uArena, uTime and the noise above
export const GLSL_FOG = `
float fogK(float r) {
  float t = clamp((r - 1.05) / 1.2, 0.0, 1.0); t = t * t * (3.0 - 2.0 * t);
  return mix(0.9 * t, 1.0, smoothstep(2.6, 4.5, r));
}
vec3 fogCol(vec2 p, float r) {
  float t = smoothstep(1.0, 2.6, r) * (1.0 - smoothstep(3.2, 4.8, r));
  vec3 c = mix(uFogC * 1.06, uFogC * vec3(0.78, 0.86, 1.0) * 0.8, t);
  float n = fbm(p * 0.07 + vec2(uTime * 0.012, 0.0)); float n2 = vn(p * 0.5 + vec2(-uTime * 0.03, uTime * 0.02)); float n3 = vn(p * 1.9 + 3.0);
  return c * (0.82 + 0.34 * n + 0.07 * (n2 - 0.5) + 0.03 * (n3 - 0.5));
}
`;

const LAYERS = [
  { y: 0.7, scale: 0.075, drift: [0.22, 0.05], alpha: 0.3, seed: 1.7 },
  { y: 1.9, scale: 0.05, drift: [-0.16, 0.1], alpha: 0.28, seed: 8.3 },
  { y: 3.4, scale: 0.034, drift: [0.1, -0.07], alpha: 0.24, seed: 14.9 },
];
const MIST_HALF = 34; const MIST_CZ = -4;

// ---- props: boxes merged into one geometry ----
function mesher() {
  const pos = []; const nor = []; const col = []; const idx = [];
  const box = new THREE.BoxGeometry(1, 1, 1); const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  const m = new THREE.Matrix4(); const nm = new THREE.Matrix3(); const v = new THREE.Vector3(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const s = new THREE.Vector3(); const t = new THREE.Vector3();
  const M = {
    ox: 0, oz: 0, rot: 0, tone: [1, 1, 1], r: 1,
    // a part in the prop's local frame: centre, size, colour, tilt about x and z
    p(lx, ly, lz, sx, sy, sz, c, tx = 0, tz = 0, geo = box) {
      const cs = Math.cos(M.rot); const sn = Math.sin(M.rot);
      t.set(M.ox + (lx * cs + lz * sn) * M.r, ly * M.r, M.oz + (-lx * sn + lz * cs) * M.r);
      e.set(tx, M.rot, tz, 'YXZ'); q.setFromEuler(e); s.set(sx * M.r, sy * M.r, sz * M.r); m.compose(t, q, s); nm.getNormalMatrix(m);
      const g = geo; const base = pos.length / 3; const P = g.attributes.position; const N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        const sh = 0.82 + 0.22 * Math.max(0, v.y); col.push(c[0] * M.tone[0] * sh, c[1] * M.tone[1] * sh, c[2] * M.tone[2] * sh);
      }
      for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.array[i]);
    },
    cyl(lx, ly, lz, sx, sy, sz, c) { M.p(lx, ly, lz, sx, sy, sz, c, 0, 0, cyl); },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeBoundingSphere(); return g;
    },
    count: () => pos.length / 3,
  };
  return M;
}

const DARK = [0.2, 0.21, 0.24]; const MID = [0.34, 0.35, 0.38]; const RUST = [0.4, 0.27, 0.2]; const LIGHT = [0.5, 0.5, 0.52]; const WOOD = [0.3, 0.22, 0.16];
// footprint radius (m) and the builder of each prop, in a local frame with the base on y = 0
const PROPS = {
  car: { rad: 2.4, build(M, c) { M.p(0, 0.65, 0, 4.2, 0.8, 1.8, c); M.p(-0.2, 1.3, 0, 2.3, 0.7, 1.6, MID); for (const sx of [-1.35, 1.35]) for (const sz of [-0.9, 0.9]) M.p(sx, 0.32, sz, 0.8, 0.64, 0.25, DARK); } },
  wreck: { rad: 2.4, build(M, c) { M.p(0, 0.5, 0, 4.3, 0.75, 1.9, RUST, 0, 0.12); M.p(0.3, 1.1, 0, 2.2, 0.55, 1.6, DARK, 0, 0.12); M.p(-1.5, 0.15, 0.9, 0.9, 0.3, 0.4, DARK); } },
  lamp: { rad: 0.9, build(M, c) { M.p(0, 2.7, 0, 0.18, 5.4, 0.18, DARK); M.p(0.6, 5.35, 0, 1.4, 0.14, 0.14, DARK); M.p(1.25, 5.2, 0, 0.55, 0.2, 0.34, LIGHT); M.p(0, 0.2, 0, 0.55, 0.4, 0.55, MID); } },
  crate: { rad: 1.8, build(M, c) { M.p(0, 0.65, 0, 1.3, 1.3, 1.3, c); M.p(1.35, 0.5, 0.35, 1.0, 1.0, 1.0, WOOD); M.p(0.2, 1.65, 0.1, 0.95, 0.8, 0.95, c, 0, 0.1); } },
  pillar: { rad: 1.2, build(M, c) { M.p(0, 2.5, 0, 1.15, 5, 1.15, MID); M.p(0, 5.15, 0, 1.6, 0.3, 1.6, LIGHT); M.p(0, 0.2, 0, 1.6, 0.4, 1.6, LIGHT); } },
  stump: { rad: 1.4, build(M, c) { M.p(0, 1.5, 0, 1.15, 3, 1.15, MID); M.p(0.6, 0.5, 0.5, 1.4, 1, 0.9, LIGHT, 0, 0.3); M.p(-0.5, 0.3, -0.4, 0.8, 0.6, 0.8, DARK); } },
  tank: { rad: 2.0, build(M, c) { M.cyl(0, 1.7, 0, 3.2, 3.4, 3.2, MID); M.cyl(0, 3.5, 0, 2.2, 0.4, 2.2, LIGHT); M.p(1.9, 0.9, 0, 0.35, 1.8, 0.35, DARK); M.p(1.2, 1.7, 0, 1.6, 0.25, 0.25, DARK); } },
  tomb: { rad: 1.0, build(M, c) { M.p(0, 0.9, 0, 0.95, 1.8, 0.28, LIGHT, 0, 0.06); M.p(0, 0.15, 0, 1.4, 0.3, 0.7, MID); } },
  tree: { rad: 1.8, build(M, c) { M.p(0, 1.8, 0, 0.42, 3.6, 0.42, WOOD, 0, 0.05); M.p(0.65, 3.5, 0, 0.14, 2.1, 0.14, WOOD, 0, -0.95); M.p(-0.6, 3.3, 0.3, 0.13, 1.9, 0.13, WOOD, 0.4, 0.9); M.p(0.1, 4.2, -0.5, 0.12, 1.7, 0.12, WOOD, 0.8, 0.1); M.p(-0.2, 4.4, 0.55, 0.1, 1.2, 0.1, WOOD, -0.7, -0.2); } },
  pipes: { rad: 2.2, build(M, c) { M.p(0, 2.9, 0, 4.6, 0.5, 0.5, DARK); M.p(0, 2.2, 0.9, 4.6, 0.4, 0.4, MID); for (const x of [-2, 0, 2]) M.p(x, 1.4, 0.4, 0.4, 2.8, 0.4, DARK); M.p(0, 0.35, 0.4, 5, 0.7, 1.4, MID); } },
  crystal: { rad: 1.5, build(M, c) { M.p(0, 2.4, 0, 0.9, 4.8, 0.9, [0.4, 0.3, 0.6], 0.06, 0.1); M.p(0.9, 1.4, 0.3, 0.6, 2.8, 0.6, [0.34, 0.26, 0.54], 0.1, -0.3); M.p(-0.8, 1.1, -0.3, 0.55, 2.2, 0.55, [0.3, 0.24, 0.5], -0.2, 0.35); } },
  obelisk: { rad: 1.2, build(M, c) { M.p(0, 3.3, 0, 0.9, 6.6, 0.9, MID); M.p(0, 6.8, 0, 0.55, 0.5, 0.55, LIGHT); M.p(0, 0.3, 0, 1.6, 0.6, 1.6, LIGHT); } },
};
// per chapter (stages.js CHAPTERS order): the props that belong there and a tone (a multiplier on the base grey)
const KITS = [
  { n: 16, tone: [1, 1.02, 1.06], list: ['car', 'car', 'wreck', 'lamp', 'lamp', 'crate', 'pillar'] },
  { n: 16, tone: [1.08, 1.02, 0.94], list: ['car', 'car', 'car', 'wreck', 'pillar', 'pillar', 'lamp', 'crate'] },
  { n: 15, tone: [0.92, 1.02, 1.14], list: ['tank', 'tank', 'crate', 'crate', 'pipes', 'pipes', 'pillar', 'lamp'] },
  { n: 15, tone: [1.22, 1.06, 0.82], list: ['pillar', 'obelisk', 'tomb', 'tomb', 'tree', 'tree', 'stump'] },
  { n: 15, tone: [0.95, 1.05, 0.9], list: ['crate', 'wreck', 'tree', 'tree', 'stump', 'pillar', 'lamp'] },
  { n: 14, tone: [1.0, 0.9, 1.25], list: ['crystal', 'crystal', 'crystal', 'obelisk', 'pillar', 'stump'] },
];

function blobTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.5, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t;
}

export function createFog(H, U) {
  const { scene, quality } = H; const low = quality.name === 'low';
  const group = new THREE.Group(); group.name = 'fog'; scene.add(group);
  const oct = low ? 2 : 3;
  const shared = { uFogC: U.uFogC, uArena: U.uArena, uTime: U.uTime };

  // ---- mist ----
  const layers = (low ? [LAYERS[1]] : LAYERS).map((L) => {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, defines: { FLOOR_OCT: oct },
      uniforms: { ...shared, uScale: { value: L.scale }, uDrift: { value: new THREE.Vector2(L.drift[0], L.drift[1]) }, uAlpha: { value: L.alpha }, uSeed: { value: L.seed }, uHalf: { value: MIST_HALF }, uCz: { value: MIST_CZ } },
      vertexShader: 'varying vec3 vWP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vWP; uniform vec3 uFogC; uniform vec2 uArena; uniform float uTime; uniform float uScale; uniform vec2 uDrift; uniform float uAlpha; uniform float uSeed; uniform float uHalf; uniform float uCz;
${GLSL_NOISE}${GLSL_FOG}
void main() {
  float r = length(vWP.xz / uArena);
  float dens = smoothstep(1.1, 1.95, r);
  vec2 p = vWP.xz * uScale + uDrift * uTime * 0.1 + uSeed;
  float n = fbm(p); n = smoothstep(0.3, 0.78, n);
  vec2 e = abs(vec2(vWP.x, vWP.z - uCz)) / uHalf; float edge = 1.0 - smoothstep(0.75, 1.0, max(e.x, e.y));
  float a = uAlpha * dens * (0.35 + 0.65 * n) * (0.55 + 0.45 * smoothstep(1.3, 2.8, r)) * edge;
  if (a < 0.004) discard;
  gl_FragColor = vec4(fogCol(vWP.xz, r) * 1.04, a);
  #include <colorspace_fragment>
}`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(MIST_HALF * 2, MIST_HALF * 2), mat);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, L.y, MIST_CZ); mesh.renderOrder = 3; mesh.frustumCulled = false; group.add(mesh);
    return mesh;
  });

  // ---- props and their blob shadows ----
  const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  propMat.defines = { FLOOR_OCT: oct };
  propMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWP; uniform vec3 uFogC; uniform vec2 uArena; uniform float uTime;\n${GLSL_NOISE}${GLSL_FOG}`)
      .replace('#include <opaque_fragment>', `{ float r = length(vWP.xz / uArena); float fo = clamp(fogK(r) * 1.2 + 0.08, 0.0, 0.84);
  outgoingLight = mix(outgoingLight, vec3(dot(outgoingLight, vec3(0.3, 0.55, 0.15))), 0.45 * fo);
  outgoingLight = mix(outgoingLight, fogCol(vWP.xz, r), fo); }\n#include <opaque_fragment>`);
  };
  propMat.customProgramCacheKey = () => 'aisprop' + (low ? 'L' : 'H');
  const shadowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, defines: { FLOOR_OCT: oct },
    uniforms: { ...shared, uMap: { value: blobTexture() } },
    vertexShader: 'varying vec3 vWP; varying vec2 vUv; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vWP; varying vec2 vUv; uniform vec3 uFogC; uniform vec2 uArena; uniform float uTime; uniform sampler2D uMap;
${GLSL_NOISE}${GLSL_FOG}
void main() { float r = length(vWP.xz / uArena); float fo = clamp(fogK(r) * 1.2 + 0.08, 0.0, 0.84); gl_FragColor = vec4(0.0, 0.0, 0.0, texture2D(uMap, vUv).a * 0.42 * (1.0 - fo)); }`,
  });
  let props = null; let shadows = null; let def = null; let dirty = true; let placed = [];
  const norm = (x, z) => Math.hypot(x / ARENA.x, z / ARENA.z);

  function shadowGeometry(list) {
    const pos = []; const uv = []; const idx = [];
    for (const p of list) {
      const s = p.rad * 1.5; const b = pos.length / 3;
      pos.push(p.x - s, 0.03, p.z - s, p.x + s, 0.03, p.z - s, p.x + s, 0.03, p.z + s, p.x - s, 0.03, p.z + s); uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere(); return g;
  }

  // vis(x, y, z) -> true when that world point is inside the part of the frame worth decorating
  function layout(vis) {
    dirty = false;
    if (props) { group.remove(props); props.geometry.dispose(); props = null; }
    if (shadows) { group.remove(shadows); shadows.geometry.dispose(); shadows = null; }
    const stage = def ? (def.n | 0) : 0; const ch = Math.max(0, Math.min(KITS.length - 1, def ? def.chapter | 0 : 0)); const K = KITS[ch];
    const rng = BZ.rng('fogprops' + ch + ':' + stage); const M = mesher(); M.tone = K.tone;
    const want = low ? Math.round(K.n * 0.7) : K.n; placed = [];
    const ok = (name, x, z, rad) => {
      // the overview looks across the near side at 42 to 50 degrees: nothing stands between the camera and the fight
      if (z + rad > ARENA.z * 0.5) return false;
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (norm(x + Math.cos(a) * rad, z + Math.sin(a) * rad) < 1.17) return false; }
      for (const p of placed) if (Math.hypot(p.x - x, p.z - z) < (p.rad + rad) * 0.7) return false;
      return vis(x, 0.1, z) || vis(x, 2.5, z) || vis(x, 5, z);
    };
    for (let tries = 0; tries < 4000 && placed.length < want; tries++) {
      const name = K.list[(rng.next() * K.list.length) | 0]; const def0 = PROPS[name];
      const r = Math.sqrt(rng.range(1.25 * 1.25, 2.4 * 2.4)); const a = rng.range(0, Math.PI * 2);
      const x = Math.cos(a) * r * ARENA.x; const z = Math.sin(a) * r * ARENA.z; const sc = rng.range(1.0, 1.5);
      const rot = rng.range(0, Math.PI * 2);
      if (!ok(name, x, z, def0.rad * sc)) continue;
      placed.push({ name, x, z, rad: def0.rad * sc, sc, rot });
    }
    for (const p of placed) { M.ox = p.x; M.oz = p.z; M.rot = p.rot; M.r = p.sc; PROPS[p.name].build(M, [0.8, 0.8, 0.8]); }
    if (M.count()) {
      props = new THREE.Mesh(M.geometry(), propMat); props.frustumCulled = false; props.renderOrder = 1; group.add(props);
      shadows = new THREE.Mesh(shadowGeometry(placed), shadowMat); shadows.frustumCulled = false; shadows.renderOrder = 2; group.add(shadows);
    }
  }

  return {
    group, get dirty() { return dirty; }, get placed() { return placed; }, layers, layout,
    invalidate() { dirty = true; },
    setStage(d) { if (!def || def.n !== d.n || def.chapter !== d.chapter) dirty = true; def = d; },
    get calls() { return layers.length + (props ? 2 : 0); },
  };
}
