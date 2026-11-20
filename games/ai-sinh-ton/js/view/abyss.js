// What lies around the pads: water (one plane with an animated shader: two scrolling noise layers, twinkling sparkle
// dashes, darker with distance from the island, a bright band along the shore, the warm lights' stretched reflections,
// hazier toward the far edge) or a fog abyss (a dark deep plane plus drifting mist sheets at different depths, colour
// shifting with depth). The shore distance comes from a small texture baked from the pads' cells.
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
  for (int i = 0; i < ${NL}; i++) { vec4 L = uL[i]; if (L.z <= 0.0) continue; vec2 q = p - L.xy; c += uLC[i] * L.z * 0.18 * exp(-dot(q, q) / (L.w * L.w * 3.0)); }
  c = mix(c, uHaze, far * 0.7);
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
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(DW, DD), water); plane.rotation.x = -Math.PI / 2; plane.position.z = DZ; plane.frustumCulled = false; group.add(plane);
  const SHEETS = low ? [{ y: 0.42, s: 0.05, a: 0.42, d: [0.04, 0.012] }] : [{ y: 0.3, s: 0.05, a: 0.36, d: [0.04, 0.012] }, { y: 0.62, s: 0.07, a: 0.3, d: [-0.03, 0.02] }];
  const sheets = SHEETS.map((S) => {
    const m = mk(MIST_FRAG, { uTime: { value: 0 }, uOrg: { value: org }, uCol: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uA: { value: S.a }, uScale: { value: S.s }, uDrift: { value: new THREE.Vector2(...S.d) }, uFarZ: { value: -24 }, uNearZ: { value: 4 } }, true);
    const me = new THREE.Mesh(new THREE.PlaneGeometry(DW, DD), m); me.rotation.x = -Math.PI / 2; me.position.z = DZ; me.frustumCulled = false; me.renderOrder = 3; me.userData.k = S.y; group.add(me); return me;
  });
  let mode = 'water';

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
    },
    // the scene slides by -shift during a run: the plane stays under the camera, its pattern and the islands' foam move
    setShift(x, y, z) { org.set(x, z); group.position.y = -y; for (const m of [water, deep, ...sheets.map((s) => s.material)]) m.uniforms.uOrg.value = org; },
    update(dt) {
      const all = [water, deep, ...sheets.map((s) => s.material)];
      for (const m of all) m.uniforms.uTime.value = (m.uniforms.uTime.value + dt) % 2000;
    },
    get calls() { return 1 + (mode === 'mist' ? sheets.length : 0); },
  };
}
