/*
 * Biển: mặt nước theo camera, sóng Gerstner chép từ WaveDisplacement.Wave, màu + bọt + ánh sáng chép từ thân Water_Shader gốc.
 *
 * Sóng gốc (WaveDisplacement.cs): 4 sóng (λ, λ·2, λ·4, λ·6) với độ dốc (s, s, .75s, .5s), tốc (v, .9v, .8v, .7v),
 * hướng waveDirections; sóng có λ < 8 bị bỏ (nên sóng thứ nhất λ=6 không có). s = WaveController.Steepness
 * × clamp01(alpha mặt nạ × 10). Cùng một hàm chạy ở GPU (mặt nước, điểm câu) và CPU (thuyền nổi).
 *
 * Thân Water_Shader rã từ DXBC (tools/env.py --dis, bản _REFLECTIONS; cb0 = biến toàn cục SetGlobal*, cb3 = Water_Mat):
 *   - KHÔNG có N·L: màu = albedo × (nắng·mây + đèn phụ + ambient + (1 − WaveMask.b)), như Lit_Shader. Pháp tuyến (đỉnh) và
 *     DistortionNormal chỉ dùng để làm lệch UV khúc xạ + lấp lánh; sóng chỉ dời đỉnh. Bản web cũ chiếu sáng Phong bằng
 *     Water_Normal (texture Voronoi mặt phẳng) nên mặt nước lộ ô đa giác — đó là cái "low poly".
 *   - albedo = lerp(cb0[127], cb0[126], kS), kS = min(1, exp(−sâu/_Depth)), sâu = y mặt nước − y vật thể bên dưới (bộ đệm sâu),
 *     độ trong dùng 1 − cb0[126].w. Bảng tên cbuffer bị bỏ nên cb0[126]/[127] là màu nào phải đo bằng ảnh gốc:
 *     nước sâu ở Marrows (gog_01 tại chỗ sâu 9 m, gog_03 vùng ngoài đèn, gog_05) có tỉ lệ R:G:B của _ShallowColor × ánh sáng
 *     (gog_01 đo (65,84,91), _DeepColor tím đen không thể ra màu này); nước Twisted Strand gần camera (99,73,46) đỏ nâu như
 *     _ShallowColor của vùng (0,17; 0,11; 0,11) chứ không ô liu như _DeepColor; gog_20 thấy rõ vỏ thuyền dưới nước (độ trong cao
 *     sát vật) trong màu tím đen của _DeepColor. ⇒ cb0[127] = _ShallowColor (xa vật dưới nước), cb0[126] = _DeepColor (sát vật),
 *     độ trong = 1 − _DeepColor.a (mặc định a = 0: sát vỏ/đáy nông thấy rõ vật bên dưới; Twisted Strand, Devil's Spine a = 1: đục).
 *     V04 (clip ObBBFGMem5U; nước vịnh Marrows lúc 10:55 đo (66..78, 95..114, 106..128), điểm câu 14:40 (60, 75, 85), 07:12 (52..62, 60..73,
 *     63..74), đêm (33,33,39); web trước (134..148, 160..165, 164..169)): mọi đo đều ra màu nước ≈ 0,4× của công thức bản rã (nắng·mây + ambient +
 *     (1 − mask.b)) × albedo — bọt trắng gốc lại sáng đầy, nên chỉ phần nước tối. Chưa tìm ra số hạng DXBC nào lệch (đã thử hoán đổi cb0[126]/[127]:
 *     ra đúng clip nhưng đen ở gog_01 nước 9 m, bỏ). [ĐỀ XUẤT] hai hệ số đo thẳng: WATER_LIT = 0,65 nhân albedo nước (không nhân bọt, không nhân
 *     màu trời xa), và SEE_K = 0,15 che phần nhìn xuyên xuống đáy cát (đáy trong clip tối, đáy web sáng). Giữa vịnh ra (76..82, 113..120, 119..131) / bình minh
 *     (69..71, 91..93, 86..90) / đêm (35,43,45). HULL_FOAM_K = 3 co dải bọt chạm quanh vỏ (hộp va chạm to hơn lưới vỏ; clip chỉ có vòng gợn mảnh); gog_01 hoàng hôn vẫn trong ±15 của test/dredge-water.js (vì thế không hạ thêm). Vỏ thuyền dưới nước vẫn nhìn xuyên đủ (depSea − dep).
 *     Rồi lerp tới lerp(SkyBlue, màu sương, _FogDensity²) theo f10·(f10 + sat(mờ·(1 − dốc)(5·dốc + h))),
 *     f10 = (1 − V.y)^10, mờ = 1 − 0,004·(1 + độ sâu nhìn), h = độ dời đỉnh.
 *   - bọt: F = sat(WaveMask.r·(sat(h) + _FoamAmount)·mờ) + sọc bờ sat((sin 2π(0,2t − 100(r − EdgeFoamOffset)) − 2000(r − EdgeFoamOffset)²)·3);
 *     q = F·2·tex(xz·0,01·WaterUVTiling + t·WaterScrollSpeed); v = lerp(s1, q, q)·q + bọt chạm (1 − sat(Δsâu·0,25))^25,
 *     s1 = tex(xz·0,01·FoamUVTiling); có bọt khi v ≥ 0,2, độ phủ clamp(v; 0,5; 1). WaveMask.r = trường khoảng cách tới bờ
 *     (≈ 0,6 ở mép đất, +0,03/m, 1 từ ~15 m) — đo trong repo bằng landmask.
 *   - lấp lánh: sat(pow(sat(dot(phản xạ nắng, V)), 64)·f10 − (2·s2 + s1 + n.z))·50 × màu nắng.
 *   - trong suốt T = sat((kS − bọt)·(1 − _DeepColor.a) − f10) trộn với cảnh phía sau; phản chiếu phẳng
 *     (1 − sat((d + 5)·0,005·ReflectionDistanceFade))·sat((1 − V.y)^(ReflectionFresnelStrength·clamp(7·dốc; 0,7; 5))·ReflectionStrength);
 *     sương như Lit_Shader (drEnvFogAmount / drEnvFogColor của js/sky.js).
 * Màu (WaterController.cs:36-74, Game.unity): _ShallowColor/_DeepColor/_FoamColor/_Depth = defaultWaterProperties, trộn
 * về WaterPropertyModifier mạnh nhất tại thuyền (1 trong fullValueRadius, giảm tuyến tính tới partialValueRadius).
 * Vệt bọt sau thuyền KHÔNG nằm ở đây: bản gốc là hệ hạt BoatTrailParticles (js/vfx.js).
 * Thời tiết (WeatherController.cs:445-447): env.waveSteepness / env.foamAmount do js/sky.js lerp 15 s theo WeatherData
 * (Clear 0,05 … FinaleStorm 0,23; bọt 0,2 … 0,35) và update() ghi thẳng vào uWaveSteep / uFoam. Bản CPU của thuyền và phao
 * (boat.js, DRWater.surface) đọc cùng uWaveSteep nên bờ sóng theo thời tiết cho cả hình lẫn vật nổi.
 * Lưới: các vành vuông đồng tâm bước 1 m (tới 64 m), 2 m (128), 4 m (192), 8, 16, 32 m; gốc chốt theo bước 4 m nên mọi đỉnh trong vùng
 * có sóng (< 160 m) luôn nằm đúng trên mạng 1/2/4 m của thế giới (không nhảy hình khi camera đi); đỉnh giữa ở mép hai vành lấy trung
 * bình hai đỉnh thô kề bên (không hở mép).
 *   DRWater.init(scene, world)   DRWater.update(dt, cx, cz, boat, env)   DRWater.wave(x, z, s) → [h, dhdx, dhdz]
 *   DRWater.surface(x, z, camX, camZ, noLand) → y mặt nước nhìn thấy tại (x, z): sóng × mặt nạ × độ dốc thời tiết × độ tắt dần gần bờ / xa camera
 *   DRWater.props() → WaterProperty hiện tại (sRGB như Inspector)   DRWater.uniforms (dùng chung cho shader nằm trên mặt nước)
 */
(function (root) {
  'use strict';
  const T = root.THREE;
  const WC = root.DR_CONFIG.wave.WaveController;
  const VFX = root.DR_VFX || null;
  const WM = VFX ? VFX.waterMaterial.floats : { EdgeFoamOffset: 0.61, FoamUVTiling: 84, WaterUVTiling: 6, WaterScrollSpeed: 0.002, DistortionUVTiling: 8,
    DistortionScrollSpeed: 0.1, DistortionStrength: 0.65, ReflectionStrength: 0.5, ReflectionDistanceFade: 0.5, ReflectionFresnelStrength: 20 };
  const WCTL = VFX ? VFX.waterController : { default: { waterDepth: 1, foamColor: [0.6824, 0.7412, 0.7647, 1], shallowColor: [0.3255, 0.4745, 0.5294, 0.349], deepColor: [0.0902, 0.0863, 0.1333, 0] }, modifiers: [] };
  const DEPTH_M = root.DR_CONFIG.depthModifier || 100;
  const SPEED = 0.1; // WaveController.speed: hằng private trong mã, không serialize
  // [λ, hệ số dốc, hệ số tốc, chỉ số hướng]
  const WAVES = [[1, 1, 1, 0], [2, 1, 0.9, 1], [4, 0.75, 0.8, 2], [6, 0.5, 0.7, 3]]
    .map(([lm, sm, vm, di]) => ({ len: WC.wavelength * lm, sm, speed: SPEED * vm, di }))
    .filter(w => w.len >= 8);
  // Hướng Unity (cos πd', sin πd') trên mặt xz; three.js đổi dấu z.
  for (const w of WAVES) {
    const a = Math.PI * (WC.waveDirections[w.di] * 2 - 1);
    w.dx = Math.cos(a); w.dz = -Math.sin(a);
    w.k = Math.PI * 2 / w.len;
  }
  const SEE_K = 0.15, WATER_LIT = 0.65, HULL_FOAM_K = 3; // [ĐỀ XUẤT] V04, xem chú thích đầu tệp
  const SEABED_MAX = 100; // m; texture sâu đáy mã hoá sqrt(sâu/100): đáy địa hình sâu tới 100 m, Stellar Basin có _Depth 12 m

  const uniforms = {
    uGameTime: { value: 0 },
    uWaveSteep: { value: WC.steepness },
    uMask: { value: null },
    uLand: { value: null },
    uLandBox: { value: new T.Vector4(0, 0, 1, 1) }, // x0, z0, 1/w, 1/h (m)
    uNight: { value: 0 },
    uFoam: { value: 0.2 }, // _FoamAmount (WeatherController.cs:447), Fine.foamAmount
    uSeeK: { value: SEE_K }, uHullFoamK: { value: HULL_FOAM_K }, uWaterLit: { value: WATER_LIT }, uShallow: { value: new T.Color() }, uShallowA: { value: 0.35 }, uDeep: { value: new T.Color() }, uDeepA: { value: 0 },
    uFoamCol: { value: new T.Color() }, uWaterDepth: { value: 1 },
    uSky: { value: new T.Color() }, uNormalTex: { value: null }, uFoamTex: { value: null },
    uSeabed: { value: null }, uSeabedBox: { value: new T.Vector4(0, 0, 1, 1) },
    uHull: { value: new T.Vector4(0, 0, 1, 0) }, uHullSize: { value: new T.Vector3(0, 0, -1) }
  };

  const GLSL_WAVE = `
uniform float uGameTime;
uniform float uWaveSteep;
uniform sampler2D uMask;
uniform sampler2D uLand;
uniform vec4 uLandBox;
float drSteepAt(vec2 xz) {
  vec2 uv = (xz + 750.0) / 1500.0;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return clamp(texture2D(uMask, uv).a * 10.0, 0.0, 1.0);
}
float drDepthAt(vec2 xz) {
  vec2 uv = (xz + 750.0) / 1500.0;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return texture2D(uMask, uv).g;
}
// metres to the nearest solid pixel of landmask (0..64)
float drLandDist(vec2 xz) {
  vec2 uv = (xz - uLandBox.xy) * uLandBox.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 64.0;
  return texture2D(uLand, uv).r * 64.0;
}
vec3 drWave(vec2 xz, float s) {
  vec3 r = vec3(0.0);
${WAVES.map(w => `  { float f = ${w.k.toFixed(6)} * (dot(vec2(${w.dx.toFixed(6)}, ${w.dz.toFixed(6)}), xz) - uGameTime * ${(w.speed * w.len).toFixed(6)});
    float a = s * ${w.sm.toFixed(3)};
    r += vec3(a / ${w.k.toFixed(6)} * sin(f), a * cos(f) * ${w.dx.toFixed(6)}, a * cos(f) * ${w.dz.toFixed(6)}); }`).join('\n')}
  return r;
}
`;

  // Bản CPU: cùng công thức, s đã nhân mặt nạ.
  function wave(x, z, s, t) {
    t = t == null ? uniforms.uGameTime.value : t;
    let h = 0, gx = 0, gz = 0;
    for (const w of WAVES) {
      const f = w.k * (w.dx * x + w.dz * z - t * w.speed * w.len), a = s * w.sm, c = Math.cos(f);
      h += a / w.k * Math.sin(f); gx += a * c * w.dx; gz += a * c * w.dz;
    }
    return [h, gx, gz];
  }

  let mesh = null, world = null;

  // Vành vuông đồng tâm [bước m, nửa cạnh m]. Nửa cạnh chia hết cho 2·bước nên góc vành và đỉnh mép trong của vành sau trùng đỉnh
  // của vành trước; đỉnh lẻ ở mép ngoài một vành (không có ở vành sau) mang aMorph = ± nửa cạnh ô theo mép, shader cho nó nằm giữa
  // hai đỉnh thô. [ĐỀ XUẤT] bước 1 m sát camera (sóng ngắn nhất λ = 12 m ⇒ ≥ 12 đỉnh mỗi bước sóng), 2 m tới 128 m, 4 m tới 192 m
  // (sóng tắt hẳn ở 160 m); xa hơn mặt phẳng nên bước thô bao nhiêu cũng được.
  const RINGS = [[1, 64], [2, 128], [4, 192], [8, 384], [16, 768], [32, 1408]];
  const SNAP = 4; // bước chốt gốc lưới = bước lớn nhất trong vùng có sóng
  function waterGeometry() {
    const pos = [], morph = [], idx = [], ids = new Map();
    const vid = (x, z) => {
      const k = x + ',' + z;
      let i = ids.get(k);
      if (i === undefined) { i = pos.length / 3; ids.set(k, i); pos.push(x, 0, z); morph.push(0, 0); }
      return i;
    };
    let inner = 0;
    RINGS.forEach(([s, h], li) => {
      for (let z = -h; z < h; z += s) for (let x = -h; x < h; x += s) {
        if (x >= -inner && x + s <= inner && z >= -inner && z + s <= inner) continue;
        const a = vid(x, z), b = vid(x + s, z), c = vid(x, z + s), d = vid(x + s, z + s);
        idx.push(a, c, b, b, c, d);
      }
      if (li < RINGS.length - 1) {
        // đỉnh lẻ trên mép ngoài: nằm giữa hai đỉnh của vành thô kế tiếp
        for (let t = -h + s; t < h; t += 2 * s) {
          for (const sg of [-1, 1]) {
            const i1 = ids.get((sg * h) + ',' + t), i2 = ids.get(t + ',' + (sg * h));
            if (i1 !== undefined) { morph[i1 * 2] = 0; morph[i1 * 2 + 1] = s; }
            if (i2 !== undefined) { morph[i2 * 2] = s; morph[i2 * 2 + 1] = 0; }
          }
        }
      }
      inner = h;
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aMorph', new T.BufferAttribute(new Float32Array(morph), 2));
    g.setIndex(pos.length / 3 > 65535 ? new T.BufferAttribute(new Uint32Array(idx), 1) : idx);
    g.boundingSphere = new T.Sphere(new T.Vector3(), RINGS[RINGS.length - 1][1] * 1.5);
    return g;
  }

  const f6 = x => Number(x).toFixed(6);
  const VERT = `
#include <common>
${GLSL_WAVE}
attribute vec2 aMorph;
varying vec3 vWPos;
varying float vH;
varying float vViewZ;
#include <fog_pars_vertex>
// y mặt nước vẽ ra: bờ nông tắt sóng (đáy cao nhất y = −0,2 m) và xa camera tắt dời đỉnh — cùng số với DRWater.surface()
float drHeightAt(vec2 xz) {
  float fadeV = smoothstep(0.5, 6.0, drLandDist(xz)) * (1.0 - smoothstep(70.0, 160.0, distance(xz, cameraPosition.xz)));
  return drWave(xz, drSteepAt(xz) * uWaveSteep * fadeV).x;
}
void main() {
  vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
  float hy = drHeightAt(wp0.xz);
  if (aMorph.x != 0.0 || aMorph.y != 0.0) hy = 0.5 * (drHeightAt(wp0.xz - aMorph) + drHeightAt(wp0.xz + aMorph));
  vec3 wp = wp0 + vec3(0.0, hy, 0.0);
  vWPos = wp; vH = hy;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  vViewZ = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

  const FRAG = `
#include <common>
${GLSL_WAVE}
uniform float uFoam;
uniform float uSeeK; uniform float uWaterLit; uniform float uHullFoamK; uniform vec3 uShallow; uniform float uShallowA; uniform vec3 uDeep; uniform float uDeepA; uniform vec3 uFoamCol; uniform float uWaterDepth;
uniform vec3 uSky; uniform sampler2D uNormalTex; uniform sampler2D uFoamTex;
uniform sampler2D uSeabed; uniform vec4 uSeabedBox; uniform vec4 uHull; uniform vec3 uHullSize;
varying vec3 vWPos;
varying float vH;
varying float vViewZ;
#include <fog_pars_fragment>
// độ sâu đáy biển (m, dương) dưới (x, z): lưới đáy của js/world.js (y ≤ −0,35), ngoài địa hình coi như rất sâu
float drSeabedDepth(vec2 xz) {
  vec2 uv = (xz - uSeabedBox.xy) * uSeabedBox.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1000.0;
  float e = texture2D(uSeabed, uv).r;
  return e * e * ${f6(SEABED_MAX)};
}
void main() {
  vec3 wp = vWPos;
  vec3 V = normalize(cameraPosition - wp);
  vec2 uxz = vec2(wp.x, -wp.z);                       // toạ độ xz của Unity (texture lấy mẫu theo thế giới gốc)
  vec2 muv = (wp.xz + 750.0) / 1500.0;
  vec4 mk = (muv.x < 0.0 || muv.y < 0.0 || muv.x > 1.0 || muv.y > 1.0) ? vec4(1.0) : min(texture2D(uMask, muv), vec4(1.0));
  float steep = uWaveSteep;
  // [ĐỀ XUẤT] không có bộ đệm sâu của cảnh: "vật bên dưới" = đáy biển (lưới đáy) hoặc đáy vỏ thuyền (hộp va chạm bo góc,
  // đáy = điểm thấp nhất của thân thuyền); ngoài mép vỏ độ sâu tăng 4 m mỗi m để quầng sáng chỉ ôm sát vỏ như ảnh gốc
  float dep = max(0.0, wp.y + drSeabedDepth(wp.xz));
  float depSea = dep;
  float hullD = 1000.0;
  if (uHullSize.x > 0.0) {
    vec2 d = wp.xz - uHull.xy;
    vec2 l = vec2(uHull.z * d.x - uHull.w * d.y, uHull.w * d.x + uHull.z * d.y);
    float rr = uHullSize.x * 0.6;
    vec2 q = abs(l) - (uHullSize.xy - rr);
    hullD = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr;
    dep = min(dep, max(0.0, wp.y - uHullSize.z) + max(hullD, 0.0) * 4.0);
  }
  float kS = min(1.0, exp(-dep / max(0.01, uWaterDepth)));
  vec3 col = mix(uShallow, uDeep, kS) * uWaterLit; // uWaterLit: xem chú thích V04 đầu tệp

  float f10 = pow(1.0 - clamp(V.y, 0.0, 1.0), 10.0);
  float fadeD = 1.0 - 0.004 * (1.0 + vViewZ);
  float h = vH;
  vec3 skyC = mix(uSky, fogColor, uDrFogD * uDrFogD);
  col = mix(col, skyC, min(1.0, f10 * (f10 + clamp((1.0 - steep) * (5.0 * steep + h) * fadeD, 0.0, 1.0))));

  // bọt
  // StylisedWater_Tex và Water_Normal nhập dạng sRGB (sRGBTexture 1): shader gốc nhận giá trị đã đổi sang tuyến tính
  float s1 = drS2L(texture2D(uFoamTex, uxz * ${f6(WM.FoamUVTiling * 0.01)}).r);
  float s2 = drS2L(texture2D(uFoamTex, uxz * ${f6(WM.WaterUVTiling * 0.01)} + uGameTime * ${f6(WM.WaterScrollSpeed)}).r);
  float F = clamp(mk.r * (clamp(h, 0.0, 1.0) + uFoam) * fadeD, 0.0, 1.0);
  float dR = mk.r - ${f6(WM.EdgeFoamOffset)};
  F += clamp((sin(6.283186 * (uGameTime * 0.2 - dR * 100.0)) - dR * dR * 2000.0) * 3.0, 0.0, 1.0);
  // [ĐỀ XUẤT] bọt chạm (gốc: chênh độ sâu cảnh − mặt nước dọc tia nhìn): tia xuống gặp đáy sau sâu/V.y, đi ngang gặp vỏ thuyền sau
  // khoảng cách/√(1 − V.y²). Không dùng landmask: hộp va chạm của đá to hơn lưới đá nên bọt chạm theo nó trắng loang ngoài đá
  float vh = max(sqrt(max(0.0, 1.0 - V.y * V.y)), 0.05);
  float dd = min(dep / max(V.y, 0.05), max(hullD, 0.0) * uHullFoamK / vh);
  float q = F * 2.0 * s2;
  float v = mix(s1, q, q) * q + pow(1.0 - clamp(dd * 0.25, 0.0, 1.0), 25.0);
  float foamA = step(0.2, clamp(v, 0.0, 1.0)) * clamp(v, 0.5, 1.0);
  col = mix(col, uFoamCol, foamA);

  // ánh sáng toon (không N·L) như Lit_Shader; mây che nắng không tối quá 0,25
  vec3 Ls = drEnvLights(wp);
  float mb = drEnvMaskB(wp.xz);
  col *= uDrSunCol * max(0.25, drEnvCloud(wp)) + Ls + uDrAmb + (1.0 - mb) + vec3(uDrTintK, 0.0, 0.0);
  // lấp lánh: phản xạ nắng trên mặt phẳng, chỉ lọt qua lỗ của texture bọt và ô Voronoi nghiêng của DistortionNormal
  vec2 nn = drS2L(texture2D(uNormalTex, uxz * ${f6(WM.DistortionUVTiling * 0.01)} + uGameTime * ${f6(WM.DistortionScrollSpeed)}).rgb).rg * 2.0 - 1.0;
  float nz = sqrt(1.0 - min(dot(nn, nn), 1.0));
  vec3 Lr = vec3(-uDrSunDir.x, uDrSunDir.y, -uDrSunDir.z);
  col += uDrSunCol * clamp(pow(clamp(dot(Lr, V), 0.0, 1.0), 64.0) * f10 - (2.0 * s2 + s1 + nz), 0.0, 1.0) * 50.0;

  float Tr = clamp((kS - foamA) * (1.0 - uDeepA) - f10, 0.0, 1.0);
  // phản chiếu phẳng: [ĐỀ XUẤT] không vẽ cảnh lật; gần chân trời ảnh lật là trời = màu sương + quầng nắng (như Sky_Shader)
  float camD = distance(wp, cameraPosition);
  float wR = (1.0 - clamp((camD + 5.0) * ${f6(0.005 * WM.ReflectionDistanceFade)}, 0.0, 1.0))
    * clamp(pow(1.0 - clamp(V.y, 0.0, 1.0), ${f6(WM.ReflectionFresnelStrength)} * clamp(7.0 * steep, 0.7, 5.0)) * ${f6(WM.ReflectionStrength)}, 0.0, 1.0);
  vec3 rd = vec3(-V.x, V.y, -V.z);
  float g = clamp(dot(rd, uDrSunDir), 0.0, 1.0);
  g = g * g * max(0.0, 1.0 - abs(uDrSunDir.y) + min(2.0 * uDrSunDir.y, 0.0));
  vec3 Rf = mix(fogColor, mix(fogColor, vec3(${E_GLOW()}), 0.5), g);

  float fog = clamp(drEnvFogAmount(wp, Ls, mb), 0.0, 1.0);
  vec3 fogC = drEnvFogColor(wp);
  // trộn kiểu nhân sẵn alpha: phần còn lại (Tr) là cảnh phía sau mặt nước (đáy, vỏ thuyền dưới nước)
  float tS = (1.0 - fog) * (1.0 - wR) * Tr * mix(uSeeK, 1.0, clamp((depSea - dep) * 2.0, 0.0, 1.0)); // đáy biển nhìn xuyên ×uSeeK, vỏ thuyền thì nguyên (V04)
  vec3 rgb = (1.0 - fog) * ((1.0 - wR) * (1.0 - Tr) * col + wR * Rf) + fog * fogC;
  gl_FragColor = vec4(rgb, 1.0 - tS);
  #include <encodings_fragment>
}`;
  function E_GLOW() {
    const g = root.DR_ENV && root.DR_ENV.fogShader && root.DR_ENV.fogShader.glow || [0.752941, 0.235294, 0];
    return g.map(f6).join(', ');
  }

  function waterMaterial() {
    const m = new T.ShaderMaterial({
      uniforms: Object.assign({ fogColor: { value: new T.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 }, fogDensity: { value: 0 } }, uniforms),
      vertexShader: VERT, fragmentShader: FRAG,
      fog: true, transparent: true, depthWrite: true, premultipliedAlpha: true
    });
    m.defines = { DR_OWN_FOG: '' };
    return m;
  }

  // ---- WaterController: thuộc tính nước tại thuyền ----
  const cur = { waterDepth: 1, foamColor: [1, 1, 1, 1], shallowColor: [0, 0, 0, 0], deepColor: [0, 0, 0, 0], modifier: null, k: 0 };
  function props() { return cur; }
  function updateProps(x, z) {
    const D = WCTL.default;
    let best = null, bk = 0;
    for (const m of WCTL.modifiers) {
      if (!m.enabled) continue;
      // GetProportionStrengthForPoint: Vector3.Distance (y của mặt nước ≈ y bộ điều chỉnh 0)
      const d = Math.hypot(x - m.pos[0], z - m.pos[2]);
      const k = d > m.partialValueRadius ? 0 : d < m.fullValueRadius ? 1 : 1 - (d - m.fullValueRadius) / (m.partialValueRadius - m.fullValueRadius);
      if (k > bk) { bk = k; best = m; }
    }
    const L = (a, b2) => a + (b2 - a) * bk, LC = (a, b2) => a.map((v, i) => L(v, b2[i]));
    const P = best || D;
    cur.waterDepth = L(D.waterDepth, P.waterDepth);
    cur.foamColor = LC(D.foamColor, P.foamColor); cur.shallowColor = LC(D.shallowColor, P.shallowColor); cur.deepColor = LC(D.deepColor, P.deepColor);
    cur.modifier = best ? best.name : null; cur.k = bk;
    // màu Inspector là sRGB; three.js tô trong không gian tuyến tính
    uniforms.uShallow.value.setRGB(cur.shallowColor[0], cur.shallowColor[1], cur.shallowColor[2]).convertSRGBToLinear();
    uniforms.uShallowA.value = cur.shallowColor[3]; uniforms.uDeepA.value = cur.deepColor[3];
    uniforms.uDeep.value.setRGB(cur.deepColor[0], cur.deepColor[1], cur.deepColor[2]).convertSRGBToLinear();
    uniforms.uFoamCol.value.setRGB(cur.foamColor[0], cur.foamColor[1], cur.foamColor[2]).convertSRGBToLinear();
    uniforms.uWaterDepth.value = cur.waterDepth;
  }

  function loadTex(key, linear) {
    const d = VFX && VFX.textures[key];
    const t = d ? new T.TextureLoader().load(d.src) : new T.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (!d) t.needsUpdate = true;
    if (!linear) t.encoding = T.LinearEncoding;
    return t;
  }

  // Độ sâu đáy từ chính lưới đáy biển js/world.js vẽ (PlaneGeometry gw × gh, y = min(địa hình, −0,35)), mã hoá sqrt(sâu/100) vào R8
  function seabedTexture(w) {
    const sb = w.seabed, Tm = w.data && w.data.world && w.data.world.terrain;
    if (!sb || !Tm) return null;
    const P = sb.geometry.attributes.position, n = P.count, gw = Math.round(Math.sqrt(n));
    if (gw * gw !== n) return null;
    const px = new Uint8Array(n);
    for (let i = 0; i < n; i++) px[i] = Math.min(255, Math.round(Math.sqrt(Math.min(SEABED_MAX, Math.max(0, -P.getY(i))) / SEABED_MAX) * 255));
    const t = new T.DataTexture(px, gw, gw, T.RedFormat, T.UnsignedByteType);
    t.minFilter = T.LinearFilter; t.magFilter = T.LinearFilter; t.unpackAlignment = 1; t.needsUpdate = true;
    // tâm texel (q, r) ở x0 + q·sizeX/(gw − 1): uv = (x − x0)/sizeX·(gw − 1)/gw + 0,5/gw
    const kx = (gw - 1) / gw / Tm.sizeX, kz = (gw - 1) / gw / Tm.sizeZ;
    uniforms.uSeabedBox.value.set(Tm.x0 - 0.5 / gw / kx, Tm.z0 - 0.5 / gw / kz, kx, kz);
    return t;
  }

  function init(scene, w) {
    world = w;
    uniforms.uMask.value = w.maskTex;
    uniforms.uLand.value = w.landTex;
    const L = w.landBox;
    uniforms.uLandBox.value.set(L.x0, L.z0, 1 / L.w, 1 / L.h);
    uniforms.uNormalTex.value = loadTex('waterNormal');
    uniforms.uFoamTex.value = loadTex('waterTexture');
    let sb = seabedTexture(w);
    if (!sb) { sb = new T.DataTexture(new Uint8Array([255]), 1, 1, T.RedFormat); sb.needsUpdate = true; }
    uniforms.uSeabed.value = sb;
    const sky = VFX ? VFX.waterMaterial.colors.SkyBlue : [0.3176, 0.4196, 0.4824];
    uniforms.uSky.value.setRGB(sky[0], sky[1], sky[2]).convertSRGBToLinear();
    updateProps(10, -10);
    mesh = new T.Mesh(waterGeometry(), waterMaterial());
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    mesh.name = 'water';
    scene.add(mesh);
  }

  // y của mặt nước vẽ ra tại (x, z) — bản CPU của drHeightAt() trong shader đỉnh: s = mặt nạ·10 (kẹp) × uWaveSteep, tắt dần
  // gần bờ (smoothstep 0,5–6 m tới đất) và xa camera (70–160 m). Dùng cho vật nổi tĩnh (phao, thuyền bến) bám đúng mặt nước.
  // noLand: bỏ độ tắt dần gần bờ — dùng cho vật tự có collider trong landmask (phao, thuyền bến): ở chính nó khoảng cách tới đất luôn ≈ 0
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function surface(x, z, camX, camZ, noLand) {
    const W = root.DRWorld;
    const steep = Math.min(1, Math.max(0, W.steep01(x, z) * 10)) * uniforms.uWaveSteep.value;
    const land = noLand ? 64 : Math.min(64, Math.max(0, W.sdf(x, z)));
    const fade = sstep(0.5, 6, land) * (1 - sstep(70, 160, Math.hypot(x - camX, z - camZ)));
    return wave(x, z, steep * fade)[0];
  }

  // vỏ thuyền dưới nước cho quầng nông quanh thân: hộp va chạm (DRBoat.half) + đáy thấp nhất của mô hình, đo lại khi đổi thân
  const _box = new T.Box3();
  let hullModel = null, hullBottom = -1;
  function updateHull() {
    const B = root.DRBoat, r = B && B.root, H = uniforms.uHullSize.value;
    if (!r || !B.model || !B.half || !(root.DR && root.DR.s) || root.DR.mode === 'title') { H.x = 0; return; }
    if (hullModel !== B.model) {
      hullModel = B.model;
      r.updateMatrixWorld(true);
      _box.setFromObject(B.model);
      hullBottom = _box.isEmpty() ? -1 : _box.min.y - r.position.y;
    }
    const y = r.rotation.y;
    uniforms.uHull.value.set(r.position.x, r.position.z, Math.cos(y), Math.sin(y));
    H.set(B.half[0], B.half[1], r.position.y + hullBottom);
  }

  let propT = 0;
  function update(dt, cx, cz, boat, env) {
    // mặt nước bám camera, chốt theo bước 4 m: mọi đỉnh trong vùng có sóng luôn nằm trên mạng 1/2/4 m của thế giới
    mesh.position.set(Math.round(cx / SNAP) * SNAP, 0, Math.round(cz / SNAP) * SNAP);
    uniforms.uNight.value = env.night;
    // WeatherController.cs:445-447: _WaveSteepness (cũng là WaveController.Steepness của thuyền) và _FoamAmount của thời tiết hiện tại
    if (env.waveSteepness != null) uniforms.uWaveSteep.value = env.waveSteepness;
    if (env.foamAmount != null) uniforms.uFoam.value = env.foamAmount;
    updateHull();
    propT -= dt;
    if (propT <= 0 || !boat) { propT = 0.1; updateProps(boat ? boat.x : cx, boat ? boat.z : cz); }
  }
  function syncFog() { /* vệt cũ đã bỏ; giữ hàm cho nơi gọi cũ */ }

  root.DRWater = { init, update, wave, surface, syncFog, props, uniforms, GLSL_WAVE, WAVES, RINGS, get mesh() { return mesh; } };
})(window);
