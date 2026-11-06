// scene.json material entries -> three.js materials. The Unity project renders in GAMMA colour space, so everything
// here is raw gamma maths: textures are NoColorSpace (no sRGB decode), colours are passed through as LinearSRGB, and the
// renderer outputs LinearSRGB without tone mapping (see view.html). Do not "fix" this to sRGB.
import * as THREE from 'three';

const loader = new THREE.ImageLoader();
const texCache = new Map();
const raw = c => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);

// Colours of lights and ambient are Unity gamma values too; three divides by pi in the Lambert BRDF where URP does not.
export const gammaColor = c => new THREE.Color().setRGB(c.r, c.g, c.b, THREE.LinearSRGBColorSpace);

// Starts as the 16 px .lq.webp and swaps to the full image when it arrives (the two loads race: a late 16 px image must not
// replace the full one). `lq: false` loads the full image only (lightmaps, which must not be sampled at 16 px).
export function texture(base, name, { lq = true, lightmap = false } = {}) {
  const key = `${name}|${lightmap}`;
  if (texCache.has(key)) return texCache.get(key);
  const t = new THREE.Texture();
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.wrapS = t.wrapT = lightmap ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  // Bilinear without mips on lightmaps: Unity does the same, and mips bleed neighbouring atlas islands.
  t.minFilter = lightmap ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = !lightmap;
  t.anisotropy = 4;
  const entry = { tex: t, full: null, sharp: false };
  if (lq) loader.load(`${base}/${name}.lq.webp`, img => {
    if (entry.sharp) return;
    t.image = img;
    t.needsUpdate = true;
  });
  entry.full = new Promise(resolve => {
    loader.load(`${base}/${name}.webp`, img => {
      entry.sharp = true;
      t.dispose(); // the 16 px upload is immutable storage; a bigger image needs a fresh allocation
      t.image = img;
      t.needsUpdate = true;
      resolve();
    }, undefined, () => resolve());
  });
  texCache.set(key, entry);
  return entry;
}

// Lightmaps start from their 16 px preview too: without any image a lightmapped surface renders black, and on Pages the
// five full maps arrive seconds after the scene is up.
export function lightmapTexture(ctx, i) {
  const e = texture(ctx.texBase, ctx.textures[ctx.lightmaps[i]].name, { lightmap: true });
  e.tex.channel = 1;
  ctx.pending.push(e.full);
  ctx.lmPending.push(e.full);
  return e.tex;
}

function base(entry, ctx, extra) {
  const m = { ...extra, side: entry.f && entry.f._Cull === 0 ? THREE.DoubleSide : THREE.FrontSide };
  if (entry.tex != null) {
    const e = texture(ctx.texBase, ctx.textures[entry.tex].name);
    m.map = e.tex;
    ctx.pending.push(e.full);
  }
  return m;
}

function blend(m, entry) {
  if (entry.alpha === 'MASK') m.alphaTest = entry.cutoff ?? 0.5;
  if (entry.alpha === 'BLEND') {
    m.transparent = true;
    m.depthWrite = false;
    m.opacity = entry.color[3];
  }
  return m;
}

function slotTexture(entry, ctx, slot) {
  const i = entry.texs && entry.texs[slot];
  if (i == null) return null;
  const e = texture(ctx.texBase, ctx.textures[i].name);
  ctx.pending.push(e.full);
  return e.tex;
}

// MyShaders/Mobile/UnlitMatCap (tools/shaders/UnlitMatCap.glsl): rgb = _MainTex * _Color + matcap(view normal) * _MatCapMask
// * _MatCapColor, additive, alpha 1, Cull Off. MeshBasicMaterial has no normal without an envMap, so the vertex stage builds
// it (skinned normals come from the skinning chunks basic includes when USE_SKINNING is on).
function matcapMaterial(entry, ctx, color) {
  const c = entry.c || {};
  const tint = c._Color ? raw(c._Color) : color;
  const mat = new THREE.MeshBasicMaterial(base(entry, ctx, { color: tint, side: THREE.DoubleSide }));
  const mc = slotTexture(entry, ctx, '_Matcap');
  if (!mc) return mat;
  mc.wrapS = mc.wrapT = THREE.ClampToEdgeWrapping;
  const mask = slotTexture(entry, ctx, '_MatCapMask');
  const mcc = c._MatCapColor || [1, 1, 1];
  mat.onBeforeCompile = sh => {
    sh.uniforms.matcap = { value: mc };
    sh.uniforms.mcColor = { value: new THREE.Vector3(mcc[0], mcc[1], mcc[2]) };
    if (mask) sh.uniforms.matcapMask = { value: mask };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vMcN;`)
      .replace('#include <begin_vertex>', `#ifndef USE_SKINNING
vec3 objectNormal = normal;
#endif
vMcN = normalize(normalMatrix * objectNormal);
#include <begin_vertex>`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vMcN;
uniform sampler2D matcap;
uniform vec3 mcColor;
${mask ? 'uniform sampler2D matcapMask;' : ''}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 n = normalize(vMcN);
  vec3 m = texture2D(matcap, vec2(n.x * 0.5 + 0.5, 0.5 - n.y * 0.5)).rgb;
  ${mask ? 'm *= texture2D(matcapMask, vMapUv).rgb;' : ''}
  diffuseColor.rgb += m * mcColor;
}`);
  };
  mat.customProgramCacheKey = () => `matcap${mask ? 'M' : ''}`;
  return mat;
}

// Gentle vertex sway (_WindSpeed/_WindPower): x offset of sin(time + world x), stronger further up the blade.
function sway(mat, ctx, entry) {
  const power = (entry.f._WindPower ?? 1) * 0.25;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = ctx.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float wx = (modelMatrix * vec4(transformed, 1.0)).x;
  transformed.x += sin(uTime * 1.6 + wx * 0.5) * ${power.toFixed(3)} * max(transformed.y, 0.0) * 0.15;
}`);
  };
  mat.customProgramCacheKey = () => 'sway';
}

// The URP camera textures the water samples, filled by post.js each frame a refracting surface is in view: opaque colour
// at half resolution (URP asset m_OpaqueDownsampling = 2x bilinear) and the opaque depth buffer.
export const sceneCapture = {
  opaque: { value: null }, depth: { value: null }, size: { value: new THREE.Vector2(1, 1) },
  near: { value: 0.1 }, far: { value: 1000 },
};

// Ashima 2D simplex noise exactly as Shader Graph compiled it into WaterwithWaves/Trees (x*34+1 permute, 1/41 gradients).
const SNOISE = /* glsl */`
vec3 sn289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 sn289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = sn289(i);
  vec3 p = sn289(((i.y + vec3(0.0, i1.y, 1.0)) * 34.0 + 1.0) * (i.y + vec3(0.0, i1.y, 1.0)));
  p = p + i.x + vec3(0.0, i1.x, 1.0);
  p = sn289((p * 34.0 + 1.0) * p);
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 a0 = x - floor(x + 0.5);
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g = vec3(a0.x * x0.x + h.x * x0.y, a0.yz * x12.xz + h.yz * x12.yw);
  return 130.0 * dot(m, g);
}`;

const waterVert = /* glsl */`
uniform float uTime, waveHeight, waveScale, waveSpeed;
varying vec2 vUv;
varying float vSurfZ;
${SNOISE}
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vSurfZ = -(viewMatrix * wp).z;
  vec3 p = position;
  // Object-space lift by noise of the Unity world XZ (three z is Unity -z); position is object space (world.js).
  if (waveHeight != 0.0) p.y += waveHeight * (snoise((vec2(wp.x, -wp.z) + uTime * waveSpeed) * waveScale) * 0.5 + 0.5);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}`;

const waterFrag = /* glsl */`
uniform sampler2D normalMap, opaqueTex, depthTex;
uniform vec2 screenSize, refrDir;
uniform float near, far, uTime, normalTile, normalScale, refrSpeed, refrAmount, refrOpacity, depthOffset, depthPower, opacity;
uniform vec3 tint, emission, depthColor, ambient;
varying vec2 vUv;
varying float vSurfZ;
float eyeDepth(float d) { return near * far / ((near - far) * d + far); }
void main() {
  // Unity uv (v up) -> our flipped uv and unflipped texture: sample at (s.x, 1 - s.y).
  vec2 s = vec2(vUv.x, 1.0 - vUv.y) * normalTile + refrDir * refrSpeed * uTime;
  vec2 n = (texture2D(normalMap, vec2(s.x, 1.0 - s.y)).xy * 2.0 - 1.0) * normalScale;
  vec2 suv = gl_FragCoord.xy / screenSize;
  float sceneZ = eyeDepth(texture2D(depthTex, suv).x);
  vec2 off = n * (refrAmount / max(vSurfZ, 0.1)) * clamp(sceneZ - vSurfZ, 0.0, 1.0);
  off *= clamp(eyeDepth(texture2D(depthTex, suv + off).x) - vSurfZ, 0.0, 1.0);
  vec3 behind = clamp(texture2D(opaqueTex, suv + off).rgb, 0.0, 1.0);
  vec3 albedo = mix(behind, tint, refrOpacity);
  float d = sceneZ - eyeDepth(gl_FragCoord.z);
  float edge = clamp((1.0 - abs(d / depthOffset)) * depthPower, 0.0, 1.0);
  gl_FragColor = vec4(ambient * albedo * 0.96 + emission + depthColor * edge, min(abs(d / opacity), 1.0));
}`;

// MyShaders/Water/WaterwithWaves, Forward pass (tools/shaders/WaterwithWaves.glsl), Blend SrcAlpha OneMinusSrcAlpha, ZWrite
// On, Cull Off, queue Transparent. albedo = lerp(_CameraOpaqueTexture at the refracted screen uv, _MianTex * _TintColor,
// _RefrectionOpacity); rgb = SH * albedo * 0.96 + _EmssionMap * _EmissionColor + _DepthColor * saturate((1 - |dz /
// _DepthOffset|) * _DepthPower); alpha = min(|dz / _Opacity|, 1) where dz = scene eye depth - surface eye depth.
// _MianTex and _EmssionMap are unset on every water material and default to white. Not carried: the main light (the
// scene's only one is Baked under an inactive parent) and the reflection-probe specular (FishEnv RenderSettings
// m_ReflectionIntensity = 0). SH is the flat ambient colour, as for every other dynamic surface (world.js).
function waterMaterial(entry, ctx) {
  const f = entry.f, c = entry.c;
  const v3 = (a = [0, 0, 0]) => new THREE.Vector3(a[0], a[1], a[2]);
  const rd = c._RefractionDiredtion || [0, 0];
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: ctx.time,
      waveHeight: { value: f._WaveHeight ?? 0 }, waveScale: { value: f._WaveScale ?? 5 }, waveSpeed: { value: f._WaveSpeed ?? 1 },
      normalMap: { value: slotTexture(entry, ctx, '_RefractionNormal') },
      opaqueTex: sceneCapture.opaque, depthTex: sceneCapture.depth, screenSize: sceneCapture.size,
      near: sceneCapture.near, far: sceneCapture.far,
      refrDir: { value: new THREE.Vector2(rd[0], rd[1]) },
      normalTile: { value: f._NormalTile ?? 1 }, normalScale: { value: f._NormalScale ?? 0 },
      refrSpeed: { value: f._RefractionSpeed ?? 0 }, refrAmount: { value: f._RefractionAmount ?? 0 },
      refrOpacity: { value: f._RefrectionOpacity ?? 0.5 }, depthOffset: { value: f._DepthOffset ?? 0 },
      depthPower: { value: f._DepthPower ?? 0 }, opacity: { value: f._Opacity ?? 0 },
      tint: { value: v3(c._TintColor) }, emission: { value: v3(c._EmissionColor) }, depthColor: { value: v3(c._DepthColor) },
      ambient: { value: v3(ctx.ambient) },
    },
    vertexShader: waterVert, fragmentShader: waterFrag,
    transparent: true, depthWrite: true, side: THREE.DoubleSide,
  });
  mat.userData.refract = true;
  // The wave moves vertices in Unity object space: world.js gives these meshes unquantized object-space positions.
  mat.userData.objectSpace = (f._WaveHeight ?? 0) !== 0;
  return mat;
}

// ctx = { texBase, textures, lightmaps, time {value}, ambient [r,g,b], pending[] }; lm = lightmap index (Bakery) or null.
export function makeMaterial(entry, ctx, lm = null) {
  const key = `${entry.name}|${lm}`;
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  const sh = entry.shader;
  const color = raw(entry.color);
  let mat;
  if (sh.startsWith('Bakery/Light')) {
    // Area-light emitter geometry: the light itself is baked, the quad only shows its colour.
    mat = new THREE.MeshBasicMaterial({ color });
  } else if (sh.includes('Water')) {
    mat = waterMaterial(entry, ctx);
  } else if (sh.includes('MatCap')) {
    mat = blend(matcapMaterial(entry, ctx, color), entry);
  } else if (sh.includes('Trees') && lm == null) {
    mat = new THREE.MeshLambertMaterial(base(entry, ctx, { color, side: THREE.DoubleSide, transparent: true, alphaTest: 0.1 }));
    sway(mat, ctx, entry);
  } else if (lm != null) {
    // Baked static: albedo * 0.96 (1 - metallic) * 2 * lightmap texel. The lightmaps are LightmapDoubleLDR (Texture2D
    // m_LightmapFormat 1) and the LIGHTMAP_ON programs decode them as texel + texel; 0.96 is URP's dielectric
    // oneMinusReflectivity (the Trees program hard-codes it). MeshBasic scales lightMap by 1/pi, hence the pi.
    const diffuse = 0.96 * (1 - (entry.f._Metallic || 0));
    mat = new THREE.MeshBasicMaterial(base(entry, ctx, { color, lightMap: lightmapTexture(ctx, lm), lightMapIntensity: 2 * diffuse * Math.PI }));
    blend(mat, entry);
    if (sh.includes('Trees')) {
      // Trees is Queue Transparent, Blend SrcAlpha OneMinusSrcAlpha, ZWrite On, clip at alpha 0.1: it draws after the
      // opaque capture (so water does not refract it) and sorts with glass and water like the original.
      Object.assign(mat, { transparent: true, depthWrite: true, alphaTest: 0.1 });
      sway(mat, ctx, entry);
    }
  } else {
    mat = blend(new THREE.MeshLambertMaterial(base(entry, ctx, { color })), entry);
  }
  mat.name = entry.name;
  ctx.cache.set(key, mat);
  return mat;
}
