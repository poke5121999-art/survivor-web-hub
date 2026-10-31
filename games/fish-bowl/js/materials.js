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

// WaterwithWaves (tools/shaders/WaterwithWaves.glsl). The original refracts the opaque scene and adds _DepthColor near
// contact lines, SH light and _EmissionColor; alpha fades with depth behind the surface. Without a depth/opaque capture this
// keeps what shows everywhere: the surface adds _EmissionColor (modulated by the scrolling _RefractionNormal ripple) and,
// where _RefrectionOpacity > 0, blends _TintColor over what is behind. Premultiplied so both fit one blend.
function waterMaterial(entry, ctx) {
  const f = entry.f, c = entry.c;
  const em = c._EmissionColor || [0, 0, 0], tn = c._TintColor || [0, 0, 0];
  const ro = f._RefrectionOpacity || 0;
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(em[0] + tn[0] * ro, em[1] + tn[1] * ro, em[2] + tn[2] * ro, THREE.LinearSRGBColorSpace),
    transparent: true, depthWrite: false, opacity: 1,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  mat.userData.alpha = ro;
  const n = slotTexture(entry, ctx, '_RefractionNormal');
  if (!n) return mat;
  const tile = Math.max(f._NormalTile ?? 0.03, 0.01) * 30, speed = (f._RefractionSpeed ?? 0.5) * 0.1;
  mat.onBeforeCompile = sh => {
    sh.uniforms.ripple = { value: n };
    sh.uniforms.uTime = ctx.time;
    sh.uniforms.rAlpha = { value: ro };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec2 vWUv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWUv = uv;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vWUv;
uniform sampler2D ripple;
uniform float uTime;
uniform float rAlpha;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float rip = texture2D(ripple, vWUv * ${tile.toFixed(2)} + vec2(uTime * ${speed.toFixed(3)}, 0.0)).r;
diffuseColor.rgb *= 0.75 + 0.5 * rip;`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
gl_FragColor.a = rAlpha;`);
  };
  mat.customProgramCacheKey = () => 'water';
  return mat;
}

// ctx = { texBase, textures, lightmaps, time {value}, pending[] }; lm = lightmap index (Bakery) or null.
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
    mat = new THREE.MeshLambertMaterial(base(entry, ctx, { color, side: THREE.DoubleSide }));
    sway(mat, ctx, entry);
  } else if (lm != null) {
    // Baked static: albedo * 2 * lightmap texel ("double LDR"); meshbasic scales lightMap by 1/pi, so 2*pi.
    mat = new THREE.MeshBasicMaterial(base(entry, ctx, { color, lightMap: lightmapTexture(ctx, lm), lightMapIntensity: 2 * Math.PI }));
    blend(mat, entry);
    if (sh.includes('Trees')) sway(mat, ctx, entry);
  } else {
    mat = blend(new THREE.MeshLambertMaterial(base(entry, ctx, { color })), entry);
  }
  mat.name = entry.name;
  ctx.cache.set(key, mat);
  return mat;
}
