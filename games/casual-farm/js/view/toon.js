// Toony Colors Pro 2 "Hybrid Shader 2" as used by My Mini Mart, reduced to the parts the game's materials switch on:
// albedo (palette texture x _BaseColor), one smoothstep ramp between _SColor and _HColor lit by the main light,
// flat ambient, alpha test, and a constant-pixel-width inverted-hull outline (TCP2_OUTLINE_CONST_SIZE).
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const texCache = new Map();

export const lighting = {
  dir: new THREE.Vector3(0, 1, 0),
  color: new THREE.Color(1, 1, 1),
  ambient: new THREE.Color(0.7, 0.7, 0.7),
  resolution: new THREE.Vector2(1, 1),
};

// Every texture starts as its 16 px .lq.webp and swaps to the full image when it arrives; the caller awaits `full`.
export function texture(base, name) {
  if (texCache.has(name)) return texCache.get(name);
  const t = loader.load(`${base}/${name}.lq.webp`);
  setup(t);
  const entry = { tex: t, full: null };
  entry.full = new Promise(resolve => {
    loader.load(`${base}/${name}.webp`, img => {
      // The 16 px upload is immutable storage (texStorage2D); a bigger image needs a fresh allocation.
      t.dispose();
      t.image = img.image;
      t.needsUpdate = true;
      resolve();
    }, undefined, () => resolve());
  });
  texCache.set(name, entry);
  return entry;
}

function setup(t) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
}

const vert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  #include <common>
  #include <skinning_pars_vertex>
  void main() {
    vUv = uv;
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      mv = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
      objectNormal = mat3(instanceMatrix) * objectNormal;
    #endif
    vNormal = normalize(mat3(modelMatrix) * objectNormal);
    gl_Position = projectionMatrix * mv;
  }`;

const frag = /* glsl */`
  uniform sampler2D map;
  uniform bool hasMap;
  uniform vec4 uvST;
  uniform vec3 color;
  uniform vec3 hColor;
  uniform vec3 sColor;
  uniform float thr;
  uniform float smoothing;
  uniform float cutoff;
  uniform vec3 lightDir;
  uniform vec3 lightColor;
  uniform vec3 ambient;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec4 albedo = vec4(color, 1.0);
    if (hasMap) albedo *= texture2D(map, vUv * uvST.xy + uvST.zw);
    if (albedo.a < cutoff) discard;
    float ndl = dot(normalize(vNormal), lightDir) * 0.5 + 0.5;
    float ramp = smoothstep(thr - smoothing * 0.5, thr + smoothing * 0.5, ndl);
    vec3 lit = mix(sColor, hColor, ramp) * lightColor;
    gl_FragColor = vec4(albedo.rgb * (lit + ambient), 1.0);
    #include <colorspace_fragment>
  }`;

const outlineVert = /* glsl */`
  attribute vec3 smoothNormal;
  uniform float width;
  uniform vec2 resolution;
  #include <common>
  #include <skinning_pars_vertex>
  void main() {
    vec3 objectNormal = smoothNormal;
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    mat4 mvm = modelViewMatrix;
    #ifdef USE_INSTANCING
      mvm = modelViewMatrix * instanceMatrix;
    #endif
    vec4 clip = projectionMatrix * mvm * vec4(transformed, 1.0);
    vec3 n = normalize(mat3(mvm) * objectNormal);
    vec2 dir = normalize((projectionMatrix * vec4(n, 0.0)).xy + 1e-6);
    clip.xy += dir * width * clip.w * 2.0 / resolution;
    gl_Position = clip;
  }`;

const outlineFrag = /* glsl */`
  uniform vec3 outlineColor;
  void main() {
    gl_FragColor = vec4(outlineColor, 1.0);
    #include <colorspace_fragment>
  }`;

const srgb = c => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

// One THREE material (plus an outline material or null) per scene.json material entry.
export function makeMaterial(entry, texBase, textures, { skinned = false } = {}) {
  const toon = entry.toon || { h: [1, 1, 1], s: [0.55, 0.55, 0.55], thr: 0.5, smooth: 0.4 };
  const texName = entry.tex != null ? textures[entry.tex].name : null;
  const uniforms = {
    map: { value: texName ? texture(texBase, texName).tex : null },
    hasMap: { value: !!texName },
    uvST: { value: new THREE.Vector4(...(entry.st || [1, 1, 0, 0])) },
    color: { value: srgb(entry.color) },
    hColor: { value: srgb(toon.h) },
    sColor: { value: srgb(toon.s) },
    thr: { value: toon.thr },
    smoothing: { value: Math.max(toon.smooth, 0.001) },
    cutoff: { value: entry.alpha === 'MASK' ? entry.cutoff : -1 },
    lightDir: { value: lighting.dir },
    lightColor: { value: lighting.color },
    ambient: { value: lighting.ambient },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag });
  mat.skinning = skinned;
  if (entry.alpha === 'BLEND') {
    mat.transparent = true;
    mat.depthWrite = false;
  }
  let outline = null;
  if (entry.outline) {
    outline = new THREE.ShaderMaterial({
      uniforms: {
        width: { value: entry.outline.w * 0.5 },
        resolution: { value: lighting.resolution },
        outlineColor: { value: srgb(entry.outline.color) },
      },
      vertexShader: outlineVert,
      fragmentShader: outlineFrag,
      side: THREE.BackSide,
    });
  }
  return { mat, outline, texName };
}

// Normals averaged over vertices that share a position, so hard-edged low-poly meshes get a closed outline hull.
export function addSmoothNormals(geo) {
  if (geo.getAttribute('smoothNormal')) return;
  const p = geo.getAttribute('position');
  const n = geo.getAttribute('normal');
  const acc = new Map();
  const key = i => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    const v = acc.get(k) || [0, 0, 0];
    if (n) { v[0] += n.getX(i); v[1] += n.getY(i); v[2] += n.getZ(i); }
    acc.set(k, v);
  }
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = acc.get(key(i));
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    out[i * 3] = v[0] / l; out[i * 3 + 1] = v[1] / l; out[i * 3 + 2] = v[2] / l;
  }
  geo.setAttribute('smoothNormal', new THREE.BufferAttribute(out, 3));
}
