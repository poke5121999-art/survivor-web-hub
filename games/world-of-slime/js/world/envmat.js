// Vật liệu toon cho mảnh bản đồ, xấp xỉ shader MixMaster/Enviroment/{Base, Tile Blend, Transparent, Depth Water}.
// Tham số đọc từ material.extras (= map/index.json materials[id]): _Color, _HColor, _SColor, _ColorB, _HColorB,
// _SColorB, texST._BlendTex, WorldUVB, VertexColor. Mã shader gốc chưa dịch ngược (PIPELINE.md), nên:
// - Tile Blend: trộn _MainTex (UV mảnh) với _BlendTex (UV thế giới XZ * texST) theo vertex colour ALPHA.
//   A = 1 -> _BlendTex (cỏ), A = 0 -> _MainTex (vách đất). [ĐỀ XUẤT] đo trên mảnh: Cliff_t01-A_2_a_1 (mặt trên)
//   màu (0,0,0,1), Cliff_t01-A_2_b_1 mặt trên (1,1,1,1) còn vách (1,1,1,0); Water_01-A_0_b_1 bờ cũng vậy.
//   Dùng R thì mặt trên của mảnh mép ra màu atlas xám. Mảnh không có vertex colour (Path_t01-*) lấy _MainTex.
// - Ramp: half-Lambert N·L tra _Ramp (giống proto/view.html).
// - Depth Water: màu _MainTex/_Color, trong suốt một phần, gợn sáng theo thời gian [ĐỀ XUẤT].
// Chạy được với InstancedMesh (instanceMatrix) và mesh thường.
import * as THREE from 'three';
import { LIGHT_DIR } from '../config.js?v=20261022e';

const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); WHITE.needsUpdate = true;
const lin = c => new THREE.Vector4(...new THREE.Color(c[0], c[1], c[2]).convertSRGBToLinear().toArray(), c[3] ?? 1);
export const envTime = { value: 0 };
const LIGHT = { value: new THREE.Vector3(...LIGHT_DIR).normalize() };

const VS = `
#include <common>
#include <skinning_pars_vertex>
attribute vec4 _color;
uniform vec4 st; uniform vec4 stB; uniform float hasVColor, worldUV;
varying vec2 vUv; varying vec2 vUvB; varying vec3 vN; varying float vMix; varying vec3 vW;
void main() {
  vUv = uv * st.xy + st.zw;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 p = vec4(transformed, 1.0);
  vec3 n = objectNormal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 wp = modelMatrix * p;
  vN = normalize(mat3(modelMatrix) * n);
  vW = wp.xyz;
  // Unity X = -three X: toạ độ thế giới Unity (x, z) = (-wp.x, wp.z)
  vUvB = vec2(-wp.x, wp.z) * stB.xy + stB.zw;
  // keyword _WORLDUV (Tile Blend): _MainTex cũng lấy UV thế giới XZ, không lấy UV mảnh (sàn gỗ quán trọ ra trắng nếu dùng uv)
  if (worldUV > 0.5) vUv = vec2(-wp.x, wp.z) * st.xy + st.zw;
  vMix = hasVColor > 0.5 ? 1.0 - _color.a : 1.0;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FS = (mode, cutout) => `
uniform sampler2D tMain, tBlend, tRamp, tFlow, tMask; uniform float hasRamp, hasBlend, opacity, time, scroll, hasFlow, flowPow;
uniform vec4 flowST; uniform vec2 offAB;
uniform vec4 cColor, cH, cS, cColorB, cHB, cSB; uniform vec3 lightDir;
varying vec2 vUv; varying vec2 vUvB; varying vec3 vN; varying float vMix; varying vec3 vW;
void main() {
  vec4 t = texture2D(tMain, vUv);
  ${cutout ? 'if (t.a < 0.3) discard;' : ''}
  vec3 a = pow(t.rgb, vec3(2.2)) * cColor.rgb;
  vec3 hc = cH.rgb, sc = cS.rgb;
  if (hasBlend > 0.5) {
    vec3 b = pow(texture2D(tBlend, vUvB).rgb, vec3(2.2)) * cColorB.rgb;
    float m = clamp(vMix, 0.0, 1.0);
    a = mix(b, a, m); hc = mix(cHB.rgb, cH.rgb, m); sc = mix(cSB.rgb, cS.rgb, m);
  }
  ${mode === 'alpha' ? `vec4 ts = texture2D(tMain, vUv + vec2(time * scroll, time * scroll * 0.7));
  vec3 lc = cColor.rgb * (0.9 + ts.rgb * cHB.rgb * 0.6);
  if (hasFlow > 0.5) {
    // Transparent Offset Scroll (F5a): _FlowTex cuộn dọc theo _OffsetYDirectionA/B (hai lớp), vân sáng = _ColorB HDR
    // x _FlowTexPower, nền = _Color x _MainTex; _MaskTex làm nhạt vân về mép. Công thức [ĐỀ XUẤT] (shader chưa dịch ngược).
    vec2 fu = vUv * flowST.xy + flowST.zw;
    float fa = texture2D(tFlow, fu + vec2(0.0, time * offAB.x)).r, fb = texture2D(tFlow, fu * 0.8 + vec2(0.37, time * offAB.y)).r;
    float f = clamp(fa * 0.65 + fa * fb * 0.9, 0.0, 1.0) * flowPow * texture2D(tMask, vUv).r;
    lc = pow(t.rgb, vec3(2.2)) * cColor.rgb + cHB.rgb * f * 0.18;
    ts.a = 1.0;
  }
  gl_FragColor = vec4(lc, clamp(max(ts.a, 0.85) * cColor.a, 0.0, 1.0) * opacity);
  #include <colorspace_fragment>
  return;` : ''}
  ${mode === 'add' ? `gl_FragColor = vec4(pow(t.rgb, vec3(2.2)) * cColor.rgb * cColor.a, 1.0);
  #include <colorspace_fragment>
  return;` : ''}
  float l = dot(normalize(vN), lightDir) * 0.5 + 0.5;
  float r = hasRamp > 0.5 ? texture2D(tRamp, vec2(l, 0.5)).r : smoothstep(0.35, 0.6, l);
  vec3 col = a * mix(sc, hc, r) * 1.22;
  float alpha = 1.0;
  ${mode === 'water' ? `
  float w = sin(vW.x * 1.7 + time * 1.3) * sin(vW.z * 1.9 - time * 1.1);
  col = mix(col, vec3(1.0), smoothstep(0.82, 0.98, w) * 0.35);
  alpha = opacity;` : ''}
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

const cache = new Map();

// src: glTF material from GLTFLoader (userData = extras). texFor(uri) gives a texture for map/tex/<hash>.webp.
export function envMaterial(src, { hasVColor = false, skinned = false, texFor } = {}) {
  const key = src.uuid + '|' + hasVColor + '|' + skinned;
  if (cache.has(key)) return cache.get(key);
  const ex = src.userData || {}, c = ex.colors || {}, f = ex.floats || {}, T = ex.tex || {}, ST = ex.texST || {};
  const shader = ex.shader || '';
  const col = (k, d = [1, 1, 1, 1]) => lin(c[k] || d);
  const texUri = k => (typeof T[k] === 'string' && !T[k].startsWith('(')) ? T[k] : null;
  let main = src.map || (texUri('_MainTex') && texFor ? texFor(texUri('_MainTex')) : WHITE);
  if (src.map) src.map.colorSpace = THREE.NoColorSpace;
  const ramp = texUri('_Ramp') && texFor ? texFor(texUri('_Ramp'), true) : null;
  const isBlend = /Tile Blend/.test(shader) && texUri('_BlendTex');
  const blend = isBlend ? texFor(texUri('_BlendTex')) : WHITE;
  if (isBlend) blend.wrapS = blend.wrapT = THREE.RepeatWrapping;
  const water = /Water/.test(shader);
  // MixMaster/Particles/*: tia nắng cửa sổ, sóng (_SrcBlend 1 _DstBlend 1 = cộng). Không có ánh sáng.
  // _SrcBlend 5 / _DstBlend 10 (SrcAlpha, OneMinusSrcAlpha) hoặc Transparent Offset Scroll (mặt nước đài phun) = trộn alpha,
  // màu _Color (+ _ColorB sáng HDR ở vân sóng); vân trôi theo thời gian [ĐỀ XUẤT] tốc độ (_WindSpeed chưa rõ đơn vị).
  const alphaFx = /Particles\//.test(shader) && (/Offset Scroll/.test(shader) || f._DstBlend === 10);
  const add = /Particles\//.test(shader) && !alphaFx;
  const worldUV = (ex.keywords || []).includes('_WORLDUV') || f._WorldUV > 0;
  const transparent = water || /Transparent/.test(shader) || src.transparent;
  const cutout = !water && !add && !alphaFx && (transparent || src.alphaTest > 0 || f._AplhaCutout > 0);
  const stM = ST._MainTex || [1, 1, 0, 0], stB = ST._BlendTex || [1, 1, 0, 0];
  const m = new THREE.ShaderMaterial({
    uniforms: {
      tMain: { value: main }, tBlend: { value: blend }, tRamp: { value: ramp || WHITE },
      hasRamp: { value: ramp ? 1 : 0 }, hasFlow: { value: 0 }, flowPow: { value: 1 }, tFlow: { value: WHITE }, tMask: { value: WHITE },
      flowST: { value: new THREE.Vector4(1, 1, 0, 0) }, offAB: { value: new THREE.Vector2() }, hasBlend: { value: isBlend ? 1 : 0 }, hasVColor: { value: hasVColor ? 1 : 0 },
      cColor: { value: col('_Color') }, cH: { value: col('_HColor') }, cS: { value: col('_SColor', [.65, .65, .65, 1]) },
      cColorB: { value: col('_ColorB') }, cHB: { value: col('_HColorB', c._HColor || [1, 1, 1, 1]) },
      cSB: { value: col('_SColorB', c._SColor || [.65, .65, .65, 1]) },
      st: { value: new THREE.Vector4(...stM) }, stB: { value: new THREE.Vector4(...stB) },
      lightDir: LIGHT, time: envTime, opacity: { value: 0.82 }, worldUV: { value: worldUV ? 1 : 0 }, scroll: { value: /Offset Scroll/.test(shader) ? 0.05 : 0 },
    },
    vertexShader: VS, fragmentShader: FS(water ? 'water' : add ? 'add' : alphaFx ? 'alpha' : 'base', cutout),
    side: THREE.DoubleSide, transparent: water || add || alphaFx, depthWrite: !(water || add || alphaFx),
  });
  if (alphaFx) { m.uniforms.opacity.value = 1; m.uniforms.cHB.value = col('_ColorB', [1, 1, 1, 1]); }
  if (alphaFx && texUri('_FlowTex') && texFor) {
    const ft = texFor(texUri('_FlowTex')); ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    const mk = texUri('_MaskTex') ? texFor(texUri('_MaskTex')) : WHITE;
    Object.assign(m.uniforms, { tFlow: { value: ft }, tMask: { value: mk }, hasFlow: { value: 1 }, flowPow: { value: f._FlowTexPower ?? 1 },
      flowST: { value: new THREE.Vector4(...(ST._FlowTex || [1, 1, 0, 0])) }, offAB: { value: new THREE.Vector2(f._OffsetYDirectionA || 0, f._OffsetYDirectionB || 0) } });
  }
  if (add) { m.blending = THREE.AdditiveBlending; m.uniforms.cColor.value = col('_TintColor', c._Color || [1, 1, 1, 1]); }
  m.userData.kind = water ? 'water' : add ? 'add' : alphaFx ? 'alpha' : 'base';
  m.name = src.name;
  m.userData.shader = shader;
  cache.set(key, m);
  return m;
}
