// Xấp xỉ shader "MixMaster/Unit/Unit Matcap wip" (slime, NPC, người chơi). Chép từ D:\wos-ref\proof\slime\sheet.html
// (đã kiểm bằng ảnh sheet_final.png): ramp toon + spec/rim A/B theo mask + atlas decal mặt 3x3 theo trọng số clip +
// emission + viền vỏ lộn (inverted hull) dày theo vertex colour B. Màu viền là đoán (albedo * _OutlineColor * 0.3).
import * as THREE from 'three';
import { loadTex } from '../assets.js?v=20261022e';
import { LIGHT_DIR } from '../config.js?v=20261022e';

const LIGHT = { value: new THREE.Vector3(...LIGHT_DIR).normalize() };
const lin = c => new THREE.Vector4(...new THREE.Color(c[0], c[1], c[2]).convertSRGBToLinear().toArray(), c[3]);
const ramp = url => loadTex(url || 'slime/shared/TCP2_Ramp_cartoon_intense.webp', { nearest: true });

const VS = `
#include <common>
#include <skinning_pars_vertex>
attribute vec4 color;
uniform float uOutline; uniform float hasColor;
varying vec2 vUv; varying vec2 vUv1; varying vec3 vN; varying vec3 vV; varying vec4 vCol;
void main() {
  #include <skinbase_vertex>
  vec3 objectNormal = normal;
  #include <skinnormal_vertex>
  vec3 transformed = position;
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
  float ob = hasColor > 0.5 ? color.b : 1.0;
  wp.xyz += wn * uOutline * ob;
  vUv = uv;
  #ifdef USE_UV1
  vUv1 = uv1;
  #else
  vUv1 = uv;
  #endif
  vN = wn; vV = cameraPosition - wp.xyz; vCol = color;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FS = `
uniform sampler2D tAlbedo, tMask, tDecal, tEmission, tRamp, tSkin;
uniform float hasAlbedo, hasMask, hasDecal, hasEmission, hasSkin, isOutline, decalOnUv1;
uniform vec4 cColor, cH, cS, cOutline, cEmission, cRimA, cRimB, cSpecA, cSpecB;
uniform float emissionPower, rimMinA, rimMaxA, rimStrA, rimMinB, rimMaxB, rimStrB;
uniform float specSizeA, specSmoothA, specSizeB, specSmoothB, useRim, useSpec;
uniform float decalW[10]; uniform float decalView; uniform vec4 decalST; uniform vec2 skinCell; uniform vec4 tint;
uniform vec3 lightDir;
varying vec2 vUv; varying vec2 vUv1; varying vec3 vN; varying vec3 vV; varying vec4 vCol;
vec2 cell(float i) { float k = i - 1.0; return (vUv1 + vec2(mod(k, 3.0), floor(k / 3.0))) / 3.0; }
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  vec4 alb = hasAlbedo > 0.5 ? texture2D(tAlbedo, vUv) : vec4(1.0);
  vec3 base = toLinear(alb.rgb) * cColor.rgb;
  if (hasSkin > 0.5) { vec3 sk = toLinear(texture2D(tSkin, (fract(vUv) + skinCell) / 4.0).rgb); base = hasAlbedo > 0.5 ? mix(sk, base, alb.a) : sk; }
  base *= tint.rgb;
  if (hasDecal > 0.5) {
    vec4 d;
    if (decalOnUv1 > 0.5) {
      vec4 dd = texture2D(tDecal, cell(decalView));
      float wsum = 0.0;
      for (int i = 1; i <= 9; i++) wsum += decalW[i];
      if (wsum > 0.001) { vec4 acc = dd * max(0.0, 1.0 - wsum); for (int i = 1; i <= 9; i++) if (decalW[i] > 0.0) acc += texture2D(tDecal, cell(float(i))) * decalW[i]; dd = acc; }
      d = dd;
    } else {
      d = texture2D(tDecal, vUv1 * decalST.xy + decalST.zw);
    }
    base = mix(base, toLinear(d.rgb), d.a);
  }
  if (isOutline > 0.5) {
    gl_FragColor = vec4(base * cOutline.rgb * 0.3, 1.0);
    #include <colorspace_fragment>
    return;
  }
  vec3 N = normalize(vN); vec3 V = normalize(vV); vec3 L = normalize(lightDir);
  float r = texture2D(tRamp, vec2(dot(N, L) * 0.5 + 0.5, 0.5)).r;
  vec3 col = base * mix(cS.rgb, cH.rgb, r) * 1.35;
  vec4 m = hasMask > 0.5 ? texture2D(tMask, vUv) : vec4(0.0, 1.0, 0.0, 1.0);
  if (useSpec > 0.5) { vec3 Hh = normalize(L + V); float nh = max(dot(N, Hh), 0.0);
    float sA = smoothstep(1.0 - specSizeA - specSmoothA, 1.0 - specSizeA + specSmoothA, nh);
    float sB = smoothstep(1.0 - specSizeB - specSmoothB, 1.0 - specSizeB + specSmoothB, nh);
    col += m.r * mix(sB * cSpecB.rgb, sA * cSpecA.rgb, m.g); }
  if (useRim > 0.5) { float fr = 1.0 - max(dot(N, V), 0.0);
    float rA = smoothstep(rimMinA, rimMaxA, fr) * rimStrA, rB = smoothstep(rimMinB, rimMaxB, fr) * rimStrB;
    col += m.r * mix(rB * cRimB.rgb * cRimB.a, rA * cRimA.rgb * cRimA.a, m.g); }
  if (hasEmission > 0.5) col += toLinear(texture2D(tEmission, vUv).rgb) * cEmission.rgb * emissionPower * 0.35;
  gl_FragColor = vec4(col, alb.a < 0.3 && hasAlbedo > 0.5 && hasSkin < 0.5 ? alb.a : 1.0);
  #include <colorspace_fragment>
}`;
const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); BLACK.needsUpdate = true;

export function unitMaterial(ex, texs, outline, opts = {}) {
  const f = ex.floats || {}, c = ex.colors || {}, col = (k, d = [1, 1, 1, 1]) => lin(c[k] || d);
  const u = {
    tAlbedo: { value: texs.albedo || BLACK }, tMask: { value: texs.mask || BLACK }, tDecal: { value: texs.decal || BLACK },
    tEmission: { value: texs.emission || BLACK }, tSkin: { value: texs.skin || BLACK }, tRamp: { value: ramp((ex.shared || {})._Ramp) },
    hasAlbedo: { value: texs.albedo ? 1 : 0 }, hasSkin: { value: texs.skin ? 1 : 0 },
    hasMask: { value: texs.mask ? 1 : 0 }, hasDecal: { value: texs.decal && opts.decal !== false ? 1 : 0 },
    hasEmission: { value: texs.emission && f._UseEmission ? 1 : 0 }, decalOnUv1: { value: opts.decalST ? 0 : 1 },
    decalST: { value: new THREE.Vector4(...(opts.decalST || [1, 1, 0, 0])) },
    skinCell: { value: new THREE.Vector2(((opts.skinNum || 1) - 1) % 4, Math.floor(((opts.skinNum || 1) - 1) / 4)) },
    tint: { value: opts.tint ? lin(opts.tint) : new THREE.Vector4(1, 1, 1, 1) },
    isOutline: { value: outline ? 1 : 0 }, uOutline: { value: outline ? 0.009 : 0 }, hasColor: { value: opts.hasColor ? 1 : 0 },
    cColor: { value: col('_Color') }, cH: { value: col('_HColor', [.72, .72, .72, 1]) }, cS: { value: col('_SColor', [.62, .6, .62, 1]) },
    cOutline: { value: col('_OutlineColor', [.8, .8, .8, 1]) }, cEmission: { value: new THREE.Vector4(...(c._EmissionColor || [0, 0, 0, 1])) },
    cRimA: { value: col('_RimColor') }, cRimB: { value: col('_RimColorB') }, cSpecA: { value: col('_SpecularColor') }, cSpecB: { value: col('_SpecularColorB') },
    emissionPower: { value: f._EmissionPower || 0 },
    rimMinA: { value: f._RimMin ?? .5 }, rimMaxA: { value: f._RimMax ?? .7 }, rimStrA: { value: f._RimStrength ?? 0 },
    rimMinB: { value: f._RimMinB ?? .5 }, rimMaxB: { value: f._RimMaxB ?? .7 }, rimStrB: { value: f._RimStrengthB ?? 0 },
    specSizeA: { value: f._SpecularToonSize ?? .03 }, specSmoothA: { value: f._SpecularToonSmoothness ?? .01 },
    specSizeB: { value: f._SpecularToonSizeB ?? .03 }, specSmoothB: { value: f._SpecularToonSmoothnessB ?? .01 },
    useRim: { value: f._UseRim || 0 }, useSpec: { value: f._UseSpecular || 0 },
    decalW: { value: new Array(10).fill(0) }, decalView: { value: f._DecalView || 1 }, lightDir: LIGHT,
  };
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, side: outline ? THREE.BackSide : THREE.FrontSide });
}

// Thay vật liệu glTF bằng toon; trả danh sách uniform decalW để cập nhật mặt theo clip.
export async function applyUnitMaterials(g, root, opts = {}) {
  const decals = [];
  const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const src = mesh.material, ex = src.userData || {}, texs = {};
    for (const [role, idx] of Object.entries(ex.tex || {})) {
      const t = await g.parser.getDependency('texture', idx); t.colorSpace = THREE.NoColorSpace; texs[role] = t;
    }
    const o2 = { ...opts, hasColor: !!mesh.geometry.attributes.color };
    if (opts.hairColor && /Hair/.test(src.name)) o2.tint = opts.hairColor;
    const mat = unitMaterial(ex, texs, false, o2);
    decals.push(mat.uniforms.decalW);
    mesh.material = mat; mesh.frustumCulled = false;
    if (mesh.isSkinnedMesh && opts.outline !== false) {
      const hull = new THREE.SkinnedMesh(mesh.geometry, unitMaterial(ex, texs, true, o2));
      hull.bind(mesh.skeleton, mesh.bindMatrix); hull.frustumCulled = false; mesh.parent.add(hull);
      decals.push(hull.material.uniforms.decalW);
    }
  }
  return decals;
}

// Trọng số decal mặt tại thời điểm t của clip (extras.decalWeights).
export function decalAt(ex, t) {
  const w = new Array(10).fill(0), d = ex && ex.decalWeights; if (!d) return w;
  const T = d.times; let k = 0; while (k < T.length - 2 && T[k + 1] <= t) k++;
  const f = Math.min(1, Math.max(0, (t - T[k]) / ((T[k + 1] - T[k]) || 1)));
  for (let i = 1; i <= 9; i++) if (d[i]) w[i] = d[i][k] * (1 - f) + d[i][Math.min(k + 1, T.length - 1)] * f;
  return w;
}
