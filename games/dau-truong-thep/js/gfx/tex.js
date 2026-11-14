// GPU-baked tiling PBR texture sets. Each set is a GLSL function drawn once into a render target at boot:
// albedo, a height/roughness/metalness pack, and a normal map derived from the height. No image files.

import * as THREE from '../../vendor/three.module.min.js';

const NOISE = /* glsl */`
float hash(vec2 p, float per) { p = mod(p, per); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p, float per) { p = mod(p, per); return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float vnoise(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i, per), hash(i + vec2(1, 0), per), f.x), mix(hash(i + vec2(0, 1), per), hash(i + vec2(1, 1), per), f.x), f.y);
}
float fbm(vec2 uv, float per) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(uv * per, per); per *= 2.0; a *= 0.5; }
  return s;
}
// x: distance to the nearest cell point, y: distance to the cell border, z: a random value per cell
vec3 voro(vec2 uv, float per) {
  vec2 p = uv * per, i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), o = hash2(i + g, per);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = hash(i + g + 7.0, per); } else if (d < d2) d2 = d;
  }
  return vec3(d1, d2 - d1, id);
}
`;

// Each body writes linear albedo, height 0..1, roughness, metalness for a uv in 0..1 that must tile.
const SETS = {
  grass: /* glsl */`
    float n = fbm(uv, 6.0), fine = fbm(uv + 3.7, 48.0);
    float blades = vnoise(vec2(uv.x * 220.0 + n * 6.0, uv.y * 36.0), 4.0) * 0.5 + vnoise(vec2(uv.x * 40.0, uv.y * 240.0 + n * 5.0), 4.0) * 0.5;
    vec3 dark = vec3(0.045, 0.14, 0.03), mid = vec3(0.11, 0.30, 0.05), lit = vec3(0.30, 0.46, 0.09);
    albedo = mix(dark, mid, smoothstep(0.25, 0.6, n));
    albedo = mix(albedo, lit, smoothstep(0.55, 0.9, blades) * 0.55);
    vec3 cl = voro(uv, 9.0);
    albedo = mix(albedo, vec3(0.24, 0.30, 0.08), smoothstep(0.75, 1.0, cl.z) * (1.0 - smoothstep(0.1, 0.45, cl.x)) * 0.5);
    albedo *= 0.8 + fine * 0.45;
    height = n * 0.5 + blades * 0.5; rough = 0.92; metal = 0.0;`,
  dirt: /* glsl */`
    float n = fbm(uv, 5.0), fine = fbm(uv + 1.3, 40.0);
    vec3 peb = voro(uv, 22.0);
    float stone = (1.0 - smoothstep(0.1, 0.2, peb.x)) * step(0.8, peb.z);
    albedo = mix(vec3(0.20, 0.125, 0.07), vec3(0.36, 0.255, 0.15), n);
    albedo = mix(albedo, vec3(0.34, 0.31, 0.26) * (0.5 + peb.z * 0.5), stone * 0.8);
    float crack = 1.0 - smoothstep(0.0, 0.04, voro(uv + n * 0.05, 7.0).y);
    albedo *= (0.86 + fine * 0.28) * (1.0 - crack * 0.22);
    height = n * 0.5 + stone * 0.4 - crack * 0.3 + fine * 0.15; rough = 0.95 - stone * 0.25; metal = 0.0;`,
  pave: /* glsl */`
    vec2 g = uv * 4.0; float row = floor(g.y); g.x += mod(row, 2.0) * 0.5;
    vec2 cell = floor(g), f = fract(g);
    float rnd = hash(cell, 4.0), n = fbm(uv, 8.0), fine = fbm(uv + 5.1, 64.0);
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float gap = 1.0 - smoothstep(0.015, 0.05, edge + (n - 0.5) * 0.04);
    vec3 st = mix(vec3(0.34, 0.31, 0.25), vec3(0.52, 0.47, 0.37), rnd);
    st = mix(st, vec3(0.42, 0.40, 0.30), smoothstep(0.5, 0.8, n) * 0.5);
    float moss = (1.0 - smoothstep(0.0, 0.1, edge - n * 0.08)) * smoothstep(0.35, 0.6, fbm(uv + 9.0, 5.0));
    albedo = mix(st * (0.75 + fine * 0.5), vec3(0.08, 0.06, 0.04), gap);
    albedo = mix(albedo, GROWTH_LO, moss * 0.85);
    vec3 ch = voro(uv, 30.0);
    float chip = smoothstep(0.62, 0.7, ch.z) * (1.0 - smoothstep(0.1, 0.2, ch.x));
    albedo *= 1.0 - chip * 0.25;
    height = (1.0 - gap) * (0.6 + rnd * 0.2) + fine * 0.15 - chip * 0.2 + moss * 0.1; rough = 0.82 + moss * 0.12; metal = 0.0;`,
  ruin: /* glsl */`
    vec2 g = uv * vec2(3.0, 6.0); float row = floor(g.y); g.x += mod(row, 2.0) * 0.5;
    vec2 cell = floor(g), f = fract(g);
    float rnd = hash(cell, 6.0), n = fbm(uv, 6.0), fine = fbm(uv + 2.2, 56.0);
    float edge = min(min(f.x, 1.0 - f.x) * 2.0, min(f.y, 1.0 - f.y));
    float gap = 1.0 - smoothstep(0.02, 0.09, edge + (n - 0.5) * 0.08);
    vec3 st = mix(vec3(0.30, 0.27, 0.22), vec3(0.56, 0.50, 0.38), rnd * 0.7 + n * 0.3);
    float streak = smoothstep(0.45, 0.9, vnoise(vec2(uv.x * 30.0, uv.y * 3.0), 3.0)) * 0.3;
    float moss = smoothstep(0.5, 0.75, fbm(uv + 4.0, 4.0) + gap * 0.3);
    albedo = st * (0.72 + fine * 0.55) * (1.0 - streak);
    albedo = mix(albedo, vec3(0.06, 0.05, 0.04), gap * 0.9);
    albedo = mix(albedo, mix(GROWTH_LO, GROWTH_HI, fine), moss * 0.8);
    height = (1.0 - gap) * (0.55 + rnd * 0.3) + fine * 0.2 + moss * 0.08; rough = 0.86 + moss * 0.1; metal = 0.0;`,
  sand: /* glsl */`
    float n = fbm(uv, 4.0), fine = fbm(uv + 2.9, 64.0);
    float rip = sin((uv.y * 34.0 + n * 7.0 + sin(uv.x * 12.566) * 0.6) * 6.2832) * 0.5 + 0.5;
    albedo = mix(vec3(0.50, 0.36, 0.20), vec3(0.74, 0.58, 0.36), n * 0.6 + rip * 0.25);
    vec3 peb = voro(uv, 26.0);
    albedo = mix(albedo, vec3(0.36, 0.3, 0.24), (1.0 - smoothstep(0.08, 0.16, peb.x)) * step(0.86, peb.z) * 0.7);
    albedo *= 0.88 + fine * 0.24;
    height = n * 0.4 + rip * 0.45 + fine * 0.1; rough = 0.96; metal = 0.0;`,
  track: /* glsl */`
    float n = fbm(uv, 5.0), fine = fbm(uv + 1.1, 48.0);
    float tread = smoothstep(0.35, 0.65, sin(uv.y * 150.8) * 0.5 + 0.5) * smoothstep(0.4, 0.7, vnoise(vec2(uv.x * 8.0, 1.0), 8.0));
    albedo = mix(vec3(0.33, 0.25, 0.16), vec3(0.48, 0.38, 0.25), n) * (0.84 + fine * 0.3) * (1.0 - tread * 0.25);
    height = n * 0.5 - tread * 0.3 + fine * 0.15; rough = 0.93; metal = 0.0;`,
  snow: /* glsl */`
    float n = fbm(uv, 5.0), fine = fbm(uv + 6.1, 72.0);
    albedo = mix(vec3(0.62, 0.72, 0.86), vec3(0.93, 0.96, 1.0), smoothstep(0.25, 0.75, n));
    float spark = step(0.985, hash(floor(uv * 512.0), 512.0));
    albedo += spark * 0.25; albedo *= 0.94 + fine * 0.1;
    height = n * 0.8 + fine * 0.1; rough = 0.78 - spark * 0.4; metal = 0.0;`,
  frost: /* glsl */`
    float n = fbm(uv, 4.0), fine = fbm(uv + 3.3, 56.0);
    vec3 c1 = voro(uv + n * 0.06, 6.0), c2 = voro(uv + 0.37, 17.0);
    float crack = (1.0 - smoothstep(0.0, 0.035, c1.y)) + (1.0 - smoothstep(0.0, 0.02, c2.y)) * 0.5;
    albedo = mix(vec3(0.30, 0.50, 0.68), vec3(0.62, 0.80, 0.92), n) * (0.92 + fine * 0.14);
    albedo = mix(albedo, vec3(0.95, 0.98, 1.0), clamp(crack, 0.0, 1.0) * 0.75);
    height = 0.5 - clamp(crack, 0.0, 1.0) * 0.4 + fine * 0.05; rough = 0.16 + clamp(crack, 0.0, 1.0) * 0.4 + fine * 0.1; metal = 0.0;`,
  basalt: /* glsl */`
    float n = fbm(uv, 5.0), fine = fbm(uv + 4.4, 64.0);
    vec3 c = voro(uv + n * 0.04, 9.0);
    float crack = 1.0 - smoothstep(0.0, 0.05, c.y);
    albedo = mix(vec3(0.055, 0.05, 0.055), vec3(0.16, 0.145, 0.14), c.z * 0.6 + n * 0.4) * (0.8 + fine * 0.45);
    albedo = mix(albedo, vec3(0.02, 0.015, 0.015), crack);
    height = (1.0 - crack) * (0.5 + c.z * 0.3) + fine * 0.15; rough = 0.72 + fine * 0.2; metal = 0.0;`,
  ash: /* glsl */`
    float n = fbm(uv, 5.0), fine = fbm(uv + 7.7, 60.0);
    vec3 peb = voro(uv, 20.0);
    albedo = mix(vec3(0.15, 0.12, 0.11), vec3(0.30, 0.25, 0.22), n) * (0.82 + fine * 0.35);
    albedo = mix(albedo, vec3(0.07, 0.06, 0.06), (1.0 - smoothstep(0.1, 0.2, peb.x)) * step(0.8, peb.z) * 0.8);
    height = n * 0.6 + fine * 0.2; rough = 0.95; metal = 0.0;`,
  asphalt: /* glsl */`
    float n = fbm(uv, 6.0), fine = fbm(uv + 2.2, 96.0);
    vec3 c = voro(uv + n * 0.05, 5.0);
    float crack = 1.0 - smoothstep(0.0, 0.025, c.y);
    float patch_ = smoothstep(0.55, 0.6, fbm(uv + 5.0, 3.0));
    albedo = mix(vec3(0.085, 0.085, 0.09), vec3(0.15, 0.15, 0.155), n) * (0.8 + fine * 0.45);
    albedo = mix(albedo, albedo * 0.7, patch_);
    albedo = mix(albedo, vec3(0.02), crack);
    height = 0.5 - crack * 0.4 + fine * 0.12; rough = 0.82 - patch_ * 0.2; metal = 0.0;`,
  concrete: /* glsl */`
    vec2 g = uv * 3.0; vec2 f = fract(g);
    float rnd = hash(floor(g), 3.0), n = fbm(uv, 7.0), fine = fbm(uv + 9.1, 80.0);
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float gap = 1.0 - smoothstep(0.008, 0.022, edge);
    float stain = smoothstep(0.5, 0.8, fbm(uv + 3.0, 4.0));
    albedo = vec3(0.42 + rnd * 0.08) * (0.86 + fine * 0.22) * (1.0 - stain * 0.25);
    float crack = 1.0 - smoothstep(0.0, 0.02, voro(uv + n * 0.04, 7.0).y);
    albedo = mix(albedo, vec3(0.06), max(gap, crack * 0.7));
    height = (1.0 - gap) * 0.6 - crack * 0.25 + fine * 0.1; rough = 0.85; metal = 0.0;`,
  mud: /* glsl */`
    float n = fbm(uv, 5.0), fine = fbm(uv + 4.2, 48.0);
    float wet = smoothstep(0.4, 0.6, fbm(uv + 7.0, 4.0));
    albedo = mix(vec3(0.10, 0.075, 0.045), vec3(0.20, 0.15, 0.09), n) * (0.85 + fine * 0.3);
    albedo = mix(albedo, albedo * 0.6, wet);
    height = n * 0.6 * (1.0 - wet * 0.7) + fine * 0.1; rough = mix(0.9, 0.12, wet); metal = 0.0;`,
  metal: /* glsl */`
    vec2 g = uv * 2.0; vec2 cell = floor(g), f = fract(g);
    float rnd = hash(cell, 2.0), n = fbm(uv, 6.0), fine = fbm(uv + 8.3, 80.0);
    float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float seam = 1.0 - smoothstep(0.006, 0.016, edge);
    float rivet = 1.0 - smoothstep(0.012, 0.02, length(abs(f - 0.5) - 0.44));
    float scr = smoothstep(0.88, 0.98, vnoise(vec2(uv.x * 14.0 + uv.y * 9.0, uv.y * 260.0 - uv.x * 120.0), 2.0)) * smoothstep(0.45, 0.75, n);
    float wear = (1.0 - smoothstep(0.01, 0.07, edge)) * smoothstep(0.4, 0.75, fbm(uv + 1.7, 24.0));
    albedo = vec3(0.86 + rnd * 0.06) * (0.92 + fine * 0.14);
    albedo = mix(albedo, vec3(1.05), max(scr, wear) * 0.45);
    albedo = mix(albedo, vec3(0.3), seam * 0.85);
    float grime = smoothstep(0.5, 0.9, fbm(uv + 6.0, 4.0)) * 0.3;
    albedo *= 1.0 - grime;
    height = 0.6 - seam * 0.45 + rivet * 0.3 - scr * 0.08 + fine * 0.03;
    rough = 0.42 + grime * 0.4 - max(scr, wear) * 0.2 + fine * 0.12; metal = 0.6 - grime * 0.35;`,
  wood: /* glsl */`
    vec2 g = uv * vec2(4.0, 1.0); float plank = floor(g.x); float fx = fract(g.x);
    float rnd = hash(vec2(plank, 1.0), 4.0);
    float grain = fbm(vec2(uv.x * 3.0 + rnd, uv.y * 0.35 + rnd * 3.0), 16.0);
    float rings = sin((uv.y * 6.0 + grain * 5.0 + rnd * 6.0) * 6.2832) * 0.5 + 0.5;
    float gap = 1.0 - smoothstep(0.02, 0.06, min(fx, 1.0 - fx));
    albedo = mix(vec3(0.30, 0.18, 0.08), vec3(0.56, 0.37, 0.17), grain * 0.7 + rnd * 0.3) * (0.82 + rings * 0.25);
    albedo = mix(albedo, vec3(0.05, 0.03, 0.02), gap);
    height = (1.0 - gap) * 0.6 + rings * 0.12 + grain * 0.2; rough = 0.8; metal = 0.0;`,
};

// What settles in the seams and on top of stonework (the pave and ruin sets): [dark, light] colours per climate.
const GROWTH = {
  moss: ['0.08, 0.19, 0.045', '0.20, 0.30, 0.07'], snow: ['0.74, 0.82, 0.92', '0.95, 0.97, 1.0'], sand: ['0.46, 0.36, 0.22', '0.62, 0.50, 0.31'],
  ash: ['0.03, 0.026, 0.026', '0.11, 0.06, 0.045'], grime: ['0.045, 0.045, 0.05', '0.13, 0.13, 0.12'], dry: ['0.24, 0.15, 0.04', '0.46, 0.28, 0.07'],
};

export function makeTextures(renderer, size) {
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false; scene.add(quad);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const vert = `in vec3 position; out vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const tune = (t, srgb) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true; t.anisotropy = aniso; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  };
  const cache = {};

  function bake(name, growth = 'moss') {
    const key = growth === 'moss' ? name : name + '~' + growth, [lo, hi] = GROWTH[growth];
    if (cache[key]) return cache[key];
    const mrt = new THREE.WebGLMultipleRenderTargets(size, size, 2, { depthBuffer: false });
    tune(mrt.texture[0], true); tune(mrt.texture[1], false);
    const surf = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: vert, depthTest: false,
      fragmentShader: `precision highp float; in vec2 vUv; layout(location = 0) out vec4 oA; layout(location = 1) out vec4 oB;
        ${NOISE}
        void main() { vec2 uv = vUv; vec3 albedo; float height, rough, metal;
          ${SETS[name].replace(/GROWTH_LO/g, `vec3(${lo})`).replace(/GROWTH_HI/g, `vec3(${hi})`)}
          oA = vec4(max(albedo, 0.0), 1.0); oB = vec4(clamp(height, 0.0, 1.0), clamp(rough, 0.04, 1.0), clamp(metal, 0.0, 1.0), 1.0); }`,
    });
    quad.material = surf;
    renderer.setRenderTarget(mrt); renderer.render(scene, cam);
    const nrt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false });
    tune(nrt.texture, false);
    const norm = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: vert, depthTest: false, uniforms: { tH: { value: mrt.texture[1] }, px: { value: 1 / size } },
      fragmentShader: `precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D tH; uniform float px;
        void main() {
          float l = texture(tH, vUv - vec2(px, 0)).r, r = texture(tH, vUv + vec2(px, 0)).r, d = texture(tH, vUv - vec2(0, px)).r, u = texture(tH, vUv + vec2(0, px)).r;
          vec3 n = normalize(vec3((l - r) * 3.0, (d - u) * 3.0, 1.0));
          o = vec4(n * 0.5 + 0.5, 1.0); }`,
    });
    quad.material = norm;
    renderer.setRenderTarget(nrt); renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    surf.dispose(); norm.dispose();
    return (cache[key] = { map: mrt.texture[0], orm: mrt.texture[1], normal: nrt.texture });
  }

  // A MeshStandardMaterial wearing a baked set, tinted by vertex colours. The builder's UVs are world-scaled.
  function material(name, opts = {}) {
    const key = name + JSON.stringify(opts);
    if (cache[key]) return cache[key];
    const set = bake(name, opts.growth);
    const m = new THREE.MeshStandardMaterial({
      map: set.map, normalMap: set.normal, roughnessMap: set.orm, metalnessMap: set.orm,
      roughness: 1, metalness: 1, vertexColors: true, envMapIntensity: opts.reflect ?? 1,
    });
    if (opts.bump) m.normalScale.setScalar(opts.bump);
    return (cache[key] = m);
  }

  return { bake, material, names: Object.keys(SETS) };
}
