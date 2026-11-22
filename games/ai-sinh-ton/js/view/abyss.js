// What lies around the pads: water (one plane with an animated shader: two scrolling noise layers, twinkling sparkle
// dashes, darker with distance from the island, a bright band along the shore, the warm lights' stretched reflections,
// hazier toward the far edge) or a fog abyss (a dark deep plane plus drifting mist sheets at different depths, colour
// shifting with depth). The shore distance comes from a small texture baked from the pads' cells.
// Beyond the pads, out to the frame's edges (the fight camera sits 38 m away and sees ~40 m across), lie far islands: lower
// voxel crags tapering down into the mist (rocky islets in the water), some with a glowing crystal or ember on top, all in
// one merged mesh, hazier the farther they are. They are anchored to the map, not to the pad: a run slides them with the
// scene, and the next pad's rebuild puts the same islands back where they were.
const THREE = window.THREE;

export const GLSL_NOISE = `
float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < OCT; i++) { s += vn(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return s / (1.0 - 2.0 * a); }
`;
const NL = 12;
const VERT = `varying vec3 vWP; #include <fog_pars_vertex>
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`.replace('#include <fog_pars_vertex>', '\n#include <fog_pars_vertex>\n');

const WATER_FRAG = `varying vec3 vWP; uniform vec2 uOrg; uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uHaze; uniform vec3 uSpark;
uniform sampler2D uDist; uniform vec4 uBox; uniform vec4 uL[${NL}]; uniform vec3 uLC[${NL}]; uniform float uIce; uniform float uFarZ; uniform float uNearZ;
#include <fog_pars_fragment>
${GLSL_NOISE}
void main() {
  vec2 p = (vWP.xz + uOrg);
  float d = texture2D(uDist, (p - uBox.xy) / uBox.zw).r * 10.0;
  float n1 = vn(p * 0.32 + vec2(uTime * 0.05, uTime * 0.03)); float n2 = vn(p * vec2(0.9, 1.6) - vec2(uTime * 0.08, -uTime * 0.05));
  float deep = smoothstep(0.2, 8.0, d);
  vec3 c = mix(uShallow, uDeep, deep);
  c *= 0.84 + 0.34 * (n1 * 0.6 + n2 * 0.4);
  float plate = uIce * smoothstep(0.55, 0.6, vn(p * 0.45 + 3.0)) * (1.0 - deep * 0.6); c = mix(c, uFoam * 0.75, plate * 0.45);
  float far = smoothstep(uNearZ, uFarZ, p.y);
  float foam = 1.0 - smoothstep(0.0, 0.5 + 0.7 * n2, d); c = mix(c, uFoam, foam * 0.5);
  // sparkle dashes that twinkle, thicker near the shore and the viewer
  vec2 g = p * vec2(1.8, 3.6) + vec2(uTime * 0.12, 0.0); vec2 gi = floor(g); float h = fh(gi); vec2 f = fract(g) - 0.5;
  float tw = max(0.0, sin(uTime * (1.6 + h * 3.0) + h * 40.0));
  float dash = (1.0 - smoothstep(0.18, 0.3, abs(f.x))) * (1.0 - smoothstep(0.05, 0.11, abs(f.y)));
  c += uSpark * step(0.83, h) * tw * dash * (0.45 + 0.35 * (1.0 - deep)) * (1.0 - far * 0.6);
  // warm lights: a soft pool and a reflection stretched toward the viewer, broken by the ripples
  for (int i = 0; i < ${NL}; i++) {
    vec4 L = uL[i]; if (L.z <= 0.0) continue;
    vec2 q = p - L.xy; float pool = exp(-dot(q, q) / (L.w * L.w));
    float streak = exp(-q.x * q.x / 0.5) * smoothstep(-1.5, 0.5, q.y) * exp(-max(q.y, 0.0) / 3.2) * (0.35 + 1.1 * n2 * n2);
    c += uLC[i] * L.z * (pool * 0.35 + streak * 0.55);
  }
  c = mix(c, uHaze, far * 0.6);
  // slow swell light and dark across the far water, so it keeps a texture where the sparkles thin out
  c *= 0.84 + 0.24 * n1 + 0.12 * n2;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const DEEP_FRAG = `varying vec3 vWP; uniform vec2 uOrg; uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uHaze; uniform sampler2D uDist; uniform vec4 uBox; uniform float uFarZ; uniform float uNearZ;
uniform vec4 uL[${NL}]; uniform vec3 uLC[${NL}];
#include <fog_pars_fragment>
${GLSL_NOISE}
void main() {
  vec2 p = (vWP.xz + uOrg); float d = texture2D(uDist, (p - uBox.xy) / uBox.zw).r * 10.0;
  float n = fbm(p * 0.08 + vec2(uTime * 0.01, 0.0));
  float far = smoothstep(uNearZ, uFarZ, p.y);
  vec3 c = mix(uDeep, uShallow, 0.25 + 0.5 * n) * (0.7 + 0.3 * (1.0 - smoothstep(0.0, 9.0, d)));
  // rolling cloud in the pit, 1-3 m blobs drifting slowly, so the far abyss is never one flat tone
  float cl = vn(p * 0.32 + vec2(uTime * 0.04, uTime * 0.025)) * 0.6 + vn(p * 0.9 - vec2(uTime * 0.03, 0.0)) * 0.4;
  for (int i = 0; i < ${NL}; i++) { vec4 L = uL[i]; if (L.z <= 0.0) continue; vec2 q = p - L.xy; c += uLC[i] * L.z * 0.18 * exp(-dot(q, q) / (L.w * L.w * 3.0)); }
  c = mix(c, uHaze, far * 0.7);
  c *= 0.62 + 0.5 * cl + 0.26 * vn(p * 1.7 + vec2(0.0, uTime * 0.05));
  // a finer grain (0.4 m) on top: in a dark theme the far pit under the camera's top edge spans a few metres per 24 px and
  // the blobs above left it one flat tone there (floor-shots chapter 4: 3.96% flat cells at the merged start room view, 1.88% with this)
  c *= 0.74 + 0.52 * vn(p * 2.6 + vec2(uTime * 0.06, 0.0));
  // lit wisps in the theme's mist colour, so even the near, nearly black pit under the cliffs has a grain
  c += uShallow * 0.22 * vn(p * 1.1 - vec2(uTime * 0.04, 0.0));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const MIST_FRAG = `varying vec3 vWP; uniform vec2 uOrg; uniform float uTime; uniform vec3 uCol; uniform vec3 uHaze; uniform float uA; uniform float uScale; uniform vec2 uDrift; uniform float uFarZ; uniform float uNearZ;
${GLSL_NOISE}
void main() {
  vec2 p = (vWP.xz + uOrg) * uScale + uDrift * uTime;
  float n = smoothstep(0.32, 0.78, fbm(p)); float far = smoothstep(uNearZ, uFarZ, vWP.z);
  float a = uA * (0.25 + 0.75 * n);
  gl_FragColor = vec4(mix(uCol, uHaze, far * 0.6), a);
  #include <colorspace_fragment>
}`;

const lin = (hex) => new THREE.Color(hex);

// far islands: vertex colour per face (top lit, sides by facing), a 0.5 m block grain, sinking into the deep colour below the
// mist line (or a foam band at the water line), haze with distance; `aGlow` marks the crystal/ember blocks that shine
const FAR_V = `attribute float aGlow; varying vec3 vC; varying float vG; varying vec3 vP; varying vec3 vWP;
void main() { vC = color; vG = aGlow; vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FAR_F = `varying vec3 vC; varying float vG; varying vec3 vP; varying vec3 vWP; uniform vec3 uHaze; uniform vec3 uDeep; uniform vec3 uGlow; uniform vec3 uFoam;
uniform float uPlane; uniform float uWater; uniform float uTime;
${GLSL_NOISE}
void main() {
  vec3 q = floor(vP * 2.0 + 0.001); float g = fh(q.xz + q.y * 7.13);
  vec3 c = vC * (0.78 + 0.44 * g);
  float far = smoothstep(16.0, 60.0, length(vWP.xz));
  if (uWater > 0.5) { float wl = 1.0 - smoothstep(0.0, 0.2, abs(vP.y - uPlane - 0.06)); c = mix(c, uFoam, wl * 0.55); }
  else c = mix(c, uDeep, smoothstep(uPlane + 5.5, uPlane - 0.5, vP.y) * 0.8);
  c = mix(c, uHaze, 0.08 + 0.42 * far);
  c += uGlow * vG * (0.8 + 0.2 * sin(uTime * 1.7 + vP.x * 0.7 + vP.z));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
// a small seeded generator per map cell, so one cell always grows the same island
function cellRng(i, j, s) {
  let h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(s, 83492791)) >>> 0;
  return () => { h = (h + 0x6D2B79F5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const strHash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; };
const FAR_CELL = 9; // metres of map per candidate island
const FAR_X = 54; const FAR_Z0 = -66; const FAR_Z1 = 26; // the field kept around the current pad (the frame sees ~±20 m across at the abyss and ~31 m back)
// box faces as corner bits (1: u, 2: y, 4: v) and their shade: the top is lit, the sides by facing, the bottom dark
const FACES = [[[0, 4, 6, 2], 0.5], [[1, 3, 7, 5], 0.72], [[0, 1, 5, 4], 0.3], [[2, 6, 7, 3], 1], [[0, 2, 3, 1], 0.62], [[4, 5, 7, 6], 0.44]];

export function createAbyss({ scene, quality }) {
  const low = quality.name === 'low'; const OCT = low ? 2 : 3;
  const group = new THREE.Group(); group.name = 'abyss'; scene.add(group);
  const DW = 160; const DD = 120; const DZ = -8;
  const distTex = new THREE.DataTexture(new Uint8Array(4), 1, 1); distTex.magFilter = distTex.minFilter = THREE.LinearFilter;
  const org = new THREE.Vector2();
  const common = () => ({ uTime: { value: 0 }, uOrg: { value: org }, uDist: { value: distTex }, uBox: { value: new THREE.Vector4(-40, -30, 80, 60) }, uFarZ: { value: -24 }, uNearZ: { value: 4 },
    uL: { value: Array.from({ length: NL }, () => new THREE.Vector4()) }, uLC: { value: Array.from({ length: NL }, () => new THREE.Color()) } });
  const mk = (frag, uniforms, transparent) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]), fog: !transparent, transparent, depthWrite: !transparent, defines: { OCT } });
  const water = mk(WATER_FRAG, { ...common(), uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uFoam: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uSpark: { value: new THREE.Color() }, uIce: { value: 0 } });
  const deep = mk(DEEP_FRAG, { ...common(), uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() } });
  // the pit hazes itself toward the far edge (uHaze): the scene fog on top of that washed its clouds to one tone 40 m out
  deep.fog = false;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(DW, DD), water); plane.rotation.x = -Math.PI / 2; plane.position.z = DZ; plane.frustumCulled = false; group.add(plane);
  const SHEETS = low ? [{ y: 0.42, s: 0.05, a: 0.42, d: [0.04, 0.012] }] : [{ y: 0.3, s: 0.05, a: 0.36, d: [0.04, 0.012] }, { y: 0.62, s: 0.07, a: 0.3, d: [-0.03, 0.02] }];
  const sheets = SHEETS.map((S) => {
    const m = mk(MIST_FRAG, { uTime: { value: 0 }, uOrg: { value: org }, uCol: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uA: { value: S.a }, uScale: { value: S.s }, uDrift: { value: new THREE.Vector2(...S.d) }, uFarZ: { value: -24 }, uNearZ: { value: 4 } }, true);
    const me = new THREE.Mesh(new THREE.PlaneGeometry(DW, DD), m); me.rotation.x = -Math.PI / 2; me.position.z = DZ; me.frustumCulled = false; me.renderOrder = 3; me.userData.k = S.y; group.add(me); return me;
  });
  let mode = 'water';

  // ---- far islands ----
  const farMat = new THREE.ShaderMaterial({ vertexShader: FAR_V, fragmentShader: FAR_F, vertexColors: true, side: THREE.DoubleSide, defines: { OCT: 1 },
    uniforms: { uHaze: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uFoam: { value: new THREE.Color() }, uPlane: { value: -9 }, uWater: { value: 0 }, uTime: { value: 0 } } });
  const farG = new THREE.Group(); farG.name = 'far-islands'; group.add(farG);
  const far = new THREE.Mesh(new THREE.BufferGeometry(), farMat); far.frustumCulled = false; far.visible = false; farG.add(far);
  // the islands live in the map's frame: `acc` is where the current pad sits in it (each finished run adds its length), `last` the latest shift
  const acc = { x: 0, z: 0 }; const last = { x: 0, z: 0 };
  const cT = new THREE.Color(); const cS = new THREE.Color(); const cX = new THREE.Color();
  function buildFar(theme, A, pads) {
    const water = A.type === 'water'; const F = A.far || {};
    const top = F.top !== undefined ? cT.set(F.top) : water ? cT.set(A.haze).lerp(lin(A.foam), 0.28) : cT.set(A.shallow).lerp(lin(A.foam), 0.32);
    const side = F.side !== undefined ? cS.set(F.side) : water ? cS.set(A.deep).lerp(lin(A.haze), 0.62) : cS.set(A.deep).lerp(lin(A.shallow), 0.62);
    const pos = []; const col = []; const glo = []; const idx = [];
    let cx = 0; let cz = 0; const R2 = Math.SQRT1_2;
    // a box in the island's own grid (u, v turned 45 degrees like the pads' blocks), shaded per face; a glow box shines instead
    const box = (u0, y0, v0, u1, y1, v1, base, glow) => {
      for (const [cs, sh] of FACES) {
        const f = pos.length / 3;
        for (const k of cs) {
          const u = k & 1 ? u1 : u0; const y = k & 2 ? y1 : y0; const v = k & 4 ? v1 : v0;
          pos.push(cx + (u - v) * R2, y, cz + (u + v) * R2); cX.copy(base).multiplyScalar(glow ? 0.35 : sh); col.push(cX.r, cX.g, cX.b); glo.push(glow ? 1 : 0);
        }
        idx.push(f, f + 1, f + 2, f, f + 2, f + 3);
      }
    };
    const seed = strHash(theme.name || 'x');
    const i0 = Math.floor((acc.x - FAR_X) / FAR_CELL); const i1 = Math.floor((acc.x + FAR_X) / FAR_CELL);
    const j0 = Math.floor((acc.z + FAR_Z0) / FAR_CELL); const j1 = Math.floor((acc.z + FAR_Z1) / FAR_CELL);
    let n = 0;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const r = cellRng(i, j, seed); if (r() > (water ? 0.6 : 0.9)) continue;
      const fx = (i + 0.2 + 0.6 * r()) * FAR_CELL; const fz = (j + 0.2 + 0.6 * r()) * FAR_CELL; const x = fx - acc.x; const z = fz - acc.z;
      const w = Math.round(water ? 2 + r() * 3 : 3 + r() * 4); const d = Math.round(water ? 2 + r() * 2 : 2 + r() * 4);
      // never inside the fight's own frame, and 2.5 m clear of every pad, satellite and neighbouring pad
      if (Math.abs(x) < 15 && z > -11 && z < 10) continue;
      const R = Math.max(w, d) * 0.6 + 2.5; let ok = true;
      for (const [a, b] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R], [R * 0.7, R * 0.7], [-R * 0.7, R * 0.7], [R * 0.7, -R * 0.7], [-R * 0.7, -R * 0.7]]) {
        for (const p of pads) if (p.cellAt(x + a, z + b)) { ok = false; break; }
        if (!ok) break;
      }
      if (!ok) continue;
      cx = fx; cz = fz; n++;
      const hu = w / 2; const hv = d / 2; let T;
      if (water) {
        // a rocky islet standing in the water
        T = A.y + 0.4 + Math.round(r() * 4) * 0.5;
        box(-hu, A.y - 1.5, -hv, hu, T - 0.5, hv, side); box(-hu, T - 0.5, -hv, hu, T, hv, top);
      } else {
        // a crag hanging in the mist: a lit top slab, then three tiers narrowing downward, each nudged off the one above
        T = Math.min(-2.5, A.y + 1.5 + Math.round(r() * 8) * 0.5);
        box(-hu, T - 1, -hv, hu, T, hv, top);
        let y = T - 1; let s = 1;
        for (const [k, h] of [[0.74, 1.5], [0.5, 2], [0.26, 2.5]]) {
          const ku = Math.max(0.5, Math.round(hu * k * 2) / 2); const kv = Math.max(0.5, Math.round(hv * k * 2) / 2); const ou = Math.round((r() - 0.5) * 2) * 0.5 * s;
          box(-ku + ou, y - h, -kv, ku + ou, y, kv, side); y -= h; s = -s;
        }
        // a ledge stepping out of one flank, so the outline is not a plain rectangle
        if (r() < 0.5) box(hu - 0.5, T - 2, -hv * 0.6, hu + 1, T - 0.8, hv * 0.3, side); else box(-hu - 1, T - 2, -hv * 0.3, -hu + 0.5, T - 0.8, hv * 0.6, side);
      }
      // rocks on top, and now and then a crystal or an ember glowing in the theme's spark colour
      const nr = Math.floor(r() * 3);
      for (let k = 0; k < nr; k++) { const u = (r() - 0.5) * (w - 1); const v = (r() - 0.5) * (d - 1); const s = 0.5 + Math.round(r() * 2) * 0.25; box(u - s / 2, T, v - s / 2, u + s / 2, T + s * (1 + r()), v + s / 2, k ? side : top); }
      if (r() < (water ? 0.25 : 0.45)) { const u = (r() - 0.5) * (w - 1.2); const v = (r() - 0.5) * (d - 1.2); box(u - 0.3, T, v - 0.3, u + 0.3, T + 0.9, v + 0.3, top, true); }
    }
    // a lower, farther tier: small crags sunk close to the pit floor on a finer grid, so the gaps between the big ones step down
    // into the mist instead of opening onto plain fog
    if (!water) {
      const k0 = Math.floor((acc.x - FAR_X) / 6); const k1 = Math.floor((acc.x + FAR_X) / 6); const l0 = Math.floor((acc.z + FAR_Z0) / 6); const l1 = Math.floor((acc.z + FAR_Z1) / 6);
      for (let i = k0; i <= k1; i++) for (let j = l0; j <= l1; j++) {
        const r = cellRng(i, j, seed + 977); if (r() > 0.72) continue;
        const fx = (i + 0.15 + 0.7 * r()) * 6; const fz = (j + 0.15 + 0.7 * r()) * 6; const x = fx - acc.x; const z = fz - acc.z;
        if (Math.hypot(x, z * 1.6) < 20) continue;
        const w = 1 + Math.round(r() * 3); const d = 1 + Math.round(r() * 2); const hu = w / 2; const hv = d / 2;
        let ok = true; const R = Math.max(w, d) * 0.6 + 2;
        for (const [a, b] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]]) { for (const p of pads) if (p.cellAt(x + a, z + b)) { ok = false; break; } if (!ok) break; }
        if (!ok) continue;
        cx = fx; cz = fz; n++;
        const T = Math.min(-4, A.y + 0.5 + Math.round(r() * 4) * 0.5);
        box(-hu, T - 0.5, -hv, hu, T, hv, top); box(-hu + 0.5 * Math.min(1, hu - 0.5), T - 3, -hv + 0.25, hu - 0.5 * Math.min(1, hu - 0.5), T - 0.5, hv - 0.25, side);
        if (r() < 0.2) box(-0.25, T, -0.25, 0.25, T + 0.6, 0.25, top, true);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aGlow', new THREE.Float32BufferAttribute(glo, 1)); g.setIndex(idx);
    far.geometry.dispose(); far.geometry = g; far.visible = n > 0;
    const U = farMat.uniforms; U.uHaze.value.set(A.haze); U.uDeep.value.set(A.deep); U.uGlow.value.set(A.spark).multiplyScalar(water ? 1.2 : 1.7); U.uFoam.value.set(A.foam || A.haze); U.uPlane.value = A.y; U.uWater.value = water ? 1 : 0;
    farG.userData.n = n;
  }

  // metres from the nearest island cell (any cell whose top is above `y`), sampled every 0.5 m, as a texture
  function bakeDistance(pads, y) {
    const S = 0.5; const x0 = -40; const z0 = -32; const nx = 160; const nz = 128; const INF = 1e4; const d = new Float32Array(nx * nz).fill(INF);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = x0 + (i + 0.5) * S; const z = z0 + (j + 0.5) * S; for (const p of pads) { const c = p.cellAt(x, z); if (c && c.top > y - 0.5) { d[j * nx + i] = 0; break; } } }
    const k1 = S; const k2 = S * Math.SQRT2;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let v = d[j * nx + i]; if (i) v = Math.min(v, d[j * nx + i - 1] + k1); if (j) { v = Math.min(v, d[(j - 1) * nx + i] + k1); if (i) v = Math.min(v, d[(j - 1) * nx + i - 1] + k2); if (i < nx - 1) v = Math.min(v, d[(j - 1) * nx + i + 1] + k2); } d[j * nx + i] = v; }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { let v = d[j * nx + i]; if (i < nx - 1) v = Math.min(v, d[j * nx + i + 1] + k1); if (j < nz - 1) { v = Math.min(v, d[(j + 1) * nx + i] + k1); if (i < nx - 1) v = Math.min(v, d[(j + 1) * nx + i + 1] + k2); if (i) v = Math.min(v, d[(j + 1) * nx + i - 1] + k2); } d[j * nx + i] = v; }
    const px = new Uint8Array(nx * nz * 4); for (let k = 0; k < nx * nz; k++) { const v = Math.min(255, Math.round(d[k] / 10 * 255)); px[k * 4] = v; px[k * 4 + 1] = v; px[k * 4 + 2] = v; px[k * 4 + 3] = 255; }
    const t = new THREE.DataTexture(px, nx, nz); t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    return { tex: t, box: new THREE.Vector4(x0, z0, nx * S, nz * S) };
  }

  return {
    group,
    setStage(theme, pads, lights) {
      const A = theme.abyss; mode = A.type;
      const dist = bakeDistance(pads, A.type === 'water' ? A.y : pads[0].centre.y - 3);
      const mat = mode === 'water' ? water : deep; plane.material = mat; plane.position.y = A.type === 'water' ? A.y : A.y;
      const U = mat.uniforms; U.uDist.value = dist.tex; U.uBox.value.copy(dist.box);
      U.uDeep.value.set(A.deep); U.uShallow.value.set(A.shallow); U.uHaze.value.set(A.haze);
      if (mode === 'water') { U.uFoam.value.set(A.foam); U.uSpark.value.set(A.spark); U.uIce.value = A.ice || 0; }
      const warm = lights.filter((L) => L.warm).sort((a, b) => b.k - a.k).slice(0, NL);
      for (let i = 0; i < NL; i++) { const L = warm[i]; if (L) { U.uL.value[i].set(L.x, L.z, (mode === 'water' ? 0.5 : 0.8) * L.k, L.r * 0.55); U.uLC.value[i].setRGB(L.color[0], L.color[1] * 0.85, L.color[2] * 0.7); } else U.uL.value[i].set(0, 0, 0, 1); }
      for (const s of sheets) {
        s.visible = mode === 'mist'; const top = pads[0].centre.y - 1.5; s.position.y = top + (A.y - top) * s.userData.k;
        s.material.uniforms.uCol.value.set(A.shallow).lerp(lin(A.haze), s.userData.k < 0.4 ? 0.5 : 0); s.material.uniforms.uHaze.value.set(A.haze);
      }
      // a finished run moved the pad along the map by its last shift; then the islands around the new pad
      acc.x += last.x; acc.z += last.z; last.x = last.z = 0;
      buildFar(theme, A, pads);
    },
    // the scene slides by -shift during a run: the plane stays under the camera, its pattern and the islands' foam move
    setShift(x, y, z) { org.set(x, z); group.position.y = -y; last.x = x; last.z = z; farG.position.set(-(acc.x + x), 0, -(acc.z + z)); for (const m of [water, deep, ...sheets.map((s) => s.material)]) m.uniforms.uOrg.value = org; },
    update(dt) {
      const all = [water, deep, ...sheets.map((s) => s.material)];
      for (const m of all) m.uniforms.uTime.value = (m.uniforms.uTime.value + dt) % 2000;
      farMat.uniforms.uTime.value = (farMat.uniforms.uTime.value + dt) % 2000;
    },
    get calls() { return 1 + (mode === 'mist' ? sheets.length : 0) + (far.visible ? 1 : 0); },
    get farIslands() { return farG.userData.n || 0; },
  };
}
